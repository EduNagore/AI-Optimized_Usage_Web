# Hechos verificados y protocolo de verificación

> Línea base consultada el **15 de octubre de 2026** en documentación oficial. Sirve para arrancar y para detectar cambios. **No se publica sin volver a verificarla en la Fase 1**, porque precios, modelos y comandos cambian a menudo.

---

## 1. Protocolo

1. **Solo fuentes oficiales** para publicar un dato: documentación, páginas de precios, notas de versión y blogs de los propios proveedores. Agregadores, blogs de terceros y resúmenes de buscadores sirven para encontrar la fuente oficial, nunca como fuente.
2. **Cada dato con cita.** URL, fecha de consulta y un extracto literal breve que lo respalde (`research/*.json`).
3. **Conflictos.** Si dos fuentes oficiales discrepan (por ejemplo, la página de precios y la de un modelo), anota ambas, usa la más específica y reciente, y menciónalo al usuario en el punto de control 1.
4. **Lo que no se confirma no se publica como dato.** Puede aparecer como «anunciado, sin confirmar» solo si aporta y con su fuente.
5. **Tu conocimiento previo no es fuente.** Si un dato de aquí te parece raro, compruébalo; no lo «corrijas» de memoria. Muchos modelos y funciones de esta lista son posteriores al entrenamiento de cualquier modelo actual.
6. **Si una fuente no carga**, prueba su versión `.md` o `llms.txt`; si sigue fallando, deja el dato como pendiente y dilo.
7. **Fechas absolutas** siempre (AAAA-MM-DD), nunca «hace dos semanas».

---

## 2. Fuentes oficiales

### Anthropic: plataforma y API
- Modelos: https://platform.claude.com/docs/en/about-claude/models/overview.md
- Precios: https://platform.claude.com/docs/en/about-claude/pricing.md
- Optimizar coste e inteligencia (mediciones publicadas): https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence.md
- Guía de migración: https://platform.claude.com/docs/en/about-claude/models/migration-guide.md
- Buenas prácticas de prompting: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices.md
- Prompting por modelo: `.../prompt-engineering/prompting-claude-opus-5-5`, `...-sonnet-5-5`, `...-haiku-5-5`, `...-fable-5-1`
- Esfuerzo: https://platform.claude.com/docs/en/build-with-claude/effort.md
- Razonamiento adaptativo: https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking.md
- Prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md
- Batch: https://platform.claude.com/docs/en/build-with-claude/batch-processing.md
- Conteo de tokens: https://platform.claude.com/docs/en/build-with-claude/token-counting.md
- Compactación: https://platform.claude.com/docs/en/build-with-claude/compaction.md
- Context editing: https://platform.claude.com/docs/en/build-with-claude/context-editing.md
- Preserved thinking: https://platform.claude.com/docs/en/build-with-claude/preserved-thinking.md
- Tool search: https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool.md
- Programmatic tool calling: https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling.md
- Memory tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool.md
- Skills: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview.md
- Structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md
- Visión: https://platform.claude.com/docs/en/build-with-claude/vision.md
- Managed Agents: https://platform.claude.com/docs/en/managed-agents/overview.md (y `multiagent-orchestration.md`, `define-outcomes.md`)
- Admin API de uso y coste: https://platform.claude.com/docs/en/manage-claude/usage-cost-api.md
- Cookbook de optimización de coste: https://platform.claude.com/cookbook/cost-optimization-cost-optimization

### Anthropic: Claude Code
- Índice completo: https://code.claude.com/docs/llms.txt
- Comandos: https://code.claude.com/docs/en/commands.md
- Modelo y esfuerzo: https://code.claude.com/docs/en/model-config.md
- Costes: https://code.claude.com/docs/en/costs.md
- Buenas prácticas: https://code.claude.com/docs/en/best-practices.md
- Agentes en paralelo: https://code.claude.com/docs/en/agents.md
- Subagentes: https://code.claude.com/docs/en/sub-agents.md
- Flujos dinámicos: https://code.claude.com/docs/en/workflows.md
- Agent teams: https://code.claude.com/docs/en/agent-teams.md
- Skills: https://code.claude.com/docs/en/skills.md
- Hooks: https://code.claude.com/docs/en/hooks-guide.md y `hooks.md`
- Memoria y CLAUDE.md: https://code.claude.com/docs/en/memory.md
- Modos de permiso: https://code.claude.com/docs/en/permission-modes.md
- Prompt caching en Claude Code: https://code.claude.com/docs/en/prompt-caching.md
- Rutinas: https://code.claude.com/docs/en/routines.md · Tareas programadas: `scheduled-tasks.md` · Objetivo: `goal.md`
- Changelog: https://code.claude.com/docs/en/changelog.md · Resúmenes semanales: `whats-new/index.md`

### OpenAI
- Último modelo y migración: https://developers.openai.com/api/docs/guides/latest-model
- Precios: https://developers.openai.com/api/docs/pricing
- Codex y ChatGPT Work: https://learn.chatgpt.com/docs
- Notas de versión de ChatGPT: https://help.openai.com/en/articles/6825453-chatgpt-release-notes
- Nota: `openai.com/index/...` devolvió 403 a la consulta automática; usa las páginas de `developers.openai.com`.

### Google
- Último modelo: https://ai.google.dev/gemini-api/docs/latest-model
- Changelog de la API: https://ai.google.dev/gemini-api/docs/changelog
- Guía de Gemini 3 (`thinking_level`): https://ai.google.dev/gemini-api/docs/gemini-3
- Precios: https://ai.google.dev/gemini-api/docs/pricing

---

## 3. Línea base de datos

### 3.1 Modelos de Anthropic (tabla de la documentación de la API, caché del 2026-10-06)

| Modelo | ID | Contexto | Entrada $/MTok | Salida $/MTok | Lectura de caché $/MTok |
|---|---|---|---|---|---|
| Claude Fable 5.1 | `claude-fable-5-1` | 1M | 10,00 | 50,00 | 0,25 |
| Claude Fable 5 | `claude-fable-5` | 1M | 10,00 | 50,00 | [verificar] |
| Claude Opus 5.5 | `claude-opus-5-5` | 1M | 4,00 | 20,00 | 0,20 |
| Claude Opus 5 | `claude-opus-5` | 1M | 5,00 | 25,00 | [verificar] |
| Claude Opus 4.8 / 4.7 / 4.6 | `claude-opus-4-8` … | 1M | 5,00 | 25,00 | [verificar] |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | 1M | 2,00 | 10,00 | 0,20 |
| Claude Sonnet 5 | `claude-sonnet-5` | 1M | 2,00 | 10,00 | [verificar] |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | 1M | 3,00 | 15,00 | [verificar] |
| Claude Haiku 5.5 | `claude-haiku-5-5` | 1M | 0,10 (0,50 por encima de 100K) | 0,50 (2,50 por encima de 100K) | [verificar] |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | 1,00 | 5,00 | [verificar] |
| Claude Mythos 5.1 | `claude-mythos-5-1` | 1M | 10,00 | 50,00 | Solo en un programa de acceso restringido (Project Glasswing): no recomendar |

Otros datos del mismo origen:
- Salida máxima de 128K tokens en los modelos actuales (con streaming para valores altos).
- **Fable 5.1**: razonamiento siempre activo; el esfuerzo es el mando (`low` a `max`); el razonamiento en bruto nunca se devuelve; exige retención de datos de 30 días (no disponible con retención cero salvo autorización); puede rechazar peticiones por clasificadores de seguridad, con fallback configurable.
- **Opus 5.5**: el razonamiento no se puede desactivar; esfuerzo por defecto `medium` en la API; fast mode (vista previa, solo Claude API) a 8 $ / 40 $ por MTok.
- **Sonnet 5.5**: esfuerzo por defecto `high` en la API, con niveles recalibrados respecto a Sonnet 5; para apagar el razonamiento se usa `thinking: {type: "between_tools"}`.
- **Haiku 5.5**: esfuerzo por defecto `medium`. Pasó a ser el Haiku por defecto en Claude Code el 2026-10-07 (v2.1.293).
- El prellenado de la respuesta del asistente da error 400 en Opus 4.6 y posteriores, incluido Opus 5.5 (guía de migración a Opus 5.5, verificado 2026-10-16); no verificado en otros modelos. Se sustituye por structured outputs o instrucciones en el prompt de sistema.
- `tool_choice` forzado (`any` o `tool`) da error en Fable 5.1, Opus 5.5 y Sonnet 5.5.
- El tokenizador introducido con Opus 4.7 usa entre 1× y 1,35× los tokens de los anteriores.

### 3.2 Razonamiento y esfuerzo
- Niveles: `low`, `medium`, `high`, `xhigh`, `max` en los modelos actuales (Opus 4.6 y Sonnet 4.6 no tienen `xhigh`).
- `thinking: {type: "adaptive"}` sustituye a `budget_tokens`, que da error 400 en Fable 5/5.1, Sonnet 5.5, Sonnet 5, Opus 5.5, 5, 4.8 y 4.7.
- El razonamiento se muestra resumido u omitido; por defecto, omitido en los modelos recientes.
- En beta: esfuerzo por mensaje sin romper la caché, presupuestos de tarea (`task_budget`, mínimo 20.000 tokens) y `display: "updates"` para ver notas de progreso.
- **Claude Code** (model-config, consultado el 2026-10-15): por defecto `medium` en Opus 5.5, Sonnet 5.5 y Haiku 5.5; `high` en la mayoría del resto; `xhigh` en Opus 4.7. Se ajusta con `/effort`, `--effort`, `CLAUDE_CODE_EFFORT_LEVEL`, `effortLevel` en ajustes o `effort:` en skills y subagentes. `ultrathink` en el prompt pide más razonamiento para ese turno. `/effort ultracode` activa la orquestación de flujos dinámicos (y fija `xhigh`). La documentación recomienda empezar Opus 5.5 en `medium`.
- Ojo a la diferencia de superficie: Sonnet 5.5 arranca en `high` en la API y en `medium` en Claude Code. Confírmalo y explícalo en el sitio.

### 3.3 Prompt caching (Anthropic)
- `cache_control: {type: "ephemeral"}` (5 min) o con `ttl: "1h"`. Máximo 4 puntos de corte por petición. Existe caché automática a nivel de petición.
- Escritura: 1,25× la entrada (5 min) o 2× (1 h). Lectura: ≈0,1× en general; 0,05× en Opus 5.5; 0,025× en Fable 5.1.
- Equilibrio: con 5 min compensa desde la segunda petición; con 1 h, desde la tercera.
- Mínimo cacheable: 512 tokens en los modelos más recientes (Opus 5.5, Opus 5, Fable, Sonnet 5.5, Haiku 5.5); 4.096 en Opus 4.6 y Haiku 4.5.
- Orden de render: herramientas → sistema → mensajes. Cualquier byte cambiado en el prefijo invalida lo que sigue.
- Las cachés son por workspace (en la API de Claude) y por modelo. Las lecturas no cuentan para el límite de tokens de entrada en la mayoría de modelos.
- Elección del TTL por separación entre peticiones: menos de 5 min → 5 min; entre 5 y 60 min → 1 h; más de 1 h → ninguna ayuda (recalentar o asumir el fallo).
- **Claude Code**: TTL de 1 hora con suscripción; 5 minutos al consumir créditos de uso; 5 minutos por defecto con clave de API o proveedores cloud. `/usage` muestra la línea «Prompt cache (main)» desde la v2.1.251.

### 3.4 Batch y otras palancas
- Batch: 50 % de descuento en todos los tokens, también en lecturas y escrituras de caché; resultados en menos de 24 h; sin bucle de herramientas; no disponible para Managed Agents.
- Compactación en servidor (beta): umbral por defecto de 150K tokens.
- Context editing: limpia resultados de herramientas antiguos o bloques de razonamiento. Según las mediciones de Anthropic sirve para hacer sitio, no para ahorrar, porque cada limpieza reescribe la caché.
- Tool search con `defer_loading`: compensa a partir de unos 10K tokens de esquemas de herramientas.
- Programmatic tool calling: su documentación reporta un 24 % menos de tokens de entrada en benchmarks de búsqueda agéntica.
- Imágenes: aprox. 1 token por bloque de 28×28 píxeles; 1280×720 ≈ 1.200 tokens.

### 3.5 Mediciones publicadas por Anthropic (página de optimización de coste; cita las cifras de la página vigente)
- La caché es la palanca individual más grande; en bucles de agente redujo el coste varias veces con tasas de acierto altas.
- Trabajo de investigación: curvas de esfuerzo casi planas (`medium` igualó a `high` gastando menos). Programación de horizonte largo: cada escalón de esfuerzo cambia algunos puntos de acierto por bastante coste.
- Ejecutar todo a esfuerzo bajo y repetir solo los fallos a esfuerzo alto mantuvo el acierto por algo más de la mitad del coste.
- El orquestador con trabajadores baratos compensa cuando hay volumen que repartir; en tareas de una sola cadena o que caben en un contexto, el modelo coordinador solo con menos esfuerzo salió mejor.
- El precio de la cola: en una tanda de 20 problemas, dos concentraron el 43 % del gasto.

### 3.6 Claude Code (v2.1.300, 2026-10-14)
- **Alias de modelo**: `default`, `best` (Fable si está disponible, si no Opus), `fable`, `opus`, `sonnet`, `haiku`, `sonnet[1m]`, `opus[1m]`, `opusplan` (Opus en plan mode, Sonnet al ejecutar). En la API de Anthropic, `opus` = Opus 5.5, `sonnet` = Sonnet 5.5, `haiku` = Haiku 5.5. El modelo por defecto es Opus 5.5 en Pro, Max, Team, Enterprise y API; los modelos Fable nunca son el predeterminado.
- **Compactación automática**: ventana configurable de 100K a 1M (`/autocompact`); en modelos de 1M nativo compacta hacia los 967K. Compactación en reposo (v2.1.299): conversaciones de 200K o más inactivas unos 54 minutos se compactan antes de que caduque la caché de 1 hora.
- **Permisos**: auto mode es el modo inicial en terminal y VS Code desde la v2.1.283 (un clasificador revisa las acciones y bloquea las arriesgadas).
- **Costes publicados**: media de unos 13 $ por desarrollador y día activo; 150–250 $ al mes; menos de 30 $ por día activo para el 90 % de usuarios. Agent teams consumen unas 7 veces más tokens que una sesión normal cuando los compañeros trabajan en plan mode; son experimentales y se activan con `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.
- **Consejos oficiales de ahorro**: `/clear` entre tareas; `/compact` con instrucciones; CLAUDE.md por debajo de 200 líneas; instrucciones de flujos concretos en skills; las herramientas MCP se cargan en diferido por defecto; preferir CLIs (`gh`, `aws`…) a MCP; plugins de inteligencia de código; hooks que filtran salidas; subagentes con modelo menor para operaciones verbosas; plan mode en tareas complejas; prompts específicos.
- **Cinco formas de trabajo en paralelo**: subagentes, agent view (`claude agents`, vista previa), agent teams (experimental), projects (beta pública en Pro y Max) y flujos dinámicos. Complementos: worktrees, mensajería entre sesiones y `/batch` (reparte un cambio grande entre 5 y 30 subagentes en worktrees).
- **Subagentes** (`.claude/agents/*.md`): campos `name`, `description`, `tools`, `disallowedTools`, `model` (`sonnet`, `opus`, `haiku`, `fable`, ID completo o `inherit`), `effort`, `permissionMode`, `maxTurns`, `autoCompactWindow`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `omitClaudeMd`, `isolation: worktree`, `color`, `initialPrompt`. `CLAUDE_CODE_SUBAGENT_MODEL` fija un modelo por defecto y `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` lo impone a todos (v2.1.257+). La herramienta Agent acepta `effort` desde la v2.1.292.
- **Comandos**: la lista completa vigente está en `commands.md` (unos 120 entre comandos y skills incluidas). Retirados: `/ultraplan`, `/pr-comments` (v2.1.91), `/vim` (v2.1.92). `/cost` y `/stats` son alias de `/usage`; `/undo` y `/checkpoint`, de `/rewind`.
- **Novedades recientes** (2.1.292–2.1.300, 6–14 oct 2026): `/effort` y `/fast` en agent view; avisos de `/usage` por esfuerzo máximo, flujos, contexto permanente y resultados grandes; el esfuerzo `max` solo dura la sesión; `/advisor` en Claude Platform on AWS; `claude plugin install --marketplace`; hooks con `onFailure: "block"`; compactación en reposo.

### 3.7 OpenAI (developers.openai.com, consultado el 2026-10-15)

| Modelo | ID | Entrada $/MTok | Entrada cacheada | Escritura de caché | Salida $/MTok |
|---|---|---|---|---|---|
| GPT-6 Astra | `gpt-6-astra` | 10,00 | 1,00 | 12,50 | 50,00 |
| GPT-6.1 Sol | `gpt-6.1-sol` | 2,00 | 0,10 | 2,50 | 10,00 |
| GPT-6 Sol | `gpt-6-sol` | 2,00 | 0,20 | 2,50 | 10,00 |
| GPT-6 Luna | `gpt-6-luna` | 0,10 | 0,01 | 0,125 | 0,50 |
| GPT-5.6 Sol / Terra / Luna | — | 4,00 / 2,00 / 0,20 | 0,40 / 0,20 / 0,02 | — | 20,00 / 12,00 / 1,20 |

- Precios para contexto corto (≤ 272K). Por encima de 272K suben (por ejemplo, GPT-6 Astra: 20 $ entrada, 75 $ salida).
- Batch y Flex: aproximadamente la mitad. Fast mode (antes Priority): aproximadamente el doble. Ultrafast solo para Astra y 6.1 Sol. Endpoints regionales y FedRAMP: +10 %.
- Razonamiento (`reasoning.effort`) en GPT-6.1 Sol: `low`, `medium` (por defecto), `high`, `xhigh`, `max`. Astra y 6.1 Sol no admiten `none`; GPT-6 Sol y Luna sí. `minimal` no existe en 6.1 Sol.
- Caché: al migrar desde GPT-5.5 o anteriores, `prompt_cache_retention` pasa a `prompt_cache_options.ttl` (`"30m"`).
- Novedades de GPT-6: llamadas asíncronas a herramientas (`async: true`), corrección a mitad de turno por WebSockets, `configuration_update` para cambiar el esfuerzo en mitad de la conversación; compactación, razonamiento persistente, programmatic tool calling y orquestación multiagente en la Responses API.
- Prompting (guía oficial): Astra pide aclaraciones más a menudo; prefiere listas, tablas y Markdown; puede delegar menos de lo deseado; prueba en exceso cambios pequeños; es sensible a `AGENTS.md` y skills (conviene decir que las instrucciones del usuario prevalecen). Con esfuerzo distinto de `none`, eliminar `temperature`, `top_p` y `top_logprobs`.
- ChatGPT (notas de versión): GPT-6 con interfaz inteligente el 2026-10-07 (Plus, Pro, Business y Enterprise usan GPT-6 Sol; Free y Go, GPT-6 Luna); subida de audio (2026-10-06); corrección de tareas de Codex en marcha (2026-10-08).
- Codex: superficies app de escritorio, móvil y web de ChatGPT, CLI, extensión de IDE y Codex Cloud; `AGENTS.md`, skills, subagentes, hooks, plugins, comandos `/`, perfiles de permisos, sandbox y auto-revisión.
- **Sin confirmar en fuente oficial**: fechas de lanzamiento de GPT-6 Astra y Sol, ventanas de contexto de la familia GPT-6, y funciones de ChatGPT que solo citan blogs («Dots», «Space», «Pages», un plan Pro de 500 $).

### 3.8 Google (ai.google.dev, consultado el 2026-10-15)
- **Gemini 4 Argon** (`gemini-4-argon`): el modelo más capaz de Google según su documentación. Ventana unificada de 1.048.576 tokens para entrada, razonamiento y salida.
- Precio introductorio hasta el 2026-11-30: 2 $ entrada y 10 $ salida por MTok (razonamiento incluido); desde el 2026-12-01: 4 $ y 20 $. Entrada cacheada: 0,10 $ (0,20 $ desde el 1 de diciembre). No disponible en el nivel gratuito.
- `thinking_level`: `low`, `medium` (por defecto), `high`. Recomendación oficial: probar los tres y quedarse con el más bajo que cumpla.
- Caché: no admite caché explícita; la implícita está activa por defecto desde 4.096 tokens, con un 95 % de descuento en los aciertos.
- Migración: eliminar `temperature`, `top_p` y `top_k`; subir `max_output_tokens` a 32.768 o más; tiempos de espera de al menos 15 minutos; ejecución en segundo plano para salidas de más de 64K; `previous_interaction_id` para mantener el estado en servidor.
- Familia Gemini 3: `thinking_level` con `minimal`, `low`, `medium` y `high`; por defecto `high`.
- **Sin confirmar**: modelo Flash vigente (los agregadores citan Gemini 3.7 Flash, GA el 2026-08-13, y un 3.8 Flash) y nombre y funciones actuales de Gemini CLI.

### 3.9 Apps de chat de Claude (sin verificar todavía)
Las fuentes encontradas son de terceros. Comprueba en la documentación de Anthropic y en support.claude.com: Cowork (agente de escritorio sobre ficheros locales), proyectos, memoria, conectores (MCP) y su directorio, skills, artifacts, búsqueda e investigación, Claude en Excel y en Chrome, y qué plan incluye cada cosa.
