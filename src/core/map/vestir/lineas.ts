/**
 * Las líneas de una casilla del vestido: el acantilado como el borde de una
 * meseta (#215), que se adelgaza (`adelgazarAcantilados`), no deja la puerta de
 * una ciudad en una muesca (`puertasSinMuesca`, #222) ni se queda sin caída
 * (`sinAcantiladoLlano`, `acantiladoSinCaida`); y las caídas largas al sur,
 * partidas a trechos (`quebrarCaidas`, #231). Abrir una casilla de una línea a
 * su región es `abrirLinea`. Lo llama el engorde (`fronteras.ts`), por vueltas,
 * y el generador mira con `acantiladoSinCaida` y `caidasLargas` el vestido ya
 * acabado.
 *
 * Era parte de `map/vestir.ts` hasta la fase N de la reorganización
 * (07-11-2026).
 */
import { largoALaEscala } from '../../escala.js';
import { espejoDe } from '../geometria.js';
import { acantiladosSinCaida } from '../niveles.js';
import { vecindad } from '../regiones.js';
import type { Barrera, Nivel } from '../terrain.js';
import {
  ABIERTA,
  esDelRio,
  indiceDe,
  ponerTipo,
  separadasDeCerca,
  type Tipos,
  TRECHO_DEL_LADO,
} from './base.js';
import { nivelesDeLoEngordado } from './relieve.js';

/**
 * El acantilado, una línea de una casilla (#215): el borde de la meseta, con lo
 * bajo a su pie, y no un campo de roca. «Línea de 1 casilla: el ancho que sobra
 * pasa a la meseta, que se pisa. Como en HoMM: meseta transitable, borde
 * infranqueable salvo por rampa» (el usuario). El engorde dejaba franjas de 3-4
 * casillas, todas al nivel alto (`nivelesDelRelieve`), con la caída solo en el
 * borde de abajo: la auditoría 6 contó 447 de 776 casillas sin nada más bajo en
 * cruz, y la escena las cubría de roca.
 *
 * Por vueltas (`abrirLinea`): se abre a la región `r` de sus vecinas cada
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
    if (abrirLinea(W, H, tipos, region, esNodo, niveles, nivel, 'cliff', alto).length === 0)
      return cambio;
    cambio = true;
  }
}

/**
 * Lo más largo que cae seguido al sur una fila del relieve (#231): una caída de
 * `largoALaEscala(8)` casillas (10 en el 42×42) o más lleva quiebros. Es el
 * largo de las caras de `tools/qa/medidas/rectitud.ts`, en casillas: la cara que pinta
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
    // El río no se muerde: sería un río de tres bajo la cara (`ponerTipo` no lo toca, y
    // este agua sí sería suya).
    if (tipos[bajo] === AGUA && !esDelRio(tipos, bajo) && libre(alto) && hondo(alto, -W))
      return [alto, AGUA, -W];
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
          ponerTipo(tipos, j, t);
          tocada[j] = 1;
          // El reflejo, si en él se puede: el engorde no sale en espejo
          // casilla a casilla (la reparación del paso 4b va en orden), y
          // donde el reflejo ya es barrera no hay nada que correr.
          const m = espejoDe(j, N);
          if (libre(m) && hondo(m, -d)) {
            ponerTipo(tipos, m, t);
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
 * daría un eje de la meseta a la meseta (`abrirLinea`)— y su puerta, la
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
  nivel: ArrayLike<number>,
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
      // Y nada de otra región a dos pasos de lo abierto sin su línea
      // (`separadasDeCerca`) o un nodo en medio (`engordarFronteras`, paso 7d,
      // que junto a un nodo no mira), contando lo que se cierra.
      const otroCorte = (m: number, rq: number): boolean =>
        esNodo[m] === 1 || (m === cerrar && niveles[rq] !== niveles[baja]);
      for (let dy = -2; dy <= 2 && vale; dy++)
        for (let dx = -2; dx <= 2 && vale; dx++) {
          const qx = x + s + dx;
          const qy = y + 1 + dy;
          if (!dentro(qx, qy)) continue;
          const q = qy * W + qx;
          if (q === cerrar || !abierta(q) || region[q] === baja) continue;
          const rq = region[q] as number;
          let enMedio = separadasDeCerca(
            W,
            H,
            tipos,
            nivel,
            c,
            q,
            niveles[baja] as number,
            niveles[rq] as number,
            (m) => m !== c && esNodo[m] === 0,
          );
          for (let my = Math.max(y + 1, qy) - 1; my <= Math.min(y + 1, qy) + 1; my++)
            for (let mx = Math.max(x + s, qx) - 1; mx <= Math.min(x + s, qx) + 1; mx++)
              if (dentro(mx, my) && otroCorte(my * W + mx, rq)) enMedio = true;
          if (!enMedio) vale = false;
        }
      if (!vale) continue;
      ponerTipo(tipos, c, ABIERTA);
      region[c] = baja;
      if (abierta(cerrar)) ponerTipo(tipos, cerrar, CORTADO);
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
 * (`abrirLinea`), por vueltas, porque abrir la punta de un espolón deja sin
 * caída la casilla de detrás; lo que queda, a montaña, que va entre cualquier
 * pareja de niveles. Devuelve si cambió algo.
 */
export function sinAcantiladoLlano(
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
    const nivel = nivelAhora();
    const llanos = new Set(acantiladosSinCaida(W, H, esCorte, nivel));
    if (llanos.size === 0) return cambio;
    cambio = true;
    const abiertas =
      vuelta < VUELTAS_DE_ESPOLONES
        ? abrirLinea(W, H, tipos, region, esNodo, niveles, nivel, 'cliff', (i) => llanos.has(i))
        : [];
    if (abiertas.length > 0) continue;
    for (const c of llanos) ponerTipo(tipos, c, indiceDe('mountain'));
    return cambio;
  }
}

/**
 * Una vuelta de abrir casillas de una línea (`linea`: el acantilado, #215, o el
 * agua del río, #144) a la región de al lado: cada una que no es nodo, cuyo
 * todo lo que se pisa en sus ocho vecinas es de una sola región `r`, que
 * `quiere(i, r)` y cuyos nodos vecinos ya tocan `r`. Nada de lo que se pisa de
 * una región queda así junto a otra (la que se abre no toca más que `r`), y la
 * red sigue cerrada en ocho vecinas. La decisión es por casilla y simultánea, y
 * por eso sale en espejo: dos que se abrirían a regiones distintas y se tocan no
 * se abren. `nivel` es el de la escena ahora (`nivelesDeLoEngordado`). Devuelve
 * las que abrió.
 */
function abrirLinea(
  W: number,
  H: number,
  tipos: Tipos,
  region: Int32Array,
  esNodo: Uint8Array,
  niveles: readonly Nivel[],
  nivel: ArrayLike<number>,
  linea: Barrera,
  quiere: (i: number, r: number) => boolean,
): number[] {
  const N = W * H;
  const { desde, vecinas } = vecindad(W, H);
  const LINEA = indiceDe(linea);
  const abierta = (j: number): boolean => tipos[j] === ABIERTA && esNodo[j] === 0;
  // Las regiones que toca cada nodo: abrir junto a uno no le da otra.
  const tocaElNodo = (n: number, r: number): boolean => {
    for (let v = desde[n]!; v < desde[n + 1]!; v++)
      if (abierta(vecinas[v]!) && region[vecinas[v]!] === r) return true;
    return false;
  };
  const aQuien = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    if (tipos[i] !== LINEA || esNodo[i] === 1) continue;
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
   * Si abrir `i` a `r` deja lo que se pisa de otra región a dos pasos sin su
   * línea en medio (`separadasDeCerca`). Fuera de los nodos, dos regiones quedan
   * a tres pasos como poco (`engordarFronteras`, paso 4b), y la línea de una
   * casilla es la excepción: el acantilado entre dos niveles, el agua entre dos
   * iguales. Sin ella, dos mesetas al mismo nivel que se comen la franja desde
   * los dos lados se quedaban con una casilla sin caída en medio, que pasaba a
   * montaña (s24 (30-32, 8)). Lo que se abre a la vez cuenta como abierto.
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
        const separadas = separadasDeCerca(
          W,
          H,
          tipos,
          nivel,
          i,
          q,
          niveles[r] as number,
          niveles[rq] as number,
          (m) => m !== i && esNodo[m] === 0 && aQuien[m] === -1,
          linea === 'water',
        );
        if (!separadas) return true;
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
    ponerTipo(tipos, i, ABIERTA);
    region[i] = aQuien[i] as number;
  }
  return abrir;
}
