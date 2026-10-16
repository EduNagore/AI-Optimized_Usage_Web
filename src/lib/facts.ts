import { formatTokens, formatTokensShort, formatUsd } from './format';

/** Lo mínimo que `<Fact>` necesita de un registro de `models.json`. */
export interface FactModel {
  id: string;
  name: string;
  source: string;
  verifiedAt: string;
  [key: string]: unknown;
}

export interface ResolvedFact {
  /** Texto que se muestra en línea, ya con formato español. */
  display: string;
  /** Qué es el dato, para el tooltip («Claude Opus 5.5 · precio de entrada»). */
  label: string;
  source: string;
  verifiedAt: string;
}

const PATH_LABELS: Record<string, string> = {
  'pricing.input': 'precio de entrada por millón de tokens',
  'pricing.output': 'precio de salida por millón de tokens',
  'pricing.cacheRead': 'precio de lectura de caché por millón de tokens',
  'pricing.cacheWrite5m': 'precio de escritura de caché (5 min) por millón de tokens',
  'pricing.cacheWrite1h': 'precio de escritura de caché (1 h) por millón de tokens',
  contextWindow: 'ventana de contexto',
  maxOutput: 'salida máxima',
  apiId: 'identificador en la API',
  name: 'nombre',
  tier: 'nivel',
};

function traverse(root: unknown, path: string[]): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object' || !(key in cur)) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/**
 * Resuelve `<Fact id="opus-5-5.pricing.input" />`: el primer segmento es el id del modelo en
 * `models.json` y el resto, la ruta dentro del registro. Falla con un error claro si el dato no
 * existe, de modo que una referencia rota rompe el build y no llega a producción.
 */
export function resolveFact(models: FactModel[], id: string, short = false): ResolvedFact {
  const [modelId, ...path] = id.split('.');
  const model = models.find((m) => m.id === modelId);
  if (!model) throw new Error(`<Fact>: no existe el modelo «${modelId}» (id «${id}»)`);
  if (path.length === 0) throw new Error(`<Fact>: falta la ruta del dato en «${id}»`);

  const value = traverse(model, path);
  const key = path.join('.');
  let display: string;
  if (typeof value === 'number') {
    if (key.startsWith('pricing.')) display = formatUsd(value);
    else display = short ? formatTokensShort(value) : formatTokens(value);
  } else if (typeof value === 'string') {
    display = value;
  } else {
    throw new Error(`<Fact>: «${id}» no es un número ni un texto (¿precio sin dato para ${model.name}?)`);
  }

  const what = PATH_LABELS[key] ?? key;
  return {
    display,
    label: `${model.name} · ${what}`,
    source: model.source,
    verifiedAt: model.verifiedAt,
  };
}
