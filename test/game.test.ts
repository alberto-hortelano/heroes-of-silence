import { describe, expect, it } from 'vitest';
import { armyPower, fuerzaDe, poderDe, ventajaClara } from '../src/core/ai/fuerza.js';
import {
  chooseBuilding,
  chooseHeroDestination,
  ordenDeConstruccion,
  planBuildings,
  planHires,
  planRecruits,
  stepTowards,
} from '../src/core/ai/strategy.js';
import { playAiGame, playAiTurn } from '../src/core/ai/turn.js';
import { createBattle } from '../src/core/battle/battle.js';
import { stackHp } from '../src/core/battle/damage.js';
import { allSpells } from '../src/core/battle/spells.js';
import { queEs } from '../src/core/battle/types.js';
import {
  guarnicionDeBase,
  guarnicionNeutral,
  problemasDeGrupo,
  problemasDeTopeDeLiderazgo,
  unidadDelJuego,
  unidadesDelJuego,
  unidadesDeMorada,
} from '../src/core/catalogo.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { crecimientoDelNivel, ECONOMIA, LIDERAZGO, oroDelIndice } from '../src/core/data.js';
import { EQUIPO_BASE } from '../src/core/hero/equipo.js';
import {
  type Hero,
  learnable,
  maxMana,
  maxMovePoints,
  slowestSpeed,
} from '../src/core/hero/hero.js';
import { GARRISON_LEADERSHIP, troopBlocker } from '../src/core/hero/troop.js';
import { buildMap, generateMapPlan, validateMapPlan } from '../src/core/map/generate.js';
import {
  blocksMovement,
  createEmptyMap,
  findPath,
  isEnterable,
  type MapObject,
  objectAt,
  pathFromReachable,
  pointFromKey,
  pointKey,
  reachableFrom,
  stepCost,
} from '../src/core/map/map.js';
import {
  conectadoABase,
  estructura,
  regionesQueCierra,
  regionOwner,
  territorio,
} from '../src/core/map/regiones.js';
import { isWalkable, ROAD_COST, TERRAIN_KINDS } from '../src/core/map/terrain.js';
import { indiceDePoder, nivelDeUnidad } from '../src/core/nivel.js';
import { createRng, parseSeed } from '../src/core/rng.js';
import {
  CHARACTER_BODY,
  type Character,
  createCharacter,
  defaultBuild,
} from '../src/core/rpg/character.js';
import {
  asaltantesALaVista,
  emboscadaEnLaRuta,
  type Raider,
  regionDeCasilla,
} from '../src/core/state/asaltantes.js';
import { finDePartida } from '../src/core/state/desenlace.js';
import { cronicaPara } from '../src/core/state/events.js';
import {
  type AdventureAction,
  alcanceDelHeroe,
  applyAdventureAction,
  baseOf,
  caminoHasta,
  currentPlayer,
  dayOfWeek,
  type GameContext,
  type GameState,
  heroById,
  heroesOf,
  ordenDelDia,
  resolvePendingBattle,
  townsOf,
  visibleNow,
  week,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import { building, buildingsOfFaction, nivelDeMorada } from '../src/core/town/buildings.js';
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
import { FACTION_IDS, type FactionId, type Point } from '../src/core/types.js';
import {
  acabarPorLaBase,
  conCaminos,
  conSuEquipo,
  copiaDePartida,
  costesDelAlcance,
  ejercito,
  esPersonaje,
  FACCION_A,
  FACCION_B,
  forzarBatalla,
  fueraDeSuBase,
  grupoQueMarcha,
  hastaSuSiguienteTurno,
  JINETE,
  monstruoVivo,
  NO_MUERTO,
  PESADA,
  pegadoA,
  planDeNodos,
  ponerMonstruo,
  primeraMarchaQueSePara,
  sinGuarnicionDeSalida,
  TIRADOR,
  TROPA,
  TROPA_BARATA,
} from './helpers.js';

/** Los cupos con el tope de siempre (7): un héroe lleva 6 y una guarnición 7. */
const CUPO_GUARNICION = COMBATE_COMPLETO.tope;

const ctx = (seed: number): GameContext => ({ rng: createRng(seed) });

/**
 * Una casilla pegada al héroe, andable y sin nada encima: el sitio donde
 * plantar al defensor para que el atacante entre de un solo paso.
 *
 * Se pregunta al mapa en vez de escribir un desplazamiento a mano porque la
 * casilla de al lado puede ser agua o llevar un cofre encima, y entonces el
 * test mediría otra cosa —o reventaría— según la semilla.
 */
const casillaVecinaLibre = (state: GameState, desde: Point): Point => {
  // Las diagonales al final: el héroe nace en su base, y de una ciudad solo se
  // sale por las puertas que tiene, que pueden ser todas de esquina.
  for (const d of [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: -1 },
  ]) {
    const at = { x: desde.x + d.x, y: desde.y + d.y };
    const camino = findPath(state.map, desde, at);
    if (camino !== null && camino.length === 1 && objectAt(state.map, at) === undefined) {
      return at;
    }
  }
  throw new Error('el héroe no tiene ninguna casilla vecina libre');
};

describe('puntos de movimiento', () => {
  it('los marca el más lento del grupo, el héroe incluido (26-10-2026)', () => {
    // El troll anda 2 (agilidad 2); el hermano de carga, 5 (las 6 de su caballo de
    // guerra, −1 por lo que carga: 18 frente a su fuerza 16, 31-10-2026).
    const lento = ejercito({ creature: 'troll-maza', count: 1 }, { creature: JINETE, count: 5 });
    expect(slowestSpeed(grupoQueMarcha(lento), undefined)).toBe('very_slow');
    // La tabla de fheroes2 (1000, 1200 y 1400) a la escala del mapa de #226: ×√1,5.
    expect(maxMovePoints(grupoQueMarcha(lento), undefined)).toBe(1224);

    // Los jinetes van a 5, pero el héroe a pie (agilidad 4) frena al grupo.
    const rapido = ejercito({ creature: JINETE, count: 5 });
    expect(slowestSpeed(grupoQueMarcha(rapido), undefined)).toBe('average');
    expect(maxMovePoints(grupoQueMarcha(rapido), undefined)).toBe(1469);
    // A caballo de silla, ya no: manda el jinete.
    const aCaballo = grupoQueMarcha(rapido, {
      equipo: { ...EQUIPO_BASE, montura: 'caballo_de_silla' },
    });
    expect(slowestSpeed(aCaballo, undefined)).toBe('fast');
    expect(maxMovePoints(aCaballo, undefined)).toBe(1592);
  });

  it('un caballo de silla sube la marcha solo si lo llevan todos, y no cambia la batalla', () => {
    // El piquero templario anda 3 (su peso 8 pasa de su fuerza 7, −1 desde el
    // 31-10-2026); con su caballo de silla (8 + 2 frente a 10), 7.
    const SILLA = { montura: 'caballo_de_silla' } as const;
    const todos = [0, 1, 2].map((i) => conSuEquipo('templario-escudo', SILLA, `v-${i}`));
    const heroe = { equipo: { ...EQUIPO_BASE, ...SILLA } };
    expect(slowestSpeed(grupoQueMarcha(todos, heroe), undefined)).toBe('ultra_fast');
    // Si uno va a pie, manda él; y si el héroe va a pie, el héroe.
    const unoAPie = [...todos.slice(0, 2), { creature: 'templario-escudo' }];
    expect(slowestSpeed(grupoQueMarcha(unoAPie, heroe), undefined)).toBe('slow');
    expect(slowestSpeed(grupoQueMarcha(todos), undefined)).toBe('average');
    // En batalla pelea a pie: las mismas casillas y la misma defensa que sin él.
    const b = createBattle(
      { army: [{ ...todos[0]!, count: 1 }], hero: null },
      { army: [{ creature: 'templario-escudo', count: 1 }], hero: null },
      createRng(1),
      COMBATE_COMPLETO,
    );
    const [conSilla, sinSilla] = b.stacks;
    expect(conSilla?.unit.speed).toBe(sinSilla?.unit.speed);
    expect(conSilla?.unit.defense).toBe(sinSilla?.unit.defense);
    expect(conSilla?.unit.damage).toEqual(sinSilla?.unit.damage);
  });

  it('Logística los aumenta un 10 % por nivel', () => {
    // La pesada va a paso medio (`average`), como el héroe a pie.
    expect(unidadDelJuego(PESADA).speed).toBe('average');
    const army = ejercito({ creature: PESADA, count: 5 });
    // 1200 de fheroes2 → 1469 a la escala (#226); la Logística va encima.
    expect(maxMovePoints(grupoQueMarcha(army), undefined)).toBe(1469);
    expect(maxMovePoints(grupoQueMarcha(army, { skills: { logistics: 1 } }), undefined)).toBe(1616);
    expect(maxMovePoints(grupoQueMarcha(army, { skills: { logistics: 3 } }), undefined)).toBe(1910);
  });
});

describe('maná', () => {
  it('es diez veces el conocimiento', () => {
    expect(maxMana({ knowledge: 2 })).toBe(20);
    expect(maxMana({ knowledge: 7 })).toBe(70);
  });
});

describe('las claves de casilla', () => {
  it('pointFromKey es la inversa EXACTA de pointKey, y no solo en la diagonal', () => {
    // Este test existe por una sonda que salió VERDE: cambiar `{x, y}` por
    // `{x: y, y: x}` dentro de `pointFromKey` dejaba los 400 tests pasando.
    // Todas las fixturas de camino del repositorio usaban una casilla de la
    // diagonal —(1,1), (15,15), (0,0)—, donde intercambiar x por y es la
    // identidad. La batería era estrecha, no la idea.
    for (const p of [
      { x: 3, y: 7 },
      { x: 7, y: 3 },
      { x: 0, y: 12 },
      { x: 12, y: 0 },
      { x: 0, y: 0 },
    ]) {
      expect(pointFromKey(pointKey(p)), `(${p.x},${p.y})`).toEqual(p);
    }
  });

  it('y lo que no es una clave se rechaza DICIÉNDOLO, en vez de dar un punto raro', () => {
    // Toda clave del sistema sale de `pointKey`, así que una que no se pueda
    // leer es un fallo de programa: se lanza. Las dos que más costaron son las
    // de la mitad vacía, porque `Number("")` es 0 y no NaN: `"3,"` se leía como
    // (3,0) y `",7"` como (0,7), los dos en silencio.
    for (const basura of [
      '',
      '3',
      '3,',
      ',7',
      ',',
      'a,7',
      '3,b',
      '3.5,7',
      '3,7,9',
      '03,7',
      '3, 7',
    ]) {
      expect(() => pointFromKey(basura), `"${basura}"`).toThrow(/no es una casilla/);
    }
  });
});

describe('generación de mapas', () => {
  it('el mapa procedural es jugable', () => {
    for (const semilla of [1, 2, 3, 42, 777]) {
      const plan = generateMapPlan(createRng(semilla));
      expect(validateMapPlan(plan)).toEqual([]);
    }
  });

  it('rechaza una ciudad rodeada de agua: ya no es un paso entre regiones', () => {
    // Era «un pueblo inalcanzable», y se comprobaba con un `findPath` desde cada
    // inicio. Con el mapa de nodos esa comprobación se cayó por redundante: si
    // cada ciudad toca dos regiones y todas las regiones se alcanzan unas desde
    // otras (`problemasDeRed`), no hay ciudad a la que no se llegue. Lo que se
    // rechaza ahora es la causa, y con la ciudad nombrada.
    const plan = generateMapPlan(createRng(5));
    const neutral = plan.towns.find((t) => t.owner === null)!;
    const aislado = {
      ...plan,
      // Su recinto y sus accesos, los 5×5: una ciudad toca las regiones de los
      // accesos de sus puertas (`regionesDeLaCiudad`), a dos casillas.
      patches: [...plan.patches, { terrain: 'water' as const, center: neutral.at, radius: 2.9 }],
      // Sin caminos: los que llegaban a la ciudad quedarían sobre el agua, y un
      // camino sobre una barrera se rechaza antes de mirar la red. El
      // procedimental los escribe como tramos (#153).
      tramos: [],
    };
    expect(validateMapPlan(aislado).join(' ')).toMatch(
      new RegExp(`la ciudad "${neutral.id}" no toca ninguna región`),
    );
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
    expect(validateMapPlan(repetido).join(' ')).toMatch(/dos ciudades con el id "t"/);
  });

  it('pide al menos dos jugadores con ciudad: cada uno empieza en su base', () => {
    // Sin `heroStarts` (19-10-2026), los jugadores son los dueños de ciudad: un
    // plan con un solo dueño es una partida de uno.
    const plan = generateMapPlan(createRng(12));
    const solo = {
      ...plan,
      towns: plan.towns.map((t) => (t.owner === 1 ? { ...t, owner: null } : t)),
    };
    expect(validateMapPlan(solo).join(' ')).toMatch(/al menos dos jugadores con ciudad \(hay 1\)/);
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
    expect(problemas.join(' ')).toMatch(/unidad que no existe: "dragon"/);
    // Y con qué corregirlo: un rechazo que no dice las opciones no se corrige.
    expect(problemas.join(' ')).toMatch(new RegExp(`Las que valen:.*${NO_MUERTO}`));

    // La mayúscula también, que es el error más probable de un modelo.
    const conMayuscula = NO_MUERTO.charAt(0).toUpperCase() + NO_MUERTO.slice(1);
    const mayuscula = {
      ...plan,
      monsters: [{ at: plan.monsters[0]!.at, creature: conMayuscula, count: 3 }],
    };
    expect(validateMapPlan(mayuscula).join(' ')).toContain(`"${conMayuscula}"`);

    // Y el plan que muere en la puerta NO llega a construirse: `newGame` lanza
    // con el motivo del plan, no con «criatura desconocida» desde dentro del
    // turno de la IA, que era donde reventaba.
    expect(() => newGame({ seed: 31, plan: inventada })).toThrow(/no es jugable/);
  });

  it('rechaza un monstruo de más de siete, y dice el máximo', () => {
    // Un monstruo son individuos y ningún bando pasa de siete (regla del
    // usuario, fase 1b). Sin esto el plan entraba y `createBattle` reventaba
    // al pisarlo, con la partida ya en marcha.
    const plan = generateMapPlan(createRng(31));
    const conMonstruo = (creature: string, count: number) => ({
      ...plan,
      monsters: [{ at: plan.monsters[0]!.at, creature, count }, ...plan.monsters.slice(1)],
    });
    const at = plan.monsters[0]!.at;
    expect(validateMapPlan(conMonstruo(TROPA_BARATA, 8))).toEqual([
      `el monstruo de (${at.x},${at.y}) trae 8 × ${TROPA_BARATA} y un bando lleva como mucho 7`,
    ]);
    // Y en el límite, entra.
    expect(validateMapPlan(conMonstruo(TROPA_BARATA, 7))).toEqual([]);
    expect(validateMapPlan(conMonstruo('jinete-de-plaga', 7))).toEqual([]);
  });

  it('la guarnición de los datos y el monstruo del plan pasan por la misma comprobación', () => {
    // Una sola regla para los grupos escritos a mano (`problemasDeGrupo`): el
    // tope es del BANDO, así que en una guarnición de varios grupos se suman.
    expect(
      problemasDeGrupo(
        [
          { creature: TROPA_BARATA, count: 4 },
          { creature: TIRADOR, count: 4 },
        ],
        'la guarnición',
      ),
    ).toEqual([
      `la guarnición trae 4 × ${TROPA_BARATA} + 4 × ${TIRADOR} y un bando lleva como mucho 7`,
    ]);
    // Y la de los datos de hoy, la que nace en cada ciudad neutral, vale.
    for (const f of FACTION_IDS) {
      expect(problemasDeGrupo(guarnicionNeutral(f), f)).toEqual([]);
    }
  });

  it('una guarnición de los datos tiene además el tope de liderazgo de guarnición', () => {
    // Siete pesados caben en el cupo de un bando y no en una guarnición: 7 × 4
    // de liderazgo donde caben 20. Un monstruo así vale; una ciudad, no.
    const siete = [{ creature: PESADA, count: 7 }];
    const ocupa = 7 * unidadDelJuego(PESADA).leadership;
    expect(ocupa).toBeGreaterThan(LIDERAZGO.guarnicion);
    expect(problemasDeGrupo(siete, 'el monstruo')).toEqual([]);
    expect(
      problemasDeTopeDeLiderazgo(siete, 'la base', LIDERAZGO.guarnicion, 'una guarnición'),
    ).toEqual([
      `la base ocupa ${ocupa} de liderazgo y una guarnición lleva como mucho ${LIDERAZGO.guarnicion}`,
    ]);
    // Y las tablas de hoy valen, las de las cinco facciones.
    const enGuarnicion = (g: Parameters<typeof problemasDeGrupo>[0], q: string) =>
      problemasDeTopeDeLiderazgo(g, q, LIDERAZGO.guarnicion, 'una guarnición');
    for (const f of FACTION_IDS) {
      expect(enGuarnicion(guarnicionNeutral(f), f)).toEqual([]);
      expect(enGuarnicion(guarnicionDeBase(f), f)).toEqual([]);
    }
  });

  it('rechaza un monstruo de 0, negativo o con decimales: son individuos', () => {
    // El esquema del agente ya exige un entero positivo, pero `validateMapPlan`
    // es la puerta de los dos productores y el procedimental no pasa por zod. Un
    // 1,5 era un `Array.from({ length: 1.5 })`: un monstruo de 1, en silencio.
    const plan = generateMapPlan(createRng(31));
    const at = plan.monsters[0]!.at;
    for (const count of [0, -3, 1.5, Number.NaN]) {
      const malo = {
        ...plan,
        monsters: [{ at, creature: TROPA_BARATA, count }, ...plan.monsters.slice(1)],
      };
      expect(validateMapPlan(malo), String(count)).toEqual([
        `el monstruo de (${at.x},${at.y}) trae ${count} × ${TROPA_BARATA}: son individuos, tiene que ser un entero de 1 en adelante`,
      ]);
    }
  });

  it('el generador no pone nunca un monstruo de más de siete', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const plan = generateMapPlan(createRng(seed));
      for (const m of plan.monsters) expect(m.count, `semilla ${seed}`).toBeLessThanOrEqual(7);
      expect(validateMapPlan(plan)).toEqual([]);
    }
  });

  it('el ORDEN de las ciudades no decide quién abre la partida', () => {
    // `currentPlayer` juega por el índice de `state.players`, y `state.players`
    // salía del orden en que el plan escribía `heroStarts`: mandando los inicios
    // del revés el agente abría el día 1 (comprobado en el circuito real). Sin
    // inicios, los jugadores salen de las ciudades, y su orden tampoco manda.
    const plan = generateMapPlan(createRng(34));
    const alDerecho = newGame({ seed: 34, plan });
    const alReves = newGame({
      seed: 34,
      plan: { ...plan, towns: [...plan.towns].reverse() },
    });

    for (const state of [alDerecho, alReves]) {
      expect(state.players.map((p) => p.id)).toEqual([0, 1]);
      expect(state.heroes.map((h) => h.owner)).toEqual([0, 1]);
      // Y la facción va con el jugador, no con la posición en la lista.
      expect(state.players[0]!.faction).toBe(plan.towns.find((t) => t.owner === 0)!.faction);
    }
    // Invertir las ciudades da los MISMOS héroes, no unos parecidos: el orden del
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
    expect(map.objects.filter((o) => o.kind === 'village')).toHaveLength(plan.villages.length);
    for (const v of plan.villages) expect(objectAt(map, v.at)?.kind).toBe('village');
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

  it('el orden de los turnos va en serpiente: quien cierra un día abre el siguiente', () => {
    // Regla nuestra (fheroes2 tiene el orden fijo): con el 0 abriendo todos los
    // días, ganaba 603 de 1 000 partidas de la IA contra sí misma.
    const state = newGame({ seed: 3 });
    const c = ctx(3);
    expect(ordenDelDia(state.players, 1)).toEqual([0, 1]);
    expect(ordenDelDia(state.players, 2)).toEqual([1, 0]);
    expect(ordenDelDia(state.players, 3)).toEqual([0, 1]);
    while (state.day < 5) applyAdventureAction(state, { type: 'end_turn' }, c, state.current);

    // La crónica es quien da fe: cada turno empieza con su `turn_start`, y el
    // cambio de día (con la patrulla de los asaltantes) cae entre los dos
    // turnos seguidos del mismo jugador.
    const turnos = state.log
      .filter((e) => e.kind === 'day_start' || e.kind === 'turn_start')
      .map((e) => (e.kind === 'day_start' ? `día ${e.day}` : `j${e.actor}`));
    expect(turnos).toEqual([
      'día 1',
      'j0',
      'j1',
      'día 2',
      'j1',
      'j0',
      'día 3',
      'j0',
      'j1',
      'día 4',
      'j1',
      'j0',
      'día 5',
      'j0',
    ]);
  });

  it('con más jugadores la serpiente da la vuelta entera, y quien no juega se salta', () => {
    const tres = [{ id: 0 }, { id: 1 }, { id: 2 }];
    expect(ordenDelDia(tres, 1)).toEqual([0, 1, 2]);
    expect(ordenDelDia(tres, 2)).toEqual([2, 1, 0]);

    // Un tercero ya eliminado: el día 2 lo abriría él, y lo abre el siguiente
    // vivo de su orden, que es quien cerró el 1.
    const state = newGame({ seed: 3 });
    const c = ctx(3);
    state.players.push({ ...structuredClone(state.players[1]!), id: 2, defeated: true });
    applyAdventureAction(state, { type: 'end_turn' }, c, 0);
    expect([state.day, state.current]).toEqual([1, 1]);
    applyAdventureAction(state, { type: 'end_turn' }, c, 1);
    expect([state.day, state.current]).toEqual([2, 1]);
    applyAdventureAction(state, { type: 'end_turn' }, c, 1);
    expect([state.day, state.current]).toEqual([2, 0]);
  });

  it('un día que no existe no tiene orden de turnos', () => {
    expect(() => ordenDelDia([{ id: 0 }, { id: 1 }], 0)).toThrow(
      'no hay orden de turnos para el día 0: los días empiezan en el 1',
    );
    expect(() => ordenDelDia([{ id: 0 }, { id: 1 }], 1.5)).toThrow(/los días empiezan en el 1/);
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
  it('el ayuntamiento ingresa cada día', () => {
    const state = newGame({ seed: 11 });
    const c = ctx(11);
    const oroInicial = state.players[0]!.oro;

    // Su turno siguiente, con su ingreso.
    hastaSuSiguienteTurno(state, c, 0);
    expect(state.players[0]!.oro).toBeGreaterThan(oroInicial);
  });

  it('construir cuesta recursos y solo se puede una vez al día', () => {
    const state = newGame({ seed: 12 });
    const c = ctx(12);
    const town = townsOf(state, 0)[0]!;
    const player = currentPlayer(state);
    const oroAntes = player.oro;
    // Dos moradas de su facción que solo piden lo que la base trae hecho.
    const [una, otra] = buildingsOfFaction(town.faction)
      .filter((b) => b.morada !== undefined && b.prebuilt !== true)
      .filter((b) => (b.requires ?? []).every((r) => town.buildings.includes(r)))
      .map((b) => b.id);
    expect(otra).toBeDefined();

    applyAdventureAction(state, { type: 'build', town: town.id, building: una! }, c, state.current);
    expect(town.buildings).toContain(una);
    expect(player.oro).toBeLessThan(oroAntes);

    expect(() =>
      applyAdventureAction(
        state,
        { type: 'build', town: town.id, building: otra! },
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
    // Vacío: el ejército de salida puede llevar ya 6 de los 6 que caben.
    hero.army = [];

    const morada = dwellings(town)[0]!;
    const disponibles = town.available[morada.creature] ?? 0;
    expect(disponibles).toBeGreaterThan(0);

    const antes = hero.army.filter((s) => s.creature === morada.creature).length;
    applyAdventureAction(
      state,
      { type: 'recruit', town: town.id, creature: morada.creature, count: 2 },
      c,
      state.current,
    );
    const despues = hero.army.filter((s) => s.creature === morada.creature).length;
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
        const vacio = createEmptyMap(3, 3, terreno);
        const map = conCamino ? conCaminos(vacio, pointKey({ x: 1, y: 1 })) : vacio;
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

    // A dos casillas de la base, donde nace (19-10-2026), y dentro de la región
    // de casa, buscado y no supuesto: con el mapa de 28 la casilla dos a la
    // derecha del inicio era montaña, y fuera de casa puede haber un grupo de
    // asaltantes que pare la marcha. La casa del 0 es la región 0 del
    // procedimental (la base es un nodo: no es de ninguna región).
    expect(hero.at).toEqual(baseOf(state, 0)!.at);
    const casa = 0;
    const alcance = alcanceDelHeroe(state, hero);
    const destino = [...costesDelAlcance(alcance).entries()]
      .map(([k, coste]) => ({ p: pointFromKey(k), coste }))
      .find(
        ({ p, coste }) =>
          coste <= hero.movePoints &&
          Math.max(Math.abs(p.x - hero.at.x), Math.abs(p.y - hero.at.y)) === 2 &&
          regionDeCasilla(state.map, p) === casa,
      )!.p;
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

    // Sin guarnición ni su héroe dentro (nace en ella) no hay batalla: lo que se
    // mide aquí es la captura.
    suyo.garrison = [];
    const rival = fueraDeSuBase(state, 1);
    hero.at = pegadoA(state, suyo.at, [rival.at]);
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
      `ahora juega el jugador 0 (${state.players.find((p) => p.id === 0)!.faction})`,
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
    hero.army = ejercito({ creature: PESADA, count: 6 });
    const monstruo = monstruoVivo(state);
    forzarBatalla(state, c, hero, monstruo.at);
    expect(state.pendingBattle!.foe).toEqual({ kind: 'monster', objectId: monstruo.id });

    const resultado = resolvePendingBattle(state, c);
    expect(resultado.winner).toBe('attacker');
    expect((monstruo as { defeated: boolean }).defeated).toBe(true);
    expect(state.pendingBattle).toBeNull();
    expect(heroById(state, hero.id).experience).toBeGreaterThan(0);
  });

  it('perder la batalla devuelve al héroe atacante a su base, sin tropa', () => {
    // Hasta la fase 1b el héroe que perdía desaparecía del mapa. Ahora cae y
    // vuelve a su castillo con el ejército vacío y sin movimiento: la tropa
    // muerta se pierde, y la viva también, porque no se rindió.
    const state = newGame({ seed: 32 });
    const c = ctx(32);
    const hero = heroesOf(state, 0)[0]!;
    const monstruo = monstruoVivo(state);
    const base = townsOf(state, 0)[0]!;

    hero.army = ejercito({ creature: TROPA_BARATA, count: 1 });
    base.garrison = [];
    // Sin oro no hay rendición: tiene que caer peleando.
    state.players[0]!.oro = 0;
    // Se sustituye por un monstruo imbatible en la misma casilla.
    state.map.objects.splice(state.map.objects.indexOf(monstruo), 1, {
      kind: 'monster',
      id: monstruo.id,
      at: monstruo.at,
      creature: 'jinete-de-plaga',
      count: 7,
      defeated: false,
    });

    forzarBatalla(state, c, hero);
    const resultado = resolvePendingBattle(state, c);
    expect(resultado.winner).toBe('defender');
    const vuelto = heroById(state, hero.id);
    expect(vuelto.at).toEqual(base.at);
    expect(vuelto.movePoints).toBe(0);
    expect(vuelto.army).toEqual([]);
    const kinds = state.log.map((e) => e.kind);
    expect(kinds.indexOf('hero_defeated')).toBeGreaterThan(-1);
    expect(kinds.indexOf('hero_returned')).toBeGreaterThan(kinds.indexOf('hero_defeated'));
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

describe('IA de respaldo', () => {
  it('planifica construir y reclutar en el primer turno, si la base tiene sitio', () => {
    // La base nace llena (`guarnicionBase`) y el héroe no empieza dentro: con
    // la de salida puesta, el día 1 no se recluta —eso lo prueba el bloque de
    // la guarnición de la base—. Aquí se mide el plan.
    const state = sinGuarnicionDeSalida(newGame({ seed: 41 }));
    expect(planBuildings(state, 0).some((a) => a.type === 'build')).toBe(true);
    expect(planRecruits(state, 0).some((a) => a.type === 'recruit')).toBe(true);
  });

  it('quien se ha quedado sin héroe reserva lo que cuesta el siguiente', () => {
    // La avería, que es anterior a cuadrar la economía: `planRecruits` gastaba
    // el monedero ENTERO y `planHires` exige 2500, así que el jugador que
    // perdía su héroe no compraba otro nunca. Se quedaba con su castillo y
    // ~25 de oro sosteniendo un empate hasta el día 300.
    const state = sinGuarnicionDeSalida(newGame({ seed: 41 }));
    const player = state.players.find((p) => p.id === 0)!;
    state.heroes = state.heroes.filter((h) => h.owner !== 0);
    player.oro = ECONOMIA.precioDelHeroe + 400;
    // Con la morada llena, quien manda es el oro: sin la reserva, el
    // reclutamiento se lo lleva hasta el último. Con lo poco que cría la morada
    // el día 1 este test pasaría sin reserva y no guardaría nada.
    const town = townsOf(state, 0)[0]!;
    for (const id of Object.keys(town.available)) town.available[id] = 500;

    const reclutas = planRecruits(state, 0);
    expect(reclutas.some((a) => a.type === 'recruit')).toBe(true); // no se queda parado
    for (const accion of reclutas) applyAdventureAction(state, accion, ctx(41), 0);

    expect(player.oro).toBeGreaterThanOrEqual(ECONOMIA.precioDelHeroe);
    expect(planHires(state, 0).some((a) => a.type === 'hire_hero')).toBe(true);
  });

  it('con un héroe vivo no se reserva nada: el oro es para el ejército', () => {
    // La otra cara, que es lo que hace de la reserva un arreglo y no un
    // impuesto: reservar 2500 todos los días dejaría al ejército corto para
    // siempre. Las dos partidas salen de la misma semilla y solo se
    // diferencian en si al jugador le queda un héroe; con la morada llena de
    // criaturas, lo que manda es el oro. Y poco oro: el liderazgo de la
    // guarnición también es un techo, y con más se llegaría a él por los dos
    // lados.
    const cuenta = (acciones: readonly AdventureAction[]): number =>
      acciones.reduce((n, a) => (a.type === 'recruit' ? n + a.count : n), 0);
    const montar = (conHeroe: boolean) => {
      const state = sinGuarnicionDeSalida(newGame({ seed: 41 }));
      const player = state.players.find((p) => p.id === 0)!;
      player.oro = ECONOMIA.precioDelHeroe + 100;
      const town = townsOf(state, 0)[0]!;
      for (const id of Object.keys(town.available)) town.available[id] = 500;
      if (!conHeroe) state.heroes = state.heroes.filter((h) => h.owner !== 0);
      return cuenta(planRecruits(state, 0));
    };

    expect(montar(true)).toBeGreaterThan(montar(false));
  });

  it('valora más un ejército mayor', () => {
    const debil = ejercito({ creature: TROPA_BARATA, count: 10 });
    const fuerte = ejercito({ creature: PESADA, count: 10 });
    expect(armyPower(fuerte, undefined)).toBeGreaterThan(armyPower(debil, undefined));
  });

  it('no manda al héroe contra un monstruo que le supera', () => {
    const state = newGame({ seed: 42 });
    const hero = heroesOf(state, 0)[0]!;
    hero.army = ejercito({ creature: TROPA_BARATA, count: 1 });
    hero.movePoints = 99999;

    // Se vacía el mapa y se deja un único objetivo: un monstruo descomunal
    // pegado al héroe. Si la IA lo elige, es que no mide sus fuerzas. Sin
    // asaltantes, que también son objetivo (ni su recuerdo, #164).
    state.map.objects.length = 0;
    state.raiders = [];
    for (const p of state.players) p.asaltantesVistos.clear();
    state.map.objects.push({
      kind: 'monster',
      id: 'coloso',
      at: { x: hero.at.x + 1, y: hero.at.y },
      creature: 'jinete-de-plaga',
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
    // Monstruos primero: desde el mapa de nodos son lo único que bloquea, y sin
    // ellos entre los diez no habría bloqueada en la que separarse.
    const destinos = [
      ...state.map.objects.filter((o) => o.kind === 'monster').slice(0, 5),
      ...state.map.objects.filter((o) => o.kind !== 'monster').slice(0, 5),
    ].map((o) => o.at);
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

    // Monstruos primero: desde el mapa de nodos son lo único que bloquea, y sin
    // ellos entre los diez no habría bloqueada en la que separarse.
    const destinos = [
      ...state.map.objects.filter((o) => o.kind === 'monster').slice(0, 5),
      ...state.map.objects.filter((o) => o.kind !== 'monster').slice(0, 5),
    ].map((o) => o.at);
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
    const [clave] = [...costesDelAlcance(alcance).entries()].filter(([, c]) => c > 0)[0] as [
      string,
      number,
    ];
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
    // La pista es el Dijkstra que lanzaría la puerta, el del héroe con lo hostil
    // (`alcanceDelHeroe`): uno crudo (`reachableFrom`) cruzaría una guarnición
    // por la que el héroe no pasa.
    const destinoDe = (state: GameState): Point => {
      const hero = heroesOf(state, 0)[0]!;
      const alcance = alcanceDelHeroe(state, hero);
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
      alcanceDelHeroe(conPista, heroe),
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
    const otroOrigen = [...costesDelAlcance(alcance).entries()]
      .filter(([, coste]) => coste > 0)
      .sort((a, b) => a[1] - b[1])[0]![0];
    const [x, y] = otroOrigen.split(',').map(Number);
    const impostor = reachableFrom(state.map, { x: x as number, y: y as number });
    expect(costesDelAlcance(impostor).get(pointKey(destino))).toBeDefined();

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
    // Que la partida termine ya lo dice el tipo de retorno; lo que este test
    // afirma es que gana ALGUIEN. `expect(state.finished).not.toBeNull()` sería
    // verde por construcción, y también con una partida agotada.
    const { winner: ganador } = await playAiGame(state, c);
    expect(ganador).not.toBeNull();
    const perdedores = state.players.filter((p) => p.id !== ganador);
    expect(perdedores.every((p) => p.defeated)).toBe(true);
    // `toMatchObject` y no `toEqual`: desde que el evento lleva protagonista y
    // sitio, comparar el objeto ENTERO ataría este test a los campos de
    // contabilidad de la crónica. Lo que se afirma aquí es cómo termina la
    // partida, no cómo se sella un evento.
    expect(state.log.at(-1)).toMatchObject({ kind: 'game_over', actor: ganador });
  });

  it('cuando se acaban los días la partida TERMINA, y sin ganador', async () => {
    // El guardia del agujero que cierra este ciclo, contado en el docstring de
    // `GameState.finished`: agotar los días dejaba `finished` en `null`.
    //
    // Dos días sobre la 1235, que es la semilla de aquí arriba: con 300 la
    // gana el jugador 0 el día 3 (con las cinco facciones de F3, 19-10-2026; eran
    // tres días cuando la ganaba más tarde), así que lo que se prueba es el tope
    // y no un empate afortunado.
    const state = newGame({ seed: 1235, maxDays: 2 });
    await playAiGame(state, ctx(1235));

    // El último día jugado es `maxDays` y no `maxDays + 1`: el tope se mira
    // ANTES de incrementar, así que no se emite un `day_start` de un día que no
    // juega nadie. Al revés, cada partida agotada llevaría una línea de más en
    // la crónica y el ancla del banco se movería.
    expect(state.day).toBe(2);
    expect(state.finished).toEqual({ winner: null });
    // `game_over` con `actor: null` es exacto: no lo protagoniza ningún
    // jugador. Y va el ÚLTIMO —nadie escribe detrás de él—, que es lo que
    // vigila `invariantes.test.ts` sobre las veinte primeras semillas.
    expect(state.log.at(-1)).toMatchObject({ kind: 'game_over', actor: null });
    expect(state.log.filter((e) => e.kind === 'day_start').map((e) => e.day)).toEqual([1, 2]);
    // Y nadie está eliminado: la partida no se acabó por eso.
    expect(state.players.every((p) => !p.defeated)).toBe(true);
  });

  it('un tope de días que no es un tope se rechaza al crear la partida', () => {
    // La regla vivía solo en el borde del entorno, que rechazaba un
    // `HEROES_MAX_DAYS=0` con una frase buena — mientras `newGame({maxDays: 0})`
    // se aceptaba y jugaba **un día**, acabando «sin resolver» en silencio. La
    // misma regla con dos severidades según la puerta por la que entres.
    for (const maxDays of [0, -5, 1.5, Number.NaN]) {
      expect(() => newGame({ seed: 1235, maxDays }), `maxDays=${maxDays}`).toThrow(
        /no es una partida/,
      );
    }
    // Y el suelo sí vale: una partida de un día es corta, no ilegal.
    expect(newGame({ seed: 1235, maxDays: 1 }).maxDays).toBe(1);
  });

  it('el bucle completo pasa por construir, reclutar, luchar y capturar', async () => {
    const state = newGame({ seed: 4321 });
    const c = ctx(4321);
    await playAiGame(state, c);

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
    const { winner } = await playAiGame(state, ctx(9));
    expect(state.log.some((e) => e.kind === 'town_captured')).toBe(true);

    for (const town of state.towns) {
      const bandera = state.map.objects.find((o) => o.kind === 'town' && o.id === town.id);
      expect(bandera, `${town.id} no tiene objeto en el mapa`).toBeDefined();
      expect((bandera as { owner: number | null }).owner, `${town.id} descuadrado`).toBe(
        town.owner,
      );
    }
    // Y la semilla 9 era una de las dos que no terminaban en 300 días: lo que
    // hay que exigirle es un GANADOR, no que termine — eso lo cumple ahora hasta
    // la partida que se queda sin días.
    expect(winner).not.toBeNull();
  });

  it('es determinista: misma semilla, misma partida', async () => {
    const jugar = async (semilla: number): Promise<string> => {
      const state = newGame({ seed: semilla });
      await playAiGame(state, ctx(semilla));
      return JSON.stringify(state.log);
    };
    expect(await jugar(555)).toBe(await jugar(555));
  });
});

describe('catálogo de edificios por facción', () => {
  const bolsaInfinita = 999_999;

  const pueblo = (faction: FactionId): Town =>
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

  // ----------------------------- lo que cuesta se deriva (F3, 19-10-2026)

  it('lo que cuesta y crece una unidad, y lo que cuesta su morada, salen de su índice', () => {
    // Nada se escribe por unidad ni por morada (`data/economia.json`): el oro y
    // el crecimiento, del índice de poder con el equipo puesto; la morada, del
    // nivel de lo mejor que produce.
    for (const u of unidadesDelJuego()) {
      expect(u.oro, u.id).toBe(oroDelIndice(indiceDePoder(u)));
      expect(u.growth, u.id).toBe(crecimientoDelNivel(nivelDeUnidad(u)));
    }
    for (const f of FACTION_IDS) {
      for (const b of buildingsOfFaction(f).filter((x) => x.morada !== undefined)) {
        const nivel = Math.max(...unidadesDeMorada(b.id).map((u) => nivelDeUnidad(u)));
        expect(nivelDeMorada(b), b.id).toBe(nivel);
        expect(b.cost, b.id).toEqual(ECONOMIA.costeDeLaMorada[nivel - 1]);
      }
    }
    // Y más índice cuesta más oro: el precio no baja al subir el poder.
    const porIndice = [...unidadesDelJuego()].sort((x, y) => indiceDePoder(x) - indiceDePoder(y));
    for (let i = 1; i < porIndice.length; i++) {
      expect(porIndice[i]!.oro).toBeGreaterThanOrEqual(porIndice[i - 1]!.oro);
    }
  });

  // ------------------------------------------------------------------- #46

  it('un pueblo no levanta un edificio que no existe ni uno de otra facción', () => {
    // Las mejoras de morada se fueron con las cinco facciones (19-10-2026): sus
    // ids ya no existen. El motivo se escribe para la persona, y `null` sería
    // "adelante, cobra".
    const cripta = pueblo(FACCION_B);
    expect(buildBlocker(cripta, 'mejora_que_no_existe', bolsaInfinita)).toMatch(/no existe/);
    // Y una morada de otra facción tampoco cuela.
    const ajena = buildingsOfFaction(FACCION_A).find((b) => b.morada !== undefined)!;
    expect(buildBlocker(cripta, ajena.id, bolsaInfinita)).toMatch(
      /no es un edificio de esta facción/,
    );
  });

  it('intentarlo lanza y no cuesta la construcción del día', () => {
    // El oro es un número que `build` devuelve: si lanza, no devuelve nada que
    // cobrar.
    const cripta = pueblo(FACCION_B);
    cripta.builtToday = false;

    expect(() => build(cripta, 'mejora_que_no_existe', bolsaInfinita)).toThrow(
      /no se puede construir/,
    );
    expect(cripta.builtToday).toBe(false);
    expect(cripta.buildings).not.toContain('mejora_que_no_existe');
  });

  // ------------------------------------------------------------------- #13

  it('lo que pide un edificio sin levantar no se levanta el día 1, y el motivo lo dice', () => {
    let casos = 0;
    for (const faction of FACTION_IDS) {
      const t = pueblo(faction);
      for (const b of buildingsOfFaction(faction)) {
        const falta = (b.requires ?? []).find((r) => !t.buildings.includes(r));
        if (falta === undefined) continue;
        casos++;
        expect(buildBlocker(t, b.id, bolsaInfinita), `${faction}: ${b.id}`).toBe(
          `falta construir "${building(falta).name}"`,
        );
      }
    }
    // Que haya de qué hablar: alguna morada pide otra (la Fundición, el Taller).
    expect(casos).toBeGreaterThan(0);
  });

  it('un pueblo recién fundado ya es jugable: su pueblo cría cada unidad que produce', () => {
    for (const faction of FACTION_IDS) {
      const t = pueblo(faction);
      const suPueblo = buildingsOfFaction(faction).find((b) => b.morada === 1)!;
      expect(suPueblo.prebuilt).toBe(true);
      expect(t.buildings).toContain(suPueblo.id);
      applyWeeklyGrowth(t);
      // Una fila por unidad que produce (una morada cría varias).
      const filas = dwellings(t);
      expect(filas.map((d) => d.creature)).toEqual(unidadesDeMorada(suPueblo.id).map((u) => u.id));
      for (const d of filas) {
        expect(d.edificio).toBe(suPueblo.id);
        expect(t.available[d.creature] ?? 0, d.creature).toBeGreaterThan(0);
      }
    }
  });

  it('levantar todas las moradas cuesta un día por morada, y el castillo recluta de todas', () => {
    // Uno por día, porque solo se construye un edificio diario. Si la cadena
    // del JSON cambia, este número cambia CON ella, no al revés.
    for (const faction of FACTION_IDS) {
      const t = pueblo(faction);
      // Por sitio: lo que una pide (la Fundición, el Taller) va en un sitio menor.
      const moradas = buildingsOfFaction(faction)
        .filter((b) => b.morada !== undefined && b.prebuilt !== true)
        .sort((x, y) => (x.morada as number) - (y.morada as number));
      const dias = levantar(
        t,
        moradas.map((b) => b.id),
      );
      expect(dias, `${faction}`).toBe(moradas.length);
      const todas = buildingsOfFaction(faction).filter((b) => b.morada !== undefined);
      expect(dwellings(t).map((d) => d.creature)).toEqual(
        todas
          .sort((x, y) => (x.morada as number) - (y.morada as number))
          .flatMap((b) => unidadesDeMorada(b.id).map((u) => u.id)),
      );
    }
  });

  it('cada pueblo solo ve su propio catálogo', () => {
    const castillo = pueblo('templarios');
    const cripta = pueblo('no-muertos');
    expect(availableBuildings(castillo, bolsaInfinita)).toContain('templarios_monasterio');
    expect(availableBuildings(castillo, bolsaInfinita)).not.toContain('no-muertos_mausoleo');
    expect(availableBuildings(cripta, bolsaInfinita)).toContain('no-muertos_mausoleo');
    expect(availableBuildings(cripta, bolsaInfinita)).not.toContain('templarios_monasterio');
  });

  it('con todas las moradas levantadas, la IA levanta el castillo: es lo primero de la villa', () => {
    for (const faction of FACTION_IDS) {
      const t = pueblo(faction);
      levantar(
        t,
        buildingsOfFaction(faction)
          .filter((b) => b.morada !== undefined && b.prebuilt !== true)
          .sort((x, y) => (x.morada as number) - (y.morada as number))
          .map((b) => b.id),
      );
      t.builtToday = false;
      expect(chooseBuilding(t, bolsaInfinita), faction).toBe('castle');
    }
  });

  // --------------------------------------- el orden de construcción es la lista

  it('la lista de construcción coloca cada edificio de la facción exactamente una vez', () => {
    // Es el precio de haber cambiado la cascada de constantes por una lista, y
    // el argumento de fondo para preferirla: con seis `if` encadenados, el
    // edificio que llegue mañana cae por el `return 10` del final y nadie se
    // entera; con una lista hay que colocarlo, y si no está `chooseBuilding`
    // lanza. Este test es lo que hace que ese `throw` no se alcance nunca.
    for (const faction of FACTION_IDS) {
      const orden = ordenDeConstruccion(faction);
      const catalogo = buildingsOfFaction(faction).map((b) => b.id);
      expect([...orden].sort()).toEqual([...catalogo].sort());
      expect(new Set(orden).size, `${faction}: hay un edificio repetido`).toBe(orden.length);
    }
  });

  it('el orden se deriva: las moradas primero, de más nivel a menos, y la IA levanta la mejor que puede', () => {
    // Con las cinco facciones (19-10-2026) el orden de cada raza de #88 dio paso
    // a uno derivado (`ORDEN_DE_CONSTRUCCION`): la morada de más nivel antes y, a
    // igual nivel, la del sitio más alto; detrás, la villa.
    for (const faction of FACTION_IDS) {
      const orden = ordenDeConstruccion(faction);
      const moradas = orden.filter((id) => building(id).morada !== undefined);
      expect(orden.slice(0, moradas.length), faction).toEqual(moradas);
      const clave = (id: string) => {
        const b = building(id);
        return nivelDeMorada(b) * 10 + (b.morada as number);
      };
      expect(moradas.map(clave), faction).toEqual(moradas.map(clave).sort((x, y) => y - x));
      // En un pueblo recién fundado, la primera de la lista que se puede levantar.
      const t = pueblo(faction);
      t.builtToday = false;
      expect(chooseBuilding(t, bolsaInfinita), faction).toBe(
        moradas.find((id) => buildBlocker(t, id, bolsaInfinita) === null),
      );
    }
  });
});

describe('el gremio enseña (#2)', () => {
  it('el gremio se construye jugando, y acaba en un hechizo aprendido', async () => {
    // El criterio que de verdad cierra #88: un gremio construido que no acaba
    // en un héroe que aprende algo no cierra nada. Antes de mover el gremio en
    // la lista del nigromante, `mage_guild_1` salía en 10 de las 200 semillas
    // del banco y `syncSpellbooks` enseñaba 15 hechizos en 3 partidas; ahora,
    // 206 gremios en 200 de 200 y 965 hechizos en 177. Con las cinco facciones
    // (19-10-2026) el gremio va detrás de todas las moradas y el castillo, y las
    // partidas duran la mitad: 8 gremios y 8 hechizos aprendidos en 1-40, en 7
    // semillas (la 3 y la 8 de las diez primeras). Con el héroe nacido en su base
    // y el recinto de las ciudades (fusión, 21-10-2026), 3 gremios y 2 hechizos en
    // 1-40, en la 17 (los dos hechizos), la 19 y la 26: se juegan la 17 y la 19.
    // Sin minas y con todo en oro (21-10-2026, «solo oro»), 2 gremios y 2
    // hechizos en 1-40, los dos en la 35: se juega la 35. Con el héroe de salida
    // pagado (22-10-2026, 2 500 menos el día 1), ninguno en 1-40 y 12 gremios y 16
    // hechizos en 41-200, en 11 semillas: se jugaba la 54 (uno y dos). Con la
    // fuerza y la agilidad (25-10-2026), 11 gremios en 1-120 y hechizos en 7 de
    // ellos: se jugaba la 5 (uno y dos). Con dos armas y la lanza en la segunda
    // mano (25-10-2026), 6 gremios en 1-60 y hechizos en 4: se jugaba la 29 (uno y
    // dos). Sin defender ni esperar (26-10-2026), 9 gremios en 1-80 y hechizos en 5
    // de ellos: se jugaba la 15 (uno y dos). Con la montura y el héroe en la marcha
    // del grupo (26-10-2026), 7 gremios en 1-80 y hechizos en 5 de ellos: se jugaba
    // la 21 (uno y dos). Con la escala baja (26-10-2026), 8 gremios en 1-80 y
    // hechizos en 6 de ellos: se jugaba la 5 (uno y dos). Con el peso que resta 1
    // por cada fuerza, o parte, que pasa (31-10-2026), 2 gremios en 1-80 y hechizos
    // en uno: se juega la 28 (uno y dos).
    let gremios = 0;
    let aprendidos = 0;
    for (const semilla of [28]) {
      const state = newGame({ seed: semilla });
      await playAiGame(state, { rng: createRng(semilla) });
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
    const castillo = createTown('t-magia', 'Prueba', 'templarios', { x: 0, y: 0 }, 0);
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
    hero.army = ejercito({ creature: PESADA, count: 5 });
    hero.mana = maxMana(hero);
    const antes = hero.mana;
    // Zombis y no lo que hubiera: con la tropa de individuos la flecha mágica
    // vale lo que le quede de vida a UNO, y contra un esqueleto de 4 PV no
    // llega al umbral de `VALOR_MINIMO_POR_MANA` y la IA no la lanza. Un zombi
    // tiene 15.
    ponerMonstruo(state, 'zombi', 4);

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

describe('los personajes y sus heridas', () => {
  /**
   * Un guerrero de 34 PV en el primer slot del héroe, dado de alta en la partida,
   * con una espada: sin arma no se combate (la rueda va con la del arma,
   * 19-10-2026), y un personaje no lleva equipo de serie.
   */
  function alistar(state: GameState, hero: Hero, id = 'aren'): Character {
    const c = createCharacter(id, { ...defaultBuild, profession: 'Guerrero' });
    state.characters = { ...(state.characters ?? {}), [id]: c };
    const veterania = {
      id: `v-${id}`,
      experiencia: 0,
      batallas: 0,
      bajas: 0,
      heroes: [],
      equipo: { arma: 'espada' },
    };
    hero.army = ejercito({ creature: CHARACTER_BODY, count: 1, member: id, veterania });
    return c;
  }

  it('una partida de estrategia no tiene personajes', () => {
    const state = newGame({ seed: 5 });
    expect('characters' in state).toBe(false);
  });

  it('el personaje que gana vuelve con los PV que le quedaron, no con el máximo', () => {
    const state = newGame({ seed: 32 });
    const c = ctx(32);
    const hero = heroesOf(state, 0)[0]!;
    alistar(state, hero);
    // Sin maná: con él, la flecha mágica del héroe mata a los zombis antes de
    // que lleguen a tocarlo, y el personaje volvería sano sin probar nada.
    hero.mana = 0;
    ponerMonstruo(state, 'zombi', 2);
    forzarBatalla(state, c, hero);
    const final = state.pendingBattle!.battle;

    expect(resolvePendingBattle(state, c).winner).toBe('attacker');
    const s = final.stacks.find(esPersonaje('aren'))!;
    const aren = state.characters!.aren!;
    expect(aren.hp).toBe(s.topHp);
    // El zombi contraatacó: sale herido, y con eso el test prueba algo.
    expect(aren.hp).toBeLessThan(340);
    expect(aren.hp).toBeGreaterThan(0);
    // Y sigue en el ejército, con su `member`: no vuelve como un stack anónimo.
    // Y con la experiencia de lo que pegó: el personaje también es un individuo
    // que hace campaña.
    const vuelto = heroById(state, hero.id).army[0]!;
    expect(vuelto).toMatchObject({ creature: CHARACTER_BODY, member: 'aren' });
    expect(vuelto.veterania?.experiencia).toBe(s.ganado.experiencia);
  });

  it('herido, entra a la siguiente batalla con lo que le quedó', () => {
    const state = newGame({ seed: 31 });
    const c = ctx(31);
    const hero = heroesOf(state, 0)[0]!;
    alistar(state, hero);
    state.characters!.aren!.hp = 9;
    ponerMonstruo(state, TROPA_BARATA, 1);
    forzarBatalla(state, c, hero);
    expect(state.pendingBattle!.battle.stacks.find(esPersonaje('aren'))!.topHp).toBe(9);
  });

  it('el personaje que cae queda a 0 PV y sale del ejército, pero no de la partida', () => {
    // La semilla, una en la que cae (19-10-2026: con la rueda, la 32 lo dejaba en pie).
    const state = newGame({ seed: 33 });
    const c = ctx(33);
    const hero = heroesOf(state, 0)[0]!;
    alistar(state, hero);
    // Llega con 1 PV y sin la flecha mágica del héroe, y lleva un compañero que
    // no cae, para que el héroe gane y conserve su ejército: si perdiera,
    // volvería a la base sin él y no habría ejército que mirar.
    state.characters!.aren!.hp = 1;
    hero.mana = 0;
    hero.army = [...hero.army, ...ejercito({ creature: PESADA, count: 1 })];
    ponerMonstruo(state, NO_MUERTO, 4);
    forzarBatalla(state, c, hero);
    const final = state.pendingBattle!.battle;
    // Que caiga lo decide el tablero; el test comprueba lo que se escribe
    // DESPUÉS, así que exige que de verdad cayera.
    expect(resolvePendingBattle(state, c).winner).toBe('attacker');
    expect(final.stacks.find(esPersonaje('aren'))!.count).toBe(0);

    expect(state.characters!.aren!.hp).toBe(0);
    const vivo = heroById(state, hero.id);
    expect(vivo.army.some((s) => s?.member === 'aren')).toBe(false);
    // Y el compañero, en su sitio: la lista se queda densa, sin hueco.
    expect(vivo.army.length).toBeGreaterThan(0);
    expect(vivo.army.every((s) => s.creature === PESADA)).toBe(true);
  });

  it('las heridas se escriben también en el bando que defiende, aunque su héroe caiga', () => {
    // La semilla, una en la que el atacante gana y la hiere (19-10-2026: con la
    // rueda, en la 41 ganaba el defensor).
    const state = newGame({ seed: 57 });
    const c = ctx(57);
    const atacante = heroesOf(state, 0)[0]!;
    const defensor = heroesOf(state, 1)[0]!;
    alistar(state, defensor, 'bera');
    // Sin base: no puede rendirse —salvar solo a un personaje cuesta 0 de oro,
    // así que el oro no lo impediría— y, si cae, sale del mapa en vez de volver.
    (state.players[1] as { base: string | null }).base = null;

    atacante.army = ejercito({ creature: PESADA, count: 6 });
    atacante.movePoints = 5000;
    defensor.at = casillaVecinaLibre(state, atacante.at);

    applyAdventureAction(state, { type: 'move_hero', hero: atacante.id, to: defensor.at }, c, 0);
    const final = state.pendingBattle!.battle;
    expect(final.stacks.some(esPersonaje('bera'))).toBe(true);
    expect(resolvePendingBattle(state, c).winner).toBe('attacker');
    // El héroe que lo llevaba ya no está en el mapa; el personaje sí está en la
    // partida, con su herida escrita: 0 si cayó, o lo que le quedara si la
    // batalla acabó antes al caer el héroe (fase 1b).
    expect(state.heroes.some((h) => h.id === defensor.id)).toBe(false);
    const s = final.stacks.find(esPersonaje('bera'))!;
    expect(state.characters!.bera!.hp).toBe(stackHp(s));
    expect(state.characters!.bera!.hp).toBeLessThan(s.unit.hp);
  });

  it('el defensor con personaje que GANA lo conserva en el ejército, con sus PV escritos', () => {
    // Es otro camino que el del atacante —`applyDefenderSurvivors` y
    // `restoreHeroFromBattle`— y es donde ya se olvidó una línea una vez (el
    // maná). Seis ballesteros contra el personaje y cinco caballeros de la
    // muerte: el defensor gana, y al personaje lo hieren (los ballesteros, que
    // apuntan, o el cuerpo a cuerpo).
    // La semilla, una en la que la hieren y no la matan (19-10-2026: con la rueda,
    // en la 41 salía sana; 25-10-2026: con la fuerza y la agilidad, en la 57 moría; con el disparo diferido, en la 41 salía sana).
    const state = newGame({ seed: 42 });
    const c = ctx(42);
    const atacante = heroesOf(state, 0)[0]!;
    const defensor = heroesOf(state, 1)[0]!;
    alistar(state, defensor, 'bera');
    defensor.army = [
      ...defensor.army,
      ...ejercito({ creature: 'caballero-de-la-muerte', count: 5 }),
    ];
    // Sin oro no hay rendición: la batalla se pelea hasta el final.
    state.players[0]!.oro = 0;

    atacante.army = ejercito({ creature: 'imperio-ballestero', count: 6 });
    // Sin maná: la flecha mágica del héroe va a por el personaje —es el único
    // individuo del bando con vida para que valga la pena— y lo mataría.
    atacante.mana = 0;
    atacante.movePoints = 5000;
    defensor.at = casillaVecinaLibre(state, atacante.at);

    applyAdventureAction(state, { type: 'move_hero', hero: atacante.id, to: defensor.at }, c, 0);
    const final = state.pendingBattle!.battle;
    expect(resolvePendingBattle(state, c).winner).toBe('defender');

    const s = final.stacks.find(esPersonaje('bera'))!;
    const bera = state.characters!.bera!;
    expect(bera.hp).toBe(s.topHp);
    // Si saliera sano el test no distinguiría «escrito» de «no tocado».
    expect(bera.hp).toBeLessThan(s.unit.hp);
    expect(bera.hp).toBeGreaterThan(0);
    expect(heroById(state, defensor.id).army[0]).toMatchObject({
      creature: CHARACTER_BODY,
      member: 'bera',
    });
  });

  it('un ejército que nombra a un personaje que la partida no conoce lanza al entrar en batalla', () => {
    const state = newGame({ seed: 31 });
    const c = ctx(31);
    const hero = heroesOf(state, 0)[0]!;
    hero.army = ejercito({ creature: CHARACTER_BODY, count: 1, member: 'nadie' });
    expect(() => forzarBatalla(state, c, hero)).toThrow(
      /lleva en el ejército al personaje "nadie", pero la partida no lo conoce/,
    );
  });
});

// ---------------------------------------------------------------- mapa de nodos

/** Una partida sobre el mapa de nodos escrito a mano (`planDeNodos`). */
/**
 * La partida de `planDeNodos`, con los héroes fuera de su base, en (3,4) y
 * (24,4): donde empezaban antes de nacer dentro (19-10-2026), fuera del
 * recinto de su ciudad. Estas pruebas
 * miden la red —cruzar nodos, recoger la guarnición al pasar, la renta— con
 * esas casillas en sus cuentas, no por dónde se sale.
 */
function enLaRed(): { state: GameState; c: GameContext } {
  const state = newGame({ seed: 1, plan: planDeNodos() });
  // Fuera de su base: los héroes nacen dentro. A dos casillas al oeste y al
  // este de su ciudad, fuera del recinto (`recinto.ts`).
  heroById(state, 'hero-0').at = { x: 3, y: 4 };
  heroById(state, 'hero-1').at = { x: 24, y: 4 };
  return { state, c: ctx(1) };
}

function nodo(state: GameState, id: string): Extract<MapObject, { kind: 'node' }> {
  const o = state.map.objects.find((x) => x.kind === 'node' && x.id === id);
  if (o === undefined || o.kind !== 'node') throw new Error(`no hay nodo ${id}`);
  return o;
}

/**
 * Le da una ciudad a un jugador escribiendo LAS DOS caras —el libro de cuentas
 * y la bandera—, que es lo que hace `captureTown`: en un test, saltarse una
 * sería montar a mano el bug de #47.
 */
function darCiudad(state: GameState, id: string, jugador: number): void {
  const town = state.towns.find((t) => t.id === id)!;
  town.owner = jugador;
  const bandera = state.map.objects.find((o) => o.kind === 'town' && o.id === id)!;
  (bandera as { owner: number | null }).owner = jugador;
}

/** Lo que cobra el jugador 0 al empezar su turno siguiente. */
describe('el mapa de nodos se juega', () => {
  it('cruzar un nodo ajeno lo hace mío y lo cuenta; pasar por casa recoge la guarnición', () => {
    const { state, c } = enLaRed();
    const base = state.towns.find((t) => t.id === 'town-0')!;
    // Zombis: lentos. Si entrar en la tropa recortara los puntos del día, la
    // marcha se quedaría sin puntos a mitad de camino y `moveHero` lanzaría.
    base.garrison = ejercito({ creature: 'zombi', count: 1 });
    const hero = heroById(state, 'hero-0');
    const tropa = hero.army.length;
    hero.movePoints = 1500;
    // De (3,4) a (12,2): se cruza la base (5,4), por sus puertas del noroeste y
    // del noreste, y el paso de arriba (11,2).
    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: { x: 12, y: 2 } }, c, 0);

    expect(hero.at).toEqual({ x: 12, y: 2 });
    expect(nodo(state, 'node-1').owner).toBe(0);
    expect(
      state.log.filter((e) => e.kind === 'node_captured').map((e) => [e.node, e.from, e.actor]),
    ).toEqual([['node-1', null, 0]]);
    // La tropa de casa se recoge al PASAR: los puntos del día ya están fijados.
    expect(base.garrison).toHaveLength(0);
    expect(hero.army).toHaveLength(tropa + 1);
    const gastado = state.log
      .filter((e) => e.kind === 'hero_moved')
      .reduce((t, e) => t + e.spent, 0);
    expect(hero.movePoints).toBe(1500 - gastado);
  });

  it('reclutar con el héroe dentro no le recorta los puntos de hoy: cuenta desde mañana', () => {
    const { state, c } = enLaRed();
    const hero = heroById(state, 'hero-0');
    const base = state.towns.find((t) => t.id === 'town-0')!;
    hero.at = base.at;
    hero.movePoints = 1500;
    // Lo primero que cría la base, en la morada que trae hecha.
    const recluta = dwellings(base)[0]!.creature;
    const lento = maxMovePoints(
      { ...hero, army: [...hero.army, ...ejercito({ creature: recluta, count: 1 })] },
      state.characters,
    );
    base.available = { ...base.available, [recluta]: 5 };
    applyAdventureAction(
      state,
      { type: 'recruit', town: base.id, creature: recluta, count: 1 },
      c,
      0,
    );
    expect(hero.army.some((t) => t.creature === recluta)).toBe(true);
    expect(hero.movePoints).toBe(1500);
    // Y al día siguiente manda la criatura más lenta.
    hastaSuSiguienteTurno(state, c, 0);
    expect(hero.movePoints).toBe(lento);
  });

  it('una marcha de varios días anda lo que le da el día y no lanza (#121)', () => {
    const { state, c } = enLaRed();
    const hero = heroById(state, 'hero-0');
    hero.at = { x: 9, y: 2 };
    const destino = { x: 13, y: 2 };
    const camino = caminoHasta(state, hero, destino);
    if (camino === null || camino.length < 3) throw new Error('hace falta un camino de 3 pasos');
    // Le alcanza para dos pasos y no para el tercero.
    const puntos = (camino[1]!.cost + camino[2]!.cost) >> 1;
    hero.movePoints = puntos;
    expect(puntos).toBeGreaterThanOrEqual(camino[1]!.cost);
    expect(puntos).toBeLessThan(camino[2]!.cost);
    const antes = state.log.length;

    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: destino }, c, 0);

    expect(hero.at).toEqual(camino[1]!.at);
    // Lo que sobra no paga el paso siguiente.
    expect(hero.movePoints).toBe(puntos - camino[1]!.cost);
    expect(hero.movePoints).toBeLessThan(camino[2]!.cost - camino[1]!.cost);
    const pasos = state.log.slice(antes).filter((e) => e.kind === 'hero_moved');
    expect(pasos.map((e) => (e as { to: unknown }).to)).toEqual([camino[0]!.at, camino[1]!.at]);
    // El núcleo dice que se cortó, dónde y cuánto faltaba del camino de salida:
    // de (9,2) a (13,2) son 4 pasos en línea y se dieron 2.
    expect(camino.length).toBe(4);
    expect(state.log.at(-1)).toMatchObject({
      kind: 'march_cut',
      hero: hero.id,
      faltan: 2,
      actor: 0,
      at: camino[1]!.at,
    });
  });

  it('una marcha que llega entera no dice que se cortó (#121)', () => {
    const { state, c } = enLaRed();
    const hero = heroById(state, 'hero-0');
    hero.at = { x: 9, y: 2 };
    const antes = state.log.length;
    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: { x: 13, y: 2 } }, c, 0);
    expect(hero.at).toEqual({ x: 13, y: 2 });
    expect(state.log.slice(antes).some((e) => e.kind === 'march_cut')).toBe(false);
  });

  it('una marcha que no puede dar ni un paso sí lanza, diciéndolo, y no mueve (#121)', () => {
    const { state, c } = enLaRed();
    const hero = heroById(state, 'hero-0');
    hero.at = { x: 9, y: 2 };
    hero.movePoints = 0;
    const antes = state.log.length;
    expect(() =>
      applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: { x: 13, y: 2 } }, c, 0),
    ).toThrow('no quedan puntos de movimiento para dar ni un paso');
    expect(hero.at).toEqual({ x: 9, y: 2 });
    expect(state.log.length).toBe(antes);
  });

  it('un héroe enemigo en un paso se rodea por el otro, sin batalla', () => {
    // Lo hostil se alcanza pero no se cruza, en el camino de TODOS: la persona
    // y el agente mueven por `move_hero` sin alcance, y eso es `caminoHasta`.
    const { state, c } = enLaRed();
    const hero = heroById(state, 'hero-0');
    const rival = heroById(state, 'hero-1');
    rival.at = { x: 11, y: 2 }; // node-1, el paso de arriba entre B y C
    hero.at = { x: 9, y: 2 };
    hero.movePoints = 9000;
    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: { x: 13, y: 2 } }, c, 0);
    expect(state.pendingBattle).toBeNull();
    expect(hero.at).toEqual({ x: 13, y: 2 });
    // Se ha ido por node-2, el de abajo.
    expect(nodo(state, 'node-2').owner).toBe(0);
    expect(nodo(state, 'node-1').owner).toBeNull();
    // Y si el rival ES el destino, se llega y hay batalla.
    hero.at = { x: 10, y: 2 };
    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: rival.at }, c, 0);
    expect(state.pendingBattle?.foe).toEqual({ kind: 'hero', heroId: rival.id });
  });

  it('sin camino, el rechazo dice QUÉ lo cierra: la ciudad guarnecida o el héroe rival (M2)', () => {
    // El camino existe a la vista; «no hay camino hasta (19,4)» a secas era
    // falso para quien lo leía.
    const { state, c } = enLaRed();
    const hero = heroById(state, 'hero-0');
    hero.movePoints = 9000;
    const mover = (to: { x: number; y: number }) => () =>
      applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to }, c, 0);

    // De C a D solo se pasa por Torreblanca, neutral y guarnecida.
    hero.at = { x: 14, y: 4 };
    expect(mover({ x: 19, y: 4 })).toThrow(
      'no hay camino hasta (19,4): lo cierra la ciudad Torreblanca, con guarnición, en (17,4)',
    );

    // De B a C hay dos pasos: con un rival en cada uno, los dos lo cierran.
    const rival = heroById(state, 'hero-1');
    rival.at = { x: 11, y: 2 };
    state.heroes.push({ ...rival, id: 'hero-9', name: 'Otro Rival', at: { x: 11, y: 6 } });
    hero.at = { x: 8, y: 4 };
    expect(mover({ x: 14, y: 4 })).toThrow(
      `no hay camino hasta (14,4): lo cierran el héroe rival ${rival.name} en (11,2) y el héroe rival Otro Rival en (11,6)`,
    );

    // Y si lo cierra el mapa, no se culpa a nadie: la cordillera no es un rival.
    expect(mover({ x: 11, y: 0 })).toThrow(/^no hay camino hasta \(11,0\)$/);
  });

  it('una ciudad neutral nace con la guarnición de los datos y se toma peleando', () => {
    const { state, c } = enLaRed();
    const neutral = state.towns.find((t) => t.id === 'town-2')!;
    const esperada = guarnicionNeutral('templarios').flatMap((g) =>
      Array.from({ length: g.count }, () => g.creature),
    );
    expect(neutral.owner).toBeNull();
    expect(neutral.garrison.map((t) => t.creature)).toEqual(esperada);

    const hero = heroById(state, 'hero-0');
    hero.at = { x: 15, y: 4 };
    hero.movePoints = 9000;
    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: neutral.at }, c, 0);
    expect(state.pendingBattle?.foe).toEqual({ kind: 'town', townId: 'town-2' });
  });

  it('la base nace con la guarnición de los datos, de la facción de su dueño, y se asalta peleando', () => {
    // Decisión del usuario: con «perder la base elimina», una base vacía hacía
    // de cada partida una carrera. Cada una nace con la de `guarnicionBase`.
    const { state, c } = enLaRed();
    const individuos = (f: FactionId) =>
      guarnicionDeBase(f).flatMap((g) => Array.from({ length: g.count }, () => g.creature));
    for (const p of state.players) {
      const base = baseOf(state, p.id)!;
      expect(base.faction).toBe(p.faction);
      expect(base.garrison.map((t) => t.creature)).toEqual(individuos(p.faction));
    }
    expect(individuos('templarios')).not.toEqual(individuos('no-muertos'));

    // Y entrar en la del rival ya no es tomarla: es batalla contra esa tropa.
    state.current = 1;
    const suyo = heroById(state, 'hero-1');
    // En la puerta del noreste de Valdeluz: su muralla no se pisa (`recinto.ts`).
    suyo.at = { x: 6, y: 3 };
    suyo.movePoints = 9000;
    applyAdventureAction(state, { type: 'move_hero', hero: suyo.id, to: { x: 5, y: 4 } }, c, 1);
    expect(state.pendingBattle?.foe).toEqual({ kind: 'town', townId: 'town-0' });
    expect(state.towns.find((t) => t.id === 'town-0')!.owner).toBe(0);
    expect(state.players[0]!.defeated).toBe(false);
  });

  it('solo la base nace guarnecida, y la base es la primera ciudad de su dueño en el plan', () => {
    // La misma regla que apunta `Player.base` es la que guarnece
    // (`primeraCiudadDe`): con el orden del plan al revés cambian las dos a la
    // vez, en vez de guarnecer una ciudad y declarar base la otra.
    const plan = planDeNodos();
    const mia = plan.towns.map((t) => (t.id === 'town-2' ? { ...t, owner: 0 } : t));
    const tamaño = guarnicionDeBase('templarios').reduce((n, g) => n + g.count, 0);

    const enOrden = newGame({ seed: 1, plan: { ...plan, towns: mia } });
    expect(enOrden.players[0]!.base).toBe('town-0');
    expect(enOrden.towns.find((t) => t.id === 'town-0')!.garrison).toHaveLength(tamaño);
    expect(enOrden.towns.find((t) => t.id === 'town-2')!.garrison).toEqual([]);

    const otra = mia.find((t) => t.id === 'town-2')!;
    const alReves = newGame({
      seed: 1,
      plan: { ...plan, towns: [otra, ...mia.filter((t) => t !== otra)] },
    });
    expect(alReves.players[0]!.base).toBe('town-2');
    expect(alReves.towns.find((t) => t.id === 'town-2')!.garrison).toHaveLength(tamaño);
    expect(alReves.towns.find((t) => t.id === 'town-0')!.garrison).toEqual([]);
  });

  it('la base nace llena: sin el héroe dentro no se recluta, y el rechazo lo dice', () => {
    // La guarnición de salida llena el cupo o el tope de liderazgo de una
    // guarnición (de 15 a 20 de liderazgo y de 5 a 7 individuos según la
    // facción, `data/ciudades.json`): lo que su pueblo cría ya no cabe. El héroe
    // empieza dentro (19-10-2026) y recluta en su tropa; aquí se le saca para
    // ver que sin él no cabe nada.
    const state = newGame({ seed: 41 });
    const base = baseOf(state, 0)!;
    expect(heroesOf(state, 0).some((h) => pointKey(h.at) === pointKey(base.at))).toBe(true);
    fueraDeSuBase(state, 0);
    expect(heroesOf(state, 0).some((h) => pointKey(h.at) === pointKey(base.at))).toBe(false);
    const recluta = dwellings(base)[0]!.creature;
    base.available[recluta] = 10;
    const motivo = troopBlocker(
      base.garrison,
      GARRISON_LEADERSHIP,
      CUPO_GUARNICION,
      recluta,
      1,
      'la guarnición',
    );
    expect(motivo).toMatch(/^no cabe: la guarnición /);
    expect(() =>
      applyAdventureAction(
        state,
        { type: 'recruit', town: base.id, creature: recluta, count: 1 },
        ctx(41),
        0,
      ),
    ).toThrow(`no se puede reclutar: ${motivo}`);
  });

  it('una ciudad vacía se toma entrando, con las dos caras a la vez', () => {
    const { state, c } = enLaRed();
    const neutral = state.towns.find((t) => t.id === 'town-2')!;
    neutral.garrison = [];
    const hero = heroById(state, 'hero-0');
    hero.at = { x: 15, y: 4 };
    hero.movePoints = 9000;
    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: neutral.at }, c, 0);
    expect(neutral.owner).toBe(0);
    const bandera = state.map.objects.find((o) => o.id === 'town-2') as { owner: number | null };
    expect(bandera.owner).toBe(0);
  });

  it('una región es del dueño común de TODOS sus nodos, ciudades incluidas', () => {
    const { state } = enLaRed();
    // A la cierran la base y node-0: con la base sola, no es de nadie.
    expect(regionOwner(state, 'a')).toBeNull();
    nodo(state, 'node-0').owner = 0;
    expect(regionOwner(state, 'a')).toBe(0);
    // B tiene cuatro: la base, node-0 y los dos del medio. Con tres, nada.
    nodo(state, 'node-1').owner = 0;
    expect(regionOwner(state, 'b')).toBeNull();
    nodo(state, 'node-2').owner = 0;
    expect(regionOwner(state, 'b')).toBe(0);
    // Y uno del rival la abre: no hay dueño común.
    nodo(state, 'node-2').owner = 1;
    expect(regionOwner(state, 'b')).toBeNull();
    // Una ciudad cuenta como nodo: C es de quien tenga node-1, node-2 y town-2.
    nodo(state, 'node-2').owner = 0;
    expect(regionOwner(state, 'c')).toBeNull();
    darCiudad(state, 'town-2', 0);
    expect(regionOwner(state, 'c')).toBe(0);
  });

  it('lo que la IA cree que cierra un nodo es lo que la regla da por región tuya', () => {
    // `regionesQueCierra` pregunta a la MISMA regla que `regionOwner`, como si el
    // nodo ya fuera suyo: si reescribiera la regla, las dos podrían divergir.
    const { state } = enLaRed();
    // node-0 cierra A (la base ya es mía), y no B: le faltan node-1 y node-2.
    const cierra = (jugador: number) =>
      regionesQueCierra(territorio(state), 'node-0', jugador).map(
        (r) => territorio(state).red.regiones[r]!.id,
      );
    expect(cierra(0)).toEqual(['a']);
    expect(cierra(1)).toEqual([]);
    nodo(state, 'node-1').owner = 0;
    nodo(state, 'node-2').owner = 0;
    expect(cierra(0).sort()).toEqual(['a', 'b']);
    // Y lo que dice se cumple al tomarlo.
    nodo(state, 'node-0').owner = 0;
    expect([regionOwner(state, 'a'), regionOwner(state, 'b')]).toEqual([0, 0]);
    // Un nodo del rival en la región la deja abierta.
    nodo(state, 'node-0').owner = null;
    nodo(state, 'node-2').owner = 1;
    expect(cierra(0)).toEqual(['a']);
  });

  it('conectado a la base es una cadena de regiones y nodos propios; cortar un nodo lo corta todo detrás', () => {
    const { state } = enLaRed();
    nodo(state, 'node-1').owner = 0;
    nodo(state, 'node-2').owner = 0;
    darCiudad(state, 'town-2', 0);
    // C cerrada y mía, pero desconectada: B no es mía (falta node-0).
    expect(regionOwner(state, 'c')).toBe(0);
    expect(conectadoABase(state, 0, { region: 'c' })).toBe(false);
    expect(conectadoABase(state, 0, { nodo: 'town-2' })).toBe(false);
    expect(conectadoABase(state, 0, { nodo: 'town-0' })).toBe(true);

    nodo(state, 'node-0').owner = 0;
    expect(conectadoABase(state, 0, { region: 'b' })).toBe(true);
    expect(conectadoABase(state, 0, { region: 'c' })).toBe(true);
    expect(conectadoABase(state, 0, { nodo: 'town-2' })).toBe(true);

    // El rival corta node-2: B y C dejan de ser mías, y la ciudad de detrás se
    // queda aislada sin haber cambiado de dueño.
    nodo(state, 'node-2').owner = 1;
    expect(conectadoABase(state, 0, { region: 'a' })).toBe(true);
    expect(conectadoABase(state, 0, { region: 'b' })).toBe(false);
    expect(conectadoABase(state, 0, { region: 'c' })).toBe(false);
    expect(conectadoABase(state, 0, { nodo: 'town-2' })).toBe(false);
    expect(state.towns.find((t) => t.id === 'town-2')!.owner).toBe(0);
  });

  it('perder la base elimina en el acto, aunque queden héroes y ciudades', () => {
    // Decisión del usuario tras la 2a: «se gana tomando las bases rivales». El
    // 0 conserva su héroe y una ciudad, y aun así cae al perder la base.
    const { state, c } = enLaRed();
    // Vacía: se mide qué pasa al perderla, no el asalto a su guarnición.
    sinGuarnicionDeSalida(state);
    darCiudad(state, 'town-2', 0);
    expect(heroesOf(state, 0)).toHaveLength(1);
    state.current = 1;
    const suyo = heroById(state, 'hero-1');
    // En la puerta del noreste de Valdeluz: su muralla no se pisa (`recinto.ts`).
    suyo.at = { x: 6, y: 3 };
    suyo.movePoints = 9000;
    applyAdventureAction(state, { type: 'move_hero', hero: suyo.id, to: { x: 5, y: 4 } }, c, 1);
    expect(state.towns.find((t) => t.id === 'town-0')!.owner).toBe(1);
    expect(townsOf(state, 0).map((t) => t.id)).toEqual(['town-2']);
    expect(heroesOf(state, 0)).toHaveLength(1);
    expect(state.players[0]!.defeated).toBe(true);
    expect(state.finished).toEqual({ winner: 1 });
    expect(state.log.at(-1)?.kind).toBe('game_over');
    // Y el hecho dice por qué: el cliente lo cuenta leyéndolo, no suponiéndolo
    // (I1 de la 2a: decía «no te quedan castillos ni héroes» con este héroe vivo).
    expect(state.log.filter((e) => e.kind === 'player_defeated')).toEqual([
      expect.objectContaining({ actor: 0, reason: 'lost_base' }),
    ]);
  });

  it('quien no tuvo nunca base cae al quedarse sin nada, y el hecho lo dice así', () => {
    const { state, c } = enLaRed();
    sinGuarnicionDeSalida(state);
    (state.players[0] as { base: string | null }).base = null;
    state.heroes = state.heroes.filter((h) => h.owner !== 0);
    state.current = 1;
    const suyo = heroById(state, 'hero-1');
    // En la puerta del noreste de Valdeluz: su muralla no se pisa (`recinto.ts`).
    suyo.at = { x: 6, y: 3 };
    suyo.movePoints = 9000;
    applyAdventureAction(state, { type: 'move_hero', hero: suyo.id, to: { x: 5, y: 4 } }, c, 1);
    expect(state.finished).toEqual({ winner: 1 });
    expect(state.log.filter((e) => e.kind === 'player_defeated')).toEqual([
      expect.objectContaining({ actor: 0, reason: 'nothing_left' }),
    ]);
  });

  it('escribir un hecho después del final lanza: game_over es el último por regla del núcleo', () => {
    // Los bucles ya no llegan aquí (`return` tras el final); esto es el candado
    // por si uno nuevo se olvida. Se fuerza a mano: una batalla abierta sobre
    // una partida que ya acabó.
    const { state, c } = enLaRed();
    const hero = heroById(state, 'hero-0');
    hero.at = { x: 15, y: 4 };
    hero.movePoints = 9000;
    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: { x: 17, y: 4 } }, c, 0);
    expect(state.pendingBattle).not.toBeNull();
    state.finished = { winner: 0 };
    expect(() => resolvePendingBattle(state, c)).toThrow(
      'la partida ya ha terminado y se iba a escribir "battle_ended" después del final',
    );
  });

  it('con el héroe del dueño dentro, defiende SOLO él con su tropa, y si cae, cae la base (regla del usuario, I2)', () => {
    // Regla DECIDIDA, no un olvido: «Solo el heroe con su tropa, es la batalla
    // final (si pierde)». QA la señaló como fallo —la guarnición inicial se
    // queda fuera justo cuando el dueño vuelve a casa— y el usuario la
    // confirmó. Este test existe para que nadie la «arregle» sumando la
    // guarnición al bando del héroe: si eso cambia, es otra decisión suya.
    const { state, c } = enLaRed();
    const base = state.towns.find((t) => t.id === 'town-0')!;
    const guarnicion = base.garrison.map((g) => g.creature);
    expect(guarnicion.length).toBeGreaterThan(0);
    const mio = heroById(state, 'hero-0');
    mio.at = { ...base.at };
    mio.army = [];
    state.current = 1;
    const suyo = heroById(state, 'hero-1');
    // Cinco con mandoble: con dos esqueletos, el héroe solo los paraba (19-10-2026,
    // la rueda y su Espada).
    suyo.army = ejercito({ creature: PESADA, count: 5 });
    // En la puerta del noreste: la muralla no se pisa (`recinto.ts`).
    suyo.at = { x: base.at.x + 1, y: base.at.y - 1 };
    suyo.movePoints = 9000;
    applyAdventureAction(state, { type: 'move_hero', hero: suyo.id, to: base.at }, c, 1);

    // Contra el héroe, no contra la ciudad: el héroe va antes en `enemyAt`.
    expect(state.pendingBattle?.foe).toEqual({ kind: 'hero', heroId: 'hero-0' });
    const defensores = state.pendingBattle!.battle.stacks.filter((st) => st.side === 'defender');
    // Uno: el héroe solo, sin tropa, y ninguno de la guarnición en el tablero.
    expect(defensores.map((st) => st.origen.kind)).toEqual(['heroe']);
    expect(defensores.some((st) => guarnicion.includes(queEs(st)))).toBe(false);

    expect(resolvePendingBattle(state, c).winner).toBe('attacker');
    // Era la batalla final: la base cae sin que la guarnición llegue a pelear,
    // `captureTown` se la lleva, y perder la base elimina.
    expect(base.owner).toBe(1);
    expect(base.garrison).toEqual([]);
    expect(state.players[0]!.defeated).toBe(true);
    expect(state.finished).toEqual({ winner: 1 });
  });

  it('perder otra ciudad que no es la base no elimina', () => {
    const { state, c } = enLaRed();
    darCiudad(state, 'town-2', 0);
    state.towns.find((t) => t.id === 'town-2')!.garrison = [];
    state.current = 1;
    const suyo = heroById(state, 'hero-1');
    // En la puerta del noreste de Torreblanca: su muralla no se pisa.
    suyo.at = { x: 18, y: 3 };
    suyo.movePoints = 9000;
    applyAdventureAction(state, { type: 'move_hero', hero: suyo.id, to: { x: 17, y: 4 } }, c, 1);
    expect(state.towns.find((t) => t.id === 'town-2')!.owner).toBe(1);
    expect(state.players[0]!.defeated).toBe(false);
    expect(state.finished).toBeNull();
  });

  it('tomar de camino la base del rival acaba la partida, y el héroe se para ahí', () => {
    // Desde que el castillo no bloquea, la captura puede ser a MITAD de una
    // marcha. Sin cortar la marcha, el héroe seguía andando y dejaba
    // `hero_moved` debajo del `game_over`, que tiene que ser el último hecho.
    const { state, c } = enLaRed();
    state.heroes = state.heroes.filter((h) => h.owner !== 1);
    state.towns.find((t) => t.id === 'town-1')!.garrison = [];
    const hero = heroById(state, 'hero-0');
    // Delante de la puerta del noroeste de Cripta Gris: por ella entra, y de la
    // ciudad sale por la del noreste hacia (24,4).
    hero.at = { x: 20, y: 3 };
    hero.movePoints = 9000;
    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: { x: 24, y: 4 } }, c, 0);
    expect(state.finished).toEqual({ winner: 0 });
    expect(hero.at).toEqual({ x: 22, y: 4 });
    expect(state.log.at(-1)?.kind).toBe('game_over');
  });

  it('la IA no elige un objetivo que está detrás de una guarnición que no puede vencer', () => {
    // Con los pasos estrechos, un Dijkstra que no supiera de héroes ni de
    // guarniciones mandaría a la IA por ENCIMA de lo que hubiera plantado en
    // el paso: batalla no elegida, derrota, vuelta a casa y otra vez. La
    // semilla 54 del barrido no terminaba así. Aquí la base del rival (22,4)
    // está detrás de la ciudad neutral (17,4), que es el único paso entre C y D.
    const objetivo = (guarnecida: boolean) => {
      const { state } = enLaRed();
      state.towns.find((t) => t.id === 'town-1')!.garrison = [];
      state.towns.find((t) => t.id === 'town-2')!.garrison = guarnecida
        ? ejercito({ creature: 'jinete-de-plaga', count: 7 })
        : [];
      // El héroe rival, fuerte y fuera del camino: que no sea él el objetivo.
      heroById(state, 'hero-1').army = ejercito({ creature: 'jinete-de-plaga', count: 6 });
      const mio = heroById(state, 'hero-0');
      mio.at = { x: 14, y: 2 };
      const alcance = alcanceDelHeroe(state, mio);
      // La guarnición se alcanza —es una batalla posible— y no se cruza.
      expect(costesDelAlcance(alcance).has('17,4')).toBe(true);
      expect(costesDelAlcance(alcance).has('22,4'), 'la base rival, detrás del paso').toBe(
        !guarnecida,
      );
      return chooseHeroDestination(state, mio, alcance);
    };
    // Con el paso libre, la base rival vacía es el objetivo…
    expect(objetivo(false)).toEqual({ x: 22, y: 4 });
    // …y con el paso guardado por quien no puede vencer, ni ella ni el paso.
    const conGuardia = objetivo(true);
    expect(conGuardia).not.toEqual({ x: 22, y: 4 });
    expect(conGuardia).not.toEqual({ x: 17, y: 4 });
  });
});

describe('el id de un héroe contratado no se repite (#126)', () => {
  it('con tres jugadores: contratar, caer otro héroe y volver a contratar el mismo día', () => {
    // La colisión solo se alcanza con tres jugadores: un héroe sale de
    // `state.heroes` únicamente si cae sin base a la que volver, y con dos,
    // quedarse sin base acaba la partida. Aquí el 2 tiene base en `town-2`.
    const plan = planDeNodos();
    const state = newGame({
      seed: 41,
      plan: {
        ...plan,
        towns: plan.towns.map((t) => (t.id === 'town-2' ? { ...t, owner: 2 } : t)),
      },
    });
    const c = ctx(41);
    // Los héroes nacen en su base: el del 2 sale para que no la defienda, y el
    // del 0 para que se pueda contratar en la suya.
    heroById(state, 'hero-2').at = { x: 18, y: 3 };
    fueraDeSuBase(state, 0);
    expect(state.players.map((p) => p.id)).toEqual([0, 1, 2]);
    const dia = state.day;
    state.players[0]!.oro = 10 * ECONOMIA.precioDelHeroe;
    const casa = state.towns.find((t) => t.id === 'town-0')!;
    const suya = state.towns.find((t) => t.id === 'town-2')!;
    const otro = heroById(state, 'hero-2');
    const contratar = () => {
      applyAdventureAction(state, { type: 'hire_hero', town: casa.id }, c, 0);
      const nuevo = state.heroes.at(-1)!;
      // Fuera del pueblo, para que el siguiente quepa; con tropa de sobra para
      // ganar lo que le toque pelear.
      nuevo.at = { x: 3, y: 6 };
      nuevo.army = ejercito({ creature: PESADA, count: 6 });
      return nuevo;
    };

    const primero = contratar();
    // El 2 pierde su base: el primero contratado la toma. Su héroe está fuera.
    forzarBatalla(state, c, primero, suya.at);
    resolvePendingBattle(state, c);
    expect(baseOf(state, 2)).toBeNull();
    expect(state.finished).toBeNull();
    // Y su héroe cae sin base a la que volver: sale de `state.heroes`.
    otro.army = ejercito({ creature: TROPA_BARATA, count: 1 });
    const cazador = heroById(state, 'hero-0');
    cazador.army = ejercito({ creature: PESADA, count: 6 });
    forzarBatalla(state, c, cazador, otro.at);
    resolvePendingBattle(state, c);
    expect(state.heroes.some((h) => h.id === otro.id)).toBe(false);

    const segundo = contratar();
    expect(state.day).toBe(dia);
    // Con `hero-<jugador>-<héroes en juego>-<día>`, los dos salían iguales.
    expect(segundo.id).not.toBe(primero.id);
    const contratados = state.log.flatMap((e) => (e.kind === 'hero_hired' ? [e.hero] : []));
    expect(contratados).toEqual([primero.id, segundo.id]);
    const todos = [...state.heroes.map((h) => h.id), ...contratados, otro.id];
    expect(new Set(todos).size).toBe(state.heroes.length + 1);
  });
});

describe('cómo acabó la partida, en el núcleo (#123)', () => {
  it('el desenlace y la causa: la del perdedor para quien perdió, la del último eliminado para el resto', () => {
    const viva = newGame({ seed: 7 });
    expect(finDePartida(viva, new Set([0]))).toBeNull();
    const state = acabarPorLaBase(newGame({ seed: 7 }), 0, 1, ctx(7));
    expect(finDePartida(state, new Set([1]))).toEqual({
      desenlace: 'perdida',
      ganador: 0,
      causa: 'lost_base',
    });
    expect(finDePartida(state, new Set([0]))).toEqual({
      desenlace: 'ganada',
      ganador: 0,
      causa: 'lost_base',
    });
    expect(finDePartida(state, new Set())).toEqual({
      desenlace: 'ajena',
      ganador: 0,
      causa: 'lost_base',
    });
  });

  it('sin ganador no hay causa; con ganador y sin eliminado, la partida está rota', () => {
    const state = newGame({ seed: 7 });
    state.finished = { winner: null };
    // Sin resolver lo está para todos, también para quien no lleva a nadie.
    expect(finDePartida(state, new Set())).toEqual({
      desenlace: 'sin resolver',
      ganador: null,
      causa: null,
    });
    state.finished = { winner: 1 };
    expect(() => finDePartida(state, new Set())).toThrow(
      'la partida la ganó el jugador 1 y la crónica no dice quién quedó eliminado ni por qué',
    );
  });
});

// ---------------------------------------------------------------- la marcha que se para (#130)

/** La primera semilla con una marcha del día 1 que se para, a dónde iba y la partida al salir. */
function primeraParada(): { seed: number; destino: Point; antes: GameState } {
  for (let seed = 1; seed <= 40; seed++) {
    const state = newGame({ seed });
    const destino = primeraMarchaQueSePara(state, heroesOf(state, 0)[0]!);
    if (destino !== null) return { seed, destino, antes: state };
  }
  throw new Error('ninguna marcha del día 1 se para en 40 semillas');
}

describe('la marcha se para al descubrir un grupo que la emboscaría (#130)', () => {
  it('se queda donde lo ve, sin batalla, con lo andado gastado; y el grupo ya se ve', () => {
    const { seed, destino, antes } = primeraParada();
    const state = copiaDePartida(antes);
    const hero = heroesOf(state, 0)[0]!;
    const puntos = hero.movePoints;
    const camino = caminoHasta(state, hero, destino)!;
    // Al salir no avisaba: es lo que hace de la parada la única ocasión de saberlo.
    expect(
      emboscadaEnLaRuta(state, hero, camino, asaltantesALaVista(state, visibleNow(state, 0))),
    ).toBeNull();
    const desde = state.log.length;

    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: destino }, ctx(seed), 0);

    const parada = state.log.at(-1)!;
    if (parada.kind !== 'march_halted') throw new Error(`acabó en ${parada.kind}`);
    expect(parada).toMatchObject({ hero: hero.id, actor: 0, at: hero.at, seen: [0] });
    expect(state.pendingBattle).toBeNull();
    expect(state.log.slice(desde).some((e) => e.kind === 'battle_started')).toBe(false);
    const grupo = state.raiders.find((r) => r.id === parada.raider)!;
    expect(parada.troops).toEqual(grupo.troops);
    // Antes de su región, y no en el destino.
    expect(regionDeCasilla(state.map, hero.at)).not.toBe(regionDeCasilla(state.map, grupo.at));
    expect(pointKey(hero.at)).not.toBe(pointKey(destino));
    // Lo andado cuenta: se ha gastado lo que cuesta llegar a donde se paró.
    const andado = camino.find((p) => pointKey(p.at) === pointKey(hero.at))!;
    expect(hero.movePoints).toBe(puntos - andado.cost);
    // Y ahora se ve, por la misma regla que pinta el cliente y lee el agente.
    expect(asaltantesALaVista(state, visibleNow(state, 0)).map((r) => r.id)).toContain(grupo.id);
    // La crónica del dueño la cuenta: es su hecho.
    expect(cronicaPara(state, 0, 5).some((e) => e.kind === 'march_halted')).toBe(true);
  });

  it('un grupo que ya se ve al salir no para nada: pedir la misma marcha otra vez es la emboscada', () => {
    const { seed, destino, antes } = primeraParada();
    const state = copiaDePartida(antes);
    const hero = heroesOf(state, 0)[0]!;
    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: destino }, ctx(seed), 0);
    const parada = state.log.at(-1)!;
    if (parada.kind !== 'march_halted') throw new Error(`acabó en ${parada.kind}`);
    // Desde donde se paró, la ruta ya avisa: quien la pide sabe lo que pisa.
    const resto = caminoHasta(state, hero, destino)!;
    const vistos = asaltantesALaVista(state, visibleNow(state, 0));
    expect(emboscadaEnLaRuta(state, hero, resto, vistos)?.raider.id).toBe(parada.raider);
    const desde = state.log.length;

    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: destino }, ctx(seed), 0);

    expect(state.log.slice(desde).some((e) => e.kind === 'march_halted')).toBe(false);
    const batalla = state.log.slice(desde).find((e) => e.kind === 'battle_started');
    expect(batalla).toMatchObject({ attacker: { kind: 'raider', raiderId: parada.raider } });
    expect(state.pendingBattle).not.toBeNull();
  });

  it('el rival que mira al héroe parado sin ver la región del grupo no se entera (H4 de QA)', () => {
    // Se planta al héroe del rival a unas casillas de donde se para el nuestro:
    // ve la casilla del héroe y, si la región del grupo le queda fuera, la
    // crónica no le puede contar ni el grupo ni su tropa.
    const casos = { tapado: 0, aLaVista: 0 };
    for (let seed = 1; seed <= 40 && (casos.tapado === 0 || casos.aLaVista === 0); seed++) {
      const antes = newGame({ seed });
      const nuestro = heroesOf(antes, 0)[0]!;
      const destino = primeraMarchaQueSePara(antes, nuestro);
      if (destino === null) continue;
      const solo = copiaDePartida(antes);
      applyAdventureAction(
        solo,
        { type: 'move_hero', hero: nuestro.id, to: destino },
        ctx(seed),
        0,
      );
      const parada = solo.log.at(-1)!;
      if (parada.kind !== 'march_halted') throw new Error(`acabó en ${parada.kind}`);
      for (const [dx, dy] of [
        [3, 0],
        [-3, 0],
        [0, 3],
        [0, -3],
        [2, 2],
        [-2, -2],
        [2, -2],
        [-2, 2],
      ]) {
        const donde = { x: parada.at.x + dx!, y: parada.at.y + dy! };
        if (!isEnterable(antes.map, donde) || objectAt(antes.map, donde) !== undefined) continue;
        const state = copiaDePartida(antes);
        heroesOf(state, 1)[0]!.at = donde;
        applyAdventureAction(
          state,
          { type: 'move_hero', hero: nuestro.id, to: destino },
          ctx(seed),
          0,
        );
        const otra = state.log.at(-1)!;
        if (otra.kind !== 'march_halted' || pointKey(otra.at) !== pointKey(parada.at)) continue;
        if (!visibleNow(state, 1).has(otra.at)) continue;
        const loVe = asaltantesALaVista(state, visibleNow(state, 1)).some(
          (r) => r.id === otra.raider,
        );
        const enSuCronica = cronicaPara(state, 1, 50).some((e) => e.kind === 'march_halted');
        expect(enSuCronica).toBe(loVe);
        // El dueño la tiene siempre: es su hecho.
        expect(cronicaPara(state, 0, 50).some((e) => e.kind === 'march_halted')).toBe(true);
        casos[loVe ? 'aLaVista' : 'tapado']++;
      }
    }
    // Que el test mire los dos lados de la regla, y no solo uno.
    expect(casos.tapado).toBeGreaterThan(0);
    expect(casos.aLaVista).toBeGreaterThan(0);
  });

  it('un héroe al que nadie le saca el margen anda entero', () => {
    const { seed, destino, antes } = primeraParada();
    const state = copiaDePartida(antes);
    const hero = heroesOf(state, 0)[0]!;
    // Siete jinetes: con la escala baja (26-10-2026), siete pesadas ya no daban el margen.
    hero.army = ejercito({ creature: JINETE, count: 7 });
    hero.movePoints = 100_000;
    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: destino }, ctx(seed), 0);
    expect(state.log.some((e) => e.kind === 'march_halted')).toBe(false);
    expect(pointKey(hero.at)).toBe(pointKey(destino));
  });
});

// ------------------------------------- la fuerza cambia a mitad de marcha (H1 y H2 de QA de #130)

/** Las regiones que el jugador 0 está mirando ahora. */
function regionesMiradas(state: GameState): Set<number> {
  const out = new Set<number>();
  for (const p of visibleNow(state, 0)) out.add(regionDeCasilla(state.map, p));
  return out;
}

/** Una casilla libre de `region` que no pisa `ruta`, donde plantar un grupo. */
function casillaLibre(state: GameState, region: number, ruta: readonly Point[]): Point | null {
  const { regionDe } = estructura(state.map);
  const W = state.map.width;
  const pisadas = new Set(ruta.map(pointKey));
  for (let i = 0; i < regionDe.length; i++) {
    if (regionDe[i] !== region) continue;
    const p = { x: i % W, y: Math.floor(i / W) };
    if (pisadas.has(pointKey(p)) || !isEnterable(state.map, p)) continue;
    if (objectAt(state.map, p) !== undefined) continue;
    if (state.heroes.some((h) => pointKey(h.at) === pointKey(p))) continue;
    return p;
  }
  return null;
}

/**
 * La marcha de QA en `?seed=198`, montada a mano para que no dependa del mapa:
 * el héroe del día 1 sale junto a su base y la ruta pisa primero la base —donde
 * recoge la guarnición y gana fuerza—, después la región `a`, que se ve al
 * salir, y más adelante la región `g`, que no se ve al salir y sí desde algún
 * paso anterior a ella. Devuelve la partida sin grupos, el destino, la casilla
 * de cada región donde plantarlos (fuera de la ruta) y la fuerza del héroe antes
 * y después de recoger.
 */
function marchaQueGanaFuerza(): {
  seed: number;
  state: GameState;
  destino: Point;
  enA: Point;
  enG: Point;
  antes: number;
  despues: number;
} {
  for (let seed = 1; seed <= 40; seed++) {
    const state = newGame({ seed });
    state.raiders = [];
    // El héroe nace en su base (19-10-2026) y salir de ella no recoge nada: se
    // le pone al lado para que la marcha pase por ella.
    const hero = fueraDeSuBase(state, 0);
    const base = baseOf(state, 0)!;
    // El héroe nace delante de una puerta de su base, a dos casillas (el
    // recinto de la ciudad, vuelta 3): se le pone en la casilla de esa puerta,
    // junto a la base, que es de donde salía esta marcha.
    hero.at = {
      x: base.at.x + Math.sign(hero.at.x - base.at.x),
      y: base.at.y + Math.sign(hero.at.y - base.at.y),
    };
    // Uno de lo más barato con el héroe y dos de la tropa en casa: con la
    // guarnición de salida, recogerla no movía la fuerza lo bastante para que
    // quepa un grupo entre la de antes y la de después.
    hero.army = ejercito({ creature: TROPA_BARATA, count: 1 });
    base.garrison = ejercito({ creature: TROPA, count: 2 });
    const antes = fuerzaDe(hero, state.characters);
    const recogida = copiaDePartida(state);
    applyAdventureAction(recogida, { type: 'move_hero', hero: hero.id, to: base.at }, ctx(seed), 0);
    const despues = fuerzaDe(heroById(recogida, hero.id), recogida.characters);
    if (despues < antes * 1.1) throw new Error(`recoger la guarnición da ${antes} → ${despues}`);
    const alSalir = regionesMiradas(state);
    for (const [clave, coste] of costesDelAlcance(alcanceDelHeroe(state, hero))) {
      if (coste === 0 || coste > hero.movePoints) continue;
      const destino = pointFromKey(clave);
      const camino = caminoHasta(state, hero, destino);
      if (camino === null || pointKey(camino[0]!.at) !== pointKey(base.at)) continue;
      const regiones = camino.map((p) => regionDeCasilla(state.map, p.at));
      const iA = regiones.findIndex((r, i) => i > 0 && r >= 0 && alSalir.has(r));
      if (iA < 0) continue;
      const a = regiones[iA]!;
      const iG = regiones.findIndex((r, i) => i > iA && r >= 0 && r !== a && !alSalir.has(r));
      if (iG < 0) continue;
      const g = regiones[iG]!;
      // Que se vea desde algún paso de antes de pisarla: si no, no hay parada posible.
      const seVeAntes = camino.slice(0, iG - 1).some((p) => {
        const alli = copiaDePartida(state);
        heroById(alli, hero.id).at = p.at;
        return regionesMiradas(alli).has(g);
      });
      if (!seVeAntes) continue;
      const ruta = camino.map((p) => p.at);
      const enA = casillaLibre(state, a, ruta);
      const enG = casillaLibre(state, g, ruta);
      if (enA === null || enG === null) continue;
      // Con los dos grupos plantados la ruta tiene que ser la misma: son casillas hostiles.
      const conGrupos = copiaDePartida(state);
      conGrupos.raiders = [
        { id: 'raider-a', at: enA, troops: [] },
        { id: 'raider-g', at: enG, troops: [] },
      ];
      const otra = caminoHasta(conGrupos, heroById(conGrupos, hero.id), destino);
      if (otra?.map((p) => pointKey(p.at)).join(' ') !== ruta.map(pointKey).join(' ')) continue;
      return { seed, state, destino, enA, enG, antes, despues };
    }
  }
  throw new Error(
    'ninguna marcha del día 1 de 40 semillas pasa por la base y luego por dos regiones',
  );
}

/** El menor grupo de esqueletos cuya fuerza cumple `vale`. */
function esqueletos(vale: (poder: number) => boolean): Raider['troops'] {
  for (let count = 1; count <= 2000; count++) {
    const troops = [{ creature: NO_MUERTO, count }];
    if (vale(poderDe({ troops }))) return troops;
  }
  throw new Error('ningún grupo de hasta 2000 esqueletos tiene esa fuerza');
}

describe('la marcha que gana fuerza por el camino vuelve a mirar quién la emboscaría (H1, H2 de QA)', () => {
  it('avisaba de un grupo que deja de temer: se para al ver al siguiente, que no avisaba (H1)', () => {
    const { seed, state, destino, enA, enG, antes, despues } = marchaQueGanaFuerza();
    // `a` embosca al héroe que sale y no al que ha recogido la guarnición; `g`, a los dos.
    const troopsA = esqueletos((p) => ventajaClara(p, antes) && !ventajaClara(p, despues));
    const troopsG = esqueletos((p) => ventajaClara(p, despues));
    state.raiders = [
      { id: 'raider-a', at: enA, troops: troopsA },
      { id: 'raider-g', at: enG, troops: troopsG },
    ];
    const hero = heroesOf(state, 0)[0]!;
    const camino = caminoHasta(state, hero, destino)!;
    const vistos = asaltantesALaVista(state, visibleNow(state, 0));
    // Al salir, la ruta avisa de `a` y no ve a `g`.
    expect(vistos.map((r) => r.id)).toEqual(['raider-a']);
    expect(emboscadaEnLaRuta(state, hero, camino, vistos)?.raider.id).toBe('raider-a');
    const desde = state.log.length;

    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: destino }, ctx(seed), 0);

    const hechos = state.log.slice(desde);
    expect(hechos.some((e) => e.kind === 'garrison_taken')).toBe(true);
    expect(hechos.some((e) => e.kind === 'battle_started')).toBe(false);
    expect(state.log.at(-1)).toMatchObject({ kind: 'march_halted', raider: 'raider-g' });
    expect(regionDeCasilla(state.map, hero.at)).not.toBe(regionDeCasilla(state.map, enG));
    // Desde donde se paró, la ruta ya nombra al que la emboscaría.
    const resto = caminoHasta(state, hero, destino)!;
    const ahora = asaltantesALaVista(state, visibleNow(state, 0));
    expect(emboscadaEnLaRuta(state, hero, resto, ahora)?.raider.id).toBe('raider-g');
  });

  it('no se para por un grupo que, con la guarnición recogida, ya no la emboscaría (H2)', () => {
    const { seed, state, destino, enG, antes, despues } = marchaQueGanaFuerza();
    state.raiders = [
      {
        id: 'raider-g',
        at: enG,
        troops: esqueletos((p) => ventajaClara(p, antes) && !ventajaClara(p, despues)),
      },
    ];
    const hero = heroesOf(state, 0)[0]!;
    const desde = state.log.length;

    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: destino }, ctx(seed), 0);

    const hechos = state.log.slice(desde);
    expect(hechos.some((e) => e.kind === 'garrison_taken')).toBe(true);
    expect(hechos.some((e) => e.kind === 'march_halted' || e.kind === 'battle_started')).toBe(
      false,
    );
    // Cruzó la región del grupo sin que lo emboscara, y llegó.
    expect(pointKey(hero.at)).toBe(pointKey(destino));
  });
});
