/**
 * El teclado de la partida (R7 de la reorganización, 07-11-2026: estaba en `main.ts`): un
 * oyente de `keydown` en `document`. Con un modal abierto, toda tecla es suya; lo que se
 * escribe en un campo es del campo; Escape cierra un nivel (lo de dentro, lo abierto en la
 * base, la base); las teclas de la batalla van a sus gestos (`GestosDeBatalla`), las flechas
 * mueven al elegido de la formación, y en el mapa Espacio pasa el turno (Intro lo confirma), H
 * es el siguiente héroe, T la tropa y + y - el zoom. Nada se registra al importarse: lo instala
 * `main.ts`, en su sitio, tras el clic.
 */
import { FLECHAS_AL_COLOCAR } from '../batalla/colocar.js';
import {
  abrirLaTropa,
  cerrarDentro,
  hastaQueLlegue,
  pasarTurno,
  siguienteHeroe,
} from './gestos.js';
import { esDeDentro, type PaginaDeLaPartida } from './pagina.js';

/** Instala el oyente del teclado (la cabecera del fichero). */
export function instalarElTeclado(pagina: PaginaDeLaPartida): void {
  const {
    elGuarnicion,
    elDefensa,
    elAviso,
    elSobrantes,
    session,
    aventura,
    castillo,
    gestos,
    dentro,
  } = pagina;
  const { estado, pedirFotograma } = pagina;
  document.addEventListener('keydown', (ev) => {
    // Con la guarnición, la defensa o el aviso abiertos (modales), toda tecla es suya: Escape
    // las cierra por su `cancel`, que llega aunque el foco se haya ido al `body` tras
    // un clic, y aquí no debe cerrar también la base de detrás (H3 del QA de la
    // fase 1: la guarnición se cerraba y se salía al mapa).
    if (elGuarnicion.open || elDefensa.open || elAviso.open || elSobrantes.open) return;
    // Lo que se escribe en un campo de texto o se pulsa en un cuadro es suyo, no un
    // atajo. Salvo Escape en la conversación: al abrirse se queda el foco (su primera
    // opción), y sin esto Escape no la cerraba nunca, aunque la barra lo anuncia
    // (H3 del QA de la F1a). Lo demás —Intro, espacio— sigue siendo de su botón.
    const enLaConversacion =
      ev.target instanceof Element && ev.target.closest('#conversacion') !== null;
    if (enLaConversacion && ev.key !== 'Escape') return;
    if (
      !enLaConversacion &&
      ev.target instanceof Element &&
      ev.target.closest('textarea, input, dialog') !== null
    )
      return;
    // Escape mantenido se repite: cada repetición cerraría un nivel más (la morada,
    // la base…). Solo cuenta la primera pulsación (QA M5 de la morada, 20-10-2026).
    if (ev.key === 'Escape' && ev.repeat) return;
    if (estado.desarrollo?.tecla(ev) === true) {
      pedirFotograma();
      return;
    }
    // Mientras el héroe anda, una tecla solo lo hace llegar (`hastaQueLlegue`); el
    // zoom, no, que es de la cámara.
    if (ev.key !== '+' && ev.key !== '-' && hastaQueLlegue(pagina)) return;
    if (ev.key === 'Escape' && esDeDentro(dentro, session.scene)) {
      cerrarDentro(pagina);
    } else if (ev.key === 'Escape' && session.scene === 'town') {
      // Con `else`: la misma pulsación que saca de la morada a la base no la cierra
      // también, que es lo que pasaría mirando la escena otra vez tras cambiarla.
      // Escape cierra primero lo abierto en la base y, si no hay nada, la base.
      if (castillo.abierto !== null) {
        castillo.cerrar();
      } else {
        session.closeTown();
        castillo.salir();
      }
    }
    // Las teclas de la batalla, las de la arena (`GestosDeBatalla.tecla`): Escape suelta
    // lo que espera el clic, las flechas mueven al elegido del despliegue, la Q alterna el
    // arma y Espacio cierra el turno de la unidad tuya que actúa.
    if (session.scene === 'battle') gestos.tecla(ev);
    // En la formación de la tropa (la misma pieza que el despliegue de la batalla), las
    // flechas mueven al elegido a la casilla de al lado (`FLECHAS_AL_COLOCAR`): lo juzga el
    // núcleo, como el clic.
    const flecha = FLECHAS_AL_COLOCAR[ev.key];
    if (flecha !== undefined && session.scene === 'tropa' && session.formacion.enCurso !== null) {
      ev.preventDefault();
      session.formacion.mover(flecha[0], flecha[1]);
    }
    // Con el foco en un botón, Intro es pulsar ESE botón: no se le roba la tecla.
    const enUnBoton = ev.target instanceof Element && ev.target.closest('button') !== null;
    if (ev.key === ' ' && session.scene === 'adventure') {
      ev.preventDefault();
      // Dejar el Espacio pulsado repite la tecla: eso no es pedir varios días.
      if (!ev.repeat) pasarTurno(pagina);
    }
    // La pregunta de fin de turno (#17): Intro la confirma y Escape la retira. El
    // Espacio NO confirma: es la tecla que la hizo salir, y dos Espacios seguidos
    // pasarían el turno sin que la pregunta se llegase a leer.
    if (session.avisoDeFinDeTurno !== null && session.scene === 'adventure') {
      if (ev.key === 'Enter' && !enUnBoton) {
        ev.preventDefault();
        if (!ev.repeat) pasarTurno(pagina, true);
      }
      if (ev.key === 'Escape') session.retirarAvisoDeFinDeTurno();
    }
    const conModificador = ev.ctrlKey || ev.metaKey || ev.altKey;
    if ((ev.key === 'h' || ev.key === 'H') && !conModificador && session.scene === 'adventure') {
      if (!ev.repeat) siguienteHeroe(pagina);
    }
    if ((ev.key === 't' || ev.key === 'T') && !conModificador && session.scene === 'adventure') {
      if (!ev.repeat) abrirLaTropa(pagina);
    }
    if ((ev.key === '+' || ev.key === '-') && session.scene === 'adventure') {
      aventura.zoom(ev.key === '+' ? 1 : -1);
    }
    pedirFotograma();
  });
}
