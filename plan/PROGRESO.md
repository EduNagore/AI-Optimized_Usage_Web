# Progreso

> Memoria entre sesiones. Actualízalo al cerrar cada tarea: qué se hizo, qué falta, decisiones con su motivo y coste de la fase.

## Estado actual
- **Fase en curso:** 5 (interactivos) **terminada**: los nueve interactivos están integrados en sus páginas y comiteados. Siguiente: Fase 6 (calidad final). Puntos de control 1 y 2 siguen pendientes de confirmación del usuario.
- **Rama:** `feat/web`
- **Última actualización:** 2026-10-19 (Fase 5: `npm run build`, `npm run check` (671 tests) y `npm run test:e2e` (106 pruebas) pasan; cada isla revisada en navegador con teclado, 360 px y claro/oscuro)

## Fases
- [x] 0. Preparación (2026-10-15: `npm run build`, `npm run check` y `npm run test:e2e` pasan)
- [x] 1. Investigación y verificación (2026-10-16; punto de control 1 pendiente de confirmación del usuario)
- [x] 2. Diseño y arquitectura (2026-10-16; punto de control 2 pendiente de confirmación del usuario)
- [x] 3. Contenido núcleo: M2, M3, M4, M5, M0 (2026-10-16)
- [x] 4. Contenido avanzado: M7, M8, M6 + M9, M10, M1 + M12 (2026-10-19)
- [x] 5. Interactivos (2026-10-19)
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
| 2026-10-16 | Regla de partida única: «modelo capaz y su esfuerzo por defecto; bajar midiendo; subir si falla» (M0 regla 3, M4) | La revisión mostró que «bajo o medio» contradecía la guía oficial (`choosing-a-model`, empezar por el esfuerzo por defecto) y la tesis (bajar es un compromiso medido) |
| 2026-10-16 | Nuevos componentes: `TaskMatrix` (lee `task-matrix.json`, con fuentes enlazadas), `GlossaryList` (lee `glossary.json`, 51 términos), `ModelTable detalle`, `CostExample cacheados/batch` | Sustituyen tablas y cifras escritas a mano |
| 2026-10-16 | `task-matrix.json` (17 filas) y `glossary.json` rellenados desde `research/*-propuesta.json` | Las propuestas las escriben los redactores; solo la sesión principal toca `src/data/` |
| 2026-10-16 | Corregido el error de la línea base sobre prellenado: 400 en Opus 4.6+ (guía de migración a Opus 5.5), no «modelos 4.6 y posteriores» en general; `plan/02` actualizado | Verificado con la fuente oficial |
| 2026-10-16 | `tool_choice` e imágenes invalidan solo los mensajes de la caché (no sistema); corregido en `research/anthropic-api.json` | Revisión de M5 contra la documentación oficial |
| 2026-10-16 | e2e: axe en claro/oscuro y 360 px sobre una lección de M0, M2, M3, M4 y M5 (43 pruebas); espera a hidratar la isla del quiz | La prueba del quiz era una carrera de hidratación con `client:visible` |
| 2026-10-16 | `e2e/smoke.spec.ts` reescrito: axe en claro y oscuro sobre cinco páginas, sin desbordamiento horizontal a 360 px, tooltip de `<Fact>`, lista de comprobación y quiz | La página de prueba `prueba/hola` ya no existe |

| 2026-10-19 | Fase 4: circuito por módulo = redactor (Sonnet) → revisor-editorial (Opus) → corrección por el mismo redactor → integración (fuentes en `sources.json`, prettier, cspell, build, check) | Es el mismo de la Fase 3; los subagentes no tenían Bash, así que la sesión principal validó cada entrega |
| 2026-10-19 | Cifras volátiles sin registro en `src/data` (límites, líneas de `CLAUDE.md`, TPM/RPM, retención, modos de permiso, atajos, opciones de `claude -p`, multiplicadores de caché) se quedan en prosa con fuente enlazada y fecha visibles | `<Fact>` solo lee `models.json`. Deuda reconocida: faltan `<Rule>` / `FeatureMatrix` (ver «Pendientes tras la Fase 4») |
| 2026-10-19 | Componentes nuevos: `CommandList` (comandos por categoría, estático; lo sustituye el explorador de la Fase 5), `diagrams/FlujoAgentes` (9 diagramas de M8 y la escalera), `PlantillasList`, `NovedadesList` (filtro por proveedor), `SourcesIndex`; `CostExample` acepta `unidad` | Las páginas de M7, M8 y M12 los necesitaban. `ModuleIndex` ya no lista páginas con `sidebar.hidden` |
| 2026-10-19 | Endpoint `src/pages/plantillas/[slug].md.ts` publica los 25 `.md` de `src/content/plantillas/`; `tests/templates.test.ts` exige que cada `<PromptTemplate archivo="x">` coincida con `x.md` | El revisor halló dos versiones distintas de «Encargo universal» con el mismo nombre de fichero. Texto canónico: el de M2 (material primero) |
| 2026-10-19 | `astro.config.mjs`: script que da `tabindex=0` a los bloques de código con desplazamiento | axe `scrollable-region-focusable` en M9, M10 y la chuleta |
| 2026-10-19 | Sonnet 5.5 no tiene el razonamiento «siempre activo»: `thinking: {type: "between_tools"}` en low/medium/high (400 en xhigh/max); Haiku 5.5, `disabled` hasta high; Opus 5.5 no se puede apagar; Fable 5.1 siempre activo. Corregidos el temario, `effort.json` y M4 | El temario y la línea base discrepaban; ganan `models.json` y la documentación |
| 2026-10-19 | Tokenizador: «aproximadamente +30 %» (documentación actual) en lugar de «1×–1,35×» del temario; 1280×720 ≈ 1.196 tokens (fórmula de la documentación) | Corregido en `plan/01_TEMARIO.md` |
| 2026-10-19 | Chuleta: una hoja a doble cara (temario corregido: antes «una página»); fechas sin escribir a mano | Cabe en ≈2 A4 sin lista de comprobación ni columna de enlaces |
| 2026-10-19 | Retiradas del changelog «Plan Pro 500 USD» (precio de plan sin fuente oficial) y notas de proceso en dos `summary`; añadidas 30 fuentes a `sources.json` (Codex, Antigravity, Gemini CLI, Claude Code, API) y títulos legibles | La lista de novedades publica el `summary` completo |
| 2026-10-19 | `M1`: `que-es-un-llm` y `ventana-de-contexto` pasan a la ruta Esencial | El índice de M1 lo promete para quien tiene diez minutos |
| 2026-10-19 | Fase 5, infraestructura escrita por la sesión principal antes de delegar: `src/lib/pricing.ts` (catálogo de precios, `unitPricesFor` con tramos largos y cambios programados, TTL de caché, Batch), `src/lib/storage.ts` (localStorage con try/catch), `src/lib/data-access.ts` (carga de colecciones para los envoltorios `.astro`), `interactive.css` y `shared.tsx` (`Field`, `SourceFooter`) | Las islas React no pueden importar `astro:content`: el envoltorio `.astro` carga los datos y los pasa como props. Una sola fuente de precios para calculadora y simulador |
| 2026-10-19 | Nuevo `src/data/model-pricing-details.json` (22 registros, colección registrada con `modelPricingDetailSchema`): descuento de Batch, mínimo y TTL de caché, tramo de contexto largo (Haiku 5.5 >100K; OpenAI >272K = 2× entrada y caché, 1,5× salida) y cambios de precio programados (Gemini 4 Argon desde 2026-12-01, Gemini 3.8 Flash desde 2027-01-01) | `models.json` no puede expresar tramos ni mínimos y lo genera `merge-research.mjs`: un fichero aparte evita que una regeneración lo pise. Valores tomados de las notas ya verificadas; un test cruza los tramos de OpenAI con las notas |
| 2026-10-19 | Datos editoriales de los interactivos en ficheros propios importados directamente (no son colecciones): `prompt-lab.json`, `quizzes.json`, `selector-rules.json`, `context-scenarios.json`, `agent-topologies.json`, `maturity.json`. Cada esquema vive en su `src/lib/<nombre>.ts`, su test valida el JSON y el envoltorio lo valida en el build | Cada subagente es dueño de sus datos sin tocar ficheros compartidos; un dato incoherente rompe el build |
| 2026-10-19 | Todas las islas llevan `not-content` en la raíz; el script de `astro.config.mjs` da `tabindex=0` también a las tablas Markdown con desplazamiento | axe `scrollable-region-focusable` en la tabla de la página del selector a 360 px y en las tablas de las islas |
| 2026-10-19 | `CommandExplorer` sustituye a `CommandList` en M7 (`CommandList.astro` queda sin uso). `tokenImpact` no existe en ningún registro: el filtro se oculta y aparecerá solo cuando haya datos | No se inventa un dato que falta |
| 2026-10-19 | Los subagentes de la Fase 5 no ejecutaron build ni Playwright (comparten `dist/` y `.astro/`): la sesión principal compiló, probó cada isla en navegador y comiteó por componente. Un límite de uso interrumpió a los nueve agentes lanzados a la vez; se reanudaron con `SendMessage` y retomaron su trabajo | Para otras fases: lanzar como mucho 4–5 agentes de esfuerzo alto a la vez |
| 2026-10-19 | Supuestos de la guía editables y etiquetados en pantalla: simulador de caché (entrada disponible tras 5 s; separación igual al TTL cuenta como acierto), visualizador de contexto (tamaños de partida, resumen de `/compact` de 3.000 tokens, 15 % de herramientas MCP con carga diferida), diseñador de equipos (umbrales «cabe en un contexto» = 50 % de la ventana y «hay volumen» = 5 unidades; multiplicadores estructurales como estimación), diagnóstico (niveles 12/24/36 y áreas 33 %/66 %) | Nada de esto es dato de proveedor y no se presenta como tal |
| 2026-10-19 | e2e nuevo `e2e/interactivos.spec.ts`: axe en claro y oscuro, 360 px y una prueba funcional por cada isla (35 pruebas; total 106) | Las islas son lo más propenso a regresiones de accesibilidad |

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

## Pendientes tras la Fase 3
- **Revisión por fases posteriores:** los enlaces de M0 (glosario, reglas) a páginas de M6–M9 que aún son esqueleto deben comprobarse al redactarlas (`skills`, `conectores-y-mcp`, `ficheros-de-instrucciones-y-memoria`, M7, `m8-agentes/patrones`, `escalera-de-complejidad`, M9). Definiciones del glosario sin cita directa: `auto-mode`, `plan-mode`, `hook`, `worktree`, `cowork`, `ttl`.
- **Datos sin componente (están en prosa con cita; riesgo para `freshness`):** reglas de `pricing-rules.json` (multiplicadores de caché, mínimos cacheables, reglas de OpenAI y Google), niveles y parámetros de `effort.json`, `features.json` (planes de Cowork/Proyectos). Falta un componente `<Rule>` / `FeatureMatrix` / tabla de equivalencias de esfuerzo (Fase 5 o antes).
- **Candidatos a `features.json`:** structured outputs (`output_config.format`), esfuerzo por mensaje (cabecera `mid-conversation-output-config-2026-07-01`), `opusplan`, `/fast`, herramienta asesor (beta 2026-04-09), fast mode de Opus 5.5 (fuera de vista previa 2026-10-15), `ultracode`, compactación bajo demanda y por umbral, context editing, tool search/`defer_loading`, programmatic tool calling, `prompt_cache_options.ttl` y `configuration_update` de OpenAI, caché implícita de Gemini, `promptCacheTtl` y línea «Prompt cache» de `/usage` en Claude Code.
- **Sin verificar con fuente literal (marcado en el texto):** citas de OpenAI y Google procedentes de resúmenes; prellenado → 400 solo verificado en Opus 4.6+ (no Sonnet/Haiku/Fable); `budget_reached` (¿Messages API o Managed Agents?); modelos con esfuerzo por mensaje; «herramientas con parámetros estrechos» (recomendación sin cita); tokens por imagen, Files API, `stop_sequences` por proveedor, lotes de Google, límites por plan de ChatGPT/Gemini.
- ~~Interactivos pendientes~~: hechos en la Fase 5 (ver «Pendientes tras la Fase 5»).
- Quizzes de cierre de módulo: ninguno de M0–M5 lo lleva todavía.
- `ultrathink` verificado (model-config); entrada de «pendiente» en `research/claude-code.json` por retirar.
- M2 `elegir-superficie` no muestra planes de Cowork/Proyectos desde datos (falta `FeatureMatrix`).
- Plantillas descargables: los 25 `.md` de `src/content/plantillas/` se publicarán en M12 (Fase 4).

## Pendientes tras la Fase 4
- **Deuda de datos (regla del proyecto):** pasar a `src/data` y mostrar con componente (`<Rule>`, `FeatureMatrix`): reglas de `pricing-rules.json` (multiplicadores, imagen, +30 % del tokenizador), planes y funciones de las apps (Claude, ChatGPT, Gemini), TPM/RPM, retención y ZDR, rutas de `managed-settings.json`, modos de permiso y atajos, opciones de `claude -p`, límites de `/loop`, `/goal` y MCP, 200 líneas de `CLAUDE.md`, rutas de skills de Codex. Candidatos con cita en `research/m1…m12-propuesta.json`.
- **Sin verificar con fuente literal (marcado en las páginas):** modelo de los trabajadores de `/batch` y `/deep-research`; `CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL`; guía de orquestación multiagente de la Responses API; structured outputs dentro de un lote; esfuerzo configurable en apps de chat y en rutinas; reglas `Bash(...)` frente a la herramienta PowerShell; mensajes de sistema a mitad de conversación en Opus 5.5/Sonnet 5.5/Fable 5.1; `task_budget` y despliegues programados de Managed Agents; Cowork en la nube (6-oct); GPT-6 por plan de ChatGPT; funciones de la app de Gemini por plan (tabla leída por columnas); retención de las apps de chat de los tres proveedores.
- **Hueco aceptado del temario:** novedades sin lección propia (mensajes de sistema a mitad de conversación, llamadas asíncronas de OpenAI, ejecución en segundo plano de Gemini); cuatro de los 12 playbooks de M10 dependen de superficies sin esfuerzo configurable.
- `sources.json`: quedan 8 pares de fuentes con título repetido (se distinguen por ruta en el índice); conviene deduplicar por URL en la Fase 6. `changelog.json`: los 212 `impact` siguen «Pendiente de redactar»; repasar todos los `summary` (se publican enteros).
- `/skill-doctor`, `/design`: versiones sin publicar (conflicto abierto entre páginas oficiales).
- `catalogo-de-componentes` (M12) sigue publicado aunque oculto de la barra lateral: retirarlo o dejarlo con `noindex` antes de publicar (Fase 6).
- Quizzes de cierre de módulo, `esencial` en más páginas de M1 y recalibrar rutas: Fase 5/6. Los costes de M10 usan `<CostExample>` con supuestos de tamaño marcados como «supuesto de la guía».
- Canal para avisar de errores en la guía: «pendiente de definir» en la metodología.
- Coste de la fase: 12 redactores/revisores de Sonnet y Opus (≈ 6,5 M de tokens de subagente en total; la sesión principal se interrumpió dos veces por límite de uso). Anotar `/usage` del usuario.

## Pendientes tras la Fase 5
- **Quizzes:** el mecanismo (progreso en `localStorage`, `QuizHub`) está hecho, pero `quizzes.json` solo trae el de M2 (6 preguntas). Faltan M0, M1 y M3–M10 (5–8 preguntas con explicación; el esquema exige ese rango): redactor + revisor-editorial. «Borrar mi progreso» no borra los quizzes en línea de MDX con id derivado.
- **Revisión editorial y de hechos (Fase 6):** anotaciones del laboratorio (troceadas del texto original; los `escenario` son nuevos), preguntas de M2 y textos de `selector-rules.json`, `context-scenarios.json`, `agent-topologies.json` y `maturity.json`. El verificador debe repasar las cifras que citan (≈2,1× del asesor, ≈7× de agent teams, 100 tokens por skill, 55.000 tokens de cinco servidores MCP, «más de un 85 %» de tool search).
- **Selector:** con combinaciones sin fila en la tabla de la página toma la fila más cercana y más capaz, con aviso; el resultado es largo en móvil (alternativas repetidas por proveedor): valorar resumirlo.
- **Calculadora:** no modela el almacenamiento de caché de Gemini 3.8 Flash, fast mode, herramientas del servidor ni imágenes, ni aplica tramos largos a los precios anunciados. Falta confirmar con la documentación si el razonamiento previo se reenvía (por defecto no).
- **Simulador de caché:** sin cita en el repo para «la entrada solo está disponible cuando empieza la primera respuesta» (5 s editables) ni para el límite exacto del TTL.
- **Datos y limpieza:** `claude-code-commands.json` sin `tokenImpact` ni `example`; las 4 fuentes de comandos acaban en `.md` (el enlace abre Markdown); retirar `CommandList.astro` (sin uso); `cspell.json` tiene un `ignoreRegExpList` con `\b` mal escapado y `cspell-project.txt` acumula palabras sin tilde que son claves de JSON; `astro check` da 3 hints (0 errores).
- **Coste de la fase:** 9 subagentes `dev-componentes` (Sonnet, esfuerzo high; ≈1,8 M de tokens de subagente contando las reanudaciones: 178K calculadora, 260K selector, 139K explorador, 137K laboratorio, 151K quizzes, 180K simulador, 224K ventana de contexto, 315K equipos, 211K diagnóstico). Anotar `/usage` del usuario.

## Pendientes y siguientes pasos
- Tras el punto de control 2: elegir el nombre del sitio (cambiar `title` en `astro.config.mjs` y en `index.mdx`), confirmar o ajustar la dirección visual y empezar la Fase 3 (M2 → M3 → M4 → M5 → M0).
- Verificar al redactar: valores del resumen de `claude-code.json` que no entran en `src/data/` (hooks, skills, límites de flujos, rutinas). Están en `research/claude-code.json` con cita.
- Si no existe el repo remoto o hay que subir la rama, pedir confirmación (no se ha hecho push).
- `npm audit` marca 10 vulnerabilidades moderadas en dependencias de desarrollo/transitivas; revisar antes de publicar (Fase 6).
