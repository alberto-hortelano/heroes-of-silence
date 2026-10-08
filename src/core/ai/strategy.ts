/**
 * IA estratégica de respaldo para el mapa de aventura.
 *
 * Ni planifica a largo plazo ni pretende hacerlo: construye lo que puede,
 * recluta lo que puede y manda a sus héroes al objetivo más rentable que esté
 * a su alcance. Es el listón que el agente tiene que superar.
 */
import { creature } from '../data.js';
import {
  destinoDeEquipo,
  equipoDe,
  PIEZAS_DE_ARMERIA,
  type Portador,
  pieza,
  valorDePieza,
} from '../hero/equipo.js';
import { cifrasDeCatalogo, nivelDeTropa } from '../hero/experiencia.js';
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
  recruitCapacity,
  townsOf,
} from '../state/game.js';
import { building } from '../town/buildings.js';
import {
  availableBuildings,
  dwellings,
  recruitCost,
  type Town,
  tieneArmeria,
} from '../town/town.js';
import type { Army, Equipo, FactionId, PlayerId, Point, Resources } from '../types.js';
import { canAfford, subtractResources } from '../types.js';
import { armyPower, fuerzaDe, poderDe, unitPower, ventajaClara } from './fuerza.js';

/** Lo que vale tomar una ciudad ajena que no es la base de nadie. */
const VALOR_DE_CIUDAD = 40000;
/** Lo que vale tomar un nodo ajeno, sin contar lo que cierre. */
const VALOR_DE_NODO = 3000;
/** Lo que suma cada región que ese nodo dejaría cerrada para mí. */
const VALOR_POR_REGION_CERRADA = 6000;
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
    case 'resource':
      return obj.taken ? 0 : obj.resource === 'gold' ? obj.amount : obj.amount * 120;
    case 'chest':
      return obj.taken ? 0 : obj.gold;
    // Ni la mina ni el pueblo se toman: son de quien cierre su región. Lo que
    // se persigue es el nodo que la cierra.
    case 'mine':
    case 'village':
      return 0;
    case 'node': {
      if (obj.owner === player) return 0;
      // Un nodo ajeno vale por sí mismo y, sobre todo, por las regiones que
      // CIERRA: las que tienen ya todos sus demás nodos en mi mano. Es la
      // valoración mínima de la fase 2a —«no tiene que ser buena; tiene que
      // jugar y acabar»—; cortar al rival y defender lo propio son de la 2b.
      return VALOR_DE_NODO + VALOR_POR_REGION_CERRADA * regionesQueCierra(foto(), obj.id, player);
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
        const { tope, cupo } = capacidadDe(hero);
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
      return valorDeNeutral(miPoder, unitPower(creature(obj.creature)) * obj.count);
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
 * Antes esto era una cascada de seis constantes —`100 + dwellingLevel` para las
 * moradas, 95 para lo que abre una puerta, 90 para el ingreso,
 * `50 + upgradesLevel` para las mejoras, 40 para el gremio y 10 para el resto—
 * y el gremio de magia perdía siempre: `mage_guild_1` se construía en **1
 * partida de 40** y `syncSpellbooks` no enseñaba **un solo hechizo**. La magia
 * estaba entera —el gremio enseña, el héroe aprende, la IA valora, el maná
 * vuelve de la batalla— detrás de un edificio que nadie levantaba.
 *
 * La reparación no sube el 40 a 96: **quita el número**. El original tampoco
 * puntúa, ORDENA por raza (`ai/ai_planner_castle.cpp`), y una lista dice lo que
 * la cascada siempre quiso decir sin que haya que defender por qué 96 y no 94.
 * Estas dos reproducen el orden de la cascada **exactamente** —comprobado: con
 * el gremio en su sitio de siempre el volcado del banco sale byte a byte
 * idéntico— y lo único que se mueve es `mage_guild_1` en la lista del
 * nigromante, al puesto que le da el original: por delante de la morada y la
 * mejora de nivel 4. Al caballero no se le toca, y también es del original,
 * donde para KNGT el gremio va detrás de todo lo militar.
 *
 * **La asimetría no es un descuido que corregir.** Dársela a las dos facciones
 * a la vez se midió: 1 de 200 partidas deja de terminar, porque dos ejércitos
 * que crecen a la par es justo lo que produce partidas eternas.
 *
 * Y una lista tiene una obligación que un `if` no tiene: **el edificio que
 * llegue mañana hay que colocarlo**. Si no está, `chooseBuilding` lanza
 * diciéndolo, y un test exige que cada edificio de la facción salga aquí
 * exactamente una vez.
 */
const ORDEN_DE_CONSTRUCCION: Readonly<Record<FactionId, readonly string[]>> = {
  // La morada más alta que esté a mano manda: como cada una exige la anterior,
  // solo puede haber una disponible, y ponerlas en cascada es decir «la
  // siguiente de la cadena, antes que nada».
  knight: [
    'knight_dwelling_6',
    'knight_dwelling_5',
    'knight_dwelling_4',
    'knight_dwelling_3',
    'knight_dwelling_2',
    'knight_dwelling_1',
    // El castillo no da ingreso ni criaturas, pero es lo único que separa de la
    // morada de nivel 6: sin él la IA se quedaba atascada a sus puertas para
    // siempre. Ese era el 95 de «abre puerta», que se ve mejor aquí.
    'castle',
    'town_hall',
    'city_hall',
    'knight_upgrade_6',
    'knight_upgrade_5',
    'knight_upgrade_4',
    'knight_upgrade_3',
    'knight_upgrade_2',
    'mage_guild_1',
    'mage_guild_2',
    'tavern',
    'marketplace',
    'armory',
    // Prebuilt: nunca está disponible, pero la lista tiene que nombrarlo igual.
    'village_hall',
  ],
  necromancer: [
    'necromancer_dwelling_6',
    'necromancer_dwelling_5',
    // El único cambio de esta lista, y el que abre #88: el nigromante levanta el
    // gremio antes que su morada de nivel 4, que es el puesto que le da
    // `ai_planner_castle.cpp` para NECR. Comprobado antes de moverlo: con el
    // gremio abajo, donde lo dejaba el 40 de la cascada, estas dos listas dan
    // el volcado del banco byte a byte idéntico.
    'mage_guild_1',
    'necromancer_dwelling_4',
    'necromancer_dwelling_3',
    'necromancer_dwelling_2',
    'necromancer_dwelling_1',
    'castle',
    'town_hall',
    'city_hall',
    'necromancer_upgrade_5',
    'necromancer_upgrade_4',
    'necromancer_upgrade_3',
    'necromancer_upgrade_2',
    'mage_guild_2',
    'tavern',
    'marketplace',
    'armory',
    'village_hall',
  ],
};

/** Qué construir hoy: lo primero de la lista de su facción que se pueda pagar. */
export function chooseBuilding(town: Town, purse: Resources): string | null {
  const posibles = availableBuildings(town, purse);
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
  let purse = { ...player.resources };
  for (const town of townsOf(state, playerId)) {
    const edificio = chooseBuilding(town, purse);
    if (edificio !== null) {
      acciones.push({ type: 'build', town: town.id, building: edificio });
      purse = subtractResources(purse, building(edificio).cost);
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
  let oro = player.resources.gold;
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
  let purse = { ...player.resources, gold: player.resources.gold - reserva };

  // Reclutar de arriba abajo: las criaturas caras rinden más por moneda.
  for (const town of townsOf(state, playerId)) {
    // La misma regla que aplica `recruit`: si la IA la copiara, el día que
    // cambie una de las dos pediría lo que el motor rechaza.
    const { tope, cupo, army, quien, hero } = destinoDeRecluta(state, town);
    let destino = army;

    for (const { creature: id } of [...dwellings(town)].reverse()) {
      // Cuántos caben en el liderazgo, y de esos cuántos en el bolsillo. Lo
      // primero sustituye a los cinco huecos: el tope ya no es de tipos
      // distintos sino de lo que ocupa cada individuo. La cuenta es la misma
      // que enseña el botón «todo» del castillo: vive en `recruitCapacity`, y
      // un máximo mayor que cero ya es uno que hay, cabe y se paga — lo mismo
      // que miraban las dos guardas que había aquí alrededor.
      const cantidad = recruitCapacity(
        town,
        id,
        { army: destino, tope, cupo, quien },
        purse,
      ).maximo;
      if (cantidad > 0) {
        acciones.push({ type: 'recruit', town: town.id, creature: id, count: cantidad });
        purse = subtractResources(purse, recruitCost(id, cantidad));
        destino = withTroops(destino, id, cantidad);
        continue;
      }

      // No cabe: con un héroe dentro, se mira si sale a cuenta CAMBIAR tropa
      // —licenciar lo barato para meter esto—. Sin esto un héroe se quedaba
      // para siempre con lo primero que reclutó: el cupo de 6 se llenaba de
      // lo barato, su fuerza se paraba en 200-300 y el oro se amontonaba.
      if (hero === undefined) continue;
      const cambio = planCambio(town, id, destino, tope, cupo, purse);
      if (cambio === null) continue;
      for (const [victima, n] of cambio.licencias) {
        acciones.push({ type: 'dismiss', hero: hero.id, creature: victima, count: n });
      }
      acciones.push({ type: 'recruit', town: town.id, creature: id, count: cambio.cuantos });
      purse = subtractResources(purse, recruitCost(id, cambio.cuantos));
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
  purse: Resources,
): Cambio | null {
  const disponibles = town.available[id] ?? 0;
  const poder = unitPower(creature(id));
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
  while (cuantos < disponibles && canAfford(purse, recruitCost(id, cuantos + 1))) {
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
 * piquero de nivel 3 mientras le quede un campesino que tirar. Sin esa primera
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
    readonly nivel: number;
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
    const nivel = nivelDeTropa(t.veterania);
    const oro = creature(id).cost.gold ?? 0;
    const gana =
      mejor === null ||
      nivel < mejor.nivel ||
      (nivel === mejor.nivel &&
        (oro < mejor.oro ||
          (oro === mejor.oro &&
            (suyo < mejor.poder || (suyo === mejor.poder && id < mejor.creature)))));
    if (gana) mejor = { creature: id, nivel, oro, poder: suyo };
  }
  return mejor === null ? null : { creature: mejor.creature, poder: mejor.poder };
}

// ---------------------------------------------------------------- equipo

/**
 * Quién lleva qué, en el orden en que la IA reparte: **el héroe primero** —está en
 * el nivel 5 o más, por encima de cualquier tropa— y después la tropa de **mayor
 * nivel** (catálogo + veteranía), y a igual nivel en su orden. Los personajes no
 * entran —su equipo es de la fase que los traiga— y se apartan **antes** de mirar
 * nada: su cuerpo es un perfil que no está en el catálogo. El nivel sale de
 * `cifrasDeCatalogo`, que para un novato devuelve el catálogo tal cual y para un
 * veterano las cifras que ya recuerda por su hoja: no se fabrica ninguna.
 */
function portadores(hero: Hero): { readonly quien: Portador; readonly equipo: Equipo }[] {
  const tropa = hero.army
    .map((t, indice) => ({ t, indice }))
    .filter(({ t }) => t.member === undefined)
    .map(({ t, indice }) => ({ t, indice, nivel: cifrasDeCatalogo(t.creature, t.veterania).nivel }))
    .sort((a, b) => b.nivel - a.nivel || a.indice - b.indice)
    .map(({ indice }) => {
      const quien: Portador = { indice };
      return { quien, equipo: equipoDe(hero, quien) };
    });
  const elHeroe: Portador = { heroe: true };
  return [{ quien: elHeroe, equipo: equipoDe(hero, elHeroe) }, ...tropa];
}

/** Lo que gana `equipo` llevando `id` en vez de lo que lleve en ese hueco. */
function mejora(equipo: Equipo, id: string): number {
  const nueva = pieza(id);
  const actual = equipo[nueva.hueco];
  return valorDePieza(nueva) - (actual === undefined ? 0 : valorDePieza(pieza(actual)));
}

/**
 * Cómo se nombra al portador `quien` en una acción `equip`: el héroe sin más, el
 * de hoja por su id y el novato por su tipo —el motor elige al primero sin hoja—.
 */
function nombrar(
  hero: Hero,
  quien: Portador,
): Pick<Extract<AdventureAction, { type: 'equip' }>, 'veteran' | 'creature'> {
  if ('heroe' in quien) return {};
  const t = hero.army[quien.indice]!;
  return t.veterania !== undefined ? { veteran: t.veterania.id } : { creature: t.creature };
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
 * **novato** (nivel 1 de tropa): cuatro héroes. Un novato muere antes que nadie y
 * la pieza se va con él, así que solo se le compra lo que sobra de verdad; al
 * héroe y a los veteranos les basta con no tocar lo que cuesta un héroe. Inventado.
 */
export const ORO_DE_SOBRA_PARA_NOVATOS = 4 * HERO_HIRE_COST;

/**
 * Para quién compra la IA: el héroe y los veteranos de nivel 2 o más, que son
 * los que sobreviven —han pasado al menos una batalla con vida— y llevan la
 * pieza más lejos; un novato, solo si `sobra`. Equipar lo que ya hay en la
 * mochila no pasa por aquí: eso no cuesta oro, y una pieza que nadie lleva no
 * pega.
 */
function paraQuienSeCompra(hero: Hero, quien: Portador, sobra: boolean): boolean {
  if ('heroe' in quien || sobra) return true;
  return nivelDeTropa(hero.army[quien.indice]?.veterania) >= 2;
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
 * armería de un hueco si la mejoraría alguien que vale la pena
 * (`paraQuienSeCompra`), tras pagarla queda lo que cuesta un héroe y el héroe no
 * ha llegado hoy a `COMPRAS_POR_HEROE_Y_DIA`. `unitPower` no mira ataque ni defensa, así que el valor de la pieza
 * es una suma propia y no la fuerza de la IA.
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
      const quien = lista.find((p) => mejora(p.equipo, id) > 0 && leLlega(hero, p.quien));
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
      const queda = player.resources.gold - (p.precio.gold ?? 0);
      if (queda < HERO_HIRE_COST) continue;
      if (!canAfford(player.resources, p.precio)) continue;
      // Quien la recibiría es el primero al que mejora, con el MISMO orden con
      // el que se reparte la mochila justo después: si ese no vale la pena, no se
      // compra. Mirar si la mejora «alguien» que vale la pena dejaba comprarla
      // para un veterano y ponérsela después a un novato de más nivel de catálogo.
      const quien = lista.find((x) => mejora(x.equipo, p.id) > 0 && leLlega(hero, x.quien));
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
