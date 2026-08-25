/**
 * Banco de enfrentamiento: ¿la IA táctica nueva juega MEJOR que la de antes?
 *
 * Es la tercera medida del repositorio y no se pisa con las otras dos. El
 * barrido pregunta si las partidas siguen terminando; el banco (`banco.ts`), si
 * el código hace exactamente lo mismo. Esto pregunta lo que ninguna de las dos
 * puede: si un cambio DELIBERADO de la heurística gana más batallas.
 *
 * **Mide la regla de espera (#52) y nada más.** Cualquier otro cambio táctico
 * que salga byte a byte idéntico —#50, sin caballería en el tablero— devolvería
 * aquí un 50,0 % por construcción, y ese 50 % no significaría «no mejora»:
 * significaría «no hay nada que medir». Hay que decirlo al leer la cifra.
 *
 * ## Por qué a nivel de batalla y no de partida
 *
 * Distinguir un 55 % de un 50 % con partidas enteras pide 783 partidas; 40 dan
 * ±15,5 pp, que no distingue nada. Y a nivel de partida habría que meter la
 * táctica por bando en `GameContext` y bajarla dos capas, dejando sin definir
 * qué táctica lleva el monstruo neutral, cuyo bando no tiene dueño. La batalla
 * es donde vive el cambio: 2000 batallas dan ±2,2 pp en segundos.
 *
 * ## Por qué cada pareja se juega DOS veces
 *
 * El atacante gana los empates de velocidad (`initiativeOrder`), así que su
 * asiento vale puntos. Cada par de ejércitos se juega dos veces con los mismos
 * ejércitos en los mismos asientos y la táctica **cambiada de bando**: lo que
 * se compara es la táctica, no el asiento. Que eso basta no es una promesa,
 * es una comprobación que la herramienta trae puesta: `--espejo` pone la misma
 * táctica en los dos lados y tiene que dar **50,0 % exacto**.
 *
 * ## Qué es "la IA de antes"
 *
 * No es una copia congelada de `tactics.ts` ni un flag en producción: es la
 * MISMA `chooseBattleAction` con la rama de espera desactivada desde fuera —si
 * devuelve `wait`, se marca `waited` un instante y se le vuelve a preguntar—.
 * Así el contrincante no envejece cuando la heurística mejore por otro lado, y
 * `core` no se entera de que este banco existe.
 *
 * Uso: npx tsx tools/qa/enfrentamiento.ts [parejas=1000] [--espejo]
 */
import { chooseBattleAction } from '../../src/core/ai/tactics.js';
import {
  activeStack,
  applyAction,
  type BattleSide,
  createBattle,
  MAX_ROUNDS,
} from '../../src/core/battle/battle.js';
import type { BattleAction, BattleState, Side } from '../../src/core/battle/types.js';
import { factionLineup } from '../../src/core/data.js';
import { emptyArmy } from '../../src/core/hero/hero.js';
import { createRng, type Rng } from '../../src/core/rng.js';
import type { Army, FactionId } from '../../src/core/types.js';

const args = process.argv.slice(2);
const ESPEJO = args.includes('--espejo');
const PAREJAS = Number(args.find((a) => !a.startsWith('--')) ?? 1000);

/**
 * De semilla de pareja a semilla de ejércitos y a semilla de batalla.
 *
 * Dos primos distintos y grandes para que ejércitos y despliegue no vayan
 * acompasados, y para que dos parejas consecutivas no se parezcan. Mismo
 * motivo que el `PRIMO_DE_BATALLA` de `partidas.ts`, pero valores propios: si
 * compartieran semilla, este banco mediría las mismas batallas que el otro.
 */
const PRIMO_DE_EJERCITOS = 15_485_863;
const PRIMO_DE_DESPLIEGUE = 32_452_843;

/** Efectivos por stack. Ancho a propósito: un banco de batallas clavadas no mide. */
const EFECTIVOS = [5, 25] as const;

type Tactica = (state: BattleState) => BattleAction;

/** La heurística de hoy, con la regla de espera puesta. */
const conEspera: Tactica = chooseBattleAction;

/**
 * La heurística de hoy con la rama de espera apagada, que es la IA de antes.
 *
 * `waited` es justo la condición que la regla lee, así que marcarlo un instante
 * la desactiva sin tocar nada más — y se restaura antes de devolver, porque el
 * motor lo usa para decidir si `wait` sigue siendo legal esta ronda.
 */
const sinEspera: Tactica = (state) => {
  const accion = chooseBattleAction(state);
  if (accion.type !== 'wait') return accion;

  const s = activeStack(state);
  if (s === null) throw new Error('la heurística ha elegido esperar sin stack activo');
  s.waited = true;
  const alternativa = chooseBattleAction(state);
  s.waited = false;
  return alternativa;
};

/** Un ejército de cinco slots sacado del catálogo de la facción. */
function ejercitoDe(faction: FactionId, rng: Rng): Army {
  const lineup = factionLineup(faction);
  const army = [...emptyArmy()];
  for (let slot = 0; slot < army.length; slot++) {
    army[slot] = { creature: rng.pick(lineup).id, count: rng.int(EFECTIVOS[0], EFECTIVOS[1]) };
  }
  return army;
}

interface Resultado {
  readonly winner: Side;
  readonly rounds: number;
  /** Cuántas veces jugó cada bando `wait` y `defend`, la cola de la heurística. */
  readonly esperas: number;
  readonly defensas: number;
}

/**
 * Juega una batalla entera con una táctica por bando.
 *
 * No reutiliza `autoResolve` porque esa solo sabe jugar con la heurística en
 * los dos lados — y meterle la táctica por parámetro sería enseñarle a `core`
 * que existe una alternativa que solo existe aquí. El tope de turnos es un
 * seguro que no debería saltar: el motor cierra la batalla en `MAX_ROUNDS`, así
 * que si salta es que algo se ha estancado y se dice en vez de devolver un
 * ganador inventado.
 */
function jugar(state: BattleState, rng: Rng, tacticas: Record<Side, Tactica>): Resultado {
  let esperas = 0;
  let defensas = 0;
  for (let turno = 0; turno < 5000; turno++) {
    if (state.finished !== null) {
      return { winner: state.finished.winner, rounds: state.round, esperas, defensas };
    }
    const s = activeStack(state);
    if (s === null) throw new Error('no hay stack activo y la batalla no ha terminado');
    const accion = tacticas[s.side](state);
    if (accion.type === 'wait') esperas++;
    if (accion.type === 'defend') defensas++;
    applyAction(state, accion, rng);
  }
  throw new Error(`una batalla no ha terminado en 5000 turnos (ronda ${state.round})`);
}

/** Los dos ejércitos de una pareja: el mismo par para las dos batallas. */
function ejercitosDe(semilla: number): Record<Side, Army> {
  const rng = createRng(semilla * PRIMO_DE_EJERCITOS);
  return { attacker: ejercitoDe('knight', rng), defender: ejercitoDe('necromancer', rng) };
}

function batalla(
  semilla: number,
  ejercitos: Record<Side, Army>,
  tacticas: Record<Side, Tactica>,
): Resultado {
  const rng = createRng(semilla * PRIMO_DE_DESPLIEGUE);
  const lado = (side: Side): BattleSide => ({ army: ejercitos[side], hero: null });
  return jugar(createBattle(lado('attacker'), lado('defender'), rng), rng, tacticas);
}

// ------------------------------------------------------------------ la tanda

/** El contrincante de la espera: ella misma en el espejo, la de antes si no. */
const rival: Tactica = ESPEJO ? conEspera : sinEspera;

let victorias = 0;
let esperas = 0;
let defensas = 0;
let peorRonda = 0;
let totalRondas = 0;
let enElTope = 0;

const t0 = performance.now();
for (let semilla = 1; semilla <= PAREJAS; semilla++) {
  const ejercitos = ejercitosDe(semilla);

  // La misma pareja dos veces: primero la espera ataca, después defiende.
  for (const asiento of ['attacker', 'defender'] as const) {
    const otro: Side = asiento === 'attacker' ? 'defender' : 'attacker';
    const r = batalla(semilla, ejercitos, {
      [asiento]: conEspera,
      [otro]: rival,
    } as Record<Side, Tactica>);

    if (r.winner === asiento) victorias++;
    esperas += r.esperas;
    defensas += r.defensas;
    totalRondas += r.rounds;
    if (r.rounds > peorRonda) peorRonda = r.rounds;
    if (r.rounds >= MAX_ROUNDS) enElTope++;
  }
}
const ms = performance.now() - t0;

const batallas = PAREJAS * 2;
const p = victorias / batallas;
// IC del 95 % de una binomial, normal aproximada: con 2000 batallas son ±2,2 pp.
const ic = 1.96 * Math.sqrt((p * (1 - p)) / batallas);

console.log(
  `parejas:       ${PAREJAS} (${batallas} batallas, bandos alternados) → ${ms.toFixed(0)} ms`,
);
console.log(
  `victorias:     ${victorias}/${batallas} = ${(p * 100).toFixed(1)} % ± ${(ic * 100).toFixed(1)} pp` +
    (ESPEJO
      ? '  (espejo: tiene que ser 50,0 % exacto)'
      : '  de la IA CON espera, contra la de antes'),
);
console.log(
  `rondas:        peor ${peorRonda}, media ${(totalRondas / batallas).toFixed(2)}, ${enElTope}/${batallas} en el tope de ${MAX_ROUNDS}`,
);
console.log(`cola jugada:   ${esperas} esperas, ${defensas} defensas`);

if (ESPEJO && victorias * 2 !== batallas) {
  process.exitCode = 1;
  console.error('');
  console.error(`ESPEJO SESGADO: con la misma táctica en los dos lados han salido ${victorias}`);
  console.error(
    `                de ${batallas}, y tienen que ser ${batallas / 2} exactas. Alternar`,
  );
  console.error('                los bandos ya no neutraliza la ventaja del atacante, así que');
  console.error('                la cifra de arriba no mide la táctica: mide el asiento.');
}
