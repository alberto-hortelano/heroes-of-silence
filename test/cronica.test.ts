/**
 * La crónica que se le manda al agente pasa por la niebla (#59).
 *
 * Todo por semilla fija y con el mapa dibujado a mano: el rival hace algo lejos
 * y se comprueba que NO llega, lo hace a la vista y se comprueba que sí. Una
 * partida generada no serviría — «lejos» y «a la vista» tienen que ser una
 * distancia concreta y no lo que salga.
 *
 * El mapa es una franja de 40×12 de hierba con un castillo en cada punta, así
 * que los dos jugadores empiezan a 31 casillas y el radio de visión es 4: nadie
 * ve nada del otro salvo cuando el test lo lleva a propósito. Desde el mapa de
 * nodos la franja lleva tres cordilleras de arriba abajo —los castillos y un
 * nodo son los pasos—, que no tapan la vista: la visión es un cuadrado.
 */
import { describe, expect, it } from 'vitest';
import { marcadoDe } from '../src/client/html.js';
import { renderLog } from '../src/client/views/panels.js';
import { playAiGame } from '../src/core/ai/turn.js';
import { unidadDelJuego } from '../src/core/catalogo.js';
import { serializeAdventureTurn } from '../src/core/contract/serialize.js';
import type { MapPlan } from '../src/core/map/generate.js';
import type { MapObject } from '../src/core/map/map.js';
import { createRng } from '../src/core/rng.js';
import type { GameEvent } from '../src/core/state/events.js';
import { visibleTo } from '../src/core/state/events.js';
import {
  applyAdventureAction,
  type GameContext,
  type GameState,
  HERO_SCOUT_RADIUS,
  heroById,
  resolvePendingBattle,
  visibleNow,
  visibleNowAt,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import type { Point } from '../src/core/types.js';
import {
  ejercito,
  FACCION_A,
  FACCION_B,
  NO_MUERTO,
  PESADA,
  sinGuarnicionDeSalida,
  TROPA,
  TROPA_BARATA,
} from './helpers.js';

const MI_CASTILLO: Point = { x: 2, y: 6 };
const SU_CASTILLO: Point = { x: 37, y: 6 };
/**
 * Un paso de la red, lejísimos de mi castillo: el criterio 4 no lo cubre a
 * propósito. Era una mina mía; desde el mapa de nodos la mina no se toma, y lo
 * que cambia de dueño al pisarlo es el nodo.
 */
const MI_NODO: Point = { x: 30, y: 6 };

/** Una cordillera de punta a punta de la franja, en la columna `x`. */
const columna = (x: number) => ({
  terrain: 'mountain' as const,
  from: { x, y: 0 },
  to: { x, y: 11 },
});

/**
 * La franja, partida en cuatro regiones por tres cordilleras: los castillos
 * son los pasos de las de los extremos (columnas 2 y 37) y `MI_NODO` el del
 * medio (columna 30). Las distancias que miden estos tests son las de siempre.
 */
const PLANO: MapPlan = {
  width: 40,
  height: 12,
  baseTerrain: 'grass',
  patches: [],
  regions: [
    { id: 'oeste', name: 'Oeste', at: { x: 0, y: 6 } },
    { id: 'llano', name: 'Llano', at: { x: 10, y: 6 } },
    { id: 'vega', name: 'Vega', at: { x: 33, y: 2 } },
    { id: 'este', name: 'Este', at: { x: 39, y: 6 } },
  ],
  walls: [columna(2), columna(30), columna(37)],
  nodes: [MI_NODO],
  towns: [
    { id: 'mio', name: 'Valdeluz', faction: FACCION_A, at: MI_CASTILLO, owner: 0 },
    { id: 'suyo', name: 'Osario', faction: FACCION_B, at: SU_CASTILLO, owner: 1 },
  ],
  mines: [],
  villages: [],
  resources: [],
  monsters: [],
  chests: [],
};

/**
 * El mismo tamaño con los castillos en los BORDES, para la poda de los límites.
 * En la esquina misma no pueden ir: una casilla de esquina solo tiene tres
 * vecinas y dos de ellas se tocan en diagonal, así que no separa dos regiones.
 * Van en los extremos de una cordillera que parte el mapa en norte y sur.
 */
const ESQUINAS: MapPlan = {
  ...PLANO,
  regions: [
    { id: 'norte', name: 'Norte', at: { x: 10, y: 1 } },
    { id: 'sur', name: 'Sur', at: { x: 10, y: 9 } },
  ],
  walls: [{ terrain: 'mountain', from: { x: 0, y: 5 }, to: { x: 39, y: 5 } }],
  nodes: [],
  towns: [
    { id: 'mio', name: 'Valdeluz', faction: FACCION_A, at: { x: 0, y: 5 }, owner: 0 },
    { id: 'suyo', name: 'Osario', faction: FACCION_B, at: { x: 39, y: 5 }, owner: 1 },
  ],
};

/** El nodo de la franja, para dárselo a quien haga falta. */
function nodoDelMedio(state: GameState): Extract<MapObject, { kind: 'node' }> {
  const nodo = state.map.objects.find((o) => o.kind === 'node');
  if (nodo === undefined || nodo.kind !== 'node') throw new Error('la franja no tiene nodo');
  return nodo;
}

function partida(semilla: number): { state: GameState; ctx: GameContext } {
  return { state: newGame({ seed: semilla, plan: PLANO }), ctx: { rng: createRng(semilla) } };
}

/**
 * Dónde discrepan las dos formas de «quién mira ahora», barriendo el mapa
 * entero y una casilla más por cada lado: fuera del mapa las dos tienen que
 * decir que no.
 */
function discrepanciasDeVision(state: GameState): string[] {
  const fuera: string[] = [];
  for (const p of state.players) {
    const conjunto = visibleNow(state, p.id);
    for (let y = -1; y <= state.map.height; y++) {
      for (let x = -1; x <= state.map.width; x++) {
        const q = { x, y };
        if (visibleNowAt(state, p.id, q) !== conjunto.has(q)) {
          fuera.push(`jugador ${p.id} en (${x},${y})`);
        }
      }
    }
  }
  return fuera;
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

    // Mi héroe se planta en (28,6): ve de 28 − r a 28 + r (r = 5 en el 42×42, #229).
    pasear(state, ctx, 0, [{ x: 28, y: 6 }]);
    pasarTurno(state, ctx, 0);
    // El rival viene hacia mí desde su castillo (37). Entra en mi vista en la 28 + r.
    pasear(state, ctx, 1, [{ x: 31, y: 6 }]);
    pasarTurno(state, ctx, 1);

    const pasos = leer(state, 0)
      .recentEvents.filter((e) => e.kind === 'hero_moved' && e.actor === 1)
      .map((e) => e.to.x);

    // «Entero o nada» se aplica a cada paso, que es lo que es un `hero_moved`:
    // el mismo viaje llega recortado por donde deja de vérsele.
    const borde = 28 + HERO_SCOUT_RADIUS;
    expect(borde).toBeLessThan(SU_CASTILLO.x); // si no, el rival nacería a la vista
    expect(pasos).toEqual(Array.from({ length: borde - 30 }, (_, i) => borde - i));
    expect(state.log.filter((e) => e.kind === 'hero_moved' && e.actor === 1)).toHaveLength(
      SU_CASTILLO.x - 31,
    );
  });

  it('lo que vi el día 3 me sigue constando el día 4: la crónica es memoria', () => {
    const { state, ctx } = partida(103);

    pasear(state, ctx, 0, [{ x: 28, y: 6 }]);
    pasarTurno(state, ctx, 0);
    pasear(state, ctx, 1, [{ x: 31, y: 6 }]);
    pasarTurno(state, ctx, 1);
    // En serpiente el 1 cierra el día 1 y abre el 2 (`ordenDelDia`).
    pasarTurno(state, ctx, 1);

    const meConsta = (): boolean =>
      leer(state, 0).recentEvents.some((e) => e.kind === 'hero_moved' && e.actor === 1);
    expect(meConsta()).toBe(true);

    // Retiro al héroe hasta perderlo de vista. Cuatro pasos y no veinte: si me
    // alejara media franja, los que sobran serían MIS eventos empujando al suyo
    // fuera de la ventana, y el test daría verde por el motivo equivocado.
    pasear(state, ctx, 0, [{ x: 24, y: 6 }]);
    pasarTurno(state, ctx, 0);
    expect(state.day).toBe(3);
    expect(visibleNow(state, 0).has({ x: 31, y: 6 })).toBe(false);

    // Y sigue llegando, porque el reparto se decidió cuando ocurrió. Si se
    // recalculara al leer, esto desaparecería de la crónica sin que pasara
    // nada: el agente vería al rival esfumarse hacia atrás en el tiempo.
    expect(meConsta()).toBe(true);
  });

  it('el reloj y el final llegan siempre, sean de quien sean', () => {
    const { state, ctx } = partida(104);
    // Sin la guarnición de salida: con ella, cinco templarios con su armadura
    // paran al rival en la puerta y el castillo no cae. Aquí no se mide quién
    // gana, sino que el final me llega.
    sinGuarnicionDeSalida(state);

    // Pierdo el héroe y después el castillo: me quedo sin nada que mirar y sin
    // partida, y me tengo que enterar de las dos cosas. Desde la fase 1b el
    // héroe que cae vuelve a casa, así que la segunda batalla es en mi castillo
    // y con él dentro: perderla se lleva la casa y al héroe a la vez.
    heroById(state, 'hero-0').army = ejercito({ creature: TROPA_BARATA, count: 1 });
    pasear(state, ctx, 0, [{ x: 8, y: 6 }]);
    pasarTurno(state, ctx, 0);
    pasear(state, ctx, 1, [{ x: 8, y: 6 }]);
    resolvePendingBattle(state, ctx);
    expect(heroById(state, 'hero-0').at).toEqual(MI_CASTILLO);
    // Cruzar el día es lo que pone un `day_start` del rival en la ventana. En
    // serpiente (`ordenDelDia`) el 1 cierra el día 1 y abre el 2.
    pasarTurno(state, ctx, 1);
    expect(state.day).toBe(2);
    // Con fuerza de sobra: con la rueda (19-10-2026), mi héroe solo, con su
    // Espada, paraba a la tropa de salida del rival.
    heroById(state, 'hero-1').army = ejercito({ creature: PESADA, count: 5 });
    pasear(state, ctx, 1, [MI_CASTILLO]);
    expect(state.pendingBattle?.foe).toEqual({ kind: 'hero', heroId: 'hero-0' });
    expect(resolvePendingBattle(state, ctx).winner).toBe('attacker');

    const ev = leer(state, 0).recentEvents;
    expect(ev.some((e) => e.kind === 'day_start')).toBe(true);
    expect(ev.some((e) => e.kind === 'turn_start' && e.actor === 1)).toBe(true);
    expect(ev.some((e) => e.kind === 'player_defeated' && e.actor === 0)).toBe(true);
    expect(ev.some((e) => e.kind === 'game_over' && e.actor === 1)).toBe(true);
  });

  it('perder un castillo se sabe siempre, aunque no lo mire nadie mío', () => {
    const { state, ctx } = partida(105);
    // Vacía: el rival tiene que ENTRAR y tomarla, no asaltar su guarnición.
    sinGuarnicionDeSalida(state);

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

  it('un nodo mío tomado lejos no me consta: como no constaba la mina', () => {
    const { state, ctx } = partida(106);
    nodoDelMedio(state).owner = 0;

    pasear(state, ctx, 0, [{ x: 4, y: 1 }]);
    pasarTurno(state, ctx, 0);
    pasear(state, ctx, 1, [MI_NODO]);

    expect(state.log.some((e) => e.kind === 'node_captured' && e.from === 0)).toBe(true);
    expect(leer(state, 0).recentEvents.some((e) => e.kind === 'node_captured')).toBe(false);
  });

  it('en una partida entera, ningún evento ocultable nace anónimo', async () => {
    // El guardia del criterio 7, por el camino real y no por el tipo: `tsc`
    // obliga a ESCRIBIR `actor` y `at`, pero no a que digan algo. Un emisor
    // perezoso que ponga `actor: null` para salir del paso compila, y el evento
    // se le entrega a todo el mundo.
    //
    // Los cuatro de la lista son los únicos que pueden no tener sitio, y no es
    // un agujero: van siempre, así que su `at` no lo lee nadie.
    //
    // Sin protagonista pueden ir **dos**, y esta lista decía uno: `day_start`
    // —no lo hace nadie, pasa— y `game_over` **cuando no gana nadie**, que
    // entró con el tope de días. La frase vieja siguió verde por la semilla: la
    // 9 en 48×48 acaba por conquista, así que la rama no se pisa. Con
    // `maxDays: 5` sobre este mismo montaje salía un infractor, y era correcto.
    // Se escribe como conjunto y no como excepción suelta para que el día que
    // aparezca un tercero haya que ponerlo aquí a mano.
    //
    // En 48×48 y no en el mapa de siempre, por el mismo motivo que el guardia
    // hermano de `invariantes.test.ts`: cuadrada la economía, la partida de
    // 24×24 acaba el día 6 y se queda en quince tipos —no le da tiempo a
    // aprender un hechizo—, así que este test recorría un evento menos.
    // Bajarle el umbral habría sido dejarlo mirando quince para siempre; en
    // 48×48 recorre 618 hechos de los dieciséis tipos.
    //
    // La semilla es la 4 y no la 9 desde que perder la base elimina: la 9 se
    // acaba el día 9 con catorce tipos, y la 4 da diecisiete (672 hechos).
    // Y la 19 desde que la base nace guarnecida: la 4 bajó a catorce tipos, y
    // la 19 da diecisiete (810 hechos, día 24).
    const state = newGame({ seed: 19, width: 48, height: 48 });
    await playAiGame(state, { rng: createRng(19) });

    const SIN_SITIO = new Set(['day_start', 'turn_start', 'player_defeated', 'game_over']);
    // Lo que hace el reloj y no un jugador: el día que empieza, y los
    // asaltantes que patrullan o brotan. Los tres van por el sello —tienen
    // sitio—, así que no se le entregan a nadie que no los mirara. Un grupo
    // que se DISPERSA sí tiene protagonista, quien cerró su región, y no
    // está aquí.
    const SIN_PROTAGONISTA = new Set(['day_start', 'raider_spawned']);
    for (const e of state.log) {
      // `game_over` no se exime: se le exige que su `actor` SEA el ganador, con
      // `null` solo si de verdad no ganó nadie. Eximirlo habría sido bajar el
      // listón para que cupiera el caso nuevo, que es lo contrario de lo que
      // este guardia hace: así sigue cazando un `game_over` anónimo de una
      // partida que sí tuvo ganador, que es el fallo que importa.
      if (e.kind === 'game_over') {
        expect(e.actor, 'el game_over no lleva al ganador').toBe(state.finished?.winner ?? null);
      } else if (!SIN_PROTAGONISTA.has(e.kind)) {
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

  it('las dos formas de «quién mira ahora» dicen lo mismo, casilla a casilla', () => {
    // `emit` pregunta por UNA casilla y `visibleNowAt` responde sin construir
    // el `Set` de 81 claves que `visibleNow` levantaba para tirarlo. Son la
    // misma regla escrita dos veces, y eso aquí se ata o se rompe solo: el día
    // que la visión deje de ser un cuadrado —un bosque que tape, un catalejo—,
    // la forma que se quede atrás sellará eventos que no vio nadie.
    //
    // El héroe se lleva a la esquina a propósito: es donde `marcarCuadrado` poda
    // por los límites del mapa, que es la mitad de la equivalencia que un
    // héroe en mitad de la franja no ejercita.
    const { state, ctx } = partida(109);
    pasear(state, ctx, 0, [{ x: 0, y: 0 }]);
    pasarTurno(state, ctx, 0);
    pasear(state, ctx, 1, [{ x: 39, y: 11 }]);
    expect(discrepanciasDeVision(state)).toEqual([]);

    // Y otra partida con los CASTILLOS en las esquinas, que es lo único que no
    // ejercitaba: desde #72 el pueblo tiene radio propio, y en mitad de la
    // franja su cuadrado de 5 no llega a ningún límite de arriba ni de abajo.
    // Comprobado que muerde: con el bucle del pueblo escrito a mano y la poda
    // de abajo olvidada, la primera pasada sigue verde y esta saca seis.
    expect(discrepanciasDeVision(newGame({ seed: 111, plan: ESQUINAS }))).toEqual([]);
  });

  it('un héroe enemigo acampado junto a mi capital me consta, sin nadie mío cerca', () => {
    // El criterio observable de #72, y el que da el issue: hasta ahora un
    // castillo veía **su propia casilla y nada más**, así que el rival podía
    // plantarse en la de al lado sin que llegara una línea. Medido: 0 de 60
    // escenarios antes, 60 de 60 después.
    const { state, ctx } = partida(110);

    // Mi héroe, al otro lado del mapa y fuera de la fila por la que viene el
    // rival: lo único que mira hacia mi capital es la capital.
    pasear(state, ctx, 0, [{ x: 20, y: 0 }]);
    pasarTurno(state, ctx, 0);
    // Y el rival cruza los 32 de la franja y acampa pegado a mi castillo.
    pasear(state, ctx, 1, [{ x: 3, y: 6 }]);
    pasarTurno(state, ctx, 1);

    const suyos = leer(state, 0).recentEvents.filter(
      (e) => e.kind === 'hero_moved' && e.actor === 1,
    );
    expect(suyos.some((e) => e.to.x === 3 && e.to.y === 6)).toBe(true);

    // Y solo lo que alcanza el castillo, no el viaje entero: la niebla sigue
    // siendo niebla. Si llegara todo, el test pasaría por no filtrar nada.
    const todos = state.log.filter((e) => e.kind === 'hero_moved' && e.actor === 1);
    expect(suyos.length).toBeLessThan(todos.length);
    expect(suyos.length).toBeGreaterThan(0);
  });

  it('la pantalla NO se filtra: el cliente sigue viendo el log entero', () => {
    // Deliberado, y escrito aquí para que no parezca un olvido: el lienzo del
    // mapa nunca pasó por #35 —pinta con `player.fog`, o sea «lo exploré
    // alguna vez»—, así que filtrar solo la crónica dejaría a la persona
    // viendo al rival moverse por el mapa sin una línea que lo contara. Las dos
    // mitades se quedan coherentes hasta que el mapa del cliente se arregle.
    const { state, ctx } = partida(108);
    nodoDelMedio(state).owner = 0;
    pasear(state, ctx, 0, [{ x: 4, y: 1 }]);
    pasarTurno(state, ctx, 0);
    pasear(state, ctx, 1, [MI_NODO]);

    const pintado = marcadoDe(renderLog(state.log, 0));
    expect(pintado).toMatch(/te ha quitado un paso/i);
    expect(leer(state, 0).recentEvents.some((e) => e.kind === 'node_captured')).toBe(false);
  });

  it('una batalla en la que defiendo llega entera, incluso la muerte del mío', () => {
    const { state, ctx } = partida(107);

    // Sin castillo cerca y sin más héroes: lo único que mira esa casilla es el
    // héroe que está a punto de morir en ella. Y SIN BASE: desde la fase 1b un
    // héroe con base vuelve a ella, y su `hero_defeated` se sella con él todavía
    // en el campo, mirándose caer. Lo que este test vigila es el otro caso, el
    // que sale del mapa: ahí el sello no lo salva y lo salva `actor`.
    (state.players[0] as { base: string | null }).base = null;
    heroById(state, 'hero-0').army = ejercito({ creature: TROPA_BARATA, count: 1 });
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

/**
 * La crónica de la pantalla, que es lo que lee la persona.
 *
 * Se prueba llamando a `renderLog` con los eventos puestos a mano y no jugando
 * una partida: lo que se afirma aquí es la REDACCIÓN y el COLOR, y hacen falta
 * los seis casos —lo mío, lo suyo y lo neutral— que ninguna semilla da juntos.
 * El dato de cada evento ya lo garantizan los tests de arriba.
 *
 * Y hay un motivo para que esto exista además del navegador: en el navegador se
 * vio que «Castillo de tú capturado por el jugador 1» era agramatical, y se
 * arregló. Un test no lo habría cazado; una vez cazado, es lo que impide que
 * vuelva.
 */
describe('la crónica de la pantalla deja de mentir', () => {
  const evento = (cuerpo: Record<string, unknown>): GameEvent =>
    ({ actor: 1, at: { x: 0, y: 0 }, seen: [], ...cuerpo }) as unknown as GameEvent;
  /** El HTML de un solo evento, para mirarlo entero sin ruido alrededor. */
  const linea = (cuerpo: Record<string, unknown>): string =>
    marcadoDe(renderLog([evento(cuerpo)], 0));

  it('la muerte de un héroe ENEMIGO ya no se pinta como derrota propia', () => {
    // El bug que más se notaba: `hero_defeated` salía SIEMPRE en clase `lose`,
    // así que matar al héroe del rival se le pintaba a la persona en rojo, con
    // el mismo color que perder el suyo.
    const mio = linea({ kind: 'hero_defeated', hero: 'h', actor: 0 });
    expect(mio).toContain('class="lose"');
    expect(mio).toContain('Un héroe tuyo ha caído');

    const suyo = linea({ kind: 'hero_defeated', hero: 'h', actor: 1 });
    expect(suyo).toContain('class="win"');
    expect(suyo).toContain('Ha caído un héroe del jugador 1');
    expect(suyo).not.toContain('lose');
  });

  it('la captura de un castillo dice a costa de quién', () => {
    // Criterio 9. «Castillo capturado» a secas era media verdad justo en el
    // evento que decide la partida.
    expect(linea({ kind: 'town_captured', town: 't', actor: 0, from: 1 })).toContain(
      'Has capturado un castillo del jugador 1',
    );
    expect(linea({ kind: 'town_captured', town: 't', actor: 0, from: null })).toContain(
      'Has capturado un castillo neutral',
    );
    const perdido = linea({ kind: 'town_captured', town: 't', actor: 1, from: 0 });
    expect(perdido).toContain('El jugador 1 te ha capturado un castillo');
    expect(perdido).toContain('class="lose"');
  });

  it('lo que construye y recluta el rival ya no parece tuyo', () => {
    // Criterio 11: sin dueño en el evento, las tres salían idénticas fuera de
    // quien fuesen, y la persona leía las obras del enemigo como suyas.
    expect(linea({ kind: 'built', town: 't', building: 'tavern', actor: 0 })).toContain(
      'Construido en\u00a0(0,\u00a00): Taberna',
    );
    expect(linea({ kind: 'built', town: 't', building: 'tavern', actor: 1 })).toContain(
      'El jugador 1 construye en\u00a0(0,\u00a00): Taberna',
    );
    expect(linea({ kind: 'recruited', town: 't', creature: TROPA_BARATA, count: 3 })).toContain(
      `El jugador 1 recluta 3 × ${unidadDelJuego(TROPA_BARATA).name}`,
    );
    expect(linea({ kind: 'garrison_taken', hero: 'h', town: 't' })).toContain(
      'El jugador 1 incorpora una guarnición',
    );
  });

  it('los hechizos del rival ya no se pintan como una buena noticia tuya', () => {
    // Salía SIEMPRE en clase `win`, aprendiera quien aprendiera.
    const spells = ['haste'];
    expect(linea({ kind: 'spells_learned', hero: 'h', town: 't', spells, actor: 0 })).toContain(
      '<div class="win">Aprendido en\u00a0(0,\u00a00): Prisa</div>',
    );
    // Sin clase: lo que aprende el rival no es ni tu victoria ni tu derrota.
    expect(linea({ kind: 'spells_learned', hero: 'h', town: 't', spells, actor: 1 })).toContain(
      '<div>El jugador 1 aprende en\u00a0(0,\u00a00): Prisa</div>',
    );
  });

  it('subir de rango se cuenta, y se distingue el tuyo del suyo', () => {
    // Subir de rango reparte cuerpo y liderazgo, que no se ven en el mapa: sin
    // esta línea la persona no se enteraría de que su héroe ha progresado.
    const mio = linea({ kind: 'rank_up', hero: 'h', rank: 6, actor: 0 });
    expect(mio).toContain(
      '<div class="win">Un héroe tuyo sube a rango 6 en\u00a0(0,\u00a00)</div>',
    );

    const suyo = linea({ kind: 'rank_up', hero: 'h', rank: 7, actor: 1 });
    expect(suyo).toContain('<div>Un héroe del jugador 1 sube a rango 7 en\u00a0(0,\u00a00)</div>');
    expect(suyo).not.toContain('win');
  });

  it('la tropa que se hace héroe se cuenta, con el nombre del narrador escapado', () => {
    const cuerpo = { kind: 'hero_promoted', hero: 'h', town: 't', creature: TROPA };
    const quien = unidadDelJuego(TROPA).name;
    expect(linea({ ...cuerpo, name: 'Ana', actor: 0 })).toBe(
      `<div class="log" data-al-final="cronica"><div class="win">Un ${quien} tuyo se hace héroe en\u00a0(0,\u00a00): Ana</div></div>`,
    );
    const suyo = linea({ ...cuerpo, name: '<b>X</b>', actor: 1 });
    expect(suyo).toContain(
      `<div>Un ${quien} del jugador 1 se hace héroe en\u00a0(0,\u00a00): &lt;b&gt;X&lt;/b&gt;</div>`,
    );
    // Y le consta a su dueño aunque nadie lo mirara: es «lo tuyo, siempre».
    expect(visibleTo(evento({ ...cuerpo, name: 'Ana', actor: 0 }), 0)).toBe(true);
    expect(visibleTo(evento({ ...cuerpo, name: 'Ana', actor: 0 }), 1)).toBe(false);
  });

  it('el empate por días no se pinta en el rojo de derrota', () => {
    // La misma misatribución que la de `hero_defeated`, un evento más allá y
    // por el mismo motivo: la línea preguntaba `actor === viewer`, que es una
    // pregunta de DOS, y el fin de partida tiene tres respuestas. Con
    // `actor: null` —los días agotados, nadie gana— `!mio` era `true` y la
    // crónica cerraba la partida en rojo de derrota.
    //
    // Y esta línea la pinta también el espectador, que no lleva bando: para él
    // toda partida con ganador es ajena, pero un empate tampoco es su derrota.
    const gane = linea({ kind: 'game_over', actor: 0 });
    expect(gane).toContain('<div class="win">Fin de la partida</div>');

    const pierda = linea({ kind: 'game_over', actor: 1 });
    expect(pierda).toContain('<div class="lose">Fin de la partida</div>');

    const nadie = linea({ kind: 'game_over', actor: null });
    expect(nadie).toContain('<div>Fin de la partida</div>');
    expect(nadie).not.toContain('lose');
    expect(nadie).not.toContain('win');

    // El espectador (`NADIE = -1`), sus DOS mitades. La primera se escribió sola
    // y por eso se escapó la segunda: quien no lleva bando no pierde el empate,
    // pero **tampoco pierde la partida que gana otro**. Con la respuesta de dos
    // esta línea salía en rojo de derrota en la misma pantalla que decía «Gana el
    // jugador 1 — has ganado», y el test de arriba lo daba por bueno porque no la
    // miraba. La respuesta a «no tienes bando» no es «perdida»: es `ajena`.
    for (const actor of [null, 0, 1]) {
      const visto = marcadoDe(renderLog([evento({ kind: 'game_over', actor })], -1));
      expect(visto, `game_over con actor ${actor} visto sin bando`).toContain(
        '<div>Fin de la partida</div>',
      );
      expect(visto, `game_over con actor ${actor} visto sin bando`).not.toContain('lose');
      expect(visto, `game_over con actor ${actor} visto sin bando`).not.toContain('win');
    }
  });

  it('cada línea dice dónde, con la casilla del hecho (#18)', () => {
    // «Paso tomado» a secas no decía cuál, con once nodos por bando.
    const en = { at: { x: 12, y: 5 } };
    expect(linea({ kind: 'node_captured', node: 'n', from: null, actor: 0, ...en })).toBe(
      '<div class="log" data-al-final="cronica"><div class="win">Paso tomado en\u00a0(12,\u00a05)</div></div>',
    );
    expect(linea({ kind: 'node_captured', node: 'n', from: 0, actor: 1, ...en })).toContain(
      '<div class="lose">El jugador 1 te ha quitado un paso en\u00a0(12,\u00a05)</div>',
    );
    expect(
      linea({ kind: 'resource_gained', resource: 'wood', amount: 2, actor: 0, ...en }),
    ).toContain('+2 madera en\u00a0(12,\u00a05)');
    expect(linea({ kind: 'town_captured', town: 't', from: null, actor: 1, ...en })).toContain(
      'El jugador 1 captura un castillo neutral en\u00a0(12,\u00a05)',
    );
    // Lo que no pasa en ningún sitio no inventa uno.
    expect(linea({ kind: 'day_start', day: 3, week: 1, actor: null, at: null })).toContain(
      '<div>— Día 3 —</div>',
    );
  });

  it('la dispersión de un grupo no dice dónde estaba: la niebla lo escondía', () => {
    // `actor` es quien cerró la región y el hecho le consta por suyo aunque no
    // viera al grupo; su `at` es la patrulla que no veía.
    const disperso = linea({
      kind: 'raider_dispersed',
      raider: 'r',
      actor: 0,
      at: { x: 30, y: 2 },
    });
    expect(disperso).toContain('Los asaltantes de tu región se dispersan</div>');
    expect(disperso).not.toContain('30');
  });

  it('la batalla dice contra quién: monstruo, grupo, guarnición o héroe (#18)', () => {
    const batalla = (
      foe: Record<string, unknown>,
      owners: Record<string, number | null>,
      winner = 'attacker',
    ) =>
      evento({
        kind: 'battle_ended',
        winner,
        foe,
        owners,
        rounds: 2,
        casts: [],
        lost: { attacker: [], defender: [{ creature: NO_MUERTO, count: 3 }] },
        actor: owners.attacker,
        at: { x: 7, y: 8 },
      });
    const pinta = (e: GameEvent, quien: number): string => marcadoDe(renderLog([e], quien));
    const caidos = `3\u00a0× ${unidadDelJuego(NO_MUERTO).name}`;
    const monstruo = batalla({ kind: 'monster', objectId: 'm' }, { attacker: 0, defender: null });
    expect(pinta(monstruo, 0)).toContain(
      `<div class="win">Batalla ganada contra un monstruo en\u00a0(7,\u00a08), en 2 rondas; pierde el enemigo ${caidos}</div>`,
    );
    expect(pinta(monstruo, -1)).toContain(
      `<div>Batalla en\u00a0(7,\u00a08): un héroe del jugador 0 contra un monstruo; gana el jugador 0 en 2 rondas; pierde el monstruo ${caidos}</div>`,
    );
    const ciudad = batalla({ kind: 'town', townId: 't' }, { attacker: 1, defender: null });
    expect(pinta(ciudad, -1)).toContain(
      `un héroe del jugador 1 contra la guarnición de una ciudad neutral; gana el jugador 1 en 2 rondas; pierde la guarnición ${caidos}`,
    );
    const castillo = batalla(
      { kind: 'town', townId: 't' },
      { attacker: 1, defender: 0 },
      'defender',
    );
    expect(pinta(castillo, 0)).toContain(
      '<div class="win">Batalla ganada contra un héroe del jugador 1 en\u00a0(7,\u00a08), en 2 rondas',
    );
    expect(pinta(castillo, 1)).toContain(
      '<div class="lose">Batalla perdida contra la guarnición de un castillo del jugador 0 en\u00a0(7,\u00a08)',
    );
    // La emboscada: el atacante sin dueño es el grupo, y el defensor, tu héroe.
    const emboscada = batalla(
      { kind: 'hero', heroId: 'h' },
      { attacker: null, defender: 0 },
      'defender',
    );
    expect(pinta(emboscada, 0)).toContain(
      'Batalla ganada contra un grupo de asaltantes en\u00a0(7,\u00a08)',
    );
    expect(pinta(emboscada, -1)).toContain(
      'Batalla en\u00a0(7,\u00a08): un grupo de asaltantes contra un héroe del jugador 0; gana el jugador 0',
    );
    // Un héroe sin dueño no existe: se lanza en vez de inventarle uno.
    const roto = batalla({ kind: 'hero', heroId: 'h' }, { attacker: 0, defender: null });
    expect(() => pinta(roto, -1)).toThrow('la crónica cuenta una batalla de un héroe sin dueño');
  });

  it('ninguna línea compone un genitivo agramatical', () => {
    // El navegador cazó «Castillo de tú capturado» y «un héroe de el jugador
    // 1»: componer «de» + el sujeto no vale en español, y por eso hay dos
    // formas del helper. Esto es lo que impide que vuelva la de una sola.
    const todas = marcadoDe(
      renderLog(
        [
          evento({ kind: 'town_captured', town: 't', actor: 1, from: 0 }),
          evento({ kind: 'town_captured', town: 't', actor: 0, from: 1 }),
          evento({ kind: 'hero_defeated', hero: 'h', actor: 1 }),
          evento({ kind: 'node_captured', node: 'n', actor: 1, from: 0 }),
          evento({ kind: 'node_captured', node: 'n', actor: 0, from: 1 }),
          evento({ kind: 'rank_up', hero: 'h', rank: 6, actor: 1 }),
          evento({ kind: 'rank_up', hero: 'h', rank: 6, actor: 0 }),
        ],
        0,
      ),
    );
    expect(todas).not.toMatch(/de tú|de el |a tú/);
  });
});
