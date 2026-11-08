/**
 * Los dos bandos en el tablero de batalla: su color (`COLOR_BANDO`, que tiñe el Y Bot y
 * pinta el aro, las rectas de los disparos y la rueda del golpe) y el gris de lo que no
 * tiene dueño (`bandosSinDueño`, `colorDelBando`). Era parte de `render/batalla.ts`
 * hasta la fase C de la reorganización (07-11-2026).
 */
import type { Side } from '@core/battle/types.js';
import type { PlayerId } from '@core/types.js';
import { COLOR_SIN_DUEÑO } from '../palette.js';
import type { VistaBatalla } from './tablero.js';

/** Los colores de los dos bandos: tiñen el Y Bot y pintan el aro. */
export const COLOR_BANDO: Readonly<Record<Side, string>> = {
  attacker: '#d9774f',
  defender: '#5a8ad9',
};

/**
 * Los bandos sin dueño —un monstruo que defiende, un grupo de asaltantes que
 * embosca—, sacados de los dueños de la batalla (`battleOwners`). Lo hace aquí
 * una vez para la partida y el espectador, que tienen los dueños cada uno por su
 * lado.
 */
export function bandosSinDueño(dueños: Readonly<Record<Side, PlayerId | null>>): ReadonlySet<Side> {
  return new Set((['attacker', 'defender'] as const).filter((s) => dueños[s] === null));
}

/**
 * El color de un bando en el tablero: el gris de lo que no tiene dueño si es
 * neutral, como en el mapa —un monstruo es el mismo muñeco gris en los dos
 * sitios—, y si no el del bando.
 */
export function colorDelBando(v: Pick<VistaBatalla, 'sinDueño'>, side: Side): string {
  return v.sinDueño.has(side) ? COLOR_SIN_DUEÑO : COLOR_BANDO[side];
}
