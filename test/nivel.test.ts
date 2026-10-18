/**
 * Un solo nivel, derivado de las cifras (`core/nivel.ts`, 12-10-2026), **con el
 * equipo puesto** (18-10-2026, decisión del usuario: «el nivel ve el equipo»).
 *
 * Los criterios salen de `docs/agents/2026-10-12-nivel-unico/plan.md` §7 y de
 * `docs/agents/2026-10-18-combate-y-ejercitos-en-el-juego/plan.md` (F1), no de la
 * implementación: la tabla de las criaturas es la de la calibración del primero
 * (§3), con la carga del jinete que ahora cuenta; la monotonía se prueba cifra a
 * cifra sobre todo el catálogo; y el equipo, por lo que cada pieza cambia de lo
 * que pega o de lo que aguanta: la armadura, el arma de cada uso, la rueda y la
 * carga. Las 34 unidades del catálogo, en su tabla.
 */
import { describe, expect, it } from 'vitest';
import { catalogoDeLaArena, equiparEnArena, piezaNueva } from '../src/core/arena.js';
import { UNIDADES, unidad } from '../src/core/catalogo.js';
import { allCreatures, creature, EQUIPO, type Pieza, validarPoder } from '../src/core/data.js';
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
import { type NivelesDeLaRueda, SPEED_TIERS, type UnitInfo } from '../src/core/types.js';
import { unidadDeCombate } from '../src/core/unidad.js';
import { DEL_JUEGO, todoA } from './helpers.js';

/**
 * id → [morada, índice, nivel], la tabla de §3 del plan (calculada a mano en el
 * scratchpad). Desde el 18-10-2026 se mide con la carga: la caballería y el campeón,
 * con el rasgo `charge`, a media recta (×1,25: 475 → 496 y 507 → 520, en el mismo
 * nivel), y los demás con la carga a pie de la regla final (simplify de F1: +2 a
 * +10 de índice; el zombi mutante pasa al nivel 3 y el dragón óseo al 7, contiguos
 * a su morada).
 */
const TABLA: Readonly<Record<string, readonly [number, number, number]>> = {
  peasant: [1, 120, 1],
  archer: [2, 249, 2],
  ranger: [2, 327, 3],
  pikeman: [3, 336, 3],
  veteran_pikeman: [3, 368, 3],
  swordsman: [4, 411, 4],
  master_swordsman: [4, 431, 4],
  cavalry: [5, 496, 4],
  champion: [5, 520, 5],
  paladin: [6, 620, 6],
  crusader: [6, 647, 6],
  skeleton: [1, 195, 1],
  zombie: [2, 256, 2],
  mutant_zombie: [2, 305, 3],
  mummy: [3, 366, 3],
  royal_mummy: [3, 395, 3],
  vampire: [4, 426, 4],
  vampire_lord: [4, 456, 4],
  lich: [5, 500, 5],
  power_lich: [5, 529, 5],
  bone_dragon: [6, 700, 7],
};

/**
 * id → [índice, nivel] de cada unidad del catálogo (`data/unidades.json`) con su
 * equipo, medida el 18-10-2026 al pasar al nivel con equipo. Es el ancla: un
 * cambio de la fórmula, de `data/poder.json`, de una pieza o de una unidad la
 * mueve, y se mira a propósito. Tras simplify (carga a pie y rueda × carga), las
 * unidades sin `charge` suben de +5 a +10 y los jinetes +3. **Es el único sitio del
 * rango de índices y niveles del catálogo**: `data/poder.json`, `nivel.ts` y
 * `unidad.ts` apuntan aquí.
 */
const TABLA_DEL_CATALOGO: Readonly<Record<string, readonly [number, number]>> = {
  'templario-escudo': [295, 2],
  'templario-mandoble': [349, 3],
  'templario-monje': [220, 2],
  'templario-escudero': [311, 3],
  'templario-hermano-de-carga': [499, 4],
  'templario-penitente': [349, 3],
  'esqueleto-guerrero': [259, 2],
  'esqueleto-arquero': [254, 2],
  zombi: [324, 3],
  espectro: [311, 3],
  'caballero-de-la-muerte': [338, 3],
  'jinete-de-plaga': [476, 4],
  'imperio-alabardero': [347, 3],
  'imperio-piquero': [338, 3],
  'imperio-ballestero': [308, 3],
  'imperio-coracero': [293, 2],
  'imperio-arcabucero': [308, 3],
  'imperio-rodelero': [311, 3],
  'imperio-artillero-culebrina': [308, 3],
  'imperio-pistolero-montado': [476, 4],
  'imperio-granadero': [317, 3],
  'elfo-arquero': [291, 2],
  'elfo-explorador': [306, 3],
  'elfo-guardia-del-bosque': [311, 3],
  'elfo-jinete': [476, 4],
  'elfo-sacerdotisa': [228, 2],
  'elfo-asesino': [311, 3],
  'orko-hacha-escudo': [324, 3],
  'orko-dos-armas': [349, 3],
  'goblin-lancero': [249, 2],
  'goblin-arquero': [266, 2],
  'troll-maza': [338, 3],
  'goblin-jinete-de-hiena': [476, 4],
  'orko-armadura-pesada': [349, 3],
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

  it('el equipo cuenta: ponerse una pieza que no frena no baja el índice, y el arma de más ataque lo sube', () => {
    const espadachin = creature('swordsman');
    const desnudo = indiceDePoder(espadachin);
    for (const p of EQUIPO) {
      if ((p.velocidad ?? 0) < 0) continue;
      const puesto = conEquipo(espadachin, { [p.hueco]: p.id });
      expect(indiceDePoder(puesto), p.id).toBeGreaterThanOrEqual(desnudo);
    }
    expect(indiceDePoder(conEquipo(espadachin, { arma: 'espada_de_armeria' }))).toBeGreaterThan(
      desnudo,
    );
  });

  it('la armadura cuenta en lo que aguanta, contra un golpe de 30, y como mucho ×4', () => {
    const cuerpo: UnitInfo = {
      name: 'cuerpo',
      faction: null,
      attack: 3,
      defense: 3,
      damage: [20, 40],
      hp: 80,
      speed: 'average',
    };
    const con = (armadura: number) => indiceDePoder({ ...cuerpo, puntosDeArmadura: armadura });
    expect(con(7)).toBeGreaterThan(indiceDePoder(cuerpo));
    expect(con(22)).toBeGreaterThan(con(7));
    // De 23 en adelante (30 − ⌊30 / 4⌋), el tope: no hace a nadie inmortal en la cuenta.
    expect(con(40)).toBe(con(23));
    expect(con(22)).toBeLessThan(con(23));
  });

  it('lo que pega es el mejor de sus golpes, cada uno con su arma: el disparo cuenta si tira', () => {
    // El arquero de las hojas pega con la daga y dispara con el arco.
    const arquero = unidad('elfo-arquero');
    const conArco = indiceDePoder(unidadDeCombate(arquero, DEL_JUEGO));
    const { distancia: _arco, ...sinElArco } = arquero.equipo;
    expect(_arco).toBe('arco');
    const sinArco = indiceDePoder(unidadDeCombate({ ...arquero, equipo: sinElArco }, DEL_JUEGO));
    expect(conArco).toBeGreaterThan(sinArco);
    // Con la ballesta, que pega más, más todavía.
    const conBallesta = equiparEnArena(arquero, 'ballesta', DEL_JUEGO);
    expect(indiceDePoder(unidadDeCombate(conBallesta, DEL_JUEGO))).toBeGreaterThan(conArco);
  });

  it('la rueda del arma pesa por su daño: Fuerte y Rápido suben el índice; Ofensivo, Defensivo, Romper guardia y Finta, no', () => {
    const guerrero = unidad('templario-escudo');
    // Un arma nueva, que nace como la Espada, y de la que no cuelga ninguna otra.
    const nueva = piezaNueva('arma', DEL_JUEGO) as Pieza;
    const conRueda = (rueda: NivelesDeLaRueda) =>
      indiceDePoder(
        unidadDeCombate(
          { ...guerrero, equipo: { ...guerrero.equipo, arma: nueva.id } },
          catalogoDeLaArena([{ ...nueva, rueda }]),
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

  it('la carga compone con la rueda: lo que da la lanza al Fuerte y al Rápido pesa en el primer golpe de la carga', () => {
    // Simplify de F1: se mide como pelearán (rueda × carga, `intercambio`), no la carga sola.
    const jinete = unidad('templario-hermano-de-carga');
    // Una copia de la lanza de jinete, que no cuelga de nadie.
    const lanza = piezaNueva(DEL_JUEGO.pieza('lanza_de_jinete'), DEL_JUEGO) as Pieza;
    const conLaLanza = (rueda: NivelesDeLaRueda) =>
      indiceDePoder(
        unidadDeCombate(
          { ...jinete, equipo: { ...jinete.equipo, carga: lanza.id } },
          catalogoDeLaArena([{ ...lanza, rueda }]),
        ),
      );
    const base = conLaLanza(todoA(3));
    expect(conLaLanza({ ...todoA(3), fuerte: 6 })).toBeGreaterThan(base);
    expect(conLaLanza({ ...todoA(3), rapido: 6 })).toBeGreaterThan(base);
    expect(conLaLanza({ ...todoA(3), finta: 6 })).toBe(base);
  });

  it('quien carga se mide también por la carga: el jinete sin el caballo vale menos', () => {
    const jinete = unidad('templario-hermano-de-carga');
    expect(jinete.traits).toContain('charge');
    const conCaballo = indiceDePoder(unidadDeCombate(jinete, DEL_JUEGO));
    const aPie = indiceDePoder(unidadDeCombate({ ...jinete, traits: [] }, DEL_JUEGO));
    expect(conCaballo).toBeGreaterThan(aPie);
  });

  it('las unidades del catálogo, vestidas, tienen el índice y el nivel de su tabla', () => {
    const leidas = Object.fromEntries(
      UNIDADES.map((u) => {
        const c = unidadDeCombate(u, DEL_JUEGO);
        return [u.id, [indiceDePoder(c), nivelDeUnidad(c)]];
      }),
    );
    expect(leidas).toEqual(TABLA_DEL_CATALOGO);
  });

  it('el héroe: su cuerpo crece por rango y su nivel se lee de él, con el equipo', () => {
    const conRango = (r: number) =>
      heroUnit({ name: 'X', attack: 2, defense: 2, experience: umbral(r), equipo: {} });
    expect(indiceDePoder(conRango(5))).toBe(363);
    expect(nivelDeUnidad(conRango(5))).toBe(3);
    expect(indiceDePoder(conRango(10))).toBeGreaterThan(indiceDePoder(conRango(5)));
    // Con el equipo base, más: las piezas cuentan.
    const equipado = heroUnit({
      name: 'X',
      attack: 2,
      defense: 2,
      experience: umbral(5),
      equipo: { arma: 'espada_de_armeria' },
    });
    expect(equipado.attack).toBeGreaterThan(conRango(5).attack);
    expect(indiceDePoder(equipado)).toBe(376);
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
    const PESOS = {
      normal: 1,
      ofensivo: 1,
      fuerte: 1,
      finta: 1,
      defensivo: 1,
      rapido: 1,
      romperGuardia: 1,
    };
    const R = { armaduraDeReferencia: 30, pesosDeLaRueda: PESOS };
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
  });
});
