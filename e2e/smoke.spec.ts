import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pages = [
  ['inicio', ''],
  ['lección de ejemplo', 'm12-recursos/catalogo-de-componentes/'],
  ['esqueleto de lección', 'm2-metodo/ciclo-de-7-pasos/'],
  ['índice de módulo', 'm2-metodo/'],
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
