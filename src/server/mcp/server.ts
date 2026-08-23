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
import { AGENT_PORT, type AgentToServerMsg, type ServerToAgentMsg } from '../protocol.js';

const SERVER_URL = process.env['HEROES_SERVER'] ?? `ws://localhost:${AGENT_PORT}`;

// ---------------------------------------------------------------- conexión

let socket: WebSocket | null = null;
let conectando: Promise<WebSocket> | null = null;

/** Peticiones que han llegado y aún no ha recogido `heroes_listen`. */
const bandeja: Extract<ServerToAgentMsg, { type: 'request' }>[] = [];
/** Quien esté esperando una petición, si `heroes_listen` llegó primero. */
let esperando: ((msg: Extract<ServerToAgentMsg, { type: 'request' }>) => void) | null = null;
/** Petición recogida y pendiente de respuesta. */
let enCurso: string | null = null;
/** Consultas de estado en vuelo. */
const consultas = new Map<string, (r: { ok: boolean; data?: unknown; error?: string }) => void>();
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
    case 'request': {
      if (esperando !== null) {
        const resolver = esperando;
        esperando = null;
        enCurso = msg.requestId;
        resolver(msg);
      } else {
        bandeja.push(msg);
      }
      return;
    }
    case 'query_result': {
      const pendiente = consultas.get(msg.queryId);
      if (pendiente === undefined) return;
      consultas.delete(msg.queryId);
      pendiente({ ok: msg.ok, ...(msg.data !== undefined ? { data: msg.data } : {}), ...(msg.error !== undefined ? { error: msg.error } : {}) });
      return;
    }
    case 'result':
      // El veredicto sobre la última respuesta llega aquí; se le entrega al
      // agente en la siguiente petición, que es cuando puede hacer algo con él.
      ultimoVeredicto = msg.ok
        ? null
        : `Tu respuesta anterior tuvo problemas:\n- ${(msg.problems ?? []).join('\n- ')}`;
      return;
  }
}

let ultimoVeredicto: string | null = null;

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
  return new Promise((resolve, reject) => {
    consultas.set(queryId, (r) => {
      if (r.ok) resolve(r.data);
      else reject(new Error(r.error ?? 'la consulta ha fallado'));
    });
    send({ type: 'query', queryId, what: what as 'game_state', args });
  });
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

Tipos de petición que puedes recibir:
- "adventure_turn" → te toca el turno en el mapa: mueve héroes, construye,
  recluta. Devuelves una lista de acciones.
- "battle_turn"    → una unidad tuya espera órdenes en la batalla. Devuelves
  UNA acción. La petición incluye "legalActions" con todo lo que se puede
  hacer: elegir de ahí nunca falla.
- "map_generate"   → diseña un mapa. No dibujas nada: devuelves un plan
  declarativo y el motor lo construye y lo valida.
- "hero_banter"    → una frase en boca de tu héroe.

Aparte de responder, puedes consultar el estado en cualquier momento con
game_state, battle_state, creature_stats, spell_list y building_list, sin
volcarte la partida entera en el contexto.`;

server.tool('heroes_listen', LISTEN_DESCRIPTION, {}, async () => {
  await connect();

  if (enCurso !== null) {
    return {
      content: [
        {
          type: 'text' as const,
          text:
            `Tienes la petición ${enCurso} recogida y sin contestar. ` +
            'Responde con heroes_respond antes de volver a escuchar.',
        },
      ],
      isError: true,
    };
  }

  const msg =
    bandeja.shift() ??
    (await new Promise<Extract<ServerToAgentMsg, { type: 'request' }>>((resolve) => {
      esperando = resolve;
    }));
  enCurso = msg.requestId;

  const aviso = ultimoVeredicto === null ? '' : `\n\n⚠ ${ultimoVeredicto}\n`;
  ultimoVeredicto = null;

  return {
    content: [
      {
        type: 'text' as const,
        text:
          `Petición ${msg.requestId} · kind: ${msg.kind}${aviso}\n\n` +
          `ESTADO:\n${JSON.stringify(msg.payload, null, 2)}\n\n` +
          `CÓMO RESPONDER:\n${msg.responseFormat}`,
      },
    ],
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
    if (enCurso === null) {
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

    send({ type: 'response', requestId: enCurso, data });
    const enviado = enCurso;
    enCurso = null;
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

server.tool('battle_state', 'La batalla en curso, si la hay.', {}, async () => {
  const data = await consultar('battle_state');
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
});

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
