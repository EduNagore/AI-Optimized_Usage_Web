import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyExplorerState,
  buildCommandEntries,
  buildIndex,
  copyText,
  countEligible,
  DEFAULT_STATE,
  editDistance,
  emptyMessage,
  facetValues,
  hasFilters,
  normalize,
  parseExplorerState,
  resultsSummary,
  scoreName,
  searchCommands,
  subsequenceSpan,
  tokenizeQuery,
  type CommandEntry,
  type ExplorerState,
  type SourceLink,
} from '../src/lib/command-search';
import { commandSchema, sourceSchema } from '../src/lib/schemas';

// ---------------------------------------------------------------------------------------------
// Datos de prueba pequeños: todas las cuentas de abajo están hechas a mano sobre ellos.
// ---------------------------------------------------------------------------------------------

function entry(over: Partial<CommandEntry> & Pick<CommandEntry, 'id' | 'command'>): CommandEntry {
  return {
    args: '',
    category: 'Otros',
    phase: 'Trabajar',
    summary: 'Sin resumen.',
    tokenImpact: '',
    example: '',
    status: 'activo',
    sourceId: 's',
    sourceTitle: 'Comandos',
    sourceUrl: 'https://example.test/comandos',
    verifiedAt: '2026-10-16',
    ...over,
  };
}

const A = entry({
  id: 'a',
  command: '/compact',
  args: '[instructions]',
  category: 'Contexto y memoria',
  phase: 'Trabajar',
  summary: 'Libera contexto resumiendo la conversación.',
  tokenImpact: 'Ahorra',
  example: '/compact conserva los acuerdos',
});
const B = entry({
  id: 'b',
  command: '/clear',
  category: 'Contexto y memoria',
  phase: 'Trabajar',
  summary: 'Empieza una conversación nueva; es más barato que compactar.',
  tokenImpact: 'Gasta',
});
const C = entry({
  id: 'c',
  command: '/context',
  category: 'Contexto y memoria',
  phase: 'Medir',
  summary: 'Muestra qué ocupa el contexto.',
});
const D = entry({
  id: 'd',
  command: '/cost',
  category: 'Coste y uso',
  phase: 'Medir',
  summary: 'Alias de /usage.',
  status: 'alias',
});
const E = entry({
  id: 'e',
  command: '/usage',
  category: 'Coste y uso',
  phase: 'Medir',
  summary: 'Muestra el coste y los límites de uso.',
});
const F = entry({
  id: 'f',
  command: '/vim',
  category: 'Otros',
  phase: 'Trabajar',
  summary: 'Eliminado; usa /config.',
  status: 'eliminado',
});
const G = entry({
  id: 'g',
  command: '/fewer-permission-prompts',
  category: 'Permisos y seguridad',
  phase: 'Preparar',
  summary: 'Reduce los avisos de permisos repetidos.',
});
const H = entry({
  id: 'h',
  command: '/rewind',
  category: 'Sesiones y paralelismo',
  phase: 'Trabajar',
  summary: 'Vuelve a un punto anterior de la conversación.',
});
const FIXTURE = [A, B, C, D, E, F, G, H];

const state = (over: Partial<ExplorerState> = {}): ExplorerState => ({ ...DEFAULT_STATE, ...over });
const cmds = (hits: { entry: CommandEntry }[]): string[] => hits.map((h) => h.entry.command);
const scores = (hits: { score: number }[]): number[] => hits.map((h) => h.score);

// ---------------------------------------------------------------------------------------------

describe('normalize y tokenizeQuery', () => {
  it('quita tildes y diéresis, pasa a minúsculas y colapsa espacios', () => {
    // «Á» → «A» + marca combinada → «a»; «Ñ» → «N» + tilde → «n»; «ú» → «u»; los dobles espacios pasan a uno.
    expect(normalize('  Árbol  Ñandú ')).toBe('arbol nandu');
    expect(normalize('CONVERSACIÓN')).toBe('conversacion');
  });

  it('separa palabras, quita la barra inicial y descarta vacías', () => {
    expect(tokenizeQuery('/Compact  Contexto')).toEqual(['compact', 'contexto']);
    expect(tokenizeQuery('/')).toEqual([]);
    expect(tokenizeQuery('   ')).toEqual([]);
  });
});

describe('editDistance y subsequenceSpan', () => {
  it('cuenta ediciones y trata una transposición como una', () => {
    // «compcat» → «compact»: se intercambian «ca» y «ac» = 1 operación.
    expect(editDistance('compcat', 'compact')).toBe(1);
    // kitten → sitting: k→s, e→i, +g = 3 (caso clásico).
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('abc', 'abc')).toBe(0);
  });

  it('mide el tramo mínimo que contiene las letras en orden', () => {
    // c(0) o(1) m(2) p(3) a(4) c(5) t(6): c(0) m(2) p(3) → tramo 0..3 = 4 caracteres.
    expect(subsequenceSpan('cmp', 'compact')).toBe(4);
    // Hay dos «c»: desde la segunda no se cierra; desde la primera, c(0) l(1) r(4) → 5.
    expect(subsequenceSpan('clr', 'clear')).toBe(5);
    expect(subsequenceSpan('cmp', 'clear')).toBeNull();
    expect(subsequenceSpan('', 'clear')).toBe(0);
  });
});

describe('scoreName', () => {
  const name = 'fewer-permission-prompts';
  const segments = name.split('-');

  it('puntúa por niveles: exacto, prefijo, segmento, contiene, subsecuencia, errata', () => {
    expect(scoreName(name, name, segments)).toBe(1000);
    // Longitud del nombre: 5 + 1 + 10 + 1 + 7 = 24. «fewer» tiene 5: 800 − (24 − 5) = 781.
    expect(scoreName('fewer', name, segments)).toBe(781);
    expect(scoreName('permission', name, segments)).toBe(650); // segmento exacto
    expect(scoreName('permiss', name, segments)).toBe(600); // segmento que empieza por
    expect(scoreName('ssion-pro', name, segments)).toBe(450); // contiene
    expect(scoreName('zzz', name, segments)).toBe(0);
  });

  it('no deja que una palabra corta de 1-2 letras entre por subsecuencia o errata', () => {
    // «cr» es subsecuencia de «clear» pero con 2 letras solo cuenta como prefijo/contiene.
    expect(scoreName('cr', 'clear', ['clear'])).toBe(0);
    expect(scoreName('cl', 'clear', ['clear'])).toBe(800 - 3);
  });
});

describe('búsqueda difusa: puntuación y orden calculados a mano', () => {
  it('«compac» encuentra /compact antes que un comando que solo lo menciona en el resumen', () => {
    const hits = searchCommands(FIXTURE, state({ query: 'compac' }));
    // /compact: el nombre «compact» empieza por «compac»: 800 − (7 − 6) = 799.
    // /clear: solo su resumen tiene «compactar», que empieza por «compac»: 80.
    // El resto (/context, /cost, /usage…) no contiene «compac» ni se parece lo bastante: fuera.
    // Alfabéticamente /clear iría antes que /compact: el orden lo marca la puntuación.
    expect(cmds(hits)).toEqual(['/compact', '/clear']);
    expect(scores(hits)).toEqual([799, 80]);
  });

  it('ignora tildes y mayúsculas en la consulta y en los datos', () => {
    // «conversacion» es palabra exacta del resumen (100) de /clear, /compact y /rewind; ningún nombre se le parece.
    // Empate a 100: orden alfabético → /clear, /compact, /rewind.
    const plain = searchCommands(FIXTURE, state({ query: 'conversacion' }));
    expect(cmds(plain)).toEqual(['/clear', '/compact', '/rewind']);
    expect(scores(plain)).toEqual([100, 100, 100]);
    expect(searchCommands(FIXTURE, state({ query: 'CONVERSACIÓN' }))).toEqual(plain);
  });

  it('suma las palabras de la consulta y exige que todas coincidan', () => {
    const hits = searchCommands(FIXTURE, state({ query: 'coste uso' }));
    // /usage: «coste» → resumen, palabra exacta = 100 (la categoría solo daría 50); «uso» → resumen, palabra
    //   exacta = 100 (el nombre «usage» no empieza por «uso»). Total 200.
    // /cost (alias): «coste» → errata de «cost» a 1 edición = 160 (supera al resumen); «uso» → categoría
    //   «Coste y uso», palabra exacta = 50. Total 210. Un nombre cercano pesa más que una palabra del resumen.
    expect(cmds(hits)).toEqual(['/cost', '/usage']);
    expect(scores(hits)).toEqual([210, 200]);
    // Una palabra sin coincidencia deja fuera al comando entero.
    expect(searchCommands(FIXTURE, state({ query: 'coste zzzz' }))).toEqual([]);
  });

  it('admite subsecuencias: «cmp» encuentra /compact', () => {
    const hits = searchCommands(FIXTURE, state({ query: 'cmp' }));
    // c(0) m(2) p(3) en «compact»: tramo de 4 para 3 letras = 1 hueco → 200 + 40 − 5·1 = 235.
    expect(cmds(hits)).toEqual(['/compact']);
    expect(scores(hits)).toEqual([235]);
  });

  it('admite errores tipográficos leves: «compcat» encuentra /compact', () => {
    const hits = searchCommands(FIXTURE, state({ query: 'compcat' }));
    // 7 letras → hasta 2 ediciones; «compcat» ↔ «compact» = 1 (transposición) → 160 − 20·0 = 160.
    expect(cmds(hits)).toEqual(['/compact']);
    expect(scores(hits)).toEqual([160]);
  });

  it('reconoce segmentos de nombres compuestos', () => {
    // «prompts» es el último segmento de /fewer-permission-prompts: 650.
    const hits = searchCommands(FIXTURE, state({ query: 'prompts' }));
    expect(cmds(hits)).toEqual(['/fewer-permission-prompts']);
    expect(scores(hits)).toEqual([650]);
  });

  it('una coincidencia en el nombre siempre supera a una en el resumen o la categoría', () => {
    // «con»: /context empieza por «con» (800 − (7 − 3) = 796); en /compact, /clear y /rewind solo el resumen
    // tiene una palabra que empieza por «con» (contexto / conversación) = 80. Empate a 80 → alfabético.
    const hits = searchCommands(FIXTURE, state({ query: 'con' }));
    expect(cmds(hits)).toEqual(['/context', '/clear', '/compact', '/rewind']);
    expect(scores(hits)).toEqual([796, 80, 80, 80]);
  });

  it('el nombre exacto con barra puntúa 1000 y queda el primero', () => {
    const hits = searchCommands(FIXTURE, state({ query: '/Context' }));
    expect(hits[0]?.entry.command).toBe('/context');
    expect(hits[0]?.score).toBe(1000);
  });

  it('busca también en los argumentos', () => {
    // «instructions» es palabra exacta de los argumentos «[instructions]» de /compact: 50.
    const hits = searchCommands(FIXTURE, state({ query: 'instructions' }));
    expect(cmds(hits)).toEqual(['/compact']);
    expect(scores(hits)).toEqual([50]);
  });

  it('el orden es estable: mismas entradas, mismo resultado, sea cual sea el orden de partida', () => {
    const forward = searchCommands(FIXTURE, state({ query: 'con' }));
    const backward = searchCommands([...FIXTURE].reverse(), state({ query: 'con' }));
    expect(cmds(backward)).toEqual(cmds(forward));
  });
});

describe('consulta vacía y sin resultados', () => {
  it('consulta vacía = todos los comandos visibles, en orden alfabético', () => {
    // Por defecto: activos y alias (7); /vim está retirado. Alfabético por comando:
    // /clear < /compact (l < o) < /context (m < n) < /cost (n < s) < /fewer… < /rewind < /usage.
    const hits = searchCommands(FIXTURE, state());
    expect(cmds(hits)).toEqual([
      '/clear',
      '/compact',
      '/context',
      '/cost',
      '/fewer-permission-prompts',
      '/rewind',
      '/usage',
    ]);
    expect(scores(hits).every((s) => s === 0)).toBe(true);
    expect(searchCommands(FIXTURE, state({ query: '   ' }))).toEqual(hits);
    expect(searchCommands(FIXTURE, state({ query: '/' }))).toEqual(hits);
  });

  it('consulta sin resultados: lista vacía y mensaje explicado', () => {
    expect(searchCommands(FIXTURE, state({ query: 'zzzzzz' }))).toEqual([]);
    expect(emptyMessage(state({ query: ' zzzzzz ' }))).toBe(
      'Ningún comando coincide con «zzzzzz». Prueba con otra palabra o quita filtros.',
    );
    expect(emptyMessage(state({ phase: 'Medir' }))).toBe(
      'Ningún comando coincide con los filtros elegidos. Prueba con otra palabra o quita filtros.',
    );
  });
});

describe('filtros', () => {
  it('categoría y fase se combinan entre sí', () => {
    // «Contexto y memoria» = /compact, /clear, /context; de ellos, fase «Medir» = solo /context.
    const hits = searchCommands(FIXTURE, state({ category: 'Contexto y memoria', phase: 'Medir' }));
    expect(cmds(hits)).toEqual(['/context']);
  });

  it('los filtros se combinan con la búsqueda', () => {
    // «con» sin filtros daría /context, /clear, /compact, /rewind; la categoría «Contexto y memoria» deja fuera /rewind.
    const byCategory = searchCommands(FIXTURE, state({ query: 'con', category: 'Contexto y memoria' }));
    expect(cmds(byCategory)).toEqual(['/context', '/clear', '/compact']);
    // Con fase «Trabajar» (excluye /context, que es «Medir»): /clear, /compact, /rewind a 80.
    const byPhase = searchCommands(FIXTURE, state({ query: 'con', phase: 'Trabajar' }));
    expect(cmds(byPhase)).toEqual(['/clear', '/compact', '/rewind']);
  });

  it('el filtro de impacto en tokens solo deja los comandos con ese valor', () => {
    expect(cmds(searchCommands(FIXTURE, state({ tokenImpact: 'Ahorra' })))).toEqual(['/compact']);
    expect(cmds(searchCommands(FIXTURE, state({ tokenImpact: 'Gasta' })))).toEqual(['/clear']);
  });

  it('alias y retirados: por defecto activos y alias; los retirados, solo si se piden', () => {
    expect(cmds(searchCommands(FIXTURE, state({ query: 'vim' })))).toEqual([]);
    const withRetired = searchCommands(FIXTURE, state({ query: 'vim', includeRetired: true }));
    expect(cmds(withRetired)).toEqual(['/vim']);
    expect(withRetired[0]?.score).toBe(1000);

    // «cost»: /cost (alias) puntúa 1000; /usage solo lo menciona en el resumen («coste» empieza por «cost»): 80.
    const withAlias = searchCommands(FIXTURE, state({ query: 'cost' }));
    expect(cmds(withAlias)).toEqual(['/cost', '/usage']);
    expect(scores(withAlias)).toEqual([1000, 80]);
    expect(cmds(searchCommands(FIXTURE, state({ query: 'cost', includeAliases: false })))).toEqual([
      '/usage',
    ]);
  });

  it('countEligible cuenta solo por estado (el total de «N de M»)', () => {
    const index = buildIndex(FIXTURE);
    // 8 comandos − 1 retirado = 7 por defecto; sin alias, 6; con retirados y alias, 8.
    expect(countEligible(index, state())).toBe(7);
    expect(countEligible(index, state({ includeAliases: false }))).toBe(6);
    expect(countEligible(index, state({ includeRetired: true }))).toBe(8);
  });

  it('hasFilters distingue el estado por defecto del filtrado', () => {
    expect(hasFilters(state())).toBe(false);
    expect(hasFilters(state({ query: '  ' }))).toBe(false);
    expect(hasFilters(state({ phase: 'Medir' }))).toBe(true);
    expect(hasFilters(state({ query: 'x' }))).toBe(true);
  });
});

describe('facetValues', () => {
  it('saca los valores de los datos, sin vacíos ni repetidos', () => {
    // Categorías de la muestra: 5 distintas, orden alfabético en español («Conte…» antes que «Coste…»: n < s).
    expect(facetValues(FIXTURE, 'category')).toEqual([
      'Contexto y memoria',
      'Coste y uso',
      'Otros',
      'Permisos y seguridad',
      'Sesiones y paralelismo',
    ]);
    // Solo /compact y /clear traen impacto; el resto (cadena vacía) no cuenta.
    expect(facetValues(FIXTURE, 'tokenImpact')).toEqual(['Ahorra', 'Gasta']);
  });

  it('un orden sugerido pone esos valores primero; los demás, alfabéticos', () => {
    expect(facetValues(FIXTURE, 'phase')).toEqual(['Medir', 'Preparar', 'Trabajar']);
    expect(facetValues(FIXTURE, 'phase', ['Preparar', 'Trabajar', 'Revisar', 'Medir'])).toEqual([
      'Preparar',
      'Trabajar',
      'Medir',
    ]);
  });
});

describe('estado en la URL', () => {
  const facets = {
    categories: ['Contexto y memoria', 'Coste y uso'],
    phases: ['Trabajar', 'Medir'],
    impacts: ['Ahorra'],
  };

  it('lee q, categoria y fase', () => {
    const s = parseExplorerState('?q=compac&categoria=Contexto+y+memoria&fase=Medir', facets);
    expect(s).toEqual(state({ query: 'compac', category: 'Contexto y memoria', phase: 'Medir' }));
  });

  it('ignora categorías y fases que no existen y recorta consultas enormes', () => {
    const s = parseExplorerState(`?categoria=Inventada&fase=Nunca&q=${'x'.repeat(500)}`, facets);
    expect(s.category).toBe('');
    expect(s.phase).toBe('');
    expect(s.query).toHaveLength(100);
  });

  it('sin parámetros devuelve el estado por defecto', () => {
    expect(parseExplorerState('', facets)).toEqual(DEFAULT_STATE);
  });

  it('escribe solo lo que se aparta del valor por defecto y conserva otros parámetros', () => {
    expect(applyExplorerState('', DEFAULT_STATE)).toBe('');
    expect(applyExplorerState('?foo=1', state({ query: 'compac', category: 'Contexto y memoria' }))).toBe(
      '?foo=1&q=compac&categoria=Contexto+y+memoria',
    );
    expect(
      applyExplorerState('?q=viejo&fase=Medir', state({ includeRetired: true, includeAliases: false })),
    ).toBe('?alias=0&retirados=1');
  });

  it('ida y vuelta sin pérdidas', () => {
    const original = state({
      query: 'compactar contexto',
      category: 'Coste y uso',
      phase: 'Trabajar',
      tokenImpact: 'Ahorra',
      includeAliases: false,
      includeRetired: true,
    });
    expect(parseExplorerState(applyExplorerState('', original), facets)).toEqual(original);
  });
});

describe('copiar y textos', () => {
  it('copia el comando con sus argumentos, y el ejemplo si existe', () => {
    expect(copyText(A, 'command')).toBe('/compact [instructions]');
    expect(copyText(B, 'command')).toBe('/clear');
    expect(copyText(A, 'example')).toBe('/compact conserva los acuerdos');
    expect(copyText(B, 'example')).toBeNull();
  });

  it('el resumen de resultados cambia con el filtrado y con el singular', () => {
    expect(resultsSummary(136, 136, false)).toBe('136 comandos');
    expect(resultsSummary(1, 1, false)).toBe('1 comando');
    expect(resultsSummary(12, 136, true)).toBe('12 de 136 comandos');
    expect(resultsSummary(0, 136, true)).toBe('0 de 136 comandos');
  });
});

describe('buildCommandEntries', () => {
  const record = commandSchema.parse({
    id: 'cmd-x',
    command: '/x',
    category: 'Otros',
    phase: 'Trabajar',
    summary: 'Hace x.',
    status: 'activo',
    source: 's1',
    verifiedAt: '2026-10-16',
  });
  const sources: SourceLink[] = [{ id: 's1', title: 'Comandos', url: 'https://example.test/c' }];

  it('resuelve la fuente y rellena con cadena vacía lo opcional', () => {
    expect(buildCommandEntries([record], sources)).toEqual([
      {
        id: 'cmd-x',
        command: '/x',
        args: '',
        category: 'Otros',
        phase: 'Trabajar',
        summary: 'Hace x.',
        tokenImpact: '',
        example: '',
        status: 'activo',
        sourceId: 's1',
        sourceTitle: 'Comandos',
        sourceUrl: 'https://example.test/c',
        verifiedAt: '2026-10-16',
      },
    ]);
  });

  it('lanza (en compilación) si la fuente no existe', () => {
    expect(() => buildCommandEntries([record], [])).toThrow(/fuente inexistente «s1»/);
  });
});

// ---------------------------------------------------------------------------------------------
// Coherencia con los datos reales
// ---------------------------------------------------------------------------------------------

describe('datos reales (src/data/claude-code-commands.json)', () => {
  const load = (name: string): unknown[] => JSON.parse(readFileSync(`src/data/${name}.json`, 'utf8'));
  const records = load('claude-code-commands').map((r) => commandSchema.parse(r));
  const sources = load('sources').map((s) => sourceSchema.parse(s));
  const entries = buildCommandEntries(records, sources); // lanza si algún `source` no existe
  const all = state({ includeAliases: true, includeRetired: true });

  it('todo source existe en sources.json y cada entrada trae URL', () => {
    const ids = new Set(sources.map((s) => s.id));
    for (const r of records) expect(ids.has(r.source)).toBe(true);
    for (const e of entries) expect(e.sourceUrl).toMatch(/^https:\/\//);
  });

  it('consulta vacía: 140 comandos sin duplicados con todo incluido; por defecto, sin retirados', () => {
    const everything = searchCommands(entries, all);
    expect(everything).toHaveLength(records.length);
    expect(new Set(cmds(everything)).size).toBe(records.length);

    const byDefault = searchCommands(entries, state());
    const retired = records.filter((r) => r.status === 'eliminado').length;
    expect(byDefault).toHaveLength(records.length - retired);
    expect(byDefault.every((h) => h.entry.status !== 'eliminado')).toBe(true);
  });

  it('ningún comando se repite en los resultados de ninguna consulta de ejemplo', () => {
    const queries = ['a', 'co', 'compac', 'sesion', 'modelo esfuerzo', 'contexto', '--fix', 'pr', 'zzzz'];
    for (const query of queries) {
      const c = cmds(searchCommands(entries, { ...all, query }));
      expect(new Set(c).size).toBe(c.length);
    }
  });

  it('buscar el nombre exacto de cada comando lo devuelve el primero', () => {
    for (const e of entries) {
      const hits = searchCommands(entries, { ...all, query: e.command });
      expect(hits[0]?.entry.id).toBe(e.id);
      expect(hits[0]?.score).toBe(1000);
    }
  });

  it('«compac» pone /compact el primero y por encima de cualquier otro que solo lo mencione', () => {
    const hits = searchCommands(entries, { ...all, query: 'compac' });
    expect(hits[0]?.entry.command).toBe('/compact');
    const first = hits[0]?.score ?? 0;
    for (const h of hits.slice(1)) expect(h.score).toBeLessThan(first);
  });

  it('las categorías y las fases del filtro salen de los datos y reparten los 140 comandos', () => {
    for (const key of ['category', 'phase'] as const) {
      const values = facetValues(entries, key);
      expect(values).toEqual(
        [...new Set(records.map((r) => r[key]))].sort((a, b) => a.localeCompare(b, 'es')),
      );
      let total = 0;
      for (const value of values) {
        const hits = searchCommands(entries, { ...all, [key]: value });
        // Cuenta hecha aparte, directamente sobre los registros.
        expect(hits).toHaveLength(records.filter((r) => r[key] === value).length);
        total += hits.length;
      }
      expect(total).toBe(records.length);
    }
  });

  it('el impacto en tokens solo ofrece valores si algún registro los trae', () => {
    // Hoy ningún registro lo trae: la lista de valores sale vacía y la isla no pinta el filtro.
    const expected = new Set(records.map((r) => r.tokenImpact).filter((v) => v !== undefined && v !== ''));
    expect(facetValues(entries, 'tokenImpact')).toHaveLength(expected.size);
  });
});
