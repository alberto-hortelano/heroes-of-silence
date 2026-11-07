/**
 * Lo que se pisa y la cubierta del suelo: lo que la copa de la masa no tapa de lo
 * que se pisa (`topeDeLoPisable`, por los lados de la fila de su pie y sobre un
 * pasillo estrecho, 14-10-2026) y los guardias que lo cuentan en el informe de
 * `componer` (`sobreLoPisable`, `bosqueSinArbol`), y los de la cubierta: la de lo
 * que se pisa que imita la barrera (`cubiertaComoLaBarrera`, #184) y la que no es
 * del suelo que se pinta bajo su pie (`cubiertaDeOtroNivel`, #220).
 */
import type { Suelo } from '@core/map/terrain.js';
import { hojaDelSrc } from '../bordes.js';
import { type Caja, type ConImagen, cajaDeSprite, type Tope } from '../pasillo.js';
import type { Medible } from './sendas-y-murallas.js';
import type { Sprite } from './sprite.js';
import {
  CUBIERTA,
  ESBELTEZ_DE_LO_PISABLE,
  esArbol,
  HOJAS_DE_LA_CUBIERTA,
  MATA_MAS_BAJA,
  tumbado,
} from './tablas.js';

/**
 * Lo más que tapa la cubierta de lo que se pisa en un suelo `comoLaBarrera`, de
 * media por región: la suma de los rectángulos de sus piezas (en casillas²,
 * con sus solapes) entre las casillas de la región. Antes de #184 era 1,28 de
 * media en las semillas de la auditoría (más que lo alto de un acantilado,
 * 0,75); con la cubierta rala, 0,31.
 */
export const HUELLA_DE_LO_PISABLE = 0.6;

/**
 * Las regiones de menos casillas no se miden por su media: en un enclave de una
 * casilla, un charco ancho de la ciénaga ya pasa de 1. Lo que se lee o no como
 * pisable es una extensión, no una casilla suelta.
 */
const REGION_QUE_SE_MIDE = 9;

/** El alto más alto que da `altoDeMata` en el suelo `s`. */
const altoMaximoDeMata = (s: Suelo) => CUBIERTA[s].alto * (MATA_MAS_BAJA + 0.6);

/**
 * Dónde la cubierta de lo que se pisa en un suelo `comoLaBarrera` vuelve a
 * imitar la barrera (#184): las piezas de cubierta con el pie en una casilla
 * pisable de esos suelos más altas que lo que les deja su esbeltez
 * (`tumbado`) —un árbol, una aguja a su alto—, y las regiones de esos suelos
 * (de `REGION_QUE_SE_MIDE` casillas o más) cuya cubierta tapa, de media por
 * casilla, más de `HUELLA_DE_LO_PISABLE`. La
 * suma es `informe.cubiertaComoLaBarrera`, y tiene que ser 0.
 *
 * `region` es la de `Analisis`: -1 en lo que no se pisa.
 */
export function cubiertaComoLaBarrera(
  sprites: readonly Sprite[],
  suelo: readonly Suelo[],
  region: Int32Array,
  W: number,
): { readonly altas: readonly Sprite[]; readonly regionesDensas: readonly number[] } {
  const altas: Sprite[] = [];
  const huella = new Map<number, number>();
  const casillas = new Map<number, number>();
  for (let i = 0; i < region.length; i++) {
    const r = region[i] as number;
    if (r >= 0 && CUBIERTA[suelo[i] as Suelo].comoLaBarrera)
      casillas.set(r, (casillas.get(r) ?? 0) + 1);
  }
  for (const s of sprites) {
    if (s.clase !== 'cubierta' || s.capa !== 0) continue;
    const i = Math.floor(s.y) * W + Math.floor(s.x);
    const r = region[i];
    if (r === undefined || r < 0) continue;
    const su = suelo[i] as Suelo;
    if (!CUBIERTA[su].comoLaBarrera) continue;
    // Un marcador (sin imagen) no tiene esbeltez: se mide por su alto.
    const tope = tumbado({ ...s, alto: altoMaximoDeMata(su) }, ESBELTEZ_DE_LO_PISABLE).alto;
    if (s.alto > tope + 1e-9) altas.push(s);
    const [x0, y0, x1, y1] = cajaDeSprite(s);
    huella.set(r, (huella.get(r) ?? 0) + (x1 - x0) * (y1 - y0));
  }
  const regionesDensas = [...huella]
    .filter(([r, h]) => {
      const n = casillas.get(r) as number;
      return n >= REGION_QUE_SE_MIDE && h / n > HUELLA_DE_LO_PISABLE;
    })
    .map(([r]) => r)
    .sort((p, q) => p - q);
  return { altas, regionesDensas };
}

/**
 * La cubierta que no es del suelo que se pinta donde tiene el pie
 * (`Escena.suelo`, `sueloQueSePinta`): la nieve y los abetos nevados de la
 * región baja sobre una meseta de lava (s13 (16-24, 4-7)), la hierba sobre un
 * cantil de nieve (s80 (18, 12-13)), las coles del huerto sobre la lava (s57
 * (0-5, 8)). Es `informe.cubiertaDeOtroNivel`, y tiene que ser 0. Un marcador
 * (sin imagen) no dice su hoja: no cuenta.
 */
export function cubiertaDeOtroNivel(
  sprites: readonly Pick<Sprite, 'clase' | 'src' | 'x' | 'y'>[],
  pintado: readonly Suelo[],
  W: number,
): Pick<Sprite, 'clase' | 'src' | 'x' | 'y'>[] {
  return sprites.filter((s) => {
    if (s.clase !== 'cubierta' || s.src === null) return false;
    const suelo = pintado[Math.floor(s.y) * W + Math.floor(s.x)] as Suelo;
    return !HOJAS_DE_LA_CUBIERTA[suelo].has(hojaDelSrc(s.src) ?? '');
  });
}

/**
 * Lo más que la copa de una masa de bosque o de montaña entra, por los lados,
 * en una casilla que se pisa de su fila, en casillas. Con el borde de la masa
 * así, en un pasillo de una casilla entre dos bosques quedan 0,6 a la vista. El
 * medio de lo que se pidió (0,15-0,25): con más, el pasillo de s1 (2,23) seguía
 * leyéndose como bosque; con menos, el borde de la masa salía recto.
 */
export const MARGEN_SOBRE_LO_PISABLE = 0.2;

/**
 * Lo que la copa de una masa puede tapar, desde abajo, de una casilla estrecha
 * que se pisa al norte de su fila (`pasillosEstrechos`), en casillas: con 0,4,
 * de un pasillo de este a oeste de una casilla entre dos bosques queda a la
 * vista su 0,6 de arriba, lo mismo que deja `MARGEN_SOBRE_LO_PISABLE` de un
 * pasillo de norte a sur. El borde de la masa casi no depende de él: de 0,3 a
 * 0,5, en 1-40, la mediana del árbol más alto de cada casilla de bosque bajo
 * un pasillo va de 0,98 a 1,01 (1,09 sin el tope) y la del pico de montaña, de
 * 0,52 a 0,55 (0,57): cada casilla lleva varios pies, y solo se encogen los
 * del 0,4 de arriba de la fila (con 0,4, de 0,97 a 0,52 de mediana; los de
 * abajo siguen enteros, 14-10-2026). Se elige por lo que deja a la vista.
 */
export const TAPADO_DEL_PASILLO = 0.4;

/**
 * El alto con el que la caja de `s`, que se abre `izquierda` y `derecha` por
 * casilla de alto, entra en lo que no se tapa de la columna `c` (de `c + M` a
 * `c + 1 − M`, `MARGEN_SOBRE_LO_PISABLE`): 0 si su pie ya está ahí, `hasta` si
 * no se abre hacia ella.
 */
function altoHastaLaColumna(
  s: Pick<ConImagen, 'x'>,
  c: number,
  izquierda: number,
  derecha: number,
  hasta: number,
): number {
  const M = MARGEN_SOBRE_LO_PISABLE;
  if (s.x <= c + M) return derecha > 0 ? (c + M - s.x) / derecha : hasta;
  if (s.x >= c + 1 - M) return izquierda > 0 ? (s.x - (c + 1 - M)) / izquierda : hasta;
  return 0;
}

/** Lo que la caja de `s` se abre por casilla de alto: a la izquierda y a la derecha del pie, y hacia arriba. */
function aperturaDe(s: ConImagen): { izquierda: number; derecha: number; subida: number } {
  const [u0, v0, u1] = cajaDeSprite(s, 1);
  return { izquierda: s.x - u0, derecha: u1 - s.x, subida: s.y - v0 };
}

/**
 * El mayor alto, hasta `hasta`, con el que la caja de `s` no entra más de
 * `MARGEN_SOBRE_LO_PISABLE` en ninguna casilla que se pisa (`franjaDe` -1) de
 * la fila de su pie: lo que su copa tapa por los lados. Lo que sube hacia el
 * norte es perspectiva (una figura puede quedar detrás de un árbol, #185),
 * salvo sobre un pasillo estrecho (`altoSobreLosPasillos`), y con el pie fuera
 * del mapa no hay fila que tapar. Es la regla de la puerta (`topeDeLoPisable`)
 * y la del contador (`sobreLoPisable`).
 *
 * Cuenta cerrada: el ancho crece en línea recta con el alto desde el pie, así
 * que cada casilla da el alto con el que la caja llega a su margen. Antes era
 * una forma más del índice, un tramo por casilla que se pisa (unas 9 por
 * casilla de masa) con un alcance inflado para que la caja que preselecciona
 * viera la fila del pie, y el contador repetía la geometría a mano.
 */
export function altoPorLosLados(
  s: ConImagen,
  franjaDe: ArrayLike<number>,
  W: number,
  hasta = s.alto,
): number {
  const fila = Math.floor(s.y);
  if (fila < 0 || fila >= franjaDe.length / W) return hasta;
  const { izquierda, derecha } = aperturaDe(s);
  const [x0, , x1] = cajaDeSprite(s, hasta);
  let libre = hasta;
  for (let c = Math.max(0, Math.floor(x0)); c <= Math.min(W - 1, Math.floor(x1)); c++)
    if (franjaDe[fila * W + c] === -1)
      libre = Math.min(libre, altoHastaLaColumna(s, c, izquierda, derecha, hasta));
  return libre;
}

/**
 * Las casillas que se pisan estrechas (1) por las que la copa de la masa de su
 * sur no pasa (`altoSobreLosPasillos`): las que no tienen al norte nada que se
 * pise (otra barrera o el borde del mapa: un pasillo de este a oeste de una
 * casilla o un rincón), o no lo tienen ni al este ni al oeste (la punta de un
 * pasillo de norte a sur). Ahí la copa de la fila de abajo, que en lo ancho es
 * perspectiva, tapaba lo que se pisa entero y nada detrás lo dejaba leer (QA,
 * 14-10-2026: s1 (29-31, 17), un paso de verdad; s2 (10, 18); s3 (4-5, 18)).
 *
 * Y la de abajo de un pasillo de dos de hondo: con lo que se pisa al norte, pero
 * no al norte de esa ni al sur de ella. La copa de su sur la tapaba en un 80 %
 * o más en 139 casos con bosque y 57 con montaña en 1-40, y solo se leía la
 * fila de arriba (QA, H10; decisión del usuario, 16-10-2026). De tres de hondo
 * o más es lo ancho: una figura puede quedar detrás de un árbol (#185).
 */
export function pasillosEstrechos(franjaDe: ArrayLike<number>, W: number): Uint8Array {
  const H = franjaDe.length / W;
  const sePisa = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < W && y < H && franjaDe[y * W + x] === -1;
  const estrechas = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (
        sePisa(x, y) &&
        (!sePisa(x, y - 1) ||
          (!sePisa(x - 1, y) && !sePisa(x + 1, y)) ||
          (!sePisa(x, y - 2) && !sePisa(x, y + 1)))
      )
        estrechas[y * W + x] = 1;
  return estrechas;
}

/**
 * El mayor alto, hasta `hasta`, con el que la caja de `s` no tapa más de
 * `TAPADO_DEL_PASILLO`, desde abajo, de ninguna casilla estrecha que se pisa
 * (`estrechas`, de `pasillosEstrechos`) al norte de la fila de su pie, en lo
 * que no se tapa de su columna (lo mismo que por los lados). Se mide por la
 * caja: la copa de un árbol la llena casi entera, y la cuenta queda cerrada
 * como la de los lados.
 */
export function altoSobreLosPasillos(
  s: ConImagen,
  estrechas: ArrayLike<number>,
  W: number,
  hasta = s.alto,
): number {
  const fila = Math.floor(s.y);
  if (fila < 1 || fila >= estrechas.length / W) return hasta;
  const { izquierda, derecha, subida } = aperturaDe(s);
  if (subida <= 0) return hasta;
  const [x0, y0, x1] = cajaDeSprite(s, hasta);
  let libre = hasta;
  for (let r = fila - 1; r >= Math.max(0, Math.floor(y0)); r--) {
    // El alto con el que lo alto de la caja llega a lo que no se tapa de la fila `r`.
    const arriba = (s.y - (r + 1 - TAPADO_DEL_PASILLO)) / subida;
    if (arriba >= libre) continue;
    for (let c = Math.max(0, Math.floor(x0)); c <= Math.min(W - 1, Math.floor(x1)); c++)
      if (estrechas[r * W + c] === 1)
        libre = Math.min(
          libre,
          Math.max(arriba, altoHastaLaColumna(s, c, izquierda, derecha, hasta)),
        );
  }
  return libre;
}

/**
 * Lo que se pisa como tope del índice de obstáculos (`Tope`): la copa de una
 * masa no lo tapa por los lados más de `MARGEN_SOBRE_LO_PISABLE`
 * (`altoPorLosLados`) ni tapa más de `TAPADO_DEL_PASILLO` de un pasillo
 * estrecho de su norte (`altoSobreLosPasillos`). La que se pasaría se encoge,
 * cambia de módulo o se quita, por `poner`. Las cumbres (`Sprite.cumbre`) no lo
 * miran: son la pieza grande de su cordillera, de 2,5 a 3 casillas por diseño,
 * y encogerlas o quitarlas cambiaba cuántas hay y dónde.
 *
 * Antes no había nada: el ancla de la masa caía siempre en su franja, pero su
 * copa desbordaba hasta 1,42 casillas sobre lo que se pisa (en s1, 248 piezas de
 * bosque y 70 de montaña más de 0,25), y el frondoso de (1,95; 23,81) tapaba
 * entero el pasillo de (2,23).
 */
export function topeDeLoPisable(franjaDe: ArrayLike<number>, W: number): Tope<Medible> {
  const estrechas = pasillosEstrechos(franjaDe, W);
  return (s, hasta) =>
    s.clase !== 'masa' || s.cumbre === true
      ? hasta
      : altoSobreLosPasillos(s, estrechas, W, altoPorLosLados(s, franjaDe, W, hasta));
}

/**
 * Lo que tapa lo que se pisa, contado desde lo puesto en una pasada (no le
 * pregunta a `APARTE` ni al índice, que son la puerta):
 *
 * - `arboles`: los de cualquier clase con imagen de árbol (`esArbol`) con el
 *   pie en una casilla que se pisa (`franjaDe` -1). «Árbol = no se pasa», sin
 *   excepciones (decisión del usuario, 14-10-2026): el alto no separa el árbol
 *   de adorno de la masa, que mide desde 0,51 en su p10. En s1 había 1 681 de
 *   más de 0,6, 1 049 a una casilla de un bosque. `informe.arbolesSobreLoPisable`,
 *   tiene que ser 0.
 * - `masas`: las masas, sin las cumbres, cuya copa tapa por los lados más de lo
 *   que deja `altoPorLosLados`. `informe.masaSobreLoPisable`, tiene que ser 0.
 * - `pasillos`: las masas, sin las cumbres, cuya copa tapa un pasillo estrecho
 *   de su norte más de lo que deja `altoSobreLosPasillos`.
 *   `informe.pasillosTapados`, tiene que ser 0.
 * - `cumbres`: las cumbres que hacen una de las dos cosas, que no se encogen
 *   por eso. `informe.cumbresSobreLoPisable`, una medida.
 */
export function sobreLoPisable(
  sprites: readonly Sprite[],
  franjaDe: ArrayLike<number>,
  W: number,
): { arboles: Sprite[]; masas: Sprite[]; pasillos: Sprite[]; cumbres: Sprite[] } {
  const H = franjaDe.length / W;
  const estrechas = pasillosEstrechos(franjaDe, W);
  const arboles: Sprite[] = [];
  const masas: Sprite[] = [];
  const pasillos: Sprite[] = [];
  const cumbres: Sprite[] = [];
  for (const s of sprites) {
    const x = Math.floor(s.x);
    const y = Math.floor(s.y);
    // Primero el pie, que es barato; la imagen solo de lo que está en lo que se pisa.
    if (x >= 0 && y >= 0 && x < W && y < H && franjaDe[y * W + x] === -1 && esArbol(s.src))
      arboles.push(s);
    if (s.clase !== 'masa') continue;
    const lados = altoPorLosLados(s, franjaDe, W) < s.alto - 1e-6;
    const pasillo = altoSobreLosPasillos(s, estrechas, W) < s.alto - 1e-6;
    if (s.cumbre === true) {
      if (lados || pasillo) cumbres.push(s);
      continue;
    }
    if (lados) masas.push(s);
    if (pasillo) pasillos.push(s);
  }
  return { arboles, masas, pasillos, cumbres };
}

/**
 * Lo que de una casilla tiene que tapar la imagen de un objeto para que no
 * cuente en `bosqueSinArbol`: ahí lo que se ve es el objeto, no un claro. Las
 * de detrás de una ciudad las tapa del 88 al 100 %; las de sus lados, del 13 al
 * 88 % (1-40, 14-10-2026).
 */
const TAPADA_POR_UN_OBJETO = 0.5;

/**
 * Las casillas de bosque (`bosque`) sin un árbol (`esArbol`) con el pie en
 * ellas, salvo las que la imagen de un objeto tapa en `TAPADA_POR_UN_OBJETO` o
 * más (por su caja) y las que tapa por su centro una pared del desnivel
 * (`tapaLaPared`, de `loQueTapa`, como en `casillasDeBarreraSinFormacion`): ahí
 * lo que se ve es el objeto o la roca, no un claro. Sin árbol, una casilla de
 * bosque se lee como un claro que se pisa: `casillasDeBarreraSinFormacion` no
 * lo ve, porque cuenta como formación la huella del objeto de al lado.
 * `informe.bosqueSinArbol`, tiene que ser 0.
 */
export function bosqueSinArbol(
  sprites: readonly Sprite[],
  bosque: readonly number[],
  W: number,
  tapaLaPared: (x: number, y: number) => unknown = () => null,
): number[] {
  const conArbol = new Set<number>();
  const objetos: Caja[] = [];
  for (const s of sprites) {
    if (s.objeto !== undefined && s.src !== null) objetos.push(cajaDeSprite(s));
    else if (esArbol(s.src)) conArbol.add(Math.floor(s.y) * W + Math.floor(s.x));
  }
  return bosque.filter((i) => {
    if (conArbol.has(i)) return false;
    const x = i % W;
    const y = (i - x) / W;
    const tapado = objetos.reduce(
      (n, c) =>
        n +
        Math.max(0, Math.min(c[2], x + 1) - Math.max(c[0], x)) *
          Math.max(0, Math.min(c[3], y + 1) - Math.max(c[1], y)),
      0,
    );
    return tapado < TAPADA_POR_UN_OBJETO && tapaLaPared(x + 0.5, y + 0.5) === null;
  });
}
