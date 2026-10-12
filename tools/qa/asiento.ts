/**
 * Medida del asiento: ¿cuánto vale sentarse a la izquierda (atacante) cuando
 * los dos bandos son EL MISMO ejército, puesto en espejo, y juega la misma IA?
 *
 * La pide el tablero simétrico (`docs/agents/2026-10-11-tablero-simetrico/`):
 * con 11 columnas en todas las filas el tablero no era su propio espejo (el eje
 * de las pares en 5, el de las impares en 5,5) y el despliegue del defensor no
 * era el espejo del atacante. Con filas de 12 y 11 lo es; esta cifra dice si la
 * geometría dejó de inclinar la balanza.
 *
 * **Lo que NO separa**: el atacante tiene además su propio sesgo de iniciativa
 * (abre el primer empate de velocidad, `initiativeOrder`) y el orden de las
 * vecinas (E, SE, SW, W, NW, NE) desempata la IA hacia el este. La cifra es la
 * suma de todo lo que inclina el asiento; lo que mide el cambio es la diferencia
 * entre el antes y el después con las mismas parejas.
 *
 * Dos poblaciones, porque inclinan distinto, las de `enfrentamiento.ts`
 * (`ejercitos.ts`): por defecto stacks de 5 a 25 y con `--tropa` individuos de
 * nivel 1 a 4, de 3 a 6, como la tropa de partida. Cada batalla: una facción
 * al azar, el mismo ejército en los dos lados, una semilla de batalla propia
 * (`createRng`), jugada con `autoResolve`, la de las batallas del mapa.
 *
 * Uso: npx tsx tools/qa/asiento.ts [batallas=2000] [--tropa]
 */
import { autoResolve } from '../../src/core/ai/tactics.js';
import { createBattle } from '../../src/core/battle/battle.js';
import { createRng } from '../../src/core/rng.js';
import type { FactionId } from '../../src/core/types.js';
import { ejercitoDe, tropaDe } from './ejercitos.js';

const args = process.argv.slice(2);
const TROPA = args.includes('--tropa');
const BATALLAS = Number(args.find((a) => !a.startsWith('--')) ?? 2000);
if (!Number.isInteger(BATALLAS) || BATALLAS < 1) {
  throw new Error(`el número de batallas tiene que ser un entero positivo, no «${BATALLAS}»`);
}

const FACCIONES: readonly FactionId[] = ['knight', 'necromancer'];
const PRIMO_DE_EJERCITOS = 49_979_687;
const PRIMO_DE_BATALLA = 86_028_121;

let atacante = 0;
let rondas = 0;
const t0 = Date.now();
for (let i = 1; i <= BATALLAS; i++) {
  const rngDelEjercito = createRng(i * PRIMO_DE_EJERCITOS);
  const ejercito = (TROPA ? tropaDe : ejercitoDe)(rngDelEjercito.pick(FACCIONES), rngDelEjercito);
  const rng = createRng(i * PRIMO_DE_BATALLA);
  const estado = createBattle(
    { army: ejercito, hero: null },
    { army: ejercito.map((s) => ({ ...s })), hero: null },
    rng,
  );
  const r = autoResolve(estado, rng);
  if (r.winner === 'attacker') atacante++;
  rondas += r.rounds;
}
const p = atacante / BATALLAS;
const ic = 1.96 * Math.sqrt((p * (1 - p)) / BATALLAS);
console.log(
  `${TROPA ? 'tropa (individuos 1-4)' : 'stacks 5-25'}, ${BATALLAS} batallas espejo: ` +
    `gana el atacante ${atacante} (${(p * 100).toFixed(2)} % ± ${(ic * 100).toFixed(2)}), ` +
    `rondas de media ${(rondas / BATALLAS).toFixed(2)}, ${((Date.now() - t0) / 1000).toFixed(1)} s`,
);
