/**
 * La huella de los caminos en el suelo: la senda (`Escena.sendas`) y la trocha
 * de los pasos sin camino (`Escena.trochas`). Las pinta `pintarSuelo` en su
 * capa 3, encima del arcén y debajo del agua.
 *
 * La senda era un trazo de pluma —tres `stroke` de 0,2, 0,12 y 0,05 casillas en
 * colores fijos— que no se parecía al camino de HoMM2: una banda de tierra de
 * un tercio de casilla, con textura y el borde roto. Y la rampa de cada bajada,
 * ancha y de tierra clara con chinas, era otro camino (#191). Ahora es tierra:
 * la textura `suelos/dirt.webp` aclarada hasta la de las rampas, que deja ver
 * un poco del suelo de debajo para casar con él, y un borde que varía con un
 * ruido de la semilla.
 *
 * El ancho variable se pinta como una cinta de ancho variable alrededor del
 * trazo (`trazarCinta`), todas las líneas en UN solo camino del lienzo: un
 * `fill` con la regla de no-cero pinta cada píxel una vez, así que la orla
 * translúcida no se oscurece donde dos sendas se juntan.
 */
import type { Suelo } from '@core/map/terrain.js';
import type { Escena } from './colocar.js';
import { ANCHO_DE_TROCHA } from './nodos.js';
import type { Imagen, Lienzo } from './pintar.js';
import { ANCHO_DE_SENDA, IRREGULARIDAD_DE_SENDA, type Senda } from './sendas.js';

type Contexto = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** La textura de la huella: la tierra del suelo `dirt`, que el suelo ya carga. */
export const TEXTURA_DE_LA_HUELLA = 'suelos/dirt.webp';

/** Cuántas casillas cubre una vuelta de la textura: más fina que en el suelo (4), como las chinas de la rampa. */
const CASILLAS_POR_VUELTA = 1.5;

/**
 * La tierra de la huella, de la textura `dirt` (media 82,67,49) a la de las
 * rampas de las bajadas (el centro de `bajadas-*-1/s.webp`, 139-172 de rojo,
 * medido el 08-10-2026): sin esto, el camino cambiaba de color en cada rampa.
 */
const ENTONADO_DE_LA_HUELLA = 'brightness(1.75) saturate(0.95)';
/** El color de la huella sin la textura. */
const COLOR_DE_LA_HUELLA = '#9d8160';

/**
 * Lo opaca que es la huella: por lo que deja ver, toma el color y el grano del
 * suelo de debajo (y del arcén, que lleva su pigmento), y el camino casa con él
 * en la hierba, la nieve o la lava. Probado con el pigmento del suelo encima,
 * recortado a la huella: lo mismo a ojo y 140 ms más a 120 px.
 */
const ALFA_DE_LA_HUELLA = 0.82;

/**
 * Lo que se oscurece la huella en los suelos donde, con el alfa solo, el camino
 * claro se salía del cuadro: en la lava, junto a las rampas de basalto, y en la
 * nieve. Va encima, solo donde la senda pisa ese suelo (la casilla del centro
 * de cada disco), y lo que no está aquí no se tiñe.
 */
const TINTE_POR_SUELO: Readonly<Partial<Record<Suelo, string>>> = {
  lava: 'rgba(60,22,12,0.34)',
  snow: 'rgba(45,45,58,0.2)',
  swamp: 'rgba(25,35,25,0.22)',
};

/**
 * La orla de la senda: dos franjas más oscuras por fuera, la de fuera más
 * ancha y más tenue, que hacen de borde difuminado sin desenfocar nada.
 */
const ORLAS: readonly (readonly [number, string])[] = [
  [0.06, 'rgba(38,27,17,0.16)'],
  [0.03, 'rgba(38,27,17,0.3)'],
];

/** El lomo de la senda: una franja más clara por el medio, en fracción de la media anchura. */
const LOMO = 0.4;
const COLOR_DEL_LOMO = 'rgba(232,208,165,0.13)';

/**
 * La trocha: más estrecha que la senda, sin orla, translúcida y con el borde
 * más roto. Se afina en las puntas, donde se pierde entre la hierba.
 */
const ALFA_DE_LA_TROCHA = 0.62;
const IRREGULARIDAD_DE_TROCHA = { lenta: 0.25, rapida: 0.3 } as const;
/** Lo que tarda la trocha en tener su ancho desde cada punta, en casillas. */
const PUNTA_DE_TROCHA = 0.6;

/** Cada cuánto va un disco a lo largo del trazo, en casillas. */
const PASO = 0.04;

/** Un disco de la huella: centro y radio, en casillas. */
type Disco = readonly [number, number, number];

/**
 * Un ruido suave de una dimensión en [-1, 1]: valores al azar en los enteros,
 * unidos con `smoothstep`. Sin estado: lo mismo en el Worker y en este hilo.
 */
function ruido(semilla: number): (s: number) => number {
  const valor = (k: number) => {
    let t = (Math.imul(semilla, 0x9e3779b1) + Math.imul(k, 0x85ebca6b)) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
  return (s) => {
    const k = Math.floor(s);
    const f = s - k;
    const u = f * f * (3 - 2 * f);
    return valor(k) * (1 - u) + valor(k + 1) * u;
  };
}

/**
 * Los discos de unas líneas, línea a línea: uno cada `PASO`, de radio
 * `semiancho` movido por dos ruidos (`lenta` cada ~1,5 casillas, `rapida` cada
 * ~0,15) y multiplicado por `punta(s, largo)`, que afina los extremos si hace falta.
 */
export function discosDe(
  lineas: readonly Senda[],
  semiancho: number,
  irregular: { readonly lenta: number; readonly rapida: number },
  semilla: number,
  punta: (s: number, largo: number) => number = () => 1,
): Disco[][] {
  return lineas.flatMap((l, n) => {
    const [p0] = l;
    if (p0 === undefined) return [];
    const lento = ruido(semilla * 131 + n * 2 + 1);
    const rapido = ruido(semilla * 131 + n * 2 + 2);
    let largo = 0;
    for (let i = 1; i < l.length; i++) {
      const [x0, y0] = l[i - 1] as readonly [number, number];
      const [x1, y1] = l[i] as readonly [number, number];
      largo += Math.hypot(x1 - x0, y1 - y0);
    }
    const radio = (s: number) =>
      semiancho *
      (1 + irregular.lenta * lento(s / 1.5) + irregular.rapida * rapido(s / 0.15)) *
      punta(s, largo);
    const fuera: Disco[] = [[p0[0], p0[1], radio(0)]];
    let s = 0;
    let siguiente = PASO;
    for (let i = 1; i < l.length; i++) {
      const [x0, y0] = l[i - 1] as readonly [number, number];
      const [x1, y1] = l[i] as readonly [number, number];
      const tramo = Math.hypot(x1 - x0, y1 - y0);
      while (siguiente < s + tramo) {
        const t = (siguiente - s) / tramo;
        fuera.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radio(siguiente)]);
        siguiente += PASO;
      }
      s += tramo;
    }
    const pn = l.at(-1) as readonly [number, number];
    fuera.push([pn[0], pn[1], radio(largo)]);
    return [fuera];
  });
}

/** Uno de cada cuántos discos va también entero, además de la cinta: tapa los pliegues de una curva cerrada. */
const DISCO_CADA = 5;

/**
 * Los discos de cada línea como UN camino del lienzo, con el radio por `r` y
 * sumándole `mas`, a `T` px por casilla: la cinta que los envuelve —por cada
 * disco, un punto a cada lado según la dirección del trazo— y, cada
 * `DISCO_CADA` y en las puntas, el disco entero. Una unión de 6 500 círculos
 * costaba 100 ms por relleno a 120 px (08-10-2026). Todo va en el sentido de
 * `arc`, que con la regla de no-cero suma y no abre huecos donde se solapan.
 */
function trazarCinta(g: Contexto, lineas: readonly Disco[][], T: number, r = 1, mas = 0): void {
  g.beginPath();
  const disco = ([x, y, radio]: Disco) => {
    const R = (radio * r + mas) * T;
    if (R <= 0) return;
    g.moveTo(x * T + R, y * T);
    g.arc(x * T, y * T, R, 0, Math.PI * 2);
  };
  for (const l of lineas) {
    const n = l.length;
    const izquierda: [number, number][] = [];
    const derecha: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const [x, y, radio] = l[i] as Disco;
      const [ax, ay] = l[Math.max(0, i - 1)] as Disco;
      const [bx, by] = l[Math.min(n - 1, i + 1)] as Disco;
      const largo = Math.hypot(bx - ax, by - ay) || 1;
      const R = Math.max(0, radio * r + mas);
      const nx = (-(by - ay) / largo) * R;
      const ny = ((bx - ax) / largo) * R;
      izquierda.push([(x + nx) * T, (y + ny) * T]);
      derecha.push([(x - nx) * T, (y - ny) * T]);
    }
    const contorno = [...izquierda, ...derecha.reverse()];
    // El sentido de la cinta: el de `arc` (área con signo positiva en un lienzo con la y hacia abajo).
    let area = 0;
    for (let i = 0; i < contorno.length; i++) {
      const [x0, y0] = contorno[i] as [number, number];
      const [x1, y1] = contorno[(i + 1) % contorno.length] as [number, number];
      area += x0 * y1 - x1 * y0;
    }
    if (area < 0) contorno.reverse();
    const [primero, ...resto] = contorno;
    if (primero === undefined) continue;
    g.moveTo(primero[0], primero[1]);
    for (const [x, y] of resto) g.lineTo(x, y);
    g.closePath();
    for (let i = 0; i < n; i += DISCO_CADA) disco(l[i] as Disco);
    disco(l[n - 1] as Disco);
  }
}

/**
 * Los trozos de cada línea de discos que pisan un suelo de `TINTE_POR_SUELO`,
 * agrupados por suelo: cada trozo, los discos seguidos cuya casilla es de ese
 * suelo, más el de cada lado para que el tinte no deje una raya sin cubrir.
 */
function trozosPorSuelo(
  lineas: readonly Disco[][],
  e: Pick<Escena, 'suelo' | 'W' | 'H'>,
): Map<Suelo, Disco[][]> {
  const fuera = new Map<Suelo, Disco[][]>();
  const sueloDe = ([x, y]: Disco): Suelo | undefined => {
    const cx = Math.min(e.W - 1, Math.max(0, Math.floor(x)));
    const cy = Math.min(e.H - 1, Math.max(0, Math.floor(y)));
    const s = e.suelo[cy * e.W + cx];
    return s !== undefined && TINTE_POR_SUELO[s] !== undefined ? s : undefined;
  };
  for (const l of lineas) {
    let desde = 0;
    for (let i = 1; i <= l.length; i++) {
      const s = sueloDe(l[desde] as Disco);
      if (i < l.length && sueloDe(l[i] as Disco) === s) continue;
      if (s !== undefined) {
        const trozo = l.slice(Math.max(0, desde - 1), Math.min(l.length, i + 1));
        fuera.set(s, [...(fuera.get(s) ?? []), trozo]);
      }
      desde = i;
    }
  }
  return fuera;
}

/** La textura de la huella ya entonada, a su tamaño: se entona una vez y no en cada `fill`. */
function tierraEntonada(im: Imagen, nuevo: (ancho: number, alto: number) => Lienzo): Lienzo {
  const ancho = 'naturalWidth' in im ? im.naturalWidth : im.width;
  const alto = 'naturalHeight' in im ? im.naturalHeight : im.height;
  const lienzo = nuevo(ancho, alto);
  const g = lienzo.getContext('2d') as Contexto | null;
  if (g === null) throw new Error('el pintor de la escena necesita un contexto 2d');
  g.filter = ENTONADO_DE_LA_HUELLA;
  g.drawImage(im, 0, 0);
  g.filter = 'none';
  return lienzo;
}

/** Pinta en `c` las sendas y las trochas de `e`, a `T` px por casilla. */
export function pintarHuellas(
  c: Contexto,
  e: Pick<Escena, 'sendas' | 'trochas' | 'semilla' | 'suelo' | 'W' | 'H'>,
  T: number,
  tierra: Imagen | undefined,
  nuevo: (ancho: number, alto: number) => Lienzo,
): void {
  const entonada = tierra === undefined ? null : tierraEntonada(tierra, nuevo);
  const patron = entonada === null ? null : c.createPattern(entonada, 'repeat');
  if (patron !== null && entonada !== null)
    patron.setTransform(new DOMMatrix().scale((CASILLAS_POR_VUELTA * T) / entonada.width));
  const tierraDe = patron ?? COLOR_DE_LA_HUELLA;

  c.save();
  const senda = discosDe(e.sendas, ANCHO_DE_SENDA / 2, IRREGULARIDAD_DE_SENDA, e.semilla);
  for (const [mas, color] of ORLAS) {
    trazarCinta(c, senda, T, 1, mas);
    c.fillStyle = color;
    c.fill();
  }
  trazarCinta(c, senda, T);
  c.fillStyle = tierraDe;
  c.globalAlpha = ALFA_DE_LA_HUELLA;
  c.fill();
  c.globalAlpha = 1;
  for (const [suelo, trozos] of trozosPorSuelo(senda, e)) {
    trazarCinta(c, trozos, T);
    c.fillStyle = TINTE_POR_SUELO[suelo] as string;
    c.fill();
  }
  trazarCinta(c, senda, T, LOMO);
  c.fillStyle = COLOR_DEL_LOMO;
  c.fill();

  const trocha = discosDe(
    e.trochas,
    ANCHO_DE_TROCHA / 2,
    IRREGULARIDAD_DE_TROCHA,
    e.semilla + 7,
    (s, largo) => Math.max(0.3, Math.min(1, s / PUNTA_DE_TROCHA, (largo - s) / PUNTA_DE_TROCHA)),
  );
  trazarCinta(c, trocha, T);
  c.fillStyle = tierraDe;
  c.globalAlpha = ALFA_DE_LA_TROCHA;
  c.fill();
  c.restore();
}
