// Comprueba que los enlaces internos de dist/ apuntan a ficheros que existen.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative } from 'node:path';

const dist = 'dist';
const base = '/AI-Optimized_Usage_Web';
if (!existsSync(dist)) {
  console.error('No existe dist/: ejecuta npm run build antes.');
  process.exit(1);
}

const walk = (d) =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const resolves = (target) => {
  const p = join(dist, target);
  return existsSync(p) && (statSync(p).isFile() || existsSync(join(p, 'index.html')));
};

let broken = 0;
for (const file of walk(dist).filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(file, 'utf8');
  const pageDir = posix.dirname('/' + relative(dist, file).replaceAll('\\', '/'));
  for (const [, href] of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|tel:|data:|#|javascript:)/.test(href)) continue;
    let path = href.split('#')[0].split('?')[0];
    if (!path) continue;
    path = path.startsWith('/') ? path : posix.join(pageDir, path);
    if (path.startsWith(base)) path = path.slice(base.length);
    if (!resolves(decodeURIComponent(path))) {
      broken++;
      console.log(`ROTO  ${relative(dist, file)} → ${href}`);
    }
  }
}
console.log(broken ? `${broken} enlace(s) roto(s)` : 'Enlaces internos correctos');
process.exit(broken ? 1 : 0);
