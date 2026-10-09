/**
 * Lo que hay alrededor de una cara cortada: niveles, terreno, objetos, caras,
 * celdas y paredes puestas. Uso: npx tsx diag.ts <semilla> <x0> <y0> <x1> <y1>
 */
import { cajaDeSprite } from '../../../src/client/render/escenario/pasillo.js';
import { claveDe } from '../../../src/client/render/escenario/pintar.js';
import { partidaDe } from '../../../test/helpers.js';

const [semilla, x0, y0, x1, y1] = process.argv.slice(2).map(Number) as [number, number, number, number, number];
const { map, escena: e } = partidaDe(semilla);
const ini: Record<string, string> = { grass: '.', dirt: '.', snow: '.', sand: '.', swamp: '.', lava: '.', rough: '.', water: '~', mountain: '^', forest: 'T', cliff: '#', wall: 'W' };
console.log('     ' + Array.from({ length: x1 - x0 + 1 }, (_, i) => String((x0 + i) % 100).padStart(3)).join(''));
for (let y = y0; y <= y1; y++) {
  let fila = `${String(y).padStart(3)}  `;
  for (let x = x0; x <= x1; x++) {
    const i = y * e.W + x;
    const t = map.terrain[i] as string;
    const o = map.objects.find((o) => o.at.x === x && o.at.y === y && ['town', 'village', 'mine', 'node'].includes(o.kind));
    const c = o === undefined ? (ini[t] ?? '?') : o.kind[0]!.toUpperCase();
    fila += ` ${c}${e.nivel[i]}`;
  }
  console.log(fila);
}
const dentro = (c: readonly number[]) => c[2]! >= x0 && c[0]! <= x1 + 1 && c[3]! >= y0 && c[1]! <= y1 + 1;
for (const [k, c] of e.relieve.caras.entries())
  if (c.y >= y0 && c.y <= y1 && c.x1 + 1 >= x0 && c.x0 <= x1) console.log(`cara ${k} y${c.y} x${c.x0}-${c.x1} caida ${c.caida} ${c.material}`);
for (const c of e.relieve.celdas)
  if (c.vx >= x0 && c.vx <= x1 + 1 && c.vy >= y0 && c.vy <= y1 + 1) console.log(`celda ${c.tipo} v(${c.vx},${c.vy})`);
for (const s of e.sprites)
  if ((s.clase === 'pared' || s.clase === 'objeto') && dentro(cajaDeSprite(s)))
    console.log(
      `${s.clase} ${(s.src ?? 'null').replace(/^modulos\//, '')} x${s.x.toFixed(2)} y${s.y.toFixed(2)} clave${claveDe(s).toFixed(2)} alto${s.alto.toFixed(2)} caja ${cajaDeSprite(s).map((v) => v.toFixed(2)).join(',')} fa${s.filaAlta ?? '-'}`,
    );
for (const p of e.puentes) if (p.x >= x0 - 1 && p.x <= x1 + 1) console.log('puente', JSON.stringify(p).slice(0, 300));
