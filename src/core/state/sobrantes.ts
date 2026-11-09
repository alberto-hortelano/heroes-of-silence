/**
 * Lo que sobra tras una batalla (08-11-2026, «Levantar zombi»;
 * `docs/agents/2026-11-08-levantar-zombi/`). Lo levantado de un cadáver no cuenta
 * contra el tope de tropa en el tablero, pero vuelve con su bando («Se queda, si
 * pasa el limite se elije al terminar la batalla», decisión del usuario): si con él
 * el ejército de un héroe o la guarnición de un sitio pasa de su límite (liderazgo
 * e individuos: `capacidadDe`, `cupoDeLaGuarnicion`), se deja **justo lo que sobra**
 * (P6: «Solo lo que sobra»), y lo dice `dejarBlocker`.
 *
 * Se elige **antes de cerrar** la batalla, en el paso pendiente que ya existe
 * (B1 del plan): la persona en el diálogo de «Continuar» (`Session`), y quien no
 * elige —la IA, el agente, la batalla resuelta sola— con la regla de la IA
 * (`loQueDejaLaIA`). Lo aplica `settleBattle`, el único que lo escribe.
 */

import type { Side } from '../battle/types.js';
import { laMasBarata } from '../hero/fuerza.js';
import {
  armyLeadership,
  capacidadDe,
  contarPorTipo,
  sinIndividuos,
  troopRoom,
  withTroops,
} from '../hero/troop.js';
import type { Army, GrupoDeTropa, Hero, PlayerId, Troop } from '../types.js';
import { unidadDelJuego } from '../unidad/catalogo.js';
import { heroById } from './consultas.js';
import {
  cupoDeLaGuarnicion,
  laGuarnicion,
  nombreDelSitio,
  type Sitio,
  sitioPorId,
} from './sitios.js';
import type { GameState, PendingBattle } from './tipos.js';

/** Lo que deja cada bando, por tipo: `{ zombi: 1 }`. */
export type Dejados = Readonly<Partial<Record<Side, Readonly<Record<string, number>>>>>;

/** Quién se queda con la tropa de un bando al cerrar: un héroe o la guarnición de un sitio. */
export type QuienVuelve =
  | { readonly kind: 'heroe'; readonly heroe: Hero }
  | { readonly kind: 'sitio'; readonly sitio: Sitio };

/** Un bando que vuelve con más de lo que le cabe. */
export interface Sobrante {
  readonly side: Side;
  readonly dueño: PlayerId;
  readonly quien: QuienVuelve;
  /** Lo que vuelve, por tipo y en su orden: lo que se puede dejar. */
  readonly tropa: readonly GrupoDeTropa[];
  /** El liderazgo que le cabe. */
  readonly tope: number;
  /** Los individuos que le caben. */
  readonly cupo: number;
}

/**
 * Quién se queda con la tropa del bando `side` al cerrar `pending`, o `null` si
 * nadie: la pierde quien pierde sin rendirse (el héroe vuelve a casa sin tropa o
 * cae; la guarnición cae con el sitio) y quien no tiene dueño (un monstruo, un
 * grupo, un lugar, la guarnición neutral), que no se lleva lo levantado (P1).
 */
function quienVuelve(state: GameState, pending: PendingBattle, side: Side): QuienVuelve | null {
  const fin = pending.battle.finished;
  if (fin === null) throw new Error('la batalla no ha terminado');
  // Rendirse es perder salvando la tropa: con rendición, los dos se la quedan.
  if (fin.winner !== side && fin.surrender === undefined) return null;
  const quien = side === 'attacker' ? pending.attacker : pending.foe;
  switch (quien.kind) {
    case 'hero':
      return { kind: 'heroe', heroe: heroById(state, quien.heroId) };
    case 'garrison': {
      const sitio = sitioPorId(state, quien.site);
      return laGuarnicion(state, sitio)?.dueño == null ? null : { kind: 'sitio', sitio };
    }
    case 'monster':
    case 'raider':
    case 'lugar':
      return null;
  }
}

/** El dueño de lo que vuelve. */
function dueñoDe(state: GameState, q: QuienVuelve): PlayerId {
  if (q.kind === 'heroe') return q.heroe.owner;
  const g = laGuarnicion(state, q.sitio);
  if (g === null || g.dueño === null) {
    throw new Error(`la guarnición ${nombreDelSitio(q.sitio)} vuelve sin dueño`);
  }
  return g.dueño;
}

/** Lo que le cabe a quien vuelve: el héroe con su liderazgo de antes de cobrar; el sitio, su cupo. */
function limiteDe(
  state: GameState,
  q: QuienVuelve,
): { readonly tope: number; readonly cupo: number } {
  return q.kind === 'heroe' ? capacidadDe(q.heroe, state.combate.tope) : cupoDeLaGuarnicion(state);
}

/** Si `army` cabe en el límite. */
function cabe(army: Army, l: { readonly tope: number; readonly cupo: number }): boolean {
  return army.length <= l.cupo && armyLeadership(army) <= l.tope;
}

/**
 * Lo que vuelve del bando `side` de la batalla terminada, sin la experiencia de
 * esta (la cobra `settleBattle`): los vivos del catálogo, en su orden de salida.
 * Lo levantado vuelve solo a quien tiene dueño (P1); quien no, lo pierde con el
 * resto. El héroe no es tropa.
 */
export function loQueVuelve(state: GameState, pending: PendingBattle, side: Side): Army {
  const conDueño = quienVuelve(state, pending, side) !== null;
  const out: Troop[] = [];
  for (const s of pending.battle.stacks) {
    if (s.side !== side || s.count <= 0 || s.origen.kind !== 'catalogo') continue;
    if (s.origen.levantadoDe !== undefined && !conDueño) continue;
    const v = s.origen.veterania;
    for (let i = 0; i < s.count; i++) {
      out.push(
        v === null ? { creature: s.origen.unidad } : { creature: s.origen.unidad, veterania: v },
      );
    }
  }
  return out;
}

/**
 * Los bandos de la batalla pendiente, ya terminada, que vuelven con más de lo que
 * les cabe. Vacío casi siempre: solo lo levantado de un cadáver pasa del límite.
 * Lo leen el cierre (`settleBattle`) y la pantalla de la persona (`Session`).
 */
export function sobrantesTrasLaBatalla(state: GameState): readonly Sobrante[] {
  const pending = state.pendingBattle;
  if (pending === null) throw new Error('no hay batalla pendiente');
  const out: Sobrante[] = [];
  for (const side of ['attacker', 'defender'] as const) {
    const q = quienVuelve(state, pending, side);
    if (q === null) continue;
    const army = loQueVuelve(state, pending, side);
    const l = limiteDe(state, q);
    if (cabe(army, l)) continue;
    out.push({ side, dueño: dueñoDe(state, q), quien: q, tropa: contarPorTipo(army), ...l });
  }
  return out;
}

/** El ejército de `tropa` sin lo de `dejar`, por tipo. */
function sinLoDejado(
  tropa: readonly GrupoDeTropa[],
  dejar: Readonly<Record<string, number>>,
): Army {
  let army: Army = [];
  for (const g of tropa) army = withTroops(army, g.creature, g.count - (dejar[g.creature] ?? 0));
  return army;
}

/**
 * Por qué no vale dejar `dejar` del sobrante `s`, o `null`: que sea de su tropa y
 * no más de lo que lleva, que lo que queda quepa y que no deje **de más** (P6: con
 * cualquiera de los dejados de vuelta, ya no cabría). La única frase: la leen
 * `settleBattle`, que lanza con ella, y el diálogo, que la enseña en directo.
 */
export function dejarBlocker(s: Sobrante, dejar: Readonly<Record<string, number>>): string | null {
  for (const [creature, n] of Object.entries(dejar)) {
    const g = s.tropa.find((x) => x.creature === creature);
    if (!Number.isInteger(n) || n < 0) return `no se dejan ${n} × ${creature}`;
    if (g === undefined) {
      if (n === 0) continue;
      return `no vuelve ningún ${unidadDelJuego(creature).name} que dejar`;
    }
    if (n > g.count) {
      return `vuelven ${g.count} × ${unidadDelJuego(creature).name}, y no se dejan ${n}`;
    }
  }
  const queda = sinLoDejado(s.tropa, dejar);
  if (queda.length > s.cupo) {
    return `aún sobra: quedan ${queda.length} individuos y caben ${s.cupo}`;
  }
  const ocupa = armyLeadership(queda);
  if (ocupa > s.tope) return `aún sobra: ocupan ${ocupa} de liderazgo y caben ${s.tope}`;
  for (const [creature, n] of Object.entries(dejar)) {
    if (n > 0 && troopRoom(queda, s.tope, s.cupo, creature) >= 1) {
      return `dejas de más: aún cabe un ${unidadDelJuego(creature).name}`;
    }
  }
  return null;
}

/**
 * Lo que deja quien no elige (la IA, el agente, la batalla resuelta sola): de uno
 * en uno, el que licenciaría la IA (`laMasBarata` sin tope de poder: lo más novato
 * y barato primero) hasta que quepa, y después vuelve, del último en irse al
 * primero, el que aún quepa, para no dejar de más (`dejarBlocker`).
 */
export function loQueDejaLaIA(
  army: Army,
  l: { readonly tope: number; readonly cupo: number },
): Record<string, number> {
  let actual = army;
  const fuera: string[] = [];
  while (!cabe(actual, l)) {
    const v = laMasBarata(actual, Number.POSITIVE_INFINITY);
    if (v === null) throw new Error('no queda nadie que dejar y el ejército sigue sin caber');
    actual = sinIndividuos(actual, v.creature, 1);
    fuera.push(v.creature);
  }
  const dejar: Record<string, number> = {};
  for (const c of fuera.reverse()) {
    if (troopRoom(actual, l.tope, l.cupo, c) >= 1) actual = withTroops(actual, c, 1);
    else dejar[c] = (dejar[c] ?? 0) + 1;
  }
  return dejar;
}
