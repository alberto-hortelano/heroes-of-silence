/**
 * **Fuerza, agilidad y peso** (25-10-2026, petición del usuario: «aparecen las
 * características fuerza y agilidad. El equipo deja de restar movimiento y todo
 * tiene un peso»): de la fuerza y la agilidad del cuerpo, con lo que pesa y suma
 * su equipo, salen la defensa, el daño y las casillas. **La única cuenta**: las
 * derivadas de `UnitInfo` (`defense`, `damage`, `speed`) las escribe solo
 * `cifrasDelCuerpo`, y lo vigila `test/invariantes.test.ts`.
 *
 * - El peso hasta la fuerza no resta; por encima, −1 de agilidad por cada 50 % de
 *   la fuerza que lo pase, truncado (fuerza 20: peso 30 → −1, 40 → −2, 25 → 0;
 *   decisión del usuario). Con todo, la agilidad efectiva no baja de 1.
 * - Defensa = agilidad efectiva + la del escudo + la propia (la Defensa del héroe).
 * - Daño = [F, F × agilidad efectiva], con F = la fuerza más la que suma el arma:
 *   lo torpe y fuerte pega parejo (troll 55-110) y lo ágil, con mucha variación.
 * - Casillas = agilidad efectiva, sin pasar de 7.
 *
 * Puro y en enteros: sin coma flotante (`test/invariantes.test.ts`). No importa
 * nada del núcleo salvo los escalones de velocidad.
 */
import { SPEED_TIERS, SPEED_TO_HEXES, type SpeedTier, type UnitInfo } from './types.js';

/** La agilidad efectiva no baja de aquí, pese lo que pese. */
const AGILIDAD_MINIMA = 1;

const CASILLAS_MIN = Math.min(...SPEED_TIERS.map((t) => SPEED_TO_HEXES[t]));
export const CASILLAS_MAX = Math.max(...SPEED_TIERS.map((t) => SPEED_TO_HEXES[t]));

/**
 * Lo que resta a la agilidad llevar `peso` con `fuerza`: nada hasta la fuerza, y
 * uno por cada mitad de la fuerza que la pase, truncado.
 */
export function restaDelPeso(fuerza: number, peso: number): number {
  if (!Number.isInteger(fuerza) || fuerza < 1) {
    throw new Error(`la fuerza es un entero de 1 o más, y es ${fuerza}`);
  }
  if (peso <= fuerza) return 0;
  return Math.floor((2 * (peso - fuerza)) / fuerza);
}

/** La agilidad que queda con `peso` encima: la del cuerpo menos lo que resta el peso, como poco 1. */
export function agilidadEfectiva(agilidad: number, fuerza: number, peso: number): number {
  return Math.max(AGILIDAD_MINIMA, agilidad - restaDelPeso(fuerza, peso));
}

/**
 * La agilidad con que pelea `u`, ya vestida: la de su cuerpo menos lo que le resta
 * lo que pesa todo lo puesto (`UnitInfo.peso`, que escribe `conEquipo`). La leen
 * el contrato del agente y la ficha de la arena.
 */
export function agilidadDe(u: Pick<UnitInfo, 'agilidad' | 'fuerza' | 'peso'>): number {
  return agilidadEfectiva(u.agilidad, u.fuerza, u.peso ?? 0);
}

/** Lo que le resta a la agilidad de `u`, ya vestida, lo que pesa todo lo puesto (`restaDelPeso`). */
export function restaDelPesoDe(u: Pick<UnitInfo, 'fuerza' | 'peso'>): number {
  return restaDelPeso(u.fuerza, u.peso ?? 0);
}

/**
 * El escalón del motor que mueve `n` casillas: la inversa de `SPEED_TO_HEXES`,
 * que es una biyección (1 a 7). La ÚNICA traducción de casillas a escalón; lo que
 * no es un escalón se rechaza diciendo cuáles valen.
 */
export function escalonDeCasillas(n: number): SpeedTier {
  const tier = SPEED_TIERS.find((t) => SPEED_TO_HEXES[t] === n);
  if (tier === undefined) {
    throw new Error(`la velocidad es de ${CASILLAS_MIN} a ${CASILLAS_MAX} casillas, y es ${n}`);
  }
  return tier;
}

/** El daño de un golpe con la fuerza `fuerza` (la del cuerpo y la del arma) y la agilidad efectiva `agilidad`. */
function danioDeLaFuerza(fuerza: number, agilidad: number): readonly [number, number] {
  return [fuerza, fuerza * agilidad];
}

/** Las cifras primitivas de un cuerpo: de ellas y del equipo sale lo demás. */
type Primitivas = Pick<UnitInfo, 'fuerza' | 'agilidad' | 'defensaPropia'>;

/** Lo que el equipo pone en la cuenta: lo que pesa todo, la fuerza del arma del golpe y la defensa del escudo. */
interface LoQuePoneElEquipo {
  readonly peso: number;
  readonly fuerzaDelArma: number;
  readonly defensaDelEscudo: number;
}

/** Sin equipo. */
const SIN_EQUIPO: LoQuePoneElEquipo = { peso: 0, fuerzaDelArma: 0, defensaDelEscudo: 0 };

/** Las derivadas de un cuerpo. */
interface CifrasDerivadas {
  readonly defense: number;
  readonly damage: readonly [number, number];
  readonly speed: SpeedTier;
}

/**
 * **Las cifras derivadas de un cuerpo con su equipo**: la defensa, el daño (con la
 * fuerza del arma de ese golpe) y el escalón de velocidad. La única
 * cuenta; la leen el cuerpo desnudo (la unidad, el héroe, el personaje, el rango)
 * y el vestido (`conEquipo`).
 */
export function cifrasDelCuerpo(
  c: Primitivas,
  eq: LoQuePoneElEquipo = SIN_EQUIPO,
): CifrasDerivadas {
  const ag = agilidadEfectiva(c.agilidad, c.fuerza, eq.peso);
  return {
    defense: ag + eq.defensaDelEscudo + c.defensaPropia,
    damage: danioDeLaFuerza(c.fuerza + eq.fuerzaDelArma, ag),
    speed: escalonDeCasillas(Math.min(ag, CASILLAS_MAX)),
  };
}

/**
 * Un cuerpo sin nada puesto: sus primitivas con las derivadas escritas por
 * `cifrasDelCuerpo`. Lo que no es cifra (`name`, `faction`, rasgos…) va en `resto`.
 */
export function cuerpoConSusCifras<U extends Omit<UnitInfo, 'defense' | 'damage' | 'speed'>>(
  u: U,
): U & Pick<UnitInfo, 'defense' | 'damage' | 'speed'> {
  const { defense, damage, speed } = cifrasDelCuerpo(u);
  return { ...u, defense, damage, speed };
}
