/**
 * El panel de la escena de la morada: las unidades que produce para elegir (como
 * el clic en su figura), el reclutamiento de la elegida, con «+1» y «Todo (n)», que
 * van por las acciones de siempre (`recruit`), y su ficha (solo lectura).
 *
 * Sin reglas: cuánto cabe y por qué no se puede ya vienen del núcleo en la vista
 * (`morada/vista.ts`), y el motivo va **escrito debajo** de los botones, no en un
 * `title`: en el móvil no hay ratón que lo enseñe. Debajo, la mejora de la morada
 * si le queda alguna (`mejora`, la de la base).
 */
import { NOMBRE_DE_HUECO } from '@core/types.js';
import { DESHABILITADO, type Html, html, NADA, unir } from '../html.js';
import type { FichaDeLaMorada } from '../morada/vista.js';
import type { Session } from '../session.js';
import { mejora } from './base.js';
import { filaDeCifra, filasDeCombate, motivoApagado } from './cifras.js';
import { filaLiderazgo, modificadoresEnPantalla, nota, renderTropaLicenciable } from './panels.js';

export function renderPanelDeLaMorada(session: Session): Html {
  const vista = session.vistaDeLaMorada();
  const town = session.activeTown;
  if (vista === null || town === null) return NADA;
  const unidades = botonesDeLaFila(
    vista,
    (id) => html`data-action="morada-elegir" data-unidad="${id}"`,
  );
  return html`<p class="eyebrow">MORADA · ${town.name.toUpperCase()}</p>
    <h2>${vista.nombre}</h2>
    <div class="stack-list morada-unidades">${unidades}</div>
    ${renderFicha(vista.ficha)}
    ${renderTropaDelHeroe(session)}
    ${mejora(session, town, vista.sitio)}`;
}

/**
 * Los botones de la fila de una escena de pie ante un edificio de la base (la
 * morada, el ayuntamiento): uno por figura, que la elige como el clic en ella, con
 * la elegida marcada. `elige` pone en cada uno su acción y a quién elige.
 */
export function botonesDeLaFila(
  vista: {
    readonly figuras: readonly { readonly id: string; readonly nombre: string }[];
    readonly elegida: number;
  },
  elige: (id: string) => Html,
): Html {
  return unir(
    vista.figuras.map((f, i) => {
      const elegida = i === vista.elegida;
      return html`<button ${elige(f.id)} class="stack${elegida ? ' primary' : ''}" aria-pressed="${elegida ? 'true' : 'false'}">
        <span>${f.nombre}</span>${elegida ? html`<span class="count">◆</span>` : NADA}
      </button>`;
    }),
  );
}

/**
 * La tropa del héroe que está dentro, con su «−1»: el héroe sale de casa con la
 * tropa llena y sin licenciar aquí no cabría ningún recluta (QA I1, 20-10-2026).
 * Es la misma lista que la de la base (`renderTropaLicenciable`). Sin héroe dentro,
 * lo reclutado va a la guarnición, que no se licencia.
 */
function renderTropaDelHeroe(session: Session): Html {
  const heroe = session.heroeEnLaBase();
  if (heroe === null) return NADA;
  return html`<h3>Tropa del héroe ${nota('Licencia lo que sobre para hacer sitio a lo que reclutes: de cada tipo se va primero el de menos experiencia.')}</h3>
    ${filaLiderazgo(session.liderazgo({ heroe: heroe.id }))}
    ${renderTropaLicenciable(heroe.id, heroe.army, session.state.characters)}`;
}

/**
 * La ficha de la elegida: su nombre y su nivel, y enseguida lo de reclutarla —con
 * las cifras primero, «+1», «Todo» y el motivo de no poder quedaban por debajo de
 * lo que se ve en un escritorio de 1440×900 (`pnpm capturas`, «desktop-05b»)—;
 * debajo, las cifras con que pelea, sus rasgos y lo de serie.
 */
function renderFicha(f: FichaDeLaMorada): Html {
  const rasgos = f.rasgos.length === 0 ? NADA : filaDeCifra('Rasgos', f.rasgos.join(', '));
  const serie =
    f.deSerie.length === 0
      ? html`<div class="stack empty"><span>Sin nada de serie</span></div>`
      : unir(
          f.deSerie.map(
            ({ hueco, pieza }) =>
              html`<div class="stack" data-hueco="${hueco}"><span>${NOMBRE_DE_HUECO[hueco]}: ${pieza.nombre}<span class="veterania">${modificadoresEnPantalla(pieza)}</span></span></div>`,
          ),
        );
  return html`<section class="ficha-de-la-morada" aria-label="Ficha de ${f.nombre}">
    <h3>${f.nombre}</h3>
    ${filaDeCifra('Nivel', `Índice ${f.indice} · nivel ${f.nivel}`)}
    ${renderReclutar(f)}
    <h3>Características ${nota('Las de pelear de un recluta, con lo de serie de su unidad puesto.')}</h3>
    ${filasDeCombate(f.cifras, f.armadura)}
    ${rasgos}
    <h3>Equipo de serie ${nota('Lo lleva todo recluta de esta unidad y no se quita: se sustituye poniéndole otra pieza en el hueco.')}</h3>
    <div class="stack-list morada-serie">${serie}</div>
  </section>`;
}

function renderReclutar(f: FichaDeLaMorada): Html {
  const { plan, motivo } = f;
  const cupo =
    plan === null
      ? NADA
      : html`<p class="cost">Cada uno ocupa ${plan.ocupaUno}; ${plan.quien} lleva ${plan.ocupado} de ${plan.tope} y caben ${plan.caben}.</p>`;
  // Si no se puede ni uno, los dos salen apagados y la frase del núcleo va debajo.
  const apagado = motivo === null ? NADA : DESHABILITADO;
  return html`${filaDeCifra('Disponibles', `${f.disponibles} · +${f.crecimiento}/semana`)}
    ${filaDeCifra('Precio', `${f.precio} cada uno`)}
    ${cupo}
    <div class="reclutar">
      <button data-action="recruit" data-creature="${f.id}" data-todo="no" ${apagado}>+1</button>
      <button data-action="recruit" data-creature="${f.id}" data-todo="si" class="primary" ${apagado}>${plan === null ? 'Todo' : `Todo (${plan.maximo})`}</button>
    </div>
    ${motivoApagado(motivo)}`;
}
