/**
 * Ayudantes de los tests de la magia (`magia-motor.test.ts`,
 * `magia-disparadores.test.ts`): un hechizo de prueba que vale, una batalla con un
 * héroe que lo sabe y cada uno en su casilla, y cerrar turnos hasta el de alguien.
 */
import { expect } from 'vitest';
import { activeStack, applyAction, createBattle } from '../src/core/battle/battle.js';
import { SIN_MURALLA } from '../src/core/battle/muralla.js';
import type { BattleStack, BattleState, Side } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { catalogoDeHechizos } from '../src/core/magia/catalogo.js';
import type { Hechizo } from '../src/core/magia/formato.js';
import { problemasDelHechizo } from '../src/core/magia/validar.js';
import { createRng, type Rng } from '../src/core/rng.js';
import type { Hex } from '../src/core/types.js';
import { bando, mando } from './batalla-de-prueba.js';

/** Un hechizo de prueba: lo que se le dé encima de uno libre a un enemigo que hiere 10. */
export function de(
  id: string,
  resto: { readonly [K in keyof Hechizo]?: Hechizo[K] | undefined },
): Hechizo {
  const todo: Record<string, unknown> = {
    id,
    nombre: id,
    descripcion: 'de prueba',
    mana: 1,
    gremio: null,
    entrega: { tipo: 'libre' },
    objetivo: 'enemigo',
    efectos: [{ tipo: 'danio', cantidad: 10, armadura: true }],
    ...resto,
  };
  // `undefined` es «sin el campo» (`objetivo` de un hechizo sobre sí).
  const h = Object.fromEntries(
    Object.entries(todo).filter(([, v]) => v !== undefined),
  ) as unknown as Hechizo;
  // Que el hechizo de prueba valga: si no, el test probaría algo que no se escribe.
  expect(problemasDelHechizo(h)).toEqual([]);
  return h;
}

/** Los de la izquierda (con el héroe) y los de la derecha. */
const IZQ = ['templario-escudo', 'templario-escudo'];
const DER = ['orko-dos-armas', 'orko-dos-armas'];

/**
 * Una batalla con el héroe de la izquierda (poder 3) que sabe `hechizos`, y cada uno
 * en su casilla: el héroe en (2,4), los suyos en (3,4) y (2,2), los rivales en
 * (6,4) y (7,4) (o donde diga `casillas`). Le toca a alguien de la izquierda.
 */
export function montar(
  hechizos: readonly Hechizo[],
  o: { readonly rng?: Rng; readonly casillas?: Readonly<Record<string, Hex>> } = {},
): { b: BattleState; rng: Rng } {
  const rng = o.rng ?? createRng(3);
  const b = createBattle(
    bando(
      IZQ.map((creature) => ({ creature, count: 1 })),
      { heroe: mando({ spells: hechizos.map((h) => h.id), spellPower: 3, mana: 99 }) },
    ),
    bando(DER.map((creature) => ({ creature, count: 1 }))),
    rng,
    COMBATE_COMPLETO,
    SIN_MURALLA,
    catalogoDeHechizos(hechizos),
  );
  const casillas: Record<string, Hex> = {
    'attacker-heroe': { col: 2, row: 4 },
    'attacker-0': { col: 3, row: 4 },
    'attacker-1': { col: 2, row: 2 },
    'defender-0': { col: 6, row: 4 },
    'defender-1': { col: 7, row: 4 },
    ...o.casillas,
  };
  for (const s of b.stacks) s.hex = casillas[s.id] ?? s.hex;
  turnoDe(b, 'attacker', rng);
  return { b, rng };
}

/** Cierra turnos hasta que le toca a uno de `side`. */
export function turnoDe(b: BattleState, side: Side, rng: Rng): BattleStack {
  for (let n = 0; n < 40; n++) {
    const s = activeStack(b);
    if (s === null) throw new Error('la batalla acabó');
    if (s.side === side) return s;
    applyAction(b, { type: 'end_turn' }, rng);
  }
  throw new Error(`a ${side} no le llega el turno`);
}

/** Cierra turnos hasta que le toca a `id`. */
export function turnoDeId(b: BattleState, id: string, rng: Rng): void {
  for (let n = 0; n < 60; n++) {
    if (activeStack(b)?.id === id) return;
    applyAction(b, { type: 'end_turn' }, rng);
  }
  throw new Error(`a ${id} no le llega el turno`);
}

/** Que el héroe del atacante pueda lanzar otra vez en esta ronda (los tests lanzan seguidos). */
export function otraVez(b: BattleState): void {
  const h = b.heroes.attacker;
  if (h === null) throw new Error('sin héroe');
  h.castThisRound = false;
}
