/**
 * La niebla por índice (#146): `Casillas` sustituye al `Set<string>` de claves
 * `"x,y"` en `Player.fog` y en `visibleNow`. Es un cambio de representación y
 * no de reglas —el banco sale con el ancla igual—, así que lo que se ata aquí
 * es la forma: el cuadrado recortado al mapa, el fail-loud de lo que no es del
 * mapa y el viaje por JSON que el `Set` no aguantaba.
 */
import { describe, expect, it } from 'vitest';
import { playAiGame } from '../src/core/ai/turn.js';
import { Casillas } from '../src/core/map/casillas.js';
import { createRng } from '../src/core/rng.js';
import { HERO_SCOUT_RADIUS, visibleNow, visibleNowAt } from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';

const MAPA = { width: 10, height: 6 };

describe('Casillas: la niebla por índice (#146)', () => {
  it('el cuadrado se recorta al mapa: (2r + 1)² casillas en medio, (r + 1)² en la esquina', () => {
    // El radio es el del héroe a la escala del mapa (#229: 5 en el 42×42, 121 y 36).
    const r = HERO_SCOUT_RADIUS;
    const medio = Casillas.vacias({ width: 20, height: 20 });
    medio.marcarCuadrado({ x: 10, y: 10 }, r);
    expect(medio.size).toBe((2 * r + 1) * (2 * r + 1));
    const esquina = Casillas.vacias({ width: 20, height: 20 });
    esquina.marcarCuadrado({ x: 0, y: 0 }, r);
    expect(esquina.size).toBe((r + 1) * (r + 1));
    expect(esquina.has({ x: r, y: r })).toBe(true);
    expect(esquina.has({ x: r + 1, y: 0 })).toBe(false);
    // Marcar dos veces lo mismo no cuenta dos veces: la cuenta es la del lienzo.
    esquina.marcarCuadrado({ x: 1, y: 1 }, 1);
    expect(esquina.size).toBe((r + 1) * (r + 1));
  });

  it('lo de fuera del mapa no está, y escribirlo lanza diciéndolo', () => {
    const c = Casillas.vacias(MAPA);
    c.marcarCuadrado({ x: 0, y: 0 }, 50);
    expect(c.size).toBe(60);
    expect(c.has({ x: -1, y: 0 })).toBe(false);
    // (10,0) no es (0,1) aunque su índice plano coincida: la x se mira aparte.
    expect(c.has({ x: 10, y: 0 })).toBe(false);
    expect(c.has({ x: 0, y: 6 })).toBe(false);
    expect(() => c.add({ x: 10, y: 0 })).toThrow('(10,0) está fuera del mapa de 10×6');
    expect(() => Casillas.deIndices(MAPA, [60])).toThrow('la casilla 60 no es de un mapa de 10×6');
    expect(() => Casillas.deIndices(MAPA, [1.5])).toThrow('la casilla 1.5 no es de un mapa');
    expect(() => Casillas.vacias({ width: 0, height: 6 })).toThrow('un mapa de 0×6');
  });

  it('se recorre fila a fila y viaja por JSON como sus índices', () => {
    const c = Casillas.vacias(MAPA);
    c.add({ x: 3, y: 2 });
    c.add({ x: 9, y: 0 });
    c.add({ x: 0, y: 5 });
    expect([...c]).toEqual([
      { x: 9, y: 0 },
      { x: 3, y: 2 },
      { x: 0, y: 5 },
    ]);
    expect(c.indices()).toEqual([9, 23, 50]);
    // Un `Set` salía de `JSON.stringify` como `{}` sin decir nada.
    const vuelta = Casillas.deIndices(MAPA, JSON.parse(JSON.stringify(c)) as number[]);
    expect(vuelta.indices()).toEqual(c.indices());
    expect(vuelta.size).toBe(3);
    c.delete({ x: 3, y: 2 });
    c.delete({ x: 3, y: 2 });
    expect(c.size).toBe(2);
    expect(c.hasIndex(23)).toBe(false);
  });

  it('en una partida jugada, lo que se mira está explorado y es lo que dice `visibleNowAt`', async () => {
    // La 1: en la 3, con el río de lago de 20 casillas, alguien pierde antes del día 8.
    // Hasta el día 5 desde que no hay minas (21-10-2026): la 1 ya no llega
    // al 8 sin un eliminado, ni ninguna de 1-12.
    const state = newGame({ seed: 1, maxDays: 5 });
    await playAiGame(state, { rng: createRng(1) });
    for (const p of state.players) {
      const mirando = visibleNow(state, p.id);
      // La premisa: hay algo mirado y algo sin mirar, o la igualdad sería vacía.
      expect(mirando.size).toBeGreaterThan(0);
      expect(mirando.size).toBeLessThan(state.map.width * state.map.height);
      for (let y = 0; y < state.map.height; y++)
        for (let x = 0; x < state.map.width; x++) {
          const q = { x, y };
          expect(mirando.has(q)).toBe(visibleNowAt(state, p.id, q));
          if (mirando.has(q)) expect(p.fog.has(q)).toBe(true);
        }
      // Y la niebla del estado aguanta el viaje por JSON.
      const vuelta = Casillas.deIndices(state.map, JSON.parse(JSON.stringify(p.fog)) as number[]);
      expect(vuelta.indices()).toEqual(p.fog.indices());
    }
  });
});
