import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { copyText } from '../../lib/clipboard';
import { wordDiff } from '../../lib/diff';
import {
  annotationRanges,
  segmentParts,
  type PromptCase,
  type Range,
  type Segment,
} from '../../lib/prompt-lab';
import { Field } from './shared';
import './interactive.css';
import './PromptLab.css';

export interface LessonLink {
  titulo: string;
  href: string;
}

interface Props {
  casos: PromptCase[];
  /** Lecciones a las que enlazan las anotaciones, por ruta (`m3-prompting/principios`). */
  lecciones?: Record<string, LessonLink>;
}

type View = 'antes' | 'despues' | 'comparar';

const VIEWS: ReadonlyArray<{ id: View; label: string }> = [
  { id: 'antes', label: 'Antes' },
  { id: 'despues', label: 'Después' },
  { id: 'comparar', label: 'Comparar' },
];

/** Agrupa trozos consecutivos del mismo tipo: cada grupo es un único `<del>` o `<ins>`. */
function groupByKind(segments: Segment[]): Segment[][] {
  const groups: Segment[][] = [];
  for (const s of segments) {
    const last = groups[groups.length - 1];
    if (last && last[0]!.kind === s.kind) last.push(s);
    else groups.push([s]);
  }
  return groups;
}

interface MarkedTextProps {
  segments: Segment[];
  /** Texto de la etiqueta visible («Nota 2») que precede al primer fragmento resaltado. */
  badge: string | null;
}

/**
 * Texto con sus diferencias (tachado = eliminado; subrayado y negrita = añadido, con texto oculto
 * para lectores de pantalla) y el fragmento de la nota activa marcado con borde y etiqueta.
 */
function MarkedText({ segments, badge }: MarkedTextProps) {
  let badgePending = badge !== null;
  const renderGroup = (group: Segment[]): ReactNode =>
    group.map((s, i) => {
      if (!s.highlighted) return <span key={i}>{s.text}</span>;
      const showBadge = badgePending;
      badgePending = false;
      return (
        <mark className="lab-mark" key={i}>
          {showBadge && <span className="lab-badge">{badge}</span>}
          {s.text}
        </mark>
      );
    });
  return (
    <>
      {groupByKind(segments).map((group, g) => {
        const kind = group[0]!.kind;
        if (kind === 'del') {
          return (
            <del key={g}>
              <span className="sr-only">[eliminado: </span>
              {renderGroup(group)}
              <span className="sr-only">]</span>
            </del>
          );
        }
        if (kind === 'add') {
          return (
            <ins key={g}>
              <span className="sr-only">[añadido: </span>
              {renderGroup(group)}
              <span className="sr-only">]</span>
            </ins>
          );
        }
        return <span key={g}>{renderGroup(group)}</span>;
      })}
    </>
  );
}

interface PanelProps {
  side: 'antes' | 'despues';
  title: string;
  segments: Segment[];
  badge: string | null;
  onCopy: () => void;
}

function PromptPanel({ side, title, segments, badge, onCopy }: PanelProps) {
  return (
    <section className={`lab-panel lab-panel-${side}`} aria-label={title}>
      <div className="lab-panel-head">
        <p className="lab-panel-title">{title}</p>
        <button type="button" className="btn lab-copy" onClick={onCopy}>
          Copiar el {title.toLowerCase()}
        </button>
      </div>
      <p className="lab-text">
        <MarkedText segments={segments} badge={badge} />
      </p>
    </section>
  );
}

/** Laboratorio antes/después: alterna los dos prompts, resalta diferencias y explica cada cambio. */
export default function PromptLab({ casos, lecciones = {} }: Props) {
  const baseId = useId();
  const [caseIndex, setCaseIndex] = useState(0);
  const [view, setView] = useState<View>('comparar');
  const [hideAfter, setHideAfter] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(casos[0]?.anotaciones[0]?.id ?? null);
  const [status, setStatus] = useState('');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const caso = casos[caseIndex];
  const diff = useMemo(() => (caso ? wordDiff(caso.antes, caso.despues) : null), [caso]);
  if (!caso || !diff) return null;

  const activeIndex = caso.anotaciones.findIndex((a) => a.id === activeId);
  // Con el «después» oculto las notas también lo están: no se resalta nada.
  const active = activeIndex >= 0 && !hideAfter ? caso.anotaciones[activeIndex] : undefined;
  const ranges: { antes: Range | null; despues: Range | null } = active
    ? annotationRanges(caso, active.id)
    : { antes: null, despues: null };
  const badge = active ? `Nota ${activeIndex + 1}` : null;

  const selectId = `${baseId}-caso`;
  const hideId = `${baseId}-ocultar`;
  const panelId = `${baseId}-panel`;
  const tabId = (v: View) => `${baseId}-tab-${v}`;

  const onSelectCase = (value: string) => {
    const index = Number(value);
    const next = casos[index];
    if (!next) return;
    setCaseIndex(index);
    setActiveId(next.anotaciones[0]?.id ?? null);
    setStatus(`Caso ${index + 1} de ${casos.length}: ${next.titulo}.`);
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = VIEWS.length - 1;
    let next = -1;
    if (e.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (e.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next < 0) return;
    e.preventDefault();
    setView(VIEWS[next]!.id);
    tabRefs.current[next]?.focus();
  };

  const copy = async (which: 'antes' | 'despues') => {
    const text = which === 'antes' ? caso.antes : caso.despues;
    // Si falla, el texto sigue siendo seleccionable.
    const message = (await copyText(text))
      ? `Copiado el «${which === 'antes' ? 'antes' : 'después'}» al portapapeles.`
      : 'No se pudo copiar: selecciona el texto a mano.';
    setStatus(message);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus(''), 3000);
  };

  const plainBefore = segmentParts([{ text: caso.antes, kind: 'same' }], ranges.antes);
  const plainAfter = segmentParts([{ text: caso.despues, kind: 'same' }], ranges.despues);
  const diffBefore = segmentParts(diff.before, ranges.antes);
  const diffAfter = segmentParts(diff.after, ranges.despues);

  const hiddenNote = (
    <section className="lab-panel lab-panel-oculto" aria-label="Después oculto">
      <p className="lab-text">
        El «después» está oculto. Intenta mejorar el «antes» por tu cuenta y desmarca «Ocultar el después»
        para comparar.
      </p>
    </section>
  );

  let panels: ReactNode;
  if (view === 'antes') {
    panels = (
      <div className="lab-panels">
        <PromptPanel
          side="antes"
          title="Antes"
          segments={plainBefore}
          badge={badge}
          onCopy={() => void copy('antes')}
        />
      </div>
    );
  } else if (hideAfter && view === 'despues') {
    panels = <div className="lab-panels">{hiddenNote}</div>;
  } else if (hideAfter) {
    panels = (
      <div className="lab-panels lab-panels-two">
        <PromptPanel
          side="antes"
          title="Antes"
          segments={plainBefore}
          badge={badge}
          onCopy={() => void copy('antes')}
        />
        {hiddenNote}
      </div>
    );
  } else if (view === 'despues') {
    panels = (
      <div className="lab-panels">
        <PromptPanel
          side="despues"
          title="Después"
          segments={plainAfter}
          badge={badge}
          onCopy={() => void copy('despues')}
        />
      </div>
    );
  } else {
    panels = (
      <>
        <div className="lab-panels lab-panels-two">
          <PromptPanel
            side="antes"
            title="Antes"
            segments={diffBefore}
            badge={badge}
            onCopy={() => void copy('antes')}
          />
          <PromptPanel
            side="despues"
            title="Después"
            segments={diffAfter}
            badge={badge}
            onCopy={() => void copy('despues')}
          />
        </div>
        <p className="lab-legend">
          <del>Tachado</del>: se elimina · <ins>Subrayado</ins>: se añade ·{' '}
          <mark className="lab-mark">Con borde</mark>: fragmento de la nota abierta
        </p>
      </>
    );
  }

  const notesTitleId = `${baseId}-notas`;
  const showsAnchorHint = active !== undefined && view === 'antes' && ranges.antes === null;

  return (
    <section className="ix lab" aria-labelledby={`${baseId}-titulo`}>
      <p className="ix-title" id={`${baseId}-titulo`}>
        Laboratorio antes y después
      </p>
      <p className="ix-lead">
        Elige un caso y alterna entre el prompt de partida y el mejorado. Las notas explican qué cambió y por
        qué.
      </p>

      <div className="lab-case">
        <Field id={selectId} label="Caso">
          {(aria) => (
            <select {...aria} value={caseIndex} onChange={(e) => onSelectCase(e.target.value)}>
              {casos.map((c, i) => (
                <option key={c.id} value={i}>
                  {i + 1}. {c.titulo}
                </option>
              ))}
            </select>
          )}
        </Field>
        <p className="lab-escenario">
          <strong>Para qué se usa:</strong> {caso.escenario}
        </p>
      </div>

      <div className="lab-controls">
        <div className="lab-tabs" role="tablist" aria-label="Vista del caso">
          {VIEWS.map((v, i) => {
            const selected = v.id === view;
            return (
              <button
                key={v.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={tabId(v.id)}
                className="btn lab-tab"
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => setView(v.id)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                {v.label}
              </button>
            );
          })}
        </div>
        <label className="ix-choice lab-hide" htmlFor={hideId}>
          <input
            id={hideId}
            type="checkbox"
            checked={hideAfter}
            onChange={(e) => setHideAfter(e.target.checked)}
          />
          <span>Ocultar el después</span>
        </label>
      </div>
      <p className="ix-hint lab-tip">Antes de ver el después, tápalo e intenta mejorar el antes.</p>

      <div role="tabpanel" id={panelId} aria-labelledby={tabId(view)} className="lab-view">
        {panels}
      </div>

      <div className="lab-notes">
        <p className="lab-notes-title" id={notesTitleId}>
          Anotaciones: qué cambió y por qué
        </p>
        {hideAfter ? (
          <p className="ix-note">Las anotaciones señalan fragmentos del «después» y están ocultas con él.</p>
        ) : (
          <ol className="lab-note-list" aria-labelledby={notesTitleId}>
            {caso.anotaciones.map((a, i) => {
              const open = a.id === activeId;
              const bodyId = `${baseId}-nota-${a.id}`;
              const lesson = lecciones[a.principio];
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    className="btn lab-note-btn"
                    aria-expanded={open}
                    aria-controls={bodyId}
                    onClick={() => setActiveId(open ? null : a.id)}
                  >
                    <span className="lab-note-num">Nota {i + 1}</span>
                    <span>{a.titulo}</span>
                  </button>
                  <div className="lab-note-body" id={bodyId} hidden={!open}>
                    <p>{a.texto}</p>
                    {showsAnchorHint && open && (
                      <p className="lab-note-hint">
                        Su fragmento se resalta en las vistas «Después» y «Comparar».
                      </p>
                    )}
                    {lesson && (
                      <p className="lab-note-lesson">
                        Principio: <a href={lesson.href}>{lesson.titulo}</a>
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <p className="lab-status" role="status" aria-live="polite">
        {status}
      </p>

      <p className="ix-source lab-foot">
        <span className="ix-tag is-recomendacion">Recomendación de la guía</span> Son ejemplos de la guía, no
        mediciones: la mejora esperada es razonada, no cuantificada. Para saber cuánto mejora en tu caso,
        pruébalo con tus datos.
      </p>
    </section>
  );
}
