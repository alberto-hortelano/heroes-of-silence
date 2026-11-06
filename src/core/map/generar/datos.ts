/**
 * Las tablas del generador de mapas: las barreras que se sortean
 * (`data/barreras.json`), el nivel de cada suelo (`data/relieve.json`) y el
 * poblamiento de las regiones (`data/poblamiento.json`).
 *
 * Su lector vivía en `data.ts`, con las demás tablas; desde la fase N de la
 * reorganización (07-11-2026) cada `data/*.json` lo lee el módulo de su dominio, que
 * lo valida al cargar.
 */
import barrerasJson from '../../../../data/barreras.json' with { type: 'json' };
import poblamientoJson from '../../../../data/poblamiento.json' with { type: 'json' };
import relieveJson from '../../../../data/relieve.json' with { type: 'json' };
import { enteroDesde, esObjeto, problemasDeObjeto } from '../../validar.js';
import {
  BARRERAS,
  type Barrera,
  NIVELES,
  type Nivel,
  SUELOS_PISABLES,
  type Suelo,
} from '../terrain.js';

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

/** Lo que se lee de `data/poblamiento.json`: dónde pone el generador las ciudades que no van en un nodo. */
export interface ReglasDelPoblamiento {
  /**
   * Cuántas parejas de regiones de fuera (una de cada bando, en espejo) llevan una
   * ciudad en mitad de la región. Si el mapa tiene menos, todas.
   */
  readonly parejasConCiudad: number;
  /**
   * En cuántas parejas de regiones de fuera, de cada `de`, el pueblo va al paso con
   * camino de su región, en el muro (pueblos en un nodo, fase 3): una cuota por mapa,
   * redondeada, entre las parejas que pueden (`pueblosEnElMuro`, `generate.ts`).
   */
  readonly pueblosEnUnNodo: { readonly uno: number; readonly de: number };
}

/**
 * Valida `data/poblamiento.json` (**inventado**, como dice su `_comment`). Lanza
 * con todos los problemas a la vez; con el JSON de argumento para que el guardia
 * se pueda ver morder con un fichero roto.
 */
export function validarPoblamiento(
  json: unknown,
  fichero = 'data/poblamiento.json',
): ReglasDelPoblamiento {
  const problemas = problemasDeObjeto(json, ['_comment', 'parejasConCiudad', 'pueblosEnUnNodo']);
  const j = esObjeto(json) ? json : {};
  const v = j.parejasConCiudad;
  if (!enteroDesde(v, 0) || v > 10)
    problemas.push(
      `"parejasConCiudad" tiene que ser un entero de 0 a 10, y lleva ${JSON.stringify(v)}`,
    );
  // Una proporción, «uno de cada de»: dos enteros y no un decimal, que se lee igual
  // en el fichero y en la cuota.
  const p = j.pueblosEnUnNodo;
  const q = esObjeto(p) ? p : {};
  if (
    problemasDeObjeto(p, ['uno', 'de'], ['uno', 'de']).length > 0 ||
    !enteroDesde(q.de, 1) ||
    q.de > 100 ||
    !enteroDesde(q.uno, 0) ||
    q.uno > q.de
  )
    problemas.push(
      `"pueblosEnUnNodo" tiene que ser {"uno", "de"}, enteros con 0 ≤ uno ≤ de y de de 1 a 100 (uno de cada «de» pueblos va en un nodo), y lleva ${JSON.stringify(p)}`,
    );
  if (problemas.length > 0) throw new Error(`${fichero}: ${problemas.join('; ')}`);
  return {
    parejasConCiudad: v as number,
    pueblosEnUnNodo: { uno: q.uno as number, de: q.de as number },
  };
}

export const POBLAMIENTO: ReglasDelPoblamiento = validarPoblamiento(poblamientoJson);
