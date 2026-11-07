/**
 * Los hechizos en la batalla: lo que no necesita el estado entero —a quién vale
 * un hechizo, qué casillas alcanza su área, cuánto dura lo que deja y cómo se
 * cuelga— (06-11-2026, el editor de magia; el formato, en `core/magia/`). Lo que
 * mira el tablero (la recta del proyectil, los vivos, el registro) y lo aplica es
 * de `battle.ts` (`lanzarHechizo`, `saltar`).
 *
 * El héroe y una unidad con un poder son el mismo lanzador con otro poder mágico
 * (la unidad, 0): la Curación del héroe y el «Curar» del monje son el mismo
 * efecto de cura, con el mismo tope.
 */

import { dichoDelEfecto as dichoDelEfectoDelHechizo } from '../magia/dicho.js';
import {
  type Afecta,
  apuntaACasilla,
  type Disparador,
  type Duracion,
  type EfectoSimple,
  type Hechizo,
  rinde,
  sinObjetivo,
} from '../magia/formato.js';
import type { Hex } from '../types.js';
import { allHexes, hexDistance } from './board.js';
import {
  type BattleHero,
  type BattleStack,
  type DisparadorResuelto,
  type EfectoResuelto,
  type HastaElTurno,
  MAX_ROUNDS,
  type Side,
  type StackEffect,
} from './types.js';

export type { Hechizo };

/**
 * Quien lanza un hechizo, en lo que el hechizo necesita de él: dónde está (el
 * stack que lo lanza: el cuerpo del héroe o la unidad), su bando y su poder
 * mágico (el del héroe; una unidad, 0).
 */
export interface Lanzador {
  readonly stack: BattleStack;
  readonly bando: Side;
  readonly poder: number;
}

/**
 * Cuántas rondas dura lo que lanza un héroe con «rondas: poder»: su poder, y al
 * menos una. Lo leen el hechizo y la ficha del héroe de la arena.
 */
export function duracionDeLoQueLanza(caster: Pick<BattleHero, 'spellPower'>): number {
  return Math.max(1, caster.spellPower);
}

/** Las rondas de tope de lo que dura «hasta el próximo turno de alguien», como la rueda. */
export const RONDAS_HASTA_UN_TURNO = 2;

/** Lo que dice cuánto dura un efecto colgado: sus rondas y, si es hasta un turno, cuál. */
export function cuantoDura(
  d: Duracion,
  poder: number,
  turno: number,
  turnoDe: { readonly afectado: string; readonly lanzador: string; readonly portador?: string },
): { readonly roundsLeft: number; readonly hasta?: HastaElTurno } {
  if (d === 'pelea') return { roundsLeft: MAX_ROUNDS };
  if ('rondas' in d) {
    return { roundsLeft: d.rondas === 'poder' ? Math.max(1, poder) : d.rondas };
  }
  const de =
    d.turnoDe === 'afectado'
      ? turnoDe.afectado
      : d.turnoDe === 'lanzador'
        ? turnoDe.lanzador
        : (turnoDe.portador ?? turnoDe.afectado);
  return {
    roundsLeft: RONDAS_HASTA_UN_TURNO,
    hasta: { turno, al: d.hasta, ...(de === turnoDe.afectado ? {} : { de }) },
  };
}

/** Un efecto del hechizo con sus cantidades calculadas con el poder de quien lo lanza. */
export function resolverEfecto(e: EfectoSimple, poder: number): EfectoResuelto {
  switch (e.tipo) {
    case 'danio':
      return { tipo: 'danio', cantidad: rinde(e.cantidad, poder), armadura: e.armadura };
    case 'cura':
      return { tipo: 'cura', cantidad: rinde(e.cantidad, poder) };
    case 'escudo':
      return { tipo: 'escudo', absorbe: rinde(e.absorbe, poder) };
    case 'disipar':
    case 'cifra':
    case 'impide':
      return e;
  }
}

/** Un disparador con sus efectos resueltos y quién lo lanzó: lo que se guarda en el efecto. */
export function resolverDisparador(
  d: Disparador,
  poder: number,
  lanzador: string,
): DisparadorResuelto {
  return {
    cuando: d.cuando,
    yAlLanzarse: d.yAlLanzarse === true,
    a: d.a,
    radio: d.radio ?? 0,
    afecta: d.afecta ?? 'todos',
    duracion: d.duracion ?? null,
    seAcabaSiMuere: d.seAcabaSiMuere ?? null,
    efectos: d.efectos.map((e) => resolverEfecto(e, poder)),
    poder,
    lanzador,
    dicho: dichoDelEfectoDelHechizo(d, poder),
  };
}

/** Qué se cuelga del afectado y lo común de todos los efectos del hechizo. */
export interface Colgar {
  readonly source: string;
  readonly bando: Side;
  readonly roundsLeft: number;
  readonly hasta?: HastaElTurno;
  readonly seAcabaSiMuere?: string;
}

/**
 * El efecto que dura que deja `e` sobre un stack, o `null` si `e` se hace en el
 * acto (`danio`, `cura`, `disipar`). El único constructor del efecto colgado de un
 * hechizo: lo leen lanzar, el disparador y la previsión.
 */
export function efectoColgado(
  e: EfectoResuelto | DisparadorResuelto,
  comun: Colgar,
  cargas: number | null = null,
): StackEffect | null {
  if ('cuando' in e) return { ...comun, kind: 'disparador', disparador: e, cargas };
  switch (e.tipo) {
    case 'danio':
    case 'cura':
    case 'disipar':
      return null;
    case 'cifra':
      return { ...comun, kind: KIND_DE_LA_CIFRA[e.cifra], amount: e.valor };
    case 'impide':
      return { ...comun, kind: 'impide', que: e.que };
    case 'escudo':
      return { ...comun, kind: 'escudo', queda: e.absorbe };
  }
}

/** Qué efecto del motor es cada cifra del formato. Las de antes conservan su nombre. */
export const KIND_DE_LA_CIFRA = {
  ataque: 'attack',
  defensa: 'defense',
  casillas: 'speed',
  armadura: 'armadura',
  fuerza: 'fuerza',
  agilidad: 'agilidad',
} as const;

/** Si un stack del bando `side` es de los que `afecta` alcanza, lanzado desde `bando`. */
export function loAlcanza(afecta: Afecta, bando: Side, side: Side): boolean {
  return afecta === 'todos' || (afecta === 'aliados') === (side === bando);
}

/**
 * Las casillas a `radio` o menos de `centro`, en el orden del tablero (`allHexes`):
 * el área de un hechizo y el «alrededor» de un disparador.
 */
export function casillasDelArea(centro: Hex, radio: number): readonly Hex[] {
  return allHexes().filter((h) => hexDistance(h, centro) <= radio);
}

/**
 * Por qué `target` no vale como la unidad elegida de `h` lanzado desde `bando`, o
 * `null` (solo los objetivos de unidad: aliado, enemigo, cualquiera). La entrega
 * (distancia) la mira el motor.
 */
export function objetivoBlocker(
  h: Hechizo,
  bando: Side,
  target: Pick<BattleStack, 'count' | 'side'>,
): string | null {
  if (target.count <= 0) return 'el objetivo ya está destruido';
  if (h.objetivo === 'aliado' && target.side !== bando) {
    return `«${h.nombre}» va dirigido a un aliado`;
  }
  if (h.objetivo === 'enemigo' && target.side === bando) {
    return `«${h.nombre}» va dirigido a un enemigo`;
  }
  return null;
}

/** Lo que se apunta al lanzar: una unidad, una casilla o nada (sobre sí, el tablero). */
export type Apuntado = { readonly target: string } | { readonly at: Hex } | null;

/** Qué se apunta para `h`: «unidad», «casilla» o «nada». Una vez. */
export function queSeApunta(h: Hechizo): 'unidad' | 'casilla' | 'nada' {
  if (sinObjetivo(h)) return 'nada';
  return apuntaACasilla(h) ? 'casilla' : 'unidad';
}

/**
 * Lo que repondría una cura de `cantidad` a `target`: sin pasar de la vida de un
 * individuo; nadie resucita. La regla del tope, una vez: la aplican lanzar y el
 * disparador, y la enseñan la previsión, el bloqueador del poder y la IA.
 */
export function curaDe(cantidad: number, target: Pick<BattleStack, 'topHp' | 'unit'>): number {
  return Math.max(0, Math.min(cantidad, target.unit.hp - target.topHp));
}

/** La cura que daría `h` lanzado con `poder` sobre `target` (la suma de sus `cura`), o 0. */
export function curaDelHechizo(
  h: Hechizo,
  poder: number,
  target: Pick<BattleStack, 'topHp' | 'unit'>,
): number {
  const total = h.efectos.reduce(
    (n, e) => (e.tipo === 'cura' ? n + rinde(e.cantidad, poder) : n),
    0,
  );
  return total === 0 ? 0 : curaDe(total, target);
}

/** Si el hechizo solo cura (lo que se le pregunta al botón de «Curar»: ¿hay a quién?). */
export function soloCura(h: Hechizo): boolean {
  return h.efectos.every((e) => e.tipo === 'cura');
}
