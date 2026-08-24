/**
 * Wire entre el servidor de juego, el puente MCP y los espectadores.
 * Es la fuente de verdad del formato: si cambia aquí, cambia en los dos lados.
 */
import type { RequestKind } from '@core/contract/agent.js';

/** Puerto del canal con el puente MCP (el agente). */
export const AGENT_PORT = 9881;
/** Puerto del canal con los clientes que miran la partida. */
export const SPECTATOR_PORT = 9880;

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
  readonly finished: { winner: number } | null;
  /** Estado del mapa y de los jugadores, ya sin `Set` ni `Map`. */
  readonly view: unknown;
}

export interface SpectatorLogMsg {
  readonly type: 'log';
  readonly lines: readonly string[];
}

export type ServerToSpectatorMsg = SpectatorSnapshotMsg | SpectatorLogMsg;
