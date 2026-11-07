/**
 * El campo de detrás del tablero de batalla (`pintarFondo`): la imagen del campo con su
 * horizonte (`horizonteDelCampo`), el cielo del clima del sitio, las nubes bajas de la
 * lluvia y la tormenta y, de noche, la luna y las estrellas; compuesto una vez por
 * tamaño del lienzo. Era parte de `render/batalla.ts` hasta la fase C de la
 * reorganización (07-11-2026).
 */
import { createRng, hashDeTexto } from '@core/rng.js';
import { type ClimaDelSitio, DESPEJADO } from '@core/state/clima.js';
import { asset } from '../assets.js';
import { campoDeEscena, hornearElVelo } from '../clima/clima.js';
import { cieloDe, EFECTOS, type Receta } from '../clima/recetas.js';
import { densidadDe } from '../lienzo.js';
import type { Tablero } from '../proyeccion.js';

/**
 * El fondo compuesto una vez por tamaño de lienzo: el campo escalado y su
 * velo. Escalar la imagen entera del campo con suavizado era, con el mapa ya
 * cacheado, lo más caro de un fotograma de batalla, y no cambia mientras el
 * lienzo no cambie de tamaño.
 */
let fondo: {
  clave: string;
  campo: HTMLImageElement | null;
  lienzo: HTMLCanvasElement;
} | null = null;

/** Lo que mira el fondo del campo: el tamaño del lienzo y dónde cae su horizonte, en píxeles. */
export interface LienzoDelCampo {
  readonly ancho: number;
  readonly alto: number;
  readonly horizonte: number;
  /**
   * El clima del sitio: el cielo de detrás (`cieloDe`) y, horneadas, su luz y su
   * bruma (`hornearElVelo`). Sin él, el atardecer despejado (la tropa).
   */
  readonly clima?: ClimaDelSitio;
}

/**
 * El horizonte del campo en una batalla: un poco por encima de la fila de atrás
 * del tablero, a la cabeza de quien está en ella. Así el tablero entero pisa
 * suelo y no flota sobre el cielo.
 */
export function horizonteDelCampo(t: Tablero): number {
  return t.origenY - t.paso * 0.9;
}

/**
 * El campo de batalla detrás de todo, con su horizonte en `v.horizonte`. Lo
 * pintan la batalla (`horizonteDelCampo`) y la escena de la tropa, que se alza en
 * el mismo campo y pone el suyo detrás del héroe.
 */
export function pintarFondo(ctx: CanvasRenderingContext2D, v: LienzoDelCampo): void {
  const campo = asset('rpg', 'campo');
  const dpr = densidadDe(ctx);
  const clima = v.clima ?? DESPEJADO;
  const clave = `${v.ancho}|${v.alto}|${dpr}|${v.horizonte}|${clima.tiempo}|${clima.noche}`;
  if (fondo === null || fondo.clave !== clave || fondo.campo !== campo) {
    const lienzo = fondo?.lienzo ?? document.createElement('canvas');
    lienzo.width = Math.max(1, Math.ceil(v.ancho * dpr));
    lienzo.height = Math.max(1, Math.ceil(v.alto * dpr));
    const c = lienzo.getContext('2d');
    if (c === null)
      throw new Error('este navegador no tiene canvas 2D para el fondo de la batalla');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.imageSmoothingEnabled = true;
    componerFondo(c, v, campo);
    hornearElVelo(c, campoDeEscena(clima, v), v.ancho, v.alto);
    if (clima.noche && campo !== null) pintarAstros(c, v, campo, EFECTOS[clima.tiempo].astros, dpr);
    fondo = { clave, campo, lienzo };
  }
  ctx.drawImage(fondo.lienzo, 0, 0, v.ancho, v.alto);
}

function componerFondo(
  ctx: CanvasRenderingContext2D,
  v: LienzoDelCampo,
  campo: HTMLImageElement | null,
): void {
  if (campo !== null) {
    pintarCielo(ctx, v);
    // El horizonte del fondo (el 47 % de su alto, donde acaba el empedrado) va
    // en `v.horizonte`. Y la escala nunca deja el fondo más estrecho que el
    // lienzo ni corto por abajo.
    const r = dondeVaElCampo(v, campo);
    ctx.drawImage(campo, r.x, r.y, r.w, r.h);
    ctx.fillStyle = 'rgba(10,12,8,0.22)';
    ctx.fillRect(0, 0, v.ancho, v.alto);
    return;
  }
  const degradado = ctx.createLinearGradient(0, 0, 0, v.alto);
  degradado.addColorStop(0, '#1d221a');
  degradado.addColorStop(0.35, '#3a3a26');
  degradado.addColorStop(1, '#4d4630');
  ctx.fillStyle = degradado;
  ctx.fillRect(0, 0, v.ancho, v.alto);
}

/**
 * Dónde va la imagen del campo: el horizonte del fondo (el 47 % de su alto,
 * donde acaba el empedrado) en `v.horizonte`, y la escala que nunca deja el
 * fondo más estrecho que el lienzo ni corto por abajo.
 */
function dondeVaElCampo(
  v: LienzoDelCampo,
  campo: HTMLImageElement,
): { x: number; y: number; w: number; h: number } {
  const HORIZONTE = 0.47;
  const W = campo.naturalWidth;
  const H = campo.naturalHeight;
  const escala = Math.max(v.ancho / W, (v.alto - v.horizonte) / ((1 - HORIZONTE) * H));
  const w = W * escala;
  const h = H * escala;
  return { x: (v.ancho - w) / 2, y: v.horizonte - HORIZONTE * h, w, h };
}

/**
 * El cielo de detrás del campo. `campo.webp` lo trae TRANSPARENTE —un tercio de
 * sus píxeles, igual que el `clearing.png` del que sale—, y sobre el negro de
 * antes quedaba un hueco negro encima de los árboles. Es un atardecer de otoño,
 * del azul pizarra arriba al ocre de la bruma en la línea de los árboles, que es
 * la luz que ya tiene el empedrado, con el despejado; con otro tiempo o de
 * noche, el de su clima (`cieloDe`).
 */
function pintarCielo(ctx: CanvasRenderingContext2D, v: LienzoDelCampo): void {
  const linea = Math.max(1, v.horizonte);
  const cielo = ctx.createLinearGradient(0, 0, 0, linea);
  // El de despejado es el atardecer de siempre; con tormenta no se ve el sol.
  const [arriba, medio, abajo] = cieloDe(v.clima ?? DESPEJADO);
  cielo.addColorStop(0, arriba);
  cielo.addColorStop(0.55, medio);
  cielo.addColorStop(1, abajo);
  ctx.fillStyle = cielo;
  ctx.fillRect(0, 0, v.ancho, v.alto);
  const nubes = EFECTOS[(v.clima ?? DESPEJADO).tiempo].nubes;
  if (nubes !== null) pintarNubesBajas(ctx, v, nubes);
}

/**
 * Las nubes bajas de la lluvia y la tormenta: bancos de óvalos difuminados a lo
 * largo del horizonte, más densos abajo, con su propia corriente de azar (son
 * las mismas cada vez). Van bajo la luz del clima, que las oscurece con el cielo.
 */
function pintarNubesBajas(
  ctx: CanvasRenderingContext2D,
  v: LienzoDelCampo,
  nubes: NonNullable<Receta['nubes']>,
): void {
  const linea = Math.max(1, v.horizonte);
  const rng = createRng(hashDeTexto(`nubes|${nubes.cuantas}`));
  const n = Math.round(10 + 22 * nubes.cuantas);
  const [r, g, b] = nubes.color;
  for (let i = 0; i < n; i++) {
    const x = rng.next() * v.ancho;
    // Más abajo cuanto más avanzan: las del fondo, sobre la línea de los árboles.
    const y = linea * (0.25 + 0.75 * (i / n) * (0.6 + 0.4 * rng.next()));
    const rx = v.ancho * (0.08 + 0.12 * rng.next());
    const ry = linea * (0.1 + 0.12 * rng.next());
    const a = 0.45 + 0.4 * rng.next();
    const d = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    d.addColorStop(0, `rgba(${r},${g},${b},${a})`);
    d.addColorStop(0.6, `rgba(${r},${g},${b},${a * 0.6})`);
    d.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    ctx.fillStyle = d;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
}

/**
 * La luna y las estrellas de la noche, encima de la luz del clima (no la
 * oscurecen: brillan) y detrás de los árboles: se pintan aparte y se recortan
 * por la silueta del campo. Con niebla, solo la luna, velada.
 */
function pintarAstros(
  ctx: CanvasRenderingContext2D,
  v: LienzoDelCampo,
  campo: HTMLImageElement,
  astros: Receta['astros'],
  dpr: number,
): void {
  if (astros === null) return;
  const linea = Math.max(1, v.horizonte);
  const capa = document.createElement('canvas');
  capa.width = Math.max(1, Math.ceil(v.ancho * dpr));
  capa.height = Math.max(1, Math.ceil(v.alto * dpr));
  const c = capa.getContext('2d');
  if (c === null) throw new Error('este navegador no tiene canvas 2D para el cielo de la batalla');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rng = createRng(hashDeTexto('estrellas'));
  if (astros === 'luna-y-estrellas') {
    for (let i = 0; i < 140; i++) {
      const x = rng.next() * v.ancho;
      // Más y más claras arriba, que el horizonte tiene aún algo de luz.
      const alto = rng.next() * rng.next();
      const y = linea * 0.95 * alto;
      const brillo = (0.35 + 0.6 * rng.next()) * (1 - alto * 0.6);
      const lado = rng.next() < 0.12 ? 1.8 : 1.1;
      c.fillStyle = `rgba(225,232,255,${brillo})`;
      c.fillRect(x, y, lado, lado);
    }
  }
  const radio = Math.max(6, Math.min(v.ancho * 0.015, linea * 0.12));
  const lx = v.ancho * 0.78;
  const ly = linea * 0.3;
  const velada = astros === 'luna';
  const halo = c.createRadialGradient(lx, ly, radio * 0.8, lx, ly, radio * (velada ? 7 : 4.5));
  halo.addColorStop(0, `rgba(200,214,255,${velada ? 0.3 : 0.22})`);
  halo.addColorStop(1, 'rgba(200,214,255,0)');
  c.fillStyle = halo;
  c.fillRect(0, 0, v.ancho, linea * 1.2);
  c.fillStyle = velada ? 'rgba(226,232,246,0.55)' : '#eef1fa';
  c.beginPath();
  c.arc(lx, ly, radio, 0, Math.PI * 2);
  c.fill();
  // Detrás de los árboles: fuera lo que tapa el campo.
  const r = dondeVaElCampo(v, campo);
  c.globalCompositeOperation = 'destination-out';
  c.drawImage(campo, r.x, r.y, r.w, r.h);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(capa, 0, 0);
  ctx.restore();
}
