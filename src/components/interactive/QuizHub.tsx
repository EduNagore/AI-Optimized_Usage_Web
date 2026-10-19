import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  aggregateProgress,
  initialState,
  progressPercent,
  quizKey,
  restoreState,
  summarizeQuiz,
  type ProgressTotals,
  type QuizRecord,
  type QuizState,
} from '../../lib/quiz-progress';
import { readJson, removeKey } from '../../lib/storage';
import Quiz, { type QuizQuestion } from './Quiz';
import './interactive.css';
import './QuizHub.css';

/** Quiz tal como llega del envoltorio Astro: sus preguntas pueden traer el título de la lección. */
export interface HubQuiz extends Omit<QuizRecord, 'preguntas'> {
  preguntas: QuizQuestion[];
}

export interface HubModule {
  /** Carpeta del módulo (`m2-metodo`). */
  dir: string;
  label: string;
}

interface Props {
  quizzes: HubQuiz[];
  modulos: HubModule[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function moduleTitle(dir: string, label: string): string {
  const n = /^m(\d+)-/.exec(dir)?.[1];
  return n ? `Módulo ${n} · ${label}` : label;
}

function ProgressBar({
  label,
  totals,
}: {
  label: string;
  totals: Pick<ProgressTotals, 'checked' | 'questions'>;
}) {
  return (
    <div
      className="qh-bar"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={totals.questions}
      aria-valuenow={totals.checked}
      aria-valuetext={`${totals.checked} de ${plural(totals.questions, 'pregunta comprobada', 'preguntas comprobadas')}`}
    >
      <span className="qh-bar-fill" style={{ width: `${progressPercent(totals)}%` }} />
    </div>
  );
}

function Totals({ totals }: { totals: ProgressTotals }) {
  return (
    <p className="qh-totals">
      {plural(totals.completed, 'quiz completado', 'quizzes completados')} de {totals.quizzes}.{' '}
      {totals.checked} de {plural(totals.questions, 'pregunta comprobada', 'preguntas comprobadas')}
      {totals.checked > 0 && `, con ${plural(totals.correct, 'acierto', 'aciertos')}`}.
    </p>
  );
}

/**
 * Panel de quizzes por módulo: progreso global y por módulo, apertura de cada quiz (con reanudación
 * donde lo dejaste) y borrado del progreso con confirmación en la propia página. El progreso se lee
 * tras montar; el servidor y el primer render del cliente muestran todo «sin empezar».
 */
export default function QuizHub({ quizzes, modulos }: Props) {
  const uid = useId();
  const [states, setStates] = useState<Record<string, QuizState | undefined>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [mounted, setMounted] = useState<string[]>([]);
  const [resetCount, setResetCount] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');

  const headingRef = useRef<HTMLHeadingElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const focusPanel = useRef<string | null>(null);

  // Leer el progreso tras montar.
  useEffect(() => {
    const read: Record<string, QuizState | undefined> = {};
    for (const quiz of quizzes) {
      const restored = restoreState(readJson<unknown>(quizKey(quiz.id), null), quiz.preguntas);
      if (restored) read[quiz.id] = restored;
    }
    setStates(read);
  }, [quizzes]);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  useEffect(() => {
    if (open !== null && focusPanel.current === open) {
      focusPanel.current = null;
      panelRefs.current[open]?.focus();
    }
  }, [open]);

  const onProgreso = useCallback((id: string, state: QuizState) => {
    setStates((prev) => ({ ...prev, [id]: state }));
  }, []);

  const report = useMemo(() => aggregateProgress(quizzes, states), [quizzes, states]);
  const hasProgress = report.global.checked > 0;

  const quizzesByModule = useMemo(() => {
    const map = new Map<string, HubQuiz[]>();
    for (const quiz of quizzes) map.set(quiz.modulo, [...(map.get(quiz.modulo) ?? []), quiz]);
    return map;
  }, [quizzes]);

  // Orden de la guía primero; los módulos desconocidos (si los hubiera) al final.
  const ordered: HubModule[] = [
    ...modulos.filter((m) => quizzesByModule.has(m.dir)),
    ...[...quizzesByModule.keys()]
      .filter((dir) => !modulos.some((m) => m.dir === dir))
      .map((dir) => ({ dir, label: dir })),
  ];
  const withoutQuiz = modulos.filter((m) => !quizzesByModule.has(m.dir) && /^m([1-9]|10)-/.test(m.dir));

  const toggle = (id: string) => {
    if (open === id) {
      setOpen(null);
      return;
    }
    if (mounted.includes(id)) focusPanel.current = id;
    else setMounted((m) => [...m, id]);
    setOpen(id);
  };

  const closeConfirm = () => {
    setConfirming(false);
    deleteRef.current?.focus();
  };

  const clearProgress = () => {
    for (const quiz of quizzes) removeKey(quizKey(quiz.id));
    setStates({});
    setMounted([]);
    setOpen(null);
    setResetCount((n) => n + 1);
    setConfirming(false);
    setMessage('Tu progreso se ha borrado de este navegador.');
    headingRef.current?.focus();
  };

  if (quizzes.length === 0) {
    return <p className="ix-note">Todavía no hay quizzes publicados.</p>;
  }

  return (
    <div className="ix qh not-content">
      <section className="qh-progress" aria-labelledby={`${uid}-progress`}>
        <h2 id={`${uid}-progress`} className="qh-heading" tabIndex={-1} ref={headingRef}>
          Tu progreso
        </h2>
        <Totals totals={report.global} />
        <ProgressBar label="Progreso global de los quizzes" totals={report.global} />
        <p className="ix-hint qh-hint">
          Se guarda solo en este navegador, sin cuenta y sin enviarse a ningún servidor.
        </p>
        <div className="ix-actions qh-actions">
          <button
            type="button"
            className="btn"
            ref={deleteRef}
            disabled={!hasProgress && !confirming}
            aria-expanded={confirming}
            aria-controls={`${uid}-confirm`}
            onClick={() => setConfirming(true)}
          >
            Borrar mi progreso
          </button>
        </div>
        {confirming && (
          <div
            id={`${uid}-confirm`}
            className="ix-note qh-confirm"
            role="group"
            aria-labelledby={`${uid}-confirm-text`}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeConfirm();
            }}
          >
            <p id={`${uid}-confirm-text`}>
              ¿Seguro? Se borrarán las respuestas y los resultados de todos los quizzes en este navegador. No
              se puede deshacer.
            </p>
            <div className="ix-actions">
              <button type="button" className="btn" ref={cancelRef} onClick={closeConfirm}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={clearProgress}>
                Sí, borrar mi progreso
              </button>
            </div>
          </div>
        )}
        <p className="qh-message" role="status" aria-live="polite">
          {message}
        </p>
      </section>

      {ordered.map((mod) => {
        const list = quizzesByModule.get(mod.dir) ?? [];
        const totals = report.modules.find((m) => m.modulo === mod.dir);
        const modId = `${uid}-mod-${mod.dir}`;
        return (
          <section className="qh-module" key={mod.dir} aria-labelledby={modId}>
            <h3 id={modId} className="qh-module-title">
              {moduleTitle(mod.dir, mod.label)}
            </h3>
            {totals && (
              <>
                <Totals totals={totals} />
                <ProgressBar label={`Progreso de ${moduleTitle(mod.dir, mod.label)}`} totals={totals} />
              </>
            )}
            <ul className="qh-quizzes">
              {list.map((quiz) => {
                const state = states[quiz.id] ?? initialState(quiz.preguntas);
                const s = summarizeQuiz(state, quiz.preguntas);
                const isOpen = open === quiz.id;
                const panelId = `${uid}-panel-${quiz.id}`;
                const status =
                  s.checked === 0
                    ? { tag: 'Sin empezar', cls: '', text: plural(s.total, 'pregunta', 'preguntas') }
                    : s.completed
                      ? {
                          tag: 'Completado',
                          cls: ' is-verificado',
                          text: `${s.correct} de ${s.total} aciertos`,
                        }
                      : {
                          tag: 'En curso',
                          cls: ' is-medicion',
                          text: `${s.checked} de ${plural(s.total, 'pregunta comprobada', 'preguntas comprobadas')}`,
                        };
                const action = isOpen
                  ? 'Cerrar'
                  : s.checked === 0
                    ? 'Empezar'
                    : s.completed
                      ? 'Repasar'
                      : 'Continuar';
                return (
                  <li className="qh-quiz" key={quiz.id}>
                    <div className="qh-quiz-head">
                      <div className="qh-quiz-info">
                        <p className="qh-quiz-title">{quiz.titulo}</p>
                        <p className="qh-quiz-status">
                          <span className={`ix-tag${status.cls}`}>{status.tag}</span> {status.text}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn"
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        onClick={() => toggle(quiz.id)}
                      >
                        {action}
                        <span className="sr-only">: {quiz.titulo}</span>
                      </button>
                    </div>
                    <div
                      id={panelId}
                      className="qh-panel"
                      role="group"
                      aria-label={quiz.titulo}
                      tabIndex={-1}
                      hidden={!isOpen}
                      ref={(el) => {
                        panelRefs.current[quiz.id] = el;
                      }}
                    >
                      {mounted.includes(quiz.id) && (
                        <Quiz
                          key={`${quiz.id}-${resetCount}`}
                          id={quiz.id}
                          modulo={quiz.modulo}
                          titulo={quiz.titulo}
                          preguntas={quiz.preguntas}
                          onProgreso={onProgreso}
                          enfocarPendiente
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {withoutQuiz.length > 0 && (
        <p className="qh-pending">
          Aún sin quiz: {withoutQuiz.map((m) => moduleTitle(m.dir, m.label)).join('; ')}.
        </p>
      )}
    </div>
  );
}
