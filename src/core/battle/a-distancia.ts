/**
 * La jugada a distancia antes de jugarla: quién puede apuntar y a qué casilla
 * (`apuntarBlocker`; la regla del tirador, `disparoBlocker`, con la recarga del arma de
 * fuego, `recargaQueFalta`), la recta del disparo diferido y a quién da
 * (`lineaDelDisparo`, la única regla), y la granada: quién puede lanzarla y a dónde
 * (`lanzarBlocker`), las que le quedan (`granadasQueQuedan`) y a quién da al explotar
 * (`explosionDe`). Con las opciones de su daño (`opcionesDelDisparo`,
 * `opcionesDeLaGranada`), lo que elige el botón «A distancia» (`aDistanciaBlocker`,
 * `tanteoADistancia`) y lo que pierde el stack al que un retoque de la arena le cambia
 * la clase de tiro (`loADistanciaTrasElRetoque`). Lo leen el motor, la previsión, la IA
 * y la pantalla; el disparo y la explosión en marcha (`dispararLoApuntado`,
 * `explotarLaGranada`), la recarga y las granadas lanzadas son del motor (`battle.ts`).
 *
 * Vivía en `battle.ts` hasta la fase N de la reorganización (07-11-2026).
 */
import { conPlural } from '../texto.js';
import type { Hex, UnitInfo } from '../types.js';
import { cargasDe, isShooter, lanzaGranadas, mismoTiro } from './armas.js';
import {
  hexDistance,
  hexEquals,
  indiceDe,
  isInside,
  lineaDeTiro,
  octavosHastaLaRecta,
} from './board.js';
import {
  activeStack,
  faseBlocker,
  impedimentoBlocker,
  isEngaged,
  seHaMovido,
  vivoEn,
} from './consultas.js';
import { cuartoDelDisparo, type DamageOptions } from './damage.js';
import { type ExtraDelEstado, opcionesDeDanio } from './golpe.js';
import { alcanceDeLaGranada, casillasDeLaExplosion } from './granada.js';
import { enLoAlto, esMuro, hayMuralla, pasoPorPuertas } from './muralla.js';
import type { BattleAction, BattleStack, BattleState } from './types.js';

/**
 * Por qué `s` no puede apuntar ahora, o `null` si puede. ÚNICA redacción de la
 * regla del tirador: la leen `legalActions` para ofrecer el `aim` y `applyAction`
 * para rechazarlo —con el id delante—, y `apuntarBlocker` para explicárselo a la
 * persona. Antes la lista y el rechazo la escribían cada uno, y el cliente
 * inventaba una tercera frase («no alcanzas a esa unidad») que a un tirador que
 * se acababa de mover le decía algo falso.
 */
export function disparoBlocker(state: BattleState, s: BattleStack): string | null {
  if (!isShooter(s.unit)) return 'no es tirador';
  const impedido = impedimentoBlocker(state, s, 'disparar');
  if (impedido !== null) return impedido;
  // La recarga del arma de fuego (02-11-2026): el turno en que sale el disparo cuenta.
  if (s.recargando > 0) return `está recargando: ${recargaQueFalta(s.recargando)}`;
  if (seHaMovido(state, s)) return 'ya se ha movido este turno: no puede apuntar';
  if (isEngaged(state, s)) return 'tiene un enemigo encima';
  return null;
}

/**
 * Lo que le falta de recarga a quien le quedan `n` turnos: «le falta 1 turno», «le
 * faltan 2 turnos». Lo dicen la regla de apuntar (`disparoBlocker`) y el panel.
 */
export function recargaQueFalta(n: number): string {
  return n === 1 ? 'le falta 1 turno' : `le faltan ${n} turnos`;
}

/**
 * Lo pendiente a distancia de `s` si pasa a pelear con las cifras `unit` (un retoque
 * de la arena a media pelea, `conCifrasNuevas`): lo de siempre si tira igual
 * (`mismoTiro`); si no, sin lo apuntado, sin la granada en el aire y sin recarga
 * (hallazgo E4 de /simplify, 02-11-2026: la granada explotaba con las cifras del arma
 * nueva y la recarga bloqueaba un arco recién puesto). Lo que lleva lanzado se queda:
 * lo que queda se deriva de la pieza (`granadasQueQuedan`).
 */
export function loADistanciaTrasElRetoque(
  s: BattleStack,
  unit: UnitInfo,
): Pick<BattleStack, 'apuntado' | 'granada' | 'recargando'> {
  return mismoTiro(s.unit, unit)
    ? { apuntado: s.apuntado, granada: s.granada, recargando: s.recargando }
    : { apuntado: null, granada: null, recargando: 0 };
}

/**
 * Las granadas que le quedan a `s` en esta batalla: las que lleva su pieza
 * (`cargasDe`) menos las que ha lanzado, sin bajar de 0. Derivado, y no guardado: un
 * retoque de la arena a media pelea no descuadra la cuenta. Lo leen la regla de
 * lanzar, el panel, el contrato y la IA.
 */
export function granadasQueQuedan(s: BattleStack): number {
  return Math.max(0, cargasDe(s.unit) - s.granadasLanzadas);
}

/**
 * Por qué `s` no puede lanzar una granada ahora, sin mirar la casilla, o `null`:
 * que la lleve, que le queden, sin moverse y sin un enemigo al lado (como el
 * tirador). La leen `lanzarBlocker` y la lista legal.
 */
export function granadaBlocker(state: BattleState, s: BattleStack): string | null {
  if (!lanzaGranadas(s.unit)) return 'no lleva granadas';
  const impedido = impedimentoBlocker(state, s, 'disparar');
  if (impedido !== null) return impedido;
  if (granadasQueQuedan(s) === 0) return 'se ha quedado sin granadas: lanzó las que llevaba';
  if (seHaMovido(state, s)) return 'ya se ha movido este turno: no puede lanzar';
  if (isEngaged(state, s)) return 'tiene un enemigo encima';
  return null;
}

/**
 * Por qué la unidad activa no puede lanzar una granada a `at`, o `null` (02-11-2026,
 * regla nuestra): la regla de quien la lanza (`granadaBlocker`) y la casilla, en el
 * tablero, no la suya y a su alcance (`alcanceDeLaGranada`, por la distancia en
 * casillas). **La recta no se mira**: va por encima, y no la paran unidades, muros
 * ni puertas. Sin `at`, solo si puede lanzar (el botón). La leen `applyAction`, la
 * previsión y la pantalla, con el nombre de la unidad delante.
 */
export function lanzarBlocker(state: BattleState, at?: Hex): string | null {
  const s = activeStack(state);
  if (s === null || state.finished !== null) return 'no le toca a ninguna unidad';
  const porLaFase = faseBlocker(state, 'throw');
  if (porLaFase !== null) return porLaFase;
  const motivo = granadaBlocker(state, s);
  if (motivo !== null) return `${s.unit.name} ${motivo}`;
  if (at === undefined) return null;
  if (!isInside(at)) return `(${at.col},${at.row}) no es una casilla del tablero`;
  if (hexEquals(at, s.hex)) return `${s.unit.name} no puede lanzar a su propia casilla`;
  const alcance = alcanceDeLaGranada(s.unit);
  const d = hexDistance(s.hex, at);
  if (d > alcance) {
    return `${s.unit.name} lanza hasta ${conPlural(alcance, 'casilla')} (su fuerza), y (${at.col},${at.row}) está a ${d}`;
  }
  return null;
}

/**
 * Por qué la activa no puede jugar a distancia (el botón «A distancia»), o `null`:
 * apuntar si dispara, lanzar si lleva granada (`tiroADistanciaDe`). Con casilla, lo
 * dice `tanteoADistancia`.
 */
export function aDistanciaBlocker(state: BattleState): string | null {
  const s = activeStack(state);
  if (s !== null && lanzaGranadas(s.unit)) return lanzarBlocker(state);
  return apuntarBlocker(state);
}

/**
 * La jugada a distancia de la activa en `at` y lo que se vería con ella ahora, o por
 * qué no se puede: apuntar y la recta del disparo (`lineaDelDisparo`) si dispara;
 * lanzar y su explosión (`explosionDe`) si lleva granada. **El único sitio que elige
 * entre las dos** (hallazgo S3 de /simplify, 02-11-2026: lo elegían a la vez el
 * blocker, la jugada y el tanteo de la sesión): la pantalla pinta según la forma.
 */
export type TanteoADistancia =
  | {
      readonly kind: 'disparo';
      readonly jugada: BattleAction & { type: 'aim' };
      readonly linea: LineaDelDisparo;
    }
  | {
      readonly kind: 'granada';
      readonly jugada: BattleAction & { type: 'throw' };
      readonly explosion: ExplosionDeLaGranada;
    }
  | { readonly kind: 'no'; readonly motivo: string };

export function tanteoADistancia(state: BattleState, at: Hex): TanteoADistancia {
  const s = activeStack(state);
  if (s === null || state.finished !== null) {
    return { kind: 'no', motivo: 'no le toca a ninguna unidad' };
  }
  const casilla = { col: at.col, row: at.row };
  if (lanzaGranadas(s.unit)) {
    const motivo = lanzarBlocker(state, casilla);
    if (motivo !== null) return { kind: 'no', motivo };
    return {
      kind: 'granada',
      jugada: { type: 'throw', at: casilla },
      explosion: explosionDe(state, casilla),
    };
  }
  const motivo = apuntarBlocker(state, casilla);
  if (motivo !== null) return { kind: 'no', motivo };
  return {
    kind: 'disparo',
    jugada: { type: 'aim', at: casilla },
    linea: lineaDelDisparo(state, s, casilla),
  };
}

/** A quién da una granada y cuánto (`explosionDe`). */
export interface ExplosionDeLaGranada {
  /** Dónde explota. */
  readonly at: Hex;
  /** Las casillas que alcanza, cada una con el cuarto de su tirada (`casillasDeLaExplosion`). */
  readonly casillas: readonly CasillaDelAlcance[];
  /** Los vivos que hay hoy en ellas, de cualquier bando (también quien la lanza), con su cuarto. */
  readonly alcanzados: readonly { readonly stack: BattleStack; readonly cuarto: number }[];
}

/**
 * A quién da hoy la granada de `s` que explota en `at`: todo vivo en la casilla
 * (el cuarto del centro) y en sus seis vecinas (el del anillo), **de cualquier
 * bando**, quien la lanzó incluido. La única regla: la leen la explosión
 * (`explotarLaGranada`), su previsión, la IA y lo que se pinta.
 */
export function explosionDe(state: BattleState, at: Hex): ExplosionDeLaGranada {
  const casillas = casillasDeLaExplosion(at);
  const alcanzados = casillas.flatMap((c) => {
    const quien = vivoEn(state, c.hex);
    return quien === null ? [] : [{ stack: quien, cuarto: c.cuarto }];
  });
  return { at, casillas, alcanzados };
}

/**
 * Las opciones del daño de la granada de `s` sobre `t`, con la tirada en el cuarto
 * `cuarto`: a distancia (el arma de su hueco `distancia`, la granada) y con lo alto
 * de un muro como todo golpe. La leen la explosión, su previsión y la IA.
 */
export function opcionesDeLaGranada(
  state: BattleState,
  s: BattleStack,
  t: BattleStack,
  cuarto: number,
): DamageOptions {
  return opcionesDeDanio(state, s, t, extraDeLaGranada(cuarto));
}

/** Lo que trae la granada a sus opciones (`opcionesDeLaGranada`): a distancia, en su cuarto. */
export function extraDeLaGranada(cuarto: number): Omit<DamageOptions, ExtraDelEstado> {
  return { ranged: true, cuarto };
}

/**
 * Por qué la unidad activa no puede apuntar a la casilla `at`, o `null`: la regla
 * del tirador (`disparoBlocker`) y la casilla, que tiene que estar en el tablero y
 * no ser la suya. Vale cualquier otra, con alguien o vacía: la recta y a quién da
 * se ven al salir el disparo (`lineaDelDisparo`). Sin `at`, solo si puede apuntar
 * (el botón). La leen `applyAction`, la previsión y la pantalla, con el nombre de
 * la unidad delante, como los demás `*Blocker` (el id, «attacker-0», no le dice
 * nada a quien juega; H4 del QA de fuerza y agilidad, 26-10-2026).
 */
export function apuntarBlocker(state: BattleState, at?: Hex): string | null {
  const s = activeStack(state);
  if (s === null || state.finished !== null) return 'no le toca a ninguna unidad';
  const porLaFase = faseBlocker(state, 'aim');
  if (porLaFase !== null) return porLaFase;
  const motivo = disparoBlocker(state, s);
  if (motivo !== null) return `${s.unit.name} ${motivo}`;
  // Sin casilla, solo si puede apuntar: el botón «Apuntar».
  if (at === undefined) return null;
  if (!isInside(at)) return `(${at.col},${at.row}) no es una casilla del tablero`;
  if (hexEquals(at, s.hex)) return `${s.unit.name} no puede apuntar a su propia casilla`;
  return null;
}

/** La recta de un disparo diferido y a quién da (`lineaDelDisparo`). */
export interface LineaDelDisparo {
  /** De dónde sale: la casilla del tirador ahora. */
  readonly desde: Hex;
  /** A dónde apunta. */
  readonly at: Hex;
  /**
   * Las casillas de la recta hasta donde llega, en orden y sin la del tirador: hasta
   * la del alcanzado, hasta lo alto del muro del que bajaría o hasta antes de la
   * puerta que la para, o hasta el borde del tablero (la recta sigue tras `at`).
   */
  readonly casillas: readonly Hex[];
  /** El primero de la recta, de cualquier bando; `null` si no da a nadie. */
  readonly alcanzado: BattleStack | null;
  /** Lo que paró la recta antes del borde sin dar a nadie, o `null`. */
  readonly parada: 'muro' | 'puerta' | null;
  /**
   * Las casillas en que el disparo daría a quien estuviera en ella, en orden y sin
   * mirar quién hay: la recta hasta el borde, o hasta lo que la para (desde el suelo,
   * lo alto del muro, que a quien está en él le da, antes de bajar de él; la puerta
   * cerrada, antes de ella). Cada
   * una con el cuarto de la horquilla en que caería su tirada (`cuartoDelDisparo`):
   * lo que pinta el tablero al apuntar, porque al salir el disparo ya se habrán
   * movido todos.
   */
  readonly alcance: readonly CasillaDelAlcance[];
}

/** Una casilla del alcance de un disparo diferido y el cuarto de su tirada (0 a 4). */
export interface CasillaDelAlcance {
  readonly hex: Hex;
  readonly cuarto: number;
}

/**
 * Por dónde va el disparo diferido de `s` a `at` ahora y a quién da: **el primer
 * vivo de la recta que no es el tirador, sea del bando que sea** (25-10-2026,
 * decisión del usuario: «da al primero que se encuentre en esa línea, aunque sea de
 * tu equipo»), también tras `at` (01-11-2026: la recta sigue hasta el borde). La
 * recta es la de `lineaDeTiro` (un rayo, el del
 * bando del tirador). Desde el suelo **sube a lo alto del muro** y da al primero
 * que haya arriba, en cualquier casilla de muro que cruce (06-11-2026, petición
 * del usuario: «Los disparos de abajo del muro al muro no dan»: la recta en
 * diagonal rozaba la casilla de muro vacía de al lado antes que la del blanco, y en
 * una muralla gruesa la columna de fuera tapaba la de dentro); la para **bajar del
 * muro** (lo de detrás de la muralla no se alcanza desde el suelo) o el lado de una
 * puerta cerrada. Desde lo alto de la muralla pasa por encima de todo, como el tiro
 * de antes. La única regla: la leen el disparo (`dispararLoApuntado`), su
 * previsión, la IA y lo que se pinta.
 */
export function lineaDelDisparo(state: BattleState, s: BattleStack, at: Hex): LineaDelDisparo {
  const recta = lineaDeTiro(s.hex, at, s.side);
  const libre = enLoAlto(state, s) || !hayMuralla(state.muralla);
  // El lado de una puerta cerrada, con la misma regla que el paso al andar.
  const porPuertas = libre ? undefined : pasoPorPuertas(state.muralla, state.puertas);
  // Se anda la recta entera para el alcance; lo de hoy (`casillas`, `alcanzado`,
  // `parada`) se decide en la primera casilla que la corta.
  const alcance: CasillaDelAlcance[] = [];
  let alcanzado: BattleStack | null = null;
  let parada: LineaDelDisparo['parada'] = null;
  let hasta = 0;
  let antes = s.hex;
  // Desde el suelo, si la recta va ya por lo alto del muro.
  let arriba = false;
  for (let i = 0; i < recta.length; i++) {
    const h = recta[i] as Hex;
    if (porPuertas?.(indiceDe(antes), indiceDe(h)) === false) {
      if (alcanzado === null && parada === null) parada = 'puerta';
      break;
    }
    const muro = !libre && esMuro(state.muralla, h);
    if (arriba && !muro) {
      // La esquina de una casilla de suelo entre dos de muro (la recta casi a lo
      // largo de la muralla, que en el odd-r va en zigzag): pasa por encima.
      const siguiente = recta[i + 1];
      if (siguiente !== undefined && esMuro(state.muralla, siguiente)) {
        antes = h;
        continue;
      }
      // Baja del muro: lo de detrás no se alcanza desde el suelo.
      if (alcanzado === null && parada === null) parada = 'muro';
      break;
    }
    alcance.push({ hex: h, cuarto: cuartoDelDisparo(octavosHastaLaRecta(s.hex, at, h)) });
    if (alcanzado === null && parada === null) {
      const quien = vivoEn(state, h);
      if (quien !== null && quien.id !== s.id) alcanzado = quien;
      hasta = alcance.length;
    }
    arriba = muro;
    antes = h;
  }
  const casillas = alcance.slice(0, hasta).map((c) => c.hex);
  return { desde: s.hex, at, casillas, alcanzado, parada, alcance };
}

/**
 * Las opciones del daño del disparo diferido de `shooter` que alcanza a
 * `alcanzado` habiendo apuntado a `at`: a distancia y con la tirada en el cuarto
 * de lo lejos que pasa la recta del centro de su casilla (`cuartoDelDisparo`,
 * `octavosHastaLaRecta`), con lo alto de un
 * muro como todo golpe (`opcionesDeDanio`). La leen el disparo, su previsión y la
 * IA.
 */
export function opcionesDelDisparo(
  state: BattleState,
  shooter: BattleStack,
  alcanzado: BattleStack,
  at: Hex,
): DamageOptions {
  return opcionesDeDanio(state, shooter, alcanzado, extraDelDisparo(shooter, alcanzado, at));
}

/** Lo que trae el disparo diferido a sus opciones (`opcionesDelDisparo`). */
export function extraDelDisparo(
  shooter: BattleStack,
  alcanzado: BattleStack,
  at: Hex,
): Omit<DamageOptions, ExtraDelEstado> {
  return {
    ranged: true,
    cuarto: cuartoDelDisparo(octavosHastaLaRecta(shooter.hex, at, alcanzado.hex)),
  };
}
