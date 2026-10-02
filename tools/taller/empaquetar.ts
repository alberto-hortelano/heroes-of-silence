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
import { quitarHalo, type Raster } from './recorte.js';

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

/**
 * Si una fila trae trozos de más —un jirón suelto, la punta de un arma que no
 * llega a tocar a su dueño—, el más pequeño se funde con la figura más cercana,
 * hasta que quedan `columnas`. Los trozos se juntan por cercanía y no por una
 * holgura fija: con holgura grande, dos figuras vecinas cuya espada casi se
 * toca se fundían en una (5 de 12 atlas del primer lote).
 */
export function fundirSobrantes(fila: Caja[], columnas: number): Caja[] {
  while (fila.length > columnas) {
    fila.sort((a, b) => a.area - b.area);
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
export function enFilas(figs: readonly Caja[], filas: number, columnas: number): Caja[][] {
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

/**
 * El punto de apoyo de una figura dentro de su caja `[x0, y0, x1, y1]`
 * (inclusiva), leyendo el alfa con `alfa(x, y)`: la fila más baja, y en
 * horizontal la mediana de los píxeles del TRONCO (entre el 25 % y el 75 % de
 * la altura).
 *
 * Del tronco y no de los pies: en la guardia abierta del reposo la franja más
 * baja es solo el pie adelantado, y anclar ahí dejaba al templario medio cuerpo
 * a la derecha de su casilla. Y la mediana y no el centro de la caja, porque una
 * espada extendida mueve la caja y no el cuerpo.
 *
 * La comparten el empaquetado, que coloca, y `derivar`, que mide: una sola regla
 * para los dos, o el ancla escrita y la medida divergen.
 */
export function apoyoEn(
  alfa: (x: number, y: number) => number,
  [x0, y0, x1, y1]: readonly [number, number, number, number],
  umbral = ALFA_FIGURA,
): [number, number] {
  const h = y1 - y0 + 1;
  const xs: number[] = [];
  for (let y = y0 + Math.floor(h * 0.25); y <= y0 + Math.floor(h * 0.75); y++) {
    for (let x = x0; x <= x1; x++) if (alfa(x, y) >= umbral) xs.push(x);
  }
  if (xs.length === 0) throw new Error('una figura sin tronco: no hay píxeles a media altura');
  xs.sort((a, b) => a - b);
  return [xs[Math.floor(xs.length / 2)] as number, y1];
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
   * Con la pose mandando en la posición: cómo se pasa de la hoja del maniquí al
   * atlas, `atlas = origen + k · (pose − apoyoReposo)`. Lo usa el evaluador.
   */
  readonly deLaPose?: {
    readonly k: number;
    readonly origen: readonly [number, number];
    readonly apoyoReposo: readonly [number, number];
    /** Si la posición la puso el maniquí; si no, cada figura va por su apoyo. */
    readonly posicion: boolean;
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
  /** Alto de la figura del maniquí en cada celda, [fila][columna]. */
  readonly alturas: readonly (readonly number[])[];
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
}

function escalaDesdeLaPose(
  rejilla: readonly (readonly Caja[])[],
  alturaObjetivo: number,
  pose: EscalaDePose,
): number {
  const escalas = rejilla.flatMap((fila, f) =>
    fila.map((c, col) => {
      const h = pose.alturas[f]?.[col];
      if (h === undefined) throw new Error(`la pose no tiene la celda ${f + 1}·${col + 1}`);
      return (h * alturaObjetivo) / pose.reposo / alto(c);
    }),
  );
  return mediana(escalas);
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

/** La hoja entera: `filas` × `FIGURA.columnas` celdas de `celda` (256 a pie, 384 montadas). */
export async function empaquetar(
  r: Raster,
  filas: number,
  alturaObjetivo: number,
  celda: number = FIGURA.celda,
  pose?: EscalaDePose,
): Promise<Empaquetado> {
  const { columnas } = FIGURA;
  const base = baseEnCelda(celda);
  const figs = figuras(componentes(r), HOLGURA);
  const rejilla = enFilas(figs, filas, columnas);
  const medidas = rejilla.map((fila) =>
    fila.map((c) => {
      const [ax, ay] = apoyo(r, c);
      return { c, ax, ay, w: ancho(c) };
    }),
  );

  // La escala que pide el reposo, y la mayor con la que cabe cada fila con su
  // margen: en horizontal, el apoyo común de la fila deja sitio a la figura
  // que más sobresale por cada lado; en vertical, los pies están en `base`.
  const pedida =
    pose === undefined
      ? alturaObjetivo / mediana((rejilla[0] as Caja[]).map(alto))
      : escalaDesdeLaPose(rejilla, alturaObjetivo, pose);
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

  const fuente = await sharp(r.data, { raw: { width: r.width, height: r.height, channels: 4 } })
    .png()
    .toBuffer();
  const capas: OverlayOptions[] = [];
  const apoyoPorFila: [number, number][] = [];
  for (const [f, fila] of medidas.entries()) {
    const piezas = await Promise.all(
      fila.map(async ({ c, ax, ay }) => {
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
    if (pose?.posicion === true) {
      // Cada figura donde el maniquí respecto a su reposo, a la escala de la hoja;
      // si así se saliera de su celda, se mete dentro (lo que entra en la celda manda).
      const k = (alturaObjetivo / pose.reposo) * (escala / pedida);
      const x0 = Math.round(celda / 2);
      for (const [col, p] of piezas.entries()) {
        const a = pose.apoyos[f]?.[col];
        if (a === undefined)
          throw new Error(`la pose no tiene apoyo en la celda ${f + 1}·${col + 1}`);
        const dx = Math.round(k * (a[0] - pose.apoyoReposo[0]));
        const dy = Math.round(k * (a[1] - pose.apoyoReposo[1]));
        const izquierda = Math.min(celda - p.w - MARGEN, Math.max(MARGEN, x0 + dx - p.ax));
        const arriba = Math.min(celda - p.h - MARGEN, Math.max(MARGEN, base + dy - p.ay));
        capas.push({ input: p.img, left: col * celda + izquierda, top: f * celda + arriba });
      }
      apoyoPorFila.push([x0, base]);
      continue;
    }
    // La x de apoyo del clip: la más cercana al centro en la que caben todos.
    const minimo = Math.max(...piezas.map((p) => p.ax)) + MARGEN;
    const maximo = Math.min(...piezas.map((p) => celda - (p.w - p.ax))) - MARGEN;
    const x = Math.min(maximo, Math.max(minimo, Math.round(celda / 2)));
    for (const [col, p] of piezas.entries()) {
      capas.push({ input: p.img, left: col * celda + x - p.ax, top: f * celda + base - p.ay });
    }
    apoyoPorFila.push([x, base]);
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
    ...(pose === undefined
      ? {}
      : {
          deLaPose: {
            k: (alturaObjetivo / pose.reposo) * (escala / pedida),
            origen: [Math.round(celda / 2), base] as const,
            apoyoReposo: pose.apoyoReposo,
            posicion: pose.posicion,
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
