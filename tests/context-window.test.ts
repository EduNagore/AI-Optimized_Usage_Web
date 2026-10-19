import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACTION_INFO,
  DEFAULT_PARAMS,
  MCP_DEFERRED_PERCENT,
  SEGMENT_IDS,
  applyAction,
  assess,
  compareWindows,
  computeLayout,
  createSession,
  largestRemainder,
  mcpTokens,
  parseWholeNumber,
  resetSession,
  scenarioSchema,
  segmentTokens,
  stateFromScenario,
  summarize,
  undoLast,
  usedTokens,
  type ContextAction,
  type ContextState,
  type Layout,
  type Session,
} from '../src/lib/context-window';
import type { CommandRecord, ModelRecord, SourceRecord } from '../src/lib/schemas';

const load = <T>(name: string): T => JSON.parse(readFileSync(`src/data/${name}.json`, 'utf8')) as T;

/**
 * Estado de partida de casi todos los tests (números redondos para que la cuenta sea limpia):
 *   sistema 6.000 + herramientas 12.000 + memoria 1.000 + skills 1.000
 *   + MCP 2 servidores × 11.000 = 22.000 (sin carga diferida)
 *   + conversación 20.000 + ficheros 10.000
 *   = 72.000 tokens.
 */
const base = (): ContextState => ({
  sizes: { system: 6000, tools: 12000, memory: 1000, skills: 1000, conversation: 20000, files: 10000 },
  mcp: { servers: 2, perServerTokens: 11000, deferred: false },
  offloaded: 0,
});

function layoutOf(state: ContextState, windowTokens: number): Layout {
  const l = computeLayout(state, windowTokens);
  if (!l.ok) throw new Error(l.error);
  return l.value;
}

function apply(session: Session, action: ContextAction): Session {
  const r = applyAction(session, action);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('segmentos y MCP', () => {
  it('suma los siete segmentos', () => {
    // 6.000 + 12.000 + 1.000 + 1.000 + 22.000 + 20.000 + 10.000 = 72.000
    expect(usedTokens(base())).toBe(72_000);
    expect(segmentTokens(base()).mcp).toBe(22_000);
  });

  it('calcula el MCP como servidores × definiciones, y el 15 % con carga diferida', () => {
    // 2 × 11.000 = 22.000; diferida: 22.000 × 15 / 100 = 3.300
    expect(mcpTokens({ servers: 2, perServerTokens: 11000, deferred: false })).toBe(22_000);
    expect(mcpTokens({ servers: 2, perServerTokens: 11000, deferred: true })).toBe(3_300);
    // 3 × 11.000 × 15 / 100 = 4.950
    expect(mcpTokens({ servers: 3, perServerTokens: 11000, deferred: true })).toBe(4_950);
    // Sin servidores no hay nada, diferida o no.
    expect(mcpTokens({ servers: 0, perServerTokens: 11000, deferred: true })).toBe(0);
    // Redondeo único al final: 1 × 1.001 × 15 / 100 = 150,15 → 150
    expect(mcpTokens({ servers: 1, perServerTokens: 1001, deferred: true })).toBe(150);
    expect(MCP_DEFERRED_PERCENT).toBe(15);
  });
});

describe('reparto porcentual y redondeo', () => {
  it('reparte con números exactos en una ventana de 200.000', () => {
    const l = layoutOf(base(), 200_000);
    const pct = Object.fromEntries(l.rows.map((r) => [r.id, r.percent]));
    // sistema 6.000/200.000 = 3 %; herramientas 12.000 → 6 %; memoria 1.000 → 0,5 %; skills 0,5 %;
    // MCP 22.000 → 11 %; conversación 20.000 → 10 %; ficheros 10.000 → 5 %.
    expect(pct).toEqual({
      system: 3,
      tools: 6,
      memory: 0.5,
      skills: 0.5,
      mcp: 11,
      conversation: 10,
      files: 5,
    });
    // Ocupado 72.000/200.000 = 36 %; libre 128.000 → 64 %.
    expect(l.usedPercent).toBe(36);
    expect(l.freeTokens).toBe(128_000);
    expect(l.free.percent).toBe(64);
    expect(l.overflow).toBe(false);
  });

  it('con 1.000.000 de ventana, los mismos 72.000 son el 7,2 %', () => {
    // 72.000 × 1000 / 1.000.000 = 72 milésimas → 7,2 %; libre 928.000 → 92,8 %
    const l = layoutOf(base(), 1_000_000);
    expect(l.usedPercent).toBe(7.2);
    expect(l.free.percent).toBe(92.8);
  });

  it('segmentos + libre suman exactamente la ventana y el 100 % (tercios)', () => {
    // Ventana de 3 tokens: sistema 1, herramientas 1, resto 0, libre 1.
    // Cada uno vale 1000/3 = 333,33 milésimas. Ocupado = round(2 × 1000 / 3) = round(666,67) = 667.
    // Reparto de 667 entre [1, 1]: 333 + 333 = 666, sobra 1 con resto igual → va al primero: 334 y 333.
    // Libre = 1000 − 667 = 333. Suma: 334 + 333 + 333 = 1000.
    const st = base();
    st.sizes = { system: 1, tools: 1, memory: 0, skills: 0, conversation: 0, files: 0 };
    st.mcp.servers = 0;
    const l = layoutOf(st, 3);
    expect(l.rows.find((r) => r.id === 'system')?.percent).toBe(33.4);
    expect(l.rows.find((r) => r.id === 'tools')?.percent).toBe(33.3);
    expect(l.free.percent).toBe(33.3);
    expect(l.usedPercent).toBe(66.7);
    const tokensSum = l.rows.reduce((a, r) => a + r.tokens, 0) + l.freeTokens;
    expect(tokensSum).toBe(3);
    const pctSum = l.rows.reduce((a, r) => a + r.percent, 0) + l.free.percent;
    expect(Math.round(pctSum * 10)).toBe(1000);
  });

  it('con contexto vacío todo es libre', () => {
    const st = base();
    st.sizes = { system: 0, tools: 0, memory: 0, skills: 0, conversation: 0, files: 0 };
    st.mcp.servers = 0;
    const l = layoutOf(st, 200_000);
    expect(l.usedTokens).toBe(0);
    expect(l.free.percent).toBe(100);
    expect(l.rows.every((r) => r.percent === 0)).toBe(true);
  });

  it('un segmento diminuto no rompe la suma: 1 token en 1.000.000', () => {
    // 1 × 1000 / 1.000.000 = 0,001 milésimas → ocupado 0 → todos los segmentos 0,0 %, libre 100 %.
    const st = base();
    st.sizes = { system: 1, tools: 0, memory: 0, skills: 0, conversation: 0, files: 0 };
    st.mcp.servers = 0;
    const l = layoutOf(st, 1_000_000);
    expect(l.rows[0]?.tokens).toBe(1);
    expect(l.rows[0]?.percent).toBe(0);
    expect(l.free.percent).toBe(100);
  });

  it('para cualquier estado sin desbordar, segmentos + libre = ventana y = 100 %', () => {
    // Generador congruencial determinista (no hay azar: el test es reproducible).
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    for (let i = 0; i < 300; i++) {
      const win = 1000 + (next() % 1_000_000);
      const room = Math.floor(win / 7);
      const st = base();
      st.sizes = {
        system: next() % room,
        tools: next() % room,
        memory: next() % room,
        skills: next() % room,
        conversation: next() % room,
        files: next() % room,
      };
      st.mcp = { servers: next() % 3, perServerTokens: next() % Math.floor(room / 3), deferred: false };
      const l = layoutOf(st, win);
      expect(l.overflow).toBe(false);
      expect(l.rows.reduce((a, r) => a + r.tokens, 0) + l.freeTokens).toBe(win);
      const thousandths =
        l.rows.reduce((a, r) => a + Math.round(r.percent * 10), 0) + Math.round(l.free.percent * 10);
      expect(thousandths).toBe(1000);
    }
  });

  it('largestRemainder reparte las unidades sobrantes a los mayores restos', () => {
    // [5, 3, 2] sobre 10 unidades → exacto [5, 3, 2].
    expect(largestRemainder([5, 3, 2], 10)).toEqual([5, 3, 2]);
    // [1, 1, 1] sobre 10: cuotas 3,33 → base 3,3,3 = 9, sobra 1 → al primero con resto igual: [4, 3, 3].
    expect(largestRemainder([1, 1, 1], 10)).toEqual([4, 3, 3]);
    // [2, 1] sobre 10: cuotas 6,67 y 3,33 → base 6 y 3, sobra 1; mayor resto (2×10 % 3 = 2 frente a 1) → [7, 3].
    expect(largestRemainder([2, 1], 10)).toEqual([7, 3]);
    expect(largestRemainder([0, 0], 10)).toEqual([0, 0]);
  });

  it('rechaza una ventana no válida con un error explicado', () => {
    for (const w of [0, -5, 1.5, Number.NaN]) {
      const l = computeLayout(base(), w);
      expect(l.ok).toBe(false);
      if (!l.ok) expect(l.error).toMatch(/ventana/i);
    }
  });
});

describe('/clear', () => {
  it('conserva solo lo fijo y vacía conversación y ficheros', () => {
    // Antes: 72.000. Se quitan conversación 20.000 y ficheros 10.000 → 42.000
    // (6.000 + 12.000 + 1.000 + 1.000 + 22.000).
    const s = apply(createSession(base()), { type: 'clear' });
    expect(s.current.sizes.conversation).toBe(0);
    expect(s.current.sizes.files).toBe(0);
    expect(usedTokens(s.current)).toBe(42_000);
    expect(s.history[0]?.deltas).toEqual({ conversation: -20_000, files: -10_000 });
    expect(s.history[0]?.summary).toMatch(/\/clear.*30\.000/);
  });

  it('no deja pasar un /clear sin nada que vaciar', () => {
    let s = apply(createSession(base()), { type: 'clear' });
    const again = applyAction(s, { type: 'clear' });
    expect(again.ok).toBe(false);
    s = apply(s, { type: 'mcp-connect' });
    expect(s.history).toHaveLength(2);
  });

  it('no toca el trabajo hecho fuera de la ventana', () => {
    let s = apply(createSession(base()), { type: 'subagent', workTokens: 60_000, summaryTokens: 1_500 });
    s = apply(s, { type: 'clear' });
    expect(s.current.offloaded).toBe(60_000);
  });
});

describe('/compact', () => {
  it('sustituye conversación y ficheros por un resumen de N tokens', () => {
    // Historial = 20.000 + 10.000 = 30.000 → resumen de 3.000 en la conversación, ficheros a 0.
    // Total = 6.000 + 12.000 + 1.000 + 1.000 + 22.000 + 3.000 = 45.000.
    const s = apply(createSession(base()), { type: 'compact', summaryTokens: 3_000 });
    expect(s.current.sizes.conversation).toBe(3_000);
    expect(s.current.sizes.files).toBe(0);
    expect(usedTokens(s.current)).toBe(45_000);
    expect(s.history[0]?.deltas).toEqual({ conversation: -17_000, files: -10_000 });
  });

  it('un resumen no puede ser mayor que lo que resume', () => {
    // Historial 30.000; resumen pedido de 50.000 → se queda en 30.000 y la entrada lo dice.
    const s = apply(createSession(base()), { type: 'compact', summaryTokens: 50_000 });
    expect(s.current.sizes.conversation).toBe(30_000);
    expect(usedTokens(s.current)).toBe(72_000);
    expect(s.history[0]?.summary).toMatch(/no puede ser mayor/);
  });

  it('con resumen de 0 tokens deja el historial vacío', () => {
    const s = apply(createSession(base()), { type: 'compact', summaryTokens: 0 });
    expect(usedTokens(s.current)).toBe(42_000);
  });

  it('sin historial no hay nada que resumir', () => {
    const st = base();
    st.sizes.conversation = 0;
    st.sizes.files = 0;
    const r = applyAction(createSession(st), { type: 'compact', summaryTokens: 3_000 });
    expect(r.ok).toBe(false);
  });

  it('rechaza un tamaño de resumen negativo o con decimales', () => {
    expect(applyAction(createSession(base()), { type: 'compact', summaryTokens: -1 }).ok).toBe(false);
    expect(applyAction(createSession(base()), { type: 'compact', summaryTokens: 10.5 }).ok).toBe(false);
  });
});

describe('skills: descripción frente a contenido', () => {
  it('invocar una skill añade su contenido a la conversación y no toca las descripciones', () => {
    // Descripciones: 1.000 (ya contadas). Contenido: +4.000 en la conversación → 24.000.
    // Total = 72.000 + 4.000 = 76.000.
    const s = apply(createSession(base()), { type: 'invoke-skill', bodyTokens: 4_000 });
    expect(s.current.sizes.skills).toBe(1_000);
    expect(s.current.sizes.conversation).toBe(24_000);
    expect(usedTokens(s.current)).toBe(76_000);
    expect(s.history[0]?.deltas).toEqual({ conversation: 4_000 });
  });

  it('el contenido de una skill invocada desaparece con /clear', () => {
    // 72.000 + 4.000 = 76.000; /clear quita conversación (24.000) y ficheros (10.000) → 42.000.
    let s = apply(createSession(base()), { type: 'invoke-skill', bodyTokens: 4_000 });
    s = apply(s, { type: 'clear' });
    expect(usedTokens(s.current)).toBe(42_000);
    expect(s.current.sizes.skills).toBe(1_000);
  });
});

describe('subagentes: solo vuelve el resumen', () => {
  it('suma al hilo principal el resumen y anota el trabajo hecho fuera', () => {
    // Trabajo 60.000 en otra ventana; vuelve un resumen de 1.500 → conversación 21.500.
    // Total = 72.000 + 1.500 = 73.500 (y no 72.000 + 60.000 = 132.000 si se hubiera hecho en el hilo).
    const s = apply(createSession(base()), { type: 'subagent', workTokens: 60_000, summaryTokens: 1_500 });
    expect(usedTokens(s.current)).toBe(73_500);
    expect(s.current.sizes.conversation).toBe(21_500);
    expect(s.current.offloaded).toBe(60_000);
    expect(s.history[0]?.offloaded).toBe(60_000);
    expect(s.history[0]?.deltas).toEqual({ conversation: 1_500 });
  });

  it('el trabajo fuera se acumula', () => {
    let s = apply(createSession(base()), { type: 'subagent', workTokens: 60_000, summaryTokens: 1_500 });
    s = apply(s, { type: 'subagent', workTokens: 40_000, summaryTokens: 1_000 });
    // 60.000 + 40.000 = 100.000 fuera; dentro 72.000 + 1.500 + 1.000 = 74.500.
    expect(s.current.offloaded).toBe(100_000);
    expect(usedTokens(s.current)).toBe(74_500);
  });
});

describe('ficheros, turnos y servidores MCP', () => {
  it('añade un fichero grande a «Ficheros leídos»', () => {
    // 10.000 + 25.000 = 35.000 en ficheros; total 72.000 + 25.000 = 97.000
    const s = apply(createSession(base()), { type: 'add-file', tokens: 25_000 });
    expect(s.current.sizes.files).toBe(35_000);
    expect(usedTokens(s.current)).toBe(97_000);
  });

  it('añade turnos: turnos × tokens por turno', () => {
    // 5 × 2.000 = 10.000 → conversación 30.000; total 82.000
    const s = apply(createSession(base()), { type: 'add-turns', turns: 5, tokensPerTurn: 2_000 });
    expect(s.current.sizes.conversation).toBe(30_000);
    expect(usedTokens(s.current)).toBe(82_000);
    expect(s.history[0]?.summary).toMatch(/5 turnos.*5 × 2\.000.*10\.000/);
  });

  it('un turno se dice en singular y cero turnos se rechaza', () => {
    const s = apply(createSession(base()), { type: 'add-turns', turns: 1, tokensPerTurn: 2_000 });
    expect(s.history[0]?.summary).toMatch(/^1 turno de/);
    expect(applyAction(s, { type: 'add-turns', turns: 0, tokensPerTurn: 2_000 }).ok).toBe(false);
  });

  it('conectar un servidor suma 11.000 completo o 1.650 con carga diferida', () => {
    // Completo: 3 × 11.000 = 33.000 (+11.000).
    const full = apply(createSession(base()), { type: 'mcp-connect' });
    expect(segmentTokens(full.current).mcp).toBe(33_000);
    expect(full.history[0]?.deltas).toEqual({ mcp: 11_000 });
    // Diferida: 3 × 11.000 × 15 / 100 = 4.950, frente a 3.300 con dos → +1.650.
    const st = base();
    st.mcp.deferred = true;
    const def = apply(createSession(st), { type: 'mcp-connect' });
    expect(segmentTokens(def.current).mcp).toBe(4_950);
    expect(def.history[0]?.deltas).toEqual({ mcp: 1_650 });
  });

  it('quitar servidores reduce el MCP y no baja de cero', () => {
    let s = apply(createSession(base()), { type: 'mcp-remove' });
    expect(segmentTokens(s.current).mcp).toBe(11_000);
    s = apply(s, { type: 'mcp-remove' });
    expect(segmentTokens(s.current).mcp).toBe(0);
    const r = applyAction(s, { type: 'mcp-remove' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ningún servidor/);
  });

  it('activar la carga diferida libera el 85 % de las definiciones', () => {
    // 22.000 → 3.300: −18.700. Total 72.000 − 18.700 = 53.300.
    const s = apply(createSession(base()), { type: 'edit', field: 'mcp.deferred', value: true });
    expect(usedTokens(s.current)).toBe(53_300);
    expect(s.history[0]?.deltas).toEqual({ mcp: -18_700 });
  });
});

describe('desbordamiento', () => {
  it('avisa y recorta la barra a la ventana, con el texto de lo que sobra', () => {
    // Ventana 60.000, ocupado 72.000 → sobran 12.000.
    // Recorte en orden: sistema 6.000, herramientas 12.000 (18.000), memoria 1.000 (19.000), skills 1.000 (20.000),
    // MCP 22.000 (42.000), conversación: quedan 18.000 de 20.000 → 18.000 (60.000), ficheros 0 visibles.
    const l = layoutOf(base(), 60_000);
    expect(l.overflow).toBe(true);
    expect(l.overflowTokens).toBe(12_000);
    expect(l.freeTokens).toBe(0);
    expect(l.usedPercent).toBe(120);
    const bar = Object.fromEntries(l.rows.map((r) => [r.id, r.barPercent]));
    // 6.000/60.000 = 10 %; 12.000 → 20 %; 1.000 → 1,7 %; 1,7 %; 22.000 → 36,7 %; 18.000 → 30 %; 0 %.
    expect(bar['system']).toBe(10);
    expect(bar['tools']).toBe(20);
    expect(bar['conversation']).toBe(30);
    expect(bar['files']).toBe(0);
    // La barra suma exactamente 100 %.
    expect(Math.round(l.rows.reduce((a, r) => a + r.barPercent, 0) * 10)).toBe(1000);
    expect(l.free.barPercent).toBe(0);
    // Los porcentajes reales del cuadro sí cuentan lo que no cabe: ficheros 10.000/60.000 = 16,7 %.
    expect(l.rows.find((r) => r.id === 'files')?.percent).toBe(16.7);
    expect(l.rows.find((r) => r.id === 'conversation')?.percent).toBe(33.3);
  });

  it('el resumen y el aviso lo cuentan con palabras', () => {
    const l = layoutOf(base(), 60_000);
    expect(summarize(l)).toBe(
      'Contexto desbordado: 120 % de 60.000 tokens (72.000 tokens). Sobran 12.000 tokens: la barra muestra solo lo que cabe.',
    );
    const a = assess(l, 80);
    expect(a.level).toBe('desborde');
    expect(a.short).toBe('No cabe: sobran 12.000 tokens.');
    expect(a.detail).toMatch(/12\.000/);
  });

  it('exactamente la ventana llena no es desbordamiento', () => {
    const l = layoutOf(base(), 72_000);
    expect(l.overflow).toBe(false);
    expect(l.freeTokens).toBe(0);
    expect(l.usedPercent).toBe(100);
    expect(l.free.percent).toBe(0);
  });

  it('un token por encima sí desborda', () => {
    const l = layoutOf(base(), 71_999);
    expect(l.overflow).toBe(true);
    expect(l.overflowTokens).toBe(1);
  });
});

describe('aviso de ocupación (recomendación de la guía)', () => {
  const withUsed = (used: number): ContextState => {
    const st = base();
    st.mcp.servers = 0;
    st.sizes = { system: used, tools: 0, memory: 0, skills: 0, conversation: 0, files: 0 };
    return st;
  };

  it('en el umbral exacto avisa; por debajo no', () => {
    // Ventana 100.000, umbral 80 %: 80.000 → 80,0 % avisa; 79.000 → 79,0 % no.
    expect(assess(layoutOf(withUsed(80_000), 100_000), 80).level).toBe('aviso');
    expect(assess(layoutOf(withUsed(79_000), 100_000), 80).level).toBe('ok');
  });

  it('se compara con la cifra que se ve (0,1 %)', () => {
    // 79.949 × 1000 / 100.000 = 799,49 → 799 → 79,9 % → no avisa.
    // 79.950 → 799,5 → 800 → 80,0 % → avisa (se muestra 80 %).
    expect(assess(layoutOf(withUsed(79_949), 100_000), 80).level).toBe('ok');
    expect(assess(layoutOf(withUsed(79_950), 100_000), 80).level).toBe('aviso');
  });

  it('el umbral es editable', () => {
    // 50.000 de 100.000 = 50 %: avisa con umbral 50 y no con 51.
    expect(assess(layoutOf(withUsed(50_000), 100_000), 50).level).toBe('aviso');
    expect(assess(layoutOf(withUsed(50_000), 100_000), 51).level).toBe('ok');
  });

  it('el texto es una recomendación y no atribuye el umbral al proveedor', () => {
    const a = assess(layoutOf(withUsed(90_000), 100_000), 80);
    expect(a.short).toContain('conviene compactar o abrir una sesión nueva');
    expect(a.detail).toMatch(/Recomendación de la guía/);
    expect(a.detail).toMatch(/no es un límite del proveedor/);
    expect(a.detail).not.toMatch(/automátic[ao]mente/);
  });

  it('el resumen del estado normal sigue el formato pedido', () => {
    // 72.000 de 200.000 = 36 %; libres 128.000.
    expect(summarize(layoutOf(base(), 200_000))).toBe(
      'Contexto ocupado: 36 % de 200.000 tokens (72.000 tokens ocupados, 128.000 libres).',
    );
    // 7,2 % con coma decimal en español.
    expect(summarize(layoutOf(base(), 1_000_000))).toContain('7,2 % de 1.000.000 tokens');
  });
});

describe('comparación entre ventanas', () => {
  it('el mismo contexto ocupa distinto en 1.000.000 y en 200.000', () => {
    const st = base();
    st.sizes.conversation = 120_000;
    st.sizes.files = 80_000;
    // Ocupado: 6.000 + 12.000 + 1.000 + 1.000 + 22.000 + 120.000 + 80.000 = 242.000
    const cmp = compareWindows(st, [
      { id: 'a', name: 'Grande', windowTokens: 1_000_000 },
      { id: 'b', name: 'Pequeña', windowTokens: 200_000 },
    ]);
    // 242.000 / 1.000.000 = 24,2 %; en 200.000 desborda en 42.000 (121 %).
    expect(cmp[0]).toMatchObject({ usedPercent: 24.2, overflow: false, overflowTokens: 0 });
    expect(cmp[1]).toMatchObject({ usedPercent: 121, overflow: true, overflowTokens: 42_000 });
  });
});

describe('historial, deshacer y restablecer', () => {
  it('deshace la última acción y vuelve exactamente al estado anterior', () => {
    const s0 = createSession(base());
    let s = apply(s0, { type: 'add-file', tokens: 25_000 });
    s = apply(s, { type: 'compact', summaryTokens: 3_000 });
    // Tras el fichero: 97.000. Tras compactar: historial 20.000 + 35.000 = 55.000 → resumen 3.000:
    // 97.000 − 55.000 + 3.000 = 45.000.
    expect(usedTokens(s.current)).toBe(45_000);
    expect(s.history).toHaveLength(2);
    const u = undoLast(s);
    expect(u.ok).toBe(true);
    if (!u.ok) return;
    expect(usedTokens(u.value.current)).toBe(97_000);
    expect(u.value.history).toHaveLength(1);
    const u2 = undoLast(u.value);
    if (!u2.ok) throw new Error(u2.error);
    expect(u2.value.current).toEqual(s0.current);
    expect(u2.value.history).toHaveLength(0);
  });

  it('deshace también el trabajo fuera de la ventana de un subagente', () => {
    const s = apply(createSession(base()), { type: 'subagent', workTokens: 60_000, summaryTokens: 1_500 });
    const u = undoLast(s);
    if (!u.ok) throw new Error(u.error);
    expect(u.value.current.offloaded).toBe(0);
  });

  it('no hay nada que deshacer en una sesión nueva', () => {
    const r = undoLast(createSession(base()));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/deshacer/);
  });

  it('restablecer vuelve al escenario de partida y vacía el historial', () => {
    let s = apply(createSession(base()), { type: 'clear' });
    s = apply(s, { type: 'edit', field: 'size:system', value: 1 });
    const r = resetSession(s);
    expect(usedTokens(r.current)).toBe(72_000);
    expect(r.history).toEqual([]);
  });

  it('una acción con error no cambia la sesión', () => {
    const s = createSession(base());
    const r = applyAction(s, { type: 'add-file', tokens: -5 });
    expect(r.ok).toBe(false);
    expect(s.history).toHaveLength(0);
    expect(usedTokens(s.current)).toBe(72_000);
  });

  it('no modifica la sesión de entrada (inmutabilidad)', () => {
    const s = createSession(base());
    const before = JSON.stringify(s);
    apply(s, { type: 'clear' });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('los ajustes manuales consecutivos del mismo campo se funden en una entrada', () => {
    // Escribir «4», «45», «450» en Conversación: una sola entrada, de 20.000 a 450.
    let s = createSession(base());
    for (const v of [4, 45, 450]) s = apply(s, { type: 'edit', field: 'size:conversation', value: v });
    expect(s.history).toHaveLength(1);
    expect(s.history[0]?.summary).toBe('Ajuste manual de «Conversación»: de 20.000 a 450.');
    // Deshacer vuelve a 20.000, no a 45.
    const u = undoLast(s);
    if (!u.ok) throw new Error(u.error);
    expect(u.value.current.sizes.conversation).toBe(20_000);
  });

  it('si el ajuste vuelve al valor original, la entrada desaparece', () => {
    let s = createSession(base());
    s = apply(s, { type: 'edit', field: 'size:conversation', value: 5 });
    s = apply(s, { type: 'edit', field: 'size:conversation', value: 20_000 });
    expect(s.history).toHaveLength(0);
    expect(s.snapshots).toHaveLength(0);
  });

  it('un ajuste igual al valor actual no deja entrada', () => {
    const s = apply(createSession(base()), { type: 'edit', field: 'size:system', value: 6_000 });
    expect(s.history).toHaveLength(0);
  });

  it('ajustes de campos distintos no se funden', () => {
    let s = apply(createSession(base()), { type: 'edit', field: 'size:system', value: 7_000 });
    s = apply(s, { type: 'edit', field: 'size:tools', value: 13_000 });
    expect(s.history).toHaveLength(2);
    expect(usedTokens(s.current)).toBe(74_000);
  });

  it('valida los ajustes: negativos, decimales, tipos y topes', () => {
    const s = createSession(base());
    expect(applyAction(s, { type: 'edit', field: 'size:tools', value: -1 }).ok).toBe(false);
    expect(applyAction(s, { type: 'edit', field: 'size:tools', value: 1.5 }).ok).toBe(false);
    expect(applyAction(s, { type: 'edit', field: 'size:tools', value: true }).ok).toBe(false);
    expect(applyAction(s, { type: 'edit', field: 'mcp.deferred', value: 3 }).ok).toBe(false);
    expect(applyAction(s, { type: 'edit', field: 'mcp.servers', value: 1001 }).ok).toBe(false);
    expect(applyAction(s, { type: 'edit', field: 'size:tools', value: Number.NaN }).ok).toBe(false);
  });
});

describe('parseWholeNumber', () => {
  it('acepta enteros y rechaza el resto con una frase', () => {
    expect(parseWholeNumber('25000')).toEqual({ ok: true, value: 25_000 });
    expect(parseWholeNumber(' 0 ')).toEqual({ ok: true, value: 0 });
    for (const bad of ['', '  ', '12,5', '1.5', '-3', '1e3', 'abc']) {
      const r = parseWholeNumber(bad);
      expect(r.ok).toBe(false);
    }
  });

  it('respeta mínimo y máximo', () => {
    const lo = parseWholeNumber('0', { min: 1 });
    expect(lo).toEqual({ ok: false, error: 'El mínimo es 1.' });
    const hi = parseWholeNumber('101', { min: 1, max: 100 });
    expect(hi).toEqual({ ok: false, error: 'El máximo es 100.' });
    expect(parseWholeNumber('100', { min: 1, max: 100 })).toEqual({ ok: true, value: 100 });
  });
});

describe('src/data/context-scenarios.json', () => {
  const raw = load<unknown[]>('context-scenarios');
  const scenarios = raw.map((r) => scenarioSchema.parse(r));
  const sources = load<SourceRecord[]>('sources');
  const sourceIds = new Set(sources.map((s) => s.id));

  it('cada escenario cumple el esquema y no repite ids', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(3);
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
  });

  it('cita fuentes que existen en sources.json', () => {
    for (const sc of scenarios) {
      expect(sourceIds.has(sc.source)).toBe(true);
      for (const o of sc.otherSources ?? []) expect(sourceIds.has(o)).toBe(true);
    }
  });

  it('cada segmento dice de dónde sale su tamaño', () => {
    for (const sc of scenarios) {
      for (const id of SEGMENT_IDS) expect(sc.origen[id].length).toBeGreaterThan(20);
    }
  });

  it('el esquema rechaza tamaños negativos o con decimales y orígenes ausentes', () => {
    const first = raw[0] as Record<string, unknown>;
    expect(
      scenarioSchema.safeParse({ ...first, sizes: { ...(first['sizes'] as object), system: -1 } }).success,
    ).toBe(false);
    expect(
      scenarioSchema.safeParse({ ...first, sizes: { ...(first['sizes'] as object), tools: 1.5 } }).success,
    ).toBe(false);
    expect(scenarioSchema.safeParse({ ...first, origen: {} }).success).toBe(false);
  });

  it('los totales coinciden con la cuenta hecha a mano', () => {
    const total = Object.fromEntries(scenarios.map((s) => [s.id, usedTokens(stateFromScenario(s))]));
    // Recién abierta: 6.000 + 12.000 + 1.000 + 1.000 + MCP (2 × 11.000 × 15 / 100 = 3.300) + 1.000 + 0 = 24.300
    expect(total['al-abrir']).toBe(24_300);
    // Tras una hora: 6.000 + 12.000 + 1.000 + 1.000 + 3.300 + 120.000 + 80.000 = 223.300
    expect(total['tras-una-hora']).toBe(223_300);
    // Muchos MCP: 6.000 + 12.000 + 1.000 + 1.000 + 88.000 (8 × 11.000) + 20.000 + 10.000 = 138.000
    expect(total['muchos-servidores-mcp']).toBe(138_000);
    // Varias horas: 6.000 + 12.000 + 1.000 + 1.000 + 3.300 + 600.000 + 200.000 = 823.300
    expect(total['varias-horas-sin-limpiar']).toBe(823_300);
  });

  it('las cifras que cita cada nota son las del escenario', () => {
    const get = (id: string) => scenarios.find((s) => s.id === id)!;
    // «Tras una hora»: 60 turnos × 2.000 = 120.000 y 8 ficheros × 10.000 = 80.000.
    expect(get('tras-una-hora').sizes.conversation).toBe(60 * 2_000);
    expect(get('tras-una-hora').sizes.files).toBe(8 * 10_000);
    // «Muchos MCP»: 10 turnos × 2.000 = 20.000; 11.000 × 5 = 55.000 (la cifra de Anthropic).
    expect(get('muchos-servidores-mcp').sizes.conversation).toBe(10 * 2_000);
    expect(get('muchos-servidores-mcp').mcp.perServerTokens * 5).toBe(55_000);
    // «Varias horas»: 300 × 2.000 = 600.000; 20 × 10.000 = 200.000.
    expect(get('varias-horas-sin-limpiar').sizes.conversation).toBe(300 * 2_000);
    expect(get('varias-horas-sin-limpiar').sizes.files).toBe(20 * 10_000);
    // Skills: 10 × 100 tokens.
    for (const s of scenarios) expect(s.sizes.skills).toBe(10 * 100);
  });

  it('«muchos servidores MCP» ocupa el 44 % de 200.000 solo con MCP, y la nota lo dice', () => {
    const sc = scenarios.find((s) => s.id === 'muchos-servidores-mcp')!;
    // 8 × 11.000 = 88.000; 88.000 / 200.000 = 44 %
    expect(mcpTokens(sc.mcp) / 200_000).toBe(0.44);
    expect(sc.nota).toContain('44 %');
  });

  it('«tras una hora» no cabe en 200.000 y ocupa el 22,3 % de 1.000.000', () => {
    const st = stateFromScenario(scenarios.find((s) => s.id === 'tras-una-hora')!);
    expect(layoutOf(st, 200_000).overflow).toBe(true);
    // 223.300 × 1000 / 1.000.000 = 223,3 → 22,3 %
    expect(layoutOf(st, 1_000_000).usedPercent).toBe(22.3);
  });

  it('«varias horas» pasa del umbral de 80 % en 1.000.000 (82,3 %)', () => {
    const st = stateFromScenario(scenarios.find((s) => s.id === 'varias-horas-sin-limpiar')!);
    const l = layoutOf(st, 1_000_000);
    expect(l.usedPercent).toBe(82.3);
    expect(assess(l, DEFAULT_PARAMS.thresholdPercent).level).toBe('aviso');
  });

  it('«recién abierta» no avisa en ninguna de las dos ventanas', () => {
    const st = stateFromScenario(scenarios[0]!);
    // 24.300 de 200.000 = 12,15 % → 12,2 % (24.300 × 1000 / 200.000 = 121,5 → 122)
    expect(layoutOf(st, 200_000).usedPercent).toBe(12.2);
    expect(assess(layoutOf(st, 200_000), 80).level).toBe('ok');
    expect(assess(layoutOf(st, 1_000_000), 80).level).toBe('ok');
  });
});

describe('coherencia con los datos del sitio', () => {
  const models = load<ModelRecord[]>('models');
  const commands = load<CommandRecord[]>('claude-code-commands');

  it('las ventanas de las dos referencias por defecto son 1.000.000 y 200.000', () => {
    expect(models.find((m) => m.id === 'sonnet-5-5')?.contextWindow).toBe(1_000_000);
    expect(models.find((m) => m.id === 'haiku-4-5')?.contextWindow).toBe(200_000);
  });

  it('/clear, /compact, /context y /mcp existen y están activos en los datos de comandos', () => {
    for (const c of ['/clear', '/compact', '/context', '/mcp', '/subtask']) {
      expect(commands.find((x) => x.command === c)?.status).toBe('activo');
    }
  });

  it('el efecto de /clear descrito concuerda con el resumen oficial de los datos', () => {
    // Los datos dicen: «contexto vacío; conserva la memoria del proyecto».
    const clear = commands.find((x) => x.command === '/clear')!;
    expect(clear.summary).toMatch(/contexto vac/);
    expect(clear.summary).toMatch(/conserva la memoria/);
  });

  it('el efecto de /compact descrito concuerda con el resumen oficial de los datos', () => {
    const compact = commands.find((x) => x.command === '/compact')!;
    expect(compact.summary).toMatch(/resumiendo la conversación/);
  });

  it('las páginas enlazadas por cada acción existen', () => {
    for (const a of ACTION_INFO) {
      const file = `src/content/docs/${a.page.replace(/\/$/, '')}.mdx`;
      expect(() => readFileSync(file, 'utf8')).not.toThrow();
    }
  });

  it('ninguna explicación afirma un umbral automático de compactación', () => {
    const text = JSON.stringify(ACTION_INFO) + JSON.stringify(raw());
    expect(text).not.toMatch(/compact\w+ autom[aá]tic/i);
  });
});

function raw(): unknown {
  return load<unknown[]>('context-scenarios');
}
