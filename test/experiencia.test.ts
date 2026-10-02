/**
 * La tropa crece: experiencia por daño, niveles en Fibonacci y la veteranía que
 * vive en el individuo. Escrito desde los criterios del plan
 * (`docs/agents/2026-10-02-la-tropa-crece/plan.md`, §7), no desde el código.
 */
import { describe, expect, it } from 'vitest';
import { galonesDe } from '../src/client/render/batalla.js';
import { marcaDeVeterano } from '../src/client/views/panels.js';
import { planRecruits } from '../src/core/ai/strategy.js';
import {
  applyAction,
  type BattleSide,
  createBattle,
  stackById,
  surrenderBlocker,
} from '../src/core/battle/battle.js';
import { herir, stackHp } from '../src/core/battle/damage.js';
import { castSpell, spell } from '../src/core/battle/spells.js';
import type { BattleHero, BattleState } from '../src/core/battle/types.js';
import { serializeAdventureTurn, serializeBattleTurn } from '../src/core/contract/serialize.js';
import {
  CATALOGO_DE_HABILIDADES,
  creature,
  EXPERIENCIA,
  HEROE,
  LIDERAZGO,
  validarExperiencia,
} from '../src/core/data.js';
import {
  cifrasDeCatalogo,
  cifrasVeteranas,
  EXPERIENCIA_INICIAL_DE_HEROE,
  NIVEL_INICIAL_DE_HEROE,
  NIVEL_MAXIMO_DE_TROPA,
  nivelDe,
  nivelDeHeroe,
  nivelDeTropa,
  siguienteUmbral,
  subidasDeHeroe,
  umbral,
} from '../src/core/hero/experiencia.js';
import { heroUnit } from '../src/core/hero/hero.js';
import {
  elQueSeIria,
  gruposDe,
  heroLeadership,
  sinIndividuos,
  troopSummary,
  troopUnit,
} from '../src/core/hero/troop.js';
import { isEnterable, objectAt } from '../src/core/map/map.js';
import { createRng } from '../src/core/rng.js';
import { createCharacter, defaultBuild } from '../src/core/rpg/character.js';
import { combatProfile } from '../src/core/rpg/stats.js';
import { visibleTo } from '../src/core/state/events.js';
import {
  applyAdventureAction,
  baseOf,
  type GameContext,
  type GameState,
  heroById,
  heroesOf,
  resolvePendingBattle,
  settleBattle,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import type { Point, Troop, Veterania } from '../src/core/types.js';
import { ejercito, forzarBatalla, forzarTurno, ponerMonstruo } from './helpers.js';

const ctx = (seed: number): GameContext => ({ rng: createRng(seed) });

const catalogoDeCriaturas = (): string[] => Object.keys(EXPERIENCIA.habilidades);

function hoja(id: string, experiencia: number, extra: Partial<Veterania> = {}): Veterania {
  return { id, experiencia, batallas: 1, bajas: 0, heroes: [], ...extra };
}

function veterano(creatureId: string, id: string, experiencia: number): Troop {
  return { creature: creatureId, veterania: hoja(id, experiencia) };
}

const mando = (over: Partial<BattleHero> = {}): BattleHero => ({
  name: 'Prueba',
  retreat: { blocked: 'no tienes base a la que volver' },
  spellPower: 1,
  knowledge: 1,
  mana: 10,
  castThisRound: false,
  spells: ['magic_arrow'],
  ...over,
});

const conHeroe = (army: BattleSide['army'], nivel = NIVEL_INICIAL_DE_HEROE): BattleSide => ({
  army,
  hero: {
    mando: mando(),
    cuerpo: heroUnit({
      name: 'Prueba',
      attack: 1,
      defense: 1,
      experience: umbral(nivel),
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

describe('la experiencia se gana por daño × nivel del que lo recibe (C1)', () => {
  it('un golpe de 7 sobre un piquero (nivel 3) con 5 PV acredita 15, no 21', () => {
    const b = createBattle(
      { army: [{ creature: 'swordsman', count: 1 }], hero: null },
      { army: [{ creature: 'pikeman', count: 1 }], hero: null },
      createRng(1),
    );
    const autor = stackById(b, 'attacker-0');
    const piquero = stackById(b, 'defender-0');
    expect(piquero.unit.nivel).toBe(3);
    piquero.topHp = 5;
    expect(herir(piquero, 7, autor)).toBe(1);
    // Lo quitado, no lo tirado: el sobrante no existe para nadie.
    expect(autor.ganado.experiencia).toBe(5 * 3);
    expect(autor.ganado.bajas).toBe(1);
  });

  it('el nivel del que recibe es el de catálogo más su veteranía − 1, y el héroe el suyo', () => {
    const b = createBattle(
      // Un héroe de nivel 7: recibe con su nivel en la escala única, que es
      // más que el de cualquier tropa.
      conHeroe([{ creature: 'skeleton', count: 1 }], 7),
      {
        army: [
          { creature: 'pikeman', count: 1 },
          // 120 de experiencia es el umbral del nivel 4.
          { creature: 'pikeman', count: 1, veterania: hoja('v-1', 120) },
        ],
        hero: null,
      },
      createRng(1),
    );
    expect(stackById(b, 'defender-0').unit.nivel).toBe(3);
    expect(stackById(b, 'defender-1').unit.nivel).toBe(3 + 4 - 1);
    expect(stackById(b, 'attacker-heroe').unit.nivel).toBe(7);
  });

  it('la salpicadura sobre un aliado no da experiencia', () => {
    const b = createBattle(
      {
        army: [
          { creature: 'lich', count: 1 },
          { creature: 'skeleton', count: 1 },
        ],
        hero: null,
      },
      { army: [{ creature: 'peasant', count: 1 }], hero: null },
      createRng(1),
    );
    const liche = stackById(b, 'attacker-0');
    const aliado = stackById(b, 'attacker-1');
    // Lo que hace `splash` con cada vecino del objetivo, también los suyos.
    herir(aliado, 3, liche);
    expect(stackHp(aliado)).toBe(1);
    expect(liche.ganado).toEqual({ experiencia: 0, bajas: 0, heroes: [] });
  });

  it('un hechizo de daño acredita al cuerpo del héroe que lo lanza', () => {
    const b = createBattle(
      conHeroe([{ creature: 'champion', count: 1 }]),
      { army: [{ creature: 'zombie', count: 1 }], hero: null },
      createRng(4),
    );
    const cuerpo = stackById(b, 'attacker-heroe');
    const zombi = stackById(b, 'defender-0');
    // Por la puerta de verdad, `applyAction`: es la que tiene que buscar el
    // cuerpo del héroe. 10 + 10 × 1 = 20 de daño sobre un zombi de 15 PV y
    // nivel 2: quita 15, cobra 30.
    applyAction(b, { type: 'cast', spell: 'magic_arrow', target: zombi.id }, createRng(4));
    expect(cuerpo.ganado.experiencia).toBe(15 * 2);
    // Y sin cuerpo que cobre, el hechizo hiere igual y no apunta a nadie.
    const otra = createBattle(
      conHeroe([{ creature: 'champion', count: 1 }]),
      { army: [{ creature: 'zombie', count: 1 }], hero: null },
      createRng(4),
    );
    castSpell(spell('magic_arrow'), mando(), stackById(otra, 'defender-0'), null);
    expect(stackById(otra, 'defender-0').count).toBe(0);
  });

  it('el héroe que PIERDE también cobra lo que pegó, y quien gana lo suyo', () => {
    const state = newGame({ seed: 41 });
    const c = ctx(41);
    const hero = heroesOf(state, 0)[0]!;
    hero.army = [];
    // Recién hecho: nivel 5 con la experiencia del 5, que es como nace todo
    // héroe en la escala única.
    expect(nivelDeHeroe(hero)).toBe(5);
    expect(hero.experience).toBe(220);
    state.players[0]!.resources = { ...state.players[0]!.resources, gold: 0 };
    ponerMonstruo(state, 'skeleton', 1);
    forzarBatalla(state, c, hero);
    const b = state.pendingBattle!.battle;
    const cuerpo = stackById(b, 'attacker-heroe');
    // Le ha pegado algo antes de caer: 170 de experiencia apuntados.
    cuerpo.ganado.experiencia = 170;
    cerrar(state, 'attacker');
    settleBattle(state, c);
    expect(heroById(state, hero.id).experience).toBe(390);
    // Con 390 sube al 6 (umbral 380) y no al 7 (640).
    expect(nivelDeHeroe(heroById(state, hero.id))).toBe(6);
  });

  it('un héroe que salta dos niveles de golpe cuenta los dos: un `level_up` por nivel', () => {
    const state = newGame({ seed: 41 });
    const c = ctx(41);
    const hero = heroesOf(state, 0)[0]!;
    hero.army = [];
    ponerMonstruo(state, 'skeleton', 1);
    forzarBatalla(state, c, hero);
    // De 220 a 640 de una vez: del 5 al 7 (umbrales 380 y 640).
    stackById(state.pendingBattle!.battle, 'attacker-heroe').ganado.experiencia = 420;
    cerrar(state, 'defender');
    settleBattle(state, c);
    expect(nivelDeHeroe(heroById(state, hero.id))).toBe(7);
    const subidas = state.log.filter((e) => e.kind === 'level_up' && e.hero === hero.id);
    expect(subidas.map((e) => (e.kind === 'level_up' ? e.level : 0))).toEqual([6, 7]);
  });

  it('en una batalla jugada de verdad, cada superviviente vuelve con lo que apuntó el motor', () => {
    const state = newGame({ seed: 31 });
    const c = ctx(31);
    const hero = heroesOf(state, 0)[0]!;
    hero.army = ejercito({ creature: 'crusader', count: 3 });
    ponerMonstruo(state, 'peasant', 7);
    forzarBatalla(state, c, hero);
    const b = state.pendingBattle!.battle;
    expect(resolvePendingBattle(state, c).winner).toBe('attacker');
    const vivos = b.stacks.filter((s) => s.side === 'attacker' && s.origen.kind === 'catalogo');
    const army = heroById(state, hero.id).army;
    // 7 campesinos de 1 PV y nivel 1: entre todos, 7 de experiencia.
    const total = vivos.reduce((n, s) => n + s.ganado.experiencia, 0);
    expect(total).toBe(7);
    expect(army.reduce((n, t) => n + (t.veterania?.experiencia ?? 0), 0)).toBe(total);
    // Quien no pegó vuelve novato: sin hoja.
    for (const [i, s] of vivos.entries()) {
      expect(army[i]!.veterania === undefined, s.id).toBe(s.ganado.experiencia === 0);
    }
  });
});

// ---------------------------------------------------------------- C2

describe('una sola tabla en Fibonacci (C2)', () => {
  it('los umbrales salen del JSON: 20, 60, 120 y 220 para los niveles 2-5', () => {
    expect(EXPERIENCIA.base).toBe(20);
    expect([1, 2, 3, 4, 5].map(umbral)).toEqual([0, 20, 60, 120, 220]);
    expect(nivelDe(0)).toBe(1);
    expect(nivelDe(19)).toBe(1);
    expect(nivelDe(20)).toBe(2);
    expect(nivelDe(219)).toBe(4);
    expect(nivelDe(220)).toBe(5);
  });

  it('la tropa se para en el 5 y el héroe no: sigue la misma recurrencia', () => {
    expect(NIVEL_MAXIMO_DE_TROPA).toBe(5);
    // Más allá de [1, 2, 3, 5] vienen 8, 13… por la recurrencia, no por el JSON.
    expect(umbral(6)).toBe(220 + 20 * 8);
    expect(umbral(7)).toBe(380 + 20 * 13);
    expect(nivelDeTropa(hoja('v', 10_000))).toBe(5);
    expect(nivelDe(10_000)).toBeGreaterThan(5);
    expect(siguienteUmbral(150, NIVEL_MAXIMO_DE_TROPA)).toBe(220);
    expect(siguienteUmbral(220, NIVEL_MAXIMO_DE_TROPA)).toBeNull();
    // La tabla se acaba donde deja de caber en un entero, y entonces lanza en
    // vez de redondear.
    expect(() => umbral(500)).toThrow('pide más experiencia de la que cabe en un entero');
    expect(nivelDe(Number.MAX_SAFE_INTEGER)).toBeGreaterThan(50);
  });

  it('`data.ts` lanza si los incrementos no son Fibonacci (sonda)', () => {
    const roto = { ...structuredClone(EXPERIENCIA), incrementos: [1, 2, 4, 6] };
    expect(() => validarExperiencia(roto, CATALOGO_DE_HABILIDADES, catalogoDeCriaturas())).toThrow(
      'incrementos no es Fibonacci: el 3.º es 4 y tendría que ser 2 + 1 = 3',
    );
    const decimal = { ...structuredClone(EXPERIENCIA), base: 2.5 };
    expect(() =>
      validarExperiencia(decimal, CATALOGO_DE_HABILIDADES, catalogoDeCriaturas()),
    ).toThrow('base tiene que ser un entero ≥ 1 y es 2.5');
  });
});

// ---------------------------------------------------------------- C3

describe('la veteranía vive en el individuo y lo acompaña (C3)', () => {
  it('tras una batalla ganada vuelve el mismo individuo: mismo id, más experiencia, una batalla más', () => {
    const state = newGame({ seed: 31 });
    const c = ctx(31);
    const hero = heroesOf(state, 0)[0]!;
    hero.army = [
      { creature: 'peasant' },
      veterano('pikeman', 'veterano-x', 70),
      { creature: 'peasant' },
    ];
    ponerMonstruo(state, 'peasant', 1);
    forzarBatalla(state, c, hero);
    const b = state.pendingBattle!.battle;
    stackById(b, 'attacker-1').ganado = { experiencia: 60, bajas: 2, heroes: ['Uno'] };
    cerrar(state, 'defender');
    settleBattle(state, c);

    const army = heroById(state, hero.id).army;
    expect(army[1]).toEqual({
      creature: 'pikeman',
      veterania: { id: 'veterano-x', experiencia: 130, batallas: 2, bajas: 2, heroes: ['Uno'] },
    });
    // Los campesinos no pegaron: vuelven novatos y el contador no se mueve.
    expect(army[0]).toEqual({ creature: 'peasant' });
    expect(state.siguienteVeterano).toBe(1);
    // Y cruzó del 3 al 4: un `troop_level_up`, con su dueño.
    const sube = state.log.filter((e) => e.kind === 'troop_level_up');
    expect(sube).toMatchObject([
      { creature: 'pikeman', level: 4, veterano: 'veterano-x', actor: 0 },
    ]);
  });

  it('el primer punto le da un id del contador del estado, en orden', () => {
    const state = newGame({ seed: 31 });
    const c = ctx(31);
    const hero = heroesOf(state, 0)[0]!;
    hero.army = ejercito({ creature: 'peasant', count: 3 });
    ponerMonstruo(state, 'peasant', 1);
    forzarBatalla(state, c, hero);
    const b = state.pendingBattle!.battle;
    stackById(b, 'attacker-2').ganado.experiencia = 5;
    stackById(b, 'attacker-0').ganado.experiencia = 25;
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
    hero.army = [veterano('pikeman', 'veterano-x', 200), { creature: 'peasant' }];
    ponerMonstruo(state, 'peasant', 1);
    forzarBatalla(state, c, hero);
    const b = state.pendingBattle!.battle;
    const piquero = stackById(b, 'attacker-0');
    piquero.count = 0;
    piquero.topHp = 0;
    cerrar(state, 'defender');
    settleBattle(state, c);
    const army = heroById(state, hero.id).army;
    expect(army).toEqual([{ creature: 'peasant' }]);
  });

  it('rindiéndose, el veterano que se salva vuelve a la base con su hoja', () => {
    const state = newGame({ seed: 7 });
    const c = ctx(7);
    const base = baseOf(state, 0)!;
    base.garrison = [];
    const hero = heroesOf(state, 0)[0]!;
    hero.army = [veterano('archer', 'veterano-a', 30), { creature: 'archer' }];
    ponerMonstruo(state, 'paladin', 6);
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

  it('la guarnición que defiende y repele conserva y suma; al entrar el héroe se la lleva igual', () => {
    const state = newGame({ seed: 5 });
    const c = ctx(5);
    const base = baseOf(state, 0)!;
    const nuestro = heroesOf(state, 0)[0]!;
    // El héroe fuera de casa, pegado a ella: si estuviera dentro defendería él y
    // no la guarnición, y más lejos se encuentra con algo por el camino.
    nuestro.at = vecinaLibre(state, base.at);
    base.garrison = [veterano('pikeman', 'veterano-g', 40), { creature: 'peasant' }];
    const rival = heroesOf(state, 1)[0]!;
    rival.army = ejercito({ creature: 'peasant', count: 1 });
    state.current = 1;
    forzarBatalla(state, c, rival, base.at);
    expect(state.pendingBattle!.foe).toEqual({ kind: 'town', townId: base.id });
    const b = state.pendingBattle!.battle;
    stackById(b, 'defender-0').ganado.experiencia = 25;
    cerrar(state, 'attacker');
    settleBattle(state, c);
    expect(base.garrison[0]).toEqual({
      creature: 'pikeman',
      veterania: { id: 'veterano-g', experiencia: 65, batallas: 2, bajas: 0, heroes: [] },
    });
    // Y es el MISMO objeto el que pasa al héroe: no hay copia que se quede atrás.
    const guardado = base.garrison[0];
    state.current = 0;
    nuestro.army = [];
    nuestro.movePoints = 5000;
    applyAdventureAction(state, { type: 'move_hero', hero: nuestro.id, to: base.at }, c, 0);
    expect(heroById(state, nuestro.id).army).toContain(guardado);
  });

  it('licenciar se lleva primero a los de menos experiencia de ese tipo', () => {
    const army: Troop[] = [
      veterano('pikeman', 'v-alto', 130),
      { creature: 'pikeman' },
      veterano('pikeman', 'v-bajo', 25),
      { creature: 'peasant' },
      { creature: 'pikeman' },
    ];
    // Los dos novatos primero, del final hacia delante.
    expect(sinIndividuos(army, 'pikeman', 1)).toEqual([army[0], army[1], army[2], army[3]]);
    expect(sinIndividuos(army, 'pikeman', 2)).toEqual([army[0], army[2], army[3]]);
    // Luego el de menos experiencia, y el veterano de verdad el último.
    expect(sinIndividuos(army, 'pikeman', 3)).toEqual([army[0], army[3]]);
    expect(sinIndividuos(army, 'pikeman', 4)).toEqual([army[3]]);
    // `elQueSeIria` es la regla de la que cuelgan los tres —la acción, la IA y
    // el botón del panel— y nombra al mismo que quita `sinIndividuos`.
    expect(elQueSeIria(army, 'pikeman')).toBe(army[4]);
    expect(elQueSeIria([army[0]!, army[2]!], 'pikeman')).toBe(army[2]);
    expect(elQueSeIria(army, 'archer')).toBeNull();
    // Un personaje no se licencia: no es nunca el que se iría.
    expect(elQueSeIria([{ creature: 'pikeman', member: 'aren' }], 'pikeman')).toBeNull();
  });

  it('`dismiss` licencia al novato de su tipo y deja al veterano en el ejército', () => {
    const state = newGame({ seed: 5 });
    const c = ctx(5);
    const hero = heroesOf(state, 0)[0]!;
    hero.at = baseOf(state, 0)!.at;
    const vet = veterano('pikeman', 'v-1', 60);
    hero.army = [vet, { creature: 'pikeman' }];
    applyAdventureAction(
      state,
      { type: 'dismiss', hero: hero.id, creature: 'pikeman', count: 1 },
      c,
      0,
    );
    expect(heroById(state, hero.id).army).toEqual([vet]);
  });

  it('un veterano no cabe en unos grupos ni en un stack de N: lanza en vez de perder la hoja', () => {
    expect(() => gruposDe([veterano('pikeman', 'v-1', 30)])).toThrow(
      'el Piquero veterano v-1 no cabe en unos grupos de tropa: perdería su experiencia',
    );
    expect(() =>
      createBattle(
        { army: [{ creature: 'pikeman', count: 3, veterania: hoja('v-1', 30) }], hero: null },
        { army: [{ creature: 'peasant', count: 1 }], hero: null },
        createRng(1),
      ),
    ).toThrow('el veterano v-1 es uno solo y viene en un stack de 3');
  });
});

// ---------------------------------------------------------------- C4

describe('cifras por nivel, en una sola puerta (C4)', () => {
  it('las cifras de un veterano se guardan por su hoja, y otra hoja u otra criatura se recalculan', () => {
    const h = hoja('v-c', 130);
    const piquero = creature('pikeman');
    const a = cifrasDeCatalogo('pikeman', h);
    // Nivel 4: +3, y recibe con 3 + 3.
    expect(a).toMatchObject({ attack: piquero.attack + 3, nivel: piquero.level + 3 });
    // La misma hoja da el MISMO objeto: `armyPower` ya no fabrica uno por pregunta.
    expect(cifrasDeCatalogo('pikeman', h)).toBe(a);
    // Más experiencia es otra hoja —`settleBattle` escribe una nueva—: otras cifras.
    expect(cifrasDeCatalogo('pikeman', hoja('v-c', 220)).attack).toBe(piquero.attack + 4);
    // La misma hoja en otra criatura no presta las del piquero.
    expect(cifrasDeCatalogo('archer', h)).toMatchObject({
      name: creature('archer').name,
      attack: creature('archer').attack + 3,
    });
    expect(cifrasDeCatalogo('pikeman', h)).toMatchObject({ name: piquero.name });
    // Y un novato es la referencia del catálogo.
    expect(cifrasDeCatalogo('pikeman', undefined)).toBe(piquero);
  });

  it('un piquero de nivel 3 entra con ataque y defensa +2, y rendirse lo cobra a su precio', () => {
    const v = veterano('pikeman', 'v-1', 60);
    expect(nivelDeTropa(v.veterania)).toBe(3);
    const b = createBattle(
      {
        army: [{ ...v, count: 1 }],
        hero: { ...conHeroe([]).hero!, mando: mando({ retreat: { purse: 10_000 } }) },
      },
      { army: [{ creature: 'peasant', count: 1 }], hero: null },
      createRng(1),
    );
    const s = stackById(b, 'attacker-0');
    const base = creature('pikeman');
    expect(s.unit.attack).toBe(base.attack + 2 * EXPERIENCIA.porNivel.ataque);
    expect(s.unit.defense).toBe(base.defense + 2 * EXPERIENCIA.porNivel.defensa);
    expect(s.unit.hp).toBe(base.hp);
    // Antes el precio salía de la referencia del catálogo, que un veterano ya
    // no lleva: el oro viaja en el origen.
    expect(surrenderBlocker(b, 'attacker').coste).toBe(
      Math.ceil(((base.cost.gold ?? 0) * HEROE.rendicion.porcentajeDelOro) / 100),
    );
  });

  it('un novato sigue llevando la MISMA referencia del catálogo', () => {
    const b = createBattle(
      { army: [{ creature: 'pikeman', count: 1 }], hero: null },
      { army: [{ creature: 'peasant', count: 1 }], hero: null },
      createRng(1),
    );
    expect(stackById(b, 'attacker-0').unit).toBe(creature('pikeman'));
    expect(cifrasVeteranas(creature('pikeman'), 1)).toBe(creature('pikeman'));
  });

  it('las dos puertas de cifras dan lo mismo: `troopUnit` y lo que pisa el tablero', () => {
    // Una criatura veterana y un personaje veterano. Si cada puerta sumara la
    // veteranía por su cuenta, el día que cambie `porNivel` divergirían.
    const aren = createCharacter('aren', defaultBuild);
    const criatura = veterano('swordsman', 'v-1', 220);
    const personaje: Troop = {
      creature: 'character',
      member: aren.id,
      veterania: hoja('v-2', 120),
    };
    const b = createBattle(
      {
        army: [
          { ...criatura, count: 1 },
          { ...personaje, count: 1 },
        ],
        hero: null,
        members: new Map([[aren.id, { profile: combatProfile(aren), hp: aren.hp, nivel: 1 }]]),
      },
      { army: [{ creature: 'peasant', count: 1 }], hero: null },
      createRng(1),
    );
    expect(stackById(b, 'attacker-0').unit).toEqual(troopUnit(criatura, undefined));
    expect(stackById(b, 'attacker-1').unit).toEqual(troopUnit(personaje, { aren }));
    expect(stackById(b, 'attacker-1').unit.attack).toBe(combatProfile(aren).unit.attack + 3);
    // Y el personaje recibe con su nivel más la veteranía.
    expect(stackById(b, 'attacker-1').unit.nivel).toBe(1 + 4 - 1);
  });
});

// ---------------------------------------------------------------- C5

describe('las habilidades por nivel están en datos y son del catálogo (C5)', () => {
  it('el catálogo sale del cuaderno: las 37 del usuario, sin repetir', () => {
    expect(CATALOGO_DE_HABILIDADES).toHaveLength(37);
    expect(new Set(CATALOGO_DE_HABILIDADES).size).toBe(37);
    expect(CATALOGO_DE_HABILIDADES).toContain('Antiinfantería montada');
  });

  it('un nombre inventado hace lanzar a `data.ts` diciendo cuál (sonda)', () => {
    const roto = structuredClone(EXPERIENCIA) as unknown as {
      habilidades: Record<string, string[]>;
    };
    roto.habilidades.pikeman = ['Alcance', 'Lanza de fuego', 'Formación cerrada', 'Contraataque'];
    expect(() => validarExperiencia(roto, CATALOGO_DE_HABILIDADES, catalogoDeCriaturas())).toThrow(
      'habilidades.pikeman: "Lanza de fuego" no está en el catálogo',
    );
  });

  it('y también si falta una criatura o sobra una que no existe', () => {
    const roto = structuredClone(EXPERIENCIA) as unknown as {
      habilidades: Record<string, unknown>;
    };
    delete roto.habilidades.peasant;
    roto.habilidades.dragon = ['Miedo', 'Miedo', 'Miedo', 'Miedo'];
    const lanzar = () => validarExperiencia(roto, CATALOGO_DE_HABILIDADES, catalogoDeCriaturas());
    expect(lanzar).toThrow('falta la criatura "peasant"');
    expect(lanzar).toThrow('"dragon" no es ninguna criatura del catálogo');
  });
});

// ---------------------------------------------------------------- C7

describe('la veteranía se ve (C7)', () => {
  it('`troopSummary` saca a cada veterano en su fila, con su nivel y lo que le falta', () => {
    const army: Troop[] = [
      { creature: 'pikeman' },
      veterano('pikeman', 'v-1', 70),
      { creature: 'pikeman' },
      veterano('pikeman', 'v-2', 999),
    ];
    const filas = troopSummary(army, undefined);
    expect(filas.map((g) => [g.count, g.nivel, g.siguiente, g.veterania?.id])).toEqual([
      [2, 1, null, undefined],
      [1, 3, 120, 'v-1'],
      [1, 5, null, 'v-2'],
    ]);
  });

  it('el agente ve `level`, `experience` y `nextLevelAt` de su tropa veterana', () => {
    const state = newGame({ seed: 3 });
    const hero = heroesOf(state, 0)[0]!;
    hero.army = [{ creature: 'pikeman' }, veterano('pikeman', 'v-1', 70)];
    const turno = serializeAdventureTurn(state, 0) as {
      heroes: { id: string; army: Record<string, unknown>[] }[];
    };
    const army = turno.heroes.find((h) => h.id === hero.id)!.army;
    expect(army[0]).not.toHaveProperty('level');
    expect(army[1]).toMatchObject({ creature: 'pikeman', count: 1, level: 3, experience: 70 });
    expect(army[1]!.nextLevelAt).toBe(120);
  });

  it('la figura lleva un galón por nivel por encima del 1, y «· nivel N» en el campo', () => {
    const b = createBattle(
      conHeroe([
        { creature: 'pikeman', count: 1 },
        { creature: 'pikeman', count: 1, veterania: hoja('v-1', 12) },
        { creature: 'pikeman', count: 1, veterania: hoja('v-2', 60) },
        { creature: 'pikeman', count: 1, veterania: hoja('v-3', 5000) },
      ]),
      { army: [{ creature: 'peasant', count: 1 }], hero: null },
      createRng(1),
    );
    const ids = ['attacker-0', 'attacker-1', 'attacker-2', 'attacker-3', 'attacker-heroe'];
    expect(ids.map((id) => galonesDe(stackById(b, id)))).toEqual([0, 0, 2, 4, 0]);
    expect(ids.map((id) => marcaDeVeterano(stackById(b, id)))).toEqual([
      '',
      '',
      ' · nivel 3',
      ' · nivel 5',
      '',
    ]);
    // Y el tercer lector de `nivelDeVeterania`, el agente, ve lo mismo: el
    // `veteranLevel` desde el nivel 2, como promete la prosa. Antes salía
    // `veteranLevel: 1` para quien tenía hoja sin llegar al 2.
    const vista = serializeBattleTurn(b, 'attacker', 'ajena', null) as {
      stacks: { id: string; veteranLevel?: number }[];
    };
    expect(ids.map((id) => vista.stacks.find((x) => x.id === id)!.veteranLevel)).toEqual([
      undefined,
      undefined,
      3,
      5,
      undefined,
    ]);
  });

  it('`troop_level_up` pasa la niebla como `level_up`: lo tuyo siempre, lo ajeno si se veía', () => {
    const base = { creature: 'pikeman', level: 3, veterano: 'v', at: null } as const;
    const mio = { ...base, kind: 'troop_level_up', actor: 0, seen: [] } as const;
    const suyoVisto = { ...base, kind: 'troop_level_up', actor: 1, seen: [0] } as const;
    const suyoOculto = { ...base, kind: 'troop_level_up', actor: 1, seen: [] } as const;
    expect(visibleTo(mio, 0)).toBe(true);
    expect(visibleTo(suyoVisto, 0)).toBe(true);
    expect(visibleTo(suyoOculto, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------- C8

describe('la IA no tira a la tropa veterana (C8)', () => {
  it('para meter algo mejor licencia a los novatos antes que al veterano, aunque sea más caro', () => {
    const state = newGame({ seed: 5 });
    const hero = heroesOf(state, 0)[0]!;
    const base = baseOf(state, 0)!;
    hero.at = base.at;
    base.garrison = [];
    // Un campesino de nivel 3 y cinco arqueros novatos. El campesino es lo más
    // barato del ejército (20 de oro contra 150): con la regla de antes era el
    // primero en irse. Ahora se van antes los arqueros, que son novatos.
    hero.army = [veterano('peasant', 'v-1', 60), ...ejercito({ creature: 'archer', count: 5 })];
    base.buildings.push('knight_dwelling_6' as never);
    // Uno solo disponible: para meterlo hay que liberar 7 de liderazgo, que son
    // tres arqueros. Con tres, la IA se lo llevaría todo —veterano incluido, el
    // último— para meter dos.
    base.available = { ...base.available, paladin: 1 };
    state.players[0]!.resources = { ...state.players[0]!.resources, gold: 50_000 };
    const acciones = planRecruits(state, 0);
    // (Detrás recluta un campesino con el hueco que queda: no es asunto de este test.)
    expect(acciones.slice(0, 2)).toEqual([
      { type: 'dismiss', hero: hero.id, creature: 'archer', count: 3 },
      { type: 'recruit', town: base.id, creature: 'paladin', count: 1 },
    ]);
    expect(acciones.some((a) => a.type === 'dismiss' && a.creature === 'peasant')).toBe(false);
  });
});

// ------------------------------------------------- una sola escala de niveles

describe('una sola escala de niveles: el héroe empieza donde acaba la tropa', () => {
  it('el nivel inicial del héroe ES el tope de la tropa, y nace con su experiencia', () => {
    expect(NIVEL_INICIAL_DE_HEROE).toBe(NIVEL_MAXIMO_DE_TROPA);
    expect(EXPERIENCIA_INICIAL_DE_HEROE).toBe(umbral(5));
    expect(EXPERIENCIA_INICIAL_DE_HEROE).toBe(220);
    // Y esa experiencia da ese nivel: no es un 5 escrito a mano encima de un 4.
    expect(nivelDe(EXPERIENCIA_INICIAL_DE_HEROE)).toBe(5);
  });

  it('los iniciales y los contratados nacen en el 5 con 220', () => {
    const state = newGame({ seed: 7 });
    for (const h of state.heroes) {
      expect(h.experience, h.id).toBe(220);
      expect(nivelDeHeroe(h), h.id).toBe(5);
      // El nivel no se guarda: se deriva, así que no hay dos datos que cuadrar.
      expect('level' in h, h.id).toBe(false);
    }
    const hero = heroesOf(state, 0)[0]!;
    const base = baseOf(state, 0)!;
    hero.at = { x: base.at.x + 1, y: base.at.y };
    state.players[0]!.resources = { ...state.players[0]!.resources, gold: 50_000 };
    applyAdventureAction(state, { type: 'hire_hero', town: base.id }, ctx(7), 0);
    const nuevo = heroesOf(state, 0).find((h) => h.id !== hero.id)!;
    expect(nuevo.experience).toBe(220);
    expect(nivelDeHeroe(nuevo)).toBe(5);
    expect('level' in nuevo).toBe(false);
  });

  it('las cifras se reindexan: uno de nivel 5 tiene lo que antes uno de nivel 1', () => {
    const c = HEROE.combate;
    // Lo que daba la fórmula vieja con `level − 1 = 0`: las bases del JSON.
    expect(
      heroUnit({ name: 'X', attack: 2, defense: 2, experience: umbral(5), equipo: {} }),
    ).toMatchObject({
      attack: 2,
      defense: 2,
      hp: c.pv.base,
      damage: [c.danio.min, c.danio.max],
    });
    expect(heroLeadership({ experience: umbral(5) })).toBe(LIDERAZGO.heroe.base);
    // Y cada nivel por encima suma lo de uno, como antes del 1 al 2.
    expect(
      heroUnit({ name: 'X', attack: 2, defense: 2, experience: umbral(6), equipo: {} }).hp,
    ).toBe(c.pv.base + c.pv.porNivel);
    expect(heroLeadership({ experience: umbral(6) })).toBe(
      LIDERAZGO.heroe.base + LIDERAZGO.heroe.porNivel,
    );
  });

  it('un héroe por debajo del 5 no existe, y decirlo es lanzar', () => {
    expect(subidasDeHeroe(5)).toBe(0);
    expect(() => subidasDeHeroe(1)).toThrow(
      'un héroe de nivel 1 no existe: todo héroe empieza en el 5, la escala es la de la tropa',
    );
    expect(() =>
      heroUnit({ name: 'X', attack: 0, defense: 0, experience: umbral(4), equipo: {} }),
    ).toThrow(/nivel 4/);
    expect(() => heroLeadership({ experience: umbral(4) })).toThrow(/nivel 4/);
  });

  it('el agente ve el nivel del héroe con su experiencia y el umbral siguiente', () => {
    const state = newGame({ seed: 7 });
    const turno = serializeAdventureTurn(state, 0) as { heroes: Record<string, unknown>[] };
    expect(turno.heroes[0]).toMatchObject({ level: 5, experience: 220, nextLevelAt: 380 });
  });

  it('el primer ascenso del héroe es al 6 y cuesta 160, no 20', () => {
    expect(siguienteUmbral(EXPERIENCIA_INICIAL_DE_HEROE)).toBe(380);
    expect(nivelDe(EXPERIENCIA_INICIAL_DE_HEROE + 159)).toBe(5);
    expect(nivelDe(EXPERIENCIA_INICIAL_DE_HEROE + 160)).toBe(6);
  });
});
