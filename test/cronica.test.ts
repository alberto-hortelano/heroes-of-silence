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
import { renderLog } from '../src/client/views/panels.js';
import { playAiGame } from '../src/core/ai/turn.js';
import { serializeAdventureTurn } from '../src/core/contract/serialize.js';
import type { MapPlan } from '../src/core/map/generate.js';
import { pointKey } from '../src/core/map/map.js';
import { createRng } from '../src/core/rng.js';
import type { GameEvent } from '../src/core/state/events.js';
import { visibleTo } from '../src/core/state/events.js';
import {
  applyAdventureAction,
  type GameContext,
  type GameState,
  heroById,
  resolvePendingBattle,
  visibleNow,
  visibleNowAt,
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

/** El mismo mapa con los castillos en las esquinas, para la poda de los bordes. */
const ESQUINAS: MapPlan = {
  ...PLANO,
  towns: [
    { id: 'mio', name: 'Valdeluz', faction: 'knight', at: { x: 0, y: 0 }, owner: 0 },
    { id: 'suyo', name: 'Osario', faction: 'necromancer', at: { x: 39, y: 11 }, owner: 1 },
  ],
};

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
        if (visibleNowAt(state, p.id, q) !== conjunto.has(pointKey(q))) {
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
    expect(ev.some((e) => e.kind === 'player_defeated' && e.actor === 0)).toBe(true);
    expect(ev.some((e) => e.kind === 'game_over' && e.actor === 1)).toBe(true);
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

  it('las dos formas de «quién mira ahora» dicen lo mismo, casilla a casilla', () => {
    // `emit` pregunta por UNA casilla y `visibleNowAt` responde sin construir
    // el `Set` de 81 claves que `visibleNow` levantaba para tirarlo. Son la
    // misma regla escrita dos veces, y eso aquí se ata o se rompe solo: el día
    // que la visión deje de ser un cuadrado —un bosque que tape, un catalejo—,
    // la forma que se quede atrás sellará eventos que no vio nadie.
    //
    // El héroe se lleva a la esquina a propósito: es donde `visibleFrom` poda
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
    pasear(state, ctx, 0, [{ x: 4, y: 1 }]);
    pasarTurno(state, ctx, 0);
    pasear(state, ctx, 1, [MI_MINA]);

    const pintado = renderLog(state.log, 0);
    expect(pintado).toMatch(/mina/i);
    expect(leer(state, 0).recentEvents.some((e) => e.kind === 'mine_captured')).toBe(false);
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
  const linea = (cuerpo: Record<string, unknown>): string => renderLog([evento(cuerpo)], 0);

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
      'Construido: Taberna',
    );
    expect(linea({ kind: 'built', town: 't', building: 'tavern', actor: 1 })).toContain(
      'El jugador 1 construye: Taberna',
    );
    expect(linea({ kind: 'recruited', town: 't', creature: 'peasant', count: 3 })).toContain(
      'El jugador 1 recluta 3 × Campesino',
    );
    expect(linea({ kind: 'garrison_taken', hero: 'h', town: 't' })).toContain(
      'El jugador 1 incorpora una guarnición',
    );
  });

  it('los hechizos del rival ya no se pintan como una buena noticia tuya', () => {
    // Salía SIEMPRE en clase `win`, aprendiera quien aprendiera.
    const spells = ['haste'];
    expect(linea({ kind: 'spells_learned', hero: 'h', town: 't', spells, actor: 0 })).toContain(
      '<div class="win">Aprendido: Prisa</div>',
    );
    // Sin clase: lo que aprende el rival no es ni tu victoria ni tu derrota.
    expect(linea({ kind: 'spells_learned', hero: 'h', town: 't', spells, actor: 1 })).toContain(
      '<div>El jugador 1 aprende: Prisa</div>',
    );
  });

  it('ninguna línea compone un genitivo agramatical', () => {
    // El navegador cazó «Castillo de tú capturado» y «un héroe de el jugador
    // 1»: componer «de» + el sujeto no vale en español, y por eso hay dos
    // formas del helper. Esto es lo que impide que vuelva la de una sola.
    const todas = renderLog(
      [
        evento({ kind: 'town_captured', town: 't', actor: 1, from: 0 }),
        evento({ kind: 'town_captured', town: 't', actor: 0, from: 1 }),
        evento({ kind: 'hero_defeated', hero: 'h', actor: 1 }),
        evento({ kind: 'mine_captured', mine: 'm', actor: 1, from: 0 }),
        evento({ kind: 'mine_captured', mine: 'm', actor: 0, from: 1 }),
      ],
      0,
    );
    expect(todas).not.toMatch(/de tú|de el |a tú/);
  });
});
