/**
 * El octógono de un recinto y sus medidas: el 3 × 3 de la ciudad (`Rect`, el del
 * núcleo), las ocho caras con sus ejes, lo que mide cada pieza a la escala del
 * recinto (las torres, los tramos, las puertas y su arco), el contorno y si un punto
 * cae dentro, las puertas que dice el núcleo (`puertasDelNucleo`), la plaza (lo que
 * no pasa del pie de la muralla) y los módulos de la hoja `recinto`.
 *
 * Es la base de `recinto/`: no importa nada de los demás ficheros de la carpeta.
 */
import {
  LADO_DEL_RECINTO,
  type MapaConCaminos,
  puertasDeLaCiudad,
  type RectDelRecinto,
} from '@core/map/recinto.js';
import { ALTO_DE_TORRE, ALTO_DEL_TRAMO_NORTE_SUR } from '../muralla.js';

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
export const dentroDeLaCara = (c: CaraDelContorno, x: number, y: number) =>
  (c.a[0] - x) * c.normal[0] + (c.a[1] - y) * c.normal[1];

/** El punto del tramo `a → b` más cercano a `p`. */
export function puntoDelTramo(p: Par, a: Par, b: Par): Par {
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

/** La cara `cara` del octógono `c`. */
export const caraDelContorno = (c: Contorno, cara: Cara): CaraDelContorno =>
  c.caras[CARAS.indexOf(cara)] as CaraDelContorno;
