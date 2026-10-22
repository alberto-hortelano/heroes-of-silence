/**
 * Las reglas de los lugares en la partida: si una condición se cumple, si una
 * opción se puede elegir y por qué no. **La única lectura** de las condiciones:
 * la leen la acción del núcleo (`elegir_en_lugar`, que lanza con el motivo), la
 * pantalla del lugar (que apaga la opción y pone el motivo debajo) y la IA de
 * reglas (`ai/lugares.ts`, que elige la primera que vale).
 *
 * Aplicar los efectos no vive aquí: escribe la crónica, y el único que escribe
 * en ella es `emit`, privado de `game.ts`. Este módulo solo pregunta, y por eso
 * importa el estado como tipo y no a `game.ts`: no hay ciclo.
 */
import { idsPuestos, piezaSiExiste } from '../hero/equipo.js';
import type { Hero } from '../hero/hero.js';
import { CUPO_HEROE, heroLeadership, troopBlocker, withTroops } from '../hero/troop.js';
import { pointKey } from '../map/map.js';
import type { GameState } from '../state/game.js';
import { oroBlocker } from '../town/town.js';
import { conMiles, describirCoste } from '../types.js';
import {
  type Condicion,
  type Dialogo,
  type EstadoDelMundo,
  type Lugar,
  lugarDe,
  type NodoDeDialogo,
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

function oroDe(state: GameState, hero: Hero): number {
  return state.players.find((p) => p.id === hero.owner)?.oro ?? 0;
}

/** Lo que lleva el héroe: puesto, en su tropa y en la mochila. */
function loQueLleva(hero: Hero): ReadonlySet<string> {
  return new Set([
    ...hero.mochila,
    ...idsPuestos(hero.equipo),
    ...hero.army.flatMap((t) => idsPuestos(t.veterania?.equipo)),
  ]);
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
    return loQueLleva(a.hero).has(c.lleva)
      ? null
      : `${a.hero.name} no lleva ${nombreDePieza(c.lleva)}`;
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
  let mochila = [...a.hero.mochila];
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
  if (mundo === undefined) return { motivo: 'esta partida no es de un mundo: no tiene lugares' };
  const hero = state.heroes.find((h) => h.id === heroId);
  if (hero === undefined) return { motivo: `no existe ningún héroe "${heroId}"` };
  const lugar = mundo.historia.lugares.find((l) => l.id === lugarId);
  if (lugar === undefined) return { motivo: `no hay ningún lugar "${lugarId}"` };
  if (pointKey(hero.at) !== pointKey(lugar.at)) {
    return { motivo: `${hero.name} no está en «${lugar.nombre}»` };
  }
  return { state, mundo, hero, lugar };
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
    hace: (o.hace ?? []).length > 0,
    pelea: (o.hace ?? []).some((e) => 'batalla' in e),
    ir: o.ir ?? null,
  }));
}

/**
 * Por qué no se puede elegir esa opción ahora, o `null`. Lo que mira, en el orden
 * en que se entiende: la partida (que siga, que no haya batalla, tu turno), el
 * héroe en el lugar, el punto que está, la opción que existe y hace algo, y lo de
 * `motivoDeLaOpcion`. La lee la acción, que lanza con él.
 *
 * El camino por el árbol hasta el nodo no se comprueba: navegar es del cliente, y
 * lo que protege los premios es que cada opción que da se apague a sí misma (la
 * regla de la validación, `noSeApaga`).
 */
export function opcionBlocker(state: GameState, heroId: string, ref: RefDeOpcion): string | null {
  if (state.finished !== null) return 'la partida ya ha terminado';
  if (state.pendingBattle !== null) return 'hay una batalla pendiente de resolver';
  const a = anteDelLugar(state, heroId, ref.lugar);
  if ('motivo' in a) return a.motivo;
  if (a.hero.owner !== state.current) return 'todavía no es tu turno';
  const punto = a.lugar.puntos.find((p) => p.id === ref.punto);
  if (punto === undefined) return `en «${a.lugar.nombre}» no hay ningún punto "${ref.punto}"`;
  const fuera = condicionesBlocker(a, punto.si);
  if (fuera !== null) return fuera;
  const nodo = dialogoDe(a, punto).nodos[ref.nodo];
  if (nodo === undefined) return `esa conversación no tiene ningún nodo "${ref.nodo}"`;
  const opcion = nodo.opciones[ref.opcion];
  if (opcion === undefined) return `ese nodo no tiene la opción ${ref.opcion}`;
  if ((opcion.hace ?? []).length === 0) {
    return 'esa opción no cambia nada en la partida: es de la conversación';
  }
  return motivoDeLaOpcion(a, opcion);
}

/** La opción de una referencia ya comprobada (`opcionBlocker`). */
export function opcionDe(state: GameState, ref: RefDeOpcion): { lugar: Lugar; opcion: Opcion } {
  const mundo = state.mundo;
  if (mundo === undefined) throw new Error('esta partida no es de un mundo');
  const lugar = lugarDe(mundo.historia, ref.lugar);
  const punto = lugar.puntos.find((p) => p.id === ref.punto);
  const opcion =
    punto === undefined
      ? undefined
      : lugar.dialogos[punto.dialogo]?.nodos[ref.nodo]?.opciones[ref.opcion];
  if (opcion === undefined) throw new Error(`no hay opción en ${JSON.stringify(ref)}`);
  return { lugar, opcion };
}

/** El lugar del mundo en esa casilla, si lo hay. */
export function lugarEn(state: GameState, at: { x: number; y: number }): Lugar | null {
  return state.mundo?.historia.lugares.find((l) => pointKey(l.at) === pointKey(at)) ?? null;
}
