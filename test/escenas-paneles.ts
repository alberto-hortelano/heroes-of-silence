/**
 * Las escenas con las que se ancla el marcado de los paneles.
 *
 * No es un test: es el andamio que comparten `test/paneles.test.ts` —que compara
 * contra `test/fixtures/paneles.txt`— y `tools/qa/ancla-paneles.ts`, que escribe
 * ese fichero. Están separadas del test a propósito: si el generador y el
 * comparador montaran las escenas por su cuenta, el ancla dejaría de anclar en
 * cuanto una de las dos copias se moviera.
 *
 * Todo sale de semillas fijas y de `createRng` por debajo, así que el volcado es
 * el mismo en cualquier máquina. La única pieza que no es determinista por sí
 * sola —el arte— no entra: `asset()` devuelve `null` fuera del navegador, así
 * que la barra de recursos pinta siempre su muestra de color.
 *
 * Lo que se busca es COBERTURA de ramas, no realismo: cada escena existe para
 * que una parte del marcado se pinte de verdad. Una rama que no se pinte aquí es
 * una rama que el ancla no puede defender.
 */

import { type Html, marcadoDe } from '../src/client/html.js';
import { Session } from '../src/client/session.js';
import { renderActions, renderLog, renderSide, renderTopbar } from '../src/client/views/panels.js';
import { playAiGame } from '../src/core/ai/turn.js';
import { activeStack, applyAction } from '../src/core/battle/battle.js';
import { creature, isShooter } from '../src/core/data.js';
import type { GameEvent } from '../src/core/state/events.js';
import { applyAdventureAction, heroesOf } from '../src/core/state/game.js';
import { agresiva, avanzarHasta } from './helpers.js';

export interface Escena {
  readonly nombre: string;
  readonly session: Session;
}

/**
 * Una batalla en la que la persona DEFIENDE, que es la receta de
 * `session.test.ts`: el héroe del jugador 1 entra en la casilla del héroe del 0.
 * Se usa aquí porque es la única forma de que le llegue una batalla al cliente
 * sin que la resuelva la IA por dentro.
 */
function meAtacan(semilla: number): Session {
  const s = new Session(semilla);
  const mio = heroesOf(s.state, 0)[0]!;
  const suyo = heroesOf(s.state, 1)[0]!;
  s.state.current = 1;
  suyo.movePoints = 100000;
  applyAdventureAction(s.state, { type: 'move_hero', hero: suyo.id, to: mio.at }, s.ctx, 1);
  if (s.state.pendingBattle === null) throw new Error('el rival no llegó a atacar');
  s.scene = 'battle';
  return s;
}

export async function escenas(): Promise<readonly Escena[]> {
  const out: Escena[] = [];

  // 1 · Aventura, con dos días jugados para que la crónica tenga qué contar.
  const aventura = new Session(12);
  await aventura.endTurn();
  await aventura.endTurn();
  out.push({ nombre: 'aventura', session: aventura });

  // 2 · El castillo con el héroe dentro: gremio construido —para que
  //     `renderTownSpells` tenga lista que enseñar— y ejército del héroe en vez
  //     del botón de contratar.
  const castillo = new Session(12);
  const pueblo = castillo.myTowns()[0]!;
  castillo.moveHeroTo(castillo.myHeroes()[0]!.id, pueblo.at);
  castillo.openTown(pueblo.id);
  castillo.build('mage_guild_1');
  out.push({ nombre: 'castillo · con héroe dentro y gremio', session: castillo });

  // 3 · El mismo castillo sin héroe encima: la otra rama, la del botón de
  //     contratar, y el gremio todavía sin construir.
  const castilloVacio = new Session(12);
  castilloVacio.openTown(castilloVacio.myTowns()[0]!.id);
  out.push({ nombre: 'castillo · sin héroe y sin gremio', session: castilloVacio });

  // 4 · Aventura con un héroe recién contratado: sale la lista de héroes (que
  //     solo se pinta con dos o más) y el libro de hechizos VACÍO, que es la
  //     rama que el héroe inicial nunca enseña.
  const contratado = new Session(12);
  contratado.openTown(contratado.myTowns()[0]!.id);
  contratado.hireHero();
  contratado.closeTown();
  const nuevos = contratado.myHeroes();
  contratado.selectedHeroId = nuevos[nuevos.length - 1]!.id;
  out.push({ nombre: 'aventura · héroe recién contratado', session: contratado });

  // 5 · Batalla en marcha, defendiendo: ficha del stack activo, libro de
  //     hechizos con sus motivos, orden del campo y parte de guerra.
  const batalla = meAtacan(7);
  batalla.advanceEnemyTurns();
  out.push({ nombre: 'batalla · en marcha', session: batalla });

  // 6 · La misma batalla hasta el final: victoria o derrota y su parte.
  const batallaFin = meAtacan(7);
  const enCurso = batallaFin.battle;
  if (enCurso === null) throw new Error('la batalla no se montó');
  let vueltas = 0;
  while (enCurso.finished === null && vueltas < 3000) {
    applyAction(enCurso, agresiva(enCurso), batallaFin.ctx.rng);
    vueltas++;
  }
  out.push({ nombre: 'batalla · terminada', session: batallaFin });

  // 7 · Partida terminada: el botón de partida nueva y el «fin de la partida»
  //     de la crónica, que es el último hecho que se pinta.
  const terminada = new Session(3);
  // Sin comprobar que terminó: `playAiGame` no vuelve de otra manera, y lo dice
  // su tipo de retorno.
  await playAiGame(terminada.state, terminada.ctx);
  out.push({ nombre: 'partida terminada', session: terminada });

  // 8 · Aventura en turno del rival: es la única forma de que salga el botón
  //     de fin de turno DESHABILITADO, que es uno de los tres huecos que se
  //     interpolan dentro de una etiqueta y no dentro de un atributo.
  const turnoAjeno = new Session(12);
  turnoAjeno.state.current = 1;
  out.push({ nombre: 'aventura · turno del rival', session: turnoAjeno });

  // 9 · Batalla sin avanzar: manda el atacante, así que el panel dice «Enemigo»
  //     y «Turno del enemigo…» en vez de ofrecer acciones.
  out.push({ nombre: 'batalla · turno del enemigo', session: meAtacan(7) });

  // 10 · Una unidad que YA esperó y un héroe sin maná: «Esperar» deshabilitado
  //      y el hechizo apagado con su motivo dentro del `title`.
  const sinManá = meAtacan(7);
  sinManá.advanceEnemyTurns();
  const enEspera = sinManá.battle;
  if (enEspera === null) throw new Error('la batalla no se montó');
  const activo = activeStack(enEspera);
  if (activo === null) throw new Error('la batalla se quedó sin stack activo');
  activo.waited = true;
  const heroeSinManá = sinManá.battleHero;
  if (heroeSinManá === null) throw new Error('la batalla no tiene héroe propio');
  heroeSinManá.mana = 0;
  out.push({ nombre: 'batalla · en espera y sin maná', session: sinManá });

  // 11 · Con un tirador activo sale la fila de munición, que no pinta ninguna
  //      otra escena.
  const tirador = meAtacan(7);
  const campoTirador = tirador.battle;
  if (campoTirador === null) throw new Error('la batalla no se montó');
  const arquero = campoTirador.stacks.find(
    (s) => s.side === 'defender' && isShooter(creature(s.creature)),
  );
  if (arquero === undefined) throw new Error('esta batalla no tiene tirador propio');
  avanzarHasta(campoTirador, tirador.ctx.rng, arquero.id);
  out.push({ nombre: 'batalla · tirador activo', session: tirador });

  // 12 · El parte de guerra con TODOS sus hechos. Los quince tipos no salen
  //      jugando —una inmunidad o una salpicadura dependen de con quién te
  //      toque—, y son quince líneas de marcado que el ancla no defendería.
  const parte = meAtacan(7);
  const campo = parte.battle;
  if (campo === null) throw new Error('la batalla no se montó');
  const mio = campo.stacks.find((s) => s.side === 'defender');
  const suyo = campo.stacks.find((s) => s.side === 'attacker');
  if (mio === undefined || suyo === undefined) throw new Error('faltan bandos en la batalla');
  campo.log.length = 0;
  campo.log.push(
    { kind: 'round_start', round: 3 },
    { kind: 'move', stack: mio.id, to: mio.hex },
    { kind: 'wait', stack: mio.id },
    { kind: 'defend', stack: mio.id },
    { kind: 'attack', stack: mio.id, target: suyo.id, damage: 12, killed: 2, retaliation: false },
    { kind: 'attack', stack: suyo.id, target: mio.id, damage: 3, killed: 0, retaliation: true },
    {
      kind: 'attack',
      stack: mio.id,
      target: suyo.id,
      damage: 20,
      killed: 4,
      retaliation: false,
      charge: 3,
    },
    { kind: 'shoot', stack: mio.id, target: suyo.id, damage: 8, killed: 1 },
    { kind: 'shoot', stack: mio.id, target: suyo.id, damage: 4, killed: 0, splash: true },
    { kind: 'cast', side: 'defender', spell: 'magic_arrow', target: suyo.id, damage: 10 },
    { kind: 'cast', side: 'defender', spell: 'haste', target: mio.id },
    { kind: 'morale', stack: mio.id, good: true },
    { kind: 'morale', stack: suyo.id, good: false },
    { kind: 'luck', stack: mio.id, good: true },
    { kind: 'luck', stack: mio.id, good: false },
    { kind: 'effect', stack: mio.id, effect: 'speed', amount: 2, source: 'haste', rounds: 3 },
    { kind: 'effect', stack: suyo.id, effect: 'attack', amount: -2, source: 'fear', rounds: 1 },
    { kind: 'effect_end', stack: mio.id, source: 'slow' },
    { kind: 'immune', stack: suyo.id, source: 'curse_on_hit' },
    { kind: 'perished', stack: suyo.id },
    { kind: 'perished', stack: mio.id },
    { kind: 'finished', winner: 'defender' },
  );
  campo.finished = { winner: 'defender' };
  out.push({ nombre: 'batalla · parte de guerra completo', session: parte });

  // 13 · Con un hechizo ya elegido sale la línea de «pulsa sobre la unidad
  //      objetivo», que es la única rama de `renderSpells` con hueco de texto.
  const apuntando = meAtacan(7);
  apuntando.advanceEnemyTurns();
  apuntando.selectSpell('magic_arrow');
  out.push({ nombre: 'batalla · hechizo elegido', session: apuntando });

  // 14 · Un héroe sin libro: «Este héroe no conoce ninguno». Le pasa a todo
  //      héroe contratado, que nace con el libro vacío, pero contratarlo Y
  //      llevarlo a una batalla no cabe en una escena determinista.
  const sinLibro = meAtacan(7);
  sinLibro.advanceEnemyTurns();
  const campoSinLibro = sinLibro.battle;
  const heroeSinLibro = sinLibro.battleHero;
  if (campoSinLibro === null || heroeSinLibro === null) {
    throw new Error('la batalla no tiene héroe propio');
  }
  campoSinLibro.heroes.defender = { ...heroeSinLibro, spells: [] };
  out.push({ nombre: 'batalla · héroe sin libro', session: sinLibro });

  return out;
}

/**
 * Una crónica con los DIECISIETE hechos y sus variantes, para anclar
 * `renderLog` entero.
 *
 * Jugando salen doce o trece y siempre los mismos; los que deciden la partida
 * —perder un castillo a manos del rival, que caiga un héroe enemigo— aparecen en
 * una semilla de cada veinte. Cada hecho va dos veces, del jugador que mira y
 * del otro, porque las dos redacciones son distintas y el color también.
 */
function cronicaCompleta(): readonly GameEvent[] {
  const sitio = { x: 3, y: 4 };
  const base = { at: sitio, seen: [0, 1] as const };
  return [
    { ...base, kind: 'day_start', day: 4, week: 1, actor: null },
    { ...base, kind: 'turn_start', actor: 0 },
    { ...base, kind: 'hero_moved', hero: 'hero-0', to: sitio, spent: 100, actor: 0 },
    { ...base, kind: 'resource_gained', resource: 'wood', amount: 2, actor: 0 },
    { ...base, kind: 'resource_gained', resource: 'gold', amount: 500, actor: 1 },
    { ...base, kind: 'mine_captured', mine: 'mine-1', from: null, actor: 0 },
    { ...base, kind: 'mine_captured', mine: 'mine-1', from: 1, actor: 0 },
    { ...base, kind: 'mine_captured', mine: 'mine-1', from: 0, actor: 1 },
    { ...base, kind: 'mine_captured', mine: 'mine-1', from: null, actor: 1 },
    { ...base, kind: 'town_captured', town: 'town-1', from: null, actor: 0 },
    { ...base, kind: 'town_captured', town: 'town-1', from: 1, actor: 0 },
    { ...base, kind: 'town_captured', town: 'town-0', from: 0, actor: 1 },
    { ...base, kind: 'town_captured', town: 'town-1', from: null, actor: 1 },
    { ...base, kind: 'built', town: 'town-0', building: 'town_hall', actor: 0 },
    { ...base, kind: 'built', town: 'town-1', building: 'mage_guild_1', actor: 1 },
    { ...base, kind: 'recruited', town: 'town-0', creature: 'peasant', count: 12, actor: 0 },
    { ...base, kind: 'recruited', town: 'town-1', creature: 'skeleton', count: 8, actor: 1 },
    { ...base, kind: 'hero_hired', hero: 'hero-2', town: 'town-0', actor: 0 },
    { ...base, kind: 'hero_hired', hero: 'hero-3', town: 'town-1', actor: 1 },
    { ...base, kind: 'garrison_taken', hero: 'hero-0', town: 'town-0', actor: 0 },
    { ...base, kind: 'garrison_taken', hero: 'hero-1', town: 'town-1', actor: 1 },
    {
      ...base,
      kind: 'spells_learned',
      hero: 'hero-0',
      town: 'town-0',
      spells: ['haste', 'slow'],
      actor: 0,
    },
    {
      ...base,
      kind: 'spells_learned',
      hero: 'hero-1',
      town: 'town-1',
      spells: ['magic_arrow'],
      actor: 1,
    },
    {
      ...base,
      kind: 'battle_started',
      attacker: 'hero-0',
      foe: { kind: 'monster', objectId: 'obj-1' },
      actor: 0,
    },
    {
      ...base,
      kind: 'battle_ended',
      winner: 'attacker',
      foe: { kind: 'hero', heroId: 'hero-1' },
      actor: 0,
    },
    { ...base, kind: 'hero_defeated', hero: 'hero-0', actor: 0 },
    { ...base, kind: 'hero_defeated', hero: 'hero-1', actor: 1 },
    { ...base, kind: 'level_up', hero: 'hero-0', level: 2, actor: 0 },
    { ...base, kind: 'level_up', hero: 'hero-1', level: 3, actor: 1 },
    { ...base, kind: 'player_defeated', actor: 1 },
    { ...base, kind: 'game_over', actor: 0 },
  ];
}

/**
 * El volcado que se ancla: los cuatro pintores sobre cada escena, uno detrás de
 * otro y con su rótulo.
 *
 * `renderTopbar` entra aunque el plan solo pedía los otros tres, y por un motivo
 * concreto: sus dos únicos huecos viven en `style=` y en `src=`, que son los dos
 * sitios que la puerta de escapar rechaza de plano, así que su reescritura es la
 * que más se puede torcer. Anclarla cuesta cuatro líneas.
 *
 * Es también el ÚNICO sitio que cambia cuando los paneles pasan a devolver
 * marcado en vez de cadenas: aquí se lee lo que llevan dentro, y el fichero
 * anclado no se mueve ni un byte.
 */
export async function volcado(): Promise<string> {
  const bloques: string[] = [];
  for (const { nombre, session } of await escenas()) {
    const pinta = (rotulo: string, salida: Html): void => {
      bloques.push(`### ${nombre} · ${rotulo}\n${marcadoDe(salida)}`);
    };
    pinta('renderTopbar.resources', renderTopbar(session).resources);
    pinta('renderSide', renderSide(session));
    pinta('renderActions', renderActions(session));
    pinta('renderLog', renderLog(session.state.log, session.viewer));
  }
  bloques.push(`### crónica completa · renderLog\n${marcadoDe(renderLog(cronicaCompleta(), 0))}`);
  return `${bloques.join('\n')}\n`;
}
