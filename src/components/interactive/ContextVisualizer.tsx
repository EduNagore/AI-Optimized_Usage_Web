import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import {
  ACTION_INFO,
  DEFAULT_PARAMS,
  DIRECT_SEGMENT_IDS,
  SEGMENTS,
  applyAction,
  assess,
  compareWindows,
  computeLayout,
  createSession,
  formatPercent,
  parseWholeNumber,
  resetSession,
  segmentTokens,
  stateFromScenario,
  summarize,
  undoLast,
  type ActionInfo,
  type ActionParams,
  type ClaimKind,
  type ContextAction,
  type ContextScenario,
  type DirectSegmentId,
  type EditField,
  type Session,
} from '../../lib/context-window';
import { formatNumber } from '../../lib/format';
import type { PriceSource } from '../../lib/pricing';
import { Field, SourceFooter } from './shared';
import './interactive.css';
import './ContextVisualizer.css';

interface WindowChoice {
  id: string;
  name: string;
  contextWindow: number;
}

interface Props {
  scenarios: ContextScenario[];
  /** Modelos cuya ventana se ofrece (por defecto, uno de 1.000.000 y uno de 200.000 tokens). */
  models: WindowChoice[];
  defaultScenarioId: string;
  defaultModelId: string;
  /** Base de las URL del sitio, con barra final (p. ej. `/AI-Optimized_Usage_Web/`). */
  baseHref: string;
  modelSources: PriceSource[];
  modelsVerifiedAt: string;
  scenarioSources: PriceSource[];
  scenariosVerifiedAt: string;
}

const CUSTOM = 'custom';

const CLAIM_TAG: Record<ClaimKind, { label: string; className: string }> = {
  verificado: { label: 'Dato verificado', className: 'is-verificado' },
  medicion: { label: 'Medición publicada por el proveedor', className: 'is-medicion' },
  recomendacion: { label: 'Recomendación de la guía', className: 'is-recomendacion' },
  supuesto: { label: 'Supuesto de la guía', className: '' },
};

interface NumberInputProps {
  id: string;
  label: string;
  hint?: string | undefined;
  value: number;
  min?: number;
  max?: number;
  onCommit: (value: number) => void;
}

/** Campo numérico que solo confirma valores válidos y explica el error en una frase. */
function NumberInput({ id, label, hint, value, min = 0, max, onCommit }: NumberInputProps) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | undefined>(undefined);
  useEffect(() => {
    setDraft(String(value));
    setError(undefined);
  }, [value]);
  return (
    <Field id={id} label={label} error={error} {...(hint === undefined ? {} : { hint })}>
      {(aria) => (
        <input
          {...aria}
          type="number"
          inputMode="numeric"
          step={1}
          min={min}
          {...(max === undefined ? {} : { max })}
          value={draft}
          onChange={(e) => {
            const text = e.target.value;
            setDraft(text);
            const r = parseWholeNumber(text, max === undefined ? { min } : { min, max });
            if (r.ok) {
              setError(undefined);
              onCommit(r.value);
            } else {
              setError(r.error);
            }
          }}
        />
      )}
    </Field>
  );
}

const infoOf = (id: ActionInfo['id']): ActionInfo => {
  const found = ACTION_INFO.find((a) => a.id === id);
  if (!found) throw new Error(`ContextVisualizer: falta la explicación de «${id}»`);
  return found;
};

function shortOrigin(origin: string): string {
  return origin.startsWith('Supuesto de la guía')
    ? 'Supuesto de la guía.'
    : 'Con cifras de las fuentes: mira «De dónde sale cada tamaño».';
}

export default function ContextVisualizer({
  scenarios,
  models,
  defaultScenarioId,
  defaultModelId,
  baseHref,
  modelSources,
  modelsVerifiedAt,
  scenarioSources,
  scenariosVerifiedAt,
}: Props) {
  const uid = useId();
  const firstScenario = scenarios.find((s) => s.id === defaultScenarioId) ?? scenarios[0];
  if (!firstScenario) throw new Error('ContextVisualizer: no hay escenarios');
  const firstModel = models.find((m) => m.id === defaultModelId) ?? models[0];

  const [scenarioId, setScenarioId] = useState(firstScenario.id);
  const scenario = scenarios.find((s) => s.id === scenarioId) ?? firstScenario;
  const [session, setSession] = useState<Session>(() => createSession(stateFromScenario(firstScenario)));
  const [modelId, setModelId] = useState(firstModel?.id ?? CUSTOM);
  const [windowTokens, setWindowTokens] = useState(firstModel?.contextWindow ?? 200_000);
  const [params, setParams] = useState<ActionParams>(DEFAULT_PARAMS);
  const [feedback, setFeedback] = useState('');

  const layoutResult = useMemo(() => computeLayout(session.current, windowTokens), [session, windowTokens]);
  const alert = layoutResult.ok ? assess(layoutResult.value, params.thresholdPercent) : undefined;
  const comparison = useMemo(
    () =>
      compareWindows(
        session.current,
        models.map((m) => ({ id: m.id, name: m.name, windowTokens: m.contextWindow })),
      ),
    [session, models],
  );

  const setParam = (key: keyof ActionParams) => (value: number) => setParams((p) => ({ ...p, [key]: value }));

  function run(action: ContextAction) {
    const r = applyAction(session, action);
    if (!r.ok) {
      setFeedback(r.error);
      return;
    }
    setSession(r.value);
    const last = r.value.history[r.value.history.length - 1];
    setFeedback(action.type === 'edit' || !last ? '' : last.summary);
  }

  const edit = (field: EditField) => (value: number) => run({ type: 'edit', field, value });

  function chooseScenario(id: string) {
    const next = scenarios.find((s) => s.id === id);
    if (!next) return;
    setScenarioId(id);
    setSession(createSession(stateFromScenario(next)));
    setFeedback(`Escenario «${next.titulo}» cargado. El historial se ha vaciado.`);
  }

  function chooseModel(id: string) {
    setModelId(id);
    const m = models.find((x) => x.id === id);
    if (m) setWindowTokens(m.contextWindow);
  }

  function commitWindow(value: number) {
    setWindowTokens(value);
    setModelId(models.find((m) => m.contextWindow === value)?.id ?? CUSTOM);
  }

  function undo() {
    const r = undoLast(session);
    if (!r.ok) {
      setFeedback(r.error);
      return;
    }
    const undone = session.history[session.history.length - 1];
    setSession(r.value);
    setFeedback(undone ? `Deshecho: ${undone.summary}` : '');
  }

  function reset() {
    setSession(resetSession(session));
    setFeedback(`Restablecido al escenario «${scenario.titulo}».`);
  }

  const tokens = segmentTokens(session.current);
  const pctOf = (used: number) => formatPercent(Math.round((used * 1000) / windowTokens) / 10);
  const href = (page: string) => `${baseHref}${page}`;

  const layout = layoutResult.ok ? layoutResult.value : undefined;
  const stable = layout?.rows.filter((r) => r.kind === 'estable') ?? [];
  const growing = layout?.rows.filter((r) => r.kind === 'crece') ?? [];

  const renderAction = (id: ActionInfo['id'], body: ReactNode) => {
    const info = infoOf(id);
    const tag = CLAIM_TAG[info.claim];
    const titleId = `${uid}-act-${id}`;
    return (
      <div className="ctxv-action" role="group" aria-labelledby={titleId}>
        <p className="ctxv-action-title" id={titleId}>
          {info.label}
        </p>
        <p className="ctxv-action-effect">{info.effect}</p>
        {body}
        <p className="ctxv-basis">
          <span className={`ix-tag ${tag.className}`.trim()}>{tag.label}</span> {info.basis}{' '}
          <a href={href(info.page)}>Dónde se explica: {info.pageLabel}</a>.
        </p>
      </div>
    );
  };

  const renderLegendRow = (r: NonNullable<typeof layout>['rows'][number]) => {
    const meta = SEGMENTS.find((s) => s.id === r.id);
    return (
      <li key={r.id} className="ctxv-legend-item">
        <span className={`ctxv-swatch ctxv-p-${r.id}`} aria-hidden="true" />
        <span className="ctxv-legend-text">
          <strong>{r.label}</strong>
          <span className="ctxv-legend-values">
            {formatNumber(r.tokens)} tokens · {formatPercent(r.percent)}
          </span>
          {meta && <span className="ctxv-legend-desc">{meta.description}</span>}
        </span>
      </li>
    );
  };

  return (
    <section className="ix ctxv not-content" aria-label="Visualizador de la ventana de contexto">
      <p className="ix-title">Visualizador de la ventana de contexto</p>
      <p className="ix-lead">
        Elige un escenario y una ventana, y aplica acciones para ver qué ocupa cada parte. Los tamaños de
        partida son supuestos de la guía, salvo donde su nota de origen cita una fuente: sirven para ver la
        forma del efecto, no para predecir tu sesión. En Claude Code, <code>/context</code> te muestra la
        tuya.
      </p>

      <div className="ix-fields">
        <Field id={`${uid}-scenario`} label="Escenario de partida" hint={scenario.resumen}>
          {(aria) => (
            <select {...aria} value={scenarioId} onChange={(e) => chooseScenario(e.target.value)}>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.titulo}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          id={`${uid}-model`}
          label="Modelo (ventana de contexto)"
          hint="Se muestra el tamaño de la ventana que figura en los datos del sitio."
        >
          {(aria) => (
            <select {...aria} value={modelId} onChange={(e) => chooseModel(e.target.value)}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}: {formatNumber(m.contextWindow)} tokens
                </option>
              ))}
              <option value={CUSTOM}>Otra ventana (la escribes tú)</option>
            </select>
          )}
        </Field>
        <NumberInput
          id={`${uid}-window`}
          label="Tamaño de la ventana (tokens)"
          value={windowTokens}
          min={1}
          onCommit={commitWindow}
        />
        <NumberInput
          id={`${uid}-threshold`}
          label="Umbral de aviso (% de ocupación)"
          hint="Recomendación de la guía, editable; no es un límite del proveedor."
          value={params.thresholdPercent}
          min={1}
          max={100}
          onCommit={setParam('thresholdPercent')}
        />
      </div>

      <div className="ix-result">
        {layout ? (
          <>
            <p className="ix-big-label">Ocupación de la ventana</p>
            <p className="ix-big">{formatPercent(layout.usedPercent)}</p>

            <div className="ctxv-bar-wrap">
              <div className={`ctxv-bar${layout.overflow ? ' is-overflow' : ''}`} aria-hidden="true">
                {layout.rows
                  .filter((r) => r.barPercent > 0)
                  .map((r) => (
                    <div
                      key={r.id}
                      className={`ctxv-seg ctxv-p-${r.id}`}
                      style={{ flexBasis: `${r.barPercent}%` }}
                    />
                  ))}
                {layout.free.barPercent > 0 && (
                  <div className="ctxv-seg ctxv-p-free" style={{ flexBasis: `${layout.free.barPercent}%` }} />
                )}
                <span
                  className="ctxv-threshold"
                  style={{ left: `${Math.min(100, params.thresholdPercent)}%` }}
                />
              </div>
              <div className="ctxv-scale" aria-hidden="true">
                <span>0</span>
                <span>Umbral de aviso: {formatNumber(params.thresholdPercent)} % (marca discontinua)</span>
                <span>{formatNumber(layout.windowTokens)} tokens</span>
              </div>
              {layout.overflow && (
                <p className="ctxv-overflow">
                  Fuera de la ventana: {formatNumber(layout.overflowTokens)} tokens. La barra muestra solo lo
                  que cabe.
                </p>
              )}
            </div>

            <div className="ctxv-live" role="status" aria-live="polite" aria-atomic="true">
              <p>{summarize(layout)}</p>
              {alert && alert.level !== 'ok' && (
                <p className={`ctxv-alert is-${alert.level}`}>
                  <strong>{alert.level === 'desborde' ? 'No cabe. ' : 'Aviso. '}</strong>
                  {alert.short}
                </p>
              )}
              {feedback && <p className="ctxv-feedback">{feedback}</p>}
            </div>
            {alert && alert.level !== 'ok' && <p className="ix-note">{alert.detail}</p>}

            <p className="ctxv-group">Parte estable: igual en cada turno, la caché puede reutilizarla</p>
            <ul className="ctxv-legend" aria-label="Segmentos de la parte estable">
              {stable.map(renderLegendRow)}
            </ul>
            <p className="ctxv-group">Parte que crece: se reenvía entera en cada turno</p>
            <ul className="ctxv-legend" aria-label="Segmentos de la parte que crece">
              {growing.map(renderLegendRow)}
              <li className="ctxv-legend-item">
                <span className="ctxv-swatch ctxv-p-free" aria-hidden="true" />
                <span className="ctxv-legend-text">
                  <strong>Espacio libre</strong>
                  <span className="ctxv-legend-values">
                    {formatNumber(layout.free.tokens)} tokens · {formatPercent(layout.free.percent)}
                  </span>
                  <span className="ctxv-legend-desc">
                    Para tu siguiente mensaje, y también para la respuesta del modelo y su razonamiento.
                  </span>
                </span>
              </li>
            </ul>
            {session.current.offloaded > 0 && (
              <p className="ctxv-offloaded">
                Trabajo hecho en otras ventanas (subagentes): {formatNumber(session.current.offloaded)}{' '}
                tokens. No ocupa esta ventana, pero se consume.
              </p>
            )}
          </>
        ) : (
          <p className="ix-error">{layoutResult.ok ? '' : layoutResult.error}</p>
        )}
      </div>

      <p className="ctxv-h">Acciones</p>
      <p className="ix-lead">
        Cada acción cambia la barra según la regla que indica su tarjeta. Los tamaños que usan son supuestos
        editables.
      </p>
      <div className="ctxv-actions">
        {renderAction(
          'add-file',
          <>
            <NumberInput
              id={`${uid}-file`}
              label="Tamaño del fichero (tokens)"
              value={params.fileTokens}
              min={1}
              onCommit={setParam('fileTokens')}
            />
            <button
              type="button"
              className="btn"
              onClick={() => run({ type: 'add-file', tokens: params.fileTokens })}
            >
              Añadir el fichero
            </button>
          </>,
        )}
        {renderAction(
          'add-turns',
          <>
            <NumberInput
              id={`${uid}-turns`}
              label="Turnos que añadir"
              value={params.turns}
              min={1}
              max={100_000}
              onCommit={setParam('turns')}
            />
            <NumberInput
              id={`${uid}-per-turn`}
              label="Tokens por turno"
              value={params.tokensPerTurn}
              onCommit={setParam('tokensPerTurn')}
            />
            <button
              type="button"
              className="btn"
              onClick={() =>
                run({ type: 'add-turns', turns: params.turns, tokensPerTurn: params.tokensPerTurn })
              }
            >
              Añadir los turnos
            </button>
          </>,
        )}
        {renderAction(
          'clear',
          <button type="button" className="btn" onClick={() => run({ type: 'clear' })}>
            Aplicar /clear
          </button>,
        )}
        {renderAction(
          'compact',
          <>
            <NumberInput
              id={`${uid}-summary`}
              label="Tamaño del resumen (tokens)"
              hint="Supuesto de la guía: depende de la conversación y de las instrucciones de enfoque."
              value={params.compactSummaryTokens}
              onCommit={setParam('compactSummaryTokens')}
            />
            <button
              type="button"
              className="btn"
              onClick={() => run({ type: 'compact', summaryTokens: params.compactSummaryTokens })}
            >
              Aplicar /compact
            </button>
          </>,
        )}
        {renderAction(
          'invoke-skill',
          <>
            <NumberInput
              id={`${uid}-skill`}
              label="Contenido de la skill (tokens)"
              value={params.skillBodyTokens}
              min={1}
              onCommit={setParam('skillBodyTokens')}
            />
            <button
              type="button"
              className="btn"
              onClick={() => run({ type: 'invoke-skill', bodyTokens: params.skillBodyTokens })}
            >
              Invocar la skill
            </button>
          </>,
        )}
        {renderAction(
          'subagent',
          <>
            <NumberInput
              id={`${uid}-sub-work`}
              label="Trabajo del subagente (tokens, en su ventana)"
              value={params.subagentWorkTokens}
              onCommit={setParam('subagentWorkTokens')}
            />
            <NumberInput
              id={`${uid}-sub-summary`}
              label="Resumen que vuelve aquí (tokens)"
              value={params.subagentSummaryTokens}
              onCommit={setParam('subagentSummaryTokens')}
            />
            <button
              type="button"
              className="btn"
              onClick={() =>
                run({
                  type: 'subagent',
                  workTokens: params.subagentWorkTokens,
                  summaryTokens: params.subagentSummaryTokens,
                })
              }
            >
              Lanzar el subagente
            </button>
          </>,
        )}
        {renderAction(
          'mcp',
          <>
            <label className="ix-choice">
              <input
                type="checkbox"
                checked={session.current.mcp.deferred}
                onChange={(e) => run({ type: 'edit', field: 'mcp.deferred', value: e.target.checked })}
              />
              <span>Carga diferida de herramientas (tool search)</span>
            </label>
            <p className="ctxv-count">
              Servidores conectados: {formatNumber(session.current.mcp.servers)} ({formatNumber(tokens.mcp)}{' '}
              tokens).
            </p>
            <div className="ix-actions">
              <button type="button" className="btn" onClick={() => run({ type: 'mcp-connect' })}>
                Conectar un servidor
              </button>
              <button type="button" className="btn" onClick={() => run({ type: 'mcp-remove' })}>
                Quitar un servidor
              </button>
            </div>
          </>,
        )}
      </div>

      <p className="ctxv-h">Historial</p>
      {session.history.length === 0 ? (
        <p className="ctxv-empty">Aún no has aplicado ninguna acción.</p>
      ) : (
        <ol className="ctxv-history">
          {session.history.map((h) => (
            <li key={h.id}>
              {h.summary}{' '}
              <span className="ctxv-history-pct">
                Ocupación: {pctOf(h.usedBefore)} → {pctOf(h.usedAfter)}.
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="ix-actions">
        <button type="button" className="btn" onClick={undo} disabled={session.history.length === 0}>
          Deshacer la última
        </button>
        <button type="button" className="btn" onClick={reset}>
          Restablecer
        </button>
      </div>

      <fieldset className="ctxv-sizes">
        <legend>Tamaño de cada segmento (tokens)</legend>
        <div className="ix-fields">
          {DIRECT_SEGMENT_IDS.map((id: DirectSegmentId) => {
            const meta = SEGMENTS.find((s) => s.id === id);
            return (
              <NumberInput
                key={id}
                id={`${uid}-size-${id}`}
                label={meta?.label ?? id}
                hint={shortOrigin(scenario.origen[id])}
                value={session.current.sizes[id]}
                onCommit={edit(`size:${id}`)}
              />
            );
          })}
          <NumberInput
            id={`${uid}-mcp-servers`}
            label="Servidores MCP conectados"
            hint={`Ocupan ${formatNumber(tokens.mcp)} tokens${session.current.mcp.deferred ? ' con carga diferida' : ''}.`}
            value={session.current.mcp.servers}
            max={1000}
            onCommit={edit('mcp.servers')}
          />
          <NumberInput
            id={`${uid}-mcp-per-server`}
            label="Tokens por servidor MCP (definiciones completas)"
            hint={shortOrigin(scenario.origen.mcp)}
            value={session.current.mcp.perServerTokens}
            onCommit={edit('mcp.perServerTokens')}
          />
        </div>
      </fieldset>

      <details className="ctxv-details">
        <summary>De dónde sale cada tamaño</summary>
        <p>
          Escenario «{scenario.titulo}». {scenario.nota} Si cambias un tamaño, la nota describe el valor de
          partida.
        </p>
        <dl className="ctxv-origins">
          {SEGMENTS.map((s) => (
            <div key={s.id}>
              <dt>{s.label}</dt>
              <dd>{scenario.origen[s.id]}</dd>
            </div>
          ))}
        </dl>
      </details>

      <p className="ctxv-h">El mismo contexto en cada ventana</p>
      <div className="ix-table-wrap" role="region" aria-label="Ocupación en cada ventana" tabIndex={0}>
        <table className="ix-table">
          <thead>
            <tr>
              <th scope="col">Modelo</th>
              <th scope="col" className="num">
                Ventana (tokens)
              </th>
              <th scope="col" className="num">
                Ocupación
              </th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map((c) => (
              <tr key={c.id}>
                <th scope="row">{c.name}</th>
                <td className="num">{formatNumber(c.windowTokens)}</td>
                <td className="num">{formatPercent(c.usedPercent)}</td>
                <td>{c.overflow ? `No cabe: sobran ${formatNumber(c.overflowTokens)}` : 'Cabe'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="ctxv-details">
        <summary>Qué simplifica este visualizador</summary>
        <ul>
          <li>
            Los segmentos y sus tamaños son aproximaciones de la guía. Los tokens reales dependen de la
            herramienta, del modelo y de tu sesión.
          </li>
          <li>
            <code>/compact</code> sustituye aquí la conversación y los ficheros leídos por un resumen. En la
            práctica, qué sobrevive depende del resumen y de tus instrucciones de enfoque.
          </li>
          <li>
            El contenido de una skill invocada se cuenta dentro de la conversación y desaparece con{' '}
            <code>/clear</code> y <code>/compact</code>.
          </li>
          <li>
            El visualizador no simula ninguna compactación automática del proveedor: no hay umbral de ese tipo
            en los datos del sitio. El aviso es una recomendación de la guía.
          </li>
          <li>
            La caché de prompts cambia lo que pagas por los tokens repetidos, no el espacio que ocupan: aquí
            solo se mide espacio.
          </li>
        </ul>
      </details>

      <SourceFooter sources={modelSources} verifiedAt={modelsVerifiedAt} prefix="Ventanas de contexto de" />
      <SourceFooter
        sources={scenarioSources}
        verifiedAt={scenariosVerifiedAt}
        prefix="Cifras de partida que citan fuentes, tomadas de"
      />
    </section>
  );
}
