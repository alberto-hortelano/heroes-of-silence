/**
 * La curva del disparo del maniquí (`tools/art/ybot-a-distancia.ts`): depende
 * del PROGRESO del clip y no del índice del fotograma. Con `frame % 6`, en 8
 * direcciones —12 fotogramas— las siete columnas de la hoja mezclaban dos
 * disparos. `DISPARO_EN_NODE` evalúa el mismo texto que corre en la página de
 * sprite-forge, no una copia.
 */
import { describe, expect, it } from 'vitest';
import { FIGURA } from '../src/shared/arte.js';
import { columnaDeSuelta, indicesDeClip, OCHO_DIRECCIONES } from '../tools/art/poses.js';
import { CURVAS_DEL_DISPARO, DISPARO_EN_NODE as curva } from '../tools/art/ybot-a-distancia.js';

const DISPAROS = Object.keys(CURVAS_DEL_DISPARO) as (keyof typeof CURVAS_DEL_DISPARO)[];

describe('la curva del disparo del maniquí', () => {
  it('en sus seis nudos da sus ordenadas exactas: la hoja de una dirección no cambia', () => {
    for (const kind of DISPAROS) {
      const a6 = Array.from({ length: 6 }, (_, f) =>
        curva.curvaDelDisparo(kind, curva.progresoDelDisparo(f, 6)),
      );
      expect(a6, kind).toEqual(CURVAS_DEL_DISPARO[kind]);
    }
    expect(CURVAS_DEL_DISPARO.bow).toEqual([0, 0.45, 1, 1, 0.65, 0]);
    expect(CURVAS_DEL_DISPARO.crossbow).toEqual([0, 0.7, 1, 1, 0.55, 0]);
  });

  it('la suelta es el último nudo en lo más alto: tensa sin aflojar hasta ella, y afloja después', () => {
    for (const kind of DISPAROS) {
      const suelta = curva.sueltaDelDisparo(kind);
      expect(suelta, kind).toBe(0.6);
      let antes = -1;
      for (let i = 0; i <= 100; i++) {
        const p = (i / 100) * suelta;
        const v = curva.curvaDelDisparo(kind, p);
        expect(v, `${kind} p=${p}`).toBeGreaterThanOrEqual(antes);
        expect(curva.cuerdaTensa(kind, p), `${kind} p=${p}`).toBe(true);
        antes = v;
      }
      expect(curva.curvaDelDisparo(kind, suelta + 0.01)).toBeLessThan(1);
      expect(curva.cuerdaTensa(kind, suelta + 0.01)).toBe(false);
    }
  });

  it('en 8 direcciones las siete columnas son UN disparo, y suelta en la columna que dice columnaDeSuelta', () => {
    const n = OCHO_DIRECCIONES.fps; // el clip dura 1 s: 12 fotogramas
    const indices = indicesDeClip(n, FIGURA.columnas, false);
    const progresos = indices.map((f) => curva.progresoDelDisparo(f, n));
    for (let i = 1; i < progresos.length; i++) {
      expect(progresos[i], `columna ${i}`).toBeGreaterThan(progresos[i - 1] as number);
    }
    expect(progresos[0]).toBe(0);
    expect(curva.progresoDelDisparo(n - 1, n)).toBe(1);
    for (const kind of DISPAROS) {
      const col = columnaDeSuelta(kind, n, FIGURA.columnas);
      expect(curva.cuerdaTensa(kind, progresos[col - 1] as number), kind).toBe(true);
      expect(curva.cuerdaTensa(kind, progresos[col] as number), kind).toBe(false);
      expect(col, kind).toBe(4);
    }
  });

  it('se niega diciéndolo: un progreso fuera de 0..1, un disparo sin curva o una cuerda que no suelta', () => {
    expect(() => curva.curvaDelDisparo('bow', 1.2)).toThrow(/va de 0 a 1/);
    expect(() => curva.curvaDelDisparo('honda', 0.5)).toThrow(
      /no hay curva de disparo para «honda»/,
    );
    expect(() => curva.cuerdaTensa('honda', 0.5)).toThrow(/no hay curva de disparo/);
    expect(() => columnaDeSuelta('bow', 1, 7)).toThrow(/no tiene columna de suelta/);
  });
});
