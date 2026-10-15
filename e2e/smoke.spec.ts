import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('la página de prueba carga y no tiene violaciones graves de accesibilidad', async ({ page }) => {
  await page.goto('prueba/hola/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious).toEqual([]);
});
