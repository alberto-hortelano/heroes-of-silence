/**
 * Paneles de interfaz. Generan marcado a partir de la sesión; los clics se
 * resuelven por delegación con atributos `data-action`, así que no hay
 * listeners sueltos que limpiar en cada repintado.
 *
 * **Todo sale por `html.ts` y nada devuelve `string`.** No es celo: el `name` de
 * un pueblo lo escribe el agente y el del héroe se deriva de él (`hireHero`
 * bautiza `Capitán de ${town.name}`), así que sanear «en la entrada» nace con
 * fuga y hay que escapar en el sumidero. Que las quince funciones devuelvan
 * `Html` es lo que hace que olvidarse NO compile: `pintar` no acepta otra cosa,
 * y una función nueva que devuelva `string` la caza `tsc` en `main.ts`.
 *
 * Los `.join('')` de las listas son ahora `unir(...)`, y por el mismo motivo:
 * un `.join('')` sobre cadenas era justo el sitio por donde el marcado se
 * escapaba de la puerta.
 */
import { activeStack, stackById } from '@core/battle/battle.js';
import { quedanCasillas } from '@core/battle/board.js';
import {
  CARGA_MINIMA,
  type CifrasDeCarga,
  cifrasDeCarga,
  dichoDeLaCarga,
} from '@core/battle/carga.js';
import { DEFEND_BONUS } from '@core/battle/damage.js';
import {
  type CuandoVence,
  cifraDeEfecto,
  effectiveLuck,
  enRondas,
  type StackEffect,
} from '@core/battle/effects.js';
import { poder } from '@core/battle/poderes.js';
import {
  contraataqueDelCruce,
  duracion,
  esTipoDeGolpe,
  NOMBRE_DE_GOLPE,
  NOMBRE_DEL_PUNTO,
} from '@core/battle/rueda.js';
import { enOrdenDelLibro, type Spell, spell } from '@core/battle/spells.js';
import {
  type BattleAction,
  type BattleStack,
  type BattleState,
  rangoDeVeterania,
  SIDES,
  type Side,
} from '@core/battle/types.js';
import { unidadDelJuego } from '@core/catalogo.js';
import { isShooter, nombreDeTipoDeHeroe, type Pieza } from '@core/data.js';
import {
  destinoDeEquipo,
  modificadoresDePieza,
  PIEZAS_DE_ARMERIA,
  pieza,
  textoDeModificador,
} from '@core/hero/equipo.js';
import { rangoDe, rangoDeHeroe, umbral } from '@core/hero/experiencia.js';
import {
  cuerpoDelHeroe,
  HERO_BODY,
  type Hero,
  heroUnit,
  maxMana,
  maxMovePoints,
} from '@core/hero/hero.js';
import { elQueSeIria, type Personajes, type TroopGroup, troopSummary } from '@core/hero/troop.js';
import { nivelDeUnidad } from '@core/nivel.js';
import { CHARACTER_BODY } from '@core/rpg/character.js';
import { loQueLaPara } from '@core/state/asaltantes.js';
import { type Desenlace, desenlaceDe } from '@core/state/desenlace.js';
import type { DefeatReason, GameEventDraft } from '@core/state/events.js';
import { buyBlocker } from '@core/state/game.js';
import { building } from '@core/town/buildings.js';
import {
  dailyIncome,
  dwellings,
  mageGuildLevel,
  type Town,
  tieneArmeria,
  townSpells,
} from '@core/town/town.js';
import type { Army, Point, UnitInfo } from '@core/types.js';
import {
  conMiles,
  describirCoste,
  HUECOS,
  NOMBRE_DE_HUECO,
  NOMBRE_DE_RECURSO,
  RESOURCE_KINDS,
} from '@core/types.js';
import { disposicionDe } from '../../shared/base.js';
import { quienesDe } from '../desenlace.js';
import type { Abierto } from '../escenas/castillo.js';
import { DESHABILITADO, fondoDeColor, type Html, html, NADA, srcDeImagen, unir } from '../html.js';
import { asset } from '../render/assets.js';
import { MARCA_DE_COMANDANTE, RESOURCE_COLORS, RESOURCE_NAMES } from '../render/palette.js';
import type { Session, SpellOption } from '../session.js';
import { renderAbierto } from './base.js';
import { nombreEnElCampo } from './distintivo.js';
import { botonesDePoder } from './poderes.js';

/** Lo que dice la barra a quien pulsa mientras la jugada se cuenta. */
export const AVISO_DE_ESPERA = 'Espera a que termine la jugada.';

/**
 * Los botones de la batalla apagados con `motivo` en el `title`, o tal cual con
 * `null`. Mientras el tablero aún cuenta la última jugada (#165), con el aviso de
 * espera: no se ofrecen para luego rechazarlos. Antes salían encendidos —el estado
 * ya va por delante de lo que se ve— y el clic daba el aviso y pedía pulsar otra vez.
 * Y mientras la rueda espera una elección (`motivoDeLaRueda` de la sesión): con el
 * diálogo modal encima, «Terminar turno» y «Resolver sola» se veían encendidos y
 * el clic no llegaba (H3 de QA, 19-10-2026).
 *
 * No se aplazan: un botón pulsado durante la jugada se haría sobre una unidad
 * que todavía no se ve actuar, y un doble clic jugaba el segundo en la
 * SIGUIENTE (M12 de QA de la arena). Un `fieldset` apagado apaga todo lo que
 * lleva dentro, el botón que se añada mañana también: una regla, un sitio.
 */
export function apagadosPor(motivo: string | null, botones: Html): Html {
  return motivo === null
    ? botones
    : html`<fieldset class="contando" disabled title="${motivo}">${botones}</fieldset>`;
}

/** Lo que apaga los botones de la batalla: la jugada que se cuenta o la rueda que espera. */
function motivoParaApagar(session: Session, contandoAun: boolean): string | null {
  return contandoAun ? AVISO_DE_ESPERA : session.motivoDeLaRueda;
}

/**
 * Lo que dice la barra de arriba cuando la partida ha terminado.
 *
 * Tabla y no ternario anidado: con el ternario, el empate por días se pintaba
 * «Partida perdida» —`winner === viewer` con un `null` delante es `false`— y
 * `tsc` no tenía nada que decir. Un `Record<Desenlace, …>` obliga a contestar a
 * los tres, y al cuarto que llegue.
 */
const ROTULO_DE_FIN: Record<Desenlace, string> = {
  ganada: 'Partida ganada',
  perdida: 'Partida perdida',
  'sin resolver': 'Partida sin resolver',
  // Inalcanzable desde aquí —`Session` siempre tiene un `viewer` de verdad— pero
  // la fila no es un relleno: si algún día esta barra la pinta quien solo mira,
  // «Partida terminada» es lo que hay que decirle.
  ajena: 'Partida terminada',
};

/**
 * El día como se lee en la barra: «Día 3 · Semana 2». Lo usan la barra del que
 * juega, la del espectador y el guion de capturas, que la compara con su espejo.
 */
export function rotuloDeDia(day: number): string {
  return `Día ${((day - 1) % 7) + 1} · Semana ${Math.floor((day - 1) / 7) + 1}`;
}

export function renderTopbar(session: Session): {
  day: string;
  resources: Html;
  turn: string;
} {
  const state = session.state;

  // Con arte generado se usa el icono; si no, la muestra de color.
  //
  // Los dos únicos huecos de este fichero que caen en `style=` y en `src=` están
  // aquí, y la puerta los rechaza de plano: escapar comillas no para un
  // `javascript:` ni una declaración de estilo de más. Por eso pasan por
  // `srcDeImagen` y `fondoDeColor`, que validan en el idioma del atributo y
  // devuelven el atributo entero ya escrito.
  const resources = unir(
    RESOURCE_KINDS.map((k) => {
      const valor = session.resources[k];
      const icono = asset('icons', k);
      const marca =
        icono === null
          ? html`<span class="swatch"${fondoDeColor(RESOURCE_COLORS[k])}></span>`
          : html`<img class="res-icon"${srcDeImagen(icono.src)} alt="">`;
      return html`<li title="${RESOURCE_NAMES[k]}">${marca}${valor}</li>`;
    }),
  );

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
    default:
      return renderAdventurePanel(session);
  }
}

/** @param contandoAun lo mismo que en `renderSide`. */
export function renderActions(session: Session, contandoAun = false): Html {
  if (session.state.finished !== null) {
    return html`<button data-action="restart" class="primary">Partida nueva</button>`;
  }
  switch (session.scene) {
    case 'town':
      return html`<button data-action="close-town">Volver al mapa</button>`;
    case 'battle': {
      const battle = session.battle;
      // «Continuar» no se apaga: espera solo a que acabe la jugada (#158 d,
      // `EscenaBatalla.alAcabar`) y cierra una batalla que ya no cambia.
      if (battle !== null && battle.finished !== null) {
        return html`<button data-action="finish-battle" class="primary">Continuar</button>`;
      }
      return apagadosPor(
        motivoParaApagar(session, contandoAun),
        html`<button data-action="auto-battle">Resolver sola</button>`,
      );
    }
    default: {
      const aviso = session.avisoDeFinDeTurno;
      if (aviso !== null) return renderAvisoDeFinDeTurno(aviso);
      return html`
        <button data-action="toggle-fog">${session.revealAll ? 'Ocultar mapa' : 'Ver mapa entero'}</button>
        <button data-action="next-hero" title="Tecla H" ${session.isPlayersTurn ? NADA : DESHABILITADO}>Siguiente héroe</button>
        <button data-action="end-turn" class="primary" ${session.isPlayersTurn ? NADA : DESHABILITADO}>
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

// ---------------------------------------------------------------- aventura

/**
 * Cómo acabó la partida, contado en el lateral. Ganar y perder se explican por **la causa** que selló `checkDefeat`, no por
 * una frase fija: la fija era la regla de antes del mapa de nodos —«no te
 * quedan castillos ni héroes»— y se leía con el héroe del derrotado todavía en
 * el mapa (I1 de la 2a). Tabla por causa por lo mismo que las de arriba: una
 * causa nueva sin frase no compila.
 */
const POR_QUE_SE_DECIDIO: Record<DefeatReason, { ganada: string; perdida: string }> = {
  lost_base: {
    ganada: 'Has tomado la base rival: sin ella, el rival queda eliminado.',
    perdida: 'Has perdido tu base: sin ella quedas eliminado, aunque te queden héroes o ciudades.',
  },
  nothing_left: {
    ganada: 'El rival se ha quedado sin héroes y sin ciudades.',
    perdida: 'Te has quedado sin héroes y sin ciudades.',
  },
};

/**
 * Las dos que no tienen causa salen antes; con un quinto desenlace, el índice
 * de la última línea deja de compilar, que es el mismo guardia que la tabla.
 */
export function explicacionDeFin(desenlace: Desenlace, causa: DefeatReason | null): string {
  if (desenlace === 'sin resolver') return 'Se han agotado los días y nadie ha vencido.';
  if (desenlace === 'ajena') return 'La partida ha terminado.';
  if (causa === null) throw new Error(`la partida está ${desenlace} y no consta por qué`);
  return POR_QUE_SE_DECIDIO[causa][desenlace];
}

function renderFinDePartida(desenlace: Desenlace, causa: DefeatReason | null): Html {
  const explicacion = explicacionDeFin(desenlace, causa);
  return html`<div class="fin ${desenlace === 'perdida' ? 'perdida' : 'ganada'}">
    <p class="eyebrow">FIN DE LA PARTIDA</p>
    <h2>${ROTULO_DE_FIN[desenlace]}</h2>
    <p>${explicacion}</p>
  </div>`;
}

/**
 * El liderazgo ocupado sobre el tope, con su barra. Lo pinta el héroe del mapa y
 * el castillo: es la cifra que decide cuántos más caben, y sin verla «todo»
 * parecía reclutar menos de lo que había por capricho.
 */
function filaLiderazgo({ ocupado, tope }: { ocupado: number; tope: number }): Html {
  return html`<div class="row"><span class="label">Liderazgo</span><span>${ocupado} / ${tope}</span></div>
    <progress class="liderazgo" max="${tope}" value="${Math.min(ocupado, tope)}"></progress>`;
}

/**
 * «3 (+3) / 3 (+3)»: con lo que el héroe pelea sin nada puesto —sus atributos más
 * lo que le da el rango— y, entre paréntesis, lo que le suma el equipo. `puesto`
 * es su `heroUnit`, la misma puerta con la que entra en batalla, y lo de sin nada
 * puesto, `desnudo`, su `cuerpoDelHeroe`: sumar aquí `hero.attack + sumaDeEquipo`
 * se saltaba el rango, y a un héroe de rango 6 la ficha le enseñaba uno menos de
 * lo que pegaba.
 */
function ataqueYDefensa(desnudo: UnitInfo, puesto: UnitInfo): string {
  const cifra = (base: number, total: number) =>
    total > base ? `${base} (+${total - base})` : `${base}`;
  return `${cifra(desnudo.attack, puesto.attack)} / ${cifra(desnudo.defense, puesto.defense)}`;
}

function renderAdventurePanel(session: Session): Html {
  const hero = session.selectedHero;
  const heroes = session.myHeroes();
  const desenlace = session.desenlace;
  const fin = desenlace === null ? NADA : renderFinDePartida(desenlace, session.causaDelFinal);

  // Sus cifras, una vez: de ellas salen el nivel y el ataque y la defensa.
  const puesto = hero === null ? null : heroUnit(hero);
  const heroPanel =
    hero === null || puesto === null
      ? html`<p>No tienes héroes en el mapa. Contrata uno en tu castillo.</p>`
      : html`
        <p class="eyebrow">HÉROE · RANGO ${rangoDeHeroe(hero)} · NIVEL ${nivelDeUnidad(puesto)} · ${nombreDeTipoDeHeroe(hero.faction, hero.tipo)}</p>
        <h2>${hero.name}</h2>${historiaDelHeroe(hero.origen?.historia ?? null)}
        ${botonDeSueño(session, hero)}
        ${filaLiderazgo(session.liderazgo({ heroe: hero.id }))}
        <div class="row"><span class="label">Movimiento</span><span>${hero.movePoints} / ${maxMovePoints(hero, session.state.characters)}</span></div>
        <div class="row"><span class="label">Maná</span><span>${hero.mana} / ${maxMana(hero)}</span></div>
        <div class="row"><span class="label">Ataque / Defensa</span><span>${ataqueYDefensa(cuerpoDelHeroe(hero), puesto)}</span></div>
        <div class="row"><span class="label">Poder / Conocimiento</span><span>${hero.spellPower} / ${hero.knowledge}</span></div>
        <div class="row"><span class="label">Experiencia</span><span>${experienciaDeHeroe(hero.experience)}</span></div>
        <h3>Hechizos</h3>
        ${renderSpellbook(hero.spells)}
        ${renderEquipoDelHeroe(hero, session.selectedItem)}
        <h3>Tropa · ${hero.army.length} ${hero.army.length === 1 ? 'individuo' : 'individuos'}</h3>
        ${renderTropaEquipable(hero, session.selectedItem, session.state.characters)}`;

  // Con uno solo también (#17): con `<= 1` la lista aparecía al contratar el
  // segundo y se iba al perderlo, y con ella el sitio donde mirar quién duerme.
  const listaHeroes =
    heroes.length === 0
      ? NADA
      : html`<h3>Héroes</h3><div class="stack-list">${unir(
          heroes.map((h) => {
            const elegido = h.id === hero?.id;
            const duerme = session.estaDormido(h.id)
              ? html` <span class="duerme">· duerme</span>`
              : NADA;
            return html`<button data-action="select-hero" data-hero="${h.id}" class="stack${elegido ? ' primary' : ''}">
              <span>${h.name}${duerme}</span><span class="count">${h.movePoints}</span>
            </button>`;
          }),
        )}</div>`;

  const pueblos = session.myTowns();
  const listaPueblos =
    pueblos.length === 0
      ? NADA
      : html`<h3>Castillos</h3><div class="stack-list">${unir(
          pueblos.map(
            (t) => html`<button data-action="open-town" data-town="${t.id}" class="stack">
              <span>${t.name}</span><span class="count">+${dailyIncome(t)}</span>
            </button>`,
          ),
        )}</div>`;

  return html`${fin}${heroPanel}${listaHeroes}${listaPueblos}
    <h3>Crónica</h3>${renderLog(session.cronica(60), session.viewer)}`;
}

/**
 * «Dormir» o «Despertar»: un héroe dormido no lo ofrece «Siguiente héroe» ni
 * cuenta en la pregunta de fin de turno (#17). Mandarlo a andar lo despierta.
 */
function botonDeSueño(session: Session, hero: Hero): Html {
  const duerme = session.estaDormido(hero.id);
  return html`<button data-action="sleep-hero" data-hero="${hero.id}" class="dormir"
    title="${duerme ? 'Vuelve a contar con él al pasar el turno' : 'No se le esperará al pasar el turno'}">${duerme ? 'Despertar' : 'Dormir'}</button>`;
}

/**
 * La historia que el narrador le escribió al héroe nacido de la tropa, o nada:
 * el inicial y el contratado no tienen. Es texto del agente y sale por la puerta
 * como todo; la comparten el panel del cliente y el del espectador.
 */
export function historiaDelHeroe(historia: string | null): Html {
  return historia === null ? NADA : html`<p class="cost historia">${historia}</p>`;
}

/**
 * La experiencia del héroe con el umbral del rango siguiente: «176 000 / 304 000». El
 * héroe no tiene tope, así que siempre hay siguiente —y si la tabla se acabara,
 * `umbral` lo diría lanzando en vez de pintar un «null»—; el umbral lo da el
 * núcleo —una sola tabla para tropa y héroe— y el panel no sabe cuánto cuesta
 * un rango.
 */
function experienciaDeHeroe(experiencia: number): string {
  return `${conMiles(experiencia)} / ${conMiles(umbral(rangoDe(experiencia) + 1))}`;
}

/**
 * Una fila de hechizo: nombre —con su nivel donde importa— y coste en maná. La
 * pintan el libro del héroe y la lista del gremio, que solo se diferencian en
 * eso. El tercer pintor, `renderSpells`, NO entra aquí: son botones con
 * `disabled` y `title`, y forzarlos en este molde saldría más caro que la copia.
 */
function filaHechizo(s: Spell, conNivel = false): Html {
  const nivel = conNivel ? html` <span class="count">n.${s.level}</span>` : NADA;
  return html`<div class="stack"><span>${s.name}${nivel}</span><span class="count">${s.cost}</span></div>`;
}

/**
 * El libro de un héroe: nombre y coste, que es lo que se decide con ellos. En
 * el orden del libro (`enOrdenDelLibro`) y no en el que se aprendió: el héroe
 * inicial y uno contratado con los mismos hechizos los enseñaban distinto (#54).
 */
function renderSpellbook(spells: readonly string[]): Html {
  if (spells.length === 0) {
    return html`<div class="stack-list"><div class="stack empty">Sin hechizos: llévalo a un castillo con gremio</div></div>`;
  }
  const filas = unir(enOrdenDelLibro(spells).map((s) => filaHechizo(s)));
  return html`<div class="stack-list">${filas}</div>`;
}

/**
 * El rango de un veterano, su nivel y lo que le falta para el rango siguiente, o
 * nada si es una fila de novatos: «Rango 3 · nivel 4». Las cifras salen de
 * `troopSummary` y el nivel de `nivelDeUnidad`: el panel no sabe qué umbral
 * tiene cada rango ni cómo se mide un nivel.
 */
function lineaDeVeterania(g: TroopGroup): Html {
  if (g.veterania === undefined) return NADA;
  const exp = conMiles(g.veterania.experiencia);
  const falta =
    g.siguiente === null ? `${exp} exp · rango máximo` : `${exp} / ${conMiles(g.siguiente)} exp`;
  // «Veterano» desde el rango 2: a punto del primer umbral todavía es un novato
  // que ha empezado a aprender, y llamarlo veterano sería mentirle.
  const nivel = `nivel ${nivelDeUnidad(g.unit)}`;
  const quien = g.rango >= 2 ? `Veterano · rango ${g.rango} · ${nivel}` : `Rango 1 · ${nivel}`;
  return html`<span class="veterania">${quien} · ${falta}</span>`;
}

/**
 * Lo que lleva puesto el individuo de una fila, en una línea, o nada. Solo la
 * puede tener una fila de uno —quien lleva algo tiene hoja y va solo
 * (`troopSummary`)—, y por eso basta con mirar su hoja. Con `heroId`, debajo va
 * una línea aparte con un botón por pieza para devolverla a la mochila de ese
 * héroe: **una sola línea de equipo**, con o sin los botones.
 *
 * Los botones no van dentro de «Lleva:»: metidos entre los nombres eran «×» de
 * tamaño completo con la coma pegada detrás («[×] , Cota de malla»). En su línea
 * llevan el nombre de lo que quitan, que es lo que el «×» solo no decía.
 */
function lineaDeEquipo(g: TroopGroup, heroId?: string): Html {
  const hoja = g.veterania;
  if (hoja === undefined) return NADA;
  const puestas = HUECOS.flatMap((hueco) => {
    const id = hoja.equipo?.[hueco];
    return id === undefined ? [] : [{ hueco, nombre: pieza(id).nombre }];
  });
  if (puestas.length === 0) return NADA;
  const lleva = html`<span class="veterania">Lleva: ${puestas.map((p) => p.nombre).join(', ')}</span>`;
  if (heroId === undefined) return lleva;
  const botones = unir(
    puestas.map(
      (p) =>
        html`<button data-action="unequip" data-hero="${heroId}" data-slot="${p.hueco}" data-veteran="${hoja.id}" title="Quitársela y guardarla en la mochila">× ${p.nombre}</button>`,
    ),
  );
  return html`${lleva}<span class="quitar-equipo">${botones}</span>`;
}

/**
 * Una fila de la tropa: el nombre, la marca de tirador, la veteranía, lo que
 * lleva y el recuento, con lo que cada panel le añada —un botón al lado del
 * recuento, los «×» del equipo—. **La única fila de tropa**: la comparten la del
 * mapa, la que licencia y la que equipa.
 */
function filaDeTropa(
  g: TroopGroup,
  extras: { readonly boton?: Html; readonly quitarDe?: string } = {},
): Html {
  const marca = isShooter(g.unit) ? ' ↑' : '';
  return html`<div class="stack"><span>${g.unit.name}${marca}${lineaDeVeterania(g)}${lineaDeEquipo(g, extras.quitarDe)}</span><span class="count">${g.count}${extras.boton ?? NADA}</span></div>`;
}

/**
 * El equipo del héroe —los cuatro huecos, con «×» para quitar— y su mochila, donde
 * cada pieza se pulsa para elegirla y ponérsela a alguien. Sin reglas: el motivo
 * de un rechazo lo escribe el núcleo y sale en la barra.
 */
function renderEquipoDelHeroe(hero: Hero, elegida: string | null): Html {
  const huecos = unir(
    HUECOS.map((hueco) => {
      const id = hero.equipo[hueco];
      if (id === undefined) {
        return html`<div class="stack empty"><span>${NOMBRE_DE_HUECO[hueco]}: —</span></div>`;
      }
      const p = pieza(id);
      return html`<div class="stack"><span>${NOMBRE_DE_HUECO[hueco]}: ${p.nombre}<span class="veterania">${modificadoresEnPantalla(p)}</span></span><span class="count"><button data-action="unequip" data-hero="${hero.id}" data-slot="${hueco}" title="Quitársela y guardarla en la mochila">×</button></span></div>`;
    }),
  );
  const mochila =
    hero.mochila.length === 0
      ? html`<div class="stack empty"><span>Vacía: el botín y lo que compres caen aquí</span></div>`
      : unir(
          hero.mochila.map((id) => {
            const p = pieza(id);
            const marca = id === elegida ? ' ◆' : '';
            return html`<button data-action="select-item" data-item="${id}" class="stack" title="Elegirla para ponérsela a alguien">
              <span>${p.nombre}${marca}<span class="veterania">${NOMBRE_DE_HUECO[p.hueco]} · ${modificadoresEnPantalla(p)}</span></span>
            </button>`;
          }),
        );
  const ponersela =
    elegida === null
      ? NADA
      : html`<button data-action="equip" data-hero="${hero.id}" class="primary">Ponérsela a ${hero.name}</button>
        <p class="cost">O pulsa «Equipar» en una fila de la tropa.</p>`;
  return html`<h3>Equipo</h3><div class="stack-list">${huecos}</div>
    <h3>Mochila · ${hero.mochila.length}</h3><div class="stack-list">${mochila}</div>${ponersela}`;
}

/**
 * La tropa del héroe en el mapa, con lo que lleva cada uno y, si hay una pieza
 * elegida, un «Equipar» por fila. En la fila de un individuo con hoja se le pone
 * a ÉL (`veteran`); en la de novatos, al primero sin equipar de ese tipo
 * (`creature`), que es a quien se la pone el núcleo (`quienRecibe`).
 */
function renderTropaEquipable(hero: Hero, elegida: string | null, characters: Personajes): Html {
  if (hero.army.length === 0) return renderArmy(hero.army, characters);
  // A quién iría la pieza desde esta fila lo dice el núcleo (`destinoDeEquipo`):
  // el de hoja, por su id; una fila de novatos, por su tipo. Un personaje no.
  const boton = (g: TroopGroup): Html => {
    if (elegida === null || g.member !== undefined) return NADA;
    if (g.veterania !== undefined) {
      return html` <button data-action="equip" data-hero="${hero.id}" data-veteran="${g.veterania.id}">Equipar</button>`;
    }
    return 'motivo' in destinoDeEquipo(hero, { creature: g.creature })
      ? NADA
      : html` <button data-action="equip" data-hero="${hero.id}" data-creature="${g.creature}">Equipar</button>`;
  };
  const filas = unir(
    troopSummary(hero.army, characters).map((g) =>
      filaDeTropa(g, { boton: boton(g), quitarDe: hero.id }),
    ),
  );
  return html`<div class="stack-list">${filas}</div>`;
}

/**
 * El ejército agrupado: una fila por criatura con cuántos individuos lleva, y
 * una por personaje o por veterano, con su nivel y lo que le falta. Agrupa
 * `troopSummary`, no este panel.
 */
function renderArmy(army: Army, characters: Personajes): Html {
  if (army.length === 0) {
    return html`<div class="stack-list"><div class="stack empty"><span>—</span></div></div>`;
  }
  const filas = unir(troopSummary(army, characters).map((g) => filaDeTropa(g)));
  return html`<div class="stack-list">${filas}</div>`;
}

/**
 * La tropa del héroe que está en su castillo, con un botón por criatura para
 * licenciar uno: es donde se cambia tropa barata por otra mejor. Un personaje
 * va sin botón, porque no se licencia, y un veterano solo lo lleva si es él
 * quien se iría. Sin comprobar reglas: si no se puede,
 * lo dice el núcleo en la barra.
 */
function renderTropaLicenciable(heroId: string, army: Army, characters: Personajes): Html {
  if (army.length === 0) return renderArmy(army, characters);
  const grupos = troopSummary(army, characters);
  // `dismiss` licencia POR TIPO, y de cada tipo se va primero quien diga
  // `elQueSeIria`. Así que el botón va solo en la fila de quien se iría de
  // verdad: puesto en la de un veterano con novatos de su tipo detrás, el clic
  // se habría llevado a otro sin decirlo.
  const seIria = (g: TroopGroup): boolean => {
    if (g.member !== undefined) return false;
    const t = elQueSeIria(army, g.creature);
    return t !== null && t.veterania?.id === g.veterania?.id;
  };
  const filas = unir(
    grupos.map((g) =>
      filaDeTropa(g, {
        boton: seIria(g)
          ? html` <button data-action="dismiss" data-hero="${heroId}" data-creature="${g.creature}" title="Licenciar uno: de cada tipo se va primero el de menos experiencia">−1</button>`
          : NADA,
      }),
    ),
  );
  return html`<div class="stack-list">${filas}</div>`;
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
      return html`<div class="stack"><span>${p.nombre}<span class="veterania">${NOMBRE_DE_HUECO[p.hueco]} · ${modificadoresEnPantalla(p)}</span></span><span class="count">${describirCoste({ gold: p.precio })} <button data-action="buy-item" data-item="${p.id}" title="${motivo ?? 'Comprarla para la mochila del héroe que está dentro'}">Comprar</button></span></div>`;
    }),
  );
  return html`<h3>Armería</h3><div class="stack-list">${filas}</div>
    <p class="cost">Lo comprado va a la mochila del héroe que está dentro; pónselo desde su panel.</p>`;
}

// ---------------------------------------------------------------- castillo

/**
 * El panel del castillo: lo que se abrió en la base (`views/base.ts`) arriba y
 * lo general debajo. Contratar héroe va en lo general, con taberna o sin ella:
 * `hireHero` no la pide, y atarlo a un edificio sería una regla escrita en la
 * pantalla (crítica del ciclo de la base caminable).
 */
function renderTownPanel(session: Session, abierto: Abierto | null): Html {
  const town = session.activeTown;
  if (town === null) return NADA;

  // Solo los héroes PROPIOS: un rival parado en tu castillo no te enseña su
  // ejército, y sobre todo no esconde tu guarnición.
  const heroeAqui = session.heroeEnLaBase() ?? undefined;
  const contratar =
    heroeAqui === undefined
      ? html`<button data-action="hire-hero" class="primary" style="margin-top:.7rem">Contratar héroe (2500 oro)</button>`
      : html`<p class="cost">${heroeAqui.name} ya está dentro: contrata otro cuando salga.</p>`;

  // El `crecimiento || '<div…>Sin moradas</div>'` de antes no vale con marcado:
  // un fragmento vacío es un OBJETO, y `||` lo da por bueno siempre. Se pregunta
  // por lo que de verdad decide —si hay moradas—, que además es lo que se quería
  // decir.
  const moradas = dwellings(town);
  const crecimiento =
    moradas.length === 0
      ? html`<div class="stack empty">Sin moradas</div>`
      : unir(
          moradas.map(({ creature: id }) => {
            const info = unidadDelJuego(id);
            return html`<div class="stack"><span>${info.name}</span><span class="count">+${info.growth}</span></div>`;
          }),
        );

  return html`${renderAbierto(session, town, abierto, {
    hechizos: renderTownSpells(town),
    armeria: renderArmeria(session, town),
    contratar,
  })}
    <h2>${town.name}</h2>
    <div class="row"><span class="label">Ingresos</span><span>${dailyIncome(town)} oro/día</span></div>
    <div class="row"><span class="label">Gremio de magia</span><span>${mageGuildLevel(town) || '—'}</span></div>
    <div class="row"><span class="label">Construir hoy</span><span>${town.builtToday ? 'ya hecho' : 'disponible'}</span></div>
    <p class="cost">Pulsa el ayuntamiento para ampliar la base, una morada para reclutar, un edificio para ver lo suyo o a alguien para hablar.</p>

    <h3>Edificios</h3>
    <div class="stack-list ir-a-sitio">${renderListaDeEdificios(session)}</div>

    <h3>Crecimiento semanal</h3>
    <div class="stack-list">${crecimiento}</div>

    <h3>Guarnición</h3>
    ${filaLiderazgo(session.liderazgo({ guarnicion: town.id }))}
    ${renderArmy(town.garrison, session.state.characters)}

    ${
      heroeAqui === undefined
        ? html`<p class="cost">Sin héroe dentro, lo que reclutes se queda de guarnición.</p>
          ${contratar}`
        : html`${renderLibroEnElCastillo(session, heroeAqui, town)}<h3>Tropa del héroe</h3>
          ${filaLiderazgo(session.liderazgo({ heroe: heroeAqui.id }))}
          <p class="cost">Lo que reclutes va a su tropa, hasta su liderazgo. Licencia lo que sobre para hacer sitio a algo mejor.</p>
          ${renderTropaLicenciable(heroeAqui.id, heroeAqui.army, session.state.characters)}`
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
          .map((s) => s.name)
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

// ---------------------------------------------------------------- batalla

function renderBattlePanel(session: Session, contandoAun: boolean): Html {
  const battle = session.battle;
  if (battle === null) return NADA;

  // El bando de la persona lo DERIVA la sesión del dueño de la batalla; aquí no
  // se supone. Decir «Tú» al atacante era la misma suposición que el ciclo de
  // #29 quitó del servidor, y le habría cantado «Victoria» a quien acababa de
  // perder el castillo el primer día que la persona defienda.
  const mio = session.miBando;

  if (battle.finished !== null) {
    const gane = battle.finished.winner === mio;
    // Rendirse no es caer: el héroe vuelve a la base con la tropa que salvó.
    // Quien se rinde es siempre el que pierde, así que en la derrota basta con
    // saber si hubo rendición.
    const rendicion = battle.finished.surrender;
    const derrota =
      rendicion === undefined
        ? 'Tu héroe ha caído.'
        : `Te has rendido por ${rendicion.gold} de oro: tu héroe vuelve a la base con la tropa viva.`;
    return html`<h2>${gane ? 'Victoria' : 'Derrota'}</h2>
      <p>${gane ? 'El campo es tuyo.' : derrota}</p>
      ${gane || rendicion !== undefined ? filaManaDeBatalla(session) : NADA}
      <h3>Parte de guerra</h3>${renderBattleLog(battle, mio)}`;
  }

  const s = activeStack(battle);
  const activo =
    s === null
      ? html`<p>Sin unidad activa.</p>`
      : html`<h2>${nombreEnElCampo(battle, s)}</h2>
        <div class="row"><span class="label">Bando</span><span>${s.side === mio ? 'Tú' : 'Enemigo'}</span></div>
        <div class="row"><span class="label">Efectivos</span><span>${s.count}</span></div>
        <div class="row"><span class="label">Moral / Suerte</span><span>${s.morale} / ${effectiveLuck(s)}</span></div>`;

  const suTurno = s !== null && s.side === mio;
  const acciones = suTurno
    ? apagadosPor(
        motivoParaApagar(session, contandoAun),
        accionesDeLaUnidad({
          activa: s,
          carga: cifrasDeCarga(s.unit),
          legales: session.battleLegalActions(),
          pasos: session.battleStepsLeft(),
          rendicion: renderRendicion(session),
          // Una base que se defiende sola (#116) no tiene héroe: no hay libro que
          // enseñar, y «Este héroe no conoce ninguno» hablaba de uno que no está.
          hechizos:
            battle.heroes[s.side] === null
              ? SIN_HEROE_EN_LA_BATALLA
              : renderSpells(session.hechizos.selectedSpell, session.spellOptions()),
          // Las batallas del mapa no tienen muralla (decisión 4 de la tarea del
          // combate en el juego).
          muralla: NADA,
          poderes: botonesDePoder(session, s),
        }),
      )
    : html`<p>Turno del enemigo…</p>`;

  // El maná del héroe, junto a la ficha de la unidad activa: es un recurso de la
  // batalla entera, no del stack, y sin verlo no se decide si lanzar.
  const mana = filaManaDeBatalla(session);

  const orden = listaDelCampo(battle, (x) => ({
    flecha: x.side === mio ? '▶' : '◀',
    nombre: `${marcaDeComandante(x)}${nombreEnElCampo(battle, x)}${marcaDeVeterano(x)}`,
    cuenta: x.count,
  }));

  return html`${activo}
    <div class="row"><span class="label">Ronda</span><span>${battle.round}</span></div>
    ${mana}
    ${acciones}
    <h3>En el campo</h3><div class="stack-list">${orden}</div>
    <h3>Parte de guerra</h3>${renderBattleLog(battle, mio)}`;
}

/**
 * La fila de Maná del héroe de la persona en la batalla, o nada si no lleva.
 * Sale también al terminar, si el héroe sigue en pie (ganó o se rindió): ese
 * número es el que decide si toca volver al castillo a dormir, y la fila
 * desaparecía justo entonces (#54). Con el héroe caído no hay nada que decidir.
 */
function filaManaDeBatalla(session: Session): Html {
  const heroe = session.battleHero;
  return heroe === null
    ? NADA
    : html`<div class="row"><span class="label">Maná</span><span>${heroe.mana} / ${maxMana(heroe)}</span></div>`;
}

/**
 * Lo que puede hacer la unidad activa de la persona: las casillas que le quedan,
 * los tres botones —valen o no según la lista legal, no una regla copiada aquí:
 * tras moverse ya no se defiende ni se espera (decisión del usuario)— y la
 * ayuda, con la de la carga si la unidad carga. Lo comparten la partida y la
 * arena; la partida añade la rendición y el libro, que la arena no tiene.
 *
 * Las líneas de la plantilla conservan su sangría de cuando vivían dentro de
 * `renderBattlePanel`: es marcado que el ancla de `test/fixtures/paneles.txt`
 * compara byte a byte.
 */
export function accionesDeLaUnidad(o: {
  readonly activa: BattleStack;
  /** Con qué cifras carga la activa (`cifrasDeCarga`): todo el que pega cuerpo a cuerpo. */
  readonly carga: CifrasDeCarga;
  readonly legales: readonly BattleAction[];
  readonly pasos: number | null;
  readonly rendicion: Html;
  readonly hechizos: Html;
  /** Los botones de los poderes de la unidad (Curar, Bendecir: `botonesDePoder`); sin ellos, `NADA`. */
  readonly poderes: Html;
  /**
   * Los botones de la muralla —«Abrir puerta» y «Cerrar puerta», «Poner
   * escalera» y «Subir»—, donde la hay (la arena); si no, `NADA`.
   */
  readonly muralla: Html;
  /**
   * Por qué no puede salir de su casilla, como frase (`contactoBlocker`: rodeada,
   * lo que le queda no paga salir del contacto), o nada. Va en la misma
   * línea del marcado que lo que le queda: sin él, el ancla de
   * `test/fixtures/paneles.txt` no cambia.
   */
  readonly sinSalida?: string | null;
  /**
   * Si ha golpeado con Finta y le queda solo el tramo de andar (la rueda de la
   * arena): la ayuda lo dice en vez de invitar a golpear (R2 de QA de #263).
   */
  readonly trasLaFinta?: boolean;
}): Html {
  const puede = (tipo: BattleAction['type']): boolean => o.legales.some((a) => a.type === tipo);
  const quedan = o.pasos === null ? null : quedanCasillas(o.pasos);
  const sinSalida =
    o.sinSalida == null ? NADA : html`<p class="cost" data-sin-salida>${o.sinSalida}</p>`;
  // La ayuda dice lo que se puede hacer: tras la Finta, solo andar un tramo; rodeada,
  // solo golpear a quien tiene al lado (C2 de QA de #259: no hay hexágonos verdes).
  const ayuda =
    o.trasLaFinta === true
      ? html`Finta: puede andar ${quedan === null ? 'lo que le queda' : quedan[1]}; andar termina el turno.`
      : o.sinSalida != null
        ? html`Pasa el ratón por un enemigo a su lado para golpearlo.`
        : html`Haz clic en un hexágono verde para moverte —puedes moverte en varios tramos—,
         o pasa el ratón por un enemigo y elige desde qué casilla golpearlo.
         ${ayudaDeCarga(o.carga)}`;
  return html`<h3>Acciones</h3>
       ${quedan === null ? NADA : html`<div class="row"><span class="label">Le ${quedan[0]}</span><span>${quedan[1]}</span></div>`}${sinSalida}
       <div class="stack-list">
         <button data-action="battle-end-turn">Terminar turno</button>
         <button data-action="battle-defend" ${puede('defend') ? NADA : DESHABILITADO}>Defender</button>
         <button data-action="battle-wait" ${puede('wait') ? NADA : DESHABILITADO}>Esperar</button>
         ${o.rendicion}${o.muralla}${o.poderes}
       </div>
       ${o.hechizos}
       <p class="cost" style="margin-top:.5rem"${o.trasLaFinta === true ? html` data-tras-la-finta` : NADA}>
         ${ayuda}
         Espacio termina el turno de la unidad.
       </p>`;
}

/**
 * «En el campo»: una fila por unidad en pie, la activa resaltada. Qué dice cada
 * fila lo pone quien llama —la partida, «Tú/Enemigo» y efectivos; la arena, los
 * PV y quién la mueve—; la forma es una.
 */
export function listaDelCampo(
  battle: BattleState,
  fila: (x: BattleStack) => {
    readonly flecha: string;
    readonly nombre: string;
    readonly cuenta: string | number;
    /** Un botón al final de la fila (la arena: «Editar»); sin él, nada. */
    readonly boton?: Html;
  },
): Html {
  return unir(
    battle.stacks
      .filter((x) => x.count > 0)
      .map((x) => {
        const f = fila(x);
        return html`<div class="stack${x.id === battle.turno?.stack ? '' : ' empty'}">
          <span>${f.flecha} ${f.nombre}</span>
          <span class="count">${f.cuenta}</span>${f.boton ?? NADA}
        </div>`;
      }),
  );
}

/**
 * La corona delante del nombre del comandante: la misma que lleva en el
 * tablero (`MARCA_DE_COMANDANTE`), para que la figura y su fila se reconozcan
 * como la misma pieza. Texto, y no marcado: la pone `html` en su hueco.
 */
export function marcaDeComandante(s: BattleStack): string {
  return s.origen.kind === 'heroe' ? `${MARCA_DE_COMANDANTE} ` : '';
}

/**
 * El rango de un veterano detrás de su nombre en «En el campo», o nada: la fila
 * dice con palabras lo que la figura dice con galones (`galonesDe`, en
 * `render/batalla.ts`, que este módulo no importa: es puro y lo carga el
 * espectador sin lienzo).
 */
export function marcaDeVeterano(s: BattleStack): string {
  const rango = rangoDeVeterania(s.origen);
  return rango > 1 ? ` · rango ${rango}` : '';
}

/**
 * El botón de rendirse, con su precio. Apagado y con el motivo en el `title`
 * cuando no se puede —sin base, defendiéndola o sin oro—, igual que un hechizo:
 * la frase la escribe el núcleo (`surrenderBlocker`).
 */
function renderRendicion(session: Session): Html {
  const opcion = session.surrenderOption();
  if (opcion === null) return NADA;
  const rotulo = `Rendirse (${opcion.coste} oro)`;
  return opcion.motivo === null
    ? html`<button data-action="battle-surrender">${rotulo}</button>`
    : html`<button data-action="battle-surrender" ${DESHABILITADO} title="${opcion.motivo}">${rotulo}</button>`;
}

/** La sección de hechizos de un bando sin héroe en la batalla: nadie lanza. */
const SIN_HEROE_EN_LA_BATALLA = html`<h3>Hechizos</h3>
  <div class="stack-list"><div class="stack empty">Sin héroe en esta batalla: nadie lanza hechizos</div></div>`;

/**
 * El libro de hechizos durante la batalla.
 *
 * Lo que no se puede lanzar sale apagado y con el motivo en el `title`: se ve a
 * la vez lo que tienes y lo que te falta, igual que un solar vacío del castillo.
 * Ni el `castable` ni el motivo se deciden aquí — los da `spellOptions()` de la
 * sesión, la partida o la arena; `elegido` es el hechizo de su libro.
 */
export function renderSpells(elegido: string | null, opciones: readonly SpellOption[]): Html {
  if (opciones.length === 0) {
    return html`<h3>Hechizos</h3>
      <div class="stack-list"><div class="stack empty">Este héroe no conoce ninguno</div></div>`;
  }
  const botones = unir(
    opciones.map((o) => {
      // El elegido se marca con `primary`, no el resto con `empty`: `.empty` es
      // el gris de un hueco vacío, y con él un hechizo perfectamente lanzable se
      // veía apagado, igual que uno que no se puede pagar. Lo apagado lo pone
      // `button:disabled`, y así los dos estados no se confunden en pantalla.
      return html`<button data-action="battle-spell" data-spell="${o.id}"
        class="stack${elegido === o.id ? ' primary' : ''}"
        ${o.castable ? NADA : DESHABILITADO}
        title="${o.castable ? `Cuesta ${o.cost} de maná` : o.motivo}">
        <span>${o.name}</span><span class="count">${o.cost}</span>
      </button>`;
    }),
  );
  const opcion = opciones.find((o) => o.id === elegido);
  return html`<h3>Hechizos</h3><div class="stack-list">${botones}</div>
    ${opcion === undefined ? NADA : html`<p class="cost" style="margin-top:.5rem">${opcion.name}: pulsa sobre la unidad objetivo. Escape cancela.</p>`}`;
}

/**
 * Nombres de los RASGOS que ponen efectos. Los hechizos no están aquí: ya se
 * llaman a sí mismos en `data/spells.json`, y copiarlos era una segunda fuente
 * de verdad que se quedaría vieja al retocar el catálogo. Y ninguno lleva el
 * nombre de su criatura: el día que una segunda tenga `fear`, "Terror del
 * dragón óseo" sería mentira.
 */
const FUENTE_RASGO: Readonly<Record<string, string>> = {
  fear: 'Terror',
  curse_on_hit: 'Maldición al golpear',
};

/**
 * Cómo se llama en el parte lo que puso un efecto. Si no es un rasgo tiene que
 * ser un hechizo, y `spell()` lanza con un id desconocido: un origen sin nombre
 * es un fallo nuestro, no algo que disimular con el id crudo en pantalla.
 */
function nombreFuente(source: string): string {
  // Lo que deja un golpe de la rueda (Defensivo, Romper guardia, Finta), por el
  // nombre de su tipo.
  if (esTipoDeGolpe(source)) return NOMBRE_DE_GOLPE[source];
  return FUENTE_RASGO[source] ?? spell(source).name;
}

/**
 * Lo que dura un efecto colgado, dicho: «3 rondas», o, el de la rueda del golpe,
 * «hasta que empiece (o termine) su próximo turno» (`vence`, `duracion`); sus
 * rondas son solo el tope y contarlas sería mentir.
 */
export function duracionDeEfecto(e: {
  readonly rounds: number;
  readonly vence?: CuandoVence | undefined;
}): string {
  return e.vence === undefined ? `durante ${enRondas(e.rounds)}` : duracion(e.vence, 'su');
}

/**
 * Un efecto que lleva colgado un stack, dicho entero: quién lo puso, qué hace y
 * lo que le queda («Defensivo: defensa +1 hasta que empiece su próximo turno»).
 * Con las mismas tres piezas que el parte (`nombreFuente`, `cifraDeEfecto`,
 * `duracionDeEfecto`), que lo dice al colgarse; esto lo dice mientras dura (la
 * vista previa de la rueda, #261).
 */
export function efectoEnCurso(e: StackEffect): string {
  const dura = duracionDeEfecto({ rounds: e.roundsLeft, vence: e.hasta?.al });
  return `${nombreFuente(e.source)}: ${cifraDeEfecto(e.kind, e.amount)} ${dura}`;
}

/**
 * Lo que suma una pieza, pintado: un `.modificador` por cosa de
 * `modificadoresDePieza`, con su texto de `textoDeModificador` y la cifra en
 * `data-cifra` (la marca, en `data-marca`). La misma forma en la ficha de la
 * arena, el editor de equipo y los paneles del juego; donde no cabe marcado (un
 * `<option>`), `cifrasDePieza`, que es este mismo texto separado por comas.
 * `vacio`, lo que se dice si no suma nada.
 */
export function modificadoresEnPantalla(p: Pieza, vacio = 'no suma nada'): Html {
  const mods = modificadoresDePieza(p);
  if (mods.length === 0) return html`<span class="modificadores sin-modificadores">${vacio}</span>`;
  return html`<span class="modificadores">${unir(
    mods.map((m) =>
      m.kind === 'cifra'
        ? html`<span class="modificador" data-cifra="${m.cifra}">${textoDeModificador(m)}</span>`
        : html`<span class="modificador" data-marca="${m.marca}">${textoDeModificador(m)}</span>`,
    ),
  )}</span>`;
}

/**
 * Una nota de la ficha: la forma única de toda aclaración (13-10-2026, el
 * usuario: «cualquier aclaración o nota debe ir como tooltip»). Un «ⓘ» con su
 * texto en `aria-label`; `style.css` lo enseña en un bocadillo junto al «ⓘ» al
 * pasar el ratón, al tocarlo o con el foco del teclado en él. Sin `title`: el
 * navegador pintaba su tooltip encima del bocadillo. Se alcanza con el tabulador
 * salvo la de una fila de cifras (`enfocable: false`): entre casilla y casilla,
 * el tabulador caía en el «ⓘ» de la fila siguiente; esa la lleva su casilla en
 * `aria-description`, y con el ratón o el dedo se abre como las demás.
 */
export function nota(texto: string, enfocable = true): Html {
  return html`<span class="nota" tabindex="${enfocable ? '0' : '-1'}" role="note" aria-label="${texto}" data-nota="si">ⓘ</span>`;
}

/**
 * Verde lo que te suma, rojo lo que te resta, sin color lo que ni una cosa ni
 * otra. Devuelve el atributo entero —con su espacio delante— o nada, así que
 * `<div${clase(...)}>` no deja un `class=""` colgando cuando no hay color.
 *
 * Vive aquí y no dentro de `renderLog` porque nació dentro y a la vez había
 * CINCO copias escritas a mano de lo mismo: cuatro en el parte de batalla y una
 * en el fin de la partida. Un helper que no cubre ni a su propia rama es un
 * helper que no existe.
 */
function clase(bueno: boolean, malo: boolean): Html {
  return bueno ? html` class="win"` : malo ? html` class="lose"` : NADA;
}

/**
 * La línea de ayuda de la carga, con las cifras de la activa (`cifrasDeCarga`:
 * desde #260 carga todo el que pega cuerpo a cuerpo, y el jinete más). Se dice
 * siempre y no solo si hay casillas de carga ahora: el texto explica cómo se ve,
 * también el turno en que no sale ninguna.
 */
function ayudaDeCarga(carga: CifrasDeCarga): Html {
  // El número que enseña la casilla son las casillas que corre: sin un ejemplo fijo,
  // que con el jinete despistaba (C3 de QA de #260).
  return html`Al enemigo en naranja se le puede cargar: pasa por él y elige la casilla con
         «»» y las casillas que corre (de ${CARGA_MINIMA} a ${carga.tope}, +${carga.porcentaje} % cada una).`;
}

/**
 * El parte de guerra. `mio` es el bando de quien lo lee: sin él, «gana el
 * defensor» se pintaría en rojo de derrota aunque el defensor fueras tú.
 *
 * Toma la BATALLA y no su log, y es por una línea: un `perished` dice qué stack
 * cayó y no de quién era, así que sin los stacks delante no se puede pintar. Se
 * pintaba **siempre** en rojo de derrota, y la mitad de las veces la unidad
 * aniquilada era la del rival — la misma misatribución que `renderLog` acaba de
 * quitarse un piso más arriba, en el mismo fichero.
 *
 * Se exporta porque lo pinta también el espectador, que es quien de verdad
 * ejercita el `mio === null`: mira desde fuera y no lleva ninguno de los dos
 * bandos, así que no se le pinta ni victoria ni derrota. Esa rama existía desde
 * que existe la función y hasta hoy no la llamaba nadie.
 *
 * Y el `switch` ya no tiene `default`, por lo mismo que el de `renderLog`: se
 * tragaba en silencio los tres eventos que nadie escribió (`move`, `wait`,
 * `defend`) y se tragaría igual el que se añada mañana. Quien decide es el
 * `never` del final.
 *
 * La espera y la defensa tienen su línea desde #82: se callaban cuando la IA no
 * las jugaba nunca, y desde #52 espera en 49 de cada 100 batallas espejo (84
 * esperas en 100 semillas, 08-10-2026). Sin la línea, quien mira ve a una
 * unidad quedarse quieta sin saber que ha cedido la iniciativa a propósito.
 * Nombran a QUIÉN porque, a diferencia de un ataque, no dejan nada en el
 * tablero que lo diga.
 */
export function renderBattleLog(battle: BattleState, mio: Side | null): Html {
  /**
   * El stack del que habla un hecho. Lanza si no aparece: un id del registro
   * que no está en el campo es un fallo nuestro, y disimularlo con «una unidad»
   * sería volver a la misatribución por otro camino.
   */
  const stackDe = (id: string): BattleStack => {
    const s = battle.stacks.find((x) => x.id === id);
    if (s === undefined)
      throw new Error(`el parte habla de una unidad que no está en el campo: ${id}`);
    return s;
  };

  /**
   * «Arquero, de tu bando»: la unidad y su bando dicho desde quien lee. Sin
   * bando, el atacante o el defensor, como `surrender`.
   */
  const quienEs = (id: string): string => {
    const s = stackDe(id);
    const lado =
      mio === null
        ? `del ${s.side === 'attacker' ? 'atacante' : 'defensor'}`
        : s.side === mio
          ? 'de tu bando'
          : 'del enemigo';
    return `${nombreEnElCampo(battle, s)}, ${lado}`;
  };

  /**
   * El color de un hecho que es bueno o malo para la unidad que lo vive, dicho
   * desde quien lee: la moral alta del enemigo es mala noticia para ti. Se
   * pintaba por el signo, y su «Moral alta: turno extra» salía en verde (#198).
   *
   * Sin bando —espectador y arena— no se pinta: verde y rojo dicen «bien para
   * ti» y «mal para ti» en todo el parte (el final, la rendición, la unidad
   * aniquilada), y quien mira desde fuera no tiene un «ti». Pintarlo por bando
   * pedía un tercer código de color que se leería como victoria o derrota de
   * uno de los dos; el bando ya va escrito en la línea («del atacante»).
   */
  /**
   * Quién da o recibe un golpe: «Piquero B». El bando va solo cuando el nombre
   * está en los dos lados —la batalla espejo, con Piquero A en cada uno—, porque
   * ahí «Piquero A → Piquero A» no dice nada; en lo demás, el tablero y la
   * columna «En el campo» ya dicen de quién es cada cual y una línea de ataque
   * con dos «, del enemigo» dentro no cabía en la caja.
   */
  const quien = (id: string): string => {
    const s = stackDe(id);
    const nombre = nombreEnElCampo(battle, s);
    const enLosDos = battle.stacks.some((x) => x.side !== s.side && x.unit.name === s.unit.name);
    if (!enLosDos) return nombre;
    const lado =
      mio === null
        ? s.side === 'attacker'
          ? 'atacante'
          : 'defensor'
        : s.side === mio
          ? 'tuyo'
          : 'enemigo';
    return `${nombre} (${lado})`;
  };

  /**
   * «Piquero B → Esqueleto A»: quién a quién (#18). El espacio de antes de la
   * flecha es duro para que la flecha no abra nunca una línea en la caja
   * estrecha del parte, lejos de quien la lanza.
   */
  const golpe = (de: string, a: string): string => `${quien(de)}\u00a0→ ${quien(a)}`;

  /** «1 baja», «3 bajas»: «1 bajas» salía en cada golpe que mataba a uno. */
  const bajas = (n: number): string => `${n} ${n === 1 ? 'baja' : 'bajas'}`;

  /**
   * El daño de un hecho con lo que paró la armadura (#262): «12 de
   * daño (−7 armadura), 1 baja», o «0 de daño: la armadura para los 18» si no
   * llegó nada. Sin armadura, lo de siempre. Con «lo para la armadura (18)» el 18
   * se leía como la armadura, y es el golpe parado (A2 de QA de #262); la
   * armadura no se escribe: un retoque a media pelea la cambiaría en las líneas
   * de antes.
   */
  const danio = (d: number, muertos: number, parado: number | undefined): string => {
    if (parado === undefined) return `${d} de daño, ${bajas(muertos)}`;
    if (d === 0) return `0 de daño: la armadura para los ${parado}`;
    return `${d} de daño (−${parado} armadura), ${bajas(muertos)}`;
  };

  const paraQuienLee = (id: string, buenoParaSuBando: boolean): Html => {
    if (mio === null) return NADA;
    const bueno = (stackDe(id).side === mio) === buenoParaSuBando;
    return clase(bueno, !bueno);
  };

  const ultimos = battle.log.slice(-40);
  const desde = battle.log.length - ultimos.length;
  const lineas = ultimos
    .map((e, i): Html => {
      switch (e.kind) {
        case 'round_start':
          return html`<div>— Ronda ${e.round} —</div>`;
        // Quién a quién (#18): «Ataque: 12 de daño, 3 bajas» no decía ni lo uno
        // ni lo otro, y en una ronda con siete unidades por bando no había forma
        // de casar la línea con el tablero. El modo va entre paréntesis detrás,
        // porque lo que se busca al leer es el nombre.
        case 'attack': {
          const modo = `${e.retaliation ? ' (contraataque)' : ''}${
            e.charge === undefined
              ? ''
              : ` (${dichoDeLaCarga(e.charge, cifrasDeCarga(stackById(battle, e.stack).unit))})`
          }`;
          return html`<div>${golpe(e.stack, e.target)}${modo}: ${danio(e.damage, e.killed, e.parado)}</div>`;
        }
        case 'shoot':
          return html`<div>${golpe(e.stack, e.target)} (${e.splash === true ? 'salpicadura' : 'disparo'}): ${danio(e.damage, e.killed, e.parado)}</div>`;
        case 'cast': {
          // El nombre, no el id: `spell()` ya lo tiene y quien lee el parte no
          // sabe qué es un "magic_arrow". Quien lanza es siempre el héroe de su
          // bando, así que basta con el bando.
          const lanza =
            mio === null
              ? `El ${e.side === 'attacker' ? 'atacante' : 'defensor'} lanza`
              : e.side === mio
                ? 'Lanzas'
                : 'El enemigo lanza';
          const sobre = e.target === undefined ? '' : ` sobre ${quien(e.target)}`;
          const efecto =
            e.damage || e.parado !== undefined
              ? `: ${danio(e.damage ?? 0, e.killed ?? 0, e.parado)}`
              : '';
          return html`<div>${lanza} ${spell(e.spell).name}${sobre}${efecto}</div>`;
        }
        case 'power': {
          // Lo que deja Bendecir va detrás en su propia línea (`effect`); aquí,
          // quién a quién y, si cura, cuánto.
          const p = poder(e.poder);
          const cura = e.cura === undefined ? '' : `: cura ${e.cura} PV`;
          return html`<div${paraQuienLee(e.target, true)}>${quienEs(e.stack)}, usa ${p.nombre} sobre ${quien(e.target)}${cura}</div>`;
        }
        // La arena cambió unas cifras a media pelea (el editor): no es una
        // jugada, pero desde aquí la pelea se juega con las nuevas. Entre
        // paréntesis y con «;», porque un cambio de lista ya lleva sus dos
        // puntos y sus comas («habilidades: + Salto, − Bendecir»).
        case 'retoque':
          return html`<div>Cambian las cifras de ${e.nombre} a media pelea${e.cambios.length === 0 ? '' : ` (${e.cambios.join('; ')})`}</div>`;
        // La moral, la suerte y los efectos dicen de quién: con el color puesto
        // desde quien lee, una línea verde sin nombre no deja saber si es la
        // moral de los tuyos o la mala suerte del rival.
        case 'morale':
          return html`<div${paraQuienLee(e.stack, e.good)}>${e.good ? 'Moral alta' : 'Moral baja'} de ${quienEs(e.stack)}: ${e.good ? 'turno extra' : 'turno perdido'}</div>`;
        case 'luck':
          return html`<div${paraQuienLee(e.stack, e.good)}>${e.good ? 'Golpe afortunado' : 'Golpe desafortunado'} de ${quienEs(e.stack)}</div>`;
        case 'effect':
          return html`<div${paraQuienLee(e.stack, e.amount >= 0)}>${nombreFuente(e.source)} sobre ${quienEs(e.stack)}: ${cifraDeEfecto(e.effect, e.amount)} ${duracionDeEfecto(e)}</div>`;
        // La rueda del golpe: qué eligió cada uno y dónde cayó,
        // antes de las líneas del golpe. El contraataque, solo si lo hubo.
        case 'cruce': {
          const devuelto = contraataqueDelCruce(battle.log, desde + i);
          const contra = devuelto === null ? '' : `; contraataque ${NOMBRE_DEL_PUNTO[devuelto]}`;
          return html`<div class="cruce">${golpe(e.stack, e.target)}, ${NOMBRE_DE_GOLPE[e.golpe]} contra ${NOMBRE_DE_GOLPE[e.respuesta]}: ${NOMBRE_DEL_PUNTO[e.punto]}${contra}</div>`;
        }
        case 'effect_end':
          return html`<div>Se disipa ${nombreFuente(e.source)} de ${quienEs(e.stack)}</div>`;
        case 'immune':
          return html`<div>${quienEs(e.stack)}, inmune a ${nombreFuente(e.source)}: los no-muertos no tienen ánimo que quebrar</div>`;
        case 'perished': {
          // Quién cae decide el color, igual que en `hero_defeated` un piso más
          // arriba: lo tuyo es la derrota y lo suyo la victoria. Sin bando —el
          // parte de quien no lleva ninguno de los dos— no se pinta ninguna de
          // las dos cosas, en vez de inventarse una.
          const suya = stackDe(e.stack).side === mio;
          return html`<div${clase(mio !== null && !suya, suya)}>Aniquilada la unidad ${quienEs(e.stack)}</div>`;
        }
        case 'surrender': {
          // Quien se rinde pierde: en rojo si eres tú, en verde si es el rival,
          // y sin color si no llevas bando. El precio está una vez, en `finished`.
          const precio = battle.finished?.surrender?.gold;
          if (precio === undefined) {
            throw new Error('el parte cuenta una rendición y la batalla no dice qué costó');
          }
          const tuya = e.side === mio;
          return html`<div${clase(mio !== null && !tuya, tuya)}>${
            mio === null
              ? `Se rinde el ${e.side === 'attacker' ? 'atacante' : 'defensor'}`
              : tuya
                ? 'Te rindes'
                : 'El enemigo se rinde'
          } por ${precio} de oro</div>`;
        }
        case 'finished':
          return html`<div${clase(e.winner === mio, mio !== null && e.winner !== mio)}>Fin: gana el ${e.winner === 'attacker' ? 'atacante' : 'defensor'}</div>`;

        case 'wait':
          // Lo que hace `applyAction`: la manda al final de `state.queue` de
          // esta ronda. No se promete que vuelva a actuar: 1 de cada 5 veces la
          // destruyen o se acaba la batalla antes (#52).
          return html`<div>Espera ${quienEs(e.stack)}: cede la iniciativa y pasa al final de la ronda</div>`;
        case 'defend':
          // La cifra sale de la constante que la aplica (`effectiveDefense`), y
          // dura lo que dura `defending`: `beginRound` la apaga. El espacio antes
          // del % es duro: en la caja estrecha del parte el «%» bajaba solo a la
          // línea siguiente (visto en la captura).
          return html`<div>Se defiende ${quienEs(e.stack)}: +${Math.round(DEFEND_BONUS * 100)}\u00a0% de defensa hasta el final de la ronda</div>`;

        case 'ladder_placed':
          return html`<div>${quienEs(e.stack)} apoya su escalera en el muro de (${e.muro.col},${e.muro.row}): se queda puesta</div>`;
        case 'climbed':
          return html`<div>Sube a la muralla ${quienEs(e.stack)}, en (${e.to.col},${e.to.row}): este turno no hace nada más</div>`;
        case 'gate_opened':
          return html`<div>${quienEs(e.stack)} abre la puerta de entre (${e.puerta.a.col},${e.puerta.a.row}) y (${e.puerta.b.col},${e.puerta.b.row}): ahora pasa cualquiera</div>`;
        case 'gate_closed':
          return html`<div>${quienEs(e.stack)} cierra la puerta de entre (${e.puerta.a.col},${e.puerta.a.row}) y (${e.puerta.b.col},${e.puerta.b.row}): no pasa nadie</div>`;

        // El único que el parte NO cuenta, escrito aparte en vez de caer por un
        // `default`: el tablero ya enseña dónde está cada unidad, y el paso a
        // paso (la mitad de los hechos de una batalla) ahogaría el resto.
        case 'move':
          return NADA;
      }
      // Exhaustivo: con un `kind` nuevo, `e` deja de ser `never` aquí y esta
      // línea no compila hasta que alguien decida si se pinta o no.
      const sinFrase: never = e;
      throw new Error(`hecho del parte de guerra sin frase: ${JSON.stringify(sinFrase)}`);
    })
    // Las líneas vacías se van igual que antes. Se comparan con `NADA` por
    // identidad y no por su contenido: `NADA` es el único hueco vacío que
    // escriben las ramas de arriba, así que es exacto y no hay que abrir el
    // fragmento para mirarlo.
    .filter((linea) => linea !== NADA);
  return html`<div class="log" data-al-final="parte">${unir(lineas)}</div>`;
}

/**
 * « en (12, 5)»: dónde pasó un hecho de la crónica, o nada si no pasa en ningún
 * sitio (el día, el final). Es la casilla que el hecho ya trae (`at`) y no un
 * nombre de castillo o de región: el hecho no lleva más, y buscarlo en el estado
 * haría de la crónica algo que el espectador —que no tiene el estado— no puede
 * pintar. La casilla ya pasó la niebla con el hecho (`cronicaPara`): o el hecho
 * es tuyo, o la mirabas cuando ocurrió.
 */
function enLaCasilla(at: Point | null): string {
  // Espacios duros: en la caja estrecha la casilla se partía en «(10,» y «4)»
  // (visto en la captura), y una coordenada partida no se lee como una.
  return at === null ? '' : ` en\u00a0(${at.x},\u00a0${at.y})`;
}

/** Cómo se llama un cuerpo del tablero en la crónica: el héroe y el personaje no están en el catálogo. */
function nombreDeCuerpo(body: string): string {
  if (body === HERO_BODY) return 'el héroe';
  if (body === CHARACTER_BODY) return 'un personaje';
  return unidadDelJuego(body).name;
}

/**
 * La línea de una batalla terminada: quién ganó y en cuántas rondas, qué
 * perdió cada bando y qué hechizos se lanzaron. `suyo` es el bando de quien
 * lee, o `null` si no es de ninguno (el espectador, o un tercero que miraba).
 */
function fraseDeBatalla(
  e: Extract<GameEventDraft, { kind: 'battle_ended' }>,
  suyo: Side | null,
): string {
  /**
   * Contra quién (#18), con lo que trae el hecho: el atacante es un héroe (con
   * dueño) o un grupo de asaltantes (sin él, la emboscada); el defensor lo dice
   * `foe`. Un héroe sin dueño o una guarnición de castillo sin `foe: town` no
   * existen, y se lanza en vez de inventarles nombre.
   */
  const quienLucha = (s: Side): { uno: string; el: string } => {
    const dueño = e.owners[s];
    const kind = s === 'attacker' ? (dueño === null ? 'raider' : 'hero') : e.foe.kind;
    switch (kind) {
      case 'hero':
        if (dueño === null) throw new Error('la crónica cuenta una batalla de un héroe sin dueño');
        return { uno: `un héroe del jugador ${dueño}`, el: `el jugador ${dueño}` };
      case 'town':
        return dueño === null
          ? { uno: 'la guarnición de una ciudad neutral', el: 'la guarnición' }
          : { uno: `la guarnición de un castillo del jugador ${dueño}`, el: `el jugador ${dueño}` };
      case 'monster':
        return { uno: 'un monstruo', el: 'el monstruo' };
      case 'raider':
        return { uno: 'un grupo de asaltantes', el: 'el grupo de asaltantes' };
    }
  };
  // En tercera persona, cada bando por quién es —el jugador, o el monstruo, el
  // grupo, la guarnición—, como el resto de la crónica; desde un bando, tú y el
  // enemigo, que ya se ha dicho quién es en la cabeza.
  const bando = (s: Side): string =>
    suyo === null ? quienLucha(s).el : s === suyo ? 'tú' : 'el enemigo';
  const rondas = enRondas(e.rounds);
  const donde = enLaCasilla(e.at);
  const cabeza =
    suyo === null
      ? `Batalla${donde}: ${quienLucha('attacker').uno} contra ${quienLucha('defender').uno}; gana ${bando(e.winner)} en ${rondas}`
      : `Batalla ${suyo === e.winner ? 'ganada' : 'perdida'} contra ${
          quienLucha(suyo === 'attacker' ? 'defender' : 'attacker').uno
        }${donde}, en ${rondas}`;
  const partes = [cabeza];
  for (const s of SIDES) {
    const bajas = e.lost[s];
    if (bajas.length === 0) continue;
    const quien = bando(s);
    partes.push(
      `${quien === 'tú' ? 'pierdes' : `pierde ${quien}`} ${bajas
        .map((b) => `${b.count}\u00a0× ${nombreDeCuerpo(b.creature)}`)
        .join(', ')}`,
    );
  }
  for (const c of e.casts) {
    const mata = c.killed > 0 ? ` (mata ${c.killed})` : '';
    const quien = bando(c.side);
    partes.push(
      `${quien === 'tú' ? 'lanzas' : `lanza ${quien}`} ${spell(c.spell).name} sobre ${nombreDeCuerpo(c.target)}${mata}`,
    );
  }
  return partes.join('; ');
}

/**
 * La crónica de la pantalla.
 *
 * Aquí NO se filtra: llega filtrada. Quien juega la pide a `Session.cronica`,
 * que pasa por `cronicaPara` como la del agente; el espectador, entera. Fue
 * entera también para quien juega mientras el lienzo pintaba con `player.fog`
 * —filtrar solo la crónica dejaba al rival andando por el mapa sin una línea
 * que lo contara—, y se filtró con el lienzo, a la vez (#64).
 *
 * Lo que sí se arregla es que MENTÍA. Sin dueño en el evento, `built`,
 * `recruited` y `garrison_taken` se pintaban igual fueran de quien fueran —lo
 * del rival parecía tuyo—, `spells_learned` salía siempre en verde y
 * `hero_defeated` siempre en rojo: cuando el que caía era el héroe ENEMIGO, a
 * la persona se le pintaba como derrota propia. El color se sigue usando para
 * distinguir lo tuyo de lo suyo, que es presentación y es a propósito, pero
 * ahora con el dato en la mano en vez de suponiéndolo.
 *
 * Toma `GameEventDraft` y no `GameEvent`, o sea la crónica **sin el sello**: no
 * lee `seen` ni una vez, y así vale también para el espectador, al que la crónica
 * le llega ya sin él. Un `GameEvent` encaja donde se pide un borrador, así que el
 * cliente que juega sigue llamando igual.
 *
 * `viewer` es quien la lee. El espectador no es nadie —no tiene un «tú»—, y por
 * eso pasa un id que no es de ningún jugador: entonces toda la crónica se lee en
 * tercera persona, que es lo correcto para quien mira desde fuera.
 */
export function renderLog(log: readonly GameEventDraft[], viewer: number): Html {
  /**
   * Quién, en las tres formas que pide la frase: sujeto, genitivo y dativo.
   * Son tres y no una porque componer «de» o «a» con el sujeto no vale en
   * español, y no es teórico: en pantalla salió «Castillo de tú capturado» y
   * habría salido «Mina capturada a el jugador 1». El número es el mismo que
   * enseña todo lo demás — dos numeraciones para la misma cosa es una trampa.
   */
  const jugador = (id: number | null): string =>
    id === null ? 'Alguien' : id === viewer ? 'Tú' : `El jugador ${id}`;
  const deJugador = (id: number | null): string =>
    id === null ? 'de alguien' : id === viewer ? 'tuyo' : `del jugador ${id}`;
  const alJugador = (id: number | null): string =>
    id === null ? 'a alguien' : id === viewer ? 'a ti' : `al jugador ${id}`;

  const lineas = log
    .slice(-60)
    // El `switch` de dentro cubre la unión entera de `e.kind` y NO tiene
    // `default`: un `kind` al que nadie le haya escrito su frase tiene que
    // ponerse rojo, no colarse por la rama de abajo. Quien lo pone rojo es el
    // `never` del final, igual que en `serialize.ts`.
    .map((e): Html => {
      const mio = e.actor === viewer;
      // Dónde (#18): «Paso tomado» no decía cuál, y con once nodos por bando
      // eso es no decir nada. Va al final de la frase para que lo primero que
      // se lea siga siendo qué pasó.
      const aqui = enLaCasilla(e.at);
      switch (e.kind) {
        case 'day_start':
          return html`<div>— Día ${e.day} —</div>`;
        case 'resource_gained':
          return mio
            ? html`<div class="win">+${e.amount} ${NOMBRE_DE_RECURSO[e.resource]}${aqui}</div>`
            : NADA;
        case 'node_captured':
          return html`<div${clase(mio, e.from === viewer)}>${
            mio
              ? `Paso tomado${e.from === null ? '' : ` ${alJugador(e.from)}`}`
              : e.from === viewer
                ? `${jugador(e.actor)} te ha quitado un paso`
                : `${jugador(e.actor)} toma un paso`
          }${aqui}</div>`;
        case 'town_captured':
          // El criterio 9: a costa de quién. «Castillo capturado» a secas era
          // media verdad justo en el evento que decide la partida.
          return html`<div${clase(mio, e.from === viewer)}>${
            mio
              ? `Has capturado un castillo ${e.from === null ? 'neutral' : deJugador(e.from)}`
              : e.from === viewer
                ? `${jugador(e.actor)} te ha capturado un castillo`
                : `${jugador(e.actor)} captura un castillo ${
                    e.from === null ? 'neutral' : deJugador(e.from)
                  }`
          }${aqui}</div>`;
        case 'built':
          return html`<div${clase(mio, false)}>${
            mio ? 'Construido' : `${jugador(e.actor)} construye`
          }${aqui}: ${building(e.building).name}</div>`;
        case 'recruited':
          return html`<div${clase(mio, false)}>${
            mio ? 'Reclutados' : `${jugador(e.actor)} recluta`
          } ${e.count} × ${unidadDelJuego(e.creature).name}${aqui}</div>`;
        case 'dismissed':
          return html`<div${clase(mio, false)}>${
            mio ? 'Licenciados' : `${jugador(e.actor)} licencia`
          } ${e.count} × ${unidadDelJuego(e.creature).name}${aqui}</div>`;
        case 'hero_hired':
          return html`<div${clase(mio, false)}>${
            mio ? 'Héroe contratado' : `${jugador(e.actor)} contrata un héroe`
          }${aqui}</div>`;
        case 'loot_found':
          // El botín se cuenta porque cae en la mochila, que no se ve en el mapa:
          // sin esta línea la pieza aparecería en el panel sin saber de dónde.
          return html`<div${clase(mio, false)}>${
            mio ? 'Botín' : `${jugador(e.actor)} se lleva un botín`
          } ${e.from === 'raider' ? 'de unos asaltantes' : 'de una ciudad neutral'}${aqui}: ${
            pieza(e.item).nombre
          }</div>`;
        case 'item_bought':
          return html`<div${clase(mio, false)}>${
            mio ? 'Comprado en la armería' : `${jugador(e.actor)} compra en la armería`
          }${aqui}: ${pieza(e.item).nombre}</div>`;
        case 'hero_promoted':
          // El nombre lo escribió el narrador: va en un hueco de texto y la
          // plantilla lo escapa, como el de cualquier pueblo del agente.
          return html`<div${clase(mio, false)}>Un ${unidadDelJuego(e.creature).name} ${deJugador(
            e.actor,
          )} se hace héroe${aqui}: ${e.name}</div>`;
        case 'garrison_taken':
          return html`<div${clase(mio, false)}>${
            mio ? 'Guarnición incorporada' : `${jugador(e.actor)} incorpora una guarnición`
          }${aqui}</div>`;
        case 'spells_learned':
          return html`<div${clase(mio, false)}>${
            mio ? 'Aprendido' : `${jugador(e.actor)} aprende`
          }${aqui}: ${e.spells.map((id) => spell(id).name).join(', ')}</div>`;
        case 'battle_ended': {
          // Lo que sobrevive de la batalla (#93): antes, «Batalla resuelta» y
          // nada más, ni quién ganó. El bando de quien lee sale de `owners`, que
          // viaja en el hecho; el espectador no tiene bando y lo lee en tercera.
          const suyo: Side | null =
            e.owners.attacker === viewer
              ? 'attacker'
              : e.owners.defender === viewer
                ? 'defender'
                : null;
          return html`<div${clase(suyo === e.winner, suyo !== null && suyo !== e.winner)}>${fraseDeBatalla(e, suyo)}</div>`;
        }
        case 'hero_defeated':
          // `actor` es el dueño del MUERTO, así que aquí «mío» es la derrota y
          // lo del rival es una victoria. Antes las dos salían en rojo, y a la
          // persona se le pintaba como propia la muerte del héroe enemigo.
          return html`<div${clase(!mio, mio)}>${
            mio ? 'Un héroe tuyo ha caído' : `Ha caído un héroe ${deJugador(e.actor)}`
          }${aqui}</div>`;
        case 'hero_returned':
          // Volver a la base es perder (la tropa o el oro) pero no la partida:
          // el color es el de una derrota tuya o una victoria sobre el rival.
          return html`<div${clase(!mio, mio)}>${
            mio
              ? 'Un héroe tuyo vuelve a la base'
              : `Un héroe ${deJugador(e.actor)} vuelve a su base`
          }${aqui}${e.surrendered ? ` tras rendirse por ${e.gold} de oro` : ''}</div>`;
        case 'rank_up':
          // El rango reparte cuerpo y liderazgo, pero eso no se ve en el mapa:
          // si no se contara aquí, subir pasaría sin que nadie lo notara. Todo
          // héroe nace en el 5 (una sola escala con la tropa), así que la
          // primera línea de estas que se lee es «sube a rango 6». El nivel no
          // va: es el de sus cifras de hoy, no el de entonces.
          return html`<div${clase(mio, false)}>Un héroe ${deJugador(e.actor)} sube a rango ${
            e.rank
          }${aqui}</div>`;
        case 'troop_rank_up':
          // La tropa también sube, y es lo que se pidió que se viera: un
          // veterano no se distingue en el mapa, así que el ascenso se cuenta.
          return html`<div${clase(mio, false)}>Un ${unidadDelJuego(e.creature).name} ${deJugador(
            e.actor,
          )} sube a veterano de rango ${e.rank}${aqui}</div>`;
        case 'game_over': {
          // El ganador es `actor`, y ya no hay un `winner` al lado diciendo lo
          // mismo: `visibleTo` enrutaba por uno y esta línea pintaba por el
          // otro, sin que nada comprobara que coincidían.
          //
          // Y NO va por `mio`, que es la pregunta de dos: con `actor: null` —el
          // empate por días— `!mio` es `true` y el fin de partida salía en el
          // rojo de derrota. Es el mismo fallo que `desenlaceDe` existe para
          // impedir, un panel más allá, y esta línea la pinta también el
          // espectador, que no tiene bando.
          const fin = desenlaceDe(e.actor, quienesDe(viewer));
          return html`<div${clase(fin === 'ganada', fin === 'perdida')}>Fin de la partida</div>`;
        }

        // Los que la pantalla NO pinta, escritos uno a uno en vez de
        // caer por un `default`. El núcleo ya te obliga a decidir si un `kind`
        // nuevo se reparte (`visibleTo`); esto te obliga a decidir si se lee, y
        // con el `default` puesto se colaba sin frase y sin ponerse nada rojo
        // — que es como `built` y `recruited` se pasaron la vida
        // misatribuyendo.
        //
        // El turno y la derrota los cuenta ya la barra de arriba, el paso a
        // paso del héroe ahogaría el resto de la crónica, y el principio de una
        // batalla se ve en el propio tablero.
        case 'battle_started':
          // El principio de una batalla se ve en el tablero, salvo el de una
          // emboscada: ahí la batalla no la pidió nadie y hay que decir por qué
          // se ha parado el héroe.
          if (e.attacker.kind !== 'raider') return NADA;
          return html`<div${clase(false, mio)}>${
            mio
              ? '¡Emboscada! Unos asaltantes atacan a un héroe tuyo'
              : `Unos asaltantes emboscan a un héroe ${deJugador(e.actor)}`
          }${aqui}</div>`;
        case 'march_halted':
          // Es lo que explica que el héroe se haya quedado a medio camino con
          // puntos de sobra: sin esta línea parecería un fallo de la marcha.
          return html`<div>${
            mio ? 'Un héroe tuyo se detiene' : `Un héroe ${deJugador(e.actor)} se detiene`
          }${aqui}: ${loQueLaPara(e.troops)}</div>`;
        case 'raider_dispersed':
          // Sin casilla, y es la única: `actor` es quien cerró la región, que
          // puede estar lejos, y el hecho le consta por ser suyo aunque no viera
          // al grupo. Su `at` es donde estaba el grupo, que la niebla le
          // escondía: decirlo aquí sería enseñarle la patrulla que no veía.
          return html`<div${clase(mio, false)}>${
            mio ? 'Los asaltantes de tu región se dispersan' : 'Unos asaltantes se dispersan'
          }</div>`;
        // Que hay un grupo en el mapa es un hecho DE MAPA, y el mapa lo pinta:
        // contarlo aquí eran catorce líneas el día 1, y esta crónica no pasa por
        // la niebla. Uno solo —ni los de salida ni los que brotan—, para que la
        // regla no dependa de cuándo nació el grupo.
        case 'raider_spawned':
        case 'turn_start':
        case 'hero_moved':
        case 'player_defeated':
          return NADA;
        // Que la marcha se corte al acabarse los puntos ya lo enseñaba la ruta,
        // que pinta aparte lo que no llega hoy: aquí sería ruido en cada clic
        // lejano. Es para el agente, que no ve la ruta.
        case 'march_cut':
          return NADA;
      }
      // Exhaustivo: con un `kind` nuevo, `e` deja de ser `never` aquí y esta
      // línea no compila hasta que alguien decida si se pinta o no.
      const sinFrase: never = e;
      throw new Error(`hecho de la crónica sin frase: ${JSON.stringify(sinFrase)}`);
    })
    .filter((linea) => linea !== NADA);
  return html`<div class="log" data-al-final="cronica">${unir(lineas)}</div>`;
}
