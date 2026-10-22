/**
 * La IA de reglas en los lugares de un mundo (P4 del usuario, F1a): una regla
 * simple. Recorre los puntos que están, en su orden, y en cada uno su diálogo en
 * anchura desde el inicio —por las opciones que solo navegan y valen—, y se queda
 * con la primera opción que **hace algo** y se puede elegir. Si abre una batalla,
 * solo con ventaja clara (`ventajaClara`, la regla de los neutrales). Que cada
 * premio se cobre una vez lo garantiza el núcleo (`EstadoDelMundo.cobradas` y
 * `vencidos`), así que jugar en bucle acaba.
 *
 * El agente no entra en los lugares (F4): esto es solo de la IA de reglas. Sin
 * mundo no hay lugares y nada de aquí cambia una partida del banco.
 */
import type { Hero } from '../hero/hero.js';
import type { Lugar } from '../mundo/formato.js';
import {
  type Ante,
  lugarEn,
  motivoDeLaOpcion,
  nodoDe,
  nodosAlcanzables,
  puntosDe,
  type RefDeOpcion,
  soloNavega,
} from '../mundo/reglas.js';
import type { GameState } from '../state/game.js';
import { fuerzaDe, poderDe, ventajaClara } from './fuerza.js';

/**
 * Lo que vale para la IA ir a un lugar donde haría algo. **Inventado** (F1a,
 * 22-10-2026), sin medir equilibrio (no se piden medidas de jugabilidad): más que
 * un nodo ajeno sin regiones que cerrar (3 000) y que un neutral (2 000), y una
 * quinta parte de una ciudad (40 000), para que un lugar cercano merezca el
 * desvío; el objetivo se puntúa por punto de movimiento (`chooseHeroDestination`).
 */
export const VALOR_DE_LUGAR = 8000;

/** Tope de opciones que la IA elige seguidas en un lugar: una red, no una regla. */
export const MAX_JUGADAS_EN_UN_LUGAR = 8;

/**
 * La primera opción con efectos que se puede elegir en `a`: por los puntos que
 * están, y en cada uno por los nodos que se alcanzan ahora (`nodosAlcanzables`, en
 * su orden), la primera que vale; una batalla, solo con ventaja clara con la
 * fuerza `miPoder` del héroe.
 */
function primera(a: Ante, miPoder: number): RefDeOpcion | null {
  for (const p of puntosDe(a)) {
    for (const nodo of nodosAlcanzables(a, p)) {
      for (const [i, o] of nodoDe(a, p, nodo).opciones.entries()) {
        if (soloNavega(o) || motivoDeLaOpcion(a, p, nodo, i) !== null) continue;
        const batalla = (o.hace ?? []).find((e): e is { batalla: string } => 'batalla' in e);
        if (batalla !== undefined && !conVentaja(a, batalla.batalla, miPoder)) continue;
        return { lugar: a.lugar.id, punto: p.id, nodo, opcion: i };
      }
    }
  }
  return null;
}

function conVentaja(a: Ante, encuentro: string, miPoder: number): boolean {
  const e = a.lugar.encuentros[encuentro];
  if (e === undefined) return false;
  return ventajaClara(miPoder, poderDe({ troops: e.tropa }));
}

/**
 * Lo que la IA elegiría ahora con `hero` en el lugar en que está, o `null`. No se
 * comprueba aparte con la puerta de la acción: se elige entre lo que ella acepta
 * (los nodos de `nodosAlcanzables`, el motivo de `motivoDeLaOpcion`), y si un día
 * no fuera así, la acción lanza con su motivo.
 */
export function jugadaEnElLugar(state: GameState, hero: Hero): RefDeOpcion | null {
  const mundo = state.mundo;
  const lugar = lugarEn(state, hero.at);
  if (mundo === undefined || lugar === null) return null;
  return primera({ state, mundo, hero, lugar }, fuerzaDe(hero, state.characters));
}

/**
 * Si la IA haría algo con `hero` si estuviera en `lugar`: lo que vale ir allí
 * (`objectValue`). Con el héroe tal como está y su fuerza, `miPoder`, que ya trae
 * quien elige el destino: nada de lo que se pregunta mira dónde está.
 */
export function hariaAlgoEn(state: GameState, hero: Hero, lugar: Lugar, miPoder: number): boolean {
  const mundo = state.mundo;
  if (mundo === undefined) return false;
  return primera({ state, mundo, hero, lugar }, miPoder) !== null;
}
