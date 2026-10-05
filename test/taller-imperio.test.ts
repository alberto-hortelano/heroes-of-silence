/**
 * El Imperio en 8 direcciones (04-10-2026): los dos juegos de armas nuevos
 * —la granada del Y Bot y el jinete con pistola— y las decisiones del usuario
 * sobre sus unidades (el Duelista sustituye al Noble; el Ingeniero lleva rifle).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clipDeDisparoDe, JUEGOS_DE_ARMAS, type JuegoEn8d } from '../tools/art/poses.js';
import {
  EN_OCHO_DIRECCIONES,
  encargosDeOchoDirecciones,
  HEROES,
  JUEGO_DEL_YBOT,
  UNIDADES,
  unidad,
} from '../tools/taller/unidades.js';

const RAIZ = resolve(import.meta.dirname, '..');
const atlas = JSON.parse(
  readFileSync(join(RAIZ, 'assets/unidades/_poses/atlas-8d.json'), 'utf8'),
) as {
  juegos: Record<string, { clips: { attack: { suelta?: number }; shoot?: { suelta?: number } } }[]>;
};

describe('los juegos de armas nuevos del Imperio', () => {
  it('la granada y la pistola disparan con su propia curva; la lanza montada no dispara', () => {
    // El ataque del granadero es el sable; la granada es su disparo.
    expect(JUEGOS_DE_ARMAS.granada.ataque).toBe('quick');
    expect(JUEGOS_DE_ARMAS.granada.disparo).toBe('grenade');
    expect(clipDeDisparoDe('granada')).toBe('grenade');
    expect(clipDeDisparoDe('montado-pistola')).toBe('pistol');
    expect(clipDeDisparoDe('montado-lanza')).toBeNull();
  });

  it('las dos tienen sus 8 direcciones en atlas-8d.json y su disparo suelta en la columna 4; su ataque no suelta nada', () => {
    for (const juego of ['granada', 'montado-pistola']) {
      const dirs = atlas.juegos[juego];
      expect(dirs, juego).toHaveLength(8);
      for (const [n, d] of (dirs ?? []).entries()) {
        expect(d.clips.shoot?.suelta, `${juego}/d${n}`).toBe(4);
        expect(d.clips.attack.suelta, `${juego}/d${n}`).toBeUndefined();
      }
    }
  });

  it('cada unidad del Imperio va con el juego de lo que lleva en la mano', () => {
    expect(JUEGO_DEL_YBOT['imperio-granadero']).toBe('granada');
    expect(JUEGO_DEL_YBOT['imperio-pistolero-montado']).toBe('montado-pistola');
    expect(JUEGO_DEL_YBOT['heroe-imperio-ingeniero']).toBe('ballesta');
    expect(unidad('heroe-imperio-ingeniero').aspecto).toMatch(/rifle/);
  });

  it('el Duelista sustituye al Noble, y las láminas nuevas son su referencia', () => {
    const ids = [...UNIDADES, ...HEROES].map((u) => u.id);
    expect(ids).not.toContain('heroe-imperio-noble');
    expect(unidad('heroe-imperio-duelista').concepto).toBe('assets/art/imperio/duelista.png');
    for (const id of ['imperio-granadero', 'imperio-pistolero-montado'])
      expect(unidad(id).concepto, id).toMatch(/^assets\/art\/imperio\//);
  });
});

describe('el maniquí propio de una unidad', () => {
  const conManiqui = [...UNIDADES, ...HEROES].filter((u) => u.maniqui !== undefined);

  it('sus hojas se pintan sobre su maniquí, que está renderizado con sus hojas (la C si dispara) y su atrezo', () => {
    expect(conManiqui.map((u) => u.id)).toContain('imperio-arcabucero');
    for (const u of conManiqui) {
      const carpeta = `assets/unidades/_poses/unidades/${u.id}-8d`;
      // Un maniquí se renderiza antes de pintar: hasta que la unidad entra en
      // 8 direcciones no tiene encargos, pero su maniquí ya está completo.
      if (u.id in EN_OCHO_DIRECCIONES)
        for (const e of encargosDeOchoDirecciones(u))
          expect(e.referencias[0]?.ruta, e.id).toBe(
            `${carpeta}/d${e.ocho?.direccion}-${e.ocho?.hoja}.png`,
          );
      const dispara = clipDeDisparoDe(JUEGO_DEL_YBOT[u.id] as JuegoEn8d) !== null;
      for (let d = 0; d < 8; d++)
        for (const h of dispara ? ['a', 'b', 'c'] : ['a', 'b'])
          expect(existsSync(join(RAIZ, carpeta, `d${d}-${h}.png`)), `${u.id} d${d}-${h}`).toBe(
            true,
          );
      const poses = JSON.parse(readFileSync(join(RAIZ, carpeta, 'poses.json'), 'utf8'));
      expect(poses.unidad, u.id).toBe(u.id);
      expect(poses.atrezo, u.id).toEqual(u.maniqui);
      // La suelta de sus hojas pintadas sale de aquí (`sueltaDeUnidad`).
      expect(typeof poses.sourceMetadata.shoot?.frame_count, u.id).toBe(
        dispara ? 'number' : 'undefined',
      );
    }
  });

  it('el arcabucero lleva un arma de fuego sin arco; la ballesta del juego conserva el suyo', () => {
    const arcabuz = unidad('imperio-arcabucero').maniqui;
    expect(arcabuz !== undefined && 'ballesta' in arcabuz && arcabuz.ballesta.palas).toBe(0);
    expect(JUEGOS_DE_ARMAS.ballesta.atrezo.ballesta.palas).toBeGreaterThan(0);
  });
});
