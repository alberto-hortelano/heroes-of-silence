/**
 * El espectador: mira la partida del servidor y no juega.
 *
 * **No manda ni un intent, no aplica ni una regla y no importa `session.ts`**
 * (criterio 7). Solo abre el WebSocket, lee snapshots y pinta. Que no aplique
 * reglas lo vigila además `invariantes.test.ts`, que corre sobre `src/client`
 * entero: esta carpeta cae dentro y por eso vive aquí y no en otra parte.
 *
 * Reutiliza sin copiar los lienzos de `render/` y la crónica de `views/panels`.
 * Lo único duplicado es el bucle de dibujo, y es más corto que el del cliente que
 * juega porque aquí no hay ratón, ni animador, ni sesión: llega un fotograma, se
 * pinta.
 */
import type { SpectatorSnapshotMsg } from '../../server/protocol.js';
import type { SpectatorView } from '../../server/vista-espectador.js';
import { NADA, pintar } from '../html.js';
import { type AdventureCamera, cameraFor, drawAdventure } from '../render/adventure.js';
import { assetCount, loadAssets, onAssetsChanged } from '../render/assets.js';
import { battleOffset, drawBattle } from '../render/battle.js';
import { adaptarEscena, centroDeLaEscena } from './adaptar.js';
import { type FinDePartida, NADIE, panelDelEspectador } from './paneles.js';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (ctx === null) throw new Error('este navegador no tiene canvas 2D');

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
 * Lo inyecta `vite.config.ts` desde `puertos.ts`, que es la única fuente — el
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
let dia = 0;
let turnoDe = 0;
let finDe: FinDePartida | null = null;
let camara: AdventureCamera = { origin: { x: 0, y: 0 }, cols: 0, rows: 0, offsetX: 0, offsetY: 0 };
let repintar = true;
/** A dónde se conectó, para poder repetirlo en la barra. Vacío hasta conectar. */
let urlDelCanal = '';

function ajustarLienzo(): { width: number; height: number } {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    repintar = true;
  }
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: rect.width, height: rect.height };
}

/** Sin objetivos ni hexes movibles: el espectador no mueve nada. */
const NINGUNO: ReadonlySet<string> = new Set();

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
 *  - el bucle se re-arma en un `finally`, **pase lo que pase**: la página sigue
 *    viva y el siguiente fotograma bueno se pinta;
 *  - el fallo **se dice**, con su motivo, en la barra. El `catch` no está vacío
 *    ni se traga nada.
 *
 * Y no repinta en bucle: `repintar` ya está en `false` cuando salta, así que no
 * se vuelve a intentar hasta que llegue otro fotograma del servidor.
 */
function dibujar(): void {
  try {
    if (repintar) {
      repintar = false;
      pintarTodo();
      if (fallandoAlPintar) {
        fallandoAlPintar = false;
        elStatus.textContent = `Mirando la partida en ${urlDelCanal}.`;
      }
    }
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    console.error('[espectador] fallo al pintar', err);
    if (!fallandoAlPintar) {
      fallandoAlPintar = true;
      elStatus.textContent =
        `No se ha podido pintar este fotograma: ${motivo}. ` +
        'Se sigue escuchando; el siguiente que llegue vuelve a intentarlo.';
    }
  } finally {
    requestAnimationFrame(dibujar);
  }
}

function pintarTodo(): void {
  const rect = ajustarLienzo();
  ctx!.clearRect(0, 0, rect.width, rect.height);

  if (vista !== null) {
    if (vista.battle !== null) {
      // Mientras hay batalla se enseña el tablero: es lo que este ciclo existe
      // para que se vea, y son la mayoría de las decisiones que toma el agente.
      drawBattle(ctx!, {
        battle: vista.battle.estado,
        movable: [],
        hoverHex: null,
        hoverStack: null,
        castTargets: NINGUNO,
        offset: battleOffset(rect.width, rect.height),
      });
    } else {
      const escena = adaptarEscena(vista);
      camara = cameraFor(escena, centroDeLaEscena(vista), rect.width, rect.height);
      drawAdventure(ctx!, {
        state: escena,
        camera: camara,
        viewer: NADIE,
        selectedHero: null,
        hoverPath: [],
        // Un espectador lo ve TODO: eso es lo que es. Por eso #64 no aplica aquí.
        revealAll: true,
      });
    }
  }

  pintarPaneles();
}

function pintarPaneles(): void {
  const semana = Math.floor((dia - 1) / 7) + 1;
  const diaDeLaSemana = ((dia - 1) % 7) + 1;
  elDay.textContent = dia === 0 ? '—' : `Día ${diaDeLaSemana} · Semana ${semana}`;
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
    const snapshot = msg as SpectatorSnapshotMsg;
    if (vista === null) elStatus.textContent = `Mirando la partida en ${url}.`;
    vista = snapshot.view;
    dia = snapshot.day;
    turnoDe = snapshot.current;
    finDe = snapshot.finished;
    repintar = true;
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
void loadAssets().then((hay) => {
  if (hay) console.log(`[assets] ${assetCount()} imágenes generadas cargadas`);
  else console.log('[assets] sin arte generado todavía; se mira con marcadores');
  repintar = true;
});
onAssetsChanged(() => {
  repintar = true;
});

window.addEventListener('resize', () => {
  repintar = true;
});
new ResizeObserver(() => {
  repintar = true;
}).observe(canvas);

ajustarLienzo();
conectar();
requestAnimationFrame(dibujar);
