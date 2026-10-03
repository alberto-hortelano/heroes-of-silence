/**
 * El relieve visual: un nivel de altura por casilla y las caras de roca donde el
 * terreno cae. El motor no tiene alturas; esto es solo cómo se pinta (las
 * mesetas, los barrancos y los acantilados de la referencia) y se deduce del
 * suelo y de las barreras.
 *
 * La cámara mira desde el sur: una caída hacia abajo en pantalla enseña su cara
 * de roca; una caída hacia arriba queda de espaldas y solo se ve el reborde.
 */
import type { Suelo } from '../../../src/core/map/terrain.js';
import type { Analisis } from './analizar.js';

/**
 * El nivel de una región. No es un nivel por suelo —eso convertía cada frontera
 * en un escalón y el usuario lo descartó (03-10-2026)—: el relieve es variado.
 * La ciénaga va abajo; la nieve, la lava y las regiones rodeadas de montaña,
 * arriba; el resto casi todo al mismo nivel, con alguna meseta suelta. Dos
 * regiones al mismo nivel se separan por un río o un cañón, no por un escalón.
 */
export function nivelDeRegion(suelo: Suelo, montana: number, tirada: number): number {
  if (suelo === 'swamp') return 0;
  if (suelo === 'snow' || suelo === 'lava') return 2;
  if (montana > 0.2) return 2;
  if (suelo === 'rough') return tirada < 0.5 ? 2 : 1;
  return tirada < 0.15 ? 2 : 1;
}

/**
 * Cuánto mide en pantalla un nivel de altura, en casillas. A 1 la cara colgaba
 * una casilla entera y tapaba medio río de un cañón de dos de ancho.
 */
export const ALTO_DE_NIVEL = 0.6;

/** El material de la cara de roca, por el suelo de arriba. */
export const CARA_DE_SUELO: Readonly<Record<Suelo, string>> = {
  swamp: 'cara-roca',
  grass: 'cara-roca',
  dirt: 'cara-roca',
  rough: 'cara-roca',
  sand: 'cara-arenisca',
  snow: 'cara-nevada',
  lava: 'cara-basalto',
};

export interface Cara {
  /** La fila de la casilla alta; la cara cuelga de su borde de abajo. */
  readonly y: number;
  /** De qué columna a qué columna (incluidas) corre la cara. */
  readonly x0: number;
  readonly x1: number;
  /** Cuántos niveles cae. */
  readonly caida: number;
  readonly material: string;
}

export interface Relieve {
  readonly nivel: Int8Array;
  /** Caídas hacia el sur: se ve la cara. */
  readonly caras: readonly Cara[];
  /** Caídas al este o al oeste, como `[x, y, lado]`: un canto y rocas. */
  readonly cantos: readonly (readonly [number, number, 'este' | 'oeste'])[];
  /** Caídas hacia el norte (de espaldas): solo el reborde, como `[x, y]` de la casilla alta. */
  readonly rebordes: readonly (readonly [number, number])[];
}

export function relieve(a: Analisis, semilla = 1): Relieve {
  const { W, H, terreno, suelo, franjaDe, franjas, fuente, region, regiones } = a;
  // Cuánta montaña rodea cada región: casillas de montaña cuyo suelo más cercano es suyo.
  const montana = new Float64Array(regiones.length);
  for (let i = 0; i < W * H; i++) {
    if (terreno[i] !== 'mountain') continue;
    const r = region[fuente[i] as number] as number;
    if (r >= 0) montana[r] = (montana[r] as number) + 1;
  }
  let s = (semilla * 2654435761) >>> 0;
  const tirada = () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x6d2b79f5) >>> 0;
    return s / 4294967296;
  };
  const nivelR = regiones.map((r) =>
    nivelDeRegion(r.suelo, (montana[r.id] as number) / Math.max(1, r.casillas), tirada()),
  );
  const nivel = new Int8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = region[fuente[i] as number] as number;
    nivel[i] = r >= 0 ? (nivelR[r] as number) : 1;
  }
  const base = Int8Array.from(nivel);
  // Lo más bajo y lo más alto que tiene alrededor cada franja: un río o un cañón
  // va entero a UN nivel, uno por debajo de su orilla más baja. Tomándolo casilla
  // a casilla de la orilla más cercana, medio río quedaba un nivel más alto que
  // el otro medio y el cañón salía en tres escalones.
  const bajo = franjas.map(() => 9);
  const alto = franjas.map(() => -9);
  for (let i = 0; i < W * H; i++) {
    const f = franjaDe[i] as number;
    if (f === -1) continue;
    bajo[f] = Math.min(bajo[f] as number, base[i] as number);
    alto[f] = Math.max(alto[f] as number, base[i] as number);
  }
  for (let i = 0; i < W * H; i++) {
    const f = franjaDe[i] as number;
    if (f === -1) continue;
    const franja = franjas[f];
    if (franja === undefined) continue;
    const t = terreno[i];
    const lo = bajo[f] as number;
    const hi = alto[f] as number;
    // El agua va encajada: un nivel por debajo de su orilla más baja. El barranco.
    if (t === 'water') nivel[i] = Math.max(-1, lo - 1);
    // Una mancha de acantilado dentro de una región es una mesa: un nivel más.
    else if (t === 'cliff' && franja.uso === 'obstaculo') nivel[i] = (base[i] as number) + 1;
    // Entre dos lados a distinta altura, el acantilado es el escalón (va arriba);
    // entre dos al mismo nivel, es un cañón cortado hacia abajo.
    else if (t === 'cliff') nivel[i] = hi > lo ? hi : Math.max(-1, lo - 1);
  }

  // Una escalera de caídas seguidas (2 → 1 → 0 bajando por la pantalla) daba
  // una pared por peldaño, en terrazas paralelas. Se funde en una sola caída
  // más alta: el peldaño intermedio sube al nivel de arriba. El agua no sube,
  // que va siempre encajada.
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (let y = 1; y < H - 1; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (terreno[i] === 'water') continue;
        const arriba = nivel[i - W] as number;
        const aqui = nivel[i] as number;
        const abajo = nivel[i + W] as number;
        if (aqui < arriba && abajo < aqui) {
          nivel[i] = arriba;
          cambio = true;
        }
      }
  }

  const caras: Cara[] = [];
  const cantos: [number, number, 'este' | 'oeste'][] = [];
  const rebordes: [number, number][] = [];
  for (let y = 0; y < H; y++) {
    let tramo: { x0: number; caida: number; material: string } | null = null;
    const cerrar = (x: number) => {
      if (tramo !== null)
        caras.push({ y, x0: tramo.x0, x1: x - 1, caida: tramo.caida, material: tramo.material });
      tramo = null;
    };
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const aqui = nivel[i] as number;
      const abajo = y + 1 < H ? (nivel[i + W] as number) : aqui;
      const caida = aqui - abajo;
      if (caida > 0) {
        const material = CARA_DE_SUELO[suelo[i] as Suelo];
        const t = tramo as { x0: number; caida: number; material: string } | null;
        if (t === null || t.caida !== caida || t.material !== material) {
          cerrar(x);
          tramo = { x0: x, caida, material };
        }
      } else cerrar(x);
      if (y > 0 && aqui > (nivel[i - W] as number)) rebordes.push([x, y]);
      if (x + 1 < W && aqui > (nivel[i + 1] as number)) cantos.push([x, y, 'este']);
      if (x > 0 && aqui > (nivel[i - 1] as number)) cantos.push([x, y, 'oeste']);
    }
    cerrar(W);
  }
  return { nivel, caras, cantos, rebordes };
}
