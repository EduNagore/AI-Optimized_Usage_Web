import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  OTHER_TASK_ID,
  buildSelectorData,
  checkAnswers,
  defaultAnswers,
  deriveEffortOrder,
  exampleAnswers,
  findTableRow,
  formatDefaults,
  oneLineSummary,
  parseRationale,
  parseRules,
  priceNotes,
  recommend,
  summaryText,
  validateSelectorData,
  type Answers,
  type Pick,
  type Recommendation,
  type SelectorData,
} from '../src/lib/model-selector';
import type {
  EffortRecord,
  ModelPricingDetailRecord,
  ModelRecord,
  SourceRecord,
  TaskMatrixRecord,
} from '../src/lib/schemas';

const load = <T>(name: string): T => JSON.parse(readFileSync(`src/data/${name}.json`, 'utf8')) as T;
const models = load<ModelRecord[]>('models');
const sources = load<SourceRecord[]>('sources');
const tasks = load<TaskMatrixRecord[]>('task-matrix');
const rawRules = load<unknown>('selector-rules');

const data: SelectorData = buildSelectorData({
  rawRules,
  models,
  details: load<ModelPricingDetailRecord[]>('model-pricing-details'),
  effort: load<EffortRecord[]>('effort'),
  tasks,
  sources,
});

const fresh = (): SelectorData => structuredClone(data);
const rec = (answers: Answers, d: SelectorData = data): Recommendation => {
  const result = recommend(answers, d);
  if (!result.ok) throw new Error(result.errors.join(' | '));
  return result.recommendation;
};
const task = (taskId: string, overrides: Partial<Answers> = {}): Answers => ({
  ...defaultAnswers(data.rules, taskId),
  ...overrides,
});
const other = (overrides: Partial<Answers> = {}): Answers => task(OTHER_TASK_ID, overrides);
const ids = (r: Recommendation) => r.picks.map((p) => p.model.id);
const levels = (r: Recommendation) => r.picks.map((p) => p.effort.level);
const byProvider = (r: Recommendation, provider: string) =>
  r.alternatives.find((a) => a.provider === provider)!;

describe('datos de las reglas', () => {
  it('selector-rules.json cumple su esquema y es coherente con models, effort, matriz y fuentes', () => {
    expect(validateSelectorData(data)).toEqual([]);
  });

  it('cada fuente citada por las reglas existe en sources.json', () => {
    const known = new Set(sources.map((s) => s.id));
    for (const rule of data.rules.modifiers) for (const s of rule.sources) expect(known.has(s)).toBe(true);
  });

  it('los modificadores son recomendaciones de la guía con su porqué y su fecha', () => {
    for (const rule of data.rules.modifiers) {
      expect(rule.claim).toBe('recomendacion');
      expect(rule.why.length).toBeGreaterThan(20);
      expect(rule.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('rechaza un registro con un tipo desconocido', () => {
    expect(() => parseRules([{ id: 'x', kind: 'otro' }])).toThrow();
  });

  it('detecta datos incoherentes: modelo inexistente, modelo de acceso limitado y nivel desconocido', () => {
    const bad = fresh();
    bad.tasks[0]!.models = ['no-existe'];
    expect(validateSelectorData(bad).join(' ')).toMatch(/no existe/);
    const limited = fresh();
    limited.tasks[0]!.models = ['mythos-5-1'];
    expect(validateSelectorData(limited).join(' ')).toMatch(/acceso limitado/);
    const level = fresh();
    level.tasks[0]!.effort = 'turbo';
    expect(validateSelectorData(level).join(' ')).toMatch(/«turbo»/);
  });

  it('el orden global de esfuerzo intercala los tres proveedores', () => {
    // OpenAI es la lista más larga (none, low, medium, high, xhigh, max); Anthropic y Google son subconjuntos.
    expect(data.effortOrder).toEqual(['none', 'low', 'medium', 'high', 'xhigh', 'max']);
    expect(
      deriveEffortOrder([
        { levels: [{ name: 'a' }, { name: 'c' }] },
        { levels: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] },
      ] as EffortRecord[]),
    ).toEqual(['a', 'b', 'c']);
  });

  it('separa el razonamiento de una fila de su cola de fuentes', () => {
    // «Texto. Recomendación de la guía. Fuentes: a, b.» → razonamiento y [a, b].
    expect(parseRationale('Texto. Recomendación de la guía. Fuentes: a, b.')).toEqual({
      why: 'Texto. Recomendación de la guía.',
      sourceIds: ['a', 'b'],
    });
    expect(parseRationale('Sin fuentes.')).toEqual({ why: 'Sin fuentes.', sourceIds: [] });
  });

  it('Batch no tiene dato verificado para Google', () => {
    for (const m of data.models.filter((x) => x.provider === 'google')) expect(m.batchFactor).toBeNull();
    for (const m of data.models.filter((x) => x.provider !== 'google')) expect(m.batchFactor).toBe(0.5);
  });
});

describe('una prueba por fila de la matriz: con las respuestas neutras se devuelve esa fila', () => {
  it.each(tasks.map((t) => [t.id, t] as const))('%s', (_id, row) => {
    const r = rec(task(row.id));
    expect(r.mode).toBe('task');
    expect(r.title).toBe(row.taskType);
    expect(r.surface).toBe(row.surface);
    expect(r.surfaceFixed).toBe(true);
    expect(r.verification).toBe(row.verification);
    expect(ids(r)).toEqual(row.models);
    // El nivel de la fila existe en todos sus modelos: no hay adaptaciones.
    expect(levels(r)).toEqual(row.models.map(() => row.effort));
    expect(r.picks.every((p) => p.effort.status === 'ok' && !p.effort.raisedByFloor)).toBe(true);
    expect(r.rules).toEqual([]);
    expect(r.batch).toBeNull();
    expect(r.reasoning[0]).not.toMatch(/Fuentes:/);
    expect(r.guideSourceIds).toEqual(parseRationale(row.rationale).sourceIds);
  });
});

describe('estado inicial de ejemplo', () => {
  it('es una tarea de la matriz, con respuestas válidas y recomendación visible', () => {
    const a = exampleAnswers(data.rules);
    expect(a.taskId).toBe('extraccion-en-volumen');
    expect(a.volume).toBe('masivo');
    expect(a.latency).toBe('espera');
    expect(checkAnswers(a, data)).toEqual([]);
    const r = rec(a);
    expect(oneLineSummary(r)).toContain('Claude Haiku 5.5 (low)');
  });
});

describe('modificadores, calculados a mano', () => {
  it('volumen masivo y puede esperar: lotes con el 50 % solo donde hay dato (Anthropic y OpenAI)', () => {
    // Extracción: Haiku 5.5 (0,1 / 0,5), GPT-6 Luna (0,1 / 0,5) y Gemini 3.8 Flash.
    // Lotes ×0,5: 0,1 × 0,5 = 0,05 y 0,5 × 0,5 = 0,25. Google no tiene factor verificado.
    const r = rec(exampleAnswers(data.rules));
    expect(r.rules.map((x) => x.id)).toEqual(['lotes', 'volumen-masivo']);
    expect(r.batch!.items.map((i) => [i.model.id, i.input, i.output])).toEqual([
      ['haiku-5-5', 0.05, 0.25],
      ['gpt-6-luna', 0.05, 0.25],
    ]);
    expect(r.batch!.unavailable).toEqual(['Google']);
    expect(r.notices.some((n) => n.text.includes('No hay dato verificado de lotes para Google'))).toBe(true);
    expect(r.notices.some((n) => n.text.includes('hasta 24 horas'))).toBe(true);
  });

  it('lotes con modelos de 2 $ / 10 $: 2 × 0,5 = 1 y 10 × 0,5 = 5', () => {
    const r = rec(task('asistente-interno', { volume: 'masivo', latency: 'espera' }));
    const sonnet = r.batch!.items.find((i) => i.model.id === 'sonnet-5-5')!;
    expect([sonnet.input, sonnet.output]).toEqual([1, 5]);
    const sol = r.batch!.items.find((i) => i.model.id === 'gpt-6-1-sol')!;
    expect([sol.input, sol.output]).toEqual([1, 5]);
  });

  it.each([
    ['volumen repetido', { volume: 'repetido', latency: 'espera' }],
    ['masivo pero con urgencia', { volume: 'masivo', latency: 'inmediata' }],
    ['masivo con minutos', { volume: 'masivo', latency: 'normal' }],
    ['puntual y espera', { volume: 'puntual', latency: 'espera' }],
  ])('no propone lotes si %s', (_label, overrides) => {
    expect(rec(task('clasificacion-masiva', overrides)).batch).toBeNull();
  });

  it('coste del error alto en el correo: sube a la gama equilibrada y a esfuerzo medio como mínimo', () => {
    // Correo: Sonnet 5.5, GPT-6.1 Sol y Gemini 3.8 Flash, todos en low.
    // Mínimo de esfuerzo = medium: low (índice 0) sube a medium (índice 1) en los tres.
    // Mínimo de gama = Equilibrado: Flash (rápido) pasa al primer modelo de Google con gama ≥ equilibrada:
    // Google no tiene equilibrado ni alto, así que es Gemini 4 Argon (frontera).
    const r = rec(task('correo-y-texto-breve', { errorCost: 'alto' }));
    expect(ids(r)).toEqual(['sonnet-5-5', 'gpt-6-1-sol', 'gemini-4-argon']);
    expect(levels(r)).toEqual(['medium', 'medium', 'medium']);
    expect(r.picks.every((p) => p.effort.raisedByFloor)).toBe(true);
    expect(r.rules.map((x) => x.id)).toEqual(['error-alto']);
    expect(r.notices[0]!.tone).toBe('aviso');
    expect(r.notices.some((n) => n.text.includes('Google no tiene gama Equilibrado'))).toBe(true);
    expect(r.notices.some((n) => n.text.includes('Gemini 3.8 Flash sube a Gemini 4 Argon'))).toBe(true);
  });

  it('dificultad alta en la extracción: +1 de esfuerzo y fuera de la gama rápida', () => {
    // Haiku 5.5 / Luna / Flash en low → +1 = medium. Gama mínima equilibrada: Sonnet 5.5, GPT-6.1 Sol y Argon.
    const r = rec(task('extraccion-en-volumen', { difficulty: 'compleja' }));
    expect(ids(r)).toEqual(['sonnet-5-5', 'gpt-6-1-sol', 'gemini-4-argon']);
    expect(levels(r)).toEqual(['medium', 'medium', 'medium']);
    expect(r.picks.some((p) => p.effort.raisedByFloor)).toBe(false);
  });

  it('dificultad baja en el resumen: -1 de esfuerzo, sin cambiar de gama', () => {
    // Resumen: Sonnet 5.5, Sol y Flash en medium → -1 = low.
    const r = rec(task('resumen-documento-largo', { difficulty: 'sencilla' }));
    expect(ids(r)).toEqual(['sonnet-5-5', 'gpt-6-1-sol', 'gemini-3-8-flash']);
    expect(levels(r)).toEqual(['low', 'low', 'low']);
  });

  it('latencia inmediata en programación diaria: -1 de esfuerzo', () => {
    // Sonnet 5.5 y GPT-6.1 Sol en medium → low.
    const r = rec(task('programacion-diaria', { latency: 'inmediata' }));
    expect(levels(r)).toEqual(['low', 'low']);
  });

  it('error caro y latencia inmediata: el mínimo de esfuerzo gana al -1 de la latencia', () => {
    // Resumen en medium: -1 (latencia) = low; mínimo medium (error alto) → medium, marcado como subido por el mínimo.
    const r = rec(task('resumen-documento-largo', { errorCost: 'alto', latency: 'inmediata' }));
    expect(levels(r)).toEqual(['medium', 'medium', 'medium']);
    expect(r.picks.every((p) => p.effort.raisedByFloor)).toBe(true);
    expect(ids(r)).toEqual(['sonnet-5-5', 'gpt-6-1-sol', 'gemini-4-argon']);
  });

  it('dificultad alta y latencia inmediata se compensan (+1 -1 = 0)', () => {
    // Arquitectura: Opus 5.5, Fable 5.1 y Astra en high; +1 y -1 → high.
    const r = rec(
      task('arquitectura-y-depuracion-compleja', { difficulty: 'compleja', latency: 'inmediata' }),
    );
    expect(levels(r)).toEqual(['high', 'high', 'high']);
    expect(r.rules.map((x) => x.id)).toEqual(['dificultad-alta', 'latencia-inmediata']);
  });

  it('error caro y dificultad alta no suman el mínimo: low +1 = medium y el mínimo ya se cumple', () => {
    const r = rec(task('correo-y-texto-breve', { errorCost: 'alto', difficulty: 'compleja' }));
    expect(levels(r)).toEqual(['medium', 'medium', 'medium']);
    expect(r.picks.some((p) => p.effort.raisedByFloor)).toBe(false);
  });

  it('el esfuerzo no sale de la escalera: en el máximo, subir se queda en el máximo', () => {
    // Gemini 4 Argon admite low, medium y high. Contrato en high + dificultad alta: +1 se recorta a high.
    const r = rec(task('revision-de-contrato', { difficulty: 'compleja' }));
    expect(levels(r)).toEqual(['xhigh', 'xhigh', 'high']);
  });

  it('datos sensibles: aviso de la guía, sin afirmar retención y sin cambiar modelos', () => {
    const base = rec(task('resumen-documento-largo'));
    const r = rec(task('resumen-documento-largo', { sensitive: 'si' }));
    expect(ids(r)).toEqual(ids(base));
    expect(levels(r)).toEqual(levels(base));
    const notice = r.notices.find((n) =>
      n.text.includes('política de datos de tu organización y del plan que uses antes de pegar nada'),
    );
    expect(notice?.tone).toBe('aviso');
    expect(notice?.text).toContain('no afirma condiciones de retención de ningún proveedor');
    expect(r.rules.map((x) => x.id)).toEqual(['datos-sensibles']);
  });

  it('volumen masivo con error caro: avisa de que el reintento selectivo exige una señal de fallo fiable', () => {
    const r = rec(task('analisis-de-datos', { volume: 'masivo', errorCost: 'alto' }));
    expect(r.notices.some((n) => n.text.includes('señal de fallo fiable'))).toBe(true);
    expect(r.rules.map((x) => x.id)).toEqual(['error-alto', 'volumen-masivo', 'volumen-con-error-alto']);
  });

  it('error bajo: aconseja medir la alternativa más barata, dirigido a esa sección', () => {
    const r = rec(task('correo-y-texto-breve', { errorCost: 'bajo' }));
    const n = r.notices.find((x) => x.target === 'cheaper');
    expect(n?.tone).toBe('consejo');
  });
});

describe('alternativas más barata y más potente', () => {
  it('correo: Sonnet 5.5 en low ya no puede bajar de esfuerzo, así que baja de gama a Haiku 5.5 (5 % del precio de salida)', () => {
    // Haiku 5.5 sale a 0,5 $ y Sonnet 5.5 a 10 $: 0,5 / 10 = 0,05 → 5 %.
    const a = byProvider(rec(task('correo-y-texto-breve')), 'anthropic');
    expect(a.cheaper.available).toBe(true);
    if (!a.cheaper.available) return;
    expect(a.cheaper.option.kind).toBe('tier');
    expect(a.cheaper.option.model.id).toBe('haiku-5-5');
    expect(a.cheaper.option.level).toBe('low');
    expect(a.cheaper.option.notes.join(' ')).toContain('5 %');
    expect(a.cheaper.option.guidance).toContain('10 % más difícil');
  });

  it('correo con OpenAI: GPT-6.1 Sol baja a GPT-6 Luna (0,5 / 10 = 5 %)', () => {
    const a = byProvider(rec(task('correo-y-texto-breve')), 'openai');
    expect(a.cheaper.available && a.cheaper.option.model.id).toBe('gpt-6-luna');
  });

  it('correo con Google: Flash en low es el escalón más bajo, sin alternativa más barata', () => {
    const a = byProvider(rec(task('correo-y-texto-breve')), 'google');
    expect(a.cheaper.available).toBe(false);
    if (a.cheaper.available) return;
    expect(a.cheaper.reason).toContain('Google');
  });

  it('el esfuerzo es la primera palanca: Sonnet 5.5 en medium baja a low y sube a high', () => {
    const a = byProvider(rec(task('resumen-documento-largo')), 'anthropic');
    expect(a.cheaper.available && [a.cheaper.option.kind, a.cheaper.option.level]).toEqual(['effort', 'low']);
    expect(a.stronger.available && [a.stronger.option.kind, a.stronger.option.level]).toEqual([
      'effort',
      'high',
    ]);
    expect(a.stronger.available && a.stronger.option.guidance).toContain('Cuando falle el razonamiento');
  });

  it('extracción: Haiku 5.5 en low es el suelo; lo más potente es subir a medium', () => {
    const a = byProvider(rec(task('extraccion-en-volumen')), 'anthropic');
    expect(a.cheaper.available).toBe(false);
    expect(a.stronger.available && a.stronger.option.level).toBe('medium');
  });

  it('contrato: Opus 5.5 en high baja a medium y sube a xhigh; Gemini 4 Argon en high es el techo', () => {
    const r = rec(task('revision-de-contrato'));
    const opus = byProvider(r, 'anthropic');
    expect(opus.cheaper.available && opus.cheaper.option.level).toBe('medium');
    expect(opus.stronger.available && opus.stronger.option.level).toBe('xhigh');
    const argon = byProvider(r, 'google');
    expect(argon.stronger.available).toBe(false);
    if (!argon.stronger.available) expect(argon.stronger.reason).toContain('escalón más alto de Google');
  });

  it('con un error caro, el mínimo impide la alternativa más barata en el correo (medium es el suelo)', () => {
    // Sonnet 5.5 sube a medium por el mínimo: bajar a low incumple el mínimo y Haiku 5.5 incumple la gama mínima.
    const a = byProvider(rec(task('correo-y-texto-breve', { errorCost: 'alto' })), 'anthropic');
    expect(a.cheaper.available).toBe(false);
    if (!a.cheaper.available) expect(a.cheaper.reason).toContain('mínimos');
  });

  it('un modelo con esfuerzo sin verificar no propone nivel y su alternativa más potente cambia de gama', () => {
    const d = fresh();
    d.models.find((m) => m.id === 'haiku-5-5')!.effortLevels = [];
    const r = rec(task('extraccion-en-volumen'), d);
    const haiku = r.picks[0]!;
    expect(haiku.effort.level).toBeNull();
    expect(haiku.effort.status).toBe('unverified');
    expect(r.notices.some((n) => n.tone === 'aviso' && n.text.includes('no están verificados'))).toBe(true);
    const a = byProvider(r, 'anthropic');
    expect(a.cheaper.available).toBe(false);
    // Sonnet 5.5 sin nivel pedido usa su valor por defecto de la API: high.
    expect(
      a.stronger.available && [a.stronger.option.kind, a.stronger.option.model.id, a.stronger.option.level],
    ).toEqual(['tier', 'sonnet-5-5', 'high']);
  });

  it('el salto de gama que se salta escalones lo dice (Google no tiene equilibrado ni alto)', () => {
    const d = fresh();
    d.models.find((m) => m.id === 'gemini-3-8-flash')!.effortLevels = ['low'];
    const a = byProvider(rec(task('correo-y-texto-breve'), d), 'google');
    expect(a.stronger.available && a.stronger.option.model.id).toBe('gemini-4-argon');
    expect(a.stronger.available && a.stronger.option.notes.join(' ')).toContain(
      'Google no tiene gama Equilibrado',
    );
  });
});

describe('avisos sobre los modelos', () => {
  it('avisa de un modelo de generación anterior', () => {
    const d = fresh();
    d.tasks.find((t) => t.id === 'correo-y-texto-breve')!.models = ['gpt-5-6-sol'];
    const r = rec(task('correo-y-texto-breve'), d);
    expect(r.picks[0]!.legacy).toBe(true);
    expect(r.notices.some((n) => n.tone === 'aviso' && n.text.includes('Generación anterior'))).toBe(true);
  });

  it('nunca recomienda un modelo de acceso limitado, aunque la fila lo cite', () => {
    const d = fresh();
    d.tasks.find((t) => t.id === 'correo-y-texto-breve')!.models = ['mythos-5-1', 'sonnet-5-5'];
    const r = rec(task('correo-y-texto-breve'), d);
    expect(ids(r)).toEqual(['sonnet-5-5']);
    expect(r.notices.some((n) => n.text.includes('acceso limitado'))).toBe(true);
  });

  it('adapta un nivel que el modelo no admite al más cercano y lo dice', () => {
    // Opus 4.6 no tiene xhigh (low, medium, high, max). Pedido xhigh → el más cercano: high (|3-4| = 1) y max (|5-4| = 1) empatan; gana el menor.
    const d = fresh();
    d.tasks.find((t) => t.id === 'correo-y-texto-breve')!.models = ['opus-4-6'];
    d.tasks.find((t) => t.id === 'correo-y-texto-breve')!.effort = 'xhigh';
    const r = rec(task('correo-y-texto-breve'), d);
    expect(r.picks[0]!.effort.level).toBe('high');
    expect(r.picks[0]!.effort.status).toBe('adjusted');
    expect(r.notices.some((n) => n.text.includes('no admite el nivel xhigh'))).toBe(true);
  });

  it('el esfuerzo por defecto no publicado no se inventa', () => {
    const d = fresh();
    d.models.find((m) => m.id === 'gpt-6-1-sol')!.effortDefaults = {};
    const r = rec(other({ reasoning: 'poco', errorCost: 'alto' }), d);
    const sol = r.picks.find((p) => p.model.id === 'gpt-6-1-sol')!;
    expect(sol.effort.level).toBeNull();
    expect(sol.effort.status).toBe('default-unpublished');
  });

  it('formatDefaults muestra el defecto por superficie', () => {
    const sonnet = rec(task('programacion-diaria')).picks[0]!;
    expect(formatDefaults(sonnet.effort.defaults)).toBe('high (API) · medium (Claude Code)');
    const astra = rec(task('revision-de-contrato')).picks.find((p) => p.model.id === 'gpt-6-astra')!;
    expect(formatDefaults(astra.effort.defaults)).toBe('no publicado');
  });

  it('priceNotes recoge el precio introductorio y el tramo largo', () => {
    const argon = data.models.find((m) => m.id === 'gemini-4-argon')!;
    expect(priceNotes(argon, data)).toEqual([
      'Precio introductorio: desde el 1 de diciembre de 2026 rigen 4 $ de entrada y 20 $ de salida.',
    ]);
    const haiku = data.models.find((m) => m.id === 'haiku-5-5')!;
    expect(priceNotes(haiku, data)).toEqual([
      'Por encima de 100.000 tokens de entrada: 0,50 $ de entrada y 2,50 $ de salida, aplicados a toda la petición.',
    ]);
  });
});

describe('«otra tarea»: solo la tabla de decisión de la página', () => {
  // [razonamiento, coste del error, volumen, fila esperada, ¿figura en la tabla?]
  const cases: [string, string, string, string, boolean][] = [
    ['poco', 'bajo', 'masivo', 'tabla-poco-bajo-alta', true],
    ['poco', 'bajo', 'puntual', 'tabla-poco-bajo-baja', true],
    ['poco', 'medio', 'repetido', 'tabla-poco-medio-alta', true],
    ['poco', 'alto', 'puntual', 'tabla-poco-alto-cualquiera', true],
    ['poco', 'alto', 'masivo', 'tabla-poco-alto-cualquiera', true],
    ['medio', 'medio', 'puntual', 'tabla-medio-medio-cualquiera', true],
    ['medio', 'medio', 'masivo', 'tabla-medio-medio-cualquiera', true],
    ['mucho', 'medio', 'puntual', 'tabla-mucho-medio-baja', true],
    ['mucho', 'alto', 'puntual', 'tabla-mucho-alto-baja', true],
    ['mucho', 'alto', 'masivo', 'tabla-mucho-alto-alta', true],
    // Combinaciones sin fila: gana la más capaz de las filas a menor distancia.
    // (poco, medio, baja): empatan R4 y R5 en capacidad (equilibrada, 102) → la primera de la tabla, R4.
    ['poco', 'medio', 'puntual', 'tabla-poco-alto-cualquiera', false],
    // (medio, bajo, alta): R1 (rápida) y R5 (equilibrada, medium) a distancia 1 → R5.
    ['medio', 'bajo', 'masivo', 'tabla-medio-medio-cualquiera', false],
    // (medio, bajo, baja): R2 (equilibrada, low) y R5 (equilibrada, medium) a distancia 1 → R5.
    ['medio', 'bajo', 'puntual', 'tabla-medio-medio-cualquiera', false],
    // (medio, alto, alta): R4, R5 y R8 a distancia 1 → R8 (gama alta).
    ['medio', 'alto', 'masivo', 'tabla-mucho-alto-alta', false],
    // (medio, alto, baja): R4, R5 y R7 a distancia 1 → R7 (gama alta, high).
    ['medio', 'alto', 'puntual', 'tabla-mucho-alto-baja', false],
    // (mucho, bajo, alta): distancia 2 con R1, R5, R6 y R8 → R6 (gama alta, high) supera a R8 (medium).
    ['mucho', 'bajo', 'masivo', 'tabla-mucho-medio-baja', false],
    // (mucho, bajo, baja): solo R6 a distancia 1.
    ['mucho', 'bajo', 'puntual', 'tabla-mucho-medio-baja', false],
    // (mucho, medio, alta): R5, R6 y R8 a distancia 1 → R6 (high).
    ['mucho', 'medio', 'masivo', 'tabla-mucho-medio-baja', false],
  ];

  it.each(cases)('%s / error %s / volumen %s → %s', (reasoning, errorCost, volume, rowId, exact) => {
    const r = rec(other({ reasoning, errorCost, volume }));
    expect(r.mode).toBe('generic');
    expect(r.rowId).toBe(rowId);
    expect(r.tableMatch!.exact).toBe(exact);
    expect(r.surfaceFixed).toBe(false);
    expect(r.notices.some((n) => n.text.includes('no figura en la tabla de decisión'))).toBe(!exact);
  });

  it('cubre las 18 combinaciones de la tabla, todas con una fila y con modelos', () => {
    for (const reasoning of ['poco', 'medio', 'mucho']) {
      for (const errorCost of ['bajo', 'medio', 'alto']) {
        for (const volume of ['puntual', 'masivo']) {
          const found = findTableRow(other({ reasoning, errorCost, volume }), data);
          expect(found).not.toBeNull();
          expect(rec(other({ reasoning, errorCost, volume })).picks.length).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('poco razonamiento y error barato, una vez: equilibrada o rápida; Google cae en la rápida sin salto', () => {
    // Gamas listadas: Equilibrado y Rápido. Anthropic y OpenAI tienen equilibrado; Google solo rápido (Flash).
    const r = rec(other({ reasoning: 'poco', errorCost: 'bajo', volume: 'puntual' }));
    expect(ids(r)).toEqual(['sonnet-5-5', 'gpt-6-1-sol', 'gemini-3-8-flash']);
    expect(levels(r)).toEqual(['low', 'low', 'low']);
    expect(r.notices.some((n) => n.text.includes('no tiene gama'))).toBe(false);
  });

  it('poco razonamiento y error alto: esfuerzo por defecto de cada modelo, no bajo', () => {
    // Sonnet 5.5: defecto en la API high. GPT-6.1 Sol: medium. Google no tiene gama equilibrada: Argon, defecto medium.
    const r = rec(other({ reasoning: 'poco', errorCost: 'alto', volume: 'puntual' }));
    expect(ids(r)).toEqual(['sonnet-5-5', 'gpt-6-1-sol', 'gemini-4-argon']);
    expect(levels(r)).toEqual(['high', 'medium', 'medium']);
    expect(r.notices.some((n) => n.text.includes('Google no tiene gama Equilibrado'))).toBe(true);
    expect(r.verification).toContain('Verificación automática o humana');
  });

  it('mucho razonamiento, mucho en juego, una vez: alta o frontera, esfuerzo alto, verificación humana', () => {
    // Anthropic: Opus 5.5 (alto). OpenAI no tiene gama alta: lista Frontera → Astra. Google: Argon (frontera).
    const r = rec(other({ reasoning: 'mucho', errorCost: 'alto', volume: 'puntual' }));
    expect(ids(r)).toEqual(['opus-5-5', 'gpt-6-astra', 'gemini-4-argon']);
    expect(levels(r)).toEqual(['high', 'high', 'high']);
    expect(r.verification).toContain('Verificación humana');
  });

  it('mucho razonamiento, mucho en juego y mucha repetición: esfuerzo medio y reintento en alto', () => {
    const r = rec(other({ reasoning: 'mucho', errorCost: 'alto', volume: 'masivo' }));
    expect(levels(r)).toEqual(['medium', 'medium', 'medium']);
    expect(r.notices.some((n) => n.text.includes('señal de fallo fiable'))).toBe(true);
  });

  it('ignora los modificadores de esfuerzo y de gama: la tabla ya los contempla', () => {
    const base = rec(other({ reasoning: 'poco', errorCost: 'alto', volume: 'puntual' }));
    const hard = rec(
      other({
        reasoning: 'poco',
        errorCost: 'alto',
        volume: 'puntual',
        difficulty: 'compleja',
        latency: 'inmediata',
      }),
    );
    expect(ids(hard)).toEqual(ids(base));
    expect(levels(hard)).toEqual(levels(base));
    // «dificultad-alta» no se evalúa (la dificultad no se pregunta); la latencia solo aporta su consejo.
    expect(hard.rules.map((x) => x.id)).toEqual(['error-alto', 'latencia-inmediata']);
  });

  it('mantiene los lotes y el aviso de datos sensibles', () => {
    const r = rec(
      other({
        reasoning: 'poco',
        errorCost: 'bajo',
        volume: 'masivo',
        latency: 'espera',
        sensitive: 'si',
      }),
    );
    expect(r.batch!.items.map((i) => i.model.id)).toEqual(['haiku-5-5', 'gpt-6-luna']);
    expect(r.notices.some((n) => n.text.includes('política de datos'))).toBe(true);
  });
});

describe('entradas inválidas', () => {
  it('devuelve errores explicados y no lanza', () => {
    const result = recommend(task('no-existe'), data);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('no existe');
    const bad = recommend(task('correo-y-texto-breve', { volume: 'siempre' }), data);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0]).toContain('no es válida');
  });

  it('no valida campos que no se preguntan en ese modo', () => {
    expect(checkAnswers(task('correo-y-texto-breve', { reasoning: 'cualquier cosa' }), data)).toEqual([]);
    expect(checkAnswers(other({ difficulty: 'cualquier cosa' }), data)).toEqual([]);
  });
});

describe('invariantes sobre todas las combinaciones', () => {
  const modelIds = new Set(models.map((m) => m.id));
  const limited = new Set(models.filter((m) => m.status === 'acceso-limitado').map((m) => m.id));
  const optionValues = (field: string) =>
    data.rules.questions.fields.find((f) => f.field === field)!.options.map((o) => o.value);
  const floorLevel = (
    data.rules.modifiers
      .find((m) => m.id === 'error-alto')!
      .effects.find((e) => e.type === 'effort-floor') as {
      level: string;
    }
  ).level;
  const order = data.effortOrder;
  const tierFloor = (
    data.rules.modifiers.find((m) => m.id === 'error-alto')!.effects.find((e) => e.type === 'tier-floor') as {
      tier: string;
    }
  ).tier;
  const ladder = data.rules.policy.tierLadder;

  const all: { answers: Answers; r: Recommendation }[] = [];
  for (const taskId of [...tasks.map((t) => t.id), OTHER_TASK_ID]) {
    for (const reasoning of optionValues('reasoning'))
      for (const difficulty of optionValues('difficulty'))
        for (const volume of optionValues('volume'))
          for (const latency of optionValues('latency'))
            for (const errorCost of optionValues('errorCost'))
              for (const sensitive of optionValues('sensitive')) {
                // «reasoning» solo afecta a «otra tarea», «difficulty» solo a las tareas: se evitan repeticiones.
                if (taskId === OTHER_TASK_ID ? difficulty !== 'habitual' : reasoning !== 'medio') continue;
                const answers = task(taskId, {
                  reasoning,
                  difficulty,
                  volume,
                  latency,
                  errorCost,
                  sensitive,
                });
                all.push({ answers, r: rec(answers) });
              }
  }

  const modelsOf = (r: Recommendation) => [
    ...r.picks.map((p) => p.model),
    ...r.alternatives.flatMap((a) =>
      [a.cheaper, a.stronger].flatMap((x) => (x.available ? [x.option.model] : [])),
    ),
    ...(r.batch?.items.map((i) => i.model) ?? []),
  ];
  const rank = (level: string) => order.indexOf(level);

  it('recorre un número razonable de combinaciones', () => {
    expect(all.length).toBeGreaterThan(1500);
  });

  it('todo id devuelto existe en models.json y ningún modelo de acceso limitado se recomienda', () => {
    for (const { r } of all) {
      for (const m of modelsOf(r)) {
        expect(modelIds.has(m.id)).toBe(true);
        expect(limited.has(m.id)).toBe(false);
      }
    }
  });

  it('cada resultado tiene modelos, un solo modelo principal por proveedor y recomendación de la guía', () => {
    for (const { r } of all) {
      expect(r.picks.length).toBeGreaterThan(0);
      const primaries = r.picks.filter((p: Pick) => p.primary).map((p) => p.model.provider);
      expect(new Set(primaries).size).toBe(primaries.length);
      expect(r.alternatives.map((a) => a.provider)).toEqual(primaries);
      expect(r.disclaimer).toContain('no sentencia');
      expect(r.verification.length).toBeGreaterThan(0);
    }
  });

  it('con el coste del error alto, el esfuerzo no baja del mínimo ni la gama de la equilibrada (modo tarea)', () => {
    let checked = 0;
    for (const { answers, r } of all) {
      if (answers.errorCost !== 'alto' || r.mode !== 'task') continue;
      for (const p of r.picks) {
        expect(ladder.indexOf(p.model.tier)).toBeGreaterThanOrEqual(ladder.indexOf(tierFloor));
        if (p.effort.level) {
          expect(rank(p.effort.level)).toBeGreaterThanOrEqual(rank(floorLevel));
          checked++;
        }
      }
      for (const a of r.alternatives) {
        if (a.cheaper.available) {
          const { option } = a.cheaper;
          expect(ladder.indexOf(option.model.tier)).toBeGreaterThanOrEqual(ladder.indexOf(tierFloor));
          if (option.level) expect(rank(option.level)).toBeGreaterThanOrEqual(rank(floorLevel));
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('el nivel propuesto existe siempre entre los niveles verificados del modelo', () => {
    for (const { r } of all) {
      for (const p of r.picks) if (p.effort.level) expect(p.model.effortLevels).toContain(p.effort.level);
      for (const a of r.alternatives)
        for (const x of [a.cheaper, a.stronger])
          if (x.available && x.option.level) expect(x.option.model.effortLevels).toContain(x.option.level);
    }
  });

  it('nunca propone lotes para Google y solo cuando hay volumen y el resultado puede esperar', () => {
    for (const { answers, r } of all) {
      if (r.batch) {
        expect(answers.volume).toBe('masivo');
        expect(answers.latency).toBe('espera');
        for (const i of r.batch.items) {
          expect(i.model.provider).not.toBe('google');
          expect(i.factor).toBe(0.5);
        }
      } else {
        expect(answers.volume === 'masivo' && answers.latency === 'espera').toBe(false);
      }
    }
  });

  it('la alternativa más barata no sube de gama ni de esfuerzo; la más potente no baja', () => {
    for (const { r } of all) {
      for (const a of r.alternatives) {
        const rankTier = (t: string) => ladder.indexOf(t);
        if (a.cheaper.available) {
          const { option } = a.cheaper;
          if (option.kind === 'tier')
            expect(rankTier(option.model.tier)).toBeLessThan(rankTier(a.from.model.tier));
          else expect(rank(option.level!)).toBeLessThan(rank(a.from.level!));
        }
        if (a.stronger.available) {
          const { option } = a.stronger;
          if (option.kind === 'tier')
            expect(rankTier(option.model.tier)).toBeGreaterThan(rankTier(a.from.model.tier));
          else expect(rank(option.level!)).toBeGreaterThan(rank(a.from.level!));
        }
      }
    }
  });

  it('los avisos de aviso van antes que los consejos y no se repiten', () => {
    for (const { r } of all) {
      const tones = r.notices.map((n) => n.tone);
      const firstConsejo = tones.indexOf('consejo');
      if (firstConsejo >= 0) expect(tones.slice(firstConsejo)).not.toContain('aviso');
      expect(new Set(r.notices.map((n) => n.text)).size).toBe(r.notices.length);
    }
  });

  it('es determinista', () => {
    for (const { answers, r } of all.slice(0, 200)) expect(rec(answers)).toEqual(r);
  });

  it('con datos sensibles aparece siempre el aviso y nunca se afirma una retención concreta', () => {
    for (const { answers, r } of all) {
      const has = r.notices.some((n) => n.text.includes('política de datos de tu organización'));
      expect(has).toBe(answers.sensitive === 'si');
      for (const n of r.notices) expect(n.text).not.toMatch(/\b\d+\s*días\b/);
    }
  });
});

describe('texto de resumen', () => {
  it('incluye superficie, modelos con precio, verificación, alternativas, fuente y fecha', () => {
    const r = rec(exampleAnswers(data.rules));
    const text = summaryText(r, data);
    expect(text).toContain('Selector de modelo y esfuerzo: Extracción a tabla o JSON en volumen');
    expect(text).toContain('Superficie: API con lotes y salida estructurada');
    // Haiku 5.5: 0,10 $ de entrada y 0,50 $ de salida por millón de tokens.
    expect(text).toContain(
      '- Claude Haiku 5.5 (Rápido y barato): esfuerzo low; por defecto: medium (API) · medium (Claude Code); 0,10 $ / 0,50 $',
    );
    expect(text).toContain('Cómo verificar: Validación contra el esquema');
    expect(text).toContain('Con lotes:');
    expect(text).toContain('0,05 $ de entrada y 0,25 $ de salida');
    expect(text).toContain('verificados el 16 de octubre de 2026');
    expect(text).toContain('no sentencia');
    expect(text).toContain(data.sources['anthropic-precios']!.url);
  });
});
