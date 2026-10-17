/**
 * El Imperio en 8 direcciones (04-10-2026): los dos juegos de armas nuevos
 * —la granada del Y Bot y el jinete con pistola— y las decisiones del usuario
 * sobre sus unidades (el Duelista sustituye al Noble; el Ingeniero lleva rifle).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clipDeDisparoDe,
  hojasDe,
  indicesDeTramo,
  JUEGOS_DE_ARMAS,
  type JuegoEn8d,
} from '../tools/art/poses.js';
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
            `${carpeta}/d${e.ocho?.direccion}-${e.ocho?.hoja}.profundidad.png`,
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

  it('los clips de su maniquí, si los declara, son los que están renderizados', () => {
    for (const u of [...UNIDADES, ...HEROES]) {
      if (u.clipsDelManiqui === undefined) continue;
      expect(u.maniqui, `${u.id}: clipsDelManiqui sin maniqui`).toBeDefined();
      const juego = JUEGO_DEL_YBOT[u.id] as keyof typeof JUEGOS_DE_ARMAS;
      const carpeta = `assets/unidades/_poses/unidades/${u.id}-8d`;
      const poses = JSON.parse(readFileSync(join(RAIZ, carpeta, 'poses.json'), 'utf8'));
      const esperadas = hojasDe(juego, u.clipsDelManiqui);
      for (const [h, filas] of Object.entries(esperadas))
        expect(
          poses.sheets[h].map(
            (f: { clip: string; anim: string; tramo?: number[]; vaiven?: true }) => ({
              clip: f.clip,
              anim: f.anim,
              tramo: f.tramo,
              vaiven: f.vaiven,
            }),
          ),
          `${u.id} ${h}`,
        ).toEqual(
          filas.map((f) => ({ clip: f.clip, anim: f.anim, tramo: f.tramo, vaiven: f.vaiven })),
        );
      expect(poses.deathStartsFrom.at, u.id).toBe(u.clipsDelManiqui.tramos?.death?.[0] ?? 0);
    }
    // El vampiro: de pie y relajado, de ida y vuelta, y la muerte desde que
    // empieza a caer.
    const vampiro = hojasDe('espada-escudo', unidad('heroe-vampiro').clipsDelManiqui);
    expect(vampiro.a?.[0]).toEqual({
      clip: 'idle',
      anim: 'idle_neutral',
      enBucle: true,
      tramo: [0, 1.5],
      vaiven: true,
    });
    expect(vampiro.b?.[2]?.tramo).toEqual([1, 2]);
  });

  it('un tramo se muestrea en sus siete columnas, de su primer fotograma al último', () => {
    // La muerte del vampiro: 28 fotogramas a 12 fps, del segundo 1 al 2.
    expect(indicesDeTramo(28, 12, [1, 2], 7, false)).toEqual([12, 14, 16, 18, 20, 22, 24]);
    expect(indicesDeTramo(28, 12, undefined, 7, false)).toEqual([0, 5, 9, 14, 18, 23, 27]);
    expect(() => indicesDeTramo(28, 12, [1, 2.5], 7, false)).toThrow(/no cabe/);
    expect(() => indicesDeTramo(28, 12, [1, 1], 7, false)).toThrow(/no cabe/);
    // De ida y vuelta, la última columna enlaza con la primera; solo en un bucle.
    expect(indicesDeTramo(44, 12, [0, 1.2], 7, true, true)).toEqual([0, 5, 9, 14, 14, 9, 5]);
    expect(() => indicesDeTramo(28, 12, [1, 2], 7, false, true)).toThrow(/solo un bucle/);
  });

  it('el arcabucero lleva un arma de fuego sin arco; la ballesta del juego conserva el suyo', () => {
    const arcabuz = unidad('imperio-arcabucero').maniqui;
    expect(arcabuz !== undefined && 'ballesta' in arcabuz && arcabuz.ballesta.palas).toBe(0);
    expect(JUEGOS_DE_ARMAS.ballesta.atrezo.ballesta.palas).toBeGreaterThan(0);
  });
});
