import { memo, useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import './interactive.css';
import './CommandExplorer.css';
import { Field, SourceFooter } from './shared';
import { formatDate, latestDate } from '../../lib/format';
import {
  applyExplorerState,
  buildIndex,
  copyText,
  countEligible,
  DEFAULT_STATE,
  emptyMessage,
  facetValues,
  hasFilters,
  parseExplorerState,
  resultsSummary,
  searchIndex,
  type CommandEntry,
  type ExplorerState,
} from '../../lib/command-search';

interface Props {
  /** Registros planos con la fuente ya resuelta (ver `buildCommandEntries`). */
  entries: CommandEntry[];
  /** Orden sugerido de las fases en el filtro; las que no estén aquí van después, alfabéticas. */
  phaseOrder?: string[];
  titulo?: string;
}

type CopyKind = 'command' | 'example';
interface CopyFeedback {
  id: string;
  kind: CopyKind;
  ok: boolean;
  text: string;
}

const STATUS_LABEL = { activo: '', alias: 'Alias', eliminado: 'Retirado' } as const;
const FEEDBACK_MS = 2500;
const ANNOUNCE_DELAY_MS = 300;

/** Copia con la API moderna; si no existe o falla, con un `textarea` temporal. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permiso denegado o contexto no seguro: se prueba la alternativa.
  }
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok: boolean;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  previous?.focus();
  return ok;
}

interface CardProps {
  entry: CommandEntry;
  /** Qué botón de esta tarjeta acaba de copiar (y cómo salió), o `null`. */
  feedback: { kind: CopyKind; ok: boolean } | null;
  onCopy: (entry: CommandEntry, kind: CopyKind) => void;
}

/** Memoizada: al escribir solo se montan o desmontan las tarjetas que entran o salen. */
const CommandCard = memo(function CommandCard({ entry, feedback, onCopy }: CardProps) {
  const status = STATUS_LABEL[entry.status];
  const label = (kind: CopyKind, idle: string): string => {
    if (feedback?.kind !== kind) return idle;
    return feedback.ok ? 'Copiado' : 'No se pudo copiar';
  };
  return (
    <li className={`cmdx-item${entry.status === 'eliminado' ? ' is-retired' : ''}`}>
      <div className="cmdx-head">
        <code className="cmdx-cmd">
          <span className="cmdx-name">{entry.command}</span>
          {entry.args && <span className="cmdx-args"> {entry.args}</span>}
        </code>
        {status && (
          <span className={`ix-tag${entry.status === 'eliminado' ? ' is-cuidado' : ''}`}>{status}</span>
        )}
      </div>
      <p className="cmdx-meta">
        {entry.category} · Fase: {entry.phase}
      </p>
      <p className="cmdx-summary">{entry.summary}</p>
      {entry.tokenImpact && (
        <p className="cmdx-meta">
          <strong>Impacto en tokens:</strong> {entry.tokenImpact}
        </p>
      )}
      {entry.example && (
        <p className="cmdx-example">
          <span className="cmdx-meta">Ejemplo</span> <code>{entry.example}</code>
        </p>
      )}
      <div className="cmdx-actions">
        <button
          type="button"
          className="btn cmdx-copy"
          aria-label={`${label('command', 'Copiar')} ${copyText(entry, 'command') ?? entry.command}`}
          onClick={() => onCopy(entry, 'command')}
        >
          {label('command', 'Copiar')}
        </button>
        {entry.example && (
          <button
            type="button"
            className="btn cmdx-copy"
            aria-label={`${label('example', 'Copiar ejemplo')} de ${entry.command}`}
            onClick={() => onCopy(entry, 'example')}
          >
            {label('example', 'Copiar ejemplo')}
          </button>
        )}
        <a
          className="cmdx-doc"
          href={entry.sourceUrl}
          rel="noreferrer"
          aria-label={`Documentación oficial de ${entry.command}`}
        >
          Documentación oficial
        </a>
      </div>
      <p className="cmdx-source">
        Fuente: {entry.sourceTitle} · verificado el {formatDate(entry.verifiedAt)}
      </p>
    </li>
  );
});

export default function CommandExplorer({
  entries,
  phaseOrder = [],
  titulo = 'Explorador de comandos',
}: Props) {
  const uid = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ExplorerState>(DEFAULT_STATE);
  const [urlRead, setUrlRead] = useState(false);
  const [feedback, setFeedback] = useState<CopyFeedback | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const index = useMemo(() => buildIndex(entries), [entries]);
  const categories = useMemo(() => facetValues(entries, 'category'), [entries]);
  const phases = useMemo(() => facetValues(entries, 'phase', phaseOrder), [entries, phaseOrder]);
  const impacts = useMemo(() => facetValues(entries, 'tokenImpact'), [entries]);
  const sources = useMemo(() => {
    const byId = new Map(entries.map((e) => [e.sourceId, { title: e.sourceTitle, url: e.sourceUrl }]));
    return [...byId.values()];
  }, [entries]);
  const verifiedAt = useMemo(() => latestDate(entries.map((e) => e.verifiedAt)), [entries]);

  // La búsqueda va un render por detrás de la escritura: el campo responde al instante.
  const deferredQuery = useDeferredValue(form.query);
  const effective = useMemo<ExplorerState>(() => ({ ...form, query: deferredQuery }), [form, deferredQuery]);
  const hits = useMemo(() => searchIndex(index, effective), [index, effective]);
  const total = useMemo(() => countEligible(index, effective), [index, effective]);
  const filtering = hasFilters(effective);
  const hidden = useMemo(() => {
    if (!filtering || (effective.includeAliases && effective.includeRetired)) return 0;
    return (
      searchIndex(index, { ...effective, includeAliases: true, includeRetired: true }).length - hits.length
    );
  }, [filtering, index, effective, hits.length]);

  // Leer la URL al montar (no en el render: en el servidor no hay `window`).
  useEffect(() => {
    setForm(parseExplorerState(window.location.search, { categories, phases, impacts }));
    setUrlRead(true);
  }, [categories, phases, impacts]);

  // Reflejar el estado en la URL sin añadir entradas al historial.
  useEffect(() => {
    if (!urlRead) return;
    const search = applyExplorerState(window.location.search, effective);
    if (search === window.location.search) return;
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${search}${window.location.hash}`,
    );
  }, [urlRead, effective]);

  // Anuncio para lectores de pantalla: se actualiza cuando el usuario deja de escribir.
  const summary = resultsSummary(hits.length, total, filtering);
  const [announced, setAnnounced] = useState(summary);
  useEffect(() => {
    const t = setTimeout(() => setAnnounced(summary), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(t);
  }, [summary]);

  useEffect(() => () => clearTimeout(feedbackTimer.current), []);

  const onCopy = useCallback((entry: CommandEntry, kind: CopyKind) => {
    const text = copyText(entry, kind);
    if (text === null) return;
    void writeClipboard(text).then((ok) => {
      setFeedback({
        id: entry.id,
        kind,
        ok,
        text: ok ? `Copiado: ${text}` : 'No se ha podido copiar. Selecciona el comando y cópialo con Ctrl+C.',
      });
      clearTimeout(feedbackTimer.current);
      feedbackTimer.current = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    });
  }, []);

  const update = (patch: Partial<ExplorerState>) => setForm((f) => ({ ...f, ...patch }));
  const isDefault =
    form.query === '' &&
    form.category === '' &&
    form.phase === '' &&
    form.tokenImpact === '' &&
    form.includeAliases === DEFAULT_STATE.includeAliases &&
    form.includeRetired === DEFAULT_STATE.includeRetired;
  const reset = () => {
    setForm(DEFAULT_STATE);
    searchRef.current?.focus();
  };

  const select = (
    id: string,
    label: string,
    value: string,
    options: string[],
    onChange: (v: string) => void,
    all: string,
  ) => (
    <Field id={id} label={label}>
      {(aria) => (
        <select {...aria} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{all}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
    </Field>
  );

  return (
    <section className="ix cmdx not-content" aria-label={titulo}>
      <p className="ix-title">{titulo}</p>
      <p className="ix-lead">
        Busca por nombre, descripción, categoría o argumentos. Tolera tildes, mayúsculas y erratas leves.
      </p>

      <div role="search" aria-label="Buscar comandos">
        <div className="ix-fields">
          <div className="cmdx-wide">
            <Field
              id={`${uid}-q`}
              label="Buscar un comando"
              hint="Por ejemplo: compac, coste, permisos o /model."
            >
              {(aria) => (
                <input
                  {...aria}
                  ref={searchRef}
                  type="search"
                  value={form.query}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => update({ query: e.target.value })}
                />
              )}
            </Field>
          </div>
          {select(
            `${uid}-cat`,
            'Categoría',
            form.category,
            categories,
            (v) => update({ category: v }),
            'Todas',
          )}
          {select(
            `${uid}-fase`,
            'Fase del trabajo',
            form.phase,
            phases,
            (v) => update({ phase: v }),
            'Todas',
          )}
          {impacts.length > 0 &&
            select(
              `${uid}-imp`,
              'Impacto en tokens',
              form.tokenImpact,
              impacts,
              (v) => update({ tokenImpact: v }),
              'Cualquiera',
            )}
        </div>

        <fieldset className="ix-field cmdx-status">
          <legend>Incluir también</legend>
          <div className="cmdx-checks">
            <label className="ix-choice">
              <input
                type="checkbox"
                checked={form.includeAliases}
                onChange={(e) => update({ includeAliases: e.target.checked })}
              />
              <span>Alias</span>
            </label>
            <label className="ix-choice">
              <input
                type="checkbox"
                checked={form.includeRetired}
                onChange={(e) => update({ includeRetired: e.target.checked })}
              />
              <span>Comandos retirados</span>
            </label>
          </div>
        </fieldset>
      </div>

      <div className="cmdx-bar">
        <p className="cmdx-count" role="status" aria-live="polite" aria-atomic="true">
          {announced}
        </p>
        {!isDefault && (
          <button type="button" className="btn" onClick={reset}>
            Quitar búsqueda y filtros
          </button>
        )}
      </div>
      {hidden > 0 && (
        <p className="ix-hint">
          Hay {hidden} {hidden === 1 ? 'coincidencia más' : 'coincidencias más'} entre los alias o los
          comandos retirados que has dejado fuera.
        </p>
      )}

      {hits.length === 0 ? (
        <div className="ix-note cmdx-empty">
          <p>{emptyMessage(effective)}</p>
        </div>
      ) : (
        <ul className="cmdx-list" aria-label="Comandos">
          {hits.map(({ entry }) => (
            <CommandCard
              key={entry.id}
              entry={entry}
              feedback={feedback?.id === entry.id ? { kind: feedback.kind, ok: feedback.ok } : null}
              onCopy={onCopy}
            />
          ))}
        </ul>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {feedback?.text ?? ''}
      </p>

      {impacts.length === 0 && (
        <p className="ix-hint">
          Este catálogo todavía no recoge el impacto en tokens de cada comando, por eso no hay filtro para
          ello.
        </p>
      )}
      {verifiedAt && <SourceFooter sources={sources} verifiedAt={verifiedAt} />}
    </section>
  );
}
