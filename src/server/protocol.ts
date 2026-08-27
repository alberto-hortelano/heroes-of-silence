/**
 * Wire entre el servidor de juego, el puente MCP y los espectadores.
 * Es la fuente de verdad del formato: si cambia aquí, cambia en los dos lados.
 */
import type { RequestKind } from '@core/contract/agent.js';
import type { SpectatorView } from './vista-espectador.js';

// ------------------------------------------------------- servidor → agente

export interface AgentRequestMsg {
  readonly type: 'request';
  readonly requestId: string;
  readonly kind: RequestKind;
  /** Estado serializado para esta decisión. */
  readonly payload: unknown;
  /** Cómo debe responder. Viaja EN la petición, a propósito. */
  readonly responseFormat: string;
}

/** Resultado de aplicar la respuesta: le dice al agente si coló y qué falló. */
export interface AgentResultMsg {
  readonly type: 'result';
  readonly requestId: string;
  readonly ok: boolean;
  readonly problems?: readonly string[];
  readonly note?: string;
}

export interface QueryResultMsg {
  readonly type: 'query_result';
  readonly queryId: string;
  readonly ok: boolean;
  readonly data?: unknown;
  readonly error?: string;
}

/**
 * La partida ha terminado: no va a haber más peticiones.
 *
 * Es el único mensaje que le llega al agente sin que él haya pedido nada, y por
 * eso hace falta: cuando la partida acaba, el servidor deja de preguntar pero
 * **no cierra el canal** —los `WebSocketServer` siguen escuchando—, así que
 * quien esperaba en `heroes_listen` no se enteraba ni por el `close` del
 * socket. Se quedaba bloqueado para siempre, sin saber que había acabado ni
 * quién ganó, hasta que su cliente MCP se rendía por timeout.
 */
export interface AgentGameOverMsg {
  readonly type: 'game_over';
  /** Quién gana, o `null` si se agotaron los días sin resolver o si reventó. */
  readonly winner: number | null;
  /** Cómo acabó, escrito para quien lo lee, que es un modelo. */
  readonly note: string;
}

export type ServerToAgentMsg = AgentRequestMsg | AgentResultMsg | QueryResultMsg | AgentGameOverMsg;

// ------------------------------------------------------- agente → servidor

export interface AgentHelloMsg {
  readonly type: 'hello';
  readonly client: string;
}

export interface AgentResponseMsg {
  readonly type: 'response';
  readonly requestId: string;
  readonly data: unknown;
}

/** Consultas de estado que el agente puede hacer fuera de turno. */
export interface AgentQueryMsg {
  readonly type: 'query';
  readonly queryId: string;
  readonly what: 'game_state' | 'battle_state' | 'map';
  readonly args?: Record<string, unknown>;
}

export type AgentToServerMsg = AgentHelloMsg | AgentResponseMsg | AgentQueryMsg;

// ------------------------------------------------------- espectadores

export interface SpectatorSnapshotMsg {
  readonly type: 'snapshot';
  readonly day: number;
  readonly current: number;
  /**
   * La partida ha terminado, y **también cuando no gana nadie**.
   *
   * Era `{ winner: number } | null`, o sea `state.finished` tal cual, y con eso
   * una partida que se agota sin resolver dejaba al espectador en el último día
   * sin una línea: `state.finished` se queda en `null` y el aviso solo salía por
   * el canal del agente. Ahora dice lo mismo que `game_over` —quién gana o
   * nadie, y la nota escrita para quien lee—, que es lo que promete el criterio
   * 9 de #30.
   */
  readonly finished: { readonly winner: number | null; readonly note: string } | null;
  /**
   * Estado del mapa, los jugadores y la batalla en curso, ya sin `Set` ni `Map`.
   *
   * Decía `unknown`, y eso obligaba a quien lo pintara a reimplementar el
   * esquema del emisor por su cuenta: dos declaraciones de la misma cosa que
   * nadie compara, que es el bug que acaba de morder en `MapPlan` contra
   * `mapPlanSchema`. Ahora es un tipo, `SpectatorView`, y los dos extremos
   * compilan contra él.
   */
  readonly view: SpectatorView;
}

/**
 * Un solo brazo, y por ahora es lo honesto.
 *
 * Aquí vivía un `SpectatorLogMsg` con `readonly lines: string[]` y **cero
 * emisores** (#32). No se emitió nunca porque no tiene sujeto: el snapshot ya
 * lleva `view.log` con los últimos 40 hechos ESTRUCTURADOS y `view.directorLog`
 * con lo que dice el director, así que una lista de cadenas sueltas es
 * estrictamente más pobre que lo que ya viaja. Emitirlo habría sido fabricarle
 * un motivo.
 *
 * Se borra en vez de dejarlo declarado: un tipo con cero emisores lo lee alguien
 * dentro de seis meses, se cree que funciona, y escribe el cliente que lo espera.
 */
export type ServerToSpectatorMsg = SpectatorSnapshotMsg;
