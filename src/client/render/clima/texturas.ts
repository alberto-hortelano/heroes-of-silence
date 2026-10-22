/**
 * Las texturas del clima, hechas una vez y en caché: los bancos de niebla, una
 * baldosa que se repite sin costura. Con el ruido del suelo (`ruidoDe` y `fbm`,
 * `escenario/fronteras.ts`), que da la vuelta, y no con `Math.random`
 * (`invariantes.test.ts`): la misma en cada página y en cada carga.
 */
import { hashDeTexto } from '@core/rng.js';
import { fbm, ruidoDe } from '../escenario/fronteras.js';
import { type Lienzo, lienzoCon } from '../escenario/pintar.js';

/** El lado de la baldosa de la niebla, en píxeles. */
const LADO_DE_LA_NIEBLA = 256;

let niebla: Lienzo | null = null;

/**
 * Los bancos de niebla: blanco con la opacidad de un ruido de tres octavas
 * cortado por abajo, así que hay huecos claros entre banco y banco. El color lo
 * pone quien la pinta (con `source-in`); aquí solo va la forma.
 */
export function bancosDeNiebla(): Lienzo {
  if (niebla !== null) return niebla;
  const L = LADO_DE_LA_NIEBLA;
  const ruido = ruidoDe(
    hashDeTexto('clima|niebla'),
    [
      [L / 4, 0.55],
      [L / 8, 0.3],
      [L / 16, 0.15],
    ],
    L,
    L,
    true,
  );
  const { lienzo, c } = lienzoCon(L, L);
  const img = c.createImageData(L, L);
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      // Del 0,32 al 0,72, con su curva: bancos con borde blando y claros entre ellos.
      const t = Math.min(1, Math.max(0, (fbm(ruido, x, y) - 0.32) / 0.4));
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
