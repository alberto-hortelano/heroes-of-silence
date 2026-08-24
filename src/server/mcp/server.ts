/**
 * Puente MCP: por aquí un agente de Claude Code se sienta a jugar.
 *
 * El patrón es el de `narrative-mcp` en ne-fan: `heroes_listen` se queda
 * bloqueado hasta que el juego pide una decisión y devuelve el estado junto
 * con el formato de respuesta; el agente decide y llama a `heroes_respond`
 * exactamente una vez; después vuelve a `heroes_listen`. Y así toda la partida.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import WebSocket from 'ws';
import { allCreatures, creature, factionLineup } from '@core/data.js';
import { allSpells } from '@core/battle/spells.js';
import { allBuildings } from '@core/town/buildings.js';
import {
  LA_JUEGA_LA_IA,
  PREFIJO_CORTE,
  PREFIJO_FIN,
  PREFIJO_RELEVO,
  textoDeEscucha,
} from '../notas.js';
import { AGENT_PORT, type AgentToServerMsg, type ServerToAgentMsg } from '../protocol.js';
import { Buzon } from './buzon.js';
import { ColaDeVeredictos } from './veredictos.js';

const SERVER_URL = process.env['HEROES_SERVER'] ?? `ws://localhost:${AGENT_PORT}`;

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
            '¿Está arrancado con "pnpm server"?',
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
  return buzon.consulta(queryId, () => send({ type: 'query', queryId, what: what as 'game_state', args }));
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

Y trae, cuando lo hay, un bloque "CÓMO FUE LO ANTERIOR" con el veredicto de
CADA respuesta tuya que se haya aplicado desde la última vez que escuchaste:
"✓" es que entró y "⚠" que no, con el motivo. Se informa siempre, también
cuando salió bien: no tienes que deducir de un silencio si coló o si el
mensaje se perdió.

Tipos de petición que puedes recibir:
- "adventure_turn" → te toca el turno en el mapa: mueve héroes, construye,
  recluta. Devuelves una lista de acciones.
- "battle_turn"    → una unidad tuya espera órdenes en la batalla. Devuelves
  UNA acción. La petición incluye "legalActions" con todo lo que se puede
  hacer: elegir de ahí nunca falla. Puedes ser el atacante o el DEFENSOR: mira
  "yourSide" en cada petición y no des por hecho que atacas.
- "map_generate"   → diseña un mapa. No dibujas nada: devuelves un plan
  declarativo y el motor lo construye y lo valida.
- "hero_banter"    → una frase en boca de tu héroe.

El ciclo tiene final y te avisa de él: cuando la partida termina recibes un
mensaje que empieza por "${PREFIJO_FIN}" y te dice quién ganó. Ahí se para
el bucle. Y si el canal con la partida se muere, recibes uno que empieza por
"${PREFIJO_CORTE}" con lo que se sabe y lo que puedes intentar. En
ninguno de los dos casos te quedas esperando a ciegas.

Llama de una en una: si dos heroes_listen se solapan, la primera vuelve con
"${PREFIJO_RELEVO}" —el canal sigue vivo y no se pierde nada, pero esa
llamada ya no trae decisión: la trae la que la relevó—.

Aparte de responder, puedes consultar el estado en cualquier momento con
game_state, battle_state, creature_stats, spell_list y building_list, sin
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
    response: z
      .string()
      .describe('La respuesta en JSON, con la forma que indicaba la petición.'),
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
          { type: 'text' as const, text: 'No hay ninguna petición pendiente. Llama antes a heroes_listen.' },
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
        { type: 'text' as const, text: `Respuesta a ${enviado} entregada. Vuelve a heroes_listen.` },
      ],
    };
  },
);

// ------------------------------------------------------- tools de consulta

server.tool(
  'game_state',
  'Estado de la partida desde el punto de vista de un jugador, sin esperar turno.',
  { player: z.number().int().optional().describe('Jugador (por defecto, el tuyo: 1)') },
  async ({ player }) => {
    const data = await consultar('game_state', { player: player ?? 1 });
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'battle_state',
  'La batalla en curso, si la hay, desde el punto de vista de un jugador.',
  { player: z.number().int().optional().describe('Jugador (por defecto, el tuyo: 1)') },
  async ({ player }) => {
    const data = await consultar('battle_state', { player: player ?? 1 });
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
