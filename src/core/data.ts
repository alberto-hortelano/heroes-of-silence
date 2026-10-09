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
import relieveJson from '../../data/relieve.json' with { type: 'json' };
import tiposDeHeroeJson from '../../data/tipos-de-heroe.json' with { type: 'json' };
import {
  BARRERAS,
  type Barrera,
  NIVELES,
  type Nivel,
  SUELOS_PISABLES,
  type Suelo,
} from './map/terrain.js';
import type {
  Creature,
  CreatureTrait,
  FactionId,
  Hueco,
  Resources,
  SpeedTier,
  UnitInfo,
} from './types.js';
import { FACTION_IDS, HUECOS, RESOURCE_KINDS, SPEED_TIERS } from './types.js';

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
 * De dónde sale una pieza, que es lo que la calidad decide (decisión del usuario,
 * 02-10-2026): `comun` cae como botín; `armeria` la vende la armería y es lo que
 * todo héroe trae de serie —una por hueco, la mejor que se compra—; `especial`
 * cae como botín y trae otra clase de ventaja. Es una propiedad de la pieza y no
 * una lista aparte, para que «calidad de armería» se pueda preguntar a la pieza.
 */
export const CALIDADES = ['comun', 'armeria', 'especial'] as const;

export type Calidad = (typeof CALIDADES)[number];

/** Una pieza de `data/equipo.json`. **Inventada y provisional**, como dice su `_comment`. */
export interface Pieza {
  readonly id: string;
  readonly nombre: string;
  readonly hueco: Hueco;
  readonly calidad: Calidad;
  readonly ataque: number;
  readonly defensa: number;
  readonly pv: number;
  /** Escalones de velocidad que sube a quien la lleva, sin pasar del último. */
  readonly velocidad: number;
  readonly precio: Partial<Resources>;
}

/**
 * Valida un catálogo de equipo y lo devuelve tipado. **Lanza con todos los
 * problemas a la vez**, escritos para quien edita el JSON. Exportada con el
 * JSON de argumento por lo mismo que `validarExperiencia`: un guardia que solo
 * se prueba con el fichero bueno no se ha visto morder.
 *
 * La regla que más importa es la última: **exactamente una pieza de armería por
 * hueco**. De ella sale el equipo base de todo héroe (`equipoBase`), y con dos
 * habría que elegir cuál es «la mejor que se puede comprar» con un criterio que
 * no está en los datos; con ninguna, el héroe nacería con un hueco vacío.
 */
export function validarEquipo(json: unknown, fichero = 'data/equipo.json'): readonly Pieza[] {
  const problemas: string[] = [];
  const lista = ((json ?? {}) as { piezas?: unknown }).piezas;
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new Error(`${fichero}: no trae ninguna pieza en "piezas"`);
  }
  const piezas: Pieza[] = [];
  const vistos = new Set<string>();
  for (const [i, bruta] of (lista as Record<string, unknown>[]).entries()) {
    const p = bruta ?? {};
    const quien = typeof p.id === 'string' && p.id !== '' ? `"${p.id}"` : `la pieza ${i}`;
    const antes = problemas.length;
    for (const campo of ['id', 'nombre'] as const) {
      if (typeof p[campo] !== 'string' || p[campo] === '') {
        problemas.push(`${quien} no trae ${campo} como texto`);
      }
    }
    if (typeof p.id === 'string' && vistos.has(p.id)) problemas.push(`${quien} está repetida`);
    if (typeof p.id === 'string') vistos.add(p.id);
    if (!(HUECOS as readonly unknown[]).includes(p.hueco)) {
      problemas.push(
        `${quien} va en el hueco "${p.hueco}", que no existe; valen ${HUECOS.join(', ')}`,
      );
    }
    if (!(CALIDADES as readonly unknown[]).includes(p.calidad)) {
      problemas.push(
        `${quien} es de calidad "${p.calidad}", que no existe; valen ${CALIDADES.join(', ')}`,
      );
    }
    for (const campo of ['ataque', 'defensa', 'pv', 'velocidad'] as const) {
      if (!enteroDesde(p[campo], 0)) {
        problemas.push(`${quien}: ${campo} tiene que ser un entero ≥ 0 y es ${p[campo]}`);
      }
    }
    const precio = (p.precio ?? null) as Record<string, unknown> | null;
    if (precio === null || typeof precio !== 'object' || Object.keys(precio).length === 0) {
      problemas.push(`${quien} no trae precio`);
    } else {
      for (const [recurso, cifra] of Object.entries(precio)) {
        if (!(RESOURCE_KINDS as readonly string[]).includes(recurso)) {
          problemas.push(
            `${quien} cuesta "${recurso}", que no es un recurso; valen ${RESOURCE_KINDS.join(', ')}`,
          );
        } else if (!enteroDesde(cifra, 0)) {
          problemas.push(`${quien} cuesta ${cifra} de ${recurso}: tiene que ser un entero ≥ 0`);
        }
      }
    }
    if (problemas.length === antes) piezas.push(p as unknown as Pieza);
  }
  for (const hueco of HUECOS) {
    const deArmeria = piezas.filter((p) => p.hueco === hueco && p.calidad === 'armeria');
    if (deArmeria.length !== 1) {
      problemas.push(
        `el hueco ${hueco} tiene ${deArmeria.length} piezas de armería y tiene que tener exactamente una: es el equipo base del héroe y lo que vende la armería`,
      );
    }
  }
  if (!piezas.some((p) => p.calidad !== 'armeria')) {
    problemas.push('no hay ninguna pieza de botín (común o especial): el botín no tendría qué dar');
  }
  if (problemas.length > 0) throw new Error(`${fichero}: ${problemas.join('; ')}`);
  return piezas;
}

/** El catálogo de equipo, en el orden del fichero: es el orden del sorteo del botín. */
export const EQUIPO: readonly Pieza[] = validarEquipo(equipoJson);

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
