/**
 * El asalto a una muralla: la escala —poner la escalera y subir (`escaleraBlocker`,
 * `subirBlocker`; la regla, `escalaDesde`, y quién no escala nunca, `quienNoEscala`)—
 * y las puertas, que abre y cierra quien defiende (`puertaBlocker`, `quienNoAbre`), con
 * las jugadas que se ofrecen (`escalasA`, `puertasA`) y su orden (`TIPOS_DE_ESCALA`,
 * `TIPOS_DE_PUERTA`). Lo que se hace al jugarlas, en el motor (`applyAction`).
 *
 * Vivía en `battle.ts` hasta la fase N de la reorganización (07-11-2026).
 */
import { type Hex, hasTrait, type UnitInfo } from '../types.js';
import { areAdjacent, hexEquals, neighbours } from './board.js';
import { activeStack, comoSube, faseBlocker, isAlive, seHaMovido } from './consultas.js';
import { esMuro, hayMuralla, mismaPuerta, nombreDePuerta } from './muralla.js';
import type {
  BattleAction,
  BattleStack,
  BattleState,
  PuertaDeMuralla,
  Side,
  TipoDeEscala,
  TipoDePuerta,
} from './types.js';

/**
 * Por qué la unidad activa no puede poner su escalera contra el muro `muro`, o
 * `null` si puede. La escribe el núcleo; la leen `legalActions` y `applyAction`.
 */
export function escaleraBlocker(state: BattleState, muro: Hex): string | null {
  return escalaDeLaActiva(state, 'poner_escalera', muro);
}

/**
 * Por qué la unidad activa no puede subir al muro `muro`, o `null` si puede:
 * por una escalera puesta en su pie contra ese muro, o porque sabe escalar.
 */
export function subirBlocker(state: BattleState, muro: Hex): string | null {
  return escalaDeLaActiva(state, 'subir', muro);
}

/**
 * Por qué la unidad activa no puede `tipo` contra ningún muro de su pie, o
 * `null` si puede contra alguno. Es la frase del botón («Poner escalera»,
 * «Subir»), que no sabe aún contra qué muro: ese lo elige el clic. Sale de lo
 * que ofrece la lista (`escalasA`); si no ofrece nada, el motivo es el del
 * muro que más dice (`muroQueMasDice`), o el de ninguno.
 */
export function escalaBlocker(state: BattleState, tipo: TipoDeEscala): string | null {
  const s = activeStack(state);
  if (s === null || state.finished !== null) return 'no le toca a ninguna unidad';
  const porLaFase = faseBlocker(state, tipo);
  if (porLaFase !== null) return porLaFase;
  if (!hayMuralla(state.muralla)) return 'no hay muralla';
  if (escalasA(state, s).some((a) => a.type === tipo)) return null;
  return escalaDesde(state, s, tipo, s.hex, muroQueMasDice(state, s.hex), seHaMovido(state, s));
}

/**
 * De los muros del pie, aquel cuyo motivo dice algo de lo que se ve: el de una
 * escalera puesta desde este pie, si la hay. Con el primero de `neighbours`, el
 * lancero al pie de una escalera cuyo muro estaba ocupado leía «no hay escalera
 * puesta ahí» con la escalera dibujada a su lado (QA de la muralla alta, I2).
 * Lo que no depende del muro (bando, tamaño, haberse movido, llevarla) sale
 * igual con cualquiera; y con el rasgo `escalar` el único motivo de un muro es
 * quién lo ocupa, que vale el del primero.
 */
function muroQueMasDice(state: BattleState, pie: Hex): Hex | null {
  const muros = murosAlPie(state, pie);
  const conEscalera = muros.find((m) =>
    state.escaleras.some((e) => hexEquals(e.pie, pie) && hexEquals(e.muro, m)),
  );
  return conEscalera ?? muros[0] ?? null;
}

function escalaDeLaActiva(state: BattleState, tipo: TipoDeEscala, muro: Hex): string | null {
  const s = activeStack(state);
  if (s === null || state.finished !== null) return 'no le toca a ninguna unidad';
  const porLaFase = faseBlocker(state, tipo);
  if (porLaFase !== null) return porLaFase;
  return escalaDesde(state, s, tipo, s.hex, muro, seHaMovido(state, s));
}

/**
 * Por qué `s`, con los pies en `pie`, no puede `tipo` contra `muro`, o `null`
 * si puede. LA regla de la escala: la leen los motivos de la activa, la lista
 * de acciones y la IA, que pregunta desde los pies a los que podría ir
 * (`piesDeSubida`, con `movido = false`). Con `muro = null`, el motivo de no
 * tener ningún muro al pie.
 */
export function escalaDesde(
  state: BattleState,
  s: BattleStack,
  tipo: TipoDeEscala,
  pie: Hex,
  muro: Hex | null,
  movido: boolean,
): string | null {
  if (muro !== null && !esMuro(state.muralla, muro)) {
    return `en (${muro.col},${muro.row}) no hay muro`;
  }
  const quien = quienNoEscala(s.side, s.unit);
  if (quien !== null) return quien;
  if (esMuro(state.muralla, pie)) return 'ya está en lo alto';
  if (movido) return 'ya se ha movido este turno: se llega al pie y se sube en el turno siguiente';
  if (tipo === 'poner_escalera' && !s.escalera) return 'no lleva escalera';
  if (muro === null) return 'no está al pie de ningún muro';
  if (!areAdjacent(pie, muro)) return 'no está al pie de ese muro';
  const puesta = state.escaleras.some((e) => hexEquals(e.pie, pie) && hexEquals(e.muro, muro));
  if (tipo === 'poner_escalera') return puesta ? 'ahí ya hay una escalera puesta' : null;
  // Sin contarse a sí misma: desde un pie al que aún no ha ido (la IA), el muro
  // en el que está ahora queda libre en cuanto baje.
  const ocupa = state.stacks.find((o) => isAlive(o) && o.id !== s.id && hexEquals(o.hex, muro));
  if (ocupa !== undefined) return `en ese muro está ${ocupa.unit.name}`;
  const como = comoSube(s);
  if (puesta || como === 'escalando') return null;
  return como === 'con su escalera'
    ? 'no hay escalera puesta: primero hay que ponerla (un turno), y subir es el siguiente'
    : 'no hay escalera puesta ahí y no sabe escalar';
}

/**
 * Quién no escala nunca, esté donde esté: solo sube por escala el atacante que
 * no vuela. Lo leen también `createBattle`, que no le da escalera
 * a quien no podría usarla, y el montaje de la arena (`escaleraDeArenaBlocker`).
 */
export function quienNoEscala(side: Side, unit: UnitInfo): string | null {
  if (side !== 'attacker') return 'quien defiende sube a la muralla andando';
  if (hasTrait(unit, 'flying')) return 'vuela: se posa en la muralla sin escalera';
  return null;
}

/** Los muros pegados a `pie`. */
function murosAlPie(state: BattleState, pie: Hex): Hex[] {
  return neighbours(pie).filter((h) => esMuro(state.muralla, h));
}

/**
 * Las escaladas que tiene a mano la unidad activa: poner la escalera y subir,
 * contra cada muro de su pie. Sin muros, ninguna.
 */
export function escalasA(state: BattleState, s: BattleStack): BattleAction[] {
  const movido = seHaMovido(state, s);
  const out: BattleAction[] = [];
  for (const muro of murosAlPie(state, s.hex)) {
    for (const type of TIPOS_DE_ESCALA) {
      if (escalaDesde(state, s, type, s.hex, muro, movido) === null) out.push({ type, muro });
    }
  }
  return out;
}

/**
 * Las jugadas de la escala, en el orden en que se ofrecen: poner antes que subir,
 * contra el mismo muro. La lista que leen la lista legal, la escena y los botones.
 */
export const TIPOS_DE_ESCALA: readonly TipoDeEscala[] = ['poner_escalera', 'subir'];

/** ¿Es `x` una jugada de la escala (`TIPOS_DE_ESCALA`)? */
export function esTipoDeEscala(x: string): x is TipoDeEscala {
  return (TIPOS_DE_ESCALA as readonly string[]).includes(x);
}

// ---------------------------------------------------------------- puertas

/**
 * Por qué la unidad activa no puede `tipo` (abrir o cerrar) la puerta `puerta`
 * —el lado entre sus dos casillas—, o `null` si puede. LA regla de la puerta: la leen `applyAction`, la
 * lista de acciones (y con ella la IA) y los botones de la arena.
 *
 * Decide quien defiende, al principio del turno de cualquier unidad suya, esté
 * donde esté: sin haberse movido, y cada puerta una vez por turno de unidad (si
 * no, abrir y cerrar sería gratis y sin fin). Lo demás que hace una unidad
 * —golpear, apuntar, terminar, escalar— cierra el turno, así que «sin
 * haberse movido» es «sin haber actuado». El hechizo es del héroe y no cuenta.
 * No se cierra con una unidad de dos casillas plantada en ella, la cabeza a un
 * lado y la cola al otro: la puerta no aplasta. Quien está en una de sus dos
 * casillas no estorba: la puerta va entre ellas, no encima.
 */
export function puertaBlocker(
  state: BattleState,
  tipo: TipoDePuerta,
  puerta: PuertaDeMuralla,
): string | null {
  const s = activeStack(state);
  const turno = state.turno;
  if (s === null || turno === null || state.finished !== null) return 'no le toca a ninguna unidad';
  const porLaFase = faseBlocker(state, tipo);
  if (porLaFase !== null) return porLaFase;
  const p = state.puertas.find((q) => mismaPuerta(q, puerta));
  if (p === undefined) return `entre ${nombreDePuerta(puerta)} no hay puerta`;
  const quien = quienNoAbre(s.side);
  if (quien !== null) return quien;
  if (seHaMovido(state, s)) {
    return 'ya se ha movido este turno: la puerta se abre o se cierra al principio del turno';
  }
  if (tipo === 'abrir_puerta' && p.abierta) return 'la puerta ya está abierta';
  if (tipo === 'cerrar_puerta' && !p.abierta) return 'la puerta ya está cerrada';
  if (p.cambiadaEn === turno.n) return 'esa puerta ya se ha abierto o cerrado en este turno';
  return null;
}

/**
 * Quién no abre ni cierra nunca una puerta, esté donde esté: solo quien defiende.
 * Como `quienNoEscala`, la leen la regla de la puerta (`puertaBlocker`) y los
 * botones, que no salen a quien nunca los podría pulsar.
 */
export function quienNoAbre(side: Side): string | null {
  return side === 'defender' ? null : 'las puertas las abre y las cierra quien defiende';
}

/**
 * Por qué la unidad activa no puede `tipo` ninguna puerta, o `null` si puede
 * alguna. Es la frase del botón («Abrir puerta», «Cerrar puerta»), que no sabe
 * aún cuál: con varias la elige el clic en la portada. Si ninguna, el motivo de
 * la primera.
 */
export function puertasBlocker(state: BattleState, tipo: TipoDePuerta): string | null {
  if (state.puertas.length === 0) return 'no hay puerta';
  const motivos = state.puertas.map((p) => puertaBlocker(state, tipo, p));
  return motivos.includes(null) ? null : (motivos[0] as string);
}

/** Lo que la activa puede hacer con las puertas: abrir o cerrar cada una. Sin puertas, nada. */
export function puertasA(state: BattleState): BattleAction[] {
  const out: BattleAction[] = [];
  for (const p of state.puertas) {
    for (const type of TIPOS_DE_PUERTA) {
      if (puertaBlocker(state, type, p) === null) out.push({ type, puerta: { a: p.a, b: p.b } });
    }
  }
  return out;
}

/** Las jugadas de la puerta, en el orden en que se ofrecen (como `TIPOS_DE_ESCALA`). */
export const TIPOS_DE_PUERTA: readonly TipoDePuerta[] = ['abrir_puerta', 'cerrar_puerta'];

/** ¿Es `x` una jugada de la puerta (`TIPOS_DE_PUERTA`)? */
export function esTipoDePuerta(x: string): x is TipoDePuerta {
  return (TIPOS_DE_PUERTA as readonly string[]).includes(x);
}
