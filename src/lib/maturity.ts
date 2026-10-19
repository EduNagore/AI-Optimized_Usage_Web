import { z } from 'astro/zod';

/**
 * Diagnóstico de madurez (plan/01_TEMARIO.md, interactivo 9). Lógica pura: sin DOM, sin React y sin
 * `astro:content`. Todas las reglas (preguntas, puntos, tramos, páginas) viven en `src/data/maturity.json`.
 *
 * Convenciones de cálculo:
 * - Cada opción puntúa de 0 a 3 en la dimensión de su pregunta; todas las preguntas pesan igual.
 * - Los umbrales en porcentaje se comparan con aritmética entera (`puntos * 100 >= minPercent * máximo`)
 *   para evitar errores de coma flotante en los límites exactos (p. ej. 2 de 6 es un 33,33 %).
 * - Una respuesta ausente o desconocida cuenta como no respondida: no suma ni se penaliza, y la
 *   dimensión se juzga solo con lo respondido. El nivel global solo existe con el test completo.
 */

// ---------------------------------------------------------------------------------------------
// Esquema de los datos
// ---------------------------------------------------------------------------------------------

const percent = z.number().int().min(0).max(100);
const requirement = z.object({ dimension: z.string().min(1), minPercent: percent });

const dimensionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  summary: z.string().min(1),
  /** Aviso que se muestra cuando una puntuación baja en esta dimensión puede ser razonable. */
  note: z.string().min(1).optional(),
  /** Si no se cumple, la dimensión no se propone como prioridad (primero hay que reforzar la otra). */
  prerequisites: z.array(requirement).default([]),
});

const optionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  points: z.number().int().min(0).max(3),
});

const questionSchema = z.object({
  id: z.string().min(1),
  dimension: z.string().min(1),
  text: z.string().min(1),
  options: z.array(optionSchema).min(3).max(4),
});

const bandSchema = z.object({ id: z.string().min(1), label: z.string().min(1), minPercent: percent });

const levelSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  /** Puntuación total mínima para este nivel; el siguiente nivel marca el final del tramo. */
  min: z.number().int().min(0),
  /** Mínimos por dimensión necesarios para mantener el nivel; si fallan, se baja al anterior. */
  requires: z.array(requirement).default([]),
});

const pageEntrySchema = z.object({
  /** Identificador de la página en la colección `docs` (p. ej. `m2-metodo/ciclo-de-7-pasos`). */
  page: z.string().min(1),
  /** Tramos de dimensión (ids de `bands`) en los que se recomienda. */
  bands: z.array(z.string()).default([]),
  why: z.string().min(1),
});

export const maturityRecordSchema = z.object({
  id: z.string().min(1),
  /** Cambiarla invalida las respuestas guardadas en el navegador. */
  version: z.number().int().positive(),
  dimensions: z.array(dimensionSchema).min(1),
  questions: z.array(questionSchema).min(1),
  bands: z.array(bandSchema).min(2),
  levels: z.array(levelSchema).min(2),
  limits: z.object({
    /** Máximo de dimensiones con más recorrido (la tercera solo si no está ya en el tramo más alto). */
    focusMax: z.number().int().min(1),
    pagesMax: z.number().int().min(1),
  }),
  recommendations: z.record(z.string(), z.array(pageEntrySchema)),
  quick: z.array(z.object({ dimension: z.string().min(1), page: z.string().min(1), why: z.string().min(1) })),
  quickFallback: z.object({ page: z.string().min(1), why: z.string().min(1) }),
  /** Páginas para quien no deja huecos evidentes. */
  keepingUp: z.array(pageEntrySchema),
  example: z.object({ label: z.string().min(1), answers: z.record(z.string(), z.string()) }),
});

export type MaturityData = z.infer<typeof maturityRecordSchema>;
export type MaturityDimension = MaturityData['dimensions'][number];
export type MaturityQuestion = MaturityData['questions'][number];
export type MaturityBand = MaturityData['bands'][number];
export type MaturityLevel = MaturityData['levels'][number];
export type MaturityPageEntry = z.infer<typeof pageEntrySchema>;

/** `maturity.json` es un array con un único registro (como el resto de ficheros de `src/data/`). */
export function parseMaturityFile(raw: unknown): MaturityData {
  const [first] = z.array(maturityRecordSchema).length(1).parse(raw);
  if (!first) throw new Error('maturity.json: falta el registro');
  return first;
}

// ---------------------------------------------------------------------------------------------
// Coherencia semántica de los datos
// ---------------------------------------------------------------------------------------------

/** Devuelve la lista de problemas de coherencia (vacía si los datos son válidos). */
export function validateMaturityData(data: MaturityData): string[] {
  const problems: string[] = [];
  const dimIds = data.dimensions.map((d) => d.id);
  const dimSet = new Set(dimIds);
  const bandIds = new Set(data.bands.map((b) => b.id));
  const dup = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);

  for (const id of dup(dimIds)) problems.push(`dimensión repetida: ${id}`);
  const qIds = data.questions.map((q) => q.id);
  for (const id of dup(qIds)) problems.push(`pregunta repetida: ${id}`);

  for (const d of data.dimensions) {
    for (const r of d.prerequisites) {
      if (!dimSet.has(r.dimension) || r.dimension === d.id)
        problems.push(`requisito inválido en la dimensión ${d.id}: ${r.dimension}`);
    }
    if (!data.questions.some((q) => q.dimension === d.id)) problems.push(`sin preguntas: ${d.id}`);
  }

  for (const q of data.questions) {
    if (!dimSet.has(q.dimension)) problems.push(`${q.id}: dimensión desconocida ${q.dimension}`);
    for (const id of dup(q.options.map((o) => o.id))) problems.push(`${q.id}: opción repetida ${id}`);
    q.options.forEach((o, i) => {
      const prev = q.options[i - 1];
      if (i === 0 && o.points !== 0) problems.push(`${q.id}: la primera opción debe puntuar 0`);
      if (prev && o.points <= prev.points)
        problems.push(`${q.id}: las opciones deben ir de menos a más puntos (${o.id})`);
    });
  }

  const ascending = (a: number[]) => a.every((v, i) => i === 0 || v > (a[i - 1] ?? -1));
  if (data.bands[0]?.minPercent !== 0) problems.push('el primer tramo de dimensión debe empezar en 0 %');
  if (!ascending(data.bands.map((b) => b.minPercent))) problems.push('los tramos de dimensión no ascienden');
  if (data.levels[0]?.min !== 0) problems.push('el primer nivel debe empezar en 0 puntos');
  if (!ascending(data.levels.map((l) => l.min))) problems.push('los niveles no ascienden');
  const total = maxTotal(data);
  const lastLevel = data.levels[data.levels.length - 1];
  if (lastLevel && lastLevel.min > total)
    problems.push(`el último nivel (${lastLevel.min}) supera el máximo (${total})`);
  for (const l of data.levels) {
    for (const r of l.requires) {
      if (!dimSet.has(r.dimension))
        problems.push(`nivel ${l.id}: requisito sobre ${r.dimension} desconocido`);
    }
  }

  for (const key of Object.keys(data.recommendations)) {
    if (!dimSet.has(key)) problems.push(`recomendaciones de una dimensión desconocida: ${key}`);
  }
  for (const d of data.dimensions) {
    const entries = data.recommendations[d.id] ?? [];
    for (const id of dup(entries.map((e) => e.page))) problems.push(`${d.id}: página repetida ${id}`);
    for (const e of entries) {
      for (const b of e.bands)
        if (!bandIds.has(b)) problems.push(`${d.id}/${e.page}: tramo desconocido ${b}`);
    }
    for (const b of data.bands) {
      if (!entries.some((e) => e.bands.includes(b.id)))
        problems.push(`${d.id}: ninguna página para el tramo ${b.id}`);
    }
  }
  for (const q of data.quick)
    if (!dimSet.has(q.dimension)) problems.push(`quick: dimensión desconocida ${q.dimension}`);

  const example = sanitizeAnswers(data, data.example.answers);
  if (Object.keys(example).length !== data.questions.length)
    problems.push('el perfil de ejemplo no contesta todas las preguntas con opciones válidas');

  return problems;
}

/** Todas las páginas que cita el fichero (para comprobar que existen). */
export function referencedPages(data: MaturityData): string[] {
  const pages = new Set<string>();
  for (const entries of Object.values(data.recommendations)) for (const e of entries) pages.add(e.page);
  for (const q of data.quick) pages.add(q.page);
  pages.add(data.quickFallback.page);
  for (const e of data.keepingUp) pages.add(e.page);
  return [...pages];
}

// ---------------------------------------------------------------------------------------------
// Puntuación
// ---------------------------------------------------------------------------------------------

/** Respuestas: id de pregunta → id de opción. */
export type Answers = Record<string, string>;

export interface DimensionScore {
  id: string;
  label: string;
  /** Puntos obtenidos en lo respondido. */
  points: number;
  /** Máximo de toda la dimensión. */
  max: number;
  answered: number;
  questions: number;
  /** Máximo de lo respondido (igual a `max` si el test está completo). */
  answeredMax: number;
  /** `points / answeredMax` redondeado, solo para mostrar; `null` si no hay respuestas. */
  percent: number | null;
  /** Tramo de la dimensión; `null` si no hay respuestas. */
  band: MaturityBand | null;
}

export interface LevelOutcome {
  level: MaturityLevel;
  /** Nivel que correspondería solo por la puntuación total. */
  byPoints: MaturityLevel;
  /** Dimensiones que impiden mantener `byPoints` (vacío si no hay recorte). */
  limitedBy: DimensionScore[];
}

export interface MaturityScore {
  answeredCount: number;
  questionCount: number;
  complete: boolean;
  total: number;
  max: number;
  dimensions: DimensionScore[];
  /** `null` si faltan respuestas. */
  outcome: LevelOutcome | null;
}

function maxOfQuestion(q: MaturityQuestion): number {
  return Math.max(...q.options.map((o) => o.points));
}

export function maxTotal(data: MaturityData): number {
  return data.questions.reduce((sum, q) => sum + maxOfQuestion(q), 0);
}

/** `puntos / máximo >= minPercent %`, sin decimales. Con máximo 0 nunca se cumple. */
export function meetsPercent(points: number, max: number, minPercent: number): boolean {
  return max > 0 && points * 100 >= minPercent * max;
}

function bandFor(points: number, max: number, bands: MaturityBand[]): MaturityBand | null {
  if (max <= 0) return null;
  let found: MaturityBand | null = null;
  for (const b of bands) if (meetsPercent(points, max, b.minPercent)) found = b;
  return found;
}

/** Deja solo las respuestas que corresponden a una pregunta y a una opción existentes. */
export function sanitizeAnswers(data: MaturityData, raw: unknown): Answers {
  const out: Answers = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  const record = raw as Record<string, unknown>;
  for (const q of data.questions) {
    const value = record[q.id];
    if (typeof value === 'string' && q.options.some((o) => o.id === value)) out[q.id] = value;
  }
  return out;
}

export function scoreAnswers(data: MaturityData, rawAnswers: Answers): MaturityScore {
  const answers = sanitizeAnswers(data, rawAnswers);
  const dimensions: DimensionScore[] = data.dimensions.map((d) => {
    const qs = data.questions.filter((q) => q.dimension === d.id);
    let points = 0;
    let answered = 0;
    let answeredMax = 0;
    for (const q of qs) {
      const option = q.options.find((o) => o.id === answers[q.id]);
      if (!option) continue;
      points += option.points;
      answered += 1;
      answeredMax += maxOfQuestion(q);
    }
    return {
      id: d.id,
      label: d.label,
      points,
      max: qs.reduce((s, q) => s + maxOfQuestion(q), 0),
      answered,
      questions: qs.length,
      answeredMax,
      percent: answeredMax > 0 ? Math.round((points * 100) / answeredMax) : null,
      band: bandFor(points, answeredMax, data.bands),
    };
  });

  const answeredCount = dimensions.reduce((s, d) => s + d.answered, 0);
  const total = dimensions.reduce((s, d) => s + d.points, 0);
  const complete = answeredCount === data.questions.length;
  return {
    answeredCount,
    questionCount: data.questions.length,
    complete,
    total,
    max: maxTotal(data),
    dimensions,
    outcome: complete ? resolveLevel(data, total, dimensions) : null,
  };
}

/**
 * Nivel por tramos de puntuación total y, después, por mínimos de dimensión: si el nivel por puntos
 * exige un mínimo en alguna dimensión y no se alcanza, se baja al nivel anterior hasta cumplirlos.
 */
export function resolveLevel(data: MaturityData, total: number, dimensions: DimensionScore[]): LevelOutcome {
  let index = 0;
  data.levels.forEach((l, i) => {
    if (total >= l.min) index = i;
  });
  const byPoints = data.levels[index] as MaturityLevel;
  const failing = (level: MaturityLevel) =>
    level.requires.flatMap((r) => {
      const dim = dimensions.find((d) => d.id === r.dimension);
      return dim && meetsPercent(dim.points, dim.max, r.minPercent) ? [] : dim ? [dim] : [];
    });
  const limitedBy = failing(byPoints);
  let chosen = index;
  while (chosen > 0 && failing(data.levels[chosen] as MaturityLevel).length > 0) chosen -= 1;
  return {
    level: data.levels[chosen] as MaturityLevel,
    byPoints,
    limitedBy: chosen === index ? [] : limitedBy,
  };
}

// ---------------------------------------------------------------------------------------------
// Recomendaciones
// ---------------------------------------------------------------------------------------------

export interface RecommendedPage {
  page: string;
  why: string;
  /** Dimensión por la que se recomienda (`null` en las páginas de mantenimiento). */
  dimension: string | null;
}

export interface Recommendation {
  /** Dimensiones con más recorrido, de más a menos. */
  focus: DimensionScore[];
  /** Con recorrido pero aplazadas porque falta un requisito previo (p. ej. agentes sin método). */
  deferred: DimensionScore[];
  /** Páginas en orden de lectura: primero las de la dimensión con más recorrido. */
  pages: RecommendedPage[];
  /** Una página corta de la ruta Esencial para quien tiene poco tiempo. */
  quick: RecommendedPage;
  /** `true` si no hay huecos evidentes y se ofrecen las páginas de mantenimiento. */
  keepingUp: boolean;
}

/** Orden de menos a más madura por proporción de puntos; empate: orden de las dimensiones en los datos. */
function compareByRoom(a: DimensionScore, b: DimensionScore, order: Map<string, number>): number {
  // a.points / a.answeredMax - b.points / b.answeredMax, multiplicando en cruz.
  const diff = a.points * b.answeredMax - b.points * a.answeredMax;
  return diff !== 0 ? diff : (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
}

export function recommend(data: MaturityData, score: MaturityScore): Recommendation {
  const order = new Map(data.dimensions.map((d, i) => [d.id, i]));
  const byId = new Map(score.dimensions.map((d) => [d.id, d]));
  const withRoom = score.dimensions.filter((d) => d.answered > 0 && d.points < d.answeredMax);

  const prerequisitesMet = (id: string) =>
    (data.dimensions.find((d) => d.id === id)?.prerequisites ?? []).every((r) => {
      const dim = byId.get(r.dimension);
      return dim !== undefined && dim.answered > 0 && meetsPercent(dim.points, dim.answeredMax, r.minPercent);
    });

  const eligible = withRoom.filter((d) => prerequisitesMet(d.id)).sort((a, b) => compareByRoom(a, b, order));
  const deferred = withRoom.filter((d) => !prerequisitesMet(d.id)).sort((a, b) => compareByRoom(a, b, order));

  // Dos dimensiones siempre; las demás hasta `focusMax`, solo si no están ya en el tramo más alto.
  const topBand = data.bands[data.bands.length - 1];
  const focus = eligible.filter(
    (d, i) =>
      i < Math.min(2, data.limits.focusMax) || (i < data.limits.focusMax && d.band?.id !== topBand?.id),
  );

  if (focus.length === 0) {
    const pages = data.keepingUp.slice(0, data.limits.pagesMax).map((e) => ({
      page: e.page,
      why: e.why,
      dimension: null,
    }));
    return { focus, deferred, pages, quick: quickPage(data, focus), keepingUp: true };
  }

  // Candidatas por dimensión según su tramo; una página repetida se queda con la dimensión de más rango.
  const taken = new Set<string>();
  const candidates = focus.map((d) => {
    const entries = (data.recommendations[d.id] ?? []).filter((e) =>
      d.band ? e.bands.includes(d.band.id) : false,
    );
    const own = entries.filter((e) => !taken.has(e.page));
    for (const e of own) taken.add(e.page);
    return own;
  });

  // Reparto por rondas (una por dimensión y ronda) hasta el máximo, para que ninguna acapare la lista.
  const chosen = new Set<string>();
  let count = 0;
  for (let round = 0; count < data.limits.pagesMax; round += 1) {
    let added = false;
    for (const own of candidates) {
      const entry = own[round];
      if (entry && count < data.limits.pagesMax) {
        chosen.add(entry.page);
        count += 1;
        added = true;
      }
    }
    if (!added) break;
  }

  const pages: RecommendedPage[] = focus.flatMap((d, i) =>
    (candidates[i] ?? [])
      .filter((e) => chosen.has(e.page))
      .map((e) => ({ page: e.page, why: e.why, dimension: d.id })),
  );
  return { focus, deferred, pages, quick: quickPage(data, focus), keepingUp: false };
}

function quickPage(data: MaturityData, focus: DimensionScore[]): RecommendedPage {
  for (const d of focus) {
    const q = data.quick.find((e) => e.dimension === d.id);
    if (q) return { page: q.page, why: q.why, dimension: d.id };
  }
  return { page: data.quickFallback.page, why: data.quickFallback.why, dimension: null };
}

// ---------------------------------------------------------------------------------------------
// Texto de resumen para el anuncio (aria-live)
// ---------------------------------------------------------------------------------------------

export function summarizeResult(score: MaturityScore, rec: Recommendation): string {
  if (!score.outcome) {
    return `Faltan ${score.questionCount - score.answeredCount} respuestas para ver el resultado.`;
  }
  const level = score.outcome.level.label;
  const focus =
    rec.focus.length > 0
      ? ` Más recorrido: ${rec.focus.map((d) => d.label).join(', ')}.`
      : ' No hay huecos evidentes en tus respuestas.';
  const n = rec.pages.length;
  return `Resultado: ${level}, con ${score.total} de ${score.max} puntos.${focus} ${n} ${
    n === 1 ? 'página recomendada' : 'páginas recomendadas'
  }.`;
}

// ---------------------------------------------------------------------------------------------
// Estado guardado en el navegador
// ---------------------------------------------------------------------------------------------

export const MATURITY_STORAGE_KEY = 'maturity';

export interface StoredMaturity {
  version: number;
  answers: Answers;
}

export function toStored(data: MaturityData, answers: Answers): StoredMaturity {
  return { version: data.version, answers: sanitizeAnswers(data, answers) };
}

/**
 * Valida lo leído de `localStorage`: debe ser de la versión actual; se descartan respuestas a
 * preguntas u opciones que ya no existen. Devuelve `null` si no es utilizable.
 */
export function parseStored(data: MaturityData, raw: unknown): Answers | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record['version'] !== data.version) return null;
  return sanitizeAnswers(data, record['answers']);
}

/** Índice (desde 0) de la primera pregunta sin responder; el de la última si ya están todas. */
export function firstUnanswered(data: MaturityData, answers: Answers): number {
  const clean = sanitizeAnswers(data, answers);
  const i = data.questions.findIndex((q) => clean[q.id] === undefined);
  return i === -1 ? data.questions.length - 1 : i;
}
