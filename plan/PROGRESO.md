# Progreso

> Memoria entre sesiones. Actualízalo al cerrar cada tarea: qué se hizo, qué falta, decisiones con su motivo y coste de la fase.

## Estado actual
- **Fase en curso:** 1 (sin empezar). La Fase 0 está cerrada.
- **Rama:** `feat/web`
- **Última actualización:** 2026-10-15 (Fase 0 completada)

## Fases
- [x] 0. Preparación (2026-10-15: `npm run build`, `npm run check` y `npm run test:e2e` pasan)
- [ ] 1. Investigación y verificación (punto de control 1)
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

## Conflictos entre fuentes y datos pendientes
| Dato | Fuentes | Estado |
|---|---|---|
| `sources.json`: `lastChecked` = 2026-10-15 sin haber vuelto a abrir las URLs | `02_HECHOS_VERIFICADOS.md` §2 | Las URLs se heredan del plan. Comprobarlas con `npm run freshness` y en la Fase 1 |
| Avisos benignos de Astro en el build: «Entry docs → 404 was not found» y `No items found` en los JSON vacíos | — | Desaparecen al añadir datos (Fase 1) y al personalizar la 404 (Fase 2) |

## Coste por fase (según `/usage`)
| Fase | Tokens / coste | Notas |
|---|---|---|
| 0 | _pendiente de anotar por el usuario con `/usage`_ | |

## Pendientes y siguientes pasos
- Fase 1: lanzar los cinco `investigador` con el encargo de `plan/04_PROMPTS_DE_FASE.md`.
- Si no existe el repo remoto o hay que subir la rama, pedir confirmación (no se ha hecho push).
- `npm audit` marca 10 vulnerabilidades moderadas en dependencias de desarrollo/transitivas; revisar antes de publicar (Fase 6).
