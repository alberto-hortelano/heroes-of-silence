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
 *  - **Se ve al ver su región** (`asaltantesALaVista`), y la marcha que
 *    descubre por el camino un grupo que la emboscaría más adelante se para
 *    donde lo ve (`march_halted`, #130): nadie pisa una emboscada sin aviso.
 *  - **Se dispersa** cuando su región tiene dueño (`territorio`), y **brota**
 *    los lunes en regiones sin dueño y sin héroe, en una casilla libre.
 */
import { fuerzaDe, poderDe, ventajaClara } from '../ai/fuerza.js';
import { problemasDeTopeDeLiderazgo } from '../catalogo.js';
import { ASALTANTES, type GrupoDeTropa } from '../data.js';
import { deHoyALaEscala } from '../escala.js';
import type { Hero } from '../hero/hero.js';
import { individuosDe } from '../hero/troop.js';
import type { CasillasLeidas } from '../map/casillas.js';
import { type GameMap, inBounds, type Mirada } from '../map/map.js';
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
 * Lo que impide que unos grupos de tropa sean un grupo neutral sin héroe: de 1
 * individuo en adelante, el techo de liderazgo y el techo de fuerza de
 * `data/asaltantes.json`. `queEs` lo nombra en la frase —«un grupo de
 * asaltantes», «un encuentro»—. Una sola comprobación para los sitios donde se
 * escribe uno: los datos de los asaltantes, el plan de mapa del agente
 * (`validateMapPlan`) y los encuentros de un mundo (`problemasDelMundo`), que
 * así no llevan una cifra propia.
 */
export function problemasDeGrupoNeutral(
  grupos: readonly GrupoDeTropa[],
  quien: string,
  queEs: string,
): string[] {
  // Un grupo de cero individuos no es un grupo: ocupaba casilla, era hostil y no
  // emboscaba, y atacarlo daba una batalla de 0 rondas ganada al instante. Aquí y
  // no en `problemasDeGrupo`, porque una guarnición vacía SÍ es un estado de
  // juego —la que queda al tomar un castillo—.
  if (grupos.length === 0) {
    return [`${quien} no lleva a nadie: ${queEs} es de 1 individuo en adelante`];
  }
  const problemas = problemasDeTopeDeLiderazgo(grupos, quien, ASALTANTES.liderazgoMax, queEs);
  if (problemas.length > 0) return problemas;
  const fuerza = poderDe({ troops: grupos });
  if (fuerza > ASALTANTES.fuerzaMax) {
    problemas.push(
      `${quien} suma ${fuerza} de fuerza y ${queEs} lleva como mucho ${ASALTANTES.fuerzaMax}: más fuerte que eso es un muro que ningún héroe cruza`,
    );
  }
  return problemas;
}

/** Lo que impide que unos grupos de tropa sean un asaltante (`problemasDeGrupoNeutral`). */
export function problemasDeAsaltante(grupos: readonly GrupoDeTropa[], quien: string): string[] {
  return problemasDeGrupoNeutral(grupos, quien, 'un grupo de asaltantes');
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
 * Cuántos pasos da hoy un grupo: `pasosPorDia` de `data/asaltantes.json`, que
 * se midió en el mapa de 34×34, a la escala del mapa (`deHoyALaEscala`, #229).
 * Con 2 en el 42×42, días de 2 y de 3 que dan 2,45 de media: los ×1,22 de la
 * marcha de los héroes (`marchaALaEscala`). Con un entero fijo se quedaba en 2.
 */
export function pasosDeLaPatrulla(dia: number): number {
  return deHoyALaEscala(ASALTANTES.pasosPorDia, dia);
}

/**
 * A dónde se mueve hoy un grupo: a una casilla libre de su región a
 * `pasosDeLaPatrulla` pasos como mucho —contados andando por la región, no a vuelo de pájaro, para
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

  const pasos = pasosDeLaPatrulla(state.day);
  // Una búsqueda en anchura acotada, por casillas de la región que no tienen
  // nada encima. En orden de `VECINAS`, que es lo que la hace determinista.
  const origen = raider.at.y * W + raider.at.x;
  const distancia = new Map<number, number>([[origen, 0]]);
  const cola = [origen];
  const candidatas: number[] = [origen];
  for (let q = 0; q < cola.length; q++) {
    const i = cola[q] as number;
    const d = distancia.get(i) as number;
    if (d >= pasos) continue;
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
 * Las regiones que se están mirando: las de alguna casilla de `mirando`. Los
 * muros, nodos y casillas fuera de región (−1) no cuentan.
 */
function regionesALaVista(map: GameMap, mirando: Iterable<Point>): Set<number> {
  const out = new Set<number>();
  for (const p of mirando) {
    const r = regionDeCasilla(map, p);
    if (r >= 0) out.add(r);
  }
  return out;
}

declare const aLaVista: unique symbol;

/**
 * Una lista de grupos que ya ha pasado por la niebla de quien mira. Solo la
 * fabrican `asaltantesALaVista` y, para quien lo ve todo, `todosALaVista`: así
 * lo que enseña grupos —el lienzo, la ruta— no compila con `state.raiders` a
 * secas ni con un `.filter` encima, que devuelve un array sin la marca. Es lo
 * que el guardia de `invariantes.test.ts`, un grep, no podía ver: `escena:
 * state` pintando todos los grupos.
 */
export type AsaltantesALaVista<T extends VistaAsaltante = Raider> = readonly T[] & {
  readonly [aLaVista]: true;
};

/**
 * Los grupos de quien no tiene niebla: el espectador, que lo ve todo porque eso
 * es lo que es, y «Ver mapa entero». Es la otra puerta de la marca y no filtra
 * nada; quien la llama dice con ello que mira sin niebla.
 */
export function todosALaVista<T extends VistaAsaltante>(
  grupos: readonly T[],
): AsaltantesALaVista<T> {
  return grupos as AsaltantesALaVista<T>;
}

/**
 * Los grupos que ve quien mira `mirando` (`visibleNow`; `null` es «todo», la
 * convención del cliente para «Ver mapa entero»). **La única regla de qué
 * grupo se ve**: la leen la ruta (`emboscadaEnLaRuta`), el lienzo y la barra
 * del cliente (`Session.asaltantesALaVista`) y el agente (`serializeKnownMap`).
 * La crónica y la parada de la marcha preguntan lo mismo por un solo grupo y
 * sin el `Set` (`grupoALaVistaDesde`). El espectador lo ve todo.
 *
 * **Un grupo se ve en cuanto se ve cualquier casilla de su región**, aunque la
 * suya siga en la niebla (opción C de #130): un grupo que patrulla una región
 * se nota desde su borde; lo que no se regala es el terreno, que sigue siendo
 * `fog`. El porqué y las medidas, en `docs/historia.md`.
 */
export function asaltantesALaVista(
  state: GameState,
  mirando: CasillasLeidas | null,
): AsaltantesALaVista {
  if (mirando === null) return todosALaVista([...state.raiders]);
  const seVe = grupoALaVista(state.map, mirando);
  return todosALaVista(state.raiders.filter((r) => seVe(r.at)));
}

/**
 * La regla de `asaltantesALaVista` para un grupo que está —o estaba— en `at`.
 * Un grupo fuera de toda región no existe (`pasoDePatrulla` lanza) y no se ve.
 */
export function grupoALaVista(map: GameMap, mirando: CasillasLeidas): (at: Point) => boolean {
  const regiones = regionesALaVista(map, mirando);
  return (at) => regiones.has(regionDeCasilla(map, at));
}

/**
 * La misma regla para un solo grupo, sin levantar el `Set` de lo visible: se
 * recorren las `miradas` del jugador (`miradasDe`, en `game.ts`). Primero la
 * casilla del grupo, que es lo barato y lo que casi siempre decide; si no, el
 * cuadrado de cada mirada sobre `regionDe` hasta dar con su región.
 *
 * Es lo que preguntan el sello de la crónica (`raider_dispersed` se sella con el
 * grupo ya fuera de `state.raiders`) y la parada de la marcha a cada paso:
 * construir `visibleNow` y sus regiones para una casilla era el 2,1 % del
 * banco. Que dice lo mismo que `grupoALaVista` lo ata un test grupo a grupo.
 */
export function grupoALaVistaDesde(map: GameMap, miradas: readonly Mirada[], at: Point): boolean {
  const region = regionDeCasilla(map, at);
  if (region < 0) return false;
  for (const { centro, radio } of miradas) {
    if (Math.max(Math.abs(centro.x - at.x), Math.abs(centro.y - at.y)) <= radio) return true;
  }
  const { regionDe } = estructura(map);
  const W = map.width;
  for (const { centro, radio } of miradas) {
    const x0 = Math.max(0, centro.x - radio);
    const x1 = Math.min(W - 1, centro.x + radio);
    const y0 = Math.max(0, centro.y - radio);
    const y1 = Math.min(map.height - 1, centro.y + radio);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) if (regionDe[y * W + x] === region) return true;
    }
  }
  return false;
}

/** Un grupo que le saca el margen a un héroe, con su región. */
interface GrupoConMargen {
  readonly raider: Raider;
  readonly region: number;
}

/**
 * Los grupos que le sacan el margen (`ventajaClara`) a `hero`, en el orden de
 * `state.raiders` —el de `emboscador`—, entre los que pasan `cuales`. La fuerza
 * del héroe se mide solo si alguno pasa: la IA pregunta por cada marcha y casi
 * nunca hay un grupo en su ruta. Lo leen la ruta que avisa, la parada de la
 * marcha y el alcance prudente de la IA.
 */
function gruposConMargen(
  state: GameState,
  hero: Hero,
  cuales: (raider: Raider, region: number) => boolean = () => true,
): GrupoConMargen[] {
  const out: GrupoConMargen[] = [];
  let suya: number | undefined;
  for (const raider of state.raiders) {
    const region = regionDeCasilla(state.map, raider.at);
    if (region < 0 || !cuales(raider, region)) continue;
    suya ??= fuerzaDe(hero, state.characters);
    if (ventajaClara(poderDe(raider), suya)) out.push({ raider, region });
  }
  return out;
}

/** El primer paso de `ruta` que pisa la región de uno de `grupos`, y cuál. */
function primeroEnLaRuta(
  map: GameMap,
  ruta: readonly { readonly at: Point }[],
  grupos: readonly GrupoConMargen[],
): { readonly paso: number; readonly raider: Raider } | null {
  if (grupos.length === 0) return null;
  for (let i = 0; i < ruta.length; i++) {
    const region = regionDeCasilla(map, (ruta[i] as { at: Point }).at);
    if (region < 0) continue;
    const grupo = grupos.find((g) => g.region === region);
    if (grupo !== undefined) return { paso: i, raider: grupo.raider };
  }
  return null;
}

/**
 * Dónde emboscarían a `hero` si anduviera `ruta`, contando SOLO con los grupos
 * que su dueño ve (`vistos`, que solo da `asaltantesALaVista`): el índice del
 * primer paso que pisa la región de un grupo que le saca el margen, y quién es;
 * o `null`.
 *
 * Es `emboscador` paso a paso —la misma regla, el mismo orden de
 * `state.raiders`— con una restricción que no se puede quitar: un grupo que no
 * se ve **no avisa**. Avisar de él sería decirle a la persona lo que la niebla le
 * tapa, que es la fuga que el agente no tiene. Lo pide la pantalla para marcar
 * la ruta (H2 del ciclo «el camino cuesta»).
 */
export function emboscadaEnLaRuta(
  state: GameState,
  hero: Hero,
  ruta: readonly { readonly at: Point }[],
  vistos: AsaltantesALaVista<VistaAsaltante>,
): { readonly paso: number; readonly raider: Raider } | null {
  if (vistos.length === 0) return null;
  const ids = new Set(vistos.map((r) => r.id));
  return primeroEnLaRuta(
    state.map,
    ruta,
    gruposConMargen(state, hero, (r) => ids.has(r.id)),
  );
}

/** Los grupos que le sacan el margen a `hero` con su fuerza de ahora y patrullan una región de `ruta`. */
function conMargenEnLaRuta(
  state: GameState,
  hero: Hero,
  ruta: readonly { readonly at: Point }[],
): GrupoConMargen[] {
  const pisadas = new Set<number>();
  for (const paso of ruta) pisadas.add(regionDeCasilla(state.map, paso.at));
  return gruposConMargen(state, hero, (_, region) => pisadas.has(region));
}

/**
 * Lo que vigila la marcha de `hero` por `ruta` (`moveHero`, #130). Devuelve la
 * pregunta que la marcha hace tras cada paso: «¿hay que pararse aquí?», con el
 * índice del primer paso que queda y si algo cambió en ese paso (un hecho más
 * que el `hero_moved`); la respuesta es el grupo por el que se para, o `null`.
 *
 * **La regla**: la marcha se para en cuanto se ve un grupo que, con la fuerza de
 * ahora, la emboscaría en lo que queda de ruta y que no es el que la ruta avisaba
 * al salir. Ese lo vio quien la pidió y decidió pisarlo; cualquier otro, no.
 *
 * Por qué «no es el avisado» y no «no se veía al salir» (H1 de QA, `?seed=198`):
 * el héroe que recoge la guarnición de camino deja de temer al grupo avisado y
 * pasa a emboscarlo uno posterior, que pudo verse desde el principio sin que la
 * ruta lo nombrara —la ruta nombra uno—. Al salir las dos reglas dicen lo mismo:
 * el primero que embosca, si se ve, es el avisado.
 *
 * Quién embosca se recalcula solo cuando el paso cambió algo —la guarnición
 * recogida sube la fuerza, un nodo tomado dispersa grupos—: ninguna otra cosa
 * de una marcha cambia la respuesta. Si no se recalculara, la marcha se pararía
 * por un grupo que ya no la emboscaría (H2, `?seed=6`). Las `miradas` se piden
 * solo si hay un grupo con margen en la ruta, y por eso es una función: la IA no
 * pisa las regiones de los que ha visto (`casillasPeligrosas`), así que en casi
 * todas sus marchas no se miran.
 */
export function vigiaDeLaMarcha(
  state: GameState,
  hero: Hero,
  ruta: readonly { readonly at: Point }[],
  miradas: () => readonly Mirada[],
): (siguiente: number, cambio: boolean) => Raider | null {
  const { map } = state;
  const alSalir = conMargenEnLaRuta(state, hero, ruta);
  // El que nombra la ruta al salir: el primero de la ruta entre los que se ven
  // (`emboscadaEnLaRuta`, que es lo que pinta el cliente y lo que lee el agente).
  let avisado: Raider | null = null;
  if (alSalir.length > 0) {
    const vistas = miradas();
    const vistos = alSalir.filter((g) => grupoALaVistaDesde(map, vistas, g.raider.at));
    avisado = primeroEnLaRuta(map, ruta, vistos)?.raider ?? null;
  }
  let amenaza = primeroEnLaRuta(map, ruta, alSalir)?.raider ?? null;
  return (siguiente, cambio) => {
    if (cambio) {
      const resto = ruta.slice(siguiente);
      amenaza = primeroEnLaRuta(map, resto, conMargenEnLaRuta(state, hero, resto))?.raider ?? null;
    }
    if (amenaza === null || amenaza === avisado) return null;
    return grupoALaVistaDesde(map, miradas(), amenaza.at) ? amenaza : null;
  };
}

/**
 * Lo que vio la marcha que se para (`march_halted`), dicho una vez: lo leen la
 * barra, la crónica y la nota del agente, que le añade el id del grupo.
 */
export function loQueLaPara(troops: readonly GrupoDeTropa[]): string {
  return `ve ${individuosDe(troops)} asaltantes que lo emboscarían más adelante`;
}

/**
 * Lo último que un jugador vio de un grupo: dónde estaba, con qué tropa y qué
 * día. Lo guarda `Player.asaltantesVistos` y lo escribe `recordarAsaltantes`.
 */
export interface AsaltanteRecordado {
  readonly day: number;
  readonly grupo: VistaAsaltante;
}

/**
 * Apunta en `recuerdo` lo que se ve desde `mirando` con la regla de
 * `asaltantesALaVista` —un grupo se ve al verse su región—: los grupos de esas
 * regiones se apuntan con su casilla y su tropa de hoy, y los que se recordaban
 * en ellas y ya no están se olvidan, porque mirar la región y no verlos es
 * saber que se fueron. Lo que pasa en una región que no se mira no se sabe: el
 * grupo que se dispersó lejos se sigue recordando hasta volver a mirarla.
 *
 * Basta con la región y no con la casilla porque un grupo no sale nunca de la
 * suya (`pasoDePatrulla`): recordar dónde estaba es recordar qué región
 * patrulla, y eso es lo que pregunta `casillasPeligrosas`.
 */
export function recordarAsaltantes(
  state: GameState,
  recuerdo: Map<string, AsaltanteRecordado>,
  mirando: Iterable<Point>,
): void {
  const regiones = regionesALaVista(state.map, mirando);
  if (regiones.size === 0) return;
  for (const [id, { grupo }] of recuerdo) {
    if (regiones.has(regionDeCasilla(state.map, grupo.at))) recuerdo.delete(id);
  }
  for (const { id, at, troops } of state.raiders) {
    if (regiones.has(regionDeCasilla(state.map, at))) {
      recuerdo.set(id, { day: state.day, grupo: { id, at, troops } });
    }
  }
}

/**
 * Las casillas de las regiones donde a `hero` lo emboscarían **según lo que su
 * dueño sabe** (`recuerdo`, su `asaltantesVistos`), marcadas con un 1 (índice
 * `y*width+x`): lo que la IA no pisa (`alcanceDelHeroe` las trata como muro,
 * porque la primera casilla ya es la emboscada). `null` si ningún grupo
 * conocido le saca el margen. Una marca y no una lista de puntos: una región
 * son decenas de casillas y la IA lo pregunta por cada héroe y cada turno.
 *
 * **Pasa por la niebla** (#164): antes leía `state.raiders` entero y la IA no
 * caía nunca en una emboscada, mientras la persona y el agente jugaban con la
 * suya. Con lo que ve AHORA no basta: la marcha que descubre un grupo se para
 * (`vigiaDeLaMarcha`), el héroe se aparta y, en cuanto deja de ver la región,
 * la vuelve a meter en su ruta. Sin recuerdo eran 14 865 marchas paradas y 32
 * de 300 partidas sin terminar; con él, las cifras en `docs/historia.md`.
 *
 * La región en la que ya está el héroe **también** se marca: si se ha vuelto
 * peligrosa —ganó una batalla dentro y salió mermado—, cada paso dentro de ella
 * es la emboscada. Lo que le deja salir es que el Dijkstra respeta el origen:
 * desde donde está puede pisar el nodo de al lado y marcharse. Medido sin esta
 * regla (dejándole andar por la suya), eran 23 de las 33 emboscadas de 200
 * partidas, y 31 de las 33 las ganaba el grupo; con ella, 0, y 0 de 1 000
 * partidas sin terminar.
 */
export function casillasPeligrosas(
  state: GameState,
  hero: Hero,
  recuerdo: ReadonlyMap<string, AsaltanteRecordado>,
): Uint8Array | null {
  const regiones = new Set<number>();
  let suya: number | undefined;
  for (const { grupo } of recuerdo.values()) {
    const region = regionDeCasilla(state.map, grupo.at);
    if (region < 0 || regiones.has(region)) continue;
    suya ??= fuerzaDe(hero, state.characters);
    if (ventajaClara(poderDe(grupo), suya)) regiones.add(region);
  }
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
