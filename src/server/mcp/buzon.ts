/**
 * Lo que el puente tiene en vuelo hacia la partida, y cómo se cierra.
 *
 * Aquí vivían dos promesas que **nadie resolvía nunca**: la de `heroes_listen`
 * —que espera a que la partida pida una decisión— y la de cada consulta de
 * estado. El `close` del socket solo ponía la referencia a `null`, así que
 * cuando la partida terminaba o el servidor se moría, el agente se quedaba
 * bloqueado para siempre: sin enterarse de que había acabado, sin saber quién
 * ganó y sin poder preguntarlo, porque la consulta viajaba por ese mismo socket
 * muerto. Se rendía su cliente MCP por timeout, no él.
 *
 * Las dos esperas viven juntas justamente por eso: lo que las mata es lo mismo
 * —el canal— y tienen que apagarse en la misma llamada o vuelve a quedarse una
 * huérfana.
 *
 * Está fuera de `server.ts` porque allí no se puede probar: ese módulo abre el
 * transporte de stdio en cuanto se importa.
 */
import type { AgentRequestMsg } from '../protocol.js';

/**
 * Cuánto se espera la respuesta a una consulta antes de rendirse.
 *
 * `AgentLink` da plazo a cada petición y esto no daba ninguno: un `query_result`
 * que no llegara **con el socket vivo** —un manejador que se cuelga, un mensaje
 * perdido— dejaba la promesa esperando para siempre. Es la misma clase de
 * cuelgue que cierra este ciclo, en el único camino que no se había mirado. Son
 * 30 s y no 300 porque una consulta es una lectura del estado al otro lado: si
 * tarda medio minuto, no va a llegar.
 */
export const PLAZO_CONSULTA_MS = 30_000;

/**
 * Lo que puede recibir quien espera en `heroes_listen`. Nunca «nada».
 *
 * `relevo` y `corte` son clases distintas porque son hechos distintos: en el
 * relevo el canal está vivo y solo sobraba una llamada; en el corte el cable se
 * ha muerto. Compartían clase, y el agente leía «se ha perdido la conexión con
 * la partida» de algo que no había perdido nada.
 */
export type Aviso =
  | { readonly clase: 'peticion'; readonly msg: AgentRequestMsg }
  | { readonly clase: 'fin'; readonly nota: string }
  | { readonly clase: 'relevo' }
  | { readonly clase: 'corte'; readonly motivo: string };

export interface RespuestaConsulta {
  readonly ok: boolean;
  readonly data?: unknown;
  readonly error?: string;
}

export class Buzon {
  /** Peticiones que llegaron antes de que nadie escuchara. */
  private readonly pendientes: AgentRequestMsg[] = [];
  private esperando: ((aviso: Aviso) => void) | null = null;
  /** La nota de fin de partida, si ya llegó. No hay vuelta atrás. */
  private terminada: string | null = null;
  private readonly consultas = new Map<
    string,
    {
      readonly entregar: (r: RespuestaConsulta) => void;
      readonly temporizador: ReturnType<typeof setTimeout>;
    }
  >();
  /** La petición recogida y sin contestar. */
  private recogida: string | null = null;

  constructor(private readonly plazoConsultaMs = PLAZO_CONSULTA_MS) {}

  /**
   * La petición que hay recogida y a la espera de respuesta, si la hay.
   *
   * Terminada la partida no hay ninguna, aunque quedara una a medias: nadie
   * espera ya esa respuesta. Vivía como un global fuera del buzón y cada uso lo
   * combinaba a mano con `haTerminado`; aquí dentro las tres condiciones son
   * una.
   */
  get enCurso(): string | null {
    return this.terminada === null ? this.recogida : null;
  }

  /** Suelta la petición recogida: contestada, o ya sin nadie que la espere. */
  suelta(): void {
    this.recogida = null;
  }

  /** Si la partida ya acabó. El puente no debe reconectar por su cuenta. */
  get haTerminado(): boolean {
    return this.terminada !== null;
  }

  /** Consultas mandadas y sin respuesta. Para tests, no para decidir. */
  get consultasEnVuelo(): number {
    return this.consultas.size;
  }

  /** Una petición de la partida: se la lleva quien espere, o se guarda. */
  entrega(msg: AgentRequestMsg): void {
    if (!this.despierta({ clase: 'peticion', msg })) this.pendientes.push(msg);
  }

  /**
   * La partida ha terminado. Se recuerda: quien vuelva a escuchar recibe lo
   * mismo en vez de bloquearse, que es exactamente el agujero que se cierra.
   */
  fin(nota: string): void {
    if (this.terminada !== null) return; // el primero manda: los días no vuelven
    this.terminada = nota;
    this.despierta({ clase: 'fin', nota });
  }

  /**
   * El canal se ha muerto. Despierta a todo el mundo con el motivo.
   *
   * **No se recuerda**, al revés que `fin`: el puente reconecta solo en la
   * siguiente llamada, y una desconexión pasajera no puede dejar al agente sin
   * partida para el resto de la sesión.
   */
  corta(motivo: string): void {
    for (const { entregar, temporizador } of this.consultas.values()) {
      clearTimeout(temporizador);
      entregar({ ok: false, error: `${motivo}; esta consulta no va a responder nunca` });
    }
    this.consultas.clear();
    // Y las peticiones sin recoger se tiran: son de una ejecución del servidor
    // que ya no existe. Si se guardaran, al reconectar `espera()` entregaría
    // PRIMERO la caduca, el agente gastaría una decisión entera en ella, el
    // servidor nuevo la descartaría con «respuesta a una petición que ya no
    // existe» y la petición de verdad esperaría detrás hasta agotar el plazo.
    this.pendientes.length = 0;
    // Y la petición recogida se suelta: es de esa misma ejecución muerta. Sin
    // esto, el texto del corte le decía «vuelve a llamar a heroes_listen y el
    // puente se reconecta solo» y al hacerlo se encontraba con el guardia
    // exigiéndole contestar a una petición que ya no espera nadie —dos vueltas
    // y dos consejos que se contradicen—.
    this.recogida = null;
    // No hace falta mirar `terminada`: con la partida acabada nadie puede estar
    // esperando —`espera()` contesta en el acto—, así que esa rama no se podía
    // ejecutar.
    this.despierta({ clase: 'corte', motivo });
  }

  /**
   * Espera lo siguiente que pase. Si la partida acabó, contesta en el acto.
   *
   * Recoger una petición es quedársela: hasta contestarla, otra escucha sería
   * una respuesta perdida. Por eso se anota aquí y no fuera.
   */
  async espera(): Promise<Aviso> {
    const aviso = await this.esperaInterna();
    // Solo se ANOTA, nunca se limpia desde aquí: soltar la recogida es cosa de
    // quien sabe que ya no vale (`suelta`, `corta`, `fin`). Una escucha que
    // vuelve con un relevo llega después de la que se llevó la petición buena,
    // y con un `else` le borraba a esa su recogida.
    if (aviso.clase === 'peticion') this.recogida = aviso.msg.requestId;
    return aviso;
  }

  private esperaInterna(): Promise<Aviso> {
    if (this.terminada !== null) {
      // Las peticiones que quedaran sin recoger ya no valen: al otro lado no
      // hay nadie esperando su respuesta.
      return Promise.resolve({ clase: 'fin', nota: this.terminada });
    }
    const siguiente = this.pendientes.shift();
    if (siguiente !== undefined) return Promise.resolve({ clase: 'peticion', msg: siguiente });

    return new Promise<Aviso>((resolve) => {
      // Dos esperas a la vez dejarían colgada a la primera para siempre, que es
      // el mismo fallo con otro disfraz. Se la despierta diciéndoselo — como un
      // relevo, que es lo que es, y no como un canal muerto.
      this.despierta({ clase: 'relevo' });
      this.esperando = resolve;
    });
  }

  /** Manda una consulta y espera su respuesta. `enviar` es quien la pone en el cable. */
  consulta(queryId: string, enviar: () => void): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const temporizador = setTimeout(() => {
        this.consultas.delete(queryId);
        reject(
          new Error(
            `la partida no ha respondido a la consulta en ${Math.round(this.plazoConsultaMs / 1000)} s`,
          ),
        );
      }, this.plazoConsultaMs);

      this.consultas.set(queryId, {
        temporizador,
        entregar: (r) => {
          if (r.ok) resolve(r.data);
          else reject(new Error(r.error ?? 'la consulta ha fallado'));
        },
      });

      try {
        enviar();
      } catch (err) {
        // Si no llegó a salir, no puede quedarse esperando una respuesta.
        clearTimeout(temporizador);
        this.consultas.delete(queryId);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /** Respuesta a una consulta. Una que ya no existe se ignora sin ruido. */
  resuelveConsulta(queryId: string, r: RespuestaConsulta): void {
    const enVuelo = this.consultas.get(queryId);
    if (enVuelo === undefined) return;
    clearTimeout(enVuelo.temporizador);
    this.consultas.delete(queryId);
    enVuelo.entregar(r);
  }

  /** Despierta a quien espere. Devuelve si había alguien. */
  private despierta(aviso: Aviso): boolean {
    const resolver = this.esperando;
    if (resolver === null) return false;
    this.esperando = null;
    resolver(aviso);
    return true;
  }
}
