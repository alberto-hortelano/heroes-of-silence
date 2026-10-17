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
import { empaquetar, enFilas, fundirSobrantes } from '../tools/taller/empaquetar.js';
import { encargoSchema, promptDe } from '../tools/taller/encargo.js';
import { quitarHalo, type Raster } from '../tools/taller/recorte.js';
import {
  EN_OCHO_DIRECCIONES,
  encargoDeIdentidad,
  encargosDeOchoDirecciones,
  HEROES,
  UNIDADES,
  unidad,
} from '../tools/taller/unidades.js';

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
    const bueno = encargosDeOchoDirecciones(unidad('templario-escudo'))[0]!;
    const malo = { ...bueno, referencias: [...bueno.referencias].reverse() };
    expect(() => encargoSchema.parse(malo)).toThrow(/primero la referencia de pose/);
  });

  it('un atlas sin su dirección de 8 no entra: el de una sola dirección se retiró', () => {
    const { ocho: _, ...sinDireccion } = encargosDeOchoDirecciones(unidad('templario-escudo'))[0]!;
    expect(() => encargoSchema.parse(sinDireccion)).toThrow(/lleva `ocho`/);
  });

  it('una ruta absoluta o con «..» no entra', () => {
    expect(() => encargoSchema.parse({ ...UNO, salida: '/tmp/x' })).toThrow(/relativa/);
    expect(() => encargoSchema.parse({ ...UNO, salida: 'assets/../x' })).toThrow(/relativa/);
  });

  it('el prompt dice el papel de cada imagen con esas palabras, en su orden', () => {
    for (const u of [...UNIDADES, ...HEROES]) {
      const atlas =
        EN_OCHO_DIRECCIONES[u.id] === undefined ? [] : encargosDeOchoDirecciones(u).slice(0, 2);
      for (const e of [encargoDeIdentidad(u), ...atlas]) {
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
function hojaIrregular(columnas = 7, filas = 3): Raster {
  const r = lienzo(900, 140 * filas);
  for (let f = 0; f < filas; f++) {
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

/**
 * Una hoja de 6 filas —la única que se deriva desde que se retiró la de una
 * dirección— hecha de dos de 3 empaquetadas una encima de otra, como junta el
 * taller las dos hojas de cada dirección.
 */
async function seisFilas(png: Buffer): Promise<Buffer> {
  const { width, height } = await sharp(png).metadata();
  return sharp({ create: { width, height: 2 * height, channels: 4, background: '#0000' } })
    .composite([
      { input: png, left: 0, top: 0 },
      { input: png, left: 0, top: height },
    ])
    .png()
    .toBuffer();
}

describe('el empaquetado y la derivación', () => {
  it('empaqueta figuras irregulares en la rejilla con los pies en la base', async () => {
    const p = await empaquetar(hojaIrregular(), 3, 160);
    const meta = await sharp(p.png).metadata();
    expect([meta.width, meta.height]).toEqual([FIGURA.celda * FIGURA.columnas, FIGURA.celda * 3]);
    for (const [, y] of p.apoyoPorFila) expect(y).toBe(FIGURA.base);

    const ruta = join(dir, 'atlas.png');
    await writeFile(ruta, await seisFilas(p.png));
    const d = await derivarAtlas(ruta);
    for (const c of Object.values(d.clips)) expect(c.frames).toBe(7);
    // Un ancla por dirección, la del reposo: donde el empaquetado puso los pies.
    expect(Math.abs(d.clips.idle.anchor[1] - p.apoyoPorFila[0]![1])).toBeLessThanOrEqual(1);
    expect(Math.abs(d.clips.idle.anchor[0] - p.apoyoPorFila[0]![0])).toBeLessThanOrEqual(3);
    expect(d.altura).toBeGreaterThan(150);
    expect(d.cajaDeClic[1]).toBeLessThan(-150); // la caja sube desde los pies
  });

  it('un trozo suelto de más se funde con su figura; una figura entera de más, no', () => {
    const caja = (x0: number, w: number, area: number) => ({
      x0,
      y0: 0,
      x1: x0 + w,
      y1: 100,
      area,
    });
    // Siete figuras y la punta de una espada suelta: se funde.
    const conPunta = [
      ...Array.from({ length: 7 }, (_, i) => caja(i * 100, 60, 5000)),
      caja(65, 10, 200),
    ];
    expect(fundirSobrantes(conPunta, 7)).toHaveLength(7);
    // Nueve figuras: no se funde ninguna, y la fila falla por figuras de más.
    const nueve = Array.from({ length: 9 }, (_, i) => caja(i * 100, 60, 4000 + i * 100));
    expect(fundirSobrantes(nueve, 7)).toHaveLength(9);
    expect(() => enFilas(nueve, 1, 7)).toThrow(/la fila 1 tiene 9 figuras y la hoja pide 7/);
  });

  it('una fila con una figura de menos se dice, no se reparte a ojo', async () => {
    const r = hojaIrregular();
    rect(r, 20 + 6 * 122 - 10, 20, 60, 110, 0); // borra la séptima del reposo
    await expect(empaquetar(r, 3, 160)).rejects.toThrow(/la fila 1 tiene 6 figuras/);
  });

  it('el último fotograma que repite al anterior no cuenta, y el JSON lleva el sha256', async () => {
    const p = { png: await seisFilas((await empaquetar(hojaIrregular(), 3, 160)).png) };
    const { celda } = FIGURA;
    // Copia la sexta celda de la tercera fila (la carga) sobre la séptima.
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
    expect(d.clips.charge?.frames).toBe(6);
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
      error: null,
    });
  });

  it('saca el motivo de un fallo del JSON, y reconoce el límite de uso', async () => {
    const { FalloDeCodex } = await import('../tools/taller/codex.js');
    const salida =
      '{"type":"error","message":"You’ve hit your usage limit. Visit https://chatgpt.com/codex/settings/usage"}';
    const { error } = leerEventos(salida);
    expect(error).toMatch(/usage limit/);
    expect(new FalloDeCodex(error!).sinCuota).toBe(true);
    expect(new FalloDeCodex('content policy').sinCuota).toBe(false);
  });
});

describe('los efectos', () => {
  it('parte una lámina de 4×4 en dieciséis iconos cuadrados, en orden de lectura', async () => {
    const { partirIconos, LADO_ICONO } = await import('../tools/taller/efectos-proceso.js');
    const r = lienzo(800, 800);
    for (let f = 0; f < 4; f++)
      for (let c = 0; c < 4; c++) rect(r, 40 + c * 200, 40 + f * 200, 60 + c * 10, 50, 255);
    const nombres = Array.from({ length: 16 }, (_, i) => `i${i}`);
    const iconos = await partirIconos(r, nombres);
    expect(iconos.map((i) => i.nombre)).toEqual(nombres);
    const m = await sharp(iconos[3]!.png).metadata();
    expect([m.width, m.height]).toEqual([LADO_ICONO, LADO_ICONO]);
  });

  it('empaqueta seis fotogramas en una tira y rechaza lo que cruza una línea de corte', async () => {
    const { empaquetarEfecto, LADO_EFECTO } = await import('../tools/taller/efectos-proceso.js');
    const r = lienzo(600, 400);
    for (let i = 0; i < 6; i++)
      rect(r, (i % 3) * 200 + 70, Math.floor(i / 3) * 200 + 60, 40 + i * 5, 60, 180);
    const { png: tira, rozaduras } = await empaquetarEfecto(r);
    expect(rozaduras).toBe(0);
    const m = await sharp(tira).metadata();
    expect([m.width, m.height]).toEqual([LADO_EFECTO * 6, LADO_EFECTO]);
    rect(r, 195, 300, 10, 4, 200); // una astilla que roza la línea: se recorta y se cuenta
    expect((await empaquetarEfecto(r)).rozaduras).toBeGreaterThan(0);
    rect(r, 180, 220, 40, 160, 200); // un fotograma que cruza de verdad
    await expect(empaquetarEfecto(r)).rejects.toThrow(/cruzando la línea entre las columnas 1 y 2/);
  });

  it('el recorte suave respeta el humo semitransparente', async () => {
    const { recorteSuave } = await import('../tools/taller/efectos-proceso.js');
    const r = lienzo(10, 10);
    rect(r, 0, 0, 5, 10, 10);
    rect(r, 5, 0, 5, 10, 90);
    recorteSuave(r);
    expect(alfaEn(r, 1, 1)).toBe(0);
    expect(alfaEn(r, 7, 1)).toBe(90);
  });
});

describe('la rejilla de una lámina de iconos', () => {
  it('hasta cuatro van en una fila; más, en filas de cuatro; lo demás se rechaza diciéndolo', async () => {
    const { rejillaDeIconos } = await import('../tools/taller/encargo.js');
    expect(rejillaDeIconos(3)).toEqual({ filas: 1, columnas: 3 });
    expect(rejillaDeIconos(16)).toEqual({ filas: 4, columnas: 4 });
    expect(() => rejillaDeIconos(6)).toThrow(/hasta 4, o múltiplos de 4/);
  });
});

describe('la celda de las monturas', () => {
  it('empaqueta y deriva una hoja de 384 con los pies en su base proporcional', async () => {
    const { baseEnCelda } = await import('../tools/taller/empaquetar.js');
    const p = await empaquetar(hojaIrregular(), 3, 240, 384);
    const meta = await sharp(p.png).metadata();
    expect([meta.width, meta.height]).toEqual([384 * FIGURA.columnas, 384 * 3]);
    expect(baseEnCelda(384)).toBe(342);
    for (const [, y] of p.apoyoPorFila) expect(y).toBe(342);
  });
});

describe('las filas de una hoja', () => {
  it('una hoja de cinco filas no es del taller, y se dice', async () => {
    const lado = 64;
    const ruta = join(await mkdtemp(join(tmpdir(), 'taller-filas-')), 'cinco.png');
    await sharp({
      create: {
        width: lado * FIGURA.columnas,
        height: lado * 5,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toFile(ruta);
    await expect(derivarAtlas(ruta)).rejects.toThrow(/por 6 filas/);
    await rm(join(ruta, '..'), { recursive: true, force: true });
  });
});
