import { z } from 'astro/zod';

/** Fecha absoluta AAAA-MM-DD. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');

/** Todo dato volátil lleva fuente (id de sources.json) y fecha de verificación. */
const volatile = { source: z.string().min(1), verifiedAt: isoDate };

const provider = z.enum(['anthropic', 'openai', 'google']);
const price = z.number().nonnegative().nullable();

export const sourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.url(),
  publisher: z.string().min(1),
  official: z.boolean(),
  lastChecked: isoDate,
});

export const modelSchema = z.object({
  id: z.string().min(1),
  provider,
  name: z.string().min(1),
  apiId: z.string().min(1),
  tier: z.string().min(1),
  status: z.enum(['ga', 'beta', 'acceso-limitado']),
  contextWindow: z.number().int().positive(),
  maxOutput: z.number().int().positive(),
  pricing: z.object({
    input: price,
    output: price,
    cacheRead: price,
    cacheWrite5m: price,
    cacheWrite1h: price,
    notes: z.string().optional(),
  }),
  effort: z.object({
    levels: z.array(z.string()),
    default: z.record(z.string(), z.string()),
  }),
  notes: z.string().optional(),
  bestFor: z.array(z.string()),
  ...volatile,
});

export const effortSchema = z.object({
  id: z.string().min(1),
  provider,
  parameter: z.string().min(1),
  levels: z.array(z.object({ name: z.string(), effect: z.string() })),
  defaults: z.record(z.string(), z.string()),
  notes: z.string().optional(),
  ...volatile,
});

export const pricingRuleSchema = z.object({
  id: z.string().min(1),
  provider,
  rule: z.string().min(1),
  value: z.union([z.number(), z.string()]),
  appliesTo: z.string().min(1),
  ...volatile,
});

export const commandSchema = z.object({
  id: z.string().min(1),
  command: z.string().startsWith('/'),
  args: z.string().optional(),
  category: z.string().min(1),
  phase: z.string().min(1),
  summary: z.string().min(1),
  tokenImpact: z.string().optional(),
  example: z.string().optional(),
  status: z.enum(['activo', 'alias', 'eliminado']),
  sinceVersion: z.string().optional(),
  ...volatile,
});

export const featureSchema = z.object({
  id: z.string().min(1),
  feature: z.string().min(1),
  provider,
  surface: z.string().min(1),
  status: z.string().min(1),
  howTo: z.string().optional(),
  ...volatile,
});

/** Recomendación de la guía, no un dato de proveedor: `rationale` es obligatorio. */
export const taskMatrixSchema = z.object({
  id: z.string().min(1),
  taskType: z.string().min(1),
  examples: z.array(z.string()),
  surface: z.string().min(1),
  models: z.array(z.string()),
  effort: z.string().min(1),
  verification: z.string().min(1),
  rationale: z.string().min(1),
  verifiedAt: isoDate,
});

export const glossarySchema = z.object({
  id: z.string().min(1),
  term: z.string().min(1),
  short: z.string().min(1),
  long: z.string().optional(),
  link: z.string().optional(),
});

export const changelogSchema = z.object({
  id: z.string().min(1),
  date: isoDate,
  provider: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  impact: z.string().min(1),
  link: z.url().optional(),
  ...volatile,
});

/** Nombre de fichero (sin .json) → esquema de cada registro. */
export const dataSchemas = {
  sources: sourceSchema,
  models: modelSchema,
  effort: effortSchema,
  'pricing-rules': pricingRuleSchema,
  'claude-code-commands': commandSchema,
  features: featureSchema,
  'task-matrix': taskMatrixSchema,
  glossary: glossarySchema,
  changelog: changelogSchema,
} as const;
