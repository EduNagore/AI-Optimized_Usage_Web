export type DiffPart = { text: string; kind: 'same' | 'del' | 'add' };

/** Separa en palabras y espacios, de modo que al unir las partes se recupera el texto exacto. */
function tokenize(s: string): string[] {
  return s.match(/\s+|[^\s]+/g) ?? [];
}

/**
 * Diferencias por palabras entre dos textos mediante la subsecuencia común más larga.
 * Devuelve las partes del texto «antes» (same + del) y del «después» (same + add).
 */
export function wordDiff(before: string, after: string): { before: DiffPart[]; after: DiffPart[] } {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length;
  const m = b.length;
  // lcs[i][j] = longitud de la subsecuencia común de a[i..] y b[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const outBefore: DiffPart[] = [];
  const outAfter: DiffPart[] = [];
  const push = (list: DiffPart[], text: string, kind: DiffPart['kind']) => {
    const last = list[list.length - 1];
    if (last && last.kind === kind) last.text += text;
    else list.push({ text, kind });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push(outBefore, a[i]!, 'same');
      push(outAfter, b[j]!, 'same');
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      push(outBefore, a[i]!, 'del');
      i++;
    } else {
      push(outAfter, b[j]!, 'add');
      j++;
    }
  }
  while (i < n) push(outBefore, a[i++]!, 'del');
  while (j < m) push(outAfter, b[j++]!, 'add');
  return { before: outBefore, after: outAfter };
}

/** Parte un texto en trozos de texto y variables `{{nombre}}` para resaltarlas. */
export function splitVariables(text: string): Array<{ text: string; variable: boolean }> {
  const parts: Array<{ text: string; variable: boolean }> = [];
  let last = 0;
  for (const m of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), variable: false });
    parts.push({ text: m[0], variable: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), variable: false });
  return parts;
}
