/**
 * Motor de batalla táctica: las rondas (la iniciativa, abrir y cerrar cada turno, el
 * final), `applyAction`, que juega la jugada de la unidad activa, y lo que pasa al
 * jugarla: el golpe con su rueda (`melee`, `strike`), el disparo diferido y la
 * granada al salir (`dispararLoApuntado`, `explotarLaGranada`) y el hechizo y el
 * poder (`lanzarHechizo`, la única aplicación; sus disparadores, `saltar`; la muerte,
 * `anotarLaMuerte`). Es lo único que cambia una batalla en curso; la monta
 * `createBattle` (`montaje.ts`), y el despliegue (`seguirElDespliegue`) da paso a la
 * ronda 1.
 *
 * Reglas de HoMM2 que se respetan aquí: orden de turno por velocidad con el
 * atacante ganando los empates, contraataque único por ronda, tiradores que no
 * pueden disparar con un enemigo encima y un hechizo de héroe por ronda. Sin
 * suerte (02-11-2026, decisión del usuario: «Elimina la suerte completamente del
 * juego»). La moral no da ni quita turnos (regla nuestra,
 * 26-10-2026, decisión del usuario: «La moral solo debe servir para la huida,
 * nunca dar un turno extra»): es una cifra sin efecto hasta que haya huida.
 *
 * Lo que juzga cada jugada sin cambiar nada vivía aquí hasta la fase N de la
 * reorganización (07-11-2026), que lo repartió por lo que hace: `consultas.ts` (el
 * turno y su fase, el movimiento, el contacto, la carga, el contraataque, la
 * rendición y el final), `golpe.ts` (las opciones del daño), `a-distancia.ts` (el
 * disparo y la granada), `lanzar.ts` (hechizos y poderes), `asalto.ts` (escalas y
 * puertas), `legalidad.ts` (la lista legal) y `prevision.ts`. Van en una sola
 * dirección: `montaje.ts` importa el motor y el motor, las piezas; abajo del todo
 * quedan `golpe.ts` y `consultas.ts`, que no importan ninguna, y la previsión no la
 * importa el motor (la leen la IA, el contrato del agente y la pantalla).
 */

import { HECHIZOS_DEL_JUEGO } from '../magia/catalogo.js';
import { areaDe, type CuandoSalta, esDiferido, type Hechizo } from '../magia/formato.js';
import type { Rng } from '../rng.js';
import type { Hex } from '../types.js';
import { hasTrait } from '../types.js';
import {
  apuntarBlocker,
  explosionDe,
  lanzarBlocker,
  lineaDelDisparo,
  opcionesDeLaGranada,
  opcionesDelDisparo,
} from './a-distancia.js';
import { disparosDe, golpesDe, recargaDe } from './armas.js';
import { escaleraBlocker, puertaBlocker, subirBlocker } from './asalto.js';
import { caminoDe, hexKey } from './board.js';
import {
  activeStack,
  bandoVencido,
  despliegueEnCursoBlocker,
  devolveraElGolpe,
  esPlantarse,
  faseBlocker,
  faseDelTurno,
  firmaDelTurno,
  golpeEnCursoBlocker,
  golpePreparado,
  hechizoDeLaBatalla,
  isAlive,
  movableFrom,
  movimientoBlocker,
  pasosQueQuedan,
  SIN_HEROE,
  splashTargets,
  stackById,
  stackSpeed,
  sumaDelBando,
  surrenderBlocker,
  vivoEn,
} from './consultas.js';
import { computeDamage, type GolpeQueHiere, type Herida, herir } from './damage.js';
import { asientoAlAbrir, colocarBlocker, deLaTanda, suyoEn, TANDAS } from './despliegue.js';
import {
  applyEffect,
  dichoDelEfecto,
  disparadoresDe,
  esCifraDeEfecto,
  impedidoPor,
  tickEffects,
} from './effects.js';
import {
  deLaRueda,
  enElPunto,
  type GolpeEnLaRueda,
  ON_HIT_EFFECTS,
  opcionesDeDanio,
  papelDe,
  ruedaDelIntercambio,
} from './golpe.js';
import {
  afectadosDe,
  apuntadoDe,
  type ContextoDelHechizo,
  castBlocker,
  contextoDe,
  lanzadorDeLaUnidad,
  lanzadorDelHeroe,
  poderBlocker,
  resueltosDe,
} from './lanzar.js';
import { quedaAlgoQueHacer } from './legalidad.js';
import { claveDeAbiertas, mismaPuerta } from './muralla.js';
import {
  type CifrasDeLaRueda,
  casillasQueQuitaLaFinta,
  type EfectoDeLaRueda,
  efectoDelTipo,
  efectosDeLaRueda,
  formaDeLaBatalla,
  type HechoDelCruce,
  type Punto,
  puntoDelContraataque,
  puntoDelCruce,
  type TipoDeGolpe,
} from './rueda.js';
import {
  type Apuntado,
  casillasDelArea,
  cuantoDura,
  curaDe,
  efectoColgado,
  type Lanzador,
  loAlcanza,
  queSeApunta,
} from './spells.js';
import type {
  AccionDeDespliegue,
  BattleAction,
  BattleEvent,
  BattleStack,
  BattleState,
  Side,
} from './types.js';
import {
  type CuandoVence,
  type DisparadorResuelto,
  type EfectoResuelto,
  MAX_ROUNDS,
  otroBando,
  type Paso,
  SIDES,
  type StackEffect,
} from './types.js';

/**
 * Abre la siguiente tanda del despliegue que tenga a alguien y despliegue una
 * persona, desde `state.despliegue.tanda`; pasadas todas, cierra el despliegue y
 * empieza la ronda 1. Las tandas que despliegan solas se quedan con lo que les
 * dio `asentar` en `createBattle`.
 *
 * Al abrir cada tanda, quien tiene su casilla ocupada por alguien que ya
 * desplegó se reasienta (`asientoAlAbrir`, el mismo `asentar`). No se tira nada:
 * el despliegue no gasta azar.
 */
export function seguirElDespliegue(state: BattleState, rng: Rng): void {
  const d = state.despliegue;
  if (d === null) throw new Error('no hay despliegue en curso');
  for (let t = d.tanda; t < TANDAS.length; t++) {
    const suyos = deLaTanda(state, t);
    if (suyos.length === 0) continue;
    const casillas = asientoAlAbrir(state, t);
    suyos.forEach((s, i) => {
      s.hex = casillas[i]!;
    });
    if (d.aMano.includes(TANDAS[t]!.side)) {
      state.despliegue = { tanda: t, aMano: d.aMano };
      return;
    }
  }
  state.despliegue = null;
  beginRound(state, rng);
}

/**
 * Lo que se hace en el despliegue, sobre el bando que despliega ahora: colocar a
 * uno (o cambiarlo con quien esté en esa casilla, de su misma tanda) o cerrar la
 * tanda, que abre la siguiente o, si era la última, la ronda 1. Lo ilegal lanza
 * con la frase de `colocarBlocker`. No escribe en el registro: el despliegue es
 * estado, como la formación del héroe.
 */
export function aplicarDespliegue(state: BattleState, accion: AccionDeDespliegue, rng: Rng): void {
  if (state.finished !== null) throw new Error('la batalla ya ha terminado');
  const d = state.despliegue;
  switch (accion.type) {
    case 'colocar': {
      const noSe = colocarBlocker(state, accion.stack, accion.at);
      if (noSe !== null) throw new Error(`no se puede colocar: ${noSe}`);
      const s = stackById(state, accion.stack);
      // Solo uno de su tanda se intercambia: el enemigo que aún no ha desplegado
      // se queda donde está y se reasienta al abrir su tanda (`asientoAlAbrir`).
      const ahi = suyoEn(state, s, accion.at);
      if (ahi !== undefined) ahi.hex = s.hex;
      s.hex = accion.at;
      return;
    }
    case 'desplegado': {
      if (d === null) throw new Error('no hay despliegue en curso');
      state.despliegue = { tanda: d.tanda + 1, aMano: d.aMano };
      seguirElDespliegue(state, rng);
      return;
    }
  }
}

/**
 * Cierra lo que quede del despliegue aceptando lo que hay: la tanda abierta tal
 * como está y las siguientes, solas. Lo llama quien juega la batalla sin mirar
 * (`autoResolve`: «Resolver sola», o la batalla de la persona que cierra la IA).
 * Sin despliegue en curso, nada.
 */
export function terminarElDespliegue(state: BattleState, rng: Rng): void {
  const d = state.despliegue;
  if (d === null) return;
  state.despliegue = { tanda: d.tanda + 1, aMano: [] };
  seguirElDespliegue(state, rng);
}

// ---------------------------------------------------------------- rondas

/**
 * El orden en que tocarán los que aún no han tenido turno, como lo saca
 * fheroes2: cada bando, del más rápido al más lento y por su puesto en un
 * empate (`SortFastest` es un `stable_sort`); entre los dos bandos, el primero
 * de cada uno, y si van a la misma velocidad, el bando `preferido`, que después
 * de cada uno pasa a ser el contrario. Los empates entre bandos se alternan, no
 * se los queda siempre el atacante:
 *
 * ```cpp
 * if ( ( *attackingUnitsIter )->GetSpeed() == ( *defendingUnitsIter )->GetSpeed() ) {
 *     result = attackingUnitsGoFirst ? *attackingUnitsIter : *defendingUnitsIter;
 * }
 * // …
 * preferredColor = ( unit->GetArmyColor() == attackingArmy.GetColor() ) ? defendingArmy.GetColor() : attackingArmy.GetColor();
 * ```
 * https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_arena.cpp#L179-L181
 * https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_arena.cpp#L246
 *
 * `pendientes` llega con cada bando ya en su orden; la salida no lo cambia,
 * solo los intercala. Las velocidades son las de `state.iniciativa`, las de
 * cuando empezó la ronda.
 */
function intercalar(
  state: BattleState,
  pendientes: readonly BattleStack[],
  preferido: Side,
): string[] {
  const colas: Record<Side, BattleStack[]> = { attacker: [], defender: [] };
  for (const s of pendientes) colas[s.side].push(s);
  const velocidad = (s: BattleStack): number => {
    const v = state.iniciativa[s.id];
    if (v === undefined) throw new Error(`${s.id} está en la cola sin velocidad de ronda`);
    return v;
  };
  const orden: string[] = [];
  let toca = preferido;
  for (let a = colas.attacker[0], d = colas.defender[0]; a !== undefined || d !== undefined; ) {
    let elegido: BattleStack;
    if (a === undefined) elegido = d as BattleStack;
    else if (d === undefined) elegido = a;
    else if (velocidad(a) === velocidad(d)) elegido = toca === 'attacker' ? a : d;
    else elegido = velocidad(a) > velocidad(d) ? a : d;
    colas[elegido.side].shift();
    orden.push(elegido.id);
    toca = otroBando(elegido.side);
    a = colas.attacker[0];
    d = colas.defender[0];
  }
  return orden;
}

/**
 * El bando que gana el próximo empate: el contrario del último que tuvo turno,
 * y el atacante antes del primero. En fheroes2, `_lastActiveUnitArmyColor`
 * nace `UNUSED`, y el contrario de algo que no es el atacante es el atacante:
 *
 * ```cpp
 * _currentUnit = GetCurrentUnit( *_attackingArmy, *_defendingArmy, GetOppositeColor( _lastActiveUnitArmyColor ) );
 * return col == getAttackingArmyColor() ? getDefendingArmyColor() : getAttackingArmyColor();
 * ```
 * https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_arena.cpp#L581
 * https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_arena.cpp#L824
 * https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_arena.h#L342
 */
function preferidoEnElEmpate(state: BattleState): Side {
  return state.ultimoBando === null ? 'attacker' : otroBando(state.ultimoBando);
}

/** La cola de una ronda nueva: todos los vivos, con la velocidad de ahora. */
function initiativeOrder(state: BattleState): string[] {
  const vivos = state.stacks.filter(isAlive);
  state.iniciativa = Object.fromEntries(vivos.map((s) => [s.id, stackSpeed(s)]));
  const enSuOrden = vivos.slice().sort((a, b) => stackSpeed(b) - stackSpeed(a) || a.slot - b.slot);
  return intercalar(state, enSuOrden, preferidoEnElEmpate(state));
}

/** Tope de rondas: una batalla que no converge se cierra, no se cuelga (`types.ts`). */
export { MAX_ROUNDS };

/**
 * Tope de jugadas de una batalla, para los bucles que la juegan acción a acción:
 * `autoResolve`, el director, la sesión del cliente y el banco de
 * enfrentamiento. Uno solo y derivado de `MAX_ROUNDS`, porque eran cuatro
 * números sueltos (5 000, 800, 500 y 5 000) y con el turno en tramos hubo que
 * subirlos a mano a la vez.
 *
 * Cien por ronda es holgura y no una cota: una ronda normal son una o dos
 * jugadas por unidad. Quien la alcanza es un bucle que no avanza, y el motor ya
 * cierra la batalla en `MAX_ROUNDS` mucho antes.
 */
export const MAX_JUGADAS = MAX_ROUNDS * 100;

function beginRound(state: BattleState, rng: Rng): void {
  // Comprobar el final ANTES de montar la ronda: si un bando llega vacío (dos
  // héroes recién contratados sin tropas, por ejemplo), montar la cola y
  // volver a llamarse era una recursión infinita.
  checkFinished(state);
  if (state.finished !== null) {
    state.turno = null;
    return;
  }

  if (state.round >= MAX_ROUNDS) {
    finishByExhaustion(state);
    return;
  }

  state.round += 1;
  // El rótulo de ronda va ANTES de que caduquen los efectos: así el
  // `effect_end` se lee dentro de la ronda en la que se disipa, y no colgando
  // del final de la anterior.
  state.log.push({ kind: 'round_start', round: state.round });

  for (const s of state.stacks) {
    s.acted = false;
    s.retaliated = false;
    // Caducar es filtrar: el stack nunca guardó el bono, así que quitarlo de
    // la lista lo devuelve solo a su valor base. No hay nada que revertir.
    for (const caducado of tickEffects(s)) {
      state.log.push({ kind: 'effect_end', stack: s.id, source: caducado.source });
    }
  }
  for (const side of SIDES) {
    const hero = state.heroes[side];
    if (hero !== null) hero.castThisRound = false;
  }
  // La iniciativa se monta DESPUÉS de caducar: una Prisa que expira ya no
  // cuenta para el orden de esta ronda.
  state.queue = initiativeOrder(state);
  if (state.queue.length === 0) {
    finishByExhaustion(state);
    return;
  }
  advance(state, rng);
}

/** Cierra una batalla que no avanza. Gana quien conserve más efectivos. */
function finishByExhaustion(state: BattleState): void {
  if (state.finished !== null) return;
  const vivos = (side: Side): number => sumaDelBando(state, side, (s) => s.count);
  const winner: Side = vivos('attacker') > vivos('defender') ? 'attacker' : 'defender';
  state.finished = { winner };
  state.turno = null;
  state.log.push({ kind: 'finished', winner });
}

/** Pasa al siguiente stack con turno, saltando muertos; sin nadie, ronda nueva. */
function advance(state: BattleState, rng: Rng): void {
  if (state.finished !== null) {
    state.turno = null;
    return;
  }

  const s = siguienteEnLaCola(state);
  if (s === null) {
    beginRound(state, rng);
    return;
  }
  abrirTurno(state, s);
  alEmpezarSuTurno(state, s, rng);
  // Lo que sale al empezar puede matar a quien empieza (su propia granada le da si
  // sigue cerca; hallazgo F1 de /simplify, 02-11-2026): un muerto no juega su turno,
  // pasa al siguiente. Si cerró la batalla, la primera línea de aquí lo dice.
  if (!isAlive(s)) advance(state, rng);
}

/**
 * Lo que sale al empezar el turno de `s`, antes de que elija nada: lo que apuntó en
 * el anterior (el disparo se soltó al apuntar, 25-10-2026) y la granada que lanzó
 * (02-11-2026). Luego el turno sigue como siempre. Si algo cierra la batalla,
 * `checkFinished` ya cerró el turno.
 */
function alEmpezarSuTurno(state: BattleState, s: BattleStack, rng: Rng): void {
  dispararLoApuntado(state, s, rng);
  explotarLaGranada(state, s, rng);
  caerElHechizo(state, s, rng);
  if (isAlive(s)) saltar(state, s, 'empezarSuTurno', null);
}

/**
 * Saca de la cola al siguiente vivo, o `null` si no queda nadie en la ronda.
 *
 * Los que no han tenido turno van delante y se reordenan antes de cada salida:
 * su desempate depende de quién actuó el último, y eso no se sabe al montar la
 * ronda —un muerto cambia a quién le toca el siguiente empate—. fheroes2 también elige así, uno a uno (`GetCurrentUnit`).
 */
function siguienteEnLaCola(state: BattleState): BattleStack | null {
  const vivos = state.queue.map((id) => stackById(state, id)).filter(isAlive);
  state.queue = intercalar(state, vivos, preferidoEnElEmpate(state));
  const id = state.queue.shift();
  return id === undefined ? null : stackById(state, id);
}

/**
 * Le da el turno a `s`: un objeto nuevo en cada activación, así que lo gastado
 * no se resetea, nace a 0. El ordinal sale del turno anterior, que sigue puesto
 * aquí: solo se borra al terminar la batalla, y entonces ya no se llega a esta
 * línea.
 */
function abrirTurno(state: BattleState, s: BattleStack): void {
  state.ultimoBando = s.side;
  state.turno = { n: (state.turno?.n ?? 0) + 1, stack: s.id, gastado: 0 };
  quitarLosQueVencen(state, s, 'empezar', state.turno.n);
}

/**
 * Cierra el turno del stack activo y pasa al siguiente. La moral no regala otro
 * (26-10-2026): un escudero de 6 casillas cruzaba el tablero en la ronda 1 con
 * el segundo turno de la moral alta de una sola facción.
 */
function endTurn(state: BattleState, s: BattleStack, rng: Rng): void {
  checkFinished(state);
  if (state.finished !== null) {
    state.turno = null;
    return;
  }
  if (isAlive(s)) saltar(state, s, 'terminarSuTurno', null);
  checkFinished(state);
  if (state.finished !== null) {
    state.turno = null;
    return;
  }
  const n = state.turno?.n;
  if (n !== undefined) quitarLosQueVencen(state, s, 'terminar', n);
  // Un turno menos de recarga: el del disparo cuenta (decisión del usuario, 02-11-2026).
  if (s.recargando > 0) s.recargando -= 1;
  s.acted = true;
  advance(state, rng);
}

/**
 * Quita a `s` lo que duraba hasta que `al` (empiece o termine) su próximo turno
 * (la rueda del golpe): lo colgado en un turno anterior al `n`. Al **terminar**
 * lo llama `endTurn`; al **empezar**, `abrirTurno`. Si su turno no llega (muere
 * o acaba la batalla), lo quita el tope de `roundsLeft`. Sin ninguno que venza,
 * no se escribe nada.
 */
function quitarLosQueVencen(state: BattleState, s: BattleStack, al: CuandoVence, n: number): void {
  // De cualquier stack: lo que dura hasta un turno de `s` puede ir colgado de otro
  // (un hechizo «hasta el próximo turno de quien lo lanzó», `HastaElTurno.de`).
  for (const x of state.stacks) {
    const vencido = (e: StackEffect): boolean =>
      e.hasta !== undefined &&
      e.hasta.al === al &&
      e.hasta.turno < n &&
      (e.hasta.de ?? x.id) === s.id;
    // Cada cierre de turno pasa por aquí: sin nada que quitar, ni una lista nueva.
    if (!x.effects.some(vencido)) continue;
    const vencidos = x.effects.filter(vencido);
    x.effects = x.effects.filter((e) => !vencido(e));
    for (const e of vencidos) state.log.push({ kind: 'effect_end', stack: x.id, source: e.source });
  }
}

function checkFinished(state: BattleState): void {
  if (state.finished !== null) return;
  const attackerLost = bandoVencido(state, 'attacker');
  const defenderLost = bandoVencido(state, 'defender');
  if (!attackerLost && !defenderLost) return;

  // Sin atacante no hay conquista: el empate a cero lo gana el defensor. Y con
  // héroes en el tablero hay otro empate posible —un disparo que salpica
  // (`splash`) a los dos comandantes a la vez—, que se resuelve igual.
  const winner: Side = attackerLost ? 'defender' : 'attacker';
  state.finished = { winner };
  state.turno = null;
  state.log.push({ kind: 'finished', winner });
}

// ---------------------------------------------------------------- acciones

/**
 * El recorrido del tablero que el llamante YA hizo, y de cuándo es.
 *
 * El «cuándo» no es redundante: un mapa de costes de otro stack, o del mismo
 * antes de su último tramo, tiene las mismas claves «x,y» y no hay forma de
 * distinguirlo mirándolo. Quien lo calculó dice de qué turno es
 * (`firmaDelTurno`: el ordinal, lo gastado y lo que quitó la Finta), y
 * `applyAction` la compara con la de ahora: el ordinal ya dice de quién es, y lo
 * demás, de qué tramo. Y con qué puertas abiertas (`claveDeAbiertas`): abrir o
 * cerrar una no gasta casillas ni cambia de turno, pero sí el recorrido.
 */
export interface Movibles {
  readonly firma: string;
  readonly puertas: string;
  readonly costs: ReadonlyMap<string, Paso>;
}

/**
 * Aplica la acción del stack activo. Lanza si es ilegal: no la corrige.
 *
 * `movibles` es una **pista de rendimiento**: el mismo `movableFrom` que ya
 * calculó quien eligió la acción. No es un atajo que se salte la comprobación
 * —la legalidad del destino se sigue leyendo del mapa, solo que del recorrido
 * ya hecho en vez de uno nuevo—. Sin ella, `moveTo` recorre el tablero como
 * siempre: es lo que hacen el director y el cliente, que no traen recorrido.
 */
export function applyAction(
  state: BattleState,
  action: BattleAction,
  rng: Rng,
  movibles?: Movibles,
): void {
  if (state.finished !== null) throw new Error('la batalla ya ha terminado');
  const enElDespliegue = despliegueEnCursoBlocker(state);
  if (enElDespliegue !== null) throw new Error(enElDespliegue);
  const s = activeStack(state);
  const turno = state.turno;
  if (s === null || turno === null) throw new Error('no hay stack activo');
  const firma = firmaDelTurno(turno, state.golpeEnCurso);
  if (movibles !== undefined && movibles.firma !== firma) {
    throw new Error(
      `el recorrido que traes es del ${movibles.firma}, y ahora le toca a ${s.id} en el ${firma}`,
    );
  }
  if (movibles !== undefined && movibles.puertas !== claveDeAbiertas(state.puertas)) {
    throw new Error(
      'el recorrido que traes es de antes de abrir o cerrar una puerta: el camino ha cambiado',
    );
  }
  // Con un golpe plantado no se juega otra cosa: ni el hechizo del héroe, que no
  // cierra el turno, ni una rendición; y solo ese golpe (`golpeEnCursoBlocker`).
  const enCurso = golpeEnCursoBlocker(state, action);
  if (enCurso !== null) throw new Error(enCurso);
  if (state.golpeEnCurso !== null && state.golpeEnCurso.stack !== s.id) {
    throw new Error(`el golpe plantado es de ${state.golpeEnCurso.stack}, y le toca a ${s.id}`);
  }
  const porLaFase = faseBlocker(state, action.type);
  if (porLaFase !== null) throw new Error(`${s.id}: ${porLaFase}`);

  switch (action.type) {
    case 'move': {
      // Moverse no cierra el turno: gasta casillas y deja a la unidad activa
      // para que siga, golpee o termine. Solo se cierra solo cuando ya no le
      // queda nada que hacer, para no pedir un clic que no decide nada.
      moveTo(state, s, action.to, movibles?.costs);
      // Tras la Finta, andar cierra el turno: es un solo tramo.
      if (faseDelTurno(state) === 'trasLaFinta' || !quedaAlgoQueHacer(state))
        endTurn(state, s, rng);
      return;
    }

    case 'end_turn': {
      endTurn(state, s, rng);
      return;
    }

    case 'attack': {
      // El recorrido, una vez: lo leen la comprobación y el movimiento. Con un golpe
      // plantado, el que trae quien juega viene vacío (la lista legal de la fase
      // `plantado` no da casillas) y se calcula aquí: la carrera de la carga se
      // valida al golpear, contra él.
      let costes: ReadonlyMap<string, Paso> | undefined =
        state.golpeEnCurso === null ? movibles?.costs : undefined;
      const recorrido = (): ReadonlyMap<string, Paso> => {
        costes ??= movableFrom(state, s);
        return costes;
      };
      const plantarse = esPlantarse(state, action);
      const { target, carga, medida } = golpePreparado(state, s, action, !plantarse, recorrido);
      // Sin carga, primero se anda y luego el cruce y el golpe; **la carga se elige
      // antes de correr** (decisión del usuario, 31-10-2026): el cruce, la carrera
      // (con la carga en su `move`) y el golpe. De una vez o en dos jugadas, el
      // registro dice lo mismo en el mismo orden. El `Rng` gasta igual en los dos
      // órdenes: ni andar ni el cruce tiran.
      if (medida === null && action.from !== undefined) {
        moveTo(state, s, action.from, recorrido());
      }
      if (plantarse) {
        // Ni cierra el turno aunque haya gastado sus casillas, ni escribe aún
        // ningún cruce: espera la rueda. Soltarlo es `soltarElGolpe`.
        state.golpeEnCurso = { stack: s.id, target: target.id, carga: medida };
        return;
      }
      state.golpeEnCurso = null;
      const cruce = cruceDeLaRueda(state, s, target, action);
      if (medida !== null) moveTo(state, s, medida.carrera.at, recorrido(), medida.carrera);
      melee(state, s, target, rng, carga, cruce);
      // Con la Finta el turno sigue, solo para andar, si le queda a dónde y la
      // pelea no ha acabado con este golpe. Si no, se cierra como siempre.
      if (faseDelTurno(state) === 'trasLaFinta') {
        checkFinished(state);
        if (state.finished === null && quedaAlgoQueHacer(state)) return;
      }
      endTurn(state, s, rng);
      return;
    }

    case 'aim': {
      const motivo = apuntarBlocker(state, action.at);
      if (motivo !== null) throw new Error(motivo);
      s.apuntado = { col: action.at.col, row: action.at.row };
      state.log.push({ kind: 'aimed', stack: s.id, at: s.apuntado });
      endTurn(state, s, rng);
      return;
    }

    case 'throw': {
      const motivo = lanzarBlocker(state, action.at);
      if (motivo !== null) throw new Error(motivo);
      s.granada = { col: action.at.col, row: action.at.row };
      s.granadasLanzadas += 1;
      state.log.push({ kind: 'thrown', stack: s.id, at: s.granada });
      endTurn(state, s, rng);
      return;
    }

    case 'poner_escalera': {
      const motivo = escaleraBlocker(state, action.muro);
      if (motivo !== null) throw new Error(`${s.id} no puede poner la escalera: ${motivo}`);
      // La escalera se queda puesta y deja de ir a cuestas: la usa quien llegue
      // a ese pie (decisión del usuario). Ponerla es el turno entero.
      state.escaleras.push({ pie: s.hex, muro: action.muro });
      s.escalera = false;
      state.log.push({ kind: 'ladder_placed', stack: s.id, pie: s.hex, muro: action.muro });
      endTurn(state, s, rng);
      return;
    }

    case 'subir': {
      const motivo = subirBlocker(state, action.muro);
      if (motivo !== null) throw new Error(`${s.id} no puede subir: ${motivo}`);
      const desde = s.hex;
      s.hex = action.muro;
      state.log.push({ kind: 'climbed', stack: s.id, from: desde, to: action.muro });
      // Al subir se queda arriba y no hace nada más ese turno.
      endTurn(state, s, rng);
      return;
    }

    case 'abrir_puerta':
    case 'cerrar_puerta': {
      const motivo = puertaBlocker(state, action.type, action.puerta);
      if (motivo !== null) {
        const verbo = action.type === 'abrir_puerta' ? 'abrir' : 'cerrar';
        throw new Error(`${s.id} no puede ${verbo} la puerta: ${motivo}`);
      }
      const puerta = state.puertas.find((p) => mismaPuerta(p, action.puerta));
      if (puerta === undefined) throw new Error('puertaBlocker dejó pasar una puerta que no hay');
      puerta.abierta = action.type === 'abrir_puerta';
      puerta.cambiadaEn = turno.n;
      state.log.push({
        kind: puerta.abierta ? 'gate_opened' : 'gate_closed',
        stack: s.id,
        puerta: { a: puerta.a, b: puerta.b },
      });
      // No gasta el turno, como el hechizo: después se mueve, golpea o dispara.
      return;
    }

    case 'cast': {
      castHeroSpell(state, s.side, action.spell, action.target, action.at);
      // Lanzar un hechizo no consume el turno del stack: el héroe actúa aparte. Si
      // el hechizo mató a la activa, su turno se acaba.
      if (state.finished === null && !isAlive(s)) advance(state, rng);
      return;
    }

    case 'power': {
      // El hechizo con la unidad de lanzador: la misma aplicación que la del héroe.
      usarElPoder(state, s, action, rng);
      return;
    }

    case 'surrender': {
      const { coste, motivo } = surrenderBlocker(state, s.side);
      if (motivo !== null) throw new Error(`no se puede rendir: ${motivo}`);
      if (action.gold !== undefined && action.gold !== coste) {
        throw new Error(`no se puede rendir por ${action.gold} de oro: ahora cuesta ${coste}`);
      }
      // El precio, UNA vez: se escribe en `finished` y de ahí lo lee quien lo
      // cobra (`settleBattle`). Calcularlo otra vez al cobrar daría la misma
      // cifra hoy, y el día que algo cambie en medio, dos.
      const winner = otroBando(s.side);
      state.log.push({ kind: 'surrender', side: s.side });
      state.finished = { winner, surrender: { gold: coste } };
      state.turno = null;
      state.log.push({ kind: 'finished', winner });
      return;
    }
  }
}

/**
 * Suelta el golpe plantado (`golpeEnCurso`): Escape en la rueda antes de elegir
 * (decisión del usuario, 13-10-2026). Sin carga, la unidad se queda donde llegó,
 * como tras un tramo, y sigue su turno con lo que le quede; con carga no corrió
 * (la carga se elige antes de correr, 31-10-2026): sigue en su salida, sin nada
 * gastado, y puede volver a cargar. Si ya no le queda nada que hacer, el turno se
 * cierra, como el `move` que agota. Solo la llama la sesión (`CruceDeLaRueda`);
 * sin golpe plantado lanza.
 */
export function soltarElGolpe(state: BattleState, rng: Rng): void {
  const g = state.golpeEnCurso;
  if (g === null) throw new Error('no hay ningún golpe plantado que soltar');
  const s = activeStack(state);
  if (s === null || state.turno === null || s.id !== g.stack) {
    throw new Error(`el golpe plantado es de ${g.stack}, y no le toca`);
  }
  state.golpeEnCurso = null;
  if (!quedaAlgoQueHacer(state)) endTurn(state, s, rng);
}

/**
 * Quien pega se planta (`golpeEnCurso`) sin golpear: anda hasta su objetivo, o,
 * si carga, se queda en su salida con la carrera por correr (`esPlantarse`); el
 * `attack` sin elecciones, con su `from` si lo trae. Es lo que se hace cuando
 * la rueda espera a alguien que no es la IA —la persona en la sesión, el agente
 * en el director (`pasoDelCruce`)—: el golpe que espera, de verdad plantado. No
 * tira dados: el `Rng` gasta lo mismo y en el mismo orden que el golpe de una
 * vez. Lanza con la frase del núcleo si no se puede: uno que no se puede dar no
 * mueve a nadie.
 */
export function plantarse(
  state: BattleState,
  accion: Extract<BattleAction, { type: 'attack' }>,
  rng: Rng,
): void {
  const { golpe: _golpe, respuesta: _respuesta, ...sinElegir } = accion;
  applyAction(state, sinElegir, rng);
}

/**
 * El paso del recorrido `costes` de `s` hasta `to`, o lanza diciendo por qué no
 * llega (`movimientoBlocker`): el que anda `moveTo`.
 */
function pasoHasta(
  state: BattleState,
  s: BattleStack,
  costes: ReadonlyMap<string, Paso>,
  to: Hex,
): Paso {
  const paso = costes.get(hexKey(to));
  if (paso === undefined) {
    const motivo = movimientoBlocker(state, to) ?? 'el recorrido que trae no es de este tramo';
    throw new Error(`${s.id} no puede moverse a (${to.col},${to.row}): ${motivo}`);
  }
  return paso;
}

/**
 * Mueve el stack y le apunta al turno lo que cuesta el camino. Con `carrera`, la
 * de un golpe que carga (el `move` lo dice, y el lienzo la anima así).
 */
function moveTo(
  state: BattleState,
  s: BattleStack,
  to: Hex,
  costes?: ReadonlyMap<string, Paso>,
  carrera?: Paso,
): void {
  // El coste real del camino, no la distancia en línea recta: rodear a un
  // enemigo cuesta más casillas del presupuesto. Sale del mismo recorrido que
  // decide si el destino es legal, así que no hay una segunda cuenta que pueda
  // discrepar de la primera — y si el llamante ya lo hizo, es literalmente ese.
  // Salvo la carga cuando salir del contacto cuesta: la carrera va por la recta
  // y se paga la recta (`CargaMedida.carrera`, que `medirCargas` ya vio que
  // cabe), que puede costar más que el camino más barato.
  const legal = pasoHasta(state, s, costes ?? movableFrom(state, s), to);
  const paso = carrera ?? legal;

  s.hex = to;
  // `moveTo` solo lo llama `applyAction` sobre el stack activo, así que el turno
  // es el suyo; si no lo fuera, apuntarlo en el de otro sería el fallo callado.
  if (state.turno === null || state.turno.stack !== s.id) {
    throw new Error(`${s.id} se mueve fuera de su turno`);
  }
  state.turno.gastado += paso.steps;
  // Los voladores se buscan sin bloqueos —ignoran lo que hay en medio—, así que
  // su cadena de pasos podría cruzar casillas ocupadas: su camino es el aire.
  const camino = caminoDe(paso);
  const path = hasTrait(s.unit, 'flying') ? [to] : camino;
  state.log.push({
    kind: 'move',
    stack: s.id,
    to,
    path,
    // La carrera de una carga ya se anima corriendo; si no, corre el tramo largo.
    ...(carrera !== undefined
      ? { charge: true }
      : seCorre(s, camino.length)
        ? { corre: true }
        : {}),
  });
}

/**
 * Si un tramo de `casillas` de `s` se anda corriendo: de más de la mitad de su
 * movimiento máximo (`stackSpeed`, con lo que le sume o reste un efecto); con la
 * mitad o menos, caminando (requisito 2 del 25-10-2026). **Solo se ve**: lo lee el
 * lienzo en el `move` (`corre`), y la regla de la carga no cambia. Las casillas son
 * las que pisa, también las del volador, que su `path` no lleva.
 */
function seCorre(s: BattleStack, casillas: number): boolean {
  return 2 * casillas > stackSpeed(s);
}

/** Cuelga un efecto del stack y lo cuenta en el registro. */
function applyStackEffect(state: BattleState, target: BattleStack, effect: StackEffect): void {
  // Lo que se anota es el efecto YA colgado, no el que se pidió: si refrescó a
  // uno del mismo origen, las rondas que se leen en el parte son las que de
  // verdad le quedan.
  const vivo = applyEffect(target, effect);
  state.log.push({
    kind: 'effect',
    stack: target.id,
    effect: vivo.kind,
    amount: esCifraDeEfecto(vivo.kind) && 'amount' in vivo ? vivo.amount : 0,
    ...(esCifraDeEfecto(vivo.kind) ? {} : { dicho: dichoDelEfecto(vivo) }),
    source: vivo.source,
    rounds: vivo.roundsLeft,
    ...(vivo.hasta === undefined ? {} : { vence: vivo.hasta.al }),
    ...(vivo.hasta?.de === undefined ? {} : { turnoDe: vivo.hasta.de }),
  });
}

/**
 * El cruce del golpe de `s` a `target` (ya validado por `cruceBlocker`), escrito
 * en el registro.
 */
function cruceDeLaRueda(
  state: BattleState,
  s: BattleStack,
  target: BattleStack,
  action: BattleAction & { type: 'attack' },
): HechoDelCruce {
  const { golpe, respuesta } = action;
  if (golpe === undefined || respuesta === undefined) {
    throw new Error('cruceBlocker dejó pasar un golpe con la rueda sin sus dos elecciones');
  }
  const cruce: HechoDelCruce = {
    kind: 'cruce',
    stack: s.id,
    target: target.id,
    golpe,
    respuesta,
    punto: puntoDelCruce(golpe, respuesta, formaDeLaBatalla(state)),
  };
  state.log.push(cruce);
  return cruce;
}

function melee(
  state: BattleState,
  attacker: BattleStack,
  target: BattleStack,
  rng: Rng,
  carga: number,
  cruce: HechoDelCruce,
): void {
  // Lo que el golpe deja va con su arma de cuerpo a cuerpo
  // (`ruedaDelIntercambio`), contada una vez y antes de pegar: Defensivo, a quien
  // pega antes de sus golpes, que cubre ya lo que venga; Romper guardia y la
  // Finta, después. La respuesta no deja nada.
  const rueda = { ...cruce, cifras: ruedaDelIntercambio(attacker) };
  colgarDeLaRueda(state, attacker, rueda.golpe, rueda.punto, 'propio', rueda.cifras);
  intercambio(state, attacker, target, rng, false, carga, enElPunto(rueda.golpe, rueda.punto));

  // Romper guardia, tras el golpe y antes del contraataque: quita ataque al
  // atacado ya en él, y en su próximo turno (decisión del usuario, 14-10-2026).
  if (isAlive(target)) {
    colgarDeLaRueda(state, target, rueda.golpe, rueda.punto, 'rival', rueda.cifras);
  }

  // Los disparadores de un hechizo (06-11-2026): una vez por golpe, tras él y antes
  // del contraataque, como lo que deja un rasgo al golpear.
  if (isAlive(attacker)) saltar(state, attacker, 'alGolpear', target);
  if (isAlive(target)) saltar(state, target, 'alSerGolpeado', attacker);

  // Contraataque: uno por ronda, y solo si el atacante lo permite.
  if (isAlive(target) && isAlive(attacker) && devolveraElGolpe(state, attacker, target)) {
    // El contraataque no carga: se devuelve el golpe desde donde se está, con el
    // tipo de la respuesta y en el punto contrario, sin bonificadores: solo
    // cuentan el Fuerte y el Rápido.
    target.retaliated = true;
    intercambio(
      state,
      target,
      attacker,
      rng,
      true,
      0,
      enElPunto(cruce.respuesta, puntoDelContraataque(cruce.punto)),
    );
  }

  // La Finta: el resto del turno, un tramo solo de andar con lo que le quede menos
  // lo que quita su éxito (la fusionada, la mitad de eso). Si queda en algo lo
  // decide `applyAction`.
  const efecto = efectoDelTipo(rueda.golpe, rueda.cifras);
  if (efecto.finta !== null && isAlive(attacker) && state.turno !== null) {
    state.turno.finta = casillasQueQuitaLaFinta(
      rueda.punto,
      efecto,
      pasosQueQuedan(state, attacker),
    );
  }
}

/**
 * Los golpes de `quien` a `contra` en un intercambio: el golpe o, con
 * `retaliation`, el contraataque: `golpesDe` golpes mientras `contra` siga en pie
 * (lo que el golpe de la rueda deja lo cuelga `melee`, antes y después). **La carga la cobra solo el
 * primero** (decisión del usuario, 14-10-2026): la carrera acaba en él, y el
 * segundo de Rápido o del doble golpe ya se da parado, con el arma de cuerpo a
 * cuerpo. En el juego ninguna criatura carga y pega dos veces, y el banco no se
 * mueve.
 */
function intercambio(
  state: BattleState,
  quien: BattleStack,
  contra: BattleStack,
  rng: Rng,
  retaliation: boolean,
  carga: number,
  golpe: GolpeEnLaRueda,
): void {
  const veces = golpesDe(quien.unit, golpe.tipo, retaliation);
  for (let i = 0; i < veces && isAlive(contra); i++) {
    strike(state, quien, contra, rng, retaliation, i === 0 ? carga : 0, golpe);
  }
}

/**
 * Cuelga sobre `s` el efecto de un golpe de tipo `tipo` que cayó en el punto `p`,
 * con las cifras del arma de quien pegó, `c` (`efectosDeLaRueda`), los que son para él
 * (`a`: quien pega o el atacado): dura hasta que
 * `s` empiece o termine su próximo turno (`StackEffect.hasta`, desde el de ahora)
 * con dos rondas de tope, que cubren siempre ese turno. Del mismo origen,
 * refresca: dos Romper guardia seguidos dejan el último, no la suma.
 */
function colgarDeLaRueda(
  state: BattleState,
  s: BattleStack,
  tipo: TipoDeGolpe,
  p: Punto,
  a: EfectoDeLaRueda['a'],
  c: CifrasDeLaRueda,
): void {
  for (const efecto of efectosDeLaRueda(tipo, p, c)) {
    if (efecto.a === a) applyStackEffect(state, s, deLaRueda(state, efecto));
  }
}

function strike(
  state: BattleState,
  attacker: BattleStack,
  target: BattleStack,
  rng: Rng,
  retaliation: boolean,
  carga: number,
  golpe: GolpeEnLaRueda,
): void {
  const info = attacker.unit;
  const result = computeDamage(
    attacker,
    target,
    rng,
    opcionesDeDanio(state, attacker, target, { chargeHexes: carga }, golpe, papelDe(retaliation)),
  );
  const herida = herir(target, result, attacker);

  state.log.push({
    kind: 'attack',
    stack: attacker.id,
    target: target.id,
    damage: herida.danio,
    killed: herida.muertos,
    retaliation,
    // Lo que paró la armadura: el parte y el lienzo lo dicen.
    ...conLoParado(herida),
    // La carga la dice `computeDamage`, que es quien la cobró: preguntarlo otra
    // vez aquí dejaba el parte contando 7 hexes mientras el bono se había
    // topado en los 5 que caben en +50 %.
    ...(result.charge > 0 ? { charge: result.charge } : {}),
    // El punto de la rueda en que cayó: el golpe que se da va en uno solo.
    punto: golpe.desde,
  });

  // Los vampiros señores recuperan efectivos con lo que drenan.
  if (hasTrait(info, 'life_drain') && !retaliation) {
    // Lo que quitó de verdad, tras la armadura: no se drena lo que no llegó.
    healFromDrain(attacker, herida.danio);
  }

  // Lo que el golpe deja pegado. Va ANTES del contraataque a propósito: a quien
  // asusta (`fear`) le devuelven el golpe ya asustados, que es donde se nota.
  // Un contraataque no asusta ni maldice: solo el que ataca de verdad.
  if (!retaliation && isAlive(target)) {
    for (const { trait, effect } of ON_HIT_EFFECTS) {
      if (hasTrait(info, trait)) applyStackEffect(state, target, effect);
    }
  }

  if (!isAlive(target)) anotarLaMuerte(state, target);
}

/**
 * El campo `parado` de un hecho de daño: lo que paró la armadura, solo si paró
 * algo. Sin armadura el hecho sale con los campos de siempre (el banco hashea el
 * registro).
 */
function conLoParado(h: { readonly parado: number }): { parado?: number } {
  return h.parado > 0 ? { parado: h.parado } : {};
}

function healFromDrain(s: BattleStack, damage: number): void {
  const info = s.unit;
  const maxHp = info.hp;
  const currentTotal = (s.count - 1) * maxHp + s.topHp;
  const healed = Math.min(currentTotal + damage, maxHp * s.count);
  s.topHp = healed - (s.count - 1) * maxHp;
}

/**
 * Sale el disparo diferido de `shooter` (lo que apuntó en su turno anterior,
 * `BattleStack.apuntado`) y se borra: desde donde está ahora, por la recta, al
 * primero que encuentre (`lineaDelDisparo`), con la tirada en el cuarto que da lo
 * lejos que pasa la recta del centro de su casilla (`cuartoDelDisparo`); ataque contra defensa,
 * y armadura como siempre. Con `double_shot`, dos tiros, y cada uno busca
 * su primero (el segundo, si el primero cayó, sigue la recta). Lo llama solo el
 * principio de su turno (`advance`). **Regla nuestra sin validar por el usuario** (25-10-2026: sin tests hasta
 * que la juegue).
 */
function dispararLoApuntado(state: BattleState, shooter: BattleStack, rng: Rng): void {
  const at = shooter.apuntado;
  if (at === null) return;
  shooter.apuntado = null;
  // Impedido de disparar (un hechizo): lo apuntado no sale.
  if (impedidoPor(shooter, 'disparar') !== null) return;
  // El arma de fuego recarga desde este turno, que cuenta (`endTurn` lo baja al
  // cerrarlo): con recarga 1, no apunta en este y sí en el siguiente.
  shooter.recargando = recargaDe(shooter.unit);
  const shots = disparosDe(shooter.unit);
  for (let i = 0; i < shots && state.finished === null; i++) {
    const { alcanzado } = lineaDelDisparo(state, shooter, at);
    if (alcanzado === null) {
      state.log.push({ kind: 'shoot', stack: shooter.id, at, target: null, damage: 0, killed: 0 });
      continue;
    }
    const result = computeDamage(
      shooter,
      alcanzado,
      rng,
      opcionesDelDisparo(state, shooter, alcanzado, at),
    );
    // El arma de fuego perfora la armadura (`DamageResult.perfora`).
    herirYContar(state, alcanzado, result, shooter, (h) => ({
      kind: 'shoot',
      stack: shooter.id,
      at,
      target: alcanzado.id,
      damage: h.danio,
      killed: h.muertos,
      ...conLoParado(h),
    }));

    // La salpicadura reparte el golpe del disparo, no lo que llegó: cada salpicado
    // resta su propia armadura (`herir`), salvo si el disparo perfora.
    if (hasTrait(shooter.unit, 'splash_shot')) splash(state, shooter, alcanzado, at, result);
    checkFinished(state);
  }
}

/**
 * Explota la granada que lanzó `s` en su turno anterior (`BattleStack.granada`) y se
 * borra: a todo vivo de la casilla y de sus seis vecinas, de cualquier bando
 * (`explosionDe`), cada uno con la tirada en su cuarto, sin dado, y su armadura
 * restada (`herir`). Un hecho `blast` por alcanzado, o uno sin nadie. Lo llama solo
 * el principio de su turno (`alEmpezarSuTurno`). **Regla nuestra** (02-11-2026).
 */
function explotarLaGranada(state: BattleState, s: BattleStack, rng: Rng): void {
  const at = s.granada;
  if (at === null || state.finished !== null) return;
  s.granada = null;
  // Impedido de disparar (un hechizo): la granada no explota.
  if (impedidoPor(s, 'disparar') !== null) return;
  const { alcanzados } = explosionDe(state, at);
  if (alcanzados.length === 0) {
    state.log.push({
      kind: 'blast',
      stack: s.id,
      at,
      target: null,
      damage: 0,
      killed: 0,
      cuarto: 0,
    });
    return;
  }
  // Todos con el tablero de antes de la explosión: el daño de cada uno no depende de
  // a quién le tocó antes.
  const golpes = alcanzados.map(({ stack, cuarto }) => ({
    stack,
    cuarto,
    result: computeDamage(s, stack, rng, opcionesDeLaGranada(state, s, stack, cuarto)),
  }));
  for (const { stack, cuarto, result } of golpes) {
    herirYContar(state, stack, result, s, (h) => ({
      kind: 'blast',
      stack: s.id,
      at,
      target: stack.id,
      damage: h.danio,
      killed: h.muertos,
      cuarto,
      ...conLoParado(h),
    }));
  }
  checkFinished(state);
}

/**
 * La salpicadura (el rasgo `splash`; la llevaba el liche, que se fue con
 * `data/creatures.json`). Se reparte el daño YA calculado, sin volver a
 * tirar: una tirada por disparo mantiene los tests legibles y la semilla
 * estable.
 */
function splash(
  state: BattleState,
  shooter: BattleStack,
  target: BattleStack,
  at: Hex,
  golpe: GolpeQueHiere,
): void {
  for (const otro of splashTargets(state, shooter, target)) {
    herirYContar(state, otro, golpe, shooter, (h) => ({
      kind: 'shoot',
      stack: shooter.id,
      at,
      target: otro.id,
      damage: h.danio,
      killed: h.muertos,
      ...conLoParado(h),
      splash: true,
    }));
  }
}

/**
 * Hiere a `objetivo` con `golpe` de `autor` (`herir`), escribe el hecho que da
 * `hecho` con lo que llegó y, si cae, `perished`: lo de cada disparo, salpicado y
 * alcanzado por una granada (hallazgo S8 de /simplify, 02-11-2026: eran tres copias).
 */
function herirYContar(
  state: BattleState,
  objetivo: BattleStack,
  golpe: GolpeQueHiere,
  autor: BattleStack,
  hecho: (herida: Herida) => BattleEvent,
): void {
  const herida = herir(objetivo, golpe, autor);
  state.log.push(hecho(herida));
  if (!isAlive(objetivo)) anotarLaMuerte(state, objetivo);
}

// ---------------------------------------------------------------- la magia

/** Lo que hizo un hechizo (o un disparador) a uno: el daño, lo parado y la cura. */
interface LoQueHizo {
  damage: number;
  killed: number;
  parado: number;
  cura: number;
}

/**
 * Lo que se hace en el acto de `efectos` sobre `t`: el daño (`herir`, con o sin la
 * armadura), la cura (sin pasar de la vida del de arriba, `curaDe`) y `disipar`.
 */
function enElActo(
  state: BattleState,
  efectos: readonly (EfectoResuelto | DisparadorResuelto)[],
  ctx: ContextoDelHechizo,
  t: BattleStack,
): LoQueHizo {
  const hizo: LoQueHizo = { damage: 0, killed: 0, parado: 0, cura: 0 };
  for (const e of efectos) {
    if ('cuando' in e || !isAlive(t)) continue;
    if (e.tipo === 'danio') {
      const h = herir(t, { damage: e.cantidad, perfora: !e.armadura }, ctx.lanzador);
      hizo.damage += h.danio;
      hizo.killed += h.muertos;
      hizo.parado += h.parado;
    } else if (e.tipo === 'cura') {
      const c = curaDe(e.cantidad, t);
      t.topHp += c;
      hizo.cura += c;
    } else if (e.tipo === 'disipar') {
      disipar(state, t, e.de);
    }
  }
  return hizo;
}

/** Quita de `t` los efectos de hechizo que dice `de` (relativo a su bando), y los anota. */
function disipar(state: BattleState, t: BattleStack, de: 'contrarios' | 'propios' | 'todos'): void {
  const vaFuera = (e: StackEffect): boolean =>
    e.bando !== undefined && (de === 'todos' || (de === 'propios') === (e.bando === t.side));
  const fuera = t.effects.filter(vaFuera);
  if (fuera.length === 0) return;
  t.effects = t.effects.filter((e) => !vaFuera(e));
  for (const e of fuera) state.log.push({ kind: 'effect_end', stack: t.id, source: e.source });
}

/**
 * Cuelga de `t` lo que dura de `efectos`, con la duración del contexto, y salta en
 * el acto los disparadores que lo piden (`yAlLanzarse`, el pulso de un aura). Lo
 * que dura en un muerto no se cuelga.
 */
function colgarLoQueDura(
  state: BattleState,
  efectos: readonly (EfectoResuelto | DisparadorResuelto)[],
  ctx: ContextoDelHechizo,
  t: BattleStack,
  cargas: (d: DisparadorResuelto) => number | null,
): void {
  if (!isAlive(t) || ctx.duracion === null) return;
  const dura = cuantoDura(ctx.duracion, ctx.poder, state.turno?.n ?? 0, {
    afectado: t.id,
    lanzador: ctx.lanzadorId,
    ...(ctx.portador === undefined ? {} : { portador: ctx.portador }),
  });
  const comun = {
    source: ctx.source,
    bando: ctx.bando,
    ...dura,
    ...(ctx.seAcabaSiMuere === undefined ? {} : { seAcabaSiMuere: ctx.seAcabaSiMuere }),
  };
  for (const e of efectos) {
    const colgado = efectoColgado(e, comun, 'cuando' in e ? cargas(e) : null);
    if (colgado === null) continue;
    applyStackEffect(state, t, colgado);
    if ('cuando' in e && e.yAlLanzarse) {
      const vivo = t.effects.find((x) => x.kind === 'disparador' && x.source === ctx.source);
      if (vivo !== undefined && vivo.kind === 'disparador') saltarUno(state, t, vivo, null);
    }
  }
}

/**
 * Lanza `h` con `l` sobre `apuntado` (ya validado por su `*Blocker`): **la única
 * aplicación de un hechizo**, del héroe y del poder de una unidad. Lo diferido se
 * queda en el aire (`hechizoEnElAire`) y cae al empezar el siguiente turno del
 * lanzador (`caerElHechizo`). A una sola unidad elegida, el hecho de quien lanza
 * (`hecho`) lleva lo que le hizo, como siempre; si va a una casilla, al tablero o
 * alcanza a varios, un `spell_hit` por alcanzado.
 */
function lanzarHechizo(
  state: BattleState,
  h: Hechizo,
  l: Lanzador,
  apuntado: Apuntado,
  hecho: (hizo: LoQueHizo | null) => BattleEvent,
): void {
  if (esDiferido(h)) {
    if (apuntado === null || !('at' in apuntado)) throw new Error('lo diferido va a una casilla');
    l.stack.hechizoEnElAire = { hechizo: h.id, at: apuntado.at, poder: l.poder };
    state.log.push({ ...hecho(null), diferido: true } as BattleEvent);
    return;
  }
  const afectados = afectadosDe(state, h, l, apuntado);
  if (queSeApunta(h) === 'unidad' && areaDe(h) === 0) {
    // A una sola unidad: el hecho de siempre, con lo que le hizo.
    const [t] = afectados;
    if (t === undefined) throw new Error('una unidad elegida sin unidad');
    const { efectos, cargas } = resueltosDe(h, l);
    const ctx = contextoDe(h, l);
    state.log.push(hecho(enElActo(state, efectos, ctx, t)));
    colgarLoQueDura(state, efectos, ctx, t, cargas);
    if (!isAlive(t)) anotarLaMuerte(state, t);
    checkFinished(state);
    return;
  }
  state.log.push(hecho(null));
  aplicarAVarios(state, h, l, afectados);
}

/** Aplica `h` a cada uno de `afectados`, con un `spell_hit` por alcanzado. */
function aplicarAVarios(
  state: BattleState,
  h: Hechizo,
  l: Lanzador,
  afectados: readonly BattleStack[],
): void {
  const { efectos, cargas } = resueltosDe(h, l);
  const ctx = contextoDe(h, l);
  for (const t of afectados) {
    if (!isAlive(t)) continue;
    const hizo = enElActo(state, efectos, ctx, t);
    state.log.push(golpeDeHechizo(h.id, t, hizo));
    colgarLoQueDura(state, efectos, ctx, t, cargas);
  }
  for (const t of afectados) if (!isAlive(t) && !yaAnotado(state, t)) anotarLaMuerte(state, t);
  checkFinished(state);
}

/** El hecho de lo que un hechizo le hizo a uno de varios. */
function golpeDeHechizo(spell: string, t: BattleStack, hizo: LoQueHizo): BattleEvent {
  return {
    kind: 'spell_hit',
    spell,
    stack: t.id,
    damage: hizo.damage,
    killed: hizo.killed,
    ...conLoParado(hizo),
    ...(hizo.cura > 0 ? { cura: hizo.cura } : {}),
  };
}

/** Si la muerte de `t` ya está en el registro (un disparador `alMorir` puede llegar antes). */
function yaAnotado(state: BattleState, t: BattleStack): boolean {
  return state.log.some((e) => e.kind === 'perished' && e.stack === t.id);
}

/**
 * Cae el hechizo diferido que lanzó `s` en su turno anterior (`hechizoEnElAire`) y se
 * borra: desde donde está ahora, sobre la casilla que eligió. Lo llama solo el
 * principio de su turno (`alEmpezarSuTurno`).
 */
function caerElHechizo(state: BattleState, s: BattleStack, _rng: Rng): void {
  const e = s.hechizoEnElAire;
  if (e === null || state.finished !== null) return;
  s.hechizoEnElAire = null;
  const h = state.libro[e.hechizo] ?? HECHIZOS_DEL_JUEGO.get(e.hechizo);
  if (h === undefined) return;
  const l: Lanzador = { stack: s, bando: s.side, poder: e.poder };
  aplicarAVarios(state, h, l, afectadosDe(state, h, l, { at: e.at }));
}

/**
 * Saltan los disparadores de `portador` de la clase `cuando` (`otro`, quien le
 * golpeó o a quien golpeó). Lo llaman el principio y el final de su turno, el
 * golpe cuerpo a cuerpo (`melee`) y su muerte (`anotarLaMuerte`).
 */
function saltar(
  state: BattleState,
  portador: BattleStack,
  cuando: CuandoSalta,
  otro: BattleStack | null,
): void {
  for (const e of disparadoresDe(portador, cuando)) {
    if (state.finished !== null) return;
    // Uno que ya se quitó (cargas, una muerte) no salta.
    if (!portador.effects.includes(e)) continue;
    saltarUno(state, portador, e, otro);
  }
}

/** Salta un disparador colgado de `portador`. */
function saltarUno(
  state: BattleState,
  portador: BattleStack,
  e: StackEffect & { kind: 'disparador' },
  otro: BattleStack | null,
): void {
  const d = e.disparador;
  const bando = e.bando ?? portador.side;
  const objetivos =
    d.a === 'portador'
      ? isAlive(portador)
        ? [portador]
        : []
      : d.a === 'otro'
        ? otro !== null && isAlive(otro)
          ? [otro]
          : []
        : casillasDelArea(portador.hex, d.radio).flatMap((c) => {
            const t = vivoEn(state, c);
            return t !== null && t !== portador && loAlcanza(d.afecta, bando, t.side) ? [t] : [];
          });
  state.log.push({ kind: 'triggered', stack: portador.id, spell: e.source, cuando: d.cuando });
  const lanzador = state.stacks.find((x) => x.id === d.lanzador) ?? null;
  const ctx: ContextoDelHechizo = {
    source: e.source,
    bando,
    lanzador,
    lanzadorId: d.lanzador,
    portador: portador.id,
    poder: d.poder,
    duracion: d.duracion,
    ...(d.seAcabaSiMuere === null
      ? {}
      : { seAcabaSiMuere: d.seAcabaSiMuere === 'portador' ? portador.id : d.lanzador }),
  };
  for (const t of objetivos) {
    const hizo = enElActo(state, d.efectos, ctx, t);
    if (d.efectos.some((x) => x.tipo === 'danio' || x.tipo === 'cura')) {
      state.log.push(golpeDeHechizo(e.source, t, hizo));
    }
    colgarLoQueDura(state, d.efectos, ctx, t, () => null);
  }
  if (e.cargas !== null) {
    e.cargas -= 1;
    if (e.cargas <= 0 && portador.effects.includes(e)) {
      portador.effects = portador.effects.filter((x) => x !== e);
      state.log.push({ kind: 'effect_end', stack: portador.id, source: e.source });
    }
  }
  for (const t of objetivos) if (!isAlive(t) && !yaAnotado(state, t)) anotarLaMuerte(state, t);
  checkFinished(state);
}

/**
 * La muerte de `s`, **la única escritura de `perished`**: se anota, se va con él lo
 * que dejó con «se acaba si muere» (de cualquier stack), se pierde su hechizo en el
 * aire y saltan sus disparadores `alMorir`. Lo vigila `invariantes.test.ts`.
 */
function anotarLaMuerte(state: BattleState, s: BattleStack): void {
  state.log.push({ kind: 'perished', stack: s.id });
  s.hechizoEnElAire = null;
  for (const x of state.stacks) {
    const fuera = x.effects.filter((e) => e.seAcabaSiMuere === s.id);
    if (fuera.length === 0) continue;
    x.effects = x.effects.filter((e) => e.seAcabaSiMuere !== s.id);
    for (const e of fuera) state.log.push({ kind: 'effect_end', stack: x.id, source: e.source });
  }
  saltar(state, s, 'alMorir', null);
}

function castHeroSpell(
  state: BattleState,
  side: Side,
  spellId: string,
  targetId: string | undefined,
  at: Hex | undefined,
): void {
  // El nulo se comprueba aquí, y no solo dentro del bloqueador, porque el
  // estrechamiento no cruza la llamada. El motivo sigue escrito una sola vez.
  const hero = state.heroes[side];
  if (hero === null) throw new Error(`no se puede lanzar: ${SIN_HEROE}`);
  const blocker = castBlocker(state, side, spellId, targetId, at);
  if (blocker !== null) throw new Error(`no se puede lanzar: ${blocker}`);
  const h = hechizoDeLaBatalla(state, spellId);
  if (queSeApunta(h) !== 'nada' && targetId === undefined && at === undefined) {
    throw new Error(`«${h.nombre}» necesita un objetivo`);
  }
  const l = lanzadorDelHeroe(state, side);
  if (l === null) throw new Error('castBlocker dejó lanzar sin el cuerpo del héroe');

  hero.mana -= h.mana;
  hero.castThisRound = true;
  // El cuerpo del héroe es quien cobra la experiencia del hechizo (`lanzarHechizo`).
  lanzarHechizo(state, h, l, apuntadoDe(targetId, at), (hizo) => ({
    kind: 'cast',
    side,
    spell: spellId,
    ...(targetId === undefined ? {} : { target: targetId }),
    ...(at === undefined ? {} : { at }),
    ...(hizo === null ? {} : { damage: hizo.damage, killed: hizo.killed, ...conLoParado(hizo) }),
  }));
}

/** Usa el poder: el hechizo con la unidad de lanzador, y cierra su turno. */
function usarElPoder(
  state: BattleState,
  s: BattleStack,
  action: BattleAction & { type: 'power' },
  rng: Rng,
): void {
  const motivo = poderBlocker(state, action.poder, action.target, action.at);
  if (motivo !== null) throw new Error(`${s.unit.name} no puede usar ese poder: ${motivo}`);
  const h = hechizoDeLaBatalla(state, action.poder);
  if (queSeApunta(h) !== 'nada' && action.target === undefined && action.at === undefined) {
    throw new Error(`«${h.nombre}» necesita un objetivo`);
  }
  const cura = h.efectos.some((e) => e.tipo === 'cura');
  lanzarHechizo(state, h, lanzadorDeLaUnidad(s), apuntadoDe(action.target, action.at), (hizo) => ({
    kind: 'power',
    stack: s.id,
    poder: action.poder,
    ...(action.target === undefined ? {} : { target: action.target }),
    ...(action.at === undefined ? {} : { at: action.at }),
    ...(hizo !== null && cura ? { cura: hizo.cura } : {}),
  }));
  if (state.finished === null) endTurn(state, s, rng);
}
