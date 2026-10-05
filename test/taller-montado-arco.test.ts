/**
 * El jinete elfo (decisión del usuario, 05-10-2026): arco, espada y lanza para
 * la carga. Un juego montado más, `montado-arco`, que sale de las tablas y no de
 * un `if` por nombre: dispara con la curva del arco a pie, pelea con el tajo de
 * espada desde la silla y tiene sus 8 direcciones en `atlas-8d.json`.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hojasDeFigura } from '../src/shared/arte.js';
import { ARMAS_MONTADAS, armaDeLaOrden } from '../tools/art/montura.js';
import {
  carpetaDePoses,
  clipDeDisparoDe,
  cuerpoACuerpoDe,
  JUEGOS_MONTADOS,
  type JuegoMontado,
} from '../tools/art/poses.js';
import { JUEGOS_EN_8D } from '../tools/taller/unidades.js';

const RAIZ = resolve(import.meta.dirname, '..');
const leer = (ruta: string) => JSON.parse(readFileSync(ruta, 'utf8'));
const atlas = leer(join(RAIZ, 'assets/unidades/_poses/atlas-8d.json')) as {
  juegos: Record<
    string,
    { clips: { attack: { suelta?: number }; shoot?: { row: number; suelta?: number } } }[]
  >;
};

describe('el juego montado-arco', () => {
  it('dispara con la curva del arco a pie y pelea de cerca con el tajo de espada', () => {
    expect(clipDeDisparoDe('montado-arco')).toBe('bow');
    expect(clipDeDisparoDe('montado-arco')).toBe(clipDeDisparoDe('arco'));
    expect(cuerpoACuerpoDe('montado-arco')).toMatch(/espada/);
  });

  it('cada jinete de JUEGOS_MONTADOS es un arma de la orden y un juego en 8 direcciones', () => {
    const montados = Object.keys(JUEGOS_MONTADOS) as JuegoMontado[];
    expect(ARMAS_MONTADAS.map((a) => `montado-${a}`)).toEqual(montados);
    for (const j of montados) expect(JUEGOS_EN_8D, j).toContain(j);
  });

  it('la línea de órdenes elige el arma por su nombre, y dos a la vez se rechazan', () => {
    expect(armaDeLaOrden(['--8d'])).toBe('lanza');
    expect(armaDeLaOrden(['--8d', '--arco'])).toBe('arco');
    expect(armaDeLaOrden(['--8d', '--pistola'])).toBe('pistola');
    expect(() => armaDeLaOrden(['--pistola', '--arco'])).toThrow(/--pistola y --arco/);
  });

  it('tiene sus 8 direcciones con hoja C y suelta en la misma columna que el arco a pie', () => {
    const montado = atlas.juegos['montado-arco'];
    const aPie = atlas.juegos.arco;
    expect(montado).toHaveLength(8);
    for (const [n, d] of (montado ?? []).entries()) {
      expect(d.clips.shoot?.suelta, `d${n}`).toBe(aPie?.[n]?.clips.shoot?.suelta);
      expect(d.clips.shoot?.suelta, `d${n}`).toBeTypeOf('number');
      expect(d.clips.attack.suelta, `d${n}`).toBeUndefined();
    }
  });

  it('sus hojas son las que dice su poses.json: disparo parado, caballo quieto y 24 fotogramas', () => {
    const carpeta = carpetaDePoses('montado-arco');
    const poses = leer(join(carpeta, 'poses.json')) as {
      arma: string;
      sourceMetadata: { shoot: { frame_count: number } };
      sheets: Record<string, { clip: string; caballo: string; postura: string }[]>;
      sha256: Record<string, string>;
    };
    expect(poses.arma).toBe('arco');
    expect(Object.keys(poses.sheets)).toEqual([...hojasDeFigura(true)]);
    expect(poses.sheets.c).toEqual([
      expect.objectContaining({ clip: 'shoot', caballo: 'Idle', postura: 'disparo' }),
    ]);
    expect(poses.sheets.a?.find((f) => f.clip === 'charge')?.postura).toBe('carga');
    expect(poses.sheets.b?.find((f) => f.clip === 'attack')?.postura).toBe('ataque');
    expect(poses.sourceMetadata.shoot.frame_count).toBe(
      Math.round((JUEGOS_MONTADOS['montado-arco'].duracionDelDisparo ?? 0) * 24),
    );
    for (const [nombre, sha] of Object.entries(poses.sha256)) {
      const hecho = createHash('sha256')
        .update(readFileSync(join(carpeta, nombre)))
        .digest('hex');
      expect(hecho, nombre).toBe(sha);
    }
  });
});
