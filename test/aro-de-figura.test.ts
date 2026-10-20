/**
 * El aro de una figura de pie (la elegida de la tropa, quien señala el ratón en la
 * base) va alrededor de sus pies, como una peana, y no por delante de ellos (QA de
 * la tropa en escena, H1, 20-10-2026).
 *
 * El apoyo de una hoja es la fila opaca más baja: la suela del pie que va delante.
 * El aro se centra en los pies medidos en el fotograma (`piesEn`, `aroDeFigura`,
 * `render/aro.ts`); aquí se miden con la misma regla sobre el arte del disco y se
 * exige que los dos pies caigan dentro del aro. Con el aro de antes —centrado en
 * el apoyo y siempre del mismo tamaño— se sale algún pie en 38 de las 50 hojas;
 * con un número fijo por encima del apoyo (el 0,07 del medio de lo medido), en 20.
 *
 * En el reposo de frente (`d0`, la hoja `S` de la escena de la tropa), primer
 * fotograma. En `pnpm verify`, las hojas de la QA y las de guardia más abierta; en
 * `pnpm verify:lento`, todas.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  ARO_DE_FIGURA,
  type AroEnPantalla,
  aroDeFigura,
  type PiesDeLaFigura,
  piesEn,
} from '../src/client/render/aro.js';
import { FIGURA } from '../src/shared/arte.js';
import { segunPrisa } from './lento.js';

const UNIDADES = fileURLToPath(new URL('../assets/unidades/', import.meta.url));

/** Las hojas con reposo de frente: las de la tropa y los héroes. */
const TODAS = readdirSync(UNIDADES)
  .filter((u) => existsSync(`${UNIDADES}${u}/d0/atlas.json`))
  .sort();

/** Las de la QA (`zoom-aro-*.png`, `s7`), las de guardia más abierta y una túnica. */
const MUESTRA = [
  'heroe-elfo-danzante-de-espadas',
  'heroe-orko-kaudillo',
  'templario-escudo',
  'imperio-rodelero',
  'heroe-elfo-druida',
];

async function piesDe(hoja: string): Promise<PiesDeLaFigura> {
  const atlas = JSON.parse(readFileSync(`${UNIDADES}${hoja}/d0/atlas.json`, 'utf8')) as {
    cell: number;
    clips: { idle: { row: number; anchor: [number, number] } };
  };
  const { data, info } = await sharp(`${UNIDADES}${hoja}/d0/atlas.webp`)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { cell } = atlas;
  const { row, anchor } = atlas.clips.idle;
  const pies = piesEn(
    (x, y) => data[((row * cell + y) * info.width + x) * 4 + 3] as number,
    cell,
    anchor,
    FIGURA.alturaAdulto,
  );
  if (pies === null) throw new Error(`${hoja}: no hay nada opaco a los pies del apoyo`);
  return pies;
}

/** Cuánto cae un punto (en altos de adulto, y hacia arriba, sobre el apoyo) dentro del aro: < 1 dentro. */
function enElAro(aro: AroEnPantalla, [x, y]: readonly [number, number]): number {
  // Una figura de un adulto de alto 1 con el apoyo en el origen: pantalla = altos de adulto.
  const dx = (x - aro.x) / aro.rx;
  const dy = (-y - aro.y) / aro.ry;
  return dx * dx + dy * dy;
}

const CAJA = { x: 0, suelo: 0, alto: 1 };

describe('el aro de una figura de pie va alrededor de sus pies (QA de la tropa, H1)', () => {
  it.each(segunPrisa(MUESTRA, TODAS))('%s: sus dos pies caen dentro del aro', async (hoja) => {
    const pies = await piesDe(hoja);
    const aro = aroDeFigura(CAJA, pies);
    for (const punto of pies.puntos) {
      expect(
        enElAro(aro, punto),
        `${hoja}: el pie en ${punto.map((v) => v.toFixed(2))}`,
      ).toBeLessThan(1);
    }
    // Crece con la guardia abierta, pero no hasta comerse a los de al lado (la caja
    // de una figura mide 0,42 de ancho; en 50 hojas, 0,51 el más grande).
    expect(aro.rx, `${hoja}: el aro mide ${aro.rx.toFixed(2)} de radio`).toBeLessThan(0.55);
  });

  it('sin medir (el marcador, que acaba en el apoyo), el aro de siempre, centrado en él', () => {
    const aro = aroDeFigura({ x: 10, suelo: 100, alto: 200 }, null);
    expect(aro).toEqual({
      x: 10,
      y: 100,
      rx: 200 * ARO_DE_FIGURA.radio,
      ry: 200 * ARO_DE_FIGURA.radio * ARO_DE_FIGURA.aplastado,
    });
  });
});
