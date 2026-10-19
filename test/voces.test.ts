/**
 * La gente de la base y lo que dice (`core/town/voces.ts`): quién hay, cuándo
 * caducan sus voces, el respaldo determinista sin agente y cómo entran las
 * voces que escribe el narrador, cada una sola y cada línea sola.
 */
import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import type { Town } from '../src/core/town/town.js';
import {
  alcaideDe,
  firmaDeVoces,
  LARGO_DE_LINEA,
  ponerVoces,
  vecinosDeLaBase,
  vocesBlocker,
  vocesCaducadas,
  vozDe,
} from '../src/core/town/voces.js';

function base(seed = 5): { state: GameState; town: Town } {
  const state = newGame({ seed });
  const town = state.towns.find((t) => t.owner === 0)!;
  return { state, town };
}

describe('la gente de la base', () => {
  it('un encargado por sitio construido y los vecinos de su facción', () => {
    const { town } = base();
    const ids = vecinosDeLaBase(town).map((v) => v.id);
    // Nace con el ayuntamiento y la morada de nivel 1.
    expect(ids.filter((id) => id.startsWith('encargado-'))).toEqual([
      'encargado-hall',
      'encargado-lvl1',
    ]);
    expect(ids.filter((id) => id.startsWith('vecino-')).length).toBeGreaterThan(0);
    // Un sitio nuevo trae a su encargado; una mejora no trae a nadie más.
    town.buildings.push('tavern');
    expect(vecinosDeLaBase(town).map((v) => v.id)).toContain('encargado-tavern');
    const antes = vecinosDeLaBase(town).length;
    town.buildings.push('town_hall');
    expect(vecinosDeLaBase(town)).toHaveLength(antes);
  });

  it('el alcaide y cada cuerpo son de su facción', () => {
    for (const f of ['templarios', 'no-muertos'] as const) {
      expect(alcaideDe(f).nombre.length).toBeGreaterThan(0);
    }
  });
});

describe('cuándo caducan las voces', () => {
  it('una semana nueva o un sitio nuevo las caducan; una mejora, no', () => {
    const { town } = base();
    expect(vocesCaducadas(town, 1)).toBe(true); // nace sin voces
    ponerVoces(town, 0, 1, []);
    expect(vocesCaducadas(town, 1)).toBe(false);
    expect(vocesCaducadas(town, 2)).toBe(true);
    town.buildings.push('town_hall'); // mejora del ayuntamiento: mismo sitio
    expect(vocesCaducadas(town, 1)).toBe(false);
    town.buildings.push('tavern'); // sitio nuevo: un encargado nuevo
    expect(vocesCaducadas(town, 1)).toBe(true);
    expect(firmaDeVoces(town, 1)).toContain('tavern');
  });
});

describe('lo que dice cada uno', () => {
  it('sin narrador, el respaldo es determinista y no toca el azar de la partida', () => {
    const { state, town } = base();
    const antes = JSON.stringify(state);
    const una = vecinosDeLaBase(town).map((v) => vozDe(town, v.id, 1, 1));
    const otra = vecinosDeLaBase(town).map((v) => vozDe(town, v.id, 1, 1));
    expect(una).toEqual(otra);
    expect(JSON.stringify(state)).toBe(antes);
    // Y cada línea es una de las suyas.
    for (const [i, v] of vecinosDeLaBase(town).entries()) expect(v.frases).toContain(una[i]);
    // Con los días cambia lo que dice alguien (entre 7 días, alguna vez).
    const id = vecinosDeLaBase(town)[0]!.id;
    const semana = new Set([1, 2, 3, 4, 5, 6, 7].map((d) => vozDe(town, id, 1, d)));
    expect(semana.size).toBeGreaterThan(1);
  });

  it('con narrador, dice su línea del día, en rueda', () => {
    const { town } = base();
    ponerVoces(town, 0, 1, [{ npc: 'encargado-hall', lines: ['Una.', 'Dos.'] }]);
    expect(vozDe(town, 'encargado-hall', 1, 4)).toBe('Una.');
    expect(vozDe(town, 'encargado-hall', 1, 5)).toBe('Dos.');
  });

  it('preguntar por alguien que no está lanza diciéndolo', () => {
    const { town } = base();
    expect(() => vozDe(town, 'encargado-fort', 1, 1)).toThrow(
      /no hay nadie que se llame "encargado-fort"/,
    );
  });
});

describe('las voces del narrador', () => {
  it('vocesBlocker: base ajena o persona que no está, con quiénes están', () => {
    const { state, town } = base();
    expect(vocesBlocker(town, 0, 'encargado-hall')).toBeNull();
    expect(vocesBlocker(town, 1, 'encargado-hall')).toMatch(/no es una base tuya/);
    expect(vocesBlocker(town, 0, 'encargado-fort')).toMatch(
      /no hay nadie que se llame "encargado-fort": están encargado-hall, encargado-lvl1/,
    );
    expect(state.towns.length).toBeGreaterThan(1);
  });

  it('una voz buena y una mala: entra una y se rechaza una', () => {
    const { town } = base();
    const r = ponerVoces(town, 0, 1, [
      { npc: 'encargado-hall', lines: ['Bienvenido.'] },
      { npc: 'encargado-fort', lines: ['Aquí no hay castillo.'] },
    ]);
    expect(r.aceptadas).toBe(1);
    expect(r.rechazos).toHaveLength(1);
    expect(r.rechazos[0]).toMatch(/^encargado-fort: /);
    expect(town.voces?.lineas).toEqual({ 'encargado-hall': ['Bienvenido.'] });
  });

  it('cada línea se juzga sola: un salto, un blanco o una de más se rechazan sin tirar las otras', () => {
    const { town } = base();
    const r = ponerVoces(town, 0, 1, [
      { npc: 'encargado-hall', lines: ['Buena.', 'con\nsalto', '   '] },
      { npc: 'encargado-lvl1', lines: ['x'.repeat(LARGO_DE_LINEA + 1)] },
      { npc: 'encargado-hall', lines: ['repetida'] },
    ]);
    expect(r.aceptadas).toBe(1);
    expect(r.rechazos).toEqual([
      expect.stringMatching(/^encargado-hall, línea 2: .*una sola línea/),
      expect.stringMatching(/^encargado-hall, línea 3: .*en blanco/),
      expect.stringMatching(/^encargado-lvl1, línea 1: .*pasa de 160/),
      expect.stringMatching(/^encargado-hall: ya tiene sus líneas/),
    ]);
    expect(town.voces?.lineas).toEqual({ 'encargado-hall': ['Buena.'] });
  });

  it('sustituye las de antes y apunta la firma aunque no entre nada', () => {
    const { town } = base();
    ponerVoces(town, 0, 1, [{ npc: 'encargado-hall', lines: ['Antes.'] }]);
    ponerVoces(town, 0, 1, []);
    expect(town.voces).toEqual({ firma: firmaDeVoces(town, 1), lineas: {} });
    // Y quien se quedó sin línea vuelve a sus frases.
    const v = vecinosDeLaBase(town).find((x) => x.id === 'encargado-hall')!;
    expect(v.frases).toContain(vozDe(town, 'encargado-hall', 1, 1));
  });
});
