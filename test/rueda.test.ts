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
import { BattleAnimator, DURACION } from '../src/client/anim.js';
import {
  caraDeLaArena,
  renderPanelDeBatalla,
  rotuloDelTurno,
} from '../src/client/arena/paneles.js';
import { marcadoDe } from '../src/client/html.js';
import { renderEleccion, tramosDelDesenlace } from '../src/client/rueda/rueda.js';
import { SesionDeArena } from '../src/client/session.js';
import { renderBattleLog } from '../src/client/views/panels.js';
import { completarCruce, elegirEnLaRueda, pasoDelCruce } from '../src/core/ai/rueda.js';
import { autoResolve } from '../src/core/ai/tactics.js';
import type { FuenteDeArena } from '../src/core/arena.js';
import { golpesDe, ruedaDelGolpe } from '../src/core/battle/armas.js';
import {
  activeStack,
  applyAction,
  type BattleSide,
  casillasDeCarga,
  createBattle,
  legalActions,
  pasosQueQuedan,
  previsionDeLaRueda,
  previsionDelGolpeQueViene,
  soltarElGolpe,
  stackById,
} from '../src/core/battle/battle.js';
import {
  cifrasDeLosNiveles,
  golpesDelTipo,
  type Punto,
} from '../src/core/battle/cifras-de-la-rueda.js';
import {
  damageMultiplier,
  effectiveAttack,
  effectiveDefense,
  stackHp,
} from '../src/core/battle/damage.js';
import {
  casillasQueQuitaLaFinta,
  contraataqueDelCruce,
  dichoDelCiclo,
  dichoDelCruce,
  efectoDeGolpe,
  efectoDelTipo,
  type FormaDeLaRueda,
  nombreEnLaRueda,
  puntoDelContraataque,
  puntoDelCruce as puntoDelCruceEn,
  puntosDeLaForma,
  RUEDAS,
  TIPOS_DE_LAS_RUEDAS,
  type TipoDeGolpe,
  tiradaDelPunto,
} from '../src/core/battle/rueda.js';
import type { BattleAction, BattleEvent, BattleState } from '../src/core/battle/types.js';
import { unidad } from '../src/core/catalogo.js';
import { COMBATE_COMPLETO, combateCon, type ReglasDelCombate } from '../src/core/combate.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/hero/equipo.js';
import { createRng, type Rng, sortearPorPesos } from '../src/core/rng.js';
import type { Hex, NivelesDeLaRueda, Stack, UnitInfo } from '../src/core/types.js';
import { cuerpoDeCombate, nivelesDeLaEspada, type Unidad } from '../src/core/unidad.js';
import { bando } from './batalla-de-prueba.js';
import {
  type Ataque,
  ataquesDe,
  conCifrasAMano,
  conManosDePrueba,
  delBorrador,
  desenlaceDe,
  empezarTalCual,
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
});

describe('el daño fijo por el cruce (piqueros: A 5, D 9 → ×0,9; daño 30-40; 150 PV; con los niveles de la Espada)', () => {
  it('Normal contra cualquiera, el medio: 35 × 10 × 0,9 = 315', () => {
    for (const r of TIPOS_DE_GOLPE.filter((t) => t !== 'romperGuardia' && t !== 'finta')) {
      const { b, rng } = enRueda(piqueros(10), piqueros(10));
      applyAction(b, golpeConLaRueda('normal', r), rng);
      expect(ataquesDe(b)[0]?.damage, `normal contra ${r}`).toBe(315);
    }
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
});

/**
 * Los niveles del arma de las pruebas de los efectos: de la prueba, no de un arma
 * del catálogo. Lo que da cada nivel sale de `data/rueda.json` por el núcleo
 * (`cifrasDeLosNiveles`): lo que se prueba es que el golpe deja eso, con su éxito y
 * su caducidad, no cuánto es.
 */
const NIVELES_DE_PRUEBA: NivelesDeLaRueda = {
  ofensivo: 2,
  fuerte: 4,
  finta: 3,
  defensivo: 5,
  rapido: 1,
  romperGuardia: 6,
};
const DE_PRUEBA = cifrasDeLosNiveles(NIVELES_DE_PRUEBA);

/** Diez piqueros contra diez, pegados, con las manos de los niveles de prueba. */
const conNivelesDePrueba = (o: { readonly combate?: ReglasDelCombate } = {}) =>
  enRueda(piqueros(10), piqueros(10), { niveles: NIVELES_DE_PRUEBA, ...o });

/** El primer cruce del registro de `b`. */
function cruceDe(b: BattleState): Extract<BattleEvent, { kind: 'cruce' }> {
  const e = b.log.find((x) => x.kind === 'cruce');
  if (e?.kind !== 'cruce') throw new Error('sin cruce en el registro');
  return e;
}

/**
 * El contraataque de un piquero de `PIQUERO_A_MANO` en el punto `p`, con lo que le
 * quede al que contraataca (`cuantos`) y su ataque y la defensa del otro: la tirada
 * del punto por los individuos y por ataque contra defensa, redondeada.
 */
const contraataqueDePiqueros = (p: Punto, cuantos: number, ataque: number, defensa: number) => {
  const [min, max] = PIQUERO_A_MANO.damage;
  return Math.max(
    1,
    Math.round(tiradaDelPunto(min, max, p) * cuantos * damageMultiplier(ataque, defensa)),
  );
};

describe('los efectos del golpe (#263): Defensivo hasta que empiece su turno, Romper guardia por éxito', () => {
  it('Defensivo pone la defensa de su nivel ya en el contraataque, y se va al empezar su próximo turno', () => {
    const { b, rng } = conNivelesDePrueba();
    const yo = stackById(b, 'attacker-0');
    const antes = effectiveDefense(yo);
    const defensa = DE_PRUEBA.defensivo.defensa;
    expect(defensa).toBeGreaterThan(0);
    applyAction(b, golpeConLaRueda('defensivo', 'normal'), rng);
    expect(yo.effects).toEqual([
      expect.objectContaining({ kind: 'defense', amount: defensa, source: 'defensivo' }),
    ]);
    expect(effectiveDefense(yo)).toBe(antes + defensa);
    expect(b.log).toContainEqual(
      expect.objectContaining({ kind: 'effect', source: 'defensivo', vence: 'empezar' }),
    );
    // El contraataque ya la cuenta: con la defensa de antes más la del Defensivo.
    const el = stackById(b, 'defender-0');
    const contra = ataquesDe(b).find((a) => a.retaliation);
    expect(contra?.damage).toBe(
      contraataqueDePiqueros(
        puntoDelContraataque(cruceDe(b).punto),
        el.count,
        effectiveAttack(el),
        antes + defensa,
      ),
    );
    // Sigue en el turno del rival, y se va al empezar el suyo, antes de que juegue.
    expect(activeStack(b)?.id).toBe('defender-0');
    expect(effectiveDefense(yo)).toBe(antes + defensa);
    const largo = b.log.length;
    applyAction(b, { type: 'end_turn' }, rng);
    expect(activeStack(b)?.id).toBe('attacker-0');
    expect(yo.effects).toEqual([]);
    expect(effectiveDefense(yo)).toBe(antes);
    expect(b.log.slice(largo)).toContainEqual({
      kind: 'effect_end',
      stack: 'attacker-0',
      source: 'defensivo',
    });
  });

  it('Romper guardia quita lo de su nivel según el éxito del cruce, ya en el contraataque', () => {
    const quitado = new Set<number>();
    // Las respuestas que no cambian el contraataque (Fuerte y Rápido lo multiplican):
    // dan los cinco éxitos.
    const respuestas = TIPOS_DE_GOLPE.filter((r) => r !== 'fuerte' && r !== 'rapido');
    expect(new Set(respuestas.map((r) => puntoDelCruce('romperGuardia', r))).size).toBe(5);
    for (const respuesta of respuestas) {
      const que = `Romper guardia contra ${respuesta}`;
      const { b, rng } = conNivelesDePrueba();
      const el = stackById(b, 'defender-0');
      const antes = effectiveAttack(el);
      applyAction(b, golpeConLaRueda('romperGuardia', respuesta), rng);
      const { punto } = cruceDe(b);
      expect(punto, que).toBe(puntoDelCruce('romperGuardia', respuesta));
      const quita = DE_PRUEBA.romperGuardia.ataque[punto];
      quitado.add(quita);
      expect(effectiveAttack(el), que).toBe(antes + quita);
      // El contraataque, con el ataque ya rebajado.
      const yo = stackById(b, 'attacker-0');
      expect(ataquesDe(b).find((a) => a.retaliation)?.damage, que).toBe(
        contraataqueDePiqueros(
          puntoDelContraataque(punto),
          el.count,
          antes + quita,
          effectiveDefense(yo),
        ),
      );
      const efectos = b.log.flatMap((e, i) => (e.kind === 'effect' ? [{ e, i }] : []));
      if (quita === 0) {
        // Con 0 no se cuelga nada.
        expect(efectos, que).toEqual([]);
        expect(el.effects, que).toEqual([]);
        continue;
      }
      expect(
        efectos.map((x) => x.e),
        que,
      ).toEqual([
        expect.objectContaining({
          stack: 'defender-0',
          effect: 'attack',
          amount: quita,
          source: 'romperGuardia',
          vence: 'terminar',
        }),
      ]);
      // Entre el golpe y el contraataque.
      const [golpeI, contraI] = b.log.flatMap((e, i) => (e.kind === 'attack' ? [i] : []));
      const i = efectos[0]?.i ?? -1;
      expect(golpeI !== undefined && i > golpeI && contraI !== undefined && i < contraI, que).toBe(
        true,
      );
      // Quien pega, nada.
      expect(yo.effects, que).toEqual([]);
    }
    // Que el test mire más de un éxito distinto: con estos niveles no todo quita lo mismo.
    expect(quitado.size).toBeGreaterThan(1);
  });

  it('Romper guardia sigue en el próximo turno del atacado y se va al terminarlo', () => {
    const { b, rng } = conNivelesDePrueba();
    const el = stackById(b, 'defender-0');
    const antes = effectiveAttack(el);
    applyAction(b, golpeConLaRueda('romperGuardia', 'defensivo'), rng);
    const quita = DE_PRUEBA.romperGuardia.ataque[cruceDe(b).punto];
    expect(quita).toBeLessThan(0);
    expect(activeStack(b)?.id).toBe('defender-0');
    expect(effectiveAttack(el)).toBe(antes + quita);
    const largo = b.log.length;
    applyAction(b, { type: 'end_turn' }, rng);
    expect(el.effects).toEqual([]);
    expect(effectiveAttack(el)).toBe(antes);
    expect(b.log.slice(largo)).toContainEqual({
      kind: 'effect_end',
      stack: 'defender-0',
      source: 'romperGuardia',
    });
  });

  it('dos Romper guardia seguidos refrescan, no se suman: queda el último', () => {
    const { b, rng } = conNivelesDePrueba();
    const el = stackById(b, 'defender-0');
    const antes = effectiveAttack(el);
    applyAction(b, golpeConLaRueda('romperGuardia', 'normal'), rng);
    const primero = DE_PRUEBA.romperGuardia.ataque[cruceDe(b).punto];
    expect(effectiveAttack(el)).toBe(antes + primero);
    // Otro turno del atacante (a mano), y otro Romper guardia con otro éxito.
    b.turno = { n: 50, stack: 'attacker-0', gastado: 0 };
    const largo = b.log.length;
    applyAction(b, golpeConLaRueda('romperGuardia', 'finta'), rng);
    const segundo = b.log.slice(largo).find((e) => e.kind === 'cruce');
    if (segundo?.kind !== 'cruce') throw new Error('sin segundo cruce');
    const ultimo = DE_PRUEBA.romperGuardia.ataque[segundo.punto];
    expect(ultimo).not.toBe(primero);
    expect(el.effects).toEqual([
      expect.objectContaining({
        kind: 'attack',
        amount: ultimo,
        source: 'romperGuardia',
        hasta: { turno: 50, al: 'terminar' },
      }),
    ]);
    expect(effectiveAttack(el)).toBe(antes + ultimo);
  });

  it('sin contraataque, Romper guardia quita ataque igual: para su próximo turno', () => {
    const { b, rng } = conNivelesDePrueba();
    const el = stackById(b, 'defender-0');
    const antes = effectiveAttack(el);
    el.retaliated = true;
    applyAction(b, golpeConLaRueda('romperGuardia', 'finta'), rng);
    expect(ataquesDe(b).filter((a) => a.retaliation)).toEqual([]);
    const quita = DE_PRUEBA.romperGuardia.ataque[cruceDe(b).punto];
    expect(quita).toBeLessThan(0);
    expect(effectiveAttack(el)).toBe(antes + quita);
  });
});

describe('la Finta deja andar después de golpear (#263)', () => {
  /**
   * Golpea con Finta contra `respuesta` tras haber andado `andado` casillas (a
   * mano), con una Prisa de +2 puesta a mano para que le quede de sobra. Devuelve lo
   * que le quedaba antes de golpear, lo que resta su nivel con el éxito que cayó y el
   * turno del golpe, que sigue diciendo lo que restó la Finta aunque se haya cerrado.
   */
  function conFinta(respuesta: TipoDeGolpe, andado = 0) {
    const { b, rng } = conNivelesDePrueba();
    const yo = stackById(b, 'attacker-0');
    yo.effects = [{ kind: 'speed', amount: 2, source: 'haste', roundsLeft: 5 }];
    const turno = b.turno;
    if (turno === null) throw new Error('nadie tiene el turno');
    turno.gastado = andado;
    const quedaban = pasosQueQuedan(b, yo);
    applyAction(b, golpeConLaRueda('finta', respuesta), rng);
    const resta = DE_PRUEBA.finta.casillas[cruceDe(b).punto];
    return { b, rng, yo, turno, quedaban, resta };
  }
  /** La respuesta que deja la Finta en el éxito máximo: la que menos le resta. */
  const MEJOR = TIPOS_DE_GOLPE.find((r) => puntoDelCruce('finta', r) === 4) as TipoDeGolpe;
  /** Y la del mínimo: la que más le resta. */
  const PEOR = TIPOS_DE_GOLPE.find((r) => puntoDelCruce('finta', r) === 0) as TipoDeGolpe;

  it('sin andar antes: le queda su velocidad menos lo del éxito, y solo puede andar o terminar', () => {
    const { b, rng, yo, quedaban, resta } = conFinta(MEJOR);
    expect(quedaban - resta).toBeGreaterThan(0);
    expect(activeStack(b)?.id).toBe('attacker-0');
    expect(b.turno?.finta).toBe(resta);
    expect(b.turno?.gastado).toBe(0);
    expect(pasosQueQuedan(b, yo)).toBe(quedaban - resta);
    // La Finta no le quita nada a nadie.
    expect(b.log.filter((e) => e.kind === 'effect')).toEqual([]);
    const legales = legalActions(b);
    expect(new Set(legales.map((a) => a.type))).toEqual(new Set(['move', 'end_turn']));
    // Lo demás lanza con el motivo, sin tocar nada.
    const largo = b.log.length;
    for (const otra of [
      { type: 'attack', target: 'defender-0' },
      { type: 'attack', target: 'defender-0', golpe: 'fuerte', respuesta: 'normal' },
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
    expect(activeStack(b)?.id).toBe('defender-0');
  });

  it('después de andar: lo que le queda menos lo del éxito', () => {
    const { b, yo, quedaban, resta } = conFinta(MEJOR, 1);
    expect(quedaban - resta).toBeGreaterThan(0);
    expect(activeStack(b)?.id).toBe('attacker-0');
    expect(b.turno?.gastado).toBe(1);
    expect(pasosQueQuedan(b, yo)).toBe(quedaban - resta);
  });

  it('cada éxito resta lo de su nivel: el del cruce, no otro', () => {
    const restas = new Set<number>();
    for (const respuesta of TIPOS_DE_GOLPE) {
      const { turno, resta } = conFinta(respuesta);
      expect(turno.finta, `Finta contra ${respuesta}`).toBe(resta);
      restas.add(resta);
    }
    expect(restas.size).toBeGreaterThan(1);
  });

  it('sin casillas que andar, el turno se cierra solo y no sale nada', () => {
    // Lo andado antes deja justo lo que resta la Finta en el éxito mínimo.
    const { b: sinNada } = conNivelesDePrueba();
    const yo = stackById(sinNada, 'attacker-0');
    yo.effects = [{ kind: 'speed', amount: 2, source: 'haste', roundsLeft: 5 }];
    const todo = pasosQueQuedan(sinNada, yo);
    const andado = Math.max(0, todo - DE_PRUEBA.finta.casillas[0]);
    const { b, turno, quedaban, resta } = conFinta(PEOR, andado);
    expect(quedaban).toBeLessThanOrEqual(resta);
    expect(turno.finta).toBe(resta);
    expect(activeStack(b)?.id).toBe('defender-0');
    expect(b.turno?.n).not.toBe(turno.n);
    // Y si la pelea acaba con el golpe, se cierra: no hay tramo que andar.
    const fin = enRueda(piqueros(10), piqueros(1), { niveles: NIVELES_DE_PRUEBA });
    applyAction(fin.b, golpeConLaRueda('finta', MEJOR), fin.rng);
    expect(fin.b.finished).toEqual({ winner: 'attacker' });
    expect(fin.b.turno).toBeNull();
  });
});

describe('el parte cuenta el cruce', () => {
  it('«Romper guardia contra Defensivo: alto; contraataque bajo», con lo que dejó y su duración', () => {
    const { b, rng } = conNivelesDePrueba();
    applyAction(b, golpeConLaRueda('romperGuardia', 'defensivo'), rng);
    const i = b.log.findIndex((e) => e.kind === 'cruce');
    // Romper guardia contra Defensivo cae en el alto (3) y el contraataque en el bajo (1).
    expect(cruceDe(b).punto).toBe(3);
    expect(contraataqueDelCruce(b.log, i)).toBe(1);
    const parte = marcadoDe(renderBattleLog(b, null));
    expect(parte).toContain('Romper guardia contra Defensivo: alto; contraataque bajo');
    expect(parte).toContain(
      `Romper guardia sobre Piquero, del defensor: ataque ${DE_PRUEBA.romperGuardia.ataque[3]} hasta que termine su próximo turno`,
    );
    const d = conNivelesDePrueba();
    applyAction(d.b, golpeConLaRueda('defensivo', 'normal'), d.rng);
    expect(marcadoDe(renderBattleLog(d.b, null))).toContain(
      `Defensivo sobre Piquero, del atacante: defensa +${DE_PRUEBA.defensivo.defensa} hasta que empiece su próximo turno`,
    );
  });

  it('sin contraataque, el cruce no lo nombra', () => {
    const { b, rng } = enRueda(piqueros(10), piqueros(1), { niveles: NIVELES_DE_PRUEBA });
    applyAction(b, golpeConLaRueda('fuerte', 'rapido'), rng);
    // El piquero solo cae: no hay contraataque que contar.
    expect(stackById(b, 'defender-0').count).toBe(0);
    expect(
      contraataqueDelCruce(
        b.log,
        b.log.findIndex((e) => e.kind === 'cruce'),
      ),
    ).toBeNull();
    expect(marcadoDe(renderBattleLog(b, null))).toContain('Fuerte contra Rápido: máximo</div>');
  });

  it('nombra el efecto como la rueda de la batalla: en la de 3, el «Rápido» que quita ataque dice «Rápido»', () => {
    const { b, rng } = conNivelesDePrueba({ combate: { tope: 7, rueda: 3 } });
    applyAction(b, golpeConLaRueda('rapidoRomper', 'defensivoFinta'), rng);
    // Rápido gana a Defensivo: máximo, y su parte de Romper guardia quita a la mitad.
    const quita = efectoDelTipo('rapidoRomper', DE_PRUEBA).quitaAtaque[4];
    expect(quita).toBeLessThan(0);
    expect(stackById(b, 'defender-0').effects).toEqual([
      expect.objectContaining({ kind: 'attack', amount: quita, source: 'rapidoRomper' }),
    ]);
    const parte = marcadoDe(renderBattleLog(b, null));
    expect(parte).toContain('Rápido contra Defensivo: máximo');
    expect(parte).toContain(
      `Rápido sobre Piquero, del defensor: ataque ${quita} hasta que termine su próximo turno`,
    );
    expect(parte).not.toContain('Romper guardia');
  });
});

// ------------------------- primero se anda, luego la rueda; con carga, al revés

/**
 * Dos caballerías (A 10, D 9, daño 50-100, `charge`) en (1,4) contra diez piqueros
 * (D 9) en (6,4): desde (5,4) la recta mide 4 y el piquero está en ella, así que
 * carga 4 (+40 %). Con 4 casillas por gastar (o las que se le den): la carrera las
 * agota.
 */
function aLaCarga(casillas = 4): { b: BattleState; rng: Rng } {
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
  turno.gastado += pasosQueQuedan(b, jinetes) - casillas;
  expect(pasosQueQuedan(b, jinetes)).toBe(casillas);
  return { b, rng };
}

const SALIDA = { col: 1, row: 4 } as const;
const DESDE = { col: 5, row: 4 } as const;
const plantarse: BattleAction = { type: 'attack', target: 'defender-0', from: DESDE };
/**
 * Al lado del piquero pero fuera de la recta desde (1,4): a 5 casillas, sin carga.
 * Con `aLaCarga(5)` las agota.
 */
const DE_LADO = { col: 5, row: 5 } as const;
const plantarseDeLado: BattleAction = { type: 'attack', target: 'defender-0', from: DE_LADO };

describe('sin carga, primero se anda y luego la rueda (13-10-2026); con carga, primero la rueda (31-10-2026)', () => {
  it('plantarse con carga no corre: no escribe nada, no gasta, no tira, guarda la carga por correr y no cierra el turno', () => {
    const { b, rng } = aLaCarga();
    const c = contando(rng);
    const largo = b.log.length;
    const turno = b.turno?.n;
    const jinetes = stackById(b, 'attacker-0');
    applyAction(b, plantarse, c.rng);
    // Quieto en su salida, con la carrera por correr guardada.
    expect(jinetes.hex).toEqual(SALIDA);
    expect(b.golpeEnCurso).toEqual({
      stack: 'attacker-0',
      target: 'defender-0',
      carga: { recta: 4, carrera: expect.objectContaining({ at: DESDE, steps: 4 }) },
    });
    expect(b.log.length).toBe(largo);
    expect(pasosQueQuedan(b, jinetes)).toBe(4);
    expect(b.turno?.n).toBe(turno);
    expect(activeStack(b)?.id).toBe('attacker-0');
    expect(c.ints()).toBe(0);
    // Lo que se enseña plantado: solo ese golpe, y su carga (la llegada y el »4).
    expect(legalActions(b)).toEqual([{ type: 'attack', target: 'defender-0' }]);
    expect(casillasDeCarga(b, jinetes)).toEqual([
      { target: 'defender-0', at: DESDE, hexes: 4, porciento: expect.any(Number) },
    ]);
  });

  it('plantarse sin carga anda como siempre: el tramo sin marca de carga, y espera la rueda allí', () => {
    const { b, rng } = aLaCarga(5);
    const c = contando(rng);
    const largo = b.log.length;
    applyAction(b, plantarseDeLado, c.rng);
    expect(stackById(b, 'attacker-0').hex).toEqual(DE_LADO);
    expect(b.golpeEnCurso).toEqual({ stack: 'attacker-0', target: 'defender-0', carga: null });
    expect(b.log.slice(largo)).toHaveLength(1);
    expect(b.log[largo]).toMatchObject({ kind: 'move', stack: 'attacker-0', to: DE_LADO });
    expect(b.log[largo]).not.toHaveProperty('charge');
    expect(pasosQueQuedan(b, stackById(b, 'attacker-0'))).toBe(0);
    expect(activeStack(b)?.id).toBe('attacker-0');
    expect(c.ints()).toBe(0);
    // Plantado sin carga, no hay carga que enseñar.
    expect(casillasDeCarga(b, stackById(b, 'attacker-0'))).toEqual([]);
    // Sin `from`, el enemigo ya está al lado: solo se planta, y sin carga.
    const { b: pegados, rng: r } = enRueda(piqueros(5), piqueros(5));
    const antes = pegados.log.length;
    applyAction(pegados, { type: 'attack', target: 'defender-0' }, r);
    expect(pegados.log.length).toBe(antes);
    expect(pegados.golpeEnCurso).toEqual({
      stack: 'attacker-0',
      target: 'defender-0',
      carga: null,
    });
  });

  it('sin carga, de una vez o en dos jugadas, el mismo registro: la marcha, el cruce y el golpe', () => {
    const unaVez = aLaCarga(5);
    applyAction(unaVez.b, { ...plantarseDeLado, golpe: 'normal', respuesta: 'rapido' }, unaVez.rng);
    const enDos = aLaCarga(5);
    applyAction(enDos.b, plantarseDeLado, enDos.rng);
    applyAction(
      enDos.b,
      { type: 'attack', target: 'defender-0', golpe: 'normal', respuesta: 'rapido' },
      enDos.rng,
    );
    expect(JSON.stringify(enDos.b.log)).toBe(JSON.stringify(unaVez.b.log));
    const deLaJugada = enDos.b.log.filter((e) => ['move', 'cruce', 'attack'].includes(e.kind));
    expect(deLaJugada.slice(0, 3).map((e) => e.kind)).toEqual(['move', 'cruce', 'attack']);
    const golpe = ataquesDe(enDos.b).find((a) => !a.retaliation);
    expect(golpe?.charge).toBeUndefined();
  });

  it('cuando se espera la respuesta de una carga, quien carga aún no ha corrido (`pasoDelCruce`)', () => {
    const { b, rng } = aLaCarga();
    const largo = b.log.length;
    const paso = pasoDelCruce(b, plantarse, rng, (_, papel) => papel === 'golpe');
    expect(paso).toMatchObject({ falta: 'respuesta', bando: 'defender' });
    expect(stackById(b, 'attacker-0').hex).toEqual(SALIDA);
    expect(b.log.length).toBe(largo);
    expect(b.golpeEnCurso?.carga?.carrera.at).toEqual(DESDE);
    // Respondida, el cruce, la carrera y el golpe.
    if (!('accion' in paso)) throw new Error('debía faltar la respuesta');
    applyAction(b, { ...paso.accion, respuesta: 'normal' }, rng);
    expect(b.log.slice(largo, largo + 2).map((e) => e.kind)).toEqual(['cruce', 'move']);
    expect(stackById(b, 'attacker-0').hex).toEqual(DESDE);
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
      { type: 'cast', spell: 'haste', target: 'attacker-0' },
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

  it('soltar un golpe sin carga deja la unidad donde llegó con su turno; si no le queda nada, lo cierra', () => {
    // Con casillas de sobra (le quedan 2: salir del lado del piquero cuesta 2): sigue su turno.
    const { b, rng } = aLaCarga(7);
    const n = b.turno?.n;
    applyAction(b, plantarseDeLado, rng);
    const largo = b.log.length;
    soltarElGolpe(b, rng);
    expect(b.golpeEnCurso).toBeNull();
    expect(b.log.length).toBe(largo);
    expect(activeStack(b)?.id).toBe('attacker-0');
    expect(b.turno?.n).toBe(n);
    expect(stackById(b, 'attacker-0').hex).toEqual(DE_LADO);
    // Ya se movió: puede andar más, golpear o terminar.
    const legales = legalActions(b);
    expect(legales.some((a) => a.type === 'move')).toBe(true);
    expect(legales).toContainEqual({ type: 'attack', target: 'defender-0' });
    expect(legales).toContainEqual({ type: 'end_turn' });
    // Sin nada que hacer, se cierra. Hoy no pasa solo —el objetivo sigue al lado y
    // se le puede golpear—, así que se le aparta a mano tras agotar las casillas.
    const agotado = aLaCarga(5);
    applyAction(agotado.b, plantarseDeLado, agotado.rng);
    stackById(agotado.b, 'defender-0').hex = { col: 10, row: 8 };
    const m = agotado.b.turno?.n;
    soltarElGolpe(agotado.b, agotado.rng);
    expect(agotado.b.turno?.n).not.toBe(m);
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
        // La carrera va tras su cruce (la rueda antes de correr, 31-10-2026); entre
        // ella y su golpe, el Defensivo de quien pega, que se pone antes de sus
        // golpes. Hacia atrás, también los golpes de antes de la misma jugada: cada
        // golpe del Rápido cobra la carga.
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
            expect(log[i - 1]).toMatchObject({ kind: 'cruce', stack: e.stack });
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
  it('quien responde ve su contraataque, o por qué no lo hará', () => {
    const { b } = enRueda(piqueros(10), piqueros(10));
    const p = previsionDeLaRueda(b, { type: 'attack', target: 'defender-0' }, 'respuesta');
    expect(p.porTipo?.normal).toEqual({
      danio: { min: 315, max: 315 },
      golpes: 1,
      siguientes: null,
      contraataquePorExito: [],
    });
    // Quien responde no ve el contraataque que le devolverían a él; y pegados no hay
    // carga que cobrar (la de quien pega se ve en las dos fases: «el golpe que viene»).
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
});

describe('al responder, el golpe que viene (31-10-2026)', () => {
  /** El golpe de una vez con `golpe` y `respuesta`: los `attack` de quien pega (sin el contraataque). */
  const loQueQuito = (golpe: TipoDeGolpe, respuesta: TipoDeGolpe): number[] => {
    const { b, rng } = enRueda(piqueros(10), piqueros(10));
    applyAction(b, golpeConLaRueda(golpe, respuesta), rng);
    return ataquesDe(b)
      .filter((a) => !a.retaliation)
      .map((a) => a.damage);
  };

  it('con cada respuesta, cada golpe suyo en su punto quita lo que dice, y el total va de lo menos a lo más de todos', () => {
    const { b } = enRueda(piqueros(10), piqueros(10));
    const viene = previsionDelGolpeQueViene(b, { type: 'attack', target: 'defender-0' });
    // A mano: con Normal en cualquiera de los dos, el medio: 35 × 10 × 0,9 = 315.
    expect(viene.normal?.porGolpe.find((g) => g.tipo === 'normal')).toEqual({
      tipo: 'normal',
      punto: 2,
      danio: { min: 315, max: 315 },
      golpes: 1,
      siguientes: null,
      quita: { min: 315, max: 315 },
      tumba: 'no',
    });
    expect(viene.normal?.puedeTumbarte).toBe(false);
    for (const respuesta of TIPOS_DE_GOLPE) {
      const r = viene[respuesta];
      if (r === undefined) throw new Error(`sin el golpe que viene contra ${respuesta}`);
      expect(
        r.porGolpe.map((g) => g.tipo),
        respuesta,
      ).toEqual([...TIPOS_DE_GOLPE]);
      const sumas: number[] = [];
      for (const g of r.porGolpe) {
        // Lo que se cobra de verdad con ese golpe y esa respuesta.
        const cobrado = loQueQuito(g.tipo, respuesta);
        const que = `${g.tipo} contra ${respuesta}`;
        expect(g.punto, que).toBe(puntoDelCruce(g.tipo, respuesta));
        expect(cobrado.length, que).toBe(g.golpes);
        expect(cobrado[0], que).toBeGreaterThanOrEqual(g.danio.min);
        expect(cobrado[0], que).toBeLessThanOrEqual(g.danio.max);
        for (const luego of cobrado.slice(1)) {
          const sig = g.siguientes ?? g.danio;
          expect(luego, que).toBeGreaterThanOrEqual(sig.min);
          expect(luego, que).toBeLessThanOrEqual(sig.max);
        }
        sumas.push(cobrado.reduce((x, y) => x + y, 0));
      }
      // Sin suerte el golpe cae en un solo número: lo menos y lo más del total son
      // lo menos y lo más que se cobra entre todos sus golpes.
      expect(r.total, respuesta).toEqual({ min: Math.min(...sumas), max: Math.max(...sumas) });
    }
  });

  it('el total es lo que se cobra: cada golpe solo si sigue en pie, y nunca más de la vida que tiene', () => {
    // Un piquero solo: cualquier golpe de los diez lo tumba, y el total se queda en su vida.
    const { b } = enRueda(piqueros(10), piqueros(1));
    const vida = stackHp(stackById(b, 'defender-0'));
    const viene = previsionDelGolpeQueViene(b, { type: 'attack', target: 'defender-0' });
    for (const respuesta of TIPOS_DE_GOLPE) {
      const r = viene[respuesta];
      if (r === undefined) throw new Error(`sin el golpe que viene contra ${respuesta}`);
      expect(Math.max(...r.porGolpe.map((g) => g.danio.max)), respuesta).toBeGreaterThan(vida);
      expect(r.total.max, respuesta).toBe(vida);
      expect(r.puedeTumbarte, respuesta).toBe(true);
    }
  });

  it('te tumba: cada golpe dice si te tumba con lo que se cobra, y el sector si alguno puede (H2 de QA, 01-11-2026)', () => {
    // Una vida entre lo menos y lo más que quitan las parejas: unos golpes tumban
    // y otros no. Se juega cada pareja (golpe, respuesta) de verdad sobre una
    // batalla nueva con esa vida y se mira si el objetivo queda en pie.
    const conVida = (vida: number): { b: BattleState; rng: Rng } => {
      const m = enRueda(piqueros(10), piqueros(10));
      const t = stackById(m.b, 'defender-0');
      t.count = Math.floor((vida - 1) / t.unit.hp) + 1;
      t.topHp = vida - (t.count - 1) * t.unit.hp;
      return m;
    };
    const ataque = { type: 'attack', target: 'defender-0' } as const;
    // Lo que quita cada pareja con la vida entera (no tumba ninguna), sin repetir.
    const quitan = [
      ...new Set(
        Object.values(
          previsionDelGolpeQueViene(enRueda(piqueros(10), piqueros(10)).b, ataque),
        ).flatMap((r) => r.porGolpe.map((g) => g.quita.max)),
      ),
    ].sort((x, y) => x - y);
    const vida = quitan[Math.floor(quitan.length / 2)] as number;
    expect(quitan[0]).toBeLessThan(vida);
    const { b } = conVida(vida);
    expect(stackHp(stackById(b, 'defender-0'))).toBe(vida);
    const viene = previsionDelGolpeQueViene(b, ataque);
    const tumbas = { no: 0, siempre: 0 };
    for (const respuesta of TIPOS_DE_GOLPE) {
      const r = viene[respuesta];
      if (r === undefined) throw new Error(`sin el golpe que viene contra ${respuesta}`);
      for (const g of r.porGolpe) {
        const que = `${g.tipo} contra ${respuesta}`;
        // Sin suerte el golpe cae en un número: o tumba o no, nunca «puede».
        expect(g.tumba, que).not.toBe('puede');
        const jugada = conVida(vida);
        applyAction(jugada.b, golpeConLaRueda(g.tipo, respuesta), jugada.rng);
        const queda = stackHp(stackById(jugada.b, 'defender-0'));
        expect(g.tumba === 'siempre', que).toBe(queda === 0);
        expect(g.quita, que).toEqual({ min: vida - queda, max: vida - queda });
        tumbas[g.tumba === 'siempre' ? 'siempre' : 'no']++;
      }
      expect(r.puedeTumbarte, respuesta).toBe(r.porGolpe.some((g) => g.tumba !== 'no'));
      expect(r.total.max === vida, respuesta).toBe(r.puedeTumbarte);
    }
    // Lo que se quería mirar: con esa vida hay de los dos.
    expect(tumbas.no).toBeGreaterThan(0);
    expect(tumbas.siempre).toBeGreaterThan(0);
  });

  it('la carga de quien pega, la misma en las dos fases; pegados, ninguna', () => {
    const { b, rng } = aLaCarga();
    applyAction(b, plantarse, rng);
    const ataque = { type: 'attack', target: 'defender-0' } as const;
    const alGolpear = previsionDeLaRueda(b, ataque, 'golpe').carga;
    expect(alGolpear).toMatchObject({ casillas: 4 });
    expect(previsionDeLaRueda(b, ataque, 'respuesta').carga).toEqual(alGolpear);
    const pegados = enRueda(piqueros(10), piqueros(10)).b;
    expect(previsionDeLaRueda(pegados, ataque, 'golpe').carga).toBeNull();
    expect(previsionDeLaRueda(pegados, ataque, 'respuesta').carga).toBeNull();
  });

  it('sin contraataque, la respuesta no tiene daño suyo pero sí el golpe que viene', () => {
    const { b } = enRueda(piqueros(10), piqueros(10));
    stackById(b, 'defender-0').retaliated = true;
    const ataque = { type: 'attack', target: 'defender-0' } as const;
    expect(previsionDeLaRueda(b, ataque, 'respuesta').porTipo).toBeNull();
    const viene = previsionDelGolpeQueViene(b, ataque);
    expect(Object.keys(viene)).toEqual([...TIPOS_DE_GOLPE]);
    expect(viene.normal?.total.max).toBeGreaterThan(0);
  });

  it('en las tres ruedas, uno por tipo de la rueda', () => {
    const ataque = { type: 'attack', target: 'defender-0' } as const;
    for (const n of TIPOS_DE_LAS_RUEDAS) {
      const forma = RUEDAS[n];
      const { b } = enRueda(piqueros(10), piqueros(10), { combate: combateCon(7, n) });
      const viene = previsionDelGolpeQueViene(b, ataque);
      expect(Object.keys(viene), `rueda de ${n}`).toEqual([...forma.golpes]);
      for (const t of forma.golpes) {
        expect(
          viene[t]?.porGolpe.map((g) => g.tipo),
          `rueda de ${n}, ${t}`,
        ).toEqual([...forma.golpes]);
      }
    }
  });
});

describe('la IA elige a ciegas', () => {
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
    // Con la Finta la IA anda tras golpear (#263): sigue terminando, sin bucles. En
    // 1-50 hasta la escala baja (26-10-2026); con ella, de 336 Fintas en 1-300 solo
    // tres dejan andar (las semillas 146, 149 y 282), así que se miran 1-150.
    let tramos = 0;
    for (let semilla = 1; semilla <= 150; semilla++) {
      const a = pelea(semilla);
      expect(a.finished, `semilla ${semilla}`).not.toBeNull();
      expect(a.log.filter((e) => e.kind === 'cruce').length).toBeGreaterThan(0);
      expect(JSON.stringify(pelea(semilla).log), `semilla ${semilla}`).toBe(JSON.stringify(a.log));
      // Un tramo de la Finta: el `move` de quien acaba de golpear, sin otro turno en medio.
      for (const [i, e] of a.log.entries()) {
        if (e.kind !== 'cruce' || e.golpe !== 'finta') continue;
        const despues = a.log
          .slice(i + 1)
          .find((x) => !['attack', 'perished', 'effect'].includes(x.kind));
        if (despues?.kind === 'move' && despues.stack === e.stack) tramos++;
      }
    }
    expect(tramos).toBeGreaterThan(0);
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
  empezarTalCual(s);
  return s;
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

  it('Escape sin carga: la unidad se queda donde llegó, con su turno', () => {
    const s = sesion({ ids: [JINETE], ia: false }, { ids: [PIQUERO], ia: true });
    // El piquero a tres casillas: ninguna recta llega a la mínima de la carga.
    stackById(s.battle, 'defender-0').hex = { col: 3, row: 4 };
    const ataque = s
      .battleLegalActions()
      .find(
        (a): a is BattleAction & { type: 'attack'; from: Hex } =>
          a.type === 'attack' &&
          a.from !== undefined &&
          !s.battleCharges().some((c) => c.at.col === a.from?.col && c.at.row === a.from?.row),
      );
    if (ataque === undefined) throw new Error('no hay golpe sin carga a mano');
    s.playBattleAction(ataque);
    expect(s.battle.golpeEnCurso).toMatchObject({ carga: null });
    expect(stackById(s.battle, 'attacker-0').hex).toEqual(ataque.from);
    const largo = s.battle.log.length;
    expect(s.cancelarGolpe()).toBe(true);
    expect(s.status).toBe('Golpe cancelado.');
    expect(s.battle.log.length).toBe(largo);
    expect(stackById(s.battle, 'attacker-0').hex).toEqual(ataque.from);
    expect(s.turnoPropio?.stack.id).toBe('attacker-0');
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
    expect(golpe!.atacante.hex).toEqual(donde);
    s.elegirEnLaRueda('rapido');
    expect(s.battle.log[largo]).toMatchObject({
      kind: 'cruce',
      golpe: 'rapido',
      respuesta: 'rapido',
      punto: 0,
    });
    // Sin carga, golpeó desde donde se plantó; con ella, corrió tras el cruce.
    expect(golpe!.atacante.hex).toEqual(plantado?.carga?.carrera.at ?? donde);
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
    empezarTalCual(s);
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
    const m = desenlaceDe(b);
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
      const m = desenlaceDe(b);
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
