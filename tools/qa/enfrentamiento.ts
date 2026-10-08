/**
 * Banco de enfrentamiento: ¿la IA táctica nueva juega MEJOR que la de antes?
 *
 * Es la tercera medida del repositorio y no se pisa con las otras dos. El
 * barrido pregunta si las partidas siguen terminando; el banco (`banco.ts`), si
 * el código hace exactamente lo mismo. Esto pregunta lo que ninguna de las dos
 * puede: si un cambio DELIBERADO de la heurística gana más batallas.
 *
 * **Mide UNA regla a la vez**, la que se elige con la bandera: por defecto la
 * del turno en tramos (02-10-2026) —tras moverse, la IA vuelve a decidir y pega
 * si alcanza, en vez de cerrar el turno—, con `--espera` la regla de espera
 * (#52) y con `--carga` el paso de lado para cargar (02-10-2026). Cualquier otro cambio táctico que salga byte a byte idéntico —#50, sin
 * caballería en el tablero— devolvería aquí un 50,0 % por construcción, y ese
 * 50 % no significaría «no mejora»: significaría «no hay nada que medir». Hay
 * que decirlo al leer la cifra.
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
 * MISMA `chooseBattleAction` con la regla medida desactivada desde fuera. Para
 * los tramos, si la unidad ya se ha movido se cierra el turno sin preguntarle
 * —la primera decisión de un turno es idéntica en las dos, así que eso basta—;
 * para la espera, si devuelve `wait` se marca `waited` un instante y se le
 * vuelve a preguntar. Así el contrincante no envejece cuando la heurística
 * mejore por otro lado, y `core` no se entera de que este banco existe.
 *
 * Medido al entrar los tramos: **51,08 % ± 0,25** en 5 000 parejas (135 ganadas ·
 * 4 838 empatadas · 27 perdidas). Y una candidata que se descartó por la misma
 * vara: colocar a la caballería en un tramo para cargar en recta en el
 * siguiente dio **49,39 % ± 0,18**, entera por DEBAJO del 50 — colocarse la deja
 * expuesta sin comprar casi nada de carga.
 *
 * Medido al entrar el paso de lado para cargar (`--carga`, rival = la IA de
 * `c72bcd9`): **50,08 % ± 0,07** en 5 000 parejas (10 · 4 988 · 2), y en 10 000
 * 50,09 ± 0,05 (22 · 9 973 · 5). Las cargas cobradas por la IA que lo lleva
 * pasan de 190 a 1 602 sobre unos 7 000 golpes con el rasgo. Y la otra candidata
 * de aquel ciclo, que se descartó por la misma vara: contar la carga al elegir A
 * QUIÉN pegar dio **50,05 % ± 0,08**, con el intervalo tocando el 50.
 *
 * Con el paso de lado dentro, la cifra por defecto (el segundo tramo) sale
 * 51,39 % ± 0,27 en 5 000 parejas, y no el 51,08 de arriba: el rival que cierra
 * tras moverse tampoco puede dar el tramo de después del paso de lado.
 *
 * Medido al entrar el objetivo de acercamiento por el daño que de verdad hace
 * (#79, `--contra f07c259`, la IA entera de antes sacada de git): **50,66 % ±
 * 0,24** en 5 000 parejas (108 · 4 850 · 42). Lo que pedía #79 —restar la
 * represalia esperada— se midió con el mismo banco y no entró por ninguna
 * vara: con peso 1 da 49,93 ± 0,21 contra la misma regla sin ella, y pesa peor
 * cuanto más pesa (×0,5 49,78, ×2 49,27); eligiendo así también a quién pegar
 * ya pegado, 49,68 ± 0,23, entero por DEBAJO. Y `defend` (#80) tampoco: con
 * el mejor golpe a pérdida, defenderse da 49,43 ± 0,33 (2 000 parejas), y tras
 * esperar, defenderse antes que meter el morro, 49,33 ± 0,39 (3 000). Las
 * cifras y el porqué, en
 * `docs/agents/2026-10-08-represalia/implementacion.md`.
 *
 * ## `--magia`: con héroe y tropa de partida (#92)
 *
 * Sin la bandera los bandos van SIN héroe, así que ninguna batalla lanza un
 * hechizo y cualquier cambio en cómo los valora la IA sale 0 · N · 0 por
 * construcción. Con ella cada bando lleva un héroe como el inicial de una
 * partida —Poder 1, 20 de maná, el libro de un gremio de nivel 2— y tropa de
 * individuos de nivel 1 a 4, como la de los héroes de la IA en partida. Las
 * batallas duran 3,0 rondas de media entre dos IA de `1e19e6d` (en partida,
 * 3,1-3,5). Imprime además los hechizos lanzados por cada IA. Sus cifras no se
 * comparan con las de la tanda sin héroe: son otra población.
 *
 * Medido al entrar #92 (`--magia --contra 1e19e6d`): **74,25 % ± 0,72** en
 * 5 000 parejas (2 480 · 2 465 · 55). Casi todo es que la Flecha va a quien más
 * amenaza quita —al héroe, que es su bando entero—: valorar los temporales por
 * las rondas que de verdad compran, solo, da 0 · 5 000 · 0, porque con Poder 1
 * duran la ronda en curso y una Prisa no compra más que un golpe de un
 * individuo, que nunca llega a los 12 PV del umbral ni a los 20 de la Flecha.
 * Lanzados por la IA nueva: 22 027 Flechas y ningún otro hechizo.
 *
 * Uso: npx tsx tools/qa/enfrentamiento.ts [parejas=1000] [--espera] [--carga] [--contra <ref>] [--magia] [--espejo]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chooseBattleAction } from '../../src/core/ai/tactics.js';
import {
  activeStack,
  applyAction,
  type BattleSide,
  createBattle,
  type HeroeDelBando,
  MAX_JUGADAS,
  MAX_ROUNDS,
  seHaMovido,
} from '../../src/core/battle/battle.js';
import { allSpells } from '../../src/core/battle/spells.js';
import type { BattleAction, BattleState, Side } from '../../src/core/battle/types.js';
import { otroBando } from '../../src/core/battle/types.js';
import { factionLineup, hasTrait } from '../../src/core/data.js';
import { EQUIPO_BASE } from '../../src/core/hero/equipo.js';
import { EXPERIENCIA_INICIAL_DE_HEROE } from '../../src/core/hero/experiencia.js';
import { heroUnit } from '../../src/core/hero/hero.js';
import { createRng, type Rng } from '../../src/core/rng.js';
import type { FactionId, Stack, UnitInfo } from '../../src/core/types.js';

const args = process.argv.slice(2);
const ESPEJO = args.includes('--espejo');
const ESPERA = args.includes('--espera');
const CARGA = args.includes('--carga');
const MAGIA = args.includes('--magia');
const iContra = args.indexOf('--contra');
const CONTRA: string | null = iContra === -1 ? null : (args[iContra + 1] ?? null);
if (iContra !== -1 && (CONTRA === null || CONTRA.startsWith('--'))) {
  throw new Error('--contra necesita una referencia de git: --contra f07c259');
}
const PAREJAS = Number(
  args.find((a, i) => !a.startsWith('--') && (iContra === -1 || i !== iContra + 1)) ?? 1000,
);

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

/** La heurística de hoy, con todas sus reglas puestas. */
const deHoy: Tactica = chooseBattleAction;

/**
 * La heurística de hoy sin el segundo tramo: tras moverse cierra el turno, que
 * es lo que jugaba antes. Basta con eso desde fuera porque la regla solo cambia
 * las decisiones de una unidad que YA se ha movido.
 */
const sinSegundoTramo: Tactica = (state) => {
  const s = activeStack(state);
  if (s !== null && seHaMovido(state, s)) return { type: 'end_turn' };
  return chooseBattleAction(state);
};

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

/**
 * La heurística de hoy sin el paso de lado para cargar (02-10-2026), que es la
 * IA de `c72bcd9`.
 *
 * Esa regla solo puede elegir un `move` de una unidad con `charge`, así que
 * ahí, y solo ahí, se le vuelve a preguntar con el rasgo quitado un instante:
 * sin él `pasoParaCargar` no hace nada, y lo demás que decide un `move` no lo
 * mira. Lo que SÍ mira el rasgo —`mejorCarga`, al golpear— no sale nunca de
 * esta segunda pregunta con otra respuesta: si la regla no se dispara, la
 * primera ya era la de antes y se devuelve tal cual. Se restaura antes de
 * devolver, porque el rasgo es del motor y no de este banco.
 *
 * Que esto ES la IA de `c72bcd9` se comprobó jugándolo contra una copia
 * congelada de aquel `tactics.ts`: 0 · 5 000 · 0, las 5 000 parejas iguales.
 */
const sinPasoParaCargar: Tactica = (state) => {
  const accion = chooseBattleAction(state);
  const s = activeStack(state);
  if (accion.type !== 'move' || s === null || !hasTrait(s.unit, 'charge')) return accion;
  const conRasgo = s.unit;
  (s as { unit: UnitInfo }).unit = {
    ...conRasgo,
    traits: (conRasgo.traits ?? []).filter((t) => t !== 'charge'),
  };
  try {
    return chooseBattleAction(state);
  } finally {
    (s as { unit: UnitInfo }).unit = conRasgo;
  }
};

/**
 * Cinco stacks sacados del catálogo de la facción. Siguen siendo stacks de N y
 * no individuos a propósito: este banco mide la TÁCTICA sobre el motor, y sus
 * cifras de referencia están tomadas con estos ejércitos.
 */
function ejercitoDe(faction: FactionId, rng: Rng): Stack[] {
  const lineup = factionLineup(faction);
  return Array.from({ length: 5 }, () => ({
    creature: rng.pick(lineup).id,
    count: rng.int(EFECTIVOS[0], EFECTIVOS[1]),
  }));
}

interface Resultado {
  readonly winner: Side;
  readonly rounds: number;
  /**
   * Cuántas veces jugó cada bando `wait` y `defend`, la cola de la heurística.
   * Por bando, porque la represalia (#79, #80) se mide justo por cuántas
   * defensas juega la IA nueva frente a la de antes, no por la suma.
   */
  readonly esperas: Record<Side, number>;
  readonly defensas: Record<Side, number>;
  /** Los hechizos que lanzó cada bando, por id: lo que mide `--magia`. */
  readonly hechizos: Record<Side, string[]>;
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
  const esperas: Record<Side, number> = { attacker: 0, defender: 0 };
  const defensas: Record<Side, number> = { attacker: 0, defender: 0 };
  const hechizos: Record<Side, string[]> = { attacker: [], defender: [] };
  for (let turno = 0; turno < MAX_JUGADAS; turno++) {
    if (state.finished !== null) {
      return { winner: state.finished.winner, rounds: state.round, esperas, defensas, hechizos };
    }
    const s = activeStack(state);
    if (s === null) throw new Error('no hay stack activo y la batalla no ha terminado');
    const accion = tacticas[s.side](state);
    if (accion.type === 'wait') esperas[s.side]++;
    if (accion.type === 'defend') defensas[s.side]++;
    if (accion.type === 'cast') hechizos[s.side].push(accion.spell);
    applyAction(state, accion, rng);
  }
  throw new Error(`una batalla no ha terminado en ${MAX_JUGADAS} jugadas (ronda ${state.round})`);
}

/**
 * Con `--magia`, la tropa de una partida: individuos (`troopsAsStacks`, un
 * stack de 1 por cabeza), de 3 a 6 —con el héroe, los 7 que caben en un bando
 * (`createBattle`)—, sacados al azar de los niveles 1 a 4 de la facción. Así es
 * la tropa de los héroes de la IA en partida: muestreada turno a turno en 30
 * semillas (08-10-2026), 5 399 de 5 448 individuos son de nivel 1 a 4 y el
 * tamaño más común es 6.
 *
 * Con stacks de 5 a 25 una Flecha de 20 PV no se nota y una Prisa vale lo que
 * pegan veinte; en partida es al revés, y la cifra de un hechizo medida con
 * aquellos ejércitos no diría nada de su efecto en una partida.
 */
function tropaDe(faction: FactionId, rng: Rng): Stack[] {
  const lineup = factionLineup(faction).filter((c) => c.level <= 4);
  return Array.from({ length: rng.int(3, 6) }, () => ({ creature: rng.pick(lineup).id, count: 1 }));
}

/** Los dos ejércitos de una pareja: el mismo par para las dos batallas. */
function ejercitosDe(semilla: number): Record<Side, Stack[]> {
  const rng = createRng(semilla * PRIMO_DE_EJERCITOS);
  const de = MAGIA ? tropaDe : ejercitoDe;
  return { attacker: de('knight', rng), defender: de('necromancer', rng) };
}

/**
 * El libro del héroe en `--magia`: todo lo que enseña un gremio de nivel 2, que
 * es el tope que se construye hoy en partida (sin `mage_guild_3` no hay nivel
 * 3), con la Flecha del héroe inicial dentro.
 */
const LIBRO_DE_LA_MAGIA = allSpells()
  .filter((s) => s.level <= 2)
  .map((s) => s.id);

/**
 * Un héroe como el inicial de una partida (`newGame`): ataque y defensa 2,
 * Conocimiento 2 —20 de maná, lleno— y Poder 1, que es el que tienen TODOS los
 * héroes de hoy porque nada lo sube. Sin él, ninguna batalla de este banco
 * lanza un hechizo, y una heurística de hechizos medida aquí da el 50,0 % por
 * construcción.
 */
function heroeDeLaMagia(nombre: string): HeroeDelBando {
  const cifras = { name: nombre, attack: 2, defense: 2, experience: EXPERIENCIA_INICIAL_DE_HEROE };
  return {
    cuerpo: heroUnit({ ...cifras, equipo: EQUIPO_BASE }),
    mando: {
      name: nombre,
      retreat: { blocked: 'en el banco no se huye' },
      spellPower: 1,
      knowledge: 2,
      mana: 20,
      castThisRound: false,
      spells: LIBRO_DE_LA_MAGIA,
    },
  };
}

function batalla(
  semilla: number,
  ejercitos: Record<Side, Stack[]>,
  tacticas: Record<Side, Tactica>,
): Resultado {
  const rng = createRng(semilla * PRIMO_DE_DESPLIEGUE);
  const lado = (side: Side): BattleSide => ({
    army: ejercitos[side],
    hero: MAGIA ? heroeDeLaMagia(side === 'attacker' ? 'Atacante' : 'Defensor') : null,
  });
  return jugar(createBattle(lado('attacker'), lado('defender'), rng), rng, tacticas);
}

/**
 * La heurística ENTERA de otro commit, jugando sobre el motor de hoy.
 *
 * Existe para las reglas que no se apagan desde fuera. Las tres de arriba se
 * desactivan tocando un estado que la regla lee (`waited`, el rasgo, el tramo);
 * la represalia (#79) cambia A QUIÉN se pega y cuándo se defiende, y no hay
 * estado que tocar para que la IA vuelva a valorar un golpe sin ella. La copia
 * congelada que se descartaba arriba envejece; esta no, porque se saca de git
 * en cada pasada: `git show <ref>:src/core/ai/tactics.ts`, con sus imports
 * relativos apuntados al `src/core` de hoy —el mismo módulo del motor, no otra
 * copia—. Si el motor de hoy ya no casa con aquella heurística, `tsc` no se
 * entera y la tanda lanza al primer nombre que falte: se dice, no se mide.
 */
async function tacticaDe(ref: string): Promise<Tactica> {
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const fuente = execFileSync('git', ['show', `${ref}:src/core/ai/tactics.ts`], {
    cwd: raiz,
    encoding: 'utf8',
  });
  const core = pathToFileURL(join(raiz, 'src/core/')).href;
  const apuntada = fuente.replaceAll("from '../", `from '${core}`);
  if (apuntada === fuente) throw new Error(`la táctica de ${ref} no importa nada de src/core`);
  const fichero = join(raiz, '.cache/enfrentamiento', `tactics-${ref.replace(/[^\w.-]/g, '_')}.ts`);
  mkdirSync(dirname(fichero), { recursive: true });
  writeFileSync(fichero, apuntada);
  const modulo = (await import(pathToFileURL(fichero).href)) as { chooseBattleAction?: Tactica };
  if (typeof modulo.chooseBattleAction !== 'function') {
    throw new Error(`la táctica de ${ref} no exporta chooseBattleAction`);
  }
  return modulo.chooseBattleAction;
}

// ------------------------------------------------------------------ la tanda

/** El contrincante: la de hoy en el espejo, y si no la de hoy sin la regla medida. */
const rival: Tactica = ESPEJO
  ? deHoy
  : CONTRA !== null
    ? await tacticaDe(CONTRA)
    : ESPERA
      ? sinEspera
      : CARGA
        ? sinPasoParaCargar
        : sinSegundoTramo;
const REGLA =
  CONTRA !== null
    ? `todo lo que cambió desde ${CONTRA}`
    : ESPERA
      ? 'la espera'
      : CARGA
        ? 'el paso de lado para cargar'
        : 'el segundo tramo';

let victorias = 0;
/** La cola jugada, de la IA de hoy y de su rival por separado. */
const esperas = { hoy: 0, rival: 0 };
const defensas = { hoy: 0, rival: 0 };
const hechizos = { hoy: new Map<string, number>(), rival: new Map<string, number>() };
const contar = (en: Map<string, number>, ids: readonly string[]): void => {
  for (const id of ids) en.set(id, (en.get(id) ?? 0) + 1);
};
let peorRonda = 0;
let totalRondas = 0;
let enElTope = 0;
/** Cuántas parejas acaban 0-2, 1-1 y 2-0 para la táctica con espera. */
const reparto = [0, 0, 0];

const t0 = performance.now();
for (let semilla = 1; semilla <= PAREJAS; semilla++) {
  const ejercitos = ejercitosDe(semilla);
  let ganadasAqui = 0;

  // La misma pareja dos veces: primero la táctica de hoy ataca, después defiende.
  for (const asiento of ['attacker', 'defender'] as const) {
    const otro = otroBando(asiento);
    const r = batalla(semilla, ejercitos, {
      [asiento]: deHoy,
      [otro]: rival,
    } as Record<Side, Tactica>);

    if (r.winner === asiento) ganadasAqui++;
    esperas.hoy += r.esperas[asiento];
    esperas.rival += r.esperas[otro];
    defensas.hoy += r.defensas[asiento];
    defensas.rival += r.defensas[otro];
    contar(hechizos.hoy, r.hechizos[asiento]);
    contar(hechizos.rival, r.hechizos[otro]);
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
    `(IC 95 % pareado)${ESPEJO ? '' : ` de la IA CON ${REGLA}, contra la de antes`}`,
);
console.log(
  `parejas 2-0 · 1-1 · 0-2:  ${reparto[2]} ganadas · ${reparto[1]} empatadas · ${reparto[0]} perdidas`,
);
console.log(
  `rondas:        peor ${peorRonda}, media ${(totalRondas / batallas).toFixed(2)}, ${enElTope}/${batallas} en el tope de ${MAX_ROUNDS}`,
);
console.log(
  `cola jugada:   hoy ${esperas.hoy} esperas, ${defensas.hoy} defensas · ` +
    `rival ${esperas.rival} esperas, ${defensas.rival} defensas`,
);

if (MAGIA) {
  const lista = (en: Map<string, number>): string =>
    [...en]
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${id} ${n}`)
      .join(', ') || 'ninguno';
  console.log(`hechizos:      hoy ${lista(hechizos.hoy)}`);
  console.log(`               rival ${lista(hechizos.rival)}`);
}

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
