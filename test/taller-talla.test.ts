/**
 * La talla de cada unidad (05-10-2026): con todas las hojas empaquetadas a la
 * altura de un adulto, el troll salía más pequeño que un goblin (lo vio el
 * usuario). El reposo se empaqueta a la altura de un adulto por la talla.
 */
import { describe, expect, it } from 'vitest';
import { FIGURA } from '../src/shared/arte.js';
import { alturaDelReposo } from '../tools/taller/encargo.js';
import { encargosDeOchoDirecciones, unidad } from '../tools/taller/unidades.js';

const reposo = (id: string): number => {
  const e = encargosDeOchoDirecciones(unidad(id))[0];
  if (e === undefined) throw new Error(`${id} sin encargos`);
  return alturaDelReposo(e);
};

describe('la talla de cada unidad', () => {
  it('el goblin es más bajo que un orko, y el orko que un troll', () => {
    expect(reposo('goblin-lancero')).toBeLessThan(reposo('orko-hacha-escudo'));
    expect(reposo('heroe-goblin-jefe')).toBeLessThan(reposo('orko-hacha-escudo'));
    expect(reposo('orko-hacha-escudo')).toBeLessThan(reposo('troll-maza'));
  });

  it('sin talla, el reposo mide lo de un adulto; y todas las hojas de una unidad, lo mismo', () => {
    expect(reposo('templario-escudo')).toBe(FIGURA.alturaAdulto);
    const alturas = new Set(encargosDeOchoDirecciones(unidad('troll-maza')).map(alturaDelReposo));
    expect([...alturas]).toEqual([reposo('troll-maza')]);
  });
});
