/**
 * Lo que el taller exige a una imagen antes de darla por buena (`tools/taller/validar.ts`),
 * con hojas sintéticas: lo visible mínimo de una hoja va con la talla de su figura (H1 del
 * QA del banco de NPC, 22-10-2026: el goblin chatarrero, a 0,7, falló su perfil con un
 * crudo bueno por un 2 % fijo).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { FIGURA } from '../src/shared/arte.js';
import { encargosQueSiguen } from '../tools/taller/npcs.js';
import { validar, validarElEncargo, visibleMinimo } from '../tools/taller/validar.js';
import { FIGURA_DE_PRUEBA, raizDeNpcs } from './helpers.js';

const CELDA = 384;
const FILAS = 3;

/**
 * Una hoja A de figuras opacas de `alto` × `ancho` píxeles, una por celda y en el medio:
 * la silueta de una persona flaca vista de perfil, más estrecha que de frente.
 */
async function hoja(alto: number, ancho: number): Promise<Buffer> {
  const w = CELDA * FIGURA.columnas;
  const h = CELDA * FILAS;
  const data = Buffer.alloc(w * h * 4);
  for (let f = 0; f < FILAS; f++)
    for (let c = 0; c < FIGURA.columnas; c++) {
      const x0 = c * CELDA + Math.floor((CELDA - ancho) / 2);
      const y0 = f * CELDA + Math.floor((CELDA - alto) / 2);
      for (let y = y0; y < y0 + alto; y++)
        for (let x = x0; x < x0 + ancho; x++) data.fill(255, (y * w + x) * 4, (y * w + x) * 4 + 4);
    }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer();
}

/** La figura de talla `t`: su alto, el del adulto por la talla, y su ancho, una proporción de él. */
const deTalla = (t: number, proporcion = 0.22): Promise<Buffer> => {
  const alto = Math.round(FIGURA.alturaAdulto * t);
  return hoja(alto, Math.round(alto * proporcion));
};

const problemas = async (png: Buffer, talla?: number): Promise<readonly string[]> =>
  (await validar(png, 'atlas', false, CELDA, FILAS, talla)).problemas;

describe('lo visible mínimo va con la talla', () => {
  it('crece con el cuadrado de la talla y a talla 1 es el 2 %', () => {
    expect(visibleMinimo()).toBe(0.02);
    expect(visibleMinimo(1)).toBe(0.02);
    expect(visibleMinimo(0.5)).toBeCloseTo(0.005, 10);
    expect(visibleMinimo(0.7)).toBeCloseTo(0.0098, 10);
  });

  it('una figura de talla 1 pasa; la misma silueta a 0,7 y a 0,5 también, con su talla', async () => {
    expect(await problemas(await deTalla(1))).toEqual([]);
    // A 0,7 se ve el 1,90 %: con el 2 % fijo de antes, «casi vacía» (el perfil del goblin).
    const goblin = await deTalla(0.7);
    expect(
      (await validar(goblin, 'atlas', false, CELDA, FILAS, 0.7)).medidas.visibles,
    ).toBeLessThan(0.02);
    expect(await problemas(goblin, 0.7)).toEqual([]);
    // A 0,5, el mínimo del banco, ~1 %: no habría pasado nunca.
    expect(await problemas(await deTalla(0.5), 0.5)).toEqual([]);
  });

  it('sin talla, una figura pequeña sigue siendo «casi vacía»', async () => {
    expect(await problemas(await deTalla(0.7))).toEqual([
      expect.stringMatching(
        /^la imagen está casi vacía tras el recorte: se ve el 1\.90 % y una figura de talla 1 pide 2\.00 %$/,
      ),
    ]);
  });

  it('una hoja casi vacía no pasa por ser de una figura pequeña', async () => {
    // Un recorte que se comió la figura: a 0,7, un tercio de su alto.
    const comida = await hoja(Math.round(FIGURA.alturaAdulto * 0.7 * 0.35), 9);
    expect(await problemas(comida, 0.7)).toEqual([
      expect.stringMatching(
        /casi vacía tras el recorte: se ve el 0\.\d\d % y una figura de talla 0\.7 pide 0\.98 %/,
      ),
    ]);
  });
});

describe('el trabajador juzga cada hoja con la talla de su encargo', () => {
  it('la hoja de una figura del banco de talla 0,7 pasa con la suya, y la casi vacía no', async () => {
    const goblin = { ...FIGURA_DE_PRUEBA, id: 'goblin-de-prueba', talla: 0.7 };
    const r = raizDeNpcs([goblin]);
    // Con la identidad y el giro en disco, lo que sigue son sus hojas.
    mkdirSync(join(r, 'assets/npcs/goblin-de-prueba'), { recursive: true });
    for (const f of ['identidad.webp', 'giro.webp'])
      writeFileSync(join(r, 'assets/npcs/goblin-de-prueba', f), '');
    const hojaA = encargosQueSiguen(goblin, r)[0];
    expect(hojaA).toMatchObject({ tipo: 'atlas', celda: CELDA, talla: 0.7 });
    if (hojaA === undefined) throw new Error('sin hoja');
    expect((await validarElEncargo(await deTalla(0.7), hojaA)).problemas).toEqual([]);
    expect((await validarElEncargo(await hoja(30, 8), hojaA)).problemas).toEqual([
      expect.stringMatching(/casi vacía.*talla 0\.7 pide 0\.98 %/),
    ]);
  });
});
