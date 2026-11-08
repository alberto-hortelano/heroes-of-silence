/**
 * El catálogo de equipo atado (`EquipoAtado`): las lecturas de las piezas con UN
 * catálogo (`equipoCon`), el que edita la arena y con el que pelea
 * (`catalogoDeEquipo`, `catalogoDelFichero`) y el del juego (`EQUIPO_DEL_JUEGO`).
 *
 * Era parte de `hero/equipo.ts`, repartido en `equipo/` en la fase N de la
 * reorganización (07-11-2026); qué es el equipo y dónde vive, en `vestir.ts`.
 */

import type { Equipo, Hueco, UnitInfo } from '../types.js';
import { equipoBlockerDe, manosDe, poner } from './manos.js';
import {
  type CatalogoDePiezas,
  EQUIPO,
  EQUIPO_ESCRITO,
  leerEquipo,
  leerPiezas,
  type Pieza,
  type PiezaEscrita,
  piezaDe,
} from './pieza.js';
import { puestasDe, type SumaDeEquipo, sumaDe, vestir } from './vestir.js';

/**
 * Las lecturas de las piezas atadas a UN catálogo (`equipoCon`). El juego usa las
 * sueltas de `equipo/` (`pieza`, `conEquipo`, `manosBlocker`…, de este mismo módulo
 * hasta la fase N de la reorganización, 07-11-2026), que leen siempre el suyo
 * (`PIEZAS_DEL_CATALOGO`, el fichero tal como se cargó); la arena edita el catálogo en memoria antes de
 * guardarlo y pelea con él (`catalogoDeEquipo`), y solo entra por aquí: así no hay
 * lectura que se olvide de su catálogo y resuelva en silencio con la pieza que se
 * cargó. Que la arena no importe las sueltas lo vigila `test/invariantes-datos.test.ts`.
 */
export interface EquipoAtado {
  readonly piezas: CatalogoDePiezas;
  readonly pieza: (id: string) => Pieza;
  readonly piezaSiExiste: (id: string) => Pieza | null;
  readonly piezasPuestas: (equipo: Equipo | undefined) => Pieza[];
  readonly sumaDeEquipo: (equipo: Equipo | undefined) => SumaDeEquipo;
  readonly conEquipo: <U extends UnitInfo>(unit: U, equipo: Equipo | undefined) => U;
  readonly manosBlocker: (equipo: Equipo | undefined, id: string, hueco?: Hueco) => string | null;
  readonly equipoBlocker: (equipo: Equipo) => string | null;
  readonly ponerPieza: (
    equipo: Equipo | undefined,
    id: string,
    portador?: string,
    hueco?: Hueco,
    deSerie?: Equipo,
  ) => { readonly equipo: Equipo; readonly quitada: string | null };
}

/**
 * Un catálogo de equipo con cómo está escrita cada pieza (`escritas`: entera o
 * sobre su base), por id, además de sus lecturas resueltas. La ficha de la arena,
 * el cambio de base y lo que se guarda leen las escritas; todo lo que pelea, las
 * resueltas.
 */
export type CatalogoDeEquipo = EquipoAtado & {
  readonly escritas: ReadonlyMap<string, PiezaEscrita>;
};

/** Las lecturas de las piezas con el catálogo `piezas` (`EquipoAtado`). */
function equipoCon(piezas: CatalogoDePiezas): EquipoAtado {
  return {
    piezas,
    pieza: (id) => piezaDe(piezas, id),
    piezaSiExiste: (id) => piezas.get(id) ?? null,
    piezasPuestas: (equipo) => puestasDe(piezas, equipo),
    sumaDeEquipo: (equipo) => sumaDe(piezas, equipo),
    conEquipo: (unit, equipo) => vestir(piezas, unit, equipo),
    manosBlocker: (equipo, id, hueco) => manosDe(piezas, equipo, id, hueco),
    equipoBlocker: (equipo) => equipoBlockerDe(piezas, equipo),
    ponerPieza: (equipo, id, portador, hueco, deSerie) => {
      return poner(piezas, equipo, piezaDe(piezas, id), portador, hueco, deSerie);
    },
  };
}

/**
 * Un catálogo de equipo entero (`escritas`, todas las piezas, como se escriben en
 * `data/equipo.json`), comprobado con la regla del catálogo (`leerPiezas`: cada
 * pieza, sin repetir, resuelta con sus bases, y alguna de botín) y atado
 * (`equipoCon`); lanza con lo que no vale. Es el catálogo que edita la arena y con
 * el que pelea; el del juego es `EQUIPO_DEL_JUEGO`. **Se hace una vez por lista** y
 * viaja hecho a quien lo necesita (el montaje, el retoque, el cambio de una pieza).
 */
export function catalogoDeEquipo(escritas: readonly unknown[]): CatalogoDeEquipo {
  return atado(leerPiezas(escritas));
}

/**
 * El catálogo de equipo de un fichero (`{ piezas: [...] }`, `leerEquipo`), hecho:
 * lo que lee y escribe la arena en disco (`tools/arena/borrador.ts`), con una sola
 * validación.
 */
export function catalogoDelFichero(json: unknown, fichero?: string): CatalogoDeEquipo {
  return atado(leerEquipo(json, fichero));
}

/** Unas piezas ya leídas (`leerPiezas`), atadas (`equipoCon`) y con sus escritas. */
function atado(leido: {
  readonly escritas: readonly PiezaEscrita[];
  readonly piezas: readonly Pieza[];
}): CatalogoDeEquipo {
  return {
    ...equipoCon(new Map(leido.piezas.map((p) => [p.id, p]))),
    escritas: new Map(leido.escritas.map((p) => [p.id, p])),
  };
}

/** El catálogo del juego (`data/equipo.json` tal como se cargó), atado y con sus escritas. */
export const EQUIPO_DEL_JUEGO: CatalogoDeEquipo = atado({
  escritas: EQUIPO_ESCRITO,
  piezas: EQUIPO,
});
