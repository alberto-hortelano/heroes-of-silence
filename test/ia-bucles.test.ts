/**
 * La memoria de la IA de reglas (#181): dónde empezó cada turno de un héroe, leído de
 * la crónica (`ai/memoria.ts`), que es con lo que la IA ve el vaivén y el encierro.
 * Lo que decide con ello (no dar la tercera vuelta, volver a casa) se retiró el
 * 03-11-2026 con los tests de jugabilidad.
 *
 * Los estados se montan con la marcha de verdad (`applyAdventureAction`): la
 * memoria lee `hero_moved` y `turn_start`, y un héroe colocado a mano no deja
 * rastro en la crónica, que es justo lo que comprueba el `it`.
 */
import { describe, expect, it } from 'vitest';
import {
  inicioDeSusTurnos,
  turnosEnLaMismaCasilla,
  vueltaDelVaiven,
} from '../src/core/ai/memoria.js';
import { pointKey } from '../src/core/map/geometria.js';
import { createRng } from '../src/core/rng.js';
import { heroesOf } from '../src/core/state/consultas.js';
import { alcanceDelHeroe, applyAdventureAction } from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import type { GameContext, GameState } from '../src/core/state/tipos.js';
import type { Hero, Point } from '../src/core/types.js';
import { costesDelAlcance } from './mapa-de-prueba.js';
import { hastaSuSiguienteTurno } from './partida-de-prueba.js';

/** Anda `hero` hasta `to` con puntos de sobra: lo que importa es dónde acaba. */
function andar(state: GameState, ctx: GameContext, hero: Hero, to: Point): void {
  hero.movePoints = 100_000;
  applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to }, ctx, hero.owner);
  expect(pointKey(hero.at), `la marcha de ${hero.id} no llegó`).toBe(pointKey(to));
}

/**
 * Hasta el día siguiente del jugador 0, sin que nadie haga nada: su turno de
 * mañana, que en serpiente (`ordenDelDia`) va detrás de dos del 1 o justo
 * detrás del suyo.
 */
function pasarElDia(state: GameState, ctx: GameContext): void {
  const dia = state.day;
  hastaSuSiguienteTurno(state, ctx, 0);
  expect(state.day).toBe(dia + 1);
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
