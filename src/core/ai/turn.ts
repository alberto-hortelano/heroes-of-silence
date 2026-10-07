/**
 * Juega un turno entero de un jugador con la IA de respaldo: construye,
 * recluta, mueve a sus héroes y resuelve las batallas que provoque.
 */

import type { Hero } from '../hero/hero.js';
import { pointKey, type Reachable } from '../map/map.js';
import { ROAD_COST } from '../map/terrain.js';
import {
  alcanceDelHeroe,
  applyAdventureAction,
  baseOf,
  currentPlayer,
  type GameContext,
  type GameOutcome,
  type GameState,
  heroesOf,
  resolvePendingBattle,
} from '../state/game.js';
import type { PlayerId, Point } from '../types.js';
import { turnosEnLaMismaCasilla, vueltaDelVaiven } from './memoria.js';
import {
  chooseHeroDestination,
  destinoDeRepliegue,
  planBuildings,
  planHires,
  planRecruits,
  siguienteDeEquipo,
  stepTowards,
} from './strategy.js';

/** Si el héroe está en la casilla de la base de su dueño. */
function enSuBase(state: GameState, hero: Hero): boolean {
  const base = baseOf(state, hero.owner);
  return base !== null && base.at.x === hero.at.x && base.at.y === hero.at.y;
}

/**
 * Turnos seguidos encerrado —empezando en la misma casilla, con el alcance
 * prudente reducido a ella— tras los que el héroe deja de esperar y vuelve a
 * casa aunque el rival esté libre: esperar ya no ha arreglado nada (#181). En
 * las 200 partidas del banco el encierro más largo es de 7 turnos y acaba solo;
 * el de la semilla 1189 con lado 40 dura 20 y lo acaba el rival ganando.
 */
const TURNOS_DE_ENCIERRO = 10;

/**
 * El paso de hoy de un héroe que está en un vaivén (`vueltaDelVaiven`), si el
 * que iba a dar cerraría otra vuelta: el mejor objetivo cuyo paso no la cierra,
 * o su base con la misma condición. `null` es quedarse quieto hoy, que también
 * rompe el vaivén: mañana empieza donde no empezó ninguna vuelta.
 */
function pasoFueraDelVaiven(
  state: GameState,
  hero: Hero,
  alcance: Reachable,
  vuelta: Point,
): Point | null {
  const otraVuelta = (at: Point): boolean => {
    const paso = stepTowards(hero, at, alcance);
    return paso === null || pointKey(paso) === pointKey(vuelta);
  };
  const destino = chooseHeroDestination(state, hero, alcance, (at) => !otraVuelta(at));
  if (destino !== null) return stepTowards(hero, destino, alcance);
  const aCasa = destinoDeRepliegue(state, hero, alcance);
  return aCasa === null || otraVuelta(aCasa) ? null : stepTowards(hero, aCasa, alcance);
}

/**
 * A dónde anda hoy `hero` y por qué alcance, o `null` si se queda quieto: las
 * decisiones de un paso del turno, sin aplicarlo. Se exporta para que los tests
 * de #181 pregunten por la decisión sin jugar el turno entero.
 */
export function marchaDeHoy(
  state: GameState,
  hero: Hero,
): { readonly paso: Point; readonly alcance: Reachable } | null {
  // El único Dijkstra del movimiento, y se ve dónde se hace. Sin tope,
  // porque el objetivo puede estar a diez días de marcha. Alimenta a las
  // TRES decisiones: elegir a dónde ir, hasta dónde llegar hoy, y por
  // dónde se va — que antes recorrían el mapa una vez cada una desde el
  // mismo origen.
  //
  // Es el alcance PRUDENTE: no pisa las regiones donde a este héroe lo
  // emboscarían. Si así no tiene a dónde ir, **se repliega**: vuelve a su
  // base, o se queda en ella, y allí cambia tropa y recluta
  // (`planRecruits`) hasta que los grupos dejan de sacarle el margen.
  // Antes iba igual por el alcance de siempre, y eso eran 270 de cada 304
  // emboscadas perdidas: lo que tapaba no era la IA sino que el héroe no
  // podía crecer, y desde que puede licenciar, sí.
  let alcance = alcanceDelHeroe(state, hero, { evitarEmboscadas: true });
  let destino =
    chooseHeroDestination(state, hero, alcance) ?? destinoDeRepliegue(state, hero, alcance);
  // Y si el alcance prudente es **su propia casilla** —está en mitad de una
  // región que lo embosca y no tiene un nodo al lado— y **los héroes del
  // rival están igual**, vuelve a casa por el alcance de siempre. Es un
  // empate eterno: un grupo no ataca a un héroe parado y se dispersa solo
  // cuando su región tiene dueño, y con un héroe por bando y los dos
  // encerrados no hay nadie que lo cambie. Lo destapó la semilla 10 del
  // banco con los mapas densos (vuelta 1 de QA): los dos héroes, sin tropa
  // tras vencer a un monstruo, 298 días sin moverse nadie.
  //
  // No es el «ve igual» que se quitó, que iba a por objetivos a través de
  // los grupos: esto solo vuelve a casa, y solo cuando esperar ya no
  // arregla nada. Que el rival también esté encerrado es lo que lo dice:
  // sin esa condición (solo «no puede dar ni un paso»), en la semilla 11 el
  // héroe salía a la emboscada un día antes de que el rival ganara la
  // partida, y con los mapas de antes cambiaban 21 de las 200 partidas del
  // banco —45 abierta a «no llega a casa sin cruzar una emboscada»—. Con
  // ella, ninguna: con el generador de antes, el banco sale igual.
  if (destino === null && alcance.costs.size <= 1 && !enSuBase(state, hero)) {
    const rivales = state.heroes.filter((h) => h.owner !== hero.owner);
    const todosEncerrados =
      rivales.length > 0 &&
      rivales.every((h) => alcanceDelHeroe(state, h, { evitarEmboscadas: true }).costs.size <= 1);
    // Y si el rival está libre pero esto dura ya `TURNOS_DE_ENCIERRO`, también
    // (#181): con un rival libre que no entra en la región —el grupo lo
    // emboscaría a él también—, nadie la cambia. La semilla 1393 de una
    // variante del generador de R3 se quedó así del día 50 al 300.
    const yaNoArregla =
      todosEncerrados ||
      turnosEnLaMismaCasilla(state, hero, TURNOS_DE_ENCIERRO) >= TURNOS_DE_ENCIERRO;
    if (yaNoArregla) {
      const sinPrudencia = alcanceDelHeroe(state, hero);
      const aCasa = destinoDeRepliegue(state, hero, sinPrudencia);
      if (aCasa !== null) {
        alcance = sinPrudencia;
        destino = aCasa;
      }
    }
  }
  if (destino === null) return null;

  // El objetivo puede estar a varios días: se avanza lo que dé el día.
  let paso = stepTowards(hero, destino, alcance);
  if (paso === null) return null;
  // Salvo si ese paso cierra otra vuelta de un vaivén (#181): decidir desde
  // cero cada día daba la misma respuesta mala cada día. Solo se mira aquí,
  // con el paso ya decidido, y solo cambia algo si lo hay.
  const vuelta = vueltaDelVaiven(state, hero);
  if (vuelta !== null && pointKey(paso) === pointKey(vuelta)) {
    paso = pasoFueraDelVaiven(state, hero, alcance, vuelta);
    if (paso === null) return null;
  }

  return { paso, alcance };
}

/** Tope de movimientos por turno: una red contra un bucle de objetivos. */
const MAX_MOVIMIENTOS_POR_TURNO = 60;

/** Tope de compras y equipamientos por turno: otra red, para lo mismo. */
const MAX_ACCIONES_DE_EQUIPO = 60;

/**
 * Quien conduce la partida puede quedarse la batalla que acaba de nacer.
 *
 * Existe porque el turno de la IA era una llamada atómica: cuando el rival
 * atacaba al agente, `resolvePendingBattle` cerraba la batalla aquí dentro y el
 * director no llegaba a enterarse de que la había habido. El agente decidía
 * solo en las batallas que él abría, o sea en la mitad.
 *
 * El contrato es **«si te la quedas, la cierras»**: no devuelve un booleano que
 * pueda mentir, se mira `state.pendingBattle` al volver. Una toma a medias cae
 * sola en el respaldo de siempre. Y es un tipo, no un `import`: `core` sigue sin
 * saber que existe un servidor.
 */
export type BattleTakeover = (state: GameState, ctx: GameContext) => Promise<void>;

/** Nadie vetado: la IA juega para sí en todas sus batallas. */
const NADIE: ReadonlySet<PlayerId> = new Set();

/** Cómo se conduce un turno de la IA desde fuera: los dos son opcionales. */
export interface ConduccionDelTurno {
  /** Quien puede quedarse las batallas que nazcan (ver `BattleTakeover`). */
  readonly takeover?: BattleTakeover | undefined;
  /**
   * Los jugadores que no lleva la IA de reglas. Si una batalla que resuelve ella
   * les toca —el rival ataca a la persona—, pelea por ellos pero no se rinde:
   * rendirse les cuesta oro y es decisión de su dueño (`resolvePendingBattle`).
   */
  readonly noSeRinden?: ReadonlySet<PlayerId>;
}

export async function playAiTurn(
  state: GameState,
  ctx: GameContext,
  { takeover, noSeRinden = NADIE }: ConduccionDelTurno = {},
): Promise<void> {
  if (state.finished !== null) return;
  const player = currentPlayer(state);

  // Contratar antes que nada: un héroe nuevo puede reclutar hoy mismo.
  for (const accion of planHires(state, player.id)) {
    applyAdventureAction(state, accion, ctx, player.id);
  }
  // Construir después: cambia lo que hay disponible para reclutar.
  for (const accion of planBuildings(state, player.id)) {
    applyAdventureAction(state, accion, ctx, player.id);
  }
  for (const accion of planRecruits(state, player.id)) {
    applyAdventureAction(state, accion, ctx, player.id);
  }
  // El equipo, después de reclutar: la tropa nueva también puede llevar algo, y
  // lo que se compra no le quita oro a la tropa. Una acción cada vez, porque
  // cada una cambia lo que sigue (`siguienteDeEquipo`); el tope es una red, no
  // un límite de juego: cada vuelta sube lo que se lleva puesto o gasta oro.
  for (let n = 0; n < MAX_ACCIONES_DE_EQUIPO; n++) {
    const accion = siguienteDeEquipo(state, player.id);
    if (accion === null) break;
    applyAdventureAction(state, accion, ctx, player.id);
  }

  let movimientos = 0;
  while (movimientos < MAX_MOVIMIENTOS_POR_TURNO && state.finished === null) {
    let seMovio = false;

    // Copia: un héroe puede morir en batalla a mitad de la iteración.
    for (const hero of [...heroesOf(state, player.id)]) {
      if (state.finished !== null) break;
      if (!state.heroes.includes(hero)) continue;

      // Por debajo del paso más barato que existe no hay Dijkstra que valga:
      // `ROAD_COST` son 75 y el terreno más barato son 100, así que ningún
      // paso cabe y `stepTowards` iba a devolver `null` seguro. Es el mismo
      // `continue` de tres líneas más abajo, tomado antes de recorrer el mapa
      // entero: 231 de las 1257 pasadas de 40 partidas —el 18,4 %— salían por
      // ahí, y las 231 sin una sola excepción.
      //
      // Es equivalente porque ni esto ni el `paso === null` marcan `seMovio`,
      // y ninguna de las dos decisiones que se saltan toca el estado.
      if (hero.movePoints < ROAD_COST) continue;

      const marcha = marchaDeHoy(state, hero);
      if (marcha === null) continue;

      // Y el mismo alcance viaja a la puerta: `moveHero` relanzaba `findPath`
      // desde este origen hasta este destino, o sea el tercer recorrido del
      // mapa de las mismas nueve líneas.
      applyAdventureAction(
        state,
        { type: 'move_hero', hero: hero.id, to: marcha.paso },
        ctx,
        player.id,
        marcha.alcance,
      );
      if (state.pendingBattle !== null) {
        if (takeover !== undefined) await takeover(state, ctx);
        // Se vuelve a preguntar: quien la tomó pudo cerrarla, o no haberla
        // querido. Si sigue ahí, la cierra la IA como toda la vida.
        if (state.pendingBattle !== null) resolvePendingBattle(state, ctx, noSeRinden);
      }
      seMovio = true;
      movimientos++;
    }

    if (!seMovio) break;
  }

  if (state.finished === null) {
    applyAdventureAction(state, { type: 'end_turn' }, ctx, player.id);
  }
}

/**
 * Juega la partida entera con la IA en todos los bandos, y devuelve **cómo
 * acabó**: quién ganó, o `null` si no ganó nadie.
 *
 * No acepta `takeover` a propósito: es el banco de pruebas de la IA pura, el
 * que mide el barrido de semillas. Meter a un tercero aquí dejaría de medir lo
 * que dice medir.
 *
 * El tope de días lo lleva la partida (`state.maxDays`) y no un parámetro de
 * aquí; el porqué, en el docstring de `GameState.finished`. Devolver el
 * desenlace y no el día es lo que hace que la postcondición —al volver, la
 * partida ha terminado— la afirme `tsc` y no la re-deduzca cada llamante.
 */
export async function playAiGame(state: GameState, ctx: GameContext): Promise<GameOutcome> {
  while (state.finished === null) {
    await playAiTurn(state, ctx);
  }
  return state.finished;
}
