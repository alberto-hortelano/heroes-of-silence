/**
 * El catálogo de hechizos del juego: **lo único que importa `data/hechizos.json`**
 * (lo vigila `invariantes-datos.test.ts`). Lo lee y lo juzga una vez al cargar
 * (`leerHechizos`: lanza con todos sus problemas, nombrando el fichero).
 *
 * La batalla no va al catálogo: lleva los hechizos de quienes pelean ya resueltos
 * (`BattleState.libro`), así que la arena pelea con hechizos sin guardar.
 */
import hechizosJson from '../../../data/hechizos.json' with { type: 'json' };
import type { FactionId } from '../types.js';
import type { Hechizo } from './formato.js';
import { leerHechizos } from './validar.js';

/** Un catálogo de hechizos: por id, en el orden en que se escribieron. */
export type CatalogoDeHechizos = ReadonlyMap<string, Hechizo>;

/** El catálogo de una lista de hechizos ya validada. */
export function catalogoDeHechizos(lista: readonly Hechizo[]): CatalogoDeHechizos {
  return new Map(lista.map((h) => [h.id, h]));
}

/** Los hechizos de `data/hechizos.json`. */
export const HECHIZOS_DEL_JUEGO: CatalogoDeHechizos = catalogoDeHechizos(
  leerHechizos(hechizosJson),
);

/** El hechizo `id` de un catálogo (el del juego, por defecto). Lanza con uno que no existe. */
export function hechizo(id: string, cat: CatalogoDeHechizos = HECHIZOS_DEL_JUEGO): Hechizo {
  const h = cat.get(id);
  if (h === undefined) throw new Error(`hechizo desconocido: «${id}»`);
  return h;
}

/** Todos los hechizos del juego, en el orden del fichero. */
export function todosLosHechizos(cat: CatalogoDeHechizos = HECHIZOS_DEL_JUEGO): readonly Hechizo[] {
  return [...cat.values()];
}

/**
 * El orden en que se lee una lista de hechizos: por gremio (los de ninguno, al
 * final), luego por maná y, a igualdad, por id. Es el del gremio y el del libro
 * del héroe en pantalla, escrito una vez.
 *
 * El libro en el estado (`hero.spells`) NO se reordena: va en el orden en que se
 * aprendió, y de ese orden cuelga cómo la IA recorre sus hechizos —reordenarlo
 * movía las partidas del banco—. Quien lo enseña lo ordena al pintar (#54).
 */
export function ordenDelLibro(a: Hechizo, b: Hechizo): number {
  const ga = a.gremio ?? Number.MAX_SAFE_INTEGER;
  const gb = b.gremio ?? Number.MAX_SAFE_INTEGER;
  return ga - gb || a.mana - b.mana || a.id.localeCompare(b.id);
}

/** Los hechizos de una batalla, por id (`BattleState.libro`). */
export type LibroDeHechizos = Readonly<Record<string, Hechizo>>;

/**
 * Cómo se llama un hechizo: el de `libro` (el de la batalla, con lo que pelea la
 * arena sin guardar) o el del juego; si no está en ninguno, su id. Lo leen el parte,
 * las pastillas y los botones.
 */
export function nombreDeHechizo(id: string, libro?: LibroDeHechizos): string {
  return libro?.[id]?.nombre ?? HECHIZOS_DEL_JUEGO.get(id)?.nombre ?? id;
}

/** Los hechizos de `ids` en el orden del libro, de `libro` o del juego. Lanza con uno que no está. */
export function enOrdenDelLibro(ids: readonly string[], libro?: LibroDeHechizos): Hechizo[] {
  return ids.map((id) => libro?.[id] ?? hechizo(id)).sort(ordenDelLibro);
}

/**
 * Los hechizos que enseña un gremio de nivel `nivel` a `facciones`: los de su nivel
 * o menos que sean de alguna de ellas (08-11-2026, «Sí, por facción»), en orden.
 * Las facciones son obligatorias para que cada lector decida: la partida pasa la
 * de la ciudad (`townSpells`); quien no tiene ninguna (el héroe de la arena, las
 * medidas y las capturas), `FACTION_IDS`.
 */
export function hechizosDelGremio(
  nivel: number,
  facciones: readonly FactionId[],
  cat: CatalogoDeHechizos = HECHIZOS_DEL_JUEGO,
): readonly Hechizo[] {
  if (nivel === 0) return [];
  return todosLosHechizos(cat)
    .filter(
      (h) =>
        h.gremio !== null && h.gremio <= nivel && h.facciones.some((f) => facciones.includes(f)),
    )
    .sort(ordenDelLibro);
}
