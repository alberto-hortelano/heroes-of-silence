/**
 * Wire entre el servidor de juego y el puente MCP (el agente).
 * Es la fuente de verdad del formato: si cambia aquí, cambia en los dos lados.
 *
 * El de los espectadores vivía también aquí hasta la fase S de la reorganización
 * (07-11-2026); hoy es `src/shared/cable-del-espectador.ts`, que lee la página del
 * espectador sin importar el servidor.
 */
import type { RequestKind } from '@core/contract/esquemas.js';

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

/**
 * Qué partida hay al otro lado del canal. Es lo primero que se manda al atar un agente.
 *
 * Existe porque el puente MCP vive más que la partida: se reinicia el servidor
 * y el mismo puente sigue con lo que le quedaba de la anterior —sus veredictos
 * sin recoger y su `game_over`—, y la primera escucha de la partida nueva los
 * traía como propios (#118). Los `requestId` no sirven para distinguirlas: cada
 * partida cuenta desde `req-1`.
 */
export interface AgentPartidaMsg {
  readonly type: 'partida';
  readonly id: string;
}

export type ServerToAgentMsg =
  | AgentPartidaMsg
  | AgentRequestMsg
  | AgentResultMsg
  | QueryResultMsg
  | AgentGameOverMsg;

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
