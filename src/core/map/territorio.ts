/**
 * De quién es cada cosa de la red: el dueño de cada nodo (el de su objeto del
 * mapa, `owner`, que solo escribe `tomarElNodo`), el de cada región (el común de
 * sus nodos), el de cada sitio y dónde está (en el muro o dentro de una región,
 * `dondeEsta`), y lo que cada jugador tiene unido a su base (`territorio`). Nada
 * se guarda: sale de la red (`regiones.ts`) y de los dueños de los nodos, cada
 * vez que se pregunta.
 *
 * Era la sección de los dueños de `regiones.ts` hasta la fase N de la
 * reorganización (07-11-2026).
 */
import type { PlayerId } from '../types.js';
import { estructura, type MapaDeRed } from './regiones.js';
import type { Estructura, GameMap, MapObject, NodoDeRed } from './tipos.js';

/**
 * Lo que hace falta de una partida para saber de quién es cada cosa: el mapa (el
 * dueño de cada nodo vive en su objeto) y quién juega con qué base.
 */
interface EstadoDeRed {
  readonly map: GameMap;
  readonly players: readonly { readonly id: PlayerId; readonly base: string | null }[];
}

/** Lo que un jugador tiene unido a su base: regiones por índice y nodos por id. */
interface Conexion {
  readonly regiones: ReadonlySet<number>;
  readonly nodos: ReadonlySet<string>;
}

/**
 * **La foto del territorio**: de quién es cada nodo, de quién cada región y qué
 * tiene cada jugador unido a su base. Todo derivado, nada guardado.
 *
 * Una sola foto y no tres preguntas sueltas porque las tres salen de lo mismo
 * —los dueños de los nodos— y la renta, la IA y los tests las piden juntas:
 * preguntarlas por separado era leer los dueños tres veces y escribir la regla
 * de «región tuya» en dos sitios (aquí y en la IA). Se saca cuando hace falta
 * y se tira: el primer nodo que cambie de dueño la deja vieja.
 */
export interface Territorio {
  readonly red: Estructura;
  /** El dueño de cada nodo, por índice en `red.nodos`. */
  readonly dueñoDeNodo: readonly (PlayerId | null)[];
  /** El dueño de cada región, por índice en `red.regiones`: el común de todos sus nodos. */
  readonly dueñoDeRegion: readonly (PlayerId | null)[];
  /** Lo unido a su base, de cada jugador. */
  readonly conexion: ReadonlyMap<PlayerId, Conexion>;
}

export function territorio(state: EstadoDeRed): Territorio {
  const red = estructura(state.map);
  const { dueñoDeNodo, dueñoDeRegion } = dueñosDe(state, red);
  const conexion = new Map<PlayerId, Conexion>();
  for (const p of state.players) {
    conexion.set(p.id, conexionDe(red, dueñoDeNodo, dueñoDeRegion, p.id, p.base));
  }
  return { red, dueñoDeNodo, dueñoDeRegion, conexion };
}

/** El dueño de cada nodo y el de cada región: lo de `territorio` sin lo unido a cada base. */
function dueñosDe(
  state: Pick<EstadoDeRed, 'map'>,
  red: Estructura,
): { dueñoDeNodo: (PlayerId | null)[]; dueñoDeRegion: (PlayerId | null)[] } {
  const dueñoDeNodo = dueñosDeNodos(state, red);
  return {
    dueñoDeNodo,
    dueñoDeRegion: red.regiones.map((reg) => dueñoComun(reg.nodos, dueñoDeNodo, null)),
  };
}

/** Los dueños de una foto sin lo unido a cada base: lo que lee `dueñoEnLaFoto`. */
type DueñosDeLaRed = Pick<Territorio, 'red' | 'dueñoDeNodo' | 'dueñoDeRegion'>;

/**
 * De quién es cada nodo y cada región, en una pasada y sin buscar lo unido a cada
 * base, que es lo que cuesta de `territorio`: para quien pregunta el dueño de
 * todos los sitios a la vez (la crónica de los sitios, el cable del espectador).
 */
export function dueñosDeLaRed(state: Pick<EstadoDeRed, 'map'>): DueñosDeLaRed {
  const red = estructura(state.map);
  return { red, ...dueñosDe(state, red) };
}

/**
 * El dueño de cada región, por su índice en `map.regions`: `territorio` sin
 * buscar lo unido a cada base, que es lo que cuesta. Lo lee el clima (la noche
 * va con la facción del dueño de cada región).
 */
export function dueñosDeLasRegiones(state: Pick<EstadoDeRed, 'map'>): readonly (PlayerId | null)[] {
  return dueñosDe(state, estructura(state.map)).dueñoDeRegion;
}

/**
 * El dueño de la región `k` (su índice en `map.regions`), preguntando solo por
 * sus nodos: lo que mira una sola región (`regionOwner`, el dueño de un sitio de
 * dentro de ella) sin hacer la foto entera. La misma regla, `dueñoComun`.
 */
function dueñoDeLaRegion(state: Pick<EstadoDeRed, 'map'>, k: number): PlayerId | null {
  const red = estructura(state.map);
  const reg = red.regiones[k];
  if (reg === undefined) {
    throw new Error(`este mapa no tiene región ${k}: tiene ${red.regiones.length}`);
  }
  const dueños: (PlayerId | null)[] = [];
  for (const n of reg.nodos) dueños[n] = dueñoDelNodo(state, red.nodos[n] as NodoDeRed);
  return dueñoComun(reg.nodos, dueños, null);
}

type ObjetoConDueño = Extract<MapObject, { readonly kind: 'node' | 'town' | 'village' }>;

const objetosConDueño = new WeakMap<readonly MapObject[], Map<string, ObjetoConDueño>>();

/**
 * El objeto del mapa de id `id` que guarda un dueño (un paso, una ciudad o un
 * pueblo), por un índice hecho una vez por lista de objetos: el dueño de una
 * ciudad se pregunta en cada hecho de la crónica (`visibleNowAt`), y buscarlo con
 * un `find` por todo el mapa cada vez se notaba en el banco.
 */
function objetoConDueño(map: Pick<MapaDeRed, 'objects'>, id: string): ObjetoConDueño | undefined {
  let indice = objetosConDueño.get(map.objects);
  if (indice === undefined || !indice.has(id)) {
    indice = new Map();
    for (const o of map.objects)
      if (o.kind === 'node' || o.kind === 'town' || o.kind === 'village') indice.set(o.id, o);
    objetosConDueño.set(map.objects, indice);
  }
  return indice.get(id);
}

/** El dueño de un nodo, preguntado a donde vive: como `dueñosDeNodos`, de uno solo. */
function dueñoDelNodo(state: Pick<EstadoDeRed, 'map'>, n: NodoDeRed): PlayerId | null {
  const o = objetoConDueño(state.map, n.id);
  if (o === undefined) throw new Error(`el nodo ${n.id} no tiene dueño que leer`);
  return o.owner;
}

/**
 * El dueño de cada nodo, preguntado a donde vive: su objeto del mapa (el paso, la
 * ciudad o el pueblo en el muro), que solo escribe `tomarElNodo`. Por el índice
 * de `objetoConDueño`: preguntarlo nodo a nodo con un `find` era cuadrático.
 */
function dueñosDeNodos(state: Pick<EstadoDeRed, 'map'>, red: Estructura): (PlayerId | null)[] {
  return red.nodos.map((n) => dueñoDelNodo(state, n));
}

/**
 * **De quién es una ciudad o un pueblo** (o un paso), por el id de su objeto: la
 * regla del sitio, una vez (ciudades y pueblos en su región, 05-11-2026). En el
 * muro (un nodo), su objeto del mapa, que se toma como un paso (`tomarElNodo`);
 * dentro de una región, el de su región (`dueñoDeLaRegion`), que no se guarda. En
 * un mapa sin regiones no hay en qué estar dentro: un pueblo no es de nadie.
 * Lo pregunta `dueñoDelSitio` (`state/sitios.ts`); con la foto hecha, la misma
 * regla es `dueñoEnLaFoto`.
 */
export function dueñoDeUnSitio(state: Pick<EstadoDeRed, 'map'>, id: string): PlayerId | null {
  const red = estructura(state.map);
  const donde = dondeEsta(red, id);
  if (donde?.en === 'muro') return dueñoDelNodo(state, red.nodos[donde.nodo] as NodoDeRed);
  if (donde?.en === 'region') return dueñoDeLaRegion(state, donde.region);
  return sinSitio(red, id);
}

/** `dueñoDeUnSitio` sobre la foto ya hecha (`territorio`): la misma regla, sin volver a preguntar. */
export function dueñoEnLaFoto(t: DueñosDeLaRed, id: string): PlayerId | null {
  const donde = dondeEsta(t.red, id);
  if (donde?.en === 'muro') return t.dueñoDeNodo[donde.nodo] ?? null;
  if (donde?.en === 'region') return t.dueñoDeRegion[donde.region] ?? null;
  return sinSitio(t.red, id);
}

/**
 * El dueño de lo que no es un sitio de la red: en un mapa sin regiones no hay en
 * qué estar dentro y un pueblo no es de nadie; con ellas, un id así es un fallo.
 */
function sinSitio(red: Estructura, id: string): null {
  if (red.regiones.length === 0) return null;
  throw new Error(
    `"${id}" no es ningún sitio de la red: ni nodo, ni ciudad o pueblo de una región`,
  );
}

/**
 * **Dónde está un sitio de la red** por el id de su objeto: en el muro (`nodo`, su
 * índice en `red.nodos`) o dentro de una región (`region`, su índice); `null` si
 * no es ninguna de las dos (un id que no es un sitio, o un mapa sin regiones).
 * Es la única bifurcación «nodo o región»: la leen el dueño, la renta, la
 * lectura para el motor y la validación de los pueblos.
 */
type DondeEsta =
  | { readonly en: 'muro'; readonly nodo: number }
  | { readonly en: 'region'; readonly region: number };

export function dondeEsta(red: Estructura, id: string): DondeEsta | null {
  const nodo = red.nodoPorId.get(id);
  if (nodo !== undefined) return { en: 'muro', nodo };
  const region = red.sitiosDeRegion.get(id);
  return region === undefined ? null : { en: 'region', region };
}

/** Las regiones que toca un sitio (`dondeEsta`): las de su nodo, o la suya. Vacío si no es un sitio. */
export function regionesDelSitio(red: Estructura, id: string): readonly number[] {
  const donde = dondeEsta(red, id);
  if (donde === null) return [];
  return donde.en === 'muro' ? (red.nodos[donde.nodo] as NodoDeRed).regiones : [donde.region];
}

/** Si el sitio de id `id` está en un nodo (en el muro, entre regiones): se toma como un paso. */
export function sitioEnUnNodo(map: MapaDeRed, id: string): boolean {
  return estructura(map).nodoPorId.has(id);
}

/**
 * **La regla de «región tuya»**, y el único sitio donde se escribe: el dueño
 * común de todos sus nodos, o `null`. `siTomo` pregunta lo mismo como si ese
 * nodo ya fuera de ese jugador, que es lo que quiere saber la IA antes de ir.
 */
function dueñoComun(
  nodos: readonly number[],
  dueños: readonly (PlayerId | null)[],
  siTomo: { readonly nodo: number; readonly dueño: PlayerId } | null,
): PlayerId | null {
  let comun: PlayerId | null = null;
  for (const n of nodos) {
    const d = n === siTomo?.nodo ? siTomo.dueño : (dueños[n] ?? null);
    if (d === null) return null;
    if (comun === null) comun = d;
    else if (comun !== d) return null;
  }
  return comun;
}

/**
 * Todo lo que un jugador tiene **unido a su base** por una cadena de regiones
 * propias y nodos propios. Una búsqueda en anchura desde la base, que es un
 * nodo: de un nodo se pasa a cada región que toca **si es suya** (todos sus
 * nodos son suyos), y de una región a todos sus nodos, que lo son por eso.
 *
 * Sin base —no la tuvo o la ha perdido— no hay nada conectado. Cortar un nodo
 * hace que la región que cerraba deje de ser suya, y con ella se cae todo lo
 * que colgaba detrás: es la regla que el usuario fijó («cortar un nodo
 * desconecta lo que hay detrás»).
 */
function conexionDe(
  red: Estructura,
  dueñoDeNodo: readonly (PlayerId | null)[],
  dueñoDeRegion: readonly (PlayerId | null)[],
  player: PlayerId,
  baseId: string | null,
): Conexion {
  const regiones = new Set<number>();
  const nodos = new Set<string>();
  if (baseId === null) return { regiones, nodos };
  const base = red.nodoPorId.get(baseId);
  if (base === undefined || dueñoDeNodo[base] !== player) return { regiones, nodos };

  const cola = [base];
  nodos.add(baseId);
  for (let q = 0; q < cola.length; q++) {
    const n = red.nodos[cola[q] as number] as NodoDeRed;
    for (const reg of n.regiones) {
      if (regiones.has(reg) || dueñoDeRegion[reg] !== player) continue;
      regiones.add(reg);
      for (const otro of red.regiones[reg]?.nodos ?? []) {
        const id = red.nodos[otro]?.id as string;
        if (nodos.has(id)) continue;
        nodos.add(id);
        cola.push(otro);
      }
    }
  }
  return { regiones, nodos };
}

/**
 * Las regiones que serían de `player` si tomara este nodo, por su índice en la
 * red: las suyas cuyos demás nodos ya son todos de él. Pregunta a `dueñoComun`
 * como si el nodo ya fuera suyo, en vez de reescribir la regla de «región tuya»
 * en la IA, que las valora por lo que da cada una (`rentaDeLaRegion`).
 */
export function regionesQueCierra(t: Territorio, nodoId: string, player: PlayerId): number[] {
  const k = t.red.nodoPorId.get(nodoId);
  if (k === undefined) throw new Error(`el nodo ${nodoId} no está en la red del mapa`);
  const cerradas: number[] = [];
  for (const r of t.red.nodos[k]?.regiones ?? []) {
    const nodos = t.red.regiones[r]?.nodos ?? [];
    if (dueñoComun(nodos, t.dueñoDeNodo, { nodo: k, dueño: player }) === player) cerradas.push(r);
  }
  return cerradas;
}

/**
 * El dueño de una región: el dueño común de **todos** los nodos que la rodean,
 * ciudades incluidas, o `null` si no hay uno. Pregunta solo por los suyos
 * (`dueñoDeLaRegion`): la foto entera (`territorio`) busca además lo unido a
 * cada base, y aquí no hace falta.
 */
export function regionOwner(state: Pick<EstadoDeRed, 'map'>, regionId: string): PlayerId | null {
  const k = estructura(state.map).regionPorId.get(regionId);
  if (k === undefined) throw new Error(`la región "${regionId}" no existe en este mapa`);
  return dueñoDeLaRegion(state, k);
}

/**
 * Si una región o un nodo de `player` está unido a su base. Se calcula, no se
 * guarda: perder un nodo lo cambia todo detrás sin que nadie tenga que
 * acordarse de apuntarlo. Sale de la foto (`territorio`).
 */
export function conectadoABase(
  state: EstadoDeRed,
  player: PlayerId,
  que: { readonly region: string } | { readonly nodo: string },
): boolean {
  const t = territorio(state);
  const conexion = t.conexion.get(player);
  if (conexion === undefined) throw new Error(`jugador desconocido: ${player}`);
  if ('nodo' in que) return conexion.nodos.has(que.nodo);
  const k = t.red.regionPorId.get(que.region);
  if (k === undefined) throw new Error(`la región "${que.region}" no existe en este mapa`);
  return conexion.regiones.has(k);
}
