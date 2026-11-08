/**
 * Lo que sobrevive de una batalla en la crónica de la partida (#93).
 *
 * `settleBattle` tira el `BattleState` al liquidarla, y con él su registro
 * entero. Volcar ese registro en `state.log` ahogaría la crónica —son 2 280
 * rondas en las 300 batallas del banco, y cada hecho se sella contra la
 * niebla—, así que se queda lo que quien jugó recordaría: cuántas rondas duró,
 * qué hechizos se lanzaron y contra quién, y qué perdió cada bando. Cada golpe,
 * cada paso y cada tirada no.
 *
 * Va DENTRO de `battle_ended` y no como hechos sueltos: es el mismo hecho
 * —la batalla terminó así—, pasa la niebla con el mismo sello y no puede
 * aparecer un hechizo en la crónica sin la batalla en la que se lanzó.
 *
 * Los ids de stack (`a3`, `d1`) son del tablero y mueren con él: aquí se
 * escribe el CUERPO (`body`), que es lo que sigue significando algo después.
 * El del héroe es `HERO_BODY`; quien lo cuente decide cómo nombrarlo.
 */
import { type BattleState, queEs, type Side } from './types.js';

/** Un hechizo lanzado en la batalla: quién, cuál, sobre qué y cuántos mató. */
interface HechizoLanzado {
  readonly side: Side;
  readonly spell: string;
  /**
   * El cuerpo del stack sobre el que cayó; `null` si no se lanzó a una unidad (una
   * casilla, sobre sí o al tablero: el editor de magia, 06-11-2026).
   */
  readonly target: string | null;
  /** Los que mató: en uno a varios, los de sus `spell_hit`. */
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

/** Los hechos que van detrás de un hechizo y son suyos. */
const SIGUEN_AL_HECHIZO: ReadonlySet<string> = new Set([
  'spell_hit',
  'effect',
  'effect_end',
  'perished',
  'triggered',
]);

/** El resumen de una batalla ya terminada. Lanza si el registro miente. */
export function resumenDeBatalla(battle: BattleState): ResumenDeBatalla {
  const cuerpoDe = (id: string): string => {
    const s = battle.stacks.find((x) => x.id === id);
    if (s === undefined)
      throw new Error(`el registro de la batalla nombra un stack que no existe: ${id}`);
    return queEs(s);
  };

  const casts: HechizoLanzado[] = [];
  battle.log.forEach((e, i) => {
    if (e.kind !== 'cast') return;
    // A uno, lo que mató va en el hecho; a varios (o diferido), en los `spell_hit` que
    // le siguen hasta la siguiente jugada.
    let killed = e.killed ?? 0;
    for (let j = i + 1; j < battle.log.length; j++) {
      const x = battle.log[j];
      if (x === undefined || !SIGUEN_AL_HECHIZO.has(x.kind)) break;
      if (x.kind === 'spell_hit' && x.spell === e.spell) killed += x.killed;
    }
    casts.push({
      side: e.side,
      spell: e.spell,
      target: e.target === undefined ? null : cuerpoDe(e.target),
      killed,
    });
  });

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
