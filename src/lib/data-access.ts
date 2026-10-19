import { getCollection } from 'astro:content';
import { buildCatalog, type PricingCatalog } from './pricing';

/**
 * Acceso a los datos desde los envoltorios `.astro` de los interactivos. Las islas React no
 * pueden importar `astro:content`: el envoltorio carga los datos aquí y los pasa como props
 * (objetos planos y serializables). Este módulo solo se importa desde `.astro`, nunca desde tests.
 * Se escriben una a una (y no con un genérico) para conservar el tipo de cada registro.
 */

export const loadModels = async () => (await getCollection('models')).map((e) => e.data);
export const loadModelPricingDetails = async () =>
  (await getCollection('model-pricing-details')).map((e) => e.data);
export const loadSources = async () => (await getCollection('sources')).map((e) => e.data);
export const loadEffort = async () => (await getCollection('effort')).map((e) => e.data);
export const loadTaskMatrix = async () => (await getCollection('task-matrix')).map((e) => e.data);
export const loadCommands = async () => (await getCollection('claude-code-commands')).map((e) => e.data);
export const loadPricingRules = async () => (await getCollection('pricing-rules')).map((e) => e.data);

/** Catálogo de precios para la calculadora y el simulador de caché. */
export async function loadPricingCatalog(): Promise<PricingCatalog> {
  const [models, details, sources] = await Promise.all([
    loadModels(),
    loadModelPricingDetails(),
    loadSources(),
  ]);
  return buildCatalog(models, details, sources);
}
