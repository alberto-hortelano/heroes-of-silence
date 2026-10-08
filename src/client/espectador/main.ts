/**
 * El espectador: mira la partida del servidor y no juega.
 *
 * **No manda ni un intent, no aplica ni una regla y no importa `session.ts`**
 * (criterio 7). Solo abre el WebSocket, lee snapshots y pinta. Que no aplique
 * reglas lo vigila además `invariantes.test.ts`, que corre sobre `src/client`
 * entero: esta carpeta cae dentro y por eso vive aquí y no en otra parte.
 *
 * Reutiliza sin copiar los lienzos de `render/`, el animador de batalla y la
 * crónica de `views/panels`. Lo único duplicado es el bucle de dibujo, y es más
 * corto que el del cliente que juega porque aquí no hay ratón ni sesión.
 */
import { SIN_CARGAS } from '@core/battle/battle.js';
import { todosALaVista } from '@core/state/asaltantes.js';
import type { SpectatorSnapshotMsg } from '../../server/protocol.js';
import type { SpectatorView } from '../../server/vista-espectador.js';
import { NADA, pintar } from '../html.js';
import { cargarArte } from '../render/assets.js';
import { bandosSinDueño, drawBatalla } from '../render/batalla.js';
import { type CamaraMapa, centrarEn, TILE_LEGIBLE } from '../render/camara-mapa.js';
import { apuntarElSueloEn, escenarioListo, topeDeAlejar } from '../render/escenario/superficie.js';
import { hayFigurasAnimadas } from '../render/figura.js';
import { ajustarLienzo, pixelesDe } from '../render/lienzo.js';
import { type AdventureScene, drawMapa, presupuestoConHolgura } from '../render/mapa.js';
import { tableroPara } from '../render/proyeccion.js';
import { rotuloDeDia } from '../views/panels.js';
import { adaptarEscena, centroDeLaEscena } from './adaptar.js';
import { type FinDePartida, panelDelEspectador } from './paneles.js';
import {
  type Caida,
  Mirada,
  partidaCorta,
  partidaDelMensaje,
  Reintentos,
  type SiguienteIntento,
  textoDeEspera,
  textoDeIntento,
  textoDeRendicion,
} from './reconexion.js';

const app = document.getElementById('app') as HTMLElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;

const elDay = document.getElementById('day') as HTMLElement;
const elTurn = document.getElementById('turn') as HTMLElement;
const elSide = document.getElementById('side') as HTMLElement;
const elStatus = document.getElementById('status') as HTMLElement;
const elSeed = document.getElementById('seed') as HTMLElement;

/**
 * El puerto del canal de espectadores, sin escribirlo a mano (criterio 20).
 *
 * `HEROES_SPECTATOR_PORT` lo mueve y **acepta `0`** para que lo elija el sistema
 * (#61), así que un `ws://localhost:9880` escrito aquí contradiría esa decisión.
 * Lo inyecta `vite.config.ts` desde `entorno.ts`, que es la única fuente — el
 * cliente no puede leer las variables de entorno y hay un invariante que lo
 * vigila.
 *
 * Con `0` **no se adivina**: se dice que el servidor pidió puerto efímero, dónde
 * está escrito el número que le tocó y cómo pasárselo a esta página.
 *
 * **Y cuidado con cómo se comprueba que la sustitución ocurre.** Un
 * `curl http://localhost:3100/espectador/main.ts` devuelve el identificador SIN
 * sustituir y parece un fallo: lo comprobé así, me lo creí, y llegué a mover la
 * declaración a un `.d.ts` para «arreglar» algo que no estaba roto. En el
 * navegador está sustituido —`9880` en la consola— porque lo que sirve ese `curl`
 * no es lo que acaba cargando el módulo. Esto se verifica en la consola.
 */
declare const PUERTO_ESPECTADORES: number;

interface Destino {
  readonly puerto: number | null;
  /** Por qué no se puede conectar, escrito para la persona. */
  readonly motivo: string;
}

function destino(): Destino {
  const pedido = new URLSearchParams(location.search).get('puerto');
  if (pedido !== null && pedido.trim() !== '') {
    const n = Number(pedido);
    if (!Number.isInteger(n) || n <= 0 || n > 65535) {
      return {
        puerto: null,
        motivo: `"?puerto=${pedido}" no es un puerto: pon un entero entre 1 y 65535, o quita el parámetro`,
      };
    }
    return { puerto: n, motivo: '' };
  }
  if (PUERTO_ESPECTADORES === 0) {
    return {
      puerto: null,
      motivo:
        'el servidor arrancó con HEROES_SPECTATOR_PORT=0, así que el puerto lo eligió el sistema. ' +
        'Míralo en la línea "canal de espectadores en ws://localhost:NNNN" de la terminal de ' +
        '`pnpm partida` y abre /espectador/?puerto=NNNN',
    };
  }
  return { puerto: PUERTO_ESPECTADORES, motivo: '' };
}

// --------------------------------------------------------------- estado

let vista: SpectatorView | null = null;
/** Lo que se pinta, adaptado una vez por fotograma del cable y no a cada fotograma de pantalla. */
let escena: AdventureScene | null = null;
let dia = 0;
let turnoDe = 0;
let finDe: FinDePartida | null = null;
/**
 * Por qué no se entendió el último fotograma del cable, o `null` si se entendió.
 * Mientras no es `null` la barra lo dice y se sigue enseñando el último bueno:
 * ni el siguiente fotograma de pantalla ni un mensaje nuevo lo tapan con un
 * «Mirando la partida». Solo lo quita un fotograma que sí se entienda.
 */
let ilegible: string | null = null;
/**
 * El espectador mira desde lo más lejos que deja el tope de alejar: es quien
 * quiere ver más mapa, y no tiene rueda con la que pedirlo. Pide el zoom más
 * lejano de todos y `centrarEn` lo sube hasta el tope de la escena y del lienzo.
 */
const LO_MAS_LEJOS: CamaraMapa = { tile: TILE_LEGIBLE, x: 0, y: 0 };
/**
 * El presupuesto de píxeles del mapa, la misma cuenta que en el cliente. Como el
 * espectador mira siempre al tope, le sale `PIXELES_DEL_MAPA`.
 */
const presupuestoDelMapa = presupuestoConHolgura();
/** Los paneles se rehacen cuando llega algo nuevo, no a cada fotograma. */
let panelesPendientes = true;
/** Si el panel se pintó con el tablero aún contando: entonces calla el final. */
let panelContando = false;
/** A dónde se conectó, para poder repetirlo en la barra. Vacío hasta conectar. */
let urlDelCanal = '';

/**
 * Lo que llega por el cable no se aplica al llegar: pasa por el reproductor, que
 * lo pone fotograma a fotograma, al ritmo al que el animador lo cuenta —el mismo
 * animador que el cliente que juega: quién anda, quién golpea, quién cae— y
 * retiene el final de cada batalla hasta que se ha visto (`reproductor.ts`,
 * `telon.ts`).
 */
const mirada = new Mirada();

/** Sin objetivos ni hexes atacables: el espectador no mueve nada. */
const NINGUNO: ReadonlySet<string> = new Set();

let fotogramaPedido = false;
function pedirFotograma(): void {
  if (fotogramaPedido) return;
  fotogramaPedido = true;
  requestAnimationFrame(dibujar);
}

const principal = ajustarLienzo(canvas, pedirFotograma);
const ctx = principal.ctx;

/**
 * Si el último intento de pintar reventó. Sirve para dos cosas: no repetir el
 * aviso sesenta veces por segundo, y **volver a decir que se está mirando** en
 * cuanto un fotograma bueno se pinta.
 */
let fallandoAlPintar = false;

/**
 * El bucle de dibujo, con red.
 *
 * Este ciclo ha metido en el bucle tres funciones que **lanzan** —`pintar`,
 * `srcDeImagen` y `fondoDeColor`— donde antes solo había asignaciones a
 * `innerHTML`, que no pueden lanzar. Eso cambia la física del bucle: con el
 * `requestAnimationFrame` en la última línea, **una sola excepción mataba el
 * bucle entero**, y la página se quedaba congelada con la barra de estado
 * diciendo tan tranquila «Mirando la partida». Un fallo que se presenta como
 * normalidad es peor que uno ruidoso.
 *
 * Dos decisiones, y las dos son de esta casa:
 *
 *  - el fallo **se dice**, con su motivo, en la barra. El `catch` no está vacío
 *    ni se traga nada;
 *  - y tras un fallo no se pide otro fotograma: se vuelve a intentar cuando
 *    llegue otro fotograma del servidor, en vez de repetir el mismo fallo
 *    sesenta veces por segundo. Mientras todo va bien, se repinta solo mientras
 *    algo se mueve: las figuras que respiran o la cola del animador.
 */
function dibujar(ahora: number): void {
  fotogramaPedido = false;
  try {
    // Lo que no es el último no se llega a ver en pantalla —no traía nada que
    // contar, ver `paso`—, así que solo el último se adapta para pintar.
    const llegado = mirada.reproductor.paso(ahora).at(-1);
    if (llegado !== undefined) aplicar(llegado);
    pintarTodo(ahora);
    if (fallandoAlPintar) {
      fallandoAlPintar = false;
      decirQueSeMira();
    }
    // El telón también pide fotogramas: mientras retiene un final, el reloj que
    // lo suelta solo avanza si alguien vuelve a mirar.
    if (
      mirada.reproductor.pendiente ||
      (vista !== null && (hayFigurasAnimadas() || mirada.reproductor.animador.busy))
    ) {
      pedirFotograma();
    }
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    if (!fallandoAlPintar) {
      console.error('[espectador] fallo al pintar', err);
      fallandoAlPintar = true;
      elStatus.textContent =
        `No se ha podido pintar este fotograma: ${motivo}. ` +
        'Se sigue escuchando; el siguiente que llegue vuelve a intentarlo.';
    }
  }
}

/**
 * Lo que mira el espectador en un lienzo de `ancho × alto`: todo, lo más lejos
 * que deja el tope de alejar. Sin partida aún, la cámara de `LO_MAS_LEJOS`.
 */
function encuadreDelMapa(ancho: number, alto: number): { camara: CamaraMapa; tope: number } {
  if (vista === null || escena === null) return { camara: LO_MAS_LEJOS, tope: TILE_LEGIBLE };
  const esc = escenarioListo(escena.map, vista.seed);
  const tope = esc === null ? TILE_LEGIBLE : topeDeAlejar(esc, ancho, alto);
  const camara = centrarEn(LO_MAS_LEJOS, centroDeLaEscena(vista), {
    ancho,
    alto,
    mapaAncho: escena.map.width,
    mapaAlto: escena.map.height,
    tileMinimo: tope,
  });
  return { camara, tope };
}

function pintarTodo(ahora: number): void {
  const batalla = mirada.reproductor.batalla;
  const nueva = batalla === null ? 'adventure' : 'battle';
  if (vista !== null && app.dataset.escena !== nueva) {
    app.dataset.escena = nueva;
    principal.remedir();
  }
  const rect = principal.preparar(
    batalla === null
      ? (medida, dpr) => {
          const { camara, tope } = encuadreDelMapa(medida.width, medida.height);
          return presupuestoDelMapa(camara.tile, tope, pixelesDe(medida.width, medida.height, dpr));
        }
      : undefined,
  );
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (vista !== null && escena !== null) {
    if (batalla !== null) {
      // Mientras hay batalla se enseña el tablero: es lo que este ciclo existe
      // para que se vea, y son la mayoría de las decisiones que toma el agente.
      const enCurso = batalla;
      drawBatalla(ctx, {
        battle: enCurso,
        tablero: tableroPara(rect.width, rect.height),
        ancho: rect.width,
        alto: rect.height,
        movibles: [],
        // El espectador no tiene turno propio: ni casillas de carga ni ángulo.
        cargas: SIN_CARGAS,
        angulo: null,
        atacables: NINGUNO,
        objetivosHechizo: NINGUNO,
        hoverHex: null,
        hoverStack: null,
        figura: (s) => mirada.reproductor.animador.figura(s),
        efectos: mirada.reproductor.animador.efectos(enCurso),
        sinDueño: bandosSinDueño(mirada.reproductor.dueños),
      });
      apuntarLoQueSePinta(true);
    } else {
      apuntarLoQueSePinta(false);
      const { camara } = encuadreDelMapa(rect.width, rect.height);
      // Un espectador lo ve TODO: eso es lo que es. Por eso la niebla de #64
      // no aplica aquí: todos los héroes y los objetos vivos.
      drawMapa(ctx, {
        escena,
        asaltantes: todosALaVista(vista.raiders),
        heroes: vista.heroes,
        objetos: escena.map.objects,
        camara,
        ancho: rect.width,
        alto: rect.height,
        explorado: null,
        visibles: null,
        ruta: [],
        seleccionado: null,
        hover: null,
        // La de la partida: la escena es la misma que ve quien juega.
        semilla: vista.seed,
        tiempo: ahora,
      });
    }
  }

  // El final de la batalla no se adelanta al tablero: el panel lo calla mientras
  // el animador cuenta, y se repinta en cuanto acaba (H-7 de la QA de la fase 1b).
  const contando = mirada.reproductor.contando;
  if (panelesPendientes || contando !== panelContando) {
    panelesPendientes = false;
    panelContando = contando;
    pintarPaneles();
  }
}

/**
 * Lo que de verdad se ve en el tablero, apuntado en el `#app` para quien lo mire
 * desde fuera: `pnpm capturas` lo lee para comprobar que, cuando el panel dice
 * «Fin», no queda ninguna figura muerta en pie y el animador ya no cuenta nada.
 *
 * Existe porque el paso del espectador de `capturas` comprobaba el texto y no el
 * tablero, y dio verde sobre una captura con esqueletos muertos de pie (H-7). Lo
 * que se apunta sale de las mismas `figura()` con las que se acaba de pintar, no
 * de una segunda cuenta: no puede discrepar del lienzo.
 */
function apuntarLoQueSePinta(hayBatalla: boolean): void {
  // Cuántos fotogramas del cable esperan: lo que el espectador va retrasado.
  app.dataset.atrasados = String(mirada.reproductor.atrasados);
  if (!hayBatalla) {
    delete app.dataset.caidosEnPie;
    delete app.dataset.animando;
    return;
  }
  app.dataset.caidosEnPie = String(mirada.reproductor.caidosEnPie());
  app.dataset.animando = String(mirada.reproductor.contando);
}

function pintarPaneles(): void {
  elDay.textContent = dia === 0 ? '—' : rotuloDeDia(dia);
  elTurn.textContent =
    finDe !== null
      ? finDe.winner === null
        ? 'Terminada sin ganador'
        : `Gana el jugador ${finDe.winner}`
      : dia === 0
        ? ''
        : `Juega el jugador ${turnoDe}`;
  pintar(elSide, vista === null ? NADA : panelDelEspectador(vista, finDe, panelContando));
}

// --------------------------------------------------------------- el cable

/**
 * La barra en marcha normal: «Mirando la partida», salvo que el último
 * fotograma del cable no se entendiera, que entonces se sigue diciendo eso.
 */
function decirQueSeMira(): void {
  // Apuntado en el `#app` para quien lo compruebe desde fuera, como `data-escenario`.
  if (ilegible === null) delete app.dataset.ilegible;
  else app.dataset.ilegible = ilegible;
  const cual =
    mirada.partida === null ? 'la partida' : `la partida ${partidaCorta(mirada.partida)}`;
  const sustituyoA = mirada.anterior;
  // El cambio de partida se sigue diciendo mientras dure la nueva: quien vuelve
  // a mirar la pestaña tiene que poder leer por qué el mapa no es el de antes.
  const cambio =
    sustituyoA === null
      ? ''
      : ` El servidor volvió con otra partida (antes, la ${partidaCorta(sustituyoA)}): ` +
        'se empezó de cero.';
  elStatus.textContent =
    ilegible === null
      ? `Mirando ${cual} en ${urlDelCanal}.${cambio}`
      : `No se entiende el último fotograma que llegó de ${urlDelCanal}: ${ilegible}. ` +
        'Se sigue enseñando el último que se entendió.';
}

/**
 * Lo que se pintaba era de otra partida: fuera. El reproductor ya lo cambió
 * `Mirada`; aquí se suelta lo que la página guarda de la vista.
 */
function empezarDeCero(): void {
  vista = null;
  escena = null;
  dia = 0;
  turnoDe = 0;
  finDe = null;
  ilegible = null;
  panelesPendientes = true;
  delete app.dataset.escena;
  console.info(
    `[espectador] el servidor trae otra partida (${partidaCorta(mirada.partida ?? '')}, antes ` +
      `${partidaCorta(mirada.anterior ?? '')}): se empieza de cero`,
  );
}

/**
 * Pone en pantalla un fotograma del cable, cuando el telón lo suelta.
 *
 * **Adapta antes de asignar.** Antes se asignaba `vista` y luego se adaptaba:
 * con un fotograma que no se entendía (un `pnpm partida` de antes de #153, que
 * manda `roads`) `adaptarEscena` lanzaba con `vista` ya cambiada y `escena`
 * vieja; el `catch` de `dibujar` lo decía, pero el fotograma siguiente pintaba
 * sin fallar, borraba el aviso y dejaba la pantalla negra diciendo «Mirando la
 * partida». Ahora lo que no se entiende no sustituye a nada y se dice hasta que
 * llegue algo que sí.
 */
function aplicar(snapshot: SpectatorSnapshotMsg): void {
  let nueva: AdventureScene;
  try {
    nueva = adaptarEscena(snapshot.view);
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    console.error('[espectador] fotograma del cable que no se entiende', err);
    ilegible = motivo;
    decirQueSeMira();
    return;
  }
  vista = snapshot.view;
  escena = nueva;
  if (ilegible !== null) {
    ilegible = null;
    decirQueSeMira();
  }
  dia = snapshot.day;
  turnoDe = snapshot.current;
  finDe = snapshot.finished;
  panelesPendientes = true;
}

/** Qué pasa con el canal, apuntado en el `#app` para quien lo mire desde fuera. */
type EstadoDelCanal = 'conectando' | 'abierto' | 'esperando' | 'rendido';

function apuntarCanal(estado: EstadoDelCanal): void {
  app.dataset.canal = estado;
}

const reintentos = new Reintentos();

/**
 * Se conecta y se queda escuchando; si se cae, vuelve a llamar (#104).
 *
 * Criterio 10: **sin servidor levantado se DICE**, con el motivo y cómo salir,
 * en vez de dejar la página en blanco. Y si se cae en marcha, también: lo que se
 * pinta se queda —el último fotograma sigue ahí— y la barra explica que ya no
 * llegan más, cuándo es el siguiente intento y cuántos quedan (`reconexion.ts`).
 */
function conectar(): void {
  const { puerto, motivo } = destino();
  if (puerto === null) {
    elStatus.textContent = `No se puede conectar: ${motivo}.`;
    elSeed.textContent = 'sin canal';
    return;
  }

  const url = `ws://localhost:${puerto}`;
  urlDelCanal = url;
  // El puerto se escribe ANTES de conectar, no después: si el servidor está en
  // otro, el desajuste se LEE en vez de quedarse en un «conectando…» inerte.
  elSeed.textContent = url;
  elStatus.textContent = `Conectando con ${url}…`;
  abrir(url, null);
}

/**
 * Un intento. `intento` es `null` en el primero, que no es un reintento: su
 * barra es el «Conectando…» de siempre.
 */
function abrir(url: string, intento: { readonly n: number; readonly caida: Caida } | null): void {
  apuntarCanal('conectando');
  if (intento !== null) elStatus.textContent = textoDeIntento(intento.caida, url, intento.n);

  const socket = new WebSocket(url);
  let huboConexion = false;
  /**
   * Si aún no ha llegado nada por este canal. El primer fotograma de cada canal
   * cambia la barra a «Mirando»: con `vista === null` como señal, tras volver a
   * la MISMA partida se quedaba diciendo «Conectado otra vez…» para siempre.
   */
  let primero = true;

  socket.addEventListener('open', () => {
    huboConexion = true;
    reintentos.conectado();
    apuntarCanal('abierto');
    // Conectado NO es lo mismo que hay partida. `broadcast()` sale antes si el
    // director todavía no existe, y no existe hasta que pasan la espera del
    // agente (120 s por defecto) y la del plan de mapa. En ese hueco decir
    // «Mirando la partida» sobre una pantalla negra es afirmar que todo va bien
    // cuando no hay nada que ver: quien abre `pnpm mirar` siguiendo el README
    // cae justo ahí. Lo que se dice es lo que está pasando, y se cambia cuando
    // llega el primer fotograma.
    elStatus.textContent =
      vista === null
        ? `Conectado a ${url}. Esperando a que empiece la partida: el servidor no ` +
          'retransmite hasta que el agente se conecta y le da su plan de mapa.'
        : // Tras un reinicio el servidor tarda en tener partida, y mientras se
          // sigue viendo la vieja: se dice que es la vieja y qué pasará.
          `Conectado otra vez a ${url}. Lo que se ve es la partida de antes hasta que ` +
          'llegue un fotograma; si es de otra partida, se empieza de cero.';
  });

  socket.addEventListener('message', (ev) => {
    let msg: unknown;
    try {
      msg = JSON.parse(String(ev.data));
    } catch (err) {
      elStatus.textContent = `Llegó algo que no es JSON: ${err instanceof Error ? err.message : String(err)}`;
      return;
    }
    // Lo único que se valida en ejecución, tal y como dice `vista-espectador.ts`:
    // el resto del formato lo garantiza `tsc` en los dos extremos. Lo que no
    // encaje se dice, no se ignora.
    if (
      typeof msg !== 'object' ||
      msg === null ||
      (msg as { type?: unknown }).type !== 'snapshot'
    ) {
      elStatus.textContent = `Mensaje que este espectador no entiende: ${JSON.stringify(msg).slice(0, 120)}`;
      return;
    }
    let partida: string;
    try {
      partida = partidaDelMensaje(msg);
    } catch (err) {
      elStatus.textContent = `No se puede mirar ${url}: ${err instanceof Error ? err.message : String(err)}.`;
      return;
    }
    // Se reconoce AL LLEGAR y no al poner: lo que está en la cola del telón es
    // de la partida vieja y no se tiene que ver ni un fotograma más.
    if (mirada.llega(msg as SpectatorSnapshotMsg) === 'otra') empezarDeCero();
    app.dataset.partida = partida;
    if (primero || vista === null) {
      primero = false;
      decirQueSeMira();
    }
    pedirFotograma();
  });

  socket.addEventListener('error', () => {
    // El evento de error de un WebSocket no lleva motivo por diseño del
    // navegador, y siempre le sigue un `close`: es allí donde se dice qué pasa
    // y cuándo es el siguiente intento.
    console.warn(`[espectador] el canal ${url} ha fallado`);
  });

  socket.addEventListener('close', () => {
    // Tres caídas distintas, y las tres se dicen. La de en medio faltaba: la
    // conexión SÍ se abrió pero no llegó a haber partida, y quedaba «Conectado,
    // esperando…» ante un servidor muerto.
    const caida: Caida = vista !== null ? 'cortada' : huboConexion ? 'antes-de-empezar' : 'nadie';
    const siguiente = reintentos.siguiente(performance.now());
    if (siguiente === null) {
      apuntarCanal('rendido');
      elStatus.textContent = textoDeRendicion(caida, url);
      return;
    }
    esperarYReabrir(url, caida, siguiente);
  });
}

/**
 * La cuenta atrás hasta el siguiente intento, en la barra y al segundo. Se
 * reprograma a cada segundo en vez de un solo `setTimeout` largo para que lo que
 * dice la barra sea lo que falta de verdad.
 */
function esperarYReabrir(url: string, caida: Caida, siguiente: SiguienteIntento): void {
  apuntarCanal('esperando');
  const tic = (): void => {
    const ahora = performance.now();
    if (ahora >= siguiente.en) {
      abrir(url, { n: siguiente.intento, caida });
      return;
    }
    elStatus.textContent = textoDeEspera(caida, url, siguiente, ahora);
    // Hasta el próximo cambio de segundo de la cuenta, o hasta el intento.
    const resto = (siguiente.en - ahora) % 1000;
    setTimeout(tic, resto === 0 ? 1000 : resto);
  };
  tic();
}

// El arte entra cuando entra, igual que en el cliente que juega: sin PNGs cada
// renderizador pinta su marcador de color y se mira igual.
cargarArte(() => {
  panelesPendientes = true;
  pedirFotograma();
});
apuntarElSueloEn(app);
conectar();
pedirFotograma();
