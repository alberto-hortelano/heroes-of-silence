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
 * Las tripas —jugar la partida de una semilla y montar su batalla espejo— son
 * de `partidas.ts`, compartidas con `banco.ts`. Estaban copiadas en los dos, y
 * el día que una de las dos fórmulas cambiara habrían medido batallas distintas
 * sin decirlo.
 *
 * Uso: npx tsx tools/qa/barrido-semillas.ts [semillas] [dias]
 */
import { MAX_ROUNDS } from '../../src/core/battle/battle.js';
import {
  batallaDeSemilla,
  DIAS_POR_DEFECTO,
  partidaDeSemilla,
  resumenSinTerminar,
  SEMILLAS_DEL_BARRIDO,
} from './partidas.js';

const SEMILLAS = Number(process.argv[2] ?? SEMILLAS_DEL_BARRIDO);
const DIAS = Number(process.argv[3] ?? DIAS_POR_DEFECTO);

const sinTerminar: number[] = [];

for (let semilla = 1; semilla <= SEMILLAS; semilla++) {
  const { state, fin } = await partidaDeSemilla(semilla, DIAS);

  // «No la resolvió nadie en `DIAS` días» es `winner === null` y no
  // `finished === null`: preguntar por lo de antes daría 0/40 siempre y por
  // construcción, o sea un guardia verde que ha dejado de mirar.
  if (fin.winner === null) {
    sinTerminar.push(semilla);
    console.log(`  semilla ${String(semilla).padStart(3)} → SIN TERMINAR en ${DIAS} días`);
  } else {
    console.log(
      `  semilla ${String(semilla).padStart(3)} → gana ${fin.winner} el día ${state.day}`,
    );
  }
}

console.log('');
console.log(`sin terminar: ${resumenSinTerminar(sinTerminar, SEMILLAS)}`);

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
  const { rounds } = batallaDeSemilla(semilla);
  if (rounds > peorRonda) peorRonda = rounds;
  if (rounds >= MAX_ROUNDS) enElTope++;
}
console.log(
  `batallas IA vs IA: peor caso ${peorRonda} rondas, ${enElTope}/${SEMILLAS} en el tope de ${MAX_ROUNDS}`,
);
