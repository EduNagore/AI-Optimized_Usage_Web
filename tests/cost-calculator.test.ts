import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL_IDS,
  DEFAULT_RAW_INPUTS,
  calculateModelCost,
  compareModels,
  configurationWarnings,
  formatCost,
  leverEffects,
  parseCostInputs,
  parseNumberEs,
  type CostParams,
  type RawCostInputs,
} from '../src/lib/cost-calculator';
import { buildCatalog } from '../src/lib/pricing';
import type { ModelPricingDetailRecord, ModelRecord, SourceRecord } from '../src/lib/schemas';

const load = <T>(name: string): T => JSON.parse(readFileSync(`src/data/${name}.json`, 'utf8')) as T;
const catalog = buildCatalog(
  load<ModelRecord[]>('models'),
  load<ModelPricingDetailRecord[]>('model-pricing-details'),
  load<SourceRecord[]>('sources'),
);
const get = (id: string) => {
  const m = catalog.models.find((x) => x.id === id);
  if (!m) throw new Error(`modelo ${id} no está en el catálogo`);
  return m;
};

/** Parámetros base: 1 turno, sin caché ni razonamiento, 1 tarea al mes. Cada caso cambia lo que necesita. */
const base: CostParams = {
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  turns: 1,
  historyGrowthTokens: 0,
  reasoningInHistory: false,
  cacheMode: 'off',
  cacheScope: 'task',
  cacheablePrefixTokens: 0,
  cacheHitPercent: 100,
  ttl: 'short',
  useBatch: false,
  usePlannedPrice: false,
  tasksPerMonth: 1,
};
const p = (patch: Partial<CostParams>): CostParams => ({ ...base, ...patch });
const codes = (m: ReturnType<typeof calculateModelCost>) => m.warnings.map((w) => w.code);

describe('los precios que usan los casos a mano siguen siendo los del catálogo', () => {
  // Si cambia un precio en models.json, este test avisa de que hay que revisar los cálculos de abajo.
  it('Haiku 5.5, Sonnet 5.5, Opus 5.5', () => {
    expect(get('haiku-5-5').prices).toEqual({
      input: 0.1,
      output: 0.5,
      cacheRead: 0.01,
      cacheWrite5m: 0.125,
      cacheWrite1h: 0.2,
    });
    expect(get('haiku-5-5').longContext).toMatchObject({
      thresholdTokens: 100_000,
      prices: { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite5m: 0.625, cacheWrite1h: 1 },
    });
    expect(get('sonnet-5-5').prices).toEqual({
      input: 2,
      output: 10,
      cacheRead: 0.1,
      cacheWrite5m: 2.5,
      cacheWrite1h: 4,
    });
    expect(get('opus-5-5').prices).toEqual({
      input: 4,
      output: 20,
      cacheRead: 0.2,
      cacheWrite5m: 5,
      cacheWrite1h: 8,
    });
    for (const id of ['haiku-5-5', 'sonnet-5-5', 'opus-5-5']) expect(get(id).batchFactor).toBe(0.5);
    expect(get('sonnet-5-5').cache.minTokens).toBe(512);
    expect(get('sonnet-5-5').cache.ttlMinutes).toEqual([5, 60]);
  });
  it('GPT-6.1 Sol y Gemini 4 Argon', () => {
    expect(get('gpt-6-1-sol').prices).toMatchObject({
      input: 2,
      output: 10,
      cacheRead: 0.1,
      cacheWrite5m: 2.5,
    });
    expect(get('gpt-6-1-sol').longContext).toMatchObject({
      thresholdTokens: 272_000,
      prices: { input: 4, output: 15, cacheRead: 0.2, cacheWrite5m: 5 },
    });
    expect(get('gpt-6-1-sol').cache.ttlMinutes).toEqual([30]);
    expect(get('gemini-4-argon').prices).toMatchObject({ input: 2, output: 10, cacheRead: 0.1 });
    expect(get('gemini-4-argon').scheduledChange).toMatchObject({
      effectiveFrom: '2026-12-01',
      prices: { input: 4, output: 20, cacheRead: 0.2 },
    });
    expect(get('gemini-4-argon').cache).toMatchObject({ mode: 'implicit', minTokens: 4096 });
    expect(get('gemini-4-argon').batchFactor).toBeNull();
    expect(get('haiku-4-5')).toMatchObject({ contextWindow: 200_000, maxOutput: 64_000 });
  });
});

describe('caso de la página: resumir 2.000 contratos de 30.000 tokens de entrada y 1.500 de salida', () => {
  // Es el mismo ejemplo que <CostExample> en calculadora-de-coste.mdx: sin caché ni razonamiento.
  const params = p({ inputTokens: 30_000, outputTokens: 1_500, tasksPerMonth: 2_000 });

  it('Haiku 5.5', () => {
    // Por tarea: 30.000 × 0,10 + 1.500 × 0,50 = 3.000 + 750 = 3.750 → /1e6 = 0,00375 $
    // Al mes: 0,00375 × 2.000 = 7,5 $. Con Batch (×0,5): 3,75 $.
    const r = calculateModelCost(get('haiku-5-5'), params);
    expect(r.perTaskUsd).toBeCloseTo(0.00375, 10);
    expect(r.monthlyUsd).toBeCloseTo(7.5, 8);
    expect(r.monthlyBatchUsd).toBeCloseTo(3.75, 8);
  });
  it('Sonnet 5.5', () => {
    // 30.000 × 2 + 1.500 × 10 = 60.000 + 15.000 = 75.000 → 0,075 $; al mes 150 $; Batch 75 $.
    const r = calculateModelCost(get('sonnet-5-5'), params);
    expect(r.perTaskUsd).toBeCloseTo(0.075, 10);
    expect(r.monthlyUsd).toBeCloseTo(150, 8);
    expect(r.monthlyBatchUsd).toBeCloseTo(75, 8);
  });
  it('Opus 5.5', () => {
    // 30.000 × 4 + 1.500 × 20 = 120.000 + 30.000 = 150.000 → 0,15 $; al mes 300 $; Batch 150 $.
    const r = calculateModelCost(get('opus-5-5'), params);
    expect(r.perTaskUsd).toBeCloseTo(0.15, 10);
    expect(r.monthlyUsd).toBeCloseTo(300, 8);
    expect(r.monthlyBatchUsd).toBeCloseTo(150, 8);
  });
  it('el estado inicial de la interfaz reproduce estas cifras', () => {
    const parsed = parseCostInputs(DEFAULT_RAW_INPUTS);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const models = DEFAULT_MODEL_IDS.map(get);
    // Haiku 0,00375, Sonnet 0,075, Opus 0,15 por tarea (cuentas de arriba).
    expect(compareModels(models, parsed.params).map((r) => r.perTaskUsd)).toEqual([
      expect.closeTo(0.00375, 10),
      expect.closeTo(0.075, 10),
      expect.closeTo(0.15, 10),
    ]);
  });
  it('Batch activado aplica ×0,5 a todo y las líneas más el descuento suman el total', () => {
    // Sonnet: 0,075 × 0,5 = 0,0375 por tarea; descuento = 0,0375.
    const r = calculateModelCost(get('sonnet-5-5'), { ...params, useBatch: true });
    expect(r.perTaskUsd).toBeCloseTo(0.0375, 10);
    expect(r.batchDiscountUsd).toBeCloseTo(0.0375, 10);
    expect(r.lines.reduce((s, l) => s + l.costUsd, 0) - r.batchDiscountUsd).toBeCloseTo(r.perTaskUsd, 12);
    expect(r.batchApplied).toBe(true);
  });
});

describe('razonamiento', () => {
  it('se factura como salida, pero se desglosa aparte', () => {
    // Sonnet 5.5, entrada 30.000, salida 1.500, razonamiento 3.000:
    // 30.000 × 2 + 1.500 × 10 + 3.000 × 10 = 60.000 + 15.000 + 30.000 = 105.000 → 0,105 $
    const r = calculateModelCost(
      get('sonnet-5-5'),
      p({ inputTokens: 30_000, outputTokens: 1_500, reasoningTokens: 3_000 }),
    );
    expect(r.perTaskUsd).toBeCloseTo(0.105, 10);
    const reasoning = r.lines.find((l) => l.id === 'reasoning')!;
    expect(reasoning.tokens).toBe(3_000);
    expect(reasoning.costUsd).toBeCloseTo(0.03, 10);
    expect(reasoning.unitPriceUsd).toBe(10);
  });
  it('el razonamiento previo no se reenvía por defecto, y sí si se pide', () => {
    // Sonnet 5.5, 2 turnos, entrada 1.000, salida 100, razonamiento 400, crecimiento 50. Sin caché.
    // Sin reenviar razonamiento: crecimiento por turno = 100 + 50 = 150 → N = 1.000 y 1.150.
    //   entrada 2.150 × 2 = 4.300; salida 2 × 500 × 10 = 10.000 → 14.300 → 0,0143 $
    // Reenviando: crecimiento = 100 + 400 + 50 = 550 → N = 1.000 y 1.550.
    //   entrada 2.550 × 2 = 5.100; salida 10.000 → 15.100 → 0,0151 $
    const args = {
      inputTokens: 1_000,
      outputTokens: 100,
      reasoningTokens: 400,
      turns: 2,
      historyGrowthTokens: 50,
    };
    expect(calculateModelCost(get('sonnet-5-5'), p(args)).perTaskUsd).toBeCloseTo(0.0143, 10);
    expect(
      calculateModelCost(get('sonnet-5-5'), p({ ...args, reasoningInHistory: true })).perTaskUsd,
    ).toBeCloseTo(0.0151, 10);
  });
});

describe('varios turnos: reenvío del historial', () => {
  it('sin caché, cada petición paga todo lo anterior', () => {
    // Sonnet 5.5, 3 turnos, entrada 10.000, salida 500, crecimiento 1.000.
    // Crecimiento por turno = 500 (salida reenviada) + 1.000 = 1.500 → N = 10.000, 11.500, 13.000.
    // Entrada: 34.500 × 2 = 69.000. Salida: 3 × 500 × 10 = 15.000. Total 84.000 → 0,084 $
    const r = calculateModelCost(
      get('sonnet-5-5'),
      p({ inputTokens: 10_000, outputTokens: 500, turns: 3, historyGrowthTokens: 1_000 }),
    );
    expect(r.requests.map((q) => q.inputTokens)).toEqual([10_000, 11_500, 13_000]);
    expect(r.perTaskUsd).toBeCloseTo(0.084, 10);
  });
});

describe('caché del prefijo estable', () => {
  const multi = { inputTokens: 10_000, outputTokens: 500, turns: 3, historyGrowthTokens: 1_000 };
  const model = get('sonnet-5-5');

  it('turno 1 escribe y los siguientes leen (acierto 100 %, TTL corto)', () => {
    // Prefijo 8.000. N = 10.000, 11.500, 13.000.
    // Turno 1: escritura 8.000, sin caché 2.000. Turnos 2 y 3: lectura 8.000; sin caché 3.500 y 5.000.
    // Sin caché: 2.000 + 3.500 + 5.000 = 10.500 × 2 = 21.000
    // Escritura: 8.000 × 2,5 (5 min) = 20.000
    // Lectura: 16.000 × 0,1 = 1.600
    // Salida: 3 × 500 × 10 = 15.000. Total = 57.600 → 0,0576 $
    const r = calculateModelCost(model, p({ ...multi, cacheMode: 'prefix', cacheablePrefixTokens: 8_000 }));
    expect(r.perTaskUsd).toBeCloseTo(0.0576, 10);
    expect(r.ttlMinutes).toBe(5);
    expect(r.requests.map((q) => [q.cacheWriteTokens, q.cacheReadTokens])).toEqual([
      [8_000, 0],
      [0, 8_000],
      [0, 8_000],
    ]);
    // La misma tarea sin caché cuesta 0,084 $ (caso anterior): la caché ahorra 0,0264 $.
    const noCache = calculateModelCost(model, p(multi));
    expect(noCache.perTaskUsd - r.perTaskUsd).toBeCloseTo(0.0264, 10);
  });

  it('con 50 % de acierto, la mitad de las lecturas esperadas se reescribe', () => {
    // Turnos 2 y 3: lectura 4.000 y reescritura 4.000 cada uno.
    // Escritura: (8.000 + 4.000 + 4.000) × 2,5 = 40.000. Lectura: 8.000 × 0,1 = 800.
    // Sin caché: 21.000. Salida: 15.000. Total 76.800 → 0,0768 $
    const r = calculateModelCost(
      model,
      p({ ...multi, cacheMode: 'prefix', cacheablePrefixTokens: 8_000, cacheHitPercent: 50 }),
    );
    expect(r.perTaskUsd).toBeCloseTo(0.0768, 10);
  });

  it('con 0 % de acierto, la caché solo encarece (todo se escribe)', () => {
    // Escritura: 3 × 8.000 × 2,5 = 60.000; sin caché 21.000; salida 15.000 → 96.000 → 0,096 $ (> 0,084 $)
    const r = calculateModelCost(
      model,
      p({ ...multi, cacheMode: 'prefix', cacheablePrefixTokens: 8_000, cacheHitPercent: 0 }),
    );
    expect(r.perTaskUsd).toBeCloseTo(0.096, 10);
    expect(r.lines.find((l) => l.id === 'cacheRead')!.tokens).toBe(0);
  });

  it('el TTL largo cambia solo el precio de escritura', () => {
    // Escritura: 8.000 × 4 (1 h) = 32.000 en vez de 20.000 → 57.600 + 12.000 = 69.600 → 0,0696 $
    const r = calculateModelCost(
      model,
      p({ ...multi, cacheMode: 'prefix', cacheablePrefixTokens: 8_000, ttl: 'long' }),
    );
    expect(r.perTaskUsd).toBeCloseTo(0.0696, 10);
    expect(r.ttlMinutes).toBe(60);
  });

  it('prefijo reutilizado entre tareas, un turno: caso del asistente del convenio de la página de caché', () => {
    // Sonnet 5.5, entrada 20.000, prefijo 18.000, salida 500, acierto 100 %, ámbito «entre tareas»:
    // lectura 18.000 × 0,1 = 1.800; sin caché 2.000 × 2 = 4.000; salida 500 × 10 = 5.000 → 10.800 → 0,0108 $
    // Es la cifra de <CostExample cacheados={18000}> (caché siempre caliente, sin primera escritura).
    const r = calculateModelCost(
      model,
      p({
        inputTokens: 20_000,
        outputTokens: 500,
        cacheMode: 'prefix',
        cacheScope: 'tasks',
        cacheablePrefixTokens: 18_000,
      }),
    );
    expect(r.perTaskUsd).toBeCloseTo(0.0108, 10);
  });

  it('con un turno y ámbito «por tarea», solo se paga la escritura (y se avisa)', () => {
    // Prefijo 18.000 de 20.000: escritura 18.000 × 2,5 = 45.000; sin caché 2.000 × 2 = 4.000; salida 5.000 → 54.000 → 0,054 $
    // (más que los 0,050 $ sin caché: 40.000 + 5.000 = 45.000 → 0,045 $; la escritura es 1,25× la entrada)
    const args = p({
      inputTokens: 20_000,
      outputTokens: 500,
      cacheMode: 'prefix',
      cacheablePrefixTokens: 18_000,
    });
    expect(calculateModelCost(model, args).perTaskUsd).toBeCloseTo(0.054, 10);
    expect(calculateModelCost(model, { ...args, cacheMode: 'off' }).perTaskUsd).toBeCloseTo(0.045, 10);
    expect(configurationWarnings(args).map((w) => w.code)).toContain('cache-no-reuse');
  });
});

describe('caché del prefijo y del historial', () => {
  it('el punto de corte avanza: cada turno lee la petición anterior y escribe lo nuevo', () => {
    // Sonnet 5.5, 3 turnos, entrada 10.000, salida 500, crecimiento 1.000, acierto 100 %, ámbito «por tarea».
    // N = 10.000, 11.500, 13.000.
    // Turno 1: escribe 10.000. Turno 2: lee 10.000 y escribe 1.500. Turno 3: lee 11.500 y escribe 1.500.
    // Escritura: 13.000 × 2,5 = 32.500. Lectura: 21.500 × 0,1 = 2.150. Salida: 15.000. Total 49.650 → 0,04965 $
    const r = calculateModelCost(
      get('sonnet-5-5'),
      p({
        inputTokens: 10_000,
        outputTokens: 500,
        turns: 3,
        historyGrowthTokens: 1_000,
        cacheMode: 'conversation',
      }),
    );
    expect(r.perTaskUsd).toBeCloseTo(0.04965, 10);
    expect(r.lines.find((l) => l.id === 'uncachedInput')!.tokens).toBe(0);
  });
});

describe('mínimo cacheable', () => {
  // Sonnet 5.5: 512 tokens (catálogo comprobado arriba).
  const args = { inputTokens: 1_000, cacheMode: 'prefix' as const, cacheScope: 'tasks' as const };
  it('un prefijo de 511 tokens no activa la caché', () => {
    // Todo a precio de entrada: 1.000 × 2 = 2.000 → 0,002 $
    const r = calculateModelCost(get('sonnet-5-5'), p({ ...args, cacheablePrefixTokens: 511 }));
    expect(r.perTaskUsd).toBeCloseTo(0.002, 12);
    expect(r.cacheActiveRequests).toBe(0);
    expect(codes(r)).toContain('cache-below-min');
  });
  it('un prefijo de 512 tokens sí la activa', () => {
    // Lectura 512 × 0,1 = 51,2; sin caché 488 × 2 = 976 → 1.027,2 → 0,0010272 $
    const r = calculateModelCost(get('sonnet-5-5'), p({ ...args, cacheablePrefixTokens: 512 }));
    expect(r.perTaskUsd).toBeCloseTo(0.0010272, 12);
    expect(codes(r)).not.toContain('cache-below-min');
  });
  it('el mínimo es el de cada modelo: Opus 4.7 pide 2.048', () => {
    expect(get('opus-4-7').cache.minTokens).toBe(2048);
    const r = calculateModelCost(
      get('opus-4-7'),
      p({ ...args, inputTokens: 3_000, cacheablePrefixTokens: 2_047 }),
    );
    expect(r.cacheActiveRequests).toBe(0);
    expect(
      calculateModelCost(get('opus-4-7'), p({ ...args, inputTokens: 3_000, cacheablePrefixTokens: 2_048 }))
        .cacheActiveRequests,
    ).toBe(1);
  });
  it('en modo historial, la caché empieza cuando la petición alcanza el mínimo', () => {
    // Sonnet 5.5, 3 turnos: N = 400, 700, 1.000 (crecimiento 300). Solo el primero queda por debajo de 512.
    const r = calculateModelCost(
      get('sonnet-5-5'),
      p({
        inputTokens: 400,
        outputTokens: 100,
        historyGrowthTokens: 200,
        turns: 3,
        cacheMode: 'conversation',
      }),
    );
    expect(r.requests.map((q) => q.cacheActive)).toEqual([false, true, true]);
    expect(r.warnings.find((w) => w.code === 'cache-below-min')?.message).toContain('desde el turno 2');
  });
});

describe('tramos de contexto largo', () => {
  it('Haiku 5.5: 100.000 tokens de entrada aún paga el precio base; 100.001, el del tramo largo', () => {
    // 100.000: 100.000 × 0,10 + 1.000 × 0,50 = 10.000 + 500 = 10.500 → 0,0105 $
    // 100.001: 100.001 × 0,50 + 1.000 × 2,50 = 50.000,5 + 2.500 = 52.500,5 → 0,0525005 $
    const haiku = get('haiku-5-5');
    const at = calculateModelCost(haiku, p({ inputTokens: 100_000, outputTokens: 1_000 }));
    const over = calculateModelCost(haiku, p({ inputTokens: 100_001, outputTokens: 1_000 }));
    expect(at.perTaskUsd).toBeCloseTo(0.0105, 12);
    expect(over.perTaskUsd).toBeCloseTo(0.0525005, 12);
    expect(codes(at)).not.toContain('long-context');
    expect(codes(over)).toContain('long-context');
  });
  it('GPT-6.1 Sol: el umbral de 272.000 es estricto y el tramo largo cambia entrada y salida', () => {
    // 272.000 × 2 = 544.000 → 0,544 $; 272.001 × 4 = 1.088.004 → 1,088004 $
    const sol = get('gpt-6-1-sol');
    expect(calculateModelCost(sol, p({ inputTokens: 272_000 })).perTaskUsd).toBeCloseTo(0.544, 12);
    expect(calculateModelCost(sol, p({ inputTokens: 272_001 })).perTaskUsd).toBeCloseTo(1.088004, 12);
    // Salida en tramo largo: 1.000 × 15 = 15.000 → +0,015 $ (en vez de 10.000).
    expect(calculateModelCost(sol, p({ inputTokens: 272_001, outputTokens: 1_000 })).perTaskUsd).toBeCloseTo(
      1.103004,
      12,
    );
  });
  it('las lecturas de caché cuentan para el umbral y se cobran al precio de lectura del tramo largo', () => {
    // Haiku 5.5, entrada 120.000 (> 100.000), prefijo 100.000 leído (acierto 100 %, entre tareas), salida 1.000.
    // Lectura: 100.000 × 0,05 (tramo largo) = 5.000. Sin caché: 20.000 × 0,50 = 10.000. Salida: 1.000 × 2,50 = 2.500.
    // Total 17.500 → 0,0175 $ (a precio base habría sido 1.000 + 2.000 + 500 = 3.500)
    const r = calculateModelCost(
      get('haiku-5-5'),
      p({
        inputTokens: 120_000,
        outputTokens: 1_000,
        cacheMode: 'prefix',
        cacheScope: 'tasks',
        cacheablePrefixTokens: 100_000,
      }),
    );
    expect(r.perTaskUsd).toBeCloseTo(0.0175, 12);
    expect(codes(r)).toContain('long-context');
  });
  it('el tramo se decide por petición: en una conversación solo las últimas lo superan', () => {
    // Haiku 5.5, 3 turnos, entrada 90.000, salida 4.000, crecimiento 6.000 → +10.000 por turno.
    // N = 90.000, 100.000 (no supera), 110.000 (supera).
    // Entrada: 90.000 × 0,1 + 100.000 × 0,1 + 110.000 × 0,5 = 9.000 + 10.000 + 55.000 = 74.000
    // Salida: 4.000 × 0,5 × 2 + 4.000 × 2,5 = 4.000 + 10.000 = 14.000. Total 88.000 → 0,088 $
    const r = calculateModelCost(
      get('haiku-5-5'),
      p({ inputTokens: 90_000, outputTokens: 4_000, historyGrowthTokens: 6_000, turns: 3 }),
    );
    expect(r.requests.map((q) => q.tier)).toEqual(['base', 'base', 'long']);
    expect(r.perTaskUsd).toBeCloseTo(0.088, 12);
    expect(r.lines.find((l) => l.id === 'uncachedInput')!.mixedPrices).toBe(true);
    expect(r.warnings.find((w) => w.code === 'long-context')?.message).toContain('Desde el turno 3');
  });
});

describe('caché implícita de Gemini y ausencia de Batch', () => {
  const argon = get('gemini-4-argon');
  const args = p({
    inputTokens: 10_000,
    outputTokens: 1_000,
    cacheMode: 'prefix',
    cacheScope: 'tasks',
    cacheablePrefixTokens: 5_000,
    cacheHitPercent: 60,
  });
  it('no factura escritura aparte: lo no leído se paga como entrada normal', () => {
    // Lectura: 0,6 × 5.000 = 3.000 × 0,1 = 300. «Escritura»: 2.000 × 2 (precio de entrada) = 4.000.
    // Sin caché: 5.000 × 2 = 10.000. Salida: 1.000 × 10 = 10.000. Total 24.300 → 0,0243 $
    const r = calculateModelCost(argon, args);
    expect(r.perTaskUsd).toBeCloseTo(0.0243, 12);
    expect(r.ttlMinutes).toBeNull();
    expect(codes(r)).toContain('implicit-cache');
  });
  it('mínimo de 4.096 tokens', () => {
    expect(calculateModelCost(argon, { ...args, cacheablePrefixTokens: 4_095 }).cacheActiveRequests).toBe(0);
    expect(calculateModelCost(argon, { ...args, cacheablePrefixTokens: 4_096 }).cacheActiveRequests).toBe(1);
  });
  it('con el precio anunciado (4 / 20 / 0,2 desde el 2026-12-01) todo sube', () => {
    // Lectura: 3.000 × 0,2 = 600. Reescritura: 2.000 × 4 = 8.000. Sin caché: 5.000 × 4 = 20.000.
    // Salida: 1.000 × 20 = 20.000. Total 48.600 → 0,0486 $
    const r = calculateModelCost(argon, { ...args, usePlannedPrice: true });
    expect(r.perTaskUsd).toBeCloseTo(0.0486, 12);
    expect(r.plannedPriceApplied).toBe(true);
    expect(codes(r)).toContain('planned-price');
  });
  it('un modelo sin cambio programado ignora la casilla del precio anunciado', () => {
    const sonnet = get('sonnet-5-5');
    expect(sonnet.scheduledChange).toBeUndefined();
    const a = calculateModelCost(sonnet, p({ inputTokens: 1_000 }));
    const b = calculateModelCost(sonnet, p({ inputTokens: 1_000, usePlannedPrice: true }));
    expect(b.perTaskUsd).toBe(a.perTaskUsd);
    expect(b.plannedPriceApplied).toBe(false);
  });
  it('Batch no existe: se cobra a precio estándar, se avisa y no hay columna de Batch', () => {
    // 10.000 × 2 + 1.000 × 10 = 30.000 → 0,03 $, con o sin la opción de Batch.
    const r = calculateModelCost(argon, p({ inputTokens: 10_000, outputTokens: 1_000, useBatch: true }));
    expect(r.perTaskUsd).toBeCloseTo(0.03, 12);
    expect(r.perTaskBatchUsd).toBeNull();
    expect(r.batchApplied).toBe(false);
    expect(codes(r)).toContain('no-batch');
  });
});

describe('caché de OpenAI', () => {
  it('solo ofrece un TTL de 30 min: la escritura es 1,25× la entrada con corto y con largo', () => {
    // GPT-6.1 Sol (mínimo 1.024): prefijo 2.000 escrito (turno 1, ámbito por tarea): 2.000 × 2,5 = 5.000 → 0,005 $
    const sol = get('gpt-6-1-sol');
    for (const ttl of ['short', 'long'] as const) {
      const r = calculateModelCost(
        sol,
        p({ inputTokens: 2_000, cacheMode: 'prefix', cacheablePrefixTokens: 2_000, ttl }),
      );
      expect(r.perTaskUsd).toBeCloseTo(0.005, 12);
      expect(r.ttlMinutes).toBe(30);
      expect(codes(r)).toContain('ttl-fixed');
    }
  });
});

describe('avisos de límites del modelo', () => {
  it('la entrada supera la ventana de contexto', () => {
    // Haiku 4.5 tiene ventana de 200.000 (comprobada arriba).
    const r = calculateModelCost(get('haiku-4-5'), p({ inputTokens: 200_001 }));
    expect(codes(r)).toContain('context-overflow');
    expect(codes(calculateModelCost(get('haiku-4-5'), p({ inputTokens: 200_000 })))).not.toContain(
      'context-overflow',
    );
  });
  it('la entrada cabe pero no queda hueco para la salida', () => {
    // 190.000 + 5.000 + 6.000 = 201.000 > 200.000
    const r = calculateModelCost(
      get('haiku-4-5'),
      p({ inputTokens: 190_000, outputTokens: 5_000, reasoningTokens: 6_000 }),
    );
    expect(codes(r)).toEqual(expect.arrayContaining(['context-tight']));
    expect(codes(r)).not.toContain('context-overflow');
  });
  it('en una conversación, el aviso indica el primer turno que desborda', () => {
    // Haiku 4.5, entrada 150.000, crecimiento 30.000 por turno: N = 150.000, 180.000, 210.000 → turno 3.
    const r = calculateModelCost(
      get('haiku-4-5'),
      p({ inputTokens: 150_000, historyGrowthTokens: 30_000, turns: 4 }),
    );
    expect(r.warnings.find((w) => w.code === 'context-overflow')?.message).toContain('turno 3');
  });
  it('la salida más el razonamiento por turno superan el máximo de salida', () => {
    // Haiku 4.5: máximo 64.000. 60.000 + 5.000 = 65.000.
    expect(
      codes(calculateModelCost(get('haiku-4-5'), p({ outputTokens: 60_000, reasoningTokens: 5_000 }))),
    ).toContain('max-output');
    expect(
      codes(calculateModelCost(get('haiku-4-5'), p({ outputTokens: 60_000, reasoningTokens: 4_000 }))),
    ).not.toContain('max-output');
  });
  it('Batch con varios turnos y Batch con caché generan avisos de configuración', () => {
    expect(configurationWarnings(p({ useBatch: true, turns: 3 })).map((w) => w.code)).toContain(
      'batch-multi-turn',
    );
    expect(
      configurationWarnings(p({ useBatch: true, cacheMode: 'prefix', cacheScope: 'tasks' })).map(
        (w) => w.code,
      ),
    ).toContain('batch-cache');
    expect(configurationWarnings(p({}))).toEqual([]);
  });
});

describe('efecto de cada palanca', () => {
  const sonnet = get('sonnet-5-5');
  const args = p({ inputTokens: 30_000, outputTokens: 1_500, tasksPerMonth: 2_000 });
  const levers = leverEffects(sonnet, args, [get('haiku-5-5'), sonnet, get('opus-5-5')]);
  const byId = (id: string) => levers.find((l) => l.id === id)!;

  it('Batch: ahorra la mitad', () => {
    // 0,075 → 0,0375: ahorro 0,0375 por tarea (50 %) y 75 $ al mes (2.000 tareas).
    expect(byId('batch').savingPerTaskUsd).toBeCloseTo(0.0375, 10);
    expect(byId('batch').savingMonthlyUsd).toBeCloseTo(75, 8);
    expect(byId('batch').savingPercent).toBeCloseTo(50, 8);
    expect(byId('batch').kind).toBe('ahorra');
  });
  it('salida a la mitad: ahorra sobre la parte de salida', () => {
    // Salida 750 en vez de 1.500: 60.000 + 7.500 = 67.500 → 0,0675. Ahorro 0,0075 (10 %).
    expect(byId('output-half').savingPerTaskUsd).toBeCloseTo(0.0075, 10);
    expect(byId('output-half').savingPercent).toBeCloseTo(10, 8);
  });
  it('razonamiento a la mitad no es aplicable sin razonamiento, y con él ahorra', () => {
    expect(byId('reasoning-half').applicable).toBe(false);
    // Con 3.000 de razonamiento: coste 0,105. A la mitad (1.500): 60.000 + 15.000 + 15.000 = 90.000 → 0,09. Ahorro 0,015.
    const l = leverEffects(sonnet, { ...args, reasoningTokens: 3_000 }).find(
      (x) => x.id === 'reasoning-half',
    )!;
    expect(l.applicable).toBe(true);
    expect(l.savingPerTaskUsd).toBeCloseTo(0.015, 10);
  });
  it('cambiar de modelo: Haiku ahorra y Opus cuesta más; no se ofrece el mismo modelo', () => {
    // Haiku 0,00375 → ahorro 0,075 − 0,00375 = 0,07125 por tarea. Opus 0,15 → cuesta 0,075 más.
    expect(byId('model-haiku-5-5').savingPerTaskUsd).toBeCloseTo(0.07125, 10);
    expect(byId('model-opus-5-5').savingPerTaskUsd).toBeCloseTo(-0.075, 10);
    expect(byId('model-opus-5-5').kind).toBe('cuesta-mas');
    expect(levers.some((l) => l.id === 'model-sonnet-5-5')).toBe(false);
  });
  it('activar la caché con un solo turno y ámbito «entre tareas» ahorra; sin prefijo no es aplicable', () => {
    // Prefijo 2.000 de 30.000, acierto 80 %, entre tareas, un turno, Sonnet.
    // Sin caché: 2.000 × 2 = 4.000. Con caché: lectura 1.600 × 0,1 = 160 + escritura 400 × 2,5 = 1.000 = 1.160.
    // Ahorro = 2.840 / 1e6 = 0,00284 $ por tarea.
    const withPrefix = leverEffects(sonnet, {
      ...args,
      cacheScope: 'tasks',
      cacheablePrefixTokens: 2_000,
      cacheHitPercent: 80,
    });
    expect(withPrefix.find((l) => l.id === 'cache-prefix')!.savingPerTaskUsd).toBeCloseTo(0.00284, 10);
    expect(withPrefix.find((l) => l.id === 'cache-conversation')!.applicable).toBe(false);
    expect(byId('cache-prefix').applicable).toBe(false);
  });
  it('las palancas no se acumulan: cada una se mide contra la configuración actual', () => {
    // Si fueran acumulativas, el ahorro de «salida a la mitad» cambiaría al activar Batch.
    // Aquí se calcula siempre sobre 0,075: ahorro 0,0075, no 0,00375.
    const withBatch = leverEffects(sonnet, { ...args, useBatch: true }).find((l) => l.id === 'output-half')!;
    // Con Batch activo el coste actual es 0,0375; la salida a la mitad ahorra 0,00375 sobre esa base.
    expect(withBatch.savingPerTaskUsd).toBeCloseTo(0.00375, 10);
    expect(byId('output-half').savingPerTaskUsd).toBeCloseTo(0.0075, 10);
  });
  it('Batch no aplicable en Google', () => {
    const l = leverEffects(get('gemini-4-argon'), args).find((x) => x.id === 'batch')!;
    expect(l.applicable).toBe(false);
    expect(l.reason).toMatch(/Batch/);
  });
  it('TTL: con caché activa y dos TTL se ofrece el cambio, con su coste', () => {
    // Misma tarea de la prueba del prefijo (0,0576 con 5 min → 0,0696 con 1 h): cuesta 0,012 más.
    const l = leverEffects(
      sonnet,
      p({
        inputTokens: 10_000,
        outputTokens: 500,
        turns: 3,
        historyGrowthTokens: 1_000,
        cacheMode: 'prefix',
        cacheablePrefixTokens: 8_000,
      }),
    ).find((x) => x.id === 'ttl')!;
    expect(l.savingPerTaskUsd).toBeCloseTo(-0.012, 10);
    expect(l.kind).toBe('cuesta-mas');
  });
});

describe('validación de entradas', () => {
  const raw = (patch: Partial<RawCostInputs>): RawCostInputs => ({ ...DEFAULT_RAW_INPUTS, ...patch });
  const errorsOf = (patch: Partial<RawCostInputs>) => {
    const r = parseCostInputs(raw(patch));
    return r.ok ? {} : r.errors;
  };

  it('el ejemplo por defecto es válido', () => {
    const r = parseCostInputs(DEFAULT_RAW_INPUTS);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.params).toMatchObject({
        inputTokens: 30_000,
        outputTokens: 1_500,
        tasksPerMonth: 2_000,
        turns: 1,
      });
  });
  it('campos vacíos', () => {
    expect(errorsOf({ inputTokens: '' }).inputTokens).toMatch(/Escribe/);
    expect(errorsOf({ turns: '  ' }).turns).toMatch(/mínimo 1/);
  });
  it('negativos', () => {
    expect(errorsOf({ outputTokens: '-1' }).outputTokens).toBe('No puede ser negativo.');
  });
  it('turnos: entero y al menos 1', () => {
    expect(errorsOf({ turns: '2,5' }).turns).toMatch(/entero/);
    expect(errorsOf({ turns: '0' }).turns).toMatch(/mínimo es 1/);
    expect(errorsOf({ turns: '1001' }).turns).toMatch(/máximo/);
    expect(errorsOf({ turns: '1.000' }).turns).toBeUndefined();
  });
  it('tokens y tareas no enteros', () => {
    expect(errorsOf({ inputTokens: '1,5' }).inputTokens).toMatch(/entero/);
    expect(errorsOf({ tasksPerMonth: '10,5' }).tasksPerMonth).toMatch(/entero/);
  });
  it('porcentaje fuera de 0–100', () => {
    expect(errorsOf({ cacheHitPercent: '101' }).cacheHitPercent).toMatch(/entre 0 y 100/);
    expect(errorsOf({ cacheHitPercent: '-5' }).cacheHitPercent).toBe('No puede ser negativo.');
    expect(errorsOf({ cacheHitPercent: '0' }).cacheHitPercent).toBeUndefined();
    expect(errorsOf({ cacheHitPercent: '100' }).cacheHitPercent).toBeUndefined();
    expect(errorsOf({ cacheHitPercent: '12,5' }).cacheHitPercent).toBeUndefined();
  });
  it('texto que no es un número', () => {
    expect(errorsOf({ inputTokens: 'abc' }).inputTokens).toMatch(/solo cifras/);
    expect(errorsOf({ inputTokens: '1e5' }).inputTokens).toMatch(/solo cifras/);
  });
  it('el prefijo estable no puede superar la entrada', () => {
    expect(errorsOf({ inputTokens: '1.000', cacheablePrefixTokens: '1.001' }).cacheablePrefixTokens).toMatch(
      /no puede superar/,
    );
    expect(
      errorsOf({ inputTokens: '1.000', cacheablePrefixTokens: '1.000' }).cacheablePrefixTokens,
    ).toBeUndefined();
  });
  it('valores enormes', () => {
    expect(errorsOf({ tasksPerMonth: '1.000.000.001' }).tasksPerMonth).toMatch(/máximo/);
  });
  it('cero en todo es válido y cuesta cero', () => {
    const r = parseCostInputs(
      raw({ inputTokens: '0', outputTokens: '0', cacheablePrefixTokens: '0', tasksPerMonth: '0' }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cost = calculateModelCost(get('sonnet-5-5'), r.params);
    expect(cost.perTaskUsd).toBe(0);
    expect(cost.monthlyUsd).toBe(0);
    expect(
      leverEffects(get('sonnet-5-5'), r.params).every(
        (l) => l.savingPercent === null || l.savingPercent === 0,
      ),
    ).toBe(true);
  });
  it('calculateModelCost no acepta parámetros sin validar', () => {
    expect(() => calculateModelCost(get('sonnet-5-5'), p({ inputTokens: -1 }))).toThrow(RangeError);
    expect(() => calculateModelCost(get('sonnet-5-5'), p({ turns: 0 }))).toThrow(RangeError);
  });
});

describe('parseNumberEs', () => {
  it.each([
    ['30000', 30_000],
    ['30.000', 30_000],
    ['1.500.000', 1_500_000],
    ['12,5', 12.5],
    ['12.5', 12.5],
    ['1.234,5', 1234.5],
    ['30 000', 30_000],
    ['0', 0],
  ])('%s → %s', (text, expected) => {
    expect(parseNumberEs(text)).toBe(expected);
  });
  it.each(['', 'abc', '1,2,3', '1..5', '--1'])('«%s» no es un número', (text) => {
    expect(parseNumberEs(text)).toBeNull();
  });
});

describe('formatCost', () => {
  it('adapta los decimales al tamaño', () => {
    expect(formatCost(0)).toBe('0 $');
    expect(formatCost(0.00375)).toBe('0,00375 $');
    expect(formatCost(0.001875)).toBe('0,001875 $');
    expect(formatCost(0.075)).toBe('0,075 $');
    expect(formatCost(0.15)).toBe('0,15 $');
    expect(formatCost(7.5)).toBe('7,50 $');
    expect(formatCost(1500)).toBe('1.500 $');
  });
});

describe('coherencia con los datos reales (todos los modelos del catálogo)', () => {
  const params = p({
    inputTokens: 50_000,
    outputTokens: 2_000,
    reasoningTokens: 1_000,
    turns: 4,
    historyGrowthTokens: 3_000,
    cacheMode: 'conversation',
    cacheScope: 'tasks',
    cacheablePrefixTokens: 20_000,
    cacheHitPercent: 85,
    tasksPerMonth: 100,
  });
  it.each(catalog.models.map((m) => [m.id, m] as const))('%s: líneas, Batch y mes cuadran', (_id, model) => {
    const r = calculateModelCost(model, params);
    const sum = r.lines.reduce((s, l) => s + l.costUsd, 0);
    expect(sum).toBeCloseTo(r.perTaskStandardUsd, 12);
    expect(r.monthlyUsd).toBeCloseTo(r.perTaskUsd * 100, 10);
    expect(r.perTaskUsd).toBeGreaterThan(0);
    // Los tokens de entrada se reparten sin perder ni inventar ninguno.
    for (const q of r.requests) {
      expect(q.uncachedTokens + q.cacheWriteTokens + q.cacheReadTokens).toBeCloseTo(q.inputTokens, 8);
    }
    if (model.batchFactor === null) {
      expect(r.perTaskBatchUsd).toBeNull();
    } else {
      expect(r.perTaskBatchUsd).toBeCloseTo(r.perTaskStandardUsd * model.batchFactor, 12);
    }
    // Salida y razonamiento: 4 turnos × tokens, a un único precio de salida (sin tramos largos con esta entrada).
    const out = r.lines.find((l) => l.id === 'output')!;
    expect(out.tokens).toBe(8_000);
  });
});
