/**
 * El arma cambia la rueda del golpe (18-10-2026, solo la arena: «una maza es mejor
 * en ataque fuerte y peor en rápido, una espada es la más versátil»), por niveles
 * absolutos (vuelta 2): cada arma de cuerpo a cuerpo lleva un nivel de 0 a 6 en
 * cada tipo del anillo, y cada golpe va con las cifras de los niveles de SU arma
 * (`cifrasDeLosNiveles`, `ruedaDelGolpe`): la lanza en el primero de una carga, la
 * de cuerpo a cuerpo en lo demás y, en el contraataque, la del que responde.
 *
 * Escritos desde los criterios de `plan-2.md`
 * (`docs/agents/2026-10-18-equipo-por-tipos-y-bases/`). Cada comparación es contra
 * la misma arma con los niveles de la Espada (todo a 3, una copia «lisa»): así lo
 * que cambia es solo la rueda, no el ataque ni el daño.
 */

import { describe, expect, it } from 'vitest';
import ruedaJson from '../data/rueda.json' with { type: 'json' };
import { caraDeLaArena } from '../src/client/arena/paneles.js';
import { marcadoDe } from '../src/client/html.js';
import { renderEleccion } from '../src/client/rueda/rueda.js';
import { batallaDeArena, equiparEnArena } from '../src/core/arena.js';
import { ruedaDelGolpe } from '../src/core/battle/armas.js';
import {
  activeStack,
  applyAction,
  previsionDeLaRueda,
  stackById,
} from '../src/core/battle/battle.js';
import { validarRueda } from '../src/core/battle/cifras-de-la-rueda.js';
import { SIN_MURALLA } from '../src/core/battle/muralla.js';
import type { BattleAction, BattleState } from '../src/core/battle/types.js';
import { unidad } from '../src/core/catalogo.js';
import type { Pieza, PiezaEscrita } from '../src/core/data.js';
import { EQUIPO_DEL_JUEGO, pieza } from '../src/core/hero/equipo.js';
import { createRng } from '../src/core/rng.js';
import type { TipoDeGolpe } from '../src/core/types.js';
import { cuerpoDeCombate, nivelesDeLaEspada, type Unidad } from '../src/core/unidad.js';
import {
  type Ataque,
  aPelear,
  ataquesDe,
  catalogoCon,
  empezarTalCual,
  golpeConLaRueda,
  hastaLaRueda,
  montajeDePrueba,
  sesionDeArena,
  TROPA,
  unidadDeArena,
} from './helpers.js';

/** `p` con los niveles de la Espada, con otro id y otro nombre: la misma arma, versátil. */
function lisa(p: Pieza): Pieza {
  return { ...p, rueda: nivelesDeLaEspada(), id: `${p.id}-lisa`, nombre: `${p.nombre} lisa` };
}

const MAZA = pieza('maza');
const MAZA_LISA = lisa(MAZA);
const LANZA = pieza('lanza');
const LANZA_LISA = lisa(LANZA);
const PIEZAS: readonly PiezaEscrita[] = [MAZA_LISA, LANZA_LISA];
const EQ = catalogoCon(...PIEZAS);

/** El guerrero con escudo (espada, brigantina y escudo) con `arma` en la mano. */
function guerreroCon(arma: string): Unidad {
  // Con su propio id: el de enfrente es la tropa tal cual, y en una pelea un id es
  // una unidad (`catalogoDeLaPelea`).
  return equiparEnArena(unidadDeArena(TROPA, { id: `${TROPA}-9` }), arma, EQ);
}

/**
 * Una pelea con la rueda: `izq` en (5,4) y `der` pegado en (6,4). Los
 * dos guerreros son iguales de rápidos: empieza el atacante.
 */
function pelea(izq: Unidad, der: Unidad): BattleState {
  const b = batallaDeArena(
    montajeDePrueba(aPelear([izq]), aPelear([der]), SIN_MURALLA, { equipo: EQ }),
    createRng(1),
  );
  stackById(b, 'attacker-0').hex = { col: 5, row: 4 };
  stackById(b, 'defender-0').hex = { col: 6, row: 4 };
  expect(activeStack(b)?.id).toBe('attacker-0');
  return b;
}

/** Da un golpe de una vez con `golpe` y `respuesta`, y devuelve lo que hizo: los golpes de quien pega y los del contraataque. */
function dar(
  b: BattleState,
  golpe: TipoDeGolpe,
  respuesta: TipoDeGolpe,
  extra: Partial<BattleAction> = {},
): { readonly golpe: Ataque[]; readonly vuelta: Ataque[] } {
  applyAction(b, golpeConLaRueda(golpe, respuesta, extra), createRng(7));
  const todos = ataquesDe(b);
  return { golpe: todos.filter((e) => !e.retaliation), vuelta: todos.filter((e) => e.retaliation) };
}

describe('las cifras de la rueda por niveles', () => {
  it('golpear en la rueda sin arma de la arena es un fallo: lanza', () => {
    // El cuerpo desnudo: las del catálogo llevan todas arma de serie.
    const sinArma = { ...cuerpoDeCombate(unidad(TROPA)), name: 'Piquero' };
    expect(() => ruedaDelGolpe(sinArma, 'arma')).toThrow(
      '«Piquero» golpea en la rueda sin arma que la lleve',
    );
  });

  it('validarRueda muerde: siete niveles, que no empeoran, una Finta que no pasa del mínimo y sin Normal', () => {
    const con = (cambio: (j: Record<string, Record<string, unknown>>) => void) => {
      const j = structuredClone(ruedaJson) as unknown as Record<string, Record<string, unknown>>;
      cambio(j);
      return () => validarRueda(j, 'rueda.json');
    };
    expect(con(() => {})).not.toThrow();
    expect(
      con((j) => {
        (j.fuerte as Record<string, unknown>).porcentaje = [100, 117, 133, 150, 167, 183];
      }),
    ).toThrow('rueda.json: fuerte.porcentaje: tiene que ser una lista de 7 enteros');
    expect(
      con((j) => {
        (j.ofensivo as Record<string, unknown>).ataque = [0, 1, 2, 1, 4, 5, 6];
      }),
    ).toThrow('rueda.json: ofensivo.ataque: el nivel 3 (1) es peor que el 2 (2)');
    expect(
      con((j) => {
        (j.finta as Record<string, unknown>).conExitoMinimo = [8, 7, 6, 5, 4, 3, 9];
      }),
    ).toThrow('rueda.json: finta.conExitoMinimo: el nivel 6 (9) es peor que el 5 (3)');
    expect(
      con((j) => {
        (j.romperGuardia as Record<string, unknown>).conExitoMaximo = [0, -1, -2, -3, -4, -5, 1];
      }),
    ).toThrow('el nivel 6 va hasta 0, y es 1');
    expect(
      con((j) => {
        j.normal = { porcentaje: 100 };
      }),
    ).toThrow('rueda.json: «normal» no es un campo');
  });
});

describe('cada golpe de la rueda va con su arma', () => {
  it('con la maza, Fuerte da más y Rápido menos que con la misma maza sin rueda; Normal, igual', () => {
    const con = (arma: string, golpe: TipoDeGolpe) =>
      dar(pelea(guerreroCon(arma), unidadDeArena(TROPA)), golpe, 'normal').golpe;
    const [fuerte] = con('maza', 'fuerte');
    const [fuerteLisa] = con(MAZA_LISA.id, 'fuerte');
    expect(fuerte?.damage).toBeGreaterThan(fuerteLisa?.damage ?? 0);
    const rapido = con('maza', 'rapido');
    const rapidoLisa = con(MAZA_LISA.id, 'rapido');
    expect(rapido).toHaveLength(2);
    expect(rapido[0]?.damage).toBeLessThan(rapidoLisa[0]?.damage ?? 0);
    expect(con('maza', 'normal')[0]?.damage).toBe(con(MAZA_LISA.id, 'normal')[0]?.damage);
  });

  it('el contraataque va con el arma del que responde', () => {
    const vuelta = (arma: string) =>
      dar(pelea(unidadDeArena(TROPA), guerreroCon(arma)), 'normal', 'fuerte').vuelta;
    const [conMaza] = vuelta('maza');
    const [conLisa] = vuelta(MAZA_LISA.id);
    expect(conMaza?.stack).toBe('defender-0');
    expect(conMaza?.damage).toBeGreaterThan(conLisa?.damage ?? 0);
  });
});

describe('la rueda teñida por el nivel del arma de quien pega (25-10-2026)', () => {
  // Requisito 5: «los tuyos cuando atacas y los de tu enemigo cuando defiendes». La
  // maza (Fuerte 5, Rápido 1) contra la espada (todo a 3): los niveles de las dos
  // fases son los de quien pega, nunca los de quien responde.
  const golpe = { type: 'attack', target: 'defender-0' } as const;
  const niveles = (b: BattleState) => ({
    golpe: previsionDeLaRueda(b, golpe, 'golpe').niveles,
    respuesta: previsionDeLaRueda(b, golpe, 'respuesta').niveles,
  });

  it('pega la maza: al golpear y al responder, los niveles de la maza; Normal, sin nivel', () => {
    const { golpe: alGolpear, respuesta } = niveles(
      pelea(guerreroCon('maza'), unidadDeArena(TROPA)),
    );
    const deLaMaza = { ...MAZA.rueda };
    expect(alGolpear).toEqual(deLaMaza);
    expect(respuesta).toEqual(deLaMaza);
    expect('normal' in alGolpear).toBe(false);
  });

  it('pega la espada contra la maza: los dos, los de la espada', () => {
    const { golpe: alGolpear, respuesta } = niveles(
      pelea(unidadDeArena(TROPA), guerreroCon('maza')),
    );
    expect(alGolpear).toEqual(nivelesDeLaEspada());
    expect(respuesta).toEqual(nivelesDeLaEspada());
  });

  it('el diálogo pinta cada sector con su nivel y el centro sin él', () => {
    const conMaza = {
      unidad: equiparEnArena(unidadDeArena(TROPA), 'maza', EQUIPO_DEL_JUEGO),
      ia: false,
    };
    // El de enfrente con otro id: en una pelea, un id es una unidad (`catalogoDeLaPelea`).
    const conEspada = { unidad: unidadDeArena(TROPA, { id: `${TROPA}-9` }), ia: false };
    const s = sesionDeArena([conMaza], [conEspada], 1);
    empezarTalCual(s);
    hastaLaRueda(s, true, 'golpe');
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('la rueda no pide el golpe');
    const m = marcadoDe(renderEleccion(s.battle, p, null, caraDeLaArena(s)));
    for (const [tipo, nivel] of Object.entries(p.prevision.niveles)) {
      expect(m).toMatch(
        new RegExp(`class="sector" data-sector="${tipo}" data-veta="\\w+" data-nivel="${nivel}"`),
      );
    }
    expect(m).toMatch(/class="sector centro" data-sector="normal" r=/);
  });
});
