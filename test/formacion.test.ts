/**
 * La formación del héroe (02-11-2026, «la vista de tropa pasa a ser la de
 * despliegue»; `docs/agents/2026-11-02-fase-de-despliegue/`): la acción `formar`
 * guarda la casilla de cada uno en el individuo (`Troop.salida`) y en el héroe
 * (`Hero.salida`); la formación sobrevive a reclutar, licenciar, equipar y a la
 * batalla; quien no tiene casilla la recibe por la regla de hoy en un hueco
 * libre; y la batalla siguiente sale desde ella (`asentar`).
 */
import { describe, expect, it } from 'vitest';
import { hexEquals, hexKey } from '../src/core/battle/board.js';
import { zonaDeSalida } from '../src/core/battle/despliegue.js';
import type { Portador } from '../src/core/equipo/portador.js';
import { type Hero, heroUnit } from '../src/core/hero/hero.js';
import { troopUnit } from '../src/core/hero/troop.js';
import { turnBlocker } from '../src/core/state/consultas.js';
import {
  applyAdventureAction,
  baseOf,
  batallaDeLaFormacion,
  formacionDe,
  formarBlocker,
  salidaPendienteBlocker,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import type { AdventureAction, GameState } from '../src/core/state/tipos.js';
import type { Hex } from '../src/core/types.js';
import { ctx, TROPA, TROPA_BARATA } from './comun.js';
import { conSuEquipo, forzarBatalla } from './partida-de-prueba.js';

const SEMILLA = 11;

type Formar = Extract<AdventureAction, { type: 'formar' }>;

/** La partida con el héroe del jugador 0 en su base, con dos novatos y un veterano. */
function partida(): { state: GameState; hero: Hero } {
  const state = newGame({ seed: SEMILLA });
  const hero = state.heroes.find((h) => h.owner === 0)!;
  hero.army = [
    { creature: TROPA_BARATA },
    { creature: TROPA },
    conSuEquipo(TROPA_BARATA, { armadura: 'gambeson' }, 'el-veterano'),
  ];
  return { state, hero };
}

const formar = (hero: Hero, quien: Portador, at: Hex): Formar => ({
  type: 'formar',
  hero: hero.id,
  quien,
  at,
});

/** Nunca dos en la misma casilla ni nadie fuera de su zona. */
function formacionSana(state: GameState, hero: Hero): void {
  const f = formacionDe(state, hero);
  const todas = [f.heroe, ...f.tropa];
  expect(new Set(todas.map(hexKey)).size).toBe(todas.length);
  const enZona = (unit: Parameters<typeof zonaDeSalida>[0], h: Hex) =>
    zonaDeSalida(unit, 'attacker').some((z) => hexEquals(z, h));
  expect(enZona(heroUnit(hero), f.heroe)).toBe(true);
  hero.army.forEach((t, i) => {
    expect(enZona(troopUnit(t), f.tropa[i]!)).toBe(true);
  });
}

describe('la acción formar (C1)', () => {
  it('sin nada guardado, la formación es la regla de hoy', () => {
    const { state, hero } = partida();
    expect(formacionDe(state, hero)).toEqual({
      heroe: { col: 0, row: 4 },
      tropa: [
        { col: 0, row: 3 },
        { col: 0, row: 5 },
        { col: 0, row: 2 },
      ],
    });
    // Y es la batalla de la formación, con la tanda del atacante abierta y sin rival.
    const b = batallaDeLaFormacion(state, hero.id);
    expect(b.despliegue).toEqual({ tanda: 1, aMano: ['attacker'] });
    expect(b.stacks.every((s) => s.side === 'attacker')).toBe(true);
    expect(b.log).toEqual([]);
  });

  it('el héroe a (1,0) y un novato a donde estaba el héroe; otro a la casilla del héroe, intercambio', () => {
    const { state, hero } = partida();
    const [a, b, veterano] = hero.army;
    const log = state.log.length;
    const oro = state.players[0]!.oro;
    applyAdventureAction(state, formar(hero, { heroe: true }, { col: 1, row: 0 }), ctx(7), 0);
    // Congelada entera: cada uno lleva su casilla de hoy, y el héroe la nueva.
    expect(hero.salida).toEqual({ col: 1, row: 0 });
    expect(hero.army.map((t) => t.salida)).toEqual([
      { col: 0, row: 3 },
      { col: 0, row: 5 },
      { col: 0, row: 2 },
    ]);
    // Los mismos individuos, con lo suyo.
    expect(hero.army.map((t) => t.creature)).toEqual([
      a!.creature,
      b!.creature,
      veterano!.creature,
    ]);
    expect(hero.army[2]!.veterania).toEqual(veterano!.veterania);
    // Estado y no un hecho: ni crónica ni oro.
    expect(state.log).toHaveLength(log);
    expect(state.players[0]!.oro).toBe(oro);

    applyAdventureAction(state, formar(hero, { indice: 1 }, { col: 1, row: 0 }), ctx(7), 0);
    expect(formacionDe(state, hero)).toEqual({
      heroe: { col: 0, row: 5 },
      tropa: [
        { col: 0, row: 3 },
        { col: 1, row: 0 },
        { col: 0, row: 2 },
      ],
    });
    // A una casilla libre, sin intercambio: nadie más se mueve.
    applyAdventureAction(state, formar(hero, { indice: 0 }, { col: 2, row: 8 }), ctx(7), 0);
    expect(formacionDe(state, hero).tropa[0]).toEqual({ col: 2, row: 8 });
    expect(formacionDe(state, hero).heroe).toEqual({ col: 0, row: 5 });
    formacionSana(state, hero);
  });

  it('lo ilegal lanza con la frase de formarBlocker y no toca nada', () => {
    const { state, hero } = partida();
    const rival = state.heroes.find((h) => h.owner === 1)!;
    const goblin = troopUnit(hero.army[0]!).name;
    const casos: readonly [Formar, string][] = [
      [formar(rival, { heroe: true }, { col: 0, row: 0 }), `${rival.name} no es de tu bando`],
      [
        formar(hero, { indice: 9 }, { col: 0, row: 0 }),
        `${hero.name} no lleva a nadie en el puesto 9 de su tropa`,
      ],
      [
        formar(hero, { indice: 0 }, { col: 3, row: 4 }),
        `(3,4) queda fuera de la zona de salida de ${goblin}: las 3 columnas de su borde`,
      ],
      [formar(hero, { indice: 0 }, { col: -1, row: 4 }), '(-1,4) no es una casilla del tablero'],
      [formar(hero, { indice: 0 }, { col: 0.5, row: 4 }), '(0.5,4) no es una casilla del tablero'],
      [formar(hero, { heroe: true }, { col: 0, row: 4 }), `${hero.name} ya sale en (0,4)`],
    ];
    for (const [accion, motivo] of casos) {
      expect(formarBlocker(state, 0, accion)).toBe(motivo);
      expect(() => applyAdventureAction(state, accion, ctx(7), 0)).toThrow(
        `no se puede formar: ${motivo}`,
      );
    }
    expect(hero.salida).toBeUndefined();
    expect(hero.army.every((t) => t.salida === undefined)).toBe(true);
  });

  it('fuera de turno, con una batalla pendiente o con el héroe de salida por elegir, no', () => {
    const { state, hero } = partida();
    const turno = turnBlocker(state, 1);
    expect(turno).not.toBeNull();
    expect(() =>
      applyAdventureAction(state, formar(hero, { heroe: true }, { col: 1, row: 4 }), ctx(7), 1),
    ).toThrow(turno!);

    const conBatalla = partida();
    forzarBatalla(conBatalla.state, ctx(7), conBatalla.hero);
    expect(() =>
      applyAdventureAction(
        conBatalla.state,
        formar(conBatalla.hero, { heroe: true }, { col: 1, row: 4 }),
        ctx(7),
        0,
      ),
    ).toThrow('hay una batalla pendiente de resolver');

    const sinHeroe = newGame({ seed: SEMILLA, tipoDelHeroe: null });
    const delRival = sinHeroe.heroes.find((h) => h.owner === 1)!;
    const pendiente = salidaPendienteBlocker(sinHeroe, 0);
    expect(pendiente).not.toBeNull();
    expect(() =>
      applyAdventureAction(
        sinHeroe,
        formar(delRival, { heroe: true }, { col: 1, row: 4 }),
        ctx(7),
        0,
      ),
    ).toThrow(pendiente!);
  });
});

describe('la formación sobrevive a los cambios de la tropa (C2)', () => {
  /** La partida con la formación guardada: el héroe atrás a (2,4) y todos congelados. */
  function formada(): { state: GameState; hero: Hero } {
    const p = partida();
    applyAdventureAction(p.state, formar(p.hero, { heroe: true }, { col: 2, row: 4 }), ctx(7), 0);
    return p;
  }

  it('reclutar: los nuevos caen en huecos libres sin mover a nadie', () => {
    const { state, hero } = formada();
    const antes = formacionDe(state, hero);
    // El ejemplo de antes (2,4) libera el (0,4): ahí cae el primero que llegue.
    expect(antes.heroe).toEqual({ col: 2, row: 4 });
    const base = baseOf(state, 0)!;
    expect(hero.at).toEqual(base.at);
    const unidad = Object.keys(base.available)[0]!;
    base.available = { [unidad]: 2 };
    state.players[0]!.oro = 100_000;
    applyAdventureAction(
      state,
      { type: 'recruit', town: base.id, creature: unidad, count: 2 },
      ctx(7),
      0,
    );
    expect(hero.army).toHaveLength(5);
    const ahora = formacionDe(state, hero);
    expect(ahora.heroe).toEqual(antes.heroe);
    expect(ahora.tropa.slice(0, 3)).toEqual(antes.tropa);
    expect(ahora.tropa.slice(3)).toEqual([
      { col: 0, row: 4 },
      { col: 0, row: 6 },
    ]);
    formacionSana(state, hero);
  });

  it('licenciar: su casilla queda libre y nadie se corre', () => {
    const { state, hero } = formada();
    const antes = formacionDe(state, hero);
    // El de TROPA, el puesto 1, en (0,5).
    applyAdventureAction(
      state,
      { type: 'dismiss', hero: hero.id, creature: TROPA, count: 1 },
      ctx(7),
      0,
    );
    expect(hero.army.map((t) => t.creature)).toEqual([TROPA_BARATA, TROPA_BARATA]);
    const ahora = formacionDe(state, hero);
    expect(ahora.heroe).toEqual(antes.heroe);
    expect(ahora.tropa).toEqual([antes.tropa[0], antes.tropa[2]]);
    expect([ahora.heroe, ...ahora.tropa].some((h) => hexEquals(h, antes.tropa[1]!))).toBe(false);
    formacionSana(state, hero);
  });

  it('equipar conserva la casilla', () => {
    const { state, hero } = formada();
    const antes = formacionDe(state, hero);
    hero.mochila = ['gambeson'];
    applyAdventureAction(
      state,
      { type: 'equip', hero: hero.id, item: 'gambeson', puesto: 0 },
      ctx(7),
      0,
    );
    expect(hero.army[0]!.veterania?.equipo).toEqual({ armadura: 'gambeson' });
    expect(hero.army[0]!.salida).toEqual(antes.tropa[0]);
    expect(formacionDe(state, hero)).toEqual(antes);
  });
});
