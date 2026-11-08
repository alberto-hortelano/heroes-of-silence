/**
 * Lo que se lee de un campo de formulario sin nombrar su tipo del DOM: la arena lo pregunta en
 * sus cambios (`arena/cambios.ts`) y en el editor de magia (`arena/magia.ts`), que lo escribían
 * cada uno hasta el QA de la reorganización (H3, 08-11-2026).
 */

/** Si una casilla está marcada: `false` también para lo que no es una casilla. */
export function estaMarcado(el: Element): boolean {
  return (el as Element & { checked?: unknown }).checked === true;
}
