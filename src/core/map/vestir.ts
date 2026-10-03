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
 *   de sus vecinas). Por pareja se sortea un lado que engorda siempre una
 *   casilla; el otro engorda donde lo diga un ruido grueso en bloques de 4×4,
 *   reflejado. Así dos casillas pisables de regiones distintas quedan a tres
 *   pasos como poco —una de muro fino y una de cada lado, o dos de uno—, y el
 *   borde no sale recto.
 * - **Los pasillos**: el nodo es un estrechamiento de una casilla, y desde él
 *   hasta la primera casilla que no se engorda de cada región que toca se
 *   protege un camino. Es la excepción al grosor, y es la que el usuario aprobó.
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
  // Por clave de pareja: su barrera (índice en `BARRERAS`) y el lado que engorda siempre.
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

  // 3. El ruido del lado flaco: bloques de 4×4, y la mitad de abajo, reflejo de
  //    la de arriba.
  const BLOQUE = 4;
  const bw = Math.ceil(W / BLOQUE);
  const bh = Math.ceil(H / BLOQUE);
  const bloques = Array.from({ length: bw * bh }, () => (rng.chance(0.5) ? 1 : 0));
  const ruido = (i: number): number => {
    const { x, y } = aPunto(Math.min(i, espejoDe(i, N)), W);
    return bloques[Math.floor(y / BLOQUE) * bw + Math.floor(x / BLOQUE)] as number;
  };

  // 4. Qué casilla pegada al muro se engorda, y con qué.
  const engorda = new Int8Array(N).fill(ABIERTA);
  // La barrera que tocaría a cada casilla pegada al muro, la engorde el ruido o
  // no: la usa el paso 5 cuando tiene que engordar a la fuerza.
  const pegada = new Int8Array(N).fill(ABIERTA);
  for (let i = 0; i < N; i++) {
    if (muro[i] === 1) continue;
    const propia = etiqueta[i] as number;
    let tipo = ABIERTA;
    let siempre = false;
    for (let v = desde[i]!; v < desde[i + 1]! && !siempre; v++) {
      const j = vecinas[v]!;
      if (muro[j] === 0) continue;
      if (tipo === ABIERTA) tipo = tipos[j] as number;
      for (const otra of asomadas[j] ?? []) {
        if (otra === propia) continue;
        const k = clave(propia, otra);
        if (ladoGordo[k] === propia) {
          tipo = tipoDePareja[k] as number;
          siempre = true;
          break;
        }
      }
    }
    if (tipo === ABIERTA) continue;
    pegada[i] = tipo;
    if (siempre || ruido(i) === 1) engorda[i] = tipo;
  }

  // 5. Los pasillos: de cada nodo, a cada región que toca, hasta la primera
  //    casilla que no se engorda. Primero las vecinas rectas, que dan una
  //    entrada derecha y no en esquina.
  const pasillo = new Uint8Array(N);
  for (const n of e.nodos) {
    const rectasPrimero: number[] = [];
    const oblicuas: number[] = [];
    for (let k = desde[n]!; k < desde[n + 1]!; k++) {
      const v = vecinas[k]!;
      if (muro[v] === 1) continue;
      const recta = v % W === n % W || Math.floor(v / W) === Math.floor(n / W);
      (recta ? rectasPrimero : oblicuas).push(v);
    }
    const hechas = new Set<number>();
    for (const v of [...rectasPrimero, ...oblicuas]) {
      const r = etiqueta[v] as number;
      if (hechas.has(r)) continue;
      hechas.add(r);
      const camino = caminoHastaLibre(W, H, v, r, etiqueta, muro, engorda);
      if (camino === null) {
        const p = aPunto(n, W);
        return `el nodo de (${p.x},${p.y}) se queda sin entrada a la región ${r} al engordar`;
      }
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

/** El camino más corto, dentro de la celda `r`, de `desde` a la primera casilla que no se engorda. */
function caminoHastaLibre(
  W: number,
  H: number,
  desde: number,
  r: number,
  etiqueta: Int32Array,
  muro: Uint8Array,
  engorda: Int8Array,
): number[] | null {
  const { desde: ini, vecinas } = vecindad(W, H);
  const previo = new Map<number, number>([[desde, desde]]);
  const cola = [desde];
  for (let q = 0; q < cola.length; q++) {
    const a = cola[q] as number;
    if (engorda[a] === ABIERTA) {
      const camino = [a];
      for (let c = a; c !== desde; c = previo.get(c) as number) camino.push(previo.get(c)!);
      return camino;
    }
    for (let k = ini[a]!; k < ini[a + 1]!; k++) {
      const j = vecinas[k]!;
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
  /** Los nodos de cada región, por índice plano de su casilla. */
  readonly nodosDeRegion: readonly (readonly number[])[];
  /** Lo que cada región une con sus nodos: minas y pueblos, por índice plano. */
  readonly destinos: readonly (readonly number[])[];
  readonly monstruos: Uint8Array;
}

/**
 * La red de caminos de cada región: **un árbol que une sus nodos y una senda a
 * cada mina y pueblo, con los tramos fundidos** (decisión del usuario en la
 * vuelta 1 de QA: «árbol mínimo + minas»).
 *
 * La primera versión unía cada nodo con todos los demás y con cada mina por el
 * camino más corto, y después un árbol de caminos más cortos desde el primer
 * nodo; las dos daban una malla: **el 41 % del suelo pisable era camino**, con
 * rombos y vías dobles, y cuando media región es camino el camino deja de
 * señalar adónde ir.
 *
 * Se hace creciendo la red desde el primer nodo: cada paso busca desde **toda la
 * red ya trazada a la vez** el nodo que queda más cerca, y traza ese tramo. Es
 * el árbol mínimo entre los nodos (Prim), pero midiendo desde la red y no desde
 * los nodos, así que un tramo nuevo sale del punto del camino que le pilla más
 * cerca y no corre paralelo a otro: los tramos se funden solos. Con los nodos
 * unidos, cada mina y pueblo se engancha igual, por la senda más corta hasta la
 * red. El coste es el del héroe (`costeDeEntrada` del suelo de la región, con la
 * diagonal más cara), así que un camino va por donde se anda.
 *
 * 8-vecindad, por lo pisable de la región; un nodo que no está en la red es
 * final de tramo, no se atraviesa —llevaría a otra región—.
 *
 * **Rodea a los monstruos si puede, y si no, pasa por encima**: pisar uno cuesta
 * más que cualquier rodeo posible, así que la misma búsqueda da las dos cosas.
 * Un guardia que corta la región en dos deja cada mitad alcanzable desde su
 * nodo —es lo que piden los obstáculos—, pero el tramo que une esos dos nodos
 * tiene que pasar por él. Un guardia sobre el camino es lo que hace un mapa de
 * HoMM; un camino que no llega es un dibujo roto. Lo encontró la semilla 47 en
 * 40×40, que lanzaba aquí.
 *
 * Es un Dijkstra sobre la rejilla provisional del generador, no el del mapa: el
 * invariante que guarda que nadie llame a `findPath` fuera de `game.ts` es por
 * lo hostil de una partida, que aquí no existe todavía. Comparte con aquel la
 * `Frontera`, y con ella el desempate por orden de descubrimiento.
 *
 * Lanza si un destino no se alcanza ni pasando por monstruos: la red ya está
 * validada y los obstáculos no parten la región, así que sería un fallo de
 * programa, no un mapa raro.
 */
export function trazarCaminos(e: EntradaDeCaminos): number[] {
  const { W, H, tipos, regionDe, monstruos } = e;
  const N = W * H;
  const { desde, vecinas } = vecindad(W, H);
  const caminos = new Set<number>();
  const coste = new Int32Array(N);
  const previo = new Int32Array(N);
  for (let r = 0; r < e.regiones; r++) {
    const nodos = e.nodosDeRegion[r] ?? [];
    const primero = nodos[0];
    if (primero === undefined) continue;
    const suelo = e.suelos[r] as Suelo;
    const recto = costeDeEntrada(suelo, false, false);
    const diagonal = costeDeEntrada(suelo, false, true);
    // Más que cualquier rodeo dentro del mapa.
    const pisarMonstruo = N * diagonal;
    const esNodoDeAqui = new Set(nodos);
    const red = new Set<number>([primero]);
    const pisable = (j: number): boolean =>
      (regionDe[j] === r && tipos[j] === ABIERTA) || esNodoDeAqui.has(j);

    /** Desde toda la red a la vez, el más barato de `pendientes`, y su tramo. */
    const engancharElMasCercano = (pendientes: Set<number>): void => {
      coste.fill(-1);
      previo.fill(-1);
      const frontera = new Frontera(N);
      for (const c of [...red].sort((a, b) => a - b)) {
        coste[c] = 0;
        frontera.push(c, 0);
      }
      for (let nodo = frontera.pop(); nodo !== undefined; nodo = frontera.pop()) {
        const { key: a, cost: hastaAqui } = nodo;
        if (hastaAqui > (coste[a] as number)) continue;
        if (pendientes.has(a)) {
          for (let c = a; !red.has(c); c = previo[c] as number) red.add(c);
          pendientes.delete(a);
          return;
        }
        // Un nodo fuera de la red es final de tramo: se llega, no se cruza.
        if (esNodoDeAqui.has(a) && !red.has(a)) continue;
        const { x, y } = aPunto(a, W);
        for (let k = desde[a]!; k < desde[a + 1]!; k++) {
          const j = vecinas[k]!;
          if (!pisable(j)) continue;
          const enDiagonal = j % W !== x && Math.floor(j / W) !== y;
          const c =
            hastaAqui + (monstruos[j] === 1 ? pisarMonstruo : enDiagonal ? diagonal : recto);
          if (coste[j] !== -1 && (coste[j] as number) <= c) continue;
          coste[j] = c;
          previo[j] = a;
          frontera.push(j, c);
        }
      }
      const p = aPunto([...pendientes][0] as number, W);
      throw new Error(
        `el camino de la región ${r} no llega a (${p.x},${p.y}): la red y los obstáculos tenían que dejarlo alcanzable`,
      );
    };

    // Primero el árbol entre los nodos; después, las sendas a minas y pueblos.
    for (const grupo of [nodos.slice(1), e.destinos[r] ?? []]) {
      const pendientes = new Set(grupo.filter((d) => !red.has(d)));
      while (pendientes.size > 0) engancharElMasCercano(pendientes);
    }
    for (const c of red) caminos.add(c);
  }
  return [...caminos].sort((a, b) => a - b);
}
