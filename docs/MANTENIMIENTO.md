# Mantenimiento

Los datos volátiles caducan: modelos, precios, ventanas de contexto, niveles de esfuerzo, comandos y límites cambian sin avisar. Esta guía fija cómo mantenerlos al día.

## Cadencia

| Frecuencia | Tarea                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| Mensual    | `npm run freshness`; reverificar los registros caducados (más de 45 días) contra la fuente oficial    |
| Mensual    | Revisar notas de versión de Anthropic, OpenAI y Google en busca de modelos, precios o comandos nuevos |
| Por evento | Lanzamiento de un modelo o cambio de precios: actualización inmediata, sin esperar al ciclo           |
| Trimestral | `npm audit`, actualización de dependencias, `npm run test:e2e`, revisión de enlaces rotos             |

## Procedimiento de actualización mensual

1. Rama nueva desde `main`: `git switch -c datos/AAAA-MM`.
2. `npm run freshness`. Cada línea `CADUCADO` es un registro a reverificar; cada `SIN RESPUESTA`, una fuente cuya URL hay que localizar de nuevo (prueba la versión `.md` o `llms.txt`).
3. Reverifica cada registro contra su fuente oficial (`source` → `src/data/sources.json`), con el protocolo de `plan/02_HECHOS_VERIFICADOS.md` §1:
   - solo fuentes oficiales; blogs y agregadores solo como pista;
   - compara valor, unidad y condiciones (modelo exacto, superficie, tramo de contexto, beta o GA);
   - tu memoria no es fuente: muchos productos son posteriores al entrenamiento de cualquier modelo;
   - lo que no se confirma no se publica como dato.
4. Si usas subagentes: `investigador` extrae a `research/` con cita; `verificador-hechos` contrasta de forma adversarial. Solo la sesión principal edita `src/data/`.
5. Actualiza `verifiedAt` en cada registro revisado, también si el valor no cambió.
6. Busca en `src/content/docs/` cifras escritas en el texto que dependan de lo cambiado (deberían ser `<Fact>` o componentes de datos; si no, conviértelas).
7. `npm run build && npm run check`; si tocaste interactivos, `npm run test:e2e`. Mira las páginas afectadas en el navegador.
8. Registra en `plan/PROGRESO.md` qué cambió y por qué.
9. Abre un PR con la tabla antes/después de cada dato modificado y la URL oficial de cada uno.

## Qué hacer ante…

- **Un modelo nuevo:** alta en `models.json`, `effort.json` y `model-pricing-details.json`, y revisión de `selector-rules.json`, `task-matrix.json` y las pruebas de los interactivos que dependan de la lista.
- **Un cambio de precio:** `models.json` y `pricing-rules.json`; las pruebas de la calculadora y del simulador de caché usan casos calculados a mano: recalcúlalos, no los ajustes hasta que pasen.
- **Un modelo retirado:** marcar el estado en los datos, no borrarlo, y anotar la fecha en `changelog.json`.
- **Una fuente oficial que contradice la web:** gana la fuente. Corrige y anótalo en `PROGRESO.md`.
- **Un error avisado por un lector:** reproduce contra la fuente oficial antes de tocar nada.

## Despliegue

Un push a `main` dispara `.github/workflows/deploy.yml` (build + `npm run check` + Pages). Si falla el check, no se publica. Para una publicación manual: Actions → _Desplegar en GitHub Pages_ → _Run workflow_.

## Deuda conocida

Ver «Pendientes tras la Fase 6» en `plan/PROGRESO.md`: quizzes de varios módulos, 211 entradas de `changelog.json` con `impact` pendiente de redactar y canal para avisar de errores.
