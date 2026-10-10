/**
 * La disposición de la base como un solo cuadro (`data/bases/<f>.json`, leída
 * por `shared/base.ts`, vuelta 3): que case con los sitios del núcleo y con la
 * gente de `data/vecinos.json`, que la cuenta de píxel a escenario sea una y
 * reversible, y que lo que se pisa caiga en la franja.
 *
 * Cada regla de `leerDisposicion` se rompe aquí a mano —una región fuera de su
 * tramo, dos que se pisan, una puerta fuera de su región, un tramo que no
 * existe, una plaza pintada demasiado honda, lo que no se pisa— y se mira que
 * lance con su frase: un guardia que nunca se ha visto morder no guarda nada.
 */
import { describe, expect, it } from 'vitest';
import knightJson from '../data/bases/knight.json' with { type: 'json' };
import { SITIOS } from '../src/core/town/sitios.js';
import { idsDeVecinos } from '../src/core/town/voces.js';
import {
  bordeDeAtras,
  disposicionDe,
  enLaFranja,
  FONDO_DE_LA_FRANJA,
  filaDelPanorama,
  leerDisposicion,
  PASO_DE_TRAMO,
  PASOS_POR_TRAMO,
  planoDelCuadro,
  profundidadDeFila,
  SOLAPE,
  TRAMO,
} from '../src/shared/base.js';

const FACCIONES = ['knight', 'necromancer'] as const;

/** Una copia del JSON del caballero para estropearla. */
const copia = (): any => JSON.parse(JSON.stringify(knightJson));

describe('la disposición de la base', () => {
  it('cada facción tiene exactamente los doce sitios del núcleo', () => {
    for (const f of FACCIONES) {
      expect(Object.keys(disposicionDe(f).sitios).sort()).toEqual([...SITIOS].sort());
    }
  });

  it('la franja mide de fondo la mitad de la rejilla de combate, a medio paso: 3,5', () => {
    // Derivada de `FONDO_DEL_COMBATE`: el número que importa es el que midió el
    // arte (la raya de la franja en el cuadro), y si cambiara habría que volver
    // a recortar la base.
    expect(FONDO_DE_LA_FRANJA).toBe(3.5);
  });

  it('el escenario mide sus tramos menos lo de fuera de los extremos, igual en las dos facciones (~50 pasos)', () => {
    for (const f of FACCIONES) {
      const d = disposicionDe(f);
      expect(d.ancho, f).toBe(
        PASOS_POR_TRAMO + (d.tramos - 1) * PASO_DE_TRAMO - d.fuera.izq - d.fuera.der,
      );
      // Cada tramo se monta `SOLAPE` sobre el anterior.
      expect(PASO_DE_TRAMO).toBe((TRAMO.ancho - SOLAPE) / TRAMO.pxPorPaso);
    }
    expect(disposicionDe('knight').ancho).toBe(disposicionDe('necromancer').ancho);
    // ~50 pasos (decisión del usuario): lo de fuera se mide sobre el cuadro, de 0
    // a 6 por lado. Con la junta de medio paso y los cinco tramos pintados, 58
    // (F3): Codex llenó T5 hasta el borde y no sobra nada que recortar.
    expect(disposicionDe('knight').ancho).toBeGreaterThanOrEqual(48);
    expect(disposicionDe('knight').ancho).toBeLessThanOrEqual(58);
    // Un tramo a 128 px por paso es lo que pinta el juego sin remuestrear.
    expect(PASOS_POR_TRAMO).toBe(12);
  });

  it('`filaDelPanorama` y `profundidadDeFila` son inversas, y `planoDelCuadro` las usa', () => {
    for (const y of [-1.5, -0.3, 0, 1.2, FONDO_DE_LA_FRANJA]) {
      expect(profundidadDeFila(filaDelPanorama(y))).toBeCloseTo(y, 9);
    }
    for (const fila of [0, 300, 790, TRAMO.alto]) {
      expect(filaDelPanorama(profundidadDeFila(fila))).toBeCloseTo(fila, 9);
    }
    // Con el cuadro sin bajar, la raya de la franja cae en `filaDelPanorama(0)`;
    // bajado `b` píxeles, la misma raya sube `b` filas en el cuadro.
    const sin = { bajar: [0, 0, 0, 0, 0], fuera: { izq: 5, der: 5 } };
    const raya = planoDelCuadro(sin, 1, [0, filaDelPanorama(0)]);
    expect(raya.x).toBe(-5);
    expect(raya.y).toBeCloseTo(0, 9);
    // Cada tramo con lo suyo: bajar el tercero no mueve el segundo.
    const tercero = { ...sin, bajar: [0, 0, 40, 0, 0] };
    expect(planoDelCuadro(tercero, 3, [768, filaDelPanorama(0) - 40]).y).toBeCloseTo(0, 9);
    expect(planoDelCuadro(tercero, 2, [768, filaDelPanorama(0)]).y).toBeCloseTo(0, 9);
    expect(() => planoDelCuadro(sin, 6, [0, 0])).toThrow(/no hay tramo 6: hay 5/);
    expect(planoDelCuadro(sin, 3, [768, 0]).x).toBe(2 * PASO_DE_TRAMO + 6 - 5);
    // Un paso de x son 128 px del tramo, y el tramo siguiente empieza `SOLAPE` antes del final de este.
    expect(planoDelCuadro(sin, 2, [TRAMO.ancho - SOLAPE, 0]).x).toBe(
      planoDelCuadro(sin, 3, [0, 0]).x,
    );
  });

  it('cada tramo se alinea por su pie: la mediana de sus puertas cae en la raya', () => {
    for (const f of FACCIONES) {
      const d = disposicionDe(f);
      expect(d.bajar, f).toHaveLength(d.tramos);
      for (let n = 1; n <= d.tramos; n++) {
        const ys = SITIOS.filter((s) => d.sitios[s].tramo === n)
          .map((s) => d.sitios[s].umbral.en.y)
          .sort((a, b) => a - b);
        const m =
          ys.length % 2 ? ys[ys.length >> 1]! : (ys[ys.length / 2 - 1]! + ys[ys.length / 2]!) / 2;
        expect(m, `${f} T${n}`).toBeCloseTo(0, 9);
      }
    }
    // En F2, Codex pintó la plaza de T1 y de T2 a alturas distintas: cada uno baja lo suyo.
    const k = disposicionDe('knight');
    expect(Math.abs(k.bajar[0]! - k.bajar[1]!)).toBeGreaterThan(50);
  });

  it('cada puerta cae en su región y se pisa; encargados, entrada y vecinos, en la franja', () => {
    for (const f of FACCIONES) {
      const d = disposicionDe(f);
      expect(enLaFranja(d, d.entrada), `${f}: la entrada`).toBe(true);
      for (const s of SITIOS) {
        const { puerta, encargado, umbral, region } = d.sitios[s];
        const { x } = umbral.en;
        const [px, fila] = umbral.enElCuadro;
        expect(px, `${f}/${s}`).toBeGreaterThanOrEqual(region.x0);
        expect(px, `${f}/${s}`).toBeLessThanOrEqual(region.x1);
        expect(fila, `${f}/${s}`).toBeLessThanOrEqual(region.pie);
        expect(enLaFranja(d, puerta), `${f}/${s}: la puerta`).toBe(true);
        expect(enLaFranja(d, encargado), `${f}/${s}: el encargado`).toBe(true);
        expect(puerta.x).toBe(x);
        // La puerta, justo delante del borde de atrás; el umbral, en él.
        expect(bordeDeAtras(d, x)).toBeCloseTo(umbral.en.y, 9);
        expect(puerta.y - umbral.en.y).toBeGreaterThan(0);
        expect(puerta.y - umbral.en.y).toBeLessThan(0.3);
      }
      for (const [id, v] of Object.entries(d.vecinos)) {
        expect(enLaFranja(d, v.en), `${f}/${id}`).toBe(true);
      }
    }
  });

  it('el borde de atrás une los umbrales en recta y es plano más allá de los extremos', () => {
    const forma = {
      umbrales: [
        { x: 2, y: 0.4 },
        { x: 6, y: -0.4 },
      ],
    };
    expect(bordeDeAtras(forma, 0)).toBe(0.4);
    expect(bordeDeAtras(forma, 4)).toBeCloseTo(0, 9);
    expect(bordeDeAtras(forma, 5)).toBeCloseTo(-0.2, 9);
    expect(bordeDeAtras(forma, 9)).toBe(-0.4);
  });

  it('el ayuntamiento va en el tramo central', () => {
    for (const f of FACCIONES) {
      const d = disposicionDe(f);
      expect(d.sitios.hall.tramo).toBe((d.tramos + 1) / 2);
    }
  });

  it('los vecinos de data/bases y de data/vecinos.json son los mismos, en los dos sentidos', () => {
    for (const f of FACCIONES) {
      expect(Object.keys(disposicionDe(f).vecinos).sort()).toEqual([...idsDeVecinos(f)].sort());
    }
  });

  describe('lanza diciendo qué está mal', () => {
    it('si falta un sitio', () => {
      const j = copia();
      delete j.sitios.tavern;
      expect(() => leerDisposicion('knight', j)).toThrow(/falta el sitio "tavern"/);
    });

    it('si sobra un sitio', () => {
      const j = copia();
      j.sitios.establo = j.sitios.lvl5;
      expect(() => leerDisposicion('knight', j)).toThrow(/sobra el sitio "establo"/);
    });

    it('si un sitio está en un tramo que no existe', () => {
      const j = copia();
      j.sitios.lvl5.tramo = 6;
      expect(() => leerDisposicion('knight', j)).toThrow(
        /el sitio "lvl5" está en el tramo 6, y los hay del 1 al 5/,
      );
    });

    it('si una región sale de lo que se ve de su tramo', () => {
      const j = copia();
      // Lo de fuera del primer tramo no se ve: un edificio ahí no se pisa nunca.
      j.fuera = [1, j.fuera[1]];
      j.sitios.lvl6.region[0] = 100;
      expect(() => leerDisposicion('knight', j)).toThrow(
        /la región de "lvl6" \(100-\d+, hasta la fila \d+\) sale de lo que se ve de su tramo 1 \(columnas 128-1536/,
      );
    });

    it('si dos regiones se pisan', () => {
      const j = copia();
      const [g0, g1] = j.sitios.guild.region;
      j.sitios.tavern.region[0] = g1 - 10;
      j.sitios.tavern.puerta[0] = Math.max(j.sitios.tavern.puerta[0], g1);
      expect(() => leerDisposicion('knight', j)).toThrow(
        new RegExp(
          `las regiones de "guild" \\(${g0}-${g1}\\) y "tavern" \\(${g1 - 10}-\\d+\\) se pisan en el tramo 2`,
        ),
      );
    });

    it('si una puerta cae fuera de su región', () => {
      const j = copia();
      const [h0, h1, pie] = j.sitios.hall.region;
      j.sitios.hall.puerta = [h1 + 5, pie - 10];
      expect(() => leerDisposicion('knight', j)).toThrow(
        new RegExp(
          `la puerta de "hall" \\(${h1 + 5}, ${pie - 10}\\) cae fuera de su región \\(${h0}-${h1}`,
        ),
      );
    });

    it('si la plaza pintada no casa con la franja: un umbral a 2 pasos de la raya', () => {
      const j = copia();
      // T5 lleva dos puertas y su pie es la media de las dos: para que lvl3 quede
      // a −2 de la raya, tiene que estar a −4 de lvl5.
      const lvl5 = j.sitios.lvl5.puerta[1] as number;
      j.sitios.lvl3.puerta[1] = Math.round(lvl5 + 2 * (filaDelPanorama(-2) - filaDelPanorama(0)));
      expect(() => leerDisposicion('knight', j)).toThrow(
        /la plaza pintada no casa con la franja: el umbral de "lvl3" queda a -(1\.99|2\.0\d) pasos de la raya/,
      );
    });

    it('si un tramo no tiene ningún sitio: sin puertas no hay pie por el que alinearlo', () => {
      const j = copia();
      j.tramos = 6;
      expect(() => leerDisposicion('knight', j)).toThrow(/el tramo 6 no tiene ningún sitio/);
    });

    it('si un vecino cae fuera de la franja, no está en data/vecinos.json o falta', () => {
      const j = copia();
      j.vecinos.mozo.en = [10, -1];
      expect(() => leerDisposicion('knight', j)).toThrow(
        /el vecino "mozo" \(10\.00, -1\.00\) cae fuera de lo que se pisa/,
      );
      const k = copia();
      k.vecinos.forastero = { en: k.entrada, mira: 'S' };
      expect(() => leerDisposicion('knight', k)).toThrow(/el vecino "forastero" no está/);
      const l = copia();
      delete l.vecinos.mozo;
      expect(() => leerDisposicion('knight', l)).toThrow(/falta dónde está el vecino "mozo"/);
    });

    it('si lo que se recorta por fuera no va de 0 a 6 pasos', () => {
      const j = copia();
      j.fuera = [7, 5];
      expect(() => leerDisposicion('knight', j)).toThrow(
        /lo que se recorta por la izquierda son 7 pasos: va de 0 a 6/,
      );
    });

    it('si la entrada no se pisa', () => {
      const j = copia();
      j.entrada = [25, 5];
      expect(() => leerDisposicion('knight', j)).toThrow(/la entrada .* fuera de lo que se pisa/);
    });
  });
});
