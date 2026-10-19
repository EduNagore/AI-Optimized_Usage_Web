import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pages = [
  ['inicio', ''],
  ['lección de ejemplo', 'm12-recursos/catalogo-de-componentes/'],
  ['índice de módulo', 'm2-metodo/'],
  ['M0: las 10 reglas', 'm0-empieza-aqui/las-10-reglas/'],
  ['M0: glosario', 'm0-empieza-aqui/glosario/'],
  ['M2: coste por tarea', 'm2-metodo/coste-por-tarea/'],
  ['M3: biblioteca de plantillas', 'm3-prompting/biblioteca-de-plantillas/'],
  ['M3: notas por modelo', 'm3-prompting/notas-por-modelo/'],
  ['M4: mapa de modelos', 'm4-modelo-y-esfuerzo/mapa-de-modelos/'],
  ['M4: matriz por tarea', 'm4-modelo-y-esfuerzo/matriz-por-tarea/'],
  ['M5: prompt caching', 'm5-tokens-y-contexto/prompt-caching/'],
  ['M1: ventana de contexto', 'm1-fundamentos/ventana-de-contexto/'],
  ['M6: skills', 'm6-herramientas/skills/'],
  ['M7: comandos', 'm7-claude-code/comandos/'],
  ['M8: patrones', 'm8-agentes/patrones/'],
  ['M9: evals mínimas', 'm9-calidad-y-seguridad/evals-minimas/'],
  ['M10: clasificar 50.000 tickets', 'm10-casos-practicos/clasificar-50000-tickets/'],
  ['M12: chuleta', 'm12-recursos/chuleta/'],
  ['M12: novedades', 'm12-recursos/novedades/'],
  ['M12: fuentes', 'm12-recursos/fuentes/'],
  ['M12: plantillas', 'm12-recursos/plantillas/'],
  ['404', '404.html'],
] as const;

const themes = ['light', 'dark'] as const;

for (const [name, path] of pages) {
  for (const colorScheme of themes) {
    test(`${name} (${colorScheme}): sin violaciones graves de accesibilidad`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      const { violations } = await new AxeBuilder({ page }).analyze();
      const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual(
        [],
      );
    });
  }
}

test.describe('a 360 px', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  for (const [name, path] of pages) {
    test(`${name}: sin desplazamiento horizontal de página`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test('los datos de <Fact> muestran fuente y fecha al recibir el foco', async ({ page }) => {
  await page.goto('m12-recursos/catalogo-de-componentes/');
  const value = page.locator('.fact-value').first();
  await value.focus();
  const tip = page.locator('.fact-tip').first();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Verificado el');
});

test('la lista de comprobación recuerda lo marcado', async ({ page }) => {
  await page.goto('m12-recursos/catalogo-de-componentes/');
  const box = page.getByLabel('Dice para quién es y qué decisión apoya.');
  await box.check();
  await page.reload();
  await expect(page.getByLabel('Dice para quién es y qué decisión apoya.')).toBeChecked();
});

test('el quiz comprueba una respuesta y explica', async ({ page }) => {
  await page.goto('m12-recursos/catalogo-de-componentes/');
  await page.getByLabel('Después del documento').scrollIntoViewIfNeeded();
  // La isla se hidrata al hacerse visible: sin esperarla, la selección se pierde al hidratar.
  await page.locator('astro-island[client="visible"]:not([ssr])').first().waitFor({ state: 'attached' });
  await page.getByLabel('Después del documento').check();
  await page.getByRole('button', { name: 'Comprobar' }).first().click();
  await expect(page.getByText('Correcto.')).toBeVisible();
});

test('el tema claro y el oscuro usan colores distintos', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('');
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('');
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(light).not.toEqual(dark);
});
