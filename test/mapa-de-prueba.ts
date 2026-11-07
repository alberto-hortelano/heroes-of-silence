/**
 * Mapas escritos a mano para los tests del núcleo (`planDeNodos` y su variante
 * con la ciudad dentro de su región), los caminos de un mapa leídos por sus
 * tramos y el alcance de un héroe por clave. Solo el núcleo: la escena del
 * escenógrafo, en `escena-de-prueba.ts`. (De `test/helpers.ts`, fase T,
 * 06-11-2026.)
 */
import type { PlanConCasillas } from '../src/core/map/generar/plan.js';
import { aPunto, pointFromKey, pointKey } from '../src/core/map/geometria.js';
import type { Reachable } from '../src/core/map/map.js';
import { RedDeCaminos } from '../src/core/map/red-de-caminos.js';
import type { GameMap } from '../src/core/map/tipos.js';
import type { Point } from '../src/core/types.js';

/**
 * El coste de cada casilla del alcance por `"x,y"`, en orden de primer
 * descubrimiento: la forma que tenía `Reachable.costs` antes de #94. El núcleo
 * ya no la construye (era el 6 % del banco); los tests la reconstruyen para
 * seguir leyendo por clave y para que los goldens de orden no se reescriban.
 */
export function costesDelAlcance(alcance: Reachable): Map<string, number> {
  const costes = new Map<string, number>();
  for (const i of alcance.descubiertas) {
    costes.set(pointKey(aPunto(i, alcance.ancho)), alcance.costes[i] as number);
  }
  return costes;
}

/**
 * Un mapa de nodos pequeño y escrito a mano, para que los tests de reglas no
 * dependan de lo que salga del generador.
 *
 * Cinco regiones en fila separadas por cordilleras (columnas 5, 11, 17 y 22):
 *
 * ```
 *   A x0-4 | B x6-10 | C x12-16 | D x18-21 | E x23-25
 *       town-0   node-1    town-2    town-1
 *       node-0   node-2
 * ```
 *
 * - `town-0` (5,4): base del jugador 0, entre A y B. `node-0` (5,8): el otro
 *   paso de A, así que A **no** es de nadie al empezar.
 * - `node-1` (11,2) y `node-2` (11,6): los dos pasos entre B y C.
 * - `town-2` (17,4): ciudad NEUTRAL de caballero entre C y D, que nace con la
 *   guarnición de `data/ciudades.json`.
 * - `town-1` (22,4): base del jugador 1, entre D y E.
 *
 * Un pueblo en cada una de A, B y C: Los Robles (2,2), Molinar (8,4) y Las
 * Eras (14,4), donde iban las minas hasta el 21-10-2026, y Aldea del Pozo
 * (14,1), el segundo de C. Dentro del 3 × 3 de cada ciudad no va nada más que
 * ella (`problemasDeRecintos`).
 *
 * Cada ciudad, con un camino de cada región que la toca por la puerta de esa
 * cara (la ciudad amurallada, fase 2): hay puerta donde llega un camino, y sin
 * él la región se quedaría sin la ciudad. Las del norte y el sur dan al muro,
 * así que entran por las diagonales de arriba: Valdeluz, de (3,3) por (4,3) y
 * de (7,3) por (6,3); Torreblanca y Cripta Gris, igual.
 */
export function planDeNodos(): PlanConCasillas {
  const columna = (x: number) => ({
    terrain: 'mountain' as const,
    from: { x, y: 0 },
    to: { x, y: 8 },
  });
  return {
    width: 26,
    height: 9,
    baseTerrain: 'grass',
    patches: [],
    regions: [
      { id: 'a', name: 'Oeste', at: { x: 2, y: 6 } },
      { id: 'b', name: 'Vega', at: { x: 8, y: 7 } },
      { id: 'c', name: 'Centro', at: { x: 14, y: 7 } },
      { id: 'd', name: 'Llano', at: { x: 19, y: 7 } },
      { id: 'e', name: 'Este', at: { x: 24, y: 7 } },
    ],
    walls: [columna(5), columna(11), columna(17), columna(22)],
    nodes: [
      { x: 5, y: 8 },
      { x: 11, y: 2 },
      { x: 11, y: 6 },
    ],
    towns: [
      {
        id: 'town-0',
        name: 'Valdeluz',
        faction: 'templarios',
        at: { x: 5, y: 4 },
        owner: 0,
      },
      {
        id: 'town-1',
        name: 'Cripta Gris',
        faction: 'no-muertos',
        at: { x: 22, y: 4 },
        owner: 1,
      },
      {
        id: 'town-2',
        name: 'Torreblanca',
        faction: 'templarios',
        at: { x: 17, y: 4 },
        owner: null,
      },
    ],
    villages: [
      { name: 'Aldea del Pozo', at: { x: 14, y: 1 } },
      { name: 'Los Robles', at: { x: 2, y: 2 } },
      { name: 'Molinar', at: { x: 8, y: 4 } },
      { name: 'Las Eras', at: { x: 14, y: 4 } },
    ],
    monsters: [],
    chests: [],
    roads: [
      ...caminoPorLasDiagonales({ x: 5, y: 4 }),
      ...caminoPorLasDiagonales({ x: 17, y: 4 }),
      ...caminoPorLasDiagonales({ x: 22, y: 4 }),
    ],
  };
}

/**
 * El camino de las dos regiones de una ciudad en un muro de norte a sur: de la
 * casilla a dos al oeste y una arriba, por la puerta del noroeste, a la ciudad,
 * y de ahí por la del noreste a la de dos al este y una arriba.
 */
export function caminoPorLasDiagonales(at: { x: number; y: number }): { x: number; y: number }[] {
  return [
    { x: at.x - 2, y: at.y - 1 },
    { x: at.x - 1, y: at.y - 1 },
    at,
    { x: at.x + 1, y: at.y - 1 },
    { x: at.x + 2, y: at.y - 1 },
  ];
}

/**
 * El mismo mapa con camino también en estas casillas, sueltas. Es lo que hacían
 * los tests con `map.roads.add` antes de que el mapa guardara tramos (#153): la
 * red es de un solo hecho y no se muta, se rehace.
 */
export function conCaminos(map: GameMap, ...claves: string[]): GameMap {
  const { tramos, sueltas } = map.caminos;
  const caminos = RedDeCaminos.desdeTramos(tramos, map.width, map.height, [
    ...sueltas,
    ...claves.map(pointFromKey),
  ]);
  return { ...map, caminos };
}

/**
 * Los caminos del mapa por índice plano: sus casillas, en orden, sus tramos y
 * con qué casillas une cada una un tramo.
 */
export function grafoDeCaminos(map: GameMap): {
  todas: number[];
  unidas: Map<number, number[]>;
  aristas: [number, number][];
} {
  const W = map.width;
  const indice = (p: Point) => p.y * W + p.x;
  const todas = [...map.caminos.indices].sort((a, b) => a - b);
  const aristas = map.caminos.tramos.map(([p, q]): [number, number] => [indice(p), indice(q)]);
  const unidas = new Map<number, number[]>();
  for (const [i, k] of aristas) {
    unidas.set(i, [...(unidas.get(i) ?? []), k]);
    unidas.set(k, [...(unidas.get(k) ?? []), i]);
  }
  return { todas, unidas, aristas };
}

/** Lo que se alcanza desde `origen` andando por tramos, sin salir de lo que `vale`. */
export function piezaDeCaminos(
  unidas: ReadonlyMap<number, readonly number[]>,
  origen: number,
  vale: (j: number) => boolean,
): Set<number> {
  const visto = new Set([origen]);
  const cola = [origen];
  for (let q = 0; q < cola.length; q++) {
    for (const j of unidas.get(cola[q]!) ?? []) {
      if (visto.has(j) || !vale(j)) continue;
      visto.add(j);
      cola.push(j);
    }
  }
  return visto;
}

/**
 * `planDeNodos` con **la ciudad neutral dentro de su región** (tarea 2, ciudades y
 * pueblos en su región, 05-11-2026): Torreblanca deja el muro de la columna 17 y va
 * al medio de Centro (`c`, columnas 12-16), con su camino del norte, y un paso
 * ocupa su sitio en el muro. Las bases siguen en el muro (columnas 5 y 22). El
 * pueblo que estaba donde va la ciudad baja a la fila 7. Centro la rodean los
 * pasos de (11,2), (11,6) y (17,4): quien los tenga, tiene Torreblanca.
 */
export function planConCiudadDeRegion(): PlanConCasillas {
  const plan = planDeNodos();
  const enCentro = { x: 14, y: 4 };
  return {
    ...plan,
    nodes: [...plan.nodes, { x: 17, y: 4 }],
    towns: plan.towns.map((t) => (t.id === 'town-2' ? { ...t, at: enCentro } : t)),
    villages: plan.villages.map((v) => (v.name === 'Las Eras' ? { ...v, at: { x: 13, y: 7 } } : v)),
    roads: [
      ...caminoPorLasDiagonales({ x: 5, y: 4 }),
      ...caminoPorLasDiagonales({ x: 22, y: 4 }),
      // La puerta del norte: de su acceso, (14,2), a la puerta y a la ciudad.
      { x: 14, y: 2 },
      { x: 14, y: 3 },
      enCentro,
    ],
  };
}
