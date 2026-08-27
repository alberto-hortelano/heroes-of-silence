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
import { activeStack } from '@core/battle/battle.js';
import { type EffectKind, effectiveLuck } from '@core/battle/effects.js';
import { type Spell, spell } from '@core/battle/spells.js';
import type { BattleState, Side } from '@core/battle/types.js';
import { creature, isShooter } from '@core/data.js';
import { armySize, maxMana, maxMovePoints } from '@core/hero/hero.js';
import type { GameEventDraft } from '@core/state/events.js';
import { building } from '@core/town/buildings.js';
import { dailyIncome, dwellings, mageGuildLevel, type Town, townSpells } from '@core/town/town.js';
import type { Army } from '@core/types.js';
import { RESOURCE_KINDS } from '@core/types.js';
import { type Desenlace, desenlaceDe } from '../desenlace.js';
import { fondoDeColor, type Html, html, NADA, srcDeImagen, unir } from '../html.js';
import { asset } from '../render/assets.js';
import { RESOURCE_COLORS, RESOURCE_NAMES } from '../render/palette.js';
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

export function renderTopbar(session: Session): {
  day: string;
  resources: Html;
  turn: string;
} {
  const state = session.state;
  const semana = Math.floor((state.day - 1) / 7) + 1;
  const dia = ((state.day - 1) % 7) + 1;

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
  return { day: `Día ${dia} · Semana ${semana}`, resources, turn: turno };
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

function renderAdventurePanel(session: Session): Html {
  const hero = session.selectedHero;
  const heroes = session.myHeroes();

  const heroPanel =
    hero === null
      ? html`<p>No tienes héroes en el mapa. Contrata uno en tu castillo.</p>`
      : html`
        <h2>${hero.name}</h2>
        <div class="row"><span class="label">Movimiento</span><span>${hero.movePoints} / ${maxMovePoints(hero)}</span></div>
        <div class="row"><span class="label">Maná</span><span>${hero.mana} / ${maxMana(hero)}</span></div>
        <div class="row"><span class="label">Ataque / Defensa</span><span>${hero.attack} / ${hero.defense}</span></div>
        <div class="row"><span class="label">Poder / Conocimiento</span><span>${hero.spellPower} / ${hero.knowledge}</span></div>
        <div class="row"><span class="label">Experiencia</span><span>${hero.experience}</span></div>
        <h3>Hechizos</h3>
        ${renderSpellbook(hero.spells)}
        <h3>Ejército (${armySize(hero.army)})</h3>
        ${renderArmy(hero.army)}`;

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

  return html`${heroPanel}${listaHeroes}${listaPueblos}
    <h3>Crónica</h3>${renderLog(session.state.log, session.viewer)}`;
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

function renderArmy(army: Army): Html {
  const filas = unir(
    army.map((stack) => {
      if (stack === null) return html`<div class="stack empty"><span>—</span></div>`;
      const info = creature(stack.creature);
      const marca = isShooter(info) ? ' ↑' : '';
      return html`<div class="stack"><span>${info.name}${marca}</span><span class="count">${stack.count}</span></div>`;
    }),
  );
  return html`<div class="stack-list">${filas}</div>`;
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
    ${renderArmy(town.garrison)}

    ${
      heroeAqui === undefined
        ? html`<button data-action="hire-hero" class="primary" style="margin-top:.7rem">Contratar héroe (2500 oro)</button>`
        : html`<h3>Ejército de ${heroeAqui.name}</h3>${renderArmy(heroeAqui.army)}`
    }`;
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
    return html`<h2>${gane ? 'Victoria' : 'Derrota'}</h2>
      <p>${gane ? 'El campo es tuyo.' : 'Tu héroe ha caído.'}</p>
      <h3>Parte de guerra</h3>${renderBattleLog(battle, mio)}`;
  }

  const s = activeStack(battle);
  const activo =
    s === null
      ? html`<p>Sin unidad activa.</p>`
      : html`<h2>${creature(s.creature).name}</h2>
        <div class="row"><span class="label">Bando</span><span>${s.side === mio ? 'Tú' : 'Enemigo'}</span></div>
        <div class="row"><span class="label">Efectivos</span><span>${s.count}</span></div>
        <div class="row"><span class="label">Moral / Suerte</span><span>${s.morale} / ${effectiveLuck(s)}</span></div>
        ${isShooter(creature(s.creature)) ? html`<div class="row"><span class="label">Munición</span><span>${s.shotsLeft}</span></div>` : NADA}`;

  const suTurno = s !== null && s.side === mio;
  const acciones = suTurno
    ? html`<h3>Acciones</h3>
       <div class="stack-list">
         <button data-action="battle-defend">Defender</button>
         <button data-action="battle-wait" ${s.waited ? DESHABILITADO : NADA}>Esperar</button>
       </div>
       ${renderSpells(session)}
       <p class="cost" style="margin-top:.5rem">
         Haz clic en un hexágono verde para moverte, o sobre un enemigo para atacarlo.
       </p>`
    : html`<p>Turno del enemigo…</p>`;

  // El maná del héroe, junto a la ficha de la unidad activa: es un recurso de la
  // batalla entera, no del stack, y sin verlo no se decide si lanzar.
  const heroe = session.battleHero;
  const mana =
    heroe === null
      ? NADA
      : html`<div class="row"><span class="label">Maná</span><span>${heroe.mana} / ${maxMana(heroe)}</span></div>`;

  const orden = unir(
    battle.stacks
      .filter((x) => x.count > 0)
      .map(
        (x) =>
          html`<div class="stack${x.id === battle.activeId ? '' : ' empty'}">
          <span>${x.side === mio ? '▶' : '◀'} ${creature(x.creature).name}</span>
          <span class="count">${x.count}</span>
        </div>`,
      ),
  );

  return html`${activo}
    <div class="row"><span class="label">Ronda</span><span>${battle.round}</span></div>
    ${mana}
    ${acciones}
    <h3>En el campo</h3><div class="stack-list">${orden}</div>
    <h3>Parte de guerra</h3>${renderBattleLog(battle, mio)}`;
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
            ? html`<div class="win">+${e.amount} ${RESOURCE_NAMES[e.resource].toLowerCase()}</div>`
            : NADA;
        case 'mine_captured':
          return html`<div${clase(mio, e.from === viewer)}>${
            mio
              ? `Mina capturada${e.from === null ? '' : ` ${alJugador(e.from)}`}`
              : e.from === viewer
                ? `${jugador(e.actor)} te ha quitado una mina`
                : `${jugador(e.actor)} captura una mina`
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
        case 'hero_hired':
          return html`<div${clase(mio, false)}>${
            mio ? 'Héroe contratado' : `${jugador(e.actor)} contrata un héroe`
          }</div>`;
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
        case 'level_up':
          // La única consecuencia visible de subir de nivel hoy, y por eso
          // sale: el nivel todavía no reparte atributos ni habilidades (#6,
          // #15), así que si no se contara aquí no se notaría en ningún sitio.
          return html`<div${clase(mio, false)}>Un héroe ${deJugador(e.actor)} sube a nivel ${
            e.level
          }</div>`;
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
          const fin = desenlaceDe(e.actor, viewer);
          return html`<div${clase(fin === 'ganada', fin === 'perdida')}>Fin de la partida</div>`;
        }

        // Los cuatro que la pantalla NO pinta, escritos uno a uno en vez de
        // caer por un `default`. El núcleo ya te obliga a decidir si un `kind`
        // nuevo se reparte (`visibleTo`); esto te obliga a decidir si se lee, y
        // con el `default` puesto se colaba sin frase y sin ponerse nada rojo
        // — que es como `built` y `recruited` se pasaron la vida
        // misatribuyendo.
        //
        // El turno y la derrota los cuenta ya la barra de arriba, el paso a
        // paso del héroe ahogaría el resto de la crónica, y el principio de una
        // batalla se ve en el propio tablero.
        case 'turn_start':
        case 'hero_moved':
        case 'battle_started':
        case 'player_defeated':
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
