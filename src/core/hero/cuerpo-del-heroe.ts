/**
 * El héroe como figura del tablero, de `data/heroe.json`: el cuerpo de todo héroe
 * (el que edita la arena), el precio de rendirse y el equipo con que nace
 * (`EQUIPO_BASE`, y si vale con un catálogo, `equipoBaseBlocker`: estaban en
 * `hero/equipo.ts` hasta la fase N de la reorganización, 07-11-2026).
 *
 * Su lector vivía en `data.ts`, con las demás tablas; desde la fase N de la
 * reorganización (07-11-2026) cada `data/*.json` lo lee el módulo de su dominio, que
 * lo valida al cargar.
 */
import heroeJson from '../../../data/heroe.json' with { type: 'json' };
import type { EquipoAtado } from '../equipo/atado.js';
import { type Equipo, esHueco, HUECOS } from '../types.js';
import { enteroBlocker, esObjeto, problemasDeObjeto } from '../validar.js';

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
   * existan; que las piezas existan y casen lo comprueba `equipoBaseBlocker`
   * (abajo) al cargar los catálogos, con el de equipo.
   */
  readonly equipoBase: Equipo;
}

/** El equipo base de `data/heroe.json`, con sus huecos comprobados. */
function equipoBaseDelHeroe(valor: unknown): Equipo {
  if (!esObjeto(valor)) {
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

/** Dónde vive el héroe, relativo a la raíz del repo: el juego lo carga y «Guardar» de la arena escribe su `combate`. */
export const RUTA_DEL_HEROE = 'data/heroe.json';

/** El cuerpo de todo héroe en batalla (`combate` de `data/heroe.json`): el que edita la arena. */
export type CuerpoDeTodoHeroe = ReglasDelHeroe['combate'];

/**
 * El cuerpo del héroe de `data/heroe.json`, comprobado: un JSON se edita a mano, y
 * una cifra mal escrita se dice al cargar, no en la batalla. Lo de antes (`danio`,
 * `velocidad`) no vale: la fuerza y la agilidad lo sustituyen (25-10-2026). La
 * misma regla para el que edita la arena y escribe «Guardar» (`donde`, quién lo trae).
 */
export function combateDelHeroe(c: unknown, donde = RUTA_DEL_HEROE): CuerpoDeTodoHeroe {
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
  if (problemas.length > 0) throw new Error(`${donde}: ${problemas.join('; ')}`);
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
 * Por qué el equipo base del héroe (`data/heroe.json`) no vale con las piezas de
 * `eq`, o `null`: que cada pieza exista, vaya en su hueco y las manos casen
 * (`equipoBlocker`). La lee solo `leerCatalogos` (`unidad/formato.ts`), lo que la
 * carga del juego, «Guardar» y el editor de equipo exigen a los catálogos juntos.
 */
export function equipoBaseBlocker(eq: EquipoAtado): string | null {
  const motivo = eq.equipoBlocker(HEROE.equipoBase);
  return motivo === null ? null : `el equipo base del héroe (data/heroe.json): ${motivo}`;
}

/**
 * El equipo con el que nace todo héroe (decisión del usuario, 18-10-2026: la
 * Espada y el gambesón), de `data/heroe.json`, donde se comprueba su forma; que
 * sus piezas valgan con el catálogo lo comprueba la carga de los catálogos
 * (`leerCatalogos`, desde `unidad/catalogo.ts`). Lo lleva también el héroe de la arena.
 */
export const EQUIPO_BASE: Equipo = Object.freeze({ ...HEROE.equipoBase });
