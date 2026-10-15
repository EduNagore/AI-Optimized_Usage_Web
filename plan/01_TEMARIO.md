# Temario detallado

> Qué cuenta cada página y qué no puede faltar. Los datos concretos (precios, IDs, niveles, versiones) se toman de `src/data/` tras la Fase 1; aquí aparecen solo como orientación. Donde pone «[verificar]», el dato existe pero hay que confirmarlo en la fuente oficial antes de publicarlo.

---

## Plantilla de página (todas las lecciones)

**Frontmatter:** `title`, `description` (≤ 155 caracteres, sirve como meta), `level` (básico, intermedio, avanzado), `tracks` (esencial, profesional, técnica), `readingTime`, `lastReviewed`, `sources` (ids de `sources.json`).

**Estructura:**
1. **En 30 segundos**: 3–5 ideas clave (`<KeyTakeaways>`).
2. **La idea**: la teoría mínima para entender por qué funciona.
3. **En la práctica**: pasos concretos (`<Steps>`), con pestañas por proveedor (`<ProviderTabs>`) cuando difiere.
4. **Ejemplo**: antes/después o caso trabajado, preferiblemente de un contexto de oficina y no solo de código.
5. **Errores frecuentes**: qué sale mal y cómo se corrige.
6. **Lista de comprobación** (`<Checklist>`) que el lector puede marcar.
7. **Para profundizar** y **Fuentes** (`<SourceList>` con fechas).
8. **Quiz** opcional al final del módulo.

**Distintivos** (`<Callout>`): *Dato verificado* (fecha), *Recomendación*, *Medición publicada*, *Novedad 2026*, *Varía según el proveedor*, *Cuidado*.

---

## Inicio

- **Titular** con la tesis: mejores resultados con menos tokens, aplicando un método. Sin promesas infladas.
- **Tres rutas** (Esencial, Profesional, Técnica), cada una con duración y lista de páginas.
- **El método en un diagrama**: el ciclo de 7 pasos de M2, cada paso enlazado.
- **Novedades recientes**: las 4–6 últimas entradas de `changelog.json`.
- **Accesos directos**: chuleta, calculadora, selector de modelo, explorador de comandos.
- **Cómo se mantiene esta guía**: fecha de la última verificación global y enlace a la metodología.

---

## M0. Empieza aquí

### 0.1 Cómo usar esta guía
Rutas, niveles, distintivos y qué significa cada tipo de afirmación (dato, medición, recomendación).

### 0.2 Las 10 reglas (una página, también en la chuleta)
1. Clasifica la tarea antes de abrir el chat.
2. Elige la superficie más simple que la resuelva.
3. Empieza con un modelo capaz a esfuerzo bajo o medio; sube solo si falla.
4. Da contexto y el porqué; las órdenes en mayúsculas sobran.
5. Pide el formato exacto, con un ejemplo.
6. Dale una forma de verificar su trabajo.
7. Una tarea, una conversación: limpia el contexto al cambiar de tema.
8. Lo estable, primero: así se aprovecha la caché.
9. Lo que repitas, conviértelo en plantilla, skill o automatización.
10. Mide el coste por tarea completada, no por mensaje.

### 0.3 Glosario
Desde `glossary.json`, con tooltip en todo el sitio la primera vez que aparece cada término. Como mínimo: token, ventana de contexto, prompt, prompt de sistema, razonamiento (thinking), esfuerzo (effort), prompt caching, TTL, batch, herramienta (tool), MCP, conector, skill, subagente, orquestador, agente, flujo (workflow), compactación, context editing, memoria, alucinación, eval, structured outputs, inyección de instrucciones, worktree, hook, plan mode, auto mode.

---

## M1. Fundamentos que cambian tu forma de trabajar

### 1.1 Qué es un LLM, en la práctica
Predice texto a partir de su contexto; no recuerda entre conversaciones salvo con memoria, proyectos o ficheros de instrucciones; su conocimiento tiene fecha de corte y para lo reciente necesita búsqueda. Consecuencia práctica: tú decides qué sabe en cada momento.

### 1.2 Tokens
Qué son y cómo se cuentan; tokens de entrada, de salida y de razonamiento (este se factura como salida). El mismo texto produce distinto número de tokens según el tokenizador: el de Opus 4.7 y posteriores usa entre 1× y 1,35× los tokens de los anteriores [verificar]. Las imágenes cuestan según su resolución (aprox. 1 token por bloque de 28×28 píxeles; 1280×720 ≈ 1.200 tokens [verificar]). Mini-ejercicio: estimar los tokens de un correo, un informe de 20 páginas y una captura de pantalla.

### 1.3 La ventana de contexto
Los modelos actuales tienen ventanas de alrededor de 1M de tokens, pero el rendimiento baja a medida que se llenan. Cada turno reenvía todo el historial: sin caché, el coste de una conversación larga crece aproximadamente con el cuadrado del número de turnos. Diagrama: anatomía de la ventana (instrucciones del sistema, herramientas, ficheros de instrucciones, conversación, ficheros leídos y resultados de herramientas).

### 1.4 Razonamiento y esfuerzo
Razonamiento adaptativo: el modelo decide cuánto pensar. El parámetro de esfuerzo controla la profundidad del razonamiento, el número de llamadas a herramientas y la extensión. En varios modelos actuales el razonamiento no se puede desactivar y el esfuerzo es el único mando (Opus 5.5, Sonnet 5.5, Fable 5.1 [verificar]). Por eso «piensa paso a paso» ya no hace falta.

### 1.5 Herramientas, MCP y agentes
El bucle de un agente (pensar → usar herramienta → leer resultado → repetir) y las diferencias entre chat, flujo programado y agente. MCP como estándar para conectar herramientas y datos.

### 1.6 La economía de un LLM
Precio por millón de tokens; la salida cuesta varias veces más que la entrada; caché y batch como descuentos; el coste de la cola (las pocas tareas difíciles concentran gran parte del gasto). Mini-calculadora: «¿cuánto cuesta esta conversación?».

---

## M2. El método (núcleo del sitio)

### 2.1 El ciclo de 7 pasos
Diagrama circular. Propón un nombre memorable (sin acrónimos forzados).
1. **Clasifica** la tarea: tipo × complejidad × riesgo × volumen × urgencia.
2. **Elige la superficie**: chat, proyecto, app con conectores, agente de código, API o automatización.
3. **Elige modelo y esfuerzo.**
4. **Prepara el contexto**: lo mínimo suficiente; documentos primero; fuentes identificadas.
5. **Formula el encargo**: objetivo, porqué, material, restricciones, formato, criterio de éxito.
6. **Verifica**: evidencias, tests, citas, segunda opinión con contexto limpio.
7. **Sistematiza y mide**: plantilla, skill, fichero de instrucciones o automatización; coste por tarea.

### 2.2 Taxonomía de tareas de trabajo
Escribir y editar · resumir · extraer y estructurar · analizar datos · investigar · razonar y decidir · programar · revisar · transformar en lote · atención conversacional · ideación · tareas recurrentes. Para cada una: ejemplos de oficina, superficie típica, verificación natural. Se alimenta de `task-matrix.json`.

### 2.3 Elegir superficie
Cuándo basta el chat; cuándo un proyecto con conocimiento; cuándo un agente (Cowork, Claude Code, Codex); cuándo la API. Los cuatro criterios antes de usar un agente: complejidad (¿se puede especificar del todo de antemano?), valor (¿justifica más coste y latencia?), viabilidad (¿el modelo es capaz?) y coste del error (¿se detecta y se recupera?). Si alguno falla, un escalón más simple.

### 2.4 Coste por tarea completada
Ejemplos numéricos con `<Fact>`: el modelo barato que necesita tres intentos frente al capaz que acierta a la primera; el precio de la cola.

### 2.5 La plantilla universal de encargo
Objetivo · contexto y porqué · material · restricciones (con su motivo) · formato de salida (con ejemplo) · criterio de éxito y cómo verificar · qué hacer si falta información. Versión rellenable con botón de copiar.

### 2.6 Errores de método frecuentes
La conversación cajón de sastre; corregir en bucle (tras dos correcciones fallidas, empezar de cero con un encargo mejor); investigar sin acotar; aceptar sin verificar; un CLAUDE.md o unas instrucciones personalizadas que crecen sin control.

---

## M3. Prompting moderno (2026)

### 3.1 Qué ha cambiado
Los modelos actuales siguen instrucciones de forma literal y responden al tono del prompt. Tabla «antes → ahora»:
- `CRÍTICO: DEBES…` → «Usa X cuando…» (el lenguaje de presión provoca sobreaplicación).
- «Piensa paso a paso», etiquetas `<thinking>` → parámetro de esfuerzo.
- Respuesta prellenada y «responde SOLO JSON» → structured outputs (el prellenado da error en los modelos recientes [verificar]).
- Coreografía de pasos para tareas de criterio → describir el objetivo, las restricciones y cómo verificar.
- Listas de prohibiciones sin motivo → la intención en positivo; mantener solo restricciones reales con su razón.
- «Usa herramientas solo si es estrictamente necesario» → decir cuándo consultar fuentes conectadas.
- Límites numéricos de palabras → indicar público y propósito.
- Recordatorios repetidos cada pocos turnos → una vez basta.
Fuente principal: guía oficial de buenas prácticas de prompting de Anthropic y su guía de auditoría de prompts.

### 3.2 Principios
Claro y directo · contexto y motivación (el porqué mejora el resultado) · ejemplos variados marcados como ilustrativos (el modelo imita longitud, tono y estructura) · estructura con secciones o etiquetas XML · rol en una línea más contexto real · objetivo y no método, salvo en operaciones frágiles · una restricción con su razón vale más que diez prohibiciones · más contexto del que parece necesario, pero relevante.

### 3.3 Contexto largo
Documentos primero y pregunta al final; etiquetar cada documento con metadatos; pedir extractos o citas antes del análisis; preguntar por partes.

### 3.4 Formato y longitud
Describir la forma con un ejemplo; structured outputs para JSON; formato condicional («usa tablas solo para comparar»); qué hacer con los modelos que formatean de más o de menos.

### 3.5 Encargos para tareas largas y agentes
Especificación completa al inicio; criterios de verificación; estado en ficheros (progreso, lista de tests); trabajo a lo largo de varias ventanas de contexto; autonomía frente a seguridad (confirmar acciones irreversibles); no ajustar el código a los tests; «no especules sobre código que no has abierto».

### 3.6 Que la IA te entreviste
Pedirle que te haga preguntas sobre los puntos difíciles, que escriba la especificación (`SPEC.md`) y ejecutarla en una sesión nueva con contexto limpio. Aplicable fuera del código: planes de proyecto, informes, políticas.

### 3.7 Encadenar y autocorregir
Borrador → revisión contra criterios → versión final, cada paso por separado cuando quieres inspeccionar resultados intermedios.

### 3.8 Notas por modelo (desde datos; revisar en la Fase 1)
- **Claude Opus 5.5**: esfuerzo por defecto `medium` en la API; razonamiento siempre activo; las actualizaciones de progreso entre herramientas llegan como bloques de razonamiento; en diseño frontend sin indicaciones cae en estilos por defecto (nombrar los que se quieren evitar funciona mejor que «evita el aspecto genérico»).
- **Claude Sonnet 5.5**: muy literal; niveles de esfuerzo recalibrados; tiende a responder de memoria cuando una herramienta conectada serviría mejor, así que conviene decir cuándo consultar fuentes.
- **Claude Haiku 5.5**: barato y rápido; ideal para extracción y clasificación; cuidado con instrucciones largas en bucles de agente.
- **Claude Fable 5.1**: para trabajo que supera una sesión; describe el resultado y no los pasos; verifica por sí mismo; turnos largos; formatea poco.
- **GPT-6 Astra / GPT-6.1 Sol** (OpenAI): Astra pide aclaraciones más a menudo; tiende a listas y Markdown (pedir prosa si se quiere); puede delegar menos de lo deseado; prueba de más en cambios pequeños; es sensible a `AGENTS.md` y skills.
- **Gemini 4 Argon** (Google): eliminar `temperature`, `top_p` y `top_k`; subir `max_output_tokens`; `thinking_level`.

### 3.9 Biblioteca de plantillas de trabajo (≥ 18, copiables y descargables)
Correo delicado · informe ejecutivo · acta de reunión a tareas · análisis de documento con citas · comparar propuestas · extraer datos a tabla o JSON · revisión de contrato (con aviso de revisión profesional) · plan de proyecto · análisis de un CSV o Excel · investigación con fuentes · feedback a un texto · traducción con glosario · prompt de sistema para un asistente interno · encargo a un agente de código · revisión de código · especificación de funcionalidad · fichero SKILL.md · encargo a un subagente · prompt de evaluación (rúbrica).
Cada plantilla: cuándo usarla, variables resaltadas, configuración recomendada (superficie, modelo, esfuerzo) y un ejemplo relleno.

### 3.10 Laboratorio antes/después
8–10 casos con el prompt original, el mejorado y anotaciones de qué cambió y por qué (componente `PromptLab`).

### 3.11 Auditar tus prompts
Lista de comprobación de «restos» obsoletos: lenguaje de presión, andamios sustituidos por funciones de la API, sobreespecificación, fósiles de modelos antiguos, prohibiciones sin motivo, coreografía de salida. Lo que no se toca: el contexto, el detalle de las herramientas, los pasos exactos en operaciones frágiles. Herramientas: `/doctor prompt-audit` en Claude Code y el subcomando `prompt-audit` del skill `claude-api` [verificar].

---

## M4. Elegir modelo y esfuerzo

### 4.1 El mapa de modelos
Tabla desde `models.json`, por niveles:
- **Frontera**: Claude Fable 5.1 · GPT-6 Astra · Gemini 4 Argon.
- **Alto rendimiento**: Claude Opus 5.5.
- **Equilibrado**: Claude Sonnet 5.5 · GPT-6.1 Sol.
- **Rápido y económico**: Claude Haiku 5.5 · GPT-6 Luna · la familia Flash de Gemini [verificar el modelo vigente].
Columnas: contexto, precio de entrada y salida, lectura de caché, niveles de esfuerzo y valor por defecto, para qué destaca. Nota sobre modelos de acceso limitado (Claude Mythos 5.1, solo en un programa restringido): se mencionan, no se recomiendan.

### 4.2 Esfuerzo y razonamiento
Niveles (`low`, `medium`, `high`, `xhigh`, `max`) y qué cambia en cada uno. Tabla de equivalencias: `output_config.effort` (Anthropic) ↔ `reasoning.effort` (OpenAI) ↔ `thinking_level` (Google). Los valores por defecto dependen del modelo **y de la superficie**: en la API, Sonnet 5.5 arranca en `high`; en Claude Code, en `medium` [verificar]. En Claude Code: `/effort`, la palabra `ultrathink` para un turno, `/effort ultracode` para orquestar flujos dinámicos, y `effort` en la definición de skills y subagentes.

### 4.3 Estrategia de selección
- Antes de montar una cascada de modelos, prueba el modelo capaz a esfuerzo bajo: en los modelos recientes suele igualar a la generación anterior con esfuerzo alto, y un solo modelo comparte una sola caché.
- Barrido de esfuerzo sobre casos reales, incluidos los difíciles.
- Compara modelos en el 10 % más difícil de las tareas: ahí se decide la factura.
- Ejecuta todo a esfuerzo bajo y reintenta solo los fallos a esfuerzo alto, cuando hay una señal de fallo fiable.
- Baja de modelo de escalón en escalón, midiendo.
- Patrones mixtos: `opusplan` (Opus planifica, Sonnet ejecuta), el asesor (`/advisor`: un modelo ejecutor consulta a uno superior en las decisiones difíciles), fast mode (el mismo modelo, más rápido y más caro: para latencia, no para calidad).

### 4.4 Matriz recomendada por tarea
`<TaskMatrix>` desde `task-matrix.json`. Propuesta inicial (son **recomendaciones**; valídalas con las guías oficiales y márcalas como tales):

| Tarea | Superficie | Modelo | Esfuerzo | Verificación |
|---|---|---|---|---|
| Correo, reformular, texto breve | Chat | Sonnet 5.5 / GPT-6.1 Sol / Flash | low | Lectura |
| Resumen de documento largo con decisiones | Chat + proyecto | Sonnet 5.5 | medium | Citas con página |
| Extracción a tabla o JSON en volumen | API + batch + structured outputs | Haiku 5.5 / GPT-6 Luna | low | Validación de esquema y muestreo |
| Clasificación masiva | API + batch | Haiku 5.5 / GPT-6 Luna | low | Eval de 20–30 casos |
| Análisis de datos (CSV, Excel) | Chat con ejecución de código o agente | Opus 5.5 / Sonnet 5.5 | medium | Recalcular cifras clave con código |
| Investigación con fuentes | Modo investigación / `/deep-research` | Opus 5.5 (Fable 5.1 si es crítica) | high | Fuentes primarias, verificación cruzada |
| Decisión estratégica | Chat | Opus 5.5 / GPT-6 Astra / Fable 5.1 | high–xhigh | Supuestos explícitos y contraargumentos |
| Programación diaria | Claude Code / Codex | Sonnet 5.5 | medium | Tests |
| Arquitectura o depuración compleja | Claude Code | Opus 5.5 o Fable 5.1 | high–xhigh | Tests y revisión adversarial |
| Migración masiva de código | `/batch` o flujo dinámico | Orquestador Opus o Sonnet, trabajadores Sonnet | medium | CI por lote |
| Revisión de código | `/code-review`, subagente nuevo | Opus 5.5 | high | Hallazgos reproducibles |
| Tarea recurrente | Rutina o tarea programada | Sonnet 5.5 o Haiku 5.5 | low–medium | Comprobaciones automáticas |
| Asistente interno conversacional | Proyecto o API con caché | Sonnet 5.5 / Haiku 5.5 | low | Eval de conversaciones |

### 4.5 Selector interactivo (ver §Interactivos)

### 4.6 Cuándo usar un modelo de frontera
Fable 5.1 para trabajo que supera una sesión: investigaciones de causa raíz, incidencias, decisiones de arquitectura. Describe el resultado, no los pasos; usa `/goal` para mantener el objetivo. Restricciones: precio, retención de datos obligatoria de 30 días (no disponible con retención cero salvo autorización) y fallback a Opus si un clasificador de seguridad salta [verificar].

---

## M5. Optimización de tokens y contexto

### 5.1 Por qué se dispara el gasto
Reenvío del historial, fallos de caché tras pausas, contextos largos, tareas programadas que se disparan en reposo, subagentes y equipos de agentes (en plan mode, alrededor de 7 veces más tokens que una sesión normal [verificar]).

### 5.2 El orden de las palancas
Gratis primero (caché, higiene de entrada, higiene del bucle, salida, batch); compromisos después (presupuestos, esfuerzo, modelo, arquitecturas multimodelo), siempre midiendo. Infografía en dos columnas.

### 5.3 Prompt caching a fondo
- El prefijo estable va primero (orden de render: herramientas → sistema → mensajes) y lo variable, al final.
- TTL de 5 minutos o 1 hora; precios de escritura (1,25× y 2×) y de lectura (≈0,1× en general; menos en Opus 5.5 y Fable 5.1); punto de equilibrio; tamaño mínimo cacheable.
- Invalidadores silenciosos: fecha u hora en el prompt de sistema, JSON sin orden estable, cambiar herramientas, cambiar de modelo, cambiar el esfuerzo a nivel de petición.
- Cómo comprobarlo: `cache_read_input_tokens` en la API; la línea «Prompt cache» de `/usage` en Claude Code.
- Equivalentes: input cacheado de OpenAI (`prompt_cache_options.ttl`) y caché implícita de Gemini.
- Mensajes de sistema a mitad de conversación y esfuerzo por mensaje para no romper la caché [verificar disponibilidad].
- Simulador interactivo.

### 5.4 Higiene de entrada (divulgación progresiva)
Skills en lugar de instrucciones permanentes; tool search con `defer_loading` cuando los esquemas pasan de ~10K tokens; documentos detrás de una herramienta; imágenes reducidas; Files API con ejecución de código; herramientas con parámetros estrechos; contar tokens antes de enviar (`count_tokens`).

### 5.5 Higiene del bucle de agente
Context editing (sirve para hacer sitio, no para ahorrar), compactación (sesiones muy largas), subagentes para pasos voluminosos, programmatic tool calling, memoria para persistir entre sesiones, historiales «solo añadir» (preserved thinking: editar turnos anteriores invalida el razonamiento previo en los modelos que lo aplican [verificar]).

### 5.6 Salida
`max_tokens` como red de seguridad y no como palanca; forma de salida con ejemplo; secuencias de parada como salida temprana.

### 5.7 Batch
50 % de descuento que se acumula con la caché; resultados en menos de 24 horas; sin bucle de herramientas; para trabajo que nadie espera.

### 5.8 El día a día en Claude Code
`/usage` (coste, línea de caché, atribución por skill, subagente y MCP), `/context`, `/clear` entre tareas, `/compact <foco>`, `/btw`, `/rewind` con resumen parcial, CLAUDE.md por debajo de 200 líneas, skills bajo demanda, `/skill-doctor`, hooks que filtran salidas largas (por ejemplo, solo los fallos de los tests), subagentes con modelo pequeño, CLIs mejor que MCP cuando existen, plugins de inteligencia de código, compactación en reposo, TTL de caché (1 hora con suscripción, 5 minutos con créditos de uso o API [verificar]), `/insights`.

### 5.9 En apps de chat
Proyectos con conocimiento; una conversación por tema; pegar el fragmento y no el documento entero cuando baste; ventanas de uso de los planes de suscripción [verificar]; memoria y sus límites.

### 5.10 Medir
Campos `usage` de la API, informes de uso y coste (Admin API), OpenTelemetry, `/usage`. Indicadores: coste por tarea completada, tasa de acierto de caché, % de tráfico en batch.

### 5.11 Calculadora de coste (ver §Interactivos)

---

## M6. Herramientas y entornos de trabajo

### 6.1 Mapa de superficies
- **Apps de chat**: Claude.ai (proyectos, memoria, conectores, skills, artifacts, investigación, Cowork, Claude en Excel y en Chrome [verificar cada uno]); ChatGPT (proyectos, GPT-6 con interfaz inteligente, Codex, tareas programadas [verificar]); Gemini.
- **Agentes de código**: Claude Code (terminal, IDE, escritorio, web), Codex (app, CLI, IDE, nube), Gemini CLI y sus equivalentes [verificar].
- **API y plataformas**: Claude API (Messages, Agent SDK, Managed Agents), OpenAI Responses API, Gemini API.

### 6.2 Cuál usar para qué
Tabla de decisión por tipo de tarea y perfil.

### 6.3 Conectores y MCP
Qué son, qué cuestan en contexto, permisos y riesgos (el contenido externo es dato, no instrucciones).

### 6.4 Skills
Formato `SKILL.md` y carga progresiva (solo la descripción está siempre en contexto); dónde viven (`.claude/skills/` en Claude Code, `.agents/skills/` en Codex [verificar]); cuándo usar skill, fichero de instrucciones, hook o subagente.

### 6.5 Ficheros de instrucciones y memoria
CLAUDE.md y memoria automática; `AGENTS.md`; instrucciones personalizadas de las apps. Qué incluir (lo que el modelo no puede deducir) y qué excluir (lo obvio, lo cambiante, lo que ya está en el código).

---

## M7. Claude Code a fondo (y sus equivalentes)

### 7.1 Primeros pasos y configuración
Instalación, `/init`, CLAUDE.md, modos de permiso (auto mode como modo inicial [verificar versión]), sandbox, `/fewer-permission-prompts`, `/doctor`, `/import` para traer configuración de otras herramientas.

### 7.2 El flujo recomendado
Explorar → planificar (plan mode con Shift+Tab, editar el plan con Ctrl+G) → implementar → verificar (`/verify`, `/run`, hooks de parada, `/goal`) → commit y PR. Cuándo saltarse el plan: si puedes describir el cambio en una frase.

### 7.3 Referencia de comandos `/` (`<CommandExplorer>` desde `claude-code-commands.json`)
Buscable, filtrable por fase y con botón de copiar. Agrupación propuesta:
- **Configuración**: `/init`, `/config`, `/permissions`, `/hooks`, `/mcp`, `/plugin`, `/skills`, `/agents`, `/memory`, `/statusline`, `/output-style`, `/keybindings`, `/terminal-setup`, `/doctor`, `/update-config`, `/fewer-permission-prompts`, `/sandbox`, `/auto-mode-setup`, `/import`.
- **Contexto y sesión**: `/clear`, `/compact`, `/context`, `/btw`, `/rewind` (`/undo`, `/checkpoint`), `/resume`, `/rename`, `/branch`, `/fork`, `/recap`, `/export`, `/copy`, `/focus`, `/cd`, `/add-dir`, `/autocompact`.
- **Modelo y coste**: `/model`, `/effort`, `/fast`, `/advisor`, `/usage` (`/cost`, `/stats`), `/usage-credits`, `/rate-limit-options`, `/insights`, `/skill-doctor`.
- **Planificar y revisar**: `/plan`, `/diff`, `/code-review`, `/review`, `/security-review`, `/ultrareview`, `/simplify`, `/verify`, `/run`.
- **Paralelo y agentes**: `/subtask`, `/fork`, `/background`, `/tasks`, `/batch`, `/workflows`, `/workflow-authoring`, `/deep-research`, `/list-agents`, `claude agents` (agent view), agent teams, `--worktree`.
- **Automatización**: `/loop`, `/schedule` (rutinas en la nube), `/goal`, `claude -p` (modo no interactivo), `/install-github-app`, `/autofix-pr`, integración con Slack.
- **Creación**: `/artifacts`, `/design`, `/slides`, `/dataviz`.
- **Movilidad**: `/teleport`, `/remote-control`, `/desktop`, `/mobile`, `/chrome`.
- **Retirados** (cuadro aparte, útil para quien sigue tutoriales antiguos): `/ultraplan`, `/pr-comments`, `/vim`.
- **Atajos y palabras clave**: Esc, Esc Esc, Shift+Tab, Ctrl+G, Ctrl+B, menciones con `@`, `ultrathink` [verificar lista completa].
Cada comando: qué hace, cuándo usarlo, impacto en tokens (ahorra / neutro / gasta) y ejemplo.

### 7.4 Extender Claude Code
Skills; subagentes (campos `model`, `effort`, `tools`, `isolation`, `background`…); hooks (PreToolUse, Stop, UserPromptSubmit; `onFailure: "block"`); plugins y marketplaces; mods; MCP; output styles; status line.

### 7.5 Trabajo en paralelo
Tabla de las cinco formas (subagentes, agent view, agent teams, projects, flujos dinámicos) más worktrees, mensajería entre sesiones y `/batch`: qué es cada una, cuándo usarla, cuánto cuesta y cómo vigilarla (`/tasks`, `/workflows`, `claude agents`).

### 7.6 Automatización
`claude -p` con `--output-format json`, `--allowedTools` y `--permission-mode dontAsk`; bucles de fan-out; CI con GitHub Actions; rutinas; `/loop`; tareas programadas en escritorio.

### 7.7 Equivalencias en Codex y Gemini CLI
Tabla: fichero de instrucciones, skills, subagentes, plan mode, revisión, objetivo persistente, aprobaciones y sandbox, modo no interactivo, comandos equivalentes (`/plan`, `/review`, `/goal`, `/model`, `/skills`, `/plugins`, `/status` en Codex [verificar]).

### 7.8 Errores frecuentes
La sesión cajón de sastre, CLAUDE.md sobrecargado, confiar sin verificar, exploración sin acotar, demasiados servidores MCP activos.

---

## M8. Agentes y orquestación multimodelo

### 8.1 La escalera de complejidad
Llamada única → flujo programado → agente → multiagente. Los cuatro criterios de §2.3 y el coste que añade cada escalón.

### 8.2 Patrones
Cada uno con diagrama, cuándo compensa y cuándo no:
- Encadenamiento de prompts.
- Enrutado: un clasificador decide qué modelo atiende cada caso.
- Paralelización: por secciones o por votación.
- Orquestador y trabajadores.
- Evaluador y optimizador (escritor y revisor).
- Asesor: ejecutor barato que consulta a un modelo superior en las decisiones difíciles.
- Fan-out por lotes.
- Flujos dinámicos con verificación cruzada.

### 8.3 Modelo y esfuerzo por rol
| Rol | Modelo orientativo | Esfuerzo | Motivo |
|---|---|---|---|
| Orquestador o planificador | Opus 5.5 (Fable 5.1 en lo más difícil) | high | Las malas decisiones de plan se pagan en todo lo que sigue |
| Trabajador general | Sonnet 5.5 | medium | Buena relación capacidad/coste |
| Lectura, extracción, clasificación masivas | Haiku 5.5 | low–medium | Volumen alto, salida comprobable |
| Verificador o revisor | Modelo distinto o contexto nuevo; Opus 5.5 | high | No debe corregir quien hizo el trabajo |
| Paso determinista | Código | — | Si la entrada determina la salida, no hace falta un LLM |
Aviso: cada modelo tiene su propia caché, así que una cascada pierde reutilización. Mide primero el modelo capaz a esfuerzo bajo.

### 8.4 Cuándo no orquestar
Cadena de pasos dependientes; trabajo que cabe en un contexto; sobrecoste del plan, del reparto y de la fusión. Medición publicada: el orquestador compensa cuando hay volumen que repartir y no compensa cuando la tarea es una sola cadena [verificar cifras en la página de optimización de coste de Anthropic].

### 8.5 Cómo escribir el encargo a un subagente
Objetivo, contexto, ficheros, límites, formato de retorno y criterio de terminado. Plantilla copiable y ejemplo malo frente a bueno.

### 8.6 Implementación por superficie
- **Claude Code**: subagentes en `.claude/agents/` con `model` y `effort`; `CLAUDE_CODE_SUBAGENT_MODEL`; `/batch`; flujos dinámicos (`CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL`); agent teams (experimental, desactivado por defecto).
- **Claude API**: Tool Runner, Agent SDK, Managed Agents (sesiones multiagente, flujos dinámicos, outcomes, despliegues programados).
- **OpenAI**: orquestación multiagente en la Responses API y subagentes de Codex [verificar].

### 8.7 Diseñador de equipos de agentes (ver §Interactivos)

### 8.8 Dos casos completos
«Informe de mercado con verificación cruzada» y «Migración de 300 ficheros».

---

## M9. Calidad, verificación y seguridad

### 9.1 Verificar siempre
Pedir evidencias (salida de tests, comandos ejecutados, capturas); cerrar el bucle en el propio encargo, con `/goal`, con un hook de parada o con un revisor en contexto nuevo. Al revisor, pedirle solo los fallos que afectan a la corrección para no sobredimensionar.

### 9.2 Evals mínimas
20–30 casos reales congelados; criterio de juicio (respuesta de referencia, rúbrica o comprobador automático); un script que registra salida y uso; comparar acierto y coste por tarea; frontera de Pareto.

### 9.3 Alucinaciones
Citas y extractos, permiso explícito para decir «no lo sé», búsqueda web, recuperación de documentos, comprobación cruzada.

### 9.4 Privacidad y seguridad
Qué datos no pegar; políticas de retención y retención cero; conectores y sus permisos; inyección de instrucciones; permisos y sandbox en agentes; confirmar acciones irreversibles; secretos fuera del prompt.

### 9.5 Gobernanza para equipos
Límites de gasto, analítica, configuración gestionada, marketplaces privados de plugins, recomendaciones de límites por usuario, plan de adopción.

---

## M10. Casos prácticos (playbooks)

Ficha común: tarea · configuración recomendada (superficie, modelo, esfuerzo) · preparación del contexto · encargo (plantilla) · verificación · coste estimado con la calculadora · versión económica frente a premium · errores típicos.

1. Resumir un informe de 80 páginas y extraer decisiones.
2. Escribir una comunicación delicada.
3. Analizar un Excel o CSV.
4. Investigación con fuentes contrastadas.
5. Acta de reunión convertida en tareas.
6. Clasificar 50.000 tickets (API + Haiku + batch + caché + structured outputs), con comparación de coste.
7. Nueva funcionalidad con Claude Code (entrevista → especificación → plan → implementación → `/code-review` → PR).
8. Migración masiva de código (`/batch` o flujo dinámico, worktrees, trabajadores Sonnet).
9. Informe semanal automático (rutina con conectores).
10. Asistente interno con prompt de sistema y skills.
11. Revisión de un contrato (con revisión humana obligatoria).
12. Preparar una presentación.

---

## M11. Laboratorio y autoevaluación
Quiz por módulo (5–8 preguntas con explicación de cada respuesta), retos de reescritura de prompts con solución comentada, diagnóstico de madurez y progreso guardado en el navegador.

## M12. Recursos
Chuleta imprimible de una página · plantillas descargables · novedades (desde `changelog.json`, con filtro por proveedor) · fuentes oficiales · metodología de verificación y fecha de la última revisión global.

### Novedades de 2026 que deben aparecer explicadas en el sitio
Cada una enlazada desde novedades y desde su lección [verificar todas en la Fase 1]:
- Razonamiento adaptativo en lugar de presupuestos fijos de tokens de razonamiento; razonamiento siempre activo en Opus 5.5, Sonnet 5.5 y Fable.
- Niveles `xhigh` y `max`; esfuerzo por mensaje; presupuestos de tarea (task budgets).
- Preserved thinking e historiales que solo crecen.
- Mensajes de sistema a mitad de conversación.
- Fallbacks automáticos en servidor ante rechazos de seguridad.
- Tool search, programmatic tool calling, compactación en servidor, context editing, memory tool.
- Skills fuera de beta; Managed Agents (outcomes, flujos dinámicos, despliegues programados); herramienta asesora; fast mode.
- Claude Code: auto mode como modo inicial, agent view, flujos dinámicos y ultracode, `/goal`, rutinas, artifacts, compactación en reposo, plugins y mods, `/skill-doctor`, `/insights`, esfuerzo por subagente.
- OpenAI: familia GPT-6, `reasoning.effort` hasta `max`, llamadas asíncronas a herramientas, cambio de esfuerzo a mitad de conversación (`configuration_update`), nuevo TTL de caché.
- Google: Gemini 4 Argon, `thinking_level`, solo caché implícita, ejecución en segundo plano para salidas largas.

---

## Interactivos (especificación)

Todos: lógica pura en `src/lib/` con tests; datos leídos de `src/data/`; accesibles por teclado; útiles a 360 px; sin JS muestran una explicación estática; enlazan la fuente de los precios con su fecha.

1. **Calculadora de coste por tarea**: modelo (uno o varios para comparar), tokens de entrada, de salida y de razonamiento, número de turnos, crecimiento del historial por turno, % de acierto de caché, TTL, batch sí/no, tareas al mes. Muestra el coste por tarea y al mes, el desglose por concepto y el efecto de cada palanca. Fórmula base por petición: entrada sin caché × precio de entrada + escrituras de caché × precio de entrada × multiplicador del TTL + lecturas de caché × precio de lectura + (salida + razonamiento) × precio de salida; ×0,5 con batch. Modela el reenvío del historial en conversaciones de varios turnos. Respeta las reglas propias de cada proveedor (tramos de contexto largo de OpenAI, tramo de más de 100K de Haiku 5.5, caché implícita de Gemini).
2. **Selector de modelo y esfuerzo**: cuestionario breve (tipo de tarea, dificultad, volumen, latencia, coste del error, datos sensibles) → recomendación de superficie, modelo y esfuerzo, con el razonamiento y alternativas más barata y más potente. Reglas en `task-matrix.json`, no en el código.
3. **Explorador de comandos**: búsqueda difusa, filtros por categoría y fase, impacto en tokens, copiar, enlace a la documentación oficial.
4. **Laboratorio antes/después**: alterna entre los dos prompts, resalta diferencias y muestra anotaciones.
5. **Quizzes y progreso**: estado en `localStorage` envuelto en try/catch; la página funciona igual si el almacenamiento falla.
6. **Simulador de caché**: línea temporal de peticiones con sus separaciones → aciertos y fallos con TTL de 5 min y de 1 h, y coste resultante.
7. **Visualizador de la ventana de contexto**: barra apilada (sistema, herramientas, CLAUDE.md, MCP, conversación, ficheros) y efecto de `/clear`, `/compact`, skills y subagentes.
8. **Diseñador de equipos de agentes**: forma de la tarea (cadena, piezas independientes, volumen, necesidad de verificación) → topología recomendada, modelo y esfuerzo por rol, multiplicador de coste orientativo y aviso cuando no compensa orquestar.
9. **Diagnóstico de madurez**: 12–15 preguntas → nivel y lista de páginas recomendadas.
