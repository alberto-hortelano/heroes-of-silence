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
import { HEROES, UNIDADES } from '../taller/unidades.js';
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
 * ¿Tiene ya su `atlas.json` esta hoja del taller? Es la definición de «hoja
 * publicada» que leen la arena y la página de ejércitos del taller.
 */
export function tieneAtlas(raiz: string, id: string): boolean {
  return existsSync(join(raiz, 'assets/unidades', id, 'atlas.json'));
}

/**
 * Las hojas del taller que ya tienen `atlas.json`: la tropa primero y los
 * héroes detrás, en el orden de `tools/taller/unidades.ts`. Pasan por la misma
 * validación que la página aplica al recibirlas, así que un perfil que la arena
 * no conoce revienta aquí, al servir la lista, y no a mitad de una pelea.
 */
export function hojasDeArena(raiz: string): readonly HojaDeArena[] {
  const todas = [
    ...UNIDADES.map((u) => ({ u, heroe: false })),
    ...HEROES.map((u) => ({ u, heroe: true })),
  ];
  return validarHojasDeArena(
    todas
      .filter(({ u }) => tieneAtlas(raiz, u.id))
      .map(({ u, heroe }) => ({
        id: u.id,
        nombre: u.nombre,
        faccion: u.faccion,
        perfil: u.perfil,
        heroe,
        casillas: velocidadDeSalida(u.id),
        atlas: JSON.parse(
          readFileSync(join(raiz, 'assets/unidades', u.id, 'atlas.json'), 'utf8'),
        ) as unknown,
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
