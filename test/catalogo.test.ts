/**
 * El catálogo de unidades (`data/unidades.json`, `core/catalogo.ts`), F1 de
 * `docs/agents/2026-10-18-combate-y-ejercitos-en-el-juego/plan.md`: la lista
 * entera de las cinco facciones, que `core` lee sin pasar por `tools/` y que la
 * arena escribe. Los criterios salen del plan: una unidad por hoja de tropa, la
 * validación al cargar con su fichero en el mensaje, y la búsqueda por id que
 * lanza diciendo cuál.
 */
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UNIDADES, unidad } from '../src/core/catalogo.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/hero/equipo.js';
import { RUTA_DEL_CATALOGO_DE_UNIDADES, validarCatalogo } from '../src/core/unidad.js';
import { leerCatalogo } from '../tools/arena/borrador.js';
import { hojasDeLaArena } from './helpers.js';

const RAIZ = resolve(import.meta.dirname, '..');

describe('el catálogo de unidades (data/unidades.json)', () => {
  it('trae una unidad por hoja de tropa del taller, con su id, y ninguna sin hoja', () => {
    const tropa = hojasDeLaArena().filter((h) => !h.heroe);
    const ids = UNIDADES.map((u) => u.id);
    expect(ids).toEqual(expect.arrayContaining(tropa.map((h) => h.id)));
    const hojas = new Set(hojasDeLaArena().map((h) => h.id));
    for (const u of UNIDADES) expect(hojas.has(u.cuerpo.hoja), u.id).toBe(true);
    // Ningún héroe: los héroes no se reclutan.
    expect(UNIDADES.filter((u) => hojasDeLaArena().find((h) => h.id === u.id)?.heroe)).toEqual([]);
  });

  it('es lo que lee la arena del repo: las mismas unidades, ninguna que no valga', () => {
    const leido = leerCatalogo(RAIZ);
    expect(leido.invalidas).toEqual([]);
    expect(leido.unidades).toEqual(UNIDADES);
  });

  it('busca por id, y lanza diciendo cuál si no está', () => {
    expect(unidad('troll-maza').name).toBe('Troll con maza');
    expect(() => unidad('nadie')).toThrow(
      `no hay ninguna unidad «nadie» en ${RUTA_DEL_CATALOGO_DE_UNIDADES}`,
    );
  });

  it('se valida con una sola regla, la de la carga y la de «Guardar»: una unidad que no vale lanza nombrando el fichero y a quién', () => {
    const guerrero = unidad('templario-escudo');
    expect(validarCatalogo({ unidades: [guerrero] }, EQUIPO_DEL_JUEGO)).toEqual([guerrero]);
    expect(() =>
      validarCatalogo({ unidades: [{ ...guerrero, equipo: {} }] }, EQUIPO_DEL_JUEGO),
    ).toThrow(
      'data/unidades.json: la unidad «Guerrero con escudo»: no lleva arma de cuerpo a cuerpo',
    );
    expect(() =>
      validarCatalogo({ unidades: [guerrero, { ...guerrero }] }, EQUIPO_DEL_JUEGO),
    ).toThrow('data/unidades.json: la unidad "templario-escudo" está dos veces en el catálogo');
    expect(() =>
      validarCatalogo(
        { unidades: [{ ...guerrero, equipo: { ...guerrero.equipo, arma: 'espada-9' } }] },
        EQUIPO_DEL_JUEGO,
      ),
    ).toThrow('data/unidades.json: la unidad «Guerrero con escudo»: no existe ninguna pieza');
    expect(() => validarCatalogo({ otra: [] }, EQUIPO_DEL_JUEGO)).toThrow(
      'data/unidades.json tiene que ser { unidades: [...] }',
    );
  });
});
