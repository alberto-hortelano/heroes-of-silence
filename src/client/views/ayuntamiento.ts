/**
 * El panel de la escena del ayuntamiento: los héroes que se pueden contratar para
 * elegir (como el clic en su figura), y la ficha del elegido —su retrato, su
 * nombre, su tipo, lo que dice de él el cuaderno, su precio y, si es el de salida,
 * su tropa— con el botón de contratarlo, que va por la acción de siempre
 * (`hire_hero`, con su tipo).
 *
 * Sin reglas: el precio y por qué no se puede ya vienen del núcleo en la vista
 * (`candidatosAHeroe`), y el motivo va **escrito debajo** del botón, como en la
 * morada: en el móvil no hay ratón que enseñe un `title`.
 */
import { type Army, describirCoste } from '@core/types.js';
import type { FichaDelAyuntamiento } from '../ayuntamiento/vista.js';
import { DESHABILITADO, type Html, html, NADA, srcDeImagen } from '../html.js';
import type { Session } from '../session.js';
import { filaDeCifra, motivoApagado } from './cifras.js';
import { botonesDeLaFila } from './morada.js';
import { nota, renderArmy } from './panels.js';

export function renderPanelDelAyuntamiento(session: Session): Html {
  const vista = session.vistaDelAyuntamiento();
  const town = session.activeTown;
  if (vista === null || town === null) return NADA;
  const candidatos = botonesDeLaFila(
    vista,
    (tipo) => html`data-action="ayuntamiento-elegir" data-tipo="${tipo}"`,
  );
  const cabecera =
    vista.tropa !== null
      ? html`<h2>Elige a tu héroe</h2>
      <p class="cost">Es tu primera compra: lo que cuesta se descuenta del oro con que reclutarás la tropa.</p>`
      : html`<h2>Contratar héroe</h2>`;
  return html`<p class="eyebrow">${vista.nombre.toUpperCase()} · ${town.name.toUpperCase()}</p>
    ${cabecera}
    <div class="stack-list ayuntamiento-candidatos">${candidatos}</div>
    ${renderFicha(session, vista.heroe, vista.ficha, vista.tropa)}`;
}

/**
 * La ficha del elegido: quién es, lo que cuesta y el botón; debajo, con qué sale
 * el de salida (lo que diga la vista: un contratado no lleva tropa que enseñar).
 */
function renderFicha(
  session: Session,
  nombre: string,
  f: FichaDelAyuntamiento,
  tropa: Army | null,
): Html {
  const apagado = f.motivo === null ? NADA : DESHABILITADO;
  const conTropa =
    tropa === null
      ? NADA
      : html`<h3>Tropa ${nota('Con la que sale de la base.')}</h3>
      ${renderArmy(tropa, session.state.characters)}`;
  return html`<section class="ficha-del-ayuntamiento" aria-label="Ficha de ${f.nombreDelTipo}">
    <div class="retrato-y-nombre">
      <img class="retrato-de-heroe"${srcDeImagen(`/unidades/${f.hoja}/identidad.webp`)} alt="" width="72" height="72" />
      <div>
        <p class="nombre-de-heroe">${nombre}</p>
        <p class="tipo-de-heroe">${f.nombreDelTipo}</p>
      </div>
    </div>
    <p class="descripcion-de-heroe">${f.descripcion}</p>
    ${filaDeCifra('Precio', describirCoste(f.precio))}
    <div class="reclutar">
      <button data-action="hire-hero" data-tipo="${f.tipo}" class="primary" ${apagado}>Contratar a ${f.nombreDelTipo}</button>
    </div>
    ${motivoApagado(f.motivo)}
    ${conTropa}
  </section>`;
}
