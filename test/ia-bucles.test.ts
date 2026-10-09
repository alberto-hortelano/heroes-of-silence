/**
 * Los bucles de la IA de reglas (#181): el vaivén —ir y volver entre dos
 * casillas cada día, sin una batalla— y el encierro —esperar para siempre en
 * una región que embosca—. Los dos se ven solo mirando atrás, y la IA lo hace
 * leyendo la crónica (`ai/memoria.ts`).
 *
 * Los estados se montan con la marcha de verdad (`applyAdventureAction`): la
 * memoria lee `hero_moved` y `turn_start`, y un héroe colocado a mano no deja
 * rastro en la crónica, que es justo lo que comprueba el primer `it`.
 */
import { describe, expect, it } from 'vitest';
import { poderDe } from '../src/core/ai/fuerza.js';
import {
  inicioDeSusTurnos,
  turnosEnLaMismaCasilla,
  vueltaDelVaiven,
} from '../src/core/ai/memoria.js';
import { chooseHeroDestination, stepTowards } from '../src/core/ai/strategy.js';
import { marchaDeHoy, playAiTurn } from '../src/core/ai/turn.js';
import type { Hero } from '../src/core/hero/hero.js';
import { pointKey } from '../src/core/map/map.js';
import { estructura, VECINAS } from '../src/core/map/regiones.js';
import { createRng } from '../src/core/rng.js';
import { regionDeCasilla, tocaUnNodo } from '../src/core/state/asaltantes.js';
import {
  alcanceDelHeroe,
  applyAdventureAction,
  caminoHasta,
  type GameContext,
  type GameState,
  heroesOf,
  revealEverything,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import type { Point } from '../src/core/types.js';
import { costesDelAlcance } from './helpers.js';

/** Anda `hero` hasta `to` con puntos de sobra: lo que importa es dónde acaba. */
function andar(state: GameState, ctx: GameContext, hero: Hero, to: Point): void {
  hero.movePoints = 100_000;
  applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to }, ctx, hero.owner);
  expect(pointKey(hero.at), `la marcha de ${hero.id} no llegó`).toBe(pointKey(to));
}

/** Cierra el día: el turno del jugador 0 y el del 1, sin que ninguno haga nada. */
function pasarElDia(state: GameState, ctx: GameContext): void {
  expect(state.current).toBe(0);
  applyAdventureAction(state, { type: 'end_turn' }, ctx, 0);
  applyAdventureAction(state, { type: 'end_turn' }, ctx, 1);
  expect(state.current).toBe(0);
}

/** Una partida sin asaltantes: que ninguno embosque ni tape un camino a mitad del guion. */
function sinAsaltantes(semilla: number) {
  const state = newGame({ seed: semilla });
  state.raiders = [];
  // Y sin el recuerdo que dejaron al crear la partida (#164): la IA teme lo que
  // vio, y un grupo quitado a mano no se va de su región a la vista de nadie.
  for (const p of state.players) p.asaltantesVistos.clear();
  const ctx = { rng: createRng(semilla) };
  const hero = heroesOf(state, 0)[0]!;
  return { state, ctx, hero };
}

describe('la memoria de la IA se lee de la crónica', () => {
  it('dónde empezó cada turno de su dueño, del de ahora al más viejo; lo que no consta es null', () => {
    const { state, ctx, hero } = sinAsaltantes(3);
    const casa = hero.at;
    // El héroe de salida no ha dejado rastro: la crónica no dice dónde empezó.
    expect(inicioDeSusTurnos(state, hero, 3)).toEqual([null, null, null]);

    const lejos = { ...hero.at };
    const alcance = alcanceDelHeroe(state, hero);
    const fuera = [...costesDelAlcance(alcance).keys()].find((k) => k !== pointKey(casa));
    if (fuera === undefined) throw new Error('el héroe de la semilla 3 no llega a ninguna parte');
    const [x, y] = fuera.split(',').map(Number) as [number, number];
    andar(state, ctx, hero, { x, y });
    pasarElDia(state, ctx);
    andar(state, ctx, hero, lejos);
    pasarElDia(state, ctx);

    // Día 3: empezó en casa (el de ahora), fuera (el 2) y el 1 no consta.
    expect(inicioDeSusTurnos(state, hero, 4)).toEqual([pointKey(casa), fuera, null, null]);
    expect(turnosEnLaMismaCasilla(state, hero, 5)).toBe(1);

    // Y colocado a mano, la crónica no sabe dónde está: nada cuenta.
    hero.at = { x, y };
    expect(turnosEnLaMismaCasilla(state, hero, 5)).toBe(0);
    expect(vueltaDelVaiven(state, hero)).toBeNull();
  });
});

describe('el vaivén', () => {
  /**
   * El héroe en su base (A) y el paso que daría hoy (B). Se le hace ir y volver
   * `idas` veces, como haría el vaivén de la semilla 1033 con lado 40, y se
   * devuelve el estado con el héroe otra vez en A.
   */
  function vaiven(idas: number) {
    // La 6 (la 48 hasta #226, cuando el mapa pasó a 42×42 y la marcha del día 1
    // de la 48 ya no llegaba a su paso; la 46 hasta #195, la 43 hasta #189): el
    // primer paso del día 1 es una casilla vacía de camino a un objetivo lejano,
    // e ir y volver no recoge ni toma nada por el camino.
    const { state, ctx, hero } = sinAsaltantes(6);
    const a = { ...hero.at };
    const marcha = marchaDeHoy(state, hero);
    if (marcha === null) throw new Error('el héroe de la semilla 6 no tiene a dónde ir el día 1');
    const b = marcha.paso;
    for (let i = 0; i < idas; i++) {
      andar(state, ctx, hero, b);
      pasarElDia(state, ctx);
      andar(state, ctx, hero, a);
      pasarElDia(state, ctx);
    }
    return { state, hero, a, b };
  }

  it('dos vueltas enteras de A a B sin pelear: la tercera no se da', () => {
    const { state, hero, a, b } = vaiven(2);
    expect(inicioDeSusTurnos(state, hero, 4)).toEqual([a, b, a, b].map(pointKey));
    expect(vueltaDelVaiven(state, hero)).toEqual(b);

    // Lo que elegiría el héroe desde cero sigue siendo B: es la memoria la que
    // lo cambia, no que el mapa ya no le ofrezca B.
    const alcance = alcanceDelHeroe(state, hero, { evitarEmboscadas: true });
    const destino = chooseHeroDestination(state, hero, alcance);
    expect(destino).not.toBeNull();
    expect(stepTowards(hero, destino!, alcance)).toEqual(b);

    // Otro objetivo cuyo paso no lleve a B, o quedarse quieto: los dos rompen
    // la vuelta.
    const marcha = marchaDeHoy(state, hero);
    expect(pointKey(marcha?.paso ?? hero.at)).not.toBe(pointKey(b));
  });

  it('una sola vuelta es ir y volver, no un vaivén: el héroe da el paso de siempre', () => {
    const { state, hero, b } = vaiven(1);
    expect(vueltaDelVaiven(state, hero)).toBeNull();
    expect(marchaDeHoy(state, hero)?.paso).toEqual(b);
  });

  it('quieto no es un vaivén: lo lleva el encierro', () => {
    const { state, ctx, hero } = sinAsaltantes(6);
    const otra = marchaDeHoy(state, hero)!.paso;
    andar(state, ctx, hero, otra);
    for (let i = 0; i < 5; i++) pasarElDia(state, ctx);
    expect(turnosEnLaMismaCasilla(state, hero, 10)).toBe(5);
    expect(vueltaDelVaiven(state, hero)).toBeNull();
  });
});

describe('el encierro con el rival libre', () => {
  /**
   * El héroe del jugador 0, sin tropa, en una casilla de la región del grupo
   * más fuerte desde la que su alcance prudente es solo ella; el rival, libre
   * en su casa. Entra andando —con tropa, para que no lo embosquen al entrar—,
   * y se le deja ahí `dias` días.
   */
  function encerrado(semilla: number, dias: number) {
    const state = newGame({ seed: semilla });
    // El héroe sabe del grupo (#164): aquí se prueba lo que hace con lo que sabe.
    revealEverything(state, 0);
    const ctx = { rng: createRng(semilla) };
    const grupo = [...state.raiders].sort((a, b) => poderDe(b) - poderDe(a))[0]!;
    const hero = heroesOf(state, 0)[0]!;
    const rival = heroesOf(state, 1)[0]!;
    const region = regionDeCasilla(state.map, grupo.at);
    const { regionDe } = estructura(state.map);
    const W = state.map.width;
    const ocupada = (p: Point) =>
      [...state.heroes, ...state.raiders].some((o) => pointKey(o.at) === pointKey(p));
    const tropa = hero.army;

    // Una casilla de la región, lejos de los nodos, desde la que el héroe sin
    // tropa no pueda dar un paso prudente; y una vecina desde la que llegar.
    let par: { desde: Point; hasta: Point } | undefined;
    for (let i = 0; i < regionDe.length && par === undefined; i++) {
      if (regionDe[i] !== region) continue;
      const hasta = { x: i % W, y: Math.floor(i / W) };
      if (tocaUnNodo(state.map, hasta) || ocupada(hasta)) continue;
      hero.at = hasta;
      hero.army = [];
      const encerrada =
        alcanceDelHeroe(state, hero, { evitarEmboscadas: true }).descubiertas.length <= 1;
      hero.army = tropa;
      if (!encerrada) continue;
      for (const [dx, dy] of VECINAS) {
        const desde = { x: hasta.x + dx, y: hasta.y + dy };
        if (regionDe[desde.y * W + desde.x] !== region || ocupada(desde)) continue;
        hero.at = desde;
        if (caminoHasta(state, hero, hasta)?.length === 1) {
          par = { desde, hasta };
          break;
        }
      }
    }
    if (par === undefined) throw new Error(`la semilla ${semilla} no deja una casilla encerrada`);

    // Sin los grupos mientras entra: con su tropa de salida, el de la región
    // lo emboscaría al pisarla, y aquí se prueba lo que pasa después.
    const grupos = state.raiders;
    state.raiders = [];
    hero.at = par.desde;
    andar(state, ctx, hero, par.hasta);
    state.raiders = grupos;
    hero.army = [];
    for (let i = 0; i < dias; i++) pasarElDia(state, ctx);
    expect(pointKey(hero.at)).toBe(pointKey(par.hasta));
    expect(
      alcanceDelHeroe(state, hero, { evitarEmboscadas: true }).descubiertas.length,
    ).toBeLessThanOrEqual(1);
    expect(
      alcanceDelHeroe(state, rival, { evitarEmboscadas: true }).descubiertas.length,
    ).toBeGreaterThan(1);
    return { state, hero };
  }

  it('espera mientras esperar puede arreglarlo, y a los 10 turnos vuelve a casa', () => {
    // Entra el día 1, así que el día 10 empieza ahí su noveno turno.
    const pronto = encerrado(5, 9);
    expect(turnosEnLaMismaCasilla(pronto.state, pronto.hero, 10)).toBe(9);
    expect(marchaDeHoy(pronto.state, pronto.hero)).toBeNull();

    const tarde = encerrado(5, 10);
    expect(turnosEnLaMismaCasilla(tarde.state, tarde.hero, 10)).toBe(10);
    const marcha = marchaDeHoy(tarde.state, tarde.hero);
    expect(marcha).not.toBeNull();
    // Por el alcance de siempre: el prudente no le dejaba dar ni un paso.
    expect(marcha!.alcance.descubiertas.length).toBeGreaterThan(1);
  });

  it('fuera de su base, sin a dónde ir y con un alcance que no es su casilla, a los 10 turnos también vuelve (#186)', async () => {
    // Lado 44, semilla 222: los dos héroes en una ciudad que no es su base, con
    // las regiones de alrededor patrulladas por grupos que les sacan el margen.
    // El alcance prudente era la ciudad y sus nodos (129 y 133 casillas), así
    // que la regla de arriba no saltaba y nadie se movió del día 20 al 300.
    const state = newGame({ seed: 222, width: 44, height: 44, maxDays: 300 });
    const ctx = { rng: createRng(222) };
    while (state.finished === null) await playAiTurn(state, ctx);
    expect(state.finished.winner).not.toBeNull();
    expect(state.day).toBeLessThan(60);
  });
});
