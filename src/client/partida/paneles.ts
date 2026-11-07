/**
 * Los paneles de la partida: la barra de arriba (`renderTopbar`), el lateral de cada
 * escena (`renderSide`, que reparte entre el panel del mapa, de la base, de la batalla,
 * de la tropa, de la morada, del ayuntamiento y del lugar) y la barra de abajo
 * (`renderActions`). Generan marcado a partir de la sesión; los clics se resuelven por
 * delegación con atributos `data-action` (los reparte `main.ts`), así que no hay
 * listeners sueltos que limpiar en cada repintado.
 *
 * **Todo sale por `html.ts` y nada devuelve `string`.** No es celo: el `name` de un
 * pueblo lo escribe el agente y el del héroe se deriva de él (`hireHero` bautiza
 * `Capitán de ${town.name}`), así que sanear «en la entrada» nace con fuga y hay que
 * escapar en el sumidero. Que los paneles devuelvan `Html` es lo que hace que olvidarse
 * NO compile: `pintar` no acepta otra cosa, y una función nueva que devuelva `string`
 * la caza `tsc` en `main.ts`. Los `.join('')` de las listas son `unir(...)`, y por el
 * mismo motivo: un `.join('')` sobre cadenas era justo el sitio por donde el marcado
 * se escapaba de la puerta.
 *
 * Hasta la fase C de la reorganización (07-11-2026) era un solo fichero,
 * `views/panels.ts`, con lo común a las tres páginas (hoy en `views/`), el panel y el
 * parte de la batalla (`batalla/panel.ts`, `batalla/parte.ts`), el lateral del mapa y
 * el de la base (`partida/mapa/panel.ts`, `partida/base/panel.ts`) y el ejército
 * (`partida/ejercito.ts`).
 */
import type { RentaDelDia } from '@core/state/renta.js';
import { conMiles } from '@core/texto.js';
import type { Hero } from '@core/types.js';
import { renderBattlePanel } from '../batalla/panel.js';
import { DESHABILITADO, fondoDeColor, type Html, html, NADA, srcDeImagen } from '../comun/html.js';
import { asset } from '../render/assets.js';
import { COLOR_DEL_ORO } from '../render/palette.js';
import type { Session } from '../sesion/partida.js';
import { apagadosPor, motivoParaApagar } from '../views/cifras.js';
import { casillaSoloRuedaDelHeroe } from '../views/combate.js';
import { nota, rotuloDeDia } from '../views/notas.js';
import { renderPanelDelAyuntamiento } from './ayuntamiento/panel.js';
import type { Abierto } from './base/escena.js';
import { renderTownPanel } from './base/panel.js';
import { renderPanelDelLugar } from './lugar/panel.js';
import { ROTULO_DE_FIN, renderAdventurePanel } from './mapa/panel.js';
import { renderPanelDeLaMorada } from './morada/panel.js';
import { renderPanelDeLaTropa } from './tropa/panel.js';

/**
 * De dónde sale la renta del día, en una frase para la nota de la barra: cada
 * ciudad con lo que da su ayuntamiento y cada pueblo con lo suyo. Lo que no
 * está unido a la base no cobra, y la frase lo recuerda.
 */
function notaDeLaRenta(renta: RentaDelDia): string {
  const partes = [
    ...renta.ciudades
      .filter((c) => c.unida && c.ocupada === null)
      .map((c) => `${c.nombre} ${conMiles(c.oro)}`),
    ...renta.pueblos
      .filter((p) => p.unido && p.ocupada === null)
      .map((p) => `${p.nombre} ${conMiles(p.oro)}`),
  ];
  // Lo ocupado, aparte y dicho: es oro que se deja de cobrar por algo que se arregla (tarea 2).
  const ocupados = [...renta.ciudades, ...renta.pueblos]
    .filter((x) => x.ocupada !== null)
    .map((x) => x.nombre);
  const de = partes.length === 0 ? 'nada te da oro hoy' : `cobras ${partes.join(', ')}`;
  const sinCobrar =
    ocupados.length === 0 ? '' : ` Ocupados, no te dan nada: ${ocupados.join(', ')}.`;
  return `Oro al día: ${de}.${sinCobrar} Cobran las ciudades y los pueblos unidos a tu base; uno que cortan u ocupan deja de darte oro.`;
}

export function renderTopbar(session: Session): {
  day: string;
  resources: Html;
  turn: string;
} {
  const state = session.state;

  // El oro, el único recurso: lo que hay, lo que
  // entrará mañana y, en su nota, de dónde sale (`Session.renta`, la cuenta del
  // núcleo). Con arte generado se usa el icono; si no, la muestra de color.
  //
  // Los dos únicos huecos de este fichero que caen en `style=` y en `src=` están
  // aquí, y la puerta los rechaza de plano: escapar comillas no para un
  // `javascript:` ni una declaración de estilo de más. Por eso pasan por
  // `srcDeImagen` y `fondoDeColor`, que validan en el idioma del atributo y
  // devuelven el atributo entero ya escrito.
  const icono = asset('icons', 'gold');
  const marca =
    icono === null
      ? html`<span class="swatch"${fondoDeColor(COLOR_DEL_ORO)}></span>`
      : html`<img class="res-icon"${srcDeImagen(icono.src)} alt="">`;
  const renta = session.renta;
  const resources = html`<li data-abre-nota>${marca}<span class="oro">${conMiles(session.oro)}</span><span class="renta">+${conMiles(renta.total)}/día</span>${nota(notaDeLaRenta(renta))}</li>`;

  const desenlace = session.desenlace;
  const turno =
    desenlace !== null
      ? ROTULO_DE_FIN[desenlace]
      : session.isPlayersTurn
        ? 'Tu turno'
        : 'Turno del rival…';

  // La semilla no sale de aquí: no cambia en toda la partida, así que la
  // escribe `main.ts` una vez al abrirla en vez de sesenta veces por segundo.
  return { day: rotuloDeDia(state.day), resources, turn: turno };
}

/**
 * @param contandoAun si el tablero de batalla aún cuenta la última jugada: sus
 *   botones salen apagados (`apagadosPor`).
 */
export function renderSide(
  session: Session,
  contandoAun = false,
  abierto: Abierto | null = null,
): Html {
  switch (session.scene) {
    case 'town':
      return renderTownPanel(session, abierto);
    case 'battle':
      return renderBattlePanel(session, contandoAun);
    case 'tropa':
      return renderPanelDeLaTropa(session.vistaDeLaTropa());
    case 'morada':
      return renderPanelDeLaMorada(session);
    case 'ayuntamiento':
      return renderPanelDelAyuntamiento(session);
    case 'lugar':
      return renderPanelDelLugar(session);
    default:
      return renderAdventurePanel(session);
  }
}

/**
 * El `title` del fin de turno cuando no se puede jugar (`bloqueoDeTurno`: el turno
 * o el héroe de salida por elegir), que lo apaga: el motivo que también deja en la
 * barra pulsar Espacio (`endTurn`). Con el héroe de salida por elegir lo dice
 * además el panel del mapa, para el móvil, que no enseña un `title`.
 */
function tituloDelFinDeTurno(session: Session): Html {
  const motivo = session.bloqueoDeTurno();
  return motivo === null ? NADA : html` title="${motivo}"`;
}

/** @param contandoAun lo mismo que en `renderSide`. */
export function renderActions(session: Session, contandoAun = false): Html {
  if (session.state.finished !== null) {
    return html`<button data-action="restart" class="primary">Partida nueva</button>`;
  }
  switch (session.scene) {
    case 'town':
      return html`<button data-action="close-town">Volver al mapa</button>`;
    case 'tropa':
      return html`<button data-action="cerrar-tropa" title="Escape">Volver al mapa</button>`;
    case 'morada':
      return html`<button data-action="cerrar-morada" title="Escape">Volver a la base</button>`;
    case 'ayuntamiento':
      return html`<button data-action="cerrar-ayuntamiento" title="Escape">Volver a la base</button>`;
    case 'lugar':
      return html`<button data-action="salir-del-lugar" title="Escape">Volver al mapa</button>`;
    case 'battle': {
      const battle = session.batallaALaVista;
      // «Continuar» no se apaga: espera solo a que acabe la jugada (#158 d,
      // `EscenaBatalla.alAcabar`) y cierra una batalla que ya no cambia.
      if (battle !== null && battle.finished !== null) {
        return html`<button data-action="finish-battle" class="primary">Continuar</button>`;
      }
      // «Solo la rueda del héroe» (22-10-2026) se cambia también a media batalla
      // y vale desde el siguiente golpe: no se apaga mientras se cuenta.
      return html`${casillaSoloRuedaDelHeroe(html`data-action="solo-rueda-del-heroe"`, session.soloRuedaDelHeroe)}${apagadosPor(
        motivoParaApagar(session, contandoAun),
        html`<button data-action="auto-battle">Resolver sola</button>`,
      )}`;
    }
    default: {
      const aviso = session.avisoDeFinDeTurno;
      if (aviso !== null) return renderAvisoDeFinDeTurno(aviso);
      return html`
        <button data-action="toggle-fog">${session.revealAll ? 'Ocultar mapa' : 'Ver mapa entero'}</button>
        <button data-action="next-hero" title="Tecla H" ${session.isPlayersTurn ? NADA : DESHABILITADO}>Siguiente héroe</button>
        <button data-action="end-turn" class="primary" ${session.bloqueoDeTurno() === null ? NADA : DESHABILITADO}${tituloDelFinDeTurno(session)}>
          Fin de turno
        </button>`;
    }
  }
}

/**
 * La pregunta antes de pasar el turno con héroes que aún pueden andar (#17),
 * en la barra de abajo, donde estaba el botón que la hizo salir. No es un
 * `confirm()`: el navegador lo pinta a su manera, bloquea la página y en un
 * móvil tapa el mapa que la persona querría mirar antes de contestar.
 */
function renderAvisoDeFinDeTurno(heroes: readonly Hero[]): Html {
  const nombres = heroes.map((h) => h.name).join(', ');
  const verbo = heroes.length === 1 ? 'puede' : 'pueden';
  return html`<span class="aviso-fin-de-turno" role="alert">Aún ${verbo} andar hoy: ${nombres}. ¿Terminar el turno?</span>
    <button data-action="end-turn-cancel" title="Escape">Seguir jugando</button>
    <button data-action="end-turn-confirm" class="primary" title="Intro">Terminar el turno</button>`;
}
