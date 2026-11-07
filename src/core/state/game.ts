/**
 * La partida del mapa de aventura: cómo nace (`createGame`) y **la puerta de toda
 * acción del mapa** (`applyAdventureAction`, que mira el turno y aplica cada una).
 *
 * Un turno de jugador es: mover héroes, construir en los pueblos, reclutar, y
 * pasar. Cuando todos han pasado, avanza el día; los lunes crecen las moradas.
 *
 * Lo demás de la partida vive en `state/` por lo que hace (fase N de la
 * reorganización, 07-11-2026: aquí había 3 841 líneas): lo que se ve y se recuerda
 * (`vision.ts`), la crónica (`cronica.ts`), el reloj (`turnos.ts`), la marcha
 * (`marcha.ts`), las batallas del mapa y su cierre (`batallas.ts`, `cierre.ts`),
 * los lugares de un mundo (`lugares.ts`), los héroes que entran (`heroes.ts`) y el
 * equipo (`equipar.ts`).
 */
import { aplicarDespliegue } from '../battle/despliegue.js';
import { combateBlocker, type ReglasDelCombate } from '../combate.js';
import { ponerPieza, quitarPieza } from '../equipo/manos.js';
import { piezaSiExiste } from '../equipo/pieza.js';
import {
  conEquipoDe,
  destinoDeEquipo,
  equipoDe,
  type Portador,
  sacarDeLaMochila,
} from '../equipo/portador.js';
import { idsPuestos } from '../equipo/vestir.js';
import { loNeutralAlTope } from '../hero/grupos.js';
import { learnable } from '../hero/hero.js';
import { licenciar, withTroops } from '../hero/troop.js';
import { Casillas } from '../map/casillas.js';
import { pointKey } from '../map/geometria.js';
import type { Reachable } from '../map/map.js';
import type { GameMap } from '../map/tipos.js';
import { batallaDe, type EstadoDelMundo, esPremio } from '../mundo/formato.js';
import { mundoDe, opcionBlocker, opcionDe } from '../mundo/reglas.js';
import { ECONOMIA } from '../town/economia.js';
import {
  build as buildInTown,
  payRecruit,
  primeraCiudadDe,
  type Town,
  townSpells,
} from '../town/town.js';
import type { Controller, FactionId, Guarnicion, Hero, PlayerId, Raider } from '../types.js';
import { equipoDeSerieDe } from '../unidad/catalogo.js';
import type { AsaltanteRecordado } from './asaltantes.js';
import { juzgarFormar, stackDelPortador } from './batallas.js';
import {
  currentPlayer,
  describePlayer,
  destinoDeRecluta,
  heroById,
  heroeEnElPueblo,
  heroesOf,
  playerById,
  reclutarBlocker,
  townById,
  townsOf,
  turnBlocker,
} from './consultas.js';
import { anotarLosSitios, emit, fotoDeLosSitios } from './cronica.js';
import { aLaMochila, buyBlocker, equipBlocker, hojaNueva, unequipBlocker } from './equipar.js';
import { dismissBlocker, hireHero, salidaPendienteBlocker } from './heroes.js';
import { anotarLaEleccion, aplicarEfectos } from './lugares.js';
import { moveHero } from './marcha.js';
import {
  ciudadQueMandaBlocker,
  idDelSitio,
  mejorarElPuesto,
  moverTropa,
  ponerLaGuarnicion,
  repartirTropa,
  sitioDeLaCiudad,
} from './sitios.js';
import type { AdventureAction, GameContext, GameState, Player, RememberedObject } from './tipos.js';
import { contarBrote, crecerLasMoradas, nextPlayer, ordenDelDia, startTurn } from './turnos.js';
import { revealAroundTown } from './vision.js';

// ---------------------------------------------------------------- creación

export interface GameConfig {
  readonly seed: number;
  /**
   * El tope de días, **obligatorio**: toda partida se acaba y hay que decir
   * cuándo. Su valor por defecto lo pone `newGame`, que es la única puerta por
   * la que se crean partidas, y así el número vive en un solo sitio en vez de
   * en dos `??` que puedan divergir.
   */
  readonly maxDays: number;
  /** La complejidad del combate, **obligatoria**: la pone `newGame` (por defecto, `COMBATE_COMPLETO`). */
  readonly combate: ReglasDelCombate;
  readonly map: GameMap;
  readonly players: readonly { id: PlayerId; faction: FactionId; controller: Controller }[];
  /**
   * El héroe de salida de cada jugador, ya hecho (`newGame`). Cada uno se paga y se
   * asienta en su base por la puerta de contratar (`hireHero`), salvo el de
   * `porElegir`, que queda pendiente (`Player.heroeDeSalida`).
   */
  readonly heroes: readonly Hero[];
  /** El jugador que elige su héroe de salida en la base; ninguno si falta. */
  readonly porElegir?: PlayerId | undefined;
  readonly towns: readonly Town[];
  /** Las guarniciones con que nace cada sitio (`BuiltMap.guarniciones`); ninguna si falta. */
  readonly guarniciones?: Readonly<Record<string, Guarnicion>>;
  /** Los asaltantes con los que empieza la partida; ninguno si falta. */
  readonly raiders?: readonly Raider[];
  /** El mundo, si la partida es de uno (`GameState.mundo`). */
  readonly mundo?: EstadoDelMundo;
}

export function createGame(config: GameConfig): GameState {
  // El tope se valida AQUÍ y no solo en el borde del entorno, porque la regla es
  // del juego y no de quién la pide. `enteroDelEntorno` ya rechazaba un
  // `HEROES_MAX_DAYS=0` con una frase buena, pero `newGame({ maxDays: 0 })` —o
  // un `-5`— se aceptaba y jugaba **un día**, terminando «sin resolver» en
  // silencio: la misma regla con dos severidades según por qué puerta entres,
  // que es lo que este repositorio llama fallar callando.
  if (!Number.isInteger(config.maxDays) || config.maxDays < 1) {
    throw new Error(
      `una partida de ${config.maxDays} días no es una partida: el tope tiene que ser un entero ≥ 1`,
    );
  }
  const sinCombate = combateBlocker(config.combate);
  if (sinCombate !== null) throw new Error(`no se puede jugar ese combate: ${sinCombate}`);
  // Lo que nace sin héroe, en el tope de la partida (`loNeutralAlTope`, una copia:
  // el mapa de `config` no se toca). El mapa no depende de él —misma semilla, mismo
  // mapa—, la partida sí. Con el de siempre, nada cambia.
  const { map, towns, raiders = [], ...nacidas } = loNeutralAlTope(config, config.combate.tope);

  const players: Player[] = config.players.map((p) => ({
    id: p.id,
    faction: p.faction,
    controller: p.controller,
    oro: ECONOMIA.oroDeSalida,
    fog: Casillas.vacias(config.map),
    memory: new Map<string, RememberedObject>(),
    asaltantesVistos: new Map<string, AsaltanteRecordado>(),
    defeated: false,
    // La primera ciudad suya del mapa: el dueño con que nace una ciudad vive en su
    // objeto, en el orden de las ciudades del plan.
    base:
      primeraCiudadDe(
        config.map.objects.filter((o) => o.kind === 'town'),
        p.id,
      )?.id ?? null,
    heroeDeSalida: null,
  }));

  const state: GameState = {
    seed: config.seed,
    day: 1,
    maxDays: config.maxDays,
    combate: config.combate,
    map,
    players,
    // Los de salida entran por `hireHero`, abajo: pagados como todo héroe.
    heroes: [],
    towns: towns.map((t) => ({
      ...t,
      available: { ...t.available },
      buildings: [...t.buildings],
    })),
    // El primero del día 1 (`ordenDelDia`); `?? 0` solo para una partida sin
    // jugadores, que no juega nadie.
    current: ordenDelDia(config.players, 1)[0] ?? 0,
    pendingBattle: null,
    // Copia de un nivel, como los héroes (la hace `loNeutralAlTope`): la casilla y
    // la tropa de un grupo se SUSTITUYEN al moverse o al pelear, nunca se mutan,
    // así que no hace falta clonar lo que `buildMap` acaba de crear.
    raiders: [...raiders],
    finished: null,
    log: [],
    siguienteVeterano: 1,
    siguienteBotin: 0,
    siguienteHeroe: 1,
    // Las que nacen con el mapa (`BuiltMap.guarniciones`), copiadas: la partida las
    // cambia y el mapa no.
    guarniciones: Object.fromEntries(
      Object.entries(nacidas.guarniciones ?? {}).map(([id, g]) => [
        id,
        { dueño: g.dueño, tropa: [...g.tropa] },
      ]),
    ),
  };
  if (config.mundo !== undefined) {
    state.mundo = {
      historia: config.mundo.historia,
      estados: { ...config.mundo.estados },
      marcas: [...config.mundo.marcas],
      cobradas: { ...config.mundo.cobradas },
      vencidos: { ...config.mundo.vencidos },
      conversaciones: { ...config.mundo.conversaciones },
    };
  }

  // Los pueblos arrancan con la hornada de la primera semana.
  crecerLasMoradas(state);

  // Cada héroe de salida, pagado y asentado en su base por la puerta de todo
  // héroe, en el sitio donde antes solo se fijaban sus puntos y miraba: antes que
  // los castillos y que el primer hecho, así que la niebla y lo apuntado salen
  // en el mismo orden que cuando nacía gratis.
  for (const hero of config.heroes) {
    const player = playerById(state, hero.owner);
    player.heroeDeSalida = { ...hero, army: [...hero.army] };
    if (hero.owner === config.porElegir) continue;
    if (player.base === null) {
      throw new Error(
        `el ${describePlayer(state, player.id)} no tiene base donde asentar a su héroe de salida`,
      );
    }
    hireHero(state, player.id, player.base, hero.tipo);
  }
  for (const town of state.towns) revealAroundTown(state, town);

  emit(state, { kind: 'day_start', day: 1, week: 1, actor: null, at: null });
  // Los grupos con los que nace el mapa se cuentan igual que los que brotan un
  // lunes: la regla de quién se entera es UNA —el sello, al ocurrir— y no
  // depende de cuándo nació el grupo. Lo que no inunda la crónica de la
  // persona no es callarlos aquí, sino que el panel no pinta este hecho de
  // mapa (`renderLog`): el grupo ya se ve en el lienzo.
  for (const raider of state.raiders) contarBrote(state, raider);
  startTurn(state);
  return state;
}

// ---------------------------------------------------------------- acciones

/**
 * Aplica una acción de mapa.
 *
 * `quien` es **quién dice ser el que actúa**, y es obligatorio: una acción no
 * lleva dentro a su autor, así que sin este dato el núcleo daba por hecho que
 * quien llama es el jugador de turno. Con un `endTurn()` asíncrono en el
 * cliente eso dejó de ser cierto —se puede construir o reclutar mientras corre
 * el turno del rival—, y lo único que salía era `ese pueblo no es tuyo`, que es
 * verdad a medias y despista: el pueblo sí es tuyo, lo que no es tuyo es el
 * turno.
 *
 * Fue opcional un rato y no compraba nada: una comprobación que se apaga sola
 * al olvidar un argumento es la única que no avisa de que falta.
 *
 * `alcance` sí es opcional, y por lo contrario: es una **pista de rendimiento**
 * —el Dijkstra desde el héroe, ya recorrido— que solo tiene quien acaba de
 * hacerlo. El cliente, el servidor y el agente no traen camino, así que sin
 * ella `move_hero` recorre el mapa como siempre. Lo que no es opcional es que
 * salga del sitio donde está el héroe: eso lo comprueba `caminoDelHeroe`.
 */
export function applyAdventureAction(
  state: GameState,
  action: AdventureAction,
  ctx: GameContext,
  quien: PlayerId,
  alcance?: Reachable,
): void {
  if (state.pendingBattle !== null) {
    throw new Error('hay una batalla pendiente de resolver');
  }
  // La partida terminada y el turno ajeno los dice `turnBlocker`, que es donde
  // vive la frase: aquí no se reescribe ninguna de las dos.
  const bloqueo = turnBlocker(state, quien);
  if (bloqueo !== null) throw new Error(bloqueo);
  // Con el héroe de salida por elegir, lo único que se hace es elegirlo.
  if (action.type !== 'hire_hero') {
    const pendiente = salidaPendienteBlocker(state, quien);
    if (pendiente !== null) throw new Error(pendiente);
  }

  // Quién actúa se anota ANTES de la acción: `end_turn` cambia `state.current`,
  // y el que acaba de meter su héroe en el castillo es el jugador saliente.
  const actor = currentPlayer(state).id;
  const antes = fotoDeLosSitios(state);
  aplicar(state, action, ctx, alcance);
  anotarLosSitios(state, antes);

  // Y nada se aprende después del final. `aplicar` puede terminar la partida
  // —capturar el último castillo del rival lo hace—, y esta sincronía iba
  // detrás sin preguntar: en 34 de 200 semillas la crónica acababa con «Fin de
  // la partida» y DEBAJO «El jugador 1 aprende: Prisa, Lentitud», que además se
  // pinta así en pantalla. La regla que rompía está escrita en `settleBattle`
  // —`game_over` es el ÚLTIMO hecho del registro— y no la vigilaba nadie;
  // ahora sí (`test/invariantes.test.ts`).
  if (state.finished === null) syncSpellbooks(state, actor);
}

/**
 * Los héroes propios parados en un pueblo propio con gremio aprenden lo que ese
 * gremio enseña, sin duplicados y hasta donde les deje su Sabiduría.
 *
 * Es sincronía, no acción: no hay nada ilegal que rechazar, así que no lanza —
 * y por eso no existe una acción de "aprender" ni en el cliente ni en el
 * contrato del agente. Se pasa entera tras cada acción de aventura (≤4 héroes
 * por unos pocos pueblos) en vez de parchear por separado los tres caminos que
 * llevan a aprender —entrar al pueblo, contratar allí y construir el gremio con
 * el héroe dentro—, que es donde se olvidaría el cuarto. Al entrar y no al
 * empezar el turno, para que quien lee "enseña Prisa" no tenga que esperar a
 * mañana para saberla.
 */
function syncSpellbooks(state: GameState, playerId: PlayerId): void {
  const pueblos = townsOf(state, playerId);
  if (pueblos.length === 0) return;

  for (const hero of heroesOf(state, playerId)) {
    const town = pueblos.find((t) => pointKey(t.at) === pointKey(hero.at));
    if (town === undefined) continue;
    const nuevos = learnable(hero, townSpells(town));
    if (nuevos.length === 0) continue;
    hero.spells = [...hero.spells, ...nuevos];
    emit(state, {
      kind: 'spells_learned',
      hero: hero.id,
      town: town.id,
      spells: nuevos,
      actor: hero.owner,
      at: town.at,
    });
  }
}

function aplicar(
  state: GameState,
  action: AdventureAction,
  ctx: GameContext,
  alcance: Reachable | undefined,
): void {
  switch (action.type) {
    case 'end_turn':
      nextPlayer(state, ctx);
      return;

    case 'move_hero':
      moveHero(state, action.hero, action.to, ctx, alcance);
      return;

    case 'hire_hero': {
      hireHero(state, currentPlayer(state).id, action.town, action.tipo);
      return;
    }

    case 'build': {
      const town = townById(state, action.town);
      const player = currentPlayer(state);
      const manda = ciudadQueMandaBlocker(state, town, player.id);
      if (manda !== null) throw new Error(`no se puede construir: ${manda}`);
      player.oro = buildInTown(town, action.building, player.oro);
      emit(state, {
        kind: 'built',
        town: town.id,
        building: action.building,
        actor: player.id,
        at: town.at,
      });
      return;
    }

    case 'recruit': {
      const town = townById(state, action.town);
      const player = currentPlayer(state);
      const manda = ciudadQueMandaBlocker(state, town, player.id);
      if (manda !== null) throw new Error(`no se puede reclutar: ${manda}`);

      const destino = destinoDeRecluta(state, town);
      // Lo que el pueblo puede dar y lo que cabe (`reclutarBlocker`), ANTES de
      // cobrar: `payRecruit` descuenta las criaturas del pueblo y el oro del
      // monedero, y un rechazo después de pagar sería tropa pagada y perdida.
      const motivo = reclutarBlocker(town, action.creature, action.count, destino, player.oro);
      if (motivo !== null) throw new Error(`no se puede reclutar: ${motivo}`);
      const ampliado = withTroops(destino.army, action.creature, action.count);

      player.oro = payRecruit(town, action.creature, action.count, player.oro);
      const hero = destino.hero;
      // Reclutar no toca los puntos de hoy: se fijan al empezar el día
      // (`startTurn`), y la tropa nueva cuenta a partir de mañana.
      if (hero !== undefined) hero.army = ampliado;
      else ponerLaGuarnicion(state, sitioDeLaCiudad(town), player.id, ampliado);
      emit(state, {
        kind: 'recruited',
        town: town.id,
        creature: action.creature,
        count: action.count,
        actor: player.id,
        at: town.at,
      });
      return;
    }

    case 'dismiss': {
      const hero = heroById(state, action.hero);
      const player = currentPlayer(state);
      if (hero.owner !== player.id) throw new Error(`${hero.name} no es de tu bando`);
      const noSe = dismissBlocker(state, hero, action.creature, action.count);
      if (noSe !== null) throw new Error(`no se puede licenciar: ${noSe}`);
      const { queda, seVan } = licenciar(hero.army, action.creature, action.count);
      hero.army = queda;
      // Lo que llevaban puesto vuelve a la mochila: se licencia en un castillo
      // propio, con el héroe delante, y tirar una espada con quien se va no lo
      // pidió nadie (decisión del usuario sobre el plan).
      aLaMochila(hero, ...seVan.flatMap((t) => idsPuestos(t.veterania?.equipo)));
      emit(state, {
        kind: 'dismissed',
        hero: hero.id,
        creature: action.creature,
        count: action.count,
        actor: player.id,
        at: hero.at,
      });
      return;
    }

    case 'dejar_tropa':
    case 'recoger_tropa': {
      const player = currentPlayer(state);
      // Lanza con la frase de `intercambioBlocker`, la que le llega al agente en el veredicto.
      const { hero, sitio, creature, count } = moverTropa(state, player.id, action.type, action);
      emit(state, {
        kind: action.type === 'dejar_tropa' ? 'troops_left' : 'troops_taken',
        hero: hero.id,
        site: idDelSitio(sitio),
        creature,
        count,
        actor: player.id,
        at: hero.at,
      });
      return;
    }

    case 'repartir_tropa': {
      const player = currentPlayer(state);
      // Lanza con `repartirTropaBlocker`, la regla que lee también la pantalla.
      const { hero, sitio, deja, recoge } = repartirTropa(state, player.id, action);
      emit(state, {
        kind: 'troops_exchanged',
        hero: hero.id,
        site: idDelSitio(sitio),
        left: deja,
        taken: recoge,
        actor: player.id,
        at: hero.at,
      });
      return;
    }

    case 'mejorar_el_puesto': {
      const player = currentPlayer(state);
      // Lanza con `mejorarBlocker`, la regla que lee también el botón del diálogo.
      const { hero, nodo, obra, precio } = mejorarElPuesto(
        state,
        player.id,
        action.hero,
        action.obra,
        player.oro,
      );
      player.oro -= precio;
      emit(state, {
        kind: 'outpost_upgraded',
        hero: hero.id,
        site: nodo.id,
        to: obra,
        cost: precio,
        actor: player.id,
        at: nodo.at,
      });
      return;
    }

    case 'buy_item': {
      const town = townById(state, action.town);
      const player = currentPlayer(state);
      const noSe = buyBlocker(state, town, action.item, player.id);
      if (noSe !== null) throw new Error(`no se puede comprar: ${noSe}`);
      // `buyBlocker` ya ha mirado que el héroe está y que la pieza existe.
      const hero = heroeEnElPueblo(state, town) as Hero;
      const pieza = piezaSiExiste(action.item)!;
      player.oro -= pieza.precio;
      aLaMochila(hero, pieza.id);
      emit(state, {
        kind: 'item_bought',
        hero: hero.id,
        town: town.id,
        item: pieza.id,
        actor: player.id,
        at: town.at,
      });
      return;
    }

    case 'equip': {
      const hero = heroById(state, action.hero);
      const noSe = equipBlocker(state, currentPlayer(state).id, action);
      if (noSe !== null) throw new Error(`no se puede equipar: ${noSe}`);
      // Equipar es estado y no un hecho, como la patrulla de un asaltante: no se
      // cuenta en la crónica. Lo que cuenta es de dónde salió la pieza.
      const quien = destinoDeEquipo(hero, action) as Portador;
      // Todo o nada: lo que puede lanzar va antes de tocar al héroe. Sacaba la
      // pieza de la mochila antes de `ponerPieza`, y cuando esa lanzaba la pieza
      // se perdía (H1 del QA de fuerza y agilidad, 26-10-2026). Y con lo de serie
      // debajo, que es lo que mira `equipBlocker`: la daga de un arquero es su
      // primera arma.
      const { equipo, quitada } = ponerPieza(
        equipoDe(hero, quien),
        action.item,
        undefined,
        action.hueco,
        equipoDeSerieDe(hero, quien),
      );
      const vestido = conEquipoDe(hero, quien, equipo, () => hojaNueva(state));
      hero.mochila = sacarDeLaMochila(hero.mochila, action.item);
      vestir(hero, vestido);
      aLaMochila(hero, quitada);
      return;
    }

    case 'elegir_en_lugar': {
      // Antes que la pregunta de la opción, que mira el turno del dueño del héroe:
      // con el héroe del rival diría «todavía no es tu turno», y sí lo es.
      const deOtro = state.heroes.find((h) => h.id === action.hero);
      if (deOtro !== undefined && deOtro.owner !== currentPlayer(state).id) {
        throw new Error('no se puede elegir eso: ese héroe no es tuyo');
      }
      const noSe = opcionBlocker(state, action.hero, action);
      if (noSe !== null) throw new Error(`no se puede elegir eso: ${noSe}`);
      const hero = heroById(state, action.hero);
      const { lugar, opcion } = opcionDe(state, action.hero, action);
      anotarLaEleccion(mundoDe(state), action, opcion, hero);
      // Con batalla, lo que da la opción se da al ganarla, entero (`applyVictory`; M1
      // de la vuelta 2 de QA de la F1a): perder no da nada y deja volver a pelear.
      const hace = opcion.hace ?? [];
      const ahora = batallaDe(opcion) === null ? hace : hace.filter((e) => !esPremio(e));
      aplicarEfectos(state, hero.owner, hero, lugar, ahora, ctx, action);
      return;
    }

    case 'formar': {
      // La formación entera se calcula una vez: la juzga y la mueve la misma
      // batalla de la formación, con las reglas del despliegue.
      const juicio = juzgarFormar(state, currentPlayer(state).id, action);
      if ('motivo' in juicio) throw new Error(`no se puede formar: ${juicio.motivo}`);
      const { hero, batalla, stack } = juicio;
      aplicarDespliegue(batalla, { type: 'colocar', stack: stack.id, at: action.at }, ctx.rng);
      // Estado y no un hecho, como equipar: nadie lo cuenta en la crónica. Se
      // guarda la formación ENTERA tal como queda: quien no tenía casilla la tenía
      // por la regla de hoy en un hueco libre, y al vaciar o llenar uno se
      // correría solo, sin que nadie lo hubiera movido.
      hero.salida = stackDelPortador(batalla, { heroe: true }).hex;
      hero.army = hero.army.map((t, indice) => ({
        ...t,
        salida: stackDelPortador(batalla, { indice }).hex,
      }));
      return;
    }

    case 'unequip': {
      const hero = heroById(state, action.hero);
      const noSe = unequipBlocker(state, currentPlayer(state).id, action);
      if (noSe !== null) throw new Error(`no se puede desequipar: ${noSe}`);
      // El `as` lo respalda `unequipBlocker`, que acaba de decir que sí.
      const quien = destinoDeEquipo(hero, action) as Portador;
      const { equipo, quitada } = quitarPieza(equipoDe(hero, quien), action.slot);
      vestir(hero, conEquipoDe(hero, quien, equipo));
      aLaMochila(hero, quitada);
      return;
    }
  }
}

/**
 * Escribe en `hero` lo que calcula `conEquipoDe`, que no lo toca: el estado
 * guarda la referencia del héroe, así que se cambian sus campos y no el héroe.
 */
function vestir(hero: Hero, vestido: Pick<Hero, 'equipo' | 'army'>): void {
  hero.equipo = vestido.equipo;
  hero.army = vestido.army;
}
