/**
 * La pantalla de inicio (19-10-2026): el menú y la elección de facción, leídos
 * como texto (vitest va sin DOM, como `paneles.test.ts`), y cuándo se pregunta.
 * Lo que hace con el ratón y el teclado lo juega `pnpm capturas` («arranque»).
 */

import { describe, expect, it } from 'vitest';
import { combateParaElMenu } from '../src/client/combate-en-la-url.js';
import { marcadoDe } from '../src/client/html.js';
import { renderEleccion, renderMenu } from '../src/client/inicio/pantallas.js';
import { hayQuePreguntar } from '../src/client/semilla.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
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
    // El héroe también es pedir (vuelta 2): suelto, lo valida la partida.
    expect(hayQuePreguntar('?heroe=lich')).toBe(false);
    expect(hayQuePreguntar('?seed=&faccion=&heroe=')).toBe(true);
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
    expect(menu).toContain('<p id="sin-partidas" class="cost">Aún no hay partidas guardadas.</p>');
  });
});

describe('la elección de facción', () => {
  it('las cinco, cada una con su nombre, su rasgo y su héroe, y solo la elegida marcada', () => {
    const eleccion = marcadoDe(renderEleccion('elfos', COMBATE_COMPLETO, false));
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
    // De la facción se va a la partida: el héroe se elige en la base, ante el
    // ayuntamiento (22-10-2026), y no hay paso del héroe en el menú.
    expect(eleccion).toContain('data-inicio="empezar"');
    expect(eleccion).not.toContain('data-inicio="siguiente"');
    expect(eleccion).not.toContain('name="heroe"');
    expect(eleccion).toContain('data-inicio="volver"');
  });
});

describe('la complejidad del combate en «Nuevo juego» (22-10-2026)', () => {
  it('tropa y rueda, 3, 5 o 7 cada una y 7 marcada; y la casilla de «Solo la rueda del héroe»', () => {
    const eleccion = marcadoDe(renderEleccion('elfos', COMBATE_COMPLETO, false));
    for (const campo of ['tope', 'rueda']) {
      const valores = [
        ...eleccion.matchAll(new RegExp(`data-combate="${campo}" value="(\\d)"`, 'g')),
      ].map((m) => m[1]);
      expect(valores, campo).toEqual(['3', '5', '7']);
      expect(eleccion).toMatch(new RegExp(`data-combate="${campo}" value="7" checked`));
    }
    // La casilla, con lo que hace en su nota (la misma de la batalla).
    expect(eleccion).toMatch(
      /<input type="checkbox" data-combate="solo-heroe"\s*\/> Solo la rueda del héroe<\/label><span class="nota"[^>]*aria-label="La rueda se te abre solo cuando tu héroe golpea o responde/,
    );
    expect(eleccion).not.toMatch(/title=/);
    const elegido = marcadoDe(renderEleccion('elfos', { tope: 3, rueda: 5 }, true));
    expect(elegido).toMatch(/data-combate="tope" value="3" checked/);
    expect(elegido).toMatch(/data-combate="rueda" value="5" checked/);
    expect(elegido).toMatch(/data-combate="solo-heroe" checked/);
  });
});

describe('«Nuevo juego» parte de la complejidad de la URL (QA de la complejidad, vuelta 1)', () => {
  it('lo que pide, con lo de siempre en lo que no pide; si algo no vale, no pregunta', () => {
    // Antes «Nuevo juego» enseñaba 7 / 7 y pisaba la URL al empezar, y «Partida
    // rápida» la conservaba: dos partidas distintas desde la misma dirección.
    expect(combateParaElMenu('')).toEqual({ combate: COMBATE_COMPLETO, soloHeroe: false });
    expect(combateParaElMenu('?tropa=3&rueda=5&solo-heroe=1')).toEqual({
      combate: { tope: 3, rueda: 5 },
      soloHeroe: true,
    });
    expect(combateParaElMenu('?rueda=3')).toEqual({
      combate: { tope: 7, rueda: 3 },
      soloHeroe: false,
    });
    // Lo que no vale lo dice la partida al arrancar (`main.ts`), con su salida.
    for (const mal of ['?rueda=4', '?tropa=6', '?solo-heroe=si', '?tropa=3&tropa=5']) {
      expect(combateParaElMenu(mal), mal).toBeNull();
    }
  });
});
