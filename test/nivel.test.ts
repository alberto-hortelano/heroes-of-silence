/**
 * Un solo nivel, derivado de las cifras (`core/nivel.ts`, 12-10-2026).
 *
 * Los criterios salen de `docs/agents/2026-10-12-nivel-unico/plan.md` §7, no de
 * la implementación: la tabla del catálogo es la de la calibración del plan
 * (§3), hecha antes de escribir el código; la monotonía se prueba cifra a cifra
 * sobre todo el catálogo; y el equipo, poniendo y quitando cada pieza.
 */
import { describe, expect, it } from 'vitest';
import { allCreatures, creature, EQUIPO, validarPoder } from '../src/core/data.js';
import { conEquipo } from '../src/core/hero/equipo.js';
import { cifrasVeteranas, umbral } from '../src/core/hero/experiencia.js';
import { heroUnit } from '../src/core/hero/hero.js';
import {
  catalogoMedible,
  indiceDePoder,
  medidaBlocker,
  nivelDeUnidad,
  poderBruto,
} from '../src/core/nivel.js';
import { SPEED_TIERS, type UnitInfo } from '../src/core/types.js';

/** id → [morada, índice, nivel], la tabla de §3 del plan (calculada a mano en el scratchpad). */
const TABLA: Readonly<Record<string, readonly [number, number, number]>> = {
  peasant: [1, 119, 1],
  archer: [2, 249, 2],
  ranger: [2, 327, 3],
  pikeman: [3, 328, 3],
  veteran_pikeman: [3, 359, 3],
  swordsman: [4, 405, 4],
  master_swordsman: [4, 424, 4],
  cavalry: [5, 475, 4],
  champion: [5, 507, 5],
  paladin: [6, 617, 6],
  crusader: [6, 642, 6],
  skeleton: [1, 189, 1],
  zombie: [2, 248, 2],
  mutant_zombie: [2, 299, 2],
  mummy: [3, 357, 3],
  royal_mummy: [3, 384, 3],
  vampire: [4, 419, 4],
  vampire_lord: [4, 448, 4],
  lich: [5, 500, 5],
  power_lich: [5, 529, 5],
  bone_dragon: [6, 690, 6],
};

describe('el índice de poder y el nivel (core/nivel.ts)', () => {
  it('cada criatura del catálogo tiene el índice y el nivel de la tabla del plan', () => {
    const leidas = Object.fromEntries(
      allCreatures().map((c) => [c.id, [c.morada, indiceDePoder(c), nivelDeUnidad(c)]]),
    );
    expect(leidas).toEqual(TABLA);
  });

  it('cada criatura queda en el nivel de su morada o en el contiguo, y el campesino en el 1', () => {
    for (const c of allCreatures()) {
      expect(Math.abs(nivelDeUnidad(c) - c.morada), c.id).toBeLessThanOrEqual(1);
    }
    expect(nivelDeUnidad(creature('peasant'))).toBe(1);
  });

  it('el nivel es la primera cifra del índice, y nunca baja del 1', () => {
    const minima: UnitInfo = {
      name: 'nada',
      faction: null,
      attack: 0,
      defense: 0,
      damage: [1, 1],
      hp: 1,
      speed: 'very_slow',
    };
    expect(indiceDePoder(minima)).toBeGreaterThanOrEqual(100);
    expect(nivelDeUnidad(minima)).toBe(1);
  });

  it('es monótono: subir ataque, defensa, PV, daño o velocidad no baja el índice', () => {
    for (const c of allCreatures()) {
      const antes = indiceDePoder(c);
      const escalon = SPEED_TIERS.indexOf(c.speed);
      const subidas: UnitInfo[] = [
        { ...c, attack: c.attack + 1 },
        { ...c, defense: c.defense + 1 },
        { ...c, hp: c.hp + 1 },
        { ...c, damage: [c.damage[0] + 1, c.damage[1] + 1] },
        { ...c, damage: [c.damage[0], c.damage[1] + 1] },
        { ...c, speed: SPEED_TIERS[Math.min(SPEED_TIERS.length - 1, escalon + 1)] ?? c.speed },
      ];
      for (const s of subidas) expect(indiceDePoder(s), c.id).toBeGreaterThanOrEqual(antes);
    }
  });

  it('subir el ataque de una unidad tipo SÍ sube su índice', () => {
    const piquero = creature('pikeman');
    expect(indiceDePoder({ ...piquero, attack: piquero.attack + 1 })).toBeGreaterThan(
      indiceDePoder(piquero),
    );
  });

  it('un veterano tiene más índice que un novato de su criatura', () => {
    for (const c of allCreatures()) {
      expect(indiceDePoder(cifrasVeteranas(c, 5)), c.id).toBeGreaterThan(indiceDePoder(c));
    }
  });

  it('el equipo no cuenta: poner o quitar cualquier pieza no mueve índice ni nivel, y sí las cifras', () => {
    const espadachin = creature('swordsman');
    const desnudo = indiceDePoder(espadachin);
    for (const p of EQUIPO) {
      const puesto = conEquipo(espadachin, { [p.hueco]: p.id });
      expect(puesto, p.id).not.toBe(espadachin);
      expect(indiceDePoder(puesto), p.id).toBe(desnudo);
      expect(nivelDeUnidad(puesto), p.id).toBe(nivelDeUnidad(espadachin));
    }
    // Y sobre lo que ya lleva equipo: se mide el cuerpo, no la primera capa.
    const dos = conEquipo(conEquipo(espadachin, { arma: 'garrote' }), {
      armadura: 'cota_de_malla',
    });
    expect(dos.sinEquipo).toBe(espadachin);
  });

  it('el héroe: su cuerpo crece por rango y su nivel se lee de él, sin el equipo', () => {
    const conRango = (r: number) =>
      heroUnit({ name: 'X', attack: 2, defense: 2, experience: umbral(r), equipo: {} });
    expect(indiceDePoder(conRango(5))).toBe(354);
    expect(nivelDeUnidad(conRango(5))).toBe(3);
    expect(indiceDePoder(conRango(10))).toBeGreaterThan(indiceDePoder(conRango(5)));
    // Con el equipo base el mismo nivel: las piezas no cuentan.
    const equipado = heroUnit({
      name: 'X',
      attack: 2,
      defense: 2,
      experience: umbral(5),
      equipo: { arma: 'espada_de_armeria' },
    });
    expect(equipado.attack).toBeGreaterThan(conRango(5).attack);
    expect(indiceDePoder(equipado)).toBe(354);
  });

  it('unas cifras que no caben en un entero lanzan diciéndolo, no redondean', () => {
    const enorme: UnitInfo = {
      ...creature('bone_dragon'),
      damage: [1e9, 1e9],
      hp: 1e9,
    };
    expect(() => poderBruto(enorme)).toThrow('Dragón óseo: estas cifras son demasiado grandes');
    expect(medidaBlocker(enorme)).toContain('1000000000-1000000000 de daño, 1000000000 PV');
    expect(medidaBlocker(creature('bone_dragon'))).toBeNull();
  });

  it('un catálogo con una criatura que no se puede medir falla al cargar, diciendo cuál', () => {
    const enorme: UnitInfo = { ...creature('paladin'), hp: 1e15 };
    expect(() => catalogoMedible([creature('peasant'), enorme])).toThrow(
      'data/creatures.json: la criatura «Paladín»: estas cifras son demasiado grandes',
    );
    expect(() => catalogoMedible(allCreatures())).not.toThrow();
  });

  it('data/poder.json se valida al cargar: una razón que no crece se rechaza', () => {
    expect(() => validarPoder({ umbralDelNivel2: 940, razon: [1, 1] })).toThrow(
      'razon 1/1 no pasa de 1',
    );
    expect(() => validarPoder({ umbralDelNivel2: 0, razon: [2, 1] })).toThrow('umbralDelNivel2');
    expect(() => validarPoder({ umbralDelNivel2: 940, razon: [2] })).toThrow('razon tiene que ser');
    // En enteros, ⌊1 · 3 / 2⌋ = 1: el nivel 3 empezaría donde el 2.
    expect(() => validarPoder({ umbralDelNivel2: 1, razon: [3, 2] })).toThrow(
      'el umbral del nivel 3 sale igual que el del 2',
    );
    expect(validarPoder({ umbralDelNivel2: 940, razon: [8, 5] }).razon).toEqual([8, 5]);
  });
});
