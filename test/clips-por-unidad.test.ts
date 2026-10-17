/**
 * Cada unidad con sus clips de Mixamo y pintada sobre la profundidad de su
 * maniquí (decisión del usuario, 10-10-2026, tras las pruebas del vampiro).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  archivoDeClip,
  archivosDeDañoYMuerte,
  hojasDe,
  JUEGOS_DE_ARMAS,
  type JuegoDeArmas,
} from '../tools/art/poses.js';
import { hojaDelReposo } from '../tools/taller/poses-8d.js';
import {
  EN_OCHO_DIRECCIONES,
  encargosDeOchoDirecciones,
  HEROES,
  JUEGO_DEL_YBOT,
  UNIDADES,
} from '../tools/taller/unidades.js';

const RAIZ = join(import.meta.dirname, '..');
const TODAS = [...UNIDADES, ...HEROES];

describe('los clips de cada unidad', () => {
  it('una unidad cambia la marcha, la carrera y el ataque de su juego; el daño y la muerte, por su FBX', () => {
    const hojas = hojasDe('lanza', {
      reposo: 'idle_neutral',
      acciones: {
        walk: 'walking',
        charge: 'run2',
        attack: 'heavy',
        hurt: 'impact2',
        death: 'death2',
      },
    });
    const anims = Object.fromEntries(
      Object.values(hojas)
        .flat()
        .map((f) => [f.clip, f.anim]),
    );
    expect(anims).toMatchObject({
      idle: 'idle_neutral',
      walk: 'walking',
      charge: 'run2',
      attack: 'heavy',
      hurt: 'impact3',
      death: 'death',
    });
    expect(archivosDeDañoYMuerte({ acciones: { hurt: 'impact2', death: 'death2' } })).toEqual({
      daño: 'anims/sword_and_shield/sword and shield impact (2).fbx',
      muerte: 'anims/sword_and_shield/sword and shield death (2).fbx',
    });
    expect(archivosDeDañoYMuerte().muerte).toBe(
      'anims/sword_and_shield/sword and shield death.fbx',
    );
  });

  it('un clip que no existe, o el disparo como acción, lanza antes de renderizar', () => {
    expect(() => hojasDe('lanza', { acciones: { walk: 'andar' } })).toThrow(/«andar»/);
    expect(() => hojasDe('lanza', { reposo: 'reposo' })).toThrow(/«reposo»/);
    expect(() => archivoDeClip('bow')).toThrow(/«bow»/);
    expect(() => archivosDeDañoYMuerte({ acciones: { death: 'muerte' } })).toThrow(/«muerte»/);
  });

  it('toda unidad a pie tiene maniquí propio con sus clips, y todos existen', () => {
    for (const u of TODAS) {
      const juego = JUEGO_DEL_YBOT[u.id] as string;
      if (!(juego in JUEGOS_DE_ARMAS)) continue;
      expect(u.maniqui, u.id).toBeDefined();
      expect(u.clipsDelManiqui, u.id).toBeDefined();
      expect(() => hojasDe(juego as JuegoDeArmas, u.clipsDelManiqui), u.id).not.toThrow();
      expect(() => archivosDeDañoYMuerte(u.clipsDelManiqui), u.id).not.toThrow();
    }
  });
});

describe('el maniquí renderizado es el que declara la unidad', () => {
  it('el golpe y la muerte de cada maniquí duran lo que el FBX que declara', () => {
    // Las filas se llaman siempre `impact3` y `death`: lo que cambia es el FBX, y
    // solo su duración lo delata (el 10-10-2026 el de una unidad se coló en las siguientes).
    for (const fila of ['hurt', 'death'] as const) {
      const porArchivo = new Map<string, Map<number, string[]>>();
      for (const u of TODAS) {
        if (u.maniqui === undefined) continue;
        const archivos = archivosDeDañoYMuerte(u.clipsDelManiqui);
        const archivo = fila === 'hurt' ? archivos.daño : archivos.muerte;
        const poses = JSON.parse(
          readFileSync(join(RAIZ, `assets/unidades/_poses/unidades/${u.id}-8d/poses.json`), 'utf8'),
        ) as { sourceMetadata: Record<string, { frame_count: number }> };
        const n = poses.sourceMetadata[fila]?.frame_count ?? -1;
        const duraciones = porArchivo.get(archivo) ?? new Map<number, string[]>();
        duraciones.set(n, [...(duraciones.get(n) ?? []), u.id]);
        porArchivo.set(archivo, duraciones);
      }
      for (const [archivo, duraciones] of porArchivo)
        expect(Object.fromEntries(duraciones), `${fila}: ${archivo}`).toSatisfy(
          (d: object) => Object.keys(d).length === 1,
        );
      const unaPorArchivo = [...porArchivo.values()].map((d) => [...d.keys()][0]);
      expect(new Set(unaPorArchivo).size, fila).toBe(unaPorArchivo.length);
    }
  });
});

describe('las hojas se pintan sobre la profundidad', () => {
  it('las B y C se escalan contra la A de su mismo tipo', () => {
    expect(hojaDelReposo('x/d3-b.png')).toBe('x/d3-a.png');
    expect(hojaDelReposo('x/d3-c.profundidad.png')).toBe('x/d3-a.profundidad.png');
    expect(hojaDelReposo('x/d3-b.mezcla.png')).toBe('x/d3-a.mezcla.png');
    expect(hojaDelReposo('x/d3-a.profundidad.png')).toBe('x/d3-a.profundidad.png');
  });

  it('a pie, la primera referencia es la profundidad de su maniquí; montado, la pose en color', () => {
    for (const u of TODAS) {
      if (!(u.id in EN_OCHO_DIRECCIONES)) continue;
      for (const e of encargosDeOchoDirecciones(u)) {
        const [pose] = e.referencias;
        if (u.maniqui === undefined) {
          expect(pose?.papel, e.id).toBe('pose');
          expect(pose?.ruta, e.id).toMatch(/-[abc]\.png$/);
        } else {
          expect(pose?.papel, e.id).toBe('pose-profundidad');
          expect(pose?.ruta, e.id).toBe(
            `assets/unidades/_poses/unidades/${u.id}-8d/d${e.ocho?.direccion}-${e.ocho?.hoja}.profundidad.png`,
          );
        }
        expect(existsSync(join(RAIZ, pose?.ruta ?? '')), pose?.ruta).toBe(true);
      }
    }
  });
});
