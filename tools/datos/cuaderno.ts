/**
 * Lo que leen del cuaderno (`NuevaJugabilidad.md`) los extractores de
 * `tools/datos/`: una sección por su título. Una vez, para que el rasgo de una
 * facción (`facciones.ts`) y sus tipos de héroe (`tipos-de-heroe.ts`) salgan de
 * la misma sección aunque el cuaderno cambie de forma.
 */

/**
 * El texto de la sección «### <titulo>» (con dos puntos o sin ellos), hasta la
 * siguiente cabecera de nivel 3 o 2. Lanza si no está, nombrando el cuaderno
 * (`origen`). El título se escapa por si algún día lleva un carácter de
 * expresión regular.
 */
export function seccionDelCuaderno(texto: string, titulo: string, origen: string): string {
  const escapado = titulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const seccion = new RegExp(`^### ${escapado}:?[ \\t]*$([\\s\\S]*?)(?=^##)`, 'm').exec(texto);
  if (seccion === null) throw new Error(`${origen}: no encuentro la sección «### ${titulo}»`);
  return seccion[1] as string;
}
