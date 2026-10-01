/**
 * El telón del final de una batalla: puro, sin DOM, y por eso con tests.
 *
 * El director emite el fotograma de la batalla terminada y, **en el mismo tic**,
 * el del mapa ya liquidado: aplica la última acción, emite, reparte las
 * consecuencias y vuelve a emitir (`director.ts`). Los dos llegaban seguidos por el cable, el segundo pisaba al
 * primero antes del siguiente `requestAnimationFrame`, y el espectador **no
 * pintaba nunca el final**: ni «Se rinde el atacante por N de oro» ni «Fin: gana
 * el defensor», ni el último golpe en el tablero (H-3 de la QA de la fase 1b).
 *
 * Se arregla aquí y no frenando al servidor: el servidor no sabe si alguien
 * mira, y un agente no tiene por qué esperar a una pantalla. Lo que llega se
 * encola, y en cuanto se aplica un fotograma con la batalla terminada la cola se
 * para hasta que el animador ha contado todo lo que quedaba **y** el final lleva
 * `FINAL_VISIBLE_MS` a la vista. Luego sigue, y lo que se acumuló detrás se
 * aplica de golpe, como antes: cada fotograma del cable es el estado entero.
 */

import type { SpectatorSnapshotMsg } from '../../server/protocol.js';

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

  /**
   * Lo que toca aplicar en este instante, o `null` si nada cambia.
   *
   * `ocupado` es si el animador todavía cuenta algo: el reloj del final no
   * empieza hasta que se ha visto el último golpe, porque retener un tablero que
   * aún se está moviendo no enseñaría el final, enseñaría el penúltimo paso.
   */
  avanzar(ahora: number, ocupado: boolean): F | null {
    let aplicado: F | null = null;
    while (this.cola.length > 0) {
      const siguiente = this.cola[0] as F;
      if (this.reteniendo(ahora, ocupado) && !this.terminada(siguiente)) break;
      this.cola.shift();
      // Un final que sustituye a otro final (el mismo, repetido) no reinicia el
      // reloj: solo lo arranca el primero.
      if (!(this.actual !== null && this.terminada(this.actual) && this.terminada(siguiente))) {
        this.quietoDesde = null;
      }
      this.actual = siguiente;
      aplicado = siguiente;
      // El final recién aplicado lo tiene que ver el animador antes de seguir:
      // se para aquí aunque la cola traiga más detrás.
      if (this.terminada(siguiente)) break;
    }
    return aplicado;
  }

  private reteniendo(ahora: number, ocupado: boolean): boolean {
    if (this.actual === null || !this.terminada(this.actual)) return false;
    if (ocupado) {
      this.quietoDesde = null;
      return true;
    }
    if (this.quietoDesde === null) this.quietoDesde = ahora;
    return ahora - this.quietoDesde < this.minimo;
  }
}

/** Si el fotograma del cable trae una batalla ya terminada: lo que el telón retiene. */
export function batallaTerminada(f: SpectatorSnapshotMsg): boolean {
  return f.view.battle !== null && f.view.battle.estado.finished !== null;
}
