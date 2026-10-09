/**
 * Lo que sobrevive de una batalla en la crónica (#93): `battle_ended` lleva
 * rondas, hechizos y bajas, sacados del registro del tablero antes de tirarlo.
 *
 * Se comprueba contra el `BattleState` que `settleBattle` va a tirar —se guarda
 * la referencia antes de liquidar—, no contra lo que el resumen cree que pasó:
 * un resumen que se inventara un hechizo o se comiera una baja saldría rojo.
 */
import { describe, expect, it } from 'vitest';
import { marcadoDe } from '../src/client/html.js';
import { renderLog } from '../src/client/views/panels.js';
import { resumenDeBatalla } from '../src/core/battle/resumen.js';
import type { BattleState } from '../src/core/battle/types.js';
import { serializeAdventureTurn } from '../src/core/contract/serialize.js';
import { HERO_BODY } from '../src/core/hero/hero.js';
import { createRng } from '../src/core/rng.js';
import { cronicaPara } from '../src/core/state/events.js';
import { type GameContext, heroesOf, resolvePendingBattle } from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import { ejercito, forzarBatalla } from './helpers.js';

const ctx = (seed: number): GameContext => ({ rng: createRng(seed) });

/**
 * La semilla de la batalla: tiene que lanzar algún hechizo y matar algo. Era
 * la 33, que con menos mesetas (#210) ya no lanza ninguno, la 2, que con el
 * acantilado en línea (#215) nace a la vista del rival, la 1, que con el
 * vestido que se repite por una silla (#224) tampoco lanza, y la 3, que con las
 * fronteras onduladas (#229) tampoco. Con ellas, la 1 vuelve a lanzar, hasta
 * las dos puertas de la mina (#230); ni la 2 ni la 3 tampoco: la 4.
 */
const SEMILLA = 4;

/** Una batalla contra el primer monstruo, con un héroe que sabe Flecha mágica y tiene maná. */
function batallaConMagia(seed: number): { state: ReturnType<typeof newGame>; battle: BattleState } {
  const state = newGame({ seed });
  const c = ctx(seed);
  const hero = heroesOf(state, 0)[0]!;
  hero.spells = ['magic_arrow'];
  hero.knowledge = 5;
  hero.spellPower = 3;
  hero.mana = 50;
  hero.army = ejercito({ creature: 'peasant', count: 4 });
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
        target: battle.stacks.find((s) => s.id === e.target)!.body,
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

  it('lanza con un hechizo sin objetivo en vez de contarlo sobre nadie', () => {
    const { battle } = batallaConMagia(SEMILLA);
    const roto: BattleState = {
      ...battle,
      log: [{ kind: 'cast', side: 'attacker', spell: 'magic_arrow' }],
    };
    expect(() => resumenDeBatalla(roto)).toThrow(
      'hechizo sin objetivo en el registro: magic_arrow',
    );
  });

  it('la crónica de la pantalla lo cuenta en primera persona a cada bando y en tercera al que mira', () => {
    const fin = {
      kind: 'battle_ended',
      winner: 'defender',
      foe: { kind: 'hero', heroId: 'hero-1' },
      owners: { attacker: 0, defender: 1 },
      rounds: 1,
      casts: [{ side: 'defender', spell: 'magic_arrow', target: HERO_BODY, killed: 1 }],
      lost: { attacker: [{ creature: 'peasant', count: 3 }], defender: [] },
      actor: 0,
      at: { x: 1, y: 1 },
    } as const;
    expect(marcadoDe(renderLog([fin], 0))).toContain(
      '<div class="lose">Batalla perdida contra un héroe del jugador 1 en\u00a0(1,\u00a01), en 1 ronda; pierdes 3\u00a0× Campesino; lanza el enemigo Flecha mágica sobre el héroe (mata 1)</div>',
    );
    expect(marcadoDe(renderLog([fin], 1))).toContain(
      '<div class="win">Batalla ganada contra un héroe del jugador 0 en\u00a0(1,\u00a01), en 1 ronda; pierde el enemigo 3\u00a0× Campesino; lanzas Flecha mágica sobre el héroe (mata 1)</div>',
    );
    expect(marcadoDe(renderLog([fin], -1))).toContain(
      '<div>Batalla en\u00a0(1,\u00a01): un héroe del jugador 0 contra un héroe del jugador 1; gana el jugador 1 en 1 ronda; pierde el jugador 0 3\u00a0× Campesino; lanza el jugador 1 Flecha mágica sobre el héroe (mata 1)</div>',
    );
  });
});
