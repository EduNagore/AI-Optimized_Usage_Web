import { z } from 'astro/zod';
import { formatNumber } from './format';

/**
 * Lógica del visualizador de la ventana de contexto. Sin DOM, sin React y sin `astro:content`.
 *
 * Modelo: la ventana tiene `windowTokens` tokens y está ocupada por siete segmentos. Cinco son la
 * «parte estable» (instrucciones del sistema, herramientas, CLAUDE.md y memoria, descripciones de
 * skills, servidores MCP) y dos la «parte que crece» (conversación, ficheros leídos), igual que en
 * el diagrama `VentanaContexto.astro`. Todos los tamaños son tokens enteros.
 *
 * Los tamaños de partida son supuestos de la guía salvo donde `context-scenarios.json` cita una
 * página del sitio o una fuente. Nada de lo que hay aquí afirma umbrales automáticos de
 * compactación del proveedor.
 */

// ---------------------------------------------------------------------------------------------
// Resultado y validación de entradas
// ---------------------------------------------------------------------------------------------

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

/** Tope de cualquier cantidad de tokens: evita desbordes numéricos con entradas absurdas. */
export const MAX_TOKENS = 1_000_000_000;

/**
 * Convierte el texto de un campo en un entero entre `min` y `max`. Devuelve un error en una frase
 * (nunca lanza) para que la interfaz lo muestre junto al campo.
 */
export function parseWholeNumber(text: string, opts: { min?: number; max?: number } = {}): Result<number> {
  const { min = 0, max = MAX_TOKENS } = opts;
  const t = text.trim();
  if (t === '') return fail('Escribe un número.');
  if (!/^\d+$/.test(t)) return fail('Escribe un número entero, sin decimales, signos ni separadores.');
  const n = Number(t);
  if (n < min) return fail(`El mínimo es ${formatNumber(min)}.`);
  if (n > max) return fail(`El máximo es ${formatNumber(max)}.`);
  return ok(n);
}

function checkWhole(n: number, label: string, min = 0, max = MAX_TOKENS): Result<number> {
  if (!Number.isInteger(n)) return fail(`${label}: debe ser un número entero.`);
  if (n < min) return fail(`${label}: el mínimo es ${formatNumber(min)}.`);
  if (n > max) return fail(`${label}: el máximo es ${formatNumber(max)}.`);
  return ok(n);
}

// ---------------------------------------------------------------------------------------------
// Segmentos y estado
// ---------------------------------------------------------------------------------------------

export const SEGMENT_IDS = ['system', 'tools', 'memory', 'skills', 'mcp', 'conversation', 'files'] as const;
export type SegmentId = (typeof SEGMENT_IDS)[number];
/** Segmentos cuyo tamaño se guarda directamente; el de MCP se calcula con `mcpTokens`. */
export type DirectSegmentId = Exclude<SegmentId, 'mcp'>;

export interface SegmentMeta {
  id: SegmentId;
  label: string;
  /** `estable`: igual en cada turno (la caché puede reutilizarla). `crece`: se amplía con el trabajo. */
  kind: 'estable' | 'crece';
  description: string;
}

export const SEGMENTS: readonly SegmentMeta[] = [
  {
    id: 'system',
    label: 'Instrucciones del sistema',
    kind: 'estable',
    description: 'Las fija la aplicación o la API.',
  },
  {
    id: 'tools',
    label: 'Herramientas',
    kind: 'estable',
    description: 'Definiciones de las herramientas integradas (leer, buscar, ejecutar).',
  },
  {
    id: 'memory',
    label: 'CLAUDE.md y memoria',
    kind: 'estable',
    description: 'Ficheros de instrucciones y memoria del proyecto.',
  },
  {
    id: 'skills',
    label: 'Descripciones de skills',
    kind: 'estable',
    description: 'Nombre y descripción de cada skill; su contenido no entra hasta invocarla.',
  },
  {
    id: 'mcp',
    label: 'Servidores MCP',
    kind: 'estable',
    description: 'Definiciones de las herramientas de los servidores conectados.',
  },
  {
    id: 'conversation',
    label: 'Conversación',
    kind: 'crece',
    description: 'Tus mensajes, las respuestas y lo que entra al invocar skills o al compactar.',
  },
  {
    id: 'files',
    label: 'Ficheros leídos',
    kind: 'crece',
    description: 'Lo que se abre o se adjunta y las salidas voluminosas de herramientas.',
  },
];

const LABEL: Record<SegmentId, string> = Object.fromEntries(SEGMENTS.map((s) => [s.id, s.label])) as Record<
  SegmentId,
  string
>;

export const DIRECT_SEGMENT_IDS: readonly DirectSegmentId[] = [
  'system',
  'tools',
  'memory',
  'skills',
  'conversation',
  'files',
];

/**
 * Porcentaje (entero) de las definiciones de un servidor que sigue ocupando contexto cuando las
 * herramientas se cargan bajo demanda (tool search). Supuesto de la guía derivado de la medición
 * publicada por Anthropic: «más de un 85 %» de reducción, es decir, queda como mucho el 15 %.
 */
export const MCP_DEFERRED_PERCENT = 15;

export interface McpConfig {
  /** Servidores conectados. */
  servers: number;
  /** Tokens de las definiciones de un servidor cargadas por completo. */
  perServerTokens: number;
  /** Carga diferida (tool search): solo ocupa `MCP_DEFERRED_PERCENT` % de las definiciones. */
  deferred: boolean;
}

export interface ContextState {
  sizes: Record<DirectSegmentId, number>;
  mcp: McpConfig;
  /** Tokens de trabajo hechos en otras ventanas (subagentes). No ocupan esta ventana. */
  offloaded: number;
}

/**
 * Tokens que ocupan los servidores MCP: servidores × definiciones por servidor, y el 15 % si la carga
 * es diferida. Aritmética entera y un único redondeo final.
 */
export function mcpTokens(mcp: McpConfig): number {
  const full = mcp.servers * mcp.perServerTokens;
  return mcp.deferred ? Math.round((full * MCP_DEFERRED_PERCENT) / 100) : full;
}

export function segmentTokens(state: ContextState): Record<SegmentId, number> {
  return { ...state.sizes, mcp: mcpTokens(state.mcp) };
}

export function usedTokens(state: ContextState): number {
  const t = segmentTokens(state);
  return SEGMENT_IDS.reduce((sum, id) => sum + t[id], 0);
}

// ---------------------------------------------------------------------------------------------
// Reparto sobre la ventana
// ---------------------------------------------------------------------------------------------

export interface SegmentRow {
  id: SegmentId;
  label: string;
  kind: 'estable' | 'crece';
  /** Tokens reales del segmento (aunque no quepan). */
  tokens: number;
  /** Porcentaje de la ventana, con un decimal. Si no hay desbordamiento, los segmentos y el libre suman 100. */
  percent: number;
  /** Porcentaje que se dibuja en la barra (recortada a la ventana); siempre suma 100 con el libre. */
  barPercent: number;
}

export interface Layout {
  windowTokens: number;
  usedTokens: number;
  /** Tokens libres (0 si hay desbordamiento). */
  freeTokens: number;
  /** Tokens que no caben en la ventana (0 si todo cabe). */
  overflowTokens: number;
  overflow: boolean;
  /** Ocupación en % con un decimal; supera 100 si hay desbordamiento. */
  usedPercent: number;
  rows: SegmentRow[];
  free: { tokens: number; percent: number; barPercent: number };
}

/**
 * Reparte `units` unidades enteras entre `parts` en proporción a su valor (método del mayor resto):
 * cada parte recibe la parte entera de su cuota y las unidades sobrantes van a las partes con mayor
 * resto (a igualdad, a la primera). Garantiza que la suma sea exactamente `units`.
 */
export function largestRemainder(parts: readonly number[], units: number): number[] {
  const total = parts.reduce((a, b) => a + b, 0);
  if (total === 0 || units === 0) return parts.map(() => 0);
  // Cuota de cada parte = parte * units / total. Restos con enteros: (parte * units) % total.
  const base = parts.map((p) => Math.floor((p * units) / total));
  const rem = parts.map((p) => (p * units) % total);
  let left = units - base.reduce((a, b) => a + b, 0);
  const order = parts.map((_, i) => i).sort((a, b) => (rem[b] ?? 0) - (rem[a] ?? 0) || a - b);
  for (const i of order) {
    if (left <= 0) break;
    base[i] = (base[i] ?? 0) + 1;
    left -= 1;
  }
  return base;
}

export function computeLayout(state: ContextState, windowTokens: number): Result<Layout> {
  const w = checkWhole(windowTokens, 'La ventana', 1);
  if (!w.ok) return w;
  const tokens = segmentTokens(state);
  const used = SEGMENT_IDS.reduce((sum, id) => sum + tokens[id], 0);
  const overflow = used > windowTokens;
  const overflowTokens = overflow ? used - windowTokens : 0;
  const freeTokens = overflow ? 0 : windowTokens - used;

  let thousandths: number[];
  let barThousandths: number[];
  let usedThousandths: number;
  if (!overflow) {
    // Primero la ocupación total redondeada a 0,1 %; después se reparte entre los segmentos. Así los
    // segmentos y el libre suman exactamente 1000 milésimas (100,0 %) y el aviso usa la cifra que se ve.
    usedThousandths = Math.round((used * 1000) / windowTokens);
    thousandths = largestRemainder(
      SEGMENT_IDS.map((id) => tokens[id]),
      usedThousandths,
    );
    barThousandths = thousandths;
  } else {
    usedThousandths = Math.round((used * 1000) / windowTokens);
    thousandths = SEGMENT_IDS.map((id) => Math.round((tokens[id] * 1000) / windowTokens));
    // La barra se recorta: cada segmento ocupa lo que cabe en el hueco que queda.
    let remaining = windowTokens;
    const visible = SEGMENT_IDS.map((id) => {
      const v = Math.min(tokens[id], remaining);
      remaining -= v;
      return v;
    });
    barThousandths = largestRemainder(visible, 1000);
  }

  const rows: SegmentRow[] = SEGMENTS.map((meta, i) => ({
    id: meta.id,
    label: meta.label,
    kind: meta.kind,
    tokens: tokens[meta.id],
    percent: (thousandths[i] ?? 0) / 10,
    barPercent: (barThousandths[i] ?? 0) / 10,
  }));
  const freeThousandths = overflow ? 0 : 1000 - usedThousandths;
  return ok({
    windowTokens,
    usedTokens: used,
    freeTokens,
    overflowTokens,
    overflow,
    usedPercent: usedThousandths / 10,
    rows,
    free: { tokens: freeTokens, percent: freeThousandths / 10, barPercent: freeThousandths / 10 },
  });
}

export function formatPercent(p: number): string {
  return `${formatNumber(p, 1)} %`;
}

/** Resumen en texto para la región `aria-live`. */
export function summarize(layout: Layout): string {
  const win = `${formatNumber(layout.windowTokens)} tokens`;
  if (layout.overflow) {
    return `Contexto desbordado: ${formatPercent(layout.usedPercent)} de ${win} (${formatNumber(layout.usedTokens)} tokens). Sobran ${formatNumber(layout.overflowTokens)} tokens: la barra muestra solo lo que cabe.`;
  }
  return `Contexto ocupado: ${formatPercent(layout.usedPercent)} de ${win} (${formatNumber(layout.usedTokens)} tokens ocupados, ${formatNumber(layout.freeTokens)} libres).`;
}

export type AlertLevel = 'ok' | 'aviso' | 'desborde';

export interface Alert {
  level: AlertLevel;
  /** Frase corta para la región `aria-live`. */
  short: string;
  /** Explicación completa, con el porqué y el origen del umbral. */
  detail: string;
}

/**
 * Aviso de la guía. El umbral es editable y es una recomendación de la guía, no un límite del
 * proveedor: se compara con la ocupación que se muestra (redondeada a 0,1 %), así que lo que ves
 * es lo que dispara el aviso (80,0 % avisa con umbral 80; 79,9 % no).
 */
export function assess(layout: Layout, thresholdPercent: number): Alert {
  if (layout.overflow) {
    return {
      level: 'desborde',
      short: `No cabe: sobran ${formatNumber(layout.overflowTokens)} tokens.`,
      detail:
        `El contenido suma ${formatNumber(layout.usedTokens)} tokens y la ventana es de ${formatNumber(layout.windowTokens)}: sobran ${formatNumber(layout.overflowTokens)}. ` +
        'Según la documentación de Anthropic, en la API de Claude la petición falla con un error si solo la entrada supera la ventana; en otras herramientas el comportamiento cambia. ' +
        'Hay que quitar contexto (/clear, /compact, quitar servidores MCP) o usar una ventana mayor.',
    };
  }
  if (Math.round(layout.usedPercent * 10) >= thresholdPercent * 10) {
    return {
      level: 'aviso',
      short: `Ocupación del ${formatPercent(layout.usedPercent)}, por encima del umbral del ${formatNumber(thresholdPercent)} %: conviene compactar o abrir una sesión nueva.`,
      detail:
        `Recomendación de la guía: con el contexto al ${formatPercent(layout.usedPercent)}, conviene compactar o abrir una sesión nueva. ` +
        'Por qué: según Anthropic, a medida que crece el contexto la precisión y el recuerdo del modelo se degradan, aunque las fuentes no dan una cifra de cuánto ni desde qué tamaño. ' +
        `El umbral del ${formatNumber(thresholdPercent)} % es nuestro y editable: no es un límite del proveedor ni un momento en que ninguna herramienta compacte por sí sola.`,
    };
  }
  return {
    level: 'ok',
    short: '',
    detail: `Por debajo del umbral de la guía (${formatNumber(thresholdPercent)} %). El umbral es editable y no es un límite del proveedor.`,
  };
}

export interface WindowOption {
  id: string;
  name: string;
  windowTokens: number;
}

export interface WindowComparison extends WindowOption {
  usedPercent: number;
  overflow: boolean;
  overflowTokens: number;
}

/** El mismo contexto sobre varias ventanas: qué porcentaje ocupa en cada una y si cabe. */
export function compareWindows(state: ContextState, options: readonly WindowOption[]): WindowComparison[] {
  const used = usedTokens(state);
  return options.map((o) => ({
    ...o,
    usedPercent: Math.round((used * 1000) / o.windowTokens) / 10,
    overflow: used > o.windowTokens,
    overflowTokens: Math.max(0, used - o.windowTokens),
  }));
}

// ---------------------------------------------------------------------------------------------
// Acciones, historial y deshacer
// ---------------------------------------------------------------------------------------------

export type EditField = `size:${DirectSegmentId}` | 'mcp.servers' | 'mcp.perServerTokens' | 'mcp.deferred';

export type ContextAction =
  | { type: 'add-file'; tokens: number }
  | { type: 'add-turns'; turns: number; tokensPerTurn: number }
  | { type: 'clear' }
  | { type: 'compact'; summaryTokens: number }
  | { type: 'invoke-skill'; bodyTokens: number }
  | { type: 'subagent'; workTokens: number; summaryTokens: number }
  | { type: 'mcp-connect' }
  | { type: 'mcp-remove' }
  | { type: 'edit'; field: EditField; value: number | boolean };

export interface HistoryEntry {
  id: number;
  action: ContextAction;
  /** Frase legible de lo que pasó. */
  summary: string;
  /** Variación de tokens por segmento (solo los que cambian). */
  deltas: Partial<Record<SegmentId, number>>;
  /** Tokens de trabajo enviados a otras ventanas por esta acción. */
  offloaded: number;
  usedBefore: number;
  usedAfter: number;
}

export interface Session {
  initial: ContextState;
  current: ContextState;
  history: HistoryEntry[];
  /** `snapshots[i]` es el estado anterior a `history[i]`. */
  snapshots: ContextState[];
  nextId: number;
}

export function createSession(initial: ContextState): Session {
  const copy = cloneState(initial);
  return { initial: copy, current: cloneState(copy), history: [], snapshots: [], nextId: 1 };
}

export function cloneState(s: ContextState): ContextState {
  return { sizes: { ...s.sizes }, mcp: { ...s.mcp }, offloaded: s.offloaded };
}

function sameState(a: ContextState, b: ContextState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const n = (x: number) => formatNumber(x);
const q = (id: SegmentId) => `«${LABEL[id]}»`;

const NOTHING_TO_CLEAR = 'No hay conversación ni ficheros leídos que vaciar.';
const NOTHING_TO_COMPACT = 'No hay conversación ni ficheros leídos que resumir.';

function editLabel(field: EditField): string {
  if (field.startsWith('size:')) return q(field.slice(5) as DirectSegmentId);
  if (field === 'mcp.servers') return 'servidores MCP conectados';
  if (field === 'mcp.perServerTokens') return 'tokens por servidor MCP';
  return 'carga diferida de herramientas MCP';
}

/** Aplica una acción a un estado. Devuelve el estado nuevo o un error explicado; no modifica la entrada. */
export function reduceState(before: ContextState, action: ContextAction): Result<ContextState> {
  const s = cloneState(before);
  switch (action.type) {
    case 'add-file': {
      const c = checkWhole(action.tokens, 'Tamaño del fichero', 1);
      if (!c.ok) return c;
      s.sizes.files = before.sizes.files + c.value;
      return ok(s);
    }
    case 'add-turns': {
      const t = checkWhole(action.turns, 'Número de turnos', 1, 100_000);
      if (!t.ok) return t;
      const p = checkWhole(action.tokensPerTurn, 'Tokens por turno', 0);
      if (!p.ok) return p;
      s.sizes.conversation = before.sizes.conversation + t.value * p.value;
      return ok(s);
    }
    case 'clear': {
      if (before.sizes.conversation + before.sizes.files === 0) return fail(NOTHING_TO_CLEAR);
      s.sizes.conversation = 0;
      s.sizes.files = 0;
      return ok(s);
    }
    case 'compact': {
      const c = checkWhole(action.summaryTokens, 'Tamaño del resumen', 0);
      if (!c.ok) return c;
      const history = before.sizes.conversation + before.sizes.files;
      if (history === 0) return fail(NOTHING_TO_COMPACT);
      // Un resumen no puede ser mayor que lo que resume.
      s.sizes.conversation = Math.min(c.value, history);
      s.sizes.files = 0;
      return ok(s);
    }
    case 'invoke-skill': {
      const c = checkWhole(action.bodyTokens, 'Contenido de la skill', 1);
      if (!c.ok) return c;
      s.sizes.conversation = before.sizes.conversation + c.value;
      return ok(s);
    }
    case 'subagent': {
      const w = checkWhole(action.workTokens, 'Trabajo del subagente', 0);
      if (!w.ok) return w;
      const r = checkWhole(action.summaryTokens, 'Resumen del subagente', 0);
      if (!r.ok) return r;
      s.sizes.conversation = before.sizes.conversation + r.value;
      s.offloaded = before.offloaded + w.value;
      return ok(s);
    }
    case 'mcp-connect': {
      if (before.mcp.servers >= 1000)
        return fail('Ya hay 1.000 servidores MCP: es el máximo del visualizador.');
      s.mcp.servers = before.mcp.servers + 1;
      return ok(s);
    }
    case 'mcp-remove': {
      if (before.mcp.servers === 0) return fail('No hay ningún servidor MCP que quitar.');
      s.mcp.servers = before.mcp.servers - 1;
      return ok(s);
    }
    case 'edit': {
      const { field, value } = action;
      if (field === 'mcp.deferred') {
        if (typeof value !== 'boolean') return fail('La carga diferida es sí o no.');
        s.mcp.deferred = value;
        return ok(s);
      }
      if (typeof value !== 'number') return fail('Escribe un número.');
      if (field === 'mcp.servers') {
        const c = checkWhole(value, 'Servidores MCP', 0, 1000);
        if (!c.ok) return c;
        s.mcp.servers = c.value;
        return ok(s);
      }
      if (field === 'mcp.perServerTokens') {
        const c = checkWhole(value, 'Tokens por servidor', 0);
        if (!c.ok) return c;
        s.mcp.perServerTokens = c.value;
        return ok(s);
      }
      const id = field.slice(5) as DirectSegmentId;
      const c = checkWhole(value, LABEL[id], 0);
      if (!c.ok) return c;
      s.sizes[id] = c.value;
      return ok(s);
    }
  }
}

function deltas(before: ContextState, after: ContextState): Partial<Record<SegmentId, number>> {
  const a = segmentTokens(before);
  const b = segmentTokens(after);
  const out: Partial<Record<SegmentId, number>> = {};
  for (const id of SEGMENT_IDS) if (a[id] !== b[id]) out[id] = b[id] - a[id];
  return out;
}

/** Frase legible de lo que ha hecho una acción entre dos estados. */
export function describeAction(action: ContextAction, before: ContextState, after: ContextState): string {
  const d = deltas(before, after);
  switch (action.type) {
    case 'add-file':
      return `Fichero grande leído: +${n(action.tokens)} tokens en ${q('files')}.`;
    case 'add-turns': {
      const total = action.turns * action.tokensPerTurn;
      return `${n(action.turns)} ${action.turns === 1 ? 'turno' : 'turnos'} de conversación (${n(action.turns)} × ${n(action.tokensPerTurn)} tokens): +${n(total)} tokens en ${q('conversation')}.`;
    }
    case 'clear': {
      const removed = before.sizes.conversation + before.sizes.files;
      return `/clear: conversación y ficheros leídos vaciados (−${n(removed)} tokens). Lo estable se vuelve a cargar al empezar.`;
    }
    case 'compact': {
      const history = before.sizes.conversation + before.sizes.files;
      const result = after.sizes.conversation;
      const capped =
        action.summaryTokens > history ? ' (un resumen no puede ser mayor que lo que resume)' : '';
      return `/compact: el historial de ${n(history)} tokens (conversación y ficheros leídos) pasa a un resumen de ${n(result)} tokens${capped}.`;
    }
    case 'invoke-skill':
      return `Skill invocada: su contenido (+${n(action.bodyTokens)} tokens) entra en ${q('conversation')}. Su descripción ya estaba contada en ${q('skills')}.`;
    case 'subagent':
      return `Subagente: ${n(action.workTokens)} tokens de trabajo en su propia ventana (no cuentan aquí); a esta solo vuelve un resumen de ${n(action.summaryTokens)} tokens en ${q('conversation')}.`;
    case 'mcp-connect':
      return `Servidor MCP conectado (${after.mcp.deferred ? 'carga diferida' : 'definiciones completas'}): +${n(d.mcp ?? 0)} tokens. Ahora hay ${n(after.mcp.servers)}.`;
    case 'mcp-remove':
      return `Servidor MCP quitado: −${n(Math.abs(d.mcp ?? 0))} tokens. Ahora hay ${n(after.mcp.servers)}.`;
    case 'edit': {
      if (action.field === 'mcp.deferred') {
        return `Carga diferida de herramientas MCP ${after.mcp.deferred ? 'activada' : 'desactivada'}: ${q('mcp')} pasa de ${n(segmentTokens(before).mcp)} a ${n(segmentTokens(after).mcp)} tokens.`;
      }
      const from = action.field.startsWith('size:')
        ? before.sizes[action.field.slice(5) as DirectSegmentId]
        : action.field === 'mcp.servers'
          ? before.mcp.servers
          : before.mcp.perServerTokens;
      const to = action.field.startsWith('size:')
        ? after.sizes[action.field.slice(5) as DirectSegmentId]
        : action.field === 'mcp.servers'
          ? after.mcp.servers
          : after.mcp.perServerTokens;
      return `Ajuste manual de ${editLabel(action.field)}: de ${n(from)} a ${n(to)}.`;
    }
  }
}

function makeEntry(
  id: number,
  action: ContextAction,
  before: ContextState,
  after: ContextState,
): HistoryEntry {
  return {
    id,
    action,
    summary: describeAction(action, before, after),
    deltas: deltas(before, after),
    offloaded: after.offloaded - before.offloaded,
    usedBefore: usedTokens(before),
    usedAfter: usedTokens(after),
  };
}

/**
 * Aplica una acción y la anota en el historial. Los ajustes manuales consecutivos del mismo campo se
 * funden en una sola entrada (para que escribir «4», «45», «450» no deje tres), y si el valor vuelve al
 * original la entrada desaparece. Un ajuste igual al valor actual no hace nada.
 */
export function applyAction(session: Session, action: ContextAction): Result<Session> {
  const last = session.history[session.history.length - 1];
  const prevSnapshot = session.snapshots[session.snapshots.length - 1];
  if (
    action.type === 'edit' &&
    last &&
    prevSnapshot &&
    last.action.type === 'edit' &&
    last.action.field === action.field
  ) {
    const merged = reduceState(prevSnapshot, action);
    if (!merged.ok) return merged;
    if (sameState(prevSnapshot, merged.value)) {
      return ok({
        ...session,
        current: merged.value,
        history: session.history.slice(0, -1),
        snapshots: session.snapshots.slice(0, -1),
      });
    }
    return ok({
      ...session,
      current: merged.value,
      history: [...session.history.slice(0, -1), makeEntry(last.id, action, prevSnapshot, merged.value)],
    });
  }

  const next = reduceState(session.current, action);
  if (!next.ok) return next;
  if (action.type === 'edit' && sameState(session.current, next.value)) return ok(session);
  const entry = makeEntry(session.nextId, action, session.current, next.value);
  return ok({
    ...session,
    current: next.value,
    history: [...session.history, entry],
    snapshots: [...session.snapshots, cloneState(session.current)],
    nextId: session.nextId + 1,
  });
}

/** Deshace la última entrada del historial (acción o ajuste manual). */
export function undoLast(session: Session): Result<Session> {
  const prev = session.snapshots[session.snapshots.length - 1];
  if (!prev || session.history.length === 0) return fail('No hay ninguna acción que deshacer.');
  return ok({
    ...session,
    current: cloneState(prev),
    history: session.history.slice(0, -1),
    snapshots: session.snapshots.slice(0, -1),
  });
}

/** Vuelve al estado de partida del escenario y vacía el historial. */
export function resetSession(session: Session): Session {
  return createSession(session.initial);
}

// ---------------------------------------------------------------------------------------------
// Valores por defecto de las acciones y su explicación
// ---------------------------------------------------------------------------------------------

export interface ActionParams {
  /** Tamaño del fichero grande que se añade. */
  fileTokens: number;
  /** Turnos que se añaden de una vez. */
  turns: number;
  /** Tokens que añade cada turno (mensaje y respuesta). */
  tokensPerTurn: number;
  /** Tamaño del resumen que deja /compact. */
  compactSummaryTokens: number;
  /** Tamaño del contenido de una skill al invocarla. */
  skillBodyTokens: number;
  /** Trabajo que hace un subagente en su propia ventana. */
  subagentWorkTokens: number;
  /** Resumen que devuelve el subagente al hilo principal. */
  subagentSummaryTokens: number;
  /** Umbral del aviso, en %. */
  thresholdPercent: number;
}

/**
 * Valores de partida. Todos son supuestos de la guía para ver la forma del efecto; ninguno es una
 * medición. El de 2.000 tokens por turno es el ejemplo de la página «La ventana de contexto» (cifra
 * inventada para ver la forma). El contenido de la skill queda por debajo de los 5.000 tokens que la
 * documentación de la API de Claude da como cota del cuerpo de `SKILL.md`.
 */
export const DEFAULT_PARAMS: ActionParams = {
  fileTokens: 25_000,
  turns: 5,
  tokensPerTurn: 2_000,
  compactSummaryTokens: 3_000,
  skillBodyTokens: 4_000,
  subagentWorkTokens: 60_000,
  subagentSummaryTokens: 1_500,
  thresholdPercent: 80,
};

export type ClaimKind = 'verificado' | 'medicion' | 'recomendacion' | 'supuesto';

export interface ActionInfo {
  id: 'add-file' | 'add-turns' | 'clear' | 'compact' | 'invoke-skill' | 'subagent' | 'mcp';
  label: string;
  /** Qué hace en la barra. */
  effect: string;
  /** Tipo de afirmación de `basis`. */
  claim: ClaimKind;
  /** Qué respalda el efecto (dato, medición, recomendación o supuesto) y de dónde sale. */
  basis: string;
  /** Ruta de la página donde se detalla, sin base ni barra inicial. */
  page: string;
  pageLabel: string;
}

export const ACTION_INFO: readonly ActionInfo[] = [
  {
    id: 'add-file',
    label: 'Añadir un fichero grande',
    effect: 'El contenido entra en «Ficheros leídos» y se reenvía en cada turno siguiente.',
    claim: 'verificado',
    basis:
      'Según la documentación de Anthropic, la ventana incluye los documentos y los resultados de herramientas, y cada turno reenvía el historial. El tamaño del fichero es un supuesto de la guía.',
    page: 'm5-tokens-y-contexto/por-que-se-dispara-el-gasto/',
    pageLabel: 'Por qué se dispara el gasto',
  },
  {
    id: 'add-turns',
    label: 'Añadir turnos de conversación',
    effect: 'Cada turno suma tu mensaje y la respuesta a «Conversación».',
    claim: 'supuesto',
    basis:
      'Los 2.000 tokens por turno son el ejemplo de la página sobre la ventana de contexto: una cifra inventada para ver la forma, no una medición. El efecto (el historial crece y se reenvía entero) sí es un dato de la documentación.',
    page: 'm1-fundamentos/ventana-de-contexto/',
    pageLabel: 'La ventana de contexto',
  },
  {
    id: 'clear',
    label: '/clear',
    effect:
      'Vacía la conversación y los ficheros leídos. Permanece lo que se recarga al empezar: instrucciones del sistema, herramientas, CLAUDE.md, descripciones de skills y servidores MCP.',
    claim: 'verificado',
    basis:
      'Los datos de comandos (verificados el 16 de octubre de 2026) dicen que /clear inicia una conversación nueva con el contexto vacío y conserva la memoria del proyecto. La documentación de costes añade que no cuesta nada.',
    page: 'm5-tokens-y-contexto/dia-a-dia-en-claude-code/',
    pageLabel: 'El día a día en Claude Code',
  },
  {
    id: 'compact',
    label: '/compact',
    effect:
      'Sustituye el historial (conversación y ficheros leídos) por un resumen. Pierde detalle; por eso admite instrucciones de enfoque.',
    claim: 'verificado',
    basis:
      'Los datos de comandos dicen que /compact libera contexto resumiendo la conversación. Que el resumen también sustituya a los ficheros leídos es una decisión de modelado de la guía: esas lecturas forman parte del historial. El tamaño del resumen es un supuesto editable. La compactación tiene su coste: es una petición aparte.',
    page: 'm5-tokens-y-contexto/higiene-del-bucle/',
    pageLabel: 'Higiene del bucle de agente',
  },
  {
    id: 'invoke-skill',
    label: 'Invocar una skill',
    effect:
      'Hasta que se invoca, solo su descripción está en el contexto. Al invocarla entra su contenido, que se queda en la conversación.',
    claim: 'verificado',
    basis:
      'La documentación de la API de Claude cifra los metadatos en unos 100 tokens por skill y sitúa el cuerpo por debajo de 5.000 tokens. El tamaño que uses aquí es un supuesto de la guía.',
    page: 'm6-herramientas/skills/',
    pageLabel: 'Skills',
  },
  {
    id: 'subagent',
    label: 'Lanzar un subagente',
    effect:
      'El trabajo pesado ocurre en la ventana del subagente y a esta solo vuelve su resumen. El trabajo no desaparece: se consume en otra parte.',
    claim: 'verificado',
    basis:
      'Según la guía de higiene del bucle, un subagente trabaja en su propio contexto y el hilo principal solo ve el resumen. Los dos tamaños son supuestos de la guía. Cada subagente consume por su cuenta.',
    page: 'm8-agentes/encargo-a-subagentes/',
    pageLabel: 'Cómo encargar trabajo a un subagente',
  },
  {
    id: 'mcp',
    label: 'Conectar o quitar un servidor MCP',
    effect:
      'Las definiciones de sus herramientas ocupan contexto. Con carga diferida (tool search), solo ocupa una fracción hasta que se usa una herramienta.',
    claim: 'medicion',
    basis:
      'Medición publicada por Anthropic sobre su propio ejemplo: unos 55.000 tokens para cinco servidores y más de un 85 % menos con carga bajo demanda. En Claude Code las definiciones MCP van diferidas por defecto. El 15 % restante es un supuesto de la guía derivado de esa cifra.',
    page: 'm6-herramientas/conectores-y-mcp/',
    pageLabel: 'Conectores y MCP',
  },
];

// ---------------------------------------------------------------------------------------------
// Escenarios (src/data/context-scenarios.json)
// ---------------------------------------------------------------------------------------------

const tokens = z.number().int().nonnegative().max(MAX_TOKENS);
const originFor = z.object(
  Object.fromEntries(SEGMENT_IDS.map((id) => [id, z.string().min(1)])) as Record<SegmentId, z.ZodString>,
);

/** Un escenario de partida: tamaños de cada segmento y de dónde sale cada uno. */
export const scenarioSchema = z.object({
  id: z.string().min(1),
  titulo: z.string().min(1),
  resumen: z.string().min(1),
  sizes: z.object({
    system: tokens,
    tools: tokens,
    memory: tokens,
    skills: tokens,
    conversation: tokens,
    files: tokens,
  }),
  mcp: z.object({
    servers: z.number().int().nonnegative().max(1000),
    perServerTokens: tokens,
    deferred: z.boolean(),
  }),
  /** De dónde sale cada tamaño: página del sitio o fuente, o «Supuesto de la guía». */
  origen: originFor,
  /** Nota general del escenario. */
  nota: z.string().min(1),
  source: z.string().min(1),
  otherSources: z.array(z.string().min(1)).optional(),
  verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type ContextScenario = z.infer<typeof scenarioSchema>;

export function stateFromScenario(sc: ContextScenario): ContextState {
  return {
    sizes: { ...sc.sizes },
    mcp: { ...sc.mcp },
    offloaded: 0,
  };
}
