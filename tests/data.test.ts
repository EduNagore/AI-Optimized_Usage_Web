import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dataSchemas } from '../src/lib/schemas';

const load = (name: string): Array<Record<string, unknown>> =>
  JSON.parse(readFileSync(`src/data/${name}.json`, 'utf8'));

const sourceIds = new Set(load('sources').map((s) => s['id']));

describe.each(Object.entries(dataSchemas))('src/data/%s.json', (name, schema) => {
  const records = load(name);

  it('es un array y cada registro cumple su esquema', () => {
    expect(Array.isArray(records)).toBe(true);
    for (const r of records) expect(() => schema.parse(r)).not.toThrow();
  });

  it('no repite ids', () => {
    const ids = records.map((r) => r['id']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cita fuentes que existen en sources.json', () => {
    for (const r of records) {
      if (typeof r['source'] === 'string') expect(sourceIds.has(r['source'])).toBe(true);
    }
  });
});

describe('sources.json', () => {
  it('está sembrado y solo con fuentes oficiales', () => {
    const sources = load('sources');
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((s) => s['official'] === true)).toBe(true);
  });
});
