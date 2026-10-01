/**
 * La cámara del mapa de aventura: zoom, arrastre y centrado.
 *
 * Pura a propósito —ni lienzo ni DOM—: la cuenta de píxel a casilla es la que
 * decide a dónde va un héroe al hacer clic, y una cuenta así se prueba, no se
 * mira. Las cifras (casillas de 44 a 110 píxeles, saltos de 12) son las de
 * `aventura/map-view.ts` de la rama `archivo/gpt-rpg`.
 */
import type { Point } from '@core/types.js';

export const TILE_MIN = 44;
export const TILE_MAX = 110;
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
  const tile = Math.max(TILE_MIN, Math.min(TILE_MAX, c.tile));
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
  const tile = Math.max(TILE_MIN, Math.min(TILE_MAX, c.tile + direccion * TILE_PASO));
  const mundoX = ancla.x / c.tile + c.x;
  const mundoY = ancla.y / c.tile + c.y;
  return acotar({ tile, x: mundoX - ancla.x / tile, y: mundoY - ancla.y / tile }, e);
}

/** Arrastrar `dx, dy` píxeles: el mundo se mueve con el dedo. */
export function arrastrar(c: CamaraMapa, dx: number, dy: number, e: Encuadre): CamaraMapa {
  return acotar({ tile: c.tile, x: c.x - dx / c.tile, y: c.y - dy / c.tile }, e);
}
