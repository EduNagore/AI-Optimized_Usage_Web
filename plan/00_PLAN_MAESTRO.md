# Plan maestro: web «Usa la IA como un profesional»

> **Ejecutor:** Claude Sonnet 5.5 en Claude Code como sesión principal, con subagentes de otros modelos según la tarea (§8).
> **Fecha del plan:** 15 de octubre de 2026. Los datos se verificaron ese día con fuentes oficiales (`02_HECHOS_VERIFICADOS.md`). Vuelve a verificarlos en la Fase 1: este sector cambia cada semana.

---

## 1. Qué vamos a construir

Una web de formación, en español, que enseña a trabajar con LLMs (Claude, GPT, Gemini) de forma óptima en el trabajo: mejores resultados con menos tokens, tiempo y dinero. Une teoría breve y práctica aplicable: un método, plantillas, herramientas interactivas, casos reales y datos siempre fechados.

Nombre provisional: «Usa la IA como un profesional». En la Fase 2 propones tres alternativas y el usuario elige.

### Público
- **Profesionales no técnicos** (gestión, consultoría, legal, marketing, RR. HH., finanzas) que usan Claude.ai, ChatGPT o Gemini a diario.
- **Perfiles técnicos** (desarrollo, datos, operaciones) que usan agentes de código (Claude Code, Codex) o la API.
- **Responsables de equipo** que eligen herramientas, fijan presupuesto y escriben normas de uso.

El mismo contenido se recorre por tres rutas: **Esencial** (30–45 min, cualquier perfil), **Profesional** (chat, prompting, modelos y coste a fondo) y **Técnica** (Claude Code, API, agentes y orquestación). Cada página indica a qué rutas pertenece y su nivel (básico, intermedio, avanzado).

### Qué debe saber hacer el lector al terminar
1. Clasificar una tarea y decidir superficie, modelo y nivel de esfuerzo con criterio.
2. Escribir encargos como funcionan con los modelos actuales, sin trucos obsoletos.
3. Reducir el consumo de tokens sin perder calidad (caché, higiene de contexto, batch, esfuerzo).
4. Usar Claude Code con soltura: comandos `/`, CLAUDE.md, skills, hooks, subagentes y automatización, y reconocer sus equivalentes en Codex y Gemini.
5. Repartir trabajo entre agentes y modelos, y saber cuándo no compensa.
6. Verificar resultados y medir el coste por tarea completada.

## 2. Tesis del sitio

Estos principios atraviesan todo el contenido. Cada módulo los aterriza; ninguno los contradice.

1. **Se optimiza el coste por tarea completada, no el precio por token.** Un modelo barato que necesita reintentos o falla en los casos difíciles no es barato.
2. **El contexto es el recurso escaso.** El rendimiento baja a medida que la ventana se llena, y cada turno reenvía todo el historial.
3. **Primero las mejoras gratuitas, después los compromisos.** Caché, higiene de contexto, formato de salida y batch no cuestan calidad. Bajar el esfuerzo o cambiar a un modelo menor sí, y se mide antes de decidir.
4. **Lo más simple que funcione.** Llamada única → flujo → agente → multiagente. Cada escalón añade coste y debe ganarse su sitio.
5. **Sin verificación no hay método.** Tests, citas, evidencias y una segunda revisión con contexto limpio.
6. **Lo que se repite, se sistematiza.** Plantillas, skills, ficheros de instrucciones y automatizaciones.
7. **Principios comunes, práctica concreta.** Cada principio se explica una vez y se aterriza en Claude, OpenAI y Google.
8. **Actualidad comprobable.** Cada dato volátil muestra fuente oficial y fecha. El texto distingue *dato verificado* (fuente oficial), *medición publicada* (cifra de un estudio del proveedor, con su fuente) y *recomendación* (criterio de la guía, con su razonamiento).

## 3. Alcance

**Dentro:** el temario completo de `01_TEMARIO.md`; herramientas interactivas que calculan en el navegador; plantillas copiables y descargables; chuleta imprimible; página de novedades; modo claro y oscuro; búsqueda; diseño adaptable a móvil.

**Fuera:** llamadas reales a APIs de IA desde la web (no se piden claves y no hay backend), cuentas de usuario, analítica de terceros sin consentimiento, logotipos oficiales de los proveedores (sus nombres van en texto) y cualquier afirmación sin fuente.

## 4. Stack técnico

| Pieza | Elección | Motivo |
|---|---|---|
| Framework | Astro (última estable) + Starlight | Web estática y rápida; contenido en MDX; navegación, búsqueda (Pagefind), modo oscuro, accesibilidad y SEO ya resueltos |
| Interactivos | Islas React con TypeScript estricto | Solo se carga JS donde hace falta (`client:visible`) |
| Datos | `src/data/*.json` validados con zod (content collections de Astro) | Un dato se cambia en un sitio y se propaga a todas las páginas |
| Estilos | Tokens CSS propios sobre Starlight; un framework de utilidades solo si lo justificas en `PROGRESO.md` | Control del diseño con pocas dependencias |
| Tipografía | Fuentes autoalojadas con Fontsource | Rendimiento y privacidad |
| Diagramas | SVG en línea como componentes Astro | Nítidos, accesibles, se adaptan al modo oscuro |
| Tests | Vitest (lógica de calculadoras y reglas), Playwright + axe (humo y accesibilidad), comprobador de enlaces sobre `dist/`, cspell con diccionario es-ES | Puertas de calidad automáticas |
| Despliegue | GitHub Pages con GitHub Actions (remoto: `github.com/EduNagore/AI-Optimized_Usage_Web`) | Gratis y sencillo. Requiere `site` y `base` en `astro.config` por ser página de proyecto |

**Dependencias:** versiones exactas; consulta la última estable con `npm view <paquete> version` y evita versiones publicadas hace menos de dos semanas; no añadas una dependencia que sustituyan treinta líneas propias.

## 5. Mapa del sitio (resumen; detalle en `01_TEMARIO.md`)

- **Inicio**: propuesta de valor, tres rutas, el método en un diagrama, últimas novedades.
- **M0 Empieza aquí**: cómo usar la guía, las 10 reglas, glosario.
- **M1 Fundamentos**: tokens, ventana de contexto, razonamiento y esfuerzo, herramientas y agentes, economía de un LLM.
- **M2 El método**: el ciclo de 7 pasos, taxonomía de tareas, superficies, coste por tarea, plantilla de encargo.
- **M3 Prompting moderno**: qué ha cambiado, principios, contexto largo, formato, tareas largas, notas por modelo, biblioteca de plantillas, laboratorio antes/después, auditoría de prompts.
- **M4 Modelo y esfuerzo**: mapa de modelos, niveles de esfuerzo y equivalencias, estrategia de selección, matriz por tarea, selector interactivo.
- **M5 Tokens y contexto**: orden de las palancas, prompt caching, higiene de entrada y del bucle, salida, batch, día a día en Claude Code y en apps de chat, medición, calculadora.
- **M6 Herramientas y entornos**: apps de chat, agentes de código, API; conectores y MCP; skills; ficheros de instrucciones y memoria.
- **M7 Claude Code a fondo**: flujo recomendado, referencia de comandos `/` (explorador interactivo), extensiones, trabajo en paralelo, automatización, equivalencias en Codex y Gemini CLI.
- **M8 Agentes y orquestación**: escalera de complejidad, patrones, modelo y esfuerzo por rol, cuándo no orquestar, encargos a subagentes, implementación por superficie, diseñador interactivo.
- **M9 Calidad, verificación y seguridad**: bucles de verificación, evals mínimas, alucinaciones, privacidad, inyección de instrucciones, gobernanza de equipos.
- **M10 Casos prácticos**: 12 playbooks de trabajo real.
- **M11 Laboratorio**: quizzes, retos de prompting, diagnóstico de madurez.
- **M12 Recursos**: chuleta imprimible, plantillas, novedades, fuentes, cómo se mantiene esta guía.

## 6. Capa de datos

Los datos volátiles no se escriben en el texto de las páginas: viven en `src/data/` y se muestran con componentes.

| Fichero | Contenido | Campos mínimos por registro |
|---|---|---|
| `models.json` | Modelos de Anthropic, OpenAI y Google | `id`, `provider`, `name`, `apiId`, `tier`, `status` (ga, beta, acceso limitado), `contextWindow`, `maxOutput`, `pricing` (input, output, cacheRead, cacheWrite5m, cacheWrite1h, notas de tramos), `effort` (niveles, valor por defecto por superficie), `notes`, `bestFor` |
| `effort.json` | Equivalencias de esfuerzo/razonamiento entre proveedores y qué cambia cada nivel | `provider`, `parameter`, `levels`, `defaults`, `notes` |
| `pricing-rules.json` | Reglas de precio: multiplicadores de caché, batch, tramos de contexto largo, fast mode | `provider`, `rule`, `value`, `appliesTo` |
| `claude-code-commands.json` | Comandos `/` y skills incluidas | `command`, `args`, `category`, `phase`, `summary`, `tokenImpact`, `example`, `status` (activo, alias, eliminado), `sinceVersion` |
| `features.json` | Matriz de funciones por proveedor y superficie (caché, batch, compactación, tool search, memoria, skills, MCP, subagentes, programación de tareas…) | `feature`, `provider`, `surface`, `status`, `howTo` |
| `task-matrix.json` | Tipo de tarea → superficie, modelo, esfuerzo y verificación recomendados | `taskType`, `examples`, `surface`, `models`, `effort`, `verification`, `rationale` (es una recomendación: lo dice el componente) |
| `glossary.json` | Términos con definición corta y enlace a la lección | `term`, `short`, `long`, `link` |
| `changelog.json` | Novedades del sector y de la guía | `date`, `provider`, `title`, `summary`, `impact`, `link` |
| `sources.json` | Fuentes | `id`, `title`, `url`, `publisher`, `official`, `lastChecked` |

Todos los registros de datos volátiles llevan `source` (id de `sources.json`) y `verifiedAt` (AAAA-MM-DD). Un esquema zod que falla rompe el build: así un dato sin fuente no llega a producción.

Componentes que leen datos: `<Fact id="claude-opus-5-5.pricing.input" />` (valor en línea con tooltip de fuente y fecha), `<ModelTable provider tier />`, `<FeatureMatrix />`, `<CommandExplorer />`, `<TaskMatrix />`, `<SourceList />` (pie de cada página) y `<LastVerified />`.

`npm run freshness` lista los registros con `verifiedAt` de más de 45 días y las fuentes que no responden. La página de novedades se genera desde `changelog.json`.

## 7. Fases

Una fase por sesión de Claude Code (las de contenido pueden ocupar varias). Al cerrar cada fase: `PROGRESO.md` actualizado, commit, coste anotado y `/clear`. Los encargos listos para pegar están en `04_PROMPTS_DE_FASE.md`.

| Fase | Objetivo | Entregable | Salida (puerta) |
|---|---|---|---|
| 0 | Preparación | Proyecto Astro funcionando, esquemas de datos, scripts | `npm run build` y `npm run check` pasan |
| 1 | Investigación y verificación | `research/*.json` y `src/data/*.json` completos | Verificador sin discrepancias abiertas; **punto de control 1** |
| 2 | Diseño y arquitectura | Sistema de diseño, componentes base, inicio, plantilla de lección, esqueleto del sitio | Capturas aprobadas; **punto de control 2** |
| 3 | Contenido núcleo | M2, M3, M4, M5 y M0 | Revisión editorial superada |
| 4 | Contenido avanzado | M7, M8, M6, M9, M10, M1 y M12 | Revisión editorial superada |
| 5 | Interactivos | Calculadora, selector, explorador de comandos, laboratorio, quizzes y el resto | Tests de lógica verdes y accesibles por teclado |
| 6 | Calidad final | Todas las puertas de §10 en verde | **Punto de control 3** (aprobación para publicar) |
| 7 | Publicación y mantenimiento | Despliegue, README, guía de mantenimiento | Web pública (si el usuario lo aprueba) |

### Fase 0: preparación
1. Convierte `README.md` de UTF-16 a UTF-8 (git lo trata como binario).
2. Crea la rama `feat/web`.
3. Monta Astro + Starlight + React + TypeScript estricto, con eslint, prettier y `.editorconfig`.
4. Scripts de `package.json`: `dev`, `build`, `preview`, `check` (astro check + lint + vitest + enlaces + ortografía), `test:e2e` (Playwright + axe) y `freshness`.
5. Esquemas zod de §6 con ficheros de datos vacíos y `sources.json` sembrado con las URLs oficiales de `02_HECHOS_VERIFICADOS.md`.
6. Completa la sección «Comandos» de `CLAUDE.md`.

### Fase 1: investigación y verificación
1. Lanza en paralelo, en segundo plano, cinco subagentes `investigador` (Haiku 5.5), uno por tema: (a) API y modelos de Anthropic; (b) Claude Code; (c) OpenAI, ChatGPT y Codex; (d) Google Gemini; (e) apps de chat de Claude, guías oficiales de prompting y novedades de 2026. Cada uno escribe `research/<tema>.json` con citas literales y URL (formato en `04_PROMPTS_DE_FASE.md`).
2. Fusiona los resultados en `src/data/` y anota los conflictos entre fuentes.
3. Pasa el subagente `verificador-hechos` (Opus 5.5, esfuerzo high) sobre el 100 % de precios, IDs de modelo, ventanas de contexto y niveles de esfuerzo, y sobre una muestra del 25 % del resto. Corrige cada discrepancia contra la fuente oficial.
4. Reúne al menos 25 novedades fechadas de 2026 en `changelog.json`.
5. **Punto de control 1:** presenta al usuario la tabla de modelos, los conflictos encontrados y lo que no se pudo confirmar.

### Fase 2: diseño y arquitectura
1. Aplica `03_DISENO.md`: tokens, tipografía, temas claro y oscuro, maquetación.
2. Construye el inicio, la plantilla de lección y los componentes base: `Callout`, `Fact`, `ModelTable`, `SourceList`, `KeyTakeaways`, `Steps`, `BeforeAfter`, `PromptTemplate`, `ProviderTabs`, `Checklist` y la carcasa de `Quiz`.
3. Crea todas las páginas del temario como esqueleto (título, descripción, «en preparación») para fijar la barra lateral.
4. Dibuja dos diagramas como prueba de estilo: el ciclo del método y la anatomía de la ventana de contexto.
5. **Punto de control 2:** capturas del inicio y de una lección, en claro, oscuro y móvil (360 px), más tres propuestas de nombre.

### Fase 3: contenido núcleo
Orden: M2 → M3 → M4 → M5 → M0. M0 va al final porque resume a los demás. Por módulo: un subagente `redactor` (Sonnet 5.5) escribe el MDX con los componentes de datos; la sesión principal integra; el `revisor-editorial` (Opus 5.5) revisa; se corrige. Redactores de módulos independientes pueden trabajar en paralelo. Las plantillas de M3 van en `src/content/plantillas/` y también se publican como `.md` descargables.

### Fase 4: contenido avanzado
M7 (con el explorador de comandos alimentado por los datos de la Fase 1), M8, M6, M9, M10, M1 y M12. Mismo circuito de redacción y revisión.

### Fase 5: interactivos
Prioridad: calculadora de coste por tarea → selector de modelo y esfuerzo → explorador de comandos (si no quedó hecho) → laboratorio antes/después → quizzes con progreso → simulador de caché → visualizador de la ventana de contexto → diseñador de equipos de agentes → diagnóstico de madurez. Especificación de cada uno en `01_TEMARIO.md` §Interactivos. La lógica va en `src/lib/` como funciones puras con tests de casos calculados a mano; la interfaz es una isla accesible por teclado.

### Fase 6: calidad final
Todas las puertas de §10. Último repaso del verificador sobre cada `<Fact>` y cualquier cifra en el texto. `/code-review` sobre el diff completo y `/simplify`. **Punto de control 3:** resumen de calidad y petición de aprobación para publicar.

### Fase 7: publicación y mantenimiento
Con aprobación del usuario: workflow de GitHub Actions hacia Pages, README (cómo arrancar, cómo actualizar datos, protocolo de verificación) y `docs/MANTENIMIENTO.md`. Propón, sin crearla, una rutina mensual (`/schedule`) que repita la Fase 1 en pequeño y abra un PR con los datos actualizados. Se crea solo si el usuario acepta.

## 8. Reparto del trabajo por agentes

El propio proyecto aplica lo que enseña el módulo M8: cada tipo de tarea va al modelo que la resuelve con el mejor coste por tarea completada. Los subagentes están definidos en `.claude/agents/`.

| Tipo de trabajo | Quién | Modelo | Esfuerzo | Motivo |
|---|---|---|---|---|
| Orquestar, integrar, decidir arquitectura, editar ficheros compartidos | Sesión principal | Sonnet 5.5 | medium (high en las Fases 2 y 5) | Coherencia: una sola mano en lo compartido |
| Leer documentación oficial y extraer datos con cita | `investigador` | Haiku 5.5 | medium | Extracción en paralelo y barata; su contexto absorbe páginas enormes y devuelve JSON compacto |
| Verificación adversarial de datos | `verificador-hechos` | Opus 5.5 | high | La exactitud es el valor del sitio; un modelo distinto del que extrajo, con contexto limpio |
| Redactar un módulo | `redactor` | Sonnet 5.5 | medium | Buena prosa a coste moderado; un módulo por subagente |
| Revisión editorial y pedagógica | `revisor-editorial` | Opus 5.5 | medium | Mirada fresca que detecta huecos, incoherencias y problemas de tono |
| Componentes interactivos | `dev-componentes` | Sonnet 5.5 | high | Lógica con tests; un error de cálculo publicado es caro |
| Build, enlaces, ortografía, accesibilidad, frescura | Scripts | — | — | Si la entrada determina la salida, es código y no un LLM |
| Investigación abierta de novedades (opcional, una vez) | `/deep-research` | workflow incluido | — | Búsqueda en abanico con verificación cruzada; gasta bastantes tokens |

**Reglas de delegación**
- El subagente no ve la conversación: su encargo es autocontenido (objetivo, ficheros que leer, límites, formato de retorno y criterio de terminado). Plantillas en `04_PROMPTS_DE_FASE.md`.
- Que devuelva un resumen breve y las rutas de lo que escribió, no páginas enteras: lo voluminoso se queda en su contexto.
- Paraleliza lo independiente (investigadores por tema, redactores por módulo) y serializa lo dependiente (datos → contenido → interactivos que leen datos).
- No delegues lo que resuelven una o dos llamadas a herramientas: un `grep` es más rápido que un subagente.
- El cambio de modelo se hace con subagentes, no cambiando el modelo de la sesión principal a mitad de trabajo, porque eso invalida la caché.

## 9. Cómo trabajar en este proyecto (la guía aplicada a ti)

- **Una fase por sesión.** Al empezar: `CLAUDE.md` (se carga solo), `PROGRESO.md` y la sección de la fase. Al cerrar: actualiza `PROGRESO.md`, haz commit, anota lo que marca `/usage` y ejecuta `/clear`.
- **Contexto ligero.** No leas ficheros enormes enteros: usa Grep o lee la sección que necesitas. Deja la lectura masiva a los subagentes.
- **Corrige pronto.** Si corriges lo mismo dos veces, para, replantea el enfoque y anótalo.
- **`/compact` con foco** si una sesión se alarga (por ejemplo, `/compact conserva decisiones de diseño y tareas pendientes`). Para dudas puntuales que no deben quedarse en el contexto, `/btw`.
- **Verifica viendo.** `npm run dev` y captura, o `/run`, antes de dar algo por hecho.
- **Esfuerzo por fase.** `/effort medium` por defecto; `/effort high` en las Fases 2 y 5.

## 10. Calidad

### Definición de terminado de una página
- Sigue la plantilla de página de `01_TEMARIO.md`.
- Todo dato volátil sale de un componente de datos: ninguna cifra de precio, modelo o límite escrita a mano.
- Las recomendaciones se presentan como tales y llevan su motivo.
- Incluye al menos un ejemplo de trabajo real, no solo de programación.
- Fuentes al pie con fecha de verificación.
- Funciona a 360 px, en modo oscuro y con teclado.

### Puertas globales
- Build sin errores ni avisos; `astro check` limpio; tests verdes.
- Cero enlaces internos rotos; externos revisados.
- axe sin violaciones serias o críticas en el inicio, una lección por módulo y cada interactivo.
- Lighthouse ≥ 95 en rendimiento, accesibilidad, buenas prácticas y SEO (inicio y tres lecciones).
- cspell sin errores, con diccionario de proyecto para términos técnicos.
- Verificador sin discrepancias abiertas.

## 11. Puntos de control con el usuario

Al llegar a cada uno, presenta un resumen y espera confirmación antes de seguir.
1. **Tras la Fase 1:** datos verificados, conflictos y lo que no se pudo confirmar.
2. **Tras la Fase 2:** dirección visual (capturas) y nombre del sitio.
3. **Tras la Fase 6:** informe de calidad y permiso para publicar.

## 12. Riesgos

| Riesgo | Mitigación |
|---|---|
| Datos desactualizados al publicar | Capa de datos con fecha, `npm run freshness`, rutina mensual opcional |
| Fuentes contradictorias (abundan los agregadores con datos erróneos) | Solo fuentes oficiales; los conflictos se anotan y se muestran al usuario |
| El conocimiento previo del modelo «corrige» datos nuevos | Regla explícita en `CLAUDE.md`: gana la fuente oficial actual |
| Voz desigual entre redactores | Guía de voz en `03_DISENO.md` y revisión editorial por módulo |
| Coste del propio desarrollo | Haiku para extracción, scripts para lo determinista, `/usage` por fase |
| Crecimiento sin control del alcance | MVP definido en §13; lo demás, en v2 |
| Marcas registradas | Sin logotipos oficiales; nombres de producto en texto |

## 13. MVP y v2

Si hay que publicar antes de terminarlo todo, el MVP es: inicio, M0, M2, M3, M4, M5, M7 (con el explorador de comandos), calculadora de coste, selector de modelo, novedades y chuleta. El resto entra en v2 sin rehacer nada, porque la estructura y los datos ya existen desde la Fase 2.
