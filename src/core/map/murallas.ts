/**
 * La muralla es el cierre de un paso (#232): un tramo corto con su puerta —el
 * nodo de muro, el fuerte que se asalta— que tapa el hueco entre dos apoyos
 * naturales, uno a cada lado del paso.
 *
 * «Las murallas quedan mal, no tienen sentido, son trozos de muralla en mitad
 * de ningún sitio y ocupando lo que serían extensiones enormes» (el usuario,
 * marca en s42644 (13, 1): una torre suelta en lo alto de unos cultivos y un
 * lienzo de norte a sur que acababa en una ciudad).
 *
 * Aquí está la regla, una vez, sobre una rejilla cualquiera: la leen el
 * generador al recortar cada franja de muro (`vestir.ts`, paso 7) y el guardia
 * y la medida sobre el mapa hecho (`murallasDelMapa`).
 */

import type { GameMap } from './map.js';
import { BARRERAS_DE_DESNIVEL, type Barrera, esBarrera, type TerrainKind } from './terrain.js';

/**
 * Lo más largo que mide una muralla, en casillas: el lado mayor de la caja de
 * su línea, de un apoyo al otro pasando por la puerta.
 *
 * Con #208 era el tope de una franja de muro cualquiera (6). Ahora la muralla
 * es la línea que cierra un paso, y 6 deja la puerta y hasta cinco casillas de
 * lienzo: un fuerte, no una frontera. Lo que no cierra con eso no es un paso
 * entre dos apoyos sino una frontera abierta, que es lo que el usuario no quiere.
 */
export const LARGO_MAXIMO_DE_MURALLA = 6;

/**
 * Las barreras en que se apoya una muralla: las que no se cruzan sin un paso y
 * que el usuario nombró (#232: «montaña, acantilado, agua o el borde del
 * mapa»). Son las de desnivel; el bosque no, que es una frontera como el muro
 * y un fuerte entre dos arboledas no cierra nada que no cerrara el bosque.
 */
export const APOYOS_DE_MURALLA: readonly Barrera[] = BARRERAS_DE_DESNIVEL;

/**
 * Los ejes de una puerta, en el orden en que se prueban: los rectos y luego los
 * diagonales, como `ejeDelNodo` en el generador.
 */
const EJES: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [1, -1],
  [1, 1],
];

const OCHO: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

export interface RejillaDeMuralla {
  readonly W: number;
  readonly H: number;
  /** Si la casilla es de esta muralla: su muro o una puerta. */
  readonly enLaMuralla: (i: number) => boolean;
  /** Si la casilla es una barrera que sostiene una muralla (`APOYOS_DE_MURALLA`). */
  readonly esApoyo: (i: number) => boolean;
  /** Si la casilla se pisa: de ahí sale el eje de la puerta. */
  readonly sePisa: (i: number) => boolean;
}

/** La línea de una puerta: ella y sus dos brazos, cada uno hasta su apoyo. */
export interface LineaDeMuralla {
  /** Las casillas, la puerta primero. */
  readonly casillas: readonly number[];
  /** El lado mayor de su caja. */
  readonly largo: number;
  /** El eje de la puerta: por dónde se cruza, de una casilla que se pisa a la opuesta. */
  readonly eje: readonly [number, number];
}

/**
 * La línea más corta que cierra el paso de la puerta `puerta`: de ella, por el
 * muro (en ocho vecinas), a una casilla que toca un apoyo a cada lado del paso.
 * El lado es el del eje de la puerta (las dos vecinas opuestas que se pisan): un
 * apoyo a la izquierda del eje y otro a la derecha. Fuera del mapa es apoyo: el
 * borde cierra como una montaña.
 *
 * Devuelve el motivo, escrito para la persona, si no la hay: sin eje (la puerta
 * no está entre dos casillas que se pisan) o sin apoyo por un lado.
 *
 * La búsqueda es en anchura, con las vecinas en orden fijo: la más corta, y en
 * un empate la primera que se descubre, igual en el generador y en el guardia.
 */
export function lineaDeLaPuerta(r: RejillaDeMuralla, puerta: number): LineaDeMuralla | string {
  const { W, H } = r;
  const gx = puerta % W;
  const gy = (puerta - gx) / W;
  const pisa = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < W && y < H && r.sePisa(y * W + x);
  const eje = EJES.find(([dx, dy]) => pisa(gx + dx, gy + dy) && pisa(gx - dx, gy - dy));
  if (eje === undefined)
    return `la puerta (${gx},${gy}) no está entre dos casillas que se pisan, y sin eje no tiene lados que cerrar`;
  const [ex, ey] = eje;
  /** De qué lado del eje cae un punto: 1, −1 o 0 si está en él. */
  const lado = (x: number, y: number): number => {
    const v = ex * (y - gy) - ey * (x - gx);
    return v > 0 ? 1 : v < 0 ? -1 : 0;
  };

  const previo = new Map<number, number>([[puerta, puerta]]);
  const cola = [puerta];
  const hasta = new Map<number, number>();
  for (let q = 0; q < cola.length && hasta.size < 2; q++) {
    const c = cola[q] as number;
    const cx = c % W;
    const cy = (c - cx) / W;
    for (const [dx, dy] of OCHO) {
      const x = cx + dx;
      const y = cy + dy;
      const fuera = x < 0 || y < 0 || x >= W || y >= H;
      const j = y * W + x;
      if (!fuera && r.enLaMuralla(j)) {
        if (!previo.has(j)) {
          previo.set(j, c);
          cola.push(j);
        }
        continue;
      }
      if (!fuera && !r.esApoyo(j)) continue;
      const s = lado(x, y);
      if (s !== 0 && !hasta.has(s)) hasta.set(s, c);
    }
  }
  for (const s of [1, -1]) {
    if (!hasta.has(s))
      return `la puerta (${gx},${gy}) no llega por el muro a una montaña, un acantilado, el agua o el borde a ${s > 0 ? 'un' : 'otro'} lado de su paso`;
  }
  const casillas = new Set<number>([puerta]);
  for (const fin of hasta.values())
    for (let c = fin; c !== puerta; c = previo.get(c) as number) casillas.add(c);
  const lista = [...casillas];
  const xs = lista.map((c) => c % W);
  const ys = lista.map((c) => Math.floor(c / W));
  const largo = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 1;
  return { casillas: lista, largo, eje };
}

/**
 * Lo que se queda de muro alrededor de una línea: ella y las casillas de la
 * muralla pegadas a ella (Chebyshev 1) que caen entre sus dos puntas a lo largo
 * del paso. Es el grosor de la frontera en el hueco: la escena traza una línea
 * por él y lo demás es escombro. Sin él, el grosor de la frontera pasaría a
 * montaña o agua delante y detrás del lienzo, tapándolo.
 */
export function muroDeLaLinea(
  W: number,
  linea: LineaDeMuralla,
  franja: readonly number[],
): number[] {
  const enLinea = new Set(linea.casillas);
  const puerta = linea.casillas[0] as number;
  const gx = puerta % W;
  const gy = Math.floor(puerta / W);
  const [ex, ey] = linea.eje;
  // A lo largo del paso, la coordenada que mide el lado en `lineaDeLaPuerta`:
  // su mínimo y su máximo en la línea son las puntas.
  const a = (c: number): number => ex * (Math.floor(c / W) - gy) - ey * ((c % W) - gx);
  const as = linea.casillas.map(a);
  const min = Math.min(...as);
  const max = Math.max(...as);
  return franja.filter((c) => {
    if (enLinea.has(c)) return true;
    if (a(c) < min || a(c) > max) return false;
    const x = c % W;
    const y = Math.floor(c / W);
    return linea.casillas.some(
      (l) => Math.max(Math.abs((l % W) - x), Math.abs(Math.floor(l / W) - y)) <= 1,
    );
  });
}

/**
 * Las casillas junto a una ciudad (Chebyshev ≤ 1, lo que tapa su pieza): ni
 * llevan muralla ni la sostienen. Un lienzo que llega a una ciudad no cierra
 * nada —es el de norte a sur de la marca de s42644—, y el peñasco que el
 * generador deja a su lado (`sinAguaEnLasEsquinas`) no se ve bajo su pieza: con
 * él de apoyo, la muralla de s30 (12,1)-(12,4) bajaba hasta la ciudad.
 */
export function juntoACiudad(W: number, H: number, ciudades: readonly number[]): Uint8Array {
  const junto = new Uint8Array(W * H);
  for (const c of ciudades) {
    const cx = c % W;
    const cy = Math.floor(c / W);
    for (let y = Math.max(0, cy - 1); y <= Math.min(H - 1, cy + 1); y++)
      for (let x = Math.max(0, cx - 1); x <= Math.min(W - 1, cx + 1); x++) junto[y * W + x] = 1;
  }
  return junto;
}

/** Una muralla del mapa hecho, con lo que le falta para ser el cierre de un paso. */
export interface MurallaDelMapa {
  /** Sus casillas: el muro y sus puertas, 8-conexo. */
  readonly casillas: readonly number[];
  /** Las casillas de sus puertas: los nodos de muro. */
  readonly puertas: readonly number[];
  /** El lado mayor de su caja. */
  readonly largo: number;
  /** Por qué no cierra un paso, una frase por motivo; vacío si lo cierra. */
  readonly sinApoyo: readonly string[];
}

/**
 * Las murallas de un mapa como las une la escena —el muro y los nodos de muro,
 * 8-conexo— y, de cada una, por qué no es el cierre de un paso: sin puerta, una
 * puerta sin sus dos apoyos a `LARGO_MAXIMO_DE_MURALLA`, junto a una ciudad
 * (`juntoACiudad`) o la muralla entera más larga que eso. Es el guardia de #232 y su medida (`tools/qa/murallas.ts`).
 */
export function murallasDelMapa(map: GameMap): MurallaDelMapa[] {
  const W = map.width;
  const indice = (p: { readonly x: number; readonly y: number }) => p.y * W + p.x;
  return murallasDeLaRejilla(
    W,
    map.height,
    (i) => map.terrain[i] as TerrainKind,
    map.objects.filter((o) => o.kind === 'node' || o.kind === 'town').map((o) => indice(o.at)),
    map.objects.filter((o) => o.kind === 'node' && o.barrera === 'wall').map((o) => indice(o.at)),
    map.objects.filter((o) => o.kind === 'town').map((o) => indice(o.at)),
  );
}

/**
 * `murallasDelMapa` sobre una rejilla: el terreno de cada casilla (bajo un nodo
 * o una ciudad no se mira), las casillas de los nodos y ciudades, las de las
 * puertas (los nodos de muro) y las de las ciudades. Lo usa el generador para
 * dar por malo el vestido que lo de después del engorde deja con una muralla
 * sin apoyo (una esquina torcida que se abre a su región).
 */
export function murallasDeLaRejilla(
  W: number,
  H: number,
  terreno: (i: number) => TerrainKind,
  nodos: readonly number[],
  puertasDeMuro: readonly number[],
  ciudades: readonly number[],
): MurallaDelMapa[] {
  const en = new Uint8Array(W * H);
  const esNodo = new Uint8Array(W * H);
  for (const n of nodos) esNodo[n] = 1;
  for (let i = 0; i < W * H; i++) if (esNodo[i] === 0 && terreno(i) === 'wall') en[i] = 1;
  const puertas = new Set(puertasDeMuro);
  for (const p of puertas) en[p] = 1;
  const ciudad = juntoACiudad(W, H, ciudades);
  const vista = new Uint8Array(W * H);
  const fuera: MurallaDelMapa[] = [];
  for (let i = 0; i < W * H; i++) {
    if (en[i] === 0 || vista[i] === 1) continue;
    vista[i] = 1;
    const casillas = [i];
    for (let q = 0; q < casillas.length; q++) {
      const c = casillas[q] as number;
      for (const [dx, dy] of OCHO) {
        const x = (c % W) + dx;
        const y = Math.floor(c / W) + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const j = y * W + x;
        if (en[j] === 0 || vista[j] === 1) continue;
        vista[j] = 1;
        casillas.push(j);
      }
    }
    const suya = new Set(casillas);
    const rejilla: RejillaDeMuralla = {
      W,
      H,
      enLaMuralla: (j) => suya.has(j),
      esApoyo: (j) =>
        esNodo[j] === 0 &&
        ciudad[j] === 0 &&
        (APOYOS_DE_MURALLA as readonly TerrainKind[]).includes(terreno(j)),
      sePisa: (j) => en[j] === 0 && (esNodo[j] === 1 || !esBarrera(terreno(j))),
    };
    const xs = casillas.map((c) => c % W);
    const ys = casillas.map((c) => Math.floor(c / W));
    const largo =
      Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 1;
    const deEsta = casillas.filter((c) => puertas.has(c)).sort((a, b) => a - b);
    const sinApoyo: string[] = [];
    if (deEsta.length === 0) sinApoyo.push('no tiene puerta: no cierra ningún paso');
    for (const p of deEsta) {
      const linea = lineaDeLaPuerta(rejilla, p);
      if (typeof linea === 'string') sinApoyo.push(linea);
      else if (linea.largo > LARGO_MAXIMO_DE_MURALLA)
        sinApoyo.push(
          `la puerta (${p % W},${Math.floor(p / W)}) llega a sus apoyos con una línea de ${linea.largo}, más de ${LARGO_MAXIMO_DE_MURALLA}`,
        );
    }
    const enLaCiudad = casillas.find((c) => ciudad[c] === 1);
    if (enLaCiudad !== undefined)
      sinApoyo.push(
        `llega a una ciudad por (${enLaCiudad % W},${Math.floor(enLaCiudad / W)}): una muralla no acaba en una ciudad`,
      );
    if (largo > LARGO_MAXIMO_DE_MURALLA)
      sinApoyo.push(`mide ${largo} de largo, más de ${LARGO_MAXIMO_DE_MURALLA}`);
    fuera.push({ casillas, puertas: deEsta, largo, sinApoyo });
  }
  return fuera;
}
