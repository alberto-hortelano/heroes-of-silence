import { describe, expect, it } from 'vitest';
import { planBuildings, planHires, planRecruits } from '../src/core/ai/strategy.js';
import { chooseBattleAction } from '../src/core/ai/tactics.js';
import { activeStack, createBattle, legalActions } from '../src/core/battle/battle.js';
import {
  adventureActionSchema,
  battleActionSchema,
  mapPlanSchema,
  REQUEST_KINDS,
  RESPONSE_FORMAT,
  responseSchemas,
} from '../src/core/contract/agent.js';
import {
  serializeAdventureTurn,
  serializeBattleTurn,
  serializeMapRequest,
} from '../src/core/contract/serialize.js';
import { generateMapPlan } from '../src/core/map/generate.js';
import { pointKey } from '../src/core/map/map.js';
import { createRng } from '../src/core/rng.js';
import {
  applyAdventureAction,
  heroesOf,
  resolvePendingBattle,
  revealEverything,
  visibleNow,
} from '../src/core/state/game.js';
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
      {
        army: [
          { creature: 'swordsman', count: 10 },
          { creature: 'archer', count: 6 },
          null,
          null,
          null,
        ],
        hero: null,
      },
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

  it('el id y el nombre de un pueblo están acotados, no son `string` a secas (#97)', () => {
    // Los dos únicos textos del plan que el motor usa VERBATIM: de `buildMap`
    // salen al `MapObject`, al `Town`, y de ahí a la consulta `map`, a
    // `game_state` y al canal del espectador. Un id con un salto de línea
    // dentro además parte el bloque de veredictos, que se lee línea a línea.
    const base = generateMapPlan(createRng(13));
    const conPueblo = (parche: Record<string, unknown>): unknown => ({
      ...base,
      towns: [{ ...base.towns[0], ...parche }, base.towns[1]],
    });

    // Lo que ya se juega tiene que seguir pasando: `town-0` es el id del
    // procedimental, y si el acotado lo rechazara no habría partida sin agente.
    expect(mapPlanSchema.safeParse(conPueblo({ id: 'town-0' })).success).toBe(true);

    for (const malo of ['', 'Pueblo Uno', '-town', 'TOWN', 'town/0', 'x'.repeat(33)]) {
      const r = mapPlanSchema.safeParse(conPueblo({ id: malo }));
      expect(r.success, `id ${JSON.stringify(malo)} debería rechazarse`).toBe(false);
    }
    for (const malo of ['', 'x'.repeat(41), 'Valde\nluz']) {
      const r = mapPlanSchema.safeParse(conPueblo({ name: malo }));
      expect(r.success, `name ${JSON.stringify(malo)} debería rechazarse`).toBe(false);
    }
    // Y el motivo se le dice al agente: un rechazo sin forma no se corrige.
    const r = mapPlanSchema.safeParse(conPueblo({ id: 'Pueblo Uno' }));
    if (r.success) throw new Error('«Pueblo Uno» debería rechazarse');
    expect(r.error.issues.map((i) => i.message).join(' ')).toMatch(/minúsculas/);
  });
});

describe('lo que ve el agente', () => {
  it('el estado del turno viaja como JSON sin perder nada', () => {
    const state = newGame({ seed: 91 });
    const payload = serializeAdventureTurn(state, 0);
    const roundtrip = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    expect(roundtrip).toEqual(payload);
    expect(roundtrip.kind).toBe('adventure_turn');
    expect(Array.isArray(roundtrip.heroes)).toBe(true);
    expect((roundtrip.towns as unknown[]).length).toBeGreaterThan(0);
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

  it('lo que se dejó atrás se manda como se vio, con el día en que se vio', () => {
    // La niebla filtraba el espacio pero no el tiempo: pisar una casilla el día
    // 1 bastaba para saber, el día 20, de quién es la mina AHORA.
    const state = newGame({ seed: 92 });
    revealEverything(state, 0);
    const mirando = visibleNow(state, 0);

    const lejos = state.map.objects.find((o) => o.kind === 'mine' && !mirando.has(pointKey(o.at)));
    expect(lejos, 'la semilla no deja ninguna mina fuera de la vista').toBeDefined();
    if (lejos === undefined || lejos.kind !== 'mine') throw new Error('sin mina lejana');

    // Pasan diecinueve días y el rival la captura sin que nadie lo vea.
    state.day = 20;
    lejos.owner = 1;

    const payload = serializeAdventureTurn(state, 0) as {
      knownMap: { objects: { id: string; owner?: number | null; lastSeen: number }[] };
    };
    const vista = payload.knownMap.objects.find((o) => o.id === lejos.id)!;
    expect(vista.owner).toBeNull();
    expect(vista.lastSeen).toBe(1);
  });

  it('lo que se está mirando ahora sí es el presente', () => {
    const state = newGame({ seed: 92 });
    revealEverything(state, 0);
    const mirando = visibleNow(state, 0);

    const cerca = state.map.objects.find((o) => o.kind === 'mine' && mirando.has(pointKey(o.at)));
    expect(cerca, 'la semilla no deja ninguna mina a la vista').toBeDefined();
    if (cerca === undefined || cerca.kind !== 'mine') throw new Error('sin mina cercana');

    state.day = 20;
    cerca.owner = 1;

    const payload = serializeAdventureTurn(state, 0) as {
      knownMap: { objects: { id: string; owner?: number | null; lastSeen: number }[] };
    };
    const vista = payload.knownMap.objects.find((o) => o.id === cerca.id)!;
    // Con un héroe delante no hay recuerdo que valga: se ve lo que hay.
    expect(vista.owner).toBe(1);
    expect(vista.lastSeen).toBe(20);
  });

  it('un héroe enemigo se ve solo si alguien lo está mirando', () => {
    const state = newGame({ seed: 92 });
    revealEverything(state, 0);

    const mio = heroesOf(state, 0)[0]!;
    const suyo = state.heroes.find((h) => h.owner === 1)!;

    // Con el mapa entero explorado, antes se le seguía por medio mapa sin tener
    // a nadie cerca: bastaba con haber pisado esa casilla alguna vez.
    const lejos = serializeAdventureTurn(state, 0) as { enemyHeroes: unknown[] };
    expect(lejos.enemyHeroes).toEqual([]);

    suyo.at = { ...mio.at };
    const delante = serializeAdventureTurn(state, 0) as { enemyHeroes: { id: string }[] };
    expect(delante.enemyHeroes.map((h) => h.id)).toEqual([suyo.id]);
  });

  it('la petición de batalla trae todas las acciones legales', () => {
    const state = newGame({ seed: 93 });
    const ctx = { rng: createRng(93) };
    const hero = heroesOf(state, 0)[0]!;
    forzarBatalla(state, ctx, hero);

    const battle = state.pendingBattle!.battle;
    // El bando sale del stack activo y no de un `'attacker'` escrito a mano,
    // que es lo que hace el director: `legalActions` es la lista de quien
    // decide, y desde #73 solo se manda cuando le toca a él.
    const activo = activeStack(battle)!;
    const payload = serializeBattleTurn(battle, activo.side, 'propia') as {
      legalActions: unknown[];
    };
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

    applyAdventureAction(
      state,
      { type: 'build', town: town.id, building: 'mage_guild_1' },
      c,
      state.current,
    );

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

  it('el formato de respuesta avisa de que la crónica pasa por la niebla', () => {
    // El campo cambió de significado sin cambiar de forma, que es el caso más
    // fácil de dejar sin explicar: un agente que crea que `recentEvents` es
    // todo lo que pasa leerá un silencio como «el rival está quieto» y decidirá
    // sobre eso.
    expect(RESPONSE_FORMAT.adventure_turn).toContain('recentEvents');
    expect(RESPONSE_FORMAT.adventure_turn).toMatch(/observabas cuando ocurrió/i);
    expect(RESPONSE_FORMAT.adventure_turn).toMatch(/silencio NO significa/i);
  });

  it('lo que el esquema del mapa acota, la prosa lo dice (#97)', () => {
    // El esquema y la prosa viajan juntos en la misma petición, así que acotar
    // sin anunciarlo es fabricar un rechazo que el agente no puede prever: no se
    // corrige, reintenta. Lo mismo que se aprendió con `PARAMETRO_JUGADOR`.
    expect(RESPONSE_FORMAT.map_generate).toMatch(/minúsculas/);
    expect(RESPONSE_FORMAT.map_generate).toMatch(/town-0/);
    expect(RESPONSE_FORMAT.map_generate).toMatch(/no puede repetirse/);
    expect(RESPONSE_FORMAT.map_generate).toMatch(/heroStarts/);
    expect(RESPONSE_FORMAT.map_generate).toMatch(/numerados desde 0/);
  });

  it('y la prosa enumera TODO lo que se valida, no tres cuartas partes', () => {
    // La lección del bloqueante: la paleta manda cuatro listas al agente y solo
    // tres se validaban. La que faltaba era la única que el motor ejecuta, y
    // `RESPONSE_FORMAT` tampoco la nombraba entre las «reglas que se validan»,
    // así que un modelo que lea el contrato no tiene motivo para creer que la
    // lista sea cerrada ni que distinga mayúsculas. Ahora lo dice.
    const prosa = RESPONSE_FORMAT.map_generate;
    expect(prosa).toMatch(/creaturesForGuards/);
    expect(prosa).toMatch(/Distingue mayúsculas/);
    // Las posiciones de inicio ocupan casilla.
    expect(prosa).toMatch(/posiciones de inicio TAMBIÉN\s+ocupan/);
    // Los dueños tienen que jugar.
    expect(prosa).toMatch(/owner.*jugadores CON posición\s+de inicio/s);
    // El tamaño pedido es el que hay que devolver.
    expect(prosa).toMatch(/Devuelve el "width" y el "height" que se te piden/);
    // Y que el orden no le regala la iniciativa a nadie.
    expect(prosa).toMatch(/ORDEN en que escribas "heroStarts" no decide nada/);
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
      plan: {
        width: 500,
        height: 4,
        baseTerrain: 'grass',
        regions: [],
        towns: [],
        heroStarts: [],
        mines: [],
        resources: [],
        monsters: [],
        chests: [],
      },
    });
    expect(r.success).toBe(false);
  });
});
