/**
 * De lo que devuelve Codex a una hoja de rejilla exacta.
 *
 * La herramienta de imágenes no respeta una rejilla: entrega el tamaño que
 * quiere (1254², 1536×1024…) y reparte las figuras a ojo. No se corta por
 * celdas nominales, que es lo que parte una espada por la mitad: se **buscan
 * las figuras** —componentes conexas del alfa, fundidas si se tocan con un poco
 * de holgura, porque un arma suelta es parte de quien la empuña—, se agrupan en
 * filas por su altura y se ordenan de izquierda a derecha.
 *
 * Después cada figura se escala con UN solo factor para toda la hoja (la escala
 * es una propiedad del personaje, no del fotograma) y se coloca con los pies en
 * `FIGURA.base`. En horizontal, el punto de apoyo de cada clip va a la misma x
 * en todos sus fotogramas —el ancla es por clip— y se elige la más centrada en
 * la que caben todos. Si un fotograma no cabe con margen (un ataque con el
 * brazo extendido), se encoge la hoja ENTERA —nunca un fotograma solo, que
 * haría crecer y menguar al personaje— y se dice cuánto; más de un 15 % es
 * rehacer la hoja.
 */
import sharp, { type OverlayOptions } from 'sharp';
import { FIGURA } from '../../src/shared/arte.js';
import {
  absolutosDe,
  type EstimarTroncos,
  mejorRecolocacion,
  recolocarConElSuelo,
  recolocarConLosPies,
} from './encuadre.js';
import { aRaster, quitarHalo, type Raster } from './recorte.js';

/** Umbral de alfa para decir «aquí hay figura». */
export const ALFA_FIGURA = 64;

export interface Caja {
  x0: number;
  y0: number;
  x1: number; // inclusivo
  y1: number; // inclusivo
  area: number;
}

const ancho = (c: Caja): number => c.x1 - c.x0 + 1;
const alto = (c: Caja): number => c.y1 - c.y0 + 1;

/** Componentes conexas (8-vecindad) del alfa, como cajas con su área. */
export function componentes(r: Raster, umbral = ALFA_FIGURA): Caja[] {
  const { data, width, height } = r;
  const etiqueta = new Int32Array(width * height).fill(-1);
  const cajas: Caja[] = [];
  const pila: number[] = [];
  for (let inicio = 0; inicio < width * height; inicio++) {
    if (etiqueta[inicio] !== -1 || (data[inicio * 4 + 3] as number) < umbral) continue;
    const id = cajas.length;
    const caja: Caja = { x0: width, y0: height, x1: -1, y1: -1, area: 0 };
    etiqueta[inicio] = id;
    pila.push(inicio);
    while (pila.length > 0) {
      const i = pila.pop() as number;
      const x = i % width;
      const y = (i - x) / width;
      caja.area++;
      if (x < caja.x0) caja.x0 = x;
      if (x > caja.x1) caja.x1 = x;
      if (y < caja.y0) caja.y0 = y;
      if (y > caja.y1) caja.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (etiqueta[j] === -1 && (data[j * 4 + 3] as number) >= umbral) {
            etiqueta[j] = id;
            pila.push(j);
          }
        }
      }
    }
    cajas.push(caja);
  }
  return cajas;
}

function seTocan(a: Caja, b: Caja, holgura: number): boolean {
  return (
    a.x0 - holgura <= b.x1 &&
    b.x0 - holgura <= a.x1 &&
    a.y0 - holgura <= b.y1 &&
    b.y0 - holgura <= a.y1
  );
}

/**
 * Las figuras: se tira el polvo (menos del 0,05 % del área de la mayor; un trozo
 * mayor, como una hoja de espada separada de la mano, se queda y se funde después) y se
 * funden las cajas que se tocan con `holgura` píxeles, hasta que nada cambia.
 */
export function figuras(cajas: readonly Caja[], holgura: number): Caja[] {
  const mayor = Math.max(0, ...cajas.map((c) => c.area));
  let grupos = cajas.filter((c) => c.area >= mayor * 0.0005).map((c) => ({ ...c }));
  let cambiado = true;
  while (cambiado) {
    cambiado = false;
    const fuera: Caja[] = [];
    for (const c of grupos) {
      const otra = fuera.find((g) => seTocan(g, c, holgura));
      if (otra === undefined) {
        fuera.push(c);
        continue;
      }
      otra.x0 = Math.min(otra.x0, c.x0);
      otra.y0 = Math.min(otra.y0, c.y0);
      otra.x1 = Math.max(otra.x1, c.x1);
      otra.y1 = Math.max(otra.y1, c.y1);
      otra.area += c.area;
      cambiado = true;
    }
    grupos = fuera;
  }
  return grupos;
}

/** Distancia horizontal entre dos cajas: 0 si se solapan en x. */
function distanciaX(a: Caja, b: Caja): number {
  return Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
}

/** Desde qué parte del área de la mayor figura de una fila un sobrante es una figura de más. */
export const FIGURA_DE_MAS = 0.25;

/**
 * Si una fila trae trozos de más —un jirón suelto, la punta de un arma que no
 * llega a tocar a su dueño—, el más pequeño se funde con la figura más cercana,
 * hasta que quedan `columnas`. Los trozos se juntan por cercanía y no por una
 * holgura fija: con holgura grande, dos figuras vecinas cuya espada casi se
 * toca se fundían en una (5 de 12 atlas del primer lote).
 */
export function fundirSobrantes(fila: Caja[], columnas: number): Caja[] {
  const mayor = Math.max(0, ...fila.map((c) => c.area));
  while (fila.length > columnas) {
    fila.sort((a, b) => a.area - b.area);
    // Lo que sobra es una figura entera, no un trozo: se deja, y la fila falla
    // por figuras de más (un modelo que pinta 9 por fila; fundidas, la celda
    // llevaba dos figuras encogidas).
    if ((fila[0] as Caja).area >= FIGURA_DE_MAS * mayor) break;
    const menor = fila.shift() as Caja;
    let destino = fila[0] as Caja;
    for (const c of fila) if (distanciaX(menor, c) < distanciaX(menor, destino)) destino = c;
    destino.x0 = Math.min(destino.x0, menor.x0);
    destino.y0 = Math.min(destino.y0, menor.y0);
    destino.x1 = Math.max(destino.x1, menor.x1);
    destino.y1 = Math.max(destino.y1, menor.y1);
    destino.area += menor.area;
  }
  return fila;
}

/** Holgura con la que se juntan las piezas de una figura: solo lo que casi se toca. */
const HOLGURA = 2;

/**
 * Las figuras en `filas` filas, ordenadas. Las filas se cortan por los
 * `filas - 1` saltos mayores entre centros verticales consecutivos.
 */
export function enFilas(
  figs: readonly Caja[],
  filas: number,
  porFila: number | readonly number[],
): Caja[][] {
  const porY = [...figs].sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  const centros = porY.map((c) => (c.y0 + c.y1) / 2);
  const saltos = centros
    .slice(1)
    .map((c, i) => ({ i: i + 1, d: c - (centros[i] as number) }))
    .sort((a, b) => b.d - a.d)
    .slice(0, filas - 1)
    .map((s) => s.i)
    .sort((a, b) => a - b);
  const cortes = [0, ...saltos, porY.length];
  const resultado: Caja[][] = [];
  for (let f = 0; f < filas; f++) {
    // Una hoja cuya última fila va incompleta (cinco bajadas: cuatro y una) dice cuántas lleva cada fila.
    const columnas = typeof porFila === 'number' ? porFila : (porFila[f] ?? 0);
    const fila = fundirSobrantes(
      porY.slice(cortes[f], cortes[f + 1]).map((c) => ({ ...c })),
      columnas,
    ).sort((a, b) => a.x0 + a.x1 - (b.x0 + b.x1));
    if (fila.length !== columnas) {
      throw new Error(
        `la fila ${f + 1} tiene ${fila.length} figuras y la hoja pide ${columnas} ` +
          `(en total se encontraron ${figs.length} de ${filas * columnas})`,
      );
    }
    resultado.push(fila);
  }
  return resultado;
}

/** Cuánto se busca el hueco entre dos filas alrededor de su corte nominal, en parte de una fila. */
const BUSQUEDA_DEL_CORTE = 0.15;

/** Lo que devuelve `porRejilla`: las figuras y el crudo del que se recortan. */
export interface CortadoPorRejilla {
  readonly rejilla: Caja[][];
  /**
   * El crudo de donde se recortan: el mismo (sin lo que el corte deja suelto) o, si
   * alguna banda se cortó en columnas, uno nuevo con sus figuras apartadas
   * (`porColumnas`).
   */
  readonly crudo: Raster;
}

/**
 * Las figuras en filas cuando `enFilas` no las cuenta bien: el crudo se corta en
 * `filas` bandas por su rejilla —cada corte, en la fila de píxeles con menos alfa
 * a ±`BUSQUEDA_DEL_CORTE` de una fila del corte nominal— y en cada banda se buscan
 * y se funden las figuras como siempre. Hace falta cuando un arma alta junta dos
 * filas: la espada vertical que piden unas instrucciones toca la figura de abajo y
 * el detector las funde en una (3 de unas 20 hojas de la revisión del 30-10-2026,
 * con las 21 figuras en el crudo). Una banda a la que le siguen faltando figuras se
 * corta en columnas (`porColumnas`). Si tampoco así cuadra, lanza. Borra del crudo
 * los trozos que el corte deja sueltos (`borrarMotasDelCorte`).
 */
export function porRejilla(r: Raster, filas: number, porFila: number): CortadoPorRejilla {
  const { data, width, height } = r;
  const alfaDeLaFila = (y: number) => {
    let s = 0;
    for (let x = 0; x < width; x++) s += data[(y * width + x) * 4 + 3] as number;
    return s;
  };
  const cortes = [0];
  const altoDeFila = height / filas;
  for (let f = 1; f < filas; f++) {
    const nominal = Math.round(f * altoDeFila);
    const radio = Math.round(BUSQUEDA_DEL_CORTE * altoDeFila);
    let mejor = nominal;
    let menor = Number.POSITIVE_INFINITY;
    for (let y = Math.max(1, nominal - radio); y <= Math.min(height - 2, nominal + radio); y++) {
      const a = alfaDeLaFila(y);
      if (a < menor) {
        menor = a;
        mejor = y;
      }
    }
    cortes.push(mejor);
  }
  cortes.push(height);
  const bandas: (Caja[] | FiguraApartada[])[] = [];
  for (let f = 0; f < filas; f++) {
    const y0 = cortes[f] as number;
    const y1 = cortes[f + 1] as number;
    borrarMotasDelCorte(r, y0, y1, () => [0, width], {
      arriba: f > 0,
      abajo: f < filas - 1,
    });
    const fila = fundirSobrantes(
      figuras(
        componentes({
          data: data.subarray(y0 * width * 4, y1 * width * 4),
          width,
          height: y1 - y0,
        }),
        HOLGURA,
      ).map((c) => ({ ...c, y0: c.y0 + y0, y1: c.y1 + y0 })),
      porFila,
    ).sort((a, b) => a.x0 + a.x1 - (b.x0 + b.x1));
    if (fila.length === porFila) {
      bandas.push(fila);
      continue;
    }
    try {
      bandas.push(porColumnas(r, y0, y1, fila, porFila));
    } catch (e) {
      throw new Error(
        `cortada por su rejilla (entre las filas, en y = ${cortes.slice(1, -1).join(', ')}), la banda ${f + 1} tiene ${fila.length} figuras y la hoja pide ${porFila}; ${(e as Error).message}`,
      );
    }
  }
  return apartarLasFiguras(r, cortes, bandas);
}

/** Una figura sacada de su columna: su caja en el crudo y solo sus píxeles. */
interface FiguraApartada {
  readonly caja: Caja;
  readonly img: Raster;
}

/** Lo que queda entre dos figuras apartadas, y a la izquierda de la primera: más que `HOLGURA`. */
const ENTRE_APARTADAS = 8;

/**
 * El crudo con las figuras de las bandas cortadas en columnas una tras otra, a
 * `ENTRE_APARTADAS` px, a la altura en que se pintaron: sus cajas se solapaban en x (el
 * sable de una bajo el codo de la siguiente) y, recortadas por su caja del crudo de
 * Codex, cada celda se llevaba un trozo de la vecina. Las bandas sin cortar van tal cual.
 */
function apartarLasFiguras(
  r: Raster,
  cortes: readonly number[],
  bandas: readonly (Caja[] | FiguraApartada[])[],
): CortadoPorRejilla {
  const apartadas = (b: Caja[] | FiguraApartada[]): b is FiguraApartada[] =>
    b.length > 0 && 'img' in (b[0] as object);
  if (!bandas.some(apartadas)) return { rejilla: bandas as Caja[][], crudo: r };
  const anchoDe = (b: FiguraApartada[]) =>
    b.reduce((s, f) => s + f.img.width + ENTRE_APARTADAS, ENTRE_APARTADAS);
  const width = Math.max(r.width, ...bandas.map((b) => (apartadas(b) ? anchoDe(b) : 0)));
  const crudo: Raster = { data: Buffer.alloc(width * r.height * 4), width, height: r.height };
  const rejilla = bandas.map((b, f) => {
    if (!apartadas(b)) {
      for (let y = cortes[f] as number; y < (cortes[f + 1] as number); y++)
        r.data.copy(crudo.data, y * width * 4, y * r.width * 4, (y + 1) * r.width * 4);
      return b;
    }
    let x = ENTRE_APARTADAS;
    return b.map(({ caja, img }) => {
      for (let y = 0; y < img.height; y++)
        img.data.copy(
          crudo.data,
          ((caja.y0 + y) * width + x) * 4,
          y * img.width * 4,
          (y + 1) * img.width * 4,
        );
      const puesta = { ...caja, x0: x, x1: x + img.width - 1 };
      x += img.width + ENTRE_APARTADAS;
      return puesta;
    });
  });
  return { rejilla, crudo };
}

/**
 * Cuánto se busca el hueco entre dos columnas alrededor de su corte nominal, en parte de
 * una columna: casi hasta el medio de cada una, porque la punta de un sable llega a
 * media columna de la vecina, y sin que dos costuras se toquen.
 */
const BUSQUEDA_ENTRE_COLUMNAS = 0.45;

/**
 * Lo que puede pasar por un corte entre dos columnas, en píxeles opacos y en parte del
 * alto de la mayor figura de la banda: un arma que cruza de una celda a otra (la
 * punta de un sable son unas decenas de píxeles), no un cuerpo.
 */
export const GROSOR_DEL_CORTE = 0.15;

/**
 * Una banda con figuras de menos, cortada en `columnas` columnas (el lanzamiento del
 * granadero, 31-10-2026: en la hoja C, de una fila de 7, el sable de cada figura llega
 * hasta la de al lado y el detector funde las dos; 9 de las 24 hojas C de sus
 * versiones, con las 7 figuras bien pintadas en el crudo). Lo que se reparte es lo que
 * ocupa lo opaco de la banda (de la primera figura a la última: Codex deja márgenes
 * desiguales). Cada corte es una costura, no una recta: el camino de arriba abajo de
 * la banda, de un píxel de lado por fila como mucho, con menos alfa a
 * ±`BUSQUEDA_ENTRE_COLUMNAS` del corte nominal. Con una recta, el sable y la bota de
 * una figura pasaban bajo el codo alzado de la siguiente y cualquier recta cortaba a
 * una de las dos (en 2 de las 9, la punta del sable y la puntera de la bota, y una
 * punta que tocaba la bota de la vecina viajaba a su celda); con la costura, en 8 de
 * las 9 no se pierde ni un píxel. Lo que no separa: la punta de un sable clavada en la
 * pierna de la vecina (1 de las 9) se corta por lo fino del sable y viaja con ella.
 * Si por la costura pasan más de `GROSOR_DEL_CORTE` píxeles opacos, parte un cuerpo
 * —la banda tiene de verdad una figura de menos— y lanza. Lo que la costura deja
 * suelto se borra del crudo (`borrarMotasDelCorte`); la figura de cada columna son sus
 * píxeles, en su caja. Una columna vacía, con dos figuras o solo con un trozo, lanza.
 * Como las cajas de dos columnas se solapan, cada figura sale con sus píxeles
 * (`FiguraApartada`) y `apartarLasFiguras` las aparta.
 */
function porColumnas(
  r: Raster,
  y0: number,
  y1: number,
  fila: readonly Caja[],
  columnas: number,
): FiguraApartada[] {
  const { data, width } = r;
  const alfa = (x: number, y: number) => data[(y * width + x) * 4 + 3] as number;
  if (fila.length === 0) throw new Error('la banda no tiene ninguna figura que cortar en columnas');
  const desde = Math.min(...fila.map((c) => c.x0));
  const hasta = Math.max(...fila.map((c) => c.x1)) + 1;
  const anchoDeColumna = (hasta - desde) / columnas;
  const grosor = GROSOR_DEL_CORTE * Math.max(...fila.map(alto));
  const radio = Math.round(BUSQUEDA_ENTRE_COLUMNAS * anchoDeColumna);
  const altoDeLaBanda = y1 - y0;
  // Las costuras: la x de cada fila de la banda; la primera y la última, los bordes.
  const costuras: Int32Array[] = [new Int32Array(altoDeLaBanda)];
  for (let k = 1; k < columnas; k++) {
    const nominal = Math.round(desde + k * anchoDeColumna);
    const lo = Math.max(1, nominal - radio);
    const hi = Math.min(width - 2, nominal + radio);
    const n = hi - lo + 1;
    // Lo que cuesta llegar a cada píxel (su alfa, un poco por apartarse del nominal al
    // empezar y por cada paso de lado) y de dónde se llega.
    let coste = new Float64Array(n);
    for (let i = 0; i < n; i++) coste[i] = alfa(lo + i, y0) + 0.1 * Math.abs(lo + i - nominal);
    const desdeDonde = new Int8Array(n * altoDeLaBanda);
    for (let y = 1; y < altoDeLaBanda; y++) {
      const nuevo = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let mejor = coste[i] as number;
        let d = 0;
        for (const dx of [-1, 1]) {
          const j = i + dx;
          if (j < 0 || j >= n) continue;
          if ((coste[j] as number) + 1 < mejor) {
            mejor = (coste[j] as number) + 1;
            d = dx;
          }
        }
        nuevo[i] = mejor + alfa(lo + i, y0 + y);
        desdeDonde[y * n + i] = d;
      }
      coste = nuevo;
    }
    let i = 0;
    for (let j = 1; j < n; j++) if ((coste[j] as number) < (coste[i] as number)) i = j;
    const costura = new Int32Array(altoDeLaBanda);
    let opacos = 0;
    for (let y = altoDeLaBanda - 1; y >= 0; y--) {
      costura[y] = lo + i;
      if (alfa(lo + i, y0 + y) >= ALFA_FIGURA) opacos++;
      i += desdeDonde[y * n + i] as number;
    }
    if (opacos > grosor)
      throw new Error(
        `cortada en ${columnas} columnas, el corte ${k} (hacia x = ${nominal}) parte una figura: pasa por ${opacos} píxeles opacos, y un arma no pasa de ${Math.round(grosor)}`,
      );
    costuras.push(costura);
  }
  costuras.push(new Int32Array(altoDeLaBanda).fill(width));
  // Todos los cortes antes de borrar nada: un corte malo no deja el crudo tocado.
  const figs = costuras.slice(0, -1).map((izquierda, k) => {
    const derecha = costuras[k + 1] as Int32Array;
    const entre = (y: number): readonly [number, number] => [
      izquierda[y - y0] as number,
      derecha[y - y0] as number,
    ];
    borrarMotasDelCorte(r, y0, y1, entre, { izquierda: k > 0, derecha: k < columnas - 1 });
    // La columna sola, en la caja que la contiene: lo de fuera de sus costuras, a 0.
    const cx0 = Math.min(...izquierda);
    const cx1 = Math.max(...derecha);
    const w = cx1 - cx0;
    const sola = Buffer.alloc(w * altoDeLaBanda * 4);
    for (let y = 0; y < altoDeLaBanda; y++) {
      const a = izquierda[y] as number;
      const b = derecha[y] as number;
      data.copy(
        sola,
        (y * w + a - cx0) * 4,
        ((y0 + y) * width + a) * 4,
        ((y0 + y) * width + b) * 4,
      );
    }
    const columna: Raster = { data: sola, width: w, height: altoDeLaBanda };
    const piezas = fundirSobrantes(figuras(componentes(columna), HOLGURA), 1);
    if (piezas.length !== 1)
      throw new Error(
        `cortada en ${columnas} columnas, la columna ${k + 1} tiene ${piezas.length} figuras`,
      );
    const c = piezas[0] as Caja;
    const img: Raster = {
      data: Buffer.alloc(ancho(c) * alto(c) * 4),
      width: ancho(c),
      height: alto(c),
    };
    for (let y = c.y0; y <= c.y1; y++)
      sola.copy(img.data, (y - c.y0) * img.width * 4, (y * w + c.x0) * 4, (y * w + c.x1 + 1) * 4);
    return {
      caja: { ...c, x0: c.x0 + cx0, x1: c.x1 + cx0, y0: c.y0 + y0, y1: c.y1 + y0 },
      img,
    };
  });
  // Una columna con solo un trozo (el tramo de un arma entre dos cortes, en una banda
  // con una figura de menos) no es una figura.
  const mayor = Math.max(...figs.map((f) => f.caja.area));
  const trozo = figs.findIndex((f) => f.caja.area < FIGURA_DE_MAS * mayor);
  if (trozo !== -1)
    throw new Error(
      `cortada en ${columnas} columnas, en la columna ${trozo + 1} no hay una figura: solo un trozo de ${(figs[trozo] as FiguraApartada).caja.area} píxeles`,
    );
  return figs;
}

/**
 * Lo que el corte deja suelto en una banda o una columna (QA del 30-10-2026, H8; en
 * columnas, el granadero del 31-10-2026): un trozo que toca un corte de su zona (un
 * píxel con un vecino al otro lado de uno de sus `lados`) y es pequeño (menos de
 * `FIGURA_DE_MAS` de la mayor pieza de la zona) es la punta de un
 * arma de la fila o la columna de al lado, cortada; si se queda, se funde con la
 * figura más cercana y viaja a su celda como una mota junto a los pies. Se borra del
 * crudo (el alfa a 0), que es de donde se recortan las figuras. La zona son las filas
 * de `y0` a `y1` y, en cada una, las x de `entre(y)` (de la primera a la última sin ella).
 */
function borrarMotasDelCorte(
  r: Raster,
  y0: number,
  y1: number,
  entre: (y: number) => readonly [number, number],
  lados: {
    readonly arriba?: boolean;
    readonly abajo?: boolean;
    readonly izquierda?: boolean;
    readonly derecha?: boolean;
  },
): void {
  const { data, width, height } = r;
  const opaco = (x: number, y: number) => (data[(y * width + x) * 4 + 3] as number) >= ALFA_FIGURA;
  const limites = Array.from({ length: y1 - y0 }, (_, i) => entre(y0 + i));
  const dentro = (x: number, y: number) => {
    if (y < y0 || y >= y1) return false;
    const [a, b] = limites[y - y0] as readonly [number, number];
    return x >= a && x < b;
  };
  // Si el vecino de fuera (x, y) está al otro lado de un corte, y no del borde del crudo.
  const alOtroLado = (x: number, y: number) => {
    if (y < y0) return lados.arriba === true;
    if (y >= y1) return lados.abajo === true;
    const [a] = limites[y - y0] as readonly [number, number];
    return x < a ? lados.izquierda === true : lados.derecha === true;
  };
  const visto = new Set<number>();
  const piezas: { pixeles: number[]; toca: boolean }[] = [];
  for (let y = y0; y < y1; y++) {
    const [a, b] = limites[y - y0] as readonly [number, number];
    for (let x = a; x < b; x++) {
      const inicio = y * width + x;
      if (visto.has(inicio) || !opaco(x, y)) continue;
      const pixeles: number[] = [];
      let toca = false;
      const pila = [inicio];
      visto.add(inicio);
      while (pila.length > 0) {
        const i = pila.pop() as number;
        pixeles.push(i);
        const px = i % width;
        const py = (i - px) / width;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx;
            const ny = py + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const j = ny * width + nx;
            if (!dentro(nx, ny)) {
              if (alOtroLado(nx, ny)) toca = true;
            } else if (opaco(nx, ny) && !visto.has(j)) {
              visto.add(j);
              pila.push(j);
            }
          }
      }
      piezas.push({ pixeles, toca });
    }
  }
  const mayor = Math.max(0, ...piezas.map((p) => p.pixeles.length));
  for (const p of piezas)
    if (p.toca && p.pixeles.length < FIGURA_DE_MAS * mayor)
      for (const i of p.pixeles) data[i * 4 + 3] = 0;
}

/**
 * Lo fino de una figura no es su cuerpo (QA del repintado, 30-10-2026, el piquero
 * imperial: «se mueve mucho el personaje… por la pica tan larga»): un asta, una
 * pica, una lanza, un arco o una espada de pocos píxeles de grueso. El radio de la
 * apertura que lo quita, en parte del lado mayor de la caja de la figura: con 0,02,
 * una figura de 160 px quita lo de menos de 7 px de grueso y deja brazos y piernas.
 */
export const GROSOR_DE_LO_FINO = 0.02;

/** La silueta de un cuerpo: su máscara en la caja (1 = cuerpo) y la caja de lo que queda. */
export interface Cuerpo {
  readonly mascara: Uint8Array;
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
  /** La caja de lo que queda, en coordenadas absolutas e inclusiva. */
  readonly caja: readonly [number, number, number, number];
}

/** Las sumas de una máscara, para contar los unos de una ventana de un vistazo. */
function sumasDe(m: Uint8Array, w: number, h: number): Int32Array {
  const s = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let fila = 0;
    for (let x = 0; x < w; x++) {
      fila += m[y * w + x] as number;
      s[(y + 1) * (w + 1) + x + 1] = (s[y * (w + 1) + x + 1] as number) + fila;
    }
  }
  return s;
}

/** Cuántos unos hay en la ventana de radio `r` alrededor de (x, y), recortada a la máscara. */
function enLaVentana(s: Int32Array, w: number, h: number, x: number, y: number, r: number): number {
  const a = Math.max(0, x - r);
  const b = Math.max(0, y - r);
  const c = Math.min(w, x + r + 1);
  const d = Math.min(h, y + r + 1);
  const W = w + 1;
  return (
    (s[d * W + c] as number) -
    (s[b * W + c] as number) -
    (s[d * W + a] as number) +
    (s[b * W + a] as number)
  );
}

/**
 * El cuerpo de una figura en su caja `[x0, y0, x1, y1]`: la silueta (alfa ≥ `umbral`)
 * abierta (erosión y dilatación con un cuadrado de radio `GROSOR_DE_LO_FINO` del lado
 * mayor), que quita lo fino, y con lo de la silueta que queda a menos de ese radio de
 * lo abierto (las puntas del pie). Si la apertura se lo come todo, la silueta entera.
 */
export function cuerpoDe(
  alfa: (x: number, y: number) => number,
  [x0, y0, x1, y1]: readonly [number, number, number, number],
  umbral = ALFA_FIGURA,
): Cuerpo {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const silueta = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) silueta[y * w + x] = alfa(x0 + x, y0 + y) >= umbral ? 1 : 0;
  const r = Math.max(1, Math.round(GROSOR_DE_LO_FINO * Math.max(w, h)));
  const lleno = (2 * r + 1) * (2 * r + 1);
  const s = sumasDe(silueta, w, h);
  const erosion = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (silueta[y * w + x] && enLaVentana(s, w, h, x, y, r) === lleno) erosion[y * w + x] = 1;
  const se = sumasDe(erosion, w, h);
  const abierta = new Uint8Array(w * h);
  let hay = false;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (silueta[y * w + x] && enLaVentana(se, w, h, x, y, r) > 0) {
        abierta[y * w + x] = 1;
        hay = true;
      }
  // La apertura redondea las puntas del cuerpo (los dedos del pie, a 2 px del suelo en
  // el Y Bot): se le devuelve lo de la silueta que queda a menos de `r` de lo abierto.
  // Lo fino que sale más lejos (la pica) sigue fuera.
  let mascara = silueta;
  if (hay) {
    const sa = sumasDe(abierta, w, h);
    mascara = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (silueta[y * w + x] && enLaVentana(sa, w, h, x, y, r) > 0) mascara[y * w + x] = 1;
  }
  let cx0 = w;
  let cy0 = h;
  let cx1 = -1;
  let cy1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mascara[y * w + x]) {
        if (x < cx0) cx0 = x;
        if (x > cx1) cx1 = x;
        if (y < cy0) cy0 = y;
        cy1 = y;
      }
  if (cx1 < 0) throw new Error('una figura sin cuerpo: la silueta está vacía');
  return { mascara, x0, y0, w, h, caja: [x0 + cx0, y0 + cy0, x0 + cx1, y0 + cy1] };
}

/**
 * El punto de apoyo de una figura dentro de su caja `[x0, y0, x1, y1]`
 * (inclusiva), leyendo el alfa con `alfa(x, y)`: la fila más baja del CUERPO, y en
 * horizontal la mediana de los píxeles del tronco (entre el 25 % y el 75 % de la
 * altura del cuerpo). El cuerpo es la silueta sin lo fino (`cuerpoDe`): la punta de
 * una pica por debajo del pie no es el suelo, ni el asta cruzada mueve la mediana.
 *
 * Del tronco y no de los pies: en la guardia abierta del reposo la franja más
 * baja es solo el pie adelantado, y anclar ahí dejaba al templario medio cuerpo
 * a la derecha de su casilla. Y la mediana y no el centro de la caja, porque una
 * espada extendida mueve la caja y no el cuerpo.
 *
 * La comparten el empaquetado, que coloca, y `derivar`, que mide: una sola regla
 * para los dos, o el ancla escrita y la medida divergen. Y el maniquí, al medir su
 * hoja de pose (`escalaDePose`): los dos lados se miden igual.
 */
export function apoyoEn(
  alfa: (x: number, y: number) => number,
  caja: readonly [number, number, number, number],
  umbral = ALFA_FIGURA,
): [number, number] {
  const c = cuerpoDe(alfa, caja, umbral);
  const [, by0, , by1] = c.caja;
  const h = by1 - by0 + 1;
  const xs: number[] = [];
  for (let y = by0 + Math.floor(h * 0.25); y <= by0 + Math.floor(h * 0.75); y++) {
    for (let x = 0; x < c.w; x++) if (c.mascara[(y - c.y0) * c.w + x]) xs.push(c.x0 + x);
  }
  if (xs.length === 0) throw new Error('una figura sin tronco: no hay píxeles a media altura');
  xs.sort((a, b) => a - b);
  return [xs[Math.floor(xs.length / 2)] as number, by1];
}

/** El apoyo de una figura de `r`, en coordenadas de su caja. */
export function apoyo(r: Raster, c: Caja, umbral = ALFA_FIGURA): [number, number] {
  const [x, y] = apoyoEn(
    (x, y) => r.data[(y * r.width + x) * 4 + 3] as number,
    [c.x0, c.y0, c.x1, c.y1],
    umbral,
  );
  return [x - c.x0, y - c.y0];
}

function mediana(v: readonly number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] as number;
}

export interface Empaquetado {
  readonly png: Buffer;
  readonly escala: number;
  /** La altura del reposo que se pidió y la que salió, si hubo que reducirla para que cupiera. */
  readonly alturaPedida: number;
  readonly alturaFinal: number;
  /** Dónde quedó el apoyo de cada clip en su celda: lo verifica después `derivar`. */
  readonly apoyoPorFila: readonly (readonly [number, number])[];
  /**
   * Si las figuras se contaron cortando el crudo por su rejilla (`porRejilla`)
   * porque `enFilas` no las contaba: su motivo.
   */
  readonly porRejilla?: string;
  /**
   * C1 (`encuadre.ts`): cuánto se movió cada fotograma de cada fila para que el
   * tronco siga a la cadera del maniquí; `null` en una fila que no se tocó.
   */
  readonly encuadre?: readonly (readonly (readonly [number, number])[] | null)[];
  /**
   * Con la pose mandando en la posición: cómo se pasa de la hoja del maniquí al
   * atlas, `atlas = origen + k · (pose − apoyoReposo)`. Lo usa la revisión.
   */
  readonly deLaPose?: {
    readonly k: number;
    readonly origen: readonly [number, number];
    readonly apoyoReposo: readonly [number, number];
    /** Si la posición la puso el maniquí; si no, cada figura va por su apoyo. */
    readonly posicion: boolean;
    /** Cuánto más arriba va cada fila (`EscalaDePose.elevaciones`): resta a `origen`. */
    readonly elevaciones?: readonly number[];
  };
}

/**
 * La escala medida contra la referencia de pose, celda a celda. Hace falta
 * cuando las hojas de una misma figura no empiezan por el reposo: la hoja B de
 * 8 direcciones empieza por el ataque, con la espada en alto, y medida por su
 * primera fila salía más pequeña que la A. Como el maniquí lleva el mismo
 * atrezo, cada figura pintada se compara con la suya del maniquí.
 */
export interface EscalaDePose {
  /** El lado de la celda de la hoja del maniquí. */
  readonly lado: number;
  /**
   * La silueta del maniquí en cada celda, [fila][columna]: `lado`×`lado`, 1 donde
   * hay maniquí o atrezo. Contra ella se ajusta la escala (`escalaPorSilueta`).
   */
  readonly siluetas: readonly (readonly Uint8Array[])[];
  /** Alto del maniquí en reposo: el que tiene que medir `alturaObjetivo`. */
  readonly reposo: number;
  /**
   * El apoyo del maniquí en cada celda y en su reposo (`apoyoEn`). Con ellos la
   * pose manda también en DÓNDE va cada figura: se coloca desplazada lo mismo que
   * el maniquí respecto a su reposo. Colocando cada una por su propio apoyo, un
   * cadáver cuyo píxel más bajo no es el de los pies quedaba levitando.
   */
  readonly apoyos: readonly (readonly (readonly [number, number])[])[];
  readonly apoyoReposo: readonly [number, number];
  /**
   * Si la posición la manda el maniquí. Solo en la hoja de ataque, daño y
   * muerte: en la marcha, el píxel más bajo del maniquí salta de un pie a otro
   * según cuál esté más cerca de la cámara y, con las piernas pintadas en otra
   * fase, la figura daba saltitos. Ahí cada figura se apoya por sus pies.
   */
  readonly posicion: boolean;
  /**
   * Cuánto más arriba va cada fila de la hoja (`ELEVACION_DEL_CADAVER` en la de
   * la muerte); su ancla sube lo mismo. Sin él, ninguna.
   */
  readonly elevaciones?: readonly number[];
  /**
   * El tronco del maniquí en cada celda, [fila][columna], en píxeles de su hoja:
   * la media de sus dos caderas y sus dos hombros (`*.huesos.json`). Con él, cada
   * fotograma se mueve para que el tronco pintado lo siga (C1, `encuadre.ts`); sin
   * él, no.
   */
  readonly caderas?: readonly (readonly (readonly [number, number])[])[];
  /** Qué filas son un bucle: entonces del último fotograma se vuelve al primero. */
  readonly enBucle?: readonly boolean[];
  /** Sin `caderas`, por qué: lo apunta la procedencia. */
  readonly sinTronco?: string;
}

/** Cuánto se busca alrededor de la escala que dan las cajas, por arriba y por abajo. */
const BUSQUEDA_DE_ESCALA = 0.35;

/**
 * La escala de la hoja (píxeles del maniquí por píxel pintado) que mejor
 * superpone cada figura pintada a la del maniquí, apoyadas las dos por su
 * apoyo: la mediana de la mejor de cada celda. Se compara la SILUETA entera y
 * no el alto de la caja porque el alto engaña en las dos direcciones: el
 * maniquí lleva siempre el arma entera y, de espaldas, el asta se le junta con
 * la cabeza; el pintor la acorta, la tapa o la dibuja más gruesa. Medido por la
 * caja, el escudero salía 1,7 veces más alto de espaldas que de frente.
 */
function escalaPorSilueta(
  r: Raster,
  rejilla: readonly (readonly Caja[])[],
  pose: EscalaDePose,
): number {
  const lado = pose.lado;
  const escalas: number[] = [];
  for (const [f, fila] of rejilla.entries()) {
    for (const [col, c] of fila.entries()) {
      const sil = pose.siluetas[f]?.[col];
      const ap = pose.apoyos[f]?.[col];
      if (sil === undefined || ap === undefined)
        throw new Error(`la pose no tiene la celda ${f + 1}·${col + 1}`);
      let y0 = lado;
      let y1 = -1;
      let x0 = lado;
      let x1 = -1;
      for (let y = 0; y < lado; y++)
        for (let x = 0; x < lado; x++)
          if (sil[y * lado + x]) {
            if (y < y0) y0 = y;
            y1 = y;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
          }
      if (y1 < 0) throw new Error(`la pose está vacía en la celda ${f + 1}·${col + 1}`);
      const [ax, ay] = apoyo(r, c);
      const pintada = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < ancho(c) && y < alto(c)
          ? (r.data[((c.y0 + y) * r.width + c.x0 + x) * 4 + 3] as number) >= ALFA_FIGURA
          : false;
      const s0 = (y1 - y0 + 1) / alto(c);
      let mejor = s0;
      let mejorIou = -1;
      for (let t = 1 - BUSQUEDA_DE_ESCALA; t <= 1 + BUSQUEDA_DE_ESCALA + 1e-9; t += 0.01) {
        const s = s0 * t;
        // La región: la caja del maniquí unida a la de la figura llevada a la pose.
        const rx0 = Math.max(0, Math.min(x0, Math.floor(ap[0] - ax * s)));
        const rx1 = Math.min(lado - 1, Math.max(x1, Math.ceil(ap[0] + (ancho(c) - ax) * s)));
        const ry0 = Math.max(0, Math.min(y0, Math.floor(ap[1] - ay * s)));
        const ry1 = Math.min(lado - 1, Math.max(y1, Math.ceil(ap[1] + (alto(c) - ay) * s)));
        let inter = 0;
        let union = 0;
        for (let y = ry0; y <= ry1; y += 2) {
          for (let x = rx0; x <= rx1; x += 2) {
            const m = sil[y * lado + x] === 1;
            const p = pintada(Math.round(ax + (x - ap[0]) / s), Math.round(ay + (y - ap[1]) / s));
            if (m || p) union++;
            if (m && p) inter++;
          }
        }
        const iou = union === 0 ? 0 : inter / union;
        if (iou > mejorIou) {
          mejorIou = iou;
          mejor = s;
        }
      }
      escalas.push(mejor);
    }
  }
  return mediana(escalas);
}

/** Una figura ya escalada: su imagen, su tamaño y su apoyo dentro de ella. */
interface Pieza {
  readonly img: Buffer;
  readonly w: number;
  readonly h: number;
  readonly ax: number;
  readonly ay: number;
}

/** Margen libre dentro de cada celda: una figura que toca el borde se cortaría. */
export const MARGEN = 4;
/** Cuánto se acepta encoger la hoja para que quepa un fotograma ancho. Más, es rehacerla. */
const REDUCCION_MAXIMA = 0.85;

/**
 * La línea de los pies en una celda de `celda` píxeles: la de `FIGURA` (228 de
 * 256), en la misma proporción. Para la celda de 384 de las monturas, 342.
 */
export function baseEnCelda(celda: number): number {
  return Math.round((FIGURA.base * celda) / FIGURA.celda);
}

/**
 * La hoja entera: `filas` × `FIGURA.columnas` celdas de `celda` (256 a pie, 384
 * montadas).
 *
 * Sin `pose`, la escala sale de la mediana del reposo pintado: era el camino del
 * atlas de una dirección, retirado el 03-10-2026. Hoy todo encargo de atlas
 * lleva `ocho` y el trabajador pasa siempre la pose; el camino sin ella **solo lo
 * usan los tests del empaquetado**, que prueban la rejilla con hojas de mentira
 * sin maniquí. Se deja a propósito (decisión de la vuelta de simplify) en vez de
 * fabricarles una pose.
 */
export async function empaquetar(
  r: Raster,
  filas: number,
  alturaObjetivo: number,
  celda: number = FIGURA.celda,
  pose?: EscalaDePose,
  /**
   * El estimador de pose (el entorno de visión, `revision/vision.ts`): el tronco que ve
   * en cada celda pintada (media de caderas y hombros), o `null`. Sin él (CI, o sin el
   * entorno), C1 se queda con la correlación entre vecinos.
   */
  estimarTroncos?: EstimarTroncos,
): Promise<Empaquetado> {
  const { columnas } = FIGURA;
  const base = baseEnCelda(celda);
  const figs = figuras(componentes(r), HOLGURA);
  let rejilla: Caja[][];
  let motivoDeLaRejilla: string | undefined;
  // De donde se recortan las figuras: el crudo, o el de `porRejilla` si las aparta.
  let deDonde = r;
  try {
    rejilla = enFilas(figs, filas, columnas);
  } catch (e) {
    // Una hoja buena no se tira porque un arma junte dos filas: se corta por su rejilla.
    const motivo = (e as Error).message;
    try {
      ({ rejilla, crudo: deDonde } = porRejilla(r, filas, columnas));
    } catch (e2) {
      throw new Error(`${motivo}; ${(e2 as Error).message}`);
    }
    motivoDeLaRejilla = `contadas cortando el crudo por su rejilla: ${motivo}`;
    console.log(`  · ${motivoDeLaRejilla}`);
  }
  const medidas = rejilla.map((fila) =>
    fila.map((c) => {
      const [ax, ay] = apoyo(deDonde, c);
      return { c, ax, ay, w: ancho(c) };
    }),
  );

  // La escala que pide el reposo, y la mayor con la que cabe cada fila con su
  // margen: en horizontal, el apoyo común de la fila deja sitio a la figura
  // que más sobresale por cada lado; en vertical, los pies están en `base`.
  const pedida =
    pose === undefined
      ? alturaObjetivo / mediana((rejilla[0] as Caja[]).map(alto))
      : (escalaPorSilueta(deDonde, rejilla, pose) * alturaObjetivo) / pose.reposo;
  const cabe = Math.min(
    ...medidas.map((fila) => {
      const izquierda = Math.max(...fila.map((m) => m.ax));
      const derecha = Math.max(...fila.map((m) => m.w - m.ax));
      const arriba = Math.max(...fila.map((m) => m.ay));
      return Math.min(
        (celda - 2 * MARGEN - 2) / (izquierda + derecha),
        (base - MARGEN - 1) / arriba,
      );
    }),
  );
  if (cabe < pedida * REDUCCION_MAXIMA) {
    throw new Error(
      `para que quepa cada fotograma en su celda habría que encoger la hoja un ` +
        `${Math.round((1 - cabe / pedida) * 100)} %: el reposo quedaría a ` +
        `${Math.round(alturaObjetivo * (cabe / pedida))} px. Pide figuras más compactas`,
    );
  }
  const escala = Math.min(pedida, cabe);

  const fuente = await sharp(deDonde.data, {
    raw: { width: deDonde.width, height: deDonde.height, channels: 4 },
  })
    .png()
    .toBuffer();
  const capas: OverlayOptions[] = [];
  const apoyoPorFila: [number, number][] = [];
  const encuadre: ((readonly [number, number])[] | null)[] = [];
  const k = (alturaObjetivo / (pose?.reposo ?? 1)) * (escala / pedida);
  for (const [f, fila] of medidas.entries()) {
    const piezas = await Promise.all(
      fila.map(async ({ c, ax, ay }): Promise<Pieza> => {
        const w = Math.max(1, Math.round(ancho(c) * escala));
        const h = Math.max(1, Math.round(alto(c) * escala));
        // Mitchell y no Lanczos: el anillo de Lanczos deja un fleco de alfa
        // bajo alrededor de la figura, que es justo el halo que se acaba de quitar.
        const img = await sharp(fuente)
          .extract({ left: c.x0, top: c.y0, width: ancho(c), height: alto(c) })
          .resize(w, h, { kernel: 'mitchell' })
          .png()
          .toBuffer();
        return { img, w, h, ax: Math.round(ax * escala), ay: Math.round(ay * escala) };
      }),
    );
    // Lo que deja el margen para el sitio de una pieza de `tam` en su celda.
    const dentro = (v: number, tam: number) => Math.min(celda - tam - MARGEN, Math.max(MARGEN, v));
    // Dónde va cada figura en su celda, antes de C1.
    let colocadas: (Pieza & { readonly izquierda: number; readonly arriba: number })[];
    if (pose?.posicion === true) {
      // Cada figura donde el maniquí respecto a su reposo, a la escala de la hoja;
      // si así se saliera de su celda, se mete dentro (lo que entra en la celda manda).
      const x0 = Math.round(celda / 2);
      const suelo = base - (pose.elevaciones?.[f] ?? 0);
      colocadas = piezas.map((p, col) => {
        const a = pose.apoyos[f]?.[col];
        if (a === undefined)
          throw new Error(`la pose no tiene apoyo en la celda ${f + 1}·${col + 1}`);
        const dx = Math.round(k * (a[0] - pose.apoyoReposo[0]));
        const dy = Math.round(k * (a[1] - pose.apoyoReposo[1]));
        return {
          ...p,
          izquierda: dentro(x0 + dx - p.ax, p.w),
          arriba: dentro(suelo + dy - p.ay, p.h),
        };
      });
      apoyoPorFila.push([x0, suelo]);
    } else {
      // La x de apoyo del clip: la más cercana al centro en la que caben todos.
      const minimo = Math.max(...piezas.map((p) => p.ax)) + MARGEN;
      const maximo = Math.min(...piezas.map((p) => celda - (p.w - p.ax))) - MARGEN;
      const x = Math.min(maximo, Math.max(minimo, Math.round(celda / 2)));
      // Lo que cuelga por debajo del pie (la punta de una pica: el apoyo es del cuerpo,
      // `cuerpoDe`) no se sale de la celda: si no cabe, la figura sube lo justo.
      colocadas = piezas.map((p) => ({
        ...p,
        izquierda: x - p.ax,
        arriba: Math.min(base - p.ay, celda - MARGEN - p.h),
      }));
      apoyoPorFila.push([x, base]);
    }
    // C1: el tronco pintado sigue al del maniquí, dentro del margen.
    const caderas = pose?.caderas?.[f];
    if (caderas !== undefined && caderas.length === colocadas.length) {
      // Cada celda como quedará en la hoja: con la pasada del halo que lleva la hoja
      // entera al final. Sin ella, en la muerte (pares de NCC cerca de 0,5) C1 medía un
      // par que en la hoja hecha pasaba el umbral, y el salto que no veía se quedaba.
      const celdas = await Promise.all(
        colocadas.map(async (p) => {
          const crudoDeLaCelda = await sharp({
            create: {
              width: celda,
              height: celda,
              channels: 4,
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            },
          })
            .composite([{ input: p.img, left: p.izquierda, top: p.arriba }])
            .raw()
            .toBuffer();
          const limpia = quitarHalo({ data: crudoDeLaCelda, width: celda, height: celda });
          return { lado: celda, data: new Uint8Array(limpia.data) };
        }),
      );
      // Dónde cae el punto más bajo del maniquí en cada fotograma, en la celda: el
      // suelo de ese fotograma (con la cámara a 25°, el pie que avanza baja en pantalla).
      const reposo = pose?.apoyoReposo[1] ?? 0;
      const suelo = base - (pose?.elevaciones?.[f] ?? 0);
      const pies = colocadas.map((_, col) =>
        Math.round(suelo + k * ((pose?.apoyos[f]?.[col]?.[1] ?? reposo) - reposo)),
      );
      const troncos = caderas.map(([x, y]) => [k * x, k * y] as const);
      // El estimador de pose, si lo hay: la medida absoluta del tronco (`absolutosDe`).
      const estimados = estimarTroncos === undefined ? undefined : await estimarTroncos(celdas);
      const bucle = pose?.enBucle?.[f] === true;
      // Lo que cabe subir cada figura sin salirse del margen de su celda.
      const subeComoMucho = colocadas.map((p) => Math.max(0, p.arriba - MARGEN));
      // Con el estimador (la señal absoluta, primero si la hay) y sin él.
      const conEstimador =
        estimados === undefined
          ? []
          : [
              recolocarConLosPies(celdas, troncos, bucle, pies, {
                absolutos: absolutosDe(estimados, troncos),
                subeComoMucho,
              }).desplazamientos,
            ];
      const nueva = recolocarConLosPies(celdas, troncos, bucle, pies, {
        subeComoMucho,
      }).desplazamientos;
      // La regla de antes (la línea fija del suelo) y ninguna, por si la nueva pierde
      // en un clip: se queda la que menos salta (`mejorRecolocacion`).
      const alzas = colocadas.map((_, col) =>
        Math.max(0, Math.round(k * (reposo - (pose?.apoyos[f]?.[col]?.[1] ?? reposo)))),
      );
      const antes = recolocarConElSuelo(celdas, troncos, bucle, suelo, alzas).desplazamientos;
      // Cada una, con lo que de verdad cabe en la celda (`dentro`): así se mide lo que queda.
      const enLaCelda = (ds: readonly (readonly [number, number])[]) =>
        colocadas.map((p, col) => {
          const [dx, dy] = ds[col] ?? [0, 0];
          return [
            dentro(p.izquierda + dx, p.w) - p.izquierda,
            dentro(p.arriba + dy, p.h) - p.arriba,
          ] as const;
        });
      const { desplazamientos } = mejorRecolocacion(
        celdas,
        troncos,
        bucle,
        [...conEstimador, nueva, antes, celdas.map(() => [0, 0] as const)].map(enLaCelda),
      );
      const movidas = colocadas.map((p, col) => {
        const [dx, dy] = desplazamientos[col] ?? [0, 0];
        return {
          ...p,
          izquierda: dentro(p.izquierda + dx, p.w),
          arriba: dentro(p.arriba + dy, p.h),
        };
      });
      encuadre.push(
        movidas.map(
          (m, col) =>
            [
              m.izquierda - (colocadas[col]?.izquierda ?? m.izquierda),
              m.arriba - (colocadas[col]?.arriba ?? m.arriba),
            ] as const,
        ),
      );
      colocadas = movidas;
    } else encuadre.push(null);
    for (const [col, p] of colocadas.entries())
      capas.push({ input: p.img, left: col * celda + p.izquierda, top: f * celda + p.arriba });
  }

  const crudo = await sharp({
    create: {
      width: columnas * celda,
      height: filas * celda,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(capas)
    .raw()
    .toBuffer();
  // El remuestreo vuelve a dejar cantos tenues sueltos: otra pasada del recorte.
  const limpio = quitarHalo({ data: crudo, width: columnas * celda, height: filas * celda });
  const png = await sharp(limpio.data, {
    raw: { width: limpio.width, height: limpio.height, channels: 4 },
  })
    .png()
    .toBuffer();
  return {
    png,
    escala,
    alturaPedida: alturaObjetivo,
    alturaFinal: Math.round(alturaObjetivo * (escala / pedida)),
    apoyoPorFila,
    ...(motivoDeLaRejilla === undefined ? {} : { porRejilla: motivoDeLaRejilla }),
    ...(encuadre.some((e) => e !== null) ? { encuadre } : {}),
    ...(pose === undefined
      ? {}
      : {
          deLaPose: {
            k,
            origen: [Math.round(celda / 2), base] as const,
            apoyoReposo: pose.apoyoReposo,
            posicion: pose.posicion,
            ...(pose.elevaciones === undefined ? {} : { elevaciones: pose.elevaciones }),
          },
        }),
  };
}

/** Una figura suelta (lámina de identidad, objeto del mapa) recortada a su contenido con margen. */
export async function recortarAlContenido(r: Raster, margen: number): Promise<Buffer> {
  const figs = figuras(componentes(r), HOLGURA);
  if (figs.length === 0) throw new Error('la imagen no tiene nada opaco tras el recorte');
  const x0 = Math.max(0, Math.min(...figs.map((c) => c.x0)) - margen);
  const y0 = Math.max(0, Math.min(...figs.map((c) => c.y0)) - margen);
  const x1 = Math.min(r.width - 1, Math.max(...figs.map((c) => c.x1)) + margen);
  const y1 = Math.min(r.height - 1, Math.max(...figs.map((c) => c.y1)) + margen);
  return sharp(r.data, { raw: { width: r.width, height: r.height, channels: 4 } })
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .png()
    .toBuffer();
}

/**
 * Una figura de una lámina de giro (dos filas de cuatro, en el orden de
 * `NOMBRES_DE_DIRECCION`), recortada a su contenido con aire alrededor
 * (`Referencia.figura`). Se buscan como las de cualquier hoja, porque el giro no
 * va en una rejilla exacta; si dos se tocan (la espada de una sobre el escudo de
 * la de al lado), por su casilla de la rejilla de 4 × 2.
 */
export async function figuraDeLaLamina(lamina: Buffer, d: number): Promise<Buffer> {
  const r = await aRaster(lamina);
  const fila = Math.floor(d / 4);
  const col = d % 4;
  let c: Caja | undefined;
  try {
    c = enFilas(figuras(componentes(r), 2), 2, 4)[fila]?.[col];
  } catch {
    const ancho = Math.floor(r.width / 4);
    const alto = Math.floor(r.height / 2);
    const casilla = await sharp(lamina)
      .extract({ left: col * ancho, top: fila * alto, width: ancho, height: alto })
      .png()
      .toBuffer();
    const t = figuras(componentes(await aRaster(casilla)), 2).sort((a, b) => b.area - a.area)[0];
    if (t !== undefined)
      c = {
        ...t,
        x0: col * ancho + t.x0,
        y0: fila * alto + t.y0,
        x1: col * ancho + t.x1,
        y1: fila * alto + t.y1,
      };
  }
  if (c === undefined) throw new Error(`la lámina de giro no tiene la figura ${d + 1}`);
  const aire = 40;
  return sharp(lamina)
    .extract({ left: c.x0, top: c.y0, width: c.x1 - c.x0 + 1, height: c.y1 - c.y0 + 1 })
    .extend({
      top: aire,
      bottom: aire,
      left: aire,
      right: aire,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}
