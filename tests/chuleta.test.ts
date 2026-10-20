import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import commands from '../src/data/claude-code-commands.json';
import effort from '../src/data/effort.json';

/**
 * La chuleta escribe a mano los comandos y los niveles de esfuerzo (cabe en una hoja impresa).
 * Este test los cruza con los datos: si un comando o un nivel desaparece, falla `npm run check`.
 */
const chuleta = readFileSync(join(process.cwd(), 'src/content/docs/m12-recursos/chuleta.mdx'), 'utf8');

describe('chuleta', () => {
  it('solo cita comandos de Claude Code que existen en los datos', () => {
    const seccion = chuleta.split('## Quince comandos de Claude Code')[1]?.split('\n## ')[0] ?? '';
    const citados = [...seccion.matchAll(/`(\/[a-z-]+)`/g)].map((m) => m[1] ?? '');
    expect(citados.length).toBeGreaterThanOrEqual(15);
    const conocidos = new Set(commands.map((c) => c.command));
    expect(citados.filter((c) => !conocidos.has(c))).toEqual([]);
  });

  it('los niveles de esfuerzo de Claude coinciden con effort.json', () => {
    const claude = effort.find((e) => e.provider === 'anthropic');
    const niveles = claude?.levels.map((l) => l.name) ?? [];
    expect(niveles.length).toBeGreaterThan(0);
    const fila = chuleta.split('\n').find((l) => l.startsWith('| Claude ')) ?? '';
    expect([...fila.matchAll(/`(low|medium|high|xhigh|max)`/g)].map((m) => m[1])).toEqual(niveles);
  });
});
