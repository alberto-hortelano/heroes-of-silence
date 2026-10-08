/**
 * Las piezas sueltas que pinta el juego —los recursos y el cofre— colocadas por su pie.
 *
 * Cada `assets/mapa/<pieza>.json` está **derivado de la imagen** por el taller
 * (`ancho`, `alto` y `ancla`: el centro de su base, en píxeles de la imagen), y
 * se importa tal cual: las cifras no se copian aquí (#120). Sin la imagen no se
 * pinta nada y quien llama pone su marcador.
 */
import cofre from '../../../assets/mapa/cofre.json' with { type: 'json' };
import madera from '../../../assets/mapa/madera.json' with { type: 'json' };
import oro from '../../../assets/mapa/oro.json' with { type: 'json' };
import piedra from '../../../assets/mapa/piedra.json' with { type: 'json' };
import { asset, type PiezaDelMapa } from './assets.js';
import { copiaReducida } from './copias.js';
import { densidadDe } from './lienzo.js';

interface Medidas {
  readonly ancho: number;
  readonly alto: number;
  readonly ancla: readonly number[];
}

const MEDIDAS: Readonly<Record<PiezaDelMapa, Medidas>> = {
  oro,
  piedra,
  madera,
  cofre,
};

/**
 * Pinta `pieza` con su ancla en (`x`, `suelo`) y `ancho` píxeles de ancho.
 * Devuelve `false` si la imagen no ha llegado: quien llama pinta su marcador.
 */
export function pintarPieza(
  ctx: CanvasRenderingContext2D,
  pieza: PiezaDelMapa,
  x: number,
  suelo: number,
  ancho: number,
): boolean {
  const img = asset('mapa', pieza);
  if (img === null) return false;
  const m = MEDIDAS[pieza];
  const [ax, ay] = m.ancla;
  if (ax === undefined || ay === undefined) {
    throw new Error(`la pieza ${pieza} no trae un ancla de dos cifras en su .json`);
  }
  const escala = ancho / m.ancho;
  const dpr = densidadDe(ctx);
  // Las piezas vienen a 1024 de ancho y se pintan a 60-250: se copian ya
  // reducidas, de la misma caché que los volúmenes de la escena.
  const w = Math.max(1, Math.round(ancho * dpr));
  const lienzo = copiaReducida(img, `pieza/${pieza}`, undefined, w, (m.alto * w) / m.ancho);
  ctx.drawImage(lienzo, x - ax * escala, suelo - ay * escala, m.ancho * escala, m.alto * escala);
  return true;
}
