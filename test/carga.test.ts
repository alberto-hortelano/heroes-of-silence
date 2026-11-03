/**
 * La carga para todos (#260, 14-10-2026): «todos los que pegan cuerpo a cuerpo».
 * +5 % por casilla de 3 a 5 (`data/carga.json`), la misma para todos desde el
 * 26-10-2026: montado de guerra y con lanza, lo que cambia es la horquilla del
 * golpe, la de la fuerza de la montura más la de la lanza (`GolpeConArma.carga`).
 * La recta es la de siempre (`cargaDesde`).
 */

import { describe, expect, it } from 'vitest';
import cargaJson from '../data/carga.json' with { type: 'json' };
import { batallaDeArena } from '../src/core/arena.js';
import {
  applyAction,
  casillasDeCarga,
  soltarElGolpe,
  stackById,
  stackSpeed,
} from '../src/core/battle/battle.js';
import { CARGA_MINIMA, cargaMontada, validarCarga } from '../src/core/battle/carga.js';
import type { BattleEvent, BattleState } from '../src/core/battle/types.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/hero/equipo.js';
import { createRng } from '../src/core/rng.js';
import type { Hex } from '../src/core/types.js';
import { unidadDeCombate } from '../src/core/unidad.js';
import { delBorrador, forzarTurno, MONTAJE, NORMAL, unidadDeArena } from './helpers.js';

const A_PIE = 'templario-escudo';
const JINETE = 'templario-hermano-de-carga';
const RIVAL = 'zombi';

/**
 * Una pelea de la arena con `id` en (0,4) y un zombi en (`recta` + 1, 4): desde
 * (`recta`, 4) la recta mide `recta` casillas y el zombi es la que sigue. Con
 * agilidad 7 (lo que le deje el peso, 6 o 7 casillas), que la de la hoja no es lo
 * que se prueba.
 */
function enRecta(
  id: string,
  recta: number,
  agilidad = 7,
): { readonly b: BattleState; readonly desde: Hex } {
  const b = batallaDeArena(
    {
      izquierda: { unidades: [delBorrador(unidadDeArena(id, { agilidad }))], heroe: null },
      derecha: { unidades: [delBorrador(unidadDeArena(RIVAL))], heroe: null },
      ...MONTAJE,
    },
    createRng(1),
  );
  colocar(b, 'attacker-0', recta);
  return { b, desde: { col: recta, row: 4 } };
}

/** Pone a `quien` en (0,4) y al zombi en (`recta` + 1, 4), y le da el turno. */
function colocar(b: BattleState, quien: string, recta: number): void {
  stackById(b, quien).hex = { col: 0, row: 4 };
  stackById(b, 'defender-0').hex = { col: recta + 1, row: 4 };
  forzarTurno(b, quien);
}

type Ataque = Extract<BattleEvent, { kind: 'attack' }>;
/** El golpe de quien pega (no el contraataque) que hay en el registro desde `desde`. */
function golpeDe(b: BattleState, desde = 0): Ataque {
  const golpe = b.log.slice(desde).find((e): e is Ataque => e.kind === 'attack' && !e.retaliation);
  if (golpe === undefined) throw new Error('no hubo golpe');
  return golpe;
}

describe('las cifras de la carga (`data/carga.json`)', () => {
  it('valida el fichero: enteros ≥ 1, el tope desde la recta mínima y sin campos ajenos', () => {
    const con = (cambio: object) => ({ ...cargaJson, ...cambio });
    expect(() => validarCarga(con({ tope: 2 }))).toThrow(
      `data/carga.json: tope tiene que ser ${CARGA_MINIMA} o más, y es 2`,
    );
    expect(() => validarCarga(con({ porcentaje: 0 }))).toThrow(
      'data/carga.json: el porcentaje tiene que ser 1 o más, y es 0',
    );
    expect(() => validarCarga(con({ porcentaje: 7.5 }))).toThrow(
      'data/carga.json: el porcentaje tiene que ser un número entero, y es 7.5',
    );
    // La del jinete se fue (26-10-2026): quien la escriba se entera.
    expect(() => validarCarga(con({ jinete: { porcentaje: 10, tope: 5 } }))).toThrow(
      'data/carga.json: «jinete» no es un campo',
    );
  });

  it('carga montada solo con una montura de guerra y una lanza puestas', () => {
    const conEquipo = (id: string, equipo?: object) =>
      unidadDeCombate(
        unidadDeArena(id, equipo === undefined ? {} : { equipo: equipo as never }),
        EQUIPO_DEL_JUEGO,
      );
    expect(cargaMontada(conEquipo(JINETE))).toBe(true);
    expect(cargaMontada(conEquipo(A_PIE))).toBe(false);
    // Sin lanza, o con un caballo de silla, o a pie: carga como todos.
    const { segunda: _lanza, ...sinLanza } = unidadDeArena(JINETE).equipo;
    expect(cargaMontada(conEquipo(JINETE, sinLanza))).toBe(false);
    const { montura: _caballo, ...aPie } = unidadDeArena(JINETE).equipo;
    expect(cargaMontada(conEquipo(JINETE, aPie))).toBe(false);
    expect(cargaMontada(conEquipo(JINETE, { ...aPie, montura: 'caballo_de_silla' }))).toBe(false);
  });
});

describe('carga todo el que pega cuerpo a cuerpo, y lo mismo cobra el jinete', () => {
  it('sin recta no hay carga: pegado de salida, o a 2 casillas', () => {
    const { b } = enRecta(A_PIE, 2);
    expect(casillasDeCarga(b, stackById(b, 'attacker-0'))).toEqual([]);
    applyAction(
      b,
      { type: 'attack', target: 'defender-0', from: { col: 2, row: 4 }, ...NORMAL },
      createRng(2),
    );
    expect(golpeDe(b).charge).toBeUndefined();
  });
});

describe('la rueda del golpe con una carga a pie', () => {
  it('se planta en su salida con la carga por correr, elige, corre y la cobra', () => {
    const { b, desde } = enRecta(A_PIE, 4);
    const salida = { ...stackById(b, 'attacker-0').hex };
    applyAction(b, { type: 'attack', target: 'defender-0', from: desde }, createRng(2));
    expect(b.golpeEnCurso).toEqual({
      stack: 'attacker-0',
      target: 'defender-0',
      carga: { recta: 4, carrera: expect.objectContaining({ at: desde, steps: 4 }) },
    });
    // La carga se elige antes de correr (31-10-2026).
    expect(stackById(b, 'attacker-0').hex).toEqual(salida);
    const largo = b.log.length;
    applyAction(
      b,
      { type: 'attack', target: 'defender-0', golpe: 'normal', respuesta: 'normal' },
      createRng(3),
    );
    expect(b.log.slice(largo, largo + 2).map((e) => e.kind)).toEqual(['cruce', 'move']);
    expect(stackById(b, 'attacker-0').hex).toEqual(desde);
    expect(golpeDe(b, largo)).toMatchObject({ charge: 4 });
    expect(cargaMontada(stackById(b, 'attacker-0').unit)).toBe(false);
  });

  it('con Escape no corrió: sigue en su salida y vuelve a cargar', () => {
    const { b, desde } = enRecta(A_PIE, 4);
    const salida = { ...stackById(b, 'attacker-0').hex };
    const gastado = b.turno?.gastado;
    applyAction(b, { type: 'attack', target: 'defender-0', from: desde }, createRng(2));
    soltarElGolpe(b, createRng(3));
    expect(b.golpeEnCurso).toBeNull();
    expect(stackById(b, 'attacker-0').hex).toEqual(salida);
    expect(b.turno?.gastado).toBe(gastado);
    const largo = b.log.length;
    // Plantarse otra vez desde la misma recta: la misma carga.
    applyAction(b, { type: 'attack', target: 'defender-0', from: desde }, createRng(4));
    expect(b.golpeEnCurso?.carga?.recta).toBe(4);
    applyAction(
      b,
      { type: 'attack', target: 'defender-0', golpe: 'normal', respuesta: 'normal' },
      createRng(5),
    );
    expect(golpeDe(b, largo)).toMatchObject({ charge: 4 });
  });
});

describe('correr o caminar (25-10-2026): solo se ve, por el `move`', () => {
  // Requisito 2: un tramo de más de la mitad del movimiento máximo va corriendo
  // (`corre`); de la mitad o menos, caminando. La frontera es la mitad justa.
  // Con un máximo par, para que la mitad justa sea un tramo que se pueda andar: con
  // el de la agilidad 6 o el de la 7 (lo que le deje el peso), el que salga par.
  const conMaximoPar = (): BattleState => {
    for (const agilidad of [6, 7]) {
      // El zombi lejos (columna 11): nadie en contacto, el camino es la fila.
      const { b } = enRecta(A_PIE, 10, agilidad);
      if (stackSpeed(stackById(b, 'attacker-0')) % 2 === 0) return b;
    }
    throw new Error('ni con la agilidad 6 ni con la 7 sale un máximo par');
  };
  const tramo = (casillas: (maximo: number) => number): Extract<BattleEvent, { kind: 'move' }> => {
    const b = conMaximoPar();
    const maximo = stackSpeed(stackById(b, 'attacker-0'));
    applyAction(b, { type: 'move', to: { col: casillas(maximo), row: 4 } }, createRng(1));
    const mov = b.log.find((e) => e.kind === 'move');
    if (mov?.kind !== 'move') throw new Error('no anduvo');
    expect(mov.path).toHaveLength(casillas(maximo));
    return mov;
  };

  it('la mitad o menos camina; una casilla más, corre; y la carrera de una carga es carga', () => {
    expect(tramo((m) => m / 2).corre).toBeUndefined();
    expect(tramo((m) => m / 2 + 1).corre).toBe(true);
    // La carga ya corre por sí: su `move` lleva `charge` y no `corre`.
    const { b, desde } = enRecta(A_PIE, 4);
    applyAction(b, { type: 'attack', target: 'defender-0', from: desde, ...NORMAL }, createRng(1));
    const carrera = b.log.find((e) => e.kind === 'move');
    expect(carrera).toMatchObject({ charge: true });
    expect(carrera?.kind === 'move' && carrera.corre).toBeFalsy();
  });
});
