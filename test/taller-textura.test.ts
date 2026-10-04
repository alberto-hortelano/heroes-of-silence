/**
 * Las texturas del suelo se repiten sin costura: la fabrica el taller
 * (`hacerTeselable`), no se le pide a ChatGPT. Con imágenes sintéticas.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { SUELOS_PISABLES } from '../src/core/map/terrain.js';
import { aRaster } from '../tools/taller/recorte.js';
import {
  costura,
  hacerTeselable,
  LADO_DE_TEXTURA,
  UMBRAL_DE_COSTURA,
} from '../tools/taller/textura.js';

/** Un degradado en diagonal con ruido: no se repite, la costura salta a la vista. */
async function sinRepetir(lado = 300): Promise<Buffer> {
  const data = Buffer.alloc(lado * lado * 3);
  let semilla = 7;
  for (let y = 0; y < lado; y++)
    for (let x = 0; x < lado; x++) {
      semilla = (semilla * 1103515245 + 12345) >>> 0;
      const ruido = (semilla >>> 24) % 16;
      const i = (y * lado + x) * 3;
      data[i] = Math.round((x / lado) * 200) + ruido;
      data[i + 1] = Math.round((y / lado) * 200) + ruido;
      data[i + 2] = 60 + ruido;
    }
  return sharp(data, { raw: { width: lado, height: lado, channels: 3 } })
    .png()
    .toBuffer();
}

describe('la textura repetible', () => {
  it('una imagen que no se repite tiene costura', async () => {
    const r = await aRaster(await sinRepetir());
    expect(costura(r)).toBeGreaterThan(UMBRAL_DE_COSTURA * 4);
  });

  it('hacerTeselable la deja sin costura, cuadrada y opaca', async () => {
    const t = await hacerTeselable(await sinRepetir());
    expect(t.width).toBe(LADO_DE_TEXTURA);
    expect(t.height).toBe(LADO_DE_TEXTURA);
    expect(costura(t)).toBeLessThan(UMBRAL_DE_COSTURA);
    for (let i = 3; i < t.data.length; i += 4) {
      if (t.data[i] !== 255) throw new Error(`píxel ${(i - 3) / 4} no opaco`);
    }
  });

  it('no toca el centro: la imagen original manda donde no hace falta mezclar', async () => {
    const entrada = await sinRepetir(LADO_DE_TEXTURA);
    const original = await aRaster(entrada);
    const t = await hacerTeselable(entrada);
    const c = (LADO_DE_TEXTURA / 2) * LADO_DE_TEXTURA * 4 + (LADO_DE_TEXTURA / 2) * 4;
    for (let k = 0; k < 3; k++) {
      expect(Math.abs((t.data[c + k] as number) - (original.data[c + k] as number))).toBeLessThan(
        2,
      );
    }
  });
});

describe('las texturas del taller', () => {
  const dir = join(import.meta.dirname, '../assets/mapa/suelos');
  let hay: string[] = [];
  try {
    hay = readdirSync(dir).filter((f) => f.endsWith('.webp'));
  } catch {
    // Sin texturas todavía: no hay nada que comprobar.
  }

  it('son de los suelos que se pisan', () => {
    for (const f of hay) expect(SUELOS_PISABLES).toContain(f.replace(/\.webp$/, ''));
  });

  for (const f of hay) {
    it(`${f}: se repite sin costura y su procedencia la describe`, async () => {
      const bytes = readFileSync(join(dir, f));
      const r = await aRaster(bytes);
      expect(r.width).toBe(LADO_DE_TEXTURA);
      expect(costura(r)).toBeLessThan(UMBRAL_DE_COSTURA);
      const proc = JSON.parse(
        readFileSync(join(dir, f.replace(/\.webp$/, '.procedencia.json')), 'utf8'),
      );
      expect(proc.tipo).toBe('textura');
      expect(proc.salida.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
      expect(proc.herramienta.nombre).toMatch(/^codex exec/);
    });
  }
});
