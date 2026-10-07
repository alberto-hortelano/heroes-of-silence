/**
 * Las marcas de fallo en disco: `docs/revision/marcas/<id>.json` y su `<id>.png`.
 *
 * Las escribe el servidor de Vite de `pnpm dev` (plugin `marcas` de
 * `vite.config.ts`) cuando alguien marca un fallo en el mapa, y las leen y
 * resuelven `pnpm marcas` y el coordinador. La carpeta no se commitea: es una
 * bandeja de entrada, no documentación.
 *
 * Aparte de `vite.config.ts` para que los tests lo ejerzan contra una carpeta
 * temporal sin arrancar vite, como `tools/arena/borrador.ts`.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  esquemaDeMarca,
  esquemaDeMarcaNueva,
  FORMA_DEL_ID,
  fraseDe,
} from '../../src/client/desarrollo/esquema.js';
import type { Marca } from '../../src/client/desarrollo/tipos.js';

/** Dónde viven las marcas, relativo a la raíz del repo (ignorado por git). */
export const CARPETA_DE_MARCAS = 'docs/revision/marcas';

const dosCifras = (n: number): string => String(n).padStart(2, '0');

/** El id de una marca: la hora (UTC) y el sitio, legible y ordenable. */
export function idDeMarca(ahora: Date, semilla: number, casilla: { x: number; y: number }): string {
  const fecha = `${ahora.getUTCFullYear()}${dosCifras(ahora.getUTCMonth() + 1)}${dosCifras(ahora.getUTCDate())}`;
  const hora = `${dosCifras(ahora.getUTCHours())}${dosCifras(ahora.getUTCMinutes())}${dosCifras(ahora.getUTCSeconds())}`;
  return `${fecha}-${hora}-s${semilla}-${casilla.x}-${casilla.y}`;
}

function rutaDe(raiz: string, id: string, ext: '.json' | '.png'): string {
  if (!FORMA_DEL_ID.test(id))
    throw new Error(
      `«${id}» no es un id de marca: tienen la forma AAAAMMDD-HHMMSS-s<semilla>-<x>-<y> (pnpm marcas lista)`,
    );
  return join(raiz, CARPETA_DE_MARCAS, `${id}${ext}`);
}

/** Escribe un fichero que no existe; si existe, lanza diciéndolo. Una marca no pisa a otra. */
function escribirNuevo(ruta: string, datos: string | Buffer): void {
  try {
    writeFileSync(ruta, datos, { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST')
      throw new Error(`ya hay una marca en ${ruta}: espera un segundo y vuelve a guardar`);
    throw err;
  }
}

/**
 * Valida lo que manda el cliente y lo escribe: `<id>.json` y `<id>.png`. Lanza
 * con la frase del esquema si no valida, y si ya hay una marca con ese id.
 */
export function guardarMarca(
  raiz: string,
  cuerpo: unknown,
  ahora = new Date(),
): { id: string; json: string; png: string } {
  const leida = esquemaDeMarcaNueva.safeParse(cuerpo);
  if (!leida.success) throw new Error(fraseDe(leida.error));
  const { png, ...resto } = leida.data;
  const id = idDeMarca(ahora, resto.semilla, resto.casilla);
  mkdirSync(join(raiz, CARPETA_DE_MARCAS), { recursive: true });
  const json = rutaDe(raiz, id, '.json');
  const rutaPng = rutaDe(raiz, id, '.png');
  const marca: Marca = {
    id,
    fecha: ahora.toISOString(),
    resuelta: null,
    ...resto,
    png: `${id}.png`,
  };
  // El PNG primero: un JSON sin su recorte sería una marca rota en la lista.
  escribirNuevo(rutaPng, Buffer.from(png, 'base64'));
  escribirNuevo(json, `${JSON.stringify(marca, null, 2)}\n`);
  return { id, json, png: rutaPng };
}

/** Lee una marca por su id, validada. Lanza si no existe o si el fichero no es una marca. */
export function leerMarca(raiz: string, id: string): Marca {
  const ruta = rutaDe(raiz, id, '.json');
  if (!existsSync(ruta))
    throw new Error(
      `no hay ninguna marca ${id} en ${CARPETA_DE_MARCAS} (pnpm marcas lista --todas)`,
    );
  let crudo: unknown;
  try {
    crudo = JSON.parse(readFileSync(ruta, 'utf8'));
  } catch {
    throw new Error(`${ruta} no es JSON: alguien lo ha editado a mano`);
  }
  const leida = esquemaDeMarca.safeParse(crudo);
  if (!leida.success) throw new Error(`${ruta} no es una marca: ${fraseDe(leida.error)}`);
  return leida.data;
}

/** Todas las marcas, de la más antigua a la más nueva. Sin carpeta, ninguna. */
export function listarMarcas(raiz: string): Marca[] {
  const carpeta = join(raiz, CARPETA_DE_MARCAS);
  if (!existsSync(carpeta)) return [];
  return readdirSync(carpeta)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => leerMarca(raiz, f.slice(0, -'.json'.length)));
}

/** Da una marca por resuelta con `ref` (una issue o un commit). Lanza si ya lo estaba. */
export function resolverMarca(raiz: string, id: string, ref: string, ahora = new Date()): Marca {
  const marca = leerMarca(raiz, id);
  const limpia = ref.trim();
  if (limpia === '')
    throw new Error('resolver una marca pide con qué: una issue (#160) o un commit');
  if (marca.resuelta !== null)
    throw new Error(
      `la marca ${id} ya está resuelta con ${marca.resuelta.ref} (${marca.resuelta.fecha})`,
    );
  const resuelta: Marca = {
    ...marca,
    resuelta: { ref: limpia, fecha: ahora.toISOString() },
  };
  writeFileSync(rutaDe(raiz, id, '.json'), `${JSON.stringify(resuelta, null, 2)}\n`);
  return resuelta;
}
