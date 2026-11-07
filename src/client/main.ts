/**
 * Punto de entrada del cliente: arranque, bucle de dibujo y reparto del ratón.
 *
 * La sesión decide, `render/` pinta, `views/` monta los paneles y cada escena
 * (`escenas/`) traduce el puntero de su pantalla. Aquí solo se conecta todo.
 */
import { esObraDelPuesto } from '@core/map/tipos.js';
import { FLECHAS_AL_COLOCAR } from './batalla/colocar.js';
import { EscenaBatalla } from './batalla/escena.js';
import { GestosDeBatalla } from './batalla/gestos.js';
import { DialogoDeLaRueda } from './batalla/rueda/dialogo.js';
import { bucleDeDibujo } from './comun/bucle.js';
import { mensajeDe } from './comun/errores.js';
import { aLaBarra } from './comun/semilla.js';
import { abrirLaPartida } from './partida/abrir.js';
import { EscenaBase } from './partida/base/escena.js';
import { combateALaURL } from './partida/combate-en-la-url.js';
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
import { repartirClic } from './partida/reparto-del-clic.js';
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
const {
  app,
  canvas,
  lienzo,
  elStatus,
  elSeed,
  haciaEnemigo,
  elRueda,
  salirAlMenu,
  elGuarnicion,
  elDefensa,
  elAviso,
} = elementos;

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

document.addEventListener('click', (ev) => {
  const target = (ev.target as HTMLElement).closest('[data-action]');
  if (target === null) return;
  const action = target.getAttribute('data-action');
  // El segundo clic de un doble clic no cuenta en ningún botón, caiga donde caiga, salvo
  // los que suman de uno en uno (`repartirClic`; decisión del usuario, 07-11-2026).
  const reparto = repartirClic(action, session.scene, () => jugadaEnCurso(pagina), ev.detail);
  if (reparto === 'mirar') {
    const izquierda = haciaEnemigo.dataset.lado === 'izquierda' ? 0 : lienzo.scrollWidth;
    lienzo.scrollTo({ left: izquierda, behavior: 'smooth' });
    return;
  }
  if (reparto === 'al-acabar') {
    // Si espera, la vuelta al mapa ocurre dentro de un fotograma, y `render`
    // pide el siguiente al ver que la escena cambió.
    batalla.alAcabar(performance.now(), () => {
      session.finishBattle();
      aventura.olvidarRuta();
    });
    pedirFotograma();
    return;
  }
  if (reparto === 'nada' || hastaQueLlegue(pagina)) return;
  pedirFotograma();
  // Los botones de la batalla (`GestosDeBatalla`), los de la arena: su regla del doble clic
  // ya no ve un segundo clic aquí, porque `repartirClic` no deja pasar ninguno de ellos.
  if (gestos.clic(action, target, ev.detail)) return;

  switch (action) {
    case 'end-turn':
      pasarTurno(pagina);
      break;
    case 'end-turn-confirm':
      pasarTurno(pagina, true);
      break;
    case 'end-turn-cancel':
      session.retirarAvisoDeFinDeTurno();
      break;
    case 'next-hero':
      siguienteHeroe(pagina);
      break;
    case 'sleep-hero':
      session.alternarSueño(target.getAttribute('data-hero') as string);
      break;
    case 'toggle-fog':
      session.revealAll = !session.revealAll;
      break;
    case 'select-hero':
      session.selectedHeroId = target.getAttribute('data-hero');
      aventura.olvidarRuta();
      aventura.centrar();
      break;
    case 'open-town':
      session.openTown(target.getAttribute('data-town') as string);
      break;
    case 'close-town':
      castillo.cerrar();
      session.closeTown();
      castillo.salir();
      break;
    case 'abrir-tropa':
      abrirLaTropa(pagina);
      break;
    case 'cerrar-tropa':
    case 'cerrar-morada':
    case 'cerrar-ayuntamiento':
      cerrarDentro(pagina);
      break;
    case 'abrir-ayuntamiento':
      castillo.cerrar();
      session.abrirElAyuntamiento();
      break;
    case 'ayuntamiento-elegir': {
      const tipo = target.getAttribute('data-tipo');
      if (tipo === null) throw new Error('el botón del ayuntamiento no dice qué héroe elige');
      session.elegirEnElAyuntamiento(tipo);
      estado.fichaALaVista = true;
      break;
    }
    case 'salir-del-lugar':
      // El botón sale del todo, hable o no: sin la conversación, `cerrarDentro`
      // (con el cursor) saca al mapa, como Escape la segunda vez.
      session.lugar.dejarDeHablar();
      cerrarDentro(pagina);
      break;
    case 'lugar-ir':
      lugar.irA(target.getAttribute('data-punto') as string, performance.now());
      break;
    case 'lugar-al-principio':
      session.lugar.alPrincipio();
      break;
    case 'lugar-opcion': {
      // Apagada: su motivo ya se lee debajo; el clic no hace nada.
      if (target.getAttribute('aria-disabled') === 'true') break;
      session.elegirEnElLugar(Number(target.getAttribute('data-indice')));
      break;
    }
    case 'tropa-elegir': {
      const quien = target.getAttribute('data-quien');
      if (quien === null) throw new Error('el botón de la tropa no dice a quién elige');
      session.elegirEnLaTropa(quien === 'heroe' ? { heroe: true } : { indice: Number(quien) });
      break;
    }
    case 'tropa-poner':
      session.ponerALaElegida(
        target.getAttribute('data-item') as string,
        target.getAttribute('data-hueco') ?? undefined,
      );
      break;
    case 'tropa-quitar':
      // El hueco lo valida la sesión (`esHueco`), como en `unequip`.
      session.quitarALaElegida(target.getAttribute('data-slot') as string);
      break;
    case 'morada-elegir': {
      const unidad = target.getAttribute('data-unidad');
      if (unidad === null) throw new Error('el botón de la morada no dice qué unidad elige');
      session.elegirEnLaMorada(unidad);
      break;
    }
    case 'ir-a-sitio':
      castillo.irA(target.getAttribute('data-sitio') as string, performance.now());
      break;
    case 'build':
      session.build(target.getAttribute('data-building') as string);
      break;
    case 'recruit': {
      const criatura = target.getAttribute('data-creature') as string;
      if (target.getAttribute('data-todo') === 'si') session.recruitAll(criatura);
      else session.recruit(criatura, 1);
      break;
    }
    case 'cerrar-en-la-base':
    case 'cerrar-conversacion':
      castillo.cerrar();
      break;
    case 'hire-hero': {
      const tipo = target.getAttribute('data-tipo');
      if (tipo === null) throw new Error('el botón de contratar no dice qué héroe contrata');
      const eraElDeSalida = session.heroeDeSalidaPendiente;
      session.hireHero(tipo);
      // Elegido el de salida, la URL lo lleva: la recarga entra con él («ya elegido
      // y pagado»). Uno contratado después no la cambia.
      if (eraElDeSalida && !session.heroeDeSalidaPendiente) {
        aLaBarra((url) => url.searchParams.set('heroe', tipo));
      }
      break;
    }
    case 'abrir-guarnicion':
      session.abrirLaGuarnicion(target.getAttribute('data-hero') as string);
      break;
    case 'cerrar-guarnicion':
      session.cerrarLaGuarnicion();
      break;
    case 'mover-en-el-reparto': {
      // Apagado: su nota ya se lee debajo; el clic no hace nada (como en un lugar). Cada clic
      // solo edita el reparto, así que un doble clic mueve dos (H-V2-1 del QA): es de los
      // que cuentan cada clic (`CUENTAN_CADA_CLIC` de `reparto-del-clic.ts`), como «−» y «+».
      if (target.getAttribute('aria-disabled') === 'true') break;
      const hacia = target.getAttribute('data-hacia');
      if (hacia !== 'heroe' && hacia !== 'guarnicion') {
        throw new Error(`un botón de la guarnición sin lado al que pasar: «${hacia}»`);
      }
      session.moverEnElReparto(
        hacia,
        target.getAttribute('data-creature') as string,
        target.getAttribute('data-veterano') ?? undefined,
      );
      break;
    }
    case 'confirmar-reparto':
      if (target.getAttribute('aria-disabled') === 'true') break;
      session.confirmarElReparto();
      break;
    case 'mejorar-el-puesto': {
      // Apagado: su motivo ya se lee debajo.
      if (target.getAttribute('aria-disabled') === 'true') break;
      // La obra que decía el botón pulsado: si el diálogo ya ofrece otra (el clic
      // llega antes del repintado), el núcleo la rechaza sin cobrar.
      const obra = target.getAttribute('data-obra');
      if (!esObraDelPuesto(obra)) {
        throw new Error(`el botón del puesto no dice qué obra compra: «${obra}»`);
      }
      session.mejorarElPuesto(obra);
      break;
    }
    case 'defensa-mas':
    case 'defensa-menos':
      // Cuentan cada clic, como «Dejar ›» y «‹ Recoger»: solo editan hasta «Defender».
      if (target.getAttribute('aria-disabled') === 'true') break;
      session.cambiarLaDefensa(
        target.getAttribute('data-creature') as string,
        action === 'defensa-mas' ? 1 : -1,
      );
      break;
    case 'defensa-confirmar':
      if (target.getAttribute('aria-disabled') === 'true') break;
      session.confirmarLaDefensa();
      break;
    case 'defensa-de-la-ia':
      session.dejarLaDefensaDeLaIA();
      break;
    case 'aviso-defender':
      session.defenderElAtaque();
      break;
    case 'aviso-resolver-sola':
      session.resolverElAtaqueSola();
      break;
    case 'dismiss':
      session.dismiss(
        target.getAttribute('data-hero') as string,
        target.getAttribute('data-creature') as string,
        1,
      );
      break;
    case 'select-item':
      session.selectItem(target.getAttribute('data-item') as string);
      break;
    case 'equip': {
      const veteran = target.getAttribute('data-veteran');
      const creature = target.getAttribute('data-creature');
      session.equip(target.getAttribute('data-hero') as string, {
        ...(veteran === null ? {} : { veteran }),
        ...(creature === null ? {} : { creature }),
      });
      break;
    }
    case 'unequip': {
      // El hueco lo valida la sesión (`esHueco`), su puerta al núcleo: uno mal
      // escrito sale en la barra con su motivo.
      session.unequip(
        target.getAttribute('data-hero') as string,
        target.getAttribute('data-slot') as string,
        target.getAttribute('data-veteran') ?? undefined,
      );
      break;
    }
    case 'buy-item':
      session.buyItem(target.getAttribute('data-item') as string);
      break;
    case 'battle-surrender':
      // Rendirse y «Resolver sola» son solo de la partida; su segundo clic no cuenta, como
      // el de ningún botón (`repartirClic`, decisiones del usuario del 07-11-2026).
      session.playBattleAction({ type: 'surrender' });
      break;
    case 'auto-battle':
      session.autoResolveBattle();
      break;
    case 'solo-rueda-del-heroe':
      // La casilla de la batalla: vale desde el siguiente golpe, y la URL la
      // recuerda para la recarga.
      session.alternarSoloRuedaDelHeroe();
      aLaBarra((url) => combateALaURL(url, session.state.combate, session.soloRuedaDelHeroe));
      break;
    case 'zoom-in':
      aventura.zoom(1);
      break;
    case 'zoom-out':
      aventura.zoom(-1);
      break;
    case 'centrar':
      aventura.centrar();
      break;
    case 'menu':
      salirAlMenu.showModal();
      break;
    case 'seguir-jugando':
      salirAlMenu.close();
      break;
    case 'restart':
      // «Partida nueva» vuelve al menú de inicio: la página sin nada pedido.
      // Recargando y no montando otra sesión aquí: así se suelta la partida
      // entera, el Worker del suelo incluido.
      aLaBarra((url) => {
        url.search = '';
      });
      location.reload();
      break;
    default:
      return;
  }
});

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
