/**
 * Qué ve el agente en cada petición.
 *
 * Se manda un resumen, no el estado entero: lo justo para decidir, con ids
 * estables para que pueda pedir detalles con las tools de consulta. Volcar el
 * mundo completo en cada turno llenaría su contexto de ruido.
 */

import { fuerzaDe, MARGEN_CONTRA_NEUTRALES, poderDe } from '../ai/fuerza.js';
import { armaduraDe, ruedaDelGolpe } from '../battle/armas.js';
import {
  activeStack,
  casillasDeCarga,
  legalActionsAndCosts,
  pasosQueQuedan,
  previsionDeLaRueda,
  stackById,
  stackHexes,
  stackSpeed,
} from '../battle/battle.js';
import { type Paso, tableroDelContrato } from '../battle/board.js';
import { stackHp } from '../battle/damage.js';
import { effectiveLuck } from '../battle/effects.js';
import { type CifrasDeLaRueda, efectoDeGolpe } from '../battle/rueda.js';
import {
  type BattleStack,
  type BattleState,
  type OrigenDelStack,
  queEs,
  rangoDeVeterania,
  type Side,
} from '../battle/types.js';
import {
  cifrasDeUnidad,
  type UnidadDelJuego,
  unidadDelJuego,
  unidadesDeFaccion,
} from '../catalogo.js';
import {
  ASALTANTES,
  EQUIPO,
  isShooter,
  LIDERAZGO,
  NIVEL_POR_SUELO,
  tiposDeHeroe,
} from '../data.js';
import type { VeteranoEnBase } from '../hero/ascenso.js';
import { cifrasDePieza, deDondeSale, PIEZAS_DE_ARMERIA, seVende } from '../hero/equipo.js';
import {
  RANGO_MAXIMO_DE_TROPA,
  rangoDeHeroe,
  rangoDeTropa,
  siguienteUmbral,
} from '../hero/experiencia.js';
import { heroUnit, maxMana, maxMovePoints } from '../hero/hero.js';
import {
  armyLeadership,
  GARRISON_LEADERSHIP,
  heroLeadership,
  type Personajes,
  troopSummary,
} from '../hero/troop.js';
import { minasDeLasRegiones, regionesDelMapa } from '../map/generate.js';
import { pointFromKey } from '../map/map.js';
import { LADO_DEL_RECINTO, SEPARACION_DE_CIUDADES } from '../map/recinto.js';
import {
  BARRERAS,
  BARRERAS_DE_DESNIVEL,
  costeDeEntrada,
  SUELOS_PISABLES,
  TERRAIN_KINDS,
} from '../map/terrain.js';
import { indiceDePoder, nivelDeUnidad } from '../nivel.js';
import { asaltantesALaVista } from '../state/asaltantes.js';
import { cronicaPara } from '../state/events.js';
import {
  baseOf,
  type GameState,
  hayHuecoDeHeroe,
  heroeEnLaBase,
  heroesALaVista,
  heroesOf,
  MAX_HEROES_PER_PLAYER,
  objetosConocidos,
  ordenDelDia,
  playerById,
  townsOf,
  veteranosEnSuBase,
  visibleNow,
  week,
} from '../state/game.js';
import { building } from '../town/buildings.js';
import { construidoEn } from '../town/sitios.js';
import {
  availableBuildings,
  dailyIncome,
  dwellings,
  mageGuildLevel,
  type Town,
  tieneArmeria,
  townSpells,
} from '../town/town.js';
import { vecinosDeLaBase, vozDe } from '../town/voces.js';
import type { Army, Equipo, PlayerId } from '../types.js';
import { describirCoste, FACTION_IDS, HUECOS, RESOURCE_KINDS, TIPOS_DE_GOLPE } from '../types.js';
import {
  accionAlAgente,
  HIT_DE_GOLPE,
  type Hit,
  hechoAlAgente,
  SLOT_DE_HUECO,
  type Slot,
} from './vocabulario.js';

/**
 * El ejército tal como lo lee el agente: agrupado por criatura, con cuántos
 * individuos lleva de cada una. Agrupa `troopSummary`, que es el único sitio
 * que lo hace; un personaje va en su propia fila, con su `member` y su
 * velocidad, que es la de su perfil y no la de ningún catálogo.
 *
 * Ya no lleva `slot`: con la tropa de individuos no hay huecos que numerar.
 * Un veterano va en su fila con `rank`, su `level` (el de sus cifras con su
 * equipo, `nivelDeUnidad`), `experience` y `nextRankAt` (la experiencia a la que sube de
 * rango; `null` en el tope).
 */
function armyView(
  army: Army,
  characters: Personajes,
): {
  creature: string;
  member?: string;
  count: number;
  speed: string;
  rank?: number;
  level?: number;
  experience?: number;
  nextRankAt?: number | null;
  id?: string;
  equipment?: Record<string, string | null>;
}[] {
  return troopSummary(army, characters).map((g) => ({
    creature: g.creature,
    ...(g.member === undefined ? {} : { member: g.member }),
    count: g.count,
    speed: g.unit.speed,
    // Solo en la fila de un veterano, que va sola (`troopSummary`): una fila de
    // novatos no tiene experiencia que contar, y un `rank: 1` en cada una
    // engordaría todos los turnos para no decir nada.
    //
    // Con su `id`, que es lo que el agente escribe en `equip.veteran` y
    // `unequip.veteran`, y su `equipment` con la misma forma que el del héroe
    // —los cinco huecos, en inglés, `null` el vacío—: un novato equipado tiene hoja
    // (experiencia 0) y por eso va en su fila con las dos cosas.
    ...(g.veterania === undefined
      ? {}
      : {
          id: g.veterania.id,
          rank: g.rango,
          level: nivelDeUnidad(g.unit),
          experience: g.veterania.experiencia,
          nextRankAt: g.siguiente,
          equipment: equipoView(g.veterania.equipo),
        }),
  }));
}

/**
 * Lo que lleva puesto alguien, por hueco, con `null` en el vacío: los cinco
 * huecos siempre, con su nombre del contrato (`SLOT_DE_HUECO`). **Una sola
 * forma** para el héroe y para la fila de un individuo.
 */
function equipoView(equipo: Equipo | undefined): Readonly<Record<Slot, string | null>> {
  return Object.fromEntries(HUECOS.map((h) => [SLOT_DE_HUECO[h], equipo?.[h] ?? null])) as Record<
    Slot,
    string | null
  >;
}

/**
 * El catálogo de equipo en prosa, **derivado de `EQUIPO`** y no escrito a mano,
 * con las cifras ya resueltas como los costes del terreno y de dónde sale cada
 * pieza (`deDondeSale`): el agente no tiene otra forma de saber lo que vale una
 * pieza, y una cifra que se le anuncia y no cuadra no la descubre nadie. Lo
 * interpola `RESPONSE_FORMAT.adventure_turn`.
 */
export const CATALOGO_DE_EQUIPO_EN_PROSA: string = EQUIPO.map((p) => {
  const venta = seVende(p) ? ` por ${describirCoste({ gold: p.precio })}` : '';
  return `    ${p.id} (${SLOT_DE_HUECO[p.hueco]}): ${cifrasDePieza(p)} · ${deDondeSale(p)}${venta}`;
}).join('\n');

/**
 * Los objetos del mapa **tal como los recuerda un jugador**, cada uno con la
 * fecha de su recuerdo.
 *
 * Está fuera de `serializeAdventureTurn` porque tiene dos consumidores: el
 * `knownMap` de cada turno y la consulta `map` (#74), que hasta ahora devolvía
 * `state.map.objects` entero —el mapa del rival incluido—. La regla de «qué
 * sabe este jugador de cada objeto» es `objetosConocidos`, la misma que pinta
 * el lienzo de quien juega (#64); aquí solo se viste para el cable. Si se
 * copiara, la copia volvería a quedarse atrás, que es exactamente lo que pasó.
 *
 * Levanta su propio `visibleNow`, sin recibirlo: la consulta no tiene ningún
 * otro motivo para construirlo, y encadenárselo al llamante haría que el
 * próximo se lo pasara mal calculado. Son 81 claves por héroe una vez por
 * petición del agente, no algo que corra dentro de una partida.
 */
function knownObjects(state: GameState, playerId: PlayerId) {
  // Dos capas, y la diferencia importa: `fog` es «esto lo conozco alguna vez» y
  // `visibleNow` es «esto lo estoy viendo ahora». Del presente solo se puede
  // afirmar lo segundo; de lo demás se manda el RECUERDO, con su fecha. La
  // regla es `objetosConocidos`, la misma que pinta el lienzo de quien juega.
  const conocidos = objetosConocidos(state, playerId, visibleNow(state, playerId));

  // El `switch` de dentro cubre la unión entera de `o.kind` y no lleva
  // `default`: un `default` para callar al linter escondería justo lo que
  // interesa ver rojo, que un `kind` nuevo del mapa no se serializa.
  //
  // Quien lo pone rojo es el `never` de abajo, y no el `biome-ignore` que
  // hubo aquí: comprobado quitando el `case 'chest'`, con el `ignore`
  // puesto **compilaba y linteaba limpio**. Un guardia ciego durante todo
  // el tiempo que nadie lo rompió a mano.
  return conocidos.map(({ day, object: o }) => {
    const cuando = { lastSeen: day };
    switch (o.kind) {
      case 'mine':
        return { kind: o.kind, id: o.id, at: o.at, resource: o.resource, ...cuando };
      case 'node':
        return { kind: o.kind, id: o.id, at: o.at, owner: o.owner, ...cuando };
      case 'village':
        return { kind: o.kind, id: o.id, at: o.at, name: o.name, ...cuando };
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
 * No lleva anotación de retorno a propósito, y ningún serializador de este
 * fichero la lleva (#109): el tipo lo infiere el compilador y quien lo necesite
 * lo escribe donde lo usa (`ReturnType<typeof …>`), que es el mismo criterio con
 * el que se borraron los alias de `agent.ts`. Un `: unknown` obligaba a
 * `consultas.ts` a castear y a preguntar por los campos con cadenas.
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
 * `Set<string>` de `GameMap.caminos.casillas` es cómo se preguntan los caminos,
 * no cómo se cuentan: lo que se filtraba a la red era el detalle de
 * almacenamiento. En este mismo contrato el agente **escribe** los caminos como
 * puntos —`mapPlanSchema.roads` es `z.array(pointSchema)`— así que leerlos como
 * cadenas era pedirle dos formatos para el mismo hecho, y era el único campo
 * del payload que no venía como `{x, y}`. Cuesta unos 800 B por cada 100
 * casillas con camino; a cambio se cae la advertencia que había que escribirle
 * al agente para que supiera leer el campo, que es un guardia que no existía.
 *
 * **Casillas y no tramos**, también desde que el mapa guarda tramos (#153): lo
 * que el agente necesita del camino es lo que cuesta pisar cada casilla, y eso
 * va por casilla. Los tramos son cómo se pinta.
 */
export function serializeKnownMap(state: GameState, playerId: PlayerId) {
  const player = playerById(state, playerId);
  const { width, terrain, caminos } = state.map;
  // Los asaltantes se ven AHORA o no se ven, como un héroe enemigo: se mueven
  // cada día, y un recuerdo de dónde estaban sería ruido con fecha. Por eso no
  // van en `objects`, que es memoria. Qué grupo se ve lo dice
  // `asaltantesALaVista` —basta ver su región (#130)—, la misma que pinta el
  // cliente: un grupo puede venir sobre una casilla con `terrain: null`.
  const vistos = asaltantesALaVista(state, visibleNow(state, playerId));

  return {
    width,
    height: state.map.height,
    terrain: terrain.map((t, i) => (player.fog.hasIndex(i) ? t : null)),
    roads: [...caminos.casillas].map(pointFromKey).filter((p) => player.fog.has(p)),
    objects: knownObjects(state, playerId),
    raiders: vistos.map((r) => ({ id: r.id, at: r.at, troops: r.troops, strength: poderDe(r) })),
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
 * Se recorre `SUELOS_PISABLES` y no `Object.entries`, que perdía el tipo de la
 * clave y obligaba a un `as`: es la lista de lo que se pisa, derivada con la
 * misma `isWalkable` que usa el pathfinding, así que el día que se navegue el
 * agua aparece sin que nadie se acuerde. Y el orden es por coste, estable sobre
 * el de declaración: ni un `localeCompare`, que sería la única comparación
 * sensible al idioma en un texto que tiene que ser el mismo en dos partidas
 * iguales.
 */
const COSTE_POR_TERRENO = SUELOS_PISABLES.map((t) => ({
  t,
  recto: costeDeEntrada(t, false, false),
  obl: costeDeEntrada(t, false, true),
}))
  .sort((a, b) => a.recto - b.recto)
  .map(({ t, recto, obl }) => `${t} ${recto} (${obl} en diagonal)`)
  .join(', ');

/**
 * Lo que no se pisa, **sacado de `BARRERAS`** y no escrito: la frase decía «el
 * agua y la montaña» a mano, y con tres barreras nuevas habría mentido por
 * omisión.
 */
const BARRERAS_EN_PROSA = BARRERAS.map((t) => `"${t}"`).join(', ');

/** Lo mismo para una casilla con camino: no depende del terreno que haya debajo. */
const COSTE_CON_CAMINO = `${costeDeEntrada('grass', true, false)} (${costeDeEntrada('grass', true, true)} en diagonal)`;

/**
 * La línea que dice al agente que hay veteranos de rango máximo en su base a
 * los que **no** se pregunta porque el tope de héroes está lleno, o nada si no
 * los hay. Antes eso iba solo a la consola del director (M4 de QA): el agente
 * tenía que deducirlo de un `rank: 5` en la guarnición, su cuenta de héroes y
 * la prosa. Se deriva de las dos mismas preguntas que hace el director para no
 * preguntar —`veteranosEnSuBase` y `hayHuecoDeHeroe`—, así que no puede decir
 * otra cosa que lo que pasó. Va solo cuando aplica, como `story`.
 */
function veteranosEsperando(
  state: GameState,
  playerId: PlayerId,
): { readonly veteransWaiting?: string } {
  if (hayHuecoDeHeroe(state, playerId)) return {};
  const n = veteranosEnSuBase(state, playerId).length;
  if (n === 0) return {};
  const quien =
    n === 1
      ? `1 veterano de rango ${RANGO_MAXIMO_DE_TROPA} espera`
      : `${n} veteranos de rango ${RANGO_MAXIMO_DE_TROPA} esperan`;
  return {
    veteransWaiting: `${quien} en tu base para hacerse héroe, pero ya tienes ${MAX_HEROES_PER_PLAYER} de ${MAX_HEROES_PER_PLAYER} héroes: no se te preguntará hasta que haya sitio.`,
  };
}

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
export const COMO_SE_LEE_EL_MAPA = `  Trae width, height, terrain[], roads[], objects[] y raiders[]:
  - "terrain" es un array plano de width×height casillas, indexado y*width+x: la
    casilla {x,y} está en terrain[y*width+x]. Un null NO es un tipo de terreno, es
    una casilla que no has explorado: ahí no sabes nada —ni el suelo, ni si hay
    camino, ni qué hay encima— y no vale suponer que es hierba.
  - "roads" son las casillas con camino que has explorado, como puntos {x,y},
    igual que los escribes tú en un plan de mapa. Que falte una NO significa que
    no haya camino: si el terreno de esa casilla es null, es que no lo has visto.
  - "objects" es lo que has OBSERVADO, no lo que es verdad ahora: cada objeto trae
    "lastSeen" con el día en que lo viste. Si "lastSeen" es anterior a hoy, el dato
    puede haber caducado —un nodo cambia de dueño y tú sigues viendo la bandera
    vieja hasta que alguien vuelva a mirar—.
  - El mapa es una RED: regiones cerradas por barreras —las que no se pisan, y
    se dicen más abajo—, y "node" y "town"
    son los únicos pasos entre ellas. Un "node" se toma pisándolo, de camino o
    parando; una ciudad ("town") es un nodo con guarnición que se toma
    venciéndola, o entrando si está vacía. Una región es tuya cuando lo son TODOS
    los nodos que la rodean, y solo produce si además está unida a tu base por
    regiones y nodos tuyos: las minas ("mine") y los pueblos ("village") no se
    toman, son de quien tenga su región. Una región que deja de darte recursos es
    que alguien te ha cortado un paso.
  - Tu base ("yourBase") es la partida: si la pierdes quedas eliminado en el
    acto, aunque te queden héroes y ciudades. Lo mismo le pasa al rival. Las
    dos nacen con guarnición, así que tomarla es una batalla mientras le quede
    tropa dentro.
  - Cada ciudad ocupa un RECINTO amurallado de ${LADO_DEL_RECINTO}×${LADO_DEL_RECINTO} casillas con ella en el medio,
    y se entra por sus puertas: las de las caras a las que llega un camino (al
    norte, al sur o en las esquinas, nunca al este ni al oeste) y la del puente
    de una ciudad junto a un río. El resto de su recinto no se pisa aunque sea
    hierba: desde fuera se pasa de un acceso a la puerta y de la puerta a la
    ciudad. La puerta y la ciudad cuestan como un camino.
  - Un héroe enemigo o una ciudad ajena con guarnición se alcanzan pero no se
    cruzan: pedirlos de destino es pedir la batalla, y un "move_hero" a otro
    sitio los rodea por otro paso si lo hay. Si no lo hay, no hay camino.
  - "raiders" son los grupos de ASALTANTES que ves AHORA, con su tropa
    ("troops") y su fuerza ("strength"). No son de nadie: viven en una región
    sin dueño y la patrullan, moviéndose cada día sin salir de ella ni pegarse a
    un nodo. Un grupo se ve en cuanto ves cualquier casilla de su región, aunque
    su casilla siga sin explorar ("terrain" null). Si uno no aparece no significa
    que no esté: puede estar en una región que no ves. Se dispersan en cuanto su región tiene dueño, y cada lunes puede
    brotar uno nuevo en cualquier región sin dueño donde no haya nadie.
  - Un grupo de asaltantes EMBOSCA al héroe que pisa una casilla de su región
    si su fuerza pasa de ${String(MARGEN_CONTRA_NEUTRALES).replace('.', ',')} veces la del héroe
    ("heroes[].strength"): la marcha se para ahí y empieza una batalla que tú
    juegas DEFENDIENDO. Basta con pisar la región, no hace falta acercarse. Un
    héroe parado no se ataca. Con menos fuerza que eso no embosca, y tú puedes
    atacarlo pidiendo su casilla de destino: como un héroe enemigo, se alcanza
    pero no se cruza.
  - Con "terrain" y "roads" eliges la ruta antes de andarla, en vez de descubrirla
    al pisarla:
    - ${BARRERAS_EN_PROSA} NO se cruzan. No hay barcos ni puertos de montaña: una
      casilla de una de ellas no es un atajo caro, es un muro, y un destino al otro
      lado obliga a rodearla o, si separa dos regiones, a pasar por un nodo.
    - Entrar en una casilla cuesta esto en puntos de movimiento, y la cifra entre
      paréntesis es la que se cobra si entras en diagonal —las dos son ya el precio
      final, no hay nada que aplicarles—:
      ${COSTE_POR_TERRENO}.
    - Si la casilla tiene camino cuesta ${COSTE_CON_CAMINO} sea cual sea su suelo,
      y por eso un rodeo por carretera sale a menudo más barato que la línea
      recta por el barro. Un camino solo está en casillas que se pisan: nunca
      atraviesa una barrera, salvo por la puerta de una ciudad.
    - Compáralo con los puntos de movimiento que le queden hoy al héroe
      ("movePoints") para saber hasta dónde llegas.`;

export function serializeAdventureTurn(state: GameState, playerId: PlayerId) {
  const player = playerById(state, playerId);

  // `visibleNow` otra vez —`knownObjects` levanta el suyo—, y aquí se usa para
  // lo que no es el mapa: qué héroes enemigos se están viendo AHORA.
  const mirando = visibleNow(state, playerId);

  return {
    kind: 'adventure_turn',
    you: {
      player: playerId,
      faction: player.faction,
      day: state.day,
      week: week(state),
      // El de hoy, sin los eliminados: con él sabe si cierra el día (y vuelve a
      // jugar enseguida) o lo abre (y el rival juega dos seguidos).
      turnOrder: ordenDelDia(state.players, state.day).filter(
        (id) => !playerById(state, id).defeated,
      ),
      resources: Object.fromEntries(RESOURCE_KINDS.map((k) => [k, player.resources[k]])),
    },
    // A dónde vuelve un héroe derrotado o rendido, o `null` si ya no tiene base:
    // decide si rendirse existe y qué cuesta perder un héroe.
    yourBase: baseOf(state, playerId)?.id ?? null,
    ...veteranosEsperando(state, playerId),
    heroes: heroesOf(state, playerId).map((h) => ({
      id: h.id,
      name: h.name,
      // El tipo, inerte todavía, y la historia si nació de la tropa. Van con su
      // línea en `RESPONSE_FORMAT`, como todo campo de aquí.
      type: h.tipo,
      ...(h.origen === undefined ? {} : { story: h.origen.historia }),
      at: h.at,
      // El rango con su experiencia y el umbral del siguiente, como una fila de
      // veterano de `army`: la escala es una sola (el héroe empieza en el 5,
      // donde la tropa acaba), así que las dos se leen igual. Y su nivel, el de
      // su cuerpo con su equipo (`nivelDeUnidad`), que es con el que pega y recibe
      // los golpes. Va con su línea en `RESPONSE_FORMAT`: un dato que el contrato no
      // nombra no lo mira nadie.
      rank: rangoDeHeroe(h),
      level: nivelDeUnidad(heroUnit(h)),
      experience: h.experience,
      nextRankAt: siguienteUmbral(h.experience),
      movePoints: h.movePoints,
      maxMovePoints: maxMovePoints(h, state.characters),
      attack: h.attack,
      defense: h.defense,
      spellPower: h.spellPower,
      knowledge: h.knowledge,
      mana: `${h.mana}/${maxMana(h)}`,
      // Sin esto el agente decide adónde caminar sin saber qué sabe su héroe: la
      // batalla le ofrece los `cast` legales, pero para entonces ya ha elegido.
      spells: h.spells,
      army: armyView(h.army, state.characters),
      // Lo que ocupa su ejército y su tope. El tope crece con el rango y un
      // `recruit` que se pase se rechaza: sin las dos cifras delante, el agente
      // solo se enteraría al leer el veredicto.
      leadership: { used: armyLeadership(h.army), max: heroLeadership(h) },
      // Su fuerza, la misma medida que la de los asaltantes de `knownMap`: sin
      // las dos cifras el agente no puede saber si un grupo lo emboscará.
      strength: fuerzaDe(h, state.characters),
      // Lo que lleva puesto y lo que lleva en la mochila, por id: el catálogo
      // con las cifras va en `RESPONSE_FORMAT`, no en cada turno.
      equipment: equipoView(h.equipo),
      backpack: [...h.mochila],
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
        cost: { gold: unidadDelJuego(id).oro },
        leadership: unidadDelJuego(id).leadership,
      })),
      garrison: armyView(t.garrison, state.characters),
      garrisonLeadership: { used: armyLeadership(t.garrison), max: GARRISON_LEADERSHIP },
      // Solo si la tiene: lo que vende y a qué precio. Una lista vacía en cada
      // pueblo sin armería engordaría el turno para no decir nada.
      ...(tieneArmeria(t)
        ? {
            armory: PIEZAS_DE_ARMERIA.map((p) => ({
              item: p.id,
              slot: SLOT_DE_HUECO[p.hueco],
              cost: { gold: p.precio },
            })),
          }
        : {}),
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
    // La regla es `heroesALaVista`, la misma que pinta el lienzo de quien juega.
    enemyHeroes: heroesALaVista(state, playerId, mirando)
      .filter((h) => h.owner !== playerId)
      .map((h) => ({
        id: h.id,
        owner: h.owner,
        at: h.at,
        army: armyView(h.army, state.characters),
      })),
    // La crónica pasa por la niebla, igual que el mapa desde #35: antes iba el
    // log ENTERO y el agente le seguía los pasos al rival leyendo su diario. La
    // regla completa —a quién le consta, cuántos caben y el sello que se queda
    // en casa— la escribe `cronicaPara`, y el porqué con su medida está en la
    // cabecera de `events.ts`. Aquí solo se dice el tamaño de la ventana.
    recentEvents: cronicaPara(state, playerId, 25),
  };
}

/**
 * La petición `hero_from_troop`: el veterano que se hace héroe, lo que fue y lo
 * que puede elegir.
 *
 * La hoja de servicios viaja entera —batallas, bajas y los nombres de los
 * héroes que derribó— porque es la materia con la que el narrador escribe la
 * historia: «el héroe lo crea la IA en base al personaje». `heroTypes` son los
 * de la facción del JUGADOR, que es la del héroe que nace, y `heroes` el tope,
 * para que la petición no prometa un sitio que no hay (con el tope lleno no se
 * pide: `Director`).
 */
export function serializeHeroFromTroop(state: GameState, playerId: PlayerId, v: VeteranoEnBase) {
  const player = playerById(state, playerId);
  return {
    kind: 'hero_from_troop',
    you: { player: playerId, faction: player.faction },
    veteran: {
      id: v.veterania.id,
      creature: v.creature,
      creatureName: unidadDelJuego(v.creature).name,
      rank: rangoDeTropa(v.veterania),
      level: nivelDeUnidad(cifrasDeUnidad(v.creature, v.veterania)),
      experience: v.veterania.experiencia,
      battles: v.veterania.batallas,
      kills: v.veterania.bajas,
      heroesDefeated: v.veterania.heroes,
      // Dónde está ahora: en la guarnición o en la tropa de qué héroe.
      in: v.heroe === null ? 'garrison' : { hero: v.heroe },
    },
    town: { id: v.base.id, name: v.base.name },
    heroTypes: tiposDeHeroe(player.faction).map((t) => ({
      id: t.id,
      name: t.nombre,
      description: t.descripcion,
    })),
    heroes: { count: heroesOf(state, playerId).length, max: MAX_HEROES_PER_PLAYER },
  };
}

/**
 * La petición `town_voices`: las bases de `playerId` cuyas voces hay que rehacer,
 * con su gente y lo que dice ahora.
 *
 * Lleva lo que da de qué hablar —qué hay construido, quién está dentro, cuánta
 * guarnición la guarda— y la crónica corta (10 hechos, por la niebla como
 * todo): el narrador escribe para esta semana, no un informe. La instrucción
 * «presentación, nunca reglas» va en la prosa del formato (`RESPONSE_FORMAT`).
 */
export function serializeTownVoices(state: GameState, playerId: PlayerId, towns: readonly Town[]) {
  const player = playerById(state, playerId);
  const semana = week(state);
  return {
    kind: 'town_voices',
    you: { player: playerId, faction: player.faction },
    day: state.day,
    week: semana,
    towns: towns.map((t) => {
      const heroe = heroeEnLaBase(state, playerId, t);
      return {
        id: t.id,
        name: t.name,
        buildings: t.buildings.map((id) => building(id).name),
        hero: heroe === null ? null : { name: heroe.name, type: heroe.tipo },
        garrison: armyView(t.garrison, state.characters),
        npcs: vecinosDeLaBase(t).map((v) => ({
          id: v.id,
          name: v.nombre,
          role: v.papel,
          building: v.sitio === null ? null : building(construidoEn(t, v.sitio) as string).name,
          current: vozDe(t, v.id, semana, state.day),
        })),
      };
    }),
    recentEvents: cronicaPara(state, playerId, 10),
  };
}

/**
 * De quién son los ojos con los que se mira una batalla: **si el bando `side`
 * es de quien pregunta, o de otro** (#73).
 *
 * Es obligatorio y no opcional con defecto a propósito. Un defecto hace que el
 * próximo llamante se lleve los secretos por no escribir nada, que es
 * exactamente cómo se abrió esta: `consultas.ts` pasaba `'attacker'` cuando la
 * batalla no era tuya —el rival contra un monstruo neutral— y el atacante era
 * entonces siempre un jugador, así que lo que volvía era el héroe de una
 * persona con su maná y su libro. Medido 8/8, y la situación ocurría 111 veces
 * en 200 partidas. Desde los asaltantes el atacante puede ser un grupo neutral
 * que embosca, sin héroe; la vista ajena sigue siendo la que hace falta, porque
 * no sabe ni le importa quién es el atacante.
 */
export type VistaDeBatalla = 'propia' | 'ajena';

/**
 * Lo que el agente ve del origen de un stack. Solo el héroe se marca —tu héroe
 * o el rival en el tablero: si cae, su bando pierde—; una criatura y un
 * personaje se leen por sus cifras. Con un `switch` exhaustivo para que un
 * origen nuevo obligue a decidir aquí si el agente tiene que saberlo.
 */
function marcaDelOrigen(origen: OrigenDelStack): { commander?: true; veteranRank?: number } {
  switch (origen.kind) {
    case 'heroe':
      return { commander: true };
    case 'catalogo':
    case 'personaje': {
      // La veteranía se ve en el tablero —los galones de la figura—, así que
      // es pública como la moral: sus cifras ya van en `attack`/`defense`.
      // Desde el rango 2, que es lo que promete la prosa y lo que pintan los
      // galones: con 180 de los 200 del primer umbral todavía no es veterano.
      const rango = rangoDeVeterania(origen);
      return rango > 1 ? { veteranRank: rango } : {};
    }
  }
}

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
 * porque allí `side` es el bando del stack que decide. Cuando no va, va
 * `legalActionsOmitted` con el motivo: `not_your_battle` (vista ajena),
 * `nobody_active` (nadie tiene el turno) o `not_your_turn` (lo tiene el otro
 * bando). Exactamente uno de los dos campos viaja siempre.
 *
 * `oro` es el del jugador dueño de `side` y viaja como `yourGold` solo con la
 * vista propia: es del bando, como el maná. Lo pasa quien llama porque la
 * batalla no lo sabe —un castillo que se defiende sin héroe no lleva monedero—,
 * y hace falta para leer el precio de `surrender` (H-2 de la fase 1b). Con la
 * vista ajena se pasa `null` y no se emite.
 */
export function serializeBattleTurn(
  battle: BattleState,
  side: Side,
  vista: VistaDeBatalla,
  oro: number | null,
) {
  const hero = battle.heroes[side];
  const propia = vista === 'propia';
  if (propia && oro === null) {
    throw new Error(
      `la vista propia del ${side} necesita el oro de su dueño: sin él no se lee el precio de rendirse`,
    );
  }
  const activo = activeStack(battle);

  return {
    kind: 'battle_turn',
    round: battle.round,
    yourSide: side,
    ...(propia ? { yourGold: oro } : {}),
    activeStack: battle.turno?.stack ?? null,
    // El ordinal del turno: lo que dice si la siguiente petición sigue siendo el
    // MISMO turno de la misma unidad o uno nuevo (la moral extra), que mirando
    // solo `activeStack` no se distingue.
    turnId: battle.turno?.n ?? null,
    board: tableroDelContrato(),
    stacks: stacksVistos(battle),
    hero:
      hero === null
        ? null
        : {
            name: hero.name,
            // Sus cifras de combate van en su stack, el de `commander: true`.
            spellPower: hero.spellPower,
            castThisRound: hero.castThisRound,
            // Los dos únicos campos del bando, juntos y en una línea que se lee:
            // con qué maná cuenta y qué sabe lanzar. De un héroe ajeno no salen.
            ...(propia ? { mana: hero.mana, spells: hero.spells } : {}),
          },
    // Todas las acciones legales del stack activo: elegir una nunca falla —
    // cuando te toca. Si el stack activo no es de `side`, esta lista es la de
    // OTRO y sus `cast` son su libro y su maná: no se manda.
    // Y lo que le queda de turno: con el movimiento en tramos, las casillas que
    // aún puede andar. Va con la lista porque es del mismo stack y solo se
    // manda cuando ese stack es tuyo.
    // Y las cargas que tiene a mano, si hay alguna —a qué enemigo y desde qué
    // casilla—: la carga se ENSEÑA con el movimiento posible, y sale de
    // `casillasDeCarga`, la misma regla que la cobra —sin el rasgo `charge` sale
    // vacía, así que aquí no se pregunta—.
    //
    // Cuando no va, va el MOTIVO que se decidió aquí, como código (#107): quien
    // lo explica —`consultas.ts`— lo lee y no vuelve a derivarlo. Re-derivarlo
    // era reescribir esta condición menos un término, y el día que hubiera un
    // tercer motivo la nota habría afirmado con confianza uno de los dos viejos.
    ...(!propia
      ? { legalActionsOmitted: 'not_your_battle' as const }
      : activo === null
        ? { legalActionsOmitted: 'nobody_active' as const }
        : activo.side !== side
          ? { legalActionsOmitted: 'not_your_turn' as const }
          : delTurnoPropio(battle, activo)),
    log: registroVisto(battle),
  };
}

/**
 * Lo que solo va cuando el turno es tuyo: la lista legal (en los nombres del
 * contrato, `accionAlAgente`), lo que le queda de turno, sus cargas y, si puede
 * golpear cuerpo a cuerpo, lo que hace cada golpe de la rueda con su arma
 * (`hits`, `efectoDeGolpe` con `ruedaDelGolpe`: lo mismo que lee la persona en
 * las notas de la rueda).
 */
function delTurnoPropio(battle: BattleState, activo: BattleStack) {
  // Con el recorrido que ya hizo la lista legal: las cargas salen de él.
  const { actions: legales, costs } = legalActionsAndCosts(battle);
  const golpea = legales.some((a) => a.type === 'attack');
  return {
    legalActions: legales.map(accionAlAgente),
    stepsLeft: pasosQueQuedan(battle, activo),
    ...chargeFrom(battle, activo, costs),
    ...(golpea ? { hits: golpesDeLaRueda(ruedaDelGolpe(activo.unit, 'arma')) } : {}),
  };
}

/** Lo que hace cada golpe de la rueda con estas cifras, en los nombres del contrato. */
function golpesDeLaRueda(rueda: CifrasDeLaRueda): { hit: Hit; effect: string }[] {
  return TIPOS_DE_GOLPE.map((t) => ({
    hit: HIT_DE_GOLPE[t],
    effect: efectoDeGolpe(t, 'golpe', true, rueda),
  }));
}

/** Los stacks vivos como los ve el agente (`stackView`), en el orden de la batalla. */
function stacksVistos(battle: BattleState) {
  return battle.stacks.filter((s) => s.count > 0).map(stackView);
}

/** Los últimos hechos de la batalla, con el cruce en los nombres del contrato (`hechoAlAgente`). */
function registroVisto(battle: BattleState) {
  return battle.log.slice(-30).map(hechoAlAgente);
}

/** Un stack como lo ve el agente: lo público, que se ve pasar en el tablero. */
function stackView(s: BattleStack) {
  const info = s.unit;
  return {
    id: s.id,
    side: s.side,
    creature: queEs(s),
    name: info.name,
    count: s.count,
    hp: stackHp(s),
    hex: s.hex,
    occupies: stackHexes(s),
    speed: stackSpeed(s),
    attack: info.attack,
    defense: info.defense,
    damage: info.damage,
    // Lo que se resta de cada golpe que recibe (`armaduraDe`), 0 sin armadura.
    armor: armaduraDe(info),
    shooter: isShooter(info),
    traits: info.traits ?? [],
    // Sus poderes (`power`), solo si tiene alguno: como `chargeFrom`, lo que no hay no viaja.
    ...((info.poderes?.length ?? 0) > 0 ? { powers: info.poderes } : {}),
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
    ...marcaDelOrigen(s.origen),
  };
}

/**
 * La petición de la respuesta de la rueda (`battle_response`): `atacante` golpea
 * cuerpo a cuerpo a `objetivo`, del bando del agente, y ya está plantado ante él
 * (`golpeEnCurso`): lo que se enseña es lo de después de andar.
 *
 * **Sin el golpe del atacante**, y por construcción: esta función recibe los dos
 * ids y nada más, así que no lo puede filtrar aunque quien la llame ya lo sepa
 * (la IA elige el suyo antes de preguntar). La previsión se cuenta con un
 * `attack` sin elecciones (`previsionDeLaRueda` no las lee). Lo vigila
 * `invariantes.test.ts`.
 *
 * `responses` lleva por cada tipo lo que daría su contraataque y lo que hace; si
 * no devolverá el golpe, `noCounterattack` con el motivo del núcleo y solo el
 * efecto de cada tipo en el cruce.
 */
export function serializeBattleResponse(
  battle: BattleState,
  ataque: { readonly atacante: string; readonly objetivo: string },
) {
  const objetivo = stackById(battle, ataque.objetivo);
  const atacante = stackById(battle, ataque.atacante);
  const p = previsionDeLaRueda(battle, { type: 'attack', target: objetivo.id }, 'respuesta');
  const contraataca = p.sinContraataque === null;
  return {
    kind: 'battle_response',
    round: battle.round,
    yourSide: objetivo.side,
    turnId: battle.turno?.n ?? null,
    attacker: atacante.id,
    target: objetivo.id,
    ...(contraataca ? {} : { noCounterattack: p.sinContraataque }),
    responses: TIPOS_DE_GOLPE.map((t) => {
      const response = HIT_DE_GOLPE[t];
      const effect = efectoDeGolpe(t, 'respuesta', contraataca, p.rueda);
      const sector = p.porTipo?.[t];
      return sector === undefined
        ? { response, effect }
        : { response, effect, counterDamage: sector.danio, strikes: sector.golpes };
    }),
    board: tableroDelContrato(),
    stacks: stacksVistos(battle),
    log: registroVisto(battle),
  };
}

/** Las cargas de `activo` para el cable —contra quién y desde dónde—, o nada si no tiene ninguna. */
function chargeFrom(
  battle: BattleState,
  activo: BattleStack,
  costes: ReadonlyMap<string, Paso>,
): { chargeFrom?: { target: string; col: number; row: number; hexes: number }[] } {
  const cargas = casillasDeCarga(battle, activo, costes);
  if (cargas.length === 0) return {};
  return {
    chargeFrom: cargas.map((c) => ({
      target: c.target,
      col: c.at.col,
      row: c.at.row,
      hexes: c.hexes,
    })),
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

/**
 * Cómo haría el procedimental un mapa de ese lado (#195): cuántas regiones y
 * qué minas lleva cada una. Es un consejo y no una regla: el plan del agente se
 * sigue validando por su red (`validateMapPlan`), no por cuántas regiones o
 * minas trae. Sale de las mismas funciones que usa el generador.
 */
function comoRepartePorRegiones(width: number, height: number): string {
  const regiones = regionesDelMapa(width, height);
  const [casa = [], ...fuera] = minasDeLasRegiones(regiones);
  return (
    `En ${width}×${height} el mapa procedimental hace ${regiones} regiones por jugador, en espejo: ` +
    `la de casa con minas de ${casa.join(', ')}, y cada una de las ${fuera.length} de fuera con ${fuera[0]?.length ?? 0}: una de recurso raro y una básica.`
  );
}

/**
 * El reparto de alturas del procedimental (#209), en una frase: la de casa al
 * llano y las demás por su suelo, con los pesos de `data/relieve.json`. Un
 * consejo, como el de las minas: el plan se valida por sus barreras
 * (`problemasDeNiveles`), no por qué nivel elige. Sale de la tabla que sortea el
 * generador, así que no se queda atrás si se retoca.
 */
function comoRepartenLosNiveles(): string {
  const citar = (bs: readonly string[]): string => bs.map((b) => `"${b}"`).join(', ');
  const porSuelo = SUELOS_PISABLES.map((suelo) => {
    const fila = NIVEL_POR_SUELO[suelo];
    const total = fila.reduce((t, p) => t + p.peso, 0);
    const partes = fila.map((p) =>
      fila.length === 1 ? `${p.nivel}` : `${p.nivel} el ${Math.round((p.peso * 100) / total)} %`,
    );
    return `${suelo} al ${partes.join(' y al ')}`;
  });
  return (
    'Alturas: el mapa procedimental pone la región de casa de cada jugador al nivel 1 y cada pareja en espejo de las demás a un mismo nivel, ' +
    `sorteado por su suelo: ${porSuelo.join('; ')}. Entre dos niveles pone ${citar(BARRERAS_DE_DESNIVEL)}; nunca ${citar(BARRERAS.filter((b) => !BARRERAS_DE_DESNIVEL.includes(b)))}.`
  );
}

/**
 * La ficha de una unidad del catálogo tal como la lee el agente
 * (`creature_stats`): sus cifras con su equipo de serie puesto, su `dwelling` (el
 * edificio que la produce, `null` si ninguno), lo que lleva (`equipment`, por
 * hueco del contrato, y `armor`, los puntos que resta de cada golpe) y lo que se
 * deriva de las cifras, su `level` y su `powerIndex` (`core/nivel.ts`). Las armas
 * por uso y la rueda de cada una no viajan: el agente las lee de las piezas
 * (`equipment` y el catálogo de equipo de su prosa).
 */
export function fichaDeCriatura(c: UnidadDelJuego) {
  // Campo a campo, no «todo menos lo que no viaja»: quitar `armas` o la armadura
  // por desestructuración era nombrarlas fuera de su escritor (`conEquipo`), y un
  // campo nuevo de `UnitInfo` llegaría al agente sin que nadie lo decidiera.
  return {
    id: c.id,
    name: c.name,
    faction: c.faction,
    attack: c.attack,
    defense: c.defense,
    damage: c.damage,
    hp: c.hp,
    speed: c.speed,
    ...(c.traits === undefined ? {} : { traits: c.traits }),
    leadership: c.leadership,
    cost: { gold: c.oro },
    growth: c.growth,
    dwelling: c.edificio,
    equipment: equipoView(c.equipo),
    armor: armaduraDe(c),
    level: nivelDeUnidad(c),
    powerIndex: indiceDePoder(c),
  };
}

/**
 * Hasta qué nivel se sugieren unidades para guardar el mapa
 * (`palette.creaturesForGuards`): una sugerencia, no una regla —`validateMapPlan`
 * acepta cualquier unidad del catálogo—. Era la morada 4 de caballeros y
 * nigromantes; con las cinco facciones, el nivel 3 deja fuera a los jinetes.
 */
const NIVEL_MAXIMO_DE_GUARDIA = 3;

export function serializeMapRequest(opts: MapRequestOptions) {
  return {
    kind: 'map_generate',
    want: {
      width: opts.width,
      height: opts.height,
      players: opts.players,
      theme: opts.theme ?? 'un valle en disputa entre dos ejércitos',
    },
    palette: {
      // Derivada, no copiada: era la tercera declaración de la misma lista de
      // ocho y se habría quedado atrás en silencio el día que entrara un terreno.
      terrains: [...TERRAIN_KINDS],
      // Con qué se levanta un muro. Derivado igual que los terrenos: es la lista
      // que valida `validateMapPlan`, no una copia.
      wallTerrains: [...BARRERAS],
      resources: RESOURCE_KINDS,
      factions: [...FACTION_IDS],
      // Lo que un plan puede poner en `raiders`: el techo y los grupos con los
      // que brotan en partida, que valen todos. Sale de los datos y no se
      // copia, igual que el resto de la paleta.
      raiders: {
        maxIndividuals: LIDERAZGO.maxPorBando,
        maxLeadership: ASALTANTES.liderazgoMax,
        maxStrength: ASALTANTES.fuerzaMax,
        examples: ASALTANTES.composiciones,
      },
      // Derivada del catálogo y no escrita a mano (#108): las unidades de nivel
      // ≤ `NIVEL_MAXIMO_DE_GUARDIA` de cada facción.
      // La prosa le dice al agente que use estas tal cual, así que una copia que
      // se quedara atrás le haría escribir un id que `validateMapPlan` rechaza.
      creaturesForGuards: FACTION_IDS.flatMap((f) =>
        unidadesDeFaccion(f)
          .filter((u) => nivelDeUnidad(u) <= NIVEL_MAXIMO_DE_GUARDIA)
          .map((u) => u.id),
      ),
    },
    advice: [
      'Reparte las minas para que ningún jugador nazca sin madera ni mineral.',
      comoRepartePorRegiones(opts.width, opts.height),
      comoRepartenLosNiveles(),
      'Los monstruos custodian lo bueno: cuanto mejor el premio, más dura la guardia.',
      'Deja el centro del mapa disputado y los bordes seguros.',
      'Pon las ciudades en los cruces de tres regiones o más, y que cada base tenga dos caminos distintos hasta las ciudades que le quedan cerca: así aislarlas es posible pero no trivial.',
      'Un camino entra en una mina o un pueblo por la casilla de debajo, que es su puerta, y no lo atraviesa: si sigue hacia otro sitio, pasa por la fila de delante y deja un ramal de una casilla hasta la puerta.',
      `A una ciudad, en cambio, se entra por las puertas de su recinto de ${LADO_DEL_RECINTO}×${LADO_DEL_RECINTO}: lleva el camino de cada región que la toque de un acceso a dos casillas (al norte, al sur o en diagonal) a la puerta de esa cara y de ahí a la ciudad; deja ${SEPARACION_DE_CIUDADES} casillas entre dos ciudades, nada dentro de un recinto, y el inicio de cada jugador en un acceso de su base.`,
    ],
  };
}
