/**
 * Vestir una red de nodos ya validada: fronteras gruesas y variadas, obstáculos
 * dentro de cada región y caminos entre lo que importa (ciclo «mapas densos»,
 * 03-10-2026).
 *
 * El generador (`generate.ts`) traza la red fina de siempre —Voronoi en espejo,
 * muro de una casilla, nodos, `problemasDeRed` y perfil de saltos— y **solo
 * después** la viste con lo de aquí. El orden es lo que hace segura la mitad
 * que más miedo daba: todo lo que este módulo hace es **convertir casillas
 * pisables en barrera**, y añadir muro nunca abre un paso. Lo único que puede
 * romper es partir una región o dejar algo sin alcanzar, y las dos cosas se
 * miran antes de aceptar cada cambio (o se rechaza el vestido entero). El grafo
 * de regiones y nodos es el mismo que validó el perfil, así que el equilibrio
 * entre las dos bases no se toca. Y por eso un vestido que falla **no tira la
 * red**: el generador vuelve a vestir la misma.
 *
 * Todo es puro y determinista: el único azar es el `rng` que se pasa.
 */
import { BARRERAS_DEL_MAPA, type BarreraConPeso } from '../data.js';
import { largoALaEscala } from '../escala.js';
import type { Rng } from '../rng.js';
import { Frontera } from './frontera.js';
import { type ConPuerta, rodeosParaEntrar } from './puertas.js';
import {
  acantiladosSinCaida,
  aPunto,
  espigasDelRelieve,
  franjasDeBarrera,
  type NodoDelRelieve,
  nivelesDelRelieve,
  type PasoTorcido,
  pasoTorcido,
  rellenar,
  vecindad,
} from './regiones.js';
import {
  admiteLosNiveles,
  BARRERAS,
  BARRERAS_DE_DESNIVEL,
  type Barrera,
  costeDeEntrada,
  type Nivel,
  type Suelo,
  type TerrainKind,
} from './terrain.js';

/** Sin barrera en `Tipos`: la casilla se pisa. */
export const ABIERTA = -1;

/**
 * La barrera de cada casilla, como índice en `BARRERAS`, o `ABIERTA`. Una sola
 * rejilla para frontera y obstáculos: los dos se emiten como `walls` del plan.
 */
export type Tipos = Int8Array;

/** El tipo de una casilla como terreno, o `null` si se pisa. */
export function barreraDe(tipos: Tipos, i: number): Barrera | null {
  const t = tipos[i] as number;
  return t === ABIERTA ? null : (BARRERAS[t] as Barrera);
}

/** La pareja de una región en el espejo: las regiones 2k y 2k+1 son espejo. */
export const parejaDe = (r: number): number => (r % 2 === 0 ? r + 1 : r - 1);

/** La casilla espejo de `i` en un mapa de `N` casillas: el giro de 180° del generador. */
export const espejoDe = (i: number, N: number): number => N - 1 - i;

/** Un sorteo por pesos con el `rng` de la partida: la única forma de elegir barrera. */
function sortear(rng: Rng, candidatas: readonly BarreraConPeso[]): Barrera {
  const total = candidatas.reduce((s, c) => s + c.peso, 0);
  if (total <= 0) throw new Error('no hay barreras candidatas que sortear');
  let tirada = rng.int(0, total - 1);
  for (const c of candidatas) {
    if (tirada < c.peso) return c.barrera;
    tirada -= c.peso;
  }
  throw new Error('el sorteo de barrera se ha salido de la tabla');
}

/** Las candidatas de una frontera: las de los dos suelos, sumadas por barrera. */
function candidatasDeFrontera(a: Suelo, b: Suelo): BarreraConPeso[] {
  const suma = new Map<Barrera, number>();
  for (const fila of [BARRERAS_DEL_MAPA.frontera[a], BARRERAS_DEL_MAPA.frontera[b]]) {
    for (const c of fila) suma.set(c.barrera, (suma.get(c.barrera) ?? 0) + c.peso);
  }
  // En el orden de `BARRERAS` y no en el de inserción, para que la tabla no
  // dependa del orden en que se escribieron las filas del JSON.
  return BARRERAS.filter((b) => suma.has(b)).map((b) => ({ barrera: b, peso: suma.get(b)! }));
}

/**
 * Las barreras que puede llevar la frontera entre dos regiones (#143): las de
 * sus suelos (`candidatasDeFrontera`), y de ellas, si las dos están al mismo
 * nivel, todas menos el acantilado —sería un cañón o una cresta, no el borde de
 * nada—, y si no, solo las que se leen como el borde de una meseta
 * (`BARRERAS_DE_DESNIVEL`): un bosque o un muro entre dos niveles dejaba la cara
 * de roca al pie de los árboles. Es la única regla de qué barrera admite una
 * pareja: la leen el reparto de las garantizadas y el sorteo del resto.
 *
 * **Lanza** si no queda ninguna: es un choque entre `data/barreras.json` y
 * `data/relieve.json`, no un vestido que se pueda repetir.
 */
export function barrerasDeLaPareja(
  a: Suelo,
  b: Suelo,
  nivelA: Nivel,
  nivelB: Nivel,
): BarreraConPeso[] {
  const quedan = candidatasDeFrontera(a, b).filter((c) =>
    admiteLosNiveles(c.barrera, [nivelA, nivelB]),
  );
  if (quedan.length === 0) {
    throw new Error(
      `la frontera entre ${a} (nivel ${nivelA}) y ${b} (nivel ${nivelB}) no admite ninguna barrera: ` +
        (nivelA === nivelB
          ? 'data/barreras.json solo le da acantilado, que no va entre dos regiones al mismo nivel'
          : `data/barreras.json no le da ninguna de ${BARRERAS_DE_DESNIVEL.join(', ')}, y data/relieve.json las pone a distinto nivel`),
    );
  }
  return quedan;
}

const indiceDe = (b: Barrera): number => BARRERAS.indexOf(b);

/**
 * La candidata de más peso; en un empate, la primera en el orden de `BARRERAS`.
 * Es la elección sin tirada: la usa lo que corrige una barrera ya sorteada
 * (la muralla larga, la ruina pegada a otro muro), para que corregir no mueva
 * el azar de todo lo que viene después y el mapa cambie solo donde se corrige.
 */
function laMasPesada(candidatas: readonly BarreraConPeso[]): Barrera {
  let mejor: BarreraConPeso | undefined;
  for (const b of BARRERAS) {
    const c = candidatas.find((x) => x.barrera === b);
    if (c !== undefined && (mejor === undefined || c.peso > mejor.peso)) mejor = c;
  }
  if (mejor === undefined) throw new Error('no hay barreras candidatas entre las que elegir');
  return mejor.barrera;
}

/** La lista barajada con el `rng` (Fisher-Yates), sin tocar la de entrada. */
function barajar<T>(rng: Rng, lista: readonly T[]): T[] {
  const fuera = [...lista];
  for (let i = fuera.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [fuera[i], fuera[j]] = [fuera[j] as T, fuera[i] as T];
  }
  return fuera;
}

/**
 * `cuantos` barreras distintas, cada una a una frontera distinta que la admita:
 * un emparejamiento máximo (Kuhn) entre barreras y fronteras, en orden barajado
 * para que no salgan siempre las mismas. Devuelve, por índice de frontera, la
 * barrera que le toca; o `null` si los suelos del mapa no dan para tantas, que
 * es lo único que de verdad no tiene arreglo sorteando otra vez.
 */
function repartirDistintas(
  rng: Rng,
  admite: readonly (readonly Barrera[])[],
  cuantos: number,
): Map<number, Barrera> | null {
  const fronteras = barajar(
    rng,
    admite.map((_, k) => k),
  );
  const deFrontera = new Map<number, Barrera>();
  const intentar = (b: Barrera, vistas: Set<number>): boolean => {
    for (const f of fronteras) {
      if (vistas.has(f) || !admite[f]!.includes(b)) continue;
      vistas.add(f);
      const ocupada = deFrontera.get(f);
      if (ocupada === undefined || intentar(ocupada, vistas)) {
        deFrontera.set(f, b);
        return true;
      }
    }
    return false;
  };
  for (const b of barajar(rng, BARRERAS)) {
    if (deFrontera.size === cuantos) break;
    intentar(b, new Set());
  }
  return deFrontera.size === cuantos ? deFrontera : null;
}

// ---------------------------------------------------------------- fronteras

export interface EntradaDeEngorde {
  readonly W: number;
  readonly H: number;
  /** La celda de Voronoi de cada casilla: el índice de su semilla. */
  readonly etiqueta: Int32Array;
  /** El muro fino de la red validada: 1 en cada casilla de muro, nodos incluidos. */
  readonly muro: Uint8Array;
  /** Las casillas de los nodos de la red, por índice plano. */
  readonly nodos: readonly number[];
  /**
   * Las casillas de los nodos que son ciudad (las bases y las neutrales): una
   * muralla no va de una a otra (`murallasLargas`).
   */
  readonly ciudades: readonly number[];
  /**
   * Las casillas de los nodos que llevarán camino (`crucesConCamino`): van al
   * nivel bajo de los que cruzan, como las ciudades (`nivelDelNodo`).
   */
  readonly conCamino: readonly number[];
  /** Las semillas de las regiones, por índice de región (= etiqueta). */
  readonly semillas: readonly { readonly x: number; readonly y: number }[];
  /** El suelo de cada región, por índice de región. */
  readonly suelos: readonly Suelo[];
  /** El nivel de cada región, por índice de región: decide qué barreras admite cada pareja. */
  readonly niveles: readonly Nivel[];
  readonly rng: Rng;
}

export interface Engordado {
  /** Frontera ya gruesa: la barrera de cada casilla de muro, o `ABIERTA`. */
  readonly tipos: Tipos;
  /**
   * Los pasillos de entrada: por cada nodo y región que toca, las casillas que
   * no se engordaron para que el nodo siga abriendo a esa región. Nada se pone
   * encima: ni objetos, ni obstáculos.
   */
  readonly pasillo: Uint8Array;
  /** La casilla de cada región, movida si la de la semilla se engordó. */
  readonly semillas: readonly { readonly x: number; readonly y: number }[];
  /**
   * La barrera que cruza cada nodo de `nodos`, en su orden (`queCruzaElNodo`).
   * El plan la escribe bajo el nodo, y `buildMap` la guarda al abrirlo.
   */
  readonly barreraDeNodo: readonly Barrera[];
}

/**
 * Hasta dónde llega el estrechamiento de un nodo, en Chebyshev: más allá, dos
 * regiones distintas no pueden quedar a menos de tres pasos. Es la excepción al
 * grosor que el usuario aprobó, con la medida que fijó el plan.
 */
export const RADIO_DEL_PASO = 3;

/**
 * Cada cuántas casillas de frontera puede cambiar de lado el que engorda donde
 * dos regiones quedarían a dos pasos (`engordarFronteras`, paso 4b). Medido en
 * un prototipo (#169, 07-10-2026, tramos rectos de ≥ 8 en 1-300): con 2, 36;
 * con 4, 23; con 6, 22, y la de 6 con más mapas con un tramo de ≥ 10. Son
 * cuentas que bailan ±10 con otra tirada de monedas: 4 es «de 3 a 6», no un
 * óptimo.
 */
export const TRECHO_DEL_LADO = 4;

/** Cuántos tipos de barrera distintos lleva, como poco, la frontera de un mapa (criterio del usuario). */
export const TIPOS_POR_MAPA = 4;

/**
 * La frontera gruesa: de una casilla de muro a 2-3, con su tipo.
 *
 * - **El tipo es por pareja de regiones** y sale de `data/barreras.json` con
 *   los suelos de los dos lados, entre las que admiten sus niveles
 *   (`barrerasDeLaPareja`). La pareja espejo lleva el mismo. Y **cada mapa
 *   lleva al menos `TIPOS_POR_MAPA` distintos**: primero se le dan cuatro
 *   barreras distintas a cuatro fronteras que las admitan, y el resto se sortea
 *   por pesos. Una tabla de pesos decide qué va con qué; la variedad del mapa
 *   entero no la puede garantizar una tabla, así que se construye.
 * - **El grosor**: cada casilla de muro fino es de la pareja (su celda, la menor
 *   de sus vecinas). Cada casilla pegada al muro engorda o no a cara o cruz,
 *   casilla a casilla y reflejado; y donde así quedarían dos casillas pisables
 *   de regiones distintas a menos de tres pasos, engorda una de las dos, la del
 *   lado que la pareja sorteó (`ladoGordo`, que ya solo desempata). Así quedan
 *   a tres pasos como poco —una de muro fino y una de cada lado, o dos de uno—
 *   y el borde no copia el muro fino. Antes el lado gordo engordaba entero y el
 *   flaco iba en bloques de 4×4: el gordo era la dilatación del bisector de
 *   Voronoi, con sus escalones fundidos, y el 74 % de los tramos rectos de ≥ 6
 *   casillas salían de ahí (#169, medido el 07-10-2026 en 300 semillas).
 * - **Los pasillos**: el nodo es un estrechamiento de una casilla, y desde él
 *   hasta la primera casilla que no se engorda de cada región que toca se
 *   protege un camino. Es la excepción al grosor, y es la que el usuario aprobó.
 *   Las dos primeras son **opuestas** (`ejeDelNodo`: recta, diagonal o, junto
 *   al borde, corta) y se protegen hasta la segunda casilla en el eje; todos los
 *   caminos van en cruz. Así el nodo no sale en esquina y su entrada no queda
 *   unida a la región solo por una diagonal (#161).
 * - **Los bolsillos**: si engordar deja un trozo de región separado del resto y
 *   sin pasillo, se rellena; si lo tiene, el vestido no vale —sería una zona a
 *   la que solo se llega por ese nodo y que no es región de nadie—.
 *
 * Devuelve el motivo, en vez del engorde, cuando este vestido no vale.
 */
export function engordarFronteras(e: EntradaDeEngorde): Engordado | string {
  const { W, H, etiqueta, muro, rng, suelos } = e;
  const N = W * H;
  const regiones = e.semillas.length;
  const tipos: Tipos = new Int8Array(N).fill(ABIERTA);
  const esNodo = new Uint8Array(N);
  for (const n of e.nodos) esNodo[n] = 1;

  // 1. La pareja de cada casilla de muro fino —su celda y la menor de sus
  //    vecinas: de ella sale su tipo— y **todas las celdas que se asoman a
  //    ella**: la suya y las de sus vecinas. Dos casillas pisables de regiones
  //    distintas a dos pasos tienen en medio una casilla de muro que las ve a
  //    las dos, y es esa pareja, y no la del tipo, la que decide quién engorda:
  //    con solo la del tipo, junto a un cruce de tres regiones los dos lados
  //    se quedaban flacos (semilla 36 en 34×34).
  const parejaDeMuro = new Int32Array(N).fill(-1);
  const asomadas: (readonly number[])[] = new Array(N);
  const clavesDeMuro: number[] = [];
  const claves: number[] = [];
  const clave = (a: number, b: number): number => Math.min(a, b) * regiones + Math.max(a, b);
  const claveEspejo = (k: number): number =>
    clave(parejaDe(Math.floor(k / regiones)), parejaDe(k % regiones));
  const { desde, vecinas } = vecindad(W, H);
  for (let i = 0; i < N; i++) {
    if (muro[i] === 0) continue;
    const propia = etiqueta[i] as number;
    const celdas = new Set([propia]);
    for (let v = desde[i]!; v < desde[i + 1]!; v++) celdas.add(etiqueta[vecinas[v]!] as number);
    const lista = [...celdas].sort((a, b) => a - b);
    const k = clave(lista[0] as number, propia);
    parejaDeMuro[i] = k;
    clavesDeMuro.push(k);
    claves.push(k);
    asomadas[i] = lista;
    for (const a of lista) for (const b of lista) if (a < b) claves.push(clave(a, b));
  }

  // 2. Tipo y lado gordo de cada pareja, en orden de descubrimiento; la espejo,
  //    lo mismo reflejado. Las fronteras canónicas —una por pareja de espejos—
  //    reciben primero sus `TIPOS_POR_MAPA` barreras distintas.
  const canonicas: number[] = [];
  {
    const vistas = new Set<number>();
    for (const k of new Set(clavesDeMuro)) {
      if (vistas.has(k)) continue;
      canonicas.push(k);
      vistas.add(k);
      vistas.add(claveEspejo(k));
    }
  }
  const candidatasDe = (k: number): BarreraConPeso[] => {
    const a = Math.floor(k / regiones);
    const b = k % regiones;
    return barrerasDeLaPareja(suelos[a]!, suelos[b]!, e.niveles[a]!, e.niveles[b]!);
  };
  // Solo puede llevar una barrera garantizada la frontera que tiene muro fino
  // **que sobreviva**: las casillas de nodo las abre `buildMap`, y una pareja
  // cuyo muro eran solo nodos se quedaba con su barrera en el plan y en ninguna
  // casilla del mapa (QA, semillas 864 y 986). Se exige la mitad del mínimo en
  // muro fino, que al engordar a 2-3 casillas da de sobra; quien de verdad
  // decide si llega es la cuenta del final, sobre la frontera ya gruesa.
  const { casillasMinimasPorTipo } = BARRERAS_DEL_MAPA;
  const finoQueQueda = new Map<number, number>();
  for (let i = 0; i < N; i++) {
    if (muro[i] === 0 || esNodo[i] === 1) continue;
    const k = parejaDeMuro[i] as number;
    finoQueQueda.set(k, (finoQueQueda.get(k) ?? 0) + 1);
  }
  const fino = (k: number): number =>
    (finoQueQueda.get(k) ?? 0) +
    (claveEspejo(k) === k ? 0 : (finoQueQueda.get(claveEspejo(k)) ?? 0));
  const hacenFalta = Math.min(TIPOS_POR_MAPA, canonicas.length);
  const distintas = repartirDistintas(
    rng,
    canonicas.map((k) =>
      fino(k) * 2 >= casillasMinimasPorTipo ? candidatasDe(k).map((c) => c.barrera) : [],
    ),
    hacenFalta,
  );
  if (distintas === null) {
    return `las fronteras de este mapa (suelos ${[...new Set(suelos)].join(', ')}) no admiten ${hacenFalta} barreras distintas con ${casillasMinimasPorTipo} casillas cada una`;
  }
  // Por clave de pareja: su barrera (índice en `BARRERAS`) y el lado que engorda
  // cuando hay que elegir (la reparación del paso 4b).
  const tipoDePareja = new Int8Array(regiones * regiones).fill(ABIERTA);
  const ladoGordo = new Int32Array(regiones * regiones).fill(-1);
  for (const [f, b] of distintas) {
    const k = canonicas[f] as number;
    tipoDePareja[k] = indiceDe(b);
    tipoDePareja[claveEspejo(k)] = indiceDe(b);
  }
  for (const k of new Set(claves)) {
    if (ladoGordo[k] !== -1) continue;
    if (tipoDePareja[k] === ABIERTA) {
      const tipo = indiceDe(sortear(rng, candidatasDe(k)));
      tipoDePareja[k] = tipo;
      if (tipoDePareja[claveEspejo(k)] === ABIERTA) tipoDePareja[claveEspejo(k)] = tipo;
    }
    const lado = rng.chance(0.5) ? Math.floor(k / regiones) : k % regiones;
    ladoGordo[k] = lado;
    if (ladoGordo[claveEspejo(k)] === -1) ladoGordo[claveEspejo(k)] = parejaDe(lado);
  }
  for (let i = 0; i < N; i++) {
    if (muro[i] === 1) tipos[i] = tipoDePareja[parejaDeMuro[i] as number] as number;
  }

  // 3. El ruido: una tirada por casilla de la mitad de arriba, y la de abajo,
  //    su reflejo. Por casilla y no en bloques: un bloque de 4×4 deja bordes
  //    de cuatro alineados a la rejilla, y uno de 2×2 aún daba el doble de
  //    tramos de ≥ 8 que por casilla (medidas.txt de #169).
  const caras = Array.from({ length: Math.ceil(N / 2) }, () => rng.chance(0.5));
  const ruido = (i: number): boolean => caras[Math.min(i, espejoDe(i, N))] as boolean;

  // 4. Qué casilla pegada al muro se engorda, y con qué. La barrera es la de la
  //    pareja de la que es lado gordo, si lo es de alguna; si no, la del primer
  //    muro que toca.
  const engorda = new Int8Array(N).fill(ABIERTA);
  // La barrera que tocaría a cada casilla pegada al muro, la engorde el ruido o
  // no: la usan la reparación y el paso 5 cuando tienen que engordar a la fuerza.
  const pegada = new Int8Array(N).fill(ABIERTA);
  for (let i = 0; i < N; i++) {
    if (muro[i] === 1) continue;
    const propia = etiqueta[i] as number;
    let tipo = ABIERTA;
    let delGordo = false;
    for (let v = desde[i]!; v < desde[i + 1]! && !delGordo; v++) {
      const j = vecinas[v]!;
      if (muro[j] === 0) continue;
      if (tipo === ABIERTA) tipo = tipos[j] as number;
      for (const otra of asomadas[j] ?? []) {
        if (otra === propia) continue;
        const k = clave(propia, otra);
        if (ladoGordo[k] === propia) {
          tipo = tipoDePareja[k] as number;
          delGordo = true;
          break;
        }
      }
    }
    if (tipo === ABIERTA) continue;
    pegada[i] = tipo;
    if (ruido(i)) engorda[i] = tipo;
  }
  // 4b. La reparación: el ruido deja sitios donde dos casillas pisables de
  //     regiones distintas quedan a Chebyshev ≤ 2, y ahí engorda una de las dos;
  //     si esa no está pegada al muro —no hay barrera que darle—, la otra. Es la
  //     regla de antes («dos pisables de regiones distintas, a tres pasos como
  //     poco») aplicada donde hace falta y no a todo el lado de la pareja.
  //
  //     Cuál de las dos lo dice el lado gordo de la pareja, **dado la vuelta a
  //     trechos** de `TRECHO_DEL_LADO` casillas a lo largo de la frontera. Con
  //     el lado gordo fijo, en un muro recto cada casilla abierta de un lado
  //     obliga a engordar las cinco de enfrente, y el lado gordo salía entero:
  //     el muro dilatado, recto, otra vez (s24 y s2 de #169). A trechos, los dos
  //     lados se reparten lo recto. Medido en 1-2000 (34×34) contra el lado
  //     fijo: tramos de ≥ 8, 256 → 214; filas de caras de ≥ 10, 52 → 29.
  //     La moneda del trecho va en espejo: la pareja reflejada da la vuelta en
  //     el trecho reflejado, y su lado gordo ya es el reflejado.
  const bw = Math.ceil((2 * W - 1) / (2 * TRECHO_DEL_LADO));
  const bh = Math.ceil((2 * H - 1) / (2 * TRECHO_DEL_LADO));
  const trechos = Array.from({ length: bw * bh }, () => rng.chance(0.5));
  // Por el punto medio de las dos casillas, en coordenadas dobladas para que
  // sea entero: la misma moneda la vea quien la vea de las dos.
  const trecho = (sx: number, sy: number): number =>
    Math.floor(sy / (2 * TRECHO_DEL_LADO)) * bw + Math.floor(sx / (2 * TRECHO_DEL_LADO));
  const elQueEngorda = (i: number, q: number): number => {
    const a = etiqueta[i] as number;
    const b = etiqueta[q] as number;
    const gordo = ladoGordo[clave(a, b)] as number;
    if (gordo === -1) return a;
    const sx = (i % W) + (q % W);
    const sy = Math.floor(i / W) + Math.floor(q / W);
    const vuelta = trechos[Math.min(trecho(sx, sy), trecho(2 * W - 2 - sx, 2 * H - 2 - sy))];
    return vuelta ? (gordo === a ? b : a) : gordo;
  };
  for (let i = 0; i < N; i++) {
    if (muro[i] === 1 || engorda[i] !== ABIERTA || pegada[i] === ABIERTA) continue;
    const a = etiqueta[i] as number;
    const { x, y } = aPunto(i, W);
    for (let dy = -2; dy <= 2 && engorda[i] === ABIERTA; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
        const q = (y + dy) * W + x + dx;
        if (muro[q] === 1 || engorda[q] !== ABIERTA || etiqueta[q] === a) continue;
        if (elQueEngorda(i, q) !== a && pegada[q] !== ABIERTA) {
          engorda[q] = pegada[q] as number;
          continue;
        }
        engorda[i] = pegada[i] as number;
        break;
      }
    }
  }

  // 5. Los pasillos. Primero el eje de cada nodo: dos entradas opuestas que
  //    siguen por tierra en cruz; luego, a cada región que toca y el eje no
  //    cubre, la vecina de siempre. Y de cada entrada, un camino en cruz hasta
  //    la primera casilla que no se engorda.
  const pasillo = new Uint8Array(N);
  for (const n of e.nodos) {
    const x = n % W;
    const y = Math.floor(n / W);
    const tramos: { arranque: number; protegidas: readonly number[] }[] = [];
    const hechas = new Set<number>();
    const eje = ejeDelNodo(W, H, x, y, etiqueta, muro);
    for (const lado of eje ?? []) {
      hechas.add(etiqueta[lado[0]!] as number);
      tramos.push({ arranque: lado[lado.length - 1]!, protegidas: lado });
    }
    const rectas: number[] = [];
    const oblicuas: number[] = [];
    for (let k = desde[n]!; k < desde[n + 1]!; k++) {
      const v = vecinas[k]!;
      if (muro[v] === 1) continue;
      (v % W === x || Math.floor(v / W) === y ? rectas : oblicuas).push(v);
    }
    for (const v of [...rectas, ...oblicuas]) {
      const r = etiqueta[v] as number;
      if (hechas.has(r)) continue;
      hechas.add(r);
      tramos.push({ arranque: v, protegidas: [] });
    }
    for (const { arranque, protegidas } of tramos) {
      const r = etiqueta[arranque] as number;
      const camino = caminoHastaLibre(W, H, arranque, r, etiqueta, muro, engorda);
      if (camino === null) {
        return `el nodo de (${x},${y}) se queda sin entrada a la región ${r} al engordar`;
      }
      for (const c of protegidas) pasillo[c] = 1;
      for (const c of camino) pasillo[c] = 1;
    }
  }
  // Un pasillo largo deja su lado flaco más allá del estrechamiento del nodo:
  // cuando todas las casillas de la región junto al nodo están pegadas al muro
  // —una región que bordea el mapa en una tira de dos—, el pasillo corre por
  // ellas hasta la primera libre y protege una frontera de una casilla a cuatro
  // del nodo (QA, semilla 987 en 34×34). Ahí engorda **el otro lado**, a la
  // fuerza: lo que el pasillo no deja engordar a una región lo engorda la de
  // enfrente. Si lo de enfrente es pasillo también, no hay grosor posible.
  const cerca = new Uint8Array(N);
  for (const n of e.nodos) {
    const { x, y } = aPunto(n, W);
    for (let dy = -RADIO_DEL_PASO; dy <= RADIO_DEL_PASO; dy++) {
      for (let dx = -RADIO_DEL_PASO; dx <= RADIO_DEL_PASO; dx++) {
        if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H)
          cerca[(y + dy) * W + x + dx] = 1;
      }
    }
  }
  for (let i = 0; i < N; i++) {
    if (pasillo[i] === 0 || cerca[i] === 1 || pegada[i] === ABIERTA) continue;
    const { x, y } = aPunto(i, W);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
        const q = (y + dy) * W + x + dx;
        if (muro[q] === 1 || cerca[q] === 1 || etiqueta[q] === etiqueta[i]) continue;
        if (pasillo[q] === 1) {
          return `los pasillos de dos regiones corren a dos casillas en (${x},${y}), lejos de cualquier nodo`;
        }
        engorda[q] = pegada[q] !== ABIERTA ? (pegada[q] as number) : (pegada[i] as number);
      }
    }
  }
  for (let i = 0; i < N; i++) {
    if (pasillo[i] === 0 && engorda[i] !== ABIERTA) tipos[i] = engorda[i] as number;
  }

  // La región de cada casilla que se pisa, de aquí en adelante. Hasta el paso 5
  // es la celda de Voronoi, pero el acantilado se adelgaza abriendo casillas de
  // la celda de enfrente a la meseta (`adelgazarAcantilados`, #215), y de ellas
  // leen la región los bolsillos, los cruces y las espigas.
  const region = Int32Array.from(etiqueta);

  // 6. Los bolsillos: cada región se queda con un trozo; los demás se rellenan
  //    si no llevan pasillo, y si lo llevan el vestido no vale. Se mira otra vez
  //    después de quitar las espigas (paso 7b), que también rellena.
  const semillas = [...e.semillas];
  const bolsillos = (): string | null => {
    const comp = new Int32Array(N).fill(-1);
    const trozos: { region: number; casillas: number[]; pasillo: boolean }[] = [];
    for (let i = 0; i < N; i++) {
      if (comp[i] !== -1 || tipos[i] !== ABIERTA || esNodo[i] === 1) continue;
      const n = trozos.length;
      const toma = (j: number): boolean => {
        if (comp[j] !== -1 || tipos[j] !== ABIERTA || esNodo[j] === 1) return false;
        comp[j] = n;
        return true;
      };
      toma(i);
      const casillas = rellenar(W, H, i, toma).sort((a, b) => a - b);
      trozos.push({
        region: region[i] as number,
        casillas,
        pasillo: casillas.some((c) => pasillo[c] === 1),
      });
    }
    for (let r = 0; r < regiones; r++) {
      const suyos = trozos.filter((t) => t.region === r);
      if (suyos.length === 0) return `la región ${r} se queda sin casillas al engordar`;
      const s = semillas[r]!;
      const deLaSemilla = comp[s.y * W + s.x] === -1 ? undefined : trozos[comp[s.y * W + s.x]!];
      const elegido =
        deLaSemilla ?? suyos.reduce((m, t) => (t.casillas.length > m.casillas.length ? t : m));
      for (const t of suyos) {
        if (t === elegido) continue;
        if (t.pasillo) {
          return `la región ${r} queda partida al engordar, y el trozo suelto tiene la entrada de un nodo`;
        }
        const relleno = tipoVecino(W, H, t.casillas, tipos);
        for (const c of t.casillas) tipos[c] = relleno;
      }
      if (deLaSemilla === undefined) semillas[r] = aPunto(elegido.casillas[0] as number, W);
    }
    return null;
  };
  const partida6 = bolsillos();
  if (partida6 !== null) return partida6;

  // 6b. Los cruces, coherentes con los niveles (#143): la barrera es por
  //     pareja, pero junto a un cruce de tres regiones la de una pareja llega a
  //     tocar la tercera (`desnivelEnLosCruces`). Antes de las murallas: no
  //     pone muro, y lo que el paso 7 pone en su lugar ya mira los niveles.
  desnivelEnLosCruces(W, H, tipos, region, esNodo, e.niveles);

  // 7. Las murallas cortas (#208): la barrera que cruza cada nodo depende de lo
  //    que tiene alrededor, y una muralla larga se vuelve otra barrera, así que
  //    se repite hasta que no queda ninguna. Solo quita muro: acaba.
  let barreraDeNodo = barrerasDeLosNodos(e, tipos, esNodo, clave, tipoDePareja, candidatasDe);
  const esCiudad = new Set(e.ciudades);
  const alBajo = new Set([...e.ciudades, ...e.conCamino]);
  // Con todas las regiones a un nivel no hay desnivel ni espigas: el 11 % de
  // los mapas de 1-200 con los pesos de #210.
  const llano = e.niveles.every((n) => n === e.niveles[0]);
  /** Lo que se quedó de muro al partir una muralla: no se vuelve a partir. */
  const partida = new Uint8Array(N);
  /** Cuántas veces se han buscado caídas largas (`quebrarCaidas`). */
  let quiebros = 0;
  const quebrar = (): boolean => {
    if (llano || quiebros >= VUELTAS_DE_QUIEBROS) return false;
    quiebros++;
    return quebrarCaidas(W, H, tipos, region, esNodo, pasillo, cerca, nivelAhora());
  };
  /** El nivel de cada casilla tal como está ahora el engorde, con la regla de la escena. */
  const nivelAhora = (): Int8Array =>
    nivelesDeLoEngordado(
      W,
      H,
      tipos,
      region,
      esNodo,
      e.niveles,
      e.nodos,
      barreraDeNodo,
      alBajo,
      esCiudad,
    );
  for (let vuelta = 0; ; vuelta++) {
    for (;;) {
      const largas = murallasLargas(e, tipos, esNodo, barreraDeNodo);
      if (largas.length === 0) {
        // 7a. El acantilado, una línea de una casilla (#215): lo que sobra pasa
        //     a la meseta. Abrir casillas cambia lo que rodea a los nodos, y
        //     con ello su barrera y quizá una muralla: se vuelve a mirar. Ya
        //     delgado, la puerta de una ciudad no muerde la línea (#222).
        if (
          !adelgazarAcantilados(W, H, tipos, region, esNodo, e.niveles, nivelAhora) &&
          !puertasSinMuesca(W, H, tipos, region, esNodo, pasillo, e.niveles, e.ciudades)
        )
          break;
        // La meseta que crece puede llegar a un bosque o un muro de la pareja
        // de al lado, que va entre dos regiones más bajas: la regla de los
        // cruces (6b) le da la barrera de desnivel donde toca a la meseta.
        desnivelEnLosCruces(W, H, tipos, region, esNodo, e.niveles);
        barreraDeNodo = barrerasDeLosNodos(e, tipos, esNodo, clave, tipoDePareja, candidatasDe);
        continue;
      }
      const hechas = new Set<number>();
      for (const larga of largas) {
        if (hechas.has(larga[0] as number)) continue;
        // La espejo, con la misma barrera: el mapa va en espejo y sus suelos son
        // los de la pareja, que son los mismos.
        const espejo = new Set(larga.map((c) => espejoDe(c, N)));
        const reflejada = largas.find((l) => espejo.has(l[0] as number));
        const lados = new Set<number>();
        for (const c of larga)
          for (let v = desde[c]!; v < desde[c + 1]!; v++) {
            const j = vecinas[v]!;
            if (tipos[j] === ABIERTA && esNodo[j] === 0) lados.add(region[j] as number);
          }
        // De lo que admiten sus suelos, primero lo que el mapa aún no tiene con
        // sus `casillasMinimasPorTipo`: si el muro era de las barreras
        // repartidas, la que lo sustituye mantiene la variedad que pide el paso
        // 8 en vez de engordar una que ya la daba.
        const admitidas = candidatasSinMuro(
          [...lados].map((r) => suelos[r] as Suelo),
          [...lados].map((r) => e.niveles[r] as Nivel),
        );
        const cuantas = new Int32Array(BARRERAS.length);
        for (let i = 0; i < N; i++)
          if (tipos[i] !== ABIERTA && esNodo[i] === 0) cuantas[tipos[i]!]! += 1;
        const nuevas = admitidas.filter(
          (c) => cuantas[indiceDe(c.barrera)]! < BARRERAS_DEL_MAPA.casillasMinimasPorTipo,
        );
        const otra = indiceDe(laMasPesada(nuevas.length > 0 ? nuevas : admitidas));
        // Con puertas, la primera vez se parte: el muro se queda alrededor de
        // cada una y el resto toma la otra barrera. Sin partir, las puertas de
        // muralla casi desaparecían: iban en murallas largas, y en 1-40 solo
        // quedaban en un mapa (con partir, 297 → 237 en 1-200).
        // Si lo que queda aún no vale —dos puertas juntas, o una entre dos
        // ciudades—, la segunda vez va entera.
        const puertas = e.nodos.filter(
          (n, k) => barreraDeNodo[k] === 'wall' && !esCiudad.has(n) && larga.includes(n),
        );
        const partir = puertas.length > 0 && !larga.some((c) => partida[c] === 1);
        const cercaDeUna = (c: number, l: readonly number[]): boolean =>
          l.some(
            (n) =>
              esNodo[n] === 1 &&
              puertas.some((p) => p === n || espejoDe(p, N) === n) &&
              Math.max(
                Math.abs((c % W) - (n % W)),
                Math.abs(Math.floor(c / W) - Math.floor(n / W)),
              ) <= RADIO_DE_LA_PUERTA,
          );
        for (const l of [larga, reflejada ?? []]) {
          hechas.add(l[0] as number);
          for (const c of l) {
            if (partir && cercaDeUna(c, l)) partida[c] = 1;
            else tipos[c] = otra;
          }
          // Un hueco de una casilla entre dos trozos partidos los deja en la
          // misma fila o columna con sus puntas a dos: dos torres obligadas en
          // columna, que se apilan (s3 (11,6)-(11,8) con los niveles del mapa,
          // #143). Es una muralla con dos puertas juntas: se cierra el hueco y la
          // vuelta siguiente la juzga entera.
          if (partir)
            for (const c of l) {
              if (partida[c] === 1) continue;
              const x = c % W;
              const enMedio = (d: number) =>
                c - d >= 0 && c + d < N && partida[c - d] === 1 && partida[c + d] === 1;
              if ((x > 0 && x < W - 1 && enMedio(1)) || enMedio(W)) {
                partida[c] = 1;
                tipos[c] = indiceDe('wall');
              }
            }
        }
      }
      barreraDeNodo = barrerasDeLosNodos(e, tipos, esNodo, clave, tipoDePareja, candidatasDe);
    }
    // 7a'. Y el acantilado que se quedó sin caída (#215). Casi siempre es un
    //     espolón de una casilla que se mete en lo bajo, con lo bajo a los dos
    //     lados, que el relieve hunde a su nivel (`nivelesDelRelieve`): se abre
    //     a esa región y la línea sigue por detrás. El resto —un trozo entre dos
    //     regiones al mismo nivel, junto a un cruce— pasa a montaña.
    if (sinAcantiladoLlano(W, H, tipos, region, esNodo, e.niveles, nivelAhora)) {
      desnivelEnLosCruces(W, H, tipos, region, esNodo, e.niveles);
      barreraDeNodo = barrerasDeLosNodos(e, tipos, esNodo, clave, tipoDePareja, candidatasDe);
    }
    // 7a''. Con la línea delgada y sin espolones, las caídas largas al sur se
    //      parten a trechos (#231). Lo corrido del acantilado lo adelgaza la
    //      vuelta siguiente, que vuelve a mirar las murallas y los espolones.
    if (quebrar()) {
      desnivelEnLosCruces(W, H, tipos, region, esNodo, e.niveles);
      barreraDeNodo = barrerasDeLosNodos(e, tipos, esNodo, clave, tipoDePareja, candidatasDe);
      continue;
    }
    // 7b. Sin espigas (#210): ninguna casilla de una de ancho por encima de lo
    //     que tiene a los dos lados. Rellenar puede partir una región y cambiar
    //     la barrera de un nodo, y eso, una muralla: se vuelve a mirar todo.
    if (llano || vuelta >= VUELTAS_SIN_ESPIGAS) break;
    const conEspigas = quitarEspigas(
      W,
      H,
      tipos,
      region,
      muro,
      esNodo,
      pasillo,
      e.niveles,
      e.nodos,
      barreraDeNodo,
      alBajo,
      esCiudad,
    );
    if (!conEspigas) break;
    const partida7 = bolsillos();
    if (partida7 !== null) return partida7;
    // Lo rellenado puede dejar un trozo de acantilado tocando un solo nivel, o
    // un bosque tocando dos: se arregla con la regla de los cruces (6b).
    desnivelEnLosCruces(W, H, tipos, region, esNodo, e.niveles);
    barreraDeNodo = barrerasDeLosNodos(e, tipos, esNodo, clave, tipoDePareja, candidatasDe);
  }

  // 7b'. Y si tras `VUELTAS_SIN_ESPIGAS` aún queda una espiga, el vestido no
  //     vale: con la última vuelta agotada nada la quitaba y llegaba al mapa
  //     (s49 (12,3) con #222, una meseta de una casilla entre un nodo y el agua).
  if (!llano) {
    const [espiga] = espigasDelRelieve(W, H, nivelAhora());
    if (espiga !== undefined)
      return `la casilla (${espiga % W},${Math.floor(espiga / W)}) queda por encima de sus dos lados tras ${VUELTAS_SIN_ESPIGAS} vueltas de quitar espigas`;
  }

  // 7c. Ningún acantilado sin caída (#215): lo de arriba lo deja así, salvo que
  //     la regla de los cruces le dé a un bosque la barrera de desnivel junto a
  //     lo que no cae. Ese vestido no vale.
  const sinCaida = acantiladoSinCaida({
    W,
    H,
    tipos,
    regionDe: region,
    nodos: e.nodos,
    barreraDeNodo,
    niveles: e.niveles,
    alBajo,
    ciudades: esCiudad,
  });
  if (sinCaida !== null) return sinCaida;
  // 7d. Y fuera de los nodos, dos regiones a tres pasos como poco salvo a
  //     través de un acantilado (#215). Lo garantizan el engorde y la línea,
  //     pero el acantilado sin caída del paso 7a' pasa a montaña, y si estaba
  //     entre la meseta y lo bajo deja una montaña de una casilla en medio
  //     (s18 (1,13): un codo hundido por el agua de al lado). Ese vestido no vale.
  for (let i = 0; i < N; i++) {
    if (tipos[i] !== ABIERTA || esNodo[i] === 1 || cerca[i] === 1) continue;
    const { x, y } = aPunto(i, W);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const qx = x + dx;
        const qy = y + dy;
        if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
        const q = qy * W + qx;
        if (tipos[q] !== ABIERTA || esNodo[q] === 1 || cerca[q] === 1 || region[q] === region[i])
          continue;
        let acantilado = false;
        for (let my = Math.max(y, qy) - 1; my <= Math.min(y, qy) + 1; my++)
          for (let mx = Math.max(x, qx) - 1; mx <= Math.min(x, qx) + 1; mx++)
            if (tipos[my * W + mx] === indiceDe('cliff')) acantilado = true;
        if (!acantilado)
          return `las regiones ${region[i]} y ${region[q]} quedan a dos pasos en (${x},${y}) y (${qx},${qy}), sin un acantilado en medio`;
      }
  }

  // 8. Las barreras garantizadas, contadas en la frontera ya gruesa y sin las
  //    casillas de nodo, que se abren: es lo que verá quien juegue. Cuenta que
  //    haya `hacenFalta` barreras con sus casillas, no que sean las que se
  //    repartieron: la muralla larga del paso 7 se vuelve otra barrera, y si el
  //    muro era de las repartidas, lo que se pide —variedad— lo puede dar la
  //    que lo sustituye (#208). Exigir el muro repartido tiraba el vestido 1 089
  //    veces en 1-200, contra 15 antes, y cada vestido tirado es otro mapa.
  const porTipo = new Int32Array(BARRERAS.length);
  for (let i = 0; i < N; i++) if (tipos[i] !== ABIERTA && esNodo[i] === 0) porTipo[tipos[i]!]! += 1;
  // El muro cuenta con una muralla: ahora va en zonas pequeñas y sus 15
  // casillas ya no se pueden pedir, pero sigue siendo una barrera que se ve.
  const minimoDe = (b: Barrera): number =>
    b === 'wall' ? CASILLAS_DE_UNA_MURALLA : casillasMinimasPorTipo;
  const conSusCasillas = BARRERAS.filter((b) => porTipo[indiceDe(b)]! >= minimoDe(b));
  if (conSusCasillas.length < hacenFalta) {
    const cortas = [...new Set(distintas.values())]
      .filter((b) => porTipo[indiceDe(b)]! < minimoDe(b))
      .map((b) => `${b} en ${porTipo[indiceDe(b)]}`);
    return `la frontera se queda con ${conSusCasillas.length} barreras de ${casillasMinimasPorTipo} casillas (${conSusCasillas.join(', ') || 'ninguna'}), y cada mapa lleva ${hacenFalta}; se quedan cortas ${cortas.join(', ')}`;
  }
  return { tipos, pasillo, semillas, barreraDeNodo };
}

/** Cuántas veces se quitan espigas y se vuelven a mirar bolsillos y murallas. */
const VUELTAS_SIN_ESPIGAS = 8;

/**
 * El terreno y las regiones de lo engordado como los verá la escena, y el nivel
 * de cada casilla con la misma regla (`nivelesDelRelieve`, `nivelDelNodo`). El
 * nodo de agua que no es ciudad es un puente, agua en la escena; el de lo demás
 * se pisa y va al bajo si es ciudad o lleva camino (`alBajo`) y si no al alto.
 */
export function nivelesDeLoEngordado(
  W: number,
  H: number,
  tipos: Tipos,
  etiqueta: Int32Array,
  esNodo: Uint8Array,
  niveles: readonly Nivel[],
  nodos: readonly number[],
  barreraDeNodo: readonly Barrera[],
  alBajo: ReadonlySet<number>,
  ciudades: ReadonlySet<number>,
): Int8Array {
  const N = W * H;
  const terreno: TerrainKind[] = new Array(N);
  const regionDe = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    const b = barreraDe(tipos, i);
    terreno[i] = b ?? 'grass';
    if (b === null && esNodo[i] === 0) regionDe[i] = etiqueta[i] as number;
  }
  const { desde, vecinas } = vecindad(W, H);
  const delRelieve: NodoDelRelieve[] = [];
  for (const [k, n] of nodos.entries()) {
    if (barreraDeNodo[k] === 'water' && !ciudades.has(n)) {
      terreno[n] = 'water';
      continue;
    }
    // Lo demás se pisa, como en la escena: `buildMap` abre la casilla. Con la
    // barrera de debajo, el acantilado seguía por el nodo y una casilla junto
    // a una ciudad tomaba la región de enfrente por la más cercana (s74 en
    // 64×64, (33,37): a 1 aquí y a 2 en la escena, #215).
    terreno[n] = 'grass';
    const regiones = new Set<number>();
    for (let v = desde[n]!; v < desde[n + 1]!; v++) {
      const r = regionDe[vecinas[v]!] as number;
      if (r >= 0) regiones.add(r);
    }
    delRelieve.push({ casilla: n, regiones: [...regiones], alBajo: alBajo.has(n) });
  }
  return nivelesDelRelieve(W, H, terreno, regionDe, niveles, delRelieve);
}

/**
 * Las espigas de lo engordado (#210): casillas de una de ancho por encima de lo
 * que tienen a los dos lados en un eje (`espigasDelRelieve`). Las deja el ruido
 * de la frontera —una casilla sin engordar entre dos engordadas, el diente de
 * un peine—, el pasillo de un nodo que cruza el agua y el espolón de un
 * acantilado o una montaña que se mete en lo bajo. La auditoría 5 contó 112 en
 * 10 semillas, y la escena las pintaba como obeliscos y cuchillas.
 *
 * - **Lo que se pisa**, se rellena con la barrera baja de al lado (el agua); si
 *   es pasillo, que no se toca, se abre la barrera de al lado a su región, si es
 *   de su celda, no es muro fino y no deja otra región a menos de tres pasos.
 * - **Una barrera** alta entre dos casillas que se pisan, las rellena con su
 *   barrera: el espolón se hace lomo; entre dos barreras bajas, toma la suya.
 *
 * Solo convierte lo pisable en barrera, salvo el pasillo, que se ensancha.
 * Devuelve si cambió algo; quien llama vuelve a mirar los bolsillos.
 */
function quitarEspigas(
  W: number,
  H: number,
  tipos: Tipos,
  etiqueta: Int32Array,
  muro: Uint8Array,
  esNodo: Uint8Array,
  pasillo: Uint8Array,
  niveles: readonly Nivel[],
  nodos: readonly number[],
  barreraDeNodo: readonly Barrera[],
  alBajo: ReadonlySet<number>,
  ciudades: ReadonlySet<number>,
): boolean {
  const N = W * H;
  const nivel = nivelesDeLoEngordado(
    W,
    H,
    tipos,
    etiqueta,
    esNodo,
    niveles,
    nodos,
    barreraDeNodo,
    alBajo,
    ciudades,
  );
  const espigas = espigasDelRelieve(W, H, nivel);
  const abierta = (j: number): boolean => tipos[j] === ABIERTA && esNodo[j] === 0;
  /** Si `p` se puede abrir a la región `r` sin dejar otra a menos de tres pasos. */
  const abrible = (p: number, r: number): boolean => {
    if (abierta(p) || esNodo[p] === 1 || muro[p] === 1 || etiqueta[p] !== r) return false;
    const { x, y } = aPunto(p, W);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
        const q = (y + dy) * W + x + dx;
        if (abierta(q) && etiqueta[q] !== r) return false;
      }
    return true;
  };
  const MONTAÑA = indiceDe('mountain');
  const MURO = indiceDe('wall');
  let cambio = false;
  for (const c of espigas) {
    if (!abierta(c)) continue;
    const n = nivel[c] as number;
    const x = c % W;
    const ejes: (readonly [number, number])[] = [];
    if (x > 0 && x < W - 1 && (nivel[c - 1] as number) < n && (nivel[c + 1] as number) < n)
      ejes.push([c - 1, c + 1]);
    if (c >= W && c < N - W && (nivel[c - W] as number) < n && (nivel[c + W] as number) < n)
      ejes.push([c - W, c + W]);
    for (const lados of ejes) {
      if (pasillo[c] === 0) {
        const baja = lados.find((p) => tipos[p] !== ABIERTA && tipos[p] !== MURO);
        if (baja === undefined) continue;
        tipos[c] = tipos[baja] as number;
        cambio = true;
        break;
      }
      for (const p of lados) {
        if (abierta(p) || esNodo[p] === 1) continue;
        // El pasillo no se toca: se abre la orilla a su región o, si no se
        // puede, la orilla deja de ser agua y sube con él, de montaña, que
        // admite cualquier pareja de niveles.
        tipos[p] = abrible(p, etiqueta[c] as number) ? ABIERTA : MONTAÑA;
        cambio = true;
      }
    }
  }
  return cambio;
}

/**
 * El acantilado, una línea de una casilla (#215): el borde de la meseta, con lo
 * bajo a su pie, y no un campo de roca. «Línea de 1 casilla: el ancho que sobra
 * pasa a la meseta, que se pisa. Como en HoMM: meseta transitable, borde
 * infranqueable salvo por rampa» (el usuario). El engorde dejaba franjas de 3-4
 * casillas, todas al nivel alto (`nivelesDelRelieve`), con la caída solo en el
 * borde de abajo: la auditoría 6 contó 447 de 776 casillas sin nada más bajo en
 * cruz, y la escena las cubría de roca.
 *
 * Por vueltas (`abrirAcantilado`): se abre a la región `r` de sus vecinas cada
 * casilla cuya `r` es el lado alto —de las dos regiones más cercanas por dentro
 * de la franja, la otra está más baja—. Así la meseta se come la franja desde
 * su lado hasta la fila que toca lo bajo, que se queda: la línea es el borde
 * del lado bajo tal como lo dejó el engorde, con su ruido, y lo bajo no cambia.
 * Devuelve si cambió algo.
 */
export function adelgazarAcantilados(
  W: number,
  H: number,
  tipos: Tipos,
  region: Int32Array,
  esNodo: Uint8Array,
  niveles: readonly Nivel[],
  nivelAhora: () => ArrayLike<number>,
): boolean {
  const N = W * H;
  const { desde, vecinas } = vecindad(W, H);
  const CORTADO = indiceDe('cliff');
  const abierta = (j: number): boolean => tipos[j] === ABIERTA && esNodo[j] === 0;
  const esCorte = (j: number): boolean => tipos[j] === CORTADO && esNodo[j] === 0;
  let cambio = false;
  for (;;) {
    // Las dos regiones más cercanas de cada casilla de acantilado, por dentro
    // de su franja: la primera que llega y la segunda distinta.
    const r1 = new Int32Array(N).fill(-1);
    const r2 = new Int32Array(N).fill(-1);
    const cola: number[] = [];
    const ofrecer = (j: number, r: number): void => {
      if (r1[j] === r || r2[j] === r) return;
      if (r1[j] === -1) r1[j] = r;
      else if (r2[j] === -1) r2[j] = r;
      else return;
      cola.push(j, r);
    };
    for (let i = 0; i < N; i++) {
      if (!abierta(i)) continue;
      for (let v = desde[i]!; v < desde[i + 1]!; v++)
        if (esCorte(vecinas[v]!)) ofrecer(vecinas[v]!, region[i] as number);
    }
    for (let q = 0; q < cola.length; q += 2) {
      const j = cola[q] as number;
      for (let v = desde[j]!; v < desde[j + 1]!; v++)
        if (esCorte(vecinas[v]!)) ofrecer(vecinas[v]!, cola[q + 1] as number);
    }
    // Ni se abre lo que quedaría de espiga (#210), por encima de sus dos
    // vecinas de un eje: `quitarEspigas` la rellenaba con la barrera de al lado
    // —el acantilado— y la vuelta siguiente la volvía a abrir, hasta agotar las
    // vueltas (s443 (29,18), entre una ciudad y el agua).
    const nivel = nivelAhora();
    const espiga = (i: number, r: number): boolean => {
      const n = niveles[r] as number;
      const x = i % W;
      const bajo = (j: number): boolean => (nivel[j] as number) < n;
      return (
        (x > 0 && x < W - 1 && bajo(i - 1) && bajo(i + 1)) ||
        (i >= W && i < N - W && bajo(i - W) && bajo(i + W))
      );
    };
    const alto = (i: number, r: number): boolean => {
      const otra = (r1[i] === r ? r2[i] : r1[i]) as number;
      return otra !== -1 && (niveles[otra] as number) < (niveles[r] as number) && !espiga(i, r);
    };
    if (abrirAcantilado(W, H, tipos, region, esNodo, niveles, alto).length === 0) return cambio;
    cambio = true;
  }
}

/**
 * Lo más largo que cae seguido al sur una fila del relieve (#231): una caída de
 * `largoALaEscala(8)` casillas (10 en el 42×42) o más lleva quiebros. Es el
 * largo de las caras de `tools/qa/rectitud.ts`, en casillas: la cara que pinta
 * la escena es una más corta que la caída de casilla a casilla que la hace.
 */
export const CAIDA_LARGA = largoALaEscala(8);

/**
 * El trecho de un quiebro: en una caída larga se corre una fila un trozo de
 * como mucho este largo, a este largo de lo recto de antes. Es
 * `TRECHO_DEL_LADO` a la escala del mapa (4 → 5), el trecho al que la
 * reparación del grosor (paso 4b) le da la vuelta al lado que engorda.
 */
export const TRECHO_DEL_QUIEBRO = largoALaEscala(TRECHO_DEL_LADO);

/**
 * Las caídas al sur de `CAIDA_LARGA` casillas seguidas o más (#231): por fila,
 * las casillas cuyo nivel es mayor que el de la de debajo. Con el nivel de la
 * escena (`nivelesDeLoEngordado`, `nivelesDelRelieve`) es la cara frontal que
 * pinta, una casilla más larga (la cara va de junta a junta). Lo leen el
 * quiebro del engorde (`quebrarCaidas`), el generador al final del vestido y
 * `test/caidas-largas.test.ts`.
 */
export function caidasLargas(
  W: number,
  H: number,
  nivel: ArrayLike<number>,
): { readonly y: number; readonly desde: number; readonly largo: number }[] {
  const largas: { y: number; desde: number; largo: number }[] = [];
  for (let y = 0; y < H - 1; y++) {
    let desde = -1;
    for (let x = 0; x <= W; x++) {
      if (x < W && (nivel[y * W + x] as number) > (nivel[(y + 1) * W + x] as number)) {
        if (desde === -1) desde = x;
        continue;
      }
      if (desde !== -1 && x - desde >= CAIDA_LARGA) largas.push({ y, desde, largo: x - desde });
      desde = -1;
    }
  }
  return largas;
}

/** Cuántas veces se buscan caídas largas en un engorde: lo que la primera no parte, lo prueba otra. */
const VUELTAS_DE_QUIEBROS = 2;

/**
 * Las caídas al sur rectas y largas, partidas a trechos (#231). Tras #229 y
 * #230 las caras largas que quedaban eran todas un desnivel que cae al sur por
 * una frontera casi horizontal: la línea de acantilado de 7a, que copia el
 * borde del lado bajo, o una región alta sobre el agua, que va a ras de la más
 * baja (s154 (0-11, 23), s503 (6-19, 35)…). La cara frontal es lo único del
 * relieve que la cámara ve de frente, y una fila recta de diez se lee como un
 * muro de catálogo.
 *
 * Por cada fila con `CAIDA_LARGA` casillas seguidas o más cuyo nivel
 * (`nivelesDeLoEngordado`, el de la escena) es mayor que el de la de debajo, se
 * parte: cada `TRECHO_DEL_QUIEBRO` casillas, poco más o menos, un trozo de dos
 * a `TRECHO_DEL_QUIEBRO` se corre una fila, casilla a casilla según lo que hay:
 *
 * - **Hacia lo bajo**, si arriba hay acantilado o montaña y abajo lo bajo que
 *   se pisa: lo bajo pasa a esa barrera, que va al nivel alto. El acantilado
 *   queda de dos de hondo y el 7a se come la fila de arriba; las dos puntas del
 *   trozo se quedan, que tocan lo bajo por la esquina: la escalera de #215.
 * - **Hacia lo alto** (morder con el agua), si arriba se pisa y abajo hay agua:
 *   lo alto pasa a agua, que va a ras de lo bajo.
 *
 * Solo convierte lo que se pisa en barrera, como el resto del engorde: no
 * acerca dos regiones. Fuera de las casillas a `RADIO_DEL_PASO` de un nodo
 * (`cerca`: sus ejes, pasillos y rampas no se tocan) y de los pasillos, y sin
 * dejar lo que se pisa de una fila de hondo (dos de su región detrás). El trozo
 * se busca donde quepa sin dejar `CAIDA_LARGA` recto antes de él; si no cabe
 * en ningún sitio, la caída se queda como estaba: dejarla no cuesta un mapa y
 * tirar el vestido sí. En espejo donde se puede: lo mismo en la casilla
 * reflejada (una espalda), si se pisa y cumple lo mismo. Las espigas, los bolsillos y los acantilados
 * sin caída que pudiera dejar los miran los pasos de siempre (7b, 6, 7c).
 * Devuelve si cambió algo.
 */
export function quebrarCaidas(
  W: number,
  H: number,
  tipos: Tipos,
  region: Int32Array,
  esNodo: Uint8Array,
  pasillo: Uint8Array,
  cerca: Uint8Array,
  nivel: ArrayLike<number>,
): boolean {
  const N = W * H;
  const CORTADO = indiceDe('cliff');
  const MONTAÑA = indiceDe('mountain');
  const AGUA = indiceDe('water');
  const abierta = (j: number): boolean => tipos[j] === ABIERTA && esNodo[j] === 0;
  /** Lo que se puede volver barrera: se pisa, y no es pasillo ni está junto a un nodo. */
  const libre = (j: number): boolean => abierta(j) && pasillo[j] === 0 && cerca[j] === 0;
  /** Con dos casillas de su región detrás (hacia `d`): no queda lo que se pisa de una de hondo. */
  const hondo = (j: number, d: number): boolean =>
    j + 2 * d >= 0 &&
    j + 2 * d < N &&
    abierta(j + d) &&
    abierta(j + 2 * d) &&
    region[j + d] === region[j] &&
    region[j + 2 * d] === region[j];
  /**
   * La casilla que pasa a barrera al correr la caída de la columna `x` de la
   * fila `y`, su barrera y hacia dónde queda lo que se pisa detrás de ella.
   */
  const corrimiento = (x: number, y: number): readonly [number, number, number] | null => {
    const alto = y * W + x;
    const bajo = alto + W;
    if (esNodo[alto] === 1 || esNodo[bajo] === 1) return null;
    const t = tipos[alto] as number;
    if ((t === CORTADO || t === MONTAÑA) && libre(bajo) && hondo(bajo, W)) return [bajo, t, W];
    if (tipos[bajo] === AGUA && libre(alto) && hondo(alto, -W)) return [alto, AGUA, -W];
    return null;
  };
  const tocada = new Uint8Array(N);
  let cambio = false;
  for (const { y, desde, largo } of caidasLargas(W, H, nivel)) {
    // De izquierda a derecha: lo recto desde `pos` no llega a `CAIDA_LARGA`
    // antes del siguiente trozo corrido, que empieza lo más cerca que pueda
    // de un trecho más allá y mide de dos a un trecho. Lo que no se puede
    // correr (un nodo cerca) se salta. Si lo corrido sigue recto con lo que
    // haya más allá de la punta, lo ve la vuelta siguiente.
    const fin = desde + largo - 1;
    let pos = desde;
    while (fin - pos + 1 >= CAIDA_LARGA) {
      let hecho = false;
      const candidatas: number[] = [];
      for (let a = pos; a <= Math.min(fin - 1, pos + CAIDA_LARGA - 1); a++) candidatas.push(a);
      candidatas.sort(
        (p, q) =>
          Math.abs(p - pos - TRECHO_DEL_QUIEBRO) - Math.abs(q - pos - TRECHO_DEL_QUIEBRO) || p - q,
      );
      for (const a of candidatas) {
        const cambios: (readonly [number, number, number])[] = [];
        for (let cx = a; cx <= Math.min(fin, a + TRECHO_DEL_QUIEBRO - 1); cx++) {
          const c = corrimiento(cx, y);
          if (c === null || tocada[c[0]] === 1 || tocada[espejoDe(c[0], N)] === 1) break;
          cambios.push(c);
        }
        if (cambios.length < 2) continue;
        for (const [j, t, d] of cambios) {
          tipos[j] = t;
          tocada[j] = 1;
          // El reflejo, si en él se puede: el engorde no sale en espejo
          // casilla a casilla (la reparación del paso 4b va en orden), y
          // donde el reflejo ya es barrera no hay nada que correr.
          const m = espejoDe(j, N);
          if (libre(m) && hondo(m, -d)) {
            tipos[m] = t;
            tocada[m] = 1;
          }
        }
        cambio = true;
        hecho = true;
        pos = a + cambios.length;
        break;
      }
      if (!hecho) break;
    }
  }
  return cambio;
}

/**
 * La puerta de una ciudad no muerde la línea del acantilado (#222). Cuando el
 * engorde deja la franja de dos de hondo en una ciudad del borde de la meseta,
 * la ciudad se queda en la fila de arriba —abrir sus costados a la meseta le
 * daría un eje de la meseta a la meseta (`abrirAcantilado`)— y su puerta, la
 * casilla de debajo, atraviesa la de abajo entre dos acantilados: una muesca
 * de una casilla con el camino de la puerta por ella (s57 (31,25), s162
 * (29,27), s10 (23,14)). En la escena es un barranco (`sinBarrancos` le quita
 * las laderas) y la diagonal que remataría la cara tapa el camino: la cara de
 * al lado acaba de repente, «una elevación no puede acabar sin continuidad».
 *
 * Se abre a la región de la puerta cada acantilado de su costado que tiene
 * acantilado encima, el costado de la ciudad: la línea sube a la fila de la
 * ciudad y la puerta da al llano, con la cara de cada lado colgando junto a
 * ella. Lo de la meseta que tocaría lo abierto en diagonal, la casilla a dos
 * de la ciudad en su fila, pasa a acantilado: la línea va en escalera, cerrada
 * en ocho vecinas. No se toca si esa casilla es pasillo o toca un nodo, si lo
 * abierto tocaría otra región o si dejaría una a dos pasos sin acantilado en
 * medio. Devuelve si cambió algo.
 */
export function puertasSinMuesca(
  W: number,
  H: number,
  tipos: Tipos,
  region: Int32Array,
  esNodo: Uint8Array,
  pasillo: Uint8Array,
  niveles: readonly Nivel[],
  ciudades: Iterable<number>,
): boolean {
  const CORTADO = indiceDe('cliff');
  const abierta = (j: number): boolean => tipos[j] === ABIERTA && esNodo[j] === 0;
  const dentro = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H;
  const tocaUnNodo = (x: number, y: number): boolean => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if ((dx !== 0 || dy !== 0) && dentro(x + dx, y + dy) && esNodo[(y + dy) * W + x + dx] === 1)
          return true;
    return false;
  };
  let cambio = false;
  for (const t of ciudades) {
    const x = t % W;
    const y = Math.floor(t / W);
    if (y + 2 >= H) continue;
    const puerta = t + W;
    if (!abierta(puerta)) continue;
    const baja = region[puerta] as number;
    for (const s of [-1, 1]) {
      if (!dentro(x + 2 * s, y)) continue;
      const c = puerta + s;
      if (tipos[c] !== CORTADO || esNodo[c] === 1) continue;
      if (tipos[t + s] !== CORTADO || esNodo[t + s] === 1) continue;
      // Lo que se pisa alrededor de `c`: de la región de la puerta, salvo la
      // casilla a dos de la ciudad en su fila, que si es de lo alto se cierra.
      const cerrar = t + 2 * s;
      let vale = true;
      for (let dy = 0; dy <= 2 && vale; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const j = (y + dy) * W + x + s + dx;
          if (!dentro(x + s + dx, y + dy) || !abierta(j) || region[j] === baja) continue;
          if (
            j !== cerrar ||
            pasillo[j] === 1 ||
            tocaUnNodo(x + 2 * s, y) ||
            (niveles[region[j] as number] as number) <= (niveles[baja] as number)
          )
            vale = false;
        }
      if (!vale) continue;
      // Y nada de otra región a dos pasos de lo abierto sin un acantilado o un
      // nodo en medio (`engordarFronteras`, paso 7d, que junto a un nodo no
      // mira), contando lo que se cierra.
      const esCorte = (m: number): boolean =>
        m === cerrar || esNodo[m] === 1 || (m !== c && tipos[m] === CORTADO);
      for (let dy = -2; dy <= 2 && vale; dy++)
        for (let dx = -2; dx <= 2 && vale; dx++) {
          const qx = x + s + dx;
          const qy = y + 1 + dy;
          if (!dentro(qx, qy)) continue;
          const q = qy * W + qx;
          if (q === cerrar || !abierta(q) || region[q] === baja) continue;
          let enMedio = false;
          for (let my = Math.max(y + 1, qy) - 1; my <= Math.min(y + 1, qy) + 1; my++)
            for (let mx = Math.max(x + s, qx) - 1; mx <= Math.min(x + s, qx) + 1; mx++)
              if (dentro(mx, my) && esCorte(my * W + mx)) enMedio = true;
          if (!enMedio) vale = false;
        }
      if (!vale) continue;
      tipos[c] = ABIERTA;
      region[c] = baja;
      if (abierta(cerrar)) tipos[cerrar] = CORTADO;
      cambio = true;
    }
  }
  return cambio;
}

/**
 * El primer acantilado sin caída de un vestido (`acantiladosSinCaida`, #215),
 * dicho para el motivo del vestido que no vale, o `null`. Con el nivel de la
 * escena (`nivelesDeLoEngordado`): la casilla de un nodo de agua es río, y un
 * nodo va al bajo si está en `alBajo`. `regionDe` es la región de lo que se
 * pisa; lo demás no se lee. Lo usan el engorde (paso 7c) y el generador
 * después de los caminos, que cambian el agua de las esquinas a montaña
 * (`sinAguaEnLasEsquinas`): un trozo de río que deja de tocar lo más bajo sube
 * con su orilla y el acantilado de al lado se queda sin caída (s148 (12,2)).
 */
export function acantiladoSinCaida(e: {
  readonly W: number;
  readonly H: number;
  readonly tipos: Tipos;
  readonly regionDe: Int32Array;
  readonly nodos: readonly number[];
  readonly barreraDeNodo: readonly Barrera[];
  readonly niveles: readonly Nivel[];
  readonly alBajo: ReadonlySet<number>;
  readonly ciudades: ReadonlySet<number>;
}): string | null {
  const { W, H, tipos } = e;
  const esNodo = new Uint8Array(W * H);
  for (const n of e.nodos) esNodo[n] = 1;
  const CORTADO = indiceDe('cliff');
  const nivel = nivelesDeLoEngordado(
    W,
    H,
    tipos,
    e.regionDe,
    esNodo,
    e.niveles,
    e.nodos,
    e.barreraDeNodo,
    e.alBajo,
    e.ciudades,
  );
  const [c] = acantiladosSinCaida(W, H, (i) => tipos[i] === CORTADO && esNodo[i] === 0, nivel);
  if (c === undefined) return null;
  return `el acantilado de (${c % W},${Math.floor(c / W)}) se queda sin nada más bajo al lado: sería roca sin caída, no el borde de una meseta`;
}

/** Cuántas veces se abren espolones de acantilado sin caída antes de dar el resto a la montaña. */
const VUELTAS_DE_ESPOLONES = 4;

/**
 * Lo que hace `engordarFronteras` (paso 7a') con el acantilado sin caída
 * (`acantiladosSinCaida`): lo que solo toca una región se le abre
 * (`abrirAcantilado`), por vueltas, porque abrir la punta de un espolón deja sin
 * caída la casilla de detrás; lo que queda, a montaña, que va entre cualquier
 * pareja de niveles. Devuelve si cambió algo.
 */
function sinAcantiladoLlano(
  W: number,
  H: number,
  tipos: Tipos,
  region: Int32Array,
  esNodo: Uint8Array,
  niveles: readonly Nivel[],
  nivelAhora: () => Int8Array,
): boolean {
  const CORTADO = indiceDe('cliff');
  const esCorte = (i: number): boolean => tipos[i] === CORTADO && esNodo[i] === 0;
  let cambio = false;
  for (let vuelta = 0; ; vuelta++) {
    const llanos = new Set(acantiladosSinCaida(W, H, esCorte, nivelAhora()));
    if (llanos.size === 0) return cambio;
    cambio = true;
    const abiertas =
      vuelta < VUELTAS_DE_ESPOLONES
        ? abrirAcantilado(W, H, tipos, region, esNodo, niveles, (i) => llanos.has(i))
        : [];
    if (abiertas.length > 0) continue;
    for (const c of llanos) tipos[c] = indiceDe('mountain');
    return cambio;
  }
}

/**
 * Una vuelta de abrir casillas de acantilado a la región de al lado: cada una
 * que no es nodo, cuyo todo lo que se pisa en sus ocho vecinas es de una sola
 * región `r`, que `quiere(i, r)` y cuyos nodos vecinos ya tocan `r`. Nada de lo
 * que se pisa de una región queda así junto a otra (la que se abre no toca más
 * que `r`), y la red sigue cerrada en ocho vecinas. La decisión es por casilla y
 * simultánea, y por eso sale en espejo: dos que se abrirían a regiones
 * distintas y se tocan no se abren. Devuelve las que abrió.
 */
function abrirAcantilado(
  W: number,
  H: number,
  tipos: Tipos,
  region: Int32Array,
  esNodo: Uint8Array,
  niveles: readonly Nivel[],
  quiere: (i: number, r: number) => boolean,
): number[] {
  const N = W * H;
  const { desde, vecinas } = vecindad(W, H);
  const CORTADO = indiceDe('cliff');
  const abierta = (j: number): boolean => tipos[j] === ABIERTA && esNodo[j] === 0;
  // Las regiones que toca cada nodo: abrir junto a uno no le da otra.
  const tocaElNodo = (n: number, r: number): boolean => {
    for (let v = desde[n]!; v < desde[n + 1]!; v++)
      if (abierta(vecinas[v]!) && region[vecinas[v]!] === r) return true;
    return false;
  };
  const aQuien = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    if (tipos[i] !== CORTADO || esNodo[i] === 1) continue;
    let r = -1;
    let sola = true;
    for (let v = desde[i]!; v < desde[i + 1]!; v++) {
      const j = vecinas[v]!;
      if (!abierta(j)) continue;
      if (r === -1) r = region[j] as number;
      else if (region[j] !== r) sola = false;
    }
    if (r === -1 || !sola || !quiere(i, r)) continue;
    let nodosBien = true;
    for (let v = desde[i]!; v < desde[i + 1]!; v++) {
      const j = vecinas[v]!;
      if (esNodo[j] === 1 && !tocaElNodo(j, r)) nodosBien = false;
    }
    if (nodosBien) aQuien[i] = r;
  }
  /**
   * Si abrir `i` a `r` deja lo que se pisa de otra región a dos pasos sin un
   * acantilado con caída en medio. Fuera de los nodos, dos regiones quedan a
   * tres pasos como poco (`engordarFronteras`, paso 4b), y la línea de una
   * casilla solo es la excepción entre dos niveles: si no, dos mesetas al mismo
   * nivel que se comen la franja desde los dos lados se quedan con una casilla
   * sin caída en medio, que pasaba a montaña (s24 (30-32, 8)), y una meseta
   * llegaba al agua de una casilla de otra frontera (s191 (23,27)). Lo que se
   * abre a la vez cuenta como abierto.
   */
  const seAcerca = (i: number, r: number): boolean => {
    const x = i % W;
    const y = Math.floor(i / W);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const qx = x + dx;
        const qy = y + dy;
        if (qx < 0 || qy < 0 || qx >= W || qy >= H || (dx === 0 && dy === 0)) continue;
        const q = qy * W + qx;
        const rq = abierta(q) ? (region[q] as number) : (aQuien[q] as number);
        if (rq === -1 || rq === r) continue;
        if (niveles[rq] === niveles[r]) return true;
        let enMedio = false;
        for (let my = Math.max(y, qy) - 1; my <= Math.min(y, qy) + 1 && !enMedio; my++)
          for (let mx = Math.max(x, qx) - 1; mx <= Math.min(x, qx) + 1; mx++) {
            if (mx < 0 || my < 0 || mx >= W || my >= H) continue;
            const m = my * W + mx;
            if (m !== i && tipos[m] === CORTADO && esNodo[m] === 0 && aQuien[m] === -1) {
              enMedio = true;
              break;
            }
          }
        if (!enMedio) return true;
      }
    return false;
  };
  const abrir: number[] = [];
  for (let i = 0; i < N; i++) {
    const r = aQuien[i] as number;
    if (r === -1) continue;
    let choca = false;
    for (let v = desde[i]!; v < desde[i + 1]!; v++) {
      const j = vecinas[v]!;
      const o = aQuien[j] as number;
      if (o !== -1 && o !== r) choca = true;
      // Ni la casilla de enfrente de un nodo de la misma región: la escena
      // rehace el eje del paso sin regiones, con dos casillas que se pisan a
      // los dos lados (`ejeDelPaso`), y la meseta abrazando el nodo le daba un
      // eje de la meseta a la meseta (15 nodos en 1-200).
      if (esNodo[j] === 1) {
        const enfrente = 2 * j - i;
        const dentro =
          enfrente >= 0 &&
          enfrente < N &&
          Math.abs((enfrente % W) - (j % W)) <= 1 &&
          Math.abs(Math.floor(enfrente / W) - Math.floor(j / W)) <= 1;
        if (dentro && (aQuien[enfrente] === r || (abierta(enfrente) && region[enfrente] === r)))
          choca = true;
      }
    }
    if (!choca && !seAcerca(i, r)) abrir.push(i);
  }
  for (const i of abrir) {
    tipos[i] = ABIERTA;
    region[i] = aQuien[i] as number;
  }
  return abrir;
}

/**
 * La barrera que cruza cada nodo de `e.nodos`, en su orden (#145): la que el
 * plan escribe bajo él y `buildMap` guarda al abrirlo. La deducía el
 * escenógrafo de las ocho vecinas, sin saber de qué pareja era el nodo (#187).
 */
function barrerasDeLosNodos(
  e: EntradaDeEngorde,
  tipos: Tipos,
  esNodo: Uint8Array,
  clave: (a: number, b: number) => number,
  tipoDePareja: Int8Array,
  candidatasDe: (k: number) => BarreraConPeso[],
): Barrera[] {
  const { desde, vecinas } = vecindad(e.W, e.H);
  return e.nodos.map((n) => {
    const cuenta = new Int32Array(BARRERAS.length);
    const regionesDelNodo = new Set<number>();
    for (let v = desde[n]!; v < desde[n + 1]!; v++) {
      const j = vecinas[v]!;
      // Las regiones, por el muro fino; lo que se ve, por la frontera gruesa,
      // que es lo que pinta `buildMap` (los obstáculos no tocan un nodo, y los
      // nodos y ciudades vecinos se abren).
      if (e.muro[j] === 0) regionesDelNodo.add(e.etiqueta[j] as number);
      if (tipos[j] !== ABIERTA && esNodo[j] === 0) cuenta[tipos[j]!]! += 1;
    }
    const lados = [...regionesDelNodo];
    const parejas = lados.flatMap((a) => lados.filter((b) => a < b).map((b) => clave(a, b)));
    return queCruzaElNodo(
      cuenta,
      parejas.map((k) => tipoDePareja[k] as number),
      parejas.flatMap((k) => candidatasDe(k)),
      n,
    );
  });
}

/**
 * Lo más largo que mide una muralla de frontera, en casillas: el lado mayor de
 * la caja de lo que se ve como una —el muro y sus puertas, 8-conexo—.
 *
 * «Con la muralla como separador deberíamos limitarlo, no encaja que haya una
 * muralla desde una ciudad a otra, limita la muralla a zonas pequeñas» (el
 * usuario, #208). Medido en 1-200 (34×34, 08-10-2026) antes de este tope: 550
 * murallas de más de 6 casillas, de largo mediana 7, p90 12 y máximo 34; las
 * franjas de las demás barreras, mediana 4-5 y p90 6-7 (el agua, 13). Con 6,
 * la muralla se queda en lo que mide un tramo corriente de frontera entre dos
 * pasos, y lo que pasa de ahí es la frontera larga que el usuario no quiere.
 */
export const LARGO_MAXIMO_DE_MURALLA = 6;

/**
 * Hasta dónde llega el muro alrededor de su puerta cuando una muralla larga se
 * parte (`engordarFronteras`, paso 7), en Chebyshev: 2 deja un lienzo de cinco
 * casillas, dentro de `LARGO_MAXIMO_DE_MURALLA`, con dos a cada lado de la
 * puerta, que es lo que pide la escena para cerrar (la puerta y un tramo).
 */
export const RADIO_DE_LA_PUERTA = 2;

/**
 * Con cuántas casillas cuenta el muro como una de las `TIPOS_POR_MAPA`
 * barreras del mapa (`engordarFronteras`, paso 8): las de una muralla corta
 * (mediana 5 en 1-200 con `LARGO_MAXIMO_DE_MURALLA`), no las
 * `casillasMinimasPorTipo` de las demás, que con murallas cortas solo salían
 * juntando varias.
 */
export const CASILLAS_DE_UNA_MURALLA = 5;

/**
 * Las murallas que no valen: las que miden más de `LARGO_MAXIMO_DE_MURALLA` o
 * tocan dos ciudades (una casilla de muro o de puerta a Chebyshev ≤ 1 de cada
 * una, que es lo que tapa su pieza y donde la escena apoya la muralla). Cada
 * una, como sus casillas: el muro y los nodos de muro, 8-conexo, que es como la
 * escena las une (sus puertas van en la línea). Las ciudades no entran: se
 * abren.
 */
function murallasLargas(
  e: EntradaDeEngorde,
  tipos: Tipos,
  esNodo: Uint8Array,
  barreraDeNodo: readonly Barrera[],
): number[][] {
  const { W, H } = e;
  const muro = indiceDe('wall');
  const esCiudad = new Set(e.ciudades);
  const en = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (tipos[i] === muro && esNodo[i] === 0) en[i] = 1;
  e.nodos.forEach((n, k) => {
    if (!esCiudad.has(n) && barreraDeNodo[k] === 'wall') en[n] = 1;
  });
  const vista = new Uint8Array(W * H);
  const largas: number[][] = [];
  for (let i = 0; i < W * H; i++) {
    if (en[i] === 0 || vista[i] === 1) continue;
    vista[i] = 1;
    const casillas = rellenar(W, H, i, (j) => {
      if (en[j] === 0 || vista[j] === 1) return false;
      vista[j] = 1;
      return true;
    });
    const xs = casillas.map((c) => c % W);
    const ys = casillas.map((c) => Math.floor(c / W));
    const largo =
      Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 1;
    const tocadas = e.ciudades.filter((t) =>
      casillas.some(
        (c) =>
          Math.max(Math.abs((c % W) - (t % W)), Math.abs(Math.floor(c / W) - Math.floor(t / W))) <=
          1,
      ),
    );
    if (largo > LARGO_MAXIMO_DE_MURALLA || tocadas.length >= 2) largas.push(casillas);
  }
  return largas;
}

/**
 * Las candidatas de una frontera que deja de ser muralla: las de sus suelos
 * (`data/barreras.json`, sumadas) sin el muro. Ningún suelo pide solo muro
 * —el que más lo pesa, la tierra de casa, admite también bosque y agua—, así
 * que nunca se queda vacía; si un día pasa, lanza.
 */
function candidatasSinMuro(suelos: readonly Suelo[], niveles: readonly Nivel[]): BarreraConPeso[] {
  const suma = new Map<Barrera, number>();
  const distintos = [...new Set(suelos)];
  // El agua, solo si la admiten todos: un nodo entre dos suelos que no la
  // admiten no la cruza (`queCruzaElNodo`, paso 2) y, rodeado de ella, se
  // quedaba con el muro de su pareja sin un muro alrededor (s197 (31,17)).
  const conAgua = distintos.every((s) =>
    BARRERAS_DEL_MAPA.frontera[s].some((c) => c.barrera === 'water'),
  );
  for (const s of distintos)
    for (const c of BARRERAS_DEL_MAPA.frontera[s])
      if (
        c.barrera !== 'wall' &&
        (c.barrera !== 'water' || conAgua) &&
        admiteLosNiveles(c.barrera, niveles)
      )
        suma.set(c.barrera, (suma.get(c.barrera) ?? 0) + c.peso);
  const fuera = BARRERAS.filter((b) => suma.has(b)).map((b) => ({
    barrera: b,
    peso: suma.get(b)!,
  }));
  if (fuera.length === 0)
    throw new Error(
      `una muralla larga entre suelos ${[...new Set(suelos)].join(', ')} a los niveles ${[...new Set(niveles)].join(', ')}, que no admiten otra cosa que muro`,
    );
  return fuera;
}

/**
 * Lo que cruza un nodo, de lo que se ve a lo que sabe el generador. `cuenta`
 * son sus ocho vecinas por barrera; `sorteadas`, lo que se sorteó para las
 * parejas de regiones que une (una, salvo en un cruce); `admitidas`, lo que
 * admiten sus suelos (`data/barreras.json`).
 *
 * 1. **La barrera que más se repite alrededor**, porque es lo que se ve. La de
 *    la pareja a secas no vale: junto a un cruce, la frontera de al lado es de
 *    otra pareja y llega hasta el nodo. Guardándola, 206 de 12 364 nodos de
 *    1-1000 cambiaban de barrera, con 41 puentes nuevos entre muros y 42
 *    quitados de en medio de un río (medido el 08-10-2026).
 * 2. **Menos el agua, si sus suelos no la admiten**: el puente es la única
 *    pieza que rehace el terreno (la casilla del nodo se vuelve río), y un río
 *    entre dos regiones que no pueden tenerlo es el lago de otra frontera que
 *    llega hasta el nodo. Eran 6 puentes en 1-1000 (s28 node-6, s203 node-8,
 *    s455 node-6, s646 node-2 y node-8, s896 node-8), dos de ellos de troncos
 *    sobre un charco que ganaba un empate.
 * 3. En un empate, **la que se sorteó para su pareja**. El escenógrafo se
 *    quedaba con la primera vecina que encontraba. Con este paso y el 2, 85
 *    nodos de 1-1000 cambian de barrera, 81 de ellos empatados; pierden el
 *    puente 18 (los 6 y 12 empates) y lo ganan 17, todos empates, como s652
 *    node-4, que cruza un río de este a oeste y llevaba paso de montaña.
 * 4. Si no está entre las empatadas, la que más admiten sus suelos; y si aún
 *    empatan, el orden de `BARRERAS`.
 */
function queCruzaElNodo(
  cuenta: Int32Array,
  sorteadas: readonly number[],
  admitidas: readonly BarreraConPeso[],
  n: number,
): Barrera {
  const agua = BARRERAS.indexOf('water');
  const sinRio = !admitidas.some((c) => c.barrera === 'water');
  const vista = (t: number): number => (t === agua && sinRio ? 0 : (cuenta[t] as number));
  const max = Math.max(...BARRERAS.map((_, t) => vista(t)));
  const empatadas = BARRERAS.flatMap((_, t) => (max > 0 && vista(t) === max ? [t] : []));
  // Sin barrera alrededor, la de la pareja: un nodo siempre está en un muro.
  const enJuego = empatadas.length > 0 ? empatadas : [...new Set(sorteadas)];
  if (enJuego.length === 0)
    throw new Error(`el nodo de la casilla ${n} no tiene barrera alrededor ni pareja de regiones`);
  if (enJuego.length === 1) return BARRERAS[enJuego[0] as number] as Barrera;
  const sorteada = enJuego.find((t) => sorteadas.includes(t));
  if (sorteada !== undefined) return BARRERAS[sorteada] as Barrera;
  const peso = (t: number): number =>
    admitidas.reduce((s, c) => s + (c.barrera === BARRERAS[t] ? c.peso : 0), 0);
  // `reduce` se queda con la primera de las de más peso: el orden de `BARRERAS`.
  const mejor = enJuego.reduce((m, t) => (peso(t) > peso(m) ? t : m));
  return BARRERAS[mejor] as Barrera;
}

/** Las cuatro direcciones en cruz: por ellas sigue una entrada (`caminoHastaLibre`). */
const EN_CRUZ: readonly (readonly [number, number])[] = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
];

/**
 * Los ejes que se prueban para las entradas de un nodo, en orden: los rectos y
 * luego los diagonales. Cada uno con su dirección y la opuesta.
 */
const EJES_DEL_NODO: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [1, -1],
  [1, 1],
];

/**
 * Las dos entradas opuestas de un nodo, cada una como las casillas que hay que
 * proteger por su lado (la pegada al nodo primero, la última es de donde sigue
 * el camino), o `null` si la red fina no tiene dos vecinas opuestas pisables de
 * regiones distintas.
 *
 * Antes cada región cogía su primera vecina recta, sin mirar la de enfrente:
 * norte para una y este para la otra son las dos «rectas», y el nodo salía en
 * esquina; y el camino hasta lo libre iba en 8 vecinas, así que la entrada
 * podía quedar unida a su región solo en diagonal. En el agua se veía como un
 * puente que desemboca en un islote o contra una pared (marca del usuario en
 * s2, (7,11); un tercio de los nodos de toda barrera, #161). La red fina ya
 * dejaba el nodo entre vecinas opuestas (563 de 568 pasos en 1-40): las perdía
 * el engorde.
 *
 * Se prueba, y vale el primero que sale:
 * 1. **pleno recto** (N-S, E-O): a cada lado la vecina y la siguiente en el eje,
 *    de la misma región. Hasta distancia 2 porque con una sola, el engorde de la
 *    de detrás la deja unida a su región solo por la diagonal.
 * 2. **pleno diagonal**: lo mismo en diagonal, más un **codo** que una las dos en
 *    cruz (si no, en diagonal tampoco se anda en cruz).
 * 3. **corto**: solo las vecinas opuestas, para lo pegado al borde del mapa.
 *
 * Sin ninguno (1 % de los nodos, casi todos junto al borde) el nodo se viste como
 * antes, una vecina por región: falla la red y no el vestido, y tirar el vestido
 * solo haría tirar la red.
 */
function ejeDelNodo(
  W: number,
  H: number,
  x: number,
  y: number,
  etiqueta: Int32Array,
  muro: Uint8Array,
): readonly (readonly number[])[] | null {
  const libre = (cx: number, cy: number): number =>
    cx >= 0 && cy >= 0 && cx < W && cy < H && muro[cy * W + cx] === 0 ? cy * W + cx : -1;
  const lado = (dx: number, dy: number, pleno: boolean): number[] | null => {
    const a1 = libre(x + dx, y + dy);
    if (a1 < 0) return null;
    if (!pleno) return [a1];
    const a2 = libre(x + 2 * dx, y + 2 * dy);
    if (a2 < 0 || etiqueta[a2] !== etiqueta[a1]) return null;
    if (dx === 0 || dy === 0) return [a1, a2];
    for (const codo of [libre(x + 2 * dx, y + dy), libre(x + dx, y + 2 * dy)]) {
      if (codo >= 0 && etiqueta[codo] === etiqueta[a1]) return [a1, codo, a2];
    }
    return null;
  };
  for (const [pleno, ejes] of [
    [true, EJES_DEL_NODO.slice(0, 2)],
    [true, EJES_DEL_NODO.slice(2)],
    [false, EJES_DEL_NODO],
  ] as const) {
    for (const [dx, dy] of ejes) {
      const a = lado(dx, dy, pleno);
      const b = lado(-dx, -dy, pleno);
      if (a !== null && b !== null && etiqueta[a[0]!] !== etiqueta[b[0]!]) return [a, b];
    }
  }
  return null;
}

/**
 * Si un nodo en la casilla `n` de la red fina tendría eje **pleno** (recto o
 * diagonal, dos casillas de su región a cada lado), que es lo que el generador
 * busca al elegir el paso de cada pareja. El corto, el de junto al borde, no
 * cuenta: con él la casilla de detrás puede engordar y dejar la entrada unida
 * a su región solo por una diagonal.
 */
export function conEjePleno(
  W: number,
  H: number,
  n: number,
  etiqueta: Int32Array,
  muro: Uint8Array,
): boolean {
  const eje = ejeDelNodo(W, H, n % W, Math.floor(n / W), etiqueta, muro);
  return eje !== null && (eje[0]?.length ?? 0) >= 2;
}

/**
 * El camino más corto **en cruz**, dentro de la celda `r`, de `desde` a la
 * primera casilla que no se engorda. En cruz porque uno en diagonal deja la
 * entrada unida a su región por una esquina, entre dos casillas de barrera.
 */
function caminoHastaLibre(
  W: number,
  H: number,
  desde: number,
  r: number,
  etiqueta: Int32Array,
  muro: Uint8Array,
  engorda: Int8Array,
): number[] | null {
  const previo = new Map<number, number>([[desde, desde]]);
  const cola = [desde];
  for (let q = 0; q < cola.length; q++) {
    const a = cola[q] as number;
    if (engorda[a] === ABIERTA) {
      const camino = [a];
      for (let c = a; c !== desde; c = previo.get(c) as number) camino.push(previo.get(c)!);
      return camino;
    }
    const ax = a % W;
    const ay = Math.floor(a / W);
    for (const [dx, dy] of EN_CRUZ) {
      if (ax + dx < 0 || ay + dy < 0 || ax + dx >= W || ay + dy >= H) continue;
      const j = (ay + dy) * W + ax + dx;
      if (previo.has(j) || muro[j] === 1 || etiqueta[j] !== r) continue;
      previo.set(j, a);
      cola.push(j);
    }
  }
  return null;
}

/** La barrera de alguna vecina de un trozo: con eso se rellena un bolsillo. */
/**
 * Que ninguna barrera mienta sobre el desnivel (#143), también en los cruces.
 * El tipo se sortea por pareja de regiones (`barrerasDeLaPareja`), pero el muro
 * fino y su engorde no saben de tres: junto a un cruce, el bosque de una pareja
 * al mismo nivel llegaba a tocar la tercera región, más alta, y el acantilado
 * de una pareja a distinto nivel quedaba en un pico suelto que solo tocaba un
 * lado. Medido en 1-200 sin esto: 31 bosques y 27 muros entre dos niveles, y 57
 * acantilados que no separaban dos. Sobre la frontera ya gruesa y **en espejo**:
 * todo lo que se decide sale de la vecindad de cada casilla y del orden de
 * `BARRERAS`, y la vecindad reflejada es la misma.
 *
 * 1. Un bosque o un muro (franja 8-conexa) que toca regiones a más de un nivel
 *    se queda con el nivel que más toca —en un empate, el más bajo— y cada
 *    casilla suya que toca otro pasa a la barrera de desnivel que más tiene al
 *    lado (o a montaña): es el trozo de la frontera de la otra pareja.
 * 2. Un acantilado (franja 8-conexa) que no toca dos niveles pasa entero a la
 *    montaña o el agua que más tiene al lado (o a montaña): es la punta de la
 *    frontera de otra pareja, y solo, sin desnivel, sería una mesa.
 *
 * Lo que toca una casilla: las regiones de sus ocho vecinas que se pisan (ni
 * barrera ni nodo).
 */
function desnivelEnLosCruces(
  W: number,
  H: number,
  tipos: Tipos,
  etiqueta: Int32Array,
  esNodo: Uint8Array,
  niveles: readonly Nivel[],
): void {
  const N = W * H;
  const { desde, vecinas } = vecindad(W, H);
  const abierta = (j: number): boolean => tipos[j] === ABIERTA && esNodo[j] === 0;
  const BOSQUE = indiceDe('forest');
  const MURO = indiceDe('wall');
  const ACANTILADO = indiceDe('cliff');
  const MONTAÑA = indiceDe('mountain');
  /** La barrera de `admitidas` que más se repite en las vecinas de `casillas`; en un empate, la primera de `BARRERAS`. */
  const laQueMasHay = (casillas: readonly number[], admitidas: readonly number[]): number => {
    const propias = new Set(casillas);
    const cuenta = new Int32Array(BARRERAS.length);
    for (const c of casillas)
      for (let v = desde[c]!; v < desde[c + 1]!; v++) {
        const t = tipos[vecinas[v]!] as number;
        if (t !== ABIERTA && admitidas.includes(t) && !propias.has(vecinas[v]!)) cuenta[t]!++;
      }
    let mejor = MONTAÑA;
    let max = 0;
    for (let t = 0; t < BARRERAS.length; t++)
      if ((cuenta[t] as number) > max) {
        max = cuenta[t] as number;
        mejor = t;
      }
    return mejor;
  };
  /** Las franjas 8-conexas de un tipo, sin nodos. */
  const franjasDe = (tipo: number): number[][] => {
    const vista = new Uint8Array(N);
    const fuera: number[][] = [];
    for (let i = 0; i < N; i++) {
      if (vista[i] === 1 || tipos[i] !== tipo || esNodo[i] === 1) continue;
      vista[i] = 1;
      const toma = (j: number): boolean => {
        if (vista[j] === 1 || tipos[j] !== tipo || esNodo[j] === 1) return false;
        vista[j] = 1;
        return true;
      };
      fuera.push(rellenar(W, H, i, toma));
    }
    return fuera;
  };
  /** Los niveles que toca cada casilla: un bit por nivel. */
  const toca = (c: number): number => {
    let bits = 0;
    for (let v = desde[c]!; v < desde[c + 1]!; v++) {
      const j = vecinas[v]!;
      if (abierta(j)) bits |= 1 << (niveles[etiqueta[j] as number] as number);
    }
    return bits;
  };
  const DESNIVEL = BARRERAS_DE_DESNIVEL.map(indiceDe);

  // 1. Los bosques y los muros. Se decide todo antes de cambiar nada, para que
  //    el resultado no dependa del orden en que se recorren.
  const cambios: [number, number][] = [];
  for (const tipo of [BOSQUE, MURO]) {
    for (const franja of franjasDe(tipo)) {
      const veces = [0, 0, 0];
      for (const c of franja)
        for (let v = desde[c]!; v < desde[c + 1]!; v++) {
          const j = vecinas[v]!;
          if (abierta(j)) veces[niveles[etiqueta[j] as number] as number]!++;
        }
      if (veces.filter((n) => n > 0).length < 2) continue;
      const suyo = veces.indexOf(Math.max(...veces));
      for (const c of franja) {
        if ((toca(c) & ~(1 << suyo)) === 0) continue;
        cambios.push([c, laQueMasHay([c], DESNIVEL)]);
      }
    }
  }
  for (const [c, t] of cambios) tipos[c] = t;

  // 2. Los acantilados que no separan dos niveles.
  for (const franja of franjasDe(ACANTILADO)) {
    let bits = 0;
    for (const c of franja) bits |= toca(c);
    if (bits !== 0 && (bits & (bits - 1)) !== 0) continue;
    const t = laQueMasHay(franja, [MONTAÑA, indiceDe('water')]);
    for (const c of franja) tipos[c] = t;
  }
}

function tipoVecino(W: number, H: number, casillas: readonly number[], tipos: Tipos): number {
  const { desde, vecinas } = vecindad(W, H);
  for (const c of casillas) {
    for (let k = desde[c]!; k < desde[c + 1]!; k++) {
      const t = tipos[vecinas[k]!] as number;
      if (t !== ABIERTA) return t;
    }
  }
  throw new Error('un bolsillo de región sin ninguna barrera alrededor: no puede estar separado');
}

// ---------------------------------------------------------------- obstáculos

export interface EntradaDeObstaculos {
  readonly W: number;
  readonly H: number;
  /** La frontera gruesa; aquí se añaden los obstáculos. */
  readonly tipos: Tipos;
  /** La región de cada casilla del mapa grueso, o −1. */
  readonly regionDe: Int32Array;
  readonly regiones: number;
  readonly suelos: readonly Suelo[];
  /** Los nodos de cada región, por índice plano de su casilla. */
  readonly nodosDeRegion: readonly (readonly number[])[];
  /** Las casillas donde no cae un obstáculo: objetos, inicios, asaltantes, pasillos y lo pegado a un nodo. */
  readonly vetadas: Uint8Array;
  /** Los monstruos: se alcanzan pero no se cruzan. */
  readonly monstruos: Uint8Array;
  /**
   * Las minas y los pueblos: el camino entra en ellos y no los atraviesa
   * (#188), así que una mancha no puede dejar nada al otro lado de uno.
   */
  readonly puertas: Uint8Array;
  readonly rng: Rng;
}

/** Cuántas manchas se intentan por pareja de regiones antes de darla por imposible. */
const INTENTOS_DE_MANCHA = 60;

/**
 * Los obstáculos de dentro de las regiones: manchas de barrera, en espejo cuando
 * la reflejada vale, hasta una densidad sorteada por pareja de regiones entre
 * los dos topes de `data/barreras.json`. Bloquean el paso (decisión del
 * usuario: «como HoMM2»).
 *
 * Una mancha entra solo si:
 * - todas sus casillas son pisables de esa región y no están vetadas —ni
 *   objeto, ni inicio, ni asaltante, ni pasillo, ni pegadas a un nodo—;
 * - **no toca la frontera**, ni en diagonal: así un obstáculo se reconoce desde
 *   fuera —una barrera cuyas vecinas pisables son todas de una región— y nunca
 *   engorda una frontera hasta cerrar un rincón;
 * - y con ella puesta, **desde los nodos de la región se sigue llegando a todas
 *   sus casillas** sin cruzar un monstruo. Es la comprobación que impide partir
 *   la región o tapar un objeto, y es la que se rompió a mano para ver morder la
 *   auditoría.
 *
 * La última mancha de cada región se recorta a lo que falta para la densidad,
 * aunque quede por debajo de `mancha.min` (lo dice `ReglasDeBarreras`).
 *
 * Devuelve `false` si alguna región no llega al mínimo. Antes de gastar los
 * intentos mira si **cabe**: si una región no tiene casillas elegibles ni para
 * la densidad mínima, ninguna mancha la va a llevar ahí.
 */
export function ponerObstaculos(e: EntradaDeObstaculos): boolean {
  const { W, H, tipos, regionDe, rng, vetadas, monstruos, puertas } = e;
  const N = W * H;
  const { densidadPorCiento, mancha } = BARRERAS_DEL_MAPA;
  const { desde, vecinas } = vecindad(W, H);
  const tocaFrontera = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    for (let k = desde[i]!; k < desde[i + 1]!; k++) {
      if (tipos[vecinas[k]!] !== ABIERTA) tocaFrontera[i] = 1;
    }
  }

  const casillas: number[][] = Array.from({ length: e.regiones }, () => []);
  for (let i = 0; i < N; i++) {
    const r = regionDe[i] as number;
    if (r >= 0 && tipos[i] === ABIERTA) casillas[r]!.push(i);
  }
  const total = casillas.map((c) => c.length);
  const puestos = new Array<number>(e.regiones).fill(0);
  // `puestos * 100 >= pct * total`: enteros, sin coma flotante en `core`.
  const llega = (r: number, pct: number): boolean => puestos[r]! * 100 >= pct * total[r]!;
  const cabe = (r: number, n: number): boolean =>
    (puestos[r]! + n) * 100 <= densidadPorCiento.max * total[r]!;
  const valeEn = (r: number, i: number): boolean =>
    regionDe[i] === r && tipos[i] === ABIERTA && vetadas[i] === 0 && tocaFrontera[i] === 0;

  // Lo que puede llevar obstáculo, contado una vez: si no llega ni al mínimo,
  // los intentos de abajo se gastarían para nada.
  for (let r = 0; r < e.regiones; r++) {
    const elegibles = casillas[r]!.filter((i) => valeEn(r, i)).length;
    if (elegibles * 100 < densidadPorCiento.min * total[r]!) return false;
  }

  // El BFS de alcance, con un sello por búsqueda en vez de una rejilla nueva, y
  // la mancha candidata marcada en `enMancha` mientras se mira.
  const sello = new Int32Array(N);
  let ronda = 0;
  const enMancha = new Uint8Array(N);
  const alcanzaTodo = (r: number, celdas: readonly number[]): boolean => {
    for (const c of celdas) enMancha[c] = 1;
    ronda++;
    const cola: number[] = [];
    const expandir = (a: number): void => {
      for (let k = desde[a]!; k < desde[a + 1]!; k++) {
        const j = vecinas[k]!;
        if (sello[j] === ronda || regionDe[j] !== r || tipos[j] !== ABIERTA || enMancha[j] === 1)
          continue;
        sello[j] = ronda;
        cola.push(j);
      }
    };
    const quedan = total[r]! - puestos[r]! - celdas.length;
    // Desde los nodos, sin cruzar un monstruo, una mina ni un pueblo.
    for (const n of e.nodosDeRegion[r] ?? []) expandir(n);
    for (let q = 0; q < cola.length; q++) {
      const a = cola[q]!;
      if (monstruos[a] === 0 && puertas[a] === 0) expandir(a);
    }
    let vale = cola.length === quedan;
    // Y de una pieza sin cruzar una mina ni un pueblo, aunque sí un monstruo:
    // desde los nodos, cada mitad de una región partida por una mina se
    // alcanzaba desde el suyo, y su camino tenía que cruzarla (s17, (4,28)).
    const primera = casillas[r]!.find(
      (i) => tipos[i] === ABIERTA && enMancha[i] === 0 && puertas[i] === 0,
    );
    if (vale && primera !== undefined) {
      ronda++;
      cola.length = 0;
      sello[primera] = ronda;
      cola.push(primera);
      for (let q = 0; q < cola.length; q++) if (puertas[cola[q]!] === 0) expandir(cola[q]!);
      vale = cola.length === quedan;
    }
    for (const c of celdas) enMancha[c] = 0;
    return vale;
  };

  /** Un paseo de casillas rectas desde un punto al azar de la región. */
  const RECTAS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  const trazar = (r: number, tamaño: number): number[] | null => {
    const libres = casillas[r]!.filter((i) => valeEn(r, i));
    if (libres.length === 0) return null;
    const hecha = [rng.pick(libres)];
    for (let guarda = 0; hecha.length < tamaño && guarda < tamaño * 6; guarda++) {
      const { x, y } = aPunto(rng.pick(hecha), W);
      const [dx, dy] = rng.pick(RECTAS);
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (hecha.includes(j) || !valeEn(r, j)) continue;
      hecha.push(j);
    }
    return hecha.length >= Math.min(tamaño, mancha.min) ? hecha : null;
  };

  /** Si alguna casilla de fuera de la mancha, junto a ella (8 vecinas), ya es muro. */
  const tocaMuro = (mancha: readonly number[]): boolean =>
    mancha.some((c) => {
      for (let k = desde[c]!; k < desde[c + 1]!; k++) {
        const j = vecinas[k]!;
        if (tipos[j] === indiceDe('wall') && !mancha.includes(j)) return true;
      }
      return false;
    });
  const poner = (r: number, celdas: readonly number[], tipo: number): void => {
    for (const c of celdas) tipos[c] = tipo;
    puestos[r]! += celdas.length;
  };

  for (let r = 0; r < e.regiones; r += 2) {
    const par = parejaDe(r);
    const pct = rng.int(densidadPorCiento.min, densidadPorCiento.max);
    // La que va más atrás pone la mancha; la otra la intenta en espejo.
    const laDeAtras = (): number => {
      if (llega(r, pct)) return par;
      if (llega(par, pct)) return r;
      return puestos[r]! * total[par]! <= puestos[par]! * total[r]! ? r : par;
    };
    for (
      let intento = 0;
      intento < INTENTOS_DE_MANCHA && !(llega(r, pct) && llega(par, pct));
      intento++
    ) {
      const atras = laDeAtras();
      const otra = parejaDe(atras);
      // Lo que falta para el objetivo, en casillas y en enteros: la última
      // mancha sale de ese tamaño aunque quede por debajo de `mancha.min`.
      const falta = Math.floor((pct * total[atras]! + 99) / 100) - puestos[atras]!;
      const tamaño = Math.min(rng.int(mancha.min, mancha.max), Math.max(1, falta));
      const celdas = trazar(atras, tamaño);
      if (celdas === null || !cabe(atras, celdas.length) || !alcanzaTodo(atras, celdas)) continue;
      const reflejo = celdas.map((c) => espejoDe(c, N));
      const deSuSuelo = BARRERAS_DEL_MAPA.obstaculos[e.suelos[atras]!];
      let tipo = indiceDe(sortear(rng, deSuSuelo));
      // Una ruina pegada a otro muro se ve como una muralla (la escena une el
      // muro 8-conexo): dos manchas de seis juntas hacían una de 9 casillas de
      // largo en medio de una región (s22 (23-28, 14-15), #208). Ahí va la
      // barrera de su suelo que más pesa sin el muro (`laMasPesada`, que no
      // tira: el azar de lo que viene detrás no se mueve); todos los suelos que
      // admiten muro admiten otra.
      if (tipo === indiceDe('wall') && [celdas, reflejo].some((m) => tocaMuro(m))) {
        tipo = indiceDe(laMasPesada(deSuSuelo.filter((c) => c.barrera !== 'wall')));
      }
      poner(atras, celdas, tipo);
      if (llega(otra, pct)) continue;
      if (
        reflejo.every((c) => valeEn(otra, c)) &&
        cabe(otra, reflejo.length) &&
        alcanzaTodo(otra, reflejo)
      ) {
        poner(otra, reflejo, tipo);
      }
    }
    if (!llega(r, densidadPorCiento.min) || !llega(par, densidadPorCiento.min)) return false;
  }
  return true;
}

// ---------------------------------------------------------------- caminos

export interface EntradaDeCaminos {
  readonly W: number;
  readonly H: number;
  readonly tipos: Tipos;
  readonly regionDe: Int32Array;
  readonly regiones: number;
  /** El suelo de cada región: el camino se busca con lo que cuesta andarlo. */
  readonly suelos: readonly Suelo[];
  /** Los nodos de cada región, por índice plano: se llega a ellos, no se cruzan. */
  readonly nodosDeRegion: readonly (readonly number[])[];
  /**
   * Adónde lleva camino cada región, por índice plano: los nodos que le tocan
   * en el reparto de la red (`crucesConCamino`), sus minas y sus pueblos.
   */
  readonly objetivos: readonly (readonly number[])[];
  /**
   * Los objetos con puerta —ciudades, minas y pueblos—, por índice plano y con
   * su clase. Son hojas: se llega a ellos y no se cruzan, y se entra por una de
   * sus puertas (#188; la mina, por debajo o por la derecha, #230: `puertas.ts`).
   */
  readonly puertas: readonly { readonly at: number; readonly kind: ConPuerta }[];
  readonly monstruos: Uint8Array;
  /** Lo ya puesto —nodos, inicios, objetos, asaltantes—: el centro no cae encima. */
  readonly ocupadas: ReadonlySet<number>;
  /**
   * El nivel de cada casilla como lo pintará la escena (`nivelesDelRelieve`,
   * por `nivelesDeLoEngordado`): la búsqueda no pasa por una silla ni cambia de
   * nivel en diagonal si tiene otro sitio (#224).
   */
  readonly nivel: ArrayLike<number>;
  /**
   * Los nodos de agua que no son ciudad: puentes. Su tramo no se mira torcido,
   * como el agua de las esquinas de #210: el puente es su paso, con su pieza
   * por eje y su vado, y la escena no le pone bajada.
   */
  readonly puentes: ReadonlySet<number>;
}

/**
 * Cuántos pasos rectos de más cuesta trazar un camino por una casilla al pie de
 * una barrera que le queda al norte (#189). La escena pinta el relieve con la
 * cámara al sur: lo alto cuelga sobre la casilla de debajo —0,6 casillas por
 * nivel, más las diagonales de sus esquinas— y la senda que va pegada a ese pie
 * desaparece bajo la pared, que nunca se corta ni se aparta (CLAUDE.md, «el
 * relieve por celdas»). El núcleo no sabe qué quedará alto —el nivel de cada
 * región lo sortea la escena—, pero sí lo seguro: un **acantilado** va siempre
 * por encima de lo que pisa a su lado, salvo el cañón entre dos regiones al
 * mismo nivel, y tapaba la senda en el 55 % de las casillas de camino que tenían
 * uno al N, NO o NE (semillas 1-40, 08-10-2026). Una **montaña o un bosque**
 * toman el nivel de su lado alto (#180): tapan solo al lado bajo, un 15 %, y
 * cuestan uno. Al norte y no a los lados ni al sur: cobrar las ocho vecinas
 * medía peor (18,2 casillas tapadas por mapa frente a 17,0). Es un coste, no
 * una prohibición: un pasillo de una casilla al pie de un acantilado sigue
 * siendo el camino si no hay otro.
 */
const AL_PIE_DEL_ACANTILADO = 3;
/** Los pasos rectos de más de una silla entre dos casillas de una región (`cobroDelTorcido`). */
const SILLA = 2;
const AL_PIE_DE_LO_ALTO = 1;
/**
 * Y por una casilla del borde del mapa, que la escena pinta medio bajo las
 * nubes: un camino pegado a él parecía salirse del mapa (auditoría, defecto 7).
 * El grueso de esos caminos no venía de aquí sino de las puertas en el borde
 * (`colocarPar`, generate.ts); esto aparta el resto donde hay sitio.
 */
const POR_EL_BORDE = 2;

/**
 * Los pasos rectos de más que cuesta cada casilla de `casillas` al trazar
 * (`AL_PIE_DEL_ACANTILADO`, `AL_PIE_DE_LO_ALTO`, `POR_EL_BORDE`), sumados.
 */
function recargosDelTrazado(e: EntradaDeCaminos, casillas: readonly number[]): Uint8Array {
  const { W, H, tipos } = e;
  const recargo = new Uint8Array(W * H);
  const acantilado = BARRERAS.indexOf('cliff');
  const montana = BARRERAS.indexOf('mountain');
  const bosque = BARRERAS.indexOf('forest');
  for (const i of casillas) {
    const x = i % W;
    const y = (i - x) / W;
    let n = x === 0 || y === 0 || x === W - 1 || y === H - 1 ? POR_EL_BORDE : 0;
    let alto = 0;
    for (let dx = -1; y > 0 && dx <= 1; dx++) {
      if (x + dx < 0 || x + dx >= W) continue;
      const t = tipos[i - W + dx] as number;
      if (t === acantilado) alto = AL_PIE_DEL_ACANTILADO;
      else if (t === montana || t === bosque) alto = Math.max(alto, AL_PIE_DE_LO_ALTO);
    }
    n += alto;
    recargo[i] = n;
  }
  return recargo;
}

/** Las clases de objeto con puerta, en el orden en que las marca `Busqueda.puerta`. */
const CLASES_CON_PUERTA: readonly ConPuerta[] = ['town', 'mine', 'village'];

/**
 * El Dijkstra de una región con el coste del héroe: lo de `red` a mitad de
 * precio y un paso recto de más por arrimarse a ella viniendo de fuera.
 * Reutiliza `coste` y `previo` de una búsqueda a otra.
 *
 * **Un objeto con puerta se entra por delante** (#188, «como en el HoMM»): la
 * cámara mira desde el sur y la puerta del sprite está en su pie, así que se
 * llega desde la fila de debajo; a una mina, también desde la derecha, por
 * donde salen sus raíles (#230, `puertas.ts`), y su ramal sale por la que menos
 * cueste. Entrar de lado cuesta `rodeo` y por detrás el
 * doble, más que cualquier camino sin monstruos: se entra por la mejor fila
 * que se alcance, que es un coste y no una prohibición, porque una ciudad es un
 * nodo y la región que solo la toca por detrás tiene que llegar por ahí. Salir
 * de un objeto con puerta, cuando es el origen (`centroDeRegion` busca desde
 * cada objetivo), cuesta lo mismo: el centro se elige con la cuenta con la que
 * luego se traza.
 */
class Busqueda {
  readonly coste: Int32Array;
  readonly previo: Int32Array;
  /** Las casillas de la región, en orden de índice. */
  readonly casillas: readonly number[];
  /** Los nodos de la región: se llega a ellos, no se cruzan. */
  private readonly nodo: Uint8Array;
  /** Los nodos y los objetos con puerta: las hojas del árbol (`ArbolDeCaminos`). */
  readonly hoja: Uint8Array;
  /**
   * Los objetos con puerta: se entran por delante. La clase de cada uno, +1, en
   * `CLASES_CON_PUERTA`; 0 si no lleva.
   */
  private readonly puerta: Uint8Array;
  /** Los objetivos de la región (`EntradaDeCaminos.objetivos`): acaban todos en la red. */
  private readonly objetivo: Uint8Array;
  /**
   * Las vecinas de un objeto con puerta por las que se entraría de lado o por
   * detrás (`rodeosParaEntrar` de tres o más). Un radio que pasa por ellas rodea
   * el objeto por detrás o se le pega de lado, y la senda pintada se mete bajo
   * el sprite.
   */
  private readonly espalda: Uint8Array;
  /** Lo que cuesta de más trazar por cada casilla (`recargosDelTrazado`): el pie de lo alto y el borde. */
  private readonly recargo: Uint8Array;
  private readonly recto: number;
  private readonly diagonal: number;
  /** Más que cualquier camino sin monstruos dentro del mapa: lo que cuesta entrar de lado. */
  private readonly rodeo: number;
  private readonly pisarMonstruo: number;

  constructor(
    private readonly e: EntradaDeCaminos,
    private readonly r: number,
  ) {
    const N = e.W * e.H;
    this.coste = new Int32Array(N);
    this.previo = new Int32Array(N);
    this.nodo = new Uint8Array(N);
    this.hoja = new Uint8Array(N);
    this.puerta = new Uint8Array(N);
    this.objetivo = new Uint8Array(N);
    for (const o of e.objetivos[r] ?? []) this.objetivo[o] = 1;
    for (const n of e.nodosDeRegion[r] ?? []) {
      this.nodo[n] = 1;
      this.hoja[n] = 1;
    }
    this.espalda = new Uint8Array(N);
    const { desde, vecinas } = vecindad(e.W, e.H);
    for (const { at: p, kind } of e.puertas) {
      this.hoja[p] = 1;
      this.puerta[p] = CLASES_CON_PUERTA.indexOf(kind) + 1;
      for (let k = desde[p]!; k < desde[p + 1]!; k++) {
        const v = vecinas[k]!;
        if (this.rodeosEntre(p, v) >= 3) this.espalda[v] = 1;
      }
    }
    const casillas: number[] = [];
    for (let i = 0; i < N; i++) {
      if (e.regionDe[i] === r && e.tipos[i] === ABIERTA) casillas.push(i);
    }
    this.casillas = casillas;
    this.recargo = recargosDelTrazado(e, casillas);
    const suelo = e.suelos[r] as Suelo;
    this.recto = costeDeEntrada(suelo, false, false);
    this.diagonal = costeDeEntrada(suelo, false, true);
    this.rodeo = N * this.diagonal;
    // Más que cualquier camino sin monstruos: se rodean si se puede. Pero
    // menos que entrar en un objeto de lado (`porDonde`).
    this.pisarMonstruo = 2 * this.rodeo;
  }

  /** Los rodeos de pasar entre el objeto con puerta `d` y su vecina `v` (`rodeosParaEntrar`). */
  private rodeosEntre(d: number, v: number): number {
    const W = this.e.W;
    const kind = CLASES_CON_PUERTA[(this.puerta[d] as number) - 1] as ConPuerta;
    return rodeosParaEntrar(kind, (v % W) - (d % W), (v - (v % W)) / W - (d - (d % W)) / W);
  }

  /**
   * Lo que cuesta de más un paso torcido por el relieve (`pasoTorcido`, #224).
   * Cambiar de nivel en diagonal —solo se puede entre un nodo o una ciudad y
   * su región— cuesta más que cualquier entrada en cruz, también que entrar
   * en una ciudad por detrás (`porDonde`, cuatro rodeos): la rampa va de
   * frente o no va. Por un costado de la línea, menos que en diagonal y más
   * que de frente. Una silla junto a un nodo, igual que la diagonal: es su
   * entrada, y tiene otra o el vestido la endereza (`sinSillas`). Una silla
   * entre dos casillas de la región, `SILLA` rectos, como la esquina de agua
   * de #210: más que la vuelta por la L de una esquina, sin echar el camino al
   * borde por un vértice.
   */
  private cobroDelTorcido(torcido: PasoTorcido, conNodo: boolean): number {
    if (torcido === 'costado') return 2 * this.rodeo;
    if (torcido === 'diagonal' || conNodo) return 5 * this.rodeo;
    return SILLA * this.recto;
  }

  /**
   * Desde `origen`. Con el `arbol` de la región, lo trazado (`red`) cuesta la
   * mitad y arrimarse (`pegada`: las casillas 8-vecinas de la red), un paso
   * recto más. Con `hasta`, se para al sacarlo: lo que se lee después es su
   * `previo`, que ya no cambia.
   */
  buscar(origen: number, arbol?: ArbolDeCaminos, hasta?: number): void {
    const red = arbol?.red;
    const pegada = arbol?.pegada;
    const { W, H, regionDe, tipos, monstruos } = this.e;
    const { desde, vecinas } = vecindad(W, H);
    const { coste, previo, nodo, hoja, puerta, espalda } = this;
    // Lo que cuesta pasar entre el objeto con puerta `d` y su vecina `v`: por
    // una puerta (la de debajo, y en una mina también la de la derecha), nada;
    // por las diagonales de delante, un rodeo; de lado, tres; por detrás,
    // cuatro (`rodeosParaEntrar`). Pisar un monstruo (dos) va en medio: se
    // llega a la puerta por encima del guardia antes que por el costado, que es
    // como guarda un monstruo lo bueno.
    const porDonde = (d: number, v: number): number => this.rodeosEntre(d, v) * this.rodeo;
    // Cuántos rectos cuesta una hoja en la esquina de un paso en diagonal: un
    // nodo de la red, dos; un objeto con puerta, cuatro, y aunque todavía no
    // esté en la red, porque siempre acaba en ella (es objetivo de su región) y
    // la Y saldría al colgar después su ramal. Cuatro y no dos porque la L de
    // al lado suele pasar por el costado de otra (`espalda`, dos rectos más:
    // una mina y un pueblo vecinos, s195 (11,15)). El nodo que es objetivo y
    // aún no está en la red, también dos, por lo mismo: con las fronteras
    // onduladas de #229 un radio pasó en diagonal junto a un nodo que se colgó
    // después (42×42 s15 (1,21)-(2,22)).
    const { objetivo } = this;
    const yEnLaEsquina = (k: number): number =>
      puerta[k] !== 0 ? 4 : hoja[k] === 1 && (red?.[k] === 1 || objetivo[k] === 1) ? 2 : 0;
    const r = this.r;
    const AGUA = indiceDe('water');
    coste.fill(-1);
    previo.fill(-1);
    const frontera = new Frontera(W * H);
    coste[origen] = 0;
    frontera.push(origen, 0);
    for (let sale = frontera.pop(); sale !== undefined; sale = frontera.pop()) {
      const a = sale.key;
      const hastaAqui = sale.cost;
      if (hastaAqui > (coste[a] as number)) continue;
      if (a === hasta) return;
      // Un nodo es final de tramo: se llega, no se cruza (llevaría a otra
      // región). Una mina o un pueblo se rodean (#188): el radio que sigue de
      // largo pasa por delante, porque el ramal ya es red a mitad de precio.
      // Antes de #153 eso daba radios paralelos y ciclos por adyacencia
      // (historia.md, «Caminos»); con tramos, no. Los obstáculos no parten
      // una región por una mina (`ponerObstaculos`), pero un monstruo al lado
      // de una sí (s28, (13,3)): se cruza antes el monstruo, que es una figura
      // que se va, que la mina, que se queda; y la mina solo si no hay otra.
      if (nodo[a] === 1 && a !== origen) continue;
      // Más que la peor cuenta de puertas: salir de una por detrás y entrar en
      // otra por detrás, ocho rodeos.
      const cruza = puerta[a] !== 0 && a !== origen ? 10 * this.rodeo : 0;
      const x = a % W;
      const y = (a - x) / W;
      const enLaRed = red?.[a] === 1;
      for (let k = desde[a]!; k < desde[a + 1]!; k++) {
        const j = vecinas[k]!;
        if (!((regionDe[j] === r && tipos[j] === ABIERTA) || nodo[j] === 1)) continue;
        const enDiagonal = j % W !== x && (j - (j % W)) / W !== y;
        let paso =
          monstruos[j] === 1 ? this.pisarMonstruo : enDiagonal ? this.diagonal : this.recto;
        if (red?.[j] === 1) paso = Math.floor(paso / 2);
        else {
          if (!enLaRed && pegada?.[j] === 1) paso += this.recto;
          paso += (this.recargo[j] as number) * this.recto;
        }
        paso += cruza;
        if (puerta[j] !== 0) paso += porDonde(j, a);
        // Rodear por detrás o pegarse de lado cuesta dos rectos: por delante,
        // con el ramal ya trazado a mitad de precio, sale más barato.
        else if (espalda[j] === 1) paso += 2 * this.recto;
        if (a === origen && puerta[a] !== 0) paso += porDonde(a, j);
        // Pasar en diagonal junto a una hoja de la red —un nodo o un objeto con
        // puerta— sale en Y, y no se puede colgar en L de ella (`ArbolDeCaminos`). Se cobra y
        // no se prohíbe: a veces es el único paso (semilla 60), y sin él el
        // objetivo se queda sin camino. Cobra **dos** pasos rectos, más que la L
        // por la otra esquina: esa L son dos rectos y su segundo se arrima a la
        // red —toca el nodo—, así que paga uno más (tres rectos). Con uno solo,
        // diagonal y recto (~2,4) salía más barato que la L (3) y la Y se
        // quedaba (34×34, semillas 4310 y 4525, #179).
        // Cortar en diagonal la esquina de una casilla de agua pinta la senda
        // sobre el agua: la huella (0,32 de ancho) pasa por el vértice común y
        // entra en las dos esquinas (#210; 631 tramos así en 1-40, 117 con las
        // dos esquinas de agua). Cuesta dos rectos, como la Y: más que la L por
        // la esquina de tierra. Con un rodeo el camino se iba al borde del mapa
        // por no tocar un vértice de agua (3,25 tramos por el borde por mapa en
        // 1-20, techo 3). Lo que queda lo arregla `sinAguaEnLasEsquinas`.
        // A un nodo no se cobra: al puente se llega como sea (con su vado), y
        // la entrada en diagonal de los demás no tiene otra.
        if (enDiagonal && nodo[j] === 0 && nodo[a] === 0) {
          const jx = j % W;
          if (tipos[y * W + jx] === AGUA || tipos[j - jx + x] === AGUA) paso += 2 * this.recto;
        }
        const torcido =
          this.e.puentes.has(a) || this.e.puentes.has(j)
            ? null
            : pasoTorcido(W, H, this.e.nivel, a, j);
        if (torcido !== null) paso += this.cobroDelTorcido(torcido, nodo[a] === 1 || nodo[j] === 1);
        if (enDiagonal && red !== undefined) {
          const jx = j % W;
          const k1 = y * W + jx;
          const k2 = j - jx + x;
          const enY = Math.max(yEnLaEsquina(k1), yEnLaEsquina(k2));
          // La L va por la otra esquina, que puede estar al pie de lo alto o en
          // el borde y costar su recargo: la Y cobra también el mayor, o salía
          // más barata que esa L (s1 (32,5), en el borde; #189).
          if (enY > 0) {
            const recargo = Math.max(this.recargo[k1] as number, this.recargo[k2] as number);
            paso += (enY + recargo) * this.recto;
          }
          // La cuarta diagonal de una casilla dibuja un aspa: dos sendas rectas
          // que se cruzan, y se lee como trazado a regla (s2, (1,31): el centro
          // de la región en medio de tres minas y un nodo, uno en cada
          // diagonal; 37 en 31 mapas de 1-1000, auditoría 3 §7). Seis pasos
          // rectos: más que la vuelta por la casilla de al lado, que la parte
          // en T, aunque esa casilla sea el costado de una mina (`espalda`, dos
          // más) y la T pase por otra; con dos, como la Y, salían 5 aspas en
          // 1-1000 entre minas y pueblos (#188, s376 y s850).
          if (arbol?.cerrariaUnAspa(a, j) === true) paso += 6 * this.recto;
        }
        const c = hastaAqui + paso;
        if (coste[j] !== -1 && (coste[j] as number) <= c) continue;
        coste[j] = c;
        previo[j] = a;
        frontera.push(j, c);
      }
    }
  }
}

/**
 * El centro de la región `r`: la casilla abierta y libre —sin monstruo ni nada
 * de `ocupadas`— que menos le cuesta al héroe sumando lo que hay hasta cada uno
 * de sus objetivos. Desempata el índice menor. Es un hecho derivado: el plan
 * guarda en `regions[].at` la semilla del Voronoi, que puede tener un monstruo
 * encima. `-1` si la región no lleva camino a nada.
 */
export function centroDeRegion(
  e: EntradaDeCaminos,
  r: number,
  b: Busqueda = new Busqueda(e, r),
): number {
  const objetivos = e.objetivos[r] ?? [];
  if (objetivos.length === 0) return -1;
  const suma = new Map<number, number>(b.casillas.map((i) => [i, 0]));
  for (const o of objetivos) {
    b.buscar(o);
    for (const [i, t] of suma) {
      const v = b.coste[i] as number;
      if (v < 0) suma.delete(i);
      else suma.set(i, t + v);
    }
  }
  let mejor = -1;
  for (const [i, t] of suma) {
    if (e.monstruos[i] === 1 || e.ocupadas.has(i)) continue;
    if (mejor === -1 || t < (suma.get(mejor) as number)) mejor = i;
  }
  if (mejor === -1) {
    throw new Error(
      `la región ${r} no tiene una casilla libre desde la que se llegue a todos sus objetivos: no hay dónde poner el centro de sus caminos`,
    );
  }
  return mejor;
}

/**
 * La red de caminos del mapa: **radial dentro de cada región** (decisión del
 * usuario, #149). Qué nodos lleva cada región lo decide antes la red
 * (`crucesConCamino`, en `generate.ts`); aquí solo se trazan los radios.
 *
 * Por región:
 *
 * 1. Su centro (`centroDeRegion`).
 * 2. Los objetivos, del más cercano al centro al más lejano (desempata el
 *    índice). Para cada uno, un Dijkstra **desde el centro** en el que lo ya
 *    trazado cuesta la mitad —los radios comparten el tronco y se abren donde
 *    hace falta— y arrimarse a la red viniendo de fuera cuesta un paso recto
 *    más: si no, un radio nuevo corre pegado a uno viejo, y dos trazos
 *    paralelos a una casilla se leen como una calzada ancha (entre sus
 *    pasillos de senda queda una franja de 0,2 sin cubierta). Medido el
 *    07-10-2026 en las semillas 1-10, sin ese paso hay un 42 % más de trazos
 *    que se rozan sin tramo entre ellos (33,5 → 47,5 por mapa), el doble de
 *    calzadas anchas y de bloques 2×2, y más horquillas (#155).
 * 3. Se recorre el tramo hacia atrás hasta tocar la red, y sus casillas se
 *    cuelgan del árbol de la región (`ArbolDeCaminos`), que endereza en L las
 *    horquillas en diagonal al colgarlas.
 *
 * Devuelve los **tramos**, que son lo que se guarda y se pinta (#153): con
 * casillas, el pintor unía por adyacencia dos radios vecinos y dibujaba bucles
 * que nadie había trazado, y aquí había que comprobar lo dibujado y vestir otra
 * vez el mapa cuando un radio rozaba un nodo ajeno. Con tramos no hay nada que
 * comprobar.
 *
 * Un nodo es final de tramo, así que no hay tramo de paso a paso: cada nodo con
 * camino es una hoja de la red de su región. **Una ciudad, una mina o un pueblo
 * también, y se entra por su puerta** (#188): desde la fila de delante si se
 * alcanza, y a una mina también desde la derecha (#230) (`Busqueda`); el radio que sigue de largo pasa por delante y el
 * objeto cuelga de él con un ramal de una casilla. El coste es el del héroe, así que
 * un camino va por donde se anda. **Rodea a los monstruos si puede, y si no,
 * pasa por encima**: un guardia que corta la región en dos deja cada mitad
 * alcanzable desde su nodo, pero el radio que va de una a la otra tiene que
 * pasar por él.
 *
 * Es un Dijkstra sobre la rejilla provisional del generador, no el del mapa: el
 * invariante que guarda que nadie llame a `findPath` fuera de `game.ts` es por
 * lo hostil de una partida, que aquí no existe todavía. Comparte con aquel la
 * `Frontera`, y con ella el desempate por orden de descubrimiento. No tira del
 * `rng`: cambiar los caminos no mueve nada más del mapa.
 *
 * Lanza si un objetivo no se alcanza ni pasando por monstruos: la red ya está
 * validada y los obstáculos no parten la región, así que sería un fallo de
 * programa, no un mapa raro.
 */
/** Si la casilla `k` es la de un puente o una de sus ocho vecinas: su río. */
const juntoAUnPuente =
  (W: number, puentes: ReadonlySet<number>) =>
  (k: number): boolean => {
    const kx = k % W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (kx + dx >= 0 && kx + dx < W && puentes.has(k + dy * W + dx)) return true;
    return false;
  };

/**
 * Las esquinas de agua que cortan en diagonal los tramos de `tramos`, por índice
 * plano. Ninguna si el trazado es bueno (#210): la huella de la senda (0,32 de
 * ancho) pasa por el vértice común y se pinta sobre el agua de las dos esquinas.
 * Sin las del puente (`puentes`): el tramo que llega a él y el agua pegada a su
 * casilla, que es su río; ahí la senda llega por tierra a los estribos y la
 * escena pinta el vado (`Escena.vados`). Pasar ese agua a otra barrera dejaba
 * el puente rodeado de montaña (67 nodos de agua con más montaña que agua
 * alrededor en 1-200).
 */
export function esquinasDeAgua(
  W: number,
  esAgua: (i: number) => boolean,
  tramos: readonly (readonly [number, number])[],
  puentes: ReadonlySet<number>,
): number[] {
  const fuera: number[] = [];
  const junto = juntoAUnPuente(W, puentes);
  for (const [p, q] of tramos) {
    const px = p % W;
    const qx = q % W;
    if (px === qx || p - px === q - qx || puentes.has(p) || puentes.has(q)) continue;
    for (const k of [p - px + qx, q - qx + px]) if (esAgua(k) && !junto(k)) fuera.push(k);
  }
  return fuera;
}

/**
 * Pasa a montaña cada esquina de agua que una senda corta en diagonal (#210),
 * y su reflejo si también es agua: el mapa va en espejo. La búsqueda ya cobra
 * ese paso (`Busqueda`), así que lo que queda es sobre todo la entrada en
 * diagonal de un nodo o una ciudad entre dos barreras, o una región unida por
 * un vértice. Las dos
 * esquinas son barrera, así que nada se abre ni se parte; la montaña admite
 * cualquier pareja de niveles. Un nodo no se toca: su casilla la abre
 * `buildMap`.
 */
export function sinAguaEnLasEsquinas(
  W: number,
  H: number,
  tipos: Tipos,
  tramos: readonly (readonly [number, number])[],
  puentes: ReadonlySet<number>,
  nodos: ReadonlySet<number>,
): void {
  const AGUA = indiceDe('water');
  const MONTAÑA = indiceDe('mountain');
  const N = W * H;
  const junto = juntoAUnPuente(W, puentes);
  for (const k of esquinasDeAgua(W, (i) => tipos[i] === AGUA && !nodos.has(i), tramos, puentes))
    for (const c of [k, espejoDe(k, N)])
      if (tipos[c] === AGUA && !nodos.has(c) && !junto(c)) tipos[c] = MONTAÑA;
}

/**
 * Abre a su región la esquina de cada tramo que entra torcido en un nodo o una
 * ciudad (#224, `pasoTorcido`): en diagonal y cambiando de nivel, o por una
 * silla. La búsqueda ya los cobra (`cobroDelTorcido`), así que lo que queda es
 * la región que toca el nodo solo por un vértice. Abierta la esquina, la región
 * llega al nodo en cruz y la rampa baja de frente; quien llama vuelve a trazar.
 *
 * Una esquina se abre a la región `r` de la punta que no es nodo si es barrera,
 * no es nodo, todo lo que se pisa en sus ocho vecinas (sin los nodos) es de
 * `r` —si no, uniría dos regiones por un vértice— y abierta no queda por encima
 * de sus dos vecinas de un eje (`sinEspiga`, la regla de #210). Y en espejo: la
 * esquina reflejada, a la región reflejada, con la misma regla, o ninguna de
 * las dos. De las dos esquinas, la que deja la rampa de frente, con sus dos
 * costados (`pasoTorcido` del tramo nuevo), y si no, la otra.
 *
 * Es la forma con menos daño: no cambia la barrera de nada más, no toca las
 * otras regiones y la casilla abierta es de la meseta que ya llegaba al nodo.
 * Devuelve cuántas casillas abrió.
 */
export function abrirEsquinasTorcidas(e: {
  readonly W: number;
  readonly H: number;
  readonly tipos: Tipos;
  readonly regionDe: Int32Array;
  readonly nodos: ReadonlySet<number>;
  readonly nivel: ArrayLike<number>;
  /** El nivel de cada región: lo que se abre no deja una franja con niveles que no admite. */
  readonly niveles: readonly Nivel[];
  /** La barrera de cada nodo que no es ciudad: el de agua es puente, agua en la escena. */
  readonly puentes: ReadonlySet<number>;
  /** Las casillas que eran barrera de frontera antes de los obstáculos: un obstáculo no se abre. */
  readonly deFrontera: (i: number) => boolean;
  /** La barrera que cruza cada nodo que no es ciudad (`queCruzaElNodo`): tiene que seguir siendo la que más se ve. */
  readonly barreraDeNodo: ReadonlyMap<number, Barrera>;
  readonly ciudades: readonly number[];
  /** Si la región `r` admite una casilla más sin bajar de la densidad mínima de obstáculos. */
  readonly admiteUnaMas: (r: number) => boolean;
  readonly tramos: readonly (readonly [number, number])[];
}): number {
  const { W, H, tipos, regionDe, nodos } = e;
  const CORTADO = indiceDe('cliff');
  const N = W * H;
  const nivel = Int8Array.from(e.nivel);
  const { desde, vecinas } = vecindad(W, H);
  const abrible = (k: number, r: number): boolean => {
    if (tipos[k] === ABIERTA || nodos.has(k) || r < 0 || esquinaDeRegion(k, r) === k) return false;
    if (!e.deFrontera(k) || !e.admiteUnaMas(r) || !guardaLosNodos(k) || muerdeUnaPuerta(k))
      return false;
    if (separaDosRegiones(k, r) || parteLoQueNoEsRegion(k)) return false;
    for (let v = desde[k]!; v < desde[k + 1]!; v++) {
      const j = vecinas[v]!;
      if (tipos[j] === ABIERTA && !nodos.has(j) && regionDe[j] !== r) return false;
    }
    // Abierta va al nivel de `r`: no por encima de sus dos vecinas de un eje.
    const n = nivel[esquinaDeRegion(k, r)] as number;
    const x = k % W;
    if (x > 0 && x < W - 1 && (nivel[k - 1] as number) < n && (nivel[k + 1] as number) < n)
      return false;
    return !(k >= W && k < N - W && (nivel[k - W] as number) < n && (nivel[k + W] as number) < n);
  };
  // Cada nodo de al lado sigue viendo más de su barrera que de otra
  // (`queCruzaElNodo`, #145): la esquina que se abre es una menos de la suya.
  const guardaLosNodos = (k: number): boolean => {
    const quitada = barreraDe(tipos, k);
    for (let v = desde[k]!; v < desde[k + 1]!; v++) {
      const n = vecinas[v]!;
      const suya = e.barreraDeNodo.get(n);
      if (suya === undefined) continue;
      const veces = new Map<Barrera, number>();
      for (let w = desde[n]!; w < desde[n + 1]!; w++) {
        const j = vecinas[w]!;
        const b = j === k || nodos.has(j) ? null : barreraDe(tipos, j);
        if (b !== null) veces.set(b, (veces.get(b) ?? 0) + 1);
      }
      if (quitada !== suya) continue;
      for (const [b, c] of veces) if (b !== suya && c > (veces.get(suya) ?? 0)) return false;
    }
    return true;
  };
  // Lejos de los nodos, dos regiones a dos pasos solo con un acantilado en
  // medio (`engordarFronteras`, paso 7d): el acantilado que se abre puede ser
  // el que separaba dos casillas de otro sitio.
  const cercaDeNodo = new Uint8Array(N);
  for (const n of nodos) {
    const nx = n % W;
    const ny = (n - nx) / W;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++)
        if (nx + dx >= 0 && ny + dy >= 0 && nx + dx < W && ny + dy < H)
          cercaDeNodo[(ny + dy) * W + nx + dx] = 1;
  }
  const separaDosRegiones = (k: number, r: number): boolean => {
    const kx = k % W;
    const ky = (k - kx) / W;
    const hayAcantilado = (ix: number, iy: number, jx: number, jy: number): boolean => {
      for (let y = Math.max(iy, jy) - 1; y <= Math.min(iy, jy) + 1; y++)
        for (let x = Math.max(ix, jx) - 1; x <= Math.min(ix, jx) + 1; x++)
          if (
            x >= 0 &&
            y >= 0 &&
            x < W &&
            y < H &&
            (x !== kx || y !== ky) &&
            tipos[y * W + x] === CORTADO
          )
            return true;
      return false;
    };
    // La propia `k`, abierta y lejos de un nodo (el reflejo puede estarlo).
    if (cercaDeNodo[k] === 0)
      for (let jy = ky - 2; jy <= ky + 2; jy++)
        for (let jx = kx - 2; jx <= kx + 2; jx++) {
          if (jx < 0 || jy < 0 || jx >= W || jy >= H) continue;
          const j = jy * W + jx;
          if (tipos[j] !== ABIERTA || nodos.has(j) || cercaDeNodo[j] === 1 || regionDe[j] === r)
            continue;
          if (!hayAcantilado(kx, ky, jx, jy)) return true;
        }
    if (tipos[k] !== CORTADO) return false;
    const libre = (x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      const j = y * W + x;
      return tipos[j] === ABIERTA && !nodos.has(j) && cercaDeNodo[j] === 0;
    };
    for (let iy = ky - 1; iy <= ky + 1; iy++)
      for (let ix = kx - 1; ix <= kx + 1; ix++) {
        if (!libre(ix, iy)) continue;
        for (let jy = iy - 2; jy <= iy + 2; jy++)
          for (let jx = ix - 2; jx <= ix + 2; jx++) {
            if (!libre(jx, jy) || regionDe[jy * W + jx] === regionDe[iy * W + ix]) continue;
            let otro = false;
            let pasaPorK = false;
            for (let y = Math.max(iy, jy) - 1; y <= Math.min(iy, jy) + 1; y++)
              for (let x = Math.max(ix, jx) - 1; x <= Math.min(ix, jx) + 1; x++) {
                if (x === kx && y === ky) pasaPorK = true;
                else if (x >= 0 && y >= 0 && x < W && y < H && tipos[y * W + x] === CORTADO)
                  otro = true;
              }
            if (pasaPorK && !otro) return true;
          }
      }
    return false;
  };
  // Ni parte en dos lo que no es región (barreras y nodos, 8-conexo): un trozo
  // de frontera que se queda tocando una sola región pasa a contar como
  // obstáculo suyo y le sube la densidad (#132).
  const fueraDeRegion = (j: number): boolean => tipos[j] !== ABIERTA || nodos.has(j);
  const parteLoQueNoEsRegion = (k: number): boolean => {
    const lados: number[] = [];
    for (let v = desde[k]!; v < desde[k + 1]!; v++)
      if (fueraDeRegion(vecinas[v]!)) lados.push(vecinas[v]!);
    if (lados.length <= 1) return false;
    const visto = new Uint8Array(N);
    visto[k] = 1;
    visto[lados[0] as number] = 1;
    const cola = [lados[0] as number];
    let faltan = lados.length - 1;
    const esLado = new Set(lados.slice(1));
    for (let q = 0; q < cola.length && faltan > 0; q++) {
      const j = cola[q] as number;
      for (let v = desde[j]!; v < desde[j + 1]!; v++) {
        const m = vecinas[v]!;
        if (visto[m] === 1 || !fueraDeRegion(m)) continue;
        visto[m] = 1;
        if (esLado.has(m)) faltan--;
        cola.push(m);
      }
    }
    return faltan > 0;
  };
  // Ni deja la muesca de #222 (`puertasSinMuesca`): la puerta de una ciudad
  // entre dos acantilados, con acantilado encima y lo que se pisa debajo.
  const muerdeUnaPuerta = (k: number): boolean => {
    const pisa = (j: number): boolean => j === k || tipos[j] === ABIERTA;
    for (const t of e.ciudades) {
      const x = t % W;
      const y = (t - x) / W;
      if (y + 2 >= H) continue;
      for (const s of [-1, 1]) {
        if (x + s < 0 || x + s >= W) continue;
        const lado = t + W + s;
        if (k !== t + W && k !== lado + W) continue;
        if (pisa(t + W) && tipos[lado] === CORTADO && tipos[t + s] === CORTADO && pisa(lado + W))
          return true;
      }
    }
    return false;
  };
  // El nivel de la región `r` lo da cualquiera de sus casillas pegadas a `k`.
  const esquinaDeRegion = (k: number, r: number): number => {
    for (let v = desde[k]!; v < desde[k + 1]!; v++) {
      const j = vecinas[v]!;
      if (tipos[j] === ABIERTA && !nodos.has(j) && regionDe[j] === r) return j;
    }
    return k;
  };
  // Las franjas de barrera, como las ve la validación (`problemasDeNiveles`):
  // abrir una casilla puede dar a una franja una región más o partirla, y cada
  // trozo tiene que admitir los niveles de lo que toca.
  const terreno: TerrainKind[] = Array.from({ length: N }, (_, i) =>
    e.puentes.has(i) ? 'water' : nodos.has(i) ? 'grass' : (barreraDe(tipos, i) ?? 'grass'),
  );
  const region = Int32Array.from(regionDe, (r, i) => (nodos.has(i) ? -1 : r));
  const admiten = (abrir: readonly (readonly [number, number])[]): boolean => {
    const t = terreno.slice();
    const reg = Int32Array.from(region);
    for (const [c, rc] of abrir) {
      t[c] = 'grass';
      reg[c] = rc;
    }
    return franjasDeBarrera(W, H, t, reg).every(
      (f) =>
        f.regiones.size === 0 ||
        admiteLosNiveles(
          f.barrera,
          [...f.regiones].map((r) => e.niveles[r] as Nivel),
        ),
    );
  };
  let abiertas = 0;
  for (const [p, q] of e.tramos) {
    if (e.puentes.has(p) || e.puentes.has(q)) continue;
    const como = pasoTorcido(W, H, nivel, p, q);
    if (como !== 'silla' && como !== 'diagonal') continue;
    const n = nodos.has(p) ? p : nodos.has(q) ? q : -1;
    if (n === -1) continue;
    const a = n === p ? q : p;
    const r = regionDe[a] as number;
    const ax = a % W;
    const nx = n % W;
    const esquinas = [a - ax + nx, n - nx + ax];
    // La que deja la rampa de frente, primero.
    const deFrente = (k: number): boolean => {
      const antes = nivel[k] as number;
      nivel[k] = nivel[a] as number;
      const torcida = pasoTorcido(W, H, nivel, k, n) !== null;
      nivel[k] = antes;
      return !torcida;
    };
    esquinas.sort((k1, k2) => Number(deFrente(k2)) - Number(deFrente(k1)));
    for (const k of esquinas) {
      const ke = espejoDe(k, N);
      // Y su reflejo, a la pareja de la región, si también se puede: como los
      // obstáculos y el agua de las esquinas (`sinAguaEnLasEsquinas`), el
      // espejo es lo que se pueda, y bajo el reflejo puede haber un obstáculo.
      // En el centro del mapa una esquina y su reflejo pueden tocarse: abiertas
      // a dos regiones, las unirían por un vértice.
      const re = parejaDe(r);
      if (!abrible(k, r)) continue;
      const cerca =
        Math.abs((k % W) - (ke % W)) <= 1 && Math.abs(Math.floor(k / W) - Math.floor(ke / W)) <= 1;
      const conReflejo = ke !== k && !(cerca && re !== r) && abrible(ke, re);
      const abrir: (readonly [number, number])[] = [[k, r]];
      if (conReflejo && admiten([...abrir, [ke, re]])) abrir.push([ke, re]);
      if (!admiten(abrir)) continue;
      for (const [c, rc] of abrir) {
        nivel[c] = nivel[esquinaDeRegion(c, rc)] as number;
        tipos[c] = ABIERTA;
        regionDe[c] = rc;
        terreno[c] = 'grass';
        region[c] = rc;
        abiertas++;
      }
      break;
    }
  }
  return abiertas;
}

export function trazarCaminos(e: EntradaDeCaminos): [number, number][] {
  const tramos: [number, number][] = [];
  for (let r = 0; r < e.regiones; r++) {
    const b = new Busqueda(e, r);
    const centro = centroDeRegion(e, r, b);
    if (centro === -1) continue;
    b.buscar(centro);
    const hastaElCentro = Int32Array.from(b.coste);
    const objetivos = [...(e.objetivos[r] ?? [])].sort(
      (x, y) => (hastaElCentro[x] as number) - (hastaElCentro[y] as number) || x - y,
    );
    const arbol = new ArbolDeCaminos(e.W, e.H, b.hoja, centro);
    for (const o of objetivos) {
      if (arbol.red[o] === 1) continue;
      b.buscar(centro, arbol, o);
      if (b.previo[o] === -1) {
        const p = aPunto(o, e.W);
        throw new Error(
          `el camino de la región ${r} no llega a (${p.x},${p.y}): la red y los obstáculos tenían que dejarlo alcanzable`,
        );
      }
      // El radio, del objetivo hacia atrás hasta tocar la red; se cuelga al
      // revés, desde la red, para que cada casilla entre ya unida al árbol.
      const radio: number[] = [];
      for (let c = o; arbol.red[c] !== 1; c = b.previo[c] as number) radio.push(c);
      for (let k = radio.length - 1; k >= 0; k--) {
        const c = radio[k] as number;
        arbol.colgar(c, b.previo[c] as number);
      }
    }
    tramos.push(...arbol.tramos());
  }
  return tramos;
}

/**
 * El árbol de caminos de una región mientras se traza: cada casilla de la red
 * con su padre, hacia el centro. Los tramos son `[padre, casilla]`.
 *
 * **Las horquillas salen en L y no en Y** (decisión del usuario, punto de
 * control de #153). El trazado bifurca a menudo en diagonal: de una casilla
 * salen un tramo recto y otro oblicuo cuya esquina es la casilla del recto.
 * Pintado tal cual, los dos trazos salen del mismo punto, se solapan con el
 * ancho de la senda y donde confluyen tres ramales se lee un cruce en X o una
 * estrella. El pintor de antes de #153 lo dibujaba en codo de 90° porque su
 * regla de adyacencia quitaba la diagonal con esquina de camino, y así se
 * quiere seguir viendo. Se resuelve donde nace, al colgar cada casilla, y sin
 * cambiar las casillas: solo cuál es su padre.
 *
 * - Una casilla que se cuelga en diagonal y tiene una esquina ya en la red se
 *   cuelga de la esquina. No hace falta buscar de qué lado queda: la casilla
 *   entra como hoja, así que todo lo que ya es red está del lado de su padre.
 * - Una casilla que entra en la esquina de una diagonal vieja la parte en dos
 *   rectos. Ahí sí hay que saber de qué lado de la diagonal ha quedado, y lo
 *   dice subir por los padres: si se llega al hijo de la diagonal, está debajo
 *   de él y se le da la vuelta al trozo de rama que los une.
 *
 * Una hoja —un nodo o un objeto con puerta (#188)— nunca hace de esquina:
 * colgar de ella le haría llegar dos tramos de la región, y una hoja se llega,
 * no se cruza. Por eso la búsqueda cobra de más el paso en diagonal junto a una
 * hoja de la red (`Busqueda`).
 * Aun así queda la Y **obligada**, cuando la otra esquina es barrera y el radio
 * no tiene por dónde más pasar: 4 de 223 mapas del test denso (60, 64, 177 y
 * 986). Prohibir ese paso deja el objetivo sin camino (semilla 60), y quitarla
 * de otro modo movería casillas. Una esquina de otra región tampoco se usa (no
 * está en `red`): unirla sería el segundo cruce de la pareja que la red no
 * eligió.
 */
export class ArbolDeCaminos {
  /** Las casillas de la red: el centro y las ya colgadas. */
  readonly red: Uint8Array;
  /** Las 8-vecinas de la red: arrimarse a ella cuesta un paso recto más. */
  readonly pegada: Uint8Array;
  private readonly padre: Int32Array;
  /** Las casillas colgadas, en el orden en que entraron. */
  private readonly colgadas: number[] = [];

  constructor(
    private readonly W: number,
    H: number,
    /** Los nodos de la región y los objetos con puerta: nunca hacen de esquina. */
    private readonly hoja: Uint8Array,
    centro: number,
  ) {
    this.red = new Uint8Array(W * H);
    this.pegada = new Uint8Array(W * H);
    this.padre = new Int32Array(W * H).fill(-1);
    this.marcar(centro);
  }

  /** Cuelga `c`, que no es red, de `p`, que sí lo es. */
  colgar(c: number, p: number): void {
    const { red, padre, W } = this;
    const hoja = this.hoja;
    if (red[c] === 1 || red[p] !== 1) {
      const [a, b] = [aPunto(c, W), aPunto(p, W)];
      throw new Error(
        `no se cuelga (${a.x},${a.y}) de (${b.x},${b.y}): se cuelga de la red una casilla que no es de ella`,
      );
    }
    const esquina = this.esquinas(p, c).find((k) => red[k] === 1 && hoja[k] !== 1);
    padre[c] = esquina ?? p;
    this.marcar(c);
    this.colgadas.push(c);
    if (hoja[c] === 1) return;
    // `c` como esquina de una diagonal vieja: sus dos vecinas rectas de cada
    // cuadrante, unidas entre sí por un tramo.
    const x = c % W;
    for (const [dx, dy] of CUADRANTES) {
      if (x + dx < 0 || x + dx >= W) continue;
      const u = c + dx;
      const v = c + dy * W;
      if (v < 0 || v >= red.length || red[u] !== 1 || red[v] !== 1) continue;
      if (padre[u] === v) this.partir(v, u, c);
      else if (padre[v] === u) this.partir(u, v, c);
    }
  }

  /**
   * ¿Colgar `j` de `a` en diagonal le daría a `a` sus cuatro diagonales? Solo
   * si `j` entraría de verdad en diagonal: con una esquina en la red (que no
   * sea hoja) se cuelga de ella (`colgar`) y no hay aspa. Una diagonal solo
   * nace al colgar una casilla sin esquina en la red —`partir` las cambia por
   * rectos, nunca al revés—, así que mirarlo al colgar basta.
   */
  cerrariaUnAspa(a: number, j: number): boolean {
    const { W, red, padre, hoja } = this;
    if (red[a] !== 1 || red[j] === 1) return false;
    const esquinas = this.esquinas(a, j);
    if (esquinas.length === 0 || esquinas.some((k) => red[k] === 1 && hoja[k] !== 1)) return false;
    const x = a % W;
    for (const [dx, dy] of CUADRANTES) {
      const k = a + dx + dy * W;
      if (k === j) continue;
      if (x + dx < 0 || x + dx >= W || k < 0 || k >= red.length) return false;
      if (padre[k] !== a && padre[a] !== k) return false;
    }
    return true;
  }

  /** Los tramos del árbol, `[padre, casilla]`, en el orden en que entraron. */
  tramos(): [number, number][] {
    return this.colgadas.map((c) => [this.padre[c] as number, c]);
  }

  /**
   * Cambia la diagonal `padre`→`hijo` por dos rectos a través de `esquina`, que
   * ya es red. Si la esquina no cuelga del hijo, el hijo se cuelga de ella; si
   * cuelga, se le da la vuelta a la rama de la esquina al hijo y la esquina se
   * cuelga del padre.
   */
  private partir(padreDeLaDiagonal: number, hijo: number, esquina: number): void {
    const { padre } = this;
    const rama = [esquina];
    for (let k = padre[esquina] as number; k !== -1 && k !== hijo; k = padre[k] as number) {
      rama.push(k);
    }
    const debajo = padre[rama[rama.length - 1] as number] === hijo;
    if (!debajo) {
      padre[hijo] = esquina;
      return;
    }
    rama.push(hijo);
    for (let k = rama.length - 1; k > 0; k--) padre[rama[k] as number] = rama[k - 1] as number;
    padre[esquina] = padreDeLaDiagonal;
  }

  /** Las dos esquinas del paso de `p` a `c`, o ninguna si es recto. */
  private esquinas(p: number, c: number): number[] {
    const W = this.W;
    const px = p % W;
    const cx = c % W;
    if (px === cx || p - px === c - cx) return [];
    return [p - px + cx, c - cx + px];
  }

  private marcar(c: number): void {
    this.red[c] = 1;
    const { desde, vecinas } = vecindad(this.W, this.red.length / this.W);
    for (let k = desde[c]!; k < desde[c + 1]!; k++) this.pegada[vecinas[k]!] = 1;
  }
}

/** Las vecinas rectas de cada cuadrante de una casilla: horizontal y vertical. */
const CUADRANTES = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;
