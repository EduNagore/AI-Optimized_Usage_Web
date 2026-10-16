import { modules, type Track } from './modules';

/** Lo mínimo de una página de `docs` que necesitan las rutas de la portada. */
export interface RoutePage {
  id: string;
  title: string;
  tracks: Track[];
  readingTime: number;
  order: number;
}

export interface RouteSummary {
  pages: RoutePage[];
  totalMinutes: number;
}

/**
 * Páginas de una ruta en el orden de la guía (módulo y luego posición en la barra lateral), con el
 * tiempo total de lectura. Las páginas sin `tracks` (índices de módulo) no pertenecen a ninguna.
 */
export function buildRoute(pages: RoutePage[], track: Track): RouteSummary {
  const moduleOrder = (id: string) => modules.findIndex((m) => id.startsWith(`${m.dir}/`));
  const own = pages
    .filter((p) => p.tracks.includes(track))
    .sort((a, b) => moduleOrder(a.id) - moduleOrder(b.id) || a.order - b.order);
  return { pages: own, totalMinutes: own.reduce((sum, p) => sum + p.readingTime, 0) };
}

export interface ChangelogLike {
  id: string;
  date: string;
  provider: string;
  title: string;
}

/** Notas de versión de herramientas («v2.1.301: …»): útiles en la página de novedades, pero ruido en la portada. */
const RELEASE_NOTE = /^(v\d|Gemini CLI v\d|Codex CLI \d)/i;

/**
 * Novedades para la portada: las más recientes que no sean notas de versión, con un máximo por
 * proveedor para que no las copie uno solo.
 */
export function selectHighlights<T extends ChangelogLike>(entries: T[], count: number, perProvider = 2): T[] {
  const sorted = [...entries]
    .filter((e) => !RELEASE_NOTE.test(e.title))
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? 1 : -1));
  const taken: Record<string, number> = {};
  const out: T[] = [];
  for (const e of sorted) {
    if ((taken[e.provider] ?? 0) >= perProvider) continue;
    taken[e.provider] = (taken[e.provider] ?? 0) + 1;
    out.push(e);
    if (out.length === count) break;
  }
  return out;
}

/** Primera frase de un resumen: en la portada basta con ella (el resto va en la página de novedades). */
export function firstSentence(text: string): string {
  const m = /^.*?[.!?](?=\s|$)/s.exec(text.trim());
  return m ? m[0] : text.trim();
}
