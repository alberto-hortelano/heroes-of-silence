/**
 * El panel de la escena de la tropa: a quién se puede elegir, la ficha del
 * elegido (solo lectura) y su equipo, con la mochila del héroe para repartirla.
 *
 * Sin reglas: lo que no se puede poner o quitar ya viene apagado de la vista con
 * el motivo del núcleo (`tropa/vista.ts`), y el motivo va **escrito debajo**, no
 * en un `title`: en el móvil no hay ratón que lo enseñe.
 */
import { conMiles, NOMBRE_DE_HUECO } from '@core/types.js';
import { DESHABILITADO, type Html, html, NADA, unir } from '../html.js';
import type { FichaDeLaTropa, HuecoDeLaFicha, VistaDeLaTropa } from '../tropa/vista.js';
import { filaDeCifra, filasDeCombate, motivoApagado } from './cifras.js';
import { modificadoresEnPantalla, nota } from './panels.js';

/** Lo que dice un botón de elegir: «heroe» o el puesto en la tropa. */
export function claveDeQuien(q: { readonly heroe: true } | { readonly indice: number }): string {
  return 'heroe' in q ? 'heroe' : String(q.indice);
}

export function renderPanelDeLaTropa(vista: VistaDeLaTropa | null): Html {
  if (vista === null) return NADA;
  const quienes = unir(
    vista.figuras.map((f, i) => {
      const elegida = i === vista.elegida;
      return html`<button data-action="tropa-elegir" data-quien="${claveDeQuien(f.quien)}" class="stack${elegida ? ' primary' : ''}" aria-pressed="${elegida ? 'true' : 'false'}">
        <span>${f.nombre}</span>${elegida ? html`<span class="count">◆</span>` : NADA}
      </button>`;
    }),
  );
  return html`<p class="eyebrow">TROPA DE ${vista.heroe.toUpperCase()} · ${vista.figuras.length - 1} ${vista.figuras.length === 2 ? 'INDIVIDUO' : 'INDIVIDUOS'}</p>
    <div class="stack-list tropa-quienes">${quienes}</div>
    ${renderFicha(vista.ficha)}`;
}

function renderFicha(f: FichaDeLaTropa): Html {
  const experiencia =
    f.siguiente === null
      ? `${conMiles(f.experiencia)} · rango máximo`
      : `${conMiles(f.experiencia)} / ${conMiles(f.siguiente)}`;
  const servicio =
    f.servicio === null
      ? NADA
      : html`${filaDeCifra('Batallas', String(f.servicio.batallas))}${filaDeCifra('Bajas', String(f.servicio.bajas))}`;
  return html`<section class="ficha-de-la-tropa" aria-label="Ficha de ${f.nombre}">
    <p class="eyebrow">${f.queEs.toUpperCase()}</p>
    <h2>${f.nombre}</h2>
    ${filaDeCifra('Nivel', `Índice ${f.indice} · nivel ${f.nivel}`)}
    ${filaDeCifra('Rango', String(f.rango))}
    <div class="row"><span class="label">Experiencia ${nota('La que lleva y, detrás, la que pide el rango siguiente: se gana quitando vida en batalla.')}</span><span>${experiencia}</span></div>
    ${servicio}
    <h3>Características ${nota('Las de pelear, con lo de serie de su unidad y lo suyo puesto: cambian al momento al equipar o quitar.')}</h3>
    ${filasDeCombate(f.cifras, f.armadura)}
    <h3>Equipo</h3>
    <div class="stack-list tropa-equipo">${unir(f.huecos.map(filaDeHueco))}</div>
    <h3>Mochila del héroe · ${f.mochila.length}</h3>
    <div class="stack-list tropa-mochila">${renderMochila(f)}</div>
  </section>`;
}

function filaDeHueco(h: HuecoDeLaFicha): Html {
  const nombre = NOMBRE_DE_HUECO[h.hueco];
  if (h.pieza === null) {
    return html`<div class="stack empty" data-hueco="${h.hueco}"><span>${nombre}: —</span></div>`;
  }
  const serie = h.deSerie
    ? html` <span class="de-serie">de serie ${nota('Lo de serie de su unidad no se quita: se sustituye poniéndole otra pieza en el hueco.')}</span>`
    : NADA;
  const quitar =
    h.quitar === null
      ? NADA
      : html`<button data-action="tropa-quitar" data-slot="${h.hueco}" ${h.quitar.motivo === null ? NADA : DESHABILITADO} aria-label="Quitar ${h.pieza.nombre} y guardarla en la mochila">×</button>`;
  return html`<div class="stack" data-hueco="${h.hueco}"><span>${nombre}: ${h.pieza.nombre}${serie}<span class="veterania">${modificadoresEnPantalla(h.pieza)}</span>${motivoApagado(h.quitar?.motivo ?? null)}</span><span class="count">${quitar}</span></div>`;
}

function renderMochila(f: FichaDeLaTropa): Html {
  if (f.mochila.length === 0) {
    return html`<div class="stack empty"><span>Vacía: lo que le quites a alguien vuelve aquí, y el botín y lo que compres caen aquí</span></div>`;
  }
  return unir(
    f.mochila.map(({ pieza, poner, segunda }) => {
      // Un arma va también de segunda (25-10-2026): su botón, apagado con el
      // motivo del núcleo si no cabe (un arma a dos manos, el escudo).
      const deSegunda =
        segunda === undefined
          ? NADA
          : html` <button data-action="tropa-poner" data-item="${pieza.id}" data-hueco="segunda" ${segunda === null ? NADA : DESHABILITADO} title="${segunda ?? 'Ponérsela de segunda arma'}">A la segunda mano</button>`;
      return html`<div class="stack" data-item="${pieza.id}"><span>${pieza.nombre}<span class="veterania">${NOMBRE_DE_HUECO[pieza.hueco]} · ${modificadoresEnPantalla(pieza)}</span>${motivoApagado(poner)}</span><span class="count"><button data-action="tropa-poner" data-item="${pieza.id}" ${poner === null ? NADA : DESHABILITADO}>Poner</button>${deSegunda}</span></div>`;
    }),
  );
}
