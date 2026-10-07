/**
 * El catálogo del arte de los mapas densos (`tools/taller/mapa-denso.ts`).
 *
 * El guardia que importa es el primero: cada pareja de barrera y suelo que
 * `data/barreras.json` puede producir tiene pieza. Si los datos crecen —una
 * barrera nueva junto a un suelo— se pone rojo aquí y no como un hueco en el
 * mapa.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { barreraDeNodo, NODOS, nodoDePaso } from '../src/client/render/escenario/nodos.js';
import { BARRERAS, type Barrera, SUELOS_PISABLES, type Suelo } from '../src/core/map/terrain.js';
import { encargoSchema, promptDe } from '../tools/taller/encargo.js';
import {
  encargoDeLamina,
  encargosDePiezasDensas,
  encargosDeTexturas,
  familiasConIds,
  familiasPara,
  LAMINAS,
  piezaDeCasilla,
  TEXTURAS,
} from '../tools/taller/mapa-denso.js';

const barreras = JSON.parse(
  readFileSync(join(import.meta.dirname, '../data/barreras.json'), 'utf8'),
) as Record<'frontera' | 'obstaculos', Record<Suelo, Partial<Record<Barrera, number>>>>;

function parejas(tabla: 'frontera' | 'obstaculos'): [Barrera, Suelo][] {
  return Object.entries(barreras[tabla]).flatMap(([suelo, pesos]) =>
    Object.keys(pesos).map((b) => [b as Barrera, suelo as Suelo] as [Barrera, Suelo]),
  );
}

describe('el catálogo de los mapas densos', () => {
  it('toda frontera que el generador puede levantar tiene pieza de borde', () => {
    const faltan = parejas('frontera').filter(([b, s]) => familiasPara(b, s, 'borde').length === 0);
    expect(faltan).toEqual([]);
  });

  it('todo obstáculo que el generador puede poner tiene pieza', () => {
    const faltan = parejas('obstaculos').filter(
      ([b, s]) => familiasPara(b, s, 'obstaculo').length === 0,
    );
    expect(faltan).toEqual([]);
  });

  it('cada barrera tiene su nodo de paso, menos el agua (puente) y el acantilado (hito, #168)', () => {
    for (const b of BARRERAS)
      if (b !== 'water' && b !== 'cliff') expect(nodoDePaso(b, 'ancho')).not.toBe('nodo-hito');
    expect(nodoDePaso('cliff', 'ancho')).toBe('nodo-hito');
    expect(nodoDePaso(null, 'ancho')).toBe('nodo-hito');
    expect(NODOS.some((n) => n.barrera === 'water' || n.barrera === 'cliff')).toBe(false);
  });

  it('las texturas son las de los suelos que se pisan', () => {
    expect(Object.keys(TEXTURAS).sort()).toEqual([...SUELOS_PISABLES].sort());
    for (const e of encargosDeTexturas()) {
      expect(e.tipo).toBe('textura');
      // Las reglas de `prompts.ts`: el agua no se nombra en un suelo, que alucina ríos.
      expect(e.descripcion).not.toMatch(/\bagua|río|lago/i);
      expect(promptDe(e)).toMatch(/90 grados/);
    }
  });

  it('todos los encargos son válidos y sus ids no se repiten', () => {
    const todos = [
      ...encargosDeTexturas(),
      ...(Object.keys(LAMINAS) as (keyof typeof LAMINAS)[]).map(encargoDeLamina),
      ...encargosDePiezasDensas(),
    ];
    for (const e of todos) encargoSchema.parse(e);
    const ids = todos.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const salidas = todos.map((e) => e.salida);
    expect(new Set(salidas).size).toBe(salidas.length);
    const piezas = familiasConIds().flatMap((f) => f.ids);
    expect(new Set(piezas).size).toBe(piezas.length);
  });

  it('una lámina tiene nueve piezas y cada familia apunta a una que existe', () => {
    for (const l of Object.values(LAMINAS)) expect(l).toHaveLength(9);
    for (const n of NODOS) expect(LAMINAS.b[n.n - 1]).toMatch(/poste de madera VACÍO/);
  });

  it('los nodos piden el poste vacío y ninguna pieza lleva bandera', () => {
    for (const e of encargosDePiezasDensas()) {
      expect(e.descripcion).toMatch(/Sin estandartes ni banderas/);
      if (e.id.startsWith('mapa-nodo-')) expect(e.descripcion).toMatch(/el poste va VACÍO/);
    }
  });

  it('una frontera junto a un suelo que no la eligió lleva pieza de respaldo de su barrera', () => {
    // El prado no levanta montañas, pero la roca sí, y la casilla puede quedar más cerca del prado.
    expect(familiasPara('mountain', 'grass', 'borde')).toEqual([]);
    expect(piezaDeCasilla('mountain', 'grass', 'borde', 0)).not.toBeNull();
  });

  it('un tramo con orientación elige la de la frontera', () => {
    expect(piezaDeCasilla('wall', 'dirt', 'borde', 0, 'hondo')).toMatch(/^muro-hondo-/);
    expect(piezaDeCasilla('wall', 'dirt', 'borde', 5, 'ancho')).toMatch(/^muro-ancho-/);
    // El pico remata, no rellena: la cordillera va con la montaña.
    for (let a = 0; a < 20; a++)
      expect(piezaDeCasilla('mountain', 'snow', 'borde', a)).not.toMatch(/^pico/);
  });

  it('el nodo deduce la barrera y el eje de la frontera de lo que tiene alrededor', () => {
    // Un río que corre a lo ancho con el nodo en medio: agua a izquierda y derecha.
    const W = 3;
    const t = [
      'grass',
      'grass',
      'grass',
      'water',
      'dirt',
      'water',
      'grass',
      'grass',
      'grass',
    ] as const;
    expect(barreraDeNodo({ x: 1, y: 1 }, W, t)).toEqual({ barrera: 'water', eje: 'ancho' });
    const u = [
      'grass',
      'wall',
      'grass',
      'grass',
      'dirt',
      'grass',
      'grass',
      'wall',
      'grass',
    ] as const;
    expect(barreraDeNodo({ x: 1, y: 1 }, W, u)).toEqual({ barrera: 'wall', eje: 'hondo' });
  });
});
