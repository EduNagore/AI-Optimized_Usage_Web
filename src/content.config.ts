import { defineCollection } from 'astro:content';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';
import { file } from 'astro/loaders';
import { dataSchemas } from './lib/schemas';

const data = Object.fromEntries(
  Object.entries(dataSchemas).map(([name, schema]) => [
    name,
    defineCollection({ loader: file(`src/data/${name}.json`), schema }),
  ]),
);

// Un esquema que falla rompe el build: un dato sin fuente no llega a producción.
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
  ...data,
};
