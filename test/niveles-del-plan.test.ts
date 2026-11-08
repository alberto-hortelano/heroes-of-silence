/**
 * El agente declara el nivel de cada región de su mapa (#209).
 *
 * Tres caras de un mismo hecho: el esquema del plan acepta `regions[].nivel`
 * de 0 a 2, la prosa de `map_generate` explica qué barrera va entre qué
 * niveles, y `validateMapPlan` lo exige con la misma regla con la que el
 * generador sortea las barreras (`admiteLosNiveles`), por franja de barrera,
 * que es lo que pinta la escena (`franjasDeBarrera`). Cada rechazo se ve
 * morder sobre `planDeMesetas`, que sin la rotura pasa limpio; y la escena de
 * ese plan pinta la cara del acantilado, que sin niveles no tenía.
 */
import { describe, expect, it } from 'vitest';
import { componer } from '../src/client/render/escenario/colocar.js';
import { mapPlanSchema } from '../src/core/contract/esquemas.js';
import { RESPONSE_FORMAT } from '../src/core/contract/formato.js';
import { serializeMapRequest } from '../src/core/contract/peticion-de-mapa.js';
import { buildMap, planDelAgente } from '../src/core/map/generar/construir.js';
import type { MapPlan, PlanConCasillas } from '../src/core/map/generar/plan.js';
import { generateMapPlan } from '../src/core/map/generar/procedimental.js';
import { validateMapPlan } from '../src/core/map/generar/validar.js';
import { problemasDeNiveles } from '../src/core/map/niveles.js';
import { BARRERAS_DE_DESNIVEL, type Nivel, QUE_ES_UN_NIVEL } from '../src/core/map/terrain.js';
import { createRng } from '../src/core/rng.js';
import { catalogoDelDisco } from './escena-de-prueba.js';
import { caminoPorLasDiagonales } from './mapa-de-prueba.js';

/** El plan de las mesetas con los niveles cambiados (los que no se nombran, como estaban). */
function conNiveles(niveles: Readonly<Record<string, Nivel | undefined>>): MapPlan {
  const plan = planDeMesetas();
  return {
    ...plan,
    regions: plan.regions.map((r) => ({ ...r, nivel: r.id in niveles ? niveles[r.id] : r.nivel })),
  };
}

const sinNiveles = (): MapPlan =>
  conNiveles({ alta: undefined, oeste: undefined, este: undefined });

describe('el esquema del plan lleva el nivel de cada región (#209)', () => {
  it('acepta 0, 1, 2 y la región sin nivel; rechaza lo demás diciendo qué es un nivel', () => {
    for (const nivel of [0, 1, 2, undefined]) {
      const plan = conNiveles({ alta: nivel as Nivel | undefined });
      expect(mapPlanSchema.safeParse(plan).success, `nivel ${nivel}`).toBe(true);
    }
    for (const nivel of [3, -1, 1.5, '1', null]) {
      const plan = { ...planDeMesetas(), regions: [{ ...planDeMesetas().regions[0], nivel }] };
      const r = mapPlanSchema.safeParse(plan);
      expect(r.success, `nivel ${String(nivel)}`).toBe(false);
      // El mensaje propio solo sale si es un número: lo demás lo para el tipo.
      if (typeof nivel === 'number') expect(JSON.stringify(r.error)).toContain(QUE_ES_UN_NIVEL);
    }
  });

  it('la prosa explica el nivel y qué barrera va entre qué niveles, y el consejo da el reparto del procedimental', () => {
    const prosa = RESPONSE_FORMAT.map_generate;
    expect(prosa).toContain('"nivel"');
    expect(prosa).toMatch(/acantilado \("cliff"\) es el borde de una meseta/);
    expect(prosa).toContain('"forest" y "wall" van SOLO entre regiones al mismo nivel');
    for (const b of BARRERAS_DE_DESNIVEL) expect(prosa).toContain(`"${b}"`);
    expect(prosa).toContain('Una región sin "nivel" va al 1');
    expect(prosa).toContain('Si NO\n  declaras ningún nivel');
    const consejo = serializeMapRequest({ width: 34, height: 34, players: [0, 1] }).advice;
    expect(consejo.some((a) => a.startsWith('Alturas:') && a.includes('swamp al 0'))).toBe(true);
  });
});

describe('validateMapPlan exige que cada barrera admita los niveles que separa (#209)', () => {
  it('el plan de las mesetas es válido y buildMap guarda sus niveles', () => {
    expect(validateMapPlan(planDeMesetas())).toEqual([]);
    expect(buildMap(planDeMesetas()).map.regions.map((r) => r.nivel)).toEqual([2, 1, 1]);
  });

  it('un acantilado entre regiones al mismo nivel se rechaza, nombrándolo con sus regiones', () => {
    // La ciudad y el nodo abren la fila 7: son tres tramos, y los tres separan llanos.
    expect(validateMapPlan(conNiveles({ alta: 1 }))).toEqual([
      'el acantilado ("cliff") que pasa por (0,7) separa regiones al mismo nivel, "alta" (nivel 1), "oeste" (nivel 1): un acantilado es el borde de una meseta y va entre dos niveles distintos; dales nivel distinto con "nivel" o usa otra barrera',
      'el acantilado ("cliff") que pasa por (4,7) separa regiones al mismo nivel, "alta" (nivel 1), "oeste" (nivel 1), "este" (nivel 1): un acantilado es el borde de una meseta y va entre dos niveles distintos; dales nivel distinto con "nivel" o usa otra barrera',
      'el acantilado ("cliff") que pasa por (16,7) separa regiones al mismo nivel, "alta" (nivel 1), "este" (nivel 1): un acantilado es el borde de una meseta y va entre dos niveles distintos; dales nivel distinto con "nivel" o usa otra barrera',
    ]);
    // Solo el tramo que queda entre dos iguales: con `este` subido a la meseta,
    // el de la derecha; el del medio aún toca el llano de `oeste`.
    expect(
      validateMapPlan(conNiveles({ este: 2 })).filter((p) => p.includes('acantilado')),
    ).toEqual([
      'el acantilado ("cliff") que pasa por (16,7) separa regiones al mismo nivel, "alta" (nivel 2), "este" (nivel 2): un acantilado es el borde de una meseta y va entre dos niveles distintos; dales nivel distinto con "nivel" o usa otra barrera',
    ]);
  });

  it('un acantilado dentro de una sola región se rechaza: no es el borde de nada', () => {
    const plan = planDeMesetas();
    const conLosa = {
      ...plan,
      walls: [
        ...plan.walls,
        { terrain: 'cliff' as const, from: { x: 2, y: 13 }, to: { x: 4, y: 13 } },
      ],
    };
    expect(validateMapPlan(conLosa)).toEqual([
      'el acantilado ("cliff") que pasa por (2,13) solo toca la región "oeste" (nivel 1): un acantilado es el borde de una meseta y separa dos regiones a distinto nivel; dentro de una región, usa otra barrera',
    ]);
    // La misma losa de montaña es un obstáculo como cualquier otro.
    const conPeñas = {
      ...plan,
      walls: [
        ...plan.walls,
        { terrain: 'mountain' as const, from: { x: 2, y: 13 }, to: { x: 4, y: 13 } },
      ],
    };
    expect(validateMapPlan(conPeñas)).toEqual([]);
  });

  it('un bosque o un muro entre dos niveles se rechaza, y una montaña o el agua no', () => {
    // `oeste` hundida: el acantilado sigue separando niveles y el bosque ya no.
    const plan = conNiveles({ oeste: 0 });
    const conColumna = (terrain: 'forest' | 'wall' | 'mountain' | 'water'): MapPlan => ({
      ...plan,
      walls: plan.walls.map((m) => (m.terrain === 'forest' ? { ...m, terrain } : m)),
    });
    expect(validateMapPlan(conColumna('forest'))).toEqual([
      'el bosque ("forest") que pasa por (10,8) toca regiones a distinto nivel, "oeste" (nivel 0), "este" (nivel 1): un bosque solo va entre regiones al mismo nivel; entre dos niveles van "cliff", "mountain", "water"',
      'el bosque ("forest") que pasa por (10,12) toca regiones a distinto nivel, "oeste" (nivel 0), "este" (nivel 1): un bosque solo va entre regiones al mismo nivel; entre dos niveles van "cliff", "mountain", "water"',
    ]);
    expect(validateMapPlan(conColumna('wall'))).toEqual([
      'el muro ("wall") que pasa por (10,8) toca regiones a distinto nivel, "oeste" (nivel 0), "este" (nivel 1): un muro solo va entre regiones al mismo nivel; entre dos niveles van "cliff", "mountain", "water"',
      'el muro ("wall") que pasa por (10,12) toca regiones a distinto nivel, "oeste" (nivel 0), "este" (nivel 1): un muro solo va entre regiones al mismo nivel; entre dos niveles van "cliff", "mountain", "water"',
    ]);
    expect(validateMapPlan(conColumna('mountain'))).toEqual([]);
    // Con agua, Valdeluz quedaría sobre el río, y eso se rechaza antes (una
    // ciudad va en tierra; la ciudad amurallada, fase 2): los niveles, solos.
    expect(problemasDeNiveles(buildMap(conColumna('water')).map)).toEqual([]);
  });

  it('un nivel fuera de rango se rechaza también en la puerta de los dos productores', () => {
    expect(validateMapPlan(conNiveles({ oeste: 3 as Nivel }))).toEqual([
      `la región "oeste" pide el nivel 3: ${QUE_ES_UN_NIVEL}`,
    ]);
  });

  it('una región sin nivel va al 1, y en cuanto el plan declara alguno la regla vale para todas', () => {
    // `oeste` sin nivel es el llano: con la meseta al 2, el plan sigue valiendo.
    expect(validateMapPlan(conNiveles({ oeste: undefined }))).toEqual([]);
    expect(buildMap(conNiveles({ oeste: undefined })).map.regions.map((r) => r.nivel)).toEqual([
      2, 1, 1,
    ]);
    // Y si la única declarada es del llano, el acantilado queda entre tres llanos.
    expect(validateMapPlan(conNiveles({ alta: undefined, este: undefined })).join(' ')).toMatch(
      /separa regiones al mismo nivel/,
    );
  });

  it('un plan sin ningún nivel —los de antes de #209— sigue valiendo, todo al llano', () => {
    expect(validateMapPlan(sinNiveles())).toEqual([]);
    expect(buildMap(sinNiveles()).map.regions.map((r) => r.nivel)).toEqual([1, 1, 1]);
  });
});

describe('el plan del procedimental, escrito como el del agente, conserva sus niveles (#209)', () => {
  it('zod ya no los quita: el plan de `pnpm qa` llega con sus mesetas y valida', () => {
    // Antes de #209 el esquema no tenía `nivel` y zod lo quitaba sin decir
    // nada: el plan del procedimental que manda la política de `pnpm qa` se
    // jugaba todo al llano, con sus acantilados sin cara. La 7 (la 2 hasta el
    // río de lago de 20 casillas y la 1 hasta el río de una casilla, #144 paso
    // 2: las dos se quedaron con todas sus regiones al 1).
    const plan = generateMapPlan(createRng(7));
    const leido = mapPlanSchema.parse(planDelAgente(plan));
    expect(leido.regions.map((r) => r.nivel)).toEqual(plan.regions.map((r) => r.nivel));
    expect(new Set(leido.regions.map((r) => r.nivel)).size).toBeGreaterThan(1);
    expect(validateMapPlan(leido)).toEqual([]);
  });
});

describe('la escena pinta las mesetas del agente (#209)', () => {
  it('con los niveles, el acantilado lleva cara, todo lo que se pisa va a su nivel y cada nodo entre niveles es una rampa', () => {
    const e = componer(buildMap(planDeMesetas()).map, 1, catalogoDelDisco());
    expect(e.informe.desnivelesSinBarrera).toBe(0);
    expect(e.informe.nivelFueraDeSuRegion).toBe(0);
    expect(e.informe.nodosSinRampa).toBe(0);
    // La cara cae al sur, del borde de la meseta (fila 7) al llano.
    expect(e.relieve.caras.length).toBeGreaterThan(0);
    expect(e.relieve.caras.every((c) => c.y === 7 && c.caida === 1)).toBe(true);
    // El nodo sin camino entre la meseta y el llano es una rampa.
    expect(e.relieve.bajadas.some((b) => b.deUnNodo === true)).toBe(true);
  });

  it('sin niveles, el mismo acantilado es una franja de roca sin cara (lo que #209 arregla)', () => {
    const e = componer(buildMap(sinNiveles()).map, 1, catalogoDelDisco());
    expect(e.relieve.caras).toEqual([]);
  });
});

/**
 * Un mapa con una meseta, escrito a mano (#209): la región `alta` (nivel 2)
 * ocupa el norte y la corta un acantilado en la fila 7 de las dos de abajo,
 * `oeste` y `este`, que van al llano y las separa un bosque en la columna 10.
 *
 * ```
 *   filas 0-6    alta (2)          town-1 (5,7)  node (15,7): rampas del acantilado
 *   fila 7       cliff ───────────────────────
 *   filas 8-15   oeste (1) | forest x=10 | este (1)   town-0 (10,11)
 * ```
 *
 * Es el plan de las mesetas del agente: con los niveles, el acantilado es el
 * borde de la meseta y la escena le pinta cara; sin ellos, todo al llano.
 */
function planDeMesetas(): PlanConCasillas {
  return {
    width: 20,
    height: 16,
    baseTerrain: 'grass',
    patches: [],
    regions: [
      { id: 'alta', name: 'La Meseta', at: { x: 3, y: 3 }, nivel: 2 },
      { id: 'oeste', name: 'Vega Baja', at: { x: 3, y: 12 }, nivel: 1 },
      { id: 'este', name: 'Prado Bajo', at: { x: 16, y: 12 }, nivel: 1 },
    ],
    walls: [
      { terrain: 'cliff', from: { x: 0, y: 7 }, to: { x: 19, y: 7 } },
      { terrain: 'forest', from: { x: 10, y: 8 }, to: { x: 10, y: 15 } },
    ],
    nodes: [{ x: 15, y: 7 }],
    towns: [
      { id: 'town-0', name: 'Valdeluz', faction: 'templarios', at: { x: 10, y: 11 }, owner: 0 },
      // A cinco casillas o más del recinto de Valdeluz también cuando el
      // bosque pasa a agua y Valdeluz es una ciudad-puente, con el recinto en
      // su orilla (`problemasDeRecintos`).
      { id: 'town-1', name: 'Cripta Gris', faction: 'no-muertos', at: { x: 3, y: 7 }, owner: 1 },
    ],
    villages: [],
    monsters: [],
    chests: [],
    // Cada ciudad, con el camino de sus regiones por sus puertas: Valdeluz por
    // las diagonales de arriba (el norte y el sur dan al bosque), y Cripta Gris
    // de norte a sur, de la meseta a la vega.
    roads: [
      ...caminoPorLasDiagonales({ x: 10, y: 11 }),
      { x: 3, y: 5 },
      { x: 3, y: 6 },
      { x: 3, y: 7 },
      { x: 3, y: 8 },
      { x: 3, y: 9 },
    ],
  };
}
