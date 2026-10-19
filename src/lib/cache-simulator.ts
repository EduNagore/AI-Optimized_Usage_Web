import { formatNumber } from './format';
import { cacheTtlOptions, formatTtl, unitPricesFor, type CatalogModel, type UnitPrices } from './pricing';

/**
 * Simulador de caché de prompts: lógica pura, sin DOM ni React.
 *
 * Modelo (resumen; la lista completa de supuestos está en `SIMULATOR_ASSUMPTIONS`):
 * - Todas las peticiones comparten un prefijo estable de `prefixTokens`. Cada una añade una parte
 *   variable de `variableTokens` (se paga como entrada normal) y produce `outputTokens` de salida.
 * - Caché explícita (Anthropic y OpenAI): el primer uso escribe la entrada de caché al precio de
 *   escritura del TTL elegido; cada acierto posterior la lee al precio de lectura y renueva el TTL.
 *   Si la separación con la petición anterior supera el TTL, es un fallo y se vuelve a escribir.
 * - Si el prefijo no alcanza `cache.minTokens`, la caché no se activa y todo se paga como entrada.
 * - El precio de toda la petición lo fija su entrada total (prefijo + variable), con el tramo largo
 *   de `unitPricesFor` aunque parte de la entrada sea un acierto de caché.
 * - Caché implícita (Google): sin TTL ni escritura facturada; el acierto no está garantizado. Solo
 *   se puede simular «sin descuento» (peor caso) o «acierto supuesto» (lectura desde la 2.ª petición).
 * Importes en dólares; los precios del catálogo son dólares por millón de tokens.
 */

/** Máximo de peticiones en una simulación (la interfaz y la lógica lo respetan). */
export const MAX_REQUESTS = 100;
/** Máximo de tokens por campo: evita cifras absurdas, no es un límite de ningún modelo. */
export const MAX_TOKENS_PER_FIELD = 10_000_000;
/** Supuesto: segundos que tarda en estar disponible la entrada de caché tras empezar la 1.ª respuesta. */
export const DEFAULT_READY_SECONDS = 5;

export type OutcomeKind =
  | 'hit'
  | 'write-first'
  | 'write-expired'
  | 'write-not-ready'
  | 'no-cache'
  | 'below-min'
  | 'implicit-first'
  | 'implicit-hit'
  | 'implicit-miss';

const OUTCOME_LABELS: Record<OutcomeKind, string> = {
  hit: 'acierto',
  'write-first': 'fallo: escribe en caché',
  'write-expired': 'fallo: TTL caducado',
  'write-not-ready': 'fallo: la entrada aún no está disponible',
  'no-cache': 'sin caché',
  'below-min': 'sin caché: prefijo bajo el mínimo',
  'implicit-first': 'sin descuento: primera petición',
  'implicit-hit': 'acierto supuesto',
  'implicit-miss': 'sin descuento',
};

/** Texto de cada resultado por petición, tal como se muestra al lector. */
export function outcomeLabel(kind: OutcomeKind): string {
  return OUTCOME_LABELS[kind];
}

/** `true` si la petición lee el prefijo de la caché (acierto real o supuesto). */
export function isHitOutcome(kind: OutcomeKind): boolean {
  return kind === 'hit' || kind === 'implicit-hit';
}

/** `true` si la petición paga una escritura de caché. */
export function isWriteOutcome(kind: OutcomeKind): boolean {
  return kind === 'write-first' || kind === 'write-expired' || kind === 'write-not-ready';
}

export interface SimulationInput {
  model: CatalogModel;
  /** Tokens del prefijo estable que se puede cachear. */
  prefixTokens: number;
  /** Tokens variables de cada petición (se pagan como entrada normal). */
  variableTokens: number;
  /** Tokens de salida de cada petición. */
  outputTokens: number;
  /**
   * Segundos entre cada petición y la anterior. Debe haber uno por petición; el primero se ignora
   * (la primera petición no tiene anterior).
   */
  gapsSeconds: number[];
  /** Minutos de TTL (uno de `cacheTtlOptions`), o `null` para no usar caché. Siempre `null` en caché implícita. */
  ttlMinutes: number | null;
  /** Segundos hasta que la entrada escrita está disponible para otra petición (por defecto, 5). */
  readySeconds?: number;
  /** Solo caché implícita: supone que el prefijo acierta desde la 2.ª petición. */
  assumeImplicitHit?: boolean;
  /** Fecha AAAA-MM-DD para los cambios de precio programados (opcional). */
  asOf?: string;
}

export interface SimulationError {
  field: 'prefixTokens' | 'variableTokens' | 'outputTokens' | 'gaps' | 'ttl' | 'readySeconds';
  message: string;
  /** Índice (desde 0) de la petición afectada, si el error es de una separación. */
  index?: number;
}

export interface CostBreakdown {
  cacheWrite: number;
  cacheRead: number;
  /** Entrada que no pasa por la caché. */
  input: number;
  output: number;
  total: number;
}

export interface TokenTally {
  cacheWrite: number;
  cacheRead: number;
  input: number;
  output: number;
}

export interface RequestResult {
  /** Número de petición, desde 1. */
  index: number;
  /** Separación con la anterior en segundos (0 en la primera). */
  gapSeconds: number;
  /** Instante de la petición, en segundos desde la primera. */
  atSeconds: number;
  outcome: OutcomeKind;
  /** Entrada total de la petición (prefijo + variable): la que decide el tramo de precios. */
  totalInputTokens: number;
  /** `true` si esta petición paga los precios del tramo largo del modelo. */
  longTier: boolean;
  cost: CostBreakdown;
  tokens: TokenTally;
}

export interface SimulationResult {
  modelId: string;
  ttlMinutes: number | null;
  /** `true` si la caché interviene (hay aciertos posibles). */
  cacheActive: boolean;
  /** Por qué no interviene, si `cacheActive` es falso por una causa distinta de no haberla pedido. */
  inactiveReason?: string;
  requests: RequestResult[];
  totals: CostBreakdown;
  tokens: TokenTally;
  counts: { hits: number; writes: number; uncached: number };
  warnings: string[];
}

export type SimulationOutcome =
  { ok: true; result: SimulationResult } | { ok: false; errors: SimulationError[] };

const ZERO_COST: CostBreakdown = { cacheWrite: 0, cacheRead: 0, input: 0, output: 0, total: 0 };

function isCount(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

/** Precio de escritura de caché para el TTL dado con unos precios dados (`null` si no hay dato). */
export function writePriceFor(model: CatalogModel, prices: UnitPrices, ttlMinutes: number): number | null {
  const option = cacheTtlOptions(model).find((o) => o.minutes === ttlMinutes);
  return option ? option.writePrice(prices) : null;
}

/** Comprueba la entrada. Devuelve una lista vacía si es válida. */
export function validateInput(input: SimulationInput): SimulationError[] {
  const errors: SimulationError[] = [];
  const fields = [
    ['prefixTokens', input.prefixTokens, 'Los tokens del prefijo estable'],
    ['variableTokens', input.variableTokens, 'Los tokens variables'],
    ['outputTokens', input.outputTokens, 'Los tokens de salida'],
  ] as const;
  for (const [field, value, name] of fields) {
    if (!isCount(value)) {
      errors.push({ field, message: `${name} deben ser un número entero igual o mayor que 0.` });
    } else if (value > MAX_TOKENS_PER_FIELD) {
      errors.push({
        field,
        message: `${name} no pueden pasar de ${formatNumber(MAX_TOKENS_PER_FIELD)}.`,
      });
    }
  }
  if (
    isCount(input.prefixTokens) &&
    isCount(input.variableTokens) &&
    input.prefixTokens + input.variableTokens === 0
  ) {
    errors.push({ field: 'variableTokens', message: 'La entrada de la petición no puede ser de 0 tokens.' });
  }

  if (input.gapsSeconds.length === 0) {
    errors.push({ field: 'gaps', message: 'Añade al menos una petición.' });
  } else if (input.gapsSeconds.length > MAX_REQUESTS) {
    errors.push({ field: 'gaps', message: `El simulador admite hasta ${MAX_REQUESTS} peticiones.` });
  }
  input.gapsSeconds.forEach((g, i) => {
    if (i > 0 && !(Number.isFinite(g) && g >= 0)) {
      errors.push({
        field: 'gaps',
        index: i,
        message: `La separación de la petición ${i + 1} debe ser un número igual o mayor que 0.`,
      });
    }
  });

  const ready = input.readySeconds ?? DEFAULT_READY_SECONDS;
  if (!(Number.isFinite(ready) && ready >= 0)) {
    errors.push({ field: 'readySeconds', message: 'El tiempo de disponibilidad debe ser 0 o mayor.' });
  }

  if (input.model.cache.mode === 'implicit') {
    if (input.ttlMinutes !== null) {
      errors.push({
        field: 'ttl',
        message: `${input.model.name} usa caché implícita: no tiene TTL configurable.`,
      });
    }
  } else if (input.ttlMinutes !== null) {
    const offered = cacheTtlOptions(input.model).map((o) => o.minutes);
    if (!offered.includes(input.ttlMinutes)) {
      errors.push({
        field: 'ttl',
        message: `${input.model.name} no ofrece un TTL de ${formatTtl(input.ttlMinutes)}; elige ${offered.map(formatTtl).join(' o ')}.`,
      });
    }
  }
  return errors;
}

function costOf(
  tokens: TokenTally,
  prices: UnitPrices,
  writePrice: number | null,
  readPrice: number | null,
): CostBreakdown {
  const cacheWrite = (tokens.cacheWrite * (writePrice ?? 0)) / 1_000_000;
  const cacheRead = (tokens.cacheRead * (readPrice ?? 0)) / 1_000_000;
  const input = (tokens.input * prices.input) / 1_000_000;
  const output = (tokens.output * prices.output) / 1_000_000;
  return { cacheWrite, cacheRead, input, output, total: cacheWrite + cacheRead + input + output };
}

function addCost(a: CostBreakdown, b: CostBreakdown): CostBreakdown {
  return {
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cacheRead: a.cacheRead + b.cacheRead,
    input: a.input + b.input,
    output: a.output + b.output,
    total: a.total + b.total,
  };
}

function addTokens(a: TokenTally, b: TokenTally): TokenTally {
  return {
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cacheRead: a.cacheRead + b.cacheRead,
    input: a.input + b.input,
    output: a.output + b.output,
  };
}

/**
 * Simula la secuencia de peticiones. Nunca lanza: una entrada inválida devuelve sus errores.
 *
 * Reglas por petición, en orden:
 * 1. Sin caché pedida (`ttlMinutes` null en caché explícita): todo el prefijo es entrada normal.
 * 2. Prefijo menor que `cache.minTokens`: no se cachea («sin caché: prefijo bajo el mínimo»).
 * 3. Primera petición: escribe en caché.
 * 4. Separación mayor que el TTL: la entrada ha caducado; se escribe de nuevo.
 *    Una separación igual al TTL cuenta como acierto (supuesto).
 * 5. Separación menor que `readySeconds`: la entrada aún no está disponible; se escribe de nuevo.
 * 6. En otro caso: acierto, se lee el prefijo y el TTL se renueva.
 * Cada acierto o escritura fija el instante del último uso.
 */
export function simulate(input: SimulationInput): SimulationOutcome {
  const errors = validateInput(input);
  if (errors.length > 0) return { ok: false, errors };

  const { model, prefixTokens, variableTokens, outputTokens, gapsSeconds, ttlMinutes } = input;
  const readySeconds = input.readySeconds ?? DEFAULT_READY_SECONDS;
  const implicit = model.cache.mode === 'implicit';
  const totalInput = prefixTokens + variableTokens;
  const prices = unitPricesFor(model, totalInput, input.asOf);
  const longTier = model.longContext !== undefined && totalInput > model.longContext.thresholdTokens;

  const aboveMin = prefixTokens >= model.cache.minTokens;
  const wantsCache = implicit ? input.assumeImplicitHit === true : ttlMinutes !== null;
  const cacheActive = wantsCache && aboveMin;
  const inactiveReason =
    wantsCache && !aboveMin
      ? `El prefijo (${prefixTokens} tokens) no alcanza el mínimo cacheable de ${model.name} (${model.cache.minTokens} tokens): no se cachea.`
      : undefined;

  const readPrice = prices.cacheRead;
  const writePrice = !implicit && ttlMinutes !== null ? writePriceFor(model, prices, ttlMinutes) : null;
  if (cacheActive) {
    const missing: string[] = [];
    if (readPrice === null) missing.push('lectura de caché');
    if (!implicit && writePrice === null) missing.push(`escritura de caché de ${formatTtl(ttlMinutes ?? 0)}`);
    if (missing.length > 0) {
      return {
        ok: false,
        errors: [
          {
            field: 'ttl',
            message: `${model.name} no tiene precio verificado de ${missing.join(' ni de ')}.`,
          },
        ],
      };
    }
  }

  const ttlSeconds = ttlMinutes === null ? 0 : ttlMinutes * 60;
  const requests: RequestResult[] = [];
  let at = 0;
  let lastUse: number | null = null;
  let totals = ZERO_COST;
  let tokens: TokenTally = { cacheWrite: 0, cacheRead: 0, input: 0, output: 0 };
  const counts = { hits: 0, writes: 0, uncached: 0 };

  gapsSeconds.forEach((rawGap, i) => {
    const gap = i === 0 ? 0 : rawGap;
    at += gap;

    let outcome: OutcomeKind;
    if (implicit) {
      if (!cacheActive) outcome = 'implicit-miss';
      else outcome = i === 0 ? 'implicit-first' : 'implicit-hit';
    } else if (ttlMinutes === null) {
      outcome = 'no-cache';
    } else if (!aboveMin) {
      outcome = 'below-min';
    } else if (lastUse === null) {
      outcome = 'write-first';
    } else if (at - lastUse > ttlSeconds) {
      outcome = 'write-expired';
    } else if (gap < readySeconds) {
      outcome = 'write-not-ready';
    } else {
      outcome = 'hit';
    }

    const reads = isHitOutcome(outcome);
    const writes = isWriteOutcome(outcome);
    if (reads || writes) lastUse = at;

    const t: TokenTally = {
      cacheWrite: writes ? prefixTokens : 0,
      cacheRead: reads ? prefixTokens : 0,
      input: reads || writes ? variableTokens : totalInput,
      output: outputTokens,
    };
    const cost = costOf(t, prices, writes ? writePrice : null, reads ? readPrice : null);
    requests.push({
      index: i + 1,
      gapSeconds: gap,
      atSeconds: at,
      outcome,
      totalInputTokens: totalInput,
      longTier,
      cost,
      tokens: t,
    });
    totals = addCost(totals, cost);
    tokens = addTokens(tokens, t);
    if (reads) counts.hits += 1;
    else if (writes) counts.writes += 1;
    else counts.uncached += 1;
  });

  const warnings: string[] = [];
  if (totalInput > model.contextWindow) {
    warnings.push(
      `La entrada de cada petición (${formatNumber(totalInput)} tokens) supera la ventana de contexto de ${model.name} (${formatNumber(model.contextWindow)}).`,
    );
  }
  if (longTier && model.longContext) {
    warnings.push(
      `Cada petición supera ${formatNumber(model.longContext.thresholdTokens)} tokens de entrada: se cobra con los precios del tramo largo, aunque parte de la entrada sea un acierto de caché.`,
    );
  }

  const base: SimulationResult = {
    modelId: model.id,
    ttlMinutes,
    cacheActive,
    requests,
    totals,
    tokens,
    counts,
    warnings,
  };
  return { ok: true, result: inactiveReason ? { ...base, inactiveReason } : base };
}

// ---------------------------------------------------------------------------------------------
// Comparación de opciones

export interface ComparedOption {
  /** `none`, `ttl-<minutos>` o `assume-hit`. */
  key: string;
  label: string;
  ttlMinutes: number | null;
  assumeHit: boolean;
  result: SimulationResult;
}

export interface TtlBreakEven {
  shortMinutes: number;
  longMinutes: number;
  /** Peticiones que fallan con el TTL corto y aciertan con el largo. */
  avoidedMisses: number;
  /** Ahorro de esas peticiones con el TTL largo (dólares). */
  savedByAvoided: number;
  /** Sobrecoste del TTL largo en las escrituras que ambos pagan (dólares). */
  premiumPaid: number;
  /** Coste del TTL corto menos el del largo: positivo si la hora sale más barata. */
  netSavingOfLong: number;
  /**
   * Fallos evitados necesarios para que el TTL largo compense, con el ahorro medio por fallo evitado
   * de este escenario. `null` si el TTL largo no evita ningún fallo (no hay equilibrio posible).
   */
  neededAvoided: number | null;
}

export interface Comparison {
  options: ComparedOption[];
  /** Opciones omitidas (por ejemplo, sin precio verificado), con el motivo. */
  skipped: { label: string; reason: string }[];
  /** Claves de las opciones más baratas (más de una si empatan). */
  cheapestKeys: string[];
  /** `true` si todas cuestan lo mismo (p. ej. el prefijo no llega al mínimo). */
  allEqual: boolean;
  breakEven: TtlBreakEven | null;
}

export type ComparisonOutcome =
  { ok: true; comparison: Comparison } | { ok: false; errors: SimulationError[] };

const EPSILON = 1e-12;

/**
 * Calcula el mismo escenario sin caché y con cada TTL del modelo (o, en caché implícita, sin
 * descuento y con acierto supuesto) y señala la más barata.
 */
export function compareOptions(
  base: Omit<SimulationInput, 'ttlMinutes' | 'assumeImplicitHit'>,
): ComparisonOutcome {
  const { model } = base;
  const specs: { key: string; label: string; ttlMinutes: number | null; assumeHit: boolean }[] = [];
  if (model.cache.mode === 'implicit') {
    specs.push({ key: 'none', label: 'Sin descuento (peor caso)', ttlMinutes: null, assumeHit: false });
    specs.push({ key: 'assume-hit', label: 'Acierto supuesto', ttlMinutes: null, assumeHit: true });
  } else {
    specs.push({ key: 'none', label: 'Sin caché', ttlMinutes: null, assumeHit: false });
    for (const o of cacheTtlOptions(model)) {
      specs.push({
        key: `ttl-${o.minutes}`,
        label: `Caché de ${o.label}`,
        ttlMinutes: o.minutes,
        assumeHit: false,
      });
    }
  }

  const options: ComparedOption[] = [];
  const skipped: Comparison['skipped'] = [];
  for (const spec of specs) {
    const out = simulate({ ...base, ttlMinutes: spec.ttlMinutes, assumeImplicitHit: spec.assumeHit });
    if (out.ok) {
      options.push({ ...spec, result: out.result });
    } else if (spec.key === 'none') {
      return { ok: false, errors: out.errors };
    } else if (out.errors.every((e) => e.field === 'ttl')) {
      skipped.push({ label: spec.label, reason: out.errors.map((e) => e.message).join(' ') });
    } else {
      return { ok: false, errors: out.errors };
    }
  }

  const min = Math.min(...options.map((o) => o.result.totals.total));
  const cheapestKeys = options
    .filter((o) => o.result.totals.total - min <= EPSILON * Math.max(1, min))
    .map((o) => o.key);
  const allEqual = cheapestKeys.length === options.length;

  return {
    ok: true,
    comparison: { options, skipped, cheapestKeys, allEqual, breakEven: ttlBreakEven(options) },
  };
}

/** Punto de equilibrio entre el TTL más corto y el más largo del modelo, si hay dos y ambos intervienen. */
function ttlBreakEven(options: ComparedOption[]): TtlBreakEven | null {
  const ttlOptions = options.filter((o) => o.ttlMinutes !== null && o.result.cacheActive);
  if (ttlOptions.length < 2) return null;
  const sorted = [...ttlOptions].sort((a, b) => (a.ttlMinutes ?? 0) - (b.ttlMinutes ?? 0));
  const short = sorted[0];
  const long = sorted[sorted.length - 1];
  if (!short || !long || short.ttlMinutes === null || long.ttlMinutes === null) return null;

  let avoidedMisses = 0;
  let savedByAvoided = 0;
  let premiumPaid = 0;
  short.result.requests.forEach((s, i) => {
    const l = long.result.requests[i];
    if (!l) return;
    const shortWrites = isWriteOutcome(s.outcome);
    if (shortWrites && isHitOutcome(l.outcome)) {
      avoidedMisses += 1;
      savedByAvoided += s.cost.total - l.cost.total;
    } else if (shortWrites && isWriteOutcome(l.outcome)) {
      premiumPaid += l.cost.total - s.cost.total;
    }
  });
  const neededAvoided = avoidedMisses > 0 ? premiumPaid / (savedByAvoided / avoidedMisses) : null;
  return {
    shortMinutes: short.ttlMinutes,
    longMinutes: long.ttlMinutes,
    avoidedMisses,
    savedByAvoided,
    premiumPaid,
    netSavingOfLong: short.result.totals.total - long.result.totals.total,
    neededAvoided,
  };
}

// ---------------------------------------------------------------------------------------------
// Escenarios, valores de ejemplo y supuestos

export interface Scenario {
  id: string;
  label: string;
  description: string;
  /** Separación con la petición anterior, en minutos (el primer valor no se usa). */
  gapsMinutes: number[];
}

function uniform(requests: number, gapMinutes: number): number[] {
  return Array.from({ length: requests }, (_, i) => (i === 0 ? 0 : gapMinutes));
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'fluida',
    label: 'Conversación fluida: cada 2 min',
    description: '10 peticiones con 2 minutos entre cada una.',
    gapsMinutes: uniform(10, 2),
  },
  {
    id: 'espaciadas',
    label: 'Consultas espaciadas: cada 10 min',
    description: '8 peticiones con 10 minutos entre cada una.',
    gapsMinutes: uniform(8, 10),
  },
  {
    id: 'burst',
    label: 'Ráfaga: 20 peticiones seguidas',
    description: '20 peticiones con 15 segundos entre cada una.',
    gapsMinutes: uniform(20, 0.25),
  },
  {
    id: 'diario',
    label: 'Un informe diario',
    description: '7 peticiones, una cada 24 horas.',
    gapsMinutes: uniform(7, 1440),
  },
];

export const DEFAULT_SIMULATOR_STATE = {
  modelId: 'sonnet-5-5',
  prefixTokens: 18_000,
  variableTokens: 2_000,
  outputTokens: 500,
  ttlMinutes: 5,
  scenarioId: 'fluida',
} as const;

/** Supuestos del modelo, para mostrarlos en la interfaz. `verified` indica si lo respalda la documentación. */
export const SIMULATOR_ASSUMPTIONS: { id: string; verified: boolean; text: string }[] = [
  {
    id: 'renewal',
    verified: true,
    text: 'Cada acierto renueva el TTL sin coste adicional (documentación de Anthropic; OpenAI indica lo mismo para su caché de 30 minutos).',
  },
  {
    id: 'fixed-prefix',
    verified: false,
    text: 'El prefijo estable y la parte variable tienen el mismo tamaño en todas las peticiones. En una conversación real el historial crece y cada turno escribe además lo nuevo.',
  },
  {
    id: 'boundary',
    verified: false,
    text: 'Una separación exactamente igual al TTL cuenta como acierto; un segundo más, como fallo. En la práctica el límite no es tan exacto.',
  },
  {
    id: 'ready',
    verified: false,
    text: 'Una petición que llega antes de que la anterior haya empezado a responder (por defecto, menos de 5 s después) no encuentra la entrada y paga otra escritura. El tiempo exacto depende de cada respuesta.',
  },
  {
    id: 'scope',
    verified: false,
    text: 'No incluye Batch, fast mode ni recargos de residencia de datos, y supone un único punto de corte al final del prefijo.',
  },
  {
    id: 'implicit',
    verified: true,
    text: 'En la caché implícita de Google no hay TTL ni escritura facturada y el acierto no está garantizado; «acierto supuesto» es una hipótesis tuya, no una predicción.',
  },
];

// ---------------------------------------------------------------------------------------------
// Lectura de campos de texto y formato

export type ParseResult = { ok: true; value: number } | { ok: false; error: string };

/** Entero de tokens a partir del texto de un campo. */
export function parseTokenCount(text: string, name: string): ParseResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: `Escribe ${name}.` };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return { ok: false, error: `${capitalize(name)} debe ser un número entero igual o mayor que 0.` };
  }
  if (n > MAX_TOKENS_PER_FIELD) {
    return {
      ok: false,
      error: `${capitalize(name)} no puede pasar de ${formatNumber(MAX_TOKENS_PER_FIELD)}.`,
    };
  }
  return { ok: true, value: n };
}

/** Separación en minutos (admite decimales) a partir del texto de un campo; devuelve segundos enteros. */
export function parseGapMinutes(text: string): ParseResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: 'Escribe la separación en minutos (0 si es simultánea).' };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: 'La separación debe ser un número de minutos igual o mayor que 0.' };
  }
  if (n > 525_600) return { ok: false, error: 'La separación no puede pasar de un año (525.600 minutos).' };
  return { ok: true, value: Math.round(n * 60) };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 15 → «15 s»; 120 → «2 min»; 5400 → «1 h 30 min»; 86400 → «24 h». */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r === 0 ? `${m} min` : `${m} min ${r} s`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m === 0 ? `${formatNumber(h)} h` : `${formatNumber(h)} h ${m} min`;
}

/** Importes pequeños con los decimales necesarios: «0,0018 $», «0,054 $», «12,35 $». */
export function formatCost(usd: number): string {
  const abs = Math.abs(usd);
  const max = abs === 0 ? 2 : abs < 0.01 ? 5 : abs < 1 ? 4 : 2;
  const min = abs >= 1 || abs === 0 ? 2 : 0;
  const text = new Intl.NumberFormat('es-ES', {
    useGrouping: 'always',
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  }).format(usd);
  return `${text} $`;
}
