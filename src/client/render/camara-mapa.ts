/**
 * La cámara del mapa de aventura: zoom, arrastre y centrado.
 *
 * Pura a propósito —ni lienzo ni DOM—: la cuenta de píxel a casilla es la que
 * decide a dónde va un héroe al hacer clic, y una cuenta así se prueba, no se
 * mira. El tope de acercar y los saltos de 12 son los de `aventura/map-view.ts`
 * de la rama `archivo/gpt-rpg`; el de alejar ya no es una cifra fija: sale de
 * cuántos volúmenes de la escena entrarían en la vista (`tileMinimo`).
 */
import type { Point } from '@core/types.js';

export const TILE_MAX = 110;
/**
 * Por debajo de esto no se aleja, quepan los volúmenes que quepan: a 40 px una
 * figura ya se lee (decisión del usuario). El resto del mapa se ve en el
 * minimapa.
 */
export const TILE_LEGIBLE = 40;
/**
 * Cuántos volúmenes de la escena —árboles, picos, muros, objetos— se pintan
 * como mucho en un fotograma (decisión del usuario). Medido en el
 * Chromium sin GPU de `pnpm capturas`: con el reparto real de un 34×34, 2 000
 * cuestan 4,3-4,7 ms; apilados en el caso peor, 7,6-8,3 ms. Deja sitio a las
 * figuras, la niebla y la copia del suelo dentro de un fotograma de 16 ms.
 */
export const MAX_VOLUMENES_VISIBLES = 2000;
/** Casillas de más alrededor de la vista: lo que está fuera pero asoma dentro. */
export interface Margen {
  readonly lados: number;
  readonly arriba: number;
  readonly abajo: number;
}

/**
 * Dónde puede estar la base de un volumen que asoma en la vista: se apoya por su
 * base y crece hacia arriba (abajo, 3) y a los lados (2). Lo leen el recorte de
 * cada fotograma y la cuenta del tope, que tienen que contar lo mismo.
 */
export const MARGEN_DE_VOLUMEN: Margen = { lados: 2, arriba: 0, abajo: 3 };
const TILE_PASO = 12;
/** El zoom con el que se abre la partida. Lo lee también el guion de capturas. */
export const TILE_INICIAL = 70;

export interface CamaraMapa {
  /** Píxeles por casilla. */
  readonly tile: number;
  /** Qué punto del mundo, en casillas, cae en la esquina superior izquierda. */
  readonly x: number;
  readonly y: number;
}

/** Lo que la cámara necesita saber del lienzo y del mapa para no salirse. */
export interface Encuadre {
  readonly ancho: number;
  readonly alto: number;
  readonly mapaAncho: number;
  readonly mapaAlto: number;
  /** El tope de alejar, de `tileMinimo`. Sin él, `TILE_LEGIBLE`. */
  readonly tileMinimo?: number;
}

/**
 * Cuántos volúmenes tiene apoyados cada casilla, como suma prefija: `suma` mide
 * (W+1)×(H+1) y `suma[y·(W+1)+x]` cuenta los de las casillas de x' < x, y' < y.
 * Con eso, lo que cae en cualquier ventana sale de cuatro lecturas.
 */
export interface ConteoDeVolumenes {
  readonly W: number;
  readonly H: number;
  readonly suma: Int32Array;
}

/**
 * Las casillas [x0, x1) × [y0, y1) que toca la vista de `ancho × alto` píxeles,
 * con el margen `m`, sin recortar al mapa. Una vista de n casillas y pico toca
 * n + 1 columnas.
 */
export function ventanaDeCasillas(
  c: CamaraMapa,
  ancho: number,
  alto: number,
  m: Margen,
): { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number } {
  const x0 = Math.floor(c.x) - m.lados;
  const y0 = Math.floor(c.y) - m.arriba;
  return {
    x0,
    y0,
    x1: x0 + Math.ceil(ancho / c.tile) + 1 + 2 * m.lados,
    y1: y0 + Math.ceil(alto / c.tile) + 1 + m.arriba + m.abajo,
  };
}

/** El conteo de unas bases (en casillas, con decimales): cada una cuenta en su casilla. */
export function contarVolumenes(
  W: number,
  H: number,
  bases: Iterable<{ readonly x: number; readonly y: number }>,
): ConteoDeVolumenes {
  const W1 = W + 1;
  const suma = new Int32Array(W1 * (H + 1));
  for (const b of bases) {
    const x = Math.min(W - 1, Math.max(0, Math.floor(b.x)));
    const y = Math.min(H - 1, Math.max(0, Math.floor(b.y)));
    suma[(y + 1) * W1 + x + 1]! += 1;
  }
  for (let y = 1; y <= H; y++)
    for (let x = 1; x <= W; x++)
      suma[y * W1 + x]! +=
        suma[(y - 1) * W1 + x]! + suma[y * W1 + x - 1]! - suma[(y - 1) * W1 + x - 1]!;
  return { W, H, suma };
}

/** Los volúmenes apoyados en las casillas [x0, x1) × [y0, y1), recortado al mapa. */
export function volumenesEn(
  c: ConteoDeVolumenes,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const W1 = c.W + 1;
  const ax = Math.max(0, Math.min(c.W, x0));
  const bx = Math.max(0, Math.min(c.W, x1));
  const ay = Math.max(0, Math.min(c.H, y0));
  const by = Math.max(0, Math.min(c.H, y1));
  if (bx <= ax || by <= ay) return 0;
  return (
    c.suma[by * W1 + bx]! - c.suma[ay * W1 + bx]! - c.suma[by * W1 + ax]! + c.suma[ay * W1 + ax]!
  );
}

/**
 * Lo más que se pintaría a `tile` px por casilla, mire donde mire la cámara: la
 * ventana más densa del mapa del tamaño de la vista, con el margen de lo que se
 * pinta fuera porque asoma.
 */
export function volumenesALoSumo(
  c: ConteoDeVolumenes,
  tile: number,
  ancho: number,
  alto: number,
): number {
  const v = ventanaDeCasillas({ tile, x: 0, y: 0 }, ancho, alto, MARGEN_DE_VOLUMEN);
  const w = v.x1 - v.x0;
  const h = v.y1 - v.y0;
  let max = 0;
  for (let y0 = Math.min(0, c.H - h); y0 <= Math.max(0, c.H - h); y0++)
    for (let x0 = Math.min(0, c.W - w); x0 <= Math.max(0, c.W - w); x0++)
      max = Math.max(max, volumenesEn(c, x0, y0, x0 + w, y0 + h));
  return max;
}

/**
 * El tope de alejar: la menor casilla, en píxeles enteros, a la que la ventana
 * más densa del mapa no pasa de `MAX_VOLUMENES_VISIBLES`, y nunca por debajo de
 * `TILE_LEGIBLE` ni por encima de `TILE_MAX`. No depende de a dónde mire la
 * cámara —la ventana es la peor de todas—, así que no salta al arrastrar.
 *
 * Es un tope por número de sprites y no por zoom porque cuántos caben depende
 * del tamaño de la pantalla (decisión del usuario): en un lienzo grande el tope
 * sube solo.
 *
 * Y no siempre se puede cumplir: en un lienzo enorme (7680×4320) ni a `TILE_MAX`
 * caben, y gana `TILE_MAX`. Entonces `exceso` dice cuántos volúmenes se pintan
 * de más en la ventana más densa; con 0, se cumple. El coste de pintarlos lo
 * acota además el presupuesto de píxeles del mapa (`PIXELES_DEL_MAPA`).
 */
export function tileMinimo(
  c: ConteoDeVolumenes,
  ancho: number,
  alto: number,
): { readonly tile: number; readonly exceso: number } {
  const cuantos = (t: number) => volumenesALoSumo(c, t, ancho, alto);
  const cabe = (t: number) => cuantos(t) <= MAX_VOLUMENES_VISIBLES;
  if (cabe(TILE_LEGIBLE)) return { tile: TILE_LEGIBLE, exceso: 0 };
  if (!cabe(TILE_MAX))
    return { tile: TILE_MAX, exceso: cuantos(TILE_MAX) - MAX_VOLUMENES_VISIBLES };
  let bajo = TILE_LEGIBLE; // no cabe
  let alto_ = TILE_MAX; // cabe
  while (alto_ - bajo > 1) {
    const medio = Math.floor((bajo + alto_) / 2);
    if (cabe(medio)) alto_ = medio;
    else bajo = medio;
  }
  return { tile: alto_, exceso: 0 };
}

/** El tope de alejar de un encuadre: el suyo, o `TILE_LEGIBLE` mientras no lo tenga. */
export function topeDe(e: Encuadre): number {
  return e.tileMinimo ?? TILE_LEGIBLE;
}

/** El tile dentro de sus topes. */
function enSusTopes(tile: number, e: Encuadre): number {
  return Math.max(topeDe(e), Math.min(TILE_MAX, tile));
}

/** El centro de una casilla en pantalla. */
export function casillaAPixel(c: CamaraMapa, p: Point): { x: number; y: number } {
  return { x: (p.x + 0.5 - c.x) * c.tile, y: (p.y + 0.5 - c.y) * c.tile };
}

/** Un punto del mundo (casillas, con decimales) en pantalla. */
export function mundoAPixel(c: CamaraMapa, x: number, y: number): { x: number; y: number } {
  return { x: (x - c.x) * c.tile, y: (y - c.y) * c.tile };
}

/** La casilla bajo un píxel. Puede caer fuera del mapa: lo mira quien llama. */
export function pixelACasilla(c: CamaraMapa, px: number, py: number): Point {
  return { x: Math.floor(px / c.tile + c.x), y: Math.floor(py / c.tile + c.y) };
}

/**
 * La cámara dentro del mapa: no se enseña más que media casilla de vacío por
 * cada lado. Si el mapa entero cabe en el lienzo, se centra, en vez de quedarse
 * pegado a una esquina con medio lienzo negro al lado.
 */
export function acotar(c: CamaraMapa, e: Encuadre): CamaraMapa {
  const tile = enSusTopes(c.tile, e);
  const enCasillasX = e.ancho / tile;
  const enCasillasY = e.alto / tile;
  const eje = (v: number, enCasillas: number, lado: number): number =>
    enCasillas >= lado + 1
      ? (lado - enCasillas) / 2
      : Math.max(-0.5, Math.min(lado - enCasillas + 0.5, v));
  return {
    tile,
    x: eje(c.x, enCasillasX, e.mapaAncho),
    y: eje(c.y, enCasillasY, e.mapaAlto),
  };
}

/** La cámara con `p` en el centro del lienzo, acotada. */
export function centrarEn(c: CamaraMapa, p: Point, e: Encuadre): CamaraMapa {
  return acotar(
    {
      tile: c.tile,
      x: p.x + 0.5 - e.ancho / c.tile / 2,
      y: p.y + 0.5 - e.alto / c.tile / 2,
    },
    e,
  );
}

/**
 * Un paso de zoom (`+1` acerca, `-1` aleja) sin mover lo que hay bajo `ancla`
 * —el puntero, o el centro si no se da—: si no, la rueda hacía saltar el mapa
 * hacia la esquina.
 */
export function zoom(
  c: CamaraMapa,
  direccion: 1 | -1,
  e: Encuadre,
  ancla: { x: number; y: number } = { x: e.ancho / 2, y: e.alto / 2 },
): CamaraMapa {
  const tile = enSusTopes(c.tile + direccion * TILE_PASO, e);
  const mundoX = ancla.x / c.tile + c.x;
  const mundoY = ancla.y / c.tile + c.y;
  return acotar({ tile, x: mundoX - ancla.x / tile, y: mundoY - ancla.y / tile }, e);
}

/** Arrastrar `dx, dy` píxeles: el mundo se mueve con el dedo. */
export function arrastrar(c: CamaraMapa, dx: number, dy: number, e: Encuadre): CamaraMapa {
  return acotar({ tile: c.tile, x: c.x - dx / c.tile, y: c.y - dy / c.tile }, e);
}
