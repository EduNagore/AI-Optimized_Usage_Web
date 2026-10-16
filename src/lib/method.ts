/**
 * Los siete pasos del ciclo del método (plan/01_TEMARIO.md §2.1). Los usan el diagrama, la portada
 * y, más adelante, la lección del método, para que el orden y los enlaces no se desincronicen.
 * `detail` va en líneas ya cortadas porque el diagrama estrecho las dibuja como texto SVG.
 */
export interface MethodStep {
  n: number;
  name: string;
  /** Rótulo corto para el anillo del diagrama ancho. */
  short: string;
  detail: [string, string];
  /** Ruta interna de la lección que desarrolla el paso (sin base). */
  href: string;
}

export const methodSteps: MethodStep[] = [
  {
    n: 1,
    name: 'Clasifica',
    short: 'Clasifica',
    detail: ['Tipo de tarea, complejidad, riesgo,', 'volumen y urgencia'],
    href: 'm2-metodo/taxonomia-de-tareas',
  },
  {
    n: 2,
    name: 'Elige la superficie',
    short: 'Elige la superficie',
    detail: ['Chat, proyecto, agente de código,', 'API o automatización'],
    href: 'm2-metodo/elegir-superficie',
  },
  {
    n: 3,
    name: 'Elige modelo y esfuerzo',
    short: 'Elige modelo y esfuerzo',
    detail: ['Qué modelo y cuánto razonamiento', 'le das a esta tarea'],
    href: 'm4-modelo-y-esfuerzo',
  },
  {
    n: 4,
    name: 'Prepara el contexto',
    short: 'Prepara el contexto',
    detail: ['Lo mínimo suficiente; los documentos', 'primero y las fuentes identificadas'],
    href: 'm5-tokens-y-contexto/higiene-de-entrada',
  },
  {
    n: 5,
    name: 'Formula el encargo',
    short: 'Formula el encargo',
    detail: ['Objetivo, porqué, material, formato', 'y criterio de éxito'],
    href: 'm2-metodo/plantilla-de-encargo',
  },
  {
    n: 6,
    name: 'Verifica',
    short: 'Verifica',
    detail: ['Evidencias, tests, citas y una segunda', 'revisión con contexto limpio'],
    href: 'm9-calidad-y-seguridad/verificar-siempre',
  },
  {
    n: 7,
    name: 'Sistematiza y mide',
    short: 'Sistematiza y mide',
    detail: ['Plantilla, skill o automatización, y', 'coste por tarea completada'],
    href: 'm5-tokens-y-contexto/medir',
  },
];
