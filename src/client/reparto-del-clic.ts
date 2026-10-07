/**
 * Qué hace un botón (`data-action`) mientras la jugada de batalla puede estar
 * contándose. Vive fuera de `main.ts` para poder probar el ORDEN, que es la
 * regla: lo que se atiende antes de preguntar si la jugada sigue en curso no
 * pasa por esa puerta, y preguntar ya pone el aviso de espera en la barra.
 *
 * - `mirar`: mirar al enemigo no toca la batalla, se puede mientras se cuenta.
 * - `al-acabar`: «Continuar» sale con la última muerte aún contándose; no se
 *   rechaza, espera a que acabe y vuelve al mapa sin pedir un segundo clic.
 * - `nada`: no es un botón, o la jugada sigue y el gesto se rechaza.
 * - `gesto`: todo lo demás, con la jugada ya contada.
 */
import type { Scene } from './session.js';

export type RepartoDelClic = 'mirar' | 'al-acabar' | 'nada' | 'gesto';

export function repartirClic(
  action: string | null,
  escena: Scene,
  jugadaEnCurso: () => boolean,
): RepartoDelClic {
  if (action === 'ver-enemigo') return 'mirar';
  if (action === 'finish-battle' && escena === 'battle') return 'al-acabar';
  if (action === null || jugadaEnCurso()) return 'nada';
  return 'gesto';
}
