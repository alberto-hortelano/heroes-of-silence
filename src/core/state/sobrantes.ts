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
 * (`Sobrante.propuesta`). Lo aplica `settleBattle`, el único que lo escribe.
 *
 * **Lo que vuelve se cuenta una vez** (`tropaQueVuelve`), y lo leen los dos: hasta
 * /simplify (09-11-2026) el diálogo lo contaba sin la experiencia de la batalla y
 * el cierre con ella, y con un ascenso a medias la IA proponía dejar a uno y el
 * cierre dejaba a otro. Ahora lo que se queda se decide **antes** de cobrar la
 * experiencia, y la cobra solo quien se queda.
 */

import type { BattleStack, Side } from '../battle/types.js';
import { laMasBarata } from '../hero/fuerza.js';
import {
  capacidadDe,
  contarPorTipo,
  ejercitoDe,
  lleno,
  sinIndividuos,
  troopRoom,
  troopsThatFit,
} from '../hero/troop.js';
import type { Army, GrupoDeTropa, Hero, PlayerId, Troop } from '../types.js';
import { unidadDelJuego } from '../unidad/catalogo.js';
import { battleOwners, heroById } from './consultas.js';
import { cupoDeLaGuarnicion, type Sitio, sitioPorId } from './sitios.js';
import type { GameState, PendingBattle } from './tipos.js';

/** Lo que deja cada bando, por tipo: `{ zombi: 1 }`. */
export type Dejados = Readonly<Partial<Record<Side, Readonly<Record<string, number>>>>>;

/** Quién se queda con la tropa de un bando al cerrar: un héroe o la guarnición de un sitio. */
export type QuienVuelve =
  | { readonly kind: 'heroe'; readonly heroe: Hero }
  | { readonly kind: 'sitio'; readonly sitio: Sitio };

/** La tropa de un bando de la batalla terminada, como vuelve (`tropaQueVuelve`). */
interface TropaQueVuelve {
  /**
   * De quién es el bando (`battleOwners`): **la regla del dueño, una**. Sin dueño
   * —un monstruo, un grupo, un lugar, la guarnición neutral— no se lleva lo
   * levantado (P1) ni acumula experiencia.
   */
  readonly dueño: PlayerId | null;
  /**
   * A quién vuelve, o `null`: sin dueño, o si pierde sin rendirse, que lo pierde
   * todo después (el héroe vuelve a casa sin tropa o cae; la guarnición cae con el
   * sitio), así que no hay nada que elegir. Rendirse es perder salvando la tropa.
   */
  readonly quien: QuienVuelve | null;
  /**
   * Los vivos del catálogo, un individuo por cabeza y en su orden de salida, **sin
   * la experiencia de esta batalla** (con la hoja que traían): lo que se cuenta
   * contra el límite y de lo que se deja. El héroe no es tropa.
   */
  readonly army: Army;
  /** El stack del que sale cada individuo de `army`: de él cobra `settleBattle` lo ganado. */
  readonly stackDe: ReadonlyMap<Troop, BattleStack>;
}

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
  /**
   * Lo que deja quien no elige (`loQueDejaLaIA`), contado una vez: lo que propone
   * el diálogo y lo que aplica `settleBattle` sin `dejados`.
   */
  readonly propuesta: Readonly<Record<string, number>>;
}

/**
 * La tropa del bando `side` de la batalla pendiente, ya terminada, como vuelve:
 * **la única cuenta** de lo que vuelve, la que leen el cierre (`settleBattle`) y lo
 * que sobra (`sobrantesTrasLaBatalla`). Un stack de N vuelve como N individuos.
 */
function tropaQueVuelve(state: GameState, pending: PendingBattle, side: Side): TropaQueVuelve {
  const fin = pending.battle.finished;
  if (fin === null) throw new Error('la batalla no ha terminado');
  const dueño = battleOwners(state, pending)[side];
  const army: Troop[] = [];
  const stackDe = new Map<Troop, BattleStack>();
  for (const s of pending.battle.stacks) {
    if (s.side !== side || s.count <= 0 || s.origen.kind !== 'catalogo') continue;
    const o = s.origen;
    if (o.levantadoDe !== undefined && dueño === null) continue;
    for (let i = 0; i < s.count; i++) {
      // La casilla de su formación vuelve con él (`OrigenDelStack.salida`), y la
      // hoja que traía, si es de alguien: sin dueño no se acumula nada.
      const t: Troop = {
        creature: o.unidad,
        ...(o.salida === undefined ? {} : { salida: o.salida }),
        ...(dueño === null || o.veterania === null ? {} : { veterania: o.veterania }),
      };
      army.push(t);
      stackDe.set(t, s);
    }
  }
  const pierde = fin.winner !== side && fin.surrender === undefined;
  const quien = dueño === null || pierde ? null : quienEs(state, pending, side);
  return { dueño, quien, army, stackDe };
}

/** Los dos bandos de la batalla pendiente, ya terminada, como vuelven. */
export function tropasQueVuelven(state: GameState): Readonly<Record<Side, TropaQueVuelve>> {
  const pending = state.pendingBattle;
  if (pending === null) throw new Error('no hay batalla pendiente');
  return {
    attacker: tropaQueVuelve(state, pending, 'attacker'),
    defender: tropaQueVuelve(state, pending, 'defender'),
  };
}

/** El héroe o el sitio que lleva el bando `side` (con dueño: lo ha mirado quien llama). */
function quienEs(state: GameState, pending: PendingBattle, side: Side): QuienVuelve {
  const q = side === 'attacker' ? pending.attacker : pending.foe;
  switch (q.kind) {
    case 'hero':
      return { kind: 'heroe', heroe: heroById(state, q.heroId) };
    case 'garrison':
      return { kind: 'sitio', sitio: sitioPorId(state, q.site) };
    case 'monster':
    case 'raider':
    case 'lugar':
      throw new Error(`un bando de ${q.kind} no tiene dueño al que volver`);
  }
}

/** Lo que le cabe a quien vuelve: el héroe con su liderazgo de antes de cobrar; el sitio, su cupo. */
function limiteDe(
  state: GameState,
  q: QuienVuelve,
): { readonly tope: number; readonly cupo: number } {
  return q.kind === 'heroe' ? capacidadDe(q.heroe, state.combate.tope) : cupoDeLaGuarnicion(state);
}

/**
 * Los bandos de la batalla pendiente, ya terminada, que vuelven con más de lo que
 * les cabe, con lo que propone la IA. Vacío casi siempre: solo lo levantado de un
 * cadáver pasa del límite. Lo leen el cierre (`settleBattle`, que le pasa lo que ya
 * contó) y la pantalla de la persona (`Session`).
 */
export function sobrantesTrasLaBatalla(
  state: GameState,
  vuelven: Readonly<Record<Side, TropaQueVuelve>> = tropasQueVuelven(state),
): readonly Sobrante[] {
  const out: Sobrante[] = [];
  for (const side of ['attacker', 'defender'] as const) {
    const { dueño, quien, army } = vuelven[side];
    if (dueño === null || quien === null) continue;
    const l = limiteDe(state, quien);
    if (lleno(army, l) === null) continue;
    out.push({
      side,
      dueño,
      quien,
      tropa: contarPorTipo(army),
      ...l,
      propuesta: loQueDejaLaIA(army, l),
    });
  }
  return out;
}

/**
 * Por qué no vale dejar `dejar` del sobrante `s`, o `null`: que sea de su tropa y
 * no más de lo que lleva, que lo que queda quepa (`lleno`) y que no deje **de más**
 * (P6: con cualquiera de los dejados de vuelta, ya no cabría). La única frase: la
 * leen `settleBattle`, que lanza con ella, y el diálogo, que la enseña en directo.
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
  const queda = ejercitoDe(
    s.tropa.map((g) => ({ creature: g.creature, count: g.count - (dejar[g.creature] ?? 0) })),
  );
  const noCabe = lleno(queda, s);
  if (noCabe !== null) return `aún sobra: ${noCabe}`;
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
 * primero, el que aún quepa (`troopsThatFit`), para no dejar de más (`dejarBlocker`).
 */
export function loQueDejaLaIA(
  army: Army,
  l: { readonly tope: number; readonly cupo: number },
): Record<string, number> {
  let actual = army;
  const fuera: Troop[] = [];
  while (lleno(actual, l) !== null) {
    const v = laMasBarata(actual, Number.POSITIVE_INFINITY);
    if (v === null) throw new Error('no queda nadie que dejar y el ejército sigue sin caber');
    actual = sinIndividuos(actual, v.creature, 1);
    fuera.push({ creature: v.creature });
  }
  const { fuera: seDejan } = troopsThatFit(actual, l.tope, l.cupo, fuera.reverse());
  return Object.fromEntries(contarPorTipo(seDejan).map((g) => [g.creature, g.count]));
}
