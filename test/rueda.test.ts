/**
 * La rueda del golpe (`battle/rueda.ts`, solo la arena; docs/agents/2026-10-13-rueda-del-golpe/):
 * el cruce, la tirada fija de cada punto, los efectos de cada tipo con su
 * caducidad «hasta su próximo turno», la IA a ciegas, la sesión de la arena con
 * sus tres maneras (Yo contra IA, IA contra Yo, Yo contra Yo) y el parte.
 *
 * Las cifras se escriben a mano desde unidades hechas a mano (`A_MANO`: el piquero,
 * A 5, D 9, daño 30-40, 150 PV, sin armadura) y desde `data/rueda.json` (la Espada,
 * todo a 3: Fuerte ×1,5, Rápido 2 × ×0,63): un test que calculara el esperado con
 * las mismas funciones del motor solo probaría que el motor es el que es.
 */

import { describe, expect, it } from 'vitest';
import ruedaJson from '../data/rueda.json' with { type: 'json' };
import { BattleAnimator, DURACION } from '../src/client/anim.js';
import {
  caraDeLaArena,
  renderPanelDeBatalla,
  rotuloDelTurno,
} from '../src/client/arena/paneles.js';
import { marcadoDe } from '../src/client/html.js';
import { renderDesenlace, renderEleccion, tramosDelDesenlace } from '../src/client/rueda/rueda.js';
import { SesionDeArena } from '../src/client/session.js';
import { renderBattleLog } from '../src/client/views/panels.js';
import { completarCruce, elegirEnLaRueda } from '../src/core/ai/rueda.js';
import { autoResolve } from '../src/core/ai/tactics.js';
import type { FuenteDeArena } from '../src/core/arena.js';
import { golpesDe, ruedaDelGolpe } from '../src/core/battle/armas.js';
import {
  activeStack,
  applyAction,
  type BattleSide,
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
import { cifrasDeLosNiveles, golpesDelTipo } from '../src/core/battle/cifras-de-la-rueda.js';
import { fraseDelContacto } from '../src/core/battle/contacto.js';
import { effectiveAttack, effectiveDefense, stackHp } from '../src/core/battle/damage.js';
import { claveDeAbiertas } from '../src/core/battle/muralla.js';
import {
  casillasQueQuitaLaFinta,
  contraataqueDelCruce,
  dichoDelCiclo,
  dichoDelCruce,
  efectoDeGolpe,
  efectoDelTipo,
  type FormaDeLaRueda,
  nombreEnLaRueda,
  PESOS_DE_LA_RUEDA,
  puntoDelContraataque,
  puntoDelCruce as puntoDelCruceEn,
  puntosDeLaForma,
  RUEDAS,
  TIPOS_DE_LAS_RUEDAS,
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
import { unidad } from '../src/core/catalogo.js';
import { COMBATE_COMPLETO, combateCon, type ReglasDelCombate } from '../src/core/combate.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/hero/equipo.js';
import { createRng, type Rng, sortearPorPesos } from '../src/core/rng.js';
import type { NivelesDeLaRueda, Stack, UnitInfo } from '../src/core/types.js';
import { cuerpoDeCombate, nivelesDeLaEspada, type Unidad } from '../src/core/unidad.js';
import { bando } from './batalla-de-prueba.js';
import {
  type Ataque,
  ataquesDe,
  conCifrasAMano,
  conManosDePrueba,
  delBorrador,
  golpeConLaRueda,
  hastaLaRueda,
  JINETE,
  NO_MUERTO,
  NORMAL,
  PESADA,
  sesionDeArena,
  TROPA,
  todoA,
  unidadDeArena,
} from './helpers.js';

/** La rueda de 7, la de siempre: con la que pelean las batallas de estos tests. */
const RUEDA_DE_7 = RUEDAS[7];
const ANILLO = RUEDA_DE_7.anillo;
const TIPOS_DE_GOLPE = RUEDA_DE_7.golpes;
/** El cruce en la rueda de 7. */
const puntoDelCruce = (a: TipoDeGolpe, b: TipoDeGolpe) => puntoDelCruceEn(a, b, RUEDA_DE_7);

/** Las cifras de la rueda con la Espada de la arena (todo a 3): las de un arma versátil. */
const CON_LA_ESPADA = cifrasDeLosNiveles(nivelesDeLaEspada());

/**
 * El cuerpo desnudo de `base` (sin su equipo de serie: ni armas ni armadura) con
 * las cifras de `cifras`. Estas pruebas cuentan el daño de cada cruce a mano, y la
 * armadura de las unidades del catálogo (desde el 19-10-2026 todas la llevan) lo
 * enturbiaría: con cifras redondas y sin armadura cada esperado se lee en su
 * comentario.
 */
const sinEquipo = (base: string, cifras: Partial<UnitInfo>): UnitInfo => ({
  ...cuerpoDeCombate(unidad(base)),
  ...cifras,
});

/** El piquero de las cuentas: A 5, D 9, daño 30-40, 150 PV, 4 casillas. */
const PIQUERO_A_MANO = sinEquipo(TROPA, {
  name: 'Piquero',
  attack: 5,
  defense: 9,
  damage: [30, 40],
  hp: 150,
  speed: 'average',
  traits: [],
});

/** Uno que pega dos veces (`double_attack`, que nadie del catálogo lleva) y es más rápido que el piquero. */
const DOBLE_GOLPE = sinEquipo(PESADA, {
  name: 'Paladín',
  attack: 11,
  defense: 12,
  damage: [100, 200],
  hp: 500,
  speed: 'fast',
  traits: ['double_attack'],
});

/**
 * La caballería de las cargas: A 10, D 9, daño 50-100, 300 PV, sin montura ni lanza:
 * carga como todos (+5 %/casilla), con la horquilla de su golpe (26-10-2026).
 */
const CABALLERIA = sinEquipo(JINETE, {
  name: 'Caballería',
  attack: 10,
  defense: 9,
  damage: [50, 100],
  hp: 300,
  speed: 'very_fast',
  traits: [],
});

/** Lo que se pone a mano en lugar de cada unidad del catálogo, por su id. */
const A_MANO: Readonly<Record<string, UnitInfo>> = {
  [TROPA]: PIQUERO_A_MANO,
  [PESADA]: DOBLE_GOLPE,
  [JINETE]: CABALLERIA,
};

/**
 * Cada stack de `b` de una unidad de `A_MANO` con sus cifras hechas a mano y,
 * todos, con las manos de prueba (`conManosDePrueba`) para golpear en la rueda.
 */
function conCifrasDePrueba(b: BattleState, niveles?: NivelesDeLaRueda): BattleState {
  for (const s of b.stacks) {
    const cifras = A_MANO[s.body];
    if (cifras !== undefined) conCifrasAMano(b, s.id, cifras);
  }
  return conManosDePrueba(b, niveles);
}

/** Una batalla con la rueda, el atacante en (5,4) y el defensor pegado en (6,4). */
function enRueda(
  izquierda: readonly Stack[],
  derecha: readonly Stack[],
  o: {
    readonly semilla?: number;
    readonly lado?: BattleSide;
    readonly niveles?: NivelesDeLaRueda;
    /** La complejidad de la pelea; sin ella, la de siempre (7 / 7). */
    readonly combate?: ReglasDelCombate;
  } = {},
): { b: BattleState; rng: Rng } {
  const rng = createRng(o.semilla ?? 1);
  const b = conCifrasDePrueba(
    createBattle(bando(izquierda), bando(derecha), rng, o.combate ?? COMBATE_COMPLETO),
    o.niveles,
  );
  stackById(b, 'attacker-0').hex = { col: 5, row: 4 };
  stackById(b, 'defender-0').hex = { col: 6, row: 4 };
  return { b, rng };
}

/** `n` piqueros: en `enRueda` y `aLaCarga`, con las cifras de `PIQUERO_A_MANO`. */
const piqueros = (n: number): Stack[] => [{ creature: TROPA, count: n }];

/** La nota de un tipo con las cifras de la Espada (todo a 3), en la rueda `forma` (la de 7). */
const notaConEspada = (
  tipo: TipoDeGolpe,
  papel: 'golpe' | 'respuesta',
  contraataca = true,
  forma: FormaDeLaRueda = RUEDA_DE_7,
): string => efectoDeGolpe(tipo, papel, contraataca, CON_LA_ESPADA, forma);

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
    const tabla: Partial<Record<TipoDeGolpe, readonly number[]>> = {
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
    const piquero = PIQUERO_A_MANO;
    const paladin = DOBLE_GOLPE;
    expect(golpesDe(piquero, null, false)).toBe(1);
    expect(golpesDe(paladin, null, false)).toBe(2);
    expect(golpesDe(paladin, null, true)).toBe(1);
    expect(golpesDe(piquero, 'rapido', false)).toBe(2);
    expect(golpesDe(paladin, 'rapido', false)).toBe(4);
    expect(golpesDe(paladin, 'rapido', true)).toBe(2);
    expect(golpesDe(paladin, 'fuerte', false)).toBe(2);
  });
});

describe('el golpe con la rueda', () => {
  it('los dos van juntos (o ninguno: plantarse) y tienen que ser tipos', () => {
    const { b, rng: r } = enRueda(piqueros(5), piqueros(5));
    const largo = b.log.length;
    expect(() =>
      applyAction(b, { type: 'attack', target: 'defender-0', respuesta: 'finta' }, r),
    ).toThrow('se golpea con la rueda: falta el golpe');
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
    ).toThrow('«patada» no es un tipo de golpe: valen ofensivo, fuerte, finta');
    // Rechazado antes de mover y de escribir nada.
    expect(b.log.length).toBe(largo);
  });

  it('`data/rueda.json` se valida diciendo el fichero y el campo', () => {
    const con = (cambio: (j: Record<string, unknown>) => void): (() => unknown) => {
      const j = structuredClone(ruedaJson) as Record<string, unknown>;
      cambio(j);
      return () => validarRueda(j);
    };
    expect(validarRueda(ruedaJson).tabla.fuerte[3]).toBe(150);
    expect(con((j) => (j.patada = 1))).toThrow('data/rueda.json: «patada» no es un campo');
    expect(con((j) => ((j.fuerte as { porcentaje: number[] }).porcentaje[0] = 0))).toThrow(
      'data/rueda.json: fuerte.porcentaje: el nivel 0 tiene que ser 1 o más, y es 0',
    );
    // Romper guardia quita ataque (0 o menos); la Finta resta casillas (0 o más).
    expect(
      con((j) => ((j.romperGuardia as { conExitoMaximo: number[] }).conExitoMaximo[2] = 1)),
    ).toThrow('data/rueda.json: romperGuardia.conExitoMaximo: el nivel 2 va hasta 0, y es 1');
    expect(con((j) => ((j.finta as { conExitoMinimo: number[] }).conExitoMinimo[6] = -1))).toThrow(
      'data/rueda.json: finta.conExitoMinimo: el nivel 6 tiene que ser 0 o más, y es -1',
    );
    expect(con((j) => delete (j.finta as { conExitoMinimo?: number }).conExitoMinimo)).toThrow(
      'data/rueda.json: finta.conExitoMinimo: tiene que ser una lista de 7 enteros, la cifra de los niveles 0 a 6',
    );
    // Lo de antes (las cifras por éxito sin niveles; Normal con su %) ya no entra.
    expect(con((j) => (j.romperGuardia = { ataque: { minimo: 0 } }))).toThrow(
      'data/rueda.json: romperGuardia: «ataque» no es un campo; valen conExitoMaximo',
    );
    expect(con((j) => (j.normal = { porcentaje: 100 }))).toThrow(
      'data/rueda.json: «normal» no es un campo',
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

describe('el daño fijo por el cruce (piqueros: A 5, D 9 → ×0,9; daño 30-40; 150 PV; con los niveles de la Espada)', () => {
  it('Rápido contra Fuerte: máximo, dos golpes de ×0,63; el contraataque, mínimo con Fuerte ×1,5', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    const c = contando(rng);
    applyAction(b, golpeConLaRueda('rapido', 'fuerte'), c.rng);
    expect(b.log.find((e) => e.kind === 'cruce')).toEqual({
      kind: 'cruce',
      stack: 'attacker-0',
      target: 'defender-0',
      golpe: 'rapido',
      respuesta: 'fuerte',
      punto: 4,
    });
    // 40 × 10 × 0,9 × 0,63 = 226,8 → 227, dos veces; quedan 1 500 − 454 = 1 046 PV,
    // 7 piqueros: 30 × 7 × 0,9 × 1,5 = 283,5 → 284. Cada golpe dice el punto en que cayó.
    expect(ataquesDe(b).map((a) => [a.stack, a.damage, a.retaliation, a.punto])).toEqual([
      ['attacker-0', 227, false, 4],
      ['attacker-0', 227, false, 4],
      ['defender-0', 284, true, 0],
    ]);
    // El cruce sustituye la tirada: ni un `rng.int` en todo el intercambio.
    expect(c.ints()).toBe(0);
  });

  it('Normal contra cualquiera, el medio: 35 × 10 × 0,9 = 315', () => {
    for (const r of TIPOS_DE_GOLPE.filter((t) => t !== 'romperGuardia' && t !== 'finta')) {
      const { b, rng } = enRueda(piqueros(10), piqueros(10));
      applyAction(b, golpeConLaRueda('normal', r), rng);
      expect(ataquesDe(b)[0]?.damage, `normal contra ${r}`).toBe(315);
    }
  });

  it('Fuerte contra Fuerte, el mínimo ×1,5: 30 × 10 × 0,9 × 1,5 = 405', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    applyAction(b, golpeConLaRueda('fuerte', 'fuerte'), rng);
    // Y el contraataque, en el máximo: quedan 1 500 − 405 = 1 095 PV, 8 piqueros;
    // 40 × 8 × 0,9 × 1,5 = 432.
    expect(ataquesDe(b).map((a) => a.damage)).toEqual([405, 432]);
  });

  it('Ofensivo suma tres puntos de ataque al golpe que se da: 37 × 10 × 0,975 = 360,75 → 361', () => {
    // Ofensivo contra Finta, a dos en el anillo: alto (37); ataque 5 + 3 contra 9.
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    applyAction(b, golpeConLaRueda('ofensivo', 'finta'), rng);
    expect(ataquesDe(b)[0]?.damage).toBe(361);
    // Su ataque de verdad no cambia: es del golpe, no un efecto.
    expect(effectiveAttack(stackById(b, 'attacker-0'))).toBe(5);
  });

  it('con el doble golpe y Rápido, cuatro golpes', () => {
    const { b, rng } = enRueda([{ creature: PESADA, count: 1 }], piqueros(60));
    // El paladín es rápido y el piquero no: el paladín abre la ronda.
    expect(activeStack(b)?.id).toBe('attacker-0');
    applyAction(b, golpeConLaRueda('rapido', 'normal'), rng);
    expect(ataquesDe(b).filter((a) => !a.retaliation)).toHaveLength(4);
  });
});

describe('los efectos del golpe (#263): Defensivo hasta que empiece su turno, Romper guardia por éxito', () => {
  it('Defensivo cubre ya el contraataque: 35 × 8 × 0,825 = 231, hasta que empiece su próximo turno', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    applyAction(b, golpeConLaRueda('defensivo', 'normal'), rng);
    const yo = stackById(b, 'attacker-0');
    // El golpe, 315; quedan 1 185 PV, 8 piqueros; contra defensa 9 + 3, ×0,825.
    expect(ataquesDe(b).map((a) => a.damage)).toEqual([315, 231]);
    expect(yo.effects).toEqual([
      expect.objectContaining({ kind: 'defense', amount: 3, source: 'defensivo', roundsLeft: 2 }),
    ]);
    expect(effectiveDefense(yo)).toBe(12);
    expect(b.log).toContainEqual(
      expect.objectContaining({ kind: 'effect', source: 'defensivo', vence: 'empezar' }),
    );
    // Sigue en el turno del rival (le cubre si le golpea), y se va al empezar el
    // suyo: antes de que juegue.
    expect(activeStack(b)?.id).toBe('defender-0');
    expect(effectiveDefense(yo)).toBe(12);
    const largo = b.log.length;
    applyAction(b, { type: 'end_turn' }, rng);
    expect(activeStack(b)?.id).toBe('attacker-0');
    expect(yo.effects).toEqual([]);
    expect(b.log.slice(largo)).toContainEqual({
      kind: 'effect_end',
      stack: 'attacker-0',
      source: 'defensivo',
    });
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
      applyAction(b, golpeConLaRueda('romperGuardia', respuesta), rng);
      const el = stackById(b, 'defender-0');
      expect(
        b.log.find((e) => e.kind === 'cruce'),
        que,
      ).toMatchObject({ punto });
      expect(effectiveAttack(el), que).toBe(ataque);
      expect(
        ataquesDe(b).map((a) => [a.stack, a.damage]),
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
    applyAction(b, golpeConLaRueda('romperGuardia', 'defensivo'), rng);
    const el = stackById(b, 'defender-0');
    // Su turno: con −2 (ataca con 3).
    expect(activeStack(b)?.id).toBe('defender-0');
    expect(effectiveAttack(el)).toBe(3);
    // Al cerrar ese turno se va, y lo dice.
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
    applyAction(b, golpeConLaRueda('romperGuardia', 'normal'), rng);
    const el = stackById(b, 'defender-0');
    expect(effectiveAttack(el)).toBe(4);
    // Otro turno del atacante (a mano), y otro Romper guardia con éxito máximo.
    b.turno = { n: 50, stack: 'attacker-0', gastado: 0 };
    applyAction(b, golpeConLaRueda('romperGuardia', 'finta'), rng);
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
    applyAction(b, golpeConLaRueda('romperGuardia', 'finta'), rng);
    expect(ataquesDe(b).filter((a) => a.retaliation)).toEqual([]);
    expect(effectiveAttack(stackById(b, 'defender-0'))).toBe(2);
  });
});

describe('la respuesta no da bonificadores (#263): solo Fuerte y Rápido cambian el contraataque', () => {
  // Golpe Normal: 35 × 10 × 0,9 = 315; quedan 1 185 PV, 8 piqueros. El
  // contraataque en el medio: 35 × 8 × 0,9 = 252.
  it('Ofensivo, Defensivo, Finta y Romper guardia: 252, ni ataque ni defensa de más, ni un efecto', () => {
    for (const respuesta of ['ofensivo', 'defensivo', 'finta', 'romperGuardia'] as const) {
      const { b, rng } = enRueda(piqueros(10), piqueros(10));
      applyAction(b, golpeConLaRueda('normal', respuesta), rng);
      expect(
        ataquesDe(b).map((a) => a.damage),
        respuesta,
      ).toEqual([315, 252]);
      expect(
        b.log.filter((e) => e.kind === 'effect'),
        respuesta,
      ).toEqual([]);
      for (const x of b.stacks) {
        expect(x.effects, `${respuesta}: ${x.id}`).toEqual([]);
        expect(effectiveAttack(x), `${respuesta}: ${x.id}`).toBe(5);
        expect(effectiveDefense(x), `${respuesta}: ${x.id}`).toBe(9);
      }
      // La Finta de quien responde no le abre nada a nadie: el turno pasa.
      expect(activeStack(b)?.id, respuesta).toBe('defender-0');
      expect(b.turno?.finta, respuesta).toBeUndefined();
    }
  });

  it('Fuerte: 35 × 8 × 0,9 × 1,5 = 378; Rápido: dos de 35 × 8 × 0,9 × 0,63 = 158,76 → 159', () => {
    const fuerte = enRueda(piqueros(10), piqueros(10));
    applyAction(fuerte.b, golpeConLaRueda('normal', 'fuerte'), fuerte.rng);
    expect(ataquesDe(fuerte.b).map((a) => a.damage)).toEqual([315, 378]);
    const rapido = enRueda(piqueros(10), piqueros(10));
    applyAction(rapido.b, golpeConLaRueda('normal', 'rapido'), rapido.rng);
    expect(ataquesDe(rapido.b).map((a) => [a.damage, a.retaliation])).toEqual([
      [315, false],
      [159, true],
      [159, true],
    ]);
  });
});

describe('la Finta deja andar después de golpear (#263)', () => {
  /**
   * La Finta de la Espada (nivel 3): resta 5, 4, 3, 2 y 1 casillas del éxito
   * mínimo al máximo (una menos por punto de éxito).
   */
  const CON_LA_ESPADA = nivelesDeLaEspada();

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
    const { b, rng } = enRueda(piqueros(10), piqueros(10), { niveles: CON_LA_ESPADA });
    const yo = stackById(b, 'attacker-0');
    yo.effects = [{ kind: 'speed', amount: 2, source: 'haste', roundsLeft: 5 }];
    expect(pasosQueQuedan(b, yo)).toBe(6);
    const turno = b.turno;
    if (turno === null) throw new Error('nadie tiene el turno');
    turno.gastado = andado;
    applyAction(b, golpeConLaRueda('finta', respuesta), rng);
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
    // Las casillas que salen son las de ese presupuesto, pagando el contacto: salir
    // de su casilla, con el piquero al lado, cuesta 2. Alguna a 1, ninguna a más.
    const casillas = legalActions(b).flatMap((a) => (a.type === 'move' ? [a.to] : []));
    expect(Math.max(...casillas.map((h) => hexDistance(h, yo.hex)))).toBe(1);
  });

  it('un recorrido de antes de la Finta no vale después: la firma del turno la lleva', () => {
    // El fallo latente del /simplify (B): el turno y lo gastado son los mismos
    // antes y después de golpear con Finta sin andar, así que un `Movibles` de
    // antes pasaba y andaba las 6 casillas en vez de 4.
    const { b, rng } = enRueda(piqueros(10), piqueros(10), { niveles: CON_LA_ESPADA });
    const yo = stackById(b, 'attacker-0');
    yo.effects = [{ kind: 'speed', amount: 2, source: 'haste', roundsLeft: 5 }];
    const turno = b.turno as TurnoDeUnidad;
    const viejo = {
      firma: firmaDelTurno(turno),
      puertas: claveDeAbiertas(b.puertas),
      costs: movableFrom(b, yo),
    };
    // Finta contra Ofensivo: alto, resta 2. Le quedan 4.
    applyAction(b, golpeConLaRueda('finta', 'ofensivo'), rng);
    expect(b.turno).toMatchObject({ n: turno.n, gastado: 0, finta: 2 });
    const lejos = { col: 0, row: 4 };
    // Cinco casillas, y salir del contacto cuesta una más.
    expect(viejo.costs.get(hexKey(lejos))?.steps).toBe(6);
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

  it('los cinco éxitos restan, con la Finta de la Espada, 1, 2, 3, 4 y 5', () => {
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
      applyAction(r.b, golpeConLaRueda('finta', 'ofensivo'), r.rng);
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
function aLaCarga(): { b: BattleState; rng: Rng } {
  const rng = createRng(1);
  const b = conCifrasDePrueba(
    createBattle(
      bando([{ creature: JINETE, count: 2 }]),
      bando(piqueros(10)),
      rng,
      COMBATE_COMPLETO,
    ),
  );
  const jinetes = stackById(b, 'attacker-0');
  jinetes.hex = { col: 1, row: 4 };
  stackById(b, 'defender-0').hex = { col: 6, row: 4 };
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
    // La carrera, por la recta: lo que anda (salir del contacto se paga por ella).
    expect(b.golpeEnCurso).toMatchObject({
      stack: 'attacker-0',
      target: 'defender-0',
      carga: 4,
      carrera: { at: DESDE, steps: 4 },
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
    // Normal: el medio, 50 + ⌊50 · 2 / 4⌋ = 75; × 2 jinetes × 1,1 (A 10 − D 9) × 1,2
    // (carga a pie de 4) = 198. Sin la carga guardada serían 165.
    const golpe = ataquesDe(enDos.b).find((a) => !a.retaliation);
    expect(golpe).toMatchObject({ stack: 'attacker-0', damage: 198, charge: 4 });
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
    // Normal con la carga: 198, el mismo que da el golpe.
    expect(antes.porTipo?.normal?.danio).toEqual({ min: 198, max: 198 });
  });

  it('con un golpe plantado, solo vale ese golpe con sus dos elecciones: lo demás lanza con su motivo', () => {
    const { b, rng } = aLaCarga();
    applyAction(b, plantarse, rng);
    expect(legalActions(b)).toEqual([{ type: 'attack', target: 'defender-0' }]);
    const largo = b.log.length;
    const motivo = 'attacker-0 está plantado ante defender-0: elige en la rueda o cancela el golpe';
    for (const otra of [
      { type: 'end_turn' },
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
    // Ya se movió: puede andar más, golpear o terminar.
    const legales = legalActions(b);
    expect(legales.some((a) => a.type === 'move')).toBe(true);
    expect(legales).toContainEqual({ type: 'attack', target: 'defender-0' });
    expect(legales).toContainEqual({ type: 'end_turn' });
    // El golpe de después, desde donde está, ya no carga: 165, no 231.
    applyAction(b, { type: 'attack', target: 'defender-0' }, rng);
    applyAction(
      b,
      { type: 'attack', target: 'defender-0', golpe: 'normal', respuesta: 'rapido' },
      rng,
    );
    const golpe = ataquesDe(b, largo).find((a) => !a.retaliation);
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

  it('la carga va en el `move`: cada carrera con marca la cierra un golpe que carga, y al revés', () => {
    {
      const modo = 'rueda';
      let cargas = 0;
      for (let semilla = 1; semilla <= 6; semilla++) {
        const rng = createRng(semilla);
        const b = conCifrasDePrueba(
          createBattle(
            bando([
              { creature: JINETE, count: 1 },
              { creature: JINETE, count: 1 },
            ]),
            bando(piqueros(3)),
            rng,
            COMBATE_COMPLETO,
          ),
        );
        autoResolve(b, rng);
        const log = b.log;
        // Entre la carrera y su golpe, su cruce y el Defensivo de quien pega, que
        // se pone antes de sus golpes. Hacia atrás, también los golpes de antes de
        // la misma jugada: cada golpe del Rápido cobra la carga.
        const enMedio = ['cruce', 'effect'];
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
            expect(log[i + 1]?.kind).toBe('cruce');
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
  it('Rápido cargando: el primero con la carga (+20 %) y el segundo sin ella, también en la previsión', () => {
    // Las dos caballerías de `aLaCarga` (A 10 contra D 9: ×1,1; daño 50-100)
    // cargan 4 a pie (+20 %) y golpean con Rápido (×0,63, el nivel 3) contra Defensivo:
    // al lado en el anillo, punto bajo, tirada 50 + ⌊50 / 4⌋ = 62 cada una, 124 las
    // dos. El primero: 124 × 1,1 × 1,2 × 0,63 = 103,1 → 103; el segundo, sin la
    // carga: 124 × 1,1 × 0,63 = 85,93 → 86.
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
    const [primero, segundo] = ataquesDe(b, largo).filter((a) => !a.retaliation);
    expect(primero).toMatchObject({ charge: 4, damage: 103 });
    expect(segundo?.damage).toBe(86);
    expect(segundo).not.toHaveProperty('charge');
    expect(p.danio.min).toBeLessThanOrEqual(103);
    expect(p.danio.max).toBeGreaterThanOrEqual(103);
    expect(p.siguientes?.min).toBeLessThanOrEqual(86);
    expect(p.siguientes?.max).toBeGreaterThanOrEqual(86);
  });

  it('la rueda enseña el primer golpe aparte en los sectores de más de un golpe', () => {
    const { b, rng } = aLaCarga();
    applyAction(b, plantarse, rng);
    const { porTipo } = previsionDeLaRueda(b, { type: 'attack', target: 'defender-0' }, 'golpe');
    // Rápido da dos: el primero con la carga, el segundo no. Un golpe, sin `siguientes`.
    expect(porTipo?.rapido?.golpes).toBe(2);
    expect(porTipo?.rapido?.siguientes?.max).toBeLessThan(porTipo?.rapido?.danio.max ?? 0);
    expect(porTipo?.fuerte?.siguientes).toBeNull();
  });

  it('con el doble golpe, igual: el segundo no carga', () => {
    // En el catálogo nadie carga y pega dos veces: se le da el doble golpe a la caballería.
    const { b, rng } = aLaCarga();
    const jinetes = stackById(b, 'attacker-0') as { unit: UnitInfo };
    jinetes.unit = { ...jinetes.unit, traits: [...(jinetes.unit.traits ?? []), 'double_attack'] };
    const largo = b.log.length;
    applyAction(b, { ...plantarse, ...NORMAL }, rng);
    const golpes = ataquesDe(b, largo).filter((a) => !a.retaliation);
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
    // 30 × 10 × 0,9 × 0,63 = 170,1 → 170; 40 × … = 226,8 → 227.
    expect(t.rapido).toEqual({
      danio: { min: 170, max: 227 },
      golpes: 2,
      siguientes: null,
      contraataquePorExito: [],
    });
    expect(t.fuerte!.danio).toEqual({ min: 405, max: 540 });
    // Ofensivo +3: A 8 contra D 9, ×0,975: 30 × 10 × 0,975 = 292,5 → 293; 40 × … = 390.
    expect(t.ofensivo!.danio).toEqual({ min: 293, max: 390 });
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
    expect(golpe.porTipo?.romperGuardia?.contraataquePorExito).toEqual([]);
  });

  it('al golpear, Romper guardia dice su contraataque con cada éxito que lo rebaja (R3 de QA)', () => {
    // Quedan 8 piqueros tras el golpe; con Normal, 30–40 × 8 × 0,9 = 216–288. Con
    // −3 (A 2 contra D 9, ×0,825) 198–264, con −2 (×0,85) 204–272, con −1 (×0,875) 210–280.
    const { b } = enRueda(piqueros(10), piqueros(10));
    const p = previsionDeLaRueda(b, { type: 'attack', target: 'defender-0' }, 'golpe');
    expect(p.contraataque).toEqual({ min: 216, max: 288 });
    expect(p.porTipo?.romperGuardia?.contraataquePorExito).toEqual([
      { punto: 4, danio: { min: 198, max: 264 } },
      { punto: 3, danio: { min: 204, max: 272 } },
      { punto: 2, danio: { min: 210, max: 280 } },
    ]);
    // Los demás no se lo tocan al rival (Defensivo es de quien pega).
    expect(p.porTipo?.defensivo?.contraataquePorExito).toEqual([]);
    expect(p.porTipo?.fuerte?.contraataquePorExito).toEqual([]);
    expect(p.carga).toBeNull();
  });

  it('sin contraataque, las notas del golpe no lo prometen (H9)', () => {
    expect(notaConEspada('defensivo', 'golpe', false)).not.toContain('contraataque');
    expect(notaConEspada('defensivo', 'golpe', false)).toContain('no te devuelven el golpe');
    expect(notaConEspada('romperGuardia', 'golpe', false)).toBe(
      'Quita ataque al rival en su próximo turno (esta vez no te devuelve el golpe); −3 con éxito máximo, −2 alto, −1 medio, nada bajo o mínimo.',
    );
    // La Finta no tiene que ver con el contraataque: la misma nota con él y sin él.
    expect(notaConEspada('finta', 'golpe', false)).toBe(notaConEspada('finta', 'golpe', true));
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
      applyAction(r.b, golpeConLaRueda('romperGuardia', respuesta), r.rng);
      const contra = ataquesDe(r.b).find((a) => a.retaliation)?.damage ?? -1;
      expect(contra, respuesta).toBeGreaterThanOrEqual(romper.contraataque?.danio.min ?? 0);
      expect(contra, respuesta).toBeLessThanOrEqual(romper.contraataque?.danio.max ?? 0);
    }
    // Defensivo: quien pega lleva +3 defensa al recibirlo (D 12: ×0,825).
    expect(prevision('defensivo').contraataque?.danio.min).toBe(198);
  });

  it('con las tres ruedas, golpe y respuesta, con contraataque y sin él (QA de la complejidad, vuelta 1)', () => {
    // La previsión del golpe suponía Normal para el contraataque de referencia: en la
    // de 3, sin Normal, lanzaba, la rueda de la persona no se abría y su unidad se
    // quedaba plantada sin salida. Cada rueda, con lo suyo y solo lo suyo.
    const golpe = { type: 'attack', target: 'defender-0' } as const;
    for (const n of TIPOS_DE_LAS_RUEDAS) {
      const forma = RUEDAS[n];
      const conRueda = () => enRueda(piqueros(10), piqueros(10), { combate: combateCon(7, n) }).b;
      const b = conRueda();
      const alGolpear = previsionDeLaRueda(b, golpe, 'golpe');
      expect(Object.keys(alGolpear.porTipo ?? {}), `rueda de ${n}`).toEqual([...forma.golpes]);
      expect(alGolpear.sinContraataque).toBeNull();
      // Quedan 8 piqueros tras un golpe en el medio (315): 30–40 × 8 × 0,9 = 216–288.
      // Sin Normal, el golpe sin rueda cae en cualquier punto: del mínimo (270, quedan
      // 9: 40 × 9 × 0,9 = 324) al máximo (360, quedan 8: 216).
      expect(alGolpear.contraataque, `rueda de ${n}`).toEqual(
        forma.centro ? { min: 216, max: 288 } : { min: 216, max: 324 },
      );
      const alResponder = previsionDeLaRueda(b, golpe, 'respuesta');
      expect(Object.keys(alResponder.porTipo ?? {}), `rueda de ${n}`).toEqual([...forma.golpes]);
      expect(alResponder.contraataque).toBeNull();

      // Sin contraataque: el golpe no lo prevé ni lo rebaja, y la respuesta no tiene daño.
      const sin = conRueda();
      stackById(sin, 'defender-0').retaliated = true;
      const sinAlGolpear = previsionDeLaRueda(sin, golpe, 'golpe');
      expect(Object.keys(sinAlGolpear.porTipo ?? {})).toEqual([...forma.golpes]);
      expect(sinAlGolpear.contraataque).toBeNull();
      for (const t of forma.golpes) {
        expect(sinAlGolpear.porTipo?.[t]?.contraataquePorExito, `${t} en la de ${n}`).toEqual([]);
      }
      expect(previsionDeLaRueda(sin, golpe, 'respuesta')).toMatchObject({
        porTipo: null,
        sinContraataque: 'Piquero ya devolvió un golpe esta ronda',
      });
    }
  });

  it('en la de 3, el «Rápido» rebaja el contraataque a medias, frente al golpe sin rueda', () => {
    // Rápido-romper guardia con la Espada quita −1 con éxito alto o máximo (la mitad
    // de −2 y −3). Dos golpes de 37–40 × 10 × 0,9 × 0,56 (186 y 202) dejan 8:
    // A 4 contra D 9, ×0,875: 30–40 × 8 × 0,875 = 210–280. En un ciclo no hay
    // éxito alto (QA, vuelta 2): solo el máximo lo rebaja.
    const { b } = enRueda(piqueros(10), piqueros(10), { combate: combateCon(7, 3) });
    const p = previsionDeLaRueda(b, { type: 'attack', target: 'defender-0' }, 'golpe');
    expect(p.porTipo?.rapidoRomper?.contraataquePorExito).toEqual([
      { punto: 4, danio: { min: 210, max: 280 } },
    ]);
    expect(p.porTipo?.ofensivoFuerte?.contraataquePorExito).toEqual([]);
    expect(p.porTipo?.defensivoFinta?.contraataquePorExito).toEqual([]);
  });

  it('la previsión de un golpe elegido usa su sector y sus golpes', () => {
    const { b } = enRueda(piqueros(10), piqueros(10));
    const p = previsionDe(b, { type: 'attack', target: 'defender-0', golpe: 'rapido' });
    expect(p).toMatchObject({ golpes: 2, danio: { min: 170, max: 227 } });
  });
});

describe('la IA elige a ciegas', () => {
  it('reparte con los pesos de `data/rueda.json` (todos iguales: ~1/7 cada uno)', () => {
    expect(new Set(Object.values(PESOS_DE_LA_RUEDA.golpe))).toEqual(new Set([1]));
    const rng = createRng(11);
    const cuenta = new Map<TipoDeGolpe, number>();
    for (let i = 0; i < 7000; i++) {
      const t = elegirEnLaRueda('golpe', rng, RUEDA_DE_7);
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

  it('lo que no es un golpe, `completarCruce` no toca ni la acción ni el `Rng`', () => {
    const rng = createRng(1);
    const b = createBattle(bando(piqueros(1)), bando(piqueros(1)), rng, COMBATE_COMPLETO);
    const c = contando(createRng(3));
    const accion: BattleAction = { type: 'end_turn' };
    expect(completarCruce(b, accion, c.rng)).toEqual({ falta: null, accion });
    expect(completarCruce(b, accion, c.rng).accion).toBe(accion);
    expect(c.ints()).toBe(0);
  });

  it('`completarCruce` elige solo por los bandos de la IA, y se para en el primero de una persona', () => {
    const accion: BattleAction = { type: 'attack', target: 'defender-0' };
    // El golpe es de la persona: falta él, y la respuesta no se sortea aún.
    const { b, rng } = enRueda(piqueros(5), piqueros(5));
    const c = contando(rng);
    expect(completarCruce(b, accion, c.rng, (quien) => quien.side === 'defender')).toEqual({
      falta: 'golpe',
      accion,
    });
    expect(c.ints()).toBe(0);
    // El golpe es de la IA y la respuesta de la persona: un sorteo, y falta ella.
    const r = completarCruce(b, accion, c.rng, (quien) => quien.side === 'attacker');
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
      const b = conManosDePrueba(
        createBattle(
          bando([
            { creature: TROPA, count: 8 },
            { creature: PESADA, count: 2 },
          ]),
          bando([
            { creature: NO_MUERTO, count: 20 },
            { creature: 'caballero-de-la-muerte', count: 3 },
          ]),
          rng,
          COMBATE_COMPLETO,
        ),
        // La Finta en el nivel 6 (resta de 0 a 2): con la de la Espada (de 1 a 5)
        // a estas criaturas pocas veces les queda algo que andar tras golpear.
        { ...nivelesDeLaEspada(), finta: 6 },
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
  it('nombra el efecto como la rueda de la batalla: en la de 3, el «Rápido» que quita ataque dice «Rápido»', () => {
    // Rápido gana a Defensivo: máximo, y su parte de Romper guardia quita a la
    // mitad (con la Espada, −3 → −1). El parte decía «Romper guardia», que en la de
    // 3 no se elige nunca (/simplify, hallazgo 1).
    const { b, rng } = enRueda(piqueros(10), piqueros(10), { combate: { tope: 7, rueda: 3 } });
    applyAction(b, golpeConLaRueda('rapidoRomper', 'defensivoFinta'), rng);
    expect(stackById(b, 'defender-0').effects).toEqual([
      expect.objectContaining({ kind: 'attack', amount: -1, source: 'rapidoRomper' }),
    ]);
    const parte = marcadoDe(renderBattleLog(b, null));
    expect(parte).toContain('Rápido contra Defensivo: máximo');
    expect(parte).toContain(
      'Rápido sobre Piquero, del defensor: ataque -1 hasta que termine su próximo turno',
    );
    expect(parte).not.toContain('Romper guardia');
  });

  it('«Romper guardia contra Defensivo: alto; contraataque bajo», y sin contraataque, sin él', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    applyAction(b, golpeConLaRueda('romperGuardia', 'defensivo'), rng);
    const parte = marcadoDe(renderBattleLog(b, null));
    expect(parte).toContain('Romper guardia contra Defensivo: alto; contraataque bajo');
    // Romper guardia con éxito alto, con su duración de verdad.
    expect(parte).toContain(
      'Romper guardia sobre Piquero, del defensor: ataque -2 hasta que termine su próximo turno',
    );
    // Y Defensivo, hasta que empiece.
    const d = enRueda(piqueros(10), piqueros(10));
    // (Lo de la rueda de 3, en el test de abajo.)
    applyAction(d.b, golpeConLaRueda('defensivo', 'normal'), d.rng);
    expect(marcadoDe(renderBattleLog(d.b, null))).toContain(
      'Defensivo sobre Piquero, del atacante: defensa +3 hasta que empiece su próximo turno',
    );
    expect(
      contraataqueDelCruce(
        b.log,
        b.log.findIndex((e) => e.kind === 'cruce'),
      ),
    ).toBe(1);

    const { b: b2, rng: r2 } = enRueda(piqueros(10), piqueros(1));
    applyAction(b2, golpeConLaRueda('fuerte', 'rapido'), r2);
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
const deLaArena = (u: string | Unidad): FuenteDeArena =>
  delBorrador(typeof u === 'string' ? unidadDeArena(u) : u);

/** Los de estas pruebas: dos jinetes que cargan (`JINETE` y este), un piquero y lo demás. */
const JINETE_DE_LA_IA = 'jinete-de-plaga';
const PIQUERO = 'imperio-piquero';
/** El que no recibe contraataques: un espectro con `no_retaliation`. */
const SIN_RESPUESTA = (): Unidad =>
  unidadDeArena('espectro', { traits: ['undead', 'no_retaliation'] });

/** Una sesión con la rueda, empezada: cada bando, sus unidades y si las lleva la IA. */
function sesion(
  izquierda: { readonly ids: readonly (string | Unidad)[]; readonly ia: boolean },
  derecha: { readonly ids: readonly (string | Unidad)[]; readonly ia: boolean },
  semilla = 1,
  combate: ReglasDelCombate = COMBATE_COMPLETO,
): SesionDeArena {
  const lado = (l: typeof izquierda) =>
    l.ids.map((u) => ({ unidad: typeof u === 'string' ? unidadDeArena(u) : u, ia: l.ia }));
  const s = sesionDeArena(lado(izquierda), lado(derecha), semilla, { combate });
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
    porciento: 25,
  });
  return { s, ataque };
}

describe('la sesión de la arena con la rueda', () => {
  it('tras la carrera la rueda dice la carga de sus cifras y Rápido va en dos líneas (R5, R6)', () => {
    const { s, ataque } = jineteALaCarga();
    s.playBattleAction(ataque);
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('la rueda no se abre tras la carrera');
    expect(p.prevision.carga).toBe('carga de 5 casillas montada, +25 %');
    const m = marcadoDe(renderEleccion(s.battle, p, null, caraDeLaArena(s)));
    expect(m).toContain('Las cifras llevan la carga de 5 casillas montada, +25 %');
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

  it('con la rueda de 3, Yo contra IA: golpear abre sus tres sectores y elegir da el golpe (QA, vuelta 1)', () => {
    // Antes la unidad se plantaba y la rueda no se abría: la previsión suponía
    // Normal, y en la arena no había ni «Resolver sola» para salir.
    const s = sesion(
      { ids: [JINETE, PIQUERO], ia: false },
      { ids: [PIQUERO, PIQUERO], ia: true },
      1,
      combateCon(7, 3),
    );
    hastaLaRueda(s, true, 'golpe');
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('la rueda de 3 no se abre al golpear');
    expect(s.status).toBe('');
    expect(Object.keys(p.prevision.porTipo ?? {})).toEqual([
      'ofensivoFuerte',
      'rapidoRomper',
      'defensivoFinta',
    ]);
    const m = marcadoDe(renderEleccion(s.battle, p, 'attacker', caraDeLaArena(s)));
    expect(m.match(/data-golpe="[a-zA-Z]+"/g)).toEqual([
      'data-golpe="ofensivoFuerte"',
      'data-golpe="rapidoRomper"',
      'data-golpe="defensivoFinta"',
    ]);
    const antes = s.battle.log.length;
    s.elegirEnLaRueda('ofensivoFuerte');
    expect(s.battle.log.slice(antes).find((e) => e.kind === 'cruce')).toMatchObject({
      stack: p.atacante.id,
      golpe: 'ofensivoFuerte',
    });
    // Dado: si algo queda plantado es ya el golpe de la IA, que espera la respuesta.
    expect(s.battle.golpeEnCurso?.stack).not.toBe(p.atacante.id);
  });

  it('en la respuesta de una rueda de ciclo, la guía dice el ciclo y cada nota a quién gana (H2 de QA, vuelta 1)', () => {
    // Antes la guía decía para toda rueda «si lo aciertas recibes el mínimo y
    // devuelves el máximo», que solo vale en la de 7: en un ciclo, el mismo da el
    // medio, y nada decía quién gana a quién.
    const s = sesion(
      { ids: [PIQUERO], ia: false },
      { ids: [JINETE_DE_LA_IA], ia: true },
      2,
      combateCon(7, 3),
    );
    hastaLaRueda(s, false, 'respuesta');
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('la rueda no pide la respuesta');
    const m = marcadoDe(renderEleccion(s.battle, p, 'attacker', caraDeLaArena(s)));
    expect(m).toContain(dichoDelCruce(RUEDAS[3]));
    // Con tres tipos no hay ninguno enfrente (QA, vuelta 2).
    expect(m).not.toContain('enfrente');
    expect(m).not.toContain('si lo aciertas');
    expect(m).toContain('Gana a Rápido y pierde con Defensivo.');
    expect(m).toContain('Gana a Defensivo y pierde con Ofensivo.');
    expect(m).toContain('Gana a Ofensivo y pierde con Rápido.');
  });

  it('a quién gana cada tipo: el siguiente del anillo; en la de 7 y con Normal, nada', () => {
    expect(dichoDelCiclo('ofensivoFuerte', RUEDAS[5])).toBe(
      'Gana a Rápido y pierde con Defensivo-finta.',
    );
    expect(dichoDelCiclo('defensivoFinta', RUEDAS[5])).toBe(
      'Gana a Ofensivo-fuerte y pierde con Romper guardia.',
    );
    expect(dichoDelCiclo('normal', RUEDAS[5])).toBe('');
    expect(dichoDelCiclo('fuerte', RUEDAS[7])).toBe('');
    // Lo que dice es lo que cuenta el cruce: gana → el máximo; pierde → el mínimo.
    for (const forma of [RUEDAS[3], RUEDAS[5]]) {
      for (const t of forma.anillo) {
        const [, gana, pierde] =
          /^Gana a (.+) y pierde con (.+)\.$/.exec(dichoDelCiclo(t, forma)) ?? [];
        const de = (n: string | undefined) =>
          forma.anillo.find((x) => nombreEnLaRueda(x, forma) === n) as TipoDeGolpe;
        expect(puntoDelCruceEn(t, de(gana), forma), `${t} contra ${gana}`).toBe(4);
        expect(puntoDelCruceEn(t, de(pierde), forma), `${t} contra ${pierde}`).toBe(0);
      }
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
      carrera: expect.objectContaining({ at: from }),
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
    // Su turno sigue: puede golpear desde ahí (ya sin carrera) o terminar.
    expect(s.turnoPropio?.stack.id).toBe('attacker-0');
    expect(s.battle.turno?.n).toBe(n);
    const legales = s.battleLegalActions();
    expect(legales).toContainEqual({ type: 'attack', target: ataque.target });
    expect(legales).toContainEqual({ type: 'end_turn' });
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
    s.playBattleAction({ type: 'end_turn' });
    expect(s.status).toBe('Elige antes en la rueda del golpe.');
    expect(s.retocar({ kind: 'piezas', equipo: EQUIPO_DEL_JUEGO })).toBe(
      'Elige antes en la rueda del golpe.',
    );
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
        combate: COMBATE_COMPLETO,
        izquierda: {
          unidades: [PIQUERO, TROPA].map(deLaArena),
          heroe: null,
          ia: true,
        },
        derecha: {
          unidades: [NO_MUERTO, SIN_RESPUESTA()].map(deLaArena),
          heroe: null,
          ia: true,
        },
        equipo: EQUIPO_DEL_JUEGO,
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
    // Lo que resta la Finta del mandoble del piquero con el éxito que cayó.
    const resta = casillasQueQuitaLaFinta(
      cruce.punto,
      efectoDelTipo('finta', ruedaDelGolpe(yo.unit, 'arma')),
      0,
    );
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
    s.playBattleAction({ type: 'surrender' });
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
        { ids: [PIQUERO, TROPA], ia: true },
        { ids: [NO_MUERTO, SIN_RESPUESTA()], ia: true },
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
    const m = marcadoDe(renderEleccion(s.battle, p, null, caraDeLaArena(s)));
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
    const m = marcadoDe(renderEleccion(s.battle, p, null, caraDeLaArena(s)));
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
    expect(notaConEspada('romperGuardia', 'golpe')).toBe(
      'Quita ataque al rival desde ya: en su contraataque de ahora y hasta que termine su próximo turno; −3 con éxito máximo, −2 alto, −1 medio, nada bajo o mínimo.',
    );
    // La Finta avisa de que su tramo paga salir del contacto (#259 y #263 apilados,
    // decisión del usuario, 14-10-2026; siempre desde el 19-10-2026).
    expect(notaConEspada('finta', 'golpe')).toBe(
      'Después de golpear puedes andar las casillas que te queden menos 1 con éxito máximo, 2 alto, 3 medio, 4 bajo, 5 mínimo. Andar cierra el turno. Salir del contacto cuesta encima, como cualquier paso: 1 más por cada enemigo a tu lado.',
    );
    // Rápido avisa de la armadura, al golpear y al responder.
    expect(notaConEspada('rapido', 'golpe')).toBe(
      '2 golpes de daño ×0,63 cada uno (con doble golpe, el doble). Cada golpe resta la armadura del rival: contra armadura, pierde.',
    );
    expect(notaConEspada('defensivo', 'golpe')).toBe(
      '+3 defensa desde ya: cubre el contraataque de ahora y dura hasta que empiece tu próximo turno.',
    );
    expect(notaConEspada('ofensivo', 'golpe')).toBe('+3 ataque en este golpe.');
    expect(notaConEspada('fuerte', 'golpe')).toBe('Daño ×1,5.');
    // En la respuesta: Ofensivo, Defensivo, Finta y Romper guardia solo cuentan para el
    // cruce; Fuerte y Rápido dicen su contraataque.
    for (const t of ['ofensivo', 'defensivo', 'finta', 'romperGuardia'] as const) {
      expect(notaConEspada(t, 'respuesta'), t).toBe(
        'En la respuesta no tiene efecto: solo cuenta para el cruce, que decide cuánto te duele el golpe y dónde cae tu contraataque.',
      );
    }
    expect(notaConEspada('fuerte', 'respuesta')).toBe(
      'Su efecto no toca el golpe que recibes (ese lo decide el cruce): tu contraataque hace daño ×1,5.',
    );
    expect(notaConEspada('rapido', 'respuesta')).toBe(
      'Su efecto no toca el golpe que recibes (ese lo decide el cruce): contraatacas con 2 golpes de daño ×0,63 cada uno. Cada golpe resta la armadura del rival: contra armadura, pierde.',
    );
    for (const t of TIPOS_DE_GOLPE) {
      // El doble golpe no dobla el contraataque (`golpesDe`): la respuesta no lo promete.
      expect(notaConEspada(t, 'respuesta'), t).not.toContain('doble golpe');
    }
    // Las notas salen de `data/rueda.json`: con otras cifras, otra frase.
    const otras = validarRueda({
      ...ruedaJson,
      romperGuardia: { conExitoMaximo: [-1, -1, -1, -4, -4, -5, -6] },
    });
    expect(otras.tabla.romperGuardia[3]).toBe(-4);
    // Y la rueda pinta la de su fase: en la respuesta, la de la respuesta.
    const s = sesion({ ids: [JINETE], ia: false }, { ids: [PIQUERO], ia: false });
    // El golpe es del piquero: pegado al jinete, que cierra su turno sin golpear.
    // Hasta el 26-10-2026 la moral alta de una sola facción le daba al piquero un
    // segundo turno en la ronda 1 y golpeaba él primero; sin ella llega antes el
    // jinete, y lo mata de un golpe.
    stackById(s.battle, 'defender-0').hex = { col: 1, row: 4 };
    expect(s.turnoPropio?.stack.id).toBe('attacker-0');
    s.playBattleAction({ type: 'end_turn' });
    hastaLaRueda(s, true);
    const golpe = s.ruedaPendiente;
    if (golpe === null) throw new Error('la rueda no pide el golpe');
    expect(golpe.atacante.id).toBe('defender-0');
    const enElGolpe = marcadoDe(renderEleccion(s.battle, golpe, null, caraDeLaArena(s)));
    expect(enElGolpe).toContain('cubre el contraataque de ahora');
    // Con las cifras del arma de quien pega (18-10-2026): el piquero lleva el
    // mandoble, con Romper guardia en el nivel 4 (la espada, en el 3, quita 3).
    expect(enElGolpe).toContain('−4 con éxito máximo');
    expect(enElGolpe).not.toContain('En la respuesta no tiene efecto');
    s.elegirEnLaRueda('fuerte');
    const respuesta = s.ruedaPendiente;
    if (respuesta === null) throw new Error('la rueda no pide la respuesta');
    const enLaRespuesta = marcadoDe(renderEleccion(s.battle, respuesta, null, caraDeLaArena(s)));
    expect(enLaRespuesta).toContain('En la respuesta no tiene efecto: solo cuenta para el cruce');
    // Responde el jinete, con espada y lanza: de cada tipo, el mejor de las dos (Fuerte,
    // el nivel 4 de la lanza).
    expect(enLaRespuesta).toContain('tu contraataque hace daño ×1,67');
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
      const nota = notaConEspada(t, 'respuesta', false);
      expect(nota, t).toMatch(/^Esta vez no devuelves el golpe/);
      expect(nota, t).toContain('solo cuenta para el cruce');
      // Ni «contraatacas», ni «tu contraataque», ni un efecto que no va a actuar.
      expect(nota, t).not.toMatch(/contraata|ataque al|defensa|daño ×/);
    }
    // La rueda pinta esas, en la nota y en la etiqueta de cada sector.
    const m = marcadoDe(renderEleccion(s.battle, p, null, caraDeLaArena(s)));
    expect(m).not.toContain('contraatacas');
    expect(m).not.toContain('tu contraataque');
    expect(m.match(/Esta vez no devuelves el golpe/g)?.length).toBe(2 * TIPOS_DE_GOLPE.length);
  });

  it('la rueda dice quién es quién por quien mira: «Tu golpe», «Tu respuesta», tú y el rival (F6)', () => {
    // Con los dos bandos de la persona (la arena) se dicen por su lado; con uno
    // solo, quien elige es quien mira (`SesionConRueda.quienMira`, de la sesión).
    const s = sesion({ ids: [JINETE], ia: false }, { ids: [PIQUERO], ia: false });
    expect(s.quienMira).toBeNull();
    hastaLaRueda(s, true);
    const golpe = s.ruedaPendiente;
    if (golpe === null) throw new Error('la rueda no pide el golpe');
    const enLaArena = marcadoDe(renderEleccion(s.battle, golpe, s.quienMira, caraDeLaArena(s)));
    expect(enLaArena).toMatch(/Golpe del bando (?:izquierdo|derecho)/);
    expect(enLaArena).not.toContain('class="de-quien"');
    // Con un solo bando de la persona, la arena también lo dice.
    expect(sesion({ ids: [JINETE], ia: false }, { ids: [PIQUERO], ia: true }).quienMira).toBe(
      'attacker',
    );
    const tuyo = marcadoDe(renderEleccion(s.battle, golpe, golpe.bando, null));
    expect(tuyo).toContain('<h2 id="titulo-de-la-rueda">Tu golpe</h2>');
    // Sin la cara de la arena (la partida), las figuras de los dos, sin botón.
    for (const x of [golpe.atacante, golpe.objetivo]) {
      expect(tuyo).toContain(
        `<span class="icono-de-contrincante"><canvas class="figura" data-figura="${x.body}" data-bando="${x.side}"`,
      );
    }
    expect(tuyo).not.toContain('ficha-en-la-rueda');
    expect(tuyo).toMatch(
      new RegExp(
        `data-contrincante="${golpe.atacante.id}".*?\\(tú\\).*data-contrincante="${golpe.objetivo.id}".*?\\(rival\\)`,
      ),
    );
    s.elegirEnLaRueda('fuerte');
    const respuesta = s.ruedaPendiente;
    if (respuesta === null) throw new Error('la rueda no pide la respuesta');
    const suya = marcadoDe(renderEleccion(s.battle, respuesta, respuesta.bando, null));
    expect(suya).toContain('<h2 id="titulo-de-la-rueda">Tu respuesta</h2>');
  });

  it('el desenlace: los dos elegidos, el rótulo, el medidor y los tramos en orden', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    applyAction(b, golpeConLaRueda('romperGuardia', 'defensivo'), rng);
    const i = b.log.findIndex((e) => e.kind === 'cruce');
    const e = b.log[i];
    if (e?.kind !== 'cruce') throw new Error('sin cruce');
    const m = marcadoDe(renderDesenlace(b, e, contraataqueDelCruce(b.log, i), null, null));
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

// ------------------------------------------------- las ruedas de 5 y de 3 (22-10-2026)

describe('las ruedas de 5 y de 3: piedra, papel o tijera, y las fusiones a la mitad', () => {
  /** La tabla de una rueda: cada tipo contra cada uno, en el orden de sus teclas. */
  const tablaDe = (n: 3 | 5 | 7) => {
    const forma = RUEDAS[n];
    const tipos = forma.golpes;
    return Object.fromEntries(
      tipos.map((a) => [a, tipos.map((b) => puntoDelCruceEn(a, b, forma))]),
    );
  };

  it('una rueda de ciclo solo habla de los éxitos que da su cruce: notas, guía, previsión y medidor (QA, vuelta 2)', () => {
    // En un ciclo el golpe cae en el máximo, el medio o el mínimo; las notas, con
    // la tabla de cinco de la de 7, contaban también «alto» y «bajo», la guía de la
    // de 3 prometía un tipo «de enfrente» y el medidor enseñaba cinco muescas.
    expect(puntosDeLaForma(RUEDAS[7])).toEqual([0, 1, 2, 3, 4]);
    expect(puntosDeLaForma(RUEDAS[5])).toEqual([0, 2, 4]);
    expect(puntosDeLaForma(RUEDAS[3])).toEqual([0, 2, 4]);
    expect(dichoDelCruce(RUEDAS[5])).toContain('con el mismo o el de enfrente, en el medio.');
    expect(dichoDelCruce(RUEDAS[3])).toContain('con el mismo, en el medio.');
    expect(dichoDelCruce(RUEDAS[3])).not.toContain('enfrente');

    // Un arma con cada éxito distinto en Romper guardia y en la Finta (la Maza).
    const maza = cifrasDeLosNiveles({ ...todoA(3), romperGuardia: 5, finta: 1 });
    expect(efectoDeGolpe('romperGuardia', 'golpe', true, maza, RUEDAS[7])).toContain(
      '−5 con éxito máximo, −3 alto, −2 medio, −1 bajo, nada mínimo',
    );
    expect(efectoDeGolpe('romperGuardia', 'golpe', true, maza, RUEDAS[5])).toContain(
      '−5 con éxito máximo, −2 medio, nada mínimo',
    );
    for (const n of [3, 5] as const) {
      const forma = RUEDAS[n];
      for (const c of [CON_LA_ESPADA, maza]) {
        for (const t of forma.golpes) {
          for (const papel of ['golpe', 'respuesta'] as const) {
            for (const contraataca of [true, false]) {
              const nota = efectoDeGolpe(t, papel, contraataca, c, forma);
              expect(nota, `${t} (${papel}) en la de ${n}`).not.toMatch(/\b(?:alto|bajo)\b/);
            }
          }
        }
      }
    }

    // La previsión del contraataque rebajado, solo en los puntos del cruce.
    const { b: b5 } = enRueda(piqueros(10), piqueros(10), { combate: combateCon(7, 5) });
    const p5 = previsionDeLaRueda(b5, { type: 'attack', target: 'defender-0' }, 'golpe');
    for (const t of RUEDAS[5].golpes) {
      for (const { punto } of p5.porTipo?.[t]?.contraataquePorExito ?? []) {
        expect([0, 2, 4], `${t}, punto ${punto}`).toContain(punto);
      }
    }
    expect(p5.porTipo?.romperGuardia?.contraataquePorExito.map((x) => x.punto)).toEqual([4, 2]);

    // El medidor del desenlace: tres muescas en un ciclo, cinco en la de 7.
    const muescas = (n: 3 | 7, golpe: TipoDeGolpe, respuesta: TipoDeGolpe): string[] => {
      const { b, rng } = enRueda(piqueros(10), piqueros(10), { combate: combateCon(7, n) });
      applyAction(b, golpeConLaRueda(golpe, respuesta), rng);
      const i = b.log.findIndex((e) => e.kind === 'cruce');
      const e = b.log[i];
      if (e?.kind !== 'cruce') throw new Error('sin cruce');
      const m = marcadoDe(renderDesenlace(b, e, contraataqueDelCruce(b.log, i), null, null));
      return [...m.matchAll(/data-punto="(\d)" class="muesca/g)].map((x) => x[1] as string);
    };
    expect(muescas(3, 'rapidoRomper', 'defensivoFinta')).toEqual(['0', '2', '4']);
    expect(muescas(7, 'romperGuardia', 'defensivo')).toEqual(['0', '1', '2', '3', '4']);
  });

  it('la de 7 es la de siempre: la misma tabla por la distancia en los 49 pares', () => {
    expect(RUEDAS[7].golpes).toEqual([
      'ofensivo',
      'fuerte',
      'finta',
      'defensivo',
      'rapido',
      'romperGuardia',
      'normal',
    ]);
    expect(tablaDe(7)).toEqual({
      ofensivo: [0, 1, 3, 4, 3, 1, 2],
      fuerte: [1, 0, 1, 3, 4, 3, 2],
      finta: [3, 1, 0, 1, 3, 4, 2],
      defensivo: [4, 3, 1, 0, 1, 3, 2],
      rapido: [3, 4, 3, 1, 0, 1, 2],
      romperGuardia: [1, 3, 4, 3, 1, 0, 2],
      normal: [2, 2, 2, 2, 2, 2, 2],
    });
  });

  it('la de 5, en ciclo: Def-finta > Of-fuerte > Rápido > R. guardia > Def-finta; enfrente y Normal, el medio', () => {
    expect(RUEDAS[5].golpes).toEqual([
      'ofensivoFuerte',
      'rapido',
      'romperGuardia',
      'defensivoFinta',
      'normal',
    ]);
    // Gana el golpe → 4; gana la respuesta → 0; el mismo o el de enfrente → 2.
    expect(tablaDe(5)).toEqual({
      //               OF RÁ RG DF N
      ofensivoFuerte: [2, 4, 2, 0, 2],
      rapido: /*   */ [0, 2, 4, 2, 2],
      romperGuardia: [2, 0, 2, 4, 2],
      defensivoFinta: [4, 2, 0, 2, 2],
      normal: /*   */ [2, 2, 2, 2, 2],
    });
  });

  it('la de 3, en ciclo y sin centro: Defensivo gana a Ofensivo, Ofensivo a Rápido y Rápido a Defensivo', () => {
    expect(RUEDAS[3].golpes).toEqual(['ofensivoFuerte', 'rapidoRomper', 'defensivoFinta']);
    expect(tablaDe(3)).toEqual({
      ofensivoFuerte: [2, 4, 0],
      rapidoRomper: [0, 2, 4],
      defensivoFinta: [4, 0, 2],
    });
    // Los nombres de la persona en la de 3 son los de la petición.
    expect(RUEDAS[3].renombra).toEqual({
      ofensivoFuerte: 'Ofensivo',
      rapidoRomper: 'Rápido',
      defensivoFinta: 'Defensivo',
    });
  });

  it('un tipo de otra rueda lanza con su motivo, en el cruce y en la batalla', () => {
    expect(() => puntoDelCruceEn('fuerte', 'ofensivoFuerte', RUEDAS[3])).toThrow(
      '«fuerte» no es un golpe de la rueda de 3: valen ofensivoFuerte, rapidoRomper, defensivoFinta',
    );
    expect(() => puntoDelCruceEn('normal', 'rapido', RUEDAS[3])).toThrow('rueda de 3');
    expect(() => puntoDelCruceEn('ofensivoFuerte', 'normal', RUEDAS[7])).toThrow('rueda de 7');
    const { b, rng } = enRueda(piqueros(10), piqueros(10), { combate: { tope: 7, rueda: 3 } });
    expect(b.rueda).toBe(3);
    const largo = b.log.length;
    expect(() => applyAction(b, golpeConLaRueda('fuerte', 'defensivoFinta'), rng)).toThrow(
      '«fuerte» no es un golpe de la rueda de 3: valen ofensivoFuerte, rapidoRomper, defensivoFinta',
    );
    expect(() => applyAction(b, golpeConLaRueda('ofensivoFuerte', 'normal'), rng)).toThrow(
      '«normal» no es un golpe de la rueda de 3',
    );
    expect(b.log.length).toBe(largo);
    // Uno de los suyos, sí: Rápido contra Defensivo gana el golpe, en el máximo.
    applyAction(b, golpeConLaRueda('rapidoRomper', 'defensivoFinta'), rng);
    expect(b.log.find((e) => e.kind === 'cruce')).toMatchObject({ punto: 4 });
  });

  it('con la Espada (todo a 3), cada fusión da cada parte a la mitad', () => {
    expect(efectoDelTipo('ofensivoFuerte', CON_LA_ESPADA)).toMatchObject({
      ataque: 1,
      porcentaje: 125,
      defensa: 0,
      finta: null,
    });
    expect(efectoDelTipo('defensivoFinta', CON_LA_ESPADA)).toMatchObject({
      ataque: 0,
      porcentaje: 100,
      defensa: 1,
      finta: { casillas: CON_LA_ESPADA.finta.casillas, mitad: true },
    });
    const rr = efectoDelTipo('rapidoRomper', CON_LA_ESPADA);
    expect(rr).toMatchObject({ porcentaje: 56, ataque: 0, defensa: 0, finta: null });
    // Cuántos golpes no es del arma: los de su parte de Rápido (`golpesDelTipo`).
    expect([golpesDelTipo('ofensivoFuerte'), golpesDelTipo('rapidoRomper')]).toEqual([1, 2]);
    expect(rr.quitaAtaque).toEqual({ 0: 0, 1: 0, 2: 0, 3: -1, 4: -1 });
    // Los sueltos, lo de siempre.
    expect(efectoDelTipo('ofensivo', CON_LA_ESPADA).ataque).toBe(3);
    expect(efectoDelTipo('fuerte', CON_LA_ESPADA).porcentaje).toBe(150);
    expect(efectoDelTipo('rapido', CON_LA_ESPADA).porcentaje).toBe(63);
    // Y su nota lo dice con las cifras a medias.
    expect(notaConEspada('ofensivoFuerte', 'golpe', true, RUEDAS[5])).toBe(
      'La mitad de Ofensivo y de Fuerte: +1 ataque en este golpe. Daño ×1,25.',
    );
    expect(notaConEspada('defensivoFinta', 'golpe', true, RUEDAS[3])).toContain(
      'puedes andar la mitad de las casillas que te queden menos',
    );
    expect(notaConEspada('defensivoFinta', 'respuesta', true, RUEDAS[3])).toBe(
      'En la respuesta no tiene efecto: solo cuenta para el cruce, que decide cuánto te duele el golpe y dónde cae tu contraataque.',
    );
  });

  it('en todo nivel del 0 al 6, cada parte de una fusión queda por debajo de su tipo suelto (o igual en lo neutro)', () => {
    const NEUTRO = { ataque: 0, defensa: 0, porcentajeFuerte: 100 };
    for (let n = 0; n <= 6; n++) {
      const c = cifrasDeLosNiveles(todoA(n));
      const cerca = (fus: number, suelto: number, neutro: number, que: string): void => {
        const d = Math.abs(suelto - neutro);
        const df = Math.abs(fus - neutro);
        if (d === 0) expect(df, `${que}, nivel ${n}`).toBe(0);
        else expect(df, `${que}, nivel ${n}`).toBeLessThan(d);
      };
      const of = efectoDelTipo('ofensivoFuerte', c);
      cerca(of.ataque, c.ofensivo.ataque, NEUTRO.ataque, 'ataque de Of-fuerte');
      cerca(of.porcentaje, c.fuerte.porcentaje, NEUTRO.porcentajeFuerte, 'daño de Of-fuerte');
      const df = efectoDelTipo('defensivoFinta', c);
      cerca(df.defensa, c.defensivo.defensa, NEUTRO.defensa, 'defensa de Def-finta');
      const rr = efectoDelTipo('rapidoRomper', c);
      expect(golpesDelTipo('rapidoRomper')).toBe(c.rapido.golpes);
      cerca(rr.porcentaje, c.rapido.porcentaje, Math.floor(100 / c.rapido.golpes), 'Rápido-romper');
      for (const p of [0, 1, 2, 3, 4] as const) {
        cerca(rr.quitaAtaque[p], c.romperGuardia.ataque[p], 0, `romper con éxito ${p}`);
      }
    }
  });

  it('Defensivo-finta deja andar la mitad de lo que dejaría la Finta, y pone la mitad de la defensa', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10), {
      combate: { tope: 7, rueda: 5 },
    });
    const yo = stackById(b, 'attacker-0');
    yo.effects = [{ kind: 'speed', amount: 2, source: 'haste', roundsLeft: 5 }];
    expect(pasosQueQuedan(b, yo)).toBe(6);
    // Contra Ofensivo-fuerte gana el golpe: máximo, la Finta de la Espada resta 1.
    // Suelta dejaría 6 − 1 = 5; a la mitad, ⌊5 / 2⌋ = 2.
    applyAction(b, golpeConLaRueda('defensivoFinta', 'ofensivoFuerte'), rng);
    expect(b.log.find((e) => e.kind === 'cruce')).toMatchObject({ punto: 4 });
    expect(activeStack(b)?.id).toBe('attacker-0');
    expect(pasosQueQuedan(b, yo)).toBe(2);
    expect(b.turno?.finta).toBe(4);
    // La defensa, la de Defensivo a la mitad (+1), con su origen en el golpe jugado.
    expect(yo.effects.find((e) => e.kind === 'defense')).toMatchObject({
      amount: 1,
      source: 'defensivoFinta',
    });
    expect(casillasQueQuitaLaFinta(4, efectoDelTipo('defensivoFinta', CON_LA_ESPADA), 6)).toBe(4);
    expect(casillasQueQuitaLaFinta(4, efectoDelTipo('finta', CON_LA_ESPADA), 6)).toBe(1);
  });

  it('la IA elige solo entre los de la rueda de su batalla', () => {
    const rng = createRng(5);
    for (const n of [3, 5, 7] as const) {
      const tipos = new Set(RUEDAS[n].golpes);
      for (let i = 0; i < 60; i++) {
        expect(tipos.has(elegirEnLaRueda('golpe', rng, RUEDAS[n]))).toBe(true);
      }
    }
  });
});
