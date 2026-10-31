/**
 * El esqueleto del maniquí como dato del taller (`pnpm taller maniqui <id> --huesos`,
 * la revisión de animaciones del 30-10-2026): cada `d<n>-<h>.huesos.json` de
 * `assets/unidades/_poses/` es el de la hoja que tiene al lado —su sha256 casa—,
 * trae los 20 huesos de cada una de las 7 celdas de cada fila, en el orden de las
 * filas de su hoja, y en el mundo la izquierda queda a la izquierda y los pies en el
 * suelo. Uno de otro render se rechaza.
 *
 * En el bucle rápido, los del piloto y el civil; en la orden lenta, todos.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIGURA, HOJAS_DE_FIGURA, type HojaDeFigura } from '../src/shared/arte.js';
import { DIR_MANIQUIES, HUESOS_DEL_MANIQUI } from '../tools/art/poses.js';
import { DIR_DEL_MANIQUI_CIVIL } from '../tools/taller/npcs.js';
import { huesosDeOtroRender, leerHuesos } from '../tools/taller/revision/maniqui.js';
import { segunPrisa } from './lento.js';

const RAIZ = join(import.meta.dirname, '..');
const PILOTO = ['caballero-de-la-muerte', 'templario-escudo', 'elfo-arquero'];

/** Las carpetas de maniquí que se miran: las que ya tienen esqueleto. */
const carpetas = [
  ...segunPrisa(
    PILOTO.map((id) => `${id}-8d`),
    readdirSync(DIR_MANIQUIES).filter((n) => n.endsWith('-8d')),
  ).map((n) => join(DIR_MANIQUIES, n)),
  join(RAIZ, DIR_DEL_MANIQUI_CIVIL),
].filter((c) => existsSync(join(c, 'd0-a.huesos.json')));

describe('el esqueleto de cada hoja del maniquí', () => {
  it('hay alguno que mirar', () => {
    expect(carpetas.length).toBeGreaterThan(0);
  });
  for (const carpeta of carpetas)
    it(`${carpeta.slice(RAIZ.length + 1)}: es el de su hoja, entero y con la izquierda a la izquierda`, () => {
      for (let d = 0; d < 8; d++)
        for (const h of Object.keys(HOJAS_DE_FIGURA) as HojaDeFigura[]) {
          if (!existsSync(join(carpeta, `d${d}-${h}.png`))) continue;
          const huesos = leerHuesos(carpeta, d, h);
          expect(huesos, `d${d}-${h} sin esqueleto`).not.toBeNull();
          if (huesos === null) continue;
          expect(huesosDeOtroRender(carpeta, d, h, huesos), `d${d}-${h}`).toBeNull();
          expect(huesos.filas.map((f) => f.clip)).toEqual([...HOJAS_DE_FIGURA[h]]);
          for (const f of huesos.filas) {
            expect(f.celdas, `d${d}-${h} ${f.clip}`).toHaveLength(FIGURA.columnas);
            for (const c of f.celdas) {
              expect(Object.keys(c.huesos).sort()).toEqual([...HUESOS_DEL_MANIQUI].sort());
              expect(Object.keys(c.mundo).sort()).toEqual([...HUESOS_DEL_MANIQUI].sort());
            }
          }
          const reposo = huesos.filas.find((f) => f.clip === 'idle')?.celdas[0];
          if (reposo === undefined) continue;
          // Mira a +z: su izquierda es +x, en las ocho direcciones (la rotación, deshecha).
          expect(reposo.mundo.LeftUpLeg?.[0], `d${d} la cadera izquierda`).toBeGreaterThan(
            reposo.mundo.RightUpLeg?.[0] as number,
          );
          // Los pies en el suelo: el hueso de la punta más bajo, a 6 cm o menos (el
          // hueso va dentro de la bota: el suelo es lo más bajo de la malla, ~3-4 cm más abajo).
          const pie = Math.min(
            ...['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'].map(
              (n) => reposo.mundo[n]?.[1] as number,
            ),
          );
          expect(pie, `d${d} el pie más bajo`).toBeLessThanOrEqual(0.06);
        }
    });
  it('un esqueleto con el sha de otra hoja se rechaza', () => {
    const carpeta = carpetas[0] as string;
    const huesos = leerHuesos(carpeta, 0, 'a');
    if (huesos === null) throw new Error('sin esqueleto');
    const otro = { ...huesos, hoja: { ...huesos.hoja, png: '0'.repeat(64) } };
    expect(huesosDeOtroRender(carpeta, 0, 'a', otro)).toMatch(/de otro render del maniquí/);
  });
});
