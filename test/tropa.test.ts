/**
 * La tropa de individuos y el liderazgo (fase 1a de NuevaJugabilidad).
 *
 * Los tests salen de los criterios del plan, no del código: reclutar N añade N
 * individuos; pasarse del liderazgo lanza con la frase y SIN cobrar; un héroe
 * que entra en casa se lleva lo que le quepa; el tope crece con el nivel; los
 * datos garantizan que un ejército dentro del liderazgo cabe en el tablero; y
 * un héroe que lleva un personaje pasa de día, que era la issue que la fase 2
 * dejó abierta.
 */
import { describe, expect, it } from 'vitest';
import { armyPower, planRecruits, unitPower } from '../src/core/ai/strategy.js';
import { playAiGame } from '../src/core/ai/turn.js';
import { despliegueBlocker, HEXES_POR_BANDO } from '../src/core/battle/battle.js';
import { BOARD_HEIGHT } from '../src/core/battle/board.js';
import { serializeAdventureTurn } from '../src/core/contract/serialize.js';
import { allCreatures, creature, hexSize, LIDERAZGO } from '../src/core/data.js';
import { maxMovePoints, slowestSpeed } from '../src/core/hero/hero.js';
import {
  armyLeadership,
  GARRISON_LEADERSHIP,
  heroLeadership,
  troopBlocker,
  troopSummary,
} from '../src/core/hero/troop.js';
import { pointKey } from '../src/core/map/map.js';
import { createRng } from '../src/core/rng.js';
import { CHARACTER_BODY, createCharacter, defaultBuild } from '../src/core/rpg/character.js';
import { combatProfile } from '../src/core/rpg/stats.js';
import {
  applyAdventureAction,
  type GameContext,
  type GameState,
  heroesOf,
  townsOf,
} from '../src/core/state/game.js';
import { newGame, startingArmy } from '../src/core/state/setup.js';
import { SPEED_TO_MOVE_POINTS } from '../src/core/types.js';
import { ejercito } from './helpers.js';

const ctx = (seed: number): GameContext => ({ rng: createRng(seed) });

/** La partida de la semilla con el héroe del jugador 0 dentro de su castillo. */
function heroeEnCasa(seed: number) {
  const state = newGame({ seed });
  const hero = heroesOf(state, 0)[0]!;
  const town = townsOf(state, 0)[0]!;
  hero.at = { ...town.at };
  return { state, hero, town };
}

describe('el ejército es una lista de individuos', () => {
  it('reclutar 3 añade 3 individuos, sin `count`', () => {
    const { state, hero, town } = heroeEnCasa(13);
    hero.army = [];
    applyAdventureAction(
      state,
      { type: 'recruit', town: town.id, creature: 'peasant', count: 3 },
      ctx(13),
      0,
    );
    expect(hero.army).toEqual([
      { creature: 'peasant' },
      { creature: 'peasant' },
      { creature: 'peasant' },
    ]);
  });

  it('dos reclutas de la misma criatura no se funden: son más individuos', () => {
    const { state, hero, town } = heroeEnCasa(13);
    hero.army = [];
    for (const count of [2, 3]) {
      applyAdventureAction(
        state,
        { type: 'recruit', town: town.id, creature: 'peasant', count },
        ctx(13),
        0,
      );
    }
    expect(hero.army).toHaveLength(5);
  });

  it('`troopSummary` agrupa por criatura en orden de aparición, y cada personaje va solo', () => {
    const aren = createCharacter('aren', defaultBuild);
    const army = [
      ...ejercito({ creature: 'archer', count: 2 }),
      { creature: CHARACTER_BODY, member: 'aren' },
      ...ejercito({ creature: 'peasant', count: 3 }, { creature: 'archer', count: 1 }),
    ];
    const grupos = troopSummary(army, { aren });
    expect(grupos.map((g) => [g.creature, g.member, g.count])).toEqual([
      ['archer', undefined, 3],
      [CHARACTER_BODY, 'aren', 1],
      ['peasant', undefined, 3],
    ]);
    // Las cifras del personaje son las de su perfil, no las de ningún catálogo.
    expect(grupos[1]!.unit).toEqual(combatProfile(aren).unit);
  });
});

describe('liderazgo', () => {
  it('el tope del héroe crece con el nivel y se para en el máximo', () => {
    const { base, porNivel, max } = LIDERAZGO.heroe;
    expect(heroLeadership({ level: 1 })).toBe(base);
    expect(heroLeadership({ level: 2 })).toBe(base + porNivel);
    expect(heroLeadership({ level: 40 })).toBe(max);
  });

  it('reclutar por encima del liderazgo lanza con la frase, y no cobra nada', () => {
    const { state, hero, town } = heroeEnCasa(13);
    hero.army = ejercito({ creature: 'peasant', count: 9 }); // 18 de 20
    const oro = state.players[0]!.resources.gold;
    const disponibles = town.available.peasant;

    expect(() =>
      applyAdventureAction(
        state,
        { type: 'recruit', town: town.id, creature: 'peasant', count: 2 },
        ctx(13),
        0,
      ),
    ).toThrow(
      'no se puede reclutar: no cabe: el ejército ocupa 18 de 20 de liderazgo y 2 × Campesino piden 4; caben 1',
    );
    // Rechazado ANTES de pagar: ni el oro ni las criaturas del pueblo se mueven.
    expect(state.players[0]!.resources.gold).toBe(oro);
    expect(town.available.peasant).toBe(disponibles);
    expect(hero.army).toHaveLength(9);

    // Y el que sí cabe, entra.
    applyAdventureAction(
      state,
      { type: 'recruit', town: town.id, creature: 'peasant', count: 1 },
      ctx(13),
      0,
    );
    expect(armyLeadership(hero.army)).toBe(20);
  });

  it('la frase de un solo individuo dice «pide», y sin sitio no promete ninguno', () => {
    const lleno = ejercito({ creature: 'peasant', count: 10 });
    expect(troopBlocker(lleno, 20, 'paladin', 1)).toBe(
      'no cabe: el ejército ocupa 20 de 20 de liderazgo y 1 × Paladín pide 10',
    );
    expect(troopBlocker(lleno, 30, 'paladin', 1)).toBeNull();
  });

  it('sin héroe en el pueblo se recluta a la guarnición, con su propio tope', () => {
    const { state, hero, town } = heroeEnCasa(13);
    hero.at = { x: hero.at.x + 1, y: hero.at.y };
    town.available.peasant = 50;
    state.players[0]!.resources = { ...state.players[0]!.resources, gold: 10_000 };
    const tope = GARRISON_LEADERSHIP;
    const caben = tope / creature('peasant').leadership;

    applyAdventureAction(
      state,
      { type: 'recruit', town: town.id, creature: 'peasant', count: caben },
      ctx(13),
      0,
    );
    expect(town.garrison).toHaveLength(caben);
    expect(() =>
      applyAdventureAction(
        state,
        { type: 'recruit', town: town.id, creature: 'peasant', count: 1 },
        ctx(13),
        0,
      ),
    ).toThrow(`no cabe: la guarnición ocupa ${tope} de ${tope} de liderazgo`);
  });

  it('un héroe que entra en casa se lleva lo que le cabe, en orden, y el resto se queda', () => {
    const state = newGame({ seed: 13 });
    const hero = heroesOf(state, 0)[0]!;
    const town = townsOf(state, 0)[0]!;
    hero.army = ejercito({ creature: 'peasant', count: 6 }); // 12 de 20: caben 8
    // El espadachín (6) cabe; el paladín (10) ya no, y se salta sin cerrar el
    // paso a los campesinos que vienen detrás: entran uno (2) y se queda otro.
    town.garrison = ejercito(
      { creature: 'swordsman', count: 1 },
      { creature: 'paladin', count: 1 },
      { creature: 'peasant', count: 2 },
    );
    hero.at = { x: town.at.x, y: town.at.y + 1 };
    hero.movePoints = 5000;

    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: town.at }, ctx(13), 0);

    expect(pointKey(hero.at)).toBe(pointKey(town.at));
    expect(armyLeadership(hero.army)).toBe(20);
    expect(hero.army.slice(6)).toEqual([{ creature: 'swordsman' }, { creature: 'peasant' }]);
    expect(town.garrison).toEqual([{ creature: 'paladin' }, { creature: 'peasant' }]);
    expect(state.log.some((e) => e.kind === 'garrison_taken')).toBe(true);
  });

  it('el ejército de salida cabe en el liderazgo de un héroe de nivel 1, en las dos facciones', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const faction of ['knight', 'necromancer'] as const) {
        const army = startingArmy(faction, createRng(seed));
        expect(armyLeadership(army)).toBeLessThanOrEqual(heroLeadership({ level: 1 }));
        expect(army.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('los datos garantizan que lo que cabe en el liderazgo cabe en el tablero', () => {
  // Es el test que hace que «createBattle lanza si no caben» no se dispare
  // nunca en partida. La cuenta: cada individuo ocupa al menos 2 de liderazgo
  // por hex, así que un ejército de `max` ocupa a lo sumo `max / 2` hexes; y
  // una grande ocupa una fila, así que caben tantas como filas. El `+ 1`
  // reserva el hex del héroe, que entra al tablero en la fase 1b.
  const topes = [LIDERAZGO.heroe.max, LIDERAZGO.guarnicion];

  it('ningún individuo ocupa menos de 2 de liderazgo por cada hex que pisa', () => {
    for (const c of allCreatures()) {
      expect(c.leadership, c.id).toBeGreaterThanOrEqual(2 * hexSize(c));
      expect(Number.isInteger(c.leadership), c.id).toBe(true);
    }
    // Un personaje pisa un hex.
    expect(LIDERAZGO.personaje).toBeGreaterThanOrEqual(2);
  });

  it('la guarnición no pasa del liderazgo de un héroe recién contratado', () => {
    // Ese acoplamiento vivía solo en el `_comment` de `data/liderazgo.json`: con
    // una guarnición mayor que lo que lleva un héroe de nivel 1, dos héroes
    // nuevos no la vencen nunca, nadie sube de nivel y la semilla 10 se queda
    // en tablas para siempre. Bajar `heroe.base` lo reabría sin decir nada.
    expect(LIDERAZGO.guarnicion).toBeLessThanOrEqual(LIDERAZGO.heroe.base);
    expect(GARRISON_LEADERSHIP).toBe(LIDERAZGO.guarnicion);
  });

  it('el tope más alto, a 2 por hex y con el héroe, cabe en los hexes de un bando', () => {
    for (const tope of topes) {
      expect(Math.floor(tope / 2) + 1).toBeLessThanOrEqual(HEXES_POR_BANDO);
    }
  });

  it('las grandes que caben en el tope no pasan de una por fila', () => {
    const grandes = allCreatures().filter((c) => hexSize(c) > 1);
    expect(grandes.length).toBeGreaterThan(0);
    for (const c of grandes) {
      for (const tope of topes) {
        expect(Math.floor(tope / c.leadership), c.id).toBeLessThanOrEqual(BOARD_HEIGHT);
      }
    }
  });

  it('y lo comprueba la propia regla del despliegue, criatura a criatura', () => {
    for (const c of allCreatures()) {
      const cuantos = Math.floor(LIDERAZGO.heroe.max / c.leadership);
      const ejercitoLleno = Array.from({ length: cuantos }, () => c);
      expect(despliegueBlocker(ejercitoLleno), c.id).toBeNull();
    }
  });
});

describe('todos los lectores del ejército saben de personajes', () => {
  /** Un héroe que lleva un personaje y un campesino, con el personaje dado de alta. */
  function conPersonaje(state: GameState) {
    const aren = createCharacter('aren', { ...defaultBuild, profession: 'Guerrero' });
    state.characters = { aren };
    const hero = heroesOf(state, 0)[0]!;
    hero.army = [{ creature: CHARACTER_BODY, member: 'aren' }, { creature: 'champion' }];
    return { hero, aren };
  }

  it('un héroe con un personaje pasa de día sin lanzar', () => {
    // La issue que dejó abierta la fase 2: `advanceDay` repone el movimiento con
    // `maxMovePoints`, que buscaba la velocidad de cada stack en el catálogo y
    // lanzaba «criatura desconocida: "character"».
    const state = newGame({ seed: 7 });
    const { hero, aren } = conPersonaje(state);
    const dia = state.day;
    applyAdventureAction(state, { type: 'end_turn' }, ctx(7), 0);
    applyAdventureAction(state, { type: 'end_turn' }, ctx(7), 1);
    expect(state.day).toBe(dia + 1);

    // Y el movimiento lo marca el más lento: el personaje, por su destreza, y
    // no el campeón ultrarrápido.
    const speed = combatProfile(aren).unit.speed;
    expect(slowestSpeed(hero.army, state.characters)).toBe(speed);
    expect(hero.movePoints).toBe(maxMovePoints(hero, state.characters));
    expect(hero.movePoints).toBeLessThan(SPEED_TO_MOVE_POINTS.ultra_fast);
  });

  it('la fuerza de la IA y la vista del agente leen el perfil del personaje', () => {
    const state = newGame({ seed: 7 });
    const { hero, aren } = conPersonaje(state);
    const perfil = combatProfile(aren).unit;
    const campeon = creature('champion');
    // La fórmula es la de la IA y no una copia: lo que se prueba es de DÓNDE
    // saca las cifras —el perfil del personaje—, no cómo las combina.
    expect(armyPower(hero.army, state.characters)).toBe(unitPower(perfil) + unitPower(campeon));

    const vista = serializeAdventureTurn(state, 0) as {
      heroes: { id: string; army: unknown[]; leadership: { used: number; max: number } }[];
    };
    const mio = vista.heroes.find((h) => h.id === hero.id)!;
    expect(mio.army).toEqual([
      { creature: CHARACTER_BODY, member: 'aren', count: 1, speed: perfil.speed },
      { creature: 'champion', count: 1, speed: campeon.speed },
    ]);
    expect(mio.leadership).toEqual({
      used: LIDERAZGO.personaje + campeon.leadership,
      max: heroLeadership(hero),
    });
  });
});

describe('la IA de reglas juega dentro del liderazgo', () => {
  it('ninguna partida entera deja a un héroe ni a una guarnición por encima de su tope', async () => {
    // Reclutar por encima LANZA, así que una IA que se pasara reventaría la
    // partida: que estas terminen ya dice que `planRecruits` respeta el tope.
    // Lo de abajo cubre lo que no pasa por `recruit`: llevarse la guarnición.
    for (let seed = 1; seed <= 6; seed++) {
      const state = newGame({ seed, maxDays: 60 });
      await playAiGame(state, ctx(seed));
      expect(state.finished, `semilla ${seed}`).not.toBeNull();
      for (const h of state.heroes) {
        expect(armyLeadership(h.army)).toBeLessThanOrEqual(heroLeadership(h));
      }
      for (const t of state.towns) {
        expect(armyLeadership(t.garrison)).toBeLessThanOrEqual(GARRISON_LEADERSHIP);
      }
    }
  });

  it('el reclutamiento de la IA no pide más de lo que cabe', () => {
    const { state, hero, town } = heroeEnCasa(21);
    hero.army = ejercito({ creature: 'peasant', count: 8 }); // 16 de 20
    town.available.peasant = 50;
    state.players[0]!.resources = { ...state.players[0]!.resources, gold: 50_000 };
    const reclutas = planRecruits(state, 0).filter((a) => a.type === 'recruit');
    const total = reclutas.reduce((n, a) => n + (a.type === 'recruit' ? a.count : 0), 0);
    // Había cincuenta y oro de sobra: lo que manda son los 4 de liderazgo libres.
    expect(total).toBe(2);
    for (const a of reclutas) applyAdventureAction(state, a, ctx(21), 0);
    expect(armyLeadership(hero.army)).toBe(20);
  });
});
