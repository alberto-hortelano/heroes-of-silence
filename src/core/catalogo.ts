/**
 * **El catálogo de unidades** de las cinco facciones (`data/unidades.json`): la
 * lista entera, una unidad por hoja de tropa del taller más las que se hayan
 * creado en la arena. Lo edita la arena (`pnpm arena`, «Guardar», por
 * `tools/arena/borrador.ts`) y lo lee esto, sin pasar por `tools/`.
 *
 * Antes no había catálogo: la arena peleaba con un borrador de 12 unidades
 * encima de lo que derivaba al servir la página de cada hoja del taller, y eso
 * `core` no lo puede leer. Se escribió una vez con las dos cosas juntas
 * (18-10-2026).
 *
 * Se valida entero al cargar con la regla del juego (`leerCatalogos`, la misma
 * con que guarda la arena) y las piezas de `data/equipo.json`: una unidad que no
 * vale tumba la carga diciendo el fichero, cuál y por qué. La arena lo lee más
 * blanda —conserva la que no vale para que se arregle a mano— porque es la
 * herramienta con que se arregla; el juego no puede jugar con una unidad rota.
 */
import unidadesJson from '../../data/unidades.json' with { type: 'json' };
import { EQUIPO_DEL_JUEGO } from './hero/equipo.js';
import { leerCatalogos, RUTA_DEL_CATALOGO_DE_UNIDADES, type UnidadDeArena } from './unidad.js';

/**
 * Todas las unidades del catálogo, en su orden: el de las hojas del taller y las
 * nuevas detrás. Leídas con lo que el juego exige a los catálogos juntos
 * (`leerCatalogos`: también el equipo base del héroe con las piezas del juego).
 */
export const UNIDADES: readonly UnidadDeArena[] = leerCatalogos(EQUIPO_DEL_JUEGO, unidadesJson);

const POR_ID: ReadonlyMap<string, UnidadDeArena> = new Map(UNIDADES.map((u) => [u.id, u]));

/** La unidad `id` del catálogo; lanza diciendo cuál si no está. */
export function unidad(id: string): UnidadDeArena {
  const u = POR_ID.get(id);
  if (u === undefined) {
    throw new Error(`no hay ninguna unidad «${id}» en ${RUTA_DEL_CATALOGO_DE_UNIDADES}`);
  }
  return u;
}
