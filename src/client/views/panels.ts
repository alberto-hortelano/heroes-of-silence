/**
 * Paneles de interfaz. Generan HTML a partir de la sesión; los clics se
 * resuelven por delegación con atributos `data-action`, así que no hay
 * listeners sueltos que limpiar en cada repintado.
 */
import { activeStack } from '@core/battle/battle.js';
import { effectiveLuck } from '@core/battle/effects.js';
import { spell } from '@core/battle/spells.js';
import type { BattleEvent } from '@core/battle/types.js';
import { creature, isShooter } from '@core/data.js';
import { armySize, maxMana, maxMovePoints } from '@core/hero/hero.js';
import type { GameEvent } from '@core/state/game.js';
import { building } from '@core/town/buildings.js';
import { dailyIncome, dwellings, mageGuildLevel } from '@core/town/town.js';
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

// ---------------------------------------------------------------- batalla

function renderBattlePanel(session: Session): string {
  const battle = session.battle;
  if (battle === null) return '';

  if (battle.finished !== null) {
    const gane = battle.finished.winner === 'attacker';
    return `<h2>${gane ? 'Victoria' : 'Derrota'}</h2>
      <p>${gane ? 'El campo es tuyo.' : 'Tu héroe ha caído.'}</p>
      <h3>Parte de guerra</h3>${renderBattleLog(battle.log)}`;
  }

  const s = activeStack(battle);
  const activo =
    s === null
      ? '<p>Sin unidad activa.</p>'
      : `<h2>${creature(s.creature).name}</h2>
        <div class="row"><span class="label">Bando</span><span>${s.side === 'attacker' ? 'Tú' : 'Enemigo'}</span></div>
        <div class="row"><span class="label">Efectivos</span><span>${s.count}</span></div>
        <div class="row"><span class="label">Moral / Suerte</span><span>${s.morale} / ${effectiveLuck(s)}</span></div>
        ${isShooter(creature(s.creature)) ? `<div class="row"><span class="label">Munición</span><span>${s.shotsLeft}</span></div>` : ''}`;

  const suTurno = s !== null && s.side === 'attacker';
  const acciones = suTurno
    ? `<h3>Acciones</h3>
       <div class="stack-list">
         <button data-action="battle-defend">Defender</button>
         <button data-action="battle-wait" ${s.waited ? 'disabled' : ''}>Esperar</button>
       </div>
       <p class="cost" style="margin-top:.5rem">
         Haz clic en un hexágono verde para moverte, o sobre un enemigo para atacarlo.
       </p>`
    : '<p>Turno del enemigo…</p>';

  const orden = battle.stacks
    .filter((x) => x.count > 0)
    .map(
      (x) =>
        `<div class="stack${x.id === battle.activeId ? '' : ' empty'}">
          <span>${x.side === 'attacker' ? '▶' : '◀'} ${creature(x.creature).name}</span>
          <span class="count">${x.count}</span>
        </div>`,
    )
    .join('');

  return `${activo}
    <div class="row"><span class="label">Ronda</span><span>${battle.round}</span></div>
    ${acciones}
    <h3>En el campo</h3><div class="stack-list">${orden}</div>
    <h3>Parte de guerra</h3>${renderBattleLog(battle.log)}`;
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

function renderBattleLog(log: readonly BattleEvent[]): string {
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
          return `<div>Hechizo ${e.spell}${e.damage ? `: ${e.damage} de daño` : ''}</div>`;
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
          return `<div class="${e.winner === 'attacker' ? 'win' : 'lose'}">Fin: gana el ${e.winner === 'attacker' ? 'atacante' : 'defensor'}</div>`;
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
