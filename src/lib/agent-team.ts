import { z } from 'astro/zod';
import { formatNumber } from './format';
import { isoDate, type ModelPricingDetailRecord, type ModelRecord } from './schemas';

/**
 * Motor del diseñador de equipos de agentes (M8). Funciones puras, sin DOM ni React.
 *
 * Reglas, no código: las topologías (cuándo encajan, roles, gama de modelo por rol, coste y de dónde
 * salen), las señales de «no orquestar», las razones para repartir y los umbrales viven en
 * `src/data/agent-topologies.json`. Aquí no hay ningún id de modelo: cada rol pide una gama y se
 * resuelve contra `models.json`. El orden de los registros `topologia` es el orden de prueba, como en
 * la tabla de decisión de la página «Diseñador de equipos»: gana la primera que encaja.
 *
 * Es una recomendación de la guía: un punto de partida que se mide, no una sentencia. El multiplicador
 * es una estimación estructural con supuestos editables, salvo las cifras que cita un proveedor.
 */

/* ------------------------------------------------------------------ */
/* Esquema de los datos                                                */
/* ------------------------------------------------------------------ */

export const PROVIDERS = ['anthropic', 'openai', 'google'] as const;
export type AgentProvider = (typeof PROVIDERS)[number];
export const SURFACES = ['api', 'claude-code'] as const;
export type Surface = (typeof SURFACES)[number];

export const PIECE_KINDS = ['iguales', 'definidas', 'abiertas'] as const;
export const DIFFICULTIES = ['uniforme', 'mixta', 'pocas-criticas'] as const;
export const VERIFICATIONS = ['ninguna', 'revision', 'segunda-opinion'] as const;
export const ERROR_COSTS = ['bajo', 'alto'] as const;

export const PARAM_IDS = [
  'outputRatio',
  'sharedTokens',
  'planTokens',
  'verifyShare',
  'agents',
  'readings',
  'rounds',
  'easyShare',
] as const;
export type ParamId = (typeof PARAM_IDS)[number];

export const REASON_IDS = ['volumen', 'tamano', 'cola', 'revision', 'tiempo'] as const;
export type ReasonId = (typeof REASON_IDS)[number];

const SIGNAL_FIELDS = [
  'units',
  'independent',
  'chain',
  'fits',
  'dependentSteps',
  'independentPieces',
  'pieceKind',
  'difficulty',
  'verification',
  'pathKnown',
  'errorCost',
  'canWait',
  'longTail',
  'agentsTalk',
  'provider',
] as const;

const ajustesKeys = ['fitFraction', 'volumeMinUnits'] as const;

const leafSchema = z.object({
  campo: z.enum(SIGNAL_FIELDS),
  es: z.union([z.boolean(), z.string(), z.number()]).optional(),
  en: z.array(z.string()).min(1).optional(),
  min: z.union([z.number(), z.enum(ajustesKeys)]).optional(),
  max: z.union([z.number(), z.enum(ajustesKeys)]).optional(),
});
const condSchema = z.union([leafSchema, z.object({ alguna: z.array(leafSchema).min(2) })]);

const volatile = { source: z.string().min(1), verifiedAt: isoDate };

const ajustesSchema = z.object({
  id: z.literal('umbrales'),
  kind: z.literal('ajustes'),
  fitFraction: z.number().gt(0).lte(1),
  volumeMinUnits: z.number().int().min(2),
  rationale: z.string().min(1),
  ...volatile,
});

const gamaSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('gama'),
  nombre: z.string().min(1),
  tiers: z.array(z.string().min(1)).min(1),
  nota: z.string().min(1),
  ...volatile,
});

const razonSchema = z.object({
  id: z.enum(REASON_IDS),
  kind: z.literal('razon'),
  texto: z.string().min(1),
  detalle: z.string().min(1),
  pagina: z.string().min(1),
  ...volatile,
});

const senalSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('senal'),
  senal: z.string().min(1),
  significa: z.string().min(1),
  quehacer: z.string().min(1),
  cond: z.array(condSchema).optional(),
  pagina: z.string().min(1),
  ...volatile,
});

const parametroSchema = z.object({
  id: z.enum(PARAM_IDS),
  kind: z.literal('parametro'),
  etiqueta: z.string().min(1),
  ayuda: z.string().min(1),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  valor: z.number(),
  origen: z.enum(['supuesto', 'guia', 'documentacion']),
});

export const QUANTITIES = [
  'uno',
  'unidades',
  'unidades-o-grupos',
  'muestra',
  'companeros',
  'lecturas',
  'vueltas',
  'codigo',
  'persona',
] as const;
type Quantity = (typeof QUANTITIES)[number];

const roleSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1),
  funcion: z.string().min(1),
  cantidad: z.enum(QUANTITIES),
  /** Id de una gama, o `codigo` / `persona` si el puesto no lleva modelo. */
  gama: z.string().min(1),
  esfuerzo: z.enum(['defecto', 'hereda', 'ninguno']),
  /** Gama que se propone medir después (p. ej. la rápida en lectura masiva). */
  candidata: z.string().optional(),
  /** Gama a la que subir solo si falla (p. ej. la frontera). */
  escalaA: z.string().optional(),
  siguienteAjuste: z.string().min(1),
  porQue: z.string().min(1),
});

const costSpecSchema = z.object({
  tipo: z.enum(['referencia', 'sin-cifra', 'citada', 'reparto', 'votacion', 'evaluacion', 'enrutado']),
  nota: z.string().min(1),
  roles: z.record(z.string(), z.string()).optional(),
  trabajadores: z.enum(['unidad', 'grupos']).optional(),
  agentes: z.object({ min: z.number().int().positive(), max: z.number().int().positive() }).optional(),
  lotesSiEspera: z.boolean().optional(),
  fusion: z.boolean().optional(),
  params: z.array(z.object({ id: z.enum(PARAM_IDS), valor: z.number().optional() })).optional(),
  cifra: z
    .object({
      valor: z.number().positive(),
      base: z.string().min(1),
      claim: z.enum(['medicion', 'verificado']),
      texto: z.string().min(1),
      source: z.string().min(1),
    })
    .optional(),
});

const topologySchema = z.object({
  id: z.string().min(1),
  kind: z.literal('topologia'),
  nombre: z.string().min(1),
  escalon: z.number().int().min(1).max(4),
  /** `false` en los escalones que no son un equipo: ahí se avisa de que probablemente no compensa orquestar. */
  multiAgente: z.boolean(),
  diagrama: z.string().optional(),
  seleccion: z.array(condSchema),
  cuandoEncaja: z.string().min(1),
  cuandoNo: z.string().min(1),
  porQue: z.string().min(1),
  flujo: z.array(z.string().min(1)).min(1),
  roles: z.array(roleSchema).min(1),
  coste: costSpecSchema,
  limites: z.array(
    z.object({
      id: z.enum(['agentes', 'tokens']),
      max: z.number().positive(),
      texto: z.string().min(1),
      source: z.string().min(1),
    }),
  ),
  implementaciones: z
    .array(
      z.object({
        proveedor: z.enum(PROVIDERS),
        cuando: z.enum(['espera', 'ya']).optional(),
        texto: z.string().min(1),
      }),
    )
    .min(1),
  avisos: z.array(z.string().min(1)),
  masSimple: z.object({ id: z.string().nullable(), texto: z.string().min(1) }),
  pagina: z.string().min(1),
  fuentes: z.array(z.string().min(1)).min(1),
  claim: z.literal('recomendacion'),
  verifiedAt: isoDate,
});

export const recordSchema = z.discriminatedUnion('kind', [
  ajustesSchema,
  gamaSchema,
  razonSchema,
  senalSchema,
  parametroSchema,
  topologySchema,
]);

export type Cond = z.infer<typeof condSchema>;
export type Gama = z.infer<typeof gamaSchema>;
export type Reason = z.infer<typeof razonSchema>;
export type Signal = z.infer<typeof senalSchema>;
export type ParamDef = z.infer<typeof parametroSchema>;
export type RoleDef = z.infer<typeof roleSchema>;
export type Topology = z.infer<typeof topologySchema>;
export type Ajustes = z.infer<typeof ajustesSchema>;

export interface DesignerData {
  ajustes: Ajustes;
  gamas: Gama[];
  razones: Reason[];
  senales: Signal[];
  parametros: ParamDef[];
  /** En orden de prueba: gana la primera que encaja. */
  topologias: Topology[];
}

/** Valida y reparte los registros de `agent-topologies.json`. Lanza si algo no encaja (rompe el build). */
export function parseDesignerData(raw: unknown): DesignerData {
  const records = z.array(recordSchema).parse(raw);
  const ajustes = records.filter((r): r is Ajustes => r.kind === 'ajustes');
  const first = ajustes[0];
  if (ajustes.length !== 1 || !first)
    throw new Error('agent-topologies: debe haber un único registro «umbrales»');
  return {
    ajustes: first,
    gamas: records.filter((r): r is Gama => r.kind === 'gama'),
    razones: records.filter((r): r is Reason => r.kind === 'razon'),
    senales: records.filter((r): r is Signal => r.kind === 'senal'),
    parametros: records.filter((r): r is ParamDef => r.kind === 'parametro'),
    topologias: records.filter((r): r is Topology => r.kind === 'topologia'),
  };
}

/* ------------------------------------------------------------------ */
/* Modelos                                                             */
/* ------------------------------------------------------------------ */

/** Lo que el diseñador necesita de un modelo. Plano y serializable: lo construye el envoltorio. */
export interface AgentModel {
  id: string;
  name: string;
  provider: AgentProvider;
  tier: string;
  contextWindow: number;
  /** Dólares por millón de tokens. */
  priceIn: number;
  priceOut: number;
  /** Multiplicador de Batch sobre todo el coste; `null` si no hay dato verificado. */
  batchFactor: number | null;
  /** Esfuerzo por defecto por superficie (`api`, `claude-code`); vacío si el proveedor no lo publica. */
  effortDefaults: Record<string, string>;
  source: string;
  verifiedAt: string;
}

/**
 * Modelos disponibles para el diseñador: sin los de acceso limitado y sin los que no publican precio.
 * El orden es el de `models.json` (el primero de cada gama es el más reciente).
 */
export function buildAgentModels(models: ModelRecord[], details: ModelPricingDetailRecord[]): AgentModel[] {
  const out: AgentModel[] = [];
  for (const m of models) {
    if (m.status === 'acceso-limitado') continue;
    if (m.pricing.input === null || m.pricing.output === null) continue;
    const d = details.find((x) => x.modelId === m.id);
    out.push({
      id: m.id,
      name: m.name,
      provider: m.provider,
      tier: m.tier,
      contextWindow: m.contextWindow,
      priceIn: m.pricing.input,
      priceOut: m.pricing.output,
      batchFactor: d?.batchFactor ?? null,
      effortDefaults: m.effort.default,
      source: m.source,
      verifiedAt: [m.verifiedAt, d?.verifiedAt ?? ''].sort().at(-1) ?? m.verifiedAt,
    });
  }
  return out;
}

export interface GamaResolution {
  model: AgentModel;
  /** Gama de `models.json` que se ha usado. */
  tier: string;
  /** `true` si no es la primera de la lista de la gama (el proveedor no la tiene). */
  fallback: boolean;
  /** Frase para el lector si hubo sustitución. */
  note?: string;
}

/** Resuelve una gama a un modelo concreto del proveedor, o `null` si no hay ninguno. */
export function resolveGama(
  models: AgentModel[],
  provider: AgentProvider,
  gamaId: string,
  gamas: Gama[],
): GamaResolution | null {
  const gama = gamas.find((g) => g.id === gamaId);
  if (!gama) return null;
  for (const [i, tier] of gama.tiers.entries()) {
    const model = models.find((m) => m.provider === provider && m.tier === tier);
    if (model) {
      const first = gama.tiers[0] ?? tier;
      return i === 0
        ? { model, tier, fallback: false }
        : {
            model,
            tier,
            fallback: true,
            note: `El proveedor no tiene gama «${first}»: se usa «${tier}».`,
          };
    }
  }
  return null;
}

/** Esfuerzo por defecto del modelo en la superficie, o `null` si el proveedor no publica uno. */
export function defaultEffort(model: AgentModel, surface: Surface): string | null {
  return model.effortDefaults[surface] ?? model.effortDefaults['api'] ?? null;
}

/* ------------------------------------------------------------------ */
/* Entrada                                                             */
/* ------------------------------------------------------------------ */

export interface TeamInput {
  /** Número de piezas o unidades de trabajo (1 si es una sola). */
  units: number;
  /** Tamaño estimado de una unidad en tokens de entrada: un supuesto del lector. */
  unitTokens: number;
  /** ¿Cada paso necesita el resultado del anterior? */
  dependentSteps: boolean;
  /** ¿Hay piezas que se pueden hacer a la vez, sin depender unas de otras ni compartir decisiones? */
  independentPieces: boolean;
  pieceKind: (typeof PIECE_KINDS)[number];
  difficulty: (typeof DIFFICULTIES)[number];
  verification: (typeof VERIFICATIONS)[number];
  /** ¿Conoces los pasos de antemano (camino conocido) o dependen de lo que aparece (abierto)? */
  pathKnown: boolean;
  errorCost: (typeof ERROR_COSTS)[number];
  canWait: boolean;
  /** ¿Unos pocos casos concentran buena parte del gasto o del tamaño? */
  longTail: boolean;
  /** ¿Los agentes tienen que hablarse entre sí? */
  agentsTalk: boolean;
  provider: AgentProvider;
  surface: Surface;
  /** Supuestos editados por el lector; lo que falta toma el valor de la topología. */
  assumptions: Partial<Record<ParamId, number>>;
}

/** Ejemplo precargado: migrar 300 ficheros de código a otra librería. */
export const EXAMPLE_INPUT: TeamInput = {
  units: 300,
  unitTokens: 4000,
  dependentSteps: false,
  independentPieces: true,
  pieceKind: 'iguales',
  difficulty: 'uniforme',
  verification: 'revision',
  pathKnown: true,
  errorCost: 'bajo',
  canWait: false,
  longTail: false,
  agentsTalk: false,
  provider: 'anthropic',
  surface: 'claude-code',
  assumptions: {},
};

export interface FieldError {
  field: string;
  message: string;
}

export const MAX_UNITS = 1_000_000;
export const MAX_UNIT_TOKENS = 100_000_000;

/** Comprueba la entrada. Devuelve frases explicadas, nunca lanza. */
export function validateInput(input: TeamInput, parametros: ParamDef[]): FieldError[] {
  const errors: FieldError[] = [];
  if (
    !Number.isFinite(input.units) ||
    !Number.isInteger(input.units) ||
    input.units < 1 ||
    input.units > MAX_UNITS
  ) {
    errors.push({
      field: 'units',
      message: `Escribe un número entero de unidades entre 1 y ${formatNumber(MAX_UNITS)} (1 si es una sola pieza).`,
    });
  }
  if (!Number.isFinite(input.unitTokens) || input.unitTokens <= 0 || input.unitTokens > MAX_UNIT_TOKENS) {
    errors.push({
      field: 'unitTokens',
      message: `Escribe el tamaño de una unidad en tokens, mayor que 0 y como mucho ${formatNumber(MAX_UNIT_TOKENS)}.`,
    });
  }
  if (!PROVIDERS.includes(input.provider)) {
    errors.push({ field: 'provider', message: 'Elige un proveedor de la lista.' });
  }
  for (const [id, value] of Object.entries(input.assumptions) as [ParamId, number | undefined][]) {
    if (value === undefined) continue;
    const def = parametros.find((p) => p.id === id);
    if (!def) continue;
    const integer = def.step >= 1;
    if (
      !Number.isFinite(value) ||
      value < def.min ||
      value > def.max ||
      (integer && !Number.isInteger(value))
    ) {
      errors.push({
        field: `assumptions.${id}`,
        message: `«${def.etiqueta}» debe estar entre ${formatNumber(def.min)} y ${formatNumber(def.max)}${integer ? ' y ser un número entero' : ''}.`,
      });
    }
  }
  return errors;
}

/* ------------------------------------------------------------------ */
/* Señales derivadas y selección                                       */
/* ------------------------------------------------------------------ */

export interface Signals {
  units: number;
  unitTokens: number;
  /** Material total estimado: unidades × tamaño de una unidad. */
  totalTokens: number;
  contextWindow: number;
  /** Lo máximo que se considera que «cabe» en un contexto (fracción de la ventana). */
  fitLimit: number;
  fits: boolean;
  /** Piezas realmente independientes: lo has marcado y hay al menos dos. */
  independent: boolean;
  /** Cadena pura: pasos dependientes sin piezas independientes. */
  chain: boolean;
  dependentSteps: boolean;
  independentPieces: boolean;
  pieceKind: TeamInput['pieceKind'];
  difficulty: TeamInput['difficulty'];
  verification: TeamInput['verification'];
  pathKnown: boolean;
  errorCost: TeamInput['errorCost'];
  canWait: boolean;
  longTail: boolean;
  agentsTalk: boolean;
  provider: AgentProvider;
}

export function deriveSignals(input: TeamInput, contextWindow: number, ajustes: Ajustes): Signals {
  const totalTokens = input.units * input.unitTokens;
  const fitLimit = contextWindow * ajustes.fitFraction;
  const independent = input.independentPieces && input.units >= 2;
  return {
    units: input.units,
    unitTokens: input.unitTokens,
    totalTokens,
    contextWindow,
    fitLimit,
    fits: totalTokens <= fitLimit,
    independent,
    chain: input.dependentSteps && !independent,
    dependentSteps: input.dependentSteps,
    independentPieces: input.independentPieces,
    pieceKind: input.pieceKind,
    difficulty: input.difficulty,
    verification: input.verification,
    pathKnown: input.pathKnown,
    errorCost: input.errorCost,
    canWait: input.canWait,
    longTail: input.longTail,
    agentsTalk: input.agentsTalk,
    provider: input.provider,
  };
}

function threshold(value: number | (typeof ajustesKeys)[number], ajustes: Ajustes): number {
  return typeof value === 'number' ? value : ajustes[value];
}

function leafHolds(leaf: z.infer<typeof leafSchema>, s: Signals, ajustes: Ajustes): boolean {
  const actual = s[leaf.campo];
  if (leaf.es !== undefined && actual !== leaf.es) return false;
  if (leaf.en !== undefined && !leaf.en.includes(String(actual))) return false;
  if (leaf.min !== undefined && !(typeof actual === 'number' && actual >= threshold(leaf.min, ajustes)))
    return false;
  if (leaf.max !== undefined && !(typeof actual === 'number' && actual <= threshold(leaf.max, ajustes)))
    return false;
  return true;
}

/** Una condición se cumple si se cumplen todas sus restricciones; `alguna` basta con una. */
export function condHolds(cond: Cond, s: Signals, ajustes: Ajustes): boolean {
  if ('alguna' in cond) return cond.alguna.some((l) => leafHolds(l, s, ajustes));
  return leafHolds(cond, s, ajustes);
}

/** La primera topología (en orden de los datos) cuyas condiciones se cumplen todas. */
export function selectTopology(s: Signals, data: DesignerData): Topology {
  const found = data.topologias.find((t) => t.seleccion.every((c) => condHolds(c, s, data.ajustes)));
  const fallback = data.topologias.at(-1);
  if (!found && !fallback) throw new Error('agent-topologies: no hay topologías');
  return (found ?? fallback) as Topology;
}

/** Razones que justifican repartir entre varios agentes (las de la escalera y la medición de Anthropic). */
export function activeReasons(s: Signals, data: DesignerData): ReasonId[] {
  const flags: Record<ReasonId, boolean> = {
    volumen: s.independent && s.pieceKind === 'iguales' && s.units >= data.ajustes.volumeMinUnits,
    tamano: s.independent && !s.fits,
    cola: s.independent && s.longTail,
    revision: s.verification !== 'ninguna',
    tiempo: s.independent && !s.canWait,
  };
  return REASON_IDS.filter((id) => flags[id]);
}

/** Señales de «cuándo no orquestar» que se cumplen (las que llevan condición). */
export function matchingSignals(s: Signals, data: DesignerData): Signal[] {
  return data.senales.filter(
    (sig) => sig.cond !== undefined && sig.cond.every((c) => condHolds(c, s, data.ajustes)),
  );
}

/* ------------------------------------------------------------------ */
/* Coste                                                               */
/* ------------------------------------------------------------------ */

/** Dólares por token de entrada con la salida proporcional: (entrada + r × salida) / 10^6. */
export function effectivePrice(model: AgentModel, outputRatio: number): number {
  return (model.priceIn + outputRatio * model.priceOut) / 1_000_000;
}

export interface CostTerm {
  id: string;
  label: string;
  /** La cuenta con números, para que el lector la rehaga. */
  formula: string;
  /** Tokens de entrada que paga el término (la salida es r veces esto). */
  inputTokens: number;
  usd: number;
}

export interface AssumptionUsed {
  id: ParamId;
  etiqueta: string;
  valor: number;
  origen: ParamDef['origen'];
}

export type CostClaim = 'estimacion' | 'medicion' | 'referencia' | 'sin-cifra';

export const CLAIM_LABELS: Record<CostClaim, string> = {
  estimacion: 'Estimación de la guía',
  medicion: 'Medición publicada por un proveedor',
  referencia: 'Línea base',
  'sin-cifra': 'Sin cifra que sostener',
};

export interface CostResult {
  tipo: Topology['coste']['tipo'];
  claim: CostClaim;
  claimLabel: string;
  /** Frente a un solo agente con el modelo de la gama alta. */
  multiplierVsAlta: number | null;
  /** Frente a un solo agente con el modelo de la gama equilibrada (el del trabajador). */
  multiplierVsWorker: number | null;
  terms: CostTerm[];
  totalUsd: number | null;
  baselineAltaUsd: number;
  baselineWorkerUsd: number;
  baselineAltaModel: string;
  baselineWorkerModel: string;
  assumptions: AssumptionUsed[];
  formulaLines: string[];
  note: string;
  cited?: { valor: number; base: string; texto: string; claim: string; source: string };
  /** Nº de agentes que hacen el trabajo (trabajadores). */
  workers?: number;
  agentsEstimate?: number;
  tokensEstimate?: number;
  batchApplied: boolean;
}

function usdText(n: number): string {
  if (n === 0) return '0 $';
  if (n < 0.01) return 'menos de 0,01 $';
  return `${formatNumber(Math.round(n * 100) / 100, 2)} $`;
}

function numText(n: number): string {
  return formatNumber(n, 6);
}

/** Valor efectivo de cada supuesto de la topología: el del lector, el de la topología o el general. */
export function effectiveAssumptions(
  topology: Topology,
  input: TeamInput,
  parametros: ParamDef[],
): AssumptionUsed[] {
  const out: AssumptionUsed[] = [];
  for (const p of topology.coste.params ?? []) {
    const def = parametros.find((d) => d.id === p.id);
    if (!def) continue;
    out.push({
      id: p.id,
      etiqueta: def.etiqueta,
      valor: input.assumptions[p.id] ?? p.valor ?? def.valor,
      origen: def.origen,
    });
  }
  return out;
}

const roleModelKey = (topology: Topology, slot: string): string | undefined => topology.coste.roles?.[slot];

export interface CostContext {
  topology: Topology;
  input: TeamInput;
  signals: Signals;
  assumptions: AssumptionUsed[];
  /** Modelo de cada puesto de la topología (los de código y persona no tienen). */
  models: Map<string, AgentModel>;
  alta: AgentModel;
  equilibrada: AgentModel;
}

function param(ctx: CostContext, id: ParamId): number | undefined {
  return ctx.assumptions.find((a) => a.id === id)?.valor;
}

function modelOfSlot(ctx: CostContext, slot: string): AgentModel | undefined {
  const roleId = roleModelKey(ctx.topology, slot);
  return roleId ? ctx.models.get(roleId) : undefined;
}

function baseResult(ctx: CostContext, claim: CostClaim): CostResult {
  const r = param(ctx, 'outputRatio') ?? 0;
  const M = ctx.signals.totalTokens;
  return {
    tipo: ctx.topology.coste.tipo,
    claim,
    claimLabel: CLAIM_LABELS[claim],
    multiplierVsAlta: null,
    multiplierVsWorker: null,
    terms: [],
    totalUsd: null,
    baselineAltaUsd: M * effectivePrice(ctx.alta, r),
    baselineWorkerUsd: M * effectivePrice(ctx.equilibrada, r),
    baselineAltaModel: ctx.alta.name,
    baselineWorkerModel: ctx.equilibrada.name,
    assumptions: ctx.assumptions,
    formulaLines: [],
    note: ctx.topology.coste.nota,
    batchApplied: false,
  };
}

function finish(res: CostResult, terms: CostTerm[]): CostResult {
  const total = terms.reduce((acc, t) => acc + t.usd, 0);
  return {
    ...res,
    terms,
    totalUsd: total,
    multiplierVsAlta: res.baselineAltaUsd > 0 ? total / res.baselineAltaUsd : null,
    multiplierVsWorker: res.baselineWorkerUsd > 0 ? total / res.baselineWorkerUsd : null,
    tokensEstimate:
      terms.reduce((acc, t) => acc + t.inputTokens, 0) *
      (1 + (res.assumptions.find((a) => a.id === 'outputRatio')?.valor ?? 0)),
  };
}

function baselineLine(res: CostResult, r: number, M: number): string[] {
  return [
    `Línea base = un solo agente con ${res.baselineAltaModel} hace todo: ${numText(M)} tokens × ${numText(r)} (salida por entrada) → precio efectivo del modelo = ${usdText(res.baselineAltaUsd)}.`,
    `Frente al modelo del trabajador (${res.baselineWorkerModel}) solo: ${usdText(res.baselineWorkerUsd)}.`,
  ];
}

/** Calcula el coste orientativo de una topología con sus supuestos. Ver la fórmula en `formulaLines`. */
export function estimateCost(ctx: CostContext): CostResult {
  const spec = ctx.topology.coste;
  const s = ctx.signals;
  const M = s.totalTokens;
  const r = param(ctx, 'outputRatio') ?? 0;

  if (spec.tipo === 'referencia') {
    const res = baseResult(ctx, 'referencia');
    return {
      ...res,
      totalUsd: res.baselineAltaUsd,
      multiplierVsAlta: 1,
      multiplierVsWorker: res.baselineWorkerUsd > 0 ? res.baselineAltaUsd / res.baselineWorkerUsd : null,
      formulaLines: ['Es la línea base: por definición, 1× el modelo capaz solo a su esfuerzo por defecto.'],
    };
  }

  if (spec.tipo === 'sin-cifra') {
    const res = baseResult(ctx, 'sin-cifra');
    return { ...res, formulaLines: ['No hay una fórmula que se pueda sostener sin medir: ' + spec.nota] };
  }

  if (spec.tipo === 'citada') {
    const res = baseResult(ctx, 'medicion');
    if (!spec.cifra)
      throw new Error(`agent-topologies: «${ctx.topology.id}» es de coste citado y no trae cifra`);
    return {
      ...res,
      multiplierVsAlta: spec.cifra.valor,
      cited: spec.cifra,
      formulaLines: [
        `Cifra del proveedor: ${numText(spec.cifra.valor)}× ${spec.cifra.base}.`,
        'No es un cálculo sobre tu tarea: el multiplicador real depende de cuánto uses el patrón.',
      ],
    };
  }

  const res = baseResult(ctx, 'estimacion');
  const head = baselineLine(res, r, M);

  if (spec.tipo === 'reparto') {
    const worker = modelOfSlot(ctx, 'trabajador');
    if (!worker)
      throw new Error(`agent-topologies: «${ctx.topology.id}» no resuelve el modelo del trabajador`);
    const planner = modelOfSlot(ctx, 'planificador');
    const verifier = modelOfSlot(ctx, 'verificador');
    const sharedTokens = param(ctx, 'sharedTokens') ?? 0;
    const planTokens = param(ctx, 'planTokens');
    const verifyShare = param(ctx, 'verifyShare');
    const bounds = spec.agentes;
    let g: number;
    if (spec.trabajadores === 'grupos') {
      const wanted = param(ctx, 'agents') ?? bounds?.max ?? s.units;
      g = ctx.input.canWait && spec.lotesSiEspera ? s.units : Math.min(wanted, s.units);
    } else {
      g = s.units;
    }
    const batchFactor = spec.lotesSiEspera && ctx.input.canWait ? worker.batchFactor : null;
    const batchApplied = batchFactor !== null;
    const workersIn = M + g * sharedTokens;
    const workersUsd = workersIn * effectivePrice(worker, r) * (batchFactor ?? 1);
    const terms: CostTerm[] = [
      {
        id: 'trabajadores',
        label: `Trabajadores (${worker.name}, ${formatNumber(g)} ${g === 1 ? 'agente' : 'agentes'})`,
        formula: `(${numText(M)} + ${numText(g)} × ${numText(sharedTokens)}) × ${numText(effectivePrice(worker, r))} $/token${batchApplied ? ` × ${numText(batchFactor)} (Batch)` : ''}`,
        inputTokens: workersIn,
        usd: workersUsd,
      },
    ];
    if (planner && planTokens !== undefined) {
      terms.push({
        id: 'plan',
        label: `Plan (${planner.name})`,
        formula: `${numText(planTokens)} × ${numText(effectivePrice(planner, r))} $/token`,
        inputTokens: planTokens,
        usd: planTokens * effectivePrice(planner, r),
      });
    }
    if (planner && spec.fusion) {
      terms.push({
        id: 'fusion',
        label: `Fusión (${planner.name})`,
        formula: `${numText(r)} × ${numText(M)} × ${numText(effectivePrice(planner, r))} $/token`,
        inputTokens: r * M,
        usd: r * M * effectivePrice(planner, r),
      });
    }
    let verifiers = 0;
    if (verifier && verifyShare !== undefined) {
      const vin = verifyShare * (1 + r) * M;
      verifiers = Math.ceil(verifyShare * g);
      terms.push({
        id: 'verificacion',
        label: `Verificación (${verifier.name}, ${formatNumber(verifyShare * 100)} % de los resultados)`,
        formula: `${numText(verifyShare)} × (1 + ${numText(r)}) × ${numText(M)} × ${numText(effectivePrice(verifier, r))} $/token`,
        inputTokens: vin,
        usd: vin * effectivePrice(verifier, r),
      });
    }
    const out = finish({ ...res, batchApplied, workers: g }, terms);
    return {
      ...out,
      agentsEstimate: g + (planner ? 1 : 0) + verifiers,
      formulaLines: [
        ...head,
        'Coste del equipo = trabajadores + plan + fusión + verificación.',
        `Trabajadores = (material + agentes × contexto común) × precio efectivo${batchApplied ? ' × descuento de Batch' : ''}, con precio efectivo = (entrada + salida por entrada × precio de salida) / 10^6.`,
        ...terms.map((t) => `${t.label} = ${t.formula} = ${usdText(t.usd)}`),
      ],
    };
  }

  if (spec.tipo === 'votacion') {
    const reader = modelOfSlot(ctx, 'lector');
    const comparator = modelOfSlot(ctx, 'comparador');
    const K = param(ctx, 'readings');
    if (!reader || !comparator || K === undefined) {
      throw new Error(`agent-topologies: «${ctx.topology.id}» no resuelve lector, comparador o lecturas`);
    }
    const terms: CostTerm[] = [
      {
        id: 'lecturas',
        label: `${formatNumber(K)} lecturas (${reader.name})`,
        formula: `${numText(K)} × ${numText(M)} × ${numText(effectivePrice(reader, r))} $/token`,
        inputTokens: K * M,
        usd: K * M * effectivePrice(reader, r),
      },
      {
        id: 'comparacion',
        label: `Comparación (${comparator.name})`,
        formula: `${numText(K)} × ${numText(r)} × ${numText(M)} × ${numText(effectivePrice(comparator, r))} $/token`,
        inputTokens: K * r * M,
        usd: K * r * M * effectivePrice(comparator, r),
      },
    ];
    const out = finish({ ...res, workers: K }, terms);
    return {
      ...out,
      agentsEstimate: K + 1,
      formulaLines: [
        ...head,
        'Coste = N lecturas del mismo material + una comparación que lee las N respuestas.',
        ...terms.map((t) => `${t.label} = ${t.formula} = ${usdText(t.usd)}`),
      ],
    };
  }

  if (spec.tipo === 'evaluacion') {
    const writer = modelOfSlot(ctx, 'escritor');
    const reviewer = modelOfSlot(ctx, 'revisor');
    const V = param(ctx, 'rounds');
    if (!writer || !reviewer || V === undefined) {
      throw new Error(`agent-topologies: «${ctx.topology.id}» no resuelve escritor, revisor o vueltas`);
    }
    const terms: CostTerm[] = [
      {
        id: 'produccion',
        label: `Producción (${writer.name})`,
        formula: `${numText(M)} × ${numText(effectivePrice(writer, r))} $/token`,
        inputTokens: M,
        usd: M * effectivePrice(writer, r),
      },
      {
        id: 'revision',
        label: `${formatNumber(V)} vueltas de revisión como máximo (${reviewer.name})`,
        formula: `${numText(V)} × (1 + ${numText(r)}) × ${numText(M)} × ${numText(effectivePrice(reviewer, r))} $/token`,
        inputTokens: V * (1 + r) * M,
        usd: V * (1 + r) * M * effectivePrice(reviewer, r),
      },
    ];
    const out = finish({ ...res, workers: 2 }, terms);
    return {
      ...out,
      agentsEstimate: 2,
      formulaLines: [
        ...head,
        'Coste = producción + una revisión completa por vuelta (el revisor lee el material y el resultado).',
        ...terms.map((t) => `${t.label} = ${t.formula} = ${usdText(t.usd)}`),
      ],
    };
  }

  // enrutado
  const classifier = modelOfSlot(ctx, 'clasificador');
  const fast = modelOfSlot(ctx, 'rapido');
  const capable = modelOfSlot(ctx, 'capaz');
  const e = param(ctx, 'easyShare');
  if (!classifier || !fast || !capable || e === undefined) {
    throw new Error(
      `agent-topologies: «${ctx.topology.id}» no resuelve clasificador, trabajadores o reparto`,
    );
  }
  const terms: CostTerm[] = [
    {
      id: 'clasificador',
      label: `Clasificador (${classifier.name}), solo lectura`,
      formula: `${numText(M)} × ${numText(classifier.priceIn / 1_000_000)} $/token de entrada`,
      inputTokens: M,
      usd: (M * classifier.priceIn) / 1_000_000,
    },
    {
      id: 'faciles',
      label: `Casos sencillos (${fast.name}, ${numText(e)} de los casos)`,
      formula: `${numText(e)} × ${numText(M)} × ${numText(effectivePrice(fast, r))} $/token`,
      inputTokens: e * M,
      usd: e * M * effectivePrice(fast, r),
    },
    {
      id: 'dificiles',
      label: `Casos complejos (${capable.name}, ${numText(1 - e)} de los casos)`,
      formula: `${numText(1 - e)} × ${numText(M)} × ${numText(effectivePrice(capable, r))} $/token`,
      inputTokens: (1 - e) * M,
      usd: (1 - e) * M * effectivePrice(capable, r),
    },
  ];
  const out = finish({ ...res, workers: 3 }, terms);
  return {
    ...out,
    agentsEstimate: 3,
    formulaLines: [
      ...head,
      'Coste = clasificar todo + los sencillos en el modelo rápido + los complejos en el modelo capaz.',
      ...terms.map((t) => `${t.label} = ${t.formula} = ${usdText(t.usd)}`),
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Diseño completo                                                     */
/* ------------------------------------------------------------------ */

export interface Notice {
  tone: 'aviso' | 'consejo';
  text: string;
}

export interface ResolvedRole {
  id: string;
  nombre: string;
  funcion: string;
  /** «1», «300», «hasta 2»… */
  cantidad: string;
  gama: string;
  model: { id: string; name: string; tier: string } | null;
  /** «Persona», «Código» o el esfuerzo con su origen. */
  effortText: string;
  tierNote?: string;
  /** Modelo que se propone medir después, si procede. */
  candidata?: string;
  /** Modelo al que subir solo si falla, si procede. */
  escalaA?: string;
  siguienteAjuste: string;
  porQue: string;
}

export interface NoCompensa {
  titulo: string;
  texto: string;
  senales: Signal[];
}

export interface DesignResult {
  ok: true;
  input: TeamInput;
  signals: Signals;
  topology: Topology;
  /** Frase breve para la región `aria-live`. */
  summary: string;
  why: string[];
  reasons: Reason[];
  noCompensa: NoCompensa | null;
  /** Recordatorios de «antes de repartir» (señales sin condición), solo en diseños multiagente. */
  reminders: Signal[];
  roles: ResolvedRole[];
  cost: CostResult;
  notices: Notice[];
  simpler: { id: string | null; nombre: string | null; texto: string };
  implementations: string[];
  sourceIds: string[];
  verifiedAt: string;
}

export interface DesignFailure {
  ok: false;
  errors: FieldError[];
}

const NO_COMPENSA_TITLE = 'Probablemente no compensa orquestar';
const NO_COMPENSA_TEXT =
  'Quédate en el escalón más bajo que resuelva la tarea y sube solo cuando hayas visto fallar el anterior en un caso real. Construye un equipo de agentes únicamente si supera, en acierto y gasto, a un modelo solo con esfuerzo ajustado.';

function quantityText(
  q: Quantity,
  ctx: { units: number; workers: number; readings: number; rounds: number; share: number },
): string {
  switch (q) {
    case 'uno':
      return '1';
    case 'unidades':
      return formatNumber(ctx.units);
    case 'unidades-o-grupos':
      return formatNumber(ctx.workers);
    case 'muestra':
      return `Muestra del ${formatNumber(ctx.share * 100)} % de los resultados`;
    case 'companeros':
      return '3 a 5 (lo que recomienda la documentación)';
    case 'lecturas':
      return formatNumber(ctx.readings);
    case 'vueltas':
      return `hasta ${formatNumber(ctx.rounds)}`;
    case 'codigo':
      return 'Script';
    case 'persona':
      return 'Persona';
  }
}

/**
 * Diseña el equipo: valida, deriva las señales, elige la topología, resuelve los roles a modelos,
 * estima el coste y reúne avisos. No lanza con entradas del lector: devuelve `ok: false` con frases.
 */
export function designTeam(
  rawInput: TeamInput,
  data: DesignerData,
  models: AgentModel[],
): DesignResult | DesignFailure {
  const errors = validateInput(rawInput, data.parametros);
  if (errors.length > 0) return { ok: false, errors };

  const input: TeamInput = {
    ...rawInput,
    surface: rawInput.provider === 'anthropic' ? rawInput.surface : 'api',
  };
  const alta = resolveGama(models, input.provider, 'alta', data.gamas);
  const equilibrada = resolveGama(models, input.provider, 'equilibrada', data.gamas);
  if (!alta || !equilibrada) {
    return {
      ok: false,
      errors: [{ field: 'provider', message: 'No hay modelos con precio verificado para este proveedor.' }],
    };
  }

  const signals = deriveSignals(input, alta.model.contextWindow, data.ajustes);
  const topology = selectTopology(signals, data);
  const assumptions = effectiveAssumptions(topology, input, data.parametros);
  const get = (id: ParamId): number | undefined => assumptions.find((a) => a.id === id)?.valor;

  // Roles y modelos
  const roleModels = new Map<string, AgentModel>();
  const roles: ResolvedRole[] = topology.roles.map((role) => {
    const base = {
      id: role.id,
      nombre: role.nombre,
      funcion: role.funcion,
      gama: role.gama,
      siguienteAjuste: role.siguienteAjuste,
      porQue: role.porQue,
    };
    if (role.gama === 'codigo' || role.gama === 'persona') {
      return {
        ...base,
        cantidad: '',
        model: null,
        effortText: role.gama === 'codigo' ? 'Código: no lleva modelo' : 'Persona: no lleva modelo',
      };
    }
    const res = resolveGama(models, input.provider, role.gama, data.gamas);
    if (!res)
      throw new Error(
        `agent-topologies: la gama «${role.gama}» no resuelve a ningún modelo de ${input.provider}`,
      );
    roleModels.set(role.id, res.model);
    let effortText: string;
    if (role.esfuerzo === 'hereda') {
      effortText = 'Hereda el del líder';
    } else {
      const eff = defaultEffort(res.model, input.surface);
      effortText = eff
        ? `${eff} (el que trae por defecto${input.provider === 'anthropic' ? ` en ${input.surface === 'claude-code' ? 'Claude Code' : 'la API'}` : ''})`
        : 'El que trae por defecto (el proveedor no publica el nombre del nivel)';
    }
    const candidata = role.candidata ? resolveGama(models, input.provider, role.candidata, data.gamas) : null;
    const escala = role.escalaA ? resolveGama(models, input.provider, role.escalaA, data.gamas) : null;
    return {
      ...base,
      cantidad: '',
      model: { id: res.model.id, name: res.model.name, tier: res.tier },
      effortText,
      ...(res.note ? { tierNote: res.note } : {}),
      ...(candidata && candidata.model.id !== res.model.id ? { candidata: candidata.model.name } : {}),
      ...(escala && escala.model.id !== res.model.id ? { escalaA: escala.model.name } : {}),
    };
  });

  // Coste
  const cost = estimateCost({
    topology,
    input,
    signals,
    assumptions,
    models: roleModels,
    alta: alta.model,
    equilibrada: equilibrada.model,
  });

  const workers = cost.workers ?? signals.units;
  const share = get('verifyShare') ?? 0.1;
  const qctx = {
    units: signals.units,
    workers,
    readings: get('readings') ?? 3,
    rounds: get('rounds') ?? 2,
    share,
  };
  const rolesWithQty = roles.map((r, i) => ({
    ...r,
    cantidad: quantityText(topology.roles[i]?.cantidad ?? 'uno', qctx),
  }));

  // Razones y «no compensa»
  const reasons = topology.multiAgente
    ? activeReasons(signals, data)
        .map((id) => data.razones.find((r) => r.id === id))
        .filter((r): r is Reason => r !== undefined)
    : [];
  const matched = matchingSignals(signals, data);
  const noCompensa: NoCompensa | null = topology.multiAgente
    ? null
    : { titulo: NO_COMPENSA_TITLE, texto: NO_COMPENSA_TEXT, senales: matched };
  const reminders = topology.multiAgente ? data.senales.filter((s) => s.cond === undefined) : [];

  // Por qué
  const why: string[] = [topology.porQue];
  why.push(
    `Material estimado: ${formatNumber(signals.units)} × ${formatNumber(signals.unitTokens)} = ${formatNumber(signals.totalTokens)} tokens; ${
      signals.fits ? 'cabe' : 'no cabe'
    } en un contexto (se cuenta como máximo el ${formatNumber(data.ajustes.fitFraction * 100)} % de la ventana de ${formatNumber(signals.contextWindow)} tokens de ${alta.model.name}).`,
  );
  for (const reason of reasons) why.push(`Razón para repartir: ${reason.texto}.`);

  // Avisos
  const notices: Notice[] = [];
  if (input.independentPieces && input.units < 2) {
    notices.push({
      tone: 'aviso',
      text: 'Has marcado piezas independientes pero solo hay una unidad: no hay nada que repartir, así que se trata como una sola pieza.',
    });
  }
  if (input.agentsTalk && input.provider !== 'anthropic') {
    notices.push({
      tone: 'aviso',
      text: 'Los agent teams (agentes que se hablan entre sí) existen en Claude Code; con este proveedor no hay un equivalente documentado y se ignora esa respuesta.',
    });
  } else if (input.agentsTalk && !signals.independent) {
    notices.push({
      tone: 'aviso',
      text: 'Has marcado que los agentes tienen que hablarse, pero no hay piezas independientes que trabajen a la vez: se ignora esa respuesta.',
    });
  }
  if (!signals.independent && !signals.fits) {
    notices.push({
      tone: 'aviso',
      text: `El material estimado no cabe en la ventana y no hay piezas independientes: repartirlo daría piezas que comparten decisiones y divergen. Antes de repartir, comprueba si puedes partirlo en piezas que de verdad no dependan unas de otras.`,
    });
  }
  if (signals.unitTokens > signals.fitLimit) {
    notices.push({
      tone: 'aviso',
      text: `Una sola unidad (${formatNumber(signals.unitTokens)} tokens) ya supera lo que se considera que cabe en un contexto de ${alta.model.name}: trocéala antes de encargarla.`,
    });
  }
  if (input.errorCost === 'alto' && input.verification === 'ninguna') {
    notices.push({
      tone: 'aviso',
      text: 'Un fallo puede pasar desapercibido o salir caro y no has pedido verificación: añade un revisor con contexto limpio o una persona que compruebe una muestra.',
    });
  }
  if (input.verification === 'segunda-opinion' && input.errorCost === 'bajo') {
    notices.push({
      tone: 'consejo',
      text: 'Pides una segunda opinión con un error de bajo coste: varias lecturas multiplican el gasto, y probablemente no compensan si el fallo se ve y se corrige.',
    });
  }
  if (
    input.difficulty === 'mixta' &&
    topology.id !== 'enrutado' &&
    (!signals.independent || input.pieceKind !== 'iguales' || input.units < data.ajustes.volumeMinUnits)
  ) {
    notices.push({
      tone: 'consejo',
      text: `El enrutado necesita muchos casos del mismo tipo e independientes (al menos ${formatNumber(data.ajustes.volumeMinUnits)}): con tus respuestas no se aplica.`,
    });
  }
  if (topology.id === 'fanout' && input.canWait && cost.batchApplied === false) {
    notices.push({
      tone: 'consejo',
      text: 'No hay un descuento de lotes verificado para el modelo de este proveedor: el coste se estima sin descuento.',
    });
  }
  for (const a of topology.avisos) notices.push({ tone: 'consejo', text: a });
  if (topology.multiAgente) {
    for (const sig of matched) {
      if (sig.id === 's-cola') continue;
      notices.push({
        tone: 'aviso',
        text: `${sig.senal}: ${sig.significa.charAt(0).toLowerCase()}${sig.significa.slice(1)}. ${sig.quehacer}. Aquí se reparte por otras razones (volumen, tiempo o revisión), no por tamaño: mide contra el modelo solo.`,
      });
    }
  }
  const limitSources: string[] = [];
  for (const lim of topology.limites) {
    const value = lim.id === 'agentes' ? cost.agentsEstimate : cost.tokensEstimate;
    if (value !== undefined && value > lim.max) {
      notices.push({
        tone: 'aviso',
        text: `${lim.texto} Tu estimación: ${formatNumber(Math.round(value))} ${lim.id === 'agentes' ? 'agentes' : 'tokens'}.`,
      });
      limitSources.push(lim.source);
    }
  }

  // Alternativa más simple
  const simplerTopology = topology.masSimple.id
    ? (data.topologias.find((t) => t.id === topology.masSimple.id) ?? null)
    : null;

  // Implementación
  const implementations = topology.implementaciones
    .filter((i) => i.proveedor === input.provider)
    .filter((i) => i.cuando === undefined || i.cuando === (input.canWait ? 'espera' : 'ya'))
    .map((i) => i.texto);

  // Fuentes
  const sourceIds = new Set<string>(topology.fuentes);
  if (cost.cited) sourceIds.add(cost.cited.source);
  for (const id of limitSources) sourceIds.add(id);
  for (const m of new Set([...roleModels.values(), alta.model, equilibrada.model])) sourceIds.add(m.source);
  const verifiedAt =
    [topology.verifiedAt, ...[...roleModels.values(), alta.model, equilibrada.model].map((m) => m.verifiedAt)]
      .sort()
      .at(-1) ?? topology.verifiedAt;

  const costLine =
    cost.multiplierVsAlta === null
      ? 'Sin cifra de coste que sostener: mídelo con tres elementos.'
      : `Coste orientativo ≈ ${formatNumber(Math.round(cost.multiplierVsAlta * 100) / 100, 2)}× frente al modelo capaz solo (${cost.claimLabel.toLowerCase()}).`;
  const summary = topology.multiAgente
    ? `${topology.nombre}. ${costLine}`
    : `${NO_COMPENSA_TITLE}: basta con el escalón ${topology.escalon} (${topology.nombre}). ${costLine}`;

  return {
    ok: true,
    input,
    signals,
    topology,
    summary,
    why,
    reasons,
    noCompensa,
    reminders,
    roles: rolesWithQty,
    cost,
    notices,
    simpler: {
      id: simplerTopology?.id ?? null,
      nombre: simplerTopology?.nombre ?? null,
      texto: topology.masSimple.texto,
    },
    implementations,
    sourceIds: [...sourceIds],
    verifiedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Texto copiable                                                      */
/* ------------------------------------------------------------------ */

function yesNo(b: boolean): string {
  return b ? 'sí' : 'no';
}

/** El diseño como texto: sirve de encargo inicial para un modelo o para el equipo. */
export function designToText(result: DesignResult, data: DesignerData): string {
  const { input, topology, cost, signals } = result;
  const lines: string[] = [];
  lines.push(`# Diseño de equipo de agentes: ${topology.nombre}`, '');
  lines.push('## La tarea');
  lines.push(
    `- Unidades: ${formatNumber(input.units)} de unos ${formatNumber(input.unitTokens)} tokens cada una (material estimado: ${formatNumber(signals.totalTokens)} tokens; supuesto mío, no medido).`,
  );
  lines.push(
    `- Pasos dependientes: ${yesNo(input.dependentSteps)}. Piezas independientes: ${yesNo(input.independentPieces)} (${input.pieceKind}). Camino ${input.pathKnown ? 'conocido' : 'abierto'}.`,
  );
  lines.push(
    `- Verificación independiente: ${input.verification}. Coste de un error: ${input.errorCost}. Puede esperar horas: ${yesNo(input.canWait)}.`,
  );
  lines.push(
    `- Proveedor: ${input.provider}${input.provider === 'anthropic' ? ` (${input.surface})` : ''}.`,
    '',
  );
  if (result.noCompensa) {
    lines.push(`## ${result.noCompensa.titulo}`, result.noCompensa.texto);
    for (const s of result.noCompensa.senales) lines.push(`- ${s.senal}: ${s.significa}. ${s.quehacer}.`);
    lines.push('');
  }
  lines.push('## Topología recomendada', ...result.why.map((w) => `- ${w}`), '');
  lines.push('## Flujo', ...topology.flujo.map((f, i) => `${i + 1}. ${f}`), '');
  lines.push('## Roles');
  for (const r of result.roles) {
    const model = r.model ? `${r.model.name}, esfuerzo ${r.effortText}` : r.effortText;
    lines.push(`- ${r.nombre} (${r.cantidad}): ${model}. ${r.funcion} ${r.porQue}`);
  }
  lines.push('');
  lines.push(`## Coste orientativo (${cost.claimLabel})`);
  if (cost.multiplierVsAlta !== null) {
    lines.push(
      `- ≈ ${formatNumber(Math.round(cost.multiplierVsAlta * 100) / 100, 2)}× frente a ${cost.baselineAltaModel} solo.`,
    );
  }
  if (cost.multiplierVsWorker !== null) {
    lines.push(
      `- ≈ ${formatNumber(Math.round(cost.multiplierVsWorker * 100) / 100, 2)}× frente a ${cost.baselineWorkerModel} solo.`,
    );
  }
  for (const l of cost.formulaLines) lines.push(`- ${l}`);
  for (const a of cost.assumptions) lines.push(`- Supuesto: ${a.etiqueta} = ${formatNumber(a.valor)}.`);
  lines.push(`- ${cost.note}`, '');
  if (result.notices.length > 0) {
    lines.push('## Avisos', ...result.notices.map((n) => `- ${n.text}`), '');
  }
  lines.push(
    `## Alternativa más simple`,
    `- ${result.simpler.nombre ? `${result.simpler.nombre}: ` : ''}${result.simpler.texto}`,
    '',
  );
  lines.push(
    '## Antes de lanzar',
    '- Depura el encargo con uno o dos elementos y estima el coste con tres antes de escalar.',
    '- Mide el modelo capaz solo, a su esfuerzo por defecto y a uno más bajo, en cinco casos reales con los difíciles incluidos.',
    '- Fija un tope de agentes, de vueltas o de gasto y verifica el resultado antes de usarlo.',
    '- Cada encargo lleva: objetivo, contexto, ficheros o fuentes, límites, formato de retorno y criterio de terminado.',
    '',
    `Recomendación de la guía (no una medición sobre tu caso). Umbrales: cabe = hasta el ${formatNumber(data.ajustes.fitFraction * 100)} % de la ventana; volumen = ${formatNumber(data.ajustes.volumeMinUnits)} unidades iguales o más.`,
  );
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Coherencia de los datos                                             */
/* ------------------------------------------------------------------ */

/**
 * Problemas de coherencia entre los datos del diseñador, los modelos y las fuentes. Vacío si todo
 * encaja; el envoltorio lo convierte en un error de compilación.
 */
export function validateDesignerData(
  data: DesignerData,
  models: AgentModel[],
  sourceIds: Iterable<string>,
): string[] {
  const problems: string[] = [];
  const sources = new Set(sourceIds);
  const topologyIds = new Set(data.topologias.map((t) => t.id));
  const gamaIds = new Set(data.gamas.map((g) => g.id));
  const checkSource = (where: string, id: string) => {
    if (!sources.has(id)) problems.push(`${where}: la fuente «${id}» no existe en sources.json`);
  };

  for (const g of ['alta', 'equilibrada', 'rapida', 'frontera']) {
    if (!gamaIds.has(g)) problems.push(`falta la gama «${g}»`);
  }
  for (const p of PARAM_IDS) {
    if (!data.parametros.some((d) => d.id === p)) problems.push(`falta el parámetro «${p}»`);
  }
  for (const r of REASON_IDS) {
    if (!data.razones.some((d) => d.id === r)) problems.push(`falta la razón «${r}»`);
  }
  for (const rec of [data.ajustes, ...data.gamas, ...data.razones, ...data.senales])
    checkSource(rec.id, rec.source);
  for (const t of data.topologias) {
    for (const f of t.fuentes) checkSource(t.id, f);
    for (const l of t.limites) checkSource(`${t.id}.limites`, l.source);
    if (t.coste.cifra) checkSource(`${t.id}.cifra`, t.coste.cifra.source);
    if (t.masSimple.id !== null && !topologyIds.has(t.masSimple.id)) {
      problems.push(`${t.id}: la alternativa más simple «${t.masSimple.id}» no existe`);
    }
    const roleIds = new Set(t.roles.map((r) => r.id));
    for (const r of t.roles) {
      for (const g of [r.gama, r.candidata, r.escalaA]) {
        if (g === undefined || g === 'codigo' || g === 'persona') continue;
        if (!gamaIds.has(g)) problems.push(`${t.id}.${r.id}: la gama «${g}» no existe`);
      }
    }
    for (const [slot, roleId] of Object.entries(t.coste.roles ?? {})) {
      if (!roleIds.has(roleId))
        problems.push(`${t.id}: el puesto de coste «${slot}» apunta a un rol inexistente «${roleId}»`);
    }
    for (const p of t.coste.params ?? []) {
      if (!data.parametros.some((d) => d.id === p.id))
        problems.push(`${t.id}: parámetro «${p.id}» desconocido`);
    }
    if (t.coste.tipo === 'citada' && !t.coste.cifra) problems.push(`${t.id}: coste citado sin cifra`);
    if (t.coste.tipo === 'reparto' && !t.coste.roles?.['trabajador'])
      problems.push(`${t.id}: coste de reparto sin trabajador`);
  }
  if (data.topologias.at(-1)?.seleccion.length !== 0) {
    problems.push('la última topología debe ser la de reserva (sin condiciones)');
  }
  for (const provider of PROVIDERS) {
    for (const g of data.gamas) {
      if (!resolveGama(models, provider, g.id, data.gamas)) {
        problems.push(`la gama «${g.id}» no resuelve a ningún modelo de ${provider}`);
      }
    }
    for (const t of data.topologias) {
      for (const r of t.roles) {
        if (r.gama === 'codigo' || r.gama === 'persona') continue;
        if (!resolveGama(models, provider, r.gama, data.gamas)) {
          problems.push(`${t.id}.${r.id}: la gama «${r.gama}» no resuelve a ningún modelo de ${provider}`);
        }
      }
    }
  }
  return problems;
}
