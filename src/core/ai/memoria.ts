/**
 * Lo que la IA recuerda de un héroe entre un turno y otro, **leído de la
 * crónica**: dónde empezó cada uno de los últimos turnos de su dueño.
 *
 * La IA no guarda estado entre preguntas (el mismo motivo de `compradasHoy`):
 * cada turno decide desde cero con lo que ve. Casi siempre basta, porque mirar
 * el mapa de nuevo es mirar el mismo mapa. Falla en dos sitios, los de #181,
 * donde decidir desde cero da la misma respuesta mala cada día:
 *
 *  - **El vaivén.** El objetivo que gana desde A obliga a pasar por B, y el que
 *    gana desde B obliga a pasar por A. Pasa cuando el alcance cambia de un día
 *    para otro sin que cambie el héroe: un grupo de asaltantes que patrulla
 *    tapa una ruta los días pares y la otra los impares (semilla 1033 con lado
 *    40: 22 días yendo de (3,10) a (10,2) y vuelta, sin una batalla), o un
 *    rival que se mueve y al que se persigue a donde estaba.
 *  - **El encierro.** Un héroe sin tropa en mitad de una región que lo embosca
 *    espera a que la región cambie; si nadie la cambia, espera para siempre.
 *
 * Los dos se ven solo **mirando atrás**, y la crónica ya lo tiene todo: dónde se
 * movió el héroe (`hero_moved`), dónde volvió (`hero_returned`), dónde nació
 * (`hero_hired`, `hero_promoted`) y cuándo empezó cada turno (`turn_start`).
 */

import type { Hero } from '../hero/hero.js';
import { pointFromKey, pointKey } from '../map/map.js';
import type { GameEvent } from '../state/events.js';
import type { GameState } from '../state/game.js';
import type { Point } from '../types.js';

/**
 * Dónde estaba `hero` al empezar cada uno de los últimos `cuantos` turnos de su
 * dueño, del más reciente (el que se está jugando, si es suyo) al más viejo,
 * como `pointKey`.
 *
 * `null` quiere decir «no cuenta»: no se sabe —el héroe no había nacido, o la
 * crónica no dice dónde empezó, como pasa con el héroe de salida antes de su
 * primer paso o con uno colocado a mano en un test— o **el héroe peleó** entre
 * esa muestra y la siguiente. Una batalla cambia la tropa, el rival y a veces la
 * casilla, así que dos posiciones a ambos lados de una no son el mismo día
 * repetido: sin esto, el desgaste —dos héroes que se vencen por turnos y
 * vuelven a casa, como la semilla 64 del banco— se leía como un vaivén, y el
 * banco cambiaba (medido, 07-10-2026).
 *
 * Se recorre la crónica hacia atrás y se para en cuanto lo tiene: el coste es
 * el de los últimos turnos, no el de la partida.
 */
export function inicioDeSusTurnos(
  state: GameState,
  hero: Hero,
  cuantos: number,
): (string | null)[] {
  const log = state.log;
  // Una muestra por turno del dueño. `pos` sin decidir aún es `undefined`: la
  // da el primer hecho de casilla del héroe que aparezca más atrás.
  const muestras: { pos: string | null | undefined; peleo: boolean }[] = [];
  // Lo que pasa después del último `turn_start` del dueño es el turno en curso:
  // una batalla ahí invalida la muestra de ese mismo turno.
  let peleaEnCurso = false;
  let sinPos = 0;
  // Pasado el inicio del turno anterior a la muestra más vieja, lo que queda
  // ya no cae entre dos muestras: solo se busca dónde estaba.
  let fueraDeVentana = false;

  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i]!;
    if (e.kind === 'turn_start' && e.actor === hero.owner) {
      if (muestras.length === cuantos) {
        // Ya están todas; solo falta saber dónde estaba en las que esperan.
        if (sinPos === 0) break;
        fueraDeVentana = true;
        continue;
      }
      muestras.push({ pos: undefined, peleo: muestras.length === 0 ? peleaEnCurso : false });
      sinPos++;
      continue;
    }
    if (!fueraDeVentana && peleaDe(e, hero.id)) {
      // La batalla cae entre la muestra más reciente que ya se tiene y la
      // siguiente hacia atrás: invalida la que se tiene.
      const ultima = muestras[muestras.length - 1];
      if (ultima === undefined) peleaEnCurso = true;
      else ultima.peleo = true;
    }
    const aqui = casillaDe(e, hero.id);
    if (aqui !== null && sinPos > 0) {
      for (const m of muestras) if (m.pos === undefined) m.pos = aqui;
      sinPos = 0;
    }
    // Antes de nacer no estaba en ningún sitio: no hay más que buscar.
    if (nacimientoDe(e, hero.id)) break;
    if (muestras.length === cuantos && sinPos === 0) break;
  }

  const out: (string | null)[] = muestras.map((m) => (m.peleo ? null : (m.pos ?? null)));
  while (out.length < cuantos) out.push(null);
  return out;
}

/** La casilla en la que un hecho deja a `heroId`, o `null` si no lo mueve. */
function casillaDe(e: GameEvent, heroId: string): string | null {
  switch (e.kind) {
    case 'hero_moved':
      return e.hero === heroId ? pointKey(e.to) : null;
    case 'hero_returned':
    case 'hero_hired':
    case 'hero_promoted':
      return e.hero === heroId && e.at !== null ? pointKey(e.at) : null;
    default:
      return null;
  }
}

function nacimientoDe(e: GameEvent, heroId: string): boolean {
  return (e.kind === 'hero_hired' || e.kind === 'hero_promoted') && e.hero === heroId;
}

/** Si el hecho es una batalla de `heroId`, atacando o atacado, o su vuelta a casa tras perderla. */
function peleaDe(e: GameEvent, heroId: string): boolean {
  if (e.kind === 'battle_started') {
    return (
      (e.attacker.kind === 'hero' && e.attacker.heroId === heroId) ||
      (e.foe.kind === 'hero' && e.foe.heroId === heroId)
    );
  }
  return e.kind === 'hero_returned' && e.hero === heroId;
}

/**
 * El periodo más largo de vaivén que se busca. Con 4 caben el ir y volver (2) y
 * los triángulos; más largo ya no es un vaivén sino una ronda, y verlo pide
 * leer el doble de turnos atrás.
 */
const PERIODO_MAXIMO = 4;

/**
 * La casilla que **cerraría otra vuelta** del vaivén de `hero`, o `null` si no
 * está en uno.
 *
 * Está en un vaivén si las casillas donde empezó sus últimos `2k` turnos se
 * repiten con periodo `k` (2 ≤ k ≤ `PERIODO_MAXIMO`) —dos vueltas enteras, sin
 * una batalla en medio— y hoy no se ha movido todavía. La vuelta siguiente
 * empezaría donde empezó la de hace `k - 1` turnos: esa es la casilla.
 *
 * Dos vueltas y no una: ir a un sitio y volver una vez es normal —a casa a por
 * la guarnición y otra vez fuera—; repetirlo idéntico, casilla a casilla, sin
 * que nadie pelee, es que nada cambia. En las 200 partidas del banco no pasa
 * ni una vez, y por eso el banco sale igual.
 */
export function vueltaDelVaiven(state: GameState, hero: Hero): Point | null {
  const inicios = inicioDeSusTurnos(state, hero, 2 * PERIODO_MAXIMO);
  if (inicios[0] !== pointKey(hero.at)) return null;
  for (let k = 2; k <= PERIODO_MAXIMO; k++) {
    let periodico = true;
    for (let i = 0; i < 2 * k && periodico; i++) {
      const p = inicios[i];
      if (p === null || p === undefined) periodico = false;
      else if (i >= k && p !== inicios[i - k]) periodico = false;
    }
    // Quieto no es un vaivén (periodo 1): eso es esperar, y lo lleva el encierro.
    if (periodico && inicios[0] !== inicios[1]) return pointFromKey(inicios[k - 1] as string);
  }
  return null;
}

/**
 * Cuántos turnos seguidos lleva `hero` empezando en la casilla donde está, sin
 * pelear, contando el de ahora: 1 si llegó ayer, `tope` como mucho.
 */
export function turnosEnLaMismaCasilla(state: GameState, hero: Hero, tope: number): number {
  const aqui = pointKey(hero.at);
  let n = 0;
  for (const p of inicioDeSusTurnos(state, hero, tope)) {
    if (p !== aqui) break;
    n++;
  }
  return n;
}
