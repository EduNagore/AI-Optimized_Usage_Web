import { useId, useMemo, useState } from 'react';
import {
  EXAMPLE_INPUT,
  designTeam,
  designToText,
  type AgentModel,
  type DesignResult,
  type DesignerData,
  type FieldError,
  type ParamId,
  type TeamInput,
} from '../../lib/agent-team';
import { formatNumber } from '../../lib/format';
import type { PriceSource } from '../../lib/pricing';
import { Field, SourceFooter } from './shared';
import './interactive.css';
import './AgentTeamDesigner.css';

interface Props {
  data: DesignerData;
  models: AgentModel[];
  /** Fuentes citadas por los datos, por id. */
  sources: Record<string, PriceSource>;
  /** URL de cada página de la guía que enlazan los datos, por su ruta (p. ej. `m8-agentes/patrones`). */
  pageUrls: Record<string, string>;
}

interface Form {
  units: string;
  unitTokens: string;
  dependentSteps: 'si' | 'no';
  independentPieces: 'si' | 'no';
  pieceKind: TeamInput['pieceKind'];
  verification: TeamInput['verification'];
  errorCost: TeamInput['errorCost'];
  canWait: 'si' | 'no';
  pathKnown: 'si' | 'no';
  provider: TeamInput['provider'];
  surface: TeamInput['surface'];
  difficulty: TeamInput['difficulty'];
  longTail: 'si' | 'no';
  agentsTalk: 'si' | 'no';
}

const yn = (b: boolean): 'si' | 'no' => (b ? 'si' : 'no');

const INITIAL: Form = {
  units: String(EXAMPLE_INPUT.units),
  unitTokens: String(EXAMPLE_INPUT.unitTokens),
  dependentSteps: yn(EXAMPLE_INPUT.dependentSteps),
  independentPieces: yn(EXAMPLE_INPUT.independentPieces),
  pieceKind: EXAMPLE_INPUT.pieceKind,
  verification: EXAMPLE_INPUT.verification,
  errorCost: EXAMPLE_INPUT.errorCost,
  canWait: yn(EXAMPLE_INPUT.canWait),
  pathKnown: yn(EXAMPLE_INPUT.pathKnown),
  provider: EXAMPLE_INPUT.provider,
  surface: EXAMPLE_INPUT.surface,
  difficulty: EXAMPLE_INPUT.difficulty,
  longTail: yn(EXAMPLE_INPUT.longTail),
  agentsTalk: yn(EXAMPLE_INPUT.agentsTalk),
};

const SI_NO = [
  { value: 'si', label: 'Sí' },
  { value: 'no', label: 'No' },
] as const;

/** Número desde el texto de un campo: admite coma o punto decimal; vacío o con letras → NaN. */
function parseNumber(text: string): number {
  const t = text.trim();
  if (!/^\d+([.,]\d+)?$/.test(t)) return Number.NaN;
  return Number(t.replace(',', '.'));
}

function toInput(form: Form, assumptions: Partial<Record<ParamId, number>>): TeamInput {
  return {
    units: parseNumber(form.units),
    unitTokens: parseNumber(form.unitTokens),
    dependentSteps: form.dependentSteps === 'si',
    independentPieces: form.independentPieces === 'si',
    pieceKind: form.pieceKind,
    difficulty: form.difficulty,
    verification: form.verification,
    pathKnown: form.pathKnown === 'si',
    errorCost: form.errorCost,
    canWait: form.canWait === 'si',
    longTail: form.longTail === 'si',
    agentsTalk: form.agentsTalk === 'si',
    provider: form.provider,
    surface: form.surface,
    assumptions,
  };
}

const PROVIDER_NAMES: Record<TeamInput['provider'], string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
  google: 'Google (Gemini)',
};

const CLAIM_CLASS: Record<string, string> = {
  estimacion: 'is-recomendacion',
  medicion: 'is-medicion',
  referencia: '',
  'sin-cifra': '',
};

function multText(n: number): string {
  return `${formatNumber(Math.round(n * 100) / 100, 2)}×`;
}

function usdText(n: number): string {
  if (n < 0.01) return 'menos de 0,01 $';
  return `${formatNumber(Math.round(n * 100) / 100, 2)} $`;
}

export default function AgentTeamDesigner({ data, models, sources, pageUrls }: Props) {
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const [form, setForm] = useState<Form>(INITIAL);
  /** Supuestos editados, por `topología.parámetro`: al cambiar de topología no se arrastran. */
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'fail'>('idle');

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setCopyState('idle');
  };

  const { result, errors, text } = useMemo(() => {
    const first = designTeam(toInput(form, {}), data, models);
    const topologyId = first.ok ? first.topology.id : '';
    const assumptions: Partial<Record<ParamId, number>> = {};
    for (const [key, value] of Object.entries(edits)) {
      const [tid, pid] = key.split('.');
      if (tid === topologyId && pid) assumptions[pid as ParamId] = parseNumber(value);
    }
    const full = designTeam(toInput(form, assumptions), data, models);
    if (full.ok) return { result: full, errors: [] as FieldError[], text: designToText(full, data) };
    // Un supuesto mal escrito no debe hacer desaparecer el resultado ni los campos para corregirlo:
    // se muestra el diseño con los valores por defecto y el error junto al campo.
    if (first.ok && full.errors.every((e) => e.field.startsWith('assumptions.'))) {
      return { result: first, errors: full.errors, text: designToText(first, data) };
    }
    return { result: null, errors: full.errors, text: '' };
  }, [form, edits, data, models]);

  const errorOf = (field: string) => errors.find((e) => e.field === field)?.message;
  const anthropic = form.provider === 'anthropic';

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('ok');
    } catch {
      setCopyState('fail');
    }
  }

  return (
    <section className="ix team not-content" aria-labelledby={id('title')}>
      <h3 className="ix-title" id={id('title')}>
        Diseñador de equipos de agentes
      </h3>
      <p className="ix-lead">
        Cuenta la forma de tu tarea y te propone una topología, un modelo y un esfuerzo de partida por rol y
        un coste orientativo. Si basta con un solo modelo, te lo dice. Es una recomendación de la guía, no una
        medición sobre tu caso. Precargado: migrar 300 ficheros de código a otra librería.
      </p>

      <form className="team-form" onSubmit={(e) => e.preventDefault()} noValidate>
        <fieldset className="team-group">
          <legend>La tarea</legend>
          <div className="ix-fields">
            <Field
              id={id('units')}
              label="Unidades de trabajo"
              hint="Cuántas piezas o elementos hay. Escribe 1 si es una sola pieza."
              error={errorOf('units')}
            >
              {(aria) => (
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.units}
                  onChange={(e) => set('units', e.target.value)}
                  {...aria}
                />
              )}
            </Field>
            <Field
              id={id('tokens')}
              label="Tamaño de una unidad (tokens)"
              hint="Supuesto tuyo, no un dato: cuenta los de una unidad real."
              error={errorOf('unitTokens')}
            >
              {(aria) => (
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.unitTokens}
                  onChange={(e) => set('unitTokens', e.target.value)}
                  {...aria}
                />
              )}
            </Field>
            <Field
              id={id('dep')}
              label="¿Cada paso necesita el resultado del anterior?"
              hint="Una cadena: no se puede hacer a la vez lo que depende de lo que aún no existe."
            >
              {(aria) => (
                <select
                  value={form.dependentSteps}
                  onChange={(e) => set('dependentSteps', e.target.value as Form['dependentSteps'])}
                  {...aria}
                >
                  {SI_NO.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field
              id={id('ind')}
              label="¿Hay piezas que se pueden hacer a la vez?"
              hint="Sin depender unas de otras ni compartir decisiones. Necesitas al menos dos unidades."
            >
              {(aria) => (
                <select
                  value={form.independentPieces}
                  onChange={(e) => set('independentPieces', e.target.value as Form['independentPieces'])}
                  {...aria}
                >
                  {SI_NO.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field
              id={id('kind')}
              label="Cómo son esas piezas"
              hint="Solo cuenta si hay varias piezas independientes."
            >
              {(aria) => (
                <select
                  value={form.pieceKind}
                  onChange={(e) => set('pieceKind', e.target.value as Form['pieceKind'])}
                  {...aria}
                >
                  <option value="iguales">Iguales: el mismo encargo para cada una</option>
                  <option value="definidas">Distintas y ya sé cuáles son</option>
                  <option value="abiertas">Distintas y el reparto lo decide quien planifica</option>
                </select>
              )}
            </Field>
            <Field
              id={id('path')}
              label="¿Conoces los pasos de antemano?"
              hint="Sí: se pueden escribir como una receta. No: dependen de lo que va apareciendo."
            >
              {(aria) => (
                <select
                  value={form.pathKnown}
                  onChange={(e) => set('pathKnown', e.target.value as Form['pathKnown'])}
                  {...aria}
                >
                  {SI_NO.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </fieldset>

        <fieldset className="team-group">
          <legend>Calidad, urgencia y herramienta</legend>
          <div className="ix-fields">
            <Field
              id={id('ver')}
              label="Verificación independiente"
              hint="Un revisor o varias lecturas con contexto limpio, no quien hizo el trabajo."
            >
              {(aria) => (
                <select
                  value={form.verification}
                  onChange={(e) => set('verification', e.target.value as Form['verification'])}
                  {...aria}
                >
                  <option value="ninguna">No la necesito</option>
                  <option value="revision">Un revisor con criterio escrito</option>
                  <option value="segunda-opinion">Una segunda opinión sobre una decisión ambigua</option>
                </select>
              )}
            </Field>
            <Field id={id('err')} label="Si hay un fallo…" hint="Cuánto cuesta equivocarse.">
              {(aria) => (
                <select
                  value={form.errorCost}
                  onChange={(e) => set('errorCost', e.target.value as Form['errorCost'])}
                  {...aria}
                >
                  <option value="bajo">Se ve enseguida y se corrige</option>
                  <option value="alto">Puede pasar desapercibido o salir caro</option>
                </select>
              )}
            </Field>
            <Field id={id('wait')} label="¿Puede esperar horas?" hint="Los lotes de la API cuestan la mitad.">
              {(aria) => (
                <select
                  value={form.canWait}
                  onChange={(e) => set('canWait', e.target.value as Form['canWait'])}
                  {...aria}
                >
                  {SI_NO.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field id={id('prov')} label="Proveedor" error={errorOf('provider')}>
              {(aria) => (
                <select
                  value={form.provider}
                  onChange={(e) => set('provider', e.target.value as Form['provider'])}
                  {...aria}
                >
                  {(Object.keys(PROVIDER_NAMES) as Array<keyof typeof PROVIDER_NAMES>).map((p) => (
                    <option key={p} value={p}>
                      {PROVIDER_NAMES[p]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {anthropic && (
              <Field
                id={id('surf')}
                label="Superficie de Claude"
                hint="Cambia el esfuerzo por defecto de algunos modelos."
              >
                {(aria) => (
                  <select
                    value={form.surface}
                    onChange={(e) => set('surface', e.target.value as Form['surface'])}
                    {...aria}
                  >
                    <option value="claude-code">Claude Code</option>
                    <option value="api">API de Claude</option>
                  </select>
                )}
              </Field>
            )}
          </div>
        </fieldset>

        <details className="team-more">
          <summary>Más señales (opcionales)</summary>
          <div className="ix-fields">
            <Field
              id={id('diff')}
              label="Perfil de dificultad"
              hint="Para decidir entre enrutar o consultar a un asesor."
            >
              {(aria) => (
                <select
                  value={form.difficulty}
                  onChange={(e) => set('difficulty', e.target.value as Form['difficulty'])}
                  {...aria}
                >
                  <option value="uniforme">Casos parecidos entre sí</option>
                  <option value="mixta">Fáciles y difíciles, y se distinguen de antemano</option>
                  <option value="pocas-criticas">Mucho trabajo mecánico y pocas decisiones críticas</option>
                </select>
              )}
            </Field>
            <Field
              id={id('tail')}
              label="¿Unos pocos casos concentran el gasto?"
              hint="Una cola larga de coste: lo demás es rutinario."
            >
              {(aria) => (
                <select
                  value={form.longTail}
                  onChange={(e) => set('longTail', e.target.value as Form['longTail'])}
                  {...aria}
                >
                  {SI_NO.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field
              id={id('talk')}
              label="¿Los agentes tienen que hablarse entre sí?"
              hint="No basta con que devuelvan su resultado."
            >
              {(aria) => (
                <select
                  value={form.agentsTalk}
                  onChange={(e) => set('agentsTalk', e.target.value as Form['agentsTalk'])}
                  {...aria}
                >
                  {SI_NO.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </details>

        <div className="ix-actions team-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setForm(INITIAL);
              setEdits({});
              setCopyState('idle');
            }}
          >
            Restaurar el ejemplo
          </button>
        </div>
      </form>

      {result ? (
        <Result
          result={result}
          text={text}
          edits={edits}
          setEdits={setEdits}
          errors={errors}
          copy={copy}
          copyState={copyState}
          sources={sources}
          pageUrls={pageUrls}
          data={data}
        />
      ) : (
        <div className="ix-result" role="status" aria-live="polite">
          <p className="ix-note team-warn">
            <strong>Revisa los campos marcados.</strong> Sin una unidad y un tamaño válidos no se puede
            diseñar el equipo.
          </p>
          <ul className="team-list">
            {errors.map((e) => (
              <li key={e.field}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

interface ResultProps {
  result: DesignResult;
  text: string;
  edits: Record<string, string>;
  setEdits: (fn: (e: Record<string, string>) => Record<string, string>) => void;
  errors: FieldError[];
  copy: () => void;
  copyState: 'idle' | 'ok' | 'fail';
  sources: Record<string, PriceSource>;
  pageUrls: Record<string, string>;
  data: DesignerData;
}

function Result({
  result,
  text,
  edits,
  setEdits,
  errors,
  copy,
  copyState,
  sources,
  pageUrls,
  data,
}: ResultProps) {
  const uid = useId();
  const { topology, cost } = result;
  const pageUrl = pageUrls[topology.pagina];
  const sourceList = result.sourceIds.flatMap((sid) => {
    const s = sources[sid];
    return s ? [s] : [];
  });
  const claimClass = CLAIM_CLASS[cost.claim] ?? '';
  const baselineNote = !result.signals.fits
    ? ' La línea base es un solo agente que hace todo, en varias pasadas si no cabe en una ventana.'
    : '';

  return (
    <div className="ix-result team-result">
      <div role="status" aria-live="polite" className="team-live">
        <p className="ix-big-label">Topología recomendada</p>
        <p className="ix-big">{topology.nombre}</p>
        <p className="team-summary">{result.summary}</p>
      </div>

      {result.noCompensa && (
        <div className="ix-note team-warn" role="group" aria-label={result.noCompensa.titulo}>
          <p className="team-warn-title">
            <strong>Aviso. {result.noCompensa.titulo}.</strong>
          </p>
          <p>{result.noCompensa.texto}</p>
          {result.noCompensa.senales.length > 0 && (
            <ul className="team-list">
              {result.noCompensa.senales.map((s) => (
                <li key={s.id}>
                  <strong>{s.senal}.</strong> {s.significa}. {s.quehacer}.
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <h4 className="team-h">Por qué esta topología</h4>
      <ul className="team-list">
        {result.why.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      <p className="team-fit">
        <span className="ix-tag">Cuándo encaja</span> {topology.cuandoEncaja}
      </p>
      <p className="team-fit">
        <span className="ix-tag is-cuidado">Cuándo no</span> {topology.cuandoNo}
      </p>
      <p className="team-fit">
        <span className="ix-tag is-recomendacion">Recomendación de la guía</span> Su porqué: cada patrón paga
        un coste fijo de coordinación y solo se amortiza si la tarea tiene la forma que ese patrón aprovecha.
        {pageUrl && (
          <>
            {' '}
            <a href={pageUrl}>Más en la página del patrón</a>.
          </>
        )}
      </p>

      <h4 className="team-h">Flujo</h4>
      <ol className="team-list team-flow">
        {topology.flujo.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <h4 className="team-h">Roles, modelo y esfuerzo de partida</h4>
      <div className="ix-table-wrap" role="region" aria-label="Tabla de roles" tabIndex={0}>
        <table className="ix-table team-table">
          <caption className="sr-only">Roles del equipo con su modelo y su esfuerzo de partida</caption>
          <thead>
            <tr>
              <th scope="col">Rol</th>
              <th scope="col">Modelo</th>
              <th scope="col">Esfuerzo</th>
              <th scope="col">Por qué y siguiente ajuste</th>
            </tr>
          </thead>
          <tbody>
            {result.roles.map((r) => (
              <tr key={r.id}>
                <th scope="row">
                  {r.nombre}
                  <span className="team-sub">{r.cantidad}</span>
                </th>
                <td>
                  {r.model ? (
                    <>
                      {r.model.name}
                      {r.tierNote && <span className="team-sub">{r.tierNote}</span>}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{r.effortText}</td>
                <td>
                  {r.funcion} {r.porQue}
                  <span className="team-sub">
                    Siguiente ajuste (solo midiendo): {r.siguienteAjuste}
                    {r.candidata && ` Candidato a medir: ${r.candidata}.`}
                    {r.escalaA && ` Solo si falla: ${r.escalaA}.`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ix-hint">
        Regla de partida (recomendación de la guía): modelo capaz y su esfuerzo por defecto; bajar un escalón
        cada vez midiendo en una muestra con casos difíciles; subir si falla. Lo que un script puede calcular
        se calcula con código.
      </p>

      <h4 className="team-h">Coste orientativo</h4>
      <div className="team-cost">
        <p className="ix-big-label">
          <span className={`ix-tag ${claimClass}`}>{cost.claimLabel}</span>
        </p>
        {cost.multiplierVsAlta !== null ? (
          <>
            <p className="ix-big">≈ {multText(cost.multiplierVsAlta)}</p>
            <p className="team-sub-lead">
              {cost.cited
                ? `frente a ${cost.cited.base}`
                : `frente a un solo agente con ${cost.baselineAltaModel}, la línea base de la guía`}
              .
            </p>
          </>
        ) : (
          <p className="team-sub-lead">
            No hay una cifra que sostener para esta topología: el coste depende de lo que midas con tres
            elementos.
          </p>
        )}
        {cost.multiplierVsWorker !== null && !cost.cited && (
          <p className="team-sub-lead">
            ≈ {multText(cost.multiplierVsWorker)} frente a {cost.baselineWorkerModel} solo: si el modelo del
            trabajador te basta solo, esta es la comparación que decide si el reparto compensa.
          </p>
        )}
        {cost.cited && <p>{cost.cited.texto}</p>}
        {cost.totalUsd !== null && !cost.cited && cost.claim !== 'referencia' && (
          <p className="team-sub-lead">
            Con tus supuestos: {usdText(cost.totalUsd)} el equipo, {usdText(cost.baselineAltaUsd)} con{' '}
            {cost.baselineAltaModel} solo y {usdText(cost.baselineWorkerUsd)} con {cost.baselineWorkerModel}{' '}
            solo.
            {baselineNote}
          </p>
        )}
        <p className="ix-hint">{cost.note}</p>

        {cost.terms.length > 0 && (
          <details className="team-more">
            <summary>Fórmula y cuenta paso a paso</summary>
            <ul className="team-list">
              {cost.formulaLines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <div className="ix-table-wrap" role="region" aria-label="Términos del coste" tabIndex={0}>
              <table className="ix-table team-table">
                <caption className="sr-only">Términos de la estimación de coste</caption>
                <thead>
                  <tr>
                    <th scope="col">Término</th>
                    <th scope="col">Cuenta</th>
                    <th scope="col" className="num">
                      Tokens de entrada
                    </th>
                    <th scope="col" className="num">
                      Dólares
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cost.terms.map((t) => (
                    <tr key={t.id}>
                      <th scope="row">{t.label}</th>
                      <td>{t.formula}</td>
                      <td className="num">{formatNumber(Math.round(t.inputTokens))}</td>
                      <td className="num">{usdText(t.usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="ix-hint">
              Precio efectivo = (precio de entrada + salida por entrada × precio de salida) / 10^6, con los
              precios de la tabla de modelos de la guía. No se modela el esfuerzo (más esfuerzo, más tokens de
              razonamiento), ni la caché de prompt, ni los reintentos.
            </p>
          </details>
        )}

        {cost.assumptions.length > 0 && (
          <fieldset className="team-group team-assumptions">
            <legend>Supuestos editables</legend>
            <div className="ix-fields">
              {cost.assumptions.map((a) => {
                const key = `${topology.id}.${a.id}`;
                const fieldId = `${uid}-${a.id}`;
                const def = data.parametros.find((p) => p.id === a.id);
                const current = edits[key] ?? String(a.valor).replace('.', ',');
                const error = errors.find((e) => e.field === `assumptions.${a.id}`)?.message;
                return (
                  <Field
                    key={a.id}
                    id={fieldId}
                    label={a.etiqueta}
                    hint={`${def?.ayuda ?? ''} (${
                      a.origen === 'supuesto'
                        ? 'supuesto inicial de la guía'
                        : a.origen === 'guia'
                          ? 'ejemplo de la guía'
                          : 'dato de la documentación'
                    })`}
                    error={error}
                  >
                    {(aria) => (
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={current}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEdits((prev) => ({ ...prev, [key]: v }));
                        }}
                        {...aria}
                      />
                    )}
                  </Field>
                );
              })}
            </div>
          </fieldset>
        )}
      </div>

      {result.notices.length > 0 && (
        <>
          <h4 className="team-h">Avisos</h4>
          <ul className="team-list team-notices">
            {result.notices.map((n) => (
              <li key={n.text}>
                <strong>{n.tone === 'aviso' ? 'Aviso.' : 'Consejo.'}</strong> {n.text}
              </li>
            ))}
          </ul>
        </>
      )}

      {result.reminders.length > 0 && (
        <>
          <h4 className="team-h">Antes de repartir</h4>
          <ul className="team-list">
            {result.reminders.map((s) => (
              <li key={s.id}>
                <strong>{s.senal}:</strong> {s.significa}. {s.quehacer}.
              </li>
            ))}
            <li>Depura el encargo con uno o dos elementos y estima el coste con tres antes de escalar.</li>
            <li>
              Mide el modelo capaz solo (esfuerzo por defecto y uno más bajo) en cinco casos con los
              difíciles.
            </li>
          </ul>
        </>
      )}

      <h4 className="team-h">Alternativa más simple</h4>
      <p>
        {result.simpler.nombre && <strong>{result.simpler.nombre}. </strong>}
        {result.simpler.texto}
      </p>

      {result.implementations.length > 0 && (
        <>
          <h4 className="team-h">Cómo montarlo</h4>
          <ul className="team-list">
            {result.implementations.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}

      <div className="ix-actions team-actions">
        <button type="button" className="btn" onClick={copy}>
          Copiar el diseño como texto
        </button>
        <span className="team-copied" role="status" aria-live="polite">
          {copyState === 'ok' && 'Copiado. Pégalo como encargo inicial.'}
          {copyState === 'fail' && 'No se pudo copiar; selecciona el texto de abajo.'}
        </span>
      </div>
      {copyState === 'fail' && (
        <textarea className="team-text" readOnly rows={12} value={text} aria-label="Diseño en texto" />
      )}

      <SourceFooter
        sources={sourceList}
        verifiedAt={result.verifiedAt}
        prefix="Criterios de la guía (M8), cifras citadas y precios de"
      />
    </div>
  );
}
