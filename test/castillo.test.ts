/**
 * Los sitios de la base (`core/town/sitios.ts`): qué se levanta en cada uno.
 *
 * No se prueba el dibujo —eso se mira en el navegador—, sino la única regla que
 * la escena no puede inventarse: dónde va cada edificio. Las cadenas se DERIVAN
 * del catálogo, así que lo que se comprueba aquí es que siguen derivándose y no
 * vuelven a escribirse a mano. Vivía contra `townPlots`, del cliente, hasta que
 * la base se hizo escena (#base-caminable) y la cadena bajó al núcleo.
 */
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/state/setup.js';
import { allBuildings, buildingsOfFaction } from '../src/core/town/buildings.js';
import {
  construidoEn,
  SITIOS,
  siguienteDe,
  sitioDeEdificio,
  sitiosConstruidos,
  sitiosDeLaBase,
} from '../src/core/town/sitios.js';

/** La cadena que el catálogo dicta para un sitio, calculada aparte a propósito. */
function cadenaDelCatalogo(
  pick: (b: ReturnType<typeof allBuildings>[number]) => number | undefined,
) {
  return allBuildings()
    .filter((b) => pick(b) !== undefined)
    .slice()
    .sort((a, b) => (pick(a) ?? 0) - (pick(b) ?? 0))
    .map((b) => b.id);
}

describe('los sitios de la base', () => {
  it('son los doce de SITIOS, en su orden, para las dos facciones', () => {
    for (const faccion of ['knight', 'necromancer'] as const) {
      expect(sitiosDeLaBase(faccion).map((s) => s.id)).toEqual([...SITIOS]);
    }
  });

  it('la cadena del gremio sale del catálogo, no de una lista escrita a mano', () => {
    // Con la lista a mano esto sigue verde HOY —hay dos niveles— y se pone rojo
    // el día que entre `mage_guild_3`, que es cuando el bug muerde: la IA podría
    // construirlo y la persona no lo vería nunca en la base.
    const esperada = cadenaDelCatalogo((b) => b.mageGuildLevel);
    expect(esperada.length).toBeGreaterThan(0);
    for (const faccion of ['knight', 'necromancer'] as const) {
      const gremio = sitiosDeLaBase(faccion).find((s) => s.id === 'guild');
      expect(gremio?.cadena).toEqual(esperada);
    }
  });

  it('cada edificio de la facción va en un solo sitio, y ningún sitio ofrece uno que no exista', () => {
    const conocidos = new Set(allBuildings().map((b) => b.id));
    for (const faccion of ['knight', 'necromancer'] as const) {
      const sitios = sitiosDeLaBase(faccion);
      for (const s of sitios) {
        expect(
          s.cadena.length,
          `${faccion}/${s.id} se quedó sin nada que construir`,
        ).toBeGreaterThan(0);
        for (const id of s.cadena)
          expect(conocidos.has(id), `${faccion}/${s.id}: "${id}"`).toBe(true);
      }
      for (const b of buildingsOfFaction(faccion)) {
        const donde = sitios.filter((s) => s.cadena.includes(b.id)).map((s) => s.id);
        expect(donde, `${faccion}: "${b.id}"`).toHaveLength(1);
        expect(sitioDeEdificio(faccion, b.id).id).toBe(donde[0]);
      }
    }
  });

  it('el lvl6 del nigromante tiene un solo eslabón: su mejora no existe en el catálogo', () => {
    expect(sitiosDeLaBase('necromancer').find((s) => s.id === 'lvl6')?.cadena).toEqual([
      'necromancer_dwelling_6',
    ]);
  });

  it('sobre una base recién hecha: construido, siguiente y los sitios levantados', () => {
    const state = newGame({ seed: 7 });
    const town =
      state.towns.find((t) => t.owner === 0 && t.faction === 'knight') ??
      state.towns.find((t) => t.owner === 0)!;
    const f = town.faction;
    // Nace con el ayuntamiento y la morada de nivel 1.
    expect(construidoEn(town, 'hall')).toBe('village_hall');
    expect(siguienteDe(town, 'hall')).toBe('town_hall');
    expect(construidoEn(town, 'fort')).toBeNull();
    expect(siguienteDe(town, 'fort')).toBe('castle');
    expect(construidoEn(town, 'lvl1')).toBe(`${f}_dwelling_1`);
    expect(sitiosConstruidos(town)).toEqual(['hall', 'lvl1']);
    // Un sitio completo no ofrece nada más.
    town.buildings.push('marketplace');
    expect(siguienteDe(town, 'market')).toBeNull();
    expect(sitiosConstruidos(town)).toEqual(['hall', 'market', 'lvl1']);
  });

  it('un edificio que no está en ningún sitio lanza diciéndolo', () => {
    expect(() => sitioDeEdificio('knight', 'necromancer_dwelling_1')).toThrow(/ningún sitio/);
  });
});
