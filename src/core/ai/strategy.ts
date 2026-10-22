/**
 * IA estratégica de respaldo para el mapa de aventura.
 *
 * Ni planifica a largo plazo ni pretende hacerlo: construye lo que puede,
 * recluta lo que puede y manda a sus héroes al objetivo más rentable que esté
 * a su alcance. Es el listón que el agente tiene que superar.
 */
import { cifrasDeUnidad, equipoPuestoDe, unidadDelJuego } from '../catalogo.js';
import type { Pieza } from '../data.js';
import {
  conEquipo,
  destinoDeEquipo,
  equipoDe,
  type PedidoDeEquipo,
  PIEZAS_DE_ARMERIA,
  type Portador,
  pedidoDeEquipo,
  pieza,
} from '../hero/equipo.js';
import { rangoDeTropa } from '../hero/experiencia.js';
import type { Hero } from '../hero/hero.js';
import {
  capacidadDe,
  elQueSeIria,
  sinIndividuos,
  troopRoom,
  troopsThatFit,
  troopUnit,
  withTroops,
} from '../hero/troop.js';
import {
  casillaDelIndice,
  costeEnElAlcance,
  type MapObject,
  pointKey,
  type Reachable,
} from '../map/map.js';
import { regionesQueCierra, type Territorio, territorio } from '../map/regiones.js';
import { indiceDePoder } from '../nivel.js';
import { grupoALaVistaDesde } from '../state/asaltantes.js';
import {
  type AdventureAction,
  baseOf,
  destinoDeRecluta,
  type GameState,
  HERO_HIRE_COST,
  heroeEnElPueblo,
  heroesOf,
  miradasDe,
  ponerseBlocker,
  recruitCapacity,
  townsOf,
} from '../state/game.js';
import { rentaDeLaRegion } from '../state/renta.js';
import { building, buildingsOfFaction, nivelDeMorada } from '../town/buildings.js';
import {
  availableBuildings,
  dwellings,
  recruitCost,
  type Town,
  tieneArmeria,
} from '../town/town.js';
import type { Army, Equipo, FactionId, PlayerId, Point, UnitInfo } from '../types.js';
import { FACTION_IDS } from '../types.js';
import { CUERPO_COMUN } from '../unidad.js';
import { armyPower, fuerzaDe, poderDe, unitPower, ventajaClara } from './fuerza.js';

/** Lo que vale tomar una ciudad ajena que no es la base de nadie. */
const VALOR_DE_CIUDAD = 40000;
/** Lo que vale tomar un nodo ajeno, sin contar lo que cierre. */
const VALOR_DE_NODO = 3000;
/** Lo que suma cada región que ese nodo dejaría cerrada para mí, sin su renta. */
const VALOR_POR_REGION_CERRADA = 6000;
/**
 * Cuántos días de renta de sus pueblos vale cerrar una región. **Inventado**
 * (21-10-2026): la mediana de la duración de una partida en
 * 1-100 (6 días, 19-10-2026). Un pueblo da `ECONOMIA.rentaDelPueblo` al día.
 */
const DIAS_DE_RENTA = 6;
/** Lo que vale quitar de en medio a un grupo neutral: un monstruo o un asaltante. */
const VALOR_DE_NEUTRAL = 2000;

/**
 * Lo que vale atacar a un grupo neutral de fuerza `suyo`: lo de un neutral si
 * le saco el margen, y −1 —no ir— si no. Un prototipo que se suicida no se
 * puede probar. La misma cuenta para el monstruo quieto y el asaltante.
 */
function valorDeNeutral(miPoder: number, suyo: number): number {
  return ventajaClara(miPoder, suyo) ? VALOR_DE_NEUTRAL : -1;
}

/**
 * Cuánto vale la pena ir a por este objeto del mapa. `miPoder` es
 * `fuerzaDe(hero)`, calculada una vez por quien recorre los objetos: no cambia
 * de un objeto a otro.
 */
function objectValue(
  state: GameState,
  foto: () => Territorio,
  obj: MapObject,
  hero: Hero,
  miPoder: number,
): number {
  const player = hero.owner;
  switch (obj.kind) {
    case 'chest':
      return obj.taken ? 0 : obj.gold;
    // El pueblo no se toma: es de quien cierre su región. Lo que se persigue
    // es el nodo que la cierra, que vale por su renta.
    case 'village':
      return 0;
    case 'node': {
      if (obj.owner === player) return 0;
      // Un nodo ajeno vale por sí mismo y, sobre todo, por las regiones que
      // CIERRA: las que tienen ya todos sus demás nodos en mi mano. Es la
      // valoración mínima de la fase 2a —«no tiene que ser buena; tiene que
      // jugar y acabar»—; cortar al rival y defender lo propio son de la 2b.
      // Cada región cerrada suma además los días de renta de sus pueblos.
      const t = foto();
      let valor = VALOR_DE_NODO;
      for (const r of regionesQueCierra(t, obj.id, player))
        valor += VALOR_POR_REGION_CERRADA + DIAS_DE_RENTA * rentaDeLaRegion(state.map, t.red, r);
      return valor;
    }
    case 'town': {
      // El dueño se lee del LIBRO DE CUENTAS y no de la bandera del mapa. Son
      // dos caras del mismo hecho y `captureTown` las escribe juntas, pero
      // quien decide a dónde ir no tiene por qué depender de que sigan al día:
      // la bandera es lo que se VE —y lo que recuerda la niebla—, y esta
      // decisión es de reglas.
      const pueblo = state.towns.find((t) => t.id === obj.id);
      if (pueblo === undefined) throw new Error(`el mapa tiene un castillo sin datos: ${obj.id}`);
      if (pueblo.owner === player) {
        // Pueblo propio: merece el viaje si guarda tropas QUE LE QUEPAN.
        // Concentrar el ejército en un héroe es lo que decide las partidas,
        // pero con el liderazgo lleno la guarnición entera vale cero: sin esta
        // resta, el héroe volvería a casa a por una tropa que no puede
        // llevarse, una y otra vez.
        const { tope, cupo } = capacidadDe(hero, state.combate.tope);
        const { dentro } = troopsThatFit(hero.army, tope, cupo, pueblo.garrison);
        return armyPower(dentro, state.characters) / 10;
      }
      // Un pueblo con guarnición es una batalla: se mide antes de ir.
      const guarnicion = armyPower(pueblo.garrison, state.characters);
      if (guarnicion > 0 && miPoder < guarnicion * 1.1) return -1;
      // La BASE del rival vale el triple: tomarla gana la partida. Es una
      // cifra medida y no un principio: con «perder la base elimina» se probó
      // sin el ×3 (1 000 semillas, 01-10-2026) y las partidas terminan todas,
      // pero la cola se dispara —mediana 4 → 7 días, p90 7 → 16, p99 13 → 42,
      // máximo 20 → 80— porque los héroes se entretienen con las ciudades del
      // medio, que siempre quedan más cerca. El arreglo de fondo es valorar
      // cada objetivo por lo que cambia la conexión a la base, y es #115.
      const esBaseRival = state.players.some(
        (p) => p.id !== player && p.base === pueblo.id && pueblo.owner === p.id,
      );
      return esBaseRival ? 3 * VALOR_DE_CIUDAD : VALOR_DE_CIUDAD;
    }
    case 'monster': {
      if (obj.defeated) return 0;
      return valorDeNeutral(miPoder, unitPower(unidadDelJuego(obj.creature)) * obj.count);
    }
  }
}

/** Sin veto: todo candidato vale. */
const SIN_VETO = (): boolean => true;

/**
 * Objetivo del héroe, esté a un paso o a diez días de marcha.
 *
 * Antes solo miraba lo alcanzable HOY, y eso dejaba al héroe plantado en cuanto
 * agotaba lo cercano: nunca llegaba al enemigo y la partida no terminaba nunca.
 * Ahora se elige el objetivo por rentabilidad global y se camina hacia él turno
 * a turno con `stepTowards`.
 *
 * El Dijkstra llega hecho: lo lanza el llamante una sola vez y se lo pasa a
 * esta función y a `stepTowards`, que antes hacían uno cada una **desde el
 * mismo origen**. Esto queda como pura elección.
 *
 * `admite` veta candidatos sin cambiar el orden de los demás: lo usa el turno
 * para sacar al héroe de un vaivén (`vueltaDelVaiven`), descartando los
 * objetivos cuyo paso de hoy cerraría otra vuelta.
 */
export function chooseHeroDestination(
  state: GameState,
  hero: Hero,
  alcance: Reachable,
  admite: (at: Point) => boolean = SIN_VETO,
): Point | null {
  // En un objeto y no en un `let`: lo escribe `considerar`, y `tsc` no ve una
  // escritura dentro de un cierre y lo estrecharía a `null` para siempre.
  const elegido: { mejor: { at: Point; score: number } | null } = { mejor: null };
  const miPoder = fuerzaDe(hero, state.characters);
  // Una foto del territorio para todos los objetos: no cambia mientras se
  // elige. Perezosa, porque solo la pide un nodo ajeno.
  let hecha: Territorio | undefined;
  const foto = (): Territorio => {
    hecha ??= territorio(state);
    return hecha;
  };

  // Lo hostil —héroes enemigos y ciudades ajenas guarnecidas— ya viene en el
  // alcance como final de trayecto (`alcanceDelHeroe`): se llega a ello, no se
  // cruza. Un objetivo detrás de uno sale con el coste del rodeo, o no sale.
  // Antes se miraba aquí retrocediendo la cadena de predecesores de cada
  // candidato, y se llevaba 147 de los 209 ms de esta función.
  const costeHasta = (p: Point): number | null => {
    const c = costeEnElAlcance(alcance, p);
    return c === 0 ? null : c;
  };
  // Un candidato: vale `valor` y se puntúa por rentabilidad, por punto de
  // movimiento gastado. Gana el primero con la puntuación más alta, en el
  // orden en que se consideran: ese orden es el desempate.
  const considerar = (at: Point, valor: number): void => {
    const coste = costeHasta(at);
    if (coste === null || !admite(at)) return;
    const score = valor / Math.max(1, coste);
    if (elegido.mejor === null || score > elegido.mejor.score) elegido.mejor = { at, score };
  };

  for (const obj of state.map.objects) {
    const valor = objectValue(state, foto, obj, hero, miPoder);
    if (valor > 0) considerar(obj.at, valor);
  }

  // Un grupo de asaltantes vale lo que un monstruo, con la misma regla: se le
  // ataca solo con ventaja clara. Lo que lo hace distinto —que se mueve y que
  // embosca— no es de aquí: lo evita el alcance que no entra en las regiones
  // donde lo emboscarían (`alcanceDelHeroe` con `evitarEmboscadas`). Solo
  // los que ve AHORA (#164): uno recordado ya no está donde se vio, y uno
  // que no ha visto no lo puede perseguir.
  const miradas = miradasDe(state, hero.owner);
  for (const asaltante of state.raiders) {
    if (!grupoALaVistaDesde(state.map, miradas, asaltante.at)) continue;
    const valor = valorDeNeutral(miPoder, poderDe(asaltante));
    if (valor > 0) considerar(asaltante.at, valor);
  }

  // Héroe enemigo a tiro. Las dos fuerzas cuentan el cuerpo de cada héroe:
  // desde que pisa el tablero, un héroe sin tropa no es un cero.
  //
  // Sin margen, y es a propósito. Con un 1,4 los dos bandos se esquivaban
  // eternamente en cuanto sus ejércitos se parecían; con el 1,05 que lo
  // sustituyó pasaba lo mismo en cuanto llegó el liderazgo: los dos ejércitos
  // se paran en el tope, dejan de crecer y se quedan a menos de un 5 % el uno
  // del otro para siempre —medido: 2 de 1000 semillas sin terminar en 300 días,
  // una de ellas con los dos héroes a 502,5 exactos—. Sin margen la relación es
  // total: de dos héroes, al menos uno persigue al otro. Atacar da la
  // iniciativa, así que el empate lo rompe quien llega antes.
  for (const enemigo of state.heroes) {
    if (enemigo.owner === hero.owner) continue;
    if (miPoder < fuerzaDe(enemigo, state.characters)) continue;
    considerar(enemigo.at, 60000);
  }

  // Defender la casa: si un enemigo ronda mi último pueblo y está peor
  // guarnecido que él, más vale volver que seguir de excursión.
  const mios = townsOf(state, hero.owner);
  if (mios.length <= 1) {
    for (const pueblo of mios) {
      const amenaza = state.heroes.some(
        (h) => h.owner !== hero.owner && distanciaAprox(h.at, pueblo.at) <= 6,
      );
      if (amenaza) considerar(pueblo.at, 80000);
    }
  }

  return elegido.mejor?.at ?? null;
}

/**
 * A dónde se repliega un héroe que no tiene nada que hacer sin entrar en una
 * emboscada: a su base, si llega a ella por el alcance que le dan, para cambiar
 * tropa y reclutar allí. `null` si ya está en ella —espera— o si no llega: se
 * queda donde está, que tampoco es entrar en una emboscada.
 */
export function destinoDeRepliegue(state: GameState, hero: Hero, alcance: Reachable): Point | null {
  const base = baseOf(state, hero.owner);
  if (base === null) return null;
  const coste = costeEnElAlcance(alcance, base.at);
  return coste === null || coste === 0 ? null : base.at;
}

/** Distancia de Chebyshev, suficiente para medir "está rondando mi casa". */
function distanciaAprox(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Hasta dónde puede avanzar hoy el héroe camino de `destino`.
 * Devuelve `null` si no le llega ni para el primer paso.
 *
 * Retrocede por los predecesores que `reachableFrom` ya calculó en vez de
 * relanzar un `findPath` desde el mismo origen: ese segundo recorrido era la
 * mitad del pathfinding del mapa. Ir hacia atrás da lo mismo que ir hacia
 * delante porque el coste crece ESTRICTAMENTE a lo largo de un camino mínimo
 * —ningún paso vale 0—, así que el primer nodo que cabe en los puntos de
 * movimiento viniendo del destino es el último que cabía viniendo del origen.
 *
 * Los tres `null` son los de `findPath`, uno a uno: el destino no está en el
 * alcance (inalcanzable, o no pisable — `reachableFrom` no lo asienta), el
 * destino es el origen (coste 0), y retroceder hasta el origen sin encontrar
 * nada, que es no tener ni para el primer paso.
 */
export function stepTowards(hero: Hero, destino: Point, alcance: Reachable): Point | null {
  const desde = costeEnElAlcance(alcance, destino);
  if (desde === null || desde === 0) return null;

  // Por índices hasta dar con el paso, y un solo `Point` al final: retroceder
  // por `"x,y"` construía una clave y un punto por casilla del camino.
  let i = destino.y * alcance.ancho + destino.x;
  let coste = desde;
  while (coste > hero.movePoints) {
    const anterior = alcance.previos[i] as number;
    if (anterior === -1) return null;
    i = anterior;
    const c = alcance.costes[i] as number;
    if (c === -1) {
      const at = casillaDelIndice(alcance, i);
      throw new Error(`el alcance no sabe qué cuesta (${at.x},${at.y})`);
    }
    coste = c;
  }

  // Coste 0 es el origen y solo el origen: se retrocedió el camino entero.
  return coste === 0 ? null : casillaDelIndice(alcance, i);
}

/**
 * Qué construir antes que qué, en cada facción. **La prioridad es el puesto.**
 *
 * Antes era una cascada de seis constantes y el gremio de magia perdía siempre
 * (`mage_guild_1` en 1 partida de 40); la reparación quitó el número y ordenó
 * por raza, como el original (`ai/ai_planner_castle.cpp`). Con las cinco
 * facciones (19-10-2026) **las moradas se ordenan solas**: la de más nivel antes
 * (`nivelDeMorada`, el de lo mejor que produce) y, a igual nivel, la del sitio más
 * alto. Lo que exige otra (`requires`) no sale en `availableBuildings` hasta que
 * la otra está, así que la lista no necesita saber de requisitos. Detrás, los de
 * villa en el orden de siempre del caballero.
 *
 * Y una lista tiene una obligación que un `if` no tiene: **el edificio que
 * llegue mañana hay que colocarlo**. Si no está, `chooseBuilding` lanza
 * diciéndolo, y un test exige que cada edificio de la facción salga aquí
 * exactamente una vez.
 */
const ORDEN_DE_LA_VILLA: readonly string[] = [
  // El castillo no da ingreso ni unidades, pero da murallas: el 95 de «abre
  // puerta» de la cascada vieja, que se ve mejor aquí.
  'castle',
  'town_hall',
  'city_hall',
  'mage_guild_1',
  'mage_guild_2',
  'tavern',
  'marketplace',
  'armory',
  // Prebuilt: nunca está disponible, pero la lista tiene que nombrarlo igual.
  'village_hall',
];

function ordenDe(faction: FactionId): readonly string[] {
  const moradas = buildingsOfFaction(faction)
    .filter((b) => b.morada !== undefined)
    .sort(
      (a, b) => nivelDeMorada(b) - nivelDeMorada(a) || (b.morada as number) - (a.morada as number),
    )
    .map((b) => b.id);
  return [...moradas, ...ORDEN_DE_LA_VILLA];
}

const ORDEN_DE_CONSTRUCCION: Readonly<Record<FactionId, readonly string[]>> = Object.fromEntries(
  FACTION_IDS.map((f) => [f, ordenDe(f)]),
) as Record<FactionId, readonly string[]>;

/** Qué construir hoy: lo primero de la lista de su facción que se pueda pagar. */
export function chooseBuilding(town: Town, oro: number): string | null {
  const posibles = availableBuildings(town, oro);
  if (posibles.length === 0) return null;

  const orden = ORDEN_DE_CONSTRUCCION[town.faction];
  const puesto = (id: string): number => {
    const i = orden.indexOf(id);
    // Fail-loud, y es el precio de la lista: un edificio nuevo que nadie haya
    // colocado no se cuela con la prioridad que tocara, se dice.
    if (i < 0) {
      throw new Error(`la lista de construcción de ${town.faction} no coloca "${id}"`);
    }
    return i;
  };

  return posibles.reduce((a, b) => (puesto(b) < puesto(a) ? b : a));
}

/** La lista de construcción de una facción, para quien quiera comprobarla. */
export function ordenDeConstruccion(faction: FactionId): readonly string[] {
  return ORDEN_DE_CONSTRUCCION[faction];
}

/**
 * Qué construir hoy en cada pueblo del jugador.
 *
 * Va aparte del reclutamiento a propósito: construir una mejora de morada
 * convierte las criaturas disponibles al tipo mejorado, así que un plan de
 * reclutamiento hecho ANTES de construir se queda apuntando a criaturas que ya
 * no existen. Primero se construye, y solo entonces se mira qué se recluta.
 */
export function planBuildings(state: GameState, playerId: PlayerId): AdventureAction[] {
  const acciones: AdventureAction[] = [];
  const player = state.players.find((p) => p.id === playerId);
  if (player === undefined) return acciones;

  // Simulación del monedero: el plan se construye sin tocar el estado real.
  let oro = player.oro;
  for (const town of townsOf(state, playerId)) {
    const edificio = chooseBuilding(town, oro);
    if (edificio !== null) {
      acciones.push({ type: 'build', town: town.id, building: edificio });
      oro -= building(edificio).cost;
    }
  }
  return acciones;
}

/**
 * Contrataciones de héroe del turno.
 *
 * Se contrata cuando el jugador se ha quedado corto de héroes y le sobra oro:
 * un jugador sin héroes conserva su castillo, así que no pierde la partida,
 * pero tampoco puede volver a mover nada.
 */
export function planHires(state: GameState, playerId: PlayerId): AdventureAction[] {
  const player = state.players.find((p) => p.id === playerId);
  if (player === undefined) return [];

  // Un solo héroe por bando: repartir la producción entre varios los deja a
  // todos débiles y la partida se eterniza en escaramuzas sin consecuencias.
  const heroes = heroesOf(state, playerId);
  if (heroes.length >= 1) return [];

  const acciones: AdventureAction[] = [];
  let oro = player.oro;
  const reserva = heroes.length === 0 ? 0 : 6000; // con héroes vivos, no se malgasta

  for (const town of townsOf(state, playerId)) {
    if (oro - HERO_HIRE_COST < reserva) break;
    if (state.heroes.some((h) => pointKey(h.at) === pointKey(town.at))) continue;
    acciones.push({ type: 'hire_hero', town: town.id });
    oro -= HERO_HIRE_COST;
    break; // uno por turno basta
  }
  return acciones;
}

/** Qué reclutar hoy, sobre el estado YA construido. */
export function planRecruits(state: GameState, playerId: PlayerId): AdventureAction[] {
  const acciones: AdventureAction[] = [];
  const player = state.players.find((p) => p.id === playerId);
  if (player === undefined) return acciones;

  // Quien se ha quedado sin héroe reserva lo que cuesta el siguiente, igual
  // que `planHires` reserva 6000 cuando aún le queda alguno. Sin esta línea el
  // reclutamiento se gasta el monedero ENTERO cada día y `planHires` —que
  // corre primero y exige 2500— no ve ese oro nunca: la renta de un pueblo no
  // llega a 2500 y la guarnición se come lo que entra. Resultado: un jugador
  // con 0 héroes y ~25 de oro frente a otro con un millón que no ataca su
  // castillo, hasta el día 300. Hoy no se ve porque la partida acaba el 7;
  // cuadrada la economía eran 15 de 200 partidas eternas, y las 15 esta.
  const reserva = heroesOf(state, playerId).length === 0 ? HERO_HIRE_COST : 0;
  let oro = player.oro - reserva;

  for (const town of townsOf(state, playerId)) {
    // La misma regla que aplica `recruit`: si la IA la copiara, el día que
    // cambie una de las dos pediría lo que el motor rechaza.
    const { tope, cupo, army, quien, hero } = destinoDeRecluta(state, town);
    let destino = army;

    // De la más fuerte a la más floja (`unitPower`, la cuenta de `planCambio`):
    // lo que rinde más va primero, y lo que se recluta hoy no lo licencia un
    // cambio de más tarde, que solo suelta lo más flojo que lo que mete. La
    // morada no es un nivel (es su sitio en la base, `Building.morada`): por
    // ella, del revés, los orkos reclutaban goblins y los licenciaban en la
    // misma jugada para meter a un orko de una morada anterior (s2, día 1).
    const candidatos = dwellings(town)
      .map(({ creature }) => ({ id: creature, poder: unitPower(unidadDelJuego(creature)) }))
      .sort((a, b) => b.poder - a.poder);
    for (const { id } of candidatos) {
      // Cuántos caben en el liderazgo, y de esos cuántos en el bolsillo. Lo
      // primero sustituye a los cinco huecos: el tope ya no es de tipos
      // distintos sino de lo que ocupa cada individuo. La cuenta es la misma
      // que enseña el botón «todo» del castillo: vive en `recruitCapacity`, y
      // un máximo mayor que cero ya es uno que hay, cabe y se paga — lo mismo
      // que miraban las dos guardas que había aquí alrededor.
      const cantidad = recruitCapacity(town, id, { army: destino, tope, cupo, quien }, oro).maximo;
      if (cantidad > 0) {
        acciones.push({ type: 'recruit', town: town.id, creature: id, count: cantidad });
        oro -= recruitCost(id, cantidad);
        destino = withTroops(destino, id, cantidad);
        continue;
      }

      // No cabe: con un héroe dentro, se mira si sale a cuenta CAMBIAR tropa
      // —licenciar lo barato para meter esto—. Sin esto un héroe se quedaba
      // para siempre con lo primero que reclutó: el cupo de 6 se llenaba de
      // lo barato, su fuerza se paraba en 200-300 y el oro se amontonaba.
      if (hero === undefined) continue;
      const cambio = planCambio(town, id, destino, tope, cupo, oro);
      if (cambio === null) continue;
      for (const [victima, n] of cambio.licencias) {
        acciones.push({ type: 'dismiss', hero: hero.id, creature: victima, count: n });
      }
      acciones.push({ type: 'recruit', town: town.id, creature: id, count: cambio.cuantos });
      oro -= recruitCost(id, cambio.cuantos);
      destino = cambio.army;
    }
  }

  return acciones;
}

/** Un cambio de tropa: a quién se licencia, cuántos entran y cómo queda. */
interface Cambio {
  readonly licencias: ReadonlyMap<string, number>;
  readonly cuantos: number;
  readonly army: Army;
}

/**
 * Cuántos de `id` caben en `army` licenciando, uno a uno, lo más barato que
 * sea más flojo que él. Se para en cuanto no hay con qué pagar el siguiente, no
 * quedan en el pueblo o no queda nada más flojo que licenciar, y se queda con
 * lo que tenía al meter el último: no se licencia a nadie para no meter a nadie.
 * `null` si no entra ninguno, o si lo que sale pesa tanto como lo que entra
 * —licenciar diez campesinos para meter un caballero que pega menos que los
 * diez sería perder fuerza pagando—.
 *
 * Simula con `sinIndividuos`, la misma función que aplica `dismiss`: lo que la
 * IA cree que queda es lo que queda.
 */
function planCambio(
  town: Town,
  id: string,
  army: Army,
  tope: number,
  cupo: number,
  oro: number,
): Cambio | null {
  const disponibles = town.available[id] ?? 0;
  const poder = unitPower(unidadDelJuego(id));
  let actual = army;
  let cuantos = 0;
  const licencias = new Map<string, number>();
  // Lo que pesa lo licenciado, sumado individuo a individuo con SUS cifras: un
  // veterano pesa más que un novato de su tipo, y `creature(c)` lo olvidaría.
  // `sale` es lo que va soltando la simulación; `saleFirme`, lo que pesaba lo
  // licenciado cuando se fijó `firme`.
  let sale = 0;
  let saleFirme = 0;
  let firme: Cambio = { licencias: new Map(), cuantos: 0, army };
  while (cuantos < disponibles && oro >= recruitCost(id, cuantos + 1)) {
    if (troopRoom(actual, tope, cupo, id) >= 1) {
      actual = withTroops(actual, id, 1);
      cuantos++;
      firme = { licencias: new Map(licencias), cuantos, army: actual };
      saleFirme = sale;
      continue;
    }
    const victima = laMasBarata(actual, poder);
    if (victima === null) break;
    actual = sinIndividuos(actual, victima.creature, 1);
    licencias.set(victima.creature, (licencias.get(victima.creature) ?? 0) + 1);
    sale += victima.poder;
  }
  if (firme.cuantos === 0) return null;
  return poder * firme.cuantos > saleFirme ? firme : null;
}

/**
 * El tipo de criatura que se licencia primero, con lo que pesa el individuo
 * que se iría: el que dice `elQueSeIria` —la misma regla que aplica
 * `dismiss`—, entre los que pegan menos que `poder`.
 *
 * Se ordena por **veteranía, luego oro, luego fuerza**, y el orden importa: lo
 * novato y barato se va antes que lo veterano, así que la IA no tira a un
 * piquero de rango 3 mientras le quede un campesino que tirar. Sin esa primera
 * clave, el veterano —que vale lo mismo en oro que un novato de su tipo— se iba
 * a la primera, y la experiencia no le servía de nada a quien la gana. A
 * igualdad de todo, el id menor, para que no decida el orden del ejército. Los
 * personajes no entran: no se licencian.
 */
function laMasBarata(
  army: Army,
  poder: number,
): { readonly creature: string; readonly poder: number } | null {
  let mejor: {
    readonly creature: string;
    readonly rango: number;
    readonly oro: number;
    readonly poder: number;
  } | null = null;
  const vistos = new Set<string>();
  for (const { creature: id, member } of army) {
    if (member !== undefined || vistos.has(id)) continue;
    vistos.add(id);
    // El que se iría de este tipo, con la MISMA regla que la acción.
    const t = elQueSeIria(army, id)!;
    const suyo = unitPower(troopUnit(t, undefined));
    if (suyo >= poder) continue;
    const rango = rangoDeTropa(t.veterania);
    const oro = unidadDelJuego(id).oro;
    const gana =
      mejor === null ||
      rango < mejor.rango ||
      (rango === mejor.rango &&
        (oro < mejor.oro ||
          (oro === mejor.oro &&
            (suyo < mejor.poder || (suyo === mejor.poder && id < mejor.creature)))));
    if (gana) mejor = { creature: id, rango, oro, poder: suyo };
  }
  return mejor === null ? null : { creature: mejor.creature, poder: mejor.poder };
}

// ---------------------------------------------------------------- equipo

/**
 * Quién lleva qué, en el orden en que la IA reparte: **el héroe primero** —es quien
 * más pelea y nunca se licencia— y después la tropa de **mayor índice de poder**
 * (`indiceDePoder`: catálogo + rango + el equipo que ya lleve), y a igual
 * índice en su orden. Por el índice y no por el nivel: es más fino, y dos
 * criaturas del mismo nivel no empatan por eso. Los personajes no entran —su
 * equipo es de la fase que los traiga— y se apartan **antes** de mirar nada: su
 * cuerpo es un perfil que no está en el catálogo. Las cifras salen de
 * `cifrasDeUnidad`, que para un novato devuelve el catálogo tal cual y para un
 * veterano las que ya recuerda por su hoja: no se fabrica ninguna.
 */
function portadores(hero: Hero): { readonly quien: Portador; readonly equipo: Equipo }[] {
  const tropa = hero.army
    .map((t, indice) => ({ t, indice }))
    .filter(({ t }) => t.member === undefined)
    .map(({ t, indice }) => ({
      t,
      indice,
      poder: indiceDePoder(cifrasDeUnidad(t.creature, t.veterania)),
    }))
    .sort((a, b) => b.poder - a.poder || a.indice - b.indice)
    .map(({ indice }) => {
      const quien: Portador = { indice };
      // Lo que lleva puesto, el de serie de su unidad incluido: una pieza que no
      // mejora la brigantina de serie no se compra para él.
      return { quien, equipo: equipoPuestoDe(hero, quien) };
    });
  const elHeroe: Portador = { heroe: true };
  return [{ quien: elHeroe, equipo: equipoDe(hero, elHeroe) }, ...tropa];
}

/**
 * El cuerpo con que la IA mide una pieza: el cuerpo común de las unidades
 * (`CUERPO_COMUN`), sin nada puesto.
 */
const CUERPO_DE_REFERENCIA: UnitInfo = {
  name: 'cuerpo de referencia',
  faction: null,
  attack: CUERPO_COMUN.attack,
  defense: CUERPO_COMUN.defense,
  damage: CUERPO_COMUN.damage,
  hp: CUERPO_COMUN.hp,
  speed: 'average',
};

/** Lo que vale cada pieza (`valorDePieza`), calculado una vez por pieza. */
const VALOR_DE_PIEZA = new WeakMap<Pieza, number>();

/**
 * Lo que vale una pieza para la IA: **lo que sube el índice de poder**
 * (`indiceDePoder`, la regla con que el juego mide una unidad con su equipo) del
 * cuerpo de referencia al ponérsela. Así la armadura pesa con la cuenta del
 * índice (contra el golpe de referencia de `data/poder.json`), el arma con su
 * rueda y un arma a distancia por lo que vale disparar, sin pesos aparte.
 * **Heurística de la IA**, no una regla del juego: la persona y el agente eligen
 * ellos. Con el cuerpo de referencia y no con el de quien la recibiría, para que
 * cada pieza se mida una vez: se compra y se reparte decenas de veces por turno.
 */
export function valorDePieza(p: Pieza): number {
  const ya = VALOR_DE_PIEZA.get(p);
  if (ya !== undefined) return ya;
  const valor =
    indiceDePoder(conEquipo(CUERPO_DE_REFERENCIA, { [p.hueco]: p.id })) -
    indiceDePoder(CUERPO_DE_REFERENCIA);
  VALOR_DE_PIEZA.set(p, valor);
  return valor;
}

/** Lo que gana `equipo` llevando `id` en vez de lo que lleve en ese hueco. */
function mejora(equipo: Equipo, id: string): number {
  const nueva = pieza(id);
  const actual = equipo[nueva.hueco];
  return valorDePieza(nueva) - (actual === undefined ? 0 : valorDePieza(pieza(actual)));
}

/**
 * Cómo se nombra al portador `quien` en una acción `equip`: lo dice el núcleo
 * (`pedidoDeEquipo`, la inversa de `destinoDeEquipo`). Los personajes no llegan
 * aquí (`portadores` los aparta), así que un motivo es un fallo y se lanza.
 */
function nombrar(hero: Hero, quien: Portador): PedidoDeEquipo {
  const pedido = pedidoDeEquipo(hero, quien);
  if ('motivo' in pedido) throw new Error(pedido.motivo);
  return pedido;
}

/**
 * Si nombrar a `quien` le hace llegar la pieza a ÉL. Lo responde el motor
 * (`destinoDeEquipo`), no una copia de su regla: nombrar a un novato por su tipo
 * se la pone al primero sin hoja, y con otro delante se la pondría a otro.
 */
function leLlega(hero: Hero, quien: Portador): boolean {
  const destino = destinoDeEquipo(hero, nombrar(hero, quien));
  if ('motivo' in destino) return false;
  return 'heroe' in destino
    ? 'heroe' in quien
    : 'indice' in quien && destino.indice === quien.indice;
}

/**
 * Cuántas piezas le compra la IA a un mismo héroe en un día, como mucho: la tropa
 * entera de un portador. **Heurística inventada**, como el resto de este bloque.
 * Sin tope compraba 18 al día —seis individuos por tres huecos— para una tropa
 * que caía al día siguiente: 1 187 compras del banco en 14 semillas, 268 en una.
 */
export const COMPRAS_POR_HEROE_Y_DIA = 3;

/**
 * El oro que tiene que quedarle a la IA tras pagar para comprarle una pieza a un
 * **novato** (rango 1 de tropa): cuatro héroes. Un novato muere antes que nadie y
 * la pieza se va con él, así que solo se le compra lo que sobra de verdad; al
 * héroe y a los veteranos les basta con no tocar lo que cuesta un héroe. Inventado.
 */
export const ORO_DE_SOBRA_PARA_NOVATOS = 4 * HERO_HIRE_COST;

/**
 * Para quién compra la IA: el héroe y los veteranos de rango 2 o más, que son
 * los que sobreviven —han pasado al menos una batalla con vida— y llevan la
 * pieza más lejos; un novato, solo si `sobra`. Equipar lo que ya hay en la
 * mochila no pasa por aquí: eso no cuesta oro, y una pieza que nadie lleva no
 * pega.
 */
function paraQuienSeCompra(hero: Hero, quien: Portador, sobra: boolean): boolean {
  if ('heroe' in quien || sobra) return true;
  return rangoDeTropa(hero.army[quien.indice]?.veterania) >= 2;
}

/**
 * Cuántas piezas lleva compradas `hero` hoy: los `item_bought` suyos desde el
 * último `day_start`. Se lee de la crónica y no de un contador porque la IA no
 * guarda estado entre preguntas, y el hecho ya existe.
 */
function compradasHoy(state: GameState, hero: Hero): number {
  let n = 0;
  for (let i = state.log.length - 1; i >= 0; i--) {
    const e = state.log[i]!;
    if (e.kind === 'day_start') break;
    if (e.kind === 'item_bought' && e.hero === hero.id) n++;
  }
  return n;
}

/**
 * La siguiente cosa que hace la IA con el equipo, o `null` si no queda ninguna:
 * primero **ponerse lo que lleva en la mochila**, y si no hay nada que poner,
 * **comprar** en la armería del pueblo donde está.
 *
 * Una acción cada vez y no un plan entero, porque cada una cambia lo que sigue
 * —equipar a un novato le abre la hoja, y lo quitado vuelve a la mochila— y
 * simularlo aquí sería la segunda implementación de `equip`. Quien llama la
 * aplica y vuelve a preguntar. Termina siempre: cada `equip` sube estrictamente
 * el valor de lo que se lleva puesto, y cada compra deja menos oro.
 *
 * **Heurística inventada**, y la más simple que juega: una pieza va al primer
 * portador (`portadores`) al que mejora (`valorDePieza`), y se compra la pieza de
 * armería si la mejoraría alguien que vale la pena y se la puede poner
 * (`paraQuienSeCompra`, `ponerseBlocker`), tras pagarla queda lo que cuesta un
 * héroe y el héroe no ha llegado hoy a `COMPRAS_POR_HEROE_Y_DIA`.
 */
export function siguienteDeEquipo(state: GameState, playerId: PlayerId): AdventureAction | null {
  const player = state.players.find((p) => p.id === playerId);
  if (player === undefined) return null;
  for (const hero of heroesOf(state, playerId)) {
    const lista = portadores(hero);
    // Lo mejor de la mochila primero: es lo que más gana quien lo reciba.
    const enMochila = [...new Set(hero.mochila)].sort(
      (a, b) =>
        valorDePieza(pieza(b)) - valorDePieza(pieza(a)) ||
        hero.mochila.indexOf(a) - hero.mochila.indexOf(b),
    );
    for (const id of enMochila) {
      const quien = lista.find(
        (p) =>
          mejora(p.equipo, id) > 0 &&
          ponerseBlocker(hero, p.quien, id) === null &&
          leLlega(hero, p.quien),
      );
      if (quien !== undefined) {
        return { type: 'equip', hero: hero.id, item: id, ...nombrar(hero, quien.quien) };
      }
    }
  }
  for (const town of townsOf(state, playerId)) {
    if (!tieneArmeria(town)) continue;
    const hero = heroeEnElPueblo(state, town);
    if (hero === undefined) continue;
    if (compradasHoy(state, hero) >= COMPRAS_POR_HEROE_Y_DIA) continue;
    const lista = portadores(hero);
    for (const p of PIEZAS_DE_ARMERIA) {
      const queda = player.oro - p.precio;
      // Tras pagarla queda lo que cuesta un héroe: con eso, también la paga.
      if (queda < HERO_HIRE_COST) continue;
      // Quien la recibiría es el primero al que mejora, con el MISMO orden con
      // el que se reparte la mochila justo después: si ese no vale la pena, no se
      // compra. Mirar si la mejora «alguien» que vale la pena dejaba comprarla
      // para un veterano y ponérsela después a un novato de más nivel de catálogo.
      const quien = lista.find(
        (x) =>
          mejora(x.equipo, p.id) > 0 &&
          ponerseBlocker(hero, x.quien, p.id) === null &&
          leLlega(hero, x.quien),
      );
      if (
        quien !== undefined &&
        paraQuienSeCompra(hero, quien.quien, queda >= ORO_DE_SOBRA_PARA_NOVATOS)
      ) {
        return { type: 'buy_item', town: town.id, item: p.id };
      }
    }
  }
  return null;
}
