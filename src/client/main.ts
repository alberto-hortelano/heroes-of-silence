/**
 * Punto de entrada del cliente: arranque, bucle de dibujo y reparto del ratón.
 *
 * La sesión decide, `render/` pinta, `views/` monta los paneles y cada escena
 * (`escenas/`) traduce el puntero de su pantalla. Aquí solo se conecta todo.
 */
import { FLECHAS_AL_COLOCAR } from './batalla/colocar.js';
import { EscenaBatalla } from './batalla/escena.js';
import { GestosDeBatalla } from './batalla/gestos.js';
import { DialogoDeLaRueda } from './batalla/rueda/dialogo.js';
import { bucleDeDibujo } from './comun/bucle.js';
import { mensajeDe } from './comun/errores.js';
import { abrirLaPartida } from './partida/abrir.js';
import { EscenaBase } from './partida/base/escena.js';
import { instalarElClic } from './partida/clic.js';
import { instalarLosDialogos } from './partida/dialogos.js';
import { calentarElMapa, dibujarFotograma, otroFotograma } from './partida/dibujo.js';
import { PuertaDeFinDeTurno } from './partida/fin-de-turno.js';
import {
  abrirLaTropa,
  cerrarDentro,
  hastaQueLlegue,
  jugadaEnCurso,
  pasarTurno,
  siguienteHeroe,
} from './partida/gestos.js';
import { EscenaLugar } from './partida/lugar/escena.js';
import { EscenaAventura } from './partida/mapa/escena.js';
import {
  type EstadoDeLaPagina,
  elementosDeLaPartida,
  escenasDeDentro,
  esDeDentro,
  type PaginaDeLaPartida,
} from './partida/pagina.js';
import { instalarElPuntero } from './partida/puntero.js';
import { cargarArte } from './render/assets.js';
import { apuntarElSueloEn } from './render/escenario/superficie.js';
import { ajustarLienzo } from './render/lienzo.js';
import type { Session } from './sesion/partida.js';

/**
 * `true` en `pnpm dev` y `false` en `vite build` (`define` de `vite.config.ts`):
 * con `false`, el `import()` de las herramientas de desarrollo queda en una rama
 * muerta y Rollup no lo emite. Si algo se cuela, `sinDesarrollo` rompe el build.
 */
declare const HERRAMIENTAS_DE_DESARROLLO: boolean;

const elementos = elementosDeLaPartida();
const { app, canvas, elStatus, elSeed, elRueda, elGuarnicion, elDefensa, elAviso } = elementos;

/**
 * El bucle de dibujo (`comun/bucle.ts`), con la red de la partida: un fallo al pintar se
 * escribe en la barra, y el siguiente fotograma se vuelve a pedir si hace falta, también
 * tras un fallo (`otroFotograma`). Va aquí arriba porque lo recogen desde el principio la
 * sesión (`alCambiarSinGesto`) y la rueda; lo que pinta, en `partida/dibujo.ts`.
 */
const pedirFotograma = bucleDeDibujo({
  pintar: (ahora) => {
    dibujarFotograma(pagina, ahora);
    return otroFotograma(pagina);
  },
  alFallar: (motivo) => {
    console.error('[cliente] fallo al pintar', motivo);
    elStatus.textContent = `No se ha podido pintar la pantalla: ${mensajeDe(motivo)}`;
    return otroFotograma(pagina);
  },
});

const session = abrirLaPartida({ elStatus, elSeed, pedirFotograma });
const sesion = (): Session => session;
const aventura = new EscenaAventura(sesion);
const batalla = new EscenaBatalla(sesion);
const castillo = new EscenaBase(sesion);
/** La escena de un lugar de un mundo (`partida/lugar/escena.ts`): se entra desde el mapa, como en la tropa. */
const lugar = new EscenaLugar(sesion);
const dentro = escenasDeDentro(sesion, castillo, lugar);
/**
 * La rueda del golpe de la partida, la misma de la arena (F5, 19-10-2026). De los
 * dos que se cruzan, su figura, su chapa y su nombre, y quién es «tú»
 * (`Session.quienMira`); la ficha y la vista previa son de la arena (#261).
 */
const rueda = new DialogoDeLaRueda(elRueda, {
  sesion: () => (session.scene === 'battle' ? session : null),
  escena: batalla,
  cara: () => null,
  pedirFotograma,
  alPulsarMientrasCuenta: () => {
    jugadaEnCurso(pagina);
  },
});
const finDeTurno = new PuertaDeFinDeTurno(() => performance.now());

const estado: EstadoDeLaPagina = {
  desarrollo: null,
  paneles: null,
  arteLlegado: 0,
  escenaPintada: '',
  escenaDeAntes: '',
  lateralDeAntes: 0,
  lateralPendiente: null,
  fichaALaVista: false,
  activaSeguida: null,
};

const principal = ajustarLienzo(canvas, pedirFotograma);
const ctx = principal.ctx;

cargarArte(() => {
  estado.arteLlegado++;
  pedirFotograma();
});
apuntarElSueloEn(app);

// Antes que los gestos de la batalla, como siempre: con lo que leen, que la página aún no
// está entera.
instalarLosDialogos({ elGuarnicion, elAviso, elDefensa, session, pedirFotograma });

/**
 * Los gestos de la batalla, los de la arena (`batalla/gestos.ts`): los botones del
 * panel, las teclas y el puntero sobre el tablero, con la misma puerta (`jugadaEnCurso`).
 */
const gestos = new GestosDeBatalla({
  sesion,
  escena: batalla,
  jugadaEnCurso: () => jugadaEnCurso(pagina),
  pedirFotograma,
});

/** La página entera (`partida/pagina.ts`): lo que leen las piezas de `partida/`. */
const pagina: PaginaDeLaPartida = {
  ...elementos,
  session,
  pedirFotograma,
  aventura,
  batalla,
  castillo,
  lugar,
  dentro,
  rueda,
  gestos,
  finDeTurno,
  principal,
  ctx,
  estado,
};

instalarElPuntero(pagina);

instalarElClic(pagina);

document.addEventListener('keydown', (ev) => {
  // Con la guarnición, la defensa o el aviso abiertos (modales), toda tecla es suya: Escape
  // las cierra por su `cancel`, que llega aunque el foco se haya ido al `body` tras
  // un clic, y aquí no debe cerrar también la base de detrás (H3 del QA de la
  // fase 1: la guarnición se cerraba y se salía al mapa).
  if (elGuarnicion.open || elDefensa.open || elAviso.open) return;
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

// La partida empieza en la base, con el héroe dentro: salir de ella lleva al
// mapa, y la barra dice entonces cómo se anda (`AYUDA_DEL_MAPA`).
session.abrirSuBase();
pedirFotograma();
calentarElMapa(session);

if (HERRAMIENTAS_DE_DESARROLLO) {
  void import('./desarrollo/herramientas.js')
    .then((m) => {
      estado.desarrollo = m.montar({
        sesion,
        aventura,
        canvas,
        herramientas: document.getElementById('herramientas') as HTMLElement,
        pedirFotograma,
        pintarYa: () => dibujarFotograma(pagina, performance.now()),
      });
      pedirFotograma();
    })
    .catch((err: unknown) => {
      console.error('[cliente] no se han podido montar las herramientas de desarrollo', err);
      elStatus.textContent = `No se han podido montar las herramientas de desarrollo: ${mensajeDe(err)}`;
    });
}
