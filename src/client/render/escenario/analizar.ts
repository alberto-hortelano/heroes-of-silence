/**
 * Lo que el escenógrafo necesita saber de un mapa del juego antes de vestirlo:
 * de qué es cada casilla, qué franjas de barrera hay y si son frontera o mancha
 * interior, qué suelo tienen al lado y a qué distancia del borde de su franja
 * está cada casilla (de ahí sale el tamaño de los picos y los árboles).
 *
 * Es puro: un mapa entra y un análisis sale, sin DOM y sin ficheros.
 */
import type { MapObject, MapRegion, TramoDeCamino } from '@core/map/map.js';
import { type Estructura, estructura } from '@core/map/regiones.js';
import { orillaDeLaCiudad } from '@core/map/rio.js';
import { type Barrera, esBarrera, type Suelo, type TerrainKind } from '@core/map/terrain.js';
import type { Point } from '@core/types.js';
import { type PasoDeNodo, pasaElCamino, pasoDeNodo } from './nodos.js';

/**
 * Lo que el escenógrafo lee de un mapa, y nada más: nada que cambie en la
 * partida salvo los objetos, de los que solo mira dónde están y de qué clase
 * son, y de las regiones declaradas, dónde están y a qué nivel (#143). Así lo cumplen tal cual el `GameMap` del núcleo y el
 * mapa que rehace el espectador al otro lado del cable, y la escena de los dos
 * sale de la misma lectura.
 */
export interface MapaDeEscena {
  readonly width: number;
  readonly height: number;
  readonly terrain: readonly TerrainKind[];
  readonly caminos: { readonly tramos: readonly TramoDeCamino[] };
  readonly objects: readonly MapObject[];
  /**
   * Las regiones de la red, con su nivel de altura: el relieve es un dato del
   * mapa y la escena no lo inventa (#143). Un mapa sin regiones —los de algunos
   * tests— va entero al llano.
   */
  readonly regions: readonly MapRegion[];
}

/** Una mancha interior tiene a lo sumo este tamaño; lo que pasa de ahí es frontera. */
export const MANCHA_MAXIMA = 6;

export interface Franja {
  readonly id: number;
  readonly barrera: Barrera;
  /** Las casillas, como índices `y * W + x`. */
  readonly casillas: readonly number[];
  /** Frontera entre regiones, o mancha de obstáculo dentro de una. */
  readonly uso: 'borde' | 'obstaculo';
}

export interface Analisis {
  readonly W: number;
  readonly H: number;
  /**
   * El terreno DE LA ESCENA, no el del mapa: la casilla de cada nodo de
   * `puentes` es agua (`terrenoDeLaEscena`), y el resto, lo del mapa.
   */
  readonly terreno: readonly TerrainKind[];
  /** El suelo más cercano de cada casilla: el propio si se pisa. */
  readonly suelo: readonly Suelo[];
  /** La casilla pisable más cercana a cada casilla (ella misma si se pisa). */
  readonly fuente: Int32Array;
  /** La región de cada casilla pisable (componente de un mismo suelo), o -1. */
  readonly region: Int32Array;
  readonly regiones: readonly {
    readonly id: number;
    readonly suelo: Suelo;
    readonly casillas: number;
  }[];
  /** La franja de cada casilla de barrera, o -1. */
  readonly franjaDe: Int32Array;
  readonly franjas: readonly Franja[];
  /** Distancia (en casillas, 8-vecinas) de cada casilla de barrera a la primera que no es de su franja. */
  readonly hondura: Int32Array;
  readonly objetos: readonly MapObject[];
  /** Las casillas que ocupan los objetos y los nodos. */
  readonly ocupadas: ReadonlySet<number>;
  /** Lo que cruza cada nodo, por su id, mirado sobre el terreno del mapa. */
  readonly pasos: ReadonlyMap<string, PasoDeNodo>;
  /**
   * Los nodos que cruzan un río, por su id: llevan puente (`puentes.ts`) y su
   * casilla es agua en `terreno`. Se decide aquí y en ningún otro sitio.
   */
  readonly puentes: ReadonlySet<string>;
  /**
   * Las ciudades-puente (#144: la ciudad del cruce que toca el río, con el río
   * por debajo; `orillaDeLaCiudad`), por su id: la casilla de su orilla, donde
   * se pinta la ciudad, y la de enfrente. Su casilla es agua en `terreno` y
   * lleva un puente, como un nodo de `puentes`, que también la incluye.
   */
  readonly ciudadesPuente: ReadonlyMap<
    string,
    { readonly orilla: Point; readonly enfrente: Point }
  >;
  /**
   * Los nodos y ciudades a los que llega un camino, por su id: entre dos
   * niveles, el relieve los deja al bajo y el paso sin camino al alto.
   */
  readonly conCamino: ReadonlySet<string>;
  /**
   * La red del núcleo (`estructura`): la región de cada casilla y las regiones
   * de cada nodo. Es la que da el nivel (`relieve`); `region`, por suelo, sigue
   * para el material.
   */
  readonly red: Estructura;
  /** El nivel de cada región de `red`, por índice (`MapRegion.nivel`). */
  readonly niveles: readonly number[];
}

const VECINAS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Lo que cruza cada nodo, por su id: la barrera que guarda el mapa y el eje,
 * sobre el terreno DEL MAPA: en el de la escena, la casilla de un nodo de agua
 * ya es agua y contaría de vecina para el eje de los de al lado.
 */
function pasosDe(map: MapaDeEscena): Map<string, PasoDeNodo> {
  return new Map(
    map.objects.flatMap((o) =>
      o.kind === 'node' ? [[o.id, pasoDeNodo(o, map.width, map.terrain)] as const] : [],
    ),
  );
}

/**
 * El terreno que se viste: el del mapa con la casilla de cada nodo de `puentes`
 * (y de cada ciudad-puente, #144) puesta a `water` (#157). `buildMap` la deja de tierra, y así cortaba el río en
 * dos, quedaba a la altura de una orilla y no a la del agua, y el puente se
 * posaba en un tapón de tierra. Siendo agua, la franja une el río, el relieve la
 * baja con él y no tiene caras propias; el puente lo pone `puentes.ts` encima.
 * Los demás nodos siguen siendo tierra de paso.
 */
function terrenoDeLaEscena(
  map: MapaDeEscena,
  puentes: ReadonlySet<string>,
): readonly TerrainKind[] {
  if (puentes.size === 0) return map.terrain;
  const fuera = [...map.terrain];
  for (const o of map.objects) if (puentes.has(o.id)) fuera[o.at.y * map.width + o.at.x] = 'water';
  return fuera;
}

/**
 * La región de la casilla bajo el punto `(x, y)`, en casillas, si se pisa; -1 si
 * no se pisa o cae fuera del mapa. Vale con la casilla entera (`x`, `y`) o con
 * cualquier punto dentro de ella.
 */
export function regionPisable(
  a: Pick<Analisis, 'W' | 'H' | 'fuente' | 'region'>,
  x: number,
  y: number,
): number {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= a.W || cy >= a.H) return -1;
  const i = cy * a.W + cx;
  return a.fuente[i] === i ? (a.region[i] as number) : -1;
}

export function analizar(map: MapaDeEscena): Analisis {
  const W = map.width;
  const H = map.height;
  const pasos = pasosDe(map);
  const red = estructura(map);
  const ciudadesPuente = new Map(
    map.objects.flatMap((o) => {
      if (o.kind !== 'town') return [];
      const orilla = orillaDeLaCiudad(map, o.at, red.regionDe);
      return orilla === null ? [] : [[o.id, orilla] as const];
    }),
  );
  const puentes = new Set([
    ...[...pasos].flatMap(([id, p]) => (p.barrera === 'water' ? [id] : [])),
    ...ciudadesPuente.keys(),
  ]);
  const terreno = terrenoDeLaEscena(map, puentes);
  const ocupadas = new Set(map.objects.map((o) => o.at.y * W + o.at.x));
  const nodos = new Set(
    map.objects.filter((o) => o.kind === 'node').map((o) => o.at.y * W + o.at.x),
  );

  // Las franjas: componentes 4-conexos de una misma barrera.
  const franjaDe = new Int32Array(W * H).fill(-1);
  const franjas: Franja[] = [];
  for (let i = 0; i < W * H; i++) {
    const t = terreno[i] as TerrainKind;
    if (!esBarrera(t) || franjaDe[i] !== -1) continue;
    const id = franjas.length;
    const casillas: number[] = [];
    let alBorde = false;
    const pila = [i];
    franjaDe[i] = id;
    while (pila.length > 0) {
      const j = pila.pop() as number;
      casillas.push(j);
      const x = j % W;
      const y = (j - x) / W;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) alBorde = true;
      for (const [dx, dy] of VECINAS4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (franjaDe[k] === -1 && terreno[k] === t) {
          franjaDe[k] = id;
          pila.push(k);
        }
      }
    }
    const uso = casillas.length <= MANCHA_MAXIMA && !alBorde ? 'obstaculo' : 'borde';
    franjas.push({ id, barrera: t, casillas, uso });
  }

  // El suelo más cercano: BFS 8-vecino desde lo que se pisa (los nodos no, que son tierra de paso).
  const fuente = new Int32Array(W * H).fill(-1);
  const cola: number[] = [];
  for (let i = 0; i < W * H; i++)
    if (!esBarrera(terreno[i] as TerrainKind) && !nodos.has(i)) {
      fuente[i] = i;
      cola.push(i);
    }
  for (let q = 0; q < cola.length; q++) {
    const j = cola[q] as number;
    const x = j % W;
    const y = (j - x) / W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (fuente[k] === -1) {
          fuente[k] = fuente[j] as number;
          cola.push(k);
        }
      }
  }
  const suelo = Array.from(fuente, (f) => (f === -1 ? 'dirt' : terreno[f]) as Suelo);

  // Las regiones: componentes 4-conexos de un mismo suelo (los nodos no cuentan).
  const region = new Int32Array(W * H).fill(-1);
  const regiones: { id: number; suelo: Suelo; casillas: number }[] = [];
  for (let i = 0; i < W * H; i++) {
    if (fuente[i] !== i || region[i] !== -1) continue;
    const id = regiones.length;
    const s = terreno[i] as Suelo;
    let n = 0;
    const pila = [i];
    region[i] = id;
    while (pila.length > 0) {
      const j = pila.pop() as number;
      n++;
      const x = j % W;
      const y = (j - x) / W;
      for (const [dx, dy] of VECINAS4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (region[k] === -1 && fuente[k] === k && terreno[k] === s) {
          region[k] = id;
          pila.push(k);
        }
      }
    }
    regiones.push({ id, suelo: s, casillas: n });
  }

  // La hondura dentro de cada franja: BFS desde las casillas de su borde.
  const hondura = new Int32Array(W * H).fill(0);
  const cola2: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (franjaDe[i] === -1) continue;
    const x = i % W;
    const y = (i - x) / W;
    let enBorde = false;
    for (let dy = -1; dy <= 1 && !enBorde; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (franjaDe[ny * W + nx] !== franjaDe[i]) {
          enBorde = true;
          break;
        }
      }
    if (enBorde) {
      hondura[i] = 1;
      cola2.push(i);
    }
  }
  for (let q = 0; q < cola2.length; q++) {
    const j = cola2[q] as number;
    const x = j % W;
    const y = (j - x) / W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (franjaDe[k] === franjaDe[j] && hondura[k] === 0) {
          hondura[k] = (hondura[j] as number) + 1;
          cola2.push(k);
        }
      }
  }
  // Una franja que toca el borde del mapa sigue más allá: no hay borde allí.
  return {
    W,
    H,
    terreno,
    suelo,
    fuente,
    region,
    regiones,
    franjaDe,
    franjas,
    hondura,
    objetos: map.objects,
    ocupadas,
    pasos,
    puentes,
    ciudadesPuente,
    conCamino: new Set(
      map.objects.filter((o) => pasaElCamino(map.caminos.tramos, o.at)).map((o) => o.id),
    ),
    red,
    niveles: map.regions.map((r) => r.nivel),
  };
}
