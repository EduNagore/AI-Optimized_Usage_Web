# Encargo común de los interactivos (Fase 5)

Todos los subagentes `dev-componentes` reciben este documento más una ficha propia. Lo escribe la sesión principal; no lo edites.

## 1. Qué construyes

Un interactivo de la web (Astro + Starlight + React, TypeScript estricto, español de España con tuteo). Especificación general en `plan/01_TEMARIO.md` §Interactivos; sistema de diseño en `plan/03_DISENO.md` §8 (interactivos), §9 (accesibilidad) y §11 (voz). Muchos de estos componentes calculan costes que los lectores usarán para decidir: **un error de cálculo es caro**. La lógica se separa de la interfaz y se prueba a mano.

Lee antes de escribir código: `CLAUDE.md`, los dos §del diseño, tu ficha, la página donde vivirá el interactivo (se indica en la ficha) y los ficheros compartidos de §3.

## 2. Entregables (cada uno en su ruta, con tu nombre de componente `Nombre`)

1. **Lógica pura** en `src/lib/<nombre>.ts`: funciones sin DOM, sin React y sin `astro:content`. Entradas y salidas tipadas; entradas inválidas devuelven un resultado explicado (no lanzan en la interfaz). Exporta también los tipos de los datos que consume.
2. **Tests** en `tests/<nombre>.test.ts` (Vitest). Casos **calculados a mano**, con la aritmética escrita en un comentario encima de cada `expect`; casos límite (cero, vacío, umbrales exactos, entradas inválidas) y una prueba de coherencia con los datos reales de `src/data/` cuando el componente los usa.
3. **Isla React** en `src/components/interactive/Nombre.tsx` (export por defecto, props serializables) con su CSS `Nombre.css` (prefijo propio, p. ej. `.calc-…`) además de importar `./interactive.css`.
4. **Envoltorio Astro** en `src/components/Nombre.astro`: carga los datos con `@lib/data-access` (o importando tu JSON nuevo), renderiza la isla con `client:visible` y un `<noscript>` con una explicación estática útil (qué hace, la fórmula o regla en dos o tres frases y, si cabe, una tabla pequeña). Es lo que ve quien no tiene JavaScript; las islas con `client:visible` se renderizan también en el servidor con su estado inicial, así que el estado inicial debe tener sentido sin interacción.
5. **Datos nuevos**, solo si los necesitas: un fichero nuevo `src/data/<nombre>.json` (array de registros con `id`; si el dato es volátil, `source` —id de `sources.json`— y `verifiedAt`). El esquema zod vive en tu `src/lib/<nombre>.ts` (importa `z` de `astro/zod`), tu test valida el JSON con él y comprueba que cada `source` existe en `sources.json`. No lo registres como colección de Astro: el envoltorio lo importa directamente (`import datos from '../data/<nombre>.json'`). El contenido editorial que escribas (preguntas, textos, reglas) va en español de España, sin grandilocuencia, y distingue **dato verificado**, **medición publicada por un proveedor** y **recomendación de la guía** (con su porqué). Nada que no puedas sostener con una página del sitio o con `src/data/`: si necesitas una cifra volátil que no existe, déjala fuera y dilo en tu respuesta.

## 3. Ficheros compartidos que puedes usar y NO debes modificar

| Fichero | Para qué |
|---|---|
| `src/lib/schemas.ts` | Esquemas zod y tipos (`ModelRecord`, `CommandRecord`, `TaskMatrixRecord`…) |
| `src/lib/pricing.ts` | `PricingCatalog`/`CatalogModel`, `buildCatalog`, `unitPricesFor` (tramos largos y cambios programados), `cacheTtlOptions`, `batchMultiplier`, `formatTtl`. Precios en USD por millón de tokens |
| `src/lib/data-access.ts` | `loadPricingCatalog()`, `loadModels()`, `loadTaskMatrix()`, `loadCommands()`, `loadSources()`… (solo desde `.astro`) |
| `src/lib/storage.ts` | `readJson`, `writeJson`, `removeKey`, `STORAGE_PREFIX` (`localStorage` con try/catch) |
| `src/lib/format.ts` | `formatNumber`, `formatUsd`, `formatTokens`, `formatDate` (formato español) |
| `src/lib/diff.ts` | `wordDiff` |
| `src/components/interactive/interactive.css` | Clases base `.ix-*` (bloque, campos, resultado, tablas, etiquetas, avisos) |
| `src/components/interactive/shared.tsx` | `Field` (etiqueta + ayuda + error enlazados) y `SourceFooter` (fuente y fecha) |
| `src/components/interactive/Quiz.tsx` | Solo lo toca el encargo de quizzes |

Tampoco toques `src/data/*.json` existentes, `package.json`, `astro.config.mjs`, `src/content.config.ts`, `cspell-project.txt`, `.prettierignore` ni las páginas `.mdx` (la sesión principal integra el componente en su página). **No añadas dependencias.** Si necesitas un cambio en un fichero compartido, pídelo en tu respuesta con el motivo.

## 4. Requisitos de la interfaz

- **Teclado completo**, foco visible (ya definido en `.ix`), orden de tabulación lógico, sin trampas. Controles nativos (`<select>`, `<input>`, `<button>`, `<fieldset>`) mejor que `div` con roles; si usas un patrón ARIA, que sea completo (p. ej. pestañas con flechas).
- **360 px de ancho** sin desplazamiento horizontal de la página; las tablas anchas van dentro de un contenedor con desplazamiento (`.ix-table-wrap`, con `role="region"`, `aria-label` y `tabindex="0"`). Zonas pulsables ≥ 44 px.
- **Estado inicial útil**: valores de ejemplo precargados, resultado visible desde el primer render. Sin animaciones gratuitas.
- **Etiquetas visibles** en todos los campos; errores de entrada explicados en una frase (usa `Field`). Los resultados cambian dentro de una región `aria-live="polite"` (breve: el resumen, no la tabla entera).
- **El color nunca es la única señal**: acompáñalo de texto o icono. Usa los tokens (`var(--color-…)`, `var(--sem-…)`); nada de colores sueltos. Funciona en tema claro y oscuro (contraste AA).
- **Hidratación**: no leas `window`, `localStorage` ni la fecha actual durante el render; hazlo en `useEffect`. Usa `useId` para los ids. Si usas fechas «de hoy», pásalas como prop desde el envoltorio (render en el servidor = fecha de la compilación) o léelas tras montar.
- **Fuente y fecha** visibles junto a cualquier cifra tomada de los datos (`SourceFooter`).
- Números con formato español (`format.ts`), dólares con «$» tras la cifra.

## 5. Cómo validar (en paralelo con otros subagentes)

Otros subagentes trabajan a la vez en el mismo árbol de ficheros y comparten `dist/` y `.astro/`. **No ejecutes** `npm run build`, `npm run dev`, `npm run preview`, `npm run check` ni Playwright: los ejecuta la sesión principal al integrar. Sí puedes y debes ejecutar:

- `npx vitest run tests/<tu-test>.test.ts`
- `npx tsc --noEmit -p .` (ignora los errores de ficheros que no son tuyos)
- `npx eslint <tus ficheros>` y `npx prettier --write <tus ficheros>`
- `npx cspell --no-progress <tus ficheros de datos y textos>` si escribes texto en español (no edites `cspell-project.txt`: lista en tu respuesta las palabras legítimas que marque)

## 6. Qué devuelves

Un informe breve (no pegues código): ficheros creados, **decisiones de cálculo o de reglas que conviene validar** (con el porqué), limitaciones conocidas, datos que echaste en falta, cambios que pides en ficheros compartidos y palabras para cspell. Indica también el fragmento MDX con el que se integra el componente (`import … ; <Nombre … />`).
