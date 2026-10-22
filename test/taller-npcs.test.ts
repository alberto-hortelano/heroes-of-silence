/**
 * El taller pinta las figuras del banco de NPC desde datos (`tools/taller/npcs.ts`):
 * lo que se encarga sale de lo que falta en disco, la cadena identidad → giro →
 * hojas se encola sola sin repetir, una figura de solo reposo y marcha junta y
 * deriva su hoja A sola, y `pnpm npcs trabajar` no se lleva lo que no es suyo.
 *
 * Todo en una raíz temporal con su propio `data/npcs.json`, su `assets/npcs/` y su
 * cola: nada de esto toca el repo.
 */
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import type { FiguraDeNpc } from '../src/core/npcs.js';
import { HOJAS_DE_FIGURA } from '../src/shared/arte.js';
import { derivarAtlas } from '../tools/taller/derivar.js';
import { encargoSchema } from '../tools/taller/encargo.js';
import { juntarDireccion } from '../tools/taller/juntar.js';
import {
  colaDelTaller,
  encargosQueSiguen,
  encolarLoQueSigue,
  esEncargoDeNpc,
} from '../tools/taller/npcs.js';

const RAIZ = join(import.meta.dirname, '..');

const TEMPORALES: string[] = [];
afterAll(async () => {
  await Promise.all(TEMPORALES.map((d) => rm(d, { recursive: true, force: true })));
});

const VECINA: FiguraDeNpc = {
  id: 'vecina-de-prueba',
  descripcion:
    'Una vecina de prueba: vestido de lana parda, delantal blanco, toca de lino y zuecos de madera.',
  etiquetas: {
    oficio: 'campesino',
    sexo: 'mujer',
    edad: 'adulto',
    especie: 'humano',
    faccion: 'templarios',
    clase: 'baja',
  },
  talla: 1,
  acciones: 'reposo-y-marcha',
  pedidaPor: 'semilla',
};
const ENTERA: FiguraDeNpc = { ...VECINA, id: 'guardia-de-prueba', acciones: 'todas', talla: 0.7 };

/** Una raíz temporal con un banco de dos figuras. */
async function raiz(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'taller-npcs-'));
  TEMPORALES.push(dir);
  await mkdir(join(dir, 'data'), { recursive: true });
  await writeFile(
    join(dir, 'data/npcs.json'),
    JSON.stringify({ _comment: 'de prueba', figuras: [VECINA, ENTERA] }),
  );
  return dir;
}

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

  it('una hoja de tres filas solo se deriva pidiéndolo, y pidiéndolo solo vale una de tres', async () => {
    const r = await raiz();
    const tres = join(r, 'tres.png');
    const seis = join(r, 'seis.png');
    await writeFile(tres, await hojaDeMentira(3));
    await writeFile(seis, await hojaDeMentira(6));
    await expect(derivarAtlas(tres)).rejects.toThrow(/por 6 filas, o 7 con el disparo/);
    await expect(derivarAtlas(seis, { soloReposo: true })).rejects.toThrow(
      /una figura de solo reposo y marcha son 7 columnas por 3 filas/,
    );
    const d = await derivarAtlas(tres, { soloReposo: true });
    expect(Object.keys(d.clips)).toEqual(['idle', 'walk', 'charge']);
    expect(d.cadaver).toBeUndefined();
  });

  it('una carpeta de assets/npcs/ que no es del banco no se junta: lanza diciéndolo', async () => {
    const r = await raiz();
    const dir = join(r, 'assets/npcs/nadie/d0');
    await mkdir(dir, { recursive: true });
    await expect(juntarDireccion(dir)).rejects.toThrow(/"nadie" no es una figura del banco de NPC/);
  });
});
