/**
 * Los guardias del recinto que cuenta el informe de `componer`: lo que pisa la base
 * del anillo (`anilloSobreLaSenda`, `puentesSobreElAnillo`), los huecos del anillo
 * (`huecosDelAnillo`), las sendas que cruzan el octógono lejos de una puerta
 * (`sendasFueraDeLaPuerta`), las puertas que no casan con los caminos del núcleo
 * (`puertasSinSuCamino`), los arcos que tapa una casa (`arcosTapados`) y las casas
 * repetidas juntas (`casasRepetidasJuntas`). Todos tienen que dar 0.
 */
import { LADO_DEL_RECINTO } from '@core/map/recinto.js';
import type { Senda } from '../sendas.js';
import { FONDO_DEL_ADARVE } from '../tirada.js';
import {
  type CasaQueTapa,
  DE_DETRAS,
  type PiezaDelRecinto,
  type Recinto,
  tapaElArco,
  vanoDelArco,
} from './anillo.js';
import {
  type Cara,
  type CaraDelContorno,
  type Contorno,
  caraDelContorno,
  dentroDeLaCara,
  dentroDelContorno,
  EJE_DE_LA_CARA,
  enLaPlaza,
  GRUESO_DEL_MURO,
  LUZ_DEL_ARCO,
  type Par,
  type PuertasDelNucleo,
  puntoDelTramo,
  RADIO_DE_TORRE,
} from './octogono.js';
import { crucesConElContorno, type PuertasDeUnRecinto, puertaMasCercana } from './sendas.js';

/** Un arco tal como lo pinta la escena: su cara y su clave del pintor (`claveDe`). */
export interface ArcoPintado {
  readonly cara: Cara;
  readonly clave: number;
}

/**
 * Las casas que tapan el vano del arco de una puerta del recinto de `contorno`
 * (`tapaElArco`), cada una dicha: es `informe.arcosTapados`, «ninguna casa tapa
 * un arco», y tiene que estar vacío.
 */
export function arcosTapados(
  contorno: Contorno,
  arcos: readonly ArcoPintado[],
  casas: readonly (CasaQueTapa & Pick<PiezaDelRecinto, 'nombre'>)[],
): string[] {
  const tapados: string[] = [];
  for (const a of arcos) {
    const vano = vanoDelArco(caraDelContorno(contorno, a.cara));
    for (const casa of casas)
      if (tapaElArco(vano, a.clave, casa))
        tapados.push(
          `la casa «${casa.nombre}» en ${casa.x.toFixed(2)},${casa.y.toFixed(2)} tapa el arco de la puerta ${NOMBRE_DE_LA_CARA[a.cara]}`,
        );
  }
  return tapados;
}

/** Lo que el cruce de una senda con el anillo puede apartarse del medio del arco: media luz y la holgura de las rampas. */
export const HOLGURA_DEL_ARCO = LUZ_DEL_ARCO / 2 + 0.06;

/**
 * Los cruces de las sendas pintadas con el octógono de un recinto que no caen en
 * el arco de una de sus puertas (a `HOLGURA_DEL_ARCO` de su medio), cada uno
 * dicho: es `informe.sendaFueraDeLaPuerta`, «ninguna abertura más ancha que su
 * puerta», y tiene que estar vacío.
 */
export function sendasFueraDeLaPuerta(
  sendas: readonly Senda[],
  recintos: readonly (PuertasDeUnRecinto & { readonly id: string })[],
): string[] {
  const fuera: string[] = [];
  for (const r of recintos) {
    const [cx, cy] = r.contorno.centro;
    // Las sendas que pasan lejos ni se miran: el octógono cabe en este radio.
    const lejos = LADO_DEL_RECINTO;
    for (const l of sendas) {
      if (!l.some(([x, y]) => Math.abs(x - cx) < lejos && Math.abs(y - cy) < lejos)) continue;
      for (const cruce of crucesConElContorno(r.contorno, l)) {
        const k = puertaMasCercana(r, cruce);
        if (
          k !== undefined &&
          Math.hypot(k.medio[0] - cruce[0], k.medio[1] - cruce[1]) <= HOLGURA_DEL_ARCO
        )
          continue;
        fuera.push(
          `${r.id}: la senda cruza la muralla en ${cruce[0].toFixed(2)},${cruce[1].toFixed(2)}, fuera del arco de una puerta`,
        );
      }
    }
  }
  return fuera;
}

/**
 * Lo que el estribo de un puente de ciudad-puente puede quedar del medio de la
 * cara del río para que se tenga por su camino: el redondeo de su pie
 * (`puenteDeLaCiudad` lo pone en el medio).
 */
const PUENTE_EN_SU_ARCO = 0.05;

/** Cómo se dice cada cara de un recinto, para la persona. */
const NOMBRE_DE_LA_CARA: Readonly<Record<Cara, string>> = {
  n: 'del norte',
  ne: 'del noreste',
  e: 'del este',
  se: 'del sureste',
  s: 'del sur',
  so: 'del suroeste',
  o: 'del oeste',
  no: 'del noroeste',
};

/** Un recinto tal como lo mira `puertasSinSuCamino`: lo pintado y lo del núcleo. */
export interface PuertasPintadas {
  readonly id: string;
  readonly contorno: Contorno;
  /** Las caras de las puertas que se pintaron (`Recinto.arcos`). */
  readonly pintadas: readonly Cara[];
  /** Las del núcleo, otra vez de los caminos (`puertasDelNucleo`). */
  readonly delNucleo: PuertasDelNucleo;
}

/**
 * Las puertas de los recintos que no casan con los caminos del núcleo, cada una
 * dicha: una puerta pintada que el núcleo no tiene (sin camino que llegue), una
 * del núcleo que no se pinta, una pintada por cuyo arco (a `HOLGURA_DEL_ARCO`
 * de su medio) no cruza ninguna senda y la del río a la que no llega el estribo
 * de ningún puente. Es `informe.puertaSinCamino`, y tiene que estar vacío: hay
 * puerta donde llega un camino, y solo ahí (decisión del usuario, 21-10-2026).
 * Con `sendasFueraDeLaPuerta`, que ninguna senda cruce la muralla fuera de un
 * arco, las puertas pintadas son las del juego en los dos sentidos.
 */
export function puertasSinSuCamino(
  recintos: readonly PuertasPintadas[],
  sendas: readonly Senda[],
  puentes: readonly { readonly extremos: readonly [Par, Par] }[],
): string[] {
  const fuera: string[] = [];
  for (const r of recintos) {
    const { puertas, rio } = r.delNucleo;
    for (const k of r.pintadas)
      if (!puertas.includes(k))
        fuera.push(
          `${r.id}: la puerta ${NOMBRE_DE_LA_CARA[k]} se pinta y ningún camino llega a ella`,
        );
    for (const k of puertas)
      if (!r.pintadas.includes(k))
        fuera.push(`${r.id}: un camino llega a la puerta ${NOMBRE_DE_LA_CARA[k]} y no se pinta`);
    const [cx, cy] = r.contorno.centro;
    const cerca = sendas.filter((l) =>
      l.some(
        ([x, y]) => Math.abs(x - cx) < LADO_DEL_RECINTO && Math.abs(y - cy) < LADO_DEL_RECINTO,
      ),
    );
    for (const k of r.contorno.caras) {
      if (!r.pintadas.includes(k.cara)) continue;
      const enElArco = (p: Par) =>
        Math.hypot(p[0] - k.medio[0], p[1] - k.medio[1]) <= HOLGURA_DEL_ARCO;
      if (k.cara === rio) {
        if (
          !puentes.some((pu) =>
            pu.extremos.some(
              (p) => Math.hypot(p[0] - k.medio[0], p[1] - k.medio[1]) <= PUENTE_EN_SU_ARCO,
            ),
          )
        )
          fuera.push(`${r.id}: la puerta del río ${NOMBRE_DE_LA_CARA[k.cara]} no lleva su puente`);
        continue;
      }
      if (!cerca.some((l) => crucesConElContorno(r.contorno, l).some(enElArco)))
        fuera.push(
          `${r.id}: ninguna senda pasa por el arco de la puerta ${NOMBRE_DE_LA_CARA[k.cara]}`,
        );
    }
  }
  return fuera;
}

/** Distancia de `(x, y)` al tramo `a → b`. */
function aTramo(x: number, y: number, a: Par, b: Par): number {
  const [qx, qy] = puntoDelTramo([x, y], a, b);
  return Math.hypot(x - qx, y - qy);
}

/**
 * Qué del anillo de un recinto pisa una senda de media anchura `semiancho` que
 * pasa por `(x, y)`, dicho, o undefined: la base de una torre (su vértice, con
 * el radio de la torre) o el pie de una cara sin puerta (con medio grueso de
 * muro). Lo que va por dentro de la plaza lo tapa ella (también lo que corta las
 * esquinas que deja fuera el octógono), y lo que pasa por DETRÁS de una torre o
 * de una cara de detrás lo tapa la pieza, como tapa cualquier volumen lo de
 * detrás: la senda de una puerta del norte o de una diagonal de detrás sale por
 * detrás de la torre de delante (la cámara sube 1,12 su silueta), y eso no es
 * pisarla. Lo leen el guardia (`anilloSobreLaSenda`) y la senda que se aparta
 * (`componer`), que con `tambienDetras` se aparta también de eso: con la
 * excepción, la regla salta de sí a no al norte del centro de una torre y la
 * senda se corría hacia ella (s5 (30,36)).
 */
export function pisaElAnillo(
  r: Pick<Recinto, 'contorno' | 'puertas'>,
  x: number,
  y: number,
  semiancho: number,
  tambienDetras = false,
): string | undefined {
  if (enLaPlaza(r.contorno.rect, x, y)) return undefined;
  const torre = r.contorno.vertices.find(
    (v) =>
      (tambienDetras || y >= v[1]) && Math.hypot(x - v[0], y - v[1]) < RADIO_DE_TORRE + semiancho,
  );
  if (torre !== undefined) return `la torre de ${torre[0].toFixed(2)},${torre[1].toFixed(2)}`;
  const cara = r.contorno.caras.find(
    (k) =>
      !r.puertas.includes(k.cara) &&
      !(!tambienDetras && DE_DETRAS.has(k.cara) && dentroDeLaCara(k, x, y) < 0) &&
      aTramo(x, y, k.a, k.b) < GRUESO_DEL_MURO / 2 + semiancho,
  );
  return cara === undefined ? undefined : `el muro de la cara ${cara.cara}`;
}

/**
 * Lo que de las sendas pintadas pisa el anillo de un recinto (`pisaElAnillo`),
 * mirado cada 0,05 y un caso por tramo de senda: es `informe.recintoSobreSenda`,
 * y tiene que estar vacío. Se entra por el arco de una puerta.
 */
export function anilloSobreLaSenda(
  r: Pick<Recinto, 'contorno' | 'puertas'>,
  sendas: readonly Senda[],
  semiancho: number,
): string[] {
  const fuera: string[] = [];
  const [cx, cy] = r.contorno.centro;
  const paso = 0.05;
  for (const l of sendas) {
    if (
      !l.some(
        ([x, y]) => Math.abs(x - cx) < LADO_DEL_RECINTO && Math.abs(y - cy) < LADO_DEL_RECINTO,
      )
    )
      continue;
    for (let i = 0; i + 1 < l.length; i++) {
      const p = l[i] as Par;
      const q = l[i + 1] as Par;
      const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / paso));
      for (let j = 0; j <= n; j++) {
        const x = p[0] + ((q[0] - p[0]) * j) / n;
        const y = p[1] + ((q[1] - p[1]) * j) / n;
        const que = pisaElAnillo(r, x, y, semiancho);
        if (que === undefined) continue;
        fuera.push(`la senda pasa por ${que} en ${x.toFixed(2)},${y.toFixed(2)}`);
        break;
      }
    }
  }
  return fuera;
}

/**
 * Lo que un puente puede entrar en un recinto por su pisada, en casillas: el
 * redondeo del pie de la cara, donde acaba el de una ciudad-puente.
 */
const PUENTE_DENTRO = 0.01;

/**
 * Los puentes cuya pisada (`Puente.extremos`, de estribo a estribo en el suelo)
 * entra en el octógono de un recinto más de `PUENTE_DENTRO`, mirada cada 0,05:
 * es `informe.puenteSobreElAnillo`, y tiene que estar vacío. El puente de una
 * ciudad-puente acaba al pie de la cara del río (`puenteDeLaCiudad`); entero,
 * con el río al sur, su tablero se pintaba delante de la muralla y llegaba a
 * la mitad de la plaza (H2 del QA de la vuelta 2: 15 de 217 en 1-40).
 */
export function puentesSobreElAnillo(
  contornos: readonly Contorno[],
  puentes: readonly { readonly id: string; readonly extremos: readonly [Par, Par] }[],
): string[] {
  const fuera: string[] = [];
  const paso = 0.05;
  for (const pu of puentes) {
    const [p, q] = pu.extremos;
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / paso));
    for (const c of contornos) {
      if (Math.abs(p[0] - c.centro[0]) > 2 * LADO_DEL_RECINTO) continue;
      if (Math.abs(p[1] - c.centro[1]) > 2 * LADO_DEL_RECINTO) continue;
      for (let j = 0; j <= n; j++) {
        const x = p[0] + ((q[0] - p[0]) * j) / n;
        const y = p[1] + ((q[1] - p[1]) * j) / n;
        if (!dentroDelContorno(c, x, y, PUENTE_DENTRO)) continue;
        fuera.push(
          `el puente ${pu.id} entra en el recinto de (${c.rect.i0},${c.rect.j0}) en ${x.toFixed(2)},${y.toFixed(2)}`,
        );
        break;
      }
    }
  }
  return fuera;
}

/** Cada cuánto se mira el anillo en `huecosDelAnillo`, en casillas. */
const PASO_DEL_ANILLO = 0.05;

/**
 * Lo que de una pieza del anillo cubre su cara, como trecho `[desde, hasta]`
 * medido desde el vértice `a`: una torre, su base alrededor de su vértice; una
 * puerta o un tramo en diagonal, que van de vértice a vértice, la cara entera;
 * el tramo ancho, su ancho; el de norte a sur, su adarve.
 */
function loQueCubre(
  p: PiezaDelRecinto,
  k: CaraDelContorno,
  largo: number,
): readonly [number, number] {
  if (p.que === 'torre') {
    const r = RADIO_DE_TORRE;
    return p.x === k.a[0] && p.y === k.a[1] + r ? [-r, r] : [largo - r, largo + r];
  }
  if (
    p.que === 'puerta' ||
    EJE_DE_LA_CARA[k.cara] === 'ne-so' ||
    EJE_DE_LA_CARA[k.cara] === 'no-se'
  )
    return [0, largo];
  const desdeA = (x: number, y: number) =>
    ((x - k.a[0]) * (k.b[0] - k.a[0]) + (y - k.a[1]) * (k.b[1] - k.a[1])) / largo;
  if (k.cara === 'n' || k.cara === 's') {
    const w = (p.alto * p.nw) / p.nh;
    const m = desdeA(p.x, p.y);
    return [m - w / 2, m + w / 2];
  }
  // De norte a sur: de su pie, hacia el norte, lo que mide su adarve.
  const fondo = p.alto * FONDO_DEL_ADARVE;
  const [s0, s1] = [desdeA(p.x, p.y), desdeA(p.x, p.y - fondo)];
  return [Math.min(s0, s1), Math.max(s0, s1)];
}

/**
 * Los puntos del anillo, cada `PASO_DEL_ANILLO` por cada cara, que no cubre la
 * base de ninguna de sus piezas (`loQueCubre`): una cara sin su tramo, un tramo
 * que no llega a la torre. Es `informe.anilloAbierto`, y tiene que estar vacío.
 */
export function huecosDelAnillo(r: Recinto): string[] {
  const fuera: string[] = [];
  const piezas = [...r.torres, ...r.tramos, ...r.arcos];
  for (const k of r.contorno.caras) {
    const largo = Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]);
    const suyas = piezas.filter(
      (p) =>
        p.cara === k.cara ||
        (p.que === 'torre' && p.x === k.b[0] && p.y === k.b[1] + RADIO_DE_TORRE),
    );
    const trechos = suyas.map((p) => loQueCubre(p, k, largo));
    for (let s = 0; s <= largo + 1e-9; s += PASO_DEL_ANILLO)
      if (!trechos.some(([d, h]) => s >= d - 1e-9 && s <= h + 1e-9))
        fuera.push(
          `la cara ${k.cara} queda abierta en ${(k.a[0] + ((k.b[0] - k.a[0]) * s) / largo).toFixed(2)},${(k.a[1] + ((k.b[1] - k.a[1]) * s) / largo).toFixed(2)}`,
        );
  }
  return fuera;
}

/**
 * Las parejas de casas con la misma imagen al lado (la misma fila, a menos de
 * una décima) o detrás (la fila de atrás, solapadas): es
 * `informe.casasRepetidasJuntas`, y tiene que estar vacío. Lo garantiza la
 * regla; el guardia y `test/recinto.test.ts` lo miran con los mismos umbrales.
 */
export function casasRepetidasJuntas(casas: readonly PiezaDelRecinto[]): string[] {
  const fuera: string[] = [];
  const caja = (p: PiezaDelRecinto) => {
    const izquierda = p.x - (p.ax * p.alto) / p.nh;
    return [izquierda, izquierda + (p.nw * p.alto) / p.nh] as const;
  };
  for (let i = 0; i < casas.length; i++)
    for (let j = i + 1; j < casas.length; j++) {
      const p = casas[i] as PiezaDelRecinto;
      const q = casas[j] as PiezaDelRecinto;
      if (p.nombre !== q.nombre) continue;
      const [a0, a1] = caja(p);
      const [b0, b1] = caja(q);
      const dy = Math.abs(p.y - q.y);
      const hueco = Math.max(a0, b0) - Math.min(a1, b1);
      if ((dy < 0.05 && hueco < 0.1) || (dy > 0.05 && dy < 0.5 && hueco < 0))
        fuera.push(
          `«${p.nombre}» en ${p.x.toFixed(2)},${p.y.toFixed(2)} y ${q.x.toFixed(2)},${q.y.toFixed(2)}`,
        );
    }
  return fuera;
}
