/**
 * La renta del día: el oro que cobra un jugador al empezar su turno. **Un
 * hecho, un sitio**: lo suman `startTurn`, lo cuentan
 * al agente (`serialize.ts`, `you.income`) y lo enseña la barra (`Session`), y
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
 * Las dos preguntas salen de UNA búsqueda desde la base (la foto de
 * `territorio`), y por eso cortar un nodo se nota en todo lo que colgaba
 * detrás a la vez, sin que nadie tenga que apuntar nada.
 */
import { ECONOMIA } from '../data.js';
import type { GameMap } from '../map/map.js';
import { type Estructura, type Territorio, territorio } from '../map/regiones.js';
import { dailyIncome, type Town } from '../town/town.js';
import type { PlayerId } from '../types.js';

/**
 * La regla del pueblo dicha para la persona y para el agente: la leen la prosa
 * del contrato (`agent.ts`, `serialize.ts`) y el cliente, como `REGLA_DEL_ESCUDO`.
 */
export const REGLA_DEL_PUEBLO = `da ${ECONOMIA.rentaDelPueblo} de oro al día a quien tenga su región unida a su base`;

/** Lo que mira la renta: el mapa, las ciudades y quién juega con qué base. */
interface EstadoConRenta {
  readonly map: GameMap;
  readonly towns: readonly Town[];
  readonly players: readonly { readonly id: PlayerId; readonly base: string | null }[];
}

/** Una ciudad propia en la renta: lo que da hoy y si cobra. */
export interface CiudadDeLaRenta {
  readonly id: string;
  readonly nombre: string;
  /** Lo que da su ayuntamiento si está unida a la base; 0 si no. */
  readonly oro: number;
  /** Si está unida a la base: la que han dejado aislada sigue siendo suya y no cobra. */
  readonly unida: boolean;
}

/** Un pueblo en la renta: uno de una región del jugador unida a su base. */
export interface PuebloDeLaRenta {
  readonly id: string;
  readonly nombre: string;
  readonly oro: number;
}

/** Lo que cobra un jugador hoy, y de dónde sale cada moneda. */
export interface RentaDelDia {
  readonly total: number;
  /** Todas sus ciudades: las que no cobran, con `unida` a `false`. */
  readonly ciudades: readonly CiudadDeLaRenta[];
  /** Los pueblos de sus regiones unidas a la base. */
  readonly pueblos: readonly PuebloDeLaRenta[];
}

type PueblosPorRegion = ReadonlyMap<
  number,
  readonly { readonly id: string; readonly nombre: string }[]
>;

const pueblosCache = new WeakMap<Estructura, PueblosPorRegion>();

/**
 * Los pueblos de cada región de la red, por su índice. Se cuentan una vez por
 * mapa, como la red misma (`estructura`): los pueblos no se mueven ni se toman,
 * y la renta se pide en cada turno y en cada repintado de la barra.
 */
function pueblosPorRegion(map: GameMap, red: Estructura): PueblosPorRegion {
  const hecho = pueblosCache.get(red);
  if (hecho !== undefined) return hecho;
  const porRegion = new Map<number, { id: string; nombre: string }[]>();
  for (const o of map.objects) {
    if (o.kind !== 'village') continue;
    const r = red.regionDe[o.at.y * map.width + o.at.x] ?? -1;
    const lista = porRegion.get(r);
    if (lista === undefined) porRegion.set(r, [{ id: o.id, nombre: o.name }]);
    else lista.push({ id: o.id, nombre: o.name });
  }
  pueblosCache.set(red, porRegion);
  return porRegion;
}

/** Lo que dan al día los pueblos de la región `region` (por su índice en la red). */
export function rentaDeLaRegion(map: GameMap, red: Estructura, region: number): number {
  return (pueblosPorRegion(map, red).get(region)?.length ?? 0) * ECONOMIA.rentaDelPueblo;
}

export function rentaDelDia(
  state: EstadoConRenta,
  jugador: PlayerId,
  foto: Territorio = territorio(state),
): RentaDelDia {
  const conexion = foto.conexion.get(jugador);
  if (conexion === undefined)
    throw new Error(`el jugador ${jugador} no está en la foto del territorio`);
  let total = 0;
  const ciudades: CiudadDeLaRenta[] = [];
  for (const t of state.towns) {
    if (t.owner !== jugador) continue;
    const unida = conexion.nodos.has(t.id);
    const oro = unida ? dailyIncome(t) : 0;
    total += oro;
    ciudades.push({ id: t.id, nombre: t.name, oro, unida });
  }
  const pueblos: PuebloDeLaRenta[] = [];
  for (const [region, lista] of pueblosPorRegion(state.map, foto.red)) {
    if (!conexion.regiones.has(region)) continue;
    for (const p of lista) {
      total += ECONOMIA.rentaDelPueblo;
      pueblos.push({ ...p, oro: ECONOMIA.rentaDelPueblo });
    }
  }
  return { total, ciudades, pueblos };
}
