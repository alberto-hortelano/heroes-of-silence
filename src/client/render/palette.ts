/** Colores del prototipo. Son marcadores: el arte generado llega en la fase 5. */

/** La muestra del oro en la barra cuando no hay su icono. */
export const COLOR_DEL_ORO = '#d9a441';

/**
 * La marca del comandante —el héroe en el tablero, el que si cae pierde la
 * batalla—: una corona, la MISMA en el lienzo y en «En el campo». El héroe es una
 * figura con el mismo aro que todos —el Y Bot de su juego de armas, teñido—, y
 * sin arte era un círculo «Ald» igual que «Cam» y «Arq» (H-4 de la QA de la fase
 * 1b). Un glifo y no un dibujo porque así es un solo hecho para el canvas y para
 * el HTML.
 */
export const MARCA_DE_COMANDANTE = '♛';
export const COLOR_DE_COMANDANTE = '#f5cd4f';

/**
 * El latón de lo que no es de ningún bando: la figura de la casilla de reclutar,
 * que dice qué se recluta y no de quién es, y la ficha de la arena. El filo de
 * las chapas del mapa ya no: es interfaz y lo da el tema (`--chapa-borde`).
 */
export const COLOR_NEUTRO = '#cbb780';

/**
 * El gris de lo que no tiene dueño: la bandera de un castillo neutral y, desde
 * que todo cuerpo es el Y Bot teñido, la figura de un monstruo o de un grupo de
 * asaltantes, en el mapa y en la batalla. Un rojo ladrillo propio para los
 * monstruos quedaba a unos 10° del rojo del jugador 0, y a escala de mapa el
 * héroe y lo que le guarda el paso eran el mismo muñeco rojo (I1 de la QA de las
 * 8 direcciones).
 */
export const COLOR_SIN_DUEÑO = '#7d7364';

/** Color de cada jugador, por índice. */
export const PLAYER_COLORS = ['#d94f4f', '#4f7fd9', '#4fd97f', '#d9c14f'] as const;

/**
 * El color de un jugador. `null` es «de nadie»: el gris de lo neutral.
 *
 * El `% PLAYER_COLORS.length` es para que una partida de más de cuatro
 * jugadores dé la vuelta, y eso está bien. Lo que NO estaba bien es lo que había
 * detrás: un `as string` que tapaba el `undefined` de un índice fuera de rango.
 * En JavaScript `-1 % 4` es **−1**, no 3, así que un id negativo salía de aquí
 * como `undefined` **sin decir nada** y reventaba tres capas más allá, en
 * `fondoDeColor`, con un «Cannot read properties of undefined». Es el mismo
 * patrón que el tercer `throw` de `frontera.ts`: un acceso fuera de rango que se
 * pierde en silencio porque el tipo dice que no puede pasar.
 *
 * Ahora lo dice. Un id negativo es un fallo nuestro —los jugadores se numeran
 * desde 0—, así que se lanza con el número dentro en vez de pintar de un color
 * que no existe.
 */
export function playerColor(id: number | null): string {
  if (id === null) return COLOR_SIN_DUEÑO;
  const color = PLAYER_COLORS[id % PLAYER_COLORS.length];
  if (color === undefined) {
    throw new Error(
      `no hay color para el jugador ${id}: los jugadores se numeran desde 0 y este índice cae fuera`,
    );
  }
  return color;
}
