/**
 * La tabla de figuras: cada cuerpo con atlas propio existe en el catálogo, y cada
 * hoja tiene los tres clips. Un cuerpo mal escrito no rompería nada —caería al
 * maniquí en silencio—, y por eso se mira aquí.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARTE_RPG } from '../src/client/render/assets.js';
import {
  ARTE_POR_CUERPO,
  arteDe,
  comoAtlas,
  HOJAS_DE_FIGURA,
  hojaPara,
  MANIQUI,
} from '../src/client/render/personajes.js';
import { allCreatures } from '../src/core/data.js';
import { CHARACTER_BODY } from '../src/core/rpg/character.js';

describe('las figuras a 25°', () => {
  it('cada cuerpo de la tabla es una criatura del catálogo o el personaje', () => {
    const ids = new Set(allCreatures().map((c) => c.id));
    for (const body of Object.keys(ARTE_POR_CUERPO)) {
      expect(body === CHARACTER_BODY || ids.has(body), body).toBe(true);
    }
  });

  it('cada hoja tiene reposo, marcha y ataque, y cuenta como hoja de figura', () => {
    for (const arte of [...Object.values(ARTE_POR_CUERPO), arteDe('skeleton')]) {
      for (const clip of ['idle', 'walk', 'attack'] as const) {
        const hoja = hojaPara(arte, clip);
        expect(hoja.atlas.clips[clip].frames).toBeGreaterThan(0);
        expect(HOJAS_DE_FIGURA).toContain(hoja.imagen);
      }
    }
  });

  it('todo el arte de la tabla existe en `assets/`', () => {
    for (const [nombre, url] of Object.entries(ARTE_RPG)) {
      // La URL es del navegador (publicDir = assets/): debajo de `assets/` tiene que estar el fichero.
      expect(() => readFileSync(new URL(`../assets${url}`, import.meta.url)), nombre).not.toThrow();
    }
  });

  it('lo que no tiene atlas propio es el maniquí, y se tiñe', () => {
    for (const c of allCreatures()) {
      const arte = arteDe(c.id);
      if (ARTE_POR_CUERPO[c.id] === undefined) {
        expect(arte.base).toBe(MANIQUI);
        expect(arte.propio).toBe(false);
      } else {
        expect(arte.propio).toBe(true);
      }
    }
  });

  it('un atlas sin ancla se rechaza diciéndolo', () => {
    expect(() =>
      comoAtlas({ cell: 256, columns: 7, clips: { idle: { frames: 7 } } }, 'roto'),
    ).toThrow(/el atlas roto no tiene un clip "idle"/);
  });
});
