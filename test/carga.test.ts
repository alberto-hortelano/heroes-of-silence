/**
 * La carga para todos (#260, 14-10-2026): «todos los que pegan cuerpo a cuerpo».
 * +5 % por casilla de 3 a 5 (`data/carga.json`), la misma para todos desde el
 * 26-10-2026: montado de guerra y con lanza, lo que cambia es la horquilla del
 * golpe, la de la fuerza de la montura más la de la lanza (`GolpeConArma.carga`).
 * La recta es la de siempre (`cargaDesde`).
 */

import { describe, expect, it } from 'vitest';
import cargaJson from '../data/carga.json' with { type: 'json' };
import { batallaDeArena } from '../src/core/arena/montaje.js';
import {
  applyAction,
  casillasDeCarga,
  createBattle,
  soltarElGolpe,
  stackById,
  stackSpeed,
} from '../src/core/battle/battle.js';
import {
  CARGA,
  CARGA_MINIMA,
  cargaEfectiva,
  cargaMontada,
  dichoDeLaCarga,
  validarCarga,
} from '../src/core/battle/carga.js';
import { horquillaDeDanio } from '../src/core/battle/damage.js';
import type { BattleEvent, BattleState } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { cuerpoConSusCifras } from '../src/core/cuerpo.js';
import type { Pieza } from '../src/core/equipo/pieza.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/hero/equipo.js';
import { createRng } from '../src/core/rng.js';
import type { Equipo, Hex, UnitInfo } from '../src/core/types.js';
import { unidadDeCombate } from '../src/core/unidad.js';
import { bandoDe, forzarTurno, NORMAL, todoA } from './batalla-de-prueba.js';
import { JINETE } from './comun.js';
import { catalogoCon, delBorrador, MONTAJE, unidadDeArena } from './pelea-de-arena.js';

const A_PIE = 'templario-escudo';
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

describe('la carga montada pega con la fuerza de la montura (26-10-2026)', () => {
  // Todo de la prueba, sin el catálogo: un jinete de fuerza 2 y agilidad 4, una lanza
  // de fuerza 3, una espada de fuerza 1 y una montura de guerra de fuerza 9. Nada pesa,
  // así que la agilidad no cambia con lo puesto y la horquilla se lee en las cifras.
  const piezaDeEquipo = (p: Partial<Pieza> & Pick<Pieza, 'id' | 'hueco'>): Pieza => ({
    nombre: p.id,
    seConsigue: [],
    ataque: 0,
    defensa: 0,
    peso: 0,
    precio: 0,
    ...p,
  });
  const LANZA = piezaDeEquipo({
    id: 'lanza_de_prueba',
    hueco: 'arma',
    lanza: true,
    fuerza: 3,
    rueda: todoA(3),
  });
  const ESPADA = piezaDeEquipo({
    id: 'espada_de_prueba',
    hueco: 'arma',
    fuerza: 1,
    rueda: todoA(3),
  });
  const DE_GUERRA = piezaDeEquipo({
    id: 'montura_de_prueba',
    hueco: 'montura',
    guerra: true,
    fuerza: 9,
    agilidad: 6,
  });
  const EQ = catalogoCon(LANZA, ESPADA, DE_GUERRA);
  const JINETE_FUERZA = 2;
  const JINETE_AGILIDAD = 4;

  /** Un cuerpo de la prueba con `fuerza`, vestido con `equipo` del catálogo de la prueba. */
  const vestido = (fuerza: number, equipo: Equipo): UnitInfo =>
    EQ.conEquipo(
      cuerpoConSusCifras({
        name: 'Jinete de prueba',
        faction: null,
        attack: 4,
        fuerza,
        agilidad: JINETE_AGILIDAD,
        defensaPropia: 0,
        hp: 100,
      }),
      equipo,
    );
  const RIVAL = EQ.conEquipo(
    cuerpoConSusCifras({
      name: 'Rival de prueba',
      faction: null,
      attack: 2,
      fuerza: 3,
      agilidad: 2,
      defensaPropia: 0,
      hp: 5000,
    }),
    { arma: ESPADA.id },
  );

  /** `quien` en (0,4) y el rival en (`recta` + 1, 4), con el turno de `quien`. */
  const enRectaDe = (quien: UnitInfo, recta: number): { b: BattleState; desde: Hex } => {
    const b = createBattle(
      bandoDe([{ id: 'quien', unit: quien }]),
      bandoDe([{ id: 'rival', unit: RIVAL }]),
      createRng(1),
      COMBATE_COMPLETO,
    );
    colocar(b, 'attacker-0', recta);
    return { b, desde: { col: recta, row: 4 } };
  };

  /** La horquilla de la carga desde `recta` y el golpe que la cobra, con Normal contra Normal. */
  const cargando = (quien: UnitInfo, recta = CARGA_MINIMA) => {
    const { b, desde } = enRectaDe(quien, recta);
    const h = horquillaDeDanio(stackById(b, 'attacker-0'), stackById(b, 'defender-0'), {
      chargeHexes: recta,
    });
    applyAction(b, { type: 'attack', target: 'defender-0', from: desde, ...NORMAL }, createRng(2));
    return { h, golpe: golpeDe(b) };
  };

  it('montado de guerra con lanza, la carga tira con la fuerza de la montura más la de la lanza, por la agilidad del jinete', () => {
    const jinete = vestido(JINETE_FUERZA, { arma: LANZA.id, montura: DE_GUERRA.id });
    expect(cargaMontada(jinete)).toBe(true);
    const F = (DE_GUERRA.fuerza ?? 0) + (LANZA.fuerza ?? 0);
    expect(jinete.armas?.arma?.carga).toEqual([F, F * JINETE_AGILIDAD]);
    // Lo mismo que carga a pie quien tuviera de suyo la fuerza de la montura: la
    // misma horquilla, el mismo golpe; solo cambia que la carga se dice montada.
    const comoLaMontura = vestido(DE_GUERRA.fuerza ?? 0, { arma: LANZA.id });
    expect(comoLaMontura.damage).toEqual([F, F * JINETE_AGILIDAD]);
    const montado = cargando(jinete);
    const aPie = cargando(comoLaMontura);
    expect(montado.h.danio).toEqual(aPie.h.danio);
    expect(montado.golpe.damage).toBe(aPie.golpe.damage);
    const cobradas = cargaEfectiva(CARGA_MINIMA, CARGA);
    expect(montado.golpe.charge).toBe(cobradas);
    expect(montado.h.modificadores.map((m) => m.causa)).toContain(
      dichoDeLaCarga(cobradas, true, false),
    );
    expect(aPie.h.modificadores.map((m) => m.causa)).toContain(
      dichoDeLaCarga(cobradas, false, false),
    );
  });

  it('sin carga, el golpe del jinete montado no lleva la fuerza de la montura', () => {
    const montado = vestido(JINETE_FUERZA, { arma: LANZA.id, montura: DE_GUERRA.id });
    const F = JINETE_FUERZA + (LANZA.fuerza ?? 0);
    expect(montado.damage).toEqual([F, F * JINETE_AGILIDAD]);
    // Pegado de salida (sin recta): el mismo golpe que a pie.
    const golpe = (quien: UnitInfo) => {
      const { b } = enRectaDe(quien, 0);
      applyAction(b, { type: 'attack', target: 'defender-0', ...NORMAL }, createRng(2));
      return golpeDe(b);
    };
    const conMontura = golpe(montado);
    expect(conMontura.charge).toBeUndefined();
    expect(conMontura.damage).toBe(golpe(vestido(JINETE_FUERZA, { arma: LANZA.id })).damage);
  });

  it('montado sin lanza, o a pie con ella, la carga va con la horquilla de su arma', () => {
    for (const equipo of [
      { arma: ESPADA.id, montura: DE_GUERRA.id },
      { arma: LANZA.id },
    ] satisfies Equipo[]) {
      const quien = vestido(JINETE_FUERZA, equipo);
      expect(cargaMontada(quien), JSON.stringify(equipo)).toBe(false);
      expect(quien.armas?.arma?.carga, JSON.stringify(equipo)).toBeUndefined();
      // La horquilla de la carga es la de su golpe con el factor de la carga: la de un
      // cuerpo a pie con su misma arma y su misma fuerza.
      const igual = vestido(JINETE_FUERZA, { arma: equipo.arma });
      expect(cargando(quien).h.danio, JSON.stringify(equipo)).toEqual(cargando(igual).h.danio);
    }
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
