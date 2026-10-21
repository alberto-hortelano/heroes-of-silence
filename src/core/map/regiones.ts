/**
 * El mapa como red: regiones encerradas por terreno infranqueable y nodos que
 * son los únicos pasos entre ellas (fase 2 de NuevaJugabilidad).
 *
 * **Nada de esto se guarda**: se deriva del terreno y de los objetos del mapa.
 * Una región es la componente 8-conexa de lo pisable *sin los nodos* que
 * contiene la casilla que la declara (`GameMap.regions`); un nodo es un objeto
 * `node` o un castillo, porque **una ciudad es un nodo** —la base incluida—. El
 * terreno no cambia en toda la partida y los nodos tampoco se mueven, así que
 * la forma de la red se calcula una vez por mapa (`estructura`). Lo que sí
 * cambia, quién es dueño de qué, se pregunta cada vez a donde vive: el castillo
 * a `Town.owner` y el nodo a su objeto. Es la regla de «un hecho, un sitio»: el
 * dueño de una región no es un dato, es una consecuencia de sus nodos.
 *
 * 8-vecindad en todo, como el Dijkstra del mapa: si aquí las regiones fueran
 * 4-conexas, un héroe se colaría en diagonal por la esquina de dos muros que
 * esta función daría por cerrados.
 */
import type { Town } from '../town/town.js';
import type { PlayerId, Point } from '../types.js';
import { aPunto, type GameMap, inBounds, type MapObject, type MapRegion } from './map.js';
import { regionesDeLaCiudad, rioAnteLaCiudad } from './recinto.js';
import {
  admiteLosNiveles,
  BARRERAS,
  BARRERAS_DE_DESNIVEL,
  type Barrera,
  esBarrera,
  isWalkable,
  type TerrainKind,
} from './terrain.js';

/** Un nodo de la red: un objeto `node` o un castillo. */
interface NodoDeRed {
  /** El id del objeto del mapa: el del nodo, o el del castillo. */
  readonly id: string;
  readonly at: Point;
  readonly ciudad: boolean;
  /** Las regiones que toca, por índice y en orden ascendente. Su número es el **grado**. */
  readonly regiones: readonly number[];
}

/** Una región declarada del mapa, con los nodos que la rodean. */
interface RegionDeRed extends MapRegion {
  /** Los nodos que la rodean, por índice en `Estructura.nodos`. */
  readonly nodos: readonly number[];
}

export interface Estructura {
  /** La región de cada casilla (índice `y*width+x`), o −1: muro, nodo o fuera de toda región. */
  readonly regionDe: Int32Array;
  readonly regiones: readonly RegionDeRed[];
  readonly nodos: readonly NodoDeRed[];
  /** El índice de cada nodo por el id de su objeto. */
  readonly nodoPorId: ReadonlyMap<string, number>;
  /** El índice de cada región por su id. */
  readonly regionPorId: ReadonlyMap<string, number>;
}

/** ¿Es este objeto un nodo de la red? Los castillos lo son todos. */
function esNodo(o: MapObject): boolean {
  return o.kind === 'node' || o.kind === 'town';
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

// `aPunto` vive con `pointKey` en `map.ts`; se reexporta para quien ya lo
// importaba de aquí.
export { aPunto };

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
 * ciudad-puente.
 */
export function componentesDelMapa(map: MapaDeRed): { comp: Int32Array; total: number } {
  return componentes(rejillaDe(map));
}

/** Lo que hace falta de un mapa para leerle la red: terreno, regiones y nodos. */
interface Rejilla {
  readonly width: number;
  readonly height: number;
  readonly pisable: Uint8Array;
  /** Índice del nodo en cada casilla, o −1. */
  readonly nodoEn: Int32Array;
  readonly nodos: readonly { readonly id: string; readonly at: Point; readonly ciudad: boolean }[];
  /** En el puente de cada ciudad-puente, el índice de la casilla de su ciudad; −1 en las demás. */
  readonly puenteDe: Int32Array;
}

/**
 * La rejilla de un mapa. Un nodo fuera del mapa no se puede dar: los dos
 * productores pasan por `validateMapPlan`, que lo rechaza antes de construir,
 * y aquí se **lanza** en vez de saltarlo, que callado sería un nodo menos.
 */
function rejillaDe(map: MapaDeRed): Rejilla {
  const n = map.width * map.height;
  const pisable = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (isWalkable(map.terrain[i] as TerrainKind)) pisable[i] = 1;
  const nodoEn = new Int32Array(n).fill(-1);
  const nodos: { id: string; at: Point; ciudad: boolean }[] = [];
  for (const o of map.objects) {
    if (!esNodo(o)) continue;
    if (!inBounds(map, o.at)) {
      throw new Error(`el nodo ${o.id} está fuera del mapa en (${o.at.x},${o.at.y})`);
    }
    nodoEn[o.at.y * map.width + o.at.x] = nodos.length;
    nodos.push({ id: o.id, at: o.at, ciudad: o.kind === 'town' });
  }
  const puenteDe = new Int32Array(n).fill(-1);
  for (const c of nodos) {
    if (!c.ciudad) continue;
    const puente = rioAnteLaCiudad(map, c.at);
    if (puente !== null)
      puenteDe[puente.acceso.y * map.width + puente.acceso.x] = c.at.y * map.width + c.at.x;
  }
  return { width: map.width, height: map.height, pisable, nodoEn, nodos, puenteDe };
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
  const r = rejillaDe(map);
  return construir(map, r, componentes(r));
}

/**
 * La `Estructura` a partir de una rejilla y sus componentes ya calculadas, y
 * guardada en la caché. La comparten `estructura` y `problemasDeRed` para que
 * validar un mapa y leerle la red sea **un solo** relleno por inundación.
 */
function construir(
  map: MapaDeRed,
  r: Rejilla,
  { comp, total }: { comp: Int32Array; total: number },
): Estructura {
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

  // Las casillas de algún recinto: un nodo no toca la región por ellas, que
  // son la muralla de una ciudad (`recinto.ts`) y no se pisan.
  const enRecinto = new Uint8Array(r.width * r.height);
  for (const n of r.nodos)
    if (n.ciudad)
      for (const [dx, dy] of VECINAS) {
        const p = { x: n.at.x + dx, y: n.at.y + dy };
        if (inBounds(map, p)) enRecinto[p.y * r.width + p.x] = 1;
      }
  const nodosDeRegion: number[][] = map.regions.map(() => []);
  const nodos: NodoDeRed[] = r.nodos.map((n, k) => {
    // Una ciudad toca las regiones de los accesos de sus puertas, no las de su
    // muralla (`regionesDeLaCiudad`); un nodo, las de sus vecinas de fuera.
    const regiones = n.ciudad
      ? regionesDeLaCiudad(map, n.at, regionDe)
      : regionesQueToca(r.width, r.height, regionDe, n.at, enRecinto);
    for (const reg of regiones) nodosDeRegion[reg]?.push(k);
    return { id: n.id, at: n.at, ciudad: n.ciudad, regiones };
  });
  const hecha: Estructura = {
    regionDe,
    regiones: map.regions.map((reg, k) => ({ ...reg, nodos: nodosDeRegion[k] as number[] })),
    nodos,
    nodoPorId: new Map(nodos.map((n, k) => [n.id, k])),
    regionPorId: new Map(map.regions.map((reg, k) => [reg.id, k])),
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

const casilla = (p: Point): string => `(${p.x},${p.y})`;

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
 *     no son vecinos, que dejaría pasar de nodo a nodo sin pisar región.
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
  const r = rejillaDe(map);
  const W = r.width;
  const comps = componentes(r);
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
      problemas.push(
        `hay una zona pisable sin región declarada que incluye ${casilla(aPunto(comp.indexOf(c), W))}: declara ahí una región o ciérrala con muro`,
      );
      continue;
    }
    const primera = semillas[0] as number;
    for (const otra of semillas.slice(1)) problemas.push(pasoAbierto(map, r, primera, otra));
  }
  if (problemas.length > 0) return problemas;

  // A partir de aquí cada componente es una región: se construye la red con las
  // mismas componentes, sin volver a inundar.
  const red = construir(map, r, comps);

  // 3. Los nodos: pasos de verdad, y no pegados unos a otros.
  for (const [k, n] of red.nodos.entries()) {
    const quien = n.ciudad ? `la ciudad "${n.id}"` : `el nodo de ${casilla(n.at)}`;
    if (n.regiones.length < 2) {
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
 * Una franja de barrera: las casillas 8-conexas de una misma barrera, y las
 * regiones que tocan por lo que se pisa.
 */
export interface Franja {
  readonly barrera: Barrera;
  /** Sus casillas (índice `y*width+x`), la primera la de índice menor. */
  readonly casillas: readonly number[];
  /** Las regiones de lo que se pisa en sus ocho vecinas, por índice. */
  readonly regiones: ReadonlySet<number>;
}

/**
 * Las franjas de barrera de un terreno, en orden de su primera casilla (#209).
 * Es la unidad de la validación de los niveles (`problemasDeNiveles`): cada
 * franja admite los niveles de las regiones que toca. El relieve va por
 * casilla dentro de ella (`nivelesDelRelieve`, #210), salvo el agua, que va
 * plana por franja. El terreno se pasa aparte porque el de la escena no es
 * el del mapa: la casilla de un puente es agua.
 */
export function franjasDeBarrera(
  width: number,
  height: number,
  terreno: readonly TerrainKind[],
  regionDe: Int32Array,
): Franja[] {
  const vista = new Uint8Array(width * height);
  const franjas: Franja[] = [];
  for (let i = 0; i < width * height; i++) {
    const t = terreno[i] as TerrainKind;
    if (vista[i] === 1 || !esBarrera(t)) continue;
    const casillas = [i];
    vista[i] = 1;
    const regiones = new Set<number>();
    for (let q = 0; q < casillas.length; q++) {
      const j = casillas[q] as number;
      const x = j % width;
      const y = (j - x) / width;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const k = ny * width + nx;
          const r = regionDe[k] as number;
          if (r >= 0 && isWalkable(terreno[k] as TerrainKind)) regiones.add(r);
          if (vista[k] === 0 && terreno[k] === t) {
            vista[k] = 1;
            casillas.push(k);
          }
        }
    }
    franjas.push({ barrera: t, casillas, regiones });
  }
  return franjas;
}

/**
 * El nivel de altura de cada casilla, de los niveles de las regiones (#143,
 * #210): lo que se pisa, al de su región; cada casilla de barrera, por **las
 * dos regiones que separa ahí**, las más cercanas por dentro de su franja
 * (8-conexa, de una misma barrera; con empates, todas las que llegan a la vez
 * que la segunda):
 *
 * - **el agua**, a ras de la más baja: es lo bajo al pie de la meseta, y entre
 *   dos regiones al mismo nivel, un río en el llano;
 * - **lo demás** (acantilado, montaña, bosque, muro), al de la más alta: el
 *   borde de la meseta, con la cara a su pie del lado bajo.
 *
 * Por casilla y no por franja: una franja de acantilado entre un 1 y un 0 que
 * en otro sitio toca una región a 2 subía entera a 2, una cresta sobre las dos
 * orillas (s1 (14-18, 1-9)); y una de agua que tocaba un 0 lejos hundía el río
 * entre dos mesetas a 2, cañones de caída 3 (351 lados en 10 semillas, 5 de
 * ellas). El agua ya no se encaja un nivel bajo su orilla más baja: así toda
 * lengua de tierra de la orilla baja, y toda ciudad del cruce, quedaba por
 * encima del agua por los dos lados, una espiga (auditoría 5, defectos 1 y 3).
 *
 * Una franja que no toca ninguna región (encerrada entre otras barreras) va con
 * la región de lo que se pisa más cercano. Cada nodo, con `nivelDelNodo`; lo
 * demás que se pisa sin región, al llano. El terreno se pasa aparte, como en
 * `franjasDeBarrera`: el de la escena no es el del mapa (un puente es agua).
 */
export function nivelesDelRelieve(
  width: number,
  height: number,
  terreno: readonly TerrainKind[],
  regionDe: Int32Array,
  niveles: readonly number[],
  nodos: readonly NodoDelRelieve[],
): Int8Array {
  const N = width * height;
  const { desde, vecinas } = vecindad(width, height);
  const nivel = new Int8Array(N).fill(1);
  // Lo de cada casilla, una vez: su barrera (índice en `BARRERAS`, −1 si se
  // pisa) y su región si se pisa. Lo llama el generador en cada vuelta del
  // vestido, y con `esBarrera` y vecinas por cierre costaba la mitad del mapa.
  const barrera = new Int8Array(N);
  const region = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    const t = terreno[i] as TerrainKind;
    barrera[i] = esBarrera(t) ? BARRERAS.indexOf(t) : -1;
    if (barrera[i] === -1) region[i] = regionDe[i] as number;
  }
  const AGUA = BARRERAS.indexOf('water');

  // Las dos regiones más cercanas de cada casilla de barrera, por dentro de su
  // franja, y una tercera si llega a la vez que la segunda (un cruce de tres):
  // de ellas, el nivel más alto.
  const r1 = new Int32Array(N).fill(-1);
  const r2 = new Int32Array(N).fill(-1);
  const r3 = new Int32Array(N).fill(-1);
  const d2 = new Int32Array(N);
  const alto = new Int8Array(N).fill(-1);
  const cola: number[] = [];
  const ofrecer = (j: number, r: number, d: number): void => {
    if (r1[j] === r || r2[j] === r || r3[j] === r) return;
    if (r1[j] === -1) r1[j] = r;
    else if (r2[j] === -1) {
      r2[j] = r;
      d2[j] = d;
    } else if (r3[j] === -1 && d2[j] === d) r3[j] = r;
    else return;
    alto[j] = Math.max(alto[j] as number, niveles[r] as number);
    cola.push(j, r, d);
  };
  for (let i = 0; i < N; i++) {
    const r = region[i] as number;
    if (r < 0) continue;
    nivel[i] = niveles[r] as number;
    for (let v = desde[i]!; v < desde[i + 1]!; v++) {
      const k = vecinas[v]!;
      if (barrera[k] !== -1) ofrecer(k, r, 1);
    }
  }
  for (let q = 0; q < cola.length; q += 3) {
    const j = cola[q] as number;
    for (let v = desde[j]!; v < desde[j + 1]!; v++) {
      const k = vecinas[v]!;
      if (barrera[k] === barrera[j]) ofrecer(k, cola[q + 1] as number, (cola[q + 2] as number) + 1);
    }
  }
  // Lo encerrado: la región de lo que se pisa más cercano, por encima de todo.
  // Solo si hace falta, que casi nunca.
  let cercana: Int32Array | null = null;
  const cercanaDe = (i: number): number => {
    if (cercana === null) {
      const c = Int32Array.from(region);
      const ola: number[] = [];
      for (let k = 0; k < N; k++) if ((c[k] as number) >= 0) ola.push(k);
      for (let q = 0; q < ola.length; q++) {
        const j = ola[q] as number;
        for (let v = desde[j]!; v < desde[j + 1]!; v++) {
          const k = vecinas[v]!;
          if (c[k] !== -1) continue;
          c[k] = c[j] as number;
          ola.push(k);
        }
      }
      cercana = c;
    }
    return cercana[i] as number;
  };
  for (let i = 0; i < N; i++) {
    if (barrera[i] === -1 || barrera[i] === AGUA) continue;
    if ((alto[i] as number) >= 0) nivel[i] = alto[i] as number;
    else if (cercanaDe(i) >= 0) nivel[i] = niveles[cercanaDe(i)] as number;
  }
  // El agua, plana: cada franja, a ras de la más baja de las regiones que toca.
  const franja = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    if (barrera[i] !== AGUA || franja[i] !== -1) continue;
    const suya = [i];
    franja[i] = i;
    let bajo = Number.POSITIVE_INFINITY;
    for (let q = 0; q < suya.length; q++) {
      const j = suya[q] as number;
      for (let v = desde[j]!; v < desde[j + 1]!; v++) {
        const k = vecinas[v]!;
        if ((region[k] as number) >= 0)
          bajo = Math.min(bajo, niveles[region[k] as number] as number);
        if (barrera[k] === AGUA && franja[k] === -1) {
          franja[k] = i;
          suya.push(k);
        }
      }
    }
    if (bajo === Number.POSITIVE_INFINITY)
      for (const j of suya)
        if (cercanaDe(j) >= 0) bajo = Math.min(bajo, niveles[cercanaDe(j)] as number);
    if (bajo === Number.POSITIVE_INFINITY) continue;
    for (const j of suya) nivel[j] = bajo;
  }
  for (const n of nodos)
    if (n.regiones.length > 0)
      nivel[n.casilla] = nivelDelNodo(
        n.regiones.map((r) => niveles[r] as number),
        n.alBajo,
      );
  // Y ninguna barrera de una casilla de ancho por encima de lo que tiene a los
  // dos lados: el espolón de una montaña o un acantilado que se mete en lo
  // bajo, o el lomo de una sola casilla, baja hasta lo más alto de esos lados
  // (#210). Al bajar una, se vuelven a mirar sus cuatro vecinas: la casilla de
  // detrás de la punta puede quedarse sola. Igual el paso sin camino que iría al
  // alto con agua a los dos lados (s1 (24,20)): baja con ella, y su rampa sube
  // de él. El agua nunca queda por encima (va a su orilla más baja), y lo que se
  // pisa no se toca: lo que quede ahí lo quita el generador (`quitarEspigas`).
  const bajable = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (barrera[i] !== -1 && barrera[i] !== AGUA) bajable[i] = 1;
  for (const n of nodos) bajable[n.casilla] = 1;
  const pendientes: number[] = [];
  for (let i = 0; i < N; i++) if (bajable[i] === 1) pendientes.push(i);
  while (pendientes.length > 0) {
    const i = pendientes.pop() as number;
    const tope = sinEspiga(width, height, nivel, i);
    if (tope >= (nivel[i] as number)) continue;
    nivel[i] = tope;
    const x = i % width;
    for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width])
      if (j >= 0 && j < N && bajable[j] === 1) pendientes.push(j);
  }
  return nivel;
}

/** Un nodo para `nivelesDelRelieve`: su casilla, las regiones que toca y si va al bajo. */
export interface NodoDelRelieve {
  readonly casilla: number;
  readonly regiones: readonly number[];
  /** Ciudad o paso con camino (`nivelDelNodo`). */
  readonly alBajo: boolean;
}

/**
 * Lo más alto que puede estar la casilla `i` sin quedar por encima de sus dos
 * vecinas de ningún eje: en cada eje donde lo está, lo más alto de las dos, y
 * de los ejes, lo más bajo. Si no es espiga, su nivel.
 */
function sinEspiga(width: number, height: number, nivel: ArrayLike<number>, i: number): number {
  const n = nivel[i] as number;
  let tope = n;
  const x = i % width;
  const pares: (readonly [number, number])[] = [];
  if (x > 0 && x < width - 1) pares.push([i - 1, i + 1]);
  if (i >= width && i < width * (height - 1)) pares.push([i - width, i + width]);
  for (const [p, q] of pares) {
    const alto = Math.max(nivel[p] as number, nivel[q] as number);
    if (alto < n) tope = Math.min(tope, alto);
  }
  return tope;
}

/**
 * El nivel de un nodo que se pisa, de los de las regiones que toca (#143): la
 * ciudad y el paso con camino, al bajo —su bajada la lleva el camino—; el paso
 * sin camino, al alto, un hueco en el borde de la meseta del que baja su rampa.
 * Lo leen la escena (`relieve`) y el generador, que quita las espigas antes de
 * que haya camino pero ya sabe qué nodos lo llevarán (`crucesConCamino`).
 */
export const nivelDelNodo = (suyos: readonly number[], alBajo: boolean): number =>
  alBajo ? Math.min(...suyos) : Math.max(...suyos);

/**
 * Cómo pasa una senda del centro de `p` al de `q`, vecinas, por el relieve de
 * `nivel` (#224). La huella (0,32 de ancho) va de centro a centro, así que un
 * paso en diagonal pisa el vértice que comparten sus dos esquinas.
 *
 * - **`silla`**: en diagonal, con las dos esquinas por encima de las dos
 *   puntas. La escena une lo alto por el vértice («el alto une», `celdas`):
 *   pone ahí una diagonal cóncava y una ladera, y la senda pasa por debajo de
 *   la roca (s55 (26,15)-(27,16), marca del usuario: «el camino acaba en un
 *   muro de roca»).
 * - **`diagonal`**: cambia de nivel en diagonal. La bajada cruza el filo por
 *   una esquina, sin pared a ningún lado, y la rampa no puede ir recta con sus
 *   dos costados (#225).
 * - **`costado`**: cambia de nivel en cruz, pero a un lado (en la
 *   perpendicular del paso) lo de al lado de las dos puntas está por debajo de
 *   la alta: la rampa baja por la esquina de la meseta, donde la línea dobla, y
 *   a ese lado no tiene pared. Con pared a los dos lados —la de la muesca, de
 *   lo alto junto a la punta baja, o la que sigue recta, de lo alto junto a la
 *   alta— va de frente. El borde del mapa no cuenta: el desnivel sigue fuera
 *   del marco.
 * - **`null`**: de frente o a un mismo nivel sin silla.
 */
export type PasoTorcido = 'silla' | 'diagonal' | 'costado';
export function pasoTorcido(
  width: number,
  height: number,
  nivel: ArrayLike<number>,
  p: number,
  q: number,
): PasoTorcido | null {
  const px = p % width;
  const qx = q % width;
  const np = nivel[p] as number;
  const nq = nivel[q] as number;
  if (px !== qx && p - px !== q - qx) {
    if (np !== nq) return 'diagonal';
    const k1 = p - px + qx;
    const k2 = q - qx + px;
    return Math.min(nivel[k1] as number, nivel[k2] as number) > np ? 'silla' : null;
  }
  if (np === nq) return null;
  const [alto, bajo] = np > nq ? [p, q] : [q, p];
  const tope = nivel[alto] as number;
  // Cada lado, en la perpendicular del paso: sin borde del mapa a ese lado.
  const lados = px === qx ? [-1, 1].filter((d) => px + d >= 0 && px + d < width) : [-width, width];
  for (const d of lados) {
    const a = alto + d;
    const b = bajo + d;
    if (a < 0 || b < 0 || a >= width * height || b >= width * height) continue;
    if ((nivel[a] as number) < tope && (nivel[b] as number) < tope) return 'costado';
  }
  return null;
}

/**
 * Si la región `r` toca la casilla `n` solo por un vértice: ninguna casilla de
 * `r` (`regionDe`, −1 lo que no es de ninguna) está en cruz con ella. A una
 * ciudad donde se juntan tres regiones o más, solo una le llega en cruz: dos
 * casillas de regiones distintas no se tocan ni por un vértice (las regiones
 * son 8-conexas), y cada casilla en cruz de la ciudad toca por un vértice las
 * dos diagonales de su lado. Las demás bajan a ella en diagonal a la fuerza
 * (#224).
 */
export function soloPorUnVertice(
  width: number,
  height: number,
  regionDe: Int32Array,
  r: number,
  n: number,
): boolean {
  const x = n % width;
  const y = (n - x) / width;
  const cruz = [
    y > 0 ? n - width : -1,
    y < height - 1 ? n + width : -1,
    x > 0 ? n - 1 : -1,
    x < width - 1 ? n + 1 : -1,
  ];
  return !cruz.some((j) => j >= 0 && regionDe[j] === r);
}

/**
 * Los tramos de `tramos` que pasan torcidos (`pasoTorcido`), con cómo. Ninguno
 * en lo procedimental (#224): la búsqueda de sendas los cobra y lo que queda lo
 * endereza el vestido.
 */
export function tramosTorcidos(
  width: number,
  height: number,
  nivel: ArrayLike<number>,
  tramos: readonly (readonly [number, number])[],
): { readonly tramo: readonly [number, number]; readonly como: PasoTorcido }[] {
  const fuera: { tramo: readonly [number, number]; como: PasoTorcido }[] = [];
  for (const t of tramos) {
    const como = pasoTorcido(width, height, nivel, t[0], t[1]);
    if (como !== null) fuera.push({ tramo: t, como });
  }
  return fuera;
}

/**
 * Las casillas que quedan por encima de sus dos vecinas de un eje (este y
 * oeste, o norte y sur): espigas, istmos e islotes de una casilla de ancho
 * (#210, «una elevación no puede acabar de repente»). La auditoría 5 contó 112
 * en este-oeste en 10 semillas: lenguas de tierra en el agua, pasillos de un
 * nodo por el agua y espolones de acantilado en lo bajo.
 */
export function espigasDelRelieve(
  width: number,
  height: number,
  nivel: ArrayLike<number>,
): number[] {
  const espigas: number[] = [];
  for (let i = 0; i < width * height; i++)
    if (sinEspiga(width, height, nivel, i) < (nivel[i] as number)) espigas.push(i);
  return espigas;
}

/**
 * Las casillas de acantilado sin caída (#215): ninguna de sus ocho vecinas está
 * más baja. El acantilado es el borde de una meseta —una línea de una casilla,
 * con lo bajo al lado— y no un campo de roca: la auditoría 6 contó 447 de 776
 * casillas sin nada más bajo en cruz, franjas de 3-4 casillas con la caída
 * solo en un borde.
 *
 * **En ocho vecinas y no en cruz**, a la fuerza: las regiones son 8-conexas, así
 * que una línea que separa en diagonal va en escalera, y la casilla del codo
 * solo toca lo bajo por la esquina (sin ella, alto y bajo se tocarían en
 * diagonal y la red se abriría). Esa caída la pinta la diagonal del relieve
 * por celdas, en el vértice que comparten. Con esto, que toda casilla tenga lo
 * bajo a una es lo mismo que decir que la franja mide una de ancho.
 */
export function acantiladosSinCaida(
  width: number,
  height: number,
  esAcantilado: (i: number) => boolean,
  nivel: ArrayLike<number>,
): number[] {
  const sin: number[] = [];
  for (let i = 0; i < width * height; i++) {
    if (!esAcantilado(i)) continue;
    const x = i % width;
    const y = (i - x) / width;
    let cae = false;
    for (let dy = -1; dy <= 1 && !cae; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if ((nivel[ny * width + nx] as number) < (nivel[i] as number)) {
          cae = true;
          break;
        }
      }
    if (!cae) sin.push(i);
  }
  return sin;
}

/** Cómo se nombra una barrera en un rechazo de niveles. */
const NOMBRE_DE_BARRERA: Readonly<Record<Barrera, string>> = {
  cliff: 'el acantilado ("cliff")',
  mountain: 'la cordillera ("mountain")',
  water: 'el agua ("water")',
  forest: 'el bosque ("forest")',
  wall: 'el muro ("wall")',
};

/**
 * Lo que impide pintar el relieve de un mapa, en frases para quien diseñó el
 * plan (#209). Vacío: cada franja de barrera admite los niveles de las regiones
 * que toca (`admiteLosNiveles`, la regla del generador): un acantilado separa
 * dos niveles distintos, y un bosque o un muro solo regiones al mismo nivel.
 *
 * **Por franja y no por pareja de regiones**, y no por pereza: es la unidad que
 * pinta la escena (`franjasDeBarrera`), y el procedimental, que elige la
 * barrera por pareja, deja en los cruces de tres regiones trocitos de una
 * franja de acantilado entre dos de ellas al mismo nivel (s11 (13,1): dos
 * casillas y un nodo en el borde del mapa; 16 casillas en 200 semillas). Por
 * pareja, esos mapas se rechazarían y el generador lanzaría (`validadoPorLaPuerta`);
 * por franja, el acantilado es el borde de la meseta que toca y la escena lo
 * pinta como tal. Lo que se pierde: una franja que toca dos niveles en un sitio
 * y separa dos regiones iguales en otro no se rechaza. En un plan del agente se
 * pierde poco: cada nodo y cada ciudad abre su casilla y corta la franja, así
 * que un muro con pasos queda en tramos de nodo a nodo.
 *
 * Una franja que no toca ninguna región (encerrada entre otras barreras) no se
 * mira: no es el borde de nada. Una de acantilado que toca una sola región sí se
 * rechaza: no separa niveles, es una losa de roca sin cara.
 */
export function problemasDeNiveles(map: GameMap): string[] {
  const red = estructura(map);
  const problemas: string[] = [];
  for (const f of franjasDeBarrera(map.width, map.height, map.terrain, red.regionDe)) {
    if (f.regiones.size === 0) continue;
    const regiones = [...f.regiones].sort((a, b) => a - b).map((r) => map.regions[r] as MapRegion);
    if (
      admiteLosNiveles(
        f.barrera,
        regiones.map((r) => r.nivel),
      )
    )
      continue;
    const donde = `${NOMBRE_DE_BARRERA[f.barrera]} que pasa por ${casilla(aPunto(f.casillas[0] as number, map.width))}`;
    const cuales = regiones.map((r) => `"${r.id}" (nivel ${r.nivel})`).join(', ');
    if (f.barrera === 'cliff') {
      problemas.push(
        regiones.length === 1
          ? `${donde} solo toca la región ${cuales}: un acantilado es el borde de una meseta y separa dos regiones a distinto nivel; dentro de una región, usa otra barrera`
          : `${donde} separa regiones al mismo nivel, ${cuales}: un acantilado es el borde de una meseta y va entre dos niveles distintos; dales nivel distinto con "nivel" o usa otra barrera`,
      );
    } else {
      problemas.push(
        `${donde} toca regiones a distinto nivel, ${cuales}: ${f.barrera === 'forest' ? 'un bosque' : 'un muro'} solo va entre regiones al mismo nivel; entre dos niveles van ${BARRERAS_DE_DESNIVEL.map((b) => `"${b}"`).join(', ')}`,
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

// ---------------------------------------------------------------- dueños

/** Lo que hace falta de una partida para saber de quién es cada cosa. */
interface EstadoDeRed {
  readonly map: GameMap;
  readonly towns: readonly Town[];
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
  const dueñoDeNodo = dueñosDeNodos(state, red);
  const dueñoDeRegion = red.regiones.map((reg) => dueñoComun(reg.nodos, dueñoDeNodo, null));
  const conexion = new Map<PlayerId, Conexion>();
  for (const p of state.players) {
    conexion.set(p.id, conexionDe(red, dueñoDeNodo, dueñoDeRegion, p.id, p.base));
  }
  return { red, dueñoDeNodo, dueñoDeRegion, conexion };
}

/**
 * El dueño de cada nodo, preguntado a donde vive: un castillo, a `Town.owner`
 * (el libro de cuentas); un nodo, a su objeto (`captureNode`). Una pasada, con
 * dos índices por id: preguntarlo nodo a nodo con un `find` era cuadrático.
 */
function dueñosDeNodos(state: EstadoDeRed, red: Estructura): (PlayerId | null)[] {
  const porCastillo = new Map(state.towns.map((t) => [t.id, t.owner]));
  const porObjeto = new Map<string, PlayerId | null>();
  for (const o of state.map.objects) if (o.kind === 'node') porObjeto.set(o.id, o.owner);
  return red.nodos.map((n) => {
    const dueños = n.ciudad ? porCastillo : porObjeto;
    if (!dueños.has(n.id)) throw new Error(`el nodo ${n.id} no tiene dueño que leer`);
    return dueños.get(n.id) as PlayerId | null;
  });
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
 * Cuántas regiones serían de `player` si tomara este nodo: las suyas cuyos
 * demás nodos ya son todos de él. Pregunta a `dueñoComun` como si el nodo ya
 * fuera suyo, en vez de reescribir la regla de «región tuya» en la IA.
 */
export function regionesQueCierra(t: Territorio, nodoId: string, player: PlayerId): number {
  const k = t.red.nodoPorId.get(nodoId);
  if (k === undefined) throw new Error(`el nodo ${nodoId} no está en la red del mapa`);
  let cerradas = 0;
  for (const r of t.red.nodos[k]?.regiones ?? []) {
    const nodos = t.red.regiones[r]?.nodos ?? [];
    if (dueñoComun(nodos, t.dueñoDeNodo, { nodo: k, dueño: player }) === player) cerradas++;
  }
  return cerradas;
}

/**
 * El dueño de una región: el dueño común de **todos** los nodos que la rodean,
 * ciudades incluidas, o `null` si no hay uno. Sale de la foto (`territorio`).
 */
export function regionOwner(state: EstadoDeRed, regionId: string): PlayerId | null {
  const t = territorio(state);
  const k = t.red.regionPorId.get(regionId);
  if (k === undefined) throw new Error(`la región "${regionId}" no existe en este mapa`);
  return t.dueñoDeRegion[k] ?? null;
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
