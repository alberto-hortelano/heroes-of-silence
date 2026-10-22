/**
 * El clima por región en el mapa: qué región del clima hay bajo cada punto del
 * mundo, con el borde entre dos movido por un ruido para que se lea como un
 * **frente** y no como el contorno por casillas de la niebla de guerra
 * (`regionEnElFrente`), y dos máscaras del mundo hechas con esa misma regla: el
 * velo de cada región (su tiempo y su noche, en color) y dónde hay bancos de
 * niebla. Se hacen al cambiar el clima del mapa (un día, un pedido del narrador,
 * un `?clima=`), no en cada fotograma.
 */

import type { MapaDeRed } from '@core/map/regiones.js';
import { createRng, hashDeTexto } from '@core/rng.js';
import { type ClimaDeLaPartida, type ClimaDelSitio, regionDelClima } from '@core/state/clima.js';
import { EFECTOS, veloDe } from './recetas.js';

/** Píxeles por casilla de las máscaras del mundo: se amplían con suavizado, y el frente es blando. */
export const PX_DE_LA_MASCARA = 8;
/** Cada cuántas casillas cambia de sentido el ruido del frente. */
const PASO_DEL_FRENTE = 2.5;
/** Cuánto se mueve el frente, como mucho, desde el borde de casillas: una casilla y algo. */
const AMPLITUD_DEL_FRENTE = 1.2;
/** El radio del desenfoque del frente, en píxeles de la máscara (dos pasadas de caja). */
const BLANDURA_DEL_FRENTE = 3;

/** La región del clima bajo un punto del mundo (casillas con decimales), o −1 fuera. */
export type RegionEnElFrente = (x: number, y: number) => number;

const frentes = new WeakMap<MapaDeRed, { semilla: number; f: RegionEnElFrente }>();

/**
 * La región del clima en el punto `(x, y)` del mundo, mirando un poco más allá:
 * dos ruidos de valor de la semilla (uno por eje) desplazan la casilla que se
 * pregunta hasta `AMPLITUD_DEL_FRENTE`, así que el borde entre dos regiones
 * ondula y cruza las casillas en vez de seguirlas. Lo comparten las máscaras y
 * la lluvia, que pregunta gota a gota: los dos ven el mismo frente.
 */
export function regionEnElFrente(mapa: MapaDeRed, semilla: number): RegionEnElFrente {
  const hecho = frentes.get(mapa);
  if (hecho !== undefined && hecho.semilla === semilla) return hecho.f;
  const { width: W, height: H } = mapa;
  const region = regionDelClima(mapa);
  const nx = Math.ceil(W / PASO_DEL_FRENTE) + 2;
  const ny = Math.ceil(H / PASO_DEL_FRENTE) + 2;
  const rng = createRng(hashDeTexto(`clima|frente|${semilla}`));
  const rejillaX = Float32Array.from({ length: nx * ny }, () => rng.next() * 2 - 1);
  const rejillaY = Float32Array.from({ length: nx * ny }, () => rng.next() * 2 - 1);
  const suave = (t: number): number => t * t * (3 - 2 * t);
  const ruido = (g: Float32Array, x: number, y: number): number => {
    const u = Math.max(0, x / PASO_DEL_FRENTE);
    const v = Math.max(0, y / PASO_DEL_FRENTE);
    const i = Math.min(nx - 2, Math.floor(u));
    const j = Math.min(ny - 2, Math.floor(v));
    const fx = suave(Math.min(1, u - i));
    const fy = suave(Math.min(1, v - j));
    const a = (g[j * nx + i] as number) * (1 - fx) + (g[j * nx + i + 1] as number) * fx;
    const b = (g[(j + 1) * nx + i] as number) * (1 - fx) + (g[(j + 1) * nx + i + 1] as number) * fx;
    return a * (1 - fy) + b * fy;
  };
  const f: RegionEnElFrente = (x, y) => {
    const cx = Math.floor(x + ruido(rejillaX, x, y) * AMPLITUD_DEL_FRENTE);
    const cy = Math.floor(y + ruido(rejillaY, x, y) * AMPLITUD_DEL_FRENTE);
    const i = Math.min(W - 1, Math.max(0, cx));
    const j = Math.min(H - 1, Math.max(0, cy));
    return region[j * W + i] as number;
  };
  frentes.set(mapa, { semilla, f });
  return f;
}

export interface MascarasDelMapa {
  /** El velo de cada región (su tiempo y su noche), en color, o `null` si nadie lleva. */
  readonly velo: HTMLCanvasElement | null;
  /** Dónde hay bancos de niebla (en el alfa), o `null` si no hay niebla en el mapa. */
  readonly niebla: HTMLCanvasElement | null;
}

let ultima: {
  mapa: MapaDeRed;
  semilla: number;
  firma: string;
  mascaras: MascarasDelMapa;
} | null = null;

const firmaDe = (c: ClimaDeLaPartida): string =>
  c.regiones.map((r) => `${r.tiempo}${r.noche ? '*' : ''}`).join(',');

/** Las máscaras del clima de hoy en este mapa: la última se guarda (una partida por página). */
export function mascarasDelMapa(
  mapa: MapaDeRed,
  semilla: number,
  clima: ClimaDeLaPartida,
): MascarasDelMapa {
  const firma = firmaDe(clima);
  if (
    ultima !== null &&
    ultima.mapa === mapa &&
    ultima.semilla === semilla &&
    ultima.firma === firma
  ) {
    return ultima.mascaras;
  }
  const mascaras = hacerMascaras(mapa, semilla, clima.regiones);
  ultima = { mapa, semilla, firma, mascaras };
  return mascaras;
}

function hacerMascaras(
  mapa: MapaDeRed,
  semilla: number,
  regiones: readonly ClimaDelSitio[],
): MascarasDelMapa {
  const velos = regiones.map(veloDe);
  const conNiebla = regiones.map((r) => EFECTOS[r.tiempo].niebla !== null);
  const hayVelo = velos.some((v) => v !== null);
  const hayNiebla = conNiebla.some(Boolean);
  if (!hayVelo && !hayNiebla) return { velo: null, niebla: null };

  const P = PX_DE_LA_MASCARA;
  const w = mapa.width * P;
  const h = mapa.height * P;
  const enFrente = regionEnElFrente(mapa, semilla);
  // Premultiplicado, para que el desenfoque no saque un cerco del color de la
  // región de al lado donde una de las dos no lleva velo.
  const color = hayVelo ? new Float32Array(w * h * 4) : null;
  const alfa = hayNiebla ? new Float32Array(w * h) : null;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const k = enFrente((px + 0.5) / P, (py + 0.5) / P);
      if (k < 0) continue;
      const i = py * w + px;
      const v = velos[k];
      if (color !== null && v !== null && v !== undefined) {
        color[i * 4] = v[0] * v[3];
        color[i * 4 + 1] = v[1] * v[3];
        color[i * 4 + 2] = v[2] * v[3];
        color[i * 4 + 3] = v[3];
      }
      if (alfa !== null && conNiebla[k] === true) alfa[i] = 1;
    }
  }
  let velo: HTMLCanvasElement | null = null;
  if (color !== null) {
    desenfocar(color, w, h, 4);
    velo = aLienzo(w, h, (img) => {
      for (let i = 0; i < w * h; i++) {
        const a = color[i * 4 + 3] as number;
        if (a <= 0) continue;
        img[i * 4] = (color[i * 4] as number) / a;
        img[i * 4 + 1] = (color[i * 4 + 1] as number) / a;
        img[i * 4 + 2] = (color[i * 4 + 2] as number) / a;
        img[i * 4 + 3] = a * 255;
      }
    });
  }
  let niebla: HTMLCanvasElement | null = null;
  if (alfa !== null) {
    desenfocar(alfa, w, h, 1);
    niebla = aLienzo(w, h, (img) => {
      for (let i = 0; i < w * h; i++) {
        img[i * 4] = 255;
        img[i * 4 + 1] = 255;
        img[i * 4 + 2] = 255;
        img[i * 4 + 3] = (alfa[i] as number) * 255;
      }
    });
  }
  return { velo, niebla };
}

function aLienzo(
  w: number,
  h: number,
  llenar: (img: Uint8ClampedArray) => void,
): HTMLCanvasElement {
  const lienzo = document.createElement('canvas');
  lienzo.width = w;
  lienzo.height = h;
  const c = lienzo.getContext('2d');
  if (c === null) throw new Error('este navegador no tiene canvas 2D para el clima del mapa');
  const img = c.createImageData(w, h);
  llenar(img.data);
  c.putImageData(img, 0, 0);
  return lienzo;
}

/**
 * Dos pasadas de caja de radio `BLANDURA_DEL_FRENTE` por eje, en el sitio: lo
 * que hace blando el frente. Con ventana deslizante, el coste no depende del
 * radio; en JS y no con `ctx.filter`, que no todos los navegadores tienen.
 */
function desenfocar(datos: Float32Array, w: number, h: number, canales: number): void {
  const r = BLANDURA_DEL_FRENTE;
  const tmp = new Float32Array(Math.max(w, h) * canales);
  const pasada = (largo: number, otros: number, indice: (a: number, b: number) => number): void => {
    for (let b = 0; b < otros; b++) {
      for (let c = 0; c < canales; c++) {
        let suma = 0;
        for (let a = -r; a <= r; a++)
          suma += datos[indice(Math.min(largo - 1, Math.max(0, a)), b) * canales + c] as number;
        for (let a = 0; a < largo; a++) {
          tmp[a * canales + c] = suma / (2 * r + 1);
          const sale = Math.max(0, a - r);
          const entra = Math.min(largo - 1, a + r + 1);
          suma +=
            (datos[indice(entra, b) * canales + c] as number) -
            (datos[indice(sale, b) * canales + c] as number);
        }
      }
      for (let a = 0; a < largo; a++) {
        for (let c = 0; c < canales; c++)
          datos[indice(a, b) * canales + c] = tmp[a * canales + c] as number;
      }
    }
  };
  for (let vez = 0; vez < 2; vez++) {
    pasada(w, h, (x, y) => y * w + x);
    pasada(h, w, (y, x) => y * w + x);
  }
}
