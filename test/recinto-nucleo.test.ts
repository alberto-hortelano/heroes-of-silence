/**
 * El recinto de una ciudad, del núcleo (`core/map/recinto.ts`; la ciudad
 * amurallada, vuelta 3). Dónde está el 3 × 3 de cada ciudad lo dice el núcleo,
 * y él no pone nada dentro, ni dos que se toquen, ni una ciudad en el borde:
 * decisiones del usuario del 21-10-2026 tras el QA de la vuelta 2 (H4, H5). El
 * héroe de salida nace en la casilla de su base, el medio del recinto, y sale
 * por sus puertas (19-10-2026, decisión del usuario). La escena lo lee y lo
 * pinta (`recinto-en-la-escena.test.ts`).
 *
 * Y por dónde se entra (fase 2): la muralla no se pisa, a la ciudad se pasa de
 * un acceso a su puerta y de la puerta a ella (`pasoPermitido`), y hay puerta
 * donde llega un camino (decisión del usuario).
 */
import { describe, expect, it } from 'vitest';
import {
  caraHacia,
  contornoDelRecinto,
  dentroDelContorno,
} from '../src/client/render/escenario/recinto.js';
import { RESPONSE_FORMAT } from '../src/core/contract/agent.js';
import { buildMap, validateMapPlan } from '../src/core/map/generate.js';
import {
  createEmptyMap,
  findPath,
  type GameMap,
  isEnterable,
  RedDeCaminos,
  stepCost,
  tramosDeCasillas,
} from '../src/core/map/map.js';
import {
  CIUDAD,
  cabeElRecinto,
  LADO_DEL_RECINTO,
  MURO,
  muroBlocker,
  ORDEN_DE_LAS_CARAS,
  PUERTA,
  PUERTAS_DE_LA_CIUDAD,
  pasoPermitido,
  pasosDelMapa,
  problemasDeRecintos,
  puertasDeLaCiudad,
  recintoDeLaCiudad,
  regionesDeLaCiudad,
  SEPARACION_DE_CIUDADES,
} from '../src/core/map/recinto.js';
import { estructura } from '../src/core/map/regiones.js';
import { baseOf } from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import { planDeNodos } from './helpers.js';
import { rango, segunPrisa } from './lento.js';

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('el 3 × 3 de una ciudad (`recintoDeLaCiudad`)', () => {
  it('es el 3 × 3 con la ciudad en el medio', () => {
    expect(LADO_DEL_RECINTO).toBe(3);
    expect(recintoDeLaCiudad({ x: 10, y: 10 }, 30, 30)).toEqual({ i0: 9, j0: 9, i1: 11, j1: 11 });
    expect(recintoDeLaCiudad({ x: 1, y: 28 }, 30, 30)).toEqual({ i0: 0, j0: 27, i1: 2, j1: 29 });
  });

  it('en el borde no cabe, y lanza diciéndolo: no se corre hacia dentro', () => {
    expect(cabeElRecinto({ x: 1, y: 1 }, 30, 30)).toBe(true);
    expect(cabeElRecinto({ x: 28, y: 28 }, 30, 30)).toBe(true);
    for (const p of [
      { x: 0, y: 5 },
      { x: 5, y: 0 },
      { x: 29, y: 5 },
      { x: 5, y: 29 },
    ])
      expect(cabeElRecinto(p, 30, 30), `(${p.x},${p.y})`).toBe(false);
    expect(() => recintoDeLaCiudad({ x: 0, y: 29 }, 30, 30)).toThrow(
      'el recinto de la ciudad con el medio en (0,29) no cabe en un mapa de 30×30: mide 3 de lado y una ciudad va a una casilla del borde o más',
    );
  });
});

/**
 * Una pradera de 9×9 con una ciudad en (4,4) y caminos por la puerta del norte
 * y la del sur: (4,2) → (4,3) → (4,4) y (4,4) → (4,5) → (4,6).
 */
function praderaConCiudad(caminos: readonly { x: number; y: number }[] = NORTE_Y_SUR): GameMap {
  const map = createEmptyMap(9, 9, 'grass');
  map.objects.push({ kind: 'town', id: 'town-0', at: { x: 4, y: 4 }, owner: null });
  const { tramos, sueltas } = tramosDeCasillas(caminos, 9, 9);
  return { ...map, caminos: RedDeCaminos.desdeTramos(tramos, 9, 9, sueltas) };
}
const NORTE_Y_SUR = [2, 3, 4, 5, 6].map((y) => ({ x: 4, y }));
const i = (x: number, y: number) => y * 9 + x;

describe('por dónde se entra en una ciudad (`pasoPermitido`, fase 2)', () => {
  it('hay puerta donde llega un camino: la del norte y la del sur, y las demás caras son muro', () => {
    const map = praderaConCiudad();
    expect(puertasDeLaCiudad(map, { x: 4, y: 4 }).map((p) => p.cara)).toEqual(['n', 's']);
    const pasos = pasosDelMapa(map);
    if (pasos === null) throw new Error('sin recintos');
    expect(pasos.rol[i(4, 3)]).toBe(PUERTA);
    expect(pasos.rol[i(4, 5)]).toBe(PUERTA);
    expect(pasos.rol[i(4, 4)]).toBe(CIUDAD);
    // La esquina del noreste tiene acceso, pero no camino: es muro.
    expect(pasos.rol[i(5, 3)]).toBe(MURO);
    expect(pasos.rol[i(3, 4)]).toBe(MURO);
  });

  it('de un acceso a su puerta y de la puerta a la ciudad, en los dos sentidos; nada más', () => {
    const pasos = pasosDelMapa(praderaConCiudad());
    if (pasos === null) throw new Error('sin recintos');
    const pasa = (a: [number, number], b: [number, number]) =>
      pasoPermitido(pasos, i(...a), i(...b));
    expect(pasa([4, 2], [4, 3])).toBe(true);
    expect(pasa([4, 3], [4, 4])).toBe(true);
    expect(pasa([4, 4], [4, 5])).toBe(true);
    expect(pasa([4, 5], [4, 6])).toBe(true);
    expect(pasa([4, 3], [4, 2])).toBe(true);
    // Ni de una casilla de fuera que no es su acceso, ni de anillo a anillo, ni
    // pisar el muro aunque sea pradera, ni de la ciudad a la muralla.
    expect(pasa([3, 2], [4, 3])).toBe(false);
    expect(pasa([5, 2], [4, 3])).toBe(false);
    expect(pasa([4, 3], [5, 3])).toBe(false);
    expect(pasa([4, 2], [5, 3])).toBe(false);
    expect(pasa([4, 4], [3, 4])).toBe(false);
    expect(pasa([6, 4], [5, 4])).toBe(false);
    expect(pasa([1, 1], [2, 2])).toBe(true);
  });

  it('el héroe entra por el norte y sale por el sur, y desde el este rodea la muralla', () => {
    const map = praderaConCiudad();
    const deNorteASur = findPath(map, { x: 4, y: 0 }, { x: 4, y: 8 });
    expect(deNorteASur?.map((p) => `${p.at.x},${p.at.y}`)).toEqual([
      '4,1',
      '4,2',
      '4,3',
      '4,4',
      '4,5',
      '4,6',
      '4,7',
      '4,8',
    ]);
    // La puerta y la ciudad cuestan como un camino.
    expect(stepCost(map, { x: 4, y: 2 }, { x: 4, y: 3 })).toBe(75);
    // A la puerta se pasa desde su acceso, no en diagonal desde al lado: de
    // (3,2) se va primero a (4,2).
    expect(
      findPath(map, { x: 3, y: 2 }, { x: 4, y: 4 })?.map((p) => `${p.at.x},${p.at.y}`),
    ).toEqual(['4,2', '4,3', '4,4']);
    expect(() => stepCost(map, { x: 3, y: 2 }, { x: 4, y: 3 })).toThrow(
      'no se pasa de (3,2) a (4,3): a una ciudad se entra desde un acceso de una de sus puertas, y de la puerta a ella',
    );
    // Desde el este, a la ciudad por una puerta y sin pisar el anillo.
    const desdeElEste = findPath(map, { x: 8, y: 4 }, { x: 4, y: 4 });
    if (desdeElEste === null) throw new Error('no llega');
    for (const { at } of desdeElEste.slice(0, -2))
      expect(cheb(at, { x: 4, y: 4 }), `(${at.x},${at.y})`).toBeGreaterThan(1);
    expect(['4,3', '4,5']).toContain(`${desdeElEste.at(-2)?.at.x},${desdeElEste.at(-2)?.at.y}`);
  });

  it('la muralla no se pisa aunque sea pradera, y se dice con sus puertas', () => {
    const map = praderaConCiudad();
    expect(isEnterable(map, { x: 3, y: 3 })).toBe(false);
    expect(isEnterable(map, { x: 4, y: 3 })).toBe(true);
    expect(findPath(map, { x: 0, y: 0 }, { x: 3, y: 3 })).toBe(null);
    expect(muroBlocker(map, { x: 3, y: 3 })).toBe(
      '(3,3) es la muralla de la ciudad de (4,4): a una ciudad se entra por sus puertas —la del norte y la del sur—, y el resto de su recinto no se pisa',
    );
    expect(muroBlocker(map, { x: 4, y: 3 })).toBe(null);
    expect(() => stepCost(map, { x: 2, y: 3 }, { x: 3, y: 3 })).toThrow(
      '(3,3) es la muralla de la ciudad de (4,4)',
    );
    // Sin caminos, ninguna puerta: la ciudad queda cerrada.
    const cerrada = praderaConCiudad([]);
    expect(muroBlocker(cerrada, { x: 4, y: 3 })).toBe(
      '(4,3) es la muralla de la ciudad de (4,4): a una ciudad se entra por sus puertas y no tiene ninguna: hay puerta donde llega un camino, y el resto de su recinto no se pisa',
    );
    expect(findPath(cerrada, { x: 0, y: 0 }, { x: 4, y: 4 })).toBe(null);
  });

  it('las regiones de una ciudad, las de los accesos de sus puertas posibles', () => {
    const { map } = buildMap(planDeNodos());
    const { regionDe } = estructura(map);
    // Valdeluz, en el muro de A y B; Torreblanca, de C y D.
    expect(regionesDeLaCiudad(map, { x: 5, y: 4 }, regionDe)).toEqual([0, 1]);
    expect(regionesDeLaCiudad(map, { x: 17, y: 4 }, regionDe)).toEqual([2, 3]);
  });
});

describe('las puertas de una ciudad (`PUERTAS_DE_LA_CIUDAD`)', () => {
  it('seis: la del norte, la del sur y las diagonales; ni la del este ni la del oeste', () => {
    expect(Object.keys(PUERTAS_DE_LA_CIUDAD).sort()).toEqual(['n', 'ne', 'no', 's', 'se', 'so']);
    expect([...ORDEN_DE_LAS_CARAS].sort()).toEqual(Object.keys(PUERTAS_DE_LA_CIUDAD).sort());
    for (const [cara, { casilla, accesos }] of Object.entries(PUERTAS_DE_LA_CIUDAD)) {
      const puerta = { x: casilla[0], y: casilla[1] };
      // La puerta, en el anillo; sus accesos, fuera, pegados a ella.
      expect(cheb(puerta, { x: 0, y: 0 }), cara).toBe(1);
      expect(accesos.length, cara).toBe(cara === 'n' || cara === 's' ? 1 : 3);
      for (const [x, y] of accesos) {
        expect(cheb({ x, y }, { x: 0, y: 0 }), `${cara} (${x},${y})`).toBe(2);
        expect(cheb({ x, y }, puerta), `${cara} (${x},${y})`).toBe(1);
      }
    }
  });

  it('desde cada acceso se entra por el arco de su cara en el octógono de la escena', () => {
    // La recta del centro del acceso al de la puerta cruza el octógono
    // (`contornoDelRecinto`) por su cara, a 0,1 o menos del medio, donde va el
    // arco: las tres de una diagonal cruzan su chaflán.
    const at = { x: 10, y: 10 };
    const contorno = contornoDelRecinto(recintoDeLaCiudad(at, 30, 30));
    for (const [cara, { casilla, accesos }] of Object.entries(PUERTAS_DE_LA_CIUDAD))
      for (const [dx, dy] of accesos) {
        const a = [at.x + dx + 0.5, at.y + dy + 0.5] as const;
        const b = [at.x + casilla[0] + 0.5, at.y + casilla[1] + 0.5] as const;
        let cruce: readonly [number, number] | undefined;
        for (let k = 0; k <= 1000 && cruce === undefined; k++) {
          const p = [a[0] + ((b[0] - a[0]) * k) / 1000, a[1] + ((b[1] - a[1]) * k) / 1000] as const;
          if (dentroDelContorno(contorno, p[0], p[1])) cruce = p;
        }
        if (cruce === undefined) throw new Error(`${cara} (${dx},${dy}): no entra en el octógono`);
        const k = caraHacia(contorno, cruce[0], cruce[1]);
        expect(k.cara, `${cara} (${dx},${dy})`).toBe(cara);
        expect(
          Math.hypot(cruce[0] - k.medio[0], cruce[1] - k.medio[1]),
          `${cara} (${dx},${dy})`,
        ).toBeLessThanOrEqual(0.1);
      }
  });
});

describe('lo que impide un recinto (`problemasDeRecintos`), dicho para quien hizo el plan', () => {
  // `planDeNodos`: Valdeluz en (5,4), con su recinto de (4,3) a (6,5).
  const { map } = buildMap(planDeNodos());
  const red = estructura(map);

  it('el plan de prueba no tiene ninguno', () => {
    expect(validateMapPlan(planDeNodos())).toEqual([]);
  });

  it('una ciudad en el borde, y dos que se tocarían', () => {
    expect(
      problemasDeRecintos(map, red, [{ id: 'borde', name: 'Orilla', at: { x: 0, y: 4 } }], []),
    ).toEqual([
      'la ciudad "Orilla" (borde, en (0,4)) está en el borde del mapa: lleva un recinto amurallado de 3×3 casillas con ella en el medio, que no cabe; ponla a una casilla del borde o más',
    ]);
    // Dos donde no hay nada: (2,6), en la región A, y (6,6), en la B.
    expect(
      problemasDeRecintos(
        map,
        red,
        [
          { id: 'una', name: 'Una', at: { x: 2, y: 6 } },
          { id: 'otra', name: 'Otra', at: { x: 6, y: 6 } },
        ],
        [],
      ),
    ).toEqual([
      'las ciudades "Una" (una, en (2,6)) y "Otra" (otra, en (6,6)) llevan sus recintos a 4 casillas uno de otro: se tocarían; entre dos ciudades van 5 casillas o más, contando la diagonal como una',
    ]);
    expect(SEPARACION_DE_CIUDADES).toBe(5);
  });

  it('una ciudad sobre el agua de un río: va en tierra, con su puente delante', () => {
    // El muro de Valdeluz, de agua: queda con el agua al norte y al sur.
    const plan = planDeNodos();
    const conRio = {
      ...plan,
      walls: plan.walls.map((w) => (w.from.x === 5 ? { ...w, terrain: 'water' as const } : w)),
    };
    expect(validateMapPlan(conRio)).toContain(
      'la ciudad "Valdeluz" (town-0, en (5,4)) está sobre el agua de un río: una ciudad va en tierra; si quieres que el río pase por delante, déjale a dos casillas de ella, en cruz, una casilla que se pise con agua a sus dos lados, que es su puente',
    );
  });

  it('una región que el recinto parte en dos: su muralla no se pisa', () => {
    // Una pradera de 9×9 cortada por una montaña en la fila 4, salvo la ciudad
    // y las dos casillas de su anillo de los lados: la región de abajo (sur) se
    // une a la de arriba solo por (3,4) y (5,4), que son muralla. Con una sola
    // región declarada, partida por el recinto.
    const map = {
      ...createEmptyMap(9, 9, 'grass'),
      regions: [{ id: 'r', name: 'Pradera', at: { x: 0, y: 0 }, nivel: 1 as const }],
    };
    for (let x = 0; x < 9; x++) if (Math.abs(x - 4) > 1) map.terrain[4 * 9 + x] = 'mountain';
    map.objects.push({ kind: 'town', id: 'town-0', at: { x: 4, y: 4 }, owner: null });
    expect(
      problemasDeRecintos(
        map,
        estructura(map),
        [{ id: 'town-0', name: 'Valdeluz', at: { x: 4, y: 4 } }],
        [],
      ),
    ).toContain(
      'el recinto de la ciudad "Valdeluz" (town-0, en (4,4)) parte la región "Pradera" en dos: (0,0) y (0,5) solo se unen por dentro de su muralla, que no se pisa',
    );
  });

  it('cualquier cosa dentro: una mina o un grupo de asaltantes', () => {
    const plan = planDeNodos();
    expect(
      validateMapPlan({
        ...plan,
        mines: [...plan.mines, { at: { x: 6, y: 5 }, resource: 'gems' }],
      }),
    ).toEqual([
      'la mina de gems de (6,5) cae dentro del recinto de la ciudad "Valdeluz" (town-0, en (5,4)), de (4,3) a (6,5): dentro de su muralla solo va ella',
    ]);
    const valdeluz = { id: 'town-0', name: 'Valdeluz', at: { x: 5, y: 4 } };
    expect(
      problemasDeRecintos(
        map,
        red,
        [valdeluz],
        [{ quien: 'el grupo de asaltantes', at: { x: 6, y: 3 } }],
      ),
    ).toEqual([
      'el grupo de asaltantes de (6,3) cae dentro del recinto de la ciudad "Valdeluz" (town-0, en (5,4)), de (4,3) a (6,5): dentro de su muralla solo va ella',
    ]);
  });

  it('una región que llega a la ciudad sin camino por una puerta: sin camino no hay puerta', () => {
    const plan = planDeNodos();
    // Sin el camino de A a Valdeluz: (3,3) y (4,3) fuera.
    const sinOeste = (plan.roads ?? []).filter((p) => !((p.x === 3 || p.x === 4) && p.y === 3));
    expect(validateMapPlan({ ...plan, roads: sinOeste })).toEqual([
      'la región "Oeste" llega a la ciudad "Valdeluz" (town-0, en (5,4)) por (4,6) pero ningún camino suyo entra en ella: a una ciudad se entra por sus puertas, y solo hay puerta donde llega un camino; traza uno de (4,6) a (4,5) y de ahí a la ciudad',
    ]);
  });

  it('un camino que cruza la muralla, y uno que entra por la puerta y no sigue a la ciudad', () => {
    const plan = planDeNodos();
    // Por el muro del este: de (7,4) a (6,4), del anillo.
    expect(validateMapPlan({ ...plan, roads: [...(plan.roads ?? []), { x: 6, y: 4 }] })).toContain(
      'el camino de (5,4) a (6,4) cruza la muralla de la ciudad "Valdeluz" (town-0, en (5,4)): a una ciudad se llega de un acceso a una de sus puertas y de la puerta a ella —la del noreste, la del sureste, la del suroeste y la del noroeste, con sus accesos a dos casillas—',
    );
    // Por la puerta del suroeste, de (3,6) a (4,5), sin seguir a la ciudad: con
    // casillas no se puede escribir (la de la puerta y la de la ciudad se unen
    // solas), así que con los tramos, como los traza el generador.
    const conTramo: GameMap = {
      ...map,
      caminos: RedDeCaminos.desdeTramos(
        [
          ...map.caminos.tramos,
          [
            { x: 3, y: 6 },
            { x: 4, y: 5 },
          ],
        ],
        map.width,
        map.height,
      ),
    };
    expect(
      problemasDeRecintos(
        conTramo,
        red,
        [{ id: 'town-0', name: 'Valdeluz', at: { x: 5, y: 4 } }],
        [],
      ),
    ).toEqual([
      'el camino que entra por la puerta del suroeste de la ciudad "Valdeluz" (town-0, en (5,4)), en (4,5), no sigue hasta la ciudad',
    ]);
  });

  it('la prosa del agente lo dice con las cifras del núcleo', () => {
    const prosa = RESPONSE_FORMAT.map_generate;
    expect(prosa).toContain(
      `RECINTO amurallado de ${LADO_DEL_RECINTO}×${LADO_DEL_RECINTO} casillas`,
    );
    expect(prosa).toContain(`a ${SEPARACION_DE_CIUDADES} casillas o más`);
    expect(prosa).toContain('HAY PUERTA SOLO DONDE LLEGA UN CAMINO');
    expect(RESPONSE_FORMAT.adventure_turn).toContain('se entra por sus puertas');
  });
});

describe('el generador deja sitio a cada recinto y entra por sus puertas', () => {
  // En el bucle rápido, las de las parejas que se tocaban en la vuelta 2 (s2,
  // s13, s16, s21) y la del pasillo de s31; en la lenta, 1-40.
  const semillas = segunPrisa([2, 13, 16, 21, 31], rango(1, 40));

  it('ninguno en el borde, ninguno a menos de 5 de otro, nada dentro y cada camino por una puerta; el héroe, en su base, con una puerta por la que salir', () => {
    for (const s of semillas) {
      const state = newGame({ seed: s });
      const { map } = state;
      const red = estructura(map);
      const ciudades = state.towns.map((t) => ({ id: t.id, name: t.name, at: t.at }));
      expect(
        problemasDeRecintos(
          map,
          red,
          ciudades,
          state.raiders.map((r) => ({ quien: `el grupo ${r.id}`, at: r.at })),
        ),
        `s${s}`,
      ).toEqual([]);
      // El héroe de salida, en la casilla de su base (el medio del recinto,
      // que se pisa), y la base con un camino que entra por una puerta: por
      // ella sale.
      for (const p of state.players) {
        const base = baseOf(state, p.id);
        const heroe = state.heroes.find((h) => h.owner === p.id);
        if (base === null || heroe === undefined)
          throw new Error(`s${s}: el ${p.id} sin base o sin héroe`);
        expect(heroe.at, `s${s}: el héroe del ${p.id}`).toEqual(base.at);
        expect(
          puertasDeLaCiudad(map, base.at).some((pu) =>
            pu.accesos.some((a) => map.caminos.une(a, pu.casilla)),
          ),
          `s${s}: la base del ${p.id} en (${base.at.x},${base.at.y}) sin una puerta con camino`,
        ).toBe(true);
      }
    }
  });
});
