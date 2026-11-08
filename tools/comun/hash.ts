/**
 * El sha256 de las herramientas y los tests: con él se ancla lo pintado
 * (procedencias, derivados, índices), se reconoce lo que no cambió (la versión del
 * catálogo de la arena, los huesos de un maniquí) y se mide la huella. Estaba
 * escrito a mano en cada sitio (seis funciones, una de ellas exportada por
 * `taller/poses-8d.ts` para otros seis, y una docena en línea); una sola, para que
 * todos hablen del mismo hexadecimal (fase H de la reorganización, 08-11-2026).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** El sha256 en hexadecimal de unos bytes, o de un texto (en UTF-8). */
export function sha256(datos: string | Uint8Array): string {
  return createHash('sha256').update(datos).digest('hex');
}

/** El sha256 de lo que hay en el fichero `ruta`. */
export function sha256DeFichero(ruta: string): string {
  return sha256(readFileSync(ruta));
}
