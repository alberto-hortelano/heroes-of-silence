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
 * **La montura** (26-10-2026, «se usa la fuerza de la montura para el peso y su
 * movimiento»): con una de guerra puesta, el peso de lo que lleva el jinete y el
 * de la montura se mide contra la fuerza de ella, y de la agilidad que le queda a
 * ella salen las casillas (`casillasDeLaMontura`); el jinete pelea con su agilidad
 * entera (decisión del usuario: el peso lo carga el caballo), y con una lanza su
 * carga va con la fuerza de la montura. La de silla no cambia nada en batalla: solo
 * la marcha del mapa (`marchaDe`).
 *
 * Puro y en enteros: sin coma flotante (`test/invariantes.test.ts`). No importa
 * nada del núcleo salvo los escalones de velocidad.
 */
import {
  type MonturaPuesta,
  SPEED_TIERS,
  SPEED_TO_HEXES,
  type SpeedTier,
  type UnitInfo,
} from './types.js';

/** La agilidad efectiva no baja de aquí, pese lo que pese. */
const AGILIDAD_MINIMA = 1;

const CASILLAS_MIN = Math.min(...SPEED_TIERS.map((t) => SPEED_TO_HEXES[t]));
export const CASILLAS_MAX = Math.max(...SPEED_TIERS.map((t) => SPEED_TO_HEXES[t]));

/**
 * La agilidad que puede escribir un cuerpo o una montura, de 2 a 7: la escala de
 * las casillas de antes (decisión del usuario, 25-10-2026). Con el peso encima baja
 * hasta 1 (`AGILIDAD_MINIMA`), pero ninguno nace así. Aquí y no en `unidad.ts`
 * porque la juzgan la unidad y la pieza de montura (`problemasDePieza`, `data.ts`).
 */
export const AGILIDAD_DEL_CUERPO_MIN = 2;
export const AGILIDAD_DEL_CUERPO_MAX = CASILLAS_MAX;

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

/** La unidad, ya vestida, con lo que hace falta para leer su agilidad y su montura. */
type Vestida = Pick<UnitInfo, 'agilidad' | 'fuerza' | 'peso' | 'montura'>;

/**
 * La agilidad con que pelea `u`, ya vestida: la de su cuerpo menos lo que le resta
 * lo que pesa todo lo puesto (`UnitInfo.peso`, que escribe `conEquipo`); montada
 * en una de guerra, la entera (el peso lo carga la montura). La leen el contrato
 * del agente y la ficha de la arena.
 */
export function agilidadDe(u: Vestida): number {
  return montadoDeGuerra(u) ? u.agilidad : agilidadEfectiva(u.agilidad, u.fuerza, u.peso ?? 0);
}

/**
 * Lo que le resta a la agilidad de `u`, ya vestida, lo que pesa todo lo puesto
 * (`restaDelPeso`); montada en una de guerra, nada: se lo resta a la montura
 * (`restaALaMontura`).
 */
export function restaDelPesoDe(u: Vestida): number {
  return montadoDeGuerra(u) ? 0 : restaDelPeso(u.fuerza, u.peso ?? 0);
}

/**
 * Si `u` lleva puesta una montura de guerra (`Pieza.guerra`): la que se monta en
 * batalla. La lectura para quien lo enseña (la ficha de la arena).
 */
export function montadoDeGuerra(u: Pick<UnitInfo, 'montura'>): boolean {
  return u.montura?.guerra === true;
}

/** Las cifras de una montura que entran en la cuenta (`MonturaPuesta`, sin su nombre). */
type CifrasDeMontura = Pick<MonturaPuesta, 'fuerza' | 'agilidad' | 'peso' | 'guerra'>;

/**
 * Las casillas que anda la montura `m` con `peso` encima (lo que lleva el jinete):
 * su agilidad menos lo que le resta ese peso y el suyo frente a su fuerza, sin pasar
 * de 7 (D3 del plan: el jinete no pesa; pesa lo que lleva y la propia montura). **La
 * única cuenta de las casillas de una montura**: la de la batalla
 * (`cifrasDelCuerpo`) y la del mapa (`marchaDe`).
 */
function casillasDeLaMontura(m: CifrasDeMontura, peso: number): number {
  return Math.min(agilidadEfectiva(m.agilidad, m.fuerza, peso + m.peso), CASILLAS_MAX);
}

/**
 * Lo que el peso le resta a la agilidad de la montura de `u` (lo de su jinete y lo
 * suyo frente a su fuerza), o `null` sin montura: lo enseña la ficha de la arena.
 */
export function restaALaMontura(u: Pick<UnitInfo, 'peso' | 'montura'>): number | null {
  const m = u.montura;
  return m === undefined ? null : restaDelPeso(m.fuerza, (u.peso ?? 0) + m.peso);
}

/**
 * El escalón con que `u`, ya vestida, cuenta en la marcha del mapa: con una montura
 * puesta, de guerra o de silla, las casillas de ella (`casillasDeLaMontura`); a pie,
 * las de batalla (26-10-2026: «caballos que no sean de guerra para que puedan mover
 * más en el mapa, pero sigue limitado al más lento del grupo»). La lee
 * `slowestSpeed`, y la ficha y el agente la enseñan.
 */
export function marchaDe(u: Pick<UnitInfo, 'peso' | 'montura' | 'speed'>): SpeedTier {
  const m = u.montura;
  return m === undefined ? u.speed : escalonDeCasillas(casillasDeLaMontura(m, u.peso ?? 0));
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

/**
 * Lo que el equipo pone en la cuenta: lo que pesa todo (sin la montura), la fuerza
 * del arma del golpe, la defensa del escudo y, si la hay, la montura y la fuerza de
 * la mejor lanza puesta (la de la carga montada).
 */
interface LoQuePoneElEquipo {
  readonly peso: number;
  readonly fuerzaDelArma: number;
  readonly defensaDelEscudo: number;
  readonly montura?: CifrasDeMontura;
  readonly fuerzaDeLaLanza?: number;
}

/** Sin equipo. */
const SIN_EQUIPO: LoQuePoneElEquipo = { peso: 0, fuerzaDelArma: 0, defensaDelEscudo: 0 };

/** Las derivadas de un cuerpo. */
interface CifrasDerivadas {
  readonly defense: number;
  readonly damage: readonly [number, number];
  readonly speed: SpeedTier;
  /** Montado de guerra y con lanza, la horquilla de la carga (`GolpeConArma.carga`); si no, no está. */
  readonly carga?: readonly [number, number];
}

/**
 * **Las cifras derivadas de un cuerpo con su equipo**: la defensa, el daño (con la
 * fuerza del arma de ese golpe), el escalón de velocidad y, montado de guerra y con
 * lanza, la carga. La única cuenta; la leen el cuerpo desnudo (la unidad, el héroe,
 * el personaje, el rango) y el vestido (`conEquipo`).
 *
 * Con una montura de guerra (26-10-2026), el jinete pelea con su agilidad entera,
 * las casillas son las de la montura con el peso encima y la carga con lanza es
 * [F, F × agilidad del jinete] con F = la fuerza de la montura más la de la lanza:
 * la fuerza de la montura no entra en el daño de ningún otro golpe. La de silla no
 * cuenta aquí: solo en el mapa (`marchaDe`).
 */
export function cifrasDelCuerpo(
  c: Primitivas,
  eq: LoQuePoneElEquipo = SIN_EQUIPO,
): CifrasDerivadas {
  const deGuerra = eq.montura?.guerra === true ? eq.montura : null;
  const ag = deGuerra === null ? agilidadEfectiva(c.agilidad, c.fuerza, eq.peso) : c.agilidad;
  const casillas =
    deGuerra === null ? Math.min(ag, CASILLAS_MAX) : casillasDeLaMontura(deGuerra, eq.peso);
  const derivadas = {
    defense: ag + eq.defensaDelEscudo + c.defensaPropia,
    damage: danioDeLaFuerza(c.fuerza + eq.fuerzaDelArma, ag),
    speed: escalonDeCasillas(casillas),
  };
  if (deGuerra === null || eq.fuerzaDeLaLanza === undefined) return derivadas;
  return { ...derivadas, carga: danioDeLaFuerza(deGuerra.fuerza + eq.fuerzaDeLaLanza, ag) };
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
