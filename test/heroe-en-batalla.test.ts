/**
 * El héroe en el tablero, la rendición y la vuelta a la base (fase 1b de
 * NuevaJugabilidad).
 *
 * Los casos salen de los criterios 4, 5 y 6 del plan y de las tres decisiones
 * del usuario sobre él —la rendición paga oro, caer en la propia base la
 * conquista y ningún bando pasa de 7—, no del código: el héroe es una figura
 * más y si cae su bando pierde; rendirse cuesta oro, conserva la tropa viva y
 * no se ofrece ni sin héroe ni sin base ni defendiéndola; y el héroe que pierde
 * reaparece en su base, salvo que ya no la tenga.
 */
import { describe, expect, it } from 'vitest';
import { Session } from '../src/client/session.js';
import { chooseBattleAction } from '../src/core/ai/tactics.js';
import {
  activeStack,
  applyAction,
  type BattleSide,
  createBattle,
  type HeroeDelBando,
  legalActions,
  stackById,
  surrenderBlocker,
} from '../src/core/battle/battle.js';
import type { BattleState, Side } from '../src/core/battle/types.js';
import { creature, HEROE } from '../src/core/data.js';
import { umbral } from '../src/core/hero/experiencia.js';
import { HERO_BODY, type Hero, heroUnit } from '../src/core/hero/hero.js';
import { troopsAsStacks } from '../src/core/hero/troop.js';
import {
  isEnterable,
  objectAt,
  pointFromKey,
  pointKey,
  reachableFrom,
} from '../src/core/map/map.js';
import { createRng } from '../src/core/rng.js';
import {
  baseOf,
  type GameContext,
  type GameState,
  heroById,
  heroesOf,
  resolvePendingBattle,
  settleBattle,
  townsOf,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import type { Army, Point, Stack } from '../src/core/types.js';
import { avanzarHasta, costesDelAlcance, ejercito, forzarBatalla } from './helpers.js';

const ctx = (seed: number): GameContext => ({ rng: createRng(seed) });

/** Un héroe de batalla con su cuerpo y, si se pide, con monedero para rendirse. */
function heroeDeBatalla(purse: number | null = null): HeroeDelBando {
  return {
    cuerpo: heroUnit({ name: 'Prueba', attack: 2, defense: 2, experience: umbral(5), equipo: {} }),
    mando: {
      name: 'Prueba',
      retreat: purse === null ? { blocked: 'no tienes base a la que volver' } : { purse },
      ataque: 2,
      defensa: 2,
      spellPower: 1,
      knowledge: 1,
      mana: 0,
      castThisRound: false,
      spells: [],
    },
  };
}

/** Un bando de individuos, uno por stack, como los manda la partida. */
const lado = (army: Army, hero: HeroeDelBando | null): BattleSide => ({
  army: troopsAsStacks(army),
  hero,
});

/** Juega con la IA de reglas hasta que le toque a `side`, sin terminar la batalla. */
function hastaQueLeToque(state: BattleState, side: Side): void {
  const toca = (b: BattleState): boolean => activeStack(b)?.side === side;
  if (!avanzarHasta(state, createRng(77), toca, chooseBattleAction)) {
    throw new Error(`no le tocó al ${side} antes de acabar la batalla`);
  }
}

/**
 * Una casilla libre —sin objeto, sin héroe, que se pueda pisar— con otra libre
 * justo a su izquierda, buscando desde `cerca` en el orden del Dijkstra. Es
 * donde se monta un duelo de héroes lejos de cualquier castillo.
 */
function duelo(state: GameState, cerca: Point): Point {
  const libre = (p: Point): boolean =>
    isEnterable(state.map, p) &&
    objectAt(state.map, p) === undefined &&
    !state.heroes.some((h) => pointKey(h.at) === pointKey(p));
  // Si `cerca` cae en una barrera (el centro del mapa de la semilla 7 desde que
  // las fronteras ondulan, #229), se busca desde la casilla pisable más cercana,
  // anillo a anillo: desde una barrera no se alcanza nada.
  let desde = cerca;
  for (let r = 0; !isEnterable(state.map, desde); r++) {
    const anillo: Point[] = [];
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r)
          anillo.push({ x: cerca.x + dx, y: cerca.y + dy });
    const pisable = anillo.find(
      (p) =>
        p.x >= 0 &&
        p.y >= 0 &&
        p.x < state.map.width &&
        p.y < state.map.height &&
        isEnterable(state.map, p),
    );
    if (pisable !== undefined) desde = pisable;
    if (r > state.map.width)
      throw new Error('no hay sitio para un duelo: el mapa no tiene casilla pisable');
  }
  for (const clave of costesDelAlcance(reachableFrom(state.map, desde)).keys()) {
    const defensa = pointFromKey(clave);
    // A su izquierda, porque ahí coloca `forzarBatalla` al atacante.
    if (libre(defensa) && libre({ x: defensa.x - 1, y: defensa.y })) return defensa;
  }
  throw new Error('no hay sitio para un duelo');
}

/**
 * Monta una batalla de héroe contra héroe en la casilla `defensa` (o en el
 * medio del mapa), con los ejércitos que se pidan, y la deja pendiente.
 */
function batallaDeHeroes(
  state: GameState,
  c: GameContext,
  ataque: Stack[],
  defensa: Stack[],
  enDefensa?: Point,
): { atacante: Hero; defensor: Hero } {
  const atacante = heroesOf(state, 0)[0]!;
  const defensor = heroesOf(state, 1)[0]!;
  atacante.army = ejercito(...ataque);
  defensor.army = ejercito(...defensa);
  defensor.at =
    enDefensa ??
    duelo(state, { x: Math.floor(state.map.width / 2), y: Math.floor(state.map.height / 2) });
  state.current = 0;
  forzarBatalla(state, c, atacante, defensor.at);
  return { atacante, defensor };
}

describe('el héroe pisa el tablero (criterio 4)', () => {
  it('cada bando con héroe lleva exactamente un `commander`, con el cuerpo de `heroUnit`', () => {
    const state = newGame({ seed: 3 });
    const { atacante, defensor } = batallaDeHeroes(
      state,
      ctx(3),
      [{ creature: 'peasant', count: 3 }],
      [{ creature: 'skeleton', count: 2 }],
    );
    const batalla = state.pendingBattle!.battle;
    for (const [side, hero] of [
      ['attacker', atacante],
      ['defender', defensor],
    ] as const) {
      const suyos = batalla.stacks.filter((s) => s.side === side && s.origen.kind === 'heroe');
      expect(suyos).toHaveLength(1);
      expect(suyos[0]!.id).toBe(`${side}-heroe`);
      expect(suyos[0]!.body).toBe(HERO_BODY);
      expect(suyos[0]!.unit).toEqual(heroUnit(hero));
      // Entra sano: sin heridas que arrastrar (decisión del usuario).
      expect(suyos[0]!.topHp).toBe(heroUnit(hero).hp);
    }
  });

  it('el cuerpo sale de `data/heroe.json` y crece con el nivel', () => {
    const c = HEROE.combate;
    // Dos niveles por encima del inicial (el 5): dos `porNivel`.
    const nivel7 = heroUnit({
      name: 'X',
      attack: 2,
      defense: 3,
      experience: umbral(7),
      equipo: {},
    });
    expect(nivel7.hp).toBe(c.pv.base + 2 * c.pv.porNivel);
    expect(nivel7.attack).toBe(2 + 2 * c.ataquePorNivel);
    expect(nivel7.defense).toBe(3 + 2 * c.defensaPorNivel);
    expect(nivel7.damage).toEqual([c.danio.min, c.danio.max + 2 * c.danio.maxPorNivel]);
    expect(nivel7.speed).toBe(c.velocidad);
    // Sin facción: no altera la moral por diversidad del ejército.
    expect(nivel7.faction).toBeNull();
  });

  it('un monstruo o una guarnición no tienen comandante', () => {
    const b = createBattle(
      lado(ejercito({ creature: 'peasant', count: 3 }), heroeDeBatalla()),
      lado(ejercito({ creature: 'skeleton', count: 3 }), null),
      createRng(1),
    );
    expect(b.stacks.filter((s) => s.origen.kind === 'heroe').map((s) => s.side)).toEqual([
      'attacker',
    ]);
  });

  it('matar al héroe da la batalla al rival aunque a su bando le quede tropa', () => {
    const rng = createRng(4);
    const b = createBattle(
      lado(ejercito({ creature: 'paladin', count: 2 }), heroeDeBatalla()),
      lado(ejercito({ creature: 'skeleton', count: 5 }), heroeDeBatalla()),
      rng,
    );
    const comandante = stackById(b, 'defender-heroe');
    comandante.topHp = 1;
    // El atacante que actúa se pone pegado al héroe rival y le pega.
    hastaQueLeToque(b, 'attacker');
    const activo = activeStack(b)!;
    activo.hex = { col: comandante.hex.col - 1, row: comandante.hex.row };
    applyAction(b, { type: 'attack', target: comandante.id }, rng);

    expect(b.finished?.winner).toBe('attacker');
    // Su tropa seguía en pie: es la caída del héroe lo que decide.
    expect(
      b.stacks.some((s) => s.side === 'defender' && s.origen.kind !== 'heroe' && s.count > 0),
    ).toBe(true);
  });

  it('el héroe ocupa el séptimo puesto: seis de tropa caben y siete no', () => {
    const seis = createBattle(
      lado(ejercito({ creature: 'peasant', count: 6 }), heroeDeBatalla()),
      lado(ejercito({ creature: 'skeleton', count: 7 }), null),
      createRng(1),
    );
    expect(seis.stacks.filter((s) => s.side === 'attacker')).toHaveLength(7);
    expect(() =>
      createBattle(
        lado(ejercito({ creature: 'peasant', count: 7 }), heroeDeBatalla()),
        lado(ejercito({ creature: 'skeleton', count: 3 }), null),
        createRng(1),
      ),
    ).toThrow('no caben: el atacante trae 8 y un bando lleva como mucho 7');
  });
});

describe('la rendición (criterio 5)', () => {
  it('cuesta el ⌈50 %⌉ del oro de catálogo de la tropa viva, sin contar al héroe', () => {
    const b = createBattle(
      lado(
        ejercito({ creature: 'skeleton', count: 1 }, { creature: 'zombie', count: 2 }),
        heroeDeBatalla(10_000),
      ),
      lado(ejercito({ creature: 'peasant', count: 3 }), null),
      createRng(2),
    );
    const oro = creature('skeleton').cost.gold! + 2 * creature('zombie').cost.gold!; // 375
    expect(surrenderBlocker(b, 'attacker').coste).toBe(
      Math.ceil((oro * HEROE.rendicion.porcentajeDelOro) / 100),
    );
    expect(surrenderBlocker(b, 'attacker').coste).toBe(188); // 187,5 hacia arriba
    // Los muertos no se salvan, así que no se pagan.
    stackById(b, 'attacker-1').count = 0;
    expect(surrenderBlocker(b, 'attacker').coste).toBe(113); // (75 + 150) / 2 = 112,5
  });

  it('se ofrece cuando se puede, y lo que dice la lista es lo que acepta el motor', () => {
    const b = createBattle(
      lado(ejercito({ creature: 'skeleton', count: 2 }), heroeDeBatalla(500)),
      lado(ejercito({ creature: 'peasant', count: 3 }), null),
      createRng(3),
    );
    hastaQueLeToque(b, 'attacker');
    // Con su precio puesto (H-2): quien decide sabe lo que paga antes de pagarlo.
    expect(legalActions(b)).toContainEqual({ type: 'surrender', gold: 75 });
    // Un precio que no es el de ahora se rechaza, en vez de cobrar otro callando.
    expect(() => applyAction(b, { type: 'surrender', gold: 40 }, createRng(3))).toThrow(
      'no se puede rendir por 40 de oro: ahora cuesta 75',
    );
    expect(b.finished).toBeNull();
    applyAction(b, { type: 'surrender', gold: 75 }, createRng(3));
    // El precio, una vez: en `finished`. Quién se rindió es el que pierde.
    expect(b.finished).toEqual({ winner: 'defender', surrender: { gold: 75 } });
    expect(b.log.slice(-2)).toEqual([
      { kind: 'surrender', side: 'attacker' },
      { kind: 'finished', winner: 'defender' },
    ]);
  });

  it('sin héroe, sin oro o sin base no se ofrece, y la frase dice por qué', () => {
    const sinOro = createBattle(
      lado(ejercito({ creature: 'skeleton', count: 2 }), heroeDeBatalla(10)),
      lado(ejercito({ creature: 'peasant', count: 3 }), null),
      createRng(3),
    );
    expect(surrenderBlocker(sinOro, 'attacker').motivo).toBe('cuesta 75 de oro y tienes 10');
    expect(surrenderBlocker(sinOro, 'defender').motivo).toBe('este bando no tiene héroe');
    const sinBase = createBattle(
      lado(ejercito({ creature: 'skeleton', count: 2 }), heroeDeBatalla()),
      lado(ejercito({ creature: 'peasant', count: 3 }), null),
      createRng(3),
    );
    expect(surrenderBlocker(sinBase, 'attacker').motivo).toBe('no tienes base a la que volver');

    hastaQueLeToque(sinOro, 'attacker');
    expect(legalActions(sinOro).some((a) => a.type === 'surrender')).toBe(false);
    expect(() => applyAction(sinOro, { type: 'surrender' }, createRng(3))).toThrow(
      'no se puede rendir: cuesta 75 de oro y tienes 10',
    );
  });

  it('defendiendo la propia base no hay a dónde huir', () => {
    const state = newGame({ seed: 5 });
    const base = baseOf(state, 1)!;
    batallaDeHeroes(
      state,
      ctx(5),
      [{ creature: 'paladin', count: 4 }],
      [{ creature: 'skeleton', count: 2 }],
      base.at,
    );
    expect(surrenderBlocker(state.pendingBattle!.battle, 'defender').motivo).toBe(
      'defiendes tu base: no hay a dónde huir',
    );
    // Y el atacante, lejos de la suya, sí puede.
    expect(surrenderBlocker(state.pendingBattle!.battle, 'attacker').motivo).toBeNull();
  });

  it('la IA de reglas se rinde cuando pierde de largo y tiene tropa que salvar', () => {
    const b = createBattle(
      lado(ejercito({ creature: 'peasant', count: 3 }), heroeDeBatalla(1000)),
      lado(ejercito({ creature: 'paladin', count: 6 }), heroeDeBatalla()),
      createRng(6),
    );
    hastaQueLeToque(b, 'attacker');
    expect(chooseBattleAction(b)).toEqual({ type: 'surrender' });
  });

  it('y no se rinde si no le queda tropa: rendirse solo con el héroe es pagar por nada', () => {
    const b = createBattle(
      lado([], heroeDeBatalla(1000)),
      lado(ejercito({ creature: 'paladin', count: 6 }), heroeDeBatalla()),
      createRng(6),
    );
    hastaQueLeToque(b, 'attacker');
    expect(chooseBattleAction(b)).not.toEqual({ type: 'surrender' });
  });
});

describe('el héroe vencido vuelve a la base (criterio 6)', () => {
  it('rendido: vuelve con la tropa viva, paga el oro y no cuenta como caído', () => {
    const state = newGame({ seed: 7 });
    const c = ctx(7);
    const base = baseOf(state, 0)!;
    base.garrison = [];
    const { atacante } = batallaDeHeroes(
      state,
      c,
      [{ creature: 'archer', count: 3 }],
      [{ creature: 'skeleton', count: 2 }],
    );
    const batalla = state.pendingBattle!.battle;
    hastaQueLeToque(batalla, 'attacker');
    const vivos = batalla.stacks.filter(
      (s) => s.side === 'attacker' && s.origen.kind !== 'heroe' && s.count > 0,
    ).length;
    const oroAntes = state.players[0]!.resources.gold;
    const desde = state.log.length;
    applyAction(batalla, { type: 'surrender' }, c.rng);
    const precio = batalla.finished!.surrender!.gold;
    expect(precio).toBe(Math.ceil((vivos * creature('archer').cost.gold! * 50) / 100));
    settleBattle(state, c);

    const vuelto = heroById(state, atacante.id);
    expect(vuelto.at).toEqual(base.at);
    expect(vuelto.army).toEqual(ejercito({ creature: 'archer', count: vivos }));
    expect(vuelto.movePoints).toBe(0);
    expect(state.players[0]!.resources.gold).toBe(oroAntes - precio);
    const hechos = state.log.slice(desde);
    expect(hechos.some((e) => e.kind === 'hero_defeated')).toBe(false);
    expect(hechos.find((e) => e.kind === 'hero_returned')).toMatchObject({
      hero: atacante.id,
      town: base.id,
      surrendered: true,
      actor: 0,
      at: base.at,
    });
  });

  it('derrotado: cae, vuelve con el ejército vacío y sin movimiento, en ese orden', () => {
    const state = newGame({ seed: 8 });
    const c = ctx(8);
    const base = baseOf(state, 0)!;
    base.garrison = [];
    // Sin oro: tiene que caer peleando.
    state.players[0]!.resources = { ...state.players[0]!.resources, gold: 0 };
    const { atacante } = batallaDeHeroes(
      state,
      c,
      [{ creature: 'peasant', count: 2 }],
      [{ creature: 'paladin', count: 6 }],
    );
    const desde = state.log.length;
    expect(resolvePendingBattle(state, c).winner).toBe('defender');

    const vuelto = heroById(state, atacante.id);
    expect(vuelto.at).toEqual(base.at);
    expect(vuelto.army).toEqual([]);
    expect(vuelto.movePoints).toBe(0);
    const suyos = state.log
      .slice(desde)
      .filter(
        (e) => (e.kind === 'hero_defeated' || e.kind === 'hero_returned') && e.hero === atacante.id,
      )
      .map((e) => e.kind);
    expect(suyos).toEqual(['hero_defeated', 'hero_returned']);
  });

  it('si cae con tropa en pie, la tropa viva también se pierde: solo la rendición la salva', () => {
    const state = newGame({ seed: 8 });
    const c = ctx(8);
    const base = baseOf(state, 0)!;
    base.garrison = [];
    const { atacante } = batallaDeHeroes(
      state,
      c,
      [{ creature: 'pikeman', count: 3 }],
      [{ creature: 'peasant', count: 2 }],
    );
    const batalla = state.pendingBattle!.battle;
    // El héroe cae —así, a mano, para que la tropa siga entera— y el siguiente
    // turno cierra la batalla por la regla del comandante.
    const cuerpo = stackById(batalla, 'attacker-heroe');
    cuerpo.count = 0;
    cuerpo.topHp = 0;
    applyAction(batalla, { type: 'defend' }, c.rng);
    expect(batalla.finished?.winner).toBe('defender');
    expect(batalla.stacks.filter((s) => s.side === 'attacker' && s.count > 0)).toHaveLength(3);
    settleBattle(state, c);

    expect(heroById(state, atacante.id).army).toEqual([]);
    expect(heroById(state, atacante.id).at).toEqual(base.at);
  });

  it('con la base ocupada por otro héroe suyo, vuelve a la casilla libre más cercana', () => {
    const state = newGame({ seed: 9 });
    const c = ctx(9);
    const base = baseOf(state, 0)!;
    base.garrison = [];
    state.players[0]!.resources = { ...state.players[0]!.resources, gold: 0 };
    const { atacante } = batallaDeHeroes(
      state,
      c,
      [{ creature: 'peasant', count: 1 }],
      [{ creature: 'paladin', count: 6 }],
    );
    // Un segundo héroe del mismo jugador, plantado en el castillo.
    const portero: Hero = { ...atacante, id: 'portero', name: 'Portero', at: base.at, army: [] };
    state.heroes.push(portero);
    expect(resolvePendingBattle(state, c).winner).toBe('defender');

    const vuelto = heroById(state, atacante.id);
    expect(pointKey(vuelto.at)).not.toBe(pointKey(base.at));
    // La más cercana andando: pegada al castillo.
    expect(Math.max(Math.abs(vuelto.at.x - base.at.x), Math.abs(vuelto.at.y - base.at.y))).toBe(1);
    expect(objectAt(state.map, vuelto.at)).toBeUndefined();
    expect(isEnterable(state.map, vuelto.at)).toBe(true);
    expect(state.heroes.filter((h) => pointKey(h.at) === pointKey(vuelto.at))).toHaveLength(1);
  });

  it('si además las ocho vecinas están tomadas, busca más lejos y no se sube encima de nadie', () => {
    // Es la rama de la búsqueda en anchura que ninguna partida del banco pisa:
    // allí el castillo nunca está ocupado cuando alguien vuelve.
    const state = newGame({ seed: 9 });
    const c = ctx(9);
    const base = baseOf(state, 0)!;
    base.garrison = [];
    state.players[0]!.resources = { ...state.players[0]!.resources, gold: 0 };
    const { atacante } = batallaDeHeroes(
      state,
      c,
      [{ creature: 'peasant', count: 1 }],
      [{ creature: 'paladin', count: 6 }],
    );
    // Ocho héroes en el castillo y alrededor, salvo en la primera vecina que se
    // pisa: ahí un montón de oro sin recoger. Un objeto que no bloquea deja
    // pasar la búsqueda, pero no es sitio para reaparecer.
    let k = 0;
    let conOro = false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const at = { x: base.at.x + dx, y: base.at.y + dy };
        const vecina = dx !== 0 || dy !== 0;
        if (vecina && !conOro && isEnterable(state.map, at) && !objectAt(state.map, at)) {
          state.map.objects.push({
            kind: 'resource',
            id: 'oro-en-la-puerta',
            at,
            resource: 'gold',
            amount: 100,
            taken: false,
          });
          conOro = true;
          continue;
        }
        state.heroes.push({
          ...atacante,
          id: `portero-${k}`,
          name: `Portero ${k++}`,
          at,
          army: [],
        });
      }
    }
    expect(conOro).toBe(true);
    expect(resolvePendingBattle(state, c).winner).toBe('defender');

    const vuelto = heroById(state, atacante.id);
    expect(Math.max(Math.abs(vuelto.at.x - base.at.x), Math.abs(vuelto.at.y - base.at.y))).toBe(2);
    expect(objectAt(state.map, vuelto.at)).toBeUndefined();
    expect(isEnterable(state.map, vuelto.at)).toBe(true);
    expect(state.heroes.filter((h) => pointKey(h.at) === pointKey(vuelto.at))).toHaveLength(1);
  });

  it('el defensor que gana se queda con lo que tiene en pie y con el maná que gastó', () => {
    // La otra mitad de la vuelta simétrica: `settleBattle` devuelve el ejército
    // y el maná a los DOS héroes, gane quien gane.
    const state = newGame({ seed: 12 });
    const c = ctx(12);
    const { defensor } = batallaDeHeroes(
      state,
      c,
      [{ creature: 'peasant', count: 1 }],
      [{ creature: 'paladin', count: 6 }],
    );
    const batalla = state.pendingBattle!.battle;
    // Uno de sus paladines cae antes de empezar, y su héroe ha gastado maná.
    stackById(batalla, 'defender-0').count = 0;
    batalla.heroes.defender!.mana = 3;
    expect(resolvePendingBattle(state, c).winner).toBe('defender');

    const vivos = batalla.stacks.filter(
      (s) => s.side === 'defender' && s.origen.kind !== 'heroe' && s.count > 0,
    );
    expect(heroById(state, defensor.id).army).toHaveLength(vivos.length);
    expect(heroById(state, defensor.id).army.length).toBeLessThan(6);
    expect(heroById(state, defensor.id).mana).toBe(batalla.heroes.defender!.mana);
  });

  it('sin base, el que cae sale del mapa como siempre', () => {
    const state = newGame({ seed: 10 });
    const c = ctx(10);
    (state.players[0] as { base: string | null }).base = null;
    const { atacante } = batallaDeHeroes(
      state,
      c,
      [{ creature: 'peasant', count: 1 }],
      [{ creature: 'paladin', count: 6 }],
    );
    expect(resolvePendingBattle(state, c).winner).toBe('defender');
    expect(state.heroes.some((h) => h.id === atacante.id)).toBe(false);
    expect(state.log.at(-1)?.kind === 'hero_returned').toBe(false);
    expect(state.log.some((e) => e.kind === 'hero_defeated' && e.hero === atacante.id)).toBe(true);
  });

  it('derrotado defendiendo otro castillo suyo: el castillo cambia de manos y él vuelve a la base', () => {
    // La captura la decide lo que hay en la casilla, no a dónde vuelve el
    // héroe. Hasta este cambio solo se entregaba la base: un héroe que perdía
    // defendiendo otro castillo suyo volvía a casa y el castillo seguía siendo
    // suyo, con el vencedor plantado delante.
    const state = newGame({ seed: 11 });
    const c = ctx(11);
    const base = baseOf(state, 1)!;
    // El castillo del jugador 0 pasa a ser del 1, por las dos caras: el libro
    // de cuentas y la bandera del mapa.
    const otro = state.towns.find((t) => t.id !== base.id)!;
    otro.owner = 1;
    const bandera = state.map.objects.find((o) => o.kind === 'town' && o.id === otro.id)!;
    (bandera as { owner: number | null }).owner = 1;
    // Sin oro, para que caiga peleando y no se rinda (la rendición entrega el
    // castillo igual: lo que decide es la casilla).
    state.players[1]!.resources = { ...state.players[1]!.resources, gold: 0 };
    const { atacante, defensor } = batallaDeHeroes(
      state,
      c,
      [{ creature: 'paladin', count: 6 }],
      [{ creature: 'peasant', count: 1 }],
      otro.at,
    );
    expect(resolvePendingBattle(state, c).winner).toBe('attacker');

    expect(otro.owner).toBe(atacante.owner);
    expect(base.owner).toBe(1);
    const vuelto = heroById(state, defensor.id);
    expect(pointKey(vuelto.at)).toBe(pointKey(base.at));
    const tras = state.log.slice(state.log.findIndex((e) => e.kind === 'battle_ended'));
    // Los ascensos van pegados al `battle_ended`, antes de cualquier
    // consecuencia: se cobran con los dos héroes todavía en el mapa.
    const ascensos = (k: string) => k === 'level_up' || k === 'troop_level_up';
    const kinds = tras.map((e) => e.kind);
    const primeraConsecuencia = kinds.findIndex((k, i) => i > 0 && !ascensos(k));
    expect(kinds.slice(1, primeraConsecuencia).every(ascensos)).toBe(true);
    expect(kinds.slice(primeraConsecuencia).some(ascensos)).toBe(false);
    // Y en casa recoge la guarnición con la que nació la base: vuelve sin
    // tropa y se lleva lo que le quepa.
    expect(kinds.filter((k) => !ascensos(k))).toEqual([
      'battle_ended',
      'town_captured',
      'hero_defeated',
      'hero_returned',
      'garrison_taken',
    ]);
  });

  it('derrotado en su propia base: la base cambia de manos y el héroe se pierde', () => {
    const state = newGame({ seed: 11 });
    const c = ctx(11);
    const base = baseOf(state, 1)!;
    const { atacante, defensor } = batallaDeHeroes(
      state,
      c,
      [{ creature: 'paladin', count: 6 }],
      [{ creature: 'peasant', count: 1 }],
      base.at,
    );
    expect(resolvePendingBattle(state, c).winner).toBe('attacker');

    expect(base.owner).toBe(atacante.owner);
    expect(state.heroes.some((h) => h.id === defensor.id)).toBe(false);
    const tras = state.log.slice(state.log.findIndex((e) => e.kind === 'battle_ended'));
    const kinds = tras.map((e) => e.kind);
    expect(kinds).toContain('town_captured');
    expect(kinds.indexOf('hero_defeated')).toBeGreaterThan(kinds.indexOf('town_captured'));
    expect(kinds).not.toContain('hero_returned');
    // Pierde la base y con ella la partida, y `game_over` es lo último.
    expect(townsOf(state, 1)).toHaveLength(0);
    expect(state.log.find((e) => e.kind === 'player_defeated')).toMatchObject({
      actor: 1,
      reason: 'lost_base',
    });
    expect(state.log.at(-1)?.kind).toBe('game_over');
    expect(state.finished?.winner).toBe(0);
  });
});

/**
 * H-1 de la QA de la fase 1b: la IA de reglas resolvía también las defensas de
 * la persona (`playAiTurn` sin `takeover`) y se rendía por ella, cobrándole el
 * oro sin preguntarle ni decírselo — 81 rendiciones en 51 de 200 partidas en el
 * asiento de la persona. Pelear por otro, sí; rendirse por otro, nunca.
 */
describe('la IA no se rinde por quien no es ella (H-1)', () => {
  it('con el bando vetado, la misma posición que daba «rendirse» da otra cosa', () => {
    const b = createBattle(
      lado(ejercito({ creature: 'peasant', count: 3 }), heroeDeBatalla(1000)),
      lado(ejercito({ creature: 'paladin', count: 6 }), heroeDeBatalla()),
      createRng(6),
    );
    hastaQueLeToque(b, 'attacker');
    // La sonda: sin veto se rinde, así que el veto es lo único que cambia.
    expect(chooseBattleAction(b)).toEqual({ type: 'surrender' });
    expect(chooseBattleAction(b, new Set(['attacker']))).not.toEqual({ type: 'surrender' });
    // Y el veto es por bando: el del rival no frena al que sí es suyo.
    expect(chooseBattleAction(b, new Set(['defender']))).toEqual({ type: 'surrender' });
  });

  /** Una batalla del jugador 0, perdida de largo y con oro para rendirse. */
  function perdidaDelJugador0(): { state: GameState; c: GameContext } {
    const state = newGame({ seed: 7 });
    const c = ctx(7);
    batallaDeHeroes(
      state,
      c,
      [
        { creature: 'archer', count: 2 },
        { creature: 'peasant', count: 4 },
      ],
      [
        { creature: 'bone_dragon', count: 1 },
        { creature: 'lich', count: 2 },
        { creature: 'vampire', count: 3 },
      ],
    );
    return { state, c };
  }
  const rendiciones = (state: GameState): number =>
    state.log.filter((e) => e.kind === 'hero_returned' && e.surrendered).length;

  it('`resolvePendingBattle` pelea por los vetados hasta el final, sin rendirse', () => {
    const libre = perdidaDelJugador0();
    resolvePendingBattle(libre.state, libre.c);
    // Sin veto la IA se rinde: es la posición que reproduce el hallazgo.
    expect(rendiciones(libre.state)).toBe(1);

    const vetada = perdidaDelJugador0();
    const oro = vetada.state.players[0]!.resources.gold;
    resolvePendingBattle(vetada.state, vetada.c, new Set([0]));
    expect(rendiciones(vetada.state)).toBe(0);
    expect(vetada.state.log.some((e) => e.kind === 'hero_defeated')).toBe(true);
    expect(vetada.state.players[0]!.resources.gold).toBe(oro);
  });

  it('en el navegador: el turno del rival ataca a la persona y la IA no se rinde por ella', async () => {
    // Lo que reprodujo la QA con el mismo `Session` que usa el navegador.
    for (const semilla of [2, 5, 9]) {
      const ses = new Session(semilla);
      const st = ses.state;
      const mio = heroesOf(st, 0)[0]!;
      const suyo = heroesOf(st, 1)[0]!;
      mio.army = ejercito({ creature: 'archer', count: 2 }, { creature: 'peasant', count: 4 });
      suyo.army = ejercito(
        { creature: 'bone_dragon', count: 1 },
        { creature: 'lich', count: 2 },
        { creature: 'vampire', count: 3 },
      );
      // A dos pasos del rival y en casilla pisable: con el mapa de nodos, dos a
      // la izquierda puede ser cordillera.
      mio.at = casillaADosPasos(st, suyo.at);
      const desde = st.log.length;
      await ses.endTurn();
      const hechos = st.log.slice(desde);
      expect(hechos.some((e) => e.kind === 'battle_started')).toBe(true);
      expect(
        hechos.filter((e) => e.kind === 'hero_returned' && e.actor === 0 && e.surrendered),
      ).toEqual([]);
    }
  });
});

/** Una casilla libre y pisable a dos pasos de `desde`, la primera que salga. */
function casillaADosPasos(state: GameState, desde: Point): Point {
  const alcance = reachableFrom(state.map, desde);
  for (const [clave, coste] of costesDelAlcance(alcance)) {
    const p = pointFromKey(clave);
    const lejos = Math.max(Math.abs(p.x - desde.x), Math.abs(p.y - desde.y));
    if (coste > 0 && lejos === 2 && objectAt(state.map, p) === undefined) return p;
  }
  throw new Error(`no hay casilla libre a dos pasos de (${desde.x},${desde.y})`);
}
