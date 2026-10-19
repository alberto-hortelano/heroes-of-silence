/**
 * El arranque de una partida (19-10-2026, «arranque: menú, facción, tema y héroe
 * en la base»): la pareja de facciones con la del jugador elegida, la facción de
 * la URL y el héroe que nace dentro de su base.
 */
import { describe, expect, it } from 'vitest';
import { leerRasgosDeFaccion, rasgoDeFaccion } from '../src/core/data.js';
import { createRng } from '../src/core/rng.js';
import { applyAdventureAction, baseOf, heroesOf } from '../src/core/state/game.js';
import { faccionesDeLaSemilla, newGame, nombreDeSalida } from '../src/core/state/setup.js';
import { FACTION_IDS, NOMBRE_DE_FACCION, parseFaccion } from '../src/core/types.js';
import { pegadoA } from './helpers.js';

describe('las facciones de la partida', () => {
  it('con la del jugador elegida, el rival es otra, fija por semilla', () => {
    for (let s = 1; s <= 100; s++) {
      for (const f of FACTION_IDS) {
        const [f0, f1] = faccionesDeLaSemilla(s, f);
        expect(f0).toBe(f);
        expect(f1, `semilla ${s}, ${f}`).not.toBe(f);
        expect(FACTION_IDS).toContain(f1);
        expect(faccionesDeLaSemilla(s, f)).toEqual([f0, f1]);
      }
    }
  });

  it('pedir la que la semilla habría sacado es la misma partida que no pedir nada', () => {
    for (let s = 1; s <= 100; s++) {
      const sola = faccionesDeLaSemilla(s);
      expect(faccionesDeLaSemilla(s, sola[0])).toEqual(sola);
    }
    // Y de punta a punta: `?seed=N` ≡ `?seed=N&faccion=<la suya>`.
    const sin = newGame({ seed: 7 });
    const con = newGame({ seed: 7, factions: faccionesDeLaSemilla(7, sin.players[0]!.faction) });
    expect(JSON.stringify(con)).toBe(JSON.stringify(sin));
  });

  it('el rival no siempre es el mismo: la elección no fija la pareja', () => {
    const rivales = new Set(
      Array.from({ length: 40 }, (_, i) => faccionesDeLaSemilla(i + 1, 'elfos')[1]),
    );
    expect(rivales.size).toBe(FACTION_IDS.length - 1);
  });
});

describe('la facción de la URL', () => {
  it('vacía o ausente es «ninguna»; una que existe, ella', () => {
    expect(parseFaccion(null)).toBeNull();
    expect(parseFaccion(undefined)).toBeNull();
    expect(parseFaccion('')).toBeNull();
    expect(parseFaccion('  ')).toBeNull();
    for (const f of FACTION_IDS) expect(parseFaccion(f)).toBe(f);
  });

  it('una que no existe se rechaza nombrando las cinco', () => {
    let motivo = '';
    try {
      parseFaccion('xyz');
    } catch (e) {
      motivo = (e as Error).message;
    }
    expect(motivo).toMatch(/"xyz" no es una facción/);
    for (const f of FACTION_IDS) expect(motivo).toContain(`${f} (${NOMBRE_DE_FACCION[f]})`);
    // Ni el nombre en pantalla ni otra caja: el id.
    expect(() => parseFaccion('Elfos')).toThrow(/no es una facción/);
  });
});

describe('el rasgo de cada facción', () => {
  it('las cinco tienen el suyo, de una línea', () => {
    for (const f of FACTION_IDS) {
      expect(rasgoDeFaccion(f).length, f).toBeGreaterThan(0);
      expect(rasgoDeFaccion(f)).not.toMatch(/\n/);
    }
  });

  it('falta una, sobra una o lleva un salto: lanza nombrando el fichero', () => {
    const bien = Object.fromEntries(FACTION_IDS.map((f) => [f, rasgoDeFaccion(f)]));
    const { elfos: _, ...sinElfos } = bien;
    expect(() => leerRasgosDeFaccion({ rasgos: sinElfos })).toThrow(
      /data\/facciones\.json: elfos no tiene rasgo/,
    );
    expect(() => leerRasgosDeFaccion({ rasgos: { ...bien, caballeros: 'x' } })).toThrow(
      /"caballeros" no es una facción del juego/,
    );
    expect(() => leerRasgosDeFaccion({ rasgos: { ...bien, orkos: 'uno\ndos' } })).toThrow(
      /el rasgo de orkos lleva un salto de línea/,
    );
  });
});

describe('el héroe nace dentro de su base', () => {
  it('en 1-40, cada héroe de salida en la casilla de su base, con el nombre de su facción', () => {
    for (let s = 1; s <= 40; s++) {
      const state = newGame({ seed: s });
      expect(state.heroes, `semilla ${s}`).toHaveLength(2);
      for (const [i, p] of state.players.entries()) {
        const [heroe] = heroesOf(state, p.id);
        expect(heroe?.at, `semilla ${s}, jugador ${p.id}`).toEqual(baseOf(state, p.id)!.at);
        expect(heroe?.faction).toBe(p.faction);
        expect(heroe?.name).toBe(nombreDeSalida(p.faction, i));
      }
    }
  });

  it('con la facción elegida, el héroe del jugador 0 es de ella', () => {
    for (const f of FACTION_IDS) {
      const state = newGame({ seed: 3, factions: faccionesDeLaSemilla(3, f) });
      expect(state.players[0]!.faction).toBe(f);
      expect(heroesOf(state, 0)[0]!.faction).toBe(f);
      expect(baseOf(state, 0)!.faction).toBe(f);
    }
  });

  it('y sale de ella con su primera marcha, como de cualquier casilla', () => {
    for (let s = 1; s <= 10; s++) {
      const state = newGame({ seed: s });
      const heroe = heroesOf(state, 0)[0]!;
      const base = baseOf(state, 0)!;
      const fuera = pegadoA(state, base.at);
      applyAdventureAction(
        state,
        { type: 'move_hero', hero: heroe.id, to: fuera },
        { rng: createRng(s) },
        0,
      );
      expect(heroe.at, `semilla ${s}`).toEqual(fuera);
      // Y salir no recoge la guarnición: nace sin ella y la base se queda la suya.
      expect(base.garrison.length).toBeGreaterThan(0);
    }
  });
});
