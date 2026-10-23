/**
 * El arte en ocho direcciones de una figura en disco —`dN/atlas.json` y
 * `dN/atlas.webp` en cada una—, la tropa de `assets/unidades/` y la gente del
 * banco de NPC de `assets/npcs/`: si está entero, a medias o sin empezar, y sus
 * ocho JSON. Solo `node:fs`: lo leen la arena (`hojasDelTaller`), el visor del
 * taller y el banco de NPC (`tools/npcs/banco.ts`, que sirve `/__npcs` en `pnpm
 * dev` sin cargar el taller).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NOMBRES_DE_DIRECCION } from '../../src/shared/arte.js';

/** Dónde vive un arte en ocho direcciones y qué se dice del que está a medias. */
export interface CarpetaDeArte {
  /** Relativa a la raíz: la de cada figura es `<dir>/<id>/`. */
  readonly dir: string;
  /** Lo que sigue al «le faltan …» de una a medias. */
  readonly aMedias: string;
}

/** La tropa (y los héroes) del taller: lo que lista la arena. */
export const ARTE_DE_LAS_UNIDADES: CarpetaDeArte = {
  dir: 'assets/unidades',
  aMedias:
    'o se terminan o se quitan, porque con menos se pintaría entera con el Y Bot sin decirlo',
};

/**
 * Cuánto arte propio tiene una figura en las ocho direcciones: entero, ninguno o a
 * medias, y entonces con el motivo escrito. Una figura no mezcla las luces de dos
 * artes, así que con siete se pintaría entera con el Y Bot, y eso tiene que
 * decirse y no pasar en silencio. A medias es lo normal **mientras el taller
 * genera** una figura dirección a dirección (#140): por eso esto no lanza y decide
 * quien lo lee.
 */
export type ArteEnOchoDirecciones =
  | { readonly hecho: 'entero' }
  | { readonly hecho: 'ninguno' }
  | { readonly hecho: 'a-medias'; readonly motivo: string };

export function arteEnOchoDirecciones(
  raiz: string,
  id: string,
  carpeta: CarpetaDeArte = ARTE_DE_LAS_UNIDADES,
): ArteEnOchoDirecciones {
  const faltan = NOMBRES_DE_DIRECCION.map((_, d) => d).filter(
    (d) =>
      !['atlas.json', 'atlas.webp'].every((f) =>
        existsSync(join(raiz, carpeta.dir, id, `d${d}`, f)),
      ),
  );
  if (faltan.length === 0) return { hecho: 'entero' };
  if (faltan.length === NOMBRES_DE_DIRECCION.length) return { hecho: 'ninguno' };
  return {
    hecho: 'a-medias',
    motivo: `${id} tiene ${NOMBRES_DE_DIRECCION.length - faltan.length} de sus ${NOMBRES_DE_DIRECCION.length} direcciones (le faltan ${faltan.map((d) => `d${d}`).join(', ')}): ${carpeta.aMedias}`,
  };
}

/**
 * El arte propio de una figura tal como lo lee la página: sus ocho
 * `dN/atlas.json`, o `null` sin ninguno, y si lo tiene a medias, el motivo en
 * `incompleta` (#140). Una a medias no lanza —el taller la está generando, y la
 * lista de la arena y `vite build` caían con ella— pero tampoco se pinta con el Y
 * Bot: la arena la lista y no la monta, y la gente sigue con la parecida.
 */
export function direccionesDe(
  raiz: string,
  id: string,
  carpeta: CarpetaDeArte = ARTE_DE_LAS_UNIDADES,
): { readonly direcciones: readonly unknown[] | null; readonly incompleta: string | null } {
  const arte = arteEnOchoDirecciones(raiz, id, carpeta);
  if (arte.hecho === 'ninguno') return { direcciones: null, incompleta: null };
  if (arte.hecho === 'a-medias') return { direcciones: null, incompleta: arte.motivo };
  const direcciones = NOMBRES_DE_DIRECCION.map(
    (_, d) =>
      JSON.parse(
        readFileSync(join(raiz, carpeta.dir, id, `d${d}`, 'atlas.json'), 'utf8'),
      ) as unknown,
  );
  return { direcciones, incompleta: null };
}
