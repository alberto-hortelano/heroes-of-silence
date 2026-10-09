/**
 * Recortes de cada cara cortada de `medidas/antes.json` (o de las semillas que
 * se pasen), con la etiqueta dada: capturas/s<semilla>-y<fila>-x<a>-<etiqueta>.png.
 * Uso: npx tsx capturar.ts <etiqueta> [semillas…]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recortesDeSemilla } from '../../../tools/taller/escenario/escenario.js';

const DIR = import.meta.dirname;
const [etiqueta, ...pedidas] = process.argv.slice(2);
const antes = JSON.parse(readFileSync(join(DIR, 'medidas/antes.json'), 'utf8')) as {
  semilla: number;
  cortadas: { y: number; a: number; b: number }[];
}[];
for (const { semilla, cortadas } of antes) {
  if (cortadas.length === 0) continue;
  if (pedidas.length > 0 && !pedidas.map(Number).includes(semilla)) continue;
  await recortesDeSemilla(
    semilla,
    96,
    cortadas.map(({ y, a, b }) => ({
      caja: [Math.max(0, Math.floor(a) - 3), Math.max(0, y - 3), Math.floor(b) + 4, y + 4] as const,
      salida: join(DIR, 'capturas', `s${semilla}-y${y}-x${Math.floor(a)}-${etiqueta}.png`),
    })),
  );
  console.log(`s${semilla}`);
}
