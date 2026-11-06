/**
 * El liderazgo, de `data/liderazgo.json`: el tope de un héroe y el de una
 * guarnición, y los topes de tropa por bando que se pueden elegir
 * (`ReglasDelCombate.tope`).
 *
 * Su lector vivía en `data.ts`, con las demás tablas; desde la fase N de la
 * reorganización (07-11-2026) cada `data/*.json` lo lee el módulo de su dominio, que
 * lo valida al cargar.
 */
import liderazgoJson from '../../../data/liderazgo.json' with { type: 'json' };
import { enteroDesde } from '../validar.js';

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
  topesPorBando: TOPES_POR_BANDO,
  maxPorBando: TOPES_POR_BANDO.at(-1) as number,
};
