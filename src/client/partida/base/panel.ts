/**
 * El lateral de la base: lo general del castillo (`renderTownPanel`: ingresos,
 * edificios, crecimiento, guarnición, la tropa y el libro del héroe que está dentro, y
 * contratar) y, encima, lo que se abre en ella (`renderAbierto`): «Ampliar» en los
 * sitios que lo abren (`abreAmpliar`: el ayuntamiento y el castillo) y lo suyo en cada
 * edificio de villa. Una morada no se abre aquí: es su escena
 * (`partida/morada/panel.ts`). Lo general vivía en `views/panels.ts` hasta la fase C
 * de la reorganización (07-11-2026).
 *
 * Sustituye a los solares vacíos y a la franja de recluta del cuadro viejo:
 * lo que falta por construir ya no se pinta en la escena (decisión del usuario),
 * así que se lee aquí, con su coste y, si no se puede, con el motivo que
 * escribe el núcleo (`buildBlocker`). Las acciones salen por `data-action` y las
 * reparte `main.ts`, como todos los botones.
 */
import { PIEZAS_DE_ARMERIA } from '@core/equipo/pieza.js';
import { enOrdenDelLibro } from '@core/magia/catalogo.js';
import { buyBlocker } from '@core/state/equipar.js';
import { guarnicionDeLaCiudad } from '@core/state/sitios.js';
import { conMiles, describirCoste } from '@core/texto.js';
import { building } from '@core/town/buildings.js';
import { ECONOMIA } from '@core/town/economia.js';
import { construidoEn, moradaEn, SITIOS, type SitioId, siguienteDe } from '@core/town/sitios.js';
import {
  buildBlocker,
  dailyIncome,
  dwellings,
  mageGuildLevel,
  type Town,
  tieneArmeria,
  townSpells,
} from '@core/town/town.js';
import { type Hero, NOMBRE_DE_HUECO } from '@core/types.js';
import { unidadDelJuego } from '@core/unidad/catalogo.js';
import { disposicionDe } from '../../../shared/base.js';
import { DESHABILITADO, type Html, html, NADA, unir } from '../../comun/html.js';
import type { Session } from '../../sesion/partida.js';
import { filaDeCifra, motivoDelRechazo } from '../../views/cifras.js';
import { modificadoresEnPantalla } from '../../views/notas.js';
import { filaLiderazgo, renderArmy, renderTropaLicenciable } from '../ejercito.js';
import { filaHechizo, renderSpellbook, sinCobrar } from '../mapa/panel.js';
import type { Abierto } from './escena.js';

/**
 * Lo del gremio, la armería y contratar lo pinta lo general del castillo
 * (`renderTownPanel`, abajo) y se lo pasa hecho a lo que se abre: vivía en
 * `views/panels.ts` hasta la fase C de la reorganización (07-11-2026), y así este
 * fichero no lo importaba de vuelta.
 */
export interface PiezasDelCastillo {
  readonly hechizos: Html;
  readonly armeria: Html;
  readonly contratar: Html;
}

/**
 * La fila de construir un edificio: su nombre, su coste y el botón, o el motivo por
 * el que no. `noManda`, por qué no se construye nada en la ciudad (el turno, el
 * héroe de salida por elegir, la ocupación: `noSeConstruye`), una vez por pantalla.
 */
function filaDeConstruir(
  session: Session,
  town: Town,
  id: string,
  noManda: string | null,
  hoyEnCabecera = false,
): Html {
  const b = building(id);
  const motivo = noManda ?? buildBlocker(town, id, session.oro);
  return html`<div class="stack"><span>${b.name}<span class="veterania">${describirCoste(b.cost)}</span>${
    // «Ya se ha construido hoy» lo dice la cabecera de «Ampliar» una vez: repetido
    // en cada fila tapaba los motivos que sí distinguen una de otra.
    hoyEnCabecera && town.builtToday ? NADA : motivoDelRechazo(motivo)
  }</span><span class="count"><button data-action="build" data-building="${id}" ${motivo === null ? NADA : DESHABILITADO} title="${motivo ?? `Construir ${b.name}`}">Construir</button></span></div>`;
}

/** Sin poder jugar (el turno, el héroe de salida por elegir) o sin mandar en la ciudad, no se construye. */
function noSeConstruye(session: Session, town: Town): string | null {
  return session.bloqueoDeTurno() ?? session.mandaEn(town);
}

/** «Ampliar»: lo siguiente de cada sitio que aún tiene algo por levantar. */
function ampliar(session: Session, town: Town): Html {
  const noManda = noSeConstruye(session, town);
  const filas = SITIOS.map((s) => siguienteDe(town, s))
    .filter((id): id is string => id !== null)
    .map((id) => filaDeConstruir(session, town, id, noManda, true));
  return html`<h2>Ampliar ${town.name}</h2>
    <p class="cost">${town.builtToday ? 'Hoy ya se ha construido: mañana se podrá levantar otra cosa.' : 'Un edificio por día. Lo que levantes aparece en su sitio.'}</p>
    <div class="stack-list">${filas.length === 0 ? html`<div class="stack empty">Ya está todo construido.</div>` : unir(filas)}</div>`;
}

/** La mejora que le queda a un sitio, si le queda alguna: la leen lo abierto y la escena de la morada. */
export function mejora(session: Session, town: Town, sitio: SitioId): Html {
  const id = siguienteDe(town, sitio);
  return id === null
    ? NADA
    : html`<h3>Mejorar</h3><div class="stack-list">${filaDeConstruir(session, town, id, noSeConstruye(session, town))}</div>`;
}

function edificio(session: Session, town: Town, sitio: SitioId, piezas: PiezasDelCastillo): Html {
  if (moradaEn(town, sitio).edificio !== null) {
    // La base entra en ella al llegar (`EscenaBase`): no se queda abierta aquí.
    throw new Error(`una morada se abre en su escena, no en el panel de la base (${sitio})`);
  }
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

/**
 * Lo que vende la armería del castillo, con su precio y un «Comprar» por pieza,
 * o nada si no la tiene. Si no se puede comprar —sin héroe dentro, sin oro—, el
 * motivo lo escribe el núcleo (`buyBlocker`) y va en el `title` del botón, que
 * se puede pulsar igual para leerlo en la barra.
 */
function renderArmeria(session: Session, town: Town): Html {
  if (!tieneArmeria(town)) return NADA;
  const filas = unir(
    PIEZAS_DE_ARMERIA.map((p) => {
      const motivo = buyBlocker(session.state, town, p.id, session.viewer);
      return html`<div class="stack"><span>${p.nombre}<span class="veterania">${NOMBRE_DE_HUECO[p.hueco]} · ${modificadoresEnPantalla(p)}</span></span><span class="count">${describirCoste(p.precio)} <button data-action="buy-item" data-item="${p.id}" title="${motivo ?? 'Comprarla para la mochila del héroe que está dentro'}">Comprar</button></span></div>`;
    }),
  );
  return html`<h3>Armería</h3><div class="stack-list">${filas}</div>
    <p class="cost">Lo comprado va a la mochila del héroe que está dentro; pónselo desde su panel.</p>`;
}

/**
 * El panel del castillo: lo que se abrió en la base (`partida/base/panel.ts`) arriba y
 * lo general debajo. Contratar héroe va en lo general, con taberna o sin ella:
 * `hireHero` no la pide, y atarlo a un edificio sería una regla escrita en la
 * pantalla (crítica del ciclo de la base caminable).
 */
export function renderTownPanel(session: Session, abierto: Abierto | null): Html {
  const town = session.activeTown;
  if (town === null) return NADA;

  // Solo los héroes PROPIOS: un rival parado en tu castillo no te enseña su
  // ejército, y sobre todo no esconde tu guarnición.
  // Contratar abre los candidatos ante el ayuntamiento (D3), donde se elige el
  // tipo y se paga; con el de salida por elegir, es elegirlo (el mismo sitio).
  const heroeAqui = session.heroeEnLaBase() ?? undefined;
  // Ocupada (tarea 2): ni se recluta, ni se construye, ni se contrata; lo dice el núcleo.
  const ocupada = session.mandaEn(town);
  const contratar =
    ocupada !== null
      ? html`<button class="primary" style="margin-top:.7rem" disabled title="${ocupada}">Contratar héroe</button>`
      : heroeAqui === undefined
        ? html`<button data-action="abrir-ayuntamiento" class="primary" style="margin-top:.7rem">${session.heroeDeSalidaPendiente ? 'Elige a tu héroe' : 'Contratar héroe'} (${describirCoste(ECONOMIA.precioDelHeroe)})</button>`
        : html`<p class="cost">${heroeAqui.name} ya está dentro: contrata otro cuando salga.</p>`;

  // El `crecimiento || '<div…>Sin moradas</div>'` de antes no vale con marcado:
  // un fragmento vacío es un OBJETO, y `||` lo da por bueno siempre. Se pregunta
  // por lo que de verdad decide —si hay moradas—, que además es lo que se quería
  // decir.
  const moradas = dwellings(town);
  // Ocupada, las moradas no crecen y la semana se pierde (`crecerLasMoradas`): la
  // fila dice +0 y la nota el porqué, no lo que crecería (vuelta 1 de QA, H1).
  const crecimiento =
    moradas.length === 0
      ? html`<div class="stack empty">Sin moradas</div>`
      : unir(
          moradas.map(({ creature: id }) => {
            const info = unidadDelJuego(id);
            return html`<div class="stack"><span>${info.name}</span><span class="count">+${ocupada === null ? info.growth : 0}</span></div>`;
          }),
        );
  // Cada fila, de la regla del núcleo y no de la cifra cruda (vuelta 1 de QA, H1):
  // lo que cobra, de `rentaDelDia` (la misma de la lista del lateral); si se
  // construye, de `ciudadQueMandaBlocker` (`mandaEn`); y la guarnición ajena, como
  // el ocupante que es (`ocupanteDeLaCiudad`), no como la suya.
  const enLaRenta = session.renta.ciudades.find((c) => c.id === town.id);
  const noCobra = enLaRenta === undefined ? null : sinCobrar(enLaRenta, enLaRenta.unida, 'a');
  const ocupante = session.ocupanteDeLaCiudad(town);
  const guarnicionAjena = ocupante !== null && ocupante.ocupante.kind === 'guarnicion';
  const construirHoy = session.heroeDeSalidaPendiente
    ? html`tras elegir a tu héroe`
    : ocupada !== null
      ? html`<span title="${ocupada}">no: ${ocupante === null ? ocupada : 'está ocupada'}</span>`
      : town.builtToday
        ? html`ya hecho`
        : html`disponible`;

  return html`${renderAbierto(session, town, abierto, {
    hechizos: renderTownSpells(town),
    armeria: renderArmeria(session, town),
    contratar,
  })}
    <h2>${town.name}</h2>
    ${ocupada === null ? NADA : html`<p class="cost lose">${ocupada}</p>`}
    <div class="row"><span class="label">Ingresos</span><span${noCobra === null ? NADA : html` title="${noCobra.motivo}"`}>${conMiles(dailyIncome(town))} oro/día${noCobra === null ? '' : ` · ${noCobra.dicho}`}</span></div>
    ${filaDeCifra('Gremio de magia', String(mageGuildLevel(town) || '—'))}
    ${filaDeCifra('Construir hoy', construirHoy)}
    <p class="cost">${session.heroeDeSalidaPendiente ? 'Pulsa el ayuntamiento para elegir a tu héroe; hasta entonces no se amplía ni se recluta.' : ocupada !== null ? 'Mientras no mandes en ella no se amplía ni se recluta: pulsa un edificio para ver lo suyo o a alguien para hablar.' : 'Pulsa el ayuntamiento para ampliar la base, una morada para reclutar, un edificio para ver lo suyo o a alguien para hablar.'}</p>

    <h3>Edificios</h3>
    <div class="stack-list ir-a-sitio">${renderListaDeEdificios(session)}</div>

    <h3>Crecimiento semanal</h3>
    <div class="stack-list">${crecimiento}</div>${ocupada === null ? NADA : html`<p class="cost lose">No crece mientras esté ocupada: la semana que empiece así se pierde.</p>`}

    <h3>Guarnición</h3>
    ${
      guarnicionAjena
        ? html`<p class="cost lose">La ocupa: ${ocupante.quien}. No es tuya: échala atacándola.</p>`
        : filaLiderazgo(session.liderazgo({ guarnicion: town.id }))
    }
    ${renderArmy(guarnicionDeLaCiudad(session.state, town))}
    ${
      heroeAqui === undefined
        ? NADA
        : html`<button data-action="abrir-guarnicion" data-hero="${heroeAqui.id}">Dejar y recoger tropa</button>
          <p class="cost">La guarnición no se recoge sola: ${heroeAqui.name} deja o se lleva lo que quiera. Si atacan con él dentro, defiende con lo que elija de los dos.</p>`
    }

    ${
      heroeAqui === undefined
        ? html`${
            ocupada !== null
              ? NADA
              : html`<p class="cost">${
                  session.heroeDeSalidaPendiente
                    ? 'Antes de reclutar o construir, elige a tu héroe de salida ante el ayuntamiento.'
                    : 'Sin héroe dentro, lo que reclutes se queda de guarnición.'
                }</p>`
          }
          ${contratar}`
        : html`${renderLibroEnElCastillo(session, heroeAqui, town)}<h3>Tropa del héroe</h3>
          ${filaLiderazgo(session.liderazgo({ heroe: heroeAqui.id }))}
          <p class="cost">Lo que reclutes va a su tropa, hasta su liderazgo. Licencia lo que sobre para hacer sitio a algo mejor.</p>
          ${renderTropaLicenciable(heroeAqui.id, heroeAqui.army)}`
    }`;
}

/**
 * Lo construido en la base, de izquierda a derecha en la plaza: pulsar uno
 * lleva a su puerta y abre lo suyo (`EscenaBase.irA`). El escenario es más
 * ancho que la vista y un edificio lejano no se ve para pulsarlo.
 */
function renderListaDeEdificios(session: Session): Html {
  const vista = session.vistaDeLaBase();
  if (vista === null) return NADA;
  const d = disposicionDe(vista.faccion);
  const enLaPlaza = [...vista.edificios].sort(
    (a, b) => d.sitios[a.sitio].puerta.x - d.sitios[b.sitio].puerta.x,
  );
  return unir(
    enLaPlaza.map(
      (e) =>
        html`<button class="stack" data-action="ir-a-sitio" data-sitio="${e.sitio}" title="Ir a la puerta"><span>${e.nombre}</span></button>`,
    ),
  );
}

/**
 * El libro del héroe que está dentro, y lo que aprendió en este castillo (#54).
 * El gremio promete «los aprende solo», y sin el libro aquí la única prueba de
 * que se los llevó era la crónica, que solo se lee al volver al mapa.
 */
function renderLibroEnElCastillo(session: Session, heroe: Hero, town: Town): Html {
  const aprendido = session.aprendidoEn(heroe.id, town.id);
  const nota =
    aprendido.length === 0
      ? NADA
      : html`<p class="cost">Aprendió aquí: ${enOrdenDelLibro(aprendido)
          .map((s) => s.nombre)
          .join(', ')}.</p>`;
  // El nombre, en su línea y no en el rótulo: con tema, la barra de sección es
  // de una línea y «Libro de Aldo de Valdeluz» (como «Tropa de…», o con
  // Konstanz von Adler y Grommash Dientenegro) salía «LIBRO DE ALDO DE VA…», lo
  // primero que se ve al empezar en la base (QA del arranque, H3).
  return html`<h3>Libro del héroe</h3><p class="cost">${heroe.name} está dentro.</p>${renderSpellbook(heroe.spells)}${nota}`;
}

/**
 * Qué enseña el gremio, no solo su nivel: un número suelto no dice si merece la
 * pena traer aquí al héroe. La lista sale de `townSpells`, así que el panel no
 * sabe qué nivel enseña qué.
 */
function renderTownSpells(town: Town): Html {
  const hechizos = townSpells(town);
  if (hechizos.length === 0) {
    return html`<p class="cost">Sin gremio: construye uno para que tus héroes aprendan magia aquí.</p>`;
  }
  const filas = unir(hechizos.map((s) => filaHechizo(s, true)));
  return html`<h3>Enseña</h3><div class="stack-list">${filas}</div>
    <p class="cost">Un héroe tuyo parado aquí los aprende solo.</p>`;
}
