/**
 * Las hojas de 8 direcciones: 6 filas y el último fotograma de la muerte como
 * cadáver.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { indicesDeClip, OCHO_DIRECCIONES } from '../tools/art/poses.js';
import { derivarAtlas } from '../tools/taller/derivar.js';
import { type Encargo, encargoSchema, promptDe } from '../tools/taller/encargo.js';
import { encargoDeGiro, encargosDeOchoDirecciones, unidad } from '../tools/taller/unidades.js';

const RAIZ = join(import.meta.dirname, '..');

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
  it('tiene las 6 acciones y el cadáver al final de la muerte', async () => {
    const a = await derivarAtlas(await hoja());
    expect(a.cell).toBe(C);
    expect(Object.keys(a.clips)).toEqual(['idle', 'walk', 'charge', 'attack', 'hurt', 'death']);
    expect(a.clips.death?.loop).toBe(false);
    expect(a.cadaver).toEqual({ clip: 'death', frame: (a.clips.death?.frames ?? 0) - 1 });
  });

  it('la muerte y el daño no son bucles: su última columna es su último fotograma', () => {
    expect(indicesDeClip(9, 7, false).at(-1)).toBe(8);
    expect(indicesDeClip(28, 7, false)[0]).toBe(0);
  });
});

describe('los encargos de 8 direcciones', () => {
  const u = unidad('templario-escudo');

  it('el giro va con la pose del giro y la identidad aprobada', () => {
    const g = encargoSchema.parse(encargoDeGiro(u));
    expect(g.referencias.map((r) => r.papel)).toEqual(['pose', 'identidad', 'estilo']);
    for (const r of g.referencias) expect(existsSync(join(RAIZ, r.ruta)), r.ruta).toBe(true);
    expect(promptDe(g)).toMatch(/4 columnas por 2 filas/);
  });

  it('son 16 hojas, dos por dirección, con su pose y el giro como identidad', () => {
    const lista = encargosDeOchoDirecciones(u).map((e) => encargoSchema.parse(e));
    expect(lista).toHaveLength(16);
    expect(new Set(lista.map((e) => e.id)).size).toBe(16);
    for (const e of lista) {
      expect(e.referencias[0]?.ruta).toBe(
        `assets/unidades/_poses/espada-escudo-8d/d${e.ocho?.direccion}-${e.ocho?.hoja}.png`,
      );
      expect(existsSync(join(RAIZ, e.referencias[0]?.ruta ?? ''))).toBe(true);
      expect(e.referencias[1]?.ruta).toBe('assets/unidades/templario-escudo/giro.webp');
      expect(e.celda).toBe(OCHO_DIRECCIONES.celda);
    }
    const b = lista.find((e) => e.ocho?.hoja === 'b');
    expect(promptDe(b as Encargo)).toMatch(/la primera es EXACTAMENTE la última de la fila 2/);
    expect(promptDe(b as Encargo)).toMatch(/NUNCA de perfil/);
  });

  it('una unidad que no está en 8 direcciones no tiene giro', () => {
    expect(() => encargoDeGiro(unidad('zombi'))).toThrow(/8 direcciones/);
  });
});

describe('las direcciones del arte', () => {
  const UNIDADES = join(RAIZ, 'assets/unidades');
  const sha = (r: string): string => createHash('sha256').update(readFileSync(r)).digest('hex');
  const leer = (r: string): any => JSON.parse(readFileSync(r, 'utf8'));
  const dirs = readdirSync(UNIDADES)
    .filter((u) => !u.startsWith('_'))
    .flatMap((u) =>
      readdirSync(join(UNIDADES, u))
        .filter((d) => /^d[0-7]$/.test(d))
        .map((d) => join(UNIDADES, u, d)),
    );

  it.each(dirs)('%s: el atlas es lo que mide la imagen y sale de sus dos hojas', async (dir) => {
    const atlas = join(dir, 'atlas.webp');
    expect(leer(join(dir, 'atlas.json'))).toEqual(
      JSON.parse(JSON.stringify(await derivarAtlas(atlas))),
    );
    const c = leer(join(dir, 'atlas.composicion.json'));
    expect(c.sha256, 'el atlas cambió sin volver a juntarlo').toBe(sha(atlas));
    for (const h of c.hojas) {
      const ruta = join(dir, h.imagen);
      expect(sha(ruta), h.imagen).toBe(h.sha256);
      const p = leer(ruta.replace(/\.webp$/, '.procedencia.json'));
      expect(p.salida.sha256, `${h.imagen} cambió sin registrar de dónde sale`).toBe(sha(ruta));
      expect(p.hilo).toMatch(/^[0-9a-f-]{36}$/);
      if (p.reanuda === undefined) {
        expect(p.referencias[0]?.papel).toBe('pose');
        expect(p.referencias[1]?.papel).toBe('identidad');
      }
    }
  });
});
