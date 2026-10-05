/**
 * Héroes, élite y tropa de cada ejército (`ELITE` y `rangoDe` en
 * tools/taller/unidades.ts): lo agrupa el visor de 8 direcciones.
 */
import { describe, expect, it } from 'vitest';
import { ELITE, HEROES, rangoDe, UNIDADES, unidad } from '../tools/taller/unidades.js';

describe('héroes, élite y tropa', () => {
  it('toda la élite es una unidad del taller y ningún héroe', () => {
    const tropas = UNIDADES.map((u) => u.id);
    for (const id of ELITE) expect(tropas, id).toContain(id);
    for (const h of HEROES) expect(rangoDe(h), h.id).toBe('heroe');
  });

  it('sigue NuevaJugabilidad.md: los Elfos', () => {
    for (const id of ['elfo-arquero', 'elfo-explorador', 'elfo-guardia-del-bosque'])
      expect(rangoDe(unidad(id)), id).toBe('tropa');
    for (const id of ['elfo-jinete', 'elfo-sacerdotisa', 'elfo-asesino'])
      expect(rangoDe(unidad(id)), id).toBe('elite');
    expect(rangoDe(unidad('heroe-elfo-cantora'))).toBe('heroe');
  });
});
