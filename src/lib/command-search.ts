import type { CommandRecord } from './schemas';

/**
 * Lógica pura del explorador de comandos `/` de Claude Code: normalización, búsqueda difusa,
 * filtros, estado en la URL y textos de resumen. Sin DOM, sin React y sin `astro:content`.
 *
 * Puntuación (una puntuación por palabra de la consulta; el total es la suma; si alguna palabra
 * no coincide con nada, el comando queda fuera). Para cada palabra se toma el MEJOR campo:
 *
 *   Nombre del comando (sin «/»)                      Resumen          Categoría / argumentos
 *   exacto ................................ 1000      palabra   100    palabra   50
 *   empieza por ............ 800 − diferencia(*)      prefijo    80    prefijo   40
 *   segmento tras «-» exacto ............... 650      contiene   50    contiene  25
 *   segmento tras «-» empieza por .......... 600      errata     30    errata    15
 *   contiene ............................... 450
 *   subsecuencia (≥3 letras) .... 200 + 0..40 (compacidad)
 *   errata (≥4 letras) .......... 160 (1 edición) / 140 (2); contra el nombre, un segmento o,
 *                                  desde 6 letras, un prefijo de longitud parecida
 *
 *   (*) diferencia = longitud del nombre − longitud de la palabra, con tope de 100.
 *
 * Los rangos no se solapan hacia arriba: cualquier coincidencia en el nombre (≥140) supera a la
 * mejor del resumen (100), y esta a la mejor de categoría o argumentos (50). Desempate: alfabético
 * por comando (orden por unidades de código, estable entre entornos) y, por último, por `id`.
 */

/** Registro plano y serializable que recibe la isla, con la fuente ya resuelta. Cadena vacía = sin dato. */
export interface CommandEntry {
  id: string;
  command: string;
  args: string;
  category: string;
  phase: string;
  summary: string;
  tokenImpact: string;
  example: string;
  status: CommandRecord['status'];
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string;
  verifiedAt: string;
}

export interface SourceLink {
  id: string;
  title: string;
  url: string;
}

/** Une cada registro con su fuente. Lanza si la fuente no existe: es un error de datos en tiempo de compilación. */
export function buildCommandEntries(records: CommandRecord[], sources: SourceLink[]): CommandEntry[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  return records.map((r) => {
    const source = byId.get(r.source);
    if (!source)
      throw new Error(`claude-code-commands.json: «${r.command}» cita la fuente inexistente «${r.source}»`);
    return {
      id: r.id,
      command: r.command,
      args: r.args ?? '',
      category: r.category,
      phase: r.phase,
      summary: r.summary,
      tokenImpact: r.tokenImpact ?? '',
      example: r.example ?? '',
      status: r.status,
      sourceId: source.id,
      sourceTitle: source.title,
      sourceUrl: source.url,
      verifiedAt: r.verifiedAt,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Normalización y utilidades de texto
// ---------------------------------------------------------------------------------------------

/** Minúsculas, sin tildes ni diéresis (NFD y fuera las marcas combinadas) y espacios colapsados. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Palabras de una consulta: normalizadas, sin «/» inicial y sin vacías. */
export function tokenizeQuery(query: string): string[] {
  return normalize(query)
    .split(' ')
    .map((t) => t.replace(/^\/+/, ''))
    .filter((t) => t.length > 0);
}

function words(text: string): string[] {
  return text.split(/[^a-z0-9]+/).filter((w) => w.length > 0);
}

/** Distancia de edición con transposiciones adyacentes (Damerau, variante «OSA»). */
export function editDistance(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => {
    const row = new Array<number>(m + 1).fill(0);
    row[0] = i;
    return row;
  });
  const row0 = d[0] as number[];
  for (let j = 0; j <= m; j++) row0[j] = j;
  for (let i = 1; i <= n; i++) {
    const row = d[i] as number[];
    const prev = d[i - 1] as number[];
    for (let j = 1; j <= m; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min((prev[j] as number) + 1, (row[j - 1] as number) + 1, (prev[j - 1] as number) + cost);
      if (
        i > 1 &&
        j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        v = Math.min(v, ((d[i - 2] as number[])[j - 2] as number) + 1);
      }
      row[j] = v;
    }
  }
  return (d[n] as number[])[m] as number;
}

/**
 * Longitud mínima del tramo de `text` que contiene `token` como subsecuencia (las letras en
 * orden, no necesariamente contiguas), o `null` si no es subsecuencia. Se prueba cada posición
 * inicial posible y se extiende de forma voraz.
 */
export function subsequenceSpan(token: string, text: string): number | null {
  if (token.length === 0) return 0;
  let best: number | null = null;
  for (
    let start = text.indexOf(token[0] as string);
    start !== -1;
    start = text.indexOf(token[0] as string, start + 1)
  ) {
    let pos = start;
    let ok = true;
    for (let k = 1; k < token.length; k++) {
      pos = text.indexOf(token[k] as string, pos + 1);
      if (pos === -1) {
        ok = false;
        break;
      }
    }
    if (!ok) break; // si falla desde esta posición, desde una posterior también fallará
    const span = pos - start + 1;
    if (best === null || span < best) best = span;
  }
  return best;
}

/** Ediciones permitidas según la longitud de la palabra buscada. */
function allowedTypos(length: number): number {
  if (length >= 7) return 2;
  if (length >= 4) return 1;
  return 0;
}

// ---------------------------------------------------------------------------------------------
// Índice y puntuación
// ---------------------------------------------------------------------------------------------

export interface IndexedCommand {
  entry: CommandEntry;
  /** Nombre normalizado sin «/», p. ej. `fewer-permission-prompts`. */
  name: string;
  segments: string[];
  summary: string;
  summaryWords: string[];
  category: string;
  categoryWords: string[];
  args: string;
  argsWords: string[];
}

/** Precalcula los textos normalizados una sola vez; la búsqueda por pulsación solo los compara. */
export function buildIndex(entries: CommandEntry[]): IndexedCommand[] {
  return entries.map((entry) => {
    const name = normalize(entry.command).replace(/^\/+/, '');
    const summary = normalize(entry.summary);
    const category = normalize(entry.category);
    const args = normalize(entry.args);
    return {
      entry,
      name,
      segments: name.split('-').filter((s) => s.length > 0),
      summary,
      summaryWords: words(summary),
      category,
      categoryWords: words(category),
      args,
      argsWords: words(args),
    };
  });
}

/** Puntuación de una palabra contra el nombre del comando (0 = sin coincidencia). */
export function scoreName(token: string, name: string, segments: string[]): number {
  if (name === token) return 1000;
  if (name.startsWith(token)) return 800 - Math.min(100, name.length - token.length);
  if (segments.slice(1).includes(token)) return 650;
  if (segments.slice(1).some((s) => s.startsWith(token))) return 600;
  if (name.includes(token)) return 450;

  let best = 0;
  if (token.length >= 3) {
    const span = subsequenceSpan(token, name);
    if (span !== null && span <= token.length * 3) {
      best = 200 + Math.max(0, 40 - 5 * (span - token.length));
    }
  }
  const allowed = allowedTypos(token.length);
  if (allowed > 0) {
    const candidates = new Set<string>([name, ...segments]);
    // Prefijos de longitud parecida (se escribió el principio con una errata); solo desde 6 letras,
    // para que palabras cortas como «cost» no se confundan con el inicio de «context».
    if (token.length >= 6) {
      for (let len = token.length - 1; len <= token.length + 1; len++) {
        if (len < name.length) candidates.add(name.slice(0, len));
      }
    }
    let distance = Infinity;
    for (const c of candidates) {
      if (Math.abs(c.length - token.length) > allowed) continue;
      distance = Math.min(distance, editDistance(token, c));
    }
    if (distance <= allowed) best = Math.max(best, 160 - 20 * (distance - 1));
  }
  return best;
}

/** Puntuación de una palabra contra un texto libre (resumen, categoría o argumentos). */
function scoreText(
  token: string,
  text: string,
  textWords: string[],
  [exact, prefix, contains, typo]: readonly [number, number, number, number],
): number {
  if (textWords.includes(token)) return exact;
  if (textWords.some((w) => w.startsWith(token))) return prefix;
  if (text.includes(token)) return contains;
  if (
    token.length >= 5 &&
    textWords.some((w) => Math.abs(w.length - token.length) <= 1 && editDistance(token, w) <= 1)
  ) {
    return typo;
  }
  return 0;
}

const SUMMARY_WEIGHTS = [100, 80, 50, 30] as const;
const SECONDARY_WEIGHTS = [50, 40, 25, 15] as const;

/** Mejor puntuación de una palabra en cualquier campo del comando (0 = no coincide). */
export function scoreToken(token: string, ic: IndexedCommand): number {
  return Math.max(
    scoreName(token, ic.name, ic.segments),
    scoreText(token, ic.summary, ic.summaryWords, SUMMARY_WEIGHTS),
    scoreText(token, ic.category, ic.categoryWords, SECONDARY_WEIGHTS),
    scoreText(token, ic.args, ic.argsWords, SECONDARY_WEIGHTS),
  );
}

/** Suma de las puntuaciones de todas las palabras; 0 si alguna no coincide. Sin palabras: 0. */
export function scoreCommand(tokens: string[], ic: IndexedCommand): number {
  let total = 0;
  for (const t of tokens) {
    const s = scoreToken(t, ic);
    if (s === 0) return 0;
    total += s;
  }
  return total;
}

// ---------------------------------------------------------------------------------------------
// Estado, filtros y búsqueda
// ---------------------------------------------------------------------------------------------

export interface ExplorerState {
  query: string;
  /** Cadena vacía = todas. */
  category: string;
  phase: string;
  tokenImpact: string;
  includeAliases: boolean;
  includeRetired: boolean;
}

export const DEFAULT_STATE: ExplorerState = {
  query: '',
  category: '',
  phase: '',
  tokenImpact: '',
  includeAliases: true,
  includeRetired: false,
};

export interface SearchHit {
  entry: CommandEntry;
  /** 0 cuando la consulta está vacía. */
  score: number;
}

export function isStatusIncluded(status: CommandEntry['status'], state: ExplorerState): boolean {
  if (status === 'alias') return state.includeAliases;
  if (status === 'eliminado') return state.includeRetired;
  return true;
}

/** Comandos que pasan solo el filtro de estado (alias y retirados): es el «total» de «N de M». */
export function countEligible(index: IndexedCommand[], state: ExplorerState): number {
  return index.filter((ic) => isStatusIncluded(ic.entry.status, state)).length;
}

function compareHits(a: SearchHit, b: SearchHit): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.entry.command !== b.entry.command) return a.entry.command < b.entry.command ? -1 : 1;
  return a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0;
}

/**
 * Busca y filtra. Consulta vacía: todos los que pasan los filtros, en orden alfabético.
 * Categoría, fase, impacto y estado se combinan entre sí y con la búsqueda (todos deben cumplirse).
 */
export function searchIndex(index: IndexedCommand[], state: ExplorerState): SearchHit[] {
  const tokens = tokenizeQuery(state.query);
  const hits: SearchHit[] = [];
  for (const ic of index) {
    const e = ic.entry;
    if (!isStatusIncluded(e.status, state)) continue;
    if (state.category && e.category !== state.category) continue;
    if (state.phase && e.phase !== state.phase) continue;
    if (state.tokenImpact && e.tokenImpact !== state.tokenImpact) continue;
    if (tokens.length === 0) {
      hits.push({ entry: e, score: 0 });
      continue;
    }
    const score = scoreCommand(tokens, ic);
    if (score > 0) hits.push({ entry: e, score });
  }
  return hits.sort(compareHits);
}

/** Atajo para pruebas y usos puntuales: construye el índice y busca. */
export function searchCommands(entries: CommandEntry[], state: ExplorerState): SearchHit[] {
  return searchIndex(buildIndex(entries), state);
}

/** Valores distintos (no vacíos) de un campo. Los de `order` van primero y en ese orden; el resto, alfabético. */
export function facetValues(
  entries: CommandEntry[],
  key: 'category' | 'phase' | 'tokenImpact',
  order: readonly string[] = [],
): string[] {
  const values = [...new Set(entries.map((e) => e[key]).filter((v) => v !== ''))];
  const rank = (v: string): number => {
    const i = order.indexOf(v);
    return i === -1 ? order.length : i;
  };
  return values.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'es'));
}

export function hasFilters(state: ExplorerState): boolean {
  return state.query.trim() !== '' || state.category !== '' || state.phase !== '' || state.tokenImpact !== '';
}

// ---------------------------------------------------------------------------------------------
// Estado en la URL (?q=…&categoria=…&fase=…)
// ---------------------------------------------------------------------------------------------

export interface Facets {
  categories: readonly string[];
  phases: readonly string[];
  impacts: readonly string[];
}

const MAX_QUERY_LENGTH = 100;

/** Lee el estado de `location.search`. Valores desconocidos (categoría o fase que no existen) se ignoran. */
export function parseExplorerState(search: string, facets: Facets): ExplorerState {
  const params = new URLSearchParams(search);
  const pick = (name: string, allowed: readonly string[]): string => {
    const v = params.get(name) ?? '';
    return allowed.includes(v) ? v : '';
  };
  return {
    query: (params.get('q') ?? '').slice(0, MAX_QUERY_LENGTH),
    category: pick('categoria', facets.categories),
    phase: pick('fase', facets.phases),
    tokenImpact: pick('impacto', facets.impacts),
    includeAliases: params.get('alias') !== '0',
    includeRetired: params.get('retirados') === '1',
  };
}

/**
 * Devuelve el `search` actualizado («?a=b» o cadena vacía) con el estado del explorador, conservando
 * cualquier otro parámetro de la URL. Los valores por defecto no se escriben.
 */
export function applyExplorerState(search: string, state: ExplorerState): string {
  const params = new URLSearchParams(search);
  const set = (name: string, value: string): void => {
    if (value) params.set(name, value);
    else params.delete(name);
  };
  set('q', state.query.trim() === '' ? '' : state.query);
  set('categoria', state.category);
  set('fase', state.phase);
  set('impacto', state.tokenImpact);
  set('alias', state.includeAliases ? '' : '0');
  set('retirados', state.includeRetired ? '1' : '');
  const text = params.toString();
  return text ? `?${text}` : '';
}

// ---------------------------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------------------------

/** Texto que se copia: el comando con sus argumentos (o el ejemplo). `null` si no hay ejemplo. */
export function copyText(entry: CommandEntry, kind: 'command' | 'example'): string | null {
  if (kind === 'example') return entry.example === '' ? null : entry.example;
  return entry.args === '' ? entry.command : `${entry.command} ${entry.args}`;
}

/** Resumen para la región `aria-live`: «136 comandos» o «12 de 136 comandos». */
export function resultsSummary(count: number, total: number, filtering: boolean): string {
  const noun = (n: number): string => (n === 1 ? 'comando' : 'comandos');
  if (!filtering) return `${count} ${noun(count)}`;
  return `${count} de ${total} ${noun(total)}`;
}

/** Mensaje del estado vacío (se pinta solo si no hay resultados). */
export function emptyMessage(state: ExplorerState): string {
  const q = state.query.trim();
  const tail = 'Prueba con otra palabra o quita filtros.';
  if (q !== '') return `Ningún comando coincide con «${q}». ${tail}`;
  return `Ningún comando coincide con los filtros elegidos. ${tail}`;
}
