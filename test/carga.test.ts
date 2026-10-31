/**
 * La carga para todos (#260, 14-10-2026): «todos los que pegan cuerpo a cuerpo».
 * +5 % por casilla de 3 a 5 (`data/carga.json`), la misma para todos desde el
 * 26-10-2026: montado de guerra y con lanza, lo que cambia es la horquilla del
 * golpe, la de la fuerza de la montura más la de la lanza (`GolpeConArma.carga`).
 * La recta es la de siempre (`cargaDesde`).
 */

import { describe, expect, it } from 'vitest';
import cargaJson from '../data/carga.json' with { type: 'json' };
import { marcadoDe } from '../src/client/html.js';
import { renderBattleLog } from '../src/client/views/panels.js';
import { batallaDeArena, type HeroeDeArena, heroePorDefecto } from '../src/core/arena.js';
import {
  applyAction,
  cargaDesde,
  casillasDeCarga,
  createBattle,
  previsionDe,
  soltarElGolpe,
  stackById,
  stackSpeed,
} from '../src/core/battle/battle.js';
import {
  CARGA,
  CARGA_MINIMA,
  cargaMontada,
  dichoDeLaCarga,
  dichoDeLasCifras,
  validarCarga,
} from '../src/core/battle/carga.js';
import { computeDamage, horquillaDeDanio } from '../src/core/battle/damage.js';
import type { BattleEvent, BattleState } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/hero/equipo.js';
import { createRng } from '../src/core/rng.js';
import type { Hex, UnitInfo } from '../src/core/types.js';
import { unidadDeCombate } from '../src/core/unidad.js';
import { delBorrador, forzarTurno, MONTAJE, NORMAL, unidadDeArena } from './helpers.js';

const A_PIE = 'templario-escudo';
const JINETE = 'templario-hermano-de-carga';
const ARQUERO = 'elfo-arquero';
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

/** El factor con que la previsión anota la carga, o `null` si no anota ninguna. */
function factorDeLaCarga(b: BattleState, desde: Hex): { causa: string; factor: number } | null {
  const p = previsionDe(b, { type: 'attack', target: 'defender-0', from: desde });
  if (p === null || p.kind !== 'golpe') throw new Error('no hay previsión de golpe');
  const m = p.modificadores.find((x) => x.causa.startsWith('carga de '));
  return m === undefined ? null : { causa: m.causa, factor: m.factor as number };
}

describe('las cifras de la carga (`data/carga.json`)', () => {
  it('+5 % por casilla hasta 5, para todos', () => {
    expect(CARGA).toEqual({ porcentaje: 5, tope: 5 });
  });

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

  it('la frase de una carga cobrada', () => {
    expect(dichoDeLaCarga(3, false)).toBe('carga de 3 casillas, +15 %');
    expect(dichoDeLaCarga(5, true)).toBe('carga de 5 casillas montada, +25 %');
    expect(dichoDeLasCifras(false)).toBe('+5 %/casilla (3 a 5)');
    expect(dichoDeLasCifras(true)).toBe('+5 %/casilla (3 a 5), montada');
  });
});

describe('la carga montada pega con la fuerza de la montura (26-10-2026)', () => {
  /**
   * El hermano de carga de verdad (fuerza 7, agilidad 4, Caballo de guerra de
   * fuerza 16 y Lanza de jinete de 4) contra un rival sin armadura con la defensa de su
   * ataque: ataque contra defensa no multiplica, y lo que se ve es la horquilla.
   */
  const contra = (equipo?: object) => {
    const jinete = unidadDeArena(JINETE, equipo === undefined ? {} : { equipo: equipo as never });
    const { attack } = unidadDeCombate(jinete, EQUIPO_DEL_JUEGO);
    const b = batallaDeArena(
      {
        izquierda: { unidades: [delBorrador(jinete)], heroe: null },
        derecha: {
          unidades: [
            delBorrador(unidadDeArena(RIVAL, { agilidad: attack, equipo: { arma: 'daga' } })),
          ],
          heroe: null,
        },
        ...MONTAJE,
      },
      createRng(1),
    );
    const a = stackById(b, 'attacker-0');
    const d = stackById(b, 'defender-0');
    expect(a.unit.attack).toBe(d.unit.defense);
    return { a, d };
  };

  it('con una recta de 5, tira en [20, 80] ×1,25, y el golpe cae en su previsión', () => {
    const { a, d } = contra();
    const h = horquillaDeDanio(a, d, { chargeHexes: 6 });
    // [16 + 4, (16 + 4) × 4] × 1,25.
    expect(h.danio).toEqual({ min: 25, max: 100 });
    expect(h.modificadores.map((m) => m.causa)).toContain('carga de 5 casillas montada');
    expect(h.conArma).toBe(
      'con Espada y Lanza de jinete, montado en Caballo de guerra (en la carga)',
    );
    for (let semilla = 1; semilla <= 40; semilla++) {
      const { damage, montada } = computeDamage(a, d, createRng(semilla), { chargeHexes: 6 });
      expect(montada).toBe(true);
      expect(damage).toBeGreaterThanOrEqual(25);
      expect(damage).toBeLessThanOrEqual(100);
    }
  });

  it('montado sin lanza, o a pie, la carga va con la horquilla de su arma', () => {
    const { segunda: _lanza, ...sinLanza } = unidadDeArena(JINETE).equipo;
    const { montura: _caballo, ...aPie } = unidadDeArena(JINETE).equipo;
    for (const equipo of [sinLanza, aPie]) {
      const { a, d } = contra(equipo);
      const [min, max] = a.unit.damage;
      const h = horquillaDeDanio(a, d, { chargeHexes: 6 });
      expect(h.danio).toEqual({ min: Math.round(min * 1.25), max: Math.round(max * 1.25) });
      expect(h.modificadores.map((m) => m.causa)).toContain('carga de 5 casillas');
    }
  });

  it('sin carga, el golpe del jinete montado no lleva la fuerza de la montura', () => {
    const { a, d } = contra();
    // (7 + 4) × [1, 4]: la fuerza del jinete y la de su mejor arma.
    expect(a.unit.damage).toEqual([11, 44]);
    expect(horquillaDeDanio(a, d, {}).danio).toEqual({ min: 11, max: 44 });
  });
});

describe('carga todo el que pega cuerpo a cuerpo, y lo mismo cobra el jinete', () => {
  // [recta, casillas cobradas, %, factor]
  const CASOS = [
    [3, 3, 15, 1.15],
    [4, 4, 20, 1.2],
    [6, 5, 25, 1.25],
  ] as const;

  for (const [recta, cobradas, porciento, factor] of CASOS) {
    it(`una recta de ${recta}: cobra ${cobradas} casillas (+${porciento} %), a pie y montado`, () => {
      for (const [id, esAPie] of [
        [A_PIE, true],
        [JINETE, false],
      ] as const) {
        const { b, desde } = enRecta(id, recta);
        const s = stackById(b, 'attacker-0');
        // Montado, las casillas son las del caballo: 5 con lo que carga desde el
        // 31-10-2026, y la recta de 6 no le cabe. La geometría es del test.
        if (!esAPie) (s as { unit: UnitInfo }).unit = { ...s.unit, speed: 'ultra_fast' };
        // La recta se mide entera; el tope lo pone la carga.
        expect(cargaDesde(b, s, desde, stackById(b, 'defender-0'))).toBe(recta);
        // Lo que se enseña: el enemigo, su casilla y lo que suma.
        expect(casillasDeCarga(b, s)).toEqual([
          { target: 'defender-0', at: desde, hexes: cobradas, porciento },
        ]);
        // La previsión lo dice con su factor.
        const prevista = factorDeLaCarga(b, desde);
        expect(prevista?.causa).toBe(`carga de ${cobradas} casillas${esAPie ? '' : ' montada'}`);
        expect(prevista?.factor).toBeCloseTo(factor, 12);
        // Y el golpe la cobra, con su arma de carga (el jinete, la lanza).
        applyAction(
          b,
          { type: 'attack', target: 'defender-0', from: desde, ...NORMAL },
          createRng(2),
        );
        const golpe = golpeDe(b);
        expect(golpe.charge).toBe(cobradas);
        // A pie o montado lo dice quien pegó (`cargaMontada`).
        expect(cargaMontada(stackById(b, golpe.stack).unit)).toBe(!esAPie);
        // La carrera, también marcada: se anima con el clip de cargar.
        expect(b.log.find((e) => e.kind === 'move')).toMatchObject({ charge: true });
      }
    });
  }

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

  it('el tirador que pega con la daga también carga', () => {
    const { b, desde } = enRecta(ARQUERO, 3);
    expect(casillasDeCarga(b, stackById(b, 'attacker-0'))).toContainEqual({
      target: 'defender-0',
      at: desde,
      hexes: 3,
      porciento: 15,
    });
    applyAction(b, { type: 'attack', target: 'defender-0', from: desde, ...NORMAL }, createRng(2));
    expect(golpeDe(b)).toMatchObject({ charge: 3 });
    expect(cargaMontada(stackById(b, 'attacker-0').unit)).toBe(false);
  });

  it('el héroe de la arena también carga a pie', () => {
    const heroe: HeroeDeArena = heroePorDefecto('izquierda');
    const b = batallaDeArena(
      {
        izquierda: { unidades: [], heroe },
        derecha: { unidades: [delBorrador(unidadDeArena(RIVAL))], heroe: null },
        ...MONTAJE,
      },
      createRng(1),
    );
    colocar(b, 'attacker-heroe', 3);
    expect(casillasDeCarga(b, stackById(b, 'attacker-heroe'))).toEqual([
      { target: 'defender-0', at: { col: 3, row: 4 }, hexes: 3, porciento: 15 },
    ]);
  });

  it('el parte dice la carga, a pie o montada, con lo que sumó', () => {
    const aPie = enRecta(A_PIE, 3);
    applyAction(
      aPie.b,
      { type: 'attack', target: 'defender-0', from: aPie.desde, ...NORMAL },
      createRng(2),
    );
    expect(marcadoDe(renderBattleLog(aPie.b, null))).toContain('(carga de 3 casillas, +15 %)');
    const jinete = enRecta(JINETE, 4);
    applyAction(
      jinete.b,
      { type: 'attack', target: 'defender-0', from: jinete.desde, ...NORMAL },
      createRng(2),
    );
    expect(marcadoDe(renderBattleLog(jinete.b, null))).toContain(
      '(carga de 4 casillas montada, +20 %)',
    );
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

describe('el juego carga como la arena (19-10-2026)', () => {
  it('la misma unidad y la misma recta por `createBattle`: a pie y el jinete montado', () => {
    for (const [id, aPie] of [
      [A_PIE, true],
      [JINETE, false],
    ] as const) {
      const b = createBattle(
        { army: [{ creature: id, count: 1 }], hero: null },
        { army: [{ creature: RIVAL, count: 1 }], hero: null },
        createRng(1),
        COMBATE_COMPLETO,
      );
      colocar(b, 'attacker-0', 3);
      applyAction(
        b,
        { type: 'attack', target: 'defender-0', from: { col: 3, row: 4 }, ...NORMAL },
        createRng(2),
      );
      expect(golpeDe(b).charge).toBe(3);
      expect(cargaMontada(stackById(b, 'attacker-0').unit)).toBe(!aPie);
    }
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
