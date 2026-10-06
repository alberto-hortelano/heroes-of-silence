/**
 * Quién mira, dicho como lo pregunta el núcleo.
 *
 * Cómo acabó la partida lo contesta `desenlaceDe` (`core/state/desenlace.ts`),
 * con cuatro respuestas, y la cuarta —`ajena`— es la de quien mira **sin llevar
 * bando**: no gana ni pierde ninguna partida, tampoco las que gana alguien. El
 * núcleo la pregunta con un conjunto vacío; el cliente lleva un solo `viewer`, y
 * el espectador es `NADIE`. Esto traduce lo uno a lo otro.
 *
 * `NADIE` vive aquí y no en el paquete del espectador porque es esta pregunta la
 * que lo necesita: es el único sitio que tiene que distinguir «no es tu bando»
 * de «no tienes bando». En el resto de la crónica no hace falta, porque allí la
 * pregunta ya es de dos —`clase(mio, false)` no pinta nada si no es tuyo— y un
 * centinela que nunca casa contesta bien por accidente.
 *
 * Vive en su propio módulo y no en `session.ts` por el espectador: `renderLog`
 * lo comparten las dos páginas, y hacer que `views/panels.ts` importe un valor
 * de `session.ts` arrastraría el motor de la partida entero al paquete de quien
 * solo mira — que es justo la frontera que el espectador existe para no cruzar.
 * (Nombrar aquí esas funciones tampoco se puede: el invariante de la puerta
 * única mira el texto del fichero y no distingue una mención de un `import`.)
 */
import type { PlayerId } from '@core/types.js';

/**
 * Quien mira sin llevar bando. **No es el id de nadie**: es el hueco donde iría
 * uno, y por eso `quienesDe` lo convierte a propósito en «nadie» en vez de dejar
 * que caiga por el `!==` de un ganador.
 */
export const NADIE = -1;

/** Los jugadores que lleva quien mira: ninguno si es `NADIE`. */
export function quienesDe(viewer: PlayerId): ReadonlySet<PlayerId> {
  return new Set(viewer === NADIE ? [] : [viewer]);
}
