/** Catálogo de edificios del castillo. */
import buildingsJson from '../../../data/buildings.json' with { type: 'json' };
import { UNIDADES, unidadesDeMorada } from '../catalogo.js';
import { ECONOMIA } from '../data.js';
import { nivelDeUnidad } from '../nivel.js';
import type { FactionId, Resources } from '../types.js';
import { FACTION_IDS } from '../types.js';
import type { Unidad } from '../unidad.js';
import { entero, objetoCon, texto } from '../validar.js';

export interface Building {
  readonly id: string;
  readonly name: string;
  /**
   * Facción a la que pertenece, si es propio de una.
   * Los edificios de villa (ayuntamiento, castillo, gremio…) no la llevan:
   * son los mismos para todo el mundo. Las moradas sí, y su id empieza por ella.
   */
  readonly faction?: FactionId;
  /**
   * Lo que cuesta. El de una morada **no se escribe**: sale del nivel de lo mejor
   * que produce (`nivelDeMorada`) por la tabla de `data/economia.json`.
   */
  readonly cost: Partial<Resources>;
  /** Oro por día que aporta (solo los ayuntamientos). */
  readonly income?: number;
  /** Ya está construido al fundar el pueblo. */
  readonly prebuilt?: boolean;
  readonly requires?: readonly string[];
  /**
   * Si es una morada, el sitio que ocupa en la base (1 a 6, el `lvlN` de
   * `sitiosDeLaBase`). **No es un nivel** (decisión del usuario, 19-10-2026: «el
   * edificio no implica nivel»): qué produce lo dice cada unidad
   * (`Unidad.edificio`, `unidadesDeMorada`), y una morada produce varias.
   */
  readonly morada?: number;
  readonly mageGuildLevel?: number;
  readonly grantsWalls?: boolean;
  readonly moraleBonus?: number;
  /**
   * Vende las piezas que se venden (`seVende`, `hero/equipo.ts`) al héroe propio que
   * esté dentro. Es la armería, que pidió el usuario («Edificio Armería en la
   * ciudad»); su coste es inventado y lo dice el `_comment` del JSON.
   */
  readonly sellsEquipment?: boolean;
}

/** Los sitios de morada de una base: del 1 al 6 (`lvl1`… `lvl6`). */
export const SITIOS_DE_MORADA = 6;

/**
 * El nivel de una morada: el de lo mejor que produce (`nivelDeUnidad`, con el
 * equipo puesto). De él sale su coste. Una morada sin ninguna unidad no existe
 * (lo comprueba la carga).
 */
function nivelDeLasUnidades(edificio: string): number {
  return Math.max(0, ...unidadesDeMorada(edificio).map((u) => nivelDeUnidad(u)));
}

/** El nivel de la morada `b`: el de lo mejor que produce. Lanza si no es una morada. */
export function nivelDeMorada(b: Building): number {
  if (b.morada === undefined) throw new Error(`«${b.name}» no es una morada: no tiene nivel`);
  return nivelDeLasUnidades(b.id);
}

/**
 * Los campos que admite un edificio de `data/buildings.json`: uno ajeno —uno de
 * antes, como `dwellingLevel` o `upgradesLevel`, o uno mal escrito— tumba la carga
 * diciendo cuál, en vez de quedarse sin leer.
 */
const CAMPOS_DE_EDIFICIO: readonly string[] = [
  'id',
  'name',
  'cost',
  'faction',
  'income',
  'prebuilt',
  'requires',
  'morada',
  'mageGuildLevel',
  'grantsWalls',
  'moraleBonus',
  'sellsEquipment',
];

const byId = new Map<string, Building>();
for (const [i, crudo] of (buildingsJson.buildings as readonly unknown[]).entries()) {
  const raw = objetoCon(crudo, CAMPOS_DE_EDIFICIO, `data/buildings.json: el edificio ${i + 1}`);
  const id = texto(raw.id, 'el id', `data/buildings.json: el edificio ${i + 1}`);
  const quien = `data/buildings.json: «${id}»`;
  const morada = 'morada' in raw ? entero(raw.morada, 'la morada', quien, 1) : undefined;
  if (morada !== undefined && 'cost' in raw) {
    throw new Error(
      `${quien}: es una morada y trae su coste escrito; el de una morada sale de lo que produce (data/economia.json)`,
    );
  }
  const cost =
    morada === undefined
      ? (raw.cost as Partial<Resources>)
      : (ECONOMIA.costeDeLaMorada[nivelDeLasUnidades(id) - 1] ?? {});
  byId.set(id, {
    id,
    name: texto(raw.name, 'el nombre', quien),
    cost,
    ...('faction' in raw ? { faction: raw.faction as FactionId } : {}),
    ...('income' in raw ? { income: raw.income as number } : {}),
    ...('prebuilt' in raw ? { prebuilt: raw.prebuilt as boolean } : {}),
    ...('requires' in raw ? { requires: raw.requires as readonly string[] } : {}),
    ...(morada === undefined ? {} : { morada }),
    ...('mageGuildLevel' in raw ? { mageGuildLevel: raw.mageGuildLevel as number } : {}),
    ...('grantsWalls' in raw ? { grantsWalls: raw.grantsWalls as boolean } : {}),
    ...('moraleBonus' in raw ? { moraleBonus: raw.moraleBonus as number } : {}),
    ...('sellsEquipment' in raw ? { sellsEquipment: raw.sellsEquipment as boolean } : {}),
  });
}

/**
 * Por qué el catálogo de unidades `unidades` y el de edificios no casan, o
 * `null`: cada unidad con `edificio` nombra una morada de su facción que existe,
 * y cada morada produce alguna unidad, de su facción y en un sitio de la base
 * (1 a 6) que no repite otra. **Lo que la carga del juego exige** a los dos juntos;
 * lo lee también «Guardar» de la arena (`tools/arena/borrador.ts`), para no
 * escribir un catálogo con el que la partida no arrancaría. Aquí y no en
 * `unidad.ts` porque desde allí leer los edificios cerraría un ciclo.
 */
export function moradasBlocker(unidades: readonly Unidad[]): string | null {
  for (const u of unidades) {
    if (u.edificio === undefined) continue;
    const b = byId.get(u.edificio);
    if (b === undefined || b.morada === undefined) {
      return `la unidad «${u.name}» sale de «${u.edificio}», que no es ninguna morada de data/buildings.json`;
    }
    if (b.faction !== u.faction) {
      return `la unidad «${u.name}» es de ${u.faction} y sale de «${b.name}», una morada de ${b.faction ?? 'villa'}`;
    }
  }
  for (const f of FACTION_IDS) {
    const sitios = new Set<number>();
    for (const b of byId.values()) {
      if (b.faction !== f || b.morada === undefined) continue;
      if (!Number.isSafeInteger(b.morada) || b.morada < 1 || b.morada > SITIOS_DE_MORADA) {
        return `la morada «${b.name}» (${b.id}) va en el sitio ${b.morada} y los de una base van del 1 al ${SITIOS_DE_MORADA}`;
      }
      if (sitios.has(b.morada)) {
        return `dos moradas de ${f} van en el sitio ${b.morada} de la base`;
      }
      sitios.add(b.morada);
      if (!unidades.some((u) => u.edificio === b.id)) {
        return `la morada «${b.name}» (${b.id}) no produce ninguna unidad de data/unidades.json`;
      }
    }
    if (sitios.size === 0) return `${f} no tiene ninguna morada en data/buildings.json`;
  }
  return null;
}

{
  const motivo = moradasBlocker(UNIDADES);
  if (motivo !== null) throw new Error(`data/buildings.json y data/unidades.json: ${motivo}`);
}

export function building(id: string): Building {
  const found = buildingIfExists(id);
  if (found === null) throw new Error(`edificio desconocido: "${id}"`);
  return found;
}

/**
 * Como `building`, pero devuelve `null` en vez de lanzar.
 *
 * Lo usa `buildBlocker`: a un id inventado —del agente, de un cliente viejo—
 * hay que darle un motivo escrito, no una excepción a mitad de turno.
 */
export function buildingIfExists(id: string): Building | null {
  return byId.get(id) ?? null;
}

export function allBuildings(): readonly Building[] {
  return [...byId.values()];
}

/** Los que puede levantar esa facción: los de villa más los suyos. */
export function buildingsOfFaction(faction: FactionId): readonly Building[] {
  return allBuildings().filter((b) => b.faction === undefined || b.faction === faction);
}

export function prebuiltBuildings(faction: FactionId): string[] {
  return buildingsOfFaction(faction)
    .filter((b) => b.prebuilt === true)
    .map((b) => b.id);
}
