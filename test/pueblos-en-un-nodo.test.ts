/**
 * Los pueblos en un nodo (fase 3 de «ciudades y pueblos en su región»,
 * 05-11-2026, `docs/agents/2026-11-05-ciudades-en-su-region/`). Del usuario: «Los
 * pueblos pasan a ser posibles nodos. Se tratan como una ciudad», y al aprobar el
 * plan, uno de cada cuatro (`data/poblamiento.json`, `pueblosEnUnNodo`).
 *
 * - El generador: el pueblo de una pareja de regiones de fuera va, a veces, al
 *   paso con camino de su región, sobre montaña, bosque o acantilado, en espejo;
 *   es un nodo de la red (clase `pueblo`) y su región no lleva otro dentro.
 * - El plan: `buildMap` abre el muro bajo el pueblo y guarda su `barrera`; lo que
 *   no vale (sobre agua o muralla, sobre el muro tocando una sola región, entre
 *   dos regiones sin muro) se rechaza diciéndolo.
 * - La partida, con las reglas de la fase 1 y sin reglas nuevas: se toma
 *   pisándolo, da su oro unido a la base y su batalla va tras la madera.
 * - Se entra por su eje: sin puerta (`puertaDe`).
 */
import { describe, expect, it } from 'vitest';
import { marcadoDe } from '../src/client/html.js';
import { renderLog } from '../src/client/views/panels.js';
import { POBLAMIENTO, validarPoblamiento } from '../src/core/data.js';
import {
  buildMap,
  generateMapPlan,
  type PlanConCasillas,
  validateMapPlan,
} from '../src/core/map/generate.js';
import { BARRERAS_DEL_PUEBLO, type MapObject, pointKey } from '../src/core/map/map.js';
import { puertaDe } from '../src/core/map/puertas.js';
import { estructura } from '../src/core/map/regiones.js';
import { espejoDe } from '../src/core/map/vestir.js';
import { createRng } from '../src/core/rng.js';
import { applyAdventureAction, type GameState, townById } from '../src/core/state/game.js';
import { rentaDelDia } from '../src/core/state/renta.js';
import { newGame } from '../src/core/state/setup.js';
import {
  dueñoDelSitio,
  enUnNodo,
  mejorarBlocker,
  pasoOPuebloSiExiste,
  ponerLaGuarnicion,
  type Sitio,
  sitioPorId,
  sitioSiExiste,
} from '../src/core/state/sitios.js';
import type { Point } from '../src/core/types.js';
import { PESADA, TROPA_BARATA } from './comun.js';
import { rango, segunPrisa } from './lento.js';
import { planDeNodos } from './mapa-de-prueba.js';
import { darLaCiudad, ejercito } from './partida-de-prueba.js';

type Pueblo = Extract<MapObject, { kind: 'village' }>;

describe('el generador pone algunos pueblos en el paso con camino de su región', () => {
  // En el bucle rápido, tres semillas con pueblos en un nodo de montaña, bosque y
  // acantilado; en la orden lenta, 1-40 (76 de 320 pueblos, 05-11-2026).
  const semillas = segunPrisa([15, 18, 27], rango(1, 40));

  it('cada pueblo del muro es un nodo con camino sobre tierra, en espejo, y su región no lleva otro', () => {
    let enElMuro = 0;
    for (const s of semillas) {
      const { map } = buildMap(generateMapPlan(createRng(s)));
      const red = estructura(map);
      const pueblos = map.objects.filter((o): o is Pueblo => o.kind === 'village');
      for (const v of pueblos) {
        const donde = `s${s} ${v.id} (${v.at.x},${v.at.y})`;
        if (v.barrera === null) {
          // El de dentro sigue dentro, con su puerta.
          expect(red.sitiosDeRegion.has(v.id), donde).toBe(true);
          continue;
        }
        enElMuro++;
        expect(BARRERAS_DEL_PUEBLO, donde).toContain(v.barrera);
        const n = red.nodoPorId.get(v.id);
        expect(n, `${donde}: es un nodo`).not.toBe(undefined);
        const nodo = red.nodos[n as number]!;
        expect(nodo.clase, donde).toBe('pueblo');
        expect(nodo.regiones, donde).toHaveLength(2);
        // Con camino: se cruza por él, como un paso.
        expect(map.caminos.casillas.has(pointKey(v.at)), `${donde}: sin camino`).toBe(true);
        expect(puertaDe(v, map.width, map.height), donde).toBe(null);
        // Su espejo es el pueblo del muro de la pareja, sobre la misma barrera.
        const im = espejoDe(v.at.y * map.width + v.at.x, map.width * map.height);
        const suyo = pueblos.find((o) => o.at.y * map.width + o.at.x === im);
        expect(suyo?.barrera, `${donde}: su espejo`).toBe(v.barrera);
      }
      // Cada región de fuera, un pueblo: dentro o en el muro (el total no cambia),
      // y ninguna con dos dentro.
      expect(pueblos.length, `s${s}`).toBe(map.regions.length - 2);
      const dentro = pueblos.flatMap((o) => {
        const r = red.sitiosDeRegion.get(o.id);
        return r === undefined ? [] : [r];
      });
      expect(new Set(dentro).size, `s${s}`).toBe(dentro.length);
    }
    // Que no pase en vacío.
    expect(enElMuro).toBeGreaterThan(0);
  });
});

describe('data/poblamiento.json: pueblosEnUnNodo', () => {
  it('uno de cada cuatro, y cada rotura se dice', () => {
    expect(POBLAMIENTO.pueblosEnUnNodo).toEqual({ uno: 1, de: 4 });
    expect(validarPoblamiento({ parejasConCiudad: 2, pueblosEnUnNodo: { uno: 0, de: 1 } })).toEqual(
      { parejasConCiudad: 2, pueblosEnUnNodo: { uno: 0, de: 1 } },
    );
    for (const malo of [{ uno: 2, de: 1 }, { uno: 1 }, { uno: 1, de: 4, mas: 1 }, 0.25, null]) {
      expect(() => validarPoblamiento({ parejasConCiudad: 2, pueblosEnUnNodo: malo })).toThrow(
        /"pueblosEnUnNodo" tiene que ser \{"uno", "de"\}/,
      );
    }
  });
});

/**
 * `planDeNodos` con un pueblo más, «El Collado», en la columna de montaña entre
 * Centro (c) y Llano (d), en (17,7): sobre el muro, que `buildMap` abre.
 */
const COLLADO = { x: 17, y: 7 };
function conCollado(cambios: Partial<PlanConCasillas> = {}): PlanConCasillas {
  const plan = planDeNodos();
  return {
    ...plan,
    villages: [...plan.villages, { name: 'El Collado', at: COLLADO }],
    ...cambios,
  };
}

describe('el pueblo en el muro de un plan', () => {
  it('sobre montaña entre dos regiones: `buildMap` abre su casilla, guarda la barrera y es un nodo', () => {
    const plan = conCollado();
    expect(validateMapPlan(plan)).toEqual([]);
    const { map } = buildMap(plan);
    const collado = map.objects.find(
      (o): o is Pueblo => o.kind === 'village' && o.name === 'El Collado',
    )!;
    expect(collado.barrera).toBe('mountain');
    expect(map.terrain[COLLADO.y * map.width + COLLADO.x]).toBe('dirt');
    const red = estructura(map);
    const n = red.nodos[red.nodoPorId.get(collado.id)!]!;
    expect({ clase: n.clase, regiones: n.regiones.map((r) => map.regions[r]!.id) }).toEqual({
      clase: 'pueblo',
      regiones: ['c', 'd'],
    });
    // Y el de dentro de una región, sin barrera y con su puerta.
    const pozo = map.objects.find(
      (o): o is Pueblo => o.kind === 'village' && o.name === 'Aldea del Pozo',
    )!;
    expect(pozo.barrera).toBe(null);
    expect(puertaDe(pozo, map.width, map.height)).toEqual({ x: 14, y: 2 });
    expect(puertaDe(collado, map.width, map.height)).toBe(null);
  });

  it('lo que no vale se rechaza diciéndolo', () => {
    const plan = conCollado();
    // Sobre el agua: su paso sería un puente.
    const enElAgua = conCollado({
      walls: [...plan.walls, { terrain: 'water', from: COLLADO, to: COLLADO }],
    });
    expect(validateMapPlan(enElAgua)).toEqual([
      'el pueblo "El Collado" de (17,7) está sobre water: en el muro, un pueblo va sobre mountain, forest, cliff; sobre el agua el paso es un puente y sobre la muralla, su puerta',
    ]);
    // Entre dos regiones sin muro debajo (un hueco en la columna).
    const enUnHueco = conCollado({
      walls: [
        ...plan.walls.filter((w) => w.from.x !== 17),
        { terrain: 'mountain', from: { x: 17, y: 0 }, to: { x: 17, y: 6 } },
        { terrain: 'mountain', from: { x: 17, y: 8 }, to: { x: 17, y: 8 } },
      ],
    });
    expect(validateMapPlan(enUnHueco)).toEqual([
      'el pueblo "El Collado" de (17,7) toca las regiones "c" y "d" sin muro debajo: un pueblo entre dos regiones va sobre el muro (mountain, forest, cliff), que abre su casilla y cruza su barrera, como un nodo',
    ]);
    // Sobre un trozo de muro dentro del Oeste: toca solo esa región.
    const enUnaRegion = con({
      walls: [...plan.walls, { terrain: 'mountain', from: { x: 2, y: 4 }, to: { x: 2, y: 4 } }],
      villages: [...planDeNodos().villages, { name: 'El Risco', at: { x: 2, y: 4 } }],
    });
    expect(validateMapPlan(enUnaRegion)).toEqual([
      'el pueblo "El Risco" de (2,4) está sobre el muro (mountain) y solo toca la región "a": en el muro, un pueblo va entre dos regiones o más; para tenerlo dentro de la región, ponlo en una casilla que se pisa',
    ]);
  });

  it('ni en el borde del mapa ni junto a una ciudad: la regla del generador, también en el plan', () => {
    // Vuelta 1 de QA (H4): el generador ya no ponía un pueblo del muro en la fila 0
    // (su pieza se sale del marco) ni a dos casillas de una ciudad (un acceso de su
    // puerta), y el plan del agente los dejaba pasar. Ahora es una sola regla,
    // `puebloDelMuroBlocker`, que leen los dos.
    const conOtro = (at: Point): PlanConCasillas => {
      const plan = planDeNodos();
      return { ...plan, villages: [...plan.villages, { name: 'El Collado', at }] };
    };
    // En la fila 0 de la sierra entre Centro y Llano.
    expect(validateMapPlan(conOtro({ x: 17, y: 0 }))).toEqual([
      'el pueblo "El Collado" de (17,0) está en el borde del mapa: un pueblo del muro lleva su pieza en el paso, que se saldría del marco; ponlo a una casilla del borde o más',
    ]);
    // En el acceso norte de Valdeluz, la base, sobre su muro.
    expect(validateMapPlan(conOtro({ x: 5, y: 2 }))).toEqual([
      'el pueblo "El Collado" de (5,2) está a 2 casillas de la ciudad "Valdeluz" de (5,4), en su recinto o en un acceso de sus puertas: por ahí entra su región en la ciudad, y un nodo no puede ir ahí; ponlo a 3 casillas o más de toda ciudad, contando la diagonal como una',
    ]);
    // A tres, vale (El Collado de siempre, a tres de Torreblanca).
    expect(validateMapPlan(conOtro(COLLADO))).toEqual([]);
    // El pueblo de dentro de una región no es nodo: la regla no es suya.
    expect(validateMapPlan(conOtro({ x: 14, y: 0 }))).not.toContainEqual(
      expect.stringMatching(/borde del mapa/),
    );
  });
});

/** `planDeNodos` con `cambios`. */
function con(cambios: Partial<PlanConCasillas>): PlanConCasillas {
  return { ...planDeNodos(), ...cambios };
}

describe('el pueblo en el muro en la partida: las reglas de la fase 1', () => {
  const ctx = { rng: createRng(1) };
  function partida(): { state: GameState; collado: Pueblo } {
    const state = newGame({ seed: 1, plan: conCollado() });
    const collado = state.map.objects.find(
      (o): o is Pueblo => o.kind === 'village' && o.name === 'El Collado',
    )!;
    return { state, collado };
  }
  function andar(state: GameState, quien: number, desde: Point, to: Point): void {
    const hero = state.heroes.find((h) => h.owner === quien)!;
    hero.at = desde;
    hero.movePoints = 5000;
    hero.army = ejercito({ creature: PESADA, count: 6 });
    state.current = quien;
    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to }, ctx, quien);
  }

  it('se toma pisándolo, como un paso, y da su oro unido a la base', () => {
    const { state, collado } = partida();
    const sitio = sitioPorId(state, collado.id);
    expect(enUnNodo(state, sitio)).toBe(true);
    expect(dueñoDelSitio(state, sitio)).toBe(null);
    // El Llano (d) es del 1 si son suyos todos sus nodos: su base, Torreblanca y
    // el pueblo. Sin el pueblo, no; y sin el Llano, el pueblo no está unido.
    darLaCiudad(state, townById(state, 'town-2'), 1);
    expect(rentaDelDia(state, 1).pueblos.map((p) => p.id)).not.toContain(collado.id);
    const desde = state.log.length;
    andar(state, 1, { x: 18, y: 7 }, COLLADO);
    expect(collado.owner).toBe(1);
    expect(dueñoDelSitio(state, sitio)).toBe(1);
    expect(state.log.slice(desde).filter((e) => e.kind === 'node_captured')).toMatchObject([
      { kind: 'node_captured', node: collado.id, from: null, actor: 1, at: COLLADO },
    ]);
    expect(rentaDelDia(state, 1).pueblos).toContainEqual({
      id: collado.id,
      nombre: 'El Collado',
      oro: 250,
      unido: true,
      ocupada: null,
    });
    // No es un puesto: no se mejora.
    const heroe = state.heroes.find((h) => h.owner === 1)!;
    expect(mejorarBlocker(state, 1, heroe.id, 'empalizada', 99_999)).toBe(
      'solo se mejora un paso tomado, un puesto: El Collado es un pueblo',
    );
  });

  it('tomado sin unir, sale en la renta con 0 y por qué; y la crónica lo nombra como pueblo', () => {
    // Vuelta 1 de QA (H2): El Soto, tomado y aún sin unir a la base, no salía en
    // «Pueblos» y la crónica decía «Paso tomado en (8, 14)»: no se sabía qué se
    // había tomado ni por qué no daba oro.
    const { state, collado } = partida();
    andar(state, 1, { x: 18, y: 7 }, COLLADO);
    expect(collado.owner).toBe(1);
    expect(rentaDelDia(state, 1).pueblos).toContainEqual({
      id: collado.id,
      nombre: 'El Collado',
      oro: 0,
      unido: false,
      ocupada: null,
    });
    // La crónica de la persona y la del espectador (con los objetos del cable).
    const hecho = [...state.log].reverse().find((e) => e.kind === 'node_captured')!;
    const html = (sitioDe: (id: string) => Sitio | null): string =>
      marcadoDe(renderLog([hecho], 1, undefined, sitioDe));
    expect(html((id) => sitioSiExiste(state, id))).toContain('Pueblo tomado: El Collado');
    expect(html((id) => pasoOPuebloSiExiste(state.map.objects, id))).toContain(
      'Pueblo tomado: El Collado',
    );
    expect(marcadoDe(renderLog([hecho], 0, undefined, (id) => sitioSiExiste(state, id)))).toContain(
      'El jugador 1 toma el pueblo de El Collado',
    );
  });

  it('con guarnición ajena, pisarlo es pelear, tras la empalizada de madera', () => {
    const { state, collado } = partida();
    ponerLaGuarnicion(
      state,
      sitioPorId(state, collado.id),
      0,
      ejercito({ creature: TROPA_BARATA, count: 3 }),
    );
    andar(state, 1, { x: 18, y: 7 }, COLLADO);
    expect(state.pendingBattle?.foe).toEqual({ kind: 'garrison', site: collado.id });
    expect(state.pendingBattle?.battle.muralla.material).toBe('madera');
  });
});
