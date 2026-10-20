// Lista los registros con verifiedAt de más de 45 días y las fuentes que no responden.
// Uso: npm run freshness [-- --offline]  (offline omite la comprobación de URLs)
import { readdirSync, readFileSync } from 'node:fs';

const MAX_DAYS = 45;
const offline = process.argv.includes('--offline');
const today = new Date();
const dir = 'src/data';
let problems = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const records = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'));
  for (const r of records) {
    const date = r.verifiedAt ?? r.lastChecked;
    if (!date) continue;
    const age = Math.floor((today - new Date(date)) / 86_400_000);
    if (age > MAX_DAYS) {
      problems++;
      console.log(`CADUCADO  ${file} · ${r.id} · ${date} (${age} días)`);
    }
  }
}

if (!offline) {
  const sources = JSON.parse(readFileSync(`${dir}/sources.json`, 'utf8'));
  await Promise.all(
    sources.map(async (s) => {
      try {
        const ask = (method) =>
          fetch(s.url, { method, redirect: 'follow', signal: AbortSignal.timeout(15_000) });
        let res = await ask('HEAD');
        // Algunos servidores responden mal a HEAD (404/405): se reintenta con GET.
        if (res.status >= 400) res = await ask('GET');
        // No hace falta el cuerpo: se libera la conexión.
        await res.body?.cancel();
        // 403 y 429 no implican caída (bloqueo de automatismos o límite de peticiones).
        if (res.status >= 400 && ![403, 429].includes(res.status)) throw new Error(`HTTP ${res.status}`);
      } catch (e) {
        problems++;
        console.log(`SIN RESPUESTA  ${s.id} · ${s.url} · ${e.message}`);
      }
    }),
  );
}

console.log(problems ? `${problems} problema(s)` : 'Todo al día');
