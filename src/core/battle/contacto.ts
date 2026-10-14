/**
 * Salir del contacto (#259, decisión del usuario, 14-10-2026). **Regla nuestra,
 * solo de la arena**: con ella, salir de una casilla cuesta `1 + N`, donde N son
 * los enemigos que podrían golpear cuerpo a cuerpo a quien está en ella
 * (`canReachMelee`, la regla del trabado). Se paga al dejar la casilla, no al
 * entrar; el volador paga una vez, al despegar. Si lo que le queda no paga salir
 * de su casilla, no se mueve: rodear a alguien lo atrapa.
 *
 * Aquí está el modo de la pelea (cómo se lee y se escribe en la URL, y su única
 * lectura, `pagaElContacto`), el coste de un paso y la frase de quien no puede
 * salir. Lo que cuenta los enemigos y recorre el tablero con costes vive en
 * `battle.ts` (`enemigosEnContacto`, `costeDeSalir`, `movableFrom`) y en
 * `board.ts` (`alcanceConCostes`): necesita `canReachMelee`, y ningún módulo de
 * `battle/` importa `battle.ts`.
 *
 * El juego, el agente y el banco andan con `libre`, el paso de siempre a 1: lo
 * pone `createBattle`, y solo la arena llega a `crearBatallaConReglas(…, contacto)`
 * (lo vigila `test/invariantes.test.ts`).
 */

/**
 * Los modos del contacto: `libre`, salir de una casilla cuesta 1 como siempre;
 * `paga`, cuesta 1 más por cada enemigo en contacto. No se llama «salida»
 * porque `salidaDe` ya es la zona de despliegue.
 */
export const MODOS_DEL_CONTACTO = ['libre', 'paga'] as const;
export type ModoDelContacto = (typeof MODOS_DEL_CONTACTO)[number];

/**
 * El modo del contacto que pide la URL (`?contacto=paga`). Ausente o vacío,
 * `libre`; lo que no es un modo se rechaza diciendo cuáles valen, como
 * `modoDelGolpeDeLaURL`: un enlace copiado con una errata reproduciría otra pelea
 * sin decirlo.
 */
export function modoDelContactoDeLaURL(texto: string | null): ModoDelContacto {
  if (texto === null || texto.trim() === '') return 'libre';
  const modo = MODOS_DEL_CONTACTO.find((m) => m === texto.trim());
  if (modo === undefined) {
    throw new Error(
      `«${texto}» no es un modo del contacto; valen ${MODOS_DEL_CONTACTO.join(', ')}`,
    );
  }
  return modo;
}

/** La inversa de `modoDelContactoDeLaURL`: lo que va en `?contacto=`, o `''` con `libre`, que no se escribe. */
export function modoDelContactoALaURL(modo: ModoDelContacto): string {
  return modo === 'libre' ? '' : modo;
}

/**
 * ¿Cuesta salir del contacto en esta pelea? La única lectura del modo: nadie
 * compara el literal fuera de aquí y de la arena (lo vigila
 * `test/invariantes.test.ts`). Con `libre`, el movimiento es el de siempre, con
 * el mismo código: así el banco no se mueve.
 */
export function pagaElContacto(state: { readonly modoDelContacto: ModoDelContacto }): boolean {
  return state.modoDelContacto === 'paga';
}

/** Lo que cuesta salir de una casilla con `enContacto` enemigos al lado: el paso y uno por cada uno. */
export function costeDeSalirCon(enContacto: number): number {
  return 1 + enContacto;
}

/**
 * La frase de quien no puede salir de su casilla: cuántos la cierran, lo que
 * cuesta salir y lo que le queda. La escribe `contactoBlocker` (`battle.ts`) y
 * la leen `movimientoBlocker` y el panel de la arena.
 */
export function fraseDelContacto(enContacto: number, quedan: number): string {
  const quienes = enContacto === 1 ? '1 enemigo' : `${enContacto} enemigos`;
  return `rodeado: con ${quienes} al lado, salir de su casilla le cuesta ${costeDeSalirCon(enContacto)} y le ${quedan === 1 ? 'queda 1' : `quedan ${quedan}`}`;
}
