/**
 * El reloj de la partida: el turno de cada jugador y el orden del día
 * (`ordenDelDia`, en serpiente), lo que trae un día nuevo —la hornada del lunes
 * (`crecerLasMoradas`), la patrulla y el brote de los asaltantes— y el final: la
 * derrota de quien pierde su base (`checkDefeat`) y `game_over` (`finishGame`).
 *
 * Vivía en `game.ts` hasta la fase N de la reorganización (07-11-2026), que lo
 * repartió por lo que hace.
 */
import { empezarElDia, maxMana } from '../hero/hero.js';
import { pointKey } from '../map/geometria.js';
import type { Rng } from '../rng.js';
import { applyWeeklyGrowth, mageGuildLevel } from '../town/town.js';
import type { PlayerId, Raider } from '../types.js';
import { dondeBrotan, mascaraDeOcupacion, pasoDePatrulla } from './asaltantes.js';
import {
  baseOf,
  currentPlayer,
  dayOfWeek,
  heroesOf,
  playerById,
  townsOf,
  week,
} from './consultas.js';
import { emit } from './cronica.js';
import { rentaDelDia } from './renta.js';
import { ocupanteDe, sitioDeLaCiudad } from './sitios.js';
import type { GameContext, GameState } from './tipos.js';
import { revealAround, revealAroundNode, revealAroundTown } from './vision.js';

export function startTurn(state: GameState): void {
  const player = currentPlayer(state);
  emit(state, { kind: 'turn_start', actor: player.id, at: null });

  // Ingresos del día: lo que está UNIDO A LA BASE, y nada más (`rentaDelDia`).
  const renta = rentaDelDia(state, player.id);
  for (const town of townsOf(state, player.id)) {
    town.builtToday = false;
    // Su recuerdo de lo que tiene alrededor es de hoy, igual que el de un héroe
    // quieto: un grupo que patrulla junto a casa se ve donde está.
    revealAroundTown(state, town);
  }
  // Y cada nodo suyo, que también mira (la niebla de eventos, 02-11-2026).
  for (const obj of state.map.objects) {
    if (obj.kind === 'node' && obj.owner === player.id) revealAroundNode(state, obj);
  }
  player.oro += renta.total;

  for (const hero of heroesOf(state, player.id)) {
    empezarElDia(hero);
    // El maná se recupera poco a poco, salvo en un pueblo con gremio.
    const enPueblo = townsOf(state, player.id).some(
      (t) => pointKey(t.at) === pointKey(hero.at) && mageGuildLevel(t) > 0,
    );
    hero.mana = enPueblo ? maxMana(hero) : Math.min(maxMana(hero), hero.mana + 1);
    // Y mira alrededor al levantarse: un héroe quieto también ve. Sin esto, su
    // recuerdo del nodo que tiene al lado sería del día en que llegó.
    revealAround(state, hero);
  }
}

/**
 * El orden de los turnos en el día `dia`: **en serpiente** (regla nuestra, se
 * aparta de fheroes2, donde el orden es fijo). Los días impares van en el orden
 * de `players` y los pares al revés, así que quien cierra un día abre el
 * siguiente: día 1 j0, j1; día 2 j1, j0; día 3 j0, j1…
 *
 * Con el orden fijo, j0 abría todos los días y llegaba antes a lo que se
 * disputa: en 1 000 partidas de la IA contra sí misma ganaba 603, y separando
 * los efectos, abrir el día valía +63 (±8) de esos 603 frente a +30 de la base 0
 * y +16 del caballero (`docs/historia.md`). En serpiente, abrir el día deja de
 * ser de uno solo.
 *
 * Es el ÚNICO sitio que sabe el orden: lo leen el paso de turno (`nextPlayer`),
 * el primer turno de la partida (`createGame`) y lo que se le dice al agente
 * (`serializeAdventureTurn`). Va con todos los jugadores, también los
 * eliminados: quien pasa el turno se salta a los que ya no juegan.
 */
export function ordenDelDia(
  jugadores: readonly { readonly id: PlayerId }[],
  dia: number,
): readonly PlayerId[] {
  if (!Number.isInteger(dia) || dia < 1) {
    throw new Error(`no hay orden de turnos para el día ${dia}: los días empiezan en el 1`);
  }
  const orden = jugadores.map((j) => j.id);
  return dia % 2 === 1 ? orden : orden.reverse();
}

export function nextPlayer(state: GameState, ctx: GameContext): void {
  // Lo de «volvió a casa» dura hasta que su dueño acaba un turno: en él ya ha podido
  // recoger (`Hero.vueltoACasa`).
  for (const hero of heroesOf(state, state.current)) delete hero.vueltoACasa;
  const vivos = state.players.filter((p) => !p.defeated);
  if (vivos.length <= 1) {
    // Sin nadie vivo no gana nadie, y ahora se puede decir: antes esto coronaba
    // al jugador de turno —`?? state.current`— porque `winner` no admitía otra
    // cosa, o sea que la única salida era mentir. No mueve ninguna de las 200
    // partidas del banco: todas tienen exactamente un `player_defeated`.
    finishGame(state, vivos[0]?.id ?? null);
    return;
  }
  const juega = (id: PlayerId): boolean => !playerById(state, id).defeated;

  // Primero, quien quede por jugar HOY detrás del que cierra.
  const hoy = ordenDelDia(state.players, state.day);
  const siguienteHoy = hoy.slice(hoy.indexOf(state.current) + 1).find(juega);
  if (siguienteHoy !== undefined) {
    state.current = siguienteHoy;
    startTurn(state);
    return;
  }

  // Si no queda nadie, empieza un día nuevo…
  advanceDay(state, ctx);
  // …y ese día nuevo puede no llegar a existir: `advanceDay` termina la
  // partida al agotarse el tope. Sin esta línea, `startTurn` correría sobre
  // una partida acabada y le escribiría un `turn_start` detrás del
  // `game_over`.
  //
  // Quien lo vigila es el test del tope en `game.test.ts` y NO el invariante
  // de «`game_over` es el último hecho», que es a quien apuntaba esta frase:
  // sus veinte semillas juegan a 200 días y acaban por conquista, así que no
  // pisan esta salida. Quitando la línea, el invariante se queda verde y el
  // otro saca «expected turn_start to match game_over». Citar al guardia
  // equivocado es peor que no citar ninguno: el que lea esto y lo dé por
  // cubierto no irá a mirar.
  if (state.finished !== null) return;
  // Lo abre el primero vivo del orden de mañana, que en serpiente suele ser el
  // mismo que acaba de cerrar: juega dos turnos seguidos con el cambio de día
  // (los asaltantes, la hornada del lunes) en medio. Hay al menos dos vivos.
  state.current = ordenDelDia(state.players, state.day).find(juega) as PlayerId;
  startTurn(state);
}

/**
 * Pasa de día, o termina la partida si ya no quedan.
 *
 * El tope se mira **antes** de incrementar, y el orden no es cosmético: al
 * revés se emitiría un `day_start` de un día que no juega nadie —una línea de
 * más en la crónica de cada partida que llegue al tope, y el ancla del banco
 * movida—. Así el último día jugado es exactamente `maxDays`, y `game_over`
 * queda de último hecho.
 */
function advanceDay(state: GameState, ctx: GameContext): void {
  if (state.day >= state.maxDays) {
    finishGame(state, null);
    return;
  }
  state.day += 1;
  emit(state, { kind: 'day_start', day: state.day, week: week(state), actor: null, at: null });
  if (dayOfWeek(state) === 1) crecerLasMoradas(state);
  moverAsaltantes(state, ctx.rng);
  if (dayOfWeek(state) === 1) brotarAsaltantes(state, ctx.rng);
}

/**
 * El crecimiento de la semana de cada ciudad, **salvo la ocupada** (P4 de la tarea
 * 2, 05-11-2026: «tampoco crecen sus moradas»; y la semana se pierde, no se
 * aplaza, pregunta 4). **El único que llama a `applyWeeklyGrowth`** (lo vigila
 * `test/invariantes-partida.test.ts`): al nacer la partida y cada lunes.
 */
export function crecerLasMoradas(state: GameState): void {
  for (const town of state.towns) {
    if (ocupanteDe(state, sitioDeLaCiudad(town)) !== null) continue;
    applyWeeklyGrowth(town);
  }
}

/**
 * La patrulla del día: cada grupo, en orden, da su paso (`pasoDePatrulla`). Va
 * con el reloj y no con ningún jugador, al empezar el día y antes del primer
 * turno: así lo que el agente ve en su turno es dónde está cada grupo HOY.
 *
 * **No se cuenta en la crónica.** Era `raider_moved`, el 20 % del volcado del
 * banco, y no lo leía nadie: el panel no lo pintaba, al agente le llegaba por
 * el sello y le comía la ventana de 25 hechos, y el lienzo anima la marcha con
 * la posición, que está en el estado. Dónde está un grupo es estado, no hecho.
 */
function moverAsaltantes(state: GameState, rng: Rng): void {
  const W = state.map.width;
  const ocupadas = mascaraDeOcupacion(state);
  for (const raider of state.raiders) {
    const from = raider.at;
    const to = pasoDePatrulla(state, raider, rng, ocupadas);
    if (to.x === from.x && to.y === from.y) continue;
    ocupadas[from.y * W + from.x] = 0;
    ocupadas[to.y * W + to.x] = 1;
    raider.at = to;
  }
}

/** Que un grupo está en el mapa, contado: lo ve quien mire su casilla al nacer. */
export function contarBrote(state: GameState, raider: Raider): void {
  emit(state, {
    kind: 'raider_spawned',
    raider: raider.id,
    troops: raider.troops,
    actor: null,
    at: raider.at,
  });
}

/**
 * El brote del lunes (`dondeBrotan`). El id lleva el día y el orden del brote,
 * así que no hace falta guardar un contador en el estado y dos partidas con la
 * misma semilla dan los mismos ids.
 */
function brotarAsaltantes(state: GameState, rng: Rng): void {
  for (const [k, plan] of dondeBrotan(state, rng).entries()) {
    const raider: Raider = {
      id: `raider-d${state.day}-${k}`,
      at: plan.at,
      troops: plan.troops,
    };
    state.raiders.push(raider);
    contarBrote(state, raider);
  }
}

/** Se acabó. `winner` es `null` cuando se agotaron los días y no ganó nadie. */
function finishGame(state: GameState, winner: PlayerId | null): void {
  if (state.finished !== null) return;
  state.finished = { winner };
  // `actor: null` es exacto y no un hueco: no lo hace ningún jugador, igual que
  // el `day_start`. Y `visibleTo` da `game_over` a todo el mundo sin mirar el
  // actor, así que el reparto no se entera.
  emit(state, { kind: 'game_over', actor: winner, at: null });
}

/**
 * Un jugador está eliminado en cuanto **pierde su base**, aunque le queden
 * héroes o ciudades. Es la regla de victoria de NuevaJugabilidad —«se gana
 * tomando las bases rivales»—, que el usuario adelantó de la fase 3 al ver la
 * fase 2a: la base es la única ciudad donde se reaparece y de la que cuelga
 * toda la renta (`territorio`), así que perderla es perder la partida.
 *
 * La otra mitad, sin héroes y sin castillos, se queda para quien **no tuvo
 * nunca** base (`Player.base === null`), que solo dan los estados de prueba:
 * con base, quedarse sin castillos ya es haberla perdido.
 */
export function checkDefeat(state: GameState): void {
  for (const player of state.players) {
    if (player.defeated) continue;
    const perdioLaBase = player.base !== null && baseOf(state, player.id) === null;
    const sinNada =
      heroesOf(state, player.id).length === 0 && townsOf(state, player.id).length === 0;
    if (perdioLaBase || sinNada) {
      player.defeated = true;
      // Con las dos a la vez manda la base: es la regla de la partida, y la
      // otra solo existe para quien nunca tuvo base.
      const reason = perdioLaBase ? 'lost_base' : 'nothing_left';
      emit(state, { kind: 'player_defeated', reason, actor: player.id, at: null });
    }
  }
  const vivos = state.players.filter((p) => !p.defeated);
  if (vivos.length === 1) finishGame(state, vivos[0]!.id);
}
