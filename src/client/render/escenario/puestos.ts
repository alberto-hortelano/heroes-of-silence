/**
 * El puesto fronterizo de un nodo en la escena (fase 4, 05-11-2026): la caseta
 * de un paso tomado, la torreta de madera de la empalizada y la torre de la
 * muralla, como pidió el usuario («el puesto base muestre una caseta en el mapa
 * una vez alguien lo ha tomado, una torreta de madera si es una empalizada o una
 * torre si está amurallado»).
 *
 * Cada obra es una pieza más de la escena, con su condición (`Sprite.deNodo`):
 * la pinta el mapa solo si su nodo tiene dueño y esa mejora, y el hito del nodo
 * (`cuando: 'neutral'`) solo si no lo tiene (`seVeConSuNodo`). La escena se
 * compone una vez por partida y el dueño la cambia en ella: así ninguna pieza
 * se pinta aparte, y los guardias de siempre las miran todas.
 *
 * Su tamaño es el de su arte, registrado sobre su guía (`Pieza.puesto`,
 * `pnpm taller derivar-puestos`); sin él, el de la guía (`MEDIDAS_DEL_PUESTO`).
 * El sitio lo reserva la escena para la mayor de las tres (`envolturaDeLasObras`).
 *
 * Puro: sin DOM, como el resto del escenógrafo.
 */
import { MEJORAS_DEL_PUESTO, type MejoraDelPuesto } from '@core/map/map.js';
import type { PlayerId } from '@core/types.js';
import { MARGEN_DEL_RECORTE } from '../../../shared/arte.js';
import type { Pieza } from './catalogo.js';
import type { Sprite } from './colocar.js';
import { PIES } from './figuras-del-mapa.js';
import { type Caja, cajaDeSprite, seTocan } from './pasillo.js';
import { separar } from './pintar.js';

/**
 * Lo que mide cada obra en su guía de geometría, en casillas: de ancho
 * (este-oeste), de fondo (norte-sur) y de alto. A ojo (05-11-2026), frente a la
 * figura del héroe (~0,5 de ancho y ~0,9 de alto) y al hito de 1 casilla de
 * alto: la caseta, más baja que el héroe y más ancha; la torreta, sobre sus
 * patas, le saca la cabeza; la torre, la más alta, sin llegar a la torre de un
 * recinto. Distintas a propósito: el alto dice la obra antes que el dibujo. Lo
 * leen la guía (`tools/taller/mapa.ts`) y, sin arte, la escena.
 */
export const MEDIDAS_DEL_PUESTO: Readonly<
  Record<MejoraDelPuesto, { readonly ancho: number; readonly fondo: number; readonly alto: number }>
> = {
  ninguna: { ancho: 0.6, fondo: 0.42, alto: 0.5 },
  empalizada: { ancho: 0.46, fondo: 0.38, alto: 1.0 },
  muralla: { ancho: 0.44, fondo: 0.4, alto: 1.12 },
};

/** La pieza de `assets/mapa/` de cada obra. */
export const PIEZA_DEL_PUESTO: Readonly<Record<MejoraDelPuesto, string>> = {
  ninguna: 'puesto-caseta',
  empalizada: 'puesto-torreta',
  muralla: 'puesto-torre',
};

/** Cuándo se pinta una pieza de un nodo: neutral (su hito) o con una obra de su dueño. */
export type CuandoSePinta = MejoraDelPuesto | 'neutral';

/** Lo que dice `Sprite.deNodo`: de qué nodo es la pieza y cuándo se pinta. */
export interface DeNodo {
  readonly id: string;
  readonly cuando: CuandoSePinta;
}

/** Lo que se sabe de un nodo para elegir lo que se pinta en él. */
export interface NodoQueSeSabe {
  readonly owner: PlayerId | null;
  readonly mejora: MejoraDelPuesto;
}

/**
 * Si la pieza de un nodo se pinta con lo que se sabe de él: el hito, mientras no
 * se le sabe dueño (tampoco si no se sabe nada: la niebla lo tapa); la obra, si se
 * le sabe dueño y esa mejora. La única regla de lo que se pinta en un nodo.
 */
export function seVeConSuNodo(d: DeNodo, nodo: NodoQueSeSabe | undefined): boolean {
  if (d.cuando === 'neutral') return nodo === undefined || nodo.owner === null;
  return nodo !== undefined && nodo.owner !== null && nodo.mejora === d.cuando;
}

/**
 * Lo que ocupa una obra alrededor de su pie, en casillas: hacia el oeste y el
 * este, hacia arriba y hacia abajo. La caja de su imagen (`cajaDeSprite`), con el
 * margen transparente del recorte, como se mide todo lo de la escena.
 */
export interface AlrededorDelPie {
  readonly oeste: number;
  readonly este: number;
  readonly arriba: number;
  readonly abajo: number;
}

/**
 * Lo que ocupa la obra `mejora` con su pieza `p`, a la escala registrada sobre su
 * guía (`Pieza.puesto`); sin pieza, la caja de su guía.
 */
export function alrededorDeLaObra(mejora: MejoraDelPuesto, p: Pieza | null): AlrededorDelPie {
  if (p === null) {
    const { ancho, fondo, alto } = MEDIDAS_DEL_PUESTO[mejora];
    return { oeste: ancho / 2, este: ancho / 2, arriba: fondo + alto, abajo: 0 };
  }
  const px = pxPorCasillaDe(p);
  return {
    oeste: p.ax / px,
    este: (p.nw - p.ax) / px,
    arriba: p.ay / px,
    abajo: (p.nh - p.ay) / px,
  };
}

function pxPorCasillaDe(p: Pieza): number {
  if (p.puesto === undefined)
    throw new Error(
      `la pieza «${p.src}» no trae su casilla (pnpm taller derivar-puestos): no es una obra del puesto`,
    );
  return p.puesto.pxPorCasilla;
}

/** La mayor de las obras por cada lado: lo que reserva la escena para el puesto. */
export function envolturaDeLasObras(
  obras: Readonly<Record<MejoraDelPuesto, AlrededorDelPie>>,
): AlrededorDelPie {
  const de = (k: keyof AlrededorDelPie) => Math.max(...MEJORAS_DEL_PUESTO.map((m) => obras[m][k]));
  return { oeste: de('oeste'), este: de('este'), arriba: de('arriba'), abajo: de('abajo') };
}

/**
 * Una pieza del puesto del nodo `id` con el pie en `pie`: una imagen y su alto,
 * o, sin imagen, la caja `a` (`nw`, `nh`, `ax` y `ay` en milésimas de casilla,
 * que es lo que lee `cajaDeSprite`).
 */
function spriteDelPuesto(
  id: string,
  cuando: CuandoSePinta,
  pie: Punto,
  imagen: Pick<Sprite, 'src' | 'nw' | 'nh' | 'ax' | 'ay' | 'alto'>,
): Sprite {
  return {
    ...imagen,
    x: pie[0],
    y: pie[1],
    clase: 'objeto',
    color: COLOR_DEL_PUESTO,
    capa: 0,
    sombra: imagen.src !== null,
    deNodo: { id, cuando },
  };
}

/** El color de lo que no tiene imagen: madera vieja. */
const COLOR_DEL_PUESTO = '#8a6a44';

/** Una caja sin imagen alrededor de un pie, como la lee `cajaDeSprite`. */
function sinImagen(a: AlrededorDelPie): Pick<Sprite, 'src' | 'nw' | 'nh' | 'ax' | 'ay' | 'alto'> {
  const k = 1000;
  return {
    src: null,
    nw: (a.oeste + a.este) * k,
    nh: (a.arriba + a.abajo) * k,
    ax: a.oeste * k,
    ay: a.arriba * k,
    alto: a.arriba + a.abajo,
  };
}

/**
 * La pieza de la obra `mejora` en el sitio de su puesto: su imagen a la escala de
 * su guía (`Pieza.puesto`) o, sin pieza en el catálogo, una sin imagen del tamaño
 * de su guía. Sin imagen —aún no ha llegado, o no hay— el mapa pinta en su lugar
 * el marcador de la obra a su escala (`render/marcador-del-puesto.ts`).
 */
export function obraDelPuesto(
  id: string,
  mejora: MejoraDelPuesto,
  p: Pieza | null,
  pie: Punto,
): Sprite {
  const imagen =
    p === null
      ? sinImagen(alrededorDeLaObra(mejora, null))
      : { src: p.src, nw: p.nw, nh: p.nh, ax: p.ax, ay: p.ay, alto: p.nh / pxPorCasillaDe(p) };
  return spriteDelPuesto(id, mejora, pie, imagen);
}

/**
 * Lo que se ve de una obra del puesto (`Sprite.deNodo` con una mejora), en
 * casillas: su caja sin el margen transparente del recorte (`MARGEN_DEL_RECORTE`);
 * sin imagen, su caja. Donde se planta la bandera y en lo que cabe su marcador.
 */
export function cajaDeLaObra(s: Sprite): Caja {
  const caja = cajaDeSprite(s);
  if (s.src === null) return caja;
  const m = (MARGEN_DEL_RECORTE * s.alto) / s.nh;
  return [caja[0] + m, caja[1] + m, caja[2] - m, Math.max(s.y, caja[3] - m)];
}

/** Un punto de la escena, en casillas. */
type Punto = readonly [number, number];

/**
 * Lo que ocupará el puesto de `id` con el pie en `pie`, como un sprite sin imagen:
 * la mayor de sus obras por cada lado (`envolturaDeLasObras`). Es quien ocupa su
 * reserva (`reservaDelPuesto`); no entra en la escena.
 */
export function envolturaDelPuesto(id: string, pie: Punto, envoltura: AlrededorDelPie): Sprite {
  const { deNodo: _, ...s } = spriteDelPuesto(id, 'neutral', pie, sinImagen(envoltura));
  return { ...s, objeto: { id, kind: 'node' } };
}

/** Un nodo al que se busca sitio para su puesto. */
export interface NodoConPuesto {
  readonly id: string;
  /** El punto desde el que se mide lo cerca: el centro de su casilla (en un puente, su tablero). */
  readonly centro: Punto;
  /** Lo que pinta el héroe parado en él (`cajaDelHeroeEn`): el puesto no lo toca. */
  readonly heroe: Caja;
}

/** Lo que pregunta `sitiosDeLosPuestos` a la escena de dónde no va un puesto. */
export interface DondeNoVaUnPuesto {
  /** Si la caja de la envoltura pisa algo que no tapa: la senda, las rampas, los ejes, los tableros. */
  readonly pisa: (envoltura: Sprite) => boolean;
  /** Si su base puede apoyar en `(x, y)`: ni agua, ni muro, ni un recinto, ni fuera del mapa. */
  readonly apoya: (x: number, y: number) => boolean;
  /**
   * Si la envoltura toca algo de lo puesto que no es del nodo `id`: otro objeto, o
   * una pared que se pintaría después y la taparía.
   */
  readonly choca: (envoltura: Sprite, id: string) => boolean;
}

/**
 * Lo que dos cajas del puesto pueden rozarse sin que se cuente, en casillas: lo
 * que se tolera al elegir su sitio y en sus guardias (`seTocan`).
 */
export const HOLGURA_DEL_PUESTO = 0.02;

/**
 * Lo que se corre el pie del puesto desde el centro del nodo, a lo sumo, en
 * casillas. En 1-40 (05-11-2026), mediana 0,86 y p90 1,36; la puerta de una
 * muralla, entre sus muros y su eje, mediana 1,84 y como mucho 2,66 (s20, una
 * puerta junto al recinto de una ciudad y al borde de abajo). Con 2,5 se quedaba
 * esa sin sitio; con 2, nueve más pegadas al borde del mapa.
 */
const LEJOS_DEL_NODO = 3;
/**
 * Hasta dónde se busca, en casillas, solo si en `LEJOS_DEL_NODO` no hay sitio: el
 * QA de la fase 4 vio un paso de montaña del 64×64 sin puesto (s1 node-17 (19,31)),
 * y su sitio más cercano está a 3,01. Va después de toda la búsqueda de dentro, así
 * que el nodo que tiene sitio cerca no se mueve.
 */
const LEJOS_SIN_SITIO = 3.5;
/** El paso de la búsqueda, en casillas. */
const PASO_DEL_SITIO = 0.1;
/**
 * Lo que se cobra, en casillas de distancia, un sitio por delante del nodo (más
 * al sur que el pie del héroe, `PIES.heroe`): ahí el puesto tapa lo de detrás, y
 * por detrás o a un lado se lee como «el puesto del paso» sin tapar nada.
 */
const COBRO_POR_DELANTE = 0.25;
/** Desde dónde, bajo el centro del nodo, un sitio va por delante: el pie del héroe. */
const POR_DELANTE = PIES.heroe - 0.5;

/**
 * Los corrimientos del pie que se prueban a más de `desde` y hasta `hasta`, del más
 * barato al más caro: el más cercano al centro del nodo y, a igual distancia, el de
 * más al norte y luego el de más al oeste. Siempre los mismos: sin azar, la escena
 * no se mueve.
 */
function corrimientos(desde: number, hasta: number): Punto[] {
  const n = Math.ceil(hasta / PASO_DEL_SITIO);
  const lista: { d: Punto; coste: number }[] = [];
  for (let j = -n; j <= n; j++)
    for (let i = -n; i <= n; i++) {
      const d: Punto = [i * PASO_DEL_SITIO, j * PASO_DEL_SITIO];
      const r = Math.hypot(d[0], d[1]);
      if (r > hasta + 1e-9 || (desde > 0 && r <= desde + 1e-9)) continue;
      lista.push({ d, coste: r + (d[1] > POR_DELANTE ? COBRO_POR_DELANTE : 0) });
    }
  return lista
    .sort((a, b) => a.coste - b.coste || a.d[1] - b.d[1] || a.d[0] - b.d[0])
    .map((c) => c.d);
}

/** Los de `LEJOS_DEL_NODO` y, tras ellos, los de respaldo hasta `LEJOS_SIN_SITIO`. */
const CORRIMIENTOS: readonly Punto[] = [
  ...corrimientos(0, LEJOS_DEL_NODO),
  ...corrimientos(LEJOS_DEL_NODO, LEJOS_SIN_SITIO),
];

/**
 * El sitio del puesto de cada nodo: el pie más cercano a su centro cuya envoltura
 * no pisa la senda, el eje de ningún paso ni el tablero de un puente, no toca al
 * héroe parado en él, otro objeto, una pared ni otro puesto, y apoya en tierra
 * (`DondeNoVaUnPuesto`). Así nada de lo que se pinta después lo tapa (la escena le
 * reserva el sitio) y él no tapa el paso, la senda ni al héroe. El nodo sin sitio
 * no lleva puesto en la escena (`sinSitio`), y lo cuenta su guardia.
 */
export function sitiosDeLosPuestos(
  nodos: readonly NodoConPuesto[],
  donde: DondeNoVaUnPuesto,
  envoltura: AlrededorDelPie,
): {
  readonly sitios: readonly { readonly id: string; readonly pie: Punto }[];
  readonly sinSitio: readonly string[];
} {
  const sitios: { id: string; pie: Punto }[] = [];
  const sinSitio: string[] = [];
  const puestas: Caja[] = [];
  for (const n of nodos) {
    let elegido: Punto | null = null;
    for (const [dx, dy] of CORRIMIENTOS) {
      const pie: Punto = [n.centro[0] + dx, n.centro[1] + dy];
      if (
        !donde.apoya(pie[0], pie[1]) ||
        !donde.apoya(pie[0] - envoltura.oeste, pie[1]) ||
        !donde.apoya(pie[0] + envoltura.este, pie[1])
      )
        continue;
      const s = envolturaDelPuesto(n.id, pie, envoltura);
      const caja = cajaDeSprite(s);
      if (seTocan(caja, n.heroe) || puestas.some((c) => seTocan(caja, c))) continue;
      if (donde.choca(s, n.id) || donde.pisa(s)) continue;
      elegido = pie;
      puestas.push(caja);
      break;
    }
    if (elegido === null) sinSitio.push(n.id);
    else sitios.push({ id: n.id, pie: elegido });
  }
  return { sitios, sinSitio };
}

/** Una obra del puesto en la escena: una pieza de su nodo con una mejora. */
export type Obra = Sprite & {
  readonly deNodo: { readonly id: string; readonly cuando: MejoraDelPuesto };
};

/** Si un sprite es una obra del puesto (no el hito de su nodo). */
export const esObra = (s: Sprite): s is Obra =>
  s.deNodo !== undefined && s.deNodo.cuando !== 'neutral';

/**
 * Las obras (por el id de su nodo) que tocan al héroe parado en su nodo
 * (`heroes`, `cajaDelHeroeEn`). Lo que el puesto no pisa —la senda, el eje de un
 * paso, el tablero de un puente— lo miran los guardias de siempre, que ven las
 * obras; esto es lo que ellos no saben: dónde se para el héroe. El QA de la fase 3
 * vio al héroe tapando entera la obra.
 */
export function puestosSobreElHeroe(
  sprites: readonly Sprite[],
  heroes: ReadonlyMap<string, Caja>,
): string[] {
  const fuera = new Set<string>();
  for (const s of sprites) {
    if (!esObra(s)) continue;
    const heroe = heroes.get(s.deNodo.id);
    if (heroe !== undefined && seTocan(cajaDeSprite(s), heroe)) fuera.add(s.deNodo.id);
  }
  return [...fuera];
}

/**
 * Las obras (por el id de su nodo) que tapa un volumen que el pintor pone después
 * de ellas (`ordenDeVolumenes`, el orden de `separar`) y toca su caja: un árbol,
 * un pico, una pared, un muro u otro objeto.
 * Las piezas de su mismo nodo (su hito y las otras dos obras) no cuentan: nunca se
 * pintan a la vez. Se mide desde lo puesto, como `puentesTapados`: si la reserva se
 * equivoca, esto lo ve.
 */
export function puestosTapados(sprites: readonly Sprite[]): string[] {
  const volumenes = separar({ sprites }).volumenes.map((v) => v.s);
  const fuera = new Set<string>();
  volumenes.forEach((obra, k) => {
    if (!esObra(obra)) return;
    const caja = cajaDeSprite(obra);
    const tapa = volumenes
      .slice(k + 1)
      .some(
        (s) =>
          s.deNodo?.id !== obra.deNodo.id && seTocan(cajaDeSprite(s), caja, HOLGURA_DEL_PUESTO),
      );
    if (tapa) fuera.add(obra.deNodo.id);
  });
  return [...fuera];
}

/**
 * Las obras (por el id de su nodo) que tapan lo horneado de otro objeto (un
 * sprite con `objeto`: las torres, los tramos, las puertas y las casas de un
 * recinto, un pueblo, la pieza de otro nodo) que el pintor pone antes que ellas y
 * cuya caja tocan. Es la otra cara de `puestosTapados`: el QA de la fase 4 vio la
 * torre de un puesto al pie de una ciudad montada sobre el pie de una torre de su
 * muralla, con la bandera encima, leyéndose como una torre más de la ciudad (s45
 * (14,8)). Lo de su mismo nodo no cuenta (su hito no se pinta con ella).
 */
export function puestosQueTapan(sprites: readonly Sprite[]): string[] {
  const volumenes = separar({ sprites }).volumenes.map((v) => v.s);
  const fuera = new Set<string>();
  volumenes.forEach((obra, k) => {
    if (!esObra(obra)) return;
    const caja = cajaDeSprite(obra);
    const tapa = volumenes
      .slice(0, k)
      .some(
        (s) =>
          s.objeto !== undefined &&
          s.objeto.id !== obra.deNodo.id &&
          seTocan(cajaDeSprite(s), caja, HOLGURA_DEL_PUESTO),
      );
    if (tapa) fuera.add(obra.deNodo.id);
  });
  return [...fuera];
}
