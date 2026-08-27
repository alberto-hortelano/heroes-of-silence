/**
 * Puente MCP: por aquí un agente de Claude Code se sienta a jugar.
 *
 * El patrón es el de `narrative-mcp` en ne-fan: `heroes_listen` se queda
 * bloqueado hasta que el juego pide una decisión y devuelve el estado junto
 * con el formato de respuesta; el agente decide y llama a `heroes_respond`
 * exactamente una vez; después vuelve a `heroes_listen`. Y así toda la partida.
 */

import { allSpells } from '@core/battle/spells.js';
import { COMO_SE_LEE_EL_MAPA } from '@core/contract/serialize.js';
import { allCreatures, creature, factionLineup } from '@core/data.js';
import { allBuildings } from '@core/town/buildings.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import WebSocket from 'ws';
import { z } from 'zod';
import {
  CABECERA_VEREDICTOS,
  LA_JUEGA_LA_IA,
  MARCA_FALLO,
  MARCA_OK,
  PREFIJO_CORTE,
  PREFIJO_FIN,
  PREFIJO_RELEVO,
  textoDeEscucha,
} from '../notas.js';
import type { AgentToServerMsg, ServerToAgentMsg } from '../protocol.js';
import { puertoAgente } from '../puertos.js';
import { Buzon } from './buzon.js';
import { ColaDeVeredictos } from './veredictos.js';

const SERVER_URL = process.env.HEROES_SERVER ?? `ws://localhost:${puertoDelServidor()}`;

/**
 * A dónde conectarse cuando nadie ha dicho `HEROES_SERVER`.
 *
 * Sigue a `HEROES_AGENT_PORT` para que cambiar el puerto del servidor no deje
 * al puente llamando al de por defecto. Lo que no puede hacer es adivinar: con
 * `0` el puerto lo elige el sistema al arrancar y desde aquí no hay forma de
 * saber cuál tocó, así que se dice en vez de intentar `ws://localhost:0`.
 */
function puertoDelServidor(): number {
  const p = puertoAgente();
  if (p === 0) {
    throw new Error(
      'HEROES_AGENT_PORT=0 deja que el puerto lo elija el sistema: dile al puente a dónde conectarse con HEROES_SERVER=ws://localhost:<puerto>',
    );
  }
  return p;
}

// ---------------------------------------------------------------- conexión

let socket: WebSocket | null = null;
let conectando: Promise<WebSocket> | null = null;

/**
 * Todo lo que espera al otro lado del socket: la petición que aún no ha
 * recogido `heroes_listen` y las consultas en vuelo. Sabe terminarse.
 */
const buzon = new Buzon();
let contadorConsultas = 0;

function connect(): Promise<WebSocket> {
  if (socket !== null && socket.readyState === WebSocket.OPEN) return Promise.resolve(socket);
  if (conectando !== null) return conectando;

  conectando = new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(SERVER_URL);

    ws.on('open', () => {
      socket = ws;
      conectando = null;
      send({ type: 'hello', client: 'heroes-mcp' });
      resolve(ws);
    });

    ws.on('message', (raw) => {
      let msg: ServerToAgentMsg;
      try {
        msg = JSON.parse(String(raw)) as ServerToAgentMsg;
      } catch {
        return;
      }
      recibir(msg);
    });

    ws.on('close', () => {
      if (socket === ws) socket = null;
      // Antes esto solo ponía la referencia a `null`, y quien esperaba una
      // decisión —o una respuesta a su consulta— se quedaba colgado para
      // siempre. El canal se muere entero: se avisa a todos a la vez.
      buzon.corta(`el servidor de la partida (${SERVER_URL}) ha cerrado el canal`);
    });

    ws.on('error', (err) => {
      conectando = null;
      reject(
        new Error(
          `no se puede hablar con el servidor de la partida en ${SERVER_URL}: ${err.message}. ` +
            '¿Está arrancado con "pnpm partida"?',
        ),
      );
    });
  });

  return conectando;
}

function recibir(msg: ServerToAgentMsg): void {
  switch (msg.type) {
    case 'request':
      buzon.entrega(msg);
      return;

    case 'query_result':
      buzon.resuelveConsulta(msg.queryId, {
        ok: msg.ok,
        ...(msg.data !== undefined ? { data: msg.data } : {}),
        ...(msg.error !== undefined ? { error: msg.error } : {}),
      });
      return;

    case 'game_over':
      // La única señal de que se acabó. El servidor sigue vivo con sus puertos
      // abiertos, así que sin esto no llegaría ni el `close` del socket.
      buzon.fin(msg.note);
      return;

    case 'result':
      // El veredicto sobre una respuesta llega aquí; se le entrega al agente en
      // la siguiente petición, que es cuando puede hacer algo con él. Se guardan
      // TODOS y con su `note`: el que dice que coló también, porque un silencio
      // es ambiguo en un canal que puede perder mensajes.
      veredictos.anota(msg);
      return;
  }
}

const veredictos = new ColaDeVeredictos();

function send(msg: AgentToServerMsg): void {
  if (socket === null || socket.readyState !== WebSocket.OPEN) {
    throw new Error('no hay conexión con el servidor de la partida');
  }
  socket.send(JSON.stringify(msg));
}

async function consultar(what: string, args: Record<string, unknown> = {}): Promise<unknown> {
  await connect();
  contadorConsultas += 1;
  const queryId = `q-${contadorConsultas}`;
  return buzon.consulta(queryId, () =>
    send({ type: 'query', queryId, what: what as 'game_state', args }),
  );
}

// ---------------------------------------------------------------- servidor

const server = new McpServer({ name: 'heroes', version: '0.1.0' });

const LISTEN_DESCRIPTION = `Espera bloqueado hasta que la partida te pida una decisión, y te la entrega.

Es la mitad de un ciclo: llama a heroes_listen para recibir una petición,
decide, llama a heroes_respond UNA sola vez con tu respuesta, y vuelve a
heroes_listen. Repite durante toda la partida.

Cada mensaje que devuelve empieza por un campo "kind" y trae EMBEBIDO el
formato exacto de respuesta para ese kind: léelo ahí, no hace falta que lo
recuerdes entre turnos.

Y trae, cuando lo hay, un bloque "${CABECERA_VEREDICTOS}" con el veredicto de
CADA respuesta tuya que se haya aplicado desde la última vez que escuchaste:
"${MARCA_OK}" es que entró y "${MARCA_FALLO}" que no, con el motivo. Se informa
siempre, también cuando salió bien: no tienes que deducir de un silencio si coló
o si el mensaje se perdió.

Tipos de petición que puedes recibir:
- "adventure_turn" → te toca el turno en el mapa: mueve héroes, construye,
  recluta. Devuelves una lista de acciones.
- "battle_turn"    → una unidad tuya espera órdenes en la batalla. Devuelves
  UNA acción. La petición incluye "legalActions" con todo lo que se puede
  hacer: elegir de ahí nunca falla. Puedes ser el atacante o el DEFENSOR: mira
  "yourSide" en cada petición y no des por hecho que atacas.
- "map_generate"   → diseña un mapa. No dibujas nada: devuelves un plan
  declarativo y el motor lo construye y lo valida.

El ciclo tiene final y te avisa de él: cuando la partida termina recibes un
mensaje que empieza por "${PREFIJO_FIN}" y te dice quién ganó. Ahí se para
el bucle. Y si el canal con la partida se muere, recibes uno que empieza por
"${PREFIJO_CORTE}" con lo que se sabe y lo que puedes intentar. En
ninguno de los dos casos te quedas esperando a ciegas.

Llama de una en una: si dos heroes_listen se solapan, la primera vuelve con
"${PREFIJO_RELEVO}" —el canal sigue vivo y no se pierde nada, pero esa
llamada ya no trae decisión: la trae la que la relevó—.

Aparte de responder, puedes consultar el estado en cualquier momento con
game_state, battle_state, map, creature_stats, spell_list y building_list, sin
volcarte la partida entera en el contexto.`;

server.tool('heroes_listen', LISTEN_DESCRIPTION, {}, async () => {
  // Con la partida terminada no se reconecta: el servidor puede estar ya
  // apagado y lo que hay que decirle al agente no depende del socket.
  if (!buzon.haTerminado) await connect();

  const recogida = buzon.enCurso;
  if (recogida !== null) {
    return {
      content: [
        {
          type: 'text' as const,
          text:
            `Tienes la petición ${recogida} recogida y sin contestar. ` +
            'Responde con heroes_respond antes de volver a escuchar.',
        },
      ],
      isError: true,
    };
  }

  const { texto, esError } = textoDeEscucha(await buzon.espera(), veredictos);
  return {
    content: [{ type: 'text' as const, text: texto }],
    ...(esError ? { isError: true } : {}),
  };
});

server.tool(
  'heroes_respond',
  'Entrega tu decisión para la petición que acabas de recibir. Una sola vez por petición.',
  {
    response: z.string().describe('La respuesta en JSON, con la forma que indicaba la petición.'),
  },
  async ({ response }) => {
    if (buzon.haTerminado) {
      return {
        content: [
          {
            type: 'text' as const,
            text:
              'La partida ya ha terminado: no queda nadie esperando esta respuesta y no ' +
              'se va a aplicar. Llama a heroes_listen si quieres releer cómo acabó.',
          },
        ],
        isError: true,
      };
    }

    const enviado = buzon.enCurso;
    if (enviado === null) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'No hay ninguna petición pendiente. Llama antes a heroes_listen.',
          },
        ],
        isError: true,
      };
    }

    let data: unknown;
    try {
      data = JSON.parse(response);
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Ese texto no es JSON válido (${err instanceof Error ? err.message : String(err)}). Vuelve a enviarlo bien formado.`,
          },
        ],
        isError: true,
      };
    }

    try {
      send({ type: 'response', requestId: enviado, data });
    } catch (err) {
      // El canal se ha muerto entre escuchar y responder. Se suelta la petición
      // igualmente: retenerla dejaría al agente atascado en el guardia de
      // `heroes_listen`, que es la forma tonta de volver a colgarlo.
      buzon.suelta();
      return {
        content: [
          {
            type: 'text' as const,
            text:
              `Tu respuesta a ${enviado} no ha llegado a salir: ` +
              `${err instanceof Error ? err.message : String(err)}. ` +
              `Esa decisión la ${LA_JUEGA_LA_IA}. Vuelve a heroes_listen: ` +
              'si el servidor sigue vivo, el puente se reconecta solo.',
          },
        ],
        isError: true,
      };
    }
    buzon.suelta();
    return {
      content: [
        {
          type: 'text' as const,
          text: `Respuesta a ${enviado} entregada. Vuelve a heroes_listen.`,
        },
      ],
    };
  },
);

// ------------------------------------------------------- tools de consulta

/**
 * Qué se acepta en `player`, dicho ANTES de que lo rechacen.
 *
 * La tool anunciaba el parámetro sin decir qué valores valían, y con el rival
 * ahí dentro devolvía su estado entero. Ahora se rechaza — pero un agente al que
 * le llega un rechazo que nadie le avisó no se corrige: reintenta. Cuál es «el
 * tuyo» no se escribe aquí: lo sabe el servidor, que es quien lleva la cuenta de
 * los jugadores del agente, y un `1` puesto a mano era falso en cuanto el agente
 * llevaba al 0.
 */
const PARAMETRO_JUGADOR =
  'Jugador por el que preguntas. SOLO vale uno de los tuyos, los que lleva este ' +
  'agente; por cualquier otro se rechaza la consulta diciéndote cuáles son. ' +
  'Si lo omites se entiende el tuyo, que es lo normal.';

/**
 * `player` se manda solo si el agente lo pidió: omitirlo es decirle al servidor
 * «el mío», y el servidor es el único que sabe cuál es.
 */
const jugador = (player: number | undefined): Record<string, unknown> =>
  player === undefined ? {} : { player };

server.tool(
  'game_state',
  'Estado de la partida desde tu punto de vista, sin esperar turno.',
  { player: z.number().int().optional().describe(PARAMETRO_JUGADOR) },
  async ({ player }) => {
    const data = await consultar('game_state', jugador(player));
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'battle_state',
  'La batalla en curso, si la hay, desde tu punto de vista. Si no es tuya —el ' +
    'rival contra un monstruo— la ves igual, con los ojos del atacante, pero sin ' +
    'el maná ni el libro de hechizos de su héroe y sin "legalActions": ahí no ' +
    'juegas tú. Y en tu PROPIA batalla tampoco hay "legalActions" cuando el ' +
    'turno lo tiene una unidad del otro bando: la lista es siempre la del stack ' +
    'activo, y esa sería la del rival. En los dos casos la nota de la respuesta ' +
    'dice cuál de las dos ausencias es.',
  { player: z.number().int().optional().describe(PARAMETRO_JUGADOR) },
  async ({ player }) => {
    const data = await consultar('battle_state', jugador(player));
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  },
);

/**
 * El mapa como lo conoce el agente.
 *
 * La consulta existía desde el primer día en `consultas.ts` y **ninguna tool la
 * exponía**: un endpoint que el cable servía y al que nadie podía llamar (#33).
 * Se publica ahora y no antes porque hasta #74 devolvía el mapa entero sin
 * mirar siquiera por quién se preguntaba; hoy pasa por `jugadorDelAgente` y por
 * `serializeKnownMap`, o sea por el mismo candado y la misma niebla que
 * `game_state`.
 *
 * **La descripción no se escribe aquí.** Lo que hay que decir de este objeto —que
 * un `null` del terreno es ignorancia y no una casilla rara, que los objetos son
 * memoria fechada, que un camino que falta puede estar ahí, y qué cuesta pisar
 * cada cosa— lo escribe `COMO_SE_LEE_EL_MAPA`, **pegado al serializador que lo
 * produce**, y de ahí lo leen esta tool y `RESPONSE_FORMAT.adventure_turn`.
 *
 * Se hizo así porque las dos ya habían divergido: eran dos prosas a mano que se
 * citaban la una a la otra —«es lo mismo que viaja en knownMap» / «es lo mismo
 * que devuelve la tool map»— y la de aquí no tenía ni el agua infranqueable ni
 * los costes, así que quien llamaba a la tool recibía una descripción
 * estrictamente peor del **mismo** objeto. Lo único propio de esta puerta es la
 * frase de arriba: que se puede pedir sin esperar turno.
 */
const MAPA_DESCRIPCION =
  'El mapa de aventura tal y como lo conoces TÚ, sin esperar turno. Es lo mismo ' +
  'que viaja en "knownMap" dentro de adventure_turn, pero puedes pedirlo cuando ' +
  'quieras.\n' +
  COMO_SE_LEE_EL_MAPA;

server.tool(
  'map',
  MAPA_DESCRIPCION,
  { player: z.number().int().optional().describe(PARAMETRO_JUGADOR) },
  async ({ player }) => {
    const data = await consultar('map', jugador(player));
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'creature_stats',
  'Ficha de una criatura, o el catálogo entero si no indicas ninguna.',
  {
    creature: z.string().optional().describe('Id de criatura, p. ej. "paladin"'),
    faction: z.enum(['knight', 'necromancer']).optional().describe('Alineación de una facción'),
  },
  ({ creature: id, faction }) => {
    if (id !== undefined) {
      return { content: [{ type: 'text' as const, text: JSON.stringify(creature(id), null, 2) }] };
    }
    const lista = faction === undefined ? allCreatures() : factionLineup(faction);
    return { content: [{ type: 'text' as const, text: JSON.stringify(lista, null, 2) }] };
  },
);

server.tool('spell_list', 'Los hechizos del juego con su coste y efecto.', {}, () => ({
  content: [{ type: 'text' as const, text: JSON.stringify(allSpells(), null, 2) }],
}));

server.tool('building_list', 'Los edificios de castillo con su coste y requisitos.', {}, () => ({
  content: [{ type: 'text' as const, text: JSON.stringify(allBuildings(), null, 2) }],
}));

// ---------------------------------------------------------------- arranque

const transport = new StdioServerTransport();
await server.connect(transport);
// La conexión con la partida se abre de forma perezosa: el MCP puede arrancar
// antes que el servidor de juego sin morir en el intento.
