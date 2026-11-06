/**
 * Lo que sobrevive de una batalla en la crónica (#93): `battle_ended` lleva
 * rondas, hechizos y bajas, sacados del registro del tablero antes de tirarlo.
 *
 * Se comprueba contra el `BattleState` que `settleBattle` va a tirar —se guarda
 * la referencia antes de liquidar—, no contra lo que el resumen cree que pasó:
 * un resumen que se inventara un hechizo o se comiera una baja saldría rojo.
 */
import { describe, expect, it } from 'vitest';
import { resumenDeBatalla } from '../src/core/battle/resumen.js';
import { type BattleState, HERO_BODY, queEs } from '../src/core/battle/types.js';
import { unidadesDelJuego } from '../src/core/catalogo.js';
import { serializeAdventureTurn } from '../src/core/contract/serialize.js';

import { cronicaPara } from '../src/core/state/events.js';
import { heroesOf, resolvePendingBattle } from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import { ctx, TROPA_BARATA } from './comun.js';
import { ejercito, forzarBatalla, ponerMonstruo } from './partida-de-prueba.js';

/**
 * La semilla de la batalla: tiene que lanzar algún hechizo y matar algo, y el
 * rival no tiene que verla. Con las cinco facciones (F3, 19-10-2026) de la 1 a
 * la 10 valen todas menos la 4, que nace a la vista del rival.
 */
const SEMILLA = 1;

/**
 * El monstruo de enfrente: la unidad del catálogo con más PV. La IA lanza un
 * hechizo de daño solo si quita al menos `VALOR_MINIMO_POR_MANA` PV por punto
 * de maná (`bestCast`, `ai/tactics.ts`), y lo que quita no pasa de la vida del
 * objetivo, que es un individuo: contra uno de 60 u 80 PV la Flecha mágica no
 * se lanza nunca.
 */
const GORDA = [...unidadesDelJuego()].sort((a, b) => b.hp - a.hp)[0]!.id;

/** Una batalla contra tres de `GORDA`, con un héroe que sabe Flecha mágica y tiene maná. */
function batallaConMagia(seed: number): { state: ReturnType<typeof newGame>; battle: BattleState } {
  const state = newGame({ seed });
  const c = ctx(seed);
  const hero = heroesOf(state, 0)[0]!;
  hero.spells = ['magic_arrow'];
  hero.knowledge = 5;
  hero.spellPower = 3;
  hero.mana = 50;
  hero.army = ejercito({ creature: TROPA_BARATA, count: 4 });
  ponerMonstruo(state, GORDA, 3);
  forzarBatalla(state, c, hero);
  const battle = state.pendingBattle!.battle;
  resolvePendingBattle(state, c);
  return { state, battle };
}

describe('el resumen de la batalla en battle_ended (#93)', () => {
  it('cuenta los hechizos, las bajas y las rondas que dice el registro del tablero', () => {
    const { state, battle } = batallaConMagia(SEMILLA);
    const fin = state.log.find((e) => e.kind === 'battle_ended');
    if (fin?.kind !== 'battle_ended') throw new Error('no hubo battle_ended');

    const lanzados = battle.log.filter((e) => e.kind === 'cast');
    // Sin un hechizo de verdad, el test no vigila nada: la semilla tiene que darlo.
    expect(lanzados.length).toBeGreaterThan(0);
    expect(fin.casts).toEqual(
      lanzados.map((e) => ({
        side: e.side,
        spell: e.spell,
        target: queEs(battle.stacks.find((s) => s.id === e.target)!),
        killed: e.killed ?? 0,
      })),
    );
    expect(fin.rounds).toBe(battle.round);
    expect(fin.owners).toEqual({ attacker: 0, defender: null });

    // Las bajas, contadas a mano desde los stacks, sin el héroe.
    for (const side of ['attacker', 'defender'] as const) {
      const muertos = battle.stacks
        .filter((s) => s.side === side && s.origen.kind !== 'heroe')
        .reduce((n, s) => n + s.initialCount - s.count, 0);
      expect(fin.lost[side].reduce((n, b) => n + b.count, 0)).toBe(muertos);
      if (side === 'defender') expect(muertos).toBeGreaterThan(0);
      expect(fin.lost[side].every((b) => b.count > 0 && b.creature !== HERO_BODY)).toBe(true);
    }
  });

  it('lo lee el agente en recentEvents, y el rival que no miraba no se entera', () => {
    const { state } = batallaConMagia(SEMILLA);
    const mio = serializeAdventureTurn(state, 0) as { recentEvents: { kind: string }[] };
    const fin = mio.recentEvents.find((e) => e.kind === 'battle_ended') as
      | { casts: unknown[]; seen?: unknown }
      | undefined;
    expect(fin?.casts.length).toBeGreaterThan(0);
    // Sin el sello, como todo lo que sale de `cronicaPara`.
    expect(fin).not.toHaveProperty('seen');

    // El rival no miraba ese monstruo (su héroe nace en la otra punta): el
    // resumen pasa la niebla con el mismo sello que el hecho.
    const sello = state.log.find((e) => e.kind === 'battle_ended')!.seen;
    expect(sello).not.toContain(1);
    expect(cronicaPara(state, 1, 1000).some((e) => e.kind === 'battle_ended')).toBe(false);
  });

  it('el héroe que cae no cuenta como baja: lo dice hero_defeated', () => {
    // Su caída se escribe en el tablero de una batalla real, a mano: que el
    // héroe muera depende de la IA de batalla, que no es lo que se mide aquí.
    const { battle } = batallaConMagia(SEMILLA);
    const caido: BattleState = {
      ...battle,
      stacks: battle.stacks.map((s) => (s.origen.kind === 'heroe' ? { ...s, count: 0 } : s)),
    };
    const { lost } = resumenDeBatalla(caido);
    expect([...lost.attacker, ...lost.defender].some((b) => b.creature === HERO_BODY)).toBe(false);
    expect(lost).toEqual(resumenDeBatalla(battle).lost);
  });

  it('lanza si el registro nombra un stack que no está en el tablero', () => {
    const { battle } = batallaConMagia(SEMILLA);
    const roto: BattleState = {
      ...battle,
      log: [{ kind: 'cast', side: 'attacker', spell: 'magic_arrow', target: 'z9', killed: 0 }],
    };
    expect(() => resumenDeBatalla(roto)).toThrow(
      'el registro de la batalla nombra un stack que no existe: z9',
    );
  });

  it('un hechizo sin unidad (a una casilla, sobre sí) se cuenta sin objetivo y con lo que mató', () => {
    // Desde el editor de magia (06-11-2026) un hechizo puede ir a una casilla: lo que
    // mata va en sus `spell_hit`.
    const { battle } = batallaConMagia(SEMILLA);
    const [uno] = battle.stacks;
    if (uno === undefined) throw new Error('sin stacks');
    const conArea: BattleState = {
      ...battle,
      log: [
        { kind: 'cast', side: 'attacker', spell: 'bola_de_fuego', at: uno.hex },
        { kind: 'spell_hit', spell: 'bola_de_fuego', stack: uno.id, damage: 9, killed: 2 },
        { kind: 'perished', stack: uno.id },
        { kind: 'round_start', round: 2 },
      ],
    };
    expect(resumenDeBatalla(conArea).casts).toEqual([
      { side: 'attacker', spell: 'bola_de_fuego', target: null, killed: 2 },
    ]);
  });
});
