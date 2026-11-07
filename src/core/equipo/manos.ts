/**
 * Lo que admite una mano y dos (decisiones del usuario, 12-10-2026 y 25-10-2026: «se
 * permiten dos armas»): un arma a dos manos va sola —ni escudo ni segunda arma—, y
 * con dos de una mano no queda mano para el escudo (`manosBlocker`, la única lectura
 * de `Pieza.manos`); si un equipo entero vale (`equipoBlocker`), y poner y quitar una
 * pieza de su hueco (`ponerPieza`, la última puerta, y `quitarPieza`). Con las
 * lecturas de las marcas de una pieza para quien las enseña: `aDosManos`, `esLanza`
 * y `esDeGuerra`.
 *
 * Era parte de `hero/equipo.ts`, repartido en `equipo/` en la fase N de la
 * reorganización (07-11-2026); qué es el equipo y dónde vive, en `vestir.ts`.
 */
import {
  type Equipo,
  esHueco,
  HUECOS,
  type Hueco,
  huecoBlocker,
  huecoDesconocido,
  NOMBRE_DE_HUECO,
} from '../types.js';
import { type CatalogoDePiezas, PIEZAS_DEL_CATALOGO, type Pieza, pieza, piezaDe } from './pieza.js';

/**
 * La regla de las manos y del escudo dicha para quien juega: la leen la prosa del
 * agente y la ficha de la arena. Junto a `manosBlocker`, que es quien la aplica.
 */
export const REGLA_DEL_ESCUDO =
  'un arma a dos manos va sola (ni escudo ni segunda arma), y con dos armas de una mano no queda mano para el escudo';

/**
 * Si `p` es un arma a dos manos. Junto a `manosBlocker`, que aplica la regla: es
 * la lectura de `manos` para quien solo la enseña o la escribe (la vista y el
 * enlace de la arena), sin una segunda comparación con el número.
 */
export function aDosManos(p: Pick<Pieza, 'manos'>): boolean {
  return p.manos === 2;
}

/** Si `p` es una lanza (`Pieza.lanza`): la lectura para quien la enseña, como `aDosManos`. */
export function esLanza(p: Pick<Pieza, 'lanza'>): boolean {
  return p.lanza === true;
}

/** Si `p` es una montura de guerra (`Pieza.guerra`): la lectura para quien la enseña, como `esLanza`. */
export function esDeGuerra(p: Pick<Pieza, 'guerra'>): boolean {
  return p.guerra === true;
}

/**
 * Por qué no se puede poner la pieza `id` en `hueco` (el suyo si no se dice) sobre
 * `equipo`, o `null` si sí. Las manos (decisiones del usuario, 12-10-2026 y
 * 25-10-2026: «se permiten dos armas»): un arma a dos manos va sola —ni escudo ni
 * segunda arma—, y con dos armas de una mano no queda mano para el escudo; la
 * segunda va con una primera, y solo un arma de cuerpo a cuerpo de una mano va de
 * segunda. Las dos direcciones de cada cosa. La pieza que ocupa `hueco` no cuenta,
 * porque se quita al ponerla. **La única lectura de `manos`**: la leen `equipBlocker`
 * (el juego y el agente), la arena y `equipoBlocker`, y `ponerPieza` lanza con ella
 * como última puerta.
 */
export function manosBlocker(equipo: Equipo | undefined, id: string, hueco?: Hueco): string | null {
  return manosDe(PIEZAS_DEL_CATALOGO, equipo, id, hueco);
}

export function manosDe(
  piezas: CatalogoDePiezas,
  equipo: Equipo | undefined,
  id: string,
  enHueco?: Hueco,
): string | null {
  const p = piezaDe(piezas, id);
  const hueco = enHueco ?? p.hueco;
  const fuera = huecoBlocker(p, hueco);
  if (fuera !== null) return fuera;
  const resto: Equipo = { ...equipo, [hueco]: undefined };
  const de = (h: Hueco): Pieza | null => {
    const x = resto[h];
    return x === undefined ? null : piezaDe(piezas, x);
  };
  const [arma, segunda, escudo] = [de('arma'), de('segunda'), de('escudo')];
  if (hueco === 'segunda') {
    if (aDosManos(p)) {
      return `${p.nombre} es un arma a dos manos: va sola, no de segunda arma`;
    }
    if (arma === null)
      return `${p.nombre} va de segunda arma con una primera: pon antes una en ${NOMBRE_DE_HUECO.arma}`;
    if (aDosManos(arma)) {
      return `${arma.nombre} es un arma a dos manos y no deja mano para una segunda arma`;
    }
    if (escudo !== null) {
      return `con ${escudo.nombre} no queda mano para una segunda arma: quita antes el escudo`;
    }
  }
  if (hueco === 'escudo') {
    if (arma !== null && aDosManos(arma)) {
      return `${p.nombre} no se puede llevar con ${arma.nombre}: es un arma a dos manos y no deja mano para el escudo`;
    }
    if (segunda !== null) {
      return `${p.nombre} no se puede llevar con dos armas: no queda mano para el escudo; quita antes ${segunda.nombre}`;
    }
  }
  if (hueco === 'arma' && aDosManos(p)) {
    if (escudo !== null) {
      return `${p.nombre} es un arma a dos manos y no se puede llevar con ${escudo.nombre}: quita antes el escudo`;
    }
    if (segunda !== null) {
      return `${p.nombre} es un arma a dos manos y va sola: quita antes ${segunda.nombre}`;
    }
  }
  return null;
}

/**
 * Por qué un equipo entero no vale, o `null`: que cada pieza exista, que vaya en
 * un hueco suyo (`huecosDeLaPieza`), que la segunda arma vaya con una primera y
 * que las manos cuadren (`manosBlocker`). Lo leen la arena al validar una unidad
 * (un equipo escrito a mano en el catálogo no pasa por `ponerPieza`) y el equipo
 * base del héroe (`equipoBaseBlocker`).
 */
export function equipoBlocker(equipo: Equipo): string | null {
  return equipoBlockerDe(PIEZAS_DEL_CATALOGO, equipo);
}

export function equipoBlockerDe(piezas: CatalogoDePiezas, equipo: Equipo): string | null {
  for (const [hueco, id] of Object.entries(equipo)) {
    if (!esHueco(hueco)) return huecoDesconocido(hueco, HUECOS);
    if (id === undefined) continue;
    const p = piezas.get(id) ?? null;
    if (p === null) return `no existe ninguna pieza "${id}"`;
    const fuera = huecoBlocker(p, hueco);
    if (fuera !== null) return fuera;
  }
  for (const h of ['arma', 'segunda', 'escudo'] as const) {
    const id = equipo[h];
    if (id === undefined) continue;
    const motivo = manosDe(piezas, equipo, id, h);
    if (motivo !== null) return motivo;
  }
  return null;
}

/**
 * El equipo con `id` puesto en `hueco` (el suyo si no se dice), y lo que ocupaba
 * ese hueco (o `null`). Lanza si las manos no cuadran (`manosBlocker`), diciendo a
 * quién si se da `portador`. El juego ya lo preguntó (`equipBlocker`) y aquí está
 * la última puerta; la arena no pregunta antes: esta es su pregunta.
 *
 * `deSerie` es lo de serie que el portador lleva debajo (`equipoDeSerieDe`): cuenta
 * para las manos, como en la pregunta del juego, pero no se devuelve ni sale como
 * `quitada`, que lo de serie no va a la mochila. Sin él, la daga de serie de un
 * arquero no contaba de primera arma y «A la segunda mano», que la pregunta veía,
 * lanzaba aquí (H1 del QA de fuerza y agilidad, 26-10-2026).
 */
export function ponerPieza(
  equipo: Equipo | undefined,
  id: string,
  portador?: string,
  hueco?: Hueco,
  deSerie?: Equipo,
): { readonly equipo: Equipo; readonly quitada: string | null } {
  return poner(PIEZAS_DEL_CATALOGO, equipo, pieza(id), portador, hueco, deSerie);
}

export function poner(
  piezas: CatalogoDePiezas,
  equipo: Equipo | undefined,
  p: Pieza,
  portador?: string,
  enHueco?: Hueco,
  deSerie: Equipo = {},
): { readonly equipo: Equipo; readonly quitada: string | null } {
  const hueco = enHueco ?? p.hueco;
  const motivo = manosDe(piezas, { ...deSerie, ...equipo }, p.id, hueco);
  if (motivo !== null) {
    const a = portador === undefined ? '' : ` a ${portador}`;
    throw new Error(`no se puede poner ${p.nombre}${a}: ${motivo}`);
  }
  const quitada = equipo?.[hueco] ?? null;
  return { equipo: { ...equipo, [hueco]: p.id }, quitada };
}

/** El equipo sin lo que hubiera en `hueco`, y lo que había (o `null`). */
export function quitarPieza(
  equipo: Equipo | undefined,
  hueco: Hueco,
): { readonly equipo: Equipo; readonly quitada: string | null } {
  const quitada = equipo?.[hueco] ?? null;
  const { [hueco]: _fuera, ...resto } = equipo ?? {};
  return { equipo: resto, quitada };
}

/**
 * Lo que se dice al quitar de un hueco vacío, con el hueco por su nombre
 * (`NOMBRE_DE_HUECO`), no por su clave: «Aldo no lleva nada en Escudo» y no «en
 * el hueco escudo», que al agente, que lo pidió como `shield`, no le decía nada.
 * La leen `unequipBlocker` y la arena (`quitarEnArena`).
 */
export function nadaEnElHueco(quien: string, hueco: Hueco): string {
  return `${quien} no lleva nada en ${NOMBRE_DE_HUECO[hueco]}`;
}
