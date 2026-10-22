/**
 * El taller pinta las figuras del banco de NPC desde datos (`tools/taller/npcs.ts`):
 * lo que se encarga sale de lo que falta en disco, la cadena identidad → giro →
 * hojas se encola sola sin repetir, una figura de solo reposo y marcha junta y
 * deriva su hoja A sola, y `pnpm npcs trabajar` no se lleva lo que no es suyo.
 *
 * Todo en una raíz temporal con su propio `data/npcs.json`, su `assets/npcs/` y su
 * cola: nada de esto toca el repo.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { FiguraDeNpc } from '../src/core/npcs.js';
import { HOJAS_DE_FIGURA } from '../src/shared/arte.js';
import { estadoDeFigura, loQueSeSirve } from '../tools/npcs/banco.js';
import {
  esEncargoDeNpc,
  fotoDelTaller,
  fraseDelTaller,
  REINTENTOS_DE_NPC,
  reintentarSiQueda,
} from '../tools/npcs/en-el-taller.js';
import { colaDelTaller } from '../tools/taller/cola.js';
import { derivarAtlas } from '../tools/taller/derivar.js';
import { encargoSchema } from '../tools/taller/encargo.js';
import { juntarDireccion } from '../tools/taller/juntar.js';
import { encargosQueSiguen, encolarLoQueSigue, rescatar } from '../tools/taller/npcs.js';
import { FIGURA_DE_PRUEBA, raizDeNpcs } from './helpers.js';

const RAIZ = join(import.meta.dirname, '..');

const VECINA: FiguraDeNpc = {
  ...FIGURA_DE_PRUEBA,
  id: 'vecina-de-prueba',
  etiquetas: { ...FIGURA_DE_PRUEBA.etiquetas, sexo: 'mujer' },
};
const ENTERA: FiguraDeNpc = { ...VECINA, id: 'guardia-de-prueba', acciones: 'todas', talla: 0.7 };

/** Una raíz temporal con un banco de dos figuras. */
const raiz = async (): Promise<string> => raizDeNpcs([VECINA, ENTERA]);

/** Un fichero vacío en la raíz: lo que mira `encargosQueSiguen` es que esté. */
async function tocar(r: string, ruta: string): Promise<void> {
  await mkdir(join(r, ruta, '..'), { recursive: true });
  await writeFile(join(r, ruta), '');
}

/** Una hoja de mentira de `filas` filas de 7 columnas, en celdas de 64: un rectángulo por celda. */
async function hojaDeMentira(filas: number): Promise<Buffer> {
  const c = 64;
  const capas = [];
  for (let f = 0; f < filas; f++)
    for (let col = 0; col < 7; col++)
      capas.push({
        input: { create: { width: 10, height: 40, channels: 4 as const, background: '#808080' } },
        left: col * c + 27 + (col % 2),
        top: f * c + 10,
      });
  return sharp({
    create: {
      width: 7 * c,
      height: filas * c,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(capas)
    .png()
    .toBuffer();
}

describe('lo que se encarga de una figura del banco sale de lo que falta en disco', () => {
  it('nada → la identidad; con ella → el giro; con él → la hoja A de cada dirección (y la B con «todas»)', async () => {
    const r = await raiz();
    const ids = (f: FiguraDeNpc) => encargosQueSiguen(f, r).map((e) => e.id);
    expect(ids(VECINA)).toEqual(['npc-vecina-de-prueba-identidad']);
    await tocar(r, 'assets/npcs/vecina-de-prueba/identidad.webp');
    expect(ids(VECINA)).toEqual(['npc-vecina-de-prueba-giro']);
    await tocar(r, 'assets/npcs/vecina-de-prueba/giro.webp');
    expect(ids(VECINA)).toEqual(
      Array.from({ length: 8 }, (_, d) => `npc-vecina-de-prueba-d${d}-a`),
    );
    await tocar(r, 'assets/npcs/vecina-de-prueba/d3/hoja-a.webp');
    expect(ids(VECINA)).toHaveLength(7);
    expect(ids(VECINA)).not.toContain('npc-vecina-de-prueba-d3-a');
    for (const d of [0, 1, 2, 4, 5, 6, 7])
      await tocar(r, `assets/npcs/vecina-de-prueba/d${d}/hoja-a.webp`);
    expect(ids(VECINA)).toEqual([]);

    await tocar(r, 'assets/npcs/guardia-de-prueba/identidad.webp');
    await tocar(r, 'assets/npcs/guardia-de-prueba/giro.webp');
    expect(ids(ENTERA)).toHaveLength(16);
  });

  it('cada encargo vale para la cola, se pinta sobre el maniquí civil con su profundidad y se encadena', async () => {
    const r = await raiz();
    const todos = [
      ...encargosQueSiguen(ENTERA, r),
      ...(await (async () => {
        await tocar(r, 'assets/npcs/guardia-de-prueba/identidad.webp');
        return encargosQueSiguen(ENTERA, r);
      })()),
      ...(await (async () => {
        await tocar(r, 'assets/npcs/guardia-de-prueba/giro.webp');
        return encargosQueSiguen(ENTERA, r);
      })()),
    ];
    expect(todos).toHaveLength(18);
    for (const e of todos) {
      expect(() => encargoSchema.parse(e), e.id).not.toThrow();
      expect(e.despues).toEqual({ orden: 'encadenar-npc', npc: 'guardia-de-prueba' });
      expect(e.salida.startsWith('assets/npcs/guardia-de-prueba/'), e.salida).toBe(true);
      // La pose es del maniquí civil del repo (`pnpm taller maniqui --civil`): está en disco.
      const pose = e.referencias[0]?.ruta as string;
      expect(pose.startsWith('assets/unidades/_poses/gente/civil-8d/'), pose).toBe(true);
      expect(existsSync(join(RAIZ, pose)), pose).toBe(true);
    }
    const hojas = todos.filter((e) => e.tipo === 'atlas');
    for (const e of hojas) {
      expect(e.referencias.map((x) => x.papel)).toEqual(['pose-profundidad', 'identidad']);
      expect(e.talla).toBe(0.7);
      expect(e.celda).toBe(384);
    }
  });

  it('encolar lo que sigue no repite lo que ya está en la cola; con «repescar», vuelve lo que falló', async () => {
    const r = await raiz();
    expect(await encolarLoQueSigue(VECINA, r)).toEqual(['npc-vecina-de-prueba-identidad']);
    expect(await encolarLoQueSigue(VECINA, r)).toEqual([]);
    const cola = colaDelTaller(r);
    await cola.tomar('npc-vecina-de-prueba-identidad');
    await cola.cerrar('npc-vecina-de-prueba-identidad', 'fallido', {
      cuando: 'ahora',
      motivo: 'x',
    });
    // Al encadenar, lo fallido se queda fallido: no se vuelve a pedir en bucle.
    expect(await encolarLoQueSigue(VECINA, r)).toEqual([]);
    expect(await encolarLoQueSigue(VECINA, r, { repescar: true })).toEqual([
      'npc-vecina-de-prueba-identidad',
    ]);
  });

  it('«pnpm npcs trabajar» toma solo encargos de NPC (`Cola.tomar` con filtro)', async () => {
    const r = await raiz();
    const cola = colaDelTaller(r);
    const ajeno = {
      id: 'aaa-ajeno',
      tipo: 'imagen' as const,
      descripcion: 'Un encargo que no es de NPC y va antes por orden de id.',
      referencias: [],
      salida: 'assets/mapa/ajeno',
    };
    await cola.encolar(ajeno);
    await encolarLoQueSigue(VECINA, r);
    expect((await cola.tomar(undefined, esEncargoDeNpc))?.id).toBe(
      'npc-vecina-de-prueba-identidad',
    );
    expect(await cola.tomar(undefined, esEncargoDeNpc)).toBeNull();
    expect((await cola.estado()).pendiente).toEqual(['aaa-ajeno']);
  });
});

describe('una figura de solo reposo y marcha', () => {
  it('junta su hoja A sola, de tres filas, sin ataque ni cadáver; la de «todas» espera a su B', async () => {
    const r = await raiz();
    for (const id of ['vecina-de-prueba', 'guardia-de-prueba']) {
      await mkdir(join(r, 'assets/npcs', id, 'd0'), { recursive: true });
      await writeFile(
        join(r, 'assets/npcs', id, 'd0/hoja-a.webp'),
        await sharp(await hojaDeMentira(3))
          .webp({ lossless: true })
          .toBuffer(),
      );
    }
    const dir = join(r, 'assets/npcs/vecina-de-prueba/d0');
    expect(await juntarDireccion(dir)).toBe(join(dir, 'atlas.webp'));
    const json = JSON.parse(await readFile(join(dir, 'atlas.json'), 'utf8'));
    expect(Object.keys(json.clips)).toEqual([...HOJAS_DE_FIGURA.a]);
    expect(json.cadaver).toBeUndefined();
    expect(await juntarDireccion(join(r, 'assets/npcs/guardia-de-prueba/d0'))).toBeNull();
  });

  it('una hoja de tres filas solo se deriva diciendo sus hojas, y con ellas solo vale una de tres', async () => {
    const r = await raiz();
    const tres = join(r, 'tres.png');
    const seis = join(r, 'seis.png');
    await writeFile(tres, await hojaDeMentira(3));
    await writeFile(seis, await hojaDeMentira(6));
    await expect(derivarAtlas(tres)).rejects.toThrow(/por 6 filas, o 7 con el disparo/);
    await expect(derivarAtlas(seis, { hojas: ['a'] })).rejects.toThrow(
      /con las hojas A son 7 columnas por 3 filas \(idle, walk, charge\)/,
    );
    await expect(derivarAtlas(tres, { hojas: ['a', 'b'] })).rejects.toThrow(
      /con las hojas A y B son 7 columnas por 6 filas/,
    );
    const d = await derivarAtlas(tres, { hojas: ['a'] });
    expect(Object.keys(d.clips)).toEqual(['idle', 'walk', 'charge']);
    expect(d.cadaver).toBeUndefined();
    // Con la A y la B, lo mismo que una hoja de tropa de seis filas, cadáver incluido.
    expect(await derivarAtlas(seis, { hojas: ['a', 'b'] })).toEqual(await derivarAtlas(seis));
  });

  it('una carpeta de assets/npcs/ que no es del banco no se junta: lanza diciéndolo', async () => {
    const r = await raiz();
    const dir = join(r, 'assets/npcs/nadie/d0');
    await mkdir(dir, { recursive: true });
    await expect(juntarDireccion(dir)).rejects.toThrow(/"nadie" no es una figura del banco de NPC/);
  });
});

/** Toma `id` y lo cierra fallido con `motivo`, como el trabajador cuando una hoja no pasa. */
async function fallar(
  r: string,
  id: string,
  motivo = 'la imagen está casi vacía tras el recorte',
): Promise<void> {
  const cola = colaDelTaller(r);
  expect((await cola.tomar(id))?.id).toBe(id);
  await cola.cerrar(id, 'fallido', { cuando: 'ahora', motivo });
}

/** Una figura con la identidad y el giro en disco, y las hojas de `d` del 0 al 6: le falta d7. */
async function aMediasSinD7(r: string): Promise<void> {
  for (const f of ['identidad.webp', 'giro.webp'])
    await tocar(r, `assets/npcs/vecina-de-prueba/${f}`);
  for (let d = 0; d < 7; d++) {
    await tocar(r, `assets/npcs/vecina-de-prueba/d${d}/hoja-a.webp`);
    await tocar(r, `assets/npcs/vecina-de-prueba/d${d}/atlas.json`);
    await tocar(r, `assets/npcs/vecina-de-prueba/d${d}/atlas.webp`);
  }
}

describe('una figura no se queda a medias para siempre (QA del banco de NPC, H2)', () => {
  const D7 = 'npc-vecina-de-prueba-d7-a';

  it('un encargo de NPC que falla se reintenta solo dos veces, con la cuenta en su ficha', async () => {
    const r = await raiz();
    await aMediasSinD7(r);
    const cola = colaDelTaller(r);
    expect(await encolarLoQueSigue(VECINA, r)).toEqual([D7]);
    expect(REINTENTOS_DE_NPC).toBe(2);
    for (const vez of [1, 2]) {
      await fallar(r, D7, `fallo ${vez}`);
      expect(await reintentarSiQueda(cola, D7)).toBe(vez);
      expect((await cola.estado()).pendiente).toEqual([D7]);
      // La cuenta va en el disco: la ficha pendiente lleva los fallos de antes.
      expect((await cola.leer('pendiente', D7)).fallos?.map((f) => f.motivo)).toEqual(
        Array.from({ length: vez }, (_, i) => `fallo ${i + 1}`),
      );
    }
    await fallar(r, D7, 'fallo 3');
    expect(await reintentarSiQueda(cola, D7)).toBeNull();
    expect((await cola.estado()).fallido).toEqual([D7]);
    // Sin cuota no es un fallo: devolverlo desde en curso conserva la cuenta.
    await cola.reintentar(D7);
    await cola.tomar(D7);
    await cola.devolver(D7, 'en-curso');
    expect((await cola.leer('pendiente', D7)).fallos).toHaveLength(3);
  });

  it('lo que no es de NPC no se reintenta solo', async () => {
    const r = await raiz();
    const cola = colaDelTaller(r);
    await cola.encolar({
      id: 'aaa-ajeno',
      tipo: 'imagen',
      descripcion: 'Un encargo que no es de NPC y que falla.',
      referencias: [],
      salida: 'assets/mapa/ajeno',
    });
    await fallar(r, 'aaa-ajeno');
    expect(await reintentarSiQueda(cola, 'aaa-ajeno')).toBeNull();
    expect((await cola.estado()).fallido).toEqual(['aaa-ajeno']);
  });

  it('«pnpm npcs trabajar» rescata lo fallido con reintentos y lo que falta, y no toca lo vivo', async () => {
    const r = await raiz();
    await aMediasSinD7(r);
    const cola = colaDelTaller(r);
    // Lo que falló con el código de antes (sin cuenta): le quedan sus dos reintentos.
    await encolarLoQueSigue(VECINA, r);
    await fallar(r, D7);
    expect(await rescatar(VECINA, r)).toEqual({ encolados: [D7], agotados: [] });
    expect((await cola.leer('pendiente', D7)).fallos).toHaveLength(1);
    // Con algo suyo vivo, nada: lo lleva un trabajador.
    expect(await rescatar(VECINA, r)).toEqual({ encolados: [], agotados: [] });
    // Agotado: se queda fallido y se dice.
    await fallar(r, D7);
    await cola.reintentar(D7);
    await fallar(r, D7);
    expect(await rescatar(VECINA, r)).toEqual({ encolados: [], agotados: [D7] });
    expect((await cola.estado()).fallido).toEqual([D7]);
    // Una figura sin nada en la cola (pedida en otro clon): se encola lo que le falta.
    expect(await rescatar(ENTERA, r)).toEqual({
      encolados: ['npc-guardia-de-prueba-identidad'],
      agotados: [],
    });
  });

  it('el estado dice si el taller la está pintando o se paró en ella, y con qué orden se arregla', async () => {
    const r = await raiz();
    await aMediasSinD7(r);
    const cola = colaDelTaller(r);
    const motivo = (): string => {
      const e = estadoDeFigura('vecina-de-prueba', r);
      if (e.estado !== 'a-medias') throw new Error(`está ${e.estado}`);
      return e.motivo;
    };
    const faltaD7 = 'vecina-de-prueba tiene 7 de sus 8 direcciones (le faltan d7)';
    expect(motivo()).toBe(
      `${faltaD7}: no hay nada suyo en la cola del taller (pedida en otro clon, o la cola se borró): se encola con \`pnpm npcs encolar vecina-de-prueba\``,
    );
    await encolarLoQueSigue(VECINA, r);
    expect(motivo()).toBe(`${faltaD7}: el taller la está pintando`);
    await fallar(r, D7);
    expect(motivo()).toBe(
      `${faltaD7}: el taller se paró porque falló ${D7} (la imagen está casi vacía tras el recorte); se reintenta sola al arrancar \`pnpm npcs trabajar\` (le quedan 2 reintentos), o ya con \`pnpm npcs encolar vecina-de-prueba\``,
    );
    await cola.reintentar(D7);
    await fallar(r, D7);
    await cola.reintentar(D7);
    await fallar(r, D7);
    expect(motivo()).toBe(
      `${faltaD7}: el taller se paró porque falló ${D7} (la imagen está casi vacía tras el recorte); agotó sus 2 reintentos: se reintenta con \`pnpm npcs encolar vecina-de-prueba\``,
    );
    // Lo mismo dice `/__npcs` (y el aviso de `vite build`), y de la que no tiene nada pintado.
    const servido = loQueSeSirve(r).hojas;
    expect(servido['vecina-de-prueba']?.incompleta).toBe(motivo());
    expect(servido['guardia-de-prueba']?.incompleta).toBe(
      'guardia-de-prueba está pedida y sin pintar: no hay nada suyo en la cola del taller (pedida en otro clon, o la cola se borró): se encola con `pnpm npcs encolar guardia-de-prueba`',
    );
    expect(fotoDelTaller(r)('guardia-de-prueba')).toEqual({ que: 'nada' });
  });

  it('una figura sin nada pintado y con un fallo no dice «sin pintar» y «a medias» a la vez', async () => {
    const r = await raiz();
    const identidad = 'npc-vecina-de-prueba-identidad';
    await encolarLoQueSigue(VECINA, r);
    await fallar(r, identidad, 'Codex no devolvió imagen');
    expect(estadoDeFigura('vecina-de-prueba', r)).toEqual({
      estado: 'pendiente',
      motivo: `vecina-de-prueba está pedida y sin pintar: el taller se paró porque falló ${identidad} (Codex no devolvió imagen); se reintenta sola al arrancar \`pnpm npcs trabajar\` (le quedan 2 reintentos), o ya con \`pnpm npcs encolar vecina-de-prueba\``,
    });
  });

  // QA del banco de NPC, H6: el trabajador que muere a mitad de un encargo lo dejaba en
  // curso para siempre, y la figura decía «el taller la está pintando».
  it('lo que dejó en curso un trabajador muerto se dice, y lo recogen el rescate y «encolar»', async () => {
    const r = await raiz();
    await aMediasSinD7(r);
    const cola = colaDelTaller(r);
    await encolarLoQueSigue(VECINA, r);
    await fallar(r, D7, 'fallo 1');
    await cola.reintentar(D7);
    await cola.tomar(D7);
    const enCurso = join(r, 'tools/taller/cola/en-curso', `${D7}.json`);
    const ficha = JSON.parse(await readFile(enCurso, 'utf8'));
    const { pid: muerto } = spawnSync(process.execPath, ['-e', '']);
    await writeFile(enCurso, JSON.stringify({ ...ficha, pid: muerto }));

    expect(fotoDelTaller(r)('vecina-de-prueba')).toEqual({
      que: 'huerfano',
      encargo: D7,
      pid: muerto,
    });
    const faltaD7 = 'vecina-de-prueba tiene 7 de sus 8 direcciones (le faltan d7)';
    expect(estadoDeFigura('vecina-de-prueba', r)).toEqual({
      estado: 'a-medias',
      motivo: `${faltaD7}: el taller se paró porque murió el trabajador que llevaba ${D7} (pid ${muerto}); se recoge sola al arrancar \`pnpm npcs trabajar\`, o ya con \`pnpm npcs encolar vecina-de-prueba\``,
    });
    // El rescate de `pnpm npcs trabajar` lo devuelve con su cuenta, y el trabajador nuevo lo toma.
    expect(await rescatar(VECINA, r)).toEqual({ encolados: [D7], agotados: [] });
    expect((await cola.leer('pendiente', D7)).fallos).toHaveLength(1);
    expect(fotoDelTaller(r)('vecina-de-prueba')).toEqual({ que: 'pintando' });
    expect((await cola.tomar(undefined, esEncargoDeNpc))?.id).toBe(D7);
    // «pnpm npcs encolar» también.
    await writeFile(enCurso, JSON.stringify({ ...ficha, pid: muerto }));
    expect(await encolarLoQueSigue(VECINA, r, { repescar: true })).toEqual([D7]);
  });

  it('lo que tomó un trabajador de antes, sin pid, se da por vivo: no se roba, y se dice cómo sacarlo', async () => {
    const r = await raiz();
    await aMediasSinD7(r);
    const cola = colaDelTaller(r);
    await encolarLoQueSigue(VECINA, r);
    await cola.tomar(D7);
    const enCurso = join(r, 'tools/taller/cola/en-curso', `${D7}.json`);
    const { pid: _, ...sinPid } = JSON.parse(await readFile(enCurso, 'utf8'));
    await writeFile(enCurso, JSON.stringify(sinPid));
    expect(await rescatar(VECINA, r)).toEqual({ encolados: [], agotados: [] });
    expect(await encolarLoQueSigue(VECINA, r, { repescar: true })).toEqual([]);
    expect((await cola.estado())['en-curso']).toEqual([D7]);
    expect(fraseDelTaller('vecina-de-prueba', fotoDelTaller(r)('vecina-de-prueba'))).toBe(
      `el taller la está pintando (${D7} lo lleva un trabajador de antes, sin pid apuntado: si no queda ninguno vivo, se devuelve con \`pnpm taller devolver ${D7}\`)`,
    );
  });

  // QA del banco de NPC, H7: `lanzarElTaller` de `pnpm dev` y otro a mano rescatan a la vez.
  it('dos «pnpm npcs trabajar» que rescatan a la vez no chocan: uno encola y el otro se lo salta', async () => {
    const r = await raiz();
    const res = await Promise.allSettled([rescatar(VECINA, r), rescatar(VECINA, r)]);
    expect(res.map((x) => x.status)).toEqual(['fulfilled', 'fulfilled']);
    const encolados = res.flatMap((x) => (x.status === 'fulfilled' ? x.value.encolados : []));
    expect(encolados).toEqual(['npc-vecina-de-prueba-identidad']);
    expect((await colaDelTaller(r).estado()).pendiente).toEqual(['npc-vecina-de-prueba-identidad']);
    // Y lo fallido que el trabajador reintenta mientras otro rescata: se reintenta una vez.
    await fallar(r, 'npc-vecina-de-prueba-identidad');
    const cola = colaDelTaller(r);
    const [vez, rescate] = await Promise.allSettled([
      reintentarSiQueda(cola, 'npc-vecina-de-prueba-identidad'),
      rescatar(VECINA, r),
    ]);
    expect(rescate.status).toBe('fulfilled');
    // El que llega tarde del trabajador lanza `NoEstaEn`, y su bucle lo dice y sigue (`trabajador.ts`).
    if (vez.status === 'rejected') expect(String(vez.reason)).toMatch(/no está en fallido\//);
    expect(await cola.estado()).toMatchObject({
      pendiente: ['npc-vecina-de-prueba-identidad'],
      fallido: [],
    });
    expect((await cola.leer('pendiente', 'npc-vecina-de-prueba-identidad')).fallos).toHaveLength(1);
  });

  it('reprocesar toma lo fallido sin pasar por pendiente (`Cola.retomar`): ningún trabajador se lo lleva', async () => {
    const r = await raiz();
    await aMediasSinD7(r);
    const cola = colaDelTaller(r);
    await encolarLoQueSigue(VECINA, r);
    await fallar(r, D7);
    const ficha = await cola.retomar(D7, 'fallido');
    expect(ficha.resultado?.motivo).toBe('la imagen está casi vacía tras el recorte');
    expect(await cola.estado()).toEqual({
      pendiente: [],
      'en-curso': [D7],
      hecho: [],
      fallido: [],
    });
    expect((await cola.leer('en-curso', D7)).resultado).toBeUndefined();
  });
});
