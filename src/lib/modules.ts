/**
 * Módulos del temario (plan/01_TEMARIO.md). Es la única fuente del orden y de los nombres de la
 * barra lateral, del mapa de la página de inicio y de los índices de módulo. Las páginas de cada
 * módulo viven en `src/content/docs/<dir>/` y se ordenan con `sidebar.order`.
 */
export interface GuideModule {
  /** Carpeta bajo `src/content/docs/` y primer segmento de la URL. */
  dir: string;
  /** Nombre en la barra lateral y en los títulos. */
  label: string;
  /** Una frase para el mapa de la guía y para el índice del módulo. */
  summary: string;
}

export const modules: GuideModule[] = [
  {
    dir: 'm0-empieza-aqui',
    label: 'Empieza aquí',
    summary: 'Cómo usar la guía, las diez reglas y el glosario.',
  },
  {
    dir: 'm1-fundamentos',
    label: 'Fundamentos',
    summary: 'Tokens, ventana de contexto, razonamiento, agentes y la economía de un modelo.',
  },
  {
    dir: 'm2-metodo',
    label: 'El método',
    summary: 'El ciclo de siete pasos, la taxonomía de tareas y la plantilla de encargo.',
  },
  {
    dir: 'm3-prompting',
    label: 'Prompting moderno',
    summary: 'Cómo escribir encargos para los modelos actuales, con plantillas y casos antes/después.',
  },
  {
    dir: 'm4-modelo-y-esfuerzo',
    label: 'Modelo y esfuerzo',
    summary: 'Mapa de modelos, niveles de esfuerzo y cómo elegir con criterio.',
  },
  {
    dir: 'm5-tokens-y-contexto',
    label: 'Tokens y contexto',
    summary: 'Prompt caching, higiene de contexto, batch y una calculadora de coste.',
  },
  {
    dir: 'm6-herramientas',
    label: 'Herramientas y entornos',
    summary: 'Apps de chat, agentes de código y APIs; conectores, skills y ficheros de instrucciones.',
  },
  {
    dir: 'm7-claude-code',
    label: 'Claude Code a fondo',
    summary: 'Flujo recomendado, referencia de comandos, extensiones y equivalencias en Codex y Gemini.',
  },
  {
    dir: 'm8-agentes',
    label: 'Agentes y orquestación',
    summary: 'De la llamada única al multiagente: patrones, roles y cuándo no compensa.',
  },
  {
    dir: 'm9-calidad-y-seguridad',
    label: 'Calidad y seguridad',
    summary: 'Verificar, medir con evals, evitar alucinaciones y proteger los datos.',
  },
  {
    dir: 'm10-casos-practicos',
    label: 'Casos prácticos',
    summary: 'Doce playbooks de trabajo real, con configuración, encargo y verificación.',
  },
  {
    dir: 'm11-laboratorio',
    label: 'Laboratorio',
    summary: 'Quizzes, retos de prompting y un diagnóstico de madurez.',
  },
  {
    dir: 'm12-recursos',
    label: 'Recursos',
    summary: 'Chuleta imprimible, plantillas, novedades, fuentes y metodología.',
  },
];

export const levels = {
  basico: 'Básico',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
} as const;

export const tracks = {
  esencial: {
    label: 'Esencial',
    audience: 'Para cualquier perfil que quiera lo imprescindible en una sola sesión.',
  },
  profesional: {
    label: 'Profesional',
    audience:
      'Para quien usa Claude, ChatGPT o Gemini a diario y quiere dominar chat, prompting, modelos y coste.',
  },
  tecnica: {
    label: 'Técnica',
    audience: 'Para quien trabaja con Claude Code, Codex, la API o agentes y orquestación.',
  },
} as const;

export type Level = keyof typeof levels;
export type Track = keyof typeof tracks;
