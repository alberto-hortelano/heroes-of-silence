/**
 * El estilo de todo el arte del mapa: el mapa de referencia que eligió el usuario
 * (`REFERENCIA_DE_MAPAS`) y lo que lo hace distinto, dicho con palabras
 * (`ESTILO_DEL_MAPA`). Lo lleva cada encargo del mapa: los mapas densos
 * (`mapa-denso.ts`), los puentes, las laderas, las diagonales, las bajadas, las
 * rampas, el muro, el recinto, las piezas sueltas y los módulos del escenógrafo.
 *
 * Vivía en `mapa-denso.ts`, que importa del escenógrafo del cliente; aquí, quien
 * solo quiere el estilo no carga nada más (H3 de la reorganización, 08-11-2026).
 */

/** El mapa de referencia que eligió el usuario: así tiene que verse el conjunto. */
export const REFERENCIA_DE_MAPAS = 'assets/art/mapas/Imagen de ChatGPT 3 oct 2026, 10_05_01.png';

/**
 * Lo que hace distinta a la referencia, dicho con palabras. La primera tanda
 * (03-10-2026) la llevaba como segunda referencia, detrás de la muestra pintada
 * del 01-10, y mandó la muestra: salió limpia, clara y saturada, y el usuario
 * dijo que no encajaba. Ahora la referencia va sola y su estilo se describe.
 */
export const ESTILO_DEL_MAPA =
  'Estilo de la imagen de estilo, que manda sobre cualquier otra idea: fantasía medieval OSCURA y sombría, pintura digital muy detallada como una maqueta en miniatura, con muchísimo detalle menudo (piedras, matas, grietas, raíces). Paleta APAGADA y poco saturada: verdes oliva y musgo oscuros, grises pizarra, pardos terrosos, rojos óxido; nada de colores vivos ni de aspecto de juego para móvil. Sombras profundas y oclusión marcada entre los detalles, luz tenue y algo fría, con contraste dramático.';
