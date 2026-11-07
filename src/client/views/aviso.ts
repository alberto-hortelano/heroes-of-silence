/**
 * El aviso de un ataque a la persona (`<dialog id="aviso">`, arreglo 3 del
 * 06-11-2026: «centrar el lugar del ataque en el mapa y mostrar un popup que diga
 * quién te ataca y muestre dónde, con un botón de defender»): sale sobre el mapa,
 * con la cámara en el sitio del ataque, antes de la batalla de una defensa (#116)
 * y de una emboscada. Lo que dice lo escribe la sesión (`Session.avisoDelAtaque`,
 * de `elAtaque`); aquí solo se pinta.
 */
import { type Html, html } from '../comun/html.js';
import type { VistaDelAviso } from '../session.js';

export function renderAviso(v: VistaDelAviso): Html {
  return html`<h3 id="titulo-del-aviso">${v.titulo}</h3>
    <p>${v.frase}</p>
    <p class="cost">«Resolver sola» deja que la IA pelee por ti, sin ver la batalla.</p>
    <div class="botones">
      <button data-action="aviso-resolver-sola">Resolver sola</button>
      <button data-action="aviso-defender" class="primary" autofocus>Defender</button>
    </div>`;
}
