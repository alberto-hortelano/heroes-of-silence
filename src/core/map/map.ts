/**
 * Mapa de aventura: una cuadrícula de terreno con objetos encima.
 *
 * A diferencia de la batalla (hexágonos), el mapa es cuadrado y se recorre en
 * ocho direcciones, como HoMM2.
 *
 * Aquí, cómo se recorre: lo que se pisa, lo que cuesta y el Dijkstra. Su forma
 * (`GameMap`, `MapObject`), en `tipos.ts`; su red de caminos, en
 * `red-de-caminos.ts`, y la clave de una casilla (`pointKey`), en `geometria.ts`
 * (estaban aquí hasta la fase N de la reorganización, 07-11-2026).
 */
import type { Point } from '../types.js';
import { Frontera } from './frontera.js';
import { pointKey } from './geometria.js';
import {
  enAlgunRecinto,
  FUERA,
  MURO,
  muroBlocker,
  pasoPermitido,
  pasosDelMapa,
  tramoDelRecinto,
} from './recinto.js';
import { dentroDelMapa, RedDeCaminos, type TramoDeCamino } from './red-de-caminos.js';
import {
  type Barrera,
  costeDeEntrada,
  esBarrera,
  isWalkable,
  type TerrainKind,
} from './terrain.js';
import type { GameMap, MapObject } from './tipos.js';

/**
 * Las barreras sobre las que puede ir un pueblo en el muro (pueblos en un nodo,
 * fase 3, 05-11-2026): las de tierra. Ni el agua, cuyo paso es un puente, ni la
 * muralla, cuyo paso es su puerta: la escena no tiene dónde poner el pueblo en
 * ninguno de los dos.
 */
export const BARRERAS_DEL_PUEBLO: readonly Barrera[] = ['mountain', 'forest', 'cliff'];

/**
 * Lo que **cruza su barrera**: un paso, o un pueblo en un nodo (el que lleva
 * `barrera`). Se cruza por su eje y corta lo que se pisa, así que el trazado y la
 * escena lo tratan como un paso. **No es la pregunta «¿es un nodo?»**: una ciudad
 * en el muro también es un nodo y no cruza nada por su eje (se entra por las
 * puertas de su recinto); eso lo dice la red (`sitioEnUnNodo`, `NodoDeRed.clase`).
 */
export type CruzaSuBarrera =
  | Extract<MapObject, { kind: 'node' }>
  | (Extract<MapObject, { kind: 'village' }> & { readonly barrera: Barrera });

/** Si el objeto `o` cruza su barrera (`CruzaSuBarrera`): un paso, o un pueblo con su barrera. */
export function cruzaSuBarrera(o: MapObject): o is CruzaSuBarrera {
  return o.kind === 'node' || (o.kind === 'village' && o.barrera !== null);
}

/** La casilla de un índice plano `y*width+x`; la inversa de `p.y * width + p.x`. */
export const aPunto = (i: number, width: number): Point => ({
  x: i % width,
  y: (i - (i % width)) / width,
});

/**
 * Los tramos de un camino escrito como casillas —el del plan del agente—, con
 * la regla con la que se pintaba antes de #153: dos casillas de camino vecinas
 * se unen, y en diagonal solo si ninguna de sus dos esquinas es camino (si lo
 * es, el trazo pasa por ella). Una casilla sin vecina de camino va en
 * `sueltas`, para que siga abaratando el paso. **Lanza** con una casilla fuera
 * del mapa, como `RedDeCaminos.desdeTramos`: `validateMapPlan` la rechaza antes.
 *
 * En el recinto de una de `ciudades` (la ciudad amurallada, fase 2), solo se
 * unen un acceso con su puerta y la puerta con la ciudad (`tramoDelRecinto`):
 * dos puertas vecinas, o una puerta y el acceso de la de al lado, no. Y lo del
 * recinto no hace de esquina para un tramo que entra en él: la puerta del
 * noreste llega a la ciudad en diagonal aunque la del norte también sea camino.
 */
export function tramosDeCasillas(
  puntos: readonly Point[],
  width: number,
  height: number,
  ciudades: readonly Point[] = [],
): { tramos: TramoDeCamino[]; sueltas: Point[] } {
  const caminos = new Set<number>();
  for (const p of puntos) {
    dentroDelMapa(p, width, height);
    caminos.add(p.y * width + p.x);
  }
  const conTramo = new Set<number>();
  const tramos: TramoDeCamino[] = [];
  for (const i of caminos) {
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of LADOS_DE_ARISTA) {
      const nx = x + dx;
      const ny = y + dy;
      const j = ny * width + nx;
      if (nx < 0 || nx >= width || ny >= height || !caminos.has(j)) continue;
      const delRecinto = tramoDelRecinto(ciudades, { x, y }, { x: nx, y: ny });
      if (delRecinto === false) continue;
      const esquina = (ex: number, ey: number): boolean =>
        caminos.has(ey * width + ex) &&
        (delRecinto === null || !enAlgunRecinto(ciudades, { x: ex, y: ey }));
      if (dx !== 0 && dy !== 0 && (esquina(nx, y) || esquina(x, ny))) continue;
      tramos.push([aPunto(i, width), aPunto(j, width)]);
      conTramo.add(i).add(j);
    }
  }
  const sueltas = [...caminos].filter((i) => !conTramo.has(i)).map((i) => aPunto(i, width));
  return { tramos, sueltas };
}
const LADOS_DE_ARISTA = [
  [1, 0],
  [0, 1],
  [1, 1],
  [-1, 1],
] as const;

export function inBounds(map: Pick<GameMap, 'width' | 'height'>, p: Point): boolean {
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

/**
 * ¿Bloquea el paso este objeto? Solo un monstruo en pie.
 *
 * Bloqueaba también el castillo, y con el mapa de nodos dejó de hacerlo: el
 * castillo **es un nodo**: es el paso entre dos o más
 * regiones, así que si bloqueara cortaría la red justo donde la red pasa; las
 * regiones de detrás solo se alcanzarían parando en él y volviendo a salir.
 * Pisarlo de camino hace lo que hacía pisarlo de destino: batalla contra la
 * guarnición, captura si está vacío o recoger la tropa si es tuyo.
 */
export function blocksMovement(o: MapObject): boolean {
  return o.kind === 'monster' && !o.defeated;
}

/**
 * ¿Se puede terminar el movimiento aquí? Un objeto recogible se pisa (y se
 * recoge); un monstruo se "pisa" para desencadenar la batalla. En el recinto de
 * una ciudad, solo la ciudad y sus puertas, aunque debajo haya barrera; su
 * muralla no, aunque debajo haya pradera (`recinto.ts`).
 *
 * Con `pisaBarreras`, lo que pisa quien se infiltra (`hero/infiltracion.ts`):
 * también las cinco barreras fuera de un recinto; la muralla, tampoco. **La única
 * regla de qué casilla se pisa**, también para el destino de `findPath`.
 */
export function isEnterable(map: GameMap, p: Point, pisaBarreras = false): boolean {
  if (!inBounds(map, p)) return false;
  const rol = pasosDelMapa(map)?.rol[p.y * map.width + p.x] ?? FUERA;
  if (rol !== FUERA) return rol !== MURO;
  return pisaBarreras || isWalkable(terrainAt(map, p));
}

/**
 * La barrera de `p` que pisaría quien se infiltra, o `null` si no lo es: fuera
 * del mapa, en un recinto (su muralla no es una barrera y no se abre; la ciudad
 * y sus puertas se pisan como una calle) o en lo que se pisa. Para nombrarla o
 * decir que cuesta el día entero (`porQueNoLlega`, `moveHero`): qué se pisa lo
 * dice `isEnterable`.
 */
export function barreraEn(map: GameMap, p: Point): Barrera | null {
  if (!inBounds(map, p) || (pasosDelMapa(map)?.rol[p.y * map.width + p.x] ?? FUERA) !== FUERA) {
    return null;
  }
  const terreno = terrainAt(map, p);
  return esBarrera(terreno) ? terreno : null;
}

/**
 * ¿Se pasa de `desde` a su vecina `hasta`? Fuera de los recintos de las
 * ciudades, siempre; en uno, solo de un acceso a su puerta y de la puerta a la
 * ciudad (`pasoPermitido`). Lo que no se pisa lo dice `isEnterable`. Es la regla
 * del Dijkstra para quien recorre las vecinas por su cuenta (`casillaDeVuelta`).
 */
export function sePasa(map: GameMap, desde: Point, hasta: Point): boolean {
  const pasos = pasosDelMapa(map);
  return (
    pasos === null ||
    pasoPermitido(pasos, desde.y * map.width + desde.x, hasta.y * map.width + hasta.x)
  );
}

/**
 * Coste de entrar en `to` viniendo de `from`: la lectura legible de
 * `costeDeEntrada`, que vive con sus constantes en `terrain.ts`. El Dijkstra usa
 * la de allí directamente para precalcular sus dos tablas por casilla, y desde
 * este ciclo también la usa el contrato para decirle al agente lo que le va a
 * costar cada paso — tres lectores y una sola fórmula. Con `barrera`, la de quien
 * se infiltra: una casilla de barrera cuesta eso, recta u oblicua, como en el
 * Dijkstra (`reachableFrom(…, barrera)`).
 */
export function stepCost(
  map: GameMap,
  from: Point,
  to: Point,
  barrera: number | null = null,
): number {
  const terreno = terrainAt(map, to);
  const diagonal = from.x !== to.x && from.y !== to.y;
  const pasos = pasosDelMapa(map);
  if (pasos !== null) {
    const i = from.y * map.width + from.x;
    const j = to.y * map.width + to.x;
    if (!pasoPermitido(pasos, i, j)) {
      throw new Error(
        muroBlocker(map, to) ??
          `no se pasa de (${from.x},${from.y}) a (${to.x},${to.y}): a una ciudad se entra desde un acceso de una de sus puertas, y de la puerta a ella`,
      );
    }
    // La puerta y la ciudad, como una calle, aunque debajo haya barrera.
    if (pasos.rol[j] !== FUERA) return costeDeEntrada('grass', true, diagonal);
  }
  if (!isWalkable(terreno)) {
    if (barrera !== null) return barrera;
    throw new Error(`no se entra en (${to.x},${to.y}): es ${terreno}, y una barrera no se pisa`);
  }
  return costeDeEntrada(terreno, map.caminos.tiene(to), diagonal);
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
 * destino: así se recoge un cofre o se ataca a un monstruo.
 *
 * Las tres guardias se quedan aquí delante, incluida la de `isEnterable(to)`
 * que `pathFromReachable` sabría contestar sola: sin ella, un destino no
 * pisable haría recorrer el mapa ENTERO para acabar devolviendo `null`.
 */
export function findPath(
  map: GameMap,
  from: Point,
  to: Point,
  hostiles: readonly Point[] = [],
  barrera: number | null = null,
): PathStep[] | null {
  if (!inBounds(map, from) || !inBounds(map, to)) return null;
  if (pointKey(from) === pointKey(to)) return [];
  if (!isEnterable(map, to, barrera !== null)) return null;

  return pathFromReachable(map, dijkstra(map, from, to, hostiles, null, barrera), from, to);
}

/**
 * Lo que sabe una pasada de Dijkstra desde un origen: lo que cuesta llegar a
 * cada casilla y por dónde se llega.
 *
 * `previos` va siempre y no tras una bandera: construirlo no se paga aparte
 * —es una escritura en la misma rama que ya escribe el coste— y una bandera
 * que cambia la forma del retorno obliga a todos los llamantes a estrechar un
 * tipo para pedir algo que sale gratis.
 *
 * **Habla en índices planos** (`y * ancho + x`, el de `GameMap.terrain`), las
 * mismas tablas que el Dijkstra usa por dentro, entregadas tal cual. Antes la
 * salida se copiaba a dos `Map<string, …>` por `"x,y"` (#94): 422-461 ms de
 * ~7 000 en `pnpm banco` (2026-10-08) solo en construirlos, más el `pointKey`
 * de cada lectura. Se lee con `costeEnElAlcance` y `casillaDelIndice`.
 */
export interface Reachable {
  /** Ancho del mapa del que sale: lo que convierte una casilla en su índice. */
  readonly ancho: number;
  /** Coste de llegar a cada casilla, por índice; −1 = no se llega. */
  readonly costes: Int32Array;
  /** De qué índice se llega a cada uno; −1 = el origen, que no viene de nada, o no se llega. */
  readonly previos: Int32Array;
  /**
   * Los índices a los que se llega, en orden de **primer descubrimiento** (el
   * origen, el primero). Es el orden de inserción que tenían los `Map` de
   * antes, y de él cuelgan los goldens que recorren el alcance en orden.
   */
  readonly descubiertas: readonly number[];
}

/**
 * El índice de `p` en el alcance, o −1 si cae fuera de su mapa. Con claves
 * `"x,y"` una casilla de fuera simplemente no estaba; con un índice plano
 * `(-1,5)` cae en la fila de arriba, así que el límite se mira aquí.
 */
function indiceEnElAlcance(alcance: Reachable, p: Point): number {
  const alto = alcance.costes.length / alcance.ancho;
  if (p.x < 0 || p.y < 0 || p.x >= alcance.ancho || p.y >= alto) return -1;
  return p.y * alcance.ancho + p.x;
}

/** Lo que cuesta llegar a `p`, o `null` si no se llega (o cae fuera del mapa). */
export function costeEnElAlcance(alcance: Reachable, p: Point): number | null {
  const i = indiceEnElAlcance(alcance, p);
  if (i === -1) return null;
  const c = alcance.costes[i] as number;
  return c === -1 ? null : c;
}

/** La casilla de un índice del alcance. */
export function casillaDelIndice(alcance: Reachable, i: number): Point {
  const x = i % alcance.ancho;
  return { x, y: (i - x) / alcance.ancho };
}

/**
 * Coste de llegar a cada casilla desde `from`, en una sola pasada de Dijkstra,
 * **y por dónde**.
 *
 * Existe porque la IA necesita comparar decenas de destinos por turno: llamar a
 * `findPath` una vez por candidato multiplica el mismo trabajo por treinta.
 * Las casillas bloqueadas (los monstruos en pie) se registran con su coste
 * de entrada pero no se expanden: se puede llegar a ellas, no atravesarlas.
 *
 * Los predecesores son lo que evita el SEGUNDO recorrido: quien ya llamó aquí
 * para elegir a dónde ir no necesita relanzar `findPath` para saber por dónde
 * se va — retrocede por `previos` desde el destino. Se llamaba `reachableCosts`, y
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
export function reachableFrom(
  map: GameMap,
  from: Point,
  hostiles: readonly Point[] = [],
  prohibidas: Uint8Array | null = null,
  barrera: number | null = null,
): Reachable {
  return dijkstra(map, from, null, hostiles, prohibidas, barrera);
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
 * pueda ir a por un pueblo o un monstruo. Se probó a mano: pone en rojo los dos
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
 * IA es casi siempre un nodo, un pueblo o un monstruo.
 *
 * Los dos `throw` de `Frontera` siguen intactos y no había por qué tocarlos:
 * no miran la clave, y sigue habiendo **una frontera por búsqueda**.
 */
function dijkstra(
  map: GameMap,
  from: Point,
  parar: Point | null,
  hostiles: readonly Point[],
  prohibidas: Uint8Array | null,
  barrera: number | null,
): Reachable {
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
  // un nodo cambia de dueño, que es la clase de estado que este repositorio no
  // quiere. Se pagan enteras en cada búsqueda y aun así sale a cuenta: medido
  // en `pnpm banco`, 3402 → 1611 ms de mediana en tres pasadas intercaladas,
  // **2,11×**, con el sha256 del volcado intacto.
  if (barrera !== null && (!Number.isSafeInteger(barrera) || barrera <= 0)) {
    throw new Error(`el precio de una barrera tiene que ser un entero positivo: ${barrera}`);
  }
  const pisable = new Uint8Array(casillas);
  const recto = new Int32Array(casillas);
  const oblicuo = new Int32Array(casillas);
  for (let i = 0; i < casillas; i++) {
    const terreno = map.terrain[i] as TerrainKind;
    if (!isWalkable(terreno)) {
      // Una barrera no tiene precio: se queda en 0 y no se lee, porque no se
      // pisa. Salvo para quien se infiltra (`hero/infiltracion.ts`), que la pisa
      // a un día entero por casilla, recto u oblicuo: lo que valga `barrera`, su
      // marcha del día. Los caminos de abajo no la abaratan (no abren barreras) y
      // el recinto, después, vuelve a cerrar su muralla aunque debajo haya
      // montaña. Con `null` (todo el que no se infiltra, la IA de hoy y el banco)
      // las tablas y el orden de descubrimiento son los de siempre.
      if (barrera !== null) {
        pisable[i] = 1;
        recto[i] = barrera;
        oblicuo[i] = barrera;
      }
      continue;
    }
    pisable[i] = 1;
    recto[i] = costeDeEntrada(terreno, false, false);
    oblicuo[i] = costeDeEntrada(terreno, false, true);
  }
  // Las casillas con camino, por índice: la red las trae ya dentro del mapa.
  for (const i of map.caminos.indices) {
    const terreno = map.terrain[i] as TerrainKind;
    // Un camino pintado sobre una barrera no la abre ni la abarata: se queda como está.
    if (!isWalkable(terreno)) continue;
    recto[i] = costeDeEntrada(terreno, true, false);
    oblicuo[i] = costeDeEntrada(terreno, true, true);
  }
  // El recinto de cada ciudad (`recinto.ts`): su muralla no se pisa, aunque
  // debajo haya pradera, y la ciudad y sus puertas sí, aunque haya barrera, y
  // cuestan como una calle. Por dónde se pasa lo dice `pasoPermitido` en el
  // bucle de las vecinas.
  const recinto = pasosDelMapa(map);
  for (const i of recinto?.delRecinto ?? []) {
    if (recinto?.rol[i] === MURO) {
      pisable[i] = 0;
      continue;
    }
    pisable[i] = 1;
    recto[i] = costeDeEntrada('grass', true, false);
    oblicuo[i] = costeDeEntrada('grass', true, true);
  }
  const bloqueada = new Uint8Array(casillas);
  for (const o of map.objects) {
    if (!blocksMovement(o) || !inBounds(map, o.at)) continue;
    bloqueada[o.at.y * ancho + o.at.x] = 1;
  }
  // Lo hostil de la partida —un héroe ajeno, un castillo ajeno guarnecido— se
  // trata igual que un monstruo en pie: se llega, no se cruza. El mapa no sabe
  // de héroes ni de guarniciones, así que se lo dice quien sí (`casillasHostiles`
  // en `game.ts`). Solo cambia `bloqueada`: el orden de descubrimiento y la
  // frontera son los de siempre, y el desempate no se entera.
  for (const p of hostiles) {
    if (inBounds(map, p)) bloqueada[p.y * ancho + p.x] = 1;
  }
  // Y lo que quien llama no quiere ni pisar —las regiones enteras donde a un
  // héroe lo emboscarían—: se trata como un muro, no como un final de
  // trayecto, porque pisar la primera casilla ya es la emboscada. El origen se
  // respeta aunque venga marcado: desde donde se está siempre se sale. Una
  // marca por casilla y no una lista de puntos, que eran 1,66 M de `Point` en
  // el banco para decir lo mismo. Solo cambia `pisable`, como un muro: el orden
  // de descubrimiento y la frontera son los de siempre.
  if (prohibidas !== null) {
    if (prohibidas.length !== casillas) {
      throw new Error(
        `la marca de casillas prohibidas tiene ${prohibidas.length} casillas y el mapa ${casillas}`,
      );
    }
    for (let i = 0; i < casillas; i++) if (prohibidas[i] === 1 && i !== origen) pisable[i] = 0;
  }

  // −1 es «sin coste todavía»: los costes reales son siempre > 0 salvo el del
  // origen, que es 0, así que el centinela no pisa ningún valor legítimo.
  const coste = new Int32Array(casillas).fill(-1);
  const previo = new Int32Array(casillas).fill(-1);
  const cerrada = new Uint8Array(casillas);
  // El orden de PRIMER descubrimiento, que es el orden de inserción que tenían
  // los `Map` de antes y que sale en `Reachable.descubiertas`. De él cuelgan el
  // golden de `frontera.test.ts` y tres sitios de `agent-link.test.ts` que
  // ordenan con `Array.sort`, que es estable: sin reproducirlo, la salida
  // tendría los mismos pares en otro orden.
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
    // excepción es el origen. Desde el mapa de nodos solo bloquea un monstruo
    // en pie, y un héroe no empieza encima de uno; la excepción se queda porque
    // es la regla de siempre y no cuesta nada.
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
        if (recinto !== null && !pasoPermitido(recinto, actual, vecina)) continue;

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

  return { ancho, costes: coste, previos: previo, descubiertas };
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
  if (alcance.costes.length !== map.width * map.height || alcance.ancho !== map.width) {
    throw new Error(
      `el alcance es de un mapa de ${alcance.costes.length} casillas y ${alcance.ancho} de ancho, ` +
        `y este mide ${map.width}×${map.height}`,
    );
  }
  const origen = from.y * map.width + from.x;
  const destino = to.y * map.width + to.x;
  if (origen === destino) return [];

  // No asentado: inalcanzable, o no pisable — `reachableFrom` no lo asienta.
  if (alcance.costes[destino] === -1) return null;

  const pasos: PathStep[] = [];
  let i = destino;
  while (i !== origen) {
    pasos.push({ at: casillaDelIndice(alcance, i), cost: alcance.costes[i] as number });
    const anterior = alcance.previos[i] as number;
    // Se retrocedió hasta la raíz del árbol de predecesores y no era `from`:
    // el alcance es de OTRO origen. Se dice en vez de devolver medio camino.
    if (anterior === -1) {
      throw new Error(`el alcance no viene de (${from.x},${from.y}): no lleva hasta ahí`);
    }
    i = anterior;
  }
  // Del destino hacia atrás y se da la vuelta una vez: el `unshift` de antes
  // movía el array entero en cada paso.
  return pasos.reverse();
}

/**
 * Desde dónde mira alguien y hasta dónde: el cuadrado de Chebyshev que marca
 * `Casillas.marcarCuadrado`. Es lo que un jugador mira escrito sin levantar las claves, para
 * quien pregunta por una casilla o una región y no por todo lo visible.
 */
export interface Mirada {
  readonly centro: Point;
  readonly radio: number;
}

export function createEmptyMap(
  width: number,
  height: number,
  fill: TerrainKind = 'grass',
): GameMap {
  return {
    width,
    height,
    regions: [],
    terrain: new Array<TerrainKind>(width * height).fill(fill),
    caminos: RedDeCaminos.vacia(width, height),
    objects: [],
  };
}
