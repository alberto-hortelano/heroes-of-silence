/**
 * Pintar una escena (`componer`) en un canvas cualquiera. Es lo que importaría
 * el juego: no crea páginas, no mide y no sabe de dónde salen las imágenes;
 * recibe un `imagen(src)` que devuelve la ya cargada, o nada, y entonces pinta
 * el marcador de color de esa pieza (el juego se juega sin arte).
 *
 * Capas, de abajo arriba:
 *   1. el suelo de cada región, fundido con el de al lado por una máscara borrosa;
 *   2. la sombra de cada nivel (lo bajo, más oscuro);
 *   3. las sendas;
 *   4. el agua, con su barro y su espuma;
 *   5. los cantos de las caídas al este y al oeste;
 *   6. la sombra al pie de lo que tiene volumen;
 *   7. por orden de y, las caras de roca y los sprites;
 *   8. la luz y la niebla baja;
 *   9. las nubes del borde y la viñeta (las dos, opcionales).
 *
 * Todo en píxeles de un mapa de `tile` por casilla, desplazado `margen` píxeles
 * (el sitio de las nubes): con `margen: 0` la casilla (x, y) empieza en
 * (x·tile, y·tile).
 *
 * Es caro —miles de sprites y una docena de máscaras desenfocadas—: se pinta una
 * vez por mapa en una superficie aparte y se copia, no en cada fotograma.
 */

import type { Escena, Luz, Sprite } from './colocar.js';
import type { Cara } from './relieve.js';

/** Lo que el pintor acepta como imagen: cargada (`<img>`) o ya pintada (`<canvas>`). */
export type Imagen = HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap;
type Lienzo = HTMLCanvasElement | OffscreenCanvas;
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

/** Todas las imágenes que puede pedir la escena: para cargarlas antes de pintar. */
export function imagenesDeEscena(e: Escena): string[] {
  const fuera = new Set<string>();
  for (const s of new Set(e.suelo)) fuera.add(`suelos/${s}.webp`);
  for (const t of TEXTURAS) fuera.add(`texturas/${t}.webp`);
  for (const s of e.sprites) if (s.src !== null) fuera.add(s.src);
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

/**
 * Las copias entonadas: un filtro de canvas por sprite es lentísimo en Chromium
 * (miles de piedras), así que cada imagen se entona una vez por tono. Se guarda
 * por imagen, así que dura lo que dure la imagen.
 */
const entonadas = new WeakMap<Imagen, Map<string, Lienzo>>();

export function pintarEscena(c: Contexto, e: Escena, o: OpcionesDePintura): void {
  const T = o.tile;
  const M = o.margen ?? 0;
  const nuevo = o.lienzo ?? lienzoPorDefecto;
  const silueta = o.silueta === true;
  const seVe = (s: Sprite) =>
    s.objeto === undefined || o.objeto === undefined || o.objeto(s.objeto);

  const mascara = (pred: (i: number) => boolean, desenfoque: number): Lienzo => {
    const chico = nuevo(e.W, e.H);
    const cc = contexto(chico);
    const d = cc.createImageData(e.W, e.H);
    for (let i = 0; i < e.W * e.H; i++) if (pred(i)) d.data[i * 4 + 3] = 255;
    cc.putImageData(d, 0, 0);
    const grande = nuevo(e.W * T, e.H * T);
    const g = contexto(grande);
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
  const entonada = (im: Imagen, tono: string): Imagen | Lienzo => {
    let porTono = entonadas.get(im);
    if (porTono === undefined) {
      porTono = new Map();
      entonadas.set(im, porTono);
    }
    let copia = porTono.get(tono);
    if (copia === undefined) {
      copia = nuevo(anchoNatural(im), altoNatural(im));
      const g = contexto(copia);
      g.filter = tono;
      g.drawImage(im, 0, 0);
      porTono.set(tono, copia);
    }
    return copia;
  };
  const pintarSprite = (s: Sprite) => {
    const original = s.src === null ? undefined : o.imagen(s.src);
    const k = (s.alto * T) / s.nh;
    if (lista(original)) {
      const im = s.tono !== undefined && !silueta ? entonada(original, s.tono) : original;
      const dx = s.x * T - s.ax * k;
      const dy = s.y * T - s.ay * k;
      if (s.recorte !== undefined) {
        const [sx, sy, sw, sh] = s.recorte;
        c.drawImage(im, sx, sy, sw, sh, dx, dy, s.nw * k, s.nh * k);
      } else c.drawImage(im, dx, dy, s.nw * k, s.nh * k);
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
  c.translate(M, M);
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
    // 6 · Las sombras al pie de lo que tiene volumen.
    for (const s of e.sprites) {
      if (!s.sombra || !seVe(s)) continue;
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
  // 7 · En orden de profundidad: las caras de roca y los sprites.
  const orden: ({ y: number; cara: Cara } | { y: number; s: Sprite })[] = [
    ...e.relieve.caras.map((f) => ({ y: f.y + 1 - 0.01, cara: f })),
    ...e.sprites.filter((s) => s.capa === 0 && seVe(s)).map((s) => ({ y: s.y, s })),
  ].sort((p, q) => p.y - q.y);
  for (const p of orden) 'cara' in p ? pintarCara(p.cara) : pintarSprite(p.s);
  c.restore();
  if (silueta) return;

  // 8 · La luz y la niebla baja.
  c.save();
  c.translate(M, M);
  if (o.luces !== false)
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
  c.globalCompositeOperation = 'source-over';
  // 9 · Las nubes del borde y la viñeta.
  if (o.nubes !== false) {
    c.globalAlpha = 0.92;
    for (const s of e.sprites) if (s.capa === 1) pintarSprite(s);
    c.globalAlpha = 1;
  }
  c.restore();
  if (o.vineta !== false) {
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
  const nuevo = o.lienzo ?? lienzoPorDefecto;
  const l = nuevo(e.W * o.tile, e.H * o.tile);
  const c = contexto(l);
  pintarEscena(c, e, { ...o, margen: 0, silueta: true });
  const d = c.getImageData(0, 0, l.width, l.height).data;
  let desnudo = 0;
  for (let i = 3; i < d.length; i += 4) if ((d[i] as number) < 40) desnudo++;
  return desnudo / (d.length / 4);
}
