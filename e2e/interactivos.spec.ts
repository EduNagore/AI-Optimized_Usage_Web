import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const pages = [
  ['calculadora de coste', 'm5-tokens-y-contexto/calculadora-de-coste/'],
  ['selector de modelo', 'm4-modelo-y-esfuerzo/selector-interactivo/'],
  ['explorador de comandos', 'm7-claude-code/comandos/'],
  ['laboratorio antes y después', 'm3-prompting/laboratorio-antes-despues/'],
  ['quizzes', 'm11-laboratorio/quizzes/'],
  ['simulador de caché', 'm5-tokens-y-contexto/prompt-caching/'],
  ['ventana de contexto', 'm1-fundamentos/ventana-de-contexto/'],
  ['diseñador de equipos', 'm8-agentes/disenador-de-equipos/'],
  ['diagnóstico de madurez', 'm11-laboratorio/diagnostico-de-madurez/'],
] as const;

/** Espera a que la isla visible se hidrate (sin esto, lo escrito antes de hidratar se pierde). */
async function openIsland(page: Page, path: string) {
  await page.goto(path);
  const root = page.locator('.ix').first();
  await root.scrollIntoViewIfNeeded();
  await page.locator('astro-island[client="visible"]:not([ssr])').first().waitFor({ state: 'attached' });
  return root;
}

for (const [name, path] of pages) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`${name} (${colorScheme}): sin violaciones graves de accesibilidad`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openIsland(page, path);
      const { violations } = await new AxeBuilder({ page }).analyze();
      const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual(
        [],
      );
    });
  }

  test(`${name}: a 360 px no hay desplazamiento horizontal`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openIsland(page, path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('calculadora: el estado inicial coincide con el ejemplo y reacciona a los turnos', async ({ page }) => {
  const root = await openIsland(page, 'm5-tokens-y-contexto/calculadora-de-coste/');
  const live = root.locator('[aria-live="polite"]').first();
  await expect(live).toContainText('0,075 $');
  await root
    .getByLabel(/turnos/i)
    .first()
    .fill('5');
  await expect(live).toContainText('0,405 $');
  await root
    .getByLabel(/turnos/i)
    .first()
    .fill('-2');
  await expect(root.locator('.ix-error').first()).toContainText('No puede ser negativo');
});

test('selector: cambiar el tipo de tarea cambia la recomendación', async ({ page }) => {
  const root = await openIsland(page, 'm4-modelo-y-esfuerzo/selector-interactivo/');
  const before = await root.innerText();
  await root.locator('select').first().selectOption({ index: 5 });
  await expect.poll(async () => root.innerText()).not.toBe(before);
});

test('explorador: busca con tolerancia, copia y lee la consulta de la URL', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const root = await openIsland(page, 'm7-claude-code/comandos/?q=compac');
  await expect(root.getByText('2 de 136 comandos')).toBeVisible();
  await root
    .getByRole('button', { name: /^Copiar/ })
    .first()
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('/compact [instructions]');
});

test('laboratorio: las pestañas se manejan con flechas', async ({ page }) => {
  await openIsland(page, 'm3-prompting/laboratorio-antes-despues/');
  const tabs = page.getByRole('tab');
  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[role=tab][aria-selected=true]')).toHaveText('Después');
});

test('quizzes: el progreso se guarda y sobrevive a una recarga', async ({ page }) => {
  const root = await openIsland(page, 'm11-laboratorio/quizzes/');
  await root
    .getByRole('button', { name: /Empezar/ })
    .first()
    .click();
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Comprobar' }).first().click();
  await expect(page.getByText('1 de 6 preguntas comprobadas').first()).toBeVisible();
  await page.reload();
  await page.locator('astro-island[client="visible"]:not([ssr])').first().waitFor({ state: 'attached' });
  await expect(page.getByText('1 de 6 preguntas comprobadas').first()).toBeVisible();
});

test('simulador de caché: con 5 min la conversación fluida acierta en 9 de 10 peticiones', async ({
  page,
}) => {
  await openIsland(page, 'm5-tokens-y-contexto/prompt-caching/');
  await expect(page.getByText('9 aciertos, 1 escritura').first()).toBeVisible();
});

test('ventana de contexto: una acción cambia el resumen anunciado', async ({ page }) => {
  const root = await openIsland(page, 'm1-fundamentos/ventana-de-contexto/');
  const live = root.locator('[aria-live="polite"]').first();
  const before = await live.innerText();
  await root
    .getByRole('button', { name: /Añadir el fichero/ })
    .first()
    .click();
  await expect.poll(async () => live.innerText()).not.toBe(before);
});

test('diseñador de equipos: ofrece una topología y la tabla de roles', async ({ page }) => {
  const root = await openIsland(page, 'm8-agentes/disenador-de-equipos/');
  await expect(root.getByText('Topología recomendada')).toBeVisible();
  await expect(root.getByText('Roles, modelo y esfuerzo de partida')).toBeVisible();
});

test('diagnóstico: se completa con teclado y enfoca el resultado', async ({ page }) => {
  const root = await openIsland(page, 'm11-laboratorio/diagnostico-de-madurez/');
  await root.getByRole('button', { name: 'Empezar el diagnóstico' }).click();
  for (let i = 0; i < 15; i++) {
    await root
      .getByRole('radio')
      .nth(i % 4)
      .check();
    await root
      .getByRole('button', { name: /Siguiente|Ver resultado|Terminar|Finalizar/ })
      .first()
      .click();
  }
  await expect(page.locator(':focus')).toContainText('Tu nivel');
});
