import { Fragment, useEffect, useId, useRef, useState } from 'react';
import {
  DEFAULT_READY_SECONDS,
  DEFAULT_SIMULATOR_STATE,
  MAX_REQUESTS,
  SCENARIOS,
  SIMULATOR_ASSUMPTIONS,
  compareOptions,
  formatCost,
  formatDuration,
  isHitOutcome,
  isWriteOutcome,
  outcomeLabel,
  parseGapMinutes,
  parseTokenCount,
  type ComparedOption,
  type Comparison,
  type RequestResult,
  type Scenario,
} from '../../lib/cache-simulator';
import { formatNumber, formatUsd } from '../../lib/format';
import {
  cacheTtlOptions,
  unitPricesFor,
  type PriceSource,
  type PricingCatalog,
  type Provider,
} from '../../lib/pricing';
import './interactive.css';
import './CacheSimulator.css';
import { Field, SourceFooter } from './shared';

interface Props {
  catalog: PricingCatalog;
  /** Fuentes de las reglas de caché de cada proveedor (además de la del modelo). */
  ruleSources: Record<Provider, PriceSource[]>;
  /** Fecha de compilación (AAAA-MM-DD) para los cambios de precio programados. */
  asOf?: string;
}

interface Row {
  id: number;
  /** Separación con la petición anterior, en minutos, tal como la escribe el lector. */
  gap: string;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  google: 'Google (Gemini)',
};

const CUSTOM = 'personalizado';

function rowsFor(scenario: Scenario, firstId = 1): Row[] {
  return scenario.gapsMinutes.map((m, i) => ({ id: firstId + i, gap: String(m) }));
}

function defaultScenario(): Scenario {
  const s = SCENARIOS.find((x) => x.id === DEFAULT_SIMULATOR_STATE.scenarioId) ?? SCENARIOS[0];
  if (!s) throw new Error('CacheSimulator: no hay escenarios');
  return s;
}

/** Interpreta la elección del lector: TTL ofrecido por el modelo, `null` (sin caché) o el primero ofrecido. */
function resolveTtl(options: number[], choice: number | null): number | null {
  if (choice === null) return null;
  return options.includes(choice) ? choice : (options[0] ?? null);
}

function symbolFor(r: RequestResult): string {
  if (isHitOutcome(r.outcome)) return '●';
  if (isWriteOutcome(r.outcome)) return '■';
  return '◆';
}

export default function CacheSimulator({ catalog, ruleSources, asOf }: Props) {
  const uid = useId();
  const initial = defaultScenario();
  const [modelId, setModelId] = useState<string>(DEFAULT_SIMULATOR_STATE.modelId);
  const [prefixText, setPrefixText] = useState(String(DEFAULT_SIMULATOR_STATE.prefixTokens));
  const [variableText, setVariableText] = useState(String(DEFAULT_SIMULATOR_STATE.variableTokens));
  const [outputText, setOutputText] = useState(String(DEFAULT_SIMULATOR_STATE.outputTokens));
  const [ttlChoice, setTtlChoice] = useState<number | null>(DEFAULT_SIMULATOR_STATE.ttlMinutes);
  const [assumeHit, setAssumeHit] = useState(false);
  const [readyText, setReadyText] = useState(String(DEFAULT_READY_SECONDS));
  const [rows, setRows] = useState<Row[]>(() => rowsFor(initial));
  const [scenarioId, setScenarioId] = useState<string>(initial.id);
  const [notice, setNotice] = useState('');

  const nextId = useRef(rows.length + 1);
  const inputRefs = useRef(new Map<number, HTMLInputElement>());
  const addButton = useRef<HTMLButtonElement | null>(null);
  const pendingFocus = useRef<number | 'add' | null>(null);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if (target === 'add') addButton.current?.focus();
    else inputRefs.current.get(target)?.focus();
  }, [rows]);

  const model = catalog.models.find((m) => m.id === modelId) ?? catalog.models[0];
  if (!model) throw new Error('CacheSimulator: el catálogo no tiene modelos');
  const implicit = model.cache.mode === 'implicit';
  const ttlOptions = cacheTtlOptions(model);
  const effectiveTtl = implicit
    ? null
    : resolveTtl(
        ttlOptions.map((o) => o.minutes),
        ttlChoice,
      );

  const prefixP = parseTokenCount(prefixText, 'los tokens del prefijo estable');
  const variableP = parseTokenCount(variableText, 'los tokens variables');
  const outputP = parseTokenCount(outputText, 'los tokens de salida');
  const readyP = parseTokenCount(readyText, 'el tiempo de disponibilidad');
  const gapPs = rows.map((r, i) => (i === 0 ? ({ ok: true, value: 0 } as const) : parseGapMinutes(r.gap)));
  const hasFieldErrors = ![prefixP, variableP, outputP, readyP, ...gapPs].every((p) => p.ok);

  const outcome = (() => {
    if (!prefixP.ok || !variableP.ok || !outputP.ok || !readyP.ok) return null;
    const gapsSeconds: number[] = [];
    for (const p of gapPs) {
      if (!p.ok) return null;
      gapsSeconds.push(p.value);
    }
    return compareOptions({
      model,
      prefixTokens: prefixP.value,
      variableTokens: variableP.value,
      outputTokens: outputP.value,
      gapsSeconds,
      readySeconds: readyP.value,
      ...(asOf ? { asOf } : {}),
    });
  })();

  const comparison: Comparison | null = outcome && outcome.ok ? outcome.comparison : null;
  const selectedKey = implicit
    ? assumeHit
      ? 'assume-hit'
      : 'none'
    : effectiveTtl === null
      ? 'none'
      : `ttl-${effectiveTtl}`;
  const selected: ComparedOption | undefined = comparison
    ? (comparison.options.find((o) => o.key === selectedKey) ?? comparison.options[0])
    : undefined;

  // --- Acciones sobre la lista de peticiones ---------------------------------------------------
  const touch = () => {
    setScenarioId(CUSTOM);
    setNotice('');
  };

  const applyScenario = (s: Scenario) => {
    setRows(rowsFor(s, nextId.current));
    nextId.current += s.gapsMinutes.length;
    setScenarioId(s.id);
    setNotice(`Escenario «${s.label}» aplicado.`);
  };

  const addRow = () => {
    if (rows.length >= MAX_REQUESTS) return;
    const last = rows[rows.length - 1];
    const gap = rows.length > 1 && last ? last.gap : '2';
    const id = nextId.current++;
    pendingFocus.current = id;
    setRows([...rows, { id, gap }]);
    touch();
    setNotice(`Petición ${rows.length + 1} añadida.`);
  };

  const duplicateRow = (index: number) => {
    if (rows.length >= MAX_REQUESTS) return;
    const source = rows[index];
    if (!source) return;
    const gap = index === 0 ? (rows[1]?.gap ?? '2') : source.gap;
    const id = nextId.current++;
    pendingFocus.current = id;
    const next = [...rows];
    next.splice(index + 1, 0, { id, gap });
    setRows(next);
    touch();
    setNotice(`Petición ${index + 1} duplicada.`);
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1) return;
    const next = rows.filter((_, i) => i !== index);
    const adjacent = next[Math.min(index, next.length - 1)];
    // La primera fila no tiene campo de separación: se enfoca la siguiente que sí lo tenga.
    const focusRow = next.length > 1 ? (index === 0 ? next[1] : adjacent) : undefined;
    pendingFocus.current = focusRow ? focusRow.id : 'add';
    setRows(next);
    touch();
    setNotice(`Petición ${index + 1} quitada.`);
  };

  const setGap = (id: number, gap: string) => {
    setRows(rows.map((r) => (r.id === id ? { ...r, gap } : r)));
    touch();
  };

  const reset = () => {
    const s = defaultScenario();
    setModelId(DEFAULT_SIMULATOR_STATE.modelId);
    setPrefixText(String(DEFAULT_SIMULATOR_STATE.prefixTokens));
    setVariableText(String(DEFAULT_SIMULATOR_STATE.variableTokens));
    setOutputText(String(DEFAULT_SIMULATOR_STATE.outputTokens));
    setTtlChoice(DEFAULT_SIMULATOR_STATE.ttlMinutes);
    setAssumeHit(false);
    setReadyText(String(DEFAULT_READY_SECONDS));
    setRows(rowsFor(s, nextId.current));
    nextId.current += s.gapsMinutes.length;
    setScenarioId(s.id);
    setNotice('Ejemplo restablecido.');
  };

  // --- Textos derivados ------------------------------------------------------------------------
  const none = comparison?.options.find((o) => o.key === 'none');
  const cheapestOptions = comparison
    ? comparison.options.filter((o) => comparison.cheapestKeys.includes(o.key))
    : [];
  const totalInput = prefixP.ok && variableP.ok ? prefixP.value + variableP.value : 0;
  const shownPrices = unitPricesFor(model, Math.max(totalInput, 1), asOf);
  const longTier = model.longContext !== undefined && totalInput > model.longContext.thresholdTokens;

  const summary = (() => {
    if (!comparison || !selected) return 'Corrige los campos marcados para ver el resultado.';
    const r = selected.result;
    const parts = [
      `${model.name}, ${rows.length} ${rows.length === 1 ? 'petición' : 'peticiones'}. ${selected.label}: ${formatCost(r.totals.total)} (${r.counts.hits} ${r.counts.hits === 1 ? 'acierto' : 'aciertos'}, ${r.counts.writes} ${r.counts.writes === 1 ? 'escritura' : 'escrituras'}).`,
    ];
    if (comparison.allEqual) {
      parts.push('Todas las opciones cuestan lo mismo en este escenario.');
    } else {
      const names = cheapestOptions.map((o) => o.label).join(' y ');
      const best = cheapestOptions[0];
      parts.push(
        `Más barata: ${names} (${best ? formatCost(best.result.totals.total) : ''}${cheapestOptions.length > 1 ? ', empate' : ''}).`,
      );
    }
    return parts.join(' ');
  })();

  const sources: PriceSource[] = [];
  for (const s of [catalog.sources[model.source], ...ruleSources[model.provider]]) {
    if (s && !sources.some((x) => x.url === s.url)) sources.push(s);
  }

  const idOf = (name: string) => `${uid}-${name}`;
  const titleId = idOf('title');

  return (
    <section className="ix cs not-content" aria-labelledby={titleId}>
      <p className="ix-title" id={titleId}>
        Simulador de caché de prompts
      </p>
      <p className="ix-lead">
        Define el tamaño de tus peticiones y la separación entre ellas. El simulador cuenta aciertos y fallos
        de la caché y compara el coste sin caché, con 5 minutos y con 1 hora.
      </p>

      <div className="cs-block">
        <p className="cs-sub">
          Tu escenario <span className="ix-tag">supuesto de la guía</span>
        </p>
        <div className="ix-fields">
          <Field id={idOf('model')} label="Modelo">
            {(aria) => (
              <select
                {...aria}
                value={model.id}
                onChange={(e) => {
                  setModelId(e.target.value);
                  setNotice('');
                }}
              >
                {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => {
                  const list = catalog.models.filter((m) => m.provider === p);
                  return list.length === 0 ? null : (
                    <optgroup key={p} label={PROVIDER_LABELS[p]}>
                      {list.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            )}
          </Field>
          <Field
            id={idOf('prefix')}
            label="Tokens del prefijo estable"
            hint={`Lo que se repite igual en cada petición. Mínimo cacheable en ${model.name}: ${formatNumber(model.cache.minTokens)} tokens.`}
            error={prefixP.ok ? undefined : prefixP.error}
          >
            {(aria) => (
              <input
                {...aria}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={prefixText}
                onChange={(e) => {
                  setPrefixText(e.target.value);
                  setNotice('');
                }}
              />
            )}
          </Field>
          <Field
            id={idOf('variable')}
            label="Tokens variables por petición"
            hint="Lo que cambia en cada petición (la pregunta de hoy). Se paga como entrada normal."
            error={variableP.ok ? undefined : variableP.error}
          >
            {(aria) => (
              <input
                {...aria}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={variableText}
                onChange={(e) => {
                  setVariableText(e.target.value);
                  setNotice('');
                }}
              />
            )}
          </Field>
          <Field
            id={idOf('output')}
            label="Tokens de salida por petición"
            error={outputP.ok ? undefined : outputP.error}
          >
            {(aria) => (
              <input
                {...aria}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={outputText}
                onChange={(e) => {
                  setOutputText(e.target.value);
                  setNotice('');
                }}
              />
            )}
          </Field>
        </div>

        {implicit ? (
          <div className="cs-implicit">
            <p className="ix-note">
              <strong>Caché implícita.</strong> {model.name} no tiene TTL configurable ni escritura facturada,
              y el acierto no está garantizado: no se puede simular de forma determinista. Por defecto el
              simulador calcula el peor caso (sin descuento). Si lo activas, supone que el prefijo acierta
              desde la segunda petición y cobra la lectura con el descuento.
            </p>
            <label className="ix-choice">
              <input
                type="checkbox"
                checked={assumeHit}
                onChange={(e) => {
                  setAssumeHit(e.target.checked);
                  setNotice('');
                }}
              />
              <span>Suponer acierto de la caché implícita desde la 2.ª petición</span>
            </label>
          </div>
        ) : (
          <fieldset className="ix-field cs-ttl">
            <legend>Caché para el detalle de abajo</legend>
            <div className="cs-ttl-options">
              {ttlOptions.map((o) => (
                <label className="ix-choice" key={o.minutes}>
                  <input
                    type="radio"
                    name={idOf('ttl')}
                    checked={effectiveTtl === o.minutes}
                    onChange={() => {
                      setTtlChoice(o.minutes);
                      setNotice('');
                    }}
                  />
                  <span>TTL de {o.label}</span>
                </label>
              ))}
              <label className="ix-choice">
                <input
                  type="radio"
                  name={idOf('ttl')}
                  checked={effectiveTtl === null}
                  onChange={() => {
                    setTtlChoice(null);
                    setNotice('');
                  }}
                />
                <span>Sin caché</span>
              </label>
            </div>
            <p className="ix-hint">
              La comparación de costes de abajo siempre incluye todas las opciones; esta elección decide la
              línea temporal y la tabla de peticiones.
            </p>
          </fieldset>
        )}
      </div>

      <div className="cs-block">
        <p className="cs-sub">
          Peticiones y separaciones <span className="ix-tag">supuesto de la guía</span>
        </p>
        <div className="ix-actions" role="group" aria-label="Escenarios predefinidos">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="btn"
              aria-pressed={scenarioId === s.id}
              title={s.description}
              onClick={() => applyScenario(s)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="ix-hint cs-count">
          {rows.length} {rows.length === 1 ? 'petición' : 'peticiones'} (máximo {MAX_REQUESTS}). La separación
          se mide en minutos desde la petición anterior; admite decimales (0,25 son 15 segundos) y 0 para
          peticiones simultáneas.
        </p>
        <ol className="cs-list">
          {rows.map((row, i) => {
            const n = i + 1;
            const p = gapPs[i];
            return (
              <li className="cs-row" key={row.id}>
                {i === 0 ? (
                  <p className="cs-first">Petición 1: la primera, no tiene anterior.</p>
                ) : (
                  <Field
                    id={idOf(`gap-${row.id}`)}
                    label={`Separación de la petición ${n} (min)`}
                    error={p && !p.ok ? p.error : undefined}
                  >
                    {(aria) => (
                      <input
                        {...aria}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={row.gap}
                        ref={(el) => {
                          if (el) inputRefs.current.set(row.id, el);
                          else inputRefs.current.delete(row.id);
                        }}
                        onChange={(e) => setGap(row.id, e.target.value)}
                      />
                    )}
                  </Field>
                )}
                <div className="cs-row-actions">
                  <button
                    type="button"
                    className="btn"
                    aria-label={`Duplicar petición ${n}`}
                    disabled={rows.length >= MAX_REQUESTS}
                    onClick={() => duplicateRow(i)}
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    className="btn"
                    aria-label={`Quitar petición ${n}`}
                    disabled={rows.length <= 1}
                    onClick={() => removeRow(i)}
                  >
                    Quitar
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="ix-actions">
          <button
            type="button"
            className="btn"
            ref={addButton}
            disabled={rows.length >= MAX_REQUESTS}
            onClick={addRow}
          >
            Añadir petición
          </button>
          <button type="button" className="btn" onClick={reset}>
            Restablecer ejemplo
          </button>
        </div>

        <details className="cs-details">
          <summary>Supuestos del modelo de cálculo</summary>
          <div className="cs-details-body">
            <Field
              id={idOf('ready')}
              label="Segundos hasta que la entrada de caché está disponible"
              hint="Una petición que llega antes no encuentra la entrada y paga otra escritura."
              error={readyP.ok ? undefined : readyP.error}
            >
              {(aria) => (
                <input
                  {...aria}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={readyText}
                  onChange={(e) => {
                    setReadyText(e.target.value);
                    setNotice('');
                  }}
                />
              )}
            </Field>
            <ul className="cs-assumptions">
              {SIMULATOR_ASSUMPTIONS.map((a) => (
                <li key={a.id}>
                  <span className={a.verified ? 'ix-tag is-verificado' : 'ix-tag'}>
                    {a.verified ? 'dato verificado' : 'supuesto de la guía'}
                  </span>{' '}
                  {a.text}
                </li>
              ))}
            </ul>
          </div>
        </details>
      </div>

      <div className="ix-result">
        <div role="status" aria-live="polite" className="cs-summary">
          {notice ? `${notice} ` : ''}
          {summary}
        </div>

        {hasFieldErrors && !comparison && (
          <p className="ix-error">Hay campos con errores: revisa los mensajes marcados arriba.</p>
        )}
        {outcome && !outcome.ok && (
          <ul className="cs-errors">
            {outcome.errors.map((e) => (
              <li key={`${e.field}-${e.index ?? ''}-${e.message}`} className="ix-error">
                {e.message}
              </li>
            ))}
          </ul>
        )}

        {comparison && selected && none && (
          <>
            {selected.result.warnings.map((w) => (
              <p className="ix-note" key={w}>
                {w}
              </p>
            ))}
            {selected.result.inactiveReason && <p className="ix-note">{selected.result.inactiveReason}</p>}
            {comparison.skipped.map((s) => (
              <p className="ix-note" key={s.label}>
                Se omite «{s.label}»: {s.reason}
              </p>
            ))}

            <p className="cs-sub">
              Coste total de las {comparison.options.length === 2 ? 'dos' : 'tres'} opciones{' '}
              <span className="ix-tag is-verificado">dato verificado</span>
            </p>
            <div className="ix-stats cs-cards">
              {comparison.options.map((o) => {
                const isCheapest = comparison.cheapestKeys.includes(o.key);
                const best = cheapestOptions[0]?.result.totals.total ?? 0;
                const extra = o.result.totals.total - best;
                return (
                  <div
                    className={`cs-card${isCheapest && !comparison.allEqual ? ' is-best' : ''}`}
                    key={o.key}
                  >
                    <p className="ix-big-label">{o.label}</p>
                    <p className="ix-big">{formatCost(o.result.totals.total)}</p>
                    <p className="cs-card-note">
                      {comparison.allEqual
                        ? 'Mismo coste que las demás'
                        : isCheapest
                          ? comparison.cheapestKeys.length > 1
                            ? 'Empate: la más barata'
                            : 'La más barata'
                          : `${formatCost(extra)} más que la más barata`}
                    </p>
                    {o.key === selected.key && <span className="ix-tag">En el detalle</span>}
                  </div>
                );
              })}
            </div>

            <div className="ix-table-wrap" role="region" aria-label="Comparación de opciones" tabIndex={0}>
              <table className="ix-table">
                <caption className="cs-sr">Aciertos, escrituras y coste de cada opción</caption>
                <thead>
                  <tr>
                    <th scope="col">Opción</th>
                    <th scope="col" className="num">
                      Aciertos
                    </th>
                    <th scope="col" className="num">
                      Escrituras
                    </th>
                    <th scope="col" className="num">
                      Coste total
                    </th>
                    <th scope="col" className="num">
                      Frente a sin caché
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.options.map((o) => {
                    const diff = o.result.totals.total - none.result.totals.total;
                    const pct = none.result.totals.total > 0 ? (diff / none.result.totals.total) * 100 : 0;
                    return (
                      <tr key={o.key}>
                        <th scope="row">
                          {o.label}
                          {comparison.cheapestKeys.includes(o.key) && !comparison.allEqual
                            ? ' (la más barata)'
                            : ''}
                        </th>
                        <td className="num">{o.result.counts.hits}</td>
                        <td className="num">{o.result.counts.writes}</td>
                        <td className="num">{formatCost(o.result.totals.total)}</td>
                        <td className="num">
                          {o.key === 'none'
                            ? '—'
                            : Math.abs(diff) < 1e-12
                              ? 'igual'
                              : `${diff < 0 ? '−' : '+'}${formatCost(Math.abs(diff))} (${diff < 0 ? '−' : '+'}${formatNumber(Math.round(Math.abs(pct)))} %)`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="cs-sub">Desglose por concepto</p>
            <div
              className="ix-table-wrap"
              role="region"
              aria-label="Desglose del coste por concepto"
              tabIndex={0}
            >
              <table className="ix-table">
                <caption className="cs-sr">Coste por concepto de cada opción, en dólares</caption>
                <thead>
                  <tr>
                    <th scope="col">Concepto</th>
                    {comparison.options.map((o) => (
                      <th scope="col" className="num" key={o.key}>
                        {o.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ['cacheWrite', 'Escritura de caché'],
                      ['cacheRead', 'Lectura de caché'],
                      ['input', 'Entrada sin caché'],
                      ['output', 'Salida'],
                      ['total', 'Total'],
                    ] as const
                  ).map(([key, label]) => (
                    <tr key={key}>
                      <th scope="row">{label}</th>
                      {comparison.options.map((o) => (
                        <td className="num" key={o.key}>
                          {formatCost(o.result.totals[key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">Tokens leídos de la caché</th>
                    {comparison.options.map((o) => (
                      <td className="num" key={o.key}>
                        {formatNumber(o.result.tokens.cacheRead)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {comparison.breakEven && <BreakEven be={comparison.breakEven} />}

            <p className="cs-sub">Línea temporal: {selected.label}</p>
            <Timeline option={selected} />
            <ul className="cs-legend">
              <li>
                <span aria-hidden="true">●</span> acierto: lee la caché
              </li>
              <li>
                <span aria-hidden="true">■</span> fallo: escribe en caché
              </li>
              <li>
                <span aria-hidden="true">◆</span> sin caché
              </li>
              <li>Línea continua: la entrada seguía viva; discontinua: había caducado.</li>
            </ul>

            <div className="ix-table-wrap" role="region" aria-label="Detalle de cada petición" tabIndex={0}>
              <table className="ix-table">
                <caption className="cs-sr">Resultado y coste de cada petición con {selected.label}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="num">
                      N.º
                    </th>
                    <th scope="col" className="num">
                      Separación
                    </th>
                    <th scope="col" className="num">
                      Instante
                    </th>
                    <th scope="col">Resultado</th>
                    <th scope="col" className="num">
                      Escritura
                    </th>
                    <th scope="col" className="num">
                      Lectura
                    </th>
                    <th scope="col" className="num">
                      Entrada
                    </th>
                    <th scope="col" className="num">
                      Salida
                    </th>
                    <th scope="col" className="num">
                      Coste
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selected.result.requests.map((r) => (
                    <tr key={r.index}>
                      <td className="num">{r.index}</td>
                      <td className="num">{r.index === 1 ? '—' : formatDuration(r.gapSeconds)}</td>
                      <td className="num">{formatDuration(r.atSeconds)}</td>
                      <td>
                        <span aria-hidden="true">{symbolFor(r)} </span>
                        {outcomeLabel(r.outcome)}
                      </td>
                      <td className="num">{formatCost(r.cost.cacheWrite)}</td>
                      <td className="num">{formatCost(r.cost.cacheRead)}</td>
                      <td className="num">{formatCost(r.cost.input)}</td>
                      <td className="num">{formatCost(r.cost.output)}</td>
                      <td className="num">{formatCost(r.cost.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="cs-block">
        <p className="cs-sub">
          Precios aplicados <span className="ix-tag is-verificado">dato verificado</span>
        </p>
        <div className="ix-table-wrap" role="region" aria-label="Precios aplicados" tabIndex={0}>
          <table className="ix-table">
            <caption className="cs-sr">
              Precios de {model.name} por millón de tokens{longTier ? ' (tramo largo)' : ''}
            </caption>
            <thead>
              <tr>
                <th scope="col">Concepto</th>
                <th scope="col" className="num">
                  Dólares por millón de tokens
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Entrada</th>
                <td className="num">{formatUsd(shownPrices.input)}</td>
              </tr>
              <tr>
                <th scope="row">Salida</th>
                <td className="num">{formatUsd(shownPrices.output)}</td>
              </tr>
              <tr>
                <th scope="row">Lectura de caché</th>
                <td className="num">
                  {shownPrices.cacheRead === null ? 'sin dato' : formatUsd(shownPrices.cacheRead)}
                </td>
              </tr>
              {ttlOptions.map((o) => {
                const price = o.writePrice(shownPrices);
                return (
                  <tr key={o.minutes}>
                    <th scope="row">Escritura de caché ({o.label})</th>
                    <td className="num">{price === null ? 'sin dato' : formatUsd(price)}</td>
                  </tr>
                );
              })}
              <tr>
                <th scope="row">Mínimo cacheable</th>
                <td className="num">{formatNumber(model.cache.minTokens)} tokens</td>
              </tr>
            </tbody>
          </table>
        </div>
        {longTier && model.longContext && (
          <p className="ix-note">
            Con {formatNumber(totalInput)} tokens de entrada se aplican los precios del tramo largo (a partir
            de {formatNumber(model.longContext.thresholdTokens)}), también a las lecturas de caché.
          </p>
        )}
        {model.pricingNote && <p className="ix-hint">{model.pricingNote}</p>}
        <SourceFooter sources={sources} verifiedAt={model.verifiedAt} prefix="Precios y reglas de caché de" />
      </div>
    </section>
  );
}

function BreakEven({ be }: { be: NonNullable<Comparison['breakEven']> }) {
  const short = formatDuration(be.shortMinutes * 60);
  const long = formatDuration(be.longMinutes * 60);
  return (
    <div className="cs-breakeven">
      <p className="cs-sub">
        Punto de equilibrio entre {short} y {long}
      </p>
      {be.neededAvoided === null ? (
        <p>
          No existe en este escenario: la caché de {long} no evita ningún fallo de la de {short}, así que solo
          añade la prima de escritura ({formatCost(be.premiumPaid)} en total). Con estas separaciones, {short}{' '}
          basta.
        </p>
      ) : (
        <p>
          La caché de {long} evita {formatNumber(be.avoidedMisses)}{' '}
          {be.avoidedMisses === 1 ? 'fallo' : 'fallos'} de la de {short} y ahorra{' '}
          {formatCost(be.savedByAvoided)}, pero paga {formatCost(be.premiumPaid)} de más en sus escrituras.
          Con el ahorro medio por fallo de este escenario, le bastaría evitar{' '}
          {formatNumber(be.neededAvoided, 2)} fallos para compensar:{' '}
          {be.netSavingOfLong >= 0
            ? `compensa, y sale ${formatCost(be.netSavingOfLong)} más barata.`
            : `no compensa: sale ${formatCost(-be.netSavingOfLong)} más cara.`}
        </p>
      )}
      <p className="ix-hint">
        Este equilibrio es el de tu escenario con prefijo fijo. No es la cifra de Anthropic (en torno a 1
        turno de cada 30 en Sonnet 5.5 y Opus 5.5, medición del proveedor): allí el contexto crece y cada
        turno escribe contenido nuevo. Es una inferencia de la guía de por qué no coinciden.
      </p>
    </div>
  );
}

/** Dibujo complementario: la tabla de peticiones contiene los mismos datos. */
function Timeline({ option }: { option: ComparedOption }) {
  const items = option.result.requests;
  const W = 600;
  const H = 150;
  const pad = 10;
  const base = 118;
  const markY = 16;
  const maxBar = 84;
  const n = items.length;
  const slot = (W - pad * 2) / n;
  const barW = Math.min(slot * 0.6, 28);
  const max = Math.max(...items.map((r) => r.cost.total), Number.MIN_VALUE);
  const ttlSeconds = option.ttlMinutes === null ? null : option.ttlMinutes * 60;
  const showLabels = n <= 14;

  return (
    <svg className="cs-timeline" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      <line x1={pad} x2={W - pad} y1={base} y2={base} className="cs-axis" />
      {items.map((r, i) => {
        const cx = pad + slot * i + slot / 2;
        const h = Math.max(2, (r.cost.total / max) * maxBar);
        const kind = isHitOutcome(r.outcome) ? 'hit' : isWriteOutcome(r.outcome) ? 'write' : 'plain';
        const next = items[i + 1];
        const nextCx = cx + slot;
        return (
          <Fragment key={r.index}>
            <rect x={cx - barW / 2} y={base - h} width={barW} height={h} className={`cs-bar is-${kind}`} />
            {kind === 'hit' && <circle cx={cx} cy={markY} r={6} className="cs-mark is-hit" />}
            {kind === 'write' && (
              <rect x={cx - 6} y={markY - 6} width={12} height={12} className="cs-mark is-write" />
            )}
            {kind === 'plain' && (
              <rect
                x={cx - 5}
                y={markY - 5}
                width={10}
                height={10}
                className="cs-mark is-plain"
                transform={`rotate(45 ${cx} ${markY})`}
              />
            )}
            {next && ttlSeconds !== null && option.result.cacheActive && (
              <line
                x1={cx + 9}
                x2={nextCx - 9}
                y1={markY}
                y2={markY}
                className={`cs-link ${next.gapSeconds <= ttlSeconds ? 'is-alive' : 'is-expired'}`}
              />
            )}
            {showLabels && (
              <text x={cx} y={base + 20} textAnchor="middle" className="cs-label">
                {r.index}
              </text>
            )}
          </Fragment>
        );
      })}
    </svg>
  );
}
