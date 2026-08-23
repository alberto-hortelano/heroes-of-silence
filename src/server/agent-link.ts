/**
 * Enlace con el agente que hace de modelo.
 *
 * El servidor le manda una petición y espera su respuesta. Si no hay agente
 * conectado —o tarda demasiado— el juego NO se detiene: cae en la IA
 * heurística y sigue. El agente es una mejora, no una dependencia.
 */
import type { WebSocket } from 'ws';
import { responseSchemas, RESPONSE_FORMAT, type RequestKind } from '@core/contract/agent.js';
import type { AgentRequestMsg, AgentToServerMsg, ServerToAgentMsg } from './protocol.js';

export interface PendingRequest {
  readonly requestId: string;
  readonly kind: RequestKind;
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export type QueryHandler = (
  what: string,
  args: Record<string, unknown>,
) => unknown;

export class AgentLink {
  private socket: WebSocket | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private counter = 0;
  private queryHandler: QueryHandler | null = null;

  /** Segundos que se espera una decisión antes de rendirse. */
  constructor(private readonly timeoutMs = 300_000) {}

  get connected(): boolean {
    return this.socket !== null;
  }

  onQuery(handler: QueryHandler): void {
    this.queryHandler = handler;
  }

  attach(socket: WebSocket): void {
    if (this.socket !== null) {
      // Un segundo agente sustituye al anterior: la sesión es de uno solo.
      this.failAll(new Error('otro agente ha tomado el relevo'));
      this.socket.close();
    }
    this.socket = socket;

    socket.on('message', (raw) => {
      let msg: AgentToServerMsg;
      try {
        msg = JSON.parse(String(raw)) as AgentToServerMsg;
      } catch (err) {
        console.error('[agente] mensaje ilegible:', err);
        return;
      }
      this.handle(msg);
    });

    socket.on('close', () => {
      if (this.socket === socket) this.socket = null;
      this.failAll(new Error('el agente se ha desconectado'));
    });

    socket.on('error', (err) => {
      console.error('[agente] error de socket:', err);
    });
  }

  private handle(msg: AgentToServerMsg): void {
    switch (msg.type) {
      case 'hello':
        console.log(`[agente] conectado: ${msg.client}`);
        return;

      case 'response': {
        const pending = this.pending.get(msg.requestId);
        if (pending === undefined) {
          console.warn(`[agente] respuesta a una petición que ya no existe: ${msg.requestId}`);
          return;
        }
        clearTimeout(pending.timer);
        this.pending.delete(msg.requestId);
        pending.resolve(msg.data);
        return;
      }

      case 'query': {
        if (this.queryHandler === null) {
          this.send({
            type: 'query_result',
            queryId: msg.queryId,
            ok: false,
            error: 'el servidor no acepta consultas ahora mismo',
          });
          return;
        }
        try {
          const data = this.queryHandler(msg.what, msg.args ?? {});
          this.send({ type: 'query_result', queryId: msg.queryId, ok: true, data });
        } catch (err) {
          this.send({
            type: 'query_result',
            queryId: msg.queryId,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }
    }
  }

  private send(msg: ServerToAgentMsg): void {
    if (this.socket === null) return;
    this.socket.send(JSON.stringify(msg));
  }

  private failAll(err: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  /**
   * Pide una decisión al agente y valida la respuesta contra su esquema.
   * Lanza si no hay agente, si se agota el tiempo o si la respuesta no encaja.
   */
  async ask<K extends RequestKind>(
    kind: K,
    payload: unknown,
  ): Promise<import('zod').infer<(typeof responseSchemas)[K]>> {
    if (this.socket === null) throw new Error('no hay ningún agente conectado');

    this.counter += 1;
    const requestId = `req-${this.counter}`;
    const request: AgentRequestMsg = {
      type: 'request',
      requestId,
      kind,
      payload,
      responseFormat: RESPONSE_FORMAT[kind],
    };

    const raw = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`el agente no respondió a "${kind}" a tiempo`));
      }, this.timeoutMs);
      this.pending.set(requestId, { requestId, kind, resolve, reject, timer });
      this.send(request);
    });

    const parsed = responseSchemas[kind].safeParse(raw);
    if (!parsed.success) {
      const problemas = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      this.send({ type: 'result', requestId, ok: false, problems: problemas });
      throw new Error(`respuesta inválida a "${kind}":\n- ${problemas.join('\n- ')}`);
    }

    return parsed.data as import('zod').infer<(typeof responseSchemas)[K]>;
  }

  /** Informa al agente de cómo fue su última respuesta. */
  report(requestId: string, ok: boolean, problems?: readonly string[], note?: string): void {
    this.send({ type: 'result', requestId, ok, ...(problems ? { problems } : {}), ...(note ? { note } : {}) });
  }
}
