/**
 * Las marcas de fallo en disco (`tools/marcas/almacen.ts`), contra una carpeta
 * temporal: lo que escribe, lo que rechaza diciéndolo y cómo se resuelven.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MarcaNueva } from '../src/client/desarrollo/tipos.js';
import { queHayEn } from '../src/client/render/escenario/inspeccion.js';
import { escenarioDe } from '../src/client/render/escenario/superficie.js';
import { Session } from '../src/client/session.js';
import { newGame } from '../src/core/state/setup.js';
import {
  CARPETA_DE_MARCAS,
  guardarMarca,
  idDeMarca,
  leerMarca,
  listarMarcas,
  resolverMarca,
} from '../tools/marcas/almacen.js';

/** Un PNG de 1×1 de verdad. */
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** La marca de prueba, hecha una vez: componer el escenario cuesta. */
const MARCA: MarcaNueva = (() => {
  const s = new Session(1);
  const esc = escenarioDe(s.state.map, 1);
  const casilla = { x: 10, y: 12 };
  const punto = { x: 10.4, y: 12.7 };
  return {
    semilla: 1,
    dia: 1,
    casilla,
    punto,
    camara: { tile: 70, x: 3, y: 6 },
    lienzo: { ancho: 1280, alto: 800, dpr: 1, densidad: 1 },
    recorte: [5.9, 8.2, 14.9, 17.2],
    nota: 'la cara de roca acaba en un borde recto',
    objeto: null,
    queHay: queHayEn(esc, punto, casilla),
    png: PNG_1X1,
  };
})();

const LAS_DIEZ = new Date('2026-10-07T10:11:12Z');

let raiz: string;
beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'marcas-'));
});
afterEach(() => {
  rmSync(raiz, { recursive: true, force: true });
});

describe('guardarMarca', () => {
  it('escribe el JSON y el PNG, con un id que dice cuándo y dónde, pendiente', () => {
    const hecho = guardarMarca(raiz, MARCA, LAS_DIEZ);
    expect(hecho.id).toBe('20261007-101112-s1-10-12');
    expect(hecho.json).toBe(join(raiz, CARPETA_DE_MARCAS, `${hecho.id}.json`));
    expect(readFileSync(hecho.png).toString('base64')).toBe(PNG_1X1);
    const leida = leerMarca(raiz, hecho.id);
    expect(leida.resuelta).toBeNull();
    // Pendiente es `resuelta: null`: el estado no se escribe aparte.
    expect(readFileSync(hecho.json, 'utf8')).not.toContain('estado');
    expect(leida.fecha).toBe('2026-10-07T10:11:12.000Z');
    expect(leida.png).toBe(`${hecho.id}.png`);
    expect(leida.nota).toBe('la cara de roca acaba en un borde recto');
    // Lo que hay ahí viaja entero: es lo que lee quien arregla el escenógrafo.
    expect(leida.queHay).toEqual(MARCA.queHay);
    // El PNG no va dentro del JSON: ocuparía megas en cada `pnpm marcas lista`.
    expect(readFileSync(hecho.json, 'utf8')).not.toContain(PNG_1X1);
  });

  it('lo que no es una marca no se escribe, y se dice qué falla', () => {
    const { semilla: _, ...sinSemilla } = MARCA;
    expect(() => guardarMarca(raiz, sinSemilla, LAS_DIEZ)).toThrow(/^semilla: falta$/);
    expect(() => guardarMarca(raiz, { ...MARCA, png: 'no es <base64>' }, LAS_DIEZ)).toThrow(
      /no es un PNG en base64/,
    );
    const gif = Buffer.from('GIF89a-no-es-png').toString('base64');
    expect(() => guardarMarca(raiz, { ...MARCA, png: gif }, LAS_DIEZ)).toThrow(
      /llegó en base64 pero no es un PNG/,
    );
    expect(() => guardarMarca(raiz, { ...MARCA, nota: '   ' }, LAS_DIEZ)).toThrow(
      /sin nota no dice qué falla/,
    );
    expect(() => guardarMarca(raiz, 'hola', LAS_DIEZ)).toThrow(
      /^la marca es string y tiene que ser object$/,
    );
    expect(() => guardarMarca(raiz, { ...MARCA, dia: '1' }, LAS_DIEZ)).toThrow(
      /^dia: es string y tiene que ser number$/,
    );
    expect(existsSync(join(raiz, CARPETA_DE_MARCAS))).toBe(false);
  });

  it('una marca no pisa a otra: el mismo id lanza y deja la primera como estaba', () => {
    const primera = guardarMarca(raiz, MARCA, LAS_DIEZ);
    const antes = readFileSync(primera.json, 'utf8');
    expect(() => guardarMarca(raiz, { ...MARCA, nota: 'otra cosa' }, LAS_DIEZ)).toThrow(
      /ya hay una marca/,
    );
    expect(readFileSync(primera.json, 'utf8')).toBe(antes);
  });
});

describe('leer, listar y resolver', () => {
  it('resolver la cambia de estado con su referencia, y deja de estar pendiente', () => {
    const una = guardarMarca(raiz, MARCA, LAS_DIEZ);
    const otra = guardarMarca(raiz, MARCA, new Date('2026-10-07T10:11:13Z'));
    expect(listarMarcas(raiz).map((m) => m.id)).toEqual([una.id, otra.id]);
    const resuelta = resolverMarca(raiz, una.id, ' #999 ', new Date('2026-10-08T09:00:00Z'));
    expect(resuelta.resuelta).toEqual({ ref: '#999', fecha: '2026-10-08T09:00:00.000Z' });
    expect(leerMarca(raiz, una.id).resuelta?.ref).toBe('#999');
    const pendientes = listarMarcas(raiz).filter((m) => m.resuelta === null);
    expect(pendientes.map((m) => m.id)).toEqual([otra.id]);
    expect(() => resolverMarca(raiz, una.id, 'abc123')).toThrow(/ya está resuelta con #999/);
    expect(() => resolverMarca(raiz, otra.id, '  ')).toThrow(/pide con qué/);
  });

  it('un id que no existe o que no es un id lanza diciéndolo', () => {
    expect(listarMarcas(raiz)).toEqual([]);
    expect(() => leerMarca(raiz, '20261007-101112-s1-10-12')).toThrow(/no hay ninguna marca/);
    expect(() => leerMarca(raiz, '../../package')).toThrow(/no es un id de marca/);
  });

  it('el id lleva la hora en UTC con dos cifras', () => {
    expect(idDeMarca(new Date('2026-01-02T03:04:05Z'), 42, { x: 0, y: 33 })).toBe(
      '20260102-030405-s42-0-33',
    );
  });
});

describe('reproducir una marca', () => {
  it('el mapa que compone el taller con la semilla es el que juega el cliente', () => {
    // `pnpm marcas recorte` compone con `newGame({ seed })`; el cliente abre
    // `new Session(seed)`, que pasa controladores. Si eso cambiara el mapa, el
    // recorte del taller sería de otro sitio.
    for (const semilla of [1, 7, 15]) {
      const delCliente = new Session(semilla).state.map;
      const delTaller = newGame({ seed: semilla }).map;
      expect(delTaller.terrain).toEqual(delCliente.terrain);
      expect(delTaller.objects.map((o) => o.id)).toEqual(delCliente.objects.map((o) => o.id));
    }
  });
});
