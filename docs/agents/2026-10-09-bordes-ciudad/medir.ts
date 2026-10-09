/**
 * Mide los informes de la escena en un rango de semillas y lista las caras
 * cortadas con dónde caen. Uso: npx tsx medir.ts <desde> <hasta> <salida.json>
 */
import { writeFileSync } from 'node:fs';
import { carasCortadas } from '../../../src/client/render/escenario/caras.js';
import { partidaDe } from '../../../test/helpers.js';

const [desde, hasta, salida] = process.argv.slice(2);
const filas: unknown[] = [];
for (let s = Number(desde); s <= Number(hasta); s++) {
  const { map, escena: e } = partidaDe(s);
  const objs = map.objects.filter((o) => ['town', 'village', 'mine', 'node'].includes(o.kind));
  const cortadas = carasCortadas(
    e.relieve.caras,
    e.sprites,
    objs.map((o) => [o.at.x, o.at.y] as const),
    e.W,
  ).map((c) => {
    const cara = e.relieve.caras[c.cara]!;
    const cerca = objs
      .filter((o) => Math.hypot(o.at.x + 0.5 - (c.a + c.b) / 2, o.at.y - cara.y) <= 3.5)
      .map((o) => `${o.kind}${'barrera' in o && o.barrera ? `/${o.barrera}` : ''}(${o.at.x},${o.at.y})`);
    return { y: cara.y, a: +c.a.toFixed(2), b: +c.b.toFixed(2), cerca };
  });
  const informe = Object.fromEntries(
    Object.entries(e.informe).filter(([, v]) => typeof v === 'number'),
  );
  filas.push({ semilla: s, informe, cortadas });
  process.stderr.write(`s${s} ${cortadas.length}\n`);
}
writeFileSync(salida as string, JSON.stringify(filas));
