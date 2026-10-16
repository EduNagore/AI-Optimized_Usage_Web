/** Formato español de números y fechas (plan/03_DISENO.md §11): 1.200 tokens; 0,25 $; 15 de octubre de 2026. */

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** `useGrouping: 'always'` porque es-ES omite el punto en los números de cuatro cifras (1200). */
export function formatNumber(n: number, maxDecimals = 3): string {
  return new Intl.NumberFormat('es-ES', {
    useGrouping: 'always',
    maximumFractionDigits: maxDecimals,
  }).format(n);
}

/** Dólares por millón de tokens: «4 $», «0,25 $», «12,50 $», «0,025 $». */
export function formatUsd(n: number): string {
  const fraction = Number.isInteger(n) ? 0 : 2;
  const text = new Intl.NumberFormat('es-ES', {
    useGrouping: 'always',
    minimumFractionDigits: fraction,
    maximumFractionDigits: 3,
  }).format(n);
  return `${text} $`;
}

export function formatTokens(n: number): string {
  return `${formatNumber(n)} tokens`;
}

/** Ventanas de contexto: 1.000.000 → «1 M», 200.000 → «200 K». */
export function formatTokensShort(n: number): string {
  if (n >= 1_000_000 && n % 1_000_000 === 0) return `${formatNumber(n / 1_000_000)} M`;
  if (n >= 1_000 && n % 1_000 === 0) return `${formatNumber(n / 1_000)} K`;
  return formatNumber(n);
}

function parseIso(iso: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Fecha AAAA-MM-DD no válida: ${iso}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** «2026-10-15» → «15 de octubre de 2026». Sin zonas horarias: solo se manipulan las partes. */
export function formatDate(iso: string): string {
  const [y, m, d] = parseIso(iso);
  const month = MONTHS[m - 1];
  if (!month) throw new Error(`Mes no válido en ${iso}`);
  return `${d} de ${month} de ${y}`;
}

/** Fecha más reciente de una lista de fechas AAAA-MM-DD (se ordenan bien como texto). */
export function latestDate(dates: string[]): string | undefined {
  return dates.reduce<string | undefined>((a, b) => (a === undefined || b > a ? b : a), undefined);
}

export function formatMinutes(min: number): string {
  return `${formatNumber(min)} min`;
}
