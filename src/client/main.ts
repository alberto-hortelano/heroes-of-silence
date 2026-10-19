/**
 * Punto de entrada del cliente: arranque, bucle de dibujo y reparto del ratón.
 *
 * La sesión decide, `render/` pinta, `views/` monta los paneles y cada escena
 * (`escenas/`) traduce el puntero de su pantalla. Aquí solo se conecta todo.
 */
import { parseSeed } from '@core/rng.js';
import type { Desarrollo } from './desarrollo/tipos.js';
import { EscenaAventura } from './escenas/aventura.js';
import { EscenaBatalla } from './escenas/batalla.js';
import { EscenaBase } from './escenas/castillo.js';
import { PuertaDeFinDeTurno } from './fin-de-turno.js';
import { pintar } from './html.js';
import { cargarArte } from './render/assets.js';
import { apuntarElSueloEn } from './render/escenario/superficie.js';
import { hayFigurasAnimadas } from './render/figura.js';
import { ajustarLienzo } from './render/lienzo.js';
import { repartirClic } from './reparto-del-clic.js';
import { DialogoDeLaRueda } from './rueda/dialogo.js';
import { semillaSorteada } from './semilla.js';
import { Session } from './session.js';
import { ponerTema } from './temas.js';
import { pintarSiguiendoElFinal } from './views/al-final.js';
import { renderConversacion } from './views/base.js';
import { renderActions, renderSide, renderTopbar } from './views/panels.js';

/**
 * `true` en `pnpm dev` y `false` en `vite build` (`define` de `vite.config.ts`):
 * con `false`, el `import()` de las herramientas de desarrollo queda en una rama
 * muerta y Rollup no lo emite. Si algo se cuela, `sinDesarrollo` rompe el build.
 */
declare const HERRAMIENTAS_DE_DESARROLLO: boolean;

const app = document.getElementById('app') as HTMLElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const lienzo = document.getElementById('lienzo') as HTMLElement;
const minimapa = document.getElementById('minimapa') as HTMLCanvasElement;

const elDay = document.getElementById('day') as HTMLElement;
const elResources = document.getElementById('resources') as HTMLElement;
const elTurn = document.getElementById('turn') as HTMLElement;
const elSide = document.getElementById('side') as HTMLElement;
const elStatus = document.getElementById('status') as HTMLElement;
const elActions = document.getElementById('actions') as HTMLElement;
const elSeed = document.getElementById('seed') as HTMLElement;
const haciaEnemigo = document.getElementById('hacia-enemigo') as HTMLElement;
const conversacion = document.getElementById('conversacion') as HTMLDialogElement;
/** La rueda del golpe (`rueda/dialogo.ts`): modal sobre el lienzo, mientras se elige y se cuenta un cruce. */
const elRueda = document.getElementById('rueda') as HTMLDialogElement;
const stage = document.getElementById('stage') as HTMLElement;

/**
 * La semilla que pide la URL, o `null` si no pide ninguna. Lanza si pide una
 * que no lo es: la regla entera —incluido que `?seed=` vacío es no pedir— la
 * escribe el núcleo (`parseSeed`), aquí solo se lee la barra de direcciones.
 */
function semillaDeLaUrl(): number | null {
  return parseSeed(new URLSearchParams(location.search).get('seed'));
}

/**
 * Abre la partida y deja dicho, en la URL y en la barra, con qué semilla juega.
 * Se cambia SOLO `seed` sobre la URL de ahora: escribir `?seed=N` a pelo
 * sustituía la query entera y el fragmento.
 */
function abrePartida(seed: number): Session {
  const url = new URL(location.href);
  url.searchParams.set('seed', String(seed));
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  const abierta = new Session(seed);
  // Una defensa (#116) se abre a media jugada del rival, sin gesto que pinte.
  abierta.alCambiarSinGesto = pedirFotograma;
  elSeed.textContent = `semilla ${abierta.state.seed}`;
  // La interfaz, con el tema de la facción de quien juega (`temas.ts`).
  ponerTema(abierta.jugador.faction);
  return abierta;
}

let session: Session;
try {
  session = abrePartida(semillaDeLaUrl() ?? semillaSorteada());
} catch (err) {
  // Sin sesión no arranca el bucle y la página se queda en blanco: el motivo se
  // escribe para la persona, con la salida si lo que falla es la semilla. Y se
  // relanza igual: un fallo no se tapa con una barra bonita.
  const motivo = err instanceof Error ? err.message : String(err);
  const pideSemilla = new URLSearchParams(location.search).get('seed') !== null;
  elStatus.textContent = pideSemilla
    ? `${motivo} — quita "?seed=…" de la barra de direcciones para jugar una partida al azar`
    : motivo;
  throw err;
}

const sesion = (): Session => session;
const aventura = new EscenaAventura(sesion);
const batalla = new EscenaBatalla(sesion);
const castillo = new EscenaBase(sesion);
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
/** El modo «marcar fallo» y la vista de regiones (`desarrollo/herramientas.ts`): solo en `pnpm dev`. */
let desarrollo: Desarrollo | null = null;

// ---------------------------------------------------------------- dibujo

/**
 * Cuándo se pinta, que es la mitad del trabajo.
 *
 * El lienzo pide fotograma solo mientras hay algo que se mueve: figuras que
 * respiran (con su arte cargado), la cola del animador de batalla o un arrastre
 * del mapa. Fuera de eso, se pinta cuando algo pasa —un gesto, el fin del turno
 * del rival, un cambio de tamaño, arte que llega— y se para. Antes era un
 * `requestAnimationFrame` perpetuo que lo rehacía todo, paneles incluidos.
 */
let fotogramaPedido = false;
function pedirFotograma(): void {
  if (fotogramaPedido) return;
  fotogramaPedido = true;
  requestAnimationFrame(render);
}

function hayAnimacion(): boolean {
  if (hayFigurasAnimadas()) return true;
  if (session.scene === 'battle') return batalla.ocupada;
  return session.scene === 'adventure' && aventura.arrastrando;
}

const principal = ajustarLienzo(canvas, pedirFotograma);
const ctx = principal.ctx;

/**
 * Los paneles se rehacen cuando la sesión dice que algo ha cambiado (`version`),
 * cuando llega arte (los iconos de recursos), cuando la partida es otra o
 * cuando el tablero de batalla empieza o acaba de contar una jugada (sus botones
 * van apagados mientras tanto, #165). Antes se generaba su marcado en cada
 * fotograma para compararlo con el anterior.
 */
let paneles: {
  sesion: Session;
  version: number;
  arte: number;
  contando: boolean;
  base: string;
} | null = null;
let arteLlegado = 0;
cargarArte(() => {
  arteLlegado++;
  pedirFotograma();
});
apuntarElSueloEn(app);

let escenaPintada = '';

/**
 * El bucle de dibujo, con red: el fallo se escribe en la barra y el siguiente
 * fotograma se vuelve a pedir si hace falta. Desde que el marcado sale por
 * `pintar`, dentro hay funciones que lanzan, y con el `requestAnimationFrame` en
 * la última línea una sola excepción congelaba el tablero sin decir nada.
 */
function render(ahora: number): void {
  fotogramaPedido = false;
  try {
    dibujarFotograma(ahora);
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    console.error('[cliente] fallo al pintar', err);
    elStatus.textContent = `No se ha podido pintar la pantalla: ${motivo}`;
  } finally {
    // También si la escena cambió mientras se pintaba —un «Continuar» que
    // esperaba a la jugada vuelve al mapa en `batalla.sincronizar`—: este
    // fotograma pintó la de antes.
    if (hayAnimacion() || session.scene !== escenaPintada) pedirFotograma();
  }
}

function dibujarFotograma(ahora: number): void {
  const escena = session.scene;
  if (escena !== escenaPintada) {
    app.dataset.escena = escena;
    principal.remedir();
    // El tablero de batalla es más ancho que un móvil: se empieza mirando el
    // centro, que es donde se encuentran los dos bandos.
    lienzo.scrollLeft = Math.max(0, (lienzo.scrollWidth - lienzo.clientWidth) / 2);
    // En el móvil lo que se desplaza es `#stage`: al abrir la base desde la
    // lista de castillos, que está debajo del lienzo, la pantalla nueva se
    // quedaba donde estaba el botón, con medio lienzo fuera de la vista.
    stage.scrollTop = 0;
    escenaPintada = escena;
  }

  const enCastillo = escena === 'town' && session.activeTown !== null;
  const enBatalla = escena === 'battle' && session.battle !== null;
  // Solo el mapa tiene presupuesto de píxeles: es la única pantalla que pinta
  // miles de sprites a cada fotograma. Depende del zoom: acercando, plena.
  const rect = principal.preparar(enCastillo || enBatalla ? undefined : aventura.presupuesto);
  ctx.clearRect(0, 0, rect.width, rect.height);
  // Lo abierto en la base o si se anda: lo leen la página (`canvas[data-base]`)
  // y los paneles. Una lectura por fotograma, después de dibujar.
  let base = '';
  if (enCastillo) {
    castillo.dibujar(ctx, rect.width, rect.height, ahora);
    base = castillo.marca;
    if (canvas.dataset.base !== base) canvas.dataset.base = base;
  } else if (enBatalla) {
    batalla.sincronizar(ahora);
    batalla.dibujar(ctx, rect.width, rect.height);
    seguirALaActiva();
  } else {
    aventura.dibujar(ctx, rect.width, rect.height, ahora);
    desarrollo?.dibujar(ctx);
    aventura.dibujarMinimapa(minimapa);
  }
  señalarEnemigo(enBatalla);
  // Fuera de la batalla, cerrada (`pintar` la cierra si no hay batalla). Sus dos
  // figuras respiran con las del tablero (`hayFigurasAnimadas` pide el siguiente).
  rueda.pintar();
  rueda.animar(ahora);

  if (!enCastillo && canvas.dataset.base !== undefined) delete canvas.dataset.base;

  // Después de `batalla.sincronizar`: es la cola de ESTE fotograma.
  const contando = enBatalla && batalla.ocupada;
  // Lo abierto en la base cambia el panel sin cambiar la partida: al llegar a
  // una puerta se abre su panel, y eso no sube la versión de la sesión.
  if (
    paneles === null ||
    paneles.sesion !== session ||
    paneles.version !== session.version ||
    paneles.arte !== arteLlegado ||
    paneles.contando !== contando ||
    paneles.base !== base
  ) {
    paneles = { sesion: session, version: session.version, arte: arteLlegado, contando, base };
    const top = renderTopbar(session);
    elDay.textContent = top.day;
    pintar(elResources, top.resources);
    elTurn.textContent = top.turn;
    pintarSiguiendoElFinal(
      elSide,
      renderSide(session, contando, enCastillo ? castillo.abierto : null),
    );
    pintar(elActions, renderActions(session, contando));
    mostrarConversacion(enCastillo);
  }
  if (elStatus.textContent !== session.status) elStatus.textContent = session.status;
}

/**
 * La conversación con una persona de la base: un `<dialog>` no modal sobre el
 * lienzo, que se abre cuando quien camina llega a su lado y se cierra con
 * «Seguir», con Escape o con un clic en el suelo. Se rellena por la puerta del
 * marcado, como los paneles: el nombre y la línea los puede escribir el agente.
 */
function mostrarConversacion(enCastillo: boolean): void {
  const a = enCastillo ? castillo.abierto : null;
  if (a === null || a.tipo !== 'pnj') {
    if (conversacion.open) conversacion.close();
    return;
  }
  pintar(conversacion, renderConversacion(session, a.id));
  if (!conversacion.open) conversacion.show();
}

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

/** La última unidad propia a la que se llevó el marco, para no pelear con el dedo. */
let activaSeguida: string | null = null;

/**
 * En el móvil el tablero se desplaza dentro de su marco: cuando le toca a otra
 * unidad tuya, el marco va hasta ella. Una sola vez por unidad, para que quien
 * desplaza a mano para mirar no vea el marco volver solo a cada fotograma.
 */
function seguirALaActiva(): void {
  if (lienzo.scrollWidth <= lienzo.clientWidth) return;
  const activa = batalla.activaPropia();
  if (activa === null || activa.id === activaSeguida) return;
  activaSeguida = activa.id;
  lienzo.scrollLeft = Math.max(0, activa.x - lienzo.clientWidth / 2);
}

/**
 * La pista del borde: en el móvil el marco empieza en tu unidad, y el enemigo
 * —al otro lado de un tablero de 860 px— quedaba entero fuera de la vista sin
 * que nada dijera que el tablero seguía. Si hay enemigos fuera, un botón en ese
 * borde lo dice con cuántos son, y pulsarlo lleva el marco hasta allí.
 */
function señalarEnemigo(enBatalla: boolean): void {
  const fuera =
    enBatalla && lienzo.scrollWidth > lienzo.clientWidth
      ? batalla.enemigosFuera(lienzo.scrollLeft, lienzo.scrollLeft + lienzo.clientWidth)
      : { izquierda: 0, derecha: 0 };
  // A la derecha primero: es donde está el enemigo cuando la persona ataca.
  const lado = fuera.derecha > 0 ? 'derecha' : fuera.izquierda > 0 ? 'izquierda' : '';
  const cuantos = lado === 'derecha' ? fuera.derecha : fuera.izquierda;
  const texto =
    lado === 'derecha'
      ? `Enemigo (${cuantos}) ▸`
      : lado === 'izquierda'
        ? `◂ Enemigo (${cuantos})`
        : '';
  if (haciaEnemigo.dataset.lado !== lado) haciaEnemigo.dataset.lado = lado;
  if (haciaEnemigo.textContent !== texto) haciaEnemigo.textContent = texto;
  haciaEnemigo.hidden = lado === '';
  // El botón vive dentro del marco que se desplaza: se recoloca en su borde.
  if (lado !== '') {
    const izquierda =
      lado === 'derecha'
        ? lienzo.scrollLeft + lienzo.clientWidth - haciaEnemigo.offsetWidth - 8
        : lienzo.scrollLeft + 8;
    haciaEnemigo.style.left = `${izquierda}px`;
  }
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
    batalla.mover(p.x, p.y);
  } else {
    aventura.mover(p.x, p.y);
  }
  pedirFotograma();
});

canvas.addEventListener('pointerup', (ev) => {
  if (ev.button !== 0) return;
  const p = enLienzo(ev);
  if (session.scene === 'town') castillo.pulsar(p.x, p.y, performance.now());
  else if (session.scene === 'battle') {
    batalla.mover(p.x, p.y);
    if (!jugadaEnCurso()) batalla.pulsar(p.x, p.y);
  } else if (aventura.soltar()) {
    // Con el modo «marcar fallo» puesto, el clic es suyo y no mueve a nadie.
    if (desarrollo?.activo === true) desarrollo.clic(p.x, p.y);
    else aventura.pulsar(p.x, p.y, ev.pointerType === 'touch');
  }
  pedirFotograma();
});

canvas.addEventListener('pointerleave', () => {
  aventura.salir();
  batalla.salir();
  castillo.salir();
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
  const reparto = repartirClic(action, session.scene, jugadaEnCurso);
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
  if (reparto === 'nada') return;
  pedirFotograma();

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
    case 'hire-hero':
      session.hireHero();
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
    case 'battle-defend':
    case 'battle-wait':
      session.playBattleAction({ type: action === 'battle-wait' ? 'wait' : 'defend' });
      break;
    case 'battle-end-turn':
      session.playBattleAction({ type: 'end_turn' });
      break;
    case 'battle-surrender':
      session.playBattleAction({ type: 'surrender' });
      break;
    case 'battle-spell':
      session.hechizos.selectSpell(target.getAttribute('data-spell') as string);
      break;
    case 'battle-poder': {
      // Curar o Bendecir de la unidad activa (`PoderesDeLaActiva`, el de la arena):
      // con un aliado posible, ya; con varios, el clic en el tablero elige.
      const id = target.getAttribute('data-poder');
      if (id === null) throw new Error('el botón del poder no dice cuál es');
      session.poderes.usar(id);
      break;
    }
    case 'auto-battle':
      session.autoResolveBattle();
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
    case 'restart':
      // Reiniciar es partida NUEVA: se sortea aunque la URL traiga una semilla.
      session = abrePartida(semillaSorteada());
      aventura.olvidarRuta();
      aventura.centrar();
      break;
    default:
      return;
  }
});

document.addEventListener('keydown', (ev) => {
  // Lo que se escribe en un campo de texto o se pulsa en un cuadro es suyo, no un atajo.
  if (ev.target instanceof Element && ev.target.closest('textarea, input, dialog') !== null) return;
  if (desarrollo?.tecla(ev) === true) {
    pedirFotograma();
    return;
  }
  if (ev.key === 'Escape' && session.scene === 'town') {
    // Escape cierra primero lo abierto en la base y, si no hay nada, la base.
    if (castillo.abierto !== null) {
      castillo.cerrar();
    } else {
      session.closeTown();
      castillo.salir();
    }
  }
  // Escape suelta el hechizo elegido o el poder que espera aliado.
  if (ev.key === 'Escape' && session.scene === 'battle' && !jugadaEnCurso()) {
    session.soltarLoApuntado();
  }
  // En batalla, Espacio cierra el turno de la unidad tuya que está actuando: con
  // el movimiento en tramos es lo que más se pulsa. Pasa por la misma puerta que
  // el lienzo y los botones, y sin turno propio no hace nada.
  // Con el foco en un botón, Espacio es pulsar ESE botón —Rendirse, Continuar—,
  // que es lo que el navegador hace con él: no se le roba la tecla.
  const enUnBoton = ev.target instanceof Element && ev.target.closest('button') !== null;
  if (ev.key === ' ' && session.scene === 'battle' && !enUnBoton) {
    ev.preventDefault();
    if (!ev.repeat && session.turnoPropio !== null && !jugadaEnCurso()) {
      session.playBattleAction({ type: 'end_turn' });
    }
  }
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
  if ((ev.key === '+' || ev.key === '-') && session.scene === 'adventure') {
    aventura.zoom(ev.key === '+' ? 1 : -1);
  }
  pedirFotograma();
});

session.status =
  'Haz clic en el mapa para mover a tu héroe; arrastra para mirar. Espacio pasa el turno.';
pedirFotograma();

if (HERRAMIENTAS_DE_DESARROLLO) {
  void import('./desarrollo/herramientas.js')
    .then((m) => {
      desarrollo = m.montar({
        sesion,
        aventura,
        canvas,
        herramientas: document.getElementById('herramientas') as HTMLElement,
        pedirFotograma,
        pintarYa: () => dibujarFotograma(performance.now()),
      });
      pedirFotograma();
    })
    .catch((err: unknown) => {
      console.error('[cliente] no se han podido montar las herramientas de desarrollo', err);
      elStatus.textContent = `No se han podido montar las herramientas de desarrollo: ${err instanceof Error ? err.message : String(err)}`;
    });
}
