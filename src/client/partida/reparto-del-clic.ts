/**
 * Qué hace un botón (`data-action`) de la partida con el segundo clic de un doble
 * clic, y mientras la jugada de batalla puede estar contándose. Vive fuera de
 * `main.ts` para poder probar el ORDEN, que es la regla: lo que se atiende antes
 * de preguntar si la jugada sigue en curso no pasa por esa puerta, y preguntar ya
 * pone el aviso de espera en la barra.
 *
 * - `nada`: no es un botón; o es el segundo clic de un doble clic en un botón que
 *   no cuenta cada clic (`CUENTAN_CADA_CLIC`), lo primero que se mira: no hace nada,
 *   ni el aviso de espera; o la jugada sigue y el gesto se rechaza. Los botones del
 *   panel salen apagados mientras se cuenta (#165, `mientrasSeCuenta`), así que lo de
 *   la jugada solo lo ve el clic que cae antes del fotograma que los apaga.
 * - `mirar`: mirar al enemigo no toca la batalla, se puede mientras se cuenta.
 * - `gesto`: todo lo demás, con la jugada ya contada. También «Continuar»: desde #341
 *   (11-11-2026) solo sale con el tablero quieto (`finalALaVista`), así que su clic
 *   nunca encuentra la jugada en curso. Hasta entonces salía con la última muerte aún
 *   contándose, y tenía su propio reparto (`al-acabar`) que esperaba a la cola en vez
 *   de rechazarlo con el aviso de espera, que pedía un segundo clic (#158 d).
 */
type RepartoDelClic = 'mirar' | 'nada' | 'gesto';

/**
 * Los únicos botones de la partida que cuentan el segundo clic de un doble clic: los
 * que suman de uno en uno y se confirman al final, «Dejar ›» y «‹ Recoger» de la
 * guarnición (`mover-en-el-reparto`) y «−» y «+» de la defensa (`defensa-menos`,
 * `defensa-mas`): solo editan lo que se ve hasta «Confirmar» o «Defender», así que un
 * doble clic mueve dos (H-V2-1 del QA de la guarnición).
 *
 * En todos los demás el segundo clic no cuenta, caiga donde caiga (decisión del
 * usuario, 07-11-2026: «En la partida, el segundo clic de un doble clic no cuenta en
 * ningún botón, caiga donde caiga»): el repintado llega entre los dos clics de una
 * persona, y el segundo caía en lo que había pintado el primero y jugaba, ya sobre
 * otra cosa. Un doble clic en «Resolver sola» pasaba el día, porque el segundo caía en
 * «Fin de turno» del mapa (C4b de la reorganización); en «+1» de la morada reclutaba
 * dos y en la armería compraba dos («Un doble clic recluta o compra uno; para dos,
 * dos clics separados»). Hasta ese día era al revés: una lista de los que no lo
 * contaban (`DE_UN_SOLO_CLIC`), que se quedaba corta. Los botones de la batalla que
 * comparte con la arena los mira además `GestosDeBatalla` con la regla de la arena
 * (`DE_UN_SOLO_CLIC` de `batalla/gestos.ts`), pero en la partida el segundo clic ya
 * no les llega.
 */
const CUENTAN_CADA_CLIC: ReadonlySet<string> = new Set([
  'mover-en-el-reparto',
  'defensa-menos',
  'defensa-mas',
  'sobra-menos',
  'sobra-mas',
]);

/**
 * El reparto de un clic en `action` (cabecera del fichero); `clics`, los seguidos
 * (`MouseEvent.detail`). El segundo clic de un doble clic se mira antes que nada:
 * también antes de «Ver al enemigo» y de la jugada en curso, que ya pondría el aviso
 * de espera.
 */
export function repartirClic(
  action: string | null,
  jugadaEnCurso: () => boolean,
  clics = 1,
): RepartoDelClic {
  if (action === null) return 'nada';
  if (clics > 1 && !CUENTAN_CADA_CLIC.has(action)) return 'nada';
  if (action === 'ver-enemigo') return 'mirar';
  if (jugadaEnCurso()) return 'nada';
  return 'gesto';
}
