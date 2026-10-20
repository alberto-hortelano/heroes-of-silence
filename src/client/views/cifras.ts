/**
 * Las cifras de pelear de una unidad en filas de rótulo y valor, y el motivo de un
 * botón apagado: los comparten la ficha de la tropa (`views/tropa.ts`) y la de la
 * morada (`views/morada.ts`), para que una unidad se lea igual al reclutarla que
 * al repartirle equipo.
 */
import { conMiles, SPEED_TO_HEXES, type UnitInfo } from '@core/types.js';
import { type Html, html, NADA } from '../html.js';

/** Una fila de la ficha: el rótulo a la izquierda y el valor a la derecha. */
export function filaDeCifra(rotulo: string, valor: string): Html {
  return html`<div class="row"><span class="label">${rotulo}</span><span>${valor}</span></div>`;
}

/** Vida, ataque, defensa, daño, armadura y velocidad, con lo que lleva puesto. */
export function filasDeCombate(u: UnitInfo, armadura: number): Html {
  return html`${filaDeCifra('Vida', `${conMiles(u.hp)} PV`)}
    ${filaDeCifra('Ataque', String(u.attack))}
    ${filaDeCifra('Defensa', String(u.defense))}
    ${filaDeCifra('Daño', `${conMiles(u.damage[0])}–${conMiles(u.damage[1])}`)}
    ${filaDeCifra('Armadura', String(armadura))}
    ${filaDeCifra('Velocidad', `${SPEED_TO_HEXES[u.speed]} casillas`)}`;
}

/**
 * El motivo de un botón apagado, escrito debajo de él y no en un `title`: en el
 * móvil no hay ratón que lo enseñe. Lo leen la tropa y la morada.
 */
export function motivoApagado(m: string | null): Html {
  return m === null ? NADA : html`<span class="motivo-apagado">${m}</span>`;
}
