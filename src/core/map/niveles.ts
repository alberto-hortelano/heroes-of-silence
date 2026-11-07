/**
 * El relieve de la red: el nivel de cada región llevado a cada casilla (#143,
 * #210) y lo que de él se juzga. Las franjas de barrera (`franjasDeBarrera`), el
 * nivel de cada casilla como lo pinta la escena (`nivelesDelRelieve`,
 * `nivelDelNodo`), cómo pasa una senda de una casilla a su vecina
 * (`pasoTorcido`, #224), las espigas y los acantilados sin caída, y por qué los
 * niveles de un plan no se pueden pintar (`problemasDeNiveles`, #209).
 *
 * Vivía en `regiones.ts` hasta la fase N de la reorganización (07-11-2026): lee
 * de allí la vecindad y la red, y la red no lo lee a él.
 */
import { aPunto } from './map.js';
import { casilla, estructura, laMasCercana, vecindad } from './regiones.js';
import {
  admiteLosNiveles,
  BARRERAS,
  BARRERAS_DE_DESNIVEL,
  type Barrera,
  esBarrera,
  isWalkable,
  type TerrainKind,
} from './terrain.js';
import type { GameMap, MapRegion } from './tipos.js';

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
    cercana ??= laMasCercana(region, width, height);
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
