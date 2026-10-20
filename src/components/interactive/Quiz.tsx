import { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import { url } from '../../lib/paths';
import {
  derivedQuizId,
  initialState,
  lessonLabel,
  quizKey,
  quizReducer,
  restoreState,
  summarizeQuiz,
  type QuizAction,
  type QuizQuestion as BaseQuestion,
  type QuizState,
} from '../../lib/quiz-progress';
import { readJson, writeJson } from '../../lib/storage';
import './Quiz.css';

export interface QuizQuestion extends BaseQuestion {
  /** Título de la lección enlazada; si falta, se deduce del nombre de la página. */
  leccionTitulo?: string;
}

export type { QuizState };

interface Props {
  titulo?: string;
  preguntas: QuizQuestion[];
  /**
   * Identificador estable del quiz: es la clave del progreso guardado. Si falta, se deriva de un hash
   * de los textos de las preguntas (dos quizzes idénticos en la misma página compartirían progreso).
   */
  id?: string;
  /** Carpeta del módulo al que pertenece (informativo; se publica como `data-modulo`). */
  modulo?: string;
  /** Aviso a quien contiene el quiz (p. ej. el panel de quizzes) tras cada cambio guardado. */
  onProgreso?: (id: string, state: QuizState) => void;
  /** Al montar, lleva el foco a la primera pregunta sin comprobar (o al título si no hay progreso). */
  enfocarPendiente?: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function ReviewLink({ q }: { q: QuizQuestion }) {
  if (!q.leccion) return null;
  return (
    <>
      Repasa: <a href={url(q.leccion)}>{q.leccionTitulo ?? lessonLabel(q.leccion)}</a>.
    </>
  );
}

/**
 * Quiz de opción única: «Comprobar» por pregunta, explicación y, al terminar, resumen con las
 * falladas enlazadas a su lección. El progreso se guarda en `localStorage` (clave versionada y
 * validada al leer) y se restaura tras montar, para no romper la hidratación. Sin almacenamiento
 * funciona igual; solo avisa, con discreción, de que no se guardará. El orden no se baraja.
 */
export default function Quiz({
  titulo = 'Comprueba lo aprendido',
  preguntas,
  id,
  modulo,
  onProgreso,
  enfocarPendiente = false,
}: Props) {
  const baseId = useId();
  const quizId = id ?? derivedQuizId(preguntas);
  const key = quizKey(quizId);

  const [state, dispatch] = useReducer(
    (s: QuizState, a: QuizAction) => quizReducer(s, a, preguntas),
    preguntas,
    initialState,
  );
  const [saveFailed, setSaveFailed] = useState(false);
  const [resumed, setResumed] = useState(false);

  /** Solo se escribe tras una acción de quien lee: restaurar o montar no toca el almacenamiento. */
  const dirty = useRef(false);
  const pendingFocus = useRef<'title' | 'next' | null>(null);
  const titleRef = useRef<HTMLParagraphElement>(null);
  const questionRefs = useRef<(HTMLFieldSetElement | null)[]>([]);
  const onProgresoRef = useRef(onProgreso);

  useEffect(() => {
    onProgresoRef.current = onProgreso;
  }, [onProgreso]);

  const summary = useMemo(() => summarizeQuiz(state, preguntas), [state, preguntas]);

  // Mover el foco cuando el contenido ya está pintado (tras restaurar o reiniciar). Va antes del
  // efecto de restauración para que, al montar, no consuma el aviso antes de que se cargue el estado.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const question = target === 'next' && summary.next !== null ? questionRefs.current[summary.next] : null;
    (question ?? titleRef.current)?.focus();
  }, [state, summary.next]);

  // Restaurar tras montar: el servidor y el primer render del cliente parten del mismo estado vacío.
  // Solo se sustituye el estado si hay uno guardado y válido; si no, no se toca nada.
  useEffect(() => {
    const restored = restoreState(readJson<unknown>(key, null), preguntas);
    if (restored) {
      dispatch({ type: 'load', state: restored });
      setResumed(restored.checked.some(Boolean));
      if (enfocarPendiente) pendingFocus.current = 'next';
    } else if (enfocarPendiente) {
      titleRef.current?.focus();
    }
    // Solo al montar o si cambia la clave: las preguntas son estáticas durante la vida del quiz.
  }, [key]);

  // Guardar después de cada cambio hecho por quien lee.
  useEffect(() => {
    if (!dirty.current) return;
    setSaveFailed(!writeJson(key, state));
    onProgresoRef.current?.(quizId, state);
  }, [state, key, quizId]);

  const act = (action: QuizAction) => {
    dirty.current = true;
    setResumed(false);
    dispatch(action);
  };

  return (
    <section className="quiz not-content" aria-label={titulo} data-quiz-id={quizId} data-modulo={modulo}>
      <p className="quiz-title" tabIndex={-1} ref={titleRef}>
        {titulo}
      </p>
      {resumed && !summary.completed && (
        <p className="quiz-resume">
          Retomas el quiz donde lo dejaste: llevas{' '}
          {plural(summary.checked, 'pregunta comprobada', 'preguntas comprobadas')} de {summary.total}.
        </p>
      )}
      {preguntas.map((q, i) => {
        const name = `${baseId}-${i}`;
        const isChecked = state.checked[i] === true;
        const selected = state.answers[i] ?? null;
        const isRight = isChecked && selected === q.correcta;
        return (
          <fieldset
            className="quiz-question"
            key={i}
            tabIndex={-1}
            ref={(el) => {
              questionRefs.current[i] = el;
            }}
          >
            <legend>
              <span className="quiz-number">
                Pregunta {i + 1} de {preguntas.length}.
              </span>{' '}
              {q.pregunta}
            </legend>
            {q.opciones.map((option, j) => (
              <label className="quiz-option" key={j}>
                <input
                  type="radio"
                  name={name}
                  checked={selected === j}
                  disabled={isChecked}
                  onChange={() => act({ type: 'answer', question: i, option: j })}
                />
                <span>{option}</span>
              </label>
            ))}
            {!isChecked && (
              <button
                type="button"
                className="btn"
                disabled={selected === null}
                onClick={() => act({ type: 'check', question: i })}
              >
                Comprobar
              </button>
            )}
            <div role="status" aria-live="polite">
              {isChecked && (
                <p className={`quiz-feedback ${isRight ? 'is-right' : 'is-wrong'}`}>
                  <strong>
                    {isRight ? 'Correcto.' : `No es esa. La correcta es: ${q.opciones[q.correcta]}.`}
                  </strong>{' '}
                  {q.explicacion}
                  {!isRight && q.leccion && (
                    <>
                      {' '}
                      <ReviewLink q={q} />
                    </>
                  )}
                </p>
              )}
            </div>
          </fieldset>
        );
      })}
      {!summary.completed && (
        <p className="quiz-score">
          {summary.checked === 0
            ? 'Responde y pulsa «Comprobar» en cada pregunta.'
            : `${plural(summary.correct, 'acierto', 'aciertos')} de ${plural(summary.checked, 'comprobada', 'comprobadas')}.`}
        </p>
      )}
      <div role="status" aria-live="polite">
        {summary.completed && (
          <div className="quiz-summary">
            <p className="quiz-result">
              <strong>
                Has acertado {summary.correct} de {summary.total}.
              </strong>
            </p>
            {summary.failed.length > 0 ? (
              <>
                <p className="quiz-summary-lead">Para repasar:</p>
                <ul className="quiz-review-list">
                  {summary.failed.map((i) => {
                    const q = preguntas[i];
                    return q ? (
                      <li key={i}>
                        <span className="quiz-number">Pregunta {i + 1}.</span> {q.pregunta}
                        {q.leccion && (
                          <>
                            {' '}
                            <ReviewLink q={q} />
                          </>
                        )}
                      </li>
                    ) : null;
                  })}
                </ul>
              </>
            ) : (
              <p className="quiz-summary-lead">No has fallado ninguna pregunta.</p>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => {
                pendingFocus.current = 'title';
                act({ type: 'reset' });
              }}
            >
              Volver a intentarlo
            </button>
          </div>
        )}
      </div>
      <div role="status" aria-live="polite">
        {saveFailed && <p className="quiz-aviso">Tu progreso no se guardará en este navegador.</p>}
      </div>
      <noscript>
        <p>Este cuestionario necesita JavaScript para comprobar las respuestas.</p>
      </noscript>
    </section>
  );
}
