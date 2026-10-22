/**
 * La partida del servidor: los dos canales, el mapa, el director y el bucle.
 *
 * Vivía entero en `ws-server.ts`, que lo arranca al importarse y por eso no se
 * le podía preparar nada: para que `pnpm qa` cruzara el ascenso de la tropa a
 * héroe hacía falta una partida con un veterano de rango 5 en la base, y la del
 * arnés lo produce en 0,06 de cada partida. Ahora el cuerpo es una función y
 * `ws-server.ts` la llama con nada; `tools/qa/partida-con-veterano.ts` la llama
 * con un `preparar`. **Ninguna variable de entorno ni ningún mensaje lo abre**:
 * solo un `import`, y lo que importa desde `tools/` no se despliega.
 */

import { once } from 'node:events';
import { troopSummary } from '@core/hero/troop.js';
import { LADO_DEL_MAPA } from '@core/map/generate.js';
import { parseSeed } from '@core/rng.js';
import type { PlayerId } from '@core/types.js';
import { type WebSocket, WebSocketServer } from 'ws';
import { AgentLink } from './agent-link.js';
import { responderConsulta } from './consultas.js';
import { Director, type DirectorOptions } from './director.js';
import {
  combateDelEntorno,
  esperaAlAgente,
  maxDiasDelEntorno,
  puertoAgente,
  puertoEspectadores,
} from './entorno.js';
import { pedirMapaAlAgente } from './mapa-del-agente.js';
import { notaFinDePartida, SIN_PARTIDA_TODAVIA } from './notas.js';
import type { ServerToSpectatorMsg } from './protocol.js';
import { construirVista } from './vista-espectador.js';

/** La partida que se juega si nadie pide otra. */
const SEED_POR_DEFECTO = 20260823;
// La misma regla que `?seed=` en el navegador, y por eso vive en `core`: esto
// aceptaba `HEROES_SEED=abc` y abría la partida `NaN >>> 0` sin decir nada.
// Sin variable o con la variable vacía no hay nada que rechazar: se juega la de
// por defecto, igual que el navegador sortea. `HEROES_SEED=abc` sigue matando
// el arranque, que es lo que se pidió y no se puede dar.
const SEED = parseSeed(process.env.HEROES_SEED) ?? SEED_POR_DEFECTO;

// Los cuatro valores que este servidor lee del entorno salen de `entorno.ts`,
// que es donde vive el único parser y donde hay un test que lo ejerce: aquí se
// prueba poco, porque arrancar la partida abre dos puertos. Se leen al importar
// y no al arrancar, como cuando esto era `ws-server.ts`: una variable mala sigue
// matando el proceso antes de abrir nada.
const MAX_DAYS = maxDiasDelEntorno();
const COMBATE = combateDelEntorno();
const WAIT_FOR_AGENT_MS = esperaAlAgente();
/**
 * El mapa que se le pide al agente, y el que sale del procedimental si no lo da.
 *
 * Es el lado por defecto de `generateMapPlan`, que sale de las regiones por
 * bando (`REGIONES_POR_BANDO`, #195), **leído y no copiado**: estuvo
 * escrito aquí a mano como `24` y, al cambiar el generador de tamaño, la
 * partida con agente y la que sale sin él habrían dejado de jugarse en mapas
 * comparables sin que nada se pusiera rojo.
 */
const ANCHO_DEL_MAPA = LADO_DEL_MAPA;
const ALTO_DEL_MAPA = LADO_DEL_MAPA;
/** Los jugadores de la partida, en el orden en que los numera `newGame`. */
const JUGADORES = [0, 1] as const;

/** Lo que un arnés puede pedirle a la partida: hoy, solo `preparar`. */
export type OpcionesDePartida = Pick<DirectorOptions, 'preparar'>;

/**
 * Arranca la partida y la juega hasta el final. No lanza: un fallo se cuenta en
 * consola, se le dice al agente con un `game_over` sin ganador y deja el código
 * de salida a 1, como hacía el `main()` de siempre.
 */
export function arrancarPartida(opciones: OpcionesDePartida = {}): Promise<void> {
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

  /** Quien mira no lleva a nadie, y las frases que le llegan tienen que saberlo. */
  const SIN_BANDO: ReadonlySet<PlayerId> = new Set();

  function broadcast(): void {
    if (spectators.size === 0) return;
    // Sin partida no hay nada que retransmitir, y esto es alcanzable de verdad:
    // un espectador puede conectarse mientras se espera el mapa del agente.
    if (director === null) return;
    const state = director.state;
    const msg: ServerToSpectatorMsg = {
      type: 'snapshot',
      partida: link.partida,
      day: state.day,
      current: state.current,
      // El mismo hecho que se le manda al agente, y por el mismo motivo: quien
      // mira tiene que enterarse de que se acabó, gane alguien o no gane nadie.
      //
      // Pero **sin `agentPlayers`**, y esa es la diferencia: la nota se redacta
      // para quien la lee, y aquí la lee alguien que no lleva bando. Con el
      // conjunto del agente se le decía «no gana nadie. Tú llevabas al jugador 1
      // (los nigromantes) y acabas con 1 castillo» a un espectador que no llevaba
      // nada — la segunda persona de otro. `notaFinDePartida` ya sabe callar el
      // veredicto y la cola con el conjunto vacío, así que no hace falta una
      // segunda redacción: hace falta pasarle quién pregunta.
      finished:
        state.finished === null
          ? null
          : { winner: state.finished.winner, note: notaFinDePartida(state, SIN_BANDO) },
      // La vista se MONTA en `vista-espectador.ts`, que es donde vive su tipo. Se
      // escribía aquí, a mano y dentro de esta función, contra un `view: unknown`.
      view: construirVista(state, director.log),
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
    // La única salida es que la partida haya terminado: el `día <= MAX_DAYS` que
    // había aquí era otra declaración de la misma regla (`GameState.finished`).
    while (director.desenlace === null) {
      if (director.agentPlayers.has(director.state.current)) await esperarAgente();

      // El día se anota antes: el turno que cierra el día lo pasa, y en
      // serpiente (`ordenDelDia`) el siguiente es a menudo del mismo jugador;
      // con el de después, sus dos turnos salían con el mismo día.
      const dia = director.state.day;
      const informe = await director.playTurn();
      console.log(
        `[servidor] día ${dia} · jugador ${informe.player} · ` +
          `${informe.by === 'agent' ? 'agente' : 'reglas'} · ${informe.actions} acciones` +
          (informe.problems.length > 0 ? ` · ${informe.problems.length} rechazadas` : ''),
      );
      broadcast();
    }

    const state = director.state;
    // Sin `?? null` y sin guarda: la condición del bucle es que esto sea `null`,
    // así que aquí `tsc` ya sabe que no lo es.
    const fin = director.desenlace;

    // Al agente hay que DECÍRSELO. Este proceso no se muere al acabar la partida
    // —los dos WebSocketServer siguen escuchando—, así que sin este aviso el que
    // esperaba en `heroes_listen` no se entera ni por el cierre del socket: se
    // queda bloqueado hasta que su cliente MCP se rinde por timeout. El canal se
    // deja abierto a propósito: `game_state` sigue valiendo para mirar el final.
    const nota = notaFinDePartida(state, director.agentPlayers);
    link.gameOver(fin.winner, nota);

    // La misma frase para el terminal: estaba escrita dos veces, doce líneas
    // aparte, y la de aquí decía menos.
    console.log('\n──────── fin de la partida ────────');
    console.log(nota);
    for (const p of state.players) {
      const heroes = state.heroes.filter((h) => h.owner === p.id);
      const pueblos = state.towns.filter((t) => t.owner === p.id);
      const tropas = heroes
        .flatMap((h) => troopSummary(h.army, state.characters))
        .map((g) => `${g.count}×${g.unit.name}`)
        .join(', ');
      console.log(
        `  jugador ${p.id} (${p.faction}): ${pueblos.length} castillos, ${heroes.length} héroes` +
          (tropas === '' ? '' : ` — ${tropas}`),
      );
    }
    console.log(
      `  pueblos en juego: ${state.map.objects.filter((o) => o.kind === 'village').length}`,
    );
    console.log(`  nodos en juego: ${state.map.objects.filter((o) => o.kind === 'node').length}`);
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
      // Sin `HEROES_MAX_DAYS` esto es `undefined` y manda el tope de `newGame`.
      maxDays: MAX_DAYS,
      // Sin `HEROES_TROPA` ni `HEROES_RUEDA`, la de siempre: 7 / 7.
      combate: COMBATE,
      // Un fotograma por acción aplicada, y no uno por turno: una batalla entera
      // caía antes entre dos snapshots. `broadcast()` sale sola si no mira nadie,
      // así que sin espectadores esto no cuesta nada.
      onFrame: broadcast,
      ...(plan === null ? {} : { plan }),
      ...(opciones.preparar === undefined ? {} : { preparar: opciones.preparar }),
    });
    await jugar(director);
  }

  return main().catch((err) => {
    console.error('[servidor] la partida ha reventado:', err);
    // También cuando revienta: un agente bloqueado sin motivo es peor que uno que
    // sabe que hubo un fallo y puede contarlo.
    link.gameOver(
      null,
      `La partida se ha interrumpido por un fallo del servidor: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  });
}
