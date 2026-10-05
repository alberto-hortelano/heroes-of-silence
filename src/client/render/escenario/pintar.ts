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
 *   1. el suelo de cada región, fundido con el de al lado por una máscara borrosa;
 *   2. la sombra de cada nivel (lo bajo, más oscuro);
 *   3. las sendas;
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

import type { Escena, Luz, Sprite } from './colocar.js';
import type { Cara } from './relieve.js';

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

/**
 * Las texturas aprobadas son oscuras y la referencia tiene praderas vivas: el
 * color se aviva al pintar, por suelo, sin tocar el arte.
 */
const VIVEZA: Readonly<Record<string, string>> = {
  grass: 'saturate(1.45) brightness(1.3)',
  dirt: 'saturate(1.2) brightness(1.15)',
  swamp: 'saturate(1.15) brightness(1.1)',
  sand: 'saturate(0.8) brightness(0.92)',
  snow: 'brightness(1.15)',
  lava: 'saturate(1.2) brightness(1.15)',
  rough: 'brightness(1.12)',
};

const COLOR_DE_LUZ: Readonly<Record<Luz['clase'], readonly [number, number, number, number]>> = {
  fuego: [255, 170, 80, 0.22],
  brasa: [255, 90, 30, 0.2],
  niebla: [210, 222, 228, 0.16],
};

const anchoNatural = (im: Imagen) => ('naturalWidth' in im ? im.naturalWidth : im.width);
const altoNatural = (im: Imagen) => ('naturalHeight' in im ? im.naturalHeight : im.height);
const lista = (im: Imagen | undefined): im is Imagen =>
  im !== undefined && anchoNatural(im) > 0 && (!('complete' in im) || im.complete);

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

/**
 * Parte la escena: cada sprite de la capa del suelo va a una sola lista, y las
 * nubes a ninguna. Lo que el filtro `objeto` deja fuera no va a ninguna (`seVe`).
 */
export function separar(
  e: Escena,
  o: Pick<OpcionesDePintura, 'umbral' | 'objeto'> = {},
): EscenaSeparada {
  const umbral = o.umbral ?? UMBRAL_DE_VOLUMEN;
  const planos: Sprite[] = [];
  const volumenes: Volumen[] = [];
  for (const s of e.sprites) {
    if (s.capa !== 0 || !seVe(s, o.objeto)) continue;
    if (SIEMPRE_VOLUMEN.has(s.clase) || s.alto > umbral) volumenes.push({ clave: s.y, s });
    else planos.push(s);
  }
  // `componer` ya los da por (capa, y, x); se ordena igual por si un día no.
  volumenes.sort((p, q) => p.clave - q.clave || p.s.x - q.s.x);
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
  const k = (s.alto * T) / s.nh;
  if (lista(original)) {
    const dx = s.x * T - s.ax * k;
    const dy = s.y * T - s.ay * k;
    const ancho = s.nw * k;
    const alto = s.nh * k;
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
    const { lienzo: chico, c: cc } = lienzoCon(e.W, e.H, nuevo);
    const d = cc.createImageData(e.W, e.H);
    for (let i = 0; i < e.W * e.H; i++) if (pred(i)) d.data[i * 4 + 3] = 255;
    cc.putImageData(d, 0, 0);
    const { lienzo: grande, c: g } = lienzoCon(e.W * T, e.H * T, nuevo);
    g.imageSmoothingEnabled = true;
    g.filter = `blur(${desenfoque}px)`;
    g.drawImage(chico, 0, 0, e.W * T, e.H * T);
    g.filter = 'none';
    return grande;
  };
  const rellenar = (capa: Lienzo, src: string, color: string, casillasPorTextura: number) => {
    const g = contexto(capa);
    g.globalCompositeOperation = 'source-in';
    const im = o.imagen(src);
    const patron = lista(im) ? g.createPattern(im, 'repeat') : null;
    if (patron !== null && im !== undefined) {
      patron.setTransform(new DOMMatrix().scale((casillasPorTextura * T) / anchoNatural(im)));
      g.fillStyle = patron;
    } else g.fillStyle = color;
    g.fillRect(0, 0, capa.width, capa.height);
    g.globalCompositeOperation = 'source-over';
    return capa;
  };
  const pintarCara = (f: Cara) => {
    const x = f.x0 * T;
    const y = (f.y + 1) * T;
    const w = (f.x1 - f.x0 + 1) * T;
    const h = f.caida * e.altoDeNivel * T;
    if (silueta) {
      c.fillStyle = '#fff';
      c.fillRect(x, y, w, h);
      return;
    }
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
  };
  const trazarSendas = () => {
    c.beginPath();
    for (const l of e.sendas) {
      const [p0, ...resto] = l;
      if (p0 === undefined) continue;
      c.moveTo(p0[0] * T, p0[1] * T);
      for (const [x, y] of resto) c.lineTo(x * T, y * T);
    }
  };
  const agua = new Set(e.agua);
  const aguaHonda = (i: number) => agua.has(i) && [1, -1, e.W, -e.W].every((d) => agua.has(i + d));

  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (silueta) {
    // En la silueta cuenta como cubierto lo que tapa el suelo desnudo.
    c.fillStyle = '#fff';
    c.strokeStyle = '#fff';
    c.lineWidth = 0.2 * T;
    trazarSendas();
    c.stroke();
    for (const i of e.agua) c.fillRect((i % e.W) * T, Math.floor(i / e.W) * T, T, T);
  } else {
    // 1 · El suelo: cada suelo con su máscara difuminada, así las regiones se funden.
    c.fillStyle = PIGMENTO.dirt as string;
    c.fillRect(0, 0, e.W * T, e.H * T);
    for (const s of new Set(e.suelo)) {
      const capa = mascara((i) => e.suelo[i] === s, T * 0.45);
      c.filter = VIVEZA[s] ?? 'none';
      c.drawImage(rellenar(capa, `suelos/${s}.webp`, PIGMENTO[s] ?? '#666', 4), 0, 0);
      c.filter = 'none';
    }
    // 2 · La sombra de cada nivel: lo bajo, más oscuro.
    for (const n of [-1, 0, 1]) {
      const capa = mascara((i) => e.nivel[i] === n, T * 0.3);
      const g = contexto(capa);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = `rgba(0,0,0,${0.12 * (2 - n)})`;
      g.fillRect(0, 0, capa.width, capa.height);
      c.drawImage(capa, 0, 0);
    }
    // 3 · Las sendas: finas, con orla oscura y huella clara.
    for (const [w, color] of [
      [0.2, 'rgba(30,22,15,0.45)'],
      [0.12, 'rgba(138,112,78,0.92)'],
      [0.05, 'rgba(176,150,108,0.55)'],
    ] as const) {
      c.strokeStyle = color;
      c.lineWidth = w * T;
      trazarSendas();
      c.stroke();
    }
    // 4 · El agua: barro en la orilla y el agua encima, más oscura en el centro.
    c.drawImage(
      rellenar(
        mascara((i) => agua.has(i), T * 0.55),
        'texturas/barro.webp',
        '#3b3326',
        3,
      ),
      0,
      0,
    );
    c.filter = 'saturate(1.3) brightness(1.45)';
    c.drawImage(
      rellenar(
        mascara((i) => agua.has(i), T * 0.22),
        'texturas/agua.webp',
        '#24405a',
        3,
      ),
      0,
      0,
    );
    c.filter = 'none';
    // La espuma de la orilla: el agua menos su interior, en blanco tenue.
    const espuma = mascara((i) => agua.has(i), T * 0.12);
    const ge = contexto(espuma);
    ge.globalCompositeOperation = 'source-in';
    ge.fillStyle = 'rgba(225,235,235,0.38)';
    ge.fillRect(0, 0, espuma.width, espuma.height);
    ge.globalCompositeOperation = 'destination-out';
    ge.drawImage(mascara(aguaHonda, T * 0.35), 0, 0);
    c.drawImage(espuma, 0, 0);
    const hondo = mascara(aguaHonda, T * 0.5);
    const gh = contexto(hondo);
    gh.globalCompositeOperation = 'source-in';
    gh.fillStyle = 'rgba(5,15,30,0.45)';
    gh.fillRect(0, 0, hondo.width, hondo.height);
    c.drawImage(hondo, 0, 0);
    // 5 · Los cantos de las caídas al este y al oeste.
    for (const [x, y, lado] of e.relieve.cantos) {
      const gx = lado === 'este' ? (x + 1) * T : x * T;
      const gr = c.createLinearGradient(gx, 0, gx + (lado === 'este' ? 0.35 : -0.35) * T, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0.45)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr;
      c.fillRect(lado === 'este' ? gx : gx - 0.35 * T, y * T, 0.35 * T, T);
    }
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
  const orden: ({ y: number; cara: Cara } | { y: number; s: Sprite })[] = [
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
