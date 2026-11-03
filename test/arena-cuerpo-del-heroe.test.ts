/**
 * El cuerpo de todo héroe en la arena (03-11-2026, petición del usuario: «los
 * héroes son casi indestructibles… ¿cómo las puedo editar en la arena?»): PV,
 * fuerza y agilidad de `combate` en data/heroe.json se escriben en la ficha del
 * héroe, pelean ya, viajan en el enlace y «Guardar» los escribe sin tocar lo demás
 * del fichero.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  heroeDeArena,
  heroePorDefecto,
  type MontajeDelEnlace,
  montajeALaURL,
  montajeDeLaURL,
  piezasDelMontaje,
  validarHeroeDeArena,
} from '../src/core/arena.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { type CuerpoDeTodoHeroe, EQUIPO_ESCRITO, HEROE, RUTA_DEL_HEROE } from '../src/core/data.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/hero/equipo.js';
import {
  escribirCatalogo,
  guardarCatalogo,
  leerCatalogo,
  versionDelCatalogo,
} from '../tools/arena/borrador.js';
import { carpetaDeLaArena, catalogoEntero } from './helpers.js';

/** El de data/heroe.json con PV, fuerza y agilidad de un héroe más flojo. */
const FLOJO: CuerpoDeTodoHeroe = {
  ...HEROE.combate,
  pv: { ...HEROE.combate.pv, base: 100 },
  fuerza: { ...HEROE.combate.fuerza, base: 4 },
  agilidad: 3,
};

describe('el cuerpo de todo héroe en la arena', () => {
  it('el héroe que se pone lleva el de data/heroe.json, o el que se le dé, y pelea con él', () => {
    expect(heroePorDefecto('izquierda').cuerpo).toEqual(HEROE.combate);
    const flojo = heroeDeArena(heroePorDefecto('izquierda', FLOJO), EQUIPO_DEL_JUEGO);
    expect(flojo.desnudo.hp).toBe(100);
    expect(flojo.desnudo.fuerza).toBe(4);
    expect(flojo.desnudo.agilidad).toBe(3);
    expect(heroeDeArena(heroePorDefecto('izquierda'), EQUIPO_DEL_JUEGO).desnudo.hp).toBe(
      HEROE.combate.pv.base,
    );
  });

  it('con la regla de data/heroe.json: un PV de 0 no vale, y se dice', () => {
    const roto = {
      ...heroePorDefecto('izquierda'),
      cuerpo: { ...FLOJO, pv: { base: 0, porRango: 60 } },
    };
    expect(() => validarHeroeDeArena(roto)).toThrow('el héroe: su cuerpo: combate.pv.base');
  });

  const lado = (cuerpo: CuerpoDeTodoHeroe) => ({
    ia: false,
    puestos: [],
    heroe: heroePorDefecto('izquierda', cuerpo),
  });
  const enlace = (izq: CuerpoDeTodoHeroe, der: CuerpoDeTodoHeroe): MontajeDelEnlace => ({
    unidades: [],
    piezas: piezasDelMontaje([], true, EQUIPO_ESCRITO),
    izquierda: lado(izq),
    derecha: { ...lado(der), ia: true },
    muralla: null,
    combate: COMBATE_COMPLETO,
  });

  it('viaja en el enlace, y dos héroes con cuerpos distintos no los escribe la página', () => {
    const m = enlace(FLOJO, FLOJO);
    expect(montajeDeLaURL(montajeALaURL(m)).izquierda.heroe?.cuerpo).toEqual(FLOJO);
    expect(() =>
      montajeDeLaURL(JSON.stringify({ ...JSON.parse(montajeALaURL(m)), v: 17 })),
    ).toThrow('versión anterior');
    const distintos = JSON.stringify({
      ...JSON.parse(montajeALaURL(m)),
      derecha: JSON.parse(montajeALaURL(enlace(HEROE.combate, HEROE.combate))).derecha,
    });
    expect(() => montajeDeLaURL(distintos)).toThrow('cuerpos distintos');
  });
});

describe('«Guardar» escribe el cuerpo de todo héroe', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir !== null) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });
  const carpeta = (): string => {
    dir = carpetaDeLaArena('arena-heroe-');
    return dir;
  };
  const enDisco = (d: string): Record<string, unknown> =>
    JSON.parse(readFileSync(join(d, RUTA_DEL_HEROE), 'utf8'));

  it('solo su combate: la rendición, el equipo base y el comentario se quedan', () => {
    const d = carpeta();
    const antes = enDisco(d);
    expect(leerCatalogo(d).heroe).toEqual(HEROE.combate);
    const hecho = escribirCatalogo(d, {
      unidades: catalogoEntero(),
      piezas: EQUIPO_ESCRITO,
      heroe: FLOJO,
    });
    expect(hecho.heroe).toBe(true);
    expect(enDisco(d)).toEqual({ ...antes, combate: FLOJO });
    expect(leerCatalogo(d).heroe).toEqual(FLOJO);
    // Sin él (un guardado que no lo trae), data/heroe.json no se toca.
    const texto = readFileSync(join(d, RUTA_DEL_HEROE), 'utf8');
    expect(escribirCatalogo(d, { unidades: catalogoEntero(), piezas: EQUIPO_ESCRITO }).heroe).toBe(
      false,
    );
    expect(readFileSync(join(d, RUTA_DEL_HEROE), 'utf8')).toBe(texto);
  });

  it('uno que no vale no escribe nada, ni las unidades', () => {
    const d = carpeta();
    const antes = readFileSync(join(d, RUTA_DEL_HEROE), 'utf8');
    expect(() =>
      escribirCatalogo(d, {
        unidades: catalogoEntero(),
        piezas: EQUIPO_ESCRITO,
        heroe: { ...FLOJO, agilidad: 0 },
      }),
    ).toThrow('no se guarda el cuerpo del héroe: combate.agilidad');
    expect(readFileSync(join(d, RUTA_DEL_HEROE), 'utf8')).toBe(antes);
    expect(() => readFileSync(join(d, 'data/unidades.json'))).toThrow();
  });

  it('con data/heroe.json cambiado desde que se abrió la página, no se guarda', () => {
    const d = carpeta();
    const version = versionDelCatalogo(d);
    writeFileSync(join(d, RUTA_DEL_HEROE), JSON.stringify({ ...enDisco(d), combate: FLOJO }));
    expect(() =>
      guardarCatalogo(d, {
        unidades: catalogoEntero(),
        piezas: EQUIPO_ESCRITO,
        heroe: HEROE.combate,
        version,
      }),
    ).toThrow(`${RUTA_DEL_HEROE} ha cambiado desde que abriste esta página`);
  });
});
