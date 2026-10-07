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
import { activeStack, quedanCasillas } from '@core/battle/battle.js';
import { type EffectKind, effectiveLuck } from '@core/battle/effects.js';
import { type Spell, spell } from '@core/battle/spells.js';
import {
  type BattleAction,
  type BattleStack,
  type BattleState,
  nivelDeVeterania,
  type Side,
} from '@core/battle/types.js';
import { creature, hasTrait, isShooter, nombreDeTipoDeHeroe } from '@core/data.js';
import {
  cifrasDePieza,
  destinoDeEquipo,
  NOMBRE_DE_CALIDAD,
  PIEZAS_DE_ARMERIA,
  pieza,
} from '@core/hero/equipo.js';
import { nivelDe, nivelDeHeroe, umbral } from '@core/hero/experiencia.js';
import { type Hero, heroUnit, maxMana, maxMovePoints } from '@core/hero/hero.js';
import {
  elQueSeIria,
  individuosDe,
  type Personajes,
  type TroopGroup,
  troopSummary,
} from '@core/hero/troop.js';
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
import type { Army, Hueco } from '@core/types.js';
import { describirCoste, HUECOS, NOMBRE_DE_RECURSO, RESOURCE_KINDS } from '@core/types.js';
import { quienesDe } from '../desenlace.js';
import { fondoDeColor, type Html, html, NADA, srcDeImagen, unir } from '../html.js';
import { asset } from '../render/assets.js';
import { MARCA_DE_COMANDANTE, RESOURCE_COLORS, RESOURCE_NAMES } from '../render/palette.js';
import type { Session } from '../session.js';

/**
 * El atributo `disabled`, suelto.
 *
 * Va dentro de una etiqueta y no dentro de un atributo, así que el hueco solo
 * acepta marcado: una cadena `'disabled'` ahí la rechaza la puerta, y con razón
 * —sin comillas alrededor, cualquier texto que caiga en ese sitio se lee como
 * atributos—. Tres sitios lo ponen.
 */
const DESHABILITADO: Html = html`disabled`;

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

export function renderSide(session: Session): Html {
  switch (session.scene) {
    case 'town':
      return renderTownPanel(session);
    case 'battle':
      return renderBattlePanel(session);
    default:
      return renderAdventurePanel(session);
  }
}

export function renderActions(session: Session): Html {
  if (session.state.finished !== null) {
    return html`<button data-action="restart" class="primary">Partida nueva</button>`;
  }
  switch (session.scene) {
    case 'town':
      return html`<button data-action="close-town">Volver al mapa</button>`;
    case 'battle': {
      const battle = session.battle;
      if (battle !== null && battle.finished !== null) {
        return html`<button data-action="finish-battle" class="primary">Continuar</button>`;
      }
      return html`<button data-action="auto-battle">Resolver sola</button>`;
    }
    default:
      return html`
        <button data-action="toggle-fog">${session.revealAll ? 'Ocultar mapa' : 'Ver mapa entero'}</button>
        <button data-action="end-turn" class="primary" ${session.isPlayersTurn ? NADA : DESHABILITADO}>
          Fin de turno
        </button>`;
  }
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
 * lo que le da el nivel— y, entre paréntesis, lo que le suma el equipo. Las dos
 * cifras salen de `heroUnit`, la misma puerta con la que entra en batalla: sumar
 * aquí `hero.attack + sumaDeEquipo` se saltaba el nivel, y a un héroe de nivel 6
 * la ficha le enseñaba uno menos de lo que pegaba.
 */
function ataqueYDefensa(hero: Hero): string {
  const puesto = heroUnit(hero);
  const desnudo = heroUnit({ ...hero, equipo: {} });
  const cifra = (base: number, total: number) =>
    total > base ? `${base} (+${total - base})` : `${base}`;
  return `${cifra(desnudo.attack, puesto.attack)} / ${cifra(desnudo.defense, puesto.defense)}`;
}

function renderAdventurePanel(session: Session): Html {
  const hero = session.selectedHero;
  const heroes = session.myHeroes();
  const desenlace = session.desenlace;
  const fin = desenlace === null ? NADA : renderFinDePartida(desenlace, session.causaDelFinal);

  const heroPanel =
    hero === null
      ? html`<p>No tienes héroes en el mapa. Contrata uno en tu castillo.</p>`
      : html`
        <p class="eyebrow">HÉROE · NIVEL ${nivelDeHeroe(hero)} · ${nombreDeTipoDeHeroe(hero.faction, hero.tipo)}</p>
        <h2>${hero.name}</h2>${historiaDelHeroe(hero.origen?.historia ?? null)}
        ${filaLiderazgo(session.liderazgo({ heroe: hero.id }))}
        <div class="row"><span class="label">Movimiento</span><span>${hero.movePoints} / ${maxMovePoints(hero, session.state.characters)}</span></div>
        <div class="row"><span class="label">Maná</span><span>${hero.mana} / ${maxMana(hero)}</span></div>
        <div class="row"><span class="label">Ataque / Defensa</span><span>${ataqueYDefensa(hero)}</span></div>
        <div class="row"><span class="label">Poder / Conocimiento</span><span>${hero.spellPower} / ${hero.knowledge}</span></div>
        <div class="row"><span class="label">Experiencia</span><span>${experienciaDeHeroe(hero.experience)}</span></div>
        <h3>Hechizos</h3>
        ${renderSpellbook(hero.spells)}
        ${renderEquipoDelHeroe(hero, session.selectedItem)}
        <h3>Tropa · ${hero.army.length} ${hero.army.length === 1 ? 'individuo' : 'individuos'}</h3>
        ${renderTropaEquipable(hero, session.selectedItem, session.state.characters)}`;

  const listaHeroes =
    heroes.length <= 1
      ? NADA
      : html`<h3>Héroes</h3><div class="stack-list">${unir(
          heroes.map(
            (h) => html`<button data-action="select-hero" data-hero="${h.id}" class="stack">
              <span>${h.name}</span><span class="count">${h.movePoints}</span>
            </button>`,
          ),
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
    <h3>Crónica</h3>${renderLog(session.state.log, session.viewer)}`;
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
 * La experiencia del héroe con el umbral del nivel siguiente: «220 / 380». El
 * héroe no tiene tope, así que siempre hay siguiente —y si la tabla se acabara,
 * `umbral` lo diría lanzando en vez de pintar un «null»—; el umbral lo da el
 * núcleo —una sola tabla para tropa y héroe— y el panel no sabe cuánto cuesta
 * un nivel.
 */
function experienciaDeHeroe(experiencia: number): string {
  return `${experiencia} / ${umbral(nivelDe(experiencia) + 1)}`;
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

/** El libro de un héroe: nombre y coste, que es lo que se decide con ellos. */
function renderSpellbook(spells: readonly string[]): Html {
  if (spells.length === 0) {
    return html`<div class="stack-list"><div class="stack empty">Sin hechizos: llévalo a un castillo con gremio</div></div>`;
  }
  const filas = unir(spells.map((id) => filaHechizo(spell(id))));
  return html`<div class="stack-list">${filas}</div>`;
}

/**
 * El nivel de un veterano y lo que le falta para el siguiente, o nada si es una
 * fila de novatos. Las cifras salen de `troopSummary`, que es quien las deriva:
 * el panel no sabe qué umbral tiene cada nivel.
 */
function lineaDeVeterania(g: TroopGroup): Html {
  if (g.veterania === undefined) return NADA;
  const exp = g.veterania.experiencia;
  const falta = g.siguiente === null ? `${exp} exp · nivel máximo` : `${exp} / ${g.siguiente} exp`;
  // «Veterano» desde el nivel 2: con 18 de los 20 del primer umbral todavía es
  // un novato que ha empezado a aprender, y llamarlo veterano sería mentirle.
  const quien = g.nivel >= 2 ? `Veterano · nivel ${g.nivel}` : 'Nivel 1';
  return html`<span class="veterania">${quien} · ${falta}</span>`;
}

/** El nombre de cada hueco, para pintarlo. */
const NOMBRE_DE_HUECO: Readonly<Record<Hueco, string>> = {
  arma: 'Arma',
  armadura: 'Armadura',
  accesorio: 'Accesorio',
};

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
 * El equipo del héroe —los tres huecos, con «×» para quitar— y su mochila, donde
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
      return html`<div class="stack"><span>${NOMBRE_DE_HUECO[hueco]}: ${p.nombre}<span class="veterania">${cifrasDePieza(p)}</span></span><span class="count"><button data-action="unequip" data-hero="${hero.id}" data-slot="${hueco}" title="Quitársela y guardarla en la mochila">×</button></span></div>`;
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
              <span>${p.nombre}${marca}<span class="veterania">${NOMBRE_DE_HUECO[p.hueco]} ${NOMBRE_DE_CALIDAD[p.calidad]} · ${cifrasDePieza(p)}</span></span>
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
      return html`<div class="stack"><span>${p.nombre}<span class="veterania">${NOMBRE_DE_HUECO[p.hueco]} · ${cifrasDePieza(p)}</span></span><span class="count">${describirCoste(p.precio)} <button data-action="buy-item" data-item="${p.id}" title="${motivo ?? 'Comprarla para la mochila del héroe que está dentro'}">Comprar</button></span></div>`;
    }),
  );
  return html`<h3>Armería</h3><div class="stack-list">${filas}</div>
    <p class="cost">Lo comprado va a la mochila del héroe que está dentro; pónselo desde su panel.</p>`;
}

// ---------------------------------------------------------------- castillo

function renderTownPanel(session: Session): Html {
  const town = session.activeTown;
  if (town === null) return NADA;

  // Solo los héroes PROPIOS: un rival parado en tu castillo no te enseña su
  // ejército, y sobre todo no esconde tu guarnición.
  const heroeAqui = session.myHeroes().find((h) => h.at.x === town.at.x && h.at.y === town.at.y);

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
            const info = creature(id);
            return html`<div class="stack"><span>${info.name}</span><span class="count">+${info.growth}</span></div>`;
          }),
        );

  return html`
    <h2>${town.name}</h2>
    <div class="row"><span class="label">Ingresos</span><span>${dailyIncome(town)} oro/día</span></div>
    <div class="row"><span class="label">Gremio de magia</span><span>${mageGuildLevel(town) || '—'}</span></div>
    ${renderTownSpells(town)}
    <div class="row"><span class="label">Construir hoy</span><span>${town.builtToday ? 'ya hecho' : 'disponible'}</span></div>
    <p class="cost">Pulsa un solar para levantarlo y la franja de abajo para reclutar.</p>

    <h3>Crecimiento semanal</h3>
    <div class="stack-list">${crecimiento}</div>

    <h3>Guarnición</h3>
    ${filaLiderazgo(session.liderazgo({ guarnicion: town.id }))}
    ${renderArmy(town.garrison, session.state.characters)}

    ${
      heroeAqui === undefined
        ? html`<p class="cost">Sin héroe dentro, lo que reclutes se queda de guarnición.</p>
          <button data-action="hire-hero" class="primary" style="margin-top:.7rem">Contratar héroe (2500 oro)</button>`
        : html`<h3>Tropa de ${heroeAqui.name}</h3>
          ${filaLiderazgo(session.liderazgo({ heroe: heroeAqui.id }))}
          <p class="cost">Lo que reclutes va a su tropa, hasta su liderazgo. Licencia lo que sobre para hacer sitio a algo mejor.</p>
          ${renderTropaLicenciable(heroeAqui.id, heroeAqui.army, session.state.characters)}`
    }${renderArmeria(session, town)}`;
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

function renderBattlePanel(session: Session): Html {
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
      <h3>Parte de guerra</h3>${renderBattleLog(battle, mio)}`;
  }

  const s = activeStack(battle);
  const activo =
    s === null
      ? html`<p>Sin unidad activa.</p>`
      : html`<h2>${s.unit.name}</h2>
        <div class="row"><span class="label">Bando</span><span>${s.side === mio ? 'Tú' : 'Enemigo'}</span></div>
        <div class="row"><span class="label">Efectivos</span><span>${s.count}</span></div>
        <div class="row"><span class="label">Moral / Suerte</span><span>${s.morale} / ${effectiveLuck(s)}</span></div>
        ${isShooter(s.unit) ? html`<div class="row"><span class="label">Munición</span><span>${s.shotsLeft}</span></div>` : NADA}`;

  const suTurno = s !== null && s.side === mio;
  const acciones = suTurno
    ? accionesDeLaUnidad({
        activa: s,
        legales: session.battleLegalActions(),
        pasos: session.battleStepsLeft(),
        rendicion: renderRendicion(session),
        hechizos: renderSpells(session),
      })
    : html`<p>Turno del enemigo…</p>`;

  // El maná del héroe, junto a la ficha de la unidad activa: es un recurso de la
  // batalla entera, no del stack, y sin verlo no se decide si lanzar.
  const heroe = session.battleHero;
  const mana =
    heroe === null
      ? NADA
      : html`<div class="row"><span class="label">Maná</span><span>${heroe.mana} / ${maxMana(heroe)}</span></div>`;

  const orden = listaDelCampo(battle, (x) => ({
    flecha: x.side === mio ? '▶' : '◀',
    nombre: `${marcaDeComandante(x)}${x.unit.name}${marcaDeVeterano(x)}`,
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
  readonly legales: readonly BattleAction[];
  readonly pasos: number | null;
  readonly rendicion: Html;
  readonly hechizos: Html;
}): Html {
  const puede = (tipo: BattleAction['type']): boolean => o.legales.some((a) => a.type === tipo);
  const quedan = o.pasos === null ? null : quedanCasillas(o.pasos);
  return html`<h3>Acciones</h3>
       ${quedan === null ? NADA : html`<div class="row"><span class="label">Le ${quedan[0]}</span><span>${quedan[1]}</span></div>`}
       <div class="stack-list">
         <button data-action="battle-end-turn">Terminar turno</button>
         <button data-action="battle-defend" ${puede('defend') ? NADA : DESHABILITADO}>Defender</button>
         <button data-action="battle-wait" ${puede('wait') ? NADA : DESHABILITADO}>Esperar</button>
         ${o.rendicion}
       </div>
       ${o.hechizos}
       <p class="cost" style="margin-top:.5rem">
         Haz clic en un hexágono verde para moverte —puedes moverte en varios tramos—,
         o pasa el ratón por un enemigo y elige desde qué casilla golpearlo.
         ${ayudaDeCarga(o.activa)}
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
  },
): Html {
  return unir(
    battle.stacks
      .filter((x) => x.count > 0)
      .map((x) => {
        const f = fila(x);
        return html`<div class="stack${x.id === battle.turno?.stack ? '' : ' empty'}">
          <span>${f.flecha} ${f.nombre}</span>
          <span class="count">${f.cuenta}</span>
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
 * El nivel de un veterano detrás de su nombre en «En el campo», o nada: la fila
 * dice con palabras lo que la figura dice con galones (`galonesDe`, en
 * `render/batalla.ts`, que este módulo no importa: es puro y lo carga el
 * espectador sin lienzo).
 */
export function marcaDeVeterano(s: BattleStack): string {
  const nivel = nivelDeVeterania(s.origen);
  return nivel > 1 ? ` · nivel ${nivel}` : '';
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

/**
 * El libro de hechizos durante la batalla.
 *
 * Lo que no se puede lanzar sale apagado y con el motivo en el `title`: se ve a
 * la vez lo que tienes y lo que te falta, igual que un solar vacío del castillo.
 * Ni el `castable` ni el motivo se deciden aquí — los da `session.spellOptions()`.
 */
function renderSpells(session: Session): Html {
  const opciones = session.spellOptions();
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
      const elegido = session.selectedSpell === o.id;
      return html`<button data-action="battle-spell" data-spell="${o.id}"
        class="stack${elegido ? ' primary' : ''}"
        ${o.castable ? NADA : DESHABILITADO}
        title="${o.castable ? `Cuesta ${o.cost} de maná` : o.motivo}">
        <span>${o.name}</span><span class="count">${o.cost}</span>
      </button>`;
    }),
  );
  const elegido = opciones.find((o) => o.id === session.selectedSpell);
  return html`<h3>Hechizos</h3><div class="stack-list">${botones}</div>
    ${elegido === undefined ? NADA : html`<p class="cost" style="margin-top:.5rem">${elegido.name}: pulsa sobre la unidad objetivo. Escape cancela.</p>`}`;
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
  return FUENTE_RASGO[source] ?? spell(source).name;
}

/**
 * Va tipada por `EffectKind` y ya no por `string`, y no es cosmética: con la
 * clave abierta, `ETIQUETA_EFECTO[e.effect]` es `string | undefined` y la puerta
 * no lo acepta —con razón: un hueco que puede ser `undefined` pinta la palabra
 * «undefined»—. Cerrada, la tabla cubre la unión y un `EffectKind` nuevo no
 * compila hasta que alguien le escriba su nombre.
 */
const ETIQUETA_EFECTO: Readonly<Record<EffectKind, string>> = {
  speed: 'velocidad',
  luck: 'suerte',
  attack: 'ataque',
};

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
 * La línea de ayuda de la carga, solo si la unidad activa tiene el rasgo: con un
 * campesino o un arquero es ruido, y quien juega no tiene caballería hasta
 * varios días después (N2 de QA, 02-10-2026). Se pregunta por el rasgo y no por
 * si hay casillas de carga ahora: el texto explica cómo se ve, también el turno
 * en que no sale ninguna.
 */
function ayudaDeCarga(s: BattleStack | null): Html {
  if (s === null || !hasTrait(s.unit, 'charge')) return NADA;
  return html`Al enemigo en naranja se le puede cargar: pasa por él y elige la casilla del
         número («»3»).`;
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
 * `defend`) y se tragaría igual el que se añada mañana. Ahora los tres están
 * escritos con su frase vacía y quien decide es el `never` del final.
 */
export function renderBattleLog(battle: BattleState, mio: Side | null): Html {
  /**
   * De quién era el stack. Lanza si no aparece: un id del registro que no está
   * en el campo es un fallo nuestro, y disimularlo con «una unidad» sería
   * volver a la misatribución por otro camino.
   */
  const bandoDe = (id: string): Side => {
    const s = battle.stacks.find((x) => x.id === id);
    if (s === undefined)
      throw new Error(`el parte habla de una unidad que no está en el campo: ${id}`);
    return s.side;
  };

  const lineas = battle.log
    .slice(-40)
    .map((e): Html => {
      switch (e.kind) {
        case 'round_start':
          return html`<div>— Ronda ${e.round} —</div>`;
        case 'attack': {
          const carga = e.charge === undefined ? '' : ` (carga de ${e.charge} hexes)`;
          return html`<div>${e.retaliation ? 'Contraataque' : 'Ataque'}${carga}: ${e.damage} de daño, ${e.killed} bajas</div>`;
        }
        case 'shoot':
          return html`<div>${e.splash === true ? 'Salpicadura' : 'Disparo'}: ${e.damage} de daño, ${e.killed} bajas</div>`;
        case 'cast':
          // El nombre, no el id: `spell()` ya lo tiene y quien lee el parte no
          // sabe qué es un "magic_arrow". Sobre quién se lanzó es #18.
          return html`<div>Hechizo ${spell(e.spell).name}${e.damage ? `: ${e.damage} de daño` : ''}</div>`;
        case 'morale':
          return html`<div${clase(e.good, !e.good)}>${e.good ? 'Moral alta: turno extra' : 'Moral baja: turno perdido'}</div>`;
        case 'luck':
          return html`<div${clase(e.good, !e.good)}>${e.good ? '¡Golpe afortunado!' : 'Golpe desafortunado'}</div>`;
        case 'effect':
          return html`<div${clase(e.amount >= 0, e.amount < 0)}>${nombreFuente(e.source)}: ${ETIQUETA_EFECTO[e.effect]} ${e.amount > 0 ? '+' : ''}${e.amount} durante ${e.rounds} ${e.rounds === 1 ? 'ronda' : 'rondas'}</div>`;
        case 'effect_end':
          return html`<div>Se disipa: ${nombreFuente(e.source)}</div>`;
        case 'immune':
          return html`<div>Inmune a ${nombreFuente(e.source)}: los no-muertos no tienen ánimo que quebrar</div>`;
        case 'perished': {
          // Quién cae decide el color, igual que en `hero_defeated` un piso más
          // arriba: lo tuyo es la derrota y lo suyo la victoria. Sin bando —el
          // parte de quien no lleva ninguno de los dos— no se pinta ninguna de
          // las dos cosas, en vez de inventarse una.
          const suya = bandoDe(e.stack) === mio;
          return html`<div${clase(mio !== null && !suya, suya)}>${
            mio === null
              ? 'Una unidad ha sido aniquilada'
              : suya
                ? 'Una unidad tuya ha sido aniquilada'
                : 'Una unidad enemiga ha sido aniquilada'
          }</div>`;
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

        // Los tres que el parte NO cuenta, escritos uno a uno en vez de caer por
        // un `default`. El tablero ya enseña dónde está cada unidad y quién se
        // defiende; el paso a paso ahogaría el resto del parte.
        case 'move':
        case 'wait':
        case 'defend':
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
  return html`<div class="log">${unir(lineas)}</div>`;
}

/**
 * La crónica de la pantalla.
 *
 * Aquí NO se llama a `visibleTo`: la persona sigue viendo el log entero, y es
 * deliberado. El lienzo del mapa nunca pasó por #35 —pinta con `player.fog`, o
 * sea «lo exploré alguna vez»—, así que filtrar solo la crónica dejaría a quien
 * juega viendo al rival moverse por el mapa y sin una línea que lo contara. Las
 * dos mitades se quedan coherentes entre sí hasta que el mapa del cliente se
 * arregle; el día que #34 aterrice, esta crónica vendrá ya filtrada del
 * servidor y el problema se resuelve solo.
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
      switch (e.kind) {
        case 'day_start':
          return html`<div>— Día ${e.day} —</div>`;
        case 'resource_gained':
          return mio
            ? html`<div class="win">+${e.amount} ${NOMBRE_DE_RECURSO[e.resource]}</div>`
            : NADA;
        case 'node_captured':
          return html`<div${clase(mio, e.from === viewer)}>${
            mio
              ? `Paso tomado${e.from === null ? '' : ` ${alJugador(e.from)}`}`
              : e.from === viewer
                ? `${jugador(e.actor)} te ha quitado un paso`
                : `${jugador(e.actor)} toma un paso`
          }</div>`;
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
          }</div>`;
        case 'built':
          return html`<div${clase(mio, false)}>${
            mio ? 'Construido' : `${jugador(e.actor)} construye`
          }: ${building(e.building).name}</div>`;
        case 'recruited':
          return html`<div${clase(mio, false)}>${
            mio ? 'Reclutados' : `${jugador(e.actor)} recluta`
          } ${e.count} × ${creature(e.creature).name}</div>`;
        case 'dismissed':
          return html`<div${clase(mio, false)}>${
            mio ? 'Licenciados' : `${jugador(e.actor)} licencia`
          } ${e.count} × ${creature(e.creature).name}</div>`;
        case 'hero_hired':
          return html`<div${clase(mio, false)}>${
            mio ? 'Héroe contratado' : `${jugador(e.actor)} contrata un héroe`
          }</div>`;
        case 'loot_found':
          // El botín se cuenta porque cae en la mochila, que no se ve en el mapa:
          // sin esta línea la pieza aparecería en el panel sin saber de dónde.
          return html`<div${clase(mio, false)}>${
            mio ? 'Botín' : `${jugador(e.actor)} se lleva un botín`
          } ${e.from === 'raider' ? 'de unos asaltantes' : 'de una ciudad neutral'}: ${
            pieza(e.item).nombre
          }</div>`;
        case 'item_bought':
          return html`<div${clase(mio, false)}>${
            mio ? 'Comprado en la armería' : `${jugador(e.actor)} compra en la armería`
          }: ${pieza(e.item).nombre}</div>`;
        case 'hero_promoted':
          // El nombre lo escribió el narrador: va en un hueco de texto y la
          // plantilla lo escapa, como el de cualquier pueblo del agente.
          return html`<div${clase(mio, false)}>Un ${creature(e.creature).name} ${deJugador(
            e.actor,
          )} se hace héroe: ${e.name}</div>`;
        case 'garrison_taken':
          return html`<div${clase(mio, false)}>${
            mio ? 'Guarnición incorporada' : `${jugador(e.actor)} incorpora una guarnición`
          }</div>`;
        case 'spells_learned':
          return html`<div${clase(mio, false)}>${
            mio ? 'Aprendido' : `${jugador(e.actor)} aprende`
          }: ${e.spells.map((id) => spell(id).name).join(', ')}</div>`;
        case 'battle_ended':
          return html`<div>Batalla resuelta</div>`;
        case 'hero_defeated':
          // `actor` es el dueño del MUERTO, así que aquí «mío» es la derrota y
          // lo del rival es una victoria. Antes las dos salían en rojo, y a la
          // persona se le pintaba como propia la muerte del héroe enemigo.
          return html`<div${clase(!mio, mio)}>${
            mio ? 'Un héroe tuyo ha caído' : `Ha caído un héroe ${deJugador(e.actor)}`
          }</div>`;
        case 'hero_returned':
          // Volver a la base es perder (la tropa o el oro) pero no la partida:
          // el color es el de una derrota tuya o una victoria sobre el rival.
          return html`<div${clase(!mio, mio)}>${
            mio
              ? 'Un héroe tuyo vuelve a la base'
              : `Un héroe ${deJugador(e.actor)} vuelve a su base`
          }${e.surrendered ? ` tras rendirse por ${e.gold} de oro` : ''}</div>`;
        case 'level_up':
          // El nivel reparte cuerpo y liderazgo, pero eso no se ve en el mapa:
          // si no se contara aquí, subir pasaría sin que nadie lo notara. Todo
          // héroe nace en el 5 (una sola escala con la tropa), así que la
          // primera línea de estas que se lee es «sube a nivel 6».
          return html`<div${clase(mio, false)}>Un héroe ${deJugador(e.actor)} sube a nivel ${
            e.level
          }</div>`;
        case 'troop_level_up':
          // La tropa también sube, y es lo que se pidió que se viera: un
          // veterano no se distingue en el mapa, así que el ascenso se cuenta.
          return html`<div${clase(mio, false)}>Un ${creature(e.creature).name} ${deJugador(
            e.actor,
          )} sube a veterano de nivel ${e.level}</div>`;
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
          }</div>`;
        case 'march_halted':
          // Es lo que explica que el héroe se haya quedado a medio camino con
          // puntos de sobra: sin esta línea parecería un fallo de la marcha.
          return html`<div>${
            mio ? 'Un héroe tuyo se detiene' : `Un héroe ${deJugador(e.actor)} se detiene`
          }: ve ${individuosDe(e.troops)} asaltantes que lo emboscarían más adelante</div>`;
        case 'raider_dispersed':
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
  return html`<div class="log">${unir(lineas)}</div>`;
}
