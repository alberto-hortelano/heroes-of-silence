/**
 * Quién carga y cuánto cobra (#260, 14-10-2026): las cifras de `data/carga.json`
 * y la regla que las reparte. Cuándo hay recta lo dice `cargaDesde` (`battle.ts`);
 * esto es lo que vale una vez que la hay.
 *
 * Aparte de `damage.ts` porque la leen también la ficha de la arena
 * (`DICHO_DEL_USO`, `hero/equipo.ts`) y el contrato del agente, y porque
 * `CARGA_MINIMA` —la recta— tiene que estar donde se validan las cifras: un tope
 * por debajo de la recta más corta no se notaría en ningún golpe.
 */
import cargaJson from '../../../data/carga.json' with { type: 'json' };
import { hasTrait } from '../data.js';
import type { UnitInfo } from '../types.js';
import { entero, objetoCon, porcentaje } from '../validar.js';

/** Por debajo de esto no hay carga: hace falta arrancar (decisión del usuario, 02-10-2026). */
export const CARGA_MINIMA = 3;

/** Lo que cobra una carga: cuánto por casilla y hasta cuántas casillas. */
export interface CifrasDeCarga {
  /**
   * El tanto por ciento por casilla, entero, como va en el JSON y se dice. En el
   * daño multiplica `porcentaje / 100`: 10 / 100 es el mismo double que el 0.1 de
   * antes, y el banco no se mueve.
   */
  readonly porcentaje: number;
  /** Las casillas que se cobran como mucho (`cargaEfectiva`). */
  readonly tope: number;
}

/** Las dos cargas: la del jinete (el rasgo `charge`) y la de a pie (solo la arena). */
export interface CargasDeLaBatalla {
  readonly jinete: CifrasDeCarga;
  readonly aPie: CifrasDeCarga;
}

/**
 * Valida `data/carga.json` y lo devuelve tipado; lanza diciendo el fichero y el
 * campo. Exportada con el JSON de argumento para que un test la vea morder.
 */
export function validarCarga(json: unknown, fichero = 'data/carga.json'): CargasDeLaBatalla {
  const j = objetoCon(json, ['_comment', 'jinete', 'aPie'], fichero);
  const cifras = (campo: 'jinete' | 'aPie'): CifrasDeCarga => {
    const quien = `${fichero}: ${campo}`;
    const o = objetoCon(j[campo], ['porcentaje', 'tope'], quien);
    return { porcentaje: porcentaje(o, quien), tope: entero(o.tope, 'tope', quien, CARGA_MINIMA) };
  };
  return { jinete: cifras('jinete'), aPie: cifras('aPie') };
}

export const CARGA: CargasDeLaBatalla = validarCarga(cargaJson);

/**
 * Con qué cifras carga `unit`, o `null` si no carga. **La única regla de quién
 * carga y cuánto**: con el rasgo `charge`, la del jinete, en el juego y en la
 * arena; sin él, la de a pie si la batalla la juega (`ModosDeArena.cargaAPie`,
 * que enciende solo la arena); si no, nadie. La leen `cargaDelStack` (la
 * batalla: la carga, el daño, el anuncio, la IA y la ayuda del panel) y la ficha
 * (`armasDe`).
 */
export function cifrasDeCarga(unit: UnitInfo, cargaAPie: boolean): CifrasDeCarga | null {
  if (hasTrait(unit, 'charge')) return CARGA.jinete;
  return cargaAPie ? CARGA.aPie : null;
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

/** ¿Son las de a pie? Derivado: son las de `CARGA.aPie`, no un campo que pueda discrepar. */
function aPie(cifras: CifrasDeCarga): boolean {
  return cifras === CARGA.aPie;
}

/**
 * Una carga cobrada, dicha: «carga de 3 casillas a pie», y con lo que suma
 * (`conLoQueSuma`) «carga de 3 casillas a pie, +15 %». **La única frase de una
 * carga cobrada**: sin lo que suma la lee la previsión, que pone el factor detrás;
 * con él, el parte de guerra.
 */
export function dichoDeLaCarga(
  casillas: number,
  cifras: CifrasDeCarga,
  conLoQueSuma = true,
): string {
  const causa = `carga de ${casillas} ${casillas === 1 ? 'casilla' : 'casillas'}${aPie(cifras) ? ' a pie' : ''}`;
  return conLoQueSuma ? `${causa}, +${porcientoDeLaCarga(casillas, cifras)} %` : causa;
}

/**
 * Las cifras de una carga dichas para la ficha, cortas (van en la fila de «Armas»
 * del panel de la pelea, de 274 px): «+5 %/casilla (3 a 5), a pie».
 */
export function dichoDeLasCifras(cifras: CifrasDeCarga): string {
  return `+${cifras.porcentaje} %/casilla (${CARGA_MINIMA} a ${cifras.tope})${aPie(cifras) ? ', a pie' : ''}`;
}
