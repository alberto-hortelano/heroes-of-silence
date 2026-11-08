/**
 * El motivo de un fallo, para la persona: el mensaje del `Error` entero, tal cual
 * lo escribió quien lanzó (los del núcleo van escritos para leerse), o lo lanzado
 * dicho como texto si no es un `Error`.
 *
 * Lo leen la barra, la consola, la página que no arranca y lo que responde el
 * servidor de las marcas. Hasta la fase C de la reorganización (07-11-2026) cada
 * sitio lo escribía a mano, y había tres funciones con su nombre (`mensaje` en la
 * sesión y en la arena, `motivoDe` en las marcas).
 *
 * Vive en `shared` desde la fase Z (08-11-2026): era `client/comun/errores.ts`, y
 * las herramientas (las marcas y los plugins de vite) lo importaban del cliente,
 * mientras el servidor y el resto de `tools/` lo escribían a mano. El núcleo no lo
 * importa: `shared` lee el núcleo y no al revés, y sus motivos lo siguen
 * escribiendo a mano.
 */
export function mensajeDe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
