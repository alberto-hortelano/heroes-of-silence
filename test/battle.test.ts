import { describe, expect, it } from 'vitest';
import {
  activeStack,
  applyAction,
  armyMorale,
  createBattle,
  isAlive,
  legalActions,
  stackById,
  stackSpeed,
  type BattleSide,
} from '../src/core/battle/battle.js';
import { applyDamage, damageMultiplier, stackHp } from '../src/core/battle/damage.js';
import type { BattleHero } from '../src/core/battle/types.js';
import { creature } from '../src/core/data.js';
import { createRng } from '../src/core/rng.js';
import { simular } from './helpers.js';
import type { Army } from '../src/core/types.js';

const side = (army: Army, hero: BattleHero | null = null): BattleSide => ({ army, hero });

const hero = (over: Partial<BattleHero> = {}): BattleHero => ({
  name: 'Prueba',
  attack: 0,
  defense: 0,
  spellPower: 3,
  knowledge: 3,
  mana: 30,
  castThisRound: false,
  spells: [],
  ...over,
});

describe('fórmula de daño', () => {
  it('cada punto de ataque de ventaja suma un 10 %, con tope en +300 %', () => {
    expect(damageMultiplier(5, 5)).toBe(1);
    expect(damageMultiplier(6, 5)).toBeCloseTo(1.1);
    expect(damageMultiplier(15, 5)).toBeCloseTo(2.0);
    expect(damageMultiplier(100, 5)).toBeCloseTo(4.0);
  });

  it('cada punto de defensa de ventaja resta un 2,5 %, con suelo en -70 %', () => {
    expect(damageMultiplier(5, 6)).toBeCloseTo(0.975);
    expect(damageMultiplier(5, 45)).toBeCloseTo(0.3);
    expect(damageMultiplier(1, 500)).toBeCloseTo(0.3);
  });
});

describe('aplicación de daño a un stack', () => {
  const stackOf = (id: string, count: number) => ({
    id,
    side: 'attacker' as const,
    slot: 0,
    creature: id,
    count,
    topHp: creature(id).hp,
    hex: { col: 0, row: 0 },
    shotsLeft: 0,
    retaliated: false,
    defending: false,
    waited: false,
    acted: false,
    gotMoraleBonus: false,
    morale: 0,
    luck: 0,
    speedBonus: 0,
  });

  it('mata efectivos enteros y deja al de arriba herido', () => {
    const s = stackOf('swordsman', 10); // 25 hp cada uno
    expect(stackHp(s)).toBe(250);
    const killed = applyDamage(s, 60);
    expect(killed).toBe(2);
    expect(s.count).toBe(8);
    expect(stackHp(s)).toBe(190);
  });

  it('un daño menor que un efectivo no mata a nadie', () => {
    const s = stackOf('swordsman', 3);
    expect(applyDamage(s, 5)).toBe(0);
    expect(s.count).toBe(3);
    expect(s.topHp).toBe(20);
  });

  it('el exceso de daño no resucita ni deja restos', () => {
    const s = stackOf('peasant', 4);
    expect(applyDamage(s, 9999)).toBe(4);
    expect(s.count).toBe(0);
    expect(stackHp(s)).toBe(0);
  });
});

describe('moral por composición del ejército', () => {
  it('premia al ejército de una sola facción', () => {
    expect(armyMorale([{ creature: 'peasant', count: 10 }, null, null, null, null])).toBe(1);
    expect(
      armyMorale([
        { creature: 'peasant', count: 10 },
        { creature: 'archer', count: 5 },
        null,
        null,
        null,
      ]),
    ).toBe(1);
  });

  it('no premia a un ejército mixto de dos facciones', () => {
    expect(
      armyMorale([
        { creature: 'peasant', count: 10 },
        { creature: 'skeleton', count: 10 },
        null,
        null,
        null,
      ]),
    ).toBe(0);
  });
});

describe('despliegue inicial', () => {
  it('coloca cada bando en su borde y respeta la cola de las unidades grandes', () => {
    const state = createBattle(
      side([{ creature: 'peasant', count: 10 }, null, null, null, null]),
      side([{ creature: 'bone_dragon', count: 1 }, null, null, null, null]),
      createRng(1),
    );
    expect(stackById(state, 'attacker-0').hex.col).toBe(0);
    // El dragón óseo ocupa 2 hexes: arranca en la 9 para que su cola quepa.
    expect(stackById(state, 'defender-0').hex.col).toBe(9);
  });

  it('empieza en la ronda 1 con un stack activo', () => {
    const state = createBattle(
      side([{ creature: 'archer', count: 5 }, null, null, null, null]),
      side([{ creature: 'skeleton', count: 5 }, null, null, null, null]),
      createRng(7),
    );
    expect(state.round).toBe(1);
    expect(activeStack(state)).not.toBeNull();
  });
});

describe('iniciativa', () => {
  it('mueve primero al más rápido', () => {
    const state = createBattle(
      side([{ creature: 'zombie', count: 5 }, null, null, null, null]), // very_slow
      side([{ creature: 'champion', count: 5 }, null, null, null, null]), // ultra_fast
      createRng(3),
    );
    expect(activeStack(state)!.id).toBe('defender-0');
  });

  it('en un empate de velocidad mueve el atacante', () => {
    const state = createBattle(
      side([{ creature: 'skeleton', count: 5 }, null, null, null, null]),
      side([{ creature: 'skeleton', count: 5 }, null, null, null, null]),
      createRng(3),
    );
    expect(activeStack(state)!.id).toBe('attacker-0');
  });

  it('los hechizos de velocidad cambian el orden', () => {
    const state = createBattle(
      side([{ creature: 'skeleton', count: 5 }, null, null, null, null]),
      side([{ creature: 'skeleton', count: 5 }, null, null, null, null]),
      createRng(3),
    );
    const s = stackById(state, 'attacker-0');
    const base = stackSpeed(s);
    s.speedBonus = 2;
    expect(stackSpeed(s)).toBe(base + 2);
  });
});

describe('combate cuerpo a cuerpo', () => {
  it('ningún stack contraataca más de una vez por ronda', () => {
    const rng = createRng(11);
    const state = createBattle(
      side([{ creature: 'swordsman', count: 20 }, null, null, null, null]),
      side([{ creature: 'pikeman', count: 20 }, null, null, null, null]),
      rng,
    );
    simular(state, rng);

    // El log se recorre por rondas: entre dos 'round_start', cada stack puede
    // aparecer como contraatacante una sola vez.
    let contraestaRonda = new Set<string>();
    for (const evento of state.log) {
      if (evento.kind === 'round_start') contraestaRonda = new Set();
      if (evento.kind === 'attack' && evento.retaliation) {
        expect(contraestaRonda.has(evento.stack)).toBe(false);
        contraestaRonda.add(evento.stack);
      }
    }
    expect(state.log.some((e) => e.kind === 'attack' && e.retaliation)).toBe(true);
  });

  it('los vampiros no reciben contraataque', () => {
    const rng = createRng(5);
    const state = createBattle(
      side([{ creature: 'vampire', count: 10 }, null, null, null, null]),
      side([{ creature: 'peasant', count: 40 }, null, null, null, null]),
      rng,
    );
    simular(state, rng);
    const golpes = state.log.filter((e) => e.kind === 'attack');
    expect(golpes.length).toBeGreaterThan(0);
    expect(golpes.some((e) => e.kind === 'attack' && e.retaliation)).toBe(false);
  });
});

describe('tiradores', () => {
  it('gastan munición al disparar y no pueden hacerlo con un enemigo encima', () => {
    const rng = createRng(21);
    const state = createBattle(
      side([{ creature: 'archer', count: 10 }, null, null, null, null]),
      side([{ creature: 'zombie', count: 10 }, null, null, null, null]),
      rng,
    );
    const arquero = stackById(state, 'attacker-0');
    const municionInicial = arquero.shotsLeft;
    const disparo = legalActions(state).find((a) => a.type === 'shoot');
    expect(disparo).toBeDefined();
    applyAction(state, disparo!, rng);
    expect(arquero.shotsLeft).toBe(municionInicial - 1);
    expect(state.log.some((e) => e.kind === 'shoot')).toBe(true);
  });
});

describe('hechizos', () => {
  it('la flecha mágica gasta maná y daña al enemigo', () => {
    const rng = createRng(31);
    const lanzador = hero({ spells: ['magic_arrow'], mana: 10, spellPower: 3 });
    const state = createBattle(
      side([{ creature: 'champion', count: 10 }, null, null, null, null], lanzador),
      side([{ creature: 'zombie', count: 10 }, null, null, null, null]),
      rng,
    );
    const objetivo = stackById(state, 'defender-0');
    const vidaPrevia = stackHp(objetivo);

    const conjuro = legalActions(state).find((a) => a.type === 'cast');
    expect(conjuro).toBeDefined();
    applyAction(state, conjuro!, rng);

    expect(lanzador.mana).toBe(7);
    expect(stackHp(objetivo)).toBeLessThan(vidaPrevia);
    expect(lanzador.castThisRound).toBe(true);
  });

  it('el héroe no puede lanzar dos hechizos en la misma ronda', () => {
    const rng = createRng(32);
    const lanzador = hero({ spells: ['magic_arrow'], mana: 30 });
    const state = createBattle(
      side([{ creature: 'champion', count: 10 }, null, null, null, null], lanzador),
      side([{ creature: 'zombie', count: 10 }, null, null, null, null]),
      rng,
    );
    applyAction(state, { type: 'cast', spell: 'magic_arrow', target: 'defender-0' }, rng);
    expect(() =>
      applyAction(state, { type: 'cast', spell: 'magic_arrow', target: 'defender-0' }, rng),
    ).toThrow(/ya lanzó/);
  });
});

describe('acciones ilegales', () => {
  it('se rechazan en vez de corregirse en silencio', () => {
    const rng = createRng(41);
    const state = createBattle(
      side([{ creature: 'champion', count: 5 }, null, null, null, null]),
      side([{ creature: 'zombie', count: 5 }, null, null, null, null]),
      rng,
    );
    expect(activeStack(state)!.id).toBe('attacker-0');
    expect(() => applyAction(state, { type: 'move', to: { col: 10, row: 8 } }, rng)).toThrow();
    expect(() => applyAction(state, { type: 'attack', target: 'defender-0' }, rng)).toThrow();
    expect(() => applyAction(state, { type: 'shoot', target: 'defender-0' }, rng)).toThrow(
      /no es tirador/,
    );
  });
});

describe('batalla completa', () => {
  it('termina con un solo bando en pie', () => {
    const rng = createRng(1234);
    const state = createBattle(
      side([
        { creature: 'swordsman', count: 20 },
        { creature: 'archer', count: 15 },
        null,
        null,
        null,
      ]),
      side([
        { creature: 'skeleton', count: 40 },
        { creature: 'lich', count: 5 },
        null,
        null,
        null,
      ]),
      rng,
    );

    let turnos = 0;
    while (state.finished === null && turnos < 2000) {
      const acciones = legalActions(state);
      expect(acciones.length).toBeGreaterThan(0);
      // Preferir agresión para que la batalla converja.
      const eleccion =
        acciones.find((a) => a.type === 'shoot') ??
        acciones.find((a) => a.type === 'attack') ??
        acciones.find((a) => a.type === 'move') ??
        acciones[0]!;
      applyAction(state, eleccion, rng);
      turnos++;
    }

    expect(state.finished).not.toBeNull();
    const ganador = state.finished!.winner;
    const vivosGanador = state.stacks.filter((s) => s.side === ganador && isAlive(s));
    const vivosPerdedor = state.stacks.filter((s) => s.side !== ganador && isAlive(s));
    expect(vivosGanador.length).toBeGreaterThan(0);
    expect(vivosPerdedor).toHaveLength(0);
    expect(state.log.at(-1)).toEqual({ kind: 'finished', winner: ganador });
  });

  it('es determinista: la misma semilla da la misma batalla', () => {
    const jugar = (semilla: number): string => {
      const rng = createRng(semilla);
      const state = createBattle(
        side([{ creature: 'pikeman', count: 12 }, null, null, null, null]),
        side([{ creature: 'zombie', count: 18 }, null, null, null, null]),
        rng,
      );
      let n = 0;
      while (state.finished === null && n < 1000) {
        const acciones = legalActions(state);
        applyAction(state, acciones.find((a) => a.type === 'attack') ?? acciones[0]!, rng);
        n++;
      }
      return JSON.stringify(state.log);
    };
    expect(jugar(99)).toBe(jugar(99));
    expect(jugar(99)).not.toBe(jugar(100));
  });
});
