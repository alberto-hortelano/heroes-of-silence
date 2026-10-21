/**
 * La ciudad amurallada (20-10-2026): la ciudad del mapa ya no es una maqueta de
 * otra escala (la hoja `ciudades`, 2,4 casillas con decenas de casas de una
 * décima), sino un recinto que se compone en la escena: un anillo de muralla
 * con las piezas modulares —torres, tramos y puertas— a `ESCALA_DEL_RECINTO`
 * de lo que miden en las murallas del mapa, y dentro, apiñadas y pegadas a la
 * muralla, las casas sueltas de la hoja `casas` a la escala del pueblo, que es
 * lo que se integraba (decisión del usuario, con la maqueta intermedia de
 * `docs/agents/2026-10-20-ciudad-amurallada/`).
 *
 * - El recinto es el 3 × 3 de la casilla de la ciudad, y es del núcleo
 *   (`recintoDeLaCiudad` y `centroDelRecinto`, `core/map/recinto.ts`, vuelta 3):
 *   el generador no pone nada dentro ni dos que se toquen, y la escena lo pinta
 *   donde él lo dejó libre. El de una ciudad-puente (#144), el de su orilla
 *   tierra adentro. Lo leen la huella, la reserva, las paredes que no se ponen,
 *   el suelo de la plaza, la superficie y los guardias.
 * - La muralla es un **octógono** (`contornoDelRecinto`, vuelta 2): ocho caras
 *   iguales con una torre en cada vértice, para que se entre por cualquiera de
 *   las ocho direcciones por una puerta apoyada en su cara. Con el cuadrado, la
 *   senda que llega en diagonal (el 75 %) abría de 1 a 1,6 casillas de muro
 *   (s15 (12,16)), y el usuario pidió puertas («cierralo con puertas»).
 * - Cada cara lleva su puerta o su tramo liso, siempre entre dos torres: una
 *   regla para las ocho. Qué caras llevan puerta lo dice el núcleo
 *   (`puertasDelNucleo` → `puertasDeLaCiudad`: donde llega un camino, y la del
 *   río de una ciudad-puente), y la escena no lo deduce de nada (vuelta 3, fase
 *   3); la senda pintada se lleva luego por el arco (`tendidosDeLasPuertas`,
 *   `sendasPorLosTendidos` en `celdas.ts`). Dentro, casas por todo el
 *   recinto, sin plaza mayor: libre solo la calle junto a cada puerta y donde
 *   pisa quien está en la ciudad (`tapaElPieDelHeroe`).
 *
 * Es puro y determinista, con su propia corriente de azar: no sabe de sprites
 * ni de la escena; `componer` le da los módulos y la calle de las casas
 * (`entraLaCasa`) y pone lo que devuelve.
 */
import {
  LADO_DEL_RECINTO,
  type MapaConCaminos,
  puertasDeLaCiudad,
  type RectDelRecinto,
} from '../../../core/map/recinto.js';
import { hashDeTexto } from '../../../core/rng.js';
import type { TendidoDeSenda } from './celdas.js';
import { azarDe, barajar } from './esparcir.js';
import { ALTO_DE_TORRE, ALTO_DEL_TRAMO_NORTE_SUR } from './muralla.js';
import { varianteDeId } from './nodos.js';
import { SEMIANCHO_DE_LA_HUELLA, type Senda } from './sendas.js';
import { FONDO_DEL_ADARVE, type ModuloDeTirada, tiradaNorteSur } from './tirada.js';

/** El rectángulo de casillas de un recinto, el del núcleo (`recintoDeLaCiudad`). */
export type Rect = RectDelRecinto;

/** Una casilla, o un punto en casillas. */
export interface Sitio {
  readonly x: number;
  readonly y: number;
}

/** Un punto `[x, y]` en casillas, o en píxeles de una imagen. */
export type Par = readonly [number, number];

/**
 * La escala de la muralla del recinto sobre la de las murallas del mapa: una
 * ciudad es más pequeña que el paso que cierra una muralla de barrera, y a la
 * escala entera la muralla tapaba la mitad de las casas.
 */
export const ESCALA_DEL_RECINTO = 0.8;

/**
 * Lo que el tramo de norte a sur de la muralla del mapa (`muro-ns-1`, `-2`) se
 * escala en el recinto sobre `ESCALA_DEL_RECINTO`, para que su muro tenga el
 * alto del de las otras caras, el de la hoja `recinto` (vuelta 4, 21-10-2026:
 * el usuario eligió que mande el tramo en diagonal). Medido a 200 px por
 * casilla, del pie a la coronación de su muro: 63 px frente a los 72 del
 * tramo en diagonal. Sus almenas no se tocan: son las de su hoja.
 */
export const ESCALA_DEL_MURO_NORTE_SUR = 72 / 63;

/** Lo que miden las piezas del anillo, en casillas: las del mapa a `ESCALA_DEL_RECINTO`. */
export const ALTO_DE_TORRE_DEL_RECINTO = ALTO_DE_TORRE * ESCALA_DEL_RECINTO;
export const ALTO_DEL_TRAMO_NORTE_SUR_DEL_RECINTO =
  ALTO_DEL_TRAMO_NORTE_SUR * ESCALA_DEL_RECINTO * ESCALA_DEL_MURO_NORTE_SUR;

/**
 * Lo ancho de una torre del muro en veces su alto (la redonda, 210 × 379 px):
 * el marcador sin arte, y lo que una torre cubre del anillo a cada lado de su
 * vértice (`huecosDelAnillo`).
 */
export const PROPORCION_DE_TORRE = 0.55;

/** El radio de la base de una torre del recinto, en casillas: la mitad de su ancho (0,31). */
export const RADIO_DE_TORRE = (ALTO_DE_TORRE_DEL_RECINTO * PROPORCION_DE_TORRE) / 2;

/**
 * Lo alto del muro de un tramo liso, con sus almenas: el de los tramos en
 * diagonal de la hoja `recinto`, que manda en todas las caras (vuelta 4,
 * 21-10-2026). Lo dibuja así la guía del taller (`tools/taller/recinto.ts`,
 * 0,34 de paramento y 0,1 de almena), lo mide el marcador sin arte y lo leen
 * los sólidos del orden del anillo (`solidoDe`).
 */
export const ALTO_DEL_MURO_DEL_RECINTO = 0.44;

/**
 * Lo alto del torreón de una puerta, con sus almenas: unas 1,3 veces el muro, y
 * muy por debajo de las torres (vuelta 4: a 0,74 la casa de la puerta subía
 * tanto como las torres de su cara, y en diagonal más). Como el muro, lo
 * dibuja la guía y lo leen el marcador y los sólidos.
 */
export const ALTO_DE_LA_PUERTA_DEL_RECINTO = 0.57;

/**
 * Lo que mide el pueblo en el mapa (`colocar.ts`), en casillas: su variante de
 * la hoja `pueblos` va a este ancho. Un solo sitio: de él salen las casas de la
 * ciudad y las de la labranza.
 */
export const ANCHO_DEL_PUEBLO = 1.9;

/**
 * Los píxeles de una casa de la hoja `casas` por casilla: los de su pueblo, que
 * mide `ANCHO_DEL_PUEBLO` y cuya imagen 1 tiene 364 px. Una casa de la ciudad y
 * una del pueblo miden lo mismo (criterio 2): de 0,55 a 0,85 de ancho.
 */
export const PX_POR_CASILLA_DEL_PUEBLO = 364 / ANCHO_DEL_PUEBLO;

/**
 * Lo que la plaza de un recinto pasa de su rectángulo por detrás y por los
 * lados (`pintarPlazas`): la muralla se apoya en tierra de la ciudad, no en el
 * suelo de fuera, y por ahí la tapa.
 */
export const PLAZA_FUERA = 0.12;

/**
 * Lo que la plaza pasa, como mucho, del pie de las caras de delante del
 * octógono (la del sur y las dos diagonales de abajo), que la cámara ve por
 * fuera: con el rectángulo, la plaza asomaba de 0,15 a 0,25 casillas bajo el
 * muro sur, una franja de tierra vacía (H9 del QA de la vuelta 2).
 */
export const PLAZA_AL_SUR = 0.05;

/** Un lado de la plaza: los puntos `p` con `n · p < c` quedan dentro. */
export interface LadoDeLaPlaza {
  readonly n: Par;
  readonly c: number;
}

const LADOS_DE_LA_PLAZA = new WeakMap<Rect, readonly LadoDeLaPlaza[]>();

/**
 * Los seis lados de la plaza del recinto `r`, en el sentido de las agujas del
 * reloj desde el norte: el norte, el este y el oeste de su rectángulo con
 * `PLAZA_FUERA` de más, y al sur las caras sureste, sur y suroeste del
 * octógono con `PLAZA_AL_SUR`. Es la plaza que pinta `pintarPlazas` y la que
 * mira `enLaPlaza`.
 */
export function ladosDeLaPlaza(r: Rect): readonly LadoDeLaPlaza[] {
  const hecho = LADOS_DE_LA_PLAZA.get(r);
  if (hecho !== undefined) return hecho;
  const caras = contornoDelRecinto(r).caras;
  const deLaCara = (k: Cara): LadoDeLaPlaza => {
    const { normal: n, a } = caras.find((c) => c.cara === k) as CaraDelContorno;
    return { n, c: n[0] * a[0] + n[1] * a[1] + PLAZA_AL_SUR };
  };
  const lados: LadoDeLaPlaza[] = [
    { n: [0, -1], c: -(r.j0 - PLAZA_FUERA) },
    { n: [1, 0], c: r.i1 + 1 + PLAZA_FUERA },
    deLaCara('se'),
    deLaCara('s'),
    deLaCara('so'),
    { n: [-1, 0], c: -(r.i0 - PLAZA_FUERA) },
  ];
  LADOS_DE_LA_PLAZA.set(r, lados);
  return lados;
}

/** Si `(x, y)` cae en la plaza del recinto `r` (`ladosDeLaPlaza`). */
export const enLaPlaza = (r: Rect, x: number, y: number): boolean =>
  ladosDeLaPlaza(r).every((l) => l.n[0] * x + l.n[1] * y < l.c);

/** Las casillas de un recinto, fila a fila. */
export function casillasDelRecinto(r: Rect): Par[] {
  const fuera: Par[] = [];
  for (let y = r.j0; y <= r.j1; y++) for (let x = r.i0; x <= r.i1; x++) fuera.push([x, y]);
  return fuera;
}

/** Si el punto `(x, y)` cae en el recinto, con su borde: en casillas, de `i0` a `i1 + 1`. */
export function enElRecinto(r: Rect, x: number, y: number): boolean {
  return x >= r.i0 && x <= r.i1 + 1 && y >= r.j0 && y <= r.j1 + 1;
}

// ---------------------------------------------------------------- el octógono

/** Las ocho caras del octógono, en el sentido de las agujas del reloj desde el norte. */
export const CARAS = ['n', 'ne', 'e', 'se', 's', 'so', 'o', 'no'] as const;
export type Cara = (typeof CARAS)[number];

/**
 * El eje de cada cara: por el que pasa el camino que entra por ella. Una pieza
 * sirve a sus dos caras opuestas, como el tramo ancho sirve al norte y al sur:
 * desde la cámara, el muro del norte se ve por dentro y el del sur por fuera,
 * y los dos enseñan la cara que mira al sur.
 */
export const EJES_DEL_RECINTO = ['n-s', 'e-o', 'ne-so', 'no-se'] as const;
export type EjeDelRecinto = (typeof EJES_DEL_RECINTO)[number];
export const EJE_DE_LA_CARA: Readonly<Record<Cara, EjeDelRecinto>> = {
  n: 'n-s',
  s: 'n-s',
  e: 'e-o',
  o: 'e-o',
  ne: 'ne-so',
  so: 'ne-so',
  no: 'no-se',
  se: 'no-se',
};

const S = Math.SQRT1_2;

/**
 * Cómo va cada eje en el suelo: `u` a lo largo del muro y `v` hacia la cara
 * que se ve, la de la boca del arco (con la del noroeste y la del noreste, por
 * dentro del recinto). Lo leen la guía de las piezas (`tools/taller/recinto.ts`)
 * y el vano del arco (`vanoDelArco`).
 */
export const MARCO_DEL_EJE: Readonly<Record<EjeDelRecinto, { u: Par; v: Par }>> = {
  'n-s': { u: [1, 0], v: [0, 1] },
  'e-o': { u: [0, 1], v: [1, 0] },
  // Las caras noreste y suroeste: el muro baja hacia la derecha y enseña la que mira al suroeste.
  'ne-so': { u: [S, S], v: [-S, S] },
  // Las caras noroeste y sureste: el muro sube hacia la derecha y enseña la que mira al sureste.
  'no-se': { u: [S, -S], v: [S, S] },
};

/**
 * La hoja de las piezas que no tiene la muralla del mapa: las cuatro puertas,
 * los dos tramos en diagonal y el tramo recto de las caras norte y sur.
 */
export const HOJA_DEL_RECINTO = 'recinto';

/** Los ejes con tramo liso en la hoja `recinto`: el este y el oeste van con la tirada de norte a sur. */
export type EjeConTramo = Exclude<EjeDelRecinto, 'e-o'>;

/** La puerta de cada eje (`puerta-n-s`…) y el tramo liso de los demás (`tramo-n-s`, `tramo-ne-so`). */
export const puertaDelEje = (eje: EjeDelRecinto) => `puerta-${eje}` as const;
export const tramoDelEje = (eje: EjeConTramo) => `tramo-${eje}` as const;

/**
 * Los módulos de la hoja `recinto`, en el orden de su rejilla: cuatro puertas y
 * tres tramos. El tramo recto (`tramo-n-s`, vuelta 4) sustituye en el recinto
 * al `horizontal` de la hoja `muro`, que tenía un muro de dos tercios del de
 * las diagonales y otras almenas; la muralla de paso del mapa sigue con aquel.
 */
export const MODULOS_DEL_RECINTO = [
  ...EJES_DEL_RECINTO.map(puertaDelEje),
  tramoDelEje('ne-so'),
  tramoDelEje('n-s'),
  tramoDelEje('no-se'),
] as const;
export type ModuloDeLaHojaDelRecinto = (typeof MODULOS_DEL_RECINTO)[number];

/**
 * La escala propia de cada módulo de la hoja `recinto` sobre la que le dan sus
 * juntas (`deVerticeAVertice`): el pintor calca la silueta de la guía pero no
 * siempre su alto, y una pieza cuyo muro sale más alto o más bajo que el de las
 * otras se corrige aquí, medida a 200 px por casilla del pie a la coronación.
 * Va alrededor del medio de su cara: las juntas se corren con ella hacia
 * dentro o hacia fuera, y la torre de cada vértice tapa lo que sobra o falta.
 * Sin entrada, 1.
 */
export const ESCALA_DEL_MODULO: Readonly<Partial<Record<ModuloDeLaHojaDelRecinto, number>>> = {
  // Las alas, 90 px por sus juntas frente a los 72 de los tramos (21-10-2026).
  'puerta-n-s': 72 / 90,
  // El corte de delante, 85 px.
  'puerta-e-o': 72 / 85,
};

/**
 * Lo que el octógono entra desde el borde de su rectángulo: así ningún pie del
 * anillo cae en el borde, y `Math.floor` lo pone en una casilla del recinto, la
 * del sur también, con su clave dentro de la ciudad.
 */
const DENTRO_DEL_BORDE = 0.02;

/**
 * Lo que mide cada cara del octógono regular inscrito en el recinto, en
 * casillas: el lado entre bordes por √2 − 1 (1,226). La guía de las piezas de
 * la hoja `recinto` va a esta medida.
 */
export const CARA_DEL_RECINTO = (LADO_DEL_RECINTO - 2 * DENTRO_DEL_BORDE) * (Math.SQRT2 - 1);

/** Lo que se corta cada esquina del cuadrado, por cada lado: (lado − cara) / 2 (0,867). */
export const CHAFLAN = (LADO_DEL_RECINTO - 2 * DENTRO_DEL_BORDE - CARA_DEL_RECINTO) / 2;

/**
 * La luz del arco de una puerta, en casillas: la senda mide 0,32
 * (`ANCHO_DE_SENDA`) y pasa por él con 0,09 de holgura a cada lado, y el
 * tablero del puente de una ciudad-puente, con sus pretiles (0,43 a la escala
 * de `puenteDeLaCiudad`, s9 town-2), cabe en él. La guía la dibuja así. Con
 * 0,4, el puente entraba más ancho que su arco.
 */
export const LUZ_DEL_ARCO = 0.5;

/** El grueso del muro del recinto, en casillas (la guía de `tools/taller/recinto.ts` lo dibuja así). */
export const GRUESO_DEL_MURO = 0.3;

/**
 * Lo que el arco de una puerta arranca sobre el suelo, en casillas: su boca, de
 * medio punto, sube hasta esto más media luz (0,35), y sobre la clave quedan
 * 0,12 de paramento del torreón. La guía lo dibuja así, y de ella sale el vano
 * que ninguna casa tapa (`vanoDelArco`).
 */
export const ARRANQUE_DEL_ARCO = 0.1;

/**
 * El grueso del torreón de una puerta, en casillas: sale por los dos lados del
 * muro, y la boca del arco se abre en su cara que se ve, a la mitad de esto de
 * su eje (`MARCO_DEL_EJE`). Poco más que el muro: lo alto de un torreón en
 * diagonal sube en pantalla lo que mide su planta, y con 0,44 la casa de una
 * puerta del noroeste pasaba de las torres.
 */
export const GRUESO_DEL_TORREON = 0.38;

/**
 * Lo largo del torreón de una puerta a lo largo de su muro, en casillas,
 * centrado en el medio de su cara: la luz del arco y 0,1 de jamba a cada lado.
 * La guía lo dibuja así, y de él sale lo que la puerta tiene delante de la
 * torre de su vértice (`ordenDelAnillo`).
 */
export const LARGO_DEL_TORREON = LUZ_DEL_ARCO + 0.2;

/** Una cara del octógono: de `a` a `b` en el sentido de las agujas del reloj. */
export interface CaraDelContorno {
  readonly cara: Cara;
  readonly a: Par;
  readonly b: Par;
  /** Su punto medio: donde va el arco de su puerta, el paso de la senda. */
  readonly medio: Par;
  /** Su normal hacia fuera, de largo 1. */
  readonly normal: Par;
}

export interface Contorno {
  /** Los ocho vértices, en el sentido de las agujas del reloj desde el oeste de la cara norte. */
  readonly vertices: readonly Par[];
  /** Las ocho caras en el orden de `CARAS`: la `k` va del vértice `k` al `k + 1`. */
  readonly caras: readonly CaraDelContorno[];
  readonly centro: Par;
  /** El rectángulo del que sale. */
  readonly rect: Rect;
}

/**
 * El octógono del recinto `r`: regular, inscrito en su rectángulo encogido en
 * `DENTRO_DEL_BORDE`, con las esquinas cortadas en `CHAFLAN`.
 */
export function contornoDelRecinto(r: Rect): Contorno {
  const x0 = r.i0 + DENTRO_DEL_BORDE;
  const y0 = r.j0 + DENTRO_DEL_BORDE;
  const x1 = r.i1 + 1 - DENTRO_DEL_BORDE;
  const y1 = r.j1 + 1 - DENTRO_DEL_BORDE;
  const c = CHAFLAN;
  const vertices: Par[] = [
    [x0 + c, y0],
    [x1 - c, y0],
    [x1, y0 + c],
    [x1, y1 - c],
    [x1 - c, y1],
    [x0 + c, y1],
    [x0, y1 - c],
    [x0, y0 + c],
  ];
  const caras = CARAS.map((cara, k): CaraDelContorno => {
    const a = vertices[k] as Par;
    const b = vertices[(k + 1) % 8] as Par;
    const largo = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // En el sentido de las agujas del reloj (con y hacia abajo), fuera queda a la izquierda.
    return {
      cara,
      a,
      b,
      medio: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      normal: [(b[1] - a[1]) / largo, -(b[0] - a[0]) / largo],
    };
  });
  return { vertices, caras, centro: [(x0 + x1) / 2, (y0 + y1) / 2], rect: r };
}

/** Lo que `(x, y)` queda por dentro de la cara `c` (negativo, fuera). */
const dentroDeLaCara = (c: CaraDelContorno, x: number, y: number) =>
  (c.a[0] - x) * c.normal[0] + (c.a[1] - y) * c.normal[1];

/** El punto del tramo `a → b` más cercano a `p`. */
function puntoDelTramo(p: Par, a: Par, b: Par): Par {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return [a[0] + t * dx, a[1] + t * dy];
}

/** Si `(x, y)` cae dentro del octógono a `margen` o más de todas sus caras. */
export function dentroDelContorno(c: Contorno, x: number, y: number, margen = 0): boolean {
  return c.caras.every((k) => dentroDeLaCara(k, x, y) >= margen);
}

/**
 * Lo que la fila `y` tiene dentro del octógono a `margen` de sus caras (uno
 * para todas o el de cada una), de oeste a este, o null si nada: donde caben
 * las casas de esa fila.
 */
export function filaDelContorno(
  c: Contorno,
  y: number,
  margen: number | ((k: CaraDelContorno) => number),
): Par | null {
  let lo = -Infinity;
  let hi = Infinity;
  for (const k of c.caras) {
    // n·(a − p) ≥ margen  ⇔  nx·x ≤ n·a − ny·y − margen.
    const [nx, ny] = k.normal;
    const tope =
      nx * k.a[0] + ny * k.a[1] - ny * y - (typeof margen === 'number' ? margen : margen(k));
    if (Math.abs(nx) < 1e-9) {
      if (tope < 0) return null;
    } else if (nx > 0) hi = Math.min(hi, tope / nx);
    else lo = Math.max(lo, tope / nx);
  }
  return lo < hi ? [lo, hi] : null;
}

/**
 * La cara por la que se sale del recinto hacia `(x, y)`: la de normal más
 * cercana a la dirección del centro al punto. Las ocho están a la misma
 * distancia del centro, así que es la de centro más cercano; un empate (la
 * diagonal exacta entre dos) se queda con la primera de `CARAS`.
 */
export function caraHacia(c: Contorno, x: number, y: number): CaraDelContorno {
  const dx = x - c.centro[0];
  const dy = y - c.centro[1];
  let mejor = c.caras[0] as CaraDelContorno;
  let maxima = -Infinity;
  for (const k of c.caras) {
    const v = dx * k.normal[0] + dy * k.normal[1];
    if (v > maxima + 1e-9) {
      maxima = v;
      mejor = k;
    }
  }
  return mejor;
}

/** Las caras con puerta de un recinto, y la del río si es una ciudad-puente. */
export interface PuertasDelNucleo {
  readonly puertas: readonly Cara[];
  /** La cara del río de una ciudad-puente: por ella llega el puente, no una senda. */
  readonly rio?: Cara;
}

/**
 * Las puertas que se pintan en la ciudad de `at`: las del núcleo
 * (`puertasDeLaCiudad`), que hay donde un camino de `GameMap.caminos` llega de
 * un acceso a la casilla de su puerta, y la del río de una ciudad-puente, que
 * hay siempre (el puente es su camino). La escena no las deduce de nada: hasta
 * la vuelta 3 salían de las sendas pintadas, y la que llegaba de lado a una
 * puerta diagonal se pintaba en la cara del este o del oeste, que el núcleo no
 * tiene (19 de 208 ciudades de 1-40 con otras puertas que las del juego).
 */
export function puertasDelNucleo(map: MapaConCaminos, at: Sitio): PuertasDelNucleo {
  const delNucleo = puertasDeLaCiudad(map, at);
  const rio = delNucleo.find((p) => p.delRio)?.cara;
  const caras = new Set<Cara>(delNucleo.map((p) => p.cara));
  return { puertas: CARAS.filter((k) => caras.has(k)), ...(rio === undefined ? {} : { rio }) };
}

// ------------------------------------------------------------------- el anillo

/** Un módulo de una hoja tal como lo lee la regla: su nombre, su tamaño, su ancla y, si va de vértice a vértice, sus juntas. */
export interface ModuloDelRecinto {
  readonly nombre: string;
  readonly nw: number;
  readonly nh: number;
  readonly ax: number;
  readonly ay: number;
  /**
   * El pie de sus dos puntas, en píxeles de su imagen (las puertas y los tramos
   * en diagonal de la hoja `recinto`, que deriva `pnpm taller derivar-recinto`):
   * se coloca poniéndolas en los dos vértices de su cara.
   */
  readonly junta?: readonly [Par, Par];
  /**
   * De dónde a dónde va lo opaco de su imagen, por franjas de columnas de
   * izquierda a derecha, en fracciones del alto (`Modulo.silueta`, las casas):
   * lo que mira `tapaElArco`. Sin ella (el marcador sin arte), su caja.
   */
  readonly silueta?: readonly (readonly [number, number])[];
}

/** Qué es cada pieza del recinto: lo dice la regla, y lo leen los guardias. */
export type PapelEnElRecinto = 'torre' | 'tramo' | 'puerta' | 'casa';

/** Una pieza del recinto en su sitio: el módulo con su pie en `(x, y)`, en casillas, como un sprite. */
export type PiezaDelRecinto<M extends ModuloDelRecinto = ModuloDelRecinto> = M & {
  readonly que: PapelEnElRecinto;
  readonly x: number;
  readonly y: number;
  readonly alto: number;
  /** La clave del pintor si no es su pie: el tramo va detrás de la torre con la que comparte pie. */
  readonly clave?: number;
  /** La cara del anillo en que va (torres: la que empieza en su vértice). */
  readonly cara?: Cara;
};

export interface ModulosDelRecinto<M extends ModuloDelRecinto> {
  /** Las torres de la hoja `muro` (redonda y cuadrada): una por ciudad. */
  readonly torres: readonly M[];
  /**
   * Los tramos de norte a sur (`muro-ns-1`, `muro-ns-2`), por su ancla del
   * medio y con el paso de su tirada (`tiradaNorteSur`): las caras este y oeste.
   */
  readonly norteSur: readonly (M & ModuloDeTirada)[];
  /** Las piezas de la hoja `recinto` por su nombre (`MODULOS_DEL_RECINTO`), con sus juntas. */
  readonly delRecinto: Readonly<Record<ModuloDeLaHojaDelRecinto, M>>;
  readonly casas: readonly M[];
}

export interface EntradaDeRecinto<M extends ModuloDelRecinto> {
  readonly id: string;
  readonly rect: Rect;
  readonly semilla: number;
  /** Las caras con puerta (`puertasDelNucleo`). */
  readonly puertas: readonly Cara[];
  readonly modulos: ModulosDelRecinto<M>;
  /** Si una casa entra: su pie, de su ancho, lejos de la calle y fuera de la reserva de otro objeto. */
  readonly entraLaCasa: (p: PiezaDelRecinto<M>) => boolean;
}

export interface Recinto<M extends ModuloDelRecinto = ModuloDelRecinto> {
  readonly contorno: Contorno;
  readonly puertas: readonly Cara[];
  readonly torres: readonly PiezaDelRecinto<M>[];
  readonly tramos: readonly PiezaDelRecinto<M>[];
  /** Las piezas de puerta, una por cara con puerta. */
  readonly arcos: readonly PiezaDelRecinto<M>[];
  readonly casas: readonly PiezaDelRecinto<M>[];
}

/**
 * Lo que el adarve de una cara del este o del oeste puede quedarse corto de cada
 * vértice: lo tapa la torre, de `RADIO_DE_TORRE`, hasta la mitad. Con él, la
 * cara (1,23) va en dos piezas de su tirada y no en tres.
 */
const HOLGURA_DE_LA_CARA = RADIO_DE_TORRE / 2;

/** Lo que el pie de la primera fila de casas queda por debajo del muro norte. */
const PRIMERA_FILA = 0.3;

/**
 * Cada cuánto va una fila de casas, de norte a sur, como mucho (`recintoDe`
 * las reparte de la primera a la última). Una casa mide de 0,57 a 0,9
 * de alto: cada fila tapa la base de la de detrás y se ven los tejados, que es
 * la ciudad apiñada que pidió el usuario.
 */
const PASO_DE_FILA = 0.42;

/** Lo que la última fila queda por encima del muro sur. */
const ULTIMA_FILA = 0.15;

/**
 * Lo que el pie de una casa queda por dentro de cada cara del anillo: pegada a
 * la muralla, y en los chaflanes, que cortan las esquinas, la fila empieza más
 * adentro (`filaDelContorno`).
 */
export const DENTRO_DE_LA_MURALLA = 0.15;

/**
 * Lo mismo en los chaflanes: el muro en diagonal no tapa el pie de lo que tiene
 * detrás como el de norte a sur, y con 0,15 las filas de arriba y de abajo se
 * quedaban en dos casas (las ciudades de tres puertas, en 8-10).
 */
export const DENTRO_DE_LOS_CHAFLANES = 0.05;

/** El hueco entre dos casas de una fila. */
const ENTRE_CASAS = 0.04;

/**
 * Cuánto avanza la fila cuando ninguna casa entra en su sitio (la calle de una
 * puerta, donde pisa el héroe). Con 0,1 y tres módulos por sitio, las calles
 * hasta la plaza mayor de la fase 3 dejaban la mediana de casas por ciudad de
 * 1-20 en 12; con este y probando todos, en 13 (vuelta 3).
 */
const AVANCE_SIN_CASA = 0.05;

/** Las caras de detrás: su muro se ve por dentro y va detrás de las casas. */
const DE_DETRAS: ReadonlySet<Cara> = new Set(['n', 'ne', 'no']);

/**
 * La pieza `m` de vértice a vértice de la cara `k`: sus dos juntas en `a` y `b`,
 * a su escala propia (`ESCALA_DEL_MODULO`, 1 si no la tiene) alrededor del
 * medio de la cara. Basta una junta en su sitio (o el medio de las dos en el
 * medio de la cara) y lo que van de una a otra (la escala); su rumbo es el de
 * la imagen, que se pidió en el de su cara. Sin juntas (el marcador sin arte),
 * de su ancho a lo largo de la cara.
 */
function deVerticeAVertice<M extends ModuloDelRecinto>(
  m: M,
  k: CaraDelContorno,
  que: PapelEnElRecinto,
): PiezaDelRecinto<M> {
  const largo = Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]);
  const [j0, j1] = m.junta ?? [
    [0, m.nh],
    [m.nw, m.nh],
  ];
  const propia = ESCALA_DEL_MODULO[m.nombre as ModuloDeLaHojaDelRecinto] ?? 1;
  const escala = (propia * largo) / Math.hypot(j1[0] - j0[0], j1[1] - j0[1]);
  const ys = [k.a[1], k.b[1]];
  const base = { ...m, que, alto: m.nh * escala, cara: k.cara };
  // La de una cara de detrás, por el medio y antes que lo de su vértice de
  // arriba; la de una de delante que baja (en diagonal, o la del este y el
  // oeste), por su junta de abajo, que con su escala propia cae en su vértice
  // de abajo corrido hacia el medio: se pinta tras todo lo que tapa, y la clave
  // del pintor no pasa de su pie (con el pie en el medio y la clave abajo,
  // `separar` la tenía por mal ordenada).
  const vertice = k.a[1] >= k.b[1] ? k.a : k.b;
  const abajo: Par = [
    k.medio[0] + propia * (vertice[0] - k.medio[0]),
    k.medio[1] + propia * (vertice[1] - k.medio[1]),
  ];
  const jAbajo = j0[1] >= j1[1] ? j0 : j1;
  if (!DE_DETRAS.has(k.cara) && Math.abs(k.a[1] - k.b[1]) > 1e-9 && Math.abs(j0[1] - j1[1]) > 1e-9)
    return {
      ...base,
      ax: jAbajo[0],
      ay: jAbajo[1],
      x: abajo[0],
      y: abajo[1],
      clave: abajo[1] - 0.005,
    };
  return {
    ...base,
    ax: (j0[0] + j1[0]) / 2,
    ay: (j0[1] + j1[1]) / 2,
    x: k.medio[0],
    y: k.medio[1],
    clave: Math.min(k.medio[1], DE_DETRAS.has(k.cara) ? Math.min(...ys) : Math.max(...ys)) - 0.005,
  };
}

/**
 * El anillo y las casas de un recinto.
 *
 * En cada vértice del octógono, una torre (del tipo de la ciudad, por su id);
 * en cada cara, su puerta o su tramo liso: al este y al oeste una tirada de
 * norte a sur (`tiradaNorteSur`), y en las demás los de la hoja `recinto`, que
 * van de vértice a vértice por sus juntas (`deVerticeAVertice`), como las
 * puertas.
 *
 * Las casas, por filas de norte a sur, de oeste a este desde el muro, con el pie
 * dentro del octógono (`filaDelContorno`), sin tapar donde pisa el héroe
 * (`tapaElPieDelHeroe`) ni el vano de un arco (`tapaElArco`): la siguiente de
 * una baraja de la hoja que no sea la de su izquierda ni una de la fila de
 * detrás que se le solape; si no entra (la calle de una puerta, el pie del
 * héroe, un arco), la siguiente de la baraja que entre, y si ninguna, la fila
 * avanza.
 */
export function recintoDe<M extends ModuloDelRecinto>(e: EntradaDeRecinto<M>): Recinto<M> {
  const { modulos } = e;
  const contorno = contornoDelRecinto(e.rect);
  const azar = azarDe(Math.imul(e.semilla, 7307) + hashDeTexto(e.id));
  const conPuerta = new Set(e.puertas);

  const torre = modulos.torres[varianteDeId(e.id, modulos.torres.length)] as M;
  // El pie de una torre (el ancla de su imagen) es lo de delante de su base:
  // la base, redonda, va centrada en el vértice, que tapa las puntas de sus
  // dos caras.
  const torresAlPie = contorno.caras.map(
    (k): PiezaDelRecinto<M> => ({
      ...torre,
      que: 'torre',
      x: k.a[0],
      y: k.a[1] + RADIO_DE_TORRE,
      alto: ALTO_DE_TORRE_DEL_RECINTO,
      cara: k.cara,
    }),
  );

  const tramos: PiezaDelRecinto<M>[] = [];
  const arcos: PiezaDelRecinto<M>[] = [];
  for (const k of contorno.caras) {
    const eje = EJE_DE_LA_CARA[k.cara];
    if (conPuerta.has(k.cara)) {
      arcos.push(deVerticeAVertice(modulos.delRecinto[puertaDelEje(eje)], k, 'puerta'));
      continue;
    }
    if (eje !== 'e-o') {
      tramos.push(deVerticeAVertice(modulos.delRecinto[tramoDelEje(eje)], k, 'tramo'));
      continue;
    }
    // Este u oeste: una tirada de norte a sur (`tiradaNorteSur`), un solo
    // módulo al mismo alto y cada pieza a un paso de la de delante, que tapa su
    // testero. Con dos piezas en la misma columna, partidas a media cara, el de
    // la de atrás asomaba a media cara y el muro se leía partido (el usuario,
    // 21-10-2026; s16, town-0).
    const yNorte = Math.min(k.a[1], k.b[1]);
    const ySur = Math.max(k.a[1], k.b[1]);
    const m = modulos.norteSur[varianteDeId(`${e.id}:${k.cara}`, modulos.norteSur.length)] as M &
      ModuloDeTirada;
    const alto = ALTO_DEL_TRAMO_NORTE_SUR_DEL_RECINTO;
    // Con las torres de sus puntas, cada pieza va delante o detrás según lo que
    // cada una tiene más cerca de la cámara donde se solapan (`ordenDelAnillo`).
    for (const p of tiradaNorteSur(m, alto, k.a[0], yNorte, ySur, HOLGURA_DE_LA_CARA))
      tramos.push({ ...m, que: 'tramo', x: p.x, y: p.y, alto, clave: p.y - 0.005, cara: k.cara });
  }
  // Una torre y cada pieza de sus dos caras, en el orden de la geometría: la
  // torre del vértice de arriba de la puerta del noreste de s16 (town-0) se
  // pintaba encima del torreón, que es grueso y tiene su cara de dentro más
  // cerca de la cámara (marca 20261021-173248-s16-11-6, «mal z index»).
  const orden = ordenDelAnillo(contorno, torresAlPie, [...tramos, ...arcos]);
  const torres = orden.torres;
  tramos.splice(0, tramos.length, ...orden.piezas.filter((p) => p.que === 'tramo'));
  arcos.splice(0, arcos.length, ...orden.piezas.filter((p) => p.que === 'puerta'));

  // Las casas, apiñadas: por filas, de oeste a este.
  const vanos = arcos.map((a) => ({
    vano: vanoDelArco(caraDelContorno(contorno, a.cara as Cara)),
    clave: a.clave ?? a.y,
  }));
  const casas: PiezaDelRecinto<M>[] = [];
  const ms = modulos.casas;
  let baraja: number[] = [];
  let detras: PiezaDelRecinto<M>[] = [];
  const anchoDe = (m: Pick<ModuloDelRecinto, 'nw'>) => m.nw / PX_POR_CASILLA_DEL_PUEBLO;
  const izquierdaDe = (p: PiezaDelRecinto<M>) => p.x - p.ax / PX_POR_CASILLA_DEL_PUEBLO;
  const masEstrecha = Math.min(...ms.map(anchoDe));
  const [, y0] = contorno.vertices[0] as Par;
  const [, y1] = contorno.vertices[4] as Par;
  // Las filas, repartidas de la primera a la última: con el paso fijo, la última
  // quedaba a 0,56 del muro sur y dejaba una franja de plaza vacía delante.
  const primera = y0 + PRIMERA_FILA;
  const ultima = y1 - ULTIMA_FILA - 1e-6;
  const filas = Math.ceil((ultima - primera) / PASO_DE_FILA) + 1;
  const paso = filas > 1 ? (ultima - primera) / (filas - 1) : 0;
  for (let f = 0; ms.length > 0 && f < filas; f++) {
    const y = primera + f * paso;
    const fila: PiezaDelRecinto<M>[] = [];
    const tramo = filaDelContorno(contorno, y, (k) =>
      EJE_DE_LA_CARA[k.cara] === 'ne-so' || EJE_DE_LA_CARA[k.cara] === 'no-se'
        ? DENTRO_DE_LOS_CHAFLANES
        : DENTRO_DE_LA_MURALLA,
    );
    if (tramo === null) continue;
    const [inicio, fin] = tramo;
    let x = inicio;
    while (x + masEstrecha <= fin) {
      if (baraja.length < ms.length)
        baraja = [
          ...baraja,
          ...barajar(
            Array.from(ms, (_, k) => k),
            azar,
          ),
        ];
      const izquierda = fila.at(-1);
      let puesta: PiezaDelRecinto<M> | undefined;
      for (const k of new Set(baraja)) {
        const m = ms[k] as M;
        const w = anchoDe(m);
        if (x + w > fin) continue;
        // Ni la de su izquierda ni una de la fila de detrás que se le solape.
        if (izquierda?.nombre === m.nombre) continue;
        if (
          detras.some(
            (d) =>
              d.nombre === m.nombre && izquierdaDe(d) < x + w && izquierdaDe(d) + anchoDe(d) > x,
          )
        )
          continue;
        const c: PiezaDelRecinto<M> = {
          ...m,
          que: 'casa',
          x: x + m.ax / PX_POR_CASILLA_DEL_PUEBLO,
          y,
          alto: m.nh / PX_POR_CASILLA_DEL_PUEBLO,
        };
        if (
          tapaElPieDelHeroe(contorno, c) ||
          vanos.some((a) => tapaElArco(a.vano, a.clave, c)) ||
          !e.entraLaCasa(c)
        )
          continue;
        puesta = c;
        baraja.splice(baraja.indexOf(k), 1);
        break;
      }
      if (puesta === undefined) {
        x += AVANCE_SIN_CASA;
        continue;
      }
      fila.push(puesta);
      x += anchoDe(puesta) + ENTRE_CASAS;
    }
    casas.push(...fila);
    detras = fila;
  }

  return { contorno, puertas: e.puertas, torres, tramos, arcos, casas };
}

// ------------------------------------------------------------ las sendas

/** Lo que la senda de una puerta vuelve a su trazo lejos de la muralla, por dentro. */
const LEJOS_DE_LA_MURALLA = 0.35;

/**
 * Y por fuera: más allá de la base de las torres de los vértices y de la media
 * anchura de la senda (0,31 + 0,16). Con 0,35, la que sale por el sur y tuerce
 * al oeste volvía a su trazo pasando por el pie de la torre de la esquina (s1 (5,8)).
 */
const FUERA_DE_LA_MURALLA = 0.8;

/** Lo que el tendido de una puerta entra en el recinto desde su cara: bajo la plaza. */
const DENTRO_DE_LA_PUERTA = 0.3;

/**
 * Lo que la senda sale recta del arco por su normal antes de volver a su trazo,
 * por cara: lo que el anillo tapa por encima de ella. Al norte el torreón y las
 * torres suben 1,12 en pantalla sobre lo que sale, y la senda tiene que verse
 * después; por los otros lados, lo que pide la senda que tuerce al salir para
 * no pasar por el pie de la torre de al lado (0,31 + 0,16 del vértice): con
 * 0,4, la del sur que torcía al oeste lo pisaba (s1 (5,8)).
 */
export const SALIDA_DE_LA_PUERTA: Readonly<Record<Cara, number>> = {
  n: 1.0,
  ne: 0.8,
  no: 0.8,
  e: 0.6,
  o: 0.6,
  se: 0.6,
  so: 0.6,
  s: 0.6,
};

/** Un recinto tal como lo miran sus sendas: su octógono, sus caras con puerta y, si es una ciudad-puente, la del río. */
export interface PuertasDeUnRecinto {
  readonly contorno: Contorno;
  readonly puertas: readonly Cara[];
  /** La cara del río de una ciudad-puente: por ella llega el puente, no una senda. */
  readonly rio?: Cara;
}

/** Un cruce de una senda con el octógono: dónde, en qué tramo (`i` a `i + 1`) y si sale. */
interface CruceEnBruto {
  readonly p: Par;
  readonly i: number;
  readonly sale: boolean;
}

/** Todos los cruces de la senda `l` con el octógono `c`, en su orden. */
function crucesEnBruto(c: Contorno, l: Senda): CruceEnBruto[] {
  const cruces: CruceEnBruto[] = [];
  for (let i = 0; i + 1 < l.length; i++) {
    const p = l[i] as Par;
    const q = l[i + 1] as Par;
    const dp = dentroDelContorno(c, p[0], p[1]);
    if (dp === dentroDelContorno(c, q[0], q[1])) continue;
    // El octógono es convexo: el cruce de un tramo es uno, y se busca a medias.
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 24; k++) {
      const t = (lo + hi) / 2;
      if (dentroDelContorno(c, p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t) === dp) lo = t;
      else hi = t;
    }
    const t = (lo + hi) / 2;
    cruces.push({ p: [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t], i, sale: dp });
  }
  return cruces;
}

/** Los puntos donde la senda `l` cruza el octógono `c`, cada uno en su tramo. */
export function crucesConElContorno(c: Contorno, l: Senda): Par[] {
  return crucesEnBruto(c, l).map((k) => k.p);
}

/** Cada cuánto lleva un punto la senda corrida de `sinRoces`, en casillas. */
const PASO_DE_LA_CUERDA = 0.1;

/**
 * Las sendas sin sus roces con cada recinto (`sinRoces`): la que pasa junto a
 * una ciudad sin ir a ella se queda fuera de sus torres. Lo de dentro no se
 * toca: el núcleo solo deja entrar un camino de un acceso a su puerta y de la
 * puerta a la ciudad (`problemasDeRecintos`), así que la senda ya va del arco al
 * centro. Hasta la vuelta 3 lo de dentro se hacía una cuerda, porque los
 * caminos entraban por cualquier casilla del 3 × 3.
 */
export function sendasSinRoces(
  sendas: readonly Senda[],
  contornos: readonly Contorno[],
  enElMapa: (x: number, y: number) => boolean = () => true,
): Senda[] {
  return sendas.map((origen) => {
    let l = origen;
    for (const c of contornos) {
      const [cx, cy] = c.centro;
      if (
        !l.some(
          ([x, y]) => Math.abs(x - cx) < LADO_DEL_RECINTO && Math.abs(y - cy) < LADO_DEL_RECINTO,
        )
      )
        continue;
      l = sinRoces(c, l, enElMapa);
    }
    return l;
  });
}

/** Lo que `(x, y)` queda por dentro del octógono: la menor de sus caras (negativo, fuera). */
const hondura = (c: Contorno, x: number, y: number) =>
  Math.min(...c.caras.map((k) => dentroDeLaCara(k, x, y)));

/**
 * Lo más que entra en un recinto la senda que pasa rozándolo, en casillas: la
 * que entra y sale sin pasar de aquí no va a la ciudad (s38 (11,20), el camino
 * del núcleo que pisa la casilla del medio de la fila de arriba del 3 × 3).
 */
export const ROCE_DEL_RECINTO = 0.6;

/**
 * Lo que la senda que roza un recinto queda de sus caras: la base de una torre
 * y media senda, y un poco más. Con medio muro, la senda pasaba por el pie de
 * las torres de los vértices y al apartarse de ellas se quebraba (s38 (11,20)).
 */
const FUERA_DEL_ROCE = RADIO_DE_TORRE + SEMIANCHO_DE_LA_HUELLA + 0.05;

/**
 * La senda `l` sin los roces con el octógono `c`: lo que entra y sale sin
 * pasar de `ROCE_DEL_RECINTO`, y lo de alrededor a menos de `FUERA_DEL_ROCE`,
 * se corre fuera de su cara más cercana hasta `FUERA_DEL_ROCE`. Con una cuerda,
 * la senda que pasaba por la ciudad sin ir a ella entraba por una puerta y
 * salía por la de al lado.
 *
 * También lo que pasa a menos de `FUERA_DEL_ROCE` sin entrar: el camino que
 * baja por la columna de al lado del 3 × 3 va a 0,52 del vértice, y con su
 * vaivén pisaba la torre de la esquina (s3 (4,35); s36 (19,37), por la rampa
 * de una bajada, que sigue a esta senda y luego no se aparta). Y entre dos
 * puntos corridos se ponen los de en medio, corridos igual: al pasar de una
 * cara a otra, los de dentro saltaban de la normal de una a la de la otra, y
 * la recta entre los dos cortaba la torre del vértice (s36 (16,38)).
 */
function sinRoces(c: Contorno, l: Senda, enElMapa: (x: number, y: number) => boolean): Senda {
  // La que acaba dentro va a la ciudad (las sendas se cortan en ella): no roza.
  const [p0, p1] = [l[0] as Par, l.at(-1) as Par];
  if (dentroDelContorno(c, p0[0], p0[1]) || dentroDelContorno(c, p1[0], p1[1])) return l;
  const cruces = crucesEnBruto(c, l);
  const correr = new Set<number>();
  for (let k = 0; k + 1 < cruces.length; k++) {
    const a = cruces[k] as CruceEnBruto;
    const b = cruces[k + 1] as CruceEnBruto;
    if (a.sale || !b.sale) continue;
    let honda = 0;
    for (let i = a.i + 1; i <= b.i; i++) honda = Math.max(honda, hondura(c, ...(l[i] as Par)));
    if (honda > ROCE_DEL_RECINTO) continue;
    for (let i = a.i; i >= 0 && hondura(c, ...(l[i] as Par)) > -FUERA_DEL_ROCE; i--) correr.add(i);
    for (let i = b.i + 1; i < l.length && hondura(c, ...(l[i] as Par)) > -FUERA_DEL_ROCE; i++)
      correr.add(i);
    for (let i = a.i + 1; i <= b.i; i++) correr.add(i);
  }
  // Lo que pasa cerca sin entrar: cada tramo seguido a menos de `FUERA_DEL_ROCE`
  // en el que ningún punto cae dentro.
  for (let i = 0; i < l.length; ) {
    if (hondura(c, ...(l[i] as Par)) <= -FUERA_DEL_ROCE) {
      i++;
      continue;
    }
    let j = i;
    let entra = false;
    for (; j < l.length && hondura(c, ...(l[j] as Par)) > -FUERA_DEL_ROCE; j++)
      if (dentroDelContorno(c, ...(l[j] as Par))) entra = true;
    if (!entra) for (let k = i; k < j; k++) correr.add(k);
    i = j;
  }
  if (correr.size === 0) return l;
  // Cada punto, a `FUERA_DEL_ROCE` del punto más cercano del octógono: por
  // fuera, en su dirección; por dentro, por la normal de esa cara.
  const fuera = (p: Par): Par => {
    let q: Par = p;
    let cara = c.caras[0] as CaraDelContorno;
    let d = Infinity;
    for (const k of c.caras) {
      const cerca = puntoDelTramo(p, k.a, k.b);
      const dk = Math.hypot(p[0] - cerca[0], p[1] - cerca[1]);
      if (dk < d) {
        d = dk;
        q = cerca;
        cara = k;
      }
    }
    const porFuera = !dentroDelContorno(c, p[0], p[1]) && d > 1e-6;
    if (porFuera && d >= FUERA_DEL_ROCE) return p;
    const [ux, uy] = porFuera ? [(p[0] - q[0]) / d, (p[1] - q[1]) / d] : cara.normal;
    return [q[0] + ux * FUERA_DEL_ROCE, q[1] + uy * FUERA_DEL_ROCE];
  };
  const corrida: Par[] = [];
  for (const [i, p] of l.entries()) {
    const quieto = !correr.has(i) || i === 0 || i === l.length - 1;
    const q = quieto ? p : fuera(p);
    const antes = corrida.at(-1);
    if (antes !== undefined && correr.has(i) && correr.has(i - 1)) {
      const n = Math.ceil(Math.hypot(q[0] - antes[0], q[1] - antes[1]) / PASO_DE_LA_CUERDA);
      for (let k = 1; k < n; k++)
        corrida.push(
          fuera([antes[0] + ((q[0] - antes[0]) * k) / n, antes[1] + ((q[1] - antes[1]) * k) / n]),
        );
    }
    corrida.push(q);
  }
  // Si así se sale del mapa (el recinto contra el borde, s26 (0,24)), se queda:
  // la cuerda la lleva por dos puertas.
  return corrida.every(([x, y]) => enElMapa(x, y)) ? corrida : l;
}

/** Un punto lejos del recinto, más allá de `p` desde su centro. */
function lejosDe(c: Contorno, [x, y]: Par): Par {
  const dx = x - c.centro[0];
  const dy = y - c.centro[1];
  const d = Math.hypot(dx, dy) || 1;
  return [x + (2 * LADO_DEL_RECINTO * dx) / d, y + (2 * LADO_DEL_RECINTO * dy) / d];
}

/** La cara con puerta más cercana al punto `(x, y)` del anillo, o undefined si no hay ninguna. */
export function puertaMasCercana(r: PuertasDeUnRecinto, [x, y]: Par): CaraDelContorno | undefined {
  let mejor: CaraDelContorno | undefined;
  let d = Infinity;
  for (const k of r.contorno.caras) {
    if (!r.puertas.includes(k.cara)) continue;
    const dk = Math.hypot(k.medio[0] - x, k.medio[1] - y);
    if (dk < d) {
      d = dk;
      mejor = k;
    }
  }
  return mejor;
}

/**
 * Lo más que el cruce de una senda con el octógono se aparta del medio de la
 * cara de su puerta para llevarla por su arco, en casillas. Un camino del núcleo
 * entra de un acceso a su puerta (`PUERTAS_DE_LA_CIUDAD`) y la senda cruza a
 * ≤ 0,1 del arco más lo que ondula; entre el medio de una cara y el de la de al
 * lado hay 1,13. Más lejos, la senda no es de esa puerta y se queda donde
 * cruza: la cuenta `sendasFueraDeLaPuerta`.
 */
export const CRUCE_DE_LA_PUERTA = 0.6;

/**
 * Lo que se prueba de la salida de una puerta (`SALIDA_DE_LA_PUERTA`) cuando
 * entera no acaba en lo que se pisa: la del noreste y la del noroeste salen a
 * la casilla de la esquina, que es uno de los tres accesos de su puerta y puede
 * ser barrera si el camino llega por otro.
 */
const PARTES_DE_LA_SALIDA = [1, 0.85, 0.7, 0.55] as const;

/**
 * La salida de la puerta cuando ni la más corta acaba en lo que se pisa: lo
 * justo para pasar el arco, y la senda vuelve a su trazo en seguida. La puerta
 * diagonal cuyo camino llega de lado, con el río delante de la esquina, salía
 * por encima del agua (s37 (39,23); y en la vuelta 3, s26 (40,17), la del
 * noroeste con el puente al norte).
 */
const SALIDA_SIN_SITIO = 0.2;

/**
 * La salida de la puerta `k` (`SALIDA_DE_LA_PUERTA`), entera o la más larga de
 * `PARTES_DE_LA_SALIDA` que acaba en lo que se pisa (`sePisa`); si ninguna,
 * `SALIDA_SIN_SITIO`.
 */
function salidaDe(k: CaraDelContorno, sePisa: (x: number, y: number) => boolean): number {
  const entera = SALIDA_DE_LA_PUERTA[k.cara];
  for (const parte of PARTES_DE_LA_SALIDA)
    if (
      sePisa(k.medio[0] + k.normal[0] * entera * parte, k.medio[1] + k.normal[1] * entera * parte)
    )
      return entera * parte;
  return SALIDA_SIN_SITIO;
}

/**
 * Por dónde pasa cada senda que cruza un recinto (`sendasPorLosTendidos`): por
 * el arco de la puerta del núcleo de su cruce (la más cercana, a
 * `CRUCE_DE_LA_PUERTA` como mucho), de `DENTRO_DE_LA_PUERTA` por dentro de la
 * cara a `SALIDA_DE_LA_PUERTA` por fuera, por su normal. Dos sendas de una
 * misma cara salen juntas por el arco y se abren en Y fuera de él; por dentro,
 * la plaza tapa cómo llegan al centro. La cara del río de una ciudad-puente no
 * lleva: el puente llega a su arco y la senda empieza en su estribo.
 */
export function tendidosDeLasPuertas(
  sendas: readonly Senda[],
  recintos: readonly PuertasDeUnRecinto[],
  sePisa: (x: number, y: number) => boolean = () => true,
): TendidoDeSenda[] {
  const fuera: TendidoDeSenda[] = [];
  for (const r of recintos)
    sendas.forEach((l, senda) => {
      for (const cruce of crucesConElContorno(r.contorno, l)) {
        const k = puertaMasCercana(r, cruce);
        if (k === undefined || k.cara === r.rio) continue;
        if (Math.hypot(k.medio[0] - cruce[0], k.medio[1] - cruce[1]) > CRUCE_DE_LA_PUERTA) continue;
        const [nx, ny] = k.normal;
        const salida = salidaDe(k, sePisa);
        fuera.push({
          senda,
          cerca: cruce,
          p0: [k.medio[0] - nx * DENTRO_DE_LA_PUERTA, k.medio[1] - ny * DENTRO_DE_LA_PUERTA],
          p1: [k.medio[0] + nx * salida, k.medio[1] + ny * salida],
          t: [nx, ny],
          largo: salida,
          // Hacia fuera por donde cruza: con `p1` de punto, la senda que llega
          // de lado a una puerta diagonal parecía ir hacia dentro.
          hacia: lejosDe(r.contorno, cruce),
          // Por dentro, lejos de la muralla (la plaza lo tapa); por fuera, ya
          // fuera de ella y de las esquinas que corta el octógono.
          vuelve: {
            antes: ([x, y]) => dentroDelContorno(r.contorno, x, y, LEJOS_DE_LA_MURALLA),
            despues: ([x, y]) => !dentroDelContorno(r.contorno, x, y, -FUERA_DE_LA_MURALLA),
          },
        });
      }
    });
  return fuera;
}

/**
 * Lo que queda bajo el centro del recinto donde pisa quien está en la ciudad,
 * en casillas: `PIES.heroe` (`render/mapa.ts`) menos media casilla.
 */
export const PIE_EN_LA_PLAZA = 0.3;

/**
 * Lo que queda libre de casas alrededor de donde pisa quien está en la ciudad,
 * en casillas, a cada lado (`ancho`) y por delante y por detrás (`hondo`)
 * (`tapaElPieDelHeroe`): sus pies van sobre la piedra de la plaza y no sobre un
 * tejado. Es lo justo, el sitio de sus pies (decisión del usuario tras la fase 3
 * de la vuelta 3: «llena, sin plaza mayor»): con las piernas abiertas, del pie
 * izquierdo al derecho mide unas 0,4 casillas (s13, en el navegador). Con una
 * plaza mayor de 0,3 alrededor y una calle de cada puerta hasta ella, la mediana
 * de casas por ciudad de 1-40 bajaba de 15 a 13 y la ciudad se veía vacía; con
 * un círculo de 0,1 se ganaba media casa de media, pero el pie izquierdo quedaba
 * al filo de la casa de al lado y el aro del héroe la pisaba.
 */
export const LIBRE_BAJO_EL_HEROE = { ancho: 0.2, hondo: 0.1 } as const;

/** Donde pisa quien está en la ciudad del recinto de `c`. */
export const pieDelHeroe = (c: Contorno): Par => [c.centro[0], c.centro[1] + PIE_EN_LA_PLAZA];

/**
 * Si la casa `p` tapa donde pisa quien está en la ciudad del recinto de `c`: su
 * imagen, de su pie a su alto y de su ancho, entra en la elipse de
 * `LIBRE_BAJO_EL_HEROE` alrededor de su pie. La imagen y no solo el pie: quien
 * está dentro se pinta delante del recinto entero (`Escenario.cubiertas`), así
 * que el tejado de la casa de delante le quedaba bajo los pies.
 */
export function tapaElPieDelHeroe(
  c: Contorno,
  p: Pick<PiezaDelRecinto, 'x' | 'y' | 'alto' | 'nw' | 'nh' | 'ax'>,
): boolean {
  const ancho = (p.alto * p.nw) / p.nh;
  const izquierda = p.x - (p.ax * p.alto) / p.nh;
  const [cx, cy] = pieDelHeroe(c);
  const dx = Math.max(izquierda - cx, 0, cx - (izquierda + ancho));
  const dy = Math.max(p.y - p.alto - cy, 0, cy - p.y);
  return Math.hypot(dx / LIBRE_BAJO_EL_HEROE.ancho, dy / LIBRE_BAJO_EL_HEROE.hondo) < 1;
}

/**
 * Lo que la calle de una puerta entra en el recinto desde su cara, en casillas:
 * lo que entra la senda (`DENTRO_DE_LA_PUERTA`) y su media anchura. Por detrás
 * y de lado era 0,6, un margen para que el tejado de la casa de delante no
 * tapara el arco; no lo hacía en las diagonales (H1 del QA de la ciudad llena,
 * 21-10-2026), y ahora lo dice lo que se ve (`tapaElArco`). Con los dos, las
 * casas por ciudad de 1-40 se quedaban en una mediana de 14 (media 14,27); con
 * la calle corta, 15 (14,44; eran 14,60 tapando arcos).
 */
export const FONDO_DE_LA_CALLE = 0.35;

/**
 * Lo que el pie de una casa del recinto queda del eje de la calle de una puerta
 * (`callesDeLasPuertas`): la media anchura de la senda (0,16), que es lo que
 * entra por el arco. La fase 2 dejaba media luz del arco (0,2).
 */
export const MEDIA_CALLE = 0.15;

/**
 * La calle de cada puerta: de fuera de su arco a `FONDO_DE_LA_CALLE` dentro, por
 * su normal, lo que no lleva casas en el pie (`entraLaCasa`). Lo justo para que
 * la senda entre (su tendido entra `DENTRO_DE_LA_PUERTA`); que el arco no quede
 * tapado lo dice `tapaElArco`, y más allá, la ciudad va llena.
 */
export function callesDeLasPuertas(r: Pick<Recinto, 'contorno' | 'puertas'>): Senda[] {
  return r.contorno.caras
    .filter((k) => r.puertas.includes(k.cara))
    .map((k): Senda => {
      const [nx, ny] = k.normal;
      return [
        [k.medio[0] + nx * 0.2, k.medio[1] + ny * 0.2],
        [k.medio[0] - nx * FONDO_DE_LA_CALLE, k.medio[1] - ny * FONDO_DE_LA_CALLE],
      ];
    });
}

/**
 * Un rectángulo del mapa tal como se ve, en casillas: con lo alto restado de la
 * fila (la proyección del mapa, `y − z`), de `x0` a `x1` y de `y0`, lo de
 * arriba, a `y1`.
 */
export interface CajaEnPantalla {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** En cuántas columnas se mide el vano de un arco (`vanoDelArco`): cada una, de 0,03 casillas. */
const COLUMNAS_DEL_VANO = 12;

/**
 * El vano del arco de la puerta de la cara `k`, tal como se ve: la boca que
 * dibuja la guía (`arco`, `tools/taller/recinto.ts`), en la cara del torreón
 * que se ve (`MARCO_DEL_EJE`), de media luz a cada lado de su medio y del suelo
 * a lo alto del arco. Es el paso por el que entra el camino: puesta sobre las
 * cuatro puertas de la hoja `recinto`, cubre su hueco oscuro y el suelo del
 * paso.
 *
 * En `COLUMNAS_DEL_VANO` columnas, cada una la caja de su trozo de boca: en las
 * diagonales la boca va inclinada 45° (el suelo del paso sube a lo largo de la
 * cara) y su caja entera se come un triángulo de muro debajo y otro encima; la
 * casa de delante a la derecha del arco del noroeste, que solo tapa la base del
 * torreón, contaba como que tapaba el vano: cada puerta de detrás costaba 0,7
 * casas de media en 1-40, y con las columnas la media de casas por ciudad
 * sube de 14,04 a 14,27. La del este y el oeste se ve de canto, y su vano es la
 * línea de esa cara.
 */
export function vanoDelArco(k: CaraDelContorno): readonly CajaEnPantalla[] {
  const { u, v } = MARCO_DEL_EJE[EJE_DE_LA_CARA[k.cara]];
  const r = LUZ_DEL_ARCO / 2;
  const cx = k.medio[0] + (GRUESO_DEL_TORREON / 2) * v[0];
  const cy = k.medio[1] + (GRUESO_DEL_TORREON / 2) * v[1];
  // Un punto `a` de la boca, a lo largo del muro: el suelo en `a·u` y lo alto
  // del arco a `ARRANQUE + √(r² − a²)` sobre él. Lo alto, `a·u_y − √(r² − a²)`
  // en la fila, es convexo en `a`: en cada trozo, en su mínimo o en una punta.
  const alto = (a: number) => a * u[1] - Math.sqrt(Math.max(0, r * r - a * a));
  const minimo = (-u[1] * r) / Math.hypot(1, u[1]);
  return Array.from({ length: COLUMNAS_DEL_VANO }, (_, j): CajaEnPantalla => {
    const a0 = -r + (2 * r * j) / COLUMNAS_DEL_VANO;
    const a1 = -r + (2 * r * (j + 1)) / COLUMNAS_DEL_VANO;
    const cima = Math.min(
      alto(a0),
      alto(a1),
      minimo > a0 && minimo < a1 ? alto(minimo) : Number.POSITIVE_INFINITY,
    );
    return {
      x0: cx + Math.min(a0 * u[0], a1 * u[0]),
      x1: cx + Math.max(a0 * u[0], a1 * u[0]),
      y0: cy - ARRANQUE_DEL_ARCO + cima,
      y1: cy + Math.max(a0 * u[1], a1 * u[1]),
    };
  });
}

/** La caja de la imagen de una pieza del recinto, tal como se ve: de su ancho, y de lo alto de su imagen a lo bajo. */
export function cajaEnPantalla(
  p: Pick<PiezaDelRecinto, 'x' | 'y' | 'alto' | 'nw' | 'nh' | 'ax' | 'ay'>,
): CajaEnPantalla {
  const escala = p.alto / p.nh;
  return {
    x0: p.x - p.ax * escala,
    x1: p.x + (p.nw - p.ax) * escala,
    y0: p.y - p.ay * escala,
    y1: p.y + (p.nh - p.ay) * escala,
  };
}

/** Lo que mira `tapaElArco` de una casa: dónde va, su imagen y, si la trae, su silueta. */
export type CasaQueTapa = Pick<
  PiezaDelRecinto,
  'x' | 'y' | 'alto' | 'nw' | 'nh' | 'ax' | 'ay' | 'clave' | 'silueta'
>;

const seCruzan = (a: CajaEnPantalla, b: CajaEnPantalla) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Si la casa `casa` tapa el vano `vano` del arco cuya clave del pintor es
 * `claveDelArco`: se pinta después de él (su clave, que es su pie, va más al
 * sur; la de antes la tapa el arco) y lo opaco de su imagen entra en el vano:
 * alguna franja de su silueta (`Modulo.silueta`), o sin ella, su caja.
 *
 * Es la regla por lo que se ve, la que cumple `recintoDe` y vigila
 * `arcosTapados` (QA de la ciudad llena, H1, 21-10-2026). La calle de la puerta
 * (`callesDeLasPuertas`) mira el pie de la casa a lo largo de la normal de la
 * cara, y en una diagonal esa normal no es la vertical de la pantalla, que es
 * por donde sube el tejado: la casa `1` quedaba a 0,63 por la normal de la
 * puerta del noroeste, pasado el fondo de 0,6, y justo bajo el arco, y su
 * tejado tapaba el vano en 25 de 553 ciudades (s16 (10, 7)). Por la silueta y
 * no por la caja: las esquinas de arriba de un tejado en punta son
 * transparentes, y con la caja la casa de al lado de la calle de una puerta
 * contaba como que tapaba (con la calle de entonces y el vano en una caja,
 * la media de casas por ciudad de 1-40 era 13,86 con la caja de la casa y
 * 14,04 con su silueta).
 */
export function tapaElArco(
  vano: readonly CajaEnPantalla[],
  claveDelArco: number,
  casa: CasaQueTapa,
): boolean {
  // La clave del pintor (`claveDe`, `pintar.ts`, que aquí no se importa: pinta
  // la plaza con `huella.ts`, que importa este módulo).
  if ((casa.clave ?? casa.y) <= claveDelArco) return false;
  const caja = cajaEnPantalla(casa);
  // Estrictas: el vano de canto, una línea, entra si la casa la cruza.
  const cruzadas = vano.filter((c) => seCruzan(caja, c));
  if (cruzadas.length === 0) return false;
  const franjas = casa.silueta;
  if (franjas === undefined) return true;
  const escala = casa.alto / casa.nh;
  const n = franjas.length;
  return franjas.some(([arriba, abajo], k) => {
    if (abajo <= arriba) return false;
    // Las columnas de la franja, como las cuenta `siluetaDeModulo`.
    const a = Math.floor((k * casa.nw) / n);
    const b = Math.max(a + 1, Math.floor(((k + 1) * casa.nw) / n));
    const franja = {
      x0: caja.x0 + a * escala,
      x1: caja.x0 + b * escala,
      y0: caja.y0 + arriba * casa.alto,
      y1: caja.y0 + abajo * casa.alto,
    };
    return cruzadas.some((c) => seCruzan(franja, c));
  });
}

/** Un arco tal como lo pinta la escena: su cara y su clave del pintor (`claveDe`). */
export interface ArcoPintado {
  readonly cara: Cara;
  readonly clave: number;
}

/**
 * Las casas que tapan el vano del arco de una puerta del recinto de `contorno`
 * (`tapaElArco`), cada una dicha: es `informe.arcosTapados`, «ninguna casa tapa
 * un arco», y tiene que estar vacío.
 */
export function arcosTapados(
  contorno: Contorno,
  arcos: readonly ArcoPintado[],
  casas: readonly (CasaQueTapa & Pick<PiezaDelRecinto, 'nombre'>)[],
): string[] {
  const tapados: string[] = [];
  for (const a of arcos) {
    const vano = vanoDelArco(caraDelContorno(contorno, a.cara));
    for (const casa of casas)
      if (tapaElArco(vano, a.clave, casa))
        tapados.push(
          `la casa «${casa.nombre}» en ${casa.x.toFixed(2)},${casa.y.toFixed(2)} tapa el arco de la puerta ${NOMBRE_DE_LA_CARA[a.cara]}`,
        );
  }
  return tapados;
}

/** La cara `cara` del octógono `c`. */
const caraDelContorno = (c: Contorno, cara: Cara): CaraDelContorno =>
  c.caras[CARAS.indexOf(cara)] as CaraDelContorno;

/** Lo que el cruce de una senda con el anillo puede apartarse del medio del arco: media luz y la holgura de las rampas. */
export const HOLGURA_DEL_ARCO = LUZ_DEL_ARCO / 2 + 0.06;

/**
 * Los cruces de las sendas pintadas con el octógono de un recinto que no caen en
 * el arco de una de sus puertas (a `HOLGURA_DEL_ARCO` de su medio), cada uno
 * dicho: es `informe.sendaFueraDeLaPuerta`, «ninguna abertura más ancha que su
 * puerta», y tiene que estar vacío.
 */
export function sendasFueraDeLaPuerta(
  sendas: readonly Senda[],
  recintos: readonly (PuertasDeUnRecinto & { readonly id: string })[],
): string[] {
  const fuera: string[] = [];
  for (const r of recintos) {
    const [cx, cy] = r.contorno.centro;
    // Las sendas que pasan lejos ni se miran: el octógono cabe en este radio.
    const lejos = LADO_DEL_RECINTO;
    for (const l of sendas) {
      if (!l.some(([x, y]) => Math.abs(x - cx) < lejos && Math.abs(y - cy) < lejos)) continue;
      for (const cruce of crucesConElContorno(r.contorno, l)) {
        const k = puertaMasCercana(r, cruce);
        if (
          k !== undefined &&
          Math.hypot(k.medio[0] - cruce[0], k.medio[1] - cruce[1]) <= HOLGURA_DEL_ARCO
        )
          continue;
        fuera.push(
          `${r.id}: la senda cruza la muralla en ${cruce[0].toFixed(2)},${cruce[1].toFixed(2)}, fuera del arco de una puerta`,
        );
      }
    }
  }
  return fuera;
}

/**
 * Lo que el estribo de un puente de ciudad-puente puede quedar del medio de la
 * cara del río para que se tenga por su camino: el redondeo de su pie
 * (`puenteDeLaCiudad` lo pone en el medio).
 */
const PUENTE_EN_SU_ARCO = 0.05;

/** Cómo se dice cada cara de un recinto, para la persona. */
const NOMBRE_DE_LA_CARA: Readonly<Record<Cara, string>> = {
  n: 'del norte',
  ne: 'del noreste',
  e: 'del este',
  se: 'del sureste',
  s: 'del sur',
  so: 'del suroeste',
  o: 'del oeste',
  no: 'del noroeste',
};

/** Un recinto tal como lo mira `puertasSinSuCamino`: lo pintado y lo del núcleo. */
export interface PuertasPintadas {
  readonly id: string;
  readonly contorno: Contorno;
  /** Las caras de las puertas que se pintaron (`Recinto.arcos`). */
  readonly pintadas: readonly Cara[];
  /** Las del núcleo, otra vez de los caminos (`puertasDelNucleo`). */
  readonly delNucleo: PuertasDelNucleo;
}

/**
 * Las puertas de los recintos que no casan con los caminos del núcleo, cada una
 * dicha: una puerta pintada que el núcleo no tiene (sin camino que llegue), una
 * del núcleo que no se pinta, una pintada por cuyo arco (a `HOLGURA_DEL_ARCO`
 * de su medio) no cruza ninguna senda y la del río a la que no llega el estribo
 * de ningún puente. Es `informe.puertaSinCamino`, y tiene que estar vacío: hay
 * puerta donde llega un camino, y solo ahí (decisión del usuario, 21-10-2026).
 * Con `sendasFueraDeLaPuerta`, que ninguna senda cruce la muralla fuera de un
 * arco, las puertas pintadas son las del juego en los dos sentidos.
 */
export function puertasSinSuCamino(
  recintos: readonly PuertasPintadas[],
  sendas: readonly Senda[],
  puentes: readonly { readonly extremos: readonly [Par, Par] }[],
): string[] {
  const fuera: string[] = [];
  for (const r of recintos) {
    const { puertas, rio } = r.delNucleo;
    for (const k of r.pintadas)
      if (!puertas.includes(k))
        fuera.push(
          `${r.id}: la puerta ${NOMBRE_DE_LA_CARA[k]} se pinta y ningún camino llega a ella`,
        );
    for (const k of puertas)
      if (!r.pintadas.includes(k))
        fuera.push(`${r.id}: un camino llega a la puerta ${NOMBRE_DE_LA_CARA[k]} y no se pinta`);
    const [cx, cy] = r.contorno.centro;
    const cerca = sendas.filter((l) =>
      l.some(
        ([x, y]) => Math.abs(x - cx) < LADO_DEL_RECINTO && Math.abs(y - cy) < LADO_DEL_RECINTO,
      ),
    );
    for (const k of r.contorno.caras) {
      if (!r.pintadas.includes(k.cara)) continue;
      const enElArco = (p: Par) =>
        Math.hypot(p[0] - k.medio[0], p[1] - k.medio[1]) <= HOLGURA_DEL_ARCO;
      if (k.cara === rio) {
        if (
          !puentes.some((pu) =>
            pu.extremos.some(
              (p) => Math.hypot(p[0] - k.medio[0], p[1] - k.medio[1]) <= PUENTE_EN_SU_ARCO,
            ),
          )
        )
          fuera.push(`${r.id}: la puerta del río ${NOMBRE_DE_LA_CARA[k.cara]} no lleva su puente`);
        continue;
      }
      if (!cerca.some((l) => crucesConElContorno(r.contorno, l).some(enElArco)))
        fuera.push(
          `${r.id}: ninguna senda pasa por el arco de la puerta ${NOMBRE_DE_LA_CARA[k.cara]}`,
        );
    }
  }
  return fuera;
}

// ------------------------------------------------------------- los guardias

/** Distancia de `(x, y)` al tramo `a → b`. */
function aTramo(x: number, y: number, a: Par, b: Par): number {
  const [qx, qy] = puntoDelTramo([x, y], a, b);
  return Math.hypot(x - qx, y - qy);
}

/**
 * Qué del anillo de un recinto pisa una senda de media anchura `semiancho` que
 * pasa por `(x, y)`, dicho, o undefined: la base de una torre (su vértice, con
 * el radio de la torre) o el pie de una cara sin puerta (con medio grueso de
 * muro). Lo que va por dentro de la plaza lo tapa ella (también lo que corta las
 * esquinas que deja fuera el octógono), y lo que pasa por DETRÁS de una torre o
 * de una cara de detrás lo tapa la pieza, como tapa cualquier volumen lo de
 * detrás: la senda de una puerta del norte o de una diagonal de detrás sale por
 * detrás de la torre de delante (la cámara sube 1,12 su silueta), y eso no es
 * pisarla. Lo leen el guardia (`anilloSobreLaSenda`) y la senda que se aparta
 * (`componer`), que con `tambienDetras` se aparta también de eso: con la
 * excepción, la regla salta de sí a no al norte del centro de una torre y la
 * senda se corría hacia ella (s5 (30,36)).
 */
export function pisaElAnillo(
  r: Pick<Recinto, 'contorno' | 'puertas'>,
  x: number,
  y: number,
  semiancho: number,
  tambienDetras = false,
): string | undefined {
  if (enLaPlaza(r.contorno.rect, x, y)) return undefined;
  const torre = r.contorno.vertices.find(
    (v) =>
      (tambienDetras || y >= v[1]) && Math.hypot(x - v[0], y - v[1]) < RADIO_DE_TORRE + semiancho,
  );
  if (torre !== undefined) return `la torre de ${torre[0].toFixed(2)},${torre[1].toFixed(2)}`;
  const cara = r.contorno.caras.find(
    (k) =>
      !r.puertas.includes(k.cara) &&
      !(!tambienDetras && DE_DETRAS.has(k.cara) && dentroDeLaCara(k, x, y) < 0) &&
      aTramo(x, y, k.a, k.b) < GRUESO_DEL_MURO / 2 + semiancho,
  );
  return cara === undefined ? undefined : `el muro de la cara ${cara.cara}`;
}

/**
 * Lo que de las sendas pintadas pisa el anillo de un recinto (`pisaElAnillo`),
 * mirado cada 0,05 y un caso por tramo de senda: es `informe.recintoSobreSenda`,
 * y tiene que estar vacío. Se entra por el arco de una puerta.
 */
export function anilloSobreLaSenda(
  r: Pick<Recinto, 'contorno' | 'puertas'>,
  sendas: readonly Senda[],
  semiancho: number,
): string[] {
  const fuera: string[] = [];
  const [cx, cy] = r.contorno.centro;
  const paso = 0.05;
  for (const l of sendas) {
    if (
      !l.some(
        ([x, y]) => Math.abs(x - cx) < LADO_DEL_RECINTO && Math.abs(y - cy) < LADO_DEL_RECINTO,
      )
    )
      continue;
    for (let i = 0; i + 1 < l.length; i++) {
      const p = l[i] as Par;
      const q = l[i + 1] as Par;
      const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / paso));
      for (let j = 0; j <= n; j++) {
        const x = p[0] + ((q[0] - p[0]) * j) / n;
        const y = p[1] + ((q[1] - p[1]) * j) / n;
        const que = pisaElAnillo(r, x, y, semiancho);
        if (que === undefined) continue;
        fuera.push(`la senda pasa por ${que} en ${x.toFixed(2)},${y.toFixed(2)}`);
        break;
      }
    }
  }
  return fuera;
}

/**
 * Lo que un puente puede entrar en un recinto por su pisada, en casillas: el
 * redondeo del pie de la cara, donde acaba el de una ciudad-puente.
 */
const PUENTE_DENTRO = 0.01;

/**
 * Los puentes cuya pisada (`Puente.extremos`, de estribo a estribo en el suelo)
 * entra en el octógono de un recinto más de `PUENTE_DENTRO`, mirada cada 0,05:
 * es `informe.puenteSobreElAnillo`, y tiene que estar vacío. El puente de una
 * ciudad-puente acaba al pie de la cara del río (`puenteDeLaCiudad`); entero,
 * con el río al sur, su tablero se pintaba delante de la muralla y llegaba a
 * la mitad de la plaza (H2 del QA de la vuelta 2: 15 de 217 en 1-40).
 */
export function puentesSobreElAnillo(
  contornos: readonly Contorno[],
  puentes: readonly { readonly id: string; readonly extremos: readonly [Par, Par] }[],
): string[] {
  const fuera: string[] = [];
  const paso = 0.05;
  for (const pu of puentes) {
    const [p, q] = pu.extremos;
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / paso));
    for (const c of contornos) {
      if (Math.abs(p[0] - c.centro[0]) > 2 * LADO_DEL_RECINTO) continue;
      if (Math.abs(p[1] - c.centro[1]) > 2 * LADO_DEL_RECINTO) continue;
      for (let j = 0; j <= n; j++) {
        const x = p[0] + ((q[0] - p[0]) * j) / n;
        const y = p[1] + ((q[1] - p[1]) * j) / n;
        if (!dentroDelContorno(c, x, y, PUENTE_DENTRO)) continue;
        fuera.push(
          `el puente ${pu.id} entra en el recinto de (${c.rect.i0},${c.rect.j0}) en ${x.toFixed(2)},${y.toFixed(2)}`,
        );
        break;
      }
    }
  }
  return fuera;
}

/** Cada cuánto se mira el anillo en `huecosDelAnillo`, en casillas. */
const PASO_DEL_ANILLO = 0.05;

/**
 * Lo que de una pieza del anillo cubre su cara, como trecho `[desde, hasta]`
 * medido desde el vértice `a`: una torre, su base alrededor de su vértice; una
 * puerta o un tramo en diagonal, que van de vértice a vértice, la cara entera;
 * el tramo ancho, su ancho; el de norte a sur, su adarve.
 */
function loQueCubre(
  p: PiezaDelRecinto,
  k: CaraDelContorno,
  largo: number,
): readonly [number, number] {
  if (p.que === 'torre') {
    const r = RADIO_DE_TORRE;
    return p.x === k.a[0] && p.y === k.a[1] + r ? [-r, r] : [largo - r, largo + r];
  }
  if (
    p.que === 'puerta' ||
    EJE_DE_LA_CARA[k.cara] === 'ne-so' ||
    EJE_DE_LA_CARA[k.cara] === 'no-se'
  )
    return [0, largo];
  const desdeA = (x: number, y: number) =>
    ((x - k.a[0]) * (k.b[0] - k.a[0]) + (y - k.a[1]) * (k.b[1] - k.a[1])) / largo;
  if (k.cara === 'n' || k.cara === 's') {
    const w = (p.alto * p.nw) / p.nh;
    const m = desdeA(p.x, p.y);
    return [m - w / 2, m + w / 2];
  }
  // De norte a sur: de su pie, hacia el norte, lo que mide su adarve.
  const fondo = p.alto * FONDO_DEL_ADARVE;
  const [s0, s1] = [desdeA(p.x, p.y), desdeA(p.x, p.y - fondo)];
  return [Math.min(s0, s1), Math.max(s0, s1)];
}

/**
 * Los puntos del anillo, cada `PASO_DEL_ANILLO` por cada cara, que no cubre la
 * base de ninguna de sus piezas (`loQueCubre`): una cara sin su tramo, un tramo
 * que no llega a la torre. Es `informe.anilloAbierto`, y tiene que estar vacío.
 */
export function huecosDelAnillo(r: Recinto): string[] {
  const fuera: string[] = [];
  const piezas = [...r.torres, ...r.tramos, ...r.arcos];
  for (const k of r.contorno.caras) {
    const largo = Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]);
    const suyas = piezas.filter(
      (p) =>
        p.cara === k.cara ||
        (p.que === 'torre' && p.x === k.b[0] && p.y === k.b[1] + RADIO_DE_TORRE),
    );
    const trechos = suyas.map((p) => loQueCubre(p, k, largo));
    for (let s = 0; s <= largo + 1e-9; s += PASO_DEL_ANILLO)
      if (!trechos.some(([d, h]) => s >= d - 1e-9 && s <= h + 1e-9))
        fuera.push(
          `la cara ${k.cara} queda abierta en ${(k.a[0] + ((k.b[0] - k.a[0]) * s) / largo).toFixed(2)},${(k.a[1] + ((k.b[1] - k.a[1]) * s) / largo).toFixed(2)}`,
        );
  }
  return fuera;
}

/**
 * Las parejas de casas con la misma imagen al lado (la misma fila, a menos de
 * una décima) o detrás (la fila de atrás, solapadas): es
 * `informe.casasRepetidasJuntas`, y tiene que estar vacío. Lo garantiza la
 * regla; el guardia y `test/recinto.test.ts` lo miran con los mismos umbrales.
 */
export function casasRepetidasJuntas(casas: readonly PiezaDelRecinto[]): string[] {
  const fuera: string[] = [];
  const caja = (p: PiezaDelRecinto) => {
    const izquierda = p.x - (p.ax * p.alto) / p.nh;
    return [izquierda, izquierda + (p.nw * p.alto) / p.nh] as const;
  };
  for (let i = 0; i < casas.length; i++)
    for (let j = i + 1; j < casas.length; j++) {
      const p = casas[i] as PiezaDelRecinto;
      const q = casas[j] as PiezaDelRecinto;
      if (p.nombre !== q.nombre) continue;
      const [a0, a1] = caja(p);
      const [b0, b1] = caja(q);
      const dy = Math.abs(p.y - q.y);
      const hueco = Math.max(a0, b0) - Math.min(a1, b1);
      if ((dy < 0.05 && hueco < 0.1) || (dy > 0.05 && dy < 0.5 && hueco < 0))
        fuera.push(
          `«${p.nombre}» en ${p.x.toFixed(2)},${p.y.toFixed(2)} y ${q.x.toFixed(2)},${q.y.toFixed(2)}`,
        );
    }
  return fuera;
}

// ------------------------------------------------------------ el orden del anillo

/**
 * Lo alto del cilindro de una torre, en casillas: su imagen mide eso más el
 * diámetro de su base, porque la tapa se ve entera (el suelo tal cual y lo alto
 * hacia arriba). Las almenas van dentro.
 */
const ALTO_DEL_CILINDRO = ALTO_DE_TORRE_DEL_RECINTO - 2 * RADIO_DE_TORRE;

/** Los lados del polígono con que se mide la base redonda de una torre. */
const LADOS_DE_LA_TORRE = 24;

/** Cada cuánto se mira la pantalla al decidir qué pieza va delante, en casillas. */
const PASO_DEL_ORDEN = 0.02;

/** Lo que una pieza del anillo se corre de la clave de la torre que tapa o la tapa. */
const ENTRE_TORRE_Y_PIEZA = 0.002;

/** Un prisma recto: su planta (un polígono convexo, en casillas) levantada del suelo a `alto`. */
interface Prisma {
  readonly planta: readonly Par[];
  readonly alto: number;
}

/** La caja de un muro de la cara `k`, de `a0` a `a1` desde su vértice `a`, de `grueso` de través y `alto`. */
function cajaDeLaCara(
  k: CaraDelContorno,
  a0: number,
  a1: number,
  grueso: number,
  alto: number,
): Prisma {
  const largo = Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]);
  const u: Par = [(k.b[0] - k.a[0]) / largo, (k.b[1] - k.a[1]) / largo];
  const [nx, ny] = k.normal;
  const g = grueso / 2;
  const en = (a: number, b: number): Par => [
    k.a[0] + a * u[0] + b * nx,
    k.a[1] + a * u[1] + b * ny,
  ];
  return { planta: [en(a0, -g), en(a1, -g), en(a1, g), en(a0, g)], alto };
}

/**
 * Lo que es cada pieza del anillo en el espacio, como lo dibuja su guía: la
 * torre, un cilindro centrado en su vértice; el tramo liso, un muro de
 * `GRUESO_DEL_MURO` de vértice a vértice (la imagen lo trae entero, cortado
 * donde lo tapa la torre); la puerta, ese muro con su torreón en el medio,
 * más grueso y más alto (`tools/taller/recinto.ts`); y cada pieza de una tirada
 * de norte a sur, su adarve de su pie hacia el norte, con el alto que se ve de
 * su frente.
 */
function solidoDe(p: PiezaDelRecinto, contorno: Contorno): readonly Prisma[] {
  if (p.que === 'torre') {
    const [cx, cy] = [p.x, p.y - RADIO_DE_TORRE];
    const planta = Array.from({ length: LADOS_DE_LA_TORRE }, (_, i): Par => {
      const t = (2 * Math.PI * i) / LADOS_DE_LA_TORRE;
      return [cx + RADIO_DE_TORRE * Math.cos(t), cy + RADIO_DE_TORRE * Math.sin(t)];
    });
    return [{ planta, alto: ALTO_DEL_CILINDRO }];
  }
  if (p.cara === undefined)
    throw new Error(`la pieza ${p.que} del anillo en ${p.x},${p.y} no dice su cara`);
  const k = caraDelContorno(contorno, p.cara);
  const largo = Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]);
  if (p.que === 'puerta') {
    const t0 = (largo - LARGO_DEL_TORREON) / 2;
    const t1 = (largo + LARGO_DEL_TORREON) / 2;
    return [
      cajaDeLaCara(k, 0, t0, GRUESO_DEL_MURO, ALTO_DEL_MURO_DEL_RECINTO),
      cajaDeLaCara(k, t0, t1, GRUESO_DEL_TORREON, ALTO_DE_LA_PUERTA_DEL_RECINTO),
      cajaDeLaCara(k, t1, largo, GRUESO_DEL_MURO, ALTO_DEL_MURO_DEL_RECINTO),
    ];
  }
  if (EJE_DE_LA_CARA[p.cara] === 'e-o') {
    const g = GRUESO_DEL_MURO / 2;
    const norte = p.y - p.alto * FONDO_DEL_ADARVE;
    return [
      {
        planta: [
          [p.x - g, norte],
          [p.x + g, norte],
          [p.x + g, p.y],
          [p.x - g, p.y],
        ],
        alto: p.alto * (1 - FONDO_DEL_ADARVE),
      },
    ];
  }
  return [cajaDeLaCara(k, 0, largo, GRUESO_DEL_MURO, ALTO_DEL_MURO_DEL_RECINTO)];
}

/**
 * Lo más cercano a la cámara que tiene el sólido `ps` en el punto de pantalla
 * `(sx, sy)`, como la fila del suelo de ese punto, o `undefined` si ahí no se
 * ve. Un punto `(x, y, z)` se ve en `(x, y − z)`: por un punto de pantalla
 * pasan los `(sx, sy + z, z)`, y el más alto es el de delante.
 */
function delanteEn(ps: readonly Prisma[], sx: number, sy: number): number | undefined {
  let mejor: number | undefined;
  for (const { planta, alto } of ps) {
    let ya = Number.POSITIVE_INFINITY;
    let yb = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < planta.length; i++) {
      const [px, py] = planta[i] as Par;
      const [qx, qy] = planta[(i + 1) % planta.length] as Par;
      if ((px - sx) * (qx - sx) > 0) continue;
      const ys = px === qx ? [py, qy] : [py + ((qy - py) * (sx - px)) / (qx - px)];
      for (const y of ys) {
        ya = Math.min(ya, y);
        yb = Math.max(yb, y);
      }
    }
    if (ya > yb) continue;
    const z = Math.min(alto, yb - sy);
    if (z < Math.max(0, ya - sy)) continue;
    mejor = Math.max(mejor ?? Number.NEGATIVE_INFINITY, sy + z);
  }
  return mejor;
}

/** El rectángulo de pantalla de un sólido: `[x0, y0, x1, y1]`. */
function pantallaDe(ps: readonly Prisma[]): readonly [number, number, number, number] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { planta, alto } of ps)
    for (const [x, y] of planta) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y - alto);
      y1 = Math.max(y1, y);
    }
  return [x0, y0, x1, y1];
}

/**
 * Dónde se solapan en pantalla los sólidos `a` y `b` y quién va delante en
 * cada punto, en casillas²: `[lo que a tapa de b, lo que b tapa de a]`. Una
 * imagen solo va entera delante o detrás de otra, así que la que tapa más es
 * la que se pinta después.
 */
function loQueSeTapan(a: readonly Prisma[], b: readonly Prisma[]): readonly [number, number] {
  const [ax0, ay0, ax1, ay1] = pantallaDe(a);
  const [bx0, by0, bx1, by1] = pantallaDe(b);
  const [x0, y0, x1, y1] = [
    Math.max(ax0, bx0),
    Math.max(ay0, by0),
    Math.min(ax1, bx1),
    Math.min(ay1, by1),
  ];
  let tapaA = 0;
  let tapaB = 0;
  const celda = PASO_DEL_ORDEN * PASO_DEL_ORDEN;
  for (let sx = x0 + PASO_DEL_ORDEN / 2; sx < x1; sx += PASO_DEL_ORDEN)
    for (let sy = y0 + PASO_DEL_ORDEN / 2; sy < y1; sy += PASO_DEL_ORDEN) {
      const da = delanteEn(a, sx, sy);
      const db = delanteEn(b, sx, sy);
      if (da === undefined || db === undefined || Math.abs(da - db) < 1e-9) continue;
      if (da > db) tapaA += celda;
      else tapaB += celda;
    }
  return [tapaA, tapaB];
}

/** Las torres de los dos vértices de la cara de `p`. */
function torresDeSuCara<M extends ModuloDelRecinto>(
  p: PiezaDelRecinto<M>,
  contorno: Contorno,
  torres: readonly PiezaDelRecinto<M>[],
): PiezaDelRecinto<M>[] {
  if (p.cara === undefined) return [];
  const k = caraDelContorno(contorno, p.cara);
  return torres.filter((t) =>
    [k.a, k.b].some(
      (v) => Math.abs(t.x - v[0]) < 1e-9 && Math.abs(t.y - RADIO_DE_TORRE - v[1]) < 1e-9,
    ),
  );
}

/** Una torre o una pieza de su cara: cuál de las dos va antes en el pintor, por la geometría. */
interface Antes<M extends ModuloDelRecinto> {
  readonly antes: PiezaDelRecinto<M>;
  readonly despues: PiezaDelRecinto<M>;
}

/** Las vueltas que da `ordenDelAnillo` como mucho: cada una mueve lo que una arista pide. */
const VUELTAS_DEL_ORDEN = 32;

/**
 * El anillo con la clave del pintor de cada torre y cada pieza de sus caras
 * (tramos y puertas) en el orden de la geometría: de una torre y una pieza de
 * una de sus dos caras, la que tiene más cerca de la cámara donde se solapan
 * en pantalla (`loQueSeTapan`) va después.
 *
 * Lo que no cumple se mueve lo justo, y hacia donde no cruza las casas: lo de
 * detrás (el pie al norte del medio del recinto, donde las casas van delante
 * del muro) baja la clave de la que va antes; lo de delante (el muro que se ve
 * por fuera, delante de las casas) sube la de la que va después. Así la
 * torre del vértice de arriba de una puerta del norte pasa detrás de ella, y
 * la de un vértice de abajo, delante del tramo en diagonal que la toca, sin
 * que ninguna casa cambie de lado. Si en `VUELTAS_DEL_ORDEN` no queda en
 * orden, no hay claves que lo cumplan: lanza diciéndolo.
 */
export function ordenDelAnillo<M extends ModuloDelRecinto>(
  contorno: Contorno,
  torres: readonly PiezaDelRecinto<M>[],
  piezas: readonly PiezaDelRecinto<M>[],
): { readonly torres: PiezaDelRecinto<M>[]; readonly piezas: PiezaDelRecinto<M>[] } {
  const aristas: Antes<M>[] = [];
  for (const p of piezas) {
    const suyo = solidoDe(p, contorno);
    for (const t of torresDeSuCara(p, contorno, torres)) {
      const [tapaP, tapaT] = loQueSeTapan(suyo, solidoDe(t, contorno));
      if (tapaP > tapaT) aristas.push({ antes: t, despues: p });
      else if (tapaT > tapaP) aristas.push({ antes: p, despues: t });
    }
  }
  const clave = new Map<PiezaDelRecinto<M>, number>(
    [...torres, ...piezas].map((p) => [p, p.clave ?? p.y] as const),
  );
  const deDetras = (p: PiezaDelRecinto<M>) => (p.clave ?? p.y) < contorno.centro[1];
  for (let vuelta = 0; ; vuelta++) {
    const mal = aristas.filter(
      (a) => (clave.get(a.antes) as number) >= (clave.get(a.despues) as number),
    );
    if (mal.length === 0) break;
    if (vuelta === VUELTAS_DEL_ORDEN)
      throw new Error(
        `el anillo de ${contorno.rect.i0},${contorno.rect.j0} no tiene orden de pintor: ${mal
          .map(
            (a) =>
              `la ${a.antes.que} de la cara ${a.antes.cara} antes que la ${a.despues.que} de la cara ${a.despues.cara}`,
          )
          .join('; ')}`,
      );
    for (const { antes, despues } of mal) {
      const ca = clave.get(antes) as number;
      const cd = clave.get(despues) as number;
      if (ca < cd) continue;
      if (deDetras(despues)) clave.set(antes, cd - ENTRE_TORRE_Y_PIEZA);
      else clave.set(despues, ca + ENTRE_TORRE_Y_PIEZA);
    }
  }
  const conSuClave = (p: PiezaDelRecinto<M>): PiezaDelRecinto<M> => {
    const c = clave.get(p) as number;
    return c === (p.clave ?? p.y) ? p : { ...p, clave: c };
  };
  return { torres: torres.map(conSuClave), piezas: piezas.map(conSuClave) };
}

/** Una pieza del anillo tal como se pinta: con la clave y el `x` de su sprite (`ordenDeVolumenes`). */
export interface PiezaPintada {
  readonly pieza: PiezaDelRecinto;
  readonly clave: number;
  readonly x: number;
}

/**
 * Las parejas de torre y pieza de una de sus caras que el pintor pone al revés
 * de la geometría: la que se pinta después (por su clave y, a igual clave, por
 * su `x`, `ordenDeVolumenes`) tapa en pantalla menos de la otra que la otra de
 * ella (`loQueSeTapan`), cada una dicha. Es `informe.anilloMalOrdenado`, y
 * tiene que estar vacío.
 */
export function anilloMalOrdenado(contorno: Contorno, pintadas: readonly PiezaPintada[]): string[] {
  const fuera: string[] = [];
  const torres = pintadas.filter((p) => p.pieza.que === 'torre');
  for (const p of pintadas) {
    if (p.pieza.que !== 'tramo' && p.pieza.que !== 'puerta') continue;
    const suyas = torresDeSuCara(
      p.pieza,
      contorno,
      torres.map((t) => t.pieza),
    );
    for (const t of torres.filter((t) => suyas.includes(t.pieza))) {
      const [tapaP, tapaT] = loQueSeTapan(solidoDe(p.pieza, contorno), solidoDe(t.pieza, contorno));
      const despues = p.clave - t.clave || p.x - t.x;
      const masCerca =
        tapaP > tapaT ? (p.pieza.que === 'tramo' ? 'el tramo' : 'la puerta') : 'la torre';
      if ((despues > 0 && tapaT > tapaP) || (despues < 0 && tapaP > tapaT))
        fuera.push(
          `${p.pieza.que === 'tramo' ? 'el tramo' : 'la puerta'} de la cara ${p.pieza.cara} en ${p.x.toFixed(2)},${p.pieza.y.toFixed(2)} se pinta ${despues > 0 ? 'después' : 'antes'} que la torre de ${t.x.toFixed(2)},${t.pieza.y.toFixed(2)}, y ${masCerca} está más cerca de la cámara donde se solapan (tapa ${(Math.max(tapaP, tapaT) * 1e4).toFixed(0)} frente a ${(Math.min(tapaP, tapaT) * 1e4).toFixed(0)} diezmilésimas de casilla²)`,
        );
    }
  }
  return fuera;
}
