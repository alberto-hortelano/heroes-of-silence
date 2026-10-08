/**
 * Cuándo vuelve a llamar el espectador y qué partida es la que llega (#104).
 * Puro y sin DOM, como `reproductor.ts`: `main.ts` toca `document` al importarse
 * y lo que vive allí no lo prueba nadie.
 *
 * El espectador no reconectaba solo, y era deliberado: un bucle que reintenta
 * cada 100 ms contra un servidor muerto es peor que no reintentar. Por eso la
 * espera crece (1, 2, 4, 8, 16 y luego 30 s), tiene un tope de intentos, y la
 * barra dice en cada momento cuál es el siguiente y cuánto falta: un
 * «conectando…» inerte no distingue entre reintentar y estar colgado.
 */
import type { SpectatorSnapshotMsg } from '../../server/protocol.js';
import { Reproductor } from './reproductor.js';
import { FINAL_VISIBLE_MS } from './telon.js';

/** La primera espera tras una caída. Un reinicio de `pnpm partida` tarda ~1 s. */
export const PRIMERA_ESPERA_MS = 1_000;
/** Lo más que se espera entre dos intentos: más deja la página dormida tras volver el servidor. */
export const ESPERA_MAXIMA_MS = 30_000;
/**
 * Cuántos intentos seguidos antes de rendirse: 1+2+4+8+16 s y veinte de 30, unos
 * diez minutos y medio. Pasado eso nadie está reiniciando el servidor, y seguir
 * llamando cada 30 s para siempre a una puerta cerrada es ruido en la consola.
 */
export const INTENTOS_MAXIMOS = 25;

/** Lo que se espera antes del intento `n` (el 1 es el primero tras la caída). */
export function esperaAntesDelIntento(n: number): number {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`el intento de reconexión ${n} no existe: se cuentan desde 1`);
  }
  let espera = PRIMERA_ESPERA_MS;
  for (let i = 1; i < n && espera < ESPERA_MAXIMA_MS; i++) espera *= 2;
  return Math.min(espera, ESPERA_MAXIMA_MS);
}

export interface SiguienteIntento {
  /** El número de intento, de 1 a `INTENTOS_MAXIMOS`. */
  readonly intento: number;
  /** Cuándo toca, en el mismo reloj que el `ahora` que se pasó. */
  readonly en: number;
}

/** La cuenta de intentos fallidos seguidos. */
export class Reintentos {
  private fallidos = 0;

  /**
   * El canal se abrió: la próxima caída vuelve a empezar por un segundo. Se
   * cuenta al abrir y no al primer fotograma porque un servidor sin partida
   * todavía (esperando al agente) está vivo y no manda nada en dos minutos.
   */
  conectado(): void {
    this.fallidos = 0;
  }

  /**
   * El canal se cerró, o no llegó a abrirse: cuándo toca el siguiente intento, o
   * `null` si ya se agotaron y hay que dejar de llamar.
   */
  siguiente(ahora: number): SiguienteIntento | null {
    if (this.fallidos >= INTENTOS_MAXIMOS) return null;
    this.fallidos++;
    return { intento: this.fallidos, en: ahora + esperaAntesDelIntento(this.fallidos) };
  }
}

/** Por qué se reintenta, que cambia lo que se le dice a quien mira. */
export type Caida =
  /** Hubo partida y se cortó: lo que se ve es el último fotograma. */
  | 'cortada'
  /** El canal se abrió pero se cerró antes del primer fotograma. */
  | 'antes-de-empezar'
  /** No se llegó a abrir: no hay nadie en ese puerto. */
  | 'nadie';

function motivoDeLaCaida(caida: Caida, url: string): string {
  switch (caida) {
    case 'cortada':
      return `Se ha cortado la conexión con ${url}: lo que se ve es el último fotograma que llegó.`;
    case 'antes-de-empezar':
      return `El servidor de ${url} se ha ido antes de empezar la partida.`;
    case 'nadie':
      return `No hay nadie en ${url}: arranca la partida con \`pnpm partida\` en otra terminal.`;
  }
}

/**
 * La barra mientras se espera al siguiente intento. Los segundos se redondean
 * hacia arriba: «en 0 s» con medio segundo por delante sería mentira.
 */
export function textoDeEspera(
  caida: Caida,
  url: string,
  s: SiguienteIntento,
  ahora: number,
): string {
  const faltan = Math.max(0, Math.ceil((s.en - ahora) / 1000));
  return `${motivoDeLaCaida(caida, url)} Reintento ${s.intento} de ${INTENTOS_MAXIMOS} en ${faltan} s.`;
}

/** La barra mientras el intento está en el aire. */
export function textoDeIntento(caida: Caida, url: string, intento: number): string {
  return `${motivoDeLaCaida(caida, url)} Reintentando (${intento} de ${INTENTOS_MAXIMOS})…`;
}

/** La barra cuando se agotaron los intentos: a partir de aquí, a mano. */
export function textoDeRendicion(caida: Caida, url: string): string {
  return (
    `${motivoDeLaCaida(caida, url)} Se dejó de reintentar tras ${INTENTOS_MAXIMOS} intentos ` +
    '(unos diez minutos): recarga la página cuando el servidor esté arrancado.'
  );
}

// ------------------------------------------------------------ qué partida

/**
 * Cómo encaja el fotograma que llega con lo que ya se mira:
 *  - `primera`: no se miraba nada;
 *  - `misma`: sigue la de antes (un corte de red, o un fotograma más);
 *  - `otra`: el servidor volvió con otra partida, y lo de antes —día, crónica,
 *    la cola del telón, la batalla a medio contar— no es suyo.
 */
export type Reconocimiento = 'primera' | 'misma' | 'otra';

export function reconocerPartida(mirada: string | null, llegada: string): Reconocimiento {
  if (mirada === null) return 'primera';
  return mirada === llegada ? 'misma' : 'otra';
}

/**
 * El id de partida de un mensaje del cable, o el motivo de que no lo traiga.
 * Un servidor de antes de #104 no lo manda, y sin él no hay forma de saber si lo
 * que llega tras reconectar es la misma partida: se dice en vez de suponerlo.
 */
export function partidaDelMensaje(msg: object): string {
  const id = (msg as { partida?: unknown }).partida;
  if (typeof id !== 'string' || id === '') {
    throw new Error(
      'el fotograma no dice de qué partida es (falta "partida"): el servidor es anterior ' +
        'a este espectador; reinícialo con `pnpm partida`',
    );
  }
  return id;
}

/** Los ocho primeros caracteres del id: bastan para distinguir dos partidas a ojo. */
export function partidaCorta(id: string): string {
  return id.slice(0, 8);
}

/**
 * Lo que se mira: de qué partida es y el reproductor que la pone. Juntos porque
 * cambiar de partida es cambiar de reproductor, y separados se olvidaba uno.
 *
 * Un reproductor nuevo y no vaciar el viejo: lo que hay que soltar es todo lo
 * suyo —la cola del telón con fotogramas de la vieja, el animador a medio
 * contar su batalla, el número de batalla—, y uno recién hecho es la única
 * forma de no dejarse nada.
 */
export class Mirada {
  private actual: string | null = null;
  private sustituida: string | null = null;
  private rep: Reproductor;

  constructor(private readonly minimo = FINAL_VISIBLE_MS) {
    this.rep = new Reproductor(minimo);
  }

  /**
   * Llega un fotograma. Se reconoce AL LLEGAR y no al ponerlo: lo que espera en
   * la cola del telón es de la partida vieja y no se tiene que ver ni uno más.
   */
  llega(f: SpectatorSnapshotMsg): Reconocimiento {
    const cual = reconocerPartida(this.actual, f.partida);
    if (cual === 'otra') {
      this.sustituida = this.actual;
      this.rep = new Reproductor(this.minimo);
    }
    this.actual = f.partida;
    this.rep.llega(f);
    return cual;
  }

  get reproductor(): Reproductor {
    return this.rep;
  }

  /** La partida que se mira, o `null` si todavía ninguna. */
  get partida(): string | null {
    return this.actual;
  }

  /** La partida a la que sustituyó la de ahora, o `null` si es la primera. */
  get anterior(): string | null {
    return this.sustituida;
  }
}
