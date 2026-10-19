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
 * Los campos de las cifras se llaman como en `UnitInfo` —`attack`, `defense`,
 * `damage`…— y el tipo los toma de allí, así que una cifra que cambie de forma en
 * el motor deja de compilar aquí.
 */
import { HABILIDADES_CON_PODER, poderDeHabilidad } from './battle/poderes.js';
import { CATALOGO_DE_HABILIDADES } from './data.js';
import { type EquipoAtado, equipoBaseBlocker, PIEZAS_DEL_CATALOGO } from './hero/equipo.js';
import { medidaBlocker } from './nivel.js';
import {
  CREATURE_TRAITS,
  type CreatureTrait,
  type Equipo,
  esHueco,
  FACTION_IDS,
  type FactionId,
  HUECOS,
  huecoDesconocido,
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
 * Una unidad del catálogo: lo que la partida recluta, la arena pelea y el archivo
 * guarda.
 *
 * Las cifras se toman de `UnitInfo` y no se redeclaran: si el motor cambia la
 * forma de una, el catálogo deja de compilar en vez de guardar otra cosa.
 */
export interface UnidadDeArena
  extends Pick<UnitInfo, 'name' | 'attack' | 'defense' | 'damage' | 'hp'> {
  /**
   * Su id en el borrador, único. El de una hoja por defecto es el de la hoja; el
   * de una unidad nueva, `<cuerpo>-<n>` (`unidadNueva`). No dice con qué se
   * pinta: eso es `cuerpo`.
   */
  readonly id: string;
  /** Una de las cinco facciones del juego. */
  readonly faction: FactionId;
  /**
   * Lo que ocupa UN individuo en el liderazgo de quien lo lleva
   * (`hero/troop.ts`). Provisional: lo define el usuario.
   */
  readonly leadership: number;
  /**
   * El edificio de su facción que la produce (`data/buildings.json`, una morada),
   * o nada si no la produce ninguno (una unidad recién creada en la arena, que la
   * partida no recluta hasta que se le escriba). **El edificio no implica nivel**
   * (decisión del usuario, 19-10-2026): una morada produce varias unidades, y su
   * coste sale de lo mejor que produce (`town/buildings.ts`). Que exista y sea
   * una morada de su facción lo comprueba la carga del juego (`moradasBlocker`),
   * no esta regla: el catálogo de edificios no se puede leer desde aquí sin un
   * ciclo de importación.
   */
  readonly edificio?: string;
  /** Con qué figura se pinta: una hoja de `assets/unidades/`. */
  readonly cuerpo: CuerpoDeArena;
  /**
   * Lo que lleva puesto (`data/equipo.json`), por hueco; vacío, `{}`. Las cifras
   * de arriba son las del CUERPO: con esto encima se pelea (`unidadDeCombate`),
   * y con esto encima se mide su nivel.
   */
  readonly equipo: Equipo;
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
  'edificio',
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
} as const satisfies Pick<UnidadDeArena, 'leadership' | 'attack' | 'defense' | 'damage' | 'hp'>;

/** Lo que trae un perfil de arma sobre el cuerpo común (`KIT_DEL_PERFIL`). */
type KitDelPerfil = Pick<UnidadDeArena, 'equipo' | 'leadership'> & {
  readonly traits: readonly CreatureTrait[];
};

/**
 * Lo que trae cada perfil de arma sobre el cuerpo común: **su equipo** (piezas de
 * `data/equipo.json`), más lo que no pelea —el liderazgo— y
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
 * (hueco `lanza`) y pega con la espada, y el jinete élfico (`montado-arco`)
 * dispara además con el arco. El disparo y la carga dan las cifras de antes;
 * **el golpe de cuerpo a cuerpo y el contraataque de tiradores y jinetes son
 * otros** (con la daga o la espada, no con el arco ni la lanza): es el cambio
 * que se pidió.
 */
export const KIT_DEL_PERFIL: Readonly<Record<PerfilDeArena, KitDelPerfil>> = {
  'espada-escudo': {
    equipo: { arma: 'espada', armadura: 'brigantina', escudo: 'escudo' },
    leadership: 3,
    traits: [],
  },
  'dos-manos': {
    equipo: { arma: 'mandoble', armadura: 'arnes_de_placas' },
    leadership: 4,
    traits: [],
  },
  baston: { equipo: { arma: 'baston' }, leadership: 3, traits: [] },
  arco: {
    equipo: { arma: 'daga', distancia: 'arco', armadura: 'jubon_de_arquero' },
    leadership: 3,
    traits: [],
  },
  ballesta: {
    equipo: { arma: 'daga', distancia: 'ballesta', armadura: 'gambeson' },
    leadership: 4,
    traits: [],
  },
  'montado-lanza': {
    equipo: { arma: 'espada', lanza: 'lanza_de_jinete', armadura: 'barda' },
    leadership: 8,
    traits: ['charge'],
  },
  'montado-arco': {
    equipo: { arma: 'espada', distancia: 'arco', lanza: 'lanza_de_jinete', armadura: 'barda' },
    leadership: 8,
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
  const faction = deLaLista(u.faction, FACTION_IDS, 'la facción', quien);
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
  const edificio = u.edificio === undefined ? undefined : texto(u.edificio, 'el edificio', quien);
  const equipo = equipoEscrito(u.equipo, quien);
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
    ...(edificio === undefined ? {} : { edificio }),
  };
  const motivo = equipoDeUnidadBlocker(cuerpoDeCombate(unidad), equipo, eq);
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
 * La Espada: la versátil, con todo a 3 (`data/equipo.json`). Con ella nace una
 * unidad nueva (`unidadNueva`), y la lleva todo héroe en su equipo base
 * (`EQUIPO_BASE`, `data/heroe.json`).
 */
export const ESPADA = 'espada';

/**
 * Los niveles de la rueda de la Espada, leídos de `data/equipo.json`:
 * los de un arma nueva (decisión del usuario, 18-10-2026: «todo a 3, como la
 * Espada»; `enElHueco`). Sin copia aparte: si se retoca la Espada, lo que nace la
 * sigue, y los tests «con la Espada» leen la de verdad.
 */
export function nivelesDeLaEspada(): NivelesDeLaRueda {
  const rueda = PIEZAS_DEL_CATALOGO.get(ESPADA)?.rueda;
  if (rueda === undefined) {
    throw new Error(
      `data/equipo.json no trae la Espada («${ESPADA}») con su rueda: con ella nacen la unidad y el arma nuevas`,
    );
  }
  return rueda;
}

/**
 * Por qué una unidad con `equipo` no se monta por su arma, o `null`: **sin arma
 * de cuerpo a cuerpo no se combate** (decisión del usuario, 18-10-2026: «si
 * hubiese un lobo, los colmillos serían su arma»). Toda pieza del hueco `arma`
 * dice su rueda (`problemasDePieza`), así que basta con que lleve una. La lee
 * `equipoDeUnidadBlocker`.
 */
export function armaDeCuerpoBlocker(equipo: Equipo): string | null {
  if (equipo.arma !== undefined) return null;
  return `no lleva arma de cuerpo a cuerpo: nadie pelea sin ella; ponle una en ${NOMBRE_DE_HUECO.arma}`;
}

/**
 * Por qué una unidad con el cuerpo `cuerpo` (`cuerpoDeCombate`) no puede llevar
 * `equipo` con las piezas de `eq`, o `null`: que existan, sus huecos y las manos
 * (`equipoBlocker`), que lleve un arma de cuerpo a cuerpo (`armaDeCuerpoBlocker`)
 * y que con todo puesto el índice la sepa medir (`medidaBlocker`: si no, la ficha
 * no se repinta y la pelea se cuelga en el primer golpe que recibe; QA,
 * 12-10-2026). **La regla del equipo de una unidad, en un sitio**: la leen
 * `validarUnidadDeArena` (el catálogo, el enlace, cada cambio de la unidad), lo
 * que ofrece la ficha (`opcionesDelHueco`, `quitarBlocker`) y el cambio de una
 * pieza que alguien lleva (`cambioDePiezas`, `retocarEnBatalla`). El héroe
 * no pasa por ella: lleva el equipo base (`EQUIPO_BASE`).
 */
export function equipoDeUnidadBlocker(
  cuerpo: UnitInfo,
  equipo: Equipo,
  eq: EquipoAtado,
): string | null {
  return (
    eq.equipoBlocker(equipo) ??
    armaDeCuerpoBlocker(equipo) ??
    medidaBlocker(eq.conEquipo(cuerpo, equipo))
  );
}

/**
 * El equipo como se escribe: un objeto con el id de una pieza por hueco, en el
 * orden de los huecos. Qué piezas valen lo dice `equipoDeUnidadBlocker`.
 */
function equipoEscrito(valor: unknown, quien: string): Equipo {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new Error(`${quien}: el equipo tiene que ser un objeto por hueco ({} sin nada)`);
  }
  const e = valor as Record<string, unknown>;
  for (const [hueco, id] of Object.entries(e)) {
    if (!esHueco(hueco)) throw new Error(`${quien}: ${huecoDesconocido(hueco, HUECOS)}`);
    if (typeof id !== 'string')
      throw new Error(`${quien}: el hueco ${hueco} no trae el id de una pieza`);
  }
  // En el orden de los huecos, el mismo cada vez: el texto del enlace no cambia.
  return Object.fromEntries(
    HUECOS.filter((h) => e[h] !== undefined).map((h) => [h, e[h] as string]),
  ) as Equipo;
}

/**
 * Dónde vive el catálogo de unidades, relativo a la raíz del repo: lo leen
 * `core/catalogo.ts` y la arena (`tools/arena/borrador.ts`). Aquí y no en
 * `catalogo.ts` porque aquel lo valida al cargarse, y la arena tiene que poder
 * abrirlo roto para arreglarlo.
 */
export const RUTA_DEL_CATALOGO_DE_UNIDADES = 'data/unidades.json';

/**
 * El `_comment` de `data/unidades.json` si el fichero no trae uno: «Guardar» de la
 * arena conserva el que haya en disco (`tools/arena/borrador.ts`), que es el que se
 * edita y dice qué es el catálogo y la forma de una unidad.
 */
export const COMENTARIO_DEL_CATALOGO_DE_UNIDADES =
  'CATÁLOGO de unidades de las cinco facciones: un cuerpo (cuerpo: { hoja }) y su equipo (una pieza de data/equipo.json por hueco). Cifras INVENTADAS y provisionales. Lo lee src/core/catalogo.ts y lo escribe la arena al pulsar «Guardar», con la misma regla (leerCatalogos).';

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
 * **Lo que la carga del juego exige a los catálogos juntos**: el de equipo `eq`
 * (cada pieza, sus bases y alguna de botín los garantiza al hacerse,
 * `catalogoDeEquipo`/`leerEquipo`), el equipo base del héroe con esas piezas
 * (`equipoBaseBlocker`) y el de unidades (`validarCatalogo`, `{ unidades: [...] }`).
 * Devuelve las unidades o lanza nombrando el fichero que no vale. **Una sola
 * función**: la llaman la carga del juego (`core/catalogo.ts`), «Guardar» de la
 * arena (`tools/arena/borrador.ts`) y su editor de equipo (`cambioDePiezas`),
 * que no deja hacer un cambio con el que el juego no cargaría.
 */
export function leerCatalogos(eq: EquipoAtado, unidades: unknown): readonly UnidadDeArena[] {
  const base = equipoBaseBlocker(eq);
  if (base !== null) throw new Error(base);
  return validarCatalogo(unidades, eq);
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
 * economía, con su equipo sumado (`conEquipo`, la única suma de las piezas) y los
 * poderes de sus habilidades
 * (`poderDeHabilidad`); las demás habilidades no pelean. Sin poderes no lleva el
 * campo. Las piezas, de `eq`: las del catálogo que edita la arena
 * (`catalogoDeEquipo`) o las del juego.
 */
export function unidadDeCombate(u: UnidadDeArena, eq: EquipoAtado): UnitInfo {
  return eq.conEquipo(cuerpoDeCombate(u), u.equipo);
}

/** Lo que el motor juega de una unidad de arena ANTES de su equipo (`unidadDeCombate`). */
export function cuerpoDeCombate(u: UnidadDeArena): UnitInfo {
  // Fuera lo que no pelea; el resto son ya los campos de `UnitInfo`.
  const {
    id: _id,
    faction,
    cuerpo: _cu,
    leadership: _l,
    habilidades,
    casillas,
    equipo: _e,
    edificio: _ed,
    ...cifras
  } = u;
  const poderes = habilidades.flatMap((h) => {
    const p = poderDeHabilidad(h);
    return p === null ? [] : [p];
  });
  // Con su facción: desde que las cinco son las del juego, suman y restan a la
  // moral por diversidad como cualquier tropa (`moraleOf`).
  return {
    ...cifras,
    speed: escalonDeCasillas(casillas),
    faction,
    ...(poderes.length === 0 ? {} : { poderes }),
  };
}

// ---------------------------------------------------------------- las hojas

/**
 * Una hoja tal como la sirve el servidor de desarrollo: quién es, si es un
 * héroe y con qué arte se pinta, para pintarla sin otra petición. Una
 * declaración, que leen el servidor (`tools/arena/borrador.ts`) y la página.
 * Es un tipo de cable sin regla de juego: el motor no lo lee.
 */
export interface HojaDeArena {
  readonly id: string;
  readonly nombre: string;
  readonly faccion: FactionId;
  readonly perfil: PerfilDeArena;
  /**
   * El personaje del que es una hoja: el taller pinta a veces el mismo con varios
   * equipos («Guerrero con escudo» y «con arma a dos manos»), y todas sus hojas
   * comparten cuerpo y velocidad (`tools/arena/velocidades.ts`). Sin personaje
   * declarado, el de la propia hoja.
   */
  readonly personaje: string;
  readonly heroe: boolean;
  /**
   * Las casillas del CUERPO de su personaje: sin el equipo, que las cambia (el
   * escudo resta una). Con su perfil por defecto pelea con `casillas` más la
   * velocidad de su equipo.
   */
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
      faccion: deLaLista(h.faccion, FACTION_IDS, 'la facción', quien),
      perfil: deLaLista(h.perfil, PERFILES_DE_ARENA, 'el perfil', quien),
      personaje: texto(h.personaje, 'el personaje', quien),
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
