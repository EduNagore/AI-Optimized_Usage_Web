# Diseño, voz y estilo

## 1. Personalidad
Un manual técnico de referencia: sobrio, preciso y editorial. Debe transmitir que los datos son fiables y que el lector sale con algo aplicable. Denso en contenido pero cómodo de leer. Nada de estética de «startup de IA».

## 2. Lo que hay que evitar (estilos por defecto que delatan una web genérica)
- Fondo crema o beige.
- Palabras en cursiva de acento dentro de los titulares.
- Etiquetas de sección numeradas tipo «01 / 02 / 03».
- Etiquetas o rótulos en tipografía monoespaciada (la monoespaciada es solo para código y comandos).
- Botones en forma de píldora.
- Degradados morado-azul, «blobs», glassmorphism y brillos.
- Emojis como iconos.
- Tarjetas con sombras exageradas y bordes muy redondeados.
- Hero con imagen de stock o ilustración genérica de robots y cerebros.

Si al ver la primera captura de la Fase 2 aparece otro estilo por defecto, añádelo a esta lista.

## 3. Color
- Todos los colores como tokens en `:root`, redefinidos para modo oscuro con `@media (prefers-color-scheme: dark)` y con el selector de tema de Starlight.
- Base neutra (grises fríos) y **un** acento con personalidad, por ejemplo un verde azulado profundo. Evita el índigo y el morado, que son el cliché del sector.
- Colores semánticos para los distintivos: verificado (verde), recomendación (acento), medición publicada (azul), novedad (ámbar), cuidado (rojo). Siempre acompañados de icono y texto, nunca solo color.
- Los proveedores no llevan sus colores de marca: se distinguen por nombre y por la pestaña.
- Contraste mínimo WCAG AA (4,5:1 en texto, 3:1 en elementos gráficos), comprobado en ambos temas.

## 4. Tipografía
- Una sans serif de lectura con buena cobertura del español y cifras tabulares (opciones: IBM Plex Sans, Source Sans 3, Public Sans) y su monoespaciada para código. Autoalojadas con Fontsource y con subconjunto latino.
- Cuerpo de 17–18 px, interlineado 1,6, líneas de 65–75 caracteres.
- Escala tipográfica modular y consistente; titulares en peso semibold, sin mayúsculas forzadas.
- Cifras tabulares en tablas de precios y calculadoras.

## 5. Maquetación
- Starlight para las lecciones (barra lateral, índice de la página, búsqueda); página de inicio propia.
- Diseño desde móvil: margen lateral de 16 px, sin desplazamiento horizontal de página. Las tablas anchas van en un contenedor con desplazamiento propio y una pista visual, o se apilan como fichas en móvil.
- Ritmo vertical consistente (múltiplos de 4 u 8 px).
- Impresión: CSS de impresión para la chuleta y las plantillas (sin navegación, enlaces con URL visible).

## 6. Componentes
| Componente | Uso |
|---|---|
| `KeyTakeaways` | Bloque «En 30 segundos» |
| `Callout` | Distintivos: dato verificado, recomendación, medición publicada, novedad 2026, varía según el proveedor, cuidado |
| `Fact` | Dato en línea desde `src/data/` con tooltip de fuente y fecha |
| `ModelTable`, `FeatureMatrix`, `TaskMatrix` | Tablas generadas desde datos |
| `ProviderTabs` | Pestañas Claude / OpenAI / Google sincronizadas en toda la página |
| `Steps` | Procedimientos numerados (aquí sí, porque el orden importa) |
| `BeforeAfter` | Comparación de prompts con diferencias resaltadas |
| `PromptTemplate` | Plantilla con variables resaltadas, botón de copiar y descarga `.md` |
| `CommandCard` | Ficha de un comando `/` |
| `Checklist` | Lista marcable (estado local) |
| `Quiz` | Preguntas con explicación |
| `SourceList`, `LastVerified` | Pie de fuentes y fecha |
| `Diagram` | Contenedor accesible para SVG (título, descripción, texto alternativo largo) |

## 7. Diagramas
SVG en línea con `currentColor` y tokens para que funcionen en ambos temas; texto real (no trazados) para que sea accesible y traducible; cada uno con `<title>` y descripción. Lista mínima:
1. El ciclo del método (7 pasos).
2. Anatomía de la ventana de contexto.
3. El prefijo de caché: herramientas → sistema → mensajes, con puntos de corte y la zona variable.
4. La escalera: llamada única → flujo → agente → multiagente.
5. Los patrones de orquestación (uno por patrón).
6. El bucle de un agente.
7. El orden de las palancas de ahorro (gratis frente a compromisos).

## 8. Interactivos
- Estado vacío útil (valores de ejemplo precargados).
- Resultados con cifras grandes y desglose debajo; sin animaciones gratuitas; respeta `prefers-reduced-motion`.
- Etiquetas visibles en todos los campos; errores de entrada explicados en texto.
- Cada resultado indica de dónde salen los precios y su fecha.

## 9. Accesibilidad y rendimiento
- WCAG 2.2 AA: teclado completo, foco visible, `lang="es"`, jerarquía de encabezados correcta, textos alternativos, regiones ARIA solo donde aportan.
- JS solo en islas (`client:visible`); imágenes con `astro:assets`; fuentes con subconjunto y `font-display: swap`.
- Lighthouse ≥ 95 en las cuatro categorías.

## 10. SEO y compartición
Título y descripción por página, sitemap, URLs canónicas, imágenes Open Graph generadas por página con el título, datos estructurados de tipo artículo o curso donde encaje.

---

## 11. Guía de voz

**Tono:** profesional, directo, cercano. Tuteo. Español de España.

**Hacer**
- Frases cortas; una idea por párrafo.
- Empezar por lo que el lector gana o evita.
- Ejemplos de oficina reales (un informe, un contrato, un Excel, un correo), no solo de programación.
- Decir el porqué de cada recomendación.
- Cifras siempre desde datos, con su fecha.
- Explicar el término técnico la primera vez y enlazarlo al glosario.

**Evitar**
- Grandilocuencia: «revolucionario», «game changer», «el futuro ya está aquí», «potencia tu productividad».
- Prometer resultados no medidos.
- Anglicismos innecesarios cuando hay término claro en español (pero se respetan los nombres de parámetros, comandos y funciones tal como aparecen en la interfaz).
- Presentar una recomendación propia como si fuera un dato oficial.
- Bloques de viñetas para explicar razonamientos: la prosa conecta las ideas con su porqué; las listas son para pasos, opciones y referencias.

**Convenciones**
- Comandos, parámetros, ficheros y IDs en `código`.
- Nombres de producto con su grafía oficial (Claude Code, ChatGPT, Gemini 4 Argon).
- Números con formato español (1.200 tokens; 0,25 $), salvo dentro de código.
- Fechas en texto como «15 de octubre de 2026»; en datos, AAAA-MM-DD.
