/**
 * Un solo nivel, derivado de las cifras (`core/nivel.ts`, 12-10-2026), **con el
 * equipo puesto** (18-10-2026, decisión del usuario: «el nivel ve el equipo»).
 *
 * Los criterios salen de `docs/agents/2026-10-12-nivel-unico/plan.md` §7 y de
 * `docs/agents/2026-10-18-combate-y-ejercitos-en-el-juego/plan.md` (F1), no de la
 * implementación: la monotonía se prueba cifra a cifra sobre todo el catálogo; y
 * el equipo, por lo que cada pieza cambia de lo que pega o de lo que aguanta: la
 * armadura, el arma de cada uso, la rueda y la carga. Las 34 unidades del catálogo,
 * en su tabla. La tabla de las criaturas de `data/creatures.json` se fue con ellas
 * (19-10-2026, F3).
 */
import { describe, expect, it } from 'vitest';
import { equiparEnArena, piezaNueva } from '../src/core/arena.js';
import {
  cifrasDeUnidad,
  UNIDADES,
  unidad,
  unidadDelJuego,
  unidadesDelJuego,
} from '../src/core/catalogo.js';
import { restaDelPeso } from '../src/core/cuerpo.js';
import { EQUIPO, type Pieza, validarPoder } from '../src/core/data.js';
import { conEquipo, EQUIPO_DEL_JUEGO, pieza } from '../src/core/hero/equipo.js';
import { umbral } from '../src/core/hero/experiencia.js';
import { heroUnit } from '../src/core/hero/hero.js';
import { indiceDePoder, medidaBlocker, nivelDeUnidad, poderBruto } from '../src/core/nivel.js';
import { type NivelesDeLaRueda, SPEED_TIERS, type UnitInfo } from '../src/core/types.js';
import { cuerpoDeCombate, unidadDeCombate } from '../src/core/unidad.js';
import { catalogoCon, JINETE, PESADA, TROPA, todoA } from './helpers.js';

/**
 * id → [índice, nivel] de cada unidad del catálogo (`data/unidades.json`) con su
 * equipo, medida el 18-10-2026 al pasar al nivel con equipo. Es el ancla: un
 * cambio de la fórmula, de `data/poder.json`, de una pieza o de una unidad la
 * mueve, y se mira a propósito. Tras simplify (carga a pie y rueda × carga), las
 * unidades sin `charge` suben de +5 a +10 y los jinetes +3. **Es el único sitio del
 * rango de índices y niveles del catálogo**: `data/poder.json`, `nivel.ts` y
 * `unidad.ts` apuntan aquí. Re-anclada sin juzgar el 26-10-2026 con la escala baja
 * (fuerza, PV y armadura ×0,3, `docs/agents/2026-10-26-escala-baja/`), y el
 * 31-10-2026 con el peso que resta 1 por cada fuerza entera, o parte, que pasa
 * (once unidades bajan; el esqueleto guerrero, al nivel 1), y el 02-11-2026 con las
 * armas de fuego y la granada del imperio (`docs/agents/2026-11-02-armas-de-fuego-y-granadas/`:
 * el arcabucero y el artillero, de 271 a 216, los mide su daga; el granadero, de 306 a
 * 258, nivel 3 → 2; el pistolero montado no se mueve, lo mide su carga), y el 02-11-2026
 * con el catálogo retocado a mano en la arena (commit `0f715185`, «equipo y unidades»:
 * menos fuerza en casi todas las unidades y en las armas, menos peso en las armaduras,
 * otro equipo de serie en varias; la daga y el bastón sin fuerza): casi todas bajan,
 * suben el espectro y el caballero de la muerte (la coraza, que ahora pesa 3), y el
 * catálogo va del 167 (esqueleto guerrero) al 425 (jinete elfo), del nivel 1 al 4.
 */
const TABLA_DEL_CATALOGO: Readonly<Record<string, readonly [number, number]>> = {
  'templario-escudo': [218, 2],
  'templario-mandoble': [223, 2],
  'templario-monje': [210, 2],
  'templario-escudero': [206, 2],
  'templario-hermano-de-carga': [394, 3],
  'templario-penitente': [289, 2],
  'esqueleto-guerrero': [167, 1],
  'esqueleto-arquero': [189, 1],
  zombi: [202, 2],
  espectro: [357, 3],
  'caballero-de-la-muerte': [343, 3],
  'jinete-de-plaga': [311, 3],
  'imperio-alabardero': [221, 2],
  'imperio-piquero': [219, 2],
  'imperio-ballestero': [239, 2],
  'imperio-coracero': [268, 2],
  'imperio-arcabucero': [187, 1],
  'imperio-rodelero': [214, 2],
  'imperio-artillero-culebrina': [192, 1],
  'imperio-pistolero-montado': [329, 3],
  'imperio-granadero': [219, 2],
  'elfo-arquero': [228, 2],
  'elfo-explorador': [199, 1],
  'elfo-guardia-del-bosque': [208, 2],
  'elfo-jinete': [425, 4],
  'elfo-sacerdotisa': [202, 2],
  'elfo-asesino': [310, 3],
  'orko-hacha-escudo': [247, 2],
  'orko-dos-armas': [240, 2],
  'goblin-lancero': [171, 1],
  'goblin-arquero': [192, 1],
  'troll-maza': [268, 2],
  'goblin-jinete-de-hiena': [292, 2],
  'orko-armadura-pesada': [248, 2],
};

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

  it('la armadura cuenta en lo que aguanta, contra un golpe de 9, y como mucho ×4', () => {
    const cuerpo: UnitInfo = {
      name: 'cuerpo',
      faction: null,
      attack: 3,
      fuerza: 20,
      agilidad: 4,
      defensaPropia: 0,
      defense: 3,
      damage: [20, 40],
      hp: 80,
      speed: 'average',
    };
    const con = (armadura: number) => indiceDePoder({ ...cuerpo, puntosDeArmadura: armadura });
    expect(con(2)).toBeGreaterThan(indiceDePoder(cuerpo));
    expect(con(6)).toBeGreaterThan(con(2));
    // De 7 en adelante (9 − ⌊9 / 4⌋), el tope: no hace a nadie inmortal en la cuenta.
    expect(con(20)).toBe(con(7));
    expect(con(6)).toBeLessThan(con(7));
  });

  it('lo que pega es el mejor de sus golpes, cada uno con su arma: el disparo cuenta si tira', () => {
    // El arquero de las hojas pega con la espada y dispara con el arco.
    const arquero = unidad('elfo-arquero');
    const conArco = indiceDePoder(unidadDeCombate(arquero, EQUIPO_DEL_JUEGO));
    const { distancia: _arco, ...sinElArco } = arquero.equipo;
    expect(_arco).toBe('arco');
    const sinArco = indiceDePoder(
      unidadDeCombate({ ...arquero, equipo: sinElArco }, EQUIPO_DEL_JUEGO),
    );
    expect(conArco).toBeGreaterThan(sinArco);
    // Con la ballesta, que pega más, más todavía.
    const conBallesta = equiparEnArena(arquero, 'ballesta', EQUIPO_DEL_JUEGO);
    expect(indiceDePoder(unidadDeCombate(conBallesta, EQUIPO_DEL_JUEGO))).toBeGreaterThan(conArco);
  });

  it('el arma de fuego y la granada se miden (02-11-2026): la recarga baja el disparo y la granada cuenta como un disparo', () => {
    // El arquero, cuyo índice lo da su arco (con la espada sola, 193), con su arco
    // hecho arma de fuego de su misma horquilla (la agilidad del arma, la suya): ×2/3
    // por recargar 1 y ×5/4 por perforar; con recarga 2, ×1/2 × 5/4, aún por encima
    // de la espada (02-11-2026: la espada del catálogo retocado pega menos que la
    // daga de antes), y con recarga 3, ×2/5 × 5/4, por debajo. Hecho granada, como el
    // arco: su área paga sus cargas.
    const arquero = unidad('elfo-arquero');
    const arco = pieza('arco');
    const con = (p: Pieza): number => indiceDePoder(unidadDeCombate(arquero, catalogoCon(p)));
    const conArco = con(arco);
    const fuego = (recarga: number): Pieza => ({
      ...arco,
      tiro: 'fuego',
      agilidad: arquero.agilidad,
      recarga,
    });
    const { distancia: _arco, ...sinElArco } = arquero.equipo;
    const sinArco = indiceDePoder(
      unidadDeCombate({ ...arquero, equipo: sinElArco }, EQUIPO_DEL_JUEGO),
    );
    expect(con(fuego(1))).toBeLessThan(conArco);
    expect(con(fuego(1))).toBeGreaterThan(con(fuego(2)));
    expect(con(fuego(2))).toBeGreaterThan(con(fuego(3)));
    expect(con(fuego(3))).toBe(sinArco);
    expect(con({ ...arco, tiro: 'granada', cargas: 2 })).toBe(conArco);
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

  it('la rueda de la segunda arma pesa en el índice: de cada tipo, la mejor de las dos (25-10-2026)', () => {
    // Se mide como pelearán (rueda × carga, `intercambio`), no la carga sola.
    const jinete = unidad('templario-hermano-de-carga');
    // Una copia de la lanza, que no cuelga de nadie, en la segunda mano.
    const lanza = piezaNueva(EQUIPO_DEL_JUEGO.pieza('lanza'), EQUIPO_DEL_JUEGO) as Pieza;
    const conLaLanza = (rueda: NivelesDeLaRueda) =>
      indiceDePoder(
        unidadDeCombate(
          { ...jinete, equipo: { ...jinete.equipo, segunda: lanza.id } },
          catalogoCon({ ...lanza, rueda }),
        ),
      );
    const base = conLaLanza(todoA(3));
    expect(conLaLanza({ ...todoA(3), fuerte: 6 })).toBeGreaterThan(base);
    expect(conLaLanza({ ...todoA(3), rapido: 6 })).toBeGreaterThan(base);
    expect(conLaLanza({ ...todoA(3), finta: 6 })).toBe(base);
    // Por debajo de la espada (todo a 3), lo de la lanza no cuenta: manda la espada.
    expect(conLaLanza({ ...todoA(3), fuerte: 0, rapido: 0 })).toBe(base);
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

  it('las unidades del catálogo, vestidas, tienen el índice y el nivel de su tabla', () => {
    const leidas = Object.fromEntries(
      UNIDADES.map((u) => {
        const c = unidadDeCombate(u, EQUIPO_DEL_JUEGO);
        return [u.id, [indiceDePoder(c), nivelDeUnidad(c)]];
      }),
    );
    expect(leidas).toEqual(TABLA_DEL_CATALOGO);
  });

  it('el héroe: su cuerpo crece por rango y su nivel se lee de él, con el equipo', () => {
    const conRango = (r: number) =>
      heroUnit({ name: 'X', attack: 2, defense: 2, experience: umbral(r), equipo: {} });
    expect(indiceDePoder(conRango(5))).toBe(356);
    expect(nivelDeUnidad(conRango(5))).toBe(3);
    expect(indiceDePoder(conRango(10))).toBeGreaterThan(indiceDePoder(conRango(5)));
    // Con la Espada, más: las piezas cuentan.
    const equipado = heroUnit({
      name: 'X',
      attack: 2,
      defense: 2,
      experience: umbral(5),
      equipo: { arma: 'espada' },
    });
    expect(equipado.attack).toBeGreaterThan(conRango(5).attack);
    expect(indiceDePoder(equipado)).toBe(397);
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
