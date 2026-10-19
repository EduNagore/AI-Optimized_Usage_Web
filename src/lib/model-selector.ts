import { z } from 'astro/zod';
import { formatDate, formatNumber, formatTokens, formatUsd } from './format';
import {
  isoDate,
  type EffortRecord,
  type ModelPricingDetailRecord,
  type ModelRecord,
  type SourceRecord,
  type TaskMatrixRecord,
} from './schemas';

/**
 * Motor del selector de modelo y esfuerzo. Funciones puras, sin DOM ni React.
 *
 * Reglas, no código: la fila de `task-matrix.json` aporta superficie, modelos, esfuerzo y verificación;
 * los modificadores (dificultad, volumen, latencia, coste del error, datos sensibles) y la tabla de
 * decisión de «otra tarea» viven en `src/data/selector-rules.json`. Aquí no hay ningún id de modelo
 * ni nivel de esfuerzo: todo se resuelve contra `models.json` y `effort.json`.
 * Es una recomendación de la guía: un punto de partida que se mide, no una sentencia.
 */

/* ------------------------------------------------------------------ */
/* Esquema de las reglas                                               */
/* ------------------------------------------------------------------ */

export const ANSWER_FIELDS = [
  'reasoning',
  'difficulty',
  'volume',
  'latency',
  'errorCost',
  'sensitive',
] as const;
export type AnswerField = (typeof ANSWER_FIELDS)[number];
export type Mode = 'task' | 'generic';
/** Id reservado de la opción «otra tarea». */
export const OTHER_TASK_ID = 'otra';
/** Valor de esfuerzo de una fila genérica que significa «el que trae el modelo». */
export const DEFAULT_EFFORT = 'default';

const fieldEnum = z.enum(ANSWER_FIELDS);
const modeEnum = z.enum(['task', 'generic']);
const modesDefault = z.array(modeEnum).min(1).default(['task', 'generic']);
const claimEnum = z.enum(['verificado', 'medicion', 'recomendacion']);

const optionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  hint: z.string().optional(),
});

const questionFieldSchema = z.object({
  field: fieldEnum,
  label: z.string().min(1),
  hint: z.string().optional(),
  modes: z.array(modeEnum).min(1),
  control: z.enum(['select', 'checkbox']),
  default: z.string().min(1),
  options: z.array(optionSchema).min(2),
});

const questionsSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('questions'),
  taskLabel: z.string().min(1),
  taskHint: z.string().min(1),
  otherLabel: z.string().min(1),
  otherTitle: z.string().min(1),
  otherHint: z.string().min(1),
  fields: z.array(questionFieldSchema).min(1),
  example: z.object({ taskId: z.string().min(1), answers: z.record(z.string(), z.string()) }),
});

const policySchema = z.object({
  id: z.string().min(1),
  kind: z.literal('policy'),
  /** Gamas de menor a mayor capacidad, con el nombre de `tier` de `models.json`. */
  tierLadder: z.array(z.string().min(1)).min(2),
  /** Niveles que no forman parte de la escalera de esfuerzo (p. ej. el que desactiva el razonamiento). */
  effortExcluded: z.array(z.string()),
  /** Orden de claves de `effort.default` al elegir «el esfuerzo por defecto» de un modelo. */
  defaultKeyPriority: z.array(z.string()).min(1),
  defaultKeyLabels: z.record(z.string(), z.string()),
  /** Nivel con el que se compara una fila de esfuerzo «por defecto» al elegir la más capaz. */
  defaultEffortRankAs: z.string().min(1),
  providerNames: z.record(z.string(), z.string()),
  repetitionOf: z.record(z.string(), z.enum(['alta', 'baja'])),
  texts: z.record(z.string(), z.string()),
});

const effectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('effort-step'), steps: z.number().int(), modes: modesDefault }),
  z.object({ type: z.literal('effort-floor'), level: z.string().min(1), modes: modesDefault }),
  z.object({ type: z.literal('tier-floor'), tier: z.string().min(1), modes: modesDefault }),
  z.object({ type: z.literal('batch'), modes: modesDefault }),
  z.object({
    type: z.literal('notice'),
    tone: z.enum(['aviso', 'consejo']),
    text: z.string().min(1),
    target: z.enum(['general', 'cheaper', 'stronger']).default('general'),
    modes: modesDefault,
  }),
]);

const modifierSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('modifier'),
  title: z.string().min(1),
  when: z.object({
    all: z.array(z.object({ field: fieldEnum, in: z.array(z.string().min(1)).min(1) })).min(1),
  }),
  effects: z.array(effectSchema).min(1),
  why: z.string().min(1),
  claim: claimEnum,
  sources: z.array(z.string()).default([]),
  verifiedAt: isoDate,
});

const genericSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('generic'),
  reasoning: z.string().min(1),
  errorCost: z.string().min(1),
  repetition: z.enum(['alta', 'baja', 'cualquiera']),
  /** Gamas válidas; la primera es el punto de partida. */
  tiers: z.array(z.string().min(1)).min(1),
  /** Nivel de esfuerzo o `default`. */
  effort: z.string().min(1),
  why: z.string().min(1),
  verification: z.string().optional(),
  notes: z.array(z.string()).default([]),
  verifiedAt: isoDate,
});

const recordSchema = z.discriminatedUnion('kind', [
  questionsSchema,
  policySchema,
  modifierSchema,
  genericSchema,
]);

export type QuestionField = z.infer<typeof questionFieldSchema>;
export type QuestionsRecord = z.infer<typeof questionsSchema>;
export type PolicyRecord = z.infer<typeof policySchema>;
export type Effect = z.infer<typeof effectSchema>;
export type ModifierRecord = z.infer<typeof modifierSchema>;
export type GenericRecord = z.infer<typeof genericSchema>;

export interface SelectorRules {
  questions: QuestionsRecord;
  policy: PolicyRecord;
  modifiers: ModifierRecord[];
  generics: GenericRecord[];
}

/** Valida y agrupa `selector-rules.json`. Lanza si el fichero no cumple el esquema (rompe el build). */
export function parseRules(raw: unknown): SelectorRules {
  const records = z.array(recordSchema).parse(raw);
  const questions = records.filter((r): r is QuestionsRecord => r.kind === 'questions');
  const policy = records.filter((r): r is PolicyRecord => r.kind === 'policy');
  const first = questions[0];
  const second = policy[0];
  if (questions.length !== 1 || policy.length !== 1 || !first || !second) {
    throw new Error('selector-rules.json: debe haber exactamente un registro «questions» y uno «policy»');
  }
  return {
    questions: first,
    policy: second,
    modifiers: records.filter((r): r is ModifierRecord => r.kind === 'modifier'),
    generics: records.filter((r): r is GenericRecord => r.kind === 'generic'),
  };
}

/* ------------------------------------------------------------------ */
/* Datos                                                               */
/* ------------------------------------------------------------------ */

export interface SourceRef {
  title: string;
  url: string;
}

export interface SelectorModel {
  id: string;
  name: string;
  provider: string;
  tier: string;
  status: ModelRecord['status'];
  /** Dólares por millón de tokens; `null` si no hay precio publicado. */
  prices: { input: number | null; output: number | null };
  /** Niveles de esfuerzo verificados (vacío: no admite o no está verificado). */
  effortLevels: string[];
  /** Esfuerzo por defecto por superficie (`api`, `claude-code`…); vacío si no está publicado. */
  effortDefaults: Record<string, string>;
  /** Multiplicador de Batch; `null` si no hay dato verificado. */
  batchFactor: number | null;
  longContext?: { thresholdTokens: number; input: number; output: number };
  scheduledChange?: { effectiveFrom: string; input: number; output: number };
  sources: string[];
  verifiedAt: string;
}

export interface SelectorTask {
  id: string;
  taskType: string;
  examples: string[];
  surface: string;
  models: string[];
  effort: string;
  verification: string;
  /** Razonamiento de la fila, sin la cola «Fuentes: …». */
  why: string;
  sourceIds: string[];
  verifiedAt: string;
}

export interface SelectorData {
  rules: SelectorRules;
  models: SelectorModel[];
  tasks: SelectorTask[];
  /** Niveles de esfuerzo de todos los proveedores, de menor a mayor. */
  effortOrder: string[];
  /** Fuentes citadas por modelos, filas y reglas. */
  sources: Record<string, SourceRef>;
}

/** Separa el razonamiento de una fila de la cola «Fuentes: a, b.» (convención de `task-matrix.json`). */
export function parseRationale(rationale: string): { why: string; sourceIds: string[] } {
  const [why = '', tail = ''] = rationale.split(/\s*Fuentes:\s*/);
  const sourceIds = tail
    .replace(/\.\s*$/, '')
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { why: why.trim(), sourceIds };
}

/** Orden global de los niveles de esfuerzo: parte de la lista más larga e intercala las demás. */
export function deriveEffortOrder(effort: EffortRecord[]): string[] {
  const lists = effort.map((e) => e.levels.map((l) => l.name)).sort((a, b) => b.length - a.length);
  const order: string[] = [];
  for (const list of lists) {
    list.forEach((name, i) => {
      if (order.includes(name)) return;
      const prev = list[i - 1];
      const at = prev === undefined ? 0 : order.indexOf(prev) + 1;
      order.splice(at, 0, name);
    });
  }
  return order;
}

export function buildSelectorModels(
  models: ModelRecord[],
  details: ModelPricingDetailRecord[],
): SelectorModel[] {
  const byModel = new Map(details.map((d) => [d.modelId, d]));
  return models.map((m) => {
    const d = byModel.get(m.id);
    const out: SelectorModel = {
      id: m.id,
      name: m.name,
      provider: m.provider,
      tier: m.tier,
      status: m.status,
      prices: { input: m.pricing.input, output: m.pricing.output },
      effortLevels: m.effort.levels,
      effortDefaults: m.effort.default,
      batchFactor: d?.batchFactor ?? null,
      sources: [...new Set([m.source, ...(d ? [d.source] : [])])],
      verifiedAt: [m.verifiedAt, ...(d ? [d.verifiedAt] : [])].sort().at(-1) ?? m.verifiedAt,
    };
    if (d?.longContext) {
      out.longContext = {
        thresholdTokens: d.longContext.thresholdTokens,
        input: d.longContext.input,
        output: d.longContext.output,
      };
    }
    if (d?.scheduledChange) {
      out.scheduledChange = {
        effectiveFrom: d.scheduledChange.effectiveFrom,
        input: d.scheduledChange.input,
        output: d.scheduledChange.output,
      };
    }
    return out;
  });
}

export function buildSelectorData(args: {
  rawRules: unknown;
  models: ModelRecord[];
  details: ModelPricingDetailRecord[];
  effort: EffortRecord[];
  tasks: TaskMatrixRecord[];
  sources: SourceRecord[];
}): SelectorData {
  const rules = parseRules(args.rawRules);
  const models = buildSelectorModels(args.models, args.details);
  const tasks: SelectorTask[] = args.tasks.map((t) => {
    const { why, sourceIds } = parseRationale(t.rationale);
    return {
      id: t.id,
      taskType: t.taskType,
      examples: t.examples,
      surface: t.surface,
      models: t.models,
      effort: t.effort,
      verification: t.verification,
      why,
      sourceIds,
      verifiedAt: t.verifiedAt,
    };
  });
  const wanted = new Set<string>();
  for (const m of models) m.sources.forEach((s) => wanted.add(s));
  for (const t of tasks) t.sourceIds.forEach((s) => wanted.add(s));
  for (const r of rules.modifiers) r.sources.forEach((s) => wanted.add(s));
  const sources: Record<string, SourceRef> = {};
  for (const s of args.sources) if (wanted.has(s.id)) sources[s.id] = { title: s.title, url: s.url };
  return { rules, models, tasks, effortOrder: deriveEffortOrder(args.effort), sources };
}

/* ------------------------------------------------------------------ */
/* Comprobación de coherencia de los datos                             */
/* ------------------------------------------------------------------ */

/** Vacío si los datos son coherentes. El envoltorio `.astro` lanza si no lo está. */
export function validateSelectorData(data: SelectorData): string[] {
  const { rules, models, tasks, effortOrder } = data;
  const { questions, policy } = rules;
  const problems: string[] = [];
  const add = (msg: string) => problems.push(msg);
  const tiers = new Set(models.map((m) => m.tier));
  const ladder = new Set(policy.tierLadder);

  for (const t of policy.tierLadder)
    if (!tiers.has(t)) add(`policy: la gama «${t}» no existe en models.json`);
  for (const l of policy.effortExcluded)
    if (!effortOrder.includes(l)) add(`policy: el nivel «${l}» no existe`);
  if (!effortOrder.includes(policy.defaultEffortRankAs)) add('policy: defaultEffortRankAs no es un nivel');
  for (const m of models) {
    for (const l of m.effortLevels)
      if (!effortOrder.includes(l)) add(`${m.id}: el nivel «${l}» no está en effort.json`);
    if (!(m.provider in policy.providerNames)) add(`policy: falta el nombre del proveedor «${m.provider}»`);
  }
  for (const key of REQUIRED_TEXTS) if (!(key in policy.texts)) add(`policy.texts: falta «${key}»`);

  // Preguntas.
  const fieldByName = new Map(questions.fields.map((f) => [f.field, f]));
  for (const name of ANSWER_FIELDS) if (!fieldByName.has(name)) add(`questions: falta el campo «${name}»`);
  for (const f of questions.fields) {
    if (!f.options.some((o) => o.value === f.default))
      add(`questions.${f.field}: el valor por defecto no es una opción`);
  }
  const volume = fieldByName.get('volume');
  for (const o of volume?.options ?? []) {
    if (!(o.value in policy.repetitionOf)) add(`policy.repetitionOf: falta «${o.value}»`);
  }
  if (!tasks.some((t) => t.id === questions.example.taskId) && questions.example.taskId !== OTHER_TASK_ID) {
    add('questions.example: la tarea de ejemplo no existe');
  }
  for (const [field, value] of Object.entries(questions.example.answers)) {
    const f = fieldByName.get(field as AnswerField);
    if (!f || !f.options.some((o) => o.value === value))
      add(`questions.example: «${field}=${value}» no es válido`);
  }

  // Filas de la matriz.
  if (tasks.some((t) => t.id === OTHER_TASK_ID)) add(`task-matrix: el id «${OTHER_TASK_ID}» está reservado`);
  for (const t of tasks) {
    if (t.models.length === 0) add(`${t.id}: sin modelos`);
    for (const id of t.models) {
      const m = models.find((x) => x.id === id);
      if (!m) add(`${t.id}: el modelo «${id}» no existe`);
      else if (m.status === 'acceso-limitado') add(`${t.id}: el modelo «${id}» es de acceso limitado`);
      else if (!ladder.has(m.tier)) add(`${t.id}: el modelo «${id}» no es de una gama vigente (${m.tier})`);
    }
    if (!effortOrder.includes(t.effort)) add(`${t.id}: el esfuerzo «${t.effort}» no existe`);
    for (const s of t.sourceIds) if (!(s in data.sources)) add(`${t.id}: la fuente «${s}» no existe`);
  }
  // Un solo modelo vigente por proveedor y gama (los que usa la matriz).
  const seen = new Map<string, string>();
  for (const m of currentModels(data)) {
    const key = `${m.provider}/${m.tier}`;
    const other = seen.get(key);
    if (other) add(`la matriz usa dos modelos de ${key}: ${other} y ${m.id}`);
    seen.set(key, m.id);
  }
  for (const m of models)
    for (const s of m.sources) if (!(s in data.sources)) add(`${m.id}: la fuente «${s}» no existe`);

  // Modificadores.
  for (const r of rules.modifiers) {
    for (const c of r.when.all) {
      const f = fieldByName.get(c.field);
      for (const v of c.in)
        if (!f?.options.some((o) => o.value === v)) add(`${r.id}: «${c.field}=${v}» no es una opción`);
    }
    for (const e of r.effects) {
      if (e.type === 'effort-floor' && !effortOrder.includes(e.level))
        add(`${r.id}: el nivel «${e.level}» no existe`);
      if (e.type === 'tier-floor' && !ladder.has(e.tier))
        add(`${r.id}: la gama «${e.tier}» no está en la escalera`);
    }
    for (const s of r.sources) if (!(s in data.sources)) add(`${r.id}: la fuente «${s}» no existe`);
  }

  // Tabla de decisión.
  const reasoning = fieldByName.get('reasoning');
  const errorCost = fieldByName.get('errorCost');
  const combos = new Set<string>();
  for (const g of rules.generics) {
    if (!reasoning?.options.some((o) => o.value === g.reasoning))
      add(`${g.id}: razonamiento «${g.reasoning}» no válido`);
    if (!errorCost?.options.some((o) => o.value === g.errorCost))
      add(`${g.id}: coste del error «${g.errorCost}» no válido`);
    for (const t of g.tiers) if (!ladder.has(t)) add(`${g.id}: la gama «${t}» no está en la escalera`);
    if (g.effort !== DEFAULT_EFFORT && !effortOrder.includes(g.effort))
      add(`${g.id}: el nivel «${g.effort}» no existe`);
    for (const rep of g.repetition === 'cualquiera' ? ['alta', 'baja'] : [g.repetition]) {
      const key = `${g.reasoning}/${g.errorCost}/${rep}`;
      if (combos.has(key)) add(`tabla de decisión: la combinación ${key} aparece dos veces`);
      combos.add(key);
    }
  }
  return problems;
}

/** Claves de texto que el motor y la interfaz necesitan en `policy.texts`. */
export const REQUIRED_TEXTS = [
  'disclaimer',
  'startRule',
  'measureStart',
  'genericSurface',
  'genericVerification',
  'genericDoubt',
  'legacyModel',
  'effortUnverified',
  'effortAdjusted',
  'defaultUnpublished',
  'tierSkipped',
  'tierFloorSwap',
  'effortFloorRaised',
  'noBatchData',
  'limitedExcluded',
  'noCheaperBottom',
  'noCheaperFloor',
  'noStrongerTop',
  'cheaperEffortWhat',
  'cheaperTierWhat',
  'strongerEffortWhat',
  'strongerTierWhat',
  'cheaperEffortMeasure',
  'cheaperTierMeasure',
  'strongerEffortWhen',
  'strongerTierWhen',
  'cheaperEffortNote',
  'strongerEffortNote',
  'priceRatio',
  'priceIntro',
  'priceLong',
  'batchLine',
] as const;

/* ------------------------------------------------------------------ */
/* Respuestas                                                          */
/* ------------------------------------------------------------------ */

export type Answers = { taskId: string } & Record<AnswerField, string>;

/** Respuestas neutras: con ellas, una tarea devuelve exactamente su fila de la matriz. */
export function defaultAnswers(rules: SelectorRules, taskId: string): Answers {
  const base = { taskId } as Answers;
  for (const f of rules.questions.fields) base[f.field] = f.default;
  return base;
}

/** Estado inicial de la interfaz: la tarea de ejemplo con sus respuestas. */
export function exampleAnswers(rules: SelectorRules): Answers {
  const a = defaultAnswers(rules, rules.questions.example.taskId);
  for (const [k, v] of Object.entries(rules.questions.example.answers)) {
    if ((ANSWER_FIELDS as readonly string[]).includes(k)) a[k as AnswerField] = v;
  }
  return a;
}

export function modeOf(answers: Answers): Mode {
  return answers.taskId === OTHER_TASK_ID ? 'generic' : 'task';
}

/** Campos que se preguntan en cada modo. */
export function fieldsFor(rules: SelectorRules, mode: Mode): QuestionField[] {
  return rules.questions.fields.filter((f) => f.modes.includes(mode));
}

/** Errores de entrada explicados en una frase; vacío si las respuestas son válidas. */
export function checkAnswers(answers: Answers, data: SelectorData): string[] {
  const errors: string[] = [];
  if (answers.taskId !== OTHER_TASK_ID && !data.tasks.some((t) => t.id === answers.taskId)) {
    errors.push(
      `El tipo de tarea «${answers.taskId}» no existe: elige uno de la lista o «${data.rules.questions.otherLabel}».`,
    );
  }
  for (const f of fieldsFor(data.rules, modeOf(answers))) {
    if (!f.options.some((o) => o.value === answers[f.field])) {
      errors.push(`La respuesta «${answers[f.field]}» no es válida en «${f.label}».`);
    }
  }
  return errors;
}

/* ------------------------------------------------------------------ */
/* Resultado                                                           */
/* ------------------------------------------------------------------ */

export interface PickEffort {
  /** Nivel propuesto; `null` si no está verificado o no hay valor por defecto publicado. */
  level: string | null;
  status: 'ok' | 'adjusted' | 'unverified' | 'default-unpublished';
  /** Nivel que se pidió antes de adaptarlo al modelo. */
  requested: string | null;
  /** `true` si un mínimo (p. ej. por un error caro) ha subido el nivel. */
  raisedByFloor: boolean;
  /** Esfuerzo por defecto del modelo, por superficie. */
  defaults: { key: string; label: string; level: string }[];
}

export interface Pick {
  model: SelectorModel;
  /** Primer modelo de su proveedor. */
  primary: boolean;
  effort: PickEffort;
  /** `true` si su gama no figura entre las vigentes (generación anterior). */
  legacy: boolean;
}

export interface AlternativeOption {
  kind: 'effort' | 'tier';
  model: SelectorModel;
  level: string | null;
  what: string;
  /** Cheaper: con qué medirla antes de adoptarla. Stronger: cuándo merece la pena. */
  guidance: string;
  notes: string[];
}

export type Alternative =
  { available: true; option: AlternativeOption } | { available: false; reason: string };

export interface ProviderAlternatives {
  provider: string;
  providerName: string;
  from: { model: SelectorModel; level: string | null };
  cheaper: Alternative;
  stronger: Alternative;
}

export interface Notice {
  tone: 'aviso' | 'consejo';
  text: string;
  target: 'general' | 'cheaper' | 'stronger';
}

export interface AppliedRule {
  id: string;
  title: string;
  why: string;
  claim: ModifierRecord['claim'];
  sources: string[];
}

export interface BatchSuggestion {
  items: { model: SelectorModel; factor: number; input: number | null; output: number | null }[];
  /** Nombres de los proveedores sin dato verificado de lotes. */
  unavailable: string[];
}

export interface Recommendation {
  mode: Mode;
  title: string;
  /** Id de la fila de la matriz o de la tabla de decisión que se ha usado. */
  rowId: string;
  surface: string;
  /** `false` en «otra tarea»: la tabla de decisión no fija la superficie. */
  surfaceFixed: boolean;
  picks: Pick[];
  verification: string;
  reasoning: string[];
  rules: AppliedRule[];
  notices: Notice[];
  alternatives: ProviderAlternatives[];
  batch: BatchSuggestion | null;
  /** Fuentes de los precios y niveles de esfuerzo mostrados. */
  priceSourceIds: string[];
  pricesVerifiedAt: string;
  /** Fuentes en las que se apoya la recomendación de la guía. */
  guideSourceIds: string[];
  guideVerifiedAt: string;
  /** Solo en «otra tarea»: filas de la tabla consideradas y si la combinación figuraba en ella. */
  tableMatch?: { exact: boolean; considered: string[] };
  disclaimer: string;
}

export type RecommendResult = { ok: true; recommendation: Recommendation } | { ok: false; errors: string[] };

/* ------------------------------------------------------------------ */
/* Motor                                                               */
/* ------------------------------------------------------------------ */

interface CurrentEntry {
  rank: number;
  model: SelectorModel;
}

interface Ctx {
  data: SelectorData;
  order: string[];
  excluded: Set<string>;
  tierRank: (tier: string) => number;
  /** Modelos vigentes por proveedor, de menor a mayor gama. */
  current: Map<string, CurrentEntry[]>;
  text: (key: string, vars?: Record<string, string>) => string;
}

interface Plan {
  effortSteps: number;
  effortFloor: string | null;
  tierFloor: string | null;
  batch: boolean;
}

function fill(template: string, vars: Record<string, string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}

/** Modelos «vigentes»: los que la matriz recomienda, de gama conocida y sin acceso limitado. */
export function currentModels(data: SelectorData): SelectorModel[] {
  const ladder = new Set(data.rules.policy.tierLadder);
  const ids = new Set(data.tasks.flatMap((t) => t.models));
  return data.models.filter((m) => ids.has(m.id) && m.status !== 'acceso-limitado' && ladder.has(m.tier));
}

function makeCtx(data: SelectorData): Ctx {
  const { policy } = data.rules;
  const rankOf = (tier: string) => policy.tierLadder.indexOf(tier);
  const current = new Map<string, CurrentEntry[]>();
  for (const model of currentModels(data)) {
    const list = current.get(model.provider) ?? [];
    if (!list.some((e) => e.rank === rankOf(model.tier))) list.push({ rank: rankOf(model.tier), model });
    current.set(model.provider, list);
  }
  for (const list of current.values()) list.sort((a, b) => a.rank - b.rank);
  return {
    data,
    order: data.effortOrder,
    excluded: new Set(policy.effortExcluded),
    tierRank: rankOf,
    current,
    text: (key, vars) => fill(policy.texts[key] ?? key, vars),
  };
}

/** Escalera de esfuerzo del modelo: sus niveles verificados, sin los excluidos, de menor a mayor. */
function ladderOf(model: SelectorModel, ctx: Ctx): string[] {
  return model.effortLevels
    .filter((l) => !ctx.excluded.has(l) && ctx.order.includes(l))
    .sort((a, b) => ctx.order.indexOf(a) - ctx.order.indexOf(b));
}

function defaultsOf(model: SelectorModel, ctx: Ctx): PickEffort['defaults'] {
  const { defaultKeyPriority, defaultKeyLabels } = ctx.data.rules.policy;
  const keys = [
    ...defaultKeyPriority.filter((k) => k in model.effortDefaults),
    ...Object.keys(model.effortDefaults).filter((k) => !defaultKeyPriority.includes(k)),
  ];
  return keys.flatMap((key) => {
    const level = model.effortDefaults[key];
    return level === undefined ? [] : [{ key, label: defaultKeyLabels[key] ?? key, level }];
  });
}

/** «high (API) · medium (Claude Code)» o «no publicado». */
export function formatDefaults(defaults: PickEffort['defaults']): string {
  return defaults.length === 0 ? 'no publicado' : defaults.map((d) => `${d.level} (${d.label})`).join(' · ');
}

function nearestIndex(ladder: string[], order: string[], name: string): { index: number; adjusted: boolean } {
  const exact = ladder.indexOf(name);
  if (exact >= 0) return { index: exact, adjusted: false };
  const rank = order.indexOf(name);
  if (rank < 0) return { index: 0, adjusted: true };
  let best = 0;
  let bestDistance = Infinity;
  ladder.forEach((l, i) => {
    const d = Math.abs(order.indexOf(l) - rank);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  });
  return { index: best, adjusted: true };
}

/** Primer índice de la escalera cuyo nivel es al menos `floor` (el último si ninguno llega). */
function floorIndex(ladder: string[], order: string[], floor: string): number {
  const rank = order.indexOf(floor);
  const i = ladder.findIndex((l) => order.indexOf(l) >= rank);
  return i === -1 ? ladder.length - 1 : i;
}

function planEffort(
  model: SelectorModel,
  desired: string,
  steps: number,
  floor: string | null,
  ctx: Ctx,
): PickEffort {
  const ladder = ladderOf(model, ctx);
  const defaults = defaultsOf(model, ctx);
  const base = { requested: null, raisedByFloor: false, defaults };
  if (ladder.length === 0) return { ...base, level: null, status: 'unverified' };
  let requested = desired;
  if (desired === DEFAULT_EFFORT) {
    const first = defaults.find((d) => ladder.includes(d.level));
    if (!first) return { ...base, level: null, status: 'default-unpublished' };
    requested = first.level;
  }
  const { index, adjusted } = nearestIndex(ladder, ctx.order, requested);
  let idx = Math.min(Math.max(index + steps, 0), ladder.length - 1);
  let raised = false;
  if (floor) {
    const fi = floorIndex(ladder, ctx.order, floor);
    if (idx < fi) {
      idx = fi;
      raised = true;
    }
  }
  return {
    level: ladder[idx] ?? null,
    status: adjusted ? 'adjusted' : 'ok',
    requested,
    raisedByFloor: raised,
    defaults,
  };
}

function atLeast(entries: CurrentEntry[], rank: number): CurrentEntry | undefined {
  return entries.find((e) => e.rank >= rank);
}

function stepTier(entries: CurrentEntry[], rank: number, dir: -1 | 1): CurrentEntry | undefined {
  return dir === 1 ? entries.find((e) => e.rank > rank) : [...entries].reverse().find((e) => e.rank < rank);
}

function providerName(ctx: Ctx, provider: string): string {
  return ctx.data.rules.policy.providerNames[provider] ?? provider;
}

function condHolds(rule: ModifierRecord, answers: Answers, fields: Set<AnswerField>): boolean {
  return rule.when.all.every((c) => fields.has(c.field) && c.in.includes(answers[c.field]));
}

function evaluateRules(answers: Answers, mode: Mode, ctx: Ctx) {
  const fields = new Set(fieldsFor(ctx.data.rules, mode).map((f) => f.field));
  const plan: Plan = { effortSteps: 0, effortFloor: null, tierFloor: null, batch: false };
  const applied: AppliedRule[] = [];
  const notices: Notice[] = [];
  for (const rule of ctx.data.rules.modifiers) {
    if (!condHolds(rule, answers, fields)) continue;
    const effects = rule.effects.filter((e) => e.modes.includes(mode));
    if (effects.length === 0) continue;
    applied.push({ id: rule.id, title: rule.title, why: rule.why, claim: rule.claim, sources: rule.sources });
    for (const e of effects) {
      switch (e.type) {
        case 'effort-step':
          plan.effortSteps += e.steps;
          break;
        case 'effort-floor':
          if (!plan.effortFloor || ctx.order.indexOf(e.level) > ctx.order.indexOf(plan.effortFloor)) {
            plan.effortFloor = e.level;
          }
          break;
        case 'tier-floor':
          if (!plan.tierFloor || ctx.tierRank(e.tier) > ctx.tierRank(plan.tierFloor)) plan.tierFloor = e.tier;
          break;
        case 'batch':
          plan.batch = true;
          break;
        case 'notice':
          notices.push({ tone: e.tone, text: e.text, target: e.target });
          break;
      }
    }
  }
  return { plan, applied, notices };
}

function makePick(model: SelectorModel, effort: PickEffort, primary: boolean, ctx: Ctx): Pick {
  return { model, primary, effort, legacy: ctx.tierRank(model.tier) < 0 };
}

function markPrimary(picks: Pick[]): Pick[] {
  const seen = new Set<string>();
  return picks.map((p) => {
    const primary = !seen.has(p.model.provider);
    seen.add(p.model.provider);
    return { ...p, primary };
  });
}

/* ---- Modo tarea: la fila de la matriz ---- */

function taskPicks(task: SelectorTask, plan: Plan, ctx: Ctx, notices: Notice[]): Pick[] {
  const picks: Pick[] = [];
  const floorRank = plan.tierFloor ? ctx.tierRank(plan.tierFloor) : -1;
  for (const id of task.models) {
    let model = ctx.data.models.find((m) => m.id === id);
    if (!model) continue;
    if (model.status === 'acceso-limitado') {
      notices.push({
        tone: 'aviso',
        text: ctx.text('limitedExcluded', { modelo: model.name }),
        target: 'general',
      });
      continue;
    }
    const rank = ctx.tierRank(model.tier);
    if (plan.tierFloor && rank >= 0 && rank < floorRank) {
      const target = atLeast(ctx.current.get(model.provider) ?? [], floorRank);
      if (target) {
        notices.push({
          tone: 'consejo',
          text: ctx.text('tierFloorSwap', { antes: model.name, despues: target.model.name }),
          target: 'general',
        });
        if (target.rank - floorRank > 0) {
          notices.push(skippedNotice(ctx, model.provider, plan.tierFloor, target));
        }
        model = target.model;
      }
    }
    if (picks.some((p) => p.model.id === model.id)) continue;
    const effort = planEffort(model, task.effort, plan.effortSteps, plan.effortFloor, ctx);
    if (effort.raisedByFloor && effort.level) {
      notices.push({
        tone: 'consejo',
        text: ctx.text('effortFloorRaised', { modelo: model.name, nivel: effort.level }),
        target: 'general',
      });
    }
    picks.push(makePick(model, effort, false, ctx));
  }
  return markPrimary(picks);
}

function skippedNotice(ctx: Ctx, provider: string, tier: string, target: CurrentEntry): Notice {
  return {
    tone: 'consejo',
    text: ctx.text('tierSkipped', {
      proveedor: providerName(ctx, provider),
      gama: tier,
      modelo: target.model.name,
      siguiente: target.model.tier,
    }),
    target: 'general',
  };
}

/* ---- Modo «otra tarea»: la tabla de decisión ---- */

function ordinal(rules: SelectorRules, field: AnswerField, value: string): number {
  return (
    rules.questions.fields.find((f) => f.field === field)?.options.findIndex((o) => o.value === value) ?? -1
  );
}

/**
 * Fila de la tabla de decisión para una combinación. Si la combinación no figura, la página manda
 * quedarse con la más capaz cuando dudas entre dos filas: se toma, entre las filas a menor distancia
 * (pasos de razonamiento y de coste del error, más uno si la repetición no coincide), la de gama
 * más alta y, a igualdad, la de esfuerzo más alto; a igualdad total, la primera de la tabla.
 */
export function findTableRow(
  answers: Answers,
  data: SelectorData,
): { row: GenericRecord; exact: boolean; considered: GenericRecord[] } | null {
  const { rules } = data;
  const repetition = rules.policy.repetitionOf[answers.volume] ?? 'baja';
  const r = ordinal(rules, 'reasoning', answers.reasoning);
  const e = ordinal(rules, 'errorCost', answers.errorCost);
  const ctx = makeCtx(data);
  const exact = rules.generics.find(
    (g) =>
      g.reasoning === answers.reasoning &&
      g.errorCost === answers.errorCost &&
      (g.repetition === 'cualquiera' || g.repetition === repetition),
  );
  if (exact) return { row: exact, exact: true, considered: [exact] };
  const distance = (g: GenericRecord) =>
    Math.abs(ordinal(rules, 'reasoning', g.reasoning) - r) +
    Math.abs(ordinal(rules, 'errorCost', g.errorCost) - e) +
    (g.repetition === 'cualquiera' || g.repetition === repetition ? 0 : 1);
  const effortRank = (g: GenericRecord) =>
    ctx.order.indexOf(g.effort === DEFAULT_EFFORT ? rules.policy.defaultEffortRankAs : g.effort);
  const capability = (g: GenericRecord) => ctx.tierRank(g.tiers[0] ?? '') * 100 + effortRank(g);
  const min = Math.min(...rules.generics.map(distance));
  const considered = rules.generics.filter((g) => distance(g) === min);
  let best: GenericRecord | undefined;
  for (const g of considered) if (!best || capability(g) > capability(best)) best = g;
  return best ? { row: best, exact: false, considered } : null;
}

function genericPicks(row: GenericRecord, ctx: Ctx, notices: Notice[]): Pick[] {
  const primaryRank = ctx.tierRank(row.tiers[0] ?? '');
  const picks: Pick[] = [];
  for (const provider of Object.keys(ctx.data.rules.policy.providerNames)) {
    const entries = ctx.current.get(provider);
    if (!entries || entries.length === 0) continue;
    let chosen: CurrentEntry | undefined;
    for (const t of row.tiers) {
      chosen = entries.find((e) => e.rank === ctx.tierRank(t));
      if (chosen) break;
    }
    if (!chosen) {
      chosen = atLeast(entries, primaryRank) ?? entries.at(-1);
      if (chosen) notices.push(skippedNotice(ctx, provider, row.tiers[0] ?? '', chosen));
    }
    if (!chosen) continue;
    picks.push(makePick(chosen.model, planEffort(chosen.model, row.effort, 0, null, ctx), true, ctx));
  }
  return picks;
}

/* ---- Alternativas ---- */

function priceRatio(from: SelectorModel, to: SelectorModel): number | null {
  if (!from.prices.output || to.prices.output === null) return null;
  return Math.round((to.prices.output / from.prices.output) * 100);
}

function alternativesFor(picks: Pick[], plan: Plan, ctx: Ctx): ProviderAlternatives[] {
  const tierFloorRank = plan.tierFloor ? ctx.tierRank(plan.tierFloor) : -1;
  return picks
    .filter((p) => p.primary)
    .map((pick) => {
      const { model } = pick;
      const level = pick.effort.level;
      const name = providerName(ctx, model.provider);
      const ladder = ladderOf(model, ctx);
      const idx = level === null ? -1 : ladder.indexOf(level);
      const entries = ctx.current.get(model.provider) ?? [];
      const rank = ctx.tierRank(model.tier);
      const tierOption = (target: CurrentEntry, kind: 'cheaper' | 'stronger'): AlternativeOption => {
        const effort = planEffort(target.model, level ?? DEFAULT_EFFORT, 0, plan.effortFloor, ctx);
        const vars = {
          modelo: model.name,
          de: model.name,
          a: target.model.name,
          gama: target.model.tier,
          a_nivel: effort.level ?? 'por defecto',
        };
        const notes: string[] = [];
        const ratio = priceRatio(model, target.model);
        if (ratio !== null)
          notes.push(ctx.text('priceRatio', { porcentaje: formatNumber(ratio, 0), modelo: model.name }));
        if (Math.abs(target.rank - rank) > 1) {
          notes.push(
            skippedNotice(
              ctx,
              model.provider,
              ctx.data.rules.policy.tierLadder[rank + (kind === 'cheaper' ? -1 : 1)] ?? '',
              target,
            ).text,
          );
        }
        return {
          kind: 'tier',
          model: target.model,
          level: effort.level,
          what: ctx.text(kind === 'cheaper' ? 'cheaperTierWhat' : 'strongerTierWhat', vars),
          guidance: ctx.text(kind === 'cheaper' ? 'cheaperTierMeasure' : 'strongerTierWhen'),
          notes,
        };
      };
      const effortOption = (to: string, kind: 'cheaper' | 'stronger'): AlternativeOption => ({
        kind: 'effort',
        model,
        level: to,
        what: ctx.text(kind === 'cheaper' ? 'cheaperEffortWhat' : 'strongerEffortWhat', {
          modelo: model.name,
          de: level ?? '',
          a: to,
        }),
        guidance: ctx.text(kind === 'cheaper' ? 'cheaperEffortMeasure' : 'strongerEffortWhen'),
        notes: [ctx.text(kind === 'cheaper' ? 'cheaperEffortNote' : 'strongerEffortNote')],
      });

      // Más barata: primero un escalón menos de esfuerzo; si no cabe, un escalón menos de gama.
      let cheaper: Alternative;
      let blockedByFloor = false;
      const minIdx = plan.effortFloor ? floorIndex(ladder, ctx.order, plan.effortFloor) : 0;
      const lower = idx > 0 ? ladder[idx - 1] : undefined;
      if (lower !== undefined && idx - 1 >= minIdx) {
        cheaper = { available: true, option: effortOption(lower, 'cheaper') };
      } else {
        if (lower !== undefined) blockedByFloor = true;
        const down = rank >= 0 ? stepTier(entries, rank, -1) : undefined;
        if (down && down.rank >= tierFloorRank) {
          cheaper = { available: true, option: tierOption(down, 'cheaper') };
        } else {
          if (down) blockedByFloor = true;
          cheaper = {
            available: false,
            reason: blockedByFloor
              ? ctx.text('noCheaperFloor')
              : ctx.text('noCheaperBottom', { proveedor: name }),
          };
        }
      }

      // Más potente: primero un escalón más de esfuerzo; si no cabe, un escalón más de gama.
      let stronger: Alternative;
      const higher = idx >= 0 ? ladder[idx + 1] : undefined;
      if (higher !== undefined) {
        stronger = { available: true, option: effortOption(higher, 'stronger') };
      } else {
        const up = rank >= 0 ? stepTier(entries, rank, 1) : undefined;
        stronger = up
          ? { available: true, option: tierOption(up, 'stronger') }
          : { available: false, reason: ctx.text('noStrongerTop', { proveedor: name }) };
      }
      return { provider: model.provider, providerName: name, from: { model, level }, cheaper, stronger };
    });
}

/* ---- Textos de precio ---- */

/** Condiciones que cambian el precio: precio introductorio con fecha y tramo de contexto largo. */
export function priceNotes(model: SelectorModel, data: SelectorData): string[] {
  const text = (key: string, vars: Record<string, string>) => fill(data.rules.policy.texts[key] ?? key, vars);
  const notes: string[] = [];
  if (model.scheduledChange) {
    notes.push(
      text('priceIntro', {
        fecha: formatDate(model.scheduledChange.effectiveFrom),
        entrada: formatUsd(model.scheduledChange.input),
        salida: formatUsd(model.scheduledChange.output),
      }),
    );
  }
  if (model.longContext) {
    notes.push(
      text('priceLong', {
        umbral: formatTokens(model.longContext.thresholdTokens),
        entrada: formatUsd(model.longContext.input),
        salida: formatUsd(model.longContext.output),
      }),
    );
  }
  return notes;
}

/** «2 $ / 10 $» o «—» si no hay precio. */
export function formatPrices(model: SelectorModel): string {
  const f = (n: number | null) => (n === null ? '—' : formatUsd(n));
  return `${f(model.prices.input)} / ${f(model.prices.output)}`;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Texto de la línea de lotes de un modelo: «Con lotes (×0,5 del precio normal): …». */
export function batchLine(item: BatchSuggestion['items'][number], data: SelectorData): string {
  const f = (n: number | null) => (n === null ? '—' : formatUsd(n));
  return fill(data.rules.policy.texts['batchLine'] ?? 'batchLine', {
    factor: `×${formatNumber(item.factor)}`,
    entrada: f(item.input),
    salida: f(item.output),
  });
}

/* ---- Recomendación ---- */

function maxDate(dates: string[]): string {
  return dates.sort().at(-1) ?? '';
}

function uniq<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function recommend(answers: Answers, data: SelectorData): RecommendResult {
  const errors = checkAnswers(answers, data);
  if (errors.length > 0) return { ok: false, errors };
  const ctx = makeCtx(data);
  const mode = modeOf(answers);
  const { plan, applied, notices: ruleNotices } = evaluateRules(answers, mode, ctx);
  const engineNotices: Notice[] = [];
  const extraNotes: Notice[] = [];

  let title: string;
  let rowId: string;
  let surface: string;
  let surfaceFixed: boolean;
  let verification: string;
  let why: string;
  let picks: Pick[];
  let guideSourceIds: string[] = [];
  let guideVerifiedAt: string;
  let tableMatch: Recommendation['tableMatch'];

  if (mode === 'task') {
    const task = data.tasks.find((t) => t.id === answers.taskId);
    if (!task) return { ok: false, errors: [`El tipo de tarea «${answers.taskId}» no existe.`] };
    title = task.taskType;
    rowId = task.id;
    surface = task.surface;
    surfaceFixed = true;
    verification = task.verification;
    why = task.why;
    guideSourceIds = task.sourceIds;
    guideVerifiedAt = task.verifiedAt;
    picks = taskPicks(task, plan, ctx, engineNotices);
  } else {
    const match = findTableRow(answers, data);
    if (!match) return { ok: false, errors: ['La tabla de decisión no tiene filas.'] };
    const { row } = match;
    title = data.rules.questions.otherTitle;
    rowId = row.id;
    surface = ctx.text('genericSurface');
    surfaceFixed = false;
    verification = row.verification ?? ctx.text('genericVerification');
    why = row.why;
    guideVerifiedAt = row.verifiedAt;
    picks = genericPicks(row, ctx, engineNotices);
    for (const note of row.notes) extraNotes.push({ tone: 'consejo', text: note, target: 'general' });
    if (!match.exact) {
      engineNotices.push({ tone: 'consejo', text: ctx.text('genericDoubt'), target: 'general' });
    }
    tableMatch = { exact: match.exact, considered: match.considered.map((g) => g.id) };
  }

  // Avisos sobre los modelos elegidos.
  for (const p of picks) {
    if (p.legacy) {
      engineNotices.push({
        tone: 'aviso',
        text: ctx.text('legacyModel', { modelo: p.model.name, gama: p.model.tier }),
        target: 'general',
      });
    }
    if (p.effort.status === 'unverified') {
      engineNotices.push({
        tone: 'aviso',
        text: ctx.text('effortUnverified', { modelo: p.model.name }),
        target: 'general',
      });
    } else if (p.effort.status === 'default-unpublished') {
      engineNotices.push({
        tone: 'aviso',
        text: ctx.text('defaultUnpublished', { modelo: p.model.name }),
        target: 'general',
      });
    } else if (p.effort.status === 'adjusted' && p.effort.level) {
      engineNotices.push({
        tone: 'consejo',
        text: ctx.text('effortAdjusted', {
          modelo: p.model.name,
          nivel: p.effort.requested ?? '',
          propuesto: p.effort.level,
        }),
        target: 'general',
      });
    }
  }

  // Lotes: solo con dato verificado del proveedor.
  let batch: BatchSuggestion | null = null;
  if (plan.batch) {
    const items = picks
      .filter((p) => p.model.batchFactor !== null)
      .map((p) => {
        const factor = p.model.batchFactor ?? 1;
        const scale = (n: number | null) => (n === null ? null : round6(n * factor));
        return {
          model: p.model,
          factor,
          input: scale(p.model.prices.input),
          output: scale(p.model.prices.output),
        };
      });
    const unavailable = uniq(
      picks.filter((p) => p.model.batchFactor === null).map((p) => providerName(ctx, p.model.provider)),
    );
    for (const name of unavailable) {
      engineNotices.push({
        tone: 'consejo',
        text: ctx.text('noBatchData', { proveedor: name }),
        target: 'general',
      });
    }
    batch = { items, unavailable };
  }

  const alternatives = alternativesFor(picks, plan, ctx);

  // Avisos: primero los de aviso; dentro de cada tono, el orden en que se generaron.
  const all = [...ruleNotices, ...extraNotes, ...engineNotices];
  const seen = new Set<string>();
  const notices = all
    .filter((n) => (seen.has(n.text) ? false : (seen.add(n.text), true)))
    .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'aviso' ? -1 : 1));

  const usedModels = [
    ...picks.map((p) => p.model),
    ...alternatives.flatMap((a) =>
      [a.cheaper, a.stronger].flatMap((x) => (x.available ? [x.option.model] : [])),
    ),
  ];
  const ruleSources = applied.flatMap((r) => r.sources);
  const ruleDates = data.rules.modifiers
    .filter((m) => applied.some((a) => a.id === m.id))
    .map((m) => m.verifiedAt);

  const recommendation: Recommendation = {
    mode,
    title,
    rowId,
    surface,
    surfaceFixed,
    picks,
    verification,
    reasoning: [why, ctx.text('startRule')],
    rules: applied,
    notices,
    alternatives,
    batch,
    priceSourceIds: uniq(usedModels.flatMap((m) => m.sources)),
    pricesVerifiedAt: maxDate(usedModels.map((m) => m.verifiedAt)),
    guideSourceIds: uniq([...guideSourceIds, ...ruleSources]),
    guideVerifiedAt: maxDate([guideVerifiedAt, ...ruleDates]),
    disclaimer: ctx.text('disclaimer'),
  };
  if (tableMatch) recommendation.tableMatch = tableMatch;
  return { ok: true, recommendation };
}

/* ------------------------------------------------------------------ */
/* Textos de salida                                                    */
/* ------------------------------------------------------------------ */

/** Resumen corto para la región `aria-live`. */
export function oneLineSummary(rec: Recommendation): string {
  const models = rec.picks
    .map((p) => `${p.model.name}${p.effort.level ? ` (${p.effort.level})` : ''}`)
    .join(', ');
  return `${rec.title}. Superficie: ${rec.surface}. Modelos: ${models}.`;
}

/** Resumen completo en texto plano, para copiar. */
export function summaryText(rec: Recommendation, data: SelectorData): string {
  const lines: string[] = [];
  const level = (l: string | null) => (l ? `esfuerzo ${l}` : 'esfuerzo sin verificar');
  lines.push(`Selector de modelo y esfuerzo: ${rec.title}`);
  lines.push(`Superficie: ${rec.surface}`);
  lines.push('');
  lines.push('Modelos y esfuerzo recomendados (precio por millón de tokens, entrada / salida):');
  for (const p of rec.picks) {
    lines.push(
      `- ${p.model.name} (${p.model.tier}): ${level(p.effort.level)}; por defecto: ${formatDefaults(p.effort.defaults)}; ${formatPrices(p.model)}`,
    );
  }
  lines.push('');
  lines.push(`Cómo verificar: ${rec.verification}`);
  lines.push('');
  lines.push('Por qué:');
  for (const r of rec.reasoning) lines.push(r);
  for (const r of rec.rules) lines.push(`- ${r.title}: ${r.why}`);
  lines.push('');
  for (const a of rec.alternatives) {
    const describe = (alt: Alternative) =>
      alt.available ? `${alt.option.what} ${alt.option.guidance}` : alt.reason;
    lines.push(`${a.providerName}: más barata. ${describe(a.cheaper)}`);
    lines.push(`${a.providerName}: más potente. ${describe(a.stronger)}`);
  }
  if (rec.batch) {
    lines.push('');
    lines.push('Con lotes:');
    for (const item of rec.batch.items) lines.push(`- ${item.model.name}: ${batchLine(item, data)}`);
  }
  if (rec.notices.length > 0) {
    lines.push('');
    for (const n of rec.notices) lines.push(`${n.tone === 'aviso' ? 'Aviso' : 'Consejo'}: ${n.text}`);
  }
  lines.push('');
  const refs = rec.priceSourceIds.map((id) => {
    const s = data.sources[id];
    return s ? `${s.title} (${s.url})` : id;
  });
  lines.push(`Precios y esfuerzo de ${refs.join(', ')}, verificados el ${formatDate(rec.pricesVerifiedAt)}.`);
  lines.push(`Recomendación de la guía revisada el ${formatDate(rec.guideVerifiedAt)}.`);
  lines.push(rec.disclaimer);
  return lines.join('\n');
}
