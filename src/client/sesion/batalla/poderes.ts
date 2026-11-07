/**
 * Los poderes de la unidad activa tal como los usa la persona (`PoderesDeLaActiva`),
 * la misma pieza en la partida y la arena; los botones que los pintan, en
 * `batalla/poderes.ts`. Era parte de `sesion/partida.ts` hasta la fase C de la
 * reorganización (07-11-2026).
 */
import { poderBlocker } from '@core/battle/lanzar.js';
import type { PoderId } from '@core/types.js';
import { type LoApuntado, type QuienJuega, unaOElegir } from './apuntado.js';
import { motivoDeLaActiva, motivoExigido } from './control.js';

/**
 * Los poderes de la unidad activa (Curar) tal como los usa la persona:
 * el que espera el clic en un aliado (lo apunta su botón cuando hay más de uno) y
 * qué hace el botón. Común a la partida y la arena (F6 de la tarea del combate en
 * el juego, 19-10-2026: la partida no los usaba). Con el hechizo elegido del libro,
 * es lo apuntado (`ControlDeBatalla.apuntado`): elegir uno suelta el otro. Las
 * frases son del núcleo (`poderBlocker`).
 */
export class PoderesDeLaActiva {
  constructor(
    private readonly dueño: QuienJuega,
    private readonly apuntados: LoApuntado,
  ) {}

  /** El poder que espera aliado, o `null`. */
  get apuntado(): PoderId | null {
    return this.apuntados.de('poder');
  }

  /** Deja el poder `id` esperando aliado (soltando el hechizo), o lo suelta con `null`. */
  apuntar(id: PoderId | null): void {
    if (id === null) this.apuntados.soltar('poder');
    else this.apuntados.apuntar({ kind: 'poder', id });
  }

  /** Por qué la activa no puede usar `id` ahora, o `null` si puede (`poderBlocker`). */
  motivo(id: PoderId): string | null {
    return motivoDeLaActiva(this.dueño.turnoPropio, (b) => poderBlocker(b, id));
  }

  /** Por qué el poder apuntado no vale sobre `targetId`, con la frase del núcleo. */
  rechazo(id: PoderId, targetId: string): string {
    return motivoExigido(
      this.dueño.turnoPropio,
      (b) => poderBlocker(b, id, targetId),
      `«${id}» sobre ${targetId}`,
    );
  }

  /**
   * El botón del poder `id`: con un solo aliado posible lo usa ya; sin ninguno, la
   * barra dice por qué; con varios, lo deja esperando el clic en uno (o lo suelta
   * si ya esperaba).
   */
  usar(id: PoderId): void {
    unaOElegir(
      this.dueño,
      this.dueño.battleLegalActions().filter((a) => a.type === 'power' && a.poder === id),
      {
        esperando: this.apuntado === id,
        esperar: (si) => this.apuntar(si ? id : null),
        motivo: () => this.motivo(id),
        ninguna: 'No hay ningún aliado sobre el que usarlo.',
        pide: 'Elige el aliado sobre el que usarlo: pulsa en uno de los marcados, o Escape para cancelar.',
      },
    );
  }
}
