/**
 * El panel de lo que se abre en la base: «Ampliar» en los sitios que lo abren
 * (`abreAmpliar`: el ayuntamiento y el castillo), el reclutamiento en una
 * morada, lo suyo en cada edificio de villa.
 * Va encima de lo general del castillo (`renderTownPanel`), que sigue debajo.
 *
 * Sustituye a los solares vacíos y a la franja de recluta del cuadro viejo:
 * lo que falta por construir ya no se pinta en la escena (decisión del usuario),
 * así que se lee aquí, con su coste y, si no se puede, con el motivo que
 * escribe el núcleo (`buildBlocker`). Las acciones salen por `data-action` y las
 * reparte `main.ts`, como todos los botones.
 */
import { creature } from '@core/data.js';
import { building } from '@core/town/buildings.js';
import { construidoEn, SITIOS, type SitioId, siguienteDe, sitioDe } from '@core/town/sitios.js';
import { buildBlocker, creatureOfLevel, recruitCost, type Town } from '@core/town/town.js';
import { describirCoste } from '@core/types.js';
import type { Abierto } from '../escenas/castillo.js';
import { DESHABILITADO, type Html, html, NADA, unir } from '../html.js';
import type { Session } from '../session.js';

/** Lo del gremio y la armería lo pinta `panels.ts`: se pasa hecho para no importarlo de vuelta. */
export interface PiezasDelCastillo {
  readonly hechizos: Html;
  readonly armeria: Html;
  readonly contratar: Html;
}

/** La fila de construir un edificio: su nombre, su coste y el botón, o el motivo por el que no. */
function filaDeConstruir(session: Session, town: Town, id: string, hoyEnCabecera = false): Html {
  const b = building(id);
  const motivo = buildBlocker(town, id, session.resources);
  const coste = describirCoste(b.cost);
  return html`<div class="stack"><span>${b.name}<span class="veterania">${coste === '' ? 'gratis' : coste}</span>${
    // «Ya se ha construido hoy» lo dice la cabecera de «Ampliar» una vez: repetido
    // en cada fila tapaba los motivos que sí distinguen una de otra.
    motivo === null || (hoyEnCabecera && town.builtToday)
      ? NADA
      : html`<span class="veterania motivo">${motivo}</span>`
  }</span><span class="count"><button data-action="build" data-building="${id}" ${motivo === null ? NADA : DESHABILITADO} title="${motivo ?? `Construir ${b.name}`}">Construir</button></span></div>`;
}

/** «Ampliar»: lo siguiente de cada sitio que aún tiene algo por levantar. */
function ampliar(session: Session, town: Town): Html {
  const filas = SITIOS.map((s) => siguienteDe(town, s))
    .filter((id): id is string => id !== null)
    .map((id) => filaDeConstruir(session, town, id, true));
  return html`<h2>Ampliar ${town.name}</h2>
    <p class="cost">${town.builtToday ? 'Hoy ya se ha construido: mañana se podrá levantar otra cosa.' : 'Un edificio por día. Lo que levantes aparece en su sitio.'}</p>
    <div class="stack-list">${filas.length === 0 ? html`<div class="stack empty">Ya está todo construido.</div>` : unir(filas)}</div>`;
}

/** La mejora que le queda a un sitio, si le queda alguna. */
function mejora(session: Session, town: Town, sitio: SitioId): Html {
  const id = siguienteDe(town, sitio);
  return id === null
    ? NADA
    : html`<h3>Mejorar</h3><div class="stack-list">${filaDeConstruir(session, town, id)}</div>`;
}

/** Una morada: cuántos hay, cuánto cuesta y caben, y «+1» y «Todo» (lo que calcula el núcleo). */
function morada(session: Session, town: Town, sitio: SitioId, nivel: number): Html {
  const id = creatureOfLevel(town, nivel);
  const info = creature(id);
  const hay = town.available[id] ?? 0;
  const plan = session.recruitPlan(id);
  const cupo =
    plan === null
      ? NADA
      : html`<p class="cost">Cada uno ocupa ${plan.ocupaUno}; ${plan.quien} lleva ${plan.ocupado} de ${plan.tope} y caben ${plan.caben}.</p>`;
  const todo = plan === null ? 'Todo' : `Todo (${plan.maximo})`;
  // Si no se puede ni uno, los dos botones salen apagados con la frase del
  // núcleo en el `title`: antes se ofrecían y el clic la daba en la barra.
  const motivo = session.motivoParaNoReclutar(id);
  const apagado = motivo === null ? NADA : DESHABILITADO;
  return html`<h2>${info.name}</h2>
    <div class="row"><span class="label">Disponibles</span><span>${hay} · +${info.growth}/semana</span></div>
    <div class="row"><span class="label">Precio</span><span>${describirCoste(recruitCost(id, 1))} cada uno</span></div>
    ${cupo}
    <div class="stack-list reclutar">
      <button data-action="recruit" data-creature="${id}" data-todo="no" ${apagado} title="${motivo ?? 'Reclutar uno'}">+1</button>
      <button data-action="recruit" data-creature="${id}" data-todo="si" class="primary" ${apagado} title="${motivo ?? 'Reclutar todos los que caben y se pagan'}">${todo}</button>
    </div>
    ${mejora(session, town, sitio)}`;
}

function edificio(session: Session, town: Town, sitio: SitioId, piezas: PiezasDelCastillo): Html {
  const s = sitioDe(town.faction, sitio);
  if (s.nivel !== undefined) return morada(session, town, sitio, s.nivel);
  const hecho = construidoEn(town, sitio);
  const titulo = hecho === null ? NADA : html`<h2>${building(hecho).name}</h2>`;
  switch (sitio) {
    case 'guild':
      return html`${titulo}${piezas.hechizos}${mejora(session, town, sitio)}`;
    case 'armory':
      return html`${titulo}${piezas.armeria}${mejora(session, town, sitio)}`;
    case 'tavern':
      // La taberna puede ofrecer contratar, pero no se lo queda: contratar no la
      // pide (`hireHero`) y sigue en lo general, también sin taberna.
      return html`${titulo}<p class="cost">Aquí se junta quien busca a quién seguir: la tropa anda más animada (+${building('tavern').moraleBonus ?? 0} de moral en las batallas de esta base).</p>${piezas.contratar}`;
    case 'market':
      return html`${titulo}<p class="cost">El mercado aún no hace nada: no hay con quién comerciar.</p>`;
    default:
      return html`${titulo}${mejora(session, town, sitio)}`;
  }
}

/** Lo que se abrió en la base, o nada. */
export function renderAbierto(
  session: Session,
  town: Town,
  abierto: Abierto | null,
  piezas: PiezasDelCastillo,
): Html {
  if (abierto === null || abierto.tipo === 'pnj') return NADA;
  const cuerpo =
    abierto.tipo === 'ampliar'
      ? ampliar(session, town)
      : edificio(session, town, abierto.sitio, piezas);
  return html`<section class="abierto-en-la-base">${cuerpo}<button data-action="cerrar-en-la-base">Cerrar</button></section>`;
}

/** La conversación con una persona de la base: su nombre, su papel y lo que dice hoy. */
export function renderConversacion(session: Session, id: string): Html {
  const persona = session.vistaDeLaBase()?.gente.find((p) => p.id === id);
  if (persona === undefined) return NADA;
  return html`<h3>${persona.nombre}</h3><p class="cost">${persona.papel}</p>
    <p class="linea">«${persona.linea}»</p>
    <button data-action="cerrar-conversacion">Seguir</button>`;
}
