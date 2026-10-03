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
import { type GameMap, inBounds, type MapObject, type MapRegion } from './map.js';
import { isWalkable, type TerrainKind } from './terrain.js';

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

/** La casilla de un índice plano `y*width+x`. */
export const aPunto = (i: number, width: number): Point => ({
  x: i % width,
  y: (i - (i % width)) / width,
});

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
  const { width, height } = r;
  const comp = new Int32Array(width * height).fill(-1);
  let total = 0;
  const toma = (i: number): boolean => {
    if (comp[i] !== -1 || r.pisable[i] !== 1 || r.nodoEn[i] !== -1) return false;
    comp[i] = total;
    return true;
  };
  for (let i = 0; i < width * height; i++) {
    if (!toma(i)) continue;
    rellenar(width, height, i, toma);
    total++;
  }
  return { comp, total };
}

/** Lo que hace falta de un mapa para leerle la red: terreno, regiones y nodos. */
interface Rejilla {
  readonly width: number;
  readonly height: number;
  readonly pisable: Uint8Array;
  /** Índice del nodo en cada casilla, o −1. */
  readonly nodoEn: Int32Array;
  readonly nodos: readonly { readonly id: string; readonly at: Point; readonly ciudad: boolean }[];
}

/**
 * La rejilla de un mapa. Un nodo fuera del mapa no se puede dar: los dos
 * productores pasan por `validateMapPlan`, que lo rechaza antes de construir,
 * y aquí se **lanza** en vez de saltarlo, que callado sería un nodo menos.
 */
function rejillaDe(map: GameMap): Rejilla {
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
  return { width: map.width, height: map.height, pisable, nodoEn, nodos };
}

const cache = new WeakMap<GameMap, Estructura>();

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
export function estructura(map: GameMap): Estructura {
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
  map: GameMap,
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

  const nodosDeRegion: number[][] = map.regions.map(() => []);
  const nodos: NodoDeRed[] = r.nodos.map((n, k) => {
    const regiones = regionesQueToca(r.width, r.height, regionDe, n.at);
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
): number[] {
  const out = new Set<number>();
  for (const [dx, dy] of VECINAS) {
    const nx = at.x + dx;
    const ny = at.y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
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
