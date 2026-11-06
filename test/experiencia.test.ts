/**
 * La tropa crece: experiencia por daño, rangos en Fibonacci y la veteranía que
 * vive en el individuo. Escrito desde los criterios del plan
 * (`docs/agents/2026-10-02-la-tropa-crece/plan.md`, §7), no desde el código.
 *
 * Desde el 12-10-2026 (`docs/agents/2026-10-12-nivel-unico/`) la experiencia da
 * RANGOS y el nivel con el que se recibe un golpe es el de las cifras
 * (`nivelDeUnidad`); PV, daño y umbrales van ×10. Y desde la vuelta 2 del
 * mismo día, la experiencia cobra `PV × indiceDePoder(receptor)` y los umbrales
 * están en esa escala. Con las cinco facciones (19-10-2026) la base es 9 000:
 * umbrales 9 000, 27 000, 54 000 y 99 000. Fuera de la tabla del C2, las cifras se
 * escriben con `umbral(n)`, no a mano.
 */

import { describe, expect, it } from 'vitest';
import { galonesDe } from '../src/client/render/batalla.js';
import { marcaDeVeterano } from '../src/client/views/panels.js';
import {
  applyAction,
  type BattleSide,
  createBattle,
  stackById,
} from '../src/core/battle/battle.js';
import { herir, stackHp } from '../src/core/battle/damage.js';
import type { BattleHero, BattleState } from '../src/core/battle/types.js';
import { HERO_BODY } from '../src/core/battle/types.js';
import { cifrasDeUnidad, unidadDelJuego } from '../src/core/catalogo.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { serializeAdventureTurn, serializeBattleTurn } from '../src/core/contract/serialize.js';
import {
  CATALOGO_DE_HABILIDADES,
  EXPERIENCIA,
  HEROE,
  LIDERAZGO,
  validarExperiencia,
} from '../src/core/data.js';
import {
  cifrasVeteranas,
  EXPERIENCIA_INICIAL_DE_HEROE,
  RANGO_INICIAL_DE_HEROE,
  RANGO_MAXIMO_DE_TROPA,
  rangoDe,
  rangoDeHeroe,
  siguienteUmbral,
  subidasDeRango,
  umbral,
} from '../src/core/hero/experiencia.js';
import { cuerposDelHeroe, heroUnit } from '../src/core/hero/hero.js';
import {
  elQueSeIria,
  gruposDe,
  heroLeadership,
  sinIndividuos,
  troopSummary,
} from '../src/core/hero/troop.js';
import { isEnterable, objectAt } from '../src/core/map/map.js';
import { indiceDePoder, nivelDeUnidad } from '../src/core/nivel.js';
import { createRng } from '../src/core/rng.js';
import { heroById, heroesOf } from '../src/core/state/consultas.js';
import { visibleTo } from '../src/core/state/events.js';
import {
  applyAdventureAction,
  baseOf,
  resolvePendingBattle,
  settleBattle,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import { guarnicionDeLaCiudad } from '../src/core/state/sitios.js';
import type { GameState } from '../src/core/state/tipos.js';
import type { Point, Troop, Veterania } from '../src/core/types.js';
import { forzarTurno } from './batalla-de-prueba.js';
import {
  ctx,
  JINETE,
  NO_MUERTO,
  PESADA,
  TIRADOR,
  TIRADOR_NO_MUERTO,
  TROPA,
  TROPA_BARATA,
} from './comun.js';
import { ejercito, forzarBatalla, guarnecer, ponerMonstruo } from './partida-de-prueba.js';

function hoja(id: string, experiencia: number, extra: Partial<Veterania> = {}): Veterania {
  return { id, experiencia, batallas: 1, bajas: 0, heroes: [], ...extra };
}

function veterano(creatureId: string, id: string, experiencia: number): Troop {
  return { creature: creatureId, veterania: hoja(id, experiencia) };
}

const mandoConFlechaMagica = (over: Partial<BattleHero> = {}): BattleHero => ({
  name: 'Prueba',
  retreat: { blocked: 'no tienes base a la que volver' },
  spellPower: 1,
  knowledge: 1,
  mana: 10,
  castThisRound: false,
  spells: ['magic_arrow'],
  ...over,
});

const conHeroe = (army: BattleSide['army'], rango = RANGO_INICIAL_DE_HEROE): BattleSide => ({
  army,
  hero: {
    mando: mandoConFlechaMagica(),
    figura: HERO_BODY,
    ...cuerposDelHeroe({
      name: 'Prueba',
      attack: 1,
      defense: 1,
      experience: umbral(rango),
      equipo: {},
    }),
  },
});

/** Cierra la batalla pendiente a mano: los de `pierde` caen y gana el otro. */
function cerrar(state: GameState, pierde: 'attacker' | 'defender'): BattleState {
  const b = state.pendingBattle!.battle;
  for (const s of b.stacks) {
    if (s.side === pierde) {
      s.count = 0;
      s.topHp = 0;
    }
  }
  b.finished = { winner: pierde === 'attacker' ? 'defender' : 'attacker' };
  return b;
}

/** Una casilla pegada a `p` que se pueda pisar y esté vacía. */
function vecinaLibre(state: GameState, p: Point): Point {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (dx === 0 && dy === 0) continue;
      if (!isEnterable(state.map, q) || objectAt(state.map, q) !== undefined) continue;
      if (state.heroes.some((h) => h.at.x === q.x && h.at.y === q.y)) continue;
      if (state.raiders.some((r) => r.at.x === q.x && r.at.y === q.y)) continue;
      return q;
    }
  }
  throw new Error(`(${p.x},${p.y}) no tiene vecina libre`);
}

// ---------------------------------------------------------------- C1

describe('la experiencia se gana por daño × índice de poder del que lo recibe (C1)', () => {
  it('un golpe de 70 sobre uno con 50 PV acredita 50 × su índice, no 70 × su índice', () => {
    const b = createBattle(
      { army: [{ creature: PESADA, count: 1 }], hero: null },
      { army: [{ creature: TROPA, count: 1 }], hero: null },
      createRng(1),
      COMBATE_COMPLETO,
    );
    const autor = stackById(b, 'attacker-0');
    const recibe = stackById(b, 'defender-0');
    const indice = indiceDePoder(recibe.unit);
    recibe.topHp = 50;
    expect(herir(recibe, { damage: 70, perfora: false }, autor).muertos).toBe(1);
    // Lo quitado, no lo tirado: el sobrante no existe para nadie. Y por el
    // índice entero, no por su primera cifra (el nivel).
    expect(autor.ganado.experiencia).toBe(50 * indice);
    expect(autor.ganado.experiencia).not.toBe(50 * nivelDeUnidad(recibe.unit));
    expect(autor.ganado.bajas).toBe(1);
  });

  it('la salpicadura sobre un aliado no da experiencia', () => {
    const b = createBattle(
      {
        army: [
          { creature: TIRADOR_NO_MUERTO, count: 1 },
          { creature: NO_MUERTO, count: 1 },
        ],
        hero: null,
      },
      { army: [{ creature: TROPA_BARATA, count: 1 }], hero: null },
      createRng(1),
      COMBATE_COMPLETO,
    );
    const tirador = stackById(b, 'attacker-0');
    const aliado = stackById(b, 'attacker-1');
    const antes = stackHp(aliado);
    // Lo que hace `splash` con cada vecino del objetivo, también los suyos.
    herir(aliado, { damage: 30, perfora: false }, tirador);
    expect(stackHp(aliado)).toBeLessThan(antes);
    expect(tirador.ganado).toEqual({ experiencia: 0, bajas: 0, heroes: [] });
  });

  it('un hechizo de daño acredita al cuerpo del héroe que lo lanza', () => {
    const b = createBattle(
      conHeroe([{ creature: JINETE, count: 1 }]),
      { army: [{ creature: 'zombi', count: 1 }], hero: null },
      createRng(4),
      COMBATE_COMPLETO,
    );
    const cuerpo = stackById(b, 'attacker-heroe');
    const zombi = stackById(b, 'defender-0');
    const antes = stackHp(zombi);
    // Por la puerta de verdad, `applyAction`: es la que tiene que buscar el
    // cuerpo del héroe. Cobra lo que quita por el índice del zombi.
    applyAction(b, { type: 'cast', spell: 'magic_arrow', target: zombi.id }, createRng(4));
    const quitado = antes - stackHp(zombi);
    expect(quitado).toBeGreaterThan(0);
    expect(cuerpo.ganado.experiencia).toBe(quitado * indiceDePoder(zombi.unit));
    // Desde el editor de magia (06-11-2026) todo hechizo lo lanza un stack del
    // tablero (el cuerpo del héroe o la unidad del poder): no hay hechizo sin autor.
  });

  it('el héroe que PIERDE también cobra lo que pegó, y quien gana lo suyo', () => {
    const state = newGame({ seed: 41 });
    const c = ctx(41);
    const hero = heroesOf(state, 0)[0]!;
    hero.army = [];
    // Recién hecho: rango 5 con la experiencia del 5, que es como nace todo
    // héroe en la escala única.
    expect(rangoDeHeroe(hero)).toBe(5);
    expect(hero.experience).toBe(umbral(5));
    state.players[0]!.oro = 0;
    ponerMonstruo(state, NO_MUERTO, 1);
    forzarBatalla(state, c, hero);
    const b = state.pendingBattle!.battle;
    const cuerpo = stackById(b, 'attacker-heroe');
    // Le ha pegado algo antes de caer: lo que le sube al 6 y una base más.
    const apuntado = umbral(6) - umbral(5) + EXPERIENCIA.base;
    cuerpo.ganado.experiencia = apuntado;
    cerrar(state, 'attacker');
    settleBattle(state, c);
    expect(heroById(state, hero.id).experience).toBe(umbral(5) + apuntado);
    // Sube al 6 y no al 7.
    expect(umbral(5) + apuntado).toBeLessThan(umbral(7));
    expect(rangoDeHeroe(heroById(state, hero.id))).toBe(6);
  });

  it('un héroe que salta dos rangos de golpe cuenta los dos: un `rank_up` por rango', () => {
    const state = newGame({ seed: 41 });
    const c = ctx(41);
    const hero = heroesOf(state, 0)[0]!;
    hero.army = [];
    ponerMonstruo(state, NO_MUERTO, 1);
    forzarBatalla(state, c, hero);
    // Del umbral del 5 al del 7 de una vez: dos rangos.
    stackById(state.pendingBattle!.battle, 'attacker-heroe').ganado.experiencia =
      umbral(7) - umbral(5);
    cerrar(state, 'defender');
    settleBattle(state, c);
    expect(rangoDeHeroe(heroById(state, hero.id))).toBe(7);
    const subidas = state.log.filter((e) => e.kind === 'rank_up' && e.hero === hero.id);
    expect(subidas.map((e) => (e.kind === 'rank_up' ? e.rank : 0))).toEqual([6, 7]);
  });

  it('en una batalla jugada de verdad, cada superviviente vuelve con lo que apuntó el motor', () => {
    // Una semilla en que la tropa pega algo (con la de 31, desde la montura, 26-10-2026,
    // el héroe se llevaba toda la experiencia y no quedaba nada que comprobar).
    const state = newGame({ seed: 1 });
    const c = ctx(1);
    const hero = heroesOf(state, 0)[0]!;
    hero.army = ejercito({ creature: PESADA, count: 3 });
    ponerMonstruo(state, TROPA_BARATA, 7);
    forzarBatalla(state, c, hero);
    const b = state.pendingBattle!.battle;
    expect(resolvePendingBattle(state, c).winner).toBe('attacker');
    // Los que siguen en pie: vuelven al ejército en su orden (con la rueda, uno de
    // los tres puede caer).
    const vivos = b.stacks.filter(
      (s) => s.side === 'attacker' && s.origen.kind === 'catalogo' && s.count > 0,
    );
    const army = heroById(state, hero.id).army;
    // Los siete caen enteros: entre todo el bando —la tropa y el cuerpo del
    // héroe—, 7 × sus PV × su índice de experiencia.
    const barata = unidadDelJuego(TROPA_BARATA);
    const delBando = b.stacks
      .filter((s) => s.side === 'attacker')
      .reduce((n, s) => n + s.ganado.experiencia, 0);
    expect(delBando).toBe(7 * barata.hp * indiceDePoder(barata));
    const total = vivos.reduce((n, s) => n + s.ganado.experiencia, 0);
    expect(total).toBeGreaterThan(0);
    expect(army.reduce((n, t) => n + (t.veterania?.experiencia ?? 0), 0)).toBe(total);
    // Quien no pegó vuelve novato: sin hoja.
    for (const [i, s] of vivos.entries()) {
      expect(army[i]!.veterania === undefined, s.id).toBe(s.ganado.experiencia === 0);
    }
  });
});

// ---------------------------------------------------------------- C2

describe('una sola tabla en Fibonacci (C2)', () => {
  it('`data.ts` lanza si los incrementos no son Fibonacci (sonda)', () => {
    const roto = { ...structuredClone(EXPERIENCIA), incrementos: [1, 2, 4, 6] };
    expect(() => validarExperiencia(roto)).toThrow(
      'incrementos no es Fibonacci: el 3.º es 4 y tendría que ser 2 + 1 = 3',
    );
    const decimal = { ...structuredClone(EXPERIENCIA), base: 2.5 };
    expect(() => validarExperiencia(decimal)).toThrow('base tiene que ser un entero ≥ 1 y es 2.5');
    expect(validarExperiencia(structuredClone(EXPERIENCIA))).toEqual(EXPERIENCIA);
  });
});

// ---------------------------------------------------------------- C3

describe('la veteranía vive en el individuo y lo acompaña (C3)', () => {
  it('tras una batalla ganada vuelve el mismo individuo: mismo id, más experiencia, una batalla más', () => {
    const state = newGame({ seed: 31 });
    const c = ctx(31);
    const hero = heroesOf(state, 0)[0]!;
    // En el 3 con algo de más; lo que gana lo lleva justo a eso más el umbral del 4.
    const antes = umbral(3) + 1_000;
    const gana = umbral(4) - umbral(3);
    hero.army = [
      { creature: TROPA_BARATA },
      veterano(TROPA, 'veterano-x', antes),
      { creature: TROPA_BARATA },
    ];
    ponerMonstruo(state, TROPA_BARATA, 1);
    forzarBatalla(state, c, hero);
    const b = state.pendingBattle!.battle;
    stackById(b, 'attacker-1').ganado = { experiencia: gana, bajas: 2, heroes: ['Uno'] };
    cerrar(state, 'defender');
    settleBattle(state, c);

    const army = heroById(state, hero.id).army;
    expect(army[1]).toEqual({
      creature: TROPA,
      veterania: {
        id: 'veterano-x',
        experiencia: antes + gana,
        batallas: 2,
        bajas: 2,
        heroes: ['Uno'],
      },
    });
    // Los que no pegaron vuelven novatos y el contador no se mueve.
    expect(army[0]).toEqual({ creature: TROPA_BARATA });
    expect(state.siguienteVeterano).toBe(1);
    // Y cruzó del 3 al 4: un `troop_rank_up`, con su dueño.
    const sube = state.log.filter((e) => e.kind === 'troop_rank_up');
    expect(sube).toMatchObject([{ creature: TROPA, rank: 4, veterano: 'veterano-x', actor: 0 }]);
  });

  it('el primer punto le da un id del contador del estado, en orden', () => {
    const state = newGame({ seed: 31 });
    const c = ctx(31);
    const hero = heroesOf(state, 0)[0]!;
    hero.army = ejercito({ creature: TROPA_BARATA, count: 3 });
    ponerMonstruo(state, TROPA_BARATA, 1);
    forzarBatalla(state, c, hero);
    const b = state.pendingBattle!.battle;
    stackById(b, 'attacker-2').ganado.experiencia = 4000;
    stackById(b, 'attacker-0').ganado.experiencia = 20_000;
    cerrar(state, 'defender');
    settleBattle(state, c);
    const army = heroById(state, hero.id).army;
    expect(army.map((t) => t.veterania?.id)).toEqual(['veterano-1', undefined, 'veterano-2']);
    expect(state.siguienteVeterano).toBe(3);
  });

  it('si muere, se pierde con lo que había ganado', () => {
    const state = newGame({ seed: 31 });
    const c = ctx(31);
    const hero = heroesOf(state, 0)[0]!;
    hero.army = [veterano(TROPA, 'veterano-x', 160_000), { creature: TROPA_BARATA }];
    ponerMonstruo(state, TROPA_BARATA, 1);
    forzarBatalla(state, c, hero);
    const b = state.pendingBattle!.battle;
    const piquero = stackById(b, 'attacker-0');
    piquero.count = 0;
    piquero.topHp = 0;
    cerrar(state, 'defender');
    settleBattle(state, c);
    const army = heroById(state, hero.id).army;
    expect(army).toEqual([{ creature: TROPA_BARATA }]);
  });

  it('rindiéndose, el veterano que se salva vuelve a la base con su hoja', () => {
    const state = newGame({ seed: 7 });
    const c = ctx(7);
    const base = baseOf(state, 0)!;
    guarnecer(state, base, []);
    const hero = heroesOf(state, 0)[0]!;
    hero.army = [veterano(TIRADOR, 'veterano-a', 24_000), { creature: TIRADOR }];
    ponerMonstruo(state, PESADA, 6);
    forzarBatalla(state, c, hero);
    const b = state.pendingBattle!.battle;
    // Rendirse se puede en cualquier momento del bando: se fuerza el turno.
    forzarTurno(b, 'attacker-0');
    applyAction(b, { type: 'surrender' }, c.rng);
    expect(b.finished?.surrender).toBeDefined();
    settleBattle(state, c);
    const vuelto = heroById(state, hero.id);
    expect(vuelto.at).toEqual(base.at);
    expect(vuelto.army[0]?.veterania).toMatchObject({ id: 'veterano-a', batallas: 2 });
  });

  it('la guarnición que defiende y repele conserva y suma; al recogerla el héroe se la lleva igual', () => {
    const state = newGame({ seed: 5 });
    const c = ctx(5);
    const base = baseOf(state, 0)!;
    const nuestro = heroesOf(state, 0)[0]!;
    // El héroe fuera de casa, pegado a ella: si estuviera dentro defendería él y
    // no la guarnición, y más lejos se encuentra con algo por el camino.
    nuestro.at = vecinaLibre(state, base.at);
    guarnecer(state, base, [veterano(TROPA, 'veterano-g', 32_000), { creature: TROPA_BARATA }]);
    const rival = heroesOf(state, 1)[0]!;
    rival.army = ejercito({ creature: TROPA_BARATA, count: 1 });
    state.current = 1;
    forzarBatalla(state, c, rival, base.at);
    expect(state.pendingBattle!.foe).toEqual({ kind: 'garrison', site: base.id });
    const b = state.pendingBattle!.battle;
    stackById(b, 'defender-0').ganado.experiencia = 20_000;
    cerrar(state, 'attacker');
    settleBattle(state, c);
    expect(guarnicionDeLaCiudad(state, base)[0]).toEqual({
      creature: TROPA,
      veterania: { id: 'veterano-g', experiencia: 52_000, batallas: 2, bajas: 0, heroes: [] },
    });
    // Y es el MISMO objeto el que pasa al héroe: no hay copia que se quede atrás.
    const guardado = guarnicionDeLaCiudad(state, base)[0];
    state.current = 0;
    nuestro.army = [];
    nuestro.movePoints = 5000;
    applyAdventureAction(state, { type: 'move_hero', hero: nuestro.id, to: base.at }, c, 0);
    // Entrar no recoge (04-11-2026): se recoge el veterano por su id.
    applyAdventureAction(
      state,
      {
        type: 'recoger_tropa',
        hero: nuestro.id,
        creature: TROPA,
        count: 1,
        veterano: 'veterano-g',
      },
      c,
      0,
    );
    expect(heroById(state, nuestro.id).army).toContain(guardado);
  });

  it('licenciar se lleva primero a los de menos experiencia de ese tipo', () => {
    const army: Troop[] = [
      veterano(TROPA, 'v-alto', 104_000),
      { creature: TROPA },
      veterano(TROPA, 'v-bajo', 20_000),
      { creature: TROPA_BARATA },
      { creature: TROPA },
    ];
    // Los dos novatos primero, del final hacia delante.
    expect(sinIndividuos(army, TROPA, 1)).toEqual([army[0], army[1], army[2], army[3]]);
    expect(sinIndividuos(army, TROPA, 2)).toEqual([army[0], army[2], army[3]]);
    // Luego el de menos experiencia, y el veterano de verdad el último.
    expect(sinIndividuos(army, TROPA, 3)).toEqual([army[0], army[3]]);
    expect(sinIndividuos(army, TROPA, 4)).toEqual([army[3]]);
    // `elQueSeIria` es la regla de la que cuelgan los tres —la acción, la IA y
    // el botón del panel— y nombra al mismo que quita `sinIndividuos`.
    expect(elQueSeIria(army, TROPA)).toBe(army[4]);
    expect(elQueSeIria([army[0]!, army[2]!], TROPA)).toBe(army[2]);
    expect(elQueSeIria(army, TIRADOR)).toBeNull();
  });

  it('`dismiss` licencia al novato de su tipo y deja al veterano en el ejército', () => {
    const state = newGame({ seed: 5 });
    const c = ctx(5);
    const hero = heroesOf(state, 0)[0]!;
    hero.at = baseOf(state, 0)!.at;
    const vet = veterano(TROPA, 'v-1', 48_000);
    hero.army = [vet, { creature: TROPA }];
    applyAdventureAction(
      state,
      { type: 'dismiss', hero: hero.id, creature: TROPA, count: 1 },
      c,
      0,
    );
    expect(heroById(state, hero.id).army).toEqual([vet]);
  });

  it('un veterano no cabe en unos grupos ni en un stack de N: lanza en vez de perder la hoja', () => {
    expect(() => gruposDe([veterano(TROPA, 'v-1', 30)])).toThrow(
      `el ${unidadDelJuego(TROPA).name} veterano v-1 no cabe en unos grupos de tropa: perdería su experiencia`,
    );
    expect(() =>
      createBattle(
        {
          army: [{ creature: TROPA, count: 3, veterania: hoja('v-1', 30) }],
          hero: null,
        },
        { army: [{ creature: TROPA_BARATA, count: 1 }], hero: null },
        createRng(1),
        COMBATE_COMPLETO,
      ),
    ).toThrow('el veterano v-1 es uno solo y viene en un stack de 3');
  });
});

// ---------------------------------------------------------------- C4

describe('cifras por rango, en una sola puerta (C4)', () => {
  it('un novato sigue llevando la MISMA referencia del catálogo', () => {
    const b = createBattle(
      { army: [{ creature: TROPA, count: 1 }], hero: null },
      { army: [{ creature: TROPA_BARATA, count: 1 }], hero: null },
      createRng(1),
      COMBATE_COMPLETO,
    );
    expect(stackById(b, 'attacker-0').unit).toBe(unidadDelJuego(TROPA));
    expect(cifrasVeteranas(unidadDelJuego(TROPA), 1)).toBe(unidadDelJuego(TROPA));
  });
});

// ---------------------------------------------------------------- C5

describe('las habilidades están en datos, en su catálogo (C5)', () => {
  it('el catálogo sale del cuaderno: las 37 del usuario, sin repetir', () => {
    expect(CATALOGO_DE_HABILIDADES).toHaveLength(37);
    expect(new Set(CATALOGO_DE_HABILIDADES).size).toBe(37);
    expect(CATALOGO_DE_HABILIDADES).toContain('Antiinfantería montada');
  });

  it('la experiencia ya no las lleva: un campo que no es suyo tumba la carga diciéndolo', () => {
    // Las habilidades por rango eran de cada criatura de `data/creatures.json`, y
    // se fueron con ellas (19-10-2026): las unidades llevan las suyas.
    const roto = { ...structuredClone(EXPERIENCIA), habilidades: {} };
    expect(() => validarExperiencia(roto)).toThrow(
      'data/experiencia.json: «habilidades» no es un campo de la experiencia',
    );
  });
});

// ---------------------------------------------------------------- C7

describe('la veteranía se ve (C7)', () => {
  it('`troopSummary` saca a cada veterano en su fila, con su rango y lo que le falta', () => {
    const army: Troop[] = [
      { creature: TROPA },
      veterano(TROPA, 'v-1', umbral(3) + 1_000),
      { creature: TROPA },
      veterano(TROPA, 'v-2', 800_000),
    ];
    const filas = troopSummary(army);
    expect(filas.map((g) => [g.count, g.rango, g.siguiente, g.veterania?.id])).toEqual([
      [2, 1, null, undefined],
      [1, 3, umbral(4), 'v-1'],
      [1, 5, null, 'v-2'],
    ]);
  });

  it('el agente ve `rank`, `level`, `experience` y `nextRankAt` de su tropa veterana', () => {
    const state = newGame({ seed: 3 });
    const hero = heroesOf(state, 0)[0]!;
    const experiencia = umbral(3) + 1_000;
    hero.army = [{ creature: TROPA }, veterano(TROPA, 'v-1', experiencia)];
    const turno = serializeAdventureTurn(state, 0) as {
      heroes: { id: string; army: Record<string, unknown>[] }[];
    };
    const army = turno.heroes.find((h) => h.id === hero.id)!.army;
    expect(army[0]).not.toHaveProperty('rank');
    expect(army[0]).not.toHaveProperty('level');
    expect(army[1]).toMatchObject({
      creature: TROPA,
      count: 1,
      rank: 3,
      level: nivelDeUnidad(cifrasDeUnidad(TROPA, hoja('v-1', experiencia))),
      experience: experiencia,
    });
    expect(army[1]!.nextRankAt).toBe(umbral(4));
  });

  it('la figura lleva un galón por rango por encima del 1, y «· rango N» en el campo', () => {
    const b = createBattle(
      conHeroe([
        { creature: TROPA, count: 1 },
        // Con hoja y sin llegar al 2: un punto menos que su umbral.
        { creature: TROPA, count: 1, veterania: hoja('v-1', umbral(2) - 1) },
        { creature: TROPA, count: 1, veterania: hoja('v-2', umbral(3)) },
        { creature: TROPA, count: 1, veterania: hoja('v-3', 4_000_000) },
      ]),
      { army: [{ creature: TROPA_BARATA, count: 1 }], hero: null },
      createRng(1),
      COMBATE_COMPLETO,
    );
    const ids = ['attacker-0', 'attacker-1', 'attacker-2', 'attacker-3', 'attacker-heroe'];
    expect(ids.map((id) => galonesDe(stackById(b, id)))).toEqual([0, 0, 2, 4, 0]);
    expect(ids.map((id) => marcaDeVeterano(stackById(b, id)))).toEqual([
      '',
      '',
      ' · rango 3',
      ' · rango 5',
      '',
    ]);
    // Y el tercer lector de `rangoDeVeterania`, el agente, ve lo mismo: el
    // `veteranRank` desde el rango 2, como promete la prosa. Antes salía
    // `veteranLevel: 1` para quien tenía hoja sin llegar al 2.
    const vista = serializeBattleTurn(b, 'attacker', 'ajena', null) as {
      stacks: { id: string; veteranRank?: number }[];
    };
    expect(ids.map((id) => vista.stacks.find((x) => x.id === id)!.veteranRank)).toEqual([
      undefined,
      undefined,
      3,
      5,
      undefined,
    ]);
  });

  it('`troop_rank_up` pasa la niebla como `rank_up`: lo tuyo siempre, lo ajeno si se veía', () => {
    const base = { creature: TROPA, rank: 3, veterano: 'v', at: null } as const;
    const mio = { ...base, kind: 'troop_rank_up', actor: 0, seen: [] } as const;
    const suyoVisto = { ...base, kind: 'troop_rank_up', actor: 1, seen: [0] } as const;
    const suyoOculto = { ...base, kind: 'troop_rank_up', actor: 1, seen: [] } as const;
    expect(visibleTo(mio, 0)).toBe(true);
    expect(visibleTo(suyoVisto, 0)).toBe(true);
    expect(visibleTo(suyoOculto, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------- C8

// ------------------------------------------------- una sola escala de rangos

describe('una sola escala de rangos: el héroe empieza donde acaba la tropa', () => {
  it('el rango inicial del héroe ES el tope de la tropa, y nace con su experiencia', () => {
    expect(RANGO_INICIAL_DE_HEROE).toBe(RANGO_MAXIMO_DE_TROPA);
    expect(EXPERIENCIA_INICIAL_DE_HEROE).toBe(umbral(5));
    // Y esa experiencia da ese rango: no es un 5 escrito a mano encima de un 4.
    expect(rangoDe(EXPERIENCIA_INICIAL_DE_HEROE)).toBe(5);
  });

  it('los iniciales y los contratados nacen en el 5 con su umbral', () => {
    const state = newGame({ seed: 7 });
    for (const h of state.heroes) {
      expect(h.experience, h.id).toBe(umbral(5));
      expect(rangoDeHeroe(h), h.id).toBe(5);
      // El rango no se guarda: se deriva, así que no hay dos datos que cuadrar.
      expect('level' in h, h.id).toBe(false);
    }
    const hero = heroesOf(state, 0)[0]!;
    const base = baseOf(state, 0)!;
    hero.at = { x: base.at.x + 1, y: base.at.y };
    state.players[0]!.oro = 50_000;
    applyAdventureAction(state, { type: 'hire_hero', town: base.id }, ctx(7), 0);
    const nuevo = heroesOf(state, 0).find((h) => h.id !== hero.id)!;
    expect(nuevo.experience).toBe(umbral(5));
    expect(rangoDeHeroe(nuevo)).toBe(5);
    expect('level' in nuevo).toBe(false);
  });

  it('el rango 5 son las bases del JSON, y cada rango por encima suma `porRango`', () => {
    const c = HEROE.combate;
    expect(
      heroUnit({ name: 'X', attack: 2, defense: 2, experience: umbral(5), equipo: {} }),
    ).toMatchObject({
      attack: 2,
      // Su Defensa (2) encima de su agilidad; el daño, de su fuerza y su agilidad.
      defense: 2 + c.agilidad,
      hp: c.pv.base,
      fuerza: c.fuerza.base,
      damage: [c.fuerza.base, c.fuerza.base * c.agilidad],
    });
    expect(heroLeadership({ experience: umbral(5) })).toBe(LIDERAZGO.heroe.base);
    const del6 = heroUnit({ name: 'X', attack: 2, defense: 2, experience: umbral(6), equipo: {} });
    expect(del6.hp).toBe(c.pv.base + c.pv.porRango);
    expect(del6.fuerza).toBe(c.fuerza.base + c.fuerza.porRango);
    expect(heroLeadership({ experience: umbral(6) })).toBe(
      LIDERAZGO.heroe.base + LIDERAZGO.heroe.porRango,
    );
  });

  it('un héroe por debajo del 5 no existe, y decirlo es lanzar', () => {
    expect(subidasDeRango(5)).toBe(0);
    expect(() => subidasDeRango(1)).toThrow(
      'un héroe de rango 1 no existe: todo héroe empieza en el 5, la escala es la de la tropa',
    );
    expect(() =>
      heroUnit({ name: 'X', attack: 0, defense: 0, experience: umbral(4), equipo: {} }),
    ).toThrow(/rango 4/);
    expect(() => heroLeadership({ experience: umbral(4) })).toThrow(/rango 4/);
  });

  it('el primer ascenso del héroe es al 6 y cuesta 8 bases, no una', () => {
    const cuesta = 8 * EXPERIENCIA.base;
    expect(siguienteUmbral(EXPERIENCIA_INICIAL_DE_HEROE)).toBe(umbral(5) + cuesta);
    expect(rangoDe(EXPERIENCIA_INICIAL_DE_HEROE + cuesta - 1)).toBe(5);
    expect(rangoDe(EXPERIENCIA_INICIAL_DE_HEROE + cuesta)).toBe(6);
  });
});
