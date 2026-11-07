/**
 * El puntero de la arena sobre el tablero de la pelea (R8 de la reorganización, 07-11-2026: estaba
 * en `main.ts`): mover, soltar y salir del lienzo, que reparten los gestos de la batalla, los de la
 * partida (`GestosDeBatalla`). Nada se registra al importarse: lo instala `main.ts`, en su sitio.
 */
import type { PaginaDeLaArena } from './pagina.js';

/** El punto del puntero en el lienzo, en píxeles CSS desde su esquina. */
function enLienzo(
  canvas: HTMLCanvasElement,
  ev: { clientX: number; clientY: number },
): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

/**
 * Los oyentes del puntero sobre el tablero, en el orden de siempre (mover, soltar, salir): los
 * reparten los gestos de la batalla (`GestosDeBatalla`). Eran oyentes de primer nivel de `main.ts`
 * hasta R8 de la reorganización (07-11-2026).
 */
export function instalarElPuntero(pagina: PaginaDeLaArena): void {
  const { pelea, pedirFotograma, gestos, canvas } = pagina;
  canvas.addEventListener('pointermove', (ev) => {
    if (pelea.sesion === null) return;
    const p = enLienzo(canvas, ev);
    gestos.mover(p.x, p.y);
    pedirFotograma();
  });

  canvas.addEventListener('pointerup', (ev) => {
    if (ev.button !== 0 || pelea.sesion === null) return;
    const p = enLienzo(canvas, ev);
    gestos.soltar(p.x, p.y);
    pedirFotograma();
  });

  canvas.addEventListener('pointerleave', () => {
    gestos.salir();
    pedirFotograma();
  });
}
