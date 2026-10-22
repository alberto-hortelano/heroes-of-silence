/**
 * Los selectores de la complejidad del combate (22-10-2026, decisiones del
 * usuario: «el número total de tropa podrá ser 3, 5 o 7 y las acciones de la
 * rueda de combate también», cada uno por su lado): el tope de tropa por bando y
 * la rueda, en «Nuevo juego» (con «Solo la rueda del héroe») y en el montaje de la
 * arena. Solo pinta y lee lo elegido: qué vale lo dice el núcleo
 * (`core/combate.ts`), y lo elegido lo aplica quien lo pinta (el menú, a la URL;
 * la arena, a su montaje).
 */

import { TIPOS_DE_LAS_RUEDAS } from '@core/battle/rueda.js';
import {
  combateCon,
  parseRueda,
  parseTope,
  type ReglasDelCombate,
  TOPES_DE_TROPA,
} from '@core/combate.js';
import { type Html, html, NADA, unir } from '../html.js';
import { casillaSoloRuedaDelHeroe } from './panels.js';

/** Qué se lee en cada tope y en cada rueda: lo que es, en pocas palabras. */
const DICHO_DEL_TOPE = (n: number): string => `${n} por bando`;
const DICHO_DE_LA_RUEDA = (n: number): string => `${n} tipos`;

/**
 * Un grupo de radios: `campo` es lo que lee `leerElCombate` (`data-combate`), y
 * `nombre`, el `name` del grupo, único en la página.
 */
function grupo(
  titulo: string,
  campo: keyof ReglasDelCombate,
  valores: readonly number[],
  elegido: number,
  dicho: (n: number) => string,
): Html {
  return html`<fieldset class="grupo-del-combate" data-grupo="${campo}">
      <legend>${titulo}</legend>
      ${unir(
        valores.map(
          (n) =>
            html`<label class="opcion-del-combate"><input type="radio" name="combate-${campo}" data-combate="${campo}" value="${String(n)}" ${n === elegido ? html`checked` : NADA} /> ${dicho(n)}</label>`,
        ),
      )}
    </fieldset>`;
}

/**
 * Los selectores: «Tropa» (3, 5, 7), «Rueda» (3, 5, 7) y, donde se ofrece
 * (`soloHeroe`: «Nuevo juego»; la arena no, allí cada bando es de la persona o de
 * la IA), la casilla «Solo la rueda del héroe».
 */
export function selectoresDelCombate(combate: ReglasDelCombate, soloHeroe?: boolean): Html {
  return html`<div class="selectores-del-combate">
      ${grupo('Tropa', 'tope', TOPES_DE_TROPA, combate.tope, DICHO_DEL_TOPE)}
      ${grupo('Rueda', 'rueda', TIPOS_DE_LAS_RUEDAS, combate.rueda, DICHO_DE_LA_RUEDA)}
      ${soloHeroe === undefined ? NADA : casillaSoloRuedaDelHeroe(html`data-combate="solo-heroe"`, soloHeroe)}
    </div>`;
}

/**
 * La complejidad tras un cambio en un radio de `selectoresDelCombate` (`el`, el
 * que cambió), sobre `antes`; `null` si `el` no es uno de ellos. Lo que no vale
 * lanza con la frase del núcleo (`parseTope`, `parseRueda`): el marcado no lo ofrece.
 */
export function leerElCombate(el: Element, antes: ReglasDelCombate): ReglasDelCombate | null {
  // El valor de un radio es su atributo: no cambia al marcarlo.
  const valor = el.getAttribute('value');
  switch (el.getAttribute('data-combate')) {
    case 'tope':
      return combateCon(parseTope(valor), antes.rueda);
    case 'rueda':
      return combateCon(antes.tope, parseRueda(valor));
    default:
      return null;
  }
}

/** Si quedó marcada la casilla «Solo la rueda del héroe» de los selectores; `null` si `el` no es ella. */
export function leerSoloHeroe(el: Element): boolean | null {
  return el.getAttribute('data-combate') === 'solo-heroe' ? el.matches(':checked') : null;
}
