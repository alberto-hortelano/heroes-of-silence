/**
 * El taller de imágenes (`tools/taller`), sin Codex: la cola en disco, el
 * prompt que dice el papel de cada referencia, el recorte del halo, el
 * empaquetado en rejilla y la derivación del JSON de una hoja.
 */
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FIGURA } from '../src/shared/arte.js';
import { leerEventos } from '../tools/taller/codex.js';
import { Cola, NoEstaEn, trabajadorDe, YaEnLaCola } from '../tools/taller/cola.js';
import { derivarAtlas } from '../tools/taller/derivar.js';
import {
  componentes,
  empaquetar,
  enFilas,
  figuras,
  fundirSobrantes,
  porRejilla,
} from '../tools/taller/empaquetar.js';
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

  // QA del banco de NPC, H7: dos procesos que miran la cola y encolan lo mismo a la vez.
  it('dos que encolan lo mismo a la vez: uno entra y al otro le llega `YaEnLaCola`, sin temporales', async () => {
    const res = await Promise.allSettled([new Cola(dir).encolar(UNO), new Cola(dir).encolar(UNO)]);
    expect(res.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const [rechazo] = res.filter((x) => x.status === 'rejected');
    expect((rechazo as PromiseRejectedResult).reason).toBeInstanceOf(YaEnLaCola);
    expect((await new Cola(dir).estado()).pendiente).toEqual(['prueba-uno']);
    expect((await readdir(dir)).filter((f) => f.startsWith('.'))).toEqual([]);
  });

  it('dos que mueven el mismo encargo a la vez: uno gana y al otro le llega `NoEstaEn`', async () => {
    const cola = new Cola(dir);
    await cola.encolar(UNO);
    await cola.tomar();
    await cola.cerrar('prueba-uno', 'fallido', { cuando: 'ahora', motivo: 'sin imagen' });
    const res = await Promise.allSettled([
      cola.reintentar('prueba-uno'),
      new Cola(dir).reintentar('prueba-uno'),
    ]);
    expect(res.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const [rechazo] = res.filter((x) => x.status === 'rejected');
    expect((rechazo as PromiseRejectedResult).reason).toBeInstanceOf(NoEstaEn);
    expect((await cola.leer('pendiente', 'prueba-uno')).fallos).toHaveLength(1);
    expect((await readdir(dir)).filter((f) => f.startsWith('.'))).toEqual([]);
  });
});

/** Un pid que no vive: el de un hijo que ya acabó (y que `spawnSync` ya recogió). */
const pidMuerto = (): number => {
  const { pid } = spawnSync(process.execPath, ['-e', '']);
  if (pid === undefined) throw new Error('el hijo no arrancó');
  return pid;
};

/** Le pone a la ficha en curso de `id` el pid `pid` (o se lo quita): quien la tomó. */
async function conPid(id: string, pid: number | undefined): Promise<void> {
  const ruta = join(dir, 'en-curso', `${id}.json`);
  const { pid: _, ...ficha } = JSON.parse(await readFile(ruta, 'utf8'));
  await writeFile(ruta, JSON.stringify(pid === undefined ? ficha : { ...ficha, pid }));
}

// QA del banco de NPC, H6: un encargo en curso cuyo trabajador murió se quedaba ahí para siempre.
describe('un encargo en curso sabe quién lo lleva', () => {
  it('al tomarlo apunta el pid de quien lo toma, y al cerrarlo se va', async () => {
    const cola = new Cola(dir);
    await cola.encolar(UNO);
    await cola.tomar();
    const ficha = await cola.leer('en-curso', 'prueba-uno');
    expect(ficha.pid).toBe(process.pid);
    expect(trabajadorDe(ficha)).toEqual({ vivo: true, pid: process.pid });
    await cola.cerrar('prueba-uno', 'hecho', { cuando: 'ahora' });
    expect((await cola.leer('hecho', 'prueba-uno')).pid).toBeUndefined();
  });

  it('un pid que ya no vive es un huérfano: vuelve a la cola con sus fallos; vivo o sin pid, no se toca', async () => {
    const cola = new Cola(dir);
    for (const id of ['a-huerfano', 'b-vivo', 'c-sin-pid'])
      await cola.encolar({ ...UNO, id, salida: `assets/prueba/${id}` });
    for (const id of ['a-huerfano', 'b-vivo', 'c-sin-pid']) {
      await cola.tomar(id);
      await cola.cerrar(id, 'fallido', { cuando: 'ahora', motivo: 'tirada mala' });
      await cola.reintentar(id);
      await cola.tomar(id);
    }
    const muerto = pidMuerto();
    await conPid('a-huerfano', muerto);
    await conPid('c-sin-pid', undefined);
    expect(cola.trabajadorAhora('a-huerfano')).toEqual({ vivo: false, pid: muerto });
    expect(cola.trabajadorAhora('b-vivo')).toEqual({ vivo: true, pid: process.pid });
    // Sin pid lo tomó un trabajador de antes, que quizá lo está pintando: no se le roba.
    expect(cola.trabajadorAhora('c-sin-pid')).toEqual({ vivo: true, pid: undefined });

    expect(await cola.devolverHuerfanos()).toEqual(['a-huerfano']);
    expect(await cola.estado()).toMatchObject({
      pendiente: ['a-huerfano'],
      'en-curso': ['b-vivo', 'c-sin-pid'],
    });
    // No falló otra vez: conserva la cuenta, y en pendiente/ no lleva pid.
    const devuelta = await cola.leer('pendiente', 'a-huerfano');
    expect(devuelta.fallos?.map((f) => f.motivo)).toEqual(['tirada mala']);
    expect(devuelta.pid).toBeUndefined();
    // Dos rescates a la vez no lo devuelven dos veces.
    await cola.tomar('a-huerfano');
    await conPid('a-huerfano', muerto);
    const [uno, otro] = await Promise.all([
      cola.devolverHuerfanos(),
      new Cola(dir).devolverHuerfanos(),
    ]);
    expect([...uno, ...otro]).toEqual(['a-huerfano']);
  });

  it('un pid que no es un proceso (0, negativo, decimal) lanza: no se pregunta a un grupo entero', () => {
    for (const pid of [0, -5, 1.5])
      expect(() => trabajadorDe({ encargo: { ...UNO, id: 'x' } as never, pid })).toThrow(
        /lleva un pid que no vale/,
      );
  });

  // QA del banco de NPC, H8: reprocesar dejaba la cuenta a cero y el agotado se volvía a pedir a Codex.
  it('retomar (reprocesar) conserva los fallos y apunta su pid', async () => {
    const cola = new Cola(dir);
    await cola.encolar(UNO);
    for (const vez of [1, 2]) {
      await cola.tomar();
      await cola.cerrar('prueba-uno', 'fallido', { cuando: 'ahora', motivo: `fallo ${vez}` });
      if (vez === 1) await cola.reintentar('prueba-uno');
    }
    await cola.retomar('prueba-uno', 'fallido');
    const enCurso = await cola.leer('en-curso', 'prueba-uno');
    expect(enCurso.fallos?.map((f) => f.motivo)).toEqual(['fallo 1']);
    expect(enCurso.resultado).toBeUndefined();
    expect(enCurso.pid).toBe(process.pid);
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

  it('`ocho.pose` va si y solo si la primera referencia es la pose con el esqueleto', () => {
    const bueno = encargosDeOchoDirecciones(unidad('templario-escudo'))[0]!;
    const pose = bueno.referencias[0]!.ruta;
    const conPoseDeMas = { ...bueno, ocho: { ...bueno.ocho!, pose } };
    expect(() => encargoSchema.parse(conPoseDeMas)).toThrow(/`ocho.pose`/);
    const esqueleto = {
      ...bueno,
      referencias: [
        { ruta: 'x/pose-esqueleto-a.png', papel: 'pose-esqueleto' },
        ...bueno.referencias.slice(1),
      ],
    };
    expect(() => encargoSchema.parse(esqueleto)).toThrow(/`ocho.pose`/);
    expect(() =>
      encargoSchema.parse({ ...esqueleto, ocho: { ...bueno.ocho!, pose } }),
    ).not.toThrow();
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
/** Las figuras de un raster como las cuenta el empaquetado. */
function figurasDe(r: Raster) {
  return figuras(componentes(r), 2);
}

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

  // C7 de la revisión de animaciones (30-10-2026): con la espada vertical que pedían
  // unas instrucciones las filas se tocaban, el detector fundía dos figuras y la hoja,
  // con sus 21 figuras en el crudo, se tiraba.
  it('si un arma alta junta dos filas, se cortan por su rejilla y salen las 21', async () => {
    const r = hojaIrregular();
    // La espada de la cuarta figura de la fila 2, alzada hasta tocar la de la fila 1.
    rect(r, 20 + 3 * 122 + 12, 100, 4, 60, 255);
    expect(() => enFilas(figurasDe(r), 3, 7)).toThrow(/figuras/);
    const rejilla = porRejilla(r, 3, 7);
    expect(rejilla.map((f) => f.length)).toEqual([7, 7, 7]);
    const p = await empaquetar(r, 3, 160);
    expect(p.porRejilla).toMatch(/cortando el crudo por su rejilla/);
  });

  // QA del 30-10-2026, H8: lo que el corte deja suelto (la punta de un arma de la fila
  // de al lado) viajaba a la celda de la figura más cercana como una mota.
  it('cortada por su rejilla, ninguna celda lleva motas sueltas del corte', async () => {
    const r = hojaIrregular();
    rect(r, 20 + 3 * 122 + 12, 100, 4, 60, 255); // la espada que junta las filas 1 y 2
    rect(r, 20 + 3 * 122 + 60, 105, 4, 40, 255); // un trozo suelto que cruza el corte
    const p = await empaquetar(r, 3, 160);
    expect(p.porRejilla).toBeDefined();
    const { data, info } = await sharp(p.png).raw().toBuffer({ resolveWithObject: true });
    const { celda, columnas } = FIGURA;
    for (let col = 0; col < columnas; col++) {
      const c = lienzo(celda, celda);
      for (let y = 0; y < celda; y++)
        data.copy(
          c.data,
          y * celda * 4,
          (y * info.width + col * celda) * 4,
          (y * info.width + (col + 1) * celda) * 4,
        );
      expect(figuras(componentes(c), 0), `celda 1·${col + 1}`).toHaveLength(1);
    }
  });

  it('cortada por su rejilla, una fila de 6 sigue fallando, con los dos motivos', async () => {
    const r = hojaIrregular();
    rect(r, 20 + 3 * 122 + 12, 100, 4, 60, 255);
    rect(r, 20 + 6 * 122 - 10, 20 + 135, 60, 110, 0); // borra la séptima de la fila 2
    expect(() => porRejilla(r, 3, 7)).toThrow(/la banda 2 tiene 6 figuras/);
    await expect(empaquetar(r, 3, 160)).rejects.toThrow(
      /figuras y la hoja pide 7.*; cortada por su rejilla/,
    );
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
