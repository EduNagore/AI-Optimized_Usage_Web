import type { ReactNode } from 'react';
import { formatDate } from '../../lib/format';
import type { PriceSource } from '../../lib/pricing';

/**
 * Piezas comunes de las islas interactivas. Importa también `./interactive.css` en cada isla.
 */

interface FieldProps {
  /** Id del control; la etiqueta, la ayuda y el error se enlazan a él. */
  id: string;
  label: string;
  hint?: string;
  /** Texto del error de entrada, explicado en frase completa. Marca el control como inválido. */
  error?: string | undefined;
  children: (aria: {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': boolean | undefined;
  }) => ReactNode;
}

/** Etiqueta visible + control + ayuda + error enlazados por `aria-describedby`. */
export function Field({ id, label, hint, error, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="ix-field">
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p className="ix-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="ix-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

interface SourceFooterProps {
  /** Fuentes de las que salen los datos mostrados. */
  sources: PriceSource[];
  /** Fecha de verificación (AAAA-MM-DD). */
  verifiedAt: string;
  /** Texto previo, p. ej. «Precios de» (por defecto, «Datos de»). */
  prefix?: string;
}

/** «Precios de <fuente>, verificados el 16 de octubre de 2026»: cada resultado indica su origen. */
export function SourceFooter({ sources, verifiedAt, prefix = 'Datos de' }: SourceFooterProps) {
  return (
    <p className="ix-source">
      {prefix}{' '}
      {sources.map((s, i) => (
        <span key={s.url}>
          {i > 0 && (i === sources.length - 1 ? ' y ' : ', ')}
          <a href={s.url} rel="noreferrer">
            {s.title}
          </a>
        </span>
      ))}
      , verificados el {formatDate(verifiedAt)}.
    </p>
  );
}
