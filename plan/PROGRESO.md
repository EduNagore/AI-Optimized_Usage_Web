# Progreso

> Memoria entre sesiones. Actualízalo al cerrar cada tarea: qué se hizo, qué falta, decisiones con su motivo y coste de la fase.

## Estado actual
- **Fase en curso:** 3 (contenido núcleo): M2 redactado, revisado y corregido; M3 redactado y revisado, con las correcciones de la revisión **a medias** (sesión interrumpida por el usuario); quedan M4, M5 y M0. Fases 0–2 cerradas (puntos de control 1 y 2 pendientes de confirmación del usuario).
- **Rama:** `feat/web`
- **Última actualización:** 2026-10-16 (Fase 2 completada, pendiente de confirmación del usuario: capturas, nombre del sitio y decisiones de diseño)

## Fases
- [x] 0. Preparación (2026-10-15: `npm run build`, `npm run check` y `npm run test:e2e` pasan)
- [x] 1. Investigación y verificación (2026-10-16; punto de control 1 pendiente de confirmación del usuario)
- [x] 2. Diseño y arquitectura (2026-10-16; punto de control 2 pendiente de confirmación del usuario)
- [ ] 3. Contenido núcleo: M2 ✔ (2026-10-16), M3 (redactado; correcciones pendientes), M4, M5, M0
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
| 2026-10-16 | IBM Plex Sans (variable) + IBM Plex Mono, solo subconjunto latino, @font-face propio en `src/styles/fonts.css`; se retira Inter | Es la primera opción de `03_DISENO.md`, con cifras tabulares y buena cobertura del español. Fontsource solo publica CSS con todos los alfabetos; el propio evita descargas innecesarias |
| 2026-10-16 | Tokens en `src/styles/tokens.css`, mapeo a `--sl-*` en `theme.css`; `tests/tokens.test.ts` valida contrastes AA en ambos temas y que los dos bloques oscuros sean idénticos | El diseño exige AA «comprobado en ambos temas»: queda como puerta automática |
| 2026-10-16 | Acento único: verde azulado (#0b6767 claro, #52bfb9 oscuro); semánticos verde/acento/azul/ámbar/rojo/gris con icono y texto | `03_DISENO.md` §3 |
| 2026-10-16 | La barra lateral no numera los módulos (sin «M2»); los módulos se llaman por su nombre. El orden y los nombres viven en `src/lib/modules.ts` | Evita las etiquetas numeradas de la lista de «evitar». Se puede revertir |
| 2026-10-16 | Esqueleto: 89 páginas + 13 índices de módulo («Visión general»), todas con `status: en-preparacion`, `level`, `tracks`, `readingTime` provisionales | Fija la barra lateral. El aviso «En preparación» sale del layout (override de `PageTitle`), no del cuerpo: al terminar una página basta quitar `status` |
| 2026-10-16 | Rutas: Esencial = 7 páginas (≈ 45 min); Profesional 67; Técnica 82. Asignación provisional | La ruta Profesional casi coincide con todo el sitio: recalibrar en la Fase 3 al redactar |
| 2026-10-16 | Overrides de Starlight: `PageTitle` (título, entradilla, metadatos, aviso) y `Footer` (fuentes y última revisión). El pie sale del frontmatter `sources` / `lastReviewed` | Una sola plantilla para todas las lecciones |
| 2026-10-16 | Los componentes que no deben heredar el estilo Markdown de Starlight llevan la clase `not-content` | Convención oficial de Starlight; evita márgenes y tablas con `display:block` heredados |
| 2026-10-16 | `<Fact>` usa `<modelo>.<ruta>` (p. ej. `sonnet-5-5.pricing.input`), no el prefijo `claude-` del plan; falla el build si el dato no existe. Tooltip fijo abajo en pantalla (no anclado) | Los ids de `models.json` no llevan el prefijo; un tooltip anclado desbordaba la página en móvil |
| 2026-10-16 | Diagramas con dos dibujos del mismo contenido (anillo ≥ 520 px, columna en móvil), conmutados con una consulta de contenedor | Un único SVG a 360 px dejaba el texto en ≈ 8 px |
| 2026-10-16 | `src/content.config.ts`: las colecciones de datos se declaran una a una | Con `Object.fromEntries` se perdía el tipo de cada registro en `getCollection()` (`astro check` fallaba) |
| 2026-10-16 | `rollupOptions.onwarn` ignora `MODULE_LEVEL_DIRECTIVE` | Astro inserta `use astro:head-inject` en cada módulo de contenido: 105 avisos de ruido interno |
| 2026-10-16 | `src/content/docs/m12-recursos/catalogo-de-componentes.mdx` es una lección de ejemplo con todos los componentes | Referencia para los redactores. Hay que ocultarla (`sidebar.hidden`) o retirarla antes de publicar |
| 2026-10-16 | `<CostExample>` (nuevo componente) calcula coste por intento, por volumen y con Batch desde `models.json` y `pricing-rules.json` | La revisión halló costes derivados escritos a mano en `coste-por-tarea`; ahora se actualizan con los datos |
| 2026-10-16 | `sources.json`: añadidas 5 guías (prompting de Opus/Sonnet/Haiku/Fable 5.x y OpenAI) y títulos legibles para las ≈80 fuentes autogeneradas | Los redactores citaban «overview» o páginas sustitutas; el lector debe poder llegar a la fuente real |
| 2026-10-16 | `PromptTemplate` no antepone `# Título` al descargar si el texto empieza por `---` | Si no, un SKILL.md descargado no era válido |
| 2026-10-16 | `src/content/plantillas/*.md` (25 ficheros) en `.prettierignore`; sin ruta pública todavía | Son texto de plantilla con huecos; se publicarán en M12 «Plantillas descargables» (Fase 4) |
| 2026-10-16 | `cspell-project.txt`: añadidos clíticos y etiquetas de plantilla sin tilde | Falsos positivos de M2/M3 |
| 2026-10-16 | `e2e/smoke.spec.ts` reescrito: axe en claro y oscuro sobre cinco páginas, sin desbordamiento horizontal a 360 px, tooltip de `<Fact>`, lista de comprobación y quiz | La página de prueba `prueba/hola` ya no existe |

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

## Datos que corregir antes de publicar (detectados en la Fase 2)
- `changelog.json`: varios `summary` arrastran notas del proceso de investigación («Dato tomado de un resultado de búsqueda…; no leído directamente»). La portada solo muestra la primera frase, pero hay que limpiarlos en la Fase 3 al redactar `impact`.
- `task-matrix.json` y `glossary.json` siguen vacíos (aviso benigno del build). Se rellenan en las Fases 3 y 4 (matriz de M4, glosario de M0).
- Avisos del build que quedan: «No items found» (los dos JSON anteriores) y «Could not render /404 … conflicts with higher priority route» (por `404.mdx` propio; la página sale bien).
- Faltan `FeatureMatrix`, `TaskMatrix` y `CommandExplorer` (Fases 3–5). `Quiz` es solo la carcasa (sin progreso guardado).
- En móvil el nombre actual del sitio solo cabe en la cabecera reduciéndolo a 14 px; un nombre más corto lo resolvería (ver propuestas del punto de control 2).

## Coste por fase (según `/usage`)
| Fase | Tokens / coste | Notas |
|---|---|---|
| 0 | _pendiente de anotar por el usuario con `/usage`_ | |
| 2 | _pendiente de anotar por el usuario con `/usage`_ | Sin subagentes: sesión principal (Sonnet 5.5, esfuerzo high) |
| 1 | _pendiente de anotar por el usuario con `/usage`_ | 5 investigadores (Haiku, ≈1,0 M tokens de subagente en total: 152K + 100K + 123K + 297K + 306K) y 3 verificadores (Opus, ≈0,45 M: 222K + 84K + 140K) |

## Pendientes de Fase 3 (M2 y M3)
- **Retomar M3 (primera tarea):** el redactor se detuvo a mitad de aplicar las 20 correcciones de la revisión editorial. Hay ediciones parciales en `src/content/docs/m3-prompting/` (el build y `npm run check` pasan). Falta comprobar página a página, y volver a pasar el revisor, estos puntos: (1) prellenado/error 400 sin fuente: quitar o verificar con `whats-new-claude-4-6`, y nunca con `tipo="verificado"`; (2) callout «Dos filas son datos de la API» de `que-ha-cambiado` no cuadra con la tabla; (3) citar en `sources` las 5 guías nuevas; (4) `notas-por-modelo`: no citar «el temario»; verificar o retirar lo de Sonnet literal, Opus frontend y Fable; idea clave de Haiku; orden de ajuste contexto → esfuerzo → redacción; Astra con cita; (5) `principios`: callout de Google mal etiquetado, «ocho principios de la guía oficial», rol; (6) `contexto-largo`: `<pasted_content>` es técnica de la guía, no del sistema; (7) `tareas-largas-y-agentes`: causa de la reducción de un tercio (no lanzar subagentes revisores a `max`) y «puede no preguntarte»; (8) valores por defecto de esfuerzo solo con `<Fact>`; (9) plantilla de `contexto-largo` con `{{ contenido }}` distinta de su `.md`; (10) quitar la frase de «Plantillas descargables» en `biblioteca`; (11) ejemplos de huecos rellenos reales; (12) quitar referencias a «Fase 5»; (13) sección de ejemplo en `notas-por-modelo` y distintivo «varía según el proveedor» en `que-ha-cambiado`; (14) enlazar referencias sueltas a módulos. Detalle completo: el informe del revisor se perdió con la sesión; relanzar `revisor-editorial` sobre `m3-prompting/` y comparar con esta lista.
- M2: correcciones de la revisión aplicadas (coste por tarea con `<CostExample>`, criterios de superficie, ciclo, errores). Falta solo ver el resultado final en el navegador tras los cambios.
- `task-matrix.json` vacío: `taxonomia-de-tareas` lleva un comentario PENDIENTE y enlaza a M4 «matriz por tarea».
- `elegir-superficie` no muestra planes de Cowork/Proyectos desde datos: falta un componente `FeatureMatrix` (Fase 5) para `features.json` y `pricing-rules.json`.
- Datos candidatos a `features.json`: structured outputs (`output_config.format`), prellenado, nombres de parámetro (`thinking_level`, `between_tools`) y niveles de `reasoning.effort`. Ver informe final del redactor de M3.
- Sin verificar con fuente literal: prellenado → error 400 (retirado o marcado), citas de OpenAI y Google procedentes de resúmenes (marcadas «pendiente»).
- `laboratorio-antes-despues` es estático (`BeforeAfter`); el `PromptLab` interactivo es de la Fase 5.
- M5 «orden de las palancas» y `medir` deben mantener los slugs enlazados desde M2 (`coste-por-tarea`, `ciclo-de-7-pasos`).
- Glosario (`glossary.json`): términos acumulados en M2/M3: superficie, effort, ventana de contexto, proyecto, agente, Cowork, skill, CLAUDE.md/AGENTS.md, batch, coste por tarea completada, contexto limpio, criterio de éxito, structured outputs, prellenado, few-shot, rúbrica, etiquetas XML, SPEC.md. Se rellena en M0.

## Pendientes y siguientes pasos
- Tras el punto de control 2: elegir el nombre del sitio (cambiar `title` en `astro.config.mjs` y en `index.mdx`), confirmar o ajustar la dirección visual y empezar la Fase 3 (M2 → M3 → M4 → M5 → M0).
- Verificar al redactar: valores del resumen de `claude-code.json` que no entran en `src/data/` (hooks, skills, límites de flujos, rutinas). Están en `research/claude-code.json` con cita.
- Si no existe el repo remoto o hay que subir la rama, pedir confirmación (no se ha hecho push).
- `npm audit` marca 10 vulnerabilidades moderadas en dependencias de desarrollo/transitivas; revisar antes de publicar (Fase 6).
