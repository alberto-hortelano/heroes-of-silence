/**
 * Montar casos de partida en los tests de las reglas: un ejército escrito por
 * grupos, el monstruo al que se entra (`forzarBatalla`), un paso o un pueblo de
 * alguien, la guarnición de una ciudad, un héroe fuera de su base o ante la
 * ajena, y una partida acabada de verdad. Sin el cliente: solo el núcleo.
 * (Venían de `test/helpers.ts`, repartido en la fase T de la reorganización,
 * 06-11-2026.)
 */
import { Casillas } from '../src/core/map/casillas.js';
import { findPath, isEnterable, type MapObject, objectAt, pointKey } from '../src/core/map/map.js';
import { estructura, VECINAS } from '../src/core/map/regiones.js';
import { heroesOf } from '../src/core/state/consultas.js';
import { applyAdventureAction, baseOf } from '../src/core/state/game.js';
import { dueñoDeLaCiudad, ponerLaGuarnicion, sitioDeLaCiudad } from '../src/core/state/sitios.js';
import type { GameContext, GameState } from '../src/core/state/tipos.js';
import type { Town } from '../src/core/town/town.js';
import type { Army, Equipo, Hero, PlayerId, Point, Stack, Troop } from '../src/core/types.js';

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
    if (base !== undefined) guarnecer(state, base, []);
  }
  return state;
}

/**
 * Un ejército de individuos, escrito por grupos: `{ creature: 'templario-escudo',
 * count: 20 }` son veinte piqueros, uno detrás de otro y en el orden en que se
 * escriben.
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

/** Un individuo de `creature` con su propia hoja y `equipo` encima de lo de serie. */
export function conSuEquipo(creature: string, equipo: Equipo, id = `v-${creature}`): Troop {
  return {
    creature,
    veterania: { id, experiencia: 0, batallas: 0, bajas: 0, heroes: [], equipo },
  };
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
 * primera marcha lanzaba. Se rehace desde sus índices. Los caminos
 * (`RedDeCaminos`), igual, sin `une` (las puertas de una ciudad, fase 2 de la
 * ciudad amurallada): no cambian en una partida y se comparten. Lo demás es la
 * copia de siempre.
 */
export function copiaDePartida(state: GameState): GameState {
  const copia = structuredClone(state);
  copia.map = { ...copia.map, caminos: state.map.caminos };
  copia.players = copia.players.map((p, i) => ({
    ...p,
    fog: Casillas.deIndices(
      state.map,
      (state.players[i] as GameState['players'][number]).fog.indices(),
    ),
  }));
  return copia;
}

/** Un paso de la red (un nodo que no es ciudad), el primero del mapa. */
export function unPaso(state: GameState): Extract<MapObject, { kind: 'node' }> {
  const n = state.map.objects.find(
    (o): o is Extract<MapObject, { kind: 'node' }> => o.kind === 'node',
  );
  if (n === undefined) throw new Error('el mapa no tiene ningún paso');
  return n;
}

/**
 * Un pueblo cuya región se hace de `jugador` a mano: todos sus nodos, suyos (los
 * pasos por su objeto; una ciudad de la red, por sus dos caras). Así el pueblo es
 * de quien tiene su región, que es la regla.
 */
export function unPuebloDe(
  state: GameState,
  jugador: number,
): Extract<MapObject, { kind: 'village' }> {
  const red = estructura(state.map);
  for (const o of state.map.objects) {
    if (o.kind !== 'village') continue;
    const k = red.regionDe[o.at.y * state.map.width + o.at.x] ?? -1;
    if (k < 0) continue;
    for (const n of red.regiones[k]!.nodos) {
      const nodo = red.nodos[n]!;
      const obj = state.map.objects.find((x) => x.id === nodo.id)!;
      // El dueño guardado del paso o de la ciudad del muro: su objeto.
      if (obj.kind === 'node' || obj.kind === 'town' || obj.kind === 'village') obj.owner = jugador;
    }
    return o;
  }
  throw new Error('el mapa no tiene ningún pueblo en una región');
}

/**
 * Una casilla pegada a `desde` a la que se llega de un paso, sin objeto: donde
 * plantar a un héroe para que entre en batalla sin cruzar nada por el camino.
 * Desde que perder la base elimina y el castillo no bloquea, mandar al héroe
 * de una punta a otra del mapa cruzaba la base rival vacía y acababa la
 * partida antes de llegar a la batalla que el test quería ver.
 */
export function pegadoA(state: GameState, desde: Point, salvo: readonly Point[] = []): Point {
  // Las ocho y no solo las rectas: con fronteras gruesas, la base está en un
  // pasillo y a veces solo tiene libres las diagonales.
  for (const [dx, dy] of VECINAS) {
    const at = { x: desde.x + dx, y: desde.y + dy };
    if (salvo.some((p) => pointKey(p) === pointKey(at))) continue;
    const camino = findPath(state.map, desde, at);
    if (camino?.length === 1 && objectAt(state.map, at) === undefined) return at;
  }
  throw new Error(`(${desde.x},${desde.y}) no tiene ninguna casilla vecina libre`);
}

/**
 * Saca al héroe de salida de `quien` de su base a una casilla pegada a ella, y
 * lo devuelve. El héroe nace DENTRO de su base; las pruebas que miden otra cosa
 * con él fuera (recoger la guarnición al pasar, que sin él dentro no se recluta,
 * contratar en casa) lo sacan con esto en vez de suponer dónde empieza.
 */
export function fueraDeSuBase(state: GameState, quien: PlayerId): Hero {
  const heroe = heroesOf(state, quien)[0]!;
  const otros = state.heroes.filter((h) => h !== heroe).map((h) => h.at);
  heroe.at = pegadoA(state, baseOf(state, quien)!.at, otros);
  return heroe;
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
  guarnecer(state, base, []);
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

// ------------------------------------------------------------ la guarnición de una ciudad

/**
 * Escribe la guarnición de la ciudad `town` (lo que los tests hacían con
 * `town.garrison = …`), con el dueño de la ciudad o el que se diga. Por la puerta
 * del núcleo (`ponerLaGuarnicion`), la única que escribe `guarniciones`.
 */
export function guarnecer(
  state: GameState,
  town: Town,
  tropa: Army,
  dueño: PlayerId | null = dueñoDeLaCiudad(state, town),
): void {
  ponerLaGuarnicion(state, sitioDeLaCiudad(town), dueño, tropa);
}

/**
 * Da la ciudad del muro `town` a `jugador` (lo que los tests hacían con
 * `town.owner = …`): escribe el dueño guardado en su objeto del mapa, que es donde
 * vive desde la tarea 2. Solo para montar casos: en partida lo escribe
 * `tomarElNodo`.
 */
export function darLaCiudad(state: GameState, town: Town, jugador: PlayerId | null): void {
  const objeto = state.map.objects.find((o) => o.kind === 'town' && o.id === town.id);
  if (objeto === undefined || objeto.kind !== 'town') {
    throw new Error(`la ciudad ${town.id} no tiene objeto en el mapa`);
  }
  objeto.owner = jugador;
}
