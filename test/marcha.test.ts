/**
 * La zancada del Y Bot, medida otra vez en sus PNG: `ZANCADA` (en `marcha.ts`)
 * es una cifra escrita a mano a partir de una medida, y si las poses se vuelven
 * a renderizar con otro paso, la figura patinaría sin que nada se pusiera rojo.
 *
 * Se mide como se midió: en las dos hojas de perfil (`d2` y `d6`), el pie que
 * está en el suelo retrocede lo que el cuerpo avanzaría. Las piernas del maniquí
 * son de color —la derecha roja, la izquierda azul—, así que cada pie se sigue
 * por su color, y entre dos fotogramas en los que los dos pisan el suelo su
 * desplazamiento, dividido por los fotogramas del render que separan las dos
 * columnas, es la velocidad. La mediana de todos esos pares, por los fotogramas
 * del ciclo, es lo que se avanza en un ciclo.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ZANCADA } from '../src/client/marcha.js';
import { FIGURA } from '../src/shared/arte.js';
import { indicesDeClip } from '../tools/art/poses.js';

const CARPETA = join(import.meta.dirname, '../assets/unidades/_poses/espada-escudo-8d');
const CELDA = 384;

async function avancePorCiclo(clip: 'walk' | 'charge'): Promise<number> {
  const fila = clip === 'walk' ? 1 : 2;
  const meta = JSON.parse(readFileSync(join(CARPETA, 'poses.json'), 'utf8')) as {
    sourceMetadata: Record<string, { frame_count: number }>;
  };
  const total = meta.sourceMetadata[clip]?.frame_count;
  if (total === undefined) throw new Error(`poses.json no dice cuántos fotogramas tiene ${clip}`);
  const indices = indicesDeClip(total, FIGURA.columnas, true);
  const velocidades: number[] = [];
  for (const d of [2, 6]) {
    const { data, info } = await sharp(join(CARPETA, `d${d}-a.png`))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (const color of ['roja', 'azul'] as const) {
      const pies = indices.map((_, col) => {
        let yMax = -1;
        const puntos: [number, number][] = [];
        for (let y = fila * CELDA; y < (fila + 1) * CELDA; y++) {
          for (let x = col * CELDA; x < (col + 1) * CELDA; x++) {
            const i = (y * info.width + x) * 4;
            const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]] as number[];
            const es =
              (a as number) > 200 &&
              (color === 'roja'
                ? (r as number) > 150 && (g as number) < 90 && (b as number) < 90
                : (b as number) > 150 && (r as number) < 90 && (g as number) < 120);
            if (!es) continue;
            puntos.push([x, y]);
            yMax = Math.max(yMax, y);
          }
        }
        const pie = puntos.filter(([, y]) => y >= yMax - 6);
        return pie.length === 0
          ? null
          : { x: pie.reduce((t, [x]) => t + x, 0) / pie.length - col * CELDA, y: yMax };
      });
      const suelo = Math.max(...pies.map((p) => p?.y ?? -1));
      for (let k = 0; k + 1 < pies.length; k++) {
        const p = pies[k];
        const q = pies[k + 1];
        if (p === null || q === null || p === undefined || q === undefined) continue;
        if (p.y < suelo - 4 || q.y < suelo - 4) continue;
        velocidades.push(
          Math.abs(q.x - p.x) / ((indices[k + 1] as number) - (indices[k] as number)),
        );
      }
    }
  }
  expect(velocidades.length).toBeGreaterThan(4);
  velocidades.sort((a, b) => a - b);
  const mediana = velocidades[Math.floor(velocidades.length / 2)] as number;
  return mediana * total;
}

describe('la zancada del Y Bot', () => {
  for (const clip of ['walk', 'charge'] as const) {
    it(`${clip}: lo que avanza un ciclo en los PNG es lo que dice ZANCADA, ±10 %`, async () => {
      const medido = (await avancePorCiclo(clip)) / FIGURA.alturaAdulto;
      expect(medido / ZANCADA[clip]).toBeGreaterThan(0.9);
      expect(medido / ZANCADA[clip]).toBeLessThan(1.1);
    });
  }
});
