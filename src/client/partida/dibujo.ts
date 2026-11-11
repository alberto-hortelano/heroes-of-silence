/**
 * El fotograma de la partida (R7 de la reorganización, 07-11-2026: estaba en `main.ts`): qué
 * se pinta, cuándo hace falta otro, y lo que se recoloca alrededor del lienzo al pintarlo —la
 * escena en `#app`, el lateral, el marco del tablero que se desplaza, las marcas del lienzo,
 * los paneles, la barra y los diálogos—. El bucle que lo pide es de `main.ts`
 * (`comun/bucle.ts`, `pedirFotograma`): aquí, lo que pinta (`dibujarFotograma`) y si pide otro
 * (`otroFotograma`). Y el mapa, calentado mientras se está en la base (`calentarElMapa`).
 */
import { barraDeLaBatalla } from '../batalla/panel.js';
import { ponerEnLaBarra } from '../comun/barra.js';
import { pintar } from '../comun/html.js';
import { escenarioListo, sueloDelMapa } from '../render/escenario/superficie.js';
import { hayFigurasAnimadas } from '../render/figuras/figura.js';
import type { Session } from '../sesion/partida.js';
import { pintarSiguiendoElFinal } from '../views/al-final.js';
import { mostrarConversacion, mostrarLaGuarnicion } from './dialogos.js';
import { type EscenaDeDentro, esDeDentro, type PaginaDeLaPartida } from './pagina.js';
import { renderActions, renderSide, renderTopbar } from './paneles.js';

/**
 * Cuándo se pinta, que es la mitad del trabajo (el bucle, `pedirFotograma`, en `main.ts`).
 *
 * El lienzo pide fotograma solo mientras hay algo que se mueve: figuras que
 * respiran (con su arte cargado), la cola del animador de batalla o un arrastre
 * del mapa. Fuera de eso, se pinta cuando algo pasa —un gesto, el fin del turno
 * del rival, un cambio de tamaño, arte que llega— y se para. Tras pintar un
 * fotograma, o fallar al pintarlo, se pide otro si algo se mueve, y también si la
 * escena cambió mientras se pintaba —la marcha que llega dentro del fotograma
 * (`EscenaAventura`, `acabarLaMarcha`) y abre la batalla o la base; hasta #341,
 * también un «Continuar» que esperaba a la jugada—: este fotograma pintó la de antes.
 */
export function otroFotograma(
  pagina: Pick<PaginaDeLaPartida, 'session' | 'batalla' | 'aventura' | 'estado'>,
): boolean {
  return hayAnimacion(pagina) || pagina.session.scene !== pagina.estado.escenaPintada;
}

function hayAnimacion(
  pagina: Pick<PaginaDeLaPartida, 'session' | 'batalla' | 'aventura'>,
): boolean {
  const { session, batalla, aventura } = pagina;
  if (hayFigurasAnimadas()) return true;
  if (session.scene === 'battle') return batalla.ocupada;
  return session.scene === 'adventure' && (aventura.arrastrando || session.marchaEnCurso !== null);
}

/** El fotograma de `ahora`: la escena de la partida y todo lo de alrededor del lienzo. */
export function dibujarFotograma(pagina: PaginaDeLaPartida, ahora: number): void {
  const { session, estado, app, canvas, lienzo, minimapa, stage, lateral, principal, ctx } = pagina;
  const { aventura, batalla, castillo, dentro, rueda, elDay, elResources, elTurn } = pagina;
  const { elSide, elActions, elStatus } = pagina;
  const escena = session.scene;
  if (escena !== estado.escenaPintada) {
    // El lateral se desplaza solo, y la tropa heredaba lo bajado en el panel del
    // mapa: abría con la lista de a quién elegir por encima de la vista (QA, H3).
    // La tropa y la morada abren arriba, y al volver el mapa o la base se
    // encuentran su panel como lo dejaron. Se lee antes de cambiar `data-escena`
    // (con el marco de la tropa el lateral mide otra cosa y el navegador ya lo
    // recorta) y se pone después de repintar los paneles, por lo mismo.
    if (esDeDentro(dentro, escena)) {
      estado.escenaDeAntes = estado.escenaPintada;
      estado.lateralDeAntes = lateral.scrollTop;
      estado.lateralPendiente = 0;
    } else if (esDeDentro(dentro, estado.escenaPintada)) {
      // A la escena de donde se entró, como estaba; a otra, arriba.
      estado.lateralPendiente = escena === estado.escenaDeAntes ? estado.lateralDeAntes : 0;
      estado.lateralDeAntes = 0;
    }
    app.dataset.escena = escena;
    principal.remedir();
    // El tablero de batalla es más ancho que un móvil: se empieza mirando el
    // centro, que es donde se encuentran los dos bandos. El de la tropa, por su
    // borde: la formación es la del atacante, a la izquierda.
    lienzo.scrollLeft =
      escena === 'tropa' ? 0 : Math.max(0, (lienzo.scrollWidth - lienzo.clientWidth) / 2);
    // En el móvil lo que se desplaza es `#stage`: al abrir la base desde la
    // lista de castillos, que está debajo del lienzo, la pantalla nueva se
    // quedaba donde estaba el botón, con medio lienzo fuera de la vista.
    stage.scrollTop = 0;
    estado.escenaPintada = escena;
  }

  const enCastillo = escena === 'town' && session.activeTown !== null;
  const enBatalla = escena === 'battle' && session.battle !== null;
  const deDentro = esDeDentro(dentro, escena) ? dentro[escena].de : null;
  // Solo el mapa tiene presupuesto de píxeles: es la única pantalla que pinta
  // miles de sprites a cada fotograma. Depende del zoom: acercando, plena.
  const rect = principal.preparar(
    enCastillo || enBatalla || deDentro !== null ? undefined : aventura.presupuesto,
  );
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
    seguirALaActiva(pagina);
  } else if (deDentro !== null) {
    deDentro.dibujar(ctx, rect.width, rect.height, window.devicePixelRatio || 1, ahora);
  } else {
    aventura.dibujar(ctx, rect.width, rect.height, ahora);
    estado.desarrollo?.dibujar(ctx);
    aventura.dibujarMinimapa(minimapa);
  }
  señalarEnemigo(pagina, enBatalla);
  // Fuera de la batalla, cerrada (`pintar` la cierra si no hay batalla). Sus dos
  // figuras respiran con las del tablero (`hayFigurasAnimadas` pide el siguiente).
  rueda.pintar();
  rueda.animar(ahora);

  if (!enCastillo && canvas.dataset.base !== undefined) delete canvas.dataset.base;
  // El héroe que anda su marcha (`#app[data-marcha]`, su id): `pnpm capturas` espera
  // a que llegue antes de mirar lo que abre la llegada.
  const andando = session.marchaEnCurso?.heroe;
  if (andando === undefined) {
    if (app.dataset.marcha !== undefined) delete app.dataset.marcha;
  } else if (app.dataset.marcha !== andando) app.dataset.marcha = andando;
  // A quién se mira en cada escena de dentro (`canvas[data-tropa]`, el id de la
  // elegida; `canvas[data-morada]`, `<edificio>:<unidad>`): por donde esperan
  // `pnpm capturas` y los tests del navegador. Fuera de ella, sin la marca.
  for (const nombre of Object.keys(dentro) as EscenaDeDentro[]) {
    const marca = escena === nombre ? dentro[nombre].de.marca : '';
    if (marca === '') {
      if (canvas.dataset[nombre] !== undefined) delete canvas.dataset[nombre];
    } else if (canvas.dataset[nombre] !== marca) canvas.dataset[nombre] = marca;
  }

  // Después de `batalla.sincronizar`: es la cola de ESTE fotograma.
  const contando = enBatalla && batalla.ocupada;
  // Lo abierto en la base cambia el panel sin cambiar la partida: al llegar a
  // una puerta se abre su panel, y eso no sube la versión de la sesión.
  const cambiaLaPartida =
    estado.paneles === null ||
    estado.paneles.sesion !== session ||
    estado.paneles.version !== session.version ||
    estado.paneles.contando !== contando ||
    estado.paneles.base !== base;
  // El arte que llega solo cambia la barra (el icono del oro). El lateral
  // y las acciones no lo leen, y repintarlos con cada hoja o tramo que llegaba
  // perdía el toque que caía en medio: el botón tocado ya no existía al llegar
  // su clic (1 de cada 10 en la morada del móvil, 21-10-2026).
  if (cambiaLaPartida || estado.paneles?.arte !== estado.arteLlegado) {
    const top = renderTopbar(session);
    elDay.textContent = top.day;
    pintar(elResources, top.resources);
    elTurn.textContent = top.turn;
  }
  if (cambiaLaPartida) {
    pintarSiguiendoElFinal(
      elSide,
      renderSide(session, contando, enCastillo ? castillo.abierto : null),
    );
    pintar(elActions, renderActions(session, contando));
    mostrarConversacion(pagina, enCastillo, escena === 'lugar');
    mostrarLaGuarnicion(pagina);
  }
  estado.paneles = {
    sesion: session,
    version: session.version,
    arte: estado.arteLlegado,
    contando,
    base,
  };
  if (estado.lateralPendiente !== null) {
    lateral.scrollTop = estado.lateralPendiente;
    estado.lateralPendiente = null;
  }
  if (estado.fichaALaVista) {
    estado.fichaALaVista = false;
    llevarLaFichaALaVista(pagina);
  }
  // En la batalla, «La batalla ha terminado.» espera a que el tablero cuente el último
  // golpe, como el panel (#257); lo que no cabe se corta por frases (#264).
  const barra = enBatalla
    ? barraDeLaBatalla(session.status, session.batallaALaVista, contando)
    : session.status;
  ponerEnLaBarra(elStatus, barra, canvas);
}

/** Trae a la vista la ficha del elegido del ayuntamiento y su «Contratar» (`fichaALaVista`). */
function llevarLaFichaALaVista(pagina: Pick<PaginaDeLaPartida, 'elSide'>): void {
  const ficha = pagina.elSide.querySelector('.ficha-del-ayuntamiento');
  const contratar = ficha?.querySelector('[data-action="hire-hero"]');
  if (ficha == null || contratar == null) return;
  // Primero la ficha desde arriba y luego el botón: si la ficha entera no cabe,
  // manda que se vea «Contratar». `nearest` no mueve nada si ya se ve (el
  // escritorio, con el panel al lado).
  ficha.scrollIntoView({ block: 'nearest' });
  contratar.scrollIntoView({ block: 'nearest' });
}

/**
 * En el móvil el tablero se desplaza dentro de su marco: cuando le toca a otra
 * unidad tuya, el marco va hasta ella. Una sola vez por unidad, para que quien
 * desplaza a mano para mirar no vea el marco volver solo a cada fotograma.
 */
function seguirALaActiva(pagina: Pick<PaginaDeLaPartida, 'lienzo' | 'batalla' | 'estado'>): void {
  const { lienzo, batalla, estado } = pagina;
  if (lienzo.scrollWidth <= lienzo.clientWidth) return;
  const activa = batalla.activaPropia();
  if (activa === null || activa.id === estado.activaSeguida) return;
  estado.activaSeguida = activa.id;
  lienzo.scrollLeft = Math.max(0, activa.x - lienzo.clientWidth / 2);
}

/**
 * La pista del borde: en el móvil el marco empieza en tu unidad, y el enemigo
 * —al otro lado de un tablero de 860 px— quedaba entero fuera de la vista sin
 * que nada dijera que el tablero seguía. Si hay enemigos fuera, un botón en ese
 * borde lo dice con cuántos son, y pulsarlo lleva el marco hasta allí.
 */
function señalarEnemigo(
  pagina: Pick<PaginaDeLaPartida, 'lienzo' | 'batalla' | 'haciaEnemigo'>,
  enBatalla: boolean,
): void {
  const { lienzo, batalla, haciaEnemigo } = pagina;
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

/**
 * Compone el escenario del mapa y encarga su suelo mientras se está en la base,
 * cuando el hilo quede libre: el suelo lo pinta un Worker en 2-12 s y, si se
 * encargaba al salir de la base, el mapa se veía ese rato con el sucedáneo o el
 * esbozo. Son las mismas llamadas que hace el primer fotograma del mapa
 * (`escenarioListo`, `sueloDelMapa`), así que lo que se adelanta es lo que luego
 * se pinta.
 */
export function calentarElMapa(session: Session): void {
  const cuandoQuedeLibre = (fn: () => void): void => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 1000 });
    else setTimeout(fn, 100);
  };
  const paso = (): void => {
    const esc = escenarioListo(session.state.map, session.state.seed);
    // Se compone en una tarea aparte: hasta que esté, otra vuelta.
    if (esc === null) cuandoQuedeLibre(paso);
    else sueloDelMapa(esc, 1, devicePixelRatio);
  };
  cuandoQuedeLibre(paso);
}
