/**
 * Barrido de semillas: ¿siguen terminando las partidas de IA contra IA?
 *
 * Las tres semillas de `test/game.test.ts` están elegidas a mano, así que medir
 * ahí no distingue «no empeora» de «suerte». Esto juega 40 partidas enteras con
 * la IA en los dos bandos y cuenta cuántas no terminan en 300 días.
 *
 * **La línea base es 0.** Lo fue 4 de 40, luego 2, y era #47: `captureTown`
 * escribía el dueño en el `Town` y no en el objeto del mapa, así que la IA veía
 * el castillo ENEMIGO donde tenía el suyo y se pasaba la partida entrando en su
 * propia casa. Medido sobre 200 semillas: **12 sin terminar antes, 0 después**.
 *
 * Que hoy sea cero convierte esta herramienta en algo más severo que un «no
 * empeora»: **una sola semilla que no termine es una regresión**. El margen de
 * 1,05 de `chooseHeroDestination` sigue haciendo falta —con 1,4 vuelven a salir
 * 3 de 200—, así que sube y baja con cuidado.
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
  // `playAiGame` es asíncrona desde que el director puede meterse en la batalla
  // que nace a mitad del turno del rival. Aquí no hay director: el `await` no
  // cambia ni una tirada, y por eso las semillas siguen siendo las mismas.
  await playAiGame(state, { rng: createRng(semilla) }, DIAS);

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
