/**
 * La paleta de cada tema, **medida de su lámina** (`assets/art/temas/<tema>.png`,
 * 1315×1196, la partida de la semilla 42644 vestida con el tema): no se inventa
 * un color que la lámina ya dice.
 *
 * Cada ficha medida tiene su muestra: un rectángulo en píxeles de la lámina y qué
 * se saca de él.
 * - `liso`: la mediana de cada canal, sobre una zona sin texto ni adorno (el
 *   pergamino a la derecha de «Dormir», la barra de liderazgo).
 * - `zonas`: el fondo del escenario, sobre varios rectángulos de lo que no es
 *   figura en el margen (el fondo del margen, lo de entre dos figuras y el hueco
 *   entre el marco del mapa y la figura), de área parecida: los píxeles del medio
 *   por luz (del puesto 45 % al 55 %) y de ellos la mediana de cada canal. La
 *   mediana de cada canal por separado, con fondos tan distintos juntos, daba un
 *   color que no está en la lámina (un malva en el imperio, un oliva en los elfos).
 * - `fondo` y `tinta`: sobre un rectángulo con texto, dos grupos por k-medias; el
 *   más cercano a la orilla del rectángulo es el fondo y el otro la letra (contar
 *   píxeles no vale: una letra gruesa en un rectángulo justo ocupa más de la
 *   mitad). De la letra solo cuenta su mitad más alejada del fondo: los bordes
 *   suavizados son mezcla de los dos y aclaraban la tinta oscura del pergamino
 *   hacia el gris.
 *
 * Lo medido no se toca salvo para leerse: si una pareja de `PAREJAS` (tinta
 * sobre fondo) no llega a 4,5 de contraste, se mueve solo la L de OKLab de la
 * tinta, a pasos de 0,005, hasta que llega, y se dice cuánto (`ajustes`). Las
 * cifras de `temas.css` son estas (lo vigila `test/paleta-de-las-laminas.test.ts`,
 * a ΔE OKLab ≤ 0,03): si se cambia una muestra, se corre esto y se copian.
 *
 *     npx tsx tools/taller/temas/paleta.ts [tema] [--muestras carpeta] [--crudo]
 *
 * `--muestras` escribe, por tema, una hoja con cada rectángulo recortado y el
 * color que sale de él al lado: así se ve si la muestra cae donde debe.
 * `--crudo` dice lo medido sin mover ninguna tinta.
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { esTema, TEMAS, type Tema } from '../../../src/client/temas.js';
import { conComa } from '../../../src/core/types.js';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type Muestra =
  | {
      readonly que: 'liso' | 'fondo' | 'tinta';
      readonly en: Rect;
      /** Qué es en la lámina, para quien la revise. */
      readonly donde: string;
    }
  | { readonly que: 'zonas'; readonly en: readonly Rect[]; readonly donde: string };

/** Los rectángulos de una muestra: uno, o los de sus zonas. */
const rectsDe = (m: Muestra): readonly Rect[] => (m.que === 'zonas' ? m.en : [m.en]);

/**
 * Las fichas que se miden en todas las láminas. Las demás de `temas.css` se
 * derivan de estas con `var()` o `rgb(from …)`, o son de forma.
 */
export const FICHAS_MEDIDAS = [
  '--bg',
  '--panel',
  '--ink',
  '--titulo',
  '--gold',
  '--marco',
  '--brass',
  '--boton',
  '--boton-tinta',
  '--boton-primario',
  '--boton-primario-tinta',
  '--barra',
  '--fondo-estado',
  '--tinta-estado',
  '--lateral',
  '--lateral-alt',
  '--lateral-alt-tinta',
  '--lateral-tinta',
  '--lateral-titulo',
  '--lateral-rotulo',
  '--fondo-escenario',
] as const;

/** Las que solo dice alguna lámina: el día en cartela (templarios). */
export const FICHAS_DE_ALGUNAS = ['--dia-fondo', '--dia-tinta'] as const;

export type FichaMedida = (typeof FICHAS_MEDIDAS)[number] | (typeof FICHAS_DE_ALGUNAS)[number];

type Muestras = Readonly<
  Record<(typeof FICHAS_MEDIDAS)[number], Muestra> &
    Partial<Record<(typeof FICHAS_DE_ALGUNAS)[number], Muestra>>
>;

/** Una muestra de su clase: `liso(x, y, w, h, dónde)`. */
const muestra =
  (que: 'liso' | 'fondo' | 'tinta') =>
  (x: number, y: number, w: number, h: number, donde: string): Muestra => ({
    que,
    en: { x, y, w, h },
    donde,
  });
const liso = muestra('liso');
const tinta = muestra('tinta');

/**
 * El fondo del escenario (el hueco alrededor del mapa y del panel,
 * `--fondo-escenario`): tres zonas del margen izquierdo de la lámina, de área
 * parecida para que ninguna mande por tamaño, dichas en este orden: el fondo del
 * margen, lo de entre dos figuras de la lámina y el hueco entre la figura y el
 * marco del mapa. La interfaz no lleva figuras en los márgenes (se quitaron el
 * 18-10-2026), pero lo que hay detrás de ellas en la lámina sigue siendo el color
 * de lo que rodea su mapa. Lo que lleva el margen de la lámina en esas zonas, no el material del
 * marco (`--marco`), que solo es la moldura (QA de 13-10-2026, H1: con el
 * material, el escenario del imperio salía beis sobre una lámina casi negra).
 */
function fondoDelEscenario(
  [margen, dondeMargen]: readonly [readonly [number, number, number, number], string],
  [entre, dondeEntre]: readonly [readonly [number, number, number, number], string],
  [hueco, dondeHueco]: readonly [readonly [number, number, number, number], string],
): Muestra {
  const rect = ([x, y, w, h]: readonly [number, number, number, number]): Rect => ({ x, y, w, h });
  return {
    que: 'zonas',
    en: [rect(margen), rect(entre), rect(hueco)],
    donde: `el fondo del margen (${dondeMargen}), entre las figuras (${dondeEntre}) y el hueco hasta el marco (${dondeHueco})`,
  };
}

/**
 * El fondo y la letra de un mismo rectángulo de texto (un botón, una barra): dos
 * muestras sobre el mismo trozo, cada una con su ficha y su «dónde».
 */
function par<F extends FichaMedida, T extends FichaMedida>(
  [x, y, w, h]: readonly [number, number, number, number],
  [fichaFondo, dondeFondo]: readonly [F, string],
  [fichaTinta, dondeTinta]: readonly [T, string],
): Record<F | T, Muestra> {
  return {
    [fichaFondo]: muestra('fondo')(x, y, w, h, dondeFondo),
    [fichaTinta]: muestra('tinta')(x, y, w, h, dondeTinta),
  } as Record<F | T, Muestra>;
}

/**
 * Dónde se mide cada ficha en cada lámina (13-10-2026, rectángulos leídos sobre
 * recortes con rejilla). Las láminas son la misma pantalla, pero cada tema la
 * viste con otro marco y los textos no caen en el mismo píxel.
 */
export const MUESTRAS: Readonly<Record<Tema, Muestras>> = {
  templarios: {
    '--bg': liso(872, 700, 10, 150, 'la hendidura oscura entre el mapa y la columna de piedra'),
    ...par(
      [103, 12, 165, 22],
      ['--panel', 'la barra de arriba, tras «HEROES OF SILENCE»'],
      ['--gold', '«HEROES OF SILENCE»'],
    ),
    '--ink': tinta(843, 11, 46, 22, '«8000», el oro de la barra'),
    '--titulo': tinta(310, 70, 86, 20, 'el oro de «IN HOC» sobre la cinta roja'),
    '--marco': liso(150, 60, 80, 30, 'la piedra labrada sobre el mapa'),
    '--brass': tinta(240, 58, 50, 34, 'la voluta dorada junto a la cinta'),
    ...par([1004, 408, 78, 26], ['--boton', '«Dormir»'], ['--boton-tinta', 'la letra de «Dormir»']),
    ...par(
      [1114, 1140, 170, 38],
      ['--boton-primario', '«Fin de turno»'],
      ['--boton-primario-tinta', 'la letra de «Fin de turno»'],
    ),
    '--barra': liso(1055, 451, 80, 5, 'la barra de liderazgo'),
    ...par(
      [120, 1135, 500, 45],
      ['--fondo-estado', 'el pergamino del aviso de abajo'],
      ['--tinta-estado', 'la letra del aviso de abajo'],
    ),
    '--lateral': liso(1105, 418, 70, 16, 'el pergamino del panel, a la derecha de «Dormir»'),
    '--lateral-alt': liso(1100, 628, 130, 14, 'la fila de «Flecha mágica»'),
    '--lateral-alt-tinta': tinta(998, 625, 88, 20, '«Flecha mágica»'),
    '--lateral-tinta': tinta(963, 474, 76, 18, '«Movimiento»'),
    '--lateral-titulo': tinta(1002, 376, 166, 24, '«Aldo de Valdeluz»'),
    '--lateral-rotulo': tinta(990, 598, 80, 14, '«HECHIZOS»'),
    '--fondo-escenario': fondoDelEscenario(
      [[3, 400, 8, 300], 'la piedra del pilar, a la izquierda del estandarte'],
      [[84, 160, 6, 400], 'la piedra oscura entre el caballero, el estandarte y la columna'],
      [[96, 140, 8, 300], 'la hendidura junto al marco del mapa'],
    ),
    ...par(
      [300, 12, 125, 20],
      ['--dia-fondo', 'la cartela de «Día 1 · Semana 1»'],
      ['--dia-tinta', 'la letra de «Día 1 · Semana 1»'],
    ),
  },
  'no-muertos': {
    '--bg': liso(985, 700, 8, 100, 'el hueco negro entre el marco del mapa y el panel'),
    ...par(
      [135, 36, 163, 22],
      ['--panel', 'la barra de arriba, tras «HEROES OF SILENCE»'],
      ['--gold', '«HEROES OF SILENCE»'],
    ),
    '--ink': tinta(1110, 38, 85, 20, '«semilla 42644»'),
    '--titulo': tinta(333, 38, 105, 20, '«Día 1 · Semana 1»'),
    '--marco': liso(955, 700, 20, 100, 'el hierro del marco del mapa'),
    '--brass': tinta(946, 700, 30, 100, 'la plata de las tracerías del marco'),
    ...par([1005, 428, 58, 28], ['--boton', '«Dormir»'], ['--boton-tinta', 'la letra de «Dormir»']),
    ...par(
      [1168, 1145, 120, 36],
      ['--boton-primario', '«Fin de turno»'],
      ['--boton-primario-tinta', 'la letra de «Fin de turno»'],
    ),
    '--barra': liso(1008, 486, 110, 3, 'la barra de liderazgo'),
    ...par(
      [95, 1153, 400, 22],
      ['--fondo-estado', 'la barra de abajo, tras el aviso'],
      ['--tinta-estado', 'la letra del aviso de abajo'],
    ),
    '--lateral': liso(1090, 428, 90, 24, 'el panel, a la derecha de «Dormir»'),
    '--lateral-alt': liso(1110, 634, 110, 16, 'la fila de «Flecha mágica»'),
    '--lateral-alt-tinta': tinta(1010, 632, 97, 20, '«Flecha mágica»'),
    '--lateral-tinta': tinta(1003, 500, 72, 18, '«Movimiento»'),
    '--lateral-titulo': tinta(1003, 396, 147, 22, '«Aldo de Valdeluz»'),
    '--lateral-rotulo': tinta(1004, 610, 82, 14, '«HECHIZOS»'),
    '--fondo-escenario': fondoDelEscenario(
      [[2, 380, 10, 220], 'el hierro negro bajo la calavera'],
      [[40, 420, 14, 160], 'entre la calavera y la vela, tras las telarañas'],
      [[58, 420, 6, 370], 'el hierro junto al marco del mapa'],
    ),
  },
  imperio: {
    '--bg': liso(922, 700, 7, 100, 'la hendidura oscura entre la columna y el panel'),
    ...par(
      [80, 19, 185, 22],
      ['--panel', 'la barra de arriba, tras «HEROES OF SILENCE»'],
      ['--gold', '«HEROES OF SILENCE»'],
    ),
    '--ink': tinta(1055, 19, 90, 21, '«semilla 42644»'),
    '--titulo': tinta(288, 19, 113, 21, '«Día 1 · Semana 1»'),
    '--marco': liso(893, 700, 20, 120, 'el mármol de la columna'),
    '--brass': liso(866, 700, 6, 100, 'el filo dorado del marco del mapa'),
    ...par([1021, 451, 73, 29], ['--boton', '«Dormir»'], ['--boton-tinta', 'la letra de «Dormir»']),
    ...par(
      [1155, 1146, 120, 32],
      ['--boton-primario', '«Fin de turno»'],
      ['--boton-primario-tinta', 'la letra de «Fin de turno»'],
    ),
    '--barra': liso(1030, 500, 80, 5, 'la barra de liderazgo'),
    ...par(
      [72, 1157, 400, 22],
      ['--fondo-estado', 'la barra de abajo, tras el aviso'],
      ['--tinta-estado', 'la letra del aviso de abajo'],
    ),
    '--lateral': liso(1105, 452, 90, 24, 'el mármol oscuro del panel, a la derecha de «Dormir»'),
    '--lateral-alt': liso(1110, 668, 120, 18, 'la fila de «Flecha mágica»'),
    '--lateral-alt-tinta': tinta(999, 667, 88, 20, '«Flecha mágica»'),
    '--lateral-tinta': tinta(953, 523, 75, 18, '«Movimiento»'),
    '--lateral-titulo': tinta(1019, 418, 155, 24, '«Aldo de Valdeluz»'),
    '--lateral-rotulo': tinta(1086, 640, 70, 14, '«HECHIZOS»'),
    '--fondo-escenario': fondoDelEscenario(
      [[2, 130, 8, 300], 'el mármol oscuro tras la columna'],
      [[18, 400, 36, 67], 'la columna, entre la colgadura y la antorcha'],
      [[60, 600, 8, 300], 'la sombra entre la columna y el marco'],
    ),
  },
  elfos: {
    '--bg': liso(962, 620, 3, 60, 'la sombra entre el mapa y el marco de plata'),
    ...par(
      [74, 13, 195, 22],
      ['--panel', 'la barra de arriba, tras «HEROES OF SILENCE»'],
      ['--gold', '«HEROES OF SILENCE»'],
    ),
    '--ink': tinta(1163, 14, 93, 21, '«semilla 42644»'),
    '--titulo': tinta(288, 14, 108, 21, '«Día 1 · Semana 1»'),
    '--marco': liso(968, 620, 6, 60, 'el marfil del marco del mapa'),
    '--brass': liso(970, 640, 4, 40, 'el filo de plata del marco del mapa'),
    ...par([1018, 422, 82, 27], ['--boton', '«Dormir»'], ['--boton-tinta', 'la letra de «Dormir»']),
    ...par(
      [1182, 1156, 100, 28],
      ['--boton-primario', '«Fin de turno»'],
      ['--boton-primario-tinta', 'la letra de «Fin de turno»'],
    ),
    '--barra': liso(1020, 485, 140, 5, 'la barra de liderazgo'),
    ...par(
      [75, 1157, 400, 22],
      ['--fondo-estado', 'la barra de abajo, tras el aviso'],
      ['--tinta-estado', 'la letra del aviso de abajo'],
    ),
    '--lateral': liso(1120, 425, 80, 24, 'el pergamino del panel, a la derecha de «Dormir»'),
    '--lateral-alt': liso(1150, 652, 90, 14, 'la fila de «Flecha mágica»'),
    '--lateral-alt-tinta': tinta(1056, 650, 80, 20, '«Flecha mágica»'),
    '--lateral-tinta': tinta(1016, 499, 76, 18, '«Movimiento»'),
    '--lateral-titulo': tinta(1048, 381, 168, 24, '«Aldo de Valdeluz»'),
    '--lateral-rotulo': tinta(1041, 623, 78, 14, '«HECHIZOS»'),
    '--fondo-escenario': fondoDelEscenario(
      [[50, 240, 6, 60], 'la plata del borde, sin hiedra'],
      [[14, 260, 6, 40], 'la plata de la columna, entre dos hojas'],
      [[67, 100, 6, 60], 'la sombra entre la columna y el marco'],
    ),
  },
  orkos: {
    '--bg': liso(959, 610, 3, 80, 'la sombra entre el hierro del mapa y la columna de hueso'),
    ...par(
      [226, 26, 132, 21],
      ['--panel', 'la cartela oscura de «Día 1 · Semana 1»'],
      ['--titulo', '«Día 1 · Semana 1»'],
    ),
    '--gold': tinta(78, 12, 100, 48, 'el rótulo rojo «HEROES SILENCE»'),
    '--ink': tinta(1093, 26, 100, 20, '«semilla 42644»'),
    '--marco': liso(280, 84, 30, 16, 'la plancha de hierro remachada sobre el mapa'),
    '--brass': liso(398, 85, 30, 3, 'el colmillo de hueso sobre el mapa'),
    ...par([1016, 424, 82, 29], ['--boton', '«Dormir»'], ['--boton-tinta', 'la letra de «Dormir»']),
    ...par(
      [1165, 1143, 130, 38],
      ['--boton-primario', '«Fin de turno»'],
      ['--boton-primario-tinta', 'la letra de «Fin de turno»'],
    ),
    '--barra': liso(1018, 487, 120, 4, 'la barra de liderazgo'),
    ...par(
      [78, 1155, 400, 22],
      ['--fondo-estado', 'la barra de abajo, tras el aviso'],
      ['--tinta-estado', 'la letra del aviso de abajo'],
    ),
    '--lateral': liso(1110, 424, 90, 26, 'el panel, a la derecha de «Dormir»'),
    '--lateral-alt': liso(1120, 645, 110, 18, 'la fila de «Flecha mágica»'),
    '--lateral-alt-tinta': tinta(1025, 647, 90, 20, '«Flecha mágica»'),
    '--lateral-tinta': tinta(1013, 500, 77, 18, '«Movimiento»'),
    '--lateral-titulo': tinta(1011, 386, 182, 25, '«Aldo de Valdeluz»'),
    '--lateral-rotulo': tinta(1023, 620, 77, 15, '«HECHIZOS»'),
    '--fondo-escenario': fondoDelEscenario(
      [[2, 380, 10, 220], 'el hierro bajo el estandarte'],
      [[40, 540, 14, 160], 'el hierro entre el colmillo y el asta'],
      [[60, 420, 8, 280], 'el hierro remachado junto al marco'],
    ),
  },
};

/**
 * Tinta sobre fondo que tiene que leerse (WCAG AA, 4,5): las de la barra y los
 * botones, las del panel lateral (el pergamino de templarios y elfos lleva tinta
 * oscura) y la del día en cartela. Las lee también `test/temas.test.ts`, sobre
 * las fichas resueltas de `temas.css`.
 */
export const PAREJAS: readonly (readonly [string, string])[] = [
  ['--ink', '--panel'],
  ['--titulo', '--panel'],
  ['--gold', '--panel'],
  ['--boton-tinta', '--boton'],
  ['--boton-primario-tinta', '--boton-primario'],
  ['--tinta-estado', '--fondo-estado'],
  ['--lateral-tinta', '--lateral'],
  ['--lateral-titulo', '--lateral'],
  ['--lateral-rotulo', '--lateral'],
  ['--lateral-acento', '--lateral'],
  ['--lateral-peligro', '--lateral'],
  ['--lateral-alt-tinta', '--lateral-alt'],
  ['--dia-tinta', '--dia-fondo'],
  ['--cartela-tinta', '--cartela-fondo'],
];

// ---------------------------------------------------------------------------
// Color: sRGB de 8 bits, OKLab y contraste WCAG.

export type Rgb = readonly [number, number, number];

export function hex(c: Rgb): string {
  return `#${c
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export function deHex(color: string): Rgb {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (m === null) throw new Error(`"${color}" no es un color opaco #rgb o #rrggbb`);
  const h =
    (m[1] as string).length === 3
      ? [...(m[1] as string)].map((c) => c + c).join('')
      : (m[1] as string);
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as unknown as Rgb;
}

const lineal = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const gamma = (c: number): number =>
  255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function aOklab(c: Rgb): [number, number, number] {
  const [r, g, b] = c.map(lineal) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function deOklab([L, a, b]: readonly [number, number, number]): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Distancia en OKLab: 0,02 apenas se ve al lado; 0,1 ya es otro color. */
export function deltaE(x: string, y: string): number {
  const [a, b] = [aOklab(deHex(x)), aOklab(deHex(y))];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Un color con transparencia (`#rrggbbaa`) puesto sobre otro opaco, como lo ve
 * quien mira: la barra de abajo del neutro (`#26362ef5`) deja ver la página.
 * Un color opaco sale tal cual.
 */
export function sobre(color: string, debajo: string): string {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(color);
  if (m === null) return hex(deHex(color));
  const alfa = Number.parseInt(m[2] as string, 16) / 255;
  const [arriba, abajo] = [deHex(`#${m[1]}`), deHex(debajo)];
  return hex(
    [0, 1, 2].map(
      (i) => (arriba[i] as number) * alfa + (abajo[i] as number) * (1 - alfa),
    ) as unknown as Rgb,
  );
}

export function luminancia(c: Rgb): number {
  const [r, g, b] = c.map(lineal) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(x: string, y: string): number {
  const [la, lb] = [luminancia(deHex(x)), luminancia(deHex(y))];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ---------------------------------------------------------------------------
// Medir, sobre el `Buffer` de la lámina y sin un array por píxel: la mediana de
// cada canal por histograma de 256 cubos y la luz de cada píxel calculada una
// sola vez. Con una tupla por píxel, ordenarlos y `luminancia` en cada
// comparación, el test de la paleta tardaba 1,1 s en cada `verify`. Los órdenes
// desempatan por la posición, como el `sort` estable de antes: las cifras son
// las mismas.

/** Los píxeles de un rectángulo de la lámina, en orden de lectura, canal a canal. */
interface Trozo {
  readonly r: Uint8Array;
  readonly g: Uint8Array;
  readonly b: Uint8Array;
}

const pixel = (t: Trozo, i: number): Rgb => [t.r[i] as number, t.g[i] as number, t.b[i] as number];

const dist2 = (p: Rgb, q: Rgb): number =>
  (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;

/**
 * La mediana de cada canal de los píxeles `cuales` del trozo: el de en medio del
 * orden (`⌊n/2⌋`), contado en un histograma de 256 cubos.
 */
function medianaDe(t: Trozo, cuales: ArrayLike<number>): Rgb {
  const mitad = Math.floor(cuales.length / 2);
  return [t.r, t.g, t.b].map((canal) => {
    const cubos = new Uint32Array(256);
    for (let k = 0; k < cuales.length; k++) {
      const v = canal[cuales[k] as number] as number;
      cubos[v] = (cubos[v] as number) + 1;
    }
    let acumulado = 0;
    for (let v = 0; v < 256; v++) {
      acumulado += cubos[v] as number;
      if (acumulado > mitad) return v;
    }
    throw new Error('una mediana sin píxeles');
  }) as unknown as Rgb;
}

/** `0, 1, …, n − 1`: todos los píxeles de un trozo. */
function todos(n: number): Uint32Array {
  const indices = new Uint32Array(n);
  for (let i = 0; i < n; i++) indices[i] = i;
  return indices;
}

/** `lineal` de cada valor de un canal de 8 bits: la misma cuenta, hecha una vez. */
const LINEAL = Float64Array.from({ length: 256 }, (_, v) => lineal(v));

/**
 * El índice del que queda en el puesto `k` (desde 0) al ordenar `valores` de
 * menor a mayor, con los empates por su posición: lo que daba ordenar los
 * píxeles con un `sort` estable, sin ordenarlos (el `sort` de un `Float64Array`
 * sin comparador es nativo; con uno, no).
 */
function puesto(valores: Float64Array, k: number): number {
  const v = valores.slice().sort()[k] as number;
  let rango = 0;
  for (const x of valores) if (x < v) rango++;
  for (let i = 0; i < valores.length; i++) {
    if (valores[i] !== v) continue;
    if (rango === k) return i;
    rango++;
  }
  throw new Error(`no hay puesto ${k} entre ${valores.length}`);
}

/**
 * Los índices de los `cuantos` mayores de `valores`, y entre los empatados en el
 * corte, los primeros: el principio de un `sort` estable de mayor a menor.
 */
function losMayores(valores: Float64Array, cuantos: number): number[] {
  const corte = valores.slice().sort()[valores.length - cuantos] as number;
  const mayores: number[] = [];
  for (let i = 0; i < valores.length; i++) if ((valores[i] as number) > corte) mayores.push(i);
  for (let i = 0; i < valores.length && mayores.length < cuantos; i++)
    if (valores[i] === corte) mayores.push(i);
  return mayores;
}

/**
 * Dos grupos por k-medias, empezando por los píxeles de los percentiles 5 y 95 de
 * luminancia (un punto suelto de brillo no hace un grupo). El fondo es el grupo
 * más cercano al borde del rectángulo, que en una muestra de texto es lo de
 * alrededor de la letra: contar píxeles no vale, una letra gruesa en un
 * rectángulo justo ocupa más de la mitad.
 */
function dosGrupos(t: Trozo, borde: Rgb): { fondo: number[]; letra: number[]; centroFondo: Rgb } {
  const n = t.r.length;
  const { r, g, b: az } = t;
  // `luminancia`, con su misma cuenta y en su mismo orden, de la tabla.
  const luz = new Float64Array(n);
  for (let i = 0; i < n; i++)
    luz[i] =
      0.2126 * (LINEAL[r[i] as number] as number) +
      0.7152 * (LINEAL[g[i] as number] as number) +
      0.0722 * (LINEAL[az[i] as number] as number);
  let a = pixel(t, puesto(luz, Math.floor(n * 0.05)));
  let b = pixel(t, puesto(luz, Math.floor(n * 0.95)));
  // De qué grupo es cada píxel (1, el de `a`), y lo que suman, en orden de lectura.
  const deA = new Uint8Array(n);
  let enA = 0;
  for (let vuelta = 0; vuelta < 12; vuelta++) {
    const [a0, a1, a2] = a;
    const [b0, b1, b2] = b;
    // Lo que suman los de cada grupo: enteros, así que el orden no cambia nada.
    let [sa0, sa1, sa2, sb0, sb1, sb2] = [0, 0, 0, 0, 0, 0];
    enA = 0;
    for (let i = 0; i < n; i++) {
      const p0 = r[i] as number;
      const p1 = g[i] as number;
      const p2 = az[i] as number;
      // `dist2(p, a) <= dist2(p, b)`, sin una tupla por píxel.
      if (
        (p0 - a0) ** 2 + (p1 - a1) ** 2 + (p2 - a2) ** 2 <=
        (p0 - b0) ** 2 + (p1 - b1) ** 2 + (p2 - b2) ** 2
      ) {
        deA[i] = 1;
        enA++;
        sa0 += p0;
        sa1 += p1;
        sa2 += p2;
      } else {
        deA[i] = 0;
        sb0 += p0;
        sb1 += p1;
        sb2 += p2;
      }
    }
    if (enA === 0 || enA === n) break;
    a = [sa0 / enA, sa1 / enA, sa2 / enA];
    b = [sb0 / (n - enA), sb1 / (n - enA), sb2 / (n - enA)];
  }
  if (enA === 0 || enA === n)
    throw new Error('la muestra es de un solo color: no hay letra que separar del fondo');
  const ga: number[] = [];
  const gb: number[] = [];
  for (let i = 0; i < n; i++) (deA[i] === 1 ? ga : gb).push(i);
  return dist2(a, borde) <= dist2(b, borde)
    ? { fondo: ga, letra: gb, centroFondo: a }
    : { fondo: gb, letra: ga, centroFondo: b };
}

const LAMINAS = resolve(import.meta.dirname, '../../../assets/art/temas');

/** Los píxeles RGB de la lámina de un tema (sin alfa). */
async function pixeles(tema: Tema): Promise<{ datos: Buffer; ancho: number; alto: number }> {
  const { data, info } = await sharp(join(LAMINAS, `${tema}.png`))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { datos: data, ancho: info.width, alto: info.height };
}

function leerMuestra(
  img: { datos: Buffer; ancho: number; alto: number },
  m: Muestra,
  quien: string,
): Rgb {
  const rects = rectsDe(m);
  for (const { x, y, w, h } of rects)
    if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > img.ancho || y + h > img.alto)
      throw new Error(`la muestra de ${quien} se sale de la lámina (${img.ancho}×${img.alto})`);
  // Los píxeles de todos sus rectángulos, uno detrás de otro.
  const n = rects.reduce((suma, { w, h }) => suma + w * h, 0);
  const t: Trozo = { r: new Uint8Array(n), g: new Uint8Array(n), b: new Uint8Array(n) };
  const orilla: number[] = [];
  let p = 0;
  for (const { x, y, w, h } of rects)
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++, p++) {
        const k = ((y + j) * img.ancho + x + i) * 3;
        t.r[p] = img.datos[k] as number;
        t.g[p] = img.datos[k + 1] as number;
        t.b[p] = img.datos[k + 2] as number;
        if (j === 0 || j === h - 1 || i === 0 || i === w - 1) orilla.push(p);
      }
  if (m.que === 'liso') return medianaDe(t, todos(n));
  if (m.que === 'zonas') return medianaDe(t, delMedioPorLuz(t));
  const { fondo, letra, centroFondo } = dosGrupos(t, medianaDe(t, orilla));
  if (m.que === 'fondo') return medianaDe(t, fondo);
  const lejos = Float64Array.from(letra, (i) => dist2(pixel(t, i), centroFondo));
  const mitad = losMayores(lejos, Math.max(1, Math.ceil(letra.length / 2)));
  return medianaDe(
    t,
    mitad.map((k) => letra[k] as number),
  );
}

/**
 * Los píxeles del medio por luz: del puesto 45 % al 55 % (con los que empatan en
 * las puntas). Su mediana por canal es un color de la lámina con la luz mediana
 * de las zonas, que es lo que se compara con la captura.
 */
function delMedioPorLuz(t: Trozo): number[] {
  const n = t.r.length;
  const luz = new Float64Array(n);
  for (let i = 0; i < n; i++)
    luz[i] =
      0.2126 * (LINEAL[t.r[i] as number] as number) +
      0.7152 * (LINEAL[t.g[i] as number] as number) +
      0.0722 * (LINEAL[t.b[i] as number] as number);
  const orden = luz.slice().sort();
  const desde = orden[Math.floor(n * 0.45)] as number;
  const hasta = orden[Math.max(0, Math.ceil(n * 0.55) - 1)] as number;
  const medio: number[] = [];
  for (let i = 0; i < n; i++)
    if ((luz[i] as number) >= desde && (luz[i] as number) <= hasta) medio.push(i);
  return medio;
}

export interface Paleta {
  readonly fichas: Readonly<Partial<Record<FichaMedida, string>>>;
  /** Las tintas movidas para leerse: «--x: #a → #b (L 0,52 → 0,47), sobre --y 4,50». */
  readonly ajustes: readonly string[];
}

/** Mueve la L de OKLab de `tinta`, alejándola de `fondo`, hasta 4,5 de contraste. */
function hastaLeerse(tinta: string, fondo: string, quien: string): string {
  const lab = aOklab(deHex(tinta));
  const haciaArriba = luminancia(deHex(tinta)) >= luminancia(deHex(fondo));
  let actual = tinta;
  for (let paso = 0; contraste(actual, fondo) < 4.5; paso++) {
    if (paso > 200) throw new Error(`${quien}: ${tinta} no se lee sobre ${fondo} ni moviendo su L`);
    lab[0] += haciaArriba ? 0.005 : -0.005;
    actual = hex(deOklab(lab));
  }
  return actual;
}

/** La paleta de un tema: lo medido en su lámina, con las tintas que no se leían movidas. */
export async function medirPaleta(tema: Tema, ajustar = true): Promise<Paleta> {
  const img = await pixeles(tema);
  const fichas: Partial<Record<FichaMedida, string>> = {};
  for (const [ficha, m] of Object.entries(MUESTRAS[tema]) as [FichaMedida, Muestra][]) {
    fichas[ficha] = hex(leerMuestra(img, m, `${tema} ${ficha}`));
  }
  const ajustes: string[] = [];
  for (const [t, f] of ajustar ? PAREJAS : []) {
    const tintaMedida = fichas[t as FichaMedida];
    const fondoMedido = fichas[f as FichaMedida];
    if (tintaMedida === undefined || fondoMedido === undefined) continue;
    if (contraste(tintaMedida, fondoMedido) >= 4.5) continue;
    const movida = hastaLeerse(tintaMedida, fondoMedido, `${tema} ${t} sobre ${f}`);
    const [l0, l1] = [aOklab(deHex(tintaMedida))[0], aOklab(deHex(movida))[0]];
    ajustes.push(
      `${t}: ${tintaMedida} → ${movida} (L ${conComa(l0, 2)} → ${conComa(l1, 2)}), sobre ${f} ${conComa(contraste(movida, fondoMedido), 2)}`,
    );
    fichas[t as FichaMedida] = movida;
  }
  return { fichas, ajustes };
}

/** La hoja de muestras de un tema: cada rectángulo ampliado y el color que sale de él. */
async function hojaDeMuestras(tema: Tema, paleta: Paleta, carpeta: string): Promise<string> {
  const lamina = join(LAMINAS, `${tema}.png`);
  const filas = Object.entries(MUESTRAS[tema]) as [FichaMedida, Muestra][];
  const ALTO = 60;
  const capas: OverlayOptions[] = [];
  for (const [i, [ficha, m]] of filas.entries()) {
    // Las zonas, una al lado de otra en los 280 px de la izquierda.
    const rects = rectsDe(m);
    let izquierda = 4;
    for (const r of rects) {
      const escala = Math.min(4, 280 / rects.length / r.w, (ALTO - 4) / r.h);
      const ancho = Math.max(1, Math.round(r.w * escala));
      const recorte = await sharp(lamina)
        .extract({ left: r.x, top: r.y, width: r.w, height: r.h })
        .resize(ancho, Math.max(1, Math.round(r.h * escala)), { kernel: 'nearest' })
        .png()
        .toBuffer();
      capas.push({ input: recorte, left: izquierda, top: i * ALTO + 2 });
      izquierda += ancho + 6;
    }
    const color = paleta.fichas[ficha] as string;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="${ALTO}"><rect x="0" y="4" width="80" height="${ALTO - 8}" fill="${color}"/><text x="90" y="26" font-size="15" font-family="sans-serif">${ficha} ${color}</text><text x="90" y="46" font-size="12" font-family="sans-serif">${m.que}: ${m.donde.replace(/[<>&]/g, '')}</text></svg>`;
    capas.push({ input: Buffer.from(svg), left: 300, top: i * ALTO });
  }
  mkdirSync(carpeta, { recursive: true });
  const salida = join(carpeta, `paleta-${tema}.png`);
  await sharp({
    create: { width: 720, height: filas.length * ALTO, channels: 3, background: '#ffffff' },
  })
    .composite(capas)
    .png()
    .toFile(salida);
  return salida;
}

const esScript = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
if (esScript) {
  const args = process.argv.slice(2);
  const iMuestras = args.indexOf('--muestras');
  const carpeta = iMuestras === -1 ? null : args[iMuestras + 1];
  if (iMuestras !== -1 && carpeta === undefined)
    throw new Error('--muestras pide la carpeta donde dejar las hojas');
  const crudo = args.includes('--crudo');
  const pedidos = args.filter(
    (a, i) => a !== '--muestras' && a !== '--crudo' && (iMuestras === -1 || i !== iMuestras + 1),
  );
  const temas = pedidos.map((p) => {
    if (!esTema(p)) throw new Error(`"${p}" no es un tema: valen ${TEMAS.join(', ')}`);
    return p;
  });
  for (const tema of temas.length > 0 ? temas : TEMAS) {
    const paleta = await medirPaleta(tema, !crudo);
    console.log(`\n${tema}`);
    for (const [ficha, color] of Object.entries(paleta.fichas))
      console.log(`  ${ficha}: ${color};`);
    for (const a of paleta.ajustes) console.log(`  ajustada ${a}`);
    if (carpeta) console.log(`  hoja: ${await hojaDeMuestras(tema, paleta, carpeta)}`);
  }
}
