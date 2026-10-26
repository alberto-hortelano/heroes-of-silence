/**
 * La fórmula del daño.
 *
 * Cada punto de ataque por encima de la defensa suma un +10 % al daño, hasta
 * +300 %; cada punto de defensa por encima del ataque resta un 2,5 %, hasta
 * -70 %. Es la nuestra, no la de HoMM2 ni la de fheroes2 (que resta un 5 % hasta
 * −80 %). Las constantes viven aquí y no repartidas por el motor.
 */
import { hasTrait, isShooter } from '../data.js';
import { DICHO_DE_LA_CARGA, DICHO_DEL_USO, SIN_ARMA } from '../hero/equipo.js';
import { indiceDePoder } from '../nivel.js';
import type { Rng } from '../rng.js';
import { conComa, type GolpeConArma, type UnitInfo, type UsoDeArma } from '../types.js';
import { armaduraDe, cifrasDelGolpe, golpeDe, trasLaArmadura } from './armas.js';
import { type CifrasDeCarga, cargaEfectiva, cifrasDeCarga, dichoDeLaCarga } from './carga.js';
import { effectiveLuck, effectTotal, type StackEffect } from './effects.js';
import type { BattleStack } from './types.js';

export const ATTACK_BONUS_PER_POINT = 0.1;
export const MAX_ATTACK_BONUS = 3.0;
export const DEFENSE_REDUCTION_PER_POINT = 0.025;
export const MAX_DEFENSE_REDUCTION = 0.7;

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
 * Las casillas de carga que cobra un golpe y con qué cifras: las de su recta
 * (`chargeHexes`) con el tope y las cifras de quien pega (`cifrasDeCarga`: el
 * jinete o a pie); 0 y `null` sin recta. El contraataque pasa 0: se contraataca
 * desde el sitio. Se cuenta una vez por golpe (`deUnGolpe`), y de ella sale
 * también con qué arma va (`usoDelGolpe`).
 */
function cargaCobrada(
  unit: UnitInfo,
  opts: Pick<DamageOptions, 'chargeHexes'>,
): { readonly charge: number; readonly cifras: CifrasDeCarga | null } {
  const cifras = cifrasDeCarga(unit);
  const charge = cargaEfectiva(opts.chargeHexes ?? 0, cifras);
  return charge > 0 ? { charge, cifras } : SIN_CARGA;
}

const SIN_CARGA = Object.freeze({ charge: 0, cifras: null });

/**
 * Con qué arma se da un golpe (13-10-2026, «cada arma para lo suyo»): el disparo,
 * con la de distancia; todo lo demás —el golpe, la carga y el contraataque—, con
 * las de cuerpo a cuerpo (25-10-2026: la lanza dejó su hueco y es una de ellas).
 * **La única decisión**: se deduce de las opciones que ya trae todo golpe
 * (`opcionesDeDanio`), así que el motor no la pasa por ningún sitio.
 */
export function usoDelGolpe(opts: Pick<DamageOptions, 'ranged'>): UsoDeArma {
  return opts.ranged === true ? 'distancia' : 'arma';
}

/**
 * Con qué armas va un golpe de `uso`, dicho para quien juega: «con Daga (cuerpo a
 * cuerpo)», «con Espada y Lanza (en la carga)» o «sin arma, con el cuerpo (cuerpo a
 * cuerpo)» (`golpeDe`, `DICHO_DEL_USO`, `DICHO_DE_LA_CARGA`). Lo leen la previsión
 * del golpe y la del contraataque.
 */
export function dichoDelGolpe(unit: UnitInfo, uso: UsoDeArma, enLaCarga = false): string {
  const { piezas } = golpeDe(unit, uso);
  const como = (enLaCarga ? DICHO_DE_LA_CARGA : DICHO_DEL_USO[uso]).golpe;
  return piezas.length === 0
    ? `${SIN_ARMA} (${como})`
    : `con ${nombresDeLasArmas(piezas)} (${como})`;
}

/** Los nombres de las armas de un golpe, juntos: «Espada» o «Espada y Lanza». */
function nombresDeLasArmas(piezas: GolpeConArma['piezas']): string {
  return piezas.map((p) => p.nombre).join(' y ');
}

/** Una fila de `armasDe`: el golpe de un uso (`golpeDe`) con el nombre de sus armas. */
export interface ArmaDeLaUnidad extends Omit<GolpeConArma, 'piezas' | 'conLanza'> {
  readonly uso: UsoDeArma;
  /** Los nombres de sus armas («Espada y Lanza»), o `null` si ese golpe va con el cuerpo. */
  readonly arma: string | null;
  /** En la fila de la carga, lo que cobra (`cifrasDeCarga`); en las demás, `null`. */
  readonly carga: CifrasDeCarga | null;
}

/**
 * Las armas de una unidad, una fila por uso (`golpeDe`), con el nombre de sus
 * armas: lo que enseña la ficha. El cuerpo a cuerpo y la carga, siempre (todo el
 * que pega cuerpo a cuerpo carga: `cifrasDeCarga`; la carga va con las de cuerpo a
 * cuerpo); el disparo, si dispara (`isShooter`: lleva arma a distancia).
 */
export function armasDe(unit: UnitInfo): ArmaDeLaUnidad[] {
  const fila = (uso: UsoDeArma, carga: CifrasDeCarga | null = null): ArmaDeLaUnidad => {
    const { piezas, attack, damage } = golpeDe(unit, uso);
    const arma = piezas.length === 0 ? null : nombresDeLasArmas(piezas);
    return { uso, arma, attack, damage, carga };
  };
  const filas = [fila('arma')];
  if (isShooter(unit)) filas.push(fila('distancia'));
  filas.push(fila('arma', cifrasDeCarga(unit)));
  return filas;
}

/**
 * El ataque con el que pega un stack un golpe de `uso` (el de cuerpo a cuerpo si
 * no se dice): el de su arma (`cifrasDelGolpe`) y sus efectos, sin héroe
 * (`BattleHero` cuenta por qué). Los efectos de `attack` son los que mete el
 * miedo del dragón óseo.
 */
export function effectiveAttack(stack: BattleStack, uso: UsoDeArma = 'arma'): number {
  return cifrasDelGolpe(stack.unit, uso).attack + effectTotal(stack, 'attack');
}

/**
 * La defensa con la que se recibe un golpe: la suya, más lo que se le suma
 * (`extra`: lo de estar en lo alto de un muro, `bonoEnLoAlto`) y sus efectos
 * (Defensivo y Romper guardia de la rueda). La acción de defenderse (+20 %) se
 * retiró el 26-10-2026 con la de esperar: el turno se cierra con `end_turn`.
 */
export function effectiveDefense(stack: BattleStack, extra = 0): number {
  return stack.unit.defense + extra + effectTotal(stack, 'defense');
}

/**
 * El ataque de quien pega y la defensa de quien recibe, ya finales: sus cifras,
 * sus efectos, lo que da la rueda y estar en lo alto (`opts`, de
 * `opcionesDeDanio`) y el bono de defender. El único cálculo: lo cuentan el golpe
 * (`applyModifiers`) y la ficha (`ataqueYDefensaEnBatalla`, `battle.ts`).
 */
export function ataqueYDefensa(
  attacker: BattleStack,
  defender: BattleStack,
  opts: DamageOptions,
  uso: UsoDeArma = usoDelGolpe(opts),
): { readonly ataque: number; readonly defensa: number } {
  return {
    ataque: effectiveAttack(attacker, uso) + (opts.cruce === undefined ? 0 : opts.cruce.ataque),
    defensa: effectiveDefense(defender, opts.bonoEnLoAlto ?? 0),
  };
}

/**
 * Multiplicador de daño por la diferencia ataque/defensa: el NUESTRO (+10 % por
 * punto hasta ×4, −2,5 % por punto hasta ×0,3).
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
  /** Con qué cifras se cobró esa carga (`cifrasDeCarga`); `null` sin carga. */
  readonly cifrasDeCarga: CifrasDeCarga | null;
}

/** Lo que cambia el daño según de dónde y a quién se pega (`opcionesDeDanio`, `battle.ts`). */
export interface DamageOptions {
  readonly ranged?: boolean;
  /**
   * El disparo diferido (25-10-2026, regla nuestra): en qué cuarto de la horquilla
   * cae su tirada, `max(0, 4 − d)` con `d` la distancia del alcanzado a la casilla
   * apuntada (`cuartoDelDisparo`): en ella, la máxima; a 4 o más, la mínima. Fija:
   * no gasta `rng.int`.
   */
  readonly cuarto?: number;
  readonly chargeHexes?: number;
  /** Lo que suma a la defensa del que recibe estar en lo alto (`bonoEnLoAlto`). */
  readonly bonoEnLoAlto?: number;
  /**
   * La rueda del golpe cuerpo a cuerpo, en números: la monta solo
   * `opcionesDeDanio` (`cruceDelGolpe`, `rueda.ts`), y aquí no se sabe de tipos.
   * Sin ella (el disparo, el hechizo), la tirada de siempre.
   */
  readonly cruce?: CruceDelGolpe;
}

/**
 * Lo que la rueda le dice al daño de un golpe (`DamageOptions.cruce`). La
 * tirada cae del cuarto `desde` al `hasta` de la horquilla (0 el mínimo, 4 el
 * máximo, `tiradaEnCuartos`): el golpe que se da va con los dos iguales y no
 * gasta `rng.int`; la previsión, con los de un sector de la rueda.
 */
export interface CruceDelGolpe {
  readonly desde: number;
  readonly hasta: number;
  /** Lo que multiplica el golpe ya hecho, al final de todo (1: nada). */
  readonly factor: number;
  /** Lo que suma al ataque del golpe que se da. */
  readonly ataque: number;
  /** Cómo anota la previsión el `factor` («golpe Fuerte»). */
  readonly causa: string;
  /** Cómo anota la previsión dónde cae la tirada («rueda: tirada en el medio»). */
  readonly causaDeLaTirada: string;
}

/**
 * Las casillas en que el disparo diferido pasa de la tirada máxima a la mínima:
 * una por cuarto de la horquilla (`tiradaEnCuartos`), así que no se cambia sin ella.
 */
const CAIDA_DEL_DISPARO = 4;

/**
 * En qué cuarto de la horquilla cae el disparo diferido que alcanza a quien está
 * a `d` casillas de la casilla apuntada: 4 en ella, uno menos por casilla, 0 a 4 o
 * más (`CAIDA_DEL_DISPARO`; 25-10-2026, decisión del usuario: «cuanto más cerca de
 * la casilla elegida más daño»). La única cuenta: la lee `opcionesDelDisparo`.
 */
export function cuartoDelDisparo(d: number): number {
  return Math.max(0, CAIDA_DEL_DISPARO - d);
}

/** Cómo dice la previsión dónde cae la tirada del disparo diferido. */
function dichoDelCuarto(cuarto: number): string {
  if (cuarto === CAIDA_DEL_DISPARO) return 'en la casilla apuntada: la tirada máxima';
  if (cuarto === 0) {
    return `a ${CAIDA_DEL_DISPARO} casillas o más de la casilla apuntada: la tirada mínima`;
  }
  const d = CAIDA_DEL_DISPARO - cuarto;
  return `a ${d} ${d === 1 ? 'casilla' : 'casillas'} de la casilla apuntada: la tirada en el cuarto ${cuarto} de 4`;
}

/** La tirada en el cuarto `c` (de 0 a 4) de la horquilla `[min, max]`, en enteros. */
export function tiradaEnCuartos(min: number, max: number, c: number): number {
  return min + Math.floor(((max - min) * c) / 4);
}

/**
 * Una cosa que cambia el daño y cuánto, para que la previsión diga por qué sale
 * la horquilla que sale. `factor` es lo que multiplica, o `null` si no
 * multiplica (el arma con que se pega, dónde cae la tirada, la armadura).
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
 * reasociar mueve el redondeo del último decimal y con él las partidas.
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
  golpe: DeUnGolpe,
  anotar?: Modificador[],
): number {
  const info = attacker.unit;

  const { ataque, defensa } = ataqueYDefensa(attacker, defender, opts, golpe.uso);
  const mult = damageMultiplier(ataque, defensa);
  base *= mult;
  if (anotar !== undefined) {
    const enLoAlto = (opts.bonoEnLoAlto ?? 0) > 0 ? ', en lo alto de la muralla' : '';
    anotar.push({
      causa: `ataque ${conComa(ataque, 1)} contra defensa ${conComa(defensa, 1)}${enLoAlto}`,
      factor: mult,
    });
  }

  // Los cruzados hacen daño doble a los no-muertos.
  if (hasTrait(info, 'bane_undead') && hasTrait(defender.unit, 'undead')) {
    base *= 2;
    anotar?.push({ causa: 'azote de no-muertos', factor: 2 });
  }

  // Carga. El contraataque pasa siempre 0 hexes: se contraataca desde el sitio.
  // `1 + casillas × porcentaje / 100`, la misma cuenta y en el mismo orden que
  // con el 0.1 escrito (10 / 100 es ese mismo double): el jinete del juego cobra
  // lo mismo hasta el último decimal.
  const { charge, cifrasDeCarga: cifras } = golpe;
  if (cifras !== null) {
    const f = 1 + charge * (cifras.porcentaje / 100);
    base *= f;
    anotar?.push({ causa: dichoDeLaCarga(charge, cifras, false), factor: f });
  }

  // La rueda, al final de todo: Fuerte y Rápido multiplican el golpe ya hecho.
  // Con factor 1 (o sin rueda: el disparo) no se multiplica nada, ni por 1.
  if (opts.cruce !== undefined && opts.cruce.factor !== 1) {
    base *= opts.cruce.factor;
    anotar?.push({ causa: opts.cruce.causa, factor: opts.cruce.factor });
  }

  return base;
}

/**
 * Lo que un golpe decide una vez (`deUnGolpe`) y leen su tirada y sus
 * modificadores: las casillas de carga que cobra y con qué arma va.
 */
interface DeUnGolpe {
  readonly charge: number;
  /** Con qué cifras cobra la carga; `null` si no carga (y `charge` es 0). */
  readonly cifrasDeCarga: CifrasDeCarga | null;
  readonly uso: UsoDeArma;
}

function deUnGolpe(attacker: BattleStack, opts: DamageOptions): DeUnGolpe {
  const { charge, cifras } = cargaCobrada(attacker.unit, opts);
  return { charge, cifrasDeCarga: cifras, uso: usoDelGolpe(opts) };
}

/**
 * Las tiradas de UN individuo con su daño `[min, max]` (el del arma de ese uso,
 * `cifrasDelGolpe`) y la rueda: del cuarto `desde` al `hasta` de la horquilla. Sin
 * rueda (el disparo), la horquilla entera.
 */
function enElCruce(
  [min, max]: readonly [number, number],
  cruce: CruceDelGolpe | undefined,
  cuarto?: number,
): Horquilla {
  if (cuarto !== undefined) {
    const t = tiradaEnCuartos(min, max, cuarto);
    return { min: t, max: t };
  }
  if (cruce === undefined) return { min, max };
  return {
    min: tiradaEnCuartos(min, max, cruce.desde),
    max: tiradaEnCuartos(min, max, cruce.hasta),
  };
}

/**
 * La tirada base de UN individuo. Con la rueda en un solo punto (el golpe que
 * se da) no hay dado; si no, una tirada de `rng.int` —también con el mínimo
 * igual al máximo, que es lo que mira la condición y no `min === max`—.
 */
function tiradaDe(attacker: BattleStack, opts: DamageOptions, uso: UsoDeArma, rng: Rng): number {
  const { cruce, cuarto } = opts;
  const t = enElCruce(cifrasDelGolpe(attacker.unit, uso).damage, cruce, cuarto);
  const fija = cuarto !== undefined || (cruce !== undefined && cruce.desde === cruce.hasta);
  return fija ? t.min : rng.int(t.min, t.max);
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
  // La armadura, lo último y con la misma resta que el golpe.
  return trasLaArmadura(medioSinArmadura(attacker, defender, opts), defender).danio;
}

/** El daño medio de `expectedDamage` antes de la armadura: lo que se tira contra ella. */
function medioSinArmadura(
  attacker: BattleStack,
  defender: BattleStack,
  opts: DamageOptions,
): number {
  const golpe = deUnGolpe(attacker, opts);
  // El centro de lo que puede salir: la horquilla entera, la del cruce o, en el
  // disparo diferido, su cuarto (`enElCruce`, la misma que la tirada).
  const t = enElCruce(cifrasDelGolpe(attacker.unit, golpe.uso).damage, opts.cruce, opts.cuarto);
  const medio = ((t.min + t.max) / 2) * attacker.count;
  return applyModifiers(medio, attacker, defender, opts, golpe);
}

/**
 * Qué parte del golpe medio de `attacker` le llega a `defender` tras su armadura
 * (la arena, #262): de 0 (la para entera) a 1. **Sin armadura, 1 exacto y sin
 * calcular nada**, que es lo que deja a la IA del juego con las mismas
 * decisiones (multiplicar por 1 no mueve un bit): la lee `bestTarget` para no
 * gastar flechas en una barda que las para todas (QA de #262, Q1).
 */
export function fraccionQueLlega(
  attacker: BattleStack,
  defender: BattleStack,
  opts: DamageOptions,
): number {
  if (armaduraDe(defender.unit) === 0) return 1;
  const bruto = medioSinArmadura(attacker, defender, opts);
  if (bruto <= 0) return 0;
  return trasLaArmadura(bruto, defender).danio / bruto;
}

/** Daño que inflige `attacker` a `defender`, ya con suerte aplicada. */
export function computeDamage(
  attacker: BattleStack,
  defender: BattleStack,
  rng: Rng,
  opts: DamageOptions,
): DamageResult {
  const golpe = deUnGolpe(attacker, opts);
  const roll = tiradaDe(attacker, opts, golpe.uso, rng);
  let base = applyModifiers(roll * attacker.count, attacker, defender, opts, golpe);
  const { charge, cifrasDeCarga } = golpe;

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

  return { damage: danioFinal(base), lucky, unlucky, charge, cifrasDeCarga };
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
 * tirada mínima y la máxima del arma (`enElCruce`)—, no de una copia: todo lo que
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
  /**
   * Con qué arma va el golpe (`dichoDelGolpe`), o `null` sin armas por uso (el
   * juego). Es también el primer modificador; aparte, para quien lo nombra sin
   * la cuenta: la barra, en el contraataque.
   */
  readonly conArma: string | null;
} {
  const { cruce, cuarto } = opts;
  const golpe = deUnGolpe(attacker, opts);
  const { min: tMin, max: tMax } = enElCruce(
    cifrasDelGolpe(attacker.unit, golpe.uso).damage,
    cruce,
    cuarto,
  );
  const modificadores: Modificador[] = [];
  // Con armas por uso, lo primero es con cuál pega: la horquilla es
  // la de esa arma, y la previsión y el contraataque lo dicen sin campos nuevos.
  const conArma =
    attacker.unit.armas === undefined
      ? null
      : dichoDelGolpe(attacker.unit, golpe.uso, golpe.charge > 0);
  if (conArma !== null) modificadores.push({ causa: conArma, factor: null });
  if (cruce !== undefined) modificadores.push({ causa: cruce.causaDeLaTirada, factor: null });
  if (cuarto !== undefined) modificadores.push({ causa: dichoDelCuarto(cuarto), factor: null });
  const bajo = applyModifiers(
    tMin * attacker.count,
    attacker,
    defender,
    opts,
    golpe,
    modificadores,
  );
  const alto = applyModifiers(tMax * attacker.count, attacker, defender, opts, golpe);
  const llega = (d: number): number => trasLaArmadura(d, defender).danio;
  const rama = (f: number, p: number): RamaDeSuerte => ({
    probabilidad: p,
    min: llega(danioFinal(bajo * f)),
    max: llega(danioFinal(alto * f)),
  });
  const luck = effectiveLuck(attacker);
  // La armadura, lo último y con la misma resta que el golpe (`herir`): es
  // monótona, así que los extremos siguen siéndolo.
  const a = armaduraDe(defender.unit);
  if (a > 0) modificadores.push({ causa: `−${a} armadura`, factor: null });
  return {
    danio: { min: llega(danioFinal(bajo)), max: llega(danioFinal(alto)) },
    buena: luck > 0 ? rama(LUCKY_MULTIPLIER, luck * CHANCE_PER_POINT) : null,
    mala: luck < 0 ? rama(UNLUCKY_MULTIPLIER, -luck * CHANCE_PER_POINT) : null,
    modificadores,
    conArma,
  };
}

/**
 * Qué fracción del golpe compra o quita un efecto de daño, para la IA: la
 * suerte, su `CHANCE_PER_POINT` por punto de golpe doble o mitad. Es al efecto lo
 * que `CHANCE_PER_POINT` a la suerte en `rindeTemporal` (`tactics.ts`): la IA lo
 * pregunta aquí en vez de ramificar por la clase del efecto.
 */
export function valorDeEfectoDeDanio(efecto: StackEffect): number {
  switch (efecto.kind) {
    case 'luck':
      return Math.abs(efecto.amount) * CHANCE_PER_POINT;
    case 'speed':
    case 'attack':
    case 'defense':
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

/** Lo que hizo una herida (`herir`): los muertos, el daño que llegó y lo que paró la armadura. */
export interface Herida {
  readonly muertos: number;
  /** El daño que quitó, tras la armadura: lo que dice el parte y lo que drena un vampiro. */
  readonly danio: number;
  /** Lo que se comió la armadura del objetivo (`trasLaArmadura`); 0 sin ella. */
  readonly parado: number;
}

/**
 * Hiere a `objetivo` con `damage` y le apunta la experiencia a `autor`:
 * **los PV quitados de verdad × el índice de poder del que los recibe**
 * (`indiceDePoder`: el de sus cifras con su equipo, no su rango; el índice entero y
 * no su primera cifra, para que un veterano o un héroe que sube cifras pague más
 * aunque no cambie de nivel). Los umbrales de `data/experiencia.json` van en esa
 * escala: nada se divide entre 100. Devuelve los
 * muertos, como `applyDamage`, y el daño que llegó.
 *
 * `damage` es el del golpe; **la armadura se resta aquí** (`trasLaArmadura`,
 * #262), así que no hay manera de quitar vida saltándosela. Lo que dependa de lo
 * quitado —el parte, el drenaje, la experiencia— lee `danio`, no `damage`.
 *
 * Es la ÚNICA forma en que el motor quita vida —golpe, contraataque, disparo,
 * salpicadura y hechizo—: `applyDamage` no sale de este módulo.
 *
 * - **Lo quitado, no lo tirado**: un golpe de 7 sobre un piquero con 5 PV cobra
 *   5. El sobrante no existe para nadie, y contarlo premiaría rematar.
 * - **Solo contra el bando de enfrente**: la salpicadura del liche sobre los
 *   suyos no enseña nada. `autor` es `null` cuando no hay quien cobre.
 */
export function herir(objetivo: BattleStack, damage: number, autor: BattleStack | null): Herida {
  const { danio, parado } = trasLaArmadura(damage, objetivo);
  const antes = stackHp(objetivo);
  const muertos = applyDamage(objetivo, danio);
  if (autor !== null && autor.side !== objetivo.side) {
    autor.ganado.experiencia += (antes - stackHp(objetivo)) * indiceDePoder(objetivo.unit);
    autor.ganado.bajas += muertos;
    if (objetivo.origen.kind === 'heroe' && objetivo.count === 0) {
      autor.ganado.heroes.push(objetivo.unit.name);
    }
  }
  return { muertos, danio, parado };
}

/** Puntos de vida totales que le quedan a un stack. Útil para la IA. */
export function stackHp(stack: BattleStack): number {
  if (stack.count === 0) return 0;
  return (stack.count - 1) * stack.unit.hp + stack.topHp;
}
