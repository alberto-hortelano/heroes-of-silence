/**
 * Un solo nivel, derivado de las cifras (`core/unidad/nivel.ts`, 12-10-2026), **con el
 * equipo puesto** (18-10-2026, decisión del usuario: «el nivel ve el equipo»).
 *
 * Los criterios salen de los de aceptación de `docs/agents/2026-10-12-nivel-unico/requisitos.md`
 * y de `docs/agents/2026-10-18-combate-y-ejercitos-en-el-juego/requisitos.md` (F1), no de la
 * implementación: la monotonía se prueba cifra a cifra sobre todo el catálogo; y
 * el equipo, por lo que cada pieza cambia de lo que pega o de lo que aguanta: la
 * armadura, el arma de cada uso, la rueda y la carga. Las 34 unidades del catálogo,
 * en su tabla. La tabla de las criaturas de `data/creatures.json` se fue con ellas
 * (19-10-2026, F3).
 */
import { describe, expect, it } from 'vitest';
import { piezaNueva } from '../src/core/arena/piezas.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/equipo/atado.js';
import { EQUIPO, type Pieza } from '../src/core/equipo/pieza.js';
import { conEquipo } from '../src/core/equipo/vestir.js';
import { umbral } from '../src/core/hero/rango.js';
import { type NivelesDeLaRueda, SPEED_TIERS, type UnitInfo } from '../src/core/types.js';
import {
  cifrasDeUnidad,
  unidad,
  unidadDelJuego,
  unidadesDelJuego,
} from '../src/core/unidad/catalogo.js';
import { restaDelPeso } from '../src/core/unidad/cuerpo.js';
import { cuerpoDeCombate, unidadDeCombate } from '../src/core/unidad/formato.js';
import {
  indiceDePoder,
  medidaBlocker,
  nivelDeUnidad,
  poderBruto,
  validarPoder,
} from '../src/core/unidad/nivel.js';
import { todoA } from './batalla-de-prueba.js';
import { JINETE, PESADA, TROPA } from './comun.js';
import { catalogoCon } from './pelea-de-arena.js';

describe('el índice de poder y el nivel (core/nivel.ts)', () => {
  it('el nivel es la primera cifra del índice, y nunca baja del 1', () => {
    const minima: UnitInfo = {
      name: 'nada',
      faction: null,
      attack: 0,
      fuerza: 1,
      agilidad: 1,
      defensaPropia: 0,
      defense: 0,
      damage: [1, 1],
      hp: 1,
      speed: 'very_slow',
    };
    expect(indiceDePoder(minima)).toBeGreaterThanOrEqual(100);
    expect(nivelDeUnidad(minima)).toBe(1);
  });

  it('es monótono: subir ataque, defensa, PV, daño o velocidad no baja el índice', () => {
    for (const c of unidadesDelJuego()) {
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
    // El ataque de su cuerpo: con el arma puesta, cada golpe va con el ataque de
    // su arma más lo que no es arma (`cifrasDelGolpe`), así que se sube donde se
    // escribe, en la unidad, y se mide vestida.
    const tropa = unidad(TROPA);
    expect(
      indiceDePoder(unidadDeCombate({ ...tropa, attack: tropa.attack + 1 }, EQUIPO_DEL_JUEGO)),
    ).toBeGreaterThan(indiceDePoder(unidadDeCombate(tropa, EQUIPO_DEL_JUEGO)));
  });

  it('un veterano tiene más índice que un novato de su unidad', () => {
    // El rango se suma al cuerpo, antes que su equipo (`cifrasDeUnidad`).
    for (const c of unidadesDelJuego()) {
      const veterano = cifrasDeUnidad(c.id, { experiencia: umbral(5) });
      expect(indiceDePoder(veterano), c.id).toBeGreaterThan(indiceDePoder(c));
    }
  });

  it('el equipo cuenta: ponerse una pieza que no le pesa de más no baja el índice, y el arma de más ataque lo sube', () => {
    // El cuerpo desnudo de la pesada: vestida ya lleva algo en cada hueco.
    const espadachin = cuerpoDeCombate(unidad(PESADA));
    const desnudo = indiceDePoder(espadachin);
    for (const p of EQUIPO) {
      if (restaDelPeso(espadachin.fuerza, p.peso) > 0) continue;
      const puesto = conEquipo(espadachin, { [p.hueco]: p.id });
      expect(indiceDePoder(puesto), p.id).toBeGreaterThanOrEqual(desnudo);
    }
    expect(indiceDePoder(conEquipo(espadachin, { arma: 'espada' }))).toBeGreaterThan(desnudo);
  });

  it('la rueda del arma pesa por su daño: Fuerte y Rápido suben el índice; Ofensivo, Defensivo, Romper guardia y Finta, no', () => {
    const guerrero = unidad('templario-escudo');
    // Un arma nueva, que nace como la Espada, y de la que no cuelga ninguna otra.
    const nueva = piezaNueva('arma', EQUIPO_DEL_JUEGO) as Pieza;
    const conRueda = (rueda: NivelesDeLaRueda) =>
      indiceDePoder(
        unidadDeCombate(
          { ...guerrero, equipo: { ...guerrero.equipo, arma: nueva.id } },
          catalogoCon({ ...nueva, rueda }),
        ),
      );
    const base = conRueda(todoA(3));
    expect(conRueda({ ...todoA(3), fuerte: 6 })).toBeGreaterThan(base);
    expect(conRueda({ ...todoA(3), rapido: 6 })).toBeGreaterThan(base);
    expect(conRueda({ ...todoA(3), fuerte: 0 })).toBeLessThan(base);
    for (const t of ['ofensivo', 'defensivo', 'romperGuardia', 'finta'] as const) {
      expect(conRueda({ ...todoA(3), [t]: 6 }), t).toBe(base);
      expect(conRueda({ ...todoA(3), [t]: 0 }), t).toBe(base);
    }
  });

  it('quien carga montado se mide también por la carga: el jinete sin el caballo vale menos', () => {
    const jinete = unidad('templario-hermano-de-carga');
    expect(jinete.equipo.montura).toBe('caballo_de_guerra');
    const conCaballo = indiceDePoder(unidadDeCombate(jinete, EQUIPO_DEL_JUEGO));
    const { montura: _caballo, ...aPie } = jinete.equipo;
    const sinCaballo = indiceDePoder(
      unidadDeCombate({ ...jinete, equipo: aPie }, EQUIPO_DEL_JUEGO),
    );
    expect(conCaballo).toBeGreaterThan(sinCaballo);
  });

  it('unas cifras que no caben en un entero lanzan diciéndolo, no redondean', () => {
    // El cuerpo sin equipo: vestido, cada golpe pega con las cifras de su arma.
    const enorme: UnitInfo = {
      ...cuerpoDeCombate(unidad(JINETE)),
      damage: [1e9, 1e9],
      hp: 1e9,
    };
    expect(() => poderBruto(enorme)).toThrow(
      `${unidad(JINETE).name}: estas cifras son demasiado grandes`,
    );
    expect(medidaBlocker(enorme)).toContain('1000000000-1000000000 de daño, 1000000000 PV');
    expect(medidaBlocker(unidadDelJuego(JINETE))).toBeNull();
  });

  it('data/poder.json se valida al cargar: una razón que no crece se rechaza', () => {
    const PESOS = {
      normal: 1,
      ofensivo: 1,
      fuerte: 1,
      finta: 1,
      defensivo: 1,
      rapido: 1,
      romperGuardia: 1,
    };
    const R = {
      armaduraDeReferencia: 30,
      pesosDeLaRueda: PESOS,
      pesoDeLaRecarga: 2,
      perforacion: [5, 4],
    };
    expect(() => validarPoder({ umbralDelNivel2: 940, razon: [1, 1], ...R })).toThrow(
      'razon 1/1 no pasa de 1',
    );
    expect(() => validarPoder({ umbralDelNivel2: 0, razon: [2, 1], ...R })).toThrow(
      'umbralDelNivel2',
    );
    expect(() => validarPoder({ umbralDelNivel2: 940, razon: [2], ...R })).toThrow(
      'razon tiene que ser',
    );
    // En enteros, ⌊1 · 3 / 2⌋ = 1: el nivel 3 empezaría donde el 2.
    expect(() => validarPoder({ umbralDelNivel2: 1, razon: [3, 2], ...R })).toThrow(
      'el umbral del nivel 3 sale igual que el del 2',
    );
    // Sin la armadura de referencia, o con 0, no se puede medir lo que aguanta una armadura.
    expect(() =>
      validarPoder({ umbralDelNivel2: 940, razon: [2, 1], pesosDeLaRueda: PESOS }),
    ).toThrow('armaduraDeReferencia tiene que ser un entero ≥ 1 y es undefined');
    expect(() =>
      validarPoder({ ...R, umbralDelNivel2: 940, razon: [2, 1], armaduraDeReferencia: 0 }),
    ).toThrow('armaduraDeReferencia');
    // Los pesos de la medida: los siete tipos, enteros ≥ 0, y alguno que pese.
    const { finta: _sinFinta, ...seis } = PESOS;
    expect(() =>
      validarPoder({ ...R, umbralDelNivel2: 940, razon: [2, 1], pesosDeLaRueda: seis }),
    ).toThrow('pesosDeLaRueda tiene que ser un entero ≥ 0 por cada tipo de la rueda');
    expect(() =>
      validarPoder({
        ...R,
        umbralDelNivel2: 940,
        razon: [2, 1],
        pesosDeLaRueda: { ...PESOS, fuerte: -1 },
      }),
    ).toThrow('pesosDeLaRueda tiene que ser');
    const ceros = Object.fromEntries(Object.keys(PESOS).map((t) => [t, 0]));
    expect(() =>
      validarPoder({ ...R, umbralDelNivel2: 940, razon: [2, 1], pesosDeLaRueda: ceros }),
    ).toThrow('pesosDeLaRueda son todos 0');
    expect(validarPoder({ umbralDelNivel2: 940, razon: [8, 5], ...R }).razon).toEqual([8, 5]);
    // Las armas de fuego (02-11-2026): un peso de la recarga ≥ 1 y una perforación que no baje de 1.
    const base = { umbralDelNivel2: 940, razon: [2, 1], ...R };
    expect(() => validarPoder({ ...base, pesoDeLaRecarga: 0 })).toThrow(
      'pesoDeLaRecarga tiene que ser un entero ≥ 1 y es 0',
    );
    expect(() => validarPoder({ ...base, perforacion: [4, 5] })).toThrow(
      'perforacion 4/5 baja de 1',
    );
    // La forma, la misma que la de la razón (`fraccionDelPoder`).
    expect(() => validarPoder({ ...base, perforacion: [5] })).toThrow(
      'perforacion tiene que ser [numerador, denominador]',
    );
  });
});
