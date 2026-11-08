/**
 * Lo que dice quién o qué está en cada casilla del mapa, encima de todo lo que tiene
 * altura y bajo la niebla (`pintarIdentificador`): la inicial del héroe, a un lado de su
 * cabeza si tapa a otra figura (`asientoDeLaInicial`), la chapa de cuántos son, el
 * estandarte del asaltante, la bandera del dueño de una ciudad o de un puesto, y la
 * marca de un sitio ocupado (`pintarOcupacion`). Era parte de `render/mapa/mapa.ts`
 * hasta la fase C de la reorganización (07-11-2026).
 */
import { individuosDe } from '@core/hero/troop.js';
import type { MapObject } from '@core/map/tipos.js';
import { temaDelLienzo } from '../../comun/temas.js';
import { cajaDeLaObra, type Obra } from '../escenario/puestos.js';
import { COLOR_SIN_DUEÑO, playerColor } from '../palette.js';
import { ALTO_DEL_GRUPO, estandarteDeAsaltante } from './asaltantes.js';
import { casillaAPixel, mundoAPixel } from './camara.js';
import { ALTO_DEL_HEROE, type Cosa } from './cosas.js';
import type { VistaMapa } from './mapa.js';
import { altoDelMarcador } from './marcador-del-puesto.js';
import type { SitioOcupado } from './sitios-sabidos.js';
import { conSuImagen } from './volumenes.js';

/** El cuerpo de una figura del mapa, en casillas: dónde pisa, su media anchura y su alto. */
export interface CuerpoDeFigura {
  readonly x: number;
  readonly pie: number;
  readonly semiancho: number;
  readonly alto: number;
}

/** Los cuerpos de las figuras que hay que respetar al poner una inicial: héroes y grupos sin dueño. */
export function cuerposDe(cosas: readonly Cosa[]): Map<Cosa, CuerpoDeFigura> {
  const cuerpos = new Map<Cosa, CuerpoDeFigura>();
  for (const c of cosas) {
    if (c.tipo === 'heroe')
      cuerpos.set(c, { x: c.pie.x, pie: c.pie.y, semiancho: 0.3, alto: ALTO_DEL_HEROE });
    // El grupo pisa a 0,32 bajo el centro de su casilla (`pintarAsaltante`, `pintarObjeto`).
    else if (c.tipo === 'asaltante')
      cuerpos.set(c, {
        x: c.en.x + 0.5,
        pie: c.en.y + 0.82,
        semiancho: 0.34,
        alto: ALTO_DEL_GRUPO,
      });
    else if (c.tipo === 'objeto' && c.objeto.kind === 'monster')
      cuerpos.set(c, {
        x: c.objeto.at.x + 0.5,
        pie: c.objeto.at.y + 0.82,
        semiancho: 0.34,
        alto: ALTO_DEL_GRUPO,
      });
  }
  return cuerpos;
}

/**
 * Lo que dice quién o qué está en la casilla de una cosa —la inicial del héroe,
 * la chapa de cuántos son, el estandarte del asaltante, la bandera del dueño—,
 * encima de todo lo que tiene altura y por debajo de la niebla.
 * El cuerpo puede quedar detrás de un árbol (decisión del usuario), pero lo que
 * dice que está ahí se ve siempre: un grupo escondido en un bosque sin que nada
 * lo diga es una emboscada que no se ve venir.
 */
export function pintarIdentificador(
  ctx: CanvasRenderingContext2D,
  v: VistaMapa,
  c: Cosa,
  cuerpos: ReadonlyMap<Cosa, CuerpoDeFigura>,
): void {
  const tile = v.camara.tile;
  switch (c.tipo) {
    case 'objeto': {
      if (c.objeto.kind !== 'monster') return;
      const p = casillaAPixel(v.camara, c.objeto.at);
      chapa(ctx, String(c.objeto.count), p.x + tile * 0.3, p.y + tile * 0.32, tile);
      return;
    }
    case 'horneado':
      pintarBanderaDeLoHorneado(ctx, v, c.objeto, c.asiento);
      return;
    case 'puesto': {
      // La bandera del dueño, plantada en lo alto de lo que se ve de su obra (la
      // cumbrera, la garita, el adarve, o la punta de su marcador); encima de
      // todo, como toda bandera, aunque el puesto quede detrás de un árbol.
      const p = mundoAPixel(v.camara, c.obra.x, c.obra.y);
      const punta = p.y - puntaDeLaObra(c.obra) * tile;
      // Desde el pie, que es lo que se apoya: 0,75 de casilla, y el mástil mide la mitad.
      bandera(ctx, p.x, punta - tile * 0.75 * 0.5, tile * 0.75, playerColor(c.nodo.owner));
      return;
    }
    case 'heroe': {
      const otros = [...cuerpos].filter(([o]) => o !== c).map(([, cuerpo]) => cuerpo);
      const en = asientoDeLaInicial(c.pie, otros, radioDeLaInicial(tile) / tile);
      const p = mundoAPixel(v.camara, en.x, en.y);
      const letra = c.heroe.name.charAt(0).toUpperCase();
      inicial(ctx, letra, p.x, p.y, tile, playerColor(c.heroe.owner));
      return;
    }
    case 'asaltante': {
      const p = mundoAPixel(v.camara, c.en.x + 0.5, c.en.y + 0.5);
      const cuantos = String(individuosDe(c.asaltante.troops));
      chapa(ctx, cuantos, p.x + tile * 0.3, p.y + tile * 0.32, tile);
      estandarteDeAsaltante(ctx, p.x - tile * 0.36, p.y - tile * 0.46, tile);
      return;
    }
  }
}

/**
 * Lo que sube lo que se ve de la obra de un puesto sobre su pie, en casillas: su
 * imagen sin el margen del recorte (`cajaDeLaObra`) o, sin ella, su marcador.
 */
function puntaDeLaObra(s: Obra): number {
  const [x0, y0, x1] = cajaDeLaObra(s);
  return conSuImagen(s)
    ? s.y - y0
    : altoDelMarcador(s.deNodo.cuando, { ancho: x1 - x0, alto: s.y - y0 });
}

/**
 * La bandera del dueño de la ciudad. La de un paso tomado va en lo alto de su
 * puesto (`pintarIdentificador`, cosa `puesto`), y el pueblo no lleva.
 */
function pintarBanderaDeLoHorneado(
  ctx: CanvasRenderingContext2D,
  v: VistaMapa,
  o: MapObject,
  asiento: readonly [number, number],
): void {
  const tile = v.camara.tile;
  const c = mundoAPixel(v.camara, ...asiento);
  switch (o.kind) {
    case 'town':
      bandera(ctx, c.x - tile * 0.55, c.y - tile * 1.05, tile, playerColor(o.owner));
      return;
    case 'node':
    case 'village':
      return;
    case 'chest':
    case 'monster':
    case 'lugar':
      throw new Error(`${o.kind} ${o.id} no se hornea en la escena: no lleva bandera`);
  }
}

/**
 * Dónde se prueba la inicial de un héroe, respecto a sus pies, en casillas: sobre
 * la cabeza (a 1,0 de los pies), y si ahí tapa a otra figura, a un lado de la
 * cabeza, primero el derecho.
 */
export const SITIOS_DE_LA_INICIAL: readonly (readonly [number, number])[] = [
  [0, -1.0],
  [0.45, -0.72],
  [-0.45, -0.72],
];

/** El radio del disco de la inicial, en píxeles: nunca menos de 8 para que la letra se lea. */
const radioDeLaInicial = (tile: number): number => Math.max(8, tile * 0.13);

/**
 * El centro de la inicial de un héroe que pisa en `pie`, en casillas: el primer
 * sitio de `SITIOS_DE_LA_INICIAL` cuyo disco (de `radio` casillas) no cae sobre
 * el cuerpo de otra figura. Con dos héroes en fila sobre un puente N-S, la «A»
 * del de delante caía sobre las piernas del de detrás y no se leía cuál estaba
 * en el puente (#166 H11). Si no hay sitio libre, sobre la cabeza: la inicial va
 * siempre, aunque tape.
 */
export function asientoDeLaInicial(
  pie: { readonly x: number; readonly y: number },
  otros: readonly CuerpoDeFigura[],
  radio: number,
): { x: number; y: number } {
  const tapa = (x: number, y: number) =>
    otros.some((o) => {
      // Del centro del disco al rectángulo del cuerpo: si cae dentro del radio, lo tapa.
      const dx = Math.max(o.x - o.semiancho - x, 0, x - (o.x + o.semiancho));
      const dy = Math.max(o.pie - o.alto - y, 0, y - o.pie);
      return dx * dx + dy * dy < radio * radio;
    });
  for (const [dx, dy] of SITIOS_DE_LA_INICIAL) {
    if (!tapa(pie.x + dx, pie.y + dy)) return { x: pie.x + dx, y: pie.y + dy };
  }
  const [dx, dy] = SITIOS_DE_LA_INICIAL[0] as readonly [number, number];
  return { x: pie.x + dx, y: pie.y + dy };
}

/** La inicial de un héroe en un disco del color de su dueño, sobre su cabeza. */
function inicial(
  ctx: CanvasRenderingContext2D,
  letra: string,
  x: number,
  y: number,
  tile: number,
  color: string,
): void {
  const r = radioDeLaInicial(tile);
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(20,17,13,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fbf6ea';
  ctx.font = `bold ${Math.round(r * 1.2)}px ${temaDelLienzo().letraUi}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letra, x, y + 0.5);
  ctx.restore();
}

/** El estandarte del dueño: un mástil con su color. */
function bandera(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tile: number,
  color: string,
): void {
  const alto = tile * 0.5;
  ctx.save();
  ctx.strokeStyle = '#2b2119';
  ctx.lineWidth = Math.max(1.5, tile * 0.03);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + alto);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + tile * 0.28, y + tile * 0.08);
  ctx.lineTo(x, y + tile * 0.17);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Una cifra en una chapa oscura: cuántos son en un grupo sin dueño. */
function chapa(
  ctx: CanvasRenderingContext2D,
  texto: string,
  x: number,
  y: number,
  tile: number,
): void {
  const alto = Math.max(14, tile * 0.24);
  const tema = temaDelLienzo();
  ctx.save();
  ctx.font = `bold ${Math.round(alto * 0.72)}px ${tema.letraUi}`;
  const ancho = ctx.measureText(texto).width + alto * 0.6;
  // El fondo del tema es opaco: la transparencia es de esta chapa, no del tema.
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = tema.chapaFondo;
  ctx.fillRect(x - ancho / 2, y - alto / 2, ancho, alto);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = tema.chapaBorde;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - ancho / 2 + 0.5, y - alto / 2 + 0.5, ancho - 1, alto - 1);
  ctx.fillStyle = tema.chapaTinta;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, x, y + 0.5);
  ctx.restore();
}

/**
 * La marca de un sitio ocupado (`ocupanteDe`): un escudo pequeño del color del
 * ocupante (gris, una guarnición neutral) con un aspa clara, en la esquina de
 * arriba a la izquierda de la casilla. Un marcador, sin arte nuevo (P2 de la
 * tarea 2: «sin arte»): lo que importa es que se lea que ese sitio no da nada.
 */
export function pintarOcupacion(
  ctx: CanvasRenderingContext2D,
  v: VistaMapa,
  s: SitioOcupado,
): void {
  const tile = v.camara.tile;
  const p = casillaAPixel(v.camara, s.at);
  const r = tile * 0.2;
  const x = p.x - tile * 0.32;
  const y = p.y - tile * 0.62;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - r, y - r);
  ctx.lineTo(x + r, y - r);
  ctx.lineTo(x + r, y + r * 0.2);
  ctx.quadraticCurveTo(x + r, y + r, x, y + r * 1.3);
  ctx.quadraticCurveTo(x - r, y + r, x - r, y + r * 0.2);
  ctx.closePath();
  ctx.fillStyle = s.por === null ? COLOR_SIN_DUEÑO : playerColor(s.por);
  ctx.fill();
  ctx.lineWidth = Math.max(1, tile * 0.03);
  ctx.strokeStyle = '#1b1410';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r * 0.5, y - r * 0.5);
  ctx.lineTo(x + r * 0.5, y + r * 0.6);
  ctx.moveTo(x + r * 0.5, y - r * 0.5);
  ctx.lineTo(x - r * 0.5, y + r * 0.6);
  ctx.strokeStyle = '#f5ecd8';
  ctx.lineWidth = Math.max(1, tile * 0.05);
  ctx.stroke();
  ctx.restore();
}
