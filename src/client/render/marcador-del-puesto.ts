/**
 * El marcador de un puesto en el mapa (puesto fronterizo, fase 3, 04-11-2026): un
 * paso tomado enseña su obra, como pidió el usuario: «el puesto base muestre una
 * caseta en el mapa una vez alguien lo ha tomado, una torreta de madera si es una
 * empalizada o una torre si está amurallado». Con la bandera del dueño encima.
 *
 * **Dibujado por el juego**, con trazos de lienzo y no con arte: es lo que se ve
 * mientras no llega la imagen de la obra (la fase 4), o sin ella, porque el juego
 * se juega sin arte (cada nivel, un marcador distinto). Lo decide el mapa en cada
 * fotograma, y lo pinta a la escala de la obra que sustituye: cabe en lo que se
 * vería de ella (`escalaDelMarcador`).
 * Las tres siluetas se distinguen de lejos por la forma antes que por el color: la
 * caseta, ancha y baja con su tejado a dos aguas; la torreta, una caja de madera
 * en lo alto de sus patas; la torre, alta, gris y almenada.
 *
 * Puro de pintura: recibe dónde, cuánto mide una casilla y la caja de su obra, y
 * no sabe nada de la escena ni de la niebla. Dónde va y en qué orden lo dice la
 * pieza de la obra en la escena (`Sprite.deNodo`); qué obra, el objeto que se sabe
 * (`objetosConocidos`, con la que se vio por última vez); y la bandera, encima de
 * todo, en su punta (`altoDelMarcador`).
 */

import type { MejoraDelPuesto } from '@core/map/tipos.js';
import { pintarSombra } from './sombra.js';

/** El contorno de todo el marcador: oscuro, para que se lea sobre la nieve y sobre la roca. */
const CONTORNO = 'rgba(28, 20, 12, 0.9)';

/** Los colores de cada obra: madera clara y teja, madera de la torreta, piedra. */
const COLORES = {
  pared: '#c49a62',
  tejado: '#8a4a2a',
  puerta: '#3a2616',
  madera: '#8f5f30',
  patas: '#5e3c1c',
  piedra: '#a3a199',
  juntas: '#6e6c66',
  saetera: '#2a2622',
} as const;

/**
 * Cuánto mide cada marcador por encima de su suelo, en casillas del marcador: de
 * donde sale la bandera (`altoDelMarcador`). Distintos a propósito: la altura dice
 * la obra antes que el dibujo.
 */
const ALTO_DEL_MARCADOR: Readonly<Record<MejoraDelPuesto, number>> = {
  ninguna: 0.3,
  empalizada: 0.56,
  muralla: 0.62,
};

/**
 * Lo que mide cada marcador de ancho, de alero a alero o de pata a pata, en
 * casillas del marcador: con su alto, lo que tiene que caber en su obra.
 */
const ANCHO_DEL_MARCADOR: Readonly<Record<MejoraDelPuesto, number>> = {
  ninguna: 0.38,
  empalizada: 0.32,
  muralla: 0.29,
};

/** Lo que se ve de una obra, en casillas: de ancho y de su pie a lo alto. */
export interface CajaDeObra {
  readonly ancho: number;
  readonly alto: number;
}

/**
 * La escala del marcador de la obra `mejora` frente a la casilla: la mayor con la
 * que cabe en lo que se ve de su obra (`caja`), a la que sustituye.
 */
function escalaDelMarcador(mejora: MejoraDelPuesto, caja: CajaDeObra): number {
  return Math.min(caja.alto / ALTO_DEL_MARCADOR[mejora], caja.ancho / ANCHO_DEL_MARCADOR[mejora]);
}

/**
 * Lo que sube el marcador de la obra `mejora` a la escala de su obra, en
 * casillas: donde se planta la bandera del dueño.
 */
export function altoDelMarcador(mejora: MejoraDelPuesto, caja: CajaDeObra): number {
  return ALTO_DEL_MARCADOR[mejora] * escalaDelMarcador(mejora, caja);
}

/**
 * Pinta el marcador de la obra `mejora` con la base en (`x`, `suelo`), en píxeles,
 * con casillas de `tile` píxeles, a la escala de su obra (`caja`).
 */
export function pintarMarcadorDelPuesto(
  ctx: CanvasRenderingContext2D,
  x: number,
  suelo: number,
  tile: number,
  mejora: MejoraDelPuesto,
  caja: CajaDeObra,
): void {
  const k = escalaDelMarcador(mejora, caja);
  const t = (f: number): number => f * tile * k;
  // La sombra de toda figura sin imagen: el marcador está en el suelo, no flotando.
  pintarSombra(ctx, x, suelo, t(ALTO_DEL_MARCADOR[mejora]));
  ctx.save();
  ctx.lineWidth = Math.max(1, t(0.022));
  ctx.strokeStyle = CONTORNO;
  ctx.lineJoin = 'round';
  switch (mejora) {
    case 'ninguna':
      caseta(ctx, x, suelo, t);
      break;
    case 'empalizada':
      torreta(ctx, x, suelo, t);
      break;
    case 'muralla':
      torre(ctx, x, suelo, t);
      break;
  }
  ctx.restore();
}

/** Rellena y contornea el camino que ya se ha trazado. */
function rellenar(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();
}

/** La caseta: ancha y baja, pared clara, tejado a dos aguas y su puerta. */
function caseta(
  ctx: CanvasRenderingContext2D,
  x: number,
  suelo: number,
  t: (f: number) => number,
): void {
  const ancho = t(0.3);
  const pared = t(0.15);
  ctx.beginPath();
  ctx.rect(x - ancho / 2, suelo - pared, ancho, pared);
  rellenar(ctx, COLORES.pared);
  ctx.beginPath();
  ctx.moveTo(x - ancho / 2 - t(0.04), suelo - pared);
  ctx.lineTo(x, suelo - t(ALTO_DEL_MARCADOR.ninguna));
  ctx.lineTo(x + ancho / 2 + t(0.04), suelo - pared);
  ctx.closePath();
  rellenar(ctx, COLORES.tejado);
  ctx.fillStyle = COLORES.puerta;
  ctx.fillRect(x - t(0.035), suelo - t(0.1), t(0.07), t(0.1));
}

/** La torreta de madera: una caja con barandilla en lo alto de cuatro patas arriostradas. */
function torreta(
  ctx: CanvasRenderingContext2D,
  x: number,
  suelo: number,
  t: (f: number) => number,
): void {
  const pie = t(0.13);
  const plataforma = suelo - t(0.34);
  ctx.strokeStyle = COLORES.patas;
  ctx.lineWidth = Math.max(1.5, t(0.035));
  ctx.beginPath();
  // Las patas se abren hacia el suelo, y una cruz las arriostra.
  ctx.moveTo(x - t(0.09), plataforma);
  ctx.lineTo(x - pie, suelo);
  ctx.moveTo(x + t(0.09), plataforma);
  ctx.lineTo(x + pie, suelo);
  ctx.moveTo(x - t(0.1), plataforma + t(0.04));
  ctx.lineTo(x + t(0.12), suelo - t(0.04));
  ctx.moveTo(x + t(0.1), plataforma + t(0.04));
  ctx.lineTo(x - t(0.12), suelo - t(0.04));
  ctx.stroke();
  ctx.strokeStyle = CONTORNO;
  ctx.lineWidth = Math.max(1, t(0.022));
  // La caja de la guardia, con sus tablas y su tejadillo.
  const ancho = t(0.26);
  const alto = t(0.13);
  ctx.beginPath();
  ctx.rect(x - ancho / 2, plataforma - alto, ancho, alto);
  rellenar(ctx, COLORES.madera);
  ctx.beginPath();
  for (const f of [-0.045, 0.045]) {
    ctx.moveTo(x + t(f), plataforma - alto);
    ctx.lineTo(x + t(f), plataforma);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - ancho / 2 - t(0.03), plataforma - alto);
  ctx.lineTo(x, suelo - t(ALTO_DEL_MARCADOR.empalizada));
  ctx.lineTo(x + ancho / 2 + t(0.03), plataforma - alto);
  ctx.closePath();
  rellenar(ctx, COLORES.tejado);
}

/** La torre: alta, de piedra gris con hiladas, almenada y con una saetera. */
function torre(
  ctx: CanvasRenderingContext2D,
  x: number,
  suelo: number,
  t: (f: number) => number,
): void {
  const ancho = t(0.24);
  const almena = t(0.07);
  const cuerpo = t(ALTO_DEL_MARCADOR.muralla) - almena;
  const arriba = suelo - cuerpo;
  ctx.beginPath();
  // Un poco más ancha al pie: el talud de una torre.
  ctx.moveTo(x - ancho / 2 - t(0.025), suelo);
  ctx.lineTo(x - ancho / 2, arriba);
  ctx.lineTo(x + ancho / 2, arriba);
  ctx.lineTo(x + ancho / 2 + t(0.025), suelo);
  ctx.closePath();
  rellenar(ctx, COLORES.piedra);
  // Tres merlones sobre el adarve.
  const merlon = ancho / 5;
  ctx.beginPath();
  for (const k of [0, 2, 4]) ctx.rect(x - ancho / 2 + k * merlon, arriba - almena, merlon, almena);
  rellenar(ctx, COLORES.piedra);
  ctx.strokeStyle = COLORES.juntas;
  ctx.lineWidth = Math.max(1, t(0.015));
  ctx.beginPath();
  for (const f of [0.14, 0.28, 0.42]) {
    ctx.moveTo(x - ancho / 2 + t(0.01), suelo - t(f));
    ctx.lineTo(x + ancho / 2 - t(0.01), suelo - t(f));
  }
  ctx.stroke();
  ctx.fillStyle = COLORES.saetera;
  ctx.fillRect(x - t(0.015), arriba + t(0.06), t(0.03), t(0.11));
}
