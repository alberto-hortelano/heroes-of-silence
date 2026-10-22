/**
 * Cómo se pinta cada tiempo y la noche: una fila por tiempo (`EFECTOS`), con su
 * cielo de detrás de la batalla. Un clima nuevo —nieve, ceniza, viento de
 * arena— es una fila más aquí y en `TIEMPOS` del núcleo: el mapa, la batalla y
 * las escenas laterales pintan cada campo de la fila, sin preguntar qué tiempo es.
 *
 * Las cifras son de mirar las capturas (`tools/qa/clima.ts`), no de ninguna
 * fuente. Dos maneras de cambiar la luz, que no se mezclan:
 *
 * - **la luz** (`luz`) oscurece multiplicando (`multiply`) hacia su color: la
 *   lluvia, la tormenta y la noche. Multiplicar conserva el contraste —lo oscuro
 *   sigue más oscuro que lo claro—, y por eso la noche se lee como noche y no
 *   como una bruma gris (con un velo encima, que es lo que hubo primero, lo negro
 *   se aclaraba hacia el azul y todo se agrisaba);
 * - **la bruma** (`bruma`, `bancos`) aclara hacia el blanco frío de la niebla:
 *   clara, fría y moviéndose, que es lo que la separa de la niebla de guerra
 *   (oscura, quieta y por casillas).
 */
import type { ClimaDelSitio, Tiempo } from '@core/state/clima.js';

/** Un color sin opacidad, de 0 a 255: el de la luz que se multiplica. */
export type Rgb = readonly [number, number, number];
/** Un color con su opacidad: la bruma se pinta encima, hacia ese color. */
export type Rgba = readonly [number, number, number, number];
/** El cielo de detrás de la batalla, de arriba al horizonte. */
export type Cielo = readonly [string, string, string];

export interface Lluvia {
  /** Gotas por cada 10 000 px² (CSS) de pantalla. */
  readonly densidad: number;
  /** Cuánto la tumba el viento: px de lado por px de caída. */
  readonly viento: number;
  readonly color: Rgba;
}

export interface Receta {
  /** La luz que deja: se multiplica por este color (`multiply`); `null`, toda. */
  readonly luz: Rgb | null;
  /** La bruma de todo el sitio: aclara hacia su color. */
  readonly bruma: Rgba | null;
  /** Los bancos de niebla que van a la deriva: su opacidad (el color es `COLOR_DE_LOS_BANCOS`). */
  readonly bancos: number | null;
  readonly lluvia: Lluvia | null;
  /** Los rayos: cada cuántos ms cae uno como poco y como mucho, en un mismo sitio. */
  readonly rayos: { readonly cada: readonly [number, number] } | null;
  /** El cielo de la batalla de día y de noche (con tormenta no se ve el sol). */
  readonly cielo: Cielo;
  readonly cieloDeNoche: Cielo;
}

/** El cielo de noche despejada: azul oscuro, con algo de luz en el horizonte. */
const NOCHE_CLARA: Cielo = ['#05070d', '#0e1526', '#1f2740'];
/** El de noche con nubes: casi negro. */
const NOCHE_CERRADA: Cielo = ['#040509', '#0a0e17', '#151a26'];

export const EFECTOS: Readonly<Record<Tiempo, Receta>> = {
  despejado: {
    luz: null,
    bruma: null,
    bancos: null,
    lluvia: null,
    rayos: null,
    // El atardecer de otoño de siempre: el azul pizarra arriba y el ocre de la
    // bruma en la línea de los árboles, la luz que ya tiene el empedrado.
    cielo: ['#27303b', '#5b5e58', '#a58c5c'],
    cieloDeNoche: NOCHE_CLARA,
  },
  niebla: {
    luz: null,
    bruma: [196, 206, 214, 0.14],
    bancos: 0.44,
    lluvia: null,
    rayos: null,
    cielo: ['#7a8188', '#a2a6a4', '#c1bcae'],
    cieloDeNoche: NOCHE_CLARA,
  },
  lluvia: {
    luz: [182, 190, 204],
    bruma: null,
    bancos: null,
    lluvia: { densidad: 2.4, viento: 0.22, color: [200, 214, 232, 0.55] },
    rayos: null,
    cielo: ['#2b3139', '#4b5157', '#6b6c68'],
    cieloDeNoche: NOCHE_CERRADA,
  },
  tormenta: {
    luz: [150, 160, 182],
    bruma: null,
    bancos: null,
    lluvia: { densidad: 3.6, viento: 0.38, color: [210, 222, 240, 0.65] },
    rayos: { cada: [4000, 9000] },
    cielo: ['#12161d', '#242930', '#3a3d41'],
    cieloDeNoche: NOCHE_CERRADA,
  },
};

/**
 * La noche, encima del tiempo: una luz azul oscura que se multiplica (deja algo
 * menos de la mitad de la luz, y más en el azul), y la luz cálida de los fuegos
 * (ciudades, pueblos, puertas de la base), que abren un hueco en ella.
 */
export const NOCHE = {
  luz: [92, 116, 178] as Rgb,
  /** El color del resplandor de un fuego de noche, en `lighter`. */
  fuego: [255, 170, 84, 0.6] as Rgba,
} as const;

/** El color de los bancos de niebla: claro y frío. */
export const COLOR_DE_LOS_BANCOS: Rgb = [222, 230, 238];

/** `a` por `b`, canal a canal, como hace `multiply`. */
export function multiplicar(a: Rgb, b: Rgb): Rgb {
  return [(a[0] * b[0]) / 255, (a[1] * b[1]) / 255, (a[2] * b[2]) / 255];
}

/** La luz de un sitio: la de su tiempo por la de la noche; `null` si no oscurece nada. */
export function luzDe(sitio: ClimaDelSitio): Rgb | null {
  const t = EFECTOS[sitio.tiempo].luz;
  if (!sitio.noche) return t;
  return t === null ? NOCHE.luz : multiplicar(t, NOCHE.luz);
}

/** El cielo de detrás del campo de batalla, de arriba al horizonte. */
export function cieloDe(sitio: ClimaDelSitio): Cielo {
  const r = EFECTOS[sitio.tiempo];
  return sitio.noche ? r.cieloDeNoche : r.cielo;
}

export const css = (c: Rgb | Rgba, alfa = (c as readonly number[])[3] ?? 1): string =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alfa})`;
