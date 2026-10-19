import type { ModelPricingDetailRecord, ModelRecord, SourceRecord } from './schemas';

/**
 * Catálogo de precios para los interactivos que calculan costes (calculadora y simulador de caché).
 * Es un objeto plano y serializable: el envoltorio `.astro` lo construye con `buildCatalog` desde
 * `models.json`, `model-pricing-details.json` y `sources.json`, y lo pasa como prop a la isla React.
 * Todos los precios son dólares por millón de tokens.
 */

export type Provider = 'anthropic' | 'openai' | 'google';

export interface UnitPrices {
  input: number;
  output: number;
  /** `null` si el modelo no tiene precio de caché verificado. */
  cacheRead: number | null;
  cacheWrite5m: number | null;
  cacheWrite1h: number | null;
}

export interface CatalogModel {
  id: string;
  name: string;
  provider: Provider;
  apiId: string;
  tier: string;
  status: ModelRecord['status'];
  contextWindow: number;
  maxOutput: number;
  prices: UnitPrices;
  /** Niveles de esfuerzo que admite (vacío si no admite o no está verificado). */
  effortLevels: string[];
  /** Nota de `models.json` (tramos, promociones, límites). Se muestra tal cual. */
  notes?: string;
  /** Multiplicador de Batch sobre todo el coste; `null` si el proveedor no tiene dato verificado. */
  batchFactor: number | null;
  cache: { mode: 'explicit' | 'implicit'; minTokens: number; ttlMinutes: number[] };
  /** Si la entrada de una petición supera el umbral, toda la petición paga `prices`. */
  longContext?: { thresholdTokens: number; prices: UnitPrices };
  scheduledChange?: { effectiveFrom: string; prices: UnitPrices };
  /** Nota de `model-pricing-details.json`. */
  pricingNote?: string;
  source: string;
  verifiedAt: string;
}

export interface PriceSource {
  title: string;
  url: string;
}

export interface PricingCatalog {
  models: CatalogModel[];
  /** Fuentes citadas por los modelos, por id. */
  sources: Record<string, PriceSource>;
  /** La fecha de verificación más reciente de los datos del catálogo (AAAA-MM-DD). */
  verifiedAt: string;
}

function toUnitPrices(p: {
  input: number | null;
  output: number | null;
  cacheRead?: number | null | undefined;
  cacheWrite5m?: number | null | undefined;
  cacheWrite1h?: number | null | undefined;
}): UnitPrices {
  return {
    input: p.input ?? 0,
    output: p.output ?? 0,
    cacheRead: p.cacheRead ?? null,
    cacheWrite5m: p.cacheWrite5m ?? null,
    cacheWrite1h: p.cacheWrite1h ?? null,
  };
}

/**
 * Une cada modelo con su detalle de precios. Falla si un modelo con precio no tiene detalle o si
 * el detalle cita un modelo que no existe: un dato a medias no debe llegar a la calculadora.
 * Excluye por defecto los modelos de acceso limitado y los que no publican precio de entrada o salida.
 */
export function buildCatalog(
  models: ModelRecord[],
  details: ModelPricingDetailRecord[],
  sources: SourceRecord[],
  { includeLimited = false }: { includeLimited?: boolean } = {},
): PricingCatalog {
  const byModel = new Map(details.map((d) => [d.modelId, d]));
  for (const d of details) {
    if (!models.some((m) => m.id === d.modelId)) {
      throw new Error(`model-pricing-details: el modelo «${d.modelId}» no existe en models.json`);
    }
  }
  const catalog: CatalogModel[] = [];
  const sourceIds = new Set<string>();
  for (const m of models) {
    if (!includeLimited && m.status === 'acceso-limitado') continue;
    if (m.pricing.input === null || m.pricing.output === null) continue;
    const d = byModel.get(m.id);
    if (!d) throw new Error(`model-pricing-details: falta el detalle de precios de «${m.id}»`);
    const entry: CatalogModel = {
      id: m.id,
      name: m.name,
      provider: m.provider,
      apiId: m.apiId,
      tier: m.tier,
      status: m.status,
      contextWindow: m.contextWindow,
      maxOutput: m.maxOutput,
      prices: toUnitPrices(m.pricing),
      effortLevels: m.effort.levels,
      batchFactor: d.batchFactor,
      cache: d.cache,
      source: m.source,
      verifiedAt: [m.verifiedAt, d.verifiedAt].sort().at(-1)!,
    };
    if (m.notes !== undefined) entry.notes = m.notes;
    if (d.note !== undefined) entry.pricingNote = d.note;
    if (d.longContext) {
      const { thresholdTokens, ...prices } = d.longContext;
      entry.longContext = { thresholdTokens, prices: toUnitPrices(prices) };
    }
    if (d.scheduledChange) {
      const { effectiveFrom, ...prices } = d.scheduledChange;
      entry.scheduledChange = { effectiveFrom, prices: toUnitPrices(prices) };
    }
    catalog.push(entry);
    sourceIds.add(m.source);
    sourceIds.add(d.source);
  }

  const sourceMap: Record<string, PriceSource> = {};
  for (const id of sourceIds) {
    const s = sources.find((x) => x.id === id);
    if (!s) throw new Error(`sources.json: no existe la fuente «${id}»`);
    sourceMap[id] = { title: s.title, url: s.url };
  }
  const verifiedAt = catalog
    .map((m) => m.verifiedAt)
    .sort()
    .at(-1);
  return { models: catalog, sources: sourceMap, verifiedAt: verifiedAt ?? '' };
}

/**
 * Precios unitarios que rigen para una petición con `requestInputTokens` de entrada total
 * (lo que se envía, incluidas las lecturas y escrituras de caché): si supera el umbral del
 * modelo, toda la petición paga los precios del tramo largo.
 * Con `asOf` (AAAA-MM-DD) aplica el cambio de precio programado si ya ha entrado en vigor
 * (el tramo largo del cambio programado no está modelado: se conserva el del precio actual).
 */
export function unitPricesFor(model: CatalogModel, requestInputTokens: number, asOf?: string): UnitPrices {
  const base =
    asOf && model.scheduledChange && asOf >= model.scheduledChange.effectiveFrom
      ? model.scheduledChange.prices
      : model.prices;
  const lc = model.longContext;
  if (lc && requestInputTokens > lc.thresholdTokens) return lc.prices;
  return base;
}

export interface CacheTtlOption {
  minutes: number;
  label: string;
  /** Precio de escritura en caché con este TTL, por millón de tokens, para unos precios dados. */
  writePrice: (prices: UnitPrices) => number | null;
}

/** «5 min», «30 min», «1 h». */
export function formatTtl(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`;
}

/** TTL configurables de la caché explícita del modelo. Vacío en la caché implícita. */
export function cacheTtlOptions(model: CatalogModel): CacheTtlOption[] {
  if (model.cache.mode === 'implicit') return [];
  return model.cache.ttlMinutes.map((minutes, i) => ({
    minutes,
    label: formatTtl(minutes),
    writePrice: (prices) => (i === 0 ? prices.cacheWrite5m : prices.cacheWrite1h),
  }));
}

/** Multiplicador de Batch (1 si no hay Batch o no se usa). */
export function batchMultiplier(model: CatalogModel, useBatch: boolean): number {
  return useBatch && model.batchFactor !== null ? model.batchFactor : 1;
}
