# Progreso

> Memoria entre sesiones. Actualízalo al cerrar cada tarea: qué se hizo, qué falta, decisiones con su motivo y coste de la fase.

## Estado actual
- **Fase en curso:** 1 (hecha, a la espera del punto de control 1). La Fase 0 está cerrada.
- **Rama:** `feat/web`
- **Última actualización:** 2026-10-16 (Fase 1 completada, pendiente de confirmación del usuario)

## Fases
- [x] 0. Preparación (2026-10-15: `npm run build`, `npm run check` y `npm run test:e2e` pasan)
- [x] 1. Investigación y verificación (2026-10-16; punto de control 1 pendiente de confirmación del usuario)
- [ ] 2. Diseño y arquitectura (punto de control 2)
- [ ] 3. Contenido núcleo: M2, M3, M4, M5, M0
- [ ] 4. Contenido avanzado: M7, M8, M6, M9, M10, M1, M12
- [ ] 5. Interactivos
- [ ] 6. Calidad final (punto de control 3)
- [ ] 7. Publicación y mantenimiento

## Decisiones
| Fecha | Decisión | Motivo |
|---|---|---|
| 2026-10-15 | TypeScript 6.0.3 y no 7.0.2 | `@astrojs/check` 0.9.10 declara peer `typescript ^5 \|\| ^6`; con 7 `npm i` falla. Revisar cuando `@astrojs/check` lo admita |
| 2026-10-15 | `overrides: { "playwright-core": "1.63.0" }` | `@axe-core/playwright` arrastraba playwright-core 1.64.1 (publicada hace <2 semanas), con tipos incompatibles con `@playwright/test` 1.63.0 |
| 2026-10-15 | Versiones exactas = última estable publicada antes del 2026-10-01 | Regla del plan: evitar versiones de menos de dos semanas (astro 7.3.5, starlight 0.42.4, react 19.3.0, zod 4.6.5, vitest 5.0.3, eslint 10.11.0, prettier 3.9.9, playwright 1.63.0, cspell 10.3.6) |
| 2026-10-15 | Esquemas en `src/lib/schemas.ts` e importados de `astro/zod`; una colección por fichero con el loader `file()` | Un único sitio para validar; `tests/data.test.ts` además comprueba ids únicos y que `source` exista en `sources.json` |
| 2026-10-15 | cspell solo sobre `src/content`, `src/data` y `README.md` | Los ficheros de `plan/` son instrucciones con imperativos enclíticos y generan cientos de falsos positivos. Diccionario `@cspell/dict-es-es` + `cspell-project.txt` |
| 2026-10-15 | Añadidos `src/content/docs/index.mdx` y `public/favicon.svg` provisionales | Sin ellos el comprobador de enlaces marca como rotos `/` y el favicon. La Fase 2 los sustituye; `prueba/hola.mdx` se elimina entonces |
| 2026-10-15 | `scripts/seed-sources.mjs` conservado | Documenta cómo se sembró `sources.json` (46 fuentes de `02_HECHOS_VERIFICADOS.md` §2). No volver a ejecutarlo: sobrescribe el fichero |
| 2026-10-16 | Fusión reproducible con `scripts/merge-research.mjs` (lee `research/*.json`, escribe `src/data/`) | Corregir un dato = editar el script (que lleva las correcciones del verificador) y regenerar. Restaurar antes `src/data/sources.json` con `git checkout`, porque el script le añade fuentes |
| 2026-10-16 | `sinceVersion` de comandos eliminado | El verificador halló que la versión extraída era de subfunciones o de cambios de comportamiento (8 de 35 en la muestra). Mejor sin dato que con dato dudoso |
| 2026-10-16 | Fuera de `models.json`: Opus 4.5 y Mythos 5 | Opus 4.5 es heredado (retirada no antes de 2026-11-24) y Mythos 5 es de acceso limitado. Decisión editorial; reversible |
| 2026-10-16 | `changelog.json`: `impact` provisional («Pendiente de redactar en la Fase 3») | Los investigadores aportan hechos, no valoración de impacto; se redacta al escribir las páginas |
| 2026-10-16 | Ids de fuentes nuevas autogenerados desde la URL | Las 46 sembradas conservan su id; las demás (≈85) cubren los enlaces de las novedades |

## Conflictos entre fuentes y datos pendientes
| Dato | Fuentes | Estado |
|---|---|---|
| `sources.json`: `lastChecked` de las 46 fuentes sembradas | `02_HECHOS_VERIFICADOS.md` §2 | Los investigadores y verificadores abrieron casi todas; falta pasar `npm run freshness` (Fase 6) |
| Línea base corregida: lectura de caché de Sonnet 5.5 (0,20 → 0,10 $/MTok, nota de versión 2026-10-07) | Línea base §3.1 vs. pricing.md | Corregido en datos |
| Línea base corregida: programmatic tool calling «24 % menos de tokens» → 38 % (benchmark de 75 herramientas) y 20–40 % (10–49 herramientas) | §3.4 vs. documentación | Corregido |
| Línea base corregida: Batch sí admite herramientas (incl. server tools); límite 100.000 peticiones o 256 MB | §3.4 vs. batch-processing | Corregido |
| Mediciones de coste: `medium` NO igualó a `high` en Sonnet 5.5 (−7 puntos al ~59 % del coste); «low y repetir fallos en high» ahorra ~40 %, no «más de la mitad» | §3.5 vs. optimizing-for-cost | Corregido; reescribir §3.5 al redactar M5 |
| `/effort ultracode`: desde v2.1.284 mantiene el nivel actual (la línea base decía que fija `xhigh`) | §3.2 vs. changelog | Corregido en el investigador; no está en datos aún |
| `CLAUDE_CODE_SUBAGENT_MODEL`: desde v2.1.251 es valor por defecto y no sobrescribe `model:` del subagente | §3.6 vs. changelog | Anotado |
| Haiku 5.5 por defecto: lo es en la API de Anthropic (v2.1.293), no el modelo por defecto de Claude Code (que es Opus 5.5) | §3.1 vs. changelog / model-config | Corregido |
| Fable 5: «legacy» en overview y «activo» en deprecaciones | models/overview vs. model-deprecations | Resuelto: Active (legacy), retirada no antes de 2027-06-09 |
| Sonnet 5: fin del precio 2/10 (pricing.md «31 de agosto» vs. nota de versión 2026-08-10) | Dos páginas oficiales | Sin resolver; irrelevante hoy (la subida no se aplicó) |
| `/skill-doctor`: v2.1.252 (commands.md) vs. v2.1.261 (changelog); `/design`: v2.1.265 vs. v2.1.234 | Dos páginas oficiales | Sin resolver; no se publica versión |
| Gemini CLI: sustituida por Antigravity CLI (`agy`) para AI Pro, Ultra y Code Assist individual desde 2026-06-18; sigue con Code Assist Standard/Enterprise y claves de pago | Blog de Google Developers (2026-05-19) vs. geminicli.com (v0.64.0) | No hay contradicción real; ambas ciertas |
| Memoria de Claude: activa por defecto en Free (nota 2026-03-02); búsqueda en chats anteriores solo en planes de pago | Notas de versión vs. ayuda | Resuelto: son funciones distintas |
| Gemini 3.8 Flash `thinking_level` por defecto: `medium` (whats-new-gemini-3.8); la guía de Gemini 3 está deprecada y se contradice | Dos páginas de Google | Resuelto a favor de la actual |
| GPT-5.6 Sol 4/20 $ es precio promocional (al menos hasta 2026-11-21) | changelog de OpenAI | Anotado en `models.json` |

**No confirmado (no se publica como dato):** reparto por plan y fecha de GPT-6 en ChatGPT (help.openai.com da 403); esfuerzo por defecto de GPT-6 Astra; niveles de esfuerzo de GPT-5.6 Terra y Luna; lista completa de comandos de la CLI de Codex; precios en euros de la app de Gemini y de AI Pro en USD; precios de planes de Claude (claude.com/pricing, lectura automatizada); límites numéricos de Research y de proyectos; umbral de compactación de 150K y datos de Vision (28×28 px); cifra «2 de 20 problemas = 43 % del gasto»; modelos que admiten razonamiento adaptativo (la URL redirige); semanas 31 y 38–42 de whats-new (el índice acaba en la 37).

**Pendientes menores del verificador (no aplicados):** `/privacy-settings` solo Pro y Max; alias `/reset` y `/new` de `/clear`; matices de memoria en Team/Enterprise (desactivada por miembro, no con HIPAA ni CMEK). `features.json` fila `codex-surfaces`: fuente genérica.
| Avisos benignos de Astro en el build: «Entry docs → 404 was not found» y `No items found` en los JSON vacíos | — | Desaparecen al añadir datos (Fase 1) y al personalizar la 404 (Fase 2) |

## Coste por fase (según `/usage`)
| Fase | Tokens / coste | Notas |
|---|---|---|
| 0 | _pendiente de anotar por el usuario con `/usage`_ | |
| 1 | _pendiente de anotar por el usuario con `/usage`_ | 5 investigadores (Haiku, ≈1,0 M tokens de subagente en total: 152K + 100K + 123K + 297K + 306K) y 3 verificadores (Opus, ≈0,45 M: 222K + 84K + 140K) |

## Pendientes y siguientes pasos
- Fase 2 (tras confirmar el punto de control 1): diseño y arquitectura.
- Verificar al redactar: valores del resumen de `claude-code.json` que no entran en `src/data/` (hooks, skills, límites de flujos, rutinas). Están en `research/claude-code.json` con cita.
- Si no existe el repo remoto o hay que subir la rama, pedir confirmación (no se ha hecho push).
- `npm audit` marca 10 vulnerabilidades moderadas en dependencias de desarrollo/transitivas; revisar antes de publicar (Fase 6).
