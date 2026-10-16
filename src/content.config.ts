import { defineCollection } from 'astro:content';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';
import { dataSchemas, isoDate } from './lib/schemas';

// Una colección por fichero de datos. Se escriben una a una (y no con Object.fromEntries) para que
// TypeScript conserve el tipo de cada registro en getCollection().
const fromFile = <S extends z.ZodType>(name: string, schema: S) =>
  defineCollection({ loader: file(`src/data/${name}.json`), schema });

// Un esquema que falla rompe el build: un dato sin fuente no llega a producción.
export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      // Plantilla de página (plan/01_TEMARIO.md): metadatos de cada lección.
      extend: z.object({
        level: z.enum(['basico', 'intermedio', 'avanzado']).optional(),
        tracks: z.array(z.enum(['esencial', 'profesional', 'tecnica'])).optional(),
        readingTime: z.number().int().positive().optional(),
        // YAML convierte 2026-10-16 en una fecha: se acepta y se normaliza a texto AAAA-MM-DD.
        lastReviewed: z.union([isoDate, z.date().transform((d) => d.toISOString().slice(0, 10))]).optional(),
        sources: z.array(z.string()).default([]),
        /** «en-preparacion» muestra el aviso de esqueleto; las páginas terminadas no lo declaran. */
        status: z.enum(['en-preparacion', 'completa']).default('completa'),
      }),
    }),
  }),
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
  sources: fromFile('sources', dataSchemas.sources),
  models: fromFile('models', dataSchemas.models),
  effort: fromFile('effort', dataSchemas.effort),
  'pricing-rules': fromFile('pricing-rules', dataSchemas['pricing-rules']),
  'claude-code-commands': fromFile('claude-code-commands', dataSchemas['claude-code-commands']),
  features: fromFile('features', dataSchemas.features),
  'task-matrix': fromFile('task-matrix', dataSchemas['task-matrix']),
  glossary: fromFile('glossary', dataSchemas.glossary),
  changelog: fromFile('changelog', dataSchemas.changelog),
};
