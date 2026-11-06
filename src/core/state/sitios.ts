/**
 * Los sitios donde se deja tropa y donde se defiende: una ciudad, un paso (un nodo
 * de la red que no es ciudad) y un pueblo (tarea del puesto fronterizo, fase 1,
 * 04-11-2026; `docs/agents/2026-11-04-puesto-fronterizo/`).
 *
 * Aquí viven tres cosas que antes no existían o estaban sueltas:
 *
 *  - **qué sitio hay en una casilla** y de quién es (`sitioEn`, `dueñoDelSitio`: en
 *    el muro, el de su objeto; dentro de una región, el de la región, la tarea 2,
 *    05-11-2026, `docs/agents/2026-11-05-ciudades-en-su-region/`), y **quién lo
 *    ocupa** (`ocupanteDe`, `ocupadoBlocker`): tropa de otro dentro de un sitio con
 *    dueño, que deja de sumarle hasta que la echa;
 *  - **la guarnición de cada sitio** (`guarnicionDe`): la de una ciudad, un paso o
 *    un pueblo, en `GameState.guarniciones`, por id del sitio, con su dueño (`null`,
 *    la neutral de una ciudad). **Este módulo es el único que escribe
 *    `guarniciones`** (lo vigila `test/invariantes.test.ts`);
 *  - **la única puerta que mueve tropa entre un héroe y la guarnición de su sitio**,
 *    `repartir`: la usan dejar y recoger (`dejar_tropa`, `recoger_tropa`) y la
 *    defensa (`defensaDeLaIA` al nacer la batalla, `elegirLaDefensa` si la rehace la
 *    persona). La recogida automática al pasar por casa (`takeGarrison`) se retiró
 *    con esto: la tropa ya no cambia de sitio sin que nadie lo pida. Lanza con los
 *    dos cupos (`repartoBlocker`), y la defensa de la persona se lee fila a fila de
 *    aquí (`laDefensa`);
 *  - **la muralla de cada sitio** en la batalla (fase 2): la piedra de la ciudad y
 *    la madera del pueblo, de `data/sitios.json`, que **solo importa este módulo**
 *    (lo vigila `test/invariantes.test.ts`) y que se juzga al cargar
 *    (`murallaDelMapaBlocker`): una forma rota no llega a ninguna partida;
 *  - **las obras de un puesto** (fase 3): la empalizada y la muralla de un paso
 *    tomado, con su precio y la forma que nombran en `data/sitios.json`
 *    (`OBRAS_DEL_PUESTO`; el fichero entero lo lee `leerSitios`), la regla de
 *    hacerlas (`mejorarBlocker`) y **la única escritura de `node.mejora`**
 *    (`mejorarElPuesto`; lo vigila `test/invariantes.test.ts`). El oro lo cobra la
 *    acción, en `game.ts`, como toda compra.
 *
 * No importa nada de `game.ts` salvo tipos: `game.ts` lo importa a él. El dueño
 * de un sitio lo pregunta a la red (`dueñoDeUnSitio`, `map/regiones.ts`).
 */
import sitiosJson from '../../../data/sitios.json' with { type: 'json' };
import {
  type MaterialDeMuralla,
  type MurallaDeBatalla,
  murallaDelMapaBlocker,
  SIN_MURALLA,
  validarMuralla,
} from '../battle/muralla.js';
import { unidadDelJuego, unidadDelJuegoSiExiste } from '../catalogo.js';
import { unitPower } from '../hero/fuerza.js';
import type { Hero } from '../hero/hero.js';
import {
  armyLeadership,
  capacidadDe,
  GARRISON_LEADERSHIP,
  licenciar,
  type TroopGroup,
  troopBlocker,
  troopSummary,
  troopUnit,
} from '../hero/troop.js';
import {
  esObraDelPuesto,
  type MapObject,
  type MejoraDelPuesto,
  OBRA_SIGUIENTE,
  OBRAS_DE_UN_PUESTO,
  type ObraDelPuesto,
} from '../map/map.js';
import { dueñoDeUnSitio, sitioEnUnNodo } from '../map/regiones.js';
import { oroBlocker, type Town } from '../town/town.js';
import { type Army, NOMBRE_DE_FACCION, type PlayerId, type Point, type Troop } from '../types.js';
import { deLaLista, entero, esObjeto, problemasDeObjeto } from '../validar.js';
import type { Ocupante } from './events.js';
import type { AdventureAction, GameState } from './tipos.js';

/**
 * La tropa que guarda un sitio, y de quién es: quien la dejó, o el dueño con que
 * nació (la de una base); `null`, la neutral de una ciudad neutral. **No cambia de
 * bando** porque cambie el dueño del sitio (P1 de la tarea 2): si el sitio pasa a
 * otro, la tropa lo ocupa (`ocupanteDe`).
 */
export interface Guarnicion {
  readonly dueño: PlayerId | null;
  readonly tropa: Army;
}

type Nodo = Extract<MapObject, { kind: 'node' }>;
type Pueblo = Extract<MapObject, { kind: 'village' }>;

/**
 * Un sitio del mapa donde se deja tropa y donde se defiende con ella. La ciudad es
 * la de siempre; el paso, un nodo de la red que no es ciudad (montaña, bosque,
 * acantilado, puente o la puerta de una muralla); el pueblo, uno de su región.
 */
export type Sitio =
  | { readonly kind: 'ciudad'; readonly town: Town }
  | { readonly kind: 'paso'; readonly nodo: Nodo }
  | { readonly kind: 'pueblo'; readonly pueblo: Pueblo };

/** El sitio de la ciudad `town`: el literal que se escribía a mano en cada pregunta a una ciudad. */
export function sitioDeLaCiudad(town: Town): Sitio {
  return { kind: 'ciudad', town };
}

const ciudadesPorId = new WeakMap<readonly Town[], Map<string, Town>>();

/**
 * La ciudad de id `id`, por un índice hecho una vez por lista de ciudades (no se
 * crean ni se borran en la partida; si faltara una, se rehace), o `undefined`.
 */
function ciudadPorId(state: GameState, id: string): Town | undefined {
  let indice = ciudadesPorId.get(state.towns);
  if (indice === undefined || !indice.has(id)) {
    indice = new Map(state.towns.map((t) => [t.id, t]));
    ciudadesPorId.set(state.towns, indice);
  }
  return indice.get(id);
}

/** Lo que es un sitio en el mapa: el objeto de una ciudad, de un paso o de un pueblo. */
type ObjetoDeUnSitio = Extract<MapObject, { kind: 'town' | 'node' | 'village' }>;

/**
 * El sitio de un objeto del mapa que ya se tiene en la mano, sin buscarlo por id
 * (`sitioPorId`): el paso y el pueblo son su objeto; la ciudad, la de su id.
 */
export function sitioDelObjeto(state: GameState, o: ObjetoDeUnSitio): Sitio {
  switch (o.kind) {
    case 'node':
      return { kind: 'paso', nodo: o };
    case 'village':
      return { kind: 'pueblo', pueblo: o };
    case 'town': {
      const town = ciudadPorId(state, o.id);
      if (town === undefined) throw new Error(`el mapa tiene una ciudad sin datos: ${o.id}`);
      return { kind: 'ciudad', town };
    }
  }
}

/** El sitio de la casilla `at`, o `null` si allí no hay ninguno. */
export function sitioEn(state: GameState, at: Point): Sitio | null {
  const town = state.towns.find((t) => t.at.x === at.x && t.at.y === at.y);
  if (town !== undefined) return { kind: 'ciudad', town };
  for (const o of state.map.objects) {
    if (o.at.x !== at.x || o.at.y !== at.y) continue;
    if (o.kind === 'node') return { kind: 'paso', nodo: o };
    if (o.kind === 'village') return { kind: 'pueblo', pueblo: o };
  }
  return null;
}

/**
 * El sitio de id `id` (una ciudad o el objeto del mapa de un paso o un pueblo), o
 * `null` si no hay ninguno. Lo lee la crónica de la persona, que nombra el sitio de
 * un hecho por su id (`renderLog`) y, sin él, dice la casilla.
 */
export function sitioSiExiste(state: GameState, id: string): Sitio | null {
  const town = ciudadPorId(state, id);
  if (town !== undefined) return { kind: 'ciudad', town };
  return pasoOPuebloSiExiste(state.map.objects, id);
}

/**
 * El paso o el pueblo de id `id` entre los objetos de un mapa, o `null`: lo de
 * `sitioSiExiste` que no pide las ciudades. Lo lee también la crónica del
 * espectador, que tiene los objetos del cable y no el estado (vuelta 1 de QA de la
 * tarea 2, H2: el pueblo del muro tomado se contaba «Paso tomado»).
 */
export function pasoOPuebloSiExiste(objects: readonly MapObject[], id: string): Sitio | null {
  const o = objects.find((x) => x.id === id);
  if (o?.kind === 'node') return { kind: 'paso', nodo: o };
  if (o?.kind === 'village') return { kind: 'pueblo', pueblo: o };
  return null;
}

/** El sitio de id `id` (una ciudad o el objeto del mapa de un paso o un pueblo), o lanza. */
export function sitioPorId(state: GameState, id: string): Sitio {
  const sitio = sitioSiExiste(state, id);
  if (sitio === null) throw new Error(`no hay ningún sitio "${id}": ni ciudad, ni paso, ni pueblo`);
  return sitio;
}

/** El id del sitio: el de su ciudad, o el del objeto del mapa. */
export function idDelSitio(sitio: Sitio): string {
  switch (sitio.kind) {
    case 'ciudad':
      return sitio.town.id;
    case 'paso':
      return sitio.nodo.id;
    case 'pueblo':
      return sitio.pueblo.id;
  }
}

/** Dónde está el sitio. */
export function casillaDelSitio(sitio: Sitio): Point {
  switch (sitio.kind) {
    case 'ciudad':
      return sitio.town.at;
    case 'paso':
      return sitio.nodo.at;
    case 'pueblo':
      return sitio.pueblo.at;
  }
}

/** Cómo se llama cada paso por la barrera que cruza: es lo que se ve en el mapa. */
const NOMBRE_DEL_PASO: Readonly<Record<Nodo['barrera'], string>> = {
  mountain: 'el paso de montaña',
  forest: 'el paso del bosque',
  cliff: 'el paso del acantilado',
  water: 'el puente',
  wall: 'la puerta de la muralla',
};

/**
 * Cómo se nombra el sitio en una frase: la ciudad y el pueblo por su nombre; el
 * paso, que no tiene, por lo que cruza y su casilla («el puente de (12,8)»).
 */
export function nombreDelSitio(sitio: Sitio): string {
  switch (sitio.kind) {
    case 'ciudad':
      return sitio.town.name;
    case 'paso':
      return `${NOMBRE_DEL_PASO[sitio.nodo.barrera]} de (${sitio.nodo.at.x},${sitio.nodo.at.y})`;
    case 'pueblo':
      return sitio.pueblo.name;
  }
}

/**
 * «de Villarreal», «del paso de montaña de (3,4)», «de la puerta de la muralla de
 * (9,2)»: el nombre del sitio tras «de», con la contracción que pide el español.
 */
export function delSitio(sitio: Sitio): string {
  const nombre = nombreDelSitio(sitio);
  return nombre.startsWith('el ') ? `del ${nombre.slice(3)}` : `de ${nombre}`;
}

/**
 * De quién es el sitio: **la regla del sitio**, una vez (`dueñoDeUnSitio`, en la
 * red). En el muro —un paso, la base, la ciudad-puente o un pueblo entre dos
 * regiones—, el de su objeto del mapa, que se toma como un paso (`tomarElNodo`);
 * dentro de una región, el de quien la tenga. La tropa que lo guarda **no** lo
 * decide (P1): si es de otro, lo ocupa (`ocupanteDe`).
 */
export function dueñoDelSitio(state: GameState, sitio: Sitio): PlayerId | null {
  return dueñoDeUnSitio(state, idDelSitio(sitio));
}

/** De quién es la ciudad (`dueñoDelSitio` de una ciudad): la pregunta de todo lo que antes leía `Town.owner`. */
export function dueñoDeLaCiudad(state: GameState, town: Town): PlayerId | null {
  return dueñoDeUnSitio(state, town.id);
}

/** Si el sitio está en el muro, entre regiones: entonces es un nodo y se toma como un paso. */
export function enUnNodo(state: GameState, sitio: Sitio): boolean {
  return sitioEnUnNodo(state.map, idDelSitio(sitio));
}

/** De quién era un sitio y quién lo ocupaba, en un instante (`comoEstaElSitio`). */
export interface SitioVisto {
  readonly dueño: PlayerId | null;
  readonly ocupante: Ocupante | null;
}

/**
 * De quién es el sitio y quién lo ocupa, ahora: el par que guardan el recuerdo de
 * la niebla (`recuerdoDe`), la foto de la crónica (`fotoDeLosSitios`), el mapa del
 * agente y el cable del espectador. `dueño`, si ya se sabe (de una foto del
 * territorio), para no volver a preguntarlo.
 */
export function comoEstaElSitio(
  state: GameState,
  sitio: Sitio,
  dueño: PlayerId | null = dueñoDelSitio(state, sitio),
): SitioVisto {
  return { dueño, ocupante: ocupanteDe(state, sitio, dueño) };
}

/** El héroe que no es de `jugador` y está en la casilla `at`, si hay uno: el primero, como en la batalla. */
export function heroeAjenoEn(state: GameState, at: Point, jugador: PlayerId): Hero | undefined {
  return state.heroes.find((h) => h.owner !== jugador && h.at.x === at.x && h.at.y === at.y);
}

/**
 * **La regla de la ocupación**, una vez (P1 y P4 de la tarea 2, 05-11-2026): un
 * sitio **con dueño** está ocupado si en su casilla hay un héroe de otro bando, o
 * si lo guarda tropa que no es de su dueño (la de quien lo tenía antes, o la
 * neutral de una ciudad neutral cuya región ya es de alguien). Mientras dura, el
 * sitio no da oro, ni recluta, ni construye, ni crecen sus moradas, ni se contrata
 * en él (`ocupadoBlocker`). El héroe va antes que la guarnición, como en la
 * batalla (`enemyAt`). Un sitio sin dueño no está ocupado: no hay a quién quitarle
 * nada. La leen la renta, la crónica (`anotarLosSitios`), el contrato, la IA y la
 * pantalla. `dueño`, si quien pregunta ya lo tiene.
 */
export function ocupanteDe(
  state: GameState,
  sitio: Sitio,
  dueño: PlayerId | null = dueñoDelSitio(state, sitio),
): Ocupante | null {
  if (dueño === null) return null;
  const heroe = heroeAjenoEn(state, casillaDelSitio(sitio), dueño);
  if (heroe !== undefined) return { kind: 'heroe', heroId: heroe.id, dueño: heroe.owner };
  const g = laGuarnicion(state, sitio);
  if (g !== null && g.dueño !== dueño) return { kind: 'guarnicion', dueño: g.dueño };
  return null;
}

/** De quién es un jugador, dicho: «los Orkos» (su facción). */
function deQuien(state: GameState, jugador: PlayerId | null): string {
  if (jugador === null) return 'neutral';
  const p = state.players.find((x) => x.id === jugador);
  return p === undefined ? `del jugador ${jugador}` : `de los ${NOMBRE_DE_FACCION[p.faction]}`;
}

/**
 * El ocupante dicho: «Grishnak, de los Orkos», «una guarnición neutral». Lo leen
 * `ocupadoBlocker` y la ficha de la ciudad, que dice de quién es la tropa que la
 * ocupa (vuelta 1 de QA de la tarea 2, H1: la enseñaba como su guarnición).
 */
export function ocupanteDicho(state: GameState, ocupante: Ocupante): string {
  if (ocupante.kind === 'heroe') {
    const nombre = state.heroes.find((h) => h.id === ocupante.heroId)?.name ?? ocupante.heroId;
    return `${nombre}, ${deQuien(state, ocupante.dueño)}`;
  }
  return `una guarnición ${deQuien(state, ocupante.dueño)}`;
}

/**
 * Por qué el sitio no da nada a su dueño, o `null` si no está ocupado: la frase de
 * la ocupación (P4), que leen las acciones que apaga (reclutar, construir,
 * contratar y comprar en la armería, por `ciudadQueMandaBlocker`), la renta, la
 * pantalla y el agente.
 * «Villarreal está ocupada por Grishnak, de los Orkos: no da oro, ni recluta, ni
 * construye, ni crecen sus moradas hasta que lo eches atacándolo».
 */
export function ocupadoBlocker(
  state: GameState,
  sitio: Sitio,
  dueño: PlayerId | null = dueñoDelSitio(state, sitio),
): string | null {
  const ocupante = ocupanteDe(state, sitio, dueño);
  if (ocupante === null) return null;
  const quien = ocupanteDicho(state, ocupante);
  const pronombre = ocupante.kind === 'heroe' ? 'lo' : 'la';
  const hasta = `hasta que ${pronombre} eches atacándo${pronombre}`;
  if (sitio.kind === 'ciudad') {
    return `${nombreDelSitio(sitio)} está ocupada por ${quien}: no da oro, ni recluta, ni construye, ni crecen sus moradas, ni se contrata en ella, ni vende su armería ${hasta}`;
  }
  // El pueblo: solo da oro. (El paso no se ocupa: tomarlo limpia su guarnición.)
  return `${nombreDelSitio(sitio)} está ocupado por ${quien}: no da oro ${hasta}`;
}

/**
 * Por qué `player` no manda hoy en la ciudad `town`, o `null`: que no es suya, o
 * que está ocupada (`ocupadoBlocker`). **La regla de «la ciudad que manda»**, una
 * vez (P4 de la tarea 2: ocupada, la ciudad entera deja de servir): la leen
 * construir, reclutar, contratar y comprar en la armería, la IA y la pantalla de la
 * ciudad, cada una con lo suyo delante.
 */
export function ciudadQueMandaBlocker(
  state: GameState,
  town: Town,
  player: PlayerId,
): string | null {
  const dueño = dueñoDeLaCiudad(state, town);
  if (dueño !== player) return `${town.name} no es de tu bando`;
  return ocupadoBlocker(state, sitioDeLaCiudad(town), dueño);
}

/**
 * Lo que es cada sitio en una frase («… es una ciudad»): junto a `nombreDelSitio`,
 * para los motivos que dicen por qué un sitio no vale para algo.
 */
export const QUE_ES_EL_SITIO: Readonly<Record<Sitio['kind'], string>> = {
  ciudad: 'una ciudad',
  paso: 'un paso',
  pueblo: 'un pueblo',
};

/**
 * Los sitios que se defienden siempre tras una muralla del mapa: cada uno nombra
 * su forma en los «usos» de `data/sitios.json`. El paso no: según su obra, pelea
 * tras la que nombre ella, o sin muralla.
 */
const SITIOS_CON_MURALLA = ['ciudad', 'pueblo'] as const satisfies readonly Sitio['kind'][];
type SitioConMuralla = (typeof SITIOS_CON_MURALLA)[number];

/**
 * El material de la muralla de cada obra: el que dice su nombre (la petición del
 * usuario, «una torreta de madera si es una empalizada o una torre si está
 * amurallado»). Es la regla de la carga, no un dato: el fichero dice qué forma
 * nombra cada obra, y una empalizada que nombrara una de piedra no carga.
 */
const MATERIAL_DE_LA_OBRA: Readonly<Record<ObraDelPuesto, MaterialDeMuralla>> = {
  empalizada: 'madera',
  muralla: 'piedra',
};

/** Lo que es cada obra de un puesto en la partida: lo que cuesta y tras qué muralla se pelea. */
export interface LaObra {
  /** En oro (inventado, `data/sitios.json`). */
  readonly precio: number;
  /** La forma que nombra en el fichero: el mismo objeto que la de quien la comparta. */
  readonly muralla: MurallaDeBatalla;
}

/** Lo que se lee de `data/sitios.json` (`leerSitios`). */
export interface LosSitios {
  /** La muralla de toda batalla contra una ciudad y contra un pueblo. */
  readonly murallas: Readonly<Record<SitioConMuralla, MurallaDeBatalla>>;
  /** Las obras de un puesto, con su precio y su muralla. */
  readonly obras: Readonly<Record<ObraDelPuesto, LaObra>>;
}

/** Los usos del fichero: los sitios con muralla y las obras de un puesto. */
const USOS = [...SITIOS_CON_MURALLA, ...OBRAS_DE_UN_PUESTO];

/**
 * Lo que trae `valor` (el contenido de `data/sitios.json`), o lanza nombrando el
 * fichero con lo primero que no vale. Las **formas**, por nombre en «murallas» (un
 * conjunto abierto: las que se quieran), cada una una muralla (`validarMuralla`) que
 * vale para el mapa (`murallaDelMapaBlocker`). **Quién usa cuál**, una sola tabla,
 * «usos»: la ciudad, el pueblo y cada obra del paso nombran su forma, y las obras
 * llevan su precio, un entero de 1 en adelante; la forma de una obra, del material
 * que dice su nombre (`MATERIAL_DE_LA_OBRA`). Exportada para que el test de datos le
 * dé ficheros rotos a propósito; el juego la llama una vez, al cargar.
 */
export function leerSitios(valor: unknown, fichero = 'data/sitios.json'): LosSitios {
  const enLaRaiz = objeto(valor, ['_comment', 'murallas', 'usos'], ['murallas', 'usos'], fichero);
  const formas = new Map<string, MurallaDeBatalla>();
  const crudas = enLaRaiz.murallas;
  if (!esObjeto(crudas)) throw new Error(`${fichero}: «murallas» tiene que ser un objeto`);
  for (const [nombre, cruda] of Object.entries(crudas)) {
    const quien = `${fichero}: la muralla «${nombre}»`;
    let m: MurallaDeBatalla;
    try {
      m = validarMuralla(cruda);
    } catch (err) {
      throw new Error(`${quien}: ${err instanceof Error ? err.message : String(err)}`);
    }
    const motivo = murallaDelMapaBlocker(m);
    if (motivo !== null) throw new Error(`${quien} no vale: ${motivo}`);
    formas.set(nombre, m);
  }
  const nombres = [...formas.keys()];
  const usos = objeto(enLaRaiz.usos, USOS, USOS, `${fichero}: «usos»`);
  /** La forma que nombra el uso `uso`, que tiene los campos `campos`. */
  const formaDe = (uso: string, campos: readonly string[]) => {
    const quien = `${fichero}: el uso «${uso}»`;
    const crudo = objeto(usos[uso], campos, campos, quien);
    const muralla = formas.get(deLaLista(crudo.muralla, nombres, '«muralla»', quien));
    return { crudo, quien, muralla: muralla as MurallaDeBatalla };
  };
  const murallas = {} as Record<SitioConMuralla, MurallaDeBatalla>;
  for (const sitio of SITIOS_CON_MURALLA) murallas[sitio] = formaDe(sitio, ['muralla']).muralla;
  const obras = {} as Record<ObraDelPuesto, LaObra>;
  for (const obra of OBRAS_DE_UN_PUESTO) {
    const { crudo, quien, muralla } = formaDe(obra, ['muralla', 'precio']);
    if (muralla.material !== MATERIAL_DE_LA_OBRA[obra]) {
      throw new Error(
        `${quien}: la ${obra} se pelea tras una muralla de ${MATERIAL_DE_LA_OBRA[obra]}, y «${String(crudo.muralla)}» es de ${muralla.material}`,
      );
    }
    obras[obra] = { precio: entero(crudo.precio, '«precio»', quien, 1), muralla };
  }
  return { murallas: Object.freeze(murallas), obras: Object.freeze(obras) };
}

/** `valor` como objeto con los campos `campos` (y `obligatorios`), o lanza con `quien` delante. */
function objeto(
  valor: unknown,
  campos: readonly string[],
  obligatorios: readonly string[],
  quien: string,
): Readonly<Record<string, unknown>> {
  const [motivo] = problemasDeObjeto(valor, campos, obligatorios);
  if (motivo !== undefined) throw new Error(`${quien}: ${motivo}`);
  return valor as Readonly<Record<string, unknown>>;
}

const SITIOS = leerSitios(sitiosJson);

/** Las de la partida: la de las ciudades y la de los pueblos. */
export const MURALLAS_DEL_MAPA = SITIOS.murallas;

/** Las obras de un puesto de la partida: la empalizada y la muralla. */
export const OBRAS_DEL_PUESTO = SITIOS.obras;

/**
 * Con qué muralla se pelea en el sitio `sitio` quien lo defiende (D3, D7): una
 * ciudad —también la base y la neutral— y un pueblo, la suya (`MURALLAS_DEL_MAPA`);
 * un paso, la de su obra (`OBRAS_DEL_PUESTO`), y sin obra, ninguna. Sin sitio (un
 * monstruo, un grupo de asaltantes, un lugar, un héroe fuera de un sitio suyo),
 * ninguna. Lo pregunta `montarLaBatalla`, que con muralla da escalera al atacante
 * (`alAsalto`).
 */
export function murallaDelSitio(sitio: Sitio | null): MurallaDeBatalla {
  if (sitio === null) return SIN_MURALLA;
  switch (sitio.kind) {
    case 'ciudad':
    case 'pueblo':
      return MURALLAS_DEL_MAPA[sitio.kind];
    case 'paso':
      return sitio.nodo.mejora === 'ninguna'
        ? SIN_MURALLA
        : OBRAS_DEL_PUESTO[sitio.nodo.mejora].muralla;
  }
}

/** El material de la muralla tras la que se pelea en un puesto con cada obra (`null`, sin muralla). */
const MATERIAL_DEL_PUESTO: Readonly<Record<MejoraDelPuesto, MaterialDeMuralla | null>> = {
  ninguna: null,
  empalizada: OBRAS_DEL_PUESTO.empalizada.muralla.material,
  muralla: OBRAS_DEL_PUESTO.muralla.muralla.material,
};

/** Una obra hecha (o por hacer): quién, en qué paso, cuál y por cuánto. */
export interface ObraHecha {
  readonly hero: Hero;
  readonly nodo: Nodo;
  readonly obra: ObraDelPuesto;
  readonly precio: number;
}

/**
 * Lo que pide mejorar un puesto, ya resuelto: que no es un puesto suyo o que la
 * obra pedida no es la que toca (`no`), que ya está amurallado (`hecho`, que no es
 * un rechazo: no hay nada que arreglar) o la obra que toca, con el motivo para no
 * hacerla (el oro) o `null`.
 */
type LaMejoraPedida =
  | { readonly kind: 'no'; readonly motivo: string }
  | { readonly kind: 'hecho'; readonly nota: string }
  | (ObraHecha & { readonly kind: 'obra'; readonly motivo: string | null });

/**
 * Juzga «hacer la obra `pedida` en el puesto donde está `heroId`» con `oro` en el
 * monedero y, si toca obra, dice cuál y por cuánto: la regla de `mejorarBlocker`, lo
 * que aplica `mejorarElPuesto` y lo que enseña `laObraDelPuesto` (que no pide
 * ninguna, `null`: enseña la que toca), una vez. En el orden en que se entiende:
 * quién, dónde, de quién es (`heroeEnSuSitio`), que sea un paso, que quede obra,
 * que la pedida sea la que toca y el oro.
 *
 * **La obra se pide por su nombre** (QA de la fase 3, H-F3-1): con un doble clic en
 * «Levantar la empalizada», el segundo caía en el mismo botón repintado como
 * «Amurallar» y compraba la muralla, 4 000 de oro que quien juega no vio ofrecidos.
 * Quien pide la empalizada de un puesto que ya la tiene no compra lo siguiente.
 */
function laMejoraPedida(
  state: GameState,
  player: PlayerId,
  heroId: string,
  pedida: ObraDelPuesto | null,
  oro: number,
): LaMejoraPedida {
  const donde = heroeEnSuSitio(state, player, heroId, 'solo se mejora un paso tuyo, un puesto');
  if ('motivo' in donde) return { kind: 'no', motivo: donde.motivo };
  const { hero, sitio } = donde;
  // Solo se mejora lo que es suyo: la guarnición suya en un sitio ajeno no basta.
  if (!donde.suyo) return { kind: 'no', motivo: noEsTuyo(sitio) };
  if (sitio.kind !== 'paso') {
    return {
      kind: 'no',
      motivo: `solo se mejora un paso tomado, un puesto: ${nombreDelSitio(sitio)} es ${QUE_ES_EL_SITIO[sitio.kind]}`,
    };
  }
  // Lo que nombra la acción, que no lo comprueba el tipo: el clic lo lee del botón.
  const comoLlega: unknown = pedida;
  if (comoLlega !== null && !esObraDelPuesto(comoLlega)) {
    return {
      kind: 'no',
      motivo: `«${String(comoLlega)}» no es una obra de un puesto; valen ${OBRAS_DE_UN_PUESTO.join(', ')}`,
    };
  }
  // «El puesto de …» y no el nombre del paso: «la puerta de la muralla de (17,6)
  // ya está amurallado» no concordaba (QA de la fase 3, H-F3-2).
  const elPuesto = `el puesto ${delSitio(sitio)}`;
  const ahora = sitio.nodo.mejora;
  const obra = OBRA_SIGUIENTE[ahora];
  if (obra === null) {
    return { kind: 'hecho', nota: `${elPuesto} ya está amurallado: no hay más obra que hacer` };
  }
  if (pedida !== null && pedida !== obra) {
    const tiene = ahora === 'ninguna' ? 'aún no tiene ninguna obra' : `ya tiene la ${ahora}`;
    return { kind: 'no', motivo: `${elPuesto} ${tiene}: la siguiente obra es la ${obra}` };
  }
  const { precio } = OBRAS_DEL_PUESTO[obra];
  return { kind: 'obra', hero, nodo: sitio.nodo, obra, precio, motivo: oroBlocker(precio, oro) };
}

/**
 * Por qué `player`, con `oro`, no puede hacer la obra `obra` en el puesto donde está
 * su héroe `heroId` (`mejorar_el_puesto`), o `null`. **La regla de la mejora**, una
 * vez, como `buildBlocker`: la lee la acción (que lanza con ella y cobra) y el botón
 * del diálogo de la guarnición (`laObraDelPuesto`). La obra es la siguiente a la que
 * tiene (ninguna → empalizada → muralla) y se pide por su nombre: otra se rechaza
 * sin cobrar. Se paga en oro (`oroBlocker`) y es inmediata, sin tope por día
 * (pregunta 4 del plan). No mira el turno.
 */
export function mejorarBlocker(
  state: GameState,
  player: PlayerId,
  heroId: string,
  obra: ObraDelPuesto,
  oro: number,
): string | null {
  const m = laMejoraPedida(state, player, heroId, obra, oro);
  return m.kind === 'hecho' ? m.nota : m.motivo;
}

/**
 * Hace la obra `obra` —la siguiente— en el puesto donde está el héroe `heroId`, o
 * lanza con `mejorarBlocker`. **La única escritura de `node.mejora`** (lo vigila
 * `test/invariantes.test.ts`). No cobra: cobra la acción, con el jugador que ya
 * tiene, como toda compra. Devuelve qué obra, dónde y por cuánto.
 */
export function mejorarElPuesto(
  state: GameState,
  player: PlayerId,
  heroId: string,
  obra: ObraDelPuesto,
  oro: number,
): ObraHecha {
  const m = laMejoraPedida(state, player, heroId, obra, oro);
  const motivo = m.kind === 'hecho' ? m.nota : m.motivo;
  if (m.kind !== 'obra' || motivo !== null) {
    throw new Error(`no se puede mejorar el puesto: ${motivo}`);
  }
  m.nodo.mejora = m.obra;
  return m;
}

/** Lo que enseña la pantalla del puesto de su obra (`laObraDelPuesto`). */
export interface LaObraDelPuesto {
  /** La que tiene. */
  readonly ahora: MejoraDelPuesto;
  /** La que sigue y su precio, o `null` si ya está amurallado. */
  readonly siguiente: { readonly obra: ObraDelPuesto; readonly precio: number } | null;
  /** Tras qué muralla se pelea en el puesto con cada obra (`null`, sin muralla). */
  readonly materiales: Readonly<Record<MejoraDelPuesto, MaterialDeMuralla | null>>;
  /** Por qué no se puede hacer la siguiente (el oro, el dueño): un rechazo. */
  readonly motivo: string | null;
  /** Por qué no hay siguiente («ya está amurallado»): solo informa. */
  readonly nota: string | null;
}

/**
 * La obra del puesto donde está `hero` como la lee el diálogo de la guarnición, con
 * `oro` en el monedero, o `null` si no está en un paso suyo (la ciudad y el pueblo
 * no se mejoran). Como la fila de la defensa (`motivoMas`, `notaMas`), el núcleo
 * separa el rechazo de lo que solo informa: la pantalla solo lo pinta.
 */
export function laObraDelPuesto(
  state: GameState,
  player: PlayerId,
  hero: Hero,
  oro: number,
): LaObraDelPuesto | null {
  const sitio = sitioDelHeroe(state, hero);
  if (sitio === null || sitio.kind !== 'paso') return null;
  const m = laMejoraPedida(state, player, hero.id, null, oro);
  return {
    ahora: sitio.nodo.mejora,
    siguiente: m.kind === 'obra' ? { obra: m.obra, precio: m.precio } : null,
    materiales: MATERIAL_DEL_PUESTO,
    motivo: m.kind === 'hecho' ? null : m.motivo,
    nota: m.kind === 'hecho' ? m.nota : null,
  };
}

/** La tropa que guarda el sitio (vacía si no guarda nada). */
export function guarnicionDe(state: GameState, sitio: Sitio): Army {
  return state.guarniciones[idDelSitio(sitio)]?.tropa ?? [];
}

/** La guarnición de la ciudad `town` (`guarnicionDe` de su sitio). */
export function guarnicionDeLaCiudad(state: GameState, town: Town): Army {
  return guarnicionDe(state, sitioDeLaCiudad(town));
}

/**
 * La guarnición del sitio (el sitio o su id) con su dueño, o `null` si no guarda
 * nada: la tropa tiene su propio dueño, que no tiene por qué ser el del sitio (P1).
 * `ponerLaGuarnicion` borra la que se queda vacía; que una entrada sin tropa no
 * cuente se comprueba aquí, una vez, y lo leen la ocupación, la hostil y la regla
 * de «suyo».
 */
export function laGuarnicion(state: GameState, sitio: Sitio | string): Guarnicion | null {
  const g = state.guarniciones[typeof sitio === 'string' ? sitio : idDelSitio(sitio)];
  return g === undefined || g.tropa.length === 0 ? null : g;
}

/**
 * La guarnición del sitio (el sitio o su id) **si es hostil para `player`**: tiene
 * tropa y no es suya (la neutral de una ciudad, también). Es lo que no se cruza y
 * se pelea al pisarlo (`enemyAt`, `casillasHostiles`, `queLoCierra`) y lo que la
 * IA mide antes de ir (`objectValue`): una regla, leída por los cuatro. Desde la
 * tarea 2 vale igual para la ciudad, cuya guarnición vive aquí con las demás.
 */
export function guarnicionHostil(
  state: GameState,
  sitio: Sitio | string,
  player: PlayerId,
): Guarnicion | null {
  const g = laGuarnicion(state, sitio);
  return g !== null && g.dueño !== player ? g : null;
}

/**
 * Lo que hay entre `hero` y la guarnición de su sitio: su ejército y después la
 * guarnición, en ese orden (el de despliegue). Es de donde salen el reparto, la
 * defensa de la IA y la de la persona.
 */
export function entreLosDos(state: GameState, hero: Hero, sitio: Sitio): Troop[] {
  return [...hero.army, ...guarnicionDe(state, sitio)];
}

/**
 * Lo que cabe en la guarnición de cualquier sitio: el liderazgo de la de un
 * castillo (`GARRISON_LEADERSHIP`, `data/liderazgo.json`, provisional) y el tope de
 * tropa de la partida. El mismo para los tres: es el cupo que pedía el requisito
 * («un tope declarado en `data/`») y el que ya tenía la ciudad.
 */
export function cupoDeLaGuarnicion(state: GameState): {
  readonly tope: number;
  readonly cupo: number;
} {
  return { tope: GARRISON_LEADERSHIP, cupo: state.combate.tope };
}

/**
 * Escribe la guarnición del sitio: su entrada de `guarniciones`, que se borra si
 * queda vacía (sin entrada = sin guarnición: el sitio ya no está ocupado por ella).
 */
export function ponerLaGuarnicion(
  state: GameState,
  sitio: Sitio,
  dueño: PlayerId | null,
  tropa: Army,
): void {
  const id = idDelSitio(sitio);
  if (tropa.length === 0) delete state.guarniciones[id];
  else state.guarniciones[id] = { dueño, tropa };
}

/**
 * La guarnición del sitio `id` se pierde: el sitio en el muro cambia de dueño
 * (`tomarElNodo`) o quien la guardaba pierde la batalla. Lo no elegido para la
 * defensa se pierde con el sitio (D1 de la tarea del puesto).
 */
export function quitarLaGuarnicion(state: GameState, id: string): void {
  delete state.guarniciones[id];
}

/** Lo que ocupa un ejército frente a lo que cabe, dicho para la persona. */
function lleno(army: Army, { tope, cupo }: { tope: number; cupo: number }): string | null {
  if (army.length <= cupo && armyLeadership(army) <= tope) return null;
  return `serían ${army.length} de ${cupo} individuos y ${armyLeadership(army)} de ${tope} de liderazgo`;
}

/**
 * Por qué no vale que `hero` se quede con `enElHeroe` y la guarnición de su sitio
 * con lo demás de lo que hay entre los dos, o `null`: **los dos cupos**, el del
 * héroe (`capacidadDe`) y el de la guarnición (`cupoDeLaGuarnicion`). Es la
 * pregunta de todo reparto, y la hace la puerta (`repartir` lanza con ella): la
 * leen dejar y recoger (`intercambioBlocker`), la defensa de la IA y la que pide la
 * persona (`ejercitoDeLaDefensa`).
 *
 * Que la guarnición quepa importa tanto como el héroe: lo que se queda fuera de
 * una defensa y no cabía montó, días después, una batalla de más de siete contra
 * la ciudad sin héroe, y `createBattle` lanzó (desviación 2 de la fase 1).
 */
export function repartoBlocker(
  state: GameState,
  hero: Hero,
  sitio: Sitio,
  enElHeroe: Army,
): string | null {
  const fuera = sinLos(entreLosDos(state, hero, sitio), enElHeroe);
  if (fuera === null) {
    return `${hero.name} pide a alguien que no está ni en su ejército ni en la guarnición ${delSitio(sitio)}`;
  }
  const delHeroe = lleno(enElHeroe, capacidadDe(hero, state.combate.tope));
  if (delHeroe !== null) return `el ejército de ${hero.name} no cabe: ${delHeroe}`;
  const deLaGuarnicion = lleno(fuera, cupoDeLaGuarnicion(state));
  if (deLaGuarnicion !== null) {
    return `lo que se queda no cabe en la guarnición ${delSitio(sitio)}: ${deLaGuarnicion}`;
  }
  return null;
}

/**
 * `todos` sin cada uno de `quitar`, por identidad y uno a uno (un mismo objeto
 * puede ir dos veces: lo que se monta a mano en los tests), en el orden en que
 * estaban; `null` si `quitar` pide a alguien que no está.
 */
function sinLos(todos: readonly Troop[], quitar: Army): Troop[] | null {
  const quedan = [...todos];
  for (const t of quitar) {
    const i = quedan.indexOf(t);
    if (i === -1) return null;
    quedan.splice(i, 1);
  }
  return quedan;
}

/**
 * **La única puerta que mueve tropa entre un héroe y la guarnición de su sitio.**
 * `enElHeroe` es con qué se queda el héroe, sacado de lo que hay entre los dos (su
 * ejército y la guarnición, por identidad de cada individuo); lo demás queda
 * guardando el sitio, en el orden en que estaba. **Lanza con `repartoBlocker`**:
 * quien llama ya ha juzgado que se puede, y si no, el fallo es suyo y se dice aquí
 * y no días después en `createBattle`.
 */
export function repartir(state: GameState, hero: Hero, sitio: Sitio, enElHeroe: Army): void {
  const noVale = repartoBlocker(state, hero, sitio, enElHeroe);
  if (noVale !== null) {
    throw new Error(`no se puede repartir la tropa ${delSitio(sitio)}: ${noVale}`);
  }
  const quedan = sinLos(entreLosDos(state, hero, sitio), enElHeroe) as Troop[];
  hero.army = [...enElHeroe];
  ponerLaGuarnicion(state, sitio, hero.owner, quedan);
}

/** Dejar tropa en la guarnición (`dejar_tropa`) o recogerla (`recoger_tropa`): el tipo de la acción. */
export type Intercambio = Extract<
  AdventureAction,
  { readonly type: 'dejar_tropa' | 'recoger_tropa' }
>['type'];

/**
 * Lo que piden dejar y recoger: de un héroe, `count` individuos de `creature` (de
 * ese tipo, los que se irían: `elQueSeIria`) **o** el veterano `veterano`, uno, con
 * su tipo, su hoja y su equipo.
 */
export type PedidoDeTropa =
  | { readonly hero: string; readonly creature: string; readonly count: number }
  | { readonly hero: string; readonly veterano: string };

/**
 * El pedido que mueve un grupo de un ejército (`troopSummary`): el veterano por su
 * id, o `count` de su tipo (por defecto, el grupo entero). Lo leen la pantalla de la
 * guarnición (uno cada vez) y la IA que recoge (`planIntercambios`).
 */
export function pedidoDelGrupo(
  hero: string,
  grupo: TroopGroup,
  count: number = grupo.count,
): PedidoDeTropa {
  return grupo.veterania === undefined
    ? { hero, creature: grupo.creature, count }
    : { hero, veterano: grupo.veterania.id };
}

/** El intercambio que pide `pedido`, ya resuelto, o por qué no se puede. */
type ElIntercambio =
  | { readonly motivo: string }
  | {
      readonly hero: Hero;
      readonly sitio: Sitio;
      readonly creature: string;
      readonly count: number;
      readonly enElHeroe: Army;
    };

/** Lo que dicen dejar, recoger y repartir a quien no está en un sitio (`heroeEnSuSitio`). */
const PARA_LA_TROPA = 'la tropa se deja y se recoge en un sitio tuyo';

/**
 * El héroe `heroId` de `player` y el sitio suyo donde está, o por qué no: lo
 * primero que preguntan dejar, recoger, repartir y mejorar, en ese orden (quién,
 * dónde, de quién es el sitio). Fuera de todo sitio, el motivo acaba en `para`, lo
 * que dice quien pregunta de lo que pidió.
 *
 * El sitio es suyo como lo dice `loSuyoDelSitio`: también uno que ya no es suyo
 * **si la guarnición es suya** (pregunta 3 de la tarea 2, «recoger sí, dejar no»).
 * `suyo` dice si lo es el sitio: quien deja tropa o mejora el puesto, solo ahí.
 */
function heroeEnSuSitio(
  state: GameState,
  player: PlayerId,
  heroId: string,
  para: string,
):
  | { readonly hero: Hero; readonly sitio: Sitio; readonly suyo: boolean }
  | { readonly motivo: string } {
  const hero = state.heroes.find((h) => h.id === heroId);
  if (hero === undefined) return { motivo: `no existe ningún héroe "${heroId}"` };
  if (hero.owner !== player) return { motivo: `${hero.name} no es de tu bando` };
  const sitio = sitioEn(state, hero.at);
  if (sitio === null) {
    return { motivo: `${hero.name} no está en ninguna ciudad, paso ni pueblo: ${para}` };
  }
  const suyo = loSuyoDelSitio(state, sitio, player);
  if (suyo === null) return { motivo: noEsTuyo(sitio) };
  return { hero, sitio, suyo: suyo === 'sitio' };
}

/** Lo que dice quien pide algo en un sitio que no es suyo. */
function noEsTuyo(sitio: Sitio): string {
  return `${nombreDelSitio(sitio)} no es tuyo`;
}

/**
 * **La regla de «suyo»**, una vez: si el sitio es de `jugador` (`'sitio'`), si solo
 * lo es la tropa que lo guarda (`'guarnicion'`: lo que dejó en un pueblo cuya
 * región cambió de dueño, pregunta 3 de la tarea 2) o ninguna de las dos (`null`).
 * La leen `heroeEnSuSitio` y `sitioDelHeroe`.
 */
function loSuyoDelSitio(
  state: GameState,
  sitio: Sitio,
  jugador: PlayerId,
): 'sitio' | 'guarnicion' | null {
  if (dueñoDelSitio(state, sitio) === jugador) return 'sitio';
  return laGuarnicion(state, sitio)?.dueño === jugador ? 'guarnicion' : null;
}

/** Lo que dice dejar tropa en un sitio que ya no es suyo, donde solo puede recogerla. */
function soloRecoger(sitio: Sitio): string {
  return `${nombreDelSitio(sitio)} ya no es tuyo: puedes recoger la guarnición que dejaste, no dejar más`;
}

/**
 * Juzga el pedido y, si se puede, dice cómo queda el héroe: la regla de
 * `intercambioBlocker` y lo que aplica `moverTropa`, una vez, para que lo que se
 * juzga y lo que se mueve no puedan contarse distinto.
 */
function elIntercambio(
  state: GameState,
  player: PlayerId,
  que: Intercambio,
  pedido: PedidoDeTropa,
): ElIntercambio {
  const deja = que === 'dejar_tropa';
  const donde = heroeEnSuSitio(state, player, pedido.hero, PARA_LA_TROPA);
  if ('motivo' in donde) return donde;
  const { hero, sitio } = donde;
  if (deja && !donde.suyo) return { motivo: soloRecoger(sitio) };
  if ('count' in pedido && (!Number.isSafeInteger(pedido.count) || pedido.count < 1)) {
    return { motivo: `son individuos: se mueven de 1 en adelante, no ${pedido.count}` };
  }
  const origen = deja ? hero.army : guarnicionDe(state, sitio);
  const destino = deja ? guarnicionDe(state, sitio) : hero.army;
  const quienOrigen = deja ? hero.name : `la guarnición ${delSitio(sitio)}`;
  const quienDestino = deja ? `la guarnición ${delSitio(sitio)}` : 'el ejército';

  let movidos: Troop[];
  if ('veterano' in pedido) {
    const v = origen.find((t) => t.veterania?.id === pedido.veterano);
    if (v === undefined)
      return { motivo: `${quienOrigen} no lleva al veterano "${pedido.veterano}"` };
    movidos = [v];
  } else {
    const especie = unidadDelJuegoSiExiste(pedido.creature);
    if (especie === null) return { motivo: `no existe ninguna unidad "${pedido.creature}"` };
    // De su tipo, los que se irían (`licenciar`, de uno en uno con `elQueSeIria`).
    const { seVan } = licenciar(origen, pedido.creature, pedido.count);
    if (seVan.length === 0) {
      return { motivo: `${quienOrigen} no lleva individuos de tipo ${especie.name}` };
    }
    if (seVan.length < pedido.count) {
      return {
        motivo: `${quienOrigen} lleva ${seVan.length} × ${especie.name} y no se pueden mover ${pedido.count}`,
      };
    }
    movidos = [...seVan];
  }
  const creature = (movidos[0] as Troop).creature;
  const { tope, cupo } = deja ? cupoDeLaGuarnicion(state) : capacidadDe(hero, state.combate.tope);
  const noCabe = troopBlocker(destino, tope, cupo, creature, movidos.length, quienDestino);
  if (noCabe !== null) return { motivo: noCabe };
  const enElHeroe = deja ? (sinLos(hero.army, movidos) as Troop[]) : [...hero.army, ...movidos];
  const noVale = repartoBlocker(state, hero, sitio, enElHeroe);
  if (noVale !== null) return { motivo: noVale };
  return { hero, sitio, creature, count: movidos.length, enElHeroe };
}

/**
 * Por qué `player` no puede dejar (`dejar_tropa`) o recoger (`recoger_tropa`) esa
 * tropa entre su héroe y la guarnición del sitio donde está, o `null`. **La regla
 * de dejar y recoger**, una vez: la leen las dos acciones (que lanzan con ella), los
 * botones de la pantalla de la guarnición y el veredicto del agente. No mira el
 * turno (`turnBlocker`).
 *
 * En el orden en que se entiende: quién, dónde, de quién es el sitio, qué se pide,
 * si lo hay y si cabe donde va (`troopBlocker`, que dice cuántos caben, y después
 * `repartoBlocker`, los dos cupos del reparto entero).
 */
export function intercambioBlocker(
  state: GameState,
  player: PlayerId,
  que: Intercambio,
  pedido: PedidoDeTropa,
): string | null {
  const i = elIntercambio(state, player, que, pedido);
  return 'motivo' in i ? i.motivo : null;
}

/**
 * Mueve la tropa del pedido entre el héroe y la guarnición de su sitio, por
 * `repartir`, o lanza con `intercambioBlocker`. Los que se mueven son, de su tipo,
 * los que **se irían** (`elQueSeIria`: los de menos experiencia, y a igual, los que
 * menos llevan puesto), o el veterano que se nombra; van con su hoja y su equipo.
 * Devuelve dónde, qué y cuántos, para el hecho que lo cuenta.
 */
export function moverTropa(
  state: GameState,
  player: PlayerId,
  que: Intercambio,
  pedido: PedidoDeTropa,
): {
  readonly hero: Hero;
  readonly sitio: Sitio;
  readonly creature: string;
  readonly count: number;
} {
  const i = elIntercambio(state, player, que, pedido);
  if ('motivo' in i) {
    throw new Error(
      `no se puede ${que === 'dejar_tropa' ? 'dejar' : 'recoger'} tropa: ${i.motivo}`,
    );
  }
  repartir(state, i.hero, i.sitio, i.enElHeroe);
  return i;
}

/**
 * Una línea de un reparto entre un héroe y la guarnición de su sitio (la acción
 * `repartir_tropa`): con el héroe van `count` novatos de `creature`, o el veterano
 * `veterano`. Los novatos de un tipo son iguales (sin hoja no llevan nada suyo), así
 * que basta con cuántos; el veterano va por su id, con su hoja y su equipo.
 */
export type LineaDelReparto =
  | { readonly creature: string; readonly count: number }
  | { readonly veterano: string };

/** Cuántos de cada tipo, en orden de primera aparición: lo que cuenta el hecho de un reparto. */
export interface TropaMovida {
  readonly creature: string;
  readonly count: number;
}

/**
 * Las líneas que describen `army` tal cual: de donde parte la pantalla de la
 * guarnición, que las edita.
 */
export function lineasDelEjercito(army: Army): LineaDelReparto[] {
  const lineas: LineaDelReparto[] = [];
  const novatos = new Map<string, number>();
  for (const t of army) {
    if (t.veterania !== undefined) {
      lineas.push({ veterano: t.veterania.id });
      continue;
    }
    novatos.set(t.creature, (novatos.get(t.creature) ?? 0) + 1);
  }
  for (const [creature, count] of novatos) lineas.push({ creature, count });
  return lineas;
}

/**
 * Quién iría con `hero` con el reparto `lineas`, por su posición en lo que hay entre
 * él y la guarnición de su sitio (`entreLosDos`), o por qué las líneas no valen.
 * **Las líneas dicen todo lo que va con él**: un tipo que no nombran, y un veterano
 * que no nombran, quedan en la guarnición. De cada tipo, los novatos que ya llevaba
 * primero (son iguales: así no se mueve a nadie de más). No vale nombrar dos veces
 * un tipo o un veterano, un tipo que no existe ni más novatos de los que hay. Los cupos no los mira: eso es del reparto
 * entero (`repartirTropaBlocker`), y la pantalla enseña lo editado aunque no quepa.
 *
 * Por posición y no por identidad, como `defensaDeLaIA`: un mismo objeto puede ir
 * dos veces en un ejército.
 */
function elegidosDelReparto(
  state: GameState,
  hero: Hero,
  sitio: Sitio,
  lineas: readonly LineaDelReparto[],
): ReadonlySet<number> | { readonly motivo: string } {
  const todos = entreLosDos(state, hero, sitio);
  const elegidos = new Set<number>();
  const vistos = new Set<string>();
  for (const linea of lineas) {
    if ('veterano' in linea) {
      if (vistos.has(`v:${linea.veterano}`)) {
        return { motivo: `el veterano "${linea.veterano}" va dos veces en el reparto` };
      }
      vistos.add(`v:${linea.veterano}`);
      const i = todos.findIndex((t) => t.veterania?.id === linea.veterano);
      if (i === -1) {
        return {
          motivo: `ni ${hero.name} ni la guarnición ${delSitio(sitio)} llevan al veterano "${linea.veterano}"`,
        };
      }
      elegidos.add(i);
      continue;
    }
    const { creature, count } = linea;
    if (vistos.has(`c:${creature}`)) return { motivo: `«${creature}» va dos veces en el reparto` };
    vistos.add(`c:${creature}`);
    if (!Number.isSafeInteger(count) || count < 0) {
      return { motivo: `son individuos: de cada tipo van con el héroe 0 o más, no ${count}` };
    }
    const especie = unidadDelJuegoSiExiste(creature);
    if (especie === null) return { motivo: `no existe ninguna unidad "${creature}"` };
    const novatos = todos
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.creature === creature && t.veterania === undefined);
    if (count > novatos.length) {
      return {
        motivo: `entre ${hero.name} y la guarnición ${delSitio(sitio)} hay ${novatos.length} × ${especie.name} sin veteranía, no ${count}`,
      };
    }
    // Los de su ejército van delante en `todos`: con los primeros, no se mueve a
    // ninguno que no haga falta.
    for (const { i } of novatos.slice(0, count)) elegidos.add(i);
  }
  return elegidos;
}

/** `army` contado por tipo, en orden de primera aparición (los veteranos, con los de su tipo). */
function porTipo(army: Army): TropaMovida[] {
  const cuenta = new Map<string, number>();
  for (const t of army) cuenta.set(t.creature, (cuenta.get(t.creature) ?? 0) + 1);
  return [...cuenta].map(([creature, count]) => ({ creature, count }));
}

/** Lo que pide un reparto: el héroe y las líneas de lo que va con él (`LineaDelReparto`). */
export interface PedidoDeReparto {
  readonly hero: string;
  readonly enElHeroe: readonly LineaDelReparto[];
}

/** Lo que haría un reparto: con qué se queda el héroe, lo que deja y lo que recoge. */
interface ElRepartoResuelto {
  readonly ejercito: Army;
  readonly resto: Army;
  readonly deja: Army;
  readonly recoge: Army;
}

/** Los dos lados de `elegidos` (posiciones en `entreLosDos`) y lo que se mueve. */
function resolver(
  state: GameState,
  hero: Hero,
  sitio: Sitio,
  elegidos: ReadonlySet<number>,
): ElRepartoResuelto {
  const todos = entreLosDos(state, hero, sitio);
  const suyos = hero.army.length;
  return {
    ejercito: todos.filter((_, i) => elegidos.has(i)),
    resto: todos.filter((_, i) => !elegidos.has(i)),
    deja: todos.filter((_, i) => i < suyos && !elegidos.has(i)),
    recoge: todos.filter((_, i) => i >= suyos && elegidos.has(i)),
  };
}

/** El reparto que pide `pedido`, resuelto, o por qué no se puede. */
function elRepartoPedido(
  state: GameState,
  player: PlayerId,
  pedido: PedidoDeReparto,
):
  | { readonly motivo: string }
  | (ElRepartoResuelto & { readonly hero: Hero; readonly sitio: Sitio }) {
  const donde = heroeEnSuSitio(state, player, pedido.hero, PARA_LA_TROPA);
  if ('motivo' in donde) return donde;
  const { hero, sitio } = donde;
  const elegidos = elegidosDelReparto(state, hero, sitio, pedido.enElHeroe);
  if ('motivo' in elegidos) return elegidos;
  const r = resolver(state, hero, sitio, elegidos);
  if (!donde.suyo && r.deja.length > 0) return { motivo: soloRecoger(sitio) };
  if (r.deja.length === 0 && r.recoge.length === 0) {
    return {
      motivo: `el reparto no mueve a nadie: ${hero.name} y la guarnición ${delSitio(sitio)} quedan como estaban`,
    };
  }
  const noVale = repartoBlocker(state, hero, sitio, r.ejercito);
  if (noVale !== null) return { motivo: noVale };
  return { ...r, hero, sitio };
}

/**
 * Por qué `player` no puede repartir así la tropa entre su héroe y la guarnición
 * del sitio suyo donde está (`repartir_tropa`), o `null`. **La regla del
 * intercambio de la pantalla** (D9 de la tarea, 04-11-2026: «repartir y
 * confirmar»): juzga **solo el reparto final**, así que con el héroe y la guarnición
 * llenos se puede cambiar un soldado por otro, que de uno en uno (`dejar_tropa`,
 * `recoger_tropa`) desbordaba un lado a mitad de camino. En el orden en que se
 * entiende: quién, dónde, de quién es el sitio, las líneas (`elegidosDelReparto`),
 * que mueva a alguien y los dos cupos (`repartoBlocker`). No mira el turno.
 */
export function repartirTropaBlocker(
  state: GameState,
  player: PlayerId,
  pedido: PedidoDeReparto,
): string | null {
  const r = elRepartoPedido(state, player, pedido);
  return 'motivo' in r ? r.motivo : null;
}

/**
 * Reparte la tropa como pide `pedido`, por `repartir`, o lanza con
 * `repartirTropaBlocker`. Devuelve dónde y qué se movió, por tipo, para el hecho
 * que lo cuenta (uno por reparto, `troops_exchanged`).
 */
export function repartirTropa(
  state: GameState,
  player: PlayerId,
  pedido: PedidoDeReparto,
): {
  readonly hero: Hero;
  readonly sitio: Sitio;
  readonly deja: readonly TropaMovida[];
  readonly recoge: readonly TropaMovida[];
} {
  const r = elRepartoPedido(state, player, pedido);
  if ('motivo' in r) throw new Error(`no se puede repartir la tropa: ${r.motivo}`);
  repartir(state, r.hero, r.sitio, r.ejercito);
  return { hero: r.hero, sitio: r.sitio, deja: porTipo(r.deja), recoge: porTipo(r.recoge) };
}

/** Lo que ocupa un lado del reparto frente a lo que cabe en él. */
export interface LadoDelReparto {
  /** Sus grupos (`troopSummary`): cada uno se puede pasar al otro lado. */
  readonly filas: readonly TroopGroup[];
  readonly liderazgo: number;
  readonly individuos: number;
  readonly tope: number;
  readonly cupo: number;
}

/** El reparto que se edita, como lo lee la pantalla de la guarnición (`elReparto`). */
export interface ElReparto {
  readonly heroe: LadoDelReparto;
  readonly guarnicion: LadoDelReparto;
  /** Si el reparto pedido no es el de ahora. */
  readonly cambia: boolean;
  /** Por qué no se puede confirmar (`repartirTropaBlocker`), o `null`; sin cambios, `null`. */
  readonly motivo: string | null;
}

/**
 * El reparto que se edita en la pantalla de la guarnición: cómo quedarían los dos
 * lados con `lineas` (por defecto, como están), agrupados (`troopSummary`), con lo
 * que ocupa cada uno frente a su cupo, y **el motivo del núcleo** para no
 * confirmarlo. Lo que no cabe a un lado se puede editar si el final cabe: por eso
 * el motivo es del reparto entero y no de cada paso. Si las líneas no valen (no las
 * escribe la pantalla así), los lados son los de ahora y el motivo lo dice.
 */
export function elReparto(
  state: GameState,
  player: PlayerId,
  hero: Hero,
  lineas: readonly LineaDelReparto[] = lineasDelEjercito(hero.army),
): ElReparto {
  const sitio = sitioDelHeroe(state, hero);
  if (sitio === null) {
    throw new Error(`${hero.name} no está en ningún sitio suyo: no hay reparto que editar`);
  }
  const elegidos = elegidosDelReparto(state, hero, sitio, lineas);
  const { ejercito, resto, deja, recoge } = resolver(
    state,
    hero,
    sitio,
    'motivo' in elegidos ? new Set(hero.army.map((_, i) => i)) : elegidos,
  );
  const cambia = deja.length > 0 || recoge.length > 0;
  const lado = (army: Army, cabe: { tope: number; cupo: number }): LadoDelReparto => ({
    filas: troopSummary(army),
    liderazgo: armyLeadership(army),
    individuos: army.length,
    ...cabe,
  });
  return {
    heroe: lado(ejercito, capacidadDe(hero, state.combate.tope)),
    guarnicion: lado(resto, cupoDeLaGuarnicion(state)),
    cambia,
    motivo:
      'motivo' in elegidos
        ? elegidos.motivo
        : cambia
          ? repartirTropaBlocker(state, player, { hero: hero.id, enElHeroe: lineas })
          : null,
  };
}

/**
 * El tipo del veterano `veterano` que hay entre el héroe `heroId` y la guarnición
 * del sitio donde está, o `null` si no está en ninguno de los dos. Lo lee la
 * traducción del agente (`accionDelAgente`), que escribe `creature` además de
 * `veteran`: si no es el suyo, se le dice al traducir.
 */
export function tipoDelVeterano(state: GameState, heroId: string, veterano: string): string | null {
  const hero = state.heroes.find((h) => h.id === heroId);
  if (hero === undefined) return null;
  const sitio = sitioEn(state, hero.at);
  const todos = sitio === null ? hero.army : entreLosDos(state, hero, sitio);
  return todos.find((t) => t.veterania?.id === veterano)?.creature ?? null;
}

/**
 * El sitio **suyo** en el que está `hero`, o `null`: donde se defiende con la
 * guarnición (D1) y donde reparte su tropa. Suyo es que el sitio sea de su bando
 * **o que la guarnición lo sea** (`loSuyoDelSitio`: lo que dejó en un pueblo cuya
 * región cambió de dueño se recoge y defiende con él; dejar más no,
 * `heroeEnSuSitio`). Un héroe en un sitio ajeno sin tropa suya, o en uno de nadie,
 * defiende con su ejército y nada más (tras la muralla del sitio, eso sí:
 * `sitioQueSeDefiende`).
 */
export function sitioDelHeroe(state: GameState, hero: Hero): Sitio | null {
  const sitio = sitioEn(state, hero.at);
  return sitio !== null && loSuyoDelSitio(state, sitio, hero.owner) !== null ? sitio : null;
}

/**
 * La ciudad **de su bando** en la que está `hero`, o `undefined`: donde se licencia
 * tropa y con cuya muralla y moral defiende. Sin la guarnición suya en una ajena:
 * para eso, `sitioDelHeroe`.
 */
export function castilloSuyoDelHeroe(state: GameState, hero: Hero): Town | undefined {
  const town = state.towns.find((t) => t.at.x === hero.at.x && t.at.y === hero.at.y);
  return town !== undefined && dueñoDeLaCiudad(state, town) === hero.owner ? town : undefined;
}

/**
 * El objeto del mapa del sitio: el paso y el pueblo lo son; la ciudad, el `town` de
 * su id. Es donde vive el dueño guardado de un sitio del muro (`tomarElNodo`).
 */
export function objetoDelSitio(state: GameState, sitio: Sitio): ObjetoDeUnSitio {
  switch (sitio.kind) {
    case 'paso':
      return sitio.nodo;
    case 'pueblo':
      return sitio.pueblo;
    case 'ciudad': {
      for (const o of state.map.objects) if (o.kind === 'town' && o.id === sitio.town.id) return o;
      throw new Error(`${sitio.town.name} no tiene objeto en el mapa`);
    }
  }
}

/**
 * Con quién defiende la IA al héroe atacado en su sitio: **lo más fuerte que
 * quepa** en su ejército de entre lo suyo y la guarnición, sin que lo que se quede
 * fuera deje de caber en la guarnición (`repartoBlocker`). Se parte de cómo están
 * (el ejército cabe en el héroe y la guarnición en la suya) y se mejora a pasos: el
 * más fuerte de la guarnición (`unitPower` con su hoja; en un empate, el de antes)
 * entra si cabe, y si no cabe, se cambia por el más flojo del ejército que sea más
 * flojo que él, si el reparto sigue valiendo. Cada paso sube la fuerza de quien
 * pelea, así que acaba.
 *
 * Por qué no un reparto voraz de todo de más fuerte a más flojo: dejaba fuera a
 * cinco flojos y metía tres grandes, y lo de fuera —diez individuos— no cabía en la
 * guarnición: la ciudad, atacada después sin héroe, montaba una batalla con más de
 * siete y `createBattle` lanzaba. Determinista y sin azar: la usan la IA de reglas, el agente (su jugada, a backlog) y la persona
 * como propuesta, que puede rehacer (`elegirLaDefensa`).
 *
 * Devuelve el ejército con que pelea, en el orden en que estaban (el ejército y
 * después la guarnición): el orden es el de despliegue, y elegir no lo baraja.
 */
export function defensaDeLaIA(state: GameState, hero: Hero, sitio: Sitio): Army {
  // Por posición en `todos` y no por identidad: un mismo objeto puede ir dos veces
  // en un ejército (lo que se monta a mano en los tests, sin ir más lejos).
  const todos = entreLosDos(state, hero, sitio);
  const poder = todos.map((t) => unitPower(troopUnit(t)));
  const fuerte = (a: number, b: number): number =>
    (poder[b] as number) - (poder[a] as number) || a - b;
  const vale = (indices: readonly number[]): boolean =>
    repartoBlocker(
      state,
      hero,
      sitio,
      indices.map((i) => todos[i] as Troop),
    ) === null;
  let pelean: number[] = hero.army.map((_, i) => i);
  let fuera: number[] = guarnicionDe(state, sitio).map((_, i) => hero.army.length + i);
  for (let mejora = true; mejora; ) {
    mejora = false;
    for (const r of [...fuera].sort(fuerte)) {
      const sinR = fuera.filter((i) => i !== r);
      if (vale([...pelean, r])) {
        pelean = [...pelean, r];
        fuera = sinR;
        mejora = true;
        break;
      }
      const flojos = pelean
        .filter((c) => (poder[c] as number) < (poder[r] as number))
        .sort((a, b) => fuerte(b, a));
      const c = flojos.find((x) => vale([...pelean.filter((i) => i !== x), r]));
      if (c !== undefined) {
        pelean = [...pelean.filter((i) => i !== c), r];
        fuera = [...sinR, c];
        mejora = true;
        break;
      }
    }
  }
  const elegidos = new Set(pelean);
  return todos.filter((_, i) => elegidos.has(i));
}

/** Una línea de la defensa que pide la persona: cuántos de cada tipo pelean. */
export interface LineaDeDefensa {
  readonly creature: string;
  readonly count: number;
}

/**
 * El ejército con que pelearía `hero` en su sitio con la defensa `pedida`, o por
 * qué no: de cada tipo los `count` **que no se irían**
 * (`licenciar` de los demás: la misma regla de a quién se escoge que dejar y
 * recoger, los de más experiencia y, a igual, los que más llevan puesto) de lo que
 * hay entre su ejército y la guarnición, en el orden en que estaban. No vale pedir
 * más de los que hay, un tipo dos veces, lo que no cabe en su ejército
 * (`troopBlocker`, con su frase de siempre) ni dejar fuera lo que no cabe en la
 * guarnición (`repartoBlocker`).
 */
export function ejercitoDeLaDefensa(
  state: GameState,
  hero: Hero,
  sitio: Sitio,
  pedida: readonly LineaDeDefensa[],
): Army | { readonly motivo: string } {
  // Por posición en `todos`, como `defensaDeLaIA`.
  const todos = entreLosDos(state, hero, sitio);
  const elegidos = new Set<number>();
  let acumulado: Army = [];
  const { tope, cupo } = capacidadDe(hero, state.combate.tope);
  const vistos = new Set<string>();
  for (const { creature, count } of pedida) {
    if (vistos.has(creature)) return { motivo: `«${creature}» va dos veces en la defensa` };
    vistos.add(creature);
    if (!Number.isSafeInteger(count) || count < 0) {
      return { motivo: `son individuos: de cada tipo defienden 0 o más, no ${count}` };
    }
    if (count === 0) continue;
    const especie = unidadDelJuegoSiExiste(creature);
    if (especie === null) return { motivo: `no existe ninguna unidad "${creature}"` };
    const deEse = todos.map((t, i) => ({ t, i })).filter(({ t }) => t.creature === creature);
    if (count > deEse.length) {
      return {
        motivo: `entre ${hero.name} y la guarnición ${delSitio(sitio)} hay ${deEse.length} × ${especie.name}, no ${count}`,
      };
    }
    const caben = troopBlocker(
      acumulado,
      tope,
      cupo,
      creature,
      count,
      `el ejército de ${hero.name}`,
    );
    if (caben !== null) return { motivo: caben };
    // Los que pelean son los que se quedarían si se fueran los demás: `queda` va
    // en el orden de `deEse`, así que se casa con él de izquierda a derecha.
    const { queda } = licenciar(
      deEse.map(({ t }) => t),
      creature,
      deEse.length - count,
    );
    let k = 0;
    for (const { t, i } of deEse) {
      if (queda[k] !== t) continue;
      elegidos.add(i);
      k++;
    }
    acumulado = [...acumulado, ...queda];
  }
  const ejercito = todos.filter((_, i) => elegidos.has(i));
  const noVale = repartoBlocker(state, hero, sitio, ejercito);
  return noVale === null ? ejercito : { motivo: noVale };
}

/** Una fila de la defensa: un tipo, cuántos hay, cuántos pelean y por qué no uno más o uno menos. */
export interface FilaDeLaDefensa {
  readonly creature: string;
  /** Cuántos hay de su tipo entre el ejército y la guarnición. */
  readonly hay: number;
  /** Cuántos pelearían con lo pedido. */
  readonly pelean: number;
  /** Cuántos pelean ahora (la propuesta de la IA, o la última defensa elegida). */
  readonly propuesta: number;
  /** Por qué no cabe uno más (`troopBlocker`): un rechazo. */
  readonly motivoMas: string | null;
  /**
   * Por qué no hay uno más **que no es un rechazo**: ya pelean todos los de su tipo
   * («pelean los 5 × Guardia del bosque que hay»). Solo informa, y la pantalla lo
   * pinta como tal (H5 del QA de la fase 1); el «+» sale apagado con uno o con otro.
   */
  readonly notaMas: string | null;
  readonly motivoMenos: string | null;
}

/** La defensa de `hero` en su sitio con lo pedido, fila a fila y con sus cupos (`laDefensa`). */
export interface LaDefensa {
  readonly filas: readonly FilaDeLaDefensa[];
  /** Lo que ocuparía la defensa pedida. */
  readonly ocupa: { readonly liderazgo: number; readonly individuos: number };
  /** Lo que cabe en su ejército (`capacidadDe`). */
  readonly cabe: { readonly tope: number; readonly cupo: number };
  /** Por qué no se puede defender así (`ejercitoDeLaDefensa`), o `null`. */
  readonly motivo: string | null;
}

/**
 * La defensa que se elige, como la lee su pantalla: de cada tipo (en orden de
 * aparición) cuántos hay, cuántos pelean ahora (`propuesta`, lo que
 * lleva el héroe) y cuántos pelearían con `pedida` (los tipos que no nombra, como
 * ahora), con **el motivo del núcleo** para no subir o bajar uno, lo que ocuparía y
 * por qué no valdría. Todo lo escribe aquí el núcleo: la pantalla solo lo pinta.
 */
export function laDefensa(
  state: GameState,
  hero: Hero,
  sitio: Sitio,
  pedida: readonly LineaDeDefensa[] = [],
): LaDefensa {
  const todos = entreLosDos(state, hero, sitio);
  const tipos: { creature: string; hay: number; propuesta: number }[] = [];
  todos.forEach((t, i) => {
    let fila = tipos.find((f) => f.creature === t.creature);
    if (fila === undefined) {
      fila = { creature: t.creature, hay: 0, propuesta: 0 };
      tipos.push(fila);
    }
    fila.hay++;
    if (i < hero.army.length) fila.propuesta++;
  });
  const lineas: LineaDeDefensa[] = tipos.map((f) => ({
    creature: f.creature,
    count: pedida.find((l) => l.creature === f.creature)?.count ?? f.propuesta,
  }));
  // Lo que ocupa el liderazgo es de la unidad, no del individuo: basta con su tipo.
  const pelearian: Troop[] = lineas.flatMap((l) =>
    Array.from({ length: l.count }, () => ({ creature: l.creature })),
  );
  const cabe = capacidadDe(hero, state.combate.tope);
  const filas = tipos.map((f, n): FilaDeLaDefensa => {
    const pelean = (lineas[n] as LineaDeDefensa).count;
    const nombre = unidadDelJuego(f.creature).name;
    const todos = pelean >= f.hay;
    return {
      creature: f.creature,
      hay: f.hay,
      pelean,
      propuesta: f.propuesta,
      motivoMas: todos
        ? null
        : troopBlocker(
            pelearian,
            cabe.tope,
            cabe.cupo,
            f.creature,
            1,
            `el ejército de ${hero.name}`,
          ),
      notaMas: !todos
        ? null
        : f.hay === 1
          ? `pelea el único ${nombre} que hay`
          : `pelean los ${f.hay} × ${nombre} que hay`,
      motivoMenos: pelean <= 0 ? `ya no pelea ningún ${nombre}` : null,
    };
  });
  const ejercito = ejercitoDeLaDefensa(state, hero, sitio, lineas);
  return {
    filas,
    ocupa: { liderazgo: armyLeadership(pelearian), individuos: pelearian.length },
    cabe,
    motivo: 'motivo' in ejercito ? ejercito.motivo : null,
  };
}
