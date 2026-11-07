/**
 * La muralla del tablero de batalla con su arte (06-11-2026): las caras, la
 * tapa, las portadas y la escalera pintadas por el taller
 * (`tools/taller/muralla-de-batalla.ts`), llevadas a su sitio con una afín. Las
 * medidas y los nombres son los de `shared/muralla-de-batalla.ts`; las cajas de
 * cada imagen, las del índice derivado (`assets/batalla/muralla/indice.json`).
 *
 * Cada función devuelve `false` si su imagen no ha llegado (o no hay): quien la
 * llama (`muralla-pintada.ts`) pinta entonces su marcador, como siempre.
 */

import type { MaterialDeMuralla } from '@core/battle/types.js';
import indiceJson from '../../../../assets/batalla/muralla/indice.json' with { type: 'json' };
import {
  ALTO_DE_MURALLA,
  CARPETA_DE_LA_MURALLA,
  ESCALERA,
  type IndiceDeLaMuralla,
  leerIndiceDeLaMuralla,
  type MedidaDePieza,
  PIEZA_DE_LA_ESCALERA,
  PIEZAS_DE_LA_MURALLA,
  PORTADA,
  RODAJAS_DE_LA_CARA,
} from '../../../shared/muralla-de-batalla.js';
import { asset, pedirArteDeLaMuralla } from '../assets.js';
import { copiaReducida } from '../copias.js';
import { densidadDe } from '../lienzo.js';
import type { Tablero } from '../proyeccion.js';

const INDICE: IndiceDeLaMuralla = leerIndiceDeLaMuralla(indiceJson);

/** Un punto del lienzo, en píxeles. */
interface Punto {
  readonly x: number;
  readonly y: number;
}

/**
 * Pide el arte de la muralla de `material` y la escalera (una vez: lo que ya se
 * pidió no se pide otra). Solo lo que el índice dice que está pintado: lo demás
 * se quedaría en un 404 dicho en consola.
 */
export function pedirElArteDe(material: MaterialDeMuralla): void {
  const p = PIEZAS_DE_LA_MURALLA[material];
  pedirArteDeLaMuralla(
    CARPETA_DE_LA_MURALLA,
    [p.cara, p.tapa, p.abierta, p.cerrada, PIEZA_DE_LA_ESCALERA].filter((n) => n in INDICE),
  );
}

/** La imagen de una pieza y sus medidas, si las dos están. */
function pieza(nombre: string): { img: HTMLImageElement; m: MedidaDePieza } | null {
  const m = INDICE[nombre];
  if (m === undefined) return null;
  const img = asset('muralla', nombre);
  return img === null ? null : { img, m };
}

/**
 * Una copia reducida de la pieza para pintarla a `escala` (píxeles de la copia
 * por píxel de la imagen, ≤ 1), con su escala de verdad. La escala va a
 * escalones de 1/32 para que el tamaño del lienzo no haga una copia por píxel.
 */
function reducida(
  nombre: string,
  img: HTMLImageElement,
  m: MedidaDePieza,
  escala: number,
  tono?: string,
): { lienzo: CanvasImageSource; k: number } {
  const k = Math.min(1, Math.ceil(escala * 32) / 32);
  if (k >= 1 && tono === undefined) return { lienzo: img, k: 1 };
  return {
    lienzo: copiaReducida(img, `muralla/${nombre}`, tono, m.ancho * k, m.alto * k),
    k,
  };
}

/**
 * Pinta el rectángulo `[sx, sy, sw, sh]` de la imagen sobre el paralelogramo de
 * pie `a`–`b` (en el lienzo) y `alto` píxeles de alto, en vertical: lo de arriba
 * de la imagen, arriba.
 */
function sobreElParalelogramo(
  ctx: CanvasRenderingContext2D,
  fuente: CanvasImageSource,
  [sx, sy, sw, sh]: readonly [number, number, number, number],
  a: Punto,
  b: Punto,
  alto: number,
): void {
  ctx.save();
  ctx.transform((b.x - a.x) / sw, (b.y - a.y) / sw, 0, alto / sh, a.x, a.y - alto);
  ctx.drawImage(fuente, sx, sy, sw, sh, 0, 0, sw, sh);
  ctx.restore();
}

/**
 * El tono de una cara a la sombra: la que mira al sureste, porque la luz viene
 * de la izquierda (`ARTE.luz`). Va en la copia (`copiaReducida`), una vez, y no
 * como un velo encima: un velo oscurecería también los vanos del remate.
 */
const A_LA_SOMBRA = 'brightness(0.62) saturate(0.9)';
/** El remate de una arista de atrás, que se ve por dentro: algo más oscuro que el de delante. */
const POR_DENTRO = 'brightness(0.78)';

/** La cara de `material`: la imagen, sus medidas y cuánto mide en pasos su remate. */
export interface CaraConArte {
  readonly nombre: string;
  readonly img: HTMLImageElement;
  readonly m: MedidaDePieza;
  /** La fila donde empieza el lienzo (lo de encima es el remate). */
  readonly cuerpo: number;
  /** Lo que sube el remate, en pasos. */
  readonly remate: number;
}

/** La cara pintada de `material`, o `null` si no ha llegado: entonces, el marcador. */
export function caraDe(material: MaterialDeMuralla): CaraConArte | null {
  const nombre = PIEZAS_DE_LA_MURALLA[material].cara;
  const p = pieza(nombre);
  if (p === null || p.m.cuerpo === undefined) return null;
  const [, y0, , y1] = p.m.caja;
  const cuerpo = p.m.cuerpo;
  return { nombre, ...p, cuerpo, remate: ((cuerpo - y0) / (y1 - cuerpo)) * ALTO_DE_MURALLA };
}

/** La rodaja `r` de la cara: su columna de la imagen, de la fila `desde` a la `hasta`. */
function rodaja(c: CaraConArte, r: number, desde: number, hasta: number, k: number) {
  const [x0, , x1] = c.m.caja;
  const w = (x1 - x0) / RODAJAS_DE_LA_CARA;
  const i = ((r % RODAJAS_DE_LA_CARA) + RODAJAS_DE_LA_CARA) % RODAJAS_DE_LA_CARA;
  return [(x0 + i * w) * k, desde * k, w * k, (hasta - desde) * k] as const;
}

/** La copia de la cara para un tablero, a la resolución de una cara en pantalla y con su `tono`. */
function copiaDeLaCara(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  c: CaraConArte,
  tono: string | undefined,
) {
  const [, , , y1] = c.m.caja;
  // El alto del lienzo de muro en pantalla, frente al de la imagen.
  const escala = (ALTO_DE_MURALLA * t.paso * densidadDe(ctx)) / (y1 - c.cuerpo);
  return reducida(c.nombre, c.img, c.m, escala, tono);
}

/**
 * Una cara de una columna, del pie `a` al `b` y `alto` de alto, con la rodaja
 * `r` del lienzo de muro; a la sombra, oscurecida.
 */
export function pintarCaraConArte(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  c: CaraConArte,
  a: Punto,
  b: Punto,
  alto: number,
  r: number,
  sombra: boolean,
): void {
  const { lienzo, k } = copiaDeLaCara(ctx, t, c, sombra ? A_LA_SOMBRA : undefined);
  sobreElParalelogramo(ctx, lienzo, rodaja(c, r, c.cuerpo, c.m.caja[3], k), a, b, alto);
}

/**
 * El remate de una cara que da fuera de la muralla, sobre su arista de lo alto
 * (`a`–`b`, ya subidas): las almenas o las puntas de la rodaja `r`. `detras`,
 * si es una arista de atrás: se ve por dentro, más oscuro.
 */
export function pintarRemateConArte(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  c: CaraConArte,
  a: Punto,
  b: Punto,
  r: number,
  detras: boolean,
  sombra: boolean,
): void {
  const tono = sombra ? A_LA_SOMBRA : detras ? POR_DENTRO : undefined;
  const { lienzo, k } = copiaDeLaCara(ctx, t, c, tono);
  const [, y0] = c.m.caja;
  sobreElParalelogramo(ctx, lienzo, rodaja(c, r, y0, c.cuerpo, k), a, b, c.remate * t.paso);
}

/** Lo que mide de lado, en pasos, la textura de la tapa en el suelo de lo alto. */
const LADO_DE_LA_TAPA = 1.1;

let patrones: { ctx: CanvasRenderingContext2D; clave: string; patron: CanvasPattern } | null = null;

/**
 * El relleno de la tapa de `material` para el tablero `t`, ya encajado: la
 * textura repetida en el mismo encaje para todas las columnas (las tapas
 * vecinas casan), aplastada como el suelo. Se usa con el lienzo ya subido a lo
 * alto (`translate(0, -alto)`), como el camino de la casilla. `null`, sin arte.
 */
export function rellenoDeLaTapa(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  material: MaterialDeMuralla,
): CanvasPattern | null {
  const nombre = PIEZAS_DE_LA_MURALLA[material].tapa;
  const p = pieza(nombre);
  if (p === null) return null;
  const lado = LADO_DE_LA_TAPA * t.paso;
  const { lienzo, k } = reducida(nombre, p.img, p.m, (lado * densidadDe(ctx)) / p.m.ancho);
  const clave = `${nombre}|${k}|${t.paso}|${t.compresion}|${t.origenX}|${t.origenY}`;
  if (patrones === null || patrones.ctx !== ctx || patrones.clave !== clave) {
    const patron = ctx.createPattern(lienzo, 'repeat');
    if (patron === null) return null;
    const s = lado / (p.m.ancho * k);
    patron.setTransform(new DOMMatrix([s, 0, 0, s * t.compresion, t.origenX, t.origenY]));
    patrones = { ctx, clave, patron };
  }
  return patrones.patron;
}

/**
 * El paso bajo el arco de una portada abierta, en el lienzo: el hueco sin las
 * dos hojas abatidas contra las jambas. Es lo que se recorta de su imagen: por
 * ahí se ve a quien pasa.
 */
function pasoDelArco(t: Tablero, pie: Punto): Path2D {
  const rx = PORTADA.hueco * t.paso;
  const ry = PORTADA.flecha * t.paso;
  const arranque = pie.y - (PORTADA.arco - PORTADA.flecha) * t.paso;
  const tope = rx - PORTADA.hojaAbierta * t.paso;
  const p = new Path2D();
  p.moveTo(pie.x - tope, pie.y);
  for (let i = 0; i <= 32; i++) {
    const th = Math.PI - (Math.PI * i) / 32;
    const x = Math.max(-tope, Math.min(tope, rx * Math.cos(th)));
    p.lineTo(pie.x + x, arranque - ry * Math.sin(th));
  }
  p.lineTo(pie.x + tope, pie.y);
  p.closePath();
  return p;
}

/**
 * La portada de una puerta con su imagen: su caja de lo opaco de jamba a jamba
 * de la fachada (`PORTADA.mitad`) y su pie en el suelo del lado de la puerta
 * (`pie`). Abierta, sin su paso (`pasoDelArco`). `false` si no ha llegado.
 */
export function pintarPortadaConArte(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  material: MaterialDeMuralla,
  pie: Punto,
  abierta: boolean,
): boolean {
  const p = PIEZAS_DE_LA_MURALLA[material];
  const nombre = abierta ? p.abierta : p.cerrada;
  const hay = pieza(nombre);
  if (hay === null) return false;
  const { img, m } = hay;
  const [x0, y0, x1, y1] = m.caja;
  const s = (2 * PORTADA.mitad * t.paso) / (x1 - x0);
  const { lienzo, k } = reducida(nombre, img, m, s * densidadDe(ctx));
  ctx.save();
  if (abierta) {
    const fuera = new Path2D();
    fuera.rect(pie.x - 2 * t.paso, pie.y - 4 * t.paso, 4 * t.paso, 4 * t.paso + 1);
    fuera.addPath(pasoDelArco(t, pie));
    ctx.clip(fuera, 'evenodd');
  }
  const w = (x1 - x0) * s;
  const h = (y1 - y0) * s;
  ctx.drawImage(
    lienzo,
    x0 * k,
    y0 * k,
    (x1 - x0) * k,
    (y1 - y0) * k,
    pie.x - w / 2,
    pie.y - h,
    w,
    h,
  );
  ctx.restore();
  return true;
}

/**
 * La escalera con su imagen, tendida del `abajo` (en el suelo) al `arriba`
 * (pasado lo alto del muro): sus largueros a lo largo, `ESCALERA.ancho` de uno a
 * otro. `false` si no ha llegado.
 */
export function pintarEscaleraConArte(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  abajo: Punto,
  arriba: Punto,
): boolean {
  const hay = pieza(PIEZA_DE_LA_ESCALERA);
  if (hay === null) return false;
  const { img, m } = hay;
  const [x0, y0, x1, y1] = m.caja;
  const dx = arriba.x - abajo.x;
  const dy = arriba.y - abajo.y;
  const largo = Math.max(1, Math.hypot(dx, dy));
  const u = { x: dx / largo, y: dy / largo };
  const n = { x: -u.y, y: u.x };
  // De larguero a larguero, por fuera: el ancho y el grueso de un larguero.
  const sx = ((ESCALERA.ancho + 0.06) * t.paso) / (x1 - x0);
  const sy = largo / (y1 - y0);
  const { lienzo, k } = reducida(PIEZA_DE_LA_ESCALERA, img, m, Math.max(sx, sy) * densidadDe(ctx));
  const cx = (x0 + x1) / 2;
  ctx.save();
  // De la imagen (ix, iy) al lienzo: abajo + (ix − cx)·sx·n + (y1 − iy)·sy·u.
  ctx.transform(
    (sx * n.x) / k,
    (sx * n.y) / k,
    (-sy * u.x) / k,
    (-sy * u.y) / k,
    abajo.x - cx * sx * n.x + y1 * sy * u.x,
    abajo.y - cx * sx * n.y + y1 * sy * u.y,
  );
  ctx.drawImage(
    lienzo,
    x0 * k,
    y0 * k,
    (x1 - x0) * k,
    (y1 - y0) * k,
    x0 * k,
    y0 * k,
    (x1 - x0) * k,
    (y1 - y0) * k,
  );
  ctx.restore();
  return true;
}
