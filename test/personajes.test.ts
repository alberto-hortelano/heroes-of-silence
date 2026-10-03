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
import { CLIPS_DE_FIGURA, JUEGO_POR_DEFECTO } from '../src/shared/arte.js';

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

  it('la tabla del usuario: piquero con lanza, caballería montada, mago con bastón, el resto con espada y escudo', () => {
    expect(JUEGO_DEL_CUERPO.pikeman).toBe('lanza');
    expect(JUEGO_DEL_CUERPO.veteran_pikeman).toBe('lanza');
    expect(JUEGO_DEL_CUERPO.cavalry).toBe('montado-lanza');
    expect(JUEGO_DEL_CUERPO.champion).toBe('montado-lanza');
    expect(JUEGO_DEL_CUERPO.lich).toBe('baston');
    expect(JUEGO_DEL_CUERPO.power_lich).toBe('baston');
    // Sin render de arco en 8 direcciones, el arquero va con espada y escudo.
    expect(JUEGO_DEL_CUERPO.archer).toBe('espada-escudo');
    expect(JUEGO_DEL_CUERPO.skeleton).toBe('espada-escudo');
    expect(JUEGO_DEL_CUERPO[HERO_BODY]).toBe('espada-escudo');
  });

  it('todo cuerpo del juego es el Y Bot de su juego: 8 direcciones, 6 acciones, teñido', () => {
    for (const [cuerpo, juego] of Object.entries(JUEGO_DEL_CUERPO)) {
      const arte = arteDe(cuerpo);
      expect(arte.propio, cuerpo).toBe(false);
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

  it('un cuerpo sin fila cae al Y Bot de espada y escudo', () => {
    expect(arteDe('un-cuerpo-inventado')).toBe(arteDe(JUEGO_DEL_CUERPO.peasant as string));
    expect(JUEGO_POR_DEFECTO).toBe('espada-escudo');
  });

  it('cada imagen de cada figura existe en `assets/`', () => {
    // Los siete juegos del Y Bot: todos tienen poses, aunque la tabla no los use todos.
    expect([...juegosDelYBot()].sort()).toEqual([
      'baston',
      'dos-manos',
      'espada-escudo',
      'lanza',
      'mayal',
      'maza',
      'montado-lanza',
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
    expect(() => registrarUnidad('x', { juego: 'arco', direcciones: null })).toThrow(
      /«arco» no tiene poses en 8 direcciones/,
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
});
