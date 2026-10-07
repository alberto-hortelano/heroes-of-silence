/**
 * Un acantilado se ve desde los dos lados (auditoría 2 de 07-10, defecto B).
 *
 * El acantilado entre dos regiones a distinta altura tomaba el nivel del lado
 * alto y quedaba a ras con él: sin cara, ni ladera, ni reborde, vestido con la
 * cubierta del llano de al lado, se leía como un llano por el que se pasa. Antes
 * del arreglo, 35 de 66 bordes en s1, 52 de 130 en s24, 102 de 260 en s34 y 72
 * de 319 en s57. Ahora el acantilado va un nivel por encima del lado alto (una
 * cresta), y su espalda —la que mira al norte, que la cámara no ve— lleva una
 * hilera de peñascos.
 */
import { describe, expect, it } from 'vitest';
import { acantiladosARas } from '../src/client/render/escenario/relieve.js';
import type { TerrainKind } from '../src/core/map/terrain.js';
import { partidaDe } from './helpers.js';
import { LENTO, rango } from './lento.js';

/** Una rejilla a mano: cada fila, una cadena de letras (`.` llano, `C` acantilado, `~` agua). */
function rejilla(filas: readonly string[]): { terreno: TerrainKind[]; W: number; H: number } {
  const T: Record<string, TerrainKind> = { '.': 'grass', C: 'cliff', '~': 'water', M: 'mountain' };
  const terreno = filas.flatMap((f) =>
    [...f].map((c) => {
      const t = T[c];
      if (t === undefined) throw new Error(`«${c}» no es una casilla de la rejilla`);
      return t;
    }),
  );
  return { terreno, W: (filas[0] as string).length, H: filas.length };
}

describe('acantiladosARas: la casilla de acantilado sin desnivel con lo que se pisa', () => {
  const { terreno, W, H } = rejilla(['...', '.C.', '~M.']);

  it('cuenta la que queda a ras de una casilla que se pisa (muerde)', () => {
    // El llano del norte al 2, igual que el acantilado: así era el defecto.
    expect(acantiladosARas(terreno, [1, 2, 1, 1, 2, 1, 2, 2, 1], W, H)).toEqual([4]);
  });

  it('no cuenta la que va por encima o por debajo de todo lo que se pisa', () => {
    expect(acantiladosARas(terreno, [1, 1, 1, 1, 2, 1, 0, 0, 1], W, H)).toEqual([]);
    expect(acantiladosARas(terreno, [2, 2, 2, 2, 1, 2, 0, 0, 2], W, H)).toEqual([]);
  });

  it('a ras del agua o de una montaña no cuenta: eso no se pisa', () => {
    expect(acantiladosARas(terreno, [1, 1, 1, 1, 2, 1, 2, 2, 1], W, H)).toEqual([]);
  });
});

/**
 * En la orden lenta, 1-40 y la 57 (s1, s24, s34 y s57 eran las de la
 * auditoría). En `pnpm verify`, las dos primeras con un acantilado sobre
 * hierba, **buscadas**, para que la prueba de que el informe muerde no pase en
 * vacío: eran la 1 y la 57, y con los bordes de #169 la 57 se quedó sin él.
 */
const SEMILLAS = LENTO ? [...rango(1, 40), 57] : dosConAcantiladoSobreHierba();

function dosConAcantiladoSobreHierba(): number[] {
  const halladas: number[] = [];
  for (let s = 1; halladas.length < 2; s++) {
    if (s > 80)
      throw new Error('no hay dos semillas de la 1 a la 80 con un acantilado sobre hierba');
    const { map } = partidaDe(s);
    const W = map.width;
    const hay = map.terrain.some(
      (t, k) => t === 'cliff' && k + W < W * map.height && map.terrain[k + W] === 'grass',
    );
    if (hay) halladas.push(s);
  }
  return halladas;
}

describe('en los mapas reales', () => {
  for (const semilla of SEMILLAS) {
    it(`semilla ${semilla}: ningún acantilado a ras de lo que se pisa, contado por fuera y por el informe`, () => {
      const { map, escena: e } = partidaDe(semilla);
      expect(acantiladosARas(map.terrain, e.nivel, e.W, e.H)).toEqual([]);
      expect(e.informe.acantiladosARas).toBe(0);
      // Y el informe muerde: un acantilado puesto a ras de su vecino se cuenta.
      const i = map.terrain.findIndex(
        (t, k) => t === 'cliff' && k + e.W < e.W * e.H && map.terrain[k + e.W] === 'grass',
      );
      if (i === -1) return;
      const nivel = [...e.nivel];
      nivel[i] = nivel[i + e.W] as number;
      expect(acantiladosARas(map.terrain, nivel, e.W, e.H)).toContain(i);
    });

    it(`semilla ${semilla}: la espalda de cada acantilado lleva peñascos, salvo junto a un objeto`, () => {
      const { map, escena: e } = partidaDe(semilla);
      const peñascos = e.sprites.filter((s) => s.src?.includes('rocas-caidas'));
      const desnudas = e.relieve.rebordes.filter(([x, y]) => {
        if (map.terrain[y * e.W + x] !== 'cliff') return false;
        if (peñascos.some((s) => s.x >= x && s.x < x + 1 && s.y >= y && s.y < y + 0.6))
          return false;
        // La reserva de un objeto aparta las rocas: ahí la espalda queda sin ellas.
        if (map.objects.some((o) => Math.abs(o.at.x - x) <= 1 && Math.abs(o.at.y - y) <= 1))
          return false;
        // Y el pasillo de una senda que pasa al lado (el pedregal no pisa sendas).
        return !e.sendas.some((sd) =>
          sd.some(([px, py]) => px >= x - 0.5 && px <= x + 1.5 && py >= y - 0.5 && py <= y + 1.1),
        );
      });
      expect(desnudas, JSON.stringify(desnudas)).toEqual([]);
    });
  }
});
