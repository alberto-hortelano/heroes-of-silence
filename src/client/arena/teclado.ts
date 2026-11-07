/**
 * El teclado de la arena (R8 de la reorganización, 07-11-2026: estaba en `main.ts`): un oyente de
 * `keydown` en `document`. Con el editor de la batalla o la rueda abiertos, las teclas son suyas;
 * fuera del tablero (la vista de equipo a media pelea) no juegan; en la pelea, las de la partida
 * (`GestosDeBatalla.tecla`). Las del campo del nombre de una ficha van antes, en la captura
 * (`cambios.ts`). Nada se registra al importarse: lo instala `main.ts`, en su sitio, tras los
 * cambios.
 */
import type { PaginaDeLaArena } from './pagina.js';

/** Instala el oyente del teclado (la cabecera del fichero). */
export function instalarElTeclado(pagina: PaginaDeLaArena): void {
  const { vista, gestos, editor, elRueda } = pagina;
  document.addEventListener('keydown', (ev) => {
    // Con el editor abierto, las teclas son suyas: Escape lo cierra (el `<dialog>`)
    // sin soltar lo elegido, y un espacio en un campo no cierra el turno. Con la
    // rueda, igual: son suyas.
    if (editor.open || elRueda.open) return;
    // Fuera del tablero —la vista de equipo a media pelea— las teclas no juegan:
    // un espacio en un campo de pieza cerraba el turno de tu unidad.
    if (vista.escena !== 'battle') return;
    // Las teclas de la batalla, las de la partida (`GestosDeBatalla.tecla`): Escape suelta
    // lo que espera el clic, las flechas mueven al elegido del despliegue, la Q alterna el
    // arma y Espacio cierra el turno de tu unidad activa.
    gestos.tecla(ev);
  });
}
