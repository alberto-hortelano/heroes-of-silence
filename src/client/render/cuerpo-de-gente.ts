/**
 * Los cuerpos con que se pinta la gente —la de la base y la de los lugares—, sin
 * nada más: los lee la sesión (`vistaDeLaBase`, `lugar/sesion.ts`) para decir con qué
 * cuerpo va cada persona sin cargar la tabla de figuras (`personajes.ts`, que lleva
 * las anclas del Y Bot y su validación).
 */

/**
 * El cuerpo con que se pinta la gente sin figura del banco de NPC: el Y Bot sin
 * armas y en reposo de civil (`civil`, `JUEGO_SIN_HOJA` en `personajes.ts`). Es el
 * respaldo de la gente de la base y de los lugares cuando el banco no tiene ninguna
 * figura pintada de su facción (`figurasDeLaGente`, `figuraQueSePinta`); con el Y
 * Bot de una criatura, un vecino que habla en la plaza estaba en guardia con el arma
 * en la mano (ajuste tras la vuelta 2 de la base caminable).
 */
export const CUERPO_DE_VECINO = 'vecino-de-la-base';

/** El prefijo del cuerpo de una figura del banco de NPC: un espacio de cuerpos aparte. */
const PREFIJO_DE_GENTE = 'npc:';

/** El cuerpo con que se pinta la figura `id` del banco de NPC (`registrarGente`). */
export function cuerpoDeGente(id: string): string {
  return `${PREFIJO_DE_GENTE}${id}`;
}

/** Si un cuerpo es de la gente del banco (`cuerpoDeGente`). */
export function esCuerpoDeGente(body: string): boolean {
  return body.startsWith(PREFIJO_DE_GENTE);
}

/** El cuerpo de quien lleva la figura `figura` del banco, o el Y Bot civil si no lleva ninguna. */
export function cuerpoDeLaPersona(figura: string | null): string {
  return figura === null ? CUERPO_DE_VECINO : cuerpoDeGente(figura);
}
