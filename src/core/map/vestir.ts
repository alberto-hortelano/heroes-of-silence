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
import type { Rng } from '../rng.js';
import { Frontera } from './frontera.js';
import { aPunto, rellenar, vecindad } from './regiones.js';
import { BARRERAS, type Barrera, costeDeEntrada, type Suelo } from './terrain.js';

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

const indiceDe = (b: Barrera): number => BARRERAS.indexOf(b);

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
  /** Las semillas de las regiones, por índice de región (= etiqueta). */
  readonly semillas: readonly { readonly x: number; readonly y: number }[];
  /** El suelo de cada región, por índice de región. */
  readonly suelos: readonly Suelo[];
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
 *   los suelos de los dos lados. La pareja espejo lleva el mismo. Y **cada mapa
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
  const candidatasDe = (k: number): BarreraConPeso[] =>
    candidatasDeFrontera(suelos[Math.floor(k / regiones)]!, suelos[k % regiones]!);
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

  // 6. Los bolsillos: cada región se queda con un trozo; los demás se rellenan
  //    si no llevan pasillo, y si lo llevan el vestido no vale.
  const semillas = [...e.semillas];
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
      region: etiqueta[i] as number,
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

  // 7. Las barreras garantizadas, contadas en la frontera ya gruesa y sin las
  //    casillas de nodo, que se abren: es lo que verá quien juegue.
  const porTipo = new Int32Array(BARRERAS.length);
  for (let i = 0; i < N; i++) if (tipos[i] !== ABIERTA && esNodo[i] === 0) porTipo[tipos[i]!]! += 1;
  for (const b of new Set(distintas.values())) {
    const n = porTipo[indiceDe(b)] as number;
    if (n < casillasMinimasPorTipo) {
      return `la frontera de ${b} se queda en ${n} casillas, y cada barrera garantizada lleva ${casillasMinimasPorTipo}`;
    }
  }
  return { tipos, pasillo, semillas };
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
  const { W, H, tipos, regionDe, rng, vetadas, monstruos } = e;
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
    for (const n of e.nodosDeRegion[r] ?? []) expandir(n);
    // Un monstruo se alcanza pero no se cruza.
    for (let q = 0; q < cola.length; q++) if (monstruos[cola[q]!] === 0) expandir(cola[q]!);
    for (const c of celdas) enMancha[c] = 0;
    return cola.length === total[r]! - puestos[r]! - celdas.length;
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
      const tipo = indiceDe(sortear(rng, BARRERAS_DEL_MAPA.obstaculos[e.suelos[atras]!]));
      poner(atras, celdas, tipo);
      if (llega(otra, pct)) continue;
      const reflejo = celdas.map((c) => espejoDe(c, N));
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
  readonly monstruos: Uint8Array;
  /** Lo ya puesto —nodos, inicios, objetos, asaltantes—: el centro no cae encima. */
  readonly ocupadas: ReadonlySet<number>;
}

/**
 * El Dijkstra de una región con el coste del héroe: lo de `red` a mitad de
 * precio y un paso recto de más por arrimarse a ella viniendo de fuera.
 * Reutiliza `coste` y `previo` de una búsqueda a otra.
 */
class Busqueda {
  readonly coste: Int32Array;
  readonly previo: Int32Array;
  /** Las casillas de la región, en orden de índice. */
  readonly casillas: readonly number[];
  /** Los nodos de la región: se llega a ellos, no se cruzan. */
  readonly nodo: Uint8Array;
  private readonly recto: number;
  private readonly diagonal: number;
  private readonly pisarMonstruo: number;

  constructor(
    private readonly e: EntradaDeCaminos,
    private readonly r: number,
  ) {
    const N = e.W * e.H;
    this.coste = new Int32Array(N);
    this.previo = new Int32Array(N);
    this.nodo = new Uint8Array(N);
    for (const n of e.nodosDeRegion[r] ?? []) this.nodo[n] = 1;
    const casillas: number[] = [];
    for (let i = 0; i < N; i++) {
      if (e.regionDe[i] === r && e.tipos[i] === ABIERTA) casillas.push(i);
    }
    this.casillas = casillas;
    const suelo = e.suelos[r] as Suelo;
    this.recto = costeDeEntrada(suelo, false, false);
    this.diagonal = costeDeEntrada(suelo, false, true);
    // Más que cualquier rodeo dentro del mapa.
    this.pisarMonstruo = N * this.diagonal;
  }

  /**
   * Desde `origen`. Con `red` (y su `pegada`: las casillas 8-vecinas de la red),
   * lo trazado cuesta la mitad y arrimarse, un paso recto más. Con `hasta`, se
   * para al sacarlo: lo que se lee después es su `previo`, que ya no cambia.
   */
  buscar(origen: number, red?: Uint8Array, pegada?: Uint8Array, hasta?: number): void {
    const { W, H, regionDe, tipos, monstruos } = this.e;
    const { desde, vecinas } = vecindad(W, H);
    const { coste, previo, nodo } = this;
    const r = this.r;
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
      // región). Una mina o un pueblo sí se cruzan: hacerlos final de tramo
      // obliga a rodearlos con un radio paralelo (historia.md, «Caminos»).
      if (nodo[a] === 1 && a !== origen) continue;
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
        else if (!enLaRed && pegada?.[j] === 1) paso += this.recto;
        // Pasar en diagonal junto a un nodo de la red sale en Y, y no se puede
        // colgar en L de un nodo, que es una hoja (`ArbolDeCaminos`). Se cobra y
        // no se prohíbe: a veces es el único paso (semilla 60), y sin él el
        // objetivo se queda sin camino. Cobra **dos** pasos rectos, más que la L
        // por la otra esquina: esa L son dos rectos y su segundo se arrima a la
        // red —toca el nodo—, así que paga uno más (tres rectos). Con uno solo,
        // diagonal y recto (~2,4) salía más barato que la L (3) y la Y se
        // quedaba (34×34, semillas 4310 y 4525, #179).
        if (enDiagonal && red !== undefined) {
          const jx = j % W;
          const k1 = y * W + jx;
          const k2 = j - jx + x;
          if ((nodo[k1] === 1 && red[k1] === 1) || (nodo[k2] === 1 && red[k2] === 1)) {
            paso += 2 * this.recto;
          }
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
 * camino es una hoja de la red de su región. El coste es el del héroe, así que
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
    const arbol = new ArbolDeCaminos(e.W, e.H, b.nodo, centro);
    for (const o of objetivos) {
      if (arbol.red[o] === 1) continue;
      b.buscar(centro, arbol.red, arbol.pegada, o);
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
 * Un nodo nunca hace de esquina: colgar de él le haría llegar dos tramos de la
 * región, y un nodo es una hoja (se llega, no se cruza). Por eso la búsqueda
 * cobra de más el paso en diagonal junto a un nodo de la red (`Busqueda`).
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
    /** Los nodos de la región: nunca hacen de esquina. */
    private readonly nodo: Uint8Array,
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
    const nodo = this.nodo;
    if (red[c] === 1 || red[p] !== 1) {
      const [a, b] = [aPunto(c, W), aPunto(p, W)];
      throw new Error(
        `no se cuelga (${a.x},${a.y}) de (${b.x},${b.y}): se cuelga de la red una casilla que no es de ella`,
      );
    }
    const esquina = this.esquinas(p, c).find((k) => red[k] === 1 && nodo[k] !== 1);
    padre[c] = esquina ?? p;
    this.marcar(c);
    this.colgadas.push(c);
    if (nodo[c] === 1) return;
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
