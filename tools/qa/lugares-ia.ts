/**
 * `npx tsx tools/qa/lugares-ia.ts [mundo…]`: juega cada mundo IA contra IA hasta
 * el final y cuenta los hechos de los lugares de cada bando (F1a del mapa vivo,
 * C6). No es un test ni una medida de equilibrio: es ver que la IA de reglas
 * entra en los lugares, que cada premio se cobra una vez y que la partida acaba.
 *
 * Con el tiempo de la partida y por día (la trama de los mundos, 22-10-2026): la IA
 * prueba en cada turno las jugadas de cada lugar (`hariaAlgoEn`), y un mundo con
 * más lugares y más opciones la encarece. Una medida para comparar mundos, no una
 * regla: incluye la batalla y todo lo demás del turno.
 */
import { playAiGame } from '../../src/core/ai/turn.js';
import { partidaDelMundo } from '../../src/core/mundo/partida.js';
import { createRng } from '../../src/core/rng.js';
import { leerMundoDeDisco } from '../mundo/disco.js';

const LUGAR = new Set(['place_state', 'world_mark', 'gold_paid', 'item_given', 'troops_joined']);

for (const id of process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['prueba']) {
  const { mundo } = await leerMundoDeDisco(id);
  const state = partidaDelMundo(mundo, { 0: 'ai', 1: 'ai' }, 300);
  const t0 = performance.now();
  const fin = await playAiGame(state, { rng: createRng(mundo.mundo.semilla ^ 0x5eed) });
  const ms = performance.now() - t0;
  const porBando = new Map<number, Map<string, number>>();
  let delLugar = 0;
  for (const e of state.log) {
    const esDeLugar =
      LUGAR.has(e.kind) ||
      ((e.kind === 'gold_gained' || e.kind === 'loot_found') && e.from === 'lugar') ||
      ((e.kind === 'battle_started' || e.kind === 'battle_ended') && e.foe.kind === 'lugar');
    if (!esDeLugar || e.actor === null) continue;
    delLugar++;
    const m = porBando.get(e.actor) ?? new Map<string, number>();
    const clave = e.kind === 'place_state' ? `place_state ${e.lugar}→${e.estado}` : e.kind;
    m.set(clave, (m.get(clave) ?? 0) + 1);
    porBando.set(e.actor, m);
  }
  console.log(
    `${id}: gana ${fin.winner ?? 'nadie'} el día ${state.day}; ${delLugar} hechos de lugares; ${Math.round(ms)} ms la partida, ${Math.round(ms / state.day)} ms por día`,
  );
  for (const [bando, m] of [...porBando].sort((a, b) => a[0] - b[0])) {
    console.log(`  jugador ${bando}: ${[...m].map(([k, n]) => `${k} ×${n}`).join(', ')}`);
  }
  console.log(`  estados al final: ${JSON.stringify(state.mundo?.estados)}`);
  console.log(`  marcas al final: ${JSON.stringify(state.mundo?.marcas)}`);
}
