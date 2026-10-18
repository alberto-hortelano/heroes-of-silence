/**
 * **La unidad de las cinco facciones**: su formato, su regla y su catálogo
 * (`data/unidades.json`), sin batalla. Una unidad es un cuerpo (`cuerpo: { hoja }`,
 * el arte con que se pinta, y las cifras que escribe) más su equipo, y pelea con
 * las dos cosas (`unidadDeCombate` → `conEquipo`).
 *
 * Aparte de `core/arena.ts` (simplify de F1, 18-10-2026): el catálogo del juego
 * (`core/catalogo.ts`) valida con esta regla al cargar, y si la importaba de la
 * arena arrastraba el montador de batallas, que el guardia de
 * `test/invariantes.test.ts` («solo la arena cambia las reglas de la batalla»)
 * tenía que dejar pasar por excepción. La arena importa de aquí.
 *
 * Los campos se llaman como en `data/creatures.json` —`attack`, `defense`,
 * `damage`…— y el tipo los toma de `Creature`, así que una cifra que cambie de
 * forma en el catálogo de criaturas deja de compilar aquí.
 */
import { HABILIDADES_CON_PODER, poderDeHabilidad } from './battle/poderes.js';
import { CATALOGO_DE_HABILIDADES, golpeaEnLaRueda, type Pieza } from './data.js';
import { type EquipoAtado, PIEZAS_DEL_CATALOGO } from './hero/equipo.js';
import { medidaBlocker } from './nivel.js';
import {
  CREATURE_TRAITS,
  type Creature,
  type CreatureTrait,
  type EquipoDeArena,
  HUECOS_DE_LA_ARENA,
  type NivelesDeLaRueda,
  NOMBRE_DE_HUECO,
  SPEED_TIERS,
  SPEED_TO_HEXES,
  type SpeedTier,
  type UnitInfo,
} from './types.js';
import {
  deLaLista,
  entero,
  esIdDeArena,
  lista,
  revisarLista,
  sinRepetir,
  texto,
} from './validar.js';

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
 * Los perfiles de arma de las hojas: los cinco de pose de `tools/art/poses.ts`,
 * el del jinete y el del jinete que además dispara (`montado-arco`, el jinete
 * élfico: lanza, espada y arco, 13-10-2026). Están aquí y no importados de allí
 * porque `poses.ts` toca el disco y `core` es puro. El de cada hoja lo da el
 * taller (`perfilDeArena`, `tools/taller/unidades.ts`).
 */
export const PERFILES_DE_ARENA = [
  'espada-escudo',
  'dos-manos',
  'baston',
  'arco',
  'ballesta',
  'montado-lanza',
  'montado-arco',
] as const;
export type PerfilDeArena = (typeof PERFILES_DE_ARENA)[number];

/**
 * Una unidad del borrador: lo que la arena pelea y lo que el archivo guarda.
 *
 * Las cifras se toman de `Creature` y no se redeclaran: si el catálogo cambia la
 * forma de una, la arena deja de compilar en vez de guardar otra cosa.
 */
export interface UnidadDeArena
  extends Pick<Creature, 'id' | 'name' | 'leadership' | 'attack' | 'defense' | 'damage' | 'hp'> {
  /**
   * Su id en el borrador, único. El de una hoja por defecto es el de la hoja; el
   * de una unidad nueva, `<cuerpo>-<n>` (`unidadNueva`). No dice con qué se
   * pinta: eso es `cuerpo`.
   */
  readonly id: string;
  /** Una de las cinco: no es la `faction` del juego, que solo sabe de dos. */
  readonly faction: FaccionDeArena;
  /** Con qué figura se pinta: una hoja de `assets/unidades/`. */
  readonly cuerpo: CuerpoDeArena;
  /**
   * Lo que lleva puesto (`data/equipo.json`), por hueco; vacío, `{}`. Las cifras
   * de arriba son las del CUERPO: con esto encima se pelea (`unidadDeCombate`),
   * y con esto encima se mide su nivel.
   */
  readonly equipo: EquipoDeArena;
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
 * El cuerpo de una unidad: la hoja con la que se pinta. Solo hojas: las criaturas
 * del catálogo del juego no entran en la arena (13-10-2026).
 */
export type CuerpoDeArena = { readonly hoja: string };

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
  'cuerpo',
  'leadership',
  'attack',
  'defense',
  'damage',
  'hp',
  'casillas',
  'traits',
  'habilidades',
  'equipo',
  'cost',
];

/**
 * Las cifras del cuerpo común, con las que nació cada unidad del catálogo (con el
 * equipo de su perfil encima, `KIT_DEL_PERFIL`) y nace la nueva (`unidadNueva`,
 * con la Espada). **Inventadas y provisionales**. El daño, 10-10: toda arma suma
 * un mínimo que no pasa de su máximo. Desnudos, los cuerpos de las hojas, de 2 a
 * 7 casillas, quedan en el nivel 1 (el jinete, que carga, hasta el 2:
 * `test/arena.test.ts`); lo que vale cada unidad vestida lo ancla
 * `TABLA_DEL_CATALOGO` en `test/nivel.test.ts`. Las alternativas probadas, en
 * `docs/historia.md`.
 */
export const CUERPO_COMUN = {
  leadership: 3,
  attack: 3,
  defense: 3,
  damage: [10, 10],
  hp: 80,
  cost: { gold: 150 },
} as const satisfies Pick<
  UnidadDeArena,
  'leadership' | 'attack' | 'defense' | 'damage' | 'hp' | 'cost'
>;

/** Lo que trae un perfil de arma sobre el cuerpo común (`KIT_DEL_PERFIL`). */
type KitDelPerfil = Pick<UnidadDeArena, 'equipo' | 'leadership' | 'cost'> & {
  readonly traits: readonly CreatureTrait[];
};

/**
 * Lo que trae cada perfil de arma sobre el cuerpo común: **su equipo** (piezas de
 * calidad `arena`, `data/equipo.json`), más lo que no pelea —liderazgo y coste— y
 * los rasgos. El cuerpo es el mismo para todos y lo distinto lo pone el equipo.
 * Con esto se escribió cada unidad del catálogo (18-10-2026), que desde entonces
 * es la única fuente de sus cifras: hoy lo lee solo `unidadNueva`, por los
 * rasgos del perfil, y los tests que miden un perfil. Cada pieza era la diferencia entre lo que pelea su perfil y el cuerpo común,
 * salvo la velocidad de los personajes de varias hojas
 * (`tools/arena/velocidades.ts`; lo comprueba `test/arena.test.ts`); desde el
 * 14-10-2026 (#262) la armadura no suma PV sino puntos de armadura (PV / 10), así
 * que los perfiles con armadura pelean con menos vida y restan esos puntos de
 * cada golpe. `charge` es del caballo, no de la lanza: por eso va en
 * los rasgos del perfil y no en la pieza. **Inventado.**
 *
 * **Cada arma para lo suyo** (13-10-2026): el tirador dispara con su arco o su
 * ballesta (hueco `distancia`) y pega con la daga; el jinete carga con la lanza
 * (hueco `carga`) y pega con la espada, y el jinete élfico (`montado-arco`)
 * dispara además con el arco. El disparo y la carga dan las cifras de antes;
 * **el golpe de cuerpo a cuerpo y el contraataque de tiradores y jinetes son
 * otros** (con la daga o la espada, no con el arco ni la lanza): es el cambio
 * que se pidió.
 */
export const KIT_DEL_PERFIL: Readonly<Record<PerfilDeArena, KitDelPerfil>> = {
  'espada-escudo': {
    equipo: { arma: 'espada', armadura: 'brigantina', escudo: 'escudo' },
    leadership: 3,
    cost: { gold: 150 },
    traits: [],
  },
  'dos-manos': {
    equipo: { arma: 'mandoble', armadura: 'arnes_de_placas' },
    leadership: 4,
    cost: { gold: 250 },
    traits: [],
  },
  baston: { equipo: { arma: 'baston' }, leadership: 3, cost: { gold: 150 }, traits: [] },
  arco: {
    equipo: { arma: 'daga', distancia: 'arco', armadura: 'jubon_de_arquero' },
    leadership: 3,
    cost: { gold: 150 },
    traits: [],
  },
  ballesta: {
    equipo: { arma: 'daga', distancia: 'ballesta', armadura: 'gambeson' },
    leadership: 4,
    cost: { gold: 200 },
    traits: [],
  },
  'montado-lanza': {
    equipo: { arma: 'espada', carga: 'lanza_de_jinete', armadura: 'barda' },
    leadership: 8,
    cost: { gold: 300 },
    traits: ['charge'],
  },
  'montado-arco': {
    equipo: { arma: 'espada', distancia: 'arco', carga: 'lanza_de_jinete', armadura: 'barda' },
    leadership: 8,
    cost: { gold: 300 },
    traits: ['charge'],
  },
};

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
export function casillasValidas(valor: unknown, quien: string): number {
  const n = entero(valor, 'la velocidad', quien, CASILLAS_MIN);
  if (n > CASILLAS_MAX) {
    throw new Error(
      `${quien}: la velocidad es de ${CASILLAS_MIN} a ${CASILLAS_MAX} casillas, y es ${n}`,
    );
  }
  return n;
}

// ------------------------------------------------------------- validación

/**
 * Una unidad del catálogo, comprobada; lanza diciendo qué no cuadra y de quién.
 *
 * Es la única regla: la usan el servidor de desarrollo antes de escribir, la
 * página al cargar lo guardado y la sesión antes de pelear. Lo desconocido no
 * se cuela en silencio —una velocidad inventada caería a `undefined` en
 * `SPEED_TO_HEXES` y la unidad no se movería sin que nadie supiera por qué—.
 * **Solo lee el formato de hoy**, con `cuerpo` y `equipo`: lo de antes (sin
 * cuerpo, con `level`, `speed`, `shots` o `hexes`) no vale, y se dice por qué
 * (14-10-2026, el usuario: «no queremos mantener compatibilidad hacia atrás»).
 */
export function validarUnidadDeArena(valor: unknown, eq: EquipoAtado): UnidadDeArena {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new Error('una unidad de la arena tiene que ser un objeto');
  }
  const u = valor as Record<string, unknown>;
  const id = idValido(u.id);
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
  const cuerpo = cuerpoValido(u.cuerpo, quien);
  const leadership = entero(u.leadership, 'el liderazgo', quien, 1);
  const attack = entero(u.attack, 'el ataque', quien, 0);
  const defense = entero(u.defense, 'la defensa', quien, 0);
  const damage = danioValido(u.damage, quien);
  const hp = entero(u.hp, 'la vida', quien, 1);
  const casillas = casillasValidas(u.casillas, quien);
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
  const equipo = equipoValido(u.equipo, quien, eq);
  const unidad: UnidadDeArena = {
    id,
    name,
    faction,
    cuerpo,
    leadership,
    attack,
    defense,
    damage,
    hp,
    casillas,
    traits,
    habilidades,
    equipo,
    cost: { gold },
  };
  // Lo que el índice no sabe medir no entra: si no, la ficha no se repinta y
  // la pelea se cuelga en el primer golpe que recibe (QA, 12-10-2026).
  const motivo = medidaBlocker(unidadDeCombate(unidad, eq));
  if (motivo !== null) throw new Error(`${quien}: ${motivo}`);
  return unidad;
}

/** El id de una unidad: minúsculas, cifras y guiones, como el de una hoja. */
function idValido(valor: unknown): string {
  const id = texto(valor, 'el id', 'una unidad de la arena');
  if (!esIdDeArena(id)) {
    throw new Error(`la unidad "${id}": el id va en minúsculas, con cifras y guiones`);
  }
  return id;
}

/**
 * El cuerpo, comprobado: `{ hoja }` con el id de una hoja (que tenga arte lo
 * mira la página, que es quien tiene las hojas). Una criatura del catálogo del
 * juego no es un cuerpo de la arena (13-10-2026, el usuario: «solo cuentan los
 * 5 que hay en la arena»).
 */
function cuerpoValido(valor: unknown, quien: string): CuerpoDeArena {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new Error(`${quien}: el cuerpo tiene que ser { hoja }`);
  }
  const c = valor as Record<string, unknown>;
  const claves = Object.keys(c);
  if (claves.length === 1 && claves[0] === 'hoja') {
    const hoja = texto(c.hoja, 'la hoja del cuerpo', quien);
    if (!esIdDeArena(hoja)) {
      throw new Error(`${quien}: «${hoja}» no es el id de una hoja`);
    }
    return { hoja };
  }
  throw new Error(
    `${quien}: el cuerpo tiene que ser { hoja }, y trae ${claves.join(', ') || 'nada'}`,
  );
}

/**
 * La Espada de la arena: la versátil, con todo a 3 (`data/equipo.json`). Con ella
 * nace una unidad nueva (`unidadNueva`) y pelea el héroe de la arena
 * (`EQUIPO_DEL_HEROE_EN_LA_ARENA`).
 */
export const ESPADA_DE_LA_ARENA = 'espada';

/**
 * Los niveles de la rueda de la Espada de la arena, leídos de `data/equipo.json`:
 * los de un arma nueva (decisión del usuario, 18-10-2026: «todo a 3, como la
 * Espada»; `enElHueco`). Sin copia aparte: si se retoca la Espada, lo que nace la
 * sigue, y los tests «con la Espada» leen la de verdad.
 */
export function nivelesDeLaEspada(): NivelesDeLaRueda {
  const rueda = PIEZAS_DEL_CATALOGO.get(ESPADA_DE_LA_ARENA)?.rueda;
  if (rueda === undefined) {
    throw new Error(
      `data/equipo.json no trae la Espada de la arena («${ESPADA_DE_LA_ARENA}») con su rueda: con ella nacen la unidad y el arma nuevas`,
    );
  }
  return rueda;
}

/**
 * Por qué una unidad de la arena con `equipo` no se monta por su arma, o `null`:
 * **sin arma de cuerpo a cuerpo no se combate** (decisión del usuario, 18-10-2026:
 * «si hubiese un lobo, los colmillos serían su arma»), y tiene que ser una que
 * golpee en la rueda (`golpeaEnLaRueda`: de la arena, la que dice su rueda). La leen
 * `equipoDeArenaBlocker` (la unidad) y `equipoQueNoVale` (un cambio de pieza,
 * también a media pelea, que mira también al héroe).
 */
export function armaDeCuerpoBlocker(equipo: EquipoDeArena, eq: EquipoAtado): string | null {
  if (equipo.arma === undefined) {
    return `no lleva arma de cuerpo a cuerpo: en la arena nadie pelea sin ella; ponle una en ${NOMBRE_DE_HUECO.arma}`;
  }
  // Si no existe, lo dice `equipoBlocker`, que va antes; un arma de otro hueco,
  // también: lo que queda es una pieza del juego.
  const arma = eq.piezaSiExiste(equipo.arma);
  if (arma !== null && !golpeaEnLaRueda(arma)) {
    return `lleva «${arma.nombre}», que es del juego: el arma de cuerpo a cuerpo de la arena es una de la arena`;
  }
  return null;
}

/**
 * Por qué una unidad de la arena no puede llevar `equipo` con las piezas de `eq`,
 * o `null`: que existan, sus huecos y las manos (`equipoBlocker`), que lleve un
 * arma de cuerpo a cuerpo de la arena (`armaDeCuerpoBlocker`) y que no lleve nada
 * del juego (`piezaDelJuegoBlocker`). **La regla del equipo de la arena, en un
 * sitio**: la leen `equipoValido` (el borrador, el enlace, cada cambio de la
 * unidad) y `unidadQueNoLleva` (lo que ofrece la ficha). El héroe no pasa por
 * ella: lleva el equipo base del juego (`EQUIPO_DEL_HEROE_EN_LA_ARENA`).
 */
export function equipoDeArenaBlocker(equipo: EquipoDeArena, eq: EquipoAtado): string | null {
  return (
    eq.equipoBlocker(equipo) ?? armaDeCuerpoBlocker(equipo, eq) ?? piezaDelJuegoBlocker(equipo, eq)
  );
}

/**
 * Si `p` cuenta en la arena: **solo las piezas de calidad `arena`** (decisión del
 * usuario, 18-10-2026). La leen `piezaDelJuegoBlocker` y lo que ofrece la ficha
 * (`opcionesDelHueco`).
 */
export function esDeLaArena(p: Pieza): boolean {
  return p.calidad === 'arena';
}

/**
 * Por qué una unidad de la arena no puede llevar `equipo` por una pieza del juego,
 * o `null`: en la arena solo cuentan las de la arena (`esDeLaArena`). El arma de
 * cuerpo a cuerpo lo dice antes `armaDeCuerpoBlocker`, con su frase.
 */
export function piezaDelJuegoBlocker(equipo: EquipoDeArena, eq: EquipoAtado): string | null {
  for (const hueco of HUECOS_DE_LA_ARENA) {
    const id = equipo[hueco];
    const p = id === undefined ? null : eq.piezaSiExiste(id);
    if (p !== null && !esDeLaArena(p)) {
      return `lleva «${p.nombre}» en ${NOMBRE_DE_HUECO[hueco]}, que es del juego: en la arena solo cuentan las piezas de la arena`;
    }
  }
  return null;
}

/** El equipo, comprobado con la regla del equipo de la arena (`equipoDeArenaBlocker`). */
function equipoValido(valor: unknown, quien: string, eq: EquipoAtado): EquipoDeArena {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new Error(`${quien}: el equipo tiene que ser un objeto por hueco ({} sin nada)`);
  }
  const e = valor as Record<string, unknown>;
  for (const [hueco, id] of Object.entries(e)) {
    if (typeof id !== 'string')
      throw new Error(`${quien}: el hueco ${hueco} no trae el id de una pieza`);
  }
  const motivo = equipoDeArenaBlocker(e as EquipoDeArena, eq);
  if (motivo !== null) throw new Error(`${quien}: ${motivo}`);
  // En el orden de los huecos, el mismo cada vez: el texto del enlace no cambia.
  return Object.fromEntries(
    HUECOS_DE_LA_ARENA.filter((h) => e[h] !== undefined).map((h) => [h, e[h] as string]),
  ) as EquipoDeArena;
}

/**
 * Dónde vive el catálogo de unidades, relativo a la raíz del repo: lo leen
 * `core/catalogo.ts` y la arena (`tools/arena/borrador.ts`). Aquí y no en
 * `catalogo.ts` porque aquel lo valida al cargarse, y la arena tiene que poder
 * abrirlo roto para arreglarlo.
 */
export const RUTA_DEL_CATALOGO_DE_UNIDADES = 'data/unidades.json';

/**
 * Lo que dice el `_comment` del catálogo (`data/unidades.json`): qué es, quién lo
 * lee y quién lo escribe, y la forma de una unidad. Quien lea el archivo —una
 * persona o un agente— se lo cree: cuando era el borrador decía «copiándola» para
 * pasar una unidad al juego, y QA lo probó en una copia del repo y el juego no
 * arrancaba.
 */
export const COMENTARIO_DEL_CATALOGO_DE_UNIDADES =
  'CATÁLOGO de unidades de las cinco facciones: una por hoja de tropa del taller, más las que se creen en la arena. Lo lee src/core/catalogo.ts, que lo valida entero al cargar (una unidad que no vale tumba la carga diciendo cuál y por qué); lo escribe la arena (/arena/, pnpm arena) al pulsar «Guardar», con validarCatalogo (src/core/unidad.ts), la misma regla con que lo carga el juego, y una que no valida se conserva tal cual para arreglarla a mano. Cifras INVENTADAS y provisionales, ajustadas a mano peleando. La partida todavía recluta de data/creatures.json (caballeros y nigromantes): este catálogo pasa a ser el suyo cuando las cinco facciones sustituyan a esas dos (docs/agents/2026-10-18-combate-y-ejercitos-en-el-juego/). Cada unidad es un CUERPO (cuerpo: { hoja }, el arte con que se pinta: solo las hojas de las cinco facciones; las cifras de arriba son las suyas) más su EQUIPO (equipo: una pieza de data/equipo.json por hueco, arma (la de cuerpo a cuerpo), distancia (la de disparar), carga (la lanza), armadura, accesorio y escudo; un arma a dos manos no admite escudo; solo piezas de data/equipo.json: una que solo esté en el borrador de equipo de la arena no se guarda aquí), y pelea con las dos cosas sumadas: cada golpe con las cifras de su arma (el disparo, las de distancia; la carga, las de carga, o si no las de arma; lo demás, las de arma). El nivel NO se escribe: sale de las cifras con el equipo puesto (src/core/nivel.ts). Sin arma no se combate: toda unidad lleva un arma de cuerpo a cuerpo de la arena en arma (la que dice sus niveles de la rueda del golpe); una sin ella no valida. Dispara quien lleva algo en distancia, sin munición (dos tiros por disparo con el rasgo double_shot), y toda unidad ocupa una casilla: no hay shots ni hexes. Solo se lee el formato de hoy: una unidad de antes (sin cuerpo, con level, speed, shots o hexes) no valida. casillas = las que anda por turno (2 a 7). PV y daño van en la escala del juego (×10 la de fheroes2). habilidades = nombres de data/habilidades.json, sin efecto todavía, salvo las que dan un poder de data/poderes.json (Curar (X), Bendecir), que se usan en la pelea; Bendecir no está en data/habilidades.json.';

/** Una unidad del archivo que no pasa la regla: se cuenta por qué y se guarda tal cual. */
export interface UnidadSinValidar {
  readonly id: string | null;
  readonly motivo: string;
  readonly crudo: unknown;
}

/**
 * El catálogo leído unidad a unidad: las que valen y las que no, cada una con su
 * motivo. Solo el formato de hoy (`validarUnidadDeArena`): una unidad de antes no
 * vale y se conserva tal cual, como cualquier otra que no vale. Una unidad
 * mala no tira las buenas (H2 de QA: con una sola editada a
 * mano, la página arrancaba vacía y «Guardar» pisaba el resto). Es la lectura
 * blanda de la arena, que conserva lo que no vale para que se arregle a mano;
 * el juego lee con la dura (`validarCatalogo`). Lanza solo si el archivo entero
 * no tiene la forma `{ unidades: [...] }`: ahí no hay nada que salvar unidad a
 * unidad.
 */
export function revisarCatalogo(
  valor: unknown,
  eq: EquipoAtado,
): {
  readonly validas: readonly UnidadDeArena[];
  readonly invalidas: readonly UnidadSinValidar[];
} {
  const { validas, invalidas } = revisarLista(
    listaDelCatalogo(valor),
    (crudo) => validarUnidadDeArena(crudo, eq),
    CLAVE_DE_UNIDAD,
  );
  return {
    validas,
    invalidas: invalidas.map(({ clave, motivo, crudo }) => ({ id: clave, motivo, crudo })),
  };
}

/**
 * La clave del catálogo de unidades: su `id`, que no se repite. La comparten la
 * lectura (`revisarCatalogo`) y la validación entera (`validarCatalogo`).
 */
const CLAVE_DE_UNIDAD = {
  campo: 'id',
  clave: (u: UnidadDeArena) => u.id,
  quien: (id: string) => `la unidad "${id}"`,
  donde: 'el catálogo',
} as const;

function listaDelCatalogo(valor: unknown): readonly unknown[] {
  if (typeof valor !== 'object' || valor === null || !('unidades' in valor)) {
    throw new Error(`${RUTA_DEL_CATALOGO_DE_UNIDADES} tiene que ser { unidades: [...] }`);
  }
  return lista(
    (valor as { unidades: unknown }).unidades,
    'unidades',
    RUTA_DEL_CATALOGO_DE_UNIDADES,
  );
}

/**
 * **El catálogo entero, con la regla del juego**: `{ unidades: [...] }` con cada
 * unidad en el formato de hoy (`validarUnidadDeArena`), con las piezas `eq`, y sin
 * dos veces el mismo id —el catálogo es por tipo, y dos fichas del mismo id
 * querrían decir dos cifras para una unidad—. Lanza con el motivo de la primera
 * que no vale **nombrando el fichero**. Una sola función: la usan la carga del
 * juego (`core/catalogo.ts`) y «Guardar» de la arena (`tools/arena/borrador.ts`),
 * las dos con las piezas de `data/equipo.json`; exportada con el JSON de argumento
 * para que un test la vea morder.
 */
export function validarCatalogo(valor: unknown, eq: EquipoAtado): readonly UnidadDeArena[] {
  const r = revisarLista(
    listaDelCatalogo(valor),
    (crudo) => validarUnidadDeArena(crudo, eq),
    CLAVE_DE_UNIDAD,
  );
  const mala = r.invalidas[0];
  if (mala !== undefined) throw new Error(`${RUTA_DEL_CATALOGO_DE_UNIDADES}: ${mala.motivo}`);
  return r.validas;
}

/**
 * El daño `[mínimo, máximo]` comprobado: dos enteros de 1 o más, el mínimo sin
 * pasar del máximo (`validarUnidadDeArena`).
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

// ---------------------------------------------------------------- la pelea

/**
 * Lo que el motor juega de una unidad de arena: las cifras de su cuerpo, sin
 * economía, con su equipo sumado (`conEquipo`, la única suma de las piezas, que
 * deja el cuerpo en `sinEquipo` para la ficha y el retoque) y los poderes de sus habilidades
 * (`poderDeHabilidad`); las demás habilidades no pelean. Sin poderes no lleva el
 * campo: así sus cifras son las de siempre. Las piezas, de `eq`: las de la
 * arena (`catalogoDeLaArena`), que son las del juego con el borrador encima.
 */
export function unidadDeCombate(u: UnidadDeArena, eq: EquipoAtado): UnitInfo {
  return eq.conEquipo(cuerpoDeCombate(u), u.equipo);
}

/** Lo que el motor juega de una unidad de arena ANTES de su equipo (`unidadDeCombate`). */
export function cuerpoDeCombate(u: UnidadDeArena): UnitInfo {
  // Fuera lo que no pelea; el resto son ya los campos de `UnitInfo`.
  const {
    id: _id,
    faction: _f,
    cuerpo: _cu,
    leadership: _l,
    habilidades,
    cost: _c,
    casillas,
    equipo: _e,
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
    ...(poderes.length === 0 ? {} : { poderes }),
  };
}
