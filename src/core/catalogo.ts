/**
 * **El catálogo de unidades** de las cinco facciones (`data/unidades.json`): la
 * lista entera, una unidad por hoja de tropa del taller más las que se hayan
 * creado en la arena. Lo edita la arena (`pnpm arena`, «Guardar», por
 * `tools/arena/borrador.ts`) y lo lee esto, sin pasar por `tools/`.
 *
 * **Es el catálogo del juego** (19-10-2026, F3 de
 * `docs/agents/2026-10-18-combate-y-ejercitos-en-el-juego/`): sustituye a
 * `data/creatures.json`, y la partida recluta, guarnece y siembra monstruos de
 * aquí. Lo que una unidad cuesta y crece no se escribe: sale de su índice de
 * poder con el equipo puesto (`data/economia.json`).
 *
 * Se valida entero al cargar con la regla del juego (`leerCatalogos`, la misma
 * con que guarda la arena) y las piezas de `data/equipo.json`: una unidad que no
 * vale tumba la carga diciendo el fichero, cuál y por qué. La arena lo lee más
 * blanda —conserva la que no vale para que se arregle a mano— porque es la
 * herramienta con que se arregla; el juego no puede jugar con una unidad rota.
 */
import ciudadesJson from '../../data/ciudades.json' with { type: 'json' };
import unidadesJson from '../../data/unidades.json' with { type: 'json' };
import {
  crecimientoDelNivel,
  enteroDesde,
  type GrupoDeTropa,
  LIDERAZGO,
  oroDelIndice,
} from './data.js';
import { conEquipo, EQUIPO_DEL_JUEGO } from './hero/equipo.js';
import { cifrasVeteranas, rangoDeTropa } from './hero/experiencia.js';
import { indiceDePoder, nivelDelIndice } from './nivel.js';
import type { Equipo, FactionId, Resources, UnitInfo, Veterania } from './types.js';
import { FACTION_IDS } from './types.js';
import {
  cuerpoDeCombate,
  leerCatalogos,
  RUTA_DEL_CATALOGO_DE_UNIDADES,
  type UnidadDeArena,
} from './unidad.js';

/**
 * Todas las unidades del catálogo, en su orden: el de las hojas del taller y las
 * nuevas detrás. Leídas con lo que el juego exige a los catálogos juntos
 * (`leerCatalogos`: también el equipo base del héroe con las piezas del juego).
 */
export const UNIDADES: readonly UnidadDeArena[] = leerCatalogos(EQUIPO_DEL_JUEGO, unidadesJson);

const POR_ID: ReadonlyMap<string, UnidadDeArena> = new Map(UNIDADES.map((u) => [u.id, u]));

/** La unidad `id` del catálogo; lanza diciendo cuál si no está. */
export function unidad(id: string): UnidadDeArena {
  const u = POR_ID.get(id);
  if (u === undefined) {
    throw new Error(`no hay ninguna unidad «${id}» en ${RUTA_DEL_CATALOGO_DE_UNIDADES}`);
  }
  return u;
}

/**
 * La hoja del taller con que se pinta la unidad `id` (`cuerpo.hoja`), o `null`
 * si `id` no es una unidad del catálogo (el héroe, un personaje, un vecino). Un
 * stack del juego lleva de `body` el id de su unidad, no el de su hoja: una
 * unidad nueva de la arena (`<hoja>-<n>`) se pinta con la hoja de la que nace.
 */
export function hojaDeUnidad(id: string): string | null {
  return POR_ID.get(id)?.cuerpo.hoja ?? null;
}

// ---------------------------------------------------------------- en la partida

/**
 * Una unidad del catálogo como la juega la partida: las cifras con que pelea un
 * novato (su cuerpo con su equipo, `unidadDeCombate`) y lo que la economía
 * necesita, que **no se escribe**: el precio y el crecimiento salen de su índice
 * de poder (`data/economia.json`). Es lo que era la `Creature` de
 * `data/creatures.json`, que se retiró el 19-10-2026.
 */
export interface UnidadDelJuego extends UnitInfo {
  readonly id: string;
  readonly faction: FactionId;
  /** Lo que ocupa un individuo en el liderazgo de quien lo lleva. */
  readonly leadership: number;
  /** La morada que la produce (`data/buildings.json`), o `null` si ninguna. */
  readonly edificio: string | null;
  /** Lo que cuesta reclutar uno: oro, por su índice (`costeDeUnaUnidad`). */
  readonly cost: Partial<Resources>;
  /** Cuántas suelta por semana la morada que la produce, por su nivel. */
  readonly growth: number;
  /** Lo que lleva de serie, el equipo del catálogo: el de un novato. */
  readonly equipoDeSerie: Equipo;
}

function delJuego(u: UnidadDeArena): UnidadDelJuego {
  const vestida = conEquipo(cuerpoDeCombate(u), u.equipo);
  const indice = indiceDePoder(vestida);
  return {
    ...vestida,
    id: u.id,
    faction: u.faction,
    leadership: u.leadership,
    edificio: u.edificio ?? null,
    cost: { gold: oroDelIndice(indice) },
    growth: crecimientoDelNivel(nivelDelIndice(indice)),
    equipoDeSerie: u.equipo,
  };
}

/** Todas las unidades del catálogo como las juega la partida, por id. */
const DEL_JUEGO: ReadonlyMap<string, UnidadDelJuego> = new Map(
  UNIDADES.map((u) => [u.id, delJuego(u)]),
);

/**
 * La unidad `id` como la juega la partida; lanza si no existe: un id de unidad
 * inventado es un bug, no un vacío. **Siempre la misma referencia**: el stack de
 * un novato pisa el tablero con ella, y el espectador la rehace igual.
 */
export function unidadDelJuego(id: string): UnidadDelJuego {
  const u = DEL_JUEGO.get(id);
  if (u === undefined) {
    throw new Error(`no hay ninguna unidad «${id}» en ${RUTA_DEL_CATALOGO_DE_UNIDADES}`);
  }
  return u;
}

/** Como `unidadDelJuego`, o `null` si no existe: para lo que escribe el agente. */
export function unidadDelJuegoSiExiste(id: string): UnidadDelJuego | null {
  return DEL_JUEGO.get(id) ?? null;
}

/** Todas, en el orden del catálogo. */
export function unidadesDelJuego(): readonly UnidadDelJuego[] {
  return [...DEL_JUEGO.values()];
}

/** Las de una facción, en el orden del catálogo. */
export function unidadesDeFaccion(faction: FactionId): readonly UnidadDelJuego[] {
  return unidadesDelJuego().filter((u) => u.faction === faction);
}

/** Las que produce la morada `edificio`, en el orden del catálogo. */
export function unidadesDeMorada(edificio: string): readonly UnidadDelJuego[] {
  return unidadesDelJuego().filter((u) => u.edificio === edificio);
}

/**
 * El equipo que lleva puesto un individuo del catálogo: el de serie de su unidad
 * con lo suyo encima, hueco a hueco (lo que se pone sustituye a lo de serie en
 * ese hueco). La leen `cifrasDeUnidad` y quien pregunta si se puede poner algo
 * (`ponerseBlocker`): las manos se miran con todo lo puesto.
 */
export function equipoPuesto(id: string, propio: Equipo | undefined): Equipo {
  return { ...unidadDelJuego(id).equipoDeSerie, ...propio };
}

/**
 * **Las cifras de un individuo del catálogo**: el cuerpo de su unidad, su
 * veteranía (`cifrasVeteranas`) y su equipo (el de serie con lo suyo encima,
 * `equipoPuesto`), sumado una vez (`conEquipo`, siempre lo último). Es la única
 * regla de «cifras = catálogo + veteranía + equipo», y tiene tres lectores:
 * `troopUnit` —la IA, el agente y el panel—, `resolveUnit` —lo que pisa el
 * tablero— y la inversa del cable del espectador (`espectador/adaptar.ts`).
 *
 * Un novato sin nada propio pelea con **la misma referencia** de
 * `unidadDelJuego`. `veterania` pide la experiencia y el equipo porque es lo
 * único que decide las cifras: por el cable del espectador viaja eso.
 */
export function cifrasDeUnidad(
  id: string,
  veterania: Pick<Veterania, 'experiencia' | 'equipo'> | null | undefined,
): UnitInfo {
  const base = unidadDelJuego(id);
  if (veterania == null) return base;
  const rango = rangoDeTropa(veterania);
  const propio = veterania.equipo;
  if (rango <= 1 && (propio === undefined || Object.keys(propio).length === 0)) return base;
  // Las cifras de un veterano se guardan por SU hoja: la hoja es inmutable
  // —`settleBattle` escribe una nueva al volver de cada batalla— y es de un
  // solo individuo. Sin esto, `armyPower` fabricaba una copia por veterano en
  // cada pregunta de la IA. El id va en la entrada por si alguien diera la
  // misma hoja a dos unidades: entonces se recalcula, no se presta.
  const guardadas = CIFRAS_POR_HOJA.get(veterania);
  if (guardadas !== undefined && guardadas.id === id) return guardadas.cifras;
  const cifras = conEquipo(
    cifrasVeteranas(cuerpoDeCombate(unidad(id)), rango),
    equipoPuesto(id, propio),
  );
  CIFRAS_POR_HOJA.set(veterania, { id, cifras });
  return cifras;
}

/**
 * Las cifras ya calculadas de cada hoja de veterano. Débil, para que una hoja
 * que ya no lleva nadie no se quede en memoria. Una función pura recordada.
 */
const CIFRAS_POR_HOJA = new WeakMap<object, { readonly id: string; readonly cifras: UnitInfo }>();

// ------------------------------------------------------- grupos escritos a mano

/**
 * Lo que impide que unos grupos de tropa formen **un bando**: una unidad que no
 * existe, un número que no es de individuos o más de los que lleva un bando
 * (`maxPorBando`). Vacío: valen. `quien` encabeza cada frase.
 *
 * Una sola comprobación para los sitios donde se escriben grupos a mano: las
 * guarniciones de `data/ciudades.json`, los asaltantes y los monstruos de un plan
 * de mapa (`validateMapPlan`).
 */
export function problemasDeGrupo(grupos: readonly GrupoDeTropa[], quien: string): string[] {
  const problemas: string[] = [];
  let total = 0;
  for (const g of grupos) {
    if (!DEL_JUEGO.has(g.creature)) {
      problemas.push(
        `${quien} es de una unidad que no existe: "${g.creature}". Las que valen: ${[...DEL_JUEGO.keys()].sort().join(', ')}`,
      );
      continue;
    }
    if (!enteroDesde(g.count, 1)) {
      problemas.push(
        `${quien} trae ${g.count} × ${g.creature}: son individuos, tiene que ser un entero de 1 en adelante`,
      );
      continue;
    }
    total += g.count;
  }
  if (problemas.length === 0 && total > LIDERAZGO.maxPorBando) {
    const cuales = grupos.map((g) => `${g.count} × ${g.creature}`).join(' + ');
    problemas.push(`${quien} trae ${cuales} y un bando lleva como mucho ${LIDERAZGO.maxPorBando}`);
  }
  return problemas;
}

/**
 * Lo que impide que unos grupos quepan bajo un tope de liderazgo: lo de
 * `problemasDeGrupo` y, además, que no ocupen más de `tope`. `queEs` nombra a
 * quien tiene el tope en la frase —«una guarnición», «un grupo de
 * asaltantes»—. Un monstruo no tiene tope; una ciudad y un asaltante, sí.
 *
 * La suma no pasa por `armyLeadership` (`hero/troop.ts`) aunque es la misma
 * cuenta: este módulo valida sus tablas AL CARGAR, y `troop.ts` lo importa a
 * él, así que llamarla desde aquí cerraría un ciclo.
 */
export function problemasDeTopeDeLiderazgo(
  grupos: readonly GrupoDeTropa[],
  quien: string,
  tope: number,
  queEs: string,
): string[] {
  const problemas = problemasDeGrupo(grupos, quien);
  if (problemas.length > 0) return problemas;
  let ocupa = 0;
  for (const g of grupos) ocupa += unidadDelJuego(g.creature).leadership * g.count;
  if (ocupa > tope) {
    problemas.push(`${quien} ocupa ${ocupa} de liderazgo y ${queEs} lleva como mucho ${tope}`);
  }
  return problemas;
}

/**
 * Lee una tabla de guarniciones de `data/ciudades.json`, una por facción, cada
 * una de unidades de su facción.
 *
 * Se valida al cargar y no al usarla: una unidad mal escrita o de otra facción,
 * una guarnición de más de `maxPorBando` individuos o de más liderazgo que el de
 * guarnición revientan aquí con el nombre del fichero, en vez de en la primera
 * batalla contra esa ciudad, con la partida ya en marcha.
 */
function tablaDeGuarniciones(
  clave: 'guarnicionNeutral' | 'guarnicionBase',
  que: string,
): Readonly<Record<FactionId, readonly GrupoDeTropa[]>> {
  const tabla = ciudadesJson[clave] as Record<string, readonly GrupoDeTropa[]> | undefined;
  if (tabla === undefined) throw new Error(`data/ciudades.json: falta "${clave}"`);
  const out = {} as Record<FactionId, readonly GrupoDeTropa[]>;
  for (const faccion of FACTION_IDS) {
    const grupos = tabla[faccion];
    if (grupos === undefined) {
      throw new Error(`data/ciudades.json: falta ${que} de ${faccion}`);
    }
    const quien = `data/ciudades.json: ${que} de ${faccion}`;
    const problemas = problemasDeTopeDeLiderazgo(
      grupos,
      quien,
      LIDERAZGO.guarnicion,
      'una guarnición',
    );
    for (const g of problemas.length === 0 ? grupos : []) {
      const f = unidadDelJuego(g.creature).faction;
      if (f !== faccion) problemas.push(`${quien} lleva «${g.creature}», que es de ${f}`);
    }
    if (problemas.length > 0) throw new Error(problemas.join('; '));
    out[faccion] = grupos;
  }
  const ajena = Object.keys(tabla).find((f) => !(FACTION_IDS as readonly string[]).includes(f));
  if (ajena !== undefined) {
    throw new Error(
      `data/ciudades.json: ${que} de «${ajena}», que no es ninguna facción del juego`,
    );
  }
  return out;
}

/**
 * La guarnición con la que nace una ciudad **neutral**, por su facción.
 * **Inventada y provisional**: la fijó el usuario como regla («nacen CON
 * guarnición») y no como cifra.
 */
const GUARNICION_NEUTRAL = tablaDeGuarniciones('guarnicionNeutral', 'la guarnición neutral');

/**
 * La guarnición con la que nace la **base** de cada jugador, de la facción de su
 * dueño. **Inventada y provisional**, igual que la neutral.
 */
const GUARNICION_DE_BASE = tablaDeGuarniciones('guarnicionBase', 'la guarnición de la base');

export function guarnicionNeutral(faction: FactionId): readonly GrupoDeTropa[] {
  return GUARNICION_NEUTRAL[faction];
}

export function guarnicionDeBase(faction: FactionId): readonly GrupoDeTropa[] {
  return GUARNICION_DE_BASE[faction];
}
