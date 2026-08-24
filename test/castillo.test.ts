/**
 * La pantalla de castillo, por el lado que no se ve: sus solares.
 *
 * No se prueba el dibujo —eso se mira en el navegador—, sino la única regla que
 * la pantalla no puede inventarse: qué se puede levantar en cada sitio. Las
 * cadenas se DERIVAN del catálogo, así que lo que se comprueba aquí es que
 * siguen derivándose y no vuelven a escribirse a mano.
 */
import { describe, expect, it } from 'vitest';
import { townPlots } from '../src/client/render/town.js';
import { allBuildings } from '../src/core/town/buildings.js';

/** La cadena que el catálogo dicta para un solar, calculada aparte a propósito. */
function cadenaDelCatalogo(
  pick: (b: ReturnType<typeof allBuildings>[number]) => number | undefined,
) {
  return allBuildings()
    .filter((b) => pick(b) !== undefined)
    .slice()
    .sort((a, b) => (pick(a) ?? 0) - (pick(b) ?? 0))
    .map((b) => b.id);
}

describe('solares del castillo', () => {
  it('la cadena del gremio sale del catálogo, no de una lista escrita a mano', () => {
    // El guardia de verdad: se calcula la cadena desde `data/buildings.json` y
    // se compara. Con la lista a mano que había antes, esto sigue verde HOY
    // —hay exactamente dos niveles— y se pone rojo el día que entre
    // `mage_guild_3`, que es justo el día en que el bug muerde: la IA podría
    // construirlo y la persona vería el solar terminado en el II.
    const esperada = cadenaDelCatalogo((b) => b.mageGuildLevel);
    expect(esperada.length).toBeGreaterThan(0);

    for (const faccion of ['knight', 'necromancer'] as const) {
      const gremio = townPlots(faccion).find((p) => p.id === 'guild');
      expect(gremio, `la facción ${faccion} no tiene solar de gremio`).toBeDefined();
      expect(gremio!.chain).toEqual(esperada);
    }
  });

  it('ningún solar ofrece un edificio que no exista en el catálogo', () => {
    const conocidos = new Set(allBuildings().map((b) => b.id));
    for (const faccion of ['knight', 'necromancer'] as const) {
      for (const solar of townPlots(faccion)) {
        for (const id of solar.chain) {
          expect(
            conocidos.has(id),
            `${faccion}/${solar.id} ofrece "${id}", que no está en los datos`,
          ).toBe(true);
        }
      }
    }
  });

  it('un solar de morada vacío no existe: las once cadenas tienen al menos un eslabón', () => {
    for (const faccion of ['knight', 'necromancer'] as const) {
      const solares = townPlots(faccion);
      expect(solares).toHaveLength(11);
      for (const solar of solares) {
        expect(
          solar.chain.length,
          `${faccion}/${solar.id} se quedó sin nada que construir`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
