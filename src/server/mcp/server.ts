/**
 * Puente MCP: por aquí un agente de Claude Code se sienta a jugar.
 *
 * El patrón es el de `narrative-mcp` en ne-fan: `heroes_listen` se queda
 * bloqueado hasta que el juego pide una decisión y devuelve el estado junto
 * con el formato de respuesta; el agente decide y llama a `heroes_respond`
 * exactamente una vez; después vuelve a `heroes_listen`. Y así toda la partida.
 */

import { COMO_SE_LEE_EL_MAPA } from '@core/contract/mapa-conocido.js';
import { fichaDeCriatura, hechizosAlAgente } from '@core/contract/vistas.js';
import { allBuildings } from '@core/town/buildings.js';
import { FACTION_IDS } from '@core/types.js';
import { unidadDelJuego, unidadesDeFaccion, unidadesDelJuego } from '@core/unidad/catalogo.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import WebSocket from 'ws';
import { z } from 'zod';
import { mensajeDe } from '../../shared/errores.js';
import { servidorDelPuente } from '../entorno.js';
import { LA_JUEGA_LA_IA } from '../notas.js';
import type { AgentToServerMsg, ServerToAgentMsg } from '../protocol.js';
import { Buzon } from './buzon.js';
import { LISTEN_DESCRIPTION, textoDeEscucha } from './escucha.js';
import { ColaDeVeredictos } from './veredictos.js';

/**
 * A dónde se conecta el puente: `HEROES_SERVER` o el puerto del agente, leídos y
 * validados al arrancar (`servidorDelPuente`, en `entorno.ts`, con su test).
 */
const SERVER_URL = servidorDelPuente();

// ---------------------------------------------------------------- conexión

let socket: WebSocket | null = null;
let conectando: Promise<WebSocket> | null = null;
/** El agente colgó: una conexión que termine de abrirse ahora ya no tiene a quién servir. */
let cerrando = false;

/**
 * Todo lo que espera al otro lado del socket: la petición que aún no ha
 * recogido `heroes_listen` y las consultas en vuelo. Sabe terminarse.
 */
const buzon = new Buzon();
let contadorConsultas = 0;

/** Lo que se espera, con el socket abierto, a que el servidor diga qué partida juega. */
const PLAZO_DE_PRESENTACION_MS = 5_000;

/**
 * Abre el canal con la partida. Se da por abierto cuando el servidor dice QUÉ
 * partida juega, no al abrirse el socket: hasta entonces no se sabe si lo que
 * queda en el buzón y en la cola de veredictos es suyo o de otra (#118).
 */
function connect(): Promise<WebSocket> {
  if (socket !== null && socket.readyState === WebSocket.OPEN) return Promise.resolve(socket);
  if (conectando !== null) return conectando;

  const intento = new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(SERVER_URL);

    ws.on('open', () => {
      if (cerrando) {
        ws.close();
        return;
      }
      // Un servidor que no se presenta dejaría esta conexión a medias para
      // siempre, y con ella cada escucha y cada consulta.
      const sinPresentarse = setTimeout(() => {
        reject(
          new Error(
            `el servidor de ${SERVER_URL} no ha dicho qué partida juega en ` +
              `${PLAZO_DE_PRESENTACION_MS / 1000} s: ¿es de otra versión? Relanza "pnpm partida".`,
          ),
        );
        ws.close();
      }, PLAZO_DE_PRESENTACION_MS);
      ws.once('close', () => clearTimeout(sinPresentarse));
      ws.on('message', () => clearTimeout(sinPresentarse));
      // Por el socket y no por `send`: `socket` no se publica hasta saber la partida.
      ws.send(JSON.stringify({ type: 'hello', client: 'heroes-mcp' } satisfies AgentToServerMsg));
    });

    ws.on('message', (raw) => {
      let msg: ServerToAgentMsg;
      try {
        msg = JSON.parse(String(raw)) as ServerToAgentMsg;
      } catch {
        return;
      }
      if (msg.type === 'partida') {
        if (buzon.empiezaPartida(msg.id)) veredictos.olvida();
        socket = ws;
        if (conectando === intento) conectando = null;
        resolve(ws);
        return;
      }
      recibir(msg);
    });

    ws.on('close', () => {
      if (socket === ws) socket = null;
      // Si se cerró antes de decir la partida, quien esperaba la conexión se
      // quedaría colgado; después del `resolve` este `reject` no hace nada.
      if (conectando === intento) conectando = null;
      reject(
        new Error(
          `el servidor de la partida (${SERVER_URL}) cerró el canal sin decir qué partida juega`,
        ),
      );
      // Antes esto solo ponía la referencia a `null`, y quien esperaba una
      // decisión —o una respuesta a su consulta— se quedaba colgado para
      // siempre. El canal se muere entero: se avisa a todos a la vez.
      buzon.corta(`el servidor de la partida (${SERVER_URL}) ha cerrado el canal`);
    });

    ws.on('error', (err) => {
      if (conectando === intento) conectando = null;
      reject(
        new Error(
          `no se puede hablar con el servidor de la partida en ${SERVER_URL}: ${err.message}. ` +
            '¿Está arrancado con "pnpm partida"?',
        ),
      );
    });
  });
  conectando = intento;
  return intento;
}

/**
 * El agente ya no está: se cierra el canal con la partida y se sale.
 *
 * Se cierra el canal, no la partida: el servidor sigue vivo a propósito después
 * de un `game_over` para que `game_state` siga contestando, y un agente que se
 * va a mitad lo nota como cualquier desconexión (la termina la IA). Se sale en
 * cuanto el `close` del socket vuelve; el plazo es solo por si el servidor no
 * contesta al cierre, y va `unref` para no ser él quien retenga el proceso.
 */
function cerrarPuente(): void {
  cerrando = true;
  buzon.corta('el agente ha cerrado el puente MCP');
  const ws = socket;
  if (ws === null || ws.readyState === WebSocket.CLOSED) process.exit(0);
  ws.once('close', () => process.exit(0));
  ws.close();
  setTimeout(() => process.exit(0), PLAZO_DE_CIERRE_MS).unref();
}

/** Lo que se espera a que el servidor conteste al cierre del WebSocket antes de salir igual. */
const PLAZO_DE_CIERRE_MS = 500;

function recibir(msg: ServerToAgentMsg): void {
  switch (msg.type) {
    case 'partida':
      // Lo lee `connect`, que es quien sabe a qué socket pertenece.
      return;

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

/**
 * Lo que devuelve una herramienta: un texto, y si es un error. Las ocho herramientas
 * lo envolvían a mano, catorce veces, hasta la fase S de la reorganización
 * (07-11-2026).
 */
function texto(text: string, esError = false) {
  return { content: [{ type: 'text' as const, text }], ...(esError ? { isError: true } : {}) };
}

/** Lo que devuelve una consulta: el dato en JSON con sangría de dos, que es como lo lee el agente. */
function json(dato: unknown) {
  return texto(JSON.stringify(dato, null, 2));
}

/**
 * Con la partida terminada y el canal muerto, mira si el servidor ha vuelto con
 * otra.
 *
 * Con el canal vivo no se reconecta: el servidor sigue en pie tras un
 * `game_over` y es la misma partida. Con el canal muerto, ese servidor se fue, y
 * el que conteste ahora en el puerto es una partida nueva —y entonces el final
 * recordado ya no es suyo (`empiezaPartida`)— o nadie. Antes no se miraba nunca,
 * y un puente que había visto un final se lo repetía a la partida siguiente para
 * siempre (#118).
 *
 * No contestar NO es un error aquí: es lo esperable cuando la partida acabó y se
 * apagó el servidor, y lo que hay que decirle al agente es cómo acabó, que ya se
 * sabe. Por eso el fallo no sube: la escucha sigue y contesta con ese final.
 */
async function miraSiHayOtraPartida(): Promise<void> {
  try {
    await connect();
  } catch {
    // Nadie en el puerto, o no se presentó: sigue valiendo el final recordado.
  }
}

server.tool('heroes_listen', LISTEN_DESCRIPTION, {}, async () => {
  if (!buzon.haTerminado) await connect();
  else if (socket === null) await miraSiHayOtraPartida();

  const recogida = buzon.enCurso;
  if (recogida !== null) {
    return texto(
      `Tienes la petición ${recogida} recogida y sin contestar. ` +
        'Responde con heroes_respond antes de volver a escuchar.',
      true,
    );
  }

  const escucha = textoDeEscucha(await buzon.espera(), veredictos);
  return texto(escucha.texto, escucha.esError);
});

server.tool(
  'heroes_respond',
  'Entrega tu decisión para la petición que acabas de recibir. Una sola vez por petición.',
  {
    response: z.string().describe('La respuesta en JSON, con la forma que indicaba la petición.'),
  },
  async ({ response }) => {
    if (buzon.haTerminado) {
      return texto(
        'La partida ya ha terminado: no queda nadie esperando esta respuesta y no ' +
          'se va a aplicar. Llama a heroes_listen si quieres releer cómo acabó.',
        true,
      );
    }

    const enviado = buzon.enCurso;
    if (enviado === null) {
      return texto('No hay ninguna petición pendiente. Llama antes a heroes_listen.', true);
    }

    let data: unknown;
    try {
      data = JSON.parse(response);
    } catch (err) {
      return texto(
        `Ese texto no es JSON válido (${mensajeDe(err)}). Vuelve a enviarlo bien formado.`,
        true,
      );
    }

    try {
      send({ type: 'response', requestId: enviado, data });
    } catch (err) {
      // El canal se ha muerto entre escuchar y responder. Se suelta la petición
      // igualmente: retenerla dejaría al agente atascado en el guardia de
      // `heroes_listen`, que es la forma tonta de volver a colgarlo.
      buzon.suelta();
      return texto(
        `Tu respuesta a ${enviado} no ha llegado a salir: ` +
          `${mensajeDe(err)}. ` +
          `Esa decisión la ${LA_JUEGA_LA_IA}. Vuelve a heroes_listen: ` +
          'si el servidor sigue vivo, el puente se reconecta solo.',
        true,
      );
    }
    buzon.suelta();
    return texto(`Respuesta a ${enviado} entregada. Vuelve a heroes_listen.`);
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
    return json(data);
  },
);

server.tool(
  'battle_state',
  'La batalla en curso, si la hay, desde tu punto de vista. Si no es tuya —el ' +
    'rival contra un monstruo, o unos asaltantes emboscando al rival— la ves igual, ' +
    'con los ojos del atacante, pero sin ' +
    'el maná ni el libro de hechizos de su héroe y sin "legalActions": ahí no ' +
    'juegas tú. Y en tu PROPIA batalla tampoco hay "legalActions" cuando el ' +
    'turno lo tiene una unidad del otro bando: la lista es siempre la del stack ' +
    'activo, y esa sería la del rival. Cuando falta, "legalActionsOmitted" dice ' +
    'por qué ("not_your_battle", "not_your_turn" o "nobody_active") y la nota ' +
    'de la respuesta lo explica.',
  { player: z.number().int().optional().describe(PARAMETRO_JUGADOR) },
  async ({ player }) => {
    const data = await consultar('battle_state', jugador(player));
    return json(data);
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
    return json(data);
  },
);

server.tool(
  'creature_stats',
  'Ficha de una unidad del catálogo —sus cifras con su equipo de serie, "dwelling" (el edificio que la produce), "equipment", "armor" y su "level" y "powerIndex", derivados de las cifras—, o el catálogo entero si no indicas ninguna.',
  {
    creature: z.string().optional().describe('Id de unidad, p. ej. "templario-escudo"'),
    faction: z.enum(FACTION_IDS).optional().describe('Alineación de una facción'),
  },
  ({ creature: id, faction }) => {
    if (id !== undefined) {
      const ficha = fichaDeCriatura(unidadDelJuego(id));
      return json(ficha);
    }
    const lista = (faction === undefined ? unidadesDelJuego() : unidadesDeFaccion(faction)).map(
      fichaDeCriatura,
    );
    return json(lista);
  },
);

server.tool('spell_list', 'Los hechizos del juego con su coste y efecto.', {}, () =>
  json(hechizosAlAgente()),
);

server.tool('building_list', 'Los edificios de castillo con su coste y requisitos.', {}, () =>
  json(allBuildings()),
);

// ---------------------------------------------------------------- arranque

const transport = new StdioServerTransport();
// Que el agente cuelgue tiene que tumbar el puente, y el SDK no lo hace solo:
// su transporte no escucha el `end` de stdin (y su `onclose` solo salta si
// alguien llama a `close()`, que aquí no llama nadie). Sin esto el WebSocket
// mantenía vivo el proceso tras el EOF y lo que lo mataba era el `SIGTERM` que
// `StdioClientTransport.close()` manda a los dos segundos: 2 de los 3,3 s de
// cada `pnpm qa` (#113).
process.stdin.once('end', cerrarPuente);
await server.connect(transport);
// La conexión con la partida se abre de forma perezosa: el MCP puede arrancar
// antes que el servidor de juego sin morir en el intento.
