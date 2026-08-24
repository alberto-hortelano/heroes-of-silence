/**
 * IA estratégica de respaldo para el mapa de aventura.
 *
 * Ni planifica a largo plazo ni pretende hacerlo: construye lo que puede,
 * recluta lo que puede y manda a sus héroes al objetivo más rentable que esté
 * a su alcance. Es el listón que el agente tiene que superar.
 */
import { creature } from '../data.js';
import type { Hero } from '../hero/hero.js';
import { findPath, pointKey, reachableCosts, type MapObject } from '../map/map.js';
import {
  availableBuildings,
  dwellings,
  hasBuilding,
  recruitBlocker,
  type Town,
} from '../town/town.js';
import { building, buildingsOfFaction } from '../town/buildings.js';
import type { Army, PlayerId, Point, Resources } from '../types.js';
import { canAfford, scaleResources, subtractResources } from '../types.js';
import {
  heroesOf,
  HERO_HIRE_COST,
  townsOf,
  type AdventureAction,
  type GameState,
} from '../state/game.js';

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
      const suyo = armyPower([{ creature: obj.creature, count: obj.count }, null, null, null, null]);
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
 */
export function chooseHeroDestination(state: GameState, hero: Hero): Point | null {
  let mejor: { at: Point; score: number } | null = null;

  // Un solo Dijkstra por turno, sin tope: el objetivo puede estar lejos.
  const costes = reachableCosts(state.map, hero.at, Infinity);
  const costeHasta = (p: Point): number | null => {
    const c = costes.get(pointKey(p));
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
 */
export function stepTowards(state: GameState, hero: Hero, destino: Point): Point | null {
  const camino = findPath(state.map, hero.at, destino);
  if (camino === null || camino.length === 0) return null;

  let ultimo: Point | null = null;
  for (const paso of camino) {
    if (paso.cost > hero.movePoints) break;
    ultimo = paso.at;
  }
  return ultimo;
}

/** Qué construir hoy: lo más caro que se pueda pagar, con las moradas primero. */
export function chooseBuilding(town: Town, purse: Resources): string | null {
  const posibles = availableBuildings(town, purse);
  if (posibles.length === 0) return null;

  // Lo que le falta a alguna morada aún sin levantar. Sin esto la IA nunca
  // construiría el castillo —no da ingreso ni criaturas— y se quedaría
  // atascada para siempre a las puertas de la morada de nivel 6, que lo exige.
  const abrePuerta = new Set<string>();
  for (const b of buildingsOfFaction(town.faction)) {
    if (b.dwellingLevel === undefined || hasBuilding(town, b.id)) continue;
    for (const req of b.requires ?? []) if (!hasBuilding(town, req)) abrePuerta.add(req);
  }

  const prioridad = (id: string): number => {
    const b = building(id);
    if (b.dwellingLevel !== undefined) return 100 + b.dwellingLevel;
    if (abrePuerta.has(id)) return 95;
    if (b.income !== undefined) return 90;
    if (b.upgradesLevel !== undefined) return 50 + b.upgradesLevel;
    if (b.mageGuildLevel !== undefined) return 40;
    return 10;
  };

  return posibles.reduce((a, b) => (prioridad(b) > prioridad(a) ? b : a));
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

  let purse = { ...player.resources };

  // Reclutar de arriba abajo: las criaturas caras rinden más por moneda.
  for (const town of townsOf(state, playerId)) {
    const heroeAqui = heroesOf(state, playerId).find(
      (h) => pointKey(h.at) === pointKey(town.at),
    );
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

/** ¿Le queda algo útil por hacer a este héroe hoy? */
export function heroHasWork(state: GameState, hero: Hero): boolean {
  if (hero.movePoints <= 0) return false;
  const destino = chooseHeroDestination(state, hero);
  return destino !== null && stepTowards(state, hero, destino) !== null;
}
