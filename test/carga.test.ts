/**
 * La carga para todos en la arena (#260, 14-10-2026): «todos los que pegan cuerpo
 * a cuerpo, y el jinete más». A pie, +5 % por casilla de 3 a 5; el jinete (el
 * rasgo `charge`), +10 % por casilla de 3 a 5 (`data/carga.json`). La recta es la
 * de siempre (`cargaDesde`) y el juego no carga a pie.
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
} from '../src/core/battle/battle.js';
import {
  CARGA,
  CARGA_MINIMA,
  cifrasDeCarga,
  dichoDeLaCarga,
  dichoDeLasCifras,
  validarCarga,
} from '../src/core/battle/carga.js';
import type { ModoDelGolpe } from '../src/core/battle/rueda.js';
import type { BattleEvent, BattleState } from '../src/core/battle/types.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/hero/equipo.js';
import { createRng } from '../src/core/rng.js';
import type { Hex } from '../src/core/types.js';
import { unidadDeCombate } from '../src/core/unidad.js';
import { delBorrador, forzarTurno, MONTAJE, unidadDeArena } from './helpers.js';

const A_PIE = 'templario-escudo';
const JINETE = 'templario-hermano-de-carga';
const ARQUERO = 'elfo-arquero';
const RIVAL = 'zombi';

/**
 * Una pelea de la arena con `id` en (0,4) y un zombi en (`recta` + 1, 4): desde
 * (`recta`, 4) la recta mide `recta` casillas y el zombi es la que sigue. Con 7
 * casillas de velocidad, que la de la hoja no es lo que se prueba.
 */
function enRecta(
  id: string,
  recta: number,
  o: { readonly golpe?: ModoDelGolpe; readonly cargaAPie?: boolean } = {},
): { readonly b: BattleState; readonly desde: Hex } {
  const b = batallaDeArena(
    {
      izquierda: { unidades: [delBorrador(unidadDeArena(id, { casillas: 7 }))], heroe: null },
      derecha: { unidades: [delBorrador(unidadDeArena(RIVAL))], heroe: null },
      ...MONTAJE,
      modos: {
        ...(o.golpe === undefined ? {} : { golpe: o.golpe }),
        ...(o.cargaAPie === undefined ? {} : { cargaAPie: o.cargaAPie }),
      },
    },
    createRng(1),
  );
  colocar(b, 'attacker-0', recta);
  return { b, desde: { col: recta, row: 4 } };
}

/** Pone a `quien` en (0,4) y al zombi en (`recta` + 1, 4), sin moral, y le da el turno. */
function colocar(b: BattleState, quien: string, recta: number): void {
  stackById(b, quien).hex = { col: 0, row: 4 };
  stackById(b, 'defender-0').hex = { col: recta + 1, row: 4 };
  // Sin moral: un turno de más o de menos no es lo que se mide.
  for (const s of b.stacks) s.morale = 0;
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
  it('a pie +5 % por casilla y el jinete +10 %, los dos hasta 5', () => {
    expect(CARGA.aPie).toEqual({ porcentaje: 5, tope: 5 });
    expect(CARGA.jinete).toEqual({ porcentaje: 10, tope: 5 });
    // El 0.1 del jinete, el mismo double que el escrito antes: el banco no se mueve.
    expect(CARGA.jinete.porcentaje / 100).toBe(0.1);
  });

  it('valida el fichero: enteros ≥ 1, el tope desde la recta mínima y sin campos ajenos', () => {
    const con = (cambio: object) => ({ ...cargaJson, ...cambio });
    expect(() => validarCarga(con({ aPie: { porcentaje: 5, tope: 2 } }))).toThrow(
      `data/carga.json: aPie: tope tiene que ser ${CARGA_MINIMA} o más, y es 2`,
    );
    expect(() => validarCarga(con({ jinete: { porcentaje: 0, tope: 5 } }))).toThrow(
      'data/carga.json: jinete: el porcentaje tiene que ser 1 o más, y es 0',
    );
    expect(() => validarCarga(con({ jinete: { porcentaje: 7.5, tope: 5 } }))).toThrow(
      'data/carga.json: jinete: el porcentaje tiene que ser un número entero, y es 7.5',
    );
    expect(() => validarCarga(con({ aPie: { porcentaje: 5, tope: 5, maximo: 1 } }))).toThrow(
      'data/carga.json: aPie: «maximo» no es un campo; valen porcentaje, tope',
    );
    expect(() => validarCarga(con({ caballo: {} }))).toThrow(
      'data/carga.json: «caballo» no es un campo',
    );
  });

  it('quién carga: el rasgo, siempre con la del jinete; sin él, a pie solo si la pelea lo juega', () => {
    const jinete = unidadDeCombate(unidadDeArena(JINETE), EQUIPO_DEL_JUEGO);
    const aPie = unidadDeCombate(unidadDeArena(A_PIE), EQUIPO_DEL_JUEGO);
    expect(cifrasDeCarga(jinete, false)).toBe(CARGA.jinete);
    expect(cifrasDeCarga(jinete, true)).toBe(CARGA.jinete);
    expect(cifrasDeCarga(aPie, true)).toBe(CARGA.aPie);
    expect(cifrasDeCarga(aPie, false)).toBeNull();
  });

  it('la frase de una carga cobrada', () => {
    expect(dichoDeLaCarga(3, CARGA.aPie)).toBe('carga de 3 casillas a pie, +15 %');
    expect(dichoDeLaCarga(5, CARGA.jinete)).toBe('carga de 5 casillas, +50 %');
    expect(dichoDeLasCifras(CARGA.aPie)).toBe('+5 %/casilla (3 a 5), a pie');
    expect(dichoDeLasCifras(CARGA.jinete)).toBe('+10 %/casilla (3 a 5)');
  });
});

describe('en la arena carga todo el que pega cuerpo a cuerpo, y el jinete cobra más', () => {
  // [recta, casillas cobradas, % a pie, factor a pie, % del jinete, factor del jinete]
  const CASOS = [
    [3, 3, 15, 1.15, 30, 1.3],
    [4, 4, 20, 1.2, 40, 1.4],
    [6, 5, 25, 1.25, 50, 1.5],
  ] as const;

  for (const [recta, cobradas, aPie, factorAPie, jinete, factorJinete] of CASOS) {
    it(`una recta de ${recta}: a pie cobra ${cobradas} casillas (+${aPie} %), el jinete +${jinete} %`, () => {
      for (const [id, porciento, factor, esAPie] of [
        [A_PIE, aPie, factorAPie, true],
        [JINETE, jinete, factorJinete, false],
      ] as const) {
        const { b, desde } = enRecta(id, recta);
        const s = stackById(b, 'attacker-0');
        // La recta se mide entera; el tope lo pone la carga.
        expect(cargaDesde(b, s, desde, stackById(b, 'defender-0'))).toBe(recta);
        // Lo que se enseña: el enemigo, su casilla y lo que suma.
        expect(casillasDeCarga(b, s)).toEqual([
          { target: 'defender-0', at: desde, hexes: cobradas, porciento },
        ]);
        // La previsión lo dice con su factor.
        const prevista = factorDeLaCarga(b, desde);
        expect(prevista?.causa).toBe(`carga de ${cobradas} casillas${esAPie ? ' a pie' : ''}`);
        expect(prevista?.factor).toBeCloseTo(factor, 12);
        // Y el golpe la cobra, con su arma de carga (el jinete, la lanza).
        applyAction(b, { type: 'attack', target: 'defender-0', from: desde }, createRng(2));
        const golpe = golpeDe(b);
        expect(golpe.charge).toBe(cobradas);
        expect(golpe.cargaAPie).toBe(esAPie ? true : undefined);
        // La carrera, también marcada: se anima con el clip de cargar.
        expect(b.log.find((e) => e.kind === 'move')).toMatchObject({ charge: true });
      }
    });
  }

  it('con la misma recta, el jinete pega más que el de a pie con las mismas cifras de golpe', () => {
    // El mismo cuerpo y la misma lanza: solo cambia el rasgo.
    const conLanza = { casillas: 7, equipo: { arma: 'espada', lanza: 'lanza_de_jinete' } } as const;
    const danio = (traits: readonly 'charge'[]): number => {
      const b = batallaDeArena(
        {
          izquierda: {
            unidades: [delBorrador(unidadDeArena(A_PIE, { ...conLanza, traits: [...traits] }))],
            heroe: null,
          },
          derecha: { unidades: [delBorrador(unidadDeArena(RIVAL))], heroe: null },
          ...MONTAJE,
        },
        createRng(1),
      );
      colocar(b, 'attacker-0', 4);
      applyAction(
        b,
        { type: 'attack', target: 'defender-0', from: { col: 4, row: 4 } },
        createRng(7),
      );
      return golpeDe(b).damage;
    };
    expect(danio(['charge'])).toBeGreaterThan(danio([]));
  });

  it('sin recta no hay carga: pegado de salida, o a 2 casillas', () => {
    const { b } = enRecta(A_PIE, 2);
    expect(casillasDeCarga(b, stackById(b, 'attacker-0'))).toEqual([]);
    applyAction(
      b,
      { type: 'attack', target: 'defender-0', from: { col: 2, row: 4 } },
      createRng(2),
    );
    expect(golpeDe(b).charge).toBeUndefined();
    expect(golpeDe(b).cargaAPie).toBeUndefined();
  });

  it('el tirador que pega con la daga también carga', () => {
    const { b, desde } = enRecta(ARQUERO, 3);
    expect(casillasDeCarga(b, stackById(b, 'attacker-0'))).toContainEqual({
      target: 'defender-0',
      at: desde,
      hexes: 3,
      porciento: 15,
    });
    applyAction(b, { type: 'attack', target: 'defender-0', from: desde }, createRng(2));
    expect(golpeDe(b)).toMatchObject({ charge: 3, cargaAPie: true });
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

  it('el parte dice la carga, a pie o a caballo, con lo que sumó', () => {
    const aPie = enRecta(A_PIE, 3);
    applyAction(aPie.b, { type: 'attack', target: 'defender-0', from: aPie.desde }, createRng(2));
    expect(marcadoDe(renderBattleLog(aPie.b, null))).toContain(
      '(carga de 3 casillas a pie, +15 %)',
    );
    const jinete = enRecta(JINETE, 4);
    applyAction(
      jinete.b,
      { type: 'attack', target: 'defender-0', from: jinete.desde },
      createRng(2),
    );
    expect(marcadoDe(renderBattleLog(jinete.b, null))).toContain('(carga de 4 casillas, +40 %)');
  });
});

describe('la rueda del golpe con una carga a pie', () => {
  it('anda, se planta con la carga, elige y la cobra', () => {
    const { b, desde } = enRecta(A_PIE, 4, { golpe: 'rueda' });
    applyAction(b, { type: 'attack', target: 'defender-0', from: desde }, createRng(2));
    expect(b.golpeEnCurso).toMatchObject({
      stack: 'attacker-0',
      target: 'defender-0',
      carga: 4,
      carrera: null,
    });
    const largo = b.log.length;
    applyAction(
      b,
      { type: 'attack', target: 'defender-0', golpe: 'normal', respuesta: 'normal' },
      createRng(3),
    );
    expect(golpeDe(b, largo)).toMatchObject({ charge: 4, cargaAPie: true });
  });

  it('con Escape se pierde: el golpe desde el sitio no carga', () => {
    const { b, desde } = enRecta(A_PIE, 4, { golpe: 'rueda' });
    applyAction(b, { type: 'attack', target: 'defender-0', from: desde }, createRng(2));
    soltarElGolpe(b, createRng(3));
    expect(b.golpeEnCurso).toBeNull();
    expect(stackById(b, 'attacker-0').hex).toEqual(desde);
    const largo = b.log.length;
    // Plantarse otra vez, ya pegado, y golpear: sin recta, sin carga.
    applyAction(b, { type: 'attack', target: 'defender-0' }, createRng(4));
    expect(b.golpeEnCurso?.carga).toBe(0);
    applyAction(
      b,
      { type: 'attack', target: 'defender-0', golpe: 'normal', respuesta: 'normal' },
      createRng(5),
    );
    const golpe = golpeDe(b, largo);
    expect(golpe.charge).toBeUndefined();
    expect(golpe.cargaAPie).toBeUndefined();
  });
});

describe('el juego no carga a pie', () => {
  it('la misma unidad y la misma recta por `createBattle` no cargan; el jinete, sí', () => {
    for (const [id, cobra] of [
      [A_PIE, 0],
      [JINETE, 4],
    ] as const) {
      // La arena sin carga a pie es el juego (la prueba C4 de `arena.test.ts`).
      const { b, desde } = enRecta(id, 4, { cargaAPie: false });
      expect(b.arena.cargaAPie).toBe(false);
      expect(casillasDeCarga(b, stackById(b, 'attacker-0')).length).toBe(cobra > 0 ? 1 : 0);
      applyAction(b, { type: 'attack', target: 'defender-0', from: desde }, createRng(2));
      expect(golpeDe(b).charge ?? 0).toBe(cobra);
      expect(golpeDe(b).cargaAPie).toBeUndefined();
    }
  });

  it('`createBattle` monta siempre sin carga a pie', () => {
    const b = createBattle(
      { army: [{ creature: 'templario-escudo', count: 1 }], hero: null },
      { army: [{ creature: 'templario-escudo', count: 1 }], hero: null },
      createRng(1),
    );
    expect(b.arena.cargaAPie).toBe(false);
  });
});
