import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { wordDiff } from '../src/lib/diff';
import {
  annotationRanges,
  countOccurrences,
  locateAnchor,
  locateAnchors,
  promptLabSchema,
  rangesOverlap,
  segmentParts,
  segmentText,
  validateCase,
  type PromptCase,
} from '../src/lib/prompt-lab';

const join = (segments: Array<{ text: string }>) => segments.map((s) => s.text).join('');

describe('countOccurrences', () => {
  it('cuenta apariciones, también las solapadas', () => {
    // «aaaa» contiene «aa» en las posiciones 0, 1 y 2 -> 3 apariciones (con solape).
    expect(countOccurrences('aaaa', 'aa')).toBe(3);
    // «uno dos tres» contiene «dos» una vez.
    expect(countOccurrences('uno dos tres', 'dos')).toBe(1);
    expect(countOccurrences('uno dos tres', 'cuatro')).toBe(0);
  });

  it('un fragmento vacío no cuenta', () => {
    expect(countOccurrences('texto', '')).toBe(0);
  });
});

describe('locateAnchor', () => {
  it('devuelve la posición exacta de la primera aparición', () => {
    // «Resume » ocupa 7 caracteres (R-e-s-u-m-e = 6, más el espacio = 7), así que «este» va de 7 a 11.
    expect(locateAnchor('Resume este informe', 'este')).toEqual({ start: 7, end: 11 });
  });

  it('si el ancla se repite usa la primera aparición', () => {
    // «la casa de la playa»: la primera «la» empieza en 0 y la segunda en 11.
    expect(locateAnchor('la casa de la playa', 'la')).toEqual({ start: 0, end: 2 });
  });

  it('es literal: distingue mayúsculas y espacios', () => {
    expect(locateAnchor('Resume este informe', 'RESUME')).toBeNull();
    expect(locateAnchor('Resume este informe', 'este  informe')).toBeNull();
  });

  it('ancla ausente o vacía devuelve null', () => {
    expect(locateAnchor('Resume este informe', 'contrato')).toBeNull();
    expect(locateAnchor('Resume este informe', '')).toBeNull();
    expect(locateAnchor('', 'algo')).toBeNull();
  });

  it('incluye bien los caracteres con tilde y las comillas angulares', () => {
    // «Di «no» aquí»: D=0, i=1, espacio=2, «=3, n=4, o=5, »=6 -> «no» entre comillas ocupa 3..7.
    expect(locateAnchor('Di «no» aquí', '«no»')).toEqual({ start: 3, end: 7 });
  });
});

describe('rangesOverlap', () => {
  it('compartir un carácter es solape; solo tocarse, no', () => {
    expect(rangesOverlap({ start: 2, end: 6 }, { start: 4, end: 8 })).toBe(true);
    // [2,6) y [6,10) se tocan en 6 pero no comparten ningún carácter.
    expect(rangesOverlap({ start: 2, end: 6 }, { start: 6, end: 10 })).toBe(false);
    // Un rango contenido en otro solapa.
    expect(rangesOverlap({ start: 0, end: 10 }, { start: 3, end: 4 })).toBe(true);
  });
});

describe('locateAnchors', () => {
  // Posiciones en «0123456789»: cada dígito está en la posición de su valor.
  const text = '0123456789';

  it('localiza varias anclas en el orden de entrada', () => {
    const report = locateAnchors(text, [
      { id: 'x', ancla: '6789' }, // 6..10
      { id: 'y', ancla: '012' }, // 0..3
    ]);
    expect(report.matches).toEqual([
      { id: 'x', range: { start: 6, end: 10 } },
      { id: 'y', range: { start: 0, end: 3 } },
    ]);
    expect(report.missing).toEqual([]);
    expect(report.overlaps).toEqual([]);
  });

  it('detecta los solapes y no confunde con anclas que solo se tocan', () => {
    const report = locateAnchors(text, [
      { id: 'a', ancla: '2345' }, // 2..6
      { id: 'b', ancla: '4567' }, // 4..8: solapa con a (4..6) y con c
      { id: 'c', ancla: '6789' }, // 6..10: toca a en 6 (sin solape) y solapa con b (6..8)
    ]);
    expect(report.overlaps).toEqual([
      ['a', 'b'],
      ['b', 'c'],
    ]);
  });

  it('informa de las anclas ausentes sin romper las demás', () => {
    const report = locateAnchors(text, [
      { id: 'si', ancla: '345' },
      { id: 'no', ancla: 'abc' },
      { id: 'sin-texto', ancla: '' },
    ]);
    expect(report.matches).toEqual([{ id: 'si', range: { start: 3, end: 6 } }]);
    expect(report.missing).toEqual(['no', 'sin-texto']);
  });
});

describe('segmentText', () => {
  it('sin rango devuelve un único trozo normal', () => {
    expect(segmentText('hola mundo', null)).toEqual([
      { text: 'hola mundo', kind: 'same', highlighted: false },
    ]);
  });

  it('un rango vacío tampoco resalta nada', () => {
    expect(segmentText('hola', { start: 2, end: 2 })).toEqual([
      { text: 'hola', kind: 'same', highlighted: false },
    ]);
  });

  it('parte en normal, resaltado y normal', () => {
    // «hola mundo cruel»: «mundo» va de 5 a 10 (h-o-l-a = 4, espacio = 5; m..o = 5 letras).
    expect(segmentText('hola mundo cruel', { start: 5, end: 10 })).toEqual([
      { text: 'hola ', kind: 'same', highlighted: false },
      { text: 'mundo', kind: 'same', highlighted: true },
      { text: ' cruel', kind: 'same', highlighted: false },
    ]);
  });

  it('un rango al principio o al final no deja trozos vacíos', () => {
    expect(segmentText('012345', { start: 0, end: 2 })).toEqual([
      { text: '01', kind: 'same', highlighted: true },
      { text: '2345', kind: 'same', highlighted: false },
    ]);
    expect(segmentText('012345', { start: 4, end: 6 })).toEqual([
      { text: '0123', kind: 'same', highlighted: false },
      { text: '45', kind: 'same', highlighted: true },
    ]);
    // Todo el texto resaltado: un solo trozo.
    expect(segmentText('abc', { start: 0, end: 3 })).toEqual([
      { text: 'abc', kind: 'same', highlighted: true },
    ]);
  });

  it('un rango que sobrepasa el texto se recorta', () => {
    expect(segmentText('abcd', { start: 2, end: 99 })).toEqual([
      { text: 'ab', kind: 'same', highlighted: false },
      { text: 'cd', kind: 'same', highlighted: true },
    ]);
  });

  it('un rango fuera del texto no resalta nada', () => {
    expect(segmentText('abcd', { start: 10, end: 12 })).toEqual([
      { text: 'abcd', kind: 'same', highlighted: false },
    ]);
  });
});

describe('segmentParts', () => {
  it('divide un trozo del diff que cruza el límite del rango y conserva su tipo', () => {
    // Partes: «uno » (0..4), «dos» (4..7, eliminado), « tres» (7..12).
    const parts = [
      { text: 'uno ', kind: 'same' as const },
      { text: 'dos', kind: 'del' as const },
      { text: ' tres', kind: 'same' as const },
    ];
    // Rango 2..9:
    //  - «uno » (0..4): «un» (0..2) fuera, «o » (2..4) dentro.
    //  - «dos» (4..7): entero dentro.
    //  - « tres» (7..12): « t» (7..9) dentro, «res» (9..12) fuera.
    expect(segmentParts(parts, { start: 2, end: 9 })).toEqual([
      { text: 'un', kind: 'same', highlighted: false },
      { text: 'o ', kind: 'same', highlighted: true },
      { text: 'dos', kind: 'del', highlighted: true },
      { text: ' t', kind: 'same', highlighted: true },
      { text: 'res', kind: 'same', highlighted: false },
    ]);
  });

  it('un rango dentro de un solo trozo lo divide en tres sin cambiar su tipo', () => {
    // «ahora mismo» (añadido): rango 2..5 -> «ho» ... es «hor»: a-h-o-r-a, 2..5 = «ora».
    const out = segmentParts([{ text: 'ahora mismo', kind: 'add' }], { start: 2, end: 5 });
    expect(out).toEqual([
      { text: 'ah', kind: 'add', highlighted: false },
      { text: 'ora', kind: 'add', highlighted: true },
      { text: ' mismo', kind: 'add', highlighted: false },
    ]);
  });

  it('ignora las partes vacías', () => {
    expect(segmentParts([{ text: '', kind: 'same' }], { start: 0, end: 3 })).toEqual([]);
  });

  it('con el diff real: resalta el ancla sobre lo añadido', () => {
    // Antes: «Resume este informe». Después: «Resume este informe ahora».
    // El diff deja «Resume este informe» como igual (0..19) y « ahora» como añadido (19..25).
    // «Resume este » son 12 caracteres, «informe» ocupa 12..19 y « ahora» 19..25.
    const after = 'Resume este informe ahora';
    const diff = wordDiff('Resume este informe', after);
    const range = locateAnchor(after, 'informe ahora');
    expect(range).toEqual({ start: 12, end: 25 });
    expect(segmentParts(diff.after, range)).toEqual([
      { text: 'Resume este ', kind: 'same', highlighted: false },
      { text: 'informe', kind: 'same', highlighted: true },
      { text: ' ahora', kind: 'add', highlighted: true },
    ]);
  });

  it('unir los trozos devuelve siempre el texto original', () => {
    const before = 'Escribe un correo diciendo que nos retrasamos.';
    const after = 'Escribe un correo a la responsable de compras diciendo que nos retrasamos dos semanas.';
    const diff = wordDiff(before, after);
    for (const range of [
      null,
      { start: 0, end: 5 },
      { start: 20, end: 40 },
      { start: 0, end: after.length },
    ]) {
      expect(join(segmentParts(diff.after, range))).toBe(after);
      expect(join(segmentParts(diff.before, range))).toBe(before);
    }
  });
});

describe('validateCase', () => {
  const base: PromptCase = {
    id: 'demo',
    titulo: 'Demo',
    escenario: 'Prueba.',
    antes: 'Resume esto.',
    despues: 'Resume esto para el comité. Dame cinco puntos.',
    anotaciones: [
      { id: 'a', ancla: 'para el comité', titulo: 'A', texto: 'A.', principio: 'm3-prompting/principios' },
      { id: 'b', ancla: 'cinco puntos', titulo: 'B', texto: 'B.', principio: 'm3-prompting/principios' },
    ],
  };

  it('un caso correcto no tiene problemas', () => {
    expect(validateCase(base)).toEqual([]);
  });

  it('detecta un ancla ausente', () => {
    const caso = { ...base, anotaciones: [{ ...base.anotaciones[0]!, ancla: 'para el jurado' }] };
    expect(validateCase(caso)).toEqual(['Caso «demo»: el ancla de «a» no aparece en el «después».']);
  });

  it('detecta un ancla ambigua', () => {
    // Con «Resume» repetido dos veces, la anotación no sabría cuál resaltar.
    const ambiguo = { ...base, despues: 'Resume esto. Resume esto.' };
    const problems = validateCase({
      ...ambiguo,
      anotaciones: [{ ...base.anotaciones[0]!, ancla: 'Resume' }],
    });
    expect(problems).toEqual(['Caso «demo»: el ancla de «a» aparece 2 veces en el «después».']);
  });

  it('detecta anclas solapadas y ids repetidos', () => {
    const caso = {
      ...base,
      anotaciones: [
        { ...base.anotaciones[0]!, ancla: 'para el comité. Dame' },
        { ...base.anotaciones[1]!, id: 'a', ancla: 'Dame cinco' },
      ],
    };
    const problems = validateCase(caso);
    expect(problems).toContain('Caso «demo»: la anotación «a» está repetida.');
    expect(problems).toContain('Caso «demo»: las anclas de «a» y «a» se solapan.');
  });

  it('comprueba el ancla del «antes» cuando existe', () => {
    const caso = { ...base, anotaciones: [{ ...base.anotaciones[0]!, anclaAntes: 'Resume esto.' }] };
    expect(validateCase(caso)).toEqual([]);
    const mal = { ...base, anotaciones: [{ ...base.anotaciones[0]!, anclaAntes: 'otra cosa' }] };
    expect(validateCase(mal)).toEqual(['Caso «demo»: el ancla del «antes» de «a» no aparece en el «antes».']);
  });

  it('avisa de espacios en los extremos', () => {
    expect(validateCase({ ...base, despues: ` ${base.despues}` })).toContain(
      'Caso «demo»: «después» tiene espacios al principio o al final.',
    );
  });
});

describe('annotationRanges', () => {
  const caso: PromptCase = {
    id: 'demo',
    titulo: 'Demo',
    escenario: 'Prueba.',
    antes: 'Responde breve.',
    despues: 'Eres un asistente. Responde breve y cita el apartado.',
    anotaciones: [
      {
        id: 'breve',
        ancla: 'Responde breve y cita el apartado.',
        anclaAntes: 'Responde breve.',
        titulo: 'Breve',
        texto: 'Breve.',
        principio: 'm3-prompting/principios',
      },
    ],
  };

  it('devuelve el rango en el «antes» y en el «después»', () => {
    // «Eres un asistente. » son 19 caracteres: «Eres» 4, espacio 5, «un» 7, espacio 8,
    // «asistente» (9 letras) 17, punto 18, espacio 19. El ancla mide 34: 19 + 34 = 53.
    // En el «antes», «Responde breve.» ocupa todo el texto: 15 caracteres, de 0 a 15.
    const expectedLength = 'Responde breve y cita el apartado.'.length;
    expect(expectedLength).toBe(34);
    expect(annotationRanges(caso, 'breve')).toEqual({
      antes: { start: 0, end: 15 },
      despues: { start: 19, end: 53 },
    });
  });

  it('un id desconocido no resalta nada', () => {
    expect(annotationRanges(caso, 'otro')).toEqual({ antes: null, despues: null });
  });
});

// --- Datos reales ------------------------------------------------------------------------------

const raw: unknown = JSON.parse(readFileSync('src/data/prompt-lab.json', 'utf8'));
const parsed = promptLabSchema.safeParse(raw);
const casos = parsed.success ? parsed.data : [];

describe('src/data/prompt-lab.json', () => {
  it('cumple el esquema', () => {
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
  });

  it('tiene los ocho casos de la página', () => {
    expect(casos).toHaveLength(8);
  });

  it('no repite ids de caso ni, dentro de un caso, ids de anotación', () => {
    const ids = casos.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const caso of casos) {
      const annIds = caso.anotaciones.map((a) => a.id);
      expect(new Set(annIds).size, caso.id).toBe(annIds.length);
    }
  });

  it('cada ancla aparece literalmente, una sola vez, y las anclas del «después» no se solapan', () => {
    for (const caso of casos) expect(validateCase(caso), caso.id).toEqual([]);
  });

  it('cada principio apunta a una lección real de M3', () => {
    for (const caso of casos) {
      for (const a of caso.anotaciones) {
        expect(a.principio.startsWith('m3-prompting/'), `${caso.id}/${a.id}`).toBe(true);
        expect(existsSync(`src/content/docs/${a.principio}.mdx`), `${caso.id}/${a.id}: ${a.principio}`).toBe(
          true,
        );
      }
    }
  });

  it('el «después» difiere del «antes» y cada anotación señala algo que el diff marca como cambio', () => {
    for (const caso of casos) {
      expect(caso.despues).not.toBe(caso.antes);
      // Coherencia con la vista «Comparar»: al menos una parte del ancla es texto añadido, es decir,
      // la anotación explica algo que realmente cambió y no un fragmento idéntico en ambos prompts.
      const diff = wordDiff(caso.antes, caso.despues);
      for (const a of caso.anotaciones) {
        const range = locateAnchor(caso.despues, a.ancla)!;
        const touchesAddition = segmentParts(diff.after, range).some(
          (s) => s.highlighted && s.kind === 'add',
        );
        expect(touchesAddition, `${caso.id}/${a.id}`).toBe(true);
      }
    }
  });
});
