/**
 * Lo que sabe y lo que mira cada jugador: la niebla y la memoria de la partida.
 *
 * Lo explorado se descubre por regiones enteras (`descubrir`, con
 * `core/map/niebla.ts`) y lo que se mira AHORA es el radio de los héroes, castillos
 * y nodos propios sobre lo explorado (`visibleNow`, `visibleNowAt`, `miradasDe`). De
 * cada objeto se sabe el recuerdo de la última vez que se miró (`recuerdoDe`,
 * `objetosConocidos`), y de un héroe ajeno, si se le mira ahora (`heroesALaVista`).
 * **Los únicos escritores de `fog`** son `descubrir` y `revealEverything` (lo
 * vigila `invariantes-partida.test.ts`).
 *
 * No escribe la crónica: la crónica se sella con lo que se mira aquí (`emit`, en
 * `cronica.ts`). Vivía en `game.ts` hasta la fase N de la reorganización
 * (07-11-2026), que lo repartió por lo que hace.
 */
import { radioALaEscala } from '../escala.js';
import { Casillas, type CasillasLeidas, casillasDelCuadrado } from '../map/casillas.js';
import { inBounds, type Mirada } from '../map/map.js';
import {
  objetosDeLaZona,
  regionDescubierta,
  regionesQueDescubre,
  zonaDeNiebla,
} from '../map/niebla.js';
import type { MapObject } from '../map/tipos.js';
import type { Town } from '../town/town.js';
import type { Hero, PlayerId, Point } from '../types.js';
import { recordarAsaltantes } from './asaltantes.js';
import { heroesOf, playerById, townsOf } from './consultas.js';
import { comoEstaElSitio, dueñoDeLaCiudad, sitioDelObjeto } from './sitios.js';
import type { GameState, Player, RememberedObject } from './tipos.js';

/**
 * El objeto `obj` como se ve hoy: una copia (la memoria no puede cambiar con el
 * mapa) y, de una ciudad o un pueblo, su dueño y su ocupante de ahora. La única
 * forma de apuntar un recuerdo: la leen `explorar`, `revealEverything` y lo que se
 * mira vivo (`objetosConocidos`).
 */
function recuerdoDe(state: GameState, obj: MapObject): RememberedObject {
  const recuerdo = { day: state.day, object: { ...obj } };
  if (obj.kind !== 'town' && obj.kind !== 'village') return recuerdo;
  return { ...recuerdo, sitio: comoEstaElSitio(state, sitioDelObjeto(state, obj)) };
}

/**
 * Radio de lo que un héroe mira AHORA: el 4 de fheroes2 a la escala del mapa
 * (`radioALaEscala`, #229: 5 en el 42×42).
 *
 * **Ya no explora** (regla nuestra, 02-11-2026, petición del usuario: «Añada una
 * niebla de eventos en torno a héroes y nodos controlados por el jugador. Lo que
 * pase cerca en un radio x se ve. Si no, no»): lo explorado se descubre por
 * regiones al pisarlas (`descubrir`, `core/map/niebla.ts`) y este radio es solo lo
 * que se ve pasar —héroes rivales, el estado vivo de los objetos, los grupos de
 * asaltantes y la crónica—, y solo sobre lo ya explorado (`visibleNow`). Es el
 * cuadrado y no el disco del original: 121 casillas.
 */
export const HERO_SCOUT_RADIUS = radioALaEscala(4);

/**
 * Radio de lo que un castillo **o un nodo propio** mira AHORA (regla nuestra,
 * 02-11-2026: el usuario quiere la niebla de eventos «en torno a héroes y nodos
 * controlados por el jugador», 5 para el héroe y 6 para castillos y nodos).
 *
 * El número es el 5 del castillo de fheroes2 (`GameStatic::getFogDiscoveryDistance`,
 * `CASTLE: 5`, sin ramificar por el fuerte) a la escala del mapa (#229: 6 en el
 * 42×42). Lo llevaba solo el castillo (#72: un héroe enemigo acampado pegado a tu
 * capital no producía un solo `hero_moved` que te llegara, 0 de 60 escenarios; con
 * este radio, 60 de 60); desde la niebla por regiones lo lleva también cada nodo
 * tuyo, que es donde se ve llegar al rival a tu territorio. Como el del héroe, no
 * explora: mira lo explorado (`visibleNow`).
 */
export const NODE_SCOUT_RADIUS = radioALaEscala(5);

/**
 * El héroe mira alrededor: descubre la región que pisa Y apunta lo que ve.
 *
 * Las dos cosas van juntas a propósito. Separarlas es exactamente el bug que
 * había: la casilla quedaba explorada para siempre y el objeto se leía del
 * estado vivo, así que el agente se enteraba de una captura ocurrida a veinte
 * casillas de su héroe más cercano.
 */
export function revealAround(state: GameState, hero: Hero): void {
  const player = state.players.find((p) => p.id === hero.owner);
  if (player === undefined) return;
  descubrir(state, player, hero.at);
  mirarDesde(state, player, hero.at, HERO_SCOUT_RADIUS);
}

/**
 * El castillo mira alrededor, igual que un héroe: descubre sus regiones Y apunta.
 *
 * Se llama donde un castillo puede empezar a mirar o mirar algo nuevo: al crear
 * la partida (para TODOS los jugadores, porque solo el primero pasa por
 * `startTurn`: así cada uno empieza con las regiones de su base descubiertas), al
 * empezar el turno de su dueño y al capturarlo.
 */
export function revealAroundTown(state: GameState, town: Town): void {
  const dueño = dueñoDeLaCiudad(state, town);
  if (dueño === null) return;
  const player = playerById(state, dueño);
  descubrir(state, player, town.at);
  mirarDesde(state, player, town.at, NODE_SCOUT_RADIUS);
}

/**
 * Un nodo propio mira alrededor, como un castillo (02-11-2026: la niebla de
 * eventos va «en torno a héroes y nodos controlados por el jugador»). Al empezar
 * el turno de su dueño y al tomarlo, antes de contarlo: quien lo toma ya está
 * mirando desde él.
 */
export function revealAroundNode(
  state: GameState,
  nodo: Extract<MapObject, { kind: 'node' }>,
): void {
  if (nodo.owner === null) return;
  const player = playerById(state, nodo.owner);
  descubrir(state, player, nodo.at);
  mirarDesde(state, player, nodo.at, NODE_SCOUT_RADIUS);
}

/**
 * Descubre lo que se ve al llegar a `sitio`: **las regiones enteras** que ese
 * sitio pisa (`regionesQueDescubre`: la suya, o todas las que une un nodo, una
 * ciudad o el puente de una ciudad-puente), con su zona (`zonaDeNiebla`), y apunta
 * en `memory` cada objeto de ellas como está ahora: entrar en una región es verla
 * entera (petición del usuario, 02-11-2026). Una región ya descubierta no se toca:
 * si se volviera a apuntar, el recuerdo de sus objetos se refrescaría desde lejos.
 *
 * **El único escritor de `fog`** con `revealEverything` (lo vigila
 * `invariantes.test.ts`). Un mapa sin regiones (los de los tests de pathfinding)
 * no tiene por dónde partirse: es una sola zona, y se descubre entero.
 */
function descubrir(state: GameState, player: Player, sitio: Point): void {
  const { map } = state;
  if (map.regions.length === 0) {
    if (player.fog.size === map.width * map.height) return;
    player.fog.marcarCuadrado({ x: 0, y: 0 }, Math.max(map.width, map.height));
    for (const obj of map.objects) {
      player.memory.set(obj.id, recuerdoDe(state, obj));
    }
    return;
  }
  for (const k of regionesQueDescubre(map, sitio)) {
    if (regionDescubierta(map, player.fog, k)) continue;
    player.fog.marcarIndices(zonaDeNiebla(map, k));
    for (const obj of objetosDeLaZona(map, k)) {
      player.memory.set(obj.id, recuerdoDe(state, obj));
    }
  }
}

/**
 * Lo que se mira AHORA desde `centro`: el cuadrado de `radio` sobre lo ya
 * explorado. Refresca el recuerdo de los objetos que caen ahí y el de los grupos
 * de asaltantes (`recordarAsaltantes`). No explora: eso es `descubrir`.
 */
function mirarDesde(state: GameState, player: Player, centro: Point, radio: number): void {
  // El cuadrado se pregunta con dos restas y no con el `Set` de sus claves: era
  // el 10 % del banco (#95) levantar 81 cadenas por paso para mirar en ellas
  // la casilla de cada objeto del mapa. El orden de `memory` sigue siendo el de
  // `state.map.objects`.
  for (const obj of state.map.objects) {
    if (
      Math.abs(obj.at.x - centro.x) <= radio &&
      Math.abs(obj.at.y - centro.y) <= radio &&
      player.fog.has(obj.at)
    ) {
      player.memory.set(obj.id, recuerdoDe(state, obj));
    }
  }
  const mirando = casillasDelCuadrado(state.map, centro, radio).filter((q) => player.fog.has(q));
  recordarAsaltantes(state, player.asaltantesVistos, mirando);
}

/**
 * Le descubre el mapa entero a un jugador: explorado Y observado.
 *
 * Existe para los tests y para mirar una partida por dentro. Desde que la
 * niebla recuerda, llenar `fog` a mano ya NO basta —lo que se sabe de cada
 * objeto vive en `memory`—, y quien solo llenara `fog` vería un mapa entero y
 * vacío. Que esa trampa esté escrita una vez y no copiada en cada test es justo
 * lo que evita que la próxima copia se quede a medias.
 */
export function revealEverything(state: GameState, playerId: PlayerId): void {
  const player = playerById(state, playerId);
  player.fog.marcarCuadrado({ x: 0, y: 0 }, Math.max(state.map.width, state.map.height));
  for (const obj of state.map.objects) {
    player.memory.set(obj.id, recuerdoDe(state, obj));
  }
  recordarAsaltantes(state, player.asaltantesVistos, player.fog);
}

/**
 * Las casillas que un jugador está viendo AHORA MISMO: el radio de cada uno de
 * sus héroes, castillos y nodos (`miradasDe`), **solo sobre lo explorado**
 * (02-11-2026, decisión del usuario: nada se ve sobre el negro; un héroe rival
 * tras una cordillera de una región sin pisar no se ve aunque esté a tres
 * casillas).
 *
 * Es la otra mitad de `fog`. `fog` dice «esto lo conozco»; esto dice «esto lo
 * estoy mirando», y solo de lo que se mira se puede afirmar el presente.
 */
export function visibleNow(state: GameState, playerId: PlayerId): Casillas {
  const casillas = Casillas.vacias(state.map);
  const { fog } = playerById(state, playerId);
  for (const { centro, radio } of miradasDe(state, playerId))
    casillas.marcarCuadradoDentroDe(centro, radio, fog);
  return casillas;
}

/**
 * Desde dónde mira AHORA un jugador: cada héroe (`HERO_SCOUT_RADIUS`) y cada
 * castillo y nodo suyo (`NODE_SCOUT_RADIUS`). Es `visibleNow` sin el recorte de lo
 * explorado y sin levantar las claves.
 */
export function miradasDe(state: GameState, playerId: PlayerId): Mirada[] {
  const out: Mirada[] = [];
  for (const hero of heroesOf(state, playerId))
    out.push({ centro: hero.at, radio: HERO_SCOUT_RADIUS });
  for (const town of townsOf(state, playerId))
    out.push({ centro: town.at, radio: NODE_SCOUT_RADIUS });
  for (const obj of state.map.objects) {
    if (obj.kind === 'node' && obj.owner === playerId)
      out.push({ centro: obj.at, radio: NODE_SCOUT_RADIUS });
  }
  return out;
}

/**
 * Los héroes que ve un jugador: los suyos y los que está mirando AHORA
 * (`mirando`, que es `visibleNow`; `null` es «todos», la convención del cliente
 * para «Ver mapa entero»).
 *
 * **La única regla de qué héroe se ve**: la leen el `enemyHeroes` del agente y
 * el lienzo, el minimapa y la barra de quien juega (`Session.heroesALaVista`).
 * Un héroe se ve o no se ve, y no deja recuerdo: una posición de anteayer es
 * ruido y no intel. El lienzo pintaba con `fog` —bastaba haber pisado la casilla
 * alguna vez— y enseñaba al rival andando por medio mapa sin nadie cerca (#64).
 */
export function heroesALaVista(
  state: GameState,
  playerId: PlayerId,
  mirando: CasillasLeidas | null,
): Hero[] {
  if (mirando === null) return [...state.heroes];
  return state.heroes.filter((h) => h.owner === playerId || mirando.has(h.at));
}

/**
 * Lo que un jugador sabe de cada objeto del mapa: el objeto VIVO si está
 * mirando su casilla ahora, y si no, el RECUERDO de `memory` con el día en que
 * se vio. Solo trae lo explorado: `memory` se llena al descubrir una región
 * (`descubrir`) y al mirar desde cerca (`mirarDesde`).
 *
 * **La única regla de qué estado de un objeto se enseña**: la leen `knownObjects`
 * del agente —que pone el día como `lastSeen`— y el lienzo, el minimapa y la
 * barra de quien juega (`Session.objetosConocidos`). Así la bandera de un
 * castillo o de un nodo es la del último dueño visto, y el cofre que se llevó el
 * rival lejos sigue ahí hasta que se vuelva a mirar (#64). `mirando` a `null`
 * es «todo», vivo y de hoy.
 */
export function objetosConocidos(
  state: GameState,
  playerId: PlayerId,
  mirando: CasillasLeidas | null,
): RememberedObject[] {
  if (mirando === null) return state.map.objects.map((object) => recuerdoDe(state, object));
  const vivos = new Map(state.map.objects.map((o) => [o.id, o]));
  return [...playerById(state, playerId).memory.values()].map((recuerdo) => {
    if (!mirando.has(recuerdo.object.at)) return recuerdo;
    const vivo = vivos.get(recuerdo.object.id);
    return vivo === undefined ? { ...recuerdo, day: state.day } : recuerdoDe(state, vivo);
  });
}

/**
 * Si un jugador está mirando ahora mismo esa casilla CONCRETA.
 *
 * Es `visibleNow(state, p).has(q)` sin construir las casillas, y la
 * distinción no es celo de micro-optimización: `emit` pregunta por UNA casilla
 * por evento y por jugador, y la forma con `Set` levantaba las 81 claves del
 * cuadrado de visión —nueve por nueve— para tirarlas. De los 9 654 ns que
 * costaba responder, 7 930 eran los `pointKey` y los `Set.add`.
 *
 * Medido de dos maneras que coinciden: por perfil (`--cpu-prof` por self time,
 * 2,76 % del cómputo del barrido, que baja a 0,24 %) y por reloj, las 40
 * semillas enteras dentro del proceso y en régimen —2 106 ms con el `Set`,
 * 2 032 con el predicado: **un 3,5 %**—. Es lo que hay: una décima de segundo
 * en el barrido, nada en una partida. Se hace porque las cuatro líneas son más
 * simples que el `Set`, no porque se note al jugar.
 *
 * Lo que NO vale es una caché por turno: `hero_moved` se emite paso a paso —el
 * 56 % de los eventos— y `hero.at` cambia entre pasos, así que una caché
 * sellaría observadores equivocados.
 *
 * Poda fuera del mapa igual que `marcarCuadrado`, y por eso las dos formas son
 * equivalentes para CUALQUIER punto y no solo para los que existen. La misma
 * regla escrita dos veces es lo que este repositorio no perdona: las ata un
 * test que las compara casilla a casilla sobre una partida jugada.
 */
export function visibleNowAt(state: GameState, playerId: PlayerId, q: Point): boolean {
  if (!inBounds(state.map, q)) return false;
  // Lo que no se ha explorado no se mira, aunque caiga en el radio.
  if (!playerById(state, playerId).fog.has(q)) return false;
  // Se recorre `state.heroes` y no `heroesOf`, que filtra a un array nuevo: en
  // este camino la asignación es justo lo que se venía a quitar.
  for (const hero of state.heroes) {
    if (hero.owner !== playerId) continue;
    const dx = Math.abs(hero.at.x - q.x);
    const dy = Math.abs(hero.at.y - q.y);
    if (dx <= HERO_SCOUT_RADIUS && dy <= HERO_SCOUT_RADIUS) return true;
  }
  for (const town of state.towns) {
    // La distancia antes que el dueño: es lo barato, y casi siempre basta.
    const dx = Math.abs(town.at.x - q.x);
    const dy = Math.abs(town.at.y - q.y);
    if (dx > NODE_SCOUT_RADIUS || dy > NODE_SCOUT_RADIUS) continue;
    if (dueñoDeLaCiudad(state, town) === playerId) return true;
  }
  for (const obj of state.map.objects) {
    if (obj.kind !== 'node' || obj.owner !== playerId) continue;
    const dx = Math.abs(obj.at.x - q.x);
    const dy = Math.abs(obj.at.y - q.y);
    if (dx <= NODE_SCOUT_RADIUS && dy <= NODE_SCOUT_RADIUS) return true;
  }
  return false;
}

/**
 * El dueño de ayer de un sitio del muro **vio caerlo**: lo miraba desde él
 * mismo (un nodo y un castillo propios miran a 6) hasta el instante en que cambió
 * de bandera, así que su recuerdo es ya la bandera nueva, de hoy. Sin esto, el mapa
 * le seguía pintando el nodo como suyo hasta que alguien suyo volviera a mirarlo
 * (H1 de la vuelta 1 de QA de la niebla por regiones, 02-11-2026: en 63 de 87
 * nodos quitados). Lo de alrededor no: deja de mirarlo con la bandera.
 */
export function vioCaerlo(state: GameState, anterior: PlayerId | null, obj: MapObject): void {
  if (anterior === null) return;
  playerById(state, anterior).memory.set(obj.id, recuerdoDe(state, obj));
}
