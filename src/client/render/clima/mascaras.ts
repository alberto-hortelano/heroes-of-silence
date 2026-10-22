/**
 * El clima por región en el mapa: qué región del clima hay bajo cada punto del
 * mundo, con el borde entre dos movido por un ruido para que se lea como un
 * **frente** y no como el contorno por casillas de la niebla de guerra
 * (`regionEnElFrente`), y las máscaras del mundo hechas con esa misma regla, una
 * por campo de la receta: la luz (lo que oscurece), la bruma y los bancos (lo
 * que aclara) y dónde llueve con cada lluvia. Se hacen al cambiar el clima del
 * mapa (un día, un pedido del narrador, un `?clima=`), no en cada fotograma.
 *
 * Las cachés van por el terreno del mapa (`map.terrain`) y no por el mapa: el
 * espectador rehace el objeto del mapa con cada fotograma del servidor
 * (`adaptarEscena`), pero el terreno es el mismo (`terrenoEstable`).
 */

import type { MapaDeRed } from '@core/map/regiones.js';
import { hashDeTexto } from '@core/rng.js';
import { type ClimaDeLaPartida, regionDelClima } from '@core/state/clima.js';
import { desenfocar } from '../escenario/escalon.js';
import { fbm, ruidoDe } from '../escenario/fronteras.js';
import { type Lienzo, lienzoCon } from '../escenario/pintar.js';
import { EFECTOS, type Lluvia, luzDe } from './recetas.js';

/** Píxeles por casilla de las máscaras del mundo. */
const PX_DE_LA_MASCARA = 8;
/** Las ondas del ruido del frente, en casillas, y su peso: una larga y una corta. */
const ONDAS_DEL_FRENTE: readonly (readonly [number, number])[] = [
  [3, 1],
  [1.25, 0.45],
];
/** Cuánto se mueve el frente, como mucho, desde el borde de casillas. */
const AMPLITUD_DEL_FRENTE = 1.4;
/** Lo blando del frente: el desenfoque de las máscaras, en píxeles de máscara (media casilla). */
const BLANDURA_DEL_FRENTE = 4;

/** La región del clima bajo un punto del mundo (casillas con decimales), o −1 fuera. */
export type RegionEnElFrente = (x: number, y: number) => number;

type Terreno = MapaDeRed['terrain'];

const frentes = new WeakMap<Terreno, { semilla: number; f: RegionEnElFrente }>();

/**
 * La región del clima en el punto `(x, y)` del mundo, mirando un poco más allá:
 * dos ruidos de la semilla (uno por eje) desplazan la casilla que se pregunta
 * hasta `AMPLITUD_DEL_FRENTE`, así que el borde entre dos regiones ondula y
 * cruza las casillas en vez de seguirlas. Lo comparten las máscaras y el rayo:
 * los dos ven el mismo frente.
 */
export function regionEnElFrente(mapa: MapaDeRed, semilla: number): RegionEnElFrente {
  const hecho = frentes.get(mapa.terrain);
  if (hecho !== undefined && hecho.semilla === semilla) return hecho.f;
  const { width: W, height: H } = mapa;
  const region = regionDelClima(mapa);
  const ruidoX = ruidoDe(hashDeTexto(`clima|frente|x|${semilla}`), ONDAS_DEL_FRENTE, W, H);
  const ruidoY = ruidoDe(hashDeTexto(`clima|frente|y|${semilla}`), ONDAS_DEL_FRENTE, W, H);
  const f: RegionEnElFrente = (x, y) => {
    // El ruido solo está hecho dentro del mapa: el punto que se le pregunta, también.
    const u = Math.min(W, Math.max(0, x));
    const v = Math.min(H, Math.max(0, y));
    const cx = Math.floor(x + (fbm(ruidoX, u, v) - 0.5) * 2 * AMPLITUD_DEL_FRENTE);
    const cy = Math.floor(y + (fbm(ruidoY, u, v) - 0.5) * 2 * AMPLITUD_DEL_FRENTE);
    const i = Math.min(W - 1, Math.max(0, cx));
    const j = Math.min(H - 1, Math.max(0, cy));
    return region[j * W + i] as number;
  };
  frentes.set(mapa.terrain, { semilla, f });
  return f;
}

const casillasDeCadaRegion = new WeakMap<Terreno, { semilla: number; casillas: number[][] }>();

/**
 * Una casilla de la región `k` donde cae el rayo de este `ciclo`, de un hash:
 * siempre dentro de su región, del lado del frente que es suyo.
 */
export function casillaDelRayo(
  mapa: MapaDeRed,
  semilla: number,
  k: number,
  ciclo: number,
): { x: number; y: number } | null {
  let hechas = casillasDeCadaRegion.get(mapa.terrain);
  if (hechas === undefined || hechas.semilla !== semilla) {
    const enFrente = regionEnElFrente(mapa, semilla);
    const casillas: number[][] = mapa.regions.map(() => []);
    for (let y = 0; y < mapa.height; y++) {
      for (let x = 0; x < mapa.width; x++) {
        const r = enFrente(x + 0.5, y + 0.5);
        if (r >= 0) casillas[r]?.push(y * mapa.width + x);
      }
    }
    hechas = { semilla, casillas };
    casillasDeCadaRegion.set(mapa.terrain, hechas);
  }
  const suyas = hechas.casillas[k];
  if (suyas === undefined || suyas.length === 0) return null;
  const i = suyas[hashDeTexto(`rayo|${semilla}|${k}|${ciclo}`) % suyas.length] as number;
  return { x: i % mapa.width, y: Math.floor(i / mapa.width) };
}

/** Dónde llueve con una lluvia: una casilla de máscara por byte (1, llueve), o `null` si llueve en todo el mapa. */
export interface DondeLlueve {
  readonly lluvia: Lluvia;
  readonly dentro: Uint8Array | null;
}

export interface MascarasDelMapa {
  /** Píxeles por casilla de las máscaras, y su tamaño. */
  readonly px: number;
  readonly ancho: number;
  readonly alto: number;
  /** La luz de cada región (blanco donde no oscurece), opaca: se pinta con `multiply`. */
  readonly luz: Lienzo | null;
  /** La bruma de cada región, en color. */
  readonly bruma: Lienzo | null;
  /** Los bancos de niebla: su opacidad en el alfa. */
  readonly bancos: Lienzo | null;
  /** Una por lluvia distinta que haya en el mapa. */
  readonly lluvias: readonly DondeLlueve[];
}

let ultima: {
  terreno: Terreno;
  semilla: number;
  firma: string;
  mascaras: MascarasDelMapa | null;
} | null = null;

const firmaDe = (c: ClimaDeLaPartida): string =>
  c.regiones.map((r) => `${r.tiempo}${r.noche ? '*' : ''}`).join(',');

/**
 * Las máscaras del clima de hoy en este mapa, o `null` si todo está despejado y
 * de día: la última se guarda (una partida por página).
 */
export function mascarasDelMapa(
  mapa: MapaDeRed,
  semilla: number,
  clima: ClimaDeLaPartida,
): MascarasDelMapa | null {
  const firma = firmaDe(clima);
  if (
    ultima !== null &&
    ultima.terreno === mapa.terrain &&
    ultima.semilla === semilla &&
    ultima.firma === firma
  ) {
    return ultima.mascaras;
  }
  const mascaras = hacerMascaras(mapa, semilla, clima);
  ultima = { terreno: mapa.terrain, semilla, firma, mascaras };
  return mascaras;
}

function hacerMascaras(
  mapa: MapaDeRed,
  semilla: number,
  clima: ClimaDeLaPartida,
): MascarasDelMapa | null {
  const regiones = clima.regiones;
  const recetas = regiones.map((r) => EFECTOS[r.tiempo]);
  const luces = regiones.map(luzDe);
  const hayLuz = luces.some((l) => l !== null);
  const hayBruma = recetas.some((r) => r.bruma !== null);
  const hayBancos = recetas.some((r) => r.bancos !== null);
  // Una máscara de lluvia por lluvia distinta (cada tiempo con la suya).
  const lluvias = [...new Set(recetas.map((r) => r.lluvia))].filter((l): l is Lluvia => l !== null);
  if (!hayLuz && !hayBruma && !hayBancos && lluvias.length === 0) return null;

  const P = PX_DE_LA_MASCARA;
  const w = mapa.width * P;
  const h = mapa.height * P;
  const N = w * h;
  const enFrente = regionEnElFrente(mapa, semilla);
  // En planos, un canal por arreglo, para desenfocarlos con la misma función que
  // el escalón. La bruma, premultiplicada: así el desenfoque no saca un cerco del
  // color de la región de al lado donde una de las dos no lleva bruma.
  const luz = hayLuz ? [0, 1, 2].map(() => new Float32Array(N).fill(255)) : null;
  const bruma = hayBruma ? [0, 1, 2, 3].map(() => new Float32Array(N)) : null;
  const bancos = hayBancos ? new Float32Array(N) : null;
  const llueve = lluvias.map(() => new Uint8Array(N));
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const k = enFrente((px + 0.5) / P, (py + 0.5) / P);
      if (k < 0) continue;
      const i = py * w + px;
      const l = luces[k];
      if (luz !== null && l !== null && l !== undefined) {
        for (let c = 0; c < 3; c++) (luz[c] as Float32Array)[i] = l[c] as number;
      }
      const r = recetas[k];
      if (r === undefined) continue;
      if (bruma !== null && r.bruma !== null) {
        const a = r.bruma[3];
        for (let c = 0; c < 3; c++) (bruma[c] as Float32Array)[i] = (r.bruma[c] as number) * a;
        (bruma[3] as Float32Array)[i] = a;
      }
      if (bancos !== null && r.bancos !== null) bancos[i] = r.bancos;
      const j = r.lluvia === null ? -1 : lluvias.indexOf(r.lluvia);
      if (j >= 0) (llueve[j] as Uint8Array)[i] = 1;
    }
  }
  const blando = (a: Float32Array): Float32Array => desenfocar(a, w, h, BLANDURA_DEL_FRENTE);
  return {
    px: P,
    ancho: w,
    alto: h,
    luz: luz === null ? null : lienzoDeLaLuz(w, h, luz.map(blando)),
    bruma: bruma === null ? null : lienzoDeLaBruma(w, h, bruma.map(blando)),
    bancos: bancos === null ? null : lienzoDeLosBancos(w, h, blando(bancos)),
    lluvias: lluvias.map((lluvia, j) => ({
      lluvia,
      // Si llueve igual en todas las regiones, cada gota cae sin preguntar.
      dentro: recetas.every((r) => r.lluvia === lluvia) ? null : (llueve[j] as Uint8Array),
    })),
  };
}

/** La luz, opaca: blanco donde no oscurece. */
function lienzoDeLaLuz(w: number, h: number, planos: readonly Float32Array[]): Lienzo {
  const [R, G, B] = planos as [Float32Array, Float32Array, Float32Array];
  return aLienzo(w, h, (img, i) => {
    img[i * 4] = R[i] as number;
    img[i * 4 + 1] = G[i] as number;
    img[i * 4 + 2] = B[i] as number;
    img[i * 4 + 3] = 255;
  });
}

/** La bruma, sin premultiplicar otra vez. */
function lienzoDeLaBruma(w: number, h: number, planos: readonly Float32Array[]): Lienzo {
  const [R, G, B, A] = planos as [Float32Array, Float32Array, Float32Array, Float32Array];
  return aLienzo(w, h, (img, i) => {
    const al = A[i] as number;
    if (al <= 0) return;
    img[i * 4] = (R[i] as number) / al;
    img[i * 4 + 1] = (G[i] as number) / al;
    img[i * 4 + 2] = (B[i] as number) / al;
    img[i * 4 + 3] = al * 255;
  });
}

/** Los bancos: blanco, con su opacidad en el alfa. */
function lienzoDeLosBancos(w: number, h: number, a: Float32Array): Lienzo {
  return aLienzo(w, h, (img, i) => {
    img[i * 4] = 255;
    img[i * 4 + 1] = 255;
    img[i * 4 + 2] = 255;
    img[i * 4 + 3] = (a[i] as number) * 255;
  });
}

function aLienzo(w: number, h: number, poner: (img: Uint8ClampedArray, i: number) => void): Lienzo {
  const { lienzo, c } = lienzoCon(w, h);
  const img = c.createImageData(w, h);
  for (let i = 0; i < w * h; i++) poner(img.data, i);
  c.putImageData(img, 0, 0);
  return lienzo;
}
