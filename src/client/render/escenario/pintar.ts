/**
 * Pintar una escena (`componer`) en un canvas cualquiera. Es lo que importaría
 * el juego: no crea páginas, no mide y no sabe de dónde salen las imágenes;
 * recibe un `imagen(src)` que devuelve la ya cargada, o nada, y entonces pinta
 * el marcador de color de esa pieza (el juego se juega sin arte).
 *
 * La escena se parte en dos (`separar`): lo PLANO —el suelo, el agua, las
 * sendas, las caras de roca, la cubierta baja— y los VOLÚMENES —árboles, picos,
 * muros, paredes, objetos horneados y lo que pase de `UMBRAL_DE_VOLUMEN`—. Lo
 * plano se pinta una vez en una superficie (`pintarSuelo`); los volúmenes, a
 * cada fotograma y solo los que se ven (`pintarSprite`), mezclados por
 * profundidad con las figuras del juego. `pintarEscena`, la del taller, es las
 * dos cosas seguidas.
 *
 * Capas del suelo, de abajo arriba:
 *   1. el suelo de cada región, con la frontera cortada por ruido y por la
 *      altura de las texturas (`fronteras.ts`), y cada textura encajada sin
 *      rejilla (`parches.ts`);
 *   2. la sombra de cada nivel (lo bajo, más oscuro);
 *   2b. el arcén: el pasillo de la senda, en el color de su suelo;
 *   3. las sendas y las trochas (`huella.ts`);
 *   4. el agua, con su barro y su espuma;
 *   5. los cantos de las caídas al este y al oeste;
 *   6. la sombra al pie de lo que tiene volumen (también de los volúmenes);
 *   7. por orden de y, las caras de roca y lo plano;
 *   8. la luz y la niebla baja.
 * Encima, los volúmenes por su `y`, y en el taller (9) las nubes del borde y la
 * viñeta, las dos opcionales.
 *
 * Todo en píxeles de un mapa de `tile` por casilla, desplazado `margen` píxeles
 * (el sitio de las nubes): con `margen: 0` la casilla (x, y) empieza en
 * (x·tile, y·tile).
 *
 * El suelo es caro —miles de sprites y una docena de máscaras desenfocadas—: se
 * pinta una vez por mapa en una superficie aparte y se copia.
 */

import { columnasDeCara } from './caras.js';
import type { Escena, Luz, Sprite } from './colocar.js';
import { type AlturaDeSuelo, fronterasDelSuelo, PX_DE_LAS_FRONTERAS } from './fronteras.js';
import { pintarHuellas, TEXTURA_DE_LA_HUELLA } from './huella.js';
import {
  CASILLAS_POR_TEXTURA,
  type Encaje,
  encajeDe,
  pesoDelParche,
  RADIO_DEL_PARCHE,
  type Variante,
} from './parches.js';
import { cajaDeSprite } from './pasillo.js';
import { bandaDeCara, type CaraDeEscena } from './relieve.js';
import { ANCHO_DEL_VADO, ANCHO_DEL_VADO_EN_EL_BARRO, SEMIANCHO_DEL_PASILLO } from './sendas.js';

/** Lo que el pintor acepta como imagen: cargada (`<img>`) o ya pintada (`<canvas>`). */
export type Imagen = HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap;
export type Lienzo = HTMLCanvasElement | OffscreenCanvas;
type Contexto = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface OpcionesDePintura {
  /** Píxeles por casilla. */
  readonly tile: number;
  /** Píxeles alrededor del mapa; el de la página del taller es `MARGEN × tile`. */
  readonly margen?: number;
  /** La imagen de `src` (relativa a `assets/mapa/`) si ya está cargada. */
  readonly imagen: (src: string) => Imagen | undefined;
  /** Un canvas nuevo para las máscaras; por defecto, `OffscreenCanvas` o `document`. */
  readonly lienzo?: (ancho: number, alto: number) => Lienzo;
  /** Qué objetos del mapa se pintan (por defecto, todos). */
  readonly objeto?: (o: NonNullable<Sprite['objeto']>) => boolean;
  /** Las nubes del borde (por defecto, sí). El juego tiene su propia niebla. */
  readonly nubes?: boolean;
  /** La viñeta oscura del borde (por defecto, sí). */
  readonly vineta?: boolean;
  /** La luz y la niebla baja (por defecto, sí). */
  readonly luces?: boolean;
  /**
   * Solo la silueta de lo que tapa el suelo, en blanco sobre transparente: es
   * lo que mide el taller. Lo demás no se pinta.
   */
  readonly silueta?: boolean;
  /** El alto, en casillas, desde el que un sprite es volumen (`UMBRAL_DE_VOLUMEN`). */
  readonly umbral?: number;
  /**
   * La imagen de `s` ya entonada y reducida a `ancho × alto`, si quien pinta la
   * tiene: se copia 1:1 en una unidad entera del contexto. Es lo que hace barato
   * pintar volúmenes a cada fotograma: escalar desde el módulo nativo (hasta
   * ~1 700 px) cuesta tres o cuatro veces más, y una copia en una posición con
   * decimales el navegador la remuestrea, que sin GPU es lo que costaba el
   * fotograma. Por eso quien la da pinta con el contexto en píxeles de
   * dispositivo y trasladado un número entero de ellos.
   *
   * Si la que da es de otro tamaño, se escala con la calidad que tenga el
   * contexto, que la decide quien la da; si da `null`, el sprite no se pinta en
   * este fotograma: quien pinta la tendrá en uno de los siguientes.
   */
  readonly reducida?: (s: Sprite, ancho: number, alto: number) => Imagen | null | undefined;
}

/** El margen de la página del taller, en casillas: el sitio de las nubes. */
export const MARGEN = 1.4;

/** Píxeles de la superficie entera de una escena. */
export function tamanoDeEscena(
  e: Escena,
  tile: number,
  margen = 0,
): { ancho: number; alto: number } {
  return { ancho: Math.floor(e.W * tile + 2 * margen), alto: Math.floor(e.H * tile + 2 * margen) };
}

const TEXTURAS = ['agua', 'barro', 'cara-roca', 'cara-arenisca', 'cara-basalto', 'cara-nevada'];

/**
 * Si `s` se pinta con el filtro `objeto`: lo que el filtro deja fuera no se
 * pinta, no se pide y no va a ninguna lista, porque lo pinta quien llama (el
 * juego pinta él los monstruos, los recursos y los cofres).
 */
function seVe(s: Sprite, objeto: OpcionesDePintura['objeto']): boolean {
  return s.objeto === undefined || objeto === undefined || objeto(s.objeto);
}

/** Todas las imágenes que puede pedir la escena: para cargarlas antes de pintar. */
export function imagenesDeEscena(e: Escena, objeto?: OpcionesDePintura['objeto']): string[] {
  const fuera = new Set<string>();
  for (const s of new Set(e.suelo)) fuera.add(`suelos/${s}.webp`);
  for (const t of TEXTURAS) fuera.add(`texturas/${t}.webp`);
  fuera.add(TEXTURA_DE_LA_HUELLA);
  for (const s of e.sprites) if (s.src !== null && seVe(s, objeto)) fuera.add(s.src);
  return [...fuera];
}

/**
 * Las imágenes que pide `pintarSuelo`: las texturas y lo plano. Es lo que carga
 * el pintor del suelo, que no necesita las de los volúmenes.
 */
export function imagenesDelSuelo(e: Escena, sep: EscenaSeparada): string[] {
  const fuera = new Set<string>();
  for (const s of new Set(e.suelo)) fuera.add(`suelos/${s}.webp`);
  for (const t of TEXTURAS) fuera.add(`texturas/${t}.webp`);
  fuera.add(TEXTURA_DE_LA_HUELLA);
  for (const s of sep.planos) if (s.src !== null) fuera.add(s.src);
  return [...fuera];
}

/** El color de cada suelo mientras no llega su textura. */
const PIGMENTO: Readonly<Record<string, string>> = {
  grass: '#4f5239',
  dirt: '#6f5e46',
  rough: '#5b5950',
  sand: '#94856a',
  swamp: '#354139',
  snow: '#a7acab',
  lava: '#553328',
};
/** El de un suelo sin pigmento. */
const SIN_PIGMENTO = '#666666';
const pigmento = (suelo: string) => PIGMENTO[suelo] ?? SIN_PIGMENTO;

/**
 * Las texturas aprobadas son oscuras y la referencia tiene praderas vivas: el
 * color se aviva al pintar, por suelo, sin tocar el arte.
 */
const VIVEZA: Readonly<Record<string, string>> = {
  grass: 'saturate(1.45) brightness(1.3)',
  dirt: 'saturate(1.2) brightness(1.15)',
  // Algo más oscura que el resto: al alejar, el agua tiene que salir de ella (#205).
  swamp: 'saturate(1.2) brightness(0.95)',
  sand: 'saturate(0.8) brightness(0.92)',
  snow: 'brightness(1.15)',
  lava: 'saturate(1.2) brightness(1.15)',
  rough: 'brightness(1.12)',
};

/**
 * El agua tiene que leerse como agua al alejar (#205, auditoría 4 §8): con
 * `saturate(1.3) brightness(1.45)` y el centro oscurecido a 0,45, el agua, la
 * ciénaga y la roca de la s80 eran el mismo gris. Más clara y más azul, con
 * el centro apenas más hondo, la espuma de la orilla más marcada, la ciénaga
 * algo más oscura (`VIVEZA`) y su niebla más tenue: la luminancia media por
 * casilla a 16 px, agua menos ciénaga, pasó de 5,7 / 5,5 / 11,1 a 15,1 / 15,0
 * / 20,7 en s80, s2 y s57 (08-10-2026).
 */
const FILTRO_DEL_AGUA = 'saturate(1.6) brightness(1.8)';
const HONDO_DEL_AGUA = 'rgba(10,35,70,0.22)';
const ESPUMA = 'rgba(225,235,235,0.5)';

const COLOR_DE_LUZ: Readonly<Record<Luz['clase'], readonly [number, number, number, number]>> = {
  fuego: [255, 170, 80, 0.22],
  brasa: [255, 90, 30, 0.2],
  // Tenue (era 0,16): sobre la ciénaga la aclaraba hasta el gris del agua (#205).
  niebla: [210, 222, 228, 0.1],
};

const anchoNatural = (im: Imagen) => ('naturalWidth' in im ? im.naturalWidth : im.width);
const altoNatural = (im: Imagen) => ('naturalHeight' in im ? im.naturalHeight : im.height);
const lista = (im: Imagen | undefined): im is Imagen =>
  im !== undefined && anchoNatural(im) > 0 && (!('complete' in im) || im.complete);
const imagenLista = (im: Imagen | undefined): Imagen | undefined => (lista(im) ? im : undefined);

type NuevoLienzo = (ancho: number, alto: number) => Lienzo;

function lienzoPorDefecto(ancho: number, alto: number): Lienzo {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(ancho, alto);
  const c = document.createElement('canvas');
  c.width = ancho;
  c.height = alto;
  return c;
}

function contexto(l: Lienzo): Contexto {
  const c = l.getContext('2d') as Contexto | null;
  if (c === null) throw new Error('el pintor de la escena necesita un contexto 2d');
  return c;
}

/** Un lienzo nuevo de `ancho × alto` y su contexto: el de las máscaras, el suelo y las copias. */
export function lienzoCon(
  ancho: number,
  alto: number,
  nuevo: NuevoLienzo = lienzoPorDefecto,
): { readonly lienzo: Lienzo; readonly c: Contexto } {
  const lienzo = nuevo(ancho, alto);
  return { lienzo, c: contexto(lienzo) };
}

/**
 * `im` copiada a `ancho × alto` con su `tono`. Es el único sitio que entona: lo
 * usan la copia a tamaño natural de aquí abajo y las reducidas de cada fotograma
 * (`render/copias.ts`), así que las dos salen con el mismo color.
 */
export function copiaEntonada(
  im: Imagen,
  tono: string | undefined,
  ancho: number,
  alto: number,
  nuevo: NuevoLienzo = lienzoPorDefecto,
): Lienzo {
  const { lienzo, c } = lienzoCon(ancho, alto, nuevo);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  if (tono !== undefined) c.filter = tono;
  c.drawImage(im, 0, 0, ancho, alto);
  return lienzo;
}

/**
 * Las copias entonadas a tamaño natural: un filtro de canvas por sprite es
 * lentísimo en Chromium (miles de piedras), así que cada imagen se entona una
 * vez por tono. Se guarda por imagen, y quien ya no las necesite las suelta
 * (`olvidarEntonadas`): son copias del tamaño del módulo nativo.
 */
let entonadas = new WeakMap<Imagen, Map<string, Lienzo>>();

function entonada(im: Imagen, tono: string, nuevo: NuevoLienzo): Lienzo {
  let porTono = entonadas.get(im);
  if (porTono === undefined) {
    porTono = new Map();
    entonadas.set(im, porTono);
  }
  let copia = porTono.get(tono);
  if (copia === undefined) {
    copia = copiaEntonada(im, tono, anchoNatural(im), altoNatural(im), nuevo);
    porTono.set(tono, copia);
  }
  return copia;
}

/**
 * Suelta las copias entonadas. El juego las necesita solo para pintar el suelo
 * una vez: los volúmenes de cada fotograma salen de las reducidas.
 */
export function olvidarEntonadas(): void {
  entonadas = new WeakMap();
}

/**
 * Lo que tiene volumen, con su clave de profundidad: la `y` de la base, en
 * casillas, que es donde se apoya el ancla. Es la misma convención con la que el
 * juego ordena sus figuras, así que una figura puede quedar detrás de un árbol.
 */
export interface Volumen {
  readonly clave: number;
  readonly s: Sprite;
}

/** Una escena partida en lo que se pinta una vez y lo que se pinta a cada fotograma. */
export interface EscenaSeparada {
  /** Lo plano, en su orden de `y`: va a la superficie del suelo con las caras de roca. */
  readonly planos: readonly Sprite[];
  /** Lo que tapa, ordenado por `clave` y, a igualdad, por `x`. */
  readonly volumenes: readonly Volumen[];
}

/**
 * Lo que pasa de este alto, en casillas, ya tapa a una figura y va a los
 * volúmenes (decisión del usuario). Con 0,6 una mata no tapa nunca a una figura
 * y los arbolillos de un bosquecillo sí.
 */
export const UMBRAL_DE_VOLUMEN = 0.6;

/**
 * Las clases que tapan sea cual sea su alto. Las caras de roca NO son sprites ni
 * volumen: cuelgan hacia el sur, no tapan a nadie, y llevan rocas caídas
 * solapadas a su pie que tienen que quedar encima; van al suelo, por `y`.
 */
const SIEMPRE_VOLUMEN: ReadonlySet<Sprite['clase']> = new Set(['masa', 'muro', 'pared', 'objeto']);

/** Si `s` va a los volúmenes, que se pintan por su `y`; si no, va al suelo, debajo de todos ellos. */
export const esVolumen = (s: Pick<Sprite, 'clase' | 'alto'>, umbral = UMBRAL_DE_VOLUMEN): boolean =>
  SIEMPRE_VOLUMEN.has(s.clase) || s.alto > umbral;

/**
 * El orden en que se pintan los volúmenes: por su `y`, que es su clave, y a
 * igual `y` de oeste a este. Negativo si `p` va antes que `q`. Lo que se pinta
 * después tapa a lo de antes: es la pregunta de `vaDelante` (`colocar.ts`).
 */
export const ordenDeVolumenes = (p: Pick<Sprite, 'x' | 'y'>, q: Pick<Sprite, 'x' | 'y'>): number =>
  p.y - q.y || p.x - q.x;

/**
 * Parte la escena: cada sprite de la capa del suelo va a una sola lista, y las
 * nubes a ninguna. Lo que el filtro `objeto` deja fuera no va a ninguna (`seVe`).
 */
export function separar(
  e: Pick<Escena, 'sprites'>,
  o: Pick<OpcionesDePintura, 'umbral' | 'objeto'> = {},
): EscenaSeparada {
  const umbral = o.umbral ?? UMBRAL_DE_VOLUMEN;
  const planos: Sprite[] = [];
  const volumenes: Volumen[] = [];
  for (const s of e.sprites) {
    if (s.capa !== 0 || !seVe(s, o.objeto)) continue;
    if (esVolumen(s, umbral)) volumenes.push({ clave: s.y, s });
    else planos.push(s);
  }
  // `componer` ya los da por (capa, y, x); se ordena igual por si un día no.
  volumenes.sort((p, q) => ordenDeVolumenes(p.s, q.s));
  return { planos, volumenes };
}

/**
 * Un sprite, en píxeles del mapa (la casilla (x, y) empieza en (x·tile, y·tile)):
 * su imagen por su ancla, la copia ya reducida si la hay, o su marcador. Es lo
 * que el juego pinta a cada fotograma por cada volumen, mezclado con sus figuras
 * por la clave; quien lo pinte en una cámara traslada antes el contexto.
 */
export function pintarSprite(c: Contexto, s: Sprite, o: OpcionesDePintura): void {
  const T = o.tile;
  const silueta = o.silueta === true;
  const original = s.src === null ? undefined : o.imagen(s.src);
  if (lista(original)) {
    // El rectángulo es el que mide el pasillo: lo que se aparta del camino se
    // aparta de lo que se pinta.
    const [x0, y0, x1, y1] = cajaDeSprite(s);
    const dx = x0 * T;
    const dy = y0 * T;
    const ancho = (x1 - x0) * T;
    const alto = (y1 - y0) * T;
    const reducida = silueta || s.recorte !== undefined ? undefined : o.reducida?.(s, ancho, alto);
    if (reducida === null) return;
    if (reducida !== undefined) {
      if (
        anchoNatural(reducida) === Math.max(1, Math.round(ancho)) &&
        altoNatural(reducida) === Math.max(1, Math.round(alto))
      )
        c.drawImage(reducida, Math.round(dx), Math.round(dy));
      else c.drawImage(reducida, dx, dy, ancho, alto);
      return;
    }
    const im = s.tono !== undefined && !silueta ? entonada(original, s.tono, nuevoDe(o)) : original;
    if (s.recorte === undefined) c.drawImage(im, dx, dy, ancho, alto);
    else c.drawImage(im, ...s.recorte, dx, dy, ancho, alto);
    return;
  }
  // Sin su imagen, su marcador: un triángulo de su color.
  c.fillStyle = silueta ? '#fff' : s.color;
  c.beginPath();
  const w = s.alto * T * 0.45;
  c.moveTo(s.x * T - w, s.y * T);
  c.lineTo(s.x * T, s.y * T - s.alto * T);
  c.lineTo(s.x * T + w, s.y * T);
  c.fill();
}

const nuevoDe = (o: OpcionesDePintura) => o.lienzo ?? lienzoPorDefecto;

/**
 * Todo lo plano, una vez: las capas 1-6, los planos y las caras de roca por su
 * `y`, y la luz encima. En píxeles del mapa, sin margen. La luz va aquí y no
 * encima de los volúmenes porque tiñe el suelo: pintarla aparte costaría otra
 * copia escalada por fotograma.
 */
export function pintarSuelo(
  c: Contexto,
  e: Escena,
  sep: EscenaSeparada,
  o: OpcionesDePintura,
): void {
  const T = o.tile;
  const nuevo = nuevoDe(o);
  const silueta = o.silueta === true;

  const mascara = (pred: (i: number) => boolean, desenfoque: number): Lienzo => {
    const chico = campoPorCasilla(e, nuevo, (i) => (pred(i) ? NEGRO : null));
    const { lienzo: grande, c: g } = lienzoCon(e.W * T, e.H * T, nuevo);
    g.imageSmoothingEnabled = true;
    g.filter = `blur(${desenfoque}px)`;
    g.drawImage(chico, 0, 0, e.W * T, e.H * T);
    g.filter = 'none';
    return grande;
  };
  /**
   * `capa` (una máscara) rellena de la textura `src` sin rejilla: el patrón y
   * encima los parches de su encaje (`parches.ts`), con `source-atop`, que deja
   * el alfa de la máscara. Solo se estampan los parches que llegan a una casilla
   * donde `cubre`, con `alcance` casillas de holgura (lo que la máscara se sale).
   */
  const rellenar = (
    capa: Lienzo,
    src: string,
    color: string,
    casillasPorTextura: number,
    clave: string,
    cubre: (i: number) => boolean,
    alcance: number,
  ) => {
    const g = contexto(capa);
    g.globalCompositeOperation = 'source-in';
    const im = o.imagen(src);
    const patron = lista(im) ? g.createPattern(im, 'repeat') : null;
    if (patron !== null && im !== undefined) {
      patron.setTransform(new DOMMatrix().scale((casillasPorTextura * T) / anchoNatural(im)));
      g.fillStyle = patron;
    } else g.fillStyle = color;
    g.fillRect(0, 0, capa.width, capa.height);
    if (patron !== null && im !== undefined) {
      g.globalCompositeOperation = 'source-atop';
      const encaje = encajeDe(e.semilla, clave, e.W, e.H, casillasPorTextura);
      estamparParches(g, im, encaje, T, (p) => llegaA(e, p.x, p.y, alcance, cubre), nuevo);
    }
    g.globalCompositeOperation = 'source-over';
    return capa;
  };
  /**
   * El contorno de lo que se pinta de una cara (`CaraDeEscena.pintada`): por
   * cada trozo de columnas seguidas que se pintan, lo alto de izquierda a
   * derecha y el pie de vuelta. Un trozo de una sola columna no tiene ancho.
   */
  const contornoDeCara = (f: CaraDeEscena) => {
    const xs = columnasDeCara(f);
    let desde = 0;
    for (let i = 0; i <= f.pintada.length; i++) {
      if (f.pintada[i] != null) continue;
      if (i - desde >= 2) {
        const trozo = f.pintada.slice(desde, i) as (readonly [number, number])[];
        trozo.forEach(([arriba], k) => {
          const px = (xs[desde + k] as number) * T;
          if (k === 0) c.moveTo(px, arriba * T);
          else c.lineTo(px, arriba * T);
        });
        for (let k = trozo.length - 1; k >= 0; k--)
          c.lineTo((xs[desde + k] as number) * T, (trozo[k] as readonly [number, number])[1] * T);
        c.closePath();
      }
      desde = i + 1;
    }
  };
  const pintarCara = (f: CaraDeEscena) => {
    const [bx0, by0, bx1, by1] = bandaDeCara(f);
    const x = bx0 * T;
    const y = by0 * T;
    const w = (bx1 - bx0) * T;
    const h = (by1 - by0) * T;
    // Solo bajo la silueta de su pared (#159): donde no la tapa ninguna se ve
    // el suelo de abajo. La banda entera era un rectángulo
    // liso de bordes rectos donde la pared no entraba o era transparente.
    if (!f.pintada.some((t) => t !== null)) return;
    c.save();
    c.beginPath();
    contornoDeCara(f);
    if (silueta) {
      c.fillStyle = '#fff';
      c.fill();
      c.restore();
      return;
    }
    c.clip();
    const im = o.imagen(`texturas/${f.material}.webp`);
    const patron = lista(im) ? c.createPattern(im, 'repeat') : null;
    if (patron !== null && im !== undefined) {
      patron.setTransform(new DOMMatrix().translate(0, y).scale((1.6 * T) / anchoNatural(im)));
      c.fillStyle = patron;
    } else c.fillStyle = '#4c463e';
    c.fillRect(x, y, w, h);
    // La cara se oscurece hacia el pie y se aclara en el filo.
    const gr = c.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, 'rgba(255,240,210,0.18)');
    gr.addColorStop(0.08, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = gr;
    c.fillRect(x, y, w, h);
    c.restore();
  };
  const trazarSendas = () => trazar(c, e, T);
  /**
   * Quita de una máscara de agua los vados (`Escena.vados`) a `ancho` casillas:
   * la senda que sale de un estribo llega al puente por tierra, y no se hunde
   * bajo el agua que se pinta después de ella.
   */
  const secar = (capa: Lienzo, ancho: number): Lienzo => {
    if (e.vados.length === 0) return capa;
    const g = contexto(capa);
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.filter = `blur(${T * 0.08}px)`;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = ancho * T;
    g.strokeStyle = '#000';
    g.beginPath();
    for (const [p0, ...resto] of e.vados) {
      if (p0 === undefined) continue;
      g.moveTo(p0[0] * T, p0[1] * T);
      for (const [x, y] of resto) g.lineTo(x * T, y * T);
    }
    g.stroke();
    g.restore();
    return capa;
  };
  const agua = new Set(e.agua);
  const aguaHonda = (i: number) => agua.has(i) && [1, -1, e.W, -e.W].every((d) => agua.has(i + d));

  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (silueta) {
    // En la silueta cuenta como cubierto lo que tapa el suelo desnudo. El
    // pasillo entero cuenta como cubierto: está despejado a propósito, y así
    // `sueloDesnudo` mide lo desnudo FUERA de él, que es lo que se compara.
    c.fillStyle = '#fff';
    c.strokeStyle = '#fff';
    c.lineWidth = 2 * SEMIANCHO_DEL_PASILLO * T;
    trazarSendas();
    c.stroke();
    for (const i of e.agua) c.fillRect((i % e.W) * T, Math.floor(i / e.W) * T, T, T);
  } else {
    // 1 · El suelo: cada suelo con su alfa (`fronterasDelSuelo`), que corta la
    //     frontera con ruido y la altura de las texturas.
    c.fillStyle = PIGMENTO.dirt as string;
    c.fillRect(0, 0, e.W * T, e.H * T);
    const fr = fronterasDelSuelo(e, (s) => alturaDeTextura(o.imagen(`suelos/${s}.webp`), nuevo));
    // El pigmento de cada punto con las mismas fronteras: el del arcén. Con el
    // de la casilla, donde la nieve se metía en la tierra el arcén la teñía de pardo.
    const { lienzo: pigmentos, c: gp } = lienzoCon(fr.ancho, fr.alto, nuevo);
    fr.suelos.forEach((s, k) => {
      const { lienzo: chico, c: g } = lienzoCon(fr.ancho, fr.alto, nuevo);
      const d = g.createImageData(fr.ancho, fr.alto);
      const alfa = fr.alfas[k] as Uint8ClampedArray;
      // Las casillas donde algo de este suelo se ve: solo a ellas van sus parches.
      const seVeEn = new Uint8Array(e.W * e.H);
      for (let p = 0; p < alfa.length; p++) {
        d.data[p * 4 + 3] = alfa[p] as number;
        if (alfa[p] !== 0)
          seVeEn[
            Math.floor(Math.floor(p / fr.ancho) / PX_DE_LAS_FRONTERAS) * e.W +
              Math.floor((p % fr.ancho) / PX_DE_LAS_FRONTERAS)
          ] = 1;
      }
      g.putImageData(d, 0, 0);
      const { lienzo: capa, c: gc } = lienzoCon(e.W * T, e.H * T, nuevo);
      gc.imageSmoothingEnabled = true;
      gc.imageSmoothingQuality = 'medium';
      gc.drawImage(chico, 0, 0, e.W * T, e.H * T);
      c.filter = VIVEZA[s] ?? 'none';
      c.drawImage(
        rellenar(
          capa,
          `suelos/${s}.webp`,
          pigmento(s),
          CASILLAS_POR_TEXTURA,
          s,
          (i) => seVeEn[i] === 1,
          // El alfa se amplía con suavizado: medio píxel suyo de holgura.
          1 / PX_DE_LAS_FRONTERAS,
        ),
        0,
        0,
      );
      c.filter = 'none';
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = pigmento(s);
      g.fillRect(0, 0, fr.ancho, fr.alto);
      gp.drawImage(chico, 0, 0);
    });
    // 2 · La sombra de cada nivel: lo bajo, más oscuro.
    for (const n of [-1, 0, 1]) {
      const capa = mascara((i) => e.nivel[i] === n, T * 0.3);
      const g = contexto(capa);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = `rgba(0,0,0,${0.12 * (2 - n)})`;
      g.fillRect(0, 0, capa.width, capa.height);
      c.drawImage(capa, 0, 0);
    }
    // 2b · El arcén: el pasillo despejado, con el color de su suelo encima y el
    //      borde difuminado, para que lo despejado no se lea como un claro.
    c.globalAlpha = ALFA_DEL_ARCEN;
    c.imageSmoothingEnabled = true;
    c.drawImage(arcen(e, pigmentos, nuevo), 0, 0, e.W * T, e.H * T);
    c.globalAlpha = 1;
    // 3 · Las sendas y las trochas: tierra con textura y el borde roto (`huella.ts`).
    pintarHuellas(c, e, T, imagenLista(o.imagen(TEXTURA_DE_LA_HUELLA)), nuevo);
    // 4 · El agua: barro en la orilla y el agua encima, más oscura en el centro.
    c.drawImage(
      rellenar(
        secar(
          mascara((i) => agua.has(i), T * 0.55),
          ANCHO_DEL_VADO_EN_EL_BARRO,
        ),
        'texturas/barro.webp',
        '#3b3326',
        3,
        'barro',
        (i) => agua.has(i),
        1,
      ),
      0,
      0,
    );
    c.filter = FILTRO_DEL_AGUA;
    c.drawImage(
      rellenar(
        secar(
          mascara((i) => agua.has(i), T * 0.22),
          ANCHO_DEL_VADO,
        ),
        'texturas/agua.webp',
        '#24405a',
        3,
        'agua',
        (i) => agua.has(i),
        1,
      ),
      0,
      0,
    );
    c.filter = 'none';
    // La espuma de la orilla: el agua menos su interior, en blanco tenue.
    const espuma = secar(
      mascara((i) => agua.has(i), T * 0.12),
      ANCHO_DEL_VADO,
    );
    const ge = contexto(espuma);
    ge.globalCompositeOperation = 'source-in';
    ge.fillStyle = ESPUMA;
    ge.fillRect(0, 0, espuma.width, espuma.height);
    ge.globalCompositeOperation = 'destination-out';
    ge.drawImage(mascara(aguaHonda, T * 0.35), 0, 0);
    c.drawImage(espuma, 0, 0);
    const hondo = mascara(aguaHonda, T * 0.5);
    const gh = contexto(hondo);
    gh.globalCompositeOperation = 'source-in';
    gh.fillStyle = HONDO_DEL_AGUA;
    gh.fillRect(0, 0, hondo.width, hondo.height);
    c.drawImage(hondo, 0, 0);
    // 5 · Los cantos de las caídas al este y al oeste, difuminados.
    c.imageSmoothingEnabled = true;
    c.drawImage(cantos(e, nuevo), 0, 0, e.W * T, e.H * T);
    // 6 · Las sombras al pie de lo que tiene volumen: también de los volúmenes,
    //     que se pintan después, cada uno encima de la suya.
    for (const s of e.sprites) {
      if (!s.sombra || !seVe(s, o.objeto)) continue;
      const r = s.alto * T * 0.42;
      const gr = c.createRadialGradient(
        s.x * T + r * 0.3,
        s.y * T,
        0,
        s.x * T + r * 0.3,
        s.y * T,
        r,
      );
      gr.addColorStop(0, 'rgba(0,0,0,0.38)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr;
      c.fillRect(s.x * T - r, s.y * T - r, 2.3 * r, 2 * r);
    }
  }
  // 7 · En orden de profundidad: las caras de roca y lo plano.
  const orden: ({ y: number; cara: CaraDeEscena } | { y: number; s: Sprite })[] = [
    ...e.relieve.caras.map((f) => ({ y: f.y + 1 - 0.01, cara: f })),
    ...sep.planos.map((s) => ({ y: s.y, s })),
  ].sort((p, q) => p.y - q.y);
  for (const p of orden) 'cara' in p ? pintarCara(p.cara) : pintarSprite(c, p.s, o);
  // 8 · La luz y la niebla baja.
  if (!silueta && o.luces !== false)
    for (const l of e.luces) {
      const [r, g, b, al] = COLOR_DE_LUZ[l.clase];
      c.globalCompositeOperation = l.clase === 'niebla' ? 'screen' : 'lighter';
      const gr = c.createRadialGradient(l.x * T, l.y * T, 0, l.x * T, l.y * T, l.r * T);
      gr.addColorStop(0, `rgba(${r},${g},${b},${al})`);
      gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
      c.fillStyle = gr;
      // La niebla se tumba: más ancha que alta, como en la cámara a 25°.
      c.save();
      c.translate(l.x * T, l.y * T);
      c.scale(1, l.clase === 'niebla' ? 0.55 : 1);
      c.translate(-l.x * T, -l.y * T);
      c.fillRect((l.x - l.r) * T, (l.y - l.r) * T, 2 * l.r * T, 2 * l.r * T);
      c.restore();
    }
  c.restore();
}

/** Lo que se ve el arcén: más, y el pasillo se lee como una carretera ancha. */
const ALFA_DEL_ARCEN = 0.4;
/** El borde difuminado del arcén, en casillas. */
const DESENFOQUE_DEL_ARCEN = 0.15;
/**
 * Los píxeles por casilla a los que se pinta el arcén antes de ampliarlo: es
 * borroso y casi transparente, y a esta resolución no se distingue del pintado
 * a la del suelo.
 */
const PX_DEL_ARCEN = 16;

const NEGRO = [0, 0, 0] as const;

/** Las sendas como un camino del lienzo, a `T` píxeles por casilla. */
function trazar(g: Contexto, e: Escena, T: number): void {
  g.beginPath();
  for (const l of e.sendas) {
    const [p0, ...resto] = l;
    if (p0 === undefined) continue;
    g.moveTo(p0[0] * T, p0[1] * T);
    for (const [x, y] of resto) g.lineTo(x * T, y * T);
  }
}

/**
 * Un lienzo de una casilla por píxel con el color que dé `color` para cada una
 * (transparente si da null): ampliado con suavizado, los colores se funden de
 * casilla a casilla.
 */
function campoPorCasilla(
  e: Escena,
  nuevo: NuevoLienzo,
  color: (i: number) => readonly [number, number, number] | null,
): Lienzo {
  const { lienzo, c } = lienzoCon(e.W, e.H, nuevo);
  const d = c.createImageData(e.W, e.H);
  for (let i = 0; i < e.W * e.H; i++) {
    const rgb = color(i);
    if (rgb === null) continue;
    d.data[i * 4] = rgb[0];
    d.data[i * 4 + 1] = rgb[1];
    d.data[i * 4 + 2] = rgb[2];
    d.data[i * 4 + 3] = 255;
  }
  c.putImageData(d, 0, 0);
  return lienzo;
}

/**
 * El arcén, a `PX_DEL_ARCEN` por casilla: el trazo de las sendas al ancho del
 * pasillo, difuminado, relleno de `pigmentos` (el del suelo de cada punto, con
 * las fronteras del suelo). No pide imágenes: el pintor del suelo lo pinta igual
 * en el Worker.
 */
function arcen(e: Escena, pigmentos: Lienzo, nuevo: NuevoLienzo): Lienzo {
  const k = PX_DEL_ARCEN;
  const { lienzo, c: g } = lienzoCon(e.W * k, e.H * k, nuevo);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = '#000';
  g.lineWidth = 2 * SEMIANCHO_DEL_PASILLO * k;
  g.filter = `blur(${DESENFOQUE_DEL_ARCEN * k}px)`;
  trazar(g, e, k);
  g.stroke();
  g.filter = 'none';
  g.globalCompositeOperation = 'source-in';
  g.imageSmoothingEnabled = true;
  g.drawImage(pigmentos, 0, 0, e.W * k, e.H * k);
  g.globalCompositeOperation = 'source-over';
  return lienzo;
}

/** Lo que mide hacia lo bajo la franja oscura de una espalda, en casillas: la de los cantos. */
const ANCHO_DE_LA_ESPALDA = 0.35;
/** El borde difuminado de los cantos, en casillas. */
const DESENFOQUE_DE_LOS_CANTOS = 0.15;
/** Los píxeles por casilla de los cantos antes de ampliarlos: como el arcén, borrosos. */
const PX_DE_LOS_CANTOS = 16;

/**
 * Los cantos de las caídas al este y al oeste: una franja oscura de 0,35
 * casillas al pie de cada una, desde el filo hacia lo bajo.
 *
 * Se pintaban de una en una, en nítido, encima del suelo: el filo era una raya
 * recta en el borde de la casilla y cada franja acababa en seco arriba y abajo.
 * Una hondonada de 2×3 casillas salía como un rectángulo dibujado, y el agua
 * encajada, como un estanque de bordes rectos, mientras que el nivel y el agua
 * de debajo se funden por máscaras borrosas. Las rocas al pie lo tapaban; al
 * apartarlas del camino quedó a la vista (QA de los caminos, 05-10-2026). Ahora
 * se pintan todas en un lienzo pequeño y el lienzo entero se difumina de una
 * vez: dos franjas seguidas no dejan costura donde se tocan, y la columna acaba
 * en un degradado.
 */
function cantos(e: Escena, nuevo: NuevoLienzo): Lienzo {
  const k = PX_DE_LOS_CANTOS;
  const { lienzo: nitido, c: n } = lienzoCon(e.W * k, e.H * k, nuevo);
  for (const [x, y, lado] of e.relieve.cantos) {
    const gx = lado === 'este' ? (x + 1) * k : x * k;
    const gr = n.createLinearGradient(gx, 0, gx + (lado === 'este' ? 0.35 : -0.35) * k, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.45)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    n.fillStyle = gr;
    n.fillRect(lado === 'este' ? gx : gx - 0.35 * k, y * k, 0.35 * k, k);
  }
  // Y la espalda (#212): la casilla más alta que la de su norte, de la que la
  // cámara no ve la caída, lleva la misma franja hacia lo bajo, al norte. Sin
  // ella el borde norte de una meseta era un cambio de color, y la elevación
  // acababa de repente donde la ladera doblaba (s1 (0-8, 9-10)).
  for (const [x, y] of e.relieve.rebordes) {
    const gy = y * k;
    const gr = n.createLinearGradient(0, gy, 0, gy - ANCHO_DE_LA_ESPALDA * k);
    gr.addColorStop(0, 'rgba(0,0,0,0.45)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    n.fillStyle = gr;
    n.fillRect(x * k, gy - ANCHO_DE_LA_ESPALDA * k, k, ANCHO_DE_LA_ESPALDA * k);
  }
  const { lienzo, c: g } = lienzoCon(e.W * k, e.H * k, nuevo);
  g.filter = `blur(${DESENFOQUE_DE_LOS_CANTOS * k}px)`;
  g.drawImage(nitido, 0, 0);
  g.filter = 'none';
  return lienzo;
}

/**
 * Si un parche centrado en `(x, y)` casillas llega a alguna casilla donde
 * `cubre`, con `alcance` casillas de holgura: los demás no se estampan, que a
 * 120 px cada uno son 360² píxeles por textura.
 */
function llegaA(
  e: Escena,
  x: number,
  y: number,
  alcance: number,
  cubre: (i: number) => boolean,
): boolean {
  const r = RADIO_DEL_PARCHE + alcance;
  for (let j = Math.max(0, Math.floor(y - r)); j <= Math.min(e.H - 1, Math.floor(y + r)); j++)
    for (let i = Math.max(0, Math.floor(x - r)); i <= Math.min(e.W - 1, Math.floor(x + r)); i++)
      if (cubre(j * e.W + i)) return true;
  return false;
}

/**
 * Estampa en `g` los parches de `encaje` que pasan `estampar`, en su orden. Cada
 * trozo de la textura (`Variante`) es una estampa de `D × D` píxeles —el patrón
 * con su desplazamiento y su espejo, recortado por el peso del parche
 * (`pesoDelParche`)— que se hace la primera vez que hace falta y se suelta al
 * acabar la textura. Va a píxel entero: con un desplazamiento fraccionario, el
 * navegador remuestrea la estampa y el parche sale más borroso que el fondo.
 */
function estamparParches(
  g: Contexto,
  im: Imagen,
  encaje: Encaje,
  T: number,
  estampar: (p: { readonly x: number; readonly y: number }) => boolean,
  nuevo: NuevoLienzo,
): void {
  const D = Math.ceil(2 * RADIO_DEL_PARCHE * T);
  const N = anchoNatural(im);
  const escala = (encaje.casillasPorTextura * T) / N;
  let mascara: Lienzo | undefined;
  const estampas = new Map<number, Lienzo>();
  const estampa = (k: number): Lienzo => {
    const hecha = estampas.get(k);
    if (hecha !== undefined) return hecha;
    mascara ??= mascaraDelParche(D, T, nuevo);
    const va = encaje.variantes[k] as Variante;
    const { lienzo, c } = lienzoCon(D, D, nuevo);
    const patron = c.createPattern(im, 'repeat');
    if (patron === null)
      throw new Error('el pintor del suelo no pudo hacer el patrón de un parche');
    patron.setTransform(
      new DOMMatrix()
        .translate(D / 2, D / 2)
        .scale(va.espejo ? -1 : 1, 1)
        .scale(escala)
        .translate(-va.u * N, -va.v * N),
    );
    c.fillStyle = patron;
    c.fillRect(0, 0, D, D);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(mascara, 0, 0);
    estampas.set(k, lienzo);
    return lienzo;
  };
  for (const p of encaje.parches)
    if (estampar(p))
      g.drawImage(estampa(p.variante), Math.round(p.x * T - D / 2), Math.round(p.y * T - D / 2));
}

/** El peso del parche (`pesoDelParche`) en el alfa de un lienzo de `D × D`, a `T` px por casilla. */
function mascaraDelParche(D: number, T: number, nuevo: NuevoLienzo): Lienzo {
  const { lienzo, c } = lienzoCon(D, D, nuevo);
  const datos = c.createImageData(D, D);
  for (let y = 0; y < D; y++)
    for (let x = 0; x < D; x++)
      datos.data[(y * D + x) * 4 + 3] = Math.round(
        255 * pesoDelParche((x + 0.5 - D / 2) / T, (y + 0.5 - D / 2) / T),
      );
  c.putImageData(datos, 0, 0);
  return lienzo;
}

/**
 * La luminancia de la textura de un suelo, a `CASILLAS_POR_TEXTURA ×
 * PX_DE_LAS_FRONTERAS` muestras por lado: la altura con la que se reparte la
 * frontera. Sin la textura, nada: la frontera sale solo con el ruido.
 */
function alturaDeTextura(im: Imagen | undefined, nuevo: NuevoLienzo): AlturaDeSuelo | undefined {
  if (!lista(im)) return undefined;
  const lado = CASILLAS_POR_TEXTURA * PX_DE_LAS_FRONTERAS;
  const { c } = lienzoCon(lado, lado, nuevo);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(im, 0, 0, lado, lado);
  let datos: Uint8ClampedArray;
  try {
    datos = c.getImageData(0, 0, lado, lado).data;
  } catch (err) {
    // La página del taller abierta desde `file://`: la textura contamina el
    // lienzo y no se puede leer. Se pinta igual, y se dice.
    if (err instanceof DOMException && err.name === 'SecurityError') {
      if (!avisadoSinAltura)
        console.warn(
          'el suelo se pinta sin la altura de sus texturas: no se pueden leer (¿file://?)',
        );
      avisadoSinAltura = true;
      return undefined;
    }
    throw err;
  }
  const luz = new Float32Array(lado * lado);
  for (let i = 0; i < luz.length; i++)
    luz[i] =
      (0.2126 * (datos[i * 4] as number) +
        0.7152 * (datos[i * 4 + 1] as number) +
        0.0722 * (datos[i * 4 + 2] as number)) /
      255;
  return { lado, luz };
}
let avisadoSinAltura = false;

/**
 * La escena entera: el suelo y, encima, los volúmenes en su orden, con la MISMA
 * `separar` que usa el juego, así que el taller enseña exactamente lo que pinta
 * el juego (menos sus figuras). Después, las nubes del borde y la viñeta.
 */
export function pintarEscena(c: Contexto, e: Escena, o: OpcionesDePintura): void {
  const T = o.tile;
  const M = o.margen ?? 0;
  const sep = separar(e, {
    ...(o.umbral === undefined ? {} : { umbral: o.umbral }),
    ...(o.objeto === undefined ? {} : { objeto: o.objeto }),
  });
  c.save();
  c.translate(M, M);
  pintarSuelo(c, e, sep, o);
  for (const v of sep.volumenes) pintarSprite(c, v.s, o);
  // 9 · Las nubes del borde y la viñeta.
  if (o.silueta !== true && o.nubes !== false) {
    c.globalAlpha = 0.92;
    for (const s of e.sprites) if (s.capa === 1) pintarSprite(c, s, o);
    c.globalAlpha = 1;
  }
  c.restore();
  if (o.silueta !== true && o.vineta !== false) {
    const { ancho, alto } = tamanoDeEscena(e, T, M);
    const v = c.createRadialGradient(
      ancho / 2,
      alto / 2,
      alto * 0.35,
      ancho / 2,
      alto / 2,
      alto * 0.75,
    );
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.3)');
    c.fillStyle = v;
    c.fillRect(0, 0, ancho, alto);
  }
}

/**
 * La fracción del mapa donde solo se ve la textura del suelo: se pinta la
 * silueta y se cuentan los píxeles transparentes. Es la medida del taller.
 */
export function sueloDesnudo(e: Escena, o: Omit<OpcionesDePintura, 'silueta' | 'margen'>): number {
  const { lienzo: l, c } = lienzoCon(e.W * o.tile, e.H * o.tile, o.lienzo);
  pintarEscena(c, e, { ...o, margen: 0, silueta: true });
  const d = c.getImageData(0, 0, l.width, l.height).data;
  let desnudo = 0;
  for (let i = 3; i < d.length; i += 4) if ((d[i] as number) < 40) desnudo++;
  return desnudo / (d.length / 4);
}
