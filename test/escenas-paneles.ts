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
import { isShooter } from '../src/core/data.js';
import { isEnterable, objectAt } from '../src/core/map/map.js';
import type { GameEvent } from '../src/core/state/events.js';
import { applyAdventureAction, heroesOf } from '../src/core/state/game.js';
import type { Army, Point, Veterania } from '../src/core/types.js';
import { aCiegas, agresiva, avanzarHasta, fueraDeSuBase, TIRADOR, TROPA } from './helpers.js';

/** Una hoja de servicios de prueba: lo justo para que el panel la pinte. */
function hoja(id: string, experiencia: number): Veterania {
  return { id, experiencia, batallas: 2, bajas: 1, heroes: [] };
}

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
/** Una casilla pisable, sin objeto y sin héroe, pegada a `p`. */
function vecinaLibre(s: Session, p: Point): Point {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const q = { x: p.x + dx, y: p.y + dy };
      if ((dx === 0 && dy === 0) || !isEnterable(s.state.map, q)) continue;
      if (objectAt(s.state.map, q) !== undefined) continue;
      if (s.state.heroes.some((h) => h.at.x === q.x && h.at.y === q.y)) continue;
      return q;
    }
  }
  throw new Error(`no hay casilla libre junto a (${p.x},${p.y})`);
}

export function meAtacan(semilla: number, ejercitoMio?: Army): Session {
  const s = new Session(semilla);
  // Fuera de su base, donde nace (19-10-2026): dentro, la batalla sería la de
  // la base, que no deja rendirse, y la escena enseña la rendición.
  const mio = fueraDeSuBase(s.state, 0);
  const suyo = heroesOf(s.state, 1)[0]!;
  if (ejercitoMio !== undefined) mio.army = ejercitoMio;
  s.state.current = 1;
  // Pegado al mío antes de entrar: desde el mapa de nodos el castillo no
  // bloquea, y cruzando medio mapa el rival pasaba por encima de mi base vacía
  // y la tomaba de camino — la escena se quedaba sin la rendición que enseña.
  suyo.at = vecinaLibre(s, mio.at);
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
  //     El héroe nace dentro (19-10-2026): no hace falta llevarlo.
  const castillo = new Session(12);
  const pueblo = castillo.myTowns()[0]!;
  castillo.openTown(pueblo.id);
  castillo.build('mage_guild_1');
  out.push({ nombre: 'castillo · con héroe dentro y gremio', session: castillo });

  // 3 · El mismo castillo sin héroe encima: la otra rama, la del botón de
  //     contratar, y el gremio todavía sin construir.
  const castilloVacio = new Session(12);
  fueraDeSuBase(castilloVacio.state, castilloVacio.viewer);
  castilloVacio.openTown(castilloVacio.myTowns()[0]!.id);
  out.push({ nombre: 'castillo · sin héroe y sin gremio', session: castilloVacio });

  // 4 · Aventura con un héroe recién contratado: sale la lista de héroes (que
  //     solo se pinta con dos o más) y el libro de hechizos VACÍO, que es la
  //     rama que el héroe inicial nunca enseña.
  const contratado = new Session(12);
  fueraDeSuBase(contratado.state, contratado.viewer);
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

  // 6 · Una batalla como la de la escena 5 hasta el final, ganada: el parte de
  //     la victoria, con la fila del maná. La semilla la busca la escena, desde
  //     la 7, como la 7: con la 7 fija, el río de una casilla al pie de la
  //     meseta (#144, paso 2b) la volvió derrota y el ancla dejó de cubrir la
  //     rama de la victoria sin decirlo.
  let batallaFin: Session | undefined;
  for (let semilla = 7; semilla < 47 && batallaFin === undefined; semilla++) {
    const s = meAtacan(semilla);
    const enCurso = s.battle;
    if (enCurso === null) throw new Error('la batalla no se montó');
    let vueltas = 0;
    while (enCurso.finished === null && vueltas < 3000) {
      aCiegas(enCurso, agresiva(enCurso), s.ctx.rng);
      vueltas++;
    }
    if (enCurso.finished?.winner === 'defender') batallaFin = s;
  }
  if (batallaFin === undefined)
    throw new Error('ninguna de cuarenta semillas da una batalla ganada');
  out.push({ nombre: 'batalla · terminada', session: batallaFin });

  // 7 · Partida terminada, ganada y perdida: el botón de partida nueva y el
  //     «fin de la partida» de la crónica, que es el último hecho que se pinta.
  //     Las dos ramas, y la semilla de cada una la busca la escena: con una
  //     semilla fija, cualquier cambio que moviera la partida cambiaba de rama
  //     sin decirlo y el ancla dejaba de cubrir la otra (pasó con #149).
  for (const [nombre, gana] of [
    ['partida ganada', 0],
    ['partida perdida', 1],
  ] as const) {
    let terminada: Session | undefined;
    for (let semilla = 3; semilla < 43 && terminada === undefined; semilla++) {
      const s = new Session(semilla);
      // Sin comprobar que terminó: `playAiGame` no vuelve de otra manera, y lo
      // dice su tipo de retorno.
      await playAiGame(s.state, s.ctx);
      if (s.state.finished?.winner === gana) terminada = s;
    }
    if (terminada === undefined) {
      throw new Error(`ninguna de cuarenta semillas da una ${nombre} para el jugador 0`);
    }
    out.push({ nombre, session: terminada });
  }

  // 8 · Aventura en turno del rival: es la única forma de que salga el botón
  //     de fin de turno DESHABILITADO, que es uno de los tres huecos que se
  //     interpolan dentro de una etiqueta y no dentro de un atributo.
  const turnoAjeno = new Session(12);
  turnoAjeno.state.current = 1;
  out.push({ nombre: 'aventura · turno del rival', session: turnoAjeno });

  // 9 · Batalla sin avanzar: manda el atacante, así que el panel dice «Enemigo»
  //     y «Turno del enemigo…» en vez de ofrecer acciones.
  out.push({ nombre: 'batalla · turno del enemigo', session: meAtacan(7) });

  // 10 · Un héroe sin maná: el hechizo apagado con su motivo dentro del `title`.
  //      (Hasta el 26-10-2026, con una unidad que ya esperó: «Esperar» se retiró.)
  const sinManá = meAtacan(7);
  sinManá.advanceEnemyTurns();
  if (sinManá.battle === null) throw new Error('la batalla no se montó');
  const heroeSinManá = sinManá.battleHero;
  if (heroeSinManá === null) throw new Error('la batalla no tiene héroe propio');
  heroeSinManá.mana = 0;
  out.push({ nombre: 'batalla · sin maná', session: sinManá });

  // 11 · Con un tirador activo: el panel de quien dispara. Sin fila de
  //      munición: ninguna unidad del catálogo la cuenta desde que es el de la
  //      arena (19-10-2026); tira quien lleva arma a distancia (el arquero
  //      elfo), y por eso va en el ejército de quien defiende.
  const tirador = meAtacan(7, [{ creature: TIRADOR }, { creature: TROPA }]);
  const campoTirador = tirador.battle;
  if (campoTirador === null) throw new Error('la batalla no se montó');
  const arquero = campoTirador.stacks.find((s) => s.side === 'defender' && isShooter(s.unit));
  if (arquero === undefined) throw new Error('esta batalla no tiene tirador propio');
  avanzarHasta(campoTirador, tirador.ctx.rng, arquero.id);
  out.push({ nombre: 'batalla · tirador activo', session: tirador });

  // 12 · El parte de guerra con TODOS sus hechos. Los tipos no salen todos
  //      jugando —una inmunidad o una salpicadura dependen de con quién te
  //      toque—, y son líneas de marcado que el ancla no defendería.
  const parte = meAtacan(7);
  const campo = parte.battle;
  if (campo === null) throw new Error('la batalla no se montó');
  const mio = campo.stacks.find((s) => s.side === 'defender');
  const suyo = campo.stacks.find((s) => s.side === 'attacker');
  if (mio === undefined || suyo === undefined) throw new Error('faltan bandos en la batalla');
  campo.log.length = 0;
  campo.log.push(
    { kind: 'round_start', round: 3 },
    { kind: 'move', stack: mio.id, to: mio.hex, path: [mio.hex] },
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
    { kind: 'cast', side: 'defender', spell: 'magic_arrow', target: suyo.id, damage: 10 },
    { kind: 'cast', side: 'defender', spell: 'haste', target: mio.id },
    { kind: 'luck', stack: mio.id, good: true },
    { kind: 'luck', stack: mio.id, good: false },
    { kind: 'effect', stack: mio.id, effect: 'speed', amount: 2, source: 'haste', rounds: 3 },
    { kind: 'effect', stack: suyo.id, effect: 'attack', amount: -2, source: 'fear', rounds: 1 },
    { kind: 'effect_end', stack: mio.id, source: 'slow' },
    { kind: 'immune', stack: suyo.id, source: 'curse_on_hit' },
    { kind: 'perished', stack: suyo.id },
    { kind: 'perished', stack: mio.id },
    // Las dos, para ver los dos colores; el precio es uno, el de `finished`.
    { kind: 'surrender', side: 'attacker' },
    { kind: 'surrender', side: 'defender' },
    { kind: 'finished', winner: 'defender' },
  );
  campo.finished = { winner: 'defender', surrender: { gold: 150 } };
  out.push({ nombre: 'batalla · parte de guerra completo', session: parte });

  // 13 · Con un hechizo ya elegido sale la línea de «pulsa sobre la unidad
  //      objetivo», que es la única rama de `renderSpells` con hueco de texto.
  const apuntando = meAtacan(7);
  apuntando.advanceEnemyTurns();
  apuntando.hechizos.selectSpell('magic_arrow');
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

  // 15 · El castillo con un héroe que lleva VETERANOS: cada uno en su fila con
  //      su nivel y lo que le falta —uno en el tope, otro sin llegar al 2—, y el
  //      botón de licenciar solo en la fila de quien se iría, que es el novato de
  //      su tipo.
  const veteranos = new Session(12);
  const casa = veteranos.myTowns()[0]!;
  // Nace dentro de su base (19-10-2026).
  const capitan = veteranos.myHeroes()[0]!;
  capitan.army = [
    { creature: 'goblin-lancero' },
    { creature: 'templario-escudo', veterania: hoja('veterano-1', 70) },
    { creature: 'templario-escudo' },
    { creature: 'elfo-arquero', veterania: hoja('veterano-2', 400) },
    // Con experiencia y sin llegar al primer umbral: «Nivel 1», no «Veterano».
    { creature: 'goblin-lancero', veterania: hoja('veterano-3', 12) },
  ];
  veteranos.openTown(casa.id);
  out.push({ nombre: 'castillo · con veteranos', session: veteranos });

  // 16 · Una batalla con un veterano en el campo: «· nivel 3» en su fila.
  out.push({
    nombre: 'batalla · con un veterano',
    session: meAtacan(7, [
      { creature: 'templario-escudo', veterania: hoja('veterano-1', 70) },
      { creature: 'goblin-lancero' },
    ]),
  });

  // 17 · El castillo con ARMERÍA y un héroe dentro: la lista de lo que vende,
  //      con su «Comprar»; un veterano que lleva una pieza y un novato al que se
  //      le ha puesto otra (los dos en su fila, con su «Lleva:»).
  const armeria = new Session(12);
  const conArmeria = armeria.myTowns()[0]!;
  // Nace dentro de su base (19-10-2026).
  const armero = armeria.myHeroes()[0]!;
  conArmeria.buildings.push('armory');
  armero.army = [
    {
      creature: 'templario-escudo',
      veterania: { ...hoja('veterano-1', 70), equipo: { arma: 'maza' } },
    },
    {
      creature: 'goblin-lancero',
      veterania: { ...hoja('veterano-2', 0), equipo: { armadura: 'brigantina' } },
    },
    { creature: 'goblin-lancero' },
  ];
  armeria.openTown(conArmeria.id);
  out.push({ nombre: 'castillo · con armería y tropa equipada', session: armeria });

  // 18 · El héroe en el mapa con la MOCHILA llena y una pieza elegida: su
  //      «Ponérsela», los «Equipar» de cada fila y los «×» de lo puesto. Le faltan
  //      el arma a distancia, la de carga y el escudo, para que salga el hueco vacío.
  const mochila = new Session(12);
  const cargado = mochila.myHeroes()[0]!;
  cargado.equipo = { arma: 'espada', armadura: 'gambeson' };
  cargado.mochila = ['espada_bendita', 'maza'];
  cargado.army = [
    {
      creature: 'templario-escudo',
      veterania: { ...hoja('veterano-1', 70), equipo: { arma: 'maza' } },
    },
    { creature: 'goblin-lancero' },
    { creature: 'goblin-lancero' },
  ];
  mochila.selectItem('espada_bendita');
  out.push({ nombre: 'aventura · mochila y pieza elegida', session: mochila });

  return out;
}

/**
 * Una crónica con los VEINTE hechos y sus variantes, para anclar
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
    { ...base, kind: 'gold_gained', amount: 1500, actor: 0 },
    { ...base, kind: 'gold_gained', amount: 500, actor: 1 },
    { ...base, kind: 'node_captured', node: 'node-1', from: null, actor: 0 },
    { ...base, kind: 'node_captured', node: 'node-1', from: 1, actor: 0 },
    { ...base, kind: 'node_captured', node: 'node-1', from: 0, actor: 1 },
    { ...base, kind: 'node_captured', node: 'node-1', from: null, actor: 1 },
    { ...base, kind: 'town_captured', town: 'town-1', from: null, actor: 0 },
    { ...base, kind: 'town_captured', town: 'town-1', from: 1, actor: 0 },
    { ...base, kind: 'town_captured', town: 'town-0', from: 0, actor: 1 },
    { ...base, kind: 'town_captured', town: 'town-1', from: null, actor: 1 },
    { ...base, kind: 'built', town: 'town-0', building: 'town_hall', actor: 0 },
    { ...base, kind: 'built', town: 'town-1', building: 'mage_guild_1', actor: 1 },
    { ...base, kind: 'recruited', town: 'town-0', creature: 'goblin-lancero', count: 12, actor: 0 },
    {
      ...base,
      kind: 'recruited',
      town: 'town-1',
      creature: 'esqueleto-guerrero',
      count: 8,
      actor: 1,
    },
    { ...base, kind: 'hero_hired', hero: 'hero-2', town: 'town-0', actor: 0 },
    { ...base, kind: 'hero_hired', hero: 'hero-3', town: 'town-1', actor: 1 },
    { ...base, kind: 'loot_found', hero: 'hero-0', item: 'maza', from: 'raider', actor: 0 },
    {
      ...base,
      kind: 'loot_found',
      hero: 'hero-1',
      item: 'espada_bendita',
      from: 'town',
      actor: 1,
    },
    {
      ...base,
      kind: 'item_bought',
      hero: 'hero-0',
      town: 'town-0',
      item: 'brigantina',
      actor: 0,
    },
    {
      ...base,
      kind: 'item_bought',
      hero: 'hero-1',
      town: 'town-1',
      item: 'arco',
      actor: 1,
    },
    // El nombre lo escribe el narrador, así que va con marcado dentro: el ancla
    // fija que sale escapado.
    {
      ...base,
      kind: 'hero_promoted',
      hero: 'hero-veterano-0',
      town: 'town-0',
      creature: 'templario-escudo',
      name: 'Sir <b>Ana</b> & "Co"',
      actor: 0,
    },
    {
      ...base,
      kind: 'hero_promoted',
      hero: 'hero-veterano-1',
      town: 'town-1',
      creature: 'esqueleto-guerrero',
      name: 'Hueso',
      actor: 1,
    },
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
      attacker: { kind: 'hero', heroId: 'hero-0' },
      foe: { kind: 'monster', objectId: 'obj-1' },
      actor: 0,
    },
    {
      ...base,
      kind: 'battle_ended',
      winner: 'attacker',
      foe: { kind: 'hero', heroId: 'hero-1' },
      owners: { attacker: 0, defender: 1 },
      rounds: 4,
      casts: [{ side: 'attacker', spell: 'magic_arrow', target: 'esqueleto-guerrero', killed: 1 }],
      lost: {
        attacker: [{ creature: 'goblin-lancero', count: 2 }],
        defender: [{ creature: 'esqueleto-guerrero', count: 3 }],
      },
      actor: 0,
    },
    { ...base, kind: 'hero_defeated', hero: 'hero-0', actor: 0 },
    { ...base, kind: 'hero_defeated', hero: 'hero-1', actor: 1 },
    {
      ...base,
      kind: 'hero_returned',
      hero: 'hero-0',
      town: 'town-0',
      surrendered: false,
      actor: 0,
    },
    {
      ...base,
      kind: 'hero_returned',
      hero: 'hero-1',
      town: 'town-1',
      surrendered: true,
      gold: 190,
      actor: 1,
    },
    { ...base, kind: 'rank_up', hero: 'hero-0', rank: 6, actor: 0 },
    { ...base, kind: 'rank_up', hero: 'hero-1', rank: 7, actor: 1 },
    {
      ...base,
      kind: 'troop_rank_up',
      creature: 'templario-escudo',
      rank: 2,
      veterano: 'veterano-1',
      actor: 0,
    },
    {
      ...base,
      kind: 'troop_rank_up',
      creature: 'esqueleto-guerrero',
      rank: 4,
      veterano: 'veterano-2',
      actor: 1,
    },
    { ...base, kind: 'player_defeated', reason: 'lost_base', actor: 1 },
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
