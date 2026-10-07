import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  type Catalogo,
  type CatalogoEnBruto,
  catalogoValidado,
  RUTA_DEL_CATALOGO,
} from '../src/client/render/escenario/catalogo.js';
import { componer, type Escena } from '../src/client/render/escenario/colocar.js';
import type { Senda } from '../src/client/render/escenario/sendas.js';
import {
  activeStack,
  applyAction,
  blockedHexes,
  enemiesOf,
  legalActions,
  stackHexes,
} from '../src/core/battle/battle.js';
import { hexDistance } from '../src/core/battle/board.js';
import type { BattleAction, BattleStack, BattleState } from '../src/core/battle/types.js';
import { personajeDe } from '../src/core/battle/types.js';
import { BARRERAS_DEL_MAPA } from '../src/core/data.js';
import type { Hero } from '../src/core/hero/hero.js';
import type { MapPlan, PlanConCasillas } from '../src/core/map/generate.js';
import {
  findPath,
  type GameMap,
  isEnterable,
  type MapObject,
  objectAt,
  pointFromKey,
  RedDeCaminos,
} from '../src/core/map/map.js';
import { estructura, juntoANodo, rellenar, VECINAS, vecindad } from '../src/core/map/regiones.js';
import { esBarrera, type TerrainKind } from '../src/core/map/terrain.js';
import type { Rng } from '../src/core/rng.js';
import {
  applyAdventureAction,
  baseOf,
  type GameContext,
  type GameState,
  heroesOf,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import type { Army, PlayerId, Point, Stack, Troop } from '../src/core/types.js';

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

export { blockedHexes };

/**
 * Le da el turno a `stack` a mano, como si lo hubiera abierto `advance`: un
 * ordinal nuevo —el siguiente al de ahora— y lo gastado que diga el test.
 */
export function forzarTurno(state: BattleState, stack: string, gastado = 0): void {
  state.turno = { n: (state.turno?.n ?? 0) + 1, stack, gastado };
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

// ---------------------------------------------------------------- mapas densos

/**
 * Las barreras de un mapa construido, partidas en **frontera** y **obstáculo**
 * desde fuera, sin preguntarle nada al generador: una componente 8-conexa de
 * barrera cuyas vecinas pisables (nodos aparte) son todas de UNA región y que
 * no se pega a ningún nodo es un obstáculo de esa región; el resto es frontera.
 * Es la definición que el generador se obliga a cumplir al no dejar que una
 * mancha toque la frontera.
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
  // Pegada a un nodo es frontera aunque solo toque una región: el nodo y su
  // pasillo cortan la frontera gruesa en trozos, y el de un lado del paso
  // puede no tocar más que una (la semilla 80 en 28×28). Un obstáculo nunca
  // se pega a un nodo: es la misma marca con la que el generador lo veta.
  const pegadaANodo = juntoANodo(map);
  const barrera = (i: number) => esBarrera(map.terrain[i] as TerrainKind);
  const visto = new Uint8Array(W * H);
  const frontera = new Map<TerrainKind, number>();
  const obstaculo = map.regions.map(() => 0);
  for (let i = 0; i < W * H; i++) {
    if (visto[i] === 1 || !barrera(i)) continue;
    const regiones = new Set<number>();
    const toma = (j: number): boolean => {
      if (!barrera(j)) {
        if (red.regionDe[j]! >= 0) regiones.add(red.regionDe[j]!);
        return false;
      }
      if (visto[j] === 1) return false;
      visto[j] = 1;
      return true;
    };
    toma(i);
    const casillas = rellenar(W, H, i, toma);
    if (regiones.size === 1 && !casillas.some((c) => pegadaANodo[c] === 1)) {
      obstaculo[[...regiones][0]!]! += casillas.length;
    } else {
      for (const c of casillas) {
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
 *   ≥ 3, salvo que alguna esté a ≤ 3 de un nodo (el estrechamiento del paso);
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
        if (s >= 0 && s !== r && cercaDeNodo[j] === 0) {
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
