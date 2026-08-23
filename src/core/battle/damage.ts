/**
 * Fórmula de daño de HoMM2.
 *
 * Cada punto de ataque por encima de la defensa suma un +10 % al daño, hasta
 * +300 %; cada punto de defensa por encima del ataque resta un 2,5 %, hasta
 * -70 %. Las constantes viven aquí y no repartidas por el motor.
 */
import { creature, hasTrait } from '../data.js';
import type { Rng } from '../rng.js';
import type { BattleHero, BattleStack } from './types.js';

export const ATTACK_BONUS_PER_POINT = 0.1;
export const MAX_ATTACK_BONUS = 3.0;
export const DEFENSE_REDUCTION_PER_POINT = 0.025;
export const MAX_DEFENSE_REDUCTION = 0.7;
/** "Defender" sube la defensa efectiva del stack un 20 %. */
export const DEFEND_BONUS = 0.2;

/**
 * Multiplicadores de suerte. En HoMM2 un golpe afortunado dobla el daño; uno
 * desafortunado lo parte por la mitad. Están aquí sueltos porque son justo el
 * número que se querrá tocar al balancear.
 */
export const LUCKY_MULTIPLIER = 2.0;
export const UNLUCKY_MULTIPLIER = 0.5;
/** Probabilidad por punto de moral o suerte (≈1/24, como la serie). */
export const CHANCE_PER_POINT = 1 / 24;

export function effectiveAttack(stack: BattleStack, hero: BattleHero | null): number {
  return creature(stack.creature).attack + (hero?.attack ?? 0);
}

export function effectiveDefense(stack: BattleStack, hero: BattleHero | null): number {
  const base = creature(stack.creature).defense + (hero?.defense ?? 0);
  return stack.defending ? base * (1 + DEFEND_BONUS) : base;
}

/** Multiplicador de daño por la diferencia ataque/defensa. */
export function damageMultiplier(attack: number, defense: number): number {
  if (attack > defense) {
    return 1 + Math.min((attack - defense) * ATTACK_BONUS_PER_POINT, MAX_ATTACK_BONUS);
  }
  if (defense > attack) {
    return 1 - Math.min((defense - attack) * DEFENSE_REDUCTION_PER_POINT, MAX_DEFENSE_REDUCTION);
  }
  return 1;
}

export interface DamageResult {
  readonly damage: number;
  readonly lucky: boolean;
  readonly unlucky: boolean;
}

/** Daño que inflige `attacker` a `defender`, ya con suerte aplicada. */
export function computeDamage(
  attacker: BattleStack,
  attackerHero: BattleHero | null,
  defender: BattleStack,
  defenderHero: BattleHero | null,
  rng: Rng,
  opts: { ranged?: boolean; distance?: number } = {},
): DamageResult {
  const info = creature(attacker.creature);
  const [min, max] = info.damage;
  const roll = rng.int(min, max);
  let base = roll * attacker.count;

  const mult = damageMultiplier(
    effectiveAttack(attacker, attackerHero),
    effectiveDefense(defender, defenderHero),
  );
  base *= mult;

  // Los cruzados hacen daño doble a los no-muertos.
  if (hasTrait(info, 'bane_undead') && hasTrait(creature(defender.creature), 'undead')) {
    base *= 2;
  }

  // Penalización de distancia del tirador: a más de media rejilla, mitad de daño.
  if (opts.ranged === true && (opts.distance ?? 0) > 5) base *= 0.5;

  let lucky = false;
  let unlucky = false;
  if (attacker.luck > 0 && rng.chance(Math.min(attacker.luck, 3) * CHANCE_PER_POINT)) {
    lucky = true;
    base *= LUCKY_MULTIPLIER;
  } else if (attacker.luck < 0 && rng.chance(Math.min(-attacker.luck, 3) * CHANCE_PER_POINT)) {
    unlucky = true;
    base *= UNLUCKY_MULTIPLIER;
  }

  return { damage: Math.max(1, Math.round(base)), lucky, unlucky };
}

/**
 * Aplica `damage` al stack y devuelve cuántos efectivos ha perdido.
 * El daño se come primero al efectivo de arriba, como en la serie.
 */
export function applyDamage(stack: BattleStack, damage: number): number {
  const hp = creature(stack.creature).hp;
  const totalHp = (stack.count - 1) * hp + stack.topHp;
  const remaining = totalHp - damage;
  const before = stack.count;

  if (remaining <= 0) {
    stack.count = 0;
    stack.topHp = 0;
    return before;
  }

  stack.count = Math.ceil(remaining / hp);
  stack.topHp = remaining - (stack.count - 1) * hp;
  return before - stack.count;
}

/** Puntos de vida totales que le quedan a un stack. Útil para la IA. */
export function stackHp(stack: BattleStack): number {
  if (stack.count === 0) return 0;
  return (stack.count - 1) * creature(stack.creature).hp + stack.topHp;
}
