import { z } from 'astro/zod';
import type { DiffPart } from './diff';

/**
 * Lógica pura del laboratorio antes/después: esquema de los casos, localización de las anclas
 * (fragmentos literales del texto que cada anotación explica) y troceado del texto en partes
 * normales y resaltadas. Sin DOM ni React.
 */

// --- Datos -------------------------------------------------------------------------------------

/** Texto no vacío y sin espacios en los extremos: los desplazamientos de las anclas dependen de ello. */
const nonEmpty = z
  .string()
  .min(1)
  .refine((s) => s === s.trim(), 'No puede empezar ni acabar con espacios.');

export const annotationSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** Fragmento LITERAL del «después» que la anotación explica. */
  ancla: nonEmpty,
  /** Fragmento LITERAL del «antes» que el cambio sustituye o elimina (opcional). */
  anclaAntes: nonEmpty.optional(),
  titulo: nonEmpty,
  texto: nonEmpty,
  /** Lección de M3 que explica el principio: ruta interna sin `base` ni barras, p. ej. `m3-prompting/principios`. */
  principio: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/),
});

export const promptCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  titulo: nonEmpty,
  /** Para qué se usa el prompt. */
  escenario: nonEmpty,
  antes: nonEmpty,
  despues: nonEmpty,
  anotaciones: z.array(annotationSchema).min(1),
});

export const promptLabSchema = z.array(promptCaseSchema).min(1);

export type PromptAnnotation = z.infer<typeof annotationSchema>;
export type PromptCase = z.infer<typeof promptCaseSchema>;

// --- Anclas ------------------------------------------------------------------------------------

/** Rango de caracteres [start, end) dentro de un texto. */
export interface Range {
  start: number;
  end: number;
}

/** Número de veces que `fragment` aparece en `text` (cuenta también las apariciones solapadas). */
export function countOccurrences(text: string, fragment: string): number {
  if (fragment === '') return 0;
  let count = 0;
  let from = text.indexOf(fragment);
  while (from !== -1) {
    count++;
    from = text.indexOf(fragment, from + 1);
  }
  return count;
}

/**
 * Posición de la primera aparición literal de `ancla` en `text`; `null` si no aparece o si el
 * ancla es una cadena vacía. La comparación distingue mayúsculas y espacios: es literal a propósito.
 */
export function locateAnchor(text: string, ancla: string): Range | null {
  if (ancla === '') return null;
  const start = text.indexOf(ancla);
  return start === -1 ? null : { start, end: start + ancla.length };
}

export interface AnchorMatch {
  id: string;
  range: Range;
}

export interface AnchorReport {
  /** Anclas encontradas, en el orden de entrada. */
  matches: AnchorMatch[];
  /** Ids de las anclas que no aparecen en el texto. */
  missing: string[];
  /** Pares de ids cuyos rangos se solapan (compartir un solo carácter ya cuenta). */
  overlaps: Array<[string, string]>;
}

/** Dos rangos [start, end) se solapan si comparten al menos un carácter; si solo se tocan, no. */
export function rangesOverlap(a: Range, b: Range): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Localiza varias anclas en el mismo texto e informa de las ausentes y de los solapes. */
export function locateAnchors(
  text: string,
  items: ReadonlyArray<{ id: string; ancla: string }>,
): AnchorReport {
  const matches: AnchorMatch[] = [];
  const missing: string[] = [];
  for (const item of items) {
    const range = locateAnchor(text, item.ancla);
    if (range) matches.push({ id: item.id, range });
    else missing.push(item.id);
  }
  const overlaps: Array<[string, string]> = [];
  for (let i = 0; i < matches.length; i++) {
    for (let j = i + 1; j < matches.length; j++) {
      if (rangesOverlap(matches[i]!.range, matches[j]!.range))
        overlaps.push([matches[i]!.id, matches[j]!.id]);
    }
  }
  return { matches, missing, overlaps };
}

/**
 * Problemas de un caso, en frases (lista vacía = caso válido): textos con espacios sobrantes
 * (los desplazamientos de las anclas se calculan sobre el texto tal cual), ids repetidos, anclas
 * ausentes o ambiguas (más de una aparición) y anclas del «después» que se solapan.
 */
export function validateCase(caso: PromptCase): string[] {
  const problems: string[] = [];
  const where = `Caso «${caso.id}»`;
  if (caso.antes !== caso.antes.trim())
    problems.push(`${where}: «antes» tiene espacios al principio o al final.`);
  if (caso.despues !== caso.despues.trim())
    problems.push(`${where}: «después» tiene espacios al principio o al final.`);

  const ids = caso.anotaciones.map((a) => a.id);
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) {
    problems.push(`${where}: la anotación «${id}» está repetida.`);
  }

  for (const a of caso.anotaciones) {
    const after = countOccurrences(caso.despues, a.ancla);
    if (after === 0) problems.push(`${where}: el ancla de «${a.id}» no aparece en el «después».`);
    if (after > 1) problems.push(`${where}: el ancla de «${a.id}» aparece ${after} veces en el «después».`);
    if (a.anclaAntes !== undefined) {
      const before = countOccurrences(caso.antes, a.anclaAntes);
      if (before === 0)
        problems.push(`${where}: el ancla del «antes» de «${a.id}» no aparece en el «antes».`);
      if (before > 1) problems.push(`${where}: el ancla del «antes» de «${a.id}» aparece ${before} veces.`);
    }
  }

  const report = locateAnchors(caso.despues, caso.anotaciones);
  for (const [x, y] of report.overlaps) problems.push(`${where}: las anclas de «${x}» y «${y}» se solapan.`);
  return problems;
}

// --- Troceado ----------------------------------------------------------------------------------

/** Trozo de texto con su tipo de diferencia (`same` si no hay diff) y si pertenece a la ancla activa. */
export interface Segment {
  text: string;
  kind: DiffPart['kind'];
  highlighted: boolean;
}

/**
 * Parte las `parts` (cuyos textos, unidos, forman el texto completo) en trozos normales y
 * resaltados según `range`. Un trozo del diff que cruza el límite del rango se divide en dos o tres,
 * conservando su `kind`. Con `range` nulo o vacío nada se resalta. Las partes vacías se descartan.
 * Unir los `text` del resultado devuelve siempre el texto original.
 */
export function segmentParts(parts: ReadonlyArray<DiffPart>, range: Range | null): Segment[] {
  const out: Segment[] = [];
  const active = range !== null && range.end > range.start ? range : null;
  let offset = 0;
  for (const part of parts) {
    const start = offset;
    const end = offset + part.text.length;
    offset = end;
    if (part.text === '') continue;
    if (!active || active.end <= start || active.start >= end) {
      out.push({ text: part.text, kind: part.kind, highlighted: false });
      continue;
    }
    const cutStart = Math.max(active.start, start) - start;
    const cutEnd = Math.min(active.end, end) - start;
    if (cutStart > 0) out.push({ text: part.text.slice(0, cutStart), kind: part.kind, highlighted: false });
    out.push({ text: part.text.slice(cutStart, cutEnd), kind: part.kind, highlighted: true });
    if (cutEnd < part.text.length)
      out.push({ text: part.text.slice(cutEnd), kind: part.kind, highlighted: false });
  }
  return out;
}

/** Como `segmentParts` para un texto sin diferencias (vistas «Antes» y «Después»). */
export function segmentText(text: string, range: Range | null): Segment[] {
  return segmentParts([{ text, kind: 'same' }], range);
}

/** Rangos que activan una anotación en el «antes» y en el «después» (`null` si no hay ancla). */
export function annotationRanges(
  caso: PromptCase,
  annotationId: string,
): { antes: Range | null; despues: Range | null } {
  const a = caso.anotaciones.find((x) => x.id === annotationId);
  if (!a) return { antes: null, despues: null };
  return {
    antes: a.anclaAntes === undefined ? null : locateAnchor(caso.antes, a.anclaAntes),
    despues: locateAnchor(caso.despues, a.ancla),
  };
}
