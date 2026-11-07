/**
 * Las sendas en el recinto de una ciudad: la que lo roza sin entrar, corrida fuera de
 * sus torres y su muro (`sendasSinRoces`); la que entra, llevada por el arco de la
 * puerta de su cruce y sacada recta por su normal (`tendidosDeLasPuertas`,
 * `pasoPorElArco`, que lleva luego `sendasPorLosTendidos` en `celdas.ts`); y la traza
 * de la marcha y de la ruta por los arcos (`trazaPorLosArcos`).
 */
import { LADO_DEL_RECINTO, PUERTAS_DE_LA_CIUDAD } from '@core/map/recinto.js';
import type { TendidoDeSenda } from '../celdas.js';
import { SEMIANCHO_DE_LA_HUELLA, type Senda } from '../sendas.js';
import {
  type Cara,
  type CaraDelContorno,
  type Contorno,
  dentroDeLaCara,
  dentroDelContorno,
  type Par,
  puntoDelTramo,
  RADIO_DE_TORRE,
  type Rect,
  type Sitio,
} from './octogono.js';

/** Lo que la senda de una puerta vuelve a su trazo lejos de la muralla, por dentro. */
const LEJOS_DE_LA_MURALLA = 0.35;

/**
 * Y por fuera: más allá de la base de las torres de los vértices y de la media
 * anchura de la senda (0,31 + 0,16). Con 0,35, la que sale por el sur y tuerce
 * al oeste volvía a su trazo pasando por el pie de la torre de la esquina (s1 (5,8)).
 */
const FUERA_DE_LA_MURALLA = 0.8;

/** Lo que el tendido de una puerta entra en el recinto desde su cara: bajo la plaza. */
const DENTRO_DE_LA_PUERTA = 0.3;

/**
 * Lo que la senda sale recta del arco por su normal antes de volver a su trazo,
 * por cara: lo que el anillo tapa por encima de ella. Al norte el torreón y las
 * torres suben 1,12 en pantalla sobre lo que sale, y la senda tiene que verse
 * después; por los otros lados, lo que pide la senda que tuerce al salir para
 * no pasar por el pie de la torre de al lado (0,31 + 0,16 del vértice): con
 * 0,4, la del sur que torcía al oeste lo pisaba (s1 (5,8)).
 */
export const SALIDA_DE_LA_PUERTA: Readonly<Record<Cara, number>> = {
  n: 1.0,
  ne: 0.8,
  no: 0.8,
  e: 0.6,
  o: 0.6,
  se: 0.6,
  so: 0.6,
  s: 0.6,
};

/** Un recinto tal como lo miran sus sendas: su octógono, sus caras con puerta y, si es una ciudad-puente, la del río. */
export interface PuertasDeUnRecinto {
  readonly contorno: Contorno;
  readonly puertas: readonly Cara[];
  /** La cara del río de una ciudad-puente: por ella llega el puente, no una senda. */
  readonly rio?: Cara;
}

/** Un cruce de una senda con el octógono: dónde, en qué tramo (`i` a `i + 1`) y si sale. */
interface CruceEnBruto {
  readonly p: Par;
  readonly i: number;
  readonly sale: boolean;
}

/** Todos los cruces de la senda `l` con el octógono `c`, en su orden. */
function crucesEnBruto(c: Contorno, l: Senda): CruceEnBruto[] {
  const cruces: CruceEnBruto[] = [];
  for (let i = 0; i + 1 < l.length; i++) {
    const p = l[i] as Par;
    const q = l[i + 1] as Par;
    const dp = dentroDelContorno(c, p[0], p[1]);
    if (dp === dentroDelContorno(c, q[0], q[1])) continue;
    // El octógono es convexo: el cruce de un tramo es uno, y se busca a medias.
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 24; k++) {
      const t = (lo + hi) / 2;
      if (dentroDelContorno(c, p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t) === dp) lo = t;
      else hi = t;
    }
    const t = (lo + hi) / 2;
    cruces.push({ p: [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t], i, sale: dp });
  }
  return cruces;
}

/** Los puntos donde la senda `l` cruza el octógono `c`, cada uno en su tramo. */
export function crucesConElContorno(c: Contorno, l: Senda): Par[] {
  return crucesEnBruto(c, l).map((k) => k.p);
}

/** Cada cuánto lleva un punto la senda corrida de `sinRoces`, en casillas. */
const PASO_DE_LA_CUERDA = 0.1;

/**
 * Las sendas sin sus roces con cada recinto (`sinRoces`): la que pasa junto a
 * una ciudad sin ir a ella se queda fuera de sus torres. Lo de dentro no se
 * toca: el núcleo solo deja entrar un camino de un acceso a su puerta y de la
 * puerta a la ciudad (`problemasDeRecintos`), así que la senda ya va del arco al
 * centro. Hasta la vuelta 3 lo de dentro se hacía una cuerda, porque los
 * caminos entraban por cualquier casilla del 3 × 3.
 */
export function sendasSinRoces(
  sendas: readonly Senda[],
  contornos: readonly Contorno[],
  enElMapa: (x: number, y: number) => boolean = () => true,
): Senda[] {
  return sendas.map((origen) => {
    let l = origen;
    for (const c of contornos) {
      const [cx, cy] = c.centro;
      if (
        !l.some(
          ([x, y]) => Math.abs(x - cx) < LADO_DEL_RECINTO && Math.abs(y - cy) < LADO_DEL_RECINTO,
        )
      )
        continue;
      l = sinRoces(c, l, enElMapa);
    }
    return l;
  });
}

/** Lo que `(x, y)` queda por dentro del octógono: la menor de sus caras (negativo, fuera). */
const hondura = (c: Contorno, x: number, y: number) =>
  Math.min(...c.caras.map((k) => dentroDeLaCara(k, x, y)));

/**
 * Lo más que entra en un recinto la senda que pasa rozándolo, en casillas: la
 * que entra y sale sin pasar de aquí no va a la ciudad (s38 (11,20), el camino
 * del núcleo que pisa la casilla del medio de la fila de arriba del 3 × 3).
 */
export const ROCE_DEL_RECINTO = 0.6;

/**
 * Lo que la senda que roza un recinto queda de sus caras: la base de una torre
 * y media senda, y un poco más. Con medio muro, la senda pasaba por el pie de
 * las torres de los vértices y al apartarse de ellas se quebraba (s38 (11,20)).
 */
const FUERA_DEL_ROCE = RADIO_DE_TORRE + SEMIANCHO_DE_LA_HUELLA + 0.05;

/**
 * La senda `l` sin los roces con el octógono `c`: lo que entra y sale sin
 * pasar de `ROCE_DEL_RECINTO`, y lo de alrededor a menos de `FUERA_DEL_ROCE`,
 * se corre fuera de su cara más cercana hasta `FUERA_DEL_ROCE`. Con una cuerda,
 * la senda que pasaba por la ciudad sin ir a ella entraba por una puerta y
 * salía por la de al lado.
 *
 * También lo que pasa a menos de `FUERA_DEL_ROCE` sin entrar: el camino que
 * baja por la columna de al lado del 3 × 3 va a 0,52 del vértice, y con su
 * vaivén pisaba la torre de la esquina (s3 (4,35); s36 (19,37), por la rampa
 * de una bajada, que sigue a esta senda y luego no se aparta). Y entre dos
 * puntos corridos se ponen los de en medio, corridos igual: al pasar de una
 * cara a otra, los de dentro saltaban de la normal de una a la de la otra, y
 * la recta entre los dos cortaba la torre del vértice (s36 (16,38)).
 */
function sinRoces(c: Contorno, l: Senda, enElMapa: (x: number, y: number) => boolean): Senda {
  // La que acaba dentro va a la ciudad (las sendas se cortan en ella): no roza.
  const [p0, p1] = [l[0] as Par, l.at(-1) as Par];
  if (dentroDelContorno(c, p0[0], p0[1]) || dentroDelContorno(c, p1[0], p1[1])) return l;
  const cruces = crucesEnBruto(c, l);
  const correr = new Set<number>();
  for (let k = 0; k + 1 < cruces.length; k++) {
    const a = cruces[k] as CruceEnBruto;
    const b = cruces[k + 1] as CruceEnBruto;
    if (a.sale || !b.sale) continue;
    let honda = 0;
    for (let i = a.i + 1; i <= b.i; i++) honda = Math.max(honda, hondura(c, ...(l[i] as Par)));
    if (honda > ROCE_DEL_RECINTO) continue;
    for (let i = a.i; i >= 0 && hondura(c, ...(l[i] as Par)) > -FUERA_DEL_ROCE; i--) correr.add(i);
    for (let i = b.i + 1; i < l.length && hondura(c, ...(l[i] as Par)) > -FUERA_DEL_ROCE; i++)
      correr.add(i);
    for (let i = a.i + 1; i <= b.i; i++) correr.add(i);
  }
  // Lo que pasa cerca sin entrar: cada tramo seguido a menos de `FUERA_DEL_ROCE`
  // en el que ningún punto cae dentro.
  for (let i = 0; i < l.length; ) {
    if (hondura(c, ...(l[i] as Par)) <= -FUERA_DEL_ROCE) {
      i++;
      continue;
    }
    let j = i;
    let entra = false;
    for (; j < l.length && hondura(c, ...(l[j] as Par)) > -FUERA_DEL_ROCE; j++)
      if (dentroDelContorno(c, ...(l[j] as Par))) entra = true;
    if (!entra) for (let k = i; k < j; k++) correr.add(k);
    i = j;
  }
  if (correr.size === 0) return l;
  // Cada punto, a `FUERA_DEL_ROCE` del punto más cercano del octógono: por
  // fuera, en su dirección; por dentro, por la normal de esa cara.
  const fuera = (p: Par): Par => {
    let q: Par = p;
    let cara = c.caras[0] as CaraDelContorno;
    let d = Infinity;
    for (const k of c.caras) {
      const cerca = puntoDelTramo(p, k.a, k.b);
      const dk = Math.hypot(p[0] - cerca[0], p[1] - cerca[1]);
      if (dk < d) {
        d = dk;
        q = cerca;
        cara = k;
      }
    }
    const porFuera = !dentroDelContorno(c, p[0], p[1]) && d > 1e-6;
    if (porFuera && d >= FUERA_DEL_ROCE) return p;
    const [ux, uy] = porFuera ? [(p[0] - q[0]) / d, (p[1] - q[1]) / d] : cara.normal;
    return [q[0] + ux * FUERA_DEL_ROCE, q[1] + uy * FUERA_DEL_ROCE];
  };
  const corrida: Par[] = [];
  for (const [i, p] of l.entries()) {
    const quieto = !correr.has(i) || i === 0 || i === l.length - 1;
    const q = quieto ? p : fuera(p);
    const antes = corrida.at(-1);
    if (antes !== undefined && correr.has(i) && correr.has(i - 1)) {
      const n = Math.ceil(Math.hypot(q[0] - antes[0], q[1] - antes[1]) / PASO_DE_LA_CUERDA);
      for (let k = 1; k < n; k++)
        corrida.push(
          fuera([antes[0] + ((q[0] - antes[0]) * k) / n, antes[1] + ((q[1] - antes[1]) * k) / n]),
        );
    }
    corrida.push(q);
  }
  // Si así se sale del mapa (el recinto contra el borde, s26 (0,24)), se queda:
  // la cuerda la lleva por dos puertas.
  return corrida.every(([x, y]) => enElMapa(x, y)) ? corrida : l;
}

/** Un punto lejos del recinto, más allá de `p` desde su centro. */
function lejosDe(c: Contorno, [x, y]: Par): Par {
  const dx = x - c.centro[0];
  const dy = y - c.centro[1];
  const d = Math.hypot(dx, dy) || 1;
  return [x + (2 * LADO_DEL_RECINTO * dx) / d, y + (2 * LADO_DEL_RECINTO * dy) / d];
}

/** La cara con puerta más cercana al punto `(x, y)` del anillo, o undefined si no hay ninguna. */
export function puertaMasCercana(r: PuertasDeUnRecinto, [x, y]: Par): CaraDelContorno | undefined {
  let mejor: CaraDelContorno | undefined;
  let d = Infinity;
  for (const k of r.contorno.caras) {
    if (!r.puertas.includes(k.cara)) continue;
    const dk = Math.hypot(k.medio[0] - x, k.medio[1] - y);
    if (dk < d) {
      d = dk;
      mejor = k;
    }
  }
  return mejor;
}

/**
 * Lo más que el cruce de una senda con el octógono se aparta del medio de la
 * cara de su puerta para llevarla por su arco, en casillas. Un camino del núcleo
 * entra de un acceso a su puerta (`PUERTAS_DE_LA_CIUDAD`) y la senda cruza a
 * ≤ 0,1 del arco más lo que ondula; entre el medio de una cara y el de la de al
 * lado hay 1,13. Más lejos, la senda no es de esa puerta y se queda donde
 * cruza: la cuenta `sendasFueraDeLaPuerta`.
 */
export const CRUCE_DE_LA_PUERTA = 0.6;

/**
 * Lo que se prueba de la salida de una puerta (`SALIDA_DE_LA_PUERTA`) cuando
 * entera no acaba en lo que se pisa: la del noreste y la del noroeste salen a
 * la casilla de la esquina, que es uno de los tres accesos de su puerta y puede
 * ser barrera si el camino llega por otro.
 */
const PARTES_DE_LA_SALIDA = [1, 0.85, 0.7, 0.55] as const;

/**
 * La salida de la puerta cuando ni la más corta acaba en lo que se pisa: lo
 * justo para pasar el arco, y la senda vuelve a su trazo en seguida. La puerta
 * diagonal cuyo camino llega de lado, con el río delante de la esquina, salía
 * por encima del agua (s37 (39,23); y en la vuelta 3, s26 (40,17), la del
 * noroeste con el puente al norte).
 */
const SALIDA_SIN_SITIO = 0.2;

/**
 * La salida de la puerta `k` (`SALIDA_DE_LA_PUERTA`), entera o la más larga de
 * `PARTES_DE_LA_SALIDA` que acaba en lo que se pisa (`sePisa`); si ninguna,
 * `SALIDA_SIN_SITIO`.
 */
function salidaDe(k: CaraDelContorno, sePisa: (x: number, y: number) => boolean): number {
  const entera = SALIDA_DE_LA_PUERTA[k.cara];
  for (const parte of PARTES_DE_LA_SALIDA)
    if (
      sePisa(k.medio[0] + k.normal[0] * entera * parte, k.medio[1] + k.normal[1] * entera * parte)
    )
      return entera * parte;
  return SALIDA_SIN_SITIO;
}

/**
 * Por dónde pasa cada senda que cruza un recinto (`sendasPorLosTendidos`): por
 * el arco de la puerta del núcleo de su cruce (la más cercana, a
 * `CRUCE_DE_LA_PUERTA` como mucho), de `DENTRO_DE_LA_PUERTA` por dentro de la
 * cara a `SALIDA_DE_LA_PUERTA` por fuera, por su normal. Dos sendas de una
 * misma cara salen juntas por el arco y se abren en Y fuera de él; por dentro,
 * la plaza tapa cómo llegan al centro. La cara del río de una ciudad-puente no
 * lleva: el puente llega a su arco y la senda empieza en su estribo.
 */
export function tendidosDeLasPuertas(
  sendas: readonly Senda[],
  recintos: readonly PuertasDeUnRecinto[],
  sePisa: (x: number, y: number) => boolean = () => true,
): TendidoDeSenda[] {
  const fuera: TendidoDeSenda[] = [];
  for (const r of recintos)
    sendas.forEach((l, senda) => {
      for (const cruce of crucesConElContorno(r.contorno, l)) {
        const k = puertaMasCercana(r, cruce);
        if (k === undefined || k.cara === r.rio) continue;
        if (Math.hypot(k.medio[0] - cruce[0], k.medio[1] - cruce[1]) > CRUCE_DE_LA_PUERTA) continue;
        const paso = pasoPorElArco(k, sePisa);
        fuera.push({
          senda,
          cerca: cruce,
          p0: paso.dentro,
          p1: paso.fuera,
          t: k.normal,
          largo: paso.salida,
          // Hacia fuera por donde cruza: con `p1` de punto, la senda que llega
          // de lado a una puerta diagonal parecía ir hacia dentro.
          hacia: lejosDe(r.contorno, cruce),
          // Por dentro, lejos de la muralla (la plaza lo tapa); por fuera, ya
          // fuera de ella y de las esquinas que corta el octógono.
          vuelve: {
            antes: ([x, y]) => dentroDelContorno(r.contorno, x, y, LEJOS_DE_LA_MURALLA),
            despues: ([x, y]) => !dentroDelContorno(r.contorno, x, y, -FUERA_DE_LA_MURALLA),
          },
        });
      }
    });
  return fuera;
}

/**
 * El paso por el arco de la puerta de la cara `k`: de `dentro`
 * (`DENTRO_DE_LA_PUERTA` bajo la plaza) por `arco` (el medio de su cara) a
 * `fuera`, a `salida` por su normal (`salidaDe`). Lo que lleva la senda pintada
 * (`tendidosDeLasPuertas`) y lo que anda quien entra o sale (`trazaPorLosArcos`).
 */
export interface PasoPorElArco {
  readonly cara: Cara;
  readonly dentro: Par;
  readonly arco: Par;
  readonly fuera: Par;
  readonly salida: number;
}

export function pasoPorElArco(
  k: CaraDelContorno,
  sePisa: (x: number, y: number) => boolean,
): PasoPorElArco {
  const [nx, ny] = k.normal;
  const salida = salidaDe(k, sePisa);
  return {
    cara: k.cara,
    dentro: [k.medio[0] - nx * DENTRO_DE_LA_PUERTA, k.medio[1] - ny * DENTRO_DE_LA_PUERTA],
    arco: k.medio,
    fuera: [k.medio[0] + nx * salida, k.medio[1] + ny * salida],
    salida,
  };
}

/** Un recinto como lo mira quien anda de casilla en casilla: su 3 × 3 y el paso por el arco de cada puerta (sin la del río). */
export interface ArcosDeUnRecinto {
  readonly rect: Rect;
  readonly porElArco: readonly PasoPorElArco[];
}

/**
 * Un punto de la traza de quien va de casilla en casilla (`trazaPorLosArcos`):
 * dónde, en casillas, o `null` para el pie de su casilla, que pone quien la pinta
 * (la línea de la ruta, en su centro; el héroe, a sus pies); y de qué casilla
 * del camino es, por su índice.
 */
export interface PuntoDeLaTraza {
  readonly en: Par | null;
  readonly paso: number;
}

/**
 * Por dónde pasa quien anda las `casillas` (06-11-2026, QA de la marcha: al salir
 * de su ciudad, el héroe y la línea de la ruta iban en recta de la casilla de la
 * puerta al acceso y cruzaban la torre de la esquina): el pie de cada casilla,
 * salvo la de la puerta de un recinto que se cruza viniendo de la ciudad o de un
 * acceso de esa puerta (`PUERTAS_DE_LA_CIUDAD`) o yendo a ellos, que es su paso
 * por el arco (`pasoPorElArco`: el de la senda pintada). **La única regla** de los
 * dos, la marcha (`partida/mapa/escena.ts`) y la línea (`render/mapa/mapa.ts`). La
 * puerta del río de una ciudad-puente no lleva: su puente cruza de frente.
 */
export function trazaPorLosArcos(
  recintos: readonly ArcosDeUnRecinto[],
  casillas: readonly Sitio[],
): PuntoDeLaTraza[] {
  const igual = (a: Sitio, b: Sitio): boolean => a.x === b.x && a.y === b.y;
  const out: PuntoDeLaTraza[] = [];
  casillas.forEach((p, i) => {
    const puerta = puertaEnLaCasilla(recintos, p);
    if (puerta === null) {
      out.push({ en: null, paso: i });
      return;
    }
    const { ciudad, accesos, arco } = puerta;
    const lado = (q: Sitio | undefined): Par | null =>
      q === undefined
        ? null
        : igual(q, ciudad)
          ? arco.dentro
          : accesos.some((a) => igual(a, q))
            ? arco.fuera
            : null;
    const antes = lado(casillas[i - 1]);
    const despues = lado(casillas[i + 1]);
    if (antes === null && despues === null) {
      out.push({ en: null, paso: i });
      return;
    }
    out.push({ en: antes, paso: i }, { en: arco.arco, paso: i }, { en: despues, paso: i });
  });
  return out;
}

/** La puerta con arco cuya casilla es `p` (la de `PUERTAS_DE_LA_CIUDAD`), con su ciudad y sus accesos. */
function puertaEnLaCasilla(
  recintos: readonly ArcosDeUnRecinto[],
  p: Sitio,
): { ciudad: Sitio; accesos: readonly Sitio[]; arco: PasoPorElArco } | null {
  for (const r of recintos) {
    if (p.x < r.rect.i0 || p.x > r.rect.i1 || p.y < r.rect.j0 || p.y > r.rect.j1) continue;
    const ciudad = { x: (r.rect.i0 + r.rect.i1) / 2, y: (r.rect.j0 + r.rect.j1) / 2 };
    for (const arco of r.porElArco) {
      if (arco.cara === 'e' || arco.cara === 'o') continue;
      const { casilla, accesos } = PUERTAS_DE_LA_CIUDAD[arco.cara];
      if (p.x !== ciudad.x + casilla[0] || p.y !== ciudad.y + casilla[1]) continue;
      return {
        ciudad,
        accesos: accesos.map(([dx, dy]) => ({ x: ciudad.x + dx, y: ciudad.y + dy })),
        arco,
      };
    }
    return null;
  }
  return null;
}
