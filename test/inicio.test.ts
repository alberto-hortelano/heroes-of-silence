/**
 * La pantalla de inicio (19-10-2026): el menú y la elección de facción, leídos
 * como texto (vitest va sin DOM, como `paneles.test.ts`), y cuándo se pregunta.
 * Lo que hace con el ratón y el teclado lo juega `pnpm capturas` («arranque»).
 */
import { describe, expect, it } from 'vitest';
import { marcadoDe } from '../src/client/html.js';
import {
  hayQuePreguntar,
  renderEleccion,
  renderMenu,
  SIN_PARTIDAS,
} from '../src/client/inicio/pantallas.js';
import { rasgoDeFaccion } from '../src/core/data.js';
import { nombreDeSalida } from '../src/core/state/setup.js';
import { FACTION_IDS, NOMBRE_DE_FACCION } from '../src/core/types.js';

describe('cuándo pregunta la página', () => {
  it('sin nada pedido, pregunta; con semilla o facción, no', () => {
    expect(hayQuePreguntar('')).toBe(true);
    expect(hayQuePreguntar('?seed=')).toBe(true);
    expect(hayQuePreguntar('?seed=&faccion=')).toBe(true);
    expect(hayQuePreguntar('?otra=1')).toBe(true);
    expect(hayQuePreguntar('?seed=7')).toBe(false);
    expect(hayQuePreguntar('?faccion=elfos')).toBe(false);
    expect(hayQuePreguntar('?seed=7&faccion=orkos')).toBe(false);
    // Lo que no vale también va a la partida, que dice por qué: no se tapa con el menú.
    expect(hayQuePreguntar('?seed=abc')).toBe(false);
    expect(hayQuePreguntar('?faccion=xyz')).toBe(false);
  });
});

describe('el menú', () => {
  const menu = marcadoDe(renderMenu());

  it('trae las tres opciones, en orden', () => {
    const opciones = [...menu.matchAll(/data-inicio="([a-z]+)"/g)].map((m) => m[1]);
    expect(opciones).toEqual(['nuevo', 'cargar', 'rapida']);
    expect(menu).toContain('>Nuevo juego</button>');
    expect(menu).toContain('>Cargar partida</button>');
    expect(menu).toContain('>Partida rápida</button>');
  });

  it('«Cargar partida» va apagado y enfocable, con su motivo a la vista', () => {
    const cargar = /<button[^>]*data-inicio="cargar"[^>]*>/.exec(menu)?.[0] ?? '';
    expect(cargar).toContain('aria-disabled="true"');
    expect(cargar).toContain('aria-describedby="sin-partidas"');
    // `disabled` lo sacaría del teclado: no lo lleva.
    expect(cargar).not.toMatch(/\sdisabled/);
    expect(menu).toContain(`<p id="sin-partidas" class="cost">${SIN_PARTIDAS}</p>`);
  });
});

describe('la elección de facción', () => {
  it('las cinco, cada una con su nombre, su rasgo y su héroe, y solo la elegida marcada', () => {
    const eleccion = marcadoDe(renderEleccion('elfos'));
    const opciones = [...eleccion.matchAll(/data-faccion="([a-z-]+)"/g)].map((m) => m[1]);
    expect(opciones).toEqual([...FACTION_IDS]);
    for (const f of FACTION_IDS) {
      expect(eleccion).toContain(NOMBRE_DE_FACCION[f]);
      expect(eleccion).toContain(rasgoDeFaccion(f));
      expect(eleccion).toContain(`Empiezas con ${nombreDeSalida(f, 0)}`);
    }
    const marcadas = [...eleccion.matchAll(/<input[^>]*value="([a-z-]+)"[^>]*checked/g)].map(
      (m) => m[1],
    );
    expect(marcadas).toEqual(['elfos']);
    expect(eleccion).toContain('data-inicio="empezar"');
    expect(eleccion).toContain('data-inicio="volver"');
  });
});
