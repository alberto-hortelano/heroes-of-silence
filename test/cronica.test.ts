/**
 * La crónica que se le manda al agente pasa por la niebla (#59).
 *
 * Todo por semilla fija y con el mapa dibujado a mano: el rival hace algo lejos
 * y se comprueba que NO llega, lo hace a la vista y se comprueba que sí. Una
 * partida generada no serviría — «lejos» y «a la vista» tienen que ser una
 * distancia concreta y no lo que salga.
 *
 * El mapa es una franja de 40×12 de hierba con un castillo en cada punta, así
 * que los dos jugadores empiezan a 33 casillas y el radio de visión es 4: nadie
 * ve nada del otro salvo cuando el test lo lleva a propósito.
 */
import { describe, expect, it } from 'vitest';
import { playAiGame } from '../src/core/ai/turn.js';
import { serializeAdventureTurn } from '../src/core/contract/serialize.js';
import type { MapPlan } from '../src/core/map/generate.js';
import { pointKey } from '../src/core/map/map.js';
import { createRng } from '../src/core/rng.js';
import { visibleTo } from '../src/core/state/events.js';
import {
  applyAdventureAction,
  type GameContext,
  type GameState,
  heroById,
  resolvePendingBattle,
  visibleNow,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import type { Point } from '../src/core/types.js';

const MI_CASTILLO: Point = { x: 2, y: 6 };
const SU_CASTILLO: Point = { x: 37, y: 6 };
/** Mina mía, y lejísimos de mi castillo: el criterio 4 no la cubre a propósito. */
const MI_MINA: Point = { x: 30, y: 6 };

const PLANO: MapPlan = {
  width: 40,
  height: 12,
  baseTerrain: 'grass',
  regions: [],
  towns: [
    { id: 'mio', name: 'Valdeluz', faction: 'knight', at: MI_CASTILLO, owner: 0 },
    { id: 'suyo', name: 'Osario', faction: 'necromancer', at: SU_CASTILLO, owner: 1 },
  ],
  heroStarts: [
    { player: 0, at: { x: 4, y: 6 } },
    { player: 1, at: { x: 35, y: 6 } },
  ],
  mines: [{ at: MI_MINA, resource: 'ore', owner: 0 }],
  resources: [],
  monsters: [],
  chests: [],
};

function partida(semilla: number): { state: GameState; ctx: GameContext } {
  return { state: newGame({ seed: semilla, plan: PLANO }), ctx: { rng: createRng(semilla) } };
}

/** Lo que recibe el agente de ese jugador, con `recentEvents` ya tipado flojo. */
function leer(state: GameState, jugador: number): { recentEvents: any[] } {
  return serializeAdventureTurn(state, jugador) as { recentEvents: any[] };
}

/**
 * Lleva al héroe de `quien` por esas casillas, en su turno y con gasolina de
 * sobra: aquí se mide quién se entera de un paso, no cuántos pasos caben en un
 * día.
 */
function pasear(state: GameState, ctx: GameContext, quien: number, ruta: Point[]): void {
  const hero = heroById(state, `hero-${quien}`);
  for (const destino of ruta) {
    hero.movePoints = 9000;
    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: destino }, ctx, quien);
  }
}

function pasarTurno(state: GameState, ctx: GameContext, quien: number): void {
  applyAdventureAction(state, { type: 'end_turn' }, ctx, quien);
}

describe('la crónica pasa por la niebla', () => {
  it('lo que el rival hace lejos no llega — y la ventana sigue siendo de 25', () => {
    const { state, ctx } = partida(101);

    // Me paseo por mi rincón hasta llenar la ventana con eventos míos.
    pasear(state, ctx, 0, [
      { x: 4, y: 1 },
      { x: 4, y: 10 },
      { x: 4, y: 1 },
      { x: 4, y: 10 },
    ]);
    pasarTurno(state, ctx, 0);
    // Y el rival cruza medio mapa por su lado, a 26 casillas de mi héroe.
    pasear(state, ctx, 1, [{ x: 28, y: 6 }]);
    pasarTurno(state, ctx, 1);

    const ev = leer(state, 0).recentEvents;
    expect(ev.some((e) => e.kind === 'hero_moved' && e.actor === 1)).toBe(false);

    // La fuga estaba en la ENTREGA, no en el registro: el núcleo sigue sabiendo
    // lo que pasó, y por eso el cliente y el espectador no pierden nada.
    expect(state.log.some((e) => e.kind === 'hero_moved' && e.actor === 1)).toBe(true);

    // Y esta es la línea que caza el error fácil: filtrar DESPUÉS de cortar.
    // Con `slice(-25)` primero, al agente le llegarían solo los que sobrevivan
    // al filtro y la ventana encogería sin que nadie lo notara.
    expect(ev.length).toBe(25);
    expect(state.log.slice(-25).filter((e) => visibleTo(e, 0)).length).toBeLessThan(25);
  });

  it('lo que el rival hace a la vista llega, y paso a paso', () => {
    const { state, ctx } = partida(102);

    // Mi héroe se planta en (28,6): ve de la 24 a la 32.
    pasear(state, ctx, 0, [{ x: 28, y: 6 }]);
    pasarTurno(state, ctx, 0);
    // El rival viene hacia mí desde la 35. Entra en mi vista en la 32.
    pasear(state, ctx, 1, [{ x: 31, y: 6 }]);
    pasarTurno(state, ctx, 1);

    const pasos = leer(state, 0)
      .recentEvents.filter((e) => e.kind === 'hero_moved' && e.actor === 1)
      .map((e) => e.to.x);

    // «Entero o nada» se aplica a cada paso, que es lo que es un `hero_moved`:
    // el mismo viaje llega recortado por donde deja de vérsele.
    expect(pasos).toEqual([32, 31]);
    expect(state.log.filter((e) => e.kind === 'hero_moved' && e.actor === 1)).toHaveLength(4);
  });

  it('lo que vi el día 3 me sigue constando el día 4: la crónica es memoria', () => {
    const { state, ctx } = partida(103);

    pasear(state, ctx, 0, [{ x: 28, y: 6 }]);
    pasarTurno(state, ctx, 0);
    pasear(state, ctx, 1, [{ x: 31, y: 6 }]);
    pasarTurno(state, ctx, 1);

    const meConsta = (): boolean =>
      leer(state, 0).recentEvents.some((e) => e.kind === 'hero_moved' && e.actor === 1);
    expect(meConsta()).toBe(true);

    // Retiro al héroe hasta perderlo de vista. Cuatro pasos y no veinte: si me
    // alejara media franja, los que sobran serían MIS eventos empujando al suyo
    // fuera de la ventana, y el test daría verde por el motivo equivocado.
    pasear(state, ctx, 0, [{ x: 24, y: 6 }]);
    pasarTurno(state, ctx, 0);
    pasarTurno(state, ctx, 1);
    expect(visibleNow(state, 0).has(pointKey({ x: 31, y: 6 }))).toBe(false);

    // Y sigue llegando, porque el reparto se decidió cuando ocurrió. Si se
    // recalculara al leer, esto desaparecería de la crónica sin que pasara
    // nada: el agente vería al rival esfumarse hacia atrás en el tiempo.
    expect(meConsta()).toBe(true);
  });

  it('el reloj y el final llegan siempre, sean de quien sean', () => {
    const { state, ctx } = partida(104);

    // Pierdo el héroe y después el castillo: me quedo sin nada que mirar y sin
    // partida, y me tengo que enterar de las dos cosas.
    heroById(state, 'hero-0').army = [{ creature: 'peasant', count: 1 }, null, null, null, null];
    pasear(state, ctx, 0, [{ x: 8, y: 6 }]);
    pasarTurno(state, ctx, 0);
    pasear(state, ctx, 1, [{ x: 8, y: 6 }]);
    resolvePendingBattle(state, ctx);
    // Cruzar el día es lo que pone un `day_start` del rival en la ventana.
    pasarTurno(state, ctx, 1);
    pasarTurno(state, ctx, 0);
    pasear(state, ctx, 1, [MI_CASTILLO]);

    const ev = leer(state, 0).recentEvents;
    expect(ev.some((e) => e.kind === 'day_start')).toBe(true);
    expect(ev.some((e) => e.kind === 'turn_start' && e.actor === 1)).toBe(true);
    expect(ev.some((e) => e.kind === 'player_defeated' && e.player === 0)).toBe(true);
    expect(ev.some((e) => e.kind === 'game_over' && e.winner === 1)).toBe(true);
  });

  it('perder un castillo se sabe siempre, aunque no lo mire nadie mío', () => {
    const { state, ctx } = partida(105);

    // Mi héroe se va a la otra punta y por otra fila: ni ve el castillo ni se
    // cruza con el rival por el camino.
    pasear(state, ctx, 0, [{ x: 20, y: 1 }]);
    pasarTurno(state, ctx, 0);
    pasear(state, ctx, 1, [MI_CASTILLO]);

    const captura = leer(state, 0).recentEvents.find((e) => e.kind === 'town_captured');
    expect(captura).toBeDefined();
    expect(captura.from).toBe(0);
    expect(captura.actor).toBe(1);

    // Y llega por `from`, NO por el sello: cuando `emit` sella, el castillo ya
    // lleva la bandera nueva y su dueño de ayer no lo mira desde ninguna parte.
    // Esta es la trampa del diseño, y aquí está clavada.
    const sellada = state.log.find((e) => e.kind === 'town_captured');
    expect(sellada?.seen).not.toContain(0);

    // El sello es contabilidad de casa: decirle al agente quién MÁS miraba
    // sería una fuga nueva colada por la puerta del arreglo.
    for (const e of leer(state, 0).recentEvents) expect(e).not.toHaveProperty('seen');
  });

  it('una mina mía capturada lejos no me consta: el original tampoco te avisa', () => {
    const { state, ctx } = partida(106);

    pasear(state, ctx, 0, [{ x: 4, y: 1 }]);
    pasarTurno(state, ctx, 0);
    pasear(state, ctx, 1, [MI_MINA]);

    expect(state.log.some((e) => e.kind === 'mine_captured' && e.from === 0)).toBe(true);
    expect(leer(state, 0).recentEvents.some((e) => e.kind === 'mine_captured')).toBe(false);

    // Lo que sí se ve es la consecuencia, y el contrato ya enseña a leerla: la
    // mina deja de dar mineral mañana.
    expect(leer(state, 0).recentEvents.some((e) => e.kind === 'resource_gained')).toBe(false);
  });

  it('en una partida entera, ningún evento ocultable nace anónimo', async () => {
    // El guardia del criterio 7, por el camino real y no por el tipo: `tsc`
    // obliga a ESCRIBIR `actor` y `at`, pero no a que digan algo. Un emisor
    // perezoso que ponga `actor: null` para salir del paso compila, y el evento
    // se le entrega a todo el mundo.
    //
    // Los cuatro de la lista son los únicos que pueden no tener sitio, y no es
    // un agujero: van siempre, así que su `at` no lo lee nadie. `day_start` es
    // además el único sin protagonista — no lo hace ningún jugador, pasa.
    const state = newGame({ seed: 9 });
    await playAiGame(state, { rng: createRng(9) }, 300);

    const SIN_SITIO = new Set(['day_start', 'turn_start', 'player_defeated', 'game_over']);
    for (const e of state.log) {
      if (e.kind !== 'day_start') {
        expect(e.actor, `un ${e.kind} sin protagonista`).not.toBeNull();
      }
      if (!SIN_SITIO.has(e.kind)) {
        expect(e.at, `un ${e.kind} sin sitio`).not.toBeNull();
      }
    }
    // Y que la partida haya dado de sí: si solo saliera `hero_moved`, lo de
    // arriba no probaría gran cosa.
    expect(new Set(state.log.map((e) => e.kind)).size).toBeGreaterThanOrEqual(15);
  });

  it('una batalla en la que defiendo llega entera, incluso la muerte del mío', () => {
    const { state, ctx } = partida(107);

    // Sin castillo cerca y sin más héroes: lo único que mira esa casilla es el
    // héroe que está a punto de morir en ella.
    heroById(state, 'hero-0').army = [{ creature: 'peasant', count: 1 }, null, null, null, null];
    pasear(state, ctx, 0, [{ x: 20, y: 6 }]);
    pasarTurno(state, ctx, 0);
    pasear(state, ctx, 1, [{ x: 20, y: 6 }]);
    expect(state.pendingBattle).not.toBeNull();
    resolvePendingBattle(state, ctx);

    const ev = leer(state, 0).recentEvents;
    expect(ev.some((e) => e.kind === 'battle_started' && e.actor === 1)).toBe(true);
    expect(ev.some((e) => e.kind === 'battle_ended' && e.actor === 1)).toBe(true);

    // La muerte del mío llega por `actor`, no por el sello: cuando se sella, el
    // héroe ya no está en `state.heroes` y su dueño ha dejado de mirar la
    // casilla en la que acaba de morir.
    const muerte = ev.find((e) => e.kind === 'hero_defeated');
    expect(muerte).toBeDefined();
    expect(muerte.actor).toBe(0);
    expect(state.log.find((e) => e.kind === 'hero_defeated')?.seen).not.toContain(0);
  });
});
