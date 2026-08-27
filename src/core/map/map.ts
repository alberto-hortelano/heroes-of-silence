/**
 * Mapa de aventura: una cuadrícula de terreno con objetos encima.
 *
 * A diferencia de la batalla (hexágonos), el mapa es cuadrado y se recorre en
 * ocho direcciones, como HoMM2.
 */
import type { Point, ResourceKind } from '../types.js';
import { Frontera } from './frontera.js';
import { costeDeEntrada, isWalkable, type TerrainKind } from './terrain.js';

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

/**
 * La inversa de `pointKey`, escrita **una vez**.
 *
 * Estaba abierta a mano donde hacía falta —el bucle de caminos de
 * `movableCosts`, con su `indexOf(',')` y sus dos `Number`— y volvió a hacer
 * falta en cuanto `serializeKnownMap` dejó de mandarle al agente la clave de
 * almacenamiento y le mandó el punto. Dos aperturas de la misma cadena es la
 * clase de copia que se queda atrás el día que la clave deje de ser `"x,y"`.
 *
 * **Lanza** en vez de devolver un punto con `NaN`: toda clave del sistema sale
 * de `pointKey`, así que una que no se pueda leer es un fallo de programa y no
 * un dato del jugador. El único llamante que se saltaba claves lo hacía por
 * estar **fuera del mapa**, que es otra pregunta y sigue siendo suya.
 */
export function pointFromKey(clave: string): Point {
  const coma = clave.indexOf(',');
  const p = { x: Number(clave.slice(0, coma)), y: Number(clave.slice(coma + 1)) };
  // Se valida por **round-trip** y no mirando los trozos por separado: la
  // inversa de `pointKey` es, por definición, lo que vuelve a dar la misma
  // clave. Así cae de una vez la mitad vacía —`Number("")` es **0**, no `NaN`,
  // así que `"3,"` colaba como (3,0)—, el `NaN` y el `"03,7"`. El `isInteger` va
  // aparte porque `"3.5,7"` sí round-trippea consigo mismo.
  if (coma < 0 || !Number.isInteger(p.x) || !Number.isInteger(p.y) || pointKey(p) !== clave) {
    throw new Error(`"${clave}" no es una casilla: se esperaba "x,y" con dos enteros`);
  }
  return p;
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

/**
 * Coste de entrar en `to` viniendo de `from`: la lectura legible de
 * `costeDeEntrada`, que vive con sus constantes en `terrain.ts`. El Dijkstra usa
 * la de allí directamente para precalcular sus dos tablas por casilla, y desde
 * este ciclo también la usa el contrato para decirle al agente lo que le va a
 * costar cada paso — tres lectores y una sola fórmula.
 */
export function stepCost(map: GameMap, from: Point, to: Point): number {
  return costeDeEntrada(
    terrainAt(map, to),
    map.roads.has(pointKey(to)),
    from.x !== to.x && from.y !== to.y,
  );
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
  const ancho = map.width;
  const casillas = ancho * map.height;

  // Fail-loud, y con el índice plano no es opcional: `(-1,-1)` da un índice
  // negativo, que un `Int32Array` tira en silencio. Con claves `"x,y"` esto
  // "funcionaba" —asentaba el origen de fuera y sus vecinos de dentro— porque
  // una cadena admite cualquier cosa, no porque nadie lo hubiera decidido.
  // `terrainAt` lleva desde siempre lanzando por lo mismo.
  if (!inBounds(map, from)) throw new Error(`(${from.x},${from.y}) está fuera del mapa`);
  const origen = from.y * ancho + from.x;
  const destino = parar === null ? -1 : parar.y * ancho + parar.x;

  // Las cuatro tablas por casilla, **reconstruidas en cada llamada**: `GameMap`
  // es dato y cachearlas allí obligaría a invalidarlas cuando un monstruo cae o
  // una mina cambia de dueño, que es la clase de estado que este repositorio no
  // quiere. Se pagan enteras en cada búsqueda y aun así sale a cuenta: medido
  // en `pnpm banco`, 3402 → 1611 ms de mediana en tres pasadas intercaladas,
  // **2,11×**, con el sha256 del volcado intacto.
  const pisable = new Uint8Array(casillas);
  const recto = new Int32Array(casillas);
  const oblicuo = new Int32Array(casillas);
  for (let i = 0; i < casillas; i++) {
    const terreno = map.terrain[i] as TerrainKind;
    if (isWalkable(terreno)) pisable[i] = 1;
    recto[i] = costeDeEntrada(terreno, false, false);
    oblicuo[i] = costeDeEntrada(terreno, false, true);
  }
  // Los caminos vienen por clave, así que aquí sí se abre una cadena — pero
  // una por casilla CON camino, no una por casilla del mapa. Una clave que no
  // sea una casilla de este mapa se salta, que es lo que hacía el `roads.has`
  // de antes: nunca se le preguntaba por una casilla de fuera. Lo que ya no se
  // abre aquí es la clave: eso lo hace `pointFromKey`, que es la inversa de
  // `pointKey` y vive a su lado.
  for (const clave of map.roads) {
    const { x, y } = pointFromKey(clave);
    if (x < 0 || x >= ancho || y < 0 || y >= map.height) continue;
    const i = y * ancho + x;
    recto[i] = costeDeEntrada(map.terrain[i] as TerrainKind, true, false);
    oblicuo[i] = costeDeEntrada(map.terrain[i] as TerrainKind, true, true);
  }
  const bloqueada = new Uint8Array(casillas);
  for (const o of map.objects) {
    if (!blocksMovement(o) || !inBounds(map, o.at)) continue;
    bloqueada[o.at.y * ancho + o.at.x] = 1;
  }

  // −1 es «sin coste todavía»: los costes reales son siempre > 0 salvo el del
  // origen, que es 0, así que el centinela no pisa ningún valor legítimo.
  const coste = new Int32Array(casillas).fill(-1);
  const previo = new Int32Array(casillas).fill(-1);
  const cerrada = new Uint8Array(casillas);
  // El orden de PRIMER descubrimiento, que es el orden de inserción que tenían
  // los `Map` de antes. De él cuelgan el golden de `frontera.test.ts` y tres
  // sitios de `agent-link.test.ts` que ordenan con `Array.sort`, que es estable:
  // sin reproducirlo, la salida tendría los mismos pares en otro orden.
  const descubiertas: number[] = [origen];

  coste[origen] = 0;
  const frontera = new Frontera(casillas);
  frontera.push(origen, 0);

  // `pop()` en la condición y no `size > 0` + una aserción: la frontera vacía y
  // el nodo extraído son la misma pregunta, y preguntarla dos veces obligaba a
  // un `as NodoFrontera` sin comprobar dentro de `core`.
  for (let nodo = frontera.pop(); nodo !== undefined; nodo = frontera.pop()) {
    const actual = nodo.key;
    // Borrado perezoso: una mejora de coste empujó un nodo nuevo y dejó a este
    // rancio. No hay *decrease-key*, y no hace falta.
    if (nodo.cost > (coste[actual] as number)) continue;
    cerrada[actual] = 1;

    if (actual === destino) break;

    // Desde una casilla bloqueada no se sigue: es final de trayecto. La
    // excepción es el origen — el héroe suele estar ENCIMA de su pueblo o de
    // una mina recién capturada, y tratarlo como muro lo dejaba sin rutas.
    if (bloqueada[actual] === 1 && actual !== origen) continue;

    const x = actual % ancho;
    const y = (actual - x) / ancho;
    // Las ocho vecinas, `dy` por fuera y `dx` por dentro. **Ese orden es el
    // desempate**: de él sale el número de orden de cada casilla. No es una
    // preferencia de escritura — viene de la `neighbours` que este commit borró
    // (construía un `Point[]` por casilla extraída, para tirarlo enseguida) y
    // cambiarlo cambia las partidas.
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= map.height) continue;
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        if (nx < 0 || nx >= ancho) continue;

        const vecina = ny * ancho + nx;
        if (cerrada[vecina] === 1 || pisable[vecina] === 0) continue;

        const paso = dx !== 0 && dy !== 0 ? (oblicuo[vecina] as number) : (recto[vecina] as number);
        const nuevo = nodo.cost + paso;
        const anterior = coste[vecina] as number;
        if (anterior !== -1 && nuevo >= anterior) continue;

        if (anterior === -1) descubiertas.push(vecina);
        coste[vecina] = nuevo;
        previo[vecina] = actual;
        frontera.push(vecina, nuevo);
      }
    }
  }

  // La salida sigue hablando en `"x,y"`, y en el orden de siempre: quien la lee
  // —`chooseHeroDestination`, `stepTowards`, los tests— no se entera de que por
  // dentro esto es aritmética. Cambiar también la salida vale más —el prototipo
  // del issue medía 6,5 puntos por encima de esta variante— pero arrastra a
  // `stepTowards`, a `chooseHeroDestination` y a los seis goldens que
  // certifican que esto no movió nada; es otro issue, no este commit.
  const costs = new Map<string, number>();
  const prev = new Map<string, Point>();
  for (const i of descubiertas) {
    const x = i % ancho;
    const y = (i - x) / ancho;
    costs.set(`${x},${y}`, coste[i] as number);
    const p = previo[i] as number;
    if (p === -1) continue;
    const px = p % ancho;
    prev.set(`${x},${y}`, { x: px, y: (p - px) / ancho });
  }
  return { costs, prev };
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
