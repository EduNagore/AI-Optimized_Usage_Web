import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import quizzesData from '../src/data/quizzes.json';
import { modules } from '../src/lib/modules';
import {
  STATE_VERSION,
  aggregateProgress,
  derivedQuizId,
  hashQuiz,
  hashText,
  initialState,
  lessonLabel,
  progressPercent,
  quizKey,
  quizReducer,
  quizRecordSchema,
  quizzesSchema,
  restoreState,
  summarizeQuiz,
  type QuizAction,
  type QuizQuestion,
  type QuizRecord,
  type QuizState,
} from '../src/lib/quiz-progress';
import { readJson, writeJson } from '../src/lib/storage';

/** Cuatro preguntas con 3, 2, 4 y 3 opciones; correctas: 1, 0, 3 y 2 (índices desde 0). */
const fixture: QuizQuestion[] = [
  { pregunta: 'P0', opciones: ['a', 'b', 'c'], correcta: 1, explicacion: 'e0' },
  { pregunta: 'P1', opciones: ['a', 'b'], correcta: 0, explicacion: 'e1' },
  {
    pregunta: 'P2',
    opciones: ['a', 'b', 'c', 'd'],
    correcta: 3,
    explicacion: 'e2',
    leccion: 'm2-metodo/ciclo-de-7-pasos',
  },
  { pregunta: 'P3', opciones: ['a', 'b', 'c'], correcta: 2, explicacion: 'e3' },
];

const state = (answers: (number | null)[], checked: boolean[]): QuizState => ({
  v: STATE_VERSION,
  hash: hashQuiz(fixture),
  answers,
  checked,
});

const run = (s: QuizState, ...actions: QuizAction[]) =>
  actions.reduce((acc, a) => quizReducer(acc, a, fixture), s);

describe('hash del contenido', () => {
  it('coincide con los vectores publicados de FNV-1a de 32 bits', () => {
    // Vectores de referencia de FNV-1a/32: "" = offset basis (2166136261 = 0x811c9dc5);
    // "a" = 0xe40c292c; "foobar" = 0xbf9cf968.
    expect(hashText('')).toBe('811c9dc5');
    expect(hashText('a')).toBe('e40c292c');
    expect(hashText('foobar')).toBe('bf9cf968');
  });

  it('es estable y cambia si cambia un enunciado, una opción o la respuesta correcta', () => {
    const base = hashQuiz(fixture);
    expect(hashQuiz(fixture.map((q) => ({ ...q })))).toBe(base);
    expect(base).toMatch(/^[0-9a-f]{8}$/);
    const first = fixture[0] as QuizQuestion;
    expect(hashQuiz([{ ...first, pregunta: 'P0 bis' }, ...fixture.slice(1)])).not.toBe(base);
    expect(hashQuiz([{ ...first, opciones: ['a', 'b', 'z'] }, ...fixture.slice(1)])).not.toBe(base);
    expect(hashQuiz([{ ...first, correcta: 0 }, ...fixture.slice(1)])).not.toBe(base);
  });

  it('no cambia si solo cambian la explicación o la lección (no invalidan las respuestas)', () => {
    const first = fixture[0] as QuizQuestion;
    const edited = [
      { ...first, explicacion: 'otra', leccion: 'm2-metodo/errores-de-metodo' },
      ...fixture.slice(1),
    ];
    expect(hashQuiz(edited)).toBe(hashQuiz(fixture));
  });

  it('deriva el id de un quiz sin id y compone la clave de almacenamiento', () => {
    expect(derivedQuizId(fixture)).toBe(`q-${hashQuiz(fixture)}`);
    expect(quizKey('m2-metodo')).toBe('aiuw:quiz:m2-metodo');
  });

  it('deduce un texto de enlace de la ruta de la lección', () => {
    expect(lessonLabel('m2-metodo/ciclo-de-7-pasos')).toBe('Ciclo de 7 pasos');
  });
});

describe('estado inicial y restauración', () => {
  it('el estado inicial no tiene respuestas ni comprobaciones', () => {
    expect(initialState(fixture)).toEqual({
      v: 1,
      hash: hashQuiz(fixture),
      answers: [null, null, null, null],
      checked: [false, false, false, false],
    });
  });

  it('restaura un estado válido tal cual', () => {
    const saved = state([1, 1, 3, 0], [true, true, true, false]);
    // Lo que sale de JSON.parse(JSON.stringify(...)) es lo que se lee del almacenamiento.
    expect(restoreState(JSON.parse(JSON.stringify(saved)), fixture)).toEqual(saved);
  });

  it('descarta lo que no es un estado', () => {
    for (const raw of [null, undefined, 'texto', 42, [], {}, { v: 1 }]) {
      expect(restoreState(raw, fixture)).toBeNull();
    }
  });

  it('descarta un estado de otra versión', () => {
    expect(restoreState({ ...initialState(fixture), v: 2 }, fixture)).toBeNull();
    expect(restoreState({ ...initialState(fixture), v: '1' }, fixture)).toBeNull();
  });

  it('descarta un estado de otro contenido (hash distinto)', () => {
    const saved = initialState(fixture);
    const first = fixture[0] as QuizQuestion;
    const changed = [{ ...first, correcta: 2 }, ...fixture.slice(1)];
    expect(restoreState(saved, changed)).toBeNull();
  });

  it('descarta estados corruptos: longitudes, rangos, tipos y comprobadas sin respuesta', () => {
    // Una respuesta de menos.
    expect(restoreState({ ...initialState(fixture), answers: [null, null, null] }, fixture)).toBeNull();
    // P0 tiene 3 opciones (índices 0..2): el 3 no existe.
    expect(restoreState(state([3, null, null, null], [false, false, false, false]), fixture)).toBeNull();
    // Índice negativo, decimal y texto.
    expect(restoreState(state([-1, null, null, null], [false, false, false, false]), fixture)).toBeNull();
    expect(restoreState(state([1.5, null, null, null], [false, false, false, false]), fixture)).toBeNull();
    expect(
      restoreState(
        {
          ...state([null, null, null, null], [false, false, false, false]),
          answers: ['1', null, null, null],
        },
        fixture,
      ),
    ).toBeNull();
    // Comprobada sin respuesta.
    expect(restoreState(state([null, null, null, null], [true, false, false, false]), fixture)).toBeNull();
    // `checked` no booleano.
    expect(restoreState({ ...initialState(fixture), checked: [0, 0, 0, 0] }, fixture)).toBeNull();
  });
});

describe('reductor', () => {
  it('responde y cambia de opinión antes de comprobar', () => {
    const s = run(
      initialState(fixture),
      { type: 'answer', question: 0, option: 2 },
      { type: 'answer', question: 0, option: 1 },
    );
    expect(s.answers).toEqual([1, null, null, null]);
    expect(s.checked).toEqual([false, false, false, false]);
  });

  it('comprueba solo si hay respuesta y solo una vez', () => {
    const start = initialState(fixture);
    expect(quizReducer(start, { type: 'check', question: 0 }, fixture)).toBe(start);
    const answered = run(start, { type: 'answer', question: 0, option: 1 });
    const checked = quizReducer(answered, { type: 'check', question: 0 }, fixture);
    expect(checked.checked).toEqual([true, false, false, false]);
    expect(quizReducer(checked, { type: 'check', question: 0 }, fixture)).toBe(checked);
  });

  it('no deja cambiar una pregunta ya comprobada', () => {
    const checked = run(
      initialState(fixture),
      { type: 'answer', question: 1, option: 1 },
      { type: 'check', question: 1 },
    );
    expect(quizReducer(checked, { type: 'answer', question: 1, option: 0 }, fixture)).toBe(checked);
  });

  it('ignora índices que no existen y repetir la misma respuesta', () => {
    const start = initialState(fixture);
    expect(quizReducer(start, { type: 'answer', question: 9, option: 0 }, fixture)).toBe(start);
    // P1 tiene 2 opciones: la 2 no existe.
    expect(quizReducer(start, { type: 'answer', question: 1, option: 2 }, fixture)).toBe(start);
    expect(quizReducer(start, { type: 'answer', question: 1, option: -1 }, fixture)).toBe(start);
    expect(quizReducer(start, { type: 'check', question: 9 }, fixture)).toBe(start);
    const once = run(start, { type: 'answer', question: 0, option: 1 });
    expect(quizReducer(once, { type: 'answer', question: 0, option: 1 }, fixture)).toBe(once);
  });

  it('no muta el estado anterior', () => {
    const start = initialState(fixture);
    const frozen = JSON.stringify(start);
    run(start, { type: 'answer', question: 0, option: 1 }, { type: 'check', question: 0 });
    expect(JSON.stringify(start)).toBe(frozen);
  });

  it('reinicia y carga un estado', () => {
    const progress = state([1, 1, 3, 0], [true, true, true, true]);
    expect(quizReducer(progress, { type: 'reset' }, fixture)).toEqual(initialState(fixture));
    expect(quizReducer(initialState(fixture), { type: 'load', state: progress }, fixture)).toBe(progress);
  });
});

describe('resumen de un quiz', () => {
  it('cuenta respondidas, comprobadas, aciertos y falladas', () => {
    // P0: elegida 1, correcta 1 -> acierto. P1: elegida 1, correcta 0 -> fallo.
    // P2: elegida 3, correcta 3 -> acierto. P3: elegida 0 pero sin comprobar.
    const s = summarizeQuiz(state([1, 1, 3, 0], [true, true, true, false]), fixture);
    expect(s).toEqual({
      total: 4,
      answered: 4, // las cuatro tienen opción elegida
      checked: 3, // P3 no está comprobada
      correct: 2, // P0 y P2
      failed: [1], // P1
      next: 3, // la primera sin comprobar es P3
      completed: false,
    });
  });

  it('está completado cuando todas están comprobadas', () => {
    // P3: elegida 2, correcta 2 -> acierto: 3 aciertos de 4 y la única fallada es P1.
    const s = summarizeQuiz(state([1, 1, 3, 2], [true, true, true, true]), fixture);
    expect(s).toMatchObject({ checked: 4, correct: 3, failed: [1], next: null, completed: true });
  });

  it('sin empezar: todo a cero y la siguiente es la primera', () => {
    expect(summarizeQuiz(initialState(fixture), fixture)).toEqual({
      total: 4,
      answered: 0,
      checked: 0,
      correct: 0,
      failed: [],
      next: 0,
      completed: false,
    });
  });

  it('un quiz sin preguntas nunca figura como completado', () => {
    expect(summarizeQuiz(initialState([]), []).completed).toBe(false);
  });
});

function makeQuiz(id: string, modulo: string, n: number): QuizRecord {
  return {
    id,
    modulo,
    titulo: id,
    preguntas: Array.from({ length: n }, (_, i) => ({
      pregunta: `${id} P${i}`,
      opciones: ['sí', 'no'],
      correcta: 0,
      explicacion: 'porque sí',
    })),
  };
}

describe('agregación por módulo y global', () => {
  const a = makeQuiz('a', 'm1', 5);
  const b = makeQuiz('b', 'm1', 6);
  const c = makeQuiz('c', 'm2', 5);

  it('suma preguntas, comprobadas y aciertos por módulo y en total', () => {
    const states = {
      // a: 5 comprobadas, todas con la opción 0 (la correcta) -> 5 aciertos, completado.
      a: { ...initialState(a.preguntas), answers: [0, 0, 0, 0, 0], checked: [true, true, true, true, true] },
      // b: 2 comprobadas: P0 acierto (0) y P1 fallo (1); el resto sin tocar.
      b: {
        ...initialState(b.preguntas),
        answers: [0, 1, null, null, null, null],
        checked: [true, true, false, false, false, false],
      },
      // c: sin estado guardado.
    };
    const report = aggregateProgress([a, b, c], states);
    // Módulo m1: 2 quizzes (1 completado); 5 + 6 = 11 preguntas; 5 + 2 = 7 comprobadas; 5 + 1 = 6 aciertos.
    // Módulo m2: 1 quiz sin empezar con 5 preguntas.
    expect(report.modules).toEqual([
      { modulo: 'm1', quizzes: 2, completed: 1, questions: 11, checked: 7, correct: 6 },
      { modulo: 'm2', quizzes: 1, completed: 0, questions: 5, checked: 0, correct: 0 },
    ]);
    // Global: 3 quizzes, 1 completado, 16 preguntas, 7 comprobadas, 6 aciertos.
    expect(report.global).toEqual({ quizzes: 3, completed: 1, questions: 16, checked: 7, correct: 6 });
  });

  it('sin progreso guardado todo está a cero pero las preguntas cuentan', () => {
    expect(aggregateProgress([a, c], {}).global).toEqual({
      quizzes: 2,
      completed: 0,
      questions: 10,
      checked: 0,
      correct: 0,
    });
    expect(aggregateProgress([], {})).toEqual({
      global: { quizzes: 0, completed: 0, questions: 0, checked: 0, correct: 0 },
      modules: [],
    });
  });

  it('calcula el porcentaje redondeado y 0 si no hay preguntas', () => {
    // 100 * 7 / 16 = 43,75 -> 44. 100 * 7 / 11 = 63,63... -> 64.
    expect(progressPercent({ checked: 7, questions: 16 })).toBe(44);
    expect(progressPercent({ checked: 7, questions: 11 })).toBe(64);
    expect(progressPercent({ checked: 0, questions: 0 })).toBe(0);
    expect(progressPercent({ checked: 5, questions: 5 })).toBe(100);
  });
});

describe('con el almacenamiento real de la isla (storage.ts)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('guarda, lee y restaura el progreso', () => {
    const map = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => void map.set(k, v),
      },
    });
    const progress = state([1, null, null, null], [true, false, false, false]);
    expect(writeJson(quizKey('x'), progress)).toBe(true);
    expect(restoreState(readJson<unknown>(quizKey('x'), null), fixture)).toEqual(progress);
  });

  it('un JSON roto en el almacenamiento se trata como sin progreso', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => '{no es json' } });
    expect(restoreState(readJson<unknown>(quizKey('x'), null), fixture)).toBeNull();
  });

  it('si el almacenamiento lanza, se lee sin progreso y la escritura devuelve false', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('bloqueado');
        },
        setItem: () => {
          throw new Error('cuota');
        },
      },
    });
    expect(restoreState(readJson<unknown>(quizKey('x'), null), fixture)).toBeNull();
    expect(writeJson(quizKey('x'), initialState(fixture))).toBe(false);
  });

  it('sin window (servidor) tampoco falla', () => {
    expect(restoreState(readJson<unknown>(quizKey('x'), null), fixture)).toBeNull();
    expect(writeJson(quizKey('x'), 1)).toBe(false);
  });
});

describe('esquema de quizzes.json', () => {
  const valid = makeQuiz('m1-demo', 'm1-fundamentos', 5);

  it('acepta un registro bien formado', () => {
    expect(quizRecordSchema.safeParse(valid).success).toBe(true);
  });

  it('rechaza respuestas fuera de rango, pocas o demasiadas opciones y textos vacíos', () => {
    const withQuestion = (patch: Partial<QuizQuestion>): QuizRecord => ({
      ...valid,
      preguntas: [{ ...(valid.preguntas[0] as QuizQuestion), ...patch }, ...valid.preguntas.slice(1)],
    });
    // Dos opciones: índices 0 y 1; el 2 no existe.
    expect(quizRecordSchema.safeParse(withQuestion({ correcta: 2 })).success).toBe(false);
    expect(quizRecordSchema.safeParse(withQuestion({ correcta: -1 })).success).toBe(false);
    expect(quizRecordSchema.safeParse(withQuestion({ opciones: ['solo una'], correcta: 0 })).success).toBe(
      false,
    );
    expect(
      quizRecordSchema.safeParse(withQuestion({ opciones: ['a', 'b', 'c', 'd', 'e', 'f'] })).success,
    ).toBe(false);
    expect(quizRecordSchema.safeParse(withQuestion({ opciones: ['a', 'a'] })).success).toBe(false);
    expect(quizRecordSchema.safeParse(withQuestion({ explicacion: '   ' })).success).toBe(false);
    expect(quizRecordSchema.safeParse(withQuestion({ leccion: '/m2-metodo/x/' })).success).toBe(false);
  });

  it('exige de 5 a 8 preguntas distintas', () => {
    expect(quizRecordSchema.safeParse(makeQuiz('q', 'm1', 4)).success).toBe(false);
    expect(quizRecordSchema.safeParse(makeQuiz('q', 'm1', 9)).success).toBe(false);
    expect(quizRecordSchema.safeParse(makeQuiz('q', 'm1', 8)).success).toBe(true);
    const repeated = { ...valid, preguntas: valid.preguntas.map((q) => ({ ...q, pregunta: 'igual' })) };
    expect(quizRecordSchema.safeParse(repeated).success).toBe(false);
  });

  it('rechaza ids repetidos', () => {
    expect(quizzesSchema.safeParse([valid, valid]).success).toBe(false);
    expect(quizzesSchema.safeParse([valid, { ...valid, id: 'otro' }]).success).toBe(true);
  });
});

describe('src/data/quizzes.json', () => {
  const quizzes = quizzesSchema.parse(quizzesData);
  const docsDir = fileURLToPath(new URL('../src/content/docs/', import.meta.url));

  it('cumple el esquema: ids únicos, 2–5 opciones, correcta en rango y explicación no vacía', () => {
    const result = quizzesSchema.safeParse(quizzesData);
    expect(result.error?.issues ?? []).toEqual([]);
    expect(new Set(quizzes.map((q) => q.id)).size).toBe(quizzes.length);
    for (const quiz of quizzes) {
      for (const q of quiz.preguntas) {
        expect(q.opciones.length).toBeGreaterThanOrEqual(2);
        expect(q.opciones.length).toBeLessThanOrEqual(5);
        expect(q.correcta).toBeLessThan(q.opciones.length);
        expect(q.explicacion.trim()).not.toBe('');
      }
    }
  });

  it('cada quiz pertenece a un módulo del temario', () => {
    const dirs = modules.map((m) => m.dir);
    for (const quiz of quizzes) expect(dirs, quiz.id).toContain(quiz.modulo);
  });

  it('cada lección enlazada es una página real', () => {
    for (const quiz of quizzes) {
      for (const q of quiz.preguntas) {
        if (!q.leccion) continue;
        const exists =
          existsSync(`${docsDir}${q.leccion}.mdx`) || existsSync(`${docsDir}${q.leccion}/index.mdx`);
        expect(exists, `${quiz.id}: ${q.leccion}`).toBe(true);
      }
    }
  });

  it('el quiz semilla es el del módulo 2, con seis preguntas y una lección en cada una', () => {
    const m2 = quizzes.find((q) => q.id === 'm2-metodo');
    expect(m2?.modulo).toBe('m2-metodo');
    expect(m2?.preguntas).toHaveLength(6);
    expect(m2?.preguntas.every((q) => q.leccion?.startsWith('m2-metodo/'))).toBe(true);
  });
});
