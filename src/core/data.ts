/**
 * Las tablas de datos del juego (`data/*.json`), leídas y validadas al cargar.
 * El catálogo de unidades no está aquí: lo lee `core/catalogo.ts`, que necesita
 * el equipo y el nivel, y desde aquí sería un ciclo.
 */
import asaltantesJson from '../../data/asaltantes.json' with { type: 'json' };
import barrerasJson from '../../data/barreras.json' with { type: 'json' };
import economiaJson from '../../data/economia.json' with { type: 'json' };
import equipoJson from '../../data/equipo.json' with { type: 'json' };
import experienciaJson from '../../data/experiencia.json' with { type: 'json' };
import faccionesJson from '../../data/facciones.json' with { type: 'json' };
import figurasDeHeroeJson from '../../data/figuras-de-heroe.json' with { type: 'json' };
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
import { type GolpeDeReferencia, RUEDA_DE_REFERENCIA } from './battle/formas-de-la-rueda.js';
import {
  BARRERAS,
  type Barrera,
  NIVELES,
  type Nivel,
  SUELOS_PISABLES,
  type Suelo,
} from './map/terrain.js';
import type {
  CifraDePieza,
  CreatureTrait,
  Equipo,
  ExtrasDeLaRueda,
  FactionId,
  HuecoDePieza,
  NivelesDeLaRueda,
  UnitInfo,
} from './types.js';
import {
  CIFRAS_DE_PIEZA,
  camposDelHueco,
  esHueco,
  esHuecoDePieza,
  esTipoDelAnillo,
  FACTION_IDS,
  HUECOS,
  HUECOS_DE_PIEZA,
  NOMBRE_DE_CIFRA,
  NOMBRE_DE_HUECO,
  TIPOS_DEL_ANILLO,
} from './types.js';
import {
  enteroBlocker,
  esIdDePieza,
  esIdDeUnidad,
  problemasDeObjeto,
  revisarLista,
} from './validar.js';

/**
 * Un entero que se puede sumar sin perder bits, y ≥ `desde`. Es la única forma
 * en que este módulo pregunta «¿es un entero válido?» a lo que lee de un JSON:
 * los grupos de tropa, las reglas de los asaltantes y las de la experiencia.
 * `isSafeInteger` y no `isInteger`, por lo mismo que `entorno.ts`: `1e21` es
 * entero y no se puede sumar.
 */
export function enteroDesde(v: unknown, desde: number): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= desde;
}

export function hasTrait(c: UnitInfo, trait: CreatureTrait): boolean {
  return c.traits?.includes(trait) ?? false;
}

/**
 * Tira quien lleva un arma en el hueco `distancia`: llevarla ya es disparar, sin
 * munición que contar (13-10-2026; el guardabosques también, con su arco). Lee
 * `equipo` y no `armas`: la lista de armas por uso la escribe `conEquipo` para el
 * daño, y el hueco puesto es el hecho.
 */
export function isShooter(c: UnitInfo): boolean {
  return c.equipo?.distancia !== undefined;
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
   * Los topes de individuos por bando que se pueden elegir (complejidad del
   * combate, 22-10-2026: 3, 5 y 7), de menos a más. El de cada partida es
   * `ReglasDelCombate.tope` (`core/combate.ts`).
   */
  readonly topesPorBando: readonly number[];
  /**
   * El mayor de `topesPorBando`, **derivado**: el techo de los datos (guarniciones,
   * asaltantes, un plan de mapa) y del generador, que no dependen del tope de la
   * partida (misma semilla, mismo mapa). Un héroe es él más `maxPorBando − 1` de
   * tropa; un monstruo o una guarnición, `maxPorBando`.
   */
  readonly maxPorBando: number;
}

/**
 * Los topes de `data/liderazgo.json`: enteros ≥ 2 (un héroe y uno de tropa), de
 * menos a más y sin repetir. Lanza diciendo el fichero.
 */
function topesDe(valor: unknown): readonly number[] {
  const bien =
    Array.isArray(valor) &&
    valor.length > 0 &&
    valor.every(
      (v, i) => enteroDesde(v, 2) && (i === 0 || (v as number) > (valor[i - 1] as number)),
    );
  if (!bien) {
    throw new Error(
      `data/liderazgo.json: topesPorBando tiene que ser una lista de enteros ≥ 2, de menos a más y sin repetir, y es ${JSON.stringify(valor)}`,
    );
  }
  return valor as number[];
}

const TOPES_POR_BANDO = topesDe(liderazgoJson.topesPorBando);

export const LIDERAZGO: ReglasDeLiderazgo = {
  heroe: { ...liderazgoJson.heroe },
  guarnicion: liderazgoJson.guarnicion,
  personaje: liderazgoJson.personaje,
  topesPorBando: TOPES_POR_BANDO,
  maxPorBando: TOPES_POR_BANDO.at(-1) as number,
};

/**
 * El héroe como figura del tablero y el precio de rendirse, de
 * `data/heroe.json`. **Inventado y provisional**, y así lo dice su `_comment`:
 * en fheroes2 el héroe no pisa el tablero, así que no hay fila que copiar.
 */
export interface ReglasDelHeroe {
  readonly combate: {
    readonly pv: { readonly base: number; readonly porRango: number };
    /** La fuerza del héroe recién hecho y lo que sube cada rango (25-10-2026). */
    readonly fuerza: { readonly base: number; readonly porRango: number };
    /** La agilidad del cuerpo del héroe: la de un humano de a pie. */
    readonly agilidad: number;
    readonly ataquePorRango: number;
    /** Lo que sube su Defensa cada rango: suma a la defensa, no a la agilidad. */
    readonly defensaPorRango: number;
  };
  readonly rendicion: { readonly porcentajeDelOro: number };
  /**
   * Con lo que nace todo héroe: un id de pieza por hueco (decisión del usuario,
   * 18-10-2026: la Espada y el gambesón). Aquí solo se comprueba que los huecos
   * existan; que las piezas existan y casen lo comprueba `EQUIPO_BASE`
   * (`hero/equipo.ts`) al cargar, con el catálogo de equipo.
   */
  readonly equipoBase: Equipo;
}

/** El equipo base de `data/heroe.json`, con sus huecos comprobados. */
function equipoBaseDelHeroe(valor: unknown): Equipo {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new Error(
      'data/heroe.json: equipoBase tiene que ser un objeto con un id de pieza por hueco',
    );
  }
  for (const [hueco, id] of Object.entries(valor)) {
    if (!esHueco(hueco)) {
      throw new Error(
        `data/heroe.json: equipoBase pone algo en "${hueco}", que no es un hueco; valen ${HUECOS.join(', ')}`,
      );
    }
    if (typeof id !== 'string') {
      throw new Error(`data/heroe.json: equipoBase no trae el id de una pieza en ${hueco}`);
    }
  }
  return valor as Equipo;
}

/**
 * El cuerpo del héroe de `data/heroe.json`, comprobado: un JSON se edita a mano, y
 * una cifra mal escrita se dice al cargar, no en la batalla. Lo de antes (`danio`,
 * `velocidad`) no vale: la fuerza y la agilidad lo sustituyen (25-10-2026).
 */
function combateDelHeroe(c: unknown): ReglasDelHeroe['combate'] {
  const campos = ['pv', 'fuerza', 'agilidad', 'ataquePorRango', 'defensaPorRango'];
  const problemas = problemasDeObjeto(c, campos).map((p) => `combate: ${p}`);
  const j = (c ?? {}) as Record<string, unknown>;
  const entero = (ruta: string, v: unknown, desde: number): void => {
    const motivo = enteroBlocker(v, desde);
    if (motivo !== null) problemas.push(`combate.${ruta} ${motivo}`);
  };
  const conRango = (k: string, desde: number): { base: number; porRango: number } => {
    problemas.push(
      ...problemasDeObjeto(j[k], ['base', 'porRango']).map((p) => `combate.${k}: ${p}`),
    );
    const v = (j[k] ?? {}) as Record<string, unknown>;
    entero(`${k}.base`, v.base, desde);
    entero(`${k}.porRango`, v.porRango, 0);
    return { base: v.base as number, porRango: v.porRango as number };
  };
  const pv = conRango('pv', 1);
  const fuerza = conRango('fuerza', 1);
  entero('agilidad', j.agilidad, 1);
  entero('ataquePorRango', j.ataquePorRango, 0);
  entero('defensaPorRango', j.defensaPorRango, 0);
  if (problemas.length > 0) throw new Error(`data/heroe.json: ${problemas.join('; ')}`);
  return {
    pv,
    fuerza,
    agilidad: j.agilidad as number,
    ataquePorRango: j.ataquePorRango as number,
    defensaPorRango: j.defensaPorRango as number,
  };
}

export const HEROE: ReglasDelHeroe = {
  combate: combateDelHeroe(heroeJson.combate),
  rendicion: { ...heroeJson.rendicion },
  equipoBase: equipoBaseDelHeroe(heroeJson.equipoBase),
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
  // Cada composición (unidades que existan, cupo, liderazgo y fuerza) la mira
  // `state/asaltantes.ts` al cargar: pide el catálogo de unidades y la fuerza, y
  // desde aquí serían ciclos.
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
  /**
   * Lo que suma cada rango por encima del 1 al ataque, la fuerza y la agilidad del
   * cuerpo (25-10-2026: la defensa ya no se escribe, sale de la agilidad).
   */
  readonly porRango: {
    readonly ataque: number;
    readonly fuerza: number;
    readonly agilidad: number;
  };
}

/**
 * Valida unas reglas de experiencia y las devuelve tipadas. **Lanza con todos los
 * problemas a la vez**, escritos para quien edita el JSON. Exportada con el JSON
 * de argumento para que un test pueda darle uno roto y verla morder.
 *
 * Las habilidades por rango de cada criatura (inertes) se fueron con
 * `data/creatures.json` (19-10-2026): las unidades del catálogo llevan las suyas
 * (`Unidad.habilidades`), y un campo `habilidades` aquí se rechaza.
 */
export function validarExperiencia(
  json: unknown,
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
  const CAMPOS_POR_RANGO = ['ataque', 'fuerza', 'agilidad'] as const;
  problemas.push(...problemasDeObjeto(j.porRango, CAMPOS_POR_RANGO).map((p) => `porRango: ${p}`));
  const por = (j.porRango ?? {}) as Record<string, unknown>;
  for (const campo of CAMPOS_POR_RANGO) {
    const motivo = enteroBlocker(por[campo], 0);
    if (motivo !== null) problemas.push(`porRango.${campo} ${motivo}`);
  }
  const ajeno = Object.keys(j).find(
    (k) => !['_comment', 'base', 'incrementos', 'rangoMaximoDeTropa', 'porRango'].includes(k),
  );
  if (ajeno !== undefined) problemas.push(`«${ajeno}» no es un campo de la experiencia`);
  if (problemas.length > 0) throw new Error(`${fichero}: ${problemas.join('; ')}`);
  return {
    base: j.base as number,
    incrementos: [...(inc as number[])],
    rangoMaximoDeTropa: rangoMax as number,
    porRango: {
      ataque: por.ataque as number,
      fuerza: por.fuerza as number,
      agilidad: por.agilidad as number,
    },
  };
}

/** Los nombres del catálogo de habilidades, en el orden del cuaderno. */
export const CATALOGO_DE_HABILIDADES: readonly string[] = habilidadesJson.habilidades.map(
  (h) => h.nombre,
);

export const EXPERIENCIA: ReglasDeExperiencia = validarExperiencia(experienciaJson);

/**
 * Lo que cuestan y crecen las unidades y sus moradas, de `data/economia.json`.
 * **Inventado y provisional** (19-10-2026): nada se escribe por unidad, sale de
 * su índice de poder (`core/catalogo.ts`, `town/buildings.ts`).
 */
export interface ReglasDeLaEconomia {
  /** Una unidad cuesta `índice² / divisor` en oro, redondeado a la decena. */
  readonly oroPorIndice: { readonly divisor: number };
  /** Lo que suelta por semana una morada de cada unidad, por su nivel (1 a 6). */
  readonly crecimientoPorNivel: readonly number[];
  /** El coste en oro de una morada por el nivel de lo mejor que produce (1 a 6). */
  readonly costeDeLaMorada: readonly number[];
  /** El oro con que empieza cada jugador (`newGame`). **Inventado** (21-10-2026). */
  readonly oroDeSalida: number;
  /**
   * El oro que da cada día un pueblo a quien tenga su región unida a su base
   * (`rentaDelDia`). **Inventado** (21-10-2026, decisión del usuario).
   */
  readonly rentaDelPueblo: number;
  /**
   * Lo que cuesta todo héroe: el de salida, que se elige y se paga en la base al
   * empezar, y el que se contrata después (`hireHero`, `contratarBlocker`). Uno
   * para todos los tipos, que hoy no difieren en cifras. **Inventado** (22-10-2026,
   * decisión del usuario: el `HERO_HIRE_COST` de antes); nunca más que `oroDeSalida`.
   */
  readonly precioDelHeroe: number;
}

/** Los niveles que tienen fila en las tablas de la economía: del 1 al 6. */
export const NIVELES_DE_LA_ECONOMIA = 6;

/**
 * Valida la economía y la devuelve tipada; lanza con todos los problemas a la vez.
 * Exportada con el JSON de argumento para verla morder en un test.
 */
export function validarEconomia(json: unknown, fichero = 'data/economia.json'): ReglasDeLaEconomia {
  const problemas: string[] = [];
  const j = (json ?? {}) as Record<string, unknown>;
  const divisor = (j.oroPorIndice as Record<string, unknown> | undefined)?.divisor;
  if (!enteroDesde(divisor, 1)) {
    problemas.push(`oroPorIndice.divisor tiene que ser un entero ≥ 1 y es ${divisor}`);
  }
  const crece = j.crecimientoPorNivel;
  if (
    !Array.isArray(crece) ||
    crece.length !== NIVELES_DE_LA_ECONOMIA ||
    !crece.every((x) => enteroDesde(x, 1))
  ) {
    problemas.push(
      `crecimientoPorNivel tiene que ser una lista de ${NIVELES_DE_LA_ECONOMIA} enteros ≥ 1, uno por nivel, y es ${JSON.stringify(crece)}`,
    );
  }
  const costes = j.costeDeLaMorada;
  if (
    !Array.isArray(costes) ||
    costes.length !== NIVELES_DE_LA_ECONOMIA ||
    !costes.every((x) => enteroDesde(x, 0))
  ) {
    problemas.push(
      `costeDeLaMorada tiene que ser una lista de ${NIVELES_DE_LA_ECONOMIA} enteros ≥ 0 de oro, uno por nivel (solo hay oro), y es ${JSON.stringify(costes)}`,
    );
  }
  const oroDeSalida = j.oroDeSalida;
  if (!enteroDesde(oroDeSalida, 0)) {
    problemas.push(`oroDeSalida tiene que ser un entero ≥ 0 de oro y es ${oroDeSalida}`);
  }
  const rentaDelPueblo = j.rentaDelPueblo;
  if (!enteroDesde(rentaDelPueblo, 0)) {
    problemas.push(`rentaDelPueblo tiene que ser un entero ≥ 0 de oro y es ${rentaDelPueblo}`);
  }
  const precioDelHeroe = j.precioDelHeroe;
  if (!enteroDesde(precioDelHeroe, 0)) {
    problemas.push(`precioDelHeroe tiene que ser un entero ≥ 0 de oro y es ${precioDelHeroe}`);
  } else if (enteroDesde(oroDeSalida, 0) && (precioDelHeroe as number) > (oroDeSalida as number)) {
    // Todo jugador paga su héroe de salida con el oro de salida: con un precio
    // mayor, la partida no podría ni empezar.
    problemas.push(
      `precioDelHeroe (${precioDelHeroe}) no puede pasar de oroDeSalida (${oroDeSalida}): el héroe de salida se paga con él`,
    );
  }
  if (problemas.length > 0) throw new Error(`${fichero}: ${problemas.join('; ')}`);
  return {
    oroPorIndice: { divisor: divisor as number },
    crecimientoPorNivel: [...(crece as number[])],
    costeDeLaMorada: [...(costes as number[])],
    oroDeSalida: oroDeSalida as number,
    rentaDelPueblo: rentaDelPueblo as number,
    precioDelHeroe: precioDelHeroe as number,
  };
}

export const ECONOMIA: ReglasDeLaEconomia = validarEconomia(economiaJson);

/**
 * Lo que cuesta en oro una unidad de ese índice: `índice² / divisor`, redondeado
 * a la decena, en enteros. **Inventado** (`data/economia.json`).
 */
export function oroDelIndice(indice: number): number {
  const d = ECONOMIA.oroPorIndice.divisor;
  return Math.floor((indice * indice + 5 * d) / (10 * d)) * 10;
}

/** Lo que suelta por semana una morada de una unidad de ese nivel (1 a 6). */
export function crecimientoDelNivel(nivel: number): number {
  const tabla = ECONOMIA.crecimientoPorNivel;
  return tabla[Math.max(1, Math.min(tabla.length, nivel)) - 1] as number;
}

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
   * uno por tipo de la rueda de referencia (`GOLPES_DE_LA_MEDIDA`, con la que se mide
   * todo índice), enteros ≥ 0 y al menos uno > 0. Propios de la medida, no los de
   * la IA (`PESOS_DE_LA_RUEDA`): retocar cómo elige la IA no mueve índices.
   */
  readonly pesosDeLaRueda: Readonly<Record<GolpeDeReferencia, number>>;
}

/**
 * Los tipos con que se mide el índice de poder: los de la rueda de referencia, sea
 * cual sea la de la partida (decisión del plan de la complejidad del combate,
 * 22-10-2026: lo que vale un arma no depende del nivel que se juegue).
 */
const GOLPES_DE_LA_MEDIDA = RUEDA_DE_REFERENCIA.golpes;

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
    Object.keys(pesos).length === GOLPES_DE_LA_MEDIDA.length &&
    GOLPES_DE_LA_MEDIDA.every((t) => enteroDesde((pesos as Record<string, unknown>)[t], 0));
  if (!sonPesos) {
    problemas.push(
      `pesosDeLaRueda tiene que ser un entero ≥ 0 por cada tipo de la rueda de referencia (${GOLPES_DE_LA_MEDIDA.join(', ')}), y es ${JSON.stringify(pesos)}`,
    );
  } else if (GOLPES_DE_LA_MEDIDA.every((t) => (pesos as Record<string, number>)[t] === 0)) {
    problemas.push('pesosDeLaRueda son todos 0: alguno tiene que pesar');
  }
  if (problemas.length > 0) throw new Error(`${fichero}: ${problemas.join('; ')}`);
  return {
    umbralDelNivel2: j.umbralDelNivel2 as number,
    razon: [(r as number[])[0] as number, (r as number[])[1] as number],
    armaduraDeReferencia: j.armaduraDeReferencia as number,
    pesosDeLaRueda: pesos as Record<GolpeDeReferencia, number>,
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

const TIPOS_DE_HEROE = validarTiposDeHeroe(tiposDeHeroeJson, FACTION_IDS);

/** Los tipos de héroe de una facción, en el orden del cuaderno. */
export function tiposDeHeroe(faction: FactionId): readonly TipoDeHeroe[] {
  return TIPOS_DE_HEROE[faction];
}

/**
 * El id del tipo del héroe que nadie eligió —el inicial de la IA y el de la
 * partida rápida, y el contratado—: **el primero de su facción en el cuaderno**
 * (Caballero, Nigromante). El id y no el
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

/**
 * La hoja de `assets/unidades/` de cada tipo de héroe (`data/figuras-de-heroe.json`),
 * comprobada contra el catálogo de tipos. **Lanza con todos los problemas a la
 * vez**: un tipo sin hoja (el héroe se pintaría con el Y Bot, que es lo que se vino
 * a quitar: «la imagen es el y_bot», 19-10-2026), una hoja que no tiene la forma de
 * un id de carpeta, o una fila que no es ningún tipo (la de un tipo que el cuaderno
 * retiró). Que la hoja exista en disco con sus ocho direcciones no se mira aquí
 * —el núcleo no lee el disco—: lo mira `test/figuras-de-heroe.test.ts`.
 *
 * Exportada con el JSON de argumento por lo mismo que `validarTiposDeHeroe`: para
 * verla morder con un fichero malo.
 */
export function validarFigurasDeHeroe(
  json: unknown,
  tipos: Readonly<Record<FactionId, readonly TipoDeHeroe[]>>,
  fichero = 'data/figuras-de-heroe.json',
): Readonly<Record<FactionId, Readonly<Record<string, string>>>> {
  const problemas: string[] = [];
  const figuras = ((json ?? {}) as { figuras?: Record<string, unknown> }).figuras ?? {};
  const out = {} as Record<FactionId, Readonly<Record<string, string>>>;
  for (const [faccion, lista] of Object.entries(tipos) as [FactionId, readonly TipoDeHeroe[]][]) {
    const escritas = (figuras[faccion] ?? {}) as Record<string, unknown>;
    const deLaFaccion: Record<string, string> = {};
    for (const t of lista) {
      const hoja = escritas[t.id];
      if (typeof hoja !== 'string' || !esIdDeUnidad(hoja)) {
        problemas.push(
          hoja === undefined
            ? `el tipo ${t.id} (${t.nombre}) de ${faccion} no tiene hoja`
            : `la hoja del tipo ${t.id} de ${faccion} no es el id de una carpeta de assets/unidades/: ${JSON.stringify(hoja)}`,
        );
        continue;
      }
      deLaFaccion[t.id] = hoja;
    }
    for (const id of Object.keys(escritas)) {
      if (!lista.some((t) => t.id === id)) {
        problemas.push(
          `"${id}" no es ningún tipo de héroe de ${faccion} (data/tipos-de-heroe.json)`,
        );
      }
    }
    out[faccion] = deLaFaccion;
  }
  for (const faccion of Object.keys(figuras)) {
    if (!(faccion in tipos)) problemas.push(`"${faccion}" no es ninguna facción del motor`);
  }
  if (problemas.length > 0) throw new Error(`${fichero}: ${problemas.join('; ')}`);
  return out;
}

const FIGURAS_DE_HEROE = validarFigurasDeHeroe(figurasDeHeroeJson, TIPOS_DE_HEROE);

/**
 * La hoja con que se pinta un héroe: la de su tipo. **Derivada y no guardada**:
 * el héroe solo lleva su tipo (`Hero.tipo`), y de aquí la leen el mapa, la base
 * caminable, el retrato de la elección y la batalla (`HeroeDelBando.figura`), y el
 * espectador con la facción y el tipo que le llegan por el cable. Lanza con un tipo
 * que no es de su facción, como `nombreDeTipoDeHeroe`.
 */
export function figuraDelHeroe(h: { readonly faction: FactionId; readonly tipo: string }): string {
  const hoja = FIGURAS_DE_HEROE[h.faction][h.tipo];
  if (hoja === undefined) {
    throw new Error(
      `el tipo de héroe "${h.tipo}" no existe en ${h.faction} (data/tipos-de-heroe.json)`,
    );
  }
  return hoja;
}

// ---------------------------------------------------------------- facciones

/**
 * El rasgo de una línea de cada facción (`data/facciones.json`, sacado del
 * cuaderno por `tools/datos/facciones.ts`), comprobado al cargar: falta una,
 * sobra una o lleva un salto de línea y se lanza nombrando el fichero, en vez de
 * pintar la elección del menú con un hueco.
 */
export function leerRasgosDeFaccion(
  json: unknown,
  fichero = 'data/facciones.json',
): Readonly<Record<FactionId, string>> {
  const rasgos = ((json ?? {}) as { rasgos?: Record<string, unknown> }).rasgos ?? {};
  const problemas: string[] = [];
  for (const f of FACTION_IDS) {
    const r = rasgos[f];
    if (typeof r !== 'string' || r.trim() === '') problemas.push(`${f} no tiene rasgo`);
    else if (/[\r\n]/.test(r))
      problemas.push(`el rasgo de ${f} lleva un salto de línea: es de una línea`);
  }
  for (const f of Object.keys(rasgos)) {
    if (!(FACTION_IDS as readonly string[]).includes(f))
      problemas.push(`"${f}" no es una facción del juego`);
  }
  if (problemas.length > 0) {
    throw new Error(
      `${fichero}: ${problemas.join('; ')} (se regenera con tools/datos/facciones.ts)`,
    );
  }
  return rasgos as Record<FactionId, string>;
}

const RASGOS_DE_FACCION = leerRasgosDeFaccion(faccionesJson);

/** El rasgo de una línea de la facción: lo que dice de ella la elección del menú. */
export function rasgoDeFaccion(f: FactionId): string {
  return RASGOS_DE_FACCION[f];
}

// ---------------------------------------------------------------- equipo

/**
 * De dónde se consigue una pieza en la partida (18-10-2026, una sola clase de
 * piezas): la vende la armería (`armeria`) o cae como botín (`botin`). Una pieza
 * sin ninguno (`[]`) solo la llevan las unidades que nacen con ella (su kit, en
 * `data/unidades.json`). Es una propiedad de la pieza, escrita, y no una lista
 * aparte: «¿se vende?» se le pregunta a la pieza (`seVende`, `caeComoBotin`).
 */
export const DONDE_SE_CONSIGUE = ['armeria', 'botin'] as const;

export type DondeSeConsigue = (typeof DONDE_SE_CONSIGUE)[number];

/**
 * Cómo se dice cada sitio de donde sale una pieza, y la frase de la que no sale de
 * ninguno (`SOLO_EN_KITS`). **La tabla, una vez**: la leen la prosa del agente, el
 * motivo de `buyBlocker` (`deDondeSale`) y la ficha de la arena.
 */
export const DICHO_DE_DONDE: Readonly<Record<DondeSeConsigue, string>> = {
  armeria: 'se vende en la armería',
  botin: 'cae como botín',
};

/** Lo que se dice de una pieza que no se vende ni cae como botín (`seConsigue: []`). */
export const SOLO_EN_KITS =
  'no se vende ni cae como botín: solo la llevan las unidades que nacen con ella';

/** Una pieza de `data/equipo.json`. **Inventada y provisional**, como dice su `_comment`. */
export interface Pieza {
  readonly id: string;
  readonly nombre: string;
  /** El suyo; una de `arma` va también en `segunda` (`huecosDeLaPieza`). */
  readonly hueco: HuecoDePieza;
  /** De dónde se consigue en la partida (`DONDE_SE_CONSIGUE`); `[]`, de ningún sitio (`SOLO_EN_KITS`). */
  readonly seConsigue: readonly DondeSeConsigue[];
  readonly ataque: number;
  readonly defensa: number;
  /**
   * Puntos de armadura (#262): se restan del daño de cada golpe, disparo, hechizo
   * o poder que recibe quien la lleva, con mínimo 0 (`trasLaArmadura`,
   * `battle/armas.ts`). Ninguna pieza suma PV: protege esto. Sin el campo, 0.
   */
  readonly armadura?: number;
  /**
   * Lo que suma un arma a la fuerza de quien la lleva para el daño de su golpe
   * (25-10-2026: «daño mínimo es fuerza y daño máximo es fuerza × agilidad»,
   * `cifrasDelCuerpo`); sin el campo, nada. Solo las armas (`camposDelHueco`).
   * El peso no se compara con ella: con la fuerza del cuerpo.
   */
  readonly fuerza?: number;
  /**
   * Lo que pesa (25-10-2026: «todo tiene un peso»): la suma de lo puesto que pase
   * de la fuerza del cuerpo resta agilidad (`restaDelPeso`, `core/cuerpo.ts`).
   * Toda pieza lo dice, ≥ 0. Ninguna pieza resta movimiento: lo hace el peso.
   */
  readonly peso: number;
  /**
   * `2` si es un arma a dos manos, que no admite escudo ni segunda arma
   * (`manosBlocker`, la única lectura). Solo en el hueco `arma`; sin el campo, una mano.
   */
  readonly manos?: 1 | 2;
  /**
   * Si es una lanza (25-10-2026, «la lanza de carga fuera, será una lanza y una
   * regla especial de la lanza cuando se carga montado»): un arma de cuerpo a cuerpo
   * más, y quien carga con el rasgo `charge` y una lanza puesta cobra la carga del
   * jinete (`cifrasDeCarga`). Solo en el hueco `arma`; sin el campo, no lo es. Lo
   * leen solo `hero/equipo.ts` y `data.ts` (lo vigila `invariantes.test.ts`).
   */
  readonly lanza?: true;
  /**
   * Su nivel en cada tipo del anillo de la rueda del golpe, de 0 a 6 (18-10-2026:
   * «una maza es mejor en ataque fuerte y peor en rápido»; los niveles, absolutos,
   * en la vuelta 2). Lo lleva **toda** pieza de un hueco que golpea en ella
   * (`camposDelHueco(h).conRueda`: `arma` y `lanza`), y ninguna otra. Lo lleva al
   * golpe `conEquipo` (`GolpeConArma.rueda`).
   */
  readonly rueda?: NivelesDeLaRueda;
  /** Lo que cuesta en la armería, en oro: el precio de una pieza es solo en oro. */
  readonly precio: number;
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
  readonly fuerza?: number;
  readonly defensa?: number;
  readonly armadura?: number;
  readonly peso?: number;
  /** Niveles de la rueda con signo, por tipo del anillo: el final, el de la base más este. */
  readonly rueda?: ExtrasDeLaRueda;
  readonly oro?: number;
}

/**
 * Cómo es cada extra (`ExtrasDePieza`), en el orden en que se escriben: un número
 * o uno por tipo del anillo (la rueda, en niveles).
 * **La tabla de los extras, una vez**: de ella salen sus campos
 * (`CAMPOS_DE_EXTRAS`), su forma (`problemasDePiezaConBase`), cómo se escriben
 * (`piezaConBaseCanonica`) y la suma de una base y su inversa (`sumarExtras`).
 */
const FORMA_DE_LOS_EXTRAS = {
  ataque: 'numero',
  fuerza: 'numero',
  defensa: 'numero',
  armadura: 'numero',
  peso: 'numero',
  rueda: 'porTipo',
  oro: 'numero',
} as const satisfies Readonly<Record<keyof ExtrasDePieza, 'numero' | 'porTipo'>>;

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
 * Una pieza escrita **sobre otra** (`base`, el id de otra pieza): su nombre, de
 * dónde se consigue (suyo: la Espada se vende y la Espada de herrería cae como
 * botín) y lo que suma encima (`extras`). El hueco y las manos son los de su
 * base, que no se repiten: si cambia la base, cambia ella (el vínculo es vivo). La
 * suma la hace solo `resolverBases`.
 */
export interface PiezaConBase {
  readonly id: string;
  readonly nombre: string;
  readonly base: string;
  readonly seConsigue: readonly DondeSeConsigue[];
  readonly extras: ExtrasDePieza;
}

/**
 * Una pieza como se ESCRIBE (el fichero, el enlace, la batalla): con
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
  'seConsigue',
  'ataque',
  'fuerza',
  'defensa',
  'armadura',
  'peso',
  'manos',
  'lanza',
  'rueda',
  'precio',
];

/** Los campos de una pieza con base (`PiezaConBase`). */
export const CAMPOS_DE_PIEZA_CON_BASE: readonly string[] = [
  'id',
  'nombre',
  'base',
  'seConsigue',
  'extras',
];

/** Los campos de los extras de una pieza con base (`FORMA_DE_LOS_EXTRAS`). */
export const CAMPOS_DE_EXTRAS: readonly string[] = EXTRAS;

/** Cómo se nombra una pieza en un motivo: por su id si lo trae, si no `otro`. */
function quienEsLaPieza(p: Record<string, unknown>, otro: string): string {
  return typeof p.id === 'string' && p.id !== '' ? `"${p.id}"` : otro;
}

/**
 * Lo más que da de armadura una pieza (A4 de QA de #262: sin tope,
 * `1e3` entraba como 1000 y la pelea se agotaba en la ronda 100). **Inventado**:
 * la barda, la que más, da 22; 99 deja probar de sobra sin que nada sea inmune.
 * Lo juzga la regla de una pieza (`problemasDePieza`).
 */
export const ARMADURA_MAXIMA_DE_PIEZA = 99;

/** Cómo se dice una cifra en un motivo: «daño», «defensa». */
function cifraDicha(c: CifraDePieza): string {
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
 * Si la pieza golpea en la rueda del golpe: la de un hueco que golpea en ella
 * (`camposDelHueco(h).conRueda`: `arma` y `lanza`). Esas, y solo esas, dicen su
 * rueda (`Pieza.rueda`). **La regla, en un sitio**: la lee la de una pieza
 * (`problemasDePieza`).
 */
export function golpeaEnLaRueda(p: { readonly hueco?: unknown }): boolean {
  return typeof p.hueco === 'string' && esHuecoDePieza(p.hueco) && camposDelHueco(p.hueco).conRueda;
}

/**
 * Lo que no vale de `seConsigue`: una lista de sitios de `DONDE_SE_CONSIGUE`, sin
 * repetir, que se escribe siempre (`[]` si de ningún sitio).
 */
function problemasDeDondeSeConsigue(v: unknown, q: string): string[] {
  if (!Array.isArray(v)) {
    return [
      `${q}: seConsigue es una lista de dónde se consigue (${DONDE_SE_CONSIGUE.join(', ')}), [] si solo la llevan las unidades que nacen con ella`,
    ];
  }
  const problemas = v
    .filter((x) => !(DONDE_SE_CONSIGUE as readonly unknown[]).includes(x))
    .map(
      (x) =>
        `${q} se consigue en "${String(x)}", que no es ningún sitio; valen ${DONDE_SE_CONSIGUE.join(', ')}`,
    );
  if (new Set(v).size !== v.length) problemas.push(`${q}: seConsigue repite un sitio`);
  return problemas;
}

/**
 * Lo que no vale de UNA pieza, cada cosa con su frase, o vacío si vale: los
 * campos que existen (`CAMPOS_DE_PIEZA`: un `pv` no es uno, ninguna pieza da PV),
 * el id (`esIdDePieza`), el nombre, el hueco que existe, de dónde se consigue, las
 * cifras enteras ≥ 0 y solo las de su hueco (`camposDelHueco`), la armadura con
 * tope (`ARMADURA_MAXIMA_DE_PIEZA`), la fuerza que suma un arma, el peso que
 * lleva toda pieza, las manos solo en un arma, una rueda con sus seis niveles en
 * cada arma que golpea en ella (`problemasDeNiveles`) y el precio, solo en oro.
 * **La regla de una pieza, en un sitio**: la leen el cargador del catálogo
 * (`leerPiezas`, que añade las reglas de conjunto), la arena, que edita piezas una
 * a una (`validarPieza`, `piezaBlocker`), y la suma de una base
 * (`resolverBases`), que la juzga resuelta.
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
      ajeno === 'pv'
        ? `${q} suma PV: ninguna pieza da PV, se protege con armadura, que se resta de cada golpe`
        : ajeno === 'velocidad'
          ? `${q} dice velocidad: ninguna pieza resta movimiento, lo hace su peso («peso»)`
          : ajeno === 'danio'
            ? `${q} dice daño: un arma suma fuerza («fuerza») y el daño sale de la fuerza y la agilidad`
            : `${q}: «${ajeno}» no es un campo de una pieza; valen ${CAMPOS_DE_PIEZA.join(', ')}`,
    );
  }
  problemas.push(...problemasDeIdYNombre(p, q));
  const campos =
    typeof p.hueco === 'string' && esHuecoDePieza(p.hueco) ? camposDelHueco(p.hueco) : null;
  if (campos === null) {
    problemas.push(
      p.hueco === 'segunda'
        ? `${q} dice el hueco «segunda»: una segunda arma es una de «arma», que va en los dos`
        : `${q} va en el hueco "${p.hueco}", que no existe; valen ${HUECOS_DE_PIEZA.join(', ')}`,
    );
  }
  problemas.push(...problemasDeDondeSeConsigue(p.seConsigue, q));
  for (const campo of ['ataque', 'defensa'] as const) {
    if (!enteroDesde(p[campo], 0)) {
      problemas.push(`${q}: ${campo} tiene que ser un entero ≥ 0 y ${comoSeLee(p[campo])}`);
    }
  }
  if (p.armadura !== undefined && !enteroDesde(p.armadura, 0)) {
    problemas.push(`${q}: armadura tiene que ser un entero ≥ 0 y ${comoSeLee(p.armadura)}`);
  } else if (typeof p.armadura === 'number' && p.armadura > ARMADURA_MAXIMA_DE_PIEZA) {
    problemas.push(`${q}: la armadura va de 0 a ${ARMADURA_MAXIMA_DE_PIEZA} y es ${p.armadura}`);
  }
  if (p.fuerza !== undefined && !enteroDesde(p.fuerza, 0)) {
    problemas.push(`${q}: fuerza tiene que ser un entero ≥ 0 y ${comoSeLee(p.fuerza)}`);
  }
  // Todo pesa (25-10-2026): el peso se escribe siempre, y nada resta movimiento.
  if (!enteroDesde(p.peso, 0)) {
    problemas.push(
      p.peso === undefined
        ? `${q} no dice su peso: toda pieza pesa, un entero ≥ 0`
        : `${q}: peso tiene que ser un entero ≥ 0 y ${comoSeLee(p.peso)}`,
    );
  }
  // Cada tipo, solo sus cifras (decisión del usuario, 18-10-2026: «diferencia por
  // tipo»).
  if (campos !== null) {
    for (const cifra of CIFRAS_DE_PIEZA) {
      if (campos.cifras.includes(cifra) || !sumaAlgo(p[cifra])) continue;
      problemas.push(
        `${q} va en el hueco ${String(p.hueco)}, que no suma ${cifraDicha(cifra)}: en él una pieza suma ${campos.cifras.map(cifraDicha).join(', ')}`,
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
  if (p.lanza !== undefined) {
    if (p.lanza !== true) {
      problemas.push(`${q}: lanza es true o no se escribe, y es ${String(p.lanza)}`);
    } else if (p.hueco !== 'arma') {
      problemas.push(
        `${q} va en el hueco ${p.hueco} y dice que es una lanza: solo un arma de cuerpo a cuerpo lo es`,
      );
    }
  }
  // La rueda (vuelta 2, 18-10-2026): toda arma de cuerpo a cuerpo dice su nivel en
  // los seis tipos del anillo («sin arma no se combate»), y ninguna otra pieza
  // lleva rueda.
  if (p.rueda === undefined) {
    if (golpeaEnLaRueda(p)) {
      problemas.push(
        `${q} es un arma de cuerpo a cuerpo y no dice su rueda: un nivel de 0 a ${NIVEL_MAXIMO} en ${TIPOS_DEL_ANILLO.map((t) => NOMBRE_DE_GOLPE[t]).join(', ')}`,
      );
    }
  } else if (campos !== null && !campos.conRueda) {
    problemas.push(
      `${q} va en el hueco ${String(p.hueco)} y lleva rueda del golpe: solo un arma de cuerpo a cuerpo o de carga golpea en ella`,
    );
  } else {
    problemas.push(...problemasDeNiveles(p.rueda, q));
  }
  // El precio es un número, en oro (simplify de F2: ni recursos ni `{ gold }`).
  if (!enteroDesde(p.precio, 0)) {
    problemas.push(
      typeof p.precio === 'number' && Number.isFinite(p.precio)
        ? `${q} cuesta ${p.precio} de oro: tiene que ser un entero ≥ 0`
        : `${q}: el precio es lo que cuesta en oro, un entero ≥ 0, y ${typeof p.precio === 'object' && p.precio !== null ? 'es un objeto: escribe solo el número' : comoSeLee(p.precio)}`,
    );
  }
  return problemas;
}

/**
 * Lo que no vale del id y el nombre de una pieza, entera o con base: un id como
 * texto en minúsculas, cifras, `-` y `_` (`esIdDePieza`), y un nombre escrito.
 */
function problemasDeIdYNombre(p: Record<string, unknown>, q: string): string[] {
  const problemas: string[] = [];
  if (typeof p.id !== 'string' || p.id === '') problemas.push(`${q} no trae id como texto`);
  else if (!esIdDePieza(p.id)) {
    problemas.push(`${q}: el id «${p.id}» va en minúsculas, con cifras, guiones y _`);
  }
  if (typeof p.nombre !== 'string' || p.nombre.trim() === '') {
    problemas.push(`${q} no tiene nombre: escribe uno`);
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
 * sus campos, el id, el nombre, la base (otra pieza, no ella misma), de dónde se
 * consigue y la forma de los extras (`FORMA_DE_LOS_EXTRAS`), enteros con signo.
 * Que la base exista y no dé la vuelta lo dice `baseBlocker`, y que la pieza
 * resuelta valga, `resolverBases`.
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
        ? `${q} tiene base y escribe «${ajeno}»: con base se escriben solo sus extras; el hueco y las manos son los de la base`
        : `${q}: «${ajeno}» no es un campo de una pieza con base; valen ${CAMPOS_DE_PIEZA_CON_BASE.join(', ')}`,
    );
  }
  problemas.push(...problemasDeIdYNombre(p, q), ...problemasDeDondeSeConsigue(p.seConsigue, q));
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

/** De dónde se consigue, escrito siempre igual: en el orden de `DONDE_SE_CONSIGUE`. */
function enSuOrden(v: readonly DondeSeConsigue[]): readonly DondeSeConsigue[] {
  return DONDE_SE_CONSIGUE.filter((d) => v.includes(d));
}

/**
 * Una pieza ya válida escrita siempre igual: los campos en su orden, sin lo que no
 * suma nada (`armadura` y `fuerza` 0, una mano), de dónde se consigue en
 * su orden y la rueda entera en el orden del anillo (`nivelesEnOrden`: un nivel 0
 * se escribe). Es la forma que compara `mismaPieza`: el catálogo
 * (`leerPiezas`), la arena (`validarPieza`) y la suma de una base
 * (`resolverBases`) escriben así.
 */
export function piezaCanonica(p: Pieza): Pieza {
  const rueda = p.rueda === undefined ? undefined : nivelesEnOrden(p.rueda);
  return {
    id: p.id,
    nombre: p.nombre,
    hueco: p.hueco,
    seConsigue: enSuOrden(p.seConsigue),
    ataque: p.ataque,
    ...((p.fuerza ?? 0) > 0 ? { fuerza: p.fuerza } : {}),
    defensa: p.defensa,
    ...((p.armadura ?? 0) > 0 ? { armadura: p.armadura } : {}),
    peso: p.peso,
    ...(p.manos === 2 ? { manos: 2 as const } : {}),
    ...(p.lanza === true ? { lanza: true as const } : {}),
    ...(rueda === undefined ? {} : { rueda }),
    precio: p.precio,
  };
}

/** Una pieza con base ya válida escrita siempre igual: los extras en su orden y sin ceros. */
export function piezaConBaseCanonica(p: PiezaConBase): PiezaConBase {
  const x = p.extras;
  const extras: Record<string, unknown> = {};
  for (const campo of EXTRAS) {
    if (!sumaAlgo(x[campo])) continue;
    if (campo === 'rueda') extras.rueda = ruedaSinCeros(x.rueda);
    else extras[campo] = x[campo];
  }
  return {
    id: p.id,
    nombre: p.nombre,
    base: p.base,
    seConsigue: enSuOrden(p.seConsigue),
    extras: extras as ExtrasDePieza,
  };
}

/**
 * Lo que suma la pieza `p`, como extras sobre nada (`ExtrasEnteros`): sus cifras,
 * su daño, su rueda y su precio en oro. Con `conLosExtras`, la ficha edita una
 * pieza entera como edita los extras de una con base.
 */
export function extrasDe(p: Pieza): ExtrasEnteros {
  return {
    ataque: p.ataque,
    fuerza: p.fuerza ?? 0,
    defensa: p.defensa,
    armadura: p.armadura ?? 0,
    peso: p.peso,
    rueda: p.rueda ?? {},
    oro: p.precio,
  };
}

/**
 * La pieza `p` sumando `x` (lo que no trae, 0) en lugar de lo suyo, **sin
 * juzgar**: su id, su nombre, su hueco, de dónde se consigue y sus manos se quedan.
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
    seConsigue: p.seConsigue,
    ataque: x.ataque ?? 0,
    fuerza: x.fuerza ?? 0,
    defensa: x.defensa ?? 0,
    armadura: x.armadura ?? 0,
    peso: x.peso ?? 0,
    ...(p.manos === undefined ? {} : { manos: p.manos }),
    ...(p.lanza === undefined ? {} : { lanza: p.lanza }),
    ...(conRueda ? { rueda: nivelesEnOrden(x.rueda ?? {}) } : {}),
    precio: x.oro ?? 0,
  };
}

/**
 * `a` más `b` por `signo`, extra a extra (`FORMA_DE_LOS_EXTRAS`): los números y
 * la rueda por tipo. Con `+1` es la suma de una base
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
    rueda: Object.fromEntries(TIPOS_DEL_ANILLO.map((t) => [t, mas(a.rueda?.[t], b.rueda?.[t])])),
  };
}

/**
 * La pieza `e` sobre su base `base`, sumada y **sin juzgar** (`sumarExtras`): lo de
 * la base más los extras; el hueco y las manos, de la base; de dónde se consigue,
 * el suyo. La juzga `resolverBases` antes de escribirla canónica: un daño que
 * se queda en negativo tiene que poder verse.
 */
function sumarBase(base: Pieza, e: PiezaConBase): Pieza {
  return {
    ...conLosExtras(base, sumarExtras(extrasDe(base), e.extras, 1)),
    id: e.id,
    nombre: e.nombre,
    seConsigue: e.seConsigue,
  };
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
 * (sus bases darían la vuelta) y, si se dice `hueco`, va en él (cambiar de base no
 * cambia de hueco). `escritas` dice cómo está escrita cada pieza del catálogo. La
 * leen la suma de las bases (`resolverBases`), el cambio de base (`conBase`) y
 * lo que ofrece el desplegable «Base» (`basesPosibles`). Si la base misma está
 * rota, no se mira aquí: lo dice ella.
 */
export function baseBlocker(
  quien: { readonly id: string; readonly nombre: string },
  base: string,
  escritas: ReadonlyMap<string, PiezaEscrita>,
  hueco?: HuecoDePieza,
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
 * Cada pieza de `escritas` (un catálogo entero, por id) resuelta: la entera, tal
 * cual; la que tiene base, su base resuelta más sus extras (`sumarBase`), en
 * cadena. **La única suma de una base** (lo vigila `test/invariantes.test.ts`): la
 * llama solo el cargador del catálogo (`leerPiezas`), por el que pasan el fichero,
 * el catálogo de la arena y las piezas de una pelea. No vale (con su motivo):
 * la base que no puede ser (`baseBlocker`) y la pieza resuelta que no cumple la
 * regla de una pieza (`problemasDePieza`). La que depende de una que no vale
 * tampoco vale, y lo dice: también si su base ni se leyó (`rotas`, por id, con su
 * nombre y su motivo), que si no diría que «no existe».
 */
function resolverBases(
  escritas: ReadonlyMap<string, PiezaEscrita>,
  rotas: ReadonlyMap<string, { readonly nombre: string; readonly motivo: string }> = new Map(),
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
    if (!esPiezaConBase(e)) return e;
    const q = `«${e.nombre}»`;
    const rota = escritas.has(e.base) ? undefined : rotas.get(e.base);
    if (rota !== undefined) return `${q}: su base «${rota.nombre}» no vale (${rota.motivo})`;
    const mal = baseBlocker(e, e.base, escritas);
    if (mal !== null) return mal;
    const b = resolver(e.base);
    if (b === null) {
      const nombre = escritas.get(e.base)?.nombre ?? e.base;
      return `${q}: su base «${nombre}» no vale (${problemas.get(e.base) ?? ''})`;
    }
    const suma = sumarBase(b, e);
    const suyos = problemasDePieza(suma, `${q} (sobre «${b.nombre}»)`);
    if (suyos.length > 0) return suyos.join('; ');
    return piezaCanonica(suma);
  };
  for (const id of escritas.keys()) resolver(id);
  const piezas = new Map<string, Pieza>();
  for (const id of escritas.keys()) {
    const p = hechas.get(id);
    if (p !== undefined) piezas.set(id, p);
  }
  return { piezas, escritas, problemas };
}

/**
 * Una pieza comprobada con su regla (`problemasDePieza`, o `problemasDePiezaConBase`
 * si va sobre otra) y escrita siempre igual (`piezaCanonica`,
 * `piezaConBaseCanonica`), o la lista de lo que no vale. Lo que dé resuelta lo
 * juzga el catálogo (`leerPiezas`).
 */
function piezaEscrita(
  valor: unknown,
  quien?: string,
): { readonly pieza: PiezaEscrita } | { readonly problemas: readonly string[] } {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    return { problemas: [`${quien ?? 'la pieza'} no es un objeto`] };
  }
  const conBase = 'base' in valor;
  const problemas = conBase
    ? problemasDePiezaConBase(valor, quien)
    : problemasDePieza(valor, quien);
  if (problemas.length > 0) return { problemas };
  return {
    pieza: conBase
      ? piezaConBaseCanonica(valor as unknown as PiezaConBase)
      : piezaCanonica(valor as unknown as Pieza),
  };
}

/**
 * Una pieza, comprobada y escrita siempre igual (`piezaEscrita`); lanza diciendo
 * qué no cuadra. Todo lo que entra a la arena pieza a pieza (lo que manda el
 * servidor, el enlace, cada cambio de su editor) pasa por aquí.
 */
export function validarPieza(valor: unknown): PiezaEscrita {
  const nombre = (valor as { nombre?: unknown } | null)?.nombre;
  const quien = typeof nombre === 'string' && nombre !== '' ? `«${nombre}»` : undefined;
  const r = piezaEscrita(valor, quien);
  if ('problemas' in r) throw new Error(r.problemas.join('; '));
  return r.pieza;
}

/**
 * Un catálogo de equipo entero: cada pieza con su regla (`piezaEscrita`), sin ids
 * repetidos (`revisarLista`), resuelta con sus bases (`resolverBases`) y con
 * **alguna que caiga como botín**, que si no el botín no tendría qué dar.
 * Devuelve las escritas y las resueltas, en su orden, o **lanza con todos los
 * problemas a la vez**, escritos para quien edita el JSON (`donde` delante, si se
 * dice). Lo leen el cargador del fichero (`leerEquipo`) y todo catálogo que se
 * hace en memoria (`catalogoDeEquipo`, `hero/equipo.ts`): **una sola validación**
 * del catálogo, la del fichero que lee el juego.
 */
export function leerPiezas(
  lista: readonly unknown[],
  donde?: string,
): { readonly escritas: readonly PiezaEscrita[]; readonly piezas: readonly Pieza[] } {
  // Cómo se nombra la que no trae id: por su sitio en la lista, que `revisarLista`
  // recorre en orden.
  let i = 0;
  const { validas, invalidas } = revisarLista(
    lista,
    (bruta) => {
      const r = piezaEscrita(
        bruta,
        quienEsLaPieza((bruta ?? {}) as Record<string, unknown>, `la pieza ${i++}`),
      );
      if ('problemas' in r) throw new Error(r.problemas.join('; '));
      return r.pieza;
    },
    { campo: 'id', clave: (p) => p.id, quien: (id) => `"${id}"`, donde: 'el catálogo' },
  );
  const escritas = new Map(validas.map((p) => [p.id, p]));
  const rotas = new Map<string, { readonly nombre: string; readonly motivo: string }>();
  for (const { clave, motivo, crudo } of invalidas) {
    if (clave === null) continue;
    const nombre = (crudo as { nombre?: unknown }).nombre;
    rotas.set(clave, { nombre: typeof nombre === 'string' ? nombre : clave, motivo });
  }
  const resueltas = resolverBases(escritas, rotas);
  const problemas = [...invalidas.map((x) => x.motivo), ...resueltas.problemas.values()];
  if (
    problemas.length === 0 &&
    ![...resueltas.piezas.values()].some((p) => p.seConsigue.includes('botin'))
  ) {
    problemas.push(
      'no hay ninguna pieza que caiga como botín (seConsigue: ["botin"]): el botín no tendría qué dar',
    );
  }
  if (problemas.length > 0) {
    throw new Error(`${donde === undefined ? '' : `${donde}: `}${problemas.join('; ')}`);
  }
  return { escritas: validas, piezas: [...resueltas.piezas.values()] };
}

/** Dónde vive el catálogo de equipo, relativo a la raíz del repo: el juego lo carga y la arena lo escribe. */
export const RUTA_DEL_CATALOGO_DE_EQUIPO = 'data/equipo.json';

/**
 * El `_comment` de `data/equipo.json` si el fichero no trae uno: «Guardar» de la
 * arena conserva el que haya en disco, que es el que se edita.
 */
export const COMENTARIO_DEL_CATALOGO_DE_EQUIPO =
  'CATÁLOGO de equipo, una pieza por hueco. TODO INVENTADO y PROVISIONAL (HoMM2 no tiene equipo de tropa). Lo carga src/core/data.ts (leerEquipo) y lo escribe la arena al pulsar «Guardar», con la misma regla.';

/**
 * Lee un catálogo de equipo (`{ piezas: [...] }`) con la regla del catálogo
 * (`leerPiezas`), nombrando `fichero`. Lanza con todos los problemas a la vez. Lo
 * usan la carga del juego y «Guardar» de la arena (`tools/arena/borrador.ts`): la
 * misma regla en los dos lados. Exportada con el JSON de argumento por lo mismo
 * que `validarExperiencia`: un guardia que solo se prueba con el fichero bueno no
 * se ha visto morder.
 */
export function leerEquipo(
  json: unknown,
  fichero = RUTA_DEL_CATALOGO_DE_EQUIPO,
): { readonly escritas: readonly PiezaEscrita[]; readonly piezas: readonly Pieza[] } {
  const lista = ((json ?? {}) as { piezas?: unknown }).piezas;
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new Error(`${fichero}: no trae ninguna pieza en "piezas"`);
  }
  return leerPiezas(lista, fichero);
}

const EQUIPO_LEIDO = leerEquipo(equipoJson);

/**
 * El catálogo de equipo como está escrito en el fichero, con sus bases: de él
 * parte la arena construida, y el juego lo resuelve en `EQUIPO`.
 */
export const EQUIPO_ESCRITO: readonly PiezaEscrita[] = EQUIPO_LEIDO.escritas;

/** El catálogo de equipo resuelto, en el orden del fichero: es el orden del sorteo del botín. */
export const EQUIPO: readonly Pieza[] = EQUIPO_LEIDO.piezas;

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
 * `leerEquipo`, para que el guardia se pueda ver morder con un fichero roto.
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
