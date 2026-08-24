/**
 * Efectos temporales sobre un stack: lo que dura unas rondas y luego se va.
 *
 * Es un libro mayor y nada más: no sabe qué criaturas existen, qué rasgo pone
 * cada efecto ni quién es inmune a qué —eso son reglas del juego y las decide
 * `battle.ts`—, así que solo importa `./types.js`.
 *
 * La regla que lo sostiene todo: **un efecto no se revierte, se filtra**. El
 * stack nunca guarda un bono ya sumado; la lista es la única verdad y el total
 * se calcula al leer (`stackSpeed`, `effectiveLuck`, `effectiveAttack`).
 * Caducar es entonces quitar de una lista, y quitar de una lista no puede
 * descuadrar nada — que es justo lo que pasaba antes, cuando `spells.ts` sumaba
 * a `speedBonus` y nadie restaba nunca: una Lentitud de la ronda 1 duraba toda
 * la batalla.
 *
 * Y la segunda regla, la de acumulación: **el mismo origen refresca, no
 * apila** (ver `applyEffect`). De orígenes distintos sí se suman, y el recorte
 * a [−3,+3] se hace al leer, así que tres Maldiciones y una Bendición componen
 * sin depender del orden en que se aplicaron.
 */
import type { BattleStack } from './types.js';

/**
 * Los tipos de efecto que existen. Es una lista de valores y no solo un tipo
 * porque `test/invariantes.test.ts` la recorre para exigir que cada uno tenga
 * quien lo lea: `effectiveDefense` (`damage.ts`) NO llama a `effectTotal`, así
 * que el día que se añada un `'defense'` aquí el efecto se colgaría del stack y
 * no lo leería nadie. El guardia lo pilla en rojo antes de que llegue a
 * partida. Mismo patrón que `CREATURE_TRAITS` en `types.ts`.
 */
export const EFFECT_KINDS = ['speed', 'luck', 'attack'] as const;

export type EffectKind = (typeof EFFECT_KINDS)[number];

export interface StackEffect {
  readonly kind: EffectKind;
  readonly amount: number;
  /** Quién lo puso: el id del hechizo ('slow') o el del rasgo ('fear'). */
  readonly source: string;
  /** Rondas que le quedan. Baja una en cada `beginRound`. */
  roundsLeft: number;
}

/** Moral y suerte se mueven entre −3 y +3 (`CLAUDE.md`, tabla de reglas). */
const MIN_MORALE_LUCK = -3;
const MAX_MORALE_LUCK = 3;

/**
 * Recorta a la horquilla de moral y suerte. La regla vive aquí y no repartida
 * en pares de números sueltos por el motor: quien la lea al montar la batalla
 * y quien la lea al tirar el dado tienen que decir lo mismo.
 */
export function clampMoraleLuck(n: number): number {
  return Math.max(MIN_MORALE_LUCK, Math.min(MAX_MORALE_LUCK, n));
}

/**
 * Cuelga el efecto del stack y devuelve el que queda vivo.
 *
 * **Política de acumulación: el mismo origen refresca, no apila.** Sin ella,
 * dos mordiscos seguidos del dragón óseo dejaban −4 de ataque sostenido y una
 * Lentitud lanzada cada ronda iba a −2, −4, −6. La suerte y la moral lo
 * disimulaban porque se recortan al leer; la velocidad y el ataque no, así que
 * cada consumidor estaba tomando esta decisión por accidente. Se conserva la
 * duración mayor: refrescar alarga, nunca acorta, que es lo del original.
 *
 * Guarda una **copia**: `roundsLeft` es mutable y `tickEffects` lo baja cada
 * ronda, así que quedarse con el objeto de quien llama iría gastando una tabla
 * de constantes como `ON_HIT_EFFECTS` hasta que el miedo dejara de durar.
 */
export function applyEffect(stack: BattleStack, effect: StackEffect): StackEffect {
  const previo = mismoOrigen(stack, effect);
  const nuevo: StackEffect = {
    ...effect,
    roundsLeft: Math.max(effect.roundsLeft, previo?.roundsLeft ?? 0),
  };
  stack.effects = [...stack.effects.filter((e) => e !== previo), nuevo];
  return nuevo;
}

/** El efecto vivo que este refrescaría: mismo tipo y mismo origen. */
function mismoOrigen(
  stack: BattleStack,
  effect: Pick<StackEffect, 'kind' | 'source'>,
): StackEffect | undefined {
  return stack.effects.find((e) => e.kind === effect.kind && e.source === effect.source);
}

/**
 * Rondas que le quedan al efecto que este refrescaría, o 0 si no lleva ninguno.
 *
 * Es la cara de lectura de `applyEffect`, y usa su misma función para decidir
 * cuál es «el mismo»: quien valora un lanzamiento tiene que saber que relanzar
 * sobre un objetivo que ya lo tiene solo compra la diferencia de rondas, porque
 * el mismo origen REFRESCA y no apila. Sin esto la IA pagaba cada ronda el
 * precio del primer lanzamiento.
 */
export function roundsLeftOf(
  stack: BattleStack,
  effect: Pick<StackEffect, 'kind' | 'source'>,
): number {
  return mismoOrigen(stack, effect)?.roundsLeft ?? 0;
}

/** Lo que suman todos los efectos vivos de ese tipo. */
export function effectTotal(stack: BattleStack, kind: EffectKind): number {
  let total = 0;
  for (const e of stack.effects) if (e.kind === kind) total += e.amount;
  return total;
}

export function effectiveLuck(stack: BattleStack): number {
  return clampMoraleLuck(stack.luck + effectTotal(stack, 'luck'));
}

/**
 * Descuenta una ronda a cada efecto y devuelve los que acaban de caducar.
 * Un efecto de N rondas lanzado en la ronda R vive de la R a la R+N−1.
 */
export function tickEffects(stack: BattleStack): StackEffect[] {
  const caducados: StackEffect[] = [];
  const vivos: StackEffect[] = [];
  for (const e of stack.effects) {
    e.roundsLeft -= 1;
    if (e.roundsLeft > 0) vivos.push(e);
    else caducados.push(e);
  }
  stack.effects = vivos;
  return caducados;
}
