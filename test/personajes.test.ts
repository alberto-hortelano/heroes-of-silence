/**
 * La tabla de figuras: toda figura tiene 8 direcciones y las 6 acciones —las
 * suyas o las del Y Bot de su juego de armas—. Una tropa del catálogo se pinta
 * con la hoja de su cuerpo; lo que no tiene hoja (el héroe, el personaje, la
 * gente de la base), con el juego de su fila, y lo demás cae al respaldo.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARTE_RPG } from '../src/client/render/assets.js';
import {
  arteDe,
  CUERPO_DE_VECINO,
  comoDireccion8d,
  JUEGO_SIN_HOJA,
  juegosDelYBot,
  registrarUnidad,
} from '../src/client/render/personajes.js';
import { HERO_BODY } from '../src/core/battle/types.js';
import { hojaDeUnidad, UNIDADES } from '../src/core/catalogo.js';
import { CHARACTER_BODY } from '../src/core/rpg/character.js';
import {
  CLIPS_DE_FIGURA,
  FILAS_DEL_ATLAS,
  hojaDeLaFila,
  JUEGO_POR_DEFECTO,
} from '../src/shared/arte.js';
import { hojasDeLaArena, TROPA } from './helpers.js';

const RAIZ = join(import.meta.dirname, '..');
/** Una URL del navegador (publicDir = assets/) a su fichero. */
const enDisco = (url: string): string => join(RAIZ, 'assets', url);
const leer = (r: string): unknown => JSON.parse(readFileSync(r, 'utf8'));

describe('las figuras a 25°, en 8 direcciones', () => {
  it('lo que se pinta sin hoja de unidad —el héroe, el personaje y la gente de la base— tiene su juego de armas, y solo ello', () => {
    expect(Object.keys(JUEGO_SIN_HOJA).sort()).toEqual(
      [HERO_BODY, CHARACTER_BODY, CUERPO_DE_VECINO].sort(),
    );
    expect(JUEGO_SIN_HOJA[HERO_BODY]).toBe('espada-escudo');
    expect(JUEGO_SIN_HOJA[CHARACTER_BODY]).toBe('espada-escudo');
    expect(JUEGO_SIN_HOJA[CUERPO_DE_VECINO]).toBe('civil');
  });

  it('todo cuerpo sin hoja es el Y Bot de su juego: 8 direcciones, 6 acciones, teñido', () => {
    for (const [cuerpo, juego] of Object.entries(JUEGO_SIN_HOJA)) {
      const arte = arteDe(cuerpo);
      expect(arte.propio, cuerpo).toBe(false);
      expect(arte.nombre, cuerpo).toBe(`el Y Bot «${juego}»`);
      expect(arte.direcciones).toHaveLength(8);
      for (const [n, d] of arte.direcciones.entries()) {
        for (const clip of CLIPS_DE_FIGURA) {
          expect(d.clips[clip].frames, `${cuerpo} d${n} ${clip}`).toBeGreaterThan(0);
          // Las filas 0-2 en `dN-a.png`, las 3-5 en `dN-b.png`, cada una en su fila de 3.
          const hoja = ['idle', 'walk', 'charge'].includes(clip) ? 'a' : 'b';
          expect(d.clips[clip].imagen).toBe(`/unidades/_poses/${juego}-8d/d${n}-${hoja}.png`);
          expect(d.clips[clip].row).toBeLessThan(3);
        }
        expect(d.cadaver.frame).toBeLessThan(d.clips.death.frames);
      }
    }
  });

  it('una tropa del catálogo se pinta con la hoja de su cuerpo, registrada al arrancar (19-10-2026)', () => {
    // El stack del juego lleva de `body` el id de su unidad; su arte es el de la
    // hoja del taller de la que nace (`cuerpo.hoja`), que la partida registra al
    // arrancar (`registrarLasHojas`). Antes de registrarla, el Y Bot por defecto.
    expect(arteDe(TROPA).nombre).toBe(`el Y Bot «${JUEGO_POR_DEFECTO}»`);
    for (const h of hojasDeLaArena()) if (h.incompleta === null) registrarUnidad(h.id, h);
    // El `body` de un stack es su hoja (`hojaDeUnidad`), y `arteDe` no busca en el
    // catálogo (simplify de F3-F6, 19-10-2026): con la hoja registrada, su arte.
    for (const u of UNIDADES) {
      expect(hojaDeUnidad(u.id), u.id).toBe(u.cuerpo.hoja);
      const hoja = hojasDeLaArena().find((h) => h.id === u.cuerpo.hoja);
      if (hoja === undefined || hoja.incompleta !== null) continue;
      expect(arteDe(hojaDeUnidad(u.id)).propio, u.id).toBe(hoja.direcciones !== null);
    }
    // Lo que no es una unidad del catálogo no tiene hoja: se dice.
    expect(() => hojaDeUnidad(HERO_BODY)).toThrow(/no hay ninguna unidad «hero»/);
  });

  it('el Y Bot del arco dispara con su clip `shoot`, en `dN-c.png`; quien golpea no lo trae', () => {
    const arco = registrarUnidad('arquero-sin-arte', { juego: 'arco', direcciones: null });
    expect(arco.dispara).toBe(true);
    for (const [n, d] of arco.direcciones.entries()) {
      expect(d.clips.shoot?.imagen, `d${n}`).toBe(`/unidades/_poses/arco-8d/d${n}-c.png`);
      expect(d.clips.shoot?.row).toBe(0);
      expect(d.clips.shoot?.suelta).toBe(4);
      // El ataque es la daga: cuerpo a cuerpo, sin suelta.
      expect(d.clips.attack.suelta).toBeUndefined();
    }
    expect(arco.imagenes).toContain('/unidades/_poses/arco-8d/d0-c.png');
    for (const juego of ['espada-escudo', 'lanza', 'montado-lanza', 'baston']) {
      expect(
        registrarUnidad(`golpea-con-${juego}`, { juego, direcciones: null }).dispara,
        juego,
      ).toBe(false);
    }
  });

  it('quien no pinta el disparo dispara con su ataque: su `shoot` es su `attack`, en las ocho direcciones', () => {
    for (const juego of ['espada-escudo', 'lanza', 'montado-lanza', 'baston']) {
      for (const [n, d] of registrarUnidad(`sin-disparo-${juego}`, {
        juego,
        direcciones: null,
      }).direcciones.entries()) {
        expect(d.clips.shoot, `${juego} d${n}`).toBe(d.clips.attack);
      }
    }
    // El de quien sí lo pinta es suyo, en su hoja.
    const arco = registrarUnidad('arquero-que-dispara', { juego: 'arco', direcciones: null });
    expect(arco.direcciones[0]?.clips.shoot).not.toBe(arco.direcciones[0]?.clips.attack);
  });

  it('un cuerpo sin fila ni hoja cae al Y Bot de espada y escudo', () => {
    expect(arteDe('un-cuerpo-inventado')).toBe(arteDe(HERO_BODY));
    expect(JUEGO_POR_DEFECTO).toBe('espada-escudo');
  });

  it('cada imagen de cada figura existe en `assets/`', () => {
    // Los trece juegos del Y Bot: todos tienen poses, aunque la tabla no los use
    // todos; `civil` es el de la gente de la base (`CUERPO_DE_VECINO`).
    expect([...juegosDelYBot()].sort()).toEqual([
      'arco',
      'ballesta',
      'baston',
      'civil',
      'dos-manos',
      'espada-escudo',
      'granada',
      'lanza',
      'mayal',
      'maza',
      'montado-arco',
      'montado-lanza',
      'montado-pistola',
    ]);
    for (const cuerpo of Object.keys(JUEGO_SIN_HOJA)) {
      for (const url of arteDe(cuerpo).imagenes) expect(existsSync(enDisco(url)), url).toBe(true);
    }
    for (const [nombre, url] of Object.entries(ARTE_RPG)) {
      expect(existsSync(enDisco(url)), nombre).toBe(true);
    }
  });

  it('la gente de la base va con el Y Bot sin armas, no con el de su unidad', () => {
    const vecino = arteDe(CUERPO_DE_VECINO);
    expect(vecino.nombre).toBe('el Y Bot «civil»');
    expect(vecino.imagenes.every((u) => u.startsWith('/unidades/_poses/civil-8d/'))).toBe(true);
    // Un cuerpo sin hoja más: una hoja de unidad no lo sustituye.
    expect(() => registrarUnidad(CUERPO_DE_VECINO, { juego: 'civil', direcciones: null })).toThrow(
      /es un cuerpo del juego/,
    );
  });

  it('una unidad con sus ocho `dN` es arte propio y lee cada dirección de su `atlas.webp`', () => {
    const id = 'templario-escudo';
    const dirs = Array.from({ length: 8 }, (_, d) =>
      leer(join(RAIZ, 'assets/unidades', id, `d${d}`, 'atlas.json')),
    );
    const arte = registrarUnidad(id, { juego: 'espada-escudo', direcciones: dirs });
    expect(arte.propio).toBe(true);
    expect(arteDe(id)).toBe(arte);
    expect(arte.direcciones[3]?.clips.death.imagen).toBe(`/unidades/${id}/d3/atlas.webp`);
    expect(arte.direcciones[3]?.clips.death.row).toBe(5);
    for (const url of arte.imagenes) expect(existsSync(enDisco(url)), url).toBe(true);
  });

  it('una unidad sin `dN` lleva el Y Bot de su juego', () => {
    const arte = registrarUnidad('zombi-de-prueba', { juego: 'baston', direcciones: null });
    expect(arte.nombre).toBe('el Y Bot «baston»');
    expect(arteDe('zombi-de-prueba')).toBe(arte);
  });

  it('registrar se niega diciéndolo: un juego sin poses, siete direcciones o un cuerpo del juego', () => {
    expect(() => registrarUnidad('x', { juego: 'honda', direcciones: null })).toThrow(
      /«honda» no tiene poses en 8 direcciones/,
    );
    const siete = Array.from({ length: 7 }, (_, d) =>
      leer(join(RAIZ, 'assets/unidades/templario-escudo', `d${d}`, 'atlas.json')),
    );
    expect(() => registrarUnidad('x', { juego: 'espada-escudo', direcciones: siete })).toThrow(
      /trae 7 direcciones/,
    );
    expect(() => registrarUnidad(HERO_BODY, { juego: 'lanza', direcciones: null })).toThrow(
      /es un cuerpo del juego/,
    );
  });

  it('un atlas sin ancla o sin cadáver se rechaza diciéndolo', () => {
    const fila = (row: number) => ({ imagen: 'x', row });
    expect(() =>
      comoDireccion8d(
        { cell: 384, columns: 7, altura: 150, clips: { idle: { frames: 7 } } },
        'roto',
        fila,
      ),
    ).toThrow(/el atlas roto no tiene un clip "idle"/);
    const bueno = leer(join(RAIZ, 'assets/unidades/templario-escudo/d0/atlas.json')) as Record<
      string,
      unknown
    >;
    expect(() => comoDireccion8d({ ...bueno, cadaver: undefined }, 'sin-cadaver', fila)).toThrow(
      /qué fotograma de la muerte es el cadáver/,
    );
  });

  it('la suelta se lee del disparo; en el ataque, fuera de la hoja o sin ella, se rechaza', () => {
    const fila = (row: number) => ({ imagen: 'x', row });
    const bueno = leer(join(RAIZ, 'assets/unidades/templario-escudo/d0/atlas.json')) as {
      clips: Record<string, Record<string, unknown>>;
    };
    // Un disparo de 7 columnas en la fila 6, hecho del ataque del templario.
    const disparo = { ...bueno.clips.attack, row: 6, frames: 7 };
    const con = (clip: string, suelta: unknown) =>
      comoDireccion8d(
        {
          ...bueno,
          clips: {
            ...bueno.clips,
            shoot: disparo,
            [clip]: { ...bueno.clips[clip], ...disparo, suelta },
          },
        },
        'tiro',
        fila,
      );
    expect(con('shoot', 4).clips.shoot?.suelta).toBe(4);
    // Un atlas sin disparo es válido: es el de quien golpea, y el pintado antes de la hoja C.
    expect(comoDireccion8d(bueno, 'sin-tiro', fila).clips.shoot).toBeUndefined();
    expect(() => con('attack', 4)).toThrow(/suelta del clip "attack".*solo el disparo/);
    expect(() => con('shoot', undefined)).toThrow(/tiene disparo y no dice en qué columna suelta/);
    for (const mala of [0, 7, 2.5]) {
      expect(() => con('shoot', mala), String(mala)).toThrow(/entre la 1 y la 6/);
    }
  });

  it('cada fila del atlas sabe en qué hoja se pinta, y fuera del atlas no hay hoja', () => {
    expect(FILAS_DEL_ATLAS.map((_, f) => hojaDeLaFila(f))).toEqual([
      { hoja: 'a', fila: 0 },
      { hoja: 'a', fila: 1 },
      { hoja: 'a', fila: 2 },
      { hoja: 'b', fila: 0 },
      { hoja: 'b', fila: 1 },
      { hoja: 'b', fila: 2 },
      { hoja: 'c', fila: 0 },
    ]);
    for (const mala of [-1, 7, 2.5])
      expect(() => hojaDeLaFila(mala)).toThrow(/no está en el atlas/);
  });

  it('el disparo va en las ocho direcciones o en ninguna', () => {
    const dirs = Array.from({ length: 8 }, (_, d) => {
      const a = leer(join(RAIZ, 'assets/unidades/templario-escudo', `d${d}`, 'atlas.json')) as {
        clips: Record<string, unknown>;
      };
      const shoot = { ...(a.clips.attack as object), row: 6, frames: 7, suelta: 4 };
      return d === 3 ? a : { ...a, clips: { ...a.clips, shoot } };
    });
    expect(() => registrarUnidad('tirador-a-medias', { juego: 'arco', direcciones: dirs })).toThrow(
      /trae el disparo en 7 de sus 8 direcciones \(le falta en d3\)/,
    );
  });
});
