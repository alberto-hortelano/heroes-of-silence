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
  COMO_SE_LEE_EL_MAPA,
  serializeAdventureTurn,
  serializeBattleTurn,
  serializeMapRequest,
} from '../src/core/contract/serialize.js';
import { generateMapPlan } from '../src/core/map/generate.js';
import { pointFromKey, pointKey } from '../src/core/map/map.js';
import { costeDeEntrada, isWalkable, TERRAIN_KINDS } from '../src/core/map/terrain.js';
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

  it('el turno lleva el TERRENO y los caminos que ha explorado, no solo objetos (#85)', () => {
    // `knownMap` era `{width, height, objects}`: el agente elegía el "to" de
    // cada `move_hero` sin saber por dónde se anda ni dónde hay carretera,
    // mientras la tool `map` le prometía traer «lo mismo». Ahora sale del mismo
    // serializador, así que trae terreno y caminos filtrados por la niebla.
    const state = newGame({ seed: 92 });
    // Un camino a mano: el generador procedimental no pone ninguno, así que sin
    // esto `roads` sería siempre `[]` y el filtro no probaría nada. Uno dentro
    // de la niebla del jugador 0 y otro fuera, para que haya algo que filtrar.
    const jugador = state.players[0]!;
    // Fuera de la diagonal a propósito: en (15,15) intercambiar x por y es la
    // identidad, y una fixtura así deja pasar un serializador que lea la clave
    // del revés. Se vio: la sonda que hacía justo eso salió verde en los 400.
    const asimetrica = (k: string): boolean => {
      const p = pointFromKey(k);
      return p.x !== p.y;
    };
    const dentro = [...jugador.fog].find(asimetrica);
    const fuera = [...state.players[1]!.fog].find((k) => !jugador.fog.has(k) && asimetrica(k));
    // Y se comprueba que la semilla sigue dando las dos casillas, en vez de
    // taparlo con un `!`. Con `fuera` a `undefined` se colaba un `undefined` en
    // `roads` y el `not.toContain(fuera)` de abajo pasaba **por vacío**: un
    // guardia verde sin haber probado nada, que es justo lo que este ciclo
    // persigue. El test hermano de `agent-link` ya lo hacía así.
    if (dentro === undefined || fuera === undefined) {
      throw new Error(
        'la semilla 92 ya no deja una casilla fuera de la diagonal dentro de la niebla del 0 y otra fuera',
      );
    }
    state.map.roads.add(dentro);
    state.map.roads.add(fuera);
    // Y la niebla tiene que ser ASIMÉTRICA, o el barrido de abajo tampoco puede
    // morder: el generador pone los inicios en la diagonal de un mapa cuadrado
    // —(4,4) y (19,19)—, así que hasta el día 3 la niebla es simétrica bajo
    // transponer y leer la clave del revés no cambia ni una casilla. Se fuerza
    // una casilla explorada cuya transpuesta NO lo esté, y se comprueba que
    // queda así en vez de suponerlo.
    const espejo = pointFromKey(dentro);
    const transpuesta = pointKey({ x: espejo.y, y: espejo.x });
    jugador.fog.delete(transpuesta);
    if (!jugador.fog.has(dentro) || jugador.fog.has(transpuesta)) {
      throw new Error(`la niebla del jugador 0 sigue siendo simétrica en ${dentro}`);
    }

    const payload = serializeAdventureTurn(state, 0) as {
      knownMap: {
        width: number;
        height: number;
        terrain: (string | null)[];
        roads: { x: number; y: number }[];
        objects: unknown[];
      };
    };
    const { width, height, terrain, roads } = payload.knownMap;

    // El array es plano y completo: el índice `y*width+x` se conserva, así que
    // el agente no aprende una convención nueva para leerlo.
    expect(terrain.length).toBe(width * height);

    // Las dos mitades, y las dos importan. Sin el `null` esto pasaría con un
    // mapa revelado entero; sin el terreno real pasaría con el mapa a oscuras.
    expect(
      terrain.some((t) => t === null),
      'lo no explorado va como null',
    ).toBe(true);
    expect(
      terrain.some((t) => t !== null),
      'lo explorado trae su terreno',
    ).toBe(true);

    // Y el `null` es EXACTAMENTE la niebla, casilla a casilla: ni una de más
    // —eso sería fuga— ni una de menos —eso sería terreno inventado—.
    //
    // Se recorre (x, y) y se calcula el índice, y NO al revés. La primera
    // redacción sacaba la casilla del índice con `{x: i % width, y: floor(i /
    // width)}`, que es **la misma expresión que la implementación**: un espejo,
    // no un guardia. Transponerla en `serializeKnownMap` dejaba los 402 en
    // verde. Es `pointFromKey` otra vez, una función más allá.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const explorada = jugador.fog.has(pointKey({ x, y }));
        expect(terrain[y * width + x] === null, `(${x},${y})`).toBe(!explorada);
      }
    }

    // Los caminos salen como PUNTOS y no como la clave con la que se guardan,
    // igual que `at` y que los `roads` que el propio agente escribe en un plan
    // de mapa. Se compara por `pointKey` para no depender del orden.
    expect(roads.map(pointKey)).toContain(dentro);
    expect(roads.map(pointKey)).not.toContain(fuera);
    for (const p of roads) {
      expect(typeof p.x, 'un camino viaja como {x,y}, no como "x,y"').toBe('number');
      expect(jugador.fog.has(pointKey(p))).toBe(true);
    }
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

  it('y nombra el terreno y los caminos, o el dato viaja y no se mira (#85)', () => {
    // La regla de la casa, escrita en `serialize.ts` a cuenta de `level`: un
    // dato nuevo que el contrato no nombra es un dato que el agente no mira.
    const prosa = RESPONSE_FORMAT.adventure_turn;
    expect(prosa).toContain('"knownMap"');
    expect(prosa).toContain('"terrain"');
    expect(prosa).toContain('"roads"');
    // El índice, que es cómo se lee el array plano.
    expect(prosa).toMatch(/y\*width\+x/);
    // El `null` es ignorancia y no hierba: sin esta línea, el 45 % del mapa del
    // día 6 se lee como un terreno raro en vez de como un hueco.
    expect(prosa).toMatch(/no has explorado/);
    expect(prosa).toMatch(/hierba/);
    // El agua no se pisa: es lo que convierte el terreno en una decisión.
    expect(prosa).toMatch(/agua/i);

    // Aquí había dos aserciones —`CADENAS "x,y"` y el ejemplo `"3,7"`— que
    // anclaban una advertencia que ya no hay que dar: `roads` viajaba como
    // claves de texto y era el único campo del payload que no iba como {x,y}.
    // Se normalizó el dato en vez de documentar la rareza, así que la viñeta
    // desapareció y con ella el riesgo que no tenía guardia. Lo que queda es
    // que la prosa diga la forma que SÍ tiene.
    expect(prosa).toMatch(/como puntos \{x,y\}/);
    expect(prosa, 'la clave de almacenamiento no vuelve a la red').not.toMatch(/CADENAS/);
  });

  it('y la descripción de knownMap es UNA, compartida con la tool `map`', () => {
    // `MAPA_DESCRIPCION` y esta prosa describían el MISMO objeto en dos
    // redacciones a mano que se citaban la una a la otra —«es lo mismo que
    // viaja en knownMap» / «es lo mismo que devuelve la tool map»— y ya habían
    // divergido en el commit que las unificó por el lado del dato: la de la
    // tool no tenía ni el agua infranqueable ni los costes, así que el agente
    // que llamaba a la tool recibía una descripción estrictamente peor.
    //
    // Esta mitad comprueba la puerta que un test alcanza. La otra —que la tool
    // publicada lo lleve— la comprueba `pnpm qa` contra un cliente MCP de
    // verdad, porque `mcp/server.ts` abre el transporte al importarlo y desde
    // aquí no se puede afirmar nada sobre él.
    expect(RESPONSE_FORMAT.adventure_turn).toContain(COMO_SE_LEE_EL_MAPA);

    // Y que el bloque no esté vacío ni sea un trozo suelto: si alguien lo
    // recorta a una línea, esto sigue pasando y no debería.
    expect(COMO_SE_LEE_EL_MAPA).toMatch(/"terrain"/);
    expect(COMO_SE_LEE_EL_MAPA).toMatch(/"roads"/);
    expect(COMO_SE_LEE_EL_MAPA).toMatch(/"objects"/);
  });

  it('y los costes de la prosa salen de costeDeEntrada, no de la tabla', () => {
    // La primera redacción de este test leía `TERRAIN_COST`, o sea que **anclaba
    // la copia y no la regla**: la prosa derivaba las cifras de la tabla y
    // reescribía a mano la fórmula de al lado —el camino que sustituye al
    // terreno, la diagonal que multiplica y redondea—, y este test la daba por
    // buena. Es el mismo criterio que `game.test.ts` ya aplica al medir un paso:
    // «se mide llamando a `stepCost` y no leyendo la tabla».
    //
    // Ahora la prosa lleva las dos columnas ya resueltas y el test las pide a la
    // misma función que se las cobra al héroe. El día que el camino deje de ser
    // plano o el redondeo cambie, las dos se mueven juntas o esto se pone rojo.
    const prosa = RESPONSE_FORMAT.adventure_turn;
    for (const kind of TERRAIN_KINDS) {
      const fila = `${kind} ${costeDeEntrada(kind, false, false)} (${costeDeEntrada(kind, false, true)} en diagonal)`;
      if (isWalkable(kind)) {
        expect(prosa, `falta el coste de ${kind}`).toContain(fila);
      } else {
        // El agua no tiene coste que anunciar: no se pisa. Y se cae sola de la
        // lista porque la filtra `isWalkable`, la misma que usa el pathfinding.
        expect(prosa, 'el agua no se pisa: no se le anuncia coste').not.toContain(fila);
      }
    }
    // El camino no depende del terreno de debajo, así que se pregunta por uno
    // cualquiera: si algún día dependiera, esta línea dejaría de ser cierta.
    expect(prosa).toContain(
      `camino cuesta ${costeDeEntrada('grass', true, false)} (${costeDeEntrada('grass', true, true)} en diagonal)`,
    );
    // Y la fórmula NO viaja: al agente se le dan números, no deberes. Una prosa
    // que le pida multiplicar y redondear es una segunda implementación de
    // `costeDeEntrada` escrita en un sitio donde nada la puede comprobar.
    expect(prosa, 'la prosa no debe reescribir la fórmula').not.toMatch(/multiplica|redondea/i);
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
    // Aquí decía `/numerados desde 0/`: era la convención en prosa de la que el
    // agente tenía que sacar QUÉ jugadores colocar. Desde #101 ese dato viaja en
    // el payload y la prosa manda leerlo; lo que se acota se sigue anunciando.
    expect(RESPONSE_FORMAT.map_generate).toMatch(/want\.players/);
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
    const payload = serializeMapRequest({ width: 24, height: 24, players: [0, 1] }) as {
      palette: { terrains: string[]; factions: string[] };
    };
    expect(payload.palette.terrains).toContain('grass');
    expect(payload.palette.factions).toEqual(['knight', 'necromancer']);
  });

  it('la petición de mapa dice CUÁLES son los jugadores, no cuántos', () => {
    // Antes viajaba `players: 2` y de qué números eran esos dos se enteraba el
    // agente por una frase de `RESPONSE_FORMAT` («numerados desde 0»). El dato
    // que hay que leer no puede vivir en la prosa que lo explica.
    const payload = serializeMapRequest({ width: 24, height: 24, players: [0, 1] }) as {
      want: { players: unknown };
    };
    expect(payload.want.players).toEqual([0, 1]);

    // Y no son siempre el 0 y el 1: eso es justo lo que la convención daba por
    // supuesto. Lo que se manda es la lista que se pidió.
    const raro = serializeMapRequest({ width: 24, height: 24, players: [3, 7] }) as {
      want: { players: unknown };
    };
    expect(raro.want.players).toEqual([3, 7]);
  });

  it('y la prosa del mapa manda leer "want.players" en vez de contar desde 0', () => {
    const prosa = RESPONSE_FORMAT.map_generate;
    expect(prosa).toMatch(/EXACTAMENTE los jugadores de "want\.players"/);
    // La convención muere: si vuelve a aparecer, el dato ha vuelto a la prosa.
    expect(prosa).not.toMatch(/numerados desde 0/);
    expect(prosa).not.toMatch(/"players": 2 son el 0 y el 1/);
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
