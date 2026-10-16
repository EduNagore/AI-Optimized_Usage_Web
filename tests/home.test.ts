import { describe, expect, it } from 'vitest';
import { buildRoute, firstSentence, selectHighlights, type RoutePage } from '../src/lib/home';

const page = (id: string, order: number, tracks: RoutePage['tracks'], minutes: number): RoutePage => ({
  id,
  title: id,
  tracks,
  readingTime: minutes,
  order,
});

describe('buildRoute', () => {
  const pages = [
    page('m2-metodo/b', 2, ['esencial', 'profesional'], 6),
    page('m0-empieza-aqui/a', 1, ['esencial'], 5),
    page('m2-metodo/a', 1, ['profesional'], 8),
    page('m9-calidad-y-seguridad/x', 1, ['esencial'], 7),
  ];

  it('ordena por módulo y por posición, y suma el tiempo', () => {
    const r = buildRoute(pages, 'esencial');
    expect(r.pages.map((p) => p.id)).toEqual([
      'm0-empieza-aqui/a',
      'm2-metodo/b',
      'm9-calidad-y-seguridad/x',
    ]);
    expect(r.totalMinutes).toBe(18);
  });

  it('ignora las páginas de otras rutas', () => {
    expect(buildRoute(pages, 'tecnica')).toEqual({ pages: [], totalMinutes: 0 });
  });
});

describe('selectHighlights', () => {
  const e = (id: string, date: string, provider: string, title: string) => ({ id, date, provider, title });
  const entries = [
    e('1', '2026-10-15', 'Anthropic', 'Fast mode sale de vista previa'),
    e('2', '2026-10-15', 'Anthropic', 'v2.1.301: variable nueva'),
    e('3', '2026-10-14', 'Anthropic', 'Exportación OpenTelemetry'),
    e('4', '2026-10-14', 'Anthropic', 'Otra de Anthropic'),
    e('5', '2026-10-13', 'Google', 'Gemini 4 Argon en GA'),
    e('6', '2026-10-13', 'Google', 'Gemini CLI v0.64.0'),
    e('7', '2026-10-12', 'OpenAI', 'GPT-6 en ChatGPT'),
  ];

  it('descarta notas de versión y limita por proveedor', () => {
    const r = selectHighlights(entries, 5, 2);
    expect(r.map((x) => x.id)).toEqual(['1', '3', '5', '7']);
  });

  it('respeta el número pedido', () => {
    expect(selectHighlights(entries, 2, 2).map((x) => x.id)).toEqual(['1', '3']);
  });
});

describe('firstSentence', () => {
  it('se queda con la primera frase', () => {
    expect(firstSentence('Primera frase. Segunda frase.')).toBe('Primera frase.');
    expect(firstSentence('Sin punto final')).toBe('Sin punto final');
    expect(firstSentence('Versión 2.1 sale hoy. Más datos.')).toBe('Versión 2.1 sale hoy.');
  });
});
