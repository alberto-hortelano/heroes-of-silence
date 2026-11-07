/**
 * El tablero bajo el puntero y colocar en él (fase de despliegue, 02-11-2026): lo
 * que comparten la batalla (`EscenaBatalla`) y la vista de la tropa
 * (`EscenaTropa`), que es el mismo tablero sobre la batalla de la formación.
 * Quién está bajo el puntero (`unidadBajo`, `casillaBajo`), qué se pinta
 * mientras se coloca —el tablero entero con la zona del elegido y su aro,
 * `tableroAlColocar`— y qué hace el clic —elegir a uno de los suyos o
 * colocarlo— se deciden aquí una vez; la casilla que vale la juzga el núcleo
 * (`colocarBlocker`) por la sesión (`DespliegueEnPantalla`).
 *
 * El clic, como el de la batalla (`EscenaBatalla.movimientoEn`): el centro de una
 * casilla de la zona gana a la figura que lo tapa, así que pulsar el cuerpo de
 * otro de los tuyos lo elige y pulsar su casilla, a sus pies, lo cambia con el
 * elegido.
 */
import { hexEquals } from '@core/battle/board.js';
import { isAlive, stackHexes } from '@core/battle/consultas.js';
import { nivelDe } from '@core/battle/muralla.js';
import type { BattleStack, BattleState, Side } from '@core/battle/types.js';
import type { ClimaDelSitio } from '@core/state/clima.js';
import type { Hex } from '@core/types.js';
import { cajaDeFigura } from '../render/batalla/figura.js';
import { type Punto, tableroA } from '../render/batalla/muralla.js';
import type { Efecto, EstadoFigura, VistaBatalla } from '../render/batalla/tablero.js';
import { dentroDeLaFigura } from '../render/figuras/caja.js';
import { cercaDelCentro, hexEnPixel, type Tablero } from '../render/proyeccion.js';
import type { ColocacionEnPantalla } from '../sesion/batalla/despliegue.js';

// ---------------------------------------------------------------- bajo el puntero

/** Lo que el puntero necesita para leer el tablero: lo que se ve, su encuadre y dónde está cada figura. */
export interface TableroBajoElPuntero {
  /** Lo que se ve: en la batalla, `batallaALaVista`; en la tropa, la batalla de la formación. */
  readonly battle: BattleState | null;
  readonly tablero: Tablero;
  readonly figura: (s: BattleStack) => EstadoFigura;
}

/** El muro cuya columna tiene lo alto bajo el puntero, o `null`. */
export function muroBajo(t: TableroBajoElPuntero, px: number, py: number): Hex | null {
  const battle = t.battle;
  // Sin muros no hay columna que buscar: se pregunta en cada movimiento del ratón.
  if (battle === null || battle.muralla.muros.length === 0) return null;
  const h = hexEnPixel(tableroA(t.tablero, 1), px, py);
  return h !== null && nivelDe(battle.muralla, h) === 1 ? h : null;
}

/**
 * La casilla bajo el puntero, con las columnas de la muralla: primero lo alto de
 * una columna —que tapa lo que hay detrás—, luego el suelo. Es la regla del clic
 * y del puntero sobre el tablero.
 */
export function casillaBajo(t: TableroBajoElPuntero, px: number, py: number): Hex | null {
  return muroBajo(t, px, py) ?? hexEnPixel(t.tablero, px, py);
}

/** El tablero en el que está `hex`: el de lo alto si es un muro. */
export function tableroDe(t: TableroBajoElPuntero, hex: Hex): Tablero {
  return t.battle === null ? t.tablero : tableroA(t.tablero, nivelDe(t.battle.muralla, hex));
}

/** Quién, vivo, ocupa `hex` en lo que se ve. */
export function stackEn(battle: BattleState | null, hex: Hex): BattleStack | undefined {
  if (battle === null) return undefined;
  return battle.stacks.find((s) => isAlive(s) && stackHexes(s).some((h) => hexEquals(h, hex)));
}

/**
 * La unidad bajo el puntero: primero por su figura —de delante atrás, que es la
 * que tapa, y a su alto si está en lo alto de un muro— y si no, por su casilla.
 * Con solo la casilla, pulsar el cuerpo de una figura caía en la de la fila de
 * atrás. Solo lo que se ve: en el despliegue, el rival que aún no ha desplegado
 * no se señala ni se pulsa.
 */
export function unidadBajo(
  t: TableroBajoElPuntero,
  px: number,
  py: number,
): BattleStack | undefined {
  const battle = t.battle;
  if (battle === null) return undefined;
  let mejor: { s: BattleStack; suelo: number } | null = null;
  for (const s of battle.stacks) {
    if (!isAlive(s)) continue;
    const f = t.figura(s);
    const c = cajaDeFigura(t.tablero, f.en, f.elevacion);
    if (dentroDeLaFigura(c, px, py) && (mejor === null || c.suelo > mejor.suelo))
      mejor = { s, suelo: c.suelo };
  }
  if (mejor !== null) return mejor.s;
  const hex = casillaBajo(t, px, py);
  return hex === null ? undefined : stackEn(battle, hex);
}

// ---------------------------------------------------------------- colocar

/** Lo que haría un clic en el tablero mientras se coloca. */
export type ClicAlColocar =
  | { readonly kind: 'colocar'; readonly at: Hex }
  | { readonly kind: 'elegir'; readonly stack: BattleStack }
  | { readonly kind: 'nada' };

/** Lo que el tablero pinta mientras se coloca: la zona del elegido en verde y su aro. */
export function vistaAlColocar(c: ColocacionEnPantalla): {
  readonly movibles: readonly Hex[];
  readonly activo: string | null;
} {
  const e = c.elegido;
  return { movibles: e === null ? [] : c.zona, activo: e?.id ?? null };
}

/** Lo que cambia de una escena a otra al pintar el tablero mientras se coloca. */
export interface TableroAlColocar {
  /** Lo que se ve: en la batalla, `batallaALaVista`; en la tropa, la batalla de la formación. */
  readonly battle: BattleState;
  readonly tablero: Tablero;
  readonly ancho: number;
  readonly alto: number;
  readonly hoverHex: Hex | null;
  readonly hoverStack: string | null;
  readonly puntero: Punto | null;
  readonly figura: (s: BattleStack) => EstadoFigura;
  readonly efectos: readonly Efecto[];
  /** Lo apuntado y las granadas en el aire (`BattleAnimator.aDistancia`). */
  readonly apuntados: ReadonlyMap<string, Hex>;
  readonly granadas: ReadonlyMap<string, Hex>;
  readonly sinDueño: ReadonlySet<Side>;
  readonly clima: { readonly sitio: ClimaDelSitio; readonly ahora: number };
}

const NINGUNO: ReadonlySet<string> = new Set();

/**
 * Lo que `drawBatalla` pinta mientras se coloca, una sola vez para la batalla y
 * la tropa: la zona del elegido en verde y su aro (`vistaAlColocar`), y nada de
 * jugar —ni cargas, ni golpes, ni muros ni puertas por elegir, ni rueda—. Así la
 * tropa se ve como el despliegue de una batalla porque es el mismo pintado.
 */
export function tableroAlColocar(c: ColocacionEnPantalla, t: TableroAlColocar): VistaBatalla {
  const { movibles, activo } = vistaAlColocar(c);
  return {
    ...t,
    movibles,
    cargas: [],
    angulo: null,
    atacables: NINGUNO,
    escalables: NINGUNO,
    puertasPorElegir: NINGUNO,
    objetivosHechizo: NINGUNO,
    activo,
    enLaRueda: null,
    tanteo: null,
    granadaTanteada: null,
  };
}

/**
 * Qué hace un clic en `(px, py)`: en el centro de una casilla de la zona que no
 * es la del elegido, colocar; sobre una unidad, elegirla —si no se coloca ahora,
 * `elegir` dice por qué—; en otra casilla, colocar, y el núcleo dirá si no vale.
 */
export function clicAlColocar(
  c: ColocacionEnPantalla,
  t: TableroBajoElPuntero,
  px: number,
  py: number,
): ClicAlColocar {
  const casilla = casillaBajo(t, px, py);
  const enElCentro =
    casilla !== null && cercaDelCentro(tableroDe(t, casilla), casilla, px, py) ? casilla : null;
  const unidad = unidadBajo(t, px, py);
  const e = c.elegido;
  if (e === null)
    return unidad === undefined ? { kind: 'nada' } : { kind: 'elegir', stack: unidad };
  if (
    enElCentro !== null &&
    !hexEquals(enElCentro, e.hex) &&
    c.zona.some((z) => hexEquals(z, enElCentro))
  ) {
    return { kind: 'colocar', at: enElCentro };
  }
  if (unidad !== undefined) return { kind: 'elegir', stack: unidad };
  return casilla === null || hexEquals(casilla, e.hex)
    ? { kind: 'nada' }
    : { kind: 'colocar', at: casilla };
}

/** Lo que dice la barra con el puntero encima: lo que haría el clic. */
export function dichoAlColocar(c: ColocacionEnPantalla, clic: ClicAlColocar): string | null {
  switch (clic.kind) {
    case 'colocar':
      return c.dichoDeColocar(clic.at);
    case 'elegir':
      return clic.stack.id === c.elegido?.id || !c.esColocable(clic.stack.id)
        ? null
        : `Elegir a ${clic.stack.unit.name} para colocarlo.`;
    case 'nada':
      return null;
  }
}

/**
 * Lo que el puntero señala en `(px, py)` mientras se coloca: la casilla, la
 * figura que se elegiría con el clic y lo que diría la barra (`dichoAlColocar`).
 * Lo mismo en la batalla y en la tropa.
 */
export function señalarAlColocar(
  c: ColocacionEnPantalla,
  t: TableroBajoElPuntero,
  px: number,
  py: number,
): {
  readonly clic: ClicAlColocar;
  readonly hoverHex: Hex | null;
  readonly hoverStack: string | null;
  readonly dicho: string | null;
} {
  const clic = clicAlColocar(c, t, px, py);
  return {
    clic,
    hoverHex: casillaBajo(t, px, py),
    hoverStack: clic.kind === 'elegir' ? clic.stack.id : null,
    dicho: dichoAlColocar(c, clic),
  };
}

/** Hace el clic. */
export function pulsarAlColocar(c: ColocacionEnPantalla, clic: ClicAlColocar): void {
  switch (clic.kind) {
    case 'colocar':
      c.colocarEn(clic.at);
      return;
    case 'elegir':
      c.elegir(clic.stack.id);
      return;
    case 'nada':
      return;
  }
}

/**
 * Las flechas mueven al elegido a la casilla de al lado, en columnas y filas del
 * tablero (arriba y abajo, la de la fila vecina con la misma columna). La juzga
 * el núcleo como un clic: una que no vale lo dice en la barra.
 */
export const FLECHAS_AL_COLOCAR: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
