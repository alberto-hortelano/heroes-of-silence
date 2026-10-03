/**
 * El óvalo de sombra de una figura cuya imagen no ha llegado, rescatado de
 * `aventura/actor-shadow.ts` de la rama `archivo/gpt-rpg`. Con la imagen, la
 * sombra es su silueta (`pintarSombraDeFigura`, en `figura.ts`).
 *
 * Se pinta ANTES de la figura y cae hacia donde dice la luz, que es una para
 * todas: no depende de hacia dónde mire nadie.
 */
import { colorDeSombra, sombraDeFigura } from '../../shared/arte.js';

/**
 * El fundido de la sombra, uno por opacidad. Se dibuja en coordenadas propias
 * (la transformación lo estira y lo gira), así que el mismo gradiente vale para
 * todas las figuras: crear uno por figura y por fotograma era trabajo tirado.
 */
const fundidos = new Map<number, CanvasGradient>();

function fundidoDe(ctx: CanvasRenderingContext2D, opacidad: number): CanvasGradient {
  const guardado = fundidos.get(opacidad);
  if (guardado !== undefined) return guardado;
  const fundido = ctx.createRadialGradient(0.42, 0, 0.08, 0.42, 0, 0.6);
  fundido.addColorStop(0, colorDeSombra(opacidad));
  fundido.addColorStop(1, colorDeSombra(0));
  fundidos.set(opacidad, fundido);
  return fundido;
}

export function pintarSombra(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  altura: number,
): void {
  const sombra = sombraDeFigura(altura);
  const largo = Math.hypot(sombra.x, sombra.y);
  ctx.save();
  ctx.translate(x, y - 2);
  ctx.rotate(Math.atan2(sombra.y, sombra.x));
  ctx.scale(largo + altura * 0.08, altura * 0.11);
  ctx.fillStyle = fundidoDe(ctx, sombra.opacidad);
  ctx.fillRect(-0.2, -0.65, 1.3, 1.3);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = colorDeSombra(0.22);
  ctx.beginPath();
  ctx.ellipse(x, y - 2, altura * 0.13, altura * 0.028, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
