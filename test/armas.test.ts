/**
 * Cada arma para lo suyo (13-10-2026, solo la arena): una unidad lleva un arma de
 * cuerpo a cuerpo (`arma`), una a distancia (`distancia`) y una de carga
 * (`carga`), y cada golpe va con las cifras de la suya (`usoDelGolpe`,
 * `cifrasDelGolpe`). Se escribe desde los criterios: el disparo con el arco, el
 * golpe y el contraataque con la daga, la carga con la lanza (o, sin ella, con la
 * espada); sin arma de cuerpo a cuerpo, en la arena no se monta y el juego (sin
 * armas por uso) pega con sus cifras; y las reglas que dependen del arma —la rueda,
 * el castigo del tirador de fheroes2— siguen valiendo.
 *
 * Las cifras se esperan escritas, no calculadas con la fórmula: con el dado
 * cargado en cada punta (`dadoCargado`) el golpe da su mínimo y su máximo, y la
 * cuenta está en el comentario de cada caso.
 */

import { describe, expect, it } from 'vitest';
import { golpeDe } from '../src/core/battle/armas.js';
import { applyAction, createBattle, legalActions, stackById } from '../src/core/battle/battle.js';
import { hexEquals } from '../src/core/battle/board.js';
import { usoDelGolpe } from '../src/core/battle/damage.js';
import type { BattleAction, BattleState } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { cuerpoConSusCifras } from '../src/core/cuerpo.js';
import { createRng } from '../src/core/rng.js';
import type { Hex, UnitInfo } from '../src/core/types.js';
import { armaDeCuerpoBlocker, CUERPO_COMUN } from '../src/core/unidad.js';
import { bandoDe, dadoCargado, MANOS_DE_PRUEBA } from './batalla-de-prueba.js';
import { catalogoCon } from './pelea-de-arena.js';

/**
 * El cuerpo común de la arena (`CUERPO_COMUN`): ataque 3, fuerza 7, 50 PV, con su
 * agilidad; con otra fuerza si se pide (el jinete, abajo).
 */
function cuerpo(
  agilidad = 4,
  traits: UnitInfo['traits'] = [],
  fuerza: number = CUERPO_COMUN.fuerza,
): UnitInfo {
  const { attack, hp } = CUERPO_COMUN;
  return cuerpoConSusCifras({
    name: 'Cuerpo',
    faction: null,
    attack,
    fuerza,
    agilidad,
    defensaPropia: 0,
    hp,
    traits,
  });
}

/**
 * El blanco: defensa 4 (uno más que el ataque de la daga), mucha vida y un golpe de 1, con
 * las manos de prueba (que no suman nada) para devolver el golpe en la rueda.
 */
const MUNECO: UnitInfo = catalogoCon(MANOS_DE_PRUEBA).conEquipo(
  // Fuerza 1 y agilidad 1: un golpe de 1; con 3 de defensa propia, defensa 4.
  cuerpoConSusCifras({
    name: 'Muñeco',
    faction: null,
    attack: 4,
    fuerza: 1,
    agilidad: 1,
    defensaPropia: 3,
    hp: 5000,
  }),
  { arma: MANOS_DE_PRUEBA.id },
);

/** Uno contra uno: `quien` en `en`, el muñeco en `contra`, y el turno de `quien`. */
function frente(quien: UnitInfo, en: Hex, contra: Hex): BattleState {
  const b = createBattle(
    bandoDe([{ id: 'quien', unit: quien }]),
    bandoDe([{ id: 'muneco', unit: MUNECO }]),
    createRng(1),
    COMBATE_COMPLETO,
  );
  stackById(b, 'attacker-0').hex = en;
  stackById(b, 'defender-0').hex = contra;
  b.turno = { n: 1000, stack: 'attacker-0', gastado: 0 };
  return b;
}

/** El golpe a `defender-0` desde `desde` (sin moverse si no se dice). */
function golpe(b: BattleState, desde?: Hex): BattleAction {
  const a = legalActions(b).find(
    (x) =>
      x.type === 'attack' &&
      x.target === 'defender-0' &&
      (desde === undefined
        ? x.from === undefined
        : x.from !== undefined && hexEquals(x.from, desde)),
  );
  if (a === undefined) throw new Error('no se puede golpear como se pide');
  return a;
}

/**
 * El golpe cuerpo a cuerpo pasa por la rueda (siempre, desde el 19-10-2026), y
 * cae en una punta del cruce: Finta contra Finta en el mínimo y contra Romper
 * guardia, su opuesta, en el máximo; ninguna de las dos cambia el daño ni el
 * ataque de este golpe. El contraataque cae en la contraria.
 */
const EN_LA_PUNTA = {
  minimo: { golpe: 'finta', respuesta: 'finta' },
  maximo: { golpe: 'finta', respuesta: 'romperGuardia' },
} as const;

describe('cada arma para lo suyo: cada golpe con las cifras de su arma (13-10-2026)', () => {
  it('sin arma de cuerpo a cuerpo: en la arena no se monta; el juego, sin armas por uso, pega con sus cifras', () => {
    // La arena: el jinete sin arma no se monta (18-10-2026: «sin arma no se combate»).
    expect(armaDeCuerpoBlocker({ distancia: 'arco', armadura: 'barda' })).toMatch(
      /^no lleva arma de cuerpo a cuerpo/,
    );
    // Sin `armas`, `golpeDe` cae en las cifras de arriba sin nombrar arma; pero sin
    // arma con rueda no se golpea (desde el 19-10-2026 toda batalla va con la rueda):
    // es un fallo, y se dice.
    const juego = cuerpo();
    expect(juego.armas).toBeUndefined();
    expect(golpeDe(juego, 'arma')).toEqual({ piezas: [], attack: 3, damage: [7, 28] });
    const b = frente(juego, { col: 6, row: 4 }, { col: 7, row: 4 });
    expect(() =>
      applyAction(b, { ...golpe(b), ...EN_LA_PUNTA.minimo }, dadoCargado('minimo')),
    ).toThrow('«Cuerpo» golpea en la rueda sin arma que la lleve');
  });

  it('`usoDelGolpe`: el disparo es a distancia y lo demás, también la carga, de cuerpo a cuerpo', () => {
    // 25-10-2026: la lanza dejó su hueco; la carga va con las armas de cuerpo a cuerpo.
    expect(usoDelGolpe({ ranged: true })).toBe('distancia');
    expect(usoDelGolpe({})).toBe('arma');
  });
});
