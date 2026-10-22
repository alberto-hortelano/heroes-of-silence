/**
 * El recinto de una ciudad (la ciudad amurallada, vuelta 3, 21-10-2026).
 *
 * La ciudad del mapa se pinta como un recinto amurallado de `LADO_DEL_RECINTO`
 * casillas por lado con la ciudad en el medio (`render/escenario/recinto.ts`).
 * Hasta la vuelta 2 eso era solo de la escena, y el núcleo ponía cosas donde la
 * escena levantaba la muralla: dos ciudades a tres casillas, con los recintos
 * fundidos en un solo castillo (s2, cuatro en uno); un nodo entre las casas de
 * una ciudad-puente (s98, s105); y el héroe de salida dentro del recinto, de pie
 * sobre los tejados. «Dos ciudades no quedan tan cerca que sus recintos se
 * toquen» y «el héroe no atraviesa la muralla» son decisiones del usuario
 * (21-10-2026), así que **el recinto es del núcleo**, y aquí, una vez: dónde está, por dónde se entra y
 * qué lo impide. Lo leen el movimiento (`map.ts`: el Dijkstra, `stepCost`,
 * `isEnterable`), la red (`regiones.ts`: las regiones de una ciudad), el
 * generador (para no poner nada dentro y trazar los caminos por las puertas),
 * la puerta de los planes (`validateMapPlan`) y la escena.
 *
 * **El héroe de salida nace en su base** (19-10-2026, decisión del usuario):
 * en la casilla de la ciudad, que es el medio del recinto y se pisa, y sale por
 * sus puertas. Hasta la fusión con eso (21-10-2026) nacía fuera, en el acceso
 * de una puerta, porque lo que se pisaba antes del recinto era una casilla
 * vecina de la ciudad, entre las casas.
 *
 * **Se entra por las puertas** (fase 2): en el 3 × 3 solo se pisan la ciudad
 * (el medio) y sus puertas, y de fuera solo se pasa a una puerta desde uno de
 * sus accesos; de la puerta, a la ciudad. Todo paso por el recinto pisa el
 * castillo, así que «un nodo se toma pisándolo» sigue valiendo. **Hay puerta
 * donde llega un camino** (decisión del usuario, 21-10-2026): una cara la lleva
 * si un tramo de `GameMap.caminos` va de uno de sus accesos a ella; y la del
 * río de una ciudad-puente, siempre: el puente es su camino. Se deriva de los
 * caminos y no se guarda.
 *
 * **La ciudad-puente, en tierra**: la ciudad está en el medio de su recinto, a
 * dos casillas del río, y la casilla del río que tiene delante es tierra (el
 * puente, `rioAnteLaCiudad`): el acceso de su puerta del río. Hasta la fase 2
 * la ciudad estaba en el río y el recinto tierra adentro.
 */
import type { Point } from '../types.js';
import type { GameMap, MapObject, MapRegion } from './map.js';
import type { Estructura } from './regiones.js';
import { isWalkable, type TerrainKind } from './terrain.js';

/**
 * Lo ancho del recinto en casillas: el 3 × 3 de la ciudad. Lo eligió el usuario
 * viendo tres maquetas (20-10-2026): con 2 se veían 1-3 casas y sus torres se
 * apilaban; con 4 tapaba los caminos y doblaba la huella.
 */
export const LADO_DEL_RECINTO = 3;

/**
 * Lo que dista (Chebyshev) el medio de un recinto del de otro, como poco: con 5
 * quedan dos casillas libres entre los dos anillos y ninguna casilla de fuera
 * es vecina de los dos. Con 3 los dos 3 × 3 se tocaban y la senda que iba de
 * uno a otro pasaba bajo sus torres (s50, s62, s105); con 4, una sola casilla
 * entre dos murallas.
 */
export const SEPARACION_DE_CIUDADES = 5;

/** El rectángulo de casillas de un recinto, de `[i0, j0]` a `[i1, j1]`, las dos incluidas. */
export interface RectDelRecinto {
  readonly i0: number;
  readonly j0: number;
  readonly i1: number;
  readonly j1: number;
}

/** Lo que hay del medio del recinto a su borde. */
const MEDIO = (LADO_DEL_RECINTO - 1) / 2;

/** Si el recinto con el medio en `centro` cabe entero en un mapa de `W × H`. */
export function cabeElRecinto(centro: Point, W: number, H: number): boolean {
  return (
    centro.x - MEDIO >= 0 && centro.y - MEDIO >= 0 && centro.x + MEDIO < W && centro.y + MEDIO < H
  );
}

/**
 * El recinto de la ciudad de `at`, con ella en el medio. **Lanza** si no cabe:
 * una ciudad en el borde la rechaza `problemasDeRecintos` antes de construir el
 * mapa, y corrido contra el borde (como hacía la escena con la de la columna 0
 * de s21) el recinto ya no tenía la ciudad en el medio.
 */
export function recintoDeLaCiudad(at: Point, W: number, H: number): RectDelRecinto {
  if (!cabeElRecinto(at, W, H)) {
    throw new Error(
      `el recinto de la ciudad con el medio en (${at.x},${at.y}) no cabe en un mapa de ${W}×${H}: mide ${LADO_DEL_RECINTO} de lado y una ciudad va a una casilla del borde o más`,
    );
  }
  return { i0: at.x - MEDIO, j0: at.y - MEDIO, i1: at.x + MEDIO, j1: at.y + MEDIO };
}

/** Si la casilla `p` cae en el recinto `r`. */
export const enElRecintoDeLaCiudad = (r: RectDelRecinto, p: Point): boolean =>
  p.x >= r.i0 && p.x <= r.i1 && p.y >= r.j0 && p.y <= r.j1;

/** Las caras del recinto que pueden llevar puerta: la del este y la del oeste, nunca (decisión del usuario, 21-10-2026). */
export type CaraConPuerta = 'n' | 'ne' | 'se' | 's' | 'so' | 'no';

/** Las caras por las que puede pasar el puente de una ciudad-puente: las cuatro en cruz. */
export type CaraDelRio = 'n' | 'e' | 's' | 'o';

/**
 * Las caras de una puerta: las seis de `CaraConPuerta` y, solo con el puente de
 * una ciudad-puente delante, la del este o la del oeste (decisión del usuario,
 * 21-10-2026: «esa cara lleva `puerta-e-o` solo ahí»).
 */
export type CaraDeLaPuerta = CaraConPuerta | 'e' | 'o';

/** Un desplazamiento en casillas desde el medio del recinto. */
type Paso = readonly [number, number];

/**
 * Las puertas de una ciudad, relativas al medio de su recinto: la casilla de la
 * puerta (la del anillo) y sus accesos, las de fuera desde las que se entra
 * por ella. La del norte y la del sur, la de en medio de su lado con su acceso
 * de frente; las diagonales, la esquina con sus tres vecinas de fuera, que
 * cruzan el chaflán de su cara por su arco. Las caras del este y del oeste no
 * llevan puerta: vista de lado, la senda llegaba a un muro (H3 del QA de la
 * vuelta 2). Los tres accesos de una diagonal son vecinos entre sí, así que son
 * siempre de la misma región: una puerta no une dos regiones sin la ciudad.
 */
export const PUERTAS_DE_LA_CIUDAD: Readonly<
  Record<CaraConPuerta, { readonly casilla: Paso; readonly accesos: readonly Paso[] }>
> = {
  n: { casilla: [0, -1], accesos: [[0, -2]] },
  ne: {
    casilla: [1, -1],
    accesos: [
      [1, -2],
      [2, -2],
      [2, -1],
    ],
  },
  se: {
    casilla: [1, 1],
    accesos: [
      [2, 1],
      [2, 2],
      [1, 2],
    ],
  },
  s: { casilla: [0, 1], accesos: [[0, 2]] },
  so: {
    casilla: [-1, 1],
    accesos: [
      [-1, 2],
      [-2, 2],
      [-2, 1],
    ],
  },
  no: {
    casilla: [-1, -1],
    accesos: [
      [-2, -1],
      [-2, -2],
      [-1, -2],
    ],
  },
};

/** Las caras con puerta, en el orden en que se dicen y se miran. */
const CARAS_CON_PUERTA = Object.keys(PUERTAS_DE_LA_CIUDAD) as CaraConPuerta[];

/** El rumbo de cada cara en cruz, desde la ciudad: por donde mira su puente. */
const RUMBO_DEL_RIO: Readonly<Record<CaraDelRio, Paso>> = {
  n: [0, -1],
  s: [0, 1],
  e: [1, 0],
  o: [-1, 0],
};
const CARAS_DEL_RIO = Object.keys(RUMBO_DEL_RIO) as CaraDelRio[];

/**
 * En qué orden se miran las caras con puerta de una ciudad cuando hay que
 * elegir una (`abrirUnAcceso`, en el generador): las de abajo antes, que la
 * cámara mira desde el sur. Era el orden en que se buscaba el inicio del héroe
 * delante de una puerta, hasta que nació en su base; se queda tal cual para no
 * mover los mapas.
 */
export const ORDEN_DE_LAS_CARAS: readonly CaraConPuerta[] = ['s', 'se', 'so', 'n', 'ne', 'no'];

/** Cómo se dice cada cara, para la persona. */
const NOMBRE_DE_CARA: Readonly<Record<CaraDeLaPuerta, string>> = {
  n: 'la del norte',
  ne: 'la del noreste',
  se: 'la del sureste',
  s: 'la del sur',
  so: 'la del suroeste',
  no: 'la del noroeste',
  e: 'la del este',
  o: 'la del oeste',
};

/** Lo que se lee de un mapa para saber de los recintos: el terreno y dónde están las ciudades y los nodos. */
export interface MapaDelRecinto {
  readonly width: number;
  readonly height: number;
  readonly terrain: readonly TerrainKind[];
  readonly objects: readonly Pick<MapObject, 'kind' | 'at'>[];
}

/** Y con los caminos, de los que salen las puertas que hay. */
export interface MapaConCaminos extends MapaDelRecinto {
  readonly caminos: { une(p: Point, q: Point): boolean };
}

const dentro = (map: Pick<MapaDelRecinto, 'width' | 'height'>, p: Point): boolean =>
  p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height;
const mas = (at: Point, [dx, dy]: Paso, k = 1): Point => ({ x: at.x + k * dx, y: at.y + k * dy });
const chebyshev = (a: Point, b: Point): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const casilla = (p: Point): string => `(${p.x},${p.y})`;

/** Las ciudades del mapa: sus casillas. */
const ciudadesDe = (map: MapaDelRecinto): Point[] =>
  map.objects.filter((o) => o.kind === 'town').map((o) => o.at);

/** Si en `p` hay un nodo o una ciudad: un acceso no cae en ninguno (pasaría de nodo a nodo sin pisar región). */
const hayNodo = (map: MapaDelRecinto, p: Point): boolean =>
  map.objects.some(
    (o) => (o.kind === 'node' || o.kind === 'town') && o.at.x === p.x && o.at.y === p.y,
  );

/** Lo que se sabe del puente de una ciudad-puente. */
export interface PuenteDeLaCiudad {
  /** La cara por la que entra: la que mira al río. */
  readonly cara: CaraDelRio;
  /** La casilla del río que se pisa: el puente, y el acceso de la puerta del río. */
  readonly acceso: Point;
  /** La casilla de la puerta del río, en el anillo. */
  readonly puerta: Point;
  /** La de enfrente, en la otra orilla, adonde cruza el puente. */
  readonly enfrente: Point;
}

/**
 * El puente de una ciudad-puente, o `null` si no lo es: la casilla a dos de la
 * ciudad, en cruz, que se pisa y tiene agua a sus dos lados a lo largo de ella.
 * Es el río que pasa por delante de la ciudad, con su casilla abierta (la regla
 * de `rumboDelRio`, aplicada al acceso). Ni un nodo ni otra ciudad hacen de
 * puente. Si hay dos, el primero en el orden norte, sur, este, oeste.
 */
export function rioAnteLaCiudad(map: MapaDelRecinto, at: Point): PuenteDeLaCiudad | null {
  const agua = (p: Point): boolean =>
    dentro(map, p) && map.terrain[p.y * map.width + p.x] === 'water';
  for (const cara of CARAS_DEL_RIO) {
    const rumbo = RUMBO_DEL_RIO[cara];
    const acceso = mas(at, rumbo, 2);
    if (!dentro(map, acceso)) continue;
    if (!isWalkable(map.terrain[acceso.y * map.width + acceso.x] as TerrainKind)) continue;
    if (hayNodo(map, acceso)) continue;
    const aLoLargo: Paso = rumbo[0] === 0 ? [1, 0] : [0, 1];
    if (!agua(mas(acceso, aLoLargo)) || !agua(mas(acceso, aLoLargo, -1))) continue;
    return { cara, acceso, puerta: mas(at, rumbo), enfrente: mas(at, rumbo, 3) };
  }
  return null;
}

/** Una puerta de una ciudad: su cara, su casilla en el anillo y los accesos que la llevan. */
export interface PuertaDeLaCiudad {
  readonly cara: CaraDeLaPuerta;
  readonly casilla: Point;
  /** Las casillas de fuera desde las que se entra por ella: se pisan, no son nodo ni caen en otro recinto. */
  readonly accesos: readonly Point[];
  /** Si es la del puente de una ciudad-puente, que existe siempre: el puente es su camino. */
  readonly delRio: boolean;
}

/**
 * Las caras por las que **puede** entrar un camino a la ciudad de `at`: las de
 * `PUERTAS_DE_LA_CIUDAD` con algún acceso que se pise —dentro del mapa, sin
 * nodo ni ciudad encima y fuera de todo recinto—, y la del río de una
 * ciudad-puente (`rioAnteLaCiudad`). Es lo que da las regiones de una ciudad
 * (`regionesDeLaCiudad`) y por donde traza el generador; las puertas que
 * **hay** son las de ellas a las que llega un camino (`puertasDeLaCiudad`).
 */
export function puertasPosibles(map: MapaDelRecinto, at: Point): PuertaDeLaCiudad[] {
  const otras = ciudadesDe(map).filter((c) => c.x !== at.x || c.y !== at.y);
  const sirve = (p: Point): boolean =>
    dentro(map, p) &&
    isWalkable(map.terrain[p.y * map.width + p.x] as TerrainKind) &&
    !hayNodo(map, p) &&
    otras.every((c) => chebyshev(c, p) > MEDIO);
  const puente = rioAnteLaCiudad(map, at);
  const puertas: PuertaDeLaCiudad[] = [];
  for (const cara of CARAS_CON_PUERTA) {
    const { casilla: c, accesos } = PUERTAS_DE_LA_CIUDAD[cara];
    const delRio = puente?.cara === cara;
    const validos = delRio
      ? [puente.acceso]
      : accesos.map((a) => mas(at, a)).filter((p) => sirve(p));
    if (validos.length > 0) puertas.push({ cara, casilla: mas(at, c), accesos: validos, delRio });
  }
  if (puente !== null && (puente.cara === 'e' || puente.cara === 'o'))
    puertas.push({
      cara: puente.cara,
      casilla: puente.puerta,
      accesos: [puente.acceso],
      delRio: true,
    });
  return puertas;
}

/**
 * Las puertas que **tiene** la ciudad de `at`: las posibles (`puertasPosibles`)
 * a las que llega un tramo de camino desde uno de sus accesos, y la del río,
 * siempre (decisión del usuario, 21-10-2026: «puerta solo donde llega un
 * camino»; el puente cuenta como camino). Se deriva de los caminos cada vez:
 * no se guarda, así que no puede discrepar de ellos.
 */
export function puertasDeLaCiudad(map: MapaConCaminos, at: Point): PuertaDeLaCiudad[] {
  return puertasPosibles(map, at).filter(
    (p) => p.delRio || p.accesos.some((a) => map.caminos.une(a, p.casilla)),
  );
}

/**
 * Lo que dice el recinto de un tramo de camino entre dos casillas vecinas `p` y
 * `q`, solo por la geometría (sin mirar el terreno ni los caminos): `null` si
 * ninguna cae en el recinto de una de `ciudades`; si no, si es uno de los que
 * entran en él, de un acceso a la casilla de su puerta (`PUERTAS_DE_LA_CIUDAD`,
 * y la del este o el oeste, que solo lleva el puente de una ciudad-puente) o de
 * la puerta a la ciudad. Lo lee quien deriva los tramos de las casillas de
 * camino del agente (`tramosDeCasillas`): dos puertas vecinas no se unen.
 */
export function tramoDelRecinto(ciudades: readonly Point[], p: Point, q: Point): boolean | null {
  for (const c of ciudades) {
    const a: Paso = [p.x - c.x, p.y - c.y];
    const b: Paso = [q.x - c.x, q.y - c.y];
    const dentroA = Math.max(Math.abs(a[0]), Math.abs(a[1])) <= MEDIO;
    const dentroB = Math.max(Math.abs(b[0]), Math.abs(b[1])) <= MEDIO;
    if (!dentroA && !dentroB) continue;
    const igual = (u: Paso, v: Paso): boolean => u[0] === v[0] && u[1] === v[1];
    const caras = [
      ...Object.values(PUERTAS_DE_LA_CIUDAD),
      ...(['e', 'o'] as const).map((k) => ({
        casilla: RUMBO_DEL_RIO[k],
        accesos: [[2 * RUMBO_DEL_RIO[k][0], 0] as Paso],
      })),
    ];
    return caras.some(
      ({ casilla, accesos }) =>
        (igual(a, casilla) && (igual(b, [0, 0]) || accesos.some((k) => igual(k, b)))) ||
        (igual(b, casilla) && (igual(a, [0, 0]) || accesos.some((k) => igual(k, a)))),
    );
  }
  return null;
}

/** Si la casilla `p` cae en el recinto de alguna de `ciudades`. */
export const enAlgunRecinto = (ciudades: readonly Point[], p: Point): boolean =>
  ciudades.some((c) => chebyshev(c, p) <= MEDIO);

/** El papel de una casilla en el paso por los recintos. */
export const FUERA = 0;
export const MURO = 1;
export const PUERTA = 2;
export const CIUDAD = 3;

/**
 * Las tablas del paso por los recintos, por índice plano (`y·W + x`): el papel
 * de cada casilla (`FUERA`, `MURO`, `PUERTA` o `CIUDAD`), la casilla de la
 * ciudad de cada una del recinto (−1 fuera) y la de la puerta de cada acceso
 * (−1 si no lo es). Tablas y no un `GameMap` para que las compartan el
 * Dijkstra del mapa y el trazado del generador, que tiene sus rejillas.
 */
export interface PasosDelRecinto {
  readonly rol: Uint8Array;
  readonly ciudadDe: Int32Array;
  readonly puertaDelAcceso: Int32Array;
  /** Las casillas de algún recinto, por índice: las que no son `FUERA`. */
  readonly delRecinto: readonly number[];
}

/**
 * Las tablas de unas ciudades y sus puertas. Lo del recinto que cae fuera del
 * mapa (una ciudad en el borde) no se marca: eso lo rechaza
 * `problemasDeRecintos`, y aquí no se lanza para que se pueda mirar el mapa que
 * se rechaza.
 */
export function pasosDelRecinto(
  W: number,
  H: number,
  ciudades: readonly {
    readonly at: Point;
    readonly puertas: readonly { readonly casilla: Point; readonly accesos: readonly Point[] }[];
  }[],
): PasosDelRecinto {
  const rol = new Uint8Array(W * H);
  const ciudadDe = new Int32Array(W * H).fill(-1);
  const puertaDelAcceso = new Int32Array(W * H).fill(-1);
  const delRecinto: number[] = [];
  const en = (p: Point): number =>
    p.x < 0 || p.y < 0 || p.x >= W || p.y >= H ? -1 : p.y * W + p.x;
  for (const { at, puertas } of ciudades) {
    const c = en(at);
    if (c < 0) continue;
    for (let dy = -MEDIO; dy <= MEDIO; dy++)
      for (let dx = -MEDIO; dx <= MEDIO; dx++) {
        const i = en({ x: at.x + dx, y: at.y + dy });
        if (i < 0) continue;
        rol[i] = i === c ? CIUDAD : MURO;
        ciudadDe[i] = c;
        delRecinto.push(i);
      }
    for (const p of puertas) {
      const i = en(p.casilla);
      if (i < 0) continue;
      rol[i] = PUERTA;
      for (const a of p.accesos) {
        const j = en(a);
        if (j >= 0) puertaDelAcceso[j] = i;
      }
    }
  }
  return { rol, ciudadDe, puertaDelAcceso, delRecinto };
}

/**
 * Si se puede pasar de la casilla `i` a su vecina `j`: fuera de los recintos,
 * siempre; de un acceso a su puerta y de la puerta a su ciudad, en los dos
 * sentidos; nada más. Ni pisar el muro, aunque debajo haya pradera, ni pasar de
 * un acceso a la puerta de al lado, ni de puerta a puerta.
 */
export function pasoPermitido(p: PasosDelRecinto, i: number, j: number): boolean {
  const ri = p.rol[i];
  const rj = p.rol[j];
  if (ri === FUERA && rj === FUERA) return true;
  if (ri === FUERA) return rj === PUERTA && p.puertaDelAcceso[i] === j;
  if (rj === FUERA) return ri === PUERTA && p.puertaDelAcceso[j] === i;
  return (
    (ri === PUERTA && rj === CIUDAD && p.ciudadDe[i] === j) ||
    (ri === CIUDAD && rj === PUERTA && p.ciudadDe[j] === i)
  );
}

const MEMO_DE_PASOS = new WeakMap<
  object,
  {
    readonly terrain: object;
    readonly caminos: object;
    readonly ciudades: string;
    readonly pasos: PasosDelRecinto | null;
  }
>();

/**
 * Las tablas del paso por los recintos de un mapa, con las puertas que tiene
 * (`puertasDeLaCiudad`), o `null` si no tiene ciudades. Las pide cada búsqueda
 * del mapa y no cambian en una partida, así que se guardan por mapa; si cambia
 * el terreno, los caminos o dónde están las ciudades (lo hacen algunos tests),
 * se vuelven a hacer.
 */
export function pasosDelMapa(map: GameMap): PasosDelRecinto | null {
  const ciudades = ciudadesDe(map);
  if (ciudades.length === 0) return null;
  const firma = ciudades.map(casilla).join();
  const hecho = MEMO_DE_PASOS.get(map);
  if (
    hecho !== undefined &&
    hecho.terrain === map.terrain &&
    hecho.caminos === map.caminos &&
    hecho.ciudades === firma
  )
    return hecho.pasos;
  const pasos = pasosDelRecinto(
    map.width,
    map.height,
    ciudades.map((at) => ({ at, puertas: puertasDeLaCiudad(map, at) })),
  );
  MEMO_DE_PASOS.set(map, { terrain: map.terrain, caminos: map.caminos, ciudades: firma, pasos });
  return pasos;
}

/**
 * Las regiones de una ciudad: las de los accesos de sus puertas posibles
 * (`puertasPosibles`), ascendentes. No las de sus ocho vecinas, que son su
 * muralla: una región que solo la toca por el este o el oeste no entra en ella.
 * Las posibles y no las que hay: en un mapa válido cada región con un acceso
 * posible tiene su camino y su puerta (`problemasDeRecintos`), así que son las
 * mismas, y la red se puede leer antes de trazar los caminos.
 */
export function regionesDeLaCiudad(map: MapaDelRecinto, at: Point, regionDe: Int32Array): number[] {
  const out = new Set<number>();
  for (const p of puertasPosibles(map, at))
    for (const a of p.accesos) {
      const r = regionDe[a.y * map.width + a.x] as number;
      if (r >= 0) out.add(r);
    }
  return [...out].sort((a, b) => a - b);
}

/** Una puerta por su cara, dicha: «la puerta del suroeste». */
const laPuerta = (cara: CaraDeLaPuerta): string =>
  NOMBRE_DE_CARA[cara].replace(/^la /, 'la puerta ');

/** Las puertas de una lista, dichas: «la del norte y la del sureste». */
function dichasLasPuertas(puertas: readonly PuertaDeLaCiudad[]): string {
  const nombres = puertas.map((p) => NOMBRE_DE_CARA[p.cara] + (p.delRio ? ', la del puente' : ''));
  if (nombres.length <= 1) return nombres[0] ?? 'ninguna';
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

/**
 * Por qué no se pisa `hasta`, si es la muralla de una ciudad, en una frase para
 * la persona; `null` si no lo es. `nombre` dice cómo se llama la ciudad de una
 * casilla (el mapa no guarda nombres); sin él, por su casilla. Lo leen el
 * rechazo de una marcha (`porQueNoLlega`) y `stepCost`.
 */
export function muroBlocker(
  map: MapaConCaminos,
  hasta: Point,
  nombre: (ciudad: Point) => string = (c) => `la ciudad de ${casilla(c)}`,
): string | null {
  const at = ciudadesDe(map).find((c) => chebyshev(c, hasta) <= MEDIO);
  if (at === undefined || (at.x === hasta.x && at.y === hasta.y)) return null;
  const puertas = puertasDeLaCiudad(map, at);
  if (puertas.some((p) => p.casilla.x === hasta.x && p.casilla.y === hasta.y)) return null;
  const cuales =
    puertas.length === 0
      ? 'y no tiene ninguna: hay puerta donde llega un camino'
      : `—${dichasLasPuertas(puertas)}—`;
  return `${casilla(hasta)} es la muralla de ${nombre(at)}: a una ciudad se entra por sus puertas ${cuales}, y el resto de su recinto no se pisa`;
}

/** Una ciudad, para decirla: su id, su nombre y su casilla. */
export interface CiudadConNombre {
  readonly id: string;
  readonly name: string;
  readonly at: Point;
}

/** Algo que ocupa una casilla y no es un objeto del mapa (un grupo de asaltantes), dicho para la persona. */
export interface OcupaUnaCasilla {
  readonly quien: string;
  readonly at: Point;
}

/**
 * Cómo se dice un objeto del mapa, para una frase de rechazo: lo que cae dentro de
 * un recinto o lo que queda pegado a un lugar de un mundo (`lugarBlocker`).
 */
export function queEsElObjeto(o: GameMap['objects'][number]): string {
  switch (o.kind) {
    case 'town':
      return `la ciudad ${o.id}`;
    case 'node':
      return `el nodo ${o.id}`;
    case 'village':
      return `el pueblo "${o.name}"`;
    case 'monster':
      return `el monstruo ${o.creature}`;
    case 'chest':
      return 'el cofre';
    case 'lugar':
      return `el lugar "${o.name}"`;
  }
}

/**
 * Lo que impide que cada ciudad lleve su recinto y se entre en ella por sus
 * puertas, en frases para quien hizo el plan:
 *
 * - una ciudad sobre el agua de un río (va en tierra, con su puente delante),
 *   una cuyo recinto no cabe (está en el borde), y dos a menos de
 *   `SEPARACION_DE_CIUDADES`;
 * - cualquier cosa dentro de un recinto que no sea su ciudad —un nodo, otra
 *   ciudad, un pueblo, un monstruo, un cofre, y lo de
 *   `otros`: los asaltantes—;
 * - un camino que cruza la muralla: a una ciudad se llega de un acceso a su
 *   puerta y de la puerta a ella (`PUERTAS_DE_LA_CIUDAD`), y el que entra por
 *   la puerta sigue a la ciudad;
 * - una región que llega a una ciudad por un acceso y no tiene camino que entre
 *   por una puerta: sin camino no hay puerta (decisión del usuario, 21-10-2026),
 *   y la región se quedaría sin la ciudad. Se rechaza en vez de añadirle el
 *   camino, que sería corregir el plan en silencio;
 * - una región que el recinto parte en dos: su muralla no se pisa.
 *
 * Vacío: todo cabe. La corren los dos productores de planes: `validateMapPlan`
 * (el agente se entera de por qué, y se juega el procedimental) y el final del
 * vestido del generador, que tira ese vestido en vez de entregar lo que la
 * puerta rechazaría. Pide la red del mapa ya válida (`problemasDeRed`).
 */
export function problemasDeRecintos(
  map: GameMap,
  red: Pick<Estructura, 'regionDe'>,
  ciudades: readonly CiudadConNombre[],
  otros: readonly OcupaUnaCasilla[],
): string[] {
  const problemas: string[] = [];
  const W = map.width;
  const H = map.height;
  const { regionDe } = red;
  const nombre = (c: CiudadConNombre): string => `"${c.name}" (${c.id}, en ${casilla(c.at)})`;
  const conRecinto: { readonly c: CiudadConNombre; readonly r: RectDelRecinto }[] = [];
  const agua = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < W && y < H && map.terrain[y * W + x] === 'water';
  for (const c of ciudades) {
    const { x, y } = c.at;
    // Sobre el río no: la ciudad del río va en tierra, con su puente delante
    // (`rioAnteLaCiudad`); en el agua, su recinto la tapaba.
    if ((agua(x - 1, y) && agua(x + 1, y)) || (agua(x, y - 1) && agua(x, y + 1)))
      problemas.push(
        `la ciudad ${nombre(c)} está sobre el agua de un río: una ciudad va en tierra; si quieres que el río pase por delante, déjale a dos casillas de ella, en cruz, una casilla que se pise con agua a sus dos lados, que es su puente`,
      );
    if (!cabeElRecinto(c.at, W, H)) {
      problemas.push(
        `la ciudad ${nombre(c)} está en el borde del mapa: lleva un recinto amurallado de ${LADO_DEL_RECINTO}×${LADO_DEL_RECINTO} casillas con ella en el medio, que no cabe; ponla a una casilla del borde o más`,
      );
      continue;
    }
    conRecinto.push({ c, r: recintoDeLaCiudad(c.at, W, H) });
  }
  for (const [k, a] of conRecinto.entries()) {
    for (const b of conRecinto.slice(k + 1)) {
      const d = chebyshev(a.c.at, b.c.at);
      if (d >= SEPARACION_DE_CIUDADES) continue;
      problemas.push(
        `las ciudades ${nombre(a.c)} y ${nombre(b.c)} llevan sus recintos a ${d} casillas uno de otro: se tocarían; entre dos ciudades van ${SEPARACION_DE_CIUDADES} casillas o más, contando la diagonal como una`,
      );
    }
  }
  const dentroDe: (OcupaUnaCasilla & { readonly id?: string })[] = [
    ...map.objects.map((o) => ({ quien: queEsElObjeto(o), at: o.at, id: o.id })),
    ...otros,
  ];
  for (const { c, r } of conRecinto) {
    for (const o of dentroDe) {
      if (o.id === c.id) continue;
      if (!enElRecintoDeLaCiudad(r, o.at)) continue;
      problemas.push(
        `${o.quien} de ${casilla(o.at)} cae dentro del recinto de la ciudad ${nombre(c)}, de ${casilla({ x: r.i0, y: r.j0 })} a ${casilla({ x: r.i1, y: r.j1 })}: dentro de su muralla solo va ella`,
      );
    }
  }
  if (problemas.length > 0) return problemas;

  // Por dónde se entra: los caminos, las puertas y las regiones.
  const nombreDeRegion = (r: number): string =>
    `"${(map.regions[r] as MapRegion | undefined)?.name ?? r}"`;
  const posibles = new Map(conRecinto.map(({ c }) => [c.id, puertasPosibles(map, c.at)] as const));
  /** De qué ciudad es el recinto en que cae `p`, o `undefined`. */
  const recintoDe = (p: Point): CiudadConNombre | undefined =>
    conRecinto.find(({ r }) => enElRecintoDeLaCiudad(r, p))?.c;
  const igual = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;
  for (const [p, q] of map.caminos.tramos) {
    const c = recintoDe(p) ?? recintoDe(q);
    if (c === undefined) continue;
    const puertas = posibles.get(c.id) ?? [];
    const vale =
      // De la puerta a la ciudad.
      ((igual(p, c.at) || igual(q, c.at)) &&
        puertas.some((pu) => igual(pu.casilla, igual(p, c.at) ? q : p))) ||
      // De un acceso a su puerta.
      puertas.some(
        (pu) =>
          (igual(pu.casilla, p) && pu.accesos.some((a) => igual(a, q))) ||
          (igual(pu.casilla, q) && pu.accesos.some((a) => igual(a, p))),
      );
    if (!vale)
      problemas.push(
        `el camino de ${casilla(p)} a ${casilla(q)} cruza la muralla de la ciudad ${nombre(c)}: a una ciudad se llega de un acceso a una de sus puertas y de la puerta a ella —${dichasLasPuertas(puertas)}, con sus accesos a dos casillas—`,
      );
  }
  for (const { c } of conRecinto) {
    const puertas = posibles.get(c.id) ?? [];
    for (const pu of puertas) {
      const entra = pu.accesos.some((a) => map.caminos.une(a, pu.casilla));
      const sigue = map.caminos.une(pu.casilla, c.at);
      if (entra && !sigue)
        problemas.push(
          `el camino que entra por ${laPuerta(pu.cara)} de la ciudad ${nombre(c)}, en ${casilla(pu.casilla)}, no sigue hasta la ciudad`,
        );
      if (sigue && !entra && !pu.delRio)
        problemas.push(
          `el camino de ${casilla(pu.casilla)} a la ciudad ${nombre(c)} no viene de fuera: a ${laPuerta(pu.cara)} se llega desde ${pu.accesos.map(casilla).join(' o ')}`,
        );
    }
    // Cada región que llega a la ciudad por un acceso, con su puerta.
    const hay = puertas.filter(
      (pu) => pu.delRio || pu.accesos.some((a) => map.caminos.une(a, pu.casilla)),
    );
    for (const pu of puertas) {
      for (const a of pu.accesos) {
        const r = regionDe[a.y * W + a.x] as number;
        if (r < 0) continue;
        if (hay.some((h) => h.accesos.some((b) => regionDe[b.y * W + b.x] === r))) continue;
        problemas.push(
          `la región ${nombreDeRegion(r)} llega a la ciudad ${nombre(c)} por ${casilla(a)} pero ningún camino suyo entra en ella: a una ciudad se entra por sus puertas, y solo hay puerta donde llega un camino; traza uno de ${casilla(a)} a ${casilla(pu.casilla)} y de ahí a la ciudad`,
        );
        // Una frase por región.
        hay.push({ ...pu, accesos: [a], delRio: true });
      }
    }
  }
  // Ninguna región partida por un recinto: lo de dentro no se pisa.
  const enRecinto = new Uint8Array(W * H);
  for (const { r } of conRecinto)
    for (let y = r.j0; y <= r.j1; y++) for (let x = r.i0; x <= r.i1; x++) enRecinto[y * W + x] = 1;
  const visto = new Uint8Array(W * H);
  const trozos = new Map<number, Point[]>();
  for (let i = 0; i < W * H; i++) {
    const r = regionDe[i] as number;
    if (r < 0 || enRecinto[i] === 1 || visto[i] === 1) continue;
    const lista = trozos.get(r) ?? [];
    lista.push({ x: i % W, y: (i - (i % W)) / W });
    trozos.set(r, lista);
    visto[i] = 1;
    const pila = [i];
    while (pila.length > 0) {
      const a = pila.pop() as number;
      const ax = a % W;
      const ay = (a - ax) / W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = ax + dx;
          const ny = ay + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (visto[j] === 1 || enRecinto[j] === 1 || regionDe[j] !== r) continue;
          visto[j] = 1;
          pila.push(j);
        }
    }
  }
  for (const [r, lista] of trozos) {
    if (lista.length < 2) continue;
    const [a, b] = lista as [Point, Point];
    // La ciudad cuya muralla pisa la región: la que la parte.
    const c = conRecinto.find(({ r: rect }) => {
      for (let y = rect.j0; y <= rect.j1; y++)
        for (let x = rect.i0; x <= rect.i1; x++) if (regionDe[y * W + x] === r) return true;
      return false;
    })?.c;
    problemas.push(
      `el recinto de ${c === undefined ? 'una ciudad' : `la ciudad ${nombre(c)}`} parte la región ${nombreDeRegion(r)} en dos: ${casilla(a)} y ${casilla(b)} solo se unen por dentro de su muralla, que no se pisa`,
    );
  }
  return problemas;
}
