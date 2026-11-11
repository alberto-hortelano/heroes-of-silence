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
 * de «no tienes bando». En el resto de la crónica tampoco hace falta preguntarlo
 * rama a rama: `renderLog` apaga el color de todas sus líneas para quien no lleva
 * bando (`quienesDe(viewer).size === 0`). Hasta el 11-11-2026 se contaba con que la
 * pregunta de dos —`clase(mio, false)`— contestara bien «por accidente» con un
 * centinela que nunca casa, y no lo hacía en las dos ramas donde lo tuyo es lo
 * malo (`clase(!mio, mio)`: la caída de un héroe y su vuelta a la base salían en el
 * verde de victoria en el espectador, #202).
 *
 * Vive en su propio módulo y no en `sesion/partida.ts` por el espectador: `renderLog`
 * lo comparten las dos páginas, y hacer que la crónica (`views/cronica.ts`) importe un
 * valor de `sesion/partida.ts` arrastraría el motor de la partida entero al paquete de quien
 * solo mira — que es justo la frontera que el espectador existe para no cruzar.
 */
import type { PlayerId } from '@core/types.js';

/**
 * Quien mira sin llevar bando. **No es el id de nadie**: es el hueco donde iría
 * uno, y por eso `quienesDe` lo convierte a propósito en «nadie» en vez de dejar
 * que caiga por el `!==` de un ganador.
 *
 * Es el `viewer` del espectador, que no tiene un «tú»: `renderLog` escribe «Tú»
 * para los hechos de `viewer`, y con un id que no es de nadie la crónica entera se
 * lee en tercera persona —«El jugador 0 construye…»—, que es lo correcto para
 * quien ve la partida desde fuera. Lo mismo hace el parte de guerra con `mio:
 * null`: sin bando propio no pinta victorias ni derrotas. (El espectador lo
 * reexportaba hasta la fase C de la reorganización, 07-11-2026: ahora lo importa
 * de aquí, que es el único sitio donde «no tienes bando» y «no es tu bando» dan
 * respuestas distintas.)
 */
export const NADIE = -1;

/** Los jugadores que lleva quien mira: ninguno si es `NADIE`. */
export function quienesDe(viewer: PlayerId): ReadonlySet<PlayerId> {
  return new Set(viewer === NADIE ? [] : [viewer]);
}
