import { describe, expect, it } from 'vitest';
import { resolveFact, type FactModel } from '../src/lib/facts';

const models: FactModel[] = [
  {
    id: 'demo',
    name: 'Modelo de prueba',
    apiId: 'demo-1',
    contextWindow: 1_000_000,
    pricing: { input: 4, output: 20, cacheRead: 0.2, cacheWrite1h: null },
    source: 's',
    verifiedAt: '2026-10-16',
  },
];

describe('resolveFact', () => {
  it('formatea precios y ventanas', () => {
    expect(resolveFact(models, 'demo.pricing.input').display).toBe('4 $');
    expect(resolveFact(models, 'demo.pricing.cacheRead').display).toBe('0,20 $');
    expect(resolveFact(models, 'demo.contextWindow').display).toBe('1.000.000 tokens');
    expect(resolveFact(models, 'demo.contextWindow', true).display).toBe('1 M');
    expect(resolveFact(models, 'demo.apiId').display).toBe('demo-1');
  });

  it('devuelve fuente, fecha y etiqueta', () => {
    const f = resolveFact(models, 'demo.pricing.output');
    expect(f).toMatchObject({ source: 's', verifiedAt: '2026-10-16' });
    expect(f.label).toBe('Modelo de prueba · precio de salida por millón de tokens');
  });

  it('falla con un error claro si el dato no existe', () => {
    expect(() => resolveFact(models, 'nada.pricing.input')).toThrow(/no existe el modelo/);
    expect(() => resolveFact(models, 'demo')).toThrow(/falta la ruta/);
    expect(() => resolveFact(models, 'demo.pricing.cacheWrite1h')).toThrow(/no es un número/);
    expect(() => resolveFact(models, 'demo.pricing.nope')).toThrow();
  });
});
