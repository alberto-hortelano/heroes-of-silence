/**
 * Desde qué casilla golpear: la regla del «ángulo» de la batalla, pura.
 *
 * Al pasar el ratón por un enemigo que se puede golpear cuerpo a cuerpo se
 * resaltan todas las casillas desde las que se le alcanza, y la más cercana al
 * puntero es la que se elige al hacer clic (decisión del usuario, 02-10-2026: «como
 * en el HoMM, pero en lugar de con una flecha en el ratón, resaltando la casilla
 * desde la que atacaría»). Antes el cliente elegía solo el primer `from` de la
 * lista y la persona no podía reposicionarse para atacar desde otro lado.
 *
 * Vive aparte de la escena y sin DOM porque la leen dos: la escena —para pintar
 * y para el clic— y el guion de capturas, que tiene que mandar en su espejo
 * exactamente la misma acción que la página. Con la regla copiada allí, el día
 * que cambie aquí el espejo se separaría de la página sin que nada lo dijera.
 *
 * Las opciones salen **siempre** de la lista de acciones legales: aquí no se
 * construye ninguna acción, se elige.
 */
import { hexEquals } from '@core/battle/board.js';
import type { BattleAction } from '@core/battle/types.js';
import type { Hex } from '@core/types.js';
import { planoDeHex, planoDePixel, type Tablero } from '../render/proyeccion.js';

type Golpe = Extract<BattleAction, { type: 'attack' }>;

/** Un golpe posible contra el objetivo, y la casilla desde la que saldría. */
interface OpcionDeGolpe {
  readonly accion: Golpe;
  readonly desde: Hex;
}

/**
 * Los golpes cuerpo a cuerpo contra `objetivo`, cada uno con su casilla. El que
 * no lleva `from` —la unidad ya está pegada— sale desde `hexActual`: la casilla
 * en la que está es una opción más, no un caso aparte.
 */
export function opcionesDeGolpe(
  acciones: readonly BattleAction[],
  objetivo: string,
  hexActual: Hex,
): OpcionDeGolpe[] {
  const out: OpcionDeGolpe[] = [];
  for (const a of acciones) {
    if (a.type !== 'attack' || a.target !== objetivo) continue;
    const desde = a.from ?? hexActual;
    // Dos acciones para la misma casilla no deberían existir; si existieran, la
    // primera manda, igual que en el empate de `masCercana`.
    if (out.some((o) => hexEquals(o.desde, desde))) continue;
    out.push({ accion: a, desde });
  }
  return out;
}

/**
 * La opción cuya casilla queda más cerca del puntero, medida en el PLANO del
 * tablero y no en píxeles: en pantalla las filas van aplastadas a 25° y la
 * vecina de arriba queda más cerca que la de al lado, así que en píxeles la
 * casilla del oeste no ganaba nunca dentro del hexágono del enemigo. En el plano
 * las seis vecinas están a la misma distancia y cada una se lleva su sexto del
 * hexágono, que es lo que ve quien mueve el ratón alrededor.
 *
 * A igualdad gana la primera de la lista, que es el orden de las acciones
 * legales: así un puntero justo en medio no elige al azar entre dos fotogramas.
 */
export function masCercana(
  opciones: readonly OpcionDeGolpe[],
  tablero: Tablero,
  px: number,
  py: number,
): OpcionDeGolpe | undefined {
  const p = planoDePixel(tablero, px, py);
  let mejor: OpcionDeGolpe | undefined;
  let mejorDistancia = Number.POSITIVE_INFINITY;
  for (const o of opciones) {
    const c = planoDeHex(o.desde);
    const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
    if (d < mejorDistancia) {
      mejor = o;
      mejorDistancia = d;
    }
  }
  return mejor;
}

/**
 * Lo que haría un clic sobre `objetivo` en `(px, py)`: el
 * golpe desde la casilla más cercana al puntero junto con todas las candidatas,
 * que son las que se resaltan. `undefined` si no hay golpe.
 *
 * **El disparo no es de aquí** (26-10-2026): hasta el selector de arma, un `aim`
 * contra ese enemigo ganaba al golpe, y el arquero veía marcadas sus casillas de
 * andar y de cargar pero el clic solo apuntaba. Ahora quien juega elige el arma
 * (`ArmaDeLaActiva`) y la lista de cada modo trae o el golpe o el `aim`, nunca los
 * dos. La leen el clic (`accionContra`) y el resaltado de la escena.
 */
export function golpeEnPixel(
  acciones: readonly BattleAction[],
  objetivo: string,
  hexActual: Hex,
  tablero: Tablero,
  px: number,
  py: number,
): { readonly opciones: readonly OpcionDeGolpe[]; readonly elegida: OpcionDeGolpe } | undefined {
  const opciones = opcionesDeGolpe(acciones, objetivo, hexActual);
  const elegida = masCercana(opciones, tablero, px, py);
  return elegida === undefined ? undefined : { opciones, elegida };
}

/** La acción que manda un clic sobre un enemigo en `(px, py)`: la de `golpeEnPixel`. */
export function accionContra(
  acciones: readonly BattleAction[],
  objetivo: string,
  hexActual: Hex,
  tablero: Tablero,
  px: number,
  py: number,
): BattleAction | undefined {
  return golpeEnPixel(acciones, objetivo, hexActual, tablero, px, py)?.elegida.accion;
}
