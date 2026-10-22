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
import type { LuzSobreLaFigura } from '../figura.js';

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
  /** Las nubes bajas del cielo de la batalla: su color y cuántas (de 0 a 1), o ninguna. */
  readonly nubes: { readonly color: Rgb; readonly cuantas: number } | null;
  /** Lo que se ve de noche en ese cielo: la luna y las estrellas, solo la luna (velada) o nada (nubes). */
  readonly astros: 'luna-y-estrellas' | 'luna' | null;
}

/**
 * El cielo de noche despejada: azul, más claro hacia el horizonte. Va bajo la luz
 * de la noche (`NOCHE.luz`, que lo multiplica): sale azul marino, con la luna y
 * las estrellas encima sin oscurecer (`astros`). Era casi negro, y la noche y la
 * tormenta se veían iguales (H8 del QA del clima, 22-10-2026).
 */
const NOCHE_CLARA: Cielo = ['#24386e', '#3a5590', '#6278a8'];
/** El de noche con nubes: gris azulado, sin astros. */
const NOCHE_CERRADA: Cielo = ['#2c3648', '#3e4a60', '#566176'];

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
    nubes: null,
    astros: 'luna-y-estrellas',
  },
  niebla: {
    luz: null,
    bruma: [196, 206, 214, 0.14],
    bancos: 0.44,
    lluvia: null,
    rayos: null,
    cielo: ['#7a8188', '#a2a6a4', '#c1bcae'],
    cieloDeNoche: NOCHE_CLARA,
    nubes: null,
    astros: 'luna',
  },
  lluvia: {
    luz: [182, 190, 204],
    bruma: null,
    bancos: null,
    lluvia: { densidad: 2.4, viento: 0.22, color: [212, 224, 240, 0.7] },
    rayos: null,
    cielo: ['#3d444d', '#59606a', '#767b80'],
    cieloDeNoche: NOCHE_CERRADA,
    nubes: { color: [70, 76, 86], cuantas: 0.6 },
    astros: null,
  },
  tormenta: {
    luz: [150, 160, 182],
    bruma: null,
    bancos: null,
    lluvia: { densidad: 3.6, viento: 0.38, color: [220, 230, 246, 0.8] },
    rayos: { cada: [4000, 9000] },
    // Gris pizarra con nubes bajas: con tormenta no se ve el sol, y de noche
    // tampoco la luna.
    cielo: ['#3a414b', '#4c545e', '#5d646c'],
    cieloDeNoche: NOCHE_CERRADA,
    nubes: { color: [36, 40, 48], cuantas: 1 },
    astros: null,
  },
};

/**
 * La noche, encima del tiempo: una luz azul que se multiplica (deja la mitad de
 * la luz, y casi toda en el azul), y la luz cálida de los fuegos (ciudades,
 * pueblos, puertas de la base), que abren un hueco en ella. Era más oscura y
 * menos azul (92, 116, 178), y en el mapa una región de noche se parecía al velo
 * de lo que no se mira: la luz de un bosque, 45 de noche frente a 40 de día bajo
 * el velo; ahora 53, y azul (H4 del QA del clima, 22-10-2026).
 */
export const NOCHE = {
  luz: [108, 138, 232] as Rgb,
  /**
   * La luz de la luna que se **suma** (`lighter`) tras multiplicar: multiplicar
   * por azul no vuelve azul lo que no tiene azul (un bosque pardo de noche salía
   * pardo oscuro, 31 de luz frente a 40 del mismo bosque de día bajo el velo de lo
   * que no se mira); sumar un azul oscuro sí, y alza las sombras sin agrisar.
   */
  alza: [14, 22, 48] as Rgb,
  /** El color del resplandor de un fuego de noche, en `lighter`. */
  fuego: [255, 170, 84, 0.72] as Rgba,
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

/** Lo que la noche suma a la luz de un sitio (`NOCHE.alza`), o `null` de día. */
export function alzaDe(sitio: ClimaDelSitio): Rgb | null {
  return sitio.noche ? NOCHE.alza : null;
}

/** El cielo de detrás del campo de batalla, de arriba al horizonte. */
export function cieloDe(sitio: ClimaDelSitio): Cielo {
  const r = EFECTOS[sitio.tiempo];
  return sitio.noche ? r.cieloDeNoche : r.cielo;
}

export const css = (c: Rgb | Rgba, alfa = (c as readonly number[])[3] ?? 1): string =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alfa})`;

/**
 * Cuánta de la luz del sitio cae sobre las figuras de una escena (la base, la
 * morada, la batalla): siete décimas, para que de noche o con tormenta no
 * parezcan pegadas encima con la luz de la tarde (H2 del QA del clima,
 * 22-10-2026) y se sigan leyendo enteras. En el mapa el clima va encima de todo
 * lo que tiene altura, y la luz cae entera.
 */
export const LUZ_EN_LAS_FIGURAS = 0.7;

const luzDeLasFigurasHecha = new Map<string, LuzSobreLaFigura | undefined>();

/**
 * La luz que cae sobre una figura de una escena con este clima: la del sitio
 * (`luzDe`) acercada al blanco y lo que suma la noche (`alzaDe`), los dos en la
 * proporción `LUZ_EN_LAS_FIGURAS`; para `Figura.luz`, o `undefined` a plena luz.
 * La misma para cada clima: así la celda teñida se guarda una vez.
 */
export function luzDeLasFiguras(sitio: ClimaDelSitio): LuzSobreLaFigura | undefined {
  const clave = `${sitio.tiempo}|${sitio.noche}`;
  if (luzDeLasFigurasHecha.has(clave)) return luzDeLasFigurasHecha.get(clave);
  const l = luzDe(sitio);
  const z = alzaDe(sitio);
  const k = LUZ_EN_LAS_FIGURAS;
  const hecha =
    l === null
      ? undefined
      : {
          por: css([255 - k * (255 - l[0]), 255 - k * (255 - l[1]), 255 - k * (255 - l[2])]),
          mas: z === null ? null : css([k * z[0], k * z[1], k * z[2]]),
        };
  luzDeLasFigurasHecha.set(clave, hecha);
  return hecha;
}
