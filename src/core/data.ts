/** Catálogo de criaturas: carga `data/creatures.json` y lo tipa. */
import asaltantesJson from '../../data/asaltantes.json' with { type: 'json' };
import ciudadesJson from '../../data/ciudades.json' with { type: 'json' };
import creaturesJson from '../../data/creatures.json' with { type: 'json' };
import experienciaJson from '../../data/experiencia.json' with { type: 'json' };
import habilidadesJson from '../../data/habilidades.json' with { type: 'json' };
import heroeJson from '../../data/heroe.json' with { type: 'json' };
import liderazgoJson from '../../data/liderazgo.json' with { type: 'json' };
import type { Creature, CreatureTrait, FactionId, SpeedTier, UnitInfo } from './types.js';
import { SPEED_TIERS } from './types.js';

const byId = new Map<string, Creature>();

for (const raw of creaturesJson.creatures) {
  const creature: Creature = {
    id: raw.id,
    faction: raw.faction as FactionId,
    level: raw.level,
    leadership: raw.leadership,
    name: raw.name,
    attack: raw.attack,
    defense: raw.defense,
    damage: [raw.damage[0] as number, raw.damage[1] as number],
    hp: raw.hp,
    speed: raw.speed as SpeedTier,
    // Quien recibe un golpe de una criatura del catálogo lo recibe con el nivel
    // de su morada (`UnitInfo.nivel`).
    nivel: raw.level,
    growth: raw.growth,
    cost: raw.cost,
    ...('shots' in raw ? { shots: raw.shots as number } : {}),
    ...('hexes' in raw ? { hexes: raw.hexes as number } : {}),
    ...('traits' in raw ? { traits: raw.traits as readonly CreatureTrait[] } : {}),
    ...('upgradesTo' in raw ? { upgradesTo: raw.upgradesTo as string } : {}),
  };
  byId.set(creature.id, creature);
}

/**
 * Un entero que se puede sumar sin perder bits, y ≥ `desde`. Es la única forma
 * en que este módulo pregunta «¿es un entero válido?» a lo que lee de un JSON:
 * los grupos de tropa, las reglas de los asaltantes y las de la experiencia.
 * `isSafeInteger` y no `isInteger`, por lo mismo que `entorno.ts`: `1e21` es
 * entero y no se puede sumar.
 */
function enteroDesde(v: unknown, desde: number): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= desde;
}

/** Lanza si el id no existe: un id de criatura inventado es un bug, no un vacío. */
export function creature(id: string): Creature {
  const found = byId.get(id);
  if (found === undefined) throw new Error(`criatura desconocida: "${id}"`);
  return found;
}

export function allCreatures(): readonly Creature[] {
  return [...byId.values()];
}

/** Las 6 criaturas base de una facción, de nivel 1 a 6 (sin mejoras). */
export function factionLineup(faction: FactionId): readonly Creature[] {
  const upgrades = new Set(
    allCreatures()
      .map((c) => c.upgradesTo)
      .filter((id): id is string => id !== undefined),
  );
  return allCreatures()
    .filter((c) => c.faction === faction && !upgrades.has(c.id))
    .sort((a, b) => a.level - b.level);
}

export function hasTrait(c: UnitInfo, trait: CreatureTrait): boolean {
  return c.traits?.includes(trait) ?? false;
}

export function isShooter(c: UnitInfo): boolean {
  return (c.shots ?? 0) > 0;
}

export function hexSize(c: UnitInfo): number {
  return c.hexes ?? 1;
}

/**
 * Las reglas del liderazgo, de `data/liderazgo.json`. **Provisionales**: las
 * cifras las define el usuario cuando cierre la economía, y por eso viven en
 * datos y no en el código.
 */
export interface ReglasDeLiderazgo {
  /** Tope de un héroe: `base + porNivel × (nivel − 1)`, sin pasar de `max`. */
  readonly heroe: { readonly base: number; readonly porNivel: number; readonly max: number };
  /** Tope de la tropa que guarda un castillo sin héroe. */
  readonly guarnicion: number;
  /** Lo que ocupa un personaje (`Troop.member`), que no está en el catálogo. */
  readonly personaje: number;
  /**
   * Cuántos individuos pisan el tablero por bando, como mucho: un héroe es él
   * más `maxPorBando − 1` de tropa; un monstruo o una guarnición, `maxPorBando`.
   */
  readonly maxPorBando: number;
}

export const LIDERAZGO: ReglasDeLiderazgo = {
  heroe: { ...liderazgoJson.heroe },
  guarnicion: liderazgoJson.guarnicion,
  personaje: liderazgoJson.personaje,
  maxPorBando: liderazgoJson.maxPorBando,
};

/**
 * El héroe como figura del tablero y el precio de rendirse, de
 * `data/heroe.json`. **Inventado y provisional**, y así lo dice su `_comment`:
 * en fheroes2 el héroe no pisa el tablero, así que no hay fila que copiar.
 */
export interface ReglasDelHeroe {
  readonly combate: {
    readonly pv: { readonly base: number; readonly porNivel: number };
    readonly ataquePorNivel: number;
    readonly defensaPorNivel: number;
    readonly danio: { readonly min: number; readonly max: number; readonly maxPorNivel: number };
    readonly velocidad: SpeedTier;
  };
  readonly rendicion: { readonly porcentajeDelOro: number };
}

/** Un JSON se edita a mano: una velocidad mal escrita se dice al cargar, no en la batalla. */
function velocidadDelHeroe(v: string): SpeedTier {
  const tier = SPEED_TIERS.find((t) => t === v);
  if (tier === undefined) {
    throw new Error(
      `data/heroe.json: la velocidad "${v}" no existe; valen ${SPEED_TIERS.join(', ')}`,
    );
  }
  return tier;
}

export const HEROE: ReglasDelHeroe = {
  combate: {
    pv: { ...heroeJson.combate.pv },
    ataquePorNivel: heroeJson.combate.ataquePorNivel,
    defensaPorNivel: heroeJson.combate.defensaPorNivel,
    danio: { ...heroeJson.combate.danio },
    velocidad: velocidadDelHeroe(heroeJson.combate.velocidad),
  },
  rendicion: { ...heroeJson.rendicion },
};

/** Un grupo de individuos de la misma criatura, como se escriben en los datos. */
export interface GrupoDeTropa {
  readonly creature: string;
  readonly count: number;
}

/**
 * Lo que impide que unos grupos de tropa formen **un bando**: una criatura que
 * no existe, un número que no es de individuos o más de los que lleva un bando
 * (`maxPorBando`). Vacío: valen. `quien` encabeza cada frase.
 *
 * Una sola comprobación para los dos sitios donde se escriben grupos a mano:
 * la guarnición neutral de `data/ciudades.json` y los monstruos de un plan de
 * mapa (`validateMapPlan`). Eran dos copias con dos redacciones, y una ciudad
 * neutral y un monstruo acaban en la misma batalla con el mismo tope.
 */
export function problemasDeGrupo(grupos: readonly GrupoDeTropa[], quien: string): string[] {
  const problemas: string[] = [];
  let total = 0;
  for (const g of grupos) {
    if (!byId.has(g.creature)) {
      problemas.push(
        `${quien} es de una criatura que no existe: "${g.creature}". Las que valen: ${[...byId.keys()].sort().join(', ')}`,
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
 * Eran dos copias —la de la guarnición y la del asaltante— con la misma suma y
 * otra frase. La suma no pasa por `armyLeadership` (`hero/troop.ts`) aunque es
 * la misma cuenta: este módulo valida sus tablas AL CARGAR, y `troop.ts` lo
 * importa a él, así que llamarla desde aquí cerraría un ciclo justo en la
 * evaluación del módulo.
 *
 * Una guarnición que naciera por encima dejaría el castillo en un estado que
 * ninguna partida alcanza reclutando —lo vigila `tropa.test.ts` sobre partidas
 * enteras—, y el tope existe porque una guarnición mayor que el héroe recién
 * contratado deja partidas en tablas para siempre (`data/liderazgo.json`).
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
  for (const g of grupos) ocupa += creature(g.creature).leadership * g.count;
  if (ocupa > tope) {
    problemas.push(`${quien} ocupa ${ocupa} de liderazgo y ${queEs} lleva como mucho ${tope}`);
  }
  return problemas;
}

/**
 * Lee una tabla de guarniciones de `data/ciudades.json`, una por facción.
 *
 * Se valida al cargar y no al usarla: una criatura mal escrita, una guarnición
 * de más de `maxPorBando` individuos o de más liderazgo que el de guarnición
 * revientan aquí con el nombre del fichero, en vez de en la primera batalla
 * contra esa ciudad, con la partida ya en marcha.
 */
function tablaDeGuarniciones(
  clave: 'guarnicionNeutral' | 'guarnicionBase',
  que: string,
): Readonly<Record<FactionId, readonly GrupoDeTropa[]>> {
  const tabla = ciudadesJson[clave] as Record<string, readonly GrupoDeTropa[]> | undefined;
  if (tabla === undefined) throw new Error(`data/ciudades.json: falta "${clave}"`);
  const out = {} as Record<FactionId, readonly GrupoDeTropa[]>;
  for (const faccion of ['knight', 'necromancer'] as const) {
    const grupos = tabla[faccion];
    if (grupos === undefined) {
      throw new Error(`data/ciudades.json: falta ${que} de ${faccion}`);
    }
    const problemas = problemasDeTopeDeLiderazgo(
      grupos,
      `data/ciudades.json: ${que} de ${faccion}`,
      LIDERAZGO.guarnicion,
      'una guarnición',
    );
    if (problemas.length > 0) throw new Error(problemas.join('; '));
    out[faccion] = grupos;
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
 * dueño. **Inventada y provisional**, igual que la neutral: la pidió el usuario
 * cuando «perder la base elimina» convirtió las partidas en carreras contra una
 * base vacía. Las murallas y la ventaja del defensor son de la fase 3.
 */
const GUARNICION_DE_BASE = tablaDeGuarniciones('guarnicionBase', 'la guarnición de la base');

export function guarnicionNeutral(faction: FactionId): readonly GrupoDeTropa[] {
  return GUARNICION_NEUTRAL[faction];
}

export function guarnicionDeBase(faction: FactionId): readonly GrupoDeTropa[] {
  return GUARNICION_DE_BASE[faction];
}

/**
 * Las reglas de los asaltantes de caminos, de `data/asaltantes.json`.
 * **Inventadas y provisionales**, y así lo dice su `_comment`: en HoMM2 los
 * monstruos del mapa no se mueven, así que no hay fila que copiar.
 */
export interface ReglasDeAsaltantes {
  /** La probabilidad de que brote un grupo cada lunes en cada región que lo admita. */
  readonly probabilidadSemanal: number;
  /** Cuántas casillas se mueve un grupo al día como mucho, en Chebyshev. */
  readonly pasosPorDia: number;
  /** El liderazgo que puede sumar un grupo: el techo de lo que ocupa. */
  readonly liderazgoMax: number;
  /**
   * La fuerza bruta que puede sumar un grupo: el techo de lo que pega. Lo
   * comprueba `state/asaltantes.ts` al cargar, que es quien sabe medirla sin
   * cerrar un ciclo con este módulo.
   */
  readonly fuerzaMax: number;
  /** Los grupos que pueden brotar; cada uno, de 1 a `maxPorBando` individuos. */
  readonly composiciones: readonly (readonly GrupoDeTropa[])[];
}

/**
 * Se valida al cargar, como las guarniciones: un número que no es una
 * probabilidad o una composición imposible revientan aquí con el nombre del
 * fichero, y no el primer lunes de una partida.
 */
function reglasDeAsaltantes(): ReglasDeAsaltantes {
  const j = asaltantesJson;
  const fichero = 'data/asaltantes.json';
  if (!(j.probabilidadSemanal >= 0 && j.probabilidadSemanal <= 1)) {
    throw new Error(
      `${fichero}: probabilidadSemanal tiene que ir de 0 a 1 y es ${j.probabilidadSemanal}`,
    );
  }
  for (const [campo, valor] of [
    ['pasosPorDia', j.pasosPorDia],
    ['liderazgoMax', j.liderazgoMax],
    ['fuerzaMax', j.fuerzaMax],
  ] as const) {
    if (!enteroDesde(valor, 0)) {
      throw new Error(`${fichero}: ${campo} tiene que ser un entero ≥ 0 y es ${valor}`);
    }
  }
  if (j.composiciones.length === 0) {
    throw new Error(`${fichero}: no hay ninguna composición, y un grupo que brota necesita una`);
  }
  const problemas = j.composiciones.flatMap((grupos, i) =>
    problemasDeTopeDeLiderazgo(
      grupos,
      `${fichero}: la composición ${i}`,
      j.liderazgoMax,
      'un grupo de asaltantes',
    ),
  );
  if (problemas.length > 0) throw new Error(problemas.join('; '));
  return {
    probabilidadSemanal: j.probabilidadSemanal,
    pasosPorDia: j.pasosPorDia,
    liderazgoMax: j.liderazgoMax,
    fuerzaMax: j.fuerzaMax,
    composiciones: j.composiciones,
  };
}

export const ASALTANTES: ReglasDeAsaltantes = reglasDeAsaltantes();

/**
 * Las reglas de la experiencia, de `data/experiencia.json`. **Regla nuestra y
 * no del original**, y así lo dice su `_comment`: sustituye a la tabla de
 * fheroes2. Los umbrales y las cifras los resuelve `hero/experiencia.ts`; esto
 * solo las lee y las valida.
 */
export interface ReglasDeExperiencia {
  /** Lo que cuesta el primer nivel: subir del n al n+1 cuesta `base × incrementos[n−1]`. */
  readonly base: number;
  /** Los primeros incrementos, Fibonacci; más allá se siguen por la recurrencia. */
  readonly incrementos: readonly number[];
  /** El tope de la tropa. El héroe no tiene. */
  readonly nivelMaximoDeTropa: number;
  /** Lo que suma a ataque y defensa cada nivel de veteranía por encima del 1. */
  readonly porNivel: { readonly ataque: number; readonly defensa: number };
  /**
   * Qué habilidad gana cada criatura en los niveles 2…`nivelMaximoDeTropa`, por
   * id de criatura. **Inertes**: no hay motor de habilidades todavía.
   */
  readonly habilidades: Readonly<Record<string, readonly string[]>>;
}

/**
 * Valida unas reglas de experiencia contra el catálogo de habilidades y el de
 * criaturas, y las devuelve tipadas. **Lanza con todos los problemas a la vez**,
 * escritos para quien edita el JSON.
 *
 * Exportada y con los catálogos de argumento para que un test pueda darle un
 * JSON roto y verla morder: sin eso, el guardia de nombres solo se probaría con
 * el fichero bueno, que es probar que no muerde.
 *
 * El nombre de una habilidad se compara **exacto** contra el catálogo, que se
 * sacó del cuaderno con una expresión regular (`tools/datos/habilidades.ts`):
 * una habilidad escrita de memoria es la forma en que se cuela una inventada.
 */
export function validarExperiencia(
  json: unknown,
  catalogo: readonly string[],
  criaturas: readonly string[],
  fichero = 'data/experiencia.json',
): ReglasDeExperiencia {
  const problemas: string[] = [];
  const j = (json ?? {}) as Record<string, unknown>;
  if (!enteroDesde(j.base, 1)) problemas.push(`base tiene que ser un entero ≥ 1 y es ${j.base}`);
  const nivelMax = j.nivelMaximoDeTropa;
  if (!enteroDesde(nivelMax, 2)) {
    problemas.push(`nivelMaximoDeTropa tiene que ser un entero ≥ 2 y es ${nivelMax}`);
  }
  const inc = j.incrementos;
  if (!Array.isArray(inc) || inc.length < 2 || !inc.every((x) => enteroDesde(x, 1))) {
    problemas.push(
      `incrementos tiene que ser una lista de al menos dos enteros ≥ 1 —los dos primeros siembran la recurrencia— y es ${JSON.stringify(inc)}`,
    );
  } else {
    const n = inc as number[];
    for (let k = 2; k < n.length; k++) {
      const [a, b, c] = [n[k - 2] as number, n[k - 1] as number, n[k] as number];
      if (c !== a + b) {
        problemas.push(
          `incrementos no es Fibonacci: el ${k + 1}.º es ${c} y tendría que ser ${b} + ${a} = ${a + b}`,
        );
        break;
      }
    }
  }
  const por = (j.porNivel ?? {}) as Record<string, unknown>;
  for (const campo of ['ataque', 'defensa'] as const) {
    if (!enteroDesde(por[campo], 0)) {
      problemas.push(`porNivel.${campo} tiene que ser un entero ≥ 0 y es ${por[campo]}`);
    }
  }
  const hab = (j.habilidades ?? {}) as Record<string, unknown>;
  const validas = new Set(catalogo);
  const cuantas = enteroDesde(nivelMax, 2) ? nivelMax - 1 : null;
  for (const id of criaturas) {
    if (!(id in hab)) problemas.push(`habilidades: falta la criatura "${id}"`);
  }
  for (const [id, lista] of Object.entries(hab)) {
    if (!criaturas.includes(id)) {
      problemas.push(`habilidades: "${id}" no es ninguna criatura del catálogo`);
      continue;
    }
    if (!Array.isArray(lista) || !lista.every((x) => typeof x === 'string')) {
      problemas.push(`habilidades.${id} tiene que ser una lista de nombres`);
      continue;
    }
    if (cuantas !== null && lista.length !== cuantas) {
      problemas.push(
        `habilidades.${id} trae ${lista.length} y son ${cuantas}: una por nivel, del 2 al ${nivelMax}`,
      );
    }
    for (const nombre of lista) {
      if (!validas.has(nombre)) {
        problemas.push(
          `habilidades.${id}: "${nombre}" no está en el catálogo (data/habilidades.json, sacado de NuevaJugabilidad.md)`,
        );
      }
    }
  }
  if (problemas.length > 0) throw new Error(`${fichero}: ${problemas.join('; ')}`);
  return {
    base: j.base as number,
    incrementos: [...(inc as number[])],
    nivelMaximoDeTropa: nivelMax as number,
    porNivel: { ataque: por.ataque as number, defensa: por.defensa as number },
    habilidades: hab as Record<string, readonly string[]>,
  };
}

/** Los nombres del catálogo de habilidades, en el orden del cuaderno. */
export const CATALOGO_DE_HABILIDADES: readonly string[] = habilidadesJson.habilidades.map(
  (h) => h.nombre,
);

export const EXPERIENCIA: ReglasDeExperiencia = validarExperiencia(
  experienciaJson,
  CATALOGO_DE_HABILIDADES,
  [...byId.keys()],
);
