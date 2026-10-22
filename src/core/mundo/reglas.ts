/**
 * Las reglas de los lugares en la partida: si una condición se cumple, si una
 * opción se puede elegir y por qué no. **La única lectura** de las condiciones:
 * la leen la acción del núcleo (`elegir_en_lugar`, que lanza con el motivo), la
 * pantalla del lugar (que apaga la opción y pone el motivo debajo) y la IA de
 * reglas (`ai/lugares.ts`, que elige la primera que vale).
 *
 * Aplicar los efectos no vive aquí: escribe la crónica, y el único que escribe
 * en ella es `emit`, privado de `game.ts`. Este módulo solo pregunta. De
 * `game.ts` lee el turno y el dueño (`turnBlocker`, `playerById`) solo dentro de
 * sus funciones: `game.ts` lo importa a él, y el ciclo no se toca al cargar.
 */
import { idsPuestos, piezaSiExiste } from '../hero/equipo.js';
import type { Hero } from '../hero/hero.js';
import { CUPO_HEROE, heroLeadership, troopBlocker, withTroops } from '../hero/troop.js';
import { pointKey } from '../map/map.js';
import { type GameState, playerById, turnBlocker } from '../state/game.js';
import { oroBlocker } from '../town/town.js';
import { conMiles, describirCoste, type Point } from '../types.js';
import {
  type Condicion,
  type Dialogo,
  type EstadoDelMundo,
  type Lugar,
  lugarSiExiste,
  type NodoDeDialogo,
  nombreDelPunto,
  type Opcion,
  type Punto,
} from './formato.js';

/** Qué opción se elige: el lugar, su punto, el nodo de su diálogo y su índice. */
export interface RefDeOpcion {
  readonly lugar: string;
  readonly punto: string;
  readonly nodo: string;
  readonly opcion: number;
}

/** Lo que una condición necesita del estado: el héroe, su dueño y el mundo. */
export interface Ante {
  readonly state: GameState;
  readonly mundo: EstadoDelMundo;
  readonly hero: Hero;
  readonly lugar: Lugar;
}

/** Por qué no hay mundo: la frase de `mundoDe` y de quien pregunta sin lanzar. */
const SIN_MUNDO = 'esta partida no es de un mundo: no tiene lugares';

/** El mundo de la partida, o lanza: la única que lo dice. */
export function mundoDe(state: GameState): EstadoDelMundo {
  if (state.mundo === undefined) throw new Error(SIN_MUNDO);
  return state.mundo;
}

function oroDe(state: GameState, hero: Hero): number {
  return playerById(state, hero.owner).oro;
}

/** Si el héroe lleva la pieza `id`: puesta, en su tropa o en la mochila. */
function loLleva(hero: Hero, id: string): boolean {
  return (
    hero.mochila.includes(id) ||
    idsPuestos(hero.equipo).includes(id) ||
    hero.army.some((t) => idsPuestos(t.veterania?.equipo).includes(id))
  );
}

/** El nombre del estado de ahora de un lugar, para la persona (el rótulo del mapa, el lateral). */
export function estadoDicho(mundo: EstadoDelMundo, lugar: Lugar): string {
  return nombreDeEstado(lugar, mundo.estados[lugar.id] ?? '');
}

function nombreDePieza(id: string): string {
  return piezaSiExiste(id)?.nombre ?? id;
}

function nombreDeEstado(lugar: Lugar, estado: string): string {
  return lugar.estados[estado] ?? estado;
}

/** Por qué no se cumple `c`, o `null`. Las frases son para la persona y van debajo de la opción. */
export function condicionBlocker(a: Ante, c: Condicion): string | null {
  if ('estado' in c) {
    const ahora = a.mundo.estados[a.lugar.id];
    return ahora === c.estado
      ? null
      : `«${a.lugar.nombre}» está ${nombreDeEstado(a.lugar, ahora ?? '')}, no ${nombreDeEstado(a.lugar, c.estado)}`;
  }
  if ('marca' in c) {
    return a.mundo.marcas.includes(c.marca)
      ? null
      : (a.mundo.historia.marcas[c.marca]?.falta ?? `falta «${c.marca}»`);
  }
  if ('oro' in c) {
    const oro = oroDe(a.state, a.hero);
    return oro >= c.oro
      ? null
      : `hace falta tener ${describirCoste(c.oro)} y tienes ${conMiles(oro)} oro`;
  }
  if ('lleva' in c) {
    return loLleva(a.hero, c.lleva) ? null : `${a.hero.name} no lleva ${nombreDePieza(c.lleva)}`;
  }
  if ('faccion' in c) {
    return a.hero.faction === c.faccion ? null : `solo para un héroe de ${c.faccion}`;
  }
  const n = c.no;
  if ('no' in n) return condicionBlocker(a, n.no);
  if (condicionBlocker(a, n) !== null) return null;
  if ('estado' in n) return `«${a.lugar.nombre}» ya está ${nombreDeEstado(a.lugar, n.estado)}`;
  if ('marca' in n) return a.mundo.historia.marcas[n.marca]?.ya ?? `ya está «${n.marca}»`;
  if ('oro' in n) return `es para quien tenga menos de ${describirCoste(n.oro)}`;
  if ('lleva' in n) return `${a.hero.name} ya lleva ${nombreDePieza(n.lleva)}`;
  return `no es para un héroe de ${n.faccion}`;
}

/** La primera condición de la lista que no se cumple, con su motivo; `null` si todas. */
function condicionesBlocker(a: Ante, si: readonly Condicion[] | undefined): string | null {
  for (const c of si ?? []) {
    const m = condicionBlocker(a, c);
    if (m !== null) return m;
  }
  return null;
}

/**
 * Por qué no se puede elegir `opcion` ahora, o `null`: sus condiciones escritas y
 * las que llevan sus efectos —pagar sin oro, entregar lo que no está en la
 * mochila, tropa que no cabe—. Es lo que se escribe debajo de una opción apagada.
 */
export function motivoDeLaOpcion(a: Ante, opcion: Opcion): string | null {
  const escrita = condicionesBlocker(a, opcion.si);
  if (escrita !== null) return escrita;
  let paga = 0;
  // La mochila se copia solo si algo se entrega: dos «quitar» de la misma pieza
  // piden dos en ella.
  let mochila: readonly string[] = a.hero.mochila;
  let army = a.hero.army;
  for (const e of opcion.hace ?? []) {
    if ('oro' in e && e.oro < 0) paga -= e.oro;
    if ('quitar' in e) {
      const i = mochila.indexOf(e.quitar);
      if (i < 0) return `${a.hero.name} no lleva ${nombreDePieza(e.quitar)} en la mochila`;
      mochila = [...mochila.slice(0, i), ...mochila.slice(i + 1)];
    }
    if ('tropa' in e) {
      const motivo = troopBlocker(
        army,
        heroLeadership(a.hero),
        CUPO_HEROE,
        e.tropa.unidad,
        e.tropa.n,
        'tu ejército',
      );
      if (motivo !== null) return motivo;
      army = withTroops(army, e.tropa.unidad, e.tropa.n);
    }
  }
  return paga > 0 ? oroBlocker(paga, oroDe(a.state, a.hero)) : null;
}

/** Si el punto está en la escena del lugar ahora (su `si`). */
export function puntoVisible(a: Ante, punto: Punto): boolean {
  return condicionesBlocker(a, punto.si) === null;
}

/** Un héroe, el lugar donde está y su mundo, o por qué no: lo que se ve de un lugar desde dentro. */
export function anteDelLugar(
  state: GameState,
  heroId: string,
  lugarId: string,
): Ante | { readonly motivo: string } {
  const mundo = state.mundo;
  if (mundo === undefined) return { motivo: SIN_MUNDO };
  const hero = state.heroes.find((h) => h.id === heroId);
  if (hero === undefined) return { motivo: `no existe ningún héroe "${heroId}"` };
  const pedido = lugarSiExiste(mundo.historia, lugarId);
  if (pedido === null) return { motivo: `no hay ningún lugar "${lugarId}"` };
  const lugar = lugarEn(state, hero.at);
  if (lugar?.id !== pedido.id) return { motivo: `${hero.name} no está en «${pedido.nombre}»` };
  return { state, mundo, hero, lugar };
}

/** El héroe `heroId`, el lugar de su casilla y su mundo, o por qué no: lo que ve quien está dentro. */
export function anteDelHeroe(state: GameState, heroId: string): Ante | { readonly motivo: string } {
  const hero = state.heroes.find((h) => h.id === heroId);
  if (hero === undefined) return { motivo: `no existe ningún héroe "${heroId}"` };
  const lugar = lugarEn(state, hero.at);
  if (lugar === null) return { motivo: `${hero.name} no está en ningún lugar` };
  return anteDelLugar(state, heroId, lugar.id);
}

/** Los puntos del lugar que están ahora, en su orden. */
export function puntosDe(a: Ante): readonly Punto[] {
  return a.lugar.puntos.filter((p) => puntoVisible(a, p));
}

function dialogoDe(a: Ante, punto: Punto): Dialogo {
  const d = a.lugar.dialogos[punto.dialogo];
  if (d === undefined) throw new Error(`el punto ${punto.id} no tiene su diálogo ${punto.dialogo}`);
  return d;
}

/** El nodo de un diálogo, o lanza. */
export function nodoDe(a: Ante, punto: Punto, nodo: string): NodoDeDialogo {
  const n = dialogoDe(a, punto).nodos[nodo];
  if (n === undefined) throw new Error(`el diálogo de ${punto.id} no tiene ningún nodo "${nodo}"`);
  return n;
}

/** El nodo por el que empieza la conversación de un punto. */
export function inicioDe(a: Ante, punto: Punto): string {
  return dialogoDe(a, punto).inicio;
}

/** Si una opción solo navega: sin efectos, es de la conversación y no de la partida. */
export function soloNavega(o: Opcion): boolean {
  return (o.hace ?? []).length === 0;
}

/**
 * Los nodos a los que se llega desde `inicio` por las salidas que da `salidas`,
 * en el orden en que se descubren (en anchura, cada nodo con sus salidas en su
 * orden). **El único recorrido** de un diálogo: lo leen los nodos alcanzables
 * ahora (`nodosAlcanzables`) y la validación, sin condiciones (`validar.ts`).
 */
export function recorrido(
  inicio: string,
  salidas: (nodo: string) => readonly string[],
): readonly string[] {
  const vistos = [inicio];
  for (let i = 0; i < vistos.length; i++) {
    for (const sig of salidas(vistos[i] as string)) if (!vistos.includes(sig)) vistos.push(sig);
  }
  return vistos;
}

/**
 * Los nodos del diálogo de `punto` a los que se llega **ahora** desde su inicio,
 * por las opciones que solo navegan y cuyo `si` se cumple, en el orden en que se
 * descubren. Es lo que se puede elegir: una opción con efectos de otro nodo la
 * rechaza `opcionBlocker`, que si no se cobraría un premio detrás de una
 * condición sin cumplirla con solo nombrar su nodo (H1 del simplify de la F1a).
 * Lo de después de una opción con efectos no cuenta: tras aplicarla, la
 * conversación puede seguir allí para leer y navegar, y lo que haga algo tiene
 * que ir donde se llega navegando (lo exige la validación).
 */
export function nodosAlcanzables(a: Ante, punto: Punto): readonly string[] {
  const d = dialogoDe(a, punto);
  return recorrido(d.inicio, (n) =>
    (d.nodos[n]?.opciones ?? []).flatMap((o) =>
      o.ir !== undefined && soloNavega(o) && condicionesBlocker(a, o.si) === null ? [o.ir] : [],
    ),
  );
}

/** Una opción de un nodo, dicha para la pantalla y la IA. */
export interface OpcionALaVista {
  readonly indice: number;
  readonly texto: string;
  /** Por qué no se puede elegir; `null`, se puede. */
  readonly motivo: string | null;
  /** Si elegirla aplica algo en la partida (una acción del núcleo) o solo navega. */
  readonly hace: boolean;
  /** Si abre una batalla. */
  readonly pelea: boolean;
  readonly ir: string | null;
}

/** Las opciones de un nodo con su motivo (`motivoDeLaOpcion`). */
export function opcionesDe(a: Ante, punto: Punto, nodo: string): readonly OpcionALaVista[] {
  return nodoDe(a, punto, nodo).opciones.map((o, indice) => ({
    indice,
    texto: o.texto,
    motivo: motivoDeLaOpcion(a, o),
    hace: !soloNavega(o),
    pelea: (o.hace ?? []).some((e) => 'batalla' in e),
    ir: o.ir ?? null,
  }));
}

/**
 * La opción de una referencia, desde el héroe en su lugar (`a`), o por qué no:
 * el punto que está ahora, el nodo de su diálogo, que se alcance ahora
 * (`nodosAlcanzables`) y la opción. **La única resolución** de una referencia:
 * la leen la pregunta (`opcionBlocker`) y la acción (`opcionDe`).
 */
export function resolverOpcion(
  a: Ante,
  ref: RefDeOpcion,
): { readonly punto: Punto; readonly opcion: Opcion } | { readonly motivo: string } {
  const punto = a.lugar.puntos.find((p) => p.id === ref.punto);
  if (punto === undefined) {
    return { motivo: `en «${a.lugar.nombre}» no hay ningún punto "${ref.punto}"` };
  }
  const fuera = condicionesBlocker(a, punto.si);
  if (fuera !== null) return { motivo: fuera };
  const nodo = dialogoDe(a, punto).nodos[ref.nodo];
  if (nodo === undefined) return { motivo: `esa conversación no tiene ningún nodo "${ref.nodo}"` };
  if (!nodosAlcanzables(a, punto).includes(ref.nodo)) {
    return {
      motivo: `a esa parte de la conversación con ${nombreDelPunto(punto)} no se llega ahora: lo que lleva hasta ella no se cumple`,
    };
  }
  const opcion = nodo.opciones[ref.opcion];
  if (opcion === undefined) return { motivo: `ese nodo no tiene la opción ${ref.opcion}` };
  return { punto, opcion };
}

/**
 * Por qué no se puede elegir esa opción ahora, o `null`. Lo que mira, en el orden
 * en que se entiende: el héroe en el lugar, el turno de su dueño (`turnBlocker`:
 * también que la partida siga), la referencia (`resolverOpcion`: el punto que
 * está, el nodo al que se llega ahora y la opción), que haga algo y lo de
 * `motivoDeLaOpcion`. La batalla pendiente la rechaza la puerta de toda acción
 * (`applyAdventureAction`), como en las demás. La lee la acción, que lanza con él.
 */
export function opcionBlocker(state: GameState, heroId: string, ref: RefDeOpcion): string | null {
  const a = anteDelLugar(state, heroId, ref.lugar);
  if ('motivo' in a) return a.motivo;
  const turno = turnBlocker(state, a.hero.owner);
  if (turno !== null) return turno;
  const r = resolverOpcion(a, ref);
  if ('motivo' in r) return r.motivo;
  if (soloNavega(r.opcion)) return 'esa opción no cambia nada en la partida: es de la conversación';
  return motivoDeLaOpcion(a, r.opcion);
}

/** La opción de una referencia ya comprobada (`opcionBlocker`), o lanza con lo que no vale. */
export function opcionDe(
  state: GameState,
  heroId: string,
  ref: RefDeOpcion,
): { readonly lugar: Lugar; readonly opcion: Opcion } {
  const a = anteDelLugar(state, heroId, ref.lugar);
  const r = 'motivo' in a ? a : resolverOpcion(a, ref);
  if ('motivo' in r) throw new Error(r.motivo);
  return { lugar: (a as Ante).lugar, opcion: r.opcion };
}

/** El lugar del mundo en esa casilla, si lo hay: la búsqueda por casilla. */
export function lugarEn(state: GameState, at: Point): Lugar | null {
  return state.mundo?.historia.lugares.find((l) => pointKey(l.at) === pointKey(at)) ?? null;
}
