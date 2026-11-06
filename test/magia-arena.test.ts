/**
 * El editor de magia de la arena (06-11-2026): lo que hace con un hechizo
 * (`core/magia/editar.ts`), cómo pelea la arena con hechizos sin guardar (el libro
 * de la batalla, el retoque a media pelea, el enlace) y «Guardar», que los escribe
 * en `data/hechizos.json` con la regla de la carga del juego.
 */
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  batallaDeArena,
  catalogoDelMontaje,
  type HeroeDeArena,
  heroePorDefecto,
  type MontajeDelEnlace,
  montajeALaURL,
  montajeDeLaURL,
  piezasDelMontaje,
  retocarEnBatalla,
} from '../src/core/arena.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { EQUIPO_ESCRITO } from '../src/core/equipo/pieza.js';
import { EQUIPO_BASE, EQUIPO_DEL_JUEGO } from '../src/core/hero/equipo.js';
import { catalogoDeHechizos, hechizo, todosLosHechizos } from '../src/core/magia/catalogo.js';
import {
  campoDe,
  conCampo,
  conEfecto,
  conEntrega,
  copiaDe,
  hechizoNuevo,
} from '../src/core/magia/editar.js';
import { problemasDelHechizo } from '../src/core/magia/validar.js';
import { createRng } from '../src/core/rng.js';
import { escribirCatalogo, leerCatalogo } from '../tools/arena/borrador.js';
import { carpetaDeLaArena, catalogoEntero } from './pelea-de-arena.js';

describe('editar un hechizo (core/magia/editar.ts)', () => {
  it('uno nuevo vale, y su copia lleva otro id y otro nombre', () => {
    const lista = todosLosHechizos();
    const h = hechizoNuevo(lista);
    expect(problemasDelHechizo(h)).toEqual([]);
    const c = copiaDe(h, [...lista, h]);
    expect(c.id).not.toBe(h.id);
    expect(c.nombre).not.toBe(h.nombre);
    expect(problemasDelHechizo(c)).toEqual([]);
  });

  it('un campo por su ruta, también dentro de un disparador; undefined lo quita', () => {
    const zombi = hechizo('zombi_pegajoso');
    const otro = conCampo(zombi, 'efectos.0.efectos.0.que', ['moverse']);
    expect(campoDe(otro, 'efectos.0.efectos.0.que')).toEqual(['moverse']);
    // El de antes no se toca.
    expect(campoDe(zombi, 'efectos.0.efectos.0.que')).toEqual(['golpear', 'disparar']);
    expect(conCampo(zombi, 'efectos.0', undefined).efectos).toEqual([]);
  });

  it('añadir lo que dura le pone duración, y la entrega trae lo que pide', () => {
    const h = conEfecto(hechizoNuevo([]), 'efectos', 'cifra');
    expect(h.duracion).toEqual({ rondas: 2 });
    expect(problemasDelHechizo(h)).toEqual([]);
    const sobreSi = conEntrega(h, 'sobreSi');
    expect(sobreSi.objetivo).toBeUndefined();
    expect(problemasDelHechizo(sobreSi)).toEqual([]);
    const proyectil = conEntrega(h, 'proyectil');
    expect(proyectil).toMatchObject({ objetivo: 'casilla', afecta: 'enemigos' });
    expect(problemasDelHechizo(proyectil)).toEqual([]);
  });
});

/** Un hechizo de la página, sin guardar: un rayo de 7 a un enemigo. */
const NUEVO = {
  ...hechizoNuevo(todosLosHechizos()),
  id: 'rayito',
  nombre: 'Rayito',
  efectos: [{ tipo: 'danio', cantidad: 7, armadura: false }] as const,
};

function conRayito(): HeroeDeArena {
  return { ...heroePorDefecto('izquierda'), hechizos: ['rayito'] };
}

describe('la arena pelea con los hechizos de la página', () => {
  const cat = catalogoDeHechizos([...todosLosHechizos(), NUEVO]);
  const montaje = {
    izquierda: { unidades: [], heroe: conRayito() },
    derecha: { unidades: [], heroe: heroePorDefecto('derecha') },
    combate: COMBATE_COMPLETO,
    equipo: EQUIPO_DEL_JUEGO,
    hechizos: cat,
  };

  it('el libro de la batalla lleva el hechizo sin guardar', () => {
    const b = batallaDeArena(montaje, createRng(1));
    expect(b.libro.rayito?.nombre).toBe('Rayito');
  });

  it('a media pelea, cambiarlo cambia el libro; quitar uno que se usa, no', () => {
    const b = batallaDeArena(montaje, createRng(1));
    const catalogo = catalogoDelMontaje(montaje);
    const otro = { ...NUEVO, nombre: 'Rayazo' };
    expect(
      retocarEnBatalla(
        b,
        { kind: 'hechizos', hechizos: catalogoDeHechizos([...todosLosHechizos(), otro]) },
        catalogo,
      ),
    ).toBeNull();
    expect(b.libro.rayito?.nombre).toBe('Rayazo');
    expect(b.log.at(-1)).toMatchObject({ kind: 'retoque', cambios: ['hechizo: Rayazo'] });
    expect(
      retocarEnBatalla(
        b,
        { kind: 'hechizos', hechizos: catalogoDeHechizos(todosLosHechizos()) },
        catalogo,
      ),
    ).toMatch(/lo lleva alguien de la pelea/);
  });

  it('el enlace lleva los hechizos que usa lo montado, y ni uno más ni uno menos', () => {
    const m: MontajeDelEnlace = {
      unidades: [],
      piezas: piezasDelMontaje([], [EQUIPO_BASE], EQUIPO_ESCRITO),
      hechizos: [NUEVO],
      izquierda: { ia: false, puestos: [], heroe: conRayito() },
      derecha: { ia: true, puestos: [], heroe: null },
      muralla: null,
      combate: COMBATE_COMPLETO,
    };
    expect(montajeDeLaURL(montajeALaURL(m)).hechizos).toEqual([NUEVO]);
    expect(() => montajeDeLaURL(montajeALaURL({ ...m, hechizos: [] }))).toThrow(
      /usa el hechizo «rayito» y no lo trae/,
    );
    expect(() =>
      montajeDeLaURL(montajeALaURL({ ...m, hechizos: [NUEVO, hechizo('haste')] })),
    ).toThrow(/trae el hechizo «Prisa» y no lo usa nadie/);
  });
});

describe('«Guardar» escribe data/hechizos.json', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir !== null) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it('con los nuevos, y lee lo que escribió', () => {
    dir = carpetaDeLaArena('arena-magia-');
    const hechizos = [...todosLosHechizos(), NUEVO];
    const hecho = escribirCatalogo(dir, {
      unidades: catalogoEntero(),
      piezas: EQUIPO_ESCRITO,
      hechizos,
    });
    expect(hecho.hechizos).toBe(hechizos.length);
    expect(leerCatalogo(dir).hechizos.map((h) => h.id)).toContain('rayito');
    const json = JSON.parse(readFileSync(join(dir, 'data/hechizos.json'), 'utf8'));
    expect(typeof json._comment).toBe('string');
  });

  it('uno que no vale no escribe nada', () => {
    dir = carpetaDeLaArena('arena-magia-');
    const antes = readFileSync(join(dir, 'data/hechizos.json'), 'utf8');
    expect(() =>
      escribirCatalogo(dir as string, {
        unidades: catalogoEntero(),
        piezas: EQUIPO_ESCRITO,
        hechizos: [...todosLosHechizos(), { ...NUEVO, mana: -1 }],
      }),
    ).toThrow(/no se guarda la magia:[\s\S]*el maná/);
    expect(readFileSync(join(dir, 'data/hechizos.json'), 'utf8')).toBe(antes);
  });

  it('sin el hechizo que una unidad usa como poder, no se guarda', () => {
    dir = carpetaDeLaArena('arena-magia-');
    expect(() =>
      escribirCatalogo(dir as string, {
        unidades: catalogoEntero(),
        piezas: EQUIPO_ESCRITO,
        hechizos: todosLosHechizos().filter((h) => h.id !== 'curar'),
      }),
    ).toThrow(/usa el hechizo «curar», que no existe/);
  });
});
