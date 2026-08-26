/**
 * Mapa de aventura: una cuadrícula de terreno con objetos encima.
 *
 * A diferencia de la batalla (hexágonos), el mapa es cuadrado y se recorre en
 * ocho direcciones, como HoMM2.
 */
import type { Point, ResourceKind } from '../types.js';
import { Frontera } from './frontera.js';
import {
  DIAGONAL_FACTOR,
  isWalkable,
  ROAD_COST,
  TERRAIN_COST,
  type TerrainKind,
} from './terrain.js';

export type MapObject =
  | {
      readonly kind: 'mine';
      readonly id: string;
      readonly at: Point;
      readonly resource: ResourceKind;
      owner: number | null;
    }
  | {
      readonly kind: 'resource';
      readonly id: string;
      readonly at: Point;
      readonly resource: ResourceKind;
      readonly amount: number;
      taken: boolean;
    }
  | { readonly kind: 'town'; readonly id: string; readonly at: Point; owner: number | null }
  | {
      readonly kind: 'monster';
      readonly id: string;
      readonly at: Point;
      readonly creature: string;
      count: number;
      defeated: boolean;
    }
  | {
      readonly kind: 'chest';
      readonly id: string;
      readonly at: Point;
      readonly gold: number;
      taken: boolean;
    };

export interface GameMap {
  readonly width: number;
  readonly height: number;
  /** Terreno por casilla, en orden de filas. */
  readonly terrain: TerrainKind[];
  /** Casillas con camino, por clave "x,y". */
  readonly roads: Set<string>;
  readonly objects: MapObject[];
}

export function pointKey(p: Point): string {
  return `${p.x},${p.y}`;
}

export function inBounds(map: GameMap, p: Point): boolean {
  return p.x >= 0 && p.x < map.width && p.y >= 0 && p.y < map.height;
}

export function terrainAt(map: GameMap, p: Point): TerrainKind {
  if (!inBounds(map, p)) throw new Error(`(${p.x},${p.y}) está fuera del mapa`);
  return map.terrain[p.y * map.width + p.x] as TerrainKind;
}

export function objectAt(map: GameMap, p: Point): MapObject | undefined {
  const key = pointKey(p);
  return map.objects.find((o) => pointKey(o.at) === key);
}

/** ¿Bloquea el paso este objeto? Los monstruos vivos y los pueblos, sí. */
export function blocksMovement(o: MapObject): boolean {
  if (o.kind === 'monster') return !o.defeated;
  return o.kind === 'town' || o.kind === 'mine';
}

/**
 * ¿Se puede terminar el movimiento aquí? Un objeto recogible se pisa (y se
 * recoge); un monstruo se "pisa" para desencadenar la batalla.
 */
export function isEnterable(map: GameMap, p: Point): boolean {
  if (!inBounds(map, p)) return false;
  return isWalkable(terrainAt(map, p));
}

/** Coste de entrar en `to` viniendo de `from`. */
export function stepCost(map: GameMap, from: Point, to: Point): number {
  const base = map.roads.has(pointKey(to)) ? ROAD_COST : TERRAIN_COST[terrainAt(map, to)];
  const diagonal = from.x !== to.x && from.y !== to.y;
  return Math.round(diagonal ? base * DIAGONAL_FACTOR : base);
}

/** Las 8 casillas vecinas dentro del mapa. */
export function neighbours(map: GameMap, p: Point): Point[] {
  const out: Point[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const n = { x: p.x + dx, y: p.y + dy };
      if (inBounds(map, n)) out.push(n);
    }
  }
  return out;
}

export interface PathStep {
  readonly at: Point;
  /** Coste acumulado desde el origen. */
  readonly cost: number;
}

/**
 * Camino más barato de `from` a `to` con Dijkstra.
 *
 * Los objetos que bloquean paso no se pueden atravesar, pero SÍ pueden ser el
 * destino: así se interactúa con una mina o se ataca a un monstruo.
 *
 * Las tres guardias se quedan aquí delante, incluida la de `isEnterable(to)`
 * que `pathFromReachable` sabría contestar sola: sin ella, un destino no
 * pisable haría recorrer el mapa ENTERO para acabar devolviendo `null`.
 */
export function findPath(map: GameMap, from: Point, to: Point): PathStep[] | null {
  if (!inBounds(map, from) || !inBounds(map, to)) return null;
  if (pointKey(from) === pointKey(to)) return [];
  if (!isEnterable(map, to)) return null;

  return pathFromReachable(map, dijkstra(map, from, to), from, to);
}

/**
 * Lo que sabe una pasada de Dijkstra desde un origen: lo que cuesta llegar a
 * cada casilla y por dónde se llega.
 *
 * `prev` va siempre y no tras una bandera: construirlo no se paga aparte —es
 * un `set` en la misma rama que ya escribe el coste— y una bandera que cambia
 * la forma del retorno obliga a todos los llamantes a estrechar un tipo para
 * pedir algo que sale gratis.
 */
export interface Reachable {
  /** Coste de llegar a cada casilla, por clave "x,y". */
  readonly costs: Map<string, number>;
  /** Desde qué casilla se llega a cada una. El origen no está: no viene de nada. */
  readonly prev: Map<string, Point>;
}

/**
 * Coste de llegar a cada casilla desde `from`, en una sola pasada de Dijkstra,
 * **y por dónde**.
 *
 * Existe porque la IA necesita comparar decenas de destinos por turno: llamar a
 * `findPath` una vez por candidato multiplica el mismo trabajo por treinta.
 * Las casillas bloqueadas (monstruos, pueblos, minas) se registran con su coste
 * de entrada pero no se expanden: se puede llegar a ellas, no atravesarlas.
 *
 * Los predecesores son lo que evita el SEGUNDO recorrido: quien ya llamó aquí
 * para elegir a dónde ir no necesita relanzar `findPath` para saber por dónde
 * se va — retrocede por `prev` desde el destino. Se llamaba `reachableCosts`, y
 * el nombre cambió a propósito con la firma: así el typecheck señala a todos
 * los llamantes en vez de dejar que alguno se quede con la versión de antes
 * creyendo que sigue valiendo.
 *
 * **Sin tope de coste, y no por olvido.** Hubo un `maxCost` desde el primer
 * commit y los ocho llamantes le pasaron siempre `Infinity`: era una rama que
 * ninguna partida y ningún test tomaban jamás, en el bucle más caliente de
 * `core`. Quien de verdad necesite un tope algún día lo escribe entonces, con
 * un test que lo tome — y sabiendo que recortar la búsqueda cambia el orden de
 * asentamiento, que es de donde cuelga el desempate.
 */
export function reachableFrom(map: GameMap, from: Point): Reachable {
  return dijkstra(map, from, null);
}

/**
 * El Dijkstra del mapa, uno solo. `parar` corta en cuanto esa casilla queda
 * asentada; con `null` asienta el mapa entero.
 *
 * Eran **dos copias** del mismo bucle con dos condiciones de parada y dos
 * reglas para las bloqueadas: `findPath` no las empujaba salvo que fueran el
 * destino, `reachableFrom` las empujaba y no las expandía. Aquí manda la de
 * `reachableFrom`, así que `findPath` **empieza a empujar** las bloqueadas que
 * antes se saltaba y **sus números de orden ya no coinciden** con los de antes.
 *
 * Sale igual, y este es el argumento entero porque es sutil y es justo donde
 * un cambio así se rompe:
 *
 * 1. Una bloqueada que no sea el origen se asienta y **no se expande**, así que
 *    no relaja a nadie: nunca llega a ser predecesor y no aparece en ningún
 *    camino. Lo único que hace de más es ocupar un sitio en la frontera.
 * 2. `orden` se asigna en orden de `push`, y el comparador solo mira su
 *    **signo** (`a.orden - b.orden`). Intercalar entradas nuevas en esa
 *    secuencia conserva el orden **relativo** de las que ya estaban.
 * 3. De 1 y 2, por inducción sobre las extracciones: la secuencia de `pop`
 *    restringida a las casillas no bloqueadas es la misma que antes, con las
 *    bloqueadas metidas en medio sin hacer nada. Mismas relajaciones, mismos
 *    predecesores, mismo camino.
 *
 * El merge al revés —imponerle a `reachableFrom` la regla de `findPath`— **no**
 * sale igual: dejaría de asentar las bloqueadas, y de eso cuelga que la IA
 * pueda ir a por una mina o un monstruo. Se probó a mano: pone en rojo los dos
 * tests que comparan `findPath` con el retroceso por `prev` (#55 y #65), las
 * tres partidas completas, y saca 120 discrepancias en un barrido de 43 160
 * pares. Lo que **no** lo cazaba era ninguno de los dos goldens de
 * `test/frontera.test.ts`, y conviene saber por qué: su mapa de 4×4 no tiene un
 * solo objeto, así que allí no hay ninguna casilla bloqueada que asentar. Por
 * eso este merge trajo un test más a ese fichero, con un guardia en (1,0).
 *
 * La parada se compara donde estaba en `findPath` —después del descarte del
 * rancio y antes del `continue` de las bloqueadas—, pero **no porque las otras
 * dos posiciones den otra cosa**: se probaron las dos y el barrido sale en 0.
 * Antes del descarte es equivalente porque `push` solo entra con `<` estricto,
 * así que dos entradas vivas de la misma clave nunca empatan y el destino sale
 * la primera vez ya con su coste final. Después del `continue` de las
 * bloqueadas también es equivalente, y ahí lo que se paga es tiempo: un destino
 * bloqueado no cortaría nunca y recorrería el mapa entero — y el destino de la
 * IA es casi siempre una mina, un pueblo o un monstruo.
 *
 * Los dos `throw` de `Frontera` siguen intactos y no había por qué tocarlos:
 * no miran la clave, y sigue habiendo **una frontera por búsqueda**.
 */
function dijkstra(map: GameMap, from: Point, parar: Point | null): Reachable {
  const origen = pointKey(from);
  const destino = parar === null ? null : pointKey(parar);

  const coste = new Map<string, number>([[origen, 0]]);
  const previo = new Map<string, Point>();
  const cerradas = new Set<string>();
  const frontera = new Frontera();
  frontera.push(origen, from, 0);

  const bloqueadas = new Set<string>();
  for (const o of map.objects) {
    if (blocksMovement(o)) bloqueadas.add(pointKey(o.at));
  }

  // `pop()` en la condición y no `size > 0` + una aserción: la frontera vacía y
  // el nodo extraído son la misma pregunta, y preguntarla dos veces obligaba a
  // un `as NodoFrontera` sin comprobar dentro de `core`.
  for (let nodo = frontera.pop(); nodo !== undefined; nodo = frontera.pop()) {
    // Borrado perezoso: una mejora de coste empujó un nodo nuevo y dejó a este
    // rancio. No hay *decrease-key*, y no hace falta.
    if (nodo.cost > (coste.get(nodo.key) ?? Infinity)) continue;
    const actualKey = nodo.key;
    cerradas.add(actualKey);

    if (actualKey === destino) break;

    // Desde una casilla bloqueada no se sigue: es final de trayecto. La
    // excepción es el origen — el héroe suele estar ENCIMA de su pueblo o de
    // una mina recién capturada, y tratarlo como muro lo dejaba sin rutas.
    if (bloqueadas.has(actualKey) && actualKey !== origen) continue;

    const actual = nodo.at;
    for (const n of neighbours(map, actual)) {
      const nk = pointKey(n);
      if (cerradas.has(nk) || !isEnterable(map, n)) continue;
      const nuevo = nodo.cost + stepCost(map, actual, n);
      if (nuevo < (coste.get(nk) ?? Infinity)) {
        coste.set(nk, nuevo);
        previo.set(nk, actual);
        frontera.push(nk, n, nuevo);
      }
    }
  }

  return { costs: coste, prev: previo };
}

/**
 * El camino de `from` a `to` sacado de un `Reachable` que ya se recorrió, en
 * vez de volver a recorrer el mapa.
 *
 * Da **exactamente** lo mismo que `findPath(map, from, to)` mientras el alcance
 * salga de ese mismo origen — y desde que los dos Dijkstra son uno (`dijkstra`)
 * lo da por construcción: `findPath` **es** esta función sobre esa búsqueda,
 * con la parada puesta en el destino. Antes del merge también salía igual, y
 * ese argumento está escrito arriba porque es el que sostuvo el merge.
 *
 * Los `null` son los de `findPath`, uno a uno. El de `inBounds(from)` es el
 * único que no se puede deducir del alcance: un Dijkstra lanzado desde fuera
 * del mapa sí encuentra vecinos dentro, y esto devolvería un camino donde
 * `findPath` dice que no hay ninguno.
 */
export function pathFromReachable(
  map: GameMap,
  alcance: Reachable,
  from: Point,
  to: Point,
): PathStep[] | null {
  if (!inBounds(map, from) || !inBounds(map, to)) return null;
  const origen = pointKey(from);
  const destino = pointKey(to);
  if (origen === destino) return [];

  const total = alcance.costs.get(destino);
  // No asentado: inalcanzable, o no pisable — `reachableFrom` no lo asienta.
  if (total === undefined) return null;

  const pasos: PathStep[] = [];
  let clave = destino;
  let at = to;
  while (clave !== origen) {
    pasos.unshift({ at, cost: alcance.costs.get(clave) as number });
    const anterior = alcance.prev.get(clave);
    // Se retrocedió hasta la raíz del árbol de predecesores y no era `from`:
    // el alcance es de OTRO origen. Se dice en vez de devolver medio camino.
    if (anterior === undefined) {
      throw new Error(`el alcance no viene de (${from.x},${from.y}): no lleva hasta ahí`);
    }
    at = anterior;
    clave = pointKey(at);
  }
  return pasos;
}

/** Casillas visibles desde `p` con radio `radius` (distancia de Chebyshev). */
export function visibleFrom(map: GameMap, p: Point, radius: number): string[] {
  const out: string[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (inBounds(map, q)) out.push(pointKey(q));
    }
  }
  return out;
}

export function createEmptyMap(
  width: number,
  height: number,
  fill: TerrainKind = 'grass',
): GameMap {
  return {
    width,
    height,
    terrain: new Array<TerrainKind>(width * height).fill(fill),
    roads: new Set<string>(),
    objects: [],
  };
}
