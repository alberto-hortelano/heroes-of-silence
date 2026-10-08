/**
 * Mapa de aventura: una cuadrícula de terreno con objetos encima.
 *
 * A diferencia de la batalla (hexágonos), el mapa es cuadrado y se recorre en
 * ocho direcciones, como HoMM2.
 */
import type { Point, ResourceKind } from '../types.js';
import { Frontera } from './frontera.js';
import {
  type Barrera,
  costeDeEntrada,
  isWalkable,
  type Nivel,
  type TerrainKind,
} from './terrain.js';

export type MapObject =
  | {
      /**
       * Una mina **no tiene dueño propio**: produce para el dueño de la región
       * en la que está (`regionOwner`), si esa región sigue conectada a su base.
       * Antes se tomaba pisando la bandera; desde el mapa de nodos el territorio
       * se gana cerrando la región, y una bandera aquí sería una segunda copia
       * de un hecho que ya se deriva de los nodos.
       */
      readonly kind: 'mine';
      readonly id: string;
      readonly at: Point;
      readonly resource: ResourceKind;
    }
  | {
      /**
       * Un paso entre regiones (`regiones.ts`). Se toma **pisándolo**, de camino
       * o parando en él, igual que se tomaba antes la bandera de una mina, y
       * `owner` es el único sitio donde vive su dueño: lo escribe `captureNode`
       * y nadie más. No bloquea el paso: es un paso.
       */
      readonly kind: 'node';
      readonly id: string;
      readonly at: Point;
      owner: number | null;
      /**
       * La barrera que cruza: la del muro que el plan escribe bajo el nodo y
       * que `buildMap` abre (#145). La lee el escenógrafo para su pieza —el
       * puente, si es agua—; antes la deducía de las ocho vecinas, y en un
       * empate se inventaba un río (#187). No cambia qué se pisa.
       */
      readonly barrera: Barrera;
    }
  | {
      /**
       * Un pueblo: está DENTRO de una región y es de quien la tenga. Sin dueño
       * guardado, por la misma razón que la mina. Lo que produce es de la fase 3.
       */
      readonly kind: 'village';
      readonly id: string;
      readonly name: string;
      readonly at: Point;
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

/**
 * Una región declarada: su id, su nombre, una casilla suya (la semilla) y su
 * nivel de altura.
 *
 * La región **no se guarda casilla a casilla**: es la componente del terreno
 * pisable, sin nodos, que contiene esa casilla, y la calcula `estructura`
 * (`regiones.ts`). Lo único que el mapa necesita recordar es cómo se llama y
 * dónde está, para poder nombrarla en un mensaje y para que dos productores de
 * mapas no tengan que ponerse de acuerdo en numerarlas.
 */
export interface MapRegion {
  readonly id: string;
  readonly name: string;
  readonly at: Point;
  /**
   * A qué altura está (#143). Sin efecto en las reglas: el generador lo sortea
   * antes que las barreras —que dependen de él— y el escenógrafo lo pinta. Un
   * plan del agente no lo declara todavía y sus regiones van todas al 1.
   */
  readonly nivel: Nivel;
}

export interface GameMap {
  readonly width: number;
  readonly height: number;
  /**
   * Las regiones del mapa de nodos. Vacío en un mapa que no las tiene —los de
   * algunos tests de pathfinding—, y entonces no hay territorio que calcular.
   */
  readonly regions: readonly MapRegion[];
  /** Terreno por casilla, en orden de filas. */
  readonly terrain: TerrainKind[];
  /**
   * Los caminos: los tramos que se pintan y, derivadas de ellos, las casillas
   * que abaratan el paso. Un solo campo para los dos hechos, para que no puedan
   * discrepar (#153).
   */
  readonly caminos: RedDeCaminos;
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

/** La casilla de un índice plano `y*width+x`; la inversa de `p.y * width + p.x`. */
export const aPunto = (i: number, width: number): Point => ({
  x: i % width,
  y: (i - (i % width)) / width,
});

/** Un tramo de camino: dos casillas 8-vecinas distintas. */
export type TramoDeCamino = readonly [Point, Point];

/**
 * La red de caminos de un mapa: los **tramos** son el hecho y las casillas se
 * derivan de ellos. Un camino de una sola casilla no tiene trazo: va en
 * `sueltas`, que abarata el paso pero no se pinta.
 *
 * Antes el mapa guardaba casillas y el pintor deducía los tramos por adyacencia
 * (8-vecindad, la diagonal solo si ninguna esquina es camino). Así dos radios
 * vecinos se unían solos y cerraban ~1,2 bucles por mapa que nadie había
 * trazado, y el generador tenía que comprobar lo dibujado y vestir otra vez el
 * mapa cuando un radio rozaba un nodo ajeno (#153). Con los tramos guardados lo
 * que se pinta es lo que se trazó.
 *
 * Constructor privado y campo privado: el campo hace la clase nominal, así que
 * no se puede fabricar una red con las dos caras desiguales a base de un objeto
 * literal. Se entra por `desdeTramos` o por `vacia`, que conocen el mapa: lo
 * que caiga fuera lanza aquí, y no hay que filtrarlo en cada lector.
 */
export class RedDeCaminos {
  private readonly claves: ReadonlySet<string>;
  /** Una marca por índice plano: `stepCost` y el Dijkstra no abren cadenas. */
  private readonly marca: Uint8Array;
  /** Las casillas con camino por índice plano, en el orden de `casillas`. */
  readonly indices: readonly number[];

  private constructor(
    readonly tramos: readonly TramoDeCamino[],
    readonly sueltas: readonly Point[],
    private readonly width: number,
    private readonly height: number,
  ) {
    const claves = new Set<string>();
    const indices: number[] = [];
    const marca = new Uint8Array(width * height);
    for (const p of [...tramos.flat(), ...sueltas]) {
      const i = p.y * width + p.x;
      if (marca[i] === 1) continue;
      marca[i] = 1;
      indices.push(i);
      claves.add(pointKey(p));
    }
    this.claves = claves;
    this.marca = marca;
    this.indices = indices;
  }

  /** Las casillas con camino, por clave "x,y": las de algún tramo y las sueltas. */
  get casillas(): ReadonlySet<string> {
    return this.claves;
  }

  /** ¿Hay camino en esta casilla? Fuera del mapa no lo hay. */
  tiene(p: Point): boolean {
    if (p.x < 0 || p.x >= this.width || p.y < 0 || p.y >= this.height) return false;
    return this.marca[p.y * this.width + p.x] === 1;
  }

  static vacia(width: number, height: number): RedDeCaminos {
    return new RedDeCaminos([], [], width, height);
  }

  /**
   * **Lanza** si una casilla cae fuera del mapa, si un tramo no une dos
   * casillas 8-vecinas distintas, si un tramo se repite o si una suelta está
   * repetida o también en un tramo: todos son fallos de programa, porque los
   * tramos los escribe el generador o los deriva `tramosDeCasillas`, nunca el
   * agente, y lo que el agente escribe fuera del mapa lo rechaza antes
   * `validateMapPlan`.
   *
   * Canoniza: dentro de cada tramo va primero la casilla de fila menor (y de
   * columna menor si comparten fila), y los tramos van ordenados igual. Así el
   * orden en que el pintor encadena las sendas no depende del orden del trazado.
   */
  static desdeTramos(
    tramos: readonly TramoDeCamino[],
    width: number,
    height: number,
    sueltas: readonly Point[] = [],
  ): RedDeCaminos {
    for (const p of [...tramos.flat(), ...sueltas]) dentroDelMapa(p, width, height);
    const canonicos = tramos.map(([p, q]): TramoDeCamino => {
      const lejos = Math.abs(p.x - q.x) > 1 || Math.abs(p.y - q.y) > 1;
      if (lejos || comparaEnLectura(p, q) === 0) {
        throw new Error(
          `el tramo de camino de (${p.x},${p.y}) a (${q.x},${q.y}) no une dos casillas vecinas distintas`,
        );
      }
      return comparaEnLectura(q, p) < 0 ? [q, p] : [p, q];
    });
    canonicos.sort(([a, b], [c, d]) => comparaEnLectura(a, c) || comparaEnLectura(b, d));
    for (let k = 1; k < canonicos.length; k++) {
      const [a, b] = canonicos[k - 1] as TramoDeCamino;
      const [c, d] = canonicos[k] as TramoDeCamino;
      if (comparaEnLectura(a, c) === 0 && comparaEnLectura(b, d) === 0) {
        throw new Error(`el tramo de camino de (${a.x},${a.y}) a (${b.x},${b.y}) está repetido`);
      }
    }
    const conTramo = new Set(canonicos.flat().map(pointKey));
    for (const p of sueltas) {
      if (conTramo.has(pointKey(p))) {
        throw new Error(`el camino suelto de (${p.x},${p.y}) está repetido o ya va en un tramo`);
      }
      conTramo.add(pointKey(p));
    }
    return new RedDeCaminos(canonicos, sueltas, width, height);
  }
}

/**
 * Lanza si una casilla de camino cae fuera del mapa: la red conoce el mapa. Y
 * si no es de enteros: con `NaN` todas las comparaciones de abajo dan falso y
 * la casilla se colaba (lo que llegaba de un cable con un índice de menos).
 */
function dentroDelMapa(p: Point, width: number, height: number): void {
  if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) {
    throw new Error(`el camino de (${p.x},${p.y}) no cae en una casilla: van de enteros`);
  }
  if (p.x < 0 || p.x >= width || p.y < 0 || p.y >= height) {
    throw new Error(`el camino de (${p.x},${p.y}) cae fuera del mapa de ${width}×${height}`);
  }
}

/** Orden de lectura: por fila y, dentro de la fila, por columna. Es el del índice plano. */
function comparaEnLectura(p: Point, q: Point): number {
  return p.y - q.y || p.x - q.x;
}

/**
 * Los tramos de un camino escrito como casillas —el del plan del agente—, con
 * la regla con la que se pintaba antes de #153: dos casillas de camino vecinas
 * se unen, y en diagonal solo si ninguna de sus dos esquinas es camino (si lo
 * es, el trazo pasa por ella). Una casilla sin vecina de camino va en
 * `sueltas`, para que siga abaratando el paso. **Lanza** con una casilla fuera
 * del mapa, como `RedDeCaminos.desdeTramos`: `validateMapPlan` la rechaza antes.
 */
export function tramosDeCasillas(
  puntos: readonly Point[],
  width: number,
  height: number,
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
      if (dx !== 0 && dy !== 0 && (caminos.has(y * width + nx) || caminos.has(ny * width + x)))
        continue;
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
 * Bloqueaban también el castillo y la mina, y con el mapa de nodos los dos
 * dejan de hacerlo por motivos distintos. La mina ya no se toma —no hay nada
 * que hacer en ella—. Y el castillo **es un nodo**: es el paso entre dos o más
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
  const terreno = terrainAt(map, to);
  if (!isWalkable(terreno)) {
    throw new Error(`no se entra en (${to.x},${to.y}): es ${terreno}, y una barrera no se pisa`);
  }
  return costeDeEntrada(terreno, map.caminos.tiene(to), from.x !== to.x && from.y !== to.y);
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
export function findPath(
  map: GameMap,
  from: Point,
  to: Point,
  hostiles: readonly Point[] = [],
): PathStep[] | null {
  if (!inBounds(map, from) || !inBounds(map, to)) return null;
  if (pointKey(from) === pointKey(to)) return [];
  if (!isEnterable(map, to)) return null;

  return pathFromReachable(map, dijkstra(map, from, to, hostiles, null), from, to);
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
): Reachable {
  return dijkstra(map, from, null, hostiles, prohibidas);
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
function dijkstra(
  map: GameMap,
  from: Point,
  parar: Point | null,
  hostiles: readonly Point[],
  prohibidas: Uint8Array | null,
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
  // una mina cambia de dueño, que es la clase de estado que este repositorio no
  // quiere. Se pagan enteras en cada búsqueda y aun así sale a cuenta: medido
  // en `pnpm banco`, 3402 → 1611 ms de mediana en tres pasadas intercaladas,
  // **2,11×**, con el sha256 del volcado intacto.
  const pisable = new Uint8Array(casillas);
  const recto = new Int32Array(casillas);
  const oblicuo = new Int32Array(casillas);
  for (let i = 0; i < casillas; i++) {
    const terreno = map.terrain[i] as TerrainKind;
    // Una barrera no tiene precio: se queda en 0 y no se lee, porque no se pisa.
    if (!isWalkable(terreno)) continue;
    pisable[i] = 1;
    recto[i] = costeDeEntrada(terreno, false, false);
    oblicuo[i] = costeDeEntrada(terreno, false, true);
  }
  // Las casillas con camino, por índice: la red las trae ya dentro del mapa.
  for (const i of map.caminos.indices) {
    const terreno = map.terrain[i] as TerrainKind;
    // Un camino pintado sobre una barrera no la abre: sigue sin pisarse.
    if (!isWalkable(terreno)) continue;
    recto[i] = costeDeEntrada(terreno, true, false);
    oblicuo[i] = costeDeEntrada(terreno, true, true);
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
