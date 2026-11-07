/**
 * Las tablas del generador de mapas: el nivel de cada suelo
 * (`data/relieve.json`) y el poblamiento de las regiones
 * (`data/poblamiento.json`). Las barreras que se sortean (`data/barreras.json`)
 * son del vestido y las lee `map/vestir/base.ts` (fase N de la reorganización,
 * 07-11-2026: así `map/vestir/` no importa nada de `map/generar/`).
 *
 * Su lector vivía en `data.ts`, con las demás tablas; desde la fase N de la
 * reorganización (07-11-2026) cada `data/*.json` lo lee el módulo de su dominio, que
 * lo valida al cargar.
 */
import poblamientoJson from '../../../../data/poblamiento.json' with { type: 'json' };
import relieveJson from '../../../../data/relieve.json' with { type: 'json' };
import { enteroDesde, esObjeto, problemasDeObjeto } from '../../validar.js';
import { NIVELES, type Nivel, SUELOS_PISABLES, type Suelo } from '../terrain.js';

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
   * redondeada, entre las parejas que pueden (`pueblosEnElMuro`, `poblar.ts`).
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
