import { useId, useMemo, useState } from 'react';
import {
  OTHER_TASK_ID,
  batchLine,
  exampleAnswers,
  fieldsFor,
  formatDefaults,
  formatPrices,
  modeOf,
  oneLineSummary,
  priceNotes,
  recommend,
  summaryText,
  type Alternative,
  type Answers,
  type Notice,
  type ProviderAlternatives,
  type QuestionField,
  type Recommendation,
  type SelectorData,
} from '../../lib/model-selector';
import { formatDate } from '../../lib/format';
import { Field, SourceFooter } from './shared';
import './interactive.css';
import './ModelSelector.css';

interface Props {
  data: SelectorData;
}

const CLAIM_LABEL = {
  verificado: 'Dato verificado',
  medicion: 'Medición publicada',
  recomendacion: 'Recomendación de la guía',
} as const;

function NoticeItem({ notice }: { notice: Notice }) {
  return (
    <p className={`ix-note sel-note ${notice.tone === 'aviso' ? 'is-aviso' : ''}`}>
      <strong>{notice.tone === 'aviso' ? 'Aviso.' : 'Consejo.'}</strong> {notice.text}
    </p>
  );
}

function AlternativeList({
  kind,
  items,
  notices,
  data,
}: {
  kind: 'cheaper' | 'stronger';
  items: ProviderAlternatives[];
  notices: Notice[];
  data: SelectorData;
}) {
  const guidanceLabel = kind === 'cheaper' ? 'Qué medir antes de adoptarla' : 'Cuándo merece la pena';
  return (
    <div className="sel-alt">
      <h5 className="sel-subtitle">
        {kind === 'cheaper' ? 'Alternativa más barata' : 'Alternativa más potente'}
      </h5>
      <ul className="sel-list">
        {items.map((a) => {
          const alt: Alternative = a[kind];
          return (
            <li key={a.provider}>
              <strong>{a.providerName}.</strong>{' '}
              {alt.available ? (
                <>
                  {alt.option.what}{' '}
                  {alt.option.kind === 'tier' && (
                    <span className="sel-nowrap">
                      Precio por millón de tokens: {formatPrices(alt.option.model)}.
                    </span>
                  )}
                  {alt.option.notes.map((n) => (
                    <span key={n}> {n}</span>
                  ))}
                  {priceNotes(alt.option.model, data).map((n) => (
                    <span key={n}> {n}</span>
                  ))}
                  <br />
                  <span className="sel-guidance">
                    <strong>{guidanceLabel}:</strong> {alt.option.guidance}
                  </span>
                </>
              ) : (
                alt.reason
              )}
            </li>
          );
        })}
      </ul>
      {notices.map((n) => (
        <NoticeItem key={n.text} notice={n} />
      ))}
    </div>
  );
}

function Result({ rec, data }: { rec: Recommendation; data: SelectorData }) {
  const priceSources = rec.priceSourceIds.flatMap((id) => {
    const s = data.sources[id];
    return s ? [s] : [];
  });
  const guideSources = rec.guideSourceIds.flatMap((id) => {
    const s = data.sources[id];
    return s ? [s] : [];
  });
  const general = rec.notices.filter((n) => n.target === 'general');
  const cheaper = rec.notices.filter((n) => n.target === 'cheaper');
  const stronger = rec.notices.filter((n) => n.target === 'stronger');
  const conditions = rec.picks.flatMap((p) => priceNotes(p.model, data).map((n) => `${p.model.name}: ${n}`));
  return (
    <>
      <h4 className="sel-heading">Modelos y esfuerzo recomendados</h4>
      <div className="ix-table-wrap" role="region" aria-label="Modelos y esfuerzo recomendados" tabIndex={0}>
        <table className="ix-table sel-table">
          <caption className="sel-sr">
            Modelos, esfuerzo y precio por millón de tokens, entrada y salida
          </caption>
          <thead>
            <tr>
              <th scope="col">Modelo</th>
              <th scope="col">Esfuerzo recomendado</th>
              <th scope="col">Esfuerzo por defecto</th>
              <th scope="col">Precio ($ por millón de tokens, entrada / salida)</th>
            </tr>
          </thead>
          <tbody>
            {rec.picks.map((p) => (
              <tr key={p.model.id}>
                <th scope="row">
                  {p.model.name}
                  <span className="sel-sub">
                    {data.rules.policy.providerNames[p.model.provider] ?? p.model.provider} · {p.model.tier}
                    {p.legacy && ' · generación anterior'}
                  </span>
                </th>
                <td>
                  {p.effort.level ?? 'Sin nivel verificado'}
                  {p.effort.raisedByFloor && (
                    <span className="sel-sub">subido al mínimo por tus respuestas</span>
                  )}
                </td>
                <td>{formatDefaults(p.effort.defaults)}</td>
                <td className="num">{formatPrices(p.model)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {conditions.length > 0 && (
        <ul className="sel-list sel-conditions">
          {conditions.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      {rec.batch && rec.batch.items.length > 0 && (
        <>
          <h4 className="sel-heading">
            Con lotes (Batch) <span className="ix-tag is-verificado">Dato verificado</span>
          </h4>
          <ul className="sel-list">
            {rec.batch.items.map((i) => (
              <li key={i.model.id}>
                <strong>{i.model.name}.</strong> {batchLine(i, data)}
              </li>
            ))}
          </ul>
        </>
      )}

      <h4 className="sel-heading">Por qué</h4>
      {rec.reasoning.map((p) => (
        <p key={p} className="sel-p">
          {p}
        </p>
      ))}
      {rec.rules.length > 0 ? (
        <>
          <p className="sel-p">
            <strong>Qué cambian tus respuestas:</strong>
          </p>
          <ul className="sel-list">
            {rec.rules.map((r) => (
              <li key={r.id}>
                <strong>{r.title}.</strong> {r.why}{' '}
                <span className="ix-tag is-recomendacion">{CLAIM_LABEL[r.claim]}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="sel-p">Tus respuestas no modifican la fila de partida.</p>
      )}

      <h4 className="sel-heading">Alternativas</h4>
      <AlternativeList kind="cheaper" items={rec.alternatives} notices={cheaper} data={data} />
      <AlternativeList kind="stronger" items={rec.alternatives} notices={stronger} data={data} />

      {general.length > 0 && (
        <>
          <h4 className="sel-heading">Avisos</h4>
          {general.map((n) => (
            <NoticeItem key={n.text} notice={n} />
          ))}
        </>
      )}

      <SourceFooter
        sources={priceSources}
        verifiedAt={rec.pricesVerifiedAt}
        prefix="Precios y niveles de esfuerzo de"
      />
      <p className="ix-source">
        La recomendación es de la guía (revisada el {formatDate(rec.guideVerifiedAt)}), no un dato de
        proveedor.
        {guideSources.length > 0 && (
          <>
            {' '}
            Se apoya en:{' '}
            {guideSources.map((s, i) => (
              <span key={s.url}>
                {i > 0 && ', '}
                <a href={s.url} rel="noreferrer">
                  {s.title}
                </a>
              </span>
            ))}
            .
          </>
        )}
      </p>
    </>
  );
}

export default function ModelSelector({ data }: Props) {
  const baseId = useId();
  const [answers, setAnswers] = useState<Answers>(() => exampleAnswers(data.rules));
  const [copied, setCopied] = useState<'idle' | 'ok' | 'error'>('idle');
  const { rules } = data;
  const mode = modeOf(answers);
  const result = useMemo(() => recommend(answers, data), [answers, data]);
  const set = (patch: Partial<Answers>) => {
    setAnswers((a) => ({ ...a, ...patch }));
    setCopied('idle');
  };
  const task = data.tasks.find((t) => t.id === answers.taskId);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('ok');
    } catch {
      setCopied('error');
    }
  };

  const renderField = (f: QuestionField) => {
    const id = `${baseId}-${f.field}`;
    const current = f.options.find((o) => o.value === answers[f.field]);
    const shownHint = current?.hint ?? f.hint;
    const hintProps = shownHint === undefined ? {} : { hint: shownHint };
    if (f.control === 'checkbox') {
      const yes = f.options[f.options.length - 1]?.value ?? 'si';
      const no = f.options[0]?.value ?? 'no';
      return (
        <div className="ix-field" key={f.field}>
          <label className="ix-choice" htmlFor={id}>
            <input
              id={id}
              type="checkbox"
              checked={answers[f.field] === yes}
              aria-describedby={f.hint ? `${id}-hint` : undefined}
              onChange={(e) => set({ [f.field]: e.target.checked ? yes : no })}
            />
            <span>{f.label}</span>
          </label>
          {f.hint && (
            <p className="ix-hint" id={`${id}-hint`}>
              {f.hint}
            </p>
          )}
        </div>
      );
    }
    return (
      <Field key={f.field} id={id} label={f.label} {...hintProps}>
        {(aria) => (
          <select {...aria} value={answers[f.field]} onChange={(e) => set({ [f.field]: e.target.value })}>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </Field>
    );
  };

  const taskHint =
    answers.taskId === OTHER_TASK_ID
      ? rules.questions.otherHint
      : task && task.examples.length > 0
        ? `Ejemplos: ${task.examples.join('; ')}.`
        : rules.questions.taskHint;
  const text = result.ok ? summaryText(result.recommendation, data) : '';

  return (
    <section className="ix sel not-content" aria-labelledby={`${baseId}-title`}>
      <h3 className="ix-title" id={`${baseId}-title`}>
        Selector de modelo y esfuerzo
      </h3>
      <p className="ix-lead">
        Responde unas preguntas y obtén un punto de partida razonado. Parte de un ejemplo ya elegido: cámbialo
        por tu tarea.
      </p>

      <div className="ix-fields">
        <Field id={`${baseId}-task`} label={rules.questions.taskLabel} hint={taskHint}>
          {(aria) => (
            <select {...aria} value={answers.taskId} onChange={(e) => set({ taskId: e.target.value })}>
              {data.tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.taskType}
                </option>
              ))}
              <option value={OTHER_TASK_ID}>{rules.questions.otherLabel}</option>
            </select>
          )}
        </Field>
        {fieldsFor(rules, mode).map(renderField)}
      </div>

      <div className="ix-actions sel-actions">
        <button type="button" className="btn" onClick={() => set(exampleAnswers(rules))}>
          Volver al ejemplo
        </button>
      </div>

      <div className="ix-result sel-result">
        {result.ok ? (
          <>
            <p className="ix-big-label">Recomendación para</p>
            <h4 className="sel-result-title">{result.recommendation.title}</h4>
            <div role="status" aria-live="polite" aria-atomic="true">
              <p className="sel-live">{oneLineSummary(result.recommendation)}</p>
            </div>
            <p className="sel-p">
              <span className="ix-tag is-recomendacion">Recomendación de la guía</span>{' '}
              {result.recommendation.disclaimer}
            </p>
            <dl className="sel-facts">
              <div>
                <dt>Superficie</dt>
                <dd>{result.recommendation.surface}</dd>
              </div>
              <div>
                <dt>Cómo verificar</dt>
                <dd>{result.recommendation.verification}</dd>
              </div>
            </dl>
            <Result rec={result.recommendation} data={data} />
            <div className="ix-actions sel-actions">
              <button type="button" className="btn" onClick={() => void copy(text)}>
                Copiar resumen como texto
              </button>
              <span role="status" className="sel-copied">
                {copied === 'ok' && 'Resumen copiado.'}
                {copied === 'error' && 'No se pudo copiar: selecciona el texto de abajo.'}
              </span>
            </div>
            <details className="sel-text">
              <summary>Ver el resumen como texto</summary>
              <label className="sel-sr" htmlFor={`${baseId}-text`}>
                Resumen de la recomendación
              </label>
              <textarea id={`${baseId}-text`} readOnly rows={12} value={text} />
            </details>
          </>
        ) : (
          <div role="alert">
            {result.errors.map((e) => (
              <p key={e} className="ix-error">
                {e}
              </p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
