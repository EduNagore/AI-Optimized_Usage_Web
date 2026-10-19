import { useId, useMemo, useState } from 'react';
import {
  DEFAULT_MODEL_IDS,
  DEFAULT_RAW_INPUTS,
  compareModels,
  configurationWarnings,
  formatCost,
  leverEffects,
  parseCostInputs,
  type CacheMode,
  type CacheScope,
  type CostWarning,
  type LeverEffect,
  type ModelCost,
  type NumericField,
  type RawCostInputs,
  type TtlChoice,
} from '../../lib/cost-calculator';
import { formatDate, formatNumber, formatUsd } from '../../lib/format';
import type { CatalogModel, PricingCatalog, Provider } from '../../lib/pricing';
import { Field, SourceFooter } from './shared';
import './interactive.css';
import './CostCalculator.css';

interface Props {
  catalog: PricingCatalog;
  /** Ids de los modelos con los que arranca la comparación (hasta 4). */
  defaultModelIds?: string[];
}

const MAX_MODELS = 4;
const PROVIDER_NAMES: Record<Provider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
};
const PROVIDERS: Provider[] = ['anthropic', 'openai', 'google'];

function initialSlots(catalog: PricingCatalog, ids: readonly string[]): string[] {
  const valid = ids.filter((id) => catalog.models.some((m) => m.id === id)).slice(0, MAX_MODELS);
  if (valid.length === 0 && catalog.models[0]) valid.push(catalog.models[0].id);
  return Array.from({ length: MAX_MODELS }, (_, i) => valid[i] ?? '');
}

const tokens = (n: number) => formatNumber(Math.round(n));
const pct = (n: number) => formatNumber(Math.round(n * 10) / 10, 1);

function effectText(l: LeverEffect): string {
  if (!l.applicable) return l.reason ?? 'No aplicable.';
  const percent = l.savingPercent === null ? '' : ` (${pct(Math.abs(l.savingPercent))} %)`;
  if (l.kind === 'ahorra') return `Ahorras ${formatCost(l.savingMonthlyUsd)} al mes${percent}.`;
  if (l.kind === 'cuesta-mas') return `Pagas ${formatCost(-l.savingMonthlyUsd)} más al mes${percent}.`;
  return 'Sin efecto con estos datos.';
}

function WarningList({ warnings }: { warnings: CostWarning[] }) {
  return (
    <ul className="calc-warnings">
      {warnings.map((w) => (
        <li key={`${w.code}-${w.message}`}>
          <span className={w.severity === 'cuidado' ? 'ix-tag is-cuidado' : 'ix-tag'}>
            {w.severity === 'cuidado' ? 'Cuidado' : 'Nota'}
          </span>{' '}
          {w.message}
        </li>
      ))}
    </ul>
  );
}

export default function CostCalculator({ catalog, defaultModelIds = [...DEFAULT_MODEL_IDS] }: Props) {
  const uid = useId();
  const [raw, setRaw] = useState<RawCostInputs>(DEFAULT_RAW_INPUTS);
  const [slots, setSlots] = useState<string[]>(() => initialSlots(catalog, defaultModelIds));
  const [focusId, setFocusId] = useState<string>('sonnet-5-5');

  const setField = (field: NumericField) => (e: { target: { value: string } }) =>
    setRaw((r) => ({ ...r, [field]: e.target.value }));
  const setSlot = (i: number, id: string) => setSlots((s) => s.map((v, j) => (j === i ? id : v)));

  const selected: CatalogModel[] = useMemo(() => {
    const out: CatalogModel[] = [];
    for (const id of slots) {
      const m = catalog.models.find((x) => x.id === id);
      if (m && !out.some((o) => o.id === m.id)) out.push(m);
    }
    return out;
  }, [slots, catalog]);

  const parsed = useMemo(() => parseCostInputs(raw), [raw]);
  const errors = parsed.ok ? {} : parsed.errors;
  const results: ModelCost[] = useMemo(
    () => (parsed.ok ? compareModels(selected, parsed.params) : []),
    [parsed, selected],
  );
  const focus = results.find((r) => r.modelId === focusId) ?? results[0];
  const focusModel = selected.find((m) => m.id === focus?.modelId);
  const levers = useMemo(
    () => (parsed.ok && focusModel ? leverEffects(focusModel, parsed.params, selected) : []),
    [parsed, focusModel, selected],
  );
  const generalWarnings = parsed.ok ? configurationWarnings(parsed.params) : [];
  const withPlanned = selected.filter((m) => m.scheduledChange);

  const sourceGroups = useMemo(() => {
    const groups = new Map<string, string>();
    for (const m of selected) {
      const prev = groups.get(m.source);
      if (prev === undefined || m.verifiedAt > prev) groups.set(m.source, m.verifiedAt);
    }
    return [...groups].flatMap(([id, verifiedAt]) => {
      const source = catalog.sources[id];
      return source ? [{ id, source, verifiedAt }] : [];
    });
  }, [selected, catalog]);

  const reset = () => {
    setRaw(DEFAULT_RAW_INPUTS);
    setSlots(initialSlots(catalog, defaultModelIds));
    setFocusId('sonnet-5-5');
  };

  const numberField = (
    field: NumericField,
    label: string,
    hint: string,
    mode: 'numeric' | 'decimal' = 'numeric',
  ) => (
    <Field id={`${uid}-${field}`} label={label} hint={hint} error={errors[field]}>
      {(aria) => (
        <input
          {...aria}
          type="text"
          inputMode={mode}
          autoComplete="off"
          value={raw[field]}
          onChange={setField(field)}
        />
      )}
    </Field>
  );

  const requests = focus?.requests ?? [];
  const totalInput = requests.reduce((s, r) => s + r.inputTokens, 0);

  return (
    <section className="ix calc not-content" aria-labelledby={`${uid}-title`}>
      <h3 className="ix-title" id={`${uid}-title`}>
        Calculadora de coste por tarea
      </h3>
      <p className="ix-lead">
        Compara hasta cuatro modelos con tus cifras. Está precargado el ejemplo de la página: resumir un
        contrato de 30.000 tokens con un resumen de 1.500, 2.000 veces al mes, sin caché ni razonamiento.
      </p>

      <fieldset className="ix-field calc-group">
        <legend>
          Modelos a comparar <span className="ix-tag is-verificado">Precios: dato verificado</span>
        </legend>
        <div className="ix-fields">
          {slots.map((slotId, i) => (
            <Field
              key={i}
              id={`${uid}-model-${i}`}
              label={i === 0 ? 'Modelo 1' : `Modelo ${i + 1} (opcional)`}
            >
              {(aria) => (
                <select {...aria} value={slotId} onChange={(e) => setSlot(i, e.target.value)}>
                  {i > 0 && <option value="">Sin modelo</option>}
                  {PROVIDERS.map((p) => (
                    <optgroup key={p} label={PROVIDER_NAMES[p]}>
                      {catalog.models
                        .filter((m) => m.provider === p)
                        .map((m) => (
                          <option
                            key={m.id}
                            value={m.id}
                            disabled={slots.some((s, j) => j !== i && s === m.id)}
                          >
                            {m.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </Field>
          ))}
        </div>
      </fieldset>

      <fieldset className="ix-field calc-group">
        <legend>
          Tu tarea <span className="ix-tag">Supuesto de la guía</span>
        </legend>
        <p className="ix-hint">
          Son cifras de ejemplo: sustitúyelas por las tuyas (mídelas antes, como explica la página «Medir»).
          Entrada, salida y razonamiento se indican por turno; con un solo turno, por tarea.
        </p>
        <div className="ix-fields">
          {numberField(
            'inputTokens',
            'Tokens de entrada (primer turno)',
            'Instrucciones, documentos y tu mensaje del primer turno.',
          )}
          {numberField(
            'outputTokens',
            'Tokens de salida (por turno)',
            'La respuesta visible. En los turnos siguientes se reenvía como entrada.',
          )}
          {numberField(
            'reasoningTokens',
            'Tokens de razonamiento (por turno)',
            'Se facturan como salida, aunque no veas el razonamiento entero.',
          )}
          {numberField(
            'turns',
            'Turnos por tarea',
            'Peticiones que hace la tarea. Cada una reenvía el historial.',
          )}
          {numberField(
            'historyGrowthTokens',
            'Crecimiento del historial por turno',
            'Tokens nuevos que aporta cada turno (tu mensaje, resultados de herramientas), sin contar la respuesta anterior del modelo.',
          )}
          {numberField('tasksPerMonth', 'Tareas al mes', 'Cuántas veces repites la tarea en un mes.')}
        </div>
        <label className="ix-choice">
          <input
            type="checkbox"
            checked={raw.reasoningInHistory}
            onChange={(e) => setRaw((r) => ({ ...r, reasoningInHistory: e.target.checked }))}
          />
          <span>
            Reenviar también el razonamiento de los turnos anteriores (por defecto no: lo habitual es que se
            descarte).
          </span>
        </label>
      </fieldset>

      <fieldset className="ix-field calc-group">
        <legend>
          Caché de prompts <span className="ix-tag">Supuesto de la guía</span>
        </legend>
        <div className="ix-fields">
          <Field id={`${uid}-cacheMode`} label="Qué se cachea">
            {(aria) => (
              <select
                {...aria}
                value={raw.cacheMode}
                onChange={(e) => setRaw((r) => ({ ...r, cacheMode: e.target.value as CacheMode }))}
              >
                <option value="off">Sin caché</option>
                <option value="prefix">Solo el prefijo estable</option>
                <option value="conversation">Prefijo e historial (el punto de corte avanza)</option>
              </select>
            )}
          </Field>
          <Field
            id={`${uid}-cacheScope`}
            label="Dónde se reutiliza"
            hint="«Entre tareas»: el prefijo ya está escrito cuando empieza otra tarea."
          >
            {(aria) => (
              <select
                {...aria}
                value={raw.cacheScope}
                onChange={(e) => setRaw((r) => ({ ...r, cacheScope: e.target.value as CacheScope }))}
              >
                <option value="task">Solo dentro de cada tarea (el turno 1 escribe)</option>
                <option value="tasks">También entre tareas</option>
              </select>
            )}
          </Field>
          {numberField(
            'cacheablePrefixTokens',
            'Prefijo estable (tokens)',
            'Parte de la entrada del primer turno que es idéntica en todas las peticiones: instrucciones, herramientas, documentos de referencia. Va al principio.',
          )}
          {numberField(
            'cacheHitPercent',
            '% de acierto de la caché',
            'De los tokens que podrían leerse de caché, qué porcentaje se lee; el resto se reescribe. Anthropic publicó una mediana del 84 % en bucles de agente (medición del proveedor, no garantía).',
            'decimal',
          )}
          <Field
            id={`${uid}-ttl`}
            label="Duración de la caché (TTL)"
            hint="Solo cambia el precio de la escritura. OpenAI ofrece 30 min y Gemini no tiene TTL configurable."
          >
            {(aria) => (
              <select
                {...aria}
                value={raw.ttl}
                onChange={(e) => setRaw((r) => ({ ...r, ttl: e.target.value as TtlChoice }))}
              >
                <option value="short">Corta (5 min en Claude)</option>
                <option value="long">Larga (1 h en Claude)</option>
              </select>
            )}
          </Field>
        </div>
      </fieldset>

      <fieldset className="ix-field calc-group">
        <legend>Opciones de precio</legend>
        <label className="ix-choice">
          <input
            type="checkbox"
            checked={raw.useBatch}
            onChange={(e) => setRaw((r) => ({ ...r, useBatch: e.target.checked }))}
          />
          <span>Usar Batch (descuento sobre todo el coste; sin respuesta inmediata)</span>
        </label>
        {withPlanned.length > 0 && (
          <label className="ix-choice">
            <input
              type="checkbox"
              checked={raw.usePlannedPrice}
              onChange={(e) => setRaw((r) => ({ ...r, usePlannedPrice: e.target.checked }))}
            />
            <span>
              Con el precio anunciado:{' '}
              {withPlanned
                .map((m) => `${m.name} desde el ${formatDate(m.scheduledChange?.effectiveFrom ?? '')}`)
                .join('; ')}
              .
            </span>
          </label>
        )}
      </fieldset>

      <div className="ix-actions">
        <button type="button" className="btn" onClick={reset}>
          Restablecer ejemplo
        </button>
      </div>

      <div className="ix-result">
        <h4 className="calc-h">Resultado</h4>
        <div aria-live="polite" aria-atomic="true">
          {!parsed.ok && (
            <p className="ix-note calc-note-error">
              <strong>Cuidado:</strong> corrige los campos marcados en rojo para ver el resultado.
            </p>
          )}
          {parsed.ok && !focus && <p className="ix-note">Elige al menos un modelo.</p>}
          {parsed.ok && focus && (
            <>
              <p className="ix-big-label">{focus.modelName}</p>
              <div className="ix-stats">
                <div>
                  <p className="ix-big-label">Por tarea</p>
                  <p className="ix-big">{formatCost(focus.perTaskUsd)}</p>
                </div>
                <div>
                  <p className="ix-big-label">Al mes</p>
                  <p className="ix-big">{formatCost(focus.monthlyUsd)}</p>
                </div>
              </div>
            </>
          )}
        </div>

        {parsed.ok && results.length > 0 && (
          <>
            <h4 className="calc-h">
              Comparación <span className="ix-tag is-verificado">Precios: dato verificado</span>
            </h4>
            <div className="ix-table-wrap" role="region" aria-label="Comparación de modelos" tabIndex={0}>
              <table className="ix-table">
                <caption className="calc-sr">
                  Coste por tarea y al mes de cada modelo con la configuración elegida
                  {raw.useBatch ? ', con Batch cuando existe' : ''}.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Modelo</th>
                    <th scope="col" className="num">
                      Por tarea
                    </th>
                    <th scope="col" className="num">
                      Al mes
                    </th>
                    <th scope="col" className="num">
                      Al mes con Batch
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.modelId}>
                      <th scope="row">
                        {r.modelName}
                        {r.warnings.some((w) => w.severity === 'cuidado') && (
                          <span className="calc-flag"> · hay avisos</span>
                        )}
                      </th>
                      <td className="num">{formatCost(r.perTaskUsd)}</td>
                      <td className="num">{formatCost(r.monthlyUsd)}</td>
                      <td className="num">
                        {r.monthlyBatchUsd === null ? 'No disponible' : formatCost(r.monthlyBatchUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {results.length > 1 && (
              <div className="calc-focus">
                <Field id={`${uid}-focus`} label="Ver el desglose y las palancas de">
                  {(aria) => (
                    <select
                      {...aria}
                      value={focus?.modelId ?? ''}
                      onChange={(e) => setFocusId(e.target.value)}
                    >
                      {results.map((r) => (
                        <option key={r.modelId} value={r.modelId}>
                          {r.modelName}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              </div>
            )}
          </>
        )}

        {parsed.ok && focus && (
          <>
            <h4 className="calc-h">Desglose por concepto: {focus.modelName}</h4>
            <div className="ix-table-wrap" role="region" aria-label="Desglose por concepto" tabIndex={0}>
              <table className="ix-table">
                <caption className="calc-sr">
                  Tokens, precio por millón y coste por tarea de cada concepto de {focus.modelName}.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Concepto</th>
                    <th scope="col" className="num">
                      Tokens por tarea
                    </th>
                    <th scope="col" className="num">
                      Precio por millón
                    </th>
                    <th scope="col" className="num">
                      Coste por tarea
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {focus.lines.map((l) => (
                    <tr key={l.id}>
                      <th scope="row">
                        {l.label}
                        {l.id === 'cacheWrite' && focus.ttlMinutes !== null && (
                          <span className="calc-flag">
                            {' '}
                            · TTL de {focus.ttlMinutes === 60 ? '1 h' : `${focus.ttlMinutes} min`}
                          </span>
                        )}
                      </th>
                      <td className="num">{tokens(l.tokens)}</td>
                      <td className="num">
                        {l.mixedPrices
                          ? 'Varía por tramo'
                          : l.unitPriceUsd === null
                            ? '—'
                            : formatUsd(l.unitPriceUsd)}
                      </td>
                      <td className="num">{formatCost(l.costUsd)}</td>
                    </tr>
                  ))}
                  {focus.batchDiscountUsd > 0 && (
                    <tr>
                      <th scope="row">Descuento de Batch (×{formatNumber(focus.batchFactor ?? 1)})</th>
                      <td className="num">—</td>
                      <td className="num">—</td>
                      <td className="num">−{formatCost(focus.batchDiscountUsd)}</td>
                    </tr>
                  )}
                  <tr className="calc-total">
                    <th scope="row">Total por tarea</th>
                    <td className="num">—</td>
                    <td className="num">—</td>
                    <td className="num">{formatCost(focus.perTaskUsd)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="ix-hint">
              Entrada total enviada por tarea: {tokens(totalInput)} tokens en {requests.length}{' '}
              {requests.length === 1 ? 'petición' : 'peticiones'}
              {focus.cacheActiveRequests > 0 ? `; la caché está activa en ${focus.cacheActiveRequests}` : ''}.
              Las lecturas de caché pueden salir con decimales: son valores esperados según el % de acierto.
            </p>

            <h4 className="calc-h">Efecto de cada palanca: {focus.modelName}</h4>
            <p className="ix-hint">
              Cada fila cambia solo esa palanca respecto a la configuración actual; los ahorros no se suman.
              Cambiar de modelo compara con los otros modelos elegidos.
            </p>
            <div className="ix-table-wrap" role="region" aria-label="Efecto de cada palanca" tabIndex={0}>
              <table className="ix-table">
                <caption className="calc-sr">Coste y ahorro de cada palanca por separado.</caption>
                <thead>
                  <tr>
                    <th scope="col">Palanca</th>
                    <th scope="col" className="num">
                      Al mes
                    </th>
                    <th scope="col">Efecto</th>
                  </tr>
                </thead>
                <tbody>
                  {levers.map((l) => (
                    <tr key={l.id}>
                      <th scope="row" className="calc-wrap">
                        {l.label}
                        <span className="ix-hint calc-block">{l.detail}</span>
                      </th>
                      <td className="num">{l.applicable ? formatCost(l.monthlyUsd) : '—'}</td>
                      <td className="calc-wrap">{effectText(l)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {parsed.ok && (generalWarnings.length > 0 || results.some((r) => r.warnings.length > 0)) && (
          <>
            <h4 className="calc-h">Avisos</h4>
            {generalWarnings.length > 0 && <WarningList warnings={generalWarnings} />}
            {results
              .filter((r) => r.warnings.length > 0)
              .map((r) => (
                <div key={r.modelId}>
                  <p className="calc-model-name">{r.modelName}</p>
                  <WarningList warnings={r.warnings} />
                </div>
              ))}
          </>
        )}

        {selected.some((m) => m.notes || m.pricingNote) && (
          <>
            <h4 className="calc-h">Notas de precio de los modelos</h4>
            <dl className="calc-notes">
              {selected
                .filter((m) => m.notes || m.pricingNote)
                .map((m) => (
                  <div key={m.id}>
                    <dt>{m.name}</dt>
                    <dd>{[m.notes, m.pricingNote].filter(Boolean).join(' ')}</dd>
                  </div>
                ))}
            </dl>
          </>
        )}

        {sourceGroups.map((g) => (
          <SourceFooter key={g.id} sources={[g.source]} verifiedAt={g.verifiedAt} prefix="Precios de" />
        ))}
        <p className="ix-source">
          Fórmula por petición: entrada sin caché × precio de entrada + escrituras × precio de escritura
          (según el TTL) + lecturas × precio de lectura + (salida + razonamiento) × precio de salida; con
          Batch, ×0,5. Los precios son dólares por millón de tokens. No incluye el coste de revisar el
          resultado.
        </p>
      </div>
    </section>
  );
}
