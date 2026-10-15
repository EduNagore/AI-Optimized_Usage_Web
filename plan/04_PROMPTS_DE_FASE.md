# Encargos por fase y por subagente

> Cómo usar este fichero: abre Claude Code en la carpeta del proyecto, ajusta modelo y esfuerzo con las líneas indicadas y pega el encargo de la fase. Al terminar cada fase, ejecuta `/clear` antes de pegar la siguiente: el estado vive en `plan/PROGRESO.md`, no en la conversación.

---

## Fase 0: preparación

```
/model sonnet
/effort medium
```

```
Vamos a construir la web descrita en plan/00_PLAN_MAESTRO.md. Lee ese fichero (secciones 1–7) y ejecuta la Fase 0.

Entregable: proyecto Astro + Starlight + React + TypeScript estricto en la rama feat/web, con los scripts dev, build, preview, check, test:e2e y freshness; esquemas zod para todos los ficheros de datos de la sección 6 (vacíos salvo sources.json, sembrado con las URLs oficiales de plan/02_HECHOS_VERIFICADOS.md §2); README.md convertido a UTF-8; sección «Comandos» de CLAUDE.md completada.

Consulta la última versión estable de cada paquete con npm view y fija versiones exactas.

Terminado cuando npm run build y npm run check pasan con una página de prueba. Actualiza plan/PROGRESO.md, haz commit y dime en pocas líneas qué has montado y cualquier decisión que se aparte del plan.
```

---

## Fase 1: investigación y verificación

```
/model sonnet
/effort medium
```

```
Ejecuta la Fase 1 de plan/00_PLAN_MAESTRO.md. Lee antes plan/02_HECHOS_VERIFICADOS.md entero.

1. Lanza en paralelo y en segundo plano cinco subagentes «investigador», uno por tema, con el encargo de plantilla de plan/04_PROMPTS_DE_FASE.md («Investigador»):
   a) anthropic-api: modelos, precios, esfuerzo, caché, batch, compactación, context editing, tool search, programmatic tool calling, memory tool, skills, Managed Agents, mediciones de la página de optimización de coste.
   b) claude-code: comandos (lista completa), model-config, costes, agentes en paralelo, subagentes, flujos, agent teams, hooks, skills, memoria, permisos, rutinas, /goal, /loop, changelog y resúmenes semanales desde la semana 30 de 2026.
   c) openai: modelos, precios, razonamiento, caché, guía de prompting de GPT-6, ChatGPT (notas de versión), Codex.
   d) google: Gemini 4 Argon, modelos Flash vigentes, precios, thinking_level, caché, Gemini CLI y equivalentes, app de Gemini.
   e) apps-y-prompting: apps de chat de Claude (proyectos, memoria, conectores, skills, artifacts, investigación, Cowork, Claude en Excel y Chrome, planes), guías oficiales de prompting de Anthropic, OpenAI y Google, y novedades de método de 2026.
2. Mientras trabajan, no leas tú la documentación: espera a sus resúmenes.
3. Fusiona research/*.json en src/data/ respetando los esquemas. Anota en PROGRESO.md cada conflicto entre fuentes.
4. Lanza el subagente «verificador-hechos» con el encargo de plantilla sobre: el 100 % de precios, IDs, ventanas de contexto y niveles de esfuerzo, y una muestra aleatoria del 25 % del resto. Corrige lo que señale contra la fuente oficial.
5. Asegura al menos 25 entradas fechadas en changelog.json.

Punto de control 1: preséntame la tabla de modelos resultante, los conflictos, lo que no se pudo confirmar y el coste de la fase según /usage. Espera mi confirmación antes de seguir. Antes de parar, actualiza PROGRESO.md y haz commit.
```

---

## Fase 2: diseño y arquitectura

```
/model sonnet
/effort high
```

```
Ejecuta la Fase 2 de plan/00_PLAN_MAESTRO.md. Lee plan/03_DISENO.md entero y la plantilla de página y el inicio de plan/01_TEMARIO.md.

Construye los tokens de diseño (claro y oscuro), la tipografía, la página de inicio, la plantilla de lección y los componentes base de la sección 6 de 03_DISENO.md. Crea todas las páginas del temario como esqueleto para fijar la barra lateral. Dibuja los diagramas 1 y 2 de 03_DISENO.md §7 como prueba de estilo.

Verifica viendo: arranca el servidor y saca capturas del inicio y de una lección en claro, oscuro y a 360 px. Revisa tú mismo las capturas contra la lista «Lo que hay que evitar» antes de enseñármelas.

Punto de control 2: enséñame las capturas, tres propuestas de nombre para el sitio y cualquier decisión de diseño que quieras que valide. Antes de parar, actualiza PROGRESO.md y haz commit.
```

---

## Fase 3: contenido núcleo (una sesión por módulo o por pareja de módulos)

```
/model sonnet
/effort medium
```

```
Ejecuta la Fase 3 de plan/00_PLAN_MAESTRO.md para los módulos [M2 y M3] (cambia según PROGRESO.md).

Para cada módulo lanza un subagente «redactor» con el encargo de plantilla («Redactor»), en paralelo si los módulos son independientes. Cuando entreguen, integra (navegación, enlaces cruzados, glosario), pasa npm run check y revisa el resultado en el navegador. Después lanza el subagente «revisor-editorial» sobre los módulos y corrige lo que afecte a exactitud, claridad o coherencia; lo meramente opcional, valóralo tú.

Terminado cuando cada página cumple la definición de terminado de 00_PLAN_MAESTRO.md §10. Actualiza PROGRESO.md, haz commit y dime qué módulos quedan.
```

Orden recomendado de sesiones: M2 + M3 → M4 + M5 → M0.

---

## Fase 4: contenido avanzado

Mismo encargo que la Fase 3, con los módulos en este orden: M7 → M8 → M6 + M9 → M10 → M1 + M12. Para M7, el redactor recibe también `src/data/claude-code-commands.json`.

---

## Fase 5: interactivos

```
/model sonnet
/effort high
```

```
Ejecuta la Fase 5 de plan/00_PLAN_MAESTRO.md. Lee la sección «Interactivos (especificación)» de plan/01_TEMARIO.md.

Antes de delegar, define tú los tipos compartidos y las funciones de acceso a datos en src/lib/ (son ficheros compartidos). Después lanza subagentes «dev-componentes», uno por interactivo, en el orden de prioridad del plan; puedes paralelizar los que no comparten ficheros. Cada uno entrega la lógica pura con tests de casos calculados a mano y la isla React accesible.

Integra cada componente en su página, comprueba en el navegador con teclado y a 360 px, y pasa npm run check. Actualiza PROGRESO.md y haz commit por cada componente terminado.
```

---

## Fase 6: calidad final

```
/model sonnet
/effort medium
```

```
Ejecuta la Fase 6 de plan/00_PLAN_MAESTRO.md.

1. Pasa todas las puertas globales de la sección 10 y corrige lo que falle. Las comprobaciones deterministas las hacen los scripts, no subagentes.
2. Lanza el «verificador-hechos» sobre todos los <Fact> y cualquier cifra que aparezca en el texto de las páginas.
3. Lanza el «revisor-editorial» sobre el inicio, M0 y la chuleta, que es lo que más gente leerá.
4. Ejecuta /code-review sobre el diff de feat/web frente a main y después /simplify.

Punto de control 3: dame un informe de calidad (puertas, hallazgos, correcciones, lo pendiente y el coste total del proyecto según PROGRESO.md) y pídeme permiso para publicar. Actualiza PROGRESO.md y haz commit.
```

---

## Fase 7: publicación y mantenimiento (solo con aprobación)

```
Ejecuta la Fase 7 de plan/00_PLAN_MAESTRO.md: workflow de GitHub Actions para GitHub Pages (con site y base correctos), README con cómo arrancar y cómo actualizar datos, y docs/MANTENIMIENTO.md. Propón, sin crearla, una rutina mensual de actualización de datos y espera mi respuesta.
```

---

# Plantillas de encargo para subagentes

Los subagentes no ven la conversación: el encargo debe bastar por sí solo. Sustituye lo que va entre corchetes.

## Investigador

```
Tema: [anthropic-api]. Fecha de hoy: [AAAA-MM-DD].

Objetivo: reunir los datos actuales sobre [lista del tema] desde fuentes oficiales, para alimentar una web de formación que se publicará con estos datos. La exactitud importa más que la cantidad.

Empieza por estas URLs: [URLs del tema en plan/02_HECHOS_VERIFICADOS.md §2]. Puedes seguir enlaces dentro de los mismos dominios oficiales. Usa la línea base de plan/02_HECHOS_VERIFICADOS.md §3 para saber qué buscar y señala cada valor que haya cambiado.

Escribe research/[tema].json con este formato:
{
  "tema": "[tema]",
  "consultadoEl": "[AAAA-MM-DD]",
  "afirmaciones": [
    { "id": "claude-opus-5-5.pricing.input", "afirmacion": "Precio de entrada de Claude Opus 5.5", "valor": 4, "unidad": "USD/MTok",
      "fuenteUrl": "https://…", "cita": "extracto literal breve", "oficial": true, "confianza": "alta|media|baja",
      "cambioRespectoLineaBase": "sin cambios|cambiado: antes X|nuevo", "notas": "" }
  ],
  "novedades": [ { "fecha": "AAAA-MM-DD", "proveedor": "", "titulo": "", "resumen": "", "fuenteUrl": "" } ],
  "noConfirmado": [ { "afirmacion": "", "pista": "dónde se vio", "motivo": "" } ]
}

Terminado cuando el fichero es JSON válido y cubre todos los puntos del tema. Devuélveme solo: número de afirmaciones, lista de cambios respecto a la línea base, lo no confirmado y la ruta del fichero.
```

## Verificador de hechos

```
Objetivo: comprobar, de forma adversarial, que estos datos coinciden con la fuente oficial vigente. Una cifra errónea publicada daña la credibilidad de toda la web.

Revisa: [ficheros y alcance: p. ej. src/data/models.json completo y una muestra aleatoria del 25 % de src/data/features.json].
Para cada dato, abre la fuenteUrl o la fuente oficial más específica y compara valor, unidad y condiciones (tramos, superficie, beta o GA).

Devuélveme una tabla con solo los problemas: id, valor actual, valor correcto, URL y cita, gravedad (error, matiz, pendiente). Si todo cuadra, dilo en una línea. No edites ficheros.
```

## Redactor

```
Módulo: [M3 Prompting moderno]. Escribe las páginas en [src/content/docs/prompting/].

Lee: la sección del módulo en plan/01_TEMARIO.md, la plantilla de página del mismo fichero, la guía de voz de plan/03_DISENO.md §11 y los ficheros de datos [src/data/…]. Lee también una página ya terminada, [ruta], como referencia de tono y estructura.

Público: profesionales que usan IA en el trabajo, técnicos y no técnicos. El objetivo de cada página es que el lector pueda aplicar algo hoy mismo.

Reglas: los datos volátiles se muestran con <Fact> o con las tablas de datos, nunca escritos a mano; si necesitas un dato que no está en src/data/, no lo inventes: anótalo como pendiente. Marca cada recomendación propia con <Callout type="recomendacion"> y su porqué. Al menos un ejemplo de oficina por página. No toques ficheros fuera de tu carpeta.

Terminado cuando todas las páginas del módulo siguen la plantilla y npm run build pasa. Devuélveme: páginas escritas, datos pendientes que necesitas y dudas de enfoque.
```

## Revisor editorial

```
Revisa las páginas de [src/content/docs/prompting/] con mirada de lector exigente y de editor técnico. No las has escrito tú.

Criterios: exactitud (¿hay afirmaciones sin dato o fuente?, ¿se presentan recomendaciones como hechos?), claridad (¿se entiende a la primera?), utilidad (¿el lector puede aplicarlo hoy?), coherencia con el resto del sitio y con la tesis de plan/00_PLAN_MAESTRO.md §2, voz (plan/03_DISENO.md §11) y huecos respecto a plan/01_TEMARIO.md.

Informa solo de lo que afecta a exactitud, comprensión o requisitos del temario; las preferencias de estilo, en una lista aparte marcada como opcional. Formato: fichero, línea o fragmento, problema, propuesta. No edites ficheros.
```

## Desarrollador de componentes

```
Componente: [calculadora de coste por tarea]. Especificación: plan/01_TEMARIO.md, sección «Interactivos», punto [1]. Diseño: plan/03_DISENO.md §8 y §9.

Usa los tipos y accesos a datos de src/lib/[…] (no los modifiques; si necesitas un cambio, dímelo). Escribe:
- la lógica como funciones puras en src/lib/[nombre].ts, con tests en Vitest que incluyan al menos cinco casos calculados a mano y explicados en comentarios;
- la isla React en src/components/interactive/[Nombre].tsx, accesible por teclado, usable a 360 px y con estado inicial de ejemplo.

Terminado cuando los tests pasan y npm run build funciona. Devuélveme: ficheros creados, decisiones de cálculo que conviene validar y limitaciones conocidas.
```
