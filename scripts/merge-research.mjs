// Fusiona research/*.json en src/data/ (Fase 1). Sobrescribe models, effort, pricing-rules,
// claude-code-commands, features y changelog, y añade fuentes a sources.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';

const V = '2026-10-16';
const rd = (p) => JSON.parse(readFileSync(p, 'utf8'));
// Los resúmenes de los investigadores vienen a veces sin tildes.
const WORDS = {
  Busqueda: 'Búsqueda',
  busqueda: 'búsqueda',
  Correccion: 'Corrección',
  Diagnosticos: 'Diagnósticos',
  Expiracion: 'Expiración',
  aplicacion: 'aplicación',
  codificacion: 'codificación',
  codigo: 'código',
  compactacion: 'compactación',
  Compactacion: 'Compactación',
  comprension: 'comprensión',
  conversacion: 'conversación',
  creacion: 'creación',
  creditos: 'créditos',
  delegacion: 'delegación',
  dificiles: 'difíciles',
  dinamicos: 'dinámicos',
  duracion: 'duración',
  generacion: 'generación',
  guia: 'guía',
  imagenes: 'imágenes',
  leido: 'leído',
  migracion: 'migración',
  opcion: 'opción',
  organizacion: 'organización',
  produccion: 'producción',
  programacion: 'programación',
  promocion: 'promoción',
  retencion: 'retención',
  reutilizacion: 'reutilización',
  transcripcion: 'transcripción',
  asincronas: 'asíncronas',
  agenticas: 'agénticas',
  agenticos: 'agénticos',
  corrigio: 'corrigió',
  movio: 'movió',
  inherita: 'hereda',
  sesion: 'sesión',
  segun: 'según',
  rapido: 'rápido',
};
const WORD_RE = new RegExp('\\b(' + Object.keys(WORDS).join('|') + ')\\b', 'g');
const accent = (k, v) =>
  typeof v === 'string' && !['source', 'id', 'link', 'apiId', 'command'].includes(k)
    ? v.replace(WORD_RE, (m) => WORDS[m])
    : v;
const wr = (n, d) => writeFileSync(`src/data/${n}.json`, JSON.stringify(d, accent, 2) + '\n');
const R = Object.fromEntries(
  ['anthropic-api', 'claude-code', 'openai', 'google', 'apps-y-prompting'].map((t) => [
    t,
    rd(`research/${t}.json`),
  ]),
);

// ---------- fuentes ----------
const sources = rd('src/data/sources.json');
const norm = (u) => u.replace(/\.md$/, '').replace(/\/$/, '');
const bySrc = new Map(sources.map((s) => [norm(s.url), s.id]));
const publisherOf = (u) => {
  const h = new URL(u).hostname;
  if (/openai|chatgpt/.test(h)) return 'OpenAI';
  if (/google|gemini/.test(h)) return 'Google';
  return 'Anthropic';
};
function src(url) {
  const k = norm(url);
  if (bySrc.has(k)) return bySrc.get(k);
  const u = new URL(url);
  const id = (u.hostname.replace(/^www\./, '') + u.pathname)
    .toLowerCase()
    .replace(/\.md$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  let uid = id;
  for (let i = 2; sources.some((x) => x.id === uid); i++) uid = id.slice(0, 74) + '-' + i;
  sources.push({
    id: uid,
    title: u.pathname.split('/').filter(Boolean).slice(-1)[0] || u.hostname,
    url,
    publisher: publisherOf(url),
    official: true,
    lastChecked: V,
  });
  bySrc.set(k, uid);
  return uid;
}

const S = {
  models: src('https://platform.claude.com/docs/en/about-claude/models/overview.md'),
  pricing: src('https://platform.claude.com/docs/en/about-claude/pricing.md'),
  oai: src('https://developers.openai.com/api/docs/pricing'),
  googModel: src('https://ai.google.dev/gemini-api/docs/latest-model'),
};

// ---------- modelos ----------
const all5 = ['low', 'medium', 'high', 'xhigh', 'max'];
const noXhigh = ['low', 'medium', 'high', 'max'];
const M = (o) => ({ status: 'ga', ...o, verifiedAt: V });
const A = (id, name, apiId, tier, ctx, p, eff, def, bestFor, notes) =>
  M({
    id,
    provider: 'anthropic',
    name,
    apiId,
    tier,
    contextWindow: ctx,
    maxOutput: 128000,
    pricing: { input: p[0], output: p[1], cacheRead: p[2], cacheWrite5m: p[3], cacheWrite1h: p[4] },
    effort: { levels: eff, default: def },
    bestFor,
    ...(notes ? { notes } : {}),
    source: S.pricing,
  });
const oai = ([id, name, apiId, tier, p, lv, def, notes, rel]) =>
  M({
    id,
    provider: 'openai',
    name,
    apiId,
    tier,
    contextWindow: 1050000,
    maxOutput: 128000,
    pricing: {
      input: p[0],
      output: p[1],
      cacheRead: p[2],
      cacheWrite5m: p[3],
      cacheWrite1h: null,
      notes: 'Precios para contexto de hasta 272K tokens.',
    },
    effort: { levels: lv, default: def },
    bestFor: [],
    notes:
      `${notes} Entrada máxima 922.000 tokens (la ventana de 1.050.000 incluye la salida). Los precios largos se aplican a toda la petición si supera 272K de entrada.` +
      (rel ? ` Lanzamiento: ${rel}.` : ''),
    source: S.oai,
  });
const models = [
  A(
    'fable-5-1',
    'Claude Fable 5.1',
    'claude-fable-5-1',
    'Frontera',
    1000000,
    [10, 50, 0.25, 12.5, 20],
    all5,
    { api: 'high', 'claude-code': 'high' },
    ['Tareas largas y difíciles donde el coste del error es alto'],
    'Razonamiento siempre activo; el razonamiento en bruto no se devuelve; exige retención de datos de 30 días; puede rechazar por clasificadores de seguridad. Lectura de caché a 0,025× la entrada.',
  ),
  A(
    'fable-5',
    'Claude Fable 5',
    'claude-fable-5',
    'Frontera',
    1000000,
    [10, 50, 1.0, 12.5, 20],
    all5,
    { api: 'high' },
    ['Heredado: usa Fable 5.1'],
    'Estado «Active (legacy)»: sigue activo pero ya no recibe actualizaciones; retirada no antes del 2027-06-09.',
  ),
  A(
    'opus-5-5',
    'Claude Opus 5.5',
    'claude-opus-5-5',
    'Alto rendimiento',
    1000000,
    [4, 20, 0.2, 5, 8],
    all5,
    { api: 'medium', 'claude-code': 'medium' },
    ['Programación y agentes de horizonte largo', 'Análisis complejo'],
    'El razonamiento no se puede desactivar. Fast mode (sale de vista previa el 2026-10-15): 8 $ entrada y 40 $ salida por MTok. Lectura de caché a 0,05× la entrada.',
  ),
  A(
    'opus-5',
    'Claude Opus 5',
    'claude-opus-5',
    'Alto rendimiento',
    1000000,
    [5, 25, 0.5, 6.25, 10],
    all5,
    { api: 'high' },
    ['Sustituido por Opus 5.5'],
    'Más caro que Opus 5.5.',
  ),
  A(
    'opus-4-8',
    'Claude Opus 4.8',
    'claude-opus-4-8',
    'Alto rendimiento',
    1000000,
    [5, 25, 0.5, 6.25, 10],
    all5,
    { api: 'high' },
    ['Heredado'],
  ),
  A(
    'opus-4-7',
    'Claude Opus 4.7',
    'claude-opus-4-7',
    'Alto rendimiento',
    1000000,
    [5, 25, 0.5, 6.25, 10],
    all5,
    { api: 'high', 'claude-code': 'xhigh' },
    ['Heredado'],
    'Introdujo el tokenizador que usa aprox. un 30 % más de tokens.',
  ),
  A(
    'opus-4-6',
    'Claude Opus 4.6',
    'claude-opus-4-6',
    'Alto rendimiento',
    1000000,
    [5, 25, 0.5, 6.25, 10],
    noXhigh,
    { api: 'high' },
    ['Heredado'],
    'Sin nivel xhigh.',
  ),
  A(
    'sonnet-5-5',
    'Claude Sonnet 5.5',
    'claude-sonnet-5-5',
    'Equilibrado',
    1000000,
    [2, 10, 0.1, 2.5, 4],
    all5,
    { api: 'high', 'claude-code': 'medium' },
    ['Trabajo diario de código, documentos y agentes'],
    'Esfuerzo por defecto distinto según la superficie: high en la API, medium en Claude Code. thinking {type: "between_tools"} quita el razonamiento previo a la respuesta y solo vale en low, medium y high (400 en xhigh y max). Lectura de caché a 0,05× la entrada.',
  ),
  A(
    'sonnet-5',
    'Claude Sonnet 5',
    'claude-sonnet-5',
    'Equilibrado',
    1000000,
    [2, 10, 0.2, 2.5, 4],
    all5,
    { api: 'high' },
    ['Heredado'],
    'Precio estándar 2 $ / 10 $ (la subida a 3 $ / 15 $ prevista no se aplicó).',
  ),
  A(
    'sonnet-4-6',
    'Claude Sonnet 4.6',
    'claude-sonnet-4-6',
    'Equilibrado',
    1000000,
    [3, 15, 0.3, 3.75, 6],
    noXhigh,
    { api: 'high' },
    ['Heredado'],
    'Sin nivel xhigh.',
  ),
  A(
    'haiku-5-5',
    'Claude Haiku 5.5',
    'claude-haiku-5-5',
    'Rápido y barato',
    1000000,
    [0.1, 0.5, 0.01, 0.125, 0.2],
    all5,
    { api: 'medium', 'claude-code': 'medium' },
    ['Volumen, clasificación, extracción, subagentes de exploración'],
    'Precios hasta 100K tokens de entrada; por encima: entrada 0,50, salida 2,50, lectura de caché 0,05, escritura 0,625 (5 min) y 1 (1 h). Desde la v2.1.293 de Claude Code es el modelo Haiku por defecto (alias haiku) en la API de Anthropic; el modelo por defecto de Claude Code sigue siendo Opus 5.5.',
  ),
  M({
    id: 'haiku-4-5',
    provider: 'anthropic',
    name: 'Claude Haiku 4.5',
    apiId: 'claude-haiku-4-5',
    tier: 'Rápido y barato',
    contextWindow: 200000,
    maxOutput: 64000,
    pricing: {
      input: 1,
      output: 5,
      cacheRead: 0.1,
      cacheWrite5m: 1.25,
      cacheWrite1h: 2,
      notes:
        'claude-haiku-4-5 es un alias del ID fijado claude-haiku-4-5-20251001. Contexto 200K y salida 64K confirmados.',
    },
    effort: { levels: [], default: {} },
    bestFor: ['Heredado'],
    notes: 'Retirada no antes del 2026-10-15; sigue activo. No admite esfuerzo.',
    source: S.pricing,
  }),
  M({
    id: 'mythos-5-1',
    provider: 'anthropic',
    name: 'Claude Mythos 5.1',
    apiId: 'claude-mythos-5-1',
    tier: 'Frontera',
    status: 'acceso-limitado',
    contextWindow: 1000000,
    maxOutput: 128000,
    pricing: { input: 10, output: 50, cacheRead: 0.25, cacheWrite5m: 12.5, cacheWrite1h: 20 },
    effort: { levels: all5, default: { api: 'high' } },
    bestFor: [],
    notes: 'Acceso limitado a organizaciones verificadas (Cyber Verification Program): no recomendar.',
    source: S.pricing,
  }),
  ...[
    [
      'gpt-6-astra',
      'GPT-6 Astra',
      'gpt-6-astra',
      'Frontera',
      [10, 50, 1, 12.5],
      all5,
      {},
      'No admite esfuerzo none. Por encima de 272K de entrada: 20 $ y 75 $. Esfuerzo por defecto no publicado.',
      '2026-09-03',
    ],
    [
      'gpt-6-1-sol',
      'GPT-6.1 Sol',
      'gpt-6.1-sol',
      'Equilibrado',
      [2, 10, 0.1, 2.5],
      all5,
      { api: 'medium' },
      'No admite none ni minimal. Por encima de 272K de entrada: 4 $ y 15 $.',
      '2026-09-29',
    ],
    [
      'gpt-6-sol',
      'GPT-6 Sol',
      'gpt-6-sol',
      'Equilibrado',
      [2, 10, 0.2, 2.5],
      ['none', ...all5],
      { api: 'medium' },
      'Por encima de 272K de entrada: 4 $ y 15 $.',
      '2026-09-22',
    ],
    [
      'gpt-6-luna',
      'GPT-6 Luna',
      'gpt-6-luna',
      'Rápido y barato',
      [0.1, 0.5, 0.01, 0.125],
      ['none', ...all5],
      { api: 'medium' },
      'Por encima de 272K de entrada: 0,20 $ y 0,75 $.',
      '2026-09-22',
    ],
    [
      'gpt-5-6-sol',
      'GPT-5.6 Sol',
      'gpt-5.6-sol',
      'Generación anterior',
      [4, 20, 0.4, 5],
      ['none', ...all5],
      { api: 'medium' },
      'Generación anterior (ya no figura entre los modelos insignia). 4 $ / 20 $ es un precio promocional que se mantiene al menos hasta 2026-11-21. Por encima de 272K de entrada: 8 $ y 30 $.',
      null,
    ],
    [
      'gpt-5-6-terra',
      'GPT-5.6 Terra',
      'gpt-5.6-terra',
      'Generación anterior',
      [2, 12, 0.2, 2.5],
      [],
      {},
      'Por encima de 272K de entrada: 4 $ y 18 $. Niveles de esfuerzo no verificados.',
      null,
    ],
    [
      'gpt-5-6-luna',
      'GPT-5.6 Luna',
      'gpt-5.6-luna',
      'Generación anterior',
      [0.2, 1.2, 0.02, 0.25],
      [],
      {},
      'Por encima de 272K de entrada: 0,40 $ y 1,80 $. Niveles de esfuerzo no verificados.',
      null,
    ],
  ].map(oai),
  M({
    id: 'gemini-4-argon',
    provider: 'google',
    name: 'Gemini 4 Argon',
    apiId: 'gemini-4-argon',
    tier: 'Frontera',
    contextWindow: 1048576,
    maxOutput: 65536,
    pricing: {
      input: 2,
      output: 10,
      cacheRead: 0.1,
      cacheWrite5m: null,
      cacheWrite1h: null,
      notes:
        'Precio introductorio hasta 2026-11-30 (razonamiento incluido). Desde 2026-12-01: entrada 4, salida 20, caché 0,20.',
    },
    effort: { levels: ['low', 'medium', 'high'], default: { api: 'medium' } },
    bestFor: [],
    notes:
      'GA el 2026-10-13. Ventana unificada para entrada, razonamiento y salida. Salida hasta 1.048.576 en modo background. Sin caché explícita; caché implícita desde 4.096 tokens con 95 % de descuento. No disponible en la API para el nivel gratuito ni para AI Pro.',
    source: S.googModel,
  }),
  M({
    id: 'gemini-3-8-flash',
    provider: 'google',
    name: 'Gemini 3.8 Flash',
    apiId: 'gemini-3.8-flash',
    tier: 'Rápido y barato',
    contextWindow: 1048576,
    maxOutput: 65536,
    pricing: {
      input: 0.75,
      output: 3.75,
      cacheRead: 0.075,
      cacheWrite5m: null,
      cacheWrite1h: null,
      notes: 'Precio introductorio hasta 2026-12-31. Después: entrada 1,50, salida 7,50, caché 0,15.',
    },
    effort: { levels: ['low', 'medium', 'high'], default: { api: 'medium' } },
    bestFor: [],
    notes:
      'GA el 2026-09-02. minimal da error. gemini-3.7-flash está deprecado desde 2026-10-08 y redirige a este modelo. Caché implícita desde 4.096 tokens (0,075 $ frente a 0,75 $ de entrada) y precio de almacenamiento de caché (0,50 $ por MTok y hora hasta 2026-12-31).',
    source: S.googModel,
  }),
];
wr('models', models);

// ---------- esfuerzo ----------
const E = (o) => ({ ...o, verifiedAt: V });
wr('effort', [
  E({
    id: 'anthropic-effort',
    provider: 'anthropic',
    parameter: 'output_config.effort',
    source: src('https://platform.claude.com/docs/en/build-with-claude/effort.md'),
    levels: [
      { name: 'low', effect: 'Menos razonamiento: más rápido y barato.' },
      {
        name: 'medium',
        effect:
          'Por defecto en Opus 5.5 y Haiku 5.5; la documentación recomienda empezar en medium con Haiku 5.5.',
      },
      {
        name: 'high',
        effect:
          'Razonamiento profundo; por defecto en todos los modelos con esfuerzo salvo Opus 5.5 y Haiku 5.5.',
      },
      { name: 'xhigh', effect: 'Más razonamiento aún; no existe en Opus 4.6 ni Sonnet 4.6.' },
      {
        name: 'max',
        effect:
          'Máximo razonamiento; en Claude Code se aplica solo a la sesión actual, salvo que se fije con CLAUDE_CODE_EFFORT_LEVEL.',
      },
    ],
    defaults: {
      'opus-5-5': 'medium',
      'haiku-5-5': 'medium',
      'fable-5-1': 'high',
      'sonnet-5-5 (API)': 'high',
      'sonnet-5-5 (Claude Code)': 'medium',
    },
    notes:
      'thinking {type: "adaptive"} sustituye a budget_tokens (error 400 en los modelos recientes). Opus 5.5: el razonamiento no se puede desactivar.',
  }),
  E({
    id: 'openai-reasoning-effort',
    provider: 'openai',
    parameter: 'reasoning.effort',
    source: src('https://developers.openai.com/api/docs/guides/latest-model'),
    levels: [
      { name: 'none', effect: 'Sin razonamiento (no existe en Astra ni en 6.1 Sol).' },
      { name: 'low', effect: 'Razonamiento ligero.' },
      { name: 'medium', effect: 'Por defecto en la familia GPT-6, salvo Astra.' },
      { name: 'high', effect: 'Razonamiento profundo.' },
      { name: 'xhigh', effect: 'Más razonamiento.' },
      { name: 'max', effect: 'Máximo razonamiento.' },
    ],
    defaults: { 'gpt-6-1-sol': 'medium', 'gpt-6-sol': 'medium', 'gpt-6-luna': 'medium' },
    notes:
      'Con esfuerzo distinto de none, eliminar temperature, top_p y top_logprobs (en Chat Completions, también logprobs). minimal existe en el parámetro, pero no lo admite ningún modelo GPT-6; el esfuerzo por defecto de Astra no está publicado. configuration_update cambia el esfuerzo a mitad de conversación sin romper el prefijo cacheado.',
  }),
  E({
    id: 'google-thinking-level',
    provider: 'google',
    parameter: 'thinking_level',
    source: src('https://ai.google.dev/gemini-api/docs/latest-model'),
    levels: [
      { name: 'low', effect: 'Menos razonamiento.' },
      { name: 'medium', effect: 'Por defecto en Gemini 4 Argon.' },
      { name: 'high', effect: 'Más razonamiento.' },
    ],
    defaults: { 'gemini-4-argon': 'medium', 'gemini-3-8-flash': 'medium' },
    notes:
      'Google recomienda probar los tres niveles y quedarse con el más bajo que cumpla. La guía de Gemini 3 está deprecada: no se usa como fuente del valor por defecto.',
  }),
]);

// ---------- reglas de precio ----------
const P = (id, provider, rule, value, appliesTo, url) => ({
  id,
  provider,
  rule,
  value,
  appliesTo,
  source: src(url),
  verifiedAt: V,
});
const ap = 'https://platform.claude.com/docs/en/about-claude/pricing.md';
const apc = 'https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md';
const oap = 'https://developers.openai.com/api/docs/pricing';
const gp = 'https://ai.google.dev/gemini-api/docs/pricing';
wr('pricing-rules', [
  P(
    'anthropic-batch-discount',
    'anthropic',
    'Descuento de Batch sobre todos los tokens (también caché)',
    0.5,
    'Message Batches API; resultados en menos de 24 h, hasta 100.000 peticiones o 256 MB por lote',
    'https://platform.claude.com/docs/en/build-with-claude/batch-processing.md',
  ),
  P(
    'anthropic-cache-write-5m',
    'anthropic',
    'Multiplicador de escritura de caché (5 min) sobre la entrada',
    1.25,
    'Todos los modelos',
    apc,
  ),
  P(
    'anthropic-cache-write-1h',
    'anthropic',
    'Multiplicador de escritura de caché (1 h) sobre la entrada',
    2,
    'Todos los modelos',
    apc,
  ),
  P(
    'anthropic-cache-read-default',
    'anthropic',
    'Multiplicador de lectura de caché sobre la entrada',
    0.1,
    'Generalidad de modelos',
    apc,
  ),
  P(
    'anthropic-cache-read-low',
    'anthropic',
    'Multiplicador de lectura de caché reducido',
    '0,05× (Opus 5.5 y Sonnet 5.5); 0,025× (Fable 5.1 y Mythos 5.1)',
    'Modelos indicados',
    apc,
  ),
  P(
    'anthropic-cache-min-tokens',
    'anthropic',
    'Mínimo cacheable',
    '512 tokens (Fable, Mythos, Opus 5.5, Opus 5, Sonnet 5.5, Haiku 5.5); 1.024 (Opus 4.8, Sonnet 5, Sonnet 4.6); 2.048 (Opus 4.7); 4.096 (Opus 4.6, Haiku 4.5)',
    'Por modelo',
    apc,
  ),
  P(
    'anthropic-cache-breakpoints',
    'anthropic',
    'Puntos de corte máximos por petición',
    4,
    'Caché explícita; existe además caché automática con un cache_control en la raíz',
    apc,
  ),
  P('anthropic-cache-ttl', 'anthropic', 'TTL de la caché', '5 min por defecto; 1 h con ttl "1h"', 'API', apc),
  P(
    'anthropic-opus55-fast',
    'anthropic',
    'Precio de fast mode en Opus 5.5 (entrada / salida por MTok)',
    '8 / 40',
    'Claude API; sale de vista previa el 2026-10-15',
    ap,
  ),
  P(
    'anthropic-tokenizer',
    'anthropic',
    'Tokens adicionales del tokenizador de Opus 4.7 y posteriores',
    'aprox. +30 %',
    'Mismo texto, modelos desde Opus 4.7',
    ap,
  ),
  P(
    'anthropic-us-residency',
    'anthropic',
    'Recargo de residencia de datos en EE. UU.',
    1.1,
    'Multiplicador sobre el precio estándar, modelos elegibles',
    ap,
  ),
  P(
    'anthropic-max-output',
    'anthropic',
    'Salida máxima',
    128000,
    'Modelos actuales (streaming para valores altos)',
    'https://platform.claude.com/docs/en/about-claude/models/overview.md',
  ),
  P(
    'anthropic-managed-agents',
    'anthropic',
    'Coste de sesión de Managed Agents',
    '0,08 $ por hora de sesión (más tokens)',
    'Beta; solo cuenta el tiempo en estado running; no elegible para ZDR/HIPAA',
    'https://platform.claude.com/docs/en/managed-agents/overview.md',
  ),
  P(
    'anthropic-ptc-saving',
    'anthropic',
    'Ahorro de tokens de entrada con programmatic tool calling (medición publicada)',
    '38 % menos de tokens de entrada facturados en un benchmark con 75 herramientas; 20–40 % en peticiones con 10 a 49 definiciones de herramientas',
    'Documentación de programmatic tool calling',
    'https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling.md',
  ),
  P(
    'anthropic-tool-search-threshold',
    'anthropic',
    'Umbral orientativo para tool search con defer_loading',
    '10 o más herramientas, o definiciones de más de 10.000 tokens (basta uno de los criterios)',
    'API',
    'https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool.md',
  ),
  P('openai-batch-flex', 'openai', 'Batch y Flex', 0.5, 'Multiplicador sobre el precio estándar', oap),
  P(
    'openai-fast',
    'openai',
    'Fast mode (antes Priority)',
    2,
    'Multiplicador sobre el precio estándar; Ultrafast en Astra (global y residencia en EE. UU.) y 6.1 Sol (global y residencia en EE. UU. y UE)',
    oap,
  ),
  P(
    'openai-long-context',
    'openai',
    'Umbral de contexto largo',
    272000,
    'Tokens de entrada; por encima, se cobra toda la petición a 2× entrada y caché y 1,5× salida',
    oap,
  ),
  P(
    'openai-regional',
    'openai',
    'Recargo de endpoints regionales (residencia de datos) y FedRAMP',
    0.1,
    'Residencia: modelos lanzados desde 2026-03-05; FedRAMP también +10 %',
    oap,
  ),
  P(
    'openai-cache-ttl',
    'openai',
    'prompt_cache_options.ttl',
    '30m (único valor admitido y por defecto)',
    'GPT-5.6 y posteriores; sustituye a prompt_cache_retention',
    'https://developers.openai.com/api/docs/guides/latest-model',
  ),
  P(
    'openai-cache-min',
    'openai',
    'Mínimo cacheable',
    1024,
    'tokens; lectura 0,1× la entrada (0,05× en 6.1 Sol), escritura 1,25×',
    oap,
  ),
  P(
    'openai-gpt56-terra',
    'openai',
    'GPT-5.6 Terra (entrada / cacheada / escritura / salida por MTok)',
    '2 / 0,20 / 2,50 / 12',
    'Hasta 272K',
    oap,
  ),
  P(
    'openai-gpt56-luna',
    'openai',
    'GPT-5.6 Luna (entrada / cacheada / escritura / salida por MTok)',
    '0,20 / 0,02 / 0,25 / 1,20',
    'Hasta 272K',
    oap,
  ),
  P(
    'google-argon-intro',
    'google',
    'Gemini 4 Argon: precio introductorio hasta 2026-11-30 (entrada / salida)',
    '2 / 10',
    'USD por MTok, razonamiento incluido',
    gp,
  ),
  P(
    'google-argon-post',
    'google',
    'Gemini 4 Argon: precio desde 2026-12-01 (entrada / salida / caché)',
    '4 / 20 / 0,20',
    'USD por MTok',
    gp,
  ),
  P(
    'google-implicit-cache',
    'google',
    'Caché implícita',
    'activa por defecto; mínimo 4.096 tokens (Argon y 3.8 Flash); descuento del 95 % en aciertos en Gemini 4 Argon',
    'Gemini 4 Argon no admite caché explícita; Gemini 3.8 Flash tiene además precio de almacenamiento de caché',
    gp,
  ),
]);

// ---------- comandos ----------
const catMap = [
  [/modelo|esfuerzo/, 'Modelo y esfuerzo'],
  [/contexto|memoria/, 'Contexto y memoria'],
  [/coste|uso|límites/, 'Coste y uso'],
  [
    /paralel|agente|equipos|sesion|sesión|remot|móvil|escritorio|flujo|objetivos|bucles|programad|conversación|vista/,
    'Sesiones y paralelismo',
  ],
  [/permiso|seguridad/, 'Permisos y seguridad'],
  [/código|revisión|verificación/, 'Código y revisión'],
  [/integraciones|extensiones|navegador|proveedor|api/, 'Integraciones y extensiones'],
  [/configuración|apariencia|terminal|salida|entrada|cuenta|directorios|ocio/, 'Configuración y cuenta'],
  [/ayuda|diagnóstico|feedback|análisis/, 'Ayuda y diagnóstico'],
  [/diseño|artefactos|visualización/, 'Artefactos y diseño'],
];
const phaseOf = {
  'Configuración y cuenta': 'Preparar',
  'Integraciones y extensiones': 'Preparar',
  'Modelo y esfuerzo': 'Preparar',
  'Permisos y seguridad': 'Preparar',
  'Contexto y memoria': 'Trabajar',
  'Sesiones y paralelismo': 'Trabajar',
  'Artefactos y diseño': 'Trabajar',
  'Código y revisión': 'Revisar',
  'Coste y uso': 'Medir',
  'Ayuda y diagnóstico': 'Medir',
  Otros: 'Trabajar',
};
const field = (n, k) => new RegExp(`${k}: ([^;]+?)(?:;|\\.?$)`).exec(n)?.[1]?.trim();
const seen = new Set();
const commands = [];
for (const a of R['claude-code'].afirmaciones.filter((x) => x.id.startsWith('claude-code.command.'))) {
  const name = a.id.replace('claude-code.command.', '');
  if (seen.has(name)) continue;
  seen.add(name);
  const n = a.notas || '';
  const cat0 = (field(n, 'categoría') || 'otros').toLowerCase();
  const category = catMap.find(([re]) => re.test(cat0))?.[1] ?? 'Otros';
  const est = (field(n, 'estado') || 'activo').toLowerCase();
  const status = est.startsWith('alias') ? 'alias' : est.startsWith('eliminado') ? 'eliminado' : 'activo';
  const argsRaw = typeof a.valor === 'string' ? a.valor.slice(name.length).trim() : '';
  const rec = {
    id: 'cmd' + name.replace(/[^a-z0-9]+/gi, '-'),
    command: name,
    category,
    phase: phaseOf[category],
    summary: a.afirmacion
      .replace(/^[^:]*:\s*/, '')
      .replace(/^./, (c) => c.toUpperCase())
      .replace('la design system', 'el design system')
      .replace('N-ésima', 'enésima'),
    status,
    source: src(a.fuenteUrl),
    verifiedAt: V,
  };
  if (argsRaw) rec.args = argsRaw;
  commands.push(rec);
}
wr('claude-code-commands', commands);

// ---------- características ----------
const F = (id, feature, provider, surface, status, url, howTo) => ({
  id,
  feature,
  provider,
  surface,
  status,
  ...(howTo ? { howTo } : {}),
  source: src(url),
  verifiedAt: V,
});
const apps = (id) => R['apps-y-prompting'].afirmaciones.find((a) => a.id === id);
const fa = (id, feature, surface, howTo) => {
  const a = apps(id);
  return F(id.replace(/\./g, '-'), feature, 'anthropic', surface, String(a.valor), a.fuenteUrl, howTo);
};
wr('features', [
  fa('claude-apps.projects.plans', 'Proyectos', 'Apps de Claude'),
  fa('claude-apps.projects.freeLimit', 'Proyectos: límite en Free', 'Apps de Claude'),
  fa('claude-apps.files.limits', 'Subida de ficheros', 'Apps de Claude'),
  fa('claude-apps.memory.availability', 'Memoria', 'Apps de Claude', 'Ajustes > Memoria'),
  fa('claude-apps.memory.chatSearch', 'Búsqueda en chats anteriores', 'Apps de Claude'),
  fa('claude-apps.connectors.customRemoteMcp', 'Conectores personalizados (MCP remoto)', 'Apps de Claude'),
  fa('claude-apps.skills.plans', 'Skills', 'Apps de Claude'),
  fa('claude-apps.artifacts.plans', 'Artifacts y plantillas', 'Apps de Claude'),
  fa('claude-apps.research.plans', 'Research (investigación)', 'Apps de Claude'),
  fa('claude-apps.excel.plans', 'Claude en Excel', 'Microsoft Excel'),
  fa('claude-apps.cowork.plans', 'Cowork', 'Apps de Claude (escritorio, web y móvil)'),
  fa('claude-apps.cowork.cloud', 'Cowork: sesiones en la nube', 'Apps de Claude'),
  fa('claude-apps.chrome.plans', 'Claude en Chrome', 'Google Chrome'),
  F(
    'claude-code-subagents',
    'Subagentes',
    'anthropic',
    'Claude Code',
    'Disponible',
    'https://code.claude.com/docs/en/sub-agents.md',
    '.claude/agents/*.md',
  ),
  F(
    'claude-code-agent-teams',
    'Agent teams',
    'anthropic',
    'Claude Code',
    'Experimental (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1)',
    'https://code.claude.com/docs/en/agent-teams.md',
  ),
  F(
    'claude-code-workflows',
    'Flujos dinámicos',
    'anthropic',
    'Claude Code',
    'Disponible',
    'https://code.claude.com/docs/en/workflows.md',
  ),
  F(
    'claude-code-routines',
    'Rutinas',
    'anthropic',
    'Claude Code',
    'Research preview',
    'https://code.claude.com/docs/en/routines.md',
  ),
  F(
    'claude-code-goal',
    '/goal',
    'anthropic',
    'Claude Code',
    'Disponible',
    'https://code.claude.com/docs/en/goal.md',
  ),
  F(
    'claude-code-hooks',
    'Hooks',
    'anthropic',
    'Claude Code',
    '33 eventos; tipos command, http, mcp_tool, prompt y agent',
    'https://code.claude.com/docs/en/hooks.md',
  ),
  F(
    'claude-api-managed-agents',
    'Managed Agents',
    'anthropic',
    'API de Claude',
    'Beta (cabecera managed-agents-2026-04-01)',
    'https://platform.claude.com/docs/en/managed-agents/overview.md',
  ),
  F(
    'claude-api-compaction',
    'Compactación en servidor',
    'anthropic',
    'API de Claude',
    'Beta (bajo demanda: cabecera compact-2026-09-04; por umbral: compact-2026-01-12)',
    'https://platform.claude.com/docs/en/build-with-claude/compaction.md',
  ),
  F(
    'claude-api-fast-mode-opus55',
    'Fast mode de Opus 5.5',
    'anthropic',
    'API de Claude',
    'Fuera de vista previa desde 2026-10-15 (Opus 5 y Opus 4.8 siguen en vista previa)',
    ap,
  ),
  F(
    'codex-surfaces',
    'Codex',
    'openai',
    'App de ChatGPT, móvil, web, CLI, extensión de IDE y Codex Cloud',
    'Disponible',
    'https://learn.chatgpt.com/docs',
  ),
  F(
    'chatgpt-gpt6-rollout',
    'GPT-6 en ChatGPT',
    'openai',
    'ChatGPT',
    'Sin confirmar en fuente oficial: reparto por plan y fecha (help.openai.com no accesible)',
    'https://help.openai.com/en/articles/6825453-chatgpt-release-notes',
  ),
  F(
    'gemini-cli-estado',
    'Gemini CLI',
    'google',
    'Terminal',
    'Desde 2026-06-18 deja de dar servicio a Google AI Pro, Ultra y Code Assist for individuals (los sustituye Antigravity CLI, agy); sigue con licencias Code Assist Standard y Enterprise y claves de pago de la API',
    'https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/',
  ),
]);

// ---------- novedades ----------
// Algunos resúmenes de los investigadores vienen sin tildes; se corrigen las palabras detectadas.
const accents = {
  'más rápido': /\bmas rapido\b/gi,
  'beta pública': /\bbeta publica\b/gi,
  'automática según': /\bautomatica segun\b/gi,
  'más uso': /\bmas uso\b/gi,
  Compactación: /\bCompactacion\b/g,
  compactación: /\bcompactacion\b/g,
  sesión: /\bsesion\b/g,
  sesiones: /\bsesiones\b/g,
};
const fixAccents = (t) => Object.entries(accents).reduce((x, [to, re]) => x.replace(re, to), t);
const overrides = {
  '2026-09-14|v2.1.271': {
    title: 'v2.1.271: omitClaudeMd en subagentes',
    summary:
      'Los subagentes admiten omitClaudeMd para no cargar CLAUDE.md. claude plugin eval y CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS llegaron en la v2.1.269 (2026-09-11).',
  },
  '2026-10-07|v2.1.293': {
    summary:
      'Claude Haiku 5.5 (claude-haiku-5-5) pasa a ser el modelo Haiku por defecto (alias haiku) en la API de Anthropic. Es también la versión mínima para usarlo en Claude Code.',
  },
  '2026-09-16|Cowork desde': {
    summary:
      'Cowork se puede iniciar desde cualquier conversación; el despliegue es gradual y solo para Pro y Max. Artifacts, Claude Design, Slides y Docs están en todos los planes, incluido Free.',
  },
  '2026-09-04|v2.1.261': {
    summary:
      'Nuevos ajustes bashOutputMaxChars y taskOutputMaxChars (hasta 128.000 caracteres); keybindingFlavor deja de tener efecto. /skill-doctor: el changelog lo sitúa en la v2.1.261 y commands.md exige la v2.1.252 (fuentes oficiales en conflicto).',
  },
};
const seenT = new Set();
const cl = [];
for (const t of Object.keys(R)) {
  for (const n of R[t].novedades) {
    if (!n.fecha || !n.titulo || !n.resumen || !n.fuenteUrl) continue;
    const key = n.fecha + n.titulo.toLowerCase();
    if (seenT.has(key)) continue;
    seenT.add(key);
    const prov =
      { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google' }[n.proveedor.toLowerCase()] ??
      n.proveedor;
    const ov =
      Object.entries(overrides).find(
        ([k]) => n.fecha === k.split('|')[0] && n.titulo.startsWith(k.split('|')[1]),
      )?.[1] ?? {};
    cl.push({
      id: `${n.fecha}-${prov.toLowerCase()}-${cl.length + 1}`,
      date: n.fecha,
      provider: prov,
      title: fixAccents(ov.title ?? n.titulo),
      summary: fixAccents(ov.summary ?? n.resumen),
      impact: 'Pendiente de redactar en la Fase 3.',
      link: n.fuenteUrl,
      source: src(n.fuenteUrl),
      verifiedAt: V,
    });
  }
}
cl.sort((a, b) => b.date.localeCompare(a.date));
wr('changelog', cl);
writeFileSync('src/data/sources.json', JSON.stringify(sources, null, 2) + '\n');
console.log({
  models: models.length,
  commands: commands.length,
  changelog: cl.length,
  sources: sources.length,
});
