/**
 * La niebla de guerra del mapa (`pintarNiebla`): negra sobre lo que no se ha explorado y
 * tenue sobre lo que no se mira ahora, en una máscara de un píxel por casilla escalada
 * con suavizado, que se rehace solo cuando cambia lo explorado o lo que se ve. Era parte
 * de `render/mapa/mapa.ts` hasta la fase C de la reorganización (07-11-2026).
 */
import type { CasillasLeidas } from '@core/map/casillas.js';
import { mundoAPixel } from './camara.js';
import type { VistaMapa } from './mapa.js';

/**
 * La niebla como máscara de un píxel por casilla, escalada con suavizado: los
 * bordes salen difuminados sin calcular ninguna curva, y lo desconocido queda
 * negro de verdad aunque haya algo debajo.
 *
 * La máscara se rehace solo cuando crece lo explorado o cambia lo que se ve
 * ahora (`visibles` es otro objeto cuando la sesión lo recalcula); el resto de
 * fotogramas es un solo `drawImage`. Antes eran 576 `fillRect` a cada uno.
 */
let niebla: {
  lienzo: HTMLCanvasElement;
  explorado: CasillasLeidas | null;
  vistos: number;
  visibles: CasillasLeidas | null;
  ancho: number;
  alto: number;
} | null = null;

function mascaraDeNiebla(v: VistaMapa): HTMLCanvasElement {
  const { width: W, height: H } = v.escena.map;
  const vistos = v.explorado?.size ?? -1;
  if (
    niebla !== null &&
    niebla.explorado === v.explorado &&
    niebla.vistos === vistos &&
    niebla.visibles === v.visibles &&
    niebla.ancho === W &&
    niebla.alto === H
  ) {
    return niebla.lienzo;
  }
  const mascara = niebla?.lienzo ?? document.createElement('canvas');
  // Un marco de una casilla de niebla alrededor del mapa: sin él, el suavizado
  // del borde de la imagen dejaba asomar una línea de terreno por fuera.
  mascara.width = W + 2;
  mascara.height = H + 2;
  const m = mascara.getContext('2d');
  if (m === null) throw new Error('este navegador no tiene canvas 2D para la niebla');
  m.clearRect(0, 0, W + 2, H + 2);
  m.fillStyle = '#080a10';
  if (v.explorado !== null) {
    m.fillRect(0, 0, W + 2, 1);
    m.fillRect(0, H + 1, W + 2, 1);
    m.fillRect(0, 0, 1, H + 2);
    m.fillRect(W + 1, 0, 1, H + 2);
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (v.explorado !== null && !v.explorado.hasIndex(i)) m.fillStyle = '#080a10';
      else if (v.visibles !== null && !v.visibles.hasIndex(i)) m.fillStyle = 'rgba(8,13,22,0.42)';
      else continue;
      m.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  niebla = {
    lienzo: mascara,
    explorado: v.explorado,
    vistos,
    visibles: v.visibles,
    ancho: W,
    alto: H,
  };
  return mascara;
}

export function pintarNiebla(ctx: CanvasRenderingContext2D, v: VistaMapa): void {
  if (v.explorado === null && v.visibles === null) return;
  const { width: W, height: H } = v.escena.map;
  const o = mundoAPixel(v.camara, -1, -1);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  // Bilineal y no la de alta calidad de `drawMapa`: la máscara es de un píxel
  // por casilla y se amplía a la pantalla entera a cada fotograma. Sin GPU, la
  // alta calidad costaba 10 fps en 2560×1440 (22 → 32) para un borde difuminado
  // que se ve igual.
  ctx.imageSmoothingQuality = 'low';
  ctx.drawImage(mascaraDeNiebla(v), o.x, o.y, (W + 2) * v.camara.tile, (H + 2) * v.camara.tile);
  ctx.restore();
}
