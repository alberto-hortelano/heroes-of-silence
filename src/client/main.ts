/**
 * Punto de entrada del cliente: arranque, bucle de dibujo y reparto del ratón.
 *
 * La sesión decide, `render/` pinta, `views/` monta los paneles y cada escena
 * (`escenas/`) traduce el puntero de su pantalla. Aquí solo se conecta todo.
 */
import { parseSeed } from '@core/rng.js';
import { EscenaAventura } from './escenas/aventura.js';
import { EscenaBatalla } from './escenas/batalla.js';
import { EscenaCastillo } from './escenas/castillo.js';
import { PuertaDeFinDeTurno } from './fin-de-turno.js';
import { pintar } from './html.js';
import { cargarArte } from './render/assets.js';
import { hayFigurasAnimadas } from './render/figura.js';
import { ajustarLienzo } from './render/lienzo.js';
import { Session } from './session.js';
import { renderActions, renderSide, renderTopbar } from './views/panels.js';

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

/**
 * La semilla que pide la URL, o `null` si no pide ninguna. Lanza si pide una
 * que no lo es: la regla entera —incluido que `?seed=` vacío es no pedir— la
 * escribe el núcleo (`parseSeed`), aquí solo se lee la barra de direcciones.
 */
function semillaDeLaUrl(): number | null {
  return parseSeed(new URLSearchParams(location.search).get('seed'));
}

/** Una partida que nadie ha pedido: la de hoy a esta hora. */
function semillaSorteada(): number {
  return Date.now() % 100000;
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
  elSeed.textContent = `semilla ${abierta.state.seed}`;
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
const castillo = new EscenaCastillo(sesion);
const finDeTurno = new PuertaDeFinDeTurno(() => performance.now());

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
 * cuando llega arte (los iconos de recursos) o cuando la partida es otra. Antes
 * se generaba su marcado en cada fotograma para compararlo con el anterior.
 */
let paneles: { sesion: Session; version: number; arte: number } | null = null;
let arteLlegado = 0;
cargarArte(() => {
  arteLlegado++;
  pedirFotograma();
});

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
    if (hayAnimacion()) pedirFotograma();
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
    escenaPintada = escena;
  }

  const rect = principal.preparar();
  ctx.clearRect(0, 0, rect.width, rect.height);
  if (escena === 'town' && session.activeTown !== null) {
    castillo.dibujar(ctx, rect.width, rect.height, ahora);
  } else if (escena === 'battle' && session.battle !== null) {
    batalla.sincronizar(ahora);
    batalla.dibujar(ctx, rect.width, rect.height);
    seguirALaActiva();
  } else {
    aventura.dibujar(ctx, rect.width, rect.height, ahora);
    aventura.dibujarMinimapa(minimapa);
  }
  señalarEnemigo(escena === 'battle' && session.battle !== null);

  if (
    paneles === null ||
    paneles.sesion !== session ||
    paneles.version !== session.version ||
    paneles.arte !== arteLlegado
  ) {
    paneles = { sesion: session, version: session.version, arte: arteLlegado };
    const top = renderTopbar(session);
    elDay.textContent = top.day;
    pintar(elResources, top.resources);
    elTurn.textContent = top.turn;
    pintar(elSide, renderSide(session));
    pintar(elActions, renderActions(session));
  }
  if (elStatus.textContent !== session.status) elStatus.textContent = session.status;
}

/**
 * La única puerta de los gestos de batalla mientras la jugada se está contando.
 *
 * El tablero que se ve todavía no es el del estado, así que no se acepta nada:
 * ni un clic en el lienzo ni un botón ni Escape. Estaba repartida —una
 * comprobación en el clic del lienzo y otra en dos de los botones—, y por los
 * huecos se colaban «Resolver sola», el libro de hechizos, «Continuar» y Escape.
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
    canvas.style.cursor = castillo.mover(p.x, p.y) ? 'pointer' : 'default';
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
  if (session.scene === 'town') castillo.pulsar(p.x, p.y);
  else if (session.scene === 'battle') {
    batalla.mover(p.x, p.y);
    if (!jugadaEnCurso()) batalla.pulsar(p.x, p.y);
  } else aventura.soltar(p.x, p.y, ev.pointerType === 'touch');
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
function pasarTurno(): void {
  const animando = session.scene === 'adventure' && aventura.arrastrando;
  if (!finDeTurno.abierta(session, animando)) return;
  aventura.olvidarRuta();
  void finDeTurno.pasar(session, animando).then(pedirFotograma);
}

document.addEventListener('click', (ev) => {
  const target = (ev.target as HTMLElement).closest('[data-action]');
  if (target === null) return;
  const action = target.getAttribute('data-action');
  // Mirar al enemigo no es un gesto de la batalla: se puede mientras se cuenta.
  if (action === 'ver-enemigo') {
    const izquierda = haciaEnemigo.dataset.lado === 'izquierda' ? 0 : lienzo.scrollWidth;
    lienzo.scrollTo({ left: izquierda, behavior: 'smooth' });
    return;
  }
  if (action === null || jugadaEnCurso()) return;
  pedirFotograma();

  switch (action) {
    case 'end-turn':
      pasarTurno();
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
      session.closeTown();
      castillo.salir();
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
      // El hueco lo valida el núcleo (`unequipBlocker`), que es la puerta por la
      // que entra también el agente: uno mal escrito sale en la barra con su motivo.
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
      session.selectSpell(target.getAttribute('data-spell') as string);
      break;
    case 'auto-battle':
      session.autoResolveBattle();
      break;
    case 'finish-battle':
      session.finishBattle();
      aventura.olvidarRuta();
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
  if (ev.key === 'Escape' && session.scene === 'town') {
    session.closeTown();
    castillo.salir();
  }
  if (ev.key === 'Escape' && session.scene === 'battle' && !jugadaEnCurso()) session.clearSpell();
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
  if ((ev.key === '+' || ev.key === '-') && session.scene === 'adventure') {
    aventura.zoom(ev.key === '+' ? 1 : -1);
  }
  pedirFotograma();
});

session.status =
  'Haz clic en el mapa para mover a tu héroe; arrastra para mirar. Espacio pasa el turno.';
pedirFotograma();
