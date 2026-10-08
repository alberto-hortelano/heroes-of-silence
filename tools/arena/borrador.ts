/**
 * El lado de disco de la arena (`/arena/`): qué hojas hay y el borrador de
 * cifras, `data/borradores/unidades.json`. Lo sirve el servidor de desarrollo
 * (`vite.config.ts`) y nada más: el navegador no puede escribir en el repo, y
 * la partida no lee el borrador.
 *
 * Aparte de `vite.config.ts` para que los tests lo ejerzan contra una carpeta
 * temporal sin arrancar vite.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  COMENTARIO_DEL_BORRADOR,
  type HojaDeArena,
  revisarBorradorDeArena,
  type UnidadDeArena,
  type UnidadSinValidar,
  validarBorradorDeArena,
  validarHojasDeArena,
} from '../../src/core/arena.js';
import { NOMBRES_DE_DIRECCION } from '../../src/shared/arte.js';
import { arteEnOchoDirecciones, HEROES, juegoDelYBot, UNIDADES } from '../taller/unidades.js';
import { VELOCIDAD_DE_SALIDA } from './velocidades.js';

/** Las casillas de salida de una hoja: una hoja sin la suya es un olvido, y se dice. */
function velocidadDeSalida(id: string): number {
  const fila = VELOCIDAD_DE_SALIDA[id];
  if (fila === undefined) {
    throw new Error(`la hoja ${id} no tiene velocidad de salida en tools/arena/velocidades.ts`);
  }
  return fila[0];
}

/** Dónde vive el borrador, relativo a la raíz del repo. */
export const RUTA_DEL_BORRADOR = 'data/borradores/unidades.json';

/**
 * El arte propio de una unidad tal como lo lee la arena: sus ocho
 * `dN/atlas.json`, o `null` sin ninguno (sale con el Y Bot), y si lo tiene a
 * medias, el motivo en `incompleta` (#140). Una unidad a medias no lanza —el
 * taller la está generando, y la lista de la arena y `vite build` caían con
 * ella— pero tampoco se pinta con el Y Bot: la arena la lista y no la monta.
 */
export function direccionesDe(
  raiz: string,
  id: string,
): Pick<HojaDeArena, 'direcciones' | 'incompleta'> {
  const arte = arteEnOchoDirecciones(raiz, id);
  if (arte.hecho === 'ninguno') return { direcciones: null, incompleta: null };
  if (arte.hecho === 'a-medias') return { direcciones: null, incompleta: arte.motivo };
  const direcciones = NOMBRES_DE_DIRECCION.map(
    (_, d) =>
      JSON.parse(
        readFileSync(join(raiz, 'assets/unidades', id, `d${d}`, 'atlas.json'), 'utf8'),
      ) as unknown,
  );
  return { direcciones, incompleta: null };
}

/**
 * Todas las unidades del taller, la tropa primero y los héroes detrás, en el
 * orden de `tools/taller/unidades.ts`: toda figura tiene 8 direcciones —las
 * suyas o las del Y Bot de su juego de armas (decisión del usuario,
 * 03-10-2026)—, así que ya no hace falta arte propio para montarla. Pasan por
 * la misma validación que la página aplica al recibirlas, así que un perfil que
 * la arena no conoce revienta aquí, al servir la lista, y no a mitad de una pelea.
 */
export function hojasDeArena(raiz: string): readonly HojaDeArena[] {
  const todas = [
    ...UNIDADES.map((u) => ({ u, heroe: false })),
    ...HEROES.map((u) => ({ u, heroe: true })),
  ];
  return validarHojasDeArena(
    todas.map(({ u, heroe }) => ({
      id: u.id,
      nombre: u.nombre,
      faccion: u.faccion,
      perfil: u.perfil,
      heroe,
      casillas: velocidadDeSalida(u.id),
      juego: juegoDelYBot(u),
      ...direccionesDe(raiz, u.id),
    })),
  );
}

/** El borrador tal como está en disco: lo que vale, lo que no y por qué. */
export interface BorradorLeido {
  readonly unidades: readonly UnidadDeArena[];
  readonly invalidas: readonly UnidadSinValidar[];
}

/**
 * Lo guardado, unidad a unidad (`revisarBorradorDeArena`); vacío si todavía no
 * se ha guardado nada. Lanza si el archivo no es JSON o no tiene forma de
 * borrador: ahí no hay unidad que salvar, y guardar encima lo borraría.
 */
export function leerBorrador(raiz: string): BorradorLeido {
  const ruta = join(raiz, RUTA_DEL_BORRADOR);
  if (!existsSync(ruta)) return { unidades: [], invalidas: [] };
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(ruta, 'utf8')) as unknown;
  } catch (err) {
    throw new Error(`${RUTA_DEL_BORRADOR} no es JSON: ${err instanceof Error ? err.message : err}`);
  }
  const { validas, invalidas } = revisarBorradorDeArena(json);
  return { unidades: validas, invalidas };
}

/**
 * Escribe el borrador si es válido, y si no lanza con la frase de
 * `validarBorradorDeArena` sin tocar el fichero.
 *
 * **Guardar no pierde nada que no se haya tocado** (H2 de QA): las unidades del
 * archivo que no validan se escriben otra vez tal cual —salvo que la página
 * mande una válida con el mismo id, que es arreglarla—, y si el archivo de
 * ahora no se puede leer, no se pisa: se rechaza diciéndolo. La escritura es
 * atómica —un temporal y `rename`—: un guardado a medias dejaría un JSON roto.
 */
export function escribirBorrador(
  raiz: string,
  cuerpo: unknown,
): { readonly unidades: number; readonly conservadas: number } {
  const unidades = validarBorradorDeArena(cuerpo);
  let antes: BorradorLeido;
  try {
    antes = leerBorrador(raiz);
  } catch (err) {
    throw new Error(
      `no se guarda para no pisarlo: ${err instanceof Error ? err.message : err}. Arréglalo o bórralo a mano`,
    );
  }
  const nuevos = new Set(unidades.map((u) => u.id));
  const conservadas = antes.invalidas.filter((u) => u.id === null || !nuevos.has(u.id));
  const ruta = join(raiz, RUTA_DEL_BORRADOR);
  mkdirSync(dirname(ruta), { recursive: true });
  const temporal = `${ruta}.${process.pid}.tmp`;
  writeFileSync(
    temporal,
    `${JSON.stringify(
      {
        _comment: COMENTARIO_DEL_BORRADOR,
        unidades: [...unidades, ...conservadas.map((u) => u.crudo)],
      },
      null,
      2,
    )}\n`,
  );
  renameSync(temporal, ruta);
  return { unidades: unidades.length, conservadas: conservadas.length };
}
