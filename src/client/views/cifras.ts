/**
 * Las cifras de pelear de una unidad en filas de rótulo y valor: las comparten la ficha
 * de la tropa (`partida/tropa/panel.ts`) y la de la morada (`partida/morada/panel.ts`),
 * para que una unidad se lea igual al reclutarla que al repartirle equipo. Y lo que sale
 * apagado, con un nombre que dice qué es (R2 de la reorganización, 07-11-2026; eran
 * `motivoApagado`, `apagadoPor`, `motivoDebajo`, `notaDebajo` y `apagadosPor`): los
 * atributos del botón (`atributosDeApagado`), lo que dice debajo —el rechazo en su color
 * (`motivoDelRechazo`) y lo que solo informa en el apagado (`notaDelApagado`), la regla
 * H5 de la guarnición, también en la tropa, la morada y el ayuntamiento— y los botones de
 * la batalla mientras se cuenta una jugada o espera la rueda (`fieldsetApagado`,
 * `motivoParaApagar`, `AVISO_DE_ESPERA`), de la partida y la arena, que eran de
 * `views/panels.ts` hasta la fase C de la reorganización.
 */
import { conMiles } from '@core/texto.js';
import { SPEED_TO_HEXES, type UnitInfo } from '@core/types.js';
import { type Html, html, NADA } from '../comun/html.js';

/**
 * Una fila de la ficha: el rótulo a la izquierda y el valor a la derecha, cada uno
 * texto o marcado (con su nota). Es la única forma de escribir una fila de rótulo
 * y valor del cliente: la ficha de la tropa, la morada, el ayuntamiento, el panel
 * del héroe, de la base y de la batalla, la defensa, la arena y el espectador.
 */
export function filaDeCifra(rotulo: string | Html, valor: string | Html): Html {
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
 * Los atributos de un botón que sale apagado **sin dejar de leerse**: con
 * `aria-disabled` y no `disabled`, que se puede enfocar y el lector de pantalla lo
 * dice, con la clase `apagada` sobre la suya si la lleva (`clase`). Lo comparten
 * las opciones de un lugar y las dos pantallas de la guarnición, que ponen debajo
 * su motivo (`motivoDelRechazo`); quien atiende el clic mira `aria-disabled` y no
 * hace nada.
 */
export function atributosDeApagado(motivo: string | null, clase?: string): Html {
  if (motivo === null) return clase === undefined ? NADA : html` class="${clase}"`;
  return html` aria-disabled="true" class="${clase === undefined ? 'apagada' : `${clase} apagada`}"`;
}

/**
 * Por qué no se puede, escrito debajo de lo apagado y no en un `title` (en el móvil no
 * hay ratón que lo enseñe), en el color del rechazo: la frase del núcleo (un
 * `*Blocker`) en las opciones de un lugar, la guarnición, la base, la tropa, la morada y
 * el ayuntamiento. Lo que solo informa va con `notaDelApagado`.
 */
export function motivoDelRechazo(motivo: string | null): Html {
  return motivo === null ? NADA : html`<span class="veterania motivo">${motivo}</span>`;
}

/**
 * Lo que dice por qué algo sale apagado **sin ser un rechazo** (ya pelean todos los
 * de su tipo), debajo y en el tono apagado: no se pinta como «no cabe» (H5 del QA
 * de la fase 1).
 */
export function notaDelApagado(nota: string | null): Html {
  return nota === null ? NADA : html`<span class="veterania motivo nota">${nota}</span>`;
}

/** Lo que dice la barra a quien pulsa mientras la jugada se cuenta. */
export const AVISO_DE_ESPERA = 'Espera a que termine la jugada.';

/**
 * Los botones de la batalla apagados con `motivo` en el `title`, o tal cual con
 * `null`. Mientras el tablero aún cuenta la última jugada (#165), con el aviso de
 * espera: no se ofrecen para luego rechazarlos. Antes salían encendidos —el estado
 * ya va por delante de lo que se ve— y el clic daba el aviso y pedía pulsar otra vez.
 * El lateral de la batalla lo usa entero desde #257: apaga lo último pintado quieto
 * (`panelDeBatalla`), no los botones de ahora.
 * Y mientras la rueda espera una elección (`motivoDeLaRueda` de la sesión): con el
 * diálogo modal encima, «Terminar turno» y «Resolver sola» se veían encendidos y
 * el clic no llegaba (H3 de QA, 19-10-2026).
 *
 * No se aplazan: un botón pulsado durante la jugada se haría sobre una unidad
 * que todavía no se ve actuar, y un doble clic jugaba el segundo en la
 * SIGUIENTE (M12 de QA de la arena). Un `fieldset` apagado apaga todo lo que
 * lleva dentro, el botón que se añada mañana también: una regla, un sitio.
 */
export function fieldsetApagado(motivo: string | null, botones: Html): Html {
  return motivo === null
    ? botones
    : html`<fieldset class="contando" disabled title="${motivo}">${botones}</fieldset>`;
}

/**
 * Lo que apaga los botones de la batalla: la jugada que se cuenta o la rueda que espera
 * (el `motivoDeLaRueda` de la sesión, la de la partida o la de la arena).
 */
export function motivoParaApagar(
  sesion: { readonly motivoDeLaRueda: string | null },
  contandoAun: boolean,
): string | null {
  return contandoAun ? AVISO_DE_ESPERA : sesion.motivoDeLaRueda;
}
