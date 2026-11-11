/** Castillos: construcción, moradas y reclutamiento. */

import { hechizosDelGremio } from '../magia/catalogo.js';
import type { Hechizo } from '../magia/formato.js';
import { conMiles, describirCoste } from '../texto.js';
import { type FactionId, NOMBRE_DE_FACCION, type PlayerId, type Point } from '../types.js';
import { unidadDelJuego, unidadDelJuegoSiExiste, unidadesDeMorada } from '../unidad/catalogo.js';
import { enteroDesde } from '../validar.js';
import { building, buildingIfExists, buildingsOfFaction, prebuiltBuildings } from './buildings.js';

/**
 * Una ciudad: sus edificios, sus moradas y sus vecinos. **Ni su dueño ni su
 * guarnición viven aquí** (ciudades y pueblos en su región, 05-11-2026): el dueño
 * se deriva (`dueñoDelSitio`, `state/sitios.ts`: el de su objeto del mapa si está
 * en el muro, el de su región si está dentro) y la guarnición está en
 * `GameState.guarniciones`, como la de un paso o un pueblo, con su propio dueño.
 */
export interface Town {
  readonly id: string;
  readonly name: string;
  readonly faction: FactionId;
  readonly at: Point;
  /** Ids de edificios construidos. */
  buildings: string[];
  /** Ya se construyó hoy: uno por día. */
  builtToday: boolean;
  /** Unidades disponibles para reclutar, por id (`data/unidades.json`). */
  available: Record<string, number>;
  /**
   * Lo que dicen sus vecinos, si el narrador lo ha escrito (`town_voices`). Es
   * presentación: no cambia ninguna regla ni escribe en la crónica, así que el
   * banco no lo ve. Lo escribe solo `ponerVoces` (`voces.ts`) y lo lee `vozDe`;
   * sin él, cada vecino dice sus frases de respaldo.
   */
  voces?: VocesDeLaBase;
}

/** Las líneas narradas de los vecinos de una base, con la firma de cuándo se pidieron. */
interface VocesDeLaBase {
  /** `firmaDeVoces` del momento: la semana y los sitios levantados. */
  readonly firma: string;
  /** Por id de vecino (`vecinosDeLaBase`), de 1 a 3 líneas. */
  readonly lineas: Readonly<Record<string, readonly string[]>>;
}

export function createTown(id: string, name: string, faction: FactionId, at: Point): Town {
  return {
    id,
    name,
    faction,
    at,
    buildings: prebuiltBuildings(faction),
    builtToday: false,
    available: {},
  };
}

/**
 * La base de un jugador en una lista de ciudades con dueño (las del plan, o los
 * objetos `town` del mapa): **la primera suya**. Es la regla de siempre
 * (`createGame` la usaba a pelo) y la leen dos: la partida, para apuntar
 * `Player.base`, y `buildMap`, para guarnecerla al nacer. Escrita dos veces, un
 * plan con dos ciudades de un mismo dueño podía guarnecer una y declarar base la
 * otra sin que nadie lo notara.
 */
export function primeraCiudadDe<T extends { readonly owner: PlayerId | null }>(
  towns: readonly T[],
  player: PlayerId,
): T | undefined {
  return towns.find((t) => t.owner === player);
}

export function hasBuilding(town: Town, id: string): boolean {
  return town.buildings.includes(id);
}

/** Oro por día que genera el pueblo (se queda con el ayuntamiento mejor). */
export function dailyIncome(town: Town): number {
  let best = 0;
  for (const id of town.buildings) {
    const b = building(id);
    if (b.income !== undefined && b.income > best) best = b.income;
  }
  return best;
}

/**
 * Si el pueblo tiene armería: algún edificio con `sellsEquipment`. Se pregunta
 * al catálogo por el rasgo, como el gremio, y no por el id `armory`.
 */
export function tieneArmeria(town: Town): boolean {
  return town.buildings.some((id) => building(id).sellsEquipment === true);
}

export function mageGuildLevel(town: Town): number {
  let level = 0;
  for (const id of town.buildings) {
    const b = building(id);
    if (b.mageGuildLevel !== undefined && b.mageGuildLevel > level) level = b.mageGuildLevel;
  }
  return level;
}

/**
 * Los hechizos que enseña el gremio de este pueblo, ordenados por nivel: los de su
 * facción (`Town.faction`, 08-11-2026; `hechizosDelGremio`).
 *
 * Se DERIVAN del nivel del gremio, no se guardan: con tres hechizos de nivel 1
 * y ninguno de nivel 2 para los huecos que hay no queda nada que sortear, así que
 * un `Town.spellBook` sería estado nuevo, serialización nueva y una segunda
 * fuente de verdad para una decisión que no existe. El día que #26 traiga
 * contenido de sobra, el sorteo se rellena DENTRO de esta función: la firma es
 * la que ven el panel, el contrato (`contract/aventura.ts`) y el aprendizaje, así que ninguno se
 * entera. Sin tirada, el `createRng` de `CLAUDE.md` no aplica todavía.
 */
export function townSpells(town: Town): readonly Hechizo[] {
  return hechizosDelGremio(mageGuildLevel(town), [town.faction]);
}

export function moraleFromBuildings(town: Town): number {
  return town.buildings.reduce((n, id) => n + (building(id).moraleBonus ?? 0), 0);
}

/**
 * Por qué no alcanza el oro para pagar `coste`, con lo que cuesta y lo que hay,
 * o `null` si alcanza: la única frase de todo lo que se paga (construir,
 * reclutar, comprar en la armería y contratar un héroe).
 */
export function oroBlocker(coste: number, oro: number): string | null {
  return oro >= coste
    ? null
    : `no alcanza el oro: cuesta ${describirCoste(coste)} y tienes ${conMiles(oro)} oro`;
}

/** Motivo por el que no se puede construir, o `null` si sí se puede. */
export function buildBlocker(town: Town, buildingId: string, oro: number): string | null {
  const b = buildingIfExists(buildingId);
  // Un id que no existe o que es de la otra facción no es una excepción: es
  // alguien —el agente, un cliente viejo— preguntando, y merece un motivo.
  if (b === null) return `no existe el edificio "${buildingId}"`;
  if (b.faction !== undefined && b.faction !== town.faction) {
    return `"${b.name}" no es un edificio de esta facción`;
  }

  if (hasBuilding(town, buildingId)) return 'ya está construido';
  if (town.builtToday) return 'ya se ha construido hoy en este pueblo';

  for (const req of b.requires ?? []) {
    if (!hasBuilding(town, req)) return `falta construir "${building(req).name}"`;
  }
  return oroBlocker(b.cost, oro);
}

function canBuild(town: Town, buildingId: string, oro: number): boolean {
  return buildBlocker(town, buildingId, oro) === null;
}

/** Construye y devuelve el oro que queda. Lanza si no era posible. */
export function build(town: Town, buildingId: string, oro: number): number {
  // El mensaje lo lee una persona: va el nombre del edificio, no su id. Con un
  // id inventado no hay nombre que poner, así que ese caso se separa antes de
  // preguntar por el resto de motivos.
  const b = buildingIfExists(buildingId);
  if (b === null) throw new Error(`no se puede construir: no existe el edificio "${buildingId}"`);

  const blocker = buildBlocker(town, buildingId, oro);
  if (blocker !== null) throw new Error(`no se puede construir ${b.name}: ${blocker}`);

  town.buildings = [...town.buildings, buildingId];
  town.builtToday = true;

  // Una morada recién construida trae ya su primera hornada, de cada unidad que
  // produce.
  if (b.morada !== undefined) {
    for (const u of unidadesDeMorada(b.id)) {
      town.available[u.id] = (town.available[u.id] ?? 0) + u.growth;
    }
  }

  return oro - b.cost;
}

/**
 * Las unidades que se reclutan en el castillo: las de cada morada construida, en
 * el orden de los sitios de la base y, dentro de una morada, en el del catálogo.
 * Una morada produce varias (19-10-2026: «el edificio no implica nivel»).
 */
export function dwellings(
  town: Town,
): { readonly edificio: string; readonly morada: number; readonly creature: string }[] {
  return town.buildings
    .map((id) => building(id))
    .filter((b) => b.morada !== undefined)
    .sort((a, b) => (a.morada as number) - (b.morada as number))
    .flatMap((b) =>
      unidadesDeMorada(b.id).map((u) => ({
        edificio: b.id,
        morada: b.morada as number,
        creature: u.id,
      })),
    );
}

/** El lunes cada morada suelta su crecimiento semanal. */
export function applyWeeklyGrowth(town: Town, multiplier = 1): void {
  for (const { creature: id } of dwellings(town)) {
    town.available[id] = (town.available[id] ?? 0) + unidadDelJuego(id).growth * multiplier;
  }
}

/** Lo que cuestan `count` de `creatureId`, en oro. */
export function recruitCost(creatureId: string, count: number): number {
  return unidadDelJuego(creatureId).oro * count;
}

/**
 * Motivo por el que no se puede reclutar, o `null`. Un `count` que no es un entero
 * seguro de 1 en adelante, el primero (11-11-2026, #317): el zod del agente ya no
 * lo filtra («Forma y valor», `docs/areas/agente.md`), y con `count <= 0` a secas
 * un 1,5 se reclutaba. Después, por este orden: la criatura no existe, el pueblo
 * no la ofrece (no tiene su morada, que puede ser de otra facción), no hay
 * bastantes y el oro.
 */
export function recruitBlocker(
  town: Town,
  creatureId: string,
  count: number,
  oro: number,
): string | null {
  if (!enteroDesde(count, 1)) return `son individuos: se reclutan de 1 en adelante, no ${count}`;
  // Lo que el pueblo no ofrece, antes que lo que no tiene: «solo hay 0
  // disponibles» con un id inventado o con una criatura de otra facción le
  // decía al agente que esperase al lunes (#340, 11-11-2026). La persona no
  // llega aquí: la morada solo le ofrece lo de `dwellings`.
  const u = unidadDelJuegoSiExiste(creatureId);
  if (u === null) return `no hay ninguna criatura "${creatureId}" en el juego`;
  if (!dwellings(town).some((d) => d.creature === creatureId)) {
    if (u.edificio === null) return `"${creatureId}" no se recluta en ningún pueblo`;
    const morada = building(u.edificio);
    const ajena =
      morada.faction !== undefined && morada.faction !== town.faction
        ? `, que es de los ${NOMBRE_DE_FACCION[morada.faction]}`
        : '';
    // Con el id de la morada, que es lo que escribe quien la construye: su
    // nombre solo («Pueblo») no dice cuál.
    return `${town.name} no ofrece "${creatureId}": no tiene su morada, ${morada.name} ("${morada.id}")${ajena}`;
  }
  const available = town.available[creatureId] ?? 0;
  if (available < count) return `solo hay ${available} disponibles`;
  return oroBlocker(recruitCost(creatureId, count), oro);
}

/** Descuenta lo reclutado del pueblo. Devuelve el oro que queda. */
export function payRecruit(town: Town, creatureId: string, count: number, oro: number): number {
  const blocker = recruitBlocker(town, creatureId, count, oro);
  if (blocker !== null) throw new Error(`no se puede reclutar: ${blocker}`);
  town.available[creatureId] = (town.available[creatureId] ?? 0) - count;
  return oro - recruitCost(creatureId, count);
}

/** Edificios que se podrían construir hoy en este pueblo. */
export function availableBuildings(town: Town, oro: number): string[] {
  return buildingsOfFaction(town.faction)
    .filter((b) => canBuild(town, b.id, oro))
    .map((b) => b.id);
}
