/**
 * Las RAMPAS del relieve (#225, `docs/art/peticiones.md` §35): el camino que baja
 * de frente a la cámara por un borde recto ABRE la pared, en vez de pintarse
 * encima de ella como la bajada de §23.
 *
 * Como en los juegos de estrategia con acantilados (las rampas de StarCraft y de
 * Warcraft III, los tilesets de Slynyrd), la rampa son tres piezas: el CUERPO,
 * la cuesta en el hueco, y un COSTADO a cada lado, donde la cara de la pared deja
 * de ser frontal y baja en diagonal de su alto entero junto al filo a nada al pie
 * de la rampa (el ala), con un hombro de roca entre el ala y la cuesta.
 *
 * **Una imagen, tres piezas.** Las tres se piden en UNA imagen del conjunto
 * sobre esta guía y se cortan por ella (`escribirRampasDerivadas`): pedidas por
 * separado, las juntas entre el costado y el cuerpo no casarían. Los cortes caen
 * en el filo, en `TRAMO_DE_PIEZA_DE_RAMPA` (`celdas.ts`): los costados miden
 * casilla y media porque las paredes S del *dual grid* van de vértice a vértice.
 * Por fuera, cada costado sigue en la frontal de su material (`paredes-*`), que
 * se pinta después y tapa el corte.
 *
 *   pnpm taller encolar --rampas [--solo=rampa-roca-1,rampa-arenisca-1]
 *   pnpm taller derivar-relieve rampa-roca-1
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';
import {
  formaDeHoja,
  PIEZAS_DE_LA_FORMA,
  type PiezaDeRampa,
} from '../../src/client/render/escenario/catalogo.js';
import { TRAMO_DE_PIEZA_DE_RAMPA } from '../../src/client/render/escenario/celdas.js';
import { mascaraDeGuia, registrarPieza } from './derivar.js';
import { ALFA_FIGURA } from './empaquetar.js';
import type { Encargo } from './encargo.js';
import { azarDe, MATERIAL, MESETA, type Niveles } from './laderas.js';
import { ESTILO_DEL_MAPA, REFERENCIA_DE_MAPAS } from './mapa-denso.js';
import {
  ARRIBA,
  DIR_GUIAS,
  FRENTE,
  Guia,
  type Material,
  NIVEL,
  type P2,
  type P3,
  SOMBRA,
} from './paredes-puentes.js';

const RAIZ = resolve(import.meta.dirname, '../..');

/**
 * La geometría de la rampa en el mundo de la guía, en casillas desde el borde
 * oeste del hueco (`x`) y desde el filo (`y`), a alto `z`. Es la transición de
 * muro a cuesta de los acantilados de StarCraft y Warcraft III (*wall-to-slope*,
 * Slynyrd): no hay caras laterales que flanqueen el camino. En cada costado la
 * CARA FRONTAL, la misma que la de la frontal vecina, baja en diagonal: alto
 * entero en el extremo exterior y nada en el borde de la cuesta, al pie; y lo
 * de encima de esa diagonal es la meseta, que baja también hacia la cuesta.
 *
 * - `CRESTA`: lo que la pared asoma por encima del filo, como las frontales;
 * - `ENTERO`: lo que el costado sigue a su alto entero desde su extremo exterior
 *   antes de empezar a bajar;
 * - `ARRIBA_DE_LA_CUESTA` y `PIE`: la cuesta, de lo alto (metida en la meseta) a
 *   lo bajo, un poco por delante del filo; `DERRAME`, el abanico de tierra;
 * - `SOLAPE`: lo que la guía sigue la pared más allá del extremo exterior de
 *   cada costado, que se corta con la pieza (`escribirRampasDerivadas`) y queda
 *   debajo de la pieza vecina: así no se ve la arista del corte.
 */
const CRESTA = 0.4;
const ENTERO = 0.4;
const ARRIBA_DE_LA_CUESTA = -0.55;
const PIE = 0.05;
const DERRAME = 0.28;
export const SOLAPE = 0.15;

const TIERRA = '#a09684';
const ESTRIA = '#867c6c';
const CAMINO = '#d4cfc4';
/** La meseta que baja hacia la cuesta, por encima de la diagonal del costado. */
const MESETA_QUE_BAJA = '#c4c4c4';

/** Dibuja la rampa entera: los dos costados y el cuerpo, de atrás adelante. */
function dibujarRampa(g: Guia, niveles: Niveles): void {
  const H = niveles * NIVEL;
  const [izq] = TRAMO_DE_PIEZA_DE_RAMPA['costado-izq'];
  const [, der] = TRAMO_DE_PIEZA_DE_RAMPA['costado-der'];
  const azar = azarDe(`rampa-${niveles}`);
  const fuera = [izq - SOLAPE - 0.15, der + SOLAPE + 0.15] as const;
  /** Donde cada costado empieza a bajar. */
  const baja = [izq + ENTERO, der - ENTERO] as const;
  // La cresta: lo de encima del filo, a su alto entero, por fuera de la bajada.
  g.poligono(
    [
      [fuera[0], -CRESTA, H],
      [baja[0], -CRESTA, H],
      [baja[0], 0, H],
      [fuera[0], 0, H],
    ],
    ARRIBA,
  );
  g.poligono(
    [
      [baja[1], -CRESTA, H],
      [fuera[1], -CRESTA, H],
      [fuera[1], 0, H],
      [baja[1], 0, H],
    ],
    ARRIBA,
  );
  // La meseta que baja hacia la cuesta: de la cresta al pie del borde de la cuesta.
  g.poligono(
    [
      [baja[0], -CRESTA, H],
      [0, ARRIBA_DE_LA_CUESTA, H],
      [0, PIE, 0],
      [baja[0], 0, H],
    ],
    MESETA_QUE_BAJA,
  );
  g.poligono(
    [
      [1, ARRIBA_DE_LA_CUESTA, H],
      [baja[1], -CRESTA, H],
      [baja[1], 0, H],
      [1, PIE, 0],
    ],
    MESETA_QUE_BAJA,
  );
  // La cara frontal de cada costado: a su alto entero por fuera y bajando en
  // diagonal hasta nada en el borde de la cuesta. Mira a la cámara, como la frontal.
  g.poligono(
    [
      [fuera[0], 0, H],
      [baja[0], 0, H],
      [0, PIE, 0],
      [fuera[0], 0, 0],
    ],
    FRENTE,
  );
  g.poligono(
    [
      [baja[1], 0, H],
      [fuera[1], 0, H],
      [fuera[1], 0, 0],
      [1, PIE, 0],
    ],
    FRENTE,
  );
  // La cuesta, del hueco en la meseta al pie, y el abanico que se derrama.
  const en = (t: number, b: number): P3 => [
    b,
    ARRIBA_DE_LA_CUESTA + (PIE - ARRIBA_DE_LA_CUESTA) * t,
    H * (1 - t),
  ];
  g.poligono(
    [
      en(0, 0),
      en(0, 1),
      en(1, 1),
      [1.05, PIE + DERRAME * 0.6, 0],
      [0.5, PIE + DERRAME, 0],
      [-0.05, PIE + DERRAME * 0.6, 0],
      en(1, 0),
    ],
    TIERRA,
  );
  // Las estrías: regueros de la cuesta, a lo largo de la pendiente.
  for (const b of [0.2, 0.34, 0.66, 0.8]) {
    const w = 0.012 + azar() * 0.01;
    g.poligono(
      [en(0.08, b - w), en(0.08, b + w), en(0.97, b + w * 1.6), en(0.97, b - w * 1.6)],
      ESTRIA,
    );
  }
  // La senda, por el medio de la cuesta.
  g.poligono([en(0, 0.44), en(0, 0.56), en(1, 0.59), en(1, 0.41)], CAMINO);
}

// ------------------------------------------------------------- la muesca

/**
 * La geometría de la rampa de MUESCA (§36), en casillas desde el borde oeste de
 * la casilla baja (`x`) y desde el filo de su fondo (`y = 0`; la línea de delante
 * de la muesca, `y = 1`), a alto `z`. La casilla baja está entre dos altas: a
 * cada lado, una pared de lado (la de la izquierda mira al este, la de la derecha
 * al oeste) que baja de su alto entero junto a la línea de delante a nada arriba,
 * donde la cuesta llega a lo alto (de muro a cuesta, como los costados de la
 * recta, pero de lado). Por delante, cada esquina dobla a media casilla de
 * frontal, la que sigue en `paredes-*`.
 *
 * - `TALUD_DE_MUESCA`: lo que el pie de cada pared de lado entra en la muesca a
 *   su alto entero (la ladera, `TALUD_DE_LADERA`, entra 0,45 y dos se comían la
 *   casilla: `sinBarrancos`);
 * - `ARRIBA_DE_LA_MUESCA`: dónde empieza la cuesta, metida en la meseta de detrás;
 * - `FRONTAL_DE_LA_MUESCA`: la media casilla de frontal de cada esquina, de la
 *   junta S (`TRAMO_DE_PIEZA_DE_RAMPA.muesca`) a la arista.
 */
const TALUD_DE_MUESCA = 0.22;
/** Lo que el filo de cada pared de lado se mete en la meseta de su lado, a su alto entero. */
const MESETA_DE_MUESCA = 0.24;
const ARRIBA_DE_LA_MUESCA = -0.45;
const FRONTAL_DE_LA_MUESCA = 0.5;
const CRESTA_DE_LA_MUESCA = 0.25;
/** El labio de roca a lo largo del filo de cada pared de lado. */
const LABIO_DE_LA_MUESCA = 0.06;

/** Dibuja la rampa de muesca: las dos esquinas, las dos paredes de lado y la cuesta. */
function dibujarMuesca(g: Guia, niveles: Niveles): void {
  const H = niveles * NIVEL;
  const T = TALUD_DE_MUESCA;
  const azar = azarDe(`rampa-muesca-${niveles}`);
  /** El alto de la cuesta a `y`: entero arriba, nada en la línea de delante. */
  const z = (y: number) => H * Math.min(1, Math.max(0, (1 - y) / (1 - ARRIBA_DE_LA_MUESCA)));
  /** El pie de la pared de lado a `y`, del lado `l` (0 el oeste, 1 el este). */
  const pie = (l: 0 | 1, y: number): P3 => {
    const t = (T * (H - z(y))) / H;
    return [l === 0 ? t : 1 - t, y, z(y)];
  };
  const ys = Array.from(
    { length: 9 },
    (_, k) => ARRIBA_DE_LA_MUESCA + ((1 - ARRIBA_DE_LA_MUESCA) * k) / 8,
  );
  const fuera = [-FRONTAL_DE_LA_MUESCA - SOLAPE, 1 + FRONTAL_DE_LA_MUESCA + SOLAPE] as const;
  /**
   * El filo de la pared de lado a `y`: se mete en la meseta de su lado lo que
   * `MESETA_DE_MUESCA` a su alto entero, y nada arriba. Con el filo recto en el
   * borde de la casilla (la segunda guía) la cara no se veía con esta cámara y
   * la muesca seguía siendo una ranura entre dos paredes.
   */
  const filo = (l: 0 | 1, y: number): P3 => {
    const t = (MESETA_DE_MUESCA * (H - z(y))) / H;
    return [l === 0 ? -t : 1 + t, y, H];
  };
  const [W] = filo(0, 1);
  // La cresta de cada frontal, como la de `paredes-*`, y a lo largo del filo de
  // cada pared de lado solo un labio estrecho. Con una franja ancha (la primera
  // guía) el pintor levantó dos torres de roca a los lados; sin labio (la cuarta),
  // rellenó de roca la meseta de los lados y la muesca salía un monte.
  g.poligono(
    [
      [fuera[0], 1 - CRESTA_DE_LA_MUESCA, H],
      [W - LABIO_DE_LA_MUESCA, 1 - CRESTA_DE_LA_MUESCA, H],
      ...[...ys].reverse().map((y): P3 => {
        const [x] = filo(0, y);
        return [x - LABIO_DE_LA_MUESCA, y, H];
      }),
      ...ys.map((y) => filo(0, y)),
      [fuera[0], 1, H],
    ],
    ARRIBA,
  );
  g.poligono(
    [
      ...ys.map((y): P3 => {
        const [x] = filo(1, y);
        return [x + LABIO_DE_LA_MUESCA, y, H];
      }),
      [1 - W + LABIO_DE_LA_MUESCA, 1 - CRESTA_DE_LA_MUESCA, H],
      [fuera[1], 1 - CRESTA_DE_LA_MUESCA, H],
      [fuera[1], 1, H],
      ...[...ys].reverse().map((y) => filo(1, y)),
    ],
    ARRIBA,
  );
  // La frontal de cada esquina: a su alto entero, mira a la cámara.
  g.poligono([[fuera[0], 1, H], filo(0, 1), pie(0, 1), [fuera[0], 1, 0]], FRENTE);
  g.poligono([filo(1, 1), [fuera[1], 1, H], [fuera[1], 1, 0], pie(1, 1)], FRENTE);
  // Las paredes de lado, triángulos: de su filo a su pie, que sube con la cuesta
  // hasta juntarse con él arriba. La del oeste mira al este, en sombra; la del
  // este, a la luz.
  g.poligono([...ys.map((y) => filo(0, y)), ...[...ys].reverse().map((y) => pie(0, y))], SOMBRA);
  g.poligono([...ys.map((y) => pie(1, y)), ...[...ys].reverse().map((y) => filo(1, y))], FRENTE);
  // La cuesta, entre los pies, y el abanico que se derrama por delante.
  g.poligono(
    [
      ...ys.map((y) => pie(0, y)),
      [-0.1, 1 + DERRAME * 0.7, 0],
      [0.5, 1 + DERRAME, 0],
      [1.1, 1 + DERRAME * 0.7, 0],
      ...[...ys].reverse().map((y) => pie(1, y)),
    ],
    TIERRA,
  );
  /** Un punto de la cuesta a la fracción `b` de su ancho (0 el pie del oeste, 1 el del este). */
  const en = (y: number, b: number): P3 => {
    const [x0, , zz] = pie(0, y);
    const [x1] = pie(1, y);
    return [x0 + (x1 - x0) * b, y, zz];
  };
  const y0 = ARRIBA_DE_LA_MUESCA + 0.06;
  const y1 = 0.97;
  for (const b of [0.2, 0.34, 0.66, 0.8]) {
    const w = 0.012 + azar() * 0.01;
    g.poligono([en(y0, b - w), en(y0, b + w), en(y1, b + w * 1.6), en(y1, b - w * 1.6)], ESTRIA);
  }
  g.poligono(
    [en(ARRIBA_DE_LA_MUESCA, 0.42), en(ARRIBA_DE_LA_MUESCA, 0.58), en(1, 0.62), en(1, 0.38)],
    CAMINO,
  );
}

/** Lo que mide el lienzo de la guía de la muesca: casi cuadrada. */
const LIENZO_DE_LA_MUESCA: readonly [number, number] = [1024, 1024];

/** La guía de la rampa de muesca de `niveles`, centrada en su lienzo. */
export function guiaDeMuesca(niveles: Niveles): {
  guia: Guia;
  geometria: GeometriaDeRampa;
  casilla: number;
} {
  const [ancho, alto] = LIENZO_DE_LA_MUESCA;
  const m = new Guia(ancho, alto, 1, 0, 0);
  dibujarMuesca(m, niveles);
  const w = m.caja.x1 - m.caja.x0;
  const h = m.caja.y1 - m.caja.y0;
  const t = Math.floor(Math.min((ancho * LLENO) / w, (alto * LLENO) / h));
  const g = new Guia(
    ancho,
    alto,
    t,
    ancho / 2 - ((m.caja.x0 + m.caja.x1) / 2) * t,
    alto / 2 - ((m.caja.y0 + m.caja.y1) / 2) * t,
  );
  dibujarMuesca(g, niveles);
  const H = niveles * NIVEL;
  const r = (q: P2): P2 => [Math.round(q[0]), Math.round(q[1])];
  // El filo de la pieza: sus dos juntas S, en la línea de delante (y = 1).
  const [a, b] = TRAMO_DE_PIEZA_DE_RAMPA.muesca;
  return {
    guia: g,
    casilla: t,
    geometria: {
      niveles,
      cortes: [r(g.p([a, 1, H])), r(g.p([b, 1, H]))],
      caja: [
        Math.round(g.caja.x0),
        Math.round(g.caja.y0),
        Math.round(g.caja.x1),
        Math.round(g.caja.y1),
      ],
    },
  };
}

/** La geometría que cuenta de la guía, en píxeles de la guía. */
export interface GeometriaDeRampa {
  readonly niveles: Niveles;
  /**
   * El filo en cada corte de `TRAMO_DE_PIEZA_DE_RAMPA`, de oeste a este: en la
   * recta −1,5, 0, 1 y 2,5; en la muesca, sus dos juntas S, −0,5 y 1,5.
   */
  readonly cortes: readonly P2[];
  readonly caja: readonly [number, number, number, number];
}

const LIENZO: readonly [number, number] = [1536, 1024];
/** Lo que ocupa la rampa del lienzo, como mucho en cada eje. */
const LLENO = 0.8;

/** La guía de una rampa de `niveles`, centrada en su lienzo. */
export function guiaDeRampa(niveles: Niveles): {
  guia: Guia;
  geometria: GeometriaDeRampa;
  casilla: number;
} {
  const [ancho, alto] = LIENZO;
  const m = new Guia(ancho, alto, 1, 0, 0);
  dibujarRampa(m, niveles);
  const w = m.caja.x1 - m.caja.x0;
  const h = m.caja.y1 - m.caja.y0;
  const t = Math.floor(Math.min((ancho * LLENO) / w, (alto * LLENO) / h));
  const g = new Guia(
    ancho,
    alto,
    t,
    ancho / 2 - ((m.caja.x0 + m.caja.x1) / 2) * t,
    alto / 2 - ((m.caja.y0 + m.caja.y1) / 2) * t,
  );
  dibujarRampa(g, niveles);
  const H = niveles * NIVEL;
  const r = (q: P2): P2 => [Math.round(q[0]), Math.round(q[1])];
  const xs = [
    TRAMO_DE_PIEZA_DE_RAMPA['costado-izq'][0],
    TRAMO_DE_PIEZA_DE_RAMPA.cuerpo[0],
    TRAMO_DE_PIEZA_DE_RAMPA.cuerpo[1],
    TRAMO_DE_PIEZA_DE_RAMPA['costado-der'][1],
  ];
  return {
    guia: g,
    casilla: t,
    geometria: {
      niveles,
      cortes: xs.map((x) => r(g.p([x, 0, H]))),
      caja: [
        Math.round(g.caja.x0),
        Math.round(g.caja.y0),
        Math.round(g.caja.x1),
        Math.round(g.caja.y1),
      ],
    },
  };
}

// ------------------------------------------------------------- los encargos

/** Las caídas y los materiales del piloto (#225): el resto, cuando el usuario lo vea. */
export const NIVELES_DE_RAMPA: readonly Niveles[] = [1];
export const MATERIALES_DE_RAMPA: readonly Material[] = ['roca', 'arenisca'];

/** La hoja de una rampa: `rampa-roca-1`. */
export const hojaDeRampa = (material: Material, niveles: Niveles) => `rampa-${material}-${niveles}`;

export function encargoDeRampa(material: Material, niveles: Niveles): Encargo {
  const caida = niveles === 1 ? 'UN nivel' : niveles === 2 ? 'DOS niveles' : 'TRES niveles';
  return {
    id: hojaDeRampa(material, niveles),
    tipo: 'imagen',
    descripcion: [
      `Una RAMPA para el mapa de aventura de un juego de estrategia: el borde recto de una meseta de ${MATERIAL[material]} que cae ${caida} hacia la cámara, y en su centro un camino de tierra que BAJA DE FRENTE hacia la cámara por una CUESTA. Es la transición de MURO A CUESTA de los acantilados de StarCraft y Warcraft III (wall-to-slope): el muro no se corta en un desfiladero, sino que a cada lado de la cuesta SE VA HUNDIENDO hasta desaparecer en ella.`,
      'LA PARED ES LA MISMA PARED FRONTAL DE LA IMAGEN 2, con su misma roca, el MISMO COLOR Y LA MISMA LUZ (ni más oscura ni más clara), el mismo TAMAÑO de columnas y bloques, su remate de arriba y su musgo: sigue fuera de la imagen por la izquierda y por la derecha en esas mismas piezas y tiene que casar con ellas sin que se note la junta. Sus dos extremos de fuera están a su alto entero y cortados limpios en vertical, como si continuara.',
      'A CADA LADO DE LA CUESTA, LA CARA FRONTAL DEL MURO (la que mira a la cámara, como en la imagen 2) BAJA EN DIAGONAL: tiene su alto entero en el extremo de fuera y se va haciendo más y más baja hacia el centro hasta quedar en NADA, a ras del suelo, en el borde de la cuesta al pie. Su perfil de arriba es una LÍNEA INCLINADA, como la de la guía: un triángulo o un trapecio de pared, con su cresta de roca y musgo siguiendo esa inclinación. Por encima de esa línea, el suelo de la meseta BAJA TAMBIÉN, en pendiente, hacia la cuesta, y se funde con ella.',
      'NO HAY CARAS LATERALES: nada de paredes verticales que flanqueen el camino ni que miren hacia él, nada de desfiladero, garganta ni corte en la roca. La cuesta y los dos costados son una sola pendiente que se abre de la meseta al llano. Junto a la cuesta la pared NUNCA sigue alta: allí no hay columnas altas, solo la punta baja del triángulo de pared, a ras del suelo, y encima la meseta en pendiente, de hierba y tierra.',
      `La CUESTA es tierra pisada en pendiente, MÁS CLARA QUE LA ROCA, del color de la tierra de la imagen 3: con ESTRÍAS (regueros y surcos a lo largo de la pendiente, piedrecillas arrastradas hacia abajo) y un camino claro y gastado por el medio; arriba se mete en la meseta y abajo se derrama en un abanico sobre el suelo llano. Es un paso natural: sin escalones, sin peldaños, sin barandillas, sin muretes ni bordillos. Al pie de la pared y de la cuesta, una sombra de contacto oscura y estrecha.`,
      `POR ENCIMA DEL FILO, en los extremos, la cresta es la de la imagen 2: las CABEZAS de la misma roca de la pared, con musgo, matas y hierba entre ellas; NUNCA una franja de tierra ni un suelo llano encima de la pared. La meseta (${MESETA[material]}) la pone el juego: por detrás de la cresta, la imagen es transparente. Al PIE de la pared, como en la imagen 2: bloques caídos y derrubio de tamaños distintos, irregular; NUNCA un borde recto ni una línea horizontal limpia, y ninguna piedra suelta separada del resto.`,
      'LA SILUETA ES LA DE LA GUÍA (imagen 4), CALCADA: mismo sitio, mismo alto, mismo ancho, mismas proporciones, sin girar ni torcer nada. En la guía: lo gris medio de abajo a los lados es la CARA FRONTAL, que baja en diagonal hacia el centro; lo gris claro de encima de esa diagonal, la meseta que baja hacia la cuesta; lo más claro de los extremos, la cresta; lo pardo del centro, la cuesta con sus estrías más oscuras y el camino claro.',
      'La luz viene de arriba a la izquierda, la misma que en la imagen 2; las sombras caen hacia la derecha y hacia abajo.',
      ESTILO_DEL_MAPA,
    ].join('\n'),
    referencias: [
      { ruta: REFERENCIA_DE_MAPAS, papel: 'estilo' },
      // La pared con la que casa por los dos lados: la frontal de su material.
      { ruta: `assets/mapa/modulos/paredes-${material}.webp`, papel: 'identidad' },
      // La tierra de la cuesta, la de las bajadas de su material (§23).
      { ruta: `assets/mapa/modulos/bajadas-${material}-${niveles}.webp`, papel: 'material' },
      { ruta: `${DIR_GUIAS}/rampas-${niveles}.png`, papel: 'guia' },
    ],
    salida: `assets/mapa/modulos/${hojaDeRampa(material, niveles)}`,
    fondo: 'transparente',
  };
}

/** La hoja de una rampa de muesca (§36): `rampa-muesca-roca-1`. */
export const hojaDeMuesca = (material: Material, niveles: Niveles) =>
  `rampa-muesca-${material}-${niveles}`;

/** El encargo de la rampa de muesca (§36) de un material y una caída. */
export function encargoDeMuesca(material: Material, niveles: Niveles): Encargo {
  const caida = niveles === 1 ? 'UN nivel' : niveles === 2 ? 'DOS niveles' : 'TRES niveles';
  return {
    id: hojaDeMuesca(material, niveles),
    tipo: 'imagen',
    descripcion: [
      `Una RAMPA EN UNA MUESCA para el mapa de aventura de un juego de estrategia, vista con la cámara del juego (desde el sur, elevada). El borde de una meseta de ${MATERIAL[material].replace('imagen 3', 'imagen 2')} cae ${caida} hacia la cámara, y tiene una MUESCA de una casilla: un entrante estrecho por el que un camino de tierra BAJA DE FRENTE hacia la cámara por una CUESTA. Es la transición de MURO A CUESTA de los acantilados de StarCraft y Warcraft III (wall-to-slope), pero de LADO: la cuesta va metida entre DOS LADERAS, la de la IZQUIERDA mira a la DERECHA (hacia la cuesta) y la de la DERECHA mira a la IZQUIERDA (hacia la cuesta).`,
      'CADA LADERA BAJA HASTA FUNDIRSE CON LA CUESTA: junto a la línea de delante tiene su alto entero, y hacia el fondo se va haciendo más y más baja hasta quedar en NADA arriba, donde la cuesta llega a lo alto de la meseta. Su filo de arriba es una LÍNEA INCLINADA que se abre hacia delante, metiéndose en la meseta, y su pie sube con la cuesta: cada ladera es un TRIÁNGULO de roca en talud, ancho y alto delante y en punta al fondo, como en la guía. La muesca es una V abierta hacia la cámara, NO una ranura de paredes paralelas. Son paredes de la misma roca que las laderas de la imagen 4 (losas y bloques escalonados, derrubio al pie), NUNCA columnas verticales lisas ni un desfiladero de paredes altas en todo su largo.',
      'POR DELANTE, cada ladera dobla una esquina y sigue a cada lado como un trozo de PARED FRONTAL a su alto entero: la misma pared de la imagen 2, con su misma roca, el MISMO COLOR Y LA MISMA LUZ, el mismo TAMAÑO de columnas y bloques, su remate de arriba y su musgo; sigue fuera de la imagen por la izquierda y por la derecha en esas mismas piezas y tiene que casar con ellas sin que se note la junta. Sus dos extremos de fuera están a su alto entero y cortados limpios en vertical, como si continuara.',
      'La CUESTA es tierra pisada en pendiente, MÁS CLARA QUE LA ROCA, del color de la tierra de la imagen 3: con ESTRÍAS (regueros y surcos a lo largo de la pendiente, piedrecillas arrastradas hacia abajo) y un camino claro y gastado por el medio; arriba se mete en la meseta y abajo, entre las dos esquinas, se derrama en un abanico sobre el suelo llano. Es un paso natural: sin escalones, sin peldaños, sin barandillas, sin muretes ni bordillos. Al pie de las paredes, una sombra de contacto oscura y estrecha.',
      `POR ENCIMA DEL FILO: sobre cada trozo de pared frontal, la cresta de la imagen 2 (las CABEZAS de la misma roca, con musgo y matas); a lo largo de cada ladera, SOLO un labio de roca estrecho y roto en el borde de la meseta. A los dos lados de la cuesta NO HAY TORRES, PILARES NI MUROS ALTOS: la meseta (${MESETA[material]}) está a la altura del borde y la pone el juego, así que ahí la imagen es TRANSPARENTE. Al PIE de las paredes: bloques caídos y derrubio de tamaños distintos, irregular; nunca una línea recta limpia, y ninguna piedra suelta separada del resto.`,
      'LA SILUETA ES LA DE LA GUÍA (imagen 5), CALCADA: mismo sitio, mismo alto, mismo ancho, mismas proporciones, sin girar ni torcer nada. En la guía: lo gris medio de abajo a los lados es la PARED FRONTAL de cada esquina; lo gris oscuro de la izquierda, la ladera de la izquierda (en penumbra), y lo gris medio de la derecha junto a la cuesta, la ladera de la derecha (a la luz), las dos en punta hacia arriba; lo más claro, la cresta de las frontales y el labio de las laderas (y fuera de eso, transparente); lo pardo del centro, la cuesta con sus estrías más oscuras y el camino claro, y el abanico de abajo.',
      'La luz viene de arriba a la izquierda, la misma que en la imagen 2: la ladera de la izquierda queda en penumbra y la de la derecha recibe la luz; las sombras caen hacia la derecha y hacia abajo.',
      ESTILO_DEL_MAPA,
    ].join('\n'),
    referencias: [
      { ruta: REFERENCIA_DE_MAPAS, papel: 'estilo' },
      // La pared con la que casa por los dos lados: la frontal de su material.
      { ruta: `assets/mapa/modulos/paredes-${material}.webp`, papel: 'identidad' },
      // La tierra de la cuesta, la de las bajadas de su material (§23).
      { ruta: `assets/mapa/modulos/bajadas-${material}-${niveles}.webp`, papel: 'material' },
      // Las paredes de lado, como las laderas de su material (§20).
      { ruta: `assets/mapa/modulos/laderas-${material}-oeste-${niveles}.webp`, papel: 'material' },
      { ruta: `${DIR_GUIAS}/rampas-muesca-${niveles}.png`, papel: 'guia' },
    ],
    salida: `assets/mapa/modulos/${hojaDeMuesca(material, niveles)}`,
    fondo: 'transparente',
  };
}

export function encargosDeRampas(): Encargo[] {
  return MATERIALES_DE_RAMPA.flatMap((m) =>
    NIVELES_DE_RAMPA.flatMap((n) => [encargoDeRampa(m, n), encargoDeMuesca(m, n)]),
  );
}

/** Escribe la guía de cada caída de rampa y su geometría (`rampas-<niveles>.json`). */
export async function escribirGuiasDeRampas(): Promise<string[]> {
  const escritas: string[] = [];
  for (const n of NIVELES_DE_RAMPA) {
    const { guia, geometria, casilla } = guiaDeRampa(n);
    const nombre = `rampas-${n}`;
    await writeFile(
      join(RAIZ, DIR_GUIAS, `${nombre}.png`),
      await sharp(Buffer.from(guia.svg())).png().toBuffer(),
    );
    await writeFile(
      join(RAIZ, DIR_GUIAS, `${nombre}.json`),
      `${JSON.stringify({ ancho: guia.ancho, alto: guia.alto, casilla, ...geometria }, null, 1)}\n`,
    );
    escritas.push(`${DIR_GUIAS}/${nombre}.png`);
    const muesca = guiaDeMuesca(n);
    const deMuesca = `rampas-muesca-${n}`;
    await writeFile(
      join(RAIZ, DIR_GUIAS, `${deMuesca}.png`),
      await sharp(Buffer.from(muesca.guia.svg())).png().toBuffer(),
    );
    await writeFile(
      join(RAIZ, DIR_GUIAS, `${deMuesca}.json`),
      `${JSON.stringify({ ancho: muesca.guia.ancho, alto: muesca.guia.alto, casilla: muesca.casilla, ...muesca.geometria }, null, 1)}\n`,
    );
    escritas.push(`${DIR_GUIAS}/${deMuesca}.png`);
  }
  return escritas;
}

/** Las escalas que se prueban al registrar una rampa sobre su guía: el pintor la dibuja algo mayor o menor. */
const ESCALAS = Array.from({ length: 25 }, (_, k) => 0.8 + k * 0.025);

/**
 * Dónde cae la guía en la imagen entera de una rampa, con su escala: el pintor
 * calca la forma pero no el tamaño (el primer lote salió un 17 % mayor), y
 * `registrarPieza` solo traslada. Se prueba cada escala de `ESCALAS` —la imagen
 * reducida o ampliada, registrada por traslación— y se queda la que más solapa
 * las dos siluetas (intersección entre unión). Devuelve cómo llevar un punto de
 * la guía a la imagen, en una lista de uno.
 */
async function registrarConEscala(
  entera: string,
  guiaPng: string,
  caja: readonly [number, number, number, number],
  nombre: string,
): Promise<[(p: P2) => P2]> {
  const mascara = await mascaraDeGuia(guiaPng);
  const original = await sharp(await readFile(entera)).metadata();
  const ow = original.width as number;
  const oh = original.height as number;
  const tmp = join(RAIZ, '.cache', `registro-${nombre}.png`);
  await mkdir(dirname(tmp), { recursive: true });
  let mejor: { iou: number; k: number; f: (p: P2) => P2 } | null = null;
  for (const k of ESCALAS) {
    const w = Math.round(ow / k);
    const h = Math.round(oh / k);
    const { data } = await sharp(await readFile(entera))
      .resize(w, h)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    await sharp(data, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toFile(tmp);
    const f = await registrarPieza(tmp, mascara, { nombre, caja });
    const [ox, oy] = f([0, 0]);
    let dentro = 0;
    let ambos = 0;
    for (let gy = caja[1]; gy <= caja[3]; gy++)
      for (let gx = caja[0]; gx <= caja[2]; gx++) {
        if (mascara.dentro[gy * mascara.ancho + gx] !== 1) continue;
        dentro++;
        const x = gx + ox;
        const y = gy + oy;
        if (
          x >= 0 &&
          y >= 0 &&
          x < w &&
          y < h &&
          (data[(y * w + x) * 4 + 3] as number) >= ALFA_FIGURA
        )
          ambos++;
      }
    let opacos = 0;
    for (let i = 3; i < data.length; i += 4) if ((data[i] as number) >= ALFA_FIGURA) opacos++;
    const iou = ambos / (dentro + opacos - ambos);
    if (mejor === null || iou > mejor.iou)
      mejor = {
        iou,
        k,
        f: (p: P2): P2 => {
          const [x, y] = f(p);
          return [x * k, y * k];
        },
      };
  }
  await rm(tmp, { force: true });
  if (mejor === null) throw new Error(`${nombre}: no se pudo registrar sobre la guía`);
  console.log(
    `  · ${nombre}: escala ${mejor.k.toFixed(3)}, solape ${(mejor.iou * 100).toFixed(1)} %`,
  );
  return [mejor.f];
}

/** El nombre del módulo de cada pieza: `s-cuerpo`, `s-costado-izq`… */
export const moduloDePieza = (p: PiezaDeRampa) => `s-${p}`;

/**
 * Corta la imagen entera de una rampa (`rampa-<material>-<caída>.webp`) en sus
 * tres piezas por la guía y escribe su índice (`rampa-….json`) con las juntas de
 * cada una (`JuntasDeRampa`): registra la imagen sobre la guía
 * (`registrarPieza`), lleva los cortes del filo a la imagen y corta en vertical
 * por ellos; cada pieza se recorta en alto a lo opaco.
 */
export async function escribirRampasDerivadas(hoja: string): Promise<string> {
  const m = /^rampa-(muesca-)?[a-z]+-([123])$/.exec(hoja);
  if (m === null)
    throw new Error(
      `«${hoja}» no es una hoja de rampas (rampa-<material>-<1|2|3> o rampa-muesca-<material>-<1|2|3>)`,
    );
  const forma = formaDeHoja(hoja);
  const piezas: readonly PiezaDeRampa[] = PIEZAS_DE_LA_FORMA[forma];
  const dir = join(RAIZ, 'assets/mapa/modulos');
  const guia = join(RAIZ, DIR_GUIAS, `rampas-${forma === 'muesca' ? 'muesca-' : ''}${m[2]}`);
  const g = JSON.parse(await readFile(`${guia}.json`, 'utf8')) as GeometriaDeRampa;
  const entera = join(dir, `${hoja}.webp`);
  const cortes = (await registrarConEscala(entera, `${guia}.png`, g.caja, hoja)).map((f) =>
    g.cortes.map(f),
  )[0] as P2[];
  const { data, info } = await sharp(await readFile(entera))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const salida = join(dir, hoja);
  await rm(salida, { recursive: true, force: true });
  await mkdir(salida, { recursive: true });
  const modulos = [];
  // Píxeles por casilla: del largo del tramo de la primera pieza.
  const [ta, tb] = TRAMO_DE_PIEZA_DE_RAMPA[piezas[0] as PiezaDeRampa];
  const porCasilla = ((cortes[1] as P2)[0] - (cortes[0] as P2)[0]) / (tb - ta);
  const ultima = piezas.length - 1;
  for (const [k, pieza] of piezas.entries()) {
    const a = cortes[k] as P2;
    const b = cortes[k + 1] as P2;
    // Las piezas de los extremos siguen `SOLAPE` por fuera de su tramo: esa
    // franja queda debajo de la pieza vecina, que se pinta después, y la arista
    // del corte no se ve.
    const x0 = Math.max(0, Math.round(a[0] - (k === 0 ? SOLAPE * porCasilla : 0)));
    const x1 = Math.min(info.width, Math.round(b[0] + (k === ultima ? SOLAPE * porCasilla : 0)));
    // En alto, lo opaco de su franja.
    let y0 = info.height;
    let y1 = -1;
    for (let y = 0; y < info.height; y++)
      for (let x = x0; x < x1; x++)
        if ((data[(y * info.width + x) * 4 + 3] as number) >= ALFA_FIGURA) {
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
    if (y1 < 0) throw new Error(`${hoja}: la pieza ${pieza} no tiene nada opaco`);
    const ancho = x1 - x0;
    const alto = y1 - y0 + 1;
    // La franja de `SOLAPE` de fuera de cada costado se funde a transparente:
    // donde no hay frontal vecina que la tape (una esquina, una ciudad), la pared
    // se deshace en vez de acabar en una arista vertical.
    const funde = Math.round(SOLAPE * porCasilla);
    const lados = [...(k === 0 ? ['oeste'] : []), ...(k === ultima ? ['este'] : [])];
    for (const lado of lados)
      for (let y = y0; y <= y1; y++)
        for (let d = 0; d < funde; d++) {
          const x = lado === 'oeste' ? x0 + d : x1 - 1 - d;
          const i = (y * info.width + x) * 4 + 3;
          data[i] = Math.round((data[i] as number) * (d / funde));
        }
    const bytes = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .extract({ left: x0, top: y0, width: ancho, height: alto })
      .webp({ quality: 90, alphaQuality: 100, effort: 6 })
      .toBuffer();
    const imagen = `${moduloDePieza(pieza)}.webp`;
    await writeFile(join(salida, imagen), bytes);
    const enLaPieza = (p: P2): P2 => [Math.round(p[0] - x0), Math.round(p[1] - y0)];
    modulos.push({
      imagen,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      ancho,
      alto,
      ancla: [Math.round(ancho / 2), alto - 1],
      rampa: { filo: [enLaPieza(a), enLaPieza(b)], pieza, rumbo: 's' },
    });
  }
  const ruta = join(dir, `${hoja}.json`);
  await writeFile(ruta, `${JSON.stringify({ hoja: `${hoja}.webp`, modulos }, null, 2)}\n`);
  return ruta.replace(`${RAIZ}/`, '');
}
