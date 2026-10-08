/**
 * Cuántas esperas y defensas se juegan hoy en las batallas espejo del banco
 * (`batallaDeSemilla`), y cuántas decisiones hay en total.
 * Uso: npx tsx docs/agents/2026-10-08-parte-guerra/medir.ts [semillas]
 */
import { batallaDeSemilla } from '../../../tools/qa/partidas.js';

const N = Number(process.argv[2] ?? 100);
const cuenta = new Map<string, number>();
let batallasConEspera = 0;
let decisiones = 0;
let batallasConDefensa = 0;
for (let s = 1; s <= N; s++) {
  const { state } = batallaDeSemilla(s);
  let w = 0;
  let d = 0;
  for (const e of state.log) {
    cuenta.set(e.kind, (cuenta.get(e.kind) ?? 0) + 1);
    if (e.kind === 'wait') w++;
    if (
      e.kind === 'move' || e.kind === 'wait' || e.kind === 'defend' || e.kind === 'cast' ||
      e.kind === 'surrender' || (e.kind === 'attack' && !e.retaliation) ||
      (e.kind === 'shoot' && e.splash !== true)
    )
      decisiones++;
    if (e.kind === 'defend') d++;
  }
  if (w > 0) batallasConEspera++;
  if (d > 0) batallasConDefensa++;
}
// Decisiones = lo que una acción escribe: move, attack (sin contraataque), shoot (sin salpicadura), wait, defend, cast, surrender.
console.log(`semillas: ${N}`);
console.log([...cuenta].sort().map(([k, v]) => `${k}=${v}`).join(' '));
console.log(`decisiones (acciones que escriben un hecho): ${decisiones}; esperas ${cuenta.get('wait') ?? 0} (${(((cuenta.get('wait') ?? 0) / decisiones) * 100).toFixed(1)} %), defensas ${cuenta.get('defend') ?? 0}`);
console.log(`batallas con al menos una espera: ${batallasConEspera}/${N}; con defensa: ${batallasConDefensa}/${N}`);
