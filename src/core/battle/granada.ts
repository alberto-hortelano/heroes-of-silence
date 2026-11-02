/**
 * La granada (02-11-2026, regla nuestra; petición del usuario: «Y las granadas? Me
 * gustaria evitar meter un factor aleatorio»): lo que no depende del estado de la
 * batalla —su alcance y qué casillas alcanza su explosión, cada una con el cuarto de
 * la horquilla en que cae su tirada—. A quién da y cuánto lo dice `explosionDe`
 * (`battle.ts`), la única regla que leen la explosión, la previsión, la IA y el
 * tablero. Las cifras, inventadas, en `data/granada.json`, que importa solo este
 * módulo.
 */
import granadaJson from '../../../data/granada.json' with { type: 'json' };
import type { Hex, UnitInfo } from '../types.js';
import { enteroBlocker, objetoCon } from '../validar.js';
import { isInside, neighbours } from './board.js';
import { CUARTO_MAXIMO } from './damage.js';

/** En qué cuarto de la horquilla cae la tirada de la explosión, en la casilla y en sus vecinas. */
export interface CifrasDeLaGranada {
  readonly cuartoDelCentro: number;
  readonly cuartoDelAnillo: number;
}

/**
 * Valida `data/granada.json` y lo devuelve tipado; lanza diciendo el fichero y el
 * campo. Exportada con el JSON de argumento, como `validarCarga`.
 */
export function validarGranada(json: unknown, fichero = 'data/granada.json'): CifrasDeLaGranada {
  const o = objetoCon(json, ['_comment', 'cuartoDelCentro', 'cuartoDelAnillo'], fichero);
  const cuarto = (campo: 'cuartoDelCentro' | 'cuartoDelAnillo'): number => {
    const motivo = enteroBlocker(o[campo], 0, CUARTO_MAXIMO);
    if (motivo !== null) {
      throw new Error(`${fichero}: ${campo} es un cuarto de la horquilla y ${motivo}`);
    }
    return o[campo] as number;
  };
  return { cuartoDelCentro: cuarto('cuartoDelCentro'), cuartoDelAnillo: cuarto('cuartoDelAnillo') };
}

/** Las cifras de toda granada (`data/granada.json`). */
export const GRANADA: CifrasDeLaGranada = validarGranada(granadaJson);

/**
 * Hasta cuántas casillas lanza `unit` una granada: la fuerza de su cuerpo (con lo
 * que le sube el rango), al menos 1 (decisión del usuario, 02-11-2026: «Fuerza. Mira
 * las caracteristicas de los humanos en general»: un humano de fuerza 3, 3 casillas).
 * Ni el peso ni el equipo la cambian: es la del brazo.
 */
export function alcanceDeLaGranada(unit: Pick<UnitInfo, 'fuerza'>): number {
  return Math.max(1, unit.fuerza);
}

/** Una casilla que alcanza una explosión y el cuarto de su tirada (0 a 4). */
export interface CasillaDeLaExplosion {
  readonly hex: Hex;
  readonly cuarto: number;
}

/**
 * Las casillas que alcanza una granada que explota en `at`: ella, con el cuarto del
 * centro, y sus vecinas del tablero, con el del anillo. Más allá, nada.
 */
export function casillasDeLaExplosion(at: Hex): readonly CasillaDeLaExplosion[] {
  const centro: CasillaDeLaExplosion[] = isInside(at)
    ? [{ hex: at, cuarto: GRANADA.cuartoDelCentro }]
    : [];
  return [...centro, ...neighbours(at).map((hex) => ({ hex, cuarto: GRANADA.cuartoDelAnillo }))];
}
