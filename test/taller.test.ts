/**
 * El taller de imágenes (`tools/taller`), sin Codex: la cola en disco, el
 * prompt que dice el papel de cada referencia, el recorte del halo, el
 * empaquetado en rejilla y la derivación del JSON de una hoja.
 */
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FIGURA } from '../src/shared/arte.js';
import { leerEventos } from '../tools/taller/codex.js';
import { Cola } from '../tools/taller/cola.js';
import { derivarAtlas } from '../tools/taller/derivar.js';
import { empaquetar } from '../tools/taller/empaquetar.js';
import { encargoSchema, promptDe } from '../tools/taller/encargo.js';
import { quitarHalo, type Raster } from '../tools/taller/recorte.js';
import { encargoDeAtlas, encargoDeIdentidad, UNIDADES } from '../tools/taller/unidades.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'taller-test-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const UNO = {
  id: 'prueba-uno',
  tipo: 'imagen',
  descripcion: 'una piedra gris del mapa, vista desde arriba a 25 grados',
  referencias: [],
  salida: 'assets/prueba/uno',
};

describe('la cola en disco', () => {
  it('encola, toma, cierra y devuelve moviendo el fichero de carpeta', async () => {
    const cola = new Cola(dir);
    await cola.encolar(UNO);
    expect((await cola.estado()).pendiente).toEqual(['prueba-uno']);

    const e = await cola.tomar();
    expect(e?.id).toBe('prueba-uno');
    expect(await cola.estado()).toMatchObject({ pendiente: [], 'en-curso': ['prueba-uno'] });

    await cola.cerrar('prueba-uno', 'fallido', { cuando: 'ahora', motivo: 'sin imagen' });
    expect((await cola.leer('fallido', 'prueba-uno')).resultado?.motivo).toBe('sin imagen');

    await cola.devolver('prueba-uno', 'fallido');
    const ficha = await cola.leer('pendiente', 'prueba-uno');
    expect(ficha.resultado).toBeUndefined();
  });

  it('dos trabajadores a la vez no se llevan el mismo encargo', async () => {
    const cola = new Cola(dir);
    await cola.encolar(UNO);
    const [a, b] = await Promise.all([cola.tomar(), new Cola(dir).tomar()]);
    expect([a, b].filter((x) => x !== null)).toHaveLength(1);
  });

  it('un id repetido se rechaza diciendo dónde está', async () => {
    const cola = new Cola(dir);
    await cola.encolar(UNO);
    await expect(cola.encolar(UNO)).rejects.toThrow(/ya está en pendiente/);
    // Y no deja temporales a medio escribir.
    expect((await readdir(dir)).filter((f) => f.startsWith('.'))).toEqual([]);
  });
});

describe('el encargo', () => {
  it('un atlas lleva primero la pose y después la identidad', () => {
    const malo = {
      ...encargoDeAtlas(UNIDADES[0]!),
      referencias: [...encargoDeAtlas(UNIDADES[0]!).referencias].reverse(),
    };
    expect(() => encargoSchema.parse(malo)).toThrow(/primero la referencia de pose/);
  });

  it('una ruta absoluta o con «..» no entra', () => {
    expect(() => encargoSchema.parse({ ...UNO, salida: '/tmp/x' })).toThrow(/relativa/);
    expect(() => encargoSchema.parse({ ...UNO, salida: 'assets/../x' })).toThrow(/relativa/);
  });

  it('el prompt dice el papel de cada imagen con esas palabras, en su orden', () => {
    for (const u of UNIDADES) {
      for (const e of [encargoDeIdentidad(u), encargoDeAtlas(u)]) {
        encargoSchema.parse(e);
        const p = promptDe(e);
        const pose = p.indexOf('La imagen 1 es la REFERENCIA DE POSE');
        expect(pose, e.id).toBeGreaterThanOrEqual(0);
        if (e.referencias.some((r) => r.papel === 'identidad')) {
          expect(p.indexOf('La imagen 2 es la IDENTIDAD DEL PERSONAJE'), e.id).toBeGreaterThan(
            pose,
          );
        }
        expect(p, e.id).toMatch(/NUNCA de perfil/);
      }
    }
  });
});

/** Un raster RGBA vacío de `w`×`h`. */
function lienzo(w: number, h: number): Raster {
  return { data: Buffer.alloc(w * h * 4), width: w, height: h };
}
function rect(r: Raster, x0: number, y0: number, w: number, h: number, alfa: number): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * r.width + x) * 4;
      r.data[i] = 200;
      r.data[i + 1] = 60;
      r.data[i + 2] = 60;
      r.data[i + 3] = alfa;
    }
  }
}
const alfaEn = (r: Raster, x: number, y: number): number => r.data[(y * r.width + x) * 4 + 3]!;

describe('el recorte del halo', () => {
  it('borra el halo pegado al borde, las bolsas encerradas, y vuelve opaco el cuerpo', () => {
    const r = lienzo(40, 40);
    rect(r, 5, 5, 30, 30, 50); // halo
    rect(r, 10, 10, 20, 20, 245); // cuerpo casi opaco, como lo devuelve ChatGPT
    rect(r, 18, 18, 4, 4, 50); // una bolsa tenue encerrada: el hueco entre brazo y costado
    rect(r, 25, 25, 1, 2, 60); // un canto antialiasado suelto dentro: se queda
    quitarHalo(r);
    expect(alfaEn(r, 6, 6)).toBe(0);
    expect(alfaEn(r, 12, 12)).toBe(255);
    expect(alfaEn(r, 19, 19)).toBe(0);
    expect(alfaEn(r, 25, 25)).toBe(60);
  });
});

/**
 * Una «hoja de Codex» de mentira: 3 filas de 7 figuras con tamaños y huecos
 * irregulares, pies (un pie más ancho abajo) y un arma suelta en una de ellas.
 */
function hojaIrregular(columnas = 7): Raster {
  const r = lienzo(900, 420);
  for (let f = 0; f < 3; f++) {
    for (let c = 0; c < columnas; c++) {
      const x = 20 + c * 122 + ((c * 7) % 11);
      const alto = 90 + ((c + f) % 3) * 4;
      const y = 20 + f * 135 + (c % 2) * 3;
      rect(r, x, y, 30, alto, 255);
      rect(r, x - 4, y + alto - 8, 38, 8, 255); // los pies
    }
  }
  rect(r, 20 + 4 * 122 + 50, 300, 10, 4, 255); // un arma suelta junto a la quinta del ataque
  return r;
}

describe('el empaquetado y la derivación', () => {
  it('empaqueta figuras irregulares en la rejilla con los pies en la base', async () => {
    const p = await empaquetar(hojaIrregular(), 3, 160);
    const meta = await sharp(p.png).metadata();
    expect([meta.width, meta.height]).toEqual([FIGURA.celda * FIGURA.columnas, FIGURA.celda * 3]);
    for (const [, y] of p.apoyoPorFila) expect(y).toBe(FIGURA.base);

    const ruta = join(dir, 'atlas.png');
    await writeFile(ruta, p.png);
    const d = await derivarAtlas(ruta);
    for (const [i, c] of Object.values(d.clips).entries()) {
      expect(c.frames).toBe(7);
      expect(Math.abs(c.anchor[1] - p.apoyoPorFila[i]![1])).toBeLessThanOrEqual(1);
      expect(Math.abs(c.anchor[0] - p.apoyoPorFila[i]![0])).toBeLessThanOrEqual(3);
    }
    expect(d.altura).toBeGreaterThan(150);
    expect(d.cajaDeClic[1]).toBeLessThan(-150); // la caja sube desde los pies
  });

  it('una fila con una figura de menos se dice, no se reparte a ojo', async () => {
    const r = hojaIrregular();
    rect(r, 20 + 6 * 122 - 10, 20, 60, 110, 0); // borra la séptima del reposo
    await expect(empaquetar(r, 3, 160)).rejects.toThrow(/la fila 1 tiene 6 figuras/);
  });

  it('el último fotograma que repite al anterior no cuenta, y el JSON lleva el sha256', async () => {
    const p = await empaquetar(hojaIrregular(), 3, 160);
    const { celda } = FIGURA;
    // Copia la sexta celda del ataque sobre la séptima.
    const { data, info } = await sharp(p.png).raw().toBuffer({ resolveWithObject: true });
    for (let y = 2 * celda; y < 3 * celda; y++) {
      const fila = y * info.width * 4;
      data.copy(data, fila + 6 * celda * 4, fila + 5 * celda * 4, fila + 6 * celda * 4);
    }
    const hoja = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toBuffer();
    const ruta = join(dir, 'repetida.png');
    await writeFile(ruta, hoja);
    const d = await derivarAtlas(ruta);
    expect(d.clips.attack.frames).toBe(6);
    expect(d.clips.idle.frames).toBe(7);
    expect(d.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('los eventos de Codex', () => {
  it('saca el hilo y el último mensaje, e ignora lo que no es JSON', () => {
    const salida = [
      'Reading prompt from stdin...',
      '{"type":"thread.started","thread_id":"01a0f7f9-b45e-7660-8b5d-2191831b2ac3"}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"Uso imagegen."}}',
      '{"type":"item.completed","item":{"type":"agent_message","text":" Listo. "}}',
    ].join('\n');
    expect(leerEventos(salida)).toEqual({
      hilo: '01a0f7f9-b45e-7660-8b5d-2191831b2ac3',
      mensaje: 'Listo.',
    });
  });
});
