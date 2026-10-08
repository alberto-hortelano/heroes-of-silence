/**
 * Qué parte de `assets/` va a `dist/` con `vite build` (#137).
 *
 * `assets/` es la carpeta pública de vite: en `pnpm dev` se sirve entera, y así
 * el taller y la arena leen lo que acaban de escribir. Pero el build la copiaba
 * entera también, y en cada `assets/unidades/<id>/dN/` van, junto al
 * `atlas.webp` que pinta la figura, las hojas de las que se juntó
 * (`hoja-a.webp`, `hoja-b.webp`), sus procedencias y los JSON del corte: ~100 MB
 * que el juego no pide nunca. No se borran del repo —son la procedencia que lee
 * `tools/taller/evaluar.ts`—: se quedan fuera del build.
 *
 * Aparte de `vite.config.ts` para que los tests lo ejerzan sin arrancar vite.
 */
import { cpSync } from 'node:fs';
import { relative, sep } from 'node:path';

/**
 * Lo que hay en una carpeta de dirección de una unidad y no es su atlas. La
 * página lee `unidades/<id>/dN/atlas.webp` (`registrarUnidad`,
 * `src/client/render/personajes.ts`) y nada más de esa carpeta: los
 * `atlas.json` le llegan dentro de la lista de hojas (`/__arena/hojas`). Las
 * poses del Y Bot (`_poses/`) no viven en carpetas `dN/` y van enteras.
 */
const SOLO_DEL_TALLER = /^unidades\/[^/]+\/d[0-7]\/(?!atlas\.webp$)[^/]+$/;

/** ¿Va a `dist/` este fichero, con su ruta relativa a `assets/`? */
export function seCopiaAlBuild(relativa: string): boolean {
  return !SOLO_DEL_TALLER.test(relativa.split(sep).join('/'));
}

/** Copia `assets/` a la salida del build sin lo que solo lee el taller. */
export function copiarPublico(origen: string, destino: string): void {
  cpSync(origen, destino, {
    recursive: true,
    filter: (ruta) => seCopiaAlBuild(relative(origen, ruta)),
  });
}
