/**
 * El río del generador procedimental (#144, río continuo, 16-10-2026).
 *
 * «No se ve como río, se ven zonas de agua dispersas, pero un río es algo
 * continuo» (el usuario, sobre el río que se elegía encadenando fronteras de
 * agua de la red ya hecha). Aquel río pasaba por las ciudades de los cruces, que
 * lo cortaban, y detrás lo partían las esquinas de las sendas, el agua
 * derramada y las orillas de las espigas: diecisiete escrituras del vestido, y
 * ninguna sabía que una casilla era del río.
 *
 * Así que **el río va primero**: una línea de agua de una casilla, 4-conexa, que
 * se traza después de las semillas y **antes** de repartir las regiones
 * (`intentarRed`), y las regiones se reparten por orilla. Por construcción
 * ninguna casilla del río toca tres regiones salvo donde se quiere, el espejo es
 * exacto y nada lo parte: el vestido lo escribe como agua una vez y nadie más
 * puede escribir en él (`ponerTipo`, `vestir.ts`). Al final del vestido,
 * `rioEntero` lo comprueba y lanza: un río partido es un fallo del generador.
 *
 * Todo en enteros y con el `rng` que se pasa.
 */
import { FORMAS_DEL_RIO, type FormaDelRio, type ReglasDelRio, RIOS } from '../data.js';
import type { Rng } from '../rng.js';
import type { Point } from '../types.js';
import { Frontera } from './frontera.js';
import { type GameMap, inBounds } from './map.js';
import { vecindad } from './regiones.js';
import type { Nivel } from './terrain.js';
import { parejaDe } from './vestir.js';

/** Lo que traza `trazarRio`: el río y sus lagos, en espejo exacto. */
export interface TrazadoDelRio {
  readonly forma: FormaDelRio;
  readonly W: number;
  readonly H: number;
  /** 1 en cada casilla del río, cauce y lagos. Su espejo (`N − 1 − i`) también lo es. */
  readonly mascara: Uint8Array;
  /** 1 en las casillas de sus lagos. */
  readonly lago: Uint8Array;
  /**
   * Cada río, como la lista de sus casillas: uno en la forma `frontera` (de un
   * borde al de enfrente por el lago del centro) y dos en las otras (el río y
   * su espejo).
   */
  readonly rios: readonly (readonly number[])[];
  /** La casilla del marco por la que sale cada boca, de todos los ríos. */
  readonly bocas: readonly number[];
}

/** Las cuatro direcciones del cauce, en el orden del Dijkstra; la opuesta de `d` es `d ^ 1`. */
const RUMBOS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Hasta qué distancia (Chebyshev) a la semilla más cercana se abarata el cauce.
 * Más allá, todo cuesta lo mismo: lejos de toda semilla es por donde va la
 * frontera entre dos celdas, y el río sigue esos valles.
 */
const LEJOS_DE_LAS_SEMILLAS = 7;
/** Lo que cuesta una casilla de cauce además de su lejanía, y la tirada de ruido de encima (de 0 a esto). */
const COSTE_BASE = 4;
const RUIDO = 6;
/** Ni a esto de una semilla: la casilla de la región sería del río. */
const LEJOS_DE_UNA_SEMILLA = 2;
/** La caja de cada casa que no se pisa: medio lado. */
const CAJA_DE_CASA = 5;

/** La forma del río, sorteada con los pesos de `data/rios.json`. */
export function sortearForma(rng: Rng, datos: ReglasDelRio = RIOS): FormaDelRio {
  const total = datos.formas.reduce((s, f) => s + f.peso, 0);
  let tirada = rng.int(0, total - 1);
  for (const { forma, peso } of datos.formas) {
    if (tirada < peso) return forma;
    tirada -= peso;
  }
  throw new Error(
    `el sorteo de la forma del río se ha salido de la tabla (${FORMAS_DEL_RIO.join(', ')})`,
  );
}

/**
 * El río de un mapa de `W × H` con las semillas de región `semillas` (las dos
 * primeras, las de casa), o `null` si con esta tirada no sale: la red se vuelve
 * a trazar con otra.
 *
 * El cauce es un **Dijkstra 4-conexo con estado** (casilla, rumbo, tirada): sin
 * media vuelta y sin tiradas rectas de más de `tramoMaximo` casillas (con un
 * Dijkstra sin tope, 20 de 40 mapas tenían una de 10 o más). Cada casilla cuesta
 * más cuanto más cerca está de una semilla, más un ruido del `rng`: el río va
 * por los valles entre celdas, y la red queda con regiones enteras a cada lado.
 * No pasa a `LEJOS_DE_UNA_SEMILLA` de una semilla ni por la caja de una casa, ni
 * por las `marco` casillas del borde salvo el canal de su boca: entre el río y
 * el borde no queda una tira de región.
 *
 * Se marca cada casilla y su espejo (`N − 1 − i`), y no vale (`null`) un cauce
 * que se toca a sí mismo o a su espejo en ocho vecinas fuera de un lago: sería
 * un río de dos o un bolsillo.
 */
export function trazarRio(
  rng: Rng,
  W: number,
  H: number,
  semillas: readonly Point[],
  forma: FormaDelRio,
  datos: ReglasDelRio = RIOS,
): TrazadoDelRio | null {
  const N = W * H;
  const { tramoMaximo, marco, radioDelLago, cursoDelLago } = datos;
  const coste = new Int32Array(N);
  const veta = new Uint8Array(N);
  const cercania = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    let d = W + H;
    for (const s of semillas) d = Math.min(d, Math.max(Math.abs(s.x - x), Math.abs(s.y - y)));
    cercania[i] = d;
    if (d <= LEJOS_DE_UNA_SEMILLA) veta[i] = 1;
    const cerca = LEJOS_DE_LAS_SEMILLAS - Math.min(d, LEJOS_DE_LAS_SEMILLAS);
    coste[i] = COSTE_BASE + cerca * cerca + rng.int(0, RUIDO);
  }
  for (const casa of semillas.slice(0, 2))
    for (let dy = -CAJA_DE_CASA; dy <= CAJA_DE_CASA; dy++)
      for (let dx = -CAJA_DE_CASA; dx <= CAJA_DE_CASA; dx++) {
        const x = casa.x + dx;
        const y = casa.y + dy;
        if (x >= 0 && y >= 0 && x < W && y < H) veta[y * W + x] = 1;
      }
  // Lo vetado por las semillas y las casas, sin el marco: por ahí no pasa ni
  // el canal de una boca ni un lago.
  const vetaDeDentro = Uint8Array.from(veta);
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (Math.min(x, y, W - 1 - x, H - 1 - y) < marco) veta[i] = 1;
  }
  /** El canal de una boca: de su casilla del marco hacia dentro, hasta pasar el `marco`. */
  const canal = (b: number): number[] => {
    const x = b % W;
    const y = (b - x) / W;
    const [dx, dy] = x === 0 ? [1, 0] : x === W - 1 ? [-1, 0] : y === 0 ? [0, 1] : [0, -1];
    const fuera: number[] = [];
    for (let k = 0; k <= marco; k++) fuera.push((y + k * dy) * W + x + k * dx);
    return fuera;
  };
  /**
   * Una boca, sorteada entre las casillas del marco de `candidatas` cuyo canal
   * no pasa junto a una semilla ni por una casa, con el canal abierto; o
   * `null` si no queda ninguna.
   */
  const boca = (candidatas: readonly number[]): number | null => {
    const validas = candidatas.filter((b) => canal(b).every((c) => vetaDeDentro[c] === 0));
    if (validas.length === 0) return null;
    const b = rng.pick(validas);
    for (const c of canal(b)) veta[c] = 0;
    return b;
  };
  /** Las casillas de una fila (`y`) o una columna (`x`) del marco, de `desde` a `hasta`. */
  const deArriba = (desde: number, hasta: number): number[] =>
    Array.from({ length: Math.max(0, hasta - desde + 1) }, (_, k) => desde + k);
  const deLaIzquierda = (desde: number, hasta: number): number[] =>
    deArriba(desde, hasta).map((y) => y * W);
  const deLaDerecha = (desde: number, hasta: number): number[] =>
    deArriba(desde, hasta).map((y) => y * W + W - 1);

  const mascara = new Uint8Array(N);
  const lago = new Uint8Array(N);
  /** Un lago de radio `radioDelLago` centrado en el punto de coordenadas dobladas (`cx2`, `cy2`). */
  const ponerLago = (cx2: number, cy2: number): number[] => {
    const r2 = 4 * radioDelLago * radioDelLago + 4 * radioDelLago + 2;
    const casillas: number[] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = 2 * x - cx2;
        const dy = 2 * y - cy2;
        if (dx * dx + dy * dy <= r2) casillas.push(y * W + x);
      }
    return casillas;
  };
  const espejo = (i: number): number => N - 1 - i;

  let cauce: number[] | null = null;
  let lagoDelCauce: number[] = [];
  const bocas: number[] = [];
  if (forma === 'frontera') {
    // Del borde de arriba o de la izquierda (en su mitad central) al lago del
    // centro; el espejo baja del lago al borde de enfrente. Las casas van en
    // las esquinas de arriba a la izquierda y de abajo a la derecha: el río
    // las separa.
    const a =
      rng.int(0, 1) === 0
        ? boca(deArriba(Math.floor(W / 4), Math.floor((3 * W) / 4)))
        : boca(deLaIzquierda(Math.floor(H / 4), Math.floor((3 * H) / 4)));
    if (a === null) return null;
    bocas.push(a);
    lagoDelCauce = ponerLago(W - 1, H - 1);
    const centro = Math.floor((H - 1) / 2) * W + Math.floor((W - 1) / 2);
    cauce = cauceEntre(W, H, coste, veta, tramoMaximo, a, centro);
  } else if (forma === 'esquina') {
    // De arriba a la derecha, por la esquina sin casa; el espejo, de abajo a la izquierda.
    const a = boca(deArriba(Math.floor(W / 3), W - 6));
    const b = boca(deLaDerecha(5, Math.floor((2 * H) / 3)));
    if (a === null || b === null) return null;
    bocas.push(a, b);
    cauce = cauceEntre(W, H, coste, veta, tramoMaximo, a, b);
  } else {
    // De arriba o de la derecha a un lago del cuadrante de arriba a la derecha,
    // donde quepa sin pisar una semilla ni una casa, y lejos de la boca: el
    // curso, del lago al borde, mide como poco `cursoDelLago` casillas (con un
    // lago junto al borde, el río de s83 eran 7 y se leía como un lago). Un
    // camino en cruz no es más corto que la distancia en cruz, que el lago
    // acorta en su radio: los sitios más cerca no pueden darlo.
    const a =
      rng.int(0, 1) === 0
        ? boca(deArriba(Math.floor(W / 3), W - 6))
        : boca(deLaDerecha(5, Math.floor(H / 2)));
    if (a === null) return null;
    const lejos = (i: number): boolean =>
      Math.abs((i % W) - (a % W)) +
        Math.abs(Math.floor(i / W) - Math.floor(a / W)) +
        1 -
        radioDelLago >=
      cursoDelLago;
    const sitios: number[] = [];
    for (let ly = 6; ly <= Math.floor(H / 2) - 2; ly++)
      for (let lx = Math.floor(W / 2); lx <= W - 8; lx++)
        if (lejos(ly * W + lx) && ponerLago(2 * lx, 2 * ly).every((c) => vetaDeDentro[c] === 0))
          sitios.push(ly * W + lx);
    if (sitios.length === 0) return null;
    bocas.push(a);
    const centro = rng.pick(sitios);
    lagoDelCauce = ponerLago(2 * (centro % W), 2 * Math.floor(centro / W));
    cauce = cauceEntre(W, H, coste, veta, tramoMaximo, a, centro);
    // Y medido: el cauce, fuera de su lago.
    if (cauce !== null) {
      const enElLago = new Set(lagoDelCauce);
      if (cauce.filter((i) => !enElLago.has(i)).length < cursoDelLago) return null;
    }
  }
  if (cauce === null || !sinTocarse(W, cauce)) return null;

  // El cauce, su lago y el espejo de todo.
  for (const i of lagoDelCauce) {
    lago[i] = 1;
    lago[espejo(i)] = 1;
  }
  // Un río no toca su espejo: ni su cauce ni su lago, en ocho vecinas. En la
  // forma frontera los dos llegan al lago del centro, que es el mismo, y ahí
  // (y en lo que lo toca) se juntan; en las otras son dos ríos, y un lago
  // junto al centro del mapa se juntaba con el suyo (s44).
  const { desde, vecinas } = vecindad(W, H);
  const delCurso = new Uint8Array(N);
  for (const i of [...cauce, ...lagoDelCauce]) delCurso[i] = 1;
  const juntoAlLago = (i: number): boolean => {
    if (forma !== 'frontera') return false;
    if (lago[i] === 1) return true;
    for (let v = desde[i]!; v < desde[i + 1]!; v++) if (lago[vecinas[v]!] === 1) return true;
    return false;
  };
  for (let i = 0; i < N; i++) {
    if (delCurso[i] === 0 || juntoAlLago(i)) continue;
    if (delCurso[espejo(i)] === 1) return null;
    for (let v = desde[i]!; v < desde[i + 1]!; v++) {
      const j = vecinas[v]!;
      if (delCurso[espejo(j)] === 1 && !juntoAlLago(j)) return null;
    }
  }
  for (const i of [...cauce, ...lagoDelCauce]) {
    mascara[i] = 1;
    mascara[espejo(i)] = 1;
  }
  // Ni una semilla en el río: su casilla es de su región (el lago del centro
  // de la frontera no elige sitio).
  for (const s of semillas) if (mascara[s.y * W + s.x] === 1) return null;
  const uno = [...new Set([...cauce, ...lagoDelCauce])];
  const otro = uno.map(espejo);
  const todasLasBocas = [...bocas, ...bocas.map(espejo)];
  return {
    forma,
    W,
    H,
    mascara,
    lago,
    rios: forma === 'frontera' ? [[...new Set([...uno, ...otro])]] : [uno, otro],
    bocas: todasLasBocas,
  };
}

/**
 * El cauce más barato de `a` a `b` en cruz, sin tiradas rectas de más de
 * `tramo` y sin pisar `veta` (salvo `b`), o `null`. El estado es (casilla,
 * rumbo, tirada), y la frontera de siempre (`Frontera`) desempata por orden de
 * descubrimiento.
 */
function cauceEntre(
  W: number,
  H: number,
  coste: Int32Array,
  veta: Uint8Array,
  tramo: number,
  a: number,
  b: number,
): number[] | null {
  const N = W * H;
  const T = tramo + 1;
  const estados = N * 4 * T;
  const estado = (i: number, d: number, r: number): number => (i * 4 + d) * T + r;
  const dist = new Int32Array(estados).fill(-1);
  const previo = new Int32Array(estados).fill(-1);
  const frontera = new Frontera(estados);
  for (let d = 0; d < 4; d++) {
    const e = estado(a, d, 0);
    dist[e] = coste[a] as number;
    frontera.push(e, dist[e] as number);
  }
  let fin = -1;
  for (let sale = frontera.pop(); sale !== undefined; sale = frontera.pop()) {
    const e = sale.key;
    if (sale.cost > (dist[e] as number)) continue;
    const r = e % T;
    const d = Math.floor(e / T) % 4;
    const u = Math.floor(e / T / 4);
    if (u === b) {
      fin = e;
      break;
    }
    const x = u % W;
    const y = (u - x) / W;
    for (let nd = 0; nd < 4; nd++) {
      if (r > 0 && (d ^ 1) === nd) continue;
      const nr = r > 0 && nd === d ? r + 1 : 1;
      if (nr > tramo) continue;
      const [dx, dy] = RUMBOS[nd] as readonly [number, number];
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const v = ny * W + nx;
      if (veta[v] === 1 && v !== b) continue;
      const ne = estado(v, nd, nr);
      const c = sale.cost + (coste[v] as number);
      if (dist[ne] !== -1 && (dist[ne] as number) <= c) continue;
      dist[ne] = c;
      previo[ne] = e;
      frontera.push(ne, c);
    }
  }
  if (fin === -1) return null;
  const cauce: number[] = [];
  for (let e = fin; e !== -1; e = previo[e] as number) cauce.push(Math.floor(e / T / 4));
  return cauce.reverse();
}

/**
 * Si el cauce no pasa dos veces por una casilla ni se toca a sí mismo en ocho
 * vecinas salvo con sus dos siguientes (el codo de un giro): con una U de dos
 * de ancho sería un río de dos, y con un lazo, un bolsillo.
 */
function sinTocarse(W: number, cauce: readonly number[]): boolean {
  const posicion = new Map<number, number>();
  for (const [k, i] of cauce.entries()) {
    if (posicion.has(i)) return false;
    posicion.set(i, k);
  }
  for (const [k, i] of cauce.entries()) {
    const x = i % W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (x + dx < 0 || x + dx >= W) continue;
        const q = posicion.get(i + dy * W + dx);
        if (q !== undefined && Math.abs(q - k) > 2) return false;
      }
  }
  return true;
}

/**
 * Las orillas del río: las componentes 8-conexas de lo que no es río, por
 * índice (−1 en el río). El cauce es 4-conexo y por eso las separa en ocho
 * vecinas: dos casillas de orillas distintas no se tocan ni por un vértice.
 */
export function orillas(W: number, H: number, mascara: Uint8Array): Int32Array {
  const N = W * H;
  const banco = new Int32Array(N).fill(-1);
  const { desde, vecinas } = vecindad(W, H);
  let n = 0;
  for (let i = 0; i < N; i++) {
    if (mascara[i] === 1 || banco[i] !== -1) continue;
    banco[i] = n;
    const cola = [i];
    for (let q = 0; q < cola.length; q++) {
      const u = cola[q] as number;
      for (let v = desde[u]!; v < desde[u + 1]!; v++) {
        const j = vecinas[v]!;
        if (mascara[j] === 1 || banco[j] !== -1) continue;
        banco[j] = n;
        cola.push(j);
      }
    }
    n++;
  }
  return banco;
}

/** Las ocho vecinas de una casilla en orden, dando la vuelta: su anillo. */
const ANILLO: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];

/**
 * A qué lado del río cae cada vecina de cada casilla suya: por casilla del río,
 * ocho números (en el orden de `ANILLO`), −1 en el río o fuera del mapa, y un
 * mismo número para lo que va seguido alrededor de ella sin cruzar el río. Dos
 * vecinas de lados distintos están en orillas opuestas **ahí**, aunque el río
 * no parta el mapa (el que nace en un lago se rodea por su cabecera). Lo leen
 * `alOtroLado` y `regionesDelRio`.
 */
export function ladosDelRio(W: number, H: number, mascara: Uint8Array): Int8Array {
  const N = W * H;
  const lados = new Int8Array(N * 8).fill(-1);
  for (let m = 0; m < N; m++) {
    if (mascara[m] === 0) continue;
    const x = m % W;
    const y = (m - x) / W;
    const tierra = ANILLO.map(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < W && ny < H && mascara[ny * W + nx] === 0;
    });
    // Desde una que no es tierra, cada tramo seguido de tierra es un lado.
    const inicio = tierra.indexOf(false);
    if (inicio === -1) {
      for (let k = 0; k < 8; k++) lados[m * 8 + k] = 0;
      continue;
    }
    let lado = -1;
    for (let p = 1; p <= 8; p++) {
      const k = (inicio + p) % 8;
      if (!tierra[k]) continue;
      if (!tierra[(k + 7) % 8]) lado++;
      lados[m * 8 + k] = lado;
    }
  }
  return lados;
}

/** La posición de `j` en el anillo de `m` (`ANILLO`), o −1 si no es vecina suya. */
function enElAnillo(W: number, m: number, j: number): number {
  const dx = (j % W) - (m % W);
  const dy = Math.floor(j / W) - Math.floor(m / W);
  return ANILLO.findIndex(([ax, ay]) => ax === dx && ay === dy);
}

/**
 * Si entre las casillas `i` y `q`, que no son del río, pasa el río: una casilla
 * suya pegada a las dos con cada una a un lado (`ladosDelRio`). Así quedan dos
 * regiones a dos pasos con el río en medio, que es la excepción a los tres
 * pasos del engorde.
 */
export function alOtroLado(
  W: number,
  H: number,
  mascara: Uint8Array,
  lados: Int8Array,
  i: number,
  q: number,
): boolean {
  const x = i % W;
  const y = (i - x) / W;
  const qx = q % W;
  const qy = (q - qx) / W;
  for (let my = Math.max(y, qy) - 1; my <= Math.min(y, qy) + 1; my++)
    for (let mx = Math.max(x, qx) - 1; mx <= Math.min(x, qx) + 1; mx++) {
      if (mx < 0 || my < 0 || mx >= W || my >= H) continue;
      const m = my * W + mx;
      if (mascara[m] === 0 || m === i || m === q) continue;
      const a = lados[m * 8 + enElAnillo(W, m, i)] as number;
      const b = lados[m * 8 + enElAnillo(W, m, q)] as number;
      if (a !== -1 && b !== -1 && a !== b) return true;
    }
  return false;
}

/**
 * Las regiones que tocan el río y las parejas que lo cruzan: dos regiones a
 * lados distintos de una misma casilla del río (`ladosDelRio`). La etiqueta de
 * lo que no es río es la de su celda, también en el muro de una orilla.
 */
export function regionesDelRio(
  W: number,
  H: number,
  mascara: Uint8Array,
  etiqueta: Int32Array,
): {
  readonly tocan: ReadonlySet<number>;
  readonly cruzan: readonly (readonly [number, number])[];
} {
  const N = W * H;
  const lados = ladosDelRio(W, H, mascara);
  const tocan = new Set<number>();
  const cruzan = new Map<string, readonly [number, number]>();
  for (let m = 0; m < N; m++) {
    if (mascara[m] === 0) continue;
    const x = m % W;
    const y = (m - x) / W;
    const alrededor: [number, number][] = [];
    for (const [k, [dx, dy]] of ANILLO.entries()) {
      const lado = lados[m * 8 + k] as number;
      if (lado === -1) continue;
      const r = etiqueta[(y + dy) * W + x + dx] as number;
      tocan.add(r);
      alrededor.push([r, lado]);
    }
    for (const [a, la] of alrededor)
      for (const [b, lb] of alrededor) if (a < b && la !== lb) cruzan.set(`${a}-${b}`, [a, b]);
  }
  return { tocan, cruzan: [...cruzan.values()] };
}

/**
 * Los niveles de las regiones con el río (#210: el agua va plana, a ras de la
 * más baja de las regiones que toca su franja), sin tirada y en espejo: lo que
 * se cambia a una región se cambia a su pareja (`parejaDe`), que toca el río
 * reflejado.
 *
 * - El río va al nivel 1 (el llano): ninguna región que lo toca va por debajo.
 *   La ciénaga, que va siempre abajo, sube al 1 si lo toca (decisión del
 *   usuario).
 * - Ni encajado: si una pareja que lo cruza tiene las dos orillas por encima,
 *   la de menor índice baja al 1. Si no, entre dos mesetas el río sería un
 *   cañón.
 *
 * Devuelve los niveles nuevos.
 */
export function nivelesDelRio(
  niveles: readonly Nivel[],
  tocan: ReadonlySet<number>,
  cruzan: readonly (readonly [number, number])[],
): Nivel[] {
  const fuera = [...niveles];
  const poner = (r: number, n: Nivel): void => {
    fuera[r] = n;
    fuera[parejaDe(r)] = n;
  };
  for (const r of [...tocan].sort((a, b) => a - b)) if ((fuera[r] as number) < 1) poner(r, 1);
  for (const [a, b] of cruzan) {
    if (Math.min(fuera[a] as number, fuera[b] as number) > 1) poner(Math.min(a, b), 1);
  }
  return fuera;
}

/**
 * Si cada río de `trazado` sigue entero en el mapa hecho, o por qué no: toda su
 * casilla es río (`esDelRio`: el agua, el puente o la ciudad-puente) y todo el
 * río es una sola componente 4-conexa que sale al marco. Lo mira el generador
 * al final del vestido, y si no, lanza: un río partido es un fallo suyo, no un
 * mapa raro que se arregle con otro intento.
 */
export function rioEntero(trazado: TrazadoDelRio, esDelRio: (i: number) => boolean): string | null {
  const { W, H } = trazado;
  const N = W * H;
  const comp = new Int32Array(N).fill(-1);
  for (const [k, rio] of trazado.rios.entries()) {
    const roto = rio.find((i) => !esDelRio(i));
    if (roto !== undefined) {
      return `el río ${k + 1} (${trazado.forma}) se corta en (${roto % W},${Math.floor(roto / W)}): esa casilla ya no es agua, ni puente ni ciudad-puente`;
    }
    const primera = rio[0] as number;
    if (comp[primera] === -1) {
      comp[primera] = primera;
      const cola = [primera];
      for (let q = 0; q < cola.length; q++) {
        const u = cola[q] as number;
        const x = u % W;
        const y = (u - x) / W;
        for (const [dx, dy] of RUMBOS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (comp[j] !== -1 || !esDelRio(j)) continue;
          comp[j] = primera;
          cola.push(j);
        }
      }
    }
    const suelta = rio.find((i) => comp[i] !== comp[primera]);
    if (suelta !== undefined)
      return `el río ${k + 1} (${trazado.forma}) va en dos trozos: (${suelta % W},${Math.floor(suelta / W)}) no llega por el agua a (${primera % W},${Math.floor(primera / W)})`;
    const conBoca = rio.some((i) => {
      const x = i % W;
      const y = (i - x) / W;
      return x === 0 || y === 0 || x === W - 1 || y === H - 1;
    });
    if (!conBoca) return `el río ${k + 1} (${trazado.forma}) no sale al borde del mapa`;
  }
  return null;
}

/** Lo que se lee de un mapa para saber de una ciudad-puente. */
export interface MapaDelRio {
  readonly width: number;
  readonly height: number;
  readonly terrain: readonly GameMap['terrain'][number][];
}

/**
 * Si la ciudad de `at` es una ciudad-puente: con agua en dos vecinas opuestas en
 * cruz, el río pasa por debajo de ella. Es la regla, una vez: la leen la medida
 * del río (`tools/qa/rios.ts`) y la escena, que la pinta en su orilla
 * (`orillaDeLaCiudad`).
 */
export function rioBajoLaCiudad(map: MapaDelRio, at: Point): boolean {
  return rumboDelRio(map, at) !== null;
}

/** Por dónde va el río bajo la ciudad de `at`: de este a oeste, de norte a sur, o `null` si no pasa. */
function rumboDelRio(map: MapaDelRio, at: Point): 'eo' | 'ns' | null {
  const agua = (dx: number, dy: number): boolean => {
    const p = { x: at.x + dx, y: at.y + dy };
    return inBounds(map, p) && map.terrain[p.y * map.width + p.x] === 'water';
  };
  if (agua(-1, 0) && agua(1, 0)) return 'eo';
  if (agua(0, -1) && agua(0, 1)) return 'ns';
  return null;
}

/**
 * La orilla de una ciudad-puente (#144, paso 2): la casilla de al lado, en cruz
 * y de través al río, donde se pinta la ciudad, y la de enfrente, adonde cruza
 * su puente. La ciudad va en el cruce de tres regiones: dos a un lado del río,
 * separadas por la frontera que llega a él (la T), y la tercera enfrente. Su
 * orilla es el lado de las dos: la casilla del final de esa frontera. Se elige
 * el lado con más regiones en su fila de tres (`regionDe`, −1 lo que no es
 * región); a la par, el que no se pisa en el medio (la barrera de la T); y si
 * no, el de la región de menor índice (en una base, la de su casa). `null` si
 * el río no pasa bajo la ciudad.
 */
export function orillaDeLaCiudad(
  map: MapaDelRio,
  at: Point,
  regionDe: Int32Array,
): { readonly orilla: Point; readonly enfrente: Point } | null {
  const rumbo = rumboDelRio(map, at);
  if (rumbo === null) return null;
  const W = map.width;
  const lado = (s: -1 | 1) => {
    const medio = rumbo === 'eo' ? { x: at.x, y: at.y + s } : { x: at.x + s, y: at.y };
    const regiones = new Set<number>();
    for (const k of [-1, 0, 1]) {
      const p = rumbo === 'eo' ? { x: at.x + k, y: at.y + s } : { x: at.x + s, y: at.y + k };
      if (!inBounds(map, p)) continue;
      const r = regionDe[p.y * W + p.x] as number;
      if (r >= 0) regiones.add(r);
    }
    const dentro = inBounds(map, medio);
    return {
      medio,
      regiones: regiones.size,
      sePisa: dentro && (regionDe[medio.y * W + medio.x] as number) >= 0,
      menor: regiones.size === 0 ? Number.MAX_SAFE_INTEGER : Math.min(...regiones),
      dentro,
    };
  };
  const a = lado(-1);
  const b = lado(1);
  if (!a.dentro || !b.dentro) return null;
  const primero =
    a.regiones !== b.regiones
      ? a.regiones > b.regiones
      : a.sePisa !== b.sePisa
        ? !a.sePisa
        : a.menor <= b.menor;
  return primero ? { orilla: a.medio, enfrente: b.medio } : { orilla: b.medio, enfrente: a.medio };
}
