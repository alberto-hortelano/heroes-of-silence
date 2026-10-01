/**
 * Los asaltantes de caminos: grupos neutrales que **patrullan una región sin
 * dueño** y emboscan al héroe que la pisa si se creen capaces (petición del
 * usuario, 02-10-2026: «que haya grupos autónomos como asaltantes de caminos y
 * no sea tan fácil moverse»).
 *
 * **Este módulo decide y no escribe la crónica**: dice a dónde se mueve un
 * grupo, quién embosca a quién, dónde brota uno nuevo y cuáles se dispersan.
 * Lo aplica `game.ts`, que es el único que llama a `emit` —el candado de
 * `state.log`— y el único que muta la partida.
 *
 * Un asaltante es un **actor**, como un héroe, y no un objeto del mapa como el
 * monstruo. La diferencia no es de gusto: la niebla **copia** los objetos a
 * `player.memory` y `knownObjects` decide qué es presente por la casilla
 * RECORDADA, así que un objeto que se mueve se enseñaría donde ya no está o
 * filtraría dónde está. Un actor se ve **ahora** o no se ve, igual que un héroe
 * enemigo, y no deja recuerdo.
 *
 * Las reglas, todas aquí y con su porqué:
 *
 *  - **No cruza nodos ni se pega a uno.** Patrulla casillas de su región que no
 *    tocan un nodo: así nunca tapa un paso, que es lo único que haría de un
 *    grupo un muro en vez de un peligro.
 *  - **Embosca al pisar**, no al pasar la noche: la marcha del héroe se para en
 *    la casilla de la región en la que el grupo le saca el margen
 *    (`ventajaClara`). Un héroe parado no se ataca.
 *  - **Se dispersa** cuando su región tiene dueño (`territorio`), y **brota**
 *    los lunes en regiones sin dueño y sin héroe, en una casilla libre.
 */
import { fuerzaDe, poderDe, ventajaClara } from '../ai/fuerza.js';
import { ASALTANTES, type GrupoDeTropa, problemasDeTopeDeLiderazgo } from '../data.js';
import type { Hero } from '../hero/hero.js';
import { type GameMap, inBounds } from '../map/map.js';
import {
  aPunto,
  type Estructura,
  estructura,
  juntoANodo,
  territorio,
  VECINAS,
} from '../map/regiones.js';
import type { Rng } from '../rng.js';
import type { Point } from '../types.js';
import type { GameState } from './game.js';

/**
 * Un grupo de asaltantes tal y como lo ven los demás: dónde está y qué lleva,
 * en grupos de tropa —«5 × piquero»— y no individuo a individuo. Es lo que
 * viaja al espectador y lo que pinta el lienzo: una sola forma para los dos, y
 * `GameState.raiders` la cumple tal cual.
 */
export interface VistaAsaltante {
  readonly id: string;
  readonly at: Point;
  readonly troops: readonly GrupoDeTropa[];
}

/**
 * Un grupo de asaltantes en el mapa. Su tropa se guarda en grupos y no en
 * individuos: son siete como mucho y de una o dos criaturas, y el ejército de
 * individuos solo hace falta para pelear, así que se deriva al abrir batalla
 * (`ejercitoDe`) y vuelve a grupos con lo que quede en pie.
 */
export interface Raider extends VistaAsaltante {
  at: Point;
  troops: readonly GrupoDeTropa[];
}

/** Un grupo tal como lo declara un plan de mapa: casilla y tropa. */
export interface RaiderPlaneado {
  readonly at: Point;
  readonly troops: readonly GrupoDeTropa[];
}

/**
 * Lo que impide que unos grupos de tropa sean un asaltante: individuos de un
 * bando, el techo de liderazgo y el techo de fuerza de `data/asaltantes.json`.
 * Una sola comprobación para los dos sitios donde se escribe un grupo: los
 * datos y el plan de mapa del agente (`validateMapPlan`).
 */
export function problemasDeAsaltante(grupos: readonly GrupoDeTropa[], quien: string): string[] {
  // Un grupo de cero individuos no es un grupo: ocupaba casilla, era hostil y no
  // emboscaba, y atacarlo daba una batalla de 0 rondas ganada al instante. Aquí y
  // no en `problemasDeGrupo`, porque una guarnición vacía SÍ es un estado de
  // juego —la que queda al tomar un castillo—.
  if (grupos.length === 0) {
    return [`${quien} no lleva a nadie: un grupo de asaltantes es de 1 individuo en adelante`];
  }
  const problemas = problemasDeTopeDeLiderazgo(
    grupos,
    quien,
    ASALTANTES.liderazgoMax,
    'un grupo de asaltantes',
  );
  if (problemas.length > 0) return problemas;
  const fuerza = poderDe({ troops: grupos });
  if (fuerza > ASALTANTES.fuerzaMax) {
    problemas.push(
      `${quien} suma ${fuerza} de fuerza y un grupo de asaltantes lleva como mucho ${ASALTANTES.fuerzaMax}: más fuerte que eso es un muro que ningún héroe cruza`,
    );
  }
  return problemas;
}

// El techo de fuerza se comprueba AL CARGAR, como el resto del fichero en
// `data.ts`: aquí y no allí porque medir la fuerza pide `fuerza.ts`, que importa
// el catálogo, y desde el catálogo sería un ciclo.
{
  const problemas = ASALTANTES.composiciones.flatMap((grupos, i) =>
    problemasDeAsaltante(grupos, `data/asaltantes.json: la composición ${i}`),
  );
  if (problemas.length > 0) throw new Error(problemas.join('; '));
}

// ---------------------------------------------------------------- la región

/** La región de una casilla, o −1: muro, nodo o fuera de toda región. */
export function regionDeCasilla(map: GameMap, p: Point): number {
  if (!inBounds(map, p)) return -1;
  return estructura(map).regionDe[p.y * map.width + p.x] as number;
}

/**
 * Si un grupo puede ESTAR en la casilla `i` de la región `r`: dentro de ella,
 * sin tocar un nodo, y sin nada encima en `ocupadas` —objeto, aunque esté
 * recogido: «nunca sobre un objeto» es más fácil de cumplir que de matizar;
 * héroe u otro grupo—.
 */
function casillaLibre(
  red: Estructura,
  junto: Uint8Array,
  ocupadas: Uint8Array,
  i: number,
  r: number,
): boolean {
  return red.regionDe[i] === r && junto[i] !== 1 && ocupadas[i] !== 1;
}

/**
 * Lo que ocupa casilla para un grupo, marcado con un 1 (índice `y*width+x`):
 * objetos, héroes y grupos. Se hace UNA vez por día y quien mueve los grupos
 * la tiene al día al moverlos (`game.ts`): rehacerla por grupo eran un `Set`
 * de cadenas por grupo y por día, la mitad del tiempo de la patrulla.
 */
export function mascaraDeOcupacion(state: GameState): Uint8Array {
  const W = state.map.width;
  const marca = new Uint8Array(W * state.map.height);
  for (const o of state.map.objects) marca[o.at.y * W + o.at.x] = 1;
  for (const h of state.heroes) marca[h.at.y * W + h.at.x] = 1;
  for (const r of state.raiders) marca[r.at.y * W + r.at.x] = 1;
  return marca;
}

// ---------------------------------------------------------------- la patrulla

/**
 * A dónde se mueve hoy un grupo: a una casilla libre de su región a `pasosPorDia`
 * pasos como mucho —contados andando por la región, no a vuelo de pájaro, para
 * que no salte un entrante de montaña—, o se queda donde está.
 *
 * Si en su región hay héroes y no se cree capaz con **ninguno**, se aparta: elige
 * la casilla más lejana del más cercano. Es la mitad «si no se cree capaz, lo
 * evita» del criterio 1; la otra mitad, emboscar, no es de la patrulla sino de
 * la marcha del héroe (`emboscador`), porque un héroe parado no se ataca.
 *
 * Sin héroes delante, la casilla la elige `rng` entre las posibles, quedarse
 * incluida: un grupo que patrulla no tiene a dónde ir.
 */
export function pasoDePatrulla(
  state: GameState,
  raider: Raider,
  rng: Rng,
  ocupadas: Uint8Array,
): Point {
  const map = state.map;
  const red = estructura(map);
  const W = map.width;
  const r = regionDeCasilla(map, raider.at);
  if (r < 0) {
    throw new Error(
      `el grupo ${raider.id} está en (${raider.at.x},${raider.at.y}), que no es casilla de ninguna región`,
    );
  }
  const junto = juntoANodo(map);

  // Una búsqueda en anchura acotada, por casillas de la región que no tienen
  // nada encima. En orden de `VECINAS`, que es lo que la hace determinista.
  const origen = raider.at.y * W + raider.at.x;
  const distancia = new Map<number, number>([[origen, 0]]);
  const cola = [origen];
  const candidatas: number[] = [origen];
  for (let q = 0; q < cola.length; q++) {
    const i = cola[q] as number;
    const d = distancia.get(i) as number;
    if (d >= ASALTANTES.pasosPorDia) continue;
    const p = aPunto(i, W);
    for (const [dx, dy] of VECINAS) {
      const v = { x: p.x + dx, y: p.y + dy };
      if (!inBounds(map, v)) continue;
      const j = v.y * W + v.x;
      if (distancia.has(j) || red.regionDe[j] !== r || ocupadas[j] === 1) continue;
      distancia.set(j, d + 1);
      cola.push(j);
      if (casillaLibre(red, junto, ocupadas, j, r)) candidatas.push(j);
    }
  }

  const heroes = state.heroes.filter((h) => regionDeCasilla(map, h.at) === r);
  const mia = poderDe(raider);
  const capazCon = heroes.some((h) => ventajaClara(mia, fuerzaDe(h, state.characters)));
  if (heroes.length > 0 && !capazCon) {
    const lejania = (i: number): number => {
      const p = aPunto(i, W);
      let cerca = Number.POSITIVE_INFINITY;
      for (const h of heroes) {
        cerca = Math.min(cerca, Math.max(Math.abs(h.at.x - p.x), Math.abs(h.at.y - p.y)));
      }
      return cerca;
    };
    // El primero con la lejanía máxima, en el orden de la búsqueda: el empate
    // lo rompe ese orden y no el azar, así que apartarse no gasta tirada.
    let mejor = candidatas[0] as number;
    for (const i of candidatas) if (lejania(i) > lejania(mejor)) mejor = i;
    return aPunto(mejor, W);
  }
  return aPunto(rng.pick(candidatas), W);
}

// ---------------------------------------------------------------- la emboscada

/**
 * El grupo que embosca a `hero` en la casilla en la que acaba de entrar, o
 * `null`. Embosca el primero de su región, en el orden de `state.raiders`, que
 * le saque el margen (`ventajaClara`): la misma regla con la que la IA decide
 * si ataca a un monstruo, vista desde el otro lado.
 *
 * No mira si la región tiene dueño: un grupo cuya región lo tiene ya se ha
 * dispersado (`dispersados`), y lo vigila un test sobre partidas jugadas.
 */
export function emboscador(state: GameState, hero: Hero): Raider | null {
  if (state.raiders.length === 0) return null;
  const r = regionDeCasilla(state.map, hero.at);
  if (r < 0) return null;
  let suya: number | undefined;
  for (const raider of state.raiders) {
    if (regionDeCasilla(state.map, raider.at) !== r) continue;
    suya ??= fuerzaDe(hero, state.characters);
    if (ventajaClara(poderDe(raider), suya)) return raider;
  }
  return null;
}

/**
 * Dónde emboscarían a `hero` si anduviera `ruta`, contando SOLO con los grupos
 * que su dueño está mirando (`mirando`, que es `visibleNow`; `null` es «todo»,
 * la convención del cliente para «Ver mapa entero»): el índice del
 * primer paso que pisa la región de un grupo que le saca el margen, y quién es;
 * o `null`.
 *
 * Es `emboscador` paso a paso —la misma regla, el mismo orden de
 * `state.raiders`— con una restricción que no se puede quitar: un grupo que no
 * se ve **no avisa**. Avisar de él sería decirle a la persona lo que la niebla le
 * tapa, que es la fuga que el agente no tiene. Lo pide la pantalla para marcar
 * la ruta (H2 del ciclo «el camino cuesta»): antes, la barra decía «llegas hoy
 * (3 pasos)» sobre una casilla de emboscada y la explicación solo salía con el
 * ratón encima del propio grupo.
 */
export function emboscadaEnLaRuta(
  state: GameState,
  hero: Hero,
  ruta: readonly { readonly at: Point }[],
  mirando: ReadonlySet<string> | null,
): { readonly paso: number; readonly raider: Raider } | null {
  const vistos =
    mirando === null
      ? state.raiders
      : state.raiders.filter((r) => mirando.has(`${r.at.x},${r.at.y}`));
  if (vistos.length === 0) return null;
  const suya = fuerzaDe(hero, state.characters);
  const peligrosos = vistos.filter((r) => ventajaClara(poderDe(r), suya));
  if (peligrosos.length === 0) return null;
  for (let i = 0; i < ruta.length; i++) {
    const region = regionDeCasilla(state.map, (ruta[i] as { at: Point }).at);
    if (region < 0) continue;
    const raider = peligrosos.find((r) => regionDeCasilla(state.map, r.at) === region);
    if (raider !== undefined) return { paso: i, raider };
  }
  return null;
}

/**
 * Las casillas de las regiones donde a `hero` lo emboscarían, marcadas con un 1
 * (índice `y*width+x`): lo que la IA no pisa (`alcanceDelHeroe` las trata como
 * muro, porque la primera casilla ya es la emboscada). `null` si no hay ningún
 * grupo que le saque el margen. Una marca y no una lista de puntos: una región
 * son decenas de casillas y la IA lo pregunta por cada héroe y cada turno.
 *
 * La región en la que ya está el héroe **también** se marca: si se ha vuelto
 * peligrosa —ganó una batalla dentro y salió mermado—, cada paso dentro de ella
 * es la emboscada. Lo que le deja salir es que el Dijkstra respeta el origen:
 * desde donde está puede pisar el nodo de al lado y marcharse. Medido sin esta
 * regla (dejándole andar por la suya), eran 23 de las 33 emboscadas de 200
 * partidas, y 31 de las 33 las ganaba el grupo; con ella, 0, y 0 de 1 000
 * partidas sin terminar.
 */
export function casillasPeligrosas(state: GameState, hero: Hero): Uint8Array | null {
  if (state.raiders.length === 0) return null;
  const suya = fuerzaDe(hero, state.characters);
  const regiones = new Set<number>();
  for (const raider of state.raiders) {
    if (ventajaClara(poderDe(raider), suya)) regiones.add(regionDeCasilla(state.map, raider.at));
  }
  regiones.delete(-1);
  if (regiones.size === 0) return null;
  const { regionDe } = estructura(state.map);
  const marca = new Uint8Array(regionDe.length);
  for (let i = 0; i < regionDe.length; i++) {
    if (regiones.has(regionDe[i] as number)) marca[i] = 1;
  }
  return marca;
}

// ---------------------------------------------------------------- dispersar y brotar

/** Los grupos cuya región tiene dueño: los que se dispersan, y quién la cerró. */
export function dispersados(state: GameState): { raider: Raider; dueño: number }[] {
  if (state.raiders.length === 0) return [];
  const t = territorio(state);
  const out: { raider: Raider; dueño: number }[] = [];
  for (const raider of state.raiders) {
    const r = regionDeCasilla(state.map, raider.at);
    const dueño = r < 0 ? null : (t.dueñoDeRegion[r] ?? null);
    if (dueño !== null) out.push({ raider, dueño });
  }
  return out;
}

/**
 * Dónde brota un grupo nuevo este lunes, región a región y en su orden: en cada
 * una sin dueño, **sin héroe** —no aparecen encima de nadie, ni en la región
 * donde alguien está— y sin otro grupo, con probabilidad `probabilidadSemanal`,
 * en una casilla libre al azar y con una composición al azar.
 *
 * Incluye la región de casa y las que tocan una base: el usuario corrigió ahí
 * el plan («No, también en casa»). Lo que protege al héroe recién salido es la
 * regla del héroe, no una excepción por región.
 *
 * Una tirada por región candidata y dos más por grupo que brota, siempre en el
 * mismo orden: la partida sigue siendo la misma con la misma semilla.
 */
export function dondeBrotan(state: GameState, rng: Rng): RaiderPlaneado[] {
  const map = state.map;
  const red = estructura(map);
  if (red.regiones.length === 0) return [];
  const t = territorio(state);
  const junto = juntoANodo(map);
  const ocupadas = mascaraDeOcupacion(state);
  const conAlguien = new Set<number>();
  for (const h of state.heroes) conAlguien.add(regionDeCasilla(map, h.at));
  for (const r of state.raiders) conAlguien.add(regionDeCasilla(map, r.at));

  // Las casillas libres de cada región, en una sola pasada por el mapa. Lo que
  // brota en una región no le quita sitio a otra, y en la suya ya no brota
  // nada más esta semana: no hace falta descontarlo.
  const libres: number[][] = red.regiones.map(() => []);
  for (let i = 0; i < red.regionDe.length; i++) {
    const r = red.regionDe[i] as number;
    if (r >= 0 && casillaLibre(red, junto, ocupadas, i, r)) libres[r]?.push(i);
  }

  const out: RaiderPlaneado[] = [];
  for (let r = 0; r < red.regiones.length; r++) {
    if (t.dueñoDeRegion[r] !== null || conAlguien.has(r)) continue;
    if (!rng.chance(ASALTANTES.probabilidadSemanal)) continue;
    const suyas = libres[r] ?? [];
    if (suyas.length === 0) continue;
    const at = aPunto(rng.pick(suyas), map.width);
    out.push({ at, troops: rng.pick(ASALTANTES.composiciones) });
  }
  return out;
}

/** Si la casilla toca un nodo: un grupo ahí taparía un paso. */
export function tocaUnNodo(map: GameMap, p: Point): boolean {
  if (!inBounds(map, p)) return false;
  return juntoANodo(map)[p.y * map.width + p.x] === 1;
}
