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
 * Lo que solo lee el taller, en tres reglas:
 * - En una carpeta de dirección de una unidad, todo menos su atlas. La página
 *   lee `unidades/<id>/dN/atlas.webp` (`registrarUnidad`,
 *   `src/client/render/personajes.ts`) y nada más de esa carpeta: los
 *   `atlas.json` le llegan dentro de la lista de hojas (`/__arena/hojas`). Las
 *   poses del Y Bot (`_poses/`) no viven en carpetas `dN/` y van enteras.
 * - Toda carpeta `fuentes/` o `_guias/`, a cualquier altura: las fuentes de las
 *   que el taller saca lo que la página pide (maestros, ediciones e identidades
 *   de la base, `bases/<f>/fuentes/`) y las guías de corte de las piezas de los
 *   temas (`temas/_guias/`). Por eso las letras viven en `letras/` y no en
 *   `fuentes/`.
 * - `art/` entero (134 MB): las láminas y referencias de estilo de las que se
 *   pinta y se mide (la paleta de los temas sale de `art/temas/`). Ni el
 *   cliente ni el build lo leen (comprobado con grep y con `vite build`,
 *   13-10-2026).
 *
 * La carpeta misma se deja fuera, no solo lo de dentro: si no, el build la crea
 * vacía.
 */
const SOLO_DEL_TALLER =
  /^unidades\/[^/]+\/d[0-7]\/(?!atlas\.webp$)[^/]+$|(?:^|\/)(?:fuentes|_guias)(?:\/|$)|^art(?:\/|$)/;

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
