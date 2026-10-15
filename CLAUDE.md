# AI-Optimized Usage Web

Web profesional, en español, de teoría y práctica sobre cómo usar LLMs (Claude, GPT, Gemini) de forma óptima en el trabajo: metodología, prompting, selección de modelo y esfuerzo, optimización de tokens, herramientas y comandos `/`, y reparto de tareas entre agentes y modelos.

## El plan
- `plan/00_PLAN_MAESTRO.md`: objetivos, stack, fases, reparto por agentes y criterios de calidad. Lee la sección de la fase en curso al empezar cada sesión.
- `plan/01_TEMARIO.md`: contenido de cada módulo y página, y la plantilla de página.
- `plan/02_HECHOS_VERIFICADOS.md`: datos verificados el 15-oct-2026, fuentes oficiales y protocolo de verificación.
- `plan/03_DISENO.md`: sistema de diseño, voz y estilo.
- `plan/04_PROMPTS_DE_FASE.md`: encargos listos para cada fase y para cada subagente.
- `plan/PROGRESO.md`: estado vivo del proyecto. Es la memoria entre sesiones: actualízalo al cerrar cada tarea.
- `.claude/agents/`: subagentes del proyecto, cada uno con su modelo y esfuerzo (ver §8 del plan maestro). Si en tu sesión no aparecen (Claude Code solo detecta esa carpeta al arrancar), lanza el subagente `general-purpose` con el `model` y el `effort` del fichero correspondiente y pon el cuerpo de ese fichero al principio del encargo.

## Reglas del proyecto
- Idioma del sitio: español de España, tuteo, tono profesional y directo. Los términos que aparecen tal cual en interfaces o APIs (`effort`, `prompt caching`, `/compact`) se mantienen en inglés y se explican la primera vez.
- Ningún dato volátil (modelo, precio, ventana de contexto, nivel de esfuerzo, comando, límite) se escribe a mano en una página. Vive en `src/data/*.json` con `source` y `verifiedAt`, y la página lo muestra con un componente. Así, actualizar el sitio es editar datos.
- Tu conocimiento de entrenamiento puede ser anterior a lo que cuenta este sitio. Para datos volátiles, la fuente de verdad es la documentación oficial actual. Si una fuente oficial contradice el plan, gana la fuente: corrige y anótalo en `PROGRESO.md`.
- Blogs y agregadores solo sirven como pista para encontrar la fuente oficial, nunca como fuente de un dato publicado.
- Distingue en el texto tres tipos de afirmación: dato verificado, medición publicada por un proveedor y recomendación de la guía (con su porqué).
- Una tarea está terminada cuando `npm run build` y `npm run check` pasan y has visto el resultado renderizado (navegador o captura).
- Commits al cerrar cada fase en la rama `feat/web`. Push, despliegue o creación de servicios externos solo con confirmación del usuario.
- Solo la sesión principal edita ficheros compartidos (`package.json`, `astro.config.*`, `src/data/`, componentes base, configuración de la barra lateral). Los subagentes escriben en la carpeta que se les asigna.

## Comandos
- `npm run dev`: servidor de desarrollo (http://localhost:4321/AI-Optimized_Usage_Web/).
- `npm run build` / `npm run preview`: build estático en `dist/` y vista previa. El build valida los datos con zod.
- `npm run check`: `astro check` + eslint + prettier + vitest + enlaces internos de `dist/` (requiere build previo) + cspell.
- `npm run test:e2e`: Playwright + axe (construye y sirve el sitio; en la primera ejecución, `npx playwright install chromium`).
- `npm run freshness`: registros con `verifiedAt` de más de 45 días y fuentes que no responden (`-- --offline` omite la red).
- Datos: `src/data/*.json`, esquemas en `src/lib/schemas.ts`. TypeScript fijado en 6.x porque `@astrojs/check` aún no admite la 7.
- Páginas: `src/content/docs/` (MDX). `base` es `/AI-Optimized_Usage_Web` (GitHub Pages de proyecto).

## Compactación
Al compactar, conserva la fase en curso, las tareas pendientes de `PROGRESO.md`, los ficheros modificados y las decisiones tomadas con su motivo.
