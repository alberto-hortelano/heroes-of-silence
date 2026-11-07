/**
 * Qué hace un botón (`data-action`) de la partida mientras la jugada de batalla
 * puede estar contándose, y con el segundo clic de un doble clic. Vive fuera de
 * `main.ts` para poder probar el ORDEN, que es la regla: lo que se atiende antes
 * de preguntar si la jugada sigue en curso no pasa por esa puerta, y preguntar ya
 * pone el aviso de espera en la barra.
 *
 * - `mirar`: mirar al enemigo no toca la batalla, se puede mientras se cuenta.
 * - `al-acabar`: «Continuar» sale con la última muerte aún contándose; no se
 *   rechaza, espera a que acabe y vuelve al mapa sin pedir un segundo clic.
 * - `nada`: no es un botón, o la jugada sigue y el gesto se rechaza, o es el
 *   segundo clic de un doble clic en un botón de un solo clic (`DE_UN_SOLO_CLIC`).
 *   Los botones del panel salen apagados mientras se cuenta (#165,
 *   `mientrasSeCuenta`), así que lo de la jugada solo lo ve el clic que cae antes
 *   del fotograma que los apaga.
 * - `gesto`: todo lo demás, con la jugada ya contada.
 */
import type { Scene } from '../sesion/partida.js';

export type RepartoDelClic = 'mirar' | 'al-acabar' | 'nada' | 'gesto';

/**
 * Los botones de la partida que no juegan el segundo clic de un doble clic: el
 * repintado llega entre los dos clics de una persona, y el segundo caía en lo que
 * había pintado el primero y jugaba otra vez, ya sobre otra cosa. La partida lo
 * decide aquí, en una lista (hasta el 07-11-2026, un `if (ev.detail > 1)` en cada
 * caso de `main.ts`); los botones de la batalla que comparte con la arena
 * («Terminar turno», el poder, el arma, la muralla y «Listo») los mira
 * `GestosDeBatalla` (`DE_UN_SOLO_CLIC` de `batalla/gestos.ts`). Lo que no está aquí
 * cuenta cada clic; en el reparto de la guarnición, a propósito: un doble clic mueve
 * dos (H-V2-1 del QA).
 */
const DE_UN_SOLO_CLIC: ReadonlySet<string> = new Set([
  // Andar a un punto de un lugar y volver al principio de su conversación.
  'lugar-ir',
  'lugar-al-principio',
  // El segundo cae ya en el nodo siguiente de la conversación.
  'lugar-opcion',
  // Cae ya en el panel repintado, a menudo sobre OTRO «Poner» (la mochila tiene una
  // fila menos y el panel baja).
  'tropa-poner',
  'tropa-quitar',
  // Cae ya en la morada que abrió el primero (QA I3 de la vuelta 2).
  'ir-a-sitio',
  // Caería en la base.
  'hire-hero',
  // Un doble clic de persona (150 ms) caía ya en el botón repintado como «Amurallar»,
  // con su `data-obra`, y compraba la muralla (QA de la fase 3, H-F3-1, comprobado
  // en el navegador).
  'mejorar-el-puesto',
]);

/**
 * El reparto de un clic en `action` (cabecera del fichero), en la escena `escena`;
 * `clics`, los seguidos (`MouseEvent.detail`). Lo del segundo clic se mira tras la
 * jugada en curso, como en los botones de la batalla de la partida.
 */
export function repartirClic(
  action: string | null,
  escena: Scene,
  jugadaEnCurso: () => boolean,
  clics = 1,
): RepartoDelClic {
  if (action === 'ver-enemigo') return 'mirar';
  if (action === 'finish-battle' && escena === 'battle') return 'al-acabar';
  if (action === null || jugadaEnCurso()) return 'nada';
  if (clics > 1 && DE_UN_SOLO_CLIC.has(action)) return 'nada';
  return 'gesto';
}
