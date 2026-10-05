/**
 * La tabla de figuras: toda figura tiene 8 direcciones y las 6 acciones —las
 * suyas o las del Y Bot de su juego de armas— y cada cuerpo del catálogo tiene
 * su juego. Una criatura nueva sin fila caería al respaldo sin que nadie lo
 * decidiera, y por eso se mira aquí.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARTE_RPG } from '../src/client/render/assets.js';
import {
  arteDe,
  comoDireccion8d,
  JUEGO_DEL_CUERPO,
  juegosDelYBot,
  registrarUnidad,
} from '../src/client/render/personajes.js';
import { allCreatures } from '../src/core/data.js';
import { HERO_BODY } from '../src/core/hero/hero.js';
import { CHARACTER_BODY } from '../src/core/rpg/character.js';
import {
  CLIPS_DE_FIGURA,
  FILAS_DEL_ATLAS,
  hojaDeLaFila,
  JUEGO_POR_DEFECTO,
} from '../src/shared/arte.js';

const RAIZ = join(import.meta.dirname, '..');
/** Una URL del navegador (publicDir = assets/) a su fichero. */
const enDisco = (url: string): string => join(RAIZ, 'assets', url);
const leer = (r: string): unknown => JSON.parse(readFileSync(r, 'utf8'));

describe('las figuras a 25°, en 8 direcciones', () => {
  it('cada criatura del catálogo, el héroe y el personaje tienen su juego de armas, y solo ellos', () => {
    const ids = allCreatures().map((c) => c.id);
    expect(Object.keys(JUEGO_DEL_CUERPO).sort()).toEqual(
      [...ids, HERO_BODY, CHARACTER_BODY].sort(),
    );
  });

  it('la tabla del usuario: piquero con lanza, caballería montada, mago con bastón, arquero con arco, el resto con espada y escudo', () => {
    expect(JUEGO_DEL_CUERPO.pikeman).toBe('lanza');
    expect(JUEGO_DEL_CUERPO.veteran_pikeman).toBe('lanza');
    expect(JUEGO_DEL_CUERPO.cavalry).toBe('montado-lanza');
    expect(JUEGO_DEL_CUERPO.champion).toBe('montado-lanza');
    expect(JUEGO_DEL_CUERPO.lich).toBe('baston');
    expect(JUEGO_DEL_CUERPO.power_lich).toBe('baston');
    expect(JUEGO_DEL_CUERPO.archer).toBe('arco');
    expect(JUEGO_DEL_CUERPO.ranger).toBe('arco');
    expect(JUEGO_DEL_CUERPO.skeleton).toBe('espada-escudo');
    expect(JUEGO_DEL_CUERPO[HERO_BODY]).toBe('espada-escudo');
  });

  it('todo cuerpo del juego es el Y Bot de su juego: 8 direcciones, 6 acciones, teñido', () => {
    for (const [cuerpo, juego] of Object.entries(JUEGO_DEL_CUERPO)) {
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

  it('el arquero dispara con su clip `shoot`, en `dN-c.png`; quien golpea no lo trae', () => {
    for (const cuerpo of ['archer', 'ranger']) {
      const arte = arteDe(cuerpo);
      expect(arte.dispara, cuerpo).toBe(true);
      for (const [n, d] of arte.direcciones.entries()) {
        expect(d.clips.shoot?.imagen, `${cuerpo} d${n}`).toBe(
          `/unidades/_poses/arco-8d/d${n}-c.png`,
        );
        expect(d.clips.shoot?.row).toBe(0);
        expect(d.clips.shoot?.suelta).toBe(4);
        // El ataque es la daga: cuerpo a cuerpo, sin suelta.
        expect(d.clips.attack.suelta).toBeUndefined();
      }
      expect(arte.imagenes).toContain('/unidades/_poses/arco-8d/d0-c.png');
    }
    for (const cuerpo of ['peasant', 'pikeman', 'cavalry', 'lich']) {
      expect(arteDe(cuerpo).dispara, cuerpo).toBe(false);
    }
  });

  it('quien no pinta el disparo dispara con su ataque: su `shoot` es su `attack`, en las ocho direcciones', () => {
    for (const cuerpo of ['peasant', 'pikeman', 'cavalry', 'lich', 'power_lich']) {
      for (const [n, d] of arteDe(cuerpo).direcciones.entries()) {
        expect(d.clips.shoot, `${cuerpo} d${n}`).toBe(d.clips.attack);
      }
    }
    // El de quien sí lo pinta es suyo, en su hoja.
    expect(arteDe('archer').direcciones[0]?.clips.shoot).not.toBe(
      arteDe('archer').direcciones[0]?.clips.attack,
    );
  });

  it('un cuerpo sin fila cae al Y Bot de espada y escudo', () => {
    expect(arteDe('un-cuerpo-inventado')).toBe(arteDe(JUEGO_DEL_CUERPO.peasant as string));
    expect(JUEGO_POR_DEFECTO).toBe('espada-escudo');
  });

  it('cada imagen de cada figura existe en `assets/`', () => {
    // Los doce juegos del Y Bot: todos tienen poses, aunque la tabla no los use todos.
    expect([...juegosDelYBot()].sort()).toEqual([
      'arco',
      'ballesta',
      'baston',
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
    for (const cuerpo of Object.keys(JUEGO_DEL_CUERPO)) {
      for (const url of arteDe(cuerpo).imagenes) expect(existsSync(enDisco(url)), url).toBe(true);
    }
    for (const [nombre, url] of Object.entries(ARTE_RPG)) {
      expect(existsSync(enDisco(url)), nombre).toBe(true);
    }
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
    expect(registrarUnidad('zombi-de-prueba', { juego: 'baston', direcciones: null })).toBe(
      arteDe('lich'),
    );
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
    expect(() => registrarUnidad('pikeman', { juego: 'lanza', direcciones: null })).toThrow(
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
