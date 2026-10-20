/**
 * Lo que pinta la pantalla de inicio (19-10-2026, «primera pantalla: nuevo juego,
 * cargar juego o partida rápida»): el menú, la elección de facción y la del héroe
 * (vuelta 2: «no he elegido al heroe»). Solo marcado, por `html.ts`, y lo que dice
 * de cada facción y de cada tipo de héroe lo lee del núcleo (su nombre, su rasgo
 * o su descripción del cuaderno, el héroe con que se empieza y la hoja de su
 * retrato): aquí no se decide nada. Lo conduce `inicio.ts`.
 */
import { figuraDelHeroe, rasgoDeFaccion, tiposDeHeroe } from '@core/data.js';
import { nombreDeSalida } from '@core/state/setup.js';
import { FACTION_IDS, type FactionId, NOMBRE_DE_FACCION } from '@core/types.js';
import { type Html, html, NADA, srcDeImagen, unir } from '../html.js';

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
 * «Siguiente» lleva a la elección del héroe.
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
      <button type="submit" class="primary" data-inicio="siguiente">Siguiente</button>
    </div>
  </form>`;
}

/**
 * Un tipo de héroe de la elección: el retrato de su hoja (`identidad.webp`, la
 * misma hoja con que se pinta en el mapa, la base y la batalla), su nombre y su
 * descripción del cuaderno.
 */
function opcionDeHeroe(
  faccion: FactionId,
  id: string,
  nombre: string,
  que: string,
  elegido: string,
): Html {
  const hoja = figuraDelHeroe({ faction: faccion, tipo: id });
  return html`<label class="opcion-de-heroe" data-heroe="${id}">
    <input type="radio" name="heroe" value="${id}" ${id === elegido ? html`checked` : NADA} />
    <img class="retrato-de-heroe"${srcDeImagen(`/unidades/${hoja}/identidad.webp`)} alt="" width="72" height="72" />
    <span class="nombre-de-heroe">${nombre}</span>
    <span class="descripcion-de-heroe">${que}</span>
  </label>`;
}

/**
 * La elección del héroe (vuelta 2, 19-10-2026): los tipos de la facción elegida,
 * en el orden del cuaderno, uno marcado (`elegido`), con la página ya vestida de
 * su tema. Se elige el tipo, no el nombre: el nombre es el de salida de la
 * facción (`nombreDeSalida`), y se dice arriba.
 */
export function renderEleccionDeHeroe(faccion: FactionId, elegido: string): Html {
  return html`<form class="eleccion-de-heroe" data-inicio="heroe" data-de-faccion="${faccion}">
    <h1 class="titulo-de-inicio">Elige a tu héroe</h1>
    <p class="quien-de-inicio">${NOMBRE_DE_FACCION[faccion]} · se llamará ${nombreDeSalida(faccion, 0)}</p>
    <fieldset class="heroes">
      <legend>Héroe</legend>
      ${unir(tiposDeHeroe(faccion).map((t) => opcionDeHeroe(faccion, t.id, t.nombre, t.descripcion, elegido)))}
    </fieldset>
    <div class="botones-de-inicio">
      <button type="button" data-inicio="volver">Volver</button>
      <button type="submit" class="primary" data-inicio="empezar">Empezar</button>
    </div>
  </form>`;
}
