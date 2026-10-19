import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIMULATOR_STATE,
  MAX_REQUESTS,
  SCENARIOS,
  SIMULATOR_ASSUMPTIONS,
  compareOptions,
  formatCost,
  formatDuration,
  outcomeLabel,
  parseGapMinutes,
  parseTokenCount,
  simulate,
  type SimulationInput,
  type SimulationResult,
} from '../src/lib/cache-simulator';
import { buildCatalog, cacheTtlOptions, unitPricesFor, type CatalogModel } from '../src/lib/pricing';
import type { ModelPricingDetailRecord, ModelRecord, SourceRecord } from '../src/lib/schemas';

const load = <T>(name: string): T => JSON.parse(readFileSync(`src/data/${name}.json`, 'utf8')) as T;
const catalog = buildCatalog(
  load<ModelRecord[]>('models'),
  load<ModelPricingDetailRecord[]>('model-pricing-details'),
  load<SourceRecord[]>('sources'),
);
const get = (id: string): CatalogModel => {
  const m = catalog.models.find((x) => x.id === id);
  if (!m) throw new Error(`modelo ${id}`);
  return m;
};

const MIN = 60;
/** Separaciones en segundos: la primera petición no tiene anterior. */
const gaps = (n: number, minutes: number): number[] =>
  Array.from({ length: n }, (_, i) => (i === 0 ? 0 : minutes * MIN));

function run(input: SimulationInput): SimulationResult {
  const out = simulate(input);
  if (!out.ok) throw new Error(out.errors.map((e) => e.message).join(' | '));
  return out.result;
}

/*
 * Sonnet 5.5 (USD por millón de tokens): entrada 2, salida 10, lectura 0,1, escritura 5 min 2,5, escritura 1 h 4.
 * Con prefijo 18.000, variable 2.000 y salida 500 tokens, por petición:
 *   escritura 5 min = 18.000 × 2,5 / 1e6 = 0,045      lectura = 18.000 × 0,1 / 1e6 = 0,0018
 *   escritura 1 h   = 18.000 × 4 / 1e6   = 0,072      variable = 2.000 × 2 / 1e6 = 0,004
 *   salida = 500 × 10 / 1e6 = 0,005                   sin caché = 20.000 × 2 / 1e6 + 0,005 = 0,045
 *   Petición que escribe 5 min = 0,045 + 0,004 + 0,005 = 0,054
 *   Petición que escribe 1 h   = 0,072 + 0,004 + 0,005 = 0,081
 *   Petición que acierta       = 0,0018 + 0,004 + 0,005 = 0,0108
 */
const sonnet = get('sonnet-5-5');
const base = {
  model: sonnet,
  prefixTokens: 18_000,
  variableTokens: 2_000,
  outputTokens: 500,
};

describe('conversación de 3 peticiones con 2 min de separación', () => {
  const input = { ...base, gapsSeconds: gaps(3, 2) };

  it('con TTL de 5 min: 1 escritura y 2 lecturas', () => {
    const r = run({ ...input, ttlMinutes: 5 });
    expect(r.requests.map((q) => q.outcome)).toEqual(['write-first', 'hit', 'hit']);
    expect(r.counts).toEqual({ hits: 2, writes: 1, uncached: 0 });
    // 0,054 + 2 × 0,0108 = 0,0756
    expect(r.totals.total).toBeCloseTo(0.0756, 10);
    // Desglose: escritura 0,045; lectura 2 × 0,0018 = 0,0036; variable 3 × 0,004 = 0,012; salida 3 × 0,005 = 0,015
    expect(r.totals.cacheWrite).toBeCloseTo(0.045, 10);
    expect(r.totals.cacheRead).toBeCloseTo(0.0036, 10);
    expect(r.totals.input).toBeCloseTo(0.012, 10);
    expect(r.totals.output).toBeCloseTo(0.015, 10);
    // Tokens: 18.000 escritos, 36.000 leídos, 6.000 de entrada normal, 1.500 de salida
    expect(r.tokens).toEqual({ cacheWrite: 18_000, cacheRead: 36_000, input: 6_000, output: 1_500 });
  });

  it('con TTL de 1 h: 1 escritura cara y 2 lecturas', () => {
    const r = run({ ...input, ttlMinutes: 60 });
    expect(r.counts).toEqual({ hits: 2, writes: 1, uncached: 0 });
    // 0,081 + 2 × 0,0108 = 0,1026
    expect(r.totals.total).toBeCloseTo(0.1026, 10);
  });

  it('sin caché: 3 × 0,045 = 0,135 y todas las peticiones pagan la entrada completa', () => {
    const r = run({ ...input, ttlMinutes: null });
    expect(r.requests.every((q) => q.outcome === 'no-cache')).toBe(true);
    expect(r.counts).toEqual({ hits: 0, writes: 0, uncached: 3 });
    expect(r.totals.total).toBeCloseTo(0.135, 10);
    expect(r.tokens.input).toBe(60_000);
  });

  it('los instantes acumulan las separaciones', () => {
    const r = run({ ...input, ttlMinutes: 5 });
    // 0, 120, 240 segundos
    expect(r.requests.map((q) => q.atSeconds)).toEqual([0, 120, 240]);
  });
});

describe('separación de 6 min: más que el TTL de 5 min, menos que 1 h', () => {
  const input = { ...base, gapsSeconds: gaps(3, 6) };

  it('con 5 min fallan las tres (la 1.ª escribe, las otras dos con TTL caducado)', () => {
    const r = run({ ...input, ttlMinutes: 5 });
    expect(r.requests.map((q) => q.outcome)).toEqual(['write-first', 'write-expired', 'write-expired']);
    // 3 × 0,054 = 0,162: más caro que sin caché (0,135) porque escribir cuesta 1,25× y no se lee nunca
    expect(r.totals.total).toBeCloseTo(0.162, 10);
  });

  it('con 1 h acierta en la 2.ª y la 3.ª', () => {
    const r = run({ ...input, ttlMinutes: 60 });
    expect(r.requests.map((q) => q.outcome)).toEqual(['write-first', 'hit', 'hit']);
    // 0,081 + 2 × 0,0108 = 0,1026
    expect(r.totals.total).toBeCloseTo(0.1026, 10);
  });

  it('la comparación señala 1 h como la más barata', () => {
    const out = compareOptions({ ...input });
    if (!out.ok) throw new Error('comparación');
    const totals = Object.fromEntries(out.comparison.options.map((o) => [o.key, o.result.totals.total]));
    expect(totals['none']).toBeCloseTo(0.135, 10);
    expect(totals['ttl-5']).toBeCloseTo(0.162, 10);
    expect(totals['ttl-60']).toBeCloseTo(0.1026, 10);
    expect(out.comparison.cheapestKeys).toEqual(['ttl-60']);
    expect(out.comparison.allEqual).toBe(false);
  });
});

describe('renovación del TTL con cada acierto', () => {
  it('una cadena de huecos de 4 min dura más de 5 min en total y sigue acertando', () => {
    // 4 peticiones, 4 min entre cada una: la 4.ª llega a los 12 min de la 1.ª, pero cada hueco (240 s) < 300 s.
    const r = run({ ...base, gapsSeconds: gaps(4, 4), ttlMinutes: 5 });
    expect(r.requests.map((q) => q.outcome)).toEqual(['write-first', 'hit', 'hit', 'hit']);
    expect(r.requests[3]?.atSeconds).toBe(720);
    // 0,054 + 3 × 0,0108 = 0,0864
    expect(r.totals.total).toBeCloseTo(0.0864, 10);
  });

  it('un hueco de 6 min tras la cadena rompe la caché y la siguiente vuelve a acertar', () => {
    const r = run({ ...base, gapsSeconds: [0, 240, 360, 240], ttlMinutes: 5 });
    expect(r.requests.map((q) => q.outcome)).toEqual(['write-first', 'hit', 'write-expired', 'hit']);
    // Escrituras: 2 × 0,054 = 0,108; aciertos: 2 × 0,0108 = 0,0216; total 0,1296
    expect(r.totals.total).toBeCloseTo(0.1296, 10);
  });

  it('el límite: separación igual al TTL acierta (300 s) y 301 s caduca', () => {
    const exact = run({ ...base, gapsSeconds: [0, 300], ttlMinutes: 5 });
    expect(exact.requests[1]?.outcome).toBe('hit');
    const over = run({ ...base, gapsSeconds: [0, 301], ttlMinutes: 5 });
    expect(over.requests[1]?.outcome).toBe('write-expired');
  });
});

describe('peticiones simultáneas (supuesto de disponibilidad)', () => {
  it('con separación 0 la segunda no encuentra la entrada y paga otra escritura', () => {
    const r = run({ ...base, gapsSeconds: [0, 0, 60], ttlMinutes: 5 });
    // 2.ª: 0 < 5 s -> escribe; 3.ª: 60 s tras la 2.ª -> acierto. 2 × 0,054 + 0,0108 = 0,1188
    expect(r.requests.map((q) => q.outcome)).toEqual(['write-first', 'write-not-ready', 'hit']);
    expect(r.totals.total).toBeCloseTo(0.1188, 10);
  });

  it('con 0 s de disponibilidad la segunda acierta', () => {
    const r = run({ ...base, gapsSeconds: [0, 0], ttlMinutes: 5, readySeconds: 0 });
    expect(r.requests[1]?.outcome).toBe('hit');
  });

  it('exactamente el tiempo de disponibilidad (5 s) ya acierta', () => {
    const r = run({ ...base, gapsSeconds: [0, 5], ttlMinutes: 5 });
    expect(r.requests[1]?.outcome).toBe('hit');
  });
});

describe('prefijo por debajo del mínimo cacheable', () => {
  // Sonnet 5.5: mínimo 512 tokens. Sin caché cada petición de prefijo 500 + variable 100 y salida 0:
  // 600 × 2 / 1e6 = 0,0012.
  it('511 tokens no se cachea: cuesta como sin caché', () => {
    const r = run({
      ...base,
      prefixTokens: 511,
      variableTokens: 89,
      outputTokens: 0,
      gapsSeconds: gaps(3, 1),
      ttlMinutes: 5,
    });
    expect(r.cacheActive).toBe(false);
    expect(r.inactiveReason).toMatch(/mínimo/);
    expect(r.requests.every((q) => q.outcome === 'below-min')).toBe(true);
    // 600 × 2 / 1e6 = 0,0012 por petición; × 3 = 0,0036
    expect(r.totals.total).toBeCloseTo(0.0036, 12);
    expect(r.totals.cacheWrite).toBe(0);
  });

  it('512 tokens (el umbral exacto) sí se cachea', () => {
    const r = run({
      ...base,
      prefixTokens: 512,
      variableTokens: 88,
      outputTokens: 0,
      gapsSeconds: gaps(2, 1),
      ttlMinutes: 5,
    });
    expect(r.cacheActive).toBe(true);
    // 1.ª: 512 × 2,5 / 1e6 = 0,00128 + 88 × 2 / 1e6 = 0,000176 -> 0,001456
    // 2.ª: 512 × 0,1 / 1e6 = 0,0000512 + 0,000176 -> 0,0002272. Total 0,0016832
    expect(r.totals.total).toBeCloseTo(0.0016832, 12);
  });

  it('el mínimo depende del modelo: Opus 4.6 exige 4.096', () => {
    const opus = get('opus-4-6');
    const r = run({ ...base, model: opus, prefixTokens: 4_095, gapsSeconds: gaps(2, 1), ttlMinutes: 5 });
    expect(r.cacheActive).toBe(false);
    const ok = run({ ...base, model: opus, prefixTokens: 4_096, gapsSeconds: gaps(2, 1), ttlMinutes: 5 });
    expect(ok.cacheActive).toBe(true);
  });

  it('la comparación con prefijo bajo el mínimo empata todas las opciones', () => {
    const out = compareOptions({ ...base, prefixTokens: 100, gapsSeconds: gaps(3, 2) });
    if (!out.ok) throw new Error('comparación');
    expect(out.comparison.allEqual).toBe(true);
    expect(out.comparison.breakEven).toBeNull();
  });
});

describe('tramo largo de Haiku 5.5 (umbral 100.000 tokens de entrada)', () => {
  /*
   * Haiku 5.5 estándar: entrada 0,1; salida 0,5; lectura 0,01; escritura 5 min 0,125; 1 h 0,2.
   * Tramo largo (> 100.000): entrada 0,5; salida 2,5; lectura 0,05; escritura 5 min 0,625; 1 h 1.
   */
  const haiku = get('haiku-5-5');

  it('cruza el umbral con 95.000 + 6.000 = 101.000: todo se cobra con el tramo largo, incluso el acierto', () => {
    const r = run({
      model: haiku,
      prefixTokens: 95_000,
      variableTokens: 6_000,
      outputTokens: 1_000,
      gapsSeconds: gaps(2, 1),
      ttlMinutes: 5,
    });
    expect(r.requests.every((q) => q.longTier)).toBe(true);
    // 1.ª: escritura 95.000 × 0,625 / 1e6 = 0,059375; variable 6.000 × 0,5 / 1e6 = 0,003; salida 1.000 × 2,5 / 1e6 = 0,0025 -> 0,064875
    expect(r.requests[0]?.cost.total).toBeCloseTo(0.064875, 10);
    // 2.ª (acierto): lectura 95.000 × 0,05 / 1e6 = 0,00475; 0,003; 0,0025 -> 0,01025
    expect(r.requests[1]?.outcome).toBe('hit');
    expect(r.requests[1]?.cost.total).toBeCloseTo(0.01025, 10);
    expect(r.warnings.some((w) => /tramo largo/.test(w))).toBe(true);
  });

  it('exactamente 100.000 de entrada total sigue en el tramo estándar', () => {
    const r = run({
      model: haiku,
      prefixTokens: 94_000,
      variableTokens: 6_000,
      outputTokens: 1_000,
      gapsSeconds: gaps(2, 1),
      ttlMinutes: 5,
    });
    expect(r.requests.some((q) => q.longTier)).toBe(false);
    // 1.ª: 94.000 × 0,125 / 1e6 = 0,01175; 6.000 × 0,1 / 1e6 = 0,0006; 1.000 × 0,5 / 1e6 = 0,0005 -> 0,01285
    expect(r.requests[0]?.cost.total).toBeCloseTo(0.01285, 10);
    // 2.ª: 94.000 × 0,01 / 1e6 = 0,00094 + 0,0006 + 0,0005 = 0,00204
    expect(r.requests[1]?.cost.total).toBeCloseTo(0.00204, 10);
  });

  it('con TTL de 1 h usa la escritura de 1 h del tramo largo (1 $ por millón)', () => {
    const r = run({
      model: haiku,
      prefixTokens: 95_000,
      variableTokens: 6_000,
      outputTokens: 0,
      gapsSeconds: [0],
      ttlMinutes: 60,
    });
    // 95.000 × 1 / 1e6 = 0,095 + 6.000 × 0,5 / 1e6 = 0,003 -> 0,098
    expect(r.totals.total).toBeCloseTo(0.098, 10);
  });
});

describe('sin caché frente a caché', () => {
  it('ejemplo de la página: 1 M de prefijo en Sonnet 5.5 con dos peticiones', () => {
    // La página «Prompt caching a fondo»: sin caché 2 × 2 = 4 $; 5 min: 2,5 + 0,1 = 2,6 $; 1 h: 4 + 0,1 = 4,1 $.
    const input = {
      ...base,
      prefixTokens: 1_000_000,
      variableTokens: 0,
      outputTokens: 0,
      gapsSeconds: gaps(2, 2),
    };
    expect(run({ ...input, ttlMinutes: null }).totals.total).toBeCloseTo(4, 10);
    expect(run({ ...input, ttlMinutes: 5 }).totals.total).toBeCloseTo(2.6, 10);
    expect(run({ ...input, ttlMinutes: 60 }).totals.total).toBeCloseTo(4.1, 10);
  });

  it('un informe al día: la caché solo añade coste (escrituras sin lecturas) y gana «sin caché»', () => {
    const out = compareOptions({ ...base, gapsSeconds: gaps(7, 1440) });
    if (!out.ok) throw new Error('comparación');
    const t = Object.fromEntries(out.comparison.options.map((o) => [o.key, o.result.totals.total]));
    // sin caché 7 × 0,045 = 0,315; 5 min 7 × 0,054 = 0,378; 1 h 7 × 0,081 = 0,567
    expect(t['none']).toBeCloseTo(0.315, 10);
    expect(t['ttl-5']).toBeCloseTo(0.378, 10);
    expect(t['ttl-60']).toBeCloseTo(0.567, 10);
    expect(out.comparison.cheapestKeys).toEqual(['none']);
  });

  it('conversación fluida: gana 5 min (0,0756 frente a 0,1026 de 1 h y 0,135 sin caché con 3 peticiones)', () => {
    const out = compareOptions({ ...base, gapsSeconds: gaps(3, 2) });
    if (!out.ok) throw new Error('comparación');
    expect(out.comparison.cheapestKeys).toEqual(['ttl-5']);
  });

  it('un empate se señala con varias opciones más baratas', () => {
    // Con una sola petición y prefijo bajo el mínimo, las tres cuestan igual.
    const out = compareOptions({ ...base, prefixTokens: 10, gapsSeconds: [0] });
    if (!out.ok) throw new Error('comparación');
    expect(out.comparison.cheapestKeys).toHaveLength(3);
  });
});

describe('punto de equilibrio entre 5 min y 1 h', () => {
  it('4 peticiones cada 10 min: la hora evita 3 fallos y compensa', () => {
    const out = compareOptions({ ...base, gapsSeconds: gaps(4, 10) });
    if (!out.ok) throw new Error('comparación');
    const be = out.comparison.breakEven;
    if (!be) throw new Error('sin equilibrio');
    // 5 min: 4 escrituras = 4 × 0,054 = 0,216. 1 h: 0,081 + 3 × 0,0108 = 0,1134. Diferencia 0,1026.
    // Fallos evitados: 3, cada uno ahorra 0,054 − 0,0108 = 0,0432 -> 0,1296.
    // Prima de la 1.ª escritura de 1 h: 0,081 − 0,054 = 0,027.
    expect(be.avoidedMisses).toBe(3);
    expect(be.savedByAvoided).toBeCloseTo(0.1296, 10);
    expect(be.premiumPaid).toBeCloseTo(0.027, 10);
    expect(be.netSavingOfLong).toBeCloseTo(0.1026, 10);
    expect(be.savedByAvoided - be.premiumPaid).toBeCloseTo(be.netSavingOfLong, 10);
    // Equilibrio: 0,027 / 0,0432 = 0,625 fallos evitados
    expect(be.neededAvoided).toBeCloseTo(0.625, 10);
  });

  it('conversación fluida: la hora no evita ningún fallo, no hay equilibrio y la prima es todo sobrecoste', () => {
    const out = compareOptions({ ...base, gapsSeconds: gaps(10, 2) });
    if (!out.ok) throw new Error('comparación');
    const be = out.comparison.breakEven;
    if (!be) throw new Error('sin equilibrio');
    expect(be.avoidedMisses).toBe(0);
    expect(be.neededAvoided).toBeNull();
    // Una sola escritura en ambas: prima 0,081 − 0,054 = 0,027; neto negativo
    expect(be.premiumPaid).toBeCloseTo(0.027, 10);
    expect(be.netSavingOfLong).toBeCloseTo(-0.027, 10);
  });

  it('mezcla: la identidad ahorro − prima = diferencia total se cumple', () => {
    // Huecos 2, 20, 2, 90, 10 min: la 3.ª y la 6.ª aciertan en ambos o solo en 1 h según el hueco.
    const out = compareOptions({ ...base, gapsSeconds: [0, 120, 1200, 120, 5400, 600] });
    if (!out.ok) throw new Error('comparación');
    const be = out.comparison.breakEven;
    if (!be) throw new Error('sin equilibrio');
    // 5 min: write, hit (2), write (20), hit (2), write (90), write (10) -> 4 escrituras
    // 1 h:   write, hit, hit,            hit,     write (90 > 60), hit(10)
    // Evitados: huecos de 20 y 10 min -> 2; ambos escriben: la 1.ª y la de 90 min -> 2 primas de 0,027
    expect(be.avoidedMisses).toBe(2);
    expect(be.premiumPaid).toBeCloseTo(0.054, 10);
    expect(be.savedByAvoided).toBeCloseTo(0.0864, 10);
    expect(be.netSavingOfLong).toBeCloseTo(0.0324, 10);
  });

  it('no hay equilibrio en OpenAI: solo ofrece un TTL de 30 min', () => {
    const out = compareOptions({ ...base, model: get('gpt-5-6-terra'), gapsSeconds: gaps(3, 2) });
    if (!out.ok) throw new Error('comparación');
    expect(out.comparison.breakEven).toBeNull();
    expect(out.comparison.options.map((o) => o.key)).toEqual(['none', 'ttl-30']);
  });
});

describe('OpenAI: un solo TTL de 30 min', () => {
  /*
   * GPT-5.6 Terra: entrada 2; salida 12; lectura 0,2; escritura 2,5; mínimo 1.024 tokens.
   * Prefijo 10.000, variable 1.000, salida 100:
   *   escribe = 10.000 × 2,5 / 1e6 = 0,025 + 1.000 × 2 / 1e6 = 0,002 + 100 × 12 / 1e6 = 0,0012 -> 0,0282
   *   acierta = 10.000 × 0,2 / 1e6 = 0,002 + 0,002 + 0,0012 -> 0,0052
   */
  const terra = get('gpt-5-6-terra');
  const o = { model: terra, prefixTokens: 10_000, variableTokens: 1_000, outputTokens: 100 };

  it('renueva con cada lectura: huecos de 25 min aciertan y uno de 31 min caduca', () => {
    const r = run({ ...o, gapsSeconds: [0, 25 * MIN, 25 * MIN, 31 * MIN], ttlMinutes: 30 });
    expect(r.requests.map((q) => q.outcome)).toEqual(['write-first', 'hit', 'hit', 'write-expired']);
    // 2 × 0,0282 + 2 × 0,0052 = 0,0668
    expect(r.totals.total).toBeCloseTo(0.0668, 10);
  });

  it('rechaza un TTL que el modelo no ofrece', () => {
    const out = simulate({ ...o, gapsSeconds: [0], ttlMinutes: 60 });
    expect(out.ok).toBe(false);
  });
});

describe('Google: caché implícita', () => {
  /*
   * Gemini 4 Argon (precio actual): entrada 2; salida 10; caché 0,1; mínimo 4.096.
   * Prefijo 10.000, variable 1.000, salida 100, 3 peticiones:
   *   sin descuento: 11.000 × 2 / 1e6 = 0,022 + 100 × 10 / 1e6 = 0,001 -> 0,023 cada una; × 3 = 0,069
   *   acierto supuesto: 1.ª = 0,023; 2.ª y 3.ª: 10.000 × 0,1 / 1e6 = 0,001 + 0,002 + 0,001 = 0,004
   */
  const argon = get('gemini-4-argon');
  const o = {
    model: argon,
    prefixTokens: 10_000,
    variableTokens: 1_000,
    outputTokens: 100,
    gapsSeconds: gaps(3, 2),
  };

  it('por defecto no asume acierto: sin descuento ni escritura', () => {
    const r = run({ ...o, ttlMinutes: null });
    expect(r.requests.every((q) => q.outcome === 'implicit-miss')).toBe(true);
    expect(r.totals.total).toBeCloseTo(0.069, 10);
    expect(r.totals.cacheWrite).toBe(0);
  });

  it('con acierto supuesto lee desde la 2.ª petición y no factura escritura', () => {
    const r = run({ ...o, ttlMinutes: null, assumeImplicitHit: true });
    expect(r.requests.map((q) => q.outcome)).toEqual(['implicit-first', 'implicit-hit', 'implicit-hit']);
    // 0,023 + 2 × 0,004 = 0,031
    expect(r.totals.total).toBeCloseTo(0.031, 10);
    expect(r.totals.cacheWrite).toBe(0);
  });

  it('por debajo de 4.096 tokens no hay descuento ni siquiera suponiéndolo', () => {
    const r = run({ ...o, prefixTokens: 4_095, ttlMinutes: null, assumeImplicitHit: true });
    expect(r.cacheActive).toBe(false);
    expect(r.requests.every((q) => q.outcome === 'implicit-miss')).toBe(true);
  });

  it('no admite TTL', () => {
    expect(simulate({ ...o, ttlMinutes: 5 }).ok).toBe(false);
  });

  it('la comparación ofrece solo «sin descuento» y «acierto supuesto»', () => {
    const out = compareOptions(o);
    if (!out.ok) throw new Error('comparación');
    expect(out.comparison.options.map((x) => x.key)).toEqual(['none', 'assume-hit']);
    expect(out.comparison.cheapestKeys).toEqual(['assume-hit']);
  });
});

describe('entradas inválidas', () => {
  const ok = { ...base, gapsSeconds: gaps(2, 1), ttlMinutes: 5 };
  const errorsOf = (patch: Partial<SimulationInput>) => {
    const out = simulate({ ...ok, ...patch });
    return out.ok ? [] : out.errors;
  };

  it('tokens negativos, decimales o NaN', () => {
    expect(errorsOf({ prefixTokens: -1 })[0]?.field).toBe('prefixTokens');
    expect(errorsOf({ variableTokens: 1.5 })[0]?.field).toBe('variableTokens');
    expect(errorsOf({ outputTokens: Number.NaN })[0]?.field).toBe('outputTokens');
  });

  it('entrada total de 0 tokens', () => {
    expect(errorsOf({ prefixTokens: 0, variableTokens: 0 }).length).toBeGreaterThan(0);
  });

  it('lista de peticiones vacía o con demasiadas', () => {
    expect(errorsOf({ gapsSeconds: [] })[0]?.field).toBe('gaps');
    expect(errorsOf({ gapsSeconds: gaps(MAX_REQUESTS + 1, 1) })[0]?.field).toBe('gaps');
    expect(simulate({ ...ok, gapsSeconds: gaps(MAX_REQUESTS, 1) }).ok).toBe(true);
  });

  it('separación negativa o no numérica indica la petición afectada; la primera se ignora', () => {
    expect(errorsOf({ gapsSeconds: [0, -5] })[0]).toMatchObject({ field: 'gaps', index: 1 });
    expect(errorsOf({ gapsSeconds: [0, 60, Number.NaN] })[0]).toMatchObject({ index: 2 });
    expect(simulate({ ...ok, gapsSeconds: [Number.NaN] }).ok).toBe(true);
  });

  it('prefijo 0 con variable positiva es válido y no cachea', () => {
    const r = run({ ...ok, prefixTokens: 0 });
    expect(r.cacheActive).toBe(false);
  });

  it('avisa si la entrada supera la ventana de contexto (Haiku 4.5: 200.000)', () => {
    const r = run({ ...ok, model: get('haiku-4-5'), prefixTokens: 250_000 });
    expect(r.warnings.some((w) => /ventana de contexto/.test(w))).toBe(true);
  });

  it('la comparación propaga los errores de entrada', () => {
    const out = compareOptions({ ...base, prefixTokens: -3, gapsSeconds: gaps(2, 1) });
    expect(out.ok).toBe(false);
  });
});

describe('lectura de campos y formato', () => {
  it('parseTokenCount', () => {
    expect(parseTokenCount('18000', 'los tokens')).toEqual({ ok: true, value: 18_000 });
    expect(parseTokenCount('', 'los tokens').ok).toBe(false);
    expect(parseTokenCount('1.5', 'los tokens').ok).toBe(false);
    expect(parseTokenCount('-1', 'los tokens').ok).toBe(false);
    expect(parseTokenCount('99999999999', 'los tokens').ok).toBe(false);
  });

  it('parseGapMinutes devuelve segundos', () => {
    // 0,25 min × 60 = 15 s; 2 min = 120 s; 1440 min = 86.400 s
    expect(parseGapMinutes('0.25')).toEqual({ ok: true, value: 15 });
    expect(parseGapMinutes('2')).toEqual({ ok: true, value: 120 });
    expect(parseGapMinutes('1440')).toEqual({ ok: true, value: 86_400 });
    expect(parseGapMinutes('0')).toEqual({ ok: true, value: 0 });
    expect(parseGapMinutes('').ok).toBe(false);
    expect(parseGapMinutes('-1').ok).toBe(false);
    expect(parseGapMinutes('abc').ok).toBe(false);
  });

  it('formatDuration', () => {
    expect(formatDuration(15)).toBe('15 s');
    expect(formatDuration(120)).toBe('2 min');
    expect(formatDuration(150)).toBe('2 min 30 s');
    expect(formatDuration(5400)).toBe('1 h 30 min');
    expect(formatDuration(86_400)).toBe('24 h');
  });

  it('formatCost usa los decimales que hacen falta', () => {
    expect(formatCost(0.0018)).toBe('0,0018 $');
    expect(formatCost(0.0756)).toBe('0,0756 $');
    expect(formatCost(2.6)).toBe('2,60 $');
    expect(formatCost(0)).toBe('0,00 $');
  });

  it('cada resultado tiene el texto pedido', () => {
    expect(outcomeLabel('hit')).toBe('acierto');
    expect(outcomeLabel('write-first')).toBe('fallo: escribe en caché');
    expect(outcomeLabel('write-expired')).toBe('fallo: TTL caducado');
  });
});

describe('escenarios predefinidos', () => {
  it('tienen el número de peticiones y la separación anunciados', () => {
    const by = (id: string) => SCENARIOS.find((s) => s.id === id)!;
    expect(by('fluida').gapsMinutes).toHaveLength(10);
    expect(by('fluida').gapsMinutes[1]).toBe(2);
    expect(by('espaciadas').gapsMinutes[1]).toBe(10);
    expect(by('burst').gapsMinutes).toHaveLength(20);
    expect(by('diario').gapsMinutes[1]).toBe(1440);
    for (const s of SCENARIOS) expect(s.gapsMinutes[0]).toBe(0);
  });

  it('el ejemplo inicial se puede simular con el modelo por defecto', () => {
    const s = DEFAULT_SIMULATOR_STATE;
    const scenario = SCENARIOS.find((x) => x.id === s.scenarioId)!;
    const r = run({
      model: get(s.modelId),
      prefixTokens: s.prefixTokens,
      variableTokens: s.variableTokens,
      outputTokens: s.outputTokens,
      gapsSeconds: scenario.gapsMinutes.map((m) => Math.round(m * 60)),
      ttlMinutes: s.ttlMinutes,
    });
    // 10 peticiones cada 2 min: 1 escritura (0,054) + 9 aciertos (9 × 0,0108 = 0,0972) = 0,1512
    expect(r.counts).toEqual({ hits: 9, writes: 1, uncached: 0 });
    expect(r.totals.total).toBeCloseTo(0.1512, 10);
  });

  it('en la ráfaga de 15 s todas aciertan menos la primera (15 s > 5 s de disponibilidad)', () => {
    const scenario = SCENARIOS.find((x) => x.id === 'burst')!;
    const r = run({
      ...base,
      gapsSeconds: scenario.gapsMinutes.map((m) => Math.round(m * 60)),
      ttlMinutes: 5,
    });
    expect(r.counts).toEqual({ hits: 19, writes: 1, uncached: 0 });
  });

  it('hay supuestos documentados y alguno marcado como no verificado', () => {
    expect(SIMULATOR_ASSUMPTIONS.some((a) => !a.verified)).toBe(true);
    expect(new Set(SIMULATOR_ASSUMPTIONS.map((a) => a.id)).size).toBe(SIMULATOR_ASSUMPTIONS.length);
  });
});

describe('coherencia con el catálogo real', () => {
  it('cada precio que usa el simulador existe, en el tramo estándar y en el largo', () => {
    for (const m of catalog.models) {
      expect(m.cache.minTokens, m.id).toBeGreaterThan(0);
      const tiers = [m.prices, ...(m.longContext ? [m.longContext.prices] : [])];
      for (const p of tiers) {
        expect(p.input, m.id).toBeGreaterThan(0);
        expect(p.output, m.id).toBeGreaterThan(0);
        expect(p.cacheRead, m.id).not.toBeNull();
        if (m.cache.mode === 'explicit') {
          const opts = cacheTtlOptions(m);
          expect(opts.length, m.id).toBeGreaterThan(0);
          for (const o of opts) expect(o.writePrice(p), `${m.id} ${o.label}`).not.toBeNull();
        }
      }
    }
  });

  it('todos los modelos se simulan sin error con todas sus opciones y la caché ahorra al reutilizar', () => {
    for (const m of catalog.models) {
      const out = compareOptions({
        model: m,
        prefixTokens: 20_000,
        variableTokens: 1_000,
        outputTokens: 200,
        gapsSeconds: gaps(5, 1),
      });
      expect(out.ok, m.id).toBe(true);
      if (!out.ok) continue;
      expect(out.comparison.skipped, m.id).toEqual([]);
      const none = out.comparison.options.find((o) => o.key === 'none')!.result.totals.total;
      const cheapest = Math.min(...out.comparison.options.map((o) => o.result.totals.total));
      expect(cheapest, m.id).toBeLessThanOrEqual(none);
    }
  });

  it('las escrituras y lecturas usadas coinciden con unitPricesFor para cada tramo', () => {
    const haiku = get('haiku-5-5');
    const r = run({
      model: haiku,
      prefixTokens: 101_000,
      variableTokens: 0,
      outputTokens: 0,
      gapsSeconds: gaps(2, 1),
      ttlMinutes: 5,
    });
    const p = unitPricesFor(haiku, 101_000);
    // 101.000 × 0,625 / 1e6 = 0,063125 (escritura) y 101.000 × 0,05 / 1e6 = 0,00505 (lectura)
    expect(r.requests[0]?.cost.cacheWrite).toBeCloseTo((101_000 * (p.cacheWrite5m ?? 0)) / 1e6, 12);
    expect(r.requests[0]?.cost.cacheWrite).toBeCloseTo(0.063125, 12);
    expect(r.requests[1]?.cost.cacheRead).toBeCloseTo(0.00505, 12);
  });

  it('los TTL de Anthropic son 5 min y 1 h, y el de OpenAI, 30 min', () => {
    expect(cacheTtlOptions(get('sonnet-5-5')).map((o) => o.minutes)).toEqual([5, 60]);
    expect(cacheTtlOptions(get('gpt-5-6-terra')).map((o) => o.minutes)).toEqual([30]);
    expect(cacheTtlOptions(get('gemini-4-argon'))).toEqual([]);
  });
});
