/** URL interna respetando `base` (GitHub Pages de proyecto: /AI-Optimized_Usage_Web). */
export function url(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const clean = path.replace(/^\/+/, '');
  return clean === '' ? `${base}/` : `${base}/${clean.replace(/\/?$/, '/')}`;
}
