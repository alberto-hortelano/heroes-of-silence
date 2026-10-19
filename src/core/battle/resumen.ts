/**
 * Lo que sobrevive de una batalla en la crónica de la partida (#93).
 *
 * `settleBattle` tira el `BattleState` al liquidarla, y con él su registro
 * entero. Volcar ese registro en `state.log` ahogaría la crónica —son 2 280
 * rondas en las 300 batallas del banco, y cada hecho se sella contra la
 * niebla—, así que se queda lo que quien jugó recordaría: cuántas rondas duró,
 * qué hechizos se lanzaron y contra quién, y qué perdió cada bando. Cada golpe,
 * cada paso y cada tirada de moral no.
 *
 * Va DENTRO de `battle_ended` y no como hechos sueltos: es el mismo hecho
 * —la batalla terminó así—, pasa la niebla con el mismo sello y no puede
 * aparecer un hechizo en la crónica sin la batalla en la que se lanzó.
 *
 * Los ids de stack (`a3`, `d1`) son del tablero y mueren con él: aquí se
 * escribe el CUERPO (`body`), que es lo que sigue significando algo después.
 * El del héroe es `HERO_BODY` y el de un personaje `CHARACTER_BODY`; quien lo
 * cuente decide cómo nombrarlos.
 */
import { type BattleState, queEs, type Side } from './types.js';

/** Un hechizo lanzado en la batalla: quién, cuál, sobre qué y cuántos mató. */
export interface HechizoLanzado {
  readonly side: Side;
  readonly spell: string;
  /** El cuerpo del stack sobre el que cayó. */
  readonly target: string;
  readonly killed: number;
}

/** Lo que perdió un bando de un cuerpo: individuos que entraron y no salieron. */
export interface Baja {
  readonly creature: string;
  readonly count: number;
}

export interface ResumenDeBatalla {
  readonly rounds: number;
  readonly casts: readonly HechizoLanzado[];
  /**
   * Por bando, en el orden de salida de sus stacks y agrupado por cuerpo. Sin
   * el héroe: su caída la cuenta `hero_defeated`, con nombre y dueño, y aquí
   * sería la misma noticia dicha dos veces.
   */
  readonly lost: Readonly<Record<Side, readonly Baja[]>>;
}

/** El resumen de una batalla ya terminada. Lanza si el registro miente. */
export function resumenDeBatalla(battle: BattleState): ResumenDeBatalla {
  const cuerpoDe = (id: string): string => {
    const s = battle.stacks.find((x) => x.id === id);
    if (s === undefined)
      throw new Error(`el registro de la batalla nombra un stack que no existe: ${id}`);
    return queEs(s);
  };

  const casts: HechizoLanzado[] = [];
  for (const e of battle.log) {
    if (e.kind !== 'cast') continue;
    // `cast` sin objetivo no existe hoy (`castOn` lo exige); si un hechizo de
    // masas llega un día, que se diga aquí en vez de contarse sobre nadie.
    if (e.target === undefined) throw new Error(`hechizo sin objetivo en el registro: ${e.spell}`);
    casts.push({ side: e.side, spell: e.spell, target: cuerpoDe(e.target), killed: e.killed ?? 0 });
  }

  // `initialCount - count` son los muertos exactos: ningún hechizo resucita
  // (ver `BattleStack.initialCount`). Un `Map` por bando para agrupar sin
  // perder el orden de salida, que es el de `stacks`.
  const perdidas: Record<Side, Map<string, number>> = { attacker: new Map(), defender: new Map() };
  for (const s of battle.stacks) {
    if (s.origen.kind === 'heroe') continue;
    const muertos = s.initialCount - s.count;
    if (muertos <= 0) continue;
    const delBando = perdidas[s.side];
    const que = queEs(s);
    delBando.set(que, (delBando.get(que) ?? 0) + muertos);
  }
  const lista = (m: Map<string, number>): Baja[] =>
    [...m].map(([creature, count]) => ({ creature, count }));

  return {
    rounds: battle.round,
    casts,
    lost: { attacker: lista(perdidas.attacker), defender: lista(perdidas.defender) },
  };
}
