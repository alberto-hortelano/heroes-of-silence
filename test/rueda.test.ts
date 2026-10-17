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
import { renderModo, renderPanelDeBatalla, rotuloDelTurno } from '../src/client/arena/paneles.js';
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
  firmaDelTurno,
  legalActions,
  movableFrom,
  movimientoBlocker,
  pasosQueQuedan,
  previsionDe,
  previsionDeLaRueda,
  soltarElGolpe,
  stackById,
} from '../src/core/battle/battle.js';
import { hexDistance, hexKey } from '../src/core/battle/board.js';
import { fraseDelContacto } from '../src/core/battle/contacto.js';
import { effectiveAttack, effectiveDefense, stackHp } from '../src/core/battle/damage.js';
import { GOLPE, MODOS_DEL_JUEGO, modoALaURL, modoDeLaURL } from '../src/core/battle/modos.js';
import { claveDeAbiertas } from '../src/core/battle/muralla.js';
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
  puntoDelContraataque,
  puntoDelCruce,
  TIPOS_DE_GOLPE,
  type TipoDeGolpe,
  tiradaDelPunto,
  validarRueda,
} from '../src/core/battle/rueda.js';
import type {
  BattleAction,
  BattleEvent,
  BattleState,
  TurnoDeUnidad,
} from '../src/core/battle/types.js';
import { creature } from '../src/core/data.js';
import { createRng, type Rng, sortearPorPesos } from '../src/core/rng.js';
import type { Stack, UnitInfo } from '../src/core/types.js';
import { bando } from './batalla-de-prueba.js';
import { delBorrador, hastaLaRueda, sesionDeArena, unidadDeArena } from './helpers.js';

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
    { modos: { ...MODOS_DEL_JUEGO, golpe: 'rueda' } },
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

describe('el cruce: el anillo de la petición (#263, 14-10-2026)', () => {
  it('el anillo nuevo: Ofensivo arriba, Fuerte, Finta, Defensivo, Rápido y R. guardia, y Normal en el centro', () => {
    //           Ofensivo
    // R. Guardia        Fuerte
    //           Normal
    // Rápido            Finta
    //          Defensivo
    expect(ANILLO).toEqual(['ofensivo', 'fuerte', 'finta', 'defensivo', 'rapido', 'romperGuardia']);
    // Las teclas, del 1 al 7, en ese orden y Normal al final.
    expect(TIPOS_DE_GOLPE).toEqual([...ANILLO, 'normal']);
  });

  it('la tabla entera: cada tipo contra cada uno (columnas en el orden de las teclas)', () => {
    // Por la distancia en el anillo: igual 0, al lado 1, a dos 3, enfrente 4; con Normal, 2.
    const tabla: Record<TipoDeGolpe, readonly number[]> = {
      //              O  F  Fi D  R  RG N
      ofensivo: /*  */ [0, 1, 3, 4, 3, 1, 2],
      fuerte: /*    */ [1, 0, 1, 3, 4, 3, 2],
      finta: /*     */ [3, 1, 0, 1, 3, 4, 2],
      defensivo: /* */ [4, 3, 1, 0, 1, 3, 2],
      rapido: /*    */ [3, 4, 3, 1, 0, 1, 2],
      romperGuardia: [1, 3, 4, 3, 1, 0, 2],
      normal: /*    */ [2, 2, 2, 2, 2, 2, 2],
    };
    for (const a of TIPOS_DE_GOLPE) {
      expect(
        TIPOS_DE_GOLPE.map((b) => puntoDelCruce(a, b)),
        a,
      ).toEqual(tabla[a]);
    }
    // Los opuestos de la petición, en el máximo.
    expect(puntoDelCruce('ofensivo', 'defensivo')).toBe(4);
    expect(puntoDelCruce('fuerte', 'rapido')).toBe(4);
    expect(puntoDelCruce('finta', 'romperGuardia')).toBe(4);
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
    expect(modoDeLaURL(GOLPE, null)).toBe('azar');
    expect(modoDeLaURL(GOLPE, '')).toBe('azar');
    expect(modoDeLaURL(GOLPE, 'rueda')).toBe('rueda');
    expect(() => modoDeLaURL(GOLPE, 'ruleta')).toThrow(
      '«ruleta» no es un modo del golpe; valen azar, rueda',
    );
    expect(modoALaURL(GOLPE, 'azar')).toBe('');
    expect(modoALaURL(GOLPE, 'rueda')).toBe('rueda');
    // Repetido, como cualquier parámetro de la pelea: se dice.
    expect(() => unaVezEnLaURL(['rueda', 'azar'], 'golpe')).toThrow('«golpe» va 2 veces');
  });

  it('el juego pelea al azar: `createBattle` no deja elegir', () => {
    const rng = createRng(1);
    const b = createBattle(bando(piqueros(1)), bando(piqueros(1)), rng);
    expect(b.arena).toBe(MODOS_DEL_JUEGO);
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
    ).toThrow('«patada» no es un tipo de golpe; valen ofensivo, fuerte, finta');
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
    // Romper guardia quita ataque, una cifra por éxito; la Finta resta casillas.
    type PorExito = Record<string, number>;
    const romper = (j: Record<string, unknown>): PorExito =>
      (j.romperGuardia as { ataque: PorExito }).ataque;
    const finta = (j: Record<string, unknown>): PorExito =>
      (j.finta as { casillas: PorExito }).casillas;
    expect(validarRueda(ruedaJson).romperGuardia.ataque).toEqual({
      0: 0,
      1: 0,
      2: -1,
      3: -2,
      4: -3,
    });
    expect(validarRueda(ruedaJson).finta.casillas).toEqual({ 0: 5, 1: 4, 2: 3, 3: 2, 4: 1 });
    expect(con((j) => (romper(j).alto = 1))).toThrow(
      'data/rueda.json: romperGuardia.ataque: el éxito «alto» quita, así que es 0 o menos, y es 1',
    );
    expect(con((j) => delete romper(j).medio)).toThrow(
      'data/rueda.json: romperGuardia.ataque: falta el éxito «medio»',
    );
    expect(con((j) => (finta(j).bajo = -1))).toThrow(
      'data/rueda.json: finta.casillas: el éxito «bajo» tiene que ser 0 o más, y es -1',
    );
    expect(con((j) => (finta(j).enorme = 1))).toThrow(
      'data/rueda.json: finta.casillas: «enorme» no es un campo; valen minimo, bajo, medio, alto, maximo',
    );
    // Lo de antes (Romper guardia quitaba defensa; Finta, ataque) ya no entra.
    expect(con((j) => (j.romperGuardia = { defensa: -1 }))).toThrow(
      'data/rueda.json: romperGuardia: «defensa» no es un campo; valen ataque',
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
    // Ofensivo contra Finta, a dos en el anillo: alto (37).
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    applyAction(b, golpear('ofensivo', 'finta'), rng);
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
      { modos: { ...MODOS_DEL_JUEGO, golpe: 'rueda' } },
    );
    const c = contando(rng);
    b.turno = { n: 50, stack: 'attacker-0', gastado: 0 };
    applyAction(b, { type: 'shoot', target: 'defender-0' }, c.rng);
    expect(c.ints()).toBe(1);
    expect(b.log.some((e) => e.kind === 'cruce')).toBe(false);
  });
});

describe('los efectos del golpe (#263): Defensivo hasta que empiece su turno, Romper guardia por éxito', () => {
  it('Defensivo cubre ya el contraataque: 35 × 8 × 0,875 = 245, hasta que empiece su próximo turno', () => {
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
      expect.objectContaining({ kind: 'effect', source: 'defensivo', vence: 'empezar' }),
    );
    // Sigue en el turno del rival (le cubre si le golpea), y se va al empezar el
    // suyo: antes de que juegue, y aunque luego espere.
    expect(activeStack(b)?.id).toBe('defender-0');
    expect(effectiveDefense(yo, REGLAS_DEL_JUEGO)).toBe(10);
    const largo = b.log.length;
    applyAction(b, { type: 'defend' }, rng);
    expect(activeStack(b)?.id).toBe('attacker-0');
    expect(yo.effects).toEqual([]);
    expect(b.log.slice(largo)).toContainEqual({
      kind: 'effect_end',
      stack: 'attacker-0',
      source: 'defensivo',
    });
    applyAction(b, { type: 'wait' }, rng);
    expect(yo.effects).toEqual([]);
  });

  it('Defensivo se va al empezar el turno extra de la moral alta', () => {
    // La primera semilla en que la moral (+3) le regala otro turno tras el golpe.
    for (let semilla = 1; semilla <= 200; semilla++) {
      const { b, rng } = enRueda(piqueros(10), piqueros(10), { semilla });
      const yo = stackById(b, 'attacker-0');
      yo.morale = 3;
      const largo = b.log.length;
      applyAction(b, golpear('defensivo', 'normal'), rng);
      const extra = b.log
        .slice(largo)
        .findIndex((e) => e.kind === 'morale' && e.stack === 'attacker-0' && e.good);
      if (extra < 0) continue;
      expect(activeStack(b)?.id).toBe('attacker-0');
      expect(yo.effects).toEqual([]);
      // Se dice detrás de la moral: al abrirse el turno extra.
      expect(b.log.slice(largo + extra)).toContainEqual({
        kind: 'effect_end',
        stack: 'attacker-0',
        source: 'defensivo',
      });
      return;
    }
    throw new Error('en 200 semillas la moral alta no regala nunca un turno');
  });

  it('Defensivo se va también si la moral baja le quita el turno: el turno empieza y se pierde', () => {
    for (let semilla = 1; semilla <= 200; semilla++) {
      const { b, rng } = enRueda(piqueros(10), piqueros(10), {
        semilla,
        reglas: reglasDeLaURL('moralBaja'),
      });
      applyAction(b, golpear('defensivo', 'normal'), rng);
      const yo = stackById(b, 'attacker-0');
      yo.morale = -3;
      const largo = b.log.length;
      applyAction(b, { type: 'defend' }, rng);
      const paralizado = b.log
        .slice(largo)
        .findIndex((e) => e.kind === 'morale' && e.stack === 'attacker-0' && !e.good);
      if (paralizado < 0) continue;
      expect(yo.effects).toEqual([]);
      expect(b.log[largo + paralizado + 1]).toEqual({
        kind: 'effect_end',
        stack: 'attacker-0',
        source: 'defensivo',
      });
      return;
    }
    throw new Error('en 200 semillas la moral baja no salta nunca el turno del atacante');
  });

  /**
   * Romper guardia en los cinco éxitos (piqueros: A 5, D 9; daño 30-40; 150 PV).
   * El golpe en el punto p: 30/32/35/37/40 × 10 × 0,9 = 270/288/315/333/360. Le quita
   * al atacado 0/0/1/2/3 de ataque ya en su contraataque, que cae en 4 − p:
   * - p 4: 1 140 PV, 8 piqueros; 30 × 8 × (1 − 0,025 × 7 = 0,825) = 198;
   * - p 3: 1 167 PV, 8; 32 × 8 × 0,85 = 217,6 → 218;
   * - p 2: 1 185 PV, 8; 35 × 8 × 0,875 = 245;
   * - p 1: 1 212 PV, 9; 37 × 9 × 0,9 = 299,7 → 300 (la respuesta Ofensivo no suma);
   * - p 0: 1 230 PV, 9; 40 × 9 × 0,9 = 324.
   * Las respuestas no cambian el contraataque (ni Fuerte ni Rápido).
   */
  const CINCO: readonly (readonly [TipoDeGolpe, number, number, number, number])[] = [
    // respuesta, punto, ataque del atacado, golpe, contraataque
    ['finta', 4, 2, 360, 198],
    ['defensivo', 3, 3, 333, 218],
    ['normal', 2, 4, 315, 245],
    ['ofensivo', 1, 5, 288, 300],
    ['romperGuardia', 0, 5, 270, 324],
  ];

  it('Romper guardia quita ataque según el éxito, ya en el contraataque: −3, −2, −1, 0 y 0', () => {
    for (const [respuesta, punto, ataque, golpe, contra] of CINCO) {
      const que = `Romper guardia contra ${respuesta}`;
      const { b, rng } = enRueda(piqueros(10), piqueros(10));
      applyAction(b, golpear('romperGuardia', respuesta), rng);
      const el = stackById(b, 'defender-0');
      expect(
        b.log.find((e) => e.kind === 'cruce'),
        que,
      ).toMatchObject({ punto });
      expect(effectiveAttack(el), que).toBe(ataque);
      expect(
        ataques(b).map((a) => [a.stack, a.damage]),
        que,
      ).toEqual([
        ['attacker-0', golpe],
        ['defender-0', contra],
      ]);
      // Con 0 no se cuelga nada; si no, entre el golpe y el contraataque, con su duración.
      const efectos = b.log.flatMap((e, i) => (e.kind === 'effect' ? [{ e, i }] : []));
      if (ataque === 5) {
        expect(efectos, que).toEqual([]);
        expect(el.effects, que).toEqual([]);
        continue;
      }
      expect(
        efectos.map((x) => x.e),
        que,
      ).toEqual([
        {
          kind: 'effect',
          stack: 'defender-0',
          effect: 'attack',
          amount: ataque - 5,
          source: 'romperGuardia',
          rounds: 2,
          vence: 'terminar',
        },
      ]);
      const [golpeI, contraI] = b.log.flatMap((e, i) => (e.kind === 'attack' ? [i] : []));
      const i = efectos[0]?.i ?? -1;
      expect(golpeI !== undefined && i > golpeI && contraI !== undefined && i < contraI, que).toBe(
        true,
      );
      // Quien pega, nada.
      expect(stackById(b, 'attacker-0').effects, que).toEqual([]);
    }
  });

  it('Romper guardia sigue en el próximo turno del atacado y se va al terminarlo', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    applyAction(b, golpear('romperGuardia', 'defensivo'), rng);
    const el = stackById(b, 'defender-0');
    // Su turno: con −2 (ataca con 3).
    expect(activeStack(b)?.id).toBe('defender-0');
    expect(effectiveAttack(el)).toBe(3);
    // Esperar no lo quita (no cierra el turno).
    applyAction(b, { type: 'wait' }, rng);
    expect(effectiveAttack(el)).toBe(3);
    // Esperó el último: vuelve a él, y al cerrar ese turno se va, y lo dice.
    expect(activeStack(b)?.id).toBe('defender-0');
    const largo = b.log.length;
    applyAction(b, { type: 'end_turn' }, rng);
    expect(el.effects).toEqual([]);
    expect(effectiveAttack(el)).toBe(5);
    expect(b.log.slice(largo)).toContainEqual({
      kind: 'effect_end',
      stack: 'defender-0',
      source: 'romperGuardia',
    });
  });

  it('dos Romper guardia seguidos refrescan, no se suman: queda el último', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    applyAction(b, golpear('romperGuardia', 'normal'), rng);
    const el = stackById(b, 'defender-0');
    expect(effectiveAttack(el)).toBe(4);
    // Otro turno del atacante (a mano), y otro Romper guardia con éxito máximo.
    b.turno = { n: 50, stack: 'attacker-0', gastado: 0 };
    applyAction(b, golpear('romperGuardia', 'finta'), rng);
    expect(el.effects).toEqual([
      expect.objectContaining({
        kind: 'attack',
        amount: -3,
        source: 'romperGuardia',
        hasta: { turno: 50, al: 'terminar' },
      }),
    ]);
    expect(effectiveAttack(el)).toBe(2);
  });

  it('sin contraataque, Romper guardia quita ataque igual: para su próximo turno', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    stackById(b, 'defender-0').retaliated = true;
    applyAction(b, golpear('romperGuardia', 'finta'), rng);
    expect(ataques(b).filter((a) => a.retaliation)).toEqual([]);
    expect(effectiveAttack(stackById(b, 'defender-0'))).toBe(2);
  });

  it('si su turno no llega (la moral baja lo salta), lo quita el tope de dos rondas', () => {
    // La primera semilla en la que el defensor, con moral −3 y la regla de fheroes2
    // (3/12), pierde su turno: deterministas, cada una con su `Rng`.
    for (let semilla = 1; semilla <= 200; semilla++) {
      const { b, rng } = enRueda(piqueros(10), piqueros(10), {
        semilla,
        reglas: reglasDeLaURL('moralBaja'),
      });
      const el = stackById(b, 'defender-0');
      el.morale = -3;
      applyAction(b, golpear('romperGuardia', 'finta'), rng);
      // Hasta la ronda 3 juega solo el atacante (se defiende): el defensor pierde
      // por la moral todos sus turnos. Si alguno le llega, otra semilla.
      let saltados = true;
      while (b.finished === null && b.round < 3) {
        if (activeStack(b)?.id !== 'attacker-0') {
          saltados = false;
          break;
        }
        expect(el.effects.map((e) => e.source)).toEqual(['romperGuardia']);
        applyAction(b, { type: 'defend' }, rng);
      }
      if (!saltados || b.round !== 3) continue;
      // Ronda 3: caduca al empezar, aunque su turno no haya llegado.
      expect(el.effects).toEqual([]);
      return;
    }
    throw new Error('en 200 semillas la moral baja no salta nunca dos turnos del defensor');
  });
});

describe('la respuesta no da bonificadores (#263): solo Fuerte y Rápido cambian el contraataque', () => {
  // Golpe Normal: 35 × 10 × 0,9 = 315; quedan 1 185 PV, 8 piqueros. El
  // contraataque en el medio: 35 × 8 × 0,9 = 252.
  it('Ofensivo, Defensivo, Finta y Romper guardia: 252, ni ataque ni defensa de más, ni un efecto', () => {
    for (const respuesta of ['ofensivo', 'defensivo', 'finta', 'romperGuardia'] as const) {
      const { b, rng } = enRueda(piqueros(10), piqueros(10));
      applyAction(b, golpear('normal', respuesta), rng);
      expect(
        ataques(b).map((a) => a.damage),
        respuesta,
      ).toEqual([315, 252]);
      expect(
        b.log.filter((e) => e.kind === 'effect'),
        respuesta,
      ).toEqual([]);
      for (const x of b.stacks) {
        expect(x.effects, `${respuesta}: ${x.id}`).toEqual([]);
        expect(effectiveAttack(x), `${respuesta}: ${x.id}`).toBe(5);
        expect(effectiveDefense(x, REGLAS_DEL_JUEGO), `${respuesta}: ${x.id}`).toBe(9);
      }
      // La Finta de quien responde no le abre nada a nadie: el turno pasa.
      expect(activeStack(b)?.id, respuesta).toBe('defender-0');
      expect(b.turno?.finta, respuesta).toBeUndefined();
    }
  });

  it('Fuerte: 35 × 8 × 0,9 × 1,25 = 315; Rápido: dos de 35 × 8 × 0,9 × 0,6 = 151,2 → 151', () => {
    const fuerte = enRueda(piqueros(10), piqueros(10));
    applyAction(fuerte.b, golpear('normal', 'fuerte'), fuerte.rng);
    expect(ataques(fuerte.b).map((a) => a.damage)).toEqual([315, 315]);
    const rapido = enRueda(piqueros(10), piqueros(10));
    applyAction(rapido.b, golpear('normal', 'rapido'), rapido.rng);
    expect(ataques(rapido.b).map((a) => [a.damage, a.retaliation])).toEqual([
      [315, false],
      [151, true],
      [151, true],
    ]);
  });
});

describe('la Finta deja andar después de golpear (#263)', () => {
  /**
   * Golpea con Finta contra `respuesta` tras haber andado `andado` casillas (a
   * mano). El piquero anda 4; con una Prisa de +2 puesta a mano, 6, el ejemplo
   * del usuario. Devuelve el turno del golpe, que sigue diciendo lo que restó la
   * Finta aunque se haya cerrado.
   */
  function conFinta(
    respuesta: TipoDeGolpe,
    andado = 0,
  ): { b: BattleState; rng: Rng; turno: TurnoDeUnidad } {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    const yo = stackById(b, 'attacker-0');
    yo.effects = [{ kind: 'speed', amount: 2, source: 'haste', roundsLeft: 5 }];
    expect(pasosQueQuedan(b, yo)).toBe(6);
    const turno = b.turno;
    if (turno === null) throw new Error('nadie tiene el turno');
    turno.gastado = andado;
    applyAction(b, golpear('finta', respuesta), rng);
    return { b, rng, turno };
  }

  it('sin andar antes: le queda su velocidad menos lo del éxito, y solo puede andar o terminar', () => {
    // Finta contra Ofensivo, a dos: alto, resta 2.
    const { b, rng } = conFinta('ofensivo');
    expect(b.log.find((e) => e.kind === 'cruce')).toMatchObject({ golpe: 'finta', punto: 3 });
    const yo = stackById(b, 'attacker-0');
    expect(activeStack(b)?.id).toBe('attacker-0');
    expect(b.turno?.finta).toBe(2);
    expect(b.turno?.gastado).toBe(0);
    expect(pasosQueQuedan(b, yo)).toBe(6 - 2);
    // La Finta ya no le quita nada a nadie.
    expect(b.log.filter((e) => e.kind === 'effect')).toEqual([]);
    const legales = legalActions(b);
    expect(new Set(legales.map((a) => a.type))).toEqual(new Set(['move', 'end_turn']));
    expect(legales.at(-1)).toEqual({ type: 'end_turn' });
    // Lo demás lanza con el motivo, sin tocar nada.
    const largo = b.log.length;
    for (const otra of [
      { type: 'attack', target: 'defender-0' },
      { type: 'attack', target: 'defender-0', golpe: 'fuerte', respuesta: 'normal' },
      { type: 'defend' },
      { type: 'wait' },
      { type: 'shoot', target: 'defender-0' },
      { type: 'cast', spell: 'bless', target: 'attacker-0' },
      { type: 'surrender' },
    ] satisfies BattleAction[]) {
      expect(() => applyAction(b, otra, rng), JSON.stringify(otra)).toThrow(
        'attacker-0: tras golpear con Finta solo puede andar o terminar el turno',
      );
    }
    expect(b.log.length).toBe(largo);
    // Andar cierra el turno, aunque le quede.
    const paso = legales.find((a) => a.type === 'move');
    if (paso === undefined) throw new Error('tras la Finta no sale ninguna casilla');
    applyAction(b, paso, rng);
    expect(b.log.slice(largo)[0]).toMatchObject({ kind: 'move', stack: 'attacker-0' });
    expect(b.log.slice(largo)[0]).not.toHaveProperty('charge');
    expect(activeStack(b)?.id).toBe('defender-0');
  });

  it('después de andar: lo que le queda menos lo del éxito (el ejemplo: 6 − 2 − 2 = 2)', () => {
    const { b } = conFinta('ofensivo', 2);
    const yo = stackById(b, 'attacker-0');
    expect(activeStack(b)?.id).toBe('attacker-0');
    expect(pasosQueQuedan(b, yo)).toBe(2);
    // Las casillas que salen son las de ese presupuesto: alguna a 2, ninguna a más.
    const casillas = legalActions(b).flatMap((a) => (a.type === 'move' ? [a.to] : []));
    expect(Math.max(...casillas.map((h) => hexDistance(h, yo.hex)))).toBe(2);
  });

  it('un recorrido de antes de la Finta no vale después: la firma del turno la lleva', () => {
    // El fallo latente del /simplify (B): el turno y lo gastado son los mismos
    // antes y después de golpear con Finta sin andar, así que un `Movibles` de
    // antes pasaba y andaba las 6 casillas en vez de 4.
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    const yo = stackById(b, 'attacker-0');
    yo.effects = [{ kind: 'speed', amount: 2, source: 'haste', roundsLeft: 5 }];
    const turno = b.turno as TurnoDeUnidad;
    const viejo = {
      firma: firmaDelTurno(turno),
      puertas: claveDeAbiertas(b.puertas),
      costs: movableFrom(b, yo),
    };
    // Finta contra Ofensivo: alto, resta 2. Le quedan 4.
    applyAction(b, golpear('finta', 'ofensivo'), rng);
    expect(b.turno).toMatchObject({ n: turno.n, gastado: 0, finta: 2 });
    const lejos = { col: 0, row: 4 };
    expect(viejo.costs.get(hexKey(lejos))?.steps).toBe(5);
    expect(movableFrom(b, yo).has(hexKey(lejos))).toBe(false);
    expect(() => applyAction(b, { type: 'move', to: lejos }, rng, viejo)).toThrow(
      `el recorrido que traes es del turno ${turno.n} con 0 casillas gastadas, y ahora le toca a attacker-0 en el turno ${turno.n} con 0 casillas gastadas y 2 menos por la Finta`,
    );
    expect(yo.hex).toEqual({ col: 5, row: 4 });
    // Y lo que dice quien no llega nombra a la Finta, que es la que se lo comió.
    expect(movimientoBlocker(b, lejos)).toBe('no llega: tras la Finta le quedan 4 casillas');
    // Como la frase del contacto, cuando es la Finta la que deja a alguien rodeado.
    expect(fraseDelContacto(1, 1, true)).toBe(
      'rodeado: con 1 enemigo al lado, salir de su casilla le cuesta 2 y tras la Finta le queda 1 casilla',
    );
  });

  it('los cinco éxitos restan 1, 2, 3, 4 y 5', () => {
    // Finta contra: R. guardia (máximo), Ofensivo (alto), Normal (medio), Fuerte (bajo), Finta (mínimo).
    const resta = (['romperGuardia', 'ofensivo', 'normal', 'fuerte', 'finta'] as const).map(
      (r) => conFinta(r).turno.finta,
    );
    expect(resta).toEqual([1, 2, 3, 4, 5]);
  });

  it('sin casillas que andar, el turno se cierra solo y no sale nada', () => {
    // Le quedan 3 y la Finta en el mínimo resta 5: max(0, 3 − 5) = 0.
    const { b, turno } = conFinta('finta', 3);
    expect(b.log.find((e) => e.kind === 'cruce')).toMatchObject({ punto: 0 });
    expect(turno.finta).toBe(5);
    expect(activeStack(b)?.id).toBe('defender-0');
    expect(b.turno?.n).not.toBe(turno.n);
    // Y si la pelea acaba con el golpe, se cierra: no hay tramo que andar.
    const { b: fin } = (() => {
      const r = enRueda(piqueros(10), piqueros(1));
      applyAction(r.b, golpear('finta', 'ofensivo'), r.rng);
      return r;
    })();
    expect(fin.finished).toEqual({ winner: 'attacker' });
    expect(fin.turno).toBeNull();
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
    { modos: { ...MODOS_DEL_JUEGO, golpe: modo } },
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
    expect(b.golpeEnCurso).toMatchObject({
      stack: 'attacker-0',
      target: 'defender-0',
      carga: 4,
      carrera: null,
    });
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
    expect(pegados.golpeEnCurso).toMatchObject({
      stack: 'attacker-0',
      target: 'defender-0',
      carga: 0,
      carrera: null,
    });
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
          { modos: { ...MODOS_DEL_JUEGO, golpe: modo } },
        );
        autoResolve(b, rng);
        const log = b.log;
        // Entre la carrera y su golpe, al azar nada; con la rueda, su cruce y el
        // Defensivo de quien pega, que se pone antes de sus golpes. Hacia atrás,
        // también los golpes de antes de la misma jugada: cada golpe del Rápido
        // cobra la carga.
        const enMedio = modo === 'azar' ? [] : ['cruce', 'effect'];
        const saltando = (desde: number, paso: 1 | -1): BattleEvent | undefined => {
          const stack = log[desde]?.kind === 'attack' ? (log[desde] as Ataque).stack : null;
          const deLaJugada = (e: BattleEvent | undefined): boolean =>
            e !== undefined &&
            (enMedio.includes(e.kind) ||
              (paso === -1 && e.kind === 'attack' && e.stack === stack && !e.retaliation));
          let k = desde + paso;
          while (deLaJugada(log[k])) k += paso;
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

describe('la carga la cobra solo el primer golpe (decisión del usuario, 14-10-2026)', () => {
  it('Rápido cargando: el primero con la carga (+40 %) y el segundo sin ella, también en la previsión', () => {
    // Las dos caballerías de `aLaCarga` (A 10 contra D 9: ×1,1; daño 50-100)
    // cargan 4 (+40 %) y golpean con Rápido (×0,6) contra Defensivo: al lado en el
    // anillo, punto bajo, tirada 50 + ⌊50 / 4⌋ = 62 cada una, 124 las dos.
    // El primero: 124 × 1,1 × 1,4 × 0,6 = 114,576 → 115; el segundo, sin la carga:
    // 124 × 1,1 × 0,6 = 81,84 → 82.
    const { b, rng } = aLaCarga();
    applyAction(b, plantarse, rng);
    const golpe = { type: 'attack', target: 'defender-0', golpe: 'rapido' } as const;
    const p = previsionDe(b, golpe);
    if (p?.kind !== 'golpe') throw new Error('no hay previsión de golpe');
    expect(p.golpes).toBe(2);
    // La previsión, del mínimo al máximo del sector: el primero con la carga y el
    // segundo sin ella.
    expect(p.siguientes).not.toBeNull();
    const largo = b.log.length;
    applyAction(b, { ...golpe, respuesta: 'defensivo' }, rng);
    const [primero, segundo] = ataques(b, largo).filter((a) => !a.retaliation);
    expect(primero).toMatchObject({ charge: 4, damage: 115 });
    expect(segundo?.damage).toBe(82);
    expect(segundo).not.toHaveProperty('charge');
    expect(p.danio.min).toBeLessThanOrEqual(115);
    expect(p.danio.max).toBeGreaterThanOrEqual(115);
    expect(p.siguientes?.min).toBeLessThanOrEqual(82);
    expect(p.siguientes?.max).toBeGreaterThanOrEqual(82);
  });

  it('la rueda enseña el primer golpe aparte en los sectores de más de un golpe', () => {
    const { b, rng } = aLaCarga();
    applyAction(b, plantarse, rng);
    const { porTipo } = previsionDeLaRueda(b, { type: 'attack', target: 'defender-0' }, 'golpe');
    // Rápido da dos: el primero con la carga, el segundo no. Un golpe, sin `siguientes`.
    expect(porTipo?.rapido.golpes).toBe(2);
    expect(porTipo?.rapido.siguientes?.max).toBeLessThan(porTipo?.rapido.danio.max ?? 0);
    expect(porTipo?.fuerte.siguientes).toBeNull();
  });

  it('con el doble golpe, igual: el segundo no carga', () => {
    // En el catálogo nadie carga y pega dos veces: se le da el doble golpe a la caballería.
    const { b, rng } = aLaCarga('azar');
    const jinetes = stackById(b, 'attacker-0') as { unit: UnitInfo };
    jinetes.unit = { ...jinetes.unit, traits: [...(jinetes.unit.traits ?? []), 'double_attack'] };
    const largo = b.log.length;
    applyAction(b, plantarse, rng);
    const golpes = ataques(b, largo).filter((a) => !a.retaliation);
    expect(golpes.map((a) => a.charge)).toEqual([4, undefined]);
  });
});

describe('la previsión de la rueda', () => {
  it('cada sector, con su horquilla: Normal en el medio, los demás del mínimo al máximo', () => {
    const { b } = enRueda(piqueros(10), piqueros(10));
    const p = previsionDeLaRueda(b, { type: 'attack', target: 'defender-0' }, 'golpe');
    expect(p.sinContraataque).toBeNull();
    const t = p.porTipo;
    if (t === null) throw new Error('quien pega siempre tiene previsión');
    expect(t.normal).toEqual({
      danio: { min: 315, max: 315 },
      golpes: 1,
      siguientes: null,
      contraataquePorExito: [],
    });
    // 30 × 10 × 0,9 × 0,6 = 162; 40 × … = 216.
    expect(t.rapido).toEqual({
      danio: { min: 162, max: 216 },
      golpes: 2,
      siguientes: null,
      contraataquePorExito: [],
    });
    expect(t.fuerte.danio).toEqual({ min: 338, max: 450 });
    // 30 × 10 × 0,925 = 277,5 → 278; 40 × … = 370.
    expect(t.ofensivo.danio).toEqual({ min: 278, max: 370 });
  });

  it('quien responde ve su contraataque, o por qué no lo hará', () => {
    const { b } = enRueda(piqueros(10), piqueros(10));
    const p = previsionDeLaRueda(b, { type: 'attack', target: 'defender-0' }, 'respuesta');
    expect(p.porTipo?.normal).toEqual({
      danio: { min: 315, max: 315 },
      golpes: 1,
      siguientes: null,
      contraataquePorExito: [],
    });
    // Quien responde no ve el contraataque que le devolverían a él ni la carga.
    expect(p.contraataque).toBeNull();
    expect(p.carga).toBeNull();
    stackById(b, 'defender-0').retaliated = true;
    const sin = previsionDeLaRueda(b, { type: 'attack', target: 'defender-0' }, 'respuesta');
    expect(sin.porTipo).toBeNull();
    expect(sin.sinContraataque).toBe('Piquero ya devolvió un golpe esta ronda');
    // Quien pega lo sabe también, y sigue viendo su daño.
    const golpe = previsionDeLaRueda(b, { type: 'attack', target: 'defender-0' }, 'golpe');
    expect(golpe.sinContraataque).toBe('Piquero ya devolvió un golpe esta ronda');
    expect(golpe.porTipo?.normal).toEqual({
      danio: { min: 315, max: 315 },
      golpes: 1,
      siguientes: null,
      contraataquePorExito: [],
    });
    // Sin contraataque, Romper guardia no tiene nada que rebajar.
    expect(golpe.contraataque).toBeNull();
    expect(golpe.porTipo?.romperGuardia.contraataquePorExito).toEqual([]);
  });

  it('al golpear, Romper guardia dice su contraataque con cada éxito que lo rebaja (R3 de QA)', () => {
    // Quedan 8 piqueros tras el golpe; con Normal, 30–40 × 8 × 0,9 = 216–288. Con
    // −3 (A 2 contra D 9, ×0,825) 198–264, con −2 (×0,85) 204–272, con −1 (×0,875) 210–280.
    const { b } = enRueda(piqueros(10), piqueros(10));
    const p = previsionDeLaRueda(b, { type: 'attack', target: 'defender-0' }, 'golpe');
    expect(p.contraataque).toEqual({ min: 216, max: 288 });
    expect(p.porTipo?.romperGuardia.contraataquePorExito).toEqual([
      { punto: 4, danio: { min: 198, max: 264 } },
      { punto: 3, danio: { min: 204, max: 272 } },
      { punto: 2, danio: { min: 210, max: 280 } },
    ]);
    // Los demás no se lo tocan al rival (Defensivo es de quien pega).
    expect(p.porTipo?.defensivo.contraataquePorExito).toEqual([]);
    expect(p.porTipo?.fuerte.contraataquePorExito).toEqual([]);
    expect(p.carga).toBeNull();
  });

  it('sin contraataque, las notas del golpe no lo prometen (H9)', () => {
    expect(efectoDeGolpe('defensivo', 'golpe', false)).not.toContain('contraataque');
    expect(efectoDeGolpe('defensivo', 'golpe', false)).toContain('no te devuelven el golpe');
    expect(efectoDeGolpe('romperGuardia', 'golpe', false)).toBe(
      'Quita ataque al rival en su próximo turno (esta vez no te devuelve el golpe); −3 con éxito máximo, −2 alto, −1 medio, nada bajo o mínimo.',
    );
    // La Finta no tiene que ver con el contraataque: la misma nota con él y sin él.
    expect(efectoDeGolpe('finta', 'golpe', false)).toBe(efectoDeGolpe('finta', 'golpe', true));
  });

  it('con Romper guardia elegido, el contraataque previsto es menor y abarca el real', () => {
    // Romper guardia y Finta dan la misma horquilla al golpear (del mínimo al
    // máximo, sin factor ni ataque): el contraataque, no. En el máximo (−3),
    // 30 × 8 × 0,825 = 198; sin nada, 30 × 8 × 0,9 = 216.
    const { b } = enRueda(piqueros(10), piqueros(10));
    const prevision = (golpe: TipoDeGolpe) => {
      const p = previsionDe(b, { type: 'attack', target: 'defender-0', golpe });
      if (p === null || p.kind !== 'golpe' || p.contraataque === null) {
        throw new Error(`${golpe}: sin contraataque previsto`);
      }
      return p;
    };
    const romper = prevision('romperGuardia');
    const finta = prevision('finta');
    expect(romper.danio).toEqual(finta.danio);
    expect(finta.contraataque?.danio.min).toBe(216);
    expect(romper.contraataque?.danio.min).toBe(198);
    expect(romper.contraataque?.danio.max).toBe(finta.contraataque?.danio.max);
    // Y el contraataque de verdad cae dentro, en los cinco éxitos.
    for (const respuesta of [
      'finta',
      'defensivo',
      'normal',
      'ofensivo',
      'romperGuardia',
    ] as const) {
      const r = enRueda(piqueros(10), piqueros(10));
      applyAction(r.b, golpear('romperGuardia', respuesta), r.rng);
      const contra = ataques(r.b).find((a) => a.retaliation)?.damage ?? -1;
      expect(contra, respuesta).toBeGreaterThanOrEqual(romper.contraataque?.danio.min ?? 0);
      expect(contra, respuesta).toBeLessThanOrEqual(romper.contraataque?.danio.max ?? 0);
    }
    // Defensivo: quien pega lleva +1 defensa al recibirlo (D 10: ×0,875).
    expect(prevision('defensivo').contraataque?.danio.min).toBe(210);
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
        { modos: { ...MODOS_DEL_JUEGO, golpe: 'rueda' } },
      );
      autoResolve(b, rng);
      return b;
    };
    // Con la Finta la IA anda tras golpear (#263): sigue terminando, sin bucles.
    let tramos = 0;
    for (let semilla = 1; semilla <= 50; semilla++) {
      const a = pelea(semilla);
      expect(a.finished, `semilla ${semilla}`).not.toBeNull();
      expect(a.log.filter((e) => e.kind === 'cruce').length).toBeGreaterThan(0);
      expect(JSON.stringify(pelea(semilla).log), `semilla ${semilla}`).toBe(JSON.stringify(a.log));
      // Un tramo de la Finta: el `move` de quien acaba de golpear, sin otro turno en medio.
      for (const [i, e] of a.log.entries()) {
        if (e.kind !== 'cruce' || e.golpe !== 'finta') continue;
        const despues = a.log
          .slice(i + 1)
          .find((x) => !['attack', 'perished', 'luck', 'effect', 'immune'].includes(x.kind));
        if (despues?.kind === 'move' && despues.stack === e.stack) tramos++;
      }
    }
    expect(tramos).toBeGreaterThan(0);
  });
});

describe('el parte cuenta el cruce', () => {
  it('«Romper guardia contra Defensivo: alto; contraataque bajo», y sin contraataque, sin él', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    applyAction(b, golpear('romperGuardia', 'defensivo'), rng);
    const parte = marcadoDe(renderBattleLog(b, null));
    expect(parte).toContain('Romper guardia contra Defensivo: alto; contraataque bajo');
    // Romper guardia con éxito alto, con su duración de verdad.
    expect(parte).toContain(
      'Romper guardia sobre Piquero, del defensor: ataque -2 hasta que termine su próximo turno',
    );
    // Y Defensivo, hasta que empiece.
    const d = enRueda(piqueros(10), piqueros(10));
    applyAction(d.b, golpear('defensivo', 'normal'), d.rng);
    expect(marcadoDe(renderBattleLog(d.b, null))).toContain(
      'Defensivo sobre Piquero, del atacante: defensa +1 hasta que empiece su próximo turno',
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

/** Una sesión con la rueda, empezada: cada bando, sus unidades y si las lleva la IA. */
function sesion(
  izquierda: { readonly ids: readonly (string | UnidadDeArena)[]; readonly ia: boolean },
  derecha: { readonly ids: readonly (string | UnidadDeArena)[]; readonly ia: boolean },
  semilla = 1,
): SesionDeArena {
  const lado = (l: typeof izquierda) =>
    l.ids.map((u) => ({ unidad: typeof u === 'string' ? unidadDeArena(u) : u, ia: l.ia }));
  const s = sesionDeArena(lado(izquierda), lado(derecha), semilla, { golpe: 'rueda' });
  s.empezar();
  return s;
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
  expect(s.battleCharges()).toContainEqual({
    target: 'defender-0',
    at: DESDE,
    hexes: 5,
    porciento: 50,
  });
  return { s, ataque };
}

describe('la sesión de la arena con la rueda', () => {
  it('tras la carrera la rueda dice la carga de sus cifras y Rápido va en dos líneas (R5, R6)', () => {
    const { s, ataque } = jineteALaCarga();
    s.playBattleAction(ataque);
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('la rueda no se abre tras la carrera');
    expect(p.prevision.carga).toBe('carga de 5 casillas, +50 %');
    const m = marcadoDe(renderEleccion(s, p));
    expect(m).toContain('Las cifras llevan la carga de 5 casillas, +50 %');
    // Rápido: el primer golpe, con la carga, y el siguiente, sin ella, cada uno en su línea.
    const desde = m.indexOf('data-golpe="rapido"');
    const rapido = m.slice(desde, m.indexOf('</button>', desde));
    expect(rapido.match(/class="da"/g)).toHaveLength(2);
    expect(rapido).toMatch(/<span class="da">\+ \d+/);
    // El piquero no aguanta el golpe de la carga: no hay contraataque que rebajar,
    // y R. guardia no lo promete.
    expect(p.prevision.contraataque).toBeNull();
    expect(m).not.toContain('Su contraataque (con Normal');
  });

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
    expect(s.battle.golpeEnCurso).toMatchObject({
      stack: 'attacker-0',
      target: 'defender-0',
      carga: 5,
      carrera: null,
    });
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
    expect(s.status).toBe('Golpe cancelado: se pierde la carga.');
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
        modos: { golpe: 'rueda' },
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

  it('Yo contra IA con Finta: tras el desenlace salen las casillas a las que andar, y andar pasa el turno (#263)', () => {
    const s = sesion({ ids: [PIQUERO], ia: false }, { ids: [PIQUERO], ia: true });
    expect(s.turnoPropio?.stack.id).toBe('attacker-0');
    const yo = stackById(s.battle, 'attacker-0');
    yo.hex = { col: 5, row: 4 };
    stackById(s.battle, 'defender-0').hex = { col: 6, row: 4 };
    // Con una Prisa de +5 puesta a mano le queda algo con cualquier éxito.
    yo.effects = [{ kind: 'speed', amount: 5, source: 'haste', roundsLeft: 5 }];
    const velocidad = pasosQueQuedan(s.battle, yo);
    s.playBattleAction({ type: 'attack', target: 'defender-0' });
    expect(s.ruedaPendiente?.fase).toBe('golpe');
    const a = new BattleAnimator();
    a.observe(s.battle);
    a.tick(0);
    const largo = s.battle.log.length;
    s.elegirEnLaRueda('finta');
    const cruce = s.battle.log.slice(largo).find((e) => e.kind === 'cruce');
    if (cruce?.kind !== 'cruce') throw new Error('elegir no dio el golpe');
    // Sigue su turno, solo para andar: las casillas salen solas, sin otro clic.
    expect(s.ruedaPendiente).toBeNull();
    expect(s.turnoPropio?.stack.id).toBe('attacker-0');
    const resta = 5 - cruce.punto;
    expect(pasosQueQuedan(s.battle, yo)).toBe(velocidad - resta);
    const casillas = s.battleMovable();
    expect(casillas.length).toBeGreaterThan(0);
    expect(s.battleLegalActions().every((x) => x.type === 'move' || x.type === 'end_turn')).toBe(
      true,
    );
    expect(s.battleCharges()).toEqual([]);
    // El animador acaba con el aro en quien fintó: es su turno.
    a.observe(s.battle);
    for (let t = 0; a.busy; t += 16) a.tick(t);
    expect(a.activo(s.battle)).toBe('attacker-0');
    // Otra cosa no vale, y la barra lo dice.
    s.playBattleAction({ type: 'defend' });
    expect(s.status).toContain('tras golpear con Finta solo puede andar o terminar el turno');
    // Clic en una casilla: anda y el turno pasa.
    const n = s.battle.turno?.n;
    const destino = casillas[0] as (typeof casillas)[number];
    const antes = s.battle.log.length;
    s.playBattleAction({ type: 'move', to: destino });
    expect(s.battle.log[antes]).toMatchObject({ kind: 'move', stack: 'attacker-0', to: destino });
    expect(s.battle.turno?.n).not.toBe(n);
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
    const m = marcadoDe(renderEleccion(s, p));
    expect(m.match(/data-golpe="/g)).toHaveLength(7);
    for (const [i, t] of TIPOS_DE_GOLPE.entries()) {
      expect(m).toContain(`data-golpe="${t}" aria-label="`);
      expect(m).toContain(`aria-keyshortcuts="${i + 1}"`);
    }
    expect(m).toContain('data-fase="respuesta"');
    expect(m).not.toMatch(/data-elegido="(?:golpe|respuesta|los-dos)"/);
  });

  it('para elegir: la nota de cada sector se abre hacia fuera de su puesto en el anillo, no por su tipo', () => {
    const s = sesion({ ids: [JINETE], ia: false }, { ids: [PIQUERO], ia: false });
    hastaLaRueda(s, true);
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('la rueda no pide el golpe');
    const m = marcadoDe(renderEleccion(s, p));
    // De arriba en el sentido de las agujas del reloj: arriba, los dos de la
    // derecha, abajo y los dos de la izquierda; Normal, abajo.
    const hacia = ['arriba', 'derecha', 'derecha', 'abajo', 'izquierda', 'izquierda'];
    for (const [i, t] of ANILLO.entries()) {
      expect(m).toMatch(new RegExp(`data-sector="${t}"[^>]*data-hacia="${hacia[i]}"`));
    }
    expect(m).toMatch(/data-sector="normal"[^>]*data-hacia="abajo"/);
  });

  it('cada nota dice cuándo actúa su efecto y, en la respuesta, que solo Fuerte y Rápido cambian el contraataque (#263)', () => {
    // Al pegar: Romper guardia y Finta, con lo que darían en cada éxito, desde las cifras.
    expect(efectoDeGolpe('romperGuardia', 'golpe')).toBe(
      'Quita ataque al rival desde ya: en su contraataque de ahora y hasta que termine su próximo turno; −3 con éxito máximo, −2 alto, −1 medio, nada bajo o mínimo.',
    );
    expect(efectoDeGolpe('finta', 'golpe')).toBe(
      'Después de golpear puedes andar las casillas que te queden menos 1 con éxito máximo, 2 alto, 3 medio, 4 bajo, 5 mínimo. Andar cierra el turno.',
    );
    // Con el contacto encendido, la Finta avisa de que su tramo lo paga (#259 y #263
    // apilados, decisión del usuario, 14-10-2026).
    expect(efectoDeGolpe('finta', 'golpe', true, true)).toBe(
      'Después de golpear puedes andar las casillas que te queden menos 1 con éxito máximo, 2 alto, 3 medio, 4 bajo, 5 mínimo. Andar cierra el turno. Salir del contacto cuesta encima, como cualquier paso: 1 más por cada enemigo a tu lado.',
    );
    // Rápido avisa de la armadura, al golpear y al responder.
    expect(efectoDeGolpe('rapido', 'golpe')).toBe(
      '2 golpes de daño ×0,6 cada uno (con doble golpe, el doble). Cada golpe resta la armadura del rival: contra armadura, pierde.',
    );
    expect(efectoDeGolpe('defensivo', 'golpe')).toBe(
      '+1 defensa desde ya: cubre el contraataque de ahora y dura hasta que empiece tu próximo turno.',
    );
    expect(efectoDeGolpe('ofensivo', 'golpe')).toBe('+1 ataque en este golpe.');
    expect(efectoDeGolpe('fuerte', 'golpe')).toBe('Daño ×1,25.');
    // En la respuesta: Ofensivo, Defensivo, Finta y Romper guardia solo cuentan para el
    // cruce; Fuerte y Rápido dicen su contraataque.
    for (const t of ['ofensivo', 'defensivo', 'finta', 'romperGuardia'] as const) {
      expect(efectoDeGolpe(t, 'respuesta'), t).toBe(
        'En la respuesta no tiene efecto: solo cuenta para el cruce, que decide cuánto te duele el golpe y dónde cae tu contraataque.',
      );
    }
    expect(efectoDeGolpe('fuerte', 'respuesta')).toBe(
      'Su efecto no toca el golpe que recibes (ese lo decide el cruce): tu contraataque hace daño ×1,25.',
    );
    expect(efectoDeGolpe('rapido', 'respuesta')).toBe(
      'Su efecto no toca el golpe que recibes (ese lo decide el cruce): contraatacas con 2 golpes de daño ×0,6 cada uno. Cada golpe resta la armadura del rival: contra armadura, pierde.',
    );
    for (const t of TIPOS_DE_GOLPE) {
      // El doble golpe no dobla el contraataque (`golpesDe`): la respuesta no lo promete.
      expect(efectoDeGolpe(t, 'respuesta'), t).not.toContain('doble golpe');
    }
    // Las notas salen de `data/rueda.json`: con otras cifras, otra frase.
    const otras = validarRueda({
      ...ruedaJson,
      romperGuardia: { ataque: { minimo: -1, bajo: -1, medio: -1, alto: -1, maximo: -4 } },
    });
    expect(otras.romperGuardia.ataque[4]).toBe(-4);
    // Y la rueda pinta la de su fase: en la respuesta, la de la respuesta.
    const s = sesion({ ids: [JINETE], ia: false }, { ids: [PIQUERO], ia: false });
    hastaLaRueda(s, true);
    const golpe = s.ruedaPendiente;
    if (golpe === null) throw new Error('la rueda no pide el golpe');
    const enElGolpe = marcadoDe(renderEleccion(s, golpe));
    expect(enElGolpe).toContain('cubre el contraataque de ahora');
    expect(enElGolpe).toContain('−3 con éxito máximo');
    expect(enElGolpe).not.toContain('En la respuesta no tiene efecto');
    s.elegirEnLaRueda('fuerte');
    const respuesta = s.ruedaPendiente;
    if (respuesta === null) throw new Error('la rueda no pide la respuesta');
    const enLaRespuesta = marcadoDe(renderEleccion(s, respuesta));
    expect(enLaRespuesta).toContain('En la respuesta no tiene efecto: solo cuenta para el cruce');
    expect(enLaRespuesta).toContain('tu contraataque hace daño ×1,25');
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
    const m = marcadoDe(renderEleccion(s, p));
    expect(m).not.toContain('contraatacas');
    expect(m).not.toContain('tu contraataque');
    expect(m.match(/Esta vez no devuelves el golpe/g)?.length).toBe(2 * TIPOS_DE_GOLPE.length);
  });

  it('el desenlace: los dos elegidos, el rótulo, el medidor y los tramos en orden', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    applyAction(b, golpear('romperGuardia', 'defensivo'), rng);
    const i = b.log.findIndex((e) => e.kind === 'cruce');
    const e = b.log[i];
    if (e?.kind !== 'cruce') throw new Error('sin cruce');
    const m = marcadoDe(renderDesenlace(b, e, contraataqueDelCruce(b.log, i)));
    expect(m).toContain('Romper guardia contra Defensivo');
    expect(m).toContain('data-sector="romperGuardia" data-elegido="golpe"');
    expect(m).toContain('data-sector="defensivo" data-elegido="respuesta"');
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
    const azar = marcadoDe(renderModo(GOLPE, 'azar'));
    expect(azar).toContain('<h3>Golpe · al azar</h3>');
    expect(azar).toContain('data-modo="azar" class="primary"');
    const rueda = marcadoDe(renderModo(GOLPE, 'rueda'));
    expect(rueda).toContain('data-modo="rueda" class="primary"');
    expect(rueda).toContain('data-modo-del-montaje="golpe" data-modo="rueda"');
  });
});
