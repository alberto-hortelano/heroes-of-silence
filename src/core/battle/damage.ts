/**
 * La fórmula del daño.
 *
 * Cada punto de ataque por encima de la defensa suma un +10 % al daño, hasta
 * +300 %; cada punto de defensa por encima del ataque resta un 2,5 %, hasta
 * -70 %. Es la nuestra, no la de HoMM2 ni la de fheroes2 (que resta un 5 % hasta
 * −80 %): la de fheroes2 se juega en la arena con el interruptor (b) y está en
 * `multiplicadorFheroes2`. Las constantes viven aquí y no repartidas por el motor.
 */
import { hasTrait, isShooter } from '../data.js';
import type { Rng } from '../rng.js';
import { conComa } from '../types.js';
import { efectoDeTirada, effectiveLuck, effectTotal, type StackEffect } from './effects.js';
import type { ReglasDeBatalla } from './reglas.js';
import type { BattleStack } from './types.js';

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

/**
 * Carga: cada hex recorrido antes de golpear suma un 10 % de daño, con tope
 * en cinco hexes (+50 %). La caballería que arranca de lejos pega más que la
 * que ya estaba pegada al enemigo, que es de lo que va el rasgo.
 */
export const CHARGE_BONUS_PER_HEX = 0.1;
export const MAX_CHARGE_HEXES = 5;

/**
 * Las casillas de carga que se COBRAN de una recta de `casillas`: el tope, y
 * nada más. Cuándo hay recta lo dice `cargaDesde` (`battle.ts`); esto es lo que
 * vale, y lo leen el golpe y el anuncio (`casillasDeCarga`), así que un «»7»
 * pintado no puede acabar cobrando 5.
 */
export function cargaEfectiva(casillas: number): number {
  return Math.min(casillas, MAX_CHARGE_HEXES);
}

/**
 * El ataque con el que pega un stack: el suyo y sus efectos, sin héroe
 * (`BattleHero` cuenta por qué). Los efectos de `attack` son los que mete el
 * miedo del dragón óseo.
 */
export function effectiveAttack(stack: BattleStack): number {
  return stack.unit.attack + effectTotal(stack, 'attack');
}

/**
 * La defensa con la que se recibe un golpe: la suya, más lo que se le suma
 * (`extra`: lo de su héroe con el interruptor (f) en fheroes2, 0 en el juego, y
 * lo de estar en lo alto de un muro, `bonoEnLoAlto`), y el bono de defender
 * encima de todo.
 *
 * Defender, con el interruptor (d) en fheroes2, no suma nada: allí `SKIP` solo
 * marca la unidad como movida y que no le toque la moral (`defend` en
 * `battle.ts` cuenta la otra mitad), y no hay ningún bono de defensa que lea
 * `TR_SKIP`:
 *
 * ```cpp
 *     unit->SetModes( TR_SKIP );
 *     unit->SetModes( TR_MOVED );
 * ```
 * https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_action.cpp#L699-L700
 */
export function effectiveDefense(stack: BattleStack, reglas: ReglasDeBatalla, extra = 0): number {
  const base = stack.unit.defense + extra;
  return defiendeConBono(stack, reglas) ? base * (1 + DEFEND_BONUS) : base;
}

/**
 * ¿Le suma algo a `stack` estar defendiendo? Con la regla nuestra, sí; con la de
 * fheroes2, nunca. La leen la defensa (`effectiveDefense`) y su rótulo en la
 * previsión, que así no vuelve a decidir la regla.
 */
function defiendeConBono(stack: BattleStack, reglas: ReglasDeBatalla): boolean {
  return stack.defending && reglas.defender === 'nuestra';
}

/**
 * El ataque de quien pega y la defensa de quien recibe, ya finales: sus cifras,
 * sus efectos, lo de su héroe con el interruptor (f) (`opts`, de
 * `opcionesDeDanio`) y el bono de defender. El único cálculo: lo cuentan el golpe
 * (`applyModifiers`) y la ficha (`ataqueYDefensaEnBatalla`, `battle.ts`).
 */
export function ataqueYDefensa(
  attacker: BattleStack,
  defender: BattleStack,
  opts: DamageOptions,
): { readonly ataque: number; readonly defensa: number } {
  return {
    ataque: effectiveAttack(attacker) + (opts.ataqueDelMando ?? 0),
    defensa: effectiveDefense(
      defender,
      opts.reglas,
      (opts.defensaDelMando ?? 0) + (opts.bonoEnLoAlto ?? 0),
    ),
  };
}

/**
 * Multiplicador de daño por la diferencia ataque/defensa: el NUESTRO (+10 % por
 * punto hasta ×4, −2,5 % por punto hasta ×0,3). El de fheroes2 es
 * `multiplicadorFheroes2`, y elige entre los dos `applyModifiers`.
 */
export function damageMultiplier(attack: number, defense: number): number {
  if (attack > defense) {
    return 1 + Math.min((attack - defense) * ATTACK_BONUS_PER_POINT, MAX_ATTACK_BONUS);
  }
  if (defense > attack) {
    return 1 - Math.min((defense - attack) * DEFENSE_REDUCTION_PER_POINT, MAX_DEFENSE_REDUCTION);
  }
  return 1;
}

/**
 * El multiplicador de fheroes2 para una diferencia `r = ataque − defensa`: +10 %
 * por punto hasta +20 puntos (×3) y −5 % por punto hasta −16 (×0,2). Solo lo
 * juega la arena con el interruptor (b).
 *
 * ```cpp
 *     int r = GetAttack() - enemy.GetDefense();
 * // …
 *     // Attack bonus is 20% to 300%
 *     dmg *= 1 + ( 0 < r ? 0.1 * std::min( r, 20 ) : 0.05 * std::max( r, -16 ) );
 * ```
 * https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_troop.cpp#L579-L585
 */
export function multiplicadorFheroes2(r: number): number {
  return 1 + (r > 0 ? 0.1 * Math.min(r, 20) : 0.05 * Math.max(r, -16));
}

export interface DamageResult {
  readonly damage: number;
  readonly lucky: boolean;
  readonly unlucky: boolean;
  /**
   * Hexes de carga que se han COBRADO de verdad, ya con el tope aplicado; 0 si
   * no hubo carga. El parte de guerra lo copia en vez de volver a deducirlo:
   * si no, una carga de 7 hexes se anunciaba como tal mientras el bono se
   * había quedado en los 5 que caben en +50 %.
   */
  readonly charge: number;
}

/**
 * Lo que cambia el daño según de dónde y a quién se pega, y con qué reglas.
 *
 * `reglas` es obligatoria a propósito: cada sitio que hace daño la lee de la
 * batalla (`opcionesDeDanio`, `battle.ts`), y un golpe que se olvidara de ella
 * pegaría con las del juego en una pelea de la arena sin que nadie lo viera.
 */
export interface DamageOptions {
  readonly reglas: ReglasDeBatalla;
  readonly ranged?: boolean;
  readonly distance?: number;
  readonly chargeHexes?: number;
  /**
   * Lo que el héroe del que pega le suma al ataque y el del que recibe a la
   * defensa: el interruptor (f) en fheroes2. 0 en el juego.
   */
  readonly ataqueDelMando?: number;
  readonly defensaDelMando?: number;
  /** Lo que suma a la defensa del que recibe estar en lo alto (`bonoEnLoAlto`). */
  readonly bonoEnLoAlto?: number;
}

/**
 * Una cosa que cambia el daño y cuánto, para que la previsión diga por qué sale
 * la horquilla que sale. `factor` es lo que multiplica, o `null` si no
 * multiplica (la Bendición de fheroes2 elige la tirada).
 */
export interface Modificador {
  readonly causa: string;
  readonly factor: number | null;
}

/**
 * La parte DETERMINISTA de la fórmula: todo lo que multiplica al daño base sin
 * tocar el `Rng` —ataque contra defensa, cruzado contra no-muerto, distancia
 * del tirador y carga—.
 *
 * Existe partida en dos porque la IA necesita el daño MEDIO de un golpe para
 * comparar casillas (`expectedDamage`) y la alternativa era una segunda copia
 * de la fórmula que envejecería aparte. Las multiplicaciones van en el mismo
 * orden que tenían dentro de `computeDamage` y no se reasocian a propósito:
 * reasociar mueve el redondeo del último decimal y con él las partidas. Las
 * reglas de fheroes2 de la arena van en sus propias ramas, sin tocar el orden de
 * las nuestras.
 *
 * `anotar`, si se pasa, recoge cada modificador con su causa: es lo que lee la
 * previsión (`horquillaDeDanio`). Sin él no se escribe ni una frase, que la IA
 * llama a esto cientos de veces por batalla.
 */
function applyModifiers(
  base: number,
  attacker: BattleStack,
  defender: BattleStack,
  opts: DamageOptions,
  anotar?: Modificador[],
): { base: number; charge: number } {
  const info = attacker.unit;
  const { reglas } = opts;

  const { ataque, defensa } = ataqueYDefensa(attacker, defender, opts);
  const mult =
    reglas.ataqueDefensa === 'fheroes2'
      ? multiplicadorFheroes2(ataque - defensa)
      : damageMultiplier(ataque, defensa);
  base *= mult;
  if (anotar !== undefined) {
    const defiende = defiendeConBono(defender, reglas) ? ' (defiende)' : '';
    const mando =
      (opts.ataqueDelMando ?? 0) > 0 || (opts.defensaDelMando ?? 0) > 0
        ? ', con lo de sus héroes'
        : '';
    const enLoAlto = (opts.bonoEnLoAlto ?? 0) > 0 ? ', en lo alto de la muralla' : '';
    const formula = reglas.ataqueDefensa === 'fheroes2' ? ', fórmula de fheroes2' : '';
    anotar.push({
      causa: `ataque ${conComa(ataque, 1)} contra defensa ${conComa(defensa, 1)}${defiende}${enLoAlto}${mando}${formula}`,
      factor: mult,
    });
  }

  // Los cruzados hacen daño doble a los no-muertos.
  if (hasTrait(info, 'bane_undead') && hasTrait(defender.unit, 'undead')) {
    base *= 2;
    anotar?.push({ causa: 'azote de no-muertos', factor: 2 });
  }

  if (reglas.tirador === 'nuestra') {
    // Penalización de distancia del tirador: a más de media rejilla, mitad de daño.
    if (opts.ranged === true && (opts.distance ?? 0) > 5) {
      base *= 0.5;
      anotar?.push({ causa: `disparo a ${opts.distance} casillas, más de 5`, factor: 0.5 });
    }
  } else if (opts.ranged !== true && isShooter(info) && attacker.shotsLeft > 0) {
    // fheroes2: el disparo no pierde con la distancia (fuera de una muralla: allí
    // tirar a través de ella pega la mitad; la nuestra, en el suelo, no deja
    // tirar a través, y desde lo alto o hacia lo alto no la cruza), y un tirador CON flechas que pega cuerpo a cuerpo —también al
    // devolver un golpe— pega la mitad. Sin flechas no es tirador: `isArchers()`
    // es `GetShots() > 0`. `NO_MELEE_PENALTY` lo tienen el mago, el archimago y
    // el titán, que el catálogo no tiene.
    //
    // ```cpp
    //     if ( isArchers() ) {
    //         // …
    //         if ( !isHandFighting() && !isHandFighting( *this, enemy ) ) {
    //             // …
    //         }
    //         else if ( !isAbilityPresent( fheroes2::MonsterAbilityType::NO_MELEE_PENALTY ) ) {
    //             dmg /= 2;
    //         }
    //     }
    // ```
    // https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_troop.cpp#L519-L544
    // https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/monster/monster.h#L252-L255
    base *= 0.5;
    anotar?.push({ causa: 'tirador con flechas cuerpo a cuerpo (fheroes2)', factor: 0.5 });
  }

  // Carga. El contraataque pasa siempre 0 hexes: se contraataca desde el sitio.
  const charge = hasTrait(info, 'charge') ? cargaEfectiva(opts.chargeHexes ?? 0) : 0;
  if (charge > 0) {
    const f = 1 + charge * CHARGE_BONUS_PER_HEX;
    base *= f;
    anotar?.push({
      causa: `carga de ${charge} ${charge === 1 ? 'casilla' : 'casillas'}`,
      factor: f,
    });
  }

  return { base, charge };
}

/**
 * Las tiradas posibles de UN individuo y si están fijadas: el máximo con la
 * Bendición de fheroes2 (`tirada` 1), el mínimo con su Maldición (−1), y si no,
 * las de la criatura (0). Con la regla (e) nuestra no hay `tirada` que buscar y no
 * se recorren sus efectos.
 */
function tiradasPosibles(
  attacker: BattleStack,
  reglas: ReglasDeBatalla,
): { readonly min: number; readonly max: number; readonly tirada: -1 | 0 | 1 } {
  const [min, max] = attacker.unit.damage;
  if (reglas.bendicion === 'nuestra') return { min, max, tirada: 0 };
  const tirada = efectoDeTirada(attacker);
  if (tirada > 0) return { min: max, max, tirada };
  if (tirada < 0) return { min, max: min, tirada };
  return { min, max, tirada };
}

/**
 * La tirada base de UN individuo, de `tiradasPosibles`. Con la Bendición o la
 * Maldición no se gasta `rng.int`, como en fheroes2 —es la rama que no llama a
 * `GetWithGen`—, así que la arena con (e) encendido desplaza las tiradas
 * siguientes: es lo esperado, no un fallo que arreglar gastando una tirada. Y al
 * revés: una criatura con el mínimo igual al máximo SÍ gasta su `rng.int`, que
 * es lo que mira la condición y no `min === max`.
 *
 * ```cpp
 *     if ( Modes( SP_BLESS ) ) {
 *         res = CalculateMaxDamage( enemy );
 *     }
 *     else if ( Modes( SP_CURSE ) ) {
 *         res = CalculateMinDamage( enemy );
 *     }
 *     else {
 *         res = Rand::GetWithGen( CalculateMinDamage( enemy ), CalculateMaxDamage( enemy ), randomGenerator );
 *     }
 * ```
 * https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_troop.cpp#L594-L602
 */
function tiradaDe(attacker: BattleStack, reglas: ReglasDeBatalla, rng: Rng): number {
  const t = tiradasPosibles(attacker, reglas);
  return t.tirada !== 0 ? t.min : rng.int(t.min, t.max);
}

/**
 * El redondeo del daño, escrito una vez: lo aplican el golpe (`computeDamage`) y
 * la previsión (`horquillaDeDanio`), que tiene que dar las mismas cifras.
 */
function danioFinal(base: number): number {
  return Math.max(1, Math.round(base));
}

/**
 * Daño MEDIO de un golpe, sin tirada y sin suerte: la tirada se sustituye por
 * el centro del intervalo de la criatura y el dado de la suerte no se lanza.
 *
 * Es para COMPARAR, no para enseñar: no redondea ni fuerza el mínimo de 1,
 * porque redondear inventaría empates entre casillas que se distinguen por
 * décimas. No toca el `Rng`, así que llamarla no desplaza ni una tirada de la
 * partida — que es lo que permite usarla desde la IA sin cambiar las semillas.
 */
export function expectedDamage(
  attacker: BattleStack,
  defender: BattleStack,
  opts: DamageOptions,
): number {
  // Con la Bendición o la Maldición de fheroes2 la tirada ya no es un medio: es
  // el extremo, como `getPotentialDamage` allí. En el juego no hay ninguna y
  // `[min, max]` son las de la criatura.
  const { min, max } = tiradasPosibles(attacker, opts.reglas);
  const medio = ((min + max) / 2) * attacker.count;
  return applyModifiers(medio, attacker, defender, opts).base;
}

/** Daño que inflige `attacker` a `defender`, ya con suerte aplicada. */
export function computeDamage(
  attacker: BattleStack,
  defender: BattleStack,
  rng: Rng,
  opts: DamageOptions,
): DamageResult {
  const roll = tiradaDe(attacker, opts.reglas, rng);
  const modificado = applyModifiers(roll * attacker.count, attacker, defender, opts);
  let base = modificado.base;
  const charge = modificado.charge;

  const luck = effectiveLuck(attacker);
  let lucky = false;
  let unlucky = false;
  if (luck > 0 && rng.chance(luck * CHANCE_PER_POINT)) {
    lucky = true;
    base *= LUCKY_MULTIPLIER;
  } else if (luck < 0 && rng.chance(-luck * CHANCE_PER_POINT)) {
    unlucky = true;
    base *= UNLUCKY_MULTIPLIER;
  }

  return { damage: danioFinal(base), lucky, unlucky, charge };
}

/** Una horquilla de daño: lo menos y lo más que puede quitar un golpe. */
export interface Horquilla {
  readonly min: number;
  readonly max: number;
}

/** Una rama de la suerte: cuánto pasa y qué horquilla da si pasa. */
export interface RamaDeSuerte extends Horquilla {
  readonly probabilidad: number;
}

/**
 * Lo que puede quitar un golpe de `attacker` a `defender` ANTES de tirar: la
 * horquilla sin suerte, la de la suerte buena o mala si puede pasar (con su
 * probabilidad) y los modificadores con su causa.
 *
 * Sale de la misma cuenta que el golpe —`applyModifiers` y `danioFinal`, con la
 * tirada mínima y la máxima de `tiradasPosibles`—, no de una copia: todo lo que
 * multiplica es positivo y el redondeo es monótono, así que los extremos de la
 * tirada dan los extremos del daño. `test/prevision.test.ts` lo compara con el
 * daño de verdad en cientos de semillas. No toca el `Rng`.
 */
export function horquillaDeDanio(
  attacker: BattleStack,
  defender: BattleStack,
  opts: DamageOptions,
): {
  readonly danio: Horquilla;
  readonly buena: RamaDeSuerte | null;
  readonly mala: RamaDeSuerte | null;
  readonly modificadores: readonly Modificador[];
} {
  const { min: tMin, max: tMax, tirada } = tiradasPosibles(attacker, opts.reglas);
  const modificadores: Modificador[] = [];
  if (tirada !== 0) {
    modificadores.push({
      causa: tirada > 0 ? 'Bendición: daño máximo (fheroes2)' : 'Maldición: daño mínimo (fheroes2)',
      factor: null,
    });
  }
  const bajo = applyModifiers(tMin * attacker.count, attacker, defender, opts, modificadores).base;
  const alto = applyModifiers(tMax * attacker.count, attacker, defender, opts).base;
  const rama = (f: number, p: number): RamaDeSuerte => ({
    probabilidad: p,
    min: danioFinal(bajo * f),
    max: danioFinal(alto * f),
  });
  const luck = effectiveLuck(attacker);
  return {
    danio: { min: danioFinal(bajo), max: danioFinal(alto) },
    buena: luck > 0 ? rama(LUCKY_MULTIPLIER, luck * CHANCE_PER_POINT) : null,
    mala: luck < 0 ? rama(UNLUCKY_MULTIPLIER, -luck * CHANCE_PER_POINT) : null,
    modificadores,
  };
}

/**
 * Qué fracción del golpe de `objetivo` compra o quita un efecto de daño, para la
 * IA: la suerte, su `CHANCE_PER_POINT` por punto de golpe doble o mitad; la
 * Bendición y la Maldición de fheroes2 (`tirada`), pasar del medio al máximo o
 * del medio al mínimo. Es al efecto lo que `CHANCE_PER_POINT` a la suerte en
 * `rindeTemporal` (`tactics.ts`): la IA lo pregunta aquí en vez de ramificar
 * por la clase del efecto.
 */
export function valorDeEfectoDeDanio(efecto: StackEffect, objetivo: BattleStack): number {
  switch (efecto.kind) {
    case 'luck':
      return Math.abs(efecto.amount) * CHANCE_PER_POINT;
    case 'tirada': {
      const [min, max] = objetivo.unit.damage;
      const medio = (min + max) / 2;
      return efecto.amount > 0 ? (max - medio) / medio : (medio - min) / medio;
    }
    case 'speed':
    case 'attack':
      throw new Error(`un efecto de ${efecto.kind} no cambia la tirada de daño`);
  }
}

/**
 * Aplica `damage` al stack y devuelve cuántos efectivos ha perdido.
 * El daño se come primero al efectivo de arriba, como en la serie.
 *
 * **No se exporta**: fuera de este módulo se hiere con `herir`, que es lo mismo
 * más la experiencia de quien pega. Exportada, un quinto sitio que hiriera con
 * ella haría daño GRATIS —el objetivo pierde vida, nadie cobra— y ni un test se
 * pondría rojo. Antes lo vigilaba un guardia de texto en `invariantes.test.ts`;
 * ahora es el módulo el que no deja nombrarla, y eso lo comprueba `tsc`.
 */
function applyDamage(stack: BattleStack, damage: number): number {
  const before = stack.count;
  const tras = trasElGolpe(stack, damage);
  stack.count = tras.count;
  stack.topHp = tras.topHp;
  return before - tras.count;
}

/**
 * Cómo queda un stack tras recibir `damage`, sin tocarlo: la cuenta de
 * `applyDamage`, que la escribe, y de la previsión, que solo la lee. Partida así
 * para que «cuántos caen» se cuente una vez.
 */
export function trasElGolpe(
  stack: Pick<BattleStack, 'count' | 'topHp' | 'unit'>,
  damage: number,
): { readonly count: number; readonly topHp: number } {
  const hp = stack.unit.hp;
  const totalHp = (stack.count - 1) * hp + stack.topHp;
  const remaining = totalHp - damage;
  if (remaining <= 0) return { count: 0, topHp: 0 };
  const count = Math.ceil(remaining / hp);
  return { count, topHp: remaining - (count - 1) * hp };
}

/**
 * Hiere a `objetivo` con `damage` y le apunta la experiencia a `autor`:
 * **los PV quitados de verdad × el nivel del que los recibe**. Devuelve los
 * muertos, como `applyDamage`.
 *
 * Es la ÚNICA forma en que el motor quita vida —golpe, contraataque, disparo,
 * salpicadura y hechizo—: `applyDamage` no sale de este módulo.
 *
 * - **Lo quitado, no lo tirado**: un golpe de 7 sobre un piquero con 5 PV cobra
 *   5. El sobrante no existe para nadie, y contarlo premiaría rematar.
 * - **Solo contra el bando de enfrente**: la salpicadura del liche sobre los
 *   suyos no enseña nada. `autor` es `null` cuando no hay quien cobre.
 */
export function herir(objetivo: BattleStack, damage: number, autor: BattleStack | null): number {
  const antes = stackHp(objetivo);
  const muertos = applyDamage(objetivo, damage);
  if (autor !== null && autor.side !== objetivo.side) {
    autor.ganado.experiencia += (antes - stackHp(objetivo)) * objetivo.unit.nivel;
    autor.ganado.bajas += muertos;
    if (objetivo.origen.kind === 'heroe' && objetivo.count === 0) {
      autor.ganado.heroes.push(objetivo.unit.name);
    }
  }
  return muertos;
}

/** Puntos de vida totales que le quedan a un stack. Útil para la IA. */
export function stackHp(stack: BattleStack): number {
  if (stack.count === 0) return 0;
  return (stack.count - 1) * stack.unit.hp + stack.topHp;
}
