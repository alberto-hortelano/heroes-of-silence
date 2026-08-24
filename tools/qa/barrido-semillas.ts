/**
 * Barrido de semillas: ¿siguen terminando las partidas de IA contra IA?
 *
 * Las tres semillas de `test/game.test.ts` están elegidas a mano para esquivar
 * el empate eterno de #47, así que medir ahí no distingue «no empeora» de
 * «suerte». Esto juega 40 partidas enteras con la IA en los dos bandos y
 * cuenta cuántas no terminan en 300 días.
 *
 * La medida es **no empeorar**, no arreglar #47. La línea base de **antes** del
 * racimo de la magia era 4 de 40 (semillas 9, 18, 24 y 34); desde que la IA
 * lanza hechizos son **2 de 40** (semillas 9 y 18), que es contra lo que se
 * compara ahora. Si sube, se para y se dice: subir `VALOR_MINIMO_POR_MANA` para
 * taparlo rompe el caso bueno, que es el primer lanzamiento.
 *
 * Uso: npx tsx tools/qa/barrido-semillas.ts [semillas] [dias]
 */
import { autoResolve } from '../../src/core/ai/tactics.js';
import { playAiGame } from '../../src/core/ai/turn.js';
import { createBattle, MAX_ROUNDS } from '../../src/core/battle/battle.js';
import { createRng } from '../../src/core/rng.js';
import { newGame, startingArmy } from '../../src/core/state/setup.js';

const SEMILLAS = Number(process.argv[2] ?? 40);
const DIAS = Number(process.argv[3] ?? 300);

const sinTerminar: number[] = [];

for (let semilla = 1; semilla <= SEMILLAS; semilla++) {
  const state = newGame({ seed: semilla });
  playAiGame(state, { rng: createRng(semilla) }, DIAS);

  if (state.finished === null) {
    sinTerminar.push(semilla);
    console.log(`  semilla ${String(semilla).padStart(3)} → SIN TERMINAR en ${DIAS} días`);
  } else {
    console.log(
      `  semilla ${String(semilla).padStart(3)} → gana ${state.finished.winner} el día ${state.day}`,
    );
  }
}

console.log('');
console.log(`sin terminar: ${sinTerminar.length}/${SEMILLAS} → [${sinTerminar.join(', ')}]`);

/**
 * Segunda medida, la que vigila que `wait` no estanque nada: batallas de la IA
 * contra sí misma, contando en qué ronda acaban.
 *
 * No se puede leer del barrido de arriba porque una batalla resuelta ya no está
 * en el `GameState`, y `finishByExhaustion` deja el mismo `finished` que una
 * victoria limpia. Aquí se juegan aparte y se mira `rounds`: una que toque
 * `MAX_ROUNDS` es una que no converge.
 */
let peorRonda = 0;
let enElTope = 0;
for (let semilla = 1; semilla <= SEMILLAS; semilla++) {
  const rng = createRng(semilla * 7919);
  const battle = createBattle(
    { army: startingArmy('knight', rng), hero: null },
    { army: startingArmy('necromancer', rng), hero: null },
    rng,
  );
  const { rounds } = autoResolve(battle, rng);
  if (rounds > peorRonda) peorRonda = rounds;
  if (rounds >= MAX_ROUNDS) enElTope++;
}
console.log(`batallas IA vs IA: peor caso ${peorRonda} rondas, ${enElTope}/${SEMILLAS} en el tope de ${MAX_ROUNDS}`);
