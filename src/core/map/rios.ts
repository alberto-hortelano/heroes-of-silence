/**
 * Los ríos del procedimental (#144, 14-10-2026): el agua de varias fronteras
 * seguidas, de una boca en el borde del mapa a otra o a un lago de cabecera.
 *
 * Una frontera de agua sola es la de una pareja de regiones, unas 20 casillas
 * partidas por su puente: se lee como un lago. Un río pide **varias parejas
 * seguidas**, que pasan de una a la siguiente por un cruce de tres regiones. En
 * cada cruce hay una ciudad (`intentarRed`), que corta el agua como un vado
 * (decisión del usuario). Y un río tiene que salir del mapa: **un tramo largo
 * que muere en medio no es un río** (corrección del usuario al plan).
 *
 * Todo aquí decide **qué barrera lleva cada pareja** antes del engorde; la red
 * de nodos no cambia, y el agua sigue plana (#210): todas las parejas de un río
 * tienen la orilla baja al mismo nivel, y ninguna región de sus cruces queda por
 * debajo, así que cada franja del río va a ras de ese nivel.
 *
 * Todo es puro y en enteros; el único azar es el `rng` que se pasa.
 */
import type { Rng } from '../rng.js';
import { rellenar, vecindad } from './regiones.js';
import type { Barrera, Nivel } from './terrain.js';

/** Los lagos que se buscan en el curso de cada río (y su espejo). */
export const LAGOS_POR_RIO = 2;
/** El radio del lago: un disco de dx² + dy² ≤ `R_LAGO² + 1` y un anillo a `R_LAGO + 1` donde el ruido cae a favor. */
export const R_LAGO = 2;
/** Lo más largo que se busca un río, en parejas: más allá, el sorteo ya tiene de sobra. */
export const PAREJAS_MAXIMAS_DEL_RIO = 7;
/** Las casillas de muro fino que pide una pareja para entrar en un río. */
const FINO_DEL_RIO = 4;

/** El extremo de una frontera que llega al marco del mapa: la boca del río. */
export const BORDE = -1;

export interface EntradaDelRio {
  readonly W: number;
  readonly H: number;
  /** La pareja de cada casilla de muro fino (clave de `clave(a, b)`), o −1. */
  readonly parejaDeMuro: Int32Array;
  /** Las celdas que se asoman a cada casilla de muro fino, ordenadas. */
  readonly asomadas: readonly (readonly number[] | undefined)[];
  readonly nodos: readonly number[];
  readonly ciudades: readonly number[];
  readonly regiones: number;
  readonly niveles: readonly Nivel[];
  /** Si la frontera de la pareja admite agua (`barrerasDeLaPareja`). */
  readonly admiteAgua: (k: number) => boolean;
  /** La barrera sin agua que llevaría el tramo cortado de la pareja, o `null` si no admite otra. */
  readonly otraBarrera: (k: number) => Barrera | null;
  /** El muro fino de la pareja y su espejo, sin nodos (`fino` del engorde). */
  readonly fino: (k: number) => number;
  readonly claveEspejo: (k: number) => number;
}

/**
 * Los cruces de la red fina y los extremos de cada frontera. Un **cruce** es un
 * grupo de casillas de muro fino a las que se asoman tres regiones o más,
 * 8-conexo, unido a los demás que caen junto a la misma ciudad; sus regiones
 * son todas las que se asoman. Los **extremos** de una pareja son los cruces
 * que tocan su muro y tienen sus dos regiones, más `BORDE` si su muro llega al
 * marco del mapa.
 */
export interface Cruces {
  /** Las casillas de cada cruce. */
  readonly casillas: readonly (readonly number[])[];
  readonly regiones: readonly ReadonlySet<number>[];
  /** El cruce de cada casilla de muro, o −1. */
  readonly deCasilla: Int32Array;
  /** Los extremos de cada pareja con muro fino, por clave: cruces y `BORDE`. */
  readonly extremos: ReadonlyMap<number, readonly number[]>;
  /** Las casillas de muro fino de cada pareja, en orden. */
  readonly muroDe: ReadonlyMap<number, readonly number[]>;
  /** Las parejas con muro en el orden en que se descubren. */
  readonly parejas: readonly number[];
  /**
   * El cruce reflejado de cada uno: el de la casilla espejo de su primera
   * casilla que es cruce, o −1. El Voronoi va en espejo salvo empates.
   */
  readonly espejo: Int32Array;
  /**
   * Las regiones de cada trozo 8-conexo de un cruce, sin unir por la ciudad:
   * dos puntos triples junto a una misma ciudad son un cruce para los brazos,
   * pero el agua solo sigue de una pareja a otra por un mismo punto triple.
   */
  readonly trozos: readonly (readonly ReadonlySet<number>[])[];
}

export function crucesDeLaRed(e: EntradaDelRio): Cruces {
  const { W, H, parejaDeMuro, asomadas } = e;
  const N = W * H;
  const cheb = (a: number, b: number): number =>
    Math.max(Math.abs((a % W) - (b % W)), Math.abs(Math.floor(a / W) - Math.floor(b / W)));
  // Unión por rango de las casillas de cruce: vecinas, o de la misma ciudad.
  const padre = new Int32Array(N).fill(-1);
  const raiz = (i: number): number => {
    let r = i;
    while (padre[r] !== r) r = padre[r] as number;
    while (padre[i] !== r) {
      const p = padre[i] as number;
      padre[i] = r;
      i = p;
    }
    return r;
  };
  const unir = (a: number, b: number): void => {
    const ra = raiz(a);
    const rb = raiz(b);
    if (ra !== rb) padre[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const deCiudad = new Map<number, number>();
  const { desde, vecinas } = vecindad(W, H);
  for (let i = 0; i < N; i++) {
    if ((asomadas[i]?.length ?? 0) < 3) continue;
    padre[i] = i;
    const ciudad = e.ciudades.find((c) => cheb(c, i) <= 2);
    if (ciudad !== undefined) {
      const otra = deCiudad.get(ciudad);
      if (otra === undefined) deCiudad.set(ciudad, i);
      else unir(i, otra);
    }
  }
  for (let i = 0; i < N; i++) {
    if (padre[i] === -1) continue;
    for (let v = desde[i]!; v < desde[i + 1]!; v++) {
      const j = vecinas[v]!;
      if (padre[j] !== -1) unir(i, j);
    }
  }
  const deCasilla = new Int32Array(N).fill(-1);
  const casillas: number[][] = [];
  const regiones: Set<number>[] = [];
  const porRaiz = new Map<number, number>();
  for (let i = 0; i < N; i++) {
    if (padre[i] === -1) continue;
    const r = raiz(i);
    let c = porRaiz.get(r);
    if (c === undefined) {
      c = casillas.length;
      porRaiz.set(r, c);
      casillas.push([]);
      regiones.push(new Set());
    }
    deCasilla[i] = c;
    casillas[c]!.push(i);
    for (const a of asomadas[i] ?? []) regiones[c]!.add(a);
  }
  const muroDe = new Map<number, number[]>();
  for (let i = 0; i < N; i++) {
    const k = parejaDeMuro[i] as number;
    if (k < 0) continue;
    const lista = muroDe.get(k) ?? [];
    lista.push(i);
    muroDe.set(k, lista);
  }
  const extremos = new Map<number, number[]>();
  for (const [k, suyas] of muroDe) {
    const a = Math.floor(k / e.regiones);
    const b = k % e.regiones;
    const fuera = new Set<number>();
    for (const i of suyas) {
      const x = i % W;
      const y = (i - x) / W;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) fuera.add(BORDE);
      const mira = [i];
      for (let v = desde[i]!; v < desde[i + 1]!; v++) mira.push(vecinas[v]!);
      for (const j of mira) {
        const c = deCasilla[j] as number;
        if (c !== -1 && regiones[c]!.has(a) && regiones[c]!.has(b)) fuera.add(c);
      }
    }
    extremos.set(
      k,
      [...fuera].sort((p, q) => p - q),
    );
  }
  // Los trozos de cada cruce, 8-conexos y sin la ciudad.
  const trozos: Set<number>[][] = casillas.map(() => []);
  const enTrozo = new Uint8Array(N);
  for (const [c, suyas] of casillas.entries()) {
    const dentro = new Set(suyas);
    for (const i of suyas) {
      if (enTrozo[i] === 1) continue;
      enTrozo[i] = 1;
      const trozo = rellenar(W, H, i, (j) => {
        if (enTrozo[j] === 1 || !dentro.has(j)) return false;
        enTrozo[j] = 1;
        return true;
      });
      const r = new Set<number>();
      for (const j of trozo) for (const a of asomadas[j] ?? []) r.add(a);
      trozos[c]!.push(r);
    }
  }
  const espejo = new Int32Array(casillas.length).fill(-1);
  for (const [c, suyas] of casillas.entries()) {
    const reflejado = suyas.map((i) => deCasilla[N - 1 - i] as number).find((r) => r !== -1);
    if (reflejado !== undefined) espejo[c] = reflejado;
  }
  return {
    casillas,
    regiones,
    deCasilla,
    extremos,
    muroDe,
    parejas: [...muroDe.keys()],
    espejo,
    trozos,
  };
}

/**
 * Cuántos brazos de agua tiene cada cruce, y si una pareja puede llevar agua
 * sin abrirle a un cruce el segundo: **la regla de las charcas**. Fuera del
 * río, el agua solo va en parejas sueltas, lagos entre dos regiones; con dos
 * brazos en una ciudad, ese agua sería un río sin boca, y con tres, la charca
 * de un cruce.
 */
export class BrazosDeAgua {
  private readonly brazos: Int32Array;
  constructor(
    private readonly cruces: Cruces,
    private readonly claveEspejo: (k: number) => number,
  ) {
    this.brazos = new Int32Array(cruces.casillas.length);
  }
  /** Los brazos de agua del cruce `c`. */
  de(c: number): number {
    return this.brazos[c] as number;
  }
  /**
   * Si la pareja `k` (y su espejo) puede llevar agua: tiene muro y ninguno de
   * sus cruces tiene ya un brazo de agua. Una clave sin muro —dos regiones que
   * solo se asoman a un cruce— no lleva agua: la tocaría junto a la ciudad.
   */
  admite(k: number): boolean {
    for (const p of [k, this.claveEspejo(k)]) {
      const ext = this.cruces.extremos.get(p);
      if (ext === undefined) return false;
      if (ext.some((c) => c !== BORDE && (this.brazos[c] as number) > 0)) return false;
    }
    return true;
  }
  /** Apunta el agua de la pareja `k`, salvo en el cruce `salvo` (la cabecera cortada). */
  poner(k: number, salvo = BORDE): void {
    for (const c of this.cruces.extremos.get(k) ?? [])
      if (c !== BORDE && c !== salvo) this.brazos[c]! += 1;
  }
}

/** Un río elegido: sus parejas y las de su espejo, sus lagos y su corte de cabecera. */
export interface Rio {
  /** Las parejas del río, de la boca a la cabecera. */
  readonly parejas: readonly number[];
  /** Las que llevan agua: las del río y las de su espejo. */
  readonly agua: ReadonlySet<number>;
  /** Si sale del mapa por los dos lados; si no, nace en un lago. */
  readonly deBordeABorde: boolean;
  /** Los centros de sus lagos (casillas de su muro fino), con los del espejo. */
  readonly lagos: readonly { readonly centro: number; readonly pareja: number }[];
  /**
   * El muro de la pareja de cabecera del lago a su ciudad, y el de su espejo:
   * lleva otra barrera, para que el río nazca en el lago.
   */
  readonly corte: ReadonlyMap<number, Barrera>;
  /** Los cruces de cabecera, el del río y el de su espejo: allí el agua no llega. */
  readonly cabeceras: readonly { readonly pareja: number; readonly cruce: number }[];
}

/** Las casillas del disco de un lago, sin el anillo: lo que seguro se come del muro. */
const enElDisco = (W: number, centro: number, i: number): boolean => {
  const dx = (i % W) - (centro % W);
  const dy = Math.floor(i / W) - Math.floor(centro / W);
  return dx * dx + dy * dy <= R_LAGO * R_LAGO + 1;
};

/**
 * El río de este mapa, o `null` si no cabe ninguno. Busca cadenas de 2 a
 * `PAREJAS_MAXIMAS_DEL_RIO` parejas que admiten agua, una tras otra por un
 * cruce común, con una punta en el borde (la boca) y la otra en el borde o en
 * una pareja con sitio para un lago de cabecera. Las que valen:
 *
 * - **planas**: la orilla baja de cada pareja al mismo nivel L, y todas las
 *   regiones de los cruces que toca (la cabecera también) a L o más (#210);
 * - **sin volver**: ningún cruce dos veces;
 * - **sin tercer brazo**: con el espejo, ningún cruce con más de dos brazos.
 *
 * Se sortea una por el cuadrado de su largo (el muro fino), doble si va de
 * borde a borde: con el largo a secas salían sobre todo ríos de dos parejas
 * junto a una esquina (mediana del más largo de cada mapa, 25 en 1-40),
 * entre las que `cabe` deja: el resto del vestido tiene que poder con ella (las
 * barreras garantizadas, `TIPOS_POR_MAPA`).
 */
export function elegirRio(
  e: EntradaDelRio,
  cruces: Cruces,
  rng: Rng,
  cabe: (agua: ReadonlySet<number>) => boolean = () => true,
): Rio | null {
  const { W, H, nodos } = e;
  const N = W * H;
  const regionesDe = (k: number): [number, number] => [Math.floor(k / e.regiones), k % e.regiones];
  const orillaBaja = (k: number): number => {
    const [a, b] = regionesDe(k);
    return Math.min(e.niveles[a] as number, e.niveles[b] as number);
  };
  const cheb = (a: number, b: number): number =>
    Math.max(Math.abs((a % W) - (b % W)), Math.abs(Math.floor(a / W) - Math.floor(b / W)));
  const esNodo = new Set(nodos);

  // El sitio para un lago de cada pareja: la casilla de su muro fino más lejos
  // de todo nodo (empate: la primera), si está a `R_LAGO + 2` o más.
  const sitio = new Map<number, { centro: number; lejos: number }>();
  const sitioDe = (k: number): { centro: number; lejos: number } | null => {
    let s = sitio.get(k);
    if (s === undefined) {
      s = { centro: -1, lejos: -1 };
      for (const i of cruces.muroDe.get(k) ?? []) {
        // Ni junto al marco: el disco tiene que caber entero en el mapa, o el
        // lago de la boca sale cortado por la mitad.
        const x = i % W;
        const y = (i - x) / W;
        if (
          esNodo.has(i) ||
          x < R_LAGO + 1 ||
          y < R_LAGO + 1 ||
          x > W - R_LAGO - 2 ||
          y > H - R_LAGO - 2
        )
          continue;
        let lejos = Number.MAX_SAFE_INTEGER;
        for (const n of nodos) lejos = Math.min(lejos, cheb(i, n));
        if (lejos > s.lejos) s = { centro: i, lejos };
      }
      sitio.set(k, s);
    }
    return s.lejos >= R_LAGO + 2 ? s : null;
  };

  /**
   * El corte de la cabecera: el muro de la pareja `k` que queda, quitado el
   * disco del lago, del lado del cruce `cabecera` y no del cruce `rio`. `null`
   * si el lago no parte el muro en esos dos lados.
   */
  const corteDe = (k: number, centro: number, cabecera: number, rio: number): number[] | null => {
    const suyas = (cruces.muroDe.get(k) ?? []).filter((i) => !enElDisco(W, centro, i));
    const dentro = new Set(suyas);
    const visto = new Set<number>();
    const fuera: number[] = [];
    const tocaElCruce = (i: number, c: number): boolean => {
      if (cruces.deCasilla[i] === c) return true;
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && cruces.deCasilla[ny * W + nx] === c)
            return true;
        }
      return false;
    };
    for (const i of suyas) {
      if (visto.has(i)) continue;
      visto.add(i);
      const trozo = rellenar(W, H, i, (j) => {
        if (!dentro.has(j) || visto.has(j)) return false;
        visto.add(j);
        return true;
      });
      const alaCabecera = trozo.some((j) => tocaElCruce(j, cabecera));
      const alRio = trozo.some((j) => tocaElCruce(j, rio));
      if (alaCabecera && alRio) return null;
      if (alaCabecera) fuera.push(...trozo);
    }
    return fuera.length > 0 ? fuera : null;
  };

  const candidata = (k: number): boolean =>
    e.admiteAgua(k) &&
    e.fino(k) >= FINO_DEL_RIO &&
    (cruces.extremos.get(k)?.length ?? 0) === 2 &&
    e.admiteAgua(e.claveEspejo(k));
  const porCruce = new Map<number, number[]>();
  for (const k of cruces.parejas) {
    if (!candidata(k)) continue;
    for (const c of cruces.extremos.get(k)!) {
      if (c === BORDE) continue;
      const lista = porCruce.get(c) ?? [];
      lista.push(k);
      porCruce.set(c, lista);
    }
  }
  const otroExtremo = (k: number, c: number): number => {
    const [p, q] = cruces.extremos.get(k)!;
    return p === c ? (q as number) : (p as number);
  };
  const regionesDelCruceDesde = (c: number, L: number): boolean =>
    [...(cruces.regiones[c] ?? [])].every((r) => (e.niveles[r] as number) >= L);

  interface Cadena {
    readonly parejas: readonly number[];
    readonly cabecera: number;
    readonly peso: number;
  }
  const cadenas: Cadena[] = [];
  const vistas = new Set<string>();

  /**
   * La cadena vale con su espejo: ningún cruce con tres brazos de agua. La
   * pareja de cabecera no tiene brazo en su cruce de cabecera (el corte), ni su
   * reflejo en el reflejado.
   */
  const sinTercerBrazo = (parejas: readonly number[], cabecera: number): boolean => {
    const ultima = parejas[parejas.length - 1] as number;
    const cortados =
      cabecera === BORDE
        ? []
        : [
            [ultima, cabecera],
            [e.claveEspejo(ultima), cruces.espejo[cabecera] as number],
          ];
    const agua = new Set<number>();
    for (const k of parejas) {
      agua.add(k);
      agua.add(e.claveEspejo(k));
    }
    const brazos = new Map<number, number>();
    for (const k of agua)
      for (const c of cruces.extremos.get(k) ?? []) {
        if (c === BORDE || cortados.some(([p, q]) => p === k && q === c)) continue;
        brazos.set(c, (brazos.get(c) ?? 0) + 1);
      }
    if ([...brazos.values()].some((n) => n > 2)) return false;
    // Y los demás brazos de sus cruces tienen que poder ir sin agua: una pareja
    // que solo admite agua la llevaría igual (s40, (3,11)).
    for (const [k, ext] of cruces.extremos)
      if (!agua.has(k) && ext.some((c) => brazos.has(c)) && e.otraBarrera(k) === null) return false;
    return true;
  };

  const L0 = (k: number): number => orillaBaja(k);
  /** Si el agua pasa de la pareja `a` a la `b` por un mismo punto triple del cruce `c`. */
  const seSigue = (a: number, b: number, c: number): boolean => {
    const juntas = new Set([...regionesDe(a), ...regionesDe(b)]);
    return (cruces.trozos[c] ?? []).some((t) => [...juntas].every((r) => t.has(r)));
  };
  const buscar = (parejas: number[], cruzados: number[], salida: number, L: number): void => {
    const n = parejas.length;
    if (n >= 2) {
      const ultima = parejas[n - 1] as number;
      if (salida === BORDE) {
        const clave = [...parejas].sort((a, b) => a - b).join(',');
        if (!vistas.has(clave) && sinTercerBrazo(parejas, BORDE)) {
          vistas.add(clave);
          const largo = parejas.reduce((s, k) => s + e.fino(k), 0);
          cadenas.push({ parejas: [...parejas], cabecera: BORDE, peso: 2 * largo * largo * largo });
        }
      } else if (
        regionesDelCruceDesde(salida, L) &&
        !cruzados.includes(salida) &&
        // Ni la cabecera reflejada en el río: su corte partiría el río por en
        // medio (s22, una cadena que se reflejaba en sí misma).
        !parejas.includes(e.claveEspejo(ultima)) &&
        cruces.espejo[salida] !== -1 &&
        cruces.espejo[salida] !== salida &&
        e.otraBarrera(ultima) !== null &&
        e.otraBarrera(e.claveEspejo(ultima)) !== null &&
        sitioDe(ultima) !== null &&
        sinTercerBrazo(parejas, salida)
      ) {
        const largo = parejas.reduce((s, k) => s + e.fino(k), 0);
        cadenas.push({ parejas: [...parejas], cabecera: salida, peso: largo * largo * largo });
      }
    }
    if (salida === BORDE || n >= PAREJAS_MAXIMAS_DEL_RIO) return;
    if (cruzados.includes(salida) || !regionesDelCruceDesde(salida, L)) return;
    const anterior = parejas[n - 1] as number;
    for (const k of porCruce.get(salida) ?? []) {
      if (parejas.includes(k) || L0(k) !== L || !seSigue(anterior, k, salida)) continue;
      const siguiente = otroExtremo(k, salida);
      parejas.push(k);
      cruzados.push(salida);
      buscar(parejas, cruzados, siguiente, L);
      parejas.pop();
      cruzados.pop();
    }
  };
  for (const k of cruces.parejas) {
    if (!candidata(k) || !cruces.extremos.get(k)!.includes(BORDE)) continue;
    buscar([k], [], otroExtremo(k, BORDE), L0(k));
  }
  const aguaDe = (parejas: readonly number[]): Set<number> =>
    new Set(parejas.flatMap((k) => [k, e.claveEspejo(k)]));
  const validas = cadenas.filter((c) => cabe(aguaDe(c.parejas)));
  if (validas.length === 0) return null;

  // El sorteo, por peso; y con la cadena elegida, sus lagos y su corte.
  const total = validas.reduce((s, c) => s + c.peso, 0);
  let tirada = rng.int(0, total - 1);
  let elegida = validas[0] as Cadena;
  for (const c of validas) {
    if (tirada < c.peso) {
      elegida = c;
      break;
    }
    tirada -= c.peso;
  }
  const { parejas, cabecera } = elegida;
  const agua = aguaDe(parejas);
  const ultima = parejas[parejas.length - 1] as number;
  const lagos: { centro: number; pareja: number }[] = [];
  const conLago = new Set<number>();
  const ponerLago = (k: number): void => {
    const s = sitioDe(k);
    if (s === null || conLago.has(k)) return;
    conLago.add(k);
    lagos.push({ centro: s.centro, pareja: k });
    const espejo = N - 1 - s.centro;
    const ke = e.claveEspejo(k);
    if (espejo !== s.centro && cruces.muroDe.get(ke)?.includes(espejo)) {
      conLago.add(ke);
      lagos.push({ centro: espejo, pareja: ke });
    }
  };
  if (cabecera !== BORDE) ponerLago(ultima);
  const porSitio = parejas
    .filter((k) => sitioDe(k) !== null)
    .sort((a, b) => sitioDe(b)!.lejos - sitioDe(a)!.lejos);
  for (const k of porSitio) {
    if (lagos.filter((l) => parejas.includes(l.pareja)).length >= LAGOS_POR_RIO) break;
    ponerLago(k);
  }

  const corte = new Map<number, Barrera>();
  const cabeceras: { pareja: number; cruce: number }[] = [];
  if (cabecera !== BORDE) {
    const ke = e.claveEspejo(ultima);
    const cabeceraEspejo = cruces.espejo[cabecera] as number;
    const junta = cruces.extremos.get(ultima)!.find((c) => c !== cabecera) as number;
    const juntaEspejo = cruces.extremos.get(ke)?.find((c) => c !== cabeceraEspejo);
    const lago = lagos.find((l) => l.pareja === ultima);
    const lagoEspejo = lagos.find((l) => l.pareja === ke);
    if (lago === undefined || lagoEspejo === undefined || juntaEspejo === undefined) return null;
    const lado = corteDe(ultima, lago.centro, cabecera, junta);
    const ladoEspejo = corteDe(ke, lagoEspejo.centro, cabeceraEspejo, juntaEspejo);
    if (lado === null || ladoEspejo === null) return null;
    for (const i of lado) corte.set(i, e.otraBarrera(ultima)!);
    for (const i of ladoEspejo) corte.set(i, e.otraBarrera(ke)!);
    cabeceras.push({ pareja: ultima, cruce: cabecera }, { pareja: ke, cruce: cabeceraEspejo });
  }
  return { parejas, agua, deBordeABorde: cabecera === BORDE, lagos, corte, cabeceras };
}

export interface EntradaDeLagos {
  readonly W: number;
  readonly H: number;
  /** La celda de cada casilla. */
  readonly etiqueta: Int32Array;
  readonly muro: Uint8Array;
  readonly tipos: Int8Array;
  readonly pasillo: Uint8Array;
  readonly nodos: readonly number[];
  readonly semillas: readonly { readonly x: number; readonly y: number }[];
  readonly regiones: number;
  /** La moneda de cada casilla (en espejo): el anillo del lago va donde cae a favor. */
  readonly ruido: (i: number) => boolean;
  /** El índice de `water` en `BARRERAS`. */
  readonly agua: number;
  /** Lo que vale `ABIERTA` en `tipos`. */
  readonly abierta: number;
}

/**
 * Pinta los lagos del río (`Rio.lagos`): el disco de `R_LAGO` alrededor de su
 * centro, y el anillo de uno más donde la moneda de la casilla cae a favor,
 * para que el borde no salga redondo. Fuera quedan los pasillos, los nodos, lo
 * que está a dos o menos de un nodo y lo que está a dos o menos de una región
 * que no es de su pareja: el lago solo toca sus dos orillas.
 *
 * **No parte una región**: si con el lago algo de una de sus dos regiones deja
 * de alcanzarse desde su semilla, el lago entero (y su espejo) no se pone.
 * Devuelve la máscara de lo pintado, y los centros que no se pudieron poner.
 */
export function ponerLagos(
  e: EntradaDeLagos,
  lagos: readonly { readonly centro: number; readonly pareja: number }[],
): { lago: Uint8Array; sinSitio: number[] } {
  const { W, H, etiqueta, muro, tipos, pasillo, nodos } = e;
  const N = W * H;
  const lago = new Uint8Array(N);
  const sinSitio: number[] = [];
  const cerca = new Uint8Array(N);
  for (const n of nodos) {
    const x = n % W;
    const y = (n - x) / W;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H)
          cerca[(y + dy) * W + x + dx] = 1;
  }
  const esSemilla = new Set(e.semillas.map((s) => s.y * W + s.x));
  const esNodo = new Uint8Array(N);
  for (const n of nodos) esNodo[n] = 1;
  const casillasDe = (centro: number, pareja: number): number[] => {
    const a = Math.floor(pareja / e.regiones);
    const b = pareja % e.regiones;
    const cx = centro % W;
    const cy = (centro - cx) / W;
    const fuera: number[] = [];
    const r = R_LAGO + 1;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const d = dx * dx + dy * dy;
        const i = y * W + x;
        if (d > r * r + 1 || (d > R_LAGO * R_LAGO + 1 && !e.ruido(i))) continue;
        if (pasillo[i] === 1 || cerca[i] === 1 || esSemilla.has(i)) continue;
        let ajena = false;
        for (let qy = Math.max(0, y - 2); qy <= Math.min(H - 1, y + 2) && !ajena; qy++)
          for (let qx = Math.max(0, x - 2); qx <= Math.min(W - 1, x + 2); qx++) {
            const q = qy * W + qx;
            const t = etiqueta[q] as number;
            if (muro[q] === 0 && t !== a && t !== b) {
              ajena = true;
              break;
            }
          }
        if (!ajena) fuera.push(i);
      }
    return fuera;
  };
  /** Lo de la región `r` que se alcanza desde su semilla, sin pisar `sin`. */
  const alcanzable = (r: number, sin: ReadonlySet<number>): Set<number> => {
    const s = e.semillas[r]!;
    const inicio = s.y * W + s.x;
    if (tipos[inicio] !== e.abierta || sin.has(inicio)) return new Set();
    const visto = new Uint8Array(N);
    visto[inicio] = 1;
    return new Set(
      rellenar(W, H, inicio, (j) => {
        if (visto[j] === 1 || sin.has(j) || tipos[j] !== e.abierta || etiqueta[j] !== r)
          return false;
        if (esNodo[j] === 1) return false;
        visto[j] = 1;
        return true;
      }),
    );
  };
  // Un lago y su espejo van juntos: se prueban de dos en dos por la pareja
  // reflejada, en el orden de la lista.
  const hechos = new Set<number>();
  for (const [k, l] of lagos.entries()) {
    if (hechos.has(k)) continue;
    const grupo = [k];
    const espejo = lagos.findIndex(
      (o, j) => j !== k && !hechos.has(j) && o.centro === N - 1 - l.centro,
    );
    if (espejo !== -1) grupo.push(espejo);
    for (const j of grupo) hechos.add(j);
    const pintar = new Set<number>();
    for (const j of grupo) {
      // Solo lo unido a su centro, por el lago o por la frontera: un trozo del
      // anillo con lo de dentro fuera (un pasillo, un nodo cerca) quedaba suelto
      // en la región, un obstáculo de más (s112: la región 6 al 19 %).
      const suyas = new Set(casillasDe(lagos[j]!.centro, lagos[j]!.pareja));
      const centro = lagos[j]!.centro;
      const visto = new Set([centro]);
      rellenar(W, H, centro, (q) => {
        if (visto.has(q) || !(suyas.has(q) || tipos[q] !== e.abierta)) return false;
        visto.add(q);
        return true;
      });
      for (const i of suyas) if (visto.has(i)) pintar.add(i);
    }
    const tocadas = new Set<number>();
    for (const j of grupo) {
      tocadas.add(Math.floor(lagos[j]!.pareja / e.regiones));
      tocadas.add(lagos[j]!.pareja % e.regiones);
    }
    const parte = [...tocadas].some((r) => {
      const antes = alcanzable(r, new Set());
      const comidas = [...pintar].filter((i) => antes.has(i)).length;
      return alcanzable(r, pintar).size < antes.size - comidas;
    });
    if (parte) {
      for (const j of grupo) sinSitio.push(lagos[j]!.centro);
      continue;
    }
    for (const i of pintar) {
      tipos[i] = e.agua;
      lago[i] = 1;
    }
  }
  return { lago, sinSitio };
}
