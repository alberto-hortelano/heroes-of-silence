/**
 * Los diálogos de la partida que pinta el fotograma desde la sesión (R7 de la reorganización,
 * 07-11-2026: estaban en `main.ts`): la conversación con una persona de la base o de un lugar,
 * no modal, y los tres modales de la guarnición —dejar y recoger, la defensa y el aviso de un
 * ataque—, con lo que hace Escape en cada uno (su `cancel`). La rueda del golpe tiene su pieza
 * (`batalla/rueda/dialogo.ts`), y «¿Volver al menú?» lo abren y lo cierran sus botones
 * (`clic.ts`).
 */
import { type Html, pintar } from '../comun/html.js';
import { renderAviso } from './aviso.js';
import { renderConversacion } from './base/panel.js';
import { renderDefensa, renderGuarnicion, renderLoQueSobra } from './guarnicion.js';
import { renderConversacionDelLugar } from './lugar/panel.js';
import type { PaginaDeLaPartida } from './pagina.js';

/**
 * La conversación con una persona de la base: un `<dialog>` no modal sobre el
 * lienzo, que se abre cuando quien camina llega a su lado y se cierra con
 * «Seguir», con Escape o con un clic en el suelo. Se rellena por la puerta del
 * marcado, como los paneles: el nombre y la línea los puede escribir el agente.
 */
export function mostrarConversacion(
  pagina: Pick<PaginaDeLaPartida, 'conversacion' | 'session' | 'castillo'>,
  enCastillo: boolean,
  enUnLugar: boolean,
): void {
  const { conversacion, session, castillo } = pagina;
  // La de un lugar de un mundo: su árbol, con las opciones (`partida/lugar/panel.ts`).
  if (enUnLugar) {
    const c = session.lugar.conversacion();
    if (c === null) {
      if (conversacion.open) conversacion.close();
      return;
    }
    pintar(conversacion, renderConversacionDelLugar(c));
    if (!conversacion.open) conversacion.show();
    return;
  }
  const a = enCastillo ? castillo.abierto : null;
  if (a === null || a.tipo !== 'pnj') {
    if (conversacion.open) conversacion.close();
    return;
  }
  pintar(conversacion, renderConversacion(session, a.id));
  if (!conversacion.open) conversacion.show();
}

/**
 * Las dos pantallas de la guarnición, modales: la de dejar y recoger (la abre la
 * sesión al parar en un sitio propio o con el botón) y la de la defensa (al ser
 * atacado en él). Se pintan desde la sesión, como la conversación; Escape las
 * cierra por su `cancel` (la defensa, con la propuesta de la IA).
 */
export function mostrarLaGuarnicion(
  pagina: Pick<
    PaginaDeLaPartida,
    'elGuarnicion' | 'elDefensa' | 'elAviso' | 'elSobrantes' | 'session'
  >,
): void {
  const { elGuarnicion, elDefensa, elAviso, elSobrantes, session } = pagina;
  const vista = session.vistaDeLaGuarnicion();
  mostrarModal(elGuarnicion, vista === null ? null : renderGuarnicion(vista));
  const defensa = session.defensa;
  mostrarModal(elDefensa, defensa === null ? null : renderDefensa(defensa));
  const aviso = session.avisoDelAtaque;
  mostrarModal(elAviso, aviso === null ? null : renderAviso(aviso));
  const sobran = session.sobrantes;
  mostrarModal(elSobrantes, sobran === null ? null : renderLoQueSobra(sobran));
}

/** Un `<dialog>` modal con `contenido`, o cerrado si no hay nada que enseñar. */
function mostrarModal(el: HTMLDialogElement, contenido: Html | null): void {
  if (contenido === null) {
    if (el.open) el.close();
    return;
  }
  pintar(el, contenido);
  if (!el.open) el.showModal();
}

/** Lo que hace Escape en los tres modales (su `cancel`). Los registra `main.ts`, en su orden. */
export function instalarLosDialogos(
  pagina: Pick<
    PaginaDeLaPartida,
    'elGuarnicion' | 'elAviso' | 'elDefensa' | 'elSobrantes' | 'session' | 'pedirFotograma'
  >,
): void {
  const { elGuarnicion, elAviso, elDefensa, elSobrantes, session, pedirFotograma } = pagina;
  elGuarnicion.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    session.cerrarLaGuarnicion();
    pedirFotograma();
  });
  // El aviso no se despide con Escape: la batalla llega igual, y se elige cómo.
  elAviso.addEventListener('cancel', (ev) => ev.preventDefault());
  // Ni lo que sobra: la batalla no se cierra hasta elegir qué se deja (P2).
  elSobrantes.addEventListener('cancel', (ev) => ev.preventDefault());
  elDefensa.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    session.dejarLaDefensaDeLaIA();
    pedirFotograma();
  });
}
