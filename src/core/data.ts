/** Catálogo de criaturas: carga `data/creatures.json` y lo tipa. */
import asaltantesJson from '../../data/asaltantes.json' with { type: 'json' };
import barrerasJson from '../../data/barreras.json' with { type: 'json' };
import ciudadesJson from '../../data/ciudades.json' with { type: 'json' };
import creaturesJson from '../../data/creatures.json' with { type: 'json' };
import equipoJson from '../../data/equipo.json' with { type: 'json' };
import experienciaJson from '../../data/experiencia.json' with { type: 'json' };
import habilidadesJson from '../../data/habilidades.json' with { type: 'json' };
import heroeJson from '../../data/heroe.json' with { type: 'json' };
import liderazgoJson from '../../data/liderazgo.json' with { type: 'json' };
import murallaJson from '../../data/muralla.json' with { type: 'json' };
import poderJson from '../../data/poder.json' with { type: 'json' };
import relieveJson from '../../data/relieve.json' with { type: 'json' };
import riosJson from '../../data/rios.json' with { type: 'json' };
import tiposDeHeroeJson from '../../data/tipos-de-heroe.json' with { type: 'json' };
import {
  fueraDelAnillo,
  NIVEL_MAXIMO,
  NOMBRE_DE_GOLPE,
  problemasDeNiveles,
} from './battle/cifras-de-la-rueda.js';
import {
  BARRERAS,
  type Barrera,
  NIVELES,
  type Nivel,
  SUELOS_PISABLES,
  type Suelo,
} from './map/terrain.js';
import type {
  CifraDelHueco,
  Creature,
  CreatureTrait,
  ExtrasDeLaRueda,
  FactionId,
  Hueco,
  HuecoDeArena,
  NivelesDeLaRueda,
  Resources,
  SpeedTier,
  TipoDeGolpe,
  UnitInfo,
} from './types.js';
import {
  CIFRAS_DE_PIEZA,
  camposDelHueco,
  esArmaPorUso,
  esHuecoDeArena,
  esTipoDelAnillo,
  FACTION_IDS,
  HUECOS,
  HUECOS_DE_LA_ARENA,
  NOMBRE_DE_CIFRA,
  NOMBRE_DE_HUECO,
  NOMBRE_DE_RECURSO,
  RESOURCE_KINDS,
  type ResourceKind,
  SPEED_TIERS,
  TIPOS_DE_GOLPE,
  TIPOS_DEL_ANILLO,
} from './types.js';

const byId = new Map<string, Creature>();

/**
 * La facción de una criatura del catálogo, comprobada contra `FACTION_IDS` en
 * vez de casteada: con el `as`, una facción mal escrita en el JSON entraba al
 * juego y salía por el contrato como un valor que el esquema del plan rechaza.
 */
function faccionDelCatalogo(id: string, faccion: string): FactionId {
  const valida = FACTION_IDS.find((f) => f === faccion);
  if (valida === undefined) {
    throw new Error(
      `data/creatures.json: la criatura "${id}" es de la facción "${faccion}", que no es ninguna de las del juego (${FACTION_IDS.join(', ')})`,
    );
  }
  return valida;
}

for (const raw of creaturesJson.creatures) {
  const creature: Creature = {
    id: raw.id,
    faction: faccionDelCatalogo(raw.id, raw.faction),
    morada: raw.morada,
    leadership: raw.leadership,
    name: raw.name,
    attack: raw.attack,
    defense: raw.defense,
    damage: [raw.damage[0] as number, raw.damage[1] as number],
    hp: raw.hp,
    speed: raw.speed as SpeedTier,
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
 * Las facciones que se juegan: las del catálogo de criaturas, no una lista
 * aparte. La leen las tablas por facción —guarniciones y tipos de héroe— para
 * que una facción nueva en el catálogo las ponga en rojo al cargar si le falta
 * su fila.
 */
const FACCIONES: readonly FactionId[] = [...new Set([...byId.values()].map((c) => c.faction))];

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

/** Las 6 criaturas base de una facción, de la morada 1 a la 6 (sin mejoras). */
export function factionLineup(faction: FactionId): readonly Creature[] {
  const upgrades = new Set(
    allCreatures()
      .map((c) => c.upgradesTo)
      .filter((id): id is string => id !== undefined),
  );
  return allCreatures()
    .filter((c) => c.faction === faction && !upgrades.has(c.id))
    .sort((a, b) => a.morada - b.morada);
}

export function hasTrait(c: UnitInfo, trait: CreatureTrait): boolean {
  return c.traits?.includes(trait) ?? false;
}

/**
 * Tira quien tiene munición (la criatura del catálogo: `shots`) o quien lleva un
 * arma en el hueco `distancia` (la arena, que no cuenta tiros). Lee `equipo` y
 * no `armas`: la lista de armas por uso la escribe `conEquipo` para el daño, y el
 * hueco puesto es el hecho. El juego no pone nunca nada en `distancia`
 * (`validarEquipo`), así que para él esto es lo de siempre.
 */
export function isShooter(c: UnitInfo): boolean {
  return (c.shots ?? 0) > 0 || c.equipo?.distancia !== undefined;
}

/**
 * Si los tiros de `c` se cuentan. **La munición es de la criatura del catálogo**
 * (`shots`, la misma lectura que `isShooter`); quien tira por su arma a distancia
 * (la arena, 13-10-2026) no la tiene: dispara siempre que el motor le deje. Las
 * dos cosas no se juntan nunca (lo vigila `vestir`, `hero/equipo.ts`). Lo leen
 * `tirosQueQuedan`, `quedanTiros` y `shoot` (resta solo entonces).
 */
export function cuentaTiros(c: UnitInfo): boolean {
  return (c.shots ?? 0) > 0;
}

/**
 * Los tiros que le quedan a un stack, o `null` si no se cuentan (`cuentaTiros`):
 * la ÚNICA lectura de `shotsLeft` fuera del motor, que la leen el `↑N` del
 * tablero, la fila «Munición» del panel, el contrato y la frase de «sin munición»
 * del disparo. Lo vigila `test/invariantes.test.ts`.
 */
export function tirosQueQuedan(s: {
  readonly unit: UnitInfo;
  readonly shotsLeft: number;
}): number | null {
  return cuentaTiros(s.unit) ? s.shotsLeft : null;
}

/**
 * Si un stack puede tirar por munición: la ÚNICA pregunta «es tirador y le
 * quedan tiros», que leen el disparo, el castigo del tirador de fheroes2, la IA
 * de batalla y el tablero. Antes iba copiada en nueve sitios como
 * `isShooter && shotsLeft > 0`; lo vigila `test/invariantes.test.ts`.
 */
export function quedanTiros(s: { readonly unit: UnitInfo; readonly shotsLeft: number }): boolean {
  const tiros = tirosQueQuedan(s);
  return tiros === null ? isShooter(s.unit) : tiros > 0;
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
  /** Tope de un héroe: `base + porRango × (rango − 5)`, sin pasar de `max`. */
  readonly heroe: { readonly base: number; readonly porRango: number; readonly max: number };
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
    readonly pv: { readonly base: number; readonly porRango: number };
    readonly ataquePorRango: number;
    readonly defensaPorRango: number;
    readonly danio: { readonly min: number; readonly max: number; readonly maxPorRango: number };
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
    ataquePorRango: heroeJson.combate.ataquePorRango,
    defensaPorRango: heroeJson.combate.defensaPorRango,
    danio: { ...heroeJson.combate.danio },
    velocidad: velocidadDelHeroe(heroeJson.combate.velocidad),
  },
  rendicion: { ...heroeJson.rendicion },
};

/**
 * La muralla de la arena, de `data/muralla.json`. **Inventado y provisional**,
 * como dice su `_comment`: en HoMM2 no hay tirador que se suba al muro.
 */
export interface ReglasDeLaMuralla {
  /** Lo que suma a su defensa un tirador en lo alto de un muro (`effectiveDefense`). */
  readonly defensaEnLoAlto: number;
}

/** Se edita a mano: una cifra que no es un entero ≥ 0 se dice al cargar, no en la batalla. */
function defensaEnLoAlto(v: unknown): number {
  if (!Number.isSafeInteger(v) || (v as number) < 0) {
    throw new Error(
      `data/muralla.json: defensaEnLoAlto tiene que ser un entero de 0 en adelante y es ${JSON.stringify(v)}`,
    );
  }
  return v as number;
}

export const MURALLA: ReglasDeLaMuralla = {
  defensaEnLoAlto: defensaEnLoAlto(murallaJson.defensaEnLoAlto),
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
  for (const faccion of FACCIONES) {
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
  /**
   * Cuántas casillas se mueve un grupo al día como mucho, en Chebyshev, **en
   * el mapa de referencia** (`AREA_DE_REFERENCIA`); la patrulla lo lleva a la
   * escala del mapa (`pasosDeLaPatrulla`, #229).
   */
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
  /** Lo que cuesta el primer rango: subir del n al n+1 cuesta `base × incrementos[n−1]`. */
  readonly base: number;
  /** Los primeros incrementos, Fibonacci; más allá se siguen por la recurrencia. */
  readonly incrementos: readonly number[];
  /** El tope de la tropa. El héroe no tiene. */
  readonly rangoMaximoDeTropa: number;
  /** Lo que suma a ataque y defensa cada rango por encima del 1. */
  readonly porRango: { readonly ataque: number; readonly defensa: number };
  /**
   * Qué habilidad gana cada criatura en los rangos 2…`rangoMaximoDeTropa`, por
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
  const rangoMax = j.rangoMaximoDeTropa;
  if (!enteroDesde(rangoMax, 2)) {
    problemas.push(`rangoMaximoDeTropa tiene que ser un entero ≥ 2 y es ${rangoMax}`);
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
  const por = (j.porRango ?? {}) as Record<string, unknown>;
  for (const campo of ['ataque', 'defensa'] as const) {
    if (!enteroDesde(por[campo], 0)) {
      problemas.push(`porRango.${campo} tiene que ser un entero ≥ 0 y es ${por[campo]}`);
    }
  }
  const hab = (j.habilidades ?? {}) as Record<string, unknown>;
  const validas = new Set(catalogo);
  const cuantas = enteroDesde(rangoMax, 2) ? rangoMax - 1 : null;
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
        `habilidades.${id} trae ${lista.length} y son ${cuantas}: una por rango, del 2 al ${rangoMax}`,
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
    rangoMaximoDeTropa: rangoMax as number,
    porRango: { ataque: por.ataque as number, defensa: por.defensa as number },
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

/**
 * Las cifras del índice de poder, de `data/poder.json` (`core/nivel.ts`).
 * **Inventadas y provisionales**, como dice su `_comment`: es la calibración que
 * deja cada criatura del catálogo en el nivel de su morada o en el contiguo.
 */
export interface ReglasDelPoder {
  /** El poder con el que empieza el nivel 2: por debajo, todo es el nivel 1. */
  readonly umbralDelNivel2: number;
  /** Cada umbral es el anterior × `razon[0]` / `razon[1]`: dos enteros, sin coma flotante. */
  readonly razon: readonly [number, number];
  /**
   * La armadura con la que se mide cuánto aguanta una unidad que la lleva: el
   * golpe de referencia (`core/nivel.ts`). Entero ≥ 1.
   */
  readonly armaduraDeReferencia: number;
  /**
   * Cuánto pesa cada tipo de la rueda en lo que pega una unidad (`core/nivel.ts`):
   * los siete, enteros ≥ 0 y al menos uno > 0. Propios de la medida, no los de
   * la IA (`PESOS_DE_LA_RUEDA`): retocar cómo elige la IA no mueve índices.
   */
  readonly pesosDeLaRueda: Readonly<Record<TipoDeGolpe, number>>;
}

/**
 * Valida las reglas del índice de poder y las devuelve tipadas; lanza con todos
 * los problemas a la vez. **Una razón ≤ 1 se rechaza**: con ella los umbrales no
 * crecen y el bucle que los calcula no acabaría, o dos niveles empezarían en el
 * mismo poder. Exportada con el JSON de argumento para que un test la vea morder.
 */
export function validarPoder(json: unknown, fichero = 'data/poder.json'): ReglasDelPoder {
  const problemas: string[] = [];
  const j = (json ?? {}) as Record<string, unknown>;
  if (!enteroDesde(j.umbralDelNivel2, 1)) {
    problemas.push(`umbralDelNivel2 tiene que ser un entero ≥ 1 y es ${j.umbralDelNivel2}`);
  }
  const r = j.razon;
  if (!Array.isArray(r) || r.length !== 2 || !r.every((x) => enteroDesde(x, 1))) {
    problemas.push(
      `razon tiene que ser [numerador, denominador], dos enteros ≥ 1, y es ${JSON.stringify(r)}`,
    );
  } else if ((r[0] as number) <= (r[1] as number)) {
    problemas.push(
      `razon ${r[0]}/${r[1]} no pasa de 1: los umbrales de nivel tienen que crecer, o dos niveles empezarían en el mismo poder`,
    );
  } else if (
    enteroDesde(j.umbralDelNivel2, 1) &&
    Math.floor(((j.umbralDelNivel2 as number) * (r[0] as number)) / (r[1] as number)) <=
      (j.umbralDelNivel2 as number)
  ) {
    // En enteros, ⌊u · n / d⌋ puede quedarse en u con un umbral pequeño y una
    // razón cerca de 1; si el primer paso crece, crecen todos (n/d > 1).
    problemas.push(
      `con umbralDelNivel2 ${j.umbralDelNivel2} y razon ${r[0]}/${r[1]} el umbral del nivel 3 sale igual que el del 2, en enteros: sube el umbral o la razón`,
    );
  }
  if (!enteroDesde(j.armaduraDeReferencia, 1)) {
    problemas.push(
      `armaduraDeReferencia tiene que ser un entero ≥ 1 y es ${j.armaduraDeReferencia}`,
    );
  }
  const pesos = j.pesosDeLaRueda;
  const sonPesos =
    typeof pesos === 'object' &&
    pesos !== null &&
    !Array.isArray(pesos) &&
    Object.keys(pesos).length === TIPOS_DE_GOLPE.length &&
    TIPOS_DE_GOLPE.every((t) => enteroDesde((pesos as Record<string, unknown>)[t], 0));
  if (!sonPesos) {
    problemas.push(
      `pesosDeLaRueda tiene que ser un entero ≥ 0 por cada tipo de la rueda (${TIPOS_DE_GOLPE.join(', ')}), y es ${JSON.stringify(pesos)}`,
    );
  } else if (TIPOS_DE_GOLPE.every((t) => (pesos as Record<string, number>)[t] === 0)) {
    problemas.push('pesosDeLaRueda son todos 0: alguno tiene que pesar');
  }
  if (problemas.length > 0) throw new Error(`${fichero}: ${problemas.join('; ')}`);
  return {
    umbralDelNivel2: j.umbralDelNivel2 as number,
    razon: [(r as number[])[0] as number, (r as number[])[1] as number],
    armaduraDeReferencia: j.armaduraDeReferencia as number,
    pesosDeLaRueda: pesos as Record<TipoDeGolpe, number>,
  };
}

export const PODER: ReglasDelPoder = validarPoder(poderJson);

/**
 * Un tipo de héroe de `data/tipos-de-heroe.json`, sacado del cuaderno con una
 * expresión regular (`tools/datos/tipos-de-heroe.ts`). **Inerte**: se guarda en
 * el héroe (`Hero.tipo`), se ve y se serializa, pero no da nada hasta que exista
 * el motor de habilidades.
 */
export interface TipoDeHeroe {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string;
}

/**
 * Valida el catálogo de tipos contra las facciones del motor y lo devuelve
 * tipado. **Lanza con todos los problemas a la vez.** Exportada con el JSON de
 * argumento por lo mismo que `validarExperiencia`: un guardia que solo se prueba
 * con el fichero bueno es un guardia que no se ha visto morder.
 *
 * Cada facción necesita al menos uno porque el primero es el tipo por defecto
 * del héroe inicial y del contratado: sin él, `newGame` no tendría qué ponerle.
 */
export function validarTiposDeHeroe(
  json: unknown,
  facciones: readonly FactionId[],
  fichero = 'data/tipos-de-heroe.json',
): Readonly<Record<FactionId, readonly TipoDeHeroe[]>> {
  const problemas: string[] = [];
  const tipos = ((json ?? {}) as { tipos?: Record<string, unknown> }).tipos ?? {};
  const out = {} as Record<FactionId, readonly TipoDeHeroe[]>;
  for (const faccion of facciones) {
    const lista = tipos[faccion];
    if (!Array.isArray(lista) || lista.length === 0) {
      problemas.push(`la facción ${faccion} no tiene ningún tipo de héroe`);
      continue;
    }
    const validos: TipoDeHeroe[] = [];
    for (const [i, t] of (lista as Record<string, unknown>[]).entries()) {
      const campos = ['id', 'nombre', 'descripcion'] as const;
      const malos = campos.filter((c) => typeof t?.[c] !== 'string' || t[c] === '');
      if (malos.length > 0) {
        problemas.push(`${faccion}[${i}] no trae ${malos.join(', ')} como texto`);
        continue;
      }
      validos.push({
        id: t.id as string,
        nombre: t.nombre as string,
        descripcion: t.descripcion as string,
      });
    }
    const repetidos = validos.map((t) => t.id).filter((id, i, todos) => todos.indexOf(id) !== i);
    if (repetidos.length > 0) problemas.push(`${faccion} repite los ids ${repetidos.join(', ')}`);
    out[faccion] = validos;
  }
  for (const faccion of Object.keys(tipos)) {
    if (!(facciones as readonly string[]).includes(faccion)) {
      problemas.push(`"${faccion}" no es ninguna facción del motor`);
    }
  }
  if (problemas.length > 0) throw new Error(`${fichero}: ${problemas.join('; ')}`);
  return out;
}

const TIPOS_DE_HEROE = validarTiposDeHeroe(tiposDeHeroeJson, FACCIONES);

/** Los tipos de héroe de una facción, en el orden del cuaderno. */
export function tiposDeHeroe(faction: FactionId): readonly TipoDeHeroe[] {
  return TIPOS_DE_HEROE[faction];
}

/**
 * El id del tipo del héroe que nadie eligió —el inicial y el contratado—: **el
 * primero de su facción en el cuaderno** (Caballero, Nigromante). El id y no el
 * tipo entero, porque es lo que guarda `Hero.tipo` y lo único que leen quienes
 * lo piden. Lo elige así el plan
 * de este ciclo, y como el tipo es inerte no cambia ninguna partida.
 */
export function tipoDeHeroePorDefecto(faction: FactionId): string {
  return (TIPOS_DE_HEROE[faction][0] as TipoDeHeroe).id;
}

/** El tipo `id` de la facción, o `null` si esa facción no lo tiene. */
export function tipoDeHeroe(faction: FactionId, id: string): TipoDeHeroe | null {
  return TIPOS_DE_HEROE[faction].find((t) => t.id === id) ?? null;
}

/**
 * El nombre del tipo `id` para pintarlo («Monje (Abad)»). **Lanza** si la
 * facción no lo tiene: un héroe con un tipo que no existe es un héroe mal
 * construido, y pintar el id crudo lo escondería. Lo leen el panel del cliente
 * y la vista del espectador, que no deben redactarlo cada uno a su manera.
 */
export function nombreDeTipoDeHeroe(faction: FactionId, id: string): string {
  const tipo = tipoDeHeroe(faction, id);
  if (tipo === null) {
    throw new Error(`el tipo de héroe "${id}" no existe en ${faction} (data/tipos-de-heroe.json)`);
  }
  return tipo.nombre;
}

// ---------------------------------------------------------------- equipo

/**
 * De dónde sale una pieza, que es lo que la calidad decide: `comun` cae como
 * botín; `armeria` la vende la armería y es lo que todo héroe trae de serie —una
 * por hueco, la mejor que se compra—; `especial` cae como botín y trae otra clase
 * de ventaja; `arena` es el equipo de los perfiles de arma de la arena y los
 * escudos, y **el juego no la reparte** —ni botín, ni armería, ni equipo base—.
 * Es una propiedad de la pieza y no una lista aparte, para que «calidad de
 * armería» se pueda preguntar a la pieza.
 */
export const CALIDADES = ['comun', 'armeria', 'especial', 'arena'] as const;

export type Calidad = (typeof CALIDADES)[number];

/**
 * Las calidades que caen como botín, **escritas** y no «lo que no se vende»: así
 * lo de la arena no cae nunca. Lo leen el cargador (que haya alguna pieza de
 * botín) y el sorteo (`PIEZAS_DE_BOTIN`).
 */
export const CALIDADES_DE_BOTIN: readonly Calidad[] = ['comun', 'especial'];

/** Una pieza de `data/equipo.json`. **Inventada y provisional**, como dice su `_comment`. */
export interface Pieza {
  readonly id: string;
  readonly nombre: string;
  /** El de la arena (`HuecoDeArena`): las piezas de calidad `arena` pueden ir en sus huecos de arma. */
  readonly hueco: HuecoDeArena;
  readonly calidad: Calidad;
  readonly ataque: number;
  readonly defensa: number;
  readonly pv: number;
  /**
   * Puntos de armadura (**solo la arena**, #262): se restan del daño de cada golpe,
   * disparo, hechizo o poder que recibe quien la lleva, con mínimo 0
   * (`trasLaArmadura`, `battle/damage.ts`). Es de la calidad `arena`, que no suma
   * PV; las demás calidades suman PV y no la llevan (`problemasDePieza`). Sin el
   * campo, 0: las piezas del juego no lo escriben, y así salen con los mismos
   * campos que antes (el banco).
   */
  readonly armadura?: number;
  /**
   * Escalones de velocidad que suma a quien la lleva, sin pasar del último ni
   * bajar del primero. Puede ser negativa: un escudo la resta, y tiene que
   * restarla (`validarEquipo`).
   */
  readonly velocidad: number;
  /** `[+mínimo, +máximo]` de daño que suma; sin el campo, nada. */
  readonly danio?: readonly [number, number];
  /**
   * `2` si es un arma a dos manos, que no admite escudo (`manosBlocker`, la única
   * lectura). Solo en el hueco `arma`; sin el campo, una mano.
   */
  readonly manos?: 1 | 2;
  /**
   * Su nivel en cada tipo del anillo de la rueda del golpe, de 0 a 6 (**solo la
   * arena**, 18-10-2026: «una maza es mejor en ataque fuerte y peor en rápido»;
   * los niveles, absolutos, en la vuelta 2). Lo lleva **toda** pieza de calidad
   * `arena` de un hueco que golpea en ella (`camposDelHueco(h).conRueda`: `arma` y
   * `carga`), y ninguna otra. Lo lleva al golpe `conEquipo` (`GolpeConArma.rueda`).
   */
  readonly rueda?: NivelesDeLaRueda;
  readonly precio: Partial<Resources>;
}

/**
 * Lo que una pieza con base suma encima de la suya (18-10-2026: «una espada de
 * herrería debería poder ser una espada normal con extras»): sus cifras, el daño
 * por componentes, la rueda por tipo y el precio en oro. **Enteros con signo**:
 * manda la regla de la pieza resuelta (`problemasDePieza`, un solo juez), así que
 * una «oxidada» puede restar y cambiar de base es reversible. Sin un campo, 0.
 */
export interface ExtrasDePieza {
  readonly ataque?: number;
  readonly defensa?: number;
  readonly armadura?: number;
  readonly velocidad?: number;
  readonly danio?: readonly [number, number];
  /** Niveles de la rueda con signo, por tipo del anillo: el final, el de la base más este. */
  readonly rueda?: ExtrasDeLaRueda;
  readonly oro?: number;
}

/**
 * Cómo es cada extra (`ExtrasDePieza`), en el orden en que se escriben: un número,
 * dos (el daño, que se suma por componentes) o uno por tipo del anillo (la rueda,
 * en niveles).
 * **La tabla de los extras, una vez**: de ella salen sus campos
 * (`CAMPOS_DE_EXTRAS`), su forma (`problemasDePiezaConBase`), cómo se escriben
 * (`piezaConBaseCanonica`) y la suma de una base y su inversa (`sumarExtras`).
 */
const FORMA_DE_LOS_EXTRAS = {
  ataque: 'numero',
  defensa: 'numero',
  armadura: 'numero',
  velocidad: 'numero',
  danio: 'par',
  rueda: 'porTipo',
  oro: 'numero',
} as const satisfies Readonly<Record<keyof ExtrasDePieza, 'numero' | 'par' | 'porTipo'>>;

type CampoDeExtra = keyof typeof FORMA_DE_LOS_EXTRAS;

/** Los extras que son un número (`FORMA_DE_LOS_EXTRAS`). */
type ExtraNumerico = {
  [K in CampoDeExtra]: (typeof FORMA_DE_LOS_EXTRAS)[K] extends 'numero' ? K : never;
}[CampoDeExtra];

const EXTRAS = Object.keys(FORMA_DE_LOS_EXTRAS) as readonly CampoDeExtra[];
const EXTRAS_NUMERICOS = EXTRAS.filter(
  (c): c is ExtraNumerico => FORMA_DE_LOS_EXTRAS[c] === 'numero',
);

/** Unos extras con todo escrito (lo que no suma, 0): la forma en que se suman. */
export type ExtrasEnteros = { readonly [K in CampoDeExtra]-?: NonNullable<ExtrasDePieza[K]> };

/**
 * Una pieza escrita **sobre otra** (`base`, el id de otra pieza de la arena): su
 * nombre y lo que suma encima (`extras`). El hueco, la calidad, las manos y los PV
 * son los de su base, que no se repiten: si cambia la base, cambia ella (el
 * vínculo es vivo). La suma la hace solo `resolverBases`.
 */
export interface PiezaConBase {
  readonly id: string;
  readonly nombre: string;
  readonly base: string;
  readonly extras: ExtrasDePieza;
}

/**
 * Una pieza como se ESCRIBE (el fichero, el borrador, el enlace, la batalla): con
 * sus cifras enteras o sobre otra. Una `PiezaConBase` no encaja en `Pieza` (le
 * faltan el hueco y las cifras), así que nadie la lee como si estuviera resuelta.
 */
export type PiezaEscrita = Pieza | PiezaConBase;

/** Si `p` está escrita sobre otra. */
export function esPiezaConBase(p: PiezaEscrita): p is PiezaConBase {
  return 'base' in p;
}

/**
 * Los campos de una pieza, en el orden en que se escriben: lo demás se rechaza
 * diciéndolo (`problemasDePieza`). Con la lista en la regla de una pieza, un campo
 * ajeno en `data/equipo.json` —un `disparos` de antes de quitar la munición, un
 * `danyo` mal escrito— tumba la carga nombrando el fichero; antes el juego lo
 * ignoraba callando y la arena lanzaba después sin decir de dónde venía (H2 de QA,
 * 14-10-2026).
 */
export const CAMPOS_DE_PIEZA: readonly string[] = [
  'id',
  'nombre',
  'hueco',
  'calidad',
  'ataque',
  'defensa',
  'pv',
  'armadura',
  'velocidad',
  'danio',
  'manos',
  'rueda',
  'precio',
];

/** Los campos de una pieza con base (`PiezaConBase`). */
export const CAMPOS_DE_PIEZA_CON_BASE: readonly string[] = ['id', 'nombre', 'base', 'extras'];

/** Los campos de los extras de una pieza con base (`FORMA_DE_LOS_EXTRAS`). */
export const CAMPOS_DE_EXTRAS: readonly string[] = EXTRAS;

/** Cómo se nombra una pieza en un motivo: por su id si lo trae, si no `otro`. */
function quienEsLaPieza(p: Record<string, unknown>, otro: string): string {
  return typeof p.id === 'string' && p.id !== '' ? `"${p.id}"` : otro;
}

/**
 * Lo más que da de armadura una pieza de la arena (A4 de QA de #262: sin tope,
 * `1e3` entraba como 1000 y la pelea se agotaba en la ronda 100). **Inventado**:
 * la barda, la que más, da 22; 99 deja probar de sobra sin que nada sea inmune.
 * Lo juzga la regla de una pieza (`problemasDePieza`).
 */
export const ARMADURA_MAXIMA_DE_PIEZA = 99;

/** Las cifras que un hueco admite o no (`camposDelHueco`): todas menos los PV. */
const CIFRAS_DEL_HUECO = CIFRAS_DE_PIEZA.filter((c): c is CifraDelHueco => c !== 'pv');

/** Cómo se dice una cifra en un motivo: «daño», «defensa». */
function cifraDicha(c: CifraDelHueco): string {
  return NOMBRE_DE_CIFRA[c].toLowerCase();
}

/**
 * Si un valor ya leído suma algo: un número distinto de 0, o una lista o un
 * objeto con alguno (el daño, la rueda). Lo que no se ha escrito no suma.
 */
function sumaAlgo(v: unknown): boolean {
  if (typeof v === 'number') return v !== 0;
  if (Array.isArray(v)) return v.some(sumaAlgo);
  return typeof v === 'object' && v !== null && Object.values(v).some(sumaAlgo);
}

/**
 * Si la pieza golpea en la rueda del golpe: de calidad `arena` y de un hueco que
 * golpea en ella (`camposDelHueco(h).conRueda`: `arma` y `carga`). Esas, y solo
 * esas, dicen su rueda (`Pieza.rueda`): las del juego no la llevan. **La regla, en
 * un sitio**: la leen la de una pieza (`problemasDePieza`) y la de la unidad de la
 * arena, que no se monta sin un arma así (`armaDeCuerpoBlocker`).
 */
export function golpeaEnLaRueda(p: {
  readonly calidad?: unknown;
  readonly hueco?: unknown;
}): boolean {
  return (
    p.calidad === 'arena' &&
    typeof p.hueco === 'string' &&
    esHuecoDeArena(p.hueco) &&
    camposDelHueco(p.hueco).conRueda
  );
}

/**
 * Lo que no vale de UNA pieza, cada cosa con su frase, o vacío si vale: los
 * campos que existen (`CAMPOS_DE_PIEZA`), los textos, el hueco y la calidad que existen, las cifras enteras ≥ 0, el escudo
 * que resta velocidad, el daño `[mín, máx]`, las manos solo en un arma, la rueda
 * y el precio. Una de la arena, además, solo con las cifras de su hueco
 * (`camposDelHueco`), la armadura con tope (`ARMADURA_MAXIMA_DE_PIEZA`), una rueda
 * con sus seis niveles si es de cuerpo a cuerpo (`problemasDeNiveles`) y el precio solo en oro
 * (18-10-2026). **La regla de una
 * pieza, en un sitio**: la leen el cargador del catálogo (`validarEquipo`, que
 * añade las reglas de conjunto), la arena, que edita piezas una a una
 * (`validarPiezaDeArena`, `piezaBlocker`), y la suma de una base
 * (`resolverBases`), que la juzga resuelta. Escrita en dos sitios, un escudo que
 * no resta valdría en la arena y no en el juego.
 */
export function problemasDePieza(bruta: unknown, quien?: string): string[] {
  const problemas: string[] = [];
  if (typeof bruta !== 'object' || bruta === null || Array.isArray(bruta)) {
    return [`${quien ?? 'la pieza'} no es un objeto`];
  }
  const p = bruta as Record<string, unknown>;
  const q = quien ?? quienEsLaPieza(p, 'la pieza');
  for (const ajeno of Object.keys(p).filter((k) => !CAMPOS_DE_PIEZA.includes(k))) {
    problemas.push(
      `${q}: «${ajeno}» no es un campo de una pieza; valen ${CAMPOS_DE_PIEZA.join(', ')}`,
    );
  }
  if (typeof p.id !== 'string' || p.id === '') problemas.push(`${q} no trae id como texto`);
  if (typeof p.nombre !== 'string' || p.nombre.trim() === '') {
    problemas.push(`${q} no tiene nombre: escribe uno`);
  }
  const campos =
    typeof p.hueco === 'string' && esHuecoDeArena(p.hueco) ? camposDelHueco(p.hueco) : null;
  if (campos === null) {
    problemas.push(
      `${q} va en el hueco "${p.hueco}", que no existe; valen ${HUECOS_DE_LA_ARENA.join(', ')}`,
    );
  }
  if (!(CALIDADES as readonly unknown[]).includes(p.calidad)) {
    problemas.push(
      `${q} es de calidad "${p.calidad}", que no existe; valen ${CALIDADES.join(', ')}`,
    );
  }
  const deLaArena = p.calidad === 'arena';
  for (const campo of ['ataque', 'defensa', 'pv'] as const) {
    if (!enteroDesde(p[campo], 0)) {
      problemas.push(`${q}: ${campo} tiene que ser un entero ≥ 0 y ${comoSeLee(p[campo])}`);
    }
  }
  // La armadura es de la arena y los PV del juego (#262, decisión del usuario:
  // «por calidad»). Una pieza de la arena con PV volvería a sumar vida con la
  // regla que la armadura sustituye; una del juego con armadura cambiaría el
  // juego, que no la lee (`pnpm banco`).
  if (p.armadura !== undefined && !enteroDesde(p.armadura, 0)) {
    problemas.push(`${q}: armadura tiene que ser un entero ≥ 0 y ${comoSeLee(p.armadura)}`);
  } else if (typeof p.armadura === 'number' && p.armadura > 0 && !deLaArena) {
    problemas.push(
      `${q} es de calidad ${String(p.calidad)} y lleva armadura: la armadura es solo de la arena; fuera de ella, la pieza suma PV`,
    );
  } else if (typeof p.armadura === 'number' && p.armadura > ARMADURA_MAXIMA_DE_PIEZA) {
    problemas.push(`${q}: la armadura va de 0 a ${ARMADURA_MAXIMA_DE_PIEZA} y es ${p.armadura}`);
  }
  if (deLaArena && typeof p.pv === 'number' && p.pv > 0) {
    problemas.push(
      `${q} es de la arena y suma ${p.pv} PV: en la arena se protege con armadura, que se resta de cada golpe, no con PV`,
    );
  }
  // La velocidad puede restar: es lo que hace un escudo, y el escudo TIENE que
  // restarla.
  if (!enteroDesde(p.velocidad, Number.MIN_SAFE_INTEGER)) {
    problemas.push(`${q}: velocidad tiene que ser un entero y ${comoSeLee(p.velocidad)}`);
  } else if (p.hueco === 'escudo' && (p.velocidad as number) >= 0) {
    problemas.push(
      `${q} es un escudo y tiene que restar velocidad (un número negativo), y es ${p.velocidad}`,
    );
  }
  if (p.danio !== undefined) {
    const d = p.danio;
    if (!Array.isArray(d) || d.length !== 2 || !d.every((x) => enteroDesde(x, 0))) {
      problemas.push(`${q}: danio tiene que ser [+mínimo, +máximo], dos enteros ≥ 0`);
    } else if ((d[0] as number) > (d[1] as number)) {
      problemas.push(`${q}: el daño mínimo que suma (${d[0]}) pasa del máximo (${d[1]})`);
    }
  }
  // Cada tipo, solo sus cifras (decisión del usuario, 18-10-2026: «diferencia por
  // tipo»). Solo la arena: las del juego (un accesorio que suma de todo) siguen
  // como estaban, y ya cumplen.
  if (deLaArena && campos !== null) {
    for (const cifra of CIFRAS_DEL_HUECO) {
      if (campos.cifras.includes(cifra) || !sumaAlgo(p[cifra])) continue;
      problemas.push(
        `${q} va en el hueco ${String(p.hueco)}, que no suma ${cifraDicha(cifra)}: en él una pieza de la arena suma ${campos.cifras.map(cifraDicha).join(', ')}`,
      );
    }
  }
  if (p.manos !== undefined) {
    if (p.manos !== 1 && p.manos !== 2) {
      problemas.push(`${q}: manos es 1 o 2, y es ${p.manos}`);
    } else if (campos?.conManos !== true) {
      problemas.push(
        `${q} va en el hueco ${p.hueco} y dice manos: solo un arma se lleva a dos manos`,
      );
    }
  }
  // La rueda (vuelta 2, 18-10-2026): toda arma de cuerpo a cuerpo de la arena
  // dice su nivel en los seis tipos del anillo («sin arma no se combate»), y
  // ninguna otra pieza lleva rueda.
  if (p.rueda === undefined) {
    if (golpeaEnLaRueda(p)) {
      problemas.push(
        `${q} es un arma de cuerpo a cuerpo de la arena y no dice su rueda: un nivel de 0 a ${NIVEL_MAXIMO} en ${TIPOS_DEL_ANILLO.map((t) => NOMBRE_DE_GOLPE[t]).join(', ')}`,
      );
    }
  } else if (!deLaArena) {
    problemas.push(
      `${q} es de calidad ${String(p.calidad)} y lleva rueda del golpe: la rueda es solo de la arena`,
    );
  } else if (campos !== null && !campos.conRueda) {
    problemas.push(
      `${q} va en el hueco ${String(p.hueco)} y lleva rueda del golpe: solo un arma de cuerpo a cuerpo o de carga golpea en ella`,
    );
  } else {
    problemas.push(...problemasDeNiveles(p.rueda, q));
  }
  const precio = (p.precio ?? null) as Record<string, unknown> | null;
  if (precio === null || typeof precio !== 'object' || Object.keys(precio).length === 0) {
    problemas.push(`${q} no trae precio`);
  } else {
    for (const [recurso, cifra] of Object.entries(precio)) {
      if (!(RESOURCE_KINDS as readonly string[]).includes(recurso)) {
        problemas.push(
          `${q} cuesta "${recurso}", que no es un recurso; valen ${RESOURCE_KINDS.join(', ')}`,
        );
      } else if (deLaArena && recurso !== 'gold') {
        problemas.push(
          `${q} es de la arena y cuesta ${NOMBRE_DE_RECURSO[recurso as ResourceKind]}: en la arena el precio es solo en oro`,
        );
      } else if (!enteroDesde(cifra, 0)) {
        problemas.push(
          typeof cifra === 'number' && Number.isFinite(cifra)
            ? `${q} cuesta ${cifra} de ${NOMBRE_DE_RECURSO[recurso as ResourceKind]}: tiene que ser un entero ≥ 0`
            : `${q}: el precio en ${NOMBRE_DE_RECURSO[recurso as ResourceKind]} tiene que ser un entero ≥ 0 y ${comoSeLee(cifra)}`,
        );
      }
    }
  }
  return problemas;
}

/**
 * Lo que no vale de los extras de la rueda de una pieza con base
 * (`ExtrasDePieza.rueda`): un objeto con tipos del anillo (`TIPOS_DEL_ANILLO`) y
 * niveles con signo. Si el nivel final queda de 0 a 6 no se mira aquí: lo dice la
 * pieza resuelta (`problemasDeNiveles`, desde `problemasDePieza`).
 */
function problemasDeRueda(rueda: unknown, q: string): string[] {
  if (typeof rueda !== 'object' || rueda === null || Array.isArray(rueda)) {
    return [`${q}: la rueda tiene que ser un objeto con un número por tipo de golpe`];
  }
  const problemas: string[] = [];
  for (const [tipo, cifra] of Object.entries(rueda)) {
    if (!esTipoDelAnillo(tipo)) {
      problemas.push(fueraDelAnillo(tipo, q));
    } else if (!enteroDesde(cifra, Number.MIN_SAFE_INTEGER)) {
      problemas.push(
        `${q}: lo que sube el nivel de ${tipo} tiene que ser un entero y ${comoSeLee(cifra)}`,
      );
    }
  }
  return problemas;
}

/**
 * Lo que no vale de UNA pieza con base (`PiezaConBase`), cada cosa con su frase:
 * sus campos, el id, el nombre, la base (otra pieza, no ella misma) y la forma de
 * los extras (`FORMA_DE_LOS_EXTRAS`), enteros con signo. Que la base exista, sea
 * de la arena y no dé la vuelta lo dice `baseBlocker`, y que la pieza resuelta
 * valga, `resolverBases`.
 */
export function problemasDePiezaConBase(bruta: unknown, quien?: string): string[] {
  if (typeof bruta !== 'object' || bruta === null || Array.isArray(bruta)) {
    return [`${quien ?? 'la pieza'} no es un objeto`];
  }
  const p = bruta as Record<string, unknown>;
  const q = quien ?? quienEsLaPieza(p, 'la pieza');
  const problemas: string[] = [];
  for (const ajeno of Object.keys(p).filter((k) => !CAMPOS_DE_PIEZA_CON_BASE.includes(k))) {
    problemas.push(
      CAMPOS_DE_PIEZA.includes(ajeno)
        ? `${q} tiene base y escribe «${ajeno}»: con base se escriben solo sus extras; el hueco, la calidad, las manos y los PV son los de la base`
        : `${q}: «${ajeno}» no es un campo de una pieza con base; valen ${CAMPOS_DE_PIEZA_CON_BASE.join(', ')}`,
    );
  }
  if (typeof p.id !== 'string' || p.id === '') problemas.push(`${q} no trae id como texto`);
  if (typeof p.nombre !== 'string' || p.nombre.trim() === '') {
    problemas.push(`${q} no tiene nombre: escribe uno`);
  }
  if (typeof p.base !== 'string' || p.base === '') {
    problemas.push(`${q}: la base es el id de otra pieza, como texto`);
  } else if (p.base === p.id) {
    problemas.push(suPropiaBase(q));
  }
  const x = p.extras;
  if (typeof x !== 'object' || x === null || Array.isArray(x)) {
    problemas.push(`${q}: los extras tienen que ser un objeto (vacío si no suma nada)`);
    return problemas;
  }
  const e = x as Record<string, unknown>;
  for (const ajeno of Object.keys(e).filter((k) => !CAMPOS_DE_EXTRAS.includes(k))) {
    problemas.push(
      `${q}: «${ajeno}» no es un extra de una pieza; valen ${CAMPOS_DE_EXTRAS.join(', ')}`,
    );
  }
  const conSigno = (n: unknown): boolean => enteroDesde(n, Number.MIN_SAFE_INTEGER);
  for (const campo of EXTRAS) {
    const v = e[campo];
    if (v === undefined) continue;
    switch (FORMA_DE_LOS_EXTRAS[campo]) {
      case 'numero':
        if (!conSigno(v)) {
          problemas.push(`${q}: el extra de ${campo} tiene que ser un entero y ${comoSeLee(v)}`);
        }
        break;
      case 'par':
        if (!Array.isArray(v) || v.length !== 2 || !v.every(conSigno)) {
          problemas.push(`${q}: el extra de daño tiene que ser [+mínimo, +máximo], dos enteros`);
        }
        break;
      case 'porTipo':
        problemas.push(...problemasDeRueda(v, q));
        break;
    }
  }
  return problemas;
}

/**
 * Cómo se dice lo que trae un campo que tenía que ser un número: «es 1.5», o que
 * no es un número (un campo vacío llegaba como `NaN` y se leía «y es NaN»).
 */
function comoSeLee(x: unknown): string {
  return typeof x === 'number' && Number.isFinite(x) ? `es ${x}` : 'no es un número';
}

/** Por qué una pieza no vale, la primera cosa (`problemasDePieza`), o `null` si vale. */
export function piezaBlocker(bruta: unknown): string | null {
  return problemasDePieza(bruta)[0] ?? null;
}

/** Los extras de una rueda sin los tipos que no cambian, o `undefined` si no cambia ninguno. */
function ruedaSinCeros(r: ExtrasDeLaRueda | undefined): ExtrasDeLaRueda | undefined {
  if (r === undefined) return undefined;
  const suma = TIPOS_DEL_ANILLO.filter((t) => (r[t] ?? 0) !== 0).map((t) => [t, r[t]] as const);
  return suma.length === 0 ? undefined : Object.fromEntries(suma);
}

/**
 * Los niveles de una rueda en el orden del anillo, **los seis**: un 0 es un nivel,
 * no un «nada» (quitarlo dejaría el arma sin decir su rueda). Lo que falte, a 0;
 * lo juzga la regla de una pieza.
 */
function nivelesEnOrden(r: ExtrasDeLaRueda): NivelesDeLaRueda {
  return Object.fromEntries(TIPOS_DEL_ANILLO.map((t) => [t, r[t] ?? 0])) as NivelesDeLaRueda;
}

/**
 * Una pieza ya válida escrita siempre igual: los campos en su orden, sin lo que no
 * suma nada (`armadura` 0, `danio` sin máximo, una mano), la rueda entera en el
 * orden del anillo (`nivelesEnOrden`: un nivel 0 se escribe) y el
 * precio sin los ceros (en oro si no cuesta nada). Es la forma que comparan
 * `mismaPieza` y el sello de la arena: el catálogo (`validarEquipo`), la arena
 * (`validarPiezaDeArena`) y la suma de una base (`resolverBases`) escriben así.
 * Una pieza del juego sale con los mismos campos que en el fichero (el banco).
 */
export function piezaCanonica(p: Pieza): Pieza {
  const danio = p.danio !== undefined && p.danio[1] > 0 ? p.danio : undefined;
  const rueda = p.rueda === undefined ? undefined : nivelesEnOrden(p.rueda);
  const precio = Object.fromEntries(
    RESOURCE_KINDS.filter((k) => (p.precio[k] ?? 0) > 0).map((k) => [k, p.precio[k]]),
  ) as Partial<Resources>;
  return {
    id: p.id,
    nombre: p.nombre,
    hueco: p.hueco,
    calidad: p.calidad,
    ataque: p.ataque,
    defensa: p.defensa,
    pv: p.pv,
    ...((p.armadura ?? 0) > 0 ? { armadura: p.armadura } : {}),
    velocidad: p.velocidad,
    ...(danio === undefined ? {} : { danio: [danio[0], danio[1]] as const }),
    ...(p.manos === 2 ? { manos: 2 as const } : {}),
    ...(rueda === undefined ? {} : { rueda }),
    precio: Object.keys(precio).length === 0 ? { gold: 0 } : precio,
  };
}

/** Una pieza con base ya válida escrita siempre igual: los extras en su orden y sin ceros. */
export function piezaConBaseCanonica(p: PiezaConBase): PiezaConBase {
  const x = p.extras;
  const extras: Record<string, unknown> = {};
  for (const campo of EXTRAS) {
    if (!sumaAlgo(x[campo])) continue;
    if (campo === 'rueda') extras.rueda = ruedaSinCeros(x.rueda);
    else if (campo === 'danio') extras.danio = [x.danio?.[0], x.danio?.[1]];
    else extras[campo] = x[campo];
  }
  return { id: p.id, nombre: p.nombre, base: p.base, extras: extras as ExtrasDePieza };
}

/**
 * Lo que suma la pieza `p`, como extras sobre nada (`ExtrasEnteros`): sus cifras,
 * su daño, su rueda y su precio en oro. Con `conLosExtras`, la ficha edita una
 * pieza entera como edita los extras de una con base.
 */
export function extrasDe(p: Pieza): ExtrasEnteros {
  return {
    ataque: p.ataque,
    defensa: p.defensa,
    armadura: p.armadura ?? 0,
    velocidad: p.velocidad,
    danio: p.danio ?? [0, 0],
    rueda: p.rueda ?? {},
    oro: p.precio.gold ?? 0,
  };
}

/**
 * La pieza `p` sumando `x` (lo que no trae, 0) en lugar de lo suyo, **sin
 * juzgar**: su id, su nombre, su hueco, su calidad, sus PV y sus manos se quedan.
 * La inversa de `extrasDe`. La rueda, los seis niveles si `p` la lleva o `x` sube
 * alguno: así un extra de rueda sobre un arco llega a la pieza resuelta y lo
 * rechaza su regla, en lugar de perderse.
 */
export function conLosExtras(p: Pieza, x: ExtrasDePieza): Pieza {
  const conRueda = p.rueda !== undefined || sumaAlgo(x.rueda);
  return {
    id: p.id,
    nombre: p.nombre,
    hueco: p.hueco,
    calidad: p.calidad,
    ataque: x.ataque ?? 0,
    defensa: x.defensa ?? 0,
    pv: p.pv,
    armadura: x.armadura ?? 0,
    velocidad: x.velocidad ?? 0,
    danio: x.danio ?? [0, 0],
    ...(p.manos === undefined ? {} : { manos: p.manos }),
    ...(conRueda ? { rueda: nivelesEnOrden(x.rueda ?? {}) } : {}),
    precio: { ...p.precio, gold: x.oro ?? 0 },
  };
}

/**
 * `a` más `b` por `signo`, extra a extra (`FORMA_DE_LOS_EXTRAS`): los números, el
 * daño por componentes y la rueda por tipo. Con `+1` es la suma de una base
 * (`sumarBase`); con `−1`, su inversa (`diferenciaDe`). Los ceros se quedan: los
 * quita la forma canónica.
 */
function sumarExtras(a: ExtrasDePieza, b: ExtrasDePieza, signo: 1 | -1): ExtrasEnteros {
  const mas = (x: number | undefined, y: number | undefined): number => (x ?? 0) + signo * (y ?? 0);
  const numeros = Object.fromEntries(EXTRAS_NUMERICOS.map((c) => [c, mas(a[c], b[c])])) as Record<
    ExtraNumerico,
    number
  >;
  return {
    ...numeros,
    danio: [mas(a.danio?.[0], b.danio?.[0]), mas(a.danio?.[1], b.danio?.[1])],
    rueda: Object.fromEntries(TIPOS_DEL_ANILLO.map((t) => [t, mas(a.rueda?.[t], b.rueda?.[t])])),
  };
}

/**
 * La pieza `e` sobre su base `base`, sumada y **sin juzgar** (`sumarExtras`): lo de
 * la base más los extras; el hueco, la calidad, los PV y las manos, de la base. La
 * juzga `resolverEscritas` antes de escribirla canónica: un daño que se queda en
 * negativo tiene que poder verse.
 */
function sumarBase(base: Pieza, e: PiezaConBase): Pieza {
  const suma = conLosExtras(base, sumarExtras(extrasDe(base), e.extras, 1));
  return { ...suma, id: e.id, nombre: e.nombre };
}

/**
 * Los extras que llevan de `base` a lo que suma `final`: la inversa de la suma de
 * una base. Con ellos, cambiar de base conserva lo que suma una pieza (`conBase`).
 */
export function diferenciaDe(final: Pieza, base: Pieza): ExtrasEnteros {
  return sumarExtras(extrasDe(final), extrasDe(base), -1);
}

/** «X no puede ser su propia base»: la forma de una pieza y la regla de una base lo dicen igual. */
function suPropiaBase(q: string): string {
  return `${q} no puede ser su propia base`;
}

/**
 * Por qué la pieza `quien` no puede ir sobre la de id `base`, o `null`. **La regla
 * de una base, en un sitio**: la base existe, no es ella misma, no está sobre ella
 * (sus bases darían la vuelta), es de la arena y, si se dice `hueco`, va en él
 * (cambiar de base no cambia de hueco). `escritas` dice cómo está escrita cada
 * pieza (`conElFichero`). La leen la suma de las bases (`resolverEscritas`), el
 * cambio de base (`conBase`) y lo que ofrece el desplegable «Base»
 * (`basesPosibles`). Si la base misma está rota, no se mira aquí: lo dice ella.
 */
export function baseBlocker(
  quien: { readonly id: string; readonly nombre: string },
  base: string,
  escritas: ReadonlyMap<string, PiezaEscrita>,
  hueco?: HuecoDeArena,
): string | null {
  const q = `«${quien.nombre}»`;
  if (base === quien.id) return suPropiaBase(q);
  const b = escritas.get(base);
  if (b === undefined) return `${q} toma de base «${base}», que no existe`;
  // De la base a su raíz, la que está entera: si pasa por `quien`, da la vuelta.
  const cadena: PiezaEscrita[] = [b];
  let raiz: PiezaEscrita = b;
  while (esPiezaConBase(raiz)) {
    if (raiz.base === quien.id) {
      const vuelta = [quien, ...cadena, quien].map((x) => `«${x.nombre}»`).join(' → ');
      return `${q}: sus bases dan la vuelta (${vuelta}); una pieza no puede estar sobre sí misma`;
    }
    const siguiente = escritas.get(raiz.base);
    if (siguiente === undefined || cadena.includes(siguiente)) return null;
    cadena.push(siguiente);
    raiz = siguiente;
  }
  if (raiz.calidad !== 'arena') {
    return `${q} toma de base «${b.nombre}», que no es de la arena: solo se parte de una pieza de la arena`;
  }
  if (hueco !== undefined && raiz.hueco !== hueco) {
    return `«${b.nombre}» va en ${NOMBRE_DE_HUECO[raiz.hueco]} y ${q} en ${NOMBRE_DE_HUECO[hueco]}: la base es del mismo hueco`;
  }
  return null;
}

/** Lo que sale de resolver unas piezas escritas: las resueltas, las escritas y lo que no vale, por id. */
export interface ResolucionDePiezas {
  /** Las que valen, resueltas, en el orden de las escritas. */
  readonly piezas: ReadonlyMap<string, Pieza>;
  readonly escritas: ReadonlyMap<string, PiezaEscrita>;
  /** Las que no valen, con su motivo; la que depende de una que no vale tampoco. */
  readonly problemas: ReadonlyMap<string, string>;
}

/**
 * Cada pieza de `escritas` resuelta: la entera, tal cual; la que tiene base, su
 * base resuelta más sus extras (`sumarBase`), en cadena. No vale (con su motivo):
 * la base que no puede ser (`baseBlocker`), la pieza resuelta que no cumple la
 * regla de una pieza (`problemasDePieza`) y la que tiene el id de una de `fijas`
 * (las del fichero, en la arena) y no va en su hueco. La que depende de una que
 * no vale tampoco vale, y lo dice. **La única suma de una base**: la llaman el
 * cargador del catálogo y `resolverBases`.
 */
function resolverEscritas(
  escritas: ReadonlyMap<string, PiezaEscrita>,
  fijas: ReadonlyMap<string, Pieza> = new Map(),
  rotas: ReadonlyMap<string, PiezaRota> = new Map(),
): ResolucionDePiezas {
  const hechas = new Map<string, Pieza>();
  const problemas = new Map<string, string>();
  // Sin pila: `baseBlocker` no deja recorrer una base que dé la vuelta.
  const resolver = (id: string): Pieza | null => {
    const ya = hechas.get(id);
    if (ya !== undefined) return ya;
    if (problemas.has(id)) return null;
    const r = resolverUna(escritas.get(id) as PiezaEscrita);
    if (typeof r === 'string') {
      problemas.set(id, r);
      return null;
    }
    hechas.set(id, r);
    return r;
  };
  const resolverUna = (e: PiezaEscrita): Pieza | string => {
    const q = `«${e.nombre}»`;
    let p: Pieza;
    if (!esPiezaConBase(e)) {
      p = e;
    } else {
      // Una base que se leyó y no vale no «no existe»: no vale, y se dice por qué.
      const rota = escritas.has(e.base) ? undefined : rotas.get(e.base);
      if (rota !== undefined) return suBaseNoVale(q, rota.nombre, rota.motivo);
      const mal = baseBlocker(e, e.base, escritas);
      if (mal !== null) return mal;
      const b = resolver(e.base);
      if (b === null) {
        const nombre = escritas.get(e.base)?.nombre ?? e.base;
        return suBaseNoVale(q, nombre, problemas.get(e.base) ?? '');
      }
      const suma = sumarBase(b, e);
      const suyos = problemasDePieza(suma, `${q} (sobre «${b.nombre}»)`);
      if (suyos.length > 0) return suyos.join('; ');
      p = piezaCanonica(suma);
    }
    const fija = fijas.get(e.id);
    if (fija !== undefined && fija.hueco !== p.hueco) {
      return `${q} es una pieza de data/equipo.json y va en ${NOMBRE_DE_HUECO[fija.hueco]}: su hueco no se cambia en la arena (crea una nueva)`;
    }
    return p;
  };
  for (const id of escritas.keys()) resolver(id);
  const piezas = new Map<string, Pieza>();
  for (const id of escritas.keys()) {
    const p = hechas.get(id);
    if (p !== undefined) piezas.set(id, p);
  }
  return { piezas, escritas, problemas };
}

/** «X: su base «Y» no vale (por qué)»: la que está sobre una que no vale. */
function suBaseNoVale(q: string, base: string, motivo: string): string {
  return `${q}: su base «${base}» no vale (${motivo})`;
}

/** Una pieza que se leyó y no vale (de un borrador), con su nombre y su motivo. */
export interface PiezaRota {
  readonly nombre: string;
  readonly motivo: string;
}

/**
 * Las piezas del fichero (`EQUIPO_ESCRITO`) con `encima` encima, como están
 * escritas, por id: una con el id de otra la sustituye y una nueva va detrás. Lo
 * que resuelve `resolverBases`, y por donde la arena sigue una cadena de bases
 * sin resolverla (`piezasDelMontaje`, `piezasDelEnlace`, lo que se borra).
 */
export function conElFichero(encima: readonly PiezaEscrita[]): ReadonlyMap<string, PiezaEscrita> {
  const escritas = new Map<string, PiezaEscrita>(EQUIPO_ESCRITO.map((p) => [p.id, p]));
  for (const p of encima) escritas.set(p.id, p);
  return escritas;
}

/**
 * Las piezas del fichero con `encima` encima (`conElFichero`), cada una resuelta
 * (`resolverEscritas`): la entera tal cual y la que tiene base, su base más sus
 * extras, en cadena; una con el id de una del fichero no cambia de hueco. Las
 * `rotas` (las de un borrador que no se leyeron) no están, pero lo que va sobre
 * ellas dice por qué no vale. **La única suma de una base** (lo vigila
 * `test/invariantes.test.ts`): la leen el catálogo de la arena
 * (`catalogoDeLaArena`, su borrador) y las piezas de una pelea
 * (`piezasDeLaPelea`), y el cargador del fichero hace la misma.
 */
export function resolverBases(
  encima: readonly PiezaEscrita[],
  rotas: ReadonlyMap<string, PiezaRota> = new Map(),
): ResolucionDePiezas {
  return resolverEscritas(conElFichero(encima), EQUIPO_POR_ID, rotas);
}

/**
 * Valida un catálogo de equipo y lo devuelve tipado: escrito (`escritas`, con sus
 * bases) y resuelto (`piezas`). **Lanza con todos los problemas a la vez**,
 * escritos para quien edita el JSON.
 *
 * La regla que más importa es la última: **exactamente una pieza de armería por
 * hueco**. De ella sale el equipo base de todo héroe (`equipoBase`), y con dos
 * habría que elegir cuál es «la mejor que se puede comprar» con un criterio que
 * no está en los datos; con ninguna, el héroe nacería con un hueco vacío.
 */
function leerEquipo(
  json: unknown,
  fichero: string,
): { readonly escritas: readonly PiezaEscrita[]; readonly piezas: readonly Pieza[] } {
  const problemas: string[] = [];
  const lista = ((json ?? {}) as { piezas?: unknown }).piezas;
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new Error(`${fichero}: no trae ninguna pieza en "piezas"`);
  }
  const escritas = new Map<string, PiezaEscrita>();
  for (const [i, bruta] of (lista as unknown[]).entries()) {
    const p = (bruta ?? {}) as Record<string, unknown>;
    const quien = quienEsLaPieza(p, `la pieza ${i}`);
    const conBase = typeof p === 'object' && 'base' in p;
    const suyos = conBase ? problemasDePiezaConBase(p, quien) : problemasDePieza(p, quien);
    if (typeof p.id === 'string' && escritas.has(p.id)) suyos.push(`${quien} está repetida`);
    problemas.push(...suyos);
    if (suyos.length === 0) {
      escritas.set(
        p.id as string,
        conBase
          ? piezaConBaseCanonica(p as unknown as PiezaConBase)
          : piezaCanonica(p as unknown as Pieza),
      );
    }
  }
  const resueltas = resolverEscritas(escritas);
  problemas.push(...resueltas.problemas.values());
  const piezas = [...resueltas.piezas.values()];
  // Los huecos de la arena (`distancia`, `carga`) no llevan nada del juego: el
  // juego, el botín, la armería y el agente siguen con cuatro.
  for (const p of piezas) {
    if (p.calidad !== 'arena' && esArmaPorUso(p.hueco)) {
      problemas.push(
        `"${p.id}" es de calidad ${p.calidad} y va en el hueco ${p.hueco}, que es solo de la arena: el juego tiene ${HUECOS.join(', ')}`,
      );
    }
  }
  for (const hueco of HUECOS) {
    const deArmeria = piezas.filter((p) => p.hueco === hueco && p.calidad === 'armeria');
    // El escudo no lleva ninguna: con una, todo héroe nacería con escudo, y el
    // equipo base es espada sin escudo (12-10-2026).
    if (hueco === HUECO_SIN_ARMERIA) {
      if (deArmeria.length > 0) {
        problemas.push(
          `el hueco ${hueco} tiene ${deArmeria.length} piezas de armería y no puede tener ninguna: todo héroe nacería con ${hueco}`,
        );
      }
      continue;
    }
    if (deArmeria.length !== 1) {
      problemas.push(
        `el hueco ${hueco} tiene ${deArmeria.length} piezas de armería y tiene que tener exactamente una: es el equipo base del héroe y lo que vende la armería`,
      );
    }
  }
  if (!piezas.some((p) => CALIDADES_DE_BOTIN.includes(p.calidad))) {
    problemas.push(
      `no hay ninguna pieza de botín (${CALIDADES_DE_BOTIN.join(' o ')}): el botín no tendría qué dar`,
    );
  }
  if (problemas.length > 0) throw new Error(`${fichero}: ${problemas.join('; ')}`);
  return { escritas: [...escritas.values()], piezas };
}

/**
 * Valida un catálogo de equipo y devuelve sus piezas resueltas (`leerEquipo`).
 * Exportada con el JSON de argumento por lo mismo que `validarExperiencia`: un
 * guardia que solo se prueba con el fichero bueno no se ha visto morder.
 */
export function validarEquipo(json: unknown, fichero = 'data/equipo.json'): readonly Pieza[] {
  return leerEquipo(json, fichero).piezas;
}

/** El hueco que el equipo base deja vacío: ni armería ni héroe nacido con él. */
const HUECO_SIN_ARMERIA = 'escudo' satisfies Hueco;

const EQUIPO_LEIDO = leerEquipo(equipoJson, 'data/equipo.json');

/**
 * El catálogo de equipo como está escrito en el fichero, con sus bases: de él
 * parte la arena (`resolverBases`), que compara con él lo que cambia.
 */
export const EQUIPO_ESCRITO: readonly PiezaEscrita[] = EQUIPO_LEIDO.escritas;

/**
 * El catálogo de equipo resuelto, en el orden del fichero: es el orden del sorteo
 * del botín. Las piezas con base van al final, como todo lo de la arena.
 */
export const EQUIPO: readonly Pieza[] = EQUIPO_LEIDO.piezas;

/** `EQUIPO` por id: lo que una pieza del fichero es, para que la arena no le cambie el hueco. */
const EQUIPO_POR_ID: ReadonlyMap<string, Pieza> = new Map(EQUIPO.map((p) => [p.id, p]));

/** Una barrera con su peso en un sorteo. */
export interface BarreraConPeso {
  readonly barrera: Barrera;
  readonly peso: number;
}

/**
 * Qué barrera levanta el generador en cada sitio, de `data/barreras.json`.
 * **Inventado y provisional**, como dice su `_comment`.
 */
export interface ReglasDeBarreras {
  /** Por suelo: las barreras de una frontera que lo toca. Una frontera suma las de sus dos lados. */
  readonly frontera: Readonly<Record<Suelo, readonly BarreraConPeso[]>>;
  /** Por suelo: las barreras de las manchas de dentro de una región. */
  readonly obstaculos: Readonly<Record<Suelo, readonly BarreraConPeso[]>>;
  /** Qué parte de cada región cubren los obstáculos, en % entero. */
  readonly densidadPorCiento: { readonly min: number; readonly max: number };
  /**
   * Cuántas casillas tiene una mancha. `min` vale para todas **menos la última de
   * cada región**, que se recorta a lo que falta para la densidad sorteada: con
   * regiones de treinta casillas, la diferencia entre llegar y no llegar era a
   * veces una casilla.
   */
  readonly mancha: { readonly min: number; readonly max: number };
  /**
   * Casillas de frontera que lleva, como poco, cada una de las `TIPOS_POR_MAPA`
   * barreras que el generador garantiza por mapa. Sin él la garantía era de
   * nombre: una barrera podía quedarse en dos casillas, o en ninguna si su
   * única frontera eran casillas de nodo, que `buildMap` abre (QA, semillas 864
   * y 986 en 34×34).
   */
  readonly casillasMinimasPorTipo: number;
}

/**
 * Valida la tabla de barreras y la devuelve tipada. **Lanza con todos los
 * problemas a la vez**. Exportada con el JSON de argumento, como
 * `validarEquipo`, para que el guardia se pueda ver morder con un fichero roto.
 *
 * Que estén **todos** los suelos que se pisan no es capricho: el generador
 * sortea por el suelo de cada región, y un suelo sin fila daría una frontera
 * sin candidatas a mitad de un mapa.
 */
export function validarBarreras(json: unknown, fichero = 'data/barreras.json'): ReglasDeBarreras {
  const problemas: string[] = [];
  const j = (json ?? {}) as Record<string, unknown>;
  const tabla = (campo: 'frontera' | 'obstaculos'): Record<Suelo, BarreraConPeso[]> => {
    const bruta = j[campo];
    // Se rellena entera abajo, o se lanza: el `as` es lo que tarda en llenarse.
    const salida = {} as Record<Suelo, BarreraConPeso[]>;
    if (bruta === null || typeof bruta !== 'object') {
      problemas.push(`no trae "${campo}"`);
      return salida;
    }
    for (const suelo of Object.keys(bruta)) {
      if (!(SUELOS_PISABLES as readonly string[]).includes(suelo)) {
        problemas.push(
          `"${campo}" tiene una fila para "${suelo}", que no es un suelo que se pise; valen ${SUELOS_PISABLES.join(', ')}`,
        );
      }
    }
    for (const suelo of SUELOS_PISABLES) {
      const fila = (bruta as Record<string, unknown>)[suelo];
      if (fila === null || typeof fila !== 'object' || Object.keys(fila).length === 0) {
        problemas.push(`"${campo}" no tiene fila para el suelo "${suelo}"`);
        continue;
      }
      const lista: BarreraConPeso[] = [];
      for (const [barrera, peso] of Object.entries(fila)) {
        if (!(BARRERAS as readonly string[]).includes(barrera)) {
          problemas.push(
            `"${campo}.${suelo}" pide "${barrera}", que no es una barrera; valen ${BARRERAS.join(', ')}`,
          );
        } else if (!enteroDesde(peso, 1)) {
          problemas.push(
            `"${campo}.${suelo}.${barrera}" pesa ${peso}: tiene que ser un entero > 0`,
          );
        } else {
          lista.push({ barrera: barrera as Barrera, peso });
        }
      }
      salida[suelo] = lista;
    }
    return salida;
  };
  const rango = (campo: 'densidadPorCiento' | 'mancha', desde: number, hasta: number) => {
    const r = (j[campo] ?? {}) as { min?: unknown; max?: unknown };
    if (!enteroDesde(r.min, desde) || !enteroDesde(r.max, desde) || r.max > hasta) {
      problemas.push(
        `"${campo}" tiene que llevar "min" y "max" enteros entre ${desde} y ${hasta}, y lleva ${JSON.stringify(j[campo])}`,
      );
      return { min: 0, max: 0 };
    }
    if (r.min > r.max) problemas.push(`"${campo}": min (${r.min}) es mayor que max (${r.max})`);
    return { min: r.min, max: r.max };
  };
  const frontera = tabla('frontera');
  const obstaculos = tabla('obstaculos');
  for (const suelo of SUELOS_PISABLES) {
    if (obstaculos[suelo]?.some((c) => c.barrera === 'cliff')) {
      problemas.push(
        `"obstaculos.${suelo}" pide "cliff": un acantilado dentro de una región es una mesa suelta, y el acantilado es el borde de una meseta (#143)`,
      );
    }
    if (obstaculos[suelo]?.some((c) => c.barrera === 'wall')) {
      problemas.push(
        `"obstaculos.${suelo}" pide "wall": una muralla dentro de una región es una ruina que no cierra nada, y la muralla es el cierre de un paso (#232)`,
      );
    }
  }
  const densidadPorCiento = rango('densidadPorCiento', 0, 90);
  const mancha = rango('mancha', 1, 50);
  const casillasMinimasPorTipo = j.casillasMinimasPorTipo;
  if (!enteroDesde(casillasMinimasPorTipo, 1)) {
    problemas.push(
      `"casillasMinimasPorTipo" tiene que ser un entero > 0, y lleva ${JSON.stringify(casillasMinimasPorTipo)}`,
    );
  }
  if (problemas.length > 0) throw new Error(`${fichero}: ${problemas.join('; ')}`);
  return {
    frontera,
    obstaculos,
    densidadPorCiento,
    mancha,
    casillasMinimasPorTipo: casillasMinimasPorTipo as number,
  };
}

export const BARRERAS_DEL_MAPA: ReglasDeBarreras = validarBarreras(barrerasJson);

/** Un nivel de altura con su peso en un sorteo. */
export interface NivelConPeso {
  readonly nivel: Nivel;
  readonly peso: number;
}

/**
 * A qué nivel va cada suelo, con su peso, de `data/relieve.json` (#143).
 * **Inventado y provisional**, como dice su `_comment`. Lanza con todos los
 * problemas a la vez; exportada con el JSON de argumento para que el guardia se
 * pueda ver morder con un fichero roto.
 *
 * Que estén **todos** los suelos, por lo mismo que en `validarBarreras`: el
 * generador sortea el nivel por el suelo de cada pareja, y un suelo sin fila
 * daría una región sin nivel a mitad de un mapa.
 */
export function validarRelieve(
  json: unknown,
  fichero = 'data/relieve.json',
): Readonly<Record<Suelo, readonly NivelConPeso[]>> {
  const problemas: string[] = [];
  const bruta = ((json ?? {}) as Record<string, unknown>).nivelPorSuelo;
  // Se rellena entera abajo, o se lanza.
  const salida = {} as Record<Suelo, NivelConPeso[]>;
  if (bruta === null || typeof bruta !== 'object') {
    throw new Error(`${fichero}: no trae "nivelPorSuelo"`);
  }
  for (const suelo of Object.keys(bruta)) {
    if (!(SUELOS_PISABLES as readonly string[]).includes(suelo)) {
      problemas.push(
        `"nivelPorSuelo" tiene una fila para "${suelo}", que no es un suelo que se pise; valen ${SUELOS_PISABLES.join(', ')}`,
      );
    }
  }
  for (const suelo of SUELOS_PISABLES) {
    const fila = (bruta as Record<string, unknown>)[suelo];
    if (fila === null || typeof fila !== 'object' || Object.keys(fila).length === 0) {
      problemas.push(`"nivelPorSuelo" no tiene fila para el suelo "${suelo}"`);
      continue;
    }
    const lista: NivelConPeso[] = [];
    for (const [nivel, peso] of Object.entries(fila)) {
      const n = NIVELES.find((v) => String(v) === nivel);
      if (n === undefined) {
        problemas.push(
          `"nivelPorSuelo.${suelo}" pide el nivel "${nivel}", que no existe; valen ${NIVELES.join(', ')}`,
        );
      } else if (!enteroDesde(peso, 1)) {
        problemas.push(
          `"nivelPorSuelo.${suelo}.${nivel}" pesa ${peso}: tiene que ser un entero > 0`,
        );
      } else {
        lista.push({ nivel: n, peso });
      }
    }
    // En el orden de `NIVELES`, no en el del JSON: el sorteo no depende de cómo se escribió.
    salida[suelo] = lista.sort((a, b) => a.nivel - b.nivel);
  }
  if (problemas.length > 0) throw new Error(`${fichero}: ${problemas.join('; ')}`);
  return salida;
}

export const NIVEL_POR_SUELO: Readonly<Record<Suelo, readonly NivelConPeso[]>> =
  validarRelieve(relieveJson);

/**
 * Las formas del río del generador (#144, río continuo; `core/map/rio.ts`):
 * **frontera**, de un borde a un lago central y al borde de enfrente, entre las
 * dos bases; **esquina**, de un borde a otro por la esquina sin base, y su
 * espejo; **lago**, de un borde a un lago de dentro, y su espejo.
 */
export const FORMAS_DEL_RIO = ['frontera', 'esquina', 'lago'] as const;
export type FormaDelRio = (typeof FORMAS_DEL_RIO)[number];

/** Lo que se lee de `data/rios.json`. */
export interface ReglasDelRio {
  /** El peso de cada forma en el sorteo, en el orden de `FORMAS_DEL_RIO`. */
  readonly formas: readonly { readonly forma: FormaDelRio; readonly peso: number }[];
  /** Cuántas casillas seguidas en recta lleva el río como mucho. */
  readonly tramoMaximo: number;
  /** Cuántas casillas del borde no pisa salvo en su boca. */
  readonly marco: number;
  /** El radio de sus lagos. */
  readonly radioDelLago: number;
  /** Cuántas casillas mide como poco el río de la forma lago, del lago al borde. */
  readonly cursoDelLago: number;
}

/**
 * Valida `data/rios.json` (**inventado**, como dice su `_comment`). Lanza con
 * todos los problemas a la vez; con el JSON de argumento para que el guardia
 * se pueda ver morder con un fichero roto.
 */
export function validarRios(json: unknown, fichero = 'data/rios.json'): ReglasDelRio {
  const problemas: string[] = [];
  const j = (json ?? {}) as Record<string, unknown>;
  for (const clave of Object.keys(j)) {
    if (
      !['_comment', 'formas', 'tramoMaximo', 'marco', 'radioDelLago', 'cursoDelLago'].includes(
        clave,
      )
    )
      problemas.push(`sobra la clave "${clave}"`);
  }
  const formas: { forma: FormaDelRio; peso: number }[] = [];
  const bruta = j.formas;
  if (bruta === null || typeof bruta !== 'object') {
    problemas.push('no trae "formas"');
  } else {
    for (const f of Object.keys(bruta)) {
      if (!(FORMAS_DEL_RIO as readonly string[]).includes(f))
        problemas.push(
          `"formas" trae "${f}", que no es una forma; valen ${FORMAS_DEL_RIO.join(', ')}`,
        );
    }
    for (const forma of FORMAS_DEL_RIO) {
      const peso = (bruta as Record<string, unknown>)[forma];
      if (!enteroDesde(peso, 0))
        problemas.push(
          `"formas.${forma}" pesa ${JSON.stringify(peso)}: tiene que ser un entero ≥ 0`,
        );
      else formas.push({ forma, peso });
    }
    if (formas.length === FORMAS_DEL_RIO.length && formas.every((f) => f.peso === 0))
      problemas.push('"formas" pesan todas 0: no habría río que sortear');
  }
  const entero = (clave: string, desde: number, hasta: number): number => {
    const v = j[clave];
    if (!enteroDesde(v, desde) || v > hasta) {
      problemas.push(
        `"${clave}" tiene que ser un entero de ${desde} a ${hasta}, y lleva ${JSON.stringify(v)}`,
      );
      return desde;
    }
    return v;
  };
  const tramoMaximo = entero('tramoMaximo', 2, 64);
  const marco = entero('marco', 1, 8);
  const radioDelLago = entero('radioDelLago', 1, 5);
  const cursoDelLago = entero('cursoDelLago', 1, 64);
  if (problemas.length > 0) throw new Error(`${fichero}: ${problemas.join('; ')}`);
  return { formas, tramoMaximo, marco, radioDelLago, cursoDelLago };
}

export const RIOS: ReglasDelRio = validarRios(riosJson);
