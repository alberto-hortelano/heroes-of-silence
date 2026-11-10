/**
 * La forma del mapa de aventura (`GameMap`): una cuadrícula de terreno con sus
 * regiones (`MapRegion`), sus caminos (`RedDeCaminos`) y los objetos encima
 * (`MapObject`), con el vocabulario de las obras del puesto que lleva un paso
 * (`MEJORAS_DEL_PUESTO`, `OBRAS_DE_UN_PUESTO`…); y la estructura de la red de nodos
 * (`Estructura`), que deriva `regiones.ts`.
 *
 * Eran parte de `map.ts` y `regiones.ts` hasta la fase N de la reorganización
 * (07-11-2026): el recinto de las ciudades (`recinto.ts`) nombra esta forma, y
 * `map.ts` y `regiones.ts` lo importan a él, un nudo de tipos. Aquí solo hay la
 * forma y su vocabulario: el movimiento sigue en `map.ts` y la red, en `regiones.ts`.
 */
import type { Point } from '../types.js';
import type { RedDeCaminos } from './red-de-caminos.js';
import type { Barrera, Nivel, TerrainKind } from './terrain.js';

/**
 * Las obras de un puesto (un paso tomado), de la primera a la última: se sube de
 * una en una y no se baja (`mejorarBlocker`, `state/sitios.ts`). Qué cuesta cada una
 * y con qué muralla se pelea, en `data/sitios.json`.
 */
export const MEJORAS_DEL_PUESTO = ['ninguna', 'empalizada', 'muralla'] as const;

export type MejoraDelPuesto = (typeof MEJORAS_DEL_PUESTO)[number];

/** Las obras que se hacen en un puesto: todas menos la de partida, la caseta. */
export type ObraDelPuesto = Exclude<MejoraDelPuesto, 'ninguna'>;

/** Las obras, en su orden (`MEJORAS_DEL_PUESTO` sin la caseta). */
export const OBRAS_DE_UN_PUESTO: readonly ObraDelPuesto[] = MEJORAS_DEL_PUESTO.filter(
  (m): m is ObraDelPuesto => m !== 'ninguna',
);

/**
 * La obra que sigue a cada una, o `null` tras la última: la escalera de
 * `MEJORAS_DEL_PUESTO` como tabla, que el compilador exige entera.
 */
export const OBRA_SIGUIENTE: Readonly<Record<MejoraDelPuesto, ObraDelPuesto | null>> = {
  ninguna: 'empalizada',
  empalizada: 'muralla',
  muralla: null,
};

/** Si `valor` es una de las obras de un puesto (`MEJORAS_DEL_PUESTO`). */
export function esMejoraDelPuesto(valor: unknown): valor is MejoraDelPuesto {
  return (MEJORAS_DEL_PUESTO as readonly unknown[]).includes(valor);
}

/**
 * Si `valor` es una obra que se hace en un puesto (`OBRAS_DE_UN_PUESTO`): lo que
 * pide `mejorar_el_puesto` y lo que lleva el botón del diálogo (`data-obra`).
 */
export function esObraDelPuesto(valor: unknown): valor is ObraDelPuesto {
  return (OBRAS_DE_UN_PUESTO as readonly unknown[]).includes(valor);
}

/**
 * Por qué `citada` no es una obra de un puesto, dicho con las que valen en `lista`:
 * las de dentro (`OBRAS_DE_UN_PUESTO`) o las del contrato del agente (sus `upgrade`).
 * Una sola frase para las dos puertas, `mejorarBlocker` y `obraDelUpgrade`, como
 * `huecoDesconocido`. `citada` llega ya entre comillas: las de la persona («…») o
 * las del contrato ("…"), que es en lo único en que difieren.
 */
export function obraDesconocida(citada: string, lista: readonly string[]): string {
  return `${citada} no es una obra de un puesto; valen ${lista.join(', ')}`;
}

export type MapObject =
  | {
      /**
       * Un paso entre regiones (`regiones.ts`). Se toma **pisándolo**, de camino
       * o parando en él, y `owner` es el único sitio donde vive su dueño: lo
       * escribe `tomarElNodo` y nadie más. No bloquea el paso: es un paso.
       */
      readonly kind: 'node';
      readonly id: string;
      readonly at: Point;
      owner: number | null;
      /**
       * La barrera que cruza: la del muro que el plan escribe bajo el nodo y
       * que `buildMap` abre (#145). La lee el escenógrafo para su pieza —el
       * puente, si es agua—; antes la deducía de las ocho vecinas, y en un
       * empate se inventaba un río (#187). No cambia qué se pisa.
       */
      readonly barrera: Barrera;
      /**
       * La obra del puesto que es el paso una vez tomado (puesto fronterizo, fase 3,
       * 04-11-2026): `ninguna` (la caseta), `empalizada` o `muralla`, en ese orden y
       * sin bajar. Un primitivo del objeto, como `owner`, así que la memoria de la
       * niebla la recuerda sola (`explorar` copia el objeto) y el espectador la
       * recibe con él. **La escribe solo `mejorarElPuesto`** (`state/sitios.ts`; lo
       * vigila `test/invariantes-partida.test.ts`): tomar el paso no la toca, porque es una
       * obra y se queda con él. La lee `murallaDelSitio` para la batalla del paso.
       */
      mejora: MejoraDelPuesto;
    }
  | {
      /**
       * Un pueblo. Dentro de una región es de quien la tenga, y su `owner` no
       * cuenta (se queda en `null`): el territorio se gana cerrando la región, y un
       * dueño aquí sería una segunda copia de un hecho que ya se deriva de los
       * nodos. **En el muro**, entre dos regiones o más, es un nodo y se toma como
       * un paso: entonces su dueño vive aquí, y lo escribe solo `tomarElNodo`.
       * Qué es lo dice la red (`estructura`, `sitiosDeRegion`), no un campo. Da
       * `ECONOMIA.rentaDelPueblo` de oro al día a su dueño si está unido a su base
       * (`rentaDelDia`).
       */
      readonly kind: 'village';
      readonly id: string;
      readonly name: string;
      readonly at: Point;
      owner: number | null;
      /**
       * La barrera del muro sobre el que está, como la de un nodo (pueblos en un
       * nodo, fase 3, 05-11-2026): `buildMap` abre su casilla y la guarda aquí. Solo
       * va sobre montaña, bosque o acantilado (`BARRERAS_DEL_PUEBLO`), y entonces es
       * un nodo entre dos regiones y se entra por su eje, no por su puerta
       * (`puertaDe`). `null` en el de dentro de una región, que va en lo que se pisa.
       */
      readonly barrera: Barrera | null;
    }
  | {
      /**
       * Una ciudad. Su `owner` es el dueño guardado **solo si está en el muro** (un
       * nodo: la base, la ciudad-puente), y lo escribe solo `tomarElNodo`; dentro de
       * una región es de quien la tenga y su `owner` se queda en `null`. El dueño de
       * una ciudad, sea cual sea, se pregunta a `dueñoDelSitio` (`state/sitios.ts`).
       */
      readonly kind: 'town';
      readonly id: string;
      readonly at: Point;
      owner: number | null;
    }
  | {
      readonly kind: 'monster';
      readonly id: string;
      readonly at: Point;
      readonly creature: string;
      count: number;
      defeated: boolean;
    }
  | {
      readonly kind: 'chest';
      readonly id: string;
      readonly at: Point;
      readonly gold: number;
      taken: boolean;
    }
  | {
      /**
       * Un lugar de un mundo (`core/mundo/`): un sitio que se visita, con su escena
       * lateral, su gente y sus diálogos. Lo pone `newGame` tras `buildMap`, desde la
       * historia del mundo; el procedimental no los hace. **Estático**: lo que cambia
       * (su estado, las marcas) vive en `GameState.mundo`, no aquí, así que la memoria
       * de la niebla no tiene nada que recordar mal. Se pisa como un cofre y no
       * bloquea; se entra al acabar la marcha en él.
       */
      readonly kind: 'lugar';
      readonly id: string;
      readonly at: Point;
      readonly name: string;
    };

/**
 * Una región declarada: su id, su nombre, una casilla suya (la semilla) y su
 * nivel de altura.
 *
 * La región **no se guarda casilla a casilla**: es la componente del terreno
 * pisable, sin nodos, que contiene esa casilla, y la calcula `estructura`
 * (`regiones.ts`). Lo único que el mapa necesita recordar es cómo se llama y
 * dónde está, para poder nombrarla en un mensaje y para que dos productores de
 * mapas no tengan que ponerse de acuerdo en numerarlas.
 */
export interface MapRegion {
  readonly id: string;
  readonly name: string;
  readonly at: Point;
  /**
   * A qué altura está (#143). Sin efecto en las reglas: el generador lo sortea
   * antes que las barreras —que dependen de él— y el escenógrafo lo pinta. Un
   * plan del agente no lo declara todavía y sus regiones van todas al 1.
   */
  readonly nivel: Nivel;
}

export interface GameMap {
  readonly width: number;
  readonly height: number;
  /**
   * Las regiones del mapa de nodos. Vacío en un mapa que no las tiene —los de
   * algunos tests de pathfinding—, y entonces no hay territorio que calcular.
   */
  readonly regions: readonly MapRegion[];
  /** Terreno por casilla, en orden de filas. */
  readonly terrain: TerrainKind[];
  /**
   * Los caminos: los tramos que se pintan y, derivadas de ellos, las casillas
   * que abaratan el paso. Un solo campo para los dos hechos, para que no puedan
   * discrepar (#153).
   */
  readonly caminos: RedDeCaminos;
  readonly objects: MapObject[];
}

/**
 * Qué es un nodo de la red: un paso (un objeto `node`), o una ciudad o un pueblo
 * en el muro, entre dos regiones o más.
 */
export type ClaseDeNodo = 'paso' | 'ciudad' | 'pueblo';

/** Un nodo de la red: un objeto `node`, o una ciudad o un pueblo que toca dos regiones o más. */
export interface NodoDeRed {
  /** El id del objeto del mapa: el del paso, el de la ciudad o el del pueblo. */
  readonly id: string;
  readonly at: Point;
  readonly clase: ClaseDeNodo;
  /** Las regiones que toca, por índice y en orden ascendente. Su número es el **grado**. */
  readonly regiones: readonly number[];
}

/** Una región declarada del mapa, con los nodos que la rodean. */
interface RegionDeRed extends MapRegion {
  /** Los nodos que la rodean, por índice en `Estructura.nodos`. */
  readonly nodos: readonly number[];
}

export interface Estructura {
  /** La región de cada casilla (índice `y*width+x`), o −1: muro, nodo o fuera de toda región. */
  readonly regionDe: Int32Array;
  readonly regiones: readonly RegionDeRed[];
  readonly nodos: readonly NodoDeRed[];
  /** El índice de cada nodo por el id de su objeto. */
  readonly nodoPorId: ReadonlyMap<string, number>;
  /** El índice de cada región por su id. */
  readonly regionPorId: ReadonlyMap<string, number>;
  /**
   * Las ciudades y los pueblos **dentro de una región** (tocan solo esa), por el id
   * de su objeto, con el índice de su región. No son nodos: su casilla es de su
   * región (`regionDe`) y no cuentan para el dueño de nadie.
   */
  readonly sitiosDeRegion: ReadonlyMap<string, number>;
}
