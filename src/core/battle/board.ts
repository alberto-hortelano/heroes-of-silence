/**
 * Rejilla de batalla: 11 × 9 = 99 hexes (verificado en `battle_board.h` de
 * fheroes2). Coordenadas offset **odd-r**: filas horizontales, y las filas
 * impares van desplazadas media celda a la derecha.
 */
import type { Hex } from '../types.js';
import type { Side } from './types.js';

export const BOARD_WIDTH = 11;
export const BOARD_HEIGHT = 9;
export const BOARD_SIZE = BOARD_WIDTH * BOARD_HEIGHT;

/** Columnas de salida de cada bando, contando desde su borde. */
export const COLUMNAS_DE_SALIDA = 3;

/** De qué bando es la zona de salida en la que cae `hex`, o `null` si no es de ninguno. */
export function bandoDeSalida(hex: Hex): Side | null {
  if (hex.col < COLUMNAS_DE_SALIDA) return 'attacker';
  if (hex.col >= BOARD_WIDTH - COLUMNAS_DE_SALIDA) return 'defender';
  return null;
}

export function isInside(h: Hex): boolean {
  return h.col >= 0 && h.col < BOARD_WIDTH && h.row >= 0 && h.row < BOARD_HEIGHT;
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
  const shift = h.row % 2 === 1 ? 1 : 0;
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
 * medio. Entre dos casillas del tablero lo de en medio también lo es: el
 * rectángulo odd-r no tiene entrantes.
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
 * de `+1, +2, −3` en unidades de `1/(N·EMPUJON)`: suma cero, así que el punto
 * sigue en el plano, y con él nunca hay empate (un medio exacto pediría que
 * `N·EMPUJON/2 ≡ 1, 2 o 3` módulo `EMPUJON`, y con 1 000 nunca pasa).
 */
export function lineaLibre(
  desde: Hex,
  hasta: Hex,
  bloqueadas: ReadonlySet<string>,
  cortes?: ReadonlySet<number>,
): boolean {
  const n = hexDistance(desde, hasta);
  if (cortes === undefined && n <= 1) return true;
  const a = toCube(desde);
  const b = toCube(hasta);
  const d = n * EMPUJON;
  let antes = indiceDe(desde);
  for (let i = 1; i < n; i++) {
    const q = (a.q * n + (b.q - a.q) * i) * EMPUJON + 1;
    const r = (a.r * n + (b.r - a.r) * i) * EMPUJON + 2;
    const sx = (a.s * n + (b.s - a.s) * i) * EMPUJON - 3;
    const h = deCubo(redondeoCubico(q, r, sx, d));
    if (bloqueadas.has(hexKey(h))) return false;
    if (cortes !== undefined) {
      const ahora = indiceDe(h);
      if (cortes.has(antes * BOARD_SIZE + ahora)) return false;
      antes = ahora;
    }
  }
  return cortes === undefined || !cortes.has(antes * BOARD_SIZE + indiceDe(hasta));
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
  return { col: c.q + (c.r - (c.r & 1)) / 2, row: c.r };
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

/** Índice plano de una casilla del tablero: `row * BOARD_WIDTH + col`. */
export function indiceDe(h: Hex): number {
  return h.row * BOARD_WIDTH + h.col;
}

/**
 * Las 99 casillas con su clave y sus vecinas, calculadas UNA vez.
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

const CASILLAS: readonly Casilla[] = (() => {
  const out: Casilla[] = [];
  for (let row = 0; row < BOARD_HEIGHT; row++) {
    for (let col = 0; col < BOARD_WIDTH; col++) {
      const hex = { col, row };
      const vecinas = vecinasCalculadas(hex);
      out.push({ hex, key: hexKey(hex), vecinas, indicesVecinas: vecinas.map(indiceDe) });
    }
  }
  return out;
})();

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
  const q = h.col - (h.row - (h.row % 2)) / 2;
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

// -------------------------------------------------------------- ocupación

/**
 * Una unidad grande ocupa su hex de cabeza y el de detrás. "Detrás" depende del
 * bando: el atacante mira a la derecha, así que su cola queda a la izquierda.
 */
export function occupiedHexes(head: Hex, size: number, facingRight: boolean): Hex[] {
  if (size <= 1) return [head];
  const tail: Hex = { col: facingRight ? head.col - 1 : head.col + 1, row: head.row };
  return [head, tail];
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
 * BFS sobre la tabla de `CASILLAS`: con 99 casillas el algoritmo no tiene nada
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

/** Todos los hexes del tablero, de arriba abajo y de izquierda a derecha. */
export function allHexes(): Hex[] {
  const out: Hex[] = [];
  for (let row = 0; row < BOARD_HEIGHT; row++) {
    for (let col = 0; col < BOARD_WIDTH; col++) out.push({ col, row });
  }
  return out;
}
