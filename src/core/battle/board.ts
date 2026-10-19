/**
 * Rejilla de batalla: 9 filas de hexes punta arriba, las pares (0, 2… 8) de 12
 * casillas y las impares de 11, media casilla a la derecha: 104 casillas.
 * **Regla nuestra** (decisión del usuario, 11-10-2026: «haz el tablero de la
 * pelea simétrico con una columna más»): fheroes2 tiene 11 × 9 = 99
 * (`battle_board.h`), y con 11 en todas las filas el tablero no era su propio
 * espejo —el eje de las pares caía en 5 y el de las impares en 5,5—, así que el
 * despliegue del defensor tampoco era el del atacante dado la vuelta.
 *
 * Coordenadas offset **odd-r** (las de siempre): la casilla 12.ª de una fila
 * impar NO EXISTE —no se pisa, no se apunta, no se pinta— y `isInside` es quien
 * lo dice. El índice plano (`indiceDe`) es compacto, la posición en `allHexes`:
 * así cualquier lista hecha en ese orden casa con él, sin huecos.
 */
import type { Hex } from '../types.js';
import type { Side } from './types.js';

export const ANCHO_DE_FILA_PAR = 12;
export const ANCHO_DE_FILA_IMPAR = 11;
export const BOARD_HEIGHT = 9;

/** Cuántas casillas tiene la fila `row`: 12 las pares, 11 las impares. */
export function anchoDeFila(row: number): number {
  return row % 2 === 0 ? ANCHO_DE_FILA_PAR : ANCHO_DE_FILA_IMPAR;
}

/** La última fila: el pie del tablero, que miden quien lo pinta y las formas de la muralla. */
export const ULTIMA_FILA = BOARD_HEIGHT - 1;

/**
 * Cuánto va corrida la fila `row`, en medias casillas: 1 las impares (media
 * casilla a la derecha, offset odd-r), 0 las pares. Con `& 1` y no `% 2`: una
 * fila de fuera del tablero (`−1`) también es impar. Es el único sitio que lo
 * dice; lo leen las cúbicas, las vecinas y la proyección del cliente.
 */
export function desplazamientoDeFila(row: number): 0 | 1 {
  return (row & 1) as 0 | 1;
}

/**
 * Dónde empieza cada fila en el índice plano: la suma de los anchos de las de
 * encima. Tiene una entrada más que filas, y esa última es el total.
 */
const INICIO_DE_FILA: readonly number[] = (() => {
  const out = [0];
  for (let row = 0; row < BOARD_HEIGHT; row++) out.push((out[row] as number) + anchoDeFila(row));
  return out;
})();

/** Cuántas casillas hay: 104. Derivado, no escrito. */
export const BOARD_SIZE = INICIO_DE_FILA[BOARD_HEIGHT] as number;

/**
 * Todas las casillas, de arriba abajo y de izquierda a derecha: el único
 * recorrido de la forma. Congeladas y hechas una vez —`allHexes()` creaba 104
 * objetos en cada llamada—; la posición de cada una es su `indiceDe`.
 */
const TODAS_LAS_CASILLAS: readonly Hex[] = Object.freeze(
  Array.from({ length: BOARD_HEIGHT }, (_, row) =>
    Array.from({ length: anchoDeFila(row) }, (_, col) => Object.freeze({ col, row })),
  ).flat(),
);

/** Una fila del tablero tal como se pinta: sus casillas y si va corrida media casilla. */
export interface FilaDelTablero {
  readonly row: number;
  readonly desplazada: boolean;
  readonly hexes: readonly Hex[];
}

const FILAS: readonly FilaDelTablero[] = Object.freeze(
  Array.from({ length: BOARD_HEIGHT }, (_, row) =>
    Object.freeze({
      row,
      desplazada: desplazamientoDeFila(row) === 1,
      hexes: TODAS_LAS_CASILLAS.slice(
        INICIO_DE_FILA[row] as number,
        INICIO_DE_FILA[row + 1] as number,
      ),
    }),
  ),
);

/** Las filas del tablero, de arriba abajo: lo que recorre quien pinta la rejilla fila a fila (el editor de la muralla). */
export function filasDelTablero(): readonly FilaDelTablero[] {
  return FILAS;
}

/**
 * De dónde a dónde van los centros de las casillas en horizontal, en columnas
 * (las impares cuentan media más): de 0 a 11. Derivado de las casillas; lo lee
 * la proyección para centrar el tablero en el lienzo.
 */
export const EXTENSION_HORIZONTAL: { readonly desde: number; readonly hasta: number } = (() => {
  const xs = TODAS_LAS_CASILLAS.map((h) => h.col + desplazamientoDeFila(h.row) / 2);
  return { desde: Math.min(...xs), hasta: Math.max(...xs) };
})();

/**
 * La forma del tablero en una frase, la única: la leen el contrato del agente
 * (`tableroDelContrato`, y la prosa de `battle_turn`), el error de la muralla,
 * el comentario del borrador de murallas y el editor de la arena.
 */
export const FORMA_DEL_TABLERO = `${BOARD_HEIGHT} filas de hexes punta arriba; las pares (0, 2… ${BOARD_HEIGHT - 1}) de ${ANCHO_DE_FILA_PAR} casillas (col 0-${ANCHO_DE_FILA_PAR - 1}) y las impares de ${ANCHO_DE_FILA_IMPAR} (col 0-${ANCHO_DE_FILA_IMPAR - 1}), media casilla a la derecha (offset odd-r): ${BOARD_SIZE} casillas, simétrico de izquierda a derecha`;

/** El tablero tal como lo recibe el agente: la forma derivada, no un 11 escrito a mano. */
export function tableroDelContrato(): {
  readonly rows: number;
  readonly evenRowWidth: number;
  readonly oddRowWidth: number;
  readonly cells: number;
  readonly layout: string;
} {
  return {
    rows: BOARD_HEIGHT,
    evenRowWidth: ANCHO_DE_FILA_PAR,
    oddRowWidth: ANCHO_DE_FILA_IMPAR,
    cells: BOARD_SIZE,
    layout: `${FORMA_DEL_TABLERO}; el atacante entra por la columna 0`,
  };
}

/** Columnas de salida de cada bando, contando desde su borde. */
export const COLUMNAS_DE_SALIDA = 3;

/**
 * La casilla del otro lado del eje del tablero, en su misma fila. Es su propia
 * inversa y lleva cada casilla a otra que existe: el tablero es su espejo. La
 * leen el despliegue (el del defensor es el del atacante dado la vuelta) y las
 * salidas.
 */
export function espejo(h: Hex): Hex {
  if (!isInside(h)) throw new Error(`(${h.col},${h.row}) está fuera del tablero: no tiene espejo`);
  return { col: anchoDeFila(h.row) - 1 - h.col, row: h.row };
}

/**
 * De qué bando es la zona de salida en la que cae `hex`, o `null` si no es de
 * ninguno. Contando desde cada borde de su fila: es la cuenta de `espejo` sin
 * construir la casilla, porque se pregunta por cada casilla de cada recorrido
 * de la muralla.
 */
export function bandoDeSalida(hex: Hex): Side | null {
  // Sin esto, el hueco (11, impar) contaría −1 desde el borde y sería del defensor.
  if (!isInside(hex))
    throw new Error(`(${hex.col},${hex.row}) está fuera del tablero: no es salida de nadie`);
  if (hex.col < COLUMNAS_DE_SALIDA) return 'attacker';
  if (anchoDeFila(hex.row) - 1 - hex.col < COLUMNAS_DE_SALIDA) return 'defender';
  return null;
}

/**
 * El código de un paso entre dos casillas por su índice, en un sentido: `i`
 * hacia `j`. Lo leen los cortes de las puertas de la muralla, la línea de tiro
 * y la caché de líneas, que tienen que contar lo mismo.
 */
export function codigoDeLado(i: number, j: number): number {
  return i * BOARD_SIZE + j;
}

export function isInside(h: Hex): boolean {
  return h.row >= 0 && h.row < BOARD_HEIGHT && h.col >= 0 && h.col < anchoDeFila(h.row);
}

export function hexKey(h: Hex): string {
  return `${h.col},${h.row}`;
}

export function hexEquals(a: Hex, b: Hex): boolean {
  return a.col === b.col && a.row === b.row;
}

/** Los 6 vecinos, en orden E, SE, SW, W, NW, NE. Filtrados al tablero. */
function vecinasCalculadas(h: Hex): Hex[] {
  // Las seis direcciones salen de `vecinaEnDireccion`, la misma que anda en
  // línea recta para la carga: una sola tabla de desplazamientos odd-r.
  const candidates: Hex[] = [0, 1, 2, 3, 4, 5].map((dir) => vecinaEnDireccion(h, dir));
  // El orden importa poco, pero los duplicados sí: en odd-r, SE y SW comparten
  // columna cuando shift los junta. Se filtran junto a los de fuera del tablero.
  const seen = new Set<string>();
  const out: Hex[] = [];
  for (const c of candidates) {
    if (!isInside(c)) continue;
    const k = hexKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/**
 * La vecina en una de las 6 direcciones (0..5, el orden de `vecinasCalculadas`),
 * SIN filtrar al tablero. Repetir la misma dirección es andar en línea recta:
 * en odd-r el desplazamiento de columna cambia con la paridad de la fila, y por
 * eso no se puede sumar un vector fijo a `(col, row)` — se recalcula en cada paso.
 */
function vecinaEnDireccion(h: Hex, dir: number): Hex {
  const shift = desplazamientoDeFila(h.row);
  switch (dir) {
    case 0:
      return { col: h.col + 1, row: h.row };
    case 1:
      return { col: h.col - 1 + shift, row: h.row + 1 };
    case 2:
      return { col: h.col + shift, row: h.row + 1 };
    case 3:
      return { col: h.col - 1, row: h.row };
    case 4:
      return { col: h.col - 1 + shift, row: h.row - 1 };
    case 5:
      return { col: h.col + shift, row: h.row - 1 };
    default:
      throw new Error(`no hay dirección ${dir} en un hexágono: van de 0 a 5`);
  }
}

/**
 * Las 6 direcciones de `vecinaEnDireccion` en coordenadas cúbicas, `(Δq, Δr)`
 * por paso y en el mismo orden. En cúbicas una recta es un vector fijo, cosa
 * que en odd-r no: por eso aquí se averigua la dirección y abajo se anda.
 */
const DIRECCIONES_CUBICAS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 1],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

/**
 * Si `hasta` está en línea recta desde `desde` —una de las 6 direcciones de las
 * caras del hexágono, sin girar— y ninguna casilla INTERMEDIA está en
 * `bloqueadas`, la distancia; si no, `null`. Ni `desde` ni `hasta` se miran en
 * `bloqueadas`: dónde se puede acabar lo decide quien pregunta.
 *
 * Es la regla de la carga (decisión del usuario, 02-10-2026): «solo en línea
 * recta, sin hacer giros». El usuario dijo «8 direcciones» pensando en casillas
 * cuadradas; en hexágonos las rectas sin giro son 6, y las diagonales entre
 * vértices no se recorren sin zigzag.
 *
 * Alineadas son las que comparten una coordenada cúbica, así que la recta se
 * sabe sin andar; luego se recorre solo esa dirección, para mirar lo de en
 * medio. Entre dos casillas del tablero lo de en medio también lo es: las
 * casillas que faltan (la 12.ª de las filas impares) están en el borde, y toda
 * recta que pasa por una sale del tablero por ese mismo lado (lo comprueba
 * `board.test.ts` con todos los pares).
 */
export function rectaLibre(
  desde: Hex,
  hasta: Hex,
  bloqueadas: ReadonlySet<string>,
  paso?: PasoPermitido,
): number | null {
  const recta = rectaEntre(desde, hasta);
  if (recta === null) return null;
  let h = desde;
  for (let i = 1; i <= recta.d; i++) {
    const siguiente = vecinaEnDireccion(h, recta.dir);
    if (i < recta.d && bloqueadas.has(hexKey(siguiente))) return null;
    // El último paso también se da: subir al muro en la última casilla de la
    // recta es tan ilegal como en la de en medio.
    if (paso !== undefined && !paso(indiceDe(h), indiceDe(siguiente))) return null;
    h = siguiente;
  }
  return recta.d;
}

/**
 * ¿Se puede dar el paso de `desde` a `hasta`, dos casillas vecinas, por su
 * índice (`indiceDe`)? Lo pasa quien recorre un tablero con niveles (la
 * muralla: `cierreDeLaMuralla`), donde el camino deja de ser «todo menos lo
 * bloqueado»: al muro se baja, pero no se sube. Sin él, todo paso entre dos
 * casillas libres vale, como siempre. Por índice y no por `Hex`: se pregunta en
 * cada arista de cada recorrido, y con el hex cada pregunta construía su clave
 * de texto.
 */
export type PasoPermitido = (desde: number, hasta: number) => boolean;

/**
 * ¿Pasa la línea de tiro de `desde` a `hasta` sin cruzar ninguna casilla de
 * `bloqueadas`? Solo se miran las de EN MEDIO: dónde está cada uno lo decide
 * quien pregunta.
 *
 * Con `cortes` (pares de índices `desde · BOARD_SIZE + hasta`, en los dos
 * sentidos: las puertas cerradas, que son el lado entre dos casillas) tampoco
 * pasa de una casilla a la siguiente de la recta por un lado cortado, extremos
 * incluidos: quien tira desde un lado de la puerta cerrada al otro no ve.
 *
 * La recta es la de las casillas que cruza el segmento entre los dos centros,
 * en cúbicas y con **aritmética entera** (sin coma flotante en `core`): el punto
 * `i` de `N` es `a·N + (b − a)·i`, en unidades de `1/N`, y se redondea a la
 * casilla con el redondeo cúbico de siempre —redondear las tres y corregir la
 * que más se desvió—. Para que un segmento que va justo por el borde de dos
 * casillas no dependa del orden de las cuentas, los tres ejes llevan un empujón
 * de `+3, −1, −2` en unidades de `1/(N·EMPUJON)`: suma cero, así que el punto
 * sigue en el plano, y con él nunca hay empate (un medio exacto pediría que
 * `N·EMPUJON/2 ≡ 3, 1 o 2` módulo `EMPUJON`, y con 1 000 nunca pasa; y como los
 * tres son distintos en valor absoluto, tampoco empatan los desvíos al
 * corregir).
 *
 * **Simétrica y generosa** (tablero simétrico, 11-10-2026, decisión del
 * usuario): un empujón cualquiera elige un lado en cada borde, y el espejo del
 * tablero elige el otro, así que el mismo tiro dado la vuelta podía pasar en un
 * lado y no en el otro. Se prueba con el empujón y con su espejo (el espejo
 * cambia `q` por `s`), y pasa si pasa con cualquiera de los dos. Para que eso
 * sea generoso de verdad —que en todo empate de borde un rayo vaya por cada una
 * de las dos casillas— los dos empujones tienen que caer a lados opuestos en
 * los tres: el empate entre dos casillas vecinas lo decide el signo del empujón
 * en el par de ejes en que difieren (`q−s`, `q−r` o `r−s`), y el espejo cambia
 * siempre el de `q−s`, pero los otros dos solo si el eje `r` queda ENTRE `q` y
 * `s`. Con el `+1, +2, −3` de antes (`r` fuera) solo salía generosa la familia
 * de los bordes verticales: en las otras dos los dos rayos pisaban la misma
 * casilla y una sola tapaba el tiro (QA de /simplify, 12-10-2026).
 *
 * **Fuera del tablero cuenta como tapado** (QA I1, decisión del usuario,
 * 12-10-2026): el rayo que roza el borde por la casilla que falta de una fila
 * impar o por la columna −1 no pasa. Solo cae fuera en un empate de borde (el
 * tablero no tiene entrantes: fuera de un empate, el punto más cercano a un
 * segmento entre dos casillas es de dentro), así que el otro rayo va por la
 * casilla de dentro y decide ella. Cuando la de fuera «se saltaba», ese rayo
 * pasaba siempre, y con la de dentro tapada el tiro atravesaba un muro que
 * cerraba contra el marco: el fuerte de la esquina, (11,4)→(11,6) por el hueco
 * (11,5), o una fila impar entera de muro, con 8 y 12 tiros que la cruzaban.
 */
export function lineaLibre(
  desde: Hex,
  hasta: Hex,
  bloqueadas: ReadonlySet<string>,
  cortes?: ReadonlySet<number>,
): boolean {
  const n = hexDistance(desde, hasta);
  if (cortes === undefined && n <= 1) return true;
  const rayo: Rayo = {
    a: toCube(desde),
    b: toCube(hasta),
    n,
    desde: indiceDe(desde),
    hasta: indiceDe(hasta),
  };
  return (
    rayoLibre(rayo, EMPUJON_DEL_RAYO, bloqueadas, cortes) ||
    rayoLibre(rayo, ESPEJO_DEL_EMPUJON, bloqueadas, cortes)
  );
}

type Empujon = readonly [number, number, number];

/** El empujón de `lineaLibre`, en `(q, r, s)`: `r` entre los otros dos (ver arriba). */
const EMPUJON_DEL_RAYO: Empujon = [3, -1, -2];
/** Su espejo: el espejo del tablero cambia `q` por `s`. */
const ESPEJO_DEL_EMPUJON: Empujon = [EMPUJON_DEL_RAYO[2], EMPUJON_DEL_RAYO[1], EMPUJON_DEL_RAYO[0]];

/** Lo que comparten los dos rayos de un tiro: los extremos en cúbicas y por índice, y la distancia. */
interface Rayo {
  readonly a: Cube;
  readonly b: Cube;
  readonly n: number;
  readonly desde: number;
  readonly hasta: number;
}

/** Un rayo de `lineaLibre` con un empujón: ¿pasa? */
function rayoLibre(
  { a, b, n, desde, hasta }: Rayo,
  [eq, er, es]: Empujon,
  bloqueadas: ReadonlySet<string>,
  cortes: ReadonlySet<number> | undefined,
): boolean {
  const d = n * EMPUJON;
  let antes = desde;
  for (let i = 1; i < n; i++) {
    const q = (a.q * n + (b.q - a.q) * i) * EMPUJON + eq;
    const r = (a.r * n + (b.r - a.r) * i) * EMPUJON + er;
    const sx = (a.s * n + (b.s - a.s) * i) * EMPUJON + es;
    const h = deCubo(redondeoCubico(q, r, sx, d));
    if (!isInside(h) || bloqueadas.has(hexKey(h))) return false;
    if (cortes !== undefined) {
      const ahora = indiceDe(h);
      if (cortes.has(codigoDeLado(antes, ahora))) return false;
      antes = ahora;
    }
  }
  return cortes === undefined || !cortes.has(codigoDeLado(antes, hasta));
}

/** El empujón de `lineaLibre`, en milésimas de casilla por paso. */
const EMPUJON = 1000;

/** El entero más cercano a `x / d` (d > 0, sin empates: los quita el empujón). */
function divRedondeo(x: number, d: number): number {
  return Math.floor((2 * x + d) / (2 * d));
}

/** El redondeo cúbico de `(q, r, s) / d`: se corrige el eje que más se desvió. */
function redondeoCubico(q: number, r: number, s: number, d: number): Cube {
  let rq = divRedondeo(q, d);
  let rr = divRedondeo(r, d);
  let rs = divRedondeo(s, d);
  const dq = Math.abs(rq * d - q);
  const dr = Math.abs(rr * d - r);
  const ds = Math.abs(rs * d - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  else rs = -rq - rr;
  return { q: rq, r: rr, s: rs };
}

/** La inversa de `toCube`: de cúbicas a odd-r. */
function deCubo(c: Cube): Hex {
  return { col: c.q + (c.r - desplazamientoDeFila(c.r)) / 2, row: c.r };
}

/**
 * La casilla que sigue a `hasta` en la recta que sale de `desde`, o `null` si no
 * están en recta o si esa casilla cae fuera del tablero. Es «hacia dónde iba» la
 * carga: la regla pide que el enemigo esté AHÍ (decisión del usuario,
 * 02-10-2026: «no se puede cargar contra un enemigo que esté al lado»).
 */
export function siguienteEnRecta(desde: Hex, hasta: Hex): Hex | null {
  const recta = rectaEntre(desde, hasta);
  if (recta === null) return null;
  const h = vecinaEnDireccion(hasta, recta.dir);
  return isInside(h) ? h : null;
}

/**
 * La dirección y la longitud de la recta de `desde` a `hasta`, o `null` si no
 * están alineadas. Alineadas son las que comparten una coordenada cúbica, así
 * que se sabe sin andar. La leen `rectaLibre` y `siguienteEnRecta`, para que
 * «estar en recta» se decida en un solo sitio.
 */
function rectaEntre(desde: Hex, hasta: Hex): { readonly dir: number; readonly d: number } | null {
  for (const h of [desde, hasta]) {
    if (!isInside(h)) throw new Error(`(${h.col},${h.row}) está fuera del tablero: no hay recta`);
  }
  const a = toCube(desde);
  const b = toCube(hasta);
  if (a.q !== b.q && a.r !== b.r && a.s !== b.s) return null;
  const d = hexDistance(desde, hasta);
  if (d === 0) return null;
  const dq = (b.q - a.q) / d;
  const dr = (b.r - a.r) / d;
  return { dir: DIRECCIONES_CUBICAS.findIndex(([q, r]) => q === dq && r === dr), d };
}

/**
 * Índice plano de una casilla del tablero: su posición en `allHexes()`, de 0 a
 * `BOARD_SIZE − 1`, sin huecos (las filas van de 12, 11, 12…). Fuera del
 * tablero lanza: con el rectángulo de antes, `(−1, 1)` daba el índice de
 * `(10, 0)`, y la línea de tiro lo leía sin enterarse.
 */
export function indiceDe(h: Hex): number {
  if (!isInside(h)) throw new Error(`(${h.col},${h.row}) está fuera del tablero: no tiene índice`);
  return (INICIO_DE_FILA[h.row] as number) + h.col;
}

/**
 * Las 104 casillas con su clave y sus vecinas, calculadas UNA vez.
 *
 * El tablero no cambia nunca, y con individuos una batalla pasó de ~10 a ~100
 * decisiones: `neighbours` y el BFS de `reachable` reconstruían los mismos seis
 * objetos y las mismas claves de texto en cada sondeo, y eran la mitad del
 * tiempo de `autoResolve`. Las vecinas guardan **el mismo orden** que
 * `vecinasCalculadas`, porque el BFS inserta en ese orden y el orden del `Map`
 * que devuelve decide qué casilla gana un empate en la IA.
 */
interface Casilla {
  readonly hex: Hex;
  readonly key: string;
  readonly vecinas: readonly Hex[];
  readonly indicesVecinas: readonly number[];
}

const CASILLAS: readonly Casilla[] = TODAS_LAS_CASILLAS.map((hex) => {
  const vecinas = vecinasCalculadas(hex);
  return { hex, key: hexKey(hex), vecinas, indicesVecinas: vecinas.map(indiceDe) };
});

/**
 * Los 6 vecinos, en orden E, SE, SW, W, NW, NE. Filtrados al tablero.
 *
 * Dentro del tablero devuelve la lista memorizada, compartida entre llamadas:
 * por eso es `readonly`. Fuera (una cola que asoma) se calcula al vuelo.
 */
export function neighbours(h: Hex): readonly Hex[] {
  return isInside(h) ? (CASILLAS[indiceDe(h)] as Casilla).vecinas : vecinasCalculadas(h);
}

// -------------------------------------------------------------- distancia

interface Cube {
  q: number;
  r: number;
  s: number;
}

function toCube(h: Hex): Cube {
  const q = h.col - (h.row - desplazamientoDeFila(h.row)) / 2;
  const r = h.row;
  return { q, r, s: -q - r };
}

/** Distancia en hexes entre dos casillas. */
export function hexDistance(a: Hex, b: Hex): number {
  const ca = toCube(a);
  const cb = toCube(b);
  return Math.max(Math.abs(ca.q - cb.q), Math.abs(ca.r - cb.r), Math.abs(ca.s - cb.s));
}

export function areAdjacent(a: Hex, b: Hex): boolean {
  return hexDistance(a, b) === 1;
}

// -------------------------------------------------------------- pathfinding

/**
 * Un hex alcanzado por el BFS: la casilla y a cuántos pasos queda.
 *
 * El `Hex` viaja aquí dentro porque quien lo mete YA lo tiene en la mano —sale
 * de `neighbours`, que lo acaba de construir— y quien lo saca lo necesita. Sin
 * él, la clave se partía por la coma y se convertían dos trozos a número **dos
 * veces por hex**: una en `movableFrom` para filtrar los que no caben y otra en
 * `movableHexes` para devolverlos. Es el mismo motivo por el que
 * `NodoFrontera.at` lleva su `Point` en el mapa de aventura.
 */
export interface Paso {
  readonly at: Hex;
  /** Pasos desde el origen. */
  readonly steps: number;
  /**
   * El paso desde el que se llegó aquí, o `null` en el origen: la cadena hasta
   * el origen ES el camino que se anda (`caminoDe`). Va en el propio paso y no
   * en el mapa porque `movableFrom` filtra el mapa —quita el origen y lo que no
   * cabe— y las casillas de en medio pueden ser de las quitadas.
   */
  readonly previo: Paso | null;
}

/**
 * Las casillas que se pisan para llegar a `paso`, sin el origen y con el
 * destino: el camino de la MISMA búsqueda que decidió que el destino es legal y
 * lo que cuesta. Lo apunta el hecho `move` para que el tablero lo enseñe.
 */
export function caminoDe(paso: Paso): Hex[] {
  const out: Hex[] = [];
  for (let p: Paso | null = paso; p !== null && p.previo !== null; p = p.previo) out.push(p.at);
  return out.reverse();
}

/**
 * Hexes alcanzables desde `from` con `maxSteps` pasos, esquivando `blocked`.
 * BFS sobre la tabla de `CASILLAS`: con 104 casillas el algoritmo no tiene nada
 * que optimizar, pero se llama en cada decisión y cada sondeo, y con individuos
 * eso son decenas de miles de llamadas por partida.
 * Devuelve un mapa hexKey → paso (incluye `from` con 0 pasos), en orden de
 * descubrimiento: ese orden lo leen los llamantes y es parte de la regla.
 */
export function reachable(
  from: Hex,
  maxSteps: number,
  blocked: ReadonlySet<string>,
  pasoPermitido?: PasoPermitido,
): Map<string, Paso> {
  if (!isInside(from)) {
    throw new Error(
      `no se puede buscar camino desde (${from.col},${from.row}): está fuera del tablero`,
    );
  }
  const inicio: Paso = { at: from, steps: 0, previo: null };
  const dist = new Map<string, Paso>([[hexKey(from), inicio]]);
  // El paso de cada casilla de la frontera, por índice, para colgar de él el
  // siguiente: es lo que deja reconstruir el camino sin otra búsqueda.
  const pasoEn: (Paso | undefined)[] = new Array(BOARD_SIZE);
  // Visitados por índice en vez de `dist.has(clave)`: el `Map` se sigue
  // llenando en el mismo orden, que es lo que leen los llamantes.
  const visto = new Uint8Array(BOARD_SIZE);
  const origen = indiceDe(from);
  visto[origen] = 1;
  pasoEn[origen] = inicio;
  let frontier: number[] = [origen];

  for (let step = 1; step <= maxSteps; step++) {
    const next: number[] = [];
    for (const h of frontier) {
      for (const n of (CASILLAS[h] as Casilla).indicesVecinas) {
        if (visto[n] === 1) continue;
        const c = CASILLAS[n] as Casilla;
        if (blocked.has(c.key)) continue;
        // Con niveles el grafo tiene sentido: que no se suba por aquí no quiere
        // decir que no se llegue por otro lado, así que no se marca como visto.
        if (pasoPermitido !== undefined && !pasoPermitido(h, n)) continue;
        visto[n] = 1;
        const paso: Paso = { at: c.hex, steps: step, previo: pasoEn[h] as Paso };
        pasoEn[n] = paso;
        dist.set(c.key, paso);
        next.push(n);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return dist;
}

/**
 * Lo que queda de tramo, dicho: `['queda', '1 casilla']` o `['quedan', '3
 * casillas']`. Lo escriben el panel («Le queda 1 casilla»), las notas del agente
 * («le quedan 3 casillas») y las frases del motor (`movimientoBlocker`,
 * `fraseDelContacto`); antes cada uno ponía su plural, y la del contacto decía
 * «le queda 1» sin la casilla. Aquí y no en `battle.ts` para que la lea
 * `contacto.ts`, que no importa el motor.
 */
export function quedanCasillas(n: number): readonly [verbo: string, casillas: string] {
  return n === 1 ? ['queda', '1 casilla'] : ['quedan', `${n} casillas`];
}

/**
 * La recta de `desde` a `hasta` andada con costes: el `Paso` de `hasta`, con lo
 * que cuesta llegar saliendo de cada casilla de la recta (`salirDe`) y su
 * cadena por cada una, o `null` si no están en recta. No mira lo que hay en
 * medio: eso es `rectaLibre`, y quien pregunta la llama antes. Es la carrera de
 * la carga cuando salir del contacto cuesta (`contacto.ts`): la carga se cobra
 * por la recta, así que la recta es lo que se paga y lo que se anda.
 */
export function carreraConCostes(desde: Hex, hasta: Hex, salirDe: CosteDeSalir): Paso | null {
  const recta = rectaEntre(desde, hasta);
  if (recta === null) return null;
  let paso: Paso = { at: desde, steps: 0, previo: null };
  for (let i = 1; i <= recta.d; i++) {
    const siguiente = vecinaEnDireccion(paso.at, recta.dir);
    paso = { at: siguiente, steps: paso.steps + salirDe(indiceDe(paso.at)), previo: paso };
  }
  return paso;
}

/**
 * Lo que cuesta salir de la casilla de índice `indice` (`indiceDe`): un entero
 * de 1 o más. Lo pasa quien recorre con costes (`alcanceConCostes`): salir del
 * contacto en la arena (`contacto.ts`).
 */
export type CosteDeSalir = (indice: number) => number;

/**
 * Lo mismo que `reachable`, pero cada paso cuesta lo que cuesta salir de la
 * casilla de la que sale (`salirDe`) y el tope es un presupuesto, no un
 * número de pasos: el camino es el más barato, no el más corto. `Paso.steps` es
 * el coste pagado hasta ahí.
 *
 * Es un Dijkstra por cubos: los costes son enteros pequeños y el presupuesto
 * también, así que cada coste es una cola y no hace falta montículo. Dentro de
 * cada cubo, por orden de llegada: en un empate gana quien llegó primero, el
 * mismo orden que el BFS. Con coste 1 en todo, da exactamente lo que
 * `reachable` —las mismas casillas, en el mismo orden, con los mismos pasos y
 * el mismo camino— y lo fija un test (`test/board.test.ts`). Por eso el juego,
 * que sigue con `reachable`, podría pasar por aquí sin cambiar el banco; no
 * pasa para no pagar el cubo de más en cada sondeo de la IA.
 *
 * El `Map` sale en el orden en que se asienta cada casilla, del coste menor al
 * mayor; la casilla que se mejora (se descubrió cara y luego por un camino más
 * barato) va con el coste y el previo del barato.
 */
export function alcanceConCostes(
  from: Hex,
  presupuesto: number,
  blocked: ReadonlySet<string>,
  salirDe: CosteDeSalir,
  pasoPermitido?: PasoPermitido,
): Map<string, Paso> {
  if (!isInside(from)) {
    throw new Error(
      `no se puede buscar camino desde (${from.col},${from.row}): está fuera del tablero`,
    );
  }
  const dist = new Map<string, Paso>();
  if (presupuesto < 0) return dist;
  // El mejor coste visto de cada casilla (−1: no vista), de dónde llegó y si ya
  // se asentó: con costes, la primera vez que se ve una casilla no es la buena.
  const mejor = new Int32Array(BOARD_SIZE).fill(-1);
  const desde = new Int16Array(BOARD_SIZE).fill(-1);
  const asentada = new Uint8Array(BOARD_SIZE);
  const pasoEn: (Paso | undefined)[] = new Array(BOARD_SIZE);
  const cubos: number[][] = [];
  for (let c = 0; c <= presupuesto; c++) cubos.push([]);
  const origen = indiceDe(from);
  mejor[origen] = 0;
  (cubos[0] as number[]).push(origen);

  for (let coste = 0; coste <= presupuesto; coste++) {
    const cubo = cubos[coste] as number[];
    for (let k = 0; k < cubo.length; k++) {
      const h = cubo[k] as number;
      // Una entrada vieja: la casilla ya se asentó más barata.
      if (asentada[h] === 1 || mejor[h] !== coste) continue;
      asentada[h] = 1;
      const c = CASILLAS[h] as Casilla;
      const padre = desde[h] as number;
      const paso: Paso = {
        at: c.hex,
        steps: coste,
        previo: padre === -1 ? null : (pasoEn[padre] as Paso),
      };
      pasoEn[h] = paso;
      dist.set(c.key, paso);
      // Ningún paso cuesta menos de 1: desde la última fila del presupuesto no
      // se sale, y no se pregunta lo que cuesta (contar enemigos no es gratis).
      if (coste + 1 > presupuesto) continue;
      const salir = salirDe(h);
      if (!Number.isInteger(salir) || salir < 1) {
        throw new Error(
          `salir de (${c.hex.col},${c.hex.row}) no puede costar ${salir}: un paso cuesta un entero de 1 o más`,
        );
      }
      const llega = coste + salir;
      if (llega > presupuesto) continue;
      for (const n of c.indicesVecinas) {
        if (asentada[n] === 1) continue;
        const v = CASILLAS[n] as Casilla;
        if (blocked.has(v.key)) continue;
        if (pasoPermitido !== undefined && !pasoPermitido(h, n)) continue;
        const antes = mejor[n] as number;
        if (antes !== -1 && antes <= llega) continue;
        mejor[n] = llega;
        desde[n] = h;
        (cubos[llega] as number[]).push(n);
      }
    }
  }
  return dist;
}

/**
 * Cuántos pasos hay de cada casilla al más cercano de `origenes`, esquivando
 * `blocked` (los orígenes cuentan aunque estén en él) y dando solo los pasos que
 * deje `pasoPermitido`, si lo hay, sin tope: es la distancia
 * andando, no lo que se anda hoy. El mismo BFS por índices que `reachable`, sin
 * los `Paso`: aquí nadie reconstruye el camino. Devuelve quién la lee:
 * `Infinity` donde no se llega o fuera del tablero.
 */
export function distanciasDesde(
  origenes: readonly Hex[],
  blocked: ReadonlySet<string>,
  pasoPermitido?: PasoPermitido,
): (h: Hex) => number {
  const dist = new Int16Array(BOARD_SIZE).fill(-1);
  let frontera: number[] = [];
  for (const h of origenes) {
    if (!isInside(h)) {
      throw new Error(`no se puede medir desde (${h.col},${h.row}): está fuera del tablero`);
    }
    const i = indiceDe(h);
    dist[i] = 0;
    frontera.push(i);
  }
  for (let d = 1; frontera.length > 0; d++) {
    const siguiente: number[] = [];
    for (const h of frontera) {
      for (const n of (CASILLAS[h] as Casilla).indicesVecinas) {
        const c = CASILLAS[n] as Casilla;
        if (dist[n] !== -1 || blocked.has(c.key)) continue;
        // Se busca hacia atrás: quien está en `n` anda hacia `h`, así que el
        // paso que se pregunta es ese, no el del recorrido.
        if (pasoPermitido !== undefined && !pasoPermitido(n, h)) continue;
        dist[n] = d;
        siguiente.push(n);
      }
    }
    frontera = siguiente;
  }
  return (h) => {
    const d = isInside(h) ? (dist[indiceDe(h)] as number) : -1;
    return d < 0 ? Number.POSITIVE_INFINITY : d;
  };
}

/**
 * Camino más corto de `from` a `to` (sin incluir `from`), o `null` si no llega.
 * `blocked` no debe contener `to` si se quiere llegar a él.
 */
export function findPath(from: Hex, to: Hex, blocked: ReadonlySet<string>): Hex[] | null {
  if (hexEquals(from, to)) return [];
  const cameFrom = new Map<string, Hex>();
  const seen = new Set<string>([hexKey(from)]);
  let frontier: Hex[] = [from];

  while (frontier.length > 0) {
    const next: Hex[] = [];
    for (const h of frontier) {
      for (const n of neighbours(h)) {
        const k = hexKey(n);
        if (seen.has(k) || blocked.has(k)) continue;
        seen.add(k);
        cameFrom.set(k, h);
        if (hexEquals(n, to)) {
          const path: Hex[] = [n];
          let cur = h;
          while (!hexEquals(cur, from)) {
            path.unshift(cur);
            cur = cameFrom.get(hexKey(cur)) as Hex;
          }
          return path;
        }
        next.push(n);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * Todos los hexes del tablero, de arriba abajo y de izquierda a derecha: la
 * lista congelada y compartida (la posición de cada uno es su `indiceDe`).
 */
export function allHexes(): readonly Hex[] {
  return TODAS_LAS_CASILLAS;
}
