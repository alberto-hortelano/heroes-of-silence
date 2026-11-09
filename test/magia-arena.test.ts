/**
 * El editor de magia de la arena (06-11-2026): lo que hace con un hechizo
 * (`core/magia/editar.ts`), cómo pelea la arena con hechizos sin guardar (el libro
 * de la batalla, el retoque a media pelea, el enlace) y «Guardar», que los escribe
 * en `data/hechizos.json` con la regla de la carga del juego.
 */
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type MontajeDelEnlace, montajeALaURL, montajeDeLaURL } from '../src/core/arena/enlace.js';
import { type HeroeDeArena, heroePorDefecto } from '../src/core/arena/heroe.js';
import { batallaDeArena, catalogoDelMontaje } from '../src/core/arena/montaje.js';
import { piezasDelMontaje } from '../src/core/arena/piezas.js';
import { retocarEnBatalla } from '../src/core/arena/retoque.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/equipo/atado.js';
import { EQUIPO_ESCRITO } from '../src/core/equipo/pieza.js';
import { EQUIPO_BASE } from '../src/core/hero/cuerpo-del-heroe.js';
import { catalogoDeHechizos, hechizo, todosLosHechizos } from '../src/core/magia/catalogo.js';
import {
  campoDe,
  conCampo,
  conEfecto,
  conEntrega,
  conFaccion,
  copiaDe,
  hechizoNuevo,
} from '../src/core/magia/editar.js';
import { problemasDelHechizo } from '../src/core/magia/validar.js';
import { createRng } from '../src/core/rng.js';
import { FACTION_IDS } from '../src/core/types.js';
import type { Unidad } from '../src/core/unidad/formato.js';
import { escribirCatalogo, leerCatalogo } from '../tools/arena/borrador.js';
import {
  carpetaDeLaArena,
  catalogoEntero,
  delBorrador,
  unidadDeArena as unidad,
} from './pelea-de-arena.js';

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

  it('uno nuevo nace de las cinco facciones, y la copia conserva las suyas (08-11-2026)', () => {
    const lista = todosLosHechizos();
    expect(hechizoNuevo(lista).facciones).toEqual(FACTION_IDS);
    const copia = copiaDe(hechizo('curar'), lista);
    expect(copia.facciones).toEqual(['templarios']);
    expect(problemasDelHechizo(copia)).toEqual([]);
  });

  it('marcar y desmarcar una facción: en su orden, puede vaciarse y no mueve la clave', () => {
    const h = hechizo('haste');
    const sinElfos = conFaccion(h, 'elfos', false);
    expect(sinElfos.facciones).toEqual(['templarios', 'no-muertos', 'imperio', 'orkos']);
    // Volver a marcarla la pone en su sitio, no al final: el mismo JSON, sin «•» falso.
    expect(JSON.stringify(conFaccion(sinElfos, 'elfos', true))).toBe(JSON.stringify(h));
    // Marcada dos veces no se repite.
    expect(conFaccion(h, 'orkos', true).facciones).toEqual(FACTION_IDS);
    // Vaciarla se deja (el editor pasa por estados a medias) y lo dice la validación.
    const vacia = FACTION_IDS.reduce((x, f) => conFaccion(x, f, false), h);
    expect(vacia.facciones).toEqual([]);
    expect(problemasDelHechizo(vacia)).toEqual([
      '«Prisa»: facciones está vacía: un hechizo es de una facción o de varias',
    ]);
    // Desde vacía, lo que se marca, en el orden de FACTION_IDS y no en el de los clics.
    const dos = conFaccion(conFaccion(vacia, 'orkos', true), 'templarios', true);
    expect(dos.facciones).toEqual(['templarios', 'orkos']);
    expect(Object.keys(dos)).toEqual(Object.keys(h));
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
    // Un hechizo sin facciones (los de la versión 21) no entra en silencio.
    const { facciones: _fuera, ...sinFacciones } = NUEVO;
    expect(() =>
      montajeDeLaURL(montajeALaURL({ ...m, hechizos: [sinFacciones as typeof NUEVO] })),
    ).toThrow(/falta «facciones»/);
  });
});

describe('levantar en el editor y en la arena (08-11-2026, «Levantar zombi»)', () => {
  it('el editor pone el efecto «levantar», y con el objetivo «cadaver» vale', () => {
    const h = conEfecto(conCampo(hechizoNuevo([]), 'efectos', []), 'efectos', 'levantar');
    expect(h.efectos).toEqual([
      { tipo: 'levantar', vivos: 'zombi', de: { zombi: 'esqueleto-guerrero' } },
    ]);
    // Instantáneo: no le pone duración.
    expect(h.duracion).toBeUndefined();
    // Sin el objetivo, la ficha dice qué falta.
    expect(problemasDelHechizo(h)).toContain(
      '«Hechizo nuevo»: «levantar» solo va con el objetivo «cadaver»: se levanta de un cadáver',
    );
    expect(problemasDelHechizo(conCampo(h, 'objetivo', 'cadaver'))).toEqual([]);
    // `de` por su ruta, como cualquier campo; vacío se quita.
    expect(campoDe(conCampo(h, 'efectos.0.de', undefined), 'efectos.0')).toEqual({
      tipo: 'levantar',
      vivos: 'zombi',
    });
  });

  /** Un héroe de la izquierda que sabe levantar, contra dos unidades de la derecha. */
  const LEVANTA = { ...heroePorDefecto('izquierda'), hechizos: ['levantar_zombi'] };
  const conZombi = (zombi: Unidad | null) => ({
    izquierda: { unidades: [delBorrador(unidad('templario-escudo'))], heroe: LEVANTA },
    derecha: {
      unidades: [
        delBorrador(unidad('templario-escudo')),
        ...(zombi === null ? [] : [delBorrador(zombi)]),
      ],
      heroe: null,
    },
    combate: COMBATE_COMPLETO,
    equipo: EQUIPO_DEL_JUEGO,
  });

  it('lo que se levanta y no pelea sale del catálogo del juego; si pelea, con las cifras de la página', () => {
    const sinZombi = batallaDeArena(conZombi(null), createRng(1));
    expect(sinZombi.levantables.attacker.zombi?.unit.hp).toBe(unidad('zombi').hp);
    const fuerte = unidad('zombi', { hp: 300 });
    const b = batallaDeArena(conZombi(fuerte), createRng(1));
    expect(b.levantables.attacker.zombi?.unit.hp).toBe(300);
    // Retocado a media pelea, se levanta con lo nuevo.
    const catalogo = catalogoDelMontaje(conZombi(fuerte));
    expect(
      retocarEnBatalla(
        b,
        { kind: 'tipo', fuente: delBorrador(unidad('zombi', { hp: 200 })) },
        catalogo,
      ),
    ).toBeNull();
    expect(b.levantables.attacker.zombi?.unit.hp).toBe(200);
    // La derecha no levanta nada: no lo resuelve (su catálogo podría no tenerlo).
    expect(b.levantables.defender).toEqual({});
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

  it('las facciones van al disco y vuelven; vacías no se guardan (08-11-2026)', () => {
    dir = carpetaDeLaArena('arena-magia-');
    const conElfos = todosLosHechizos().map((h) =>
      h.id === 'haste' ? { ...h, facciones: ['elfos'] as const } : h,
    );
    escribirCatalogo(dir, {
      unidades: catalogoEntero(),
      piezas: EQUIPO_ESCRITO,
      hechizos: conElfos,
    });
    expect(leerCatalogo(dir).hechizos.find((h) => h.id === 'haste')?.facciones).toEqual(['elfos']);

    const antes = readFileSync(join(dir, 'data/hechizos.json'), 'utf8');
    expect(() =>
      escribirCatalogo(dir as string, {
        unidades: catalogoEntero(),
        piezas: EQUIPO_ESCRITO,
        hechizos: todosLosHechizos().map((h) => (h.id === 'haste' ? { ...h, facciones: [] } : h)),
      }),
    ).toThrow(/no se guarda la magia:[\s\S]*facciones está vacía/);
    expect(readFileSync(join(dir, 'data/hechizos.json'), 'utf8')).toBe(antes);
  });

  it('Curar sin los templarios no se guarda: es el poder del monje', () => {
    dir = carpetaDeLaArena('arena-magia-');
    const antes = readFileSync(join(dir, 'data/hechizos.json'), 'utf8');
    expect(() =>
      escribirCatalogo(dir as string, {
        unidades: catalogoEntero(),
        piezas: EQUIPO_ESCRITO,
        // De los elfos y no de los templarios: vale como hechizo, pero ya no como poder del monje.
        hechizos: todosLosHechizos().map((h) =>
          h.id === 'curar' ? conFaccion(conFaccion(h, 'elfos', true), 'templarios', false) : h,
        ),
      }),
    ).toThrow(/«Curar» no es de su facción \(Templarios\): es de Elfos/);
    expect(readFileSync(join(dir, 'data/hechizos.json'), 'utf8')).toBe(antes);
  });

  it('levantar una unidad que no existe no se guarda (08-11-2026)', () => {
    dir = carpetaDeLaArena('arena-magia-');
    const antes = readFileSync(join(dir, 'data/hechizos.json'), 'utf8');
    expect(() =>
      escribirCatalogo(dir as string, {
        unidades: catalogoEntero(),
        piezas: EQUIPO_ESCRITO,
        hechizos: todosLosHechizos().map((h) =>
          h.id === 'levantar_zombi' ? conCampo(h, 'efectos.0.vivos', 'momia') : h,
        ),
      }),
    ).toThrow(/«Levantar zombi» nombra «momia», que no es ninguna unidad/);
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
