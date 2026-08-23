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

export type ServerToAgentMsg = AgentRequestMsg | AgentResultMsg | QueryResultMsg;

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
