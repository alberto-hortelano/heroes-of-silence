/**
 * Lo que pinta la pantalla de inicio (19-10-2026, «primera pantalla: nuevo juego,
 * cargar juego o partida rápida»): el menú y la elección de facción. El héroe ya
 * no se elige aquí: se elige y se paga en la base, ante el ayuntamiento
 * (22-10-2026, `ayuntamiento/`). Solo marcado, por `html.ts`, y lo que dice de
 * cada facción lo lee del núcleo (su nombre, su rasgo del cuaderno y el héroe con
 * que se empieza): aquí no se decide nada. Lo conduce `inicio.ts`.
 */
import { rasgoDeFaccion } from '@core/data.js';
import { nombreDeSalida } from '@core/state/setup.js';
import { FACTION_IDS, type FactionId, NOMBRE_DE_FACCION } from '@core/types.js';
import { type Html, html, NADA, unir } from '../html.js';

/** Por qué «Cargar partida» no hace nada: no hay guardado (fuera de alcance, 19-10-2026). */
const SIN_PARTIDAS = 'Aún no hay partidas guardadas.';

/**
 * El menú: «Nuevo juego», «Cargar partida» (enfocable, pero apagado con
 * `aria-disabled` y su motivo a la vista: un `disabled` lo sacaría del teclado y
 * no se sabría por qué no va) y «Partida rápida».
 */
export function renderMenu(): Html {
  return html`<div class="menu-de-inicio">
    <h1 class="titulo-de-inicio">Heroes of Silence</h1>
    <nav class="opciones-de-inicio" aria-label="Empezar">
      <button type="button" class="primary" data-inicio="nuevo">Nuevo juego</button>
      <button type="button" data-inicio="cargar" aria-disabled="true" aria-describedby="sin-partidas">Cargar partida</button>
      <p id="sin-partidas" class="cost">${SIN_PARTIDAS}</p>
      <button type="button" data-inicio="rapida" title="Una facción y un mapa al azar, sin elegir nada">Partida rápida</button>
    </nav>
  </div>`;
}

/** Una facción de la elección: su nombre, su rasgo y el héroe con que se empieza. */
function opcionDeFaccion(f: FactionId, elegida: FactionId): Html {
  return html`<label class="opcion-de-faccion" data-faccion="${f}">
    <input type="radio" name="faccion" value="${f}" ${f === elegida ? html`checked` : NADA} />
    <span class="nombre-de-faccion">${NOMBRE_DE_FACCION[f]}</span>
    <span class="rasgo-de-faccion">${rasgoDeFaccion(f)}</span>
    <span class="heroe-de-faccion">Empiezas con ${nombreDeSalida(f, 0)}</span>
  </label>`;
}

/**
 * La elección de facción: las cinco del juego, una marcada (`elegida`). Marcarla
 * viste la página con su tema (`inicio.ts`); pasar el puntero, no.
 * «Empezar» abre la partida en la base, donde se elige al héroe.
 */
export function renderEleccion(elegida: FactionId): Html {
  return html`<form class="eleccion-de-faccion" data-inicio="eleccion">
    <h1 class="titulo-de-inicio">Elige tu facción</h1>
    <fieldset class="facciones">
      <legend>Facción</legend>
      ${unir(FACTION_IDS.map((f) => opcionDeFaccion(f, elegida)))}
    </fieldset>
    <div class="botones-de-inicio">
      <button type="button" data-inicio="volver">Volver</button>
      <button type="submit" class="primary" data-inicio="empezar">Empezar</button>
    </div>
  </form>`;
}
