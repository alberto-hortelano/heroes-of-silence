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
import type { BattleState } from '@core/battle/types.js';
import type { SpectatorSnapshotMsg } from '../../server/protocol.js';
import type { SpectatorView } from '../../server/vista-espectador.js';
import { BattleAnimator } from '../anim.js';
import { NADA, pintar } from '../html.js';
import { cargarArte } from '../render/assets.js';
import { drawBatalla } from '../render/batalla.js';
import { type CamaraMapa, centrarEn, TILE_MIN } from '../render/camara-mapa.js';
import { hayFigurasAnimadas } from '../render/figura.js';
import { ajustarLienzo } from '../render/lienzo.js';
import { type AdventureScene, drawMapa } from '../render/mapa.js';
import { tableroPara } from '../render/proyeccion.js';
import { rotuloDeDia } from '../views/panels.js';
import { adaptarBatalla, adaptarEscena, centroDeLaEscena } from './adaptar.js';
import { type FinDePartida, panelDelEspectador } from './paneles.js';
import { batallaTerminada, TelonDeBatalla } from './telon.js';

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
let batalla: BattleState | null = null;
/**
 * Qué batalla es, para el animador: sube cada vez que aparece una después de no
 * haber ninguna. Cada fotograma del cable trae la batalla recién parseada, así
 * que el objeto no sirve para saber si es la misma.
 */
let numeroDeBatalla = 0;
/** Cuántos fotogramas del cable han llegado: la versión de lo que se pinta quieto. */
let fotogramasDelCable = 0;
let dia = 0;
let turnoDe = 0;
let finDe: FinDePartida | null = null;
let camara: CamaraMapa = { tile: TILE_MIN, x: 0, y: 0 };
/** Los paneles se rehacen cuando llega algo nuevo, no a cada fotograma. */
let panelesPendientes = true;
/** A dónde se conectó, para poder repetirlo en la barra. Vacío hasta conectar. */
let urlDelCanal = '';

/**
 * El mismo animador que el cliente que juega: cada acción que llega por el cable
 * se cuenta en orden —quién anda, quién golpea, quién cae— en vez de saltar de un
 * fotograma al siguiente. Era lo que prometía #30, «las batallas acción a
 * acción», y hasta ahora cada acción era un salto.
 */
const animador = new BattleAnimator();

/**
 * Lo que llega por el cable no se aplica al llegar: pasa por el telón, que
 * retiene el final de cada batalla hasta que se ha visto (ver `telon.ts`).
 */
const telon = new TelonDeBatalla<SpectatorSnapshotMsg>(batallaTerminada);

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
    const llegado = telon.avanzar(ahora, animador.busy);
    if (llegado !== null) aplicar(llegado);
    pintarTodo(ahora);
    if (fallandoAlPintar) {
      fallandoAlPintar = false;
      elStatus.textContent = `Mirando la partida en ${urlDelCanal}.`;
    }
    // El telón también pide fotogramas: mientras retiene un final, el reloj que
    // lo suelta solo avanza si alguien vuelve a mirar.
    if (telon.pendiente || (vista !== null && (hayFigurasAnimadas() || animador.busy))) {
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

function pintarTodo(ahora: number): void {
  const nueva = batalla === null ? 'adventure' : 'battle';
  if (vista !== null && app.dataset.escena !== nueva) {
    app.dataset.escena = nueva;
    principal.remedir();
  }
  const rect = principal.preparar();
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (vista !== null && escena !== null) {
    if (batalla !== null) {
      // Mientras hay batalla se enseña el tablero: es lo que este ciclo existe
      // para que se vea, y son la mayoría de las decisiones que toma el agente.
      animador.observe(batalla, numeroDeBatalla);
      animador.tick(ahora);
      const enCurso = batalla;
      drawBatalla(ctx, {
        battle: enCurso,
        tablero: tableroPara(rect.width, rect.height),
        ancho: rect.width,
        alto: rect.height,
        movibles: [],
        atacables: NINGUNO,
        objetivosHechizo: NINGUNO,
        hoverHex: null,
        hoverStack: null,
        figura: (s) => animador.figura(s),
        efectos: animador.efectos(enCurso),
      });
    } else {
      camara = centrarEn(camara, centroDeLaEscena(vista), {
        ancho: rect.width,
        alto: rect.height,
        mapaAncho: escena.map.width,
        mapaAlto: escena.map.height,
      });
      // Un espectador lo ve TODO: eso es lo que es. Por eso #64 no aplica aquí.
      drawMapa(ctx, {
        escena,
        camara,
        ancho: rect.width,
        alto: rect.height,
        explorado: null,
        visibles: null,
        ruta: [],
        seleccionado: null,
        hover: null,
        semilla: 0,
        tiempo: ahora,
        version: fotogramasDelCable,
      });
    }
  }

  if (panelesPendientes) {
    panelesPendientes = false;
    pintarPaneles();
  }
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
  pintar(elSide, vista === null ? NADA : panelDelEspectador(vista, finDe));
}

// --------------------------------------------------------------- el cable

/** Pone en pantalla un fotograma del cable, cuando el telón lo suelta. */
function aplicar(snapshot: SpectatorSnapshotMsg): void {
  if (snapshot.view.battle !== null && (vista === null || vista.battle === null)) {
    numeroDeBatalla++;
  }
  vista = snapshot.view;
  escena = adaptarEscena(vista);
  batalla = vista.battle === null ? null : adaptarBatalla(vista.battle);
  fotogramasDelCable++;
  dia = snapshot.day;
  turnoDe = snapshot.current;
  finDe = snapshot.finished;
  panelesPendientes = true;
}

/**
 * Se conecta y se queda escuchando.
 *
 * Criterio 10: **sin servidor levantado se DICE**, con el motivo y cómo salir,
 * en vez de dejar la página en blanco. Y si se cae en marcha, también: lo que se
 * pinta se queda —el último fotograma sigue ahí— y la barra explica que ya no
 * llegan más.
 *
 * No reconecta solo, y es a propósito: un reintento silencioso en bucle deja a
 * quien mira sin saber si la partida sigue viva. Recargar la página es explícito
 * y es lo que dice la barra. (Reconectar solo está en el backlog del plan.)
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

  const socket = new WebSocket(url);

  socket.addEventListener('open', () => {
    // Conectado NO es lo mismo que hay partida. `broadcast()` sale antes si el
    // director todavía no existe, y no existe hasta que pasan la espera del
    // agente (120 s por defecto) y la del plan de mapa. En ese hueco decir
    // «Mirando la partida» sobre una pantalla negra es afirmar que todo va bien
    // cuando no hay nada que ver: quien abre `pnpm mirar` siguiendo el README
    // cae justo ahí. Lo que se dice es lo que está pasando, y se cambia cuando
    // llega el primer fotograma.
    elStatus.textContent =
      `Conectado a ${url}. Esperando a que empiece la partida: el servidor no ` +
      'retransmite hasta que el agente se conecta y le da su plan de mapa.';
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
    if (vista === null) elStatus.textContent = `Mirando la partida en ${url}.`;
    telon.llega(msg as SpectatorSnapshotMsg);
    pedirFotograma();
  });

  socket.addEventListener('error', () => {
    // El evento de error de un WebSocket no lleva motivo por diseño del
    // navegador, así que se dice lo que sí se sabe: dónde se intentó y qué falta.
    elStatus.textContent =
      `No hay nadie en ${url}. Arranca la partida con \`pnpm partida\` en otra ` +
      'terminal y recarga esta página.';
  });

  let huboConexion = false;
  socket.addEventListener('open', () => {
    huboConexion = true;
  });

  socket.addEventListener('close', () => {
    // Tres finales distintos, y los tres se dicen. El de en medio faltaba: la
    // conexión SÍ se abrió —así que el `error` no dice nada— pero no llegó a
    // haber partida, y quedaba «Conectado, esperando…» ante un servidor muerto.
    if (vista !== null) {
      elStatus.textContent =
        `Se ha cortado la conexión con ${url}: lo que se ve es el último fotograma ` +
        'que llegó. Recarga la página para volver a intentarlo.';
    } else if (huboConexion) {
      elStatus.textContent =
        `El servidor de ${url} se ha ido antes de empezar la partida. Arráncalo otra ` +
        'vez con `pnpm partida` y recarga esta página.';
    }
    // Si nunca llegó a abrirse, el motivo lo dijo ya el `error`.
  });
}

// El arte entra cuando entra, igual que en el cliente que juega: sin PNGs cada
// renderizador pinta su marcador de color y se mira igual.
cargarArte(() => {
  panelesPendientes = true;
  pedirFotograma();
});
conectar();
pedirFotograma();
