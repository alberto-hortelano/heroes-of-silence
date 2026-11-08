/**
 * El relieve por celdas en el taller, de punta a punta: los encargos de sus
 * diagonales y sus bajadas (§23) y la derivación de las juntas de cada hoja del
 * relieve, cada una con la de su familia (laderas, diagonales, bajadas y rampas).
 * Lo leen encolar (`--relieve`), la orden `derivar-relieve` y el post-proceso de un
 * encargo (`proceso.ts`), que deriva la hoja que acaba de llegar.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  esHojaDeBajada,
  esHojaDeDiagonal,
  esHojaDeLadera,
  esHojaDeRampa,
  esHojaDeRelieve,
} from '../../src/client/render/escenario/catalogo.js';
import { RAIZ } from '../comun/raiz.js';
import { encargoDeBajadas, escribirBajadasDerivadas, NIVELES_DE_BAJADA } from './bajadas.js';
import {
  encargoDeDiagonales,
  escribirDiagonalesDerivadas,
  LADOS_DE_DIAGONAL,
  NIVELES_DE_DIAGONAL,
} from './diagonales.js';
import { escribirLaderasDerivadas } from './laderas.js';
import { MATERIALES } from './paredes-puentes.js';
import { escribirRampasDerivadas } from './rampas.js';

/** Los encargos del relieve por celdas (§23): diagonales de caída 1-3 y bajadas de caída 1-2, por material. */
export function encargosDelRelieve() {
  return MATERIALES.flatMap((m) => [
    ...LADOS_DE_DIAGONAL.flatMap((l) =>
      NIVELES_DE_DIAGONAL.map((n) => encargoDeDiagonales(m, l, n)),
    ),
    ...NIVELES_DE_BAJADA.map((n) => encargoDeBajadas(m, n)),
  ]);
}

/**
 * Las juntas de las hojas del relieve que se pidan, o de todas las que hay en
 * disco: cada una con la derivación de su familia.
 */
export async function escribirRelieveDerivado(hojas?: readonly string[]): Promise<string[]> {
  const todas =
    hojas ??
    (await readdir(join(RAIZ, 'assets/mapa/modulos')))
      .filter((f) => f.endsWith('.json') && !f.endsWith('.procedencia.json'))
      .map((f) => f.slice(0, -'.json'.length))
      .filter(esHojaDeRelieve);
  const escritas: string[] = [];
  for (const hoja of todas) {
    if (esHojaDeLadera(hoja)) escritas.push(...(await escribirLaderasDerivadas([hoja])));
    else if (esHojaDeDiagonal(hoja)) escritas.push(await escribirDiagonalesDerivadas(hoja));
    else if (esHojaDeBajada(hoja)) escritas.push(await escribirBajadasDerivadas(hoja));
    else if (esHojaDeRampa(hoja)) escritas.push(await escribirRampasDerivadas(hoja));
    else
      throw new Error(
        `«${hoja}» no es una hoja del relieve (laderas, diagonales, bajadas o rampas)`,
      );
  }
  return escritas;
}
