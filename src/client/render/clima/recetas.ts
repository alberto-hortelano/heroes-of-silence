/**
 * Cómo se pinta cada tiempo y la noche: una fila por tiempo (`EFECTOS`) y el
 * cielo de detrás de la batalla (`cieloDe`). Un clima nuevo —nieve, ceniza,
 * viento de arena— es una fila más aquí y en `TIEMPOS` del núcleo.
 *
 * Las cifras son de mirar las capturas (`tools/qa/clima.ts`), no de ninguna
 * fuente: el velo oscurece o aclara hacia su color sin pasar de lo que deja
 * leer las figuras, y la niebla del clima es clara, fría y se mueve, que es lo
 * que la separa de la niebla de guerra (oscura, quieta y por casillas).
 */
import type { ClimaDelSitio, Tiempo } from '@core/state/clima.js';

/** Un color con su opacidad: el velo se pinta encima, hacia ese color. */
export type Rgba = readonly [number, number, number, number];

export interface Receta {
  /** El velo de todo el sitio: aclara (niebla) u oscurece (lluvia, tormenta) hacia su color. */
  readonly velo: Rgba | null;
  /** Los bancos de niebla que se mueven despacio: su color y opacidad máxima. */
  readonly niebla: Rgba | null;
  /** La lluvia: gotas por cada 10 000 px² de pantalla, cuánto la tumba el viento (px de lado por px de caída) y su color. */
  readonly lluvia: {
    readonly densidad: number;
    readonly viento: number;
    readonly color: Rgba;
  } | null;
  /** Los rayos: cada cuántos ms cae uno como poco y como mucho, en una misma región. */
  readonly rayos: { readonly cada: readonly [number, number] } | null;
}

export const EFECTOS: Readonly<Record<Tiempo, Receta>> = {
  despejado: { velo: null, niebla: null, lluvia: null, rayos: null },
  niebla: {
    velo: [196, 206, 214, 0.14],
    niebla: [222, 230, 238, 0.44],
    lluvia: null,
    rayos: null,
  },
  lluvia: {
    velo: [52, 62, 76, 0.26],
    niebla: null,
    lluvia: { densidad: 2.4, viento: 0.22, color: [200, 214, 232, 0.55] },
    rayos: null,
  },
  tormenta: {
    velo: [18, 24, 38, 0.44],
    niebla: null,
    lluvia: { densidad: 3.6, viento: 0.38, color: [210, 222, 240, 0.65] },
    rayos: { cada: [4000, 9000] },
  },
};

/**
 * La noche, encima del tiempo: un velo azul que deja como poco un 55 % de la
 * luz, y la luz cálida de los fuegos (ciudades, pueblos, puertas de la base).
 */
export const NOCHE = {
  velo: [6, 12, 34, 0.45] as Rgba,
  /** El color del resplandor de un fuego de noche, en `lighter`. */
  fuego: [255, 170, 84, 0.55] as Rgba,
} as const;

/** El velo de un sitio: el de su tiempo y, encima, el de la noche; `null` si no lleva ninguno. */
export function veloDe(sitio: ClimaDelSitio): Rgba | null {
  const t = EFECTOS[sitio.tiempo].velo;
  if (!sitio.noche) return t;
  if (t === null) return NOCHE.velo;
  return encima(t, NOCHE.velo);
}

/** `b` pintado encima de `a`, los dos sin premultiplicar: lo que queda en un solo velo. */
export function encima(a: Rgba, b: Rgba): Rgba {
  const al = b[3] + a[3] * (1 - b[3]);
  if (al <= 0) return [0, 0, 0, 0];
  const mezcla = (i: 0 | 1 | 2): number => (b[i] * b[3] + a[i] * a[3] * (1 - b[3])) / al;
  return [mezcla(0), mezcla(1), mezcla(2), al];
}

export const css = (c: Rgba, alfa = c[3]): string =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alfa})`;

/**
 * El cielo de detrás del campo de batalla, de arriba al horizonte: el atardecer
 * de siempre con el despejado; con tormenta no se ve el sol; de noche, azul
 * oscuro sea cual sea el tiempo.
 */
export function cieloDe(sitio: ClimaDelSitio): readonly [string, string, string] {
  if (sitio.noche) {
    return sitio.tiempo === 'tormenta' || sitio.tiempo === 'lluvia'
      ? ['#040509', '#0a0e17', '#151a26']
      : ['#05070d', '#0e1526', '#1f2740'];
  }
  switch (sitio.tiempo) {
    case 'despejado':
      return ['#27303b', '#5b5e58', '#a58c5c'];
    case 'niebla':
      return ['#7a8188', '#a2a6a4', '#c1bcae'];
    case 'lluvia':
      return ['#2b3139', '#4b5157', '#6b6c68'];
    case 'tormenta':
      return ['#12161d', '#242930', '#3a3d41'];
  }
}
