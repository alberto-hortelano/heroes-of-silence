/**
 * El tablero de batalla proyectado sobre el suelo a 25°.
 *
 * Nace de `aventura/combat-layout.ts` de la rama `archivo/gpt-rpg`, que dibujaba
 * un tablero fijo de 7×5 en un lienzo de 1800×800. Aquí se generaliza al 11×9 del
 * núcleo y al tamaño real del lienzo, y gana lo que allí no hacía falta porque
 * cada hex era un botón del DOM: la inversa, de píxel a hex.
 *
 * Hay dos espacios y conviene no mezclarlos:
 *
 *  - el **plano** del tablero, en unidades de «paso» (el ancho de un hex): la
 *    columna `c` de la fila `r` tiene su centro en `(c + r%2·½, r·√3/2)`. Es
 *    donde se interpola una figura que anda, porque ahí una línea recta es una
 *    línea recta;
 *  - la **pantalla**, que es el plano escalado por `paso` y con el eje vertical
 *    aplastado por `sin 25°`.
 */
import { BOARD_HEIGHT, BOARD_WIDTH } from '@core/battle/board.js';
import type { Hex } from '@core/types.js';
import { COMPRESION_SUELO } from '../../shared/arte.js';

/** Un punto del plano del tablero, en pasos. */
export interface Plano {
  readonly x: number;
  readonly y: number;
}

export interface Tablero {
  /** Ancho de un hex en píxeles. */
  readonly paso: number;
  /** Dónde cae en pantalla el centro del hex (0,0). */
  readonly origenX: number;
  readonly origenY: number;
  /**
   * Cuánto se aplasta el suelo en vertical: el seno de la elevación de la
   * cámara. Va de `COMPRESION_SUELO` (25°, el arte) a `COMPRESION_MAXIMA`; ver
   * `tableroPara`.
   */
  readonly compresion: number;
}

const ALTO_DE_FILA = Math.sqrt(3) / 2;

/**
 * Lo que mide un adulto de pie en el tablero, en pasos: en un hex y en una
 * unidad grande. Lo leen la caja de la figura (`cajaDeFigura`) y el ritmo de su
 * marcha (`marcha.ts`): una figura más grande da zancadas más largas.
 */
export const ALTO_DE_FIGURA = { normal: 0.95, grande: 1.45 } as const;
/** Radio del hex (centro a vértice), en pasos. */
const RADIO = 1 / Math.sqrt(3);
/**
 * Cuánto sitio vertical pide el tablero, en pasos: las nueve filas aplastadas,
 * medio hex arriba y abajo, y encima de la primera fila la altura de una figura
 * —que si no, se le cortaría la cabeza a la fila de atrás—.
 */
const ALTO_FIGURA = 1.55;
const MARGEN_ABAJO = 0.35;
/** Lo que el tablero pide en vertical y no depende de la elevación. */
const ALTO_FIJO = ALTO_FIGURA + 2 * RADIO + MARGEN_ABAJO;
/** Las ocho separaciones entre filas, sin aplastar. */
const ALTO_FILAS = (BOARD_HEIGHT - 1) * ALTO_DE_FILA;
const ANCHO_TABLERO = BOARD_WIDTH + 0.5 + 0.6;

/**
 * Hasta dónde se levanta la cámara cuando sobra alto: 35°.
 *
 * Con el suelo siempre a 25°, el tablero —casi 2:1— lo limitaba el ancho en
 * cualquier lienzo de escritorio, y dejaba un tercio del alto vacío encima. Y
 * las filas quedaban a 0,37 pasos unas de otras con figuras de 0,95: con nueve
 * individuos por bando la de delante tapaba la barra de vida de la de detrás.
 * Levantar la cámara separa las filas en vez de dejar cielo. El tope está cerca
 * de los 25° del arte —las figuras se renderizaron a esa elevación— para que el
 * suelo no se vea desde una cámara y quien pisa desde otra.
 */
export const COMPRESION_MAXIMA = Math.sin((35 * Math.PI) / 180);

/**
 * El tablero que cabe en un lienzo de `ancho × alto`, centrado.
 *
 * El paso lo decide el tablero a 25°; si con ese paso sobra alto, la cámara se
 * levanta (hasta `COMPRESION_MAXIMA`) y las filas se separan hasta llenarlo.
 * Cuando lo que manda es el alto —el móvil— el suelo se queda a 25°.
 *
 * En un móvil, a 390 px, el tablero cabría con hexes de 32 px y figuras que no
 * se pueden tocar: por eso la hoja de estilos le da al lienzo de batalla un
 * ancho fijo y lo deja desplazarse en horizontal, en vez de encogerlo aquí.
 */
export function tableroPara(ancho: number, alto: number): Tablero {
  const paso = Math.max(
    1,
    Math.min(ancho / ANCHO_TABLERO, alto / (ALTO_FIJO + ALTO_FILAS * COMPRESION_SUELO)),
  );
  const cabe = (alto / paso - ALTO_FIJO) / ALTO_FILAS;
  const compresion = Math.max(COMPRESION_SUELO, Math.min(COMPRESION_MAXIMA, cabe));
  const sobraY = Math.max(0, alto - (ALTO_FIJO + ALTO_FILAS * compresion) * paso);
  return {
    paso,
    origenX: (ancho - (BOARD_WIDTH + 0.5) * paso) / 2 + paso / 2,
    origenY: sobraY / 2 + (ALTO_FIGURA + RADIO) * paso,
    compresion,
  };
}

/** El centro de un hex en el plano. */
export function planoDeHex(h: Hex): Plano {
  return { x: h.col + (h.row % 2) * 0.5, y: h.row * ALTO_DE_FILA };
}

/**
 * El centro de una unidad en el plano: el de su hex, o el punto medio de los
 * dos si es grande. Lo usan el animador, que la pinta ahí, y el guion de
 * capturas, que pulsa ahí: escrito una vez para que no puedan discrepar.
 */
export function centroDeStack(hexes: readonly Hex[]): Plano {
  const planos = hexes.map(planoDeHex);
  return {
    x: planos.reduce((t, h) => t + h.x, 0) / planos.length,
    y: planos.reduce((t, h) => t + h.y, 0) / planos.length,
  };
}

/** Un punto del plano en pantalla. */
export function enPantalla(t: Tablero, p: Plano): { x: number; y: number } {
  return { x: t.origenX + p.x * t.paso, y: t.origenY + p.y * t.paso * t.compresion };
}

/**
 * La inversa de `enPantalla`: el punto del plano bajo un píxel. Deshacer la
 * compresión es lo que hace que «la casilla más cercana al puntero» signifique
 * lo que se ve: en pantalla las filas están aplastadas y la vecina de arriba
 * queda más cerca que la de al lado, así que medido en píxeles la casilla del
 * oeste no ganaba nunca dentro del hexágono del enemigo.
 */
export function planoDePixel(t: Tablero, px: number, py: number): Plano {
  return { x: (px - t.origenX) / t.paso, y: (py - t.origenY) / (t.paso * t.compresion) };
}

export function centroHex(t: Tablero, h: Hex): { x: number; y: number } {
  return enPantalla(t, planoDeHex(h));
}

/** Los seis vértices del hex en pantalla, punta arriba, ya aplastados. */
export function verticesHex(t: Tablero, h: Hex): { x: number; y: number }[] {
  const c = centroHex(t, h);
  const r = RADIO * t.paso;
  return Array.from({ length: 6 }, (_, i) => {
    const angulo = (Math.PI / 3) * i - Math.PI / 2;
    return { x: c.x + Math.cos(angulo) * r, y: c.y + Math.sin(angulo) * r * t.compresion };
  });
}

/**
 * El hex bajo un píxel, o `null` fuera del tablero.
 *
 * Se deshace la compresión para volver al plano y se busca el centro más
 * cercano: en una rejilla de hexágonos la celda de Voronoi de cada centro ES su
 * hexágono, así que el más cercano es exacto dentro del tablero. Fuera no: el
 * más cercano a un punto lejano es un hex del borde, y por eso se comprueba al
 * final que el punto caiga de verdad dentro de ese hex.
 */
export function hexEnPixel(t: Tablero, px: number, py: number): Hex | null {
  const { x: u, y: v } = planoDePixel(t, px, py);
  let mejor: Hex | null = null;
  let mejorD = Infinity;
  for (let row = 0; row < BOARD_HEIGHT; row++) {
    for (let col = 0; col < BOARD_WIDTH; col++) {
      const c = planoDeHex({ col, row });
      const d = (c.x - u) * (c.x - u) + (c.y - v) * (c.y - v);
      if (d < mejorD) {
        mejorD = d;
        mejor = { col, row };
      }
    }
  }
  if (mejor === null) return null;
  const c = planoDeHex(mejor);
  const dx = Math.abs(u - c.x);
  const dy = Math.abs(v - c.y);
  // Punta arriba: medio paso de ancho, y la diagonal recorta las esquinas.
  const dentro = dx <= 0.5 && dy <= RADIO - dx / Math.sqrt(3);
  return dentro ? mejor : null;
}

/**
 * Cuánto del hex es «su centro» para el clic, en pasos del plano: algo menos de
 * tres quintos del medio paso que hay del centro al lado.
 */
const RADIO_DEL_CENTRO = 0.3;

/**
 * ¿Cae el píxel cerca del centro del hex `h`? Lo pregunta el clic de batalla:
 * una figura de la fila de delante tapa media fila de detrás, y sin esta
 * pregunta pulsar el centro de un hex al que podías ir atacaba a quien lo tapaba.
 */
export function cercaDelCentro(t: Tablero, h: Hex, px: number, py: number): boolean {
  const c = planoDeHex(h);
  const p = planoDePixel(t, px, py);
  const u = p.x - c.x;
  const v = p.y - c.y;
  return u * u + v * v <= RADIO_DEL_CENTRO * RADIO_DEL_CENTRO;
}
