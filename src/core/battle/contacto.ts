/**
 * Salir del contacto (#259, decisión del usuario, 14-10-2026; en toda batalla
 * desde el 19-10-2026). **Regla nuestra**: salir de una casilla cuesta `1 + N`,
 * donde N son los enemigos que podrían golpear cuerpo a cuerpo a quien está en
 * ella (`canReachMelee`, la regla del trabado). Se paga al dejar la casilla, no al
 * entrar; el volador paga una vez, al despegar. Si lo que le queda no paga salir
 * de su casilla, no se mueve: rodear a alguien lo atrapa.
 *
 * Aquí están lo que cuesta salir con N enemigos al lado y la frase de quien no
 * puede salir. Lo que cuenta los enemigos y recorre el tablero con costes vive en
 * `battle.ts` (`enContactoEn`, `movableFrom`) y en `board.ts`
 * (`alcanceConCostes`): necesita `canReachMelee`, y ningún módulo de `battle/`
 * importa `battle.ts`.
 */
import { quedanCasillas } from './board.js';

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
