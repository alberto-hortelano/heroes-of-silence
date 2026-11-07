/**
 * La renta del día: el oro que cobra un jugador al empezar su turno. **Un
 * hecho, un sitio**: lo suman `startTurn`, lo cuentan
 * al agente (`contract/aventura.ts`, `you.income`) y lo enseña la barra (`Session`), y
 * los tres lo leen de aquí.
 *
 * **Lo que está unido a la base, y nada más** (fase 2a; el usuario corrigió el
 * plan: «una región cerrada pero desconectada de la base NO da renta»):
 *
 * - cada ciudad propia unida a la base cobra su ayuntamiento (`dailyIncome`);
 *   la base también, que es la primera de ellas;
 * - cada pueblo cuya región es del jugador y está unida a su base da
 *   `ECONOMIA.rentaDelPueblo` (inventado, 250).
 *
 * Desde la tarea 2 (ciudades y pueblos en su región, 05-11-2026): una ciudad o un
 * pueblo **en el muro** es un nodo y cobra si el nodo está unido a la base; uno
 * **dentro de una región**, si la región lo está. Y **el ocupado no da nada**
 * (`ocupadoBlocker`, P4): sale con oro 0 y la frase de por qué.
 *
 * Las dos preguntas salen de UNA búsqueda desde la base (la foto de
 * `territorio`), y por eso cortar un nodo se nota en todo lo que colgaba
 * detrás a la vez, sin que nadie tenga que apuntar nada.
 */
import { dondeEsta, dueñoEnLaFoto, type Territorio, territorio } from '../map/territorio.js';
import type { Estructura, GameMap, MapObject } from '../map/tipos.js';
import { ECONOMIA } from '../town/economia.js';
import { dailyIncome, type Town } from '../town/town.js';
import type { PlayerId } from '../types.js';
import { ocupadoBlocker, type Sitio, sitioDeLaCiudad, sitioDelObjeto } from './sitios.js';
import type { GameState } from './tipos.js';

/**
 * La regla del pueblo dicha para la persona y para el agente: la leen la prosa
 * del contrato (`formato.ts`, `mapa-conocido.ts` y `peticion-de-mapa.ts`) y el cliente, como `REGLA_DEL_ESCUDO`.
 */
export const REGLA_DEL_PUEBLO = `da ${ECONOMIA.rentaDelPueblo} de oro al día a quien lo tenga unido a su base (dentro de una región, a quien tenga la región), salvo si está ocupado`;

/**
 * Lo que da un sitio al día, sin mirar si está unido a la base ni ocupado: una
 * ciudad, su ayuntamiento (`dailyIncome`); un pueblo, `ECONOMIA.rentaDelPueblo`; un
 * paso, nada. **Un hecho, un sitio**: lo leen la renta del día, la de una región y
 * la IA (`valorDeRecuperar`), que hasta la fase N de la reorganización (07-11-2026)
 * lo escribían cada una.
 */
export function rentaDelSitio(sitio: Sitio): number {
  switch (sitio.kind) {
    case 'ciudad':
      return dailyIncome(sitio.town);
    case 'pueblo':
      return ECONOMIA.rentaDelPueblo;
    case 'paso':
      return 0;
  }
}

/** Una ciudad propia en la renta: lo que da hoy y si cobra. */
export interface CiudadDeLaRenta {
  readonly id: string;
  readonly nombre: string;
  /** Lo que da su ayuntamiento si está unida a la base y no está ocupada; 0 si no. */
  readonly oro: number;
  /** Si está unida a la base: la que han dejado aislada sigue siendo suya y no cobra. */
  readonly unida: boolean;
  /** Por qué no da nada aunque esté unida (`ocupadoBlocker`), o `null`. */
  readonly ocupada: string | null;
}

/**
 * Un pueblo del jugador en la renta. Todos, también el que no cobra: el del muro
 * recién tomado aún sin unir no salía en ningún sitio, y no se sabía por qué no
 * daba oro (vuelta 1 de QA de la tarea 2, H2).
 */
export interface PuebloDeLaRenta {
  readonly id: string;
  readonly nombre: string;
  /** `ECONOMIA.rentaDelPueblo` si está unido a la base y no está ocupado; 0 si no. */
  readonly oro: number;
  /** Si está unido a la base, como `CiudadDeLaRenta.unida`. */
  readonly unido: boolean;
  /** Por qué no da nada aunque esté unido (`ocupadoBlocker`), o `null`. */
  readonly ocupada: string | null;
}

/** Lo que cobra un jugador hoy, y de dónde sale cada moneda. */
export interface RentaDelDia {
  readonly total: number;
  /** Todas sus ciudades: las que no cobran, con `unida` a `false` o `ocupada`. */
  readonly ciudades: readonly CiudadDeLaRenta[];
  /** Todos sus pueblos: los que no cobran, con `unido` a `false` o `ocupada`. */
  readonly pueblos: readonly PuebloDeLaRenta[];
}

type PueblosPorRegion = ReadonlyMap<number, readonly Extract<MapObject, { kind: 'village' }>[]>;

const pueblosCache = new WeakMap<Estructura, PueblosPorRegion>();

/**
 * Los pueblos de dentro de cada región de la red, por su índice. Se cuentan una
 * vez por mapa, como la red misma (`estructura`): los pueblos no se mueven.
 */
function pueblosPorRegion(map: GameMap, red: Estructura): PueblosPorRegion {
  const hecho = pueblosCache.get(red);
  if (hecho !== undefined) return hecho;
  const porRegion = new Map<number, Extract<MapObject, { kind: 'village' }>[]>();
  for (const o of map.objects) {
    if (o.kind !== 'village') continue;
    const r = red.sitiosDeRegion.get(o.id);
    if (r === undefined) continue;
    const lista = porRegion.get(r);
    if (lista === undefined) porRegion.set(r, [o]);
    else lista.push(o);
  }
  pueblosCache.set(red, porRegion);
  return porRegion;
}

/**
 * Lo que dan al día la región `region` (por su índice en la red): sus pueblos y el
 * ayuntamiento de sus ciudades de dentro (tarea 2: la IA valora cerrarla por lo que
 * le daría). Sin mirar la ocupación: es lo que la región vale, no lo que da hoy.
 */
export function rentaDeLaRegion(
  state: { readonly map: GameMap; readonly towns: readonly Town[] },
  red: Estructura,
  region: number,
): number {
  let oro = 0;
  for (const pueblo of pueblosPorRegion(state.map, red).get(region) ?? []) {
    oro += rentaDelSitio({ kind: 'pueblo', pueblo });
  }
  for (const t of state.towns) {
    if (red.sitiosDeRegion.get(t.id) === region) oro += rentaDelSitio(sitioDeLaCiudad(t));
  }
  return oro;
}

export function rentaDelDia(
  state: GameState,
  jugador: PlayerId,
  foto: Territorio = territorio(state),
): RentaDelDia {
  const conexion = foto.conexion.get(jugador);
  if (conexion === undefined)
    throw new Error(`el jugador ${jugador} no está en la foto del territorio`);
  // Unido a la base: el sitio del muro, por su nodo; el de dentro, por su región.
  const unido = (id: string): boolean => {
    const donde = dondeEsta(foto.red, id);
    if (donde === null) return false;
    return donde.en === 'muro' ? conexion.nodos.has(id) : conexion.regiones.has(donde.region);
  };
  let total = 0;
  const ciudades: CiudadDeLaRenta[] = [];
  for (const t of state.towns) {
    if (dueñoEnLaFoto(foto, t.id) !== jugador) continue;
    const unida = unido(t.id);
    const sitio = sitioDeLaCiudad(t);
    const ocupada = ocupadoBlocker(state, sitio, jugador);
    const oro = unida && ocupada === null ? rentaDelSitio(sitio) : 0;
    total += oro;
    ciudades.push({ id: t.id, nombre: t.name, oro, unida, ocupada });
  }
  const pueblos: PuebloDeLaRenta[] = [];
  for (const o of state.map.objects) {
    if (o.kind !== 'village' || dueñoEnLaFoto(foto, o.id) !== jugador) continue;
    const esUnido = unido(o.id);
    const sitio = sitioDelObjeto(state, o);
    const ocupada = ocupadoBlocker(state, sitio, jugador);
    const oro = esUnido && ocupada === null ? rentaDelSitio(sitio) : 0;
    total += oro;
    pueblos.push({ id: o.id, nombre: o.name, oro, unido: esUnido, ocupada });
  }
  return { total, ciudades, pueblos };
}
