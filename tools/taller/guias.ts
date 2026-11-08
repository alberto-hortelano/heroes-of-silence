/**
 * La guía de geometría de una pieza del mapa (`papel: 'guia'`): un volumen gris
 * dibujado con la proyección del mapa —el suelo en casillas cuadradas y lo alto
 * hacia arriba de pantalla, un nivel (`NIVEL`) = 0,6 casillas—, que dice al
 * modelo de imagen dónde va cada cosa. Se escriben en `DIR_GUIAS` (SVG → PNG con
 * sharp), con la geometría de cada una al lado, de la que se derivan el ancla y
 * la escala de lo pintado.
 *
 * La comparten los puentes (`paredes-puentes.ts`), las laderas, las diagonales,
 * las bajadas, las rampas, el muro de norte a sur, el recinto y los puestos, y la
 * lee `derivar.ts` (`esFondoDeGuia`). Vivía en `paredes-puentes.ts`, que importa
 * `derivar.ts`: el ciclo entre los dos se rompió sacándola aquí (H3 de la
 * reorganización, 08-11-2026).
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { textoJson } from '../comun/json.js';
import { RAIZ } from '../comun/raiz.js';

export const DIR_GUIAS = 'assets/mapa/_guias';

/** Lo que mide en pantalla un nivel de altura, en casillas (`ALTO_DE_NIVEL` del escenógrafo). */
export const NIVEL = 0.6;

// ------------------------------------------------------------------ la guía

export type P2 = readonly [number, number];
export type P3 = readonly [number, number, number];

/** Un lienzo de guía: casilla de `t` px y el origen del mundo en `(ox, oy)`. */
export class Guia {
  private readonly capas: string[] = [];
  /** La caja de lo dibujado, en píxeles: para encajar la guía en su lienzo (`encajar`). */
  readonly caja = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  constructor(
    readonly ancho: number,
    readonly alto: number,
    public t: number,
    /** El origen del mundo; una hoja de módulos lo mueve de celda en celda. */
    public ox: number,
    public oy: number,
  ) {}
  /** Lo que sube el terreno bajo un punto: un puente entre orillas a distinto nivel. */
  subida: (x: number, y: number) => number = () => 0;
  /** Entre qué alturas se reparte la subida: el pie no sube, el tablero sube entero. */
  rangoDeSubida: readonly [number, number] = [0, 1];
  /** La proyección del mapa: el suelo tal cual, lo alto hacia arriba. */
  p([x, y, z]: P3): P2 {
    const [z0, z1] = this.rangoDeSubida;
    const k = Math.min(1, Math.max(0, (z - z0) / (z1 - z0)));
    return [this.ox + x * this.t, this.oy + (y - z - k * this.subida(x, y)) * this.t];
  }
  private medir(x: number, y: number): void {
    this.caja.x0 = Math.min(this.caja.x0, x);
    this.caja.y0 = Math.min(this.caja.y0, y);
    this.caja.x1 = Math.max(this.caja.x1, x);
    this.caja.y1 = Math.max(this.caja.y1, y);
  }
  poligono(puntos: readonly P3[], relleno: string): void {
    const pp = puntos.map((q) => this.p(q));
    for (const [x, y] of pp) this.medir(x, y);
    const d = pp.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' ');
    this.capas.push(
      `<polygon points="${d}" fill="${relleno}" stroke="#262626" stroke-width="2" stroke-linejoin="round"/>`,
    );
  }
  elipse(c: P3, rx: number, ry: number, relleno: string): void {
    const [x, y] = this.p(c);
    this.medir(x - rx * this.t, y - ry * this.t);
    this.medir(x + rx * this.t, y + ry * this.t);
    this.capas.push(
      `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(rx * this.t).toFixed(1)}" ry="${(ry * this.t).toFixed(1)}" fill="${relleno}" stroke="#262626" stroke-width="2"/>`,
    );
  }
  svg(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.ancho}" height="${this.alto}"><rect width="100%" height="100%" fill="${FONDO}"/>${this.capas.join('')}</svg>`;
  }
}

/**
 * Dibuja dos veces: una a escala 1 para medir lo que ocupa, y otra con la
 * casilla y el origen que lo dejan centrado y ocupando el `lleno` del lienzo.
 */
export function encajar(
  ancho: number,
  alto: number,
  lleno: number,
  dibujar: (g: Guia) => void,
): Guia {
  const m = new Guia(ancho, alto, 1, 0, 0);
  dibujar(m);
  const w = m.caja.x1 - m.caja.x0;
  const h = m.caja.y1 - m.caja.y0;
  const t = Math.floor(Math.min((ancho * lleno) / w, (alto * lleno) / h));
  const g = new Guia(
    ancho,
    alto,
    t,
    ancho / 2 - ((m.caja.x0 + m.caja.x1) / 2) * t,
    alto / 2 - ((m.caja.y0 + m.caja.y1) / 2) * t,
  );
  dibujar(g);
  return g;
}

/**
 * Escribe la guía `nombre` en `assets/mapa/_guias/` (`<nombre>.png`) y su
 * geometría al lado (`<nombre>.json`: el lienzo y lo que se registre sobre ella),
 * y devuelve la ruta de la imagen. La de las laderas, las diagonales, las
 * bajadas, el muro de norte a sur, el recinto y los puestos; los puentes llevan
 * además la caja medida en la imagen (`escribirGuias`).
 */
export async function escribirGuia(nombre: string, guia: Guia, geometria: object): Promise<string> {
  await writeFile(
    join(RAIZ, DIR_GUIAS, `${nombre}.png`),
    await sharp(Buffer.from(guia.svg())).png().toBuffer(),
  );
  await writeFile(
    join(RAIZ, DIR_GUIAS, `${nombre}.json`),
    textoJson({ ancho: guia.ancho, alto: guia.alto, ...geometria }, 1),
  );
  return `${DIR_GUIAS}/${nombre}.png`;
}

/** El gris de fondo de toda guía: lo demás es dibujo. */
export const FONDO = '#7d7d7d';
const gris = Number.parseInt(FONDO.slice(1, 3), 16);
/**
 * Si un píxel de una guía es fondo: a una distancia (suma por canal) de 6 o
 * menos del gris. El suavizado de los bordes deja píxeles a 5 o 6. Lo leen la
 * caja de una guía (`cajaDeGuia`) y su silueta (`mascaraDeGuia`): con dos
 * umbrales, cada una decía otra cosa del mismo borde.
 */
export function esFondoDeGuia(r: number, g: number, b: number): boolean {
  return Math.abs(r - gris) + Math.abs(g - gris) + Math.abs(b - gris) <= 6;
}
/** Lo que mira arriba, lo que mira a la cámara (iluminado), y lo que queda en sombra. */
export const ARRIBA = '#dcdcdc';
export const FRENTE = '#b0b0b0';
export const SOMBRA = '#5e5e5e';
export const MATAS = '#c9cfbf';
