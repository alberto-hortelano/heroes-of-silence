/**
 * Las texturas del clima, hechas una vez y en caché: los bancos de niebla, una
 * baldosa que se repite sin costura. Con `createRng` y no con `Math.random`
 * (`invariantes.test.ts`): la misma en cada página y en cada carga.
 */
import { createRng, hashDeTexto } from '@core/rng.js';

/** El lado de la baldosa de la niebla, en píxeles. */
export const LADO_DE_LA_NIEBLA = 256;

/**
 * Ruido de valor que se repite cada `n` celdas: una rejilla de `n × n` valores
 * al azar, interpolada con la curva suave. La rejilla da la vuelta, así que la
 * baldosa casa con su vecina.
 */
function ruidoQueRepite(n: number, semilla: string): (u: number, v: number) => number {
  const rng = createRng(hashDeTexto(semilla));
  const valores = Float32Array.from({ length: n * n }, () => rng.next());
  const en = (i: number, j: number): number =>
    valores[(((j % n) + n) % n) * n + (((i % n) + n) % n)] as number;
  const suave = (t: number): number => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * n;
    const y = v * n;
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = suave(x - i);
    const fy = suave(y - j);
    const a = en(i, j) + (en(i + 1, j) - en(i, j)) * fx;
    const b = en(i, j + 1) + (en(i + 1, j + 1) - en(i, j + 1)) * fx;
    return a + (b - a) * fy;
  };
}

let niebla: HTMLCanvasElement | null = null;

/**
 * Los bancos de niebla: blanco con la opacidad de un ruido de tres octavas
 * cortado por abajo, así que hay huecos claros entre banco y banco. El color lo
 * pone quien la pinta (con `source-in`); aquí solo va la forma.
 */
export function bancosDeNiebla(): HTMLCanvasElement {
  if (niebla !== null) return niebla;
  const L = LADO_DE_LA_NIEBLA;
  const octavas = [
    { f: ruidoQueRepite(4, 'clima|niebla|4'), peso: 0.55 },
    { f: ruidoQueRepite(8, 'clima|niebla|8'), peso: 0.3 },
    { f: ruidoQueRepite(16, 'clima|niebla|16'), peso: 0.15 },
  ];
  const lienzo = document.createElement('canvas');
  lienzo.width = L;
  lienzo.height = L;
  const c = lienzo.getContext('2d');
  if (c === null) throw new Error('este navegador no tiene canvas 2D para la niebla del clima');
  const img = c.createImageData(L, L);
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      let n = 0;
      for (const o of octavas) n += o.f(x / L, y / L) * o.peso;
      // Del 0,32 al 0,72, con su curva: bancos con borde blando y claros entre ellos.
      const t = Math.min(1, Math.max(0, (n - 0.32) / 0.4));
      const i = (y * L + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * t * t * (3 - 2 * t));
    }
  }
  c.putImageData(img, 0, 0);
  niebla = lienzo;
  return lienzo;
}
