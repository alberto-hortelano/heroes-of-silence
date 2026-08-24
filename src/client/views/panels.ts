/**
 * Paneles de interfaz. Generan HTML a partir de la sesión; los clics se
 * resuelven por delegación con atributos `data-action`, así que no hay
 * listeners sueltos que limpiar en cada repintado.
 */
import { activeStack } from '@core/battle/battle.js';
import { effectiveLuck } from '@core/battle/effects.js';
import { spell, type Spell } from '@core/battle/spells.js';
import type { BattleEvent, Side } from '@core/battle/types.js';
import { creature, isShooter } from '@core/data.js';
import { armySize, maxMana, maxMovePoints } from '@core/hero/hero.js';
import type { GameEvent } from '@core/state/game.js';
import { building } from '@core/town/buildings.js';
import { dailyIncome, dwellings, mageGuildLevel, townSpells, type Town } from '@core/town/town.js';
import type { Army } from '@core/types.js';
import { asset } from '../render/assets.js';
import { RESOURCE_COLORS, RESOURCE_NAMES } from '../render/palette.js';
import type { Session } from '../session.js';
import { RESOURCE_KINDS } from '@core/types.js';

export function renderTopbar(session: Session): { day: string; resources: string; turn: string } {
  const state = session.state;
  const semana = Math.floor((state.day - 1) / 7) + 1;
  const dia = ((state.day - 1) % 7) + 1;

  // Con arte generado se usa el icono; si no, la muestra de color.
  const resources = RESOURCE_KINDS.map((k) => {
    const valor = session.resources[k];
    const icono = asset('icons', k);
    const marca =
      icono === null
        ? `<span class="swatch" style="background:${RESOURCE_COLORS[k]}"></span>`
        : `<img class="res-icon" src="${icono.src}" alt="">`;
    return `<li title="${RESOURCE_NAMES[k]}">${marca}${valor}</li>`;
  }).join('');

  const turno =
    state.finished !== null
      ? state.finished.winner === session.viewer
        ? 'Partida ganada'
        : 'Partida perdida'
      : session.isPlayersTurn
        ? 'Tu turno'
        : 'Turno del rival…';

  return {
    day: `Día ${dia} · Semana ${semana}`,
    resources,
    turn: turno,
  };
}

export function renderSide(session: Session): string {
  switch (session.scene) {
    case 'town':
      return renderTownPanel(session);
    case 'battle':
      return renderBattlePanel(session);
    default:
      return renderAdventurePanel(session);
  }
}

export function renderActions(session: Session): string {
  if (session.state.finished !== null) {
    return `<button data-action="restart" class="primary">Partida nueva</button>`;
  }
  switch (session.scene) {
    case 'town':
      return `<button data-action="close-town">Volver al mapa</button>`;
    case 'battle': {
      const battle = session.battle;
      if (battle !== null && battle.finished !== null) {
        return `<button data-action="finish-battle" class="primary">Continuar</button>`;
      }
      return `<button data-action="auto-battle">Resolver sola</button>`;
    }
    default:
      return `
        <button data-action="toggle-fog">${session.revealAll ? 'Ocultar mapa' : 'Ver mapa entero'}</button>
        <button data-action="end-turn" class="primary" ${session.isPlayersTurn ? '' : 'disabled'}>
          Fin de turno
        </button>`;
  }
}

// ---------------------------------------------------------------- aventura

function renderAdventurePanel(session: Session): string {
  const hero = session.selectedHero;
  const heroes = session.myHeroes();

  const heroPanel =
    hero === null
      ? `<p>No tienes héroes en el mapa. Contrata uno en tu castillo.</p>`
      : `
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
      ? ''
      : `<h3>Héroes</h3><div class="stack-list">${heroes
          .map(
            (h) => `<button data-action="select-hero" data-hero="${h.id}" class="stack">
              <span>${h.name}</span><span class="count">${h.movePoints}</span>
            </button>`,
          )
          .join('')}</div>`;

  const pueblos = session.myTowns();
  const listaPueblos =
    pueblos.length === 0
      ? ''
      : `<h3>Castillos</h3><div class="stack-list">${pueblos
          .map(
            (t) => `<button data-action="open-town" data-town="${t.id}" class="stack">
              <span>${t.name}</span><span class="count">+${dailyIncome(t)}</span>
            </button>`,
          )
          .join('')}</div>`;

  return `${heroPanel}${listaHeroes}${listaPueblos}
    <h3>Crónica</h3>${renderLog(session.state.log, session.viewer)}`;
}

/**
 * Una fila de hechizo: nombre —con su nivel donde importa— y coste en maná. La
 * pintan el libro del héroe y la lista del gremio, que solo se diferencian en
 * eso. El tercer pintor, `renderSpells`, NO entra aquí: son botones con
 * `disabled` y `title`, y forzarlos en este molde saldría más caro que la copia.
 */
function filaHechizo(s: Spell, conNivel = false): string {
  const nivel = conNivel ? ` <span class="count">n.${s.level}</span>` : '';
  return `<div class="stack"><span>${s.name}${nivel}</span><span class="count">${s.cost}</span></div>`;
}

/** El libro de un héroe: nombre y coste, que es lo que se decide con ellos. */
function renderSpellbook(spells: readonly string[]): string {
  if (spells.length === 0) {
    return `<div class="stack-list"><div class="stack empty">Sin hechizos: llévalo a un castillo con gremio</div></div>`;
  }
  const filas = spells.map((id) => filaHechizo(spell(id))).join('');
  return `<div class="stack-list">${filas}</div>`;
}

function renderArmy(army: Army): string {
  const filas = army
    .map((stack) => {
      if (stack === null) return `<div class="stack empty"><span>—</span></div>`;
      const info = creature(stack.creature);
      const marca = isShooter(info) ? ' ↑' : '';
      return `<div class="stack"><span>${info.name}${marca}</span><span class="count">${stack.count}</span></div>`;
    })
    .join('');
  return `<div class="stack-list">${filas}</div>`;
}

// ---------------------------------------------------------------- castillo

function renderTownPanel(session: Session): string {
  const town = session.activeTown;
  if (town === null) return '';

  // Solo los héroes PROPIOS: un rival parado en tu castillo no te enseña su
  // ejército, y sobre todo no esconde tu guarnición.
  const heroeAqui = session
    .myHeroes()
    .find((h) => h.at.x === town.at.x && h.at.y === town.at.y);

  const crecimiento = dwellings(town)
    .map(({ creature: id }) => {
      const info = creature(id);
      return `<div class="stack"><span>${info.name}</span><span class="count">+${info.growth}</span></div>`;
    })
    .join('');

  return `
    <h2>${town.name}</h2>
    <div class="row"><span class="label">Ingresos</span><span>${dailyIncome(town)} oro/día</span></div>
    <div class="row"><span class="label">Gremio de magia</span><span>${mageGuildLevel(town) || '—'}</span></div>
    ${renderTownSpells(town)}
    <div class="row"><span class="label">Construir hoy</span><span>${town.builtToday ? 'ya hecho' : 'disponible'}</span></div>
    <p class="cost">Pulsa un solar para levantarlo y la franja de abajo para reclutar.</p>

    <h3>Crecimiento semanal</h3>
    <div class="stack-list">${crecimiento || '<div class="stack empty">Sin moradas</div>'}</div>

    <h3>Guarnición</h3>
    ${renderArmy(town.garrison)}

    ${
      heroeAqui === undefined
        ? `<button data-action="hire-hero" class="primary" style="margin-top:.7rem">Contratar héroe (2500 oro)</button>`
        : `<h3>Ejército de ${heroeAqui.name}</h3>${renderArmy(heroeAqui.army)}`
    }`;
}

/**
 * Qué enseña el gremio, no solo su nivel: un número suelto no dice si merece la
 * pena traer aquí al héroe. La lista sale de `townSpells`, así que el panel no
 * sabe qué nivel enseña qué.
 */
function renderTownSpells(town: Town): string {
  const hechizos = townSpells(town);
  if (hechizos.length === 0) {
    return `<p class="cost">Sin gremio: construye uno para que tus héroes aprendan magia aquí.</p>`;
  }
  const filas = hechizos.map((s) => filaHechizo(s, true)).join('');
  return `<h3>Enseña</h3><div class="stack-list">${filas}</div>
    <p class="cost">Un héroe tuyo parado aquí los aprende solo.</p>`;
}

// ---------------------------------------------------------------- batalla

function renderBattlePanel(session: Session): string {
  const battle = session.battle;
  if (battle === null) return '';

  // El bando de la persona lo DERIVA la sesión del dueño de la batalla; aquí no
  // se supone. Decir «Tú» al atacante era la misma suposición que el ciclo de
  // #29 quitó del servidor, y le habría cantado «Victoria» a quien acababa de
  // perder el castillo el primer día que la persona defienda.
  const mio = session.miBando;

  if (battle.finished !== null) {
    const gane = battle.finished.winner === mio;
    return `<h2>${gane ? 'Victoria' : 'Derrota'}</h2>
      <p>${gane ? 'El campo es tuyo.' : 'Tu héroe ha caído.'}</p>
      <h3>Parte de guerra</h3>${renderBattleLog(battle.log, mio)}`;
  }

  const s = activeStack(battle);
  const activo =
    s === null
      ? '<p>Sin unidad activa.</p>'
      : `<h2>${creature(s.creature).name}</h2>
        <div class="row"><span class="label">Bando</span><span>${s.side === mio ? 'Tú' : 'Enemigo'}</span></div>
        <div class="row"><span class="label">Efectivos</span><span>${s.count}</span></div>
        <div class="row"><span class="label">Moral / Suerte</span><span>${s.morale} / ${effectiveLuck(s)}</span></div>
        ${isShooter(creature(s.creature)) ? `<div class="row"><span class="label">Munición</span><span>${s.shotsLeft}</span></div>` : ''}`;

  const suTurno = s !== null && s.side === mio;
  const acciones = suTurno
    ? `<h3>Acciones</h3>
       <div class="stack-list">
         <button data-action="battle-defend">Defender</button>
         <button data-action="battle-wait" ${s.waited ? 'disabled' : ''}>Esperar</button>
       </div>
       ${renderSpells(session)}
       <p class="cost" style="margin-top:.5rem">
         Haz clic en un hexágono verde para moverte, o sobre un enemigo para atacarlo.
       </p>`
    : '<p>Turno del enemigo…</p>';

  // El maná del héroe, junto a la ficha de la unidad activa: es un recurso de la
  // batalla entera, no del stack, y sin verlo no se decide si lanzar.
  const heroe = session.battleHero;
  const mana =
    heroe === null
      ? ''
      : `<div class="row"><span class="label">Maná</span><span>${heroe.mana} / ${maxMana(heroe)}</span></div>`;

  const orden = battle.stacks
    .filter((x) => x.count > 0)
    .map(
      (x) =>
        `<div class="stack${x.id === battle.activeId ? '' : ' empty'}">
          <span>${x.side === mio ? '▶' : '◀'} ${creature(x.creature).name}</span>
          <span class="count">${x.count}</span>
        </div>`,
    )
    .join('');

  return `${activo}
    <div class="row"><span class="label">Ronda</span><span>${battle.round}</span></div>
    ${mana}
    ${acciones}
    <h3>En el campo</h3><div class="stack-list">${orden}</div>
    <h3>Parte de guerra</h3>${renderBattleLog(battle.log, mio)}`;
}

/**
 * El libro de hechizos durante la batalla.
 *
 * Lo que no se puede lanzar sale apagado y con el motivo en el `title`: se ve a
 * la vez lo que tienes y lo que te falta, igual que un solar vacío del castillo.
 * Ni el `castable` ni el motivo se deciden aquí — los da `session.spellOptions()`.
 */
function renderSpells(session: Session): string {
  const opciones = session.spellOptions();
  if (opciones.length === 0) {
    return `<h3>Hechizos</h3>
      <div class="stack-list"><div class="stack empty">Este héroe no conoce ninguno</div></div>`;
  }
  const botones = opciones
    .map((o) => {
      // El elegido se marca con `primary`, no el resto con `empty`: `.empty` es
      // el gris de un hueco vacío, y con él un hechizo perfectamente lanzable se
      // veía apagado, igual que uno que no se puede pagar. Lo apagado lo pone
      // `button:disabled`, y así los dos estados no se confunden en pantalla.
      const elegido = session.selectedSpell === o.id;
      return `<button data-action="battle-spell" data-spell="${o.id}"
        class="stack${elegido ? ' primary' : ''}"
        ${o.castable ? '' : 'disabled'}
        title="${o.castable ? `Cuesta ${o.cost} de maná` : o.motivo}">
        <span>${o.name}</span><span class="count">${o.cost}</span>
      </button>`;
    })
    .join('');
  const elegido = opciones.find((o) => o.id === session.selectedSpell);
  return `<h3>Hechizos</h3><div class="stack-list">${botones}</div>
    ${elegido === undefined ? '' : `<p class="cost" style="margin-top:.5rem">${elegido.name}: pulsa sobre la unidad objetivo. Escape cancela.</p>`}`;
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

const ETIQUETA_EFECTO: Readonly<Record<string, string>> = {
  speed: 'velocidad',
  luck: 'suerte',
  attack: 'ataque',
};

/**
 * El parte de guerra. `mio` es el bando de quien lo lee: sin él, «gana el
 * defensor» se pintaría en rojo de derrota aunque el defensor fueras tú.
 */
function renderBattleLog(log: readonly BattleEvent[], mio: Side | null): string {
  const lineas = log
    .slice(-40)
    .map((e) => {
      switch (e.kind) {
        case 'round_start':
          return `<div>— Ronda ${e.round} —</div>`;
        case 'attack': {
          const carga = e.charge === undefined ? '' : ` (carga de ${e.charge} hexes)`;
          return `<div>${e.retaliation ? 'Contraataque' : 'Ataque'}${carga}: ${e.damage} de daño, ${e.killed} bajas</div>`;
        }
        case 'shoot':
          return `<div>${e.splash === true ? 'Salpicadura' : 'Disparo'}: ${e.damage} de daño, ${e.killed} bajas</div>`;
        case 'cast':
          // El nombre, no el id: `spell()` ya lo tiene y quien lee el parte no
          // sabe qué es un "magic_arrow". Sobre quién se lanzó es #18.
          return `<div>Hechizo ${spell(e.spell).name}${e.damage ? `: ${e.damage} de daño` : ''}</div>`;
        case 'morale':
          return `<div class="${e.good ? 'win' : 'lose'}">${e.good ? 'Moral alta: turno extra' : 'Moral baja: turno perdido'}</div>`;
        case 'luck':
          return `<div class="${e.good ? 'win' : 'lose'}">${e.good ? '¡Golpe afortunado!' : 'Golpe desafortunado'}</div>`;
        case 'effect':
          return `<div class="${e.amount >= 0 ? 'win' : 'lose'}">${nombreFuente(e.source)}: ${ETIQUETA_EFECTO[e.effect]} ${e.amount > 0 ? '+' : ''}${e.amount} durante ${e.rounds} ${e.rounds === 1 ? 'ronda' : 'rondas'}</div>`;
        case 'effect_end':
          return `<div>Se disipa: ${nombreFuente(e.source)}</div>`;
        case 'immune':
          return `<div>Inmune a ${nombreFuente(e.source)}: los no-muertos no tienen ánimo que quebrar</div>`;
        case 'perished':
          return `<div class="lose">Una unidad ha sido aniquilada</div>`;
        case 'finished':
          return `<div class="${mio === null ? '' : e.winner === mio ? 'win' : 'lose'}">Fin: gana el ${e.winner === 'attacker' ? 'atacante' : 'defensor'}</div>`;
        default:
          return '';
      }
    })
    .filter((s) => s !== '')
    .join('');
  return `<div class="log">${lineas}</div>`;
}

function renderLog(log: readonly GameEvent[], viewer: number): string {
  const lineas = log
    .slice(-60)
    .map((e) => {
      switch (e.kind) {
        case 'day_start':
          return `<div>— Día ${e.day} —</div>`;
        case 'resource_gained':
          return e.player === viewer
            ? `<div class="win">+${e.amount} ${RESOURCE_NAMES[e.resource].toLowerCase()}</div>`
            : '';
        case 'mine_captured':
          return `<div class="${e.player === viewer ? 'win' : 'lose'}">Mina capturada</div>`;
        case 'town_captured':
          return `<div class="${e.player === viewer ? 'win' : 'lose'}">Castillo capturado</div>`;
        case 'built':
          return `<div>Construido: ${building(e.building).name}</div>`;
        case 'recruited':
          return `<div>Reclutados ${e.count} × ${creature(e.creature).name}</div>`;
        case 'hero_hired':
          return `<div class="${e.player === viewer ? 'win' : 'lose'}">Héroe contratado</div>`;
        case 'garrison_taken':
          return `<div>Guarnición incorporada</div>`;
        case 'spells_learned':
          return `<div class="win">Aprendido: ${e.spells.map((id) => spell(id).name).join(', ')}</div>`;
        case 'battle_ended':
          return `<div>Batalla resuelta</div>`;
        case 'hero_defeated':
          return `<div class="lose">Un héroe ha caído</div>`;
        case 'game_over':
          return `<div class="${e.winner === viewer ? 'win' : 'lose'}">Fin de la partida</div>`;
        default:
          return '';
      }
    })
    .filter((s) => s !== '')
    .join('');
  return `<div class="log">${lineas}</div>`;
}
