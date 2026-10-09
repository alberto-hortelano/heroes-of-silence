/**
 * Huella de lo que se pinta: por semilla, el sha256 de los volúmenes en el
 * orden del pintor (`separar`) y los planos, cada uno con su imagen, su
 * recorte, su caja (`cajaDeSprite`) y su tono. Dos composiciones con la misma
 * huella pintan lo mismo. Uso: npx tsx huella.ts <desde> <hasta>
 */
import { createHash } from 'node:crypto';
import { cajaDeSprite } from '../../../src/client/render/escenario/pasillo.js';
import { separar } from '../../../src/client/render/escenario/pintar.js';
import type { Sprite } from '../../../src/client/render/escenario/colocar.js';
import { partidaDe } from '../../../test/helpers.js';

const [desde, hasta] = process.argv.slice(2).map(Number);
const linea = (s: Sprite) =>
  `${s.src} ${s.recorte?.join(',')} ${cajaDeSprite(s).map((v) => v.toFixed(4)).join(',')} ${s.tono} ${s.clase}`;
for (let k = desde as number; k <= (hasta as number); k++) {
  const { planos, volumenes } = separar(partidaDe(k).escena);
  const h = createHash('sha256');
  for (const v of volumenes) h.update(`${linea(v.s)}\n`);
  h.update('--\n');
  for (const s of planos) h.update(`${linea(s)}\n`);
  console.log(`s${k} ${h.digest('hex').slice(0, 16)}`);
}
