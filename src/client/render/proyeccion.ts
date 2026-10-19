/**
 * El tablero de batalla proyectado sobre el suelo a 25°.
 *
 * Nace de `aventura/combat-layout.ts` de la rama `archivo/gpt-rpg`, que dibujaba
 * un tablero fijo de 7×5 en un lienzo de 1800×800. Aquí se generaliza al tablero del
 * núcleo (filas de 12 y 11, simétrico) y al tamaño real del lienzo, y gana lo que allí no hacía falta porque
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
import { desplazamientoDeFila, EXTENSION_HORIZONTAL, isInside } from '@core/battle/board.js';
import type { Hex } from '@core/types.js';
import {
  ALTO_DE_FILA,
  COMPRESION_SUELO,
  FONDO_DEL_COMBATE,
  MARGEN_ABAJO,
  type Plano,
} from '../../shared/arte.js';

export type { Plano };
export { FONDO_DEL_COMBATE };

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

/**
 * Lo que mide un adulto de pie en el tablero, en pasos. Lo leen la caja de la
 * figura (`cajaDeFigura`) y el ritmo de su marcha (`marcha.ts`). Toda unidad
 * ocupa una casilla (13-10-2026): la figura grande de dos se fue con ellas.
 */
export const ALTO_DE_FIGURA = 0.95;
/** Radio del hex (centro a vértice), en pasos. */
const RADIO = 1 / Math.sqrt(3);
/**
 * Cuánto sitio vertical pide el tablero, en pasos: las nueve filas aplastadas,
 * medio hex arriba y abajo, y encima de la primera fila la altura de una figura
 * —que si no, se le cortaría la cabeza a la fila de atrás—.
 */
const ALTO_FIGURA = 1.55;
/** Lo que el tablero pide en vertical y no depende de la elevación. */
const ALTO_FIJO = ALTO_FIGURA + 2 * RADIO + MARGEN_ABAJO;
/**
 * Lo que ocupan las casillas en horizontal, en pasos: de un centro extremo al
 * otro (`EXTENSION_HORIZONTAL`, del núcleo) y medio hex a cada lado.
 */
const ANCHO_DE_LAS_CASILLAS = EXTENSION_HORIZONTAL.hasta - EXTENSION_HORIZONTAL.desde + 1;
/** Lo que el tablero pide en horizontal, en pasos: las casillas y 0,6 de margen. */
const ANCHO_TABLERO = ANCHO_DE_LAS_CASILLAS + 0.6;

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
 * El ancho fijo del lienzo de batalla en el móvil, en píxeles: el de
 * `#app[data-escena='battle'] .map-wrap canvas` en `style.css`, que la base
 * comparte (pregunta A de la vuelta 2). Lo compara un test con la hoja.
 */
export const ANCHO_DEL_COMBATE_EN_MOVIL = 860;

/**
 * El tamaño de un paso y la elevación de la cámara del tablero de combate en un
 * lienzo de `ancho × alto`: la única cuenta de la escala, que leen la batalla
 * (`tableroPara`) y la base (`pasoDeLaBase`). `alzado` son los pasos que pide de
 * más encima de la fila de atrás lo que sube del suelo —las columnas de una
 * muralla (`alzadoDeLaMuralla`)—; sin él, el de siempre. La base no lo pasa: su
 * escala es la de una batalla sin muralla.
 */
export function escalaDelCombate(
  ancho: number,
  alto: number,
  alzado = 0,
): { paso: number; compresion: number } {
  const fijo = ALTO_FIJO + alzado;
  const paso = Math.max(
    1,
    Math.min(ancho / ANCHO_TABLERO, alto / (fijo + FONDO_DEL_COMBATE * COMPRESION_SUELO)),
  );
  const cabe = (alto / paso - fijo) / FONDO_DEL_COMBATE;
  return { paso, compresion: Math.max(COMPRESION_SUELO, Math.min(COMPRESION_MAXIMA, cabe)) };
}

/**
 * El paso de la base en un lienzo de `ancho × alto`: el de una batalla en ese
 * lienzo, para que un adulto mida lo mismo en los dos. En un lienzo más
 * estrecho que el del combate en el móvil se calcula como si midiera aquel, que
 * es lo que ve quien juega una batalla en el móvil (con desplazamiento); en un
 * escritorio estrecho la figura de la base sale hasta un 20 % mayor (aceptado).
 */
export function pasoDeLaBase(ancho: number, alto: number): number {
  return escalaDelCombate(Math.max(ancho, ANCHO_DEL_COMBATE_EN_MOVIL), alto).paso;
}

/**
 * El tablero que cabe en un lienzo de `ancho × alto`, centrado, con `alzado`
 * pasos de más encima de la fila de atrás (`escalaDelCombate`).
 *
 * El paso lo decide el tablero a 25°; si con ese paso sobra alto, la cámara se
 * levanta (hasta `COMPRESION_MAXIMA`) y las filas se separan hasta llenarlo.
 * Cuando lo que manda es el alto —el móvil— el suelo se queda a 25°.
 *
 * En un móvil, a 390 px, el tablero cabría con hexes de 32 px y figuras que no
 * se pueden tocar: por eso la hoja de estilos le da al lienzo de batalla un
 * ancho fijo y lo deja desplazarse en horizontal, en vez de encogerlo aquí.
 */
export function tableroPara(ancho: number, alto: number, alzado = 0): Tablero {
  const { paso, compresion } = escalaDelCombate(ancho, alto, alzado);
  const sobraY = Math.max(0, alto - (ALTO_FIJO + alzado + FONDO_DEL_COMBATE * compresion) * paso);
  return {
    paso,
    origenX: (ancho - ANCHO_DE_LAS_CASILLAS * paso) / 2 + (0.5 - EXTENSION_HORIZONTAL.desde) * paso,
    origenY: sobraY / 2 + (ALTO_FIGURA + alzado + RADIO) * paso,
    compresion,
  };
}

/**
 * El alto de lienzo con el que `tableroPara(ancho, alto', alzado)` sale con el
 * MISMO paso y la misma cámara que `tableroPara(ancho, alto)`: el de ahora más
 * `alzado` pasos. Es como crece el lienzo de una batalla con muralla: lo alto de
 * las columnas pide sitio encima de la fila de atrás, y en vez de encoger el
 * tablero para meterlo, el tablero baja y el lienzo se alarga (decisión del
 * usuario, 09-10-2026). Sin alzado, `alto` tal cual.
 */
export function altoConAlzado(ancho: number, alto: number, alzado: number): number {
  return alzado <= 0 ? alto : alto + alzado * tableroPara(ancho, alto).paso;
}

/** El centro de un hex en el plano. */
export function planoDeHex(h: Hex): Plano {
  return { x: h.col + desplazamientoDeFila(h.row) * 0.5, y: h.row * ALTO_DE_FILA };
}

/**
 * El centro de una unidad en el plano: el de sus hexes (hoy, uno). Lo usan el animador, que la pinta ahí, y el guion de
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
 * hexágono. Sin recorrer el tablero: el más cercano de la rejilla está en la
 * fila más cercana o en una de sus dos vecinas (la de dos filas más allá queda
 * a 1,5 filas, más lejos que cualquier punto de su propio hex), y en cada fila
 * es la columna redondeada. Si ese hex no existe —fuera del tablero o en el
 * hueco de una fila impar— el punto no es de nadie; y como el más cercano de un
 * punto lejano es igual un hex del borde, se comprueba al final que caiga de
 * verdad dentro.
 */
export function hexEnPixel(t: Tablero, px: number, py: number): Hex | null {
  const { x: u, y: v } = planoDePixel(t, px, py);
  const cerca = Math.round(v / ALTO_DE_FILA);
  let mejor: Hex | null = null;
  let mejorD = Infinity;
  for (let row = cerca - 1; row <= cerca + 1; row++) {
    // `+ 0`: un poco a la izquierda del centro de la columna 0 redondea a −0, y
    // `{ col: −0 }` no es la casilla `{ col: 0 }` para quien compara a fondo.
    const h = { col: Math.round(u - desplazamientoDeFila(row) * 0.5) + 0, row };
    const c = planoDeHex(h);
    const d = (c.x - u) * (c.x - u) + (c.y - v) * (c.y - v);
    if (d < mejorD) {
      mejorD = d;
      mejor = h;
    }
  }
  if (mejor === null || !isInside(mejor)) return null;
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
