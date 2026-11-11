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
 * nodo son los pasos—, que no tapan la vista: la visión es un cuadrado. Desde la
 * niebla por regiones (02-11-2026), un cuadrado sobre lo explorado: para ver lo
 * que pasa en una región hay que haberla pisado (`explorarLaVega`).
 */
import { describe, expect, it } from 'vitest';
import { marcadoDe } from '../src/client/comun/html.js';
import { NADIE } from '../src/client/comun/quien-mira.js';
import { renderLog } from '../src/client/views/cronica.js';
import { playAiGame, resolvePendingBattle } from '../src/core/ai/turn.js';
import { serializeAdventureTurn } from '../src/core/contract/aventura.js';
import { cronicaAlAgente, hechoDeLaCronicaAlAgente } from '../src/core/contract/hechos.js';
import type { MapPlan } from '../src/core/map/generar/plan.js';
import type { MapObject } from '../src/core/map/tipos.js';
import { createRng } from '../src/core/rng.js';
import { heroById } from '../src/core/state/consultas.js';
import type { GameEvent, GameEventDraft } from '../src/core/state/events.js';
import { cronicaPara, sinSello, visibleTo } from '../src/core/state/events.js';
import { applyAdventureAction } from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import { dueñoDeLaCiudad, sitioSiExiste } from '../src/core/state/sitios.js';
import type { GameContext, GameState } from '../src/core/state/tipos.js';
import {
  HERO_SCOUT_RADIUS,
  objetosConocidos,
  visibleNow,
  visibleNowAt,
} from '../src/core/state/vision.js';
import { building } from '../src/core/town/buildings.js';
import type { Point } from '../src/core/types.js';
import { unidadDelJuego } from '../src/core/unidad/catalogo.js';
import { FACCION_A, FACCION_B, NO_MUERTO, PESADA, TROPA, TROPA_BARATA } from './comun.js';
import { fugasDe, fugasDeTodos } from './fugas-de-los-hechos.js';
import { ejercito, sinGuarnicionDeSalida } from './partida-de-prueba.js';

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
  villages: [],
  monsters: [],
  chests: [],
  // A una ciudad se entra por las puertas de su recinto a las que llega un
  // camino (la ciudad amurallada, fase 2): el de cada región que la toca, por
  // la diagonal de arriba de su lado.
  roads: [
    ...[0, 1, 2, 3, 4].map((x) => ({ x, y: x === 2 ? 6 : 5 })),
    ...[35, 36, 37, 38, 39].map((x) => ({ x, y: x === 37 ? 6 : 5 })),
  ],
};

/**
 * El mismo tamaño con los castillos junto a los BORDES, para la poda de los
 * límites. En la esquina misma no pueden ir: una casilla de esquina solo tiene
 * tres vecinas y dos de ellas se tocan en diagonal, así que no separa dos
 * regiones. Y en el borde tampoco, desde el recinto de las ciudades (vuelta 3):
 * su 3 × 3 no cabría (`problemasDeRecintos`). Van a una casilla de los extremos
 * de una cordillera que parte el mapa en norte y sur: su cuadrado de vista
 * sigue pasando del borde por tres lados.
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
    { id: 'mio', name: 'Valdeluz', faction: FACCION_A, at: { x: 1, y: 5 }, owner: 0 },
    { id: 'suyo', name: 'Osario', faction: FACCION_B, at: { x: 38, y: 5 }, owner: 1 },
  ],
  // Por la puerta del norte y la del sur de cada una.
  roads: [3, 4, 5, 6, 7].flatMap((y) => [
    { x: 1, y },
    { x: 38, y },
  ]),
};

/** El nodo de la franja, para dárselo a quien haga falta. */
function nodoDelMedio(state: GameState): Extract<MapObject, { kind: 'node' }> {
  const nodo = state.map.objects.find((o) => o.kind === 'node');
  if (nodo === undefined || nodo.kind !== 'node') throw new Error('la franja no tiene nodo');
  return nodo;
}

/**
 * Mi héroe pisa el nodo del medio, que le descubre la vega (la región del otro
 * lado de la cordillera de la columna 30), y se planta en (28,6), en el llano. El
 * nodo vuelve a ser de nadie: aquí se mide lo que ve el héroe, y un nodo mío
 * miraría a 6 (`NODE_SCOUT_RADIUS`).
 */
function explorarLaVega(state: GameState, ctx: GameContext): void {
  pasear(state, ctx, 0, [MI_NODO, { x: 28, y: 6 }]);
  nodoDelMedio(state).owner = null;
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

    // Mi héroe se planta en (28,6), con la vega ya pisada: ve de 28 − r a 28 + r
    // (r = 5 en el 42×42, #229), y de la vega, lo que cae en ese cuadrado.
    explorarLaVega(state, ctx);
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

  it('lo que el rival hace en el radio pero en una región sin pisar no llega (02-11-2026)', () => {
    const { state, ctx } = partida(102);
    // El mismo paseo que arriba sin pisar el nodo: la vega sigue en negro para mí.
    pasear(state, ctx, 0, [{ x: 28, y: 6 }]);
    pasarTurno(state, ctx, 0);
    pasear(state, ctx, 1, [{ x: 31, y: 6 }]);
    pasarTurno(state, ctx, 1);
    // A tres casillas de mi héroe, y no lo veo: nada se ve sobre lo no explorado.
    expect(visibleNow(state, 0).has({ x: 31, y: 6 })).toBe(false);
    expect(leer(state, 0).recentEvents.some((e) => e.kind === 'hero_moved' && e.actor === 1)).toBe(
      false,
    );
  });

  it('lo que vi el día 3 me sigue constando el día 4: la crónica es memoria', () => {
    const { state, ctx } = partida(103);

    explorarLaVega(state, ctx);
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

  it('un nodo mío tomado lejos me consta, y veo su bandera nueva (vuelta 1 de QA, H1)', () => {
    // Era «no me consta: como no constaba la mina». Desde la niebla de eventos
    // (02-11-2026) un nodo propio mira a 6: su toma pasa a la vista de su dueño,
    // que la ve hasta el instante en que cambia de bandera. Lo dice `from`, como
    // con un castillo, y el recuerdo del nodo es ya el del dueño nuevo.
    const { state, ctx } = partida(106);
    nodoDelMedio(state).owner = 0;

    pasear(state, ctx, 0, [{ x: 4, y: 1 }]);
    pasarTurno(state, ctx, 0);
    pasear(state, ctx, 1, [MI_NODO]);

    expect(state.log.some((e) => e.kind === 'node_captured' && e.from === 0)).toBe(true);
    expect(leer(state, 0).recentEvents.some((e) => e.kind === 'node_captured')).toBe(true);
    const sabido = objetosConocidos(state, 0, visibleNow(state, 0)).find(
      (r) => r.object.id === nodoDelMedio(state).id,
    );
    expect(sabido?.object).toMatchObject({ owner: 1 });
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
    // hermano de `invariantes-partida.test.ts`: cuadrada la economía, la partida de
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

    // Y esos mismos hechos, como los lee el agente (10-11-2026, #292): ninguno con
    // una clave ni un enumerado en español (`fugas-de-los-hechos.ts`). Aquí y no en
    // `hechos-del-agente.test.ts`, que mira muestras: lo que una muestra olvide lo
    // traen los hechos que el núcleo escribe de verdad, y la partida ya está jugada.
    expect(fugasDeTodos(state.log.map(sinSello), hechoDeLaCronicaAlAgente)).toEqual([]);
    // Y por la puerta: lo mismo que deja pasar la niebla, uno a uno y traducido.
    for (const p of state.players) {
      const cruda = cronicaPara(state, p.id, 25);
      const servida = cronicaAlAgente(state, p.id, 25);
      expect(servida).toEqual(cruda.map(hechoDeLaCronicaAlAgente));
      expect(servida).toHaveLength(cruda.length);
      expect(fugasDe(servida)).toEqual([]);
    }
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
    // Y el rival cruza los 32 de la franja y acampa pegado a la muralla de mi
    // castillo, que no se pisa (`recinto.ts`): a dos casillas de él.
    pasear(state, ctx, 1, [{ x: 4, y: 6 }]);
    pasarTurno(state, ctx, 1);

    const suyos = leer(state, 0).recentEvents.filter(
      (e) => e.kind === 'hero_moved' && e.actor === 1,
    );
    expect(suyos.some((e) => e.to.x === 4 && e.to.y === 6)).toBe(true);

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
    // Un paso neutral que toma el rival lejos de todo lo mío: perder uno propio
    // me consta desde la vuelta 1 de QA de la niebla por regiones (`from`).
    const { state, ctx } = partida(108);
    pasear(state, ctx, 0, [{ x: 4, y: 1 }]);
    pasarTurno(state, ctx, 0);
    pasear(state, ctx, 1, [MI_NODO]);

    const pintado = marcadoDe(renderLog(state.log, 0));
    expect(pintado).toMatch(/toma un paso/i);
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
    // Y el rival, con tropa que lo derribe: con la fuerza y la agilidad
    // (25-10-2026) el héroe solo ganaba al del otro bando.
    heroById(state, 'hero-1').army = ejercito({ creature: PESADA, count: 5 });
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
    // Sin el sitio (el espectador), la casilla.
    const goblin = unidadDelJuego(TROPA_BARATA).name;
    expect(
      linea({ kind: 'troops_left', hero: 'h', site: 't', creature: TROPA_BARATA, count: 2 }),
    ).toContain(`El jugador 1 deja 2 × ${goblin} en la guarnición en\u00a0(0,\u00a00)`);
    expect(
      linea({ kind: 'troops_taken', hero: 'h', site: 't', creature: TROPA_BARATA, count: 1 }),
    ).toContain(`El jugador 1 recoge 1 × ${goblin} de la guarnición en\u00a0(0,\u00a00)`);
    expect(linea({ kind: 'defense_set', hero: 'h', site: 't', fighting: 4, staying: 1 })).toContain(
      'El jugador 1 defiende con 4 individuos y deja fuera 1 individuo',
    );
  });

  it('la guarnición se nombra por su sitio, y un reparto es una línea (H4 del QA)', () => {
    const state = newGame({ seed: 3 });
    const base = state.towns.find((t) => dueñoDeLaCiudad(state, t) === 0)!;
    const paso = state.map.objects.find((o) => o.kind === 'node')!;
    const conSitio = (cuerpo: Record<string, unknown>, quien = 0): string =>
      marcadoDe(renderLog([evento(cuerpo)], quien, { sitioDe: (id) => sitioSiExiste(state, id) }));
    const goblin = unidadDelJuego(TROPA_BARATA).name;
    const escudo = unidadDelJuego(TROPA).name;
    expect(
      conSitio({
        kind: 'troops_left',
        hero: 'h',
        site: base.id,
        creature: TROPA,
        count: 3,
        actor: 0,
      }),
    ).toContain(`Dejas 3 × ${escudo} en la guarnición de ${base.name}`);
    expect(
      conSitio({
        kind: 'troops_taken',
        hero: 'h',
        site: paso.id,
        creature: TROPA,
        count: 1,
        actor: 0,
      }),
    ).toMatch(
      new RegExp(
        `Recoges 1 × ${escudo} de la guarnición (del|de la) .* de \\(${paso.at.x},${paso.at.y}\\)`,
      ),
    );
    expect(
      conSitio({
        kind: 'troops_exchanged',
        hero: 'h',
        site: base.id,
        left: [{ creature: TROPA, count: 2 }],
        taken: [{ creature: TROPA_BARATA, count: 1 }],
        actor: 0,
      }),
    ).toContain(`Dejas 2 × ${escudo} y recoges 1 × ${goblin} en la guarnición de ${base.name}`);
    expect(
      conSitio({
        kind: 'troops_exchanged',
        hero: 'h',
        site: base.id,
        left: [],
        taken: [{ creature: TROPA_BARATA, count: 1 }],
        actor: 1,
      }),
    ).toContain(`El jugador 1 recoge 1 × ${goblin} en la guarnición de ${base.name}`);
    expect(
      conSitio({
        kind: 'defense_set',
        hero: 'h',
        site: base.id,
        fighting: 6,
        staying: 0,
        actor: 0,
      }),
    ).toContain(`Defiendes ${base.name} con 6 individuos y dejas fuera 0`);
  });

  it('lo que deja una guarnición tras la batalla se dice «del puente», no «de el puente» (I de /simplify)', () => {
    const state = newGame({ seed: 3 });
    // Un paso que se nombra con «el» (el puente, el paso de montaña…): la puerta de la
    // muralla es «la», y con ella las dos frases coincidían.
    const paso = state.map.objects.find((o) => {
      const sitio = o.kind === 'node' ? sitioSiExiste(state, o.id) : null;
      return sitio?.kind === 'paso' && sitio.nodo.barrera !== 'wall';
    })!;
    const goblin = unidadDelJuego(TROPA_BARATA).name;
    const frase = marcadoDe(
      renderLog(
        [
          evento({
            kind: 'left_behind',
            hero: null,
            site: paso.id,
            creature: TROPA_BARATA,
            count: 1,
            lost: [],
            actor: 1,
          }),
        ],
        0,
        { sitioDe: (id) => sitioSiExiste(state, id) },
      ),
    );
    expect(frase).toMatch(
      new RegExp(
        `La guarnición del (paso|puente).* de \\(${paso.at.x},${paso.at.y}\\) deja 1 × ${goblin}`,
      ),
    );
    expect(frase).not.toMatch(/de el /);
  });

  it('la obra de un puesto se nombra por su sitio, con su precio (fase 3 del puesto fronterizo)', () => {
    const state = newGame({ seed: 3 });
    const paso = state.map.objects.find((o) => o.kind === 'node')!;
    const conSitio = (cuerpo: Record<string, unknown>): string =>
      marcadoDe(renderLog([evento(cuerpo)], 0, { sitioDe: (id) => sitioSiExiste(state, id) }));
    const obra = (to: string, actor: number) => ({
      kind: 'outpost_upgraded',
      hero: 'h',
      site: paso.id,
      to,
      cost: to === 'empalizada' ? 1500 : 4000,
      actor,
    });
    const donde = `de \\(${paso.at.x},${paso.at.y}\\)`;
    expect(conSitio(obra('empalizada', 0))).toMatch(
      new RegExp(`>Levantas la empalizada en (el|la) [^<]* ${donde} por 1500 oro<`),
    );
    expect(conSitio(obra('muralla', 1))).toMatch(
      new RegExp(`>El jugador 1 amuralla (el|la) [^<]* ${donde} por 4000 oro<`),
    );
    // Sin el sitio (el espectador), el puesto con su casilla.
    expect(linea(obra('muralla', 1))).toContain(
      'El jugador 1 amuralla el puesto en\u00a0(0,\u00a00) por 4000 oro',
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
      `<div class="log" data-al-final="cronica"><div class="win">Haces héroe a tu ${quien} en\u00a0(0,\u00a00): Ana</div></div>`,
    );
    const suyo = linea({ ...cuerpo, name: '<b>X</b>', actor: 1 });
    expect(suyo).toContain(
      `<div>El jugador 1 hace héroe a su ${quien} en\u00a0(0,\u00a00): &lt;b&gt;X&lt;/b&gt;</div>`,
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
    expect(linea({ kind: 'gold_gained', amount: 1500, actor: 0, ...en })).toContain(
      '+1500 de oro en\u00a0(12,\u00a05)',
    );
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
      `<div class="win">Batalla ganada contra un monstruo en\u00a0(7,\u00a08), en 2 rondas; pierde el enemigo: ${caidos}</div>`,
    );
    expect(pinta(monstruo, -1)).toContain(
      `<div>Batalla en\u00a0(7,\u00a08): un héroe del jugador 0 contra un monstruo; gana el jugador 0 en 2 rondas; pierde el monstruo: ${caidos}</div>`,
    );
    // La guarnición de una ciudad es una guarnición más desde la tarea 2: la
    // neutral, sin dueño, y la de un castillo, de su dueño.
    const ciudad = batalla({ kind: 'garrison', site: 't' }, { attacker: 1, defender: null });
    expect(pinta(ciudad, -1)).toContain(
      `un héroe del jugador 1 contra una guarnición neutral; gana el jugador 1 en 2 rondas; pierde la guarnición: ${caidos}`,
    );
    const castillo = batalla(
      { kind: 'garrison', site: 't' },
      { attacker: 1, defender: 0 },
      'defender',
    );
    expect(pinta(castillo, 0)).toContain(
      '<div class="win">Batalla ganada contra un héroe del jugador 1 en\u00a0(7,\u00a08), en 2 rondas',
    );
    expect(pinta(castillo, 1)).toContain(
      '<div class="lose">Batalla perdida contra la guarnición de un sitio del jugador 0 en\u00a0(7,\u00a08)',
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

/**
 * #202: la crónica de quien no lleva bando (el espectador), la concordancia con el
 * nombre de una unidad y la casilla que nadie localiza.
 *
 * Sobre una muestra con **un hecho de cada clase** (`UNO_DE_CADA`), y no sobre los
 * dos del issue: el verde de la caída de un héroe en el espectador salió de dos
 * ramas que preguntaban `!mio`, y la siguiente que lo pregunte tiene que ponerse
 * roja aquí. El tipo obliga a dar una entrada a cada `kind` nuevo.
 */
describe('la crónica sin bando, sin «Un Sacerdotisa» y con la casilla a un clic (#202)', () => {
  const EN: Point = { x: 12, y: 5 };
  /** El mismo hecho hecho por el jugador 0, por el 1 y por nadie. */
  const deLosTres = <E extends GameEventDraft>(e: E): E[] =>
    [0, 1, null].map((actor) => ({ ...e, actor }) as E);
  const batalla = (
    foe: Extract<GameEventDraft, { kind: 'battle_ended' }>['foe'],
    owners: { attacker: number | null; defender: number | null },
  ): Extract<GameEventDraft, { kind: 'battle_ended' }> => ({
    kind: 'battle_ended',
    winner: 'attacker',
    foe,
    owners,
    rounds: 2,
    casts: [{ side: 'defender', spell: 'magic_arrow', target: TROPA, killed: 1 }],
    // Bajas en los dos bandos: el doble número salía en el que no es de quien lee.
    lost: {
      attacker: [{ creature: TROPA, count: 2 }],
      defender: [{ creature: NO_MUERTO, count: 3 }],
    },
    actor: owners.attacker,
    at: EN,
  });
  const UNO_DE_CADA: {
    readonly [K in GameEventDraft['kind']]: readonly Extract<GameEventDraft, { kind: K }>[];
  } = {
    day_start: [{ kind: 'day_start', day: 3, week: 1, actor: null, at: null }],
    turn_start: deLosTres({ kind: 'turn_start', actor: 0, at: null }),
    hero_moved: deLosTres({ kind: 'hero_moved', hero: 'h', to: EN, spent: 1, actor: 0, at: EN }),
    march_cut: deLosTres({ kind: 'march_cut', hero: 'h', faltan: 2, actor: 0, at: EN }),
    gold_gained: [
      ...deLosTres({ kind: 'gold_gained', amount: 1500, actor: 0, at: EN }),
      ...deLosTres({
        kind: 'gold_gained',
        amount: 200,
        from: 'lugar',
        lugar: 'l',
        actor: 0,
        at: EN,
      }),
    ],
    gold_paid: deLosTres({ kind: 'gold_paid', amount: 100, lugar: 'l', actor: 0, at: EN }),
    place_state: deLosTres({
      kind: 'place_state',
      lugar: 'l',
      nombre: 'El osario',
      estado: 'abierto',
      from: 'cerrado',
      dicho: 'abierto',
      actor: 0,
      at: EN,
    }),
    world_mark: deLosTres({ kind: 'world_mark', marca: 'm', lugar: 'l', actor: 0, at: EN }),
    item_given: deLosTres({
      kind: 'item_given',
      hero: 'h',
      item: 'lanza',
      lugar: 'l',
      actor: 0,
      at: EN,
    }),
    troops_joined: deLosTres({
      kind: 'troops_joined',
      hero: 'h',
      creature: TROPA,
      count: 3,
      lugar: 'l',
      actor: 0,
      at: EN,
    }),
    node_captured: [0, 1, null].flatMap((from) =>
      deLosTres({ kind: 'node_captured', node: 'n', from, actor: 0, at: EN }),
    ),
    town_captured: [0, 1, null].flatMap((from) =>
      deLosTres({ kind: 'town_captured', town: 't', from, actor: 0, at: EN }),
    ),
    town_owner_changed: [
      { kind: 'town_owner_changed', town: 't', from: 0, to: 1, actor: null, at: EN },
      { kind: 'town_owner_changed', town: 't', from: 1, to: 0, actor: null, at: EN },
      { kind: 'town_owner_changed', town: 't', from: 0, to: null, actor: null, at: EN },
    ],
    site_occupied: [0, 1].flatMap((dueño) => [
      ...deLosTres({
        kind: 'site_occupied',
        site: 's',
        by: { kind: 'heroe', heroId: 'h', dueño },
        actor: 0,
        at: EN,
      }),
      ...deLosTres({
        kind: 'site_occupied',
        site: 's',
        by: { kind: 'guarnicion', dueño },
        actor: 0,
        at: EN,
      }),
    ]),
    site_freed: deLosTres({ kind: 'site_freed', site: 's', actor: 0, at: EN }),
    built: deLosTres({ kind: 'built', town: 't', building: 'tavern', actor: 0, at: EN }),
    recruited: deLosTres({
      kind: 'recruited',
      town: 't',
      creature: TROPA,
      count: 3,
      actor: 0,
      at: EN,
    }),
    dismissed: deLosTres({
      kind: 'dismissed',
      hero: 'h',
      creature: TROPA,
      count: 2,
      actor: 0,
      at: EN,
    }),
    left_behind: [
      ...deLosTres({
        kind: 'left_behind',
        hero: 'h',
        site: null,
        creature: TROPA,
        count: 1,
        lost: [],
        actor: 0,
        at: EN,
      }),
      ...deLosTres({
        kind: 'left_behind',
        hero: null,
        site: 's',
        creature: TROPA,
        count: 1,
        lost: ['lanza'],
        actor: 0,
        at: EN,
      }),
    ],
    hero_hired: deLosTres({ kind: 'hero_hired', hero: 'h', town: 't', actor: 0, at: EN }),
    loot_found: [
      ...deLosTres({
        kind: 'loot_found',
        hero: 'h',
        item: 'lanza',
        from: 'raider',
        actor: 0,
        at: EN,
      }),
      ...deLosTres({
        kind: 'loot_found',
        hero: 'h',
        item: 'lanza',
        from: 'lugar',
        lugar: 'l',
        actor: 0,
        at: EN,
      }),
    ],
    item_bought: deLosTres({
      kind: 'item_bought',
      hero: 'h',
      town: 't',
      item: 'lanza',
      actor: 0,
      at: EN,
    }),
    hero_promoted: deLosTres({
      kind: 'hero_promoted',
      hero: 'h',
      town: 't',
      creature: TROPA,
      name: 'Ana',
      actor: 0,
      at: EN,
    }),
    spells_learned: deLosTres({
      kind: 'spells_learned',
      hero: 'h',
      town: 't',
      spells: ['magic_arrow'],
      actor: 0,
      at: EN,
    }),
    troops_left: deLosTres({
      kind: 'troops_left',
      hero: 'h',
      site: 's',
      creature: TROPA,
      count: 2,
      actor: 0,
      at: EN,
    }),
    troops_taken: deLosTres({
      kind: 'troops_taken',
      hero: 'h',
      site: 's',
      creature: TROPA,
      count: 2,
      actor: 0,
      at: EN,
    }),
    troops_exchanged: deLosTres({
      kind: 'troops_exchanged',
      hero: 'h',
      site: 's',
      left: [{ creature: TROPA, count: 2 }],
      taken: [{ creature: NO_MUERTO, count: 1 }],
      actor: 0,
      at: EN,
    }),
    outpost_upgraded: deLosTres({
      kind: 'outpost_upgraded',
      hero: 'h',
      site: 's',
      to: 'empalizada',
      cost: 1500,
      actor: 0,
      at: EN,
    }),
    defense_set: deLosTres({
      kind: 'defense_set',
      hero: 'h',
      site: 's',
      fighting: 4,
      staying: 1,
      actor: 0,
      at: EN,
    }),
    battle_started: [
      ...deLosTres({
        kind: 'battle_started',
        attacker: { kind: 'hero', heroId: 'h' },
        foe: { kind: 'monster', objectId: 'm' },
        actor: 0,
        at: EN,
      }),
      ...deLosTres({
        kind: 'battle_started',
        attacker: { kind: 'raider', raiderId: 'r' },
        foe: { kind: 'hero', heroId: 'h' },
        actor: 0,
        at: EN,
      }),
    ],
    battle_ended: [
      batalla({ kind: 'monster', objectId: 'm' }, { attacker: 0, defender: null }),
      batalla({ kind: 'monster', objectId: 'm' }, { attacker: 1, defender: null }),
      batalla({ kind: 'hero', heroId: 'h' }, { attacker: 0, defender: 1 }),
      batalla({ kind: 'hero', heroId: 'h' }, { attacker: 1, defender: 0 }),
      batalla({ kind: 'garrison', site: 's' }, { attacker: 1, defender: 0 }),
      batalla({ kind: 'hero', heroId: 'h' }, { attacker: null, defender: 0 }),
    ],
    raider_spawned: deLosTres({
      kind: 'raider_spawned',
      raider: 'r',
      troops: [{ creature: TROPA_BARATA, count: 4 }],
      actor: null,
      at: EN,
    }),
    raider_dispersed: deLosTres({ kind: 'raider_dispersed', raider: 'r', actor: 0, at: EN }),
    march_halted: deLosTres({
      kind: 'march_halted',
      hero: 'h',
      raider: 'r',
      troops: [{ creature: TROPA_BARATA, count: 4 }],
      actor: 0,
      at: EN,
    }),
    hero_defeated: deLosTres({ kind: 'hero_defeated', hero: 'h', actor: 0, at: EN }),
    hero_returned: [
      ...deLosTres({
        kind: 'hero_returned',
        hero: 'h',
        town: 't',
        surrendered: false,
        actor: 0,
        at: EN,
      }),
      ...deLosTres({
        kind: 'hero_returned',
        hero: 'h',
        town: 't',
        surrendered: true,
        gold: 12000,
        actor: 0,
        at: EN,
      }),
    ],
    rank_up: deLosTres({ kind: 'rank_up', hero: 'h', rank: 6, actor: 0, at: EN }),
    troop_rank_up: deLosTres({
      kind: 'troop_rank_up',
      creature: TROPA,
      rank: 6,
      veterano: 'v',
      actor: 0,
      at: EN,
    }),
    player_defeated: deLosTres({
      kind: 'player_defeated',
      reason: 'lost_base',
      actor: 0,
      at: null,
    }),
    game_over: deLosTres({ kind: 'game_over', actor: 0, at: null }),
  };
  const MUESTRA: readonly GameEventDraft[] = Object.values(UNO_DE_CADA).flat();
  /**
   * La línea de un hecho, sin la caja de la crónica alrededor; `''` si no se pinta.
   * De uno en uno y no la muestra entera: `renderLog` pinta solo los 60 últimos.
   */
  const lineaDe = (
    e: GameEventDraft,
    viewer: number,
    opciones?: Parameters<typeof renderLog>[2],
  ): string => {
    const todo = marcadoDe(renderLog([e], viewer, opciones));
    const caja = '<div class="log" data-al-final="cronica">';
    expect(todo.startsWith(caja) && todo.endsWith('</div>')).toBe(true);
    return todo.slice(caja.length, -'</div>'.length);
  };
  const quien = (e: GameEventDraft, viewer: number) =>
    `${e.kind} con actor ${e.actor}, leído por ${viewer}: ${JSON.stringify(e)}`;

  it('quien no lleva bando no ve ninguna línea en el color de ganar o perder', () => {
    let conColor = 0;
    for (const e of MUESTRA) {
      for (const lleva of [false, true]) {
        const l = lineaDe(e, NADIE, { llevaALaCasilla: lleva });
        expect(l, quien(e, NADIE)).not.toMatch(/class="[^"]*\b(win|lose)\b/);
      }
      // Que la muestra muerda: con bando, buena parte de ella sí lleva color.
      if (/class="[^"]*\b(win|lose)\b/.test(lineaDe(e, 0))) conColor++;
    }
    expect(conColor).toBeGreaterThan(20);
  });

  it('con bando, la caída y la vuelta de un héroe siguen siendo derrota tuya o victoria tuya', () => {
    for (const kind of ['hero_defeated', 'hero_returned'] as const) {
      for (const e of UNO_DE_CADA[kind]) {
        if (e.actor === null) continue;
        expect(lineaDe(e, 0), quien(e, 0)).toMatch(
          e.actor === 0 ? /^<div class="lose">/ : /^<div class="win">/,
        );
        expect(lineaDe(e, 1), quien(e, 1)).toMatch(
          e.actor === 1 ? /^<div class="lose">/ : /^<div class="win">/,
        );
      }
    }
  });

  it('ninguna línea pega dos números («pierde el jugador 1 2 × …» se leía «12»)', () => {
    for (const e of MUESTRA) {
      for (const viewer of [NADIE, 0]) {
        for (const lleva of [false, true]) {
          const l = lineaDe(e, viewer, { llevaALaCasilla: lleva });
          expect(l, quien(e, viewer)).not.toMatch(/jugador \d+\s+\d/);
          expect(l, quien(e, viewer)).not.toMatch(/enemigo\s+\d/);
        }
      }
    }
    // Y donde salía, se lee con sus dos puntos.
    expect(
      lineaDe(batalla({ kind: 'hero', heroId: 'h' }, { attacker: 0, defender: 1 }), NADIE),
    ).toContain(`pierde el jugador 1: 3\u00a0× ${unidadDelJuego(NO_MUERTO).name}`);
  });

  it('la tropa que se hace héroe o sube de rango se lee igual con un nombre femenino', () => {
    const sacerdotisa = 'elfo-sacerdotisa';
    expect(unidadDelJuego(sacerdotisa).name).toBe('Sacerdotisa');
    for (const kind of ['hero_promoted', 'troop_rank_up'] as const) {
      for (const e of UNO_DE_CADA[kind]) {
        for (const viewer of [0, 1, NADIE]) {
          const con = (creature: string): string =>
            lineaDe({ ...e, creature }, viewer).replace(unidadDelJuego(creature).name, '«unidad»');
          // La frase no depende del género del nombre: solo cambia el nombre.
          expect(con(sacerdotisa), quien(e, viewer)).toBe(con(TROPA));
          expect(con(sacerdotisa), quien(e, viewer)).toContain('«unidad»');
          expect(con(sacerdotisa), quien(e, viewer)).not.toMatch(/\bUn «unidad»|«unidad» tuyo/);
        }
      }
    }
  });

  it('una guarnición tuya ocupa, no «una guarnición tuyo»', () => {
    const ocupa = UNO_DE_CADA.site_occupied.find(
      (e) => e.by.kind === 'guarnicion' && e.by.dueño === 0 && e.actor === 1,
    );
    if (ocupa === undefined) throw new Error('la muestra no tiene una guarnición del 0 ocupando');
    expect(lineaDe(ocupa, 0)).toContain('Una guarnición tuya ocupa un sitio');
    for (const e of MUESTRA) expect(lineaDe(e, 0), quien(e, 0)).not.toMatch(/guarnición tuyo/);
  });

  it('en la partida, la línea con casilla es un botón que lleva a ella y ya no dice la coordenada', () => {
    let botones = 0;
    for (const e of MUESTRA) {
      for (const viewer of [0, 1, NADIE]) {
        const l = lineaDe(e, viewer, { llevaALaCasilla: true });
        if (l === '') continue;
        const at = e.kind === 'raider_dispersed' ? null : e.at;
        if (at === null) {
          // La dispersión esconde dónde estaba el grupo: ni botón ni casilla.
          expect(l, quien(e, viewer)).toMatch(/^<div[ >]/);
          expect(l, quien(e, viewer)).not.toContain('data-x');
          expect(l, quien(e, viewer)).not.toContain(String(EN.x));
          continue;
        }
        botones++;
        expect(l, quien(e, viewer)).toMatch(
          new RegExp(
            `^<button type="button" class="a-la-casilla( win| lose)?" data-action="mirar-la-casilla" data-x="${at.x}" data-y="${at.y}" title="Ver en el mapa">[^<]*</button>$`,
          ),
        );
        expect(l, quien(e, viewer)).not.toMatch(/\(\d/);
      }
    }
    expect(botones).toBeGreaterThan(100);
    // Sin la opción (el espectador), el marcado de siempre, con la casilla dicha.
    const hecho = UNO_DE_CADA.built[0] as GameEventDraft;
    expect(lineaDe(hecho, NADIE)).toBe(
      `<div>El jugador 0 construye en\u00a0(12,\u00a05): ${building('tavern').name}</div>`,
    );
  });
});
