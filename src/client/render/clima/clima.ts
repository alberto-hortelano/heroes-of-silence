/**
 * La pieza que pinta el clima: niebla, lluvia, tormenta y noche, encima de lo
 * que ya pinta una escena. Una sola, para el mapa (por región, con su frente:
 * `pintarClimaDelMapa`) y para toda escena sin regiones —la batalla, la base, la
 * morada y las escenas laterales que vengan—, que solo tienen que llamarla
 * (`pintarSueloDelClima` y `pintarAireDelClima`, o las dos con `pintarClima`).
 *
 * No toca el DOM ni recibe clics: pinta en el lienzo que le dan. No lee la
 * sesión (`invariantes.test.ts`): le dan el clima del sitio.
 *
 * **Por qué así** (lo caro es componer una capa del tamaño del lienzo, y el mapa
 * tiene un presupuesto de píxeles: `PIXELES_DEL_MAPA`):
 *
 * - todo lo blando (el velo del tiempo y de la noche, los bancos de niebla, los
 *   huecos de luz de los fuegos) va en **una** capa a un cuarto del lienzo
 *   (`ESCALA_DEL_AIRE`), que se compone una vez por fotograma **sin suavizado**:
 *   ampliar con el bilineal costaba de 7 a 10 ms por fotograma en un lienzo de
 *   1,5 M píxeles sin GPU, y con el vecino más cercano, 1 ms (medido el
 *   22-10-2026); lo de la capa es blando y los bloques de 4 px no se notan;
 * - lo fino (las gotas y el rayo) va a resolución plena y directo, gota a gota,
 *   en líneas de un píxel (las de 1,2 px suavizadas costaban 6,5 ms para 1 200
 *   gotas, las de 1 px, 1 ms): en el mapa, cada gota pregunta la región que
 *   tiene debajo, y así no hace falta recortar nada a pantalla entera;
 * - los fuegos de la noche (el hueco en el velo y su resplandor) y los bancos
 *   de niebla, que se tiñen y escalan una vez por tamaño, van en la capa.
 *
 * Nada de `Math.random` (`invariantes.test.ts`): las gotas salen de un hash de
 * su número y del reloj, y el rayo, de un hash de su región y de su ciclo.
 */
import type { MapaDeRed } from '@core/map/regiones.js';
import type { ClimaDeLaPartida, ClimaDelSitio } from '@core/state/clima.js';
import { type CamaraMapa, mundoAPixel, pixelAMundo } from '../camara-mapa.js';
import { animarHasta } from '../figura.js';
import { mascarasDelMapa, regionEnElFrente } from './mascaras.js';
import { css, EFECTOS, NOCHE, type Receta, type Rgba, veloDe } from './recetas.js';
import { bancosDeNiebla } from './texturas.js';

/** A qué fracción del lienzo se pinta lo blando del clima antes de ampliarlo. */
export const ESCALA_DEL_AIRE = 1 / 4;
/** Cuánto dura el destello de un rayo, en ms: breve, y no ciega. */
export const DURACION_DEL_RAYO = 160;

/** Un fuego que se enciende de noche, en píxeles CSS del lienzo y con su radio. */
export interface LuzDeNoche {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/** Lo que necesita el clima de una escena sin regiones. */
export interface ClimaDeEscena {
  readonly sitio: ClimaDelSitio;
  readonly ancho: number;
  readonly alto: number;
  /** El reloj de la página (`performance.now()`), en ms. */
  readonly ahora: number;
  /** `prefers-reduced-motion`: sin destellos y sin nada que corra. */
  readonly quieto: boolean;
  /** Los fuegos que se encienden si es de noche (las puertas de la base). */
  readonly luces?: readonly LuzDeNoche[];
  /** Hasta dónde baja el rayo, en px desde arriba: el horizonte de la batalla. Sin él, un tercio del alto. */
  readonly cielo?: number;
}

// ------------------------------------------------------------- las capas

interface Capa {
  readonly lienzo: HTMLCanvasElement;
  readonly c: CanvasRenderingContext2D;
}

const capas: (Capa | null)[] = [null, null];

/** Una de las dos capas que se reutilizan, del tamaño pedido y vacía. */
function capa(i: 0 | 1, ancho: number, alto: number): Capa {
  const w = Math.max(1, Math.ceil(ancho * ESCALA_DEL_AIRE));
  const h = Math.max(1, Math.ceil(alto * ESCALA_DEL_AIRE));
  let hecha = capas[i] ?? null;
  if (hecha === null) {
    const lienzo = document.createElement('canvas');
    const c = lienzo.getContext('2d');
    if (c === null) throw new Error('este navegador no tiene canvas 2D para el clima');
    hecha = { lienzo, c };
    capas[i] = hecha;
  }
  if (hecha.lienzo.width !== w || hecha.lienzo.height !== h) {
    hecha.lienzo.width = w;
    hecha.lienzo.height = h;
  }
  hecha.c.setTransform(1, 0, 0, 1, 0, 0);
  hecha.c.globalCompositeOperation = 'source-over';
  hecha.c.globalAlpha = 1;
  hecha.c.clearRect(0, 0, w, h);
  return hecha;
}

/** Un número de [0, 1) de un entero: las gotas y los rayos, sin `Math.random`. */
function hash01(n: number): number {
  let t = (n + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** El texto de un id a un entero, para sembrar el hash de un rayo. */
function hashDe(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ------------------------------------------------------------- la niebla

const tenidas = new Map<string, HTMLCanvasElement>();
/** Cuántas baldosas teñidas y a su tamaño se guardan: una por zoom del mapa que se use. */
const BALDOSAS_GUARDADAS = 12;

/**
 * Los bancos de niebla del color pedido y a `lado` px por baldosa, hechos una
 * vez: el patrón se pinta luego sin escala, que es lo barato (un patrón que
 * escala muestrea con suavizado cada píxel de la capa).
 */
function bancosDe(color: Rgba, lado: number): HTMLCanvasElement {
  const px = Math.min(1024, Math.max(16, Math.round(lado)));
  const clave = `${color[0]},${color[1]},${color[2]}|${px}`;
  const hecha = tenidas.get(clave);
  if (hecha !== undefined) {
    tenidas.delete(clave);
    tenidas.set(clave, hecha);
    return hecha;
  }
  const forma = bancosDeNiebla();
  const lienzo = document.createElement('canvas');
  lienzo.width = px;
  lienzo.height = px;
  const c = lienzo.getContext('2d');
  if (c === null) throw new Error('este navegador no tiene canvas 2D para la niebla del clima');
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(forma, 0, 0, px, px);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = css(color, 1);
  c.fillRect(0, 0, px, px);
  tenidas.set(clave, lienzo);
  if (tenidas.size > BALDOSAS_GUARDADAS) {
    const vieja = tenidas.keys().next().value;
    if (vieja !== undefined) tenidas.delete(vieja);
  }
  return lienzo;
}

const patrones = new WeakMap<HTMLCanvasElement, CanvasPattern>();

/**
 * El patrón de una baldosa, hecho una vez: `createPattern` copia el lienzo
 * entero cada vez que se llama, y por fotograma eran más de un millón de píxeles.
 */
function patronDe(c: CanvasRenderingContext2D, tex: HTMLCanvasElement): CanvasPattern {
  const hecho = patrones.get(tex);
  if (hecho !== undefined) return hecho;
  const patron = c.createPattern(tex, 'repeat');
  if (patron === null) throw new Error('este navegador no hace patrones con la niebla del clima');
  patrones.set(tex, patron);
  return patron;
}

/**
 * Dos capas de bancos de niebla que van a la deriva, despacio y en sentidos
 * distintos, sobre la capa `c` (ya a su escala). `origen` y `lado` dicen dónde
 * cae el mundo y cuánto mide una baldosa en esa capa: en el mapa, la niebla va
 * con el mundo al arrastrar; en una escena, con el lienzo.
 */
function pintarBancos(
  c: CanvasRenderingContext2D,
  ancho: number,
  alto: number,
  color: Rgba,
  ahora: number,
  quieto: boolean,
  origen: { readonly x: number; readonly y: number },
  lado: number,
): void {
  const t = quieto ? 0 : ahora;
  const planos = [
    { escala: 1, dx: 0.0045, dy: 0.0012, alfa: 0.75 },
    { escala: 1.7, dx: -0.0028, dy: 0.0021, alfa: 0.55 },
  ];
  for (const p of planos) {
    const tex = bancosDe(color, lado * p.escala);
    const patron = patronDe(c, tex);
    // La deriva, en baldosas por ms: la misma en el mapa y en una escena. En
    // píxeles enteros: con medio píxel, el patrón se vuelve a muestrear.
    const ox = Math.round(origen.x + t * p.dx * tex.width * 0.06);
    const oy = Math.round(origen.y + t * p.dy * tex.width * 0.06);
    patron.setTransform(new DOMMatrix().translateSelf(ox, oy));
    c.globalAlpha = color[3] * p.alfa;
    c.fillStyle = patron;
    c.fillRect(0, 0, ancho, alto);
  }
  c.globalAlpha = 1;
}

// ------------------------------------------------------------ la lluvia

/**
 * Las gotas de la lluvia, en dos planos (lejos: finas, tenues y lentas; cerca:
 * más gruesas), directo en `ctx` a resolución plena. `dentro` dice si una gota
 * cae en un sitio con lluvia (el mapa, por región); sin él, en todas partes.
 */
function pintarLluvia(
  ctx: CanvasRenderingContext2D,
  receta: NonNullable<Receta['lluvia']>,
  ancho: number,
  alto: number,
  ahora: number,
  quieto: boolean,
  dentro: ((x: number, y: number) => boolean) | null,
  semilla: number,
): void {
  const t = quieto ? 0 : ahora;
  // Quieta, menos gotas: se ve que llueve sin una cortina fija delante.
  const n = Math.round(((receta.densidad * ancho * alto) / 10_000) * (quieto ? 0.5 : 1));
  const planos = [
    { parte: 0.6, largo: 10, velocidad: 0.62, alfa: 0.55 },
    { parte: 0.4, largo: 18, velocidad: 0.95, alfa: 1 },
  ];
  ctx.save();
  ctx.lineCap = 'butt';
  // Un píxel: el camino rápido del rasterizador (ver la cabecera).
  ctx.lineWidth = 1;
  let i0 = 0;
  for (const p of planos) {
    const cuantas = Math.round(n * p.parte);
    const dx = receta.viento * p.largo;
    const vuelta = alto + p.largo;
    ctx.beginPath();
    for (let k = 0; k < cuantas; k++) {
      const i = semilla + i0 + k;
      const u = hash01(i * 2);
      const v = hash01(i * 2 + 1);
      const y = ((((v * vuelta + t * p.velocidad) % vuelta) + vuelta) % vuelta) - p.largo;
      const x = (((u * ancho + y * receta.viento) % ancho) + ancho) % ancho;
      if (dentro !== null && !dentro(x, y + p.largo)) continue;
      const x0 = Math.round(x) + 0.5;
      const y0 = Math.round(y);
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + dx, y0 + p.largo);
    }
    ctx.strokeStyle = css(receta.color, receta.color[3] * p.alfa);
    ctx.stroke();
    i0 += cuantas;
  }
  ctx.restore();
}

// --------------------------------------------------------------- el rayo

/**
 * Si cae un rayo ahora en el sitio de `id`, y con qué fuerza (0 a 1) y qué
 * ciclo: uno cada `cada` ms (entre sus dos cifras, del hash del ciclo), con un
 * destello de `DURACION_DEL_RAYO` de dos golpes.
 */
function rayoAhora(
  id: string,
  ahora: number,
  cada: readonly [number, number],
): { fuerza: number; ciclo: number } | null {
  const base = hashDe(id);
  const periodo = cada[0] + hash01(base) * (cada[1] - cada[0]);
  const desfase = hash01(base + 1) * periodo;
  const ciclo = Math.floor((ahora + desfase) / periodo);
  const dentroDelCiclo = ahora + desfase - ciclo * periodo;
  const cae = hash01(base + ciclo * 7 + 3) * (periodo - DURACION_DEL_RAYO);
  const t = dentroDelCiclo - cae;
  if (t < 0 || t > DURACION_DEL_RAYO) return null;
  // Dos golpes: el fuerte, un respiro y el que se apaga.
  const fuerza = t < 55 ? 1 : t < 85 ? 0.25 : 0.75 * (1 - (t - 85) / (DURACION_DEL_RAYO - 85));
  return { fuerza, ciclo };
}

/**
 * El destello (un círculo de luz de `radio`, no la pantalla entera) y el trazo
 * del rayo, que baja quebrado desde `arriba` hasta `(x, y)`.
 */
function pintarRayo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  arriba: number,
  radio: number,
  fuerza: number,
  semilla: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, radio);
  g.addColorStop(0, `rgba(190,205,255,${0.42 * fuerza})`);
  g.addColorStop(0.4, `rgba(150,170,230,${0.18 * fuerza})`);
  g.addColorStop(1, 'rgba(120,140,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - radio, y - radio, 2 * radio, 2 * radio);
  // El trazo: tramos quebrados con un hash del ciclo, y una rama.
  const tramos = 9;
  const puntos: { x: number; y: number }[] = [];
  let px = x + (hash01(semilla) - 0.5) * radio * 0.5;
  for (let k = 0; k <= tramos; k++) {
    const f = k / tramos;
    const py = arriba + (y - arriba) * f;
    if (k > 0) px += (hash01(semilla + k * 13) - 0.5) * radio * 0.18;
    // Que acabe en su sitio: el último tramo se cierra sobre (x, y).
    puntos.push({ x: k === tramos ? x : px + (x - px) * f * f, y: py });
  }
  const trazar = (ancho: number, color: string): void => {
    ctx.beginPath();
    for (const [k, p] of puntos.entries()) {
      if (k === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    const r = puntos[Math.floor(tramos / 2)] as { x: number; y: number };
    ctx.moveTo(r.x, r.y);
    ctx.lineTo(r.x + (hash01(semilla + 99) - 0.5) * radio * 0.5, r.y + (y - arriba) * 0.22);
    ctx.lineWidth = ancho;
    ctx.strokeStyle = color;
    ctx.stroke();
  };
  ctx.lineJoin = 'round';
  trazar(6, `rgba(150,170,255,${0.22 * fuerza})`);
  trazar(2, `rgba(235,240,255,${0.9 * fuerza})`);
  ctx.restore();
}

// -------------------------------------------------------------- los fuegos

const fuegos = new Map<
  number,
  { readonly hueco: HTMLCanvasElement; readonly luz: HTMLCanvasElement }
>();

/**
 * El hueco y el resplandor de un fuego de radio `r` px de la capa, pintados una
 * vez por radio: dos degradados radiales por fuego y fotograma costaban más que
 * copiarlos (en el mapa al tope se ven una veintena de ciudades y pueblos).
 */
function fuegoDe(r: number): {
  readonly hueco: HTMLCanvasElement;
  readonly luz: HTMLCanvasElement;
} {
  const radio = Math.max(2, Math.round(r));
  const hecho = fuegos.get(radio);
  if (hecho !== undefined) return hecho;
  const pintado = (parar: (g: CanvasGradient) => void): HTMLCanvasElement => {
    const lienzo = document.createElement('canvas');
    lienzo.width = 2 * radio;
    lienzo.height = 2 * radio;
    const c = lienzo.getContext('2d');
    if (c === null)
      throw new Error('este navegador no tiene canvas 2D para los fuegos de la noche');
    const g = c.createRadialGradient(radio, radio, 0, radio, radio, radio);
    parar(g);
    c.fillStyle = g;
    c.fillRect(0, 0, 2 * radio, 2 * radio);
    return lienzo;
  };
  const [rr, gg, b, a] = NOCHE.fuego;
  const hechos = {
    hueco: pintado((g) => {
      g.addColorStop(0, 'rgba(0,0,0,0.9)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
    }),
    luz: pintado((g) => {
      g.addColorStop(0, `rgba(${rr},${gg},${b},${a * 0.55})`);
      g.addColorStop(0.4, `rgba(${rr},${gg},${b},${a * 0.18})`);
      g.addColorStop(0.8, `rgba(${rr},${gg},${b},0)`);
    }),
  };
  fuegos.set(radio, hechos);
  return hechos;
}

/**
 * Un fuego de noche en la capa del aire (a su escala): abre un hueco en el velo
 * y pone encima su resplandor cálido. En la capa y no en el lienzo: así no
 * cuesta ni una composición más a resolución plena.
 */
function fuegoEnLaCapa(c: CanvasRenderingContext2D, l: LuzDeNoche): void {
  const { hueco, luz } = fuegoDe(l.r * ESCALA_DEL_AIRE);
  const x = Math.round(l.x * ESCALA_DEL_AIRE - hueco.width / 2);
  const y = Math.round(l.y * ESCALA_DEL_AIRE - hueco.height / 2);
  c.globalCompositeOperation = 'destination-out';
  c.drawImage(hueco, x, y);
  c.globalCompositeOperation = 'source-over';
  c.drawImage(luz, x, y);
}

/** La capa del aire, ya hecha, sobre el lienzo: sin suavizado (ver la cabecera). */
function componer(
  ctx: CanvasRenderingContext2D,
  capa: HTMLCanvasElement,
  ancho: number,
  alto: number,
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(capa, 0, 0, ancho, alto);
  ctx.restore();
}

// --------------------------------------------------- una escena sin regiones

/** ¿Hay algo que se mueva en este clima? Entonces se piden más fotogramas. */
function seMueve(sitio: ClimaDelSitio): boolean {
  const r = EFECTOS[sitio.tiempo];
  return r.niebla !== null || r.lluvia !== null || r.rayos !== null;
}

/**
 * Lo de abajo del clima de una escena: el velo de su tiempo y de su noche, los
 * bancos de niebla y los fuegos. En la batalla va detrás de las casillas y las
 * figuras; en la base, encima de todo (`pintarClima`).
 */
export function pintarSueloDelClima(ctx: CanvasRenderingContext2D, e: ClimaDeEscena): void {
  const velo = veloDe(e.sitio);
  const niebla = EFECTOS[e.sitio.tiempo].niebla;
  const luces = e.sitio.noche ? (e.luces ?? []) : [];
  if (velo === null && niebla === null) return;
  const { lienzo, c } = capa(0, e.ancho, e.alto);
  // Los bancos primero y el velo encima: de noche, la niebla también es oscura.
  if (niebla !== null) {
    pintarBancos(
      c,
      lienzo.width,
      lienzo.height,
      niebla,
      e.ahora,
      e.quieto,
      { x: 0, y: 0 },
      Math.max(lienzo.width, lienzo.height) * 0.9,
    );
  }
  if (velo !== null) {
    c.fillStyle = css(velo);
    c.fillRect(0, 0, lienzo.width, lienzo.height);
  }
  for (const l of luces) fuegoEnLaCapa(c, l);
  componer(ctx, lienzo, e.ancho, e.alto);
  if (!e.quieto && seMueve(e.sitio)) animarHasta(e.ahora + 100);
}

/**
 * Lo de arriba del clima de una escena: la lluvia y el rayo. En la batalla va
 * encima de las figuras y debajo de las barras, los nombres y las cifras.
 */
export function pintarAireDelClima(ctx: CanvasRenderingContext2D, e: ClimaDeEscena): void {
  const receta = EFECTOS[e.sitio.tiempo];
  if (receta.lluvia !== null) {
    pintarLluvia(ctx, receta.lluvia, e.ancho, e.alto, e.ahora, e.quieto, null, 0);
  }
  if (receta.rayos !== null && !e.quieto) {
    const rayo = rayoAhora('escena', e.ahora, receta.rayos.cada);
    if (rayo !== null) {
      const cielo = e.cielo ?? e.alto / 3;
      const x = e.ancho * (0.15 + 0.7 * hash01(rayo.ciclo * 5 + 1));
      const y = Math.max(12, cielo * (0.45 + 0.4 * hash01(rayo.ciclo * 5 + 2)));
      const radio = Math.min(e.ancho, e.alto) * 0.32;
      pintarRayo(ctx, x, y, 0, radio, rayo.fuerza, rayo.ciclo * 31);
    }
  }
  if (!e.quieto && seMueve(e.sitio)) animarHasta(e.ahora + 100);
}

/** El clima entero de una escena lateral, encima de lo que ya pintó: lo que llama una escena nueva. */
export function pintarClima(ctx: CanvasRenderingContext2D, e: ClimaDeEscena): void {
  pintarSueloDelClima(ctx, e);
  pintarAireDelClima(ctx, e);
}

// ----------------------------------------------------------------- el mapa

/** Lo que necesita el clima del mapa: el clima de cada región y dónde mira la cámara. */
export interface ClimaDelMapa {
  readonly mapa: MapaDeRed;
  readonly semilla: number;
  readonly clima: ClimaDeLaPartida;
  readonly camara: CamaraMapa;
  readonly ancho: number;
  readonly alto: number;
  readonly ahora: number;
  readonly quieto: boolean;
  /** Los fuegos de ciudades y pueblos, en casillas del mundo (`Escena.luces` de clase `fuego`). */
  readonly fuegos: readonly { readonly x: number; readonly y: number; readonly r: number }[];
}

/** Cuánto ilumina el destello de un rayo en el mapa, en casillas: unas seis. */
const RADIO_DEL_RAYO_EN_EL_MAPA = 6;

/**
 * El clima del mapa, por región: va **dentro de `drawMapa`**, tras los
 * volúmenes y antes de los identificadores y de la niebla de guerra, así que no
 * tapa ni destapa nada de ella. Cada región con su tiempo y su noche, y el borde
 * entre dos ondulado y blando (`regionEnElFrente`).
 */
export function pintarClimaDelMapa(ctx: CanvasRenderingContext2D, m: ClimaDelMapa): void {
  const regiones = m.clima.regiones;
  if (regiones.every((r) => r.tiempo === 'despejado' && !r.noche)) return;
  const { camara } = m;
  const enFrente = regionEnElFrente(m.mapa, m.semilla);
  const regionEnPixel = (x: number, y: number): number => {
    const p = pixelAMundo(camara, x, y);
    if (p.x < 0 || p.y < 0 || p.x >= m.mapa.width || p.y >= m.mapa.height) return -1;
    return enFrente(p.x, p.y);
  };
  const mascaras = mascarasDelMapa(m.mapa, m.semilla, m.clima);
  const origen = mundoAPixel(camara, 0, 0);
  const W = m.mapa.width * camara.tile;
  const H = m.mapa.height * camara.tile;

  // Los fuegos que se ven y caen en una región de noche, en px del lienzo.
  const margen = 3 * camara.tile;
  const luces: LuzDeNoche[] = [];
  for (const f of m.fuegos) {
    const p = mundoAPixel(camara, f.x, f.y);
    if (p.x < -margen || p.y < -margen || p.x > m.ancho + margen || p.y > m.alto + margen) continue;
    const k = enFrente(f.x, f.y);
    if (k >= 0 && regiones[k]?.noche === true)
      luces.push({ x: p.x, y: p.y, r: f.r * 1.7 * camara.tile });
  }

  if (mascaras.velo !== null || mascaras.niebla !== null) {
    const { lienzo, c } = capa(0, m.ancho, m.alto);
    const k = ESCALA_DEL_AIRE;
    // Las máscaras a la capa, sin suavizado: ya son blandas, y a la capa le
    // toca un píxel de máscara o menos por píxel.
    c.imageSmoothingEnabled = false;
    if (mascaras.niebla !== null) {
      const color = EFECTOS.niebla.niebla as Rgba;
      const t = capa(1, m.ancho, m.alto);
      pintarBancos(
        t.c,
        t.lienzo.width,
        t.lienzo.height,
        color,
        m.ahora,
        m.quieto,
        { x: origen.x * k, y: origen.y * k },
        9 * camara.tile * k,
      );
      t.c.globalCompositeOperation = 'destination-in';
      t.c.imageSmoothingEnabled = false;
      t.c.drawImage(mascaras.niebla, origen.x * k, origen.y * k, W * k, H * k);
      c.drawImage(t.lienzo, 0, 0);
    }
    // El velo encima de los bancos: de noche, la niebla también es oscura.
    if (mascaras.velo !== null)
      c.drawImage(mascaras.velo, origen.x * k, origen.y * k, W * k, H * k);
    for (const l of luces) fuegoEnLaCapa(c, l);
    componer(ctx, lienzo, m.ancho, m.alto);
  }

  // Las gotas, cada una donde su región llueve.
  const lluvia = (x: number, y: number): boolean => {
    const k = regionEnPixel(x, y);
    return k >= 0 && EFECTOS[regiones[k]?.tiempo ?? 'despejado'].lluvia !== null;
  };
  const conLluvia = regiones.filter((r) => EFECTOS[r.tiempo].lluvia !== null);
  // La más fuerte manda en la densidad: con tormenta y lluvia a la vez, la de
  // la tormenta en las dos (la diferencia entre ellas es el velo y el rayo).
  const receta = conLluvia.some((r) => r.tiempo === 'tormenta')
    ? EFECTOS.tormenta.lluvia
    : conLluvia.length > 0
      ? EFECTOS.lluvia.lluvia
      : null;
  if (receta !== null) pintarLluvia(ctx, receta, m.ancho, m.alto, m.ahora, m.quieto, lluvia, 0);

  // Los rayos, uno por región con tormenta, en una casilla suya.
  if (!m.quieto) {
    for (const [k, r] of regiones.entries()) {
      const rayos = EFECTOS[r.tiempo].rayos;
      if (rayos === null) continue;
      const reg = m.mapa.regions[k];
      if (reg === undefined) continue;
      const rayo = rayoAhora(`${m.semilla}|${reg.id}`, m.ahora, rayos.cada);
      if (rayo === null) continue;
      const donde = casillaDelRayo(m.mapa, k, rayo.ciclo, m.semilla);
      if (donde === null) continue;
      const p = mundoAPixel(camara, donde.x + 0.5, donde.y + 0.5);
      const radio = RADIO_DEL_RAYO_EN_EL_MAPA * camara.tile;
      if (p.x < -radio || p.y < -radio || p.x > m.ancho + radio || p.y > m.alto + radio) continue;
      pintarRayo(ctx, p.x, p.y, p.y - 7 * camara.tile, radio, rayo.fuerza, rayo.ciclo * 31 + k);
    }
  }
  if (!m.quieto && regiones.some(seMueve)) animarHasta(m.ahora + 100);
}

const casillasPorRegion = new WeakMap<MapaDeRed, number[][]>();

/** Una casilla de la región `k` donde cae el rayo de este ciclo, del hash: siempre dentro de su región. */
function casillaDelRayo(
  mapa: MapaDeRed,
  k: number,
  ciclo: number,
  semilla: number,
): { x: number; y: number } | null {
  let porRegion = casillasPorRegion.get(mapa);
  if (porRegion === undefined) {
    const enFrente = regionEnElFrente(mapa, semilla);
    porRegion = mapa.regions.map(() => []);
    for (let y = 0; y < mapa.height; y++) {
      for (let x = 0; x < mapa.width; x++) {
        const r = enFrente(x + 0.5, y + 0.5);
        if (r >= 0) porRegion[r]?.push(y * mapa.width + x);
      }
    }
    casillasPorRegion.set(mapa, porRegion);
  }
  const casillas = porRegion[k];
  if (casillas === undefined || casillas.length === 0) return null;
  const i = casillas[
    Math.floor(hash01(ciclo * 11 + k * 101 + semilla) * casillas.length)
  ] as number;
  return { x: i % mapa.width, y: Math.floor(i / mapa.width) };
}
