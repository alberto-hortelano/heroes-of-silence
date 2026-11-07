/**
 * Las opciones puras del daño de un golpe: **la única forma de montarlas**,
 * `opcionesDeDanio` (lo alto de un muro y, con la rueda, el cruce, `conElGolpe`), que
 * usan el golpe, el disparo, la IA y la previsión; el golpe de la rueda para el daño
 * (`GolpeEnLaRueda`, `enElPunto`, `delSector`, `papelDe`), las cifras de la rueda del
 * intercambio (`ruedaDelIntercambio`), el efecto que deja un golpe de la rueda
 * (`deLaRueda`) y el que deja el rasgo de quien pega (`ON_HIT_EFFECTS`), y el ataque y
 * la defensa con que pelea un stack ahora, para la ficha (`ataqueYDefensaEnBatalla`).
 * Nada de aquí cambia la batalla: el golpe en marcha (`melee`, `strike`) es del motor
 * (`battle.ts`).
 *
 * Vivía en `battle.ts` hasta la fase N de la reorganización (07-11-2026).
 */
import type { CreatureTrait, TipoDeGolpe, UnitInfo, UsoDeArma } from '../types.js';
import { ruedaDelGolpe } from './armas.js';
import type { CifrasDeLaRueda, PapelEnLaRueda, Punto } from './cifras-de-la-rueda.js';
import { ataqueYDefensa, type DamageOptions } from './damage.js';
import { type FormaDeLaRueda, formaDeLaBatalla } from './formas-de-la-rueda.js';
import { bonoEnLoAlto } from './muralla.js';
import { cruceDelGolpe, type EfectoDeLaRueda, puntosDe } from './rueda.js';
import type { BattleStack, BattleState, StackEffect } from './types.js';

/**
 * Un golpe de la rueda para el daño: su tipo y los puntos del cruce en que puede
 * caer. Quién lo eligió (el golpe, o la respuesta en el contraataque, que no da
 * bonificadores) no va aquí: se deriva de si es un contraataque (`papelDe`).
 */
export interface GolpeEnLaRueda {
  readonly tipo: TipoDeGolpe;
  readonly desde: Punto;
  readonly hasta: Punto;
}

/** El golpe que se da: cae en un solo punto, el del cruce. */
export function enElPunto(tipo: TipoDeGolpe, punto: Punto): GolpeEnLaRueda {
  return { tipo, desde: punto, hasta: punto };
}

/** Lo que puede dar un sector de la rueda `forma` sin saber el cruce: sus puntos posibles. */
export function delSector(tipo: TipoDeGolpe, forma: FormaDeLaRueda): GolpeEnLaRueda {
  const [desde, hasta] = puntosDe(tipo, forma);
  return { tipo, desde, hasta };
}

/** Quién eligió el golpe de la rueda de un intercambio: la respuesta, si es el contraataque. */
export function papelDe(retaliation: boolean): PapelEnLaRueda {
  return retaliation ? 'respuesta' : 'golpe';
}

/**
 * Las cifras de la rueda del intercambio de `quien`: las de su arma de cuerpo a
 * cuerpo (`arma`), la única que golpea en la rueda (la lanza solo suma su ataque y
 * su fuerza en la carga). Lo que no es daño —Defensivo antes de golpear, Romper
 * guardia y la Finta después— se cuelga una vez por intercambio y va con ella. Lo
 * leen el golpe (`melee`, una vez), las dos previsiones y el daño de cada golpe
 * (`conElGolpe`).
 */
export function ruedaDelIntercambio(quien: BattleStack): CifrasDeLaRueda {
  return ruedaDelGolpe(quien.unit, 'arma');
}

/**
 * El `StackEffect` de un efecto de la rueda colgado ahora: lo leen el golpe
 * (`colgarDeLaRueda`) y la previsión del contraataque, que lo cuelga en su copia.
 */
export function deLaRueda(state: BattleState, efecto: EfectoDeLaRueda): StackEffect {
  const n = state.turno?.n;
  if (n === undefined) throw new Error('la rueda cuelga un efecto sin turno abierto');
  return {
    kind: efecto.kind,
    amount: efecto.amount,
    // El tipo con que se golpeó: con la de 7, el de siempre; con un fusionado, él
    // (el parte lo nombra como la rueda de la batalla).
    source: efecto.fuente,
    roundsLeft: 2,
    hasta: { turno: n, al: efecto.vence },
  };
}

/** El miedo (`fear`): ataque −2 durante 2 rondas. Ver la nota de la tabla. */
const FEAR_ATTACK_PENALTY = -2;
const FEAR_ROUNDS = 2;

/**
 * Lo que un golpe deja pegado al objetivo, según el rasgo de quien pega. El
 * segundo rasgo de este tipo es una fila más, no otro bloque igual al de al
 * lado (la maldición de la momia se fue con la suerte, 02-11-2026).
 *
 * Está aquí y no en `effects.ts` a propósito: el libro mayor de efectos no
 * tiene por qué saber que existe un dragón. Y se puede compartir
 * entre golpes porque `applyEffect` guarda una copia; si guardara este objeto,
 * `tickEffects` le iría bajando el `roundsLeft` hasta que el miedo no durase
 * nada.
 */
export const ON_HIT_EFFECTS: readonly { trait: CreatureTrait; effect: StackEffect }[] = [
  // DIVERGENCIA DELIBERADA de fheroes2, decidida por el usuario: allí `fear` es
  // un aura de moral −1. Aquí no serviría de nada, porque `createBattle` fuerza
  // `morale: 0` a los no-muertos y el nigromante entero lo es: en un espejo
  // nigromante el rasgo quedaría medio muerto, que es justo el bug que se está
  // cerrando. Muerde por el ataque, que sí pasa por `effectiveAttack` y sí
  // siente un esqueleto.
  {
    trait: 'fear',
    effect: {
      kind: 'attack',
      amount: FEAR_ATTACK_PENALTY,
      roundsLeft: FEAR_ROUNDS,
      source: 'fear',
    },
  },
];

/**
 * Las opciones del daño de un golpe de `attacker` a `target` en esta batalla: lo
 * que trae el golpe (`extra`), lo alto de un muro y, con `golpe`, la rueda. Es la
 * ÚNICA forma de montarlas: la usan el golpe, el disparo, la IA y la
 * previsión.
 */
export function opcionesDeDanio(
  state: BattleState,
  attacker: BattleStack,
  target: BattleStack,
  extra: Omit<DamageOptions, ExtraDelEstado> = SIN_EXTRA,
  golpe: GolpeEnLaRueda | null = null,
  papel: PapelEnLaRueda = 'golpe',
): DamageOptions {
  const o = opcionesDelEstado(state, target, extra);
  return golpe === null ? o : conElGolpe(o, attacker.unit, golpe, papel, formaDeLaBatalla(state));
}

/**
 * Las opciones con la rueda: la única traducción del golpe a los números del
 * daño (`cruceDelGolpe`), con las cifras del arma de cuerpo a cuerpo de `quien`
 * (`ruedaDelIntercambio`: la rueda es solo del cuerpo a cuerpo). La previsión de
 * la rueda la pide sobre las mismas opciones para cada tipo, con el papel de quien
 * elige y las cifras que ya contó (`c`); el golpe, con el que le da `papelDe`.
 */
export function conElGolpe(
  o: DamageOptions,
  quien: UnitInfo,
  golpe: GolpeEnLaRueda,
  papel: PapelEnLaRueda,
  forma: FormaDeLaRueda,
  c: CifrasDeLaRueda = ruedaDelGolpe(quien, 'arma'),
): DamageOptions {
  return { ...o, cruce: cruceDelGolpe(golpe.tipo, golpe.desde, golpe.hasta, papel, c, forma) };
}

function opcionesDelEstado(
  state: BattleState,
  target: BattleStack,
  extra: Omit<DamageOptions, ExtraDelEstado>,
): DamageOptions {
  // Lo alto de un muro (`bonoEnLoAlto`) también sale del estado: así lo cuentan
  // a la vez el golpe, el disparo, la IA, la ficha y la previsión.
  const alto = bonoEnLoAlto(state, target);
  // La IA pide estas cientos de veces por decisión, casi siempre sin nada más:
  // entonces, siempre el mismo objeto.
  if (alto === 0) return extra;
  return { ...extra, bonoEnLoAlto: alto };
}

/**
 * Lo de `DamageOptions` que no se pide: lo pone `opcionesDeDanio` desde el estado
 * y, el `cruce`, desde el golpe de la rueda.
 */
export type ExtraDelEstado = 'bonoEnLoAlto' | 'cruce';

export const SIN_EXTRA: Omit<DamageOptions, ExtraDelEstado> = Object.freeze({});

/**
 * El ataque y la defensa con que pelea `s` ahora, para la ficha: los de
 * `ataqueYDefensa`, la cuenta del golpe, con `s` a los dos lados —su ataque al
 * pegar con el arma de `uso` (la de cuerpo a cuerpo si no se dice) y su defensa
 * al recibir—.
 */
export function ataqueYDefensaEnBatalla(
  state: BattleState,
  s: BattleStack,
  uso: UsoDeArma = 'arma',
): { readonly ataque: number; readonly defensa: number } {
  return ataqueYDefensa(s, s, opcionesDeDanio(state, s, s), uso);
}
