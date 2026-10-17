/**
 * Salir del contacto (#259, decisión del usuario, 14-10-2026). **Regla nuestra,
 * solo de la arena**: con ella, salir de una casilla cuesta `1 + N`, donde N son
 * los enemigos que podrían golpear cuerpo a cuerpo a quien está en ella
 * (`canReachMelee`, la regla del trabado). Se paga al dejar la casilla, no al
 * entrar; el volador paga una vez, al despegar. Si lo que le queda no paga salir
 * de su casilla, no se mueve: rodear a alguien lo atrapa.
 *
 * Aquí están el modo de la pelea y su única lectura (`pagaElContacto`; cómo va en
 * la URL lo dice `modos.ts`), lo que cuesta salir con N enemigos al lado y la
 * frase de quien no puede salir. Lo que cuenta los enemigos y recorre el tablero
 * con costes vive en `battle.ts` (`enContactoEn`, `movableFrom`) y en `board.ts`
 * (`alcanceConCostes`): necesita `canReachMelee`, y ningún módulo de `battle/`
 * importa `battle.ts`.
 *
 * El juego, el agente y el banco andan con `libre`, el paso de siempre a 1: lo
 * pone `createBattle` (`MODOS_DEL_JUEGO`), y solo la arena lo enciende (lo vigila
 * `test/invariantes.test.ts`).
 */
import { quedanCasillas } from './board.js';
import type { ModosDeArena } from './modos.js';

/**
 * Los modos del contacto: `libre`, salir de una casilla cuesta 1 como siempre;
 * `paga`, cuesta 1 más por cada enemigo en contacto. No se llama «salida»
 * porque `salidaDe` ya es la zona de despliegue.
 */
export const MODOS_DEL_CONTACTO = ['libre', 'paga'] as const;
export type ModoDelContacto = (typeof MODOS_DEL_CONTACTO)[number];

/**
 * ¿Cuesta salir del contacto en esta pelea? La única lectura del modo: nadie
 * compara el literal fuera de aquí y de la arena (lo vigila
 * `test/invariantes.test.ts`). Con `libre`, el movimiento es el de siempre, con
 * el mismo código: así el banco no se mueve.
 */
export function pagaElContacto(state: { readonly arena: ModosDeArena }): boolean {
  return state.arena.contacto === 'paga';
}

/** Lo que cuesta salir de una casilla con `enContacto` enemigos al lado: el paso y uno por cada uno. */
export function salirCuesta(enContacto: number): number {
  return 1 + enContacto;
}

/**
 * La frase de quien no puede salir de su casilla: cuántos la cierran, lo que
 * cuesta salir y lo que le queda, diciendo si fue la Finta la que se comió lo que
 * falta (`trasLaFinta`). La escribe `contactoBlocker` (`battle.ts`) y la leen
 * `movimientoBlocker` y el panel de la arena.
 */
export function fraseDelContacto(enContacto: number, quedan: number, trasLaFinta: boolean): string {
  const quienes = enContacto === 1 ? '1 enemigo' : `${enContacto} enemigos`;
  const [verbo, casillas] = quedanCasillas(quedan);
  return `rodeado: con ${quienes} al lado, salir de su casilla le cuesta ${salirCuesta(enContacto)} y ${trasLaFinta ? 'tras la Finta ' : ''}le ${verbo} ${casillas}`;
}
