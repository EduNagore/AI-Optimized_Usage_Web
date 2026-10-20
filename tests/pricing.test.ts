import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { batchMultiplier, buildCatalog, cacheTtlOptions, formatTtl, unitPricesFor } from '../src/lib/pricing';
import type { ModelPricingDetailRecord, ModelRecord, SourceRecord } from '../src/lib/schemas';

const load = <T>(name: string): T => JSON.parse(readFileSync(`src/data/${name}.json`, 'utf8')) as T;
const models = load<ModelRecord[]>('models');
const details = load<ModelPricingDetailRecord[]>('model-pricing-details');
const sources = load<SourceRecord[]>('sources');
const catalog = buildCatalog(models, details, sources);
const get = (id: string) => catalog.models.find((m) => m.id === id)!;

describe('buildCatalog con los datos reales', () => {
  it('excluye los modelos de acceso limitado y no pierde ningún otro', () => {
    expect(catalog.models.some((m) => m.id === 'mythos-5-1')).toBe(false);
    expect(catalog.models).toHaveLength(models.filter((m) => m.status !== 'acceso-limitado').length);
    expect(buildCatalog(models, details, sources, { includeLimited: true }).models).toHaveLength(
      models.length,
    );
  });

  it('cada modelo del catálogo tiene su detalle y sus fuentes resueltas', () => {
    expect(details.map((d) => d.modelId).sort()).toEqual(models.map((m) => m.id).sort());
    for (const m of catalog.models) expect(catalog.sources[m.source]?.url).toMatch(/^https:/);
  });

  it('los precios del tramo largo de OpenAI cumplen la regla 2× entrada y caché, 1,5× salida', () => {
    for (const m of catalog.models.filter((x) => x.provider === 'openai')) {
      const lc = m.longContext!;
      expect(lc.thresholdTokens).toBe(272_000);
      expect(lc.prices.input).toBeCloseTo(m.prices.input * 2, 9);
      expect(lc.prices.output).toBeCloseTo(m.prices.output * 1.5, 9);
      expect(lc.prices.cacheRead!).toBeCloseTo(m.prices.cacheRead! * 2, 9);
      expect(lc.prices.cacheWrite5m!).toBeCloseTo(m.prices.cacheWrite5m! * 2, 9);
    }
  });

  it('los tramos largos coinciden con las notas de models.json', () => {
    // «Por encima de 272K de entrada: 20 $ y 75 $» (GPT-6 Astra) y «Precios hasta 100K…» (Haiku 5.5).
    expect(get('gpt-6-astra').longContext!.prices).toMatchObject({ input: 20, output: 75 });
    expect(get('gpt-5-6-sol').longContext!.prices).toMatchObject({ input: 8, output: 30 });
    expect(get('haiku-5-5').longContext).toMatchObject({
      thresholdTokens: 100_000,
      prices: { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite5m: 0.625, cacheWrite1h: 1 },
    });
  });

  it('las escrituras de caché de Anthropic son 1,25× y 2× la entrada', () => {
    for (const m of catalog.models.filter((x) => x.provider === 'anthropic')) {
      expect(m.prices.cacheWrite5m).toBeCloseTo(m.prices.input * 1.25, 9);
      expect(m.prices.cacheWrite1h).toBeCloseTo(m.prices.input * 2, 9);
    }
  });
});

describe('buildCatalog con datos inconsistentes', () => {
  it('falla si falta el detalle de un modelo', () => {
    expect(() => buildCatalog(models, details.slice(1), sources)).toThrow(/falta el detalle/);
  });
  it('falla si el detalle cita un modelo inexistente', () => {
    expect(() =>
      buildCatalog(models, [...details, { ...details[0]!, id: 'x', modelId: 'no-existe' }], sources),
    ).toThrow(/no existe en models.json/);
  });
  it('falla si una fuente no existe', () => {
    expect(() => buildCatalog(models, details, [])).toThrow(/no existe la fuente/);
  });
});

describe('unitPricesFor', () => {
  it('Haiku 5.5: hasta 100.000 tokens paga 0,10 / 0,50; por encima, 0,50 / 2,50 en toda la petición', () => {
    const haiku = get('haiku-5-5');
    expect(unitPricesFor(haiku, 100_000)).toMatchObject({ input: 0.1, output: 0.5 });
    expect(unitPricesFor(haiku, 100_001)).toMatchObject({ input: 0.5, output: 2.5 });
  });

  it('GPT-6.1 Sol: el umbral de 272.000 tokens es estricto (272.000 aún es tramo base)', () => {
    const sol = get('gpt-6-1-sol');
    expect(unitPricesFor(sol, 272_000).input).toBe(2);
    expect(unitPricesFor(sol, 272_001)).toMatchObject({ input: 4, output: 15 });
  });

  it('un modelo sin tramo largo cobra lo mismo con cualquier tamaño', () => {
    const sonnet = get('sonnet-5-5');
    expect(unitPricesFor(sonnet, 900_000)).toEqual(sonnet.prices);
  });

  it('aplica el cambio de precio programado desde su fecha de entrada en vigor', () => {
    const argon = get('gemini-4-argon');
    expect(unitPricesFor(argon, 1_000, '2026-11-30')).toMatchObject({ input: 2, output: 10, cacheRead: 0.1 });
    expect(unitPricesFor(argon, 1_000, '2026-12-01')).toMatchObject({ input: 4, output: 20, cacheRead: 0.2 });
    expect(unitPricesFor(argon, 1_000)).toMatchObject({ input: 2 });
  });
});

describe('caché y lotes', () => {
  it('Anthropic ofrece 5 min y 1 h con su precio de escritura; OpenAI, 30 min; Google, ninguno', () => {
    const opus = get('opus-5-5');
    const ttls = cacheTtlOptions(opus);
    expect(ttls.map((t) => t.label)).toEqual(['5 min', '1 h']);
    expect(ttls[0]!.writePrice(opus.prices)).toBe(5);
    expect(ttls[1]!.writePrice(opus.prices)).toBe(8);

    const sol = get('gpt-6-1-sol');
    expect(cacheTtlOptions(sol).map((t) => t.label)).toEqual(['30 min']);
    expect(cacheTtlOptions(sol)[0]!.writePrice(sol.prices)).toBe(2.5);

    expect(cacheTtlOptions(get('gemini-4-argon'))).toEqual([]);
  });

  it('el multiplicador de Batch solo aplica si se usa y el proveedor lo tiene', () => {
    expect(batchMultiplier(get('sonnet-5-5'), true)).toBe(0.5);
    expect(batchMultiplier(get('sonnet-5-5'), false)).toBe(1);
    expect(batchMultiplier(get('gemini-4-argon'), true)).toBe(0.5);
  });

  it('formatTtl', () => {
    expect([5, 30, 60, 120].map(formatTtl)).toEqual(['5 min', '30 min', '1 h', '2 h']);
  });
});
