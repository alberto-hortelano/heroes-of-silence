/**
 * El telón del espectador: en qué orden y a qué ritmo se ponen en pantalla los
 * fotogramas del cable. Puro, sin DOM, y por eso con tests.
 *
 * El director emite un fotograma por **acción aplicada** (`director.ts`), y con
 * un agente rápido llegan en ráfaga: una batalla entera en unos 40 ms. Cada
 * fotograma es el estado entero, así que la tentación es aplicar el último y
 * tirar el resto. Eso es lo que hacía la primera versión de este telón, y tenía
 * dos fallos que encontró la segunda pasada de QA de la fase 1b (H-7):
 *
 *  - el animador recibía la batalla entera **en el fotograma final** y la contaba
 *    desde el principio, ~520 ms por paso, mientras el panel —que lee el estado—
 *    ya decía «Fin: gana el atacante» y el tablero enseñaba muertos de pie con la
 *    barra vacía;
 *  - y como cada final se retenía DESPUÉS de esa repetición, el espectador
 *    acumulaba retraso: enseñaba el fin de la partida 22 s después del
 *    `game_over` del servidor.
 *
 * Ahora la cola se consume **fotograma a fotograma**: el siguiente no se aplica
 * hasta que el animador ha contado lo que trajo el anterior. Lo que se queda
 * atrás no se salta: se cuenta **más deprisa** (`ritmoDeReproduccion`). Y el
 * final de cada batalla se sigue reteniendo con el tablero ya quieto, que es lo
 * que arregló H-3: `FINAL_VISIBLE_MS` al día, y **comprimido al mismo ritmo**
 * cuando va atrasado (`retencionDelFinal`).
 *
 * Lo segundo vino con los asaltantes: las emboscadas son batallas del agente, y
 * con cuatro finales de 2,5 s enteros el espectador enseñaba el fin de la
 * partida 22,6 s después del `game_over` —diez de ellos, finales quietos—. Un
 * final que se cuenta deprisa porque llega tarde se retiene deprisa por lo
 * mismo: el atraso no se arregla acelerando los golpes y parando igual de largo
 * entre batallas.
 */

import type { SpectatorSnapshotMsg } from '../../server/protocol.js';
import type { BatallaEnCable } from '../../server/vista-espectador.js';

/** Cuánto se deja quieto el final de una batalla, ya contado, antes del mapa. */
export const FINAL_VISIBLE_MS = 2500;

export class TelonDeBatalla<F> {
  private readonly cola: F[] = [];
  private actual: F | null = null;
  /** Desde cuándo el final está a la vista con el animador ya quieto. */
  private quietoDesde: number | null = null;

  /**
   * @param terminada si el fotograma trae una batalla terminada.
   * @param minimo cuánto se retiene ese final, en ms.
   */
  constructor(
    private readonly terminada: (f: F) => boolean,
    private readonly minimo = FINAL_VISIBLE_MS,
  ) {}

  /** Llega un fotograma del cable. No se aplica aquí: lo decide `avanzar`. */
  llega(f: F): void {
    this.cola.push(f);
  }

  /** Si queda algo por aplicar: mientras sí, hay que seguir pidiendo fotogramas. */
  get pendiente(): boolean {
    return this.cola.length > 0;
  }

  /** Cuántos fotogramas esperan detrás del que se ve: lo que se va retrasando. */
  get atrasados(): number {
    return this.cola.length;
  }

  /**
   * El siguiente fotograma, si toca ponerlo ya; `null` si no.
   *
   * Uno como mucho por llamada, nunca un salto. `ocupado` es si el animador
   * todavía cuenta lo que trajo el anterior: mientras sí, no entra nada, porque
   * el que entrara cambiaría el tablero —y el panel— debajo de un golpe que aún
   * no ha terminado. Y si lo que se ve es el final de una batalla, además se deja
   * quieto `minimo` ms contados desde que el animador acabó: retener un tablero
   * que aún se mueve no enseñaría el final, enseñaría el penúltimo paso.
   */
  avanzar(ahora: number, ocupado: boolean): F | null {
    if (ocupado) {
      this.quietoDesde = null;
      return null;
    }
    if (this.cola.length === 0) return null;
    if (this.actual !== null && this.terminada(this.actual)) {
      if (this.quietoDesde === null) this.quietoDesde = ahora;
      if (ahora - this.quietoDesde < retencionDelFinal(this.minimo, this.cola.length)) return null;
    }
    const siguiente = this.cola.shift() as F;
    this.actual = siguiente;
    this.quietoDesde = null;
    return siguiente;
  }
}

/**
 * Cuánto se retiene un final con `enCola` fotogramas esperando detrás: `minimo`
 * dividido por el ritmo de lo que espera **detrás del siguiente**. El siguiente
 * no cuenta como atraso —llega siempre enseguida, con un agente rápido— y si
 * contara, ningún final se vería nunca entero. Con uno o ninguno detrás, el
 * mínimo entero; con una cola, una fracción, nunca menos de `minimo /
 * RITMO_MAXIMO` (≈ 208 ms con el de hoy): se ve, pero no para la partida.
 */
export function retencionDelFinal(minimo: number, enCola: number): number {
  return minimo / ritmoDeReproduccion(Math.max(0, enCola - 1));
}

/** Si el fotograma del cable trae una batalla ya terminada: lo que el telón retiene. */
export function batallaTerminada(f: SpectatorSnapshotMsg): boolean {
  return f.view.battle !== null && f.view.battle.estado.finished !== null;
}

/**
 * A qué ritmo se cuenta la batalla según cuántos fotogramas esperan detrás.
 *
 * Al día: 1, el ritmo normal. Con la cola creciendo, se acelera en proporción,
 * hasta `RITMO_MAXIMO`: a ×12 un paso de 520 ms dura 43 ms, menos de tres
 * fotogramas de pantalla; por encima, un golpe dejaría de verse como golpe. Se
 * acelera en vez de saltar fotogramas porque saltar es exactamente lo que dejaba
 * al animador sin el orden de la batalla.
 *
 * Los números están medidos con la política de `pnpm qa` (ver
 * `docs/agents/2026-10-01-telon-del-espectador/implementacion.md`), no
 * elegidos a ojo.
 */
export const RITMO_MAXIMO = 12;
export function ritmoDeReproduccion(atrasados: number): number {
  if (!Number.isInteger(atrasados) || atrasados < 0) {
    throw new Error(`no se puede ir atrasado ${atrasados} fotogramas: es un recuento`);
  }
  return Math.min(RITMO_MAXIMO, 1 + atrasados);
}

/**
 * Si `nueva` es la misma batalla que `anterior`, o ya es otra.
 *
 * El animador necesita saberlo para empezar de cero —posiciones de ahora, sin
 * caídas— y cada fotograma trae la batalla recién parseada, así que el objeto
 * no sirve. Antes se contaba «aparece una batalla después de no haber ninguna»,
 * y eso dependía de que entre dos batallas llegara un fotograma de mapa: con la
 * cola soltándose de golpe, dos batallas seguidas en la misma ráfaga se habrían
 * contado como una, y la segunda se animaba con las posiciones y las caídas de
 * la primera (riesgo que leyó QA en H-7).
 *
 * Se deriva del contenido y no del orden: es la misma si **el registro nuevo
 * empieza por el viejo entero** y los stacks son los mismos. Una batalla
 * terminada ya no crece, así que lo que llegue después con más registro es otra.
 */
export function mismaBatalla(anterior: BatallaEnCable | null, nueva: BatallaEnCable): boolean {
  if (anterior === null) return false;
  if (nueva.log.length < anterior.log.length) return false;
  if (anterior.finished !== null && nueva.log.length !== anterior.log.length) return false;
  if (nueva.stacks.length !== anterior.stacks.length) return false;
  for (let i = 0; i < anterior.stacks.length; i++) {
    if (nueva.stacks[i]?.id !== anterior.stacks[i]?.id) return false;
  }
  for (let i = 0; i < anterior.log.length; i++) {
    if (JSON.stringify(nueva.log[i]) !== JSON.stringify(anterior.log[i])) return false;
  }
  return true;
}
