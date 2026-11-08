/**
 * Lo que comparten los gestos de la partida —el clic, la tecla y el puntero— (R7 de la
 * reorganización, 07-11-2026: estaba en `main.ts`): las dos puertas por las que pasa un gesto
 * antes de hacer nada (la jugada de batalla que se está contando, `jugadaEnCurso`; la marcha
 * que se anda, `hastaQueLlegue`) y lo que piden igual un botón y su tecla: pasar el turno
 * (Espacio), la tropa (T), salir de una escena de dentro (Escape) y el siguiente héroe (H).
 */
import { esDeDentro, type PaginaDeLaPartida } from './pagina.js';

/**
 * La única puerta de los gestos de batalla mientras la jugada se está contando.
 *
 * El tablero que se ve todavía no es el del estado, así que no se acepta nada:
 * ni un clic en el lienzo ni un botón ni Escape. Estaba repartida —una
 * comprobación en el clic del lienzo y otra en dos de los botones—, y por los
 * huecos se colaban «Resolver sola», el libro de hechizos, «Continuar» y Escape.
 *
 * Los botones del panel ya salen apagados mientras se cuenta (#165); por aquí
 * pasan aún el lienzo, el teclado y el clic que cae entre el gesto y el
 * fotograma que repinta el panel.
 */
export function jugadaEnCurso(
  pagina: Pick<PaginaDeLaPartida, 'session' | 'batalla' | 'pedirFotograma'>,
): boolean {
  const { session, batalla, pedirFotograma } = pagina;
  if (session.scene !== 'battle') return false;
  if (!batalla.rechazarSiOcupada(performance.now())) return false;
  pedirFotograma();
  return true;
}

/**
 * La puerta de los gestos del mapa mientras el héroe anda su marcha
 * (`Session.marchaEnCurso`): el gesto —un clic en el lienzo, un botón, una
 * tecla— solo lo hace llegar (`acabarLaMarcha`, que abre lo que esperaba a la
 * llegada) y no hace nada más. Sin marcha, `false` y el gesto sigue. Así nada se
 * juega con el héroe pintado a medio camino, ni con la batalla de una emboscada
 * esperando a que llegue.
 */
export function hastaQueLlegue(
  pagina: Pick<PaginaDeLaPartida, 'session' | 'aventura' | 'pedirFotograma'>,
): boolean {
  const { session, aventura, pedirFotograma } = pagina;
  if (session.marchaEnCurso === null) return false;
  session.acabarLaMarcha();
  aventura.olvidarRuta();
  pedirFotograma();
  return true;
}

/**
 * «Fin de turno», por el botón o por el Espacio. La puerta lo ignora fuera del
 * turno de la persona, con algo moviéndose y durante el cambio de día; `endTurn`
 * no rechaza —se traga su fallo y lo escribe en `status`—, y lo que juega el
 * rival llega cuando termina, sin gesto que pida fotograma.
 */
export function pasarTurno(
  pagina: Pick<PaginaDeLaPartida, 'session' | 'aventura' | 'finDeTurno' | 'pedirFotograma'>,
  confirmado = false,
): void {
  const { session, aventura, finDeTurno, pedirFotograma } = pagina;
  const animando = session.scene === 'adventure' && aventura.arrastrando;
  if (!finDeTurno.abierta(session, animando)) return;
  void finDeTurno
    .pasar(session, animando, confirmado, () => aventura.olvidarRuta())
    .then(pedirFotograma);
}

/**
 * «Tropa», por el botón o por la T: la escena de la tropa del héroe elegido. Si no
 * se puede (sin héroe, fuera de tu turno), el motivo va a la barra.
 */
export function abrirLaTropa(pagina: Pick<PaginaDeLaPartida, 'session' | 'aventura'>): void {
  const { session, aventura } = pagina;
  if (session.scene !== 'adventure') return;
  const motivo = session.tropaBlocker();
  if (motivo !== null) {
    session.status = motivo;
    return;
  }
  aventura.salir();
  session.abrirLaTropa();
}

/**
 * Sale de la escena de dentro en que se esté a la de donde se entró: de la tropa
 * al mapa, con el héroe elegido y la cámara del mapa como estaban; de la morada a
 * la base, con quien anduvo quieto en su puerta, porque la base no se ha cerrado
 * (`EscenaBase` no se reinicia sin otra apertura).
 */
export function cerrarDentro(
  pagina: Pick<PaginaDeLaPartida, 'session' | 'dentro' | 'canvas'>,
): void {
  const { session, dentro, canvas } = pagina;
  const escena = session.scene;
  if (!esDeDentro(dentro, escena)) return;
  dentro[escena].de.salir();
  canvas.style.cursor = 'default';
  dentro[escena].cerrar(session);
}

/** «Siguiente héroe», por el botón o por la H: lo elige la sesión y aquí se le mira. */
export function siguienteHeroe(pagina: Pick<PaginaDeLaPartida, 'session' | 'aventura'>): void {
  const { session, aventura } = pagina;
  if (session.scene !== 'adventure' || !session.siguienteHeroe()) return;
  aventura.olvidarRuta();
  aventura.centrar();
}
