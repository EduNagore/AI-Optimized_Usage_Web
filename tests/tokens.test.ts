import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast } from '../src/lib/contrast';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

/** Extrae las variables `--x: valor;` del bloque que empieza en `selector {` (sin anidar). */
function block(selector: string, from = 0): Record<string, string> {
  const start = css.indexOf(selector, from);
  if (start < 0) throw new Error(`No se encuentra el bloque ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const vars: Record<string, string> = {};
  for (const m of css.slice(open + 1, close).matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    vars[m[1] as string] = (m[2] as string).trim();
  }
  return vars;
}

const light = block(':root {');
const darkMedia = block(":root:not([data-theme='light'])");
const darkTheme = block(":root[data-theme='dark']");
const themes = { claro: light, oscuro: darkTheme } as const;

describe('tokens de color', () => {
  it('el modo oscuro es idéntico con prefers-color-scheme y con el selector de Starlight', () => {
    expect(darkMedia).toEqual(darkTheme);
  });

  it('el modo oscuro redefine todos los colores del claro', () => {
    const colorKeys = Object.keys(light).filter((k) => k.startsWith('--color-') || k.startsWith('--sem-'));
    expect(Object.keys(darkTheme).sort()).toEqual(colorKeys.sort());
  });

  describe.each(Object.entries(themes))('contraste WCAG AA en modo %s', (_name, t) => {
    const get = (k: string) => t[k] as string;

    it.each([
      ['--color-text', '--color-bg', 4.5],
      ['--color-text', '--color-surface', 4.5],
      ['--color-text', '--color-surface-2', 4.5],
      ['--color-text-muted', '--color-bg', 4.5],
      ['--color-text-muted', '--color-surface', 4.5],
      ['--color-text-muted', '--color-surface-2', 4.5],
      ['--color-heading', '--color-bg', 4.5],
      ['--color-accent', '--color-bg', 4.5],
      ['--color-accent', '--color-surface', 4.5],
      ['--color-accent', '--color-surface-2', 4.5],
      ['--color-accent', '--color-accent-tint', 4.5],
      ['--color-accent-strong', '--color-bg', 4.5],
      ['--color-on-accent', '--color-accent', 4.5],
      ['--color-border-strong', '--color-bg', 3],
      ['--color-border-strong', '--color-surface', 3],
    ])('%s sobre %s ≥ %s', (fg, bg, min) => {
      expect(contrast(get(fg), get(bg))).toBeGreaterThanOrEqual(min);
    });

    it.each(['verificado', 'recomendacion', 'medicion', 'novedad', 'cuidado', 'neutro'])(
      'distintivo %s: texto sobre su fondo ≥ 4,5 y sobre la página ≥ 3',
      (s) => {
        expect(contrast(get(`--sem-${s}-fg`), get(`--sem-${s}-bg`))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(get(`--sem-${s}-fg`), get('--color-bg'))).toBeGreaterThanOrEqual(3);
      },
    );
  });
});
