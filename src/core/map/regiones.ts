/**
 * El mapa como red: regiones encerradas por terreno infranqueable y nodos que
 * son los únicos pasos entre ellas (fase 2 de NuevaJugabilidad).
 *
 * **Nada de esto se guarda**: se deriva del terreno y de los objetos del mapa.
 * Una región es la componente 8-conexa de lo pisable *sin los nodos* que
 * contiene la casilla que la declara (`GameMap.regions`); un nodo es un objeto
 * `node` o **un sitio que toca dos regiones o más**: una ciudad o un pueblo en
 * el muro, entre ellas (la base, siempre). Una ciudad o un pueblo que toca una
 * sola región está **dentro de ella** (`Estructura.sitiosDeRegion`) y es de quien
 * la tenga (ciudades y pueblos en su región, 05-11-2026,
 * `docs/agents/2026-11-05-ciudades-en-su-region/`): qué es cada uno lo dice la
 * geometría, no un campo del plan. El terreno no cambia en toda la partida y
 * los sitios tampoco se mueven, así que la forma de la red se calcula una vez
 * por mapa (`estructura`). Lo que sí cambia, quién es dueño de qué, se pregunta
 * cada vez a donde vive: el de un nodo, a su objeto del mapa (`owner`, que solo
 * escribe `tomarElNodo`); el de un sitio de región, a su región. Es la regla de
 * «un hecho, un sitio»: el dueño de una región no es un dato, es una
 * consecuencia de sus nodos. Esas preguntas viven en `territorio.ts`, y el relieve
 * de la red (el nivel de cada casilla, la validación de los niveles), en
 * `niveles.ts`: los dos leen la red de aquí, y ella no los lee a ellos.
 *
 * 8-vecindad en todo, como el Dijkstra del mapa: si aquí las regiones fueran
 * 4-conexas, un héroe se colaría en diagonal por la esquina de dos muros que
 * esta función daría por cerrados.
 */
import type { Point } from '../types.js';
import { aPunto, inBounds } from './map.js';
import { regionesDeLaCiudad, rioAnteLaCiudad } from './recinto.js';
import { isWalkable, type TerrainKind } from './terrain.js';
import type { ClaseDeNodo, Estructura, GameMap, MapObject, MapRegion, NodoDeRed } from './tipos.js';

/** La clase de nodo que sería el objeto `o`, o `null` si no puede ser un nodo. */
function claseDeCandidato(o: MapObject, conRegiones: boolean): ClaseDeNodo | null {
  switch (o.kind) {
    case 'node':
      return 'paso';
    case 'town':
      return 'ciudad';
    case 'village':
      // Sin regiones no hay en qué estar dentro: el pueblo no es nada de la red,
      // como antes (los mapas de los tests del pathfinding).
      return conRegiones ? 'pueblo' : null;
    default:
      return null;
  }
}

/**
 * Las ocho vecinas, `dy` por fuera y `dx` por dentro: el mismo orden que el
 * Dijkstra del mapa. Vive aquí y la usa también el generador, que es quien
 * más casillas recorre: dos copias de la 8-vecindad son dos sitios donde una
 * región puede quedar 4-conexa por error.
 */
export const VECINAS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/**
 * Las ocho vecinas de cada casilla de un mapa de `width × height`, en tabla
 * compacta: las de `i` son `vecinas[desde[i]]` … `vecinas[desde[i + 1] − 1]`, en
 * el orden de `VECINAS`, con el límite del mapa comprobado una vez. El vestido
 * del generador, `rellenar` y la auditoría de los tests recorrían cada uno la
 * 8-vecindad con su copia del `if` de los bordes; el código de antes de los
 * mapas densos (`regionesQueToca`, `juntoANodo`, el muro fino) sigue con la suya.
 *
 * Una tabla y no una función con *callback* porque es lo que más se recorre del
 * generador: con un *callback* por vecina, la llamada se volvía megamórfica —un
 * cierre distinto en cada sitio— y 200 mapas de 34×34 tardaban 740 ms frente a
 * los 530 de la tabla (medido en la vuelta de simplify, 03-10-2026). Memoizada
 * por tamaño: el mapa de una partida no cambia de lado.
 */
export interface Vecindad {
  readonly desde: Int32Array;
  readonly vecinas: Int32Array;
}

const vecindades = new Map<number, Vecindad>();

export function vecindad(width: number, height: number): Vecindad {
  const clave = width * 65536 + height;
  const hecha = vecindades.get(clave);
  if (hecha !== undefined) return hecha;
  const desde = new Int32Array(width * height + 1);
  const vecinas = new Int32Array(width * height * 8);
  let n = 0;
  for (let i = 0; i < width * height; i++) {
    desde[i] = n;
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of VECINAS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      vecinas[n++] = ny * width + nx;
    }
  }
  desde[width * height] = n;
  const tabla = { desde, vecinas: vecinas.slice(0, n) };
  vecindades.set(clave, tabla);
  return tabla;
}

/**
 * La región más cercana de cada casilla: la de `region` donde no es −1 y, en lo
 * demás, la de la primera que llega en una búsqueda en anchura desde todas a la
 * vez, 8-conexa y en el orden de `VECINAS` (así, un empate lo gana siempre la
 * misma). Devuelve una copia; −1 solo donde no llega ninguna. La usan el relieve
 * (lo encerrado entre barreras, `nivelesDelRelieve`) y, sobre las regiones de un
 * mapa en juego, `regionMasCercana`.
 */
export function laMasCercana(region: Int32Array, width: number, height: number): Int32Array {
  const { desde, vecinas } = vecindad(width, height);
  const c = Int32Array.from(region);
  const ola: number[] = [];
  for (let k = 0; k < c.length; k++) if ((c[k] as number) >= 0) ola.push(k);
  for (let q = 0; q < ola.length; q++) {
    const j = ola[q] as number;
    for (let v = desde[j]!; v < desde[j + 1]!; v++) {
      const k = vecinas[v]!;
      if (c[k] !== -1) continue;
      c[k] = c[j] as number;
      ola.push(k);
    }
  }
  return c;
}

const regionesMasCercanas = new WeakMap<MapaDeRed, Int32Array>();

/**
 * La región de cada casilla de un mapa (índice `y*width+x`, en `map.regions`): la
 * de `estructura` y, en las barreras, los nodos y los recintos, la de la región
 * más cercana (`laMasCercana`). −1 solo en un mapa sin regiones. Memorizada por
 * mapa, como `estructura`.
 *
 * Es un hecho con dos lectores, y por eso vive aquí y no en ninguno de ellos: el
 * clima (cada frente cae en una cordillera o un río, y una ciudad tiene el tiempo
 * de alrededor) y la niebla (`zonaDeNiebla`: la cordillera de una región se
 * descubre con ella). Vivía en `state/clima.ts` hasta que la niebla por regiones
 * (02-11-2026) la necesitó desde `game.ts`, que el clima importa.
 */
export function regionMasCercana(map: MapaDeRed): Int32Array {
  const hecha = regionesMasCercanas.get(map);
  if (hecha !== undefined) return hecha;
  const region = laMasCercana(estructura(map).regionDe, map.width, map.height);
  regionesMasCercanas.set(map, region);
  return region;
}

/**
 * El relleno 8-conexo desde `desde`, que **ya tiene que estar tomada**: cada
 * vecina entra si `toma(j)` dice que sí, y es `toma` quien la marca, así que la
 * misma casilla no se pregunta dos veces por la misma búsqueda sin que el
 * relleno guarde un visto propio. Devuelve las casillas en el orden en que se
 * tomaron. Es la definición de región de este módulo —lo pisable sin nodos,
 * 8-conexo— y la usan también el generador y su vestido.
 */
export function rellenar(
  width: number,
  height: number,
  desde: number,
  toma: (j: number) => boolean,
): number[] {
  const v = vecindad(width, height);
  const tomadas = [desde];
  const pila = [desde];
  while (pila.length > 0) {
    const a = pila.pop() as number;
    for (let k = v.desde[a] as number; k < (v.desde[a + 1] as number); k++) {
      const j = v.vecinas[k] as number;
      if (!toma(j)) continue;
      tomadas.push(j);
      pila.push(j);
    }
  }
  return tomadas;
}

/**
 * Las componentes 8-conexas de lo pisable sin nodos, numeradas en orden de
 * barrido. Determinista: la misma rejilla da siempre la misma numeración.
 */
function componentes(r: Rejilla): { comp: Int32Array; total: number } {
  const { width, height, puenteDe } = r;
  const comp = new Int32Array(width * height).fill(-1);
  const v = vecindad(width, height);
  let total = 0;
  const libre = (i: number): boolean => comp[i] === -1 && r.pisable[i] === 1 && r.nodoEn[i] === -1;
  /**
   * El puente de una ciudad-puente (`rioAnteLaCiudad`) no se une con el
   * recinto de su ciudad: es tierra de la orilla de enfrente, y por sus
   * esquinas tocaba las casillas de las dos regiones de la orilla de la ciudad.
   * Es el paso del recinto (`pasoPermitido`), que del puente solo deja ir a su
   * puerta; lo demás del recinto se etiqueta como siempre.
   */
  const cortado = (a: number, j: number): boolean => {
    const ca = puenteDe[a] as number;
    const cj = puenteDe[j] as number;
    return (ca >= 0 && cercaDe(width, ca, j)) || (cj >= 0 && cercaDe(width, cj, a));
  };
  for (let i = 0; i < width * height; i++) {
    if (!libre(i)) continue;
    comp[i] = total;
    const pila = [i];
    while (pila.length > 0) {
      const a = pila.pop() as number;
      for (let k = v.desde[a] as number; k < (v.desde[a + 1] as number); k++) {
        const j = v.vecinas[k] as number;
        if (!libre(j) || cortado(a, j)) continue;
        comp[j] = total;
        pila.push(j);
      }
    }
    total++;
  }
  return { comp, total };
}

/** Si las casillas `a` y `b` de un mapa de ancho `width` están a una o menos (Chebyshev): la de `b`, en el 3 × 3 de `a`. */
function cercaDe(width: number, a: number, b: number): boolean {
  const ax = a % width;
  const bx = b % width;
  return Math.abs(ax - bx) <= 1 && Math.abs((a - ax) / width - (b - bx) / width) <= 1;
}

/**
 * Las componentes de lo pisable sin nodos de un mapa, aunque no sea válido: lo
 * que pinta el suelo de cada región (`buildMap`) antes de que nadie lo valide.
 * La misma cuenta que `estructura`, con el corte del puente de cada
 * ciudad-puente y con las ciudades y los pueblos de dentro de una región ya en
 * ella (`asentarLosSitios`).
 */
export function componentesDelMapa(map: MapaDeRed): { comp: Int32Array; total: number } {
  return asentarLosSitios(map, rejillaDe(map)).comps;
}

/** Un candidato a nodo de la rejilla: un objeto `node`, una ciudad o un pueblo. */
interface Candidato {
  readonly id: string;
  readonly at: Point;
  readonly clase: ClaseDeNodo;
}

/** Lo que hace falta de un mapa para leerle la red: terreno, regiones y nodos. */
interface Rejilla {
  readonly width: number;
  readonly height: number;
  readonly pisable: Uint8Array;
  /** Índice del nodo en cada casilla, o −1. */
  readonly nodoEn: Int32Array;
  readonly nodos: readonly Candidato[];
  /** En el puente de cada ciudad-puente, el índice de la casilla de su ciudad; −1 en las demás. */
  readonly puenteDe: Int32Array;
}

/**
 * La rejilla de un mapa, con **todo candidato a nodo cortado**: los pasos, las
 * ciudades y los pueblos (estos, solo en un mapa con regiones). Cuáles de las
 * ciudades y los pueblos se quedan de nodo lo decide después `asentarLosSitios`.
 * Un nodo fuera del mapa no se puede dar: los dos productores pasan por
 * `validateMapPlan`, que lo rechaza antes de construir, y aquí se **lanza** en
 * vez de saltarlo, que callado sería un nodo menos.
 */
function rejillaDe(map: MapaDeRed): Rejilla {
  const n = map.width * map.height;
  const pisable = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (isWalkable(map.terrain[i] as TerrainKind)) pisable[i] = 1;
  const nodoEn = new Int32Array(n).fill(-1);
  const nodos: Candidato[] = [];
  const conRegiones = map.regions.length > 0;
  for (const o of map.objects) {
    const clase = claseDeCandidato(o, conRegiones);
    if (clase === null) continue;
    if (!inBounds(map, o.at)) {
      throw new Error(`el nodo ${o.id} está fuera del mapa en (${o.at.x},${o.at.y})`);
    }
    nodoEn[o.at.y * map.width + o.at.x] = nodos.length;
    nodos.push({ id: o.id, at: o.at, clase });
  }
  const puenteDe = new Int32Array(n).fill(-1);
  for (const c of nodos) {
    if (c.clase !== 'ciudad') continue;
    const puente = rioAnteLaCiudad(map, c.at);
    if (puente !== null)
      puenteDe[puente.acceso.y * map.width + puente.acceso.x] = c.at.y * map.width + c.at.x;
  }
  return { width: map.width, height: map.height, pisable, nodoEn, nodos, puenteDe };
}

/**
 * Lo que tocan una ciudad o un pueblo en `zona` (la componente de cada casilla, o
 * la región): la ciudad, lo de los accesos de sus puertas (`regionesDeLaCiudad`:
 * su muralla no se pisa); el pueblo, lo de sus ocho vecinas, sin la muralla de
 * ninguna ciudad (`enRecinto`). Es **la pregunta que decide si un sitio es nodo**,
 * y la hacen la rejilla (con las componentes) y la red (con las regiones).
 */
function loQueToca(
  map: MapaDeRed,
  c: Candidato,
  zona: Int32Array,
  enRecinto: Uint8Array,
): number[] {
  return c.clase === 'ciudad'
    ? regionesDeLaCiudad(map, c.at, zona)
    : regionesQueToca(map.width, map.height, zona, c.at, enRecinto);
}

/** Las casillas de la muralla de toda ciudad: las ocho de alrededor de cada una (`recinto.ts`). */
function casillasDeMuralla(map: MapaDeRed): Uint8Array {
  const enRecinto = new Uint8Array(map.width * map.height);
  for (const o of map.objects)
    if (o.kind === 'town')
      for (const [dx, dy] of VECINAS) {
        const p = { x: o.at.x + dx, y: o.at.y + dy };
        if (inBounds(map, p)) enRecinto[p.y * map.width + p.x] = 1;
      }
  return enRecinto;
}

/** La rejilla con solo los nodos de verdad, sus componentes y los sitios de dentro de una región. */
interface RejillaAsentada {
  readonly r: Rejilla;
  readonly comps: { readonly comp: Int32Array; readonly total: number };
  /** Las ciudades y los pueblos que tocan una sola componente, con la suya. */
  readonly sitios: ReadonlyMap<string, number>;
  /** Las casillas de la muralla de toda ciudad (`casillasDeMuralla`), una vez por mapa. */
  readonly enRecinto: Uint8Array;
}

/**
 * Las componentes de `r` con **cada ciudad o pueblo que toca una sola componente
 * puesto en ella**: está dentro de su región, no es un nodo, y su casilla es de
 * la región como cualquier otra. Los que tocan dos o más se quedan de nodo: son
 * los que están en el muro. La rejilla que devuelve solo corta los nodos de
 * verdad, así que todo lo de después —la red, los vecinos, el paso abierto— ve
 * la misma red. Sin regiones, nada se asienta: no hay región en la que estar.
 *
 * Por qué cortar primero y asentar después, y no al revés: que un sitio esté
 * dentro o en el muro **no lo dice el plan**, lo dice lo que toca, y lo que toca
 * solo se sabe con la casilla cortada (un pueblo sin cortar no tocaría nada:
 * sería parte de lo que toca).
 */
function asentarLosSitios(map: MapaDeRed, r: Rejilla): RejillaAsentada {
  const comps = componentes(r);
  const enRecinto = casillasDeMuralla(map);
  if (map.regions.length === 0) return { r, comps, sitios: new Map(), enRecinto };
  const sitios = new Map<string, number>();
  const nodos: Candidato[] = [];
  const nodoEn = new Int32Array(r.nodoEn.length).fill(-1);
  for (const c of r.nodos) {
    const i = c.at.y * r.width + c.at.x;
    const toca = c.clase === 'paso' ? [] : loQueToca(map, c, comps.comp, enRecinto);
    if (toca.length === 1) {
      const zona = toca[0] as number;
      comps.comp[i] = zona;
      sitios.set(c.id, zona);
      continue;
    }
    nodoEn[i] = nodos.length;
    nodos.push(c);
  }
  return { r: { ...r, nodoEn, nodos }, comps, sitios, enRecinto };
}

/**
 * Lo que `estructura` lee de un mapa, y nada más: lo cumplen el `GameMap` del
 * núcleo y el mapa que el escenógrafo recibe del cable (`MapaDeEscena`), que
 * saca de aquí la región de cada casilla para pintar su nivel (#143).
 */
export interface MapaDeRed {
  readonly width: number;
  readonly height: number;
  readonly terrain: readonly TerrainKind[];
  readonly objects: readonly MapObject[];
  readonly regions: readonly MapRegion[];
}

const cache = new WeakMap<MapaDeRed, Estructura>();

/**
 * La forma de la red de un mapa: qué región es cada casilla y qué nodos rodean
 * a cada región.
 *
 * Memoizada por mapa porque el terreno y los nodos no cambian en una partida, y
 * la piden la renta de cada turno, la IA y el contrato. Si un día algo mutara
 * el terreno de un mapa ya en juego, esta caché mentiría: hoy no hay nada que
 * lo haga, y por eso basta con una `WeakMap` en vez de una invalidación.
 *
 * **Lanza** si el mapa no tiene estructura válida —dos semillas en la misma
 * componente, una semilla sobre un muro—: un mapa así no pasa
 * `validateMapPlan`, y llegar aquí con uno es un fallo de programa, no un dato.
 * Un mapa **sin regiones** sí vale y da una red vacía de regiones: los de los
 * tests de pathfinding no tienen territorio y no lo necesitan.
 */
export function estructura(map: MapaDeRed): Estructura {
  const hecha = cache.get(map);
  if (hecha !== undefined) return hecha;
  return construir(map, asentarLosSitios(map, rejillaDe(map)));
}

/**
 * La `Estructura` a partir de una rejilla ya asentada (sus componentes y los
 * sitios de dentro de una región), y guardada en la caché. La comparten
 * `estructura` y `problemasDeRed` para que validar un mapa y leerle la red sea
 * **un solo** relleno por inundación.
 */
function construir(map: MapaDeRed, { r, comps, sitios, enRecinto }: RejillaAsentada): Estructura {
  const { comp, total } = comps;
  // De componente a región, por la semilla de cada región.
  const regionDeComp = new Int32Array(total).fill(-1);
  for (const [k, reg] of map.regions.entries()) {
    const c = inBounds(map, reg.at) ? (comp[reg.at.y * r.width + reg.at.x] as number) : -1;
    if (c === -1) {
      throw new Error(
        `la región "${reg.id}" se declara en (${reg.at.x},${reg.at.y}), que no es una casilla de región: el mapa no ha pasado por validateMapPlan`,
      );
    }
    if (regionDeComp[c] !== -1) {
      const otra = map.regions[regionDeComp[c] as number]?.id;
      throw new Error(
        `las regiones "${otra}" y "${reg.id}" son la misma zona del mapa: el mapa no ha pasado por validateMapPlan`,
      );
    }
    regionDeComp[c] = k;
  }
  const regionDe = new Int32Array(r.width * r.height).fill(-1);
  for (let i = 0; i < regionDe.length; i++) {
    const c = comp[i] as number;
    if (c !== -1) regionDe[i] = regionDeComp[c] as number;
  }
  const sitiosDeRegion = new Map<string, number>();
  for (const [id, c] of sitios) {
    const reg = regionDeComp[c] as number;
    if (reg !== -1) sitiosDeRegion.set(id, reg);
  }

  // Un nodo no toca la región por las casillas de algún recinto (`enRecinto`),
  // que son la muralla de una ciudad (`recinto.ts`) y no se pisan.
  const nodosDeRegion: number[][] = map.regions.map(() => []);
  const nodos: NodoDeRed[] = r.nodos.map((n, k) => {
    const regiones = loQueToca(map, n, regionDe, enRecinto);
    for (const reg of regiones) nodosDeRegion[reg]?.push(k);
    return { id: n.id, at: n.at, clase: n.clase, regiones };
  });
  const hecha: Estructura = {
    regionDe,
    regiones: map.regions.map((reg, k) => ({ ...reg, nodos: nodosDeRegion[k] as number[] })),
    nodos,
    nodoPorId: new Map(nodos.map((n, k) => [n.id, k])),
    regionPorId: new Map(map.regions.map((reg, k) => [reg.id, k])),
    sitiosDeRegion,
  };
  cache.set(map, hecha);
  return hecha;
}

/**
 * Las regiones que toca una casilla en 8-vecindad, ascendentes. Es la pregunta
 * que define a un nodo, y el generador la hace sobre cada casilla de muro para
 * saber dónde puede ir uno: la misma función, para que lo que el generador
 * cree que es un paso sea lo que la red lea como paso.
 */
export function regionesQueToca(
  width: number,
  height: number,
  regionDe: Int32Array,
  at: Point,
  sinContar?: Uint8Array,
): number[] {
  const out = new Set<number>();
  for (const [dx, dy] of VECINAS) {
    const nx = at.x + dx;
    const ny = at.y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (sinContar?.[ny * width + nx] === 1) continue;
    const reg = regionDe[ny * width + nx] as number;
    if (reg !== -1) out.add(reg);
  }
  return [...out].sort((a, b) => a - b);
}

const juntoCache = new WeakMap<GameMap, Uint8Array>();

/**
 * Las casillas pegadas a un nodo, en 8-vecindad, marcadas con un 1 (índice
 * `y*width+x`). Lo que se pone ahí taparía la entrada a una región, así que no
 * se pone nada: ni el generador lo usa para sembrar, ni un asaltante lo pisa.
 * Una sola marca para los dos, para que lo que el generador cree que deja
 * libre sea lo que la patrulla acepta. Memoizada por mapa, como `estructura`:
 * los nodos no se mueven.
 */
export function juntoANodo(map: GameMap): Uint8Array {
  const hecha = juntoCache.get(map);
  if (hecha !== undefined) return hecha;
  const marca = new Uint8Array(map.width * map.height);
  for (const n of estructura(map).nodos) {
    for (const [dx, dy] of VECINAS) {
      const v = { x: n.at.x + dx, y: n.at.y + dy };
      if (inBounds(map, v)) marca[v.y * map.width + v.x] = 1;
    }
  }
  juntoCache.set(map, marca);
  return marca;
}

// ---------------------------------------------------------------- validación

export const casilla = (p: Point): string => `(${p.x},${p.y})`;

/** Cómo se nombra un nodo en un problema: la ciudad y el pueblo por su id, el paso por su casilla. */
function quienEsElNodo(n: Candidato): string {
  switch (n.clase) {
    case 'ciudad':
      return `la ciudad "${n.id}"`;
    case 'pueblo':
      return `el pueblo "${n.id}"`;
    case 'paso':
      return `el nodo de ${casilla(n.at)}`;
  }
}

/**
 * El pueblo que **parte su región**: cortado de la red, deja la zona sin semilla
 * `c` a un lado y una sola región declarada al otro (toca `c` y una única zona
 * con semilla), así que sin él sería parte de esa región. Dicho, o `null` si no
 * hay ninguno y la zona sin semilla es de las de siempre. Solo el pueblo: una
 * ciudad entre una región y una zona sin semilla es, casi siempre, una ciudad del
 * muro junto a una región que no se declaró, y la frase de siempre lo dice mejor
 * (la geometría no distingue las dos cosas: lo que cambia es qué se quería).
 */
function queParteLaZona(
  map: MapaDeRed,
  { r, comps, enRecinto }: RejillaAsentada,
  c: number,
  conSemilla: (zona: number) => boolean,
): string | null {
  const { comp } = comps;
  for (const n of r.nodos) {
    if (n.clase !== 'pueblo') continue;
    const toca = loQueToca(map, n, comp, enRecinto);
    if (toca.includes(c) && toca.filter(conSemilla).length === 1) return quienEsElNodo(n);
  }
  return null;
}

/**
 * Lo que impide que un mapa sea una red de nodos válida, en frases para quien
 * diseñó el plan. Vacío: la red está bien.
 *
 * Es la comprobación **programática** que pide el criterio 1, y la corren los
 * dos productores de planes —el generador y el agente— porque vive en
 * `validateMapPlan`:
 *
 *  1. Quitando los nodos, cada componente pisable contiene **exactamente una**
 *     semilla de región. Dos semillas en una son dos regiones que se tocan sin
 *     nodo, y se dice **por dónde** (`pasoAbierto`).
 *  2. Ningún trozo pisable sin región: sería un sitio al que se llega sin cruzar
 *     un nodo de nadie.
 *  3. Cada nodo toca al menos dos regiones —si no, no es un paso— y dos nodos
 *     no son vecinos, que dejaría pasar de nodo a nodo sin pisar región. Una
 *     ciudad o un pueblo que toca una sola región está dentro de ella y no es un
 *     nodo (`asentarLosSitios`); el que deja a un lado una zona sin semilla
 *     **parte la región**, y se dice así.
 *  4. Cada región tiene al menos un nodo, y todas se alcanzan unas desde otras.
 *
 * Un solo relleno por inundación: las componentes que se miran aquí son las
 * mismas con las que se construye la `Estructura` que queda en la caché. Que un
 * nodo caiga sobre muro no se mira, y no por olvido: `buildMap` abre la casilla
 * de cada nodo y de cada ciudad, así que desde `validateMapPlan` no se da.
 */
export function problemasDeRed(map: GameMap): string[] {
  if (map.regions.length === 0) {
    return ['el mapa no declara ninguna región: un mapa de nodos necesita "regions"'];
  }
  const problemas: string[] = [];
  const asentada = asentarLosSitios(map, rejillaDe(map));
  const { r, comps } = asentada;
  const W = r.width;
  const { comp, total } = comps;

  // 1. Las semillas, cada una en su componente.
  const semillasDeComp: number[][] = Array.from({ length: total }, () => []);
  const ids = new Set<string>();
  for (const [k, reg] of map.regions.entries()) {
    if (ids.has(reg.id))
      problemas.push(`hay dos regiones con el id "${reg.id}": tienen que ser únicos`);
    ids.add(reg.id);
    if (!inBounds(map, reg.at)) {
      problemas.push(`la región "${reg.id}" se declara fuera del mapa, en ${casilla(reg.at)}`);
      continue;
    }
    const i = reg.at.y * W + reg.at.x;
    if (r.nodoEn[i] !== -1) {
      problemas.push(
        `la región "${reg.id}" se declara en ${casilla(reg.at)}, que es un nodo: declárala en una casilla de dentro`,
      );
      continue;
    }
    if (r.pisable[i] !== 1) {
      problemas.push(
        `la región "${reg.id}" se declara en ${casilla(reg.at)}, que es ${map.terrain[i]}: declárala en una casilla que se pise`,
      );
      continue;
    }
    semillasDeComp[comp[i] as number]?.push(k);
  }

  // 2. Cada componente, con su semilla y solo una.
  for (let c = 0; c < total; c++) {
    const semillas = semillasDeComp[c] as number[];
    if (semillas.length === 0) {
      const donde = casilla(aPunto(comp.indexOf(c), W));
      const parte = queParteLaZona(map, asentada, c, (z) => (semillasDeComp[z]?.length ?? 0) > 0);
      problemas.push(
        parte === null
          ? `hay una zona pisable sin región declarada que incluye ${donde}: declara ahí una región o ciérrala con muro`
          : `${parte} parte su región: deja a un lado una zona sin región declarada que incluye ${donde}; ponlo donde no corte el paso`,
      );
      continue;
    }
    const primera = semillas[0] as number;
    for (const otra of semillas.slice(1)) problemas.push(pasoAbierto(map, r, primera, otra));
  }
  if (problemas.length > 0) return problemas;

  // A partir de aquí cada componente es una región: se construye la red con las
  // mismas componentes, sin volver a inundar.
  const red = construir(map, asentada);

  // 3. Los nodos: pasos de verdad, y no pegados unos a otros.
  for (const [k, n] of red.nodos.entries()) {
    const quien = quienEsElNodo(n);
    if (n.clase !== 'paso' && n.regiones.length === 0) {
      problemas.push(
        `${quien} no toca ninguna región: ${n.clase === 'ciudad' ? 'ponla' : 'ponlo'} dentro de una región, o en el muro entre dos`,
      );
    } else if (n.regiones.length < 2) {
      const cuales =
        n.regiones.length === 0
          ? 'no toca ninguna región'
          : `solo toca la región "${red.regiones[n.regiones[0] as number]?.id}"`;
      problemas.push(
        `${quien} ${cuales}: un nodo es un paso entre dos regiones o más, ponlo en el muro que las separa`,
      );
    }
    for (const [dx, dy] of VECINAS) {
      const vecina = { x: n.at.x + dx, y: n.at.y + dy };
      if (!inBounds(map, vecina)) continue;
      const otro = r.nodoEn[vecina.y * W + vecina.x] as number;
      // Cada pareja una vez: la dice el de índice menor.
      if (otro > k) {
        problemas.push(
          `los nodos de ${casilla(n.at)} y ${casilla(vecina)} son vecinos: se pasaría de uno a otro sin pisar región; sepáralos`,
        );
      }
    }
  }

  // 4. Cada región, con salida; y todas, alcanzables.
  for (const reg of red.regiones) {
    if (reg.nodos.length === 0) {
      problemas.push(
        `la región "${reg.id}" no tiene ningún nodo: no se puede entrar ni salir de ella`,
      );
    }
  }
  if (problemas.length > 0) return problemas;

  const vistas = new Set<number>([0]);
  const cola = [0];
  for (let q = 0; q < cola.length; q++) {
    for (const n of red.regiones[cola[q] as number]?.nodos ?? []) {
      for (const otra of red.nodos[n]?.regiones ?? []) {
        if (vistas.has(otra)) continue;
        vistas.add(otra);
        cola.push(otra);
      }
    }
  }
  for (const [k, reg] of red.regiones.entries()) {
    if (!vistas.has(k)) {
      problemas.push(
        `la región "${reg.id}" no se alcanza desde la región "${red.regiones[0]?.id}": ningún nodo lleva hasta ella`,
      );
    }
  }
  return problemas;
}

/**
 * Por dónde se tocan dos regiones que deberían estar separadas, en una frase.
 *
 * Se busca el camino más corto de una semilla a la otra y, en él, el hueco. Hay
 * dos formas de hueco, y se miran **en este orden**:
 *
 *  1. **El paso en diagonal**: un paso del camino de (x,y) a (x±1,y±1) con las
 *     dos esquinas —(x±1,y) y (x,y±1)— de muro. Es lo que deja un muro en
 *     escalera o en diagonal: a la vista está cerrado y en 8-vecindad se
 *     cruza. Va primero porque el camino puede pasar antes por un
 *     estrechamiento que no es el hueco —QA lo encontró con una diagonal pura,
 *     donde se nombraba la casilla entre el borde del mapa y otra cordillera, y
 *     un nodo allí no arreglaba nada—, y un paso así **siempre** cruza un muro.
 *  2. **El estrechamiento**: la primera casilla con muro a los dos lados
 *     opuestos, que es la forma del hueco de un muro recto.
 *
 * Si no hay ninguno de los dos —las regiones comparten un campo abierto—, se
 * nombra el punto medio del camino, que es una casilla de la zona que se solapa.
 */
function pasoAbierto(map: GameMap, r: Rejilla, a: number, b: number): string {
  const W = r.width;
  const libre = (i: number): boolean => r.pisable[i] === 1 && r.nodoEn[i] === -1;
  const ra = map.regions[a] as MapRegion;
  const rb = map.regions[b] as MapRegion;
  const origen = ra.at.y * W + ra.at.x;
  const destino = rb.at.y * W + rb.at.x;
  const previo = new Int32Array(W * r.height).fill(-1);
  previo[origen] = origen;
  const cola = [origen];
  for (let q = 0; q < cola.length && previo[destino] === -1; q++) {
    const actual = cola[q] as number;
    const x = actual % W;
    const y = (actual - x) / W;
    for (const [dx, dy] of VECINAS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= r.height) continue;
      const j = ny * W + nx;
      if (previo[j] !== -1 || !libre(j)) continue;
      previo[j] = actual;
      cola.push(j);
    }
  }
  const camino: number[] = [];
  for (let i = destino; i !== origen; i = previo[i] as number) camino.unshift(i);
  camino.unshift(origen);

  const bloqueada = (x: number, y: number): boolean =>
    x < 0 || y < 0 || x >= W || y >= r.height || !libre(y * W + x);
  const entre = (k: number): string => {
    const antes = aPunto(camino[k - 1] as number, W);
    const hueco = aPunto(camino[k] as number, W);
    return `las regiones "${ra.id}" y "${rb.id}" se tocan sin nodo entre ${casilla(antes)} y ${casilla(hueco)}`;
  };

  // 1. El paso en diagonal entre dos esquinas de muro.
  for (let k = 1; k < camino.length; k++) {
    const p = aPunto(camino[k - 1] as number, W);
    const q = aPunto(camino[k] as number, W);
    if (p.x === q.x || p.y === q.y) continue;
    if (bloqueada(q.x, p.y) && bloqueada(p.x, q.y)) {
      return `${entre(k)}, en diagonal: ${casilla({ x: q.x, y: p.y })} y ${casilla({ x: p.x, y: q.y })} son muro, pero entre dos esquinas se pasa; pon muro en ${casilla(p)} o en ${casilla(q)}, o un nodo en ${casilla(q)}`;
    }
  }

  // 2. El estrechamiento de un muro recto.
  let k = camino.findIndex((i) => {
    const { x, y } = aPunto(i, W);
    return (
      (bloqueada(x - 1, y) && bloqueada(x + 1, y)) ||
      (bloqueada(x, y - 1) && bloqueada(x, y + 1)) ||
      (bloqueada(x - 1, y - 1) && bloqueada(x + 1, y + 1)) ||
      (bloqueada(x + 1, y - 1) && bloqueada(x - 1, y + 1))
    );
  });
  if (k <= 0) k = Math.max(1, Math.floor(camino.length / 2));
  const hueco = aPunto(camino[k] as number, W);
  return `${entre(k)}: cierra ese paso con muro o pon un nodo en ${casilla(hueco)}`;
}

/** La región de una casilla, o −1: muro, nodo o fuera de toda región. */
export function regionDeCasilla(map: GameMap, p: Point): number {
  if (!inBounds(map, p)) return -1;
  return estructura(map).regionDe[p.y * map.width + p.x] as number;
}

/** Si la casilla toca un nodo: un grupo ahí taparía un paso. */
export function tocaUnNodo(map: GameMap, p: Point): boolean {
  if (!inBounds(map, p)) return false;
  return juntoANodo(map)[p.y * map.width + p.x] === 1;
}

/** La región del clima de la casilla `p`, por su índice en `map.regions` (−1 en un mapa sin regiones). Lanza fuera del mapa. */
export function regionDelSitio(map: MapaDeRed, p: Point): number {
  if (!inBounds(map, p)) throw new Error(`(${p.x},${p.y}) está fuera del mapa: no tiene clima`);
  return regionMasCercana(map)[p.y * map.width + p.x] as number;
}
