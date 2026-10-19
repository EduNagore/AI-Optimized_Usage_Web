import { z } from 'astro/zod';
import { STORAGE_PREFIX } from './storage';

/**
 * Lógica pura de los quizzes y de su progreso. No toca `localStorage`, ni el DOM, ni React: la isla
 * inyecta la lectura y la escritura con `storage.ts` y aquí solo se valida, se reduce y se resume.
 */

/* ------------------------------------------------------------------------------------------------
 * Formato de `src/data/quizzes.json` (para quien redacte los quizzes de los demás módulos)
 *
 * Un array de registros, uno por módulo (o más, si un módulo necesita varios):
 *
 *   {
 *     "id": "m2-metodo",                 // único; minúsculas, cifras y guiones. Es la clave del progreso.
 *     "modulo": "m2-metodo",             // carpeta del módulo en src/content/docs/ (como en modules.ts)
 *     "titulo": "Quiz del módulo 2: El método",
 *     "preguntas": [                     // de 5 a 8, en el orden en que se muestran (no se baraja)
 *       {
 *         "pregunta": "Enunciado: comprueba comprensión, no memoria de una cifra.",
 *         "opciones": ["…", "…", "…"],   // de 2 a 5, todas distintas
 *         "correcta": 1,                 // índice desde 0 de la opción correcta
 *         "explicacion": "Por qué es correcta y por qué fallan las demás.",
 *         "leccion": "m2-metodo/ciclo-de-7-pasos"   // opcional: ruta sin `base` ni barra final; debe existir
 *       }
 *     ]
 *   }
 *
 * Reglas de redacción: sin cifras volátiles (precios, límites, versiones) en preguntas ni explicaciones;
 * la respuesta correcta y su explicación deben poder sostenerse con una frase de la lección citada en
 * `leccion`. Si cambias el texto, las opciones o la respuesta correcta de una pregunta, el progreso
 * guardado de ese quiz se descarta solo (cambia su hash).
 * ---------------------------------------------------------------------------------------------- */

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Solo minúsculas, cifras y guiones.');
/** Ruta interna de una lección: `carpeta/pagina`, sin `base`, sin barras iniciales ni finales. */
const lessonPath = z.string().regex(/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/, 'Ruta sin barras iniciales ni finales.');

export const quizQuestionSchema = z
  .object({
    pregunta: z.string().trim().min(1),
    opciones: z.array(z.string().trim().min(1)).min(2).max(5),
    correcta: z.number().int().min(0),
    explicacion: z.string().trim().min(1),
    leccion: lessonPath.optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (q.correcta >= q.opciones.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['correcta'],
        message: 'La respuesta correcta está fuera de rango.',
      });
    }
    if (new Set(q.opciones).size !== q.opciones.length) {
      ctx.addIssue({ code: 'custom', path: ['opciones'], message: 'Hay opciones repetidas.' });
    }
  });

export const quizRecordSchema = z
  .object({
    id: slug,
    modulo: slug,
    titulo: z.string().trim().min(1),
    preguntas: z.array(quizQuestionSchema).min(5).max(8),
  })
  .strict()
  .superRefine((quiz, ctx) => {
    const texts = quiz.preguntas.map((q) => q.pregunta);
    if (new Set(texts).size !== texts.length) {
      ctx.addIssue({ code: 'custom', path: ['preguntas'], message: 'Hay enunciados repetidos.' });
    }
  });

export const quizzesSchema = z.array(quizRecordSchema).superRefine((quizzes, ctx) => {
  const ids = quizzes.map((q) => q.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', message: 'Hay ids de quiz repetidos.' });
  }
});

export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type QuizRecord = z.infer<typeof quizRecordSchema>;

/* ------------------------------------------------------------------------------------------------
 * Hash del contenido
 * ---------------------------------------------------------------------------------------------- */

/**
 * FNV-1a de 32 bits sobre los bytes UTF-8 del texto, en hexadecimal de 8 cifras. No es criptográfico:
 * solo detecta que el contenido de un quiz ha cambiado. Vectores publicados: "" -> 811c9dc5,
 * "a" -> e40c292c, "foobar" -> bf9cf968.
 */
export function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Hash del contenido que determina la validez de las respuestas: enunciados, opciones y correcta. */
export function hashQuiz(preguntas: readonly QuizQuestion[]): string {
  return hashText(JSON.stringify(preguntas.map((q) => [q.pregunta, q.opciones, q.correcta])));
}

/** Id estable de un quiz sin `id` explícito (el de MDX en línea), derivado de su contenido. */
export function derivedQuizId(preguntas: readonly QuizQuestion[]): string {
  return `q-${hashQuiz(preguntas)}`;
}

/**
 * Texto de enlace deducido de la ruta de una lección cuando no se conoce su título:
 * `m2-metodo/ciclo-de-7-pasos` -> «Ciclo de 7 pasos».
 */
export function lessonLabel(path: string): string {
  const last = path.split('/').filter(Boolean).pop() ?? path;
  const text = last.replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Clave de `localStorage` del progreso de un quiz. */
export function quizKey(id: string): string {
  return `${STORAGE_PREFIX}quiz:${id}`;
}

/* ------------------------------------------------------------------------------------------------
 * Estado guardado
 * ---------------------------------------------------------------------------------------------- */

export const STATE_VERSION = 1;

/** Lo que se guarda: respuesta elegida (o `null`) y si está comprobada, por posición de pregunta. */
export interface QuizState {
  v: typeof STATE_VERSION;
  hash: string;
  answers: (number | null)[];
  checked: boolean[];
}

export function initialState(preguntas: readonly QuizQuestion[]): QuizState {
  return {
    v: STATE_VERSION,
    hash: hashQuiz(preguntas),
    answers: preguntas.map(() => null),
    checked: preguntas.map(() => false),
  };
}

/**
 * Valida un valor leído del almacenamiento contra el quiz actual. Devuelve `null` si no sirve: no es
 * un objeto, la versión no es la actual (cuando exista la 2 se migrará aquí, antes de validar), el
 * hash del contenido es otro, las longitudes no cuadran, una respuesta está fuera de rango o hay una
 * pregunta comprobada sin respuesta. Nunca lanza.
 */
export function restoreState(raw: unknown, preguntas: readonly QuizQuestion[]): QuizState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;
  if (candidate['v'] !== STATE_VERSION) return null;
  if (candidate['hash'] !== hashQuiz(preguntas)) return null;
  const { answers, checked } = candidate;
  if (!Array.isArray(answers) || !Array.isArray(checked)) return null;
  if (answers.length !== preguntas.length || checked.length !== preguntas.length) return null;
  for (let i = 0; i < preguntas.length; i++) {
    const answer: unknown = answers[i];
    const isChecked: unknown = checked[i];
    if (typeof isChecked !== 'boolean') return null;
    if (answer !== null) {
      const optionCount = preguntas[i]?.opciones.length ?? 0;
      if (typeof answer !== 'number' || !Number.isInteger(answer) || answer < 0 || answer >= optionCount) {
        return null;
      }
    }
    if (isChecked && answer === null) return null;
  }
  return {
    v: STATE_VERSION,
    hash: candidate['hash'] as string,
    answers: answers as (number | null)[],
    checked: checked as boolean[],
  };
}

/* ------------------------------------------------------------------------------------------------
 * Reductor
 * ---------------------------------------------------------------------------------------------- */

export type QuizAction =
  /** Elige una opción. Se ignora si la pregunta ya está comprobada o los índices no existen. */
  | { type: 'answer'; question: number; option: number }
  /** Comprueba una pregunta. Se ignora si no hay respuesta o ya estaba comprobada. */
  | { type: 'check'; question: number }
  /** Vuelve al estado inicial. */
  | { type: 'reset' }
  /** Sustituye el estado por otro ya validado con `restoreState`. */
  | { type: 'load'; state: QuizState };

/**
 * Función pura: devuelve el mismo objeto si la acción no cambia nada (React no vuelve a pintar ni la
 * isla vuelve a escribir) y uno nuevo si cambia. No muta el estado recibido.
 */
export function quizReducer(
  state: QuizState,
  action: QuizAction,
  preguntas: readonly QuizQuestion[],
): QuizState {
  switch (action.type) {
    case 'answer': {
      const q = preguntas[action.question];
      if (!q || state.checked[action.question]) return state;
      if (!Number.isInteger(action.option) || action.option < 0 || action.option >= q.opciones.length) {
        return state;
      }
      if (state.answers[action.question] === action.option) return state;
      return { ...state, answers: state.answers.map((a, i) => (i === action.question ? action.option : a)) };
    }
    case 'check': {
      if (!preguntas[action.question]) return state;
      if (state.answers[action.question] === null || state.answers[action.question] === undefined)
        return state;
      if (state.checked[action.question]) return state;
      return { ...state, checked: state.checked.map((c, i) => (i === action.question ? true : c)) };
    }
    case 'reset':
      return initialState(preguntas);
    case 'load':
      return action.state;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Resúmenes
 * ---------------------------------------------------------------------------------------------- */

export interface QuizSummary {
  /** Preguntas del quiz. */
  total: number;
  /** Preguntas con una opción elegida (comprobadas o no). */
  answered: number;
  /** Preguntas comprobadas. */
  checked: number;
  /** Comprobadas y acertadas. */
  correct: number;
  /** Posiciones (desde 0) de las comprobadas y falladas. */
  failed: number[];
  /** Primera pregunta sin comprobar (desde 0), o `null` si no queda ninguna. */
  next: number | null;
  /** Todas comprobadas (y al menos una pregunta). */
  completed: boolean;
}

export function summarizeQuiz(state: QuizState, preguntas: readonly QuizQuestion[]): QuizSummary {
  let answered = 0;
  let checked = 0;
  let correct = 0;
  let next: number | null = null;
  const failed: number[] = [];
  preguntas.forEach((q, i) => {
    if (state.answers[i] !== null && state.answers[i] !== undefined) answered++;
    if (state.checked[i]) {
      checked++;
      if (state.answers[i] === q.correcta) correct++;
      else failed.push(i);
    } else if (next === null) {
      next = i;
    }
  });
  return {
    total: preguntas.length,
    answered,
    checked,
    correct,
    failed,
    next,
    completed: preguntas.length > 0 && checked === preguntas.length,
  };
}

export interface ProgressTotals {
  /** Quizzes contados. */
  quizzes: number;
  /** Quizzes con todas las preguntas comprobadas. */
  completed: number;
  /** Preguntas de todos ellos. */
  questions: number;
  /** Preguntas comprobadas. */
  checked: number;
  /** Aciertos entre las comprobadas. */
  correct: number;
}

export interface ModuleProgress extends ProgressTotals {
  modulo: string;
}

export interface ProgressReport {
  global: ProgressTotals;
  /** En el orden en que aparece cada módulo en `quizzes`. */
  modules: ModuleProgress[];
}

const emptyTotals = (): ProgressTotals => ({
  quizzes: 0,
  completed: 0,
  questions: 0,
  checked: 0,
  correct: 0,
});

function addTo(totals: ProgressTotals, summary: QuizSummary): void {
  totals.quizzes += 1;
  totals.completed += summary.completed ? 1 : 0;
  totals.questions += summary.total;
  totals.checked += summary.checked;
  totals.correct += summary.correct;
}

/**
 * Agrega el progreso por módulo y global. `states` asocia el id de cada quiz con su estado ya validado;
 * un quiz sin estado cuenta como sin empezar (sus preguntas suman al total).
 */
export function aggregateProgress(
  quizzes: readonly QuizRecord[],
  states: Readonly<Record<string, QuizState | undefined>>,
): ProgressReport {
  const global = emptyTotals();
  const byModule = new Map<string, ModuleProgress>();
  for (const quiz of quizzes) {
    const summary = summarizeQuiz(states[quiz.id] ?? initialState(quiz.preguntas), quiz.preguntas);
    addTo(global, summary);
    let entry = byModule.get(quiz.modulo);
    if (!entry) {
      entry = { modulo: quiz.modulo, ...emptyTotals() };
      byModule.set(quiz.modulo, entry);
    }
    addTo(entry, summary);
  }
  return { global, modules: [...byModule.values()] };
}

/** Porcentaje entero (0–100) de preguntas comprobadas; 0 si no hay preguntas. */
export function progressPercent(totals: Pick<ProgressTotals, 'checked' | 'questions'>): number {
  return totals.questions === 0 ? 0 : Math.round((100 * totals.checked) / totals.questions);
}
