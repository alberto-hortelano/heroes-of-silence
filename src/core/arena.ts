/**
 * La arena: unidades con cifras inventadas que se prueban peleando, fuera de una
 * partida (`/arena/`, decisión del usuario del 02-10-2026).
 *
 * Las hojas de las cinco facciones (`assets/unidades/`) tienen arte y **no tienen
 * cifras en ningún sitio**: el catálogo del juego (`data/creatures.json`) solo
 * conoce a caballeros y nigromantes. Aquí se les ponen unas por defecto, la
 * persona las ajusta y la página las guarda como borrador
 * (`data/borradores/unidades.json`) para pasarlas luego al catálogo.
 *
 * **El juego no se entera.** Una unidad de arena entra en la batalla por la vía
 * de los personajes de `createBattle` (`members`): el motor toma
 * `profile.unit` tal cual y no vuelve a llamar a `creature()`, así que ni el
 * catálogo ni ninguna partida cambian por tener una arena. El `body` del stack
 * es solo el id de la hoja, que es lo que el cliente pinta.
 *
 * Los campos se llaman como en `data/creatures.json` —`attack`, `defense`,
 * `damage`…— y el tipo los toma de `Creature`, así que una cifra que cambie de
 * forma en el catálogo deja de compilar aquí. **Pasar una unidad al juego no es
 * copiarla**: lo que el catálogo pide y aquí no hay se decide al pasarla, y está
 * escrito en el propio archivo (`COMENTARIO_DEL_BORRADOR`).
 */
import { type BattleMember, type BattleSide, createBattle } from './battle/battle.js';
import type { BattleState, Side } from './battle/types.js';
import { CATALOGO_DE_HABILIDADES, LIDERAZGO } from './data.js';
import type { Rng } from './rng.js';
import {
  CREATURE_TRAITS,
  type Creature,
  type CreatureTrait,
  SPEED_TIERS,
  SPEED_TO_HEXES,
  type SpeedTier,
  type Stack,
  type UnitInfo,
} from './types.js';

/**
 * Las cinco facciones de las hojas. Es la misma lista que la de
 * `tools/taller/unidades.ts`, que la importa de aquí como tipo: escrita en los
 * dos sitios, una facción nueva en el taller dejaría a su hoja sin poder
 * guardarse y nadie lo vería hasta pulsar «Guardar».
 */
export const FACCIONES_DE_ARENA = [
  'templarios',
  'no-muertos',
  'imperio',
  'elfos',
  'orkos',
] as const;
export type FaccionDeArena = (typeof FACCIONES_DE_ARENA)[number];

/** Cómo se llama cada facción en pantalla: la arena y la página de ejércitos del taller. */
export const NOMBRE_DE_FACCION_DE_ARENA: Readonly<Record<FaccionDeArena, string>> = {
  templarios: 'Templarios',
  'no-muertos': 'No muertos',
  imperio: 'Imperio',
  elfos: 'Elfos',
  orkos: 'Orkos',
};

/**
 * Los dos lados del montaje y lo que el motor sabe de ellos: la izquierda ataca
 * y la derecha defiende. Una tabla, porque «izquierdo», «izquierda» y
 * `attacker` se escribían a mano en siete sitios.
 */
export type Lado = 'izquierda' | 'derecha';
export const LADOS: Readonly<
  Record<Lado, { readonly bando: Side; readonly adjetivo: string; readonly rotulo: string }>
> = {
  izquierda: { bando: 'attacker', adjetivo: 'izquierdo', rotulo: 'Izquierda' },
  derecha: { bando: 'defender', adjetivo: 'derecho', rotulo: 'Derecha' },
};

/** El lado del montaje de un bando del motor. */
export function ladoDe(bando: Side): Lado {
  return bando === LADOS.izquierda.bando ? 'izquierda' : 'derecha';
}

/**
 * Los perfiles de pose de las hojas: los cinco de `tools/art/poses.ts` y el del
 * jinete. Están aquí y no importados de allí porque `poses.ts` toca el disco y
 * `core` es puro; un test compara los dos conjuntos con las hojas de verdad.
 */
export const PERFILES_DE_ARENA = [
  'espada-escudo',
  'dos-manos',
  'baston',
  'arco',
  'ballesta',
  'montado-lanza',
] as const;
export type PerfilDeArena = (typeof PERFILES_DE_ARENA)[number];

/**
 * Una unidad del borrador: lo que la arena pelea y lo que el archivo guarda.
 *
 * Las cifras se toman de `Creature` y no se redeclaran: si el catálogo cambia la
 * forma de una, la arena deja de compilar en vez de guardar otra cosa.
 */
export interface UnidadDeArena
  extends Pick<
    Creature,
    | 'id'
    | 'name'
    | 'level'
    | 'leadership'
    | 'attack'
    | 'defense'
    | 'damage'
    | 'hp'
    | 'shots'
    | 'hexes'
  > {
  /** El id de su hoja en `assets/unidades/`. */
  readonly id: string;
  /** Una de las cinco: no es la `faction` del juego, que solo sabe de dos. */
  readonly faction: FaccionDeArena;
  /**
   * La velocidad, en **casillas** por turno (decisión del usuario, 02-10-2026:
   * «la velocidad debería ser el número de casillas que mueve»). El motor sigue
   * jugando escalones (`SpeedTier`); la traducción es `escalonDeCasillas`, una
   * sola. Al catálogo pasa como escalón: 2 `very_slow` … 7 `ultra_fast`.
   */
  readonly casillas: number;
  /** Rasgos del motor: estos SÍ actúan en la pelea. Siempre presente, aunque vacía. */
  readonly traits: readonly CreatureTrait[];
  /**
   * Nombres de `data/habilidades.json`. **Inertes**: se guardan y la ficha dice
   * «sin efecto todavía», porque no hay motor de habilidades.
   */
  readonly habilidades: readonly string[];
  /** Precio en oro. No pelea; el juego lo necesitará. */
  readonly cost: { readonly gold: number };
}

/** Los campos que puede llevar una unidad del archivo: lo demás se rechaza diciéndolo. */
const CAMPOS_DE_UNIDAD: readonly string[] = [
  'id',
  'name',
  'faction',
  'level',
  'leadership',
  'attack',
  'defense',
  'damage',
  'hp',
  'casillas',
  // Solo para leer borradores de antes de las casillas: se convierte al leer y
  // no se vuelve a escribir.
  'speed',
  'shots',
  'hexes',
  'traits',
  'habilidades',
  'cost',
];

/** Lo que una unidad recibe por defecto según su perfil: todo menos quién es. */
type CifrasPorDefecto = Omit<UnidadDeArena, 'id' | 'name' | 'faction' | 'habilidades' | 'casillas'>;

/**
 * Las cifras con las que sale una hoja la primera vez, por su perfil de pose.
 *
 * **Inventadas y provisionales**, a ojo del catálogo de HoMM2 que ya hay: son un
 * punto de partida para ajustar en la arena, no una propuesta de equilibrio. El
 * arco y la ballesta tiran, las dos manos pegan más y defienden menos, el bastón
 * es frágil y el jinete carga. **La velocidad no va por perfil sino por unidad**
 * (`casillas` de cada hoja, `tools/arena/velocidades.ts`): con una por perfil
 * casi todas empataban y el empate lo gana siempre el atacante.
 */
const POR_PERFIL: Readonly<Record<PerfilDeArena, CifrasPorDefecto>> = {
  'espada-escudo': {
    level: 2,
    leadership: 3,
    attack: 5,
    defense: 7,
    damage: [2, 4],
    hp: 15,
    traits: [],
    cost: { gold: 150 },
  },
  'dos-manos': {
    level: 3,
    leadership: 4,
    attack: 8,
    defense: 4,
    damage: [4, 7],
    hp: 18,
    traits: [],
    cost: { gold: 250 },
  },
  baston: {
    level: 2,
    leadership: 3,
    attack: 3,
    defense: 3,
    damage: [1, 3],
    hp: 8,
    traits: [],
    cost: { gold: 150 },
  },
  arco: {
    level: 2,
    leadership: 3,
    attack: 5,
    defense: 3,
    damage: [2, 3],
    hp: 10,
    shots: 12,
    traits: [],
    cost: { gold: 150 },
  },
  ballesta: {
    level: 3,
    leadership: 4,
    attack: 6,
    defense: 4,
    damage: [3, 5],
    hp: 12,
    shots: 8,
    traits: [],
    cost: { gold: 200 },
  },
  'montado-lanza': {
    level: 5,
    leadership: 8,
    attack: 10,
    defense: 8,
    damage: [5, 9],
    hp: 30,
    traits: ['charge'],
    cost: { gold: 300 },
  },
};

/** Las cifras por defecto de un perfil. El perfil ya viene validado (`validarHojasDeArena`). */
export function cifrasPorDefecto(perfil: PerfilDeArena): CifrasPorDefecto {
  return POR_PERFIL[perfil];
}

/**
 * Una hoja tal como la sirve el servidor de desarrollo: quién es, si es un
 * héroe y su `atlas.json`, para pintarla sin otra petición. Una declaración,
 * que leen el servidor (`tools/arena/borrador.ts`) y la página.
 */
export interface HojaDeArena {
  readonly id: string;
  readonly nombre: string;
  readonly faccion: FaccionDeArena;
  readonly perfil: PerfilDeArena;
  readonly heroe: boolean;
  /** Las casillas con las que sale la unidad la primera vez. */
  readonly casillas: number;
  /** El JSON de la hoja; lo comprueba `comoAtlas` al registrarla para pintarla. */
  readonly atlas: unknown;
}

/**
 * La lista de hojas que llega por la red, comprobada: es la puerta por la que
 * entran el perfil y la facción, así que después nadie tiene que volver a
 * preguntar si existen.
 */
export function validarHojasDeArena(valor: unknown): readonly HojaDeArena[] {
  if (!Array.isArray(valor)) throw new Error('la lista de hojas de la arena no es una lista');
  return valor.map((v: unknown): HojaDeArena => {
    if (typeof v !== 'object' || v === null)
      throw new Error('una hoja de la arena no es un objeto');
    const h = v as Record<string, unknown>;
    const id = texto(h.id, 'el id', 'una hoja de la arena');
    const quien = `la hoja "${id}"`;
    if (typeof h.heroe !== 'boolean') throw new Error(`${quien}: no dice si es un héroe`);
    return {
      id,
      nombre: texto(h.nombre, 'el nombre', quien),
      faccion: deLaLista(h.faccion, FACCIONES_DE_ARENA, 'la facción', quien),
      perfil: deLaLista(h.perfil, PERFILES_DE_ARENA, 'el perfil', quien),
      heroe: h.heroe,
      casillas: casillasValidas(h.casillas, quien),
      atlas: h.atlas,
    };
  });
}

/**
 * La unidad con la que sale una hoja que todavía no está en el borrador. Los no
 * muertos salen con `undead`: un esqueleto vivo, con moral, era raro (M7 de QA).
 */
export function unidadPorDefecto(
  hoja: Pick<HojaDeArena, 'id' | 'nombre' | 'faccion' | 'perfil' | 'casillas'>,
): UnidadDeArena {
  const cifras = cifrasPorDefecto(hoja.perfil);
  return {
    id: hoja.id,
    name: hoja.nombre,
    faction: hoja.faccion,
    casillas: hoja.casillas,
    habilidades: [],
    ...cifras,
    traits: hoja.faccion === 'no-muertos' ? [...cifras.traits, 'undead'] : cifras.traits,
  };
}

// ------------------------------------------------------------- velocidad

/**
 * El escalón del motor que mueve `n` casillas: la inversa de `SPEED_TO_HEXES`,
 * que es una biyección (2 a 7). La ÚNICA traducción de casillas a escalón; lo
 * que no es un escalón se rechaza diciendo cuáles valen.
 */
export function escalonDeCasillas(n: number): SpeedTier {
  const tier = SPEED_TIERS.find((t) => SPEED_TO_HEXES[t] === n);
  if (tier === undefined) {
    throw new Error(`la velocidad es de ${CASILLAS_MIN} a ${CASILLAS_MAX} casillas, y es ${n}`);
  }
  return tier;
}

export const CASILLAS_MIN = Math.min(...SPEED_TIERS.map((t) => SPEED_TO_HEXES[t]));
export const CASILLAS_MAX = Math.max(...SPEED_TIERS.map((t) => SPEED_TO_HEXES[t]));

/** Unas casillas que el motor sabe jugar, o se lanza diciendo de quién. */
function casillasValidas(valor: unknown, quien: string): number {
  const n = entero(valor, 'la velocidad', quien, CASILLAS_MIN);
  if (n > CASILLAS_MAX) {
    throw new Error(
      `${quien}: la velocidad es de ${CASILLAS_MIN} a ${CASILLAS_MAX} casillas, y es ${n}`,
    );
  }
  return n;
}

// ------------------------------------------------------------- validación

function entero(valor: unknown, campo: string, quien: string, minimo: number): number {
  // `NaN` es lo que da un campo vacío en la página, y `JSON.stringify(NaN)` diría
  // «null», que nadie ha escrito (M2 de QA).
  if (typeof valor === 'number' && Number.isNaN(valor)) {
    throw new Error(`${quien}: ${campo} no tiene valor, el campo está vacío`);
  }
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor)) {
    throw new Error(
      `${quien}: ${campo} tiene que ser un número entero, y es ${typeof valor === 'number' ? valor : JSON.stringify(valor)}`,
    );
  }
  if (valor < minimo) {
    throw new Error(`${quien}: ${campo} tiene que ser ${minimo} o más, y es ${valor}`);
  }
  return valor;
}

function texto(valor: unknown, campo: string, quien: string): string {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new Error(`${quien}: ${campo} tiene que ser un texto no vacío`);
  }
  return valor;
}

function deLaLista<T extends string>(
  valor: unknown,
  lista: readonly T[],
  campo: string,
  quien: string,
): T {
  const hallado = lista.find((x) => x === valor);
  if (hallado === undefined) {
    throw new Error(`${quien}: ${campo} "${String(valor)}" no existe; valen ${lista.join(', ')}`);
  }
  return hallado;
}

function sinRepetir(lista: readonly string[], campo: string, quien: string): void {
  const repetido = lista.find((x, i) => lista.indexOf(x) !== i);
  if (repetido !== undefined) throw new Error(`${quien}: ${campo} "${repetido}" está dos veces`);
}

function lista(valor: unknown, campo: string, quien: string): readonly unknown[] {
  if (!Array.isArray(valor)) throw new Error(`${quien}: ${campo} tiene que ser una lista`);
  return valor;
}

/**
 * Una unidad del borrador, comprobada; lanza diciendo qué no cuadra y de quién.
 *
 * Es la única regla: la usan el servidor de desarrollo antes de escribir, la
 * página al cargar lo guardado y la sesión antes de pelear. Lo desconocido no
 * se cuela en silencio —una velocidad inventada caería a `undefined` en
 * `SPEED_TO_HEXES` y la unidad no se movería sin que nadie supiera por qué—.
 */
export function validarUnidadDeArena(valor: unknown): UnidadDeArena {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new Error('una unidad de la arena tiene que ser un objeto');
  }
  const u = valor as Record<string, unknown>;
  const id = texto(u.id, 'el id', 'una unidad de la arena');
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw new Error(`la unidad "${id}": el id es el de su hoja, en minúsculas y con guiones`);
  }
  const quien = `la unidad "${id}"`;
  // Lo que no es un campo de la arena no se descarta callando: un `growth`
  // escrito a mano desaparecería en el siguiente «Guardar» (M14 de QA).
  const ajeno = Object.keys(u).find((k) => !CAMPOS_DE_UNIDAD.includes(k));
  if (ajeno !== undefined) {
    throw new Error(
      `${quien}: «${ajeno}» no es un campo de la arena; valen ${CAMPOS_DE_UNIDAD.join(', ')}`,
    );
  }
  const name = texto(u.name, 'el nombre', quien);
  const faction = deLaLista(u.faction, FACCIONES_DE_ARENA, 'la facción', quien);
  const level = entero(u.level, 'el nivel', quien, 1);
  const leadership = entero(u.leadership, 'el liderazgo', quien, 1);
  const attack = entero(u.attack, 'el ataque', quien, 0);
  const defense = entero(u.defense, 'la defensa', quien, 0);
  if (!Array.isArray(u.damage) || u.damage.length !== 2) {
    throw new Error(`${quien}: el daño tiene que ser [mínimo, máximo]`);
  }
  const min = entero(u.damage[0], 'el daño mínimo', quien, 1);
  const max = entero(u.damage[1], 'el daño máximo', quien, 1);
  if (min > max) {
    throw new Error(`${quien}: el daño mínimo (${min}) no puede pasar del máximo (${max})`);
  }
  const hp = entero(u.hp, 'la vida', quien, 1);
  // Un borrador de antes de las casillas trae `speed` como escalón: se lee
  // convertido. Con los dos a la vez, cuál manda sería adivinar: se dice.
  if (u.casillas !== undefined && u.speed !== undefined) {
    throw new Error(
      `${quien}: trae la velocidad dos veces, en casillas y como «speed»; deja solo las casillas`,
    );
  }
  const casillas =
    u.speed !== undefined
      ? SPEED_TO_HEXES[deLaLista(u.speed, SPEED_TIERS, 'la velocidad', quien)]
      : casillasValidas(u.casillas, quien);
  const traits = lista(u.traits, 'los rasgos', quien).map((t) =>
    deLaLista(t, CREATURE_TRAITS, 'el rasgo', quien),
  );
  const habilidades = lista(u.habilidades, 'las habilidades', quien).map((h) =>
    deLaLista(h, CATALOGO_DE_HABILIDADES, 'la habilidad', quien),
  );
  sinRepetir(traits, 'el rasgo', quien);
  sinRepetir(habilidades, 'la habilidad', quien);
  if (typeof u.cost !== 'object' || u.cost === null) {
    throw new Error(`${quien}: el coste tiene que ser { gold }`);
  }
  const gold = entero((u.cost as Record<string, unknown>).gold, 'el coste en oro', quien, 0);
  const shots = u.shots === undefined ? undefined : entero(u.shots, 'la munición', quien, 1);
  const hexes = u.hexes === undefined ? undefined : entero(u.hexes, 'los hexes', quien, 1);
  if (hexes !== undefined && hexes > 2) {
    throw new Error(`${quien}: una unidad ocupa 1 hex o 2, y esta dice ${hexes}`);
  }
  return {
    id,
    name,
    faction,
    level,
    leadership,
    attack,
    defense,
    damage: [min, max],
    hp,
    casillas,
    ...(shots === undefined ? {} : { shots }),
    ...(hexes === undefined ? {} : { hexes }),
    traits,
    habilidades,
    cost: { gold },
  };
}

/**
 * Lo que dice el `_comment` del archivo: que es un borrador, de dónde sale y
 * **qué falta para pasar una unidad al catálogo**. Decía «copiándola», y QA lo
 * probó en una copia del repo: con la facción de la arena el juego no arranca
 * (falta la guarnición neutral) y con `knight` tampoco (falta su fila en
 * `experiencia.json`). Quien lea el archivo —una persona o un agente— se lo cree.
 */
export const COMENTARIO_DEL_BORRADOR =
  'BORRADOR de la arena (/arena/, pnpm arena): cifras de las unidades de las cinco facciones, INVENTADAS y provisionales, ajustadas a mano peleando. Lo escribe la página al pulsar «Guardar» y lo valida validarUnidadDeArena (src/core/arena.ts); una unidad que no valida se conserva tal cual. El juego NO lo lee. Los campos de cifras se llaman como en data/creatures.json, pero pasar una unidad al catálogo NO es copiarla; hay que añadir: (1) la faction del juego (hoy solo knight o necromancer; una facción nueva pide además su guarnición neutral en data/ciudades.json), (2) speed: el escalón de sus casillas (2 very_slow, 3 slow, 4 average, 5 fast, 6 very_fast, 7 ultra_fast), en lugar de casillas, (3) growth (crecimiento semanal de su morada), (4) upgradesTo si tiene mejora, (5) su fila en data/experiencia.json (una habilidad por nivel, del 2 al máximo: la lista habilidades de aquí es suelta y no dice a qué nivel va cada una), y quitar id de hoja, faction de la arena y habilidades. habilidades = nombres de data/habilidades.json, sin efecto todavía.';

/** Una unidad del archivo que no pasa la regla: se cuenta por qué y se guarda tal cual. */
export interface UnidadSinValidar {
  readonly id: string | null;
  readonly motivo: string;
  readonly crudo: unknown;
}

/**
 * El archivo leído unidad a unidad: las que valen y las que no, cada una con su
 * motivo. Una unidad mala no tira las buenas (H2 de QA: con una sola editada a
 * mano, la página arrancaba vacía y «Guardar» pisaba el resto). Lanza solo si el
 * archivo entero no tiene la forma `{ unidades: [...] }`: ahí no hay nada que
 * salvar unidad a unidad.
 */
export function revisarBorradorDeArena(valor: unknown): {
  readonly validas: readonly UnidadDeArena[];
  readonly invalidas: readonly UnidadSinValidar[];
} {
  const crudas = listaDelBorrador(valor);
  const validas: UnidadDeArena[] = [];
  const invalidas: UnidadSinValidar[] = [];
  for (const crudo of crudas) {
    const id =
      typeof crudo === 'object' &&
      crudo !== null &&
      typeof (crudo as { id?: unknown }).id === 'string'
        ? (crudo as { id: string }).id
        : null;
    try {
      const u = validarUnidadDeArena(crudo);
      if (validas.some((v) => v.id === u.id)) {
        throw new Error(`la unidad "${u.id}" está dos veces en el borrador`);
      }
      validas.push(u);
    } catch (err) {
      invalidas.push({ id, motivo: err instanceof Error ? err.message : String(err), crudo });
    }
  }
  return { validas, invalidas };
}

function listaDelBorrador(valor: unknown): readonly unknown[] {
  if (typeof valor !== 'object' || valor === null || !('unidades' in valor)) {
    throw new Error('el borrador de la arena tiene que ser { unidades: [...] }');
  }
  return lista((valor as { unidades: unknown }).unidades, 'unidades', 'el borrador de la arena');
}

/**
 * El archivo entero: `{ _comment, unidades }`, con cada unidad validada y sin
 * dos veces la misma hoja —el borrador es por tipo, y dos fichas del mismo id
 * querrían decir dos cifras para una hoja—.
 */
export function validarBorradorDeArena(valor: unknown): readonly UnidadDeArena[] {
  const unidades = listaDelBorrador(valor).map(validarUnidadDeArena);
  sinRepetir(
    unidades.map((u) => u.id),
    'la unidad',
    'el borrador de la arena',
  );
  return unidades;
}

// ---------------------------------------------------------------- la pelea

/** Lo que el motor juega de una unidad de arena: sus cifras, sin economía. */
function unidadDeCombate(u: UnidadDeArena): UnitInfo {
  // Fuera lo que no pelea; el resto son ya los campos de `UnitInfo`.
  const {
    id: _id,
    faction: _f,
    level,
    leadership: _l,
    habilidades: _h,
    cost: _c,
    casillas,
    ...cifras
  } = u;
  // Sin facción del juego: las cinco no son `FactionId`, y así tampoco suman ni
  // restan a la moral por diversidad. Su moral es 0 y no la decide nadie.
  return { ...cifras, speed: escalonDeCasillas(casillas), faction: null, nivel: level };
}

function bandoDeArena(unidades: readonly UnidadDeArena[], nombre: string): BattleSide {
  if (unidades.length === 0) {
    throw new Error(`el bando ${nombre} está vacío: pon al menos una unidad`);
  }
  // `createBattle` también lo comprueba, pero diciendo «el atacante»: en la arena
  // no hay atacante, hay izquierda y derecha.
  if (unidades.length > LIDERAZGO.maxPorBando) {
    throw new Error(
      `el bando ${nombre} lleva ${unidades.length} unidades y caben ${LIDERAZGO.maxPorBando}: quita ${unidades.length - LIDERAZGO.maxPorBando}`,
    );
  }
  const members = new Map<string, BattleMember>();
  const army: Stack[] = unidades.map((valor, i) => {
    // Las cifras llegan de la página ya validadas; se vuelven a mirar porque la
    // batalla es la última puerta y un objeto a mano (un test, el arnés) no pasó
    // por ninguna otra.
    const u = validarUnidadDeArena(valor);
    // Un id por puesto: dos monjes en el mismo bando son dos individuos, y el
    // motor rechaza un personaje que aparece dos veces.
    const member = `arena-${i}`;
    members.set(member, { profile: { unit: unidadDeCombate(u), morale: 0, luck: 0 }, hp: u.hp });
    return { creature: u.id, member, count: 1 };
  });
  return { army, hero: null, members };
}

/**
 * Una batalla de arena: la izquierda ataca y la derecha defiende, sin héroes.
 * Los stacks salen en el orden de cada lista (`slot` = su puesto), que es lo
 * que deja a quien llama saber qué unidad del montaje es cada stack.
 */
export function batallaDeArena(
  izquierda: readonly UnidadDeArena[],
  derecha: readonly UnidadDeArena[],
  rng: Rng,
): BattleState {
  return createBattle(
    bandoDeArena(izquierda, LADOS.izquierda.adjetivo),
    bandoDeArena(derecha, LADOS.derecha.adjetivo),
    rng,
  );
}

/**
 * Cómo acabó una pelea, dicho por el lado del montaje. `porTiempo` es que los
 * dos lados siguen en pie: el motor la cerró al llegar a `MAX_ROUNDS`
 * (`finishByExhaustion`), donde gana quien tiene más unidades en pie y, a
 * igualdad, quien defiende —la derecha—. Sin decirlo, «gana el derecho» tras
 * cien rondas en que nadie se hizo daño parecía que la derecha era más fuerte
 * (H4 de QA).
 */
export function finalDeArena(
  battle: BattleState,
): { readonly ganador: Lado; readonly porTiempo: boolean; readonly empate: boolean } | null {
  if (battle.finished === null) return null;
  const enPie = (bando: Side): number =>
    battle.stacks.filter((s) => s.side === bando && s.count > 0).reduce((n, s) => n + s.count, 0);
  const izquierda = enPie(LADOS.izquierda.bando);
  const derecha = enPie(LADOS.derecha.bando);
  return {
    ganador: ladoDe(battle.finished.winner),
    porTiempo: izquierda > 0 && derecha > 0,
    empate: izquierda === derecha,
  };
}
