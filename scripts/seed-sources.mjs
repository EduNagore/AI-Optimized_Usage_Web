// Siembra src/data/sources.json con las URLs oficiales de plan/02_HECHOS_VERIFICADOS.md §2.
// Uso único en la Fase 0; después sources.json se edita a mano o lo amplía la Fase 1.
import { readFileSync, writeFileSync } from 'node:fs';

const md = readFileSync('plan/02_HECHOS_VERIFICADOS.md', 'utf8');
const section = md.split('## 2. Fuentes oficiales')[1].split('\n---')[0];
const publishers = {
  'Anthropic: plataforma y API': 'Anthropic',
  'Anthropic: Claude Code': 'Anthropic',
  OpenAI: 'OpenAI',
  Google: 'Google',
};
const prefixes = {
  'Anthropic: plataforma y API': 'anthropic',
  'Anthropic: Claude Code': 'claude-code',
  OpenAI: 'openai',
  Google: 'google',
};
const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const out = [];
const seen = new Set();
let current = null;
for (const line of section.split('\n')) {
  const h = line.match(/^### (.+)/);
  if (h) {
    current = h[1].trim();
    continue;
  }
  const m = line.match(/^- ([^:]+): (https?:\/\/[^\s)`]+)/);
  if (!m || !current) continue;
  let id = `${prefixes[current]}-${slug(m[1])}`;
  while (seen.has(id)) id += '-2';
  seen.add(id);
  out.push({
    id,
    title: m[1].trim().replace(/^\w/, (c) => c.toUpperCase()),
    url: m[2].replace(/[.,]$/, ''),
    publisher: publishers[current],
    official: true,
    lastChecked: '2026-10-15',
  });
}
writeFileSync('src/data/sources.json', JSON.stringify(out, null, 2) + '\n');
console.log(`${out.length} fuentes`);
