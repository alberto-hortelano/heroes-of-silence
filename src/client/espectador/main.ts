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
import type { Side } from '@core/battle/types.js';
import { creature } from '@core/data.js';
import type { SpectatorSnapshotMsg } from '../../server/protocol.js';
import type { SpectatorView } from '../../server/vista-espectador.js';
import { fondoDeColor, type Html, html, NADA, pintar, unir } from '../html.js';
import { type AdventureCamera, cameraFor, drawAdventure } from '../render/adventure.js';
import { assetCount, loadAssets, onAssetsChanged } from '../render/assets.js';
import { battleOffset, drawBattle } from '../render/battle.js';
import { playerColor } from '../render/palette.js';
import { renderLog } from '../views/panels.js';
import { adaptarEscena, centroDeLaEscena } from './adaptar.js';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (ctx === null) throw new Error('este navegador no tiene canvas 2D');

const elDay = document.getElementById('day') as HTMLElement;
const elTurn = document.getElementById('turn') as HTMLElement;
const elSide = document.getElementById('side') as HTMLElement;
const elStatus = document.getElementById('status') as HTMLElement;
const elSeed = document.getElementById('seed') as HTMLElement;

/**
 * Quien mira no es ningún jugador, así que no tiene un «tú».
 *
 * `renderLog` escribe «Tú» para los hechos de `viewer`; con un id que no es de
 * nadie la crónica entera se lee en tercera persona —«El jugador 0 construye…»—,
 * que es lo correcto para quien ve la partida desde fuera.
 */
const NADIE = -1;

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
let finDe: { winner: number } | null = null;
let camara: AdventureCamera = { origin: { x: 0, y: 0 }, cols: 0, rows: 0, offsetX: 0, offsetY: 0 };
let repintar = true;

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

function dibujar(): void {
  if (!repintar) {
    requestAnimationFrame(dibujar);
    return;
  }
  repintar = false;

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
  requestAnimationFrame(dibujar);
}

function pintarPaneles(): void {
  const semana = Math.floor((dia - 1) / 7) + 1;
  const diaDeLaSemana = ((dia - 1) % 7) + 1;
  elDay.textContent = dia === 0 ? '—' : `Día ${diaDeLaSemana} · Semana ${semana}`;
  elTurn.textContent =
    finDe !== null
      ? `Gana el jugador ${finDe.winner}`
      : dia === 0
        ? ''
        : `Juega el jugador ${turnoDe}`;
  pintar(elSide, vista === null ? NADA : panelLateral(vista));
}

function panelLateral(v: SpectatorView): Html {
  return html`${fin()}${jugadores(v)}${batalla(v)}${crónica(v)}${vozDelDirector(v)}`;
}

/**
 * Criterio 9: se ve terminar la partida y quién ganó.
 *
 * Es lo mismo que `game_over` le dice al agente en vez de dejarlo colgado; aquí
 * es una línea arriba del todo, no un `alert` ni un silencio.
 */
function fin(): Html {
  if (finDe === null) return NADA;
  return html`<h2>Fin de la partida</h2>
    <p class="cost">Gana el jugador ${finDe.winner}.</p>`;
}

function jugadores(v: SpectatorView): Html {
  return html`<h3>Jugadores</h3>
    <div class="stack-list">${unir(
      v.players.map((p) => {
        const castillos = v.towns.filter((t) => t.owner === p.id).length;
        const heroes = v.heroes.filter((h) => h.owner === p.id).length;
        const estado = p.defeated ? 'derrotado' : `${castillos} cast · ${heroes} hér`;
        return html`<div class="stack">
          <span>${bandera(p.id)} jugador ${p.id} · ${p.faction}</span>
          <span class="count">${estado}</span>
        </div>
        <div class="row"><span class="label">oro</span><span>${p.resources.gold}</span></div>
        <div class="row"><span class="label">explorado</span><span>${p.fog.length} casillas</span></div>
        ${unir(
          v.heroes
            .filter((h) => h.owner === p.id)
            // El nombre del héroe SÍ se pinta, y es el criterio 8 («los héroes»)
            // pero también la fuga que señaló la crítica: `hireHero` lo deriva del
            // pueblo (`Capitán de ${town.name}`), o sea que un nombre de pueblo
            // que escriba el agente acaba aquí. Sale por la puerta como todo.
            .map(
              (h) => html`<div class="stack empty">
                <span>${h.name}</span><span class="count">${h.movePoints}</span>
              </div>`,
            ),
        )}`;
      }),
    )}</div>`;
}

/** El cuadradito de color del jugador, igual que el que pinta el mapa. */
function bandera(id: number): Html {
  return html`<span class="swatch"${fondoDelJugador(id)}></span>`;
}

/**
 * `playerColor` da un `#rrggbb`; `fondoDeColor` lo valida y escribe el atributo
 * entero. Un hueco dentro de `style="…"` lo rechaza la puerta —escapar comillas
 * no para una declaración de estilo de más—, y este es el camino que sí pasa.
 */
function fondoDelJugador(id: number): Html {
  return fondoDeColor(playerColor(id));
}

function batalla(v: SpectatorView): Html {
  if (v.battle === null) return NADA;
  const { estado, dueños } = v.battle;
  const deQuien = (side: Side): Html => {
    const id = dueños[side];
    return id === null ? html`neutral` : html`${bandera(id)} jugador ${id}`;
  };
  return html`<h3>Batalla · ronda ${estado.round}</h3>
    <div class="row"><span class="label">atacante</span><span>${deQuien('attacker')}</span></div>
    <div class="row"><span class="label">defensor</span><span>${deQuien('defender')}</span></div>
    <div class="stack-list">${unir(
      estado.stacks
        .filter((s) => s.count > 0)
        .map(
          (s) => html`<div class="stack${s.id === estado.activeId ? '' : ' empty'}">
            <span>${bandera(dueños[s.side] ?? -1)} ${creature(s.creature).name}</span>
            <span class="count">${s.count}</span>
          </div>`,
        ),
    )}</div>`;
}

function crónica(v: SpectatorView): Html {
  return html`<h3>Crónica</h3>${renderLog(v.log, NADIE)}`;
}

/**
 * Lo que va diciendo el director, **y ahí dentro va el `reasoning` del agente**.
 *
 * Es el texto ajeno más ancho que hay en el cable —2000 caracteres de prosa libre
 * de un modelo, `z.string().max(2000)`— y hasta ahora no lo pintaba nadie. Por
 * eso este ciclo empieza por la puerta de escapar y no por esta página: aquí sale
 * por `html`, como todo lo demás.
 */
function vozDelDirector(v: SpectatorView): Html {
  if (v.directorLog.length === 0) return NADA;
  return html`<h3>El director</h3>
    <div class="log">${unir(v.directorLog.map((linea) => html`<div>${linea}</div>`))}</div>`;
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
  // El puerto se escribe ANTES de conectar, no después: si el servidor está en
  // otro, el desajuste se LEE en vez de quedarse en un «conectando…» inerte.
  elSeed.textContent = url;
  elStatus.textContent = `Conectando con ${url}…`;

  const socket = new WebSocket(url);

  socket.addEventListener('open', () => {
    elStatus.textContent = `Mirando la partida en ${url}.`;
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

  socket.addEventListener('close', () => {
    // Si nunca llegó un snapshot, el motivo es que no había servidor y ya lo
    // dijo el `error`. Si llegó alguno, la partida estaba en marcha y se cortó.
    if (vista !== null) {
      elStatus.textContent =
        `Se ha cortado la conexión con ${url}: lo que se ve es el último fotograma ` +
        'que llegó. Recarga la página para volver a intentarlo.';
    }
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
