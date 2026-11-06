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
import { chooseBattleAction } from '../src/core/ai/tactics.js';
import {
  activeStack,
  applyAction,
  createBattle,
  legalActions,
  stackById,
  surrenderBlocker,
} from '../src/core/battle/battle.js';
import type { BattleState, Side } from '../src/core/battle/types.js';
import { HERO_BODY, queEs } from '../src/core/battle/types.js';
import { unidadDelJuego } from '../src/core/catalogo.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { escalonDeCasillas } from '../src/core/cuerpo.js';
import { figuraDelHeroe, HEROE } from '../src/core/data.js';
import { umbral } from '../src/core/hero/experiencia.js';
import { type Hero, heroUnit } from '../src/core/hero/hero.js';
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
import { dueñoDeLaCiudad } from '../src/core/state/sitios.js';
import type { Point, Stack } from '../src/core/types.js';
import { avanzarHasta, heroeDeBatalla, ladoDeBatalla } from './batalla-de-prueba.js';
import { ctx, JINETE, NO_MUERTO, PESADA, TIRADOR_NO_MUERTO, TROPA, TROPA_BARATA } from './comun.js';
import { costesDelAlcance } from './mapa-de-prueba.js';
import { darLaCiudad, ejercito, forzarBatalla, guarnecer } from './partida-de-prueba.js';

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
 * El rango del héroe que asalta una ciudad y tiene que ganar sin duda. Desde la
 * «Base derecha» (06-11-2026, `79b5c76b`: la muralla de toda ciudad, pegada a la
 * salida del defensor) la IA que asalta deja a sus jinetes ante el muro y su héroe
 * pelea solo en la puerta: uno recién hecho (rango 5) caía en las 30 semillas de
 * batalla que se probaron, y con él su bando. Con el 12 gana las 40 primeras con
 * holgura: le quedan como poco 647 de sus 720 PV.
 */
const RANGO_DEL_ASALTO = 12;

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
      [{ creature: TROPA_BARATA, count: 3 }],
      [{ creature: NO_MUERTO, count: 2 }],
    );
    const batalla = state.pendingBattle!.battle;
    for (const [side, hero] of [
      ['attacker', atacante],
      ['defender', defensor],
    ] as const) {
      const suyos = batalla.stacks.filter((s) => s.side === side && s.origen.kind === 'heroe');
      expect(suyos).toHaveLength(1);
      expect(suyos[0]!.id).toBe(`${side}-heroe`);
      // Pisa el tablero con la hoja de su tipo, no con el Y Bot (vuelta 2 del
      // arranque), y la crónica lo sigue contando como el héroe.
      expect(suyos[0]!.body).toBe(figuraDelHeroe(hero));
      expect(suyos[0]!.body).not.toBe(HERO_BODY);
      expect(queEs(suyos[0]!)).toBe(HERO_BODY);
      expect(suyos[0]!.unit).toEqual(heroUnit(hero));
      // Entra sano: sin heridas que arrastrar (decisión del usuario).
      expect(suyos[0]!.topHp).toBe(heroUnit(hero).hp);
    }
  });

  it('el cuerpo sale de `data/heroe.json` y crece con el nivel', () => {
    const c = HEROE.combate;
    // Dos niveles por encima del inicial (el 5): dos `porRango`.
    const nivel7 = heroUnit({
      name: 'X',
      attack: 2,
      defense: 3,
      experience: umbral(7),
      equipo: {},
    });
    expect(nivel7.hp).toBe(c.pv.base + 2 * c.pv.porRango);
    expect(nivel7.attack).toBe(2 + 2 * c.ataquePorRango);
    // Su Defensa, con lo del rango, encima de su agilidad (25-10-2026).
    expect(nivel7.defense).toBe(3 + 2 * c.defensaPorRango + c.agilidad);
    const fuerza = c.fuerza.base + 2 * c.fuerza.porRango;
    expect(nivel7.fuerza).toBe(fuerza);
    expect(nivel7.damage).toEqual([fuerza, fuerza * c.agilidad]);
    expect(nivel7.speed).toBe(escalonDeCasillas(c.agilidad));
    // Sin facción: no altera la moral por diversidad del ejército.
    expect(nivel7.faction).toBeNull();
  });

  it('un monstruo o una guarnición no tienen comandante', () => {
    const b = createBattle(
      ladoDeBatalla(ejercito({ creature: TROPA_BARATA, count: 3 }), heroeDeBatalla()),
      ladoDeBatalla(ejercito({ creature: NO_MUERTO, count: 3 }), null),
      createRng(1),
      COMBATE_COMPLETO,
    );
    expect(b.stacks.filter((s) => s.origen.kind === 'heroe').map((s) => s.side)).toEqual([
      'attacker',
    ]);
  });

  it('el héroe ocupa el séptimo puesto: seis de tropa caben y siete no', () => {
    const seis = createBattle(
      ladoDeBatalla(ejercito({ creature: TROPA_BARATA, count: 6 }), heroeDeBatalla()),
      ladoDeBatalla(ejercito({ creature: NO_MUERTO, count: 7 }), null),
      createRng(1),
      COMBATE_COMPLETO,
    );
    expect(seis.stacks.filter((s) => s.side === 'attacker')).toHaveLength(7);
    expect(() =>
      createBattle(
        ladoDeBatalla(ejercito({ creature: TROPA_BARATA, count: 7 }), heroeDeBatalla()),
        ladoDeBatalla(ejercito({ creature: NO_MUERTO, count: 3 }), null),
        createRng(1),
        COMBATE_COMPLETO,
      ),
    ).toThrow('no caben: el atacante trae 8 y un bando lleva como mucho 7');
  });
});

/** Lo que cuesta rendirse con dos no-muertos vivos. */
function precioDeDos(): number {
  const oro = 2 * unidadDelJuego(NO_MUERTO).oro;
  return Math.ceil((oro * HEROE.rendicion.porcentajeDelOro) / 100);
}

/**
 * Una batalla que el atacante pierde de largo, en su turno y con oro para
 * rendirse: tres de la tropa más barata contra seis pesadas, y su héroe a 1 PV.
 * Sin la herida no pierde de largo: el héroe (500 PV) pesa más que toda su tropa,
 * y con dos héroes iguales ningún bando baja del tercio del otro
 * (`RENDIRSE_POR_DEBAJO_DE`, `ai/tactics.ts`).
 */
function perdidaDeLargo(): BattleState {
  const b = createBattle(
    ladoDeBatalla(ejercito({ creature: TROPA_BARATA, count: 3 }), heroeDeBatalla(1000)),
    ladoDeBatalla(ejercito({ creature: PESADA, count: 6 }), heroeDeBatalla()),
    createRng(6),
    COMBATE_COMPLETO,
  );
  hastaQueLeToque(b, 'attacker');
  stackById(b, 'attacker-heroe').topHp = 1;
  return b;
}

describe('la rendición (criterio 5)', () => {
  it('cuesta el ⌈50 %⌉ del oro de catálogo de la tropa viva, sin contar al héroe', () => {
    const b = createBattle(
      ladoDeBatalla(
        ejercito({ creature: NO_MUERTO, count: 1 }, { creature: TIRADOR_NO_MUERTO, count: 2 }),
        heroeDeBatalla(10_000),
      ),
      ladoDeBatalla(ejercito({ creature: TROPA_BARATA, count: 3 }), null),
      createRng(2),
      COMBATE_COMPLETO,
    );
    const oro = (n: number) => n * unidadDelJuego(NO_MUERTO).oro;
    const deTiro = (n: number) => n * unidadDelJuego(TIRADOR_NO_MUERTO).oro;
    const precio = (o: number) => Math.ceil((o * HEROE.rendicion.porcentajeDelOro) / 100);
    expect(surrenderBlocker(b, 'attacker').coste).toBe(precio(oro(1) + deTiro(2)));
    // Los muertos no se salvan, así que no se pagan.
    stackById(b, 'attacker-1').count = 0;
    expect(surrenderBlocker(b, 'attacker').coste).toBe(precio(oro(1) + deTiro(1)));
  });

  it('se ofrece cuando se puede, y lo que dice la lista es lo que acepta el motor', () => {
    const precio = precioDeDos();
    const b = createBattle(
      ladoDeBatalla(ejercito({ creature: NO_MUERTO, count: 2 }), heroeDeBatalla(500)),
      ladoDeBatalla(ejercito({ creature: TROPA_BARATA, count: 3 }), null),
      createRng(3),
      COMBATE_COMPLETO,
    );
    hastaQueLeToque(b, 'attacker');
    // Con su precio puesto (H-2): quien decide sabe lo que paga antes de pagarlo.
    expect(legalActions(b)).toContainEqual({ type: 'surrender', gold: precio });
    // Un precio que no es el de ahora se rechaza, en vez de cobrar otro callando.
    expect(() => applyAction(b, { type: 'surrender', gold: precio - 1 }, createRng(3))).toThrow(
      `no se puede rendir por ${precio - 1} de oro: ahora cuesta ${precio}`,
    );
    expect(b.finished).toBeNull();
    applyAction(b, { type: 'surrender', gold: precio }, createRng(3));
    // El precio, una vez: en `finished`. Quién se rindió es el que pierde.
    expect(b.finished).toEqual({ winner: 'defender', surrender: { gold: precio } });
    expect(b.log.slice(-2)).toEqual([
      { kind: 'surrender', side: 'attacker' },
      { kind: 'finished', winner: 'defender' },
    ]);
  });

  it('sin héroe, sin oro o sin base no se ofrece, y la frase dice por qué', () => {
    const precio = precioDeDos();
    expect(precio).toBeGreaterThan(10);
    const sinOro = createBattle(
      ladoDeBatalla(ejercito({ creature: NO_MUERTO, count: 2 }), heroeDeBatalla(10)),
      ladoDeBatalla(ejercito({ creature: TROPA_BARATA, count: 3 }), null),
      createRng(3),
      COMBATE_COMPLETO,
    );
    expect(surrenderBlocker(sinOro, 'attacker').motivo).toBe(`cuesta ${precio} de oro y tienes 10`);
    expect(surrenderBlocker(sinOro, 'defender').motivo).toBe('este bando no tiene héroe');
    const sinBase = createBattle(
      ladoDeBatalla(ejercito({ creature: NO_MUERTO, count: 2 }), heroeDeBatalla()),
      ladoDeBatalla(ejercito({ creature: TROPA_BARATA, count: 3 }), null),
      createRng(3),
      COMBATE_COMPLETO,
    );
    expect(surrenderBlocker(sinBase, 'attacker').motivo).toBe('no tienes base a la que volver');

    hastaQueLeToque(sinOro, 'attacker');
    expect(legalActions(sinOro).some((a) => a.type === 'surrender')).toBe(false);
    expect(() => applyAction(sinOro, { type: 'surrender' }, createRng(3))).toThrow(
      `no se puede rendir: cuesta ${precio} de oro y tienes 10`,
    );
  });

  it('defendiendo la propia base no hay a dónde huir', () => {
    const state = newGame({ seed: 5 });
    const base = baseOf(state, 1)!;
    batallaDeHeroes(
      state,
      ctx(5),
      [{ creature: PESADA, count: 4 }],
      [{ creature: NO_MUERTO, count: 2 }],
      base.at,
    );
    expect(surrenderBlocker(state.pendingBattle!.battle, 'defender').motivo).toBe(
      'defiendes tu base: no hay a dónde huir',
    );
    // Y el atacante, lejos de la suya, sí puede.
    expect(surrenderBlocker(state.pendingBattle!.battle, 'attacker').motivo).toBeNull();
  });
});

describe('el héroe vencido vuelve a la base (criterio 6)', () => {
  it('derrotado: cae, vuelve con el ejército vacío y sin movimiento, en ese orden', () => {
    const state = newGame({ seed: 8 });
    const c = ctx(8);
    const base = baseOf(state, 0)!;
    guarnecer(state, base, []);
    // Sin oro: tiene que caer peleando.
    state.players[0]!.oro = 0;
    const { atacante } = batallaDeHeroes(
      state,
      c,
      [{ creature: TROPA_BARATA, count: 2 }],
      [{ creature: PESADA, count: 6 }],
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
    guarnecer(state, base, []);
    const { atacante } = batallaDeHeroes(
      state,
      c,
      [{ creature: TROPA, count: 3 }],
      [{ creature: TROPA_BARATA, count: 2 }],
    );
    const batalla = state.pendingBattle!.battle;
    // El héroe cae —así, a mano, para que la tropa siga entera— y el siguiente
    // turno cierra la batalla por la regla del comandante.
    const cuerpo = stackById(batalla, 'attacker-heroe');
    cuerpo.count = 0;
    cuerpo.topHp = 0;
    applyAction(batalla, { type: 'end_turn' }, c.rng);
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
    guarnecer(state, base, []);
    state.players[0]!.oro = 0;
    const { atacante } = batallaDeHeroes(
      state,
      c,
      [{ creature: TROPA_BARATA, count: 1 }],
      [{ creature: PESADA, count: 6 }],
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
    guarnecer(state, base, []);
    state.players[0]!.oro = 0;
    const { atacante } = batallaDeHeroes(
      state,
      c,
      [{ creature: TROPA_BARATA, count: 1 }],
      [{ creature: PESADA, count: 6 }],
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
            kind: 'chest',
            id: 'oro-en-la-puerta',
            at,
            gold: 100,
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

  it('sin base, el que cae sale del mapa como siempre', () => {
    const state = newGame({ seed: 10 });
    const c = ctx(10);
    (state.players[0] as { base: string | null }).base = null;
    const { atacante } = batallaDeHeroes(
      state,
      c,
      [{ creature: TROPA_BARATA, count: 1 }],
      [{ creature: PESADA, count: 6 }],
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
    darLaCiudad(state, otro, 1);
    const bandera = state.map.objects.find((o) => o.kind === 'town' && o.id === otro.id)!;
    (bandera as { owner: number | null }).owner = 1;
    // Y sin la guarnición del jugador 0, que `tomarElNodo` quita al tomarla: dentro,
    // el 1 la defendía con la tropa del 0 (la defensa elegida, 04-11-2026).
    guarnecer(state, otro, []);
    // Sin oro, para que caiga peleando y no se rinda (la rendición entrega el
    // castillo igual: lo que decide es la casilla).
    state.players[1]!.oro = 0;
    heroesOf(state, 0)[0]!.experience = umbral(RANGO_DEL_ASALTO);
    const { atacante, defensor } = batallaDeHeroes(
      state,
      c,
      [{ creature: JINETE, count: 6 }],
      [{ creature: TROPA_BARATA, count: 1 }],
      otro.at,
    );
    expect(resolvePendingBattle(state, c).winner).toBe('attacker');

    expect(dueñoDeLaCiudad(state, otro)).toBe(atacante.owner);
    expect(dueñoDeLaCiudad(state, base)).toBe(1);
    const vuelto = heroById(state, defensor.id);
    expect(pointKey(vuelto.at)).toBe(pointKey(base.at));
    const tras = state.log.slice(state.log.findIndex((e) => e.kind === 'battle_ended'));
    // Los ascensos van pegados al `battle_ended`, antes de cualquier
    // consecuencia: se cobran con los dos héroes todavía en el mapa.
    const ascensos = (k: string) => k === 'rank_up' || k === 'troop_rank_up';
    const kinds = tras.map((e) => e.kind);
    const primeraConsecuencia = kinds.findIndex((k, i) => i > 0 && !ascensos(k));
    expect(kinds.slice(1, primeraConsecuencia).every(ascensos)).toBe(true);
    expect(kinds.slice(primeraConsecuencia).some(ascensos)).toBe(false);
    // Y en casa no recoge la guarnición (04-11-2026): vuelve sin tropa, y la
    // guarnición se queda guardando la base.
    expect(kinds.filter((k) => !ascensos(k))).toEqual([
      'battle_ended',
      'town_captured',
      'hero_defeated',
      'hero_returned',
    ]);
  });

  it('derrotado en su propia base: la base cambia de manos y el héroe se pierde', () => {
    const state = newGame({ seed: 11 });
    const c = ctx(11);
    const base = baseOf(state, 1)!;
    // La defiende con su guarnición (04-11-2026) tras la muralla de la ciudad.
    heroesOf(state, 0)[0]!.experience = umbral(RANGO_DEL_ASALTO);
    const { atacante, defensor } = batallaDeHeroes(
      state,
      c,
      [{ creature: JINETE, count: 6 }],
      [{ creature: TROPA_BARATA, count: 1 }],
      base.at,
    );
    expect(resolvePendingBattle(state, c).winner).toBe('attacker');

    expect(dueñoDeLaCiudad(state, base)).toBe(atacante.owner);
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
    const b = perdidaDeLargo();
    // La sonda: sin veto se rinde, así que el veto es lo único que cambia.
    expect(chooseBattleAction(b)).toEqual({ type: 'surrender' });
    expect(chooseBattleAction(b, new Set(['attacker']))).not.toEqual({ type: 'surrender' });
    // Y el veto es por bando: el del rival no frena al que sí es suyo.
    expect(chooseBattleAction(b, new Set(['defender']))).toEqual({ type: 'surrender' });
  });
});
