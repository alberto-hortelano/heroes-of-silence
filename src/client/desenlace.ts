/**
 * Cómo acabó la partida **para quien mira**, en un solo sitio.
 *
 * `finished.winner` admite tres respuestas —la ganaste, la perdiste, no la ganó
 * nadie— y la trampa es que la tercera **no la caza `tsc`**: `winner === viewer`
 * con un `null` delante es `false`, así que un ternario de dos compila y contesta
 * «has perdido» a un empate por días.
 *
 * Y son **cuatro** y no tres, que es la mitad que se escapó la primera vez: quien
 * mira sin llevar bando no gana ni pierde **ninguna** partida, tampoco las que
 * gana alguien. Con `NADIE` como `viewer`, `winner === viewer` vuelve a ser
 * `false` por el mismo motivo de siempre, y el espectador veía «Fin de la
 * partida» en el rojo de derrota **en la misma pantalla que decía "has ganado"**.
 * La respuesta a eso no es «perdida»: es `ajena`.
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
 * uno, y por eso `desenlaceDe` lo compara a propósito en vez de dejar que caiga
 * por el `!==` de abajo.
 */
export const NADIE = -1;

export type Desenlace = 'ganada' | 'perdida' | 'sin resolver' | 'ajena';

/**
 * `winner` es el `finished.winner` del núcleo, o el `actor` de un `game_over`,
 * que es el mismo dato: `finishGame` sella el evento con el ganador.
 *
 * El orden de las dos preguntas importa y no es intercambiable: una partida sin
 * resolver lo está **para todos**, también para quien no lleva bando, así que
 * `sin resolver` gana a `ajena`. Al revés, el espectador dejaría de enterarse de
 * que nadie ganó.
 */
export function desenlaceDe(winner: PlayerId | null, viewer: PlayerId): Desenlace {
  if (winner === null) return 'sin resolver';
  if (viewer === NADIE) return 'ajena';
  return winner === viewer ? 'ganada' : 'perdida';
}
