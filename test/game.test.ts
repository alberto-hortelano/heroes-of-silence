import { describe, expect, it } from 'vitest';
import {
  armyPower,
  chooseBuilding,
  chooseHeroDestination,
  ordenDeConstruccion,
  planBuildings,
  planHires,
  planRecruits,
  stepTowards,
} from '../src/core/ai/strategy.js';
import { playAiGame, playAiTurn } from '../src/core/ai/turn.js';
import { allSpells } from '../src/core/battle/spells.js';
import { factionLineup } from '../src/core/data.js';
import {
  experienceForLevel,
  learnable,
  levelFromExperience,
  maxMana,
  maxMovePoints,
  slowestSpeed,
} from '../src/core/hero/hero.js';
import { buildMap, generateMapPlan, validateMapPlan } from '../src/core/map/generate.js';
import {
  blocksMovement,
  createEmptyMap,
  findPath,
  objectAt,
  pathFromReachable,
  pointKey,
  reachableFrom,
  stepCost,
} from '../src/core/map/map.js';
import { isWalkable, ROAD_COST, TERRAIN_KINDS } from '../src/core/map/terrain.js';
import { createRng, parseSeed } from '../src/core/rng.js';
import {
  type AdventureAction,
  applyAdventureAction,
  currentPlayer,
  dayOfWeek,
  type GameContext,
  type GameState,
  HERO_HIRE_COST,
  heroById,
  heroesOf,
  resolvePendingBattle,
  townsOf,
  week,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import { building, buildingsOfFaction } from '../src/core/town/buildings.js';
import {
  applyWeeklyGrowth,
  availableBuildings,
  build,
  buildBlocker,
  createTown,
  dwellings,
  type Town,
  townSpells,
} from '../src/core/town/town.js';
import { type Point, RESOURCE_KINDS, type Resources } from '../src/core/types.js';
import { forzarBatalla, monstruoVivo, ponerMonstruo } from './helpers.js';

const ctx = (seed: number): GameContext => ({ rng: createRng(seed) });

describe('puntos de movimiento', () => {
  it('los marca la criatura más lenta del ejército', () => {
    const lento = [
      { creature: 'zombie', count: 5 },
      { creature: 'champion', count: 5 },
      null,
      null,
      null,
    ];
    expect(slowestSpeed(lento)).toBe('very_slow');
    expect(maxMovePoints({ army: lento, skills: {} })).toBe(1000);

    const rapido = [{ creature: 'champion', count: 5 }, null, null, null, null];
    expect(slowestSpeed(rapido)).toBe('ultra_fast');
    expect(maxMovePoints({ army: rapido, skills: {} })).toBe(1500);
  });

  it('Logística los aumenta un 10 % por nivel', () => {
    const army = [{ creature: 'skeleton', count: 5 }, null, null, null, null];
    expect(maxMovePoints({ army, skills: {} })).toBe(1200);
    expect(maxMovePoints({ army, skills: { logistics: 1 } })).toBe(1320);
    expect(maxMovePoints({ army, skills: { logistics: 3 } })).toBe(1560);
  });
});

describe('maná', () => {
  it('es diez veces el conocimiento', () => {
    expect(maxMana({ knowledge: 2 })).toBe(20);
    expect(maxMana({ knowledge: 7 })).toBe(70);
  });
});

describe('generación de mapas', () => {
  it('el mapa procedural es jugable', () => {
    for (const semilla of [1, 2, 3, 42, 777]) {
      const plan = generateMapPlan(createRng(semilla));
      expect(validateMapPlan(plan)).toEqual([]);
    }
  });

  it('rechaza un plan con un pueblo inalcanzable', () => {
    const plan = generateMapPlan(createRng(5));
    // Rodear el pueblo enemigo de agua lo deja aislado.
    const aislado = {
      ...plan,
      regions: [
        ...plan.regions,
        { terrain: 'water' as const, center: plan.towns[1]!.at, radius: 3 },
      ],
    };
    const problemas = validateMapPlan(aislado);
    expect(problemas.length).toBeGreaterThan(0);
    expect(problemas.join(' ')).toMatch(/no puede llegar/);
  });

  it('rechaza dos pueblos con el mismo id (#97)', () => {
    // No choca con nada al construir, y eso es lo que lo hace peligroso:
    // `buildMap` crea dos `Town` y dos `MapObject` con el mismo id, y desde ahí
    // construir, reclutar o capturar encuentran siempre el primero. El segundo
    // castillo existe y es inalcanzable.
    const plan = generateMapPlan(createRng(11));
    const repetido = {
      ...plan,
      towns: plan.towns.map((t, i) => ({ ...t, id: 't', at: i === 0 ? t.at : t.at })),
    };
    expect(validateMapPlan(repetido).join(' ')).toMatch(/dos pueblos con el id "t"/);
  });

  it('rechaza un jugador con dos posiciones de inicio (#97)', () => {
    // `setup.ts` deriva el id del héroe del jugador y no del orden, así que dos
    // inicios del 0 dan dos héroes `hero-0`.
    const plan = generateMapPlan(createRng(12));
    const doble = {
      ...plan,
      heroStarts: [
        ...plan.heroStarts,
        { player: 0, at: { x: plan.heroStarts[0]!.at.x + 1, y: plan.heroStarts[0]!.at.y } },
      ],
    };
    expect(validateMapPlan(doble).join(' ')).toMatch(/jugador 0 tiene dos posiciones de inicio/);
  });

  it('rechaza un monstruo de una criatura que no existe, y dice cuáles valen', () => {
    // El bloqueante del ciclo. De las cuatro listas de la paleta que se le
    // mandan al agente —terreno, recursos, facciones y criaturas— tres viajaban
    // por `z.enum` y esta por `z.string()`, y es justo la que el motor EJECUTA:
    // `buildMap` la copia verbatim y el primer turno de la IA llama a
    // `creature(id)`, que lanza. El plan se aceptaba, se le acusaba al agente
    // «tu plan entró», y la partida moría antes del día 2.
    const plan = generateMapPlan(createRng(31));
    const inventada = {
      ...plan,
      monsters: [...plan.monsters, { at: { x: 11, y: 11 }, creature: 'dragon', count: 3 }],
    };
    const problemas = validateMapPlan(inventada);
    expect(problemas.join(' ')).toMatch(/criatura que no existe: "dragon"/);
    // Y con qué corregirlo: un rechazo que no dice las opciones no se corrige.
    expect(problemas.join(' ')).toMatch(/Las que valen:.*skeleton/);

    // La mayúscula también, que es el error más probable de un modelo.
    const mayuscula = {
      ...plan,
      monsters: [{ at: plan.monsters[0]!.at, creature: 'Skeleton', count: 3 }],
    };
    expect(validateMapPlan(mayuscula).join(' ')).toMatch(/"Skeleton"/);

    // Y el plan que muere en la puerta NO llega a construirse: `newGame` lanza
    // con el motivo del plan, no con «criatura desconocida» desde dentro del
    // turno de la IA, que era donde reventaba.
    expect(() => newGame({ seed: 31, plan: inventada })).toThrow(/no es jugable/);
  });

  it('los inicios de héroe también ocupan casilla (#97, la puerta de al lado)', () => {
    const plan = generateMapPlan(createRng(32));
    // Dos héroes en la misma casilla.
    const juntos = {
      ...plan,
      heroStarts: [plan.heroStarts[0]!, { player: 1, at: plan.heroStarts[0]!.at }],
    };
    expect(validateMapPlan(juntos).join(' ')).toMatch(/la ocupan dos cosas.*inicio del jugador 1/);

    // Y un héroe encima del castillo rival, que no revienta y da una partida
    // degenerada — la peor forma de pasar.
    const encima = {
      ...plan,
      heroStarts: [{ player: 0, at: plan.towns[1]!.at }, plan.heroStarts[1]!],
    };
    expect(validateMapPlan(encima).join(' ')).toMatch(/la ocupan dos cosas/);
  });

  it('un pueblo o una mina de un jugador que no juega se rechazan', () => {
    const plan = generateMapPlan(createRng(33));
    const fantasma = {
      ...plan,
      towns: [
        ...plan.towns,
        {
          id: 'town-9',
          name: 'Fantasma',
          faction: 'knight' as const,
          at: { x: 12, y: 2 },
          owner: 7,
        },
      ],
    };
    expect(validateMapPlan(fantasma).join(' ')).toMatch(
      /pueblo "town-9" es del jugador 7, que no tiene posición de inicio/,
    );

    const minaAjena = {
      ...plan,
      mines: plan.mines.map((m, i) => (i === 0 ? { ...m, owner: 7 } : m)),
    };
    expect(validateMapPlan(minaAjena).join(' ')).toMatch(
      /mina de \w+ en \(\d+,\d+\) es del jugador 7/,
    );

    // Neutral sigue valiendo: filtrar no es prohibir.
    expect(validateMapPlan({ ...plan, towns: plan.towns.map((t) => ({ ...t })) })).toEqual([]);
  });

  it('el ORDEN de heroStarts no decide quién abre la partida', () => {
    // `currentPlayer` juega por el índice de `state.players`, y `state.players`
    // salía del orden en que el plan escribe `heroStarts`. Con el mapa en manos
    // del agente eso es repartirse la iniciativa: mandando los inicios del revés
    // abría él el día 1. Comprobado en el circuito real antes de arreglarlo.
    const plan = generateMapPlan(createRng(34));
    const alDerecho = newGame({ seed: 34, plan });
    const alReves = newGame({
      seed: 34,
      plan: { ...plan, heroStarts: [...plan.heroStarts].reverse() },
    });

    for (const state of [alDerecho, alReves]) {
      expect(state.players.map((p) => p.id)).toEqual([0, 1]);
      expect(state.heroes.map((h) => h.owner)).toEqual([0, 1]);
      // Y la facción va con el jugador, no con la posición en la lista.
      expect(state.players[0]!.faction).toBe(plan.towns.find((t) => t.owner === 0)!.faction);
    }
    // Invertir los inicios da la MISMA partida, no una parecida: el orden del
    // plan deja de ser una palanca.
    expect(JSON.stringify(alReves.heroes)).toBe(JSON.stringify(alDerecho.heroes));
  });

  it('rechaza dos objetos en la misma casilla', () => {
    const plan = generateMapPlan(createRng(6));
    const chocado = {
      ...plan,
      chests: [...plan.chests, { at: plan.towns[0]!.at, gold: 100 }],
    };
    expect(validateMapPlan(chocado).join(' ')).toMatch(/la ocupan dos cosas/);
  });

  it('la misma semilla da la misma partida, y otra da otra (#53)', () => {
    // Es la promesa entera de `?seed=N`: sin esto, un fallo encontrado jugando
    // no se puede volver a producir, que es para lo que existe el parámetro.
    // Se compara lo que se VE al empezar: terreno, objetos y héroes.
    const retrato = (s: ReturnType<typeof newGame>): string =>
      JSON.stringify({
        terreno: s.map.terrain,
        objetos: s.map.objects,
        pueblos: s.towns.map((t) => ({ id: t.id, at: t.at, faction: t.faction, owner: t.owner })),
        heroes: s.heroes.map((h) => ({ id: h.id, name: h.name, at: h.at, army: h.army })),
      });

    expect(retrato(newGame({ seed: 777 }))).toBe(retrato(newGame({ seed: 777 })));
    // Y la otra mitad, para que la primera no pase por una partida constante:
    // si `newGame` ignorara la semilla, la comparación de arriba sola sería
    // verde y no probaría nada.
    expect(retrato(newGame({ seed: 777 }))).not.toBe(retrato(newGame({ seed: 778 })));
  });

  it('una semilla escrita a mano se lee, y la que no lo es se RECHAZA (#53)', () => {
    // La otra mitad de `?seed=N`: el número que escribe una persona entra por
    // aquí, en `core`, y no en la capa que solo pinta. Lo que se defiende es que
    // NADA se corrija en silencio — `createRng` hace `seed >>> 0`, así que un
    // `-1` no revienta: abre otra partida sin decirlo, que es peor.
    expect(parseSeed('777')).toBe(777);
    expect(parseSeed('0')).toBe(0);

    // Y la trampa de verdad: `Number(null)` y `Number('')` son 0, una semilla
    // legal. Si esto devolviera un número, «no pediste ninguna» y «pediste la
    // 0» serían la misma partida. `null` es lo que dice «no ha pedido» sin
    // matar a nadie: no pedir semilla NO es un error, y los dos llamantes
    // discrepaban justo aquí — `HEROES_SEED=` vacía mataba el servidor mientras
    // `?seed=` vacío sorteaba en el navegador.
    expect(parseSeed(null)).toBeNull();
    expect(parseSeed(undefined)).toBeNull();
    expect(parseSeed('')).toBeNull();
    expect(parseSeed('   ')).toBeNull();
    for (const malo of ['abc', '-1', '7.5', 'NaN', 'Infinity']) {
      expect(() => parseSeed(malo), malo).toThrow(/no es una semilla/);
    }
  });

  it('construye el mapa con todos los objetos del plan', () => {
    const plan = generateMapPlan(createRng(9));
    const { map, towns } = buildMap(plan);
    expect(towns).toHaveLength(plan.towns.length);
    expect(map.objects.filter((o) => o.kind === 'monster')).toHaveLength(plan.monsters.length);
    expect(map.objects.filter((o) => o.kind === 'mine')).toHaveLength(plan.mines.length);
    for (const mina of plan.mines) expect(objectAt(map, mina.at)).toBeDefined();
  });

  it('el generador reparte minas de los siete recursos, y en espejo exacto (#68)', () => {
    // La mitad de #68: `recursosMina` tenía cuatro entradas, así que NO existía
    // una sola mina de gemas, mercurio ni azufre en ningún mapa — y seis
    // edificios que los piden eran inalcanzables durase lo que durase la
    // partida. Los montones sueltos no cuentan: la IA recoge una mediana de 0
    // en toda una partida.
    //
    // Sigue siendo una lista escrita, porque su ORDEN coloca las minas; este
    // test es el guardia de que no vuelva a quedarse corta, y por eso recorre
    // `RESOURCE_KINDS` y no la lista del generador: comparar la lista consigo
    // misma no probaría nada.
    //
    // El espejo es la otra mitad y es lo que hace que la simetría sea una
    // aserción y no una intención: si un bando naciera con una mina de gemas a
    // mano y el otro no, la partida la decidiría el generador. La distancia
    // inicial no varía con la semilla, así que se puede comprobar de verdad.
    for (let semilla = 1; semilla <= 20; semilla++) {
      const plan = generateMapPlan(createRng(semilla));
      const conMina = new Set(plan.mines.map((m) => m.resource));
      for (const recurso of RESOURCE_KINDS) {
        expect(conMina.has(recurso), `la semilla ${semilla} no reparte minas de ${recurso}`).toBe(
          true,
        );
      }

      const donde = new Set(plan.mines.map((m) => `${m.resource}@${m.at.x},${m.at.y}`));
      for (const m of plan.mines) {
        const espejo = `${m.resource}@${plan.width - 1 - m.at.x},${plan.height - 1 - m.at.y}`;
        expect(
          donde.has(espejo),
          `la mina de ${m.resource} en (${m.at.x},${m.at.y}) no tiene espejo`,
        ).toBe(true);
      }
    }
  });

  it('dos minas en la misma casilla se dicen, no se pierden', () => {
    // El bloque de minas tiraba el `boolean` de `tomar()`. Con cuatro recursos
    // en una sola fila la colisión era imposible; con catorce minas por bando
    // deja de serlo, y una perdida en silencio saldría mucho después como un
    // `validateMapPlan` que no señala a nadie.
    //
    // 25×17 es el caso: con 17 de alto la fila de abajo (`height-8`) cae
    // encima de la de arriba, y con un ancho IMPAR las columnas de los dos
    // bandos coinciden en paridad. El mensaje trae el recurso y la casilla,
    // que es lo que hace falta para arreglarlo.
    expect(() => generateMapPlan(createRng(1), { width: 25, height: 17 })).toThrow(
      'no se puede colocar la mina de mercury: (12,9) ya está ocupada',
    );
  });
});

describe('calendario', () => {
  it('los lunes son los días 1, 8 y 15', () => {
    const state = newGame({ seed: 3 });
    expect(week(state)).toBe(1);
    expect(dayOfWeek(state)).toBe(1);
    state.day = 8;
    expect(week(state)).toBe(2);
    expect(dayOfWeek(state)).toBe(1);
    state.day = 9;
    expect(dayOfWeek(state)).toBe(2);
  });

  it('las moradas crecen al empezar la semana', () => {
    const state = newGame({ seed: 4 });
    const c = ctx(4);
    const town = townsOf(state, 0)[0]!;
    const morada = dwellings(town)[0];
    expect(morada).toBeDefined();
    const antes = town.available[morada!.creature] ?? 0;

    // Pasar siete días completos.
    for (let i = 0; i < 7 * state.players.length; i++) {
      applyAdventureAction(state, { type: 'end_turn' }, c, state.current);
    }
    expect(state.day).toBe(8);
    expect(town.available[morada!.creature] ?? 0).toBeGreaterThan(antes);
  });
});

describe('economía', () => {
  it('el ayuntamiento y las minas ingresan cada día', () => {
    const state = newGame({ seed: 11 });
    const c = ctx(11);
    const oroInicial = state.players[0]!.resources.gold;

    // Un turno de cada jugador devuelve la vez al primero, con su ingreso.
    for (const _ of state.players)
      applyAdventureAction(state, { type: 'end_turn' }, c, state.current);
    expect(state.players[0]!.resources.gold).toBeGreaterThan(oroInicial);
  });

  it('construir cuesta recursos y solo se puede una vez al día', () => {
    const state = newGame({ seed: 12 });
    const c = ctx(12);
    const town = townsOf(state, 0)[0]!;
    const player = currentPlayer(state);
    const oroAntes = player.resources.gold;

    applyAdventureAction(
      state,
      { type: 'build', town: town.id, building: 'knight_dwelling_2' },
      c,
      state.current,
    );
    expect(town.buildings).toContain('knight_dwelling_2');
    expect(player.resources.gold).toBeLessThan(oroAntes);

    expect(() =>
      applyAdventureAction(
        state,
        { type: 'build', town: town.id, building: 'knight_dwelling_3' },
        c,
        state.current,
      ),
    ).toThrow(/ya se ha construido hoy/);
  });

  it('reclutar descuenta oro y suma tropas al héroe que esté en el pueblo', () => {
    const state = newGame({ seed: 13 });
    const c = ctx(13);
    const town = townsOf(state, 0)[0]!;
    const hero = heroesOf(state, 0)[0]!;
    hero.at = town.at;

    const morada = dwellings(town)[0]!;
    const disponibles = town.available[morada.creature] ?? 0;
    expect(disponibles).toBeGreaterThan(0);

    const antes = hero.army.find((s) => s?.creature === morada.creature)?.count ?? 0;
    applyAdventureAction(
      state,
      { type: 'recruit', town: town.id, creature: morada.creature, count: 2 },
      c,
      state.current,
    );
    const despues = hero.army.find((s) => s?.creature === morada.creature)?.count ?? 0;
    expect(despues).toBe(antes + 2);
    expect(town.available[morada.creature]).toBe(disponibles - 2);
  });

  it('no deja reclutar más de lo disponible', () => {
    const state = newGame({ seed: 14 });
    const c = ctx(14);
    const town = townsOf(state, 0)[0]!;
    const morada = dwellings(town)[0]!;
    expect(() =>
      applyAdventureAction(
        state,
        { type: 'recruit', town: town.id, creature: morada.creature, count: 9999 },
        c,
        state.current,
      ),
    ).toThrow(/solo hay/);
  });
});

describe('movimiento de héroes', () => {
  it('ningún paso del mapa cuesta menos que ROAD_COST (#55)', () => {
    // El turno de la IA se ahorra el Dijkstra entero cuando al héroe le quedan
    // menos de `ROAD_COST` puntos, porque por debajo de eso no hay un solo
    // paso que quepa. Eso deja de ser cierto el día que alguien meta un
    // terreno más barato que el camino, o un modificador que reste — y sin
    // este test el héroe dejaría de dar su último paso EN SILENCIO.
    //
    // Se mide llamando a `stepCost` y no leyendo la tabla: el coste real pasa
    // por el camino, por el factor diagonal y por un redondeo.
    let minimo = Number.POSITIVE_INFINITY;
    for (const terreno of TERRAIN_KINDS) {
      if (!isWalkable(terreno)) continue;
      for (const conCamino of [false, true]) {
        const map = createEmptyMap(3, 3, terreno);
        if (conCamino) map.roads.add(pointKey({ x: 1, y: 1 }));
        // Ortogonal y diagonal, que es la otra mitad de la fórmula.
        for (const desde of [
          { x: 0, y: 1 },
          { x: 0, y: 0 },
        ]) {
          minimo = Math.min(minimo, stepCost(map, desde, { x: 1, y: 1 }));
        }
      }
    }
    expect(minimo).toBe(ROAD_COST);
  });

  it('gasta puntos de movimiento y descubre el mapa', () => {
    const state = newGame({ seed: 21 });
    const c = ctx(21);
    const hero = heroesOf(state, 0)[0]!;
    const puntosAntes = hero.movePoints;
    const nieblaAntes = state.players[0]!.fog.size;

    const destino = { x: hero.at.x + 2, y: hero.at.y };
    applyAdventureAction(
      state,
      { type: 'move_hero', hero: hero.id, to: destino },
      c,
      state.current,
    );

    expect(pointKey(hero.at)).toBe(pointKey(destino));
    expect(hero.movePoints).toBeLessThan(puntosAntes);
    expect(state.players[0]!.fog.size).toBeGreaterThan(nieblaAntes);
  });

  it('recoge los recursos que pisa', () => {
    const state = newGame({ seed: 22 });
    const c = ctx(22);
    const hero = heroesOf(state, 0)[0]!;
    const recurso = state.map.objects.find((o) => o.kind === 'resource' && !o.taken);
    expect(recurso).toBeDefined();

    // Teletransporte de test: interesa la recogida, no el paseo.
    hero.at = { x: recurso!.at.x - 1, y: recurso!.at.y };
    hero.movePoints = 5000;
    const camino = findPath(state.map, hero.at, recurso!.at);
    expect(camino).not.toBeNull();

    const antes = { ...state.players[0]!.resources };
    applyAdventureAction(
      state,
      { type: 'move_hero', hero: hero.id, to: recurso!.at },
      c,
      state.current,
    );
    const tipo = (recurso as { resource: keyof typeof antes }).resource;
    expect(state.players[0]!.resources[tipo]).toBeGreaterThan(antes[tipo]);
  });

  it('captura las minas que visita', () => {
    const state = newGame({ seed: 23 });
    const c = ctx(23);
    const hero = heroesOf(state, 0)[0]!;
    const mina = state.map.objects.find((o) => o.kind === 'mine' && o.owner === null);
    expect(mina).toBeDefined();

    hero.at = { x: mina!.at.x - 1, y: mina!.at.y };
    hero.movePoints = 5000;
    applyAdventureAction(
      state,
      { type: 'move_hero', hero: hero.id, to: mina!.at },
      c,
      state.current,
    );
    expect((mina as { owner: number | null }).owner).toBe(0);
  });

  it('capturar un castillo cambia el libro de cuentas Y la bandera del mapa', () => {
    // El mismo hecho vivía en dos sitios y solo se escribía uno. La IA veía el
    // castillo ENEMIGO donde tenía el suyo, y como eso vale 40000 y estaba a un
    // paso, se pasaba la partida entrando en su propia casa: dos jugadores
    // haciendo eso no se encuentran nunca y ninguno se queda sin castillos, que
    // es la única forma de perder. Era el ~10 % de partidas que no terminaban.
    const state = newGame({ seed: 23 });
    const c = ctx(23);
    const hero = heroesOf(state, 0)[0]!;
    const suyo = state.towns.find((t) => t.owner === 1)!;
    const bandera = state.map.objects.find((o) => o.kind === 'town' && o.id === suyo.id)!;
    expect((bandera as { owner: number | null }).owner).toBe(1);

    // Sin guarnición no hay batalla: lo que se mide aquí es la captura.
    suyo.garrison = [null, null, null, null, null];
    hero.at = { x: suyo.at.x - 1, y: suyo.at.y };
    hero.movePoints = 5000;
    applyAdventureAction(
      state,
      { type: 'move_hero', hero: hero.id, to: suyo.at },
      c,
      state.current,
    );

    expect(suyo.owner).toBe(0);
    expect((bandera as { owner: number | null }).owner).toBe(0);
  });

  it('no deja mover al héroe de otro jugador', () => {
    const state = newGame({ seed: 24 });
    const c = ctx(24);
    const ajeno = heroesOf(state, 1)[0]!;
    expect(() =>
      applyAdventureAction(
        state,
        { type: 'move_hero', hero: ajeno.id, to: { x: 1, y: 1 } },
        c,
        state.current,
      ),
    ).toThrow(/no es tuyo/);
  });

  it('quien dice ser el que actúa y no es el de turno se lleva un no', () => {
    // El núcleo daba por hecho que quien llama es el jugador de turno, y con un
    // `endTurn()` asíncrono en el cliente eso dejó de ser cierto. Lo que salía
    // sin este dato era «ese pueblo no es tuyo», que despista: el pueblo sí es
    // suyo, lo que no es suyo es el turno.
    const state = newGame({ seed: 25 });
    const c = ctx(25);
    const suyo = townsOf(state, 1)[0]!;
    expect(state.current).toBe(0);

    expect(() =>
      applyAdventureAction(state, { type: 'build', town: suyo.id, building: 'town_hall' }, c, 1),
    ).toThrow(/todavía no es tu turno/);
    // Y nombra a quién hay que esperar CON SU ID, el mismo que ve el agente en
    // todo lo demás: el `Player.name` que hubo era 1-based y decía «Jugador 1»
    // del jugador 0.
    expect(() => applyAdventureAction(state, { type: 'end_turn' }, c, 1)).toThrow(
      /ahora juega el jugador 0 \(knight\)/,
    );

    // El de turno sí pasa por la misma puerta.
    applyAdventureAction(state, { type: 'end_turn' }, c, 0);
    expect(state.current).toBe(1);
  });
});

describe('batallas del mapa', () => {
  it('pisar un monstruo abre una batalla y ganarla lo elimina', () => {
    const state = newGame({ seed: 31 });
    const c = ctx(31);
    const hero = heroesOf(state, 0)[0]!;

    // Ejército sobrado para que la victoria no dependa de la suerte.
    hero.army = [{ creature: 'paladin', count: 50 }, null, null, null, null];
    const monstruo = forzarBatalla(state, c, hero);
    expect(state.pendingBattle!.foe).toEqual({ kind: 'monster', objectId: monstruo.id });

    const resultado = resolvePendingBattle(state, c);
    expect(resultado.winner).toBe('attacker');
    expect((monstruo as { defeated: boolean }).defeated).toBe(true);
    expect(state.pendingBattle).toBeNull();
    expect(heroById(state, hero.id).experience).toBeGreaterThan(0);
  });

  it('perder la batalla elimina al héroe atacante', () => {
    const state = newGame({ seed: 32 });
    const c = ctx(32);
    const hero = heroesOf(state, 0)[0]!;
    const monstruo = monstruoVivo(state);

    hero.army = [{ creature: 'peasant', count: 1 }, null, null, null, null];
    // Se sustituye por un monstruo imbatible en la misma casilla.
    state.map.objects.splice(state.map.objects.indexOf(monstruo), 1, {
      kind: 'monster',
      id: monstruo.id,
      at: monstruo.at,
      creature: 'bone_dragon',
      count: 20,
      defeated: false,
    });

    forzarBatalla(state, c, hero);
    const resultado = resolvePendingBattle(state, c);
    expect(resultado.winner).toBe('defender');
    expect(state.heroes.some((h) => h.id === hero.id)).toBe(false);
    expect(state.log.some((e) => e.kind === 'hero_defeated')).toBe(true);
  });

  it('no se puede seguir jugando con una batalla pendiente', () => {
    const state = newGame({ seed: 33 });
    const c = ctx(33);
    const hero = heroesOf(state, 0)[0]!;
    forzarBatalla(state, c, hero);

    expect(() => applyAdventureAction(state, { type: 'end_turn' }, c, state.current)).toThrow(
      /batalla pendiente/,
    );
  });
});

describe('experiencia y niveles', () => {
  /**
   * Una casilla pegada al héroe, andable y sin nada encima: el sitio donde
   * plantar al defensor para que el atacante entre de un solo paso.
   *
   * Se pregunta al mapa en vez de escribir un desplazamiento a mano porque la
   * casilla de al lado puede ser agua o llevar un cofre encima, y entonces el
   * test mediría otra cosa —o reventaría— según la semilla.
   */
  const casillaVecinaLibre = (state: GameState, desde: Point): Point => {
    for (const d of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      const at = { x: desde.x + d.x, y: desde.y + d.y };
      const camino = findPath(state.map, desde, at);
      if (camino !== null && camino.length === 1 && objectAt(state.map, at) === undefined) {
        return at;
      }
    }
    throw new Error('el héroe no tiene ninguna casilla vecina libre');
  };

  it('la experiencia cuenta las criaturas muertas, no los stacks', () => {
    // La fórmula es `PV de la criatura × muertas`
    // (`Battle::Force::calculateExperienceBasedOnLosses`, `battle_army.cpp`), y
    // el campesino tiene 1 punto de vida: la cifra ES el número de campesinos.
    // Con lo que había —`hp × level × 2` por STACK, sin mirar `count`— las dos
    // batallas de abajo daban 2 y 2.
    const experienciaContra = (cuantos: number): number => {
      const state = newGame({ seed: 31 });
      const c = ctx(31);
      const hero = heroesOf(state, 0)[0]!;
      hero.army = [{ creature: 'crusader', count: 100 }, null, null, null, null];
      ponerMonstruo(state, 'peasant', cuantos);
      forzarBatalla(state, c, hero);
      expect(resolvePendingBattle(state, c).winner).toBe('attacker');
      return heroById(state, hero.id).experience;
    };

    expect(experienciaContra(100)).toBe(100);
    expect(experienciaContra(1)).toBe(1);
  });

  it('quien defiende y repele cobra las bajas del atacante más los 500', () => {
    // La otra mitad de #87, y la que más pesa desde que el agente defiende: la
    // llamada vivía dentro del `if (heroeAtacanteVivo)`, así que un héroe que
    // se pasaba la partida repeliendo asaltos no ganaba un punto.
    const state = newGame({ seed: 41 });
    const c = ctx(41);
    const atacante = heroesOf(state, 0)[0]!;
    const defensor = heroesOf(state, 1)[0]!;

    atacante.army = [{ creature: 'peasant', count: 10 }, null, null, null, null];
    atacante.movePoints = 5000;
    defensor.army = [{ creature: 'crusader', count: 60 }, null, null, null, null];
    defensor.experience = 0;
    defensor.at = casillaVecinaLibre(state, atacante.at);

    applyAdventureAction(state, { type: 'move_hero', hero: atacante.id, to: defensor.at }, c, 0);
    expect(state.pendingBattle!.foe).toEqual({ kind: 'hero', heroId: defensor.id });
    expect(resolvePendingBattle(state, c).winner).toBe('defender');

    // 10 campesinos de 1 PV, más los 500 de derrotar al héroe que los mandaba
    // (`battle_arena.cpp`). Misma fórmula que cobraría atacando: la simetría
    // también es del original.
    expect(heroById(state, defensor.id).experience).toBe(10 * 1 + 500);
    expect(state.heroes.some((h) => h.id === atacante.id)).toBe(false);
  });

  it('se suben dos niveles de golpe y se cuentan los dos, cada uno con su hecho', () => {
    const state = newGame({ seed: 31 });
    const c = ctx(31);
    const hero = heroesOf(state, 0)[0]!;
    hero.army = [{ creature: 'crusader', count: 300 }, null, null, null, null];
    // 140 piqueros de 15 PV = 2100 de experiencia de una sentada: pasa de
    // largo el umbral del nivel 2 (1000) y el del 3 (2000), y se queda corto
    // del 4 (3200).
    const monstruo = ponerMonstruo(state, 'pikeman', 140);
    forzarBatalla(state, c, hero);
    expect(resolvePendingBattle(state, c).winner).toBe('attacker');

    const vivo = heroById(state, hero.id);
    expect(vivo.experience).toBe(2100);
    expect(vivo.level).toBe(3);

    const subidas = state.log.filter((e) => e.kind === 'level_up');
    expect(subidas.map((e) => e.level)).toEqual([2, 3]);
    // Con protagonista y sitio, como cualquier otro hecho: sin ellos el evento
    // nace anónimo y `visibleTo` no sabría a quién le consta.
    expect(subidas.map((e) => e.actor)).toEqual([0, 0]);
    expect(subidas.map((e) => e.at)).toEqual([monstruo.at, monstruo.at]);
    // Y sellado por `emit`: el dueño estaba mirando su propia batalla.
    expect(subidas.every((e) => e.seen.includes(0))).toBe(true);
  });

  it('la curva de niveles es la tabla de fheroes2, comprobada contra su propia regla', () => {
    // `Heroes::GetExperienceFromLevel` (`heroes.cpp:1512-1601`), desplazada un
    // peldaño: el umbral del nivel `n` es `GetExperienceFromLevel(n-1)`.
    //
    // Este test se reescribió entero después de que QA cazara que la tabla que
    // decía venir de allí era inventada —coincidía en 8 de 39 filas— y que la
    // versión anterior de este test **anclaba las cifras inventadas**, o sea que
    // el guardia protegía el error. Ahora comprueba tres cosas distintas y solo
    // la segunda depende de que alguien haya tecleado bien.

    // 1 · Los umbrales que una partida puede alcanzar de verdad. Son los únicos
    //     que mueven el juego, y son los que erraba la curva `1,4^(n-2)`: decía
    //     1400 y 2744 donde la tabla dice 2000 y 4500.
    expect(experienceForLevel(1)).toBe(0);
    expect([2, 3, 4, 5, 6].map(experienceForLevel)).toEqual([1000, 2000, 3200, 4500, 6000]);

    // 2 · Las filas donde la tabla inventada se separaba de la de verdad. Si
    //     vuelve a colarse una curva suavizada a mano, cae aquí.
    expect(experienceForLevel(7)).toBe(7700); // la inventada decía 7500
    expect(experienceForLevel(10)).toBe(13200); // decía 13000
    expect(experienceForLevel(39)).toBe(2492100); // decía 88000
    expect(experienceForLevel(40)).toBe(2990600); // decía 91000

    // 3 · La comprobación que NO depende de lo que nadie haya tecleado: de la
    //     fila 19 en adelante la tabla obedece la regla que el propio original
    //     publica dos líneas más abajo —cada diferencia es la anterior por 1,2,
    //     redondeada a centenas—, y la extrapolación de más allá de la fila 39
    //     es esa misma regla. Son 26 filas contra un criterio que este test no
    //     elige, y es exactamente lo que habría cazado la cola inventada, que
    //     sumaba 3000 constantes.
    for (let nivel = 20; nivel <= 45; nivel++) {
      const anterior = experienceForLevel(nivel - 1) - experienceForLevel(nivel - 2);
      expect(
        experienceForLevel(nivel) - experienceForLevel(nivel - 1),
        `la fila ${nivel - 1} no sigue la regla ×1,2 del original`,
      ).toBe(Math.round((anterior * 1.2) / 100) * 100);
    }

    expect(levelFromExperience(0)).toBe(1);
    expect(levelFromExperience(999)).toBe(1);
    expect(levelFromExperience(1000)).toBe(2);
    expect(levelFromExperience(4499)).toBe(4);
    expect(levelFromExperience(4500)).toBe(5);
    // Pasada la fila 39 la curva sigue creciendo, que es lo que hace que el
    // `while` de `levelFromExperience` termine en vez de dar vueltas.
    expect(levelFromExperience(10_000_000)).toBeGreaterThan(40);
  });
});

describe('IA de respaldo', () => {
  it('planifica construir y reclutar en el primer turno', () => {
    const state = newGame({ seed: 41 });
    expect(planBuildings(state, 0).some((a) => a.type === 'build')).toBe(true);
    expect(planRecruits(state, 0).some((a) => a.type === 'recruit')).toBe(true);
  });

  it('quien se ha quedado sin héroe reserva lo que cuesta el siguiente', () => {
    // La avería, que es anterior a cuadrar la economía: `planRecruits` gastaba
    // el monedero ENTERO y `planHires` exige 2500, así que el jugador que
    // perdía su héroe no compraba otro nunca. Se quedaba con su castillo y
    // ~25 de oro sosteniendo un empate hasta el día 300.
    const state = newGame({ seed: 41 });
    const player = state.players.find((p) => p.id === 0)!;
    state.heroes = state.heroes.filter((h) => h.owner !== 0);
    player.resources = { ...player.resources, gold: HERO_HIRE_COST + 400 };
    // Con la morada llena, quien manda es el oro: sin la reserva, el
    // reclutamiento se lo lleva hasta el último. Con la docena de campesinos
    // que hay el día 1 este test pasaría sin reserva y no guardaría nada.
    const town = townsOf(state, 0)[0]!;
    for (const id of Object.keys(town.available)) town.available[id] = 500;

    const reclutas = planRecruits(state, 0);
    expect(reclutas.some((a) => a.type === 'recruit')).toBe(true); // no se queda parado
    for (const accion of reclutas) applyAdventureAction(state, accion, ctx(41), 0);

    expect(player.resources.gold).toBeGreaterThanOrEqual(HERO_HIRE_COST);
    expect(planHires(state, 0).some((a) => a.type === 'hire_hero')).toBe(true);
  });

  it('con un héroe vivo no se reserva nada: el oro es para el ejército', () => {
    // La otra cara, que es lo que hace de la reserva un arreglo y no un
    // impuesto: reservar 2500 todos los días dejaría al ejército corto para
    // siempre. Las dos partidas salen de la misma semilla y solo se
    // diferencian en si al jugador le queda un héroe; con la morada llena de
    // criaturas, lo que manda es el oro.
    const cuenta = (acciones: readonly AdventureAction[]): number =>
      acciones.reduce((n, a) => (a.type === 'recruit' ? n + a.count : n), 0);
    const montar = (conHeroe: boolean) => {
      const state = newGame({ seed: 41 });
      const player = state.players.find((p) => p.id === 0)!;
      player.resources = { ...player.resources, gold: HERO_HIRE_COST + 400 };
      const town = townsOf(state, 0)[0]!;
      for (const id of Object.keys(town.available)) town.available[id] = 500;
      if (!conHeroe) state.heroes = state.heroes.filter((h) => h.owner !== 0);
      return cuenta(planRecruits(state, 0));
    };

    expect(montar(true)).toBeGreaterThan(montar(false));
  });

  it('valora más un ejército mayor', () => {
    const debil = [{ creature: 'peasant', count: 10 }, null, null, null, null];
    const fuerte = [{ creature: 'paladin', count: 10 }, null, null, null, null];
    expect(armyPower(fuerte)).toBeGreaterThan(armyPower(debil));
  });

  it('no manda al héroe contra un monstruo que le supera', () => {
    const state = newGame({ seed: 42 });
    const hero = heroesOf(state, 0)[0]!;
    hero.army = [{ creature: 'peasant', count: 1 }, null, null, null, null];
    hero.movePoints = 99999;

    // Se vacía el mapa y se deja un único objetivo: un monstruo descomunal
    // pegado al héroe. Si la IA lo elige, es que no mide sus fuerzas.
    state.map.objects.length = 0;
    state.map.objects.push({
      kind: 'monster',
      id: 'coloso',
      at: { x: hero.at.x + 1, y: hero.at.y },
      creature: 'bone_dragon',
      count: 30,
      defeated: false,
    });
    const alcance = reachableFrom(state.map, hero.at);
    expect(chooseHeroDestination(state, hero, alcance)).toBeNull();
  });

  it('retroceder por los predecesores da el mismo paso que relanzar findPath (#55)', () => {
    // El segundo recorrido del mapa era `stepTowards` relanzando un Dijkstra
    // desde el mismo origen del que venía `chooseHeroDestination`. Aquí está
    // escrito lo que hacía ANTES, y se compara paso a paso: si retroceder por
    // `prev` divergiera en un solo par, la IA elegiría otra casilla y la
    // partida entera cambiaría.
    const state = newGame({ seed: 5 });
    const hero = heroesOf(state, 0)[0]!;

    /** `stepTowards` de antes: un `findPath` nuevo y el bucle hacia delante. */
    const comoAntes = (desde: Point, destino: Point, puntos: number): Point | null => {
      const camino = findPath(state.map, desde, destino);
      if (camino === null || camino.length === 0) return null;
      let ultimo: Point | null = null;
      for (const paso of camino) {
        if (paso.cost > puntos) break;
        ultimo = paso.at;
      }
      return ultimo;
    };

    // Los destinos son objetos del mapa a propósito: minas, pueblos y
    // monstruos BLOQUEAN el paso y solo valen como final de trayecto, que es
    // justo donde los dos algoritmos podrían separarse — y es el caso normal
    // de la IA, que va casi siempre a por uno de ellos.
    const destinos = state.map.objects.slice(0, 10).map((o) => o.at);
    expect(destinos).toHaveLength(10);

    // Un solo Dijkstra para los veinte pares, y no uno dentro del doble bucle:
    // no depende del destino ni de los puntos de movimiento —solo del mapa y
    // del origen, que no se mueven— y era la ironía justo en el test que prueba
    // que la IA dejó de lanzarlo dos veces.
    const alcance = reachableFrom(state.map, hero.at);

    let alcanzados = 0;
    let intermedios = 0;
    for (const destino of destinos) {
      for (const puntos of [180, 1500]) {
        hero.movePoints = puntos;
        const ahora = stepTowards(hero, destino, alcance);
        const antes = comoAntes(hero.at, destino, puntos);
        expect(ahora, `destino (${destino.x},${destino.y}) con ${puntos} puntos`).toEqual(antes);
        if (ahora === null) continue;
        if (pointKey(ahora) === pointKey(destino)) alcanzados++;
        else intermedios++;
      }
    }

    // Sin esto los 20 pares pasarían con un `return null` a secas. Y hacen
    // falta los dos: llegar al destino no ejercita el retroceso, y quedarse a
    // medias no ejercita que el destino bloqueado se asiente.
    expect(alcanzados).toBeGreaterThan(0);
    expect(intermedios).toBeGreaterThan(0);
  });

  it('el camino sacado del alcance es el mismo que relanzar findPath (#65)', () => {
    // Gemelo del de arriba, un piso más abajo: allí se compara el PASO que da
    // la IA, aquí el CAMINO entero que recorre la puerta. Los dos Dijkstra
    // discrepan en las bloqueadas —`findPath` no las empuja salvo que sean el
    // destino, `reachableFrom` las empuja y no las expande—, así que sus
    // números de orden no coinciden; si eso moviera un solo camino, se ve aquí
    // antes que en el banco.
    const state = newGame({ seed: 5 });
    const hero = heroesOf(state, 0)[0]!;
    const alcance = reachableFrom(state.map, hero.at);

    const destinos = state.map.objects.slice(0, 10).map((o) => o.at);
    expect(destinos).toHaveLength(10);

    let bloqueados = 0;
    let conCamino = 0;
    for (const destino of destinos) {
      const objeto = objectAt(state.map, destino);
      if (objeto !== undefined && blocksMovement(objeto)) bloqueados++;
      const ahora = pathFromReachable(state.map, alcance, hero.at, destino);
      expect(ahora, `destino (${destino.x},${destino.y})`).toEqual(
        findPath(state.map, hero.at, destino),
      );
      if (ahora !== null && ahora.length > 0) conCamino++;
    }

    // Sin estas dos cuentas los diez destinos pasarían con un `return null` a
    // secas: hace falta que alguno tenga camino y que alguno esté bloqueado,
    // que es justo donde los dos algoritmos podrían separarse.
    expect(bloqueados).toBeGreaterThan(0);
    expect(conCamino).toBeGreaterThan(0);

    // Y los tres casos que no son un camino, también uno a uno: ya está allí,
    // el destino fuera del mapa, y —el que no se deduce del alcance— el ORIGEN
    // fuera del mapa.
    const fuera = { x: -1, y: -1 };
    expect(pathFromReachable(state.map, alcance, hero.at, hero.at)).toEqual([]);
    expect(pathFromReachable(state.map, alcance, hero.at, fuera)).toBeNull();

    // Un destino que el alcance SÍ conoce, para que solo la guardia de
    // `inBounds(from)` pueda decidir: sin ella, esto retrocedería por un árbol
    // de predecesores que no es el suyo y acabaría LANZANDO, que no es lo mismo
    // que decir que no hay camino.
    const [clave] = [...alcance.costs.entries()].filter(([, c]) => c > 0)[0] as [string, number];
    const [dx, dy] = clave.split(',').map(Number);
    const dentro = { x: dx as number, y: dy as number };
    expect(pathFromReachable(state.map, alcance, fuera, dentro)).toBeNull();
    expect(findPath(state.map, fuera, dentro)).toBeNull();

    // Y lanzar el Dijkstra DESDE fuera del mapa se dice. Es lo único observable
    // que cambió con el índice plano (#75): antes «funcionaba» —asentaba el
    // origen de fuera y sus vecinos de dentro— porque una clave `"x,y"` admite
    // cualquier cosa, no porque nadie lo hubiera decidido. `terrainAt` lleva
    // desde siempre lanzando lo mismo para la misma casilla.
    expect(() => reachableFrom(state.map, fuera)).toThrow('(-1,-1) está fuera del mapa');
  });

  it('mover con la pista deja la partida igual que sin ella (#65)', () => {
    // La equivalencia de arriba es del camino; esta es de la PUERTA: mismo
    // sitio, mismos puntos gastados y misma crónica, hecho a hecho.
    const destinoDe = (state: GameState): Point => {
      const hero = heroesOf(state, 0)[0]!;
      const alcance = reachableFrom(state.map, hero.at);
      return stepTowards(
        hero,
        chooseHeroDestination(state, hero, alcance) as Point,
        alcance,
      ) as Point;
    };

    const sinPista = newGame({ seed: 5 });
    const conPista = newGame({ seed: 5 });
    const destino = destinoDe(sinPista);
    expect(destino).not.toBeNull();

    applyAdventureAction(
      sinPista,
      { type: 'move_hero', hero: heroesOf(sinPista, 0)[0]!.id, to: destino },
      ctx(5),
      0,
    );
    const heroe = heroesOf(conPista, 0)[0]!;
    applyAdventureAction(
      conPista,
      { type: 'move_hero', hero: heroe.id, to: destino },
      ctx(5),
      0,
      reachableFrom(conPista.map, heroe.at),
    );

    expect(heroesOf(conPista, 0)[0]!.at).toEqual(heroesOf(sinPista, 0)[0]!.at);
    expect(heroesOf(conPista, 0)[0]!.movePoints).toBe(heroesOf(sinPista, 0)[0]!.movePoints);
    expect(conPista.log).toEqual(sinPista.log);
  });

  it('una pista de otro origen lanza en vez de mover al héroe (#65)', () => {
    // Lo único que el llamante puede equivocar es DE DÓNDE sale el alcance:
    // reutilizar el de antes de moverse daría un camino que no empieza donde
    // está el héroe. Con `costs` mudo eso se colaría, porque el destino sigue
    // teniendo coste — solo que desde otro sitio.
    const state = newGame({ seed: 5 });
    const hero = heroesOf(state, 0)[0]!;
    const antes = { ...hero.at };
    const puntos = hero.movePoints;

    const alcance = reachableFrom(state.map, hero.at);
    const destino = stepTowards(
      hero,
      chooseHeroDestination(state, hero, alcance) as Point,
      alcance,
    ) as Point;

    // Un alcance del vecino de al lado: el destino sigue asentado, así que solo
    // la comprobación de origen puede cazarlo.
    const otroOrigen = [...alcance.costs.entries()]
      .filter(([, coste]) => coste > 0)
      .sort((a, b) => a[1] - b[1])[0]![0];
    const [x, y] = otroOrigen.split(',').map(Number);
    const impostor = reachableFrom(state.map, { x: x as number, y: y as number });
    expect(impostor.costs.get(pointKey(destino))).toBeDefined();

    expect(() =>
      applyAdventureAction(
        state,
        { type: 'move_hero', hero: hero.id, to: destino },
        ctx(5),
        0,
        impostor,
      ),
    ).toThrow('no sale de donde está');
    expect(hero.at).toEqual(antes);
    expect(hero.movePoints).toBe(puntos);
  });

  it('no se mueve a donde no le llega, ni cuando ya está allí', () => {
    const state = newGame({ seed: 5 });
    const hero = heroesOf(state, 0)[0]!;
    const alcance = reachableFrom(state.map, hero.at);

    // Ya está allí: coste 0, y moverse a la propia casilla no es un paso.
    expect(stepTowards(hero, hero.at, alcance)).toBeNull();

    // Fuera del mapa: `reachableFrom` no lo asienta, así que no hay a dónde ir.
    expect(stepTowards(hero, { x: -1, y: -1 }, alcance)).toBeNull();

    // Sin puntos de movimiento no da ni para el primer paso, esté donde esté
    // el destino. Con el bucle hacia delante esto era «ningún paso cabe»; con
    // los predecesores es «se retrocedió hasta el origen».
    const lejos = state.map.objects.find((o) => pointKey(o.at) !== pointKey(hero.at))!.at;
    hero.movePoints = 0;
    expect(stepTowards(hero, lejos, alcance)).toBeNull();
  });

  it('juega un turno completo sin romperse', async () => {
    const state = newGame({ seed: 43 });
    const c = ctx(43);
    const antes = state.current;
    await playAiTurn(state, c);
    expect(state.current).not.toBe(antes);
    expect(state.pendingBattle).toBeNull();
  });
});

describe('partida completa', () => {
  // La semilla cambió de 1234 a 1235 con la cadena de moradas de #13, y NO
  // porque hiciera falta hasta que pasara: con la cadena, los dos bandos suben
  // de nivel al mismo ritmo, y una partida entre dos héroes igualados no
  // termina nunca — `chooseHeroDestination` exige un 1,05 de ventaja para
  // atacar, así que se esquivan hasta el día 1500. Ese empate eterno ya existía
  // antes del cambio y con la misma frecuencia (medido a 40 semillas: 5 de 40
  // no terminaban antes, 4 de 40 después); lo único que cambió es qué semillas
  // caen en él. La 1234 pasó a estar entre ellas.
  it('termina con un ganador jugando IA contra IA', async () => {
    const state = newGame({ seed: 1235 });
    const c = ctx(1235);
    await playAiGame(state, c, 300);

    expect(state.finished).not.toBeNull();
    const ganador = state.finished!.winner;
    const perdedores = state.players.filter((p) => p.id !== ganador);
    expect(perdedores.every((p) => p.defeated)).toBe(true);
    // `toMatchObject` y no `toEqual`: desde que el evento lleva protagonista y
    // sitio, comparar el objeto ENTERO ataría este test a los campos de
    // contabilidad de la crónica. Lo que se afirma aquí es cómo termina la
    // partida, no cómo se sella un evento.
    expect(state.log.at(-1)).toMatchObject({ kind: 'game_over', actor: ganador });
  });

  it('el bucle completo pasa por construir, reclutar, luchar y capturar', async () => {
    const state = newGame({ seed: 4321 });
    const c = ctx(4321);
    await playAiGame(state, c, 300);

    const tipos = new Set(state.log.map((e) => e.kind));
    expect(tipos.has('built')).toBe(true);
    expect(tipos.has('recruited')).toBe(true);
    expect(tipos.has('battle_started')).toBe(true);
    expect(tipos.has('hero_moved')).toBe(true);
    expect(tipos.has('game_over')).toBe(true);
  });

  it('en una partida entera, ninguna bandera se separa de su libro de cuentas', async () => {
    // El guardia del bug de arriba, pero por el camino real y con capturas de
    // verdad: basta una que no escriba las dos caras para que diverjan y no
    // vuelvan a coincidir nunca.
    const state = newGame({ seed: 9 });
    await playAiGame(state, ctx(9), 300);
    expect(state.log.some((e) => e.kind === 'town_captured')).toBe(true);

    for (const town of state.towns) {
      const bandera = state.map.objects.find((o) => o.kind === 'town' && o.id === town.id);
      expect(bandera, `${town.id} no tiene objeto en el mapa`).toBeDefined();
      expect((bandera as { owner: number | null }).owner, `${town.id} descuadrado`).toBe(
        town.owner,
      );
    }
    // Y la semilla 9 era una de las dos que no terminaban en 300 días.
    expect(state.finished).not.toBeNull();
  });

  it('es determinista: misma semilla, misma partida', async () => {
    const jugar = async (semilla: number): Promise<string> => {
      const state = newGame({ seed: semilla });
      await playAiGame(state, ctx(semilla), 300);
      return JSON.stringify(state.log);
    };
    expect(await jugar(555)).toBe(await jugar(555));
  });
});

describe('catálogo de edificios por facción', () => {
  const bolsaInfinita: Resources = {
    wood: 9999,
    mercury: 9999,
    ore: 9999,
    sulfur: 9999,
    crystal: 9999,
    gems: 9999,
    gold: 999999,
  };

  const pueblo = (faction: 'knight' | 'necromancer'): Town =>
    createTown(`t-${faction}`, 'Prueba', faction, { x: 0, y: 0 }, 0);

  /** Levanta la lista entera, uno por día, y devuelve los días gastados. */
  const levantar = (town: Town, ids: string[]): number => {
    let dias = 0;
    for (const id of ids) {
      town.builtToday = false;
      dias += 1;
      build(town, id, bolsaInfinita);
    }
    return dias;
  };

  // ------------------------------------------- el coste sale de fheroes2 (#66)

  it('las cuatro filas donde muerde el original valen lo que valen allí', () => {
    // Las cuatro que separan «coste copiado» de «coste inventado». Fuente:
    // `_buildingStats` de `buildinginfo.cpp` (ihhub/fheroes2), filas Race::KNGT
    // y Race::NECR sobre `Cost {gold, wood, mercury, ore, sulfur, crystal,
    // gems}`. Antes eran 10w+10o+5cr, 20w+20o+10ge, 20o+5ge y 30o+15ge: más
    // materia prima de la que el mapa reparte en toda la partida, y por eso
    // `dwelling_5` se construía en 0 de 200 semillas.
    expect(building('knight_dwelling_5').cost).toEqual({ gold: 3000, wood: 20 });
    expect(building('knight_dwelling_6').cost).toEqual({ gold: 5000, wood: 20, crystal: 20 });
    expect(building('necromancer_dwelling_5').cost).toEqual({ gold: 4000, wood: 10, sulfur: 10 });
    expect(building('necromancer_dwelling_6').cost).toEqual({
      gold: 10000,
      wood: 10,
      ore: 10,
      crystal: 5,
      gems: 5,
      mercury: 5,
      sulfur: 5,
    });
  });

  it('ninguna morada de nivel 1 a 4 pide un recurso raro, en ninguna facción', () => {
    // Regla del original y no cuatro filas sueltas: allí el mercurio, el
    // azufre, el cristal y las gemas no aparecen hasta el nivel 5. Aquí el
    // cristal mordía en la morada 5 del caballero y las gemas en la 5 del
    // nigromante, que son los dos recursos que el generador tardaba más en
    // repartir. Si mañana alguien vuelve a escribir un raro en la mitad baja de
    // la cadena, salta esto.
    const RAROS = ['mercury', 'sulfur', 'crystal', 'gems'] as const;
    for (const faction of ['knight', 'necromancer'] as const) {
      for (const b of buildingsOfFaction(faction)) {
        if (b.dwellingLevel === undefined || b.dwellingLevel > 4) continue;
        for (const raro of RAROS) {
          expect(b.cost[raro] ?? 0, `${b.id} pide ${raro} y es de nivel ${b.dwellingLevel}`).toBe(
            0,
          );
        }
      }
    }
  });

  it('el dragón óseo se paga: seis materiales, y sin azufre se dice cuál falta', () => {
    // La fila más cara del catálogo y la única que pide los seis materiales a
    // la vez, así que es la que solo se desbloquea con las dos mitades del
    // ciclo puestas: el coste de fheroes2 Y minas de azufre, mercurio y gemas
    // en el mapa. Aquí se comprueba la mitad del coste; la del mapa, en
    // «el generador reparte minas de los siete recursos».
    const cripta = pueblo('necromancer');
    levantar(cripta, [
      'necromancer_dwelling_2',
      'necromancer_dwelling_3',
      'necromancer_dwelling_4',
      'necromancer_dwelling_5',
      'castle',
    ]);

    const justo: Resources = { ...building('necromancer_dwelling_6').cost } as Resources;
    const bolsa: Resources = {
      wood: 0,
      mercury: 0,
      ore: 0,
      sulfur: 0,
      crystal: 0,
      gems: 0,
      gold: 0,
    };
    const exacta = { ...bolsa, ...justo };

    cripta.builtToday = false;
    expect(build(cripta, 'necromancer_dwelling_6', exacta)).toEqual(bolsa);
    expect(cripta.available.bone_dragon).toBeGreaterThan(0);

    // Y con la misma bolsa menos el azufre, el motivo se escribe para la
    // persona en vez de dejar el botón muerto sin decir por qué.
    const otra = pueblo('necromancer');
    levantar(otra, [
      'necromancer_dwelling_2',
      'necromancer_dwelling_3',
      'necromancer_dwelling_4',
      'necromancer_dwelling_5',
      'castle',
    ]);
    otra.builtToday = false;
    expect(buildBlocker(otra, 'necromancer_dwelling_6', { ...exacta, sulfur: 0 })).toBe(
      'recursos insuficientes',
    );
  });

  // ------------------------------------------------------------------- #46

  it('el nigromante no puede comprar la mejora de nivel 6: no existe', () => {
    const cripta = pueblo('necromancer');
    levantar(cripta, [
      'necromancer_dwelling_2',
      'necromancer_dwelling_3',
      'necromancer_dwelling_4',
      'necromancer_dwelling_5',
      'castle',
      'necromancer_dwelling_6',
    ]);
    expect(cripta.available.bone_dragon).toBeGreaterThan(0);

    // El motivo se escribe para la persona, y `null` sería "adelante, cobra".
    expect(buildBlocker(cripta, 'necromancer_upgrade_6', bolsaInfinita)).toMatch(/no existe/);
    // Y el id del caballero tampoco cuela en un pueblo nigromante.
    expect(buildBlocker(cripta, 'knight_upgrade_6', bolsaInfinita)).toMatch(
      /no es un edificio de esta facción/,
    );
  });

  it('intentarlo lanza y no cuesta ni oro ni la construcción del día', () => {
    const cripta = pueblo('necromancer');
    cripta.builtToday = false;
    const bolsa = { ...bolsaInfinita };

    expect(() => build(cripta, 'necromancer_upgrade_6', bolsa)).toThrow(/no se puede construir/);
    expect(cripta.builtToday).toBe(false);
    expect(bolsa.gold).toBe(bolsaInfinita.gold);
    expect(bolsa.gems).toBe(bolsaInfinita.gems);
  });

  it('el caballero conserva su mejora de nivel 6: paladines a cruzados', () => {
    const castillo = pueblo('knight');
    levantar(castillo, [
      'knight_dwelling_2',
      'knight_dwelling_3',
      'knight_dwelling_4',
      'knight_dwelling_5',
      'castle',
      'knight_dwelling_6',
    ]);
    expect(castillo.available.paladin).toBeGreaterThan(0);

    castillo.builtToday = false;
    build(castillo, 'knight_upgrade_6', bolsaInfinita);
    expect(castillo.available.paladin).toBeUndefined();
    expect(castillo.available.crusader).toBeGreaterThan(0);
  });

  it('ninguna mejora del catálogo apunta a un nivel sin criatura mejorada', () => {
    // Esto es lo que hace que #46 sea una REGLA y no un caso del dragón óseo:
    // si mañana alguien escribe la fila de una mejora imposible, salta aquí.
    for (const faction of ['knight', 'necromancer'] as const) {
      const linea = factionLineup(faction);
      for (const b of buildingsOfFaction(faction)) {
        if (b.upgradesLevel === undefined) continue;
        const base = linea.find((c) => c.level === b.upgradesLevel);
        expect(
          base,
          `${b.id}: la facción no tiene criatura de nivel ${b.upgradesLevel}`,
        ).toBeDefined();
        expect(
          base?.upgradesTo,
          `${b.id} mejora un nivel cuya criatura (${base?.id}) no tiene versión mejorada`,
        ).toBeDefined();
      }
    }
  });

  // ------------------------------------------------------------------- #13

  it('la morada de nivel 6 no se levanta el día 1 en ninguna facción', () => {
    for (const faction of ['knight', 'necromancer'] as const) {
      const t = pueblo(faction);
      const motivo = buildBlocker(t, `${faction}_dwelling_6`, bolsaInfinita);
      expect(motivo, `${faction} pudo saltar a la morada 6`).not.toBeNull();
      expect(motivo).toMatch(/falta construir/);
    }
  });

  it('un pueblo recién fundado ya es jugable: su morada de nivel 1 cría', () => {
    for (const faction of ['knight', 'necromancer'] as const) {
      const t = pueblo(faction);
      expect(t.buildings).toContain(`${faction}_dwelling_1`);
      applyWeeklyGrowth(t);
      const moradas = dwellings(t);
      expect(moradas.length).toBe(1);
      expect(t.available[moradas[0]!.creature] ?? 0).toBeGreaterThan(0);
    }
  });

  it('la morada de nivel 6 cuesta seis días de obra en las dos facciones', () => {
    // Uno por día, porque solo se construye un edificio diario. Si la cadena
    // del JSON cambia, este número cambia CON ella, no al revés.
    for (const faction of ['knight', 'necromancer'] as const) {
      const t = pueblo(faction);
      const dias = levantar(t, [
        `${faction}_dwelling_2`,
        `${faction}_dwelling_3`,
        `${faction}_dwelling_4`,
        `${faction}_dwelling_5`,
        'castle',
        `${faction}_dwelling_6`,
      ]);
      expect(dias, `${faction}`).toBe(6);
      expect(dwellings(t).map((d) => d.level)).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it('cada pueblo solo ve su propio catálogo', () => {
    const castillo = pueblo('knight');
    const cripta = pueblo('necromancer');
    expect(availableBuildings(castillo, bolsaInfinita)).toContain('knight_dwelling_2');
    expect(availableBuildings(castillo, bolsaInfinita)).not.toContain('necromancer_dwelling_2');
    expect(availableBuildings(cripta, bolsaInfinita)).toContain('necromancer_dwelling_2');
    expect(availableBuildings(cripta, bolsaInfinita)).not.toContain('knight_dwelling_2');
  });

  it('la IA levanta el castillo cuando es lo único que le separa del nivel 6', () => {
    // Sin la prioridad 95 elegiría el gremio o el mercado y se quedaría
    // atascada para siempre a las puertas de su mejor criatura.
    const castillo = pueblo('knight');
    levantar(castillo, [
      'knight_dwelling_2',
      'knight_dwelling_3',
      'knight_dwelling_4',
      'knight_dwelling_5',
    ]);
    castillo.builtToday = false;
    expect(chooseBuilding(castillo, bolsaInfinita)).toBe('castle');
  });

  // --------------------------------------- el orden de construcción es la lista

  it('la lista de construcción coloca cada edificio de la facción exactamente una vez', () => {
    // Es el precio de haber cambiado la cascada de constantes por una lista, y
    // el argumento de fondo para preferirla: con seis `if` encadenados, el
    // edificio que llegue mañana cae por el `return 10` del final y nadie se
    // entera; con una lista hay que colocarlo, y si no está `chooseBuilding`
    // lanza. Este test es lo que hace que ese `throw` no se alcance nunca.
    for (const faction of ['knight', 'necromancer'] as const) {
      const orden = ordenDeConstruccion(faction);
      const catalogo = buildingsOfFaction(faction).map((b) => b.id);
      expect([...orden].sort()).toEqual([...catalogo].sort());
      expect(new Set(orden).size, `${faction}: hay un edificio repetido`).toBe(orden.length);
    }
  });

  it('el nigromante levanta el gremio antes que su morada de nivel 4; el caballero no', () => {
    // El único cambio de #88, y su asimetría es del original
    // (`ai_planner_castle.cpp`): para NECR el gremio va por delante de la
    // morada y la mejora de nivel 4; para KNGT, detrás de todo lo militar.
    // Dársela a los dos a la vez está medido y deja 1 de 200 partidas sin
    // terminar: dos ejércitos que crecen a la par no se matan nunca.
    const necro = pueblo('necromancer');
    levantar(necro, ['necromancer_dwelling_2', 'necromancer_dwelling_3']);
    necro.builtToday = false;
    expect(chooseBuilding(necro, bolsaInfinita)).toBe('mage_guild_1');

    const caballero = pueblo('knight');
    levantar(caballero, ['knight_dwelling_2', 'knight_dwelling_3']);
    caballero.builtToday = false;
    expect(chooseBuilding(caballero, bolsaInfinita)).toBe('knight_dwelling_4');

    const ordenKnight = ordenDeConstruccion('knight');
    expect(ordenKnight.indexOf('mage_guild_1')).toBeGreaterThan(
      ordenKnight.indexOf('knight_upgrade_2'),
    );
  });
});

describe('el gremio enseña (#2)', () => {
  it('el gremio se construye jugando, y acaba en un hechizo aprendido', async () => {
    // El criterio que de verdad cierra #88: un gremio construido que no acaba
    // en un héroe que aprende algo no cierra nada. Antes de mover el gremio en
    // la lista del nigromante, `mage_guild_1` salía en 10 de las 200 semillas
    // del banco y `syncSpellbooks` enseñaba 15 hechizos en 3 partidas; ahora,
    // 206 gremios en 200 de 200 y 965 hechizos en 177. Aquí se juegan cinco
    // semillas, que es lo que cabe en un test de milisegundos.
    let gremios = 0;
    let aprendidos = 0;
    for (let semilla = 1; semilla <= 5; semilla++) {
      const state = newGame({ seed: semilla });
      await playAiGame(state, { rng: createRng(semilla) }, 300);
      for (const e of state.log) {
        if (e.kind === 'built' && e.building === 'mage_guild_1') gremios++;
        if (e.kind === 'spells_learned') aprendidos += e.spells.length;
      }
    }
    expect(gremios).toBeGreaterThan(0);
    expect(aprendidos).toBeGreaterThan(0);
  });

  it('un héroe dentro de su castillo aprende lo que enseña el gremio, y repetir no duplica', () => {
    const state = newGame({ seed: 51 });
    const c = ctx(51);
    const hero = heroesOf(state, 0)[0]!;
    const town = townsOf(state, 0)[0]!;
    // Teletransporte de test: interesa el aprendizaje, no el paseo hasta allí.
    hero.at = { ...town.at };
    expect(hero.spells).toEqual(['magic_arrow']);

    applyAdventureAction(
      state,
      { type: 'build', town: town.id, building: 'mage_guild_1' },
      c,
      state.current,
    );

    // El gremio de nivel 1 enseña los tres de nivel 1, y `magic_arrow` es uno de
    // ellos: el que ya sabía no se le apunta dos veces.
    expect(hero.spells).toContain('haste');
    expect(hero.spells).toContain('slow');
    expect(new Set(hero.spells).size).toBe(hero.spells.length);
    expect(state.log.some((e) => e.kind === 'spells_learned' && e.hero === hero.id)).toBe(true);

    // Sigue allí un día más: la sincronía vuelve a pasar y no añade nada.
    const libro = [...hero.spells];
    applyAdventureAction(state, { type: 'end_turn' }, c, state.current);
    expect(hero.spells).toEqual(libro);
  });

  it('la puerta de Sabiduría recorta lo que se aprende', () => {
    // Los dos de nivel 3 existen en el catálogo y hoy no hay gremio que los
    // ofrezca, así que esta es la prueba de que `maxSpellLevel()` se lee: sin
    // Sabiduría quedan fuera, con Sabiduría entran.
    const oferta = allSpells();
    const sinSabiduria = learnable({ spells: [], skills: {} }, oferta);
    expect(sinSabiduria).toContain('bless');
    expect(sinSabiduria).not.toContain('lightning_bolt');
    expect(sinSabiduria).not.toContain('cure');

    const conSabiduria = learnable({ spells: [], skills: { wisdom: 1 } }, oferta);
    expect(conSabiduria).toContain('lightning_bolt');
    expect(conSabiduria).toContain('cure');

    // Y lo que ya se sabe no vuelve a ofrecerse.
    expect(learnable({ spells: ['haste'], skills: {} }, oferta)).not.toContain('haste');
  });

  it('lo que enseña un pueblo lo determina el nivel de su gremio', () => {
    const castillo = createTown('t-magia', 'Prueba', 'knight', { x: 0, y: 0 }, 0);
    expect(townSpells(castillo)).toEqual([]);

    castillo.buildings = [...castillo.buildings, 'mage_guild_1'];
    expect(
      townSpells(castillo)
        .map((s) => s.id)
        .sort(),
    ).toEqual(['haste', 'magic_arrow', 'slow']);

    castillo.buildings = [...castillo.buildings, 'mage_guild_2'];
    const nivel2 = townSpells(castillo).map((s) => s.id);
    expect(nivel2).toContain('bless');
    expect(nivel2).toContain('curse');
    // No hay `mage_guild_3`, así que los de nivel 3 no los ofrece nadie.
    expect(nivel2).not.toContain('lightning_bolt');
  });

  it('un héroe recién contratado deja de estar condenado a no lanzar nada', () => {
    const state = newGame({ seed: 52 });
    const c = ctx(52);
    const town = townsOf(state, 0)[0]!;
    town.buildings = [...town.buildings, 'mage_guild_1'];
    // El pueblo tiene que estar libre: no se contrata con un héroe dentro.
    const inicial = heroesOf(state, 0)[0]!;
    inicial.at = { x: town.at.x, y: town.at.y + 2 };

    applyAdventureAction(state, { type: 'hire_hero', town: town.id }, c, state.current);
    const nuevo = heroesOf(state, 0).find((h) => h.id !== inicial.id)!;

    // Sigue sin habilidades —escribir `hero.skills` en partida es #6/#15— y aun
    // así aprende todo lo que hoy existe, porque nada pasa del nivel 2.
    expect(nuevo.skills).toEqual({});
    expect(nuevo.spells).toContain('magic_arrow');
    expect(nuevo.spells).toContain('haste');
    expect(nuevo.spells).toContain('slow');
  });
});

describe('el maná es un recurso (#4)', () => {
  it('el maná gastado en la batalla sigue gastado al volver al mapa', () => {
    const state = newGame({ seed: 53 });
    const c = ctx(53);
    const hero = heroesOf(state, 0)[0]!;
    // Ejército sobrado: interesa el maná, no quién gana.
    hero.army = [{ creature: 'paladin', count: 50 }, null, null, null, null];
    hero.mana = maxMana(hero);
    const antes = hero.mana;

    forzarBatalla(state, c, hero);
    const enBatalla = state.pendingBattle!.battle.heroes.attacker!;
    const registro = state.pendingBattle!.battle.log;
    resolvePendingBattle(state, c);

    // La IA lanza, así que el héroe termina la batalla con menos maná del que
    // entró — y ese es el que se lleva al mapa. Sin la copia volvía a 20/20 y la
    // magia salía gratis.
    expect(registro.some((e) => e.kind === 'cast')).toBe(true);
    expect(hero.mana).toBe(enBatalla.mana);
    expect(hero.mana).toBeLessThan(antes);
  });
});
