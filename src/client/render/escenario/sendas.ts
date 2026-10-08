/**
 * Las sendas: los tramos de camino de casilla en casilla, encadenados en líneas
 * y suavizados para que serpenteen como los de la referencia, sin la
 * escalera de la rejilla.
 *
 * Una senda va de una junta a otra (un extremo o un cruce de tres o más): así un
 * cruce sigue siendo un punto común y no se abre al suavizar. El vaivén es un
 * desplazamiento lateral suave; lo colocado al lado se aparta del trazo ya
 * suavizado (`pasillo.ts`), no de la casilla, así que el vaivén no lo tapa.
 */
import { azarDe } from './esparcir.js';

export type Tramo = readonly [number, number, number, number];
export type Senda = readonly (readonly [number, number])[];

/** Cuánto se aparta como mucho la senda de la línea de casillas, en casillas. */
export const VAIVEN = 0.18;

/**
 * Lo que queda del vaivén en un tramo recto largo, como mucho: en uno de `L`
 * casillas seguidas en la misma dirección, el vaivén se multiplica por
 * `min(1, CASILLAS_CON_VAIVEN_ENTERO / L)`, sin bajar de `VAIVEN_EN_LO_RECTO`.
 * Con la onda constante, una fila de diez casillas salía como un espagueti
 * (defecto 4 de la auditoría de caminos, 08-10-2026, #191): el camino de
 * HoMM2 va casi recto donde la rejilla va recta y se tuerce en los giros.
 */
export const VAIVEN_EN_LO_RECTO = 0.3;
const CASILLAS_CON_VAIVEN_ENTERO = 2.5;

/**
 * Lo ancho de la senda pintada, en casillas: su huella de tierra (`pintarSuelo`).
 * 0,32 (#191): con 0,2 y una huella de 0,12 se leía como un trazo de pluma
 * junto a ciudades de dos casillas, y la rampa de cada bajada, de ~0,35, era
 * otro camino. El borde lo rompe un ruido (`IRREGULARIDAD_DE_SENDA`).
 */
export const ANCHO_DE_SENDA = 0.32;

/**
 * Cuánto varía la media anchura de la senda a lo largo de ella, en fracción:
 * lento (cada ~1,5 casillas) y rápido (el borde roto, cada ~0,15).
 */
export const IRREGULARIDAD_DE_SENDA = { lenta: 0.14, rapida: 0.16 } as const;

/**
 * La media anchura mayor de la huella de la senda (sin sus orlas tenues): la
 * de `ANCHO_DE_SENDA` con el borde abierto al máximo por los dos ruidos. Es lo
 * que no tapa la muralla (`sendaParaLaMuralla`): con la media anchura sola, una
 * torre podía morder el borde pintado donde la senda se ensancha.
 */
export const SEMIANCHO_DE_LA_HUELLA =
  (ANCHO_DE_SENDA / 2) * (1 + IRREGULARIDAD_DE_SENDA.lenta + IRREGULARIDAD_DE_SENDA.rapida);

/**
 * El arcén de lo bajo, en casillas, contado desde el borde de la senda: ninguna
 * mata, piedra, labranza, orilla ni roca de relleno lo pisa. 0,3 por decisión
 * del usuario (05-10-2026); se ajusta a ojo con `pnpm taller escenario`.
 */
export const MARGEN_DE_SENDA = 0.3;

/**
 * El arcén de las masas (árboles y picos de bosque y cordillera), menor: el
 * camino va DENTRO de los bosques y las cordilleras, y con el margen de lo bajo
 * se vaciaban. 0,2 por decisión del usuario (05-10-2026).
 */
export const MARGEN_DE_MASA = 0.2;

/** Media anchura del pasillo de lo bajo: la de la senda más su arcén. */
export const SEMIANCHO_DEL_PASILLO = ANCHO_DE_SENDA / 2 + MARGEN_DE_SENDA;

/**
 * El ancho de lo que se deja sin agua a lo largo de un vado (`Escena.vados`),
 * en casillas: la senda y su arcén (`SEMIANCHO_DEL_PASILLO` a cada lado). El
 * barro se quita menos (`ANCHO_DEL_VADO_EN_EL_BARRO`) y hace de orilla a la
 * lengua de tierra. Aquí y no en `puentes.ts`, que trae el núcleo: el pintor
 * del suelo se empaqueta sin él para el Worker y el taller.
 */
export const ANCHO_DEL_VADO = 2 * SEMIANCHO_DEL_PASILLO;
export const ANCHO_DEL_VADO_EN_EL_BARRO = 0.45;

/** Media anchura del pasillo de las masas. */
export const SEMIANCHO_DEL_PASILLO_DE_MASA = ANCHO_DE_SENDA / 2 + MARGEN_DE_MASA;

/**
 * El grafo de unos tramos: cada punto distinto con su número, en el orden en que
 * aparece, y sus vecinos, en el orden de los tramos. Lo leen `encadenar` y
 * `tramosHastaLosEstribos` (`puentes.ts`): un grafo, una forma de construirlo.
 */
export interface GrafoDeTramos {
  readonly puntos: readonly (readonly [number, number])[];
  readonly vecinos: readonly (readonly number[])[];
  /** El número del punto `(x, y)`, o `undefined` si no es de ningún tramo. */
  numero(x: number, y: number): number | undefined;
  /** La clave de la arista entre dos puntos, la misma en los dos sentidos. */
  arista(a: number, b: number): number;
}

export function grafoDeTramos(tramos: readonly Tramo[]): GrafoDeTramos {
  const numeros = new Map<string, number>();
  const puntos: (readonly [number, number])[] = [];
  const vecinos: number[][] = [];
  const numero = (x: number, y: number) => numeros.get(`${x},${y}`);
  const alta = (x: number, y: number): number => {
    const n = numero(x, y);
    if (n !== undefined) return n;
    numeros.set(`${x},${y}`, puntos.length);
    puntos.push([x, y]);
    vecinos.push([]);
    return puntos.length - 1;
  };
  for (const [x0, y0, x1, y1] of tramos) {
    const a = alta(x0, y0);
    const b = alta(x1, y1);
    (vecinos[a] as number[]).push(b);
    (vecinos[b] as number[]).push(a);
  }
  // Una clave numérica: con la de texto (`'x,y|x,y'`, ordenada), cortar la
  // senda en los estribos costaba 0,39 ms por mapa (07-10-2026).
  const n = puntos.length;
  return { puntos, vecinos, numero, arista: (a, b) => (a < b ? a * n + b : b * n + a) };
}

/**
 * Encadena los tramos en líneas que van de junta a junta. `corta` dice qué
 * puntos acaban una línea aunque solo lleguen dos tramos: una ciudad o un nodo
 * que el camino atraviesa (#210). Sin cortar ahí, el vaivén de `suavizar` corría
 * la senda a un lado en la casilla de la puerta, entre el agua y una pared, y se
 * pintaba sobre el agua (s10 (3,10), s19 (4,9) y s37 (7,26)).
 */
export function encadenar(
  tramos: readonly Tramo[],
  corta: (x: number, y: number) => boolean = () => false,
): [number, number][][] {
  const { puntos, vecinos, arista } = grafoDeTramos(tramos);
  const usado = new Set<number>();
  const grado = (p: number) => {
    const g = (vecinos[p] as readonly number[]).length;
    return g === 2 && corta(...(puntos[p] as readonly [number, number])) ? 0 : g;
  };
  const lineas: [number, number][][] = [];
  const recorrer = (inicio: number, siguiente: number) => {
    const linea = [inicio];
    let ahora = siguiente;
    usado.add(arista(inicio, ahora));
    for (;;) {
      linea.push(ahora);
      if (grado(ahora) !== 2) break;
      const proximo = (vecinos[ahora] as readonly number[]).find(
        (v) => !usado.has(arista(ahora, v)),
      );
      if (proximo === undefined) break;
      usado.add(arista(ahora, proximo));
      ahora = proximo;
    }
    lineas.push(linea.map((k) => [...(puntos[k] as readonly [number, number])]));
  };
  // Primero desde las juntas; lo que quede son anillos, que se abren por cualquier punto.
  const orden = puntos
    .map((p, k) => ({ p, k }))
    .sort(({ p }, { p: q }) => p[1] - q[1] || p[0] - q[0])
    .map(({ k }) => k);
  for (const p of orden)
    if (grado(p) !== 2)
      for (const v of vecinos[p] as readonly number[]) if (!usado.has(arista(p, v))) recorrer(p, v);
  for (const p of orden)
    for (const v of vecinos[p] as readonly number[]) if (!usado.has(arista(p, v))) recorrer(p, v);
  return lineas;
}

/**
 * Suaviza una línea: mete un punto en mitad de cada tramo, aparta los de dentro
 * hacia un lado con un vaivén que cambia despacio, y redondea con Chaikin. Los
 * dos extremos no se mueven.
 */
export function suavizar(linea: readonly (readonly [number, number])[], azar: () => number): Senda {
  if (linea.length < 2) return linea;
  const densa: [number, number][] = [];
  for (let i = 0; i < linea.length - 1; i++) {
    const [x0, y0] = linea[i] as readonly [number, number];
    const [x1, y1] = linea[i + 1] as readonly [number, number];
    densa.push([x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2]);
  }
  densa.push([...(linea.at(-1) as readonly [number, number])]);
  // Lo recto de cada tramo: cuántos tramos seguidos de `linea` van en su
  // misma dirección (un diagonal cuenta √2). El punto `2k` y el `2k+1` de
  // `densa` son del tramo `k`.
  const tramos = linea.length - 1;
  const recto = new Array<number>(tramos).fill(1);
  for (let k = 0; k < tramos; ) {
    const dir = direccion(linea, k);
    let j = k;
    while (j + 1 < tramos && direccion(linea, j + 1) === dir) j++;
    const largo = (j - k + 1) * (dir.split(',').includes('0') ? 1 : Math.SQRT2);
    const f = Math.max(VAIVEN_EN_LO_RECTO, Math.min(1, CASILLAS_CON_VAIVEN_ENTERO / largo));
    for (let m = k; m <= j; m++) recto[m] = f;
    k = j + 1;
  }
  // El vaivén: una onda de fase y periodo al azar, para que no serpenteen todas
  // igual, y otra más lenta que la ensancha y la apaga (`envolvente`), para que
  // la onda no se repita igual a lo largo de una senda larga.
  const fase = azar() * Math.PI * 2;
  const periodo = 4 + azar() * 4;
  const faseLenta = azar() * Math.PI * 2;
  const n = densa.length;
  const movida = densa.map(([x, y], i): [number, number] => {
    if (i === 0 || i === n - 1) return [x, y];
    const [px, py] = densa[i - 1] as [number, number];
    const [qx, qy] = densa[i + 1] as [number, number];
    const dx = qx - px;
    const dy = qy - py;
    const l = Math.hypot(dx, dy) || 1;
    // Se apaga cerca de los extremos: la senda llega recta a la puerta.
    const borde = Math.min(1, i / 2, (n - 1 - i) / 2);
    const envolvente = 0.7 + 0.3 * Math.sin(faseLenta + (i / (periodo * 2.3)) * Math.PI);
    const tramo = recto[Math.min(tramos - 1, Math.floor(i / 2))] as number;
    const d = Math.sin(fase + (i / periodo) * Math.PI) * VAIVEN * borde * envolvente * tramo;
    return [x - (dy / l) * d, y + (dx / l) * d];
  });
  let curva: [number, number][] = movida;
  for (let k = 0; k < 3; k++) {
    const nueva: [number, number][] = [curva[0] as [number, number]];
    for (let i = 0; i < curva.length - 1; i++) {
      const [x0, y0] = curva[i] as [number, number];
      const [x1, y1] = curva[i + 1] as [number, number];
      nueva.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1]);
      nueva.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    nueva.push(curva.at(-1) as [number, number]);
    curva = nueva;
  }
  return curva;
}

/** La dirección del tramo `k` de una línea, como texto: `'1,0'`, `'-1,1'`… */
function direccion(linea: readonly (readonly [number, number])[], k: number): string {
  const [x0, y0] = linea[k] as readonly [number, number];
  const [x1, y1] = linea[k + 1] as readonly [number, number];
  return `${Math.sign(x1 - x0)},${Math.sign(y1 - y0)}`;
}

export function sendas(
  tramos: readonly Tramo[],
  semilla: number,
  corta: (x: number, y: number) => boolean = () => false,
): Senda[] {
  const azar = azarDe(semilla * 7919 + 17);
  return encadenar(tramos, corta).map((l) => suavizar(l, azar));
}

/**
 * Lo más que la senda pintada se aparta de lo que la tapa, en casillas, a un
 * lado de su trazo (`apartarDeLoQueTapa`). 0,35 la deja en su casilla con el
 * vaivén; con 0,45 o 0,6 se tapaban más tramos de los que salían, que al
 * apartarse de una pared se metía bajo la de enfrente (semillas 1-40,
 * 08-10-2026: 5,9, 6,4 y 6,6 tramos por mapa).
 */
export const APARTE_DE_LO_QUE_TAPA = 0.35;
/**
 * Dónde se mira si la senda apartada ya asoma: a esto de su trazo, hacia el
 * lado libre. Su huella llega a 0,16 (`ANCHO_DE_SENDA`), así que asoma por lo
 * menos esa franja. Exigir que asome el trazo mismo apartaba menos (5,85
 * tramos por mapa frente a 5,4, 1-40, sin las guardas de barrera de
 * `componer`): lo que cuenta es que la senda se vea.
 */
const HOLGURA_DEL_APARTE = 0.06;
/**
 * Lo que tarda la senda en apartarse y en volver a su trazo, a cada lado del
 * trozo tapado. Con 0,4 / 0,6 / 0,8 / 1 / 1,2 casillas, 6,0 / 5,8 / 5,5 / 5,4 /
 * 5,3 tramos por mapa (1-40, sin las guardas de barrera de `componer`): una
 * casilla, que no la tuerce más que el vaivén.
 */
const RAMPA_DEL_APARTE = 1;
/**
 * Cuántas pasadas: lo que la primera aparta a medias, en la rampa de un trozo
 * o contra la pared de enfrente, la segunda lo acaba (1-40, sin las guardas de
 * barrera: 6,3 tramos por mapa con una, 5,4 con dos, 5,4 con tres). Cada pasada pregunta por la senda de
 * partida (`admite`), para que dos no sumen lo que una no deja.
 */
const VUELTAS_DEL_APARTE = 2;
/** Cada cuánto se prueba un apartamiento, hasta `APARTE_DE_LO_QUE_TAPA`. */
const PASO_DEL_APARTE = 0.05;
/**
 * Lo que no se mueve en cada extremo de una senda —llega a su puerta, su cruce
 * o su estribo— y lo que tarda luego en soltarse del todo. Con 0,4 y la rampa
 * entera para soltarse quedaban 6,9 tramos por mapa: casi todo lo tapado está a
 * la puerta de algo (1-40, 08-10-2026).
 */
const EXTREMO_FIJO = 0.2;
const SUELTA = 0.3;

/**
 * Las sendas apartadas de lo que las tapa (#206): cada punto de su trazo que
 * cae bajo `tapada` se corre a un lado, lo menos que haga asomar su huella
 * (`HOLGURA_DEL_APARTE`), y el trozo entra y sale de ese lado en
 * `RAMPA_DEL_APARTE` casillas. La pared del relieve nunca se aparta de la
 * senda (R4/R5): es la senda la que, dentro de su casilla, se aparta del pie de
 * lo alto. No se mueve lo que `fija` dice —la senda junto a una bajada, que la
 * cruza por su rampa— ni los extremos, y un punto solo pasa a otra casilla si
 * `admite` lo deja. Lo que ni así sale de debajo se queda donde estaba.
 */
export function apartarDeLoQueTapa(
  sendas: readonly Senda[],
  tapada: (x: number, y: number) => boolean,
  fija: (x: number, y: number) => boolean,
  admite: (x: number, y: number, desde: readonly [number, number]) => boolean,
): Senda[] {
  return sendas.map((origen) => {
    let l = origen;
    for (let k = 0; k < VUELTAS_DEL_APARTE; k++) l = apartarUna(l, origen, tapada, fija, admite);
    return l;
  });
}

function apartarUna(
  l: Senda,
  origen: Senda,
  tapada: (x: number, y: number) => boolean,
  fija: (x: number, y: number) => boolean,
  admite: (x: number, y: number, desde: readonly [number, number]) => boolean,
): Senda {
  const n = l.length;
  if (n < 3) return l;
  const acum = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const [ax, ay] = l[i - 1] as readonly [number, number];
    const [bx, by] = l[i] as readonly [number, number];
    acum[i] = (acum[i - 1] as number) + Math.hypot(bx - ax, by - ay);
  }
  const total = acum[n - 1] as number;
  const normal = (i: number): readonly [number, number] => {
    const [ax, ay] = l[Math.max(0, i - 1)] as readonly [number, number];
    const [bx, by] = l[Math.min(n - 1, i + 1)] as readonly [number, number];
    const m = Math.hypot(bx - ax, by - ay) || 1;
    return [-(by - ay) / m, (bx - ax) / m];
  };
  // Lo libre de moverse: 0 en los extremos y en lo fijo, 1 a una rampa de ellos.
  const quieto = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  for (let i = 0; i < n; i++) {
    const [x, y] = l[i] as readonly [number, number];
    if (
      (acum[i] as number) < EXTREMO_FIJO ||
      total - (acum[i] as number) < EXTREMO_FIJO ||
      fija(x, y)
    )
      quieto[i] = 0;
  }
  for (let i = 1; i < n; i++)
    quieto[i] = Math.min(
      quieto[i] as number,
      (quieto[i - 1] as number) + (acum[i] as number) - (acum[i - 1] as number),
    );
  for (let i = n - 2; i >= 0; i--)
    quieto[i] = Math.min(
      quieto[i] as number,
      (quieto[i + 1] as number) + (acum[i + 1] as number) - (acum[i] as number),
    );
  const libre = (i: number) => suave((quieto[i] as number) / SUELTA);
  // Lo que quiere apartarse cada punto tapado: el menor corrimiento que lo saca.
  const quiere = new Float64Array(n);
  let alguno = false;
  for (let i = 0; i < n; i++) {
    if (quieto[i] === 0) continue;
    const p = l[i] as readonly [number, number];
    if (!tapada(p[0], p[1])) continue;
    const [nx, ny] = normal(i);
    busca: for (let o = PASO_DEL_APARTE; o <= APARTE_DE_LO_QUE_TAPA + 1e-9; o += PASO_DEL_APARTE)
      for (const s of [o, -o]) {
        const h = s + Math.sign(s) * HOLGURA_DEL_APARTE;
        if (
          !admite(p[0] + nx * s, p[1] + ny * s, origen[i] as readonly [number, number]) ||
          tapada(p[0] + nx * h, p[1] + ny * h)
        )
          continue;
        quiere[i] = s;
        alguno = true;
        break busca;
      }
  }
  if (!alguno) return l;
  // Cada punto, con el mayor de lo que quieren los de su rampa, a cada uno
  // menguado por lo que dista: el trozo tapado sale entero y entra y sale suave.
  const corre = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const q = quiere[i] as number;
    if (q === 0) continue;
    for (let j = i; j >= 0 && (acum[i] as number) - (acum[j] as number) <= RAMPA_DEL_APARTE; j--) {
      const v = q * (1 - suave(((acum[i] as number) - (acum[j] as number)) / RAMPA_DEL_APARTE));
      if (Math.abs(v) > Math.abs(corre[j] as number)) corre[j] = v;
    }
    for (
      let j = i + 1;
      j < n && (acum[j] as number) - (acum[i] as number) <= RAMPA_DEL_APARTE;
      j++
    ) {
      const v = q * (1 - suave(((acum[j] as number) - (acum[i] as number)) / RAMPA_DEL_APARTE));
      if (Math.abs(v) > Math.abs(corre[j] as number)) corre[j] = v;
    }
  }
  return l.map(([x, y], i) => {
    const [nx, ny] = normal(i);
    // Lo que la rampa le pasa a un punto que no lo pidió también se mira: si no
    // se admite, a la mitad, y si tampoco, nada.
    for (let c = (corre[i] as number) * libre(i), k = 0; c !== 0 && k < 3; c /= 2, k++)
      if (admite(x + nx * c, y + ny * c, origen[i] as readonly [number, number]))
        return [x + nx * c, y + ny * c] as const;
    return [x, y] as const;
  });
}

/** De 0 a 1 sin esquinas (`smoothstep`), recortado a [0, 1]. */
const suave = (t: number): number => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};
