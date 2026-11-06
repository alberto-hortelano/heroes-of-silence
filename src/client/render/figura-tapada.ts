/**
 * Lo tapado de una figura, como se suele leer a quien está detrás de algo: su
 * silueta con un contorno, solo donde la tapa lo que se pintó después de ella.
 *
 * Lo pide el mapa para los grupos de asaltantes (`pintarLoTapadoDeLosAsaltantes`):
 * un grupo anda por donde quiere y no lleva la reserva de un monstruo, así que un
 * pico de la fila de delante lo tapaba entero y quedaban el estandarte y la chapa
 * solos. Repintarlo encima a 0,7 con su arte (06-11-2026) se leía sobre la roca,
 * pero sobre la nieve y de noche era una mancha rojiza sin forma (QA del mismo
 * día): una silueta lisa con un contorno claro y otro oscuro por fuera se lee
 * sobre cualquier suelo.
 *
 * Todo va en píxeles del lienzo (de dispositivo), en cuatro lienzos de paso del
 * tamaño de la celda de la figura, que se reutilizan de un fotograma a otro:
 * - **la máscara** (`O`): lo que la tapa (los volúmenes pintados después de ella),
 *   menos lo que va delante y no se cubre (las figuras pintadas después: un héroe
 *   delante del pico no queda debajo de la silueta);
 * - **lo tapado** (`Q`): la silueta de su celda dentro de la máscara;
 * - **la silueta** (`B`): el contorno, lo tapado dilatado fuera de la figura, y
 *   lo tapado relleno, dentro de la máscara;
 * - uno para teñir (`T`).
 * Sin nada encima de su silueta, `Q` queda vacío y no se ve nada: la figura que
 * no está tapada se pinta como siempre.
 *
 * Componerla son una veintena de copias del tamaño de la celda: sin GPU, de 2 a 6 ms
 * por grupo y fotograma (06-11-2026, Chromium sin pantalla, s9 y s2, del zoom de
 * entrada al de seis pasos de rueda). Por eso `B` se guarda por figura
 * (`GuardarLoTapado`) y se rehace solo cuando cambia algo de lo que sale: otro
 * fotograma de su animación, otro sitio respecto a lo que la tapa u otro zoom.
 */
import { celdaDeLaFigura, type FiguraColocada } from './figura.js';

/** Los colores de lo tapado. */
export interface ColoresDeLoTapado {
  /** El contorno, pegado a la silueta: del color de quien es, claro (se lee sobre roca oscura y de noche). */
  readonly contorno: string;
  /** El borde por fuera del contorno, oscuro: lo separa de un suelo claro (la nieve). */
  readonly borde: string;
  /** El relleno de la silueta, translúcido: deja adivinar lo que tiene delante. */
  readonly relleno: string;
}

/** Una transformación del lienzo, de las que da `getTransform`. */
export type Matriz = Pick<DOMMatrixReadOnly, 'a' | 'b' | 'c' | 'd' | 'e' | 'f'>;

/**
 * Pinta en `m` lo que tapa a la figura, o lo que va delante de ella. `poner(t)`
 * le pone la transformación `t` del lienzo de la pantalla (la de los volúmenes o
 * la de las figuras): `m` es del tamaño de la celda, no del lienzo.
 */
export type PintarEnLaMascara = (m: CanvasRenderingContext2D, poner: (t: Matriz) => void) => void;

/**
 * Para no componer lo tapado a cada fotograma: quién es (`id`, uno por figura) y
 * lo que pinta `tapa`, sin dónde (`clave`: qué se pinta y a qué escala), con el
 * origen de su transformación en el lienzo (`origen`). Se vuelve a componer si
 * cambia la celda de la figura (otro fotograma de su animación), su sitio
 * respecto a lo que la tapa o la clave.
 */
export interface GuardarLoTapado {
  readonly id: string;
  readonly clave: string;
  readonly origen: readonly [number, number];
}

/** El grueso del contorno y del borde, en fracción del lado de la celda (con 1 píxel de dispositivo como poco). */
const GROSOR = { contorno: 0.014, borde: 0.01 } as const;

/**
 * La caja de la celda de la figura en píxeles del lienzo, `[x0, y0, x1, y1]`, con
 * `enPantalla` la transformación con que se pinta; `null` sin arte que pintar.
 */
export function cajaDeLaCelda(
  c: FiguraColocada,
  enPantalla: Matriz,
): readonly [number, number, number, number] | null {
  const celda = celdaDeLaFigura(c, densidad(enPantalla));
  if (celda === null) return null;
  const [x, y] = aplicar(enPantalla, celda.x, celda.y);
  const lado = celda.lado * densidad(enPantalla);
  return [x, y, x + lado, y + lado];
}

/** El punto `(x, y)` de la pantalla en píxeles del lienzo, con la transformación `t`. */
export function aplicar(t: Matriz, x: number, y: number): readonly [number, number] {
  return [t.a * x + t.c * y + t.e, t.b * x + t.d * y + t.f];
}

/** Los píxeles del lienzo por píxel de la pantalla de una transformación: la de `densidadDe`. */
const densidad = (t: Matriz) => Math.hypot(t.a, t.b);

/**
 * Lo tapado de la figura `c`, encima de lo que hay en `ctx`: su silueta rellena
 * de `colores.relleno` con el contorno, solo donde la cubre lo que pinta `tapa`
 * y no lo que pinta `delante`. `enPantalla` es la transformación con que se
 * pintó la figura.
 */
export function pintarLoTapadoDeLaFigura(
  ctx: CanvasRenderingContext2D,
  c: FiguraColocada,
  enPantalla: Matriz,
  colores: ColoresDeLoTapado,
  tapa: PintarEnLaMascara,
  delante: PintarEnLaMascara | null,
  guardar: GuardarLoTapado | null = null,
): void {
  const celda = celdaDeLaFigura(c, densidad(enPantalla));
  if (celda === null) return;
  const [X, Y] = aplicar(enPantalla, celda.x, celda.y);
  const L = celda.lado * densidad(enPantalla);
  const contorno = Math.max(1, L * GROSOR.contorno);
  const borde = contorno + Math.max(1, L * GROSOR.borde);
  const margen = Math.ceil(borde) + 2;
  const bx = Math.floor(X) - margen;
  const by = Math.floor(Y) - margen;
  const N = Math.ceil(X - Math.floor(X) + L) + 2 * margen;
  const sx = X - bx;
  const sy = Y - by;
  const { fuente, w } = celda;
  const clave =
    guardar === null
      ? null
      : [
          guardar.clave,
          idDeLaCelda(fuente),
          w,
          N,
          redondo(L),
          redondo(sx),
          redondo(sy),
          redondo(guardar.origen[0] - bx),
          redondo(guardar.origen[1] - by),
        ].join('|');
  const ya = guardar === null ? undefined : guardadas.get(guardar.id);
  if (ya !== undefined && ya.clave === clave) {
    copiarALaPantalla(ctx, ya.lienzo, N, bx, by);
    return;
  }
  const [o, q, t] = [0, 1, 2].map((i) => lienzoDePaso(i, N)) as [
    CanvasRenderingContext2D,
    CanvasRenderingContext2D,
    CanvasRenderingContext2D,
  ];
  // La silueta se compone en el lienzo que se guarda; sin guardar, en uno de paso.
  const b = guardar === null ? lienzoDePaso(3, N) : lienzoGuardado(guardar.id, clave as string, N);

  // La máscara: lo que la tapa, menos lo que va delante.
  // `t` y luego `−bx, −by`: el origen del lienzo de paso es la esquina de su caja.
  const poner = (m: CanvasRenderingContext2D) => (t: Matriz) =>
    m.setTransform(t.a, t.b, t.c, t.d, t.e - bx, t.f - by);
  o.save();
  tapa(o, poner(o));
  o.restore();
  if (delante !== null) {
    o.save();
    o.globalCompositeOperation = 'destination-out';
    delante(o, poner(o));
    o.restore();
  }
  // Lo tapado: la silueta dentro de la máscara.
  q.drawImage(fuente, 0, 0, w, w, sx, sy, L, L);
  q.globalCompositeOperation = 'destination-in';
  q.drawImage(o.canvas, 0, 0, N, N, 0, 0, N, N);
  q.globalCompositeOperation = 'source-over';
  // El contorno: lo tapado dilatado, oscuro por fuera y claro por dentro, fuera
  // de la figura y dentro de la máscara.
  dilatado(b, t, q.canvas, N, borde, colores.borde);
  dilatado(b, t, q.canvas, N, contorno, colores.contorno);
  b.globalCompositeOperation = 'destination-out';
  b.drawImage(fuente, 0, 0, w, w, sx, sy, L, L);
  b.globalCompositeOperation = 'destination-in';
  b.drawImage(o.canvas, 0, 0, N, N, 0, 0, N, N);
  b.globalCompositeOperation = 'source-over';
  // Y el relleno de lo tapado.
  teñido(b, t, q.canvas, N, colores.relleno);

  copiarALaPantalla(ctx, b, N, bx, by);
}

function copiarALaPantalla(
  ctx: CanvasRenderingContext2D,
  b: CanvasRenderingContext2D,
  N: number,
  bx: number,
  by: number,
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(b.canvas, 0, 0, N, N, bx, by, N, N);
  ctx.restore();
}

const redondo = (x: number) => Math.round(x * 1000) / 1000;

/** Un número por lienzo de celda (`celdaEnPantalla` los guarda: el mismo lienzo es la misma celda). */
const idsDeCelda = new WeakMap<HTMLCanvasElement, number>();
let ultimaCelda = 0;
function idDeLaCelda(c: HTMLCanvasElement): number {
  let id = idsDeCelda.get(c);
  if (id === undefined) {
    id = ++ultimaCelda;
    idsDeCelda.set(c, id);
  }
  return id;
}

/** Lo tapado ya compuesto, por figura: unos pocos grupos a la vista. */
const guardadas = new Map<string, { clave: string; lienzo: CanvasRenderingContext2D }>();
const GUARDADAS_COMO_MUCHO = 32;

/** El lienzo de lo tapado de `id`, limpio en sus `N × N`, apuntado con `clave`. */
function lienzoGuardado(id: string, clave: string, N: number): CanvasRenderingContext2D {
  const ya = guardadas.get(id);
  if (ya === undefined && guardadas.size >= GUARDADAS_COMO_MUCHO) guardadas.clear();
  const lienzo =
    ya !== undefined && ya.lienzo.canvas.width >= N && ya.lienzo.canvas.height >= N
      ? ya.lienzo
      : lienzoNuevo(Math.max(N, ya?.lienzo.canvas.width ?? 0));
  limpiar(lienzo, N);
  guardadas.set(id, { clave, lienzo });
  return lienzo;
}

/** Los ocho rumbos de la dilatación. */
const RUMBOS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
];

/** `src` dilatado `r` píxeles y teñido de `color`, sobre `b` (con `t` de paso). */
function dilatado(
  b: CanvasRenderingContext2D,
  t: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  N: number,
  r: number,
  color: string,
): void {
  limpiar(t, N);
  for (const [dx, dy] of RUMBOS) t.drawImage(src, 0, 0, N, N, dx * r, dy * r, N, N);
  pintarTeñido(b, t, N, color);
}

/** `src` teñido de `color`, sobre `b` (con `t` de paso). */
function teñido(
  b: CanvasRenderingContext2D,
  t: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  N: number,
  color: string,
): void {
  limpiar(t, N);
  t.drawImage(src, 0, 0, N, N, 0, 0, N, N);
  pintarTeñido(b, t, N, color);
}

/** Lo que hay en `t`, de `color` y con su alfa, sobre `b`. */
function pintarTeñido(
  b: CanvasRenderingContext2D,
  t: CanvasRenderingContext2D,
  N: number,
  color: string,
): void {
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = color;
  t.fillRect(0, 0, N, N);
  t.globalCompositeOperation = 'source-over';
  b.drawImage(t.canvas, 0, 0, N, N, 0, 0, N, N);
}

const lienzos: (CanvasRenderingContext2D | undefined)[] = [];

/** El lienzo de paso `i`, de `N` píxeles de lado como poco, limpio en sus `N × N` y sin transformación. */
function lienzoDePaso(i: number, N: number): CanvasRenderingContext2D {
  let c = lienzos[i];
  if (c === undefined || c.canvas.width < N || c.canvas.height < N) {
    // Crece y no encoge: entre zooms, un lienzo por fotograma sería basura.
    c = lienzoNuevo(Math.max(N, c?.canvas.width ?? 0));
    lienzos[i] = c;
  }
  limpiar(c, N);
  return c;
}

function lienzoNuevo(lado: number): CanvasRenderingContext2D {
  const lienzo = document.createElement('canvas');
  lienzo.width = lado;
  lienzo.height = lado;
  const c = lienzo.getContext('2d');
  if (c === null) throw new Error('este navegador no tiene canvas 2D para pintar lo tapado');
  return c;
}

function limpiar(c: CanvasRenderingContext2D, N: number): void {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  c.clearRect(0, 0, N, N);
}
