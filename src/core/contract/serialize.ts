/**
 * Qué ve el agente en cada petición.
 *
 * Se manda un resumen, no el estado entero: lo justo para decidir, con ids
 * estables para que pueda pedir detalles con las tools de consulta. Volcar el
 * mundo completo en cada turno llenaría su contexto de ruido.
 */
import { activeStack, legalActions, stackHexes, stackSpeed } from '../battle/battle.js';
import { stackHp } from '../battle/damage.js';
import { effectiveLuck } from '../battle/effects.js';
import type { BattleState, Side } from '../battle/types.js';
import { creature, isShooter } from '../data.js';
import { maxMana, maxMovePoints } from '../hero/hero.js';
import { pointFromKey, pointKey } from '../map/map.js';
import { costeDeEntrada, isWalkable, TERRAIN_KINDS } from '../map/terrain.js';
import { cronicaPara } from '../state/events.js';
import { type GameState, heroesOf, playerById, townsOf, visibleNow, week } from '../state/game.js';
import { building } from '../town/buildings.js';
import {
  availableBuildings,
  dailyIncome,
  dwellings,
  mageGuildLevel,
  townSpells,
} from '../town/town.js';
import type { Army, PlayerId } from '../types.js';
import { RESOURCE_KINDS } from '../types.js';

function armyView(army: Army): { slot: number; creature: string; count: number; speed: string }[] {
  return army.flatMap((stack, slot) =>
    stack === null
      ? []
      : [
          {
            slot,
            creature: stack.creature,
            count: stack.count,
            speed: creature(stack.creature).speed,
          },
        ],
  );
}

/**
 * Los objetos del mapa **tal como los recuerda un jugador**, cada uno con la
 * fecha de su recuerdo.
 *
 * Está fuera de `serializeAdventureTurn` porque tiene dos consumidores: el
 * `knownMap` de cada turno y la consulta `map` (#74), que hasta ahora devolvía
 * `state.map.objects` entero —el mapa del rival incluido—. La regla de «qué
 * objetos conoce este jugador» se escribe aquí y solo aquí; si se copiara, la
 * copia volvería a quedarse atrás, que es exactamente lo que pasó.
 *
 * Levanta su propio `visibleNow`, sin recibirlo: la consulta no tiene ningún
 * otro motivo para construirlo, y encadenárselo al llamante haría que el
 * próximo se lo pasara mal calculado. Son 81 claves por héroe una vez por
 * petición del agente, no algo que corra dentro de una partida.
 */
function knownObjects(state: GameState, playerId: PlayerId) {
  const player = playerById(state, playerId);

  // Dos capas, y la diferencia importa: `fog` es «esto lo conozco alguna vez» y
  // `mirando` es «esto lo estoy viendo ahora». Del presente solo se puede
  // afirmar lo segundo; de lo demás se manda el RECUERDO, con su fecha.
  const mirando = visibleNow(state, playerId);
  const vivos = new Map(state.map.objects.map((o) => [o.id, o]));

  // El `switch` de dentro cubre la unión entera de `o.kind` y no lleva
  // `default`: un `default` para callar al linter escondería justo lo que
  // interesa ver rojo, que un `kind` nuevo del mapa no se serializa.
  //
  // Quien lo pone rojo es el `never` de abajo, y no el `biome-ignore` que
  // hubo aquí: comprobado quitando el `case 'chest'`, con el `ignore`
  // puesto **compilaba y linteaba limpio**. Un guardia ciego durante todo
  // el tiempo que nadie lo rompió a mano.
  return [...player.memory.values()].map((recuerdo) => {
    // Lo que se está mirando ahora es presente; lo demás, memoria.
    const mirandolo = mirando.has(pointKey(recuerdo.object.at));
    const o = mirandolo ? (vivos.get(recuerdo.object.id) ?? recuerdo.object) : recuerdo.object;
    const cuando = { lastSeen: mirandolo ? state.day : recuerdo.day };
    switch (o.kind) {
      case 'mine':
        return {
          kind: o.kind,
          id: o.id,
          at: o.at,
          resource: o.resource,
          owner: o.owner,
          ...cuando,
        };
      case 'resource':
        return {
          kind: o.kind,
          id: o.id,
          at: o.at,
          resource: o.resource,
          amount: o.amount,
          taken: o.taken,
          ...cuando,
        };
      case 'town':
        return { kind: o.kind, id: o.id, at: o.at, owner: o.owner, ...cuando };
      case 'monster':
        return {
          kind: o.kind,
          id: o.id,
          at: o.at,
          creature: o.creature,
          count: o.count,
          defeated: o.defeated,
          ...cuando,
        };
      case 'chest':
        return { kind: o.kind, id: o.id, at: o.at, gold: o.gold, taken: o.taken, ...cuando };
    }
    // Exhaustivo: con un `kind` nuevo del mapa, `o` deja de ser `never`
    // aquí y esta línea NO compila. Y como termina en `throw`, el linter
    // ya ve que no hay camino sin salida y no hace falta callarlo.
    const sinSerializar: never = o;
    throw new Error(`objeto del mapa sin serializar: ${JSON.stringify(sinSerializar)}`);
  });
}

/**
 * El mapa **filtrado por la niebla de un jugador**: lo que responde la consulta
 * `map` (#74), que antes devolvía `state.map` tal cual, **y el `knownMap` de
 * cada `adventure_turn`** (#85). Los dos, desde aquí: si la tool le promete al
 * agente que trae lo mismo que el turno, lo mínimo es que salga de la misma
 * llamada. Igual que `knownObjects`, y por el mismo motivo — la copia se queda
 * atrás, que es exactamente lo que había pasado.
 *
 * No lleva anotación de retorno a propósito: el tipo lo infiere el compilador y
 * quien lo necesite lo escribe donde lo usa (`ReturnType<typeof …>`), que es el
 * mismo criterio con el que se borraron los alias de `agent.ts`.
 *
 * La capa es `fog` —«lo exploré alguna vez»— y no `visibleNow`, y el motivo es
 * que el terreno y los caminos **no cambian**: el recuerdo de un hecho estático
 * *es* el hecho, así que no lleva `lastSeen`. Los objetos sí cambian y por eso
 * siguen viniendo de `memory` con su fecha.
 *
 * **Una casilla sin explorar va como `null` en `terrain`**, no como hierba: el
 * índice sigue siendo `y * width + x`, igual que en `state.map.terrain`, y el
 * agente puede distinguir llanura de ignorancia. Al día 6 el 45,3 % de las
 * casillas serían mentira si se rellenaran con un terreno por defecto.
 *
 * `roads` solo trae las casillas exploradas. Su ausencia **no** significa que no
 * haya camino: lo desambigua el terreno de esa misma casilla, que si es `null`
 * quiere decir que ahí no se sabe nada de nada.
 *
 * **Y salen como `{x, y}`, no como la clave `"x,y"` con la que se guardan.** El
 * `Set<string>` es cómo `GameMap` almacena los caminos, no cómo se cuentan: lo
 * que se filtraba a la red era el detalle de almacenamiento. En este mismo
 * contrato el agente **escribe** los caminos como puntos —`mapPlanSchema.roads`
 * es `z.array(pointSchema)`— así que leerlos como cadenas era pedirle dos
 * formatos para el mismo hecho, y era el único campo del payload que no venía
 * como `{x, y}`. Cuesta unos 800 B por cada 100 casillas con camino, y **cero**
 * en toda partida procedimental, porque `generateMapPlan` no dibuja ninguno; a
 * cambio se cae la advertencia que había que escribirle al agente para que
 * supiera leer el campo, que es un guardia que no existía.
 */
export function serializeKnownMap(state: GameState, playerId: PlayerId) {
  const player = playerById(state, playerId);
  const { width, terrain, roads } = state.map;

  return {
    width,
    height: state.map.height,
    terrain: terrain.map((t, i) =>
      player.fog.has(pointKey({ x: i % width, y: Math.floor(i / width) })) ? t : null,
    ),
    roads: [...roads].filter((clave) => player.fog.has(clave)).map(pointFromKey),
    objects: knownObjects(state, playerId),
  };
}

/**
 * Lo que cuesta entrar en cada terreno, **resuelto llamando a `costeDeEntrada`**.
 *
 * Vino de `agent.ts` con el bloque de prosa al que pertenece, y sigue sin llevar
 * fórmula ninguna: **las dos columnas ya calculadas**, recto y diagonal, de modo
 * que el agente suma lo mismo que el motor sin multiplicar ni redondear. Si
 * mañana el camino deja de ser plano o el redondeo cambia a `floor`, estas
 * cifras cambian solas.
 *
 * Se recorre `TERRAIN_KINDS` y no `Object.entries`, que perdía el tipo de la
 * clave y obligaba a un `as`. El agua se cae sola por `isWalkable`, la misma
 * función que usa el pathfinding: el día que se navegue, aparece sin que nadie
 * se acuerde. Y el orden es por coste, estable sobre el de declaración: ni un
 * `localeCompare`, que sería la única comparación sensible al idioma en un texto
 * que tiene que ser el mismo en dos partidas iguales.
 */
const COSTE_POR_TERRENO = TERRAIN_KINDS.filter(isWalkable)
  .map((t) => ({ t, recto: costeDeEntrada(t, false, false), obl: costeDeEntrada(t, false, true) }))
  .sort((a, b) => a.recto - b.recto)
  .map(({ t, recto, obl }) => `${t} ${recto} (${obl} en diagonal)`)
  .join(', ');

/** Lo mismo para una casilla con camino: no depende del terreno que haya debajo. */
const COSTE_CON_CAMINO = `${costeDeEntrada('grass', true, false)} (${costeDeEntrada('grass', true, true)} en diagonal)`;

/**
 * **Cómo se lee lo que devuelve `serializeKnownMap`**, en prosa y una sola vez.
 *
 * Vive pegado al serializador porque el fallo que cierra es exactamente el de
 * añadirle un campo y olvidar la descripción: quien edite la función de arriba
 * tropieza con esto. Lo leen las **dos** puertas por las que sale ese objeto —
 * `RESPONSE_FORMAT.adventure_turn` (`agent.ts`) y la descripción de la tool
 * `map` (`mcp/server.ts`)— y hasta este ciclo eran dos prosas escritas a mano
 * que se citaban la una a la otra: «es lo mismo que viaja en knownMap» / «es lo
 * mismo que devuelve la tool map». #85 unificó el **dato** y las dejó
 * divergiendo en el mismo commit — la de la tool no tenía el agua, ni los
 * costes, ni el formato de los caminos, así que quien llamaba a la tool recibía
 * una descripción estrictamente peor del mismo objeto.
 *
 * Va en `core` y no en `notas.ts` por la frontera que aquel módulo declara:
 * `RESPONSE_FORMAT` **anuncia antes** y las notas **informan después**. Esto es
 * lo primero.
 *
 * **Sangrado dos espacios, y no es cosmético.** Las dos puertas lo introducen con
 * una línea que acaba en dos puntos, y en `RESPONSE_FORMAT` esa línea es una
 * viñeta más de una lista larga: sin la sangría, un `- "terrain"` se lee como un
 * campo de la raíz del payload y no como uno de `knownMap`. Cada puerta pone lo
 * suyo delante —que la tool se puede pedir sin esperar turno, que en el turno ya
 * lo tienes delante—, que es lo único que de verdad las diferencia.
 */
export const COMO_SE_LEE_EL_MAPA = `  Trae width, height, terrain[], roads[] y objects[]:
  - "terrain" es un array plano de width×height casillas, indexado y*width+x: la
    casilla {x,y} está en terrain[y*width+x]. Un null NO es un tipo de terreno, es
    una casilla que no has explorado: ahí no sabes nada —ni el suelo, ni si hay
    camino, ni qué hay encima— y no vale suponer que es hierba.
  - "roads" son las casillas con camino que has explorado, como puntos {x,y},
    igual que los escribes tú en un plan de mapa. Que falte una NO significa que
    no haya camino: si el terreno de esa casilla es null, es que no lo has visto.
  - "objects" es lo que has OBSERVADO, no lo que es verdad ahora: cada objeto trae
    "lastSeen" con el día en que lo viste. Si "lastSeen" es anterior a hoy, el dato
    puede haber caducado —una mina cambia de dueño y tú sigues viendo la bandera
    vieja hasta que alguien vuelva a mirar—. Una mina tuya que dejó de dar recursos
    es la señal de que allí ha pasado algo.
  - Con "terrain" y "roads" eliges la ruta antes de andarla, en vez de descubrirla
    al pisarla:
    - El agua NO se cruza. No hay barcos: una casilla de agua no es un atajo caro,
      es un muro, y un destino al otro lado obliga a rodear.
    - Entrar en una casilla cuesta esto en puntos de movimiento, y la cifra entre
      paréntesis es la que se cobra si entras en diagonal —las dos son ya el precio
      final, no hay nada que aplicarles—:
      ${COSTE_POR_TERRENO}.
    - Si la casilla tiene camino cuesta ${COSTE_CON_CAMINO} se pinte sobre el
      terreno que se pinte, y por eso un rodeo por carretera sale a menudo más
      barato que la línea recta por el barro.
    - Compáralo con los puntos de movimiento que le queden hoy al héroe
      ("movePoints") para saber hasta dónde llegas.`;

export function serializeAdventureTurn(state: GameState, playerId: PlayerId): unknown {
  const player = playerById(state, playerId);

  // `visibleNow` otra vez —`knownObjects` levanta el suyo—, y aquí se usa para
  // lo que no es el mapa: qué héroes enemigos se están viendo AHORA.
  const mirando = visibleNow(state, playerId);
  const observado = (p: { x: number; y: number }): boolean => mirando.has(pointKey(p));

  return {
    kind: 'adventure_turn',
    you: {
      player: playerId,
      faction: player.faction,
      day: state.day,
      week: week(state),
      resources: Object.fromEntries(RESOURCE_KINDS.map((k) => [k, player.resources[k]])),
    },
    heroes: heroesOf(state, playerId).map((h) => ({
      id: h.id,
      name: h.name,
      at: h.at,
      // El nivel viaja y la experiencia no: el nivel es lo que ya significa
      // algo —sale en la crónica y el agente lo ve subir—, mientras que los
      // puntos sueltos serían un número sin escala hasta que exista la tabla
      // del lado del agente. Va con su línea en `RESPONSE_FORMAT`: un dato
      // nuevo que el contrato no nombra es un dato que el agente no mira.
      level: h.level,
      movePoints: h.movePoints,
      maxMovePoints: maxMovePoints(h),
      attack: h.attack,
      defense: h.defense,
      spellPower: h.spellPower,
      knowledge: h.knowledge,
      mana: `${h.mana}/${maxMana(h)}`,
      // Sin esto el agente decide adónde caminar sin saber qué sabe su héroe: la
      // batalla le ofrece los `cast` legales, pero para entonces ya ha elegido.
      spells: h.spells,
      army: armyView(h.army),
    })),
    towns: townsOf(state, playerId).map((t) => ({
      id: t.id,
      name: t.name,
      at: t.at,
      income: dailyIncome(t),
      mageGuild: mageGuildLevel(t),
      // Ids, como `buildings` y `recruitable`: el detalle lo da la tool
      // `spell_list` y no hace falta repetirlo en cada turno.
      teaches: townSpells(t).map((s) => s.id),
      builtToday: t.builtToday,
      buildings: t.buildings,
      canBuildNow: availableBuildings(t, player.resources).map((id) => ({
        id,
        name: building(id).name,
        cost: building(id).cost,
      })),
      recruitable: dwellings(t).map(({ creature: id }) => ({
        creature: id,
        available: t.available[id] ?? 0,
        cost: creature(id).cost,
      })),
      garrison: armyView(t.garrison),
    })),
    // Solo lo que este jugador ha OBSERVADO, y tal como lo observó. El agente no
    // ve por las paredes, y tampoco ve el futuro de una casilla que dejó atrás:
    // `lastSeen` dice de qué día es cada dato, y si es de ayer puede haber
    // dejado de ser verdad.
    //
    // Es **la misma llamada** que responde la tool `map`, y esa es toda la
    // garantía de que las dos devuelven lo mismo (#85). Aquí había un
    // `{width, height, objects}` escrito a mano: el agente elegía el destino de
    // cada `move_hero` sin saber por dónde se anda, mientras `MAPA_DESCRIPCION`
    // le prometía que la tool traía «lo mismo que viaja en knownMap». Lo que lo
    // vuelve a separar no es olvidarse de un campo, es escribir un segundo
    // serializador.
    knownMap: serializeKnownMap(state, playerId),
    // Un héroe enemigo se ve o no se ve: no hay recuerdo que mandar, porque una
    // posición de anteayer es ruido y no intel. Antes bastaba con haber pisado
    // esa casilla alguna vez, así que el agente seguía al rival por medio mapa
    // sin tener a nadie cerca.
    enemyHeroes: state.heroes
      .filter((h) => h.owner !== playerId && observado(h.at))
      .map((h) => ({ id: h.id, owner: h.owner, at: h.at, army: armyView(h.army) })),
    // La crónica pasa por la niebla, igual que el mapa desde #35: antes iba el
    // log ENTERO y el agente le seguía los pasos al rival leyendo su diario. La
    // regla completa —a quién le consta, cuántos caben y el sello que se queda
    // en casa— la escribe `cronicaPara`, y el porqué con su medida está en la
    // cabecera de `events.ts`. Aquí solo se dice el tamaño de la ventana.
    recentEvents: cronicaPara(state, playerId, 25),
  };
}

/**
 * De quién son los ojos con los que se mira una batalla: **si el bando `side`
 * es de quien pregunta, o de otro** (#73).
 *
 * Es obligatorio y no opcional con defecto a propósito. Un defecto hace que el
 * próximo llamante se lleve los secretos por no escribir nada, que es
 * exactamente cómo se abrió esta: `consultas.ts` pasaba `'attacker'` cuando la
 * batalla no era tuya —el rival contra un monstruo neutral— y el atacante es
 * **siempre** un jugador, así que lo que volvía era el héroe de una persona con
 * su maná y su libro. Medido 8/8, y la situación ocurre 111 veces en 200
 * partidas.
 */
export type VistaDeBatalla = 'propia' | 'ajena';

/**
 * La batalla vista desde `side`, con lo público separado de lo del bando.
 *
 * **Público**, porque es lo que se ve pasar en el tablero: la ronda, quién es
 * el bando mirado, qué stack tiene el turno, el tablero, los stacks enteros
 * —efectos, disparos, moral y suerte— y el registro, que cuenta hechizos ya
 * lanzados: eso lo has visto ocurrir.
 *
 * **Del bando**: `hero.mana` y `hero.spells`, que son lo que *podría* lanzar y
 * con cuánto. Con `vista: 'ajena'` esos dos no se emiten y el resto del héroe
 * —nombre y estadísticas— se queda: negarle la vista entera no era la decisión,
 * y sigue sin serlo.
 *
 * Y `legalActions` va **solo si la vista es propia y el stack activo es de
 * `side`**: es la del stack activo sea de quien sea, y sus entradas `cast`
 * enumeran el libro de ese héroe filtrado por su maná —la misma fuga por la
 * puerta de al lado—. La promesa del contrato, «elegir una nunca falla», solo
 * es cierta cuando te toca a ti; en `director.ts` esa condición no muerde nunca,
 * porque allí `side` es el bando del stack que decide.
 */
export function serializeBattleTurn(
  battle: BattleState,
  side: Side,
  vista: VistaDeBatalla,
): unknown {
  const stackView = (s: (typeof battle.stacks)[number]) => {
    const info = creature(s.creature);
    return {
      id: s.id,
      side: s.side,
      creature: s.creature,
      name: info.name,
      count: s.count,
      hp: stackHp(s),
      hex: s.hex,
      occupies: stackHexes(s),
      speed: stackSpeed(s),
      attack: info.attack,
      defense: info.defense,
      damage: info.damage,
      shooter: isShooter(info),
      shotsLeft: s.shotsLeft,
      traits: info.traits ?? [],
      // La suerte va ya con los efectos aplicados: el contrato promete el
      // valor con el que se va a tirar, no el de la ficha. La moral no tiene
      // efectos temporales que aplicar, así que es la suya y ya.
      morale: s.morale,
      luck: effectiveLuck(s),
      // Y aparte, cuánto le queda a cada cosa: sin esto el agente ve el número
      // cambiar de una ronda a otra sin saber por qué ni hasta cuándo.
      effects: s.effects.map((e) => ({
        kind: e.kind,
        amount: e.amount,
        source: e.source,
        roundsLeft: e.roundsLeft,
      })),
      defending: s.defending,
      waited: s.waited,
    };
  };

  const hero = battle.heroes[side];
  const propia = vista === 'propia';
  const activo = activeStack(battle);

  return {
    kind: 'battle_turn',
    round: battle.round,
    yourSide: side,
    activeStack: battle.activeId,
    board: { width: 11, height: 9, layout: 'offset odd-r; el atacante entra por la columna 0' },
    stacks: battle.stacks.filter((s) => s.count > 0).map(stackView),
    hero:
      hero === null
        ? null
        : {
            name: hero.name,
            attack: hero.attack,
            defense: hero.defense,
            spellPower: hero.spellPower,
            castThisRound: hero.castThisRound,
            // Los dos únicos campos del bando, juntos y en una línea que se lee:
            // con qué maná cuenta y qué sabe lanzar. De un héroe ajeno no salen.
            ...(propia ? { mana: hero.mana, spells: hero.spells } : {}),
          },
    // Todas las acciones legales del stack activo: elegir una nunca falla —
    // cuando te toca. Si el stack activo no es de `side`, esta lista es la de
    // OTRO y sus `cast` son su libro y su maná: no se manda.
    ...(propia && activo !== null && activo.side === side
      ? { legalActions: legalActions(battle) }
      : {}),
    log: battle.log.slice(-30),
  };
}

export interface MapRequestOptions {
  readonly width: number;
  readonly height: number;
  /**
   * **Los ids, no cuántos** (#101). Con un número, el agente sabía que había dos
   * jugadores y tenía que sacar de una convención en prosa —«numerados desde
   * 0»— que eran el 0 y el 1. El llamante tiene la lista en la mano
   * (`MapRequestOptions.players`) y la tiraba con un `.length`.
   */
  readonly players: readonly PlayerId[];
  readonly theme?: string;
}

export function serializeMapRequest(opts: MapRequestOptions): unknown {
  return {
    kind: 'map_generate',
    want: {
      width: opts.width,
      height: opts.height,
      players: opts.players,
      theme: opts.theme ?? 'un valle en disputa entre un reino caballeresco y una necrópolis',
    },
    palette: {
      // Derivada, no copiada: era la tercera declaración de la misma lista de
      // ocho y se habría quedado atrás en silencio el día que entrara un terreno.
      terrains: [...TERRAIN_KINDS],
      resources: RESOURCE_KINDS,
      factions: ['knight', 'necromancer'],
      creaturesForGuards: [
        'peasant',
        'archer',
        'pikeman',
        'swordsman',
        'skeleton',
        'zombie',
        'mummy',
        'vampire',
      ],
    },
    advice: [
      'Reparte las minas para que ningún jugador nazca sin madera ni mineral.',
      'Los monstruos custodian lo bueno: cuanto mejor el premio, más dura la guardia.',
      'Deja el centro del mapa disputado y los bordes seguros.',
    ],
  };
}
