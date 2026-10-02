/**
 * Las hojas de 8 direcciones: 6 filas, una sola ancla por dirección (la del
 * reposo) y el último fotograma de la muerte como cadáver.
 */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { indicesDeClip, OCHO_DIRECCIONES } from '../tools/art/poses.js';
import { derivarAtlas } from '../tools/taller/derivar.js';

const C = OCHO_DIRECCIONES.celda;

/** Un «cuerpo»: de pie es un rectángulo alto; tendido, uno ancho y desplazado. */
async function hoja(): Promise<string> {
  const capas = [];
  for (let fila = 0; fila < 6; fila++) {
    for (let col = 0; col < 7; col++) {
      const tendido = fila === 5 && col >= 4;
      const [w, h, dx] = tendido ? [150, 30, -90 + col * 5] : [40, 160, col % 2];
      const x = col * C + 190 + dx - w / 2;
      const y = fila * C + 300 - h;
      capas.push({
        input: { create: { width: w, height: h, channels: 4 as const, background: '#808080' } },
        left: Math.round(x),
        top: y,
      });
    }
  }
  const png = await sharp({
    create: {
      width: 7 * C,
      height: 6 * C,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(capas)
    .png()
    .toBuffer();
  const ruta = join(await mkdtemp(join(tmpdir(), 'taller-8d-')), 'atlas.png');
  await writeFile(ruta, png);
  return ruta;
}

describe('una dirección de 6 filas', () => {
  it('tiene las 6 acciones, la misma ancla en todas y el cadáver al final de la muerte', async () => {
    const a = await derivarAtlas(await hoja());
    expect(a.cell).toBe(C);
    expect(Object.keys(a.clips)).toEqual(['idle', 'walk', 'charge', 'attack', 'hurt', 'death']);
    const ancla = a.clips.idle.anchor;
    for (const k of Object.values(a.clips)) expect(k.anchor).toEqual(ancla);
    expect(a.clips.death?.loop).toBe(false);
    expect(a.cadaver).toEqual({ clip: 'death', frame: (a.clips.death?.frames ?? 0) - 1 });
  });

  it('la muerte y el daño no son bucles: su última columna es su último fotograma', () => {
    expect(indicesDeClip(9, 7, false).at(-1)).toBe(8);
    expect(indicesDeClip(28, 7, false)[0]).toBe(0);
  });
});
