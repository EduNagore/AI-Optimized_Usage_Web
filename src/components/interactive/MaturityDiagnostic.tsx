import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  MATURITY_STORAGE_KEY,
  firstUnanswered,
  parseStored,
  recommend,
  sanitizeAnswers,
  scoreAnswers,
  summarizeResult,
  toStored,
  type Answers,
  type MaturityData,
} from '../../lib/maturity';
import { readJson, removeKey, STORAGE_PREFIX, writeJson } from '../../lib/storage';
import './interactive.css';
import './MaturityDiagnostic.css';

/** Datos de una página recomendada, resueltos por el envoltorio `.astro` (URL ya con `base`). */
export interface MaturityPageInfo {
  title: string;
  url: string;
  /** Minutos de lectura (frontmatter). */
  readingTime?: number | undefined;
  /** Nivel de la página («Básico», «Intermedio», «Avanzado»). */
  levelLabel?: string | undefined;
}

interface Props {
  data: MaturityData;
  /** Clave: id de la página en `docs` (p. ej. `m2-metodo/ciclo-de-7-pasos`). */
  pages: Record<string, MaturityPageInfo>;
}

type Mode = 'intro' | 'questions' | 'result';
type FocusTarget = 'intro' | 'legend' | 'result' | null;

const STORAGE_KEY = `${STORAGE_PREFIX}${MATURITY_STORAGE_KEY}`;

export default function MaturityDiagnostic({ data, pages }: Props) {
  const baseId = useId();
  const [mode, setMode] = useState<Mode>('intro');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [showExample, setShowExample] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const introRef = useRef<HTMLHeadingElement>(null);
  const legendRef = useRef<HTMLLegendElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const pendingFocus = useRef<FocusTarget>(null);
  const [focusTick, setFocusTick] = useState(0);

  /** Pide mover el foco cuando la pantalla nueva ya esté pintada. */
  function requestFocus(target: FocusTarget) {
    pendingFocus.current = target;
    setFocusTick((t) => t + 1);
  }

  // El almacenamiento se lee tras montar: el render del servidor y el primero del cliente coinciden.
  useEffect(() => {
    const restored = parseStored(data, readJson<unknown>(STORAGE_KEY, null));
    if (restored && Object.keys(restored).length > 0) setAnswers(restored);
  }, [data]);

  // El foco se mueve después de pintar la pantalla nueva.
  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (target === 'legend') legendRef.current?.focus();
    else if (target === 'result') resultRef.current?.focus();
    else if (target === 'intro') introRef.current?.focus();
  }, [focusTick]);

  const viewed = showExample ? sanitizeAnswers(data, data.example.answers) : answers;
  const score = useMemo(() => scoreAnswers(data, viewed), [data, viewed]);
  const rec = useMemo(() => recommend(data, score), [data, score]);

  const total = data.questions.length;
  const answeredCount = Object.keys(sanitizeAnswers(data, answers)).length;
  const hasSaved = answeredCount > 0;
  const savedComplete = answeredCount === total;

  function persist(next: Answers) {
    if (!writeJson(STORAGE_KEY, toStored(data, next))) setSaveFailed(true);
  }

  function startQuestions(index: number) {
    setShowExample(false);
    setError(null);
    setStep(index);
    setMode('questions');
    requestFocus('legend');
  }

  function showResult(isExample: boolean) {
    setShowExample(isExample);
    setMode('result');
    requestFocus('result');
    const s = scoreAnswers(data, isExample ? data.example.answers : answers);
    setAnnouncement(summarizeResult(s, recommend(data, s)));
  }

  function choose(questionId: string, optionId: string) {
    const next = { ...answers, [questionId]: optionId };
    setAnswers(next);
    setError(null);
    persist(next);
  }

  function goNext(event: FormEvent) {
    event.preventDefault();
    const question = data.questions[step];
    if (!question) return;
    if (answers[question.id] === undefined) {
      setError('Elige una opción para continuar.');
      fieldsetRef.current?.querySelector<HTMLInputElement>('input')?.focus();
      return;
    }
    setError(null);
    if (step < total - 1) {
      setStep(step + 1);
      requestFocus('legend');
      return;
    }
    if (!scoreAnswers(data, answers).complete) {
      // Solo ocurre si se volvió atrás con un estado guardado incompleto.
      const missing = firstUnanswered(data, answers);
      setStep(missing);
      setError('Falta alguna respuesta anterior: contéstala para ver el resultado.');
      requestFocus('legend');
      return;
    }
    showResult(false);
  }

  function goBack() {
    setError(null);
    if (step > 0) {
      setStep(step - 1);
      requestFocus('legend');
    }
  }

  function repeat() {
    setAnswers({});
    removeKey(STORAGE_KEY);
    setSaveFailed(false);
    setAnnouncement('Respuestas borradas. Empieza de nuevo por la primera pregunta.');
    startQuestions(0);
  }

  function clearAll() {
    setAnswers({});
    removeKey(STORAGE_KEY);
    setSaveFailed(false);
    setShowExample(false);
    setError(null);
    setAnnouncement('Tus respuestas se han borrado de este navegador.');
    setMode('intro');
    requestFocus('intro');
  }

  const question = data.questions[step];
  const dimensionLabel = (id: string) => data.dimensions.find((d) => d.id === id)?.label ?? id;
  const titleId = `${baseId}-titulo`;

  return (
    <section className="ix maturity not-content" aria-labelledby={titleId}>
      <p className="ix-title" id={titleId}>
        Diagnóstico de madurez
      </p>

      {/* Región viva persistente: el resumen del resultado y los avisos breves */}
      <div className="mad-sr" role="status" aria-live="polite">
        {announcement}
      </div>

      {mode === 'intro' && (
        <div>
          <h3 className="mad-heading" tabIndex={-1} ref={introRef}>
            Antes de empezar
          </h3>
          <p className="ix-lead">
            {total} preguntas sobre cómo trabajas hoy con modelos de IA, de menos a más madura en cada una. No
            hay respuestas buenas o malas: elige la que más se parezca a lo que haces de verdad, no a lo que
            te gustaría hacer. Al final verás tu nivel, tu perfil por dimensión y las páginas de la guía que
            más te convienen.
          </p>
          <ul className="mad-notes">
            <li>
              <strong>Es una autoevaluación orientativa</strong>, no una evaluación ni una certificación. Las
              opciones más maduras reflejan las recomendaciones de esta guía, no una norma de ningún
              proveedor.
            </li>
            <li>
              <strong>Tus respuestas no salen del navegador.</strong> Se guardan solo en este dispositivo para
              que puedas continuar más tarde, y puedes borrarlas cuando quieras.
            </li>
          </ul>
          <div className="ix-actions">
            {hasSaved && !savedComplete && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => startQuestions(firstUnanswered(data, answers))}
              >
                Continuar ({answeredCount} de {total} contestadas)
              </button>
            )}
            {hasSaved && savedComplete && (
              <button type="button" className="btn btn-primary" onClick={() => showResult(false)}>
                Ver mi último resultado
              </button>
            )}
            {!hasSaved && (
              <button type="button" className="btn btn-primary" onClick={() => startQuestions(0)}>
                Empezar el diagnóstico
              </button>
            )}
            {hasSaved && (
              <button type="button" className="btn" onClick={repeat}>
                Empezar de nuevo
              </button>
            )}
            <button type="button" className="btn" onClick={() => showResult(true)}>
              Ver un ejemplo de resultado
            </button>
            {hasSaved && (
              <button type="button" className="btn" onClick={clearAll}>
                Borrar mis respuestas
              </button>
            )}
          </div>
          {saveFailed && (
            <p className="ix-note" role="note">
              Este navegador no permite guardar las respuestas. El diagnóstico funciona igual, pero no podrás
              continuar más tarde.
            </p>
          )}
        </div>
      )}

      {mode === 'questions' && question && (
        <form onSubmit={goNext} noValidate>
          <div className="mad-progress">
            <progress
              max={total}
              value={step + 1}
              aria-label={`Progreso del diagnóstico: pregunta ${step + 1} de ${total}`}
            />
          </div>
          <fieldset
            className="mad-question"
            ref={fieldsetRef}
            aria-describedby={error ? `${baseId}-error` : undefined}
          >
            <legend tabIndex={-1} ref={legendRef}>
              <span className="mad-step">
                Pregunta {step + 1} de {total}
              </span>
              <span className="ix-tag">{dimensionLabel(question.dimension)}</span>
              <span className="mad-question-text">{question.text}</span>
            </legend>
            {question.options.map((option) => (
              <label className="ix-choice" key={option.id}>
                <input
                  type="radio"
                  name={`${baseId}-${question.id}`}
                  value={option.id}
                  checked={answers[question.id] === option.id}
                  onChange={() => choose(question.id, option.id)}
                />
                <span>{option.text}</span>
              </label>
            ))}
          </fieldset>
          {error && (
            <p className="ix-error" id={`${baseId}-error`}>
              {error}
            </p>
          )}
          <div className="ix-actions">
            <button type="button" className="btn" onClick={goBack} disabled={step === 0}>
              Anterior
            </button>
            <button type="submit" className="btn btn-primary">
              {step === total - 1 ? 'Ver resultado' : 'Siguiente'}
            </button>
          </div>
          {saveFailed && (
            <p className="ix-note" role="note">
              Este navegador no permite guardar las respuestas. El diagnóstico funciona igual.
            </p>
          )}
        </form>
      )}

      {mode === 'result' && score.outcome && (
        <div className="mad-result">
          {showExample && (
            <p className="ix-note">
              <strong>Esto es un ejemplo.</strong> {data.example.label}. No son tus respuestas.
            </p>
          )}
          <h3 className="mad-heading" tabIndex={-1} ref={resultRef}>
            Tu nivel: {score.outcome.level.label}
          </h3>
          <p className="ix-big-label">
            {score.total} de {score.max} puntos
          </p>
          <p>{score.outcome.level.description}</p>
          {score.outcome.limitedBy.length > 0 && (
            <p className="ix-note">
              Por la puntuación total llegarías a «{score.outcome.byPoints.label}», pero ese nivel pide una
              base mínima en {score.outcome.limitedBy.map((d) => d.label).join(' y ')}. Por eso se muestra «
              {score.outcome.level.label}
              ».
            </p>
          )}

          <h4 className="mad-subheading">Tu perfil por dimensión</h4>
          <div className="mad-table-wrap">
            <table className="ix-table mad-table">
              <caption className="mad-sr">Puntuación y tramo en cada dimensión</caption>
              <thead>
                <tr>
                  <th scope="col">Dimensión</th>
                  <th scope="col">Puntuación</th>
                </tr>
              </thead>
              <tbody>
                {score.dimensions.map((d) => (
                  <tr key={d.id}>
                    <th scope="row">{d.label}</th>
                    <td>
                      <span className="mad-points">
                        {d.points} de {d.max} · <strong>{d.band?.label}</strong>
                      </span>
                      <meter
                        min={0}
                        max={d.max}
                        value={d.points}
                        aria-label={`${d.label}: ${d.points} de ${d.max} puntos`}
                      >
                        {d.points} de {d.max}
                      </meter>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 className="mad-subheading">Dónde tienes más recorrido</h4>
          {rec.keepingUp ? (
            <p>
              Tus respuestas no dejan huecos evidentes. Lo que sigue son páginas para mantener el nivel: los
              modelos, los precios y las herramientas cambian cada pocas semanas.
            </p>
          ) : (
            <ol className="mad-focus">
              {rec.focus.map((d) => {
                const meta = data.dimensions.find((x) => x.id === d.id);
                return (
                  <li key={d.id}>
                    <strong>{d.label}</strong>: {d.points} de {d.max} ({d.band?.label.toLowerCase()}).{' '}
                    {meta?.summary}
                    {meta?.note && <span className="mad-aside"> {meta.note}</span>}
                  </li>
                );
              })}
            </ol>
          )}
          {rec.deferred.map((d) => {
            const meta = data.dimensions.find((x) => x.id === d.id);
            const needs = (meta?.prerequisites ?? []).map((r) => dimensionLabel(r.dimension)).join(' y ');
            return (
              <p className="ix-note" key={d.id}>
                <strong>{d.label}</strong>: por ahora no es la prioridad. Antes conviene reforzar {needs}.
                {meta?.note && ` ${meta.note}`}
              </p>
            );
          })}

          <h4 className="mad-subheading">Páginas recomendadas, en este orden</h4>
          <ol className="mad-pages">
            {rec.pages.map((p) => {
              const info = pages[p.page];
              if (!info) return null;
              return (
                <li key={p.page}>
                  <a href={info.url}>{info.title}</a>
                  <span className="mad-meta">
                    {[info.readingTime ? `${info.readingTime} min` : null, info.levelLabel]
                      .filter(Boolean)
                      .join(' · ')}
                    {p.dimension && ` · ${dimensionLabel(p.dimension)}`}
                  </span>
                  <span className="mad-why">{p.why}</span>
                </li>
              );
            })}
          </ol>

          <h4 className="mad-subheading">Si solo tienes 10 minutos</h4>
          {(() => {
            const info = pages[rec.quick.page];
            if (!info) return null;
            return (
              <p>
                Lee <a href={info.url}>{info.title}</a>
                {info.readingTime ? ` (${info.readingTime} min, ruta Esencial)` : ' (ruta Esencial)'}.{' '}
                {rec.quick.why}
              </p>
            );
          })()}

          <p className="ix-source">
            Es una autoevaluación orientativa, no una evaluación. Las recomendaciones son de esta guía y se
            calculan en tu navegador; tus respuestas no se envían a ningún sitio.
          </p>

          <div className="ix-actions">
            {showExample ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() =>
                    startQuestions(hasSaved && !savedComplete ? firstUnanswered(data, answers) : 0)
                  }
                >
                  Hacer mi diagnóstico
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setShowExample(false);
                    setMode('intro');
                    requestFocus('intro');
                  }}
                >
                  Volver al inicio
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn" onClick={() => startQuestions(total - 1)}>
                  Revisar mis respuestas
                </button>
                <button type="button" className="btn" onClick={repeat}>
                  Repetir el diagnóstico
                </button>
                <button type="button" className="btn" onClick={clearAll}>
                  Borrar mis respuestas
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
