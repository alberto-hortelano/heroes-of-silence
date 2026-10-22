/**
 * La IA de reglas en los lugares de un mundo (P4 del usuario, F1a): una regla
 * simple. Recorre los puntos que están, en su orden, y en cada uno su diálogo en
 * anchura desde el inicio —por las opciones que solo navegan y valen—, y se queda
 * con la primera opción que **hace algo** y se puede elegir. Si abre una batalla,
 * solo con ventaja clara (`ventajaClara`, la regla de los neutrales). Que cada
 * premio se cobre una vez lo garantiza la validación del mundo (cada opción que da
 * se apaga a sí misma), así que jugar en bucle acaba.
 *
 * El agente no entra en los lugares (F4): esto es solo de la IA de reglas. Sin
 * mundo no hay lugares y nada de aquí cambia una partida del banco.
 */
import type { Hero } from '../hero/hero.js';
import type { Lugar, Punto } from '../mundo/formato.js';
import {
  type Ante,
  inicioDe,
  motivoDeLaOpcion,
  nodoDe,
  opcionBlocker,
  puntosDe,
  type RefDeOpcion,
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

/** La primera opción con efectos que se puede elegir en `a`, recorriendo como dice el docstring. */
function primera(a: Ante): RefDeOpcion | null {
  for (const p of puntosDe(a)) {
    const hallada = enElDialogo(a, p);
    if (hallada !== null) return hallada;
  }
  return null;
}

function enElDialogo(a: Ante, p: Punto): RefDeOpcion | null {
  const inicio = inicioDe(a, p);
  const vistos = new Set([inicio]);
  const cola = [inicio];
  while (cola.length > 0) {
    const nodo = cola.shift() as string;
    for (const [i, o] of nodoDe(a, p, nodo).opciones.entries()) {
      if (motivoDeLaOpcion(a, o) !== null) continue;
      const hace = o.hace ?? [];
      if (hace.length > 0) {
        const batalla = hace.find((e): e is { batalla: string } => 'batalla' in e);
        if (batalla !== undefined && !conVentaja(a, batalla.batalla)) continue;
        return { lugar: a.lugar.id, punto: p.id, nodo, opcion: i };
      }
      if (o.ir !== undefined && !vistos.has(o.ir)) {
        vistos.add(o.ir);
        cola.push(o.ir);
      }
    }
  }
  return null;
}

function conVentaja(a: Ante, encuentro: string): boolean {
  const e = a.lugar.encuentros[encuentro];
  if (e === undefined) return false;
  return ventajaClara(fuerzaDe(a.hero, a.state.characters), poderDe({ troops: e.tropa }));
}

/**
 * Lo que la IA elegiría ahora con `hero` en el lugar en que está, o `null`. Se
 * comprueba otra vez con la puerta de la acción (`opcionBlocker`): lo que se
 * propone es lo que la acción acepta.
 */
export function jugadaEnElLugar(state: GameState, hero: Hero): RefDeOpcion | null {
  const mundo = state.mundo;
  if (mundo === undefined) return null;
  const lugar = mundo.historia.lugares.find((l) => l.at.x === hero.at.x && l.at.y === hero.at.y);
  if (lugar === undefined) return null;
  const ref = primera({ state, mundo, hero, lugar });
  return ref === null || opcionBlocker(state, hero.id, ref) !== null ? null : ref;
}

/**
 * Si la IA haría algo con `hero` si estuviera en `lugar`: lo que vale ir allí
 * (`objectValue`). Con el héroe tal como está, puesto en la casilla del lugar.
 */
export function hariaAlgoEn(state: GameState, hero: Hero, lugar: Lugar): boolean {
  const mundo = state.mundo;
  if (mundo === undefined) return false;
  return primera({ state, mundo, hero: { ...hero, at: lugar.at }, lugar }) !== null;
}
