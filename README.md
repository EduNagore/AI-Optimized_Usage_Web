# Usa la IA como un profesional

Web en español, de teoría y práctica, sobre cómo usar LLMs (Claude, GPT, Gemini) de forma óptima en el trabajo: metodología, prompting, modelo y esfuerzo, tokens, herramientas y reparto de tareas entre agentes. Construida con [Astro](https://astro.build) + [Starlight](https://starlight.astro.build) (MDX) e islas React para los interactivos.

Publicada en <https://edunagore.github.io/AI-Optimized_Usage_Web/>.

## Arrancar

Requiere Node 24 y npm.

```bash
npm ci
npm run dev        # http://localhost:4321/AI-Optimized_Usage_Web/
```

| Comando                             | Qué hace                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run build` / `npm run preview` | Build estático en `dist/` (valida los datos con zod) y vista previa                        |
| `npm run check`                     | Tipos, eslint, prettier, vitest, enlaces internos de `dist/` (exige build previo) y cspell |
| `npm run test:e2e`                  | Playwright + axe. La primera vez: `npx playwright install chromium`                        |
| `npm run freshness [-- --offline]`  | Registros con `verifiedAt` de más de 45 días y fuentes que no responden                    |

## Estructura

- `src/content/docs/`: páginas MDX, una carpeta por módulo.
- `src/data/*.json`: datos volátiles (modelos, precios, esfuerzo, comandos, límites…). Esquemas en `src/lib/schemas.ts`.
- `src/lib/`: lógica pura de los interactivos, con tests. `src/components/`: componentes e islas React.
- `plan/`: plan maestro, temario, hechos verificados, diseño y `PROGRESO.md`.
- `research/`: extractos con cita producidos por la investigación.

## Cómo actualizar datos

Ningún dato volátil se escribe a mano en una página: vive en `src/data/*.json` y la página lo muestra con un componente. Actualizar el sitio es editar datos.

1. `npm run freshness` para ver qué ha caducado.
2. Abre la fuente oficial del registro (campo `source` → `src/data/sources.json`) y compara valor, unidad y condiciones.
3. Edita el JSON: corrige el valor y pon `verifiedAt` con la fecha (AAAA-MM-DD) de la consulta.
4. `npm run build && npm run check`. Si el esquema no valida, el build falla.
5. Anota en `plan/PROGRESO.md` lo que cambió y por qué, sobre todo si una fuente oficial contradecía al plan.

Protocolo completo (solo fuentes oficiales, cita por dato, qué hacer con conflictos y con lo no confirmado) en [`plan/02_HECHOS_VERIFICADOS.md`](plan/02_HECHOS_VERIFICADOS.md) §1. Rutina de mantenimiento en [`docs/MANTENIMIENTO.md`](docs/MANTENIMIENTO.md).

## Despliegue

`.github/workflows/deploy.yml` construye, ejecuta `npm run check` y publica `dist/` en GitHub Pages con cada push a `main` (o a mano desde la pestaña Actions). `site` y `base` están en `astro.config.mjs` (`https://edunagore.github.io` y `/AI-Optimized_Usage_Web`); si cambia el nombre del repo o del usuario, cámbialos ahí.

Activación única: en el repositorio, _Settings → Pages → Build and deployment → Source: GitHub Actions_.
