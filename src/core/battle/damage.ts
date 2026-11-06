/**
 * La fórmula del daño.
 *
 * Cada punto de ataque por encima de la defensa suma un +10 % al daño, hasta
 * +300 %; cada punto de defensa por encima del ataque resta un 2,5 %, hasta
 * -70 %. Es la nuestra, no la de HoMM2 ni la de fheroes2 (que resta un 5 % hasta
 * −80 %). Las constantes viven aquí y no repartidas por el motor.
 */

import { danioConLosEfectos } from '../cuerpo.js';
import { hasTrait } from '../data.js';
import { DICHO_DE_LA_CARGA, DICHO_DEL_USO, SIN_ARMA } from '../hero/equipo.js';
import { indiceDePoder } from '../nivel.js';
import type { Rng } from '../rng.js';
import { conComa, type GolpeConArma, type UnitInfo, type UsoDeArma } from '../types.js';
import {
  armaduraEnLaPelea,
  cifrasDelGolpe,
  escudoDe,
  golpeDe,
  perforaLaArmadura,
  tiroADistanciaDe,
  trasLaArmadura,
} from './armas.js';
import { CARGA, type CifrasDeCarga, cargaEfectiva, dichoDeLaCarga } from './carga.js';
import { effectTotal } from './effects.js';
import type { BattleStack } from './types.js';

export const ATTACK_BONUS_PER_POINT = 0.1;
export const MAX_ATTACK_BONUS = 3.0;
export const DEFENSE_REDUCTION_PER_POINT = 0.025;
export const MAX_DEFENSE_REDUCTION = 0.7;

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
 * cuerpo)», «con Espada y Lanza de jinete, montado en Caballo de guerra (en la carga)» o «sin arma, con el cuerpo (cuerpo a
 * cuerpo)» (`golpeDe`, `DICHO_DEL_USO`, `DICHO_DE_LA_CARGA`). Lo leen la previsión
 * del golpe y la del contraataque.
 */
export function dichoDelGolpe(unit: UnitInfo, uso: UsoDeArma, enLaCarga = false): string {
  const { piezas, carga } = golpeDe(unit, uso);
  const como = (enLaCarga ? DICHO_DE_LA_CARGA : DICHO_DEL_USO[uso]).golpe;
  // La carga montada pega con la fuerza de la montura: se nombra (26-10-2026).
  const montado =
    enLaCarga && carga !== undefined && unit.montura !== undefined
      ? `, montado en ${unit.montura.nombre}`
      : '';
  return piezas.length === 0
    ? `${SIN_ARMA} (${como})`
    : `con ${nombresDeLasArmas(piezas)}${montado} (${como})`;
}

/** Los nombres de las armas de un golpe, juntos: «Espada» o «Espada y Lanza de jinete». */
function nombresDeLasArmas(piezas: GolpeConArma['piezas']): string {
  return piezas.map((p) => p.nombre).join(' y ');
}

/** Una fila de `armasDe`: el golpe de un uso (`golpeDe`) con el nombre de sus armas. */
export interface ArmaDeLaUnidad extends Omit<GolpeConArma, 'piezas' | 'carga'> {
  readonly uso: UsoDeArma;
  /** Los nombres de sus armas («Espada y Lanza de jinete»), o `null` si ese golpe va con el cuerpo. */
  readonly arma: string | null;
  /** En la fila de la carga, lo que cobra (`CARGA`); en las demás, `null`. */
  readonly carga: CifrasDeCarga | null;
  /**
   * En la fila de la carga, si va montada (`cargaMontada`): su `damage` es entonces
   * el de la fuerza de la montura más la de la lanza. En las demás, `false`.
   */
  readonly montada: boolean;
}

/**
 * Las armas de una unidad, una fila por uso (`golpeDe`), con el nombre de sus
 * armas: lo que enseña la ficha. El cuerpo a cuerpo y la carga, siempre (todo el
 * que pega cuerpo a cuerpo carga, con las de cuerpo a cuerpo; montado de guerra y
 * con lanza, con la horquilla de la carga montada, `GolpeConArma.carga`); el
 * disparo, si juega a distancia (`tiroADistanciaDe`: dispara o lanza granadas).
 */
export function armasDe(unit: UnitInfo): ArmaDeLaUnidad[] {
  const fila = (uso: UsoDeArma, enLaCarga = false): ArmaDeLaUnidad => {
    const { piezas, attack, damage, carga } = golpeDe(unit, uso);
    const arma = piezas.length === 0 ? null : nombresDeLasArmas(piezas);
    const montada = enLaCarga && carga !== undefined;
    return {
      uso,
      arma,
      attack,
      damage: montada ? carga : damage,
      carga: enLaCarga ? CARGA : null,
      montada,
    };
  };
  const filas = [fila('arma')];
  if (tiroADistanciaDe(unit) !== null) filas.push(fila('distancia'));
  filas.push(fila('arma', true));
  return filas;
}

/**
 * El ataque con el que pega un stack un golpe de `uso` (el de cuerpo a cuerpo si
 * no se dice): el de su arma (`cifrasDelGolpe`) y sus efectos, sin héroe
 * (`BattleHero` cuenta por qué). Los efectos de `attack` son los que mete el
 * miedo (`fear`).
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
  // La agilidad de un hechizo sube la defensa como la del cuerpo (`cifrasDelCuerpo`).
  return (
    stack.unit.defense + extra + effectTotal(stack, 'defense') + effectTotal(stack, 'agilidad')
  );
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
  /**
   * Hexes de carga que se han COBRADO de verdad, ya con el tope aplicado; 0 si
   * no hubo carga. El parte de guerra lo copia en vez de volver a deducirlo:
   * si no, una carga de 7 hexes se anunciaba como tal mientras el bono se
   * había quedado en los 5 que caben en +50 %.
   */
  readonly charge: number;
  /** Si esa carga fue montada (`cargaMontada`: con la fuerza de la montura); `false` sin carga. */
  readonly montada: boolean;
  /**
   * Si el golpe perfora la armadura (`perforaLaArmadura`: el disparo de un arma de
   * fuego). Quien hiere lo pasa a `herir`, que entonces no resta armadura.
   */
  readonly perfora: boolean;
}

/** Lo que cambia el daño según de dónde y a quién se pega (`opcionesDeDanio`, `battle.ts`). */
export interface DamageOptions {
  readonly ranged?: boolean;
  /**
   * El disparo diferido (25-10-2026, regla nuestra): en qué cuarto de la horquilla
   * cae su tirada, `max(0, 4 − o)` con `o` los octavos de casilla a que pasa la
   * recta del centro de la casilla del alcanzado (`cuartoDelDisparo`): por el
   * centro, la máxima; a media casilla o más, la mínima. Fija: no gasta `rng.int`.
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
 * El cuarto más alto de la horquilla (`tiradaEnCuartos`): la tirada máxima. Lo leen
 * el disparo diferido y la granada (`validarGranada`).
 */
export const CUARTO_MAXIMO = 4;

/**
 * Los octavos de casilla en que el disparo diferido pasa de la tirada máxima a la
 * mínima: uno por cuarto de la horquilla (`tiradaEnCuartos`), así que no se cambia
 * sin ella. Con 4, a media casilla del centro (el radio del círculo inscrito) ya es
 * la mínima: inventado, 01-11-2026.
 */
const CAIDA_DEL_DISPARO = CUARTO_MAXIMO;

/**
 * En qué cuarto de la horquilla cae el disparo diferido que alcanza a quien está en
 * una casilla cuyo centro deja la recta a `octavos` octavos de casilla
 * (`octavosHastaLaRecta`, `board.ts`): 4 por el centro, uno menos por octavo, 0 a
 * media casilla o más (`CAIDA_DEL_DISPARO`; 01-11-2026, decisión del usuario: «que
 * sea por la distancia de la línea de tiro al centro de la primera casilla donde hay
 * alguien»; antes, por la distancia a la casilla apuntada). La única cuenta: la leen
 * `opcionesDelDisparo` y el alcance que se pinta.
 */
export function cuartoDelDisparo(octavos: number): number {
  return Math.max(0, CAIDA_DEL_DISPARO - octavos);
}

/**
 * Cómo dice la previsión dónde cae la tirada del disparo diferido. La pone la
 * previsión (`previsionDeGolpe`, por su `kind`), no `horquillaDeDanio`.
 */
export function dichoDelCuarto(cuarto: number): string {
  if (cuarto === CAIDA_DEL_DISPARO)
    return 'la recta pasa por el centro de su casilla: la tirada máxima';
  if (cuarto === 0) return 'la recta pasa a media casilla o más de su centro: la tirada mínima';
  const o = CAIDA_DEL_DISPARO - cuarto;
  return `la recta pasa a ${o}/8 de casilla de su centro: la tirada en el cuarto ${cuarto} de 4`;
}

/** La tirada en el cuarto `c` (de 0 a `CUARTO_MAXIMO`) de la horquilla `[min, max]`, en enteros. */
export function tiradaEnCuartos(min: number, max: number, c: number): number {
  return min + Math.floor(((max - min) * c) / CUARTO_MAXIMO);
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
  // `1 + casillas × porcentaje / 100`, la de todos (26-10-2026: montado, lo que
  // cambia es la horquilla del golpe, `DeUnGolpe.danio`).
  const { charge, montada } = golpe;
  if (charge > 0) {
    const f = 1 + charge * (CARGA.porcentaje / 100);
    base *= f;
    anotar?.push({ causa: dichoDeLaCarga(charge, montada, false), factor: f });
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
 * modificadores: las casillas de carga que cobra, si va montada, con qué arma va y
 * **la horquilla de su daño**.
 */
interface DeUnGolpe {
  /** Las casillas de carga que cobra, ya con el tope (`cargaEfectiva`); 0 sin carga. */
  readonly charge: number;
  readonly montada: boolean;
  readonly uso: UsoDeArma;
  /**
   * El daño [mín, máx] por efectivo con que se tira: el del arma de su uso
   * (`cifrasDelGolpe`) o, en una carga montada, el de la carga (`GolpeConArma.carga`:
   * la fuerza de la montura más la de la lanza). **El único sitio que la decide**:
   * la leen la tirada, el daño medio y la previsión.
   */
  readonly danio: readonly [number, number];
}

/**
 * Lo que decide un golpe, una vez. Solo el que corre la recta (el primero del
 * intercambio, que es quien pasa `chargeHexes`) cobra la carga, y montada si lleva
 * su horquilla; el contraataque pasa 0, se contraataca desde el sitio.
 */
function deUnGolpe(attacker: BattleStack, opts: DamageOptions): DeUnGolpe {
  const uso = usoDelGolpe(opts);
  const charge = cargaEfectiva(opts.chargeHexes ?? 0, CARGA);
  const deLaCarga = charge > 0 ? golpeDe(attacker.unit, 'arma').carga : undefined;
  // La fuerza y la agilidad de un hechizo (06-11-2026): la agilidad, no en el arma de
  // fuego, que pega con la suya (`cifrasDelCuerpo`).
  const agilidad = perforaLaArmadura(attacker.unit, uso) ? 0 : effectTotal(attacker, 'agilidad');
  return {
    charge,
    montada: deLaCarga !== undefined,
    uso,
    danio: danioConLosEfectos(
      deLaCarga ?? cifrasDelGolpe(attacker.unit, uso).damage,
      effectTotal(attacker, 'fuerza'),
      agilidad,
    ),
  };
}

/**
 * El daño [mín, máx] por individuo con que tira un golpe de `attacker` con `opts`
 * (`deUnGolpe`): el de su arma o su carga, con la fuerza y la agilidad de un hechizo.
 * Para leerlo de fuera (la ficha, los guardias).
 */
export function danioPorIndividuo(
  attacker: BattleStack,
  opts: DamageOptions = {},
): readonly [number, number] {
  return deUnGolpe(attacker, opts).danio;
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
function tiradaDe(opts: DamageOptions, golpe: DeUnGolpe, rng: Rng): number {
  const { cruce, cuarto } = opts;
  const t = enElCruce(golpe.danio, cruce, cuarto);
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
 * Daño MEDIO de un golpe, sin tirada: la tirada se sustituye por el centro del
 * intervalo de la criatura.
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
  return trasLaArmadura(
    medioSinArmadura(attacker, defender, opts),
    defender,
    perforaLaArmadura(attacker.unit, usoDelGolpe(opts)),
  ).danio;
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
  const t = enElCruce(golpe.danio, opts.cruce, opts.cuarto);
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
  if (armaduraEnLaPelea(defender) === 0 && escudoDe(defender) === 0) return 1;
  const bruto = medioSinArmadura(attacker, defender, opts);
  if (bruto <= 0) return 0;
  const perfora = perforaLaArmadura(attacker.unit, usoDelGolpe(opts));
  return trasLaArmadura(bruto, defender, perfora).danio / bruto;
}

/** Daño que inflige `attacker` a `defender`. Sin suerte desde el 02-11-2026. */
export function computeDamage(
  attacker: BattleStack,
  defender: BattleStack,
  rng: Rng,
  opts: DamageOptions,
): DamageResult {
  const golpe = deUnGolpe(attacker, opts);
  const roll = tiradaDe(opts, golpe, rng);
  const base = applyModifiers(roll * attacker.count, attacker, defender, opts, golpe);
  const { charge, montada } = golpe;
  return {
    damage: danioFinal(base),
    charge,
    montada,
    perfora: perforaLaArmadura(attacker.unit, golpe.uso),
  };
}

/** Una horquilla de daño: lo menos y lo más que puede quitar un golpe. */
export interface Horquilla {
  readonly min: number;
  readonly max: number;
}

/**
 * Lo que puede quitar un golpe de `attacker` a `defender` ANTES de tirar: la
 * horquilla y los modificadores con su causa.
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
  const { min: tMin, max: tMax } = enElCruce(golpe.danio, cruce, cuarto);
  const modificadores: Modificador[] = [];
  // Con armas por uso, lo primero es con cuál pega: la horquilla es
  // la de esa arma, y la previsión y el contraataque lo dicen sin campos nuevos.
  const conArma =
    attacker.unit.armas === undefined
      ? null
      : dichoDelGolpe(attacker.unit, golpe.uso, golpe.charge > 0);
  if (conArma !== null) modificadores.push({ causa: conArma, factor: null });
  if (cruce !== undefined) modificadores.push({ causa: cruce.causaDeLaTirada, factor: null });
  const bajo = applyModifiers(
    tMin * attacker.count,
    attacker,
    defender,
    opts,
    golpe,
    modificadores,
  );
  const alto = applyModifiers(tMax * attacker.count, attacker, defender, opts, golpe);
  const perfora = perforaLaArmadura(attacker.unit, golpe.uso);
  const llega = (d: number): number => trasLaArmadura(d, defender, perfora).danio;
  // La armadura, lo último y con la misma resta que el golpe (`herir`): es
  // monótona, así que los extremos siguen siéndolo. El arma de fuego la perfora.
  const a = armaduraEnLaPelea(defender);
  if (a > 0) {
    modificadores.push({
      causa: perfora ? 'perfora la armadura' : `−${a} armadura`,
      factor: null,
    });
  }
  return {
    danio: { min: llega(danioFinal(bajo)), max: llega(danioFinal(alto)) },
    modificadores,
    conArma,
  };
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
 * Lo que un golpe lleva a `herir`: su daño y si perfora la armadura, tal como lo dio
 * (`DamageResult`). Va junto para que nadie pase el daño y se olvide de la
 * perforación (la salpicadura de un arma de fuego la perdía; F2 de /simplify,
 * 02-11-2026); un hechizo o un poder, `{ damage, perfora: false }`.
 */
export type GolpeQueHiere = Pick<DamageResult, 'damage' | 'perfora'>;

/**
 * Hiere a `objetivo` con `golpe` y le apunta la experiencia a `autor`:
 * **los PV quitados de verdad × el índice de poder del que los recibe**
 * (`indiceDePoder`: el de sus cifras con su equipo, no su rango; el índice entero y
 * no su primera cifra, para que un veterano o un héroe que sube cifras pague más
 * aunque no cambie de nivel). Los umbrales de `data/experiencia.json` van en esa
 * escala: nada se divide entre 100. Devuelve los
 * muertos, como `applyDamage`, y el daño que llegó.
 *
 * `golpe.damage` es el del golpe; **la armadura se resta aquí** (`trasLaArmadura`,
 * #262), así que no hay manera de quitar vida saltándosela; solo el disparo de un
 * arma de fuego llega entero (`golpe.perfora`). Lo que dependa de lo
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
export function herir(
  objetivo: BattleStack,
  golpe: GolpeQueHiere,
  autor: BattleStack | null,
): Herida {
  const { danio, parado, absorbido } = trasLaArmadura(golpe.damage, objetivo, golpe.perfora);
  if (absorbido !== undefined && absorbido > 0) gastarElEscudo(objetivo, absorbido);
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

/**
 * Gasta `n` de los escudos de un hechizo de `s` (`escudo`), en el orden en que se
 * colgaron, y quita el que se agota. Lo llama solo `herir`, con lo que se comió
 * (`trasLaArmadura`).
 */
function gastarElEscudo(s: BattleStack, n: number): void {
  let falta = n;
  for (const e of s.effects) {
    if (e.kind !== 'escudo' || falta === 0) continue;
    const quita = Math.min(e.queda, falta);
    e.queda -= quita;
    falta -= quita;
  }
  if (s.effects.some((e) => e.kind === 'escudo' && e.queda <= 0)) {
    s.effects = s.effects.filter((e) => e.kind !== 'escudo' || e.queda > 0);
  }
}

/** Puntos de vida totales que le quedan a un stack. Útil para la IA. */
export function stackHp(stack: BattleStack): number {
  if (stack.count === 0) return 0;
  return (stack.count - 1) * stack.unit.hp + stack.topHp;
}
