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
import {
  type BattleMember,
  type BattleSide,
  type CausaDelFinal,
  causaDelFinal,
  crearBatallaConReglas,
  despliegueBlocker,
  type HeroeDelBando,
  mandoDe,
  quienNoEscala,
} from './battle/battle.js';
import type { StackEffect } from './battle/effects.js';
import { type MurallaDeBatalla, SIN_MURALLA, validarMuralla } from './battle/muralla.js';
import {
  esDeCura,
  HABILIDADES_CON_PODER,
  habilidadesQueTrae,
  poder,
  poderDeHabilidad,
} from './battle/poderes.js';
import { REGLAS_DEL_JUEGO, type ReglasDeBatalla } from './battle/reglas.js';
import {
  allSpells,
  delHeroe,
  duracionDeLoQueLanza,
  efectoDe,
  ordenDelLibro,
  spell,
  spellAmount,
} from './battle/spells.js';
import type {
  BattleStack,
  BattleState,
  FichaEnPalabras,
  Side,
  TipoDeArena,
} from './battle/types.js';
import { allCreatures, CATALOGO_DE_HABILIDADES, creature, hexSize, LIDERAZGO } from './data.js';
import { EQUIPO_BASE } from './hero/equipo.js';
import { cifrasDelIndividuo, EXPERIENCIA_INICIAL_DE_HEROE } from './hero/experiencia.js';
import { CIFRAS_DEL_HEROE_INICIAL, HERO_BODY, heroUnit, maxMana } from './hero/hero.js';
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
import { entero, lista, repetidoEn, texto } from './validar.js';

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
   * Nombres de `HABILIDADES_DE_LA_ARENA`: las de `data/habilidades.json` y las que
   * dan un poder (`data/poderes.json`). Solo las de poder actúan en la pelea
   * («Curar (X)», «Bendecir»: `unidadDeCombate` las pasa a `UnitInfo.poderes`);
   * las demás son **inertes**, se guardan y la ficha dice «sin efecto todavía».
   */
  readonly habilidades: readonly string[];
  /** Precio en oro. No pelea; el juego lo necesitará. */
  readonly cost: { readonly gold: number };
}

/**
 * Las habilidades que puede llevar una unidad de la arena: las del catálogo
 * (`data/habilidades.json`, sacado del cuaderno) y las que dan un poder
 * (`data/poderes.json`), sin repetir. «Bendecir» no está en el cuaderno: es de
 * los poderes, y por eso no se escribe en el catálogo generado.
 */
export const HABILIDADES_DE_LA_ARENA: readonly string[] = [
  ...CATALOGO_DE_HABILIDADES,
  ...HABILIDADES_CON_PODER.filter((h) => !CATALOGO_DE_HABILIDADES.includes(h)),
];

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
 * héroe y con qué arte se pinta, para pintarla sin otra petición. Una
 * declaración, que leen el servidor (`tools/arena/borrador.ts`) y la página.
 * Es un tipo de cable sin regla de juego: el motor no lo lee.
 */
export interface HojaDeArena {
  readonly id: string;
  readonly nombre: string;
  readonly faccion: FaccionDeArena;
  readonly perfil: PerfilDeArena;
  readonly heroe: boolean;
  /** Las casillas con las que sale la unidad la primera vez. */
  readonly casillas: number;
  /**
   * El juego de armas de su Y Bot (`espada-escudo`, `baston`…): con él se pinta
   * si no tiene sus ocho direcciones.
   */
  readonly juego: string;
  /**
   * Los ocho `dN/atlas.json` de su arte propio, en el orden de las direcciones,
   * o `null` si no los tiene todos. Los comprueba `comoDireccion8d` al
   * registrarla para pintarla.
   */
  readonly direcciones: readonly unknown[] | null;
  /**
   * Por qué no se puede montar, o `null` si se puede: una unidad con su arte
   * propio a medias (el taller la está generando, #140). Se lista con el motivo
   * y no se pinta: con el Y Bot sería otra figura sin decirlo.
   */
  readonly incompleta: string | null;
}

/**
 * Las direcciones de una figura: las ocho, o ninguna. Es
 * `NOMBRES_DE_DIRECCION.length` (`src/shared/arte.ts`), escrito aquí porque
 * `core` no importa de `shared`: si cambia allí, cambia aquí, y el test de la
 * arena que manda siete lo vigila.
 */
const DIRECCIONES_DE_FIGURA = 8;

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
      juego: texto(h.juego, 'el juego de armas', quien),
      direcciones: direccionesValidas(h.direcciones, quien),
      incompleta: incompletaValida(h.incompleta, h.direcciones, quien),
    };
  });
}

function incompletaValida(valor: unknown, direcciones: unknown, quien: string): string | null {
  if (valor === null) return null;
  const motivo = texto(valor, 'por qué está incompleta', quien);
  if (direcciones !== null)
    throw new Error(`${quien}: dice que está incompleta y trae sus direcciones`);
  return motivo;
}

function direccionesValidas(valor: unknown, quien: string): readonly unknown[] | null {
  if (valor === null) return null;
  if (!Array.isArray(valor) || valor.length !== DIRECCIONES_DE_FIGURA) {
    throw new Error(
      `${quien}: trae ${Array.isArray(valor) ? valor.length : 'algo que no es una lista de'} direcciones, y son ${DIRECCIONES_DE_FIGURA} o ninguna`,
    );
  }
  return valor;
}

/**
 * La unidad con la que sale una hoja que todavía no está en el borrador. Los no
 * muertos salen con `undead`: un esqueleto vivo, con moral, era raro (M7 de QA).
 * Las habilidades, las de sus poderes por defecto (`traen` de `data/poderes.json`:
 * el monje templario, Curar y Bendecir).
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
    habilidades: habilidadesQueTrae(hoja.id),
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
  const repetido = repetidoEn(lista);
  if (repetido !== undefined) throw new Error(`${quien}: ${campo} "${repetido}" está dos veces`);
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
  // Lo que no es un campo de la arena no se descarta callando: un `growth`
  // escrito a mano desaparecería en el siguiente «Guardar» (M14 de QA).
  const ajeno = Object.keys(u).find((k) => !CAMPOS_DE_UNIDAD.includes(k));
  if (ajeno !== undefined) {
    throw new Error(
      `la unidad "${id}": «${ajeno}» no es un campo de la arena; valen ${CAMPOS_DE_UNIDAD.join(', ')}`,
    );
  }
  const name = texto(u.name, 'el nombre', `la unidad "${id}"`);
  // Con el nombre ya leído, cada motivo dice el que ve la persona en la ficha
  // («la unidad «Monje»»), no el id de su hoja (QA, vuelta 2).
  const quien = `la unidad «${name}»`;
  const faction = deLaLista(u.faction, FACCIONES_DE_ARENA, 'la facción', quien);
  const level = entero(u.level, 'el nivel', quien, 1);
  const leadership = entero(u.leadership, 'el liderazgo', quien, 1);
  const attack = entero(u.attack, 'el ataque', quien, 0);
  const defense = entero(u.defense, 'la defensa', quien, 0);
  const damage = danioValido(u.damage, quien);
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
    deLaLista(h, HABILIDADES_DE_LA_ARENA, 'la habilidad', quien),
  );
  sinRepetir(traits, 'el rasgo', quien);
  sinRepetir(habilidades, 'la habilidad', quien);
  if (typeof u.cost !== 'object' || u.cost === null) {
    throw new Error(`${quien}: el coste tiene que ser { gold }`);
  }
  const gold = entero((u.cost as Record<string, unknown>).gold, 'el coste en oro', quien, 0);
  // 0 disparos es cuerpo a cuerpo, como el campo de la ficha («0 = cuerpo a
  // cuerpo»): se lee como sin munición, y lo negativo dice «0 o más» (M3 de QA).
  const shots =
    u.shots === undefined ? undefined : entero(u.shots, 'la munición', quien, 0) || undefined;
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
    damage,
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
  'BORRADOR de la arena (/arena/, pnpm arena): cifras de las unidades de las cinco facciones, INVENTADAS y provisionales, ajustadas a mano peleando. Lo escribe la página al pulsar «Guardar» y lo valida validarUnidadDeArena (src/core/arena.ts); una unidad que no valida se conserva tal cual. El juego NO lo lee. Los campos de cifras se llaman como en data/creatures.json, pero pasar una unidad al catálogo NO es copiarla; hay que añadir: (1) la faction del juego (hoy solo knight o necromancer; una facción nueva pide además su guarnición neutral en data/ciudades.json), (2) speed: el escalón de sus casillas (2 very_slow, 3 slow, 4 average, 5 fast, 6 very_fast, 7 ultra_fast), en lugar de casillas, (3) growth (crecimiento semanal de su morada), (4) upgradesTo si tiene mejora, (5) su fila en data/experiencia.json (una habilidad por nivel, del 2 al máximo: la lista habilidades de aquí es suelta y no dice a qué nivel va cada una), y quitar id de hoja, faction de la arena y habilidades. habilidades = nombres de data/habilidades.json, sin efecto todavía, salvo las que dan un poder de data/poderes.json (Curar (X), Bendecir), que en la arena se usan en la pelea; Bendecir no está en data/habilidades.json.';

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
  const { validas, invalidas } = revisarLista(listaDelBorrador(valor), validarUnidadDeArena, {
    campo: 'id',
    clave: (u) => u.id,
    quien: (id) => `la unidad "${id}"`,
  });
  return {
    validas,
    invalidas: invalidas.map(({ clave, motivo, crudo }) => ({ id: clave, motivo, crudo })),
  };
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
  return todasValidas(revisarBorradorDeArena(valor));
}

/** Un elemento de un borrador que no pasa su regla: su clave si la trae, por qué, y él tal cual. */
export interface ElementoSinValidar {
  readonly clave: string | null;
  readonly motivo: string;
  readonly crudo: unknown;
}

/**
 * Un borrador elemento a elemento: los que valen y los que no, cada uno con su
 * motivo, y el segundo con la misma clave cuenta como malo. `campo` es de
 * dónde se saca la clave de uno que no valida, para decir cuál es. Es la
 * regla de los dos borradores de la arena —unidades y murallas—: un elemento
 * editado a mano que no vale no tira los demás (H2 de QA).
 */
export function revisarLista<T>(
  crudas: readonly unknown[],
  validar: (crudo: unknown) => T,
  como: {
    readonly campo: string;
    readonly clave: (t: T) => string;
    readonly quien: (clave: string) => string;
  },
): { readonly validas: readonly T[]; readonly invalidas: readonly ElementoSinValidar[] } {
  const validas: T[] = [];
  const claves = new Set<string>();
  const invalidas: ElementoSinValidar[] = [];
  for (const crudo of crudas) {
    const suya =
      typeof crudo === 'object' && crudo !== null
        ? (crudo as Record<string, unknown>)[como.campo]
        : null;
    try {
      const t = validar(crudo);
      const clave = como.clave(t);
      if (claves.has(clave)) throw new Error(`${como.quien(clave)} está dos veces en el borrador`);
      claves.add(clave);
      validas.push(t);
    } catch (err) {
      invalidas.push({
        clave: typeof suya === 'string' ? suya : null,
        motivo: err instanceof Error ? err.message : String(err),
        crudo,
      });
    }
  }
  return { validas, invalidas };
}

/** Lo que vale de un borrador revisado, o excepción con el motivo del primero que no. */
export function todasValidas<T>(r: {
  readonly validas: readonly T[];
  readonly invalidas: readonly { readonly motivo: string }[];
}): readonly T[] {
  const mala = r.invalidas[0];
  if (mala !== undefined) throw new Error(mala.motivo);
  return r.validas;
}

// ---------------------------------------------------------------- la pelea

/**
 * Lo que el motor juega de una unidad de arena: sus cifras, sin economía, y los
 * poderes de sus habilidades (`poderDeHabilidad`); las demás habilidades no
 * pelean. Sin poderes no lleva el campo: así sus cifras son las de siempre.
 */
function unidadDeCombate(u: UnidadDeArena): UnitInfo {
  // Fuera lo que no pelea; el resto son ya los campos de `UnitInfo`.
  const {
    id: _id,
    faction: _f,
    level,
    leadership: _l,
    habilidades,
    cost: _c,
    casillas,
    ...cifras
  } = u;
  const poderes = habilidades.flatMap((h) => {
    const p = poderDeHabilidad(h);
    return p === null ? [] : [p];
  });
  // Sin facción del juego: las cinco no son `FactionId`, y así tampoco suman ni
  // restan a la moral por diversidad. Su moral es 0 y no la decide nadie.
  return {
    ...cifras,
    speed: escalonDeCasillas(casillas),
    faction: null,
    nivel: level,
    ...(poderes.length === 0 ? {} : { poderes }),
  };
}

/**
 * El daño `[mínimo, máximo]` comprobado: dos enteros de 1 o más, el mínimo sin
 * pasar del máximo. Lo comparten la hoja del borrador (`validarUnidadDeArena`) y
 * la prueba del catálogo (`cifrasDeCatalogoEnLaArena`).
 */
function danioValido(par: unknown, quien: string): [number, number] {
  if (!Array.isArray(par) || par.length !== 2) {
    throw new Error(`${quien}: el daño tiene que ser [mínimo, máximo]`);
  }
  const min = entero(par[0], 'el daño mínimo', quien, 1);
  const max = entero(par[1], 'el daño máximo', quien, 1);
  if (min > max) {
    throw new Error(`${quien}: el daño mínimo (${min}) no puede pasar del máximo (${max})`);
  }
  return [min, max];
}

// ------------------------------------------------------------- el catálogo

/**
 * Las criaturas del catálogo del juego que se pueden montar: todas, las de
 * caballeros y nigromantes y sus mejoras, en el orden del catálogo. Entran con
 * sus cifras y sus rasgos de verdad (decisión del usuario, 09-10-2026).
 */
export function criaturasDelCatalogo(): readonly { readonly id: string; readonly name: string }[] {
  return allCreatures().map((c) => ({ id: c.id, name: c.name }));
}

/**
 * Lo que se le puede cambiar a una criatura del catálogo en la arena: una
 * PRUEBA, que no se guarda en ningún sitio —ni en `data/creatures.json` ni en el
 * borrador—, y que se dice así en la ficha.
 */
export interface CambiosDeCatalogo {
  readonly attack?: number;
  readonly defense?: number;
  readonly damage?: readonly [number, number];
  readonly hp?: number;
  /** En casillas, como las hojas; el motor juega su escalón (`escalonDeCasillas`). */
  readonly casillas?: number;
  /** 0 = cuerpo a cuerpo. */
  readonly shots?: number;
  readonly traits?: readonly CreatureTrait[];
}

const CAMPOS_DE_CAMBIO: readonly string[] = [
  'attack',
  'defense',
  'damage',
  'hp',
  'casillas',
  'shots',
  'traits',
];

/**
 * De dónde sale una unidad del montaje: del borrador (las hojas de las cinco
 * facciones) o del catálogo del juego, sin tocar (`cambios: null`) o con una
 * prueba encima. `escalera` es si sale con escalera para la muralla: es del
 * montaje, no de la unidad (la misma hoja puede ir con ella o sin ella).
 */
export type FuenteDeArena = (
  | { readonly kind: 'borrador'; readonly unidad: UnidadDeArena }
  | { readonly kind: 'catalogo'; readonly id: string; readonly cambios: CambiosDeCatalogo | null }
) & { readonly escalera?: boolean };

/**
 * Las cifras con las que pelea una criatura del catálogo con sus cambios: las del
 * catálogo, con lo cambiado encima, comprobado. Conserva su `faction`, así que la
 * moral por mezcla de facciones cuenta como en el juego. Lanza con lo que no
 * cuadra, diciendo de quién; `creature(id)` no cambia.
 */
export function cifrasDeCatalogoEnLaArena(id: string, cambios: CambiosDeCatalogo): UnitInfo {
  const base = creature(id);
  const quien = `${base.name} (prueba del catálogo)`;
  const c = cambios as Record<string, unknown>;
  const ajeno = Object.keys(c).find((k) => !CAMPOS_DE_CAMBIO.includes(k));
  if (ajeno !== undefined) {
    throw new Error(
      `${quien}: «${ajeno}» no se cambia en la arena; valen ${CAMPOS_DE_CAMBIO.join(', ')}`,
    );
  }
  const attack =
    cambios.attack === undefined ? base.attack : entero(cambios.attack, 'el ataque', quien, 0);
  const defense =
    cambios.defense === undefined ? base.defense : entero(cambios.defense, 'la defensa', quien, 0);
  const damage = cambios.damage === undefined ? base.damage : danioValido(cambios.damage, quien);
  const hp = cambios.hp === undefined ? base.hp : entero(cambios.hp, 'la vida', quien, 1);
  const speed =
    cambios.casillas === undefined
      ? base.speed
      : escalonDeCasillas(casillasValidas(cambios.casillas, quien));
  const shots =
    cambios.shots === undefined ? base.shots : entero(cambios.shots, 'la munición', quien, 0);
  const traits =
    cambios.traits === undefined
      ? base.traits
      : cambios.traits.map((t) => deLaLista(t, CREATURE_TRAITS, 'el rasgo', quien));
  if (traits !== undefined) sinRepetir(traits, 'el rasgo', quien);
  const { shots: _s, traits: _t, ...resto } = base;
  return {
    ...resto,
    attack,
    defense,
    damage,
    hp,
    speed,
    ...(shots === undefined || shots === 0 ? {} : { shots }),
    ...(traits === undefined ? {} : { traits }),
  };
}

// ------------------------------------------------------------- el héroe

/**
 * El héroe de un bando de la arena: sus cuatro cifras, su libro y su figura.
 * Pisa el tablero como en el juego (`heroUnit`, nivel inicial y equipo base) y
 * lanza con su maná (10 × Conocimiento), sin huida posible.
 */
export interface HeroeDeArena {
  readonly nombre: string;
  /** El id de una hoja de héroe para su figura, o `null` para la genérica del juego. */
  readonly figura: string | null;
  readonly ataque: number;
  readonly defensa: number;
  readonly poder: number;
  readonly conocimiento: number;
  /** Los ids de `data/spells.json` de su libro, sin repetir. */
  readonly hechizos: readonly string[];
}

/** Lo más alto que admite una cifra del héroe: más arriba ninguna fórmula cambia ya. */
export const CIFRA_MAXIMA_DE_HEROE = 99;

/**
 * El héroe que se pone en un lado: las cifras del héroe inicial de la partida
 * (`CIFRAS_DEL_HEROE_INICIAL`), la figura genérica y todo el libro. Aquí y no en
 * la página para que un test monte la misma pelea que monta quien pulsa.
 */
export function heroePorDefecto(lado: Lado): HeroeDeArena {
  return {
    nombre: `Héroe ${LADOS[lado].adjetivo}`,
    figura: null,
    ataque: CIFRAS_DEL_HEROE_INICIAL.attack,
    defensa: CIFRAS_DEL_HEROE_INICIAL.defense,
    poder: CIFRAS_DEL_HEROE_INICIAL.spellPower,
    conocimiento: CIFRAS_DEL_HEROE_INICIAL.knowledge,
    hechizos: allSpells().map((x) => x.id),
  };
}

/** Comprueba un héroe de la arena y lanza diciendo qué no cuadra. */
export function validarHeroeDeArena(h: HeroeDeArena): HeroeDeArena {
  const quien = 'el héroe';
  const nombre = texto(h.nombre, 'el nombre', quien);
  if (h.figura !== null && !/^[a-z0-9-]+$/.test(h.figura)) {
    throw new Error(`${quien}: la figura «${h.figura}» no es el id de una hoja`);
  }
  const cifra = (v: number, campo: string, minimo: number): number => {
    const n = entero(v, campo, quien, minimo);
    if (n > CIFRA_MAXIMA_DE_HEROE) {
      throw new Error(`${quien}: ${campo} va hasta ${CIFRA_MAXIMA_DE_HEROE}, y es ${n}`);
    }
    return n;
  };
  const hechizos = lista(h.hechizos, 'los hechizos', quien).map((id) => {
    if (typeof id !== 'string') throw new Error(`${quien}: un hechizo no es un id`);
    return spell(id).id;
  });
  sinRepetir(hechizos, 'el hechizo', quien);
  return {
    nombre,
    figura: h.figura,
    ataque: cifra(h.ataque, 'el ataque', 0),
    defensa: cifra(h.defensa, 'la defensa', 0),
    poder: cifra(h.poder, 'el poder', 1),
    conocimiento: cifra(h.conocimiento, 'el conocimiento', 0),
    hechizos,
  };
}

/**
 * El héroe tal como entra en la batalla. **Uno nuevo en cada llamada**: el motor
 * gasta su maná y marca su hechizo de la ronda sobre este objeto, y una segunda
 * pelea con el mismo empezaría con el maná de la primera.
 */
export function heroeDeArena(datos: HeroeDeArena): HeroeDelBando {
  const h = validarHeroeDeArena(datos);
  return {
    cuerpo: heroUnit({
      name: h.nombre,
      attack: h.ataque,
      defense: h.defensa,
      experience: EXPERIENCIA_INICIAL_DE_HEROE,
      equipo: EQUIPO_BASE,
    }),
    mando: mandoDe(
      {
        name: h.nombre,
        attack: h.ataque,
        defense: h.defensa,
        spellPower: h.poder,
        knowledge: h.conocimiento,
        mana: maxMana({ knowledge: h.conocimiento }),
        spells: h.hechizos,
      },
      { blocked: 'en la arena no hay huida' },
    ),
    ...(h.figura === null ? {} : { figura: h.figura }),
  };
}

/**
 * Lo que la ficha del héroe enseña, ya con las reglas del motor: su cuerpo en el
 * tablero, el maná, cuántas rondas dura lo que lanza y lo que rinde cada hechizo
 * con su poder (`spellAmount`, `efectoDe`, las mismas que lanzan).
 */
export function fichaDeHeroeDeArena(
  datos: HeroeDeArena,
  reglas: ReglasDeBatalla,
): {
  readonly cuerpo: UnitInfo;
  readonly mana: number;
  /** Las rondas que dura lo que lanza (`duracionDeLoQueLanza`). */
  readonly duracion: number;
  readonly hechizos: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly coste: number;
    readonly rinde: number | null;
    readonly efecto: StackEffect | null;
  }[];
} {
  const { cuerpo, mando } = heroeDeArena(datos);
  return {
    cuerpo,
    mana: mando.mana,
    duracion: duracionDeLoQueLanza(mando),
    hechizos: mando.spells
      .map(spell)
      .sort(ordenDelLibro)
      .map((s) => ({
        id: s.id,
        nombre: s.name,
        coste: s.cost,
        rinde: s.kind === 'damage' || s.kind === 'heal' ? spellAmount(s, mando) : null,
        efecto: efectoDe(s, delHeroe(s, mando), reglas),
      })),
  };
}

// ------------------------------------------------------------- el montaje

/** Lo que lleva un lado del montaje: sus unidades y, si lo lleva, su héroe. */
export interface LadoDeArena {
  readonly unidades: readonly FuenteDeArena[];
  readonly heroe: HeroeDeArena | null;
}

/**
 * Los dos lados, las reglas de la pelea —las mismas para los dos (decisión del
 * usuario)— y la muralla del tablero, si la hay: es del tablero, y sus puertas
 * las abre y las cierra la derecha, que defiende (`battle/muralla.ts`).
 */
export interface MontajeDeArena {
  readonly izquierda: LadoDeArena;
  readonly derecha: LadoDeArena;
  readonly reglas: ReglasDeBatalla;
  readonly muralla?: MurallaDeBatalla;
}

/**
 * El stack de una unidad del montaje. `member` es su id de personaje, uno por
 * puesto: dos monjes en el mismo bando son dos individuos, y el motor rechaza un
 * personaje que aparece dos veces. Lo que entra por personaje se apunta en
 * `members`.
 */
function stackDeLaFuente(
  fuente: FuenteDeArena,
  member: string,
  members: Map<string, BattleMember>,
): Stack {
  const escalera = fuente.escalera === true;
  switch (fuente.kind) {
    case 'borrador': {
      // Las cifras llegan de la página ya validadas; se vuelven a mirar porque
      // la batalla es la última puerta y un objeto a mano (un test, el arnés)
      // no pasó por ninguna otra.
      const u = validarUnidadDeArena(fuente.unidad);
      members.set(member, {
        profile: { unit: unidadDeCombate(u), morale: 0, luck: 0 },
        hp: u.hp,
        escalera,
      });
      return { creature: u.id, member, count: 1 };
    }
    case 'catalogo': {
      // Sin tocar ni escalera, por la vía del juego: `resolveUnit` le pone las
      // cifras del catálogo y el origen `catalogo`, como a la tropa de una
      // partida. La escalera viaja con el personaje (`BattleMember.escalera`), así
      // que quien la lleva entra como uno, con las cifras del catálogo tal cual.
      if (fuente.cambios === null && !escalera) {
        return { creature: creature(fuente.id).id, count: 1 };
      }
      const unit = unidadDeLaFuente(fuente);
      members.set(member, { profile: { unit, morale: 0, luck: 0 }, hp: unit.hp, escalera });
      return { creature: fuente.id, member, count: 1 };
    }
  }
}

/** Las cifras con las que pelea una unidad del montaje, comprobadas. */
function unidadDeLaFuente(fuente: FuenteDeArena): UnitInfo {
  switch (fuente.kind) {
    case 'borrador':
      return unidadDeCombate(validarUnidadDeArena(fuente.unidad));
    case 'catalogo':
      return fuente.cambios === null
        ? creature(fuente.id)
        : cifrasDeCatalogoEnLaArena(fuente.id, fuente.cambios);
  }
}

function bandoDeArena(lado: LadoDeArena, nombre: string): BattleSide {
  const { unidades, heroe } = lado;
  if (unidades.length === 0 && heroe === null) {
    throw new Error(`el bando ${nombre} está vacío: pon al menos una unidad`);
  }
  // `createBattle` también lo comprueba, pero diciendo «el atacante»: en la arena
  // no hay atacante, hay izquierda y derecha. El héroe cuenta como uno más.
  const cuantos = unidades.length + (heroe === null ? 0 : 1);
  if (cuantos > LIDERAZGO.maxPorBando) {
    throw new Error(
      `el bando ${nombre} lleva ${cuantos} unidades${heroe === null ? '' : ', contando a su héroe,'} y caben ${LIDERAZGO.maxPorBando}: quita ${cuantos - LIDERAZGO.maxPorBando}`,
    );
  }
  const members = new Map<string, BattleMember>();
  const army: Stack[] = unidades.map((fuente, i) => stackDeLaFuente(fuente, `arena-${i}`, members));
  return {
    army,
    hero: heroe === null ? null : heroeDeArena(heroe),
    ...(members.size === 0 ? {} : { members }),
  };
}

/**
 * Una batalla de arena: la izquierda ataca y la derecha defiende, con las reglas
 * del montaje. Los stacks de la tropa salen en el orden de cada lista (`slot` =
 * su puesto) y el héroe, si lo hay, el último (`<bando>-heroe`): es lo que deja a
 * quien llama saber qué puesto del montaje es cada stack. La muralla, si la
 * hay, es del tablero (`battle/muralla.ts`).
 */
export function batallaDeArena(montaje: MontajeDeArena, rng: Rng): BattleState {
  const batalla = crearBatallaConReglas(
    bandoDeArena(montaje.izquierda, LADOS.izquierda.adjetivo),
    bandoDeArena(montaje.derecha, LADOS.derecha.adjetivo),
    rng,
    montaje.reglas,
    montaje.muralla ?? SIN_MURALLA,
  );
  // De qué tipo sale cada puesto, en el orden de su `slot` (`tipoDelStack`).
  const tipos = (l: LadoDeArena): readonly TipoDeArena[] => l.unidades.map(tipoDeLaFuente);
  // Y la ficha de cada tipo y de cada héroe, con la que el retoque compara.
  const fichas: Record<string, FichaEnPalabras> = {};
  for (const lado of ['izquierda', 'derecha'] as const) {
    for (const f of montaje[lado].unidades) {
      fichas[claveDeFicha(tipoDeLaFuente(f))] = fichaEnPalabras(f);
    }
    const heroe = montaje[lado].heroe;
    if (heroe !== null) fichas[claveDeFicha({ kind: 'heroe', lado })] = fichaDelHeroe(heroe);
  }
  return {
    ...batalla,
    tiposDeArena: {
      [LADOS.izquierda.bando]: tipos(montaje.izquierda),
      [LADOS.derecha.bando]: tipos(montaje.derecha),
    } as Record<Side, readonly TipoDeArena[]>,
    fichasDeArena: fichas,
  };
}

/** El id del tipo de una fuente: el de la hoja del borrador o el de la criatura. */
export function idDeLaFuente(f: FuenteDeArena): string {
  return f.kind === 'borrador' ? f.unidad.id : f.id;
}

/**
 * De qué sale un stack de una pelea de la arena: una hoja o una criatura del
 * catálogo (lo que anotó `batallaDeArena`), o el héroe de un lado. Es lo que se
 * edita al pulsar «Editar» en su fila, y lo que cambia `retocarEnBatalla`. Lanza
 * con un stack que no sale del montaje: no es una pelea de la arena.
 */
export function tipoDelStack(
  state: BattleState,
  s: BattleStack,
): TipoDeArena | { readonly kind: 'heroe'; readonly lado: Lado } {
  if (s.origen.kind === 'heroe') return { kind: 'heroe', lado: ladoDe(s.side) };
  const tipo = state.tiposDeArena?.[s.side][s.slot];
  if (tipo === undefined) {
    throw new Error(`${s.id} no sale de ningún puesto del montaje: no es una pelea de la arena`);
  }
  return tipo;
}

// ------------------------------------------------------------- la ficha en palabras

/** Qué hace cada rasgo del motor, dicho en corto: la casilla de la ficha y el parte. */
export const NOMBRE_DE_RASGO: Readonly<Record<CreatureTrait, string>> = {
  undead: 'no-muerto',
  flying: 'vuela',
  no_retaliation: 'sin contraataque',
  double_attack: 'ataque doble',
  double_shot: 'disparo doble',
  life_drain: 'drena vida',
  splash_shot: 'disparo con salpicadura',
  charge: 'carga',
  curse_on_hit: 'maldice al golpear',
  bane_undead: 'azote de no-muertos',
  fear: 'terror',
  escalar: 'escala murallas',
};

/**
 * Cómo se dice una habilidad: la que da un poder de cura, con lo que cura en vez
 * de la X del cuaderno («Curar (4 PV)»; M3 de QA: el chip decía «Curar (X)»); la
 * de otro poder, por su nombre; las demás, tal cual. El valor guardado sigue
 * siendo el nombre del cuaderno.
 */
export function nombreDeHabilidad(h: string): string {
  const id = poderDeHabilidad(h);
  if (id === null) return h;
  const p = poder(id);
  return esDeCura(p) ? `${p.nombre} (${p.lanzador.cantidad} PV)` : p.nombre;
}

/** La clave de una ficha en `BattleState.fichasDeArena`: un tipo del montaje o el héroe de un lado. */
function claveDeFicha(t: TipoDeArena | { readonly kind: 'heroe'; readonly lado: Lado }): string {
  return t.kind === 'heroe' ? `heroe:${t.lado}` : `${t.kind}:${t.id}`;
}

function tipoDeLaFuente(f: FuenteDeArena): TipoDeArena {
  return { kind: f.kind === 'borrador' ? 'hoja' : 'catalogo', id: idDeLaFuente(f) };
}

/**
 * La ficha de una fuente en palabras, campo a campo y en el orden de la ficha:
 * lo que escribe la persona. La de una hoja lleva también lo que no pelea
 * (liderazgo, coste, habilidades sin motor), porque también se edita a media
 * pelea y el parte tiene que decirlo (N1 de QA). La de una criatura del catálogo,
 * sus cifras con la prueba encima: lo que su ficha deja tocar. Lanza con lo que
 * no valida, como el montaje.
 */
function fichaEnPalabras(f: FuenteDeArena): FichaEnPalabras {
  const rasgos = (ts: readonly CreatureTrait[] | undefined) =>
    (ts ?? []).map((t) => NOMBRE_DE_RASGO[t]);
  if (f.kind === 'borrador') {
    const u = validarUnidadDeArena(f.unidad);
    return {
      nombre: u.name,
      facción: NOMBRE_DE_FACCION_DE_ARENA[u.faction],
      nivel: `${u.level}`,
      liderazgo: `${u.leadership}`,
      ataque: `${u.attack}`,
      defensa: `${u.defense}`,
      daño: u.damage.join('-'),
      vida: `${u.hp}`,
      casillas: `${u.casillas}`,
      disparos: `${u.shots ?? 0}`,
      rasgos: rasgos(u.traits),
      habilidades: u.habilidades.map(nombreDeHabilidad),
      'coste (oro)': `${u.cost.gold}`,
    };
  }
  const c = unidadDeLaFuente(f);
  return {
    ataque: `${c.attack}`,
    defensa: `${c.defense}`,
    daño: c.damage.join('-'),
    vida: `${c.hp}`,
    casillas: `${SPEED_TO_HEXES[c.speed]}`,
    disparos: `${c.shots ?? 0}`,
    rasgos: rasgos(c.traits),
  };
}

/**
 * La ficha de un héroe en palabras: las cifras que se escriben en ella, no las de
 * su cuerpo, que llevan el equipo base (N2 de QA: «ataque 2 → 9» salía «5 → 12»),
 * y el libro por los nombres que enseña la página («Prisa», no `haste`).
 */
function fichaDelHeroe(datos: HeroeDeArena): FichaEnPalabras {
  const h = validarHeroeDeArena(datos);
  return {
    nombre: h.nombre,
    ataque: `${h.ataque}`,
    defensa: `${h.defensa}`,
    poder: `${h.poder}`,
    conocimiento: `${h.conocimiento}`,
    hechizos: h.hechizos
      .map(spell)
      .sort(ordenDelLibro)
      .map((x) => x.name),
  };
}

/**
 * Qué cambia de una ficha a otra, una entrada por campo y en palabras: una cifra,
 * «ataque 3 → 10»; una lista, solo lo que entra y lo que sale, «hechizos: −
 * Prisa» (N2 de QA: salía la lista entera, dos veces y con los ids). Vacío si no
 * cambia nada: ese retoque no escribe nada (N1 de QA).
 */
export function cambiosDeLaFicha(antes: FichaEnPalabras, despues: FichaEnPalabras): string[] {
  const c: string[] = [];
  for (const campo of new Set([...Object.keys(antes), ...Object.keys(despues)])) {
    const a = antes[campo] ?? '';
    const b = despues[campo] ?? '';
    if (typeof a === 'string' && typeof b === 'string') {
      if (a !== b) c.push(`${campo} ${a} → ${b}`);
      continue;
    }
    const xs = typeof a === 'string' ? [] : a;
    const ys = typeof b === 'string' ? [] : b;
    const entra = ys.filter((y) => !xs.includes(y)).map((y) => `+ ${y}`);
    const sale = xs.filter((x) => !ys.includes(x)).map((x) => `− ${x}`);
    if (entra.length + sale.length > 0) c.push(`${campo}: ${[...entra, ...sale].join(', ')}`);
  }
  return c;
}

// ------------------------------------------------------------- retocar en la pelea

/**
 * Un cambio de cifras a media pelea (decisión del usuario, 11-10-2026: «que
 * pueda modificar los personajes durante el combate»): las de un TIPO —una hoja
 * del borrador o una criatura del catálogo con su prueba, como en la ficha del
 * montaje— o las del héroe de un lado.
 */
export type RetoqueDeArena =
  | { readonly kind: 'tipo'; readonly fuente: FuenteDeArena }
  | { readonly kind: 'heroe'; readonly lado: Lado; readonly datos: HeroeDeArena };

/**
 * Aplica el retoque a la batalla en curso y devuelve `null`, o devuelve por qué
 * no entra sin haber tocado nada. La ÚNICA redacción: la sesión de la arena la
 * enseña en el editor y, si no entra, no cambia el borrador.
 *
 * Un tipo cambia en TODOS sus stacks, vivos o muertos y de los dos bandos —es lo
 * que hace la ficha del montaje con la pelea siguiente—, y nunca el héroe aunque
 * su figura sea la misma hoja. Cada stack se sustituye entero en `state.stacks`
 * con las cifras nuevas, sin tocar nunca el objeto de `unit`, que puede ser el del
 * catálogo. **Lo gastado sigue gastado**: la herida, los disparos y el maná que
 * ya se fueron se restan de las cifras nuevas (`topHp = máx(1, PV nuevos −
 * herida)`): subir la vida no cura, y bajarla no mata. La moral no se recalcula y
 * la velocidad nueva cuenta en la cola desde la ronda siguiente, como la Prisa a
 * media ronda. Lo que no se cambia a media pelea son las casillas que ocupa y la
 * figura del héroe: eso, en el montaje. Lo que entra deja un `retoque` en el
 * registro.
 */
export function retocarEnBatalla(state: BattleState, r: RetoqueDeArena): string | null {
  if (state.finished !== null) {
    return 'la batalla ya ha terminado; el cambio vale para la pelea siguiente';
  }
  // Las cifras nuevas salen de la misma validación que el montaje: lo que no
  // valida es el motivo.
  switch (r.kind) {
    case 'tipo': {
      const nuevo = oElMotivo(() => ({
        unit: unidadDeLaFuente(r.fuente),
        ficha: fichaEnPalabras(r.fuente),
      }));
      return 'motivo' in nuevo
        ? nuevo.motivo
        : retocarElTipo(state, r.fuente, nuevo.valor.unit, nuevo.valor.ficha);
    }
    case 'heroe': {
      const nuevo = oElMotivo(() => ({
        heroe: heroeDeArena(r.datos),
        ficha: fichaDelHeroe(r.datos),
      }));
      return 'motivo' in nuevo
        ? nuevo.motivo
        : retocarElHeroe(state, r.lado, nuevo.valor.heroe, nuevo.valor.ficha);
    }
  }
}

/** Lo que da `f`, o el mensaje con el que lanza. */
function oElMotivo<T>(f: () => T): { readonly valor: T } | { readonly motivo: string } {
  try {
    return { valor: f() };
  } catch (err) {
    return { motivo: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * La ficha de antes de `clave`, que puso el montaje. Sin ella la batalla no la
 * montó `batallaDeArena`: el parte no sabría qué cambió, y se dice.
 */
function fichaDeAntes(state: BattleState, clave: string): FichaEnPalabras {
  const ficha = state.fichasDeArena?.[clave];
  if (ficha === undefined) {
    throw new Error(`la pelea no trae la ficha de ${clave}: no la montó la arena`);
  }
  return ficha;
}

function retocarElTipo(
  state: BattleState,
  fuente: FuenteDeArena,
  unit: UnitInfo,
  ficha: FichaEnPalabras,
): string | null {
  const tipo = tipoDeLaFuente(fuente);
  const suyos = state.stacks.filter((s) => {
    const t = tipoDelStack(state, s);
    return t.kind === tipo.kind && t.id === tipo.id;
  });
  if (suyos.length === 0) return `${unit.name} no está en esta pelea`;
  if (suyos.some((s) => hexSize(s.unit) !== hexSize(unit))) {
    return `las casillas que ocupa ${unit.name} no se cambian a media pelea: eso, en el montaje`;
  }
  const clave = claveDeFicha(tipo);
  const cambios = cambiosDeLaFicha(fichaDeAntes(state, clave), ficha);
  // La ficha manda: si no cambia, tampoco cambia ninguna cifra de la pelea, y
  // no se escribe nada (N1 de QA: «ataque 3 → 3» dejaba una línea y «Cambiado»).
  if (cambios.length === 0) return null;
  for (const s of suyos) {
    const veterania = s.origen.kind === 'heroe' ? null : s.origen.veterania;
    conCifrasNuevas(state, s, cifrasDelIndividuo(unit, veterania));
  }
  (state.fichasDeArena as Record<string, FichaEnPalabras>)[clave] = ficha;
  state.log.push({ kind: 'retoque', nombre: unit.name, stacks: suyos.map((s) => s.id), cambios });
  return null;
}

function retocarElHeroe(
  state: BattleState,
  lado: Lado,
  nuevo: HeroeDelBando,
  ficha: FichaEnPalabras,
): string | null {
  const bando = LADOS[lado].bando;
  const antes = state.heroes[bando];
  const cuerpo = state.stacks.find((s) => s.side === bando && s.origen.kind === 'heroe');
  if (antes === null || cuerpo === undefined) {
    return `el bando ${LADOS[lado].adjetivo} no lleva héroe en esta pelea`;
  }
  if ((nuevo.figura ?? HERO_BODY) !== cuerpo.body) {
    return 'la figura del héroe no se cambia a media pelea: eso, en el montaje';
  }
  const clave = claveDeFicha({ kind: 'heroe', lado });
  const cambios = cambiosDeLaFicha(fichaDeAntes(state, clave), ficha);
  if (cambios.length === 0) return null;
  conCifrasNuevas(state, cuerpo, nuevo.cuerpo);
  // El maná, como la herida: lo que el Conocimiento nuevo no deja restar se debe.
  const gastado = maxMana(antes) - antes.mana + (antes.manaGastadoDeMas ?? 0);
  const mana = Math.max(0, nuevo.mando.mana - gastado);
  const deMas = gastado - (nuevo.mando.mana - mana);
  state.heroes[bando] = {
    ...nuevo.mando,
    mana,
    castThisRound: antes.castThisRound,
    ...(deMas === 0 ? {} : { manaGastadoDeMas: deMas }),
  };
  (state.fichasDeArena as Record<string, FichaEnPalabras>)[clave] = ficha;
  state.log.push({ kind: 'retoque', nombre: nuevo.mando.name, stacks: [cuerpo.id], cambios });
  return null;
}

/**
 * Sustituye `s` en la batalla por el mismo stack con las cifras `unit`, con lo
 * gastado restado (`retocarEnBatalla`). Un stack nuevo, no el viejo retocado:
 * `unit` es de solo lectura, y nadie guarda un stack de una jugada a otra (se
 * buscan por id).
 *
 * Lo gastado es lo que se ve (`hp − topHp`, `shots − shotsLeft`) más lo que se
 * debía de un retoque anterior (`gastadoDeMas`); lo que las cifras nuevas no
 * dejan restar —la vida no baja de 1, la munición no baja de 0— se vuelve a
 * deber. Calculado solo desde las cifras de ese momento, un arquero a 9 de 12
 * puesto a 0 y vuelto a 12 volvía con 12 (N3 de QA). Curar mientras se debe cura
 * la herida de verdad: lo curado sube `topHp` y la deuda se queda.
 */
function conCifrasNuevas(state: BattleState, s: BattleStack, unit: UnitInfo): void {
  const i = state.stacks.indexOf(s);
  if (i < 0) throw new Error(`${s.id} no está en esta batalla`);
  const { gastadoDeMas: debe, ...resto } = s;
  if (s.count === 0) {
    state.stacks[i] = { ...s, unit };
    return;
  }
  const herida = s.unit.hp - s.topHp + (debe?.herida ?? 0);
  const disparados = (s.unit.shots ?? 0) - s.shotsLeft + (debe?.disparos ?? 0);
  const topHp = Math.max(1, unit.hp - herida);
  const shotsLeft = Math.max(0, (unit.shots ?? 0) - disparados);
  const deMas = {
    herida: herida - (unit.hp - topHp),
    disparos: disparados - ((unit.shots ?? 0) - shotsLeft),
  };
  state.stacks[i] = {
    ...resto,
    unit,
    topHp,
    shotsLeft,
    ...(deMas.herida === 0 && deMas.disparos === 0 ? {} : { gastadoDeMas: deMas }),
  };
}

/**
 * Por qué este montaje no cabe con su muralla en sus columnas de salida, o
 * `null` si cabe: la regla de `despliegue`, preguntada antes de pelear para que
 * el editor lo diga mientras se dibuja. El héroe ocupa un hueco más, detrás de
 * su tropa. No mira nada más que el sitio: un bando vacío o una unidad mala los
 * dice `batallaDeArena`.
 */
export function despliegueDeArenaBlocker(montaje: MontajeDeArena): string | null {
  const muralla = montaje.muralla ?? SIN_MURALLA;
  const unidades = (lado: LadoDeArena): UnitInfo[] => [
    ...lado.unidades.map(unidadDeLaFuente),
    ...(lado.heroe === null ? [] : [heroeDeArena(lado.heroe).cuerpo]),
  ];
  return (
    despliegueBlocker(unidades(montaje.izquierda), 'attacker', muralla) ??
    despliegueBlocker(unidades(montaje.derecha), 'defender', muralla)
  );
}

/**
 * Por qué esta unidad, en este lado, no usaría una escalera, o `null` si sí: la
 * regla de `quienNoEscala`, preguntada en el montaje. Sin ella la casilla «Lleva
 * escalera» se marcaba en un troll de dos casillas o en una voladora y
 * `createBattle` la tiraba sin decir nada (QA de la muralla alta, M1).
 */
export function escaleraDeArenaBlocker(fuente: FuenteDeArena, lado: Lado): string | null {
  return quienNoEscala(LADOS[lado].bando, unidadDeLaFuente(fuente));
}

/**
 * Cómo acabó una pelea, dicho por el lado del montaje, y por qué, con la regla
 * del motor que la cerró (`causaDelFinal`): la misma que la batalla del juego.
 * `empate` solo pesa en `agotada`: los dos lados siguen en pie, el motor la
 * cerró sin que nadie ganara (`finishByExhaustion`) y gana quien tiene más
 * unidades en pie y, a igualdad, quien defiende —la derecha—. Sin decirlo,
 * «gana el derecho» tras cien rondas en que nadie se hizo daño parecía que la
 * derecha era más fuerte (H4 de QA); y leyendo «quedan unidades en los dos
 * lados» como «por tiempo», la muerte de un héroe en la ronda 1 se contaba como
 * cien rondas sin vencedor (H1 de QA del banco).
 */
export function finalDeArena(battle: BattleState): {
  readonly ganador: Lado;
  readonly causa: CausaDelFinal;
  readonly empate: boolean;
} | null {
  const causa = causaDelFinal(battle);
  if (battle.finished === null || causa === null) return null;
  const enPie = (bando: Side): number =>
    battle.stacks.filter((s) => s.side === bando && s.count > 0).reduce((n, s) => n + s.count, 0);
  return {
    ganador: ladoDe(battle.finished.winner),
    causa,
    empate: enPie(LADOS.izquierda.bando) === enPie(LADOS.derecha.bando),
  };
}

// ------------------------------------------------------------- el enlace de la pelea

/**
 * Un puesto del montaje tal como va en el enlace: una hoja (sus cifras van en
 * `MontajeDelEnlace.unidades`) o una criatura del catálogo (su prueba, si la
 * tiene, en `pruebas`), y si lleva escalera.
 */
export type PuestoDelEnlace = (
  | { readonly kind: 'hoja'; readonly hoja: string }
  | { readonly kind: 'catalogo'; readonly id: string }
) & { readonly escalera: boolean };

/** Un lado del enlace: quién lo mueve, entero —la persona o la IA—, sus puestos y su héroe. */
export interface LadoDelEnlace {
  readonly ia: boolean;
  readonly puestos: readonly PuestoDelEnlace[];
  readonly heroe: HeroeDeArena | null;
}

/**
 * Quién mueve cada bando si nada lo dice: la izquierda, la persona; la derecha,
 * la IA. Lo leen la página al abrirse y un enlace de antes de la versión 3 con un
 * bando sin nadie.
 */
export const IA_POR_DEFECTO: Readonly<Record<Lado, boolean>> = { izquierda: false, derecha: true };

/**
 * El montaje entero que viaja en la URL de la arena (`?montaje=`), con la
 * semilla y las reglas en sus propios parámetros: abrir el enlace monta la misma
 * pelea (H6 de QA, decisión del usuario del 09-10-2026). Las cifras van por
 * TIPO, como las lleva la página: dos monjes son un monje en `unidades`.
 */
export interface MontajeDelEnlace {
  /** Las cifras de cada hoja montada, guardadas o no, en el orden en que salen. */
  readonly unidades: readonly UnidadDeArena[];
  /** La prueba de cada criatura del catálogo montada que la lleva. */
  readonly pruebas: Readonly<Record<string, CambiosDeCatalogo>>;
  readonly izquierda: LadoDelEnlace;
  readonly derecha: LadoDelEnlace;
  /** La muralla del tablero, o `null` sin ella. */
  readonly muralla: MurallaDeBatalla | null;
}

/**
 * El único valor de un parámetro de la URL (`URLSearchParams.getAll`), o `null`
 * si no está. Repetido se rechaza diciéndolo, como lo que no es una semilla o una
 * regla: quedarse con el primero en silencio repetía otra pelea que la que dice
 * la URL (`?reglas=tirador&reglas=bendicion` encendía solo el tirador, H4 de QA
 * del banco).
 */
export function unaVezEnLaURL(valores: readonly string[], nombre: string): string | null {
  if (valores.length > 1) {
    throw new Error(
      `«${nombre}» va ${valores.length} veces en la URL (${valores.map((v) => `«${v}»`).join(', ')}): pon uno solo${nombre === 'reglas' ? ', con las reglas separadas por comas (reglas=tirador,bendicion)' : ''}`,
    );
  }
  return valores[0] ?? null;
}

/**
 * La versión del formato: un enlace de otra versión se rechaza diciéndolo, no se
 * adivina. La 3 dice quién mueve cada bando, entero (`LadoDelEnlace.ia`). La 2
 * traía la muralla y la escalera de cada puesto, y quién movía cada puesto y el
 * héroe por separado; la 1, de antes de juntar la arena con la muralla, ni
 * muralla ni escaleras. Las dos se siguen leyendo: el bando va a la IA si iba
 * todo él, y si iba repartido se dice (`MontajeLeido.aviso`).
 */
export const VERSION_DEL_ENLACE = 3;

const CAMPOS_DEL_ENLACE = ['v', 'unidades', 'pruebas', 'izquierda', 'derecha', 'muralla'];
const CAMPOS_DEL_ENLACE_1 = ['v', 'unidades', 'pruebas', 'izquierda', 'derecha'];
const CAMPOS_DEL_LADO = ['ia', 'puestos', 'heroe'];
const CAMPOS_DEL_LADO_ANTIGUO = ['puestos', 'heroe'];
const CAMPOS_DEL_HEROE = [
  'nombre',
  'figura',
  'ataque',
  'defensa',
  'poder',
  'conocimiento',
  'hechizos',
];

/**
 * Un enlace leído: su montaje y, si es de antes de la versión 3 y repartía algún
 * bando entre la persona y la IA, el aviso de cómo se ha leído.
 */
export type MontajeLeido = MontajeDelEnlace & { readonly aviso?: string };

/** Un objeto con solo esos campos, o se lanza diciendo cuál sobra o falta. */
function objetoCon(
  valor: unknown,
  campos: readonly string[],
  quien: string,
): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new Error(`${quien} tiene que ser un objeto`);
  }
  const o = valor as Record<string, unknown>;
  const ajeno = Object.keys(o).find((k) => !campos.includes(k));
  if (ajeno !== undefined) throw new Error(`${quien}: «${ajeno}» no es un campo del enlace`);
  const falta = campos.find((k) => !(k in o));
  if (falta !== undefined) throw new Error(`${quien}: falta «${falta}»`);
  return o;
}

function siONo(valor: unknown, quien: string, campo = 'ia'): boolean {
  if (typeof valor !== 'boolean')
    throw new Error(`${quien}: «${campo}» tiene que ser true o false`);
  return valor;
}

/**
 * Lee el montaje de `?montaje=` y lo comprueba entero antes de devolver nada:
 * un enlace mal formado, de otra versión o con una unidad, una criatura o un
 * hechizo que no existen lanza diciendo qué, y la página no monta nada a medias.
 * Que las hojas tengan arte lo mira la página, que es quien las tiene.
 */
export function montajeDeLaURL(textoDelEnlace: string): MontajeLeido {
  let crudo: unknown;
  try {
    crudo = JSON.parse(textoDelEnlace);
  } catch (err) {
    throw new Error(
      `el montaje del enlace no se puede leer (${err instanceof Error ? err.message : String(err)}): puede que se cortara al copiarlo`,
    );
  }
  const version =
    typeof crudo === 'object' && crudo !== null && 'v' in crudo
      ? (crudo as { v: unknown }).v
      : null;
  if (version !== VERSION_DEL_ENLACE && version !== 1 && version !== 2) {
    throw new Error(
      `el montaje del enlace es de la versión ${JSON.stringify(version)} y esta arena lee de la 1 a la ${VERSION_DEL_ENLACE}`,
    );
  }
  const conMuralla = version !== 1;
  const o = objetoCon(
    crudo,
    conMuralla ? CAMPOS_DEL_ENLACE : CAMPOS_DEL_ENLACE_1,
    'el montaje del enlace',
  );
  const unidades = lista(o.unidades, 'las unidades', 'el montaje del enlace').map(
    validarUnidadDeArena,
  );
  sinRepetir(
    unidades.map((u) => u.id),
    'la unidad',
    'el montaje del enlace',
  );
  if (typeof o.pruebas !== 'object' || o.pruebas === null || Array.isArray(o.pruebas)) {
    throw new Error('las pruebas del enlace tienen que ser un objeto');
  }
  const pruebas: Record<string, CambiosDeCatalogo> = {};
  for (const [id, cambios] of Object.entries(o.pruebas)) {
    if (typeof cambios !== 'object' || cambios === null || Array.isArray(cambios)) {
      throw new Error(`la prueba de «${id}» del enlace tiene que ser un objeto`);
    }
    // `creature` lanza con un id que no es del catálogo, y la prueba se comprueba
    // con la misma regla que la ficha.
    cifrasDeCatalogoEnLaArena(creature(id).id, cambios as CambiosDeCatalogo);
    pruebas[id] = cambios as CambiosDeCatalogo;
  }
  const leidos = {
    izquierda: ladoDelEnlace(o.izquierda, 'izquierda', version),
    derecha: ladoDelEnlace(o.derecha, 'derecha', version),
  };
  const { lado: izquierda } = leidos.izquierda;
  const { lado: derecha } = leidos.derecha;
  let muralla: MurallaDeBatalla | null = null;
  if (conMuralla && o.muralla !== null) {
    try {
      muralla = validarMuralla(o.muralla);
    } catch (err) {
      throw new Error(
        `la muralla del enlace no vale: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  // Cada cifra del enlace es de un puesto montado, y cada hoja montada trae las
  // suyas: lo que sobra o falta no es un enlace que haya escrito la página.
  const puestos = [...izquierda.puestos, ...derecha.puestos];
  for (const p of puestos) {
    if (p.kind === 'hoja' && !unidades.some((u) => u.id === p.hoja)) {
      throw new Error(`el montaje del enlace pone «${p.hoja}» y no trae sus cifras`);
    }
  }
  for (const u of unidades) {
    if (!puestos.some((p) => p.kind === 'hoja' && p.hoja === u.id)) {
      throw new Error(`el montaje del enlace trae las cifras de «${u.id}» y no la monta`);
    }
  }
  for (const id of Object.keys(pruebas)) {
    if (!puestos.some((p) => p.kind === 'catalogo' && p.id === id)) {
      throw new Error(`el montaje del enlace trae una prueba de «${id}» y no la monta`);
    }
  }
  const montaje = { unidades, pruebas, izquierda, derecha, muralla };
  // Que quepa en sus columnas de salida y que nadie lleve una escalera que no
  // usaría, con las mismas preguntas que el montaje de la página: un enlace no
  // monta lo que la página no dejaría montar.
  const delEnlace = montajeDeArenaDelEnlace(montaje, REGLAS_DEL_JUEGO);
  const despliegue = despliegueDeArenaBlocker(delEnlace);
  if (despliegue !== null) throw new Error(`el montaje del enlace no cabe: ${despliegue}`);
  for (const lado of ['izquierda', 'derecha'] as const) {
    delEnlace[lado].unidades.forEach((fuente, i) => {
      if (fuente.escalera !== true) return;
      const motivo = escaleraDeArenaBlocker(fuente, lado);
      if (motivo !== null) {
        throw new Error(
          `el bando ${LADOS[lado].adjetivo} del enlace, puesto ${i + 1}, lleva escalera y ${motivo}`,
        );
      }
    });
  }
  const repartidos = LADOS_EN_ORDEN.filter((l) => leidos[l].repartido);
  if (repartidos.length === 0) return montaje;
  const aviso = repartidos
    .map(
      (l) =>
        `El enlace repartía el bando ${LADOS[l].adjetivo} entre tú y la IA: ahora lo mueves tú entero.`,
    )
    .join(' ');
  return { ...montaje, aviso };
}

const LADOS_EN_ORDEN = ['izquierda', 'derecha'] as const satisfies readonly Lado[];

/**
 * El montaje con el que pelea un enlace ya leído, con estas reglas: las fuentes
 * de cada puesto (la hoja con sus cifras o la criatura con su prueba) y la
 * muralla. Lo que mueve la IA no es del montaje: lo lee la página del enlace.
 */
export function montajeDeArenaDelEnlace(
  m: MontajeDelEnlace,
  reglas: ReglasDeBatalla,
): MontajeDeArena {
  const lado = (l: LadoDelEnlace): LadoDeArena => ({
    unidades: l.puestos.map((p): FuenteDeArena => {
      if (p.kind === 'hoja') {
        const unidad = m.unidades.find((u) => u.id === p.hoja);
        if (unidad === undefined) {
          throw new Error(`el montaje del enlace pone «${p.hoja}» y no trae sus cifras`);
        }
        return { kind: 'borrador', unidad, escalera: p.escalera };
      }
      return { kind: 'catalogo', id: p.id, cambios: m.pruebas[p.id] ?? null, escalera: p.escalera };
    }),
    heroe: l.heroe,
  });
  return {
    izquierda: lado(m.izquierda),
    derecha: lado(m.derecha),
    reglas,
    ...(m.muralla === null ? {} : { muralla: m.muralla }),
  };
}

/**
 * Un lado del enlace, comprobado. Hasta la versión 2 quién movía iba en cada
 * puesto y en el héroe: el lado va a la IA si iba todo él a la IA (sin nadie, el
 * de por defecto), y `repartido` dice si iba mezclado.
 */
function ladoDelEnlace(
  valor: unknown,
  lado: Lado,
  version: 1 | 2 | 3,
): { readonly lado: LadoDelEnlace; readonly repartido: boolean } {
  const quien = `el bando ${LADOS[lado].adjetivo} del enlace`;
  const delHeroe = `el héroe del bando ${LADOS[lado].adjetivo} del enlace`;
  const antiguo = version < 3;
  const o = objetoCon(valor, antiguo ? CAMPOS_DEL_LADO_ANTIGUO : CAMPOS_DEL_LADO, quien);
  const quienMueve: boolean[] = [];
  const puestos = lista(o.puestos, 'los puestos', quien).map((crudo, i): PuestoDelEnlace => {
    const q = `${quien}, puesto ${i + 1}`;
    const extra = [...(antiguo ? ['ia'] : []), ...(version === 1 ? [] : ['escalera'])];
    const leer = (p: Record<string, unknown>): { readonly escalera: boolean } => {
      if (antiguo) quienMueve.push(siONo(p.ia, q));
      return { escalera: version === 1 ? false : siONo(p.escalera, q, 'escalera') };
    };
    if (typeof crudo === 'object' && crudo !== null && 'hoja' in crudo) {
      const p = objetoCon(crudo, ['hoja', ...extra], q);
      return { kind: 'hoja', hoja: texto(p.hoja, 'la hoja', q), ...leer(p) };
    }
    const p = objetoCon(crudo, ['criatura', ...extra], q);
    return { kind: 'catalogo', id: creature(texto(p.criatura, 'la criatura', q)).id, ...leer(p) };
  });
  let heroe: HeroeDeArena | null = null;
  if (o.heroe !== null) {
    const h = objetoCon(o.heroe, [...CAMPOS_DEL_HEROE, ...(antiguo ? ['ia'] : [])], delHeroe);
    if (h.figura !== null && typeof h.figura !== 'string') {
      throw new Error(`${delHeroe}: la figura tiene que ser el id de una hoja o null`);
    }
    const { ia, ...datos } = h;
    if (antiguo) quienMueve.push(siONo(ia, delHeroe));
    heroe = validarHeroeDeArena(datos as unknown as HeroeDeArena);
  }
  const cuantos = puestos.length + (heroe === null ? 0 : 1);
  if (cuantos > LIDERAZGO.maxPorBando) {
    throw new Error(`${quien} lleva ${cuantos} y caben ${LIDERAZGO.maxPorBando}`);
  }
  if (!antiguo) return { lado: { ia: siONo(o.ia, quien), puestos, heroe }, repartido: false };
  const ia = quienMueve.length === 0 ? IA_POR_DEFECTO[lado] : quienMueve.every((x) => x);
  return { lado: { ia, puestos, heroe }, repartido: new Set(quienMueve).size > 1 };
}

/**
 * El texto de `?montaje=`, la inversa exacta de `montajeDeLaURL`. Se escribe lo
 * que se LEE de él: así un montaje que no se podría abrir no llega a un enlace, y
 * el texto sale con el orden de campos de los validadores, el mismo cada vez.
 */
export function montajeALaURL(m: MontajeDelEnlace): string {
  const { aviso: _dicho, ...leido } = montajeDeLaURL(textoDelMontaje(m));
  return textoDelMontaje(leido);
}

function textoDelMontaje(m: MontajeDelEnlace): string {
  const lado = (l: LadoDelEnlace) => ({
    ia: l.ia,
    puestos: l.puestos.map((p) =>
      p.kind === 'hoja'
        ? { hoja: p.hoja, escalera: p.escalera }
        : { criatura: p.id, escalera: p.escalera },
    ),
    heroe: l.heroe,
  });
  return JSON.stringify({
    v: VERSION_DEL_ENLACE,
    unidades: m.unidades,
    pruebas: m.pruebas,
    izquierda: lado(m.izquierda),
    derecha: lado(m.derecha),
    muralla: m.muralla,
  });
}
