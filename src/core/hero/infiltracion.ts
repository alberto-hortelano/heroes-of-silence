/**
 * La infiltración (fase A, 05-11-2026, `docs/agents/2026-11-05-infiltrados-y-robo/`;
 * **regla nuestra**): un grupo en que lleva el rasgo todo el mundo, héroe incluido,
 * cruza las cinco barreras del mapa a un día entero por casilla.
 *
 * - **Quién**: el héroe cuyo tipo se infiltra (`data/infiltradores.json`,
 *   `tipoSeInfiltra`) y cuya tropa entera lleva el rasgo `infiltrarse`
 *   (`data/unidades.json`). Basta uno sin él para que no. Sin tropa, solo el tipo.
 * - **Cuánto**: una casilla de barrera cuesta el día entero de marcha del grupo
 *   (I7, «Un día entero»): la marcha con que empezó el día (`Hero.marchaDelDia`),
 *   así que solo se entra con el día recién empezado y se gasta todo; con el día
 *   ya empezado se espera en el borde. Es un precio más del
 *   Dijkstra del mapa (`reachableFrom(…, barrera)`), y no un caso aparte: de él
 *   salen solos la ruta en dos colores, `pasosDeHoy` y el `march_cut`. Con
 *   «basta con que le quede algo» el precio dependería de con cuánto se llega y
 *   el Dijkstra dejaría de ser de un solo coste (`critica.md`).
 *
 * Es **el único módulo que lee el rasgo** `'infiltrarse'` (lo vigila
 * `invariantes-partida.test.ts`): la búsqueda de caminos, la ficha y el contrato le
 * preguntan aquí.
 */

import { enumerar } from '../texto.js';
import { type Hero, hasTrait } from '../types.js';
import { unidadDelJuego } from '../unidad/catalogo.js';
import { nombreDeTipoDeHeroe, tipoSeInfiltra } from './tipos-de-heroe.js';

/** Lo que hace falta de un héroe para saber si se infiltra: su tipo y su tropa. */
type GrupoQueSeInfiltra = Pick<Hero, 'faction' | 'tipo' | 'army'>;

/**
 * Si el grupo de `hero` se infiltra: su tipo y toda su tropa. La pregunta del
 * camino caliente (`precioDeLaBarrera`, en cada búsqueda del héroe): corta en el
 * primero que no lo lleva y no monta ninguna frase. El porqué, para quien lo
 * enseña, `infiltracionBlocker`; las dos dicen lo mismo (lo fija
 * `infiltracion.test.ts`).
 */
export function seInfiltra(hero: GrupoQueSeInfiltra): boolean {
  return (
    tipoSeInfiltra(hero.faction, hero.tipo) &&
    hero.army.every((t) => quienNoLoLleva(t.creature) === null)
  );
}

/**
 * Por qué el grupo de `hero` no se infiltra, o `null` si se infiltra: «no se
 * infiltra: no lo llevan su tipo (Caballero) ni Guerrero con escudo», cada cosa
 * una vez. Para quien enseña el motivo: `porQueNoLlega`, el contrato y el panel
 * del héroe.
 */
export function infiltracionBlocker(hero: GrupoQueSeInfiltra): string | null {
  const faltan: string[] = [];
  if (!tipoSeInfiltra(hero.faction, hero.tipo)) {
    faltan.push(`su tipo (${nombreDeTipoDeHeroe(hero.faction, hero.tipo)})`);
  }
  for (const t of hero.army) {
    const quien = quienNoLoLleva(t.creature);
    if (quien !== null && !faltan.includes(quien)) faltan.push(quien);
  }
  if (faltan.length === 0) return null;
  return `no se infiltra: no lo ${faltan.length === 1 ? 'lleva' : 'llevan'} ${enumerar(faltan, 'ni')}`;
}

/** El nombre de un individuo de la tropa que no lleva el rasgo, o `null` si lo lleva. */
function quienNoLoLleva(creature: string): string | null {
  const unidad = unidadDelJuego(creature);
  return hasTrait(unidad, 'infiltrarse') ? null : unidad.name;
}

/**
 * Lo que le cuesta a `hero` entrar en una casilla de barrera, o `null` si no se
 * infiltra (no la pisa): el día entero, la marcha con que lo empezó
 * (`Hero.marchaDelDia`), así que nunca se entra con el día empezado, tampoco tras
 * cambiar de tropa a media jornada. Es el `barrera` del Dijkstra del héroe
 * (`alcanceDelHeroe`, `caminoHasta`).
 */
export function precioDeLaBarrera(
  hero: GrupoQueSeInfiltra & Pick<Hero, 'marchaDelDia'>,
): number | null {
  return seInfiltra(hero) ? hero.marchaDelDia : null;
}
