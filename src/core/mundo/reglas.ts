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

import { unidadDelJuego } from '../catalogo.js';
import { cupoDelHeroe } from '../combate.js';
import { idsPuestos, piezaSiExiste } from '../hero/equipo.js';
import type { Hero } from '../hero/hero.js';
import { heroLeadership, troopBlocker, withTroops } from '../hero/troop.js';
import { pointKey } from '../map/map.js';
import { type GameState, playerById, turnBlocker } from '../state/game.js';
import { oroBlocker } from '../town/town.js';
import { conMiles, describirCoste, NOMBRE_DE_FACCION, type Point } from '../types.js';
import {
  batallaDe,
  type Cobro,
  type Condicion,
  claveDeConversacion,
  claveDeEncuentro,
  claveDeOpcion,
  type Dialogo,
  daPremio,
  type EstadoDelMundo,
  efectosDe,
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
 * Si el premio de una opción ya se cobró, lo que se dice y si fue quien juega; si
 * no, `null`. **La regla de que cada premio se cobre una vez** (P-c del usuario),
 * del núcleo: el encuentro ganado (`vencidos`) y la opción con premio ya cobrada
 * (`cobradas`). El mundo es de los dos (M2 de la vuelta 2): lo que se llevó el otro
 * se dice con su nombre y su facción, no con «te».
 */
function yaCobrado(
  a: Ante,
  ref: RefDeOpcion,
  opcion: Opcion,
): { readonly frase: string; readonly mio: boolean } | null {
  const batalla = batallaDe(opcion);
  if (batalla !== null) {
    const quien = a.mundo.vencidos[claveDeEncuentro(a.lugar.id, batalla)];
    if (quien !== undefined) {
      const nombre = `«${a.lugar.encuentros[batalla]?.nombre ?? batalla}»`;
      return esMio(a, quien)
        ? { frase: `ya venciste a ${nombre}`, mio: true }
        : { frase: `${otro(a, quien)} ya venció a ${nombre}`, mio: false };
    }
  }
  const quien = daPremio(opcion) ? a.mundo.cobradas[claveDeOpcion(ref)] : undefined;
  if (quien === undefined) return null;
  const mio = esMio(a, quien);
  const pieza = efectosDe(opcion.hace, 'pieza')[0];
  const tropa = efectosDe(opcion.hace, 'tropa')[0];
  const oro = efectosDe(opcion.hace, 'oro').reduce((n, e) => n + Math.max(0, e.oro), 0);
  const que = pieza !== undefined ? nombreDePieza(pieza.pieza) : `${describirCoste(oro)} de aquí`;
  if (tropa !== undefined && pieza === undefined) {
    const unidos = `${tropa.tropa.n} × ${unidadDelJuego(tropa.tropa.unidad).name}`;
    return mio
      ? { frase: `ya se te unieron ${unidos}`, mio }
      : { frase: `ya se le unieron a ${otro(a, quien)} ${unidos}`, mio };
  }
  return mio
    ? { frase: `ya te llevaste ${que}`, mio }
    : { frase: `${otro(a, quien)} ya se llevó ${que}`, mio };
}

/** Si lo cobró el dueño del héroe que pregunta. */
function esMio(a: Ante, quien: Cobro): boolean {
  return quien.jugador === a.hero.owner;
}

/** Quien cobró, si no fue quien pregunta: su héroe y su facción («Grishnak (Orkos)»). */
function otro(a: Ante, quien: Cobro): string {
  return `${quien.heroe} (${NOMBRE_DE_FACCION[playerById(a.state, quien.jugador).faction]})`;
}

/**
 * Por qué no se puede elegir ahora la opción de `ref` (que hace algo), o `null`. Lo
 * que mira, en el orden en que se entiende: que su punto esté, que a su nodo se
 * llegue ahora (`nodosAlcanzables`), que no se lo haya llevado otro jugador, sus
 * condiciones escritas, que su premio no se haya cobrado ya (`yaCobrado`) y lo que
 * piden sus efectos —pagar sin oro, entregar lo que no está en la mochila, tropa
 * que no cabe—. Lo del otro va antes que lo escrito: la frase del motor habla de
 * «tú» («ya te llevaste la lanza») y fue el rival. **La única pregunta**: la leen
 * la acción (`opcionBlocker`), la pantalla (`opcionesDe`, que la escribe debajo de
 * la opción apagada) y la IA, así que no hay opción encendida que el núcleo
 * rechace (H2 del QA de la F1a).
 */
function motivoAlElegir(a: Ante, punto: Punto, ref: RefDeOpcion, opcion: Opcion): string | null {
  const fuera = condicionesBlocker(a, punto.si);
  if (fuera !== null) return fuera;
  if (!nodosAlcanzables(a, punto).includes(ref.nodo)) {
    return `a esa parte de la conversación con ${nombreDelPunto(punto)} no se llega ahora: lo que lleva hasta ella no se cumple`;
  }
  const cobrado = yaCobrado(a, ref, opcion);
  if (cobrado !== null && !cobrado.mio) return cobrado.frase;
  const escrita = condicionesBlocker(a, opcion.si);
  if (escrita !== null) return escrita;
  if (cobrado !== null) return cobrado.frase;
  return loQuePidenSusEfectos(a, opcion);
}

/** Lo que piden los efectos de `opcion` y no hay, o `null`: el oro, la pieza que se entrega, sitio en la tropa. */
function loQuePidenSusEfectos(a: Ante, opcion: Opcion): string | null {
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
        cupoDelHeroe(a.state.combate.tope),
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
 * Los nodos a los que se llega desde `inicios` por las salidas que da `salidas`,
 * en el orden en que se descubren (en anchura, cada nodo con sus salidas en su
 * orden). **El único recorrido** de un diálogo: lo leen los nodos alcanzables
 * ahora (`nodosAlcanzables`) y la validación, sin condiciones (`validar.ts`).
 */
export function recorrido(
  inicios: readonly string[],
  salidas: (nodo: string) => readonly string[],
): readonly string[] {
  const vistos: string[] = [];
  for (const i of inicios) if (!vistos.includes(i)) vistos.push(i);
  for (let i = 0; i < vistos.length; i++) {
    for (const sig of salidas(vistos[i] as string)) if (!vistos.includes(sig)) vistos.push(sig);
  }
  return vistos;
}

/**
 * Los nodos del diálogo de `punto` a los que se llega **ahora** desde su inicio y
 * desde donde quedó la conversación de quien juega (`EstadoDelMundo.conversaciones`:
 * el nodo al que llevó la última opción con efectos que eligió en él), por las
 * opciones que solo navegan y cuyo `si` se cumple, en el orden en que se descubren.
 * Es lo que se puede elegir: una opción con efectos de otro nodo la rechaza
 * `opcionBlocker`, que si no se cobraría un premio detrás de una condición sin
 * cumplirla con solo nombrar su nodo (H1 del simplify de la F1a). Las opciones con
 * efectos no son aristas (contarlas dejaría saltarse un pago): a lo que hay tras
 * una se llega porque se eligió, y su nodo es el que se recuerda.
 */
export function nodosAlcanzables(a: Ante, punto: Punto): readonly string[] {
  const d = dialogoDe(a, punto);
  const quedo = dondeQuedo(a, punto);
  return recorrido(quedo === undefined ? [d.inicio] : [d.inicio, quedo], (n) =>
    (d.nodos[n]?.opciones ?? []).flatMap((o) =>
      o.ir !== undefined && soloNavega(o) && condicionesBlocker(a, o.si) === null ? [o.ir] : [],
    ),
  );
}

/** El nodo en que quedó la conversación de quien juega con `punto`, si quedó en alguno. */
function dondeQuedo(a: Ante, punto: Punto): string | undefined {
  return a.mundo.conversaciones[claveDeConversacion(a.hero.owner, a.lugar.id, punto.id)];
}

/**
 * Por dónde se abre la conversación con `punto` al hablarle: **donde quedó** la de
 * quien juega, si quedó en algún nodo al que se llega ahora; si no, su inicio
 * (decisión del usuario tras la vuelta 2 de QA de la F1a, H14: quien paga el peaje,
 * se va y vuelve, sigue ante el arcón). La lee la pantalla del lugar, que ofrece
 * además «Volver al principio».
 */
export function nodoDeEntrada(a: Ante, punto: Punto): string {
  const quedo = dondeQuedo(a, punto);
  return quedo !== undefined && nodosAlcanzables(a, punto).includes(quedo)
    ? quedo
    : inicioDe(a, punto);
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

/**
 * Por qué no se puede elegir ahora la opción `indice` del nodo `nodo` de `punto`, o
 * `null`: la que hace algo, con la pregunta de la acción (`motivoAlElegir`); la que
 * solo navega, con su `si`. Lo que se escribe debajo de una opción apagada y lo
 * que mira la IA.
 */
export function motivoDeLaOpcion(
  a: Ante,
  punto: Punto,
  nodo: string,
  indice: number,
): string | null {
  const o = nodoDe(a, punto, nodo).opciones[indice];
  if (o === undefined) throw new Error(`el nodo ${nodo} no tiene la opción ${indice}`);
  if (soloNavega(o)) return condicionesBlocker(a, o.si);
  return motivoAlElegir(a, punto, { lugar: a.lugar.id, punto: punto.id, nodo, opcion: indice }, o);
}

/** Las opciones de un nodo con su motivo (`motivoDeLaOpcion`). */
export function opcionesDe(a: Ante, punto: Punto, nodo: string): readonly OpcionALaVista[] {
  return nodoDe(a, punto, nodo).opciones.map((o, indice) => ({
    indice,
    texto: o.texto,
    motivo: motivoDeLaOpcion(a, punto, nodo, indice),
    hace: !soloNavega(o),
    pelea: (o.hace ?? []).some((e) => 'batalla' in e),
    ir: o.ir ?? null,
  }));
}

/**
 * La opción de una referencia, desde el héroe en su lugar (`a`), o por qué no: el
 * punto, el nodo de su diálogo y la opción, que existan. **La única resolución**
 * de una referencia: la leen la pregunta (`opcionBlocker`) y la acción
 * (`opcionDe`). Si se puede elegir lo dice `motivoAlElegir`.
 */
export function resolverOpcion(
  a: Ante,
  ref: RefDeOpcion,
): { readonly punto: Punto; readonly opcion: Opcion } | { readonly motivo: string } {
  const punto = a.lugar.puntos.find((p) => p.id === ref.punto);
  if (punto === undefined) {
    return { motivo: `en «${a.lugar.nombre}» no hay ningún punto "${ref.punto}"` };
  }
  const nodo = dialogoDe(a, punto).nodos[ref.nodo];
  if (nodo === undefined) return { motivo: `esa conversación no tiene ningún nodo "${ref.nodo}"` };
  const opcion = nodo.opciones[ref.opcion];
  if (opcion === undefined) return { motivo: `ese nodo no tiene la opción ${ref.opcion}` };
  return { punto, opcion };
}

/**
 * Por qué no se puede elegir esa opción ahora, o `null`. Lo que mira, en el orden
 * en que se entiende: el héroe en el lugar, el turno de su dueño (`turnBlocker`:
 * también que la partida siga), la referencia (`resolverOpcion`), que haga algo y
 * lo de `motivoAlElegir`. La batalla pendiente la rechaza la puerta de toda acción
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
  return motivoAlElegir(a, r.punto, ref, r.opcion);
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
