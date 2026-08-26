/**
 * IA estratégica de respaldo para el mapa de aventura.
 *
 * Ni planifica a largo plazo ni pretende hacerlo: construye lo que puede,
 * recluta lo que puede y manda a sus héroes al objetivo más rentable que esté
 * a su alcance. Es el listón que el agente tiene que superar.
 */
import { creature } from '../data.js';
import type { Hero } from '../hero/hero.js';
import { type MapObject, pointKey, type Reachable } from '../map/map.js';
import {
  type AdventureAction,
  type GameState,
  HERO_HIRE_COST,
  heroesOf,
  townsOf,
} from '../state/game.js';
import { building } from '../town/buildings.js';
import { availableBuildings, dwellings, recruitBlocker, type Town } from '../town/town.js';
import type { Army, FactionId, PlayerId, Point, Resources } from '../types.js';
import { canAfford, scaleResources, subtractResources } from '../types.js';

/** Fuerza bruta de un ejército: lo que pega por lo que aguanta. */
export function armyPower(army: Army): number {
  let power = 0;
  for (const stack of army) {
    if (stack === null) continue;
    const info = creature(stack.creature);
    const dmg = (info.damage[0] + info.damage[1]) / 2;
    power += dmg * info.hp * stack.count;
  }
  return power;
}

/** Cuánto vale la pena ir a por este objeto del mapa. */
function objectValue(state: GameState, obj: MapObject, hero: Hero): number {
  const player = hero.owner;
  switch (obj.kind) {
    case 'resource':
      return obj.taken ? 0 : obj.resource === 'gold' ? obj.amount : obj.amount * 120;
    case 'chest':
      return obj.taken ? 0 : obj.gold;
    case 'mine':
      return obj.owner === player ? 0 : obj.resource === 'gold' ? 6000 : 3000;
    case 'town': {
      // El dueño se lee del LIBRO DE CUENTAS y no de la bandera del mapa. Son
      // dos caras del mismo hecho y `captureTown` las escribe juntas, pero
      // quien decide a dónde ir no tiene por qué depender de que sigan al día:
      // la bandera es lo que se VE —y lo que recuerda la niebla—, y esta
      // decisión es de reglas.
      const pueblo = state.towns.find((t) => t.id === obj.id);
      if (pueblo === undefined) throw new Error(`el mapa tiene un castillo sin datos: ${obj.id}`);
      if (pueblo.owner === player) {
        // Pueblo propio: merece el viaje si guarda tropas. Concentrar el
        // ejército en un héroe es lo que decide las partidas.
        return armyPower(pueblo.garrison) / 10;
      }
      // Un pueblo con guarnición es una batalla: se mide antes de ir.
      const guarnicion = armyPower(pueblo.garrison);
      if (guarnicion > 0 && armyPower(hero.army) < guarnicion * 1.1) return -1;
      return 40000;
    }
    case 'monster': {
      if (obj.defeated) return 0;
      const suyo = armyPower([
        { creature: obj.creature, count: obj.count },
        null,
        null,
        null,
        null,
      ]);
      const mio = armyPower(hero.army);
      // Solo se ataca con ventaja clara: un prototipo que se suicida no se puede probar.
      return mio > suyo * 1.6 ? 2000 : -1;
    }
  }
}

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
 */
export function chooseHeroDestination(
  state: GameState,
  hero: Hero,
  alcance: Reachable,
): Point | null {
  let mejor: { at: Point; score: number } | null = null;

  const costeHasta = (p: Point): number | null => {
    const c = alcance.costs.get(pointKey(p));
    return c === undefined || c === 0 ? null : c;
  };

  for (const obj of state.map.objects) {
    const valor = objectValue(state, obj, hero);
    if (valor <= 0) continue;

    const coste = costeHasta(obj.at);
    if (coste === null) continue;

    // Rentabilidad por punto de movimiento gastado.
    const score = valor / Math.max(1, coste);
    if (mejor === null || score > mejor.score) mejor = { at: obj.at, score };
  }

  // Héroe enemigo a tiro. Un héroe sin tropas no persigue a nadie.
  //
  // El margen es ajustado a propósito: con un 1,4 los dos bandos se esquivaban
  // eternamente en cuanto sus ejércitos se parecían, y la partida no terminaba
  // nunca. Atacar da la iniciativa, así que una ventaja pequeña ya compensa.
  const miPoder = armyPower(hero.army);
  for (const enemigo of state.heroes) {
    if (enemigo.owner === hero.owner) continue;
    if (miPoder <= 0) break;
    const coste = costeHasta(enemigo.at);
    if (coste === null) continue;
    if (miPoder < armyPower(enemigo.army) * 1.05) continue;
    const score = 60000 / Math.max(1, coste);
    if (mejor === null || score > mejor.score) mejor = { at: enemigo.at, score };
  }

  // Defender la casa: si un enemigo ronda mi último pueblo y está peor
  // guarnecido que él, más vale volver que seguir de excursión.
  const mios = townsOf(state, hero.owner);
  if (mios.length <= 1) {
    for (const pueblo of mios) {
      const amenaza = state.heroes.some(
        (h) => h.owner !== hero.owner && distanciaAprox(h.at, pueblo.at) <= 6,
      );
      if (!amenaza) continue;
      const coste = costeHasta(pueblo.at);
      if (coste === null) continue;
      const score = 80000 / Math.max(1, coste);
      if (mejor === null || score > mejor.score) mejor = { at: pueblo.at, score };
    }
  }

  return mejor?.at ?? null;
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
  let at = destino;
  let coste = alcance.costs.get(pointKey(destino));
  if (coste === undefined || coste === 0) return null;

  while (coste > hero.movePoints) {
    const anterior = alcance.prev.get(pointKey(at));
    if (anterior === undefined) return null;
    at = anterior;
    const c = alcance.costs.get(pointKey(at));
    if (c === undefined) throw new Error(`el alcance no sabe qué cuesta (${at.x},${at.y})`);
    coste = c;
  }

  // Coste 0 es el origen y solo el origen: se retrocedió el camino entero.
  return coste === 0 ? null : at;
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
    const heroeAqui = heroesOf(state, playerId).find((h) => pointKey(h.at) === pointKey(town.at));
    const destino = heroeAqui?.army ?? town.garrison;
    let huecos = destino.filter((s) => s === null).length;
    const yaPresentes = new Set(destino.filter((s) => s !== null).map((s) => s!.creature));

    for (const { creature: id } of [...dwellings(town)].reverse()) {
      const disponibles = town.available[id] ?? 0;
      if (disponibles <= 0) continue;
      if (!yaPresentes.has(id) && huecos <= 0) continue;

      // Cuántos caben en el bolsillo.
      const coste = creature(id).cost;
      let cantidad = disponibles;
      while (cantidad > 0 && !canAfford(purse, scaleResources(coste, cantidad))) cantidad--;
      if (cantidad <= 0) continue;
      if (recruitBlocker(town, id, cantidad, purse) !== null) continue;

      acciones.push({ type: 'recruit', town: town.id, creature: id, count: cantidad });
      purse = subtractResources(purse, scaleResources(coste, cantidad));
      if (!yaPresentes.has(id)) {
        yaPresentes.add(id);
        huecos--;
      }
    }
  }

  return acciones;
}
