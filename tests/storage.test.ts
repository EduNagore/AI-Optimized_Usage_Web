import { afterEach, describe, expect, it, vi } from 'vitest';
import { readJson, removeKey, writeJson } from '../src/lib/storage';

function fakeWindow(storage: Partial<Storage>) {
  vi.stubGlobal('window', { localStorage: storage });
}

afterEach(() => vi.unstubAllGlobals());

describe('storage', () => {
  it('sin window (render en servidor) devuelve el valor por defecto y no escribe', () => {
    expect(readJson('k', 7)).toBe(7);
    expect(writeJson('k', 1)).toBe(false);
    expect(removeKey('k')).toBe(false);
  });

  it('guarda y recupera un valor', () => {
    const map = new Map<string, string>();
    fakeWindow({
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
    });
    expect(writeJson('k', { a: [1, 2] })).toBe(true);
    expect(readJson('k', null)).toEqual({ a: [1, 2] });
    expect(removeKey('k')).toBe(true);
    expect(readJson('k', 'vacío')).toBe('vacío');
  });

  it('si el almacenamiento lanza, no propaga el error', () => {
    const boom = () => {
      throw new Error('bloqueado');
    };
    fakeWindow({ getItem: boom, setItem: boom, removeItem: boom });
    expect(readJson('k', 'por defecto')).toBe('por defecto');
    expect(writeJson('k', 1)).toBe(false);
    expect(removeKey('k')).toBe(false);
  });

  it('si el acceso a localStorage lanza (datos bloqueados), tampoco', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('SecurityError');
      },
    });
    expect(readJson('k', 3)).toBe(3);
    expect(writeJson('k', 1)).toBe(false);
  });

  it('un JSON corrupto o que no pasa la validación devuelve el valor por defecto', () => {
    fakeWindow({ getItem: () => '{no es json' });
    expect(readJson('k', 5)).toBe(5);
    fakeWindow({ getItem: () => '"texto"' });
    expect(readJson('k', 0, (v): v is number => typeof v === 'number')).toBe(0);
  });
});
