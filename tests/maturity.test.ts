import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  firstUnanswered,
  maxTotal,
  meetsPercent,
  parseMaturityFile,
  parseStored,
  recommend,
  referencedPages,
  sanitizeAnswers,
  scoreAnswers,
  summarizeResult,
  toStored,
  validateMaturityData,
  type Answers,
  type MaturityData,
} from '../src/lib/maturity';

const data: MaturityData = parseMaturityFile(JSON.parse(readFileSync('src/data/maturity.json', 'utf8')));

/*
 * Orden de las 15 preguntas (índice → dimensión). Cada una puntúa 0–3; hay seis dimensiones de dos
 * preguntas (máximo 6) y calidad con tres (máximo 9): 6 × 6 + 9 = 45 puntos en total.
 *  0-1 metodo · 2-3 prompting · 4-5 modelo · 6-7 tokens · 8-9 herramientas · 10-12 calidad · 13-14 agentes
 */
function answersFromPoints(points: Array<number | undefined>): Answers {
  const out: Answers = {};
  points.forEach((p, i) => {
    const q = data.questions[i];
    if (!q || p === undefined) return;
    const option = q.options.find((o) => o.points === p);
    if (!option) throw new Error(`la pregunta ${q.id} no tiene una opción de ${p} puntos`);
    out[q.id] = option.id;
  });
  return out;
}

const uniform = (p: number) => answersFromPoints(Array.from({ length: 15 }, () => p));
const pts = (score: ReturnType<typeof scoreAnswers>) =>
  Object.fromEntries(score.dimensions.map((d) => [d.id, d.points]));
const ids = (list: Array<{ id: string }>) => list.map((d) => d.id);

describe('puntuación', () => {
  it('el orden de las preguntas es el que suponen estos tests', () => {
    expect(data.questions.map((q) => q.dimension)).toEqual([
      ...['metodo', 'metodo', 'prompting', 'prompting', 'modelo', 'modelo', 'tokens', 'tokens'],
      ...['herramientas', 'herramientas', 'calidad', 'calidad', 'calidad', 'agentes', 'agentes'],
    ]);
    expect(maxTotal(data)).toBe(45);
  });

  it('todo a 0: 0 puntos y primer nivel', () => {
    const s = scoreAnswers(data, uniform(0));
    // 15 preguntas × 0 = 0
    expect(s.total).toBe(0);
    expect(s.complete).toBe(true);
    expect(s.outcome?.level.id).toBe('primeros-pasos');
  });

  it('todo a 3: 45 puntos, máximo en cada dimensión y último nivel', () => {
    const s = scoreAnswers(data, uniform(3));
    // 6 × (2 × 3) + 1 × (3 × 3) = 36 + 9 = 45
    expect(s.total).toBe(45);
    expect(pts(s)).toEqual({
      metodo: 6,
      prompting: 6,
      modelo: 6,
      tokens: 6,
      herramientas: 6,
      calidad: 9,
      agentes: 6,
    });
    expect(s.outcome?.level.id).toBe('uso-optimizado');
  });

  it('todo a 2: 30 puntos y nivel metódico', () => {
    const s = scoreAnswers(data, uniform(2));
    // 15 × 2 = 30; dimensiones: 4+4+4+4+4+6+4 = 30
    expect(s.total).toBe(30);
    expect(pts(s)).toEqual({
      metodo: 4,
      prompting: 4,
      modelo: 4,
      tokens: 4,
      herramientas: 4,
      calidad: 6,
      agentes: 4,
    });
    // 24 ≤ 30 < 36 → metódico; metodo 4/6 y calidad 6/9 superan el 33 % exigido
    expect(s.outcome?.level.id).toBe('uso-con-metodo');
    expect(s.outcome?.limitedBy).toEqual([]);
  });

  it('el perfil de ejemplo suma 18 puntos', () => {
    const s = scoreAnswers(data, data.example.answers);
    // metodo 2+1=3 · prompting 2+1=3 · modelo 1+1=2 · tokens 1+0=1 · herramientas 2+1=3
    // calidad 1+0+2=3 · agentes 2+1=3 → 3+3+2+1+3+3+3 = 18 (tramo 12–23: uso habitual)
    expect(pts(s)).toEqual({
      metodo: 3,
      prompting: 3,
      modelo: 2,
      tokens: 1,
      herramientas: 3,
      calidad: 3,
      agentes: 3,
    });
    expect(s.total).toBe(18);
    expect(s.outcome?.level.id).toBe('uso-habitual');
  });

  it('el total es la suma de las dimensiones', () => {
    const s = scoreAnswers(data, answersFromPoints([3, 1, 0, 2, 3, 3, 1, 1, 2, 0, 3, 1, 2, 0, 3]));
    // metodo 3+1=4 · prompting 0+2=2 · modelo 3+3=6 · tokens 1+1=2 · herramientas 2+0=2
    // calidad 3+1+2=6 · agentes 0+3=3 → 4+2+6+2+2+6+3 = 25
    expect(pts(s)).toEqual({
      metodo: 4,
      prompting: 2,
      modelo: 6,
      tokens: 2,
      herramientas: 2,
      calidad: 6,
      agentes: 3,
    });
    expect(s.total).toBe(25);
  });
});

describe('niveles: límites exactos', () => {
  it('11 puntos es el último de «Primeros pasos» y 12 el primero de «Uso habitual»', () => {
    // 3+3+3+2 = 11
    expect(
      scoreAnswers(data, answersFromPoints([3, 3, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).outcome?.level.id,
    ).toBe('primeros-pasos');
    // 3+3+3+3 = 12
    expect(
      scoreAnswers(data, answersFromPoints([3, 3, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).outcome?.level.id,
    ).toBe('uso-habitual');
  });

  // metodo 3+0=3 · prompting 6 · modelo 6 · tokens 6 · herramientas 0 · calidad 3+0+0=3 · agentes 0
  // total = 3+6+6+6+0+3+0 = 24; metodo 3/6 (300 ≥ 198) y calidad 3/9 (300 ≥ 297) cumplen el 33 %
  const at24 = [3, 0, 3, 3, 3, 3, 3, 3, 0, 0, 3, 0, 0, 0, 0];

  it('24 puntos con los mínimos cumplidos es «Uso metódico»; 23 es «Uso habitual»', () => {
    const s24 = scoreAnswers(data, answersFromPoints(at24));
    expect(s24.total).toBe(24);
    expect(s24.outcome?.level.id).toBe('uso-con-metodo');
    // tokens 3+2 = 5 → total 23
    const at23 = [...at24];
    at23[7] = 2;
    const s23 = scoreAnswers(data, answersFromPoints(at23));
    expect(s23.total).toBe(23);
    expect(s23.outcome?.level.id).toBe('uso-habitual');
    expect(s23.outcome?.limitedBy).toEqual([]);
  });

  it('24 puntos sin nada en calidad: por puntos sería metódico, pero se queda en habitual', () => {
    // 8 preguntas × 3 = 24 (método, prompting, modelo y tokens); calidad 0 (0 % < 33 %)
    const s = scoreAnswers(data, answersFromPoints([3, 3, 3, 3, 3, 3, 3, 3, 0, 0, 0, 0, 0, 0, 0]));
    expect(s.total).toBe(24);
    expect(s.outcome?.byPoints.id).toBe('uso-con-metodo');
    expect(s.outcome?.level.id).toBe('uso-habitual');
    expect(ids(s.outcome?.limitedBy ?? [])).toEqual(['calidad']);
  });

  // metodo 3+1=4 · prompting 6 · modelo 6 · tokens 6 · herramientas 6 · calidad 3+3+0=6 · agentes 2+0=2
  // total = 4+6+6+6+6+6+2 = 36; metodo 4/6 (400 ≥ 396) y calidad 6/9 (600 ≥ 594) cumplen el 66 %
  const at36 = [3, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 0, 2, 0];

  it('36 puntos con los mínimos cumplidos es «Uso optimizado»; 35 es «Uso metódico»', () => {
    const s36 = scoreAnswers(data, answersFromPoints(at36));
    expect(s36.total).toBe(36);
    expect(s36.outcome?.level.id).toBe('uso-optimizado');
    // agentes 1+0 = 1 → total 35
    const at35 = [...at36];
    at35[13] = 1;
    const s35 = scoreAnswers(data, answersFromPoints(at35));
    expect(s35.total).toBe(35);
    expect(s35.outcome?.level.id).toBe('uso-con-metodo');
  });

  it('39 puntos con calidad 5/9 (55 % < 66 %) baja de optimizado a metódico', () => {
    // metodo 4 + calidad (3+2+0)=5 + prompting 6 + modelo 6 + tokens 6 + herramientas 6 + agentes 6 = 39
    const s = scoreAnswers(data, answersFromPoints([3, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 0, 3, 3]));
    expect(s.total).toBe(39);
    expect(s.outcome?.byPoints.id).toBe('uso-optimizado');
    expect(s.outcome?.level.id).toBe('uso-con-metodo');
    expect(ids(s.outcome?.limitedBy ?? [])).toEqual(['calidad']);
  });

  it('puede bajar dos niveles: método 1/6 con todo lo demás al máximo', () => {
    // metodo 1+0 = 1, calidad 9, el resto 30 → 40 puntos (optimizado por puntos).
    // optimizado exige metodo ≥ 66 % (100 < 396) y metódico ≥ 33 % (100 < 198) → habitual.
    const s = scoreAnswers(data, answersFromPoints([1, 0, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]));
    expect(s.total).toBe(40);
    expect(s.outcome?.byPoints.id).toBe('uso-optimizado');
    expect(s.outcome?.level.id).toBe('uso-habitual');
    expect(ids(s.outcome?.limitedBy ?? [])).toEqual(['metodo']);
  });

  it('meetsPercent usa aritmética entera en los límites', () => {
    // 2/6 = 33,33 % ≥ 33 %; 1/6 = 16,7 % no
    expect(meetsPercent(2, 6, 33)).toBe(true);
    expect(meetsPercent(1, 6, 33)).toBe(false);
    // 4/6 = 66,67 % ≥ 66 %; 6/9 = 66,67 % ≥ 66 %; 5/9 = 55,6 % no
    expect(meetsPercent(4, 6, 66)).toBe(true);
    expect(meetsPercent(6, 9, 66)).toBe(true);
    expect(meetsPercent(5, 9, 66)).toBe(false);
    expect(meetsPercent(0, 0, 0)).toBe(false);
  });
});

describe('tramos por dimensión', () => {
  const band = (points: Array<number | undefined>, dim: string) =>
    scoreAnswers(data, answersFromPoints(points)).dimensions.find((d) => d.id === dim)?.band?.id;

  it('método (máximo 6): 1 → con recorrido, 2 y 3 → en camino, 4 → sólido', () => {
    // 1+0 = 1 (16,7 %) · 2+0 = 2 (33,3 %) · 3+0 = 3 (50 %) · 3+1 = 4 (66,7 %)
    expect(band([1, 0], 'metodo')).toBe('recorrido');
    expect(band([2, 0], 'metodo')).toBe('en-camino');
    expect(band([3, 0], 'metodo')).toBe('en-camino');
    expect(band([3, 1], 'metodo')).toBe('solido');
  });

  it('calidad (máximo 9): 2 → con recorrido, 3 y 5 → en camino, 6 → sólido', () => {
    const q = (a: number, b: number, c: number) =>
      band([...Array.from({ length: 10 }, () => undefined), a, b, c], 'calidad');
    // 2/9 = 22,2 % · 3/9 = 33,3 % · 5/9 = 55,6 % · 6/9 = 66,7 %
    expect(q(2, 0, 0)).toBe('recorrido');
    expect(q(3, 0, 0)).toBe('en-camino');
    expect(q(3, 2, 0)).toBe('en-camino');
    expect(q(3, 3, 0)).toBe('solido');
  });
});

describe('respuestas incompletas o inválidas', () => {
  it('una sola respuesta: sin nivel global y dimensión juzgada solo por lo respondido', () => {
    const s = scoreAnswers(data, answersFromPoints([2]));
    expect(s.complete).toBe(false);
    expect(s.answeredCount).toBe(1);
    expect(s.total).toBe(2);
    expect(s.outcome).toBeNull();
    // 2 puntos de 3 respondidos (66,7 % → 67) sobre un máximo de dimensión de 6
    expect(s.dimensions[0]).toMatchObject({ points: 2, answered: 1, answeredMax: 3, max: 6, percent: 67 });
    expect(s.dimensions[0]?.band?.id).toBe('solido');
    expect(s.dimensions[1]).toMatchObject({ points: 0, answered: 0, percent: null, band: null });
  });

  it('sin respuestas no hay nivel ni recomendaciones por dimensión', () => {
    const s = scoreAnswers(data, {});
    expect(s).toMatchObject({ answeredCount: 0, total: 0, complete: false, outcome: null });
    const r = recommend(data, s);
    expect(r.focus).toEqual([]);
    expect(r.keepingUp).toBe(true);
  });

  it('ignora preguntas y opciones desconocidas', () => {
    expect(scoreAnswers(data, { 'metodo-encargo': 'zzz', inventada: 'a' }).answeredCount).toBe(0);
    expect(sanitizeAnswers(data, { 'metodo-encargo': 'd', inventada: 'a', 'metodo-reinicio': 3 })).toEqual({
      'metodo-encargo': 'd',
    });
    expect(sanitizeAnswers(data, null)).toEqual({});
    expect(sanitizeAnswers(data, ['a'])).toEqual({});
  });
});

describe('páginas recomendadas', () => {
  const rec = (points: number[]) => recommend(data, scoreAnswers(data, answersFromPoints(points)));
  const slugs = (r: ReturnType<typeof rec>) => r.pages.map((p) => p.page);

  it('todo a 0: método, prompting y modelo; 8 páginas repartidas por rondas', () => {
    const r = rec(Array.from({ length: 15 }, () => 0));
    // Empate a 0 %: manda el orden de las dimensiones. Agentes se aplaza (método < 33 %).
    expect(ids(r.focus)).toEqual(['metodo', 'prompting', 'modelo']);
    expect(ids(r.deferred)).toContain('agentes');
    // Rondas: 1.ª las-10-reglas, principios, mapa-de-modelos; 2.ª plantilla, que-ha-cambiado,
    // razonamiento-y-esfuerzo; 3.ª ciclo-de-7-pasos y formato-y-longitud (8 en total).
    // La lista final va agrupada por dimensión, en el orden de los datos.
    expect(slugs(r)).toEqual([
      'm0-empieza-aqui/las-10-reglas',
      'm2-metodo/plantilla-de-encargo',
      'm2-metodo/ciclo-de-7-pasos',
      'm3-prompting/principios',
      'm3-prompting/que-ha-cambiado',
      'm3-prompting/formato-y-longitud',
      'm4-modelo-y-esfuerzo/mapa-de-modelos',
      'm1-fundamentos/razonamiento-y-esfuerzo',
    ]);
    expect(r.quick.page).toBe('m2-metodo/plantilla-de-encargo');
  });

  it('solo tokens y calidad con recorrido: dos dimensiones, tokens primero', () => {
    // metodo 6, prompting 6, modelo 6, tokens 1+0 = 1, herramientas 6, calidad 2+0+0 = 2, agentes 6
    const points = [3, 3, 3, 3, 3, 3, 1, 0, 3, 3, 2, 0, 0, 3, 3];
    const r = rec(points);
    // tokens 1/6 = 0,167 < calidad 2/9 = 0,222 (1·9 = 9 < 2·6 = 12); el resto está al 100 %
    expect(ids(r.focus)).toEqual(['tokens', 'calidad']);
    expect(r.deferred).toEqual([]);
    // Rondas: 1.ª tokens, verificar-siempre · 2.ª ventana, privacidad · 3.ª por-que-se-dispara,
    // alucinaciones · 4.ª orden-de-las-palancas, evals-minimas → 8 en total; en-apps-de-chat queda fuera.
    expect(slugs(r)).toEqual([
      'm1-fundamentos/tokens',
      'm1-fundamentos/ventana-de-contexto',
      'm5-tokens-y-contexto/por-que-se-dispara-el-gasto',
      'm5-tokens-y-contexto/orden-de-las-palancas',
      'm9-calidad-y-seguridad/verificar-siempre',
      'm9-calidad-y-seguridad/privacidad-y-seguridad',
      'm9-calidad-y-seguridad/alucinaciones',
      'm9-calidad-y-seguridad/evals-minimas',
    ]);
    expect(r.quick.page).toBe('m5-tokens-y-contexto/orden-de-las-palancas');
    // 6+6+6+1+6+2+6 = 33 puntos: por puntos sería metódico, pero calidad 2/9 (22 %) no llega al 33 %
    const s = scoreAnswers(data, answersFromPoints(points));
    expect(s.total).toBe(33);
    expect(s.outcome?.level.id).toBe('uso-habitual');
  });

  it('una página que sirve a dos dimensiones aparece una sola vez, en la de más recorrido', () => {
    // herramientas 0 y agentes 0; el resto al máximo (método 6 cumple el requisito de agentes)
    const r = rec([3, 3, 3, 3, 3, 3, 3, 3, 0, 0, 3, 3, 3, 0, 0]);
    expect(ids(r.focus)).toEqual(['herramientas', 'agentes']);
    // herramientas: mapa, cual-usar, herramientas-mcp-y-agentes, ficheros; agentes: escalera, cuando-no-orquestar
    // (herramientas-mcp-y-agentes se la queda herramientas). Rondas: 2+2+1+1 = 6 páginas.
    expect(slugs(r)).toEqual([
      'm6-herramientas/mapa-de-superficies',
      'm6-herramientas/cual-usar-para-que',
      'm1-fundamentos/herramientas-mcp-y-agentes',
      'm6-herramientas/ficheros-de-instrucciones-y-memoria',
      'm8-agentes/escalera-de-complejidad',
      'm8-agentes/cuando-no-orquestar',
    ]);
    expect(new Set(slugs(r)).size).toBe(6);
    // ninguna de las dos dimensiones tiene página de la ruta Esencial propia
    expect(r.quick.page).toBe('m0-empieza-aqui/las-10-reglas');
    expect(r.quick.dimension).toBeNull();
  });

  it('agentes se aplaza si el método no llega al 33 %', () => {
    // metodo 1+0 = 1 (16,7 %); agentes 0; el resto al máximo
    const r = rec([1, 0, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 0, 0]);
    expect(ids(r.focus)).toEqual(['metodo']);
    expect(ids(r.deferred)).toEqual(['agentes']);
    expect(slugs(r)).toEqual([
      'm0-empieza-aqui/las-10-reglas',
      'm2-metodo/plantilla-de-encargo',
      'm2-metodo/ciclo-de-7-pasos',
      'm2-metodo/errores-de-metodo',
    ]);
  });

  it('la tercera dimensión solo entra si no está ya en el tramo sólido', () => {
    // metodo 0 · prompting 0+1 = 1 · modelo 3+1 = 4 (4/6 = 66,7 %: sólido) · el resto al máximo
    // Las dos primeras entran siempre (método y prompting); modelo sería la tercera pero ya es sólida.
    const r = rec([0, 0, 1, 0, 3, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
    expect(ids(r.focus)).toEqual(['metodo', 'prompting']);
    // con modelo 3/6 (en camino) sí entra: 3+0 = 3 → 50 %
    const r2 = rec([0, 0, 1, 0, 3, 0, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
    expect(ids(r2.focus)).toEqual(['metodo', 'prompting', 'modelo']);
  });

  it('sin huecos evidentes (45 puntos): páginas de mantenimiento', () => {
    const r = recommend(data, scoreAnswers(data, uniform(3)));
    expect(r.keepingUp).toBe(true);
    expect(r.focus).toEqual([]);
    expect(slugs(r)).toEqual([
      'm12-recursos/novedades',
      'm9-calidad-y-seguridad/evals-minimas',
      'm8-agentes/cuando-no-orquestar',
    ]);
    expect(r.pages.every((p) => p.dimension === null)).toBe(true);
  });

  it('perfil de ejemplo: tokens, modelo y calidad', () => {
    const s = scoreAnswers(data, data.example.answers);
    const r = recommend(data, s);
    // tokens 1/6 (0,167) < modelo 2/6 = calidad 3/9 (0,333; 2·9 = 3·6): el empate lo rompe el orden
    expect(ids(r.focus)).toEqual(['tokens', 'modelo', 'calidad']);
    // Rondas: tokens (recorrido: 5 páginas), modelo (en camino: mapa, esfuerzo, selector, matriz,
    // estrategia) y calidad (en camino: 4) → 3 + 3 + 2 = 8
    expect(r.pages).toHaveLength(8);
    expect(r.pages[0]?.page).toBe('m1-fundamentos/tokens');
    expect(summarizeResult(s, r)).toBe(
      'Resultado: Uso habitual, con 18 de 45 puntos. Más recorrido: Tokens y coste, Modelo y esfuerzo, Calidad y seguridad. 8 páginas recomendadas.',
    );
  });

  it('el resumen de un test incompleto lo dice', () => {
    const s = scoreAnswers(data, answersFromPoints([1, 2, 3]));
    expect(summarizeResult(s, recommend(data, s))).toBe('Faltan 12 respuestas para ver el resultado.');
  });
});

describe('estado guardado', () => {
  const good = { version: data.version, answers: { 'metodo-encargo': 'c', 'tokens-coste': 'a' } };

  it('lee un estado válido', () => {
    expect(parseStored(data, good)).toEqual({ 'metodo-encargo': 'c', 'tokens-coste': 'a' });
  });

  it('descarta lo que no es un objeto o es de otra versión, y tolera respuestas rotas', () => {
    for (const raw of [null, undefined, 'texto', 42, [], true]) expect(parseStored(data, raw)).toBeNull();
    expect(parseStored(data, { version: data.version + 1, answers: good.answers })).toBeNull();
    expect(parseStored(data, { answers: good.answers })).toBeNull();
    expect(parseStored(data, { version: data.version })).toEqual({});
    expect(parseStored(data, { version: data.version, answers: 'roto' })).toEqual({});
  });

  it('conserva solo las respuestas que aún existen', () => {
    const raw = {
      version: data.version,
      answers: { 'metodo-encargo': 'c', 'pregunta-borrada': 'a', 'tokens-coste': 'z', 'modelo-cual': 7 },
    };
    expect(parseStored(data, raw)).toEqual({ 'metodo-encargo': 'c' });
  });

  it('toStored añade la versión y limpia', () => {
    expect(toStored(data, { 'metodo-encargo': 'b', x: 'y' })).toEqual({
      version: data.version,
      answers: { 'metodo-encargo': 'b' },
    });
  });

  it('firstUnanswered devuelve la primera pregunta sin respuesta, o la última si están todas', () => {
    expect(firstUnanswered(data, {})).toBe(0);
    // preguntas 0 y 1 respondidas, la 2 no
    expect(firstUnanswered(data, answersFromPoints([1, 1]))).toBe(2);
    expect(firstUnanswered(data, uniform(1))).toBe(14);
  });
});

/** Lee el frontmatter mínimo de una página de `src/content/docs`. */
function pageMeta(slug: string) {
  const file = `src/content/docs/${slug}.mdx`;
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
  return {
    status: /^status:\s*(\S+)/m.exec(front)?.[1] ?? 'completa',
    tracks:
      /^tracks:\s*\[(.*)\]/m
        .exec(front)?.[1]
        ?.split(',')
        .map((t) => t.trim()) ?? [],
    readingTime: Number(/^readingTime:\s*(\d+)/m.exec(front)?.[1] ?? 0),
  };
}

describe('src/data/maturity.json', () => {
  it('cumple el esquema y la coherencia interna', () => {
    expect(validateMaturityData(data)).toEqual([]);
  });

  it('tiene entre 12 y 15 preguntas, cada dimensión con al menos dos', () => {
    expect(data.questions.length).toBeGreaterThanOrEqual(12);
    expect(data.questions.length).toBeLessThanOrEqual(15);
    for (const d of data.dimensions) {
      expect(data.questions.filter((q) => q.dimension === d.id).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('cada pregunta tiene 3-4 opciones con puntos crecientes desde 0', () => {
    for (const q of data.questions) {
      expect(q.options.map((o) => o.points)).toEqual([0, 1, 2, 3].slice(0, q.options.length));
    }
  });

  it('los niveles cubren todo el rango de puntos sin huecos ni solapes', () => {
    const total = maxTotal(data);
    const last = data.levels.length - 1;
    for (let t = 0; t <= total; t += 1) {
      const matching = data.levels.filter(
        (l, i) => t >= l.min && (i === last || t < (data.levels[i + 1]?.min ?? Infinity)),
      );
      expect(matching, `${t} puntos`).toHaveLength(1);
    }
    expect(data.levels[0]?.min).toBe(0);
  });

  it('los tramos de dimensión cubren de 0 a 100 % sin huecos ni solapes', () => {
    const last = data.bands.length - 1;
    for (let p = 0; p <= 100; p += 1) {
      const matching = data.bands.filter(
        (b, i) => p >= b.minPercent && (i === last || p < (data.bands[i + 1]?.minPercent ?? 101)),
      );
      expect(matching, `${p} %`).toHaveLength(1);
    }
  });

  it('cada página citada existe y no está en preparación', () => {
    for (const slug of referencedPages(data)) {
      const meta = pageMeta(slug);
      expect(meta, `no existe src/content/docs/${slug}.mdx`).not.toBeNull();
      expect(meta?.status, `${slug} está en preparación`).not.toBe('en-preparacion');
    }
  });

  it('«si solo tienes 10 minutos» son páginas de la ruta Esencial de 10 minutos o menos', () => {
    const quick = [...data.quick.map((q) => q.page), data.quickFallback.page];
    for (const slug of quick) {
      const meta = pageMeta(slug);
      expect(meta?.tracks, slug).toContain('esencial');
      expect(meta?.readingTime ?? 99, slug).toBeLessThanOrEqual(10);
    }
  });

  it('el perfil de ejemplo contesta todo y da un nivel', () => {
    const s = scoreAnswers(data, data.example.answers);
    expect(s.complete).toBe(true);
    expect(s.outcome).not.toBeNull();
  });

  it('barrido: 64 perfiles dan siempre un resultado coherente', () => {
    const known = new Set(referencedPages(data));
    for (let a = 0; a < 4; a += 1) {
      for (let b = 0; b < 4; b += 1) {
        for (let c = 0; c < 4; c += 1) {
          const points = Array.from({ length: 15 }, (_, i) => (a + b * i + c * Math.floor(i / 2)) % 4);
          const s = scoreAnswers(data, answersFromPoints(points));
          const r = recommend(data, s);
          const slugs = r.pages.map((p) => p.page);
          expect(s.complete).toBe(true);
          expect(s.dimensions.reduce((x, d) => x + d.points, 0)).toBe(s.total);
          expect(s.total).toBe(points.reduce((x, p) => x + p, 0));
          expect(slugs.length).toBeGreaterThan(0);
          expect(slugs.length).toBeLessThanOrEqual(data.limits.pagesMax);
          expect(new Set(slugs).size).toBe(slugs.length);
          expect(r.focus.length).toBeLessThanOrEqual(data.limits.focusMax);
          for (const p of slugs) expect(known.has(p)).toBe(true);
        }
      }
    }
  });
});
