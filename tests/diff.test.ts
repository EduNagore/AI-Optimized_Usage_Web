import { describe, expect, it } from 'vitest';
import { splitVariables, wordDiff } from '../src/lib/diff';

const join = (parts: Array<{ text: string }>) => parts.map((p) => p.text).join('');

describe('wordDiff', () => {
  it('conserva el texto original en ambos lados', () => {
    const a = 'Resume este informe en cinco puntos.';
    const b = 'Resume este informe para el comité en cinco puntos clave.';
    const d = wordDiff(a, b);
    expect(join(d.before)).toBe(a);
    expect(join(d.after)).toBe(b);
  });

  it('marca solo lo que cambia', () => {
    const d = wordDiff('uno dos tres', 'uno cuatro tres');
    expect(d.before.filter((p) => p.kind === 'del').map((p) => p.text)).toEqual(['dos']);
    expect(d.after.filter((p) => p.kind === 'add').map((p) => p.text)).toEqual(['cuatro']);
  });

  it('textos idénticos no tienen diferencias', () => {
    const d = wordDiff('igual', 'igual');
    expect(d.before).toEqual([{ text: 'igual', kind: 'same' }]);
    expect(d.after).toEqual([{ text: 'igual', kind: 'same' }]);
  });

  it('maneja textos vacíos', () => {
    expect(wordDiff('', 'nuevo').after).toEqual([{ text: 'nuevo', kind: 'add' }]);
    expect(wordDiff('viejo', '').before).toEqual([{ text: 'viejo', kind: 'del' }]);
  });
});

describe('splitVariables', () => {
  it('separa las variables {{x}} del resto', () => {
    expect(splitVariables('Hola {{nombre}}, adiós.')).toEqual([
      { text: 'Hola ', variable: false },
      { text: '{{nombre}}', variable: true },
      { text: ', adiós.', variable: false },
    ]);
  });

  it('devuelve un solo trozo si no hay variables', () => {
    expect(splitVariables('sin variables')).toEqual([{ text: 'sin variables', variable: false }]);
  });
});
