/**
 * El fotograma de la arena (`dibujarFotograma`, el que pinta el bucle de `main.ts`): fuera de la
 * pelea, la barra y las figuras de lo que se ve; en ella, el tablero, el panel y la barra de
 * arriba (solo cuando la sesión cambia o el tablero empieza o acaba de contar), con el lienzo
 * alargado si la muralla lo pide y el marco colocado al pie del tablero. Era parte de
 * `arena/main.ts` hasta R8 de la reorganización (07-11-2026).
 */
import { ponerEnLaBarra } from '../comun/barra.js';
import { hayFigurasAnimadas } from '../render/figuras/figura.js';
import type { SesionDeArena } from '../sesion/sesion-de-arena.js';
import { pintarSiguiendoElFinal } from '../views/al-final.js';
import { AVISO_DE_ESPERA } from '../views/cifras.js';
import { animarFiguras } from './figuras.js';
import type { PaginaDeLaArena } from './pagina.js';
import { renderPanelDeBatalla, rotuloDelTurno } from './paneles/batalla.js';

function alargarLienzo(pagina: PaginaDeLaArena): void {
  const { pelea, batalla, principal, app, canvas, elLienzo } = pagina;
  const visible = elLienzo.clientHeight;
  const pide = (): number =>
    pelea.sesion === null ? visible : batalla.altoDelLienzo(elLienzo.clientWidth, visible);
  // Dos veces: con el marco desplazable, la barra le quita ancho, y el alto que
  // pide el tablero sale de ese ancho.
  app.toggleAttribute('data-muralla', pide() > visible + 0.5);
  const alto = pide();
  const css = alto > visible + 0.5 ? `${Math.ceil(alto)}px` : '';
  if (canvas.style.height === css) return;
  const alargado = canvas.style.height === '';
  canvas.style.height = css;
  principal.remedir();
  if (alargado && css !== '') pelea.colocarElMarco = true;
}

/** Tras pintar con el lienzo alargado: el final del tablero, al pie del marco. */
function colocarMarco(pagina: PaginaDeLaArena): void {
  const { pelea, batalla, elLienzo } = pagina;
  if (!pelea.colocarElMarco) return;
  pelea.colocarElMarco = false;
  elLienzo.scrollTop = Math.max(0, batalla.pieDelTablero() - elLienzo.clientHeight);
}

/** Un fotograma del bucle (`pedirFotograma`): lo pinta y dice si se pide otro. */
export function dibujarFotograma(pagina: PaginaDeLaArena, ahora: number): boolean {
  const { vista, pelea, batalla, rueda, elStatus } = pagina;
  // En la vista de equipo, también a media pelea, la barra es la de la página.
  if (pelea.sesion === null || vista.escena === 'equipo' || vista.escena === 'magia') {
    if (elStatus.textContent !== vista.aviso) elStatus.textContent = vista.aviso;
    return animarFiguras(pagina, ahora);
  }
  dibujarBatalla(pagina, ahora, pelea.sesion);
  // Las figuras de los dos de la rueda (su cabecera, `DialogoDeLaRueda.animar`).
  const enLaRueda = rueda.animar(ahora);
  return enLaRueda || hayFigurasAnimadas() || batalla.ocupada;
}

function dibujarBatalla(pagina: PaginaDeLaArena, ahora: number, s: SesionDeArena): void {
  const { pelea, batalla, principal, rueda, elDay, elTurn, elStatus, elSide } = pagina;
  alargarLienzo(pagina);
  const rect = principal.preparar();
  principal.ctx.clearRect(0, 0, rect.width, rect.height);
  batalla.sincronizar(ahora);
  batalla.dibujar(principal.ctx, rect.width, rect.height);
  colocarMarco(pagina);
  const ocupada = batalla.ocupada;
  const version = s.version;
  if (
    pelea.paneles === null ||
    pelea.paneles.version !== version ||
    pelea.paneles.ocupada !== ocupada
  ) {
    pelea.paneles = { version, ocupada };
    // El parte se lee de arriba abajo y lo último queda al fondo: sigue ahí, o
    // al acabar no se veía lo que acababa de pasar (M11 de QA), salvo que la
    // persona haya subido a leer (#198).
    pintarSiguiendoElFinal(elSide, renderPanelDeBatalla(s, ocupada));
    // La barra de arriba, igual que el panel: mientras se cuenta no adelanta ni
    // la ronda ni el final.
    elDay.textContent = ocupada
      ? 'Batalla'
      : s.battle.despliegue !== null
        ? 'Batalla · despliegue'
        : `Batalla · ronda ${s.battle.round}`;
    elTurn.textContent = rotuloDelTurno(s, ocupada);
  }
  // «La batalla ha terminado» espera a que el tablero llegue al final; el aviso de
  // espera no: un clic durante el último desenlace de la rueda se perdía sin decir
  // nada (H4 de QA, 19-10-2026), y el aviso no adelanta el final.
  const estado =
    ocupada && s.battle.finished !== null && s.status !== AVISO_DE_ESPERA ? '' : s.status;
  ponerEnLaBarra(elStatus, estado, pagina.canvas);
  rueda.pintar();
}
