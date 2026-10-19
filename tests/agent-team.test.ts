import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EXAMPLE_INPUT,
  buildAgentModels,
  defaultEffort,
  designTeam,
  designToText,
  effectivePrice,
  parseDesignerData,
  resolveGama,
  validateDesignerData,
  validateInput,
  type AgentModel,
  type DesignResult,
  type TeamInput,
} from '../src/lib/agent-team';
import type { ModelPricingDetailRecord, ModelRecord } from '../src/lib/schemas';

const load = <T = Record<string, unknown>>(name: string): T[] =>
  JSON.parse(readFileSync(`src/data/${name}.json`, 'utf8')) as T[];

const data = parseDesignerData(load('agent-topologies'));
const realModels = buildAgentModels(
  load<ModelRecord>('models'),
  load<ModelPricingDetailRecord>('model-pricing-details'),
);
const sourceIds = load<{ id: string }>('sources').map((s) => s.id);

/**
 * Catálogo sintético para comprobar la aritmética sin depender de los precios reales (que cambian).
 * Con una salida de 0,2 tokens por cada token de entrada (valor por defecto de `outputRatio`):
 *   alta        = 5 $ entrada, 25 $ salida  → (5 + 0,2 × 25) / 10^6 = 1e-5 $ por token
 *   equilibrada = 2 $ entrada, 10 $ salida  → (2 + 0,2 × 10) / 10^6 = 4e-6 $ por token
 *   rápida      = 0,5 $ entrada, 2,5 $ salida → (0,5 + 0,2 × 2,5) / 10^6 = 1e-6 $ por token
 * El Batch de la equilibrada descuenta a la mitad. Ventana de 1.000.000 tokens: «cabe» = hasta 500.000.
 */
const mk = (
  id: string,
  tier: string,
  priceIn: number,
  priceOut: number,
  batchFactor: number | null,
): AgentModel => ({
  id,
  name: id.toUpperCase(),
  provider: 'anthropic',
  tier,
  contextWindow: 1_000_000,
  priceIn,
  priceOut,
  batchFactor,
  effortDefaults: { api: 'high', 'claude-code': 'medium' },
  source: 'anthropic-precios',
  verifiedAt: '2026-10-16',
});
const synth: AgentModel[] = [
  mk('alta', 'Alto rendimiento', 5, 25, 0.5),
  mk('equi', 'Equilibrado', 2, 10, 0.5),
  mk('rapi', 'Rápido y barato', 0.5, 2.5, 0.5),
  mk('front', 'Frontera', 10, 50, 0.5),
];

/** Entrada base: una sola pieza, camino conocido, sin verificación → llamada única. */
const base: TeamInput = {
  units: 1,
  unitTokens: 5000,
  dependentSteps: false,
  independentPieces: false,
  pieceKind: 'iguales',
  difficulty: 'uniforme',
  verification: 'ninguna',
  pathKnown: true,
  errorCost: 'bajo',
  canWait: true,
  longTail: false,
  agentsTalk: false,
  provider: 'anthropic',
  surface: 'api',
  assumptions: {},
};

function design(over: Partial<TeamInput>, models: AgentModel[] = synth): DesignResult {
  const r = designTeam({ ...base, ...over }, data, models);
  if (!r.ok) throw new Error(`entrada inválida: ${r.errors.map((e) => e.message).join(' | ')}`);
  return r;
}

describe('datos de agent-topologies.json', () => {
  it('cumplen el esquema y son coherentes con modelos y fuentes', () => {
    expect(validateDesignerData(data, realModels, sourceIds)).toEqual([]);
  });

  it('no repiten ids', () => {
    const ids = load('agent-topologies').map((r) => r['id']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada fuente citada existe en sources.json', () => {
    const cited = new Set<string>();
    for (const r of load('agent-topologies')) {
      if (typeof r['source'] === 'string') cited.add(r['source']);
    }
    for (const t of data.topologias) {
      t.fuentes.forEach((f) => cited.add(f));
      t.limites.forEach((l) => cited.add(l.source));
      if (t.coste.cifra) cited.add(t.coste.cifra.source);
    }
    for (const id of cited) expect(sourceIds).toContain(id);
  });

  it('cada página enlazada existe en src/content/docs', () => {
    const pages = new Set<string>([
      ...data.topologias.map((t) => t.pagina),
      ...data.razones.map((r) => r.pagina),
      ...data.senales.map((s) => s.pagina),
    ]);
    for (const p of pages) {
      const exists = existsSync(`src/content/docs/${p}.mdx`) || existsSync(`src/content/docs/${p}/index.mdx`);
      expect(exists, p).toBe(true);
    }
  });

  it('cada diagrama citado existe en FlujoAgentes.astro', () => {
    const astro = readFileSync('src/components/diagrams/FlujoAgentes.astro', 'utf8');
    for (const t of data.topologias) {
      if (t.diagrama) expect(astro).toMatch(new RegExp(`['"]?${t.diagrama}['"]?: \\{`));
    }
  });

  it('enseña las topologías de M8 con los nombres de patrones.mdx y la escalera', () => {
    const patrones = readFileSync('src/content/docs/m8-agentes/patrones.mdx', 'utf8');
    const escalera = readFileSync('src/content/docs/m8-agentes/escalera-de-complejidad.mdx', 'utf8');
    const names = data.topologias.map((t) => t.nombre);
    for (const n of [
      'Encadenamiento',
      'Enrutado',
      'Orquestador y trabajadores',
      'Evaluador y optimizador',
      'Asesor',
      'Fan-out por lotes',
      'Flujos dinámicos con verificación cruzada',
      'Paralelización por secciones',
      'Paralelización por votación',
    ]) {
      expect(names).toContain(n);
    }
    expect(names).toContain('Llamada única');
    expect(names).toContain('Agente');
    expect(patrones).toContain('Orquestador y trabajadores');
    expect(escalera).toContain('Llamada única');
  });

  it('las señales de «no orquestar» son las del texto de cuando-no-orquestar.mdx', () => {
    const page = readFileSync('src/content/docs/m8-agentes/cuando-no-orquestar.mdx', 'utf8');
    expect(data.senales.length).toBe(6);
    for (const s of data.senales) {
      expect(page, s.senal).toContain(s.senal);
      expect(page, s.significa).toContain(s.significa);
      expect(page, s.quehacer).toContain(s.quehacer);
    }
  });
});

describe('resolución de gamas a modelos reales', () => {
  const nameOf = (provider: 'anthropic' | 'openai' | 'google', gama: string) =>
    resolveGama(realModels, provider, gama, data.gamas)?.model.id;

  it('en Anthropic coincide con los modelos que cita M8', () => {
    // M8 «modelo y esfuerzo por rol»: orquestador y verificador Opus 5.5, trabajador Sonnet 5.5,
    // lectura masiva Haiku 5.5 y, solo si falla, Fable 5.1.
    expect(nameOf('anthropic', 'alta')).toBe('opus-5-5');
    expect(nameOf('anthropic', 'equilibrada')).toBe('sonnet-5-5');
    expect(nameOf('anthropic', 'rapida')).toBe('haiku-5-5');
    expect(nameOf('anthropic', 'frontera')).toBe('fable-5-1');
  });

  it('nunca resuelve a un modelo de acceso limitado ni sin precio', () => {
    const records = load<ModelRecord>('models');
    for (const provider of ['anthropic', 'openai', 'google'] as const) {
      for (const g of data.gamas) {
        const res = resolveGama(realModels, provider, g.id, data.gamas);
        expect(res, `${provider}/${g.id}`).not.toBeNull();
        const rec = records.find((m) => m.id === res?.model.id);
        expect(rec?.status).not.toBe('acceso-limitado');
        expect(rec?.pricing.input).not.toBeNull();
      }
    }
  });

  it('todo rol de toda topología resuelve a un modelo existente de cada proveedor', () => {
    const ids = new Set(load<ModelRecord>('models').map((m) => m.id));
    for (const provider of ['anthropic', 'openai', 'google'] as const) {
      for (const t of data.topologias) {
        for (const r of t.roles) {
          if (r.gama === 'codigo' || r.gama === 'persona') continue;
          const res = resolveGama(realModels, provider, r.gama, data.gamas);
          expect(ids.has(res?.model.id ?? ''), `${provider}/${t.id}/${r.id}`).toBe(true);
        }
      }
    }
  });

  it('avisa cuando el proveedor no tiene la gama pedida', () => {
    // OpenAI y Google no tienen «Alto rendimiento»; Google no tiene «Equilibrado».
    expect(resolveGama(realModels, 'openai', 'alta', data.gamas)?.note).toContain('Alto rendimiento');
    expect(resolveGama(realModels, 'google', 'equilibrada', data.gamas)?.note).toContain('Equilibrado');
    expect(resolveGama(realModels, 'anthropic', 'alta', data.gamas)?.note).toBeUndefined();
  });

  it('el esfuerzo por defecto sale de models.json según la superficie', () => {
    const sonnet = realModels.find((m) => m.id === 'sonnet-5-5');
    if (!sonnet) throw new Error('falta sonnet-5-5');
    // M8: Sonnet 5.5 arranca en `high` en la API y en `medium` en Claude Code.
    expect(defaultEffort(sonnet, 'api')).toBe('high');
    expect(defaultEffort(sonnet, 'claude-code')).toBe('medium');
  });

  it('efectivePrice: (entrada + r × salida) / 10^6', () => {
    // Opus de prueba: (5 + 0,2 × 25) / 10^6 = 10 / 10^6 = 1e-5.
    expect(effectivePrice(synth[0] as AgentModel, 0.2)).toBeCloseTo(1e-5, 12);
    // Con salida 0 solo cuenta la entrada: 5 / 10^6.
    expect(effectivePrice(synth[0] as AgentModel, 0)).toBeCloseTo(5e-6, 12);
  });
});

describe('una prueba por topología: qué entradas la seleccionan', () => {
  it('llamada única: una pieza, camino conocido, sin verificación (y avisa de que no compensa orquestar)', () => {
    const r = design({});
    expect(r.topology.id).toBe('llamada-unica');
    expect(r.noCompensa?.titulo).toBe('Probablemente no compensa orquestar');
    // Línea base: 1× por definición.
    expect(r.cost.multiplierVsAlta).toBe(1);
    expect(r.reasons).toEqual([]);
  });

  it('encadenamiento: cada paso necesita el resultado del anterior y los conoces', () => {
    const r = design({ dependentSteps: true });
    expect(r.topology.id).toBe('encadenamiento');
    expect(r.noCompensa).not.toBeNull();
    expect(r.cost.multiplierVsAlta).toBeNull();
  });

  it('agente: el camino depende de lo que aparece', () => {
    const r = design({ pathKnown: false });
    expect(r.topology.id).toBe('agente');
    expect(r.noCompensa).not.toBeNull();
  });

  it('asesor: mucho trabajo mecánico y pocas decisiones críticas; coste citado 2,1×', () => {
    const r = design({ difficulty: 'pocas-criticas' });
    expect(r.topology.id).toBe('asesor');
    expect(r.noCompensa).toBeNull();
    // Cifra de Anthropic citada tal cual (medición publicada por un proveedor).
    expect(r.cost.multiplierVsAlta).toBe(2.1);
    expect(r.cost.claim).toBe('medicion');
    expect(r.cost.cited?.source).toBe('anthropic-optimizar-coste-e-inteligencia-mediciones-publicadas');
  });

  it('evaluador y optimizador: revisión con criterio escrito sobre una sola pieza', () => {
    const r = design({ verification: 'revision', unitTokens: 10_000 });
    expect(r.topology.id).toBe('evaluador');
    // M = 1 × 10.000 = 10.000 tokens; r = 0,2; V = 2 vueltas.
    // Producción (equilibrada): 10.000 × 4e-6 = 0,04 $.
    // Revisión (alta): 2 × (1 + 0,2) × 10.000 × 1e-5 = 24.000 × 1e-5 = 0,24 $.
    // Total 0,28 $. Línea base alta: 10.000 × 1e-5 = 0,1 $ → 2,8×. Equilibrada sola: 0,04 $ → 7×.
    expect(r.cost.totalUsd).toBeCloseTo(0.28, 10);
    expect(r.cost.multiplierVsAlta).toBeCloseTo(2.8, 10);
    expect(r.cost.multiplierVsWorker).toBeCloseTo(7, 10);
    expect(r.cost.claim).toBe('estimacion');
  });

  it('paralelización por votación: segunda opinión; N × una lectura más comparación', () => {
    const r = design({ verification: 'segunda-opinion', unitTokens: 10_000, errorCost: 'alto' });
    expect(r.topology.id).toBe('paralelizacion-votacion');
    // M = 10.000; K = 3 lecturas (alta): 3 × 10.000 × 1e-5 = 0,3 $.
    // Comparación (alta): 3 × 0,2 × 10.000 × 1e-5 = 6.000 × 1e-5 = 0,06 $. Total 0,36 $.
    // Línea base alta: 10.000 × 1e-5 = 0,1 $ → 3,6×. Equilibrada sola: 0,04 $ → 9×.
    expect(r.cost.totalUsd).toBeCloseTo(0.36, 10);
    expect(r.cost.multiplierVsAlta).toBeCloseTo(3.6, 10);
    expect(r.cost.multiplierVsWorker).toBeCloseTo(9, 10);
  });

  it('el multiplicador de la votación sigue a las lecturas que edita el lector', () => {
    const r = design({
      verification: 'segunda-opinion',
      unitTokens: 10_000,
      errorCost: 'alto',
      assumptions: { readings: 5 },
    });
    // K = 5: 5 × 10.000 × 1e-5 = 0,5 $; comparación 5 × 0,2 × 10.000 × 1e-5 = 0,1 $; total 0,6 $ → 6×.
    expect(r.cost.multiplierVsAlta).toBeCloseTo(6, 10);
  });

  it('fan-out por lotes: el ejemplo (300 ficheros, hoy, Claude Code)', () => {
    const r = designTeam(EXAMPLE_INPUT, data, synth);
    if (!r.ok) throw new Error('el ejemplo debe ser válido');
    expect(r.topology.id).toBe('fanout');
    expect(r.noCompensa).toBeNull();
    // M = 300 × 4.000 = 1.200.000 tokens; r = 0,2; contexto común s = 2.000; /batch → g = 30 agentes.
    // Trabajadores (equilibrada): (1.200.000 + 30 × 2.000) × 4e-6 = 1.260.000 × 4e-6 = 5,04 $.
    // Plan (alta): 5.000 × 1e-5 = 0,05 $.
    // Verificación (alta, 10 % de los resultados): 0,1 × 1,2 × 1.200.000 = 144.000 × 1e-5 = 1,44 $.
    // Total 6,53 $. Línea base alta: 1.200.000 × 1e-5 = 12 $ → 6,53 / 12 = 0,5441666…×.
    // Equilibrada sola: 1.200.000 × 4e-6 = 4,8 $ → 6,53 / 4,8 = 1,3604166…×.
    expect(r.cost.workers).toBe(30);
    expect(r.cost.totalUsd).toBeCloseTo(6.53, 10);
    expect(r.cost.baselineAltaUsd).toBeCloseTo(12, 10);
    expect(r.cost.multiplierVsAlta).toBeCloseTo(6.53 / 12, 10);
    expect(r.cost.multiplierVsWorker).toBeCloseTo(6.53 / 4.8, 10);
    expect(r.cost.batchApplied).toBe(false);
    // Razones: hay volumen, quieres revisión y no puedes esperar.
    expect(r.reasons.map((x) => x.id).sort()).toEqual(['revision', 'tamano', 'tiempo', 'volumen'].sort());
  });

  it('fan-out con Batch (puede esperar): una petición por unidad y descuento solo en los trabajadores', () => {
    const r = design({ ...EXAMPLE_INPUT, canWait: true, surface: 'api' });
    expect(r.topology.id).toBe('fanout');
    // g = 300 peticiones: (1.200.000 + 300 × 2.000) × 4e-6 = 1.800.000 × 4e-6 = 7,2 $; × 0,5 (Batch) = 3,6 $.
    // Plan 0,05 $ + verificación 1,44 $ (sin descuento) → total 5,09 $. Alta sola 12 $ → 0,424166…×.
    expect(r.cost.workers).toBe(300);
    expect(r.cost.batchApplied).toBe(true);
    expect(r.cost.totalUsd).toBeCloseTo(5.09, 10);
    expect(r.cost.multiplierVsAlta).toBeCloseTo(5.09 / 12, 10);
    expect(r.implementations[0]).toContain('Message Batches');
  });

  it('los agentes de /batch se acotan a la cifra que edita el lector y al número de unidades', () => {
    // Con 10 agentes: (1.200.000 + 10 × 2.000) × 4e-6 = 4,88 $ + 0,05 + 1,44 = 6,37 $.
    const r = design({ ...EXAMPLE_INPUT, assumptions: { agents: 10 } });
    expect(r.cost.workers).toBe(10);
    expect(r.cost.totalUsd).toBeCloseTo(6.37, 10);
    // 6 unidades iguales (volumen) y 30 agentes pedidos: no puede haber más agentes que unidades.
    const small = design({ ...EXAMPLE_INPUT, units: 6 });
    expect(small.cost.workers).toBe(6);
  });

  it('enrutado: casos iguales, dificultad mixta y volumen', () => {
    const r = design({ units: 1000, unitTokens: 500, independentPieces: true, difficulty: 'mixta' });
    expect(r.topology.id).toBe('enrutado');
    // M = 500.000; e = 0,5.
    // Clasificador (rápida, solo lectura): 500.000 × 0,5 / 10^6 = 0,25 $.
    // Sencillos (rápida): 0,5 × 500.000 × 1e-6 = 0,25 $. Complejos (equilibrada): 0,5 × 500.000 × 4e-6 = 1 $.
    // Total 1,5 $. Alta sola: 500.000 × 1e-5 = 5 $ → 0,3×. Equilibrada sola: 2 $ → 0,75×.
    expect(r.cost.totalUsd).toBeCloseTo(1.5, 10);
    expect(r.cost.multiplierVsAlta).toBeCloseTo(0.3, 10);
    expect(r.cost.multiplierVsWorker).toBeCloseTo(0.75, 10);
    expect(r.notices.some((n) => n.text.includes('caché'))).toBe(true);
  });

  it('orquestador y trabajadores: piezas distintas cuyo reparto decide el orquestador y no caben', () => {
    const r = design({ units: 4, unitTokens: 400_000, independentPieces: true, pieceKind: 'abiertas' });
    expect(r.topology.id).toBe('orquestador');
    // M = 1.600.000 > 500.000 (50 % de la ventana): no cabe → razón «tamaño».
    // Trabajadores (equilibrada): (1.600.000 + 4 × 2.000) × 4e-6 = 1.608.000 × 4e-6 = 6,432 $.
    // Plan (alta): 5.000 × 1e-5 = 0,05 $. Fusión (alta): 0,2 × 1.600.000 × 1e-5 = 3,2 $.
    // Verificación (alta, 10 %): 0,1 × 1,2 × 1.600.000 = 192.000 × 1e-5 = 1,92 $.
    // Total 11,602 $. Alta sola: 1.600.000 × 1e-5 = 16 $ → 0,725125×.
    expect(r.reasons.map((x) => x.id)).toContain('tamano');
    expect(r.cost.totalUsd).toBeCloseTo(11.602, 10);
    expect(r.cost.multiplierVsAlta).toBeCloseTo(11.602 / 16, 10);
    expect(r.cost.multiplierVsWorker).toBeCloseTo(11.602 / 6.4, 10);
  });

  it('paralelización por secciones: piezas distintas ya definidas, sin plan ni verificación', () => {
    const r = design({ units: 4, unitTokens: 400_000, independentPieces: true, pieceKind: 'definidas' });
    expect(r.topology.id).toBe('paralelizacion-secciones');
    // Trabajadores 6,432 $ + fusión 3,2 $ (no hay plan ni verificación) = 9,632 $. Alta sola: 16 $ → 0,602×.
    expect(r.cost.totalUsd).toBeCloseTo(9.632, 10);
    expect(r.cost.multiplierVsAlta).toBeCloseTo(0.602, 10);
  });

  it('flujo dinámico con verificación cruzada: piezas distintas, independientes y verificación', () => {
    const r = design({
      units: 4,
      unitTokens: 400_000,
      independentPieces: true,
      pieceKind: 'abiertas',
      verification: 'revision',
      errorCost: 'alto',
    });
    expect(r.topology.id).toBe('flujo-dinamico');
    // La verificación cruzada revisa todas las piezas (v = 1): 1 × 1,2 × 1.600.000 = 1.920.000 × 1e-5 = 19,2 $.
    // Total = 6,432 + 0,05 + 3,2 + 19,2 = 28,882 $ → 28,882 / 16 = 1,805125×.
    expect(r.cost.totalUsd).toBeCloseTo(28.882, 10);
    expect(r.cost.multiplierVsAlta).toBeCloseTo(1.805125, 10);
    // Agentes: 4 investigadores + 1 orquestador + 4 verificadores = 9 (≤ 25, sin aviso de agentes).
    expect(r.cost.agentsEstimate).toBe(9);
    // Tokens proyectados: (1.608.000 + 5.000 + 320.000 + 1.920.000) × 1,2 = 3.853.000 × 1,2 = 4.623.600 > 1.500.000.
    expect(r.cost.tokensEstimate).toBeCloseTo(4_623_600, 3);
    expect(r.notices.some((n) => n.text.includes('Large workflow') && n.text.includes('1,5 millones'))).toBe(
      true,
    );
    expect(r.notices.some((n) => n.text.includes('25 agentes'))).toBe(false);
  });

  it('agent teams: los agentes deben hablarse, hay piezas independientes y es Claude Code', () => {
    const r = design({ units: 4, independentPieces: true, pieceKind: 'abiertas', agentsTalk: true });
    expect(r.topology.id).toBe('agent-teams');
    // Cifra citada de la documentación de costes: unas 7 veces los tokens de una sesión normal.
    expect(r.cost.multiplierVsAlta).toBe(7);
    expect(r.cost.claim).toBe('medicion');
    expect(r.cost.cited?.source).toBe('claude-code-costes');
  });

  it('con otro proveedor los agent teams no se ofrecen y se avisa', () => {
    const r = design(
      {
        units: 4,
        unitTokens: 400_000,
        independentPieces: true,
        pieceKind: 'abiertas',
        agentsTalk: true,
        provider: 'openai',
      },
      [...synth, ...synth.map((m) => ({ ...m, id: `o-${m.id}`, provider: 'openai' as const }))],
    );
    expect(r.topology.id).not.toBe('agent-teams');
    expect(r.notices.some((n) => n.text.includes('agent teams'))).toBe(true);
  });
});

describe('aviso «probablemente no compensa orquestar»', () => {
  it('una cadena: señal literal «Cada paso necesita el resultado del anterior»', () => {
    const r = design({ dependentSteps: true, units: 3 });
    expect(r.noCompensa?.senales.map((s) => s.id)).toContain('s-cadena');
    const chain = r.noCompensa?.senales.find((s) => s.id === 's-cadena');
    expect(chain?.quehacer).toBe('Un solo agente, o un flujo secuencial en código');
  });

  it('todo cabe y no hay cola larga: señal s-cabe', () => {
    const r = design({ units: 3, unitTokens: 1000, independentPieces: true, pieceKind: 'abiertas' });
    // Tres piezas distintas de 1.000 tokens: 3.000 ≤ 500.000, sin cola larga, puede esperar → una llamada.
    expect(r.topology.id).toBe('llamada-unica');
    expect(r.noCompensa?.senales.map((s) => s.id)).toContain('s-cabe');
  });

  it('piezas que comparten decisiones: señal s-comparten', () => {
    const r = design({ units: 5, independentPieces: false, dependentSteps: false });
    expect(r.topology.id).toBe('llamada-unica');
    expect(r.noCompensa?.senales.map((s) => s.id)).toContain('s-comparten');
  });

  it('una cola larga de coste cambia la respuesta aunque quepa', () => {
    const r = design({
      units: 3,
      unitTokens: 1000,
      independentPieces: true,
      pieceKind: 'abiertas',
      longTail: true,
    });
    expect(r.topology.id).toBe('orquestador');
    expect(r.reasons.map((x) => x.id)).toContain('cola');
  });

  it('no poder esperar justifica repartir piezas independientes (razón «tiempo»)', () => {
    const r = design({
      units: 3,
      unitTokens: 1000,
      independentPieces: true,
      pieceKind: 'abiertas',
      canWait: false,
    });
    expect(r.topology.id).toBe('orquestador');
    expect(r.reasons.map((x) => x.id)).toEqual(['tiempo']);
    // Cabe y no hay cola: el diseño multiagente lleva la cautela de la señal s-cabe.
    expect(r.notices.some((n) => n.text.startsWith('Todo el material cabe en la ventana'))).toBe(true);
  });

  it('un diseño multiagente no lleva el aviso pero sí los recordatorios previos al reparto', () => {
    const r = designTeam(EXAMPLE_INPUT, data, synth);
    if (!r.ok) throw new Error('inválido');
    expect(r.noCompensa).toBeNull();
    expect(r.reminders.map((s) => s.id).sort()).toEqual(['s-terminado', 's-una-vez']);
  });
});

describe('umbrales exactos', () => {
  it('«cabe» hasta el 50 % de la ventana, inclusive', () => {
    // 1 × 500.000 = 500.000 = 50 % de 1.000.000 → cabe; 500.001 → no cabe.
    expect(design({ unitTokens: 500_000 }).signals.fits).toBe(true);
    expect(design({ unitTokens: 500_001 }).signals.fits).toBe(false);
  });

  it('el volumen empieza en 5 unidades iguales', () => {
    const five = design({ units: 5, independentPieces: true, pieceKind: 'iguales', canWait: true });
    const four = design({ units: 4, independentPieces: true, pieceKind: 'iguales', canWait: true });
    expect(five.topology.id).toBe('fanout');
    expect(four.topology.id).toBe('llamada-unica');
  });

  it('una unidad que no cabe sola avisa', () => {
    const r = design({ unitTokens: 600_000 });
    expect(r.notices.some((n) => n.text.includes('ya supera'))).toBe(true);
    expect(
      r.notices.some((n) => n.text.includes('no cabe en la ventana y no hay piezas independientes')),
    ).toBe(true);
  });
});

describe('entradas contradictorias, incoherentes o vacías', () => {
  it('piezas independientes con una sola unidad: se trata como una pieza y se avisa', () => {
    const r = design({ units: 1, independentPieces: true });
    expect(r.signals.independent).toBe(false);
    expect(r.notices.some((n) => n.text.includes('solo hay una unidad'))).toBe(true);
    expect(r.topology.id).toBe('llamada-unica');
  });

  it('pasos dependientes y piezas independientes a la vez no es una cadena pura', () => {
    // Informe: cuatro líneas independientes y una síntesis que depende de las cuatro.
    const r = design({
      units: 4,
      dependentSteps: true,
      independentPieces: true,
      pieceKind: 'abiertas',
      canWait: false,
    });
    expect(r.signals.chain).toBe(false);
    expect(r.topology.id).toBe('orquestador');
  });

  it('pasos dependientes con una sola unidad sí es una cadena aunque marques piezas independientes', () => {
    const r = design({ units: 1, dependentSteps: true, independentPieces: true });
    expect(r.signals.chain).toBe(true);
    expect(r.topology.id).toBe('encadenamiento');
  });

  it('error caro sin verificación: aconseja añadirla', () => {
    const r = design({ errorCost: 'alto', verification: 'ninguna' });
    expect(r.notices.some((n) => n.text.includes('no has pedido verificación'))).toBe(true);
  });

  it('segunda opinión con error barato: aconseja dudar', () => {
    const r = design({ verification: 'segunda-opinion', errorCost: 'bajo' });
    expect(r.notices.some((n) => n.text.includes('segunda opinión con un error de bajo coste'))).toBe(true);
  });

  it('dificultad mixta sin volumen: avisa de que no se aplica el enrutado', () => {
    const r = design({ difficulty: 'mixta', units: 2, independentPieces: true });
    expect(r.topology.id).not.toBe('enrutado');
    expect(r.notices.some((n) => n.text.includes('El enrutado necesita'))).toBe(true);
  });

  it.each([
    ['unidades vacías (NaN)', { units: Number.NaN }, 'units'],
    ['cero unidades', { units: 0 }, 'units'],
    ['unidades negativas', { units: -3 }, 'units'],
    ['unidades decimales', { units: 2.5 }, 'units'],
    ['demasiadas unidades', { units: 1_000_001 }, 'units'],
    ['tokens vacíos (NaN)', { unitTokens: Number.NaN }, 'unitTokens'],
    ['tokens a cero', { unitTokens: 0 }, 'unitTokens'],
    ['tokens infinitos', { unitTokens: Number.POSITIVE_INFINITY }, 'unitTokens'],
    ['supuesto fuera de rango', { assumptions: { verifyShare: 1.5 } }, 'assumptions.verifyShare'],
    ['supuesto vacío (NaN)', { assumptions: { outputRatio: Number.NaN } }, 'assumptions.outputRatio'],
    ['agentes no enteros', { assumptions: { agents: 12.5 } }, 'assumptions.agents'],
    ['agentes fuera de /batch', { assumptions: { agents: 31 } }, 'assumptions.agents'],
  ] as const)('devuelve un error explicado, sin lanzar: %s', (_name, over, field) => {
    const r = designTeam({ ...base, ...over } as TeamInput, data, synth);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const e = r.errors.find((x) => x.field === field);
      expect(e).toBeDefined();
      expect(e?.message.length).toBeGreaterThan(10);
    }
  });

  it('un proveedor sin modelos no lanza', () => {
    const r = designTeam({ ...base, provider: 'google' }, data, synth);
    expect(r.ok).toBe(false);
  });

  it('validateInput acepta el ejemplo', () => {
    expect(validateInput(EXAMPLE_INPUT, data.parametros)).toEqual([]);
  });
});

describe('con los datos reales', () => {
  it('el ejemplo resuelve a los modelos y esfuerzos que cita M8 (casos completos, migración)', () => {
    const r = designTeam(EXAMPLE_INPUT, data, realModels);
    if (!r.ok) throw new Error('inválido');
    expect(r.topology.id).toBe('fanout');
    const byId = Object.fromEntries(r.roles.map((x) => [x.id, x]));
    // Orquestador y revisor: Opus 5.5; trabajador: Sonnet 5.5 con `medium` (su defecto en Claude Code).
    expect(byId['orquestador']?.model?.id).toBe('opus-5-5');
    expect(byId['verificador']?.model?.id).toBe('opus-5-5');
    expect(byId['trabajador']?.model?.id).toBe('sonnet-5-5');
    expect(byId['trabajador']?.effortText).toContain('medium');
    expect(byId['trabajador']?.candidata).toBe('Claude Haiku 5.5');
    expect(byId['script']?.model).toBeNull();
    expect(r.sourceIds).toContain('anthropic-precios');
  });

  it('la multiplicación del ejemplo con precios reales se rehace a mano', () => {
    const r = designTeam(EXAMPLE_INPUT, data, realModels);
    if (!r.ok) throw new Error('inválido');
    // Precios de models.json: Opus 5.5 4/20 $ y Sonnet 5.5 2/10 $ por millón; r = 0,2.
    // Opus: (4 + 0,2 × 20) / 10^6 = 8e-6; Sonnet: (2 + 0,2 × 10) / 10^6 = 4e-6.
    // Trabajadores: 1.260.000 × 4e-6 = 5,04; plan: 5.000 × 8e-6 = 0,04; verificación: 144.000 × 8e-6 = 1,152.
    // Total 6,232 $; alta sola: 1.200.000 × 8e-6 = 9,6 $ → 0,649166…×.
    const opus = realModels.find((m) => m.id === 'opus-5-5');
    const sonnet = realModels.find((m) => m.id === 'sonnet-5-5');
    if (!opus || !sonnet) throw new Error('faltan modelos');
    if (opus.priceIn === 4 && opus.priceOut === 20 && sonnet.priceIn === 2 && sonnet.priceOut === 10) {
      expect(r.cost.totalUsd).toBeCloseTo(6.232, 10);
      expect(r.cost.multiplierVsAlta).toBeCloseTo(6.232 / 9.6, 10);
    }
    // Sea cual sea el precio, el cociente sale de la misma fórmula.
    const pO = effectivePrice(opus, 0.2);
    const pS = effectivePrice(sonnet, 0.2);
    const total = (1_200_000 + 30 * 2000) * pS + 5000 * pO + 0.1 * 1.2 * 1_200_000 * pO;
    expect(r.cost.totalUsd).toBeCloseTo(total, 10);
  });

  it('cada topología es alcanzable con alguna entrada', () => {
    const reached = new Set<string>();
    const cases: Partial<TeamInput>[] = [
      {},
      { dependentSteps: true },
      { pathKnown: false },
      { difficulty: 'pocas-criticas' },
      { verification: 'revision' },
      { verification: 'segunda-opinion' },
      { units: 1000, unitTokens: 500, independentPieces: true, difficulty: 'mixta' },
      { units: 300, unitTokens: 4000, independentPieces: true },
      { units: 4, unitTokens: 400_000, independentPieces: true, pieceKind: 'abiertas' },
      { units: 4, unitTokens: 400_000, independentPieces: true, pieceKind: 'definidas' },
      {
        units: 4,
        unitTokens: 400_000,
        independentPieces: true,
        pieceKind: 'abiertas',
        verification: 'revision',
      },
      { units: 4, independentPieces: true, pieceKind: 'abiertas', agentsTalk: true },
    ];
    for (const c of cases) reached.add(design(c, realModels).topology.id);
    expect([...reached].sort()).toEqual(data.topologias.map((t) => t.id).sort());
  });

  it('para cada proveedor todo diseño de ejemplo se resuelve sin lanzar', () => {
    for (const provider of ['anthropic', 'openai', 'google'] as const) {
      const r = designTeam({ ...EXAMPLE_INPUT, provider }, data, realModels);
      expect(r.ok, provider).toBe(true);
      if (r.ok) {
        for (const role of r.roles) {
          if (role.model)
            expect(realModels.some((m) => m.id === role.model?.id && m.provider === provider)).toBe(true);
        }
      }
    }
  });

  it('en OpenAI avisa de que la gama alta es la equilibrada', () => {
    const r = designTeam({ ...EXAMPLE_INPUT, provider: 'openai' }, data, realModels);
    if (!r.ok) throw new Error('inválido');
    expect(r.roles.some((x) => x.tierNote?.includes('Alto rendimiento'))).toBe(true);
  });
});

describe('texto copiable', () => {
  it('incluye la topología, los roles, la fórmula, los supuestos y las comprobaciones previas', () => {
    const r = designTeam(EXAMPLE_INPUT, data, realModels);
    if (!r.ok) throw new Error('inválido');
    const text = designToText(r, data);
    expect(text).toContain('# Diseño de equipo de agentes: Fan-out por lotes');
    expect(text).toContain('Claude Opus 5.5');
    expect(text).toContain('Estimación de la guía');
    expect(text).toContain('Supuesto: Salida por cada token de entrada = 0,2');
    expect(text).toContain('Depura el encargo con uno o dos elementos');
  });

  it('con «no compensa» lo dice en el texto', () => {
    const r = designTeam({ ...base }, data, realModels);
    if (!r.ok) throw new Error('inválido');
    expect(designToText(r, data)).toContain('Probablemente no compensa orquestar');
  });
});
