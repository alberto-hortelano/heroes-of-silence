/**
 * La rueda del golpe (`battle/rueda.ts`, solo la arena; docs/agents/2026-10-13-rueda-del-golpe/):
 * el cruce, la tirada fija de cada punto, los efectos de cada tipo con su
 * caducidad «hasta su próximo turno», la IA a ciegas, la sesión de la arena con
 * sus tres maneras (Yo contra IA, IA contra Yo, Yo contra Yo) y el parte.
 *
 * Las cifras se escriben a mano desde el catálogo (piquero: A 5, D 9, daño 30-40,
 * 150 PV) y desde `data/rueda.json` (Fuerte ×1,25, Rápido 2 × ×0,6): un test que
 * calculara el esperado con las mismas funciones del motor solo probaría que el
 * motor es el que es.
 */
import { describe, expect, it } from 'vitest';
import ruedaJson from '../data/rueda.json' with { type: 'json' };
import { BattleAnimator, DURACION } from '../src/client/anim.js';
import { renderGolpe, renderPanelDeBatalla, rotuloDelTurno } from '../src/client/arena/paneles.js';
import { renderDesenlace, renderEleccion, tramosDelDesenlace } from '../src/client/arena/rueda.js';
import { marcadoDe } from '../src/client/html.js';
import { SesionDeArena } from '../src/client/session.js';
import { renderBattleLog } from '../src/client/views/panels.js';
import { completarCruce, elegirEnLaRueda } from '../src/core/ai/rueda.js';
import { autoResolve } from '../src/core/ai/tactics.js';
import { type FuenteDeArena, type UnidadDeArena, unaVezEnLaURL } from '../src/core/arena.js';
import {
  activeStack,
  applyAction,
  type BattleSide,
  crearBatallaConReglas,
  createBattle,
  legalActions,
  pasosQueQuedan,
  previsionDe,
  previsionDeLaRueda,
  soltarElGolpe,
  stackById,
} from '../src/core/battle/battle.js';
import { hexDistance } from '../src/core/battle/board.js';
import { effectiveAttack, effectiveDefense, stackHp } from '../src/core/battle/damage.js';
import { SIN_MURALLA } from '../src/core/battle/muralla.js';
import {
  REGLAS_DEL_JUEGO,
  type ReglasDeBatalla,
  reglasDeLaURL,
} from '../src/core/battle/reglas.js';
import {
  ANILLO,
  CIFRAS_DE_LA_RUEDA,
  contraataqueDelCruce,
  efectoDeGolpe,
  golpesDe,
  modoDelGolpeDeLaURL,
  puntoDelContraataque,
  puntoDelCruce,
  TIPOS_DE_GOLPE,
  type TipoDeGolpe,
  tiradaDelPunto,
  validarRueda,
} from '../src/core/battle/rueda.js';
import type { BattleAction, BattleEvent, BattleState } from '../src/core/battle/types.js';
import { creature } from '../src/core/data.js';
import { createRng, type Rng, sortearPorPesos } from '../src/core/rng.js';
import type { Stack } from '../src/core/types.js';
import { bando } from './batalla-de-prueba.js';
import { delBorrador, unidadDeArena } from './helpers.js';

/** Una batalla con la rueda, el atacante en (5,4) y el defensor pegado en (6,4). */
function enRueda(
  izquierda: readonly Stack[],
  derecha: readonly Stack[],
  o: {
    readonly semilla?: number;
    readonly reglas?: ReglasDeBatalla;
    readonly lado?: BattleSide;
  } = {},
): { b: BattleState; rng: Rng } {
  const rng = createRng(o.semilla ?? 1);
  const b = crearBatallaConReglas(
    bando(izquierda),
    bando(derecha),
    rng,
    o.reglas ?? REGLAS_DEL_JUEGO,
    SIN_MURALLA,
    'rueda',
  );
  stackById(b, 'attacker-0').hex = { col: 5, row: 4 };
  stackById(b, 'defender-0').hex = { col: 6, row: 4 };
  // Sin moral: la de una sola facción (+1) regala a veces un turno, y los turnos
  // de estos tests se cuentan.
  for (const s of b.stacks) s.morale = 0;
  return { b, rng };
}

const piqueros = (n: number): Stack[] => [{ creature: 'pikeman', count: n }];

/** Un `Rng` que cuenta las tiradas de `int`: el cruce fija la tirada y no gasta ninguna. */
function contando(rng: Rng): { rng: Rng; ints: () => number } {
  let n = 0;
  return {
    rng: {
      ...rng,
      int: (a, b) => {
        n++;
        return rng.int(a, b);
      },
    },
    ints: () => n,
  };
}

type Ataque = Extract<BattleEvent, { kind: 'attack' }>;
const ataques = (b: BattleState, desde = 0): Ataque[] =>
  b.log.slice(desde).filter((e): e is Ataque => e.kind === 'attack');
const golpear = (golpe: TipoDeGolpe, respuesta: TipoDeGolpe): BattleAction => ({
  type: 'attack',
  target: 'defender-0',
  golpe,
  respuesta,
});

describe('el cruce: la rueda de la petición', () => {
  it('rápido contra cada tipo: mínimo, bajo, alto, máximo, alto, bajo y medio', () => {
    // El ejemplo literal de la petición: rápido → mínimo; ofensivo o defensivo →
    // algo más; normal → medio; r.guardia o finta → alto; fuerte → máximo.
    expect(TIPOS_DE_GOLPE.map((t) => puntoDelCruce('rapido', t))).toEqual([0, 1, 3, 4, 3, 1, 2]);
    expect(ANILLO).toEqual(['rapido', 'defensivo', 'finta', 'fuerte', 'romperGuardia', 'ofensivo']);
  });

  it('es simétrico, y Normal es el medio contra todos', () => {
    for (const a of TIPOS_DE_GOLPE) {
      expect(puntoDelCruce('normal', a)).toBe(2);
      for (const b of TIPOS_DE_GOLPE) expect(puntoDelCruce(a, b)).toBe(puntoDelCruce(b, a));
    }
    // Opuestos en el anillo, el máximo; al lado, el bajo.
    expect(puntoDelCruce('ofensivo', 'finta')).toBe(4);
    expect(puntoDelCruce('fuerte', 'romperGuardia')).toBe(1);
  });

  it('el contraataque cae en el punto contrario', () => {
    expect([0, 1, 2, 3, 4].map((p) => puntoDelContraataque(p as 0))).toEqual([4, 3, 2, 1, 0]);
  });

  it('la tirada de cada punto, en enteros', () => {
    expect([0, 1, 2, 3, 4].map((p) => tiradaDelPunto(10, 20, p as 0))).toEqual([
      10, 12, 15, 17, 20,
    ]);
    expect([0, 1, 2, 3, 4].map((p) => tiradaDelPunto(30, 40, p as 0))).toEqual([
      30, 32, 35, 37, 40,
    ]);
  });

  it('los golpes: uno, el doble golpe dos al atacar y uno al devolver, Rápido por dos', () => {
    const piquero = creature('pikeman');
    const paladin = creature('paladin');
    expect(golpesDe(piquero, null, false)).toBe(1);
    expect(golpesDe(paladin, null, false)).toBe(2);
    expect(golpesDe(paladin, null, true)).toBe(1);
    expect(golpesDe(piquero, 'rapido', false)).toBe(2);
    expect(golpesDe(paladin, 'rapido', false)).toBe(4);
    expect(golpesDe(paladin, 'rapido', true)).toBe(2);
    expect(golpesDe(paladin, 'fuerte', false)).toBe(2);
  });
});

describe('el modo del golpe', () => {
  it('la URL: vacío es azar, lo que no es un modo se rechaza diciendo cuáles valen', () => {
    expect(modoDelGolpeDeLaURL(null)).toBe('azar');
    expect(modoDelGolpeDeLaURL('')).toBe('azar');
    expect(modoDelGolpeDeLaURL('rueda')).toBe('rueda');
    expect(() => modoDelGolpeDeLaURL('ruleta')).toThrow(
      '«ruleta» no es un modo del golpe; valen azar, rueda',
    );
    // Repetido, como cualquier parámetro de la pelea: se dice.
    expect(() => unaVezEnLaURL(['rueda', 'azar'], 'golpe')).toThrow('«golpe» va 2 veces');
  });

  it('el juego pelea al azar: `createBattle` no deja elegir', () => {
    const rng = createRng(1);
    const b = createBattle(bando(piqueros(1)), bando(piqueros(1)), rng);
    expect(b.modoDelGolpe).toBe('azar');
  });

  it('al azar no se elige tipo; con la rueda, los dos van juntos (o ninguno: plantarse) y tienen que ser tipos', () => {
    const rng = createRng(1);
    const azar = crearBatallaConReglas(
      bando(piqueros(5)),
      bando(piqueros(5)),
      rng,
      REGLAS_DEL_JUEGO,
    );
    stackById(azar, 'attacker-0').hex = { col: 5, row: 4 };
    stackById(azar, 'defender-0').hex = { col: 6, row: 4 };
    expect(() => applyAction(azar, golpear('fuerte', 'finta'), rng)).toThrow(
      'en esta pelea el golpe es de azar: no se elige tipo',
    );
    const { b, rng: r } = enRueda(piqueros(5), piqueros(5));
    const largo = b.log.length;
    expect(() =>
      applyAction(b, { type: 'attack', target: 'defender-0', respuesta: 'finta' }, r),
    ).toThrow('en esta pelea se golpea con la rueda: falta el golpe');
    expect(() =>
      applyAction(b, { type: 'attack', target: 'defender-0', golpe: 'fuerte' }, r),
    ).toThrow('falta la respuesta');
    expect(() =>
      applyAction(
        b,
        {
          type: 'attack',
          target: 'defender-0',
          golpe: 'patada' as TipoDeGolpe,
          respuesta: 'finta',
        },
        r,
      ),
    ).toThrow('«patada» no es un tipo de golpe; valen rapido');
    // Rechazado antes de mover y de escribir nada.
    expect(b.log.length).toBe(largo);
  });

  it('`data/rueda.json` se valida diciendo el fichero y el campo', () => {
    const con = (cambio: (j: Record<string, unknown>) => void): (() => unknown) => {
      const j = structuredClone(ruedaJson) as Record<string, unknown>;
      cambio(j);
      return () => validarRueda(j);
    };
    expect(validarRueda(ruedaJson).fuerte.factor).toBe(1.25);
    expect(con((j) => (j.patada = 1))).toThrow('data/rueda.json: «patada» no es un campo');
    expect(con((j) => ((j.fuerte as { porcentaje: number }).porcentaje = 0))).toThrow(
      'data/rueda.json: fuerte: el porcentaje tiene que ser 1 o más, y es 0',
    );
    expect(con((j) => ((j.finta as { ataque: number }).ataque = 1))).toThrow(
      'data/rueda.json: finta: el ataque quita, así que es 0 o menos, y es 1',
    );
    expect(con((j) => delete (j.pesos as { golpe: Record<string, number> }).golpe.normal)).toThrow(
      'data/rueda.json: pesos.golpe: falta el peso de «normal»',
    );
    expect(
      con((j) => {
        const g = (j.pesos as { golpe: Record<string, number> }).golpe;
        for (const k of Object.keys(g)) g[k] = 0;
      }),
    ).toThrow('todos los pesos son 0');
  });
});

describe('el daño fijo por el cruce (piqueros: A 5, D 9 → ×0,9; daño 30-40; 150 PV)', () => {
  it('Rápido contra Fuerte: máximo, dos golpes de ×0,6; el contraataque, mínimo con Fuerte ×1,25', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    const c = contando(rng);
    applyAction(b, golpear('rapido', 'fuerte'), c.rng);
    expect(b.log.find((e) => e.kind === 'cruce')).toEqual({
      kind: 'cruce',
      stack: 'attacker-0',
      target: 'defender-0',
      golpe: 'rapido',
      respuesta: 'fuerte',
      punto: 4,
    });
    // 40 × 10 × 0,9 × 0,6 = 216, dos veces; quedan 1 500 − 432 = 1 068 PV, 8 piqueros:
    // 30 × 8 × 0,9 × 1,25 = 270. Cada golpe dice el punto en que cayó.
    expect(ataques(b).map((a) => [a.stack, a.damage, a.retaliation, a.punto])).toEqual([
      ['attacker-0', 216, false, 4],
      ['attacker-0', 216, false, 4],
      ['defender-0', 270, true, 0],
    ]);
    // El cruce sustituye la tirada: ni un `rng.int` en todo el intercambio.
    expect(c.ints()).toBe(0);
  });

  it('Normal contra cualquiera, el medio: 35 × 10 × 0,9 = 315', () => {
    for (const r of TIPOS_DE_GOLPE.filter((t) => t !== 'romperGuardia' && t !== 'finta')) {
      const { b, rng } = enRueda(piqueros(10), piqueros(10));
      applyAction(b, golpear('normal', r), rng);
      expect(ataques(b)[0]?.damage, `normal contra ${r}`).toBe(315);
    }
  });

  it('Fuerte contra Fuerte, el mínimo ×1,25: 30 × 10 × 0,9 × 1,25 = 337,5 → 338', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    applyAction(b, golpear('fuerte', 'fuerte'), rng);
    // Y el contraataque, en el máximo: quedan 1 500 − 338 = 1 162 PV, 8 piqueros;
    // 40 × 8 × 0,9 × 1,25 = 360.
    expect(ataques(b).map((a) => a.damage)).toEqual([338, 360]);
  });

  it('Ofensivo suma un punto de ataque al golpe que se da: 37 × 10 × 0,925 = 342', () => {
    // Ofensivo contra Defensivo, a dos en el anillo: alto (37).
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    applyAction(b, golpear('ofensivo', 'defensivo'), rng);
    expect(ataques(b)[0]?.damage).toBe(342);
    // Su ataque de verdad no cambia: es del golpe, no un efecto.
    expect(effectiveAttack(stackById(b, 'attacker-0'))).toBe(5);
  });

  it('con el doble golpe y Rápido, cuatro golpes', () => {
    const { b, rng } = enRueda([{ creature: 'paladin', count: 1 }], piqueros(60));
    // El paladín es rápido y el piquero no: el paladín abre la ronda.
    expect(activeStack(b)?.id).toBe('attacker-0');
    applyAction(b, golpear('rapido', 'normal'), rng);
    expect(ataques(b).filter((a) => !a.retaliation)).toHaveLength(4);
  });

  it('el disparo no pasa por la rueda: sigue con su tirada', () => {
    const rng = createRng(4);
    const b = crearBatallaConReglas(
      bando([{ creature: 'archer', count: 5 }]),
      bando(piqueros(5)),
      rng,
      REGLAS_DEL_JUEGO,
      SIN_MURALLA,
      'rueda',
    );
    const c = contando(rng);
    b.turno = { n: 50, stack: 'attacker-0', gastado: 0 };
    applyAction(b, { type: 'shoot', target: 'defender-0' }, c.rng);
    expect(c.ints()).toBe(1);
    expect(b.log.some((e) => e.kind === 'cruce')).toBe(false);
  });
});

describe('los efectos de cada tipo, hasta que el afectado termine su próximo turno', () => {
  it('Defensivo cubre ya el contraataque: 35 × 8 × 0,875 = 245', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    applyAction(b, golpear('defensivo', 'normal'), rng);
    const yo = stackById(b, 'attacker-0');
    // El golpe, 315; quedan 1 185 PV, 8 piqueros; contra defensa 10, ×0,875.
    expect(ataques(b).map((a) => a.damage)).toEqual([315, 245]);
    expect(yo.effects).toEqual([
      expect.objectContaining({ kind: 'defense', amount: 1, source: 'defensivo', roundsLeft: 2 }),
    ]);
    expect(effectiveDefense(yo, REGLAS_DEL_JUEGO)).toBe(10);
    expect(b.log).toContainEqual(
      expect.objectContaining({ kind: 'effect', source: 'defensivo', hastaSuTurno: true }),
    );
  });

  it('Romper guardia y Finta se cuelgan al acabar el intercambio: no tocan ni el golpe ni el contraataque', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    // Romper guardia contra Finta: a dos en el anillo, alto (37 × 10 × 0,9 = 333); el
    // contraataque en el bajo: quedan 1 167 PV, 8 piqueros; 32 × 8 × 0,9 = 230,4 → 230.
    applyAction(b, golpear('romperGuardia', 'finta'), rng);
    expect(ataques(b).map((a) => a.damage)).toEqual([333, 230]);
    const yo = stackById(b, 'attacker-0');
    const el = stackById(b, 'defender-0');
    expect(effectiveDefense(el, REGLAS_DEL_JUEGO)).toBe(8);
    expect(effectiveAttack(yo)).toBe(4);
    // Los dos efectos, detrás del último golpe.
    const ultimoGolpe = b.log.map((e) => e.kind).lastIndexOf('attack');
    const efectos = b.log.flatMap((e, i) => (e.kind === 'effect' ? [i] : []));
    expect(efectos).toHaveLength(2);
    expect(efectos.every((i) => i > ultimoGolpe)).toBe(true);
  });

  it('sin contraataque, la respuesta solo cuenta para el cruce: ni Defensivo ni Finta', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    stackById(b, 'defender-0').retaliated = true;
    applyAction(b, golpear('normal', 'finta'), rng);
    expect(b.log.find((e) => e.kind === 'cruce')).toMatchObject({ punto: 2 });
    expect(ataques(b).filter((a) => a.retaliation)).toEqual([]);
    expect(stackById(b, 'attacker-0').effects).toEqual([]);
    const { b: b2, rng: r2 } = enRueda(piqueros(10), piqueros(10));
    stackById(b2, 'defender-0').retaliated = true;
    applyAction(b2, golpear('normal', 'defensivo'), r2);
    expect(stackById(b2, 'defender-0').effects).toEqual([]);
  });

  it('el que nace en el turno del afectado sigue al cerrarlo, y se va al cerrar el siguiente', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    // El contraataque le deja una Finta a quien ataca, en su propio turno.
    applyAction(b, golpear('normal', 'finta'), rng);
    const yo = stackById(b, 'attacker-0');
    expect(yo.effects.map((e) => e.source)).toEqual(['finta']);
    // Le toca al defensor: se defiende y cierra la ronda.
    expect(activeStack(b)?.id).toBe('defender-0');
    applyAction(b, { type: 'defend' }, rng);
    expect(b.round).toBe(2);
    // Ronda 2: la Finta sigue (el tope es de dos rondas). Esperar no la quita: no
    // cierra el turno.
    expect(activeStack(b)?.id).toBe('attacker-0');
    expect(yo.effects.map((e) => e.source)).toEqual(['finta']);
    applyAction(b, { type: 'wait' }, rng);
    expect(yo.effects.map((e) => e.source)).toEqual(['finta']);
    applyAction(b, { type: 'defend' }, rng);
    // Su turno de después de esperar sí la quita, al cerrarlo, y lo dice.
    expect(activeStack(b)?.id).toBe('attacker-0');
    const largo = b.log.length;
    applyAction(b, { type: 'end_turn' }, rng);
    expect(yo.effects).toEqual([]);
    expect(b.log.slice(largo)).toContainEqual({
      kind: 'effect_end',
      stack: 'attacker-0',
      source: 'finta',
    });
  });

  it('Romper guardia en el defensor se va al cerrar su próximo turno', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    applyAction(b, golpear('romperGuardia', 'normal'), rng);
    const el = stackById(b, 'defender-0');
    expect(el.effects.map((e) => e.source)).toEqual(['romperGuardia']);
    expect(activeStack(b)?.id).toBe('defender-0');
    applyAction(b, { type: 'defend' }, rng);
    expect(el.effects).toEqual([]);
  });

  it('si su turno no llega (la moral baja lo salta), lo quita el tope de dos rondas', () => {
    // La primera semilla en la que el atacante, con moral −3 y la regla de fheroes2
    // (3/12), pierde su turno de la ronda 2: deterministas, cada una con su `Rng`.
    for (let semilla = 1; semilla <= 200; semilla++) {
      const { b, rng } = enRueda(piqueros(10), piqueros(10), {
        semilla,
        reglas: reglasDeLaURL('moralBaja'),
      });
      applyAction(b, golpear('normal', 'finta'), rng);
      const yo = stackById(b, 'attacker-0');
      yo.morale = -3;
      applyAction(b, { type: 'defend' }, rng);
      const paralizado = b.log.some(
        (e) => e.kind === 'morale' && e.stack === 'attacker-0' && !e.good,
      );
      if (!paralizado || b.round !== 2 || activeStack(b)?.id !== 'defender-0') continue;
      expect(yo.effects.map((e) => e.source)).toEqual(['finta']);
      applyAction(b, { type: 'defend' }, rng);
      // Ronda 3: caduca al empezar, antes de que el atacante juegue.
      expect(b.round).toBe(3);
      expect(yo.effects).toEqual([]);
      return;
    }
    throw new Error('en 200 semillas la moral baja no salta nunca el turno del atacante');
  });
});

// ------------------------------------------------- primero se anda, luego la rueda

/**
 * Dos caballerías (A 10, D 9, daño 50-100, `charge`) en (1,4) contra diez piqueros
 * (D 9) en (6,4): desde (5,4) la recta mide 4 y el piquero está en ella, así que
 * carga 4 (+40 %). Con 4 casillas por gastar: la carrera las agota.
 */
function aLaCarga(modo: 'rueda' | 'azar' = 'rueda'): { b: BattleState; rng: Rng } {
  const rng = createRng(1);
  const b = crearBatallaConReglas(
    bando([{ creature: 'cavalry', count: 2 }]),
    bando(piqueros(10)),
    rng,
    REGLAS_DEL_JUEGO,
    SIN_MURALLA,
    modo,
  );
  const jinetes = stackById(b, 'attacker-0');
  jinetes.hex = { col: 1, row: 4 };
  stackById(b, 'defender-0').hex = { col: 6, row: 4 };
  for (const x of b.stacks) x.morale = 0;
  expect(activeStack(b)?.id).toBe('attacker-0');
  const turno = b.turno;
  if (turno === null) throw new Error('nadie tiene el turno');
  turno.gastado += pasosQueQuedan(b, jinetes) - 4;
  expect(pasosQueQuedan(b, jinetes)).toBe(4);
  return { b, rng };
}

const DESDE = { col: 5, row: 4 } as const;
const plantarse: BattleAction = { type: 'attack', target: 'defender-0', from: DESDE };

describe('primero se anda, luego la rueda (cambio del 13-10-2026)', () => {
  it('plantarse anda, guarda la carga de la carrera y no cierra el turno aunque agote las casillas', () => {
    const { b, rng } = aLaCarga();
    const c = contando(rng);
    const largo = b.log.length;
    const turno = b.turno?.n;
    applyAction(b, plantarse, c.rng);
    expect(stackById(b, 'attacker-0').hex).toEqual(DESDE);
    expect(b.golpeEnCurso).toEqual({ stack: 'attacker-0', target: 'defender-0', carga: 4 });
    // Solo el tramo, con la marca de carga: ni cruce ni golpe todavía.
    expect(b.log.slice(largo)).toEqual([
      { kind: 'move', stack: 'attacker-0', to: DESDE, path: expect.any(Array), charge: true },
    ]);
    expect(pasosQueQuedan(b, stackById(b, 'attacker-0'))).toBe(0);
    expect(b.turno?.n).toBe(turno);
    expect(activeStack(b)?.id).toBe('attacker-0');
    // Plantarse no tira dados.
    expect(c.ints()).toBe(0);
    // Sin `from`, el enemigo ya está al lado: solo se planta, y sin carga.
    const { b: pegados, rng: r } = enRueda(piqueros(5), piqueros(5));
    const antes = pegados.log.length;
    applyAction(pegados, { type: 'attack', target: 'defender-0' }, r);
    expect(pegados.log.length).toBe(antes);
    expect(pegados.golpeEnCurso).toEqual({ stack: 'attacker-0', target: 'defender-0', carga: 0 });
  });

  it('el golpe tras plantarse cobra la carga guardada: lo mismo que de una vez, en el mismo orden', () => {
    // De una vez: andar, cruce y golpe (lo que hacen `autoResolve` y la IA contra la IA).
    const unaVez = aLaCarga();
    applyAction(unaVez.b, { ...plantarse, golpe: 'normal', respuesta: 'rapido' }, unaVez.rng);
    // En dos: plantarse y, tras la rueda, el golpe sin `from`.
    const enDos = aLaCarga();
    applyAction(enDos.b, plantarse, enDos.rng);
    applyAction(
      enDos.b,
      { type: 'attack', target: 'defender-0', golpe: 'normal', respuesta: 'rapido' },
      enDos.rng,
    );
    expect(enDos.b.golpeEnCurso).toBeNull();
    expect(JSON.stringify(enDos.b.log)).toBe(JSON.stringify(unaVez.b.log));
    // Normal: el medio, 50 + ⌊50 · 2 / 4⌋ = 75; × 2 jinetes × 1,1 (A 10 − D 9) × 1,4
    // (carga de 4) = 231. Sin la carga guardada serían 165.
    const golpe = ataques(enDos.b).find((a) => !a.retaliation);
    expect(golpe).toMatchObject({ stack: 'attacker-0', damage: 231, charge: 4 });
    // El orden: el tramo con su carga, el cruce y el golpe.
    const deLaJugada = enDos.b.log.filter((e) => ['move', 'cruce', 'attack'].includes(e.kind));
    expect(deLaJugada.slice(0, 3).map((e) => e.kind)).toEqual(['move', 'cruce', 'attack']);
    expect(deLaJugada[0]).toMatchObject({ kind: 'move', charge: true });
    // Y cierra el turno.
    expect(activeStack(enDos.b)?.id).not.toBe('attacker-0');
  });

  it('la previsión de la rueda, ya plantado, es la de antes de andar (con la carga)', () => {
    const { b, rng } = aLaCarga();
    const antes = previsionDeLaRueda(
      b,
      { type: 'attack', target: 'defender-0', from: DESDE },
      'golpe',
    );
    const respuestaAntes = previsionDeLaRueda(
      b,
      { type: 'attack', target: 'defender-0', from: DESDE, golpe: 'fuerte' },
      'respuesta',
    );
    applyAction(b, plantarse, rng);
    expect(previsionDeLaRueda(b, { type: 'attack', target: 'defender-0' }, 'golpe')).toEqual(antes);
    expect(
      previsionDeLaRueda(b, { type: 'attack', target: 'defender-0', golpe: 'fuerte' }, 'respuesta'),
    ).toEqual(respuestaAntes);
    // Normal con la carga: 231, el mismo que da el golpe.
    expect(antes.porTipo?.normal.danio).toEqual({ min: 231, max: 231 });
  });

  it('con un golpe plantado, solo vale ese golpe con sus dos elecciones: lo demás lanza con su motivo', () => {
    const { b, rng } = aLaCarga();
    applyAction(b, plantarse, rng);
    expect(legalActions(b)).toEqual([{ type: 'attack', target: 'defender-0' }]);
    const largo = b.log.length;
    const motivo = 'attacker-0 está plantado ante defender-0: elige en la rueda o cancela el golpe';
    for (const otra of [
      { type: 'end_turn' },
      { type: 'defend' },
      { type: 'wait' },
      { type: 'move', to: { col: 4, row: 4 } },
      { type: 'attack', target: 'defender-0' },
      { type: 'attack', target: 'defender-0', golpe: 'fuerte' },
      {
        type: 'attack',
        target: 'defender-0',
        from: { col: 5, row: 5 },
        golpe: 'fuerte',
        respuesta: 'finta',
      },
      { type: 'attack', target: 'defender-1', golpe: 'fuerte', respuesta: 'finta' },
      { type: 'cast', spell: 'bless', target: 'attacker-0' },
      { type: 'surrender' },
    ] satisfies BattleAction[]) {
      expect(() => applyAction(b, otra, rng), JSON.stringify(otra)).toThrow(motivo);
    }
    // Un tipo que no existe lo dice la rueda, no el golpe en curso.
    expect(() =>
      applyAction(
        b,
        {
          type: 'attack',
          target: 'defender-0',
          golpe: 'patada' as TipoDeGolpe,
          respuesta: 'finta',
        },
        rng,
      ),
    ).toThrow('«patada» no es un tipo de golpe');
    expect(b.log.length).toBe(largo);
    expect(b.golpeEnCurso).not.toBeNull();
  });

  it('soltar el golpe deja la unidad donde llegó, sin la carga y con su turno; si no le queda nada, lo cierra', () => {
    // Con casillas de sobra: sigue su turno.
    const { b, rng } = aLaCarga();
    const turno = b.turno;
    if (turno === null) throw new Error('nadie tiene el turno');
    turno.gastado -= 2;
    applyAction(b, plantarse, rng);
    const largo = b.log.length;
    soltarElGolpe(b, rng);
    expect(b.golpeEnCurso).toBeNull();
    expect(b.log.length).toBe(largo);
    expect(activeStack(b)?.id).toBe('attacker-0');
    expect(b.turno?.n).toBe(turno.n);
    expect(stackById(b, 'attacker-0').hex).toEqual(DESDE);
    // Ya se movió: puede andar más o golpear, no defenderse ni esperar.
    const legales = legalActions(b);
    expect(legales.some((a) => a.type === 'move')).toBe(true);
    expect(legales).toContainEqual({ type: 'attack', target: 'defender-0' });
    expect(legales.some((a) => a.type === 'defend' || a.type === 'wait')).toBe(false);
    // El golpe de después, desde donde está, ya no carga: 165, no 231.
    applyAction(b, { type: 'attack', target: 'defender-0' }, rng);
    applyAction(
      b,
      { type: 'attack', target: 'defender-0', golpe: 'normal', respuesta: 'rapido' },
      rng,
    );
    const golpe = ataques(b, largo).find((a) => !a.retaliation);
    expect(golpe?.damage).toBe(165);
    expect(golpe?.charge).toBeUndefined();
    // Sin nada que hacer, se cierra. Hoy no pasa solo —el objetivo sigue al lado y
    // se le puede golpear—, así que se le aparta a mano tras agotar las casillas.
    const agotado = aLaCarga();
    applyAction(agotado.b, plantarse, agotado.rng);
    stackById(agotado.b, 'defender-0').hex = { col: 10, row: 8 };
    const n = agotado.b.turno?.n;
    soltarElGolpe(agotado.b, agotado.rng);
    expect(agotado.b.turno?.n).not.toBe(n);
    expect(activeStack(agotado.b)?.id).not.toBe('attacker-0');
    // Y sin golpe plantado, lanza.
    expect(() => soltarElGolpe(agotado.b, agotado.rng)).toThrow(
      'no hay ningún golpe plantado que soltar',
    );
  });

  it('la carga va en el `move`, al azar y con la rueda: cada carrera con marca la cierra un golpe que carga, y al revés', () => {
    for (const modo of ['azar', 'rueda'] as const) {
      let cargas = 0;
      for (let semilla = 1; semilla <= 6; semilla++) {
        const rng = createRng(semilla);
        const b = crearBatallaConReglas(
          bando([
            { creature: 'cavalry', count: 1 },
            { creature: 'champion', count: 1 },
          ]),
          bando(piqueros(3)),
          rng,
          REGLAS_DEL_JUEGO,
          SIN_MURALLA,
          modo,
        );
        autoResolve(b, rng);
        const log = b.log;
        // Entre la carrera y su golpe, al azar nada; con la rueda, su cruce y el
        // Defensivo de quien pega, que se pone antes de sus golpes.
        const enMedio = modo === 'azar' ? [] : ['cruce', 'effect'];
        const saltando = (desde: number, paso: 1 | -1): BattleEvent | undefined => {
          let k = desde + paso;
          while (enMedio.includes(log[k]?.kind ?? '')) k += paso;
          return log[k];
        };
        for (const [i, e] of log.entries()) {
          if (e.kind === 'move' && e.charge === true) {
            cargas++;
            if (modo === 'rueda') expect(log[i + 1]?.kind).toBe('cruce');
            const golpe = saltando(i, 1);
            expect(golpe).toMatchObject({ kind: 'attack', stack: e.stack, retaliation: false });
            expect(golpe?.kind === 'attack' && golpe.charge).toBeGreaterThan(0);
          }
          if (e.kind === 'attack' && e.charge !== undefined && !e.retaliation) {
            // El primer golpe de la jugada: el segundo del doble golpe no carga.
            expect(
              saltando(i, -1),
              `${modo} s${semilla}: un golpe que carga sin su carrera`,
            ).toMatchObject({ kind: 'move', stack: e.stack, charge: true });
          }
        }
      }
      expect(cargas, modo).toBeGreaterThan(0);
    }
  });
});

describe('la previsión de la rueda', () => {
  it('cada sector, con su horquilla: Normal en el medio, los demás del mínimo al máximo', () => {
    const { b } = enRueda(piqueros(10), piqueros(10));
    const p = previsionDeLaRueda(b, { type: 'attack', target: 'defender-0' }, 'golpe');
    expect(p.sinContraataque).toBeNull();
    const t = p.porTipo;
    if (t === null) throw new Error('quien pega siempre tiene previsión');
    expect(t.normal).toEqual({ danio: { min: 315, max: 315 }, golpes: 1 });
    // 30 × 10 × 0,9 × 0,6 = 162; 40 × … = 216.
    expect(t.rapido).toEqual({ danio: { min: 162, max: 216 }, golpes: 2 });
    expect(t.fuerte.danio).toEqual({ min: 338, max: 450 });
    // 30 × 10 × 0,925 = 277,5 → 278; 40 × … = 370.
    expect(t.ofensivo.danio).toEqual({ min: 278, max: 370 });
  });

  it('quien responde ve su contraataque, o por qué no lo hará', () => {
    const { b } = enRueda(piqueros(10), piqueros(10));
    const p = previsionDeLaRueda(b, { type: 'attack', target: 'defender-0' }, 'respuesta');
    expect(p.porTipo?.normal).toEqual({ danio: { min: 315, max: 315 }, golpes: 1 });
    stackById(b, 'defender-0').retaliated = true;
    const sin = previsionDeLaRueda(b, { type: 'attack', target: 'defender-0' }, 'respuesta');
    expect(sin.porTipo).toBeNull();
    expect(sin.sinContraataque).toBe('Piquero ya devolvió un golpe esta ronda');
    // Quien pega lo sabe también, y sigue viendo su daño.
    const golpe = previsionDeLaRueda(b, { type: 'attack', target: 'defender-0' }, 'golpe');
    expect(golpe.sinContraataque).toBe('Piquero ya devolvió un golpe esta ronda');
    expect(golpe.porTipo?.normal).toEqual({ danio: { min: 315, max: 315 }, golpes: 1 });
  });

  it('sin contraataque, las notas del golpe no lo prometen (H9)', () => {
    expect(efectoDeGolpe('defensivo', 'golpe', false)).not.toContain('contraataque');
    expect(efectoDeGolpe('defensivo', 'golpe', false)).toContain('no te devuelven el golpe');
    for (const t of ['romperGuardia', 'finta'] as const) {
      expect(efectoDeGolpe(t, 'golpe', false)).toContain('(no toca este golpe)');
      expect(efectoDeGolpe(t, 'golpe', false)).not.toContain('contraataque');
    }
  });

  it('la previsión de un golpe elegido usa su sector y sus golpes', () => {
    const { b } = enRueda(piqueros(10), piqueros(10));
    const p = previsionDe(b, { type: 'attack', target: 'defender-0', golpe: 'rapido' });
    expect(p).toMatchObject({ golpes: 2, danio: { min: 162, max: 216 } });
    // Al azar, un golpe elegido no se prevé: no se puede dar.
    const rng = createRng(1);
    const azar = crearBatallaConReglas(
      bando(piqueros(5)),
      bando(piqueros(5)),
      rng,
      REGLAS_DEL_JUEGO,
    );
    stackById(azar, 'attacker-0').hex = { col: 5, row: 4 };
    stackById(azar, 'defender-0').hex = { col: 6, row: 4 };
    expect(() =>
      previsionDe(azar, { type: 'attack', target: 'defender-0', golpe: 'rapido' }),
    ).toThrow('el golpe es de azar');
  });
});

describe('la IA elige a ciegas', () => {
  it('reparte con los pesos de `data/rueda.json` (todos iguales: ~1/7 cada uno)', () => {
    expect(new Set(Object.values(CIFRAS_DE_LA_RUEDA.pesos.golpe))).toEqual(new Set([1]));
    const rng = createRng(11);
    const cuenta = new Map<TipoDeGolpe, number>();
    for (let i = 0; i < 7000; i++) {
      const t = elegirEnLaRueda('golpe', rng);
      cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
    }
    for (const t of TIPOS_DE_GOLPE) {
      expect(cuenta.get(t), t).toBeGreaterThan(850);
      expect(cuenta.get(t), t).toBeLessThan(1150);
    }
  });

  it('`sortearPorPesos`: lo de peso 0 no sale nunca, y sin peso ninguno lanza', () => {
    const rng = createRng(5);
    const salen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      salen.add(sortearPorPesos(rng, ['a', 'b', 'c'], (x) => (x === 'b' ? 3 : 0)));
    }
    expect([...salen]).toEqual(['b']);
    expect(() => sortearPorPesos(rng, ['a', 'b'], () => 0)).toThrow(
      'no hay qué sortear: los pesos suman 0',
    );
  });

  it('sin rueda, `completarCruce` no toca ni la acción ni el `Rng`', () => {
    const rng = createRng(1);
    const b = createBattle(bando(piqueros(1)), bando(piqueros(1)), rng);
    const c = contando(createRng(3));
    const accion: BattleAction = { type: 'attack', target: 'defender-0' };
    expect(completarCruce(b, accion, c.rng).accion).toBe(accion);
    expect(c.ints()).toBe(0);
  });

  it('`completarCruce` elige solo por los bandos de la IA, y se para en el primero de una persona', () => {
    const accion: BattleAction = { type: 'attack', target: 'defender-0' };
    // El golpe es de la persona: falta él, y la respuesta no se sortea aún.
    const { b, rng } = enRueda(piqueros(5), piqueros(5));
    const c = contando(rng);
    expect(completarCruce(b, accion, c.rng, (side) => side === 'defender')).toEqual({
      falta: 'golpe',
      accion,
    });
    expect(c.ints()).toBe(0);
    // El golpe es de la IA y la respuesta de la persona: un sorteo, y falta ella.
    const r = completarCruce(b, accion, c.rng, (side) => side === 'attacker');
    expect(r.falta).toBe('respuesta');
    expect(r.accion).toMatchObject({ type: 'attack', golpe: expect.any(String) });
    expect(r.accion).not.toHaveProperty('respuesta');
    expect(c.ints()).toBe(1);
    // Los dos de la IA: completa, con una tirada por papel.
    const todo = completarCruce(b, accion, c.rng);
    expect(todo.falta).toBeNull();
    expect(todo.accion).toMatchObject({ golpe: expect.any(String), respuesta: expect.any(String) });
    expect(c.ints()).toBe(3);
  });

  it('`autoResolve` con la rueda termina y es la misma pelea con la misma semilla', () => {
    const pelea = (semilla: number): BattleState => {
      const rng = createRng(semilla);
      const b = crearBatallaConReglas(
        bando([
          { creature: 'pikeman', count: 8 },
          { creature: 'paladin', count: 2 },
        ]),
        bando([
          { creature: 'skeleton', count: 20 },
          { creature: 'vampire', count: 3 },
        ]),
        rng,
        REGLAS_DEL_JUEGO,
        SIN_MURALLA,
        'rueda',
      );
      autoResolve(b, rng);
      return b;
    };
    for (const semilla of [1, 2, 3]) {
      const a = pelea(semilla);
      expect(a.finished).not.toBeNull();
      expect(a.log.filter((e) => e.kind === 'cruce').length).toBeGreaterThan(0);
      expect(JSON.stringify(pelea(semilla).log)).toBe(JSON.stringify(a.log));
    }
  });
});

describe('el parte cuenta el cruce', () => {
  it('«Romper guardia contra Finta: alto; contraataque bajo», y sin contraataque, sin él', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    applyAction(b, golpear('romperGuardia', 'finta'), rng);
    const parte = marcadoDe(renderBattleLog(b, null));
    expect(parte).toContain('Romper guardia contra Finta: alto; contraataque bajo');
    // La Finta del contraataque, con su duración de verdad.
    expect(parte).toContain(
      'Finta sobre Piquero, del atacante: ataque -1 hasta que termine su próximo turno',
    );
    expect(
      contraataqueDelCruce(
        b.log,
        b.log.findIndex((e) => e.kind === 'cruce'),
      ),
    ).toBe(1);

    const { b: b2, rng: r2 } = enRueda(piqueros(10), piqueros(1));
    applyAction(b2, golpear('fuerte', 'rapido'), r2);
    // El piquero solo cae: no hay contraataque que contar.
    expect(
      contraataqueDelCruce(
        b2.log,
        b2.log.findIndex((e) => e.kind === 'cruce'),
      ),
    ).toBeNull();
    expect(marcadoDe(renderBattleLog(b2, null))).toContain('Fuerte contra Rápido: máximo</div>');
  });
});

// ------------------------------------------------------------- la sesión de la arena

/**
 * Una unidad de la arena por su hoja, o ya hecha (con un rasgo puesto), como fuente
 * del montaje. Las criaturas del catálogo del juego ya no entran en la arena
 * (13-10-2026): el jinete es el hermano de carga, el piquero el del imperio.
 */
const deLaArena = (u: string | UnidadDeArena): FuenteDeArena =>
  delBorrador(typeof u === 'string' ? unidadDeArena(u) : u);

/** Los de estas pruebas: dos jinetes que cargan, un piquero y lo demás. */
const JINETE = 'templario-hermano-de-carga';
const JINETE_DE_LA_IA = 'jinete-de-plaga';
const PIQUERO = 'imperio-piquero';
/** El que no recibe contraataques: un espectro con `no_retaliation`. */
const SIN_RESPUESTA = (): UnidadDeArena =>
  unidadDeArena('espectro', { traits: ['undead', 'no_retaliation'] });

function sesion(
  izquierda: { readonly ids: readonly (string | UnidadDeArena)[]; readonly ia: boolean },
  derecha: { readonly ids: readonly (string | UnidadDeArena)[]; readonly ia: boolean },
  semilla = 1,
): SesionDeArena {
  const lado = (l: typeof izquierda) => ({
    unidades: l.ids.map(deLaArena),
    heroe: null,
    ia: l.ia,
  });
  const s = new SesionDeArena(
    {
      izquierda: lado(izquierda),
      derecha: lado(derecha),
      reglas: REGLAS_DEL_JUEGO,
      piezas: [],
      golpe: 'rueda',
    },
    semilla,
  );
  s.empezar();
  return s;
}

/**
 * La persona juega hasta que la rueda le pide algo: si `golpea`, golpea en cuanto
 * puede y si no se acerca al enemigo más cercano; si no, se defiende.
 */
function hastaLaRueda(s: SesionDeArena, golpea: boolean, fase?: 'golpe' | 'respuesta'): void {
  for (let i = 0; i < 200 && s.battle.finished === null; i++) {
    const pendiente = s.ruedaPendiente;
    if (pendiente !== null && (fase === undefined || pendiente.fase === fase)) return;
    // La que no se busca se contesta con Normal y se sigue.
    if (pendiente !== null) {
      s.elegirEnLaRueda('normal');
      continue;
    }
    const turno = s.turnoPropio;
    if (turno === null) throw new Error('la sesión devuelve el control sin turno ni rueda');
    const legales = s.battleLegalActions();
    const ataque = legales.find((a) => a.type === 'attack');
    const enemigos = s.battle.stacks.filter((x) => x.side !== turno.side && x.count > 0);
    const cerca = (h: { col: number; row: number }): number =>
      Math.min(...enemigos.map((e) => hexDistance(h, e.hex)));
    const acercarse = legales
      .flatMap((a) => (a.type === 'move' ? [a] : []))
      .sort((a, b) => cerca(a.to) - cerca(b.to))[0];
    if (golpea && ataque !== undefined) s.playBattleAction(ataque);
    else if (golpea && acercarse !== undefined && turno.battle.turno?.gastado === 0)
      s.playBattleAction(acercarse);
    else
      s.playBattleAction(
        legales.some((a) => a.type === 'defend') ? { type: 'defend' } : { type: 'end_turn' },
      );
  }
  throw new Error('la rueda no pide nada');
}

/**
 * Yo (una caballería) contra la IA (un piquero), con el piquero puesto a mano en
 * (6,4): desde (5,4) la caballería, en (0,4), carga 5 casillas. El golpe que se
 * pulsa es ese.
 */
function jineteALaCarga(): { s: SesionDeArena; ataque: BattleAction & { type: 'attack' } } {
  const s = sesion({ ids: [JINETE], ia: false }, { ids: [PIQUERO], ia: true });
  expect(s.turnoPropio?.stack.id).toBe('attacker-0');
  expect(stackById(s.battle, 'attacker-0').hex).toEqual({ col: 0, row: 4 });
  stackById(s.battle, 'defender-0').hex = { col: 6, row: 4 };
  const ataque = { type: 'attack', target: 'defender-0', from: DESDE } as const;
  expect(s.battleLegalActions()).toContainEqual(ataque);
  expect(s.battleCharges()).toContainEqual({ target: 'defender-0', at: DESDE, hexes: 5 });
  return { s, ataque };
}

describe('la sesión de la arena con la rueda', () => {
  it('Yo contra IA: golpear abre la rueda; elegir da el golpe y la IA responde a ciegas', () => {
    const s = sesion({ ids: [JINETE], ia: false }, { ids: [PIQUERO], ia: true });
    hastaLaRueda(s, true, 'golpe');
    const p = s.ruedaPendiente;
    expect(p?.fase).toBe('golpe');
    expect(p?.bando).toBe('attacker');
    const antes = s.battle.log.length;
    s.elegirEnLaRueda('fuerte');
    expect(s.battle.log.slice(antes).find((e) => e.kind === 'cruce')).toMatchObject({
      stack: 'attacker-0',
      golpe: 'fuerte',
    });
    // Lo siguiente es de la IA: o juega hasta tu próximo turno, o te golpea y la
    // rueda te pide la respuesta; nunca el golpe de nadie más.
    const despues = s.ruedaPendiente;
    if (despues !== null) {
      expect(despues.fase).toBe('respuesta');
      expect(despues.atacante.side).toBe('defender');
    }
  });

  it('Yo contra IA: el clic anda hasta el enemigo y solo entonces la rueda; elegir da el golpe sin andar más', () => {
    const { s, ataque } = jineteALaCarga();
    // Lo que daría cada sector antes de andar (la previsión no toca el estado)…
    const antesDeAndar = previsionDeLaRueda(s.battle, ataque, 'golpe');
    const largo = s.battle.log.length;
    s.playBattleAction(ataque);
    expect(s.ruedaPendiente?.fase).toBe('golpe');
    const from = ataque.from;
    const jinete = stackById(s.battle, 'attacker-0');
    // …ya anduvo: está en su casilla, con su `move` en el registro y sin cruce.
    expect(jinete.hex).toEqual(from);
    const tramo = s.battle.log.at(-1);
    expect(tramo).toMatchObject({ kind: 'move', stack: 'attacker-0', to: from });
    expect(s.battle.log.slice(largo)).toEqual([tramo]);
    // La carga de la carrera va en el `move` y en el golpe plantado.
    expect(tramo).toMatchObject({ charge: true });
    expect(s.battle.golpeEnCurso).toEqual({ stack: 'attacker-0', target: 'defender-0', carga: 5 });
    // …y la rueda enseña las cifras de antes de andar, con la carga.
    expect(s.ruedaPendiente?.prevision).toEqual(antesDeAndar);
    const antes = s.battle.log.length;
    s.elegirEnLaRueda('fuerte');
    // Tras la rueda: el cruce y el golpe, sin otro paso.
    expect(s.battle.log[antes]).toMatchObject({
      kind: 'cruce',
      stack: 'attacker-0',
      golpe: 'fuerte',
    });
    expect(s.battle.golpeEnCurso).toBeNull();
    const golpe = s.battle.log.slice(antes).find((e) => e.kind === 'attack' && !e.retaliation);
    expect(golpe).toMatchObject({ kind: 'attack', stack: 'attacker-0', charge: 5 });
  });

  it('Escape tras andar: la unidad se queda donde llegó, con su turno y sin la carga', () => {
    const { s, ataque } = jineteALaCarga();
    s.playBattleAction(ataque);
    expect(s.battle.golpeEnCurso?.carga).toBe(5);
    const largo = s.battle.log.length;
    const n = s.battle.turno?.n;
    expect(s.cancelarGolpe()).toBe(true);
    expect(s.status).toBe('Golpe cancelado.');
    expect(s.ruedaPendiente).toBeNull();
    expect(s.battle.golpeEnCurso).toBeNull();
    // Nada nuevo en el registro: ni vuelve atrás ni golpea.
    expect(s.battle.log.length).toBe(largo);
    expect(stackById(s.battle, 'attacker-0').hex).toEqual(ataque.from);
    // Su turno sigue: puede golpear desde ahí (ya sin carrera), no defenderse ni esperar.
    expect(s.turnoPropio?.stack.id).toBe('attacker-0');
    expect(s.battle.turno?.n).toBe(n);
    const legales = s.battleLegalActions();
    expect(legales).toContainEqual({ type: 'attack', target: ataque.target });
    expect(legales.some((a) => a.type === 'defend' || a.type === 'wait')).toBe(false);
    // Volver a golpear abre la rueda sin andar; el golpe, sin carga.
    s.playBattleAction({ type: 'attack', target: ataque.target });
    expect(s.battle.log.length).toBe(largo);
    expect(s.battle.golpeEnCurso).toMatchObject({ carga: 0 });
    s.elegirEnLaRueda('normal');
    const golpe = s.battle.log.slice(largo).find((e) => e.kind === 'attack' && !e.retaliation);
    expect(golpe?.kind === 'attack' && golpe.charge).toBeFalsy();
  });

  it('IA contra Yo: la IA se para en la respuesta, sin dejar ver su golpe', () => {
    const s = sesion({ ids: [PIQUERO], ia: false }, { ids: [JINETE_DE_LA_IA], ia: true }, 2);
    hastaLaRueda(s, false);
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('la rueda no pide la respuesta');
    expect(p.fase).toBe('respuesta');
    expect(p.bando).toBe('attacker');
    expect(p.atacante.side).toBe('defender');
    // La IA ya anduvo: está plantada ante su objetivo, y aún no hay cruce.
    expect(s.battle.golpeEnCurso).toMatchObject({ stack: p.atacante.id, target: p.objetivo.id });
    expect(hexDistance(p.atacante.hex, p.objetivo.hex)).toBe(1);
    // Ni un campo con el golpe guardado: la elección es a ciegas.
    expect(JSON.stringify(p)).not.toMatch(/"golpe":/);
    // Con la rueda a medias no se juega otra cosa, ni se retocan cifras, ni se cancela.
    const largo = s.battle.log.length;
    s.playBattleAction({ type: 'defend' });
    expect(s.status).toBe('Elige antes en la rueda del golpe.');
    expect(s.retocar({ kind: 'piezas', piezas: [] })).toBe('Elige antes en la rueda del golpe.');
    expect(s.cancelarGolpe()).toBe(false);
    s.elegirEnLaRueda('patada');
    expect(s.status).toContain('«patada» no es un tipo de golpe');
    expect(s.battle.log.length).toBe(largo);
    s.elegirEnLaRueda('defensivo');
    // Respondido: el cruce y el golpe, sin que la IA ande más.
    expect(s.battle.log[largo]).toMatchObject({
      kind: 'cruce',
      stack: 'defender-0',
      respuesta: 'defensivo',
    });
    expect(s.battle.golpeEnCurso).toBeNull();
  });

  it('Yo contra Yo: el golpe y luego la respuesta del otro bando, que no lo ve', () => {
    const s = sesion({ ids: [JINETE], ia: false }, { ids: [PIQUERO], ia: false });
    hastaLaRueda(s, true);
    const golpe = s.ruedaPendiente;
    expect(golpe?.fase).toBe('golpe');
    const quien = golpe?.bando;
    // Ya plantado: las dos fases esperan con quien pega en su casilla.
    const plantado = s.battle.golpeEnCurso;
    expect(plantado).not.toBeNull();
    const donde = { ...golpe!.atacante.hex };
    const largo = s.battle.log.length;
    s.elegirEnLaRueda('rapido');
    const respuesta = s.ruedaPendiente;
    expect(respuesta?.fase).toBe('respuesta');
    expect(respuesta?.bando).not.toBe(quien);
    expect(JSON.stringify(respuesta)).not.toMatch(/"golpe":/);
    expect(s.battle.log.some((e) => e.kind === 'cruce')).toBe(false);
    expect(s.battle.log.length).toBe(largo);
    expect(s.battle.golpeEnCurso).toBe(plantado);
    s.elegirEnLaRueda('rapido');
    expect(s.battle.log[largo]).toMatchObject({
      kind: 'cruce',
      golpe: 'rapido',
      respuesta: 'rapido',
      punto: 0,
    });
    expect(golpe!.atacante.hex).toEqual(donde);
  });

  it('mientras gira la rueda, el tablero enseña la vida y quién actúa de antes del golpe (H2 y H6 de QA)', () => {
    // Yo contra IA (el golpe se da al elegir) e IA contra Yo (al responder).
    for (const [s, fase] of [
      [sesion({ ids: [JINETE], ia: false }, { ids: [PIQUERO], ia: true }), 'golpe'],
      [sesion({ ids: [PIQUERO], ia: false }, { ids: [JINETE_DE_LA_IA], ia: true }, 2), 'respuesta'],
    ] as const) {
      hastaLaRueda(s, fase === 'golpe', fase);
      const p = s.ruedaPendiente;
      if (p === null) throw new Error(`la rueda no pide ${fase}`);
      // El animador ya ha contado todo lo de antes: la rueda solo se abre con la cola vacía.
      const a = new BattleAnimator();
      a.observe(s.battle);
      a.tick(0);
      const antes = new Map(s.battle.stacks.map((x) => [x.id, stackHp(x)]));
      const salida = { ...p.atacante.hex };
      const largo = s.battle.log.length;
      s.elegirEnLaRueda('fuerte');
      expect(s.battle.log[largo]?.kind).toBe('cruce');
      a.observe(s.battle);
      a.tick(0);
      a.tick(DURACION.cruce / 2);
      expect(a.cruceEnCurso()?.evento).toBe(s.battle.log[largo]);
      // El estado ya va por delante: el golpe quitó vida.
      expect(stackHp(stackById(s.battle, p.objetivo.id))).toBeLessThan(
        antes.get(p.objetivo.id) as number,
      );
      // El tablero, no: la vida de cada uno, el aro en quien pega y su casilla de salida.
      for (const x of s.battle.stacks) expect(a.figura(x).pv, x.id).toBe(antes.get(x.id));
      expect(a.activo(s.battle)).toBe(p.atacante.id);
      expect(a.figura(stackById(s.battle, p.atacante.id)).casilla).toEqual(salida);
      // Contado todo, el tablero es el estado.
      for (let t = DURACION.cruce / 2; a.busy; t += 16) a.tick(t);
      for (const x of s.battle.stacks) expect(a.figura(x).pv, x.id).toBe(stackHp(x));
      expect(a.activo(s.battle)).toBe(s.battle.turno?.stack ?? null);
    }
  });

  it('con todo en IA, la barra baja golpe a golpe: empieza en la de salida, no se mueve mientras gira la rueda y acaba en la del estado (H6 de QA)', () => {
    // Como la arena: el animador mira el tablero de salida antes de que la IA juegue.
    const s = new SesionDeArena(
      {
        izquierda: {
          unidades: [PIQUERO, 'templario-escudo'].map(deLaArena),
          heroe: null,
          ia: true,
        },
        derecha: {
          unidades: ['esqueleto-guerrero', SIN_RESPUESTA()].map(deLaArena),
          heroe: null,
          ia: true,
        },
        reglas: REGLAS_DEL_JUEGO,
        piezas: [],
        golpe: 'rueda',
      },
      5,
    );
    const a = new BattleAnimator();
    a.observe(s.battle);
    a.tick(0);
    const salida = new Map(s.battle.stacks.map((x) => [x.id, stackHp(x)]));
    s.empezar();
    expect(s.battle.finished).not.toBeNull();
    a.observe(s.battle);
    a.tick(0);
    // Al empezar, la vida de salida, no la del final de la pelea (que ya está en el estado).
    for (const x of s.battle.stacks) expect(a.figura(x).pv, x.id).toBe(salida.get(x.id));
    expect(s.battle.stacks.some((x) => stackHp(x) < (salida.get(x.id) as number))).toBe(true);
    // Fotograma a fotograma: nadie cura en este montaje, así que la barra solo baja; y
    // mientras gira una rueda no baja ninguna, y el aro es de quien pega.
    let previa = new Map(salida);
    let cruces = 0;
    let bajadas = 0;
    let ultimoCruce: unknown = null;
    for (let t = 16; a.busy; t += 16) {
      a.tick(t);
      const cruce = a.cruceEnCurso();
      const ahora = new Map(s.battle.stacks.map((x) => [x.id, a.figura(x).pv]));
      for (const [id, pv] of ahora) {
        const antes = previa.get(id) as number;
        expect(pv, `${id} a los ${t} ms`).toBeLessThanOrEqual(antes);
        if (pv < antes) {
          bajadas++;
          // Dentro de un cruce no hay impacto: solo en el fotograma en que empieza,
          // si el paso anterior acabó en él (y su impacto ya se contó antes).
          if (cruce !== null && cruce.evento === ultimoCruce) {
            throw new Error(`la barra de ${id} baja con la rueda girando (${t} ms)`);
          }
        }
      }
      if (cruce !== null) {
        if (cruce.evento !== ultimoCruce) cruces++;
        expect(a.activo(s.battle)).toBe(cruce.evento.stack);
      }
      ultimoCruce = cruce?.evento ?? null;
      previa = ahora;
    }
    expect(cruces).toBe(s.battle.log.filter((e) => e.kind === 'cruce').length);
    expect(bajadas).toBeGreaterThan(cruces);
    // Contado todo, la del estado.
    for (const x of s.battle.stacks) expect(a.figura(x).pv, x.id).toBe(stackHp(x));
  });

  it('con la rueda pidiendo la respuesta, la barra y el panel dicen que te toca responder (H3 de QA)', () => {
    const s = sesion({ ids: [PIQUERO], ia: false }, { ids: [JINETE_DE_LA_IA], ia: true }, 2);
    hastaLaRueda(s, false);
    expect(s.ruedaPendiente?.fase).toBe('respuesta');
    // La activa es de la IA, que es quien pega.
    expect(s.turnoPropio).toBeNull();
    expect(rotuloDelTurno(s, false)).toBe('Te toca responder');
    const panel = marcadoDe(renderPanelDeBatalla(s, false));
    expect(panel).toContain('Te toca responder en la rueda.');
    expect(panel).not.toContain('Mueve la IA');
    // Mientras se cuenta, nada se adelanta; respondido, vuelve lo de siempre.
    expect(rotuloDelTurno(s, true)).toBe('Contando…');
    s.elegirEnLaRueda('normal');
    if (s.ruedaPendiente === null && s.battle.finished === null) {
      expect(rotuloDelTurno(s, false)).toBe(s.turnoPropio === null ? 'Mueve la IA' : 'Te toca');
    }
  });

  it('con todo en IA la pelea se juega entera, y es la misma con la misma semilla', () => {
    const todo = (semilla: number): BattleState =>
      sesion(
        { ids: [PIQUERO, 'templario-escudo'], ia: true },
        { ids: ['esqueleto-guerrero', SIN_RESPUESTA()], ia: true },
        semilla,
      ).battle;
    const a = todo(5);
    expect(a.finished).not.toBeNull();
    expect(a.log.some((e) => e.kind === 'cruce')).toBe(true);
    expect(JSON.stringify(todo(5).log)).toBe(JSON.stringify(a.log));
  });
});

describe('la rueda pintada', () => {
  it('para elegir: siete sectores con su tecla y su daño, y en la respuesta, nada del golpe', () => {
    const s = sesion({ ids: [JINETE], ia: false }, { ids: [PIQUERO], ia: false });
    hastaLaRueda(s, true);
    s.elegirEnLaRueda('fuerte');
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('la rueda no pide la respuesta');
    const m = marcadoDe(renderEleccion(s.battle, p));
    expect(m.match(/data-golpe="/g)).toHaveLength(7);
    for (const [i, t] of TIPOS_DE_GOLPE.entries()) {
      expect(m).toContain(`data-golpe="${t}" aria-label="`);
      expect(m).toContain(`aria-keyshortcuts="${i + 1}"`);
    }
    expect(m).toContain('data-fase="respuesta"');
    expect(m).not.toMatch(/data-elegido="(?:golpe|respuesta|los-dos)"/);
  });

  it('cada nota dice cuándo actúa su efecto: en la respuesta, nada para el golpe que llega, que decide el cruce (H4 y H7 de QA)', () => {
    // Quien responde elige su contraataque: ninguna nota promete cambiar el golpe
    // que recibe, y cada una dice que ese golpe lo decide el cruce (H7: «No cambia
    // este golpe» se leía como que daba igual qué elegir).
    expect(efectoDeGolpe('defensivo', 'respuesta')).toBe(
      'Su efecto no toca el golpe que recibes (ese lo decide el cruce): +1 defensa desde tu contraataque hasta que termine tu próximo turno.',
    );
    for (const t of TIPOS_DE_GOLPE) {
      const nota = efectoDeGolpe(t, 'respuesta');
      expect(nota, t).toMatch(
        t === 'normal'
          ? /el cruce cae en el medio, y tu contraataque también/
          : /^Su efecto no toca el golpe que recibes \(ese lo decide el cruce\): /,
      );
      expect(nota, t).toMatch(/contraata/);
      // El doble golpe no dobla el contraataque (`golpesDe`): la respuesta no lo promete.
      expect(nota, t).not.toContain('doble golpe');
    }
    // Al pegar, Defensivo sí cubre ya el contraataque, y lo que se cuelga al rival
    // dice que no toca este intercambio.
    expect(efectoDeGolpe('defensivo', 'golpe')).toContain('cubre el contraataque de ahora');
    for (const t of ['romperGuardia', 'finta'] as const) {
      expect(efectoDeGolpe(t, 'golpe')).toContain('no toca este golpe ni su contraataque');
      expect(efectoDeGolpe(t, 'golpe')).toContain('hasta que termine su próximo turno');
    }
    // Las cifras siguen saliendo del JSON: Fuerte en las dos fases.
    expect(efectoDeGolpe('fuerte', 'golpe')).toBe('Daño ×1,25.');
    expect(efectoDeGolpe('fuerte', 'respuesta')).toContain('daño ×1,25');
    // Y la rueda pinta la de su fase: en la respuesta, la de la respuesta.
    const s = sesion({ ids: [JINETE], ia: false }, { ids: [PIQUERO], ia: false });
    hastaLaRueda(s, true);
    const golpe = s.ruedaPendiente;
    if (golpe === null) throw new Error('la rueda no pide el golpe');
    const enElGolpe = marcadoDe(renderEleccion(s.battle, golpe));
    expect(enElGolpe).toContain('cubre el contraataque de ahora');
    expect(enElGolpe).not.toContain('Su efecto no toca el golpe que recibes');
    s.elegirEnLaRueda('fuerte');
    const respuesta = s.ruedaPendiente;
    if (respuesta === null) throw new Error('la rueda no pide la respuesta');
    const enLaRespuesta = marcadoDe(renderEleccion(s.battle, respuesta));
    expect(enLaRespuesta).toContain('(ese lo decide el cruce): +1 defensa desde tu contraataque');
    expect(enLaRespuesta).not.toContain('cubre el contraataque de ahora');
  });

  it('sin contraataque, la nota de la respuesta dice solo lo que vale: el cruce, sin prometer un contraataque (H7 de QA)', () => {
    // El vampiro no recibe contraataques (`no_retaliation`): quien responde solo elige el cruce.
    const s = sesion({ ids: [PIQUERO], ia: false }, { ids: [SIN_RESPUESTA()], ia: true }, 1);
    hastaLaRueda(s, false, 'respuesta');
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('el vampiro no llega a pedir la respuesta');
    expect(p.prevision.sinContraataque).not.toBeNull();
    for (const t of TIPOS_DE_GOLPE) {
      const nota = efectoDeGolpe(t, 'respuesta', false);
      expect(nota, t).toMatch(/^Esta vez no devuelves el golpe/);
      expect(nota, t).toContain('solo cuenta para el cruce');
      // Ni «contraatacas», ni «tu contraataque», ni un efecto que no va a actuar.
      expect(nota, t).not.toMatch(/contraata|ataque al|defensa|daño ×/);
    }
    // La rueda pinta esas, en la nota y en la etiqueta de cada sector.
    const m = marcadoDe(renderEleccion(s.battle, p));
    expect(m).not.toContain('contraatacas');
    expect(m).not.toContain('tu contraataque');
    expect(m.match(/Esta vez no devuelves el golpe/g)?.length).toBe(2 * TIPOS_DE_GOLPE.length);
  });

  it('el desenlace: los dos elegidos, el rótulo, el medidor y los tramos en orden', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    applyAction(b, golpear('romperGuardia', 'finta'), rng);
    const i = b.log.findIndex((e) => e.kind === 'cruce');
    const e = b.log[i];
    if (e?.kind !== 'cruce') throw new Error('sin cruce');
    const m = marcadoDe(renderDesenlace(b, e, contraataqueDelCruce(b.log, i)));
    expect(m).toContain('Romper guardia contra Finta');
    expect(m).toContain('data-sector="romperGuardia" data-elegido="golpe"');
    expect(m).toContain('data-sector="finta" data-elegido="respuesta"');
    expect(m).toContain('¡Alto!');
    expect(m).toContain('aria-label="Golpe en el alto, contraataque en el bajo"');
    expect([0, 0.4, 0.5, 0.99].map(tramosDelDesenlace)).toEqual([
      'giro',
      'giro marcas',
      'giro marcas arco',
      'giro marcas arco rotulo',
    ]);
  });
});

describe('el interruptor del montaje', () => {
  it('«Golpe: azar / rueda», con el modo encendido y lo que hace', () => {
    const azar = marcadoDe(renderGolpe('azar'));
    expect(azar).toContain('<h3>Golpe · al azar</h3>');
    expect(azar).toContain('data-modo="azar" class="primary"');
    const rueda = marcadoDe(renderGolpe('rueda'));
    expect(rueda).toContain('data-modo="rueda" class="primary"');
    expect(rueda).toContain('data-golpe-del-montaje="rueda"');
  });
});
