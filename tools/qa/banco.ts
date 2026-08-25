/**
 * Banco de medida del núcleo: cuánto tarda y **si sale exactamente lo mismo**.
 *
 * No es un test —no falla, mide— y va aparte del barrido de semillas a
 * propósito: el barrido mide la IA (¿siguen terminando las partidas?), esto
 * mide el código (¿tarda menos y da lo mismo?).
 *
 * Lo que imprime, en una sola orden:
 *
 *  - el tiempo de las N partidas,
 *  - el **sha256 del volcado** —ganador, día y crónica completa de cada
 *    semilla—, que es el criterio de aceptación de cualquier refactorización
 *    del núcleo: si cambia, alguna partida se juega distinta,
 *  - el número de líneas del volcado y cuántas partidas no terminan,
 *  - y el tiempo de 300 `autoResolve` con semillas fijas, que es lo que mide
 *    el coste de `legalActions` sin el ruido del mapa.
 *
 * El volcado es una línea por hecho y no un JSON por partida a propósito: si
 * el sha cambia, `--dump` a dos ficheros y `diff` señala la semilla y el hecho
 * exactos en vez de decir «la partida 137 difiere».
 *
 * `node:crypto` aquí vale: esto es `tools/`, no `core`.
 *
 * Uso: pnpm banco [semillas=200] [dias=300] [--dump <fichero>]
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { autoResolve } from '../../src/core/ai/tactics.js';
import { playAiGame } from '../../src/core/ai/turn.js';
import { createBattle } from '../../src/core/battle/battle.js';
import { createRng } from '../../src/core/rng.js';
import { newGame, startingArmy } from '../../src/core/state/setup.js';

const args = process.argv.slice(2);
const iDump = args.indexOf('--dump');
const fichero = iDump === -1 ? null : args[iDump + 1];
if (iDump !== -1 && fichero === undefined) throw new Error('--dump necesita un fichero');
// El `-1` se descarta antes de filtrar: sin eso, `i !== iDump + 1` valía
// `i !== 0` y se comía el primer argumento cuando no había `--dump`.
const sueltos = iDump === -1 ? args : args.filter((_, i) => i !== iDump && i !== iDump + 1);

const SEMILLAS = Number(sueltos[0] ?? 200);
const DIAS = Number(sueltos[1] ?? 300);

const lineas: string[] = [];
const sinTerminar: number[] = [];

const t0 = performance.now();
for (let semilla = 1; semilla <= SEMILLAS; semilla++) {
  const state = newGame({ seed: semilla });
  // El `await` no cambia ni una tirada: aquí no hay director que se quede
  // ninguna batalla. Igual que en el barrido.
  await playAiGame(state, { rng: createRng(semilla) }, DIAS);

  const ganador = state.finished === null ? 'ninguno' : String(state.finished.winner);
  if (state.finished === null) sinTerminar.push(semilla);
  lineas.push(`${semilla} fin ganador=${ganador} dia=${state.day} hechos=${state.log.length}`);
  for (const [i, e] of state.log.entries()) lineas.push(`${semilla} ${i} ${JSON.stringify(e)}`);
}
const msPartidas = performance.now() - t0;

const volcado = `${lineas.join('\n')}\n`;
const sha = createHash('sha256').update(volcado).digest('hex');
if (fichero !== null && fichero !== undefined) writeFileSync(fichero, volcado);

console.log(`partidas:      ${SEMILLAS} semillas × ${DIAS} días → ${msPartidas.toFixed(0)} ms`);
console.log(`sha256:        ${sha}`);
console.log(`líneas:        ${lineas.length}`);
console.log(`sin terminar:  ${sinTerminar.length}/${SEMILLAS} → [${sinTerminar.join(', ')}]`);
if (fichero !== null && fichero !== undefined) console.log(`volcado:       ${fichero}`);

/**
 * Segunda medida, la de #48: 300 batallas de la IA contra sí misma.
 *
 * Va aparte porque `legalActions` no se nota en el reloj del barrido —el mapa
 * se lo come— y es justo lo que abarata izar el BFS fuera del bucle de
 * enemigos. Semillas fijas, así que la cifra es comparable entre pasadas.
 */
const BATALLAS = 300;
const t1 = performance.now();
let rondas = 0;
for (let i = 1; i <= BATALLAS; i++) {
  const rng = createRng(i * 7919);
  const battle = createBattle(
    { army: startingArmy('knight', rng), hero: null },
    { army: startingArmy('necromancer', rng), hero: null },
    rng,
  );
  rondas += autoResolve(battle, rng).rounds;
}
console.log(
  `autoResolve:   ${BATALLAS} batallas (${rondas} rondas) → ${(performance.now() - t1).toFixed(0)} ms`,
);
