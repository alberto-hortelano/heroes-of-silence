/**
 * Servidor de la partida.
 *
 * Abre dos canales: uno para el agente (por donde entra el puente MCP) y otro
 * para quien quiera mirar la partida desde el navegador. La partida avanza
 * sola; si el agente no está conectado cuando le toca, se le espera un rato y,
 * si no aparece, juega la IA de reglas.
 */

import { once } from 'node:events';
import { creature } from '@core/data.js';
import { parseSeed } from '@core/rng.js';
import { sinSello } from '@core/state/events.js';
import { type WebSocket, WebSocketServer } from 'ws';
import { AgentLink } from './agent-link.js';
import { responderConsulta } from './consultas.js';
import { Director } from './director.js';
import { pedirMapaAlAgente } from './mapa-del-agente.js';
import { notaFinDePartida, SIN_PARTIDA_TODAVIA } from './notas.js';
import type { ServerToSpectatorMsg } from './protocol.js';
import { puertoAgente, puertoEspectadores } from './puertos.js';

/** La partida que se juega si nadie pide otra. */
const SEED_POR_DEFECTO = 20260823;
// La misma regla que `?seed=` en el navegador, y por eso vive en `core`: esto
// aceptaba `HEROES_SEED=abc` y abría la partida `NaN >>> 0` sin decir nada.
// Sin variable o con la variable vacía no hay nada que rechazar: se juega la de
// por defecto, igual que el navegador sortea. `HEROES_SEED=abc` sigue matando
// el arranque, que es lo que se pidió y no se puede dar.
const SEED = parseSeed(process.env.HEROES_SEED) ?? SEED_POR_DEFECTO;
const MAX_DAYS = Number(process.env.HEROES_MAX_DAYS ?? 200);
/** Cuánto se espera a que el agente se conecte antes de tirar de heurística. */
const WAIT_FOR_AGENT_MS = Number(process.env.HEROES_WAIT_AGENT_MS ?? 120_000);
/**
 * El mapa que se le pide al agente, y el que sale del procedimental si no lo da.
 *
 * Son los valores por defecto de `generateMapPlan`, escritos aquí porque ahora
 * hay que decírselos a alguien: el agente no puede adivinar de qué tamaño lo
 * quieres. Si dejan de coincidir, la partida sin agente y la partida con agente
 * dejan de jugarse en mapas comparables.
 */
const ANCHO_DEL_MAPA = 24;
const ALTO_DEL_MAPA = 24;
/** Los jugadores de la partida, en el orden en que los numera `newGame`. */
const JUGADORES = [0, 1] as const;

const link = new AgentLink();

/**
 * La partida, que ya no existe desde el instante en que se importa el módulo.
 *
 * Antes se construía aquí mismo —`new Director(...)` en una constante—, y con
 * ella el mapa: el `Director` llama a `newGame` dentro de su constructor. Eso
 * dejaba el mapa hecho **antes** de que hubiera nadie a quien pedírselo, que es
 * lo que impedía enchufar `map_generate` (#27). Ahora nace en `main()`, y
 * mientras tanto esto es `null` a la vista de todos en vez de un objeto a medio
 * construir.
 */
let director: Director | null = null;

// ---------------------------------------------------------------- consultas

// El director entero y no `director.state`: una consulta necesita saber qué
// jugadores lleva el agente para no contestar por el rival, y eso ya lo sabe él.
//
// Y se registra ANTES de abrir el puerto del agente, porque desde que la
// partida arranca en asíncrono hay una ventana en la que el agente ya está
// atado y todavía no hay `GameState`. Lo que se le dice en esa ventana es que
// falta su plan de mapa: el canal lleva la frase tal cual por `query_result`
// con `ok:false`.
link.onQuery((what, args) => {
  if (director === null) throw new Error(SIN_PARTIDA_TODAVIA);
  return responderConsulta(director, what, args);
});

/** El puerto que le tocó de verdad. `address()` es un string solo en sockets Unix. */
function puertoReal(server: WebSocketServer): number {
  const dir = server.address();
  if (dir === null || typeof dir === 'string') {
    throw new Error(`el servidor no escucha en un puerto TCP: ${String(dir)}`);
  }
  return dir.port;
}

// ---------------------------------------------------------------- mirones

const spectators = new Set<WebSocket>();

function broadcast(): void {
  if (spectators.size === 0) return;
  // Sin partida no hay nada que retransmitir, y esto es alcanzable de verdad:
  // un espectador puede conectarse mientras se espera el mapa del agente.
  if (director === null) return;
  const state = director.state;
  const msg: ServerToSpectatorMsg = {
    type: 'snapshot',
    day: state.day,
    current: state.current,
    finished: state.finished,
    view: {
      // El espectador lo ve TODO, y es aposta: mira la partida desde fuera, no
      // la juega. Esta forma se parecía a la de la consulta `map`, que desde
      // #74 pasa por la niebla (`serializeKnownMap`, `core/contract/serialize`)
      // y ya no es la misma cosa: si alguien viene a unificarlas, lo que se
      // junta son dos reglas distintas bajo un solo nombre.
      map: {
        width: state.map.width,
        height: state.map.height,
        terrain: state.map.terrain,
        roads: [...state.map.roads],
        objects: state.map.objects,
      },
      players: state.players.map((p) => ({
        id: p.id,
        faction: p.faction,
        resources: p.resources,
        defeated: p.defeated,
        fog: [...p.fog],
      })),
      heroes: state.heroes.map((h) => ({
        id: h.id,
        owner: h.owner,
        name: h.name,
        at: h.at,
        movePoints: h.movePoints,
        army: h.army,
      })),
      towns: state.towns.map((t) => ({
        id: t.id,
        owner: t.owner,
        name: t.name,
        at: t.at,
        buildings: t.buildings,
        garrison: t.garrison,
      })),
      // Sin el sello: el espectador ve la partida entera —eso es lo que es—
      // pero quién MÁS estaba mirando cada casilla es contabilidad de casa, y
      // salía entera por aquí mientras el mensaje del agente la borraba a
      // propósito dos ficheros más allá.
      log: state.log.slice(-40).map(sinSello),
      directorLog: director.log.slice(-20),
    },
  };
  const raw = JSON.stringify(msg);
  for (const s of spectators) {
    if (s.readyState === s.OPEN) s.send(raw);
  }
}

// ---------------------------------------------------------------- partida

/**
 * Que ya se gastó el plazo de espera, aunque no viniera nadie.
 *
 * `link.haVenidoAlgunAgente` cubre «vino y se fue» y **no** cubre «no vino
 * nunca», que es exactamente el caso que se estrena al mover la espera delante
 * del arranque: sin este banderín, un `pnpm partida` sin agente esperaba los dos
 * minutos para pedir el mapa y **otros dos** antes del primer turno del jugador
 * 1. Se espera una vez, venga o no venga.
 */
let yaSeEspero = false;

/**
 * Espera al agente, y **solo la primera vez**.
 *
 * La espera la lleva `AgentLink`, que es quien se entera de las conexiones: aquí
 * era un sondeo cada 500 ms que además volvía a esperar los dos minutos enteros
 * antes de CADA turno en cuanto el puente se caía, y eso convierte una partida
 * de 200 días en horas de nada.
 *
 * Desde #27 la primera llamada es la del arranque —hay que dejarle conectarse
 * para poder pedirle el mapa—, y las de cada turno suyo caen ya en las guardas.
 */
async function esperarAgente(): Promise<void> {
  if (link.connected) return;
  // Si el puente estuvo y se cayó, no se espera: se juega con la heurística y
  // se sigue. La primera vez sí, porque es la que da tiempo a conectarlo.
  if (link.haVenidoAlgunAgente || yaSeEspero) return;
  yaSeEspero = true;
  console.log(
    `[servidor] esperando al agente hasta ${Math.round(WAIT_FOR_AGENT_MS / 1000)} s…\n` +
      '           conéctalo abriendo Claude Code en otra terminal de este proyecto\n' +
      '           y pidiéndole que juegue con las tools heroes_listen / heroes_respond.',
  );
  if (!(await link.esperaPrimerAgente(WAIT_FOR_AGENT_MS))) {
    console.log('[servidor] no ha venido nadie; juega la IA de reglas.');
  }
}

async function jugar(director: Director): Promise<void> {
  while (!director.finished && director.state.day <= MAX_DAYS) {
    if (director.agentPlayers.has(director.state.current)) await esperarAgente();

    const informe = await director.playTurn();
    console.log(
      `[servidor] día ${director.state.day} · jugador ${informe.player} · ` +
        `${informe.by === 'agent' ? 'agente' : 'reglas'} · ${informe.actions} acciones` +
        (informe.problems.length > 0 ? ` · ${informe.problems.length} rechazadas` : ''),
    );
    broadcast();
  }

  const state = director.state;

  // Al agente hay que DECÍRSELO. Este proceso no se muere al acabar la partida
  // —los dos WebSocketServer siguen escuchando—, así que sin este aviso el que
  // esperaba en `heroes_listen` no se entera ni por el cierre del socket: se
  // queda bloqueado hasta que su cliente MCP se rinde por timeout. El canal se
  // deja abierto a propósito: `game_state` sigue valiendo para mirar el final.
  const nota = notaFinDePartida(state, director.agentPlayers);
  link.gameOver(state.finished?.winner ?? null, nota);

  // La misma frase para el terminal: estaba escrita dos veces, doce líneas
  // aparte, y la de aquí decía menos.
  console.log('\n──────── fin de la partida ────────');
  console.log(nota);
  for (const p of state.players) {
    const heroes = state.heroes.filter((h) => h.owner === p.id);
    const pueblos = state.towns.filter((t) => t.owner === p.id);
    const tropas = heroes
      .flatMap((h) => h.army.filter((s) => s !== null))
      .map((s) => `${s!.count}×${creature(s!.creature).name}`)
      .join(', ');
    console.log(
      `  jugador ${p.id} (${p.faction}): ${pueblos.length} castillos, ${heroes.length} héroes` +
        (tropas === '' ? '' : ` — ${tropas}`),
    );
  }
  console.log(`  minas en juego: ${state.map.objects.filter((o) => o.kind === 'mine').length}`);
  console.log(`  casillas exploradas por el agente: ${state.players[1]?.fog.size ?? 0}`);
  broadcast();
}

/**
 * El arranque, ahora en asíncrono y en un orden que importa.
 *
 * Los dos canales se abren ANTES de construir la partida: el del agente porque
 * hay que dejarle conectarse para poder pedirle nada, y el de los espectadores
 * porque un mirón que llega temprano no tiene por qué esperar a que empiece.
 */
async function main(): Promise<void> {
  const agentServer = new WebSocketServer({ port: puertoAgente() });
  agentServer.on('connection', (socket) => {
    console.log('[servidor] el puente del agente se ha conectado');
    link.attach(socket);
  });
  // El puerto REAL y no el pedido, y por eso desde `listening` y no antes: con
  // `HEROES_AGENT_PORT=0` lo elige el sistema, así que imprimir lo que se pidió
  // sería imprimir un cero. De esta línea saca el arnés a dónde conectar el
  // puente, y de paso ya no se anuncia un canal que todavía no está escuchando.
  agentServer.on('listening', () => {
    console.log(`[servidor] canal del agente en ws://localhost:${puertoReal(agentServer)}`);
  });

  const spectatorServer = new WebSocketServer({ port: puertoEspectadores() });
  spectatorServer.on('connection', (socket) => {
    spectators.add(socket);
    socket.on('close', () => spectators.delete(socket));
    broadcast();
  });
  spectatorServer.on('listening', () => {
    console.log(
      `[servidor] canal de espectadores en ws://localhost:${puertoReal(spectatorServer)}`,
    );
  });

  // Los dos canales, ESCUCHANDO, antes de invitar a nadie a conectarse. Sin
  // esto la invitación de `esperarAgente()` —que escribe síncrona— salía por
  // delante de las dos líneas de `listening`, así que se decía «conéctalo» antes
  // de decir a dónde; y con `HEROES_AGENT_PORT=0` el puerto ni siquiera existía
  // todavía. El cómo iba antes que el dónde.
  await Promise.all([once(agentServer, 'listening'), once(spectatorServer, 'listening')]);

  // Se le espera ANTES de pedirle nada: es la misma espera de siempre, con el
  // mismo `HEROES_WAIT_AGENT_MS` y la misma traza, solo que ahora la primera
  // ocasión de gastarla es el mapa y no el primer turno.
  await esperarAgente();

  // Y si hay alguien atado, se dice que ahora se le espera a ÉL. Este hueco no
  // existía antes del arranque asíncrono: con el agente conectado y mudo, la
  // consola se quedaba muda hasta cinco minutos después de haber escrito
  // «esperando al agente hasta 120 s», que ya no describía lo que pasaba. La
  // señal de que algo va mal no puede ser una ausencia de líneas.
  if (link.connected) {
    console.log(
      `[servidor] esperando el plan de mapa del agente (hasta ${Math.round(link.plazoMs / 1000)} s)…`,
    );
  }

  const { plan, motivo } = await pedirMapaAlAgente(link, {
    width: ANCHO_DEL_MAPA,
    height: ALTO_DEL_MAPA,
    players: JUGADORES,
  });

  if (plan === null) {
    console.log(`[servidor] mapa procedimental de la semilla ${SEED} (${motivo})`);
  } else {
    // Se dice, en vez de romperlo en silencio: `CLAUDE.md` promete que una
    // partida se reproduce copiando su semilla, y con el mapa del agente eso
    // deja de ser cierto —ni el mapa ni el ejército de salida salen de ella,
    // porque `newGame` ya no llama a `generateMapPlan` y la corriente del `rng`
    // se desplaza—. La semilla sigue fijando las tiradas de dentro.
    console.log(
      `[servidor] mapa diseñado por el agente (${motivo}). La semilla ${SEED} ya NO ` +
        'reproduce esta partida: el mapa lo puso él.',
    );
  }

  director = new Director(link, {
    seed: SEED,
    agentPlayers: [1],
    ...(plan === null ? {} : { plan }),
  });
  await jugar(director);
}

main().catch((err) => {
  console.error('[servidor] la partida ha reventado:', err);
  // También cuando revienta: un agente bloqueado sin motivo es peor que uno que
  // sabe que hubo un fallo y puede contarlo.
  link.gameOver(
    null,
    `La partida se ha interrumpido por un fallo del servidor: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exitCode = 1;
});
