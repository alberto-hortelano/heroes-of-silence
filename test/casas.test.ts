/**
 * Las casas sueltas de la labranza, recortadas de la hoja de pueblos
 * (`tools/taller/casas.ts`, 20-10-2026). Lo que caza: un pueblo repintado sin
 * volver a mirar sus casas (su sha256 ya no es el de la tabla), una casa
 * sustituida a mano sin rederivar (el sha256 del índice) y una semilla movida
 * sin volver a recortar (la caja de la procedencia ya no es la que sale).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CASAS_DE_LOS_PUEBLOS,
  cajaDelGrupo,
  particion,
  pueblosPartidos,
} from '../tools/taller/casas.js';
import { aRaster } from '../tools/taller/recorte.js';
import { sha256 } from './helpers.js';

const MODULOS = join(import.meta.dirname, '..', 'assets', 'mapa', 'modulos');
const leer = (f: string): any => JSON.parse(readFileSync(join(MODULOS, f), 'utf8'));

describe('las casas sueltas de la labranza', () => {
  const indice = leer('casas.json') as {
    modulos: { imagen: string; sha256: string; ancho: number; alto: number }[];
  };
  const procedencia = leer('casas.procedencia.json') as {
    modulos: { imagen: string; pueblo: number; casa: number; caja: number[] }[];
  };

  it('una por casa de la tabla, y cada imagen es la del índice', () => {
    expect(indice.modulos.length).toBe(CASAS_DE_LOS_PUEBLOS.flatMap((c) => c.casas).length);
    for (const m of indice.modulos) expect(m.sha256).toBe(sha256(join(MODULOS, 'casas', m.imagen)));
  });

  it('los pueblos son los que se miraron, y partirlos otra vez da las mismas cajas', async () => {
    const ps = await pueblosPartidos();
    const cajas = ps.flatMap((p) =>
      p.c.casas.map((_, g) => ({
        pueblo: p.c.pueblo,
        casa: g + 1,
        caja: [...cajaDelGrupo(p.grupo, p.r.width, g)],
      })),
    );
    expect(procedencia.modulos.map(({ pueblo, casa, caja }) => ({ pueblo, casa, caja }))).toEqual(
      cajas,
    );
  });

  it('una semilla en lo transparente lanza diciendo cuál', async () => {
    const r = await aRaster(readFileSync(join(MODULOS, 'pueblos', '1.webp')));
    expect(() => particion(r, [[[0, 0]]], 'el pueblo 1')).toThrow(
      /\(0, 0\) de el pueblo 1 caen en lo transparente/,
    );
  });
});
