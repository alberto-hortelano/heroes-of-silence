import type { Hex } from '../types.js';

export type Side = 'attacker' | 'defender';

export function otherSide(s: Side): Side {
  return s === 'attacker' ? 'defender' : 'attacker';
}

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
  morale: number;
  luck: number;
  /** Modificadores temporales de hechizos: velocidad extra, etc. */
  speedBonus: number;
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
  | { kind: 'attack'; stack: string; target: string; damage: number; killed: number; retaliation: boolean }
  | { kind: 'shoot'; stack: string; target: string; damage: number; killed: number }
  | { kind: 'wait'; stack: string }
  | { kind: 'defend'; stack: string }
  | { kind: 'cast'; side: Side; spell: string; target?: string; damage?: number; killed?: number }
  | { kind: 'morale'; stack: string; good: boolean }
  | { kind: 'luck'; stack: string; good: boolean }
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
