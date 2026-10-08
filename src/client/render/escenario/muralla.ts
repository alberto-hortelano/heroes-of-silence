/**
 * La muralla de una franja de muro: por dónde va su lienzo, dónde lleva torres y
 * cuánto de lo pintado no se lee como barrera (#183).
 *
 * La auditoría 3 vio murallas a trozos: el 66 % de las casillas de muro sin una
 * pieza cerca, puertas solas en el llano y columnas de torres donde el muro va
 * de norte a sur, con el guardia a 0 porque contaba el esqueleto y no lo que se
 * pintaba. Aquí la línea pasa por la puerta (`esqueleto` con la puerta fija),
 * llega a la barrera vecina o al borde del mapa, y el guardia mira los tramos
 * que de verdad entraron en la escena.
 *
 * Es puro: casillas entran y casillas salen.
 */
import { componentesDePasos, type Esqueleto, esqueleto, type Paso } from './esqueleto.js';

type Casilla = readonly [number, number];

const clave = ([x, y]: Casilla) => `${x},${y}`;

/** Las ocho vecinas, en el orden de la rejilla: el de los alargues, que casan con la barrera. */
const VECINAS: readonly Casilla[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/**
 * Las mismas, primero en cruz: entre dos caminos igual de cortos, el recto. Es
 * el orden del espolón que cose un trozo a la línea, que en diagonal salía en
 * uve (s1 (13,4)-(14,3)-(15,4)). En los alargues no: allí doblaba los muros
 * paralelos de 1-40 (de 8 a 18).
 */
const EN_CRUZ_PRIMERO: readonly Casilla[] = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/**
 * El camino más corto por `dentro` (8-vecinas) de `desde` a la primera casilla
 * que cumple `meta`, sin pasar por `evitar`, de como mucho `maximo` pasos; null
 * si no la hay. Va de `desde` a la meta, las dos incluidas.
 */
function caminoHasta(
  desde: Casilla,
  meta: (c: Casilla) => boolean,
  dentro: ReadonlySet<string>,
  evitar: ReadonlySet<string>,
  maximo: number,
  vecinas: readonly Casilla[] = VECINAS,
): Casilla[] | null {
  const previo = new Map<string, Casilla | null>([[clave(desde), null]]);
  let frente: Casilla[] = [desde];
  for (let d = 0; d < maximo && frente.length > 0; d++) {
    const siguiente: Casilla[] = [];
    for (const [x, y] of frente)
      for (const [dx, dy] of vecinas) {
        const v: Casilla = [x + dx, y + dy];
        const kv = clave(v);
        if (previo.has(kv) || !dentro.has(kv)) continue;
        previo.set(kv, [x, y]);
        if (meta(v)) {
          const camino: Casilla[] = [v];
          for (let p = previo.get(kv) ?? null; p !== null; p = previo.get(clave(p)) ?? null)
            camino.unshift(p);
          return camino;
        }
        if (!evitar.has(kv)) siguiente.push(v);
      }
    frente = siguiente;
  }
  return null;
}

/**
 * Un cuadrado de 2×2 se adelgaza a nada (Zhang-Suen borra las cuatro a la vez):
 * sin línea no había ni una torre, y la mancha se quedaba en escombro (s25).
 */
function conAlgo(e: Esqueleto, casillas: readonly Casilla[]): Esqueleto {
  const primera = casillas[0];
  return e.casillas.length > 0 || primera === undefined ? e : { ...e, casillas: [primera] };
}

/** El paso de `p` a `q`, vecinas, en el orden del esqueleto: de norte a sur y de oeste a este. */
const pasoEntre = (p: Casilla, q: Casilla): Paso =>
  p[1] < q[1] || (p[1] === q[1] && p[0] < q[0]) ? { a: p, b: q } : { a: q, b: p };

/** Hasta cuántos pasos se alarga un extremo de la línea para llegar a la barrera vecina. */
const ALARGUE_MAXIMO = 3;

/**
 * Lo más lejos de la línea que puede quedar una casilla de su franja: la de al
 * lado, también en diagonal, es su pie. Lo mismo mide el guardia
 * (`RADIO_DE_MURALLA`).
 */
export const RADIO_DE_MURALLA = 1.42;

/**
 * La línea de una franja de muro: su esqueleto con las puertas dentro y fijas,
 * y cada extremo suelto alargado por la franja hasta la casilla más cercana que
 * toca lo de fuera (`tocaFuera`: otra barrera o el borde del mapa). Adelgazar
 * come una casilla de cada punta, y la muralla se quedaba a una del acantilado
 * en el que tenía que apoyarse: por ese hueco se leía que se podía rodear.
 *
 * Donde la franja engorda (una mancha de 4×4 junto a una base, s33), una línea
 * sola deja casillas a dos o más de ella, que se leían como un llano: lo que
 * queda lejos se adelgaza otra vez y se cose a la línea, un lienzo más.
 */
export function trazaDeMuralla(
  casillas: readonly Casilla[],
  puertas: readonly Casilla[],
  tocaFuera: (x: number, y: number) => boolean,
): Esqueleto {
  const e = conAlgo(esqueleto(casillas, puertas), casillas);
  const dentro = new Set(casillas.map(clave));
  const esPuerta = new Set(puertas.map(clave));
  const pasos: Paso[] = [...e.pasos];
  const linea: Casilla[] = [...e.casillas];
  const enLinea = new Set(linea.map(clave));
  const coser = (camino: readonly Casilla[]) => {
    for (let k = 1; k < camino.length; k++) {
      const p = camino[k - 1] as Casilla;
      const q = camino[k] as Casilla;
      pasos.push(pasoEntre(p, q));
      for (const c of [p, q])
        if (!enLinea.has(clave(c))) {
          enLinea.add(clave(c));
          linea.push(c);
        }
    }
  };
  const grado = new Map<string, number>();
  for (const p of e.pasos)
    for (const c of [p.a, p.b]) grado.set(clave(c), (grado.get(clave(c)) ?? 0) + 1);
  for (const c of e.casillas) {
    const k = clave(c);
    if (esPuerta.has(k) || (grado.get(k) ?? 0) > 1 || tocaFuera(c[0], c[1])) continue;
    const camino = caminoHasta(c, (v) => tocaFuera(v[0], v[1]), dentro, enLinea, ALARGUE_MAXIMO);
    if (camino !== null) coser(camino);
  }
  for (let ronda = 0; ronda < 3; ronda++) {
    const lejos = casillas.filter(
      (c) => !linea.some((l) => Math.hypot(l[0] - c[0], l[1] - c[1]) <= RADIO_DE_MURALLA),
    );
    if (lejos.length === 0) break;
    const otra = conAlgo(esqueleto(lejos), lejos);
    const suyas = new Set(otra.casillas.map(clave));
    for (const p of otra.pasos) pasos.push(p);
    for (const c of otra.casillas) {
      enLinea.add(clave(c));
      linea.push(c);
    }
    // Cada trozo nuevo, cosido a lo que ya había por el camino más corto
    // hasta la casilla de la línea más cercana a él, en el medio de la línea
    // antes que en una punta. Cosido a la primera que encontraba la búsqueda,
    // en una franja en escalera de 3-4 casillas iba a la punta de la línea por
    // el borde de la franja y quedaban dos muros paralelos a dos casillas
    // (s1 (13-15, 2-5), s33 (2-6, 10-12)); hacia la más cercana es un
    // espolón que sale de la muralla.
    const grado = (c: Casilla) =>
      pasos.filter((p) => clave(p.a) === clave(c) || clave(p.b) === clave(c)).length;
    const cosidas = new Set<string>();
    for (const c of otra.casillas) {
      if (cosidas.has(clave(c))) continue;
      const trozo = new Set([clave(c)]);
      for (let cambio = true; cambio; ) {
        cambio = false;
        for (const p of otra.pasos)
          if (trozo.has(clave(p.a)) !== trozo.has(clave(p.b))) {
            trozo.add(clave(p.a));
            trozo.add(clave(p.b));
            cambio = true;
          }
      }
      for (const k of trozo) cosidas.add(k);
      const antes = linea.filter((v) => !trozo.has(clave(v)) && !suyas.has(clave(v)));
      let mejor: { desde: Casilla; hasta: Casilla; d: number; g: number } | undefined;
      for (const u of otra.casillas) {
        if (!trozo.has(clave(u))) continue;
        for (const v of antes) {
          const d = Math.hypot(u[0] - v[0], u[1] - v[1]);
          if (mejor !== undefined && d > mejor.d + 1e-9) continue;
          const g = grado(v);
          if (mejor === undefined || d < mejor.d - 1e-9 || g > mejor.g)
            mejor = { desde: u, hasta: v, d, g };
        }
      }
      if (mejor === undefined) continue;
      const hasta = clave(mejor.hasta);
      const camino = caminoHasta(
        mejor.desde,
        (v) => clave(v) === hasta,
        dentro,
        new Set(),
        casillas.length,
        EN_CRUZ_PRIMERO,
      );
      if (camino !== null) coser(camino);
    }
  }
  return { casillas: linea, pasos, juntas: e.juntas };
}

/** Lo que separa dos torres, en casillas: menos y se leían como una torre alta (#183). */
export const ENTRE_TORRES = 3;

/**
 * Dónde lleva torre la línea: en sus puntas, donde se ramifica y donde gira 90°
 * o más, y en lo recto cada `ENTRE_TORRES`; nunca a menos de eso de otra torre ni
 * en las casillas de alrededor de una puerta, que lleva las suyas. Antes iba una
 * en cada junta del esqueleto y otra cada tres casillas en el orden de la
 * rejilla, y donde el muro va de norte a sur, con un quiebro en cada casilla, se
 * apilaban en una columna que se leía como una sola torre alta (s9 (8,28-30)).
 */
export function torresDe(e: Esqueleto, puertas: readonly Casilla[]): Casilla[] {
  const vecinas = new Map<string, Casilla[]>();
  for (const p of e.pasos) {
    vecinas.set(clave(p.a), [...(vecinas.get(clave(p.a)) ?? []), p.b]);
    vecinas.set(clave(p.b), [...(vecinas.get(clave(p.b)) ?? []), p.a]);
  }
  const esPuerta = new Set(puertas.map(clave));
  const prioridad = (c: Casilla): number => {
    const v = vecinas.get(clave(c)) ?? [];
    if (v.length !== 2) return 0;
    const [p, q] = v as [Casilla, Casilla];
    const giro = (p[0] - c[0]) * (q[0] - c[0]) + (p[1] - c[1]) * (q[1] - c[1]);
    return giro >= 0 ? 1 : 2;
  };
  const candidatas = e.casillas
    .filter((c) => !esPuerta.has(clave(c)))
    .map((c, orden) => ({ c, orden, prioridad: prioridad(c) }))
    .sort((p, q) => p.prioridad - q.prioridad || p.orden - q.orden);
  const torres: Casilla[] = [];
  for (const { c } of candidatas) {
    if (puertas.some((p) => Math.max(Math.abs(p[0] - c[0]), Math.abs(p[1] - c[1])) <= 1)) continue;
    if (torres.some((t) => Math.hypot(t[0] - c[0], t[1] - c[1]) < ENTRE_TORRES)) continue;
    torres.push(c);
  }
  return torres;
}

/** Un tramo de muralla que entró en la escena, de centro a centro de casilla; una torre, `a` = `b`. */
export interface TramoPintado {
  readonly franja: number;
  readonly a: Casilla;
  readonly b: Casilla;
}

/** Una puerta de muralla: su casilla y la dirección de su paso (`ejeDelPaso`). */
export interface PuertaDeMuralla {
  readonly id: string;
  readonly at: Casilla;
  /** Hacia dónde se cruza, como vector; los muros quedan a sus dos lados. */
  readonly paso: Casilla;
}

/** Distancia del punto `p` al segmento `a`-`b`. */
function distancia(p: readonly [number, number], a: Casilla, b: Casilla): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  const t = l === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Lo que de la muralla no se lee como barrera, contado sobre lo PINTADO (los
 * tramos y torres que entraron en la escena), no sobre el esqueleto:
 *
 * - `sinMuralla`: casillas de muro sin un tramo a `RADIO_DE_MURALLA`;
 * - `puertasSueltas`: puertas con muro a un lado de su paso y ningún tramo que
 *   salga de ellas hacia ese lado;
 * - `huecos`: trozos de más en que queda partida la línea pintada de una franja.
 */
export function murallaSinLeer(
  franjas: readonly { readonly id: number; readonly casillas: readonly Casilla[] }[],
  puertas: readonly PuertaDeMuralla[],
  esMuro: (x: number, y: number) => boolean,
  pintados: readonly TramoPintado[],
  huellas: readonly (readonly Casilla[])[] = [],
): { sinMuralla: Casilla[]; puertasSueltas: string[]; huecos: number } {
  const sinMuralla = franjas.flatMap((f) =>
    f.casillas.filter((c) => !pintados.some((t) => distancia(c, t.a, t.b) <= RADIO_DE_MURALLA)),
  );
  const puertasSueltas = puertas
    .filter((p) => {
      const lado = (c: Casilla) =>
        Math.sign(p.paso[0] * (c[1] - p.at[1]) - p.paso[1] * (c[0] - p.at[0]));
      const lados = new Set<number>();
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const c: Casilla = [p.at[0] + dx, p.at[1] + dy];
          if (esMuro(c[0], c[1]) && lado(c) !== 0) lados.add(lado(c));
        }
      const cubiertos = new Set(
        pintados.flatMap((t) =>
          clave(t.a) === clave(p.at) ? [lado(t.b)] : clave(t.b) === clave(p.at) ? [lado(t.a)] : [],
        ),
      );
      return [...lados].some((l) => !cubiertos.has(l));
    })
    .map((p) => p.id);
  // Lo que tapa la huella de una ciudad o un pueblo une lo que llega a ella: la
  // muralla de su pieza sigue el lienzo.
  const pegados = (t: TramoPintado) =>
    huellas.flatMap((h, k) =>
      [t.a, t.b].some((c) =>
        h.some((u) => Math.max(Math.abs(u[0] - c[0]), Math.abs(u[1] - c[1])) <= 1),
      )
        ? [k]
        : [],
    );
  let huecos = 0;
  for (const f of franjas) {
    const suyos = pintados.filter((t) => t.franja === f.id);
    if (suyos.length === 0) continue;
    const pasos = suyos.flatMap((t) => [
      { a: t.a, b: t.b },
      ...pegados(t).map((k): { a: Casilla; b: Casilla } => ({ a: t.a, b: [-1 - k, -1] })),
    ]);
    const casillas = [
      ...new Map(pasos.flatMap((p) => [p.a, p.b]).map((c) => [clave(c), c])).values(),
    ];
    const trozos = componentesDePasos(casillas, pasos);
    huecos += trozos - 1;
  }
  return { sinMuralla, puertasSueltas, huecos };
}
