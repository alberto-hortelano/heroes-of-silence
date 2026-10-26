/**
 * Cuánto cobra una carga (#260, 14-10-2026): las cifras de `data/carga.json`, las
 * mismas para todos desde el 26-10-2026 (la montura pone su fuerza en el golpe, no
 * en lo que cobra). Cuándo hay recta lo dice `cargaDesde` (`battle.ts`);
 * esto es lo que vale una vez que la hay.
 *
 * Aparte de `damage.ts` porque la leen también la ficha de la arena
 * (`DICHO_DEL_USO`, `hero/equipo.ts`) y el contrato del agente, y porque
 * `CARGA_MINIMA` —la recta— tiene que estar donde se validan las cifras: un tope
 * por debajo de la recta más corta no se notaría en ningún golpe.
 */
import cargaJson from '../../../data/carga.json' with { type: 'json' };
import type { UnitInfo } from '../types.js';
import { entero, objetoCon, porcentaje } from '../validar.js';
import { golpeDe } from './armas.js';

/** Por debajo de esto no hay carga: hace falta arrancar (decisión del usuario, 02-10-2026). */
export const CARGA_MINIMA = 3;

/** Lo que cobra una carga: cuánto por casilla y hasta cuántas casillas. */
export interface CifrasDeCarga {
  /**
   * El tanto por ciento por casilla, entero, como va en el JSON y se dice. En el
   * daño multiplica `porcentaje / 100`.
   */
  readonly porcentaje: number;
  /** Las casillas que se cobran como mucho (`cargaEfectiva`). */
  readonly tope: number;
}

/**
 * Valida `data/carga.json` y lo devuelve tipado; lanza diciendo el fichero y el
 * campo. Exportada con el JSON de argumento para que un test la vea morder. Una
 * sola carga desde el 26-10-2026: el +10 % del jinete se fue, y montado con lanza
 * lo que cambia es la fuerza del golpe (`GolpeConArma.carga`), no lo que cobra.
 */
export function validarCarga(json: unknown, fichero = 'data/carga.json'): CifrasDeCarga {
  const o = objetoCon(json, ['_comment', 'porcentaje', 'tope'], fichero);
  return {
    porcentaje: porcentaje(o, fichero),
    tope: entero(o.tope, 'tope', fichero, CARGA_MINIMA),
  };
}

/** Lo que cobra toda carga, de quien sea (`data/carga.json`). */
export const CARGA: CifrasDeCarga = validarCarga(cargaJson);

/**
 * Si `unit` carga montada: con una montura de guerra y una lanza puestas, que es
 * cuando su golpe de carga lleva su propia horquilla (`GolpeConArma.carga`, que
 * escribe `conEquipo`; 26-10-2026). **La única pregunta** de «carga montado con
 * lanza»: la leen la IA (a quién coloca para cargar), la ficha y el dicho de la
 * carga.
 */
export function cargaMontada(unit: UnitInfo): boolean {
  return golpeDe(unit, 'arma').carga !== undefined;
}

/**
 * Las casillas de carga que se COBRAN de una recta de `casillas`: el tope, y
 * nada más. Lo leen el golpe y el anuncio (`casillasDeCarga`), así que un «»7»
 * pintado no puede acabar cobrando 5.
 */
export function cargaEfectiva(casillas: number, cifras: CifrasDeCarga): number {
  return Math.min(casillas, cifras.tope);
}

/**
 * El tanto por ciento que suma una carga de `casillas` ya cobradas, en entero:
 * lo que pintan el tablero y la barra (`CasillaDeCarga.porciento`), que así no
 * hacen la cuenta.
 */
export function porcientoDeLaCarga(casillas: number, cifras: CifrasDeCarga): number {
  return casillas * cifras.porcentaje;
}

/**
 * Una carga cobrada, dicha: «carga de 3 casillas», montada (`cargaMontada`) «carga
 * de 3 casillas montada», y con lo que suma (`conLoQueSuma`) «…, +15 %». **La única
 * frase de una carga cobrada**: sin lo que suma la lee la previsión, que pone el
 * factor detrás; con él, el parte de guerra.
 */
export function dichoDeLaCarga(casillas: number, montada: boolean, conLoQueSuma = true): string {
  const causa = `carga de ${casillas} ${casillas === 1 ? 'casilla' : 'casillas'}${montada ? ' montada' : ''}`;
  return conLoQueSuma ? `${causa}, +${porcientoDeLaCarga(casillas, CARGA)} %` : causa;
}

/**
 * Las cifras de la carga dichas para la ficha, cortas (van en la fila de «Armas»
 * del panel de la pelea, de 274 px): «+5 %/casilla (3 a 5)», y montada (con la
 * fuerza de la montura) «…, montada».
 */
export function dichoDeLasCifras(montada: boolean): string {
  return `+${CARGA.porcentaje} %/casilla (${CARGA_MINIMA} a ${CARGA.tope})${montada ? ', montada' : ''}`;
}
