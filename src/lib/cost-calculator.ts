import { formatDate, formatNumber } from './format';
import {
  batchMultiplier,
  cacheTtlOptions,
  formatTtl,
  unitPricesFor,
  type CacheTtlOption,
  type CatalogModel,
  type UnitPrices,
} from './pricing';

/**
 * Lógica pura de la calculadora de coste por tarea. Sin DOM, sin React y sin `astro:content`.
 * Todos los precios salen del `PricingCatalog` (dólares por millón de tokens); aquí no hay ninguno.
 *
 * Modelo de cálculo (las decisiones están justificadas en el informe del componente):
 *
 * - Una tarea tiene `turns` peticiones. La petición k envía `N_k = I + (k - 1) × crecimiento` tokens,
 *   donde `I` es la entrada del primer turno y `crecimiento = salida + [razonamiento] + historyGrowth`:
 *   la salida visible del turno anterior se reenvía siempre; el razonamiento anterior, solo si
 *   `reasoningInHistory`; `historyGrowth` es lo nuevo que aporta cada turno (mensaje, resultados de herramientas).
 * - Salida y razonamiento se indican POR TURNO y se facturan al precio de salida.
 * - Caché: `prefix` cachea solo el prefijo estable `P` (comienzo de la entrada); `conversation` mueve el
 *   punto de corte al final de cada petición (cachea prefijo e historial). De lo cacheable, una fracción
 *   `h` (el % de acierto) se LEE de caché si había algo escrito antes; el resto se ESCRIBE.
 *   - `cacheScope = 'task'`: el turno 1 de cada tarea no encuentra nada (todo se escribe); desde el turno 2 hay lecturas.
 *   - `cacheScope = 'tasks'`: el prefijo `P` también se reutiliza entre tareas, así que el turno 1 lee `h × P`.
 * - El precio de cada petición lo fija su entrada total N_k (incluidas lecturas y escrituras de caché),
 *   con `unitPricesFor`: el tramo largo se aplica por petición.
 * - Batch multiplica todo el coste por `batchFactor` (solo si el modelo lo tiene verificado).
 */

export type CacheMode = 'off' | 'prefix' | 'conversation';
export type CacheScope = 'task' | 'tasks';
/** `short` = el TTL más corto que ofrece el modelo (5 min en Claude); `long` = el más largo (1 h en Claude). */
export type TtlChoice = 'short' | 'long';

export interface CostParams {
  /** Tokens de entrada del primer turno (prefijo + parte variable). */
  inputTokens: number;
  /** Tokens de salida visible por turno. */
  outputTokens: number;
  /** Tokens de razonamiento por turno (se facturan como salida). */
  reasoningTokens: number;
  /** Peticiones por tarea (≥ 1). */
  turns: number;
  /** Tokens nuevos que cada turno añade al historial, sin contar la respuesta anterior del modelo. */
  historyGrowthTokens: number;
  /** Si el razonamiento de turnos anteriores se reenvía como entrada. Por defecto, no. */
  reasoningInHistory: boolean;
  cacheMode: CacheMode;
  cacheScope: CacheScope;
  /** Parte del primer turno que es prefijo estable (≤ inputTokens). */
  cacheablePrefixTokens: number;
  /** 0–100. */
  cacheHitPercent: number;
  ttl: TtlChoice;
  useBatch: boolean;
  /** Aplica `scheduledChange` a los modelos que lo tengan. */
  usePlannedPrice: boolean;
  tasksPerMonth: number;
}

export type ConceptId = 'uncachedInput' | 'cacheWrite' | 'cacheRead' | 'output' | 'reasoning';

export interface BreakdownLine {
  id: ConceptId;
  label: string;
  /** Tokens de este concepto por tarea. */
  tokens: number;
  /** Coste por tarea ANTES del descuento de Batch. */
  costUsd: number;
  /** Precio por millón de tokens si es el mismo en todas las peticiones; `null` si no hay tokens o varía por tramo. */
  unitPriceUsd: number | null;
  /** `true` si el precio cambia entre peticiones (tramo largo). */
  mixedPrices: boolean;
}

export interface RequestDetail {
  turn: number;
  inputTokens: number;
  uncachedTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  tier: 'base' | 'long';
  cacheActive: boolean;
}

export type WarningCode =
  | 'context-overflow'
  | 'context-tight'
  | 'max-output'
  | 'cache-below-min'
  | 'cache-no-price'
  | 'long-context'
  | 'no-batch'
  | 'batch-multi-turn'
  | 'batch-cache'
  | 'cache-no-reuse'
  | 'implicit-cache'
  | 'ttl-fixed'
  | 'planned-price';

export interface CostWarning {
  code: WarningCode;
  /** `cuidado` cambia o invalida el resultado; `info` lo matiza. */
  severity: 'cuidado' | 'info';
  message: string;
}

export interface ModelCost {
  modelId: string;
  modelName: string;
  /** Coste por tarea con la configuración elegida (Batch incluido si se pidió y existe). */
  perTaskUsd: number;
  monthlyUsd: number;
  /** Coste por tarea y al mes sin Batch. */
  perTaskStandardUsd: number;
  monthlyStandardUsd: number;
  /** Con Batch; `null` si el modelo no tiene Batch verificado. */
  perTaskBatchUsd: number | null;
  monthlyBatchUsd: number | null;
  batchApplied: boolean;
  batchFactor: number | null;
  lines: BreakdownLine[];
  /** Descuento de Batch por tarea (≥ 0): suma de las líneas − perTaskUsd. */
  batchDiscountUsd: number;
  requests: RequestDetail[];
  cacheActiveRequests: number;
  /** TTL aplicado en minutos; `null` si no hay caché configurable (implícita) o no hay caché. */
  ttlMinutes: number | null;
  plannedPriceApplied: boolean;
  warnings: CostWarning[];
}

export interface LeverEffect {
  id: string;
  label: string;
  detail: string;
  applicable: boolean;
  /** Por qué no es aplicable (solo si `applicable` es `false`). */
  reason?: string;
  perTaskUsd: number;
  monthlyUsd: number;
  /** Positivo si ahorra; negativo si cuesta más. Respecto a la configuración actual, no acumulado. */
  savingPerTaskUsd: number;
  savingMonthlyUsd: number;
  /** Ahorro sobre el coste actual, en %; `null` si el coste actual es 0. */
  savingPercent: number | null;
  kind: 'ahorra' | 'cuesta-mas' | 'igual';
}

// ---------------------------------------------------------------------------------------------
// Entradas en bruto (texto de los campos) y validación

export type NumericField =
  | 'inputTokens'
  | 'outputTokens'
  | 'reasoningTokens'
  | 'turns'
  | 'historyGrowthTokens'
  | 'tasksPerMonth'
  | 'cacheablePrefixTokens'
  | 'cacheHitPercent';

export interface RawCostInputs extends Record<NumericField, string> {
  cacheMode: CacheMode;
  cacheScope: CacheScope;
  ttl: TtlChoice;
  useBatch: boolean;
  usePlannedPrice: boolean;
  reasoningInHistory: boolean;
}

export type FieldErrors = Partial<Record<NumericField, string>>;
export type ParseResult = { ok: true; params: CostParams } | { ok: false; errors: FieldErrors };

export const MAX_TURNS = 1000;
export const MAX_COUNT = 1_000_000_000;

/** Ejemplo de la página «Calculadora de coste por tarea»: resumir un contrato, sin caché ni razonamiento. */
export const DEFAULT_RAW_INPUTS: RawCostInputs = {
  inputTokens: '30.000',
  outputTokens: '1.500',
  reasoningTokens: '0',
  turns: '1',
  historyGrowthTokens: '0',
  tasksPerMonth: '2.000',
  cacheablePrefixTokens: '2.000',
  cacheHitPercent: '80',
  cacheMode: 'off',
  cacheScope: 'tasks',
  ttl: 'short',
  useBatch: false,
  usePlannedPrice: false,
  reasoningInHistory: false,
};

export const DEFAULT_MODEL_IDS: readonly string[] = ['haiku-5-5', 'sonnet-5-5', 'opus-5-5'];

/**
 * Número en formato español: «30.000», «1.500», «12,5», «30000». El punto agrupa miles cuando
 * va seguido de exactamente tres cifras («1.500» = 1500); en cualquier otro caso se trata como decimal.
 * Devuelve `null` si el texto no es un número.
 */
export function parseNumberEs(text: string): number | null {
  const t = text.replace(/\s/g, '');
  if (t === '') return null;
  if (/^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) {
    return Number(t.replace(/\./g, '').replace(',', '.'));
  }
  if (/^[+-]?\d+([.,]\d+)?$/.test(t)) return Number(t.replace(',', '.'));
  return null;
}

interface FieldRule {
  label: string;
  min: number;
  max: number;
  integer: boolean;
  emptyMessage: string;
}

const FIELD_RULES: Record<NumericField, FieldRule> = {
  inputTokens: {
    label: 'tokens de entrada',
    min: 0,
    max: MAX_COUNT,
    integer: true,
    emptyMessage: 'Escribe los tokens de entrada (0 si no hay).',
  },
  outputTokens: {
    label: 'tokens de salida',
    min: 0,
    max: MAX_COUNT,
    integer: true,
    emptyMessage: 'Escribe los tokens de salida (0 si no hay).',
  },
  reasoningTokens: {
    label: 'tokens de razonamiento',
    min: 0,
    max: MAX_COUNT,
    integer: true,
    emptyMessage: 'Escribe los tokens de razonamiento (0 si el modelo no razona).',
  },
  turns: {
    label: 'turnos',
    min: 1,
    max: MAX_TURNS,
    integer: true,
    emptyMessage: 'Escribe el número de turnos (mínimo 1).',
  },
  historyGrowthTokens: {
    label: 'tokens de crecimiento',
    min: 0,
    max: MAX_COUNT,
    integer: true,
    emptyMessage: 'Escribe el crecimiento del historial por turno (0 si no crece).',
  },
  tasksPerMonth: {
    label: 'tareas al mes',
    min: 0,
    max: MAX_COUNT,
    integer: true,
    emptyMessage: 'Escribe cuántas tareas haces al mes.',
  },
  cacheablePrefixTokens: {
    label: 'tokens del prefijo estable',
    min: 0,
    max: MAX_COUNT,
    integer: true,
    emptyMessage: 'Escribe los tokens del prefijo estable (0 si no hay).',
  },
  cacheHitPercent: {
    label: 'porcentaje de acierto',
    min: 0,
    max: 100,
    integer: false,
    emptyMessage: 'Escribe el porcentaje de acierto de la caché (entre 0 y 100).',
  },
};

function parseField(field: NumericField, text: string): { value: number } | { error: string } {
  const rule = FIELD_RULES[field];
  if (text.trim() === '') return { error: rule.emptyMessage };
  const n = parseNumberEs(text);
  if (n === null || !Number.isFinite(n)) {
    return { error: 'Escribe solo cifras, por ejemplo 30.000 o 12,5.' };
  }
  if (n < 0) return { error: 'No puede ser negativo.' };
  if (rule.integer && !Number.isInteger(n)) {
    return { error: `Los ${rule.label} deben ser un número entero.` };
  }
  if (field === 'cacheHitPercent' && n > 100) return { error: 'El porcentaje debe estar entre 0 y 100.' };
  if (n < rule.min) return { error: `El mínimo es ${formatNumber(rule.min)}.` };
  if (n > rule.max) return { error: `El máximo admitido es ${formatNumber(rule.max)}.` };
  return { value: n };
}

/** Convierte los textos de los campos en parámetros, o devuelve un error explicado por campo. */
export function parseCostInputs(raw: RawCostInputs): ParseResult {
  const errors: FieldErrors = {};
  const values = {} as Record<NumericField, number>;
  for (const field of Object.keys(FIELD_RULES) as NumericField[]) {
    const r = parseField(field, raw[field]);
    if ('error' in r) errors[field] = r.error;
    else values[field] = r.value;
  }
  if (
    errors.cacheablePrefixTokens === undefined &&
    errors.inputTokens === undefined &&
    values.cacheablePrefixTokens > values.inputTokens
  ) {
    errors.cacheablePrefixTokens = `El prefijo estable no puede superar la entrada del primer turno (${formatNumber(values.inputTokens)} tokens).`;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    params: {
      inputTokens: values.inputTokens,
      outputTokens: values.outputTokens,
      reasoningTokens: values.reasoningTokens,
      turns: values.turns,
      historyGrowthTokens: values.historyGrowthTokens,
      reasoningInHistory: raw.reasoningInHistory,
      cacheMode: raw.cacheMode,
      cacheScope: raw.cacheScope,
      cacheablePrefixTokens: values.cacheablePrefixTokens,
      cacheHitPercent: values.cacheHitPercent,
      ttl: raw.ttl,
      useBatch: raw.useBatch,
      usePlannedPrice: raw.usePlannedPrice,
      tasksPerMonth: values.tasksPerMonth,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Formato

/** Importes en dólares: «0,00375 $», «0,075 $», «7,50 $», «1.500 $». Cifras significativas según el tamaño. */
export function formatCost(n: number): string {
  const abs = Math.abs(n);
  let opts: Intl.NumberFormatOptions;
  if (abs === 0) opts = { maximumFractionDigits: 0 };
  else if (abs < 0.01) opts = { maximumSignificantDigits: 4 };
  else if (abs < 1) opts = { minimumFractionDigits: 2, maximumFractionDigits: 4 };
  else if (abs < 1000) opts = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  else opts = { maximumFractionDigits: 0 };
  return `${new Intl.NumberFormat('es-ES', { useGrouping: 'always', ...opts }).format(n)} $`;
}

// ---------------------------------------------------------------------------------------------
// Cálculo

const PER_MILLION = 1_000_000;

/** TTL que corresponde a la elección corta/larga en este modelo; `null` en la caché implícita. */
export function ttlOptionFor(model: CatalogModel, choice: TtlChoice): CacheTtlOption | null {
  const options = cacheTtlOptions(model);
  if (options.length === 0) return null;
  return (choice === 'short' ? options[0] : options[options.length - 1]) ?? null;
}

/** Precio efectivo (con el cambio programado si se pide) en el que fijarse para los avisos. */
function plannedDate(model: CatalogModel, params: CostParams): string | undefined {
  return params.usePlannedPrice && model.scheduledChange ? model.scheduledChange.effectiveFrom : undefined;
}

function assertFinite(params: CostParams): void {
  const numbers = [
    params.inputTokens,
    params.outputTokens,
    params.reasoningTokens,
    params.turns,
    params.historyGrowthTokens,
    params.cacheablePrefixTokens,
    params.cacheHitPercent,
    params.tasksPerMonth,
  ];
  if (numbers.some((n) => !Number.isFinite(n) || n < 0) || params.turns < 1) {
    throw new RangeError('calculateModelCost: parámetros sin validar (usa parseCostInputs)');
  }
}

interface Accumulator {
  tokens: number;
  units: number;
  prices: Set<number>;
}
const newAcc = (): Accumulator => ({ tokens: 0, units: 0, prices: new Set() });
function add(acc: Accumulator, tokens: number, price: number): void {
  if (tokens <= 0) return;
  acc.tokens += tokens;
  acc.units += tokens * price;
  acc.prices.add(price);
}

const LINE_LABELS: Record<ConceptId, string> = {
  uncachedInput: 'Entrada sin caché',
  cacheWrite: 'Escrituras de caché',
  cacheRead: 'Lecturas de caché',
  output: 'Salida',
  reasoning: 'Razonamiento (se factura como salida)',
};

function toLine(id: ConceptId, acc: Accumulator): BreakdownLine {
  const [only] = acc.prices;
  return {
    id,
    label: LINE_LABELS[id],
    tokens: acc.tokens,
    costUsd: acc.units / PER_MILLION,
    unitPriceUsd: acc.prices.size === 1 && only !== undefined ? only : null,
    mixedPrices: acc.prices.size > 1,
  };
}

/** Coste de una tarea y de un mes para un modelo. Requiere parámetros validados (ver `parseCostInputs`). */
export function calculateModelCost(model: CatalogModel, params: CostParams): ModelCost {
  assertFinite(params);
  const asOf = plannedDate(model, params);
  const implicit = model.cache.mode === 'implicit';
  const ttlOption = ttlOptionFor(model, params.ttl);
  const hit = params.cacheHitPercent / 100;
  const perTurnOut = params.outputTokens + params.reasoningTokens;
  const growth =
    params.outputTokens +
    (params.reasoningInHistory ? params.reasoningTokens : 0) +
    params.historyGrowthTokens;
  const cacheWanted = params.cacheMode !== 'off';

  const uncached = newAcc();
  const writes = newAcc();
  const reads = newAcc();
  const outputs = newAcc();
  const reasoning = newAcc();
  const requests: RequestDetail[] = [];

  let firstOverflowTurn: number | null = null;
  let firstTightTurn: number | null = null;
  let firstLongTurn: number | null = null;
  let longTurns = 0;
  let maxCached = 0;
  let firstActiveTurn: number | null = null;
  let cacheUnpriced = false;
  let previousInput = 0;

  for (let turn = 1; turn <= params.turns; turn++) {
    const total = params.inputTokens + (turn - 1) * growth;
    const prices: UnitPrices = unitPricesFor(model, total, asOf);
    const isLong = model.longContext !== undefined && total > model.longContext.thresholdTokens;
    if (isLong) {
      longTurns++;
      firstLongTurn ??= turn;
    }
    if (firstOverflowTurn === null && total > model.contextWindow) firstOverflowTurn = turn;
    if (firstTightTurn === null && total + perTurnOut > model.contextWindow) firstTightTurn = turn;

    // Tokens al comienzo de la petición que llevan punto de corte, y los que pueden leerse porque ya se escribieron.
    let cached = 0;
    let readable = 0;
    if (params.cacheMode === 'prefix') {
      cached = params.cacheablePrefixTokens;
      readable = turn > 1 || params.cacheScope === 'tasks' ? params.cacheablePrefixTokens : 0;
    } else if (params.cacheMode === 'conversation') {
      cached = total;
      readable = turn > 1 ? previousInput : params.cacheScope === 'tasks' ? params.cacheablePrefixTokens : 0;
    }
    maxCached = Math.max(maxCached, cached);

    const readPrice = prices.cacheRead;
    const writePrice = implicit ? prices.input : (ttlOption?.writePrice(prices) ?? null);
    const canCache = readPrice !== null && writePrice !== null;
    if (cacheWanted && cached > 0 && !canCache) cacheUnpriced = true;
    const active = cacheWanted && canCache && cached > 0 && cached >= model.cache.minTokens;
    if (active) firstActiveTurn ??= turn;

    let readTokens = 0;
    let writeTokens = 0;
    let uncachedTokens = total;
    if (active && readPrice !== null && writePrice !== null) {
      readTokens = hit * readable;
      writeTokens = cached - readTokens;
      uncachedTokens = total - cached;
      add(reads, readTokens, readPrice);
      add(writes, writeTokens, writePrice);
    }
    add(uncached, uncachedTokens, prices.input);
    add(outputs, params.outputTokens, prices.output);
    add(reasoning, params.reasoningTokens, prices.output);

    requests.push({
      turn,
      inputTokens: total,
      uncachedTokens,
      cacheWriteTokens: writeTokens,
      cacheReadTokens: readTokens,
      tier: isLong ? 'long' : 'base',
      cacheActive: active,
    });
    previousInput = total;
  }

  const lines = [
    toLine('uncachedInput', uncached),
    toLine('cacheWrite', writes),
    toLine('cacheRead', reads),
    toLine('output', outputs),
    toLine('reasoning', reasoning),
  ];
  const standard = lines.reduce((sum, l) => sum + l.costUsd, 0);
  const multiplier = batchMultiplier(model, params.useBatch);
  const perTask = standard * multiplier;
  const batchCost = model.batchFactor === null ? null : standard * model.batchFactor;
  const cacheActiveRequests = requests.filter((r) => r.cacheActive).length;

  const warnings: CostWarning[] = [];

  if (firstOverflowTurn !== null) {
    const r = requests[firstOverflowTurn - 1];
    warnings.push({
      code: 'context-overflow',
      severity: 'cuidado',
      message: `La entrada del turno ${firstOverflowTurn} (${formatNumber(r?.inputTokens ?? 0)} tokens) supera la ventana de contexto de ${model.name} (${formatNumber(model.contextWindow)} tokens): esa petición no cabría. Divide la tarea, resume el historial o elige un modelo con más ventana.`,
    });
  } else if (firstTightTurn !== null) {
    warnings.push({
      code: 'context-tight',
      severity: 'cuidado',
      message: `Desde el turno ${firstTightTurn}, la entrada más la salida y el razonamiento (${formatNumber(perTurnOut)} tokens por turno) superan la ventana de ${model.name} (${formatNumber(model.contextWindow)} tokens): la respuesta no tendría hueco para completarse.`,
    });
  }
  if (perTurnOut > model.maxOutput) {
    warnings.push({
      code: 'max-output',
      severity: 'cuidado',
      message: `La salida más el razonamiento de un turno (${formatNumber(perTurnOut)} tokens) superan el máximo de salida de ${model.name} (${formatNumber(model.maxOutput)} tokens): la respuesta se cortaría.`,
    });
  }
  if (cacheWanted && cacheUnpriced && cacheActiveRequests === 0) {
    warnings.push({
      code: 'cache-no-price',
      severity: 'cuidado',
      message: `${model.name} no tiene un precio de caché verificado con este TTL: el cálculo se hace sin caché.`,
    });
  } else if (cacheWanted && maxCached > 0 && cacheActiveRequests < params.turns) {
    const min = formatNumber(model.cache.minTokens);
    warnings.push({
      code: 'cache-below-min',
      severity: 'cuidado',
      message:
        cacheActiveRequests === 0
          ? `La caché no se activa en ${model.name}: lo cacheable (${formatNumber(maxCached)} tokens como máximo) no alcanza el mínimo de ${min} tokens. Todo se factura como entrada normal.`
          : `La caché de ${model.name} solo se activa desde el turno ${firstActiveTurn}: antes, lo cacheable no alcanza el mínimo de ${min} tokens y se factura como entrada normal.`,
    });
  }
  if (firstLongTurn !== null && model.longContext) {
    const lc = model.longContext;
    const where =
      longTurns === params.turns
        ? 'En todas las peticiones'
        : `Desde el turno ${firstLongTurn} (${longTurns} de ${params.turns} peticiones)`;
    warnings.push({
      code: 'long-context',
      severity: 'cuidado',
      message: `${where}, la entrada supera ${formatNumber(lc.thresholdTokens)} tokens y toda la petición se cobra con los precios del tramo largo de ${model.name} (entrada ${formatNumber(lc.prices.input)} $ y salida ${formatNumber(lc.prices.output)} $ por millón). Cuentan también los tokens leídos de caché.`,
    });
  }
  if (params.useBatch && model.batchFactor === null) {
    warnings.push({
      code: 'no-batch',
      severity: 'cuidado',
      message: `No hay Batch verificado para ${model.name}: se calcula a precio estándar.`,
    });
  }
  if (cacheWanted && implicit) {
    warnings.push({
      code: 'implicit-cache',
      severity: 'info',
      message: `${model.name} usa caché implícita: no se factura escritura ni hay TTL configurable, y el acierto no está garantizado. Usa un porcentaje prudente.`,
    });
  }
  if (cacheWanted && !implicit && cacheTtlOptions(model).length === 1) {
    warnings.push({
      code: 'ttl-fixed',
      severity: 'info',
      message: `${model.name} solo ofrece un TTL de caché (${formatTtl(cacheTtlOptions(model)[0]?.minutes ?? 0)}): se usa ese.`,
    });
  }
  const plannedApplied = asOf !== undefined && model.scheduledChange !== undefined;
  if (plannedApplied && model.scheduledChange) {
    warnings.push({
      code: 'planned-price',
      severity: 'info',
      message: `Precio anunciado para ${model.name} desde el ${formatDate(model.scheduledChange.effectiveFrom)}; el tramo largo, si lo hay, no se modela con ese precio.`,
    });
  }

  return {
    modelId: model.id,
    modelName: model.name,
    perTaskUsd: perTask,
    monthlyUsd: perTask * params.tasksPerMonth,
    perTaskStandardUsd: standard,
    monthlyStandardUsd: standard * params.tasksPerMonth,
    perTaskBatchUsd: batchCost,
    monthlyBatchUsd: batchCost === null ? null : batchCost * params.tasksPerMonth,
    batchApplied: params.useBatch && model.batchFactor !== null,
    batchFactor: model.batchFactor,
    lines,
    batchDiscountUsd: standard - perTask,
    requests,
    cacheActiveRequests,
    ttlMinutes: cacheWanted && !implicit && cacheActiveRequests > 0 ? (ttlOption?.minutes ?? null) : null,
    plannedPriceApplied: plannedApplied,
    warnings,
  };
}

/** Un resultado por modelo, en el orden recibido. */
export function compareModels(models: CatalogModel[], params: CostParams): ModelCost[] {
  return models.map((m) => calculateModelCost(m, params));
}

/** Avisos que dependen de la configuración y no de un modelo concreto. */
export function configurationWarnings(params: CostParams): CostWarning[] {
  const out: CostWarning[] = [];
  if (params.cacheMode === 'prefix' && params.cacheScope === 'task' && params.turns === 1) {
    out.push({
      code: 'cache-no-reuse',
      severity: 'cuidado',
      message:
        'Con un solo turno y la caché limitada a cada tarea no hay lecturas: solo pagas la escritura, que cuesta más que la entrada normal. Elige «entre tareas» si varias comparten el prefijo.',
    });
  }
  if (params.useBatch && params.turns > 1) {
    out.push({
      code: 'batch-multi-turn',
      severity: 'cuidado',
      message:
        'Batch procesa cada petición por separado y sin esperar tu respuesta: una conversación de varios turnos con Batch solo vale si cada turno no depende de que alguien lea el anterior.',
    });
  }
  if (params.useBatch && params.cacheMode !== 'off') {
    out.push({
      code: 'batch-cache',
      severity: 'info',
      message:
        'Batch y caché se acumulan, pero en un lote el acierto de caché no está garantizado: comprueba con una muestra cuántos tokens se leen de caché.',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Efecto de cada palanca

function effect(
  id: string,
  label: string,
  detail: string,
  current: ModelCost,
  candidate: ModelCost,
  tasksPerMonth: number,
): LeverEffect {
  const saving = current.perTaskUsd - candidate.perTaskUsd;
  const epsilon = Math.max(current.perTaskUsd, candidate.perTaskUsd, 1e-12) * 1e-9;
  const kind = Math.abs(saving) <= epsilon ? 'igual' : saving > 0 ? 'ahorra' : 'cuesta-mas';
  return {
    id,
    label,
    detail,
    applicable: true,
    perTaskUsd: candidate.perTaskUsd,
    monthlyUsd: candidate.perTaskUsd * tasksPerMonth,
    savingPerTaskUsd: kind === 'igual' ? 0 : saving,
    savingMonthlyUsd: kind === 'igual' ? 0 : saving * tasksPerMonth,
    savingPercent:
      current.perTaskUsd === 0 ? null : kind === 'igual' ? 0 : (saving / current.perTaskUsd) * 100,
    kind,
  };
}

function notApplicable(
  id: string,
  label: string,
  detail: string,
  reason: string,
  current: ModelCost,
  tasksPerMonth: number,
): LeverEffect {
  return {
    id,
    label,
    detail,
    applicable: false,
    reason,
    perTaskUsd: current.perTaskUsd,
    monthlyUsd: current.perTaskUsd * tasksPerMonth,
    savingPerTaskUsd: 0,
    savingMonthlyUsd: 0,
    savingPercent: null,
    kind: 'igual',
  };
}

const CACHE_LEVERS: { mode: CacheMode; id: string; label: string; detail: string }[] = [
  { mode: 'off', id: 'cache-off', label: 'Quitar la caché', detail: 'Toda la entrada a precio normal.' },
  {
    mode: 'prefix',
    id: 'cache-prefix',
    label: 'Caché del prefijo estable',
    detail: 'Solo el comienzo fijo; el historial se paga como entrada.',
  },
  {
    mode: 'conversation',
    id: 'cache-conversation',
    label: 'Caché del prefijo y del historial',
    detail: 'El punto de corte avanza con la conversación.',
  },
];

/**
 * Efecto de cada palanca por separado respecto a la configuración actual (no se acumulan):
 * caché (otros modos), TTL, Batch, salida y razonamiento a la mitad, y cambio de modelo.
 * Las palancas que no se pueden aplicar se devuelven con `applicable: false` y su motivo.
 */
export function leverEffects(
  model: CatalogModel,
  params: CostParams,
  alternatives: CatalogModel[] = [],
): LeverEffect[] {
  const current = calculateModelCost(model, params);
  const tpm = params.tasksPerMonth;
  const levers: LeverEffect[] = [];
  const withParams = (patch: Partial<CostParams>, m: CatalogModel = model) =>
    calculateModelCost(m, { ...params, ...patch });

  for (const c of CACHE_LEVERS) {
    if (c.mode === params.cacheMode) continue;
    if (c.mode === 'conversation' && params.turns === 1) {
      levers.push(
        notApplicable(
          c.id,
          c.label,
          c.detail,
          'Con un solo turno no hay historial que cachear.',
          current,
          tpm,
        ),
      );
      continue;
    }
    if (c.mode === 'prefix' && params.cacheablePrefixTokens === 0) {
      levers.push(
        notApplicable(c.id, c.label, c.detail, 'No has indicado ningún prefijo estable.', current, tpm),
      );
      continue;
    }
    const candidate = withParams({ cacheMode: c.mode });
    if (c.mode !== 'off' && candidate.cacheActiveRequests === 0) {
      levers.push(
        notApplicable(
          c.id,
          c.label,
          c.detail,
          `La caché no se activaría: lo cacheable no alcanza el mínimo de ${formatNumber(model.cache.minTokens)} tokens de ${model.name} (o no hay precio de caché verificado).`,
          current,
          tpm,
        ),
      );
      continue;
    }
    levers.push(effect(c.id, c.label, c.detail, current, candidate, tpm));
  }

  if (params.cacheMode !== 'off' && current.cacheActiveRequests > 0) {
    const options = cacheTtlOptions(model);
    const first = options[0];
    const last = options[options.length - 1];
    if (first && last && first.minutes !== last.minutes) {
      const target: TtlChoice = params.ttl === 'short' ? 'long' : 'short';
      const targetOption = target === 'long' ? last : first;
      levers.push(
        effect(
          'ttl',
          `TTL de ${formatTtl(targetOption.minutes)}`,
          'Cambia el precio de escritura; el % de acierto lo estimas tú.',
          current,
          withParams({ ttl: target }),
          tpm,
        ),
      );
    }
  }

  if (model.batchFactor === null) {
    levers.push(
      notApplicable(
        'batch',
        'Usar Batch',
        'Sin respuesta inmediata.',
        `No hay Batch verificado para ${model.name}.`,
        current,
        tpm,
      ),
    );
  } else {
    levers.push(
      effect(
        'batch',
        params.useBatch ? 'No usar Batch' : 'Usar Batch',
        params.useBatch ? 'Respuesta inmediata, precio estándar.' : 'Respuesta asíncrona, sin urgencia.',
        current,
        withParams({ useBatch: !params.useBatch }),
        tpm,
      ),
    );
  }

  if (params.outputTokens === 0) {
    levers.push(
      notApplicable(
        'output-half',
        'Salida a la mitad',
        'Respuestas más cortas.',
        'No hay tokens de salida.',
        current,
        tpm,
      ),
    );
  } else {
    levers.push(
      effect(
        'output-half',
        'Salida a la mitad',
        'Respuestas más cortas.',
        current,
        withParams({ outputTokens: params.outputTokens / 2 }),
        tpm,
      ),
    );
  }

  if (params.reasoningTokens === 0) {
    levers.push(
      notApplicable(
        'reasoning-half',
        'Razonamiento a la mitad',
        'Menos esfuerzo de razonamiento.',
        'No hay tokens de razonamiento.',
        current,
        tpm,
      ),
    );
  } else {
    levers.push(
      effect(
        'reasoning-half',
        'Razonamiento a la mitad',
        'Menos esfuerzo de razonamiento.',
        current,
        withParams({ reasoningTokens: params.reasoningTokens / 2 }),
        tpm,
      ),
    );
  }

  for (const alt of alternatives) {
    if (alt.id === model.id) continue;
    levers.push(
      effect(
        `model-${alt.id}`,
        `Cambiar a ${alt.name}`,
        'Mismos tokens; la calidad hay que comprobarla.',
        current,
        withParams({}, alt),
        tpm,
      ),
    );
  }
  return levers;
}
