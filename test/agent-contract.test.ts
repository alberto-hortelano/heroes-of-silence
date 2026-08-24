import { describe, expect, it } from 'vitest';
import {
  adventureActionSchema,
  battleActionSchema,
  mapPlanSchema,
  responseSchemas,
  RESPONSE_FORMAT,
  REQUEST_KINDS,
} from '../src/core/contract/agent.js';
import {
  serializeAdventureTurn,
  serializeBattleTurn,
  serializeMapRequest,
} from '../src/core/contract/serialize.js';
import { chooseBattleAction } from '../src/core/ai/tactics.js';
import { planBuildings, planHires, planRecruits } from '../src/core/ai/strategy.js';
import { createBattle, legalActions } from '../src/core/battle/battle.js';
import { generateMapPlan } from '../src/core/map/generate.js';
import { createRng } from '../src/core/rng.js';
import { heroesOf, resolvePendingBattle, applyAdventureAction } from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import { mageGuildLevel, townSpells } from '../src/core/town/town.js';
import { forzarBatalla } from './helpers.js';

describe('contrato con el agente', () => {
  it('cada tipo de petición tiene esquema y formato de respuesta', () => {
    for (const kind of REQUEST_KINDS) {
      expect(responseSchemas[kind]).toBeDefined();
      expect(RESPONSE_FORMAT[kind].length).toBeGreaterThan(20);
    }
  });

  // Si el motor genera una acción que el esquema rechaza, el agente no podría
  // imitar a la IA de reglas. Este test ata las dos definiciones.
  it('las acciones que produce la IA de reglas pasan el esquema del agente', () => {
    const state = newGame({ seed: 77 });
    const acciones = [
      ...planHires(state, 0),
      ...planBuildings(state, 0),
      ...planRecruits(state, 0),
      { type: 'move_hero' as const, hero: heroesOf(state, 0)[0]!.id, to: { x: 5, y: 5 } },
      { type: 'end_turn' as const },
    ];
    expect(acciones.length).toBeGreaterThan(2);
    for (const accion of acciones) {
      const r = adventureActionSchema.safeParse(accion);
      expect(r.success, `rechazada: ${JSON.stringify(accion)}`).toBe(true);
    }
  });

  it('las acciones de batalla de la IA pasan su esquema', () => {
    const rng = createRng(88);
    const battle = createBattle(
      { army: [{ creature: 'swordsman', count: 10 }, { creature: 'archer', count: 6 }, null, null, null], hero: null },
      { army: [{ creature: 'skeleton', count: 20 }, null, null, null, null], hero: null },
      rng,
    );
    for (const accion of legalActions(battle)) {
      expect(battleActionSchema.safeParse(accion).success).toBe(true);
    }
    expect(battleActionSchema.safeParse(chooseBattleAction(battle)).success).toBe(true);
  });

  it('el plan del generador procedural pasa el esquema de mapa', () => {
    for (const semilla of [1, 5, 50]) {
      const plan = generateMapPlan(createRng(semilla));
      const r = mapPlanSchema.safeParse(plan);
      expect(r.success, JSON.stringify(r.success ? '' : r.error.issues)).toBe(true);
    }
  });
});

describe('lo que ve el agente', () => {
  it('el estado del turno viaja como JSON sin perder nada', () => {
    const state = newGame({ seed: 91 });
    const payload = serializeAdventureTurn(state, 0);
    const roundtrip = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    expect(roundtrip).toEqual(payload);
    expect(roundtrip['kind']).toBe('adventure_turn');
    expect(Array.isArray(roundtrip['heroes'])).toBe(true);
    expect((roundtrip['towns'] as unknown[]).length).toBeGreaterThan(0);
  });

  it('solo enseña lo que ese jugador ha explorado', () => {
    const state = newGame({ seed: 92 });
    const payload = serializeAdventureTurn(state, 0) as {
      knownMap: { objects: { at: { x: number; y: number } }[] };
    };
    const jugador = state.players[0]!;
    for (const obj of payload.knownMap.objects) {
      expect(jugador.fog.has(`${obj.at.x},${obj.at.y}`)).toBe(true);
    }
    // El castillo enemigo está al otro lado del mapa: no debe asomar.
    const puebloEnemigo = state.towns.find((t) => t.owner === 1)!;
    expect(
      payload.knownMap.objects.some(
        (o) => o.at.x === puebloEnemigo.at.x && o.at.y === puebloEnemigo.at.y,
      ),
    ).toBe(false);
  });

  it('la petición de batalla trae todas las acciones legales', () => {
    const state = newGame({ seed: 93 });
    const ctx = { rng: createRng(93) };
    const hero = heroesOf(state, 0)[0]!;
    forzarBatalla(state, ctx, hero);

    const battle = state.pendingBattle!.battle;
    const payload = serializeBattleTurn(battle, 'attacker') as { legalActions: unknown[] };
    expect(payload.legalActions.length).toBeGreaterThan(0);
    expect(payload.legalActions).toEqual(legalActions(battle));
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);

    resolvePendingBattle(state, ctx);
  });

  it('el pueblo manda qué enseña su gremio, y el héroe qué sabe', () => {
    const state = newGame({ seed: 94 });
    const c = { rng: createRng(94) };
    const town = state.towns.find((t) => t.owner === 0)!;
    const hero = heroesOf(state, 0)[0]!;
    hero.at = { ...town.at };

    // Sin gremio no enseña nada: el agente no ve una lista que no existe.
    const sinGremio = serializeAdventureTurn(state, 0) as {
      towns: { id: string; mageGuild: number; teaches: string[] }[];
    };
    expect(sinGremio.towns.find((t) => t.id === town.id)!.teaches).toEqual([]);

    applyAdventureAction(state, { type: 'build', town: town.id, building: 'mage_guild_1' }, c);

    const payload = serializeAdventureTurn(state, 0) as {
      heroes: { id: string; spells: string[] }[];
      towns: { id: string; mageGuild: number; teaches: string[] }[];
    };

    // Qué enseña cada nivel de gremio es una regla del núcleo y la prueba
    // `game.test.ts`. Lo que se prueba AQUÍ es lo del contrato: que el campo
    // existe y refleja al núcleo sin inventarse nada por el camino.
    const vista = payload.towns.find((t) => t.id === town.id)!;
    expect(vista.mageGuild).toBe(mageGuildLevel(town));
    expect(vista.teaches).toEqual(townSpells(town).map((s) => s.id));

    // Y el libro del héroe que está dentro, igual: sin que el agente haya
    // mandado ninguna acción de aprender, porque no existe tal acción.
    expect(payload.heroes.find((h) => h.id === hero.id)!.spells).toEqual(hero.spells);
    expect(hero.spells.length).toBeGreaterThan(0);
  });

  it('el formato de respuesta avisa de que `cast` no gasta el turno y de que no hay acción de aprender', () => {
    // La prosa viaja con el campo: un campo nuevo que el agente no sabe leer es
    // ruido, y una acción que no existe la intentaría igual si nadie se lo dice.
    expect(RESPONSE_FORMAT.battle_turn).toMatch(/no consume el turno/i);
    expect(RESPONSE_FORMAT.adventure_turn).toContain('teaches');
    expect(RESPONSE_FORMAT.adventure_turn).toMatch(/no hay acción para aprender/i);
  });

  it('la petición de mapa describe la paleta disponible', () => {
    const payload = serializeMapRequest({ width: 24, height: 24, players: 2 }) as {
      palette: { terrains: string[]; factions: string[] };
    };
    expect(payload.palette.terrains).toContain('grass');
    expect(payload.palette.factions).toEqual(['knight', 'necromancer']);
  });
});

describe('respuestas del agente', () => {
  it('acepta una respuesta de turno bien formada', () => {
    const r = responseSchemas.adventure_turn.safeParse({
      actions: [
        { type: 'build', town: 'town-1', building: 'knight_dwelling_2' },
        { type: 'move_hero', hero: 'hero-1', to: { x: 3, y: 4 } },
      ],
      reasoning: 'Construyo y salgo a por la mina.',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza acciones inventadas y dice qué falla', () => {
    const r = responseSchemas.adventure_turn.safeParse({
      actions: [{ type: 'teleport', hero: 'hero-1' }],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.length).toBeGreaterThan(0);
  });

  it('rechaza reclutar una cantidad negativa', () => {
    const r = responseSchemas.adventure_turn.safeParse({
      actions: [{ type: 'recruit', town: 't', creature: 'peasant', count: -5 }],
    });
    expect(r.success).toBe(false);
  });

  it('rechaza un plan de mapa fuera de límites', () => {
    const r = responseSchemas.map_generate.safeParse({
      plan: { width: 500, height: 4, baseTerrain: 'grass', regions: [], towns: [], heroStarts: [], mines: [], resources: [], monsters: [], chests: [] },
    });
    expect(r.success).toBe(false);
  });
});
