/**
 * La frontera gruesa (`engordarFronteras`): del muro fino de una casilla de la
 * red a 2-3 casillas, con la barrera de cada pareja de regiones y al menos
 * `TIPOS_POR_MAPA` distintas por mapa, los pasillos de entrada de cada nodo, sin
 * bolsillos, con la muralla que cierra un paso (#232) y lo que piden los
 * niveles en los cruces, por vueltas con las líneas (`lineas.ts`) y el relieve
 * (`relieve.ts`). También la barrera que cruza cada nodo (`queCruzaElNodo`) y
 * su eje (`ejeDelNodo`, `conEjePleno`), que mira el generador al elegir el paso
 * de cada pareja.
 *
 * Es lo que quedó de `map/vestir.ts` al repartirlo por la carpeta
 * `map/vestir/` (fase N de la reorganización, 07-11-2026); qué es vestir una
 * red y lo que comparten sus partes, en `base.ts`.
 */
import type { Rng } from '../../rng.js';
import { aPunto, EJES, espejoDe, parejaDe } from '../geometria.js';
import {
  APOYOS_DE_MURALLA,
  juntoACiudad,
  LARGO_MAXIMO_DE_MURALLA,
  lineaDeLaPuerta,
  muroDeLaLinea,
  type RejillaDeMuralla,
} from '../murallas.js';
import { espigasDelRelieve } from '../niveles.js';
import { rellenar, vecindad } from '../regiones.js';
import { alOtroLado } from '../rio.js';
import {
  admiteLosNiveles,
  BARRERAS,
  BARRERAS_DE_DESNIVEL,
  type Barrera,
  type Nivel,
  type Suelo,
} from '../terrain.js';
import {
  ABIERTA,
  BARRERAS_DEL_MAPA,
  type BarreraConPeso,
  barajar,
  conElRio,
  indiceDe,
  ponerTipo,
  separadasDeCerca,
  sortear,
  type Tipos,
  TRECHO_DEL_LADO,
} from './base.js';
import {
  acantiladoSinCaida,
  adelgazarAcantilados,
  puertasSinMuesca,
  quebrarCaidas,
  sinAcantiladoLlano,
} from './lineas.js';
import { nivelesDeLoEngordado, quitarEspigas } from './relieve.js';

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

/**
 * `cuantos` barreras distintas, cada una a una frontera distinta que la admita:
 * un emparejamiento máximo (Kuhn) entre barreras y fronteras, en orden barajado
 * para que no salgan siempre las mismas. Devuelve, por índice de frontera, la
 * barrera que le toca; o `null` si los suelos del mapa no dan para tantas, que
 * es lo único que de verdad no tiene arreglo sorteando otra vez. Con `rng`
 * `null`, en orden y sin tiradas: la pregunta de si hay reparto.
 */
function repartirDistintas(
  rng: Rng | null,
  admite: readonly (readonly Barrera[])[],
  cuantos: number,
): Map<number, Barrera> | null {
  // Sin `rng`, en orden: solo para saber si hay reparto (el tamaño del
  // emparejamiento máximo no depende del orden), sin gastar tiradas.
  const fronteras = admite.map((_, k) => k);
  const enOrden = <T>(lista: readonly T[]): T[] =>
    rng === null ? [...lista] : barajar(rng, lista);
  const barajadas = enOrden(fronteras);
  const deFrontera = new Map<number, Barrera>();
  const intentar = (b: Barrera, vistas: Set<number>): boolean => {
    for (const f of barajadas) {
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
  for (const b of enOrden(BARRERAS)) {
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
   * Las casillas de los nodos que son ciudad (las bases y las neutrales): no
   * son puertas de muralla (`murallasSobrantes`) y van al nivel bajo.
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
  /**
   * El río (`trazarRio`, 1 en sus casillas), que ya es muro de la red: agua
   * fija, que ni engorda ni se toca (`ponerTipo`). Sin él, no hay río.
   */
  readonly rio?: Uint8Array;
  /**
   * El lado del río de cada vecina de cada casilla suya (`ladosDelRio`): dos
   * casillas a lados distintos las separa el río, que es la excepción a los
   * tres pasos.
   */
  readonly lados?: Int8Array;
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

/** Cuántos tipos de barrera distintos lleva, como poco, la frontera de un mapa (criterio del usuario). */
export const TIPOS_POR_MAPA = 4;

/** Cuántas veces se quitan espigas y se vuelven a mirar bolsillos y murallas. */
const VUELTAS_SIN_ESPIGAS = 8;

/** Cuántas veces se buscan caídas largas en un engorde: lo que la primera no parte, lo prueba otra. */
const VUELTAS_DE_QUIEBROS = 2;

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
  const rio = e.rio ?? new Uint8Array(N);
  const hayRio = rio.includes(1);
  const { lados } = e;
  /** Si entre dos casillas que no son río pasa el río (`alOtroLado`). */
  const otraOrilla = (i: number, q: number): boolean =>
    lados !== undefined && alOtroLado(W, H, rio, lados, i, q);

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
    // El río no es frontera de ninguna pareja: es agua, y lo que cruza lo
    // cruza por un puente.
    if (muro[i] === 0 || rio[i] === 1) continue;
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
    if (muro[i] === 0 || esNodo[i] === 1 || rio[i] === 1) continue;
    const k = parejaDeMuro[i] as number;
    finoQueQueda.set(k, (finoQueQueda.get(k) ?? 0) + 1);
  }
  const fino = (k: number): number =>
    (finoQueQueda.get(k) ?? 0) +
    (claveEspejo(k) === k ? 0 : (finoQueQueda.get(claveEspejo(k)) ?? 0));
  // Con río, el agua es suya y cuenta como una de las `TIPOS_POR_MAPA`: las
  // demás salen de las otras parejas, sin agua.
  const delRio = hayRio ? 1 : 0;
  const deFuera = Math.min(TIPOS_POR_MAPA - delRio, canonicas.length);
  const hacenFalta = deFuera + delRio;
  const AGUA = indiceDe('water');
  /**
   * Las barreras que puede llevar la pareja `k`. Con río, fuera de él no hay
   * agua de frontera (decisión del usuario tras el QA, H3: del mismo azul que
   * el río, 1 675 casillas en 1-100 se leían como lagos dispersos). La pareja
   * cuyos suelos solo dan agua lleva otra barrera aunque no la pidan: entre
   * dos niveles, el acantilado (el borde de lo alto); a un mismo nivel, la
   * montaña. Las dos las admiten sus niveles (`admiteLosNiveles`).
   */
  const susBarreras = (k: number): BarreraConPeso[] => {
    const todas = candidatasDe(k);
    if (!hayRio) return todas;
    const sinAgua = todas.filter((c) => c.barrera !== 'water');
    if (sinAgua.length > 0) return sinAgua;
    const a = Math.floor(k / regiones);
    const b = k % regiones;
    return [{ barrera: e.niveles[a] === e.niveles[b] ? 'mountain' : 'cliff', peso: 1 }];
  };
  const admitidas = canonicas.map((k) =>
    fino(k) * 2 < casillasMinimasPorTipo
      ? []
      : susBarreras(k)
          .map((c) => c.barrera)
          .filter((b) => !hayRio || b !== 'water'),
  );
  const distintas = repartirDistintas(rng, admitidas, deFuera);
  if (distintas === null) {
    return `las fronteras de este mapa (suelos ${[...new Set(suelos)].join(', ')}) no admiten ${deFuera} barreras distintas${hayRio ? ' sin agua, además del río,' : ''} con ${casillasMinimasPorTipo} casillas cada una`;
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
      const tipo = indiceDe(sortear(rng, susBarreras(k)));
      tipoDePareja[k] = tipo;
      if (tipoDePareja[claveEspejo(k)] === ABIERTA) tipoDePareja[claveEspejo(k)] = tipo;
    }
    const lado = rng.chance(0.5) ? Math.floor(k / regiones) : k % regiones;
    ladoGordo[k] = lado;
    if (ladoGordo[claveEspejo(k)] === -1) ladoGordo[claveEspejo(k)] = parejaDe(lado);
  }
  // La barrera de cada casilla de muro fino: la de su pareja; el río, agua.
  conElRio(tipos, rio, W);
  for (let i = 0; i < N; i++) {
    if (muro[i] !== 1 || rio[i] === 1) continue;
    ponerTipo(tipos, i, tipoDePareja[parejaDeMuro[i] as number] as number);
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
      // El río no engorda: lo que solo toca el río se queda como está.
      if (muro[j] === 0 || rio[j] === 1) continue;
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
        // Las dos orillas del río quedan a dos pasos: el río es su línea
        // (`separadasDeCerca`), la excepción a los tres pasos.
        if (otraOrilla(i, q)) continue;
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
        if (otraOrilla(i, q)) continue;
        if (pasillo[q] === 1) {
          return `los pasillos de dos regiones corren a dos casillas en (${x},${y}), lejos de cualquier nodo`;
        }
        engorda[q] = pegada[q] !== ABIERTA ? (pegada[q] as number) : (pegada[i] as number);
      }
    }
  }
  for (let i = 0; i < N; i++) {
    if (pasillo[i] === 0 && engorda[i] !== ABIERTA) ponerTipo(tipos, i, engorda[i] as number);
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
        for (const c of t.casillas) ponerTipo(tipos, c, relleno);
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

  // 7. La muralla, el cierre de un paso (#232): cada franja de muro se queda
  //    en la línea que va de su puerta a dos apoyos y lo demás pasa a otra
  //    barrera (`murallasSobrantes`). La barrera que cruza cada nodo depende de
  //    lo que tiene alrededor, y con ella las puertas, así que se repite hasta
  //    que no sobra nada. Solo quita muro: acaba.
  let barreraDeNodo = barrerasDeLosNodos(e, tipos, esNodo, clave, tipoDePareja, candidatasDe);
  const esCiudad = new Set(e.ciudades);
  const alBajo = new Set([...e.ciudades, ...e.conCamino]);
  // Con todas las regiones a un nivel no hay desnivel ni espigas: el 11 % de
  // los mapas de 1-200 con los pesos de #210.
  const llano = e.niveles.every((n) => n === e.niveles[0]);
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
      const sobrantes = murallasSobrantes(e, tipos, esNodo, barreraDeNodo);
      if (sobrantes.length === 0) {
        // 7a. El acantilado, una línea de una casilla (#215): lo que sobra pasa
        //     a la meseta. Abrir casillas cambia lo que rodea a los nodos, y
        //     con ello su barrera y quizá una muralla: se vuelve a mirar. Ya
        //     delgado, la puerta de una ciudad no muerde la línea (#222).
        if (
          !adelgazarAcantilados(W, H, tipos, region, esNodo, e.niveles, nivelAhora) &&
          !puertasSinMuesca(
            W,
            H,
            tipos,
            region,
            esNodo,
            pasillo,
            e.niveles,
            e.ciudades,
            nivelAhora(),
          )
        )
          break;
        // La meseta que crece puede llegar a un bosque o un muro de la pareja
        // de al lado, que va entre dos regiones más bajas: la regla de los
        // cruces (6b) le da la barrera de desnivel donde toca a la meseta.
        desnivelEnLosCruces(W, H, tipos, region, esNodo, e.niveles);
        barreraDeNodo = barrerasDeLosNodos(e, tipos, esNodo, clave, tipoDePareja, candidatasDe);
        continue;
      }
      for (const { franja, sobra, apoya } of sobrantes) {
        // Sus regiones: las de su celda y las que toca. Con solo las que toca,
        // una franja metida entre otras barreras se quedaba sin ninguna.
        const lados = new Set<number>();
        for (const c of franja) {
          if (esNodo[c] === 0) lados.add(region[c] as number);
          for (let v = desde[c]!; v < desde[c + 1]!; v++) {
            const j = vecinas[v]!;
            if (tipos[j] === ABIERTA && esNodo[j] === 0) lados.add(region[j] as number);
          }
        }
        // De lo que admiten sus suelos, primero lo que el mapa aún no tiene con
        // sus `casillasMinimasPorTipo`: si el muro era de las barreras
        // repartidas, la que lo sustituye mantiene la variedad que pide el paso
        // 8 en vez de engordar una que ya la daba. Sin tirada (`laMasPesada`):
        // corregir no mueve el azar de lo que viene después. La franja espejo
        // toca los suelos de la pareja, que son los mismos: sale la misma.
        const sinMuro = candidatasSinMuro(
          [...lados].map((r) => suelos[r] as Suelo),
          [...lados].map((r) => e.niveles[r] as Nivel),
        );
        // Lo que sobra de una muralla que se queda es su apoyo: montaña,
        // acantilado o agua, nunca bosque (`APOYOS_DE_MURALLA`). Con río, ni
        // agua: fuera de él no hay agua de frontera (QA, H3), y junto a él
        // sería un brazo suyo.
        const sinMuroNiAgua = hayRio ? sinMuro.filter((c) => c.barrera !== 'water') : sinMuro;
        const posibles = sinMuroNiAgua.length > 0 ? sinMuroNiAgua : sinMuro;
        const deApoyo = posibles.filter((c) => APOYOS_DE_MURALLA.includes(c.barrera));
        const admitidas = apoya && deApoyo.length > 0 ? deApoyo : posibles;
        const cuantas = new Int32Array(BARRERAS.length);
        for (let i = 0; i < N; i++)
          if (tipos[i] !== ABIERTA && esNodo[i] === 0) cuantas[tipos[i]!]! += 1;
        const nuevas = admitidas.filter(
          (c) => cuantas[indiceDe(c.barrera)]! < BARRERAS_DEL_MAPA.casillasMinimasPorTipo,
        );
        // Y antes que todo eso, la que ya tiene al lado: lo que sobra sigue la
        // barrera con la que se toca y la frontera no queda a parches (un
        // peñasco suelto en el río de s42644 (12,4), junto a la ciudad).
        const enFranja = new Set(franja);
        const alLado = new Int32Array(BARRERAS.length);
        for (const c of sobra)
          for (let v = desde[c]!; v < desde[c + 1]!; v++) {
            const j = vecinas[v]!;
            if (
              !enFranja.has(j) &&
              esNodo[j] === 0 &&
              tipos[j] !== ABIERTA &&
              tipos[j] !== indiceDe('wall')
            )
              alLado[tipos[j]!]! += 1;
          }
        const vecina = admitidas.reduce<BarreraConPeso | undefined>(
          (m, c) =>
            alLado[indiceDe(c.barrera)]! > (m === undefined ? 0 : alLado[indiceDe(m.barrera)]!)
              ? c
              : m,
          undefined,
        );
        const otra = indiceDe(
          vecina?.barrera ?? laMasPesada(nuevas.length > 0 ? nuevas : admitidas),
        );
        for (const c of sobra) ponerTipo(tipos, c, otra);
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

  // 7e. El río no engorda, salvo con lo alto justo al norte: la cara de la
  //     meseta cuelga hacia la cámara unas 0,6 casillas y taparía un río de
  //     una (`aguaALaVista`; decisión del usuario, 16-10-2026). Ahí la casilla
  //     del sur también es agua, se pise o sea barrera (salvo el muro de una
  //     muralla). Con el nivel de la escena y con la meseta ya en su sitio (7a
  //     la mueve). No si es nodo o pasillo: lo que quede sin verse lo dice el
  //     paso 7d. Lo que se rellena puede partir una región.
  if (hayRio) {
    const nivel = nivelAhora();
    const MURO = indiceDe('wall');
    let ensanchado = false;
    for (let m = W; m < N - W; m++) {
      const norte = m - W;
      const sur = m + W;
      if (rio[m] === 0 || tipos[norte] === AGUA || tipos[sur] === AGUA) continue;
      if ((nivel[norte] as number) <= (nivel[m] as number)) continue;
      if (esNodo[sur] === 1 || pasillo[sur] === 1 || tipos[sur] === MURO) continue;
      ponerTipo(tipos, sur, AGUA);
      ensanchado = true;
    }
    if (ensanchado) {
      const partida = bolsillos();
      if (partida !== null) return partida;
      barreraDeNodo = barrerasDeLosNodos(e, tipos, esNodo, clave, tipoDePareja, candidatasDe);
    }
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
  //     través de su línea: un acantilado entre dos niveles (#215) o el agua
  //     del río a ras de la orilla baja y a la vista (#144; `separadasDeCerca`).
  //     Lo garantizan el engorde y las líneas, pero el acantilado sin caída del
  //     paso 7a' pasa a montaña, y si estaba entre la meseta y lo bajo deja una
  //     montaña de una casilla en medio (s18 (1,13): un codo hundido por el
  //     agua de al lado). Ese vestido no vale.
  const nivelDe7d = nivelAhora();
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
        const nivelI = e.niveles[region[i] as number] as number;
        const nivelQ = e.niveles[region[q] as number] as number;
        if (
          !separadasDeCerca(
            W,
            H,
            tipos,
            nivelDe7d,
            i,
            q,
            nivelI,
            nivelQ,
            (m) => esNodo[m] === 0,
            true,
          )
        )
          return `las regiones ${region[i]} y ${region[q]} quedan a dos pasos en (${x},${y}) y (${qx},${qy}), sin ${nivelI === nivelQ ? 'agua a su nivel' : 'un acantilado ni agua a la vista'} en medio`;
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
    // El nodo del río cruza el río: es un puente (o la ciudad-puente).
    if (e.rio?.[n] === 1) return 'water';
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
 * Hasta dónde llega el muro alrededor de su puerta, en Chebyshev: 2 deja un
 * lienzo de cinco casillas, dentro de `LARGO_MAXIMO_DE_MURALLA`, con dos a cada
 * lado de la puerta. Más allá, la franja pasa a montaña o agua y es el apoyo de
 * la muralla (`murallasSobrantes`); un apoyo de antes más cerca la acorta.
 */
export const RADIO_DE_LA_PUERTA = 2;

/** Lo que sobra de una franja de muro y si se queda con muralla (`murallasSobrantes`). */
interface Sobrante {
  /** La franja y su espejo: de sus regiones sale la barrera de lo que sobra. */
  readonly franja: readonly number[];
  readonly sobra: readonly number[];
  /** Si queda una muralla: lo que sobra es su apoyo y va de montaña, acantilado o agua. */
  readonly apoya: boolean;
}

/**
 * Lo que sobra de cada muralla (#232): por cada franja de muro —el muro y las
 * puertas, 8-conexo, como las une la escena; las ciudades no entran, se
 * abren— las casillas que no son la línea de una puerta a sus dos apoyos
 * (`lineaDeLaPuerta`, `muroDeLaLinea`). Sin puerta, o sin una puerta que llegue
 * a sus dos apoyos, sobra la franja entera.
 *
 * El apoyo de cada lado es una montaña, un acantilado, el agua o el borde que
 * ya están, o **lo que sobra de la propia franja** más allá de
 * `RADIO_DE_LA_PUERTA`, que pasa a una de esas (el paso 7 de
 * `engordarFronteras`): la frontera de la pareja se vuelve una sierra o un río
 * y la muralla es el fuerte que cierra su paso. Con solo los apoyos que ya
 * había, la muralla quedaba en 41 de 200 mapas (117 con puerta antes): el paso
 * de una pareja va en el medio de su frontera, lejos de los cruces, y casi nada
 * natural lo tiene a menos de tres casillas. Lo que no tiene apoyo por un lado
 * —la puerta en la punta de la franja, junto a una ciudad o a lo que se pisa—
 * no es un paso que cerrar, y es el lienzo que acababa en una ciudad de la
 * marca de s42644.
 *
 * En espejo: se decide la franja canónica (la de la casilla más baja) y la
 * espejo recibe su reflejo, en el mismo grupo, que la búsqueda en anchura con
 * las vecinas en orden fijo no es simétrica al reflejar.
 */
function murallasSobrantes(
  e: EntradaDeEngorde,
  tipos: Tipos,
  esNodo: Uint8Array,
  barreraDeNodo: readonly Barrera[],
): Sobrante[] {
  const { W, H } = e;
  const N = W * H;
  const muro = indiceDe('wall');
  const esCiudad = new Set(e.ciudades);
  const en = new Uint8Array(N);
  const esPuerta = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (tipos[i] === muro && esNodo[i] === 0) en[i] = 1;
  e.nodos.forEach((n, k) => {
    if (!esCiudad.has(n) && barreraDeNodo[k] === 'wall') {
      en[n] = 1;
      esPuerta[n] = 1;
    }
  });
  const apoyos = new Set(APOYOS_DE_MURALLA.map(indiceDe));
  const ciudad = juntoACiudad(W, H, e.ciudades);
  const { desde, vecinas } = vecindad(W, H);
  const cheb = (a: number, b: number): number =>
    Math.max(Math.abs((a % W) - (b % W)), Math.abs(Math.floor(a / W) - Math.floor(b / W)));
  const vista = new Uint8Array(N);
  const fuera: Sobrante[] = [];
  for (let i = 0; i < N; i++) {
    if (en[i] === 0 || vista[i] === 1) continue;
    vista[i] = 1;
    const franja = rellenar(W, H, i, (j) => {
      if (en[j] === 0 || vista[j] === 1) return false;
      vista[j] = 1;
      return true;
    }).sort((a, b) => a - b);
    // La espejo va con esta, con la misma decisión reflejada, si es de verdad
    // su reflejo: casilla a casilla y con las mismas puertas. Las ciudades no
    // son puertas y no van en espejo (la base de cada uno y las neutrales), y
    // entonces cada una se decide por su cuenta.
    const suya = new Set(franja);
    const espejo = franja.map((c) => espejoDe(c, N)).sort((a, b) => a - b);
    const esLaMisma = espejo[0] === franja[0];
    const reflejada =
      !esLaMisma &&
      espejo.every(
        (c) => en[c] === 1 && vista[c] === 0 && esPuerta[c] === esPuerta[espejoDe(c, N)],
      ) &&
      (() => {
        // Y sin nada más de muro pegado: entonces la franja espejo es otra.
        const enEspejo = new Set(espejo);
        return espejo.every((c) => {
          for (let v = desde[c]!; v < desde[c + 1]!; v++) {
            const j = vecinas[v]!;
            if (en[j] === 1 && !enEspejo.has(j)) return false;
          }
          return true;
        });
      })();
    if (reflejada) for (const c of espejo) vista[c] = 1;
    const muroDeLaFranja = franja.filter((c) => esNodo[c] === 0);
    const queda = new Set<number>();
    for (const p of franja) {
      if (esPuerta[p] === 0) continue;
      const rejilla: RejillaDeMuralla = {
        W,
        H,
        enLaMuralla: (j) => suya.has(j) && ciudad[j] === 0 && cheb(j, p) <= RADIO_DE_LA_PUERTA,
        esApoyo: (j) =>
          esNodo[j] === 0 &&
          ciudad[j] === 0 &&
          (apoyos.has(tipos[j] as number) || (suya.has(j) && !queda.has(j))),
        sePisa: (j) => tipos[j] === ABIERTA && esNodo[j] === 0,
      };
      const linea = lineaDeLaPuerta(rejilla, p);
      if (typeof linea === 'string' || linea.largo > LARGO_MAXIMO_DE_MURALLA) continue;
      // Una muralla, una puerta: la que se pegaría a la de otra puerta de la
      // franja no se queda, que juntas pasaban de largo (s69 (15,19) y (18,20),
      // dos pasos de un cruce).
      const muroDeEsta = muroDeLaLinea(
        W,
        linea,
        muroDeLaFranja.filter((c) => ciudad[c] === 0),
      );
      if ([...muroDeEsta, p].some((c) => [...queda].some((q) => cheb(c, q) <= 1))) continue;
      for (const c of muroDeEsta) queda.add(c);
      queda.add(p);
    }
    // La franja que es su propia espejo (la del centro del mapa) se queda con
    // lo de las dos mitades, si lo es del todo.
    if (esLaMisma && franja.every((c) => suya.has(espejoDe(c, N))))
      for (const c of [...queda]) if (suya.has(espejoDe(c, N))) queda.add(espejoDe(c, N));
    const sobra = muroDeLaFranja.filter((c) => !queda.has(c));
    if (sobra.length === 0) continue;
    const apoya = queda.size > 0;
    fuera.push(
      reflejada
        ? {
            franja: [...franja, ...espejo],
            sobra: [...sobra, ...sobra.map((c) => espejoDe(c, N))],
            apoya,
          }
        : { franja, sobra, apoya },
    );
  }
  return fuera;
}

/**
 * Con cuántas casillas cuenta el muro como una de las `TIPOS_POR_MAPA`
 * barreras del mapa (`engordarFronteras`, paso 8).
 */
export const CASILLAS_DE_UNA_MURALLA = 1;

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
    [true, EJES.slice(0, 2)],
    [true, EJES.slice(2)],
    [false, EJES],
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
  for (const [c, t] of cambios) ponerTipo(tipos, c, t);

  // 2. Los acantilados que no separan dos niveles.
  for (const franja of franjasDe(ACANTILADO)) {
    let bits = 0;
    for (const c of franja) bits |= toca(c);
    if (bits !== 0 && (bits & (bits - 1)) !== 0) continue;
    const t = laQueMasHay(franja, [MONTAÑA, indiceDe('water')]);
    for (const c of franja) ponerTipo(tipos, c, t);
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
