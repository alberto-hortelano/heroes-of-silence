/**
 * La pantalla de castillo, por el lado que no se ve: sus solares.
 *
 * No se prueba el dibujo —eso se mira en el navegador—, sino la única regla que
 * la pantalla no puede inventarse: qué se puede levantar en cada sitio. Las
 * cadenas se DERIVAN del catálogo, así que lo que se comprueba aquí es que
 * siguen derivándose y no vuelven a escribirse a mano.
 */
import { describe, expect, it } from 'vitest';
import { botonDeRecluta, hitAtPixel, townPlots } from '../src/client/render/town.js';
import { newGame } from '../src/core/state/setup.js';
import { allBuildings, buildingsOfFaction } from '../src/core/town/buildings.js';

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

  it('todo edificio de la facción está en algún solar: ninguno queda sin sitio donde construirse', () => {
    // El otro sentido del test de arriba. Sin él, un edificio nuevo en los datos
    // —la armería lo fue— lo construiría la IA y la persona no lo vería nunca en
    // la pantalla, sin que nada se pusiera rojo.
    for (const faccion of ['knight', 'necromancer'] as const) {
      const colocados = new Set(townPlots(faccion).flatMap((s) => s.chain));
      for (const b of buildingsOfFaction(faccion)) {
        expect(colocados.has(b.id), `${faccion}: "${b.id}" no está en ningún solar`).toBe(true);
      }
    }
  });

  it('un solar de morada vacío no existe: las doce cadenas tienen al menos un eslabón', () => {
    for (const faccion of ['knight', 'necromancer'] as const) {
      const solares = townPlots(faccion);
      expect(solares).toHaveLength(12);
      for (const solar of solares) {
        expect(
          solar.chain.length,
          `${faccion}/${solar.id} se quedó sin nada que construir`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe('los botones de reclutar', () => {
  it('«Todo» es exactamente el botón que se dibuja; el resto de la casilla recluta uno', () => {
    const state = newGame({ seed: 7 });
    const town = state.towns.find((t) => t.owner === 0)!;
    const plot = townPlots(town.faction).find((p) => p.level === 1)!;
    const t = { scale: 1, x: 0, y: 0 };
    const centro = (b: { x: number; y: number; w: number; h: number }) => ({
      x: b.x + b.w / 2,
      y: b.y + b.h / 2,
    });
    const todo = centro(botonDeRecluta(plot, true));
    const uno = centro(botonDeRecluta(plot, false));
    expect(hitAtPixel(town, todo.x, todo.y, t)).toMatchObject({ kind: 'recruit', all: true });
    expect(hitAtPixel(town, uno.x, uno.y, t)).toMatchObject({ kind: 'recruit', all: false });
    // Los dos botones no se pisan: «+1» acaba antes de que empiece «Todo».
    const b1 = botonDeRecluta(plot, false);
    expect(b1.x + b1.w).toBeLessThan(botonDeRecluta(plot, true).x);
  });
});
