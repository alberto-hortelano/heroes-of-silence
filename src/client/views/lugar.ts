/**
 * Los paneles de un lugar de un mundo (F1a del mapa vivo): el lateral —su nombre,
 * su estado y lo que hay en él— y la conversación en árbol, en el
 * `<dialog id="conversacion">` de la base. Lo escrito por el motor (nombres,
 * textos, opciones) va en huecos de texto y la plantilla lo escapa.
 *
 * Una opción que no se puede elegir sale apagada (`aria-disabled`, que deja
 * leerla y enfocarla) con su motivo debajo, que escribe el núcleo
 * (`motivoDeLaOpcion`): la persona lee por qué, no un botón gris mudo.
 */
import { type Html, html, NADA, unir } from '../html.js';
import type { VistaDeLaConversacion } from '../lugar/sesion.js';
import type { Session } from '../session.js';

export function renderPanelDelLugar(session: Session): Html {
  const vista = session.lugar.vista();
  if (vista === null) return NADA;
  const hablando = session.lugar.hablando;
  const puntos = unir(
    vista.puntos.map(
      (p) =>
        html`<button data-action="lugar-ir" data-punto="${p.id}" class="stack${hablando === p.id ? ' primary' : ''}">
          <span>${p.nombre}${p.papel === null ? NADA : html`<span class="veterania">${p.papel}</span>`}</span>
          <span class="count">${p.papel === null ? 'Mirar' : 'Hablar'}</span>
        </button>`,
    ),
  );
  const titulo = session.tituloDelMundo;
  return html`<p class="eyebrow">LUGAR${titulo === null ? NADA : html` · ${titulo.toUpperCase()}`}</p>
    <h2>${vista.nombre}</h2>
    <p class="cost">Ahora está ${vista.estado}.</p>
    <h3>Lo que hay</h3>
    <div class="stack-list">${vista.puntos.length === 0 ? html`<div class="stack empty">No queda nadie ni nada.</div>` : puntos}</div>`;
}

/**
 * La conversación abierta (`EnElLugar.conversacion`, que ya ha calculado quien la
 * enseña): quién, lo que dice y las opciones, cada una con su motivo si no vale.
 */
export function renderConversacionDelLugar(c: VistaDeLaConversacion): Html {
  const opciones = unir(
    c.opciones.map(
      (o) =>
        html`<li><button data-action="lugar-opcion" data-indice="${String(o.indice)}"${
          o.motivo === null ? NADA : html` aria-disabled="true" class="apagada"`
        }>${o.texto}${o.pelea ? html` <span class="veterania">(pelea)</span>` : NADA}</button>${
          o.motivo === null ? NADA : html`<span class="veterania motivo">${o.motivo}</span>`
        }</li>`,
    ),
  );
  // De la pantalla, sin efecto: al volver a hablar se sigue donde quedó (H14 de la
  // vuelta 2), y esto deja empezar otra vez.
  const alPrincipio = c.lejosDelInicio
    ? html`<li><button data-action="lugar-al-principio" class="al-principio">Volver al principio</button></li>`
    : NADA;
  return html`<h3>${c.quien}</h3>${c.papel === null ? NADA : html`<p class="cost">${c.papel}</p>`}
    <p class="linea">${c.texto}</p>
    <ol class="opciones-del-lugar">${opciones}${alPrincipio}</ol>`;
}
