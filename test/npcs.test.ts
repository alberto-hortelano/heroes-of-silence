/**
 * El banco de figuras de NPC (`data/npcs.json`, `assets/npcs/`, 22-10-2026): su
 * lectura fail-loud con el vocabulario cerrado, el disco contra el índice, que una
 * figura de gente no es tropa ni pelea, y aceptar las figuras que pide un mundo.
 */
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import vecinos from '../data/vecinos.json' with { type: 'json' };
import { CUERPO_DE_VECINO, cuerpoDeGente } from '../src/client/render/cuerpo-de-gente.js';
import { arteDe, arteParaPintar, registrarGente } from '../src/client/render/personajes.js';
import { hojaDeUnidad, UNIDADES } from '../src/core/catalogo.js';
import {
  ETIQUETAS,
  figuraDelBanco,
  figuraQueSePinta,
  leerBanco,
  problemasDeFigura,
  problemasDePeticion,
} from '../src/core/npcs.js';
import { FACTION_IDS } from '../src/core/types.js';
import { hojasDelTaller } from '../tools/arena/borrador.js';
import {
  aceptarElMundo,
  aceptarPeticiones,
  carpetasSinFigura,
  crudoDelBanco,
  leerBancoDeDisco,
  loQueSeSirve,
} from '../tools/npcs/banco.js';
import semilla from '../tools/npcs/semilla.json' with { type: 'json' };
import { colaDelTaller } from '../tools/taller/cola.js';
import { FIGURA_DE_PRUEBA, raizDeNpcs } from './helpers.js';

const RAIZ = join(import.meta.dirname, '..');
const BANCO = leerBancoDeDisco();

/** Una figura que vale, para romperla campo a campo. */
const BUENA = FIGURA_DE_PRUEBA;
const conCambio = (cambio: Record<string, unknown>) => ({ ...BUENA, ...cambio });
const conEtiqueta = (k: string, v: unknown) => ({
  ...BUENA,
  etiquetas: { ...BUENA.etiquetas, [k]: v },
});

describe('el índice del banco (`data/npcs.json`)', () => {
  it('el del repo vale, y la semilla pedida está entera en él', () => {
    expect(() => leerBanco(crudoDelBanco())).not.toThrow();
    for (const [id, p] of Object.entries(semilla)) {
      const f = BANCO.figuras.find((x) => x.id === id);
      expect(f, id).toBeDefined();
      expect(f).toMatchObject({ ...p, pedidaPor: 'semilla' });
    }
  });

  it('muerde con un id repetido, una etiqueta fuera del vocabulario, una talla fuera y unas acciones desconocidas', () => {
    const banco = (figuras: unknown[]) => ({ _comment: 'x', figuras });
    expect(() => leerBanco(banco([BUENA, BUENA]))).toThrow(
      /figuras\[1\]\.id: "vecino-de-prueba" ya es la figura 0/,
    );
    expect(() => leerBanco(banco([conEtiqueta('oficio', 'pirata')]))).toThrow(
      /figuras\[0\]\.etiquetas\.oficio: el oficio "pirata" no existe; valen autoridad, escribano/,
    );
    expect(() => leerBanco(banco([conEtiqueta('faccion', 'caballeros')]))).toThrow(
      /etiquetas\.faccion: la facción "caballeros" no existe/,
    );
    expect(() => leerBanco(banco([conCambio({ talla: 3 })]))).toThrow(
      /talla: tiene que ser un número de 0.5 a 2.5/,
    );
    expect(() => leerBanco(banco([conCambio({ acciones: 'bailar' })]))).toThrow(
      /acciones: las acciones "bailar" no existe; valen reposo-y-marcha, todas/,
    );
    expect(() => leerBanco(banco([conCambio({ pintada: true })]))).toThrow(
      /figuras\[0\]: .*pintada/,
    );
    expect(() => leerBanco({ figuras: 'no' })).toThrow(/tiene que ser \{"_comment"/);
  });

  it('una petición es la figura sin id ni quién la pide: lo mismo de más, se dice', () => {
    const { id: _i, pedidaPor: _p, ...peticion } = BUENA;
    expect(problemasDePeticion(peticion, 'figuras.x')).toEqual([]);
    expect(problemasDePeticion(BUENA, 'figuras.x').join('\n')).toMatch(/figuras\.x: .*id/);
    expect(problemasDeFigura({ ...BUENA, descripcion: 'corta' }, 'f')).toContainEqual(
      expect.stringMatching(/f\.descripcion: es muy corta/),
    );
  });

  it('la gente de la base lleva sus etiquetas del vocabulario del banco, sin el cuerpo de antes', () => {
    for (const f of FACTION_IDS) {
      const g = (vecinos as unknown as Record<string, Record<string, unknown>>)[f] as {
        alcaide: Record<string, unknown>;
        encargados: Record<string, Record<string, unknown>>;
        vecinos: Record<string, Record<string, unknown>>;
      };
      for (const p of [g.alcaide, ...Object.values(g.encargados), ...Object.values(g.vecinos)]) {
        expect(p.cuerpo, `${f} ${p.nombre}`).toBeUndefined();
        expect(Object.keys(ETIQUETAS.oficio)).toContain(p.oficio);
        expect(Object.keys(ETIQUETAS.sexo)).toContain(p.sexo);
        expect(Object.keys(ETIQUETAS.especie)).toContain(p.especie);
      }
    }
  });
});

describe('el arte del banco en disco (`assets/npcs/`)', () => {
  it('toda carpeta es de una figura del banco, y toda pintada tiene sus ocho atlas y se registra como gente', () => {
    expect(carpetasSinFigura(BANCO)).toEqual([]);
    for (const [id, h] of Object.entries(loQueSeSirve().hojas)) {
      if (h.direcciones === null) continue;
      const arte = registrarGente(id, h.direcciones);
      for (const imagen of arte.imagenes)
        expect(existsSync(join(RAIZ, 'assets', imagen)), imagen).toBe(true);
    }
  });

  it('una figura del banco no es tropa: ningún id es de una unidad ni de una hoja, y la arena no lista ninguna', () => {
    const tropa = new Set([
      ...UNIDADES.map((u) => u.id),
      ...UNIDADES.map((u) => hojaDeUnidad(u.id)),
    ]);
    const delTaller = new Set(hojasDelTaller(RAIZ).map((h) => h.id));
    for (const f of BANCO.figuras) {
      expect(tropa.has(f.id), f.id).toBe(false);
      expect(delTaller.has(f.id), f.id).toBe(false);
      expect(existsSync(join(RAIZ, 'assets/unidades', f.id)), f.id).toBe(false);
    }
    // Y lo pintado del banco vive solo en assets/npcs/.
    if (existsSync(join(RAIZ, 'assets/npcs'))) {
      for (const d of readdirSync(join(RAIZ, 'assets/npcs')))
        expect(figuraDelBanco(BANCO, d), d).toBeDefined();
    }
  });
});

/** Una dirección de gente de mentira, como la deriva el taller con `hojas: ['a']`. */
const direccion = (extra: Record<string, unknown> = {}) => ({
  cell: 384,
  columns: 7,
  altura: 160,
  clips: {
    idle: { row: 0, frames: 7, fps: 8, loop: true, anchor: [190, 300] },
    walk: { row: 1, frames: 7, fps: 8, loop: true, anchor: [190, 300] },
    charge: { row: 2, frames: 7, fps: 8, loop: true, anchor: [190, 300] },
  },
  ...extra,
});

describe('una figura de gente no pelea (`ArteDeFigura.clips`, cuerpos `npc:<id>`)', () => {
  it('se registra con sus tres acciones y se pinta de pie y andando', () => {
    const arte = registrarGente(
      'gente-de-prueba',
      Array.from({ length: 8 }, () => direccion()),
    );
    expect(arte.direcciones[2]?.clips.walk?.imagen).toBe('/npcs/gente-de-prueba/d2/atlas.webp');
    expect([...arte.clips]).toEqual(['idle', 'walk', 'charge']);
    expect(arteParaPintar(cuerpoDeGente('gente-de-prueba'), 'walk')).toBe(arte);
  });

  it('`arteDe` lanza con ella, y pintarla atacando o muriendo también: no llega a una batalla', () => {
    registrarGente(
      'gente-de-prueba',
      Array.from({ length: 8 }, () => direccion()),
    );
    expect(() => arteDe(cuerpoDeGente('gente-de-prueba'))).toThrow(
      /es la figura de gente gente-de-prueba: no pelea \(no tiene attack/,
    );
    for (const clip of ['attack', 'death', 'hurt', 'shoot'] as const)
      expect(() => arteParaPintar(cuerpoDeGente('gente-de-prueba'), clip)).toThrow(
        new RegExp(`no tiene el clip "${clip}"`),
      );
    expect(() => arteParaPintar(cuerpoDeGente('sin-registrar'), 'idle')).toThrow(
      /no está registrada/,
    );
    // El Y Bot civil sigue siendo de toda la vida: el respaldo de la gente sin figura.
    expect(arteParaPintar(CUERPO_DE_VECINO, 'idle')).toBe(arteDe(CUERPO_DE_VECINO));
  });

  it('se niega a registrar siete direcciones o una sin su marcha', () => {
    expect(() =>
      registrarGente(
        'x',
        Array.from({ length: 7 }, () => direccion()),
      ),
    ).toThrow(/trae 7 direcciones/);
    const sinMarcha = direccion();
    delete (sinMarcha.clips as Record<string, unknown>).walk;
    expect(() =>
      registrarGente(
        'x',
        Array.from({ length: 8 }, () => sinMarcha),
      ),
    ).toThrow(/no tiene un clip "walk"/);
  });
});

describe('la figura que se pinta mientras la suya se pinta (`figuraQueSePinta`)', () => {
  const banco = leerBanco({
    figuras: [
      BUENA,
      { ...BUENA, id: 'vecina', etiquetas: { ...BUENA.etiquetas, sexo: 'mujer' } },
      { ...BUENA, id: 'pedida', etiquetas: { ...BUENA.etiquetas, sexo: 'mujer' } },
      { ...BUENA, id: 'orko', etiquetas: { ...BUENA.etiquetas, faccion: 'orkos' } },
    ],
  });
  it('la suya si está pintada; si no, la más parecida de su facción; sin ninguna, el Y Bot', () => {
    const gente = { banco, pintadas: new Set(['vecino-de-prueba', 'vecina']) };
    expect(figuraQueSePinta(gente, 'vecina', 'k')).toBe('vecina');
    expect(figuraQueSePinta(gente, 'pedida', 'k')).toBe('vecina');
    expect(figuraQueSePinta(gente, 'orko', 'k')).toBeNull();
    expect(() => figuraQueSePinta(gente, 'nadie', 'k')).toThrow(/no está en el banco/);
  });
});

describe('aceptar las figuras que pide un mundo (`tools/npcs/banco.ts`)', () => {
  /** Una raíz temporal con un banco de una figura y un mundo que pide `pedidas`. */
  async function raiz(pedidas: Record<string, unknown>): Promise<string> {
    const r = raizDeNpcs([BUENA]);
    await mkdir(join(r, 'assets/mundos/gen-1'), { recursive: true });
    await writeFile(
      join(r, 'assets/mundos/gen-1/historia.json'),
      JSON.stringify({ titulo: 't', resumen: 'r', marcas: {}, lugares: [], figuras: pedidas }),
    );
    return r;
  }
  const { id: _i, pedidaPor: _p, ...PETICION } = BUENA;

  it('pasan al banco con el mundo que las pidió, la historia queda sin «figuras» y su identidad, en la cola', async () => {
    const r = await raiz({ barquero: PETICION, barquera: PETICION });
    const { figuras, encolados } = await aceptarElMundo('gen-1', r);
    expect(figuras.map((f) => f.id)).toEqual(['barquero', 'barquera']);
    const banco = leerBancoDeDisco(r);
    expect(banco.figuras.map((f) => [f.id, f.pedidaPor])).toEqual([
      ['vecino-de-prueba', 'semilla'],
      ['barquero', 'gen-1'],
      ['barquera', 'gen-1'],
    ]);
    expect(JSON.parse(await readFile(join(r, 'data/npcs.json'), 'utf8'))._comment).toBe(
      'de prueba',
    );
    const historia = JSON.parse(
      await readFile(join(r, 'assets/mundos/gen-1/historia.json'), 'utf8'),
    );
    expect(historia.figuras).toBeUndefined();
    expect(encolados).toEqual(['npc-barquero-identidad', 'npc-barquera-identidad']);
    expect((await colaDelTaller(r).estado()).pendiente).toEqual([...encolados].sort());
  });

  it('con un id que ya es del banco, o una petición que no vale, lanza sin escribir nada', async () => {
    const r = await raiz({ 'vecino-de-prueba': PETICION, otra: { ...PETICION, talla: 9 } });
    const antes = await readFile(join(r, 'data/npcs.json'), 'utf8');
    await expect(aceptarElMundo('gen-1', r)).rejects.toThrow(
      /"vecino-de-prueba" ya es una figura del banco[\s\S]*figuras\.otra\.talla/,
    );
    expect(await readFile(join(r, 'data/npcs.json'), 'utf8')).toBe(antes);
    expect(
      JSON.parse(await readFile(join(r, 'assets/mundos/gen-1/historia.json'), 'utf8')).figuras,
    ).toBeDefined();
    expect((await colaDelTaller(r).estado()).pendiente).toEqual([]);
  });

  it('un mundo pide como mucho cuatro, con la regla de su historia; la semilla, sin tope', async () => {
    const cinco = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((k) => [`fig-${k}`, PETICION]));
    const r = await raiz(cinco);
    await expect(aceptarElMundo('gen-1', r)).rejects.toThrow(
      /figuras: pide 5 figuras y un mundo pide como mucho 4/,
    );
    expect(leerBancoDeDisco(r).figuras).toHaveLength(1);
    expect((await aceptarPeticiones(cinco, 'semilla', r)).figuras).toHaveLength(5);
  });

  it('`pnpm npcs pedir` entra por la misma puerta', async () => {
    const r = await raiz({});
    await aceptarPeticiones({ pastor: PETICION }, 'semilla', r);
    expect(leerBancoDeDisco(r).figuras.at(-1)).toMatchObject({
      id: 'pastor',
      pedidaPor: 'semilla',
    });
    await expect(aceptarPeticiones({ pastor: PETICION }, 'semilla', r)).rejects.toThrow(
      /ya es una figura del banco/,
    );
  });
});
