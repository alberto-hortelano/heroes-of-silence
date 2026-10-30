import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ajustesDe, aplicarAjustes } from '../tools/taller/ajustes.js';
import { sha256 } from '../tools/taller/poses-8d.js';

// El encuadre a mano (`ajustes.ts`): mueve el fotograma que dice y nada más, y no se
// aplica a una hoja distinta de la que se miró.
const CELDA = 8;
async function hojaB(): Promise<Buffer> {
  // 7 × 3 celdas de 8 px, con un píxel opaco en (2, 2) de cada celda.
  const data = Buffer.alloc(7 * CELDA * 3 * CELDA * 4);
  for (let f = 0; f < 3; f++)
    for (let c = 0; c < 7; c++)
      data.fill(
        255,
        ((f * CELDA + 2) * 7 * CELDA + c * CELDA + 2) * 4,
        ((f * CELDA + 2) * 7 * CELDA + c * CELDA + 3) * 4,
      );
  return sharp(data, {
    raw: { width: 7 * CELDA, height: 3 * CELDA, channels: 4 },
  })
    .png()
    .toBuffer();
}
const alfa = async (png: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * 4 + 3];
};

describe('el encuadre a mano', () => {
  it('mueve solo el fotograma que dice, dentro de su celda', async () => {
    const png = await hojaB();
    const movida = await aplicarAjustes(png, 'b', {
      hoja: sha256(png),
      fotogramas: {
        hurt: [
          [0, 0],
          [3, -1],
        ],
      },
    });
    // hurt es la fila 1: el fotograma 1 pasa de (2, 2) a (5, 1) en su celda.
    expect(await alfa(movida, CELDA + 2, CELDA + 2)).toBe(0);
    expect(await alfa(movida, CELDA + 5, CELDA + 1)).toBe(255);
    // Lo demás, quieto: el ataque y el fotograma 0 del daño.
    expect(await alfa(movida, CELDA + 2, 2)).toBe(255);
    expect(await alfa(movida, 2, CELDA + 2)).toBe(255);
  });

  it('no vale para otra hoja ni para un clip que la hoja no lleva', async () => {
    const png = await hojaB();
    const dir = mkdtempSync(join(tmpdir(), 'ajustes-'));
    const ruta = join(dir, 'hoja-b.webp');
    const escribir = (a: unknown) =>
      writeFileSync(join(dir, 'hoja-b.ajustes.json'), JSON.stringify(a));
    expect(ajustesDe(ruta, 'b', sha256(png))).toBeNull();
    escribir({ hoja: 'a'.repeat(64), fotogramas: {} });
    expect(() => ajustesDe(ruta, 'b', sha256(png))).toThrow(/es de otra hoja/);
    escribir({ hoja: sha256(png), fotogramas: { walk: [[1, 0]] } });
    expect(() => ajustesDe(ruta, 'b', sha256(png))).toThrow(/no lleva walk/);
    escribir({ hoja: sha256(png), fotogramas: { death: [[1, 0]] } });
    expect(ajustesDe(ruta, 'b', sha256(png))?.fotogramas.death).toEqual([[1, 0]]);
  });
});
