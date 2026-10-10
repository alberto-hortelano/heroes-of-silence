/**
 * Las murallas de los mapas procedimentales, medidas sobre el mapa hecho
 * (#232): cuántas hay, cuánto miden, cuáles no tienen puerta y cuáles no
 * llegan a sus dos apoyos naturales.
 *
 *   npx tsx tools/qa/murallas.ts [desde] [hasta] [--bosque]
 *
 * Una muralla es lo que la escena une en una: el muro y los nodos de muro, sus
 * puertas, 8-conexo (`murallasDelMapa`). Sus apoyos, `apoyosDeLaMuralla`.
 */
import { buildMap, generateMapPlan } from '../../src/core/map/generate.js';
import { murallasDelMapa } from '../../src/core/map/murallas.js';
import { createRng } from '../../src/core/rng.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const desde = Number(args[0] ?? 1);
const hasta = Number(args[1] ?? 200);

let franjas = 0;
let casillas = 0;
let sinPuerta = 0;
let sinApoyos = 0;
let sumaLargo = 0;
let conMuralla = 0;
let conPuerta = 0;
const largos: number[] = [];
const malas: string[] = [];
for (let s = desde; s <= hasta; s++) {
  const { map } = buildMap(generateMapPlan(createRng(s)));
  const murallas = murallasDelMapa(map);
  if (murallas.length > 0) conMuralla++;
  if (murallas.some((m) => m.puertas.length > 0)) conPuerta++;
  for (const m of murallas) {
    franjas++;
    casillas += m.casillas.length - m.puertas.length;
    sumaLargo += m.largo;
    largos.push(m.largo);
    const { x, y } = { x: m.casillas[0]! % map.width, y: Math.floor(m.casillas[0]! / map.width) };
    if (m.puertas.length === 0) {
      sinPuerta++;
      malas.push(`s${s} (${x},${y}) sin puerta, largo ${m.largo}`);
    } else if (m.sinApoyo.length > 0) {
      sinApoyos++;
      malas.push(`s${s} (${x},${y}) ${m.sinApoyo.join('; ')}, largo ${m.largo}`);
    }
  }
}
largos.sort((a, b) => a - b);
const n = hasta - desde + 1;
console.log(`semillas ${desde}-${hasta}`);
console.log(`mapas con muralla: ${conMuralla} de ${n}; con una muralla con puerta: ${conPuerta}`);
console.log(`franjas de muro: ${franjas} (${(franjas / n).toFixed(2)} por mapa)`);
console.log(`casillas de muro (sin puertas): ${casillas}`);
console.log(`sin puerta: ${sinPuerta}`);
console.log(`con puerta y sin sus dos apoyos: ${sinApoyos}`);
console.log(
  `largo medio ${(sumaLargo / Math.max(1, franjas)).toFixed(2)}, mediana ${largos[largos.length >> 1] ?? 0}, máximo ${largos.at(-1) ?? 0}`,
);
if (process.argv.includes('--lista')) for (const m of malas) console.log(`  ${m}`);
