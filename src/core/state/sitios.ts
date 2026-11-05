/**
 * Los sitios donde se deja tropa y donde se defiende: una ciudad, un paso (un nodo
 * de la red que no es ciudad) y un pueblo (tarea del puesto fronterizo, fase 1,
 * 04-11-2026; `docs/agents/2026-11-04-puesto-fronterizo/`).
 *
 * Aquí viven tres cosas que antes no existían o estaban sueltas:
 *
 *  - **qué sitio hay en una casilla** y de quién es (`sitioEn`, `dueñoDelSitio`);
 *  - **la guarnición de cada sitio** (`guarnicionDe`): la de una ciudad sigue en
 *    `Town.garrison`; la de un paso o un pueblo, en `GameState.guarniciones`, por id
 *    del objeto del mapa, con quien la dejó. **Este módulo es el único que escribe
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
 *    (`murallaDelMapaBlocker`): una forma rota no llega a ninguna partida.
 *
 * No importa nada de `game.ts` salvo tipos: `game.ts` lo importa a él. De
 * `asaltantes.ts`, la región de una casilla (`regionDeCasilla`), que no importa
 * este módulo.
 */
import sitiosJson from '../../../data/sitios.json' with { type: 'json' };
import { unitPower } from '../ai/fuerza.js';
import {
  type MurallaDeBatalla,
  murallaDelMapaBlocker,
  SIN_MURALLA,
  validarMuralla,
} from '../battle/muralla.js';
import { unidadDelJuego, unidadDelJuegoSiExiste } from '../catalogo.js';
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
import type { MapObject } from '../map/map.js';
import { dueñoDeLaRegion } from '../map/regiones.js';
import { CHARACTER_BODY } from '../rpg/character.js';
import type { Town } from '../town/town.js';
import type { Army, PlayerId, Point, Troop } from '../types.js';
import { problemasDeObjeto } from '../validar.js';
import { regionDeCasilla } from './asaltantes.js';
import type { AdventureAction, GameState } from './game.js';

/** La tropa que guarda un paso o un pueblo, y de quién es: quien la dejó. */
export interface Guarnicion {
  readonly dueño: PlayerId;
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
  const town = state.towns.find((t) => t.id === id);
  if (town !== undefined) return { kind: 'ciudad', town };
  const o = state.map.objects.find((x) => x.id === id);
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
 * De quién es el sitio: la ciudad, de `Town.owner`; el paso, de `node.owner` (lo
 * escribe `captureNode`); el pueblo, **de quien lo guarda** si tiene guarnición, y
 * si no, de quien tenga su región (`dueñoDeLaRegion`, la regla de su renta).
 *
 * Quien guarda un pueblo manda sobre la región porque es lo que decide la batalla:
 * una guarnición ajena se pelea aunque la región sea tuya (`enemyAt`). Hoy no se
 * llega a eso —dejarla exige que el sitio sea de quien la deja, y nadie la deja en
 * un pueblo pisado por otro—, pero un nodo que cambia de dueño después cambia la
 * región sin tocar la tropa, y la tropa no cambia de bando por eso.
 */
export function dueñoDelSitio(state: GameState, sitio: Sitio): PlayerId | null {
  switch (sitio.kind) {
    case 'ciudad':
      return sitio.town.owner;
    case 'paso':
      return sitio.nodo.owner;
    case 'pueblo': {
      const guardada = state.guarniciones[sitio.pueblo.id];
      if (guardada !== undefined) return guardada.dueño;
      const region = regionDeCasilla(state.map, sitio.pueblo.at);
      return region < 0 ? null : dueñoDeLaRegion(state, region);
    }
  }
}

/**
 * Los sitios que se defienden tras una muralla del mapa, que son las claves de
 * `data/sitios.json`: cada uno con su forma y su material. El paso no la lleva (sus
 * mejoras, la fase 3, tendrán la suya aquí).
 */
const SITIOS_CON_MURALLA = ['ciudad', 'pueblo'] as const satisfies readonly Sitio['kind'][];
type SitioConMuralla = (typeof SITIOS_CON_MURALLA)[number];

/**
 * Las murallas del mapa de `valor` (lo que trae `data/sitios.json`), una por sitio
 * que la lleva, o lanza nombrando el fichero con la primera que no vale: que sea
 * una muralla (`validarMuralla`) y que valga para el mapa (`murallaDelMapaBlocker`).
 * Exportada para que el test de datos le dé formas rotas a propósito; el juego la
 * llama una vez, al cargar (`MURALLAS_DEL_MAPA`).
 */
export function leerMurallasDelMapa(
  valor: unknown,
  fichero = 'data/sitios.json',
): Readonly<Record<SitioConMuralla, MurallaDeBatalla>> {
  const [enLaRaiz] = problemasDeObjeto(valor, ['_comment', 'murallas'], ['murallas']);
  if (enLaRaiz !== undefined) throw new Error(`${fichero}: ${enLaRaiz}`);
  const murallas = (valor as { readonly murallas: unknown }).murallas;
  const [enLasMurallas] = problemasDeObjeto(murallas, SITIOS_CON_MURALLA, SITIOS_CON_MURALLA);
  if (enLasMurallas !== undefined) throw new Error(`${fichero}: «murallas»: ${enLasMurallas}`);
  const leidas = {} as Record<SitioConMuralla, MurallaDeBatalla>;
  for (const sitio of SITIOS_CON_MURALLA) {
    const quien = `${fichero}: la muralla ${DEL_SITIO[sitio]}`;
    let m: MurallaDeBatalla;
    try {
      m = validarMuralla((murallas as Record<SitioConMuralla, unknown>)[sitio]);
    } catch (err) {
      throw new Error(`${quien}: ${err instanceof Error ? err.message : String(err)}`);
    }
    const motivo = murallaDelMapaBlocker(m);
    if (motivo !== null) throw new Error(`${quien} no vale: ${motivo}`);
    leidas[sitio] = m;
  }
  return Object.freeze(leidas);
}

/** «de la ciudad», «del pueblo»: cómo se dice de qué sitio es una muralla. */
const DEL_SITIO: Readonly<Record<SitioConMuralla, string>> = {
  ciudad: 'de la ciudad',
  pueblo: 'del pueblo',
};

/** Las de la partida: la de las ciudades y la de los pueblos. */
export const MURALLAS_DEL_MAPA = leerMurallasDelMapa(sitiosJson);

/**
 * Con qué muralla se pelea en el sitio `sitio` quien lo defiende (D3, D7): una
 * ciudad —también la base y la neutral— y un pueblo, la suya de `data/sitios.json`
 * (`MURALLAS_DEL_MAPA`); un paso, ninguna. Sin sitio (un monstruo, un grupo de
 * asaltantes, un lugar, un héroe fuera de un sitio suyo), ninguna. Lo pregunta
 * `montarLaBatalla`, que con muralla da escalera al atacante (`alAsalto`). Recibe la
 * partida aunque hoy no la lea: la mejora de un paso (la fase 3) es de la partida.
 */
export function murallaDelSitio(_state: GameState, sitio: Sitio | null): MurallaDeBatalla {
  if (sitio === null) return SIN_MURALLA;
  switch (sitio.kind) {
    case 'ciudad':
    case 'pueblo':
      return MURALLAS_DEL_MAPA[sitio.kind];
    case 'paso':
      return SIN_MURALLA;
  }
}

/** La tropa que guarda el sitio (vacía si no guarda nada). */
export function guarnicionDe(state: GameState, sitio: Sitio): Army {
  if (sitio.kind === 'ciudad') return sitio.town.garrison;
  return state.guarniciones[idDelSitio(sitio)]?.tropa ?? [];
}

/**
 * La guarnición del paso o del pueblo (el sitio o su id) **si es hostil para
 * `player`**: tiene tropa y no es suya. Es lo que no se cruza y se pelea al pisarlo
 * (`enemyAt`, `casillasHostiles`, `queLoCierra`) y lo que la IA mide antes de ir
 * (`objectValue`): una regla, leída por los cuatro. La de una ciudad no pasa por
 * aquí (no tiene entrada en `guarniciones`, así que da `null`): sigue su camino de
 * siempre, `Town.garrison` con `Town.owner`, que la IA mide con su propio margen.
 */
export function guarnicionHostil(
  state: GameState,
  sitio: Sitio | string,
  player: PlayerId,
): Guarnicion | null {
  const g = state.guarniciones[typeof sitio === 'string' ? sitio : idDelSitio(sitio)];
  return g !== undefined && g.dueño !== player && g.tropa.length > 0 ? g : null;
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
 * Escribe la guarnición del sitio. La de una ciudad es `Town.garrison`; la de un
 * paso o un pueblo, su entrada de `guarniciones`, que se borra si queda vacía (sin
 * entrada = sin guarnición, y así un pueblo vacío vuelve a ser de su región).
 */
export function ponerLaGuarnicion(
  state: GameState,
  sitio: Sitio,
  dueño: PlayerId,
  tropa: Army,
): void {
  if (sitio.kind === 'ciudad') {
    sitio.town.garrison = tropa;
    return;
  }
  const id = idDelSitio(sitio);
  if (tropa.length === 0) delete state.guarniciones[id];
  else state.guarniciones[id] = { dueño, tropa };
}

/**
 * La guarnición del paso o pueblo `id` se pierde: el paso cambia de dueño
 * (`captureNode`) o quien la guardaba pierde la batalla. Lo no elegido para la
 * defensa se pierde con el sitio (D1 de la tarea).
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

/**
 * Juzga el pedido y, si se puede, dice cómo queda el héroe: la regla de
 * `intercambioBlocker` y lo que aplica `moverTropa`, una vez, para que lo que se
 * juzga y lo que se mueve no puedan contarse distinto.
 */
/**
 * El héroe `heroId` de `player` y el sitio suyo donde está, o por qué no: lo
 * primero que preguntan dejar, recoger y repartir, en ese orden (quién, dónde, de
 * quién es el sitio).
 */
function heroeEnSuSitio(
  state: GameState,
  player: PlayerId,
  heroId: string,
): { readonly hero: Hero; readonly sitio: Sitio } | { readonly motivo: string } {
  const hero = state.heroes.find((h) => h.id === heroId);
  if (hero === undefined) return { motivo: `no existe ningún héroe "${heroId}"` };
  if (hero.owner !== player) return { motivo: `${hero.name} no es de tu bando` };
  const sitio = sitioEn(state, hero.at);
  if (sitio === null) {
    return {
      motivo: `${hero.name} no está en ninguna ciudad, paso ni pueblo: la tropa se deja y se recoge en un sitio tuyo`,
    };
  }
  if (dueñoDelSitio(state, sitio) !== player)
    return { motivo: `${nombreDelSitio(sitio)} no es tuyo` };
  return { hero, sitio };
}

function elIntercambio(
  state: GameState,
  player: PlayerId,
  que: Intercambio,
  pedido: PedidoDeTropa,
): ElIntercambio {
  const donde = heroeEnSuSitio(state, player, pedido.hero);
  if ('motivo' in donde) return donde;
  const { hero, sitio } = donde;
  if ('count' in pedido && (!Number.isSafeInteger(pedido.count) || pedido.count < 1)) {
    return { motivo: `son individuos: se mueven de 1 en adelante, no ${pedido.count}` };
  }
  const deja = que === 'dejar_tropa';
  const origen = deja ? hero.army : guarnicionDe(state, sitio);
  const destino = deja ? guarnicionDe(state, sitio) : hero.army;
  const quienOrigen = deja ? hero.name : `la guarnición ${delSitio(sitio)}`;
  const quienDestino = deja ? `la guarnición ${delSitio(sitio)}` : 'el ejército';

  let movidos: Troop[];
  if ('veterano' in pedido) {
    const v = origen.find((t) => t.veterania?.id === pedido.veterano);
    if (v === undefined)
      return { motivo: `${quienOrigen} no lleva al veterano "${pedido.veterano}"` };
    if (v.member !== undefined) {
      return { motivo: 'un personaje no se deja en una guarnición: va siempre con su héroe' };
    }
    movidos = [v];
  } else {
    if (pedido.creature === CHARACTER_BODY) {
      return { motivo: 'un personaje no se deja en una guarnición: va siempre con su héroe' };
    }
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
 * Las líneas que describen `army` tal cual (los personajes no: van siempre con su
 * héroe): de donde parte la pantalla de la guarnición, que las edita.
 */
export function lineasDelEjercito(army: Army): LineaDelReparto[] {
  const lineas: LineaDelReparto[] = [];
  const novatos = new Map<string, number>();
  for (const t of army) {
    if (t.member !== undefined) continue;
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
 * que no nombran, quedan en la guarnición; los personajes van siempre con él. De
 * cada tipo, los novatos que ya llevaba primero (son iguales: así no se mueve a nadie
 * de más). No vale nombrar dos veces un tipo o un veterano, un personaje, un tipo que
 * no existe ni más novatos de los que hay. Los cupos no los mira: eso es del reparto
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
  todos.forEach((t, i) => {
    if (t.member !== undefined) elegidos.add(i);
  });
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
      if (todos[i]?.member !== undefined) {
        return { motivo: 'un personaje no se reparte: va siempre con su héroe' };
      }
      elegidos.add(i);
      continue;
    }
    const { creature, count } = linea;
    if (creature === CHARACTER_BODY) {
      return { motivo: 'un personaje no se reparte: va siempre con su héroe' };
    }
    if (vistos.has(`c:${creature}`)) return { motivo: `«${creature}» va dos veces en el reparto` };
    vistos.add(`c:${creature}`);
    if (!Number.isSafeInteger(count) || count < 0) {
      return { motivo: `son individuos: de cada tipo van con el héroe 0 o más, no ${count}` };
    }
    const especie = unidadDelJuegoSiExiste(creature);
    if (especie === null) return { motivo: `no existe ninguna unidad "${creature}"` };
    const novatos = todos
      .map((t, i) => ({ t, i }))
      .filter(
        ({ t }) => t.creature === creature && t.member === undefined && t.veterania === undefined,
      );
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
  const donde = heroeEnSuSitio(state, player, pedido.hero);
  if ('motivo' in donde) return donde;
  const { hero, sitio } = donde;
  const elegidos = elegidosDelReparto(state, hero, sitio, pedido.enElHeroe);
  if ('motivo' in elegidos) return elegidos;
  const r = resolver(state, hero, sitio, elegidos);
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

/** Un grupo de un lado del reparto y por qué no se pasa al otro (un personaje), o `null`. */
export interface FilaDelReparto {
  readonly grupo: TroopGroup;
  readonly motivo: string | null;
}

/** Lo que ocupa un lado del reparto frente a lo que cabe en él. */
export interface LadoDelReparto {
  readonly filas: readonly FilaDelReparto[];
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
 * el motivo es del reparto entero y no de cada paso; el único paso que no se da es
 * pasar un personaje a la guarnición. Si las líneas no valen (no las escribe la
 * pantalla así), los lados son los de ahora y el motivo lo dice.
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
  const lado = (
    army: Army,
    cabe: { tope: number; cupo: number },
    conElHeroe: boolean,
  ): LadoDelReparto => ({
    filas: troopSummary(army, state.characters).map((grupo) => ({
      grupo,
      motivo:
        conElHeroe && grupo.member !== undefined
          ? 'un personaje no se deja en una guarnición: va siempre con su héroe'
          : null,
    })),
    liderazgo: armyLeadership(army),
    individuos: army.length,
    ...cabe,
  });
  return {
    heroe: lado(ejercito, capacidadDe(hero, state.combate.tope), true),
    guarnicion: lado(resto, cupoDeLaGuarnicion(state), false),
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
 * guarnición (D1). Un héroe en un pueblo de una región ajena, o en un sitio de
 * nadie, defiende con su ejército y nada más.
 */
export function sitioDelHeroe(state: GameState, hero: Hero): Sitio | null {
  const sitio = sitioEn(state, hero.at);
  return sitio !== null && dueñoDelSitio(state, sitio) === hero.owner ? sitio : null;
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
 * siete y `createBattle` lanzaba. Los personajes van siempre con él. Determinista y
 * sin azar: la usan la IA de reglas, el agente (su jugada, a backlog) y la persona
 * como propuesta, que puede rehacer (`elegirLaDefensa`).
 *
 * Devuelve el ejército con que pelea, en el orden en que estaban (el ejército y
 * después la guarnición): el orden es el de despliegue, y elegir no lo baraja.
 */
export function defensaDeLaIA(state: GameState, hero: Hero, sitio: Sitio): Army {
  // Por posición en `todos` y no por identidad: un mismo objeto puede ir dos veces
  // en un ejército (lo que se monta a mano en los tests, sin ir más lejos).
  const todos = entreLosDos(state, hero, sitio);
  const poder = todos.map((t) => unitPower(troopUnit(t, state.characters)));
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
        .filter(
          (c) => todos[c]?.member === undefined && (poder[c] as number) < (poder[r] as number),
        )
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
 * qué no: los personajes siempre, y de cada tipo los `count` **que no se irían**
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
  todos.forEach((t, i) => {
    if (t.member !== undefined) elegidos.add(i);
  });
  let acumulado: Army = todos.filter((_, i) => elegidos.has(i));
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
    const deEse = todos
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.creature === creature && t.member === undefined);
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
  /** Cuántos personajes van siempre con él. */
  readonly personajes: number;
  /** Lo que ocuparía la defensa pedida, con los personajes. */
  readonly ocupa: { readonly liderazgo: number; readonly individuos: number };
  /** Lo que cabe en su ejército (`capacidadDe`). */
  readonly cabe: { readonly tope: number; readonly cupo: number };
  /** Por qué no se puede defender así (`ejercitoDeLaDefensa`), o `null`. */
  readonly motivo: string | null;
}

/**
 * La defensa que se elige, como la lee su pantalla: de cada tipo (sin personajes,
 * en orden de aparición) cuántos hay, cuántos pelean ahora (`propuesta`, lo que
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
  const personajes: Troop[] = todos.filter((t) => t.member !== undefined);
  const tipos: { creature: string; hay: number; propuesta: number }[] = [];
  todos.forEach((t, i) => {
    if (t.member !== undefined) return;
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
  const pelearian: Troop[] = [
    ...personajes,
    ...lineas.flatMap((l) => Array.from({ length: l.count }, () => ({ creature: l.creature }))),
  ];
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
    personajes: personajes.length,
    ocupa: { liderazgo: armyLeadership(pelearian), individuos: pelearian.length },
    cabe,
    motivo: 'motivo' in ejercito ? ejercito.motivo : null,
  };
}
