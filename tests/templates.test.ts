import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Cada <PromptTemplate archivo="x" texto={`…`}> de una lección genera una descarga `x.md`; la página
 * de plantillas (M12) publica src/content/plantillas/x.md con el mismo nombre. Los dos textos
 * deben coincidir: si no, el lector descarga una plantilla distinta según la página desde la que llega.
 */
const docs = join(process.cwd(), 'src/content/docs');
const plantillas = join(process.cwd(), 'src/content/plantillas');

function mdxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? mdxFiles(join(dir, e.name)) : e.name.endsWith('.mdx') ? [join(dir, e.name)] : [],
  );
}

/** Compara el contenido sin el título, ni las líneas en blanco, ni la sangría (Prettier los toca en las lecciones). */
const norm = (s: string) =>
  s
    .replace(/^# .*\n+/, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');

const inline: { file: string; archivo: string; texto: string }[] = [];
for (const file of mdxFiles(docs)) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/archivo="([^"]+)"\s+texto=\{`([\s\S]*?)`\}/g)) {
    inline.push({ file, archivo: m[1]!, texto: m[2]!.trim() });
  }
}
const published = new Set(readdirSync(plantillas).map((f) => f.replace(/\.md$/, '')));

describe('plantillas descargables', () => {
  it('encuentra plantillas en las lecciones', () => {
    expect(inline.length).toBeGreaterThan(10);
  });

  for (const { file, archivo, texto } of inline.filter((t) => published.has(t.archivo))) {
    it(`${archivo} (${file.split('docs')[1]}) coincide con su .md publicado`, () => {
      const md = readFileSync(join(plantillas, `${archivo}.md`), 'utf8');
      expect(norm(md)).toBe(norm(texto));
    });
  }
});
