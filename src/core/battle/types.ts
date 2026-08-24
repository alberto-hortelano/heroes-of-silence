import type { Hex } from '../types.js';
import type { EffectKind, StackEffect } from './effects.js';

export type Side = 'attacker' | 'defender';

/**
 * Los dos bandos, para recorrerlos.
 *
 * Estaba escrito a mano en tres sitios —el motor, el director y la consulta de
 * batalla—, que es una lista de dos elementos hasta el día que alguien añada un
 * tercer bando y solo actualice dos.
 */
export const SIDES: readonly Side[] = ['attacker', 'defender'];

/** Un stack dentro de una batalla. Mutable: el motor lo modifica en sitio. */
export interface BattleStack {
  readonly id: string;
  readonly side: Side;
  /** Slot de origen en el ejército (0..4), para desempatar la iniciativa. */
  readonly slot: number;
  readonly creature: string;
  /** Efectivos vivos. 0 = destruido. */
  count: number;
  /** HP restante del efectivo de arriba; el resto están intactos. */
  topHp: number;
  /** Hex de cabeza. Las unidades grandes ocupan también el de detrás. */
  hex: Hex;
  shotsLeft: number;
  /** Ya contraatacó en esta ronda. */
  retaliated: boolean;
  defending: boolean;
  /** Pasó el turno con "esperar" y actuará al final de la ronda. */
  waited: boolean;
  /** Ya consumió su turno en esta ronda. */
  acted: boolean;
  /** Ya recibió un turno extra por moral alta en esta ronda. */
  gotMoraleBonus: boolean;
  /** Moral (héroe, diversidad de facción, edificios), ya recortada a [−3,+3]
   * al montar la batalla: quien la lee para tirar el dado no tiene que volver
   * a recortarla. Hoy nada la altera temporalmente; si algo lo hiciera, iría
   * en `effects` y se sumaría al leer, como la suerte — nunca escribiendo
   * aquí, que es el bug que cerró #9. */
  morale: number;
  /** Suerte BASE. Los hechizos y los rasgos no la tocan: lo suyo va en
   * `effects` y se suma al leer con `effectiveLuck`. */
  luck: number;
  /** Lo temporal: prisa, lentitud, maldición, miedo. Caduca en `beginRound`. */
  effects: StackEffect[];
}

/** El héroe que dirige un bando. Sus atributos suman a todas sus criaturas. */
export interface BattleHero {
  readonly name: string;
  readonly attack: number;
  readonly defense: number;
  readonly spellPower: number;
  readonly knowledge: number;
  mana: number;
  /** Ya lanzó su hechizo de esta ronda. */
  castThisRound: boolean;
  readonly spells: readonly string[];
}

export type BattleEvent =
  | { kind: 'round_start'; round: number }
  | { kind: 'move'; stack: string; to: Hex }
  | { kind: 'attack'; stack: string; target: string; damage: number; killed: number; retaliation: boolean; charge?: number }
  | { kind: 'shoot'; stack: string; target: string; damage: number; killed: number; splash?: boolean }
  | { kind: 'wait'; stack: string }
  | { kind: 'defend'; stack: string }
  | { kind: 'cast'; side: Side; spell: string; target?: string; damage?: number; killed?: number }
  | { kind: 'morale'; stack: string; good: boolean }
  | { kind: 'luck'; stack: string; good: boolean }
  | { kind: 'effect'; stack: string; effect: EffectKind; amount: number; source: string; rounds: number }
  | { kind: 'effect_end'; stack: string; source: string }
  | { kind: 'immune'; stack: string; source: string }
  | { kind: 'perished'; stack: string }
  | { kind: 'finished'; winner: Side };

export interface BattleState {
  round: number;
  stacks: BattleStack[];
  /** Ids en orden de iniciativa pendientes de actuar en esta ronda. */
  queue: string[];
  activeId: string | null;
  heroes: Record<Side, BattleHero | null>;
  log: BattleEvent[];
  finished: { winner: Side } | null;
}

export type BattleAction =
  | { type: 'move'; to: Hex }
  /** Mueve (si hace falta) hasta `from` y golpea a `target`. */
  | { type: 'attack'; target: string; from?: Hex }
  | { type: 'shoot'; target: string }
  | { type: 'wait' }
  | { type: 'defend' }
  | { type: 'cast'; spell: string; target?: string };
