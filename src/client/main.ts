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
import { EscenaLugar } from './partida/lugar/escena.js';
import { EscenaAventura } from './partida/mapa/escena.js';
import {
  type EstadoDeLaPagina,
  elementosDeLaPartida,
  escenasDeDentro,
  esDeDentro,
  type PaginaDeLaPartida,
} from './partida/pagina.js';
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
  minimapa,
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
    jugadaEnCurso();
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

/**
 * `fichaALaVista` tras el `click` que el navegador saca de este mismo toque, que
 * llega después de `pointerup` y se apunta donde esté el dedo entonces: con el
 * panel ya desplazado, en un teléfono de 375×667 caía sobre «Contratar» y
 * contrataba sin que nadie viera la ficha (QA H6, 22-10-2026). Si el `click` no
 * llega (el dedo se arrastró), a los `ESPERA_DEL_CLIC` ms.
 */
function fichaTrasElClic(): void {
  let hecho = false;
  const traer = (): void => {
    if (hecho) return;
    hecho = true;
    window.removeEventListener('click', traer, true);
    estado.fichaALaVista = true;
    pedirFotograma();
  };
  // En la captura: el `click` ya tiene su blanco y el desplazamiento llega en el
  // fotograma siguiente, cuando ya se ha repartido.
  window.addEventListener('click', traer, true);
  setTimeout(traer, ESPERA_DEL_CLIC);
}
const ESPERA_DEL_CLIC = 400;

// Antes que los gestos de la batalla, como siempre: con lo que leen, que la página aún no
// está entera.
instalarLosDialogos({ elGuarnicion, elAviso, elDefensa, session, pedirFotograma });

/**
 * La única puerta de los gestos de batalla mientras la jugada se está contando.
 *
 * El tablero que se ve todavía no es el del estado, así que no se acepta nada:
 * ni un clic en el lienzo ni un botón ni Escape. Estaba repartida —una
 * comprobación en el clic del lienzo y otra en dos de los botones—, y por los
 * huecos se colaban «Resolver sola», el libro de hechizos, «Continuar» y Escape.
 *
 * Los botones del panel ya salen apagados mientras se cuenta (#165); por aquí
 * pasan aún el lienzo, el teclado y el clic que cae entre el gesto y el
 * fotograma que repinta el panel.
 */
function jugadaEnCurso(): boolean {
  if (session.scene !== 'battle') return false;
  if (!batalla.rechazarSiOcupada(performance.now())) return false;
  pedirFotograma();
  return true;
}

/**
 * Los gestos de la batalla, los de la arena (`batalla/gestos.ts`): los botones del
 * panel, las teclas y el puntero sobre el tablero, con la misma puerta de arriba.
 */
const gestos = new GestosDeBatalla({
  sesion,
  escena: batalla,
  jugadaEnCurso,
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

/**
 * La puerta de los gestos del mapa mientras el héroe anda su marcha
 * (`Session.marchaEnCurso`): el gesto —un clic en el lienzo, un botón, una
 * tecla— solo lo hace llegar (`acabarLaMarcha`, que abre lo que esperaba a la
 * llegada) y no hace nada más. Sin marcha, `false` y el gesto sigue. Así nada se
 * juega con el héroe pintado a medio camino, ni con la batalla de una emboscada
 * esperando a que llegue.
 */
function hastaQueLlegue(): boolean {
  if (session.marchaEnCurso === null) return false;
  session.acabarLaMarcha();
  aventura.olvidarRuta();
  pedirFotograma();
  return true;
}

lienzo.addEventListener('scroll', pedirFotograma, { passive: true });

// ---------------------------------------------------------------- puntero

function enLienzo(ev: { clientX: number; clientY: number }): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

canvas.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0) return;
  const p = enLienzo(ev);
  if (session.scene === 'adventure') {
    aventura.bajar(p.x, p.y);
    canvas.setPointerCapture(ev.pointerId);
  }
  pedirFotograma();
});

canvas.addEventListener('pointermove', (ev) => {
  const p = enLienzo(ev);
  if (session.scene === 'town') {
    canvas.style.cursor = castillo.mover(p.x, p.y, performance.now()) ? 'pointer' : 'default';
  } else if (session.scene === 'battle') {
    gestos.mover(p.x, p.y);
  } else if (esDeDentro(dentro, session.scene)) {
    canvas.style.cursor = dentro[session.scene].de.mover(p.x, p.y) ? 'pointer' : 'default';
  } else {
    aventura.mover(p.x, p.y);
  }
  pedirFotograma();
});

canvas.addEventListener('pointerup', (ev) => {
  if (ev.button !== 0) return;
  const p = enLienzo(ev);
  if (session.scene === 'town') castillo.pulsar(p.x, p.y, performance.now());
  else if (esDeDentro(dentro, session.scene)) {
    const escena = session.scene;
    if (dentro[escena].de.pulsar(p.x, p.y) && escena === 'ayuntamiento') fichaTrasElClic();
  } else if (session.scene === 'battle') {
    gestos.soltar(p.x, p.y);
  } else if (aventura.soltar()) {
    if (hastaQueLlegue()) return;
    // Con el modo «marcar fallo» puesto, el clic es suyo y no mueve a nadie.
    if (estado.desarrollo?.activo === true) estado.desarrollo.clic(p.x, p.y);
    else aventura.pulsar(p.x, p.y, ev.pointerType === 'touch');
  }
  pedirFotograma();
});

canvas.addEventListener('pointerleave', () => {
  aventura.salir();
  gestos.salir();
  castillo.salir();
  for (const d of Object.values(dentro)) d.de.salir();
  pedirFotograma();
});

canvas.addEventListener(
  'wheel',
  (ev) => {
    if (session.scene !== 'adventure') return;
    ev.preventDefault();
    aventura.zoom(ev.deltaY < 0 ? 1 : -1, enLienzo(ev));
    pedirFotograma();
  },
  { passive: false },
);

minimapa.addEventListener('pointerdown', (ev) => {
  const r = minimapa.getBoundingClientRect();
  aventura.pulsarMinimapa(ev.clientX - r.left, ev.clientY - r.top, r.width, r.height);
  pedirFotograma();
});

// ---------------------------------------------------------------- paneles

/**
 * «Fin de turno», por el botón o por el Espacio. La puerta lo ignora fuera del
 * turno de la persona, con algo moviéndose y durante el cambio de día; `endTurn`
 * no rechaza —se traga su fallo y lo escribe en `status`—, y lo que juega el
 * rival llega cuando termina, sin gesto que pida fotograma.
 */
function pasarTurno(confirmado = false): void {
  const animando = session.scene === 'adventure' && aventura.arrastrando;
  if (!finDeTurno.abierta(session, animando)) return;
  void finDeTurno
    .pasar(session, animando, confirmado, () => aventura.olvidarRuta())
    .then(pedirFotograma);
}

/**
 * «Tropa», por el botón o por la T: la escena de la tropa del héroe elegido. Si no
 * se puede (sin héroe, fuera de tu turno), el motivo va a la barra.
 */
function abrirLaTropa(): void {
  if (session.scene !== 'adventure') return;
  const motivo = session.tropaBlocker();
  if (motivo !== null) {
    session.status = motivo;
    return;
  }
  aventura.salir();
  session.abrirLaTropa();
}

/**
 * Sale de la escena de dentro en que se esté a la de donde se entró: de la tropa
 * al mapa, con el héroe elegido y la cámara del mapa como estaban; de la morada a
 * la base, con quien anduvo quieto en su puerta, porque la base no se ha cerrado
 * (`EscenaBase` no se reinicia sin otra apertura).
 */
function cerrarDentro(): void {
  const escena = session.scene;
  if (!esDeDentro(dentro, escena)) return;
  dentro[escena].de.salir();
  canvas.style.cursor = 'default';
  dentro[escena].cerrar(session);
}

/** «Siguiente héroe», por el botón o por la H: lo elige la sesión y aquí se le mira. */
function siguienteHeroe(): void {
  if (session.scene !== 'adventure' || !session.siguienteHeroe()) return;
  aventura.olvidarRuta();
  aventura.centrar();
}

document.addEventListener('click', (ev) => {
  const target = (ev.target as HTMLElement).closest('[data-action]');
  if (target === null) return;
  const action = target.getAttribute('data-action');
  // El segundo clic de un doble clic no cuenta en ningún botón, caiga donde caiga, salvo
  // los que suman de uno en uno (`repartirClic`; decisión del usuario, 07-11-2026).
  const reparto = repartirClic(action, session.scene, jugadaEnCurso, ev.detail);
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
  if (reparto === 'nada' || hastaQueLlegue()) return;
  pedirFotograma();
  // Los botones de la batalla (`GestosDeBatalla`), los de la arena: su regla del doble clic
  // ya no ve un segundo clic aquí, porque `repartirClic` no deja pasar ninguno de ellos.
  if (gestos.clic(action, target, ev.detail)) return;

  switch (action) {
    case 'end-turn':
      pasarTurno();
      break;
    case 'end-turn-confirm':
      pasarTurno(true);
      break;
    case 'end-turn-cancel':
      session.retirarAvisoDeFinDeTurno();
      break;
    case 'next-hero':
      siguienteHeroe();
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
      abrirLaTropa();
      break;
    case 'cerrar-tropa':
    case 'cerrar-morada':
    case 'cerrar-ayuntamiento':
      cerrarDentro();
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
      cerrarDentro();
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
  if (ev.key !== '+' && ev.key !== '-' && hastaQueLlegue()) return;
  if (ev.key === 'Escape' && esDeDentro(dentro, session.scene)) {
    cerrarDentro();
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
    if (!ev.repeat) pasarTurno();
  }
  // La pregunta de fin de turno (#17): Intro la confirma y Escape la retira. El
  // Espacio NO confirma: es la tecla que la hizo salir, y dos Espacios seguidos
  // pasarían el turno sin que la pregunta se llegase a leer.
  if (session.avisoDeFinDeTurno !== null && session.scene === 'adventure') {
    if (ev.key === 'Enter' && !enUnBoton) {
      ev.preventDefault();
      if (!ev.repeat) pasarTurno(true);
    }
    if (ev.key === 'Escape') session.retirarAvisoDeFinDeTurno();
  }
  const conModificador = ev.ctrlKey || ev.metaKey || ev.altKey;
  if ((ev.key === 'h' || ev.key === 'H') && !conModificador && session.scene === 'adventure') {
    if (!ev.repeat) siguienteHeroe();
  }
  if ((ev.key === 't' || ev.key === 'T') && !conModificador && session.scene === 'adventure') {
    if (!ev.repeat) abrirLaTropa();
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
