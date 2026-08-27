/**
 * Enlace con el agente que hace de modelo.
 *
 * El servidor le manda una petición y espera su respuesta. Si no hay agente
 * conectado —o tarda demasiado— el juego NO se detiene: cae en la IA
 * heurística y sigue. El agente es una mejora, no una dependencia.
 */

import { RESPONSE_FORMAT, type RequestKind, responseSchemas } from '@core/contract/agent.js';
import type { WebSocket } from 'ws';
import { notaRespuestaInvalida, notaSinRespuesta } from './notas.js';
import type {
  AgentGameOverMsg,
  AgentRequestMsg,
  AgentToServerMsg,
  ServerToAgentMsg,
} from './protocol.js';

export interface PendingRequest {
  readonly requestId: string;
  readonly kind: RequestKind;
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export type QueryHandler = (what: string, args: Record<string, unknown>) => unknown;

/**
 * La respuesta del agente **con el número de petición que la provocó**.
 *
 * `report()` pide ese número y `ask()` solo devolvía los datos, así que informar
 * al agente no era «algo que nadie había llamado todavía»: era algo que **no se
 * podía** llamar. Devolver el par es la manera aburrida de abrir esa vía, y la
 * única que no miente el día que haya dos peticiones en vuelo.
 */
export interface AgentAnswer<T> {
  readonly requestId: string;
  readonly data: T;
}

export class AgentLink {
  private socket: WebSocket | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private counter = 0;
  private queryHandler: QueryHandler | null = null;
  /**
   * El aviso de fin de partida, guardado para quien llegue tarde.
   *
   * Se mandaba una sola vez y `send` no hace nada sin socket, así que un puente
   * que conectaba o reconectaba **después** del final no lo recibía nunca y su
   * `heroes_listen` se bloqueaba para siempre: el mismo cuelgue que este ciclo
   * vino a cerrar, en el único camino donde el agente no puede diagnosticarlo
   * —reinicio de la sesión, caída del puente en los últimos turnos—.
   */
  private final: AgentGameOverMsg | null = null;
  /** Si alguna vez se ató un agente. No vuelve a false al desconectarse. */
  private haVenidoAlguien = false;
  private esperandoPrimero: (() => void) | null = null;

  /** Segundos que se espera una decisión antes de rendirse. */
  constructor(private readonly timeoutMs = 300_000) {}

  /**
   * Cuánto se espera una decisión, para quien tenga que ANUNCIARLO.
   *
   * El servidor dice en consola cuánto va a estar esperando el plan de mapa, y
   * el número tiene que salir de aquí: escrito a mano en `ws-server.ts` sería
   * una segunda copia del plazo que dejaría de ser verdad en cuanto alguien
   * construyera el enlace con otro.
   */
  get plazoMs(): number {
    return this.timeoutMs;
  }

  get connected(): boolean {
    return this.socket !== null;
  }

  /** Si alguna vez se ató un agente, aunque ya no esté. */
  get haVenidoAlgunAgente(): boolean {
    return this.haVenidoAlguien;
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
    this.haVenidoAlguien = true;
    this.esperandoPrimero?.();

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
      // Solo el socket ACTIVO rinde lo que hay en vuelo, y la guarda hacía falta
      // en las DOS líneas. El `close` del socket viejo llega DESPUÉS de que
      // `attach` haya atado al nuevo, así que sin esto un relevo mataba la
      // primera petición del agente RECIÉN conectado —que perdía su turno sin
      // haber hecho nada— y encima le mandaba un veredicto diciéndole que se
      // había desconectado, estando él perfectamente conectado.
      if (this.socket !== socket) return;
      this.socket = null;
      this.failAll(new Error('el agente se ha desconectado'));
    });

    socket.on('error', (err) => {
      console.error('[agente] error de socket:', err);
    });

    // Quien llega después del final se entera igual, en el acto.
    if (this.final !== null) this.send(this.final);
  }

  /**
   * Espera a que se ate un agente, y **solo si no ha venido nunca ninguno**.
   *
   * Vive aquí y no en `ws-server.ts` por dos motivos: allí era un sondeo cada
   * 500 ms, y sobre todo allí volvía a esperar los dos minutos enteros **antes
   * de cada turno** una vez que el puente se caía, así que una partida de 200
   * días se convertía en horas de nada. Si el agente estuvo y se fue, se juega
   * con la heurística y se sigue.
   *
   * Devuelve si hay agente atado al terminar de esperar.
   */
  async esperaPrimerAgente(plazoMs: number): Promise<boolean> {
    if (this.socket !== null || this.haVenidoAlguien) return this.socket !== null;

    let temporizador: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      new Promise<void>((resolve) => {
        this.esperandoPrimero = resolve;
      }),
      new Promise<void>((resolve) => {
        temporizador = setTimeout(resolve, plazoMs);
      }),
    ]);
    clearTimeout(temporizador);
    this.esperandoPrimero = null;
    return this.socket !== null;
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

  /**
   * Rinde todas las peticiones en vuelo, **diciéndoselo**.
   *
   * Antes se borraban y se rechazaba sin mandar ningún `result`: el agente
   * perdía el turno y su siguiente escucha no traía una línea sobre ese
   * `requestId`. Es el silencio ambiguo justo donde más importa distinguir «se
   * perdió» de «llegó tarde», y rompe de frente lo que promete el canal.
   */
  private failAll(err: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      this.report(p.requestId, false, [err.message], notaSinRespuesta(p.kind, err.message));
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
  ): Promise<AgentAnswer<import('zod').infer<(typeof responseSchemas)[K]>>> {
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
        const motivo = `no respondiste a tiempo (${Math.round(this.timeoutMs / 1000)} s)`;
        // Se le dice. Un plazo agotado es lo que peor se lleva con el silencio:
        // el agente puede estar todavía pensando la respuesta que ya no vale.
        this.report(requestId, false, [motivo], notaSinRespuesta(kind, motivo));
        reject(new Error(`el agente no respondió a "${kind}" a tiempo`));
      }, this.timeoutMs);
      this.pending.set(requestId, { requestId, kind, resolve, reject, timer });
      this.send(request);
    });

    const parsed = responseSchemas[kind].safeParse(raw);
    if (!parsed.success) {
      const problemas = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      this.report(requestId, false, problemas, notaRespuestaInvalida(kind));
      throw new Error(`respuesta inválida a "${kind}":\n- ${problemas.join('\n- ')}`);
    }

    return { requestId, data: parsed.data as import('zod').infer<(typeof responseSchemas)[K]> };
  }

  /** Informa al agente de cómo fue su última respuesta. */
  report(requestId: string, ok: boolean, problems?: readonly string[], note?: string): void {
    this.send({
      type: 'result',
      requestId,
      ok,
      ...(problems ? { problems } : {}),
      ...(note ? { note } : {}),
    });
  }

  /**
   * Le dice al agente que la partida se acabó, y quién ganó.
   *
   * Sin este aviso, el que esperaba una decisión se quedaba colgado para
   * siempre: el servidor deja de preguntar cuando la partida termina, pero
   * sigue vivo con sus dos puertos abiertos, así que el socket ni se cierra.
   * Se manda también cuando la partida revienta, con `winner: null`: un agente
   * bloqueado sin motivo es peor que uno que sabe que hubo un fallo.
   */
  gameOver(winner: number | null, note: string): void {
    // Se guarda, no solo se manda: quien conecte después también tiene que
    // enterarse, y ese es el único camino donde no puede diagnosticarlo él.
    this.final = { type: 'game_over', winner, note };
    this.send(this.final);
  }
}
