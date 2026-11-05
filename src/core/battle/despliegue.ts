/**
 * El despliegue (02-11-2026, «añade al combate una fase previa de despliegue»;
 * `docs/agents/2026-11-02-fase-de-despliegue/`): dónde puede salir cada unidad,
 * en qué orden despliegan los bandos y qué casilla vale. **Solo lee**: lo que
 * coloca (`createBattle`) y lo que cambia la batalla (`aplicarDespliegue`,
 * `terminarElDespliegue`) vive en `battle.ts`, que importa esto, y no al revés.
 *
 * La zona y el momento se piden **por unidad** (`alcanceDelDespliegue`): una
 * habilidad como la infiltración amplía las columnas de una unidad («más
 * adelante») o la saca a desplegar cuando el enemigo ya está en el campo («más
 * tarde») escribiendo `UnitInfo.despliegue`, sin tocar ni la batalla ni el
 * cliente.
 */
import type { AlcanceDelDespliegue, Hex, MomentoDeDespliegue, UnitInfo } from '../types.js';
import { COLUMNAS_DE_SALIDA, hexEquals, hexKey, isInside } from './board.js';
import { casillasDeMuro, type MurallaDeBatalla, SIN_MURALLA } from './muralla.js';
import { enElMarco, noCabenEnLaSalida, zonaEnSuMarco } from './salida.js';
import type { BattleStack, BattleState, Side } from './types.js';

export type { AlcanceDelDespliegue, MomentoDeDespliegue } from '../types.js';

/**
 * Hasta cuántas columnas desde su borde puede desplegar una unidad: la mitad de
 * una fila de 12. Más allá, la zona de un bando pisaría la del otro en toda
 * fila, y «desplegar» sería empezar la batalla dentro del enemigo.
 */
export const COLUMNAS_MAXIMAS_DE_SALIDA = 6;

/** Lo de todos: las columnas de salida de su borde, con su bando. */
const DE_SERIE: AlcanceDelDespliegue = { columnas: COLUMNAS_DE_SALIDA, momento: 'con_su_bando' };

/**
 * Dónde y cuándo despliega `unit`: lo suyo (`UnitInfo.despliegue`) o lo de
 * todos. **La única lectura** de `UnitInfo.despliegue`: la zona y la tanda de
 * cada uno salen de aquí. Lanza con unas columnas que no van de 1 a
 * `COLUMNAS_MAXIMAS_DE_SALIDA`.
 */
export function alcanceDelDespliegue(
  unit: Pick<UnitInfo, 'name' | 'despliegue'>,
): AlcanceDelDespliegue {
  const alcance = unit.despliegue ?? DE_SERIE;
  const { columnas } = alcance;
  if (!Number.isInteger(columnas) || columnas < 1 || columnas > COLUMNAS_MAXIMAS_DE_SALIDA) {
    throw new Error(
      `${unit.name} despliega en ${columnas} columnas: se despliega en una a ${COLUMNAS_MAXIMAS_DE_SALIDA} columnas desde su borde`,
    );
  }
  return alcance;
}

/** Una tanda del despliegue: quién despliega y con qué momento. */
export interface Tanda {
  readonly side: Side;
  readonly momento: MomentoDeDespliegue;
}

/**
 * El orden del despliegue (decisión del usuario, 02-11-2026: «el despliegue lo
 * hace primero el atacado, sin los enemigos, y luego el atacante con los
 * enemigos visibles»). Cada bando despliega lo suyo con su bando y, después de
 * los dos, lo que despliega cuando el enemigo ya está en el campo, en el mismo
 * orden. Una tanda sin nadie se salta.
 */
export const TANDAS: readonly Tanda[] = [
  { side: 'defender', momento: 'con_su_bando' },
  { side: 'attacker', momento: 'con_su_bando' },
  { side: 'defender', momento: 'tras_el_enemigo' },
  { side: 'attacker', momento: 'tras_el_enemigo' },
];

/** En qué tanda despliega `stack`: el índice en `TANDAS` de su bando y su momento. */
export function tandaDe(stack: Pick<BattleStack, 'side' | 'unit'>): number {
  const { momento } = alcanceDelDespliegue(stack.unit);
  return TANDAS.findIndex((t) => t.side === stack.side && t.momento === momento);
}

/**
 * La zona de salida de `unit` en `side`, en el marco del tablero y en el orden
 * en que se llena (las columnas de `alcanceDelDespliegue`, sin muros). La leen
 * `asentar`, la casilla que vale al colocar (`colocarBlocker`) y la formación
 * del héroe (`formarBlocker`).
 */
export function zonaDeSalida(
  unit: Pick<UnitInfo, 'name' | 'despliegue'>,
  side: Side,
  muralla: MurallaDeBatalla = SIN_MURALLA,
): readonly Hex[] {
  const { columnas } = alcanceDelDespliegue(unit);
  return zonaEnSuMarco(columnas, side, casillasDeMuro(muralla)).map((h) => enElMarco(side, h));
}

/** Uno que asentar: sus cifras (de ellas, su zona) y la casilla que pide, en el marco del atacante. */
export interface Asiento {
  readonly unit: Pick<UnitInfo, 'name' | 'despliegue'>;
  readonly pedida: Hex | null;
}

/**
 * Dónde sale cada uno de `quienes`, en el marco del tablero y en su orden, o por
 * qué no caben. **La única reconciliación** entre lo que se pide y lo que cabe:
 *
 * 1. Cada casilla pedida (`pedida`, en el marco del atacante: la formación del
 *    héroe, `Troop.salida`) que esté en su zona y libre se queda; si dos piden
 *    la misma, la del primero de la lista.
 * 2. Los demás, en su orden, toman el primer hueco libre de su zona.
 *
 * Sin pedidas y con el héroe el primero es la regla de antes del despliegue: el
 * héroe en el centro de la columna del borde, detrás de su tropa, y la tropa,
 * por su puesto, del centro hacia fuera.
 */
function asentarOMotivo(
  quienes: readonly Asiento[],
  side: Side,
  muralla: MurallaDeBatalla,
  ocupadas: ReadonlySet<string>,
): { readonly casillas: readonly Hex[] } | { readonly motivo: string } {
  const zonas = quienes.map((q) => zonaDeSalida(q.unit, side, muralla));
  const tomadas = new Set<string>(ocupadas);
  const casillas: (Hex | null)[] = quienes.map(() => null);
  quienes.forEach((q, i) => {
    if (q.pedida === null || !isInside(q.pedida)) return;
    const h = enElMarco(side, q.pedida);
    if (tomadas.has(hexKey(h)) || !zonas[i]!.some((z) => hexEquals(z, h))) return;
    tomadas.add(hexKey(h));
    casillas[i] = h;
  });
  for (const [i, q] of quienes.entries()) {
    if (casillas[i] !== null) continue;
    const libre = zonas[i]!.find((z) => !tomadas.has(hexKey(z)));
    if (libre === undefined) {
      return { motivo: noCaben(quienes, zonas, i, q, side, ocupadas.size > 0) };
    }
    tomadas.add(hexKey(libre));
    casillas[i] = libre;
  }
  return { casillas: casillas as Hex[] };
}

/**
 * Por qué el `i`-ésimo no encuentra hueco. Con la zona de todos y nadie más en
 * el campo, la frase de siempre, que lee también el editor de la arena mientras
 * se dibuja (`despliegueBlocker`); si no, quién no cabe.
 */
function noCaben(
  quienes: readonly Asiento[],
  zonas: readonly (readonly Hex[])[],
  i: number,
  q: Asiento,
  side: Side,
  conOtros: boolean,
): string {
  const lado = side === 'attacker' ? 'la izquierda' : 'la derecha';
  const columnas = (j: number): number => alcanceDelDespliegue(quienes[j]!.unit).columnas;
  if (!conOtros && quienes.every((_, j) => columnas(j) === columnas(i))) {
    return noCabenEnLaSalida(zonas[i]!.length, side, quienes.length);
  }
  return `${q.unit.name} no cabe en su zona de salida a ${lado}: la llenan los demás`;
}

const NINGUNA: ReadonlySet<string> = new Set();

/**
 * Dónde sale cada uno de `quienes` (`asentarOMotivo`); lanza con el motivo si no
 * caben. `ocupadas` (claves `hexKey` en el marco del tablero) son las casillas de
 * quien ya está en el campo y no se pisan: las del rival que ya desplegó, al
 * abrir una tanda (`asientoAlAbrir`).
 */
export function asentar(
  quienes: readonly Asiento[],
  side: Side,
  muralla: MurallaDeBatalla = SIN_MURALLA,
  ocupadas: ReadonlySet<string> = NINGUNA,
): readonly Hex[] {
  const hecho = asentarOMotivo(quienes, side, muralla, ocupadas);
  if ('motivo' in hecho) throw new Error(hecho.motivo);
  return hecho.casillas;
}

/**
 * Por qué `units` no caben en la salida de `side` con esta muralla, o `null` si
 * caben: la misma cuenta que `asentar`, sin pedidas. La lee el editor de la
 * arena, que lo avisa mientras se dibuja en vez de dejar que «Luchar» lo
 * descubra.
 */
export function despliegueBlocker(
  units: readonly Pick<UnitInfo, 'name' | 'despliegue'>[],
  side: Side,
  muralla: MurallaDeBatalla,
): string | null {
  const hecho = asentarOMotivo(
    units.map((unit) => ({ unit, pedida: null })),
    side,
    muralla,
    NINGUNA,
  );
  return 'motivo' in hecho ? hecho.motivo : null;
}

// ---------------------------------------------------------------- en la batalla

/** El despliegue en curso, dicho: qué bando, con qué momento y quiénes se colocan. */
export interface DespliegueAhora {
  readonly tanda: number;
  readonly side: Side;
  readonly momento: MomentoDeDespliegue;
  /** Los ids de los stacks que se colocan en esta tanda, en el orden de `stacks`. */
  readonly colocables: readonly string[];
}

/** El despliegue en curso de `state`, o `null` si ya se desplegó todo. */
export function despliegueDe(state: BattleState): DespliegueAhora | null {
  const d = state.despliegue;
  if (d === null) return null;
  const tanda = TANDAS[d.tanda];
  if (tanda === undefined) throw new Error(`no hay tanda ${d.tanda} en el despliegue`);
  return {
    tanda: d.tanda,
    side: tanda.side,
    momento: tanda.momento,
    colocables: deLaTanda(state, d.tanda).map((s) => s.id),
  };
}

/** Los vivos que despliegan en la tanda `t`. */
export function deLaTanda(state: BattleState, t: number): BattleStack[] {
  return state.stacks.filter((s) => s.count > 0 && tandaDe(s) === t);
}

function stackDe(state: BattleState, id: string): BattleStack | undefined {
  return state.stacks.find((s) => s.id === id);
}

/** La zona de salida del stack `stackId`, en el marco del tablero y con la muralla de la batalla. */
export function zonaDe(state: BattleState, stackId: string): readonly Hex[] {
  const s = stackDe(state, stackId);
  if (s === undefined) throw new Error(`no hay ningún «${stackId}» en la batalla`);
  return zonaDeSalida(s.unit, s.side, state.muralla);
}

/**
 * «(4,3)»: una casilla dicha para la persona. La única forma de decirla, en las
 * frases del despliegue, de la formación y en la barra del cliente.
 */
export const enCasilla = (h: Hex): string => `(${h.col},${h.row})`;

/**
 * Quien de su bando, vivo y que no es `s`, está en `at`: con él se cambiaría `s`
 * al colocarse ahí. La única cuenta, que leen `colocarBlocker`, la acción
 * (`aplicarDespliegue`) y la barra del cliente.
 */
export function suyoEn(state: BattleState, s: BattleStack, at: Hex): BattleStack | undefined {
  return state.stacks.find(
    (o) => o !== s && o.count > 0 && o.side === s.side && hexEquals(o.hex, at),
  );
}

/**
 * Por qué `stackId` no se puede colocar en `at` ahora, o `null`. Lo leen
 * `aplicarDespliegue` (que lanza con ello), la formación del héroe
 * (`formarBlocker`, sobre la batalla de la formación) y la pantalla, que lo
 * enseña. Una casilla de la tanda que despliega se **intercambia**; la de un
 * enemigo que aún no ha desplegado cuenta como libre —no se ve, y decir «ahí hay
 * alguien» dejaría sondear lo oculto—: al abrir su tanda, quien la tenía se
 * reasienta (`asientoAlAbrir`).
 */
export function colocarBlocker(state: BattleState, stackId: string, at: Hex): string | null {
  const ahora = despliegueDe(state);
  if (ahora === null) return 'no hay despliegue en curso';
  const s = stackDe(state, stackId);
  if (s === undefined || s.count <= 0) return `no hay ningún «${stackId}» en la batalla`;
  const nombre = s.unit.name;
  if (s.side !== ahora.side) return `${nombre} no es del bando que despliega`;
  const suya = tandaDe(s);
  if (suya > ahora.tanda) {
    return `${nombre} despliega más tarde, cuando el enemigo ya esté en el campo`;
  }
  if (suya < ahora.tanda) return `${nombre} ya desplegó`;
  // `isInside` solo mira los límites: (0.5, 4) cae dentro y no es ninguna casilla.
  if (!Number.isInteger(at.col) || !Number.isInteger(at.row) || !isInside(at)) {
    return `${enCasilla(at)} no es una casilla del tablero`;
  }
  if (hexEquals(s.hex, at)) return `${nombre} ya sale en ${enCasilla(at)}`;
  if (casillasDeMuro(state.muralla).has(hexKey(at))) return `en ${enCasilla(at)} hay muro`;
  const zona = zonaDe(state, s.id);
  if (!zona.some((z) => hexEquals(z, at))) return fueraDeLaZona(s.unit, at);
  const ahi = suyoEn(state, s, at);
  if (ahi === undefined) {
    // El enemigo que aún no ha desplegado no se ve: su casilla cuenta como libre.
    const visto = state.stacks.find(
      (o) => o.count > 0 && o.side !== s.side && hexEquals(o.hex, at) && tandaDe(o) < ahora.tanda,
    );
    return visto === undefined ? null : `en ${enCasilla(at)} está ${visto.unit.name}`;
  }
  const deAhi = tandaDe(ahi);
  if (deAhi > ahora.tanda)
    return `en ${enCasilla(at)} está ${ahi.unit.name}, que despliega más tarde`;
  if (deAhi < ahora.tanda) return `en ${enCasilla(at)} está ${ahi.unit.name}, que ya desplegó`;
  // Un intercambio: el que estaba ahí va a la casilla del que llega.
  if (!zonaDe(state, ahi.id).some((z) => hexEquals(z, s.hex))) {
    return `${ahi.unit.name} no puede ir a ${enCasilla(s.hex)}: ${fueraDeLaZona(ahi.unit, s.hex)}`;
  }
  return null;
}

/**
 * Dónde sale cada uno de la tanda `t` al abrirla, en el orden de `deLaTanda`:
 * donde está, salvo quien está donde ya hay uno desplegado, que va al primer
 * hueco libre de su zona. Pasa solo si una zona ampliada
 * (`alcanceDelDespliegue`) llega a la del rival y quien desplegó antes cogió esa
 * casilla, que no podía ver ocupada (`colocarBlocker`). Es `asentar` con lo de
 * cada uno pedido y las casillas de los desplegados ocupadas: la misma regla, y
 * la misma frase si no caben. Lo escribe `battle.ts` (`seguirElDespliegue`).
 */
export function asientoAlAbrir(state: BattleState, t: number): readonly Hex[] {
  const suyos = deLaTanda(state, t);
  const ocupadas = new Set(
    state.stacks.filter((o) => o.count > 0 && tandaDe(o) < t).map((o) => hexKey(o.hex)),
  );
  const side = TANDAS[t]!.side;
  return asentar(
    // Lo pedido va en el marco del atacante, como la formación.
    suyos.map((s) => ({ unit: s.unit, pedida: enElMarco(side, s.hex) })),
    side,
    state.muralla,
    ocupadas,
  );
}

/**
 * «(4,4) queda fuera de la zona de salida de Escudero: las 3 columnas de su
 * borde». La leen la casilla de la batalla (`colocarBlocker`) y la de la
 * formación (`formarBlocker`).
 */
export function fueraDeLaZona(unit: Pick<UnitInfo, 'name' | 'despliegue'>, at: Hex): string {
  const { columnas } = alcanceDelDespliegue(unit);
  const cuales = columnas === 1 ? 'la columna de su borde' : `las ${columnas} columnas de su borde`;
  return `${enCasilla(at)} queda fuera de la zona de salida de ${unit.name}: ${cuales}`;
}

/**
 * Lo que de la batalla ve quien mira desde `quienMira`: en el despliegue, lo
 * suyo y lo del rival que ya desplegó (el defensor despliega sin ver a nadie;
 * el atacante, con el defensor ya en el campo). Con `quienMira === null` (nadie
 * en particular) y fuera del despliegue, la batalla tal cual, el mismo objeto.
 * Es una copia de lectura: lo que cambia la batalla se hace sobre `state`.
 */
export function batallaALaVista(state: BattleState, quienMira: Side | null): BattleState {
  const d = state.despliegue;
  if (d === null || quienMira === null) return state;
  const stacks = state.stacks.filter((s) => s.side === quienMira || tandaDe(s) < d.tanda);
  return stacks.length === state.stacks.length ? state : { ...state, stacks };
}

/**
 * La firma del despliegue: la tanda y la casilla de cada uno. Colocar no deja
 * línea en el registro, así que las cachés que van por su largo
 * (`claveDeBatalla`) la necesitan para ver que algo se movió. Vacía fuera del
 * despliegue.
 */
export function firmaDelDespliegue(state: BattleState): string {
  const d = state.despliegue;
  if (d === null) return '';
  return `${d.tanda}:${state.stacks.map((s) => `${s.id}@${s.hex.col},${s.hex.row}`).join(';')}`;
}
