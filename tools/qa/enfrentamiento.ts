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
 * Y una advertencia sobre la población: los ejércitos son de este generador, no
 * de una partida. Aquí `charge` sale en el 8,2 % de los stacks y en partida real
 * en 0 de 1258 decisiones, así que la cifra de una táctica medida aquí **no es**
 * su efecto en una partida. Dos tandas de generadores distintos tampoco se
 * comparan entre sí.
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
 * se compara es la táctica, no el asiento.
 *
 * Eso neutraliza la ventaja del asiento **por construcción**, y conviene decir
 * qué NO lo demuestra: `--espejo` pone la misma función en los dos lados, así
 * que las dos batallas de cada pareja son **la misma partida calculada dos
 * veces** — gana el mismo bando y puntúa 1 de 2 siempre. Su 50,0 % es una
 * identidad algebraica, con varianza **cero**: no puede salir otra cosa ni
 * aunque el banco estuviera roto de otra manera. Lo que sí caza, y por eso se
 * queda, es que las dos batallas de una pareja **dejen** de ser la misma:
 * semilla o ejércitos que se cuelen por asiento.
 *
 * ## Por qué el intervalo es PAREADO
 *
 * La unidad independiente es la **pareja**, no la batalla: las dos batallas de
 * una comparten ejércitos y semilla, y casi siempre ganador. Tratarlas como
 * 2N observaciones independientes ensancha el intervalo al doble de lo que
 * toca —±0,41 pp donde son ±0,20— y encima imprimiría un ±0,7 pp sobre el
 * espejo, que no puede variar. Se computa sobre la puntuación por pareja
 * (0, ½ o 1) y el reparto se imprime al lado, que es lo que hace legible el
 * número: lo que decide son las parejas que NO empatan.
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
/** Cuántas parejas acaban 0-2, 1-1 y 2-0 para la táctica con espera. */
const reparto = [0, 0, 0];

const t0 = performance.now();
for (let semilla = 1; semilla <= PAREJAS; semilla++) {
  const ejercitos = ejercitosDe(semilla);
  let ganadasAqui = 0;

  // La misma pareja dos veces: primero la espera ataca, después defiende.
  for (const asiento of ['attacker', 'defender'] as const) {
    const otro: Side = asiento === 'attacker' ? 'defender' : 'attacker';
    const r = batalla(semilla, ejercitos, {
      [asiento]: conEspera,
      [otro]: rival,
    } as Record<Side, Tactica>);

    if (r.winner === asiento) ganadasAqui++;
    esperas += r.esperas;
    defensas += r.defensas;
    totalRondas += r.rounds;
    if (r.rounds > peorRonda) peorRonda = r.rounds;
    if (r.rounds >= MAX_ROUNDS) enElTope++;
  }
  victorias += ganadasAqui;
  reparto[ganadasAqui] = (reparto[ganadasAqui] as number) + 1;
}
const ms = performance.now() - t0;

const batallas = PAREJAS * 2;
const p = victorias / batallas;

/**
 * Intervalo del 95 % con la PAREJA como unidad, que es la independiente.
 *
 * Cada pareja puntúa 0, ½ o 1. La varianza sale de ese reparto y no de una
 * binomial sobre 2N batallas: las dos batallas de una pareja comparten
 * ejércitos, semilla y casi siempre ganador, así que contarlas como
 * independientes ensancha el intervalo al doble de lo que toca.
 */
function icPareado(): number {
  if (PAREJAS === 0) return 0;
  const puntos = [0, 0.5, 1];
  let suma = 0;
  let sumaCuadrados = 0;
  for (const [ganadas, n] of reparto.entries()) {
    suma += (puntos[ganadas] as number) * n;
    sumaCuadrados += (puntos[ganadas] as number) ** 2 * n;
  }
  const media = suma / PAREJAS;
  const varianza = Math.max(0, sumaCuadrados / PAREJAS - media * media);
  return 1.96 * Math.sqrt(varianza / PAREJAS);
}

const ic = icPareado();

console.log(
  `parejas:       ${PAREJAS} (${batallas} batallas, bandos alternados) → ${ms.toFixed(0)} ms`,
);
console.log(
  `victorias:     ${victorias}/${batallas} = ${(p * 100).toFixed(2)} % ± ${(ic * 100).toFixed(2)} pp ` +
    `(IC 95 % pareado)${ESPEJO ? '' : ' de la IA CON espera, contra la de antes'}`,
);
console.log(
  `parejas 2-0 · 1-1 · 0-2:  ${reparto[2]} ganadas · ${reparto[1]} empatadas · ${reparto[0]} perdidas`,
);
console.log(
  `rondas:        peor ${peorRonda}, media ${(totalRondas / batallas).toFixed(2)}, ${enElTope}/${batallas} en el tope de ${MAX_ROUNDS}`,
);
console.log(`cola jugada:   ${esperas} esperas, ${defensas} defensas`);

if (ESPEJO) {
  // El espejo no demuestra que alternar asientos quite el sesgo —eso es cierto
  // por construcción—: demuestra que las dos batallas de cada pareja son LA
  // MISMA. Por eso lo que se comprueba es el reparto y no el 50 %, que sale
  // solo. Un 1-1 en todas y varianza cero: si aparece una pareja 2-0 o 0-2, es
  // que por algún asiento se está colando una semilla o un ejército distinto,
  // y entonces la tanda normal no está comparando tácticas.
  console.log('espejo:        misma táctica en los dos asientos; el 50 % es una identidad,');
  console.log('               no una medida. Lo que se comprueba es el reparto 0 · N · 0.');
  if (reparto[1] !== PAREJAS) {
    process.exitCode = 1;
    console.error('');
    console.error(`ESPEJO ROTO: ${reparto[2]} parejas 2-0 y ${reparto[0]} parejas 0-2, y tienen`);
    console.error(`             que ser 0 y 0: las ${PAREJAS} deberían empatar 1-1, porque las`);
    console.error('             dos batallas de una pareja son la misma partida. Si no lo son,');
    console.error('             algo cambia con el asiento y la tanda normal no mide la táctica.');
  }
}
