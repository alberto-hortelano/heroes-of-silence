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
 *   `sendasPorLosTendidos` en `celdas.ts`). Dentro, la plaza mayor
 *   (`PLAZA_MAYOR`) y una calle de cada puerta hasta ella.
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
import { ALTO_DE_TORRE, ALTO_DEL_TRAMO_NORTE_SUR, ANCHO_DEL_TRAMO_HORIZONTAL } from './muralla.js';
import { varianteDeId } from './nodos.js';
import { SEMIANCHO_DE_LA_HUELLA, type Senda } from './sendas.js';

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

/** Lo que miden las piezas del anillo, en casillas: las del mapa a `ESCALA_DEL_RECINTO`. */
export const ALTO_DE_TORRE_DEL_RECINTO = ALTO_DE_TORRE * ESCALA_DEL_RECINTO;
export const ANCHO_DEL_TRAMO_DEL_RECINTO = ANCHO_DEL_TRAMO_HORIZONTAL * ESCALA_DEL_RECINTO;
export const ALTO_DEL_TRAMO_NORTE_SUR_DEL_RECINTO = ALTO_DEL_TRAMO_NORTE_SUR * ESCALA_DEL_RECINTO;

/**
 * Lo ancho de una torre del muro en veces su alto (la redonda, 210 × 379 px):
 * el marcador sin arte, y lo que una torre cubre del anillo a cada lado de su
 * vértice (`huecosDelAnillo`).
 */
export const PROPORCION_DE_TORRE = 0.55;

/** El radio de la base de una torre del recinto, en casillas: la mitad de su ancho (0,31). */
export const RADIO_DE_TORRE = (ALTO_DE_TORRE_DEL_RECINTO * PROPORCION_DE_TORRE) / 2;

/**
 * Lo alto del muro de un tramo liso, con sus almenas (la pieza `horizontal` a
 * `ANCHO_DEL_TRAMO_DEL_RECINTO`, 489 × 214 px), y lo de una puerta, con su
 * torreón: el marcador sin arte y la guía del taller (`tools/taller/recinto.ts`).
 */
export const ALTO_DEL_MURO_DEL_RECINTO = 0.44;
export const ALTO_DE_LA_PUERTA_DEL_RECINTO = 0.74;

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

/** La hoja de las piezas que no tiene la muralla del mapa: las cuatro puertas y los dos tramos en diagonal. */
export const HOJA_DEL_RECINTO = 'recinto';

/** La puerta de cada eje (`puerta-n-s`…) y el tramo liso de una diagonal (`tramo-ne-so`). */
export const puertaDelEje = (eje: EjeDelRecinto) => `puerta-${eje}` as const;
export const tramoDelEje = (eje: 'ne-so' | 'no-se') => `tramo-${eje}` as const;

/** Los módulos de la hoja `recinto`, en el orden de su rejilla: cuatro puertas y dos tramos. */
export const MODULOS_DEL_RECINTO = [
  ...EJES_DEL_RECINTO.map(puertaDelEje),
  tramoDelEje('ne-so'),
  tramoDelEje('no-se'),
] as const;

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
 * (`ANCHO_DE_SENDA`) y pasa por él con holgura. La guía la dibuja así.
 */
export const LUZ_DEL_ARCO = 0.4;

/** El grueso del muro del recinto, en casillas (la guía de `tools/taller/recinto.ts` lo dibuja así). */
export const GRUESO_DEL_MURO = 0.3;

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
  /** El tramo ancho de la hoja `muro`: las caras norte y sur. */
  readonly horizontal: M;
  /** Los tramos de norte a sur (`muro-ns-1`, `muro-ns-2`), por su ancla del medio: las caras este y oeste. */
  readonly norteSur: readonly M[];
  /** Las piezas de la hoja `recinto` por su nombre (`MODULOS_DEL_RECINTO`), con sus juntas. */
  readonly delRecinto: Readonly<Record<(typeof MODULOS_DEL_RECINTO)[number], M>>;
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

/** Lo que una pieza de tramo de norte a sur pasa de su trecho por cada lado: lo tapa la torre de la punta. */
const SOLAPE_DEL_TRAMO = 0.15;

/**
 * Lo que mide de fondo el adarve de un tramo de norte a sur, en veces su alto:
 * los dos tercios de arriba de la pieza (el de abajo es el muro que se ve de
 * frente; a 1,6 el adarve cubre 1,07 casillas, `ALTO_DEL_TRAMO_NORTE_SUR`).
 */
export const FONDO_DEL_ADARVE = 2 / 3;

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
 * puerta, la plaza mayor). Con 0,1 y tres módulos por sitio, las calles hasta
 * la plaza mayor dejaban la mediana de casas por ciudad de 1-20 en 12; con este
 * y probando todos, en 13 (vuelta 3).
 */
const AVANCE_SIN_CASA = 0.05;

/** Las caras de detrás: su muro se ve por dentro y va detrás de las casas. */
const DE_DETRAS: ReadonlySet<Cara> = new Set(['n', 'ne', 'no']);

/**
 * La pieza `m` de vértice a vértice de la cara `k`: sus dos juntas en `a` y `b`,
 * sin escala propia. Basta una junta en su vértice (o el medio de las dos en el
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
  const escala = largo / Math.hypot(j1[0] - j0[0], j1[1] - j0[1]);
  const ys = [k.a[1], k.b[1]];
  const base = { ...m, que, alto: m.nh * escala, cara: k.cara };
  // La de una cara de detrás, por el medio y antes que lo de su vértice de
  // arriba; la de una de delante que baja (en diagonal, o la del este y el
  // oeste), por su junta de abajo en su vértice de abajo: se pinta tras todo lo
  // que tapa, y la clave del pintor no pasa de su pie (con el pie en el medio y
  // la clave abajo, `separar` la tenía por mal ordenada).
  const abajo = k.a[1] >= k.b[1] ? k.a : k.b;
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
 * en cada cara, su puerta o su tramo liso: al norte y al sur el tramo ancho de
 * la hoja `muro`, al este y al oeste los de norte a sur (dos, por su adarve), y
 * en las diagonales los de la hoja `recinto`. Las puertas y los tramos en
 * diagonal van de vértice a vértice por sus juntas (`deVerticeAVertice`).
 *
 * Las casas, por filas de norte a sur, de oeste a este desde el muro, con el pie
 * dentro del octógono (`filaDelContorno`) y sin tapar la plaza mayor
 * (`tapaLaPlazaMayor`): la siguiente de una baraja de la hoja
 * que no sea la de su izquierda ni una de la fila de detrás que se le solape; si
 * no entra (la calle de una puerta, la plaza mayor), la siguiente de la baraja
 * que entre, y si ninguna, la fila avanza.
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
  const torres = contorno.caras.map(
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
    if (eje === 'ne-so' || eje === 'no-se') {
      tramos.push(deVerticeAVertice(modulos.delRecinto[tramoDelEje(eje)], k, 'tramo'));
      continue;
    }
    if (eje === 'n-s') {
      // Una pieza a lo ancho de la cara: las torres de las puntas tapan sus extremos.
      const h = modulos.horizontal;
      tramos.push({
        ...h,
        que: 'tramo',
        x: k.medio[0],
        y: k.medio[1],
        alto: (ANCHO_DEL_TRAMO_DEL_RECINTO * h.nh) / h.nw,
        clave: k.medio[1] - 0.005,
        cara: k.cara,
      });
      continue;
    }
    // Este u oeste: de norte a sur, cada pieza cubre con su adarve su trozo y
    // apoya el pie en la punta sur del trozo.
    const yNorte = Math.min(k.a[1], k.b[1]);
    const ySur = Math.max(k.a[1], k.b[1]);
    const piezas = Math.ceil(
      (ySur - yNorte) / (ALTO_DEL_TRAMO_NORTE_SUR_DEL_RECINTO * FONDO_DEL_ADARVE),
    );
    const trozo = (ySur - yNorte) / piezas;
    for (let j = 0; j < piezas; j++) {
      const m = modulos.norteSur[
        varianteDeId(`${e.id}:${k.cara}:${j}`, modulos.norteSur.length)
      ] as M;
      const pie = yNorte + (j + 1) * trozo;
      tramos.push({
        ...m,
        que: 'tramo',
        x: k.a[0],
        y: pie,
        alto: Math.min(
          ALTO_DEL_TRAMO_NORTE_SUR_DEL_RECINTO,
          (trozo + 2 * SOLAPE_DEL_TRAMO) / FONDO_DEL_ADARVE,
        ),
        clave: pie - 0.005,
        cara: k.cara,
      });
    }
  }

  // Las casas, apiñadas: por filas, de oeste a este.
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
        if (tapaLaPlazaMayor(contorno, c) || !e.entraLaCasa(c)) continue;
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
 * en casillas: `PIES.heroe` (`render/mapa.ts`) menos media casilla. Es el
 * centro de la plaza mayor.
 */
export const PIE_EN_LA_PLAZA = 0.3;

/**
 * El radio de la plaza mayor, en casillas: el claro alrededor de donde pisa
 * quien está en la ciudad (`PIE_EN_LA_PLAZA`), que ninguna casa tapa
 * (`tapaLaPlazaMayor`): el héroe queda sobre la plaza y no sobre los tejados
 * (vuelta 3). Con 0,4 alrededor del centro, la mediana de casas por ciudad de
 * 1-20 bajaba de 15 a 10; con este y calles de 0,3, a 12.
 */
export const PLAZA_MAYOR = 0.3;

/** El centro de la plaza mayor del recinto de `c`: donde pisa quien está en la ciudad. */
export const centroDeLaPlazaMayor = (c: Contorno): Par => [
  c.centro[0],
  c.centro[1] + PIE_EN_LA_PLAZA,
];

/**
 * Si la casa `p` tapa la plaza mayor del recinto de `c`: su imagen, de su pie a
 * su alto y de su ancho, toca el círculo de `PLAZA_MAYOR` alrededor de su
 * centro. La imagen y no solo el pie: la casa de delante, con el pie fuera,
 * tapaba el claro con su tejado.
 */
export function tapaLaPlazaMayor(
  c: Contorno,
  p: Pick<PiezaDelRecinto, 'x' | 'y' | 'alto' | 'nw' | 'nh' | 'ax'>,
): boolean {
  const ancho = (p.alto * p.nw) / p.nh;
  const izquierda = p.x - (p.ax * p.alto) / p.nh;
  const [cx, cy] = centroDeLaPlazaMayor(c);
  const dx = Math.max(izquierda - cx, 0, cx - (izquierda + ancho));
  const dy = Math.max(p.y - p.alto - cy, 0, cy - p.y);
  return Math.hypot(dx, dy) < PLAZA_MAYOR;
}

/**
 * Lo que el pie de una casa del recinto queda del eje de la calle de una puerta
 * (`callesDeLasPuertas`): calles de 0,3 de ancho. Con media luz del arco (0,2),
 * las calles hasta la plaza mayor dejaban la mediana de casas por ciudad de
 * 1-20 en 11 (vuelta 3).
 */
export const MEDIA_CALLE = 0.15;

/**
 * La calle de cada puerta: de fuera de su arco a la plaza mayor, por su normal
 * y luego al centro, lo que no lleva casas en el pie (`entraLaCasa`). Las calles
 * se juntan en la plaza: es lo que se ve de la ciudad entre los tejados, y por
 * donde va quien entra (vuelta 3, la plaza mayor con sus calles).
 */
export function callesDeLasPuertas(r: Pick<Recinto, 'contorno' | 'puertas'>): Senda[] {
  return r.contorno.caras
    .filter((k) => r.puertas.includes(k.cara))
    .map((k): Senda => {
      const [nx, ny] = k.normal;
      return [[k.medio[0] + nx * 0.2, k.medio[1] + ny * 0.2], centroDeLaPlazaMayor(r.contorno)];
    });
}

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
