import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  type Catalogo,
  type CatalogoEnBruto,
  catalogoValidado,
  RUTA_DEL_CATALOGO,
} from '../src/client/render/escenario/catalogo.js';
import { componer, type Escena } from '../src/client/render/escenario/colocar.js';
import type { Puente } from '../src/client/render/escenario/puentes.js';
import type { Senda } from '../src/client/render/escenario/sendas.js';
import { SesionDeArena } from '../src/client/session.js';
import {
  batallaDeArena,
  cambioDePiezas,
  conPiezas,
  type FuenteDeArena,
  type HojaDeArena,
  type MontajeDeArena,
} from '../src/core/arena.js';
import {
  activeStack,
  applyAction,
  type BattleMember,
  type BattleSide,
  createBattle,
  enemiesOf,
  legalActions,
  stackHexes,
} from '../src/core/battle/battle.js';
import { hexDistance } from '../src/core/battle/board.js';
import { type MurallaDeBatalla, SIN_MURALLA } from '../src/core/battle/muralla.js';
import { REGLAS_DEL_JUEGO, type ReglasDeBatalla } from '../src/core/battle/reglas.js';
import type { ModoDelGolpe } from '../src/core/battle/rueda.js';
import type {
  BattleAction,
  BattleEvent,
  BattleStack,
  BattleState,
} from '../src/core/battle/types.js';
import { personajeDe } from '../src/core/battle/types.js';
import { unidad } from '../src/core/catalogo.js';
import {
  BARRERAS_DEL_MAPA,
  COMENTARIO_DEL_CATALOGO_DE_EQUIPO,
  EQUIPO_ESCRITO,
  type Pieza,
  type PiezaEscrita,
  RUTA_DEL_CATALOGO_DE_EQUIPO,
} from '../src/core/data.js';
import {
  type CatalogoDeEquipo,
  catalogoDeEquipo,
  EQUIPO_DEL_JUEGO,
} from '../src/core/hero/equipo.js';
import type { Hero } from '../src/core/hero/hero.js';
import { Casillas } from '../src/core/map/casillas.js';
import type { MapPlan, PlanConCasillas } from '../src/core/map/generate.js';
import {
  casillaDelIndice,
  findPath,
  type GameMap,
  isEnterable,
  type MapObject,
  objectAt,
  pointFromKey,
  pointKey,
  type Reachable,
  RedDeCaminos,
} from '../src/core/map/map.js';
import {
  estructura,
  nivelesDelRelieve,
  rellenar,
  VECINAS,
  vecindad,
} from '../src/core/map/regiones.js';
import { esBarrera, type TerrainKind } from '../src/core/map/terrain.js';
import { lineasQueSeparan } from '../src/core/map/vestir.js';
import { createRng, type Rng } from '../src/core/rng.js';
import {
  alcanceDelHeroe,
  applyAdventureAction,
  baseOf,
  type GameContext,
  type GameState,
  heroesOf,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import {
  type Army,
  type Hex,
  type NivelesDeLaRueda,
  type PlayerId,
  type Point,
  type Stack,
  TIPOS_DEL_ANILLO,
  type TipoDeGolpe,
  type Troop,
  type UnitInfo,
} from '../src/core/types.js';
import { nivelesDeLaEspada, type UnidadDeArena, unidadDeCombate } from '../src/core/unidad.js';
import { hojasDeArena } from '../tools/arena/borrador.js';

/**
 * El coste de cada casilla del alcance por `"x,y"`, en orden de primer
 * descubrimiento: la forma que tenía `Reachable.costs` antes de #94. El núcleo
 * ya no la construye (era el 6 % del banco); los tests la reconstruyen para
 * seguir leyendo por clave y para que los goldens de orden no se reescriban.
 */
export function costesDelAlcance(alcance: Reachable): Map<string, number> {
  const costes = new Map<string, number>();
  for (const i of alcance.descubiertas) {
    costes.set(pointKey(casillaDelIndice(alcance, i)), alcance.costes[i] as number);
  }
  return costes;
}

/** Por dónde se llega a cada casilla, por `"x,y"`: el `prev` de antes de #94. Sin el origen. */
export function previosDelAlcance(alcance: Reachable): Map<string, Point> {
  const previos = new Map<string, Point>();
  for (const i of alcance.descubiertas) {
    const p = alcance.previos[i] as number;
    if (p !== -1) previos.set(pointKey(casillaDelIndice(alcance, i)), casillaDelIndice(alcance, p));
  }
  return previos;
}

/**
 * Vacía la guarnición con la que nace la base de cada jugador
 * (`data/ciudades.json`, `guarnicionBase`) y devuelve el mismo estado.
 *
 * Para los tests que miden otra cosa —reclutar a una guarnición con sitio,
 * tomar una base entrando, el reparto de una partida— y que se escribieron
 * cuando la base nacía vacía. Con siete individuos y 20 de liderazgo la base
 * nace llena, y ahí no cabe ni un recluta: eso lo prueba su propio test, no
 * cada uno de estos por la puerta de atrás.
 */
export function sinGuarnicionDeSalida(state: GameState): GameState {
  for (const p of state.players) {
    const base = state.towns.find((t) => t.id === p.base);
    if (base !== undefined) base.garrison = [];
  }
  return state;
}

/**
 * Un ejército de individuos, escrito por grupos: `{ creature: 'pikeman',
 * count: 20 }` son veinte piqueros, uno detrás de otro y en el orden en que se
 * escriben. Un personaje va con `count: 1` y conserva su `member`.
 *
 * NO pasa por el liderazgo: un test que monta un ejército a mano decide qué
 * lleva, igual que antes decidía qué había en cada hueco. Lo que sí tiene que
 * respetar es el tope del bando —siete, y seis si lleva héroe, que es el
 * séptimo (fase 1b)—, porque eso lo mira la batalla y lanza.
 */
export function ejercito(...grupos: Stack[]): Army {
  const out: Troop[] = [];
  for (const { count, ...troop } of grupos) {
    for (let i = 0; i < count; i++) out.push(troop);
  }
  return out;
}

export type Monstruo = Extract<MapObject, { kind: 'monster' }>;

/**
 * El primer monstruo en pie del mapa. Existe para que ningún test se invente un
 * `objectId`: uno inventado sobrevive mientras la batalla no se cierre y revienta
 * con «monstruo no encontrado» el día que alguien llame a `settleBattle`, donde
 * parece un fallo del núcleo y no del andamio del test.
 */
export function monstruoVivo(state: GameState): Monstruo {
  const obj = state.map.objects.find((o) => o.kind === 'monster' && !o.defeated);
  if (obj === undefined || obj.kind !== 'monster') {
    throw new Error('el mapa no tiene ningún monstruo en pie');
  }
  return obj;
}

/**
 * Cambia el primer monstruo en pie por el que pide el test, en su misma casilla.
 *
 * Los objetos del mapa son de solo lectura, así que se sustituye entero en su
 * sitio del array —igual que ya hacía a mano el test del héroe que pierde—: lo
 * que importa es que `monstruoVivo` siga devolviendo este, porque es a él a
 * quien va a entrar `forzarBatalla`.
 */
export function ponerMonstruo(state: GameState, creature: string, count: number): Monstruo {
  const anterior = monstruoVivo(state);
  const nuevo: Monstruo = {
    kind: 'monster',
    id: anterior.id,
    at: anterior.at,
    creature,
    count,
    defeated: false,
  };
  state.map.objects.splice(state.map.objects.indexOf(anterior), 1, nuevo);
  return nuevo;
}

/**
 * Coloca al héroe a la izquierda de `hacia` —por defecto, el primer monstruo en
 * pie— y lo hace entrar: deja la batalla montada en `state.pendingBattle`. Vale
 * igual contra un monstruo que contra un héroe o un castillo: es pisar una
 * casilla.
 *
 * La receta iba por su sexta copia entre `game.test.ts` y `battle.test.ts`, y
 * cada copia repetía los mismos 5000 puntos de movimiento a mano.
 */
export function forzarBatalla(
  state: GameState,
  ctx: GameContext,
  hero: Hero,
  hacia: Point = monstruoVivo(state).at,
): void {
  // A la izquierda si se puede, que es lo de siempre; si no —el monstruo en el
  // borde, o una montaña ahí—, la primera vecina que se pise y esté libre. Con
  // el mapa de 28 el primer monstruo de la semilla 53 cae en la columna 0, y
  // «a su izquierda» era fuera del mapa.
  const vecinas = [
    { x: hacia.x - 1, y: hacia.y },
    ...[-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({ x: hacia.x + dx, y: hacia.y + dy }))),
  ];
  const libre = vecinas.find(
    (p) =>
      (p.x !== hacia.x || p.y !== hacia.y) &&
      isEnterable(state.map, p) &&
      objectAt(state.map, p) === undefined &&
      !state.raiders.some((r) => r.at.x === p.x && r.at.y === p.y),
  );
  if (libre === undefined) throw new Error(`(${hacia.x},${hacia.y}) no tiene vecina libre`);
  hero.at = libre;
  hero.movePoints = 5000;
  applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: hacia }, ctx, state.current);
  if (state.pendingBattle === null) {
    throw new Error(`pisar (${hacia.x},${hacia.y}) no abrió ninguna batalla`);
  }
}

/**
 * La primera semilla de `desde` a `hasta` cuyo caso cumple `pred`, o lanza
 * diciendo qué se buscaba. Un test que necesita un caso del mapa —un puente
 * N-S, un vado, un héroe que nace al norte de su castillo— lo busca en vez de
 * escribir su semilla: cada cambio del generador (#169, que cambia todos los
 * mapas) se llevaba las semillas escritas a mano y obligaba a cambiar un
 * número por otro sin que el test dijera nada nuevo.
 */
export function primeraSemillaCon<T>(
  que: string,
  pred: (semilla: number) => T | undefined,
  desde = 1,
  hasta = 80,
): { semilla: number; caso: T } {
  for (let semilla = desde; semilla <= hasta; semilla++) {
    const caso = pred(semilla);
    if (caso !== undefined) return { semilla, caso };
  }
  throw new Error(`ninguna semilla de ${desde} a ${hasta} tiene ${que}`);
}

/**
 * Un puente cuyo tablero, hacia uno de sus extremos (del 60 al 90 % del
 * tablero, de un estribo al otro; `t` es ese punto en la medida de
 * `enElTablero`, de −0,5 a 0,5), se ve sobre el agua de una casilla que no es
 * la de su nodo: el caso de H2 de #157, donde pulsar el tablero decía «No hay
 * camino». Era el de (16,1) en la semilla 15 hasta que #169 cambió los mapas,
 * y en 81-120 hasta que fuera del río dejó de haber agua de frontera (QA del
 * río continuo, H3): los puentes del río van de frente sobre un río de una
 * casilla y su tablero no pasa de las orillas. En 1-300 solo queda el de la
 * ciudad-puente de la 23 (town-3, al 90 %), que el clic lleva a la ciudad. Se
 * busca desde la 20, que componer cada escena de 1 a 19 cuesta ~12 s.
 */
export function puenteSobreElAgua(): {
  semilla: number;
  caso: { puente: Puente; sobreElAgua: [number, number]; casilla: Point; t: number };
} {
  return primeraSemillaCon(
    'un puente con el tablero sobre el agua de otra casilla',
    (s) => {
      const e = partidaDe(s).escena;
      const agua = new Set(e.agua);
      for (const puente of e.puentes) {
        const [a, b] = [puente.tablero[1], puente.tablero[2]] as [
          [number, number],
          [number, number],
        ];
        const nodo = { x: Math.floor(puente.nodo[0]), y: Math.floor(puente.nodo[1]) };
        for (const f of [0.7, 0.8, 0.9, 0.6]) {
          const sobreElAgua: [number, number] = [
            a[0] + f * (b[0] - a[0]),
            a[1] + f * (b[1] - a[1]),
          ];
          const [x, y] = sobreElAgua.map(Math.floor) as [number, number];
          if ((x !== nodo.x || y !== nodo.y) && agua.has(y * e.W + x))
            return { puente, sobreElAgua, casilla: { x, y }, t: f - 0.5 };
        }
      }
      return undefined;
    },
    20,
    300,
  );
}

/**
 * El primer destino de hoy cuya marcha se para al descubrir un grupo que la
 * emboscaría (`march_halted`, #130), en el orden del alcance; `null` si
 * ninguna. Cada intento va sobre una copia y con su propio azar: `state` no se
 * toca. Se busca y no se escribe a mano porque los mapas densos ya se llevaron
 * las casillas escritas a mano de la ruta que avisa (H2).
 */
/**
 * Cierra el turno de `jugador` y pasa los de los demás, sin hacer nada, hasta
 * que le vuelve a tocar. En serpiente (`ordenDelDia`) eso son dos turnos del
 * rival si `jugador` abrió el día y ninguno si lo cerró: contarlos a mano —un
 * `end_turn` del 0 y otro del 1— es lo que daba por hecho que el 0 abre todos
 * los días.
 */
export function hastaSuSiguienteTurno(state: GameState, ctx: GameContext, jugador: PlayerId): void {
  if (state.current !== jugador) {
    throw new Error(`no es el turno del jugador ${jugador}: juega el ${state.current}`);
  }
  do applyAdventureAction(state, { type: 'end_turn' }, ctx, state.current);
  while (state.current !== jugador && state.finished === null);
}

/**
 * Una copia de la partida para probar una jugada sin tocar el original.
 *
 * `structuredClone` copia los datos y no el prototipo, así que la niebla
 * (`Casillas`, #146) volvía como un objeto sin `has` ni `marcarCuadrado` y la
 * primera marcha lanzaba. Se rehace desde sus índices; lo demás es la copia de
 * siempre.
 */
export function copiaDePartida(state: GameState): GameState {
  const copia = structuredClone(state);
  copia.players = copia.players.map((p, i) => ({
    ...p,
    fog: Casillas.deIndices(
      state.map,
      (state.players[i] as GameState['players'][number]).fog.indices(),
    ),
  }));
  return copia;
}

export function primeraMarchaQueSePara(state: GameState, heroe: Hero): Point | null {
  for (const [clave, coste] of costesDelAlcance(alcanceDelHeroe(state, heroe))) {
    if (coste === 0 || coste > heroe.movePoints) continue;
    const destino = pointFromKey(clave);
    const prueba = copiaDePartida(state);
    applyAdventureAction(
      prueba,
      { type: 'move_hero', hero: heroe.id, to: destino },
      { rng: createRng(state.seed) },
      heroe.owner,
    );
    if (prueba.log.at(-1)?.kind === 'march_halted') return destino;
  }
  return null;
}

/**
 * Una casilla pegada a `desde` a la que se llega de un paso, sin objeto: donde
 * plantar a un héroe para que entre en batalla sin cruzar nada por el camino.
 * Desde que perder la base elimina y el castillo no bloquea, mandar al héroe
 * de una punta a otra del mapa cruzaba la base rival vacía y acababa la
 * partida antes de llegar a la batalla que el test quería ver.
 */
export function pegadoA(state: GameState, desde: Point): Point {
  // Las ocho y no solo las rectas: con fronteras gruesas, el inicio está en el
  // pasillo de la base y a veces solo tiene libres las diagonales.
  for (const [dx, dy] of VECINAS) {
    const at = { x: desde.x + dx, y: desde.y + dy };
    const camino = findPath(state.map, desde, at);
    if (camino?.length === 1 && objectAt(state.map, at) === undefined) return at;
  }
  throw new Error(`(${desde.x},${desde.y}) no tiene ninguna casilla vecina libre`);
}

/**
 * Pone a `quien` pegado a la base de `victima`, con la base vacía y el héroe
 * de la víctima lejos de ella, junto a la base de `quien`: pisar la base la
 * toma y acaba la partida con un `player_defeated` de verdad, con el héroe de
 * la víctima todavía en el mapa. Los finales escritos a mano
 * (`state.finished = { winner }`) no dejan hecho en la crónica, y la causa del
 * final se lee de ahí.
 */
export function anteLaBase(state: GameState, quien: PlayerId, victima: PlayerId) {
  const base = baseOf(state, victima)!;
  base.garrison = [];
  const atacante = heroesOf(state, quien)[0]!;
  const defensor = heroesOf(state, victima)[0]!;
  defensor.at = pegadoA(state, baseOf(state, quien)!.at);
  atacante.at = pegadoA(state, base.at);
  atacante.movePoints = 100000;
  return { base, atacante };
}

/**
 * Una partida acabada de verdad: `quien` pisa la base vacía de `victima`, que
 * queda eliminada con su héroe en el mapa y un `player_defeated` en la crónica.
 */
export function acabarPorLaBase(
  state: GameState,
  quien: PlayerId,
  victima: PlayerId,
  ctx: GameContext,
): GameState {
  const { base, atacante } = anteLaBase(state, quien, victima);
  state.current = state.players.findIndex((p) => p.id === quien);
  applyAdventureAction(state, { type: 'move_hero', hero: atacante.id, to: base.at }, ctx, quien);
  if (state.finished?.winner !== quien) {
    throw new Error(
      `el jugador ${quien} pisó la base del ${victima} y la partida no acabó con él de ganador`,
    );
  }
  return state;
}

/**
 * Política agresiva para tests: dispara, si no golpea, si no se acerca todo lo
 * que puede, y si no se defiende. Basta para que cualquier batalla converja.
 */
export function agresiva(state: BattleState): BattleAction {
  const acciones = legalActions(state);
  const s = activeStack(state);
  if (s === null) throw new Error('sin stack activo');

  const disparo = acciones.find((a) => a.type === 'shoot');
  if (disparo !== undefined) return disparo;

  const ataque = acciones.find((a) => a.type === 'attack');
  if (ataque !== undefined) return ataque;

  const enemigos = enemiesOf(state, s);
  const movimientos = acciones.filter(
    (a): a is Extract<BattleAction, { type: 'move' }> => a.type === 'move',
  );
  if (movimientos.length > 0 && enemigos.length > 0) {
    const distancia = (h: { col: number; row: number }): number =>
      Math.min(...enemigos.flatMap((e) => stackHexes(e).map((eh) => hexDistance(h, eh))));
    return movimientos.reduce((mejor, m) => (distancia(m.to) < distancia(mejor.to) ? m : mejor));
  }

  return acciones.find((a) => a.type === 'defend') ?? acciones[0]!;
}

/**
 * Un dado cargado: cada `int` sale en su mínimo o en su máximo, y la suerte y la
 * moral no saltan nunca (`chance` es siempre `false`). Es para ver una punta de
 * una horquilla sin buscarla entre semillas: con PV y daño a la escala de las
 * cifras, una tirada tiene decenas o cientos de valores y cuarenta semillas no
 * ven sus puntas. Lo demás (`next`, `pick`) lanza: un test que lo necesite no
 * está midiendo lo que cree.
 */
export function dadoCargado(punta: 'minimo' | 'maximo'): Rng {
  const noVale = (que: string) => (): never => {
    throw new Error(`el dado cargado solo tira enteros y suerte; se le ha pedido ${que}`);
  };
  return {
    next: noVale('next()'),
    int: (min, max) => (punta === 'minimo' ? min : max),
    chance: () => false,
    pick: noVale('pick()'),
  };
}

/** Juega la batalla hasta el final (o hasta `maxTurnos`). Devuelve los turnos usados. */
export function simular(state: BattleState, rng: Rng, maxTurnos = 3000): number {
  let n = 0;
  while (state.finished === null && n < maxTurnos) {
    applyAction(state, agresiva(state), rng);
    n++;
  }
  return n;
}

/**
 * Juega con `politica` hasta que se cumpla `hasta` —el id del stack activo, o
 * una pregunta sobre la batalla— o se acabe la batalla o los turnos. Dice si
 * llegó.
 */
export function avanzarHasta(
  state: BattleState,
  rng: Rng,
  hasta: string | ((state: BattleState) => boolean),
  politica: (state: BattleState) => BattleAction = agresiva,
  maxTurnos = 200,
): boolean {
  const llego = typeof hasta === 'string' ? (s: BattleState) => s.turno?.stack === hasta : hasta;
  for (let n = 0; state.finished === null && n < maxTurnos; n++) {
    if (llego(state)) return true;
    applyAction(state, politica(state), rng);
  }
  return state.finished === null && llego(state);
}

/**
 * Le da el turno a `stack` a mano, como si lo hubiera abierto `advance`: un
 * ordinal nuevo —el siguiente al de ahora— y lo gastado que diga el test.
 */
export function forzarTurno(state: BattleState, stack: string, gastado = 0): void {
  state.turno = { n: (state.turno?.n ?? 0) + 1, stack, gastado };
}

/**
 * Deja abiertas todas las puertas de la muralla de `state` (o solo las que
 * tienen el lado `a` en `cuales`), sin pasar por `abrir_puerta`: para montar el
 * caso de un test, como `forzarTurno`. Lanza si alguna no es una puerta.
 */
export function abrirPuertas(state: BattleState, cuales?: readonly Hex[]): void {
  for (const h of cuales ?? state.puertas.map((p) => p.a)) {
    const p = state.puertas.find((q) => q.a.col === h.col && q.a.row === h.row);
    if (p === undefined) throw new Error(`ninguna puerta tiene su lado a en (${h.col},${h.row})`);
    p.abierta = true;
  }
}

/** ¿Es este stack el personaje `id`? Para los `find` de los tests. */
export const esPersonaje =
  (id: string) =>
  (s: BattleStack): boolean =>
    personajeDe(s.origen) === id;

/**
 * Un mapa de nodos pequeño y escrito a mano, para que los tests de reglas no
 * dependan de lo que salga del generador.
 *
 * Cinco regiones en fila separadas por cordilleras (columnas 5, 11, 17 y 22):
 *
 * ```
 *   A x0-4 | B x6-10 | C x12-16 | D x18-21 | E x23-25
 *       town-0   node-1    town-2    town-1
 *       node-0   node-2
 * ```
 *
 * - `town-0` (5,4): base del jugador 0, entre A y B. `node-0` (5,8): el otro
 *   paso de A, así que A **no** es de nadie al empezar.
 * - `node-1` (11,2) y `node-2` (11,6): los dos pasos entre B y C.
 * - `town-2` (17,4): ciudad NEUTRAL de caballero entre C y D, que nace con la
 *   guarnición de `data/ciudades.json`.
 * - `town-1` (22,4): base del jugador 1, entre D y E.
 *
 * Una mina en cada una de A, B y C: ore (2,2), gold (8,4) y wood (14,4).
 * Inicios en (4,4) y (23,4), pegados a cada base.
 */
export function planDeNodos(): PlanConCasillas {
  const columna = (x: number) => ({
    terrain: 'mountain' as const,
    from: { x, y: 0 },
    to: { x, y: 8 },
  });
  return {
    width: 26,
    height: 9,
    baseTerrain: 'grass',
    patches: [],
    regions: [
      { id: 'a', name: 'Oeste', at: { x: 2, y: 6 } },
      { id: 'b', name: 'Vega', at: { x: 8, y: 7 } },
      { id: 'c', name: 'Centro', at: { x: 14, y: 7 } },
      { id: 'd', name: 'Llano', at: { x: 19, y: 7 } },
      { id: 'e', name: 'Este', at: { x: 24, y: 7 } },
    ],
    walls: [columna(5), columna(11), columna(17), columna(22)],
    nodes: [
      { x: 5, y: 8 },
      { x: 11, y: 2 },
      { x: 11, y: 6 },
    ],
    towns: [
      {
        id: 'town-0',
        name: 'Valdeluz',
        faction: 'knight',
        at: { x: 5, y: 4 },
        owner: 0,
      },
      {
        id: 'town-1',
        name: 'Cripta Gris',
        faction: 'necromancer',
        at: { x: 22, y: 4 },
        owner: 1,
      },
      {
        id: 'town-2',
        name: 'Torreblanca',
        faction: 'knight',
        at: { x: 17, y: 4 },
        owner: null,
      },
    ],
    heroStarts: [
      { player: 0, at: { x: 4, y: 4 } },
      { player: 1, at: { x: 23, y: 4 } },
    ],
    mines: [
      { at: { x: 2, y: 2 }, resource: 'ore' },
      { at: { x: 8, y: 4 }, resource: 'gold' },
      { at: { x: 14, y: 4 }, resource: 'wood' },
    ],
    villages: [{ name: 'Aldea del Pozo', at: { x: 14, y: 1 } }],
    resources: [],
    monsters: [],
    chests: [],
  };
}

/**
 * Un mapa con una meseta, escrito a mano (#209): la región `alta` (nivel 2)
 * ocupa el norte y la corta un acantilado en la fila 7 de las dos de abajo,
 * `oeste` y `este`, que van al llano y las separa un bosque en la columna 10.
 *
 * ```
 *   filas 0-6    alta (2)          town-1 (5,7)  node (15,7): rampas del acantilado
 *   fila 7       cliff ───────────────────────
 *   filas 8-15   oeste (1) | forest x=10 | este (1)   town-0 (10,11)
 * ```
 *
 * Es el plan de las mesetas del agente: con los niveles, el acantilado es el
 * borde de la meseta y la escena le pinta cara; sin ellos, todo al llano.
 */
export function planDeMesetas(): PlanConCasillas {
  return {
    width: 20,
    height: 16,
    baseTerrain: 'grass',
    patches: [],
    regions: [
      { id: 'alta', name: 'La Meseta', at: { x: 3, y: 3 }, nivel: 2 },
      { id: 'oeste', name: 'Vega Baja', at: { x: 3, y: 12 }, nivel: 1 },
      { id: 'este', name: 'Prado Bajo', at: { x: 16, y: 12 }, nivel: 1 },
    ],
    walls: [
      { terrain: 'cliff', from: { x: 0, y: 7 }, to: { x: 19, y: 7 } },
      { terrain: 'forest', from: { x: 10, y: 8 }, to: { x: 10, y: 15 } },
    ],
    nodes: [{ x: 15, y: 7 }],
    towns: [
      { id: 'town-0', name: 'Valdeluz', faction: 'knight', at: { x: 10, y: 11 }, owner: 0 },
      { id: 'town-1', name: 'Cripta Gris', faction: 'necromancer', at: { x: 5, y: 7 }, owner: 1 },
    ],
    heroStarts: [
      { player: 0, at: { x: 8, y: 12 } },
      { player: 1, at: { x: 5, y: 5 } },
    ],
    mines: [],
    villages: [],
    resources: [],
    monsters: [],
    chests: [],
  };
}

// ---------------------------------------------------------------- mapas densos

/**
 * Las barreras de un mapa construido, partidas en **frontera** y **obstáculo**
 * desde fuera, sin preguntarle nada al generador. Se mira **lo que no es
 * región** —barreras y nodos, 8-conexo—: un trozo que toca dos regiones o más
 * es frontera (la red fina pasa por él), y uno que toca una sola es un
 * obstáculo suyo. Los nodos van dentro porque son agujeros de la frontera, no
 * su final: el nodo y su pasillo la cortan en trozos y el de un lado del paso
 * puede no tocar más que una región (la semilla 80 en 28×28), pero sigue
 * unido a la otra por el nodo. Solo se cuentan sus casillas de barrera.
 *
 * Antes era «solo barreras, y pegada a un nodo es frontera» con la marca con
 * la que el generador veta sus manchas (`juntoANodo`): una excepción por cada
 * forma de frontera, y la auditoría leyendo una regla del generador (#132).
 * En 1 730 mapas (34×34 1-1000, 28×28 1-200, 30, 40, 48, 24 y 64) las dos
 * reglas dan lo mismo casilla a casilla (09-10-2026).
 */
export function barrerasDe(map: GameMap): {
  /** Casillas de frontera de cada barrera: las abiertas por un nodo no cuentan. */
  frontera: Map<TerrainKind, number>;
  /** Casillas de obstáculo de cada región, por índice de región. */
  obstaculo: number[];
} {
  const red = estructura(map);
  const W = map.width;
  const H = map.height;
  const fuera = (i: number) => red.regionDe[i]! < 0;
  const visto = new Uint8Array(W * H);
  const frontera = new Map<TerrainKind, number>();
  const obstaculo = map.regions.map(() => 0);
  for (let i = 0; i < W * H; i++) {
    if (visto[i] === 1 || !fuera(i)) continue;
    const regiones = new Set<number>();
    const toma = (j: number): boolean => {
      if (!fuera(j)) {
        regiones.add(red.regionDe[j]!);
        return false;
      }
      if (visto[j] === 1) return false;
      visto[j] = 1;
      return true;
    };
    toma(i);
    const barreras = rellenar(W, H, i, toma).filter((c) =>
      esBarrera(map.terrain[c] as TerrainKind),
    );
    if (regiones.size === 1) {
      obstaculo[[...regiones][0]!]! += barreras.length;
    } else {
      for (const c of barreras) {
        const t = map.terrain[c] as TerrainKind;
        frontera.set(t, (frontera.get(t) ?? 0) + 1);
      }
    }
  }
  return { frontera, obstaculo };
}

/**
 * Lo que el usuario pidió de un mapa denso, medido desde fuera del generador
 * (criterios 1, 4 y 5 de «mapas densos»), sobre el mapa ya construido de
 * `plan`:
 *
 * - **grosor**: dos casillas pisables de regiones distintas están a Chebyshev
 *   ≥ 3, salvo que alguna esté a ≤ 3 de un nodo (el estrechamiento del paso) o
 *   que entre ellas haya acantilado, que es una línea de una casilla (#215);
 * - **suelo**: cada región, de un solo suelo, el que declara el plan;
 * - **obstáculos**: la densidad de cada región dentro del rango de los datos;
 * - **alcance**: desde las vecinas de los nodos de cada región, sin cruzar un
 *   monstruo, se llega a todas sus casillas pisables —objetos, inicios y
 *   asaltantes incluidos—;
 * - **caminos** (#149, radiales con un cruce por pareja): cada ciudad, mina y
 *   pueblo está en la red de su región —el camino de la región es una sola
 *   pieza y los lleva—, la base en la de su casa, cada nodo con camino es una
 *   **hoja** de la red de cada región que se lo lleva, entre cada pareja de
 *   regiones vecinas hay **exactamente un** nodo con camino, y la red de
 *   caminos del mapa es una sola pieza. Todo por sus **tramos** (#153), no por
 *   la adyacencia de las casillas.
 *
 * Devuelve además cuántas casillas de frontera lleva cada barrera, que es lo
 * que el test cuenta por mapa: así no se construye el mapa dos veces.
 */
export function auditarMapaDenso(
  plan: MapPlan,
  map: GameMap,
): { fallos: string[]; frontera: Map<TerrainKind, number> } {
  const fallos: string[] = [];
  const red = estructura(map);
  const W = map.width;
  const H = map.height;
  const N = W * H;
  const en = (i: number) => `(${i % W},${(i - (i % W)) / W})`;
  const nodos = red.nodos.map((n) => n.at.y * W + n.at.x);

  // Grosor.
  const cercaDeNodo = new Uint8Array(N);
  for (const n of red.nodos) {
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = n.at.x + dx;
        const y = n.at.y + dy;
        if (x >= 0 && y >= 0 && x < W && y < H) cercaDeNodo[y * W + x] = 1;
      }
  }
  /**
   * Si alguna casilla vecina de las dos es su línea (`lineasQueSeparan`): el
   * borde de la meseta entre dos niveles; o el río de una casilla a ras de la
   * más baja de las dos (#144, paso 2), que se ve: sin nada más alto justo al
   * norte, o con más agua justo al sur (paso 2b).
   */
  const niveles = map.regions.map((r) => r.nivel ?? 1);
  const nivel = nivelesDelRelieve(W, H, map.terrain, red.regionDe, niveles, []);
  const lineaEntre = (i: number, j: number): boolean => {
    const [ix, iy, jx, jy] = [i % W, Math.floor(i / W), j % W, Math.floor(j / W)];
    const nivelI = niveles[red.regionDe[i]!] as number;
    const nivelJ = niveles[red.regionDe[j]!] as number;
    const lineas: readonly TerrainKind[] = lineasQueSeparan(nivelI, nivelJ);
    for (let y = Math.max(iy, jy) - 1; y <= Math.min(iy, jy) + 1; y++)
      for (let x = Math.max(ix, jx) - 1; x <= Math.min(ix, jx) + 1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const m = y * W + x;
        const t = map.terrain[m]!;
        if (!lineas.includes(t)) continue;
        if (t === 'cliff') return true;
        const aLaVista =
          y === 0 || nivel[m - W]! <= nivel[m]! || (y + 1 < H && map.terrain[m + W] === 'water');
        if (nivel[m] === Math.min(nivelI, nivelJ) && aLaVista) return true;
      }
    return false;
  };
  let finas = 0;
  let primera = '';
  for (let i = 0; i < N; i++) {
    const r = red.regionDe[i]!;
    if (r < 0 || cercaDeNodo[i] === 1) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        const s = red.regionDe[j]!;
        if (s >= 0 && s !== r && cercaDeNodo[j] === 0 && !lineaEntre(i, j)) {
          finas++;
          if (primera === '') primera = `${en(i)} y ${en(j)}`;
        }
      }
  }
  if (finas > 0)
    fallos.push(`frontera de menos de 2 casillas en ${finas} parejas, la primera ${primera}`);

  // Suelo y densidad: una sola pasada por el mapa para las dos.
  const suelos = map.regions.map(() => new Set<TerrainKind>());
  const pisables = map.regions.map(() => 0);
  for (let i = 0; i < N; i++) {
    const k = red.regionDe[i]!;
    if (k < 0) continue;
    suelos[k]!.add(map.terrain[i] as TerrainKind);
    pisables[k]!++;
  }
  for (const [k, reg] of plan.regions.entries()) {
    const deAqui = suelos[k]!;
    if (deAqui.size !== 1 || (reg.terrain !== undefined && !deAqui.has(reg.terrain))) {
      fallos.push(
        `la región ${reg.id} tiene de suelo ${[...deAqui].join('+')} y declara ${reg.terrain}`,
      );
    }
  }
  const { min, max } = BARRERAS_DEL_MAPA.densidadPorCiento;
  const { frontera, obstaculo } = barrerasDe(map);
  for (const [k, reg] of map.regions.entries()) {
    const total = pisables[k]! + obstaculo[k]!;
    if (obstaculo[k]! * 100 < min * total || obstaculo[k]! * 100 > max * total) {
      fallos.push(
        `la región ${reg.id} tiene ${obstaculo[k]} de ${total} casillas de obstáculo, fuera de ${min}-${max} %`,
      );
    }
  }

  // Alcance.
  const { desde, vecinas } = vecindad(W, H);
  const monstruo = new Uint8Array(N);
  for (const o of map.objects) if (o.kind === 'monster') monstruo[o.at.y * W + o.at.x] = 1;
  for (const [k, reg] of red.regiones.entries()) {
    const visto = new Uint8Array(N);
    const cola: number[] = [];
    const expandir = (a: number) => {
      for (let v = desde[a]!; v < desde[a + 1]!; v++) {
        const j = vecinas[v]!;
        if (visto[j] === 1 || red.regionDe[j] !== k) continue;
        visto[j] = 1;
        cola.push(j);
      }
    };
    for (const n of reg.nodos) expandir(nodos[n]!);
    for (let q = 0; q < cola.length; q++) if (monstruo[cola[q]!] === 0) expandir(cola[q]!);
    for (let i = 0; i < N; i++) {
      if (red.regionDe[i] === k && visto[i] === 0) {
        fallos.push(
          `en la región ${reg.id}, ${en(i)} no se alcanza desde sus nodos sin cruzar un monstruo`,
        );
        break;
      }
    }
  }
  const sitios = [
    ...map.objects.filter((o) => o.kind !== 'node' && o.kind !== 'town').map((o) => o.at),
    ...plan.heroStarts.map((s) => s.at),
    ...(plan.raiders ?? []).map((r) => r.at),
  ];
  for (const p of sitios) {
    if (red.regionDe[p.y * W + p.x]! < 0)
      fallos.push(`(${p.x},${p.y}) tiene algo y no es de ninguna región`);
  }

  // Caminos, por sus tramos (#153): a un nodo le «llega el camino» de una
  // región si un tramo lo une a una casilla de ella.
  const { todas, unidas } = grafoDeCaminos(map);
  const camino = new Set(todas);
  const tramosDesde = (n: number, k: number): number =>
    (unidas.get(n) ?? []).filter((j) => red.regionDe[j] === k).length;
  const leLlegaDe = (n: number, k: number): boolean => tramosDesde(n, k) > 0;
  const nodosDe = red.regiones.map((reg) => new Set(reg.nodos.map((n) => nodos[n]!)));
  for (const [k, reg] of red.regiones.entries()) {
    const destinos = map.objects
      .filter(
        (o) =>
          (o.kind === 'mine' || o.kind === 'village') && red.regionDe[o.at.y * W + o.at.x] === k,
      )
      .map((o) => o.at.y * W + o.at.x);
    // El camino de la región, sin sus nodos: un radio no cruza un nodo, así
    // que tiene que ser de una pieza por las casillas de la región.
    const suCamino = todas.filter((c) => red.regionDe[c] === k);
    const origen = suCamino[0];
    if (origen === undefined) {
      fallos.push(`la región ${reg.id} no tiene ni una casilla de camino`);
      continue;
    }
    const visto = pieza(unidas, origen, (j) => red.regionDe[j] === k);
    const sueltas = suCamino.filter((c) => !visto.has(c));
    if (sueltas.length > 0) {
      fallos.push(
        `el camino de la región ${reg.id} va en más de un trozo: ${en(origen)} no llega a ${en(sueltas[0]!)}`,
      );
    }
    for (const d of destinos) {
      if (!camino.has(d))
        fallos.push(`la mina o el pueblo ${en(d)} de la región ${reg.id} no está en un camino`);
    }
    // Radial: a un nodo se llega, no se cruza, así que es una hoja de la red
    // de cada región que le lleva camino.
    for (const n of nodosDe[k]!) {
      const tramos = tramosDesde(n, k);
      if (tramos > 1)
        fallos.push(
          `el nodo ${en(n)} no es una hoja de la red de la región ${reg.id}: le llegan ${tramos} tramos`,
        );
    }
  }
  // Toda ciudad, en la red de alguna de sus regiones; la base, en la de su
  // casa, que es la región donde empieza su héroe.
  for (const n of red.nodos) {
    const i = n.at.y * W + n.at.x;
    if (n.ciudad && !n.regiones.some((k) => leLlegaDe(i, k)))
      fallos.push(`la ciudad ${en(i)} no está en un camino de ninguna de sus regiones`);
  }
  for (const inicio of plan.heroStarts) {
    const base = plan.towns.find((t) => t.owner === inicio.player);
    if (base === undefined) continue;
    const casa = red.regionDe[inicio.at.y * W + inicio.at.x]!;
    if (!leLlegaDe(base.at.y * W + base.at.x, casa))
      fallos.push(
        `la base del jugador ${inicio.player} en (${base.at.x},${base.at.y}) no está en la red de su región de casa, ${red.regiones[casa]?.id}`,
      );
  }
  // Un solo cruce con camino por pareja de vecinas: un nodo común al que le
  // llega el camino de las dos.
  for (let a = 0; a < red.regiones.length; a++) {
    for (let b = a + 1; b < red.regiones.length; b++) {
      const comunes = [...nodosDe[a]!].filter((n) => nodosDe[b]!.has(n));
      if (comunes.length === 0) continue;
      const cruces = comunes.filter((n) => leLlegaDe(n, a) && leLlegaDe(n, b));
      if (cruces.length !== 1) {
        fallos.push(
          `entre las regiones ${red.regiones[a]!.id} y ${red.regiones[b]!.id} hay ${cruces.length} cruces con camino (${cruces.map(en).join(', ')}), y tiene que haber uno`,
        );
      }
    }
  }
  // Y la red del mapa, de una pieza.
  if (todas.length > 0) {
    const visto = pieza(unidas, todas[0]!, () => true);
    const fuera = todas.filter((c) => !visto.has(c));
    if (fuera.length > 0) {
      fallos.push(
        `la red de caminos del mapa va en más de un trozo: ${en(todas[0]!)} no llega a ${en(fuera[0]!)}`,
      );
    }
  }
  return { fallos, frontera };
}

/**
 * El mismo mapa con camino también en estas casillas, sueltas. Es lo que hacían
 * los tests con `map.roads.add` antes de que el mapa guardara tramos (#153): la
 * red es de un solo hecho y no se muta, se rehace.
 */
export function conCaminos(map: GameMap, ...claves: string[]): GameMap {
  const { tramos, sueltas } = map.caminos;
  const caminos = RedDeCaminos.desdeTramos(tramos, map.width, map.height, [
    ...sueltas,
    ...claves.map(pointFromKey),
  ]);
  return { ...map, caminos };
}

/**
 * Los caminos del mapa por índice plano: sus casillas, en orden, sus tramos y
 * con qué casillas une cada una un tramo.
 */
export function grafoDeCaminos(map: GameMap): {
  todas: number[];
  unidas: Map<number, number[]>;
  aristas: [number, number][];
} {
  const W = map.width;
  const indice = (p: Point) => p.y * W + p.x;
  const todas = [...map.caminos.indices].sort((a, b) => a - b);
  const aristas = map.caminos.tramos.map(([p, q]): [number, number] => [indice(p), indice(q)]);
  const unidas = new Map<number, number[]>();
  for (const [i, k] of aristas) {
    unidas.set(i, [...(unidas.get(i) ?? []), k]);
    unidas.set(k, [...(unidas.get(k) ?? []), i]);
  }
  return { todas, unidas, aristas };
}

/** Lo que se alcanza desde `origen` andando por tramos, sin salir de lo que `vale`. */
function pieza(
  unidas: ReadonlyMap<number, readonly number[]>,
  origen: number,
  vale: (j: number) => boolean,
): Set<number> {
  const visto = new Set([origen]);
  const cola = [origen];
  for (let q = 0; q < cola.length; q++) {
    for (const j of unidas.get(cola[q]!) ?? []) {
      if (visto.has(j) || !vale(j)) continue;
      visto.add(j);
      cola.push(j);
    }
  }
  return visto;
}

/**
 * Cuántos ciclos independientes tiene la red de caminos, y cuántos de ellos
 * caben dentro de una sola región: μ = tramos − casillas + piezas, con las
 * piezas por `pieza`, la misma búsqueda por tramos de la auditoría. Es la
 * medida del criterio 1 de «menos caminos» (#149) y de «los caminos como
 * tramos» (#153): dentro de una región la red es un árbol, así que `dentro` es 0.
 */
export function ciclosDeCamino(map: GameMap): { total: number; dentro: number } {
  const W = map.width;
  const red = estructura(map);
  const nodoDe = new Map(red.nodos.map((n) => [n.at.y * W + n.at.x, n.regiones]));
  const { todas, aristas, unidas } = grafoDeCaminos(map);
  const mu = (casillas: ReadonlySet<number>): number => {
    const vistas = new Set<number>();
    let piezas = 0;
    for (const c of casillas) {
      if (vistas.has(c)) continue;
      piezas++;
      for (const j of pieza(unidas, c, (j) => casillas.has(j))) vistas.add(j);
    }
    const dentro = aristas.filter(([i, k]) => casillas.has(i) && casillas.has(k)).length;
    return dentro - casillas.size + piezas;
  };
  let dentro = 0;
  for (let k = 0; k < red.regiones.length; k++) {
    dentro += mu(
      new Set(todas.filter((i) => red.regionDe[i] === k || nodoDe.get(i)?.includes(k) === true)),
    );
  }
  return { total: mu(new Set(todas)), dentro };
}

/** El catálogo de la escena que está en el repo (`assets/mapa/escena.json`), comprobado como lo carga el juego. */
export function catalogoDelDisco(): Catalogo {
  return catalogoValidado(
    JSON.parse(
      readFileSync(join(resolve(import.meta.dirname, '..'), RUTA_DEL_CATALOGO), 'utf8'),
    ) as CatalogoEnBruto,
  );
}

/** El sha256 de un fichero, en hexadecimal. */
export const sha256 = (ruta: string): string =>
  createHash('sha256').update(readFileSync(ruta)).digest('hex');

/** Una senda recta de `p` a `q`, partida en tramos de una décima, como las suavizadas. */
export function recta(p: readonly [number, number], q: readonly [number, number]): Senda {
  const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.1);
  return Array.from({ length: n + 1 }, (_, i) => [
    p[0] + ((q[0] - p[0]) * i) / n,
    p[1] + ((q[1] - p[1]) * i) / n,
  ]);
}

const partidas = new Map<number, { readonly map: GameMap; readonly escena: Escena }>();

/**
 * El mapa de la partida nueva de `semilla` y su escena, con el catálogo del
 * repo. Una vez por semilla y fichero de tests: `componer` un mapa entero
 * cuesta, y `newGame` también.
 */
export function partidaDe(semilla: number): { readonly map: GameMap; readonly escena: Escena } {
  let p = partidas.get(semilla);
  if (p === undefined) {
    const map = newGame({ seed: semilla }).map;
    p = { map, escena: componer(map, semilla, catalogoDelDisco()) };
    partidas.set(semilla, p);
  }
  return p;
}

/** La escena de `partidaDe(semilla)`. */
export const escenaDe = (semilla: number): Escena => partidaDe(semilla).escena;

let hojasLeidas: readonly HojaDeArena[] | null = null;

/** Las hojas de la arena del repo, leídas una vez por fichero de test. */
export function hojasDeLaArena(): readonly HojaDeArena[] {
  hojasLeidas ??= hojasDeArena(resolve(import.meta.dirname, '..'));
  return hojasLeidas;
}

/** La hoja `id` de la arena del repo; lanza si no está. */
export function hojaDeLaArena(id: string): HojaDeArena {
  const hoja = hojasDeLaArena().find((h) => h.id === id);
  if (hoja === undefined) throw new Error(`no hay hoja ${id}`);
  return hoja;
}

/**
 * Una unidad del catálogo (`data/unidades.json`, `core/catalogo.ts`) con los
 * cambios que diga el test: la misma fuente de cifras que la arena y el juego.
 */
export function unidadDeArena(id: string, cambios: Partial<UnidadDeArena> = {}): UnidadDeArena {
  return { ...unidad(id), ...cambios };
}

/**
 * El catálogo de equipo del juego (`EQUIPO_ESCRITO`) con `encima` puestas
 * (`conPiezas`: la del mismo id la sustituye, una nueva va detrás): el catálogo
 * entero que una prueba hace (`catalogoCon`) o guarda.
 */
export function elCatalogoCon(...encima: PiezaEscrita[]): readonly PiezaEscrita[] {
  return conPiezas(EQUIPO_ESCRITO, encima);
}

/**
 * Una carpeta temporal con lo que la arena lee del repo además de lo que escribe:
 * el catálogo de equipo (`data/equipo.json`, el del juego). Sin él, `leerCatalogo`
 * no tiene con qué leer las unidades, como no lo tendría el juego.
 */
export function carpetaDeLaArena(prefijo = 'arena-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefijo));
  mkdirSync(join(dir, 'data'), { recursive: true });
  writeFileSync(
    join(dir, RUTA_DEL_CATALOGO_DE_EQUIPO),
    JSON.stringify({ _comment: COMENTARIO_DEL_CATALOGO_DE_EQUIPO, piezas: EQUIPO_ESCRITO }),
  );
  return dir;
}

/** El catálogo del juego con `encima` puestas (`elCatalogoCon`), leído (`catalogoDeEquipo`). */
export function catalogoCon(...encima: PiezaEscrita[]): CatalogoDeEquipo {
  return catalogoDeEquipo(elCatalogoCon(...encima));
}

/**
 * Por qué no se pasa del catálogo `antes` a las piezas `despues` con esas
 * unidades (`cambioDePiezas`), o `null` si se puede: la pregunta de las pruebas
 * del editor de equipo, que miran el motivo.
 */
export function motivoDelCambio(
  antes: CatalogoDeEquipo,
  despues: readonly PiezaEscrita[],
  unidades: readonly UnidadDeArena[],
): string | null {
  const r = cambioDePiezas(antes, despues, unidades);
  return 'motivo' in r ? r.motivo : null;
}

/** Una rueda con todos los tipos del anillo en el nivel `n`. */
export function todoA(n: number): NivelesDeLaRueda {
  return Object.fromEntries(TIPOS_DEL_ANILLO.map((t) => [t, n])) as NivelesDeLaRueda;
}

/**
 * Un arma de prueba que no suma nada y lleva los niveles de la Espada (`data/equipo.json`):
 * con ella, una criatura del catálogo golpea en la rueda sin que cambien su ataque
 * ni su daño. En la arena nadie golpea sin arma (`armaDeCuerpoBlocker`); estas
 * pruebas de la rueda montan criaturas del juego para que las cifras se cuenten a
 * mano.
 */
export const MANOS_DE_PRUEBA: Pieza = {
  id: 'manos_de_prueba',
  nombre: 'Manos de prueba',
  hueco: 'arma',
  seConsigue: [],
  ataque: 0,
  defensa: 0,
  velocidad: 0,
  rueda: nivelesDeLaEspada(),
  precio: 0,
};

/**
 * Cada stack de `b` (sin arma) con las manos de prueba en el hueco del arma, por
 * `conEquipo`, el único escritor de `UnitInfo.armas` (con su nombre: la batalla no
 * lleva catálogo): golpea en la rueda con los niveles de la Espada (u otros,
 * `niveles`) sin cambiar sus cifras. Devuelve `b`.
 */
export function conManosDePrueba(
  b: BattleState,
  niveles: NivelesDeLaRueda = nivelesDeLaEspada(),
): BattleState {
  const manos: Pieza = { ...MANOS_DE_PRUEBA, rueda: niveles };
  const eq = catalogoCon(manos);
  for (const s of b.stacks) {
    (s as { unit: UnitInfo }).unit = eq.conEquipo(s.unit, { arma: manos.id });
  }
  return b;
}

/** Lo común de un montaje de prueba: las reglas y el catálogo de equipo del juego. */
export const MONTAJE = {
  reglas: REGLAS_DEL_JUEGO,
  equipo: EQUIPO_DEL_JUEGO,
} as const satisfies Pick<MontajeDeArena, 'reglas' | 'equipo'>;

/** Una unidad del borrador a su puesto de la pelea, con su escalera o sin ella. */
export interface PuestoDeLaPelea {
  readonly unidad: UnidadDeArena;
  readonly escalera?: boolean;
}

/** Las unidades, cada una a su puesto de la pelea, sin escalera (`batallaDeArena`). */
export function aPelear(unidades: readonly UnidadDeArena[]): PuestoDeLaPelea[] {
  return unidades.map((unidad) => ({ unidad }));
}

/**
 * El montaje de la arena con unidades del borrador, sin héroes: los tests de la
 * muralla no miran ni el catálogo ni la magia. Con las reglas del juego salvo
 * que se pidan otras, y con el catálogo de equipo del juego y sin modos salvo que
 * se pidan (`extra`: el catálogo hecho, `catalogoCon`, y los modos, como la rueda
 * del golpe).
 */
export function montajeDePrueba(
  izquierda: readonly PuestoDeLaPelea[],
  derecha: readonly PuestoDeLaPelea[],
  muralla: MurallaDeBatalla = SIN_MURALLA,
  reglas: ReglasDeBatalla = REGLAS_DEL_JUEGO,
  extra: Partial<Pick<MontajeDeArena, 'equipo' | 'modos'>> = {},
): MontajeDeArena {
  const lado = (puestos: readonly PuestoDeLaPelea[]) => ({
    unidades: puestos.map(({ unidad, escalera }) => ({ unidad, escalera: escalera === true })),
    heroe: null,
  });
  return {
    izquierda: lado(izquierda),
    derecha: lado(derecha),
    reglas,
    muralla,
    equipo: extra.equipo ?? EQUIPO_DEL_JUEGO,
    ...(extra.modos === undefined ? {} : { modos: extra.modos }),
  };
}

/** Un golpe del registro de la batalla (`attack`). */
export type Ataque = Extract<BattleEvent, { kind: 'attack' }>;

/** Los golpes del registro de `b`, desde el hecho `desde`: los de quien pega y los del contraataque. */
export function ataquesDe(b: BattleState, desde = 0): Ataque[] {
  return b.log.slice(desde).filter((e): e is Ataque => e.kind === 'attack');
}

/**
 * El golpe de una vez a `defender-0` con la rueda: el tipo de quien pega
 * (`golpe`), el de quien recibe (`respuesta`) y lo demás de la acción (`extra`,
 * como su `from`).
 */
export function golpeConLaRueda(
  golpe: TipoDeGolpe,
  respuesta: TipoDeGolpe,
  extra: Partial<BattleAction> = {},
): BattleAction {
  return { type: 'attack', target: 'defender-0', golpe, respuesta, ...extra } as BattleAction;
}

/** `batallaDeArena` con `montajeDePrueba`. */
export function peleaDeArena(
  izquierda: readonly PuestoDeLaPelea[],
  derecha: readonly PuestoDeLaPelea[],
  rng: Rng,
  muralla: MurallaDeBatalla = SIN_MURALLA,
): BattleState {
  return batallaDeArena(montajeDePrueba(izquierda, derecha, muralla), rng);
}

/** Un puesto de `peleaDelMotor`: una unidad del borrador, con escalera y de dos casillas si se pide. */
export interface PuestoDelMotor extends PuestoDeLaPelea {
  readonly grande?: boolean;
}

/**
 * La pelea de `peleaDeArena` por la vía del motor, sin la arena: cada unidad entra
 * como personaje (`members`) con sus cifras de combate (`unidadDeCombate`) y, si
 * se pide, de dos casillas. La arena ya no hace unidades grandes (13-10-2026:
 * «todo el mundo un hexe»), pero el motor sí las juega —el dragón óseo del
 * juego— y sus reglas con la muralla (la cola, la puerta, la escalera) se
 * prueban así. Con las reglas del juego (`createBattle`). Con `heroes`, el de cada
 * bando: es la puerta con la que se compara la de la arena (`batallaDeArena`).
 */
export function peleaDelMotor(
  izquierda: readonly PuestoDelMotor[],
  derecha: readonly PuestoDelMotor[],
  rng: Rng,
  muralla: MurallaDeBatalla = SIN_MURALLA,
  heroes: { readonly izquierda: BattleSide['hero']; readonly derecha: BattleSide['hero'] } = {
    izquierda: null,
    derecha: null,
  },
): BattleState {
  const lado = (puestos: readonly PuestoDelMotor[], hero: BattleSide['hero']): BattleSide => {
    const members = new Map<string, BattleMember>();
    const army: Stack[] = puestos.map(({ unidad, escalera, grande }, i) => {
      const cifras = unidadDeCombate(unidad, EQUIPO_DEL_JUEGO);
      const unit = grande === true ? { ...cifras, hexes: 2 } : cifras;
      const member = `motor-${i}`;
      members.set(member, {
        profile: { unit, morale: 0, luck: 0 },
        hp: unit.hp,
        escalera: escalera === true,
      });
      return { creature: unidad.cuerpo.hoja, member, count: 1 };
    });
    return { army, hero, members };
  };
  return createBattle(
    lado(izquierda, heroes.izquierda),
    lado(derecha, heroes.derecha),
    rng,
    muralla,
  );
}

/**
 * Una sesión de la arena con unidades del borrador, sin héroes, sin empezar. Quién
 * mueve va en cada puesto por comodidad, pero la sesión mueve cada bando entero:
 * un bando con puestos de los dos es un error del test. En `o`, la muralla del
 * tablero y cómo cae el golpe (la rueda, para las pruebas de la rueda).
 */
export function sesionDeArena(
  izquierda: readonly (PuestoDeLaPelea & { readonly ia: boolean })[],
  derecha: readonly (PuestoDeLaPelea & { readonly ia: boolean })[],
  semilla: number,
  o: { readonly muralla?: MurallaDeBatalla; readonly golpe?: ModoDelGolpe } = {},
): SesionDeArena {
  const lado = (puestos: readonly (PuestoDeLaPelea & { readonly ia: boolean })[]) => {
    const ia = puestos.every((p) => p.ia);
    if (puestos.some((p) => p.ia !== ia)) throw new Error('la sesión mueve cada bando entero');
    return {
      unidades: puestos.map(({ unidad, escalera }) => delBorrador(unidad, escalera === true)),
      heroe: null,
      ia,
    };
  };
  return new SesionDeArena(
    {
      izquierda: lado(izquierda),
      derecha: lado(derecha),
      ...MONTAJE,
      muralla: o.muralla ?? SIN_MURALLA,
      ...(o.golpe === undefined ? {} : { modos: { golpe: o.golpe } }),
    },
    semilla,
  );
}

/**
 * Juega la sesión hasta que la rueda le pide algo a la persona (`fase`, si se
 * dice; la otra se contesta con Normal y se sigue): si `golpea`, golpea en cuanto
 * puede y si no se acerca al enemigo más cercano; si no, se defiende. Siempre
 * igual con la misma semilla. Lo usan las pruebas de la rueda.
 */
export function hastaLaRueda(
  s: SesionDeArena,
  golpea: boolean,
  fase?: 'golpe' | 'respuesta',
): void {
  for (let i = 0; i < 300 && s.battle.finished === null; i++) {
    const pendiente = s.ruedaPendiente;
    if (pendiente !== null && (fase === undefined || pendiente.fase === fase)) return;
    if (pendiente !== null) {
      s.elegirEnLaRueda('normal');
      continue;
    }
    const turno = s.turnoPropio;
    if (turno === null) throw new Error('la sesión devuelve el control sin turno ni rueda');
    const legales = s.battleLegalActions();
    const ataque = legales.find((a) => a.type === 'attack');
    const enemigos = s.battle.stacks.filter((x) => x.side !== turno.side && x.count > 0);
    const cerca = (h: { col: number; row: number }): number =>
      Math.min(...enemigos.map((e) => hexDistance(h, e.hex)));
    const acercarse = legales
      .flatMap((a) => (a.type === 'move' ? [a] : []))
      .sort((a, b) => cerca(a.to) - cerca(b.to))[0];
    if (golpea && ataque !== undefined) s.playBattleAction(ataque);
    else if (golpea && acercarse !== undefined && turno.battle.turno?.gastado === 0)
      s.playBattleAction(acercarse);
    else
      s.playBattleAction(
        legales.some((a) => a.type === 'defend') ? { type: 'defend' } : { type: 'end_turn' },
      );
  }
  throw new Error('la rueda no pide nada');
}

/** Una unidad del borrador como fuente del montaje de la arena. */
export function delBorrador(unidad: UnidadDeArena, escalera = false): FuenteDeArena {
  return escalera ? { unidad, escalera } : { unidad };
}
