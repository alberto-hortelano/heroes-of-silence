/**
 * Los sitios de una base: dónde se levanta cada edificio, sin geometría.
 *
 * Una base tiene doce sitios fijos —seis de villa y seis moradas— y cada uno
 * lleva una CADENA de mejora: el ayuntamiento se hace casa consistorial y luego
 * palacio en el mismo sitio, la morada de nivel 2 se mejora donde está. Dónde cae
 * cada sitio en el fondo de la escena es presentación y vive en
 * `data/bases/<facción>.json`, que este módulo no lee (lo vigila
 * `invariantes.test.ts`): aquí solo está qué se levanta en cada uno, que lo leen
 * el panel de «Ampliar», la validación de las voces y el agente.
 *
 * Vivía en el cliente (`render/town.ts`, `townPlots`) con sus coordenadas de un
 * cuadro de 1024×576; con la base como escena las coordenadas se fueron a los
 * datos y la cadena, que es una regla del catálogo, bajó aquí.
 */
import type { FactionId } from '../types.js';
import { type Building, buildingsOfFaction } from './buildings.js';
import { hasBuilding, type Town } from './town.js';

/** Los doce sitios, en el orden en que los lee el panel de «Ampliar». */
export const SITIOS = [
  'hall',
  'fort',
  'guild',
  'tavern',
  'market',
  'armory',
  'lvl1',
  'lvl2',
  'lvl3',
  'lvl4',
  'lvl5',
  'lvl6',
] as const;
export type SitioId = (typeof SITIOS)[number];

export function esSitio(x: string): x is SitioId {
  return (SITIOS as readonly string[]).includes(x);
}

export interface Sitio {
  readonly id: SitioId;
  /** Los edificios que se levantan aquí, en orden de mejora. */
  readonly cadena: readonly string[];
  /** Nivel de morada, si este sitio cría criaturas. */
  readonly nivel?: number;
}

/**
 * La cadena de cada sitio para una facción.
 *
 * Las del gremio, la armería y las moradas se DERIVAN del catálogo: el gremio por
 * `mageGuildLevel` en orden de nivel, la armería por `sellsEquipment`, las
 * moradas por `dwellingLevel` y `upgradesLevel`. Escritas a mano eran una trampa
 * esperando —el día que entrara `mage_guild_3`, la IA podría construirlo y la
 * persona no lo vería nunca—; derivadas, el `lvl6` del nigromante sale con un
 * solo eslabón sin que nadie sepa nada del dragón óseo.
 */
export function sitiosDeLaBase(faccion: FactionId): readonly Sitio[] {
  const propios = buildingsOfFaction(faccion);
  const ids = (bs: readonly Building[]): string[] => bs.map((b) => b.id);
  const gremio = propios
    .filter((b) => b.mageGuildLevel !== undefined)
    .slice()
    .sort((a, b) => (a.mageGuildLevel ?? 0) - (b.mageGuildLevel ?? 0));
  const morada = (nivel: number): string[] =>
    ids([
      ...propios.filter((b) => b.dwellingLevel === nivel),
      ...propios.filter((b) => b.upgradesLevel === nivel),
    ]);

  return [
    { id: 'hall', cadena: ['village_hall', 'town_hall', 'city_hall'] },
    { id: 'fort', cadena: ['castle'] },
    { id: 'guild', cadena: ids(gremio) },
    { id: 'tavern', cadena: ['tavern'] },
    { id: 'market', cadena: ['marketplace'] },
    { id: 'armory', cadena: ids(propios.filter((b) => b.sellsEquipment === true)) },
    ...([1, 2, 3, 4, 5, 6] as const).map((n) => ({
      id: `lvl${n}` as SitioId,
      cadena: morada(n),
      nivel: n,
    })),
  ];
}

export function sitioDe(faccion: FactionId, id: SitioId): Sitio {
  const s = sitiosDeLaBase(faccion).find((x) => x.id === id);
  if (s === undefined) throw new Error(`la base de ${faccion} no tiene el sitio "${id}"`);
  return s;
}

/** El sitio donde se levanta `buildingId`; lanza si ninguno lo lleva. */
export function sitioDeEdificio(faccion: FactionId, buildingId: string): Sitio {
  const s = sitiosDeLaBase(faccion).find((x) => x.cadena.includes(buildingId));
  if (s === undefined) {
    throw new Error(`"${buildingId}" no se levanta en ningún sitio de una base de ${faccion}`);
  }
  return s;
}

/** El eslabón construido más avanzado del sitio, o `null` si está vacío. */
export function construidoEn(town: Town, sitio: SitioId): string | null {
  let hecho: string | null = null;
  for (const id of sitioDe(town.faction, sitio).cadena) if (hasBuilding(town, id)) hecho = id;
  return hecho;
}

/** El siguiente eslabón por construir del sitio, o `null` si está completo. */
export function siguienteDe(town: Town, sitio: SitioId): string | null {
  return sitioDe(town.faction, sitio).cadena.find((id) => !hasBuilding(town, id)) ?? null;
}

/** Los sitios con algo construido, en el orden de `SITIOS`. */
export function sitiosConstruidos(town: Town): readonly SitioId[] {
  return SITIOS.filter((s) => construidoEn(town, s) !== null);
}

/**
 * Si el sitio abre «Ampliar» —la lista de lo que se puede levantar en toda la
 * base— en vez de lo suyo: el ayuntamiento y el castillo, que mandan en la base.
 */
export function abreAmpliar(sitio: SitioId): boolean {
  return sitio === 'hall' || sitio === 'fort';
}
