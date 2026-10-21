/**
 * El tramo de muralla de norte a sur (`muro-ns-1`, `muro-ns-2`, §29): el muro
 * que se aleja de la cámara, en piezas que se ponen una detrás de otra.
 *
 * Las de antes se pidieron sin guía y salieron torcidas: el adarve se alejaba
 * hacia arriba y a la derecha, y la de atrás enseñaba su testero (el bloque
 * almenado que cerraba la punta) a media tirada; corridas por su sesgo, en la
 * muralla de paso de tres casillas el muro quedaba inclinado ~0,4 casillas y
 * se separaba de la torre de su puerta (s105 (31, 36-39); el usuario,
 * 21-10-2026). Ahora se piden con una **guía** (`guiaDelMuroNorteSur`, con la
 * proyección del mapa: lo alto sube en vertical): un tramo RECTO de
 * `LARGO_DEL_ADARVE` de fondo, sin testeros, con su corte de delante y ocho
 * almenas por hilera, que casa consigo mismo a un paso de su largo.
 *
 * Lo que se deriva, no se escribe: el ancla (el pie del corte de delante, en el
 * eje del muro) y el paso de la tirada (`tirada`) salen de las juntas de la
 * guía, llevadas a la imagen por su alto y su eje (`juntasDelMuro`), y el
 * paso se afina buscando el corrimiento con que la pieza de atrás casa mejor
 * con la de delante en lo alto de esta, en color y en silueta. Una pieza que
 * no va recta (su eje se corre de lado al subir) no vale: se pide otra vez.
 * Lo lleva el JSON de la pieza (`tirada`), lo lee el catálogo (`Pieza.tirada`)
 * y lo vuelve a derivar `test/arte-hojas.test.ts`.
 *
 *   pnpm taller encolar --muralla-ns --solo=muro-ns-1   con su guía
 *   pnpm taller derivar-muros                            los dos, desde su imagen
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { ALTO_DEL_TRAMO_NORTE_SUR } from '../../src/client/render/escenario/muralla.js';
import { ESCALA_DEL_RECINTO, GRUESO_DEL_MURO } from '../../src/client/render/escenario/recinto.js';
import { FONDO_DEL_ADARVE } from '../../src/client/render/escenario/tirada.js';
import { derivarPieza, type PiezaDerivada } from './derivar.js';
import type { Encargo } from './encargo.js';
import { ESTILO_DEL_MAPA, REFERENCIA_DE_MAPAS } from './mapa-denso.js';
import { ARRIBA, DIR_GUIAS, FRENTE, Guia, type P2, type P3, SOMBRA } from './paredes-puentes.js';

const RAIZ = join(import.meta.dirname, '../..');

/** Las piezas de norte a sur, las que llevan su paso. */
export const MUROS_NORTE_SUR = ['muro-ns-1', 'muro-ns-2'] as const;
export type MuroNorteSur = (typeof MUROS_NORTE_SUR)[number];

// ------------------------------------------------------------------ la guía

/**
 * Las medidas del tramo en la guía, en casillas del mapa (la muralla de paso;
 * el recinto lo pone a `ESCALA_DEL_RECINTO`). La pieza mide de alto
 * `ALTO_DEL_TRAMO_NORTE_SUR` (1,6): el adarve, `FONDO_DEL_ADARVE` de ella
 * (1,07 casillas de fondo), y el muro que se ve de frente, el resto (0,53, lo
 * del tramo `horizontal`). De grueso, el del muro del recinto llevado al mapa.
 */
export const LARGO_DEL_ADARVE = ALTO_DEL_TRAMO_NORTE_SUR * FONDO_DEL_ADARVE;
const ALTO_DEL_MURO = ALTO_DEL_TRAMO_NORTE_SUR - LARGO_DEL_ADARVE;
const GRUESO = GRUESO_DEL_MURO / ESCALA_DEL_RECINTO;
const ALMENA = 0.125;
const PARAMENTO = ALTO_DEL_MURO - ALMENA;
/** Almenas por hilera: el largo es un número entero de ellas, y la pieza casa con su copia a un paso de su largo. */
const ALMENAS = 8;
/** Lo que mide una almena a lo largo del muro y de través. */
const ALMENA_A_LO_LARGO = 0.075;
const ALMENA_DE_TRAVES = 0.1;
/** La tira de la cara del este, en penumbra: en la proyección del mapa no se ve, y sin ella el muro es una cinta plana. */
const TIRA = 0.06;

/** Un punto del tramo: `x` de través (0 en su eje), `y` hacia el sur (0 en la junta de atrás), alto `z`. */
type PuntoDelTramo = P3;

/** Una caja del tramo vista con la proyección del mapa: su tapa y su cara del sur (la única que mira a la cámara). */
function caja(g: Guia, [x0, x1]: P2, [y0, y1]: P2, [z0, z1]: P2): void {
  g.poligono(
    [
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x0, y1, z1],
    ],
    FRENTE,
  );
  g.poligono(
    [
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ],
    ARRIBA,
  );
}

/**
 * Dibuja el tramo con la junta de atrás en el origen y la de delante a
 * `LARGO_DEL_ADARVE` hacia el sur: la tira del este, el muro (su tapa, el
 * adarve, y su corte de delante) y las almenas de sus dos parapetos, de atrás
 * adelante. Nada cruza el adarve: ni testero ni remate en las puntas.
 */
function dibujarTramo(g: Guia): void {
  const L = LARGO_DEL_ADARVE;
  const b = GRUESO / 2;
  // La tira acaba arriba a ras del adarve: si asoma por encima, al poner una
  // copia delante su punta hace escalón en la junta (la primera vuelta de
  // Codex la copió así, con la tira de la guía hasta lo alto de las almenas).
  g.poligono(
    [
      [b, 0, PARAMENTO],
      [b + TIRA, 0, PARAMENTO],
      [b + TIRA, L, 0],
      [b, L, 0],
    ] satisfies PuntoDelTramo[],
    SOMBRA,
  );
  caja(g, [-b, b], [0, L], [0, PARAMENTO]);
  for (let k = 0; k < ALMENAS; k++) {
    const y = ((k + 0.5) * L) / ALMENAS;
    for (const lado of [-1, 1] as const) {
      const x = lado * (b - ALMENA_DE_TRAVES / 2);
      caja(
        g,
        [x - ALMENA_DE_TRAVES / 2, x + ALMENA_DE_TRAVES / 2],
        [y - ALMENA_A_LO_LARGO / 2, y + ALMENA_A_LO_LARGO / 2],
        [PARAMENTO, PARAMENTO + ALMENA],
      );
    }
  }
}

/** La geometría de la guía que cuenta, en sus píxeles. */
export interface GeometriaDelMuro {
  /** El pie de las dos juntas, en el eje del muro y a ras de suelo: la de atrás y la de delante. */
  readonly junta: readonly [P2, P2];
  readonly caja: readonly [number, number, number, number];
  readonly casilla: number;
}

/** El lienzo de la guía: vertical, como la pieza. */
const LIENZO: readonly [number, number] = [1024, 1536];
/** Lo que ocupa el tramo del alto del lienzo. */
const LLENO = 0.8;

/** El nombre de la guía del tramo, en `DIR_GUIAS`. */
export const GUIA_DEL_MURO = 'muro-ns';

/** La guía del tramo: centrada en el lienzo y a `LLENO` de su alto. */
export function guiaDelMuroNorteSur(): { guia: Guia; geometria: GeometriaDelMuro } {
  const [ancho, alto] = LIENZO;
  const m = new Guia(ancho, alto, 1, 0, 0);
  dibujarTramo(m);
  const t = Math.floor((alto * LLENO) / (m.caja.y1 - m.caja.y0));
  const ox = ancho / 2 - ((m.caja.x0 + m.caja.x1) / 2) * t;
  const oy = alto / 2 - ((m.caja.y0 + m.caja.y1) / 2) * t;
  const g = new Guia(ancho, alto, t, ox, oy);
  dibujarTramo(g);
  const r = (q: P2): P2 => [Math.round(q[0]), Math.round(q[1])];
  return {
    guia: g,
    geometria: {
      junta: [r(g.p([0, 0, 0])), r(g.p([0, LARGO_DEL_ADARVE, 0]))],
      caja: [
        Math.round(g.caja.x0),
        Math.round(g.caja.y0),
        Math.round(g.caja.x1),
        Math.round(g.caja.y1),
      ],
      casilla: t,
    },
  };
}

/** Escribe la guía del tramo y su geometría (`muro-ns.json`). */
export async function escribirGuiaDelMuro(): Promise<string> {
  const { guia, geometria } = guiaDelMuroNorteSur();
  await writeFile(
    join(RAIZ, DIR_GUIAS, `${GUIA_DEL_MURO}.png`),
    await sharp(Buffer.from(guia.svg())).png().toBuffer(),
  );
  await writeFile(
    join(RAIZ, DIR_GUIAS, `${GUIA_DEL_MURO}.json`),
    `${JSON.stringify({ ancho: guia.ancho, alto: guia.alto, ...geometria }, null, 1)}\n`,
  );
  return `${DIR_GUIAS}/${GUIA_DEL_MURO}.png`;
}

// ------------------------------------------------------------- el encargo

const VARIANTE: Readonly<Record<MuroNorteSur, string>> = {
  'muro-ns-1': 'La piedra, limpia y bien asentada, con algo de musgo en las juntas.',
  'muro-ns-2':
    'Algo más gastado que el tramo de la muralla de la imagen 2: alguna piedra desconchada y más musgo en las juntas, sin huecos ni piedras caídas.',
};

/** El encargo de un tramo de norte a sur, con su guía. */
export function encargoDelMuroNorteSur(id: MuroNorteSur): Encargo {
  return {
    id: `mapa-${id}`,
    tipo: 'imagen',
    descripcion: [
      'Una pieza suelta del mapa de aventura de un juego de estrategia por turnos: UN TRAMO RECTO de la muralla almenada de la imagen 2 (la misma piedra gris con musgo, los mismos sillares, las mismas almenas y el mismo alto de muro que el tramo largo de arriba a la izquierda de esa hoja), que corre de NORTE a SUR: arranca abajo en la imagen, cerca de la cámara, y se aleja hacia ARRIBA, hacia el fondo.',
      'LA SILUETA ES LA DE LA GUÍA (imagen 3), CALCADA: el muro va VERTICAL en la imagen y perfectamente RECTO; sus bordes izquierdo y derecho son dos líneas VERTICALES paralelas que no se inclinan ni a la derecha ni a la izquierda al subir: la punta de arriba queda JUSTO encima de la de abajo. El mismo ancho de arriba abajo, sin escorzo: las almenas de arriba son del mismo tamaño y van al mismo paso que las de abajo.',
      'Lo que se ve, como en la guía: arriba, el paso de ronda (el adarve), una franja larga de losas entre dos hileras de almenas, una en cada borde, OCHO almenas iguales por hilera y al mismo paso; a la derecha, una tira estrecha de la cara del muro en penumbra, que arriba acaba A RAS del borde del adarve, cortada en seco, sin asomar por encima; abajo, la cara de la punta de delante: el corte del muro, de sillares, con encima solo las dos almenas de sus bordes. En la guía, lo gris claro es lo alto (el adarve y la tapa de las almenas), lo gris medio la cara de delante a la luz y lo gris oscuro la tira de la cara derecha.',
      'La pieza se REPITE: se ponen varias copias en fila, una detrás de otra hacia el fondo, para hacer un muro largo, y no se tiene que notar dónde acaba una y empieza la otra. Así que sus dos puntas son CORTES LIMPIOS: arriba, el adarve, la tira de la derecha y las dos hileras de almenas se cortan en seco a la misma altura, sin que nada sobresalga ni haga escalón, y las almenas de la punta son iguales a las demás (de un solo bloque) y siguen igual en la copia de detrás; abajo, el corte de delante. NADA de testeros: ni una fila de almenas, ni un bloque, remate, torre, pilar ni contrafuerte cruza el adarve de lado a lado, ni en las puntas ni en medio. Sin puertas, escaleras ni torretas.',
      VARIANTE[id],
      'Sin suelo debajo ni alrededor, sin peana, sin estandartes ni banderas: el muro solo, para posarlo sobre el terreno. Cámara ortográfica elevada 25 grados, la del juego, que es la de la guía. La luz viene de arriba a la izquierda.',
      ESTILO_DEL_MAPA,
    ].join('\n'),
    referencias: [
      { ruta: REFERENCIA_DE_MAPAS, papel: 'estilo' },
      // La muralla con la que casa: su piedra, sus almenas y el alto de su tramo.
      { ruta: 'assets/mapa/modulos/muro.webp', papel: 'identidad' },
      { ruta: `${DIR_GUIAS}/${GUIA_DEL_MURO}.png`, papel: 'guia' },
    ],
    salida: `assets/mapa/${id}`,
    fondo: 'transparente',
  };
}

export function encargosDelMuroNorteSur(): Encargo[] {
  return MUROS_NORTE_SUR.map(encargoDelMuroNorteSur);
}

// ----------------------------------------------------------- la derivación

/** Lo que cuenta como opaco al comparar. */
const OPACO = 200;

/**
 * Lo alto de la pieza de delante donde se mide, en fracción de su alto opaco:
 * el cabo de atrás, que es lo que asoma de la tirada y donde la de atrás toma
 * el relevo.
 */
const CABO = 0.23;

/**
 * Dónde se busca el paso, en veces el de las juntas de la guía: algo menos (una
 * almena de menos, para que solapen) hasta algo más; más allá del largo del
 * adarve, la de delante no taparía el corte de la de atrás. De lado, casi nada:
 * la pieza es recta.
 */
const PASO_MINIMO = 0.8;
const PASO_MAXIMO = 1.02;
const SESGO_MAXIMO = 0.03;

/**
 * Lo más que se corre de lado el eje del muro al subir, en veces lo que sube:
 * con más, una tirada de tres pasos se tuerce a la vista (las de antes, 0,26,
 * se separaban de la torre de su puerta en s105).
 */
export const TORCIDO_MAXIMO = 0.02;

/** Lo que tiene que medir una fila, en veces el ancho mediano, para contar en `torcido`. */
const ANCHO_ENTERO = 0.9;

/** Cuánto se reduce la imagen en la primera pasada, y el margen de la segunda, a tamaño entero. */
const REDUCCION = 4;
const AFINADO = REDUCCION + 1;

/** Lo que pesa la silueta que no casa frente al color: 100 puntos por cada píxel de la silueta de más. */
const PESO_DE_LA_SILUETA = 100;

interface Imagen {
  readonly ancho: number;
  readonly alto: number;
  readonly rgb: Float32Array;
  readonly opaco: Uint8Array;
}

async function leer(ruta: string, reduccion: number): Promise<Imagen> {
  const base = sharp(ruta).ensureAlpha();
  const meta = await sharp(ruta).metadata();
  const ancho = Math.floor((meta.width as number) / reduccion);
  const alto = Math.floor((meta.height as number) / reduccion);
  const { data } = await (reduccion === 1
    ? base
    : base.resize(ancho, alto, { kernel: 'cubic', fit: 'fill' })
  )
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgb = new Float32Array(ancho * alto * 3);
  const opaco = new Uint8Array(ancho * alto);
  for (let i = 0; i < ancho * alto; i++) {
    rgb[i * 3] = data[i * 4] as number;
    rgb[i * 3 + 1] = data[i * 4 + 1] as number;
    rgb[i * 3 + 2] = data[i * 4 + 2] as number;
    opaco[i] = (data[i * 4 + 3] as number) > OPACO ? 1 : 0;
  }
  return { ancho, alto, rgb, opaco };
}

/** La primera y la última fila con algo opaco. */
function filasOpacas(im: Imagen): readonly [number, number] {
  let y0 = -1;
  let y1 = -1;
  for (let y = 0; y < im.alto; y++)
    for (let x = 0; x < im.ancho; x++)
      if (im.opaco[y * im.ancho + x] === 1) {
        if (y0 < 0) y0 = y;
        y1 = y;
        break;
      }
  if (y0 < 0) throw new Error('el tramo de norte a sur no tiene nada opaco');
  return [y0, y1];
}

/**
 * Cuánto desentona la pieza de atrás, corrida `(dx, −s)`, con la de delante en
 * su cabo (`desde`, `filas`): la diferencia media de color donde las dos son
 * opacas más la silueta que no casa. Menos es mejor.
 */
function desajuste(im: Imagen, desde: number, filas: number, s: number, dx: number): number {
  let color = 0;
  let ambas = 0;
  let distintas = 0;
  for (let y = desde; y < desde + filas; y++) {
    const yAtras = y + s;
    if (yAtras >= im.alto) return Number.POSITIVE_INFINITY;
    for (let x = 0; x < im.ancho; x++) {
      const delante = im.opaco[y * im.ancho + x] as number;
      const xAtras = x - dx;
      const atras = xAtras < 0 ? 0 : (im.opaco[yAtras * im.ancho + xAtras] as number);
      if (delante !== atras) distintas++;
      else if (delante === 1) {
        ambas++;
        const i = (y * im.ancho + x) * 3;
        const j = (yAtras * im.ancho + xAtras) * 3;
        color +=
          Math.abs((im.rgb[i] as number) - (im.rgb[j] as number)) +
          Math.abs((im.rgb[i + 1] as number) - (im.rgb[j + 1] as number)) +
          Math.abs((im.rgb[i + 2] as number) - (im.rgb[j + 2] as number));
      }
    }
  }
  if (ambas === 0) return Number.POSITIVE_INFINITY;
  return color / ambas + (PESO_DE_LA_SILUETA * distintas) / ambas;
}

/** El mejor `(dx, s)` entre los candidatos, con el primero en caso de empate: el orden es fijo. */
function mejor(
  im: Imagen,
  candidatos: Iterable<readonly [number, number]>,
): readonly [number, number] {
  const [y0, y1] = filasOpacas(im);
  const filas = Math.round((y1 - y0 + 1) * CABO);
  let elegido: readonly [number, number] | undefined;
  let menor = Number.POSITIVE_INFINITY;
  for (const [dx, s] of candidatos) {
    const d = desajuste(im, y0, filas, s, dx);
    if (d < menor) {
      menor = d;
      elegido = [dx, s];
    }
  }
  if (elegido === undefined) throw new Error('no hay paso con el que la tirada case');
  return elegido;
}

/** Las filas de `desde` a `hasta` que llevan el muro de lado a lado: `[y, medio]`. */
function filasEnteras(im: Imagen, desde: number, hasta: number): (readonly [number, number])[] {
  const filas: (readonly [number, number, number])[] = [];
  for (let y = desde; y <= hasta; y++) {
    let x0 = -1;
    let x1 = -1;
    for (let x = 0; x < im.ancho; x++)
      if (im.opaco[y * im.ancho + x] === 1) {
        if (x0 < 0) x0 = x;
        x1 = x;
      }
    if (x0 >= 0) filas.push([y, x0, x1]);
  }
  const anchos = filas.map(([, x0, x1]) => x1 - x0).sort((a, b) => a - b);
  const mediana = anchos[Math.floor(anchos.length / 2)] ?? 0;
  return filas
    .filter(([, x0, x1]) => x1 - x0 >= mediana * ANCHO_ENTERO)
    .map(([y, x0, x1]) => [y, (x0 + x1) / 2] as const);
}

/**
 * Lo que se tuerce el eje del adarve: la pendiente (en x por cada píxel que
 * sube) del medio de su silueta, fila a fila, ajustada por mínimos cuadrados.
 * Una pieza recta da 0. Las filas que no llevan el muro de lado a lado (lo alto
 * de la punta, donde solo asoman la tira o una almena) no cuentan: con ellas,
 * una pieza recta daba 2,4 px por cada 100.
 */
function torcido(filas: readonly (readonly [number, number])[]): number {
  const n = filas.length;
  if (n < 2) throw new Error('el tramo de norte a sur no tiene adarve que medir');
  const my = filas.reduce((a, [y]) => a + y, 0) / n;
  const mx = filas.reduce((a, [, x]) => a + x, 0) / n;
  let num = 0;
  let den = 0;
  for (const [y, x] of filas) {
    num += (y - my) * (x - mx);
    den += (y - my) ** 2;
  }
  // Hacia arriba es y decreciente: la pendiente al subir es la contraria.
  return -num / den;
}

/** La geometría de la guía del tramo, la del disco (`escribirGuiaDelMuro`). */
async function geometriaDeLaGuia(): Promise<GeometriaDelMuro> {
  return JSON.parse(
    await readFile(join(RAIZ, DIR_GUIAS, `${GUIA_DEL_MURO}.json`), 'utf8'),
  ) as GeometriaDelMuro;
}

/**
 * Lo que se deriva de un tramo de norte a sur: su ancla, el pie de la junta de
 * delante (en el eje del muro, no en el medio de la imagen: la tira del este la
 * ensancha a un lado), y el paso de su tirada, `[dx, dy]` en píxeles de su
 * imagen (lo que se corre la de atrás respecto de la de delante; `dy` < 0).
 *
 * Las dos juntas de la guía se llevan a la imagen por su alto y su eje: la
 * escala, la del alto opaco frente al de la guía; el pie, el de la imagen; de
 * lado, el medio de las filas que llevan el muro entero, que en la guía es el
 * medio de su caja. Es la cuenta de `registrarConEscala` sin buscar (una pieza
 * recta no tiene más que eso, y buscar costaba 80 s por pieza: no cabía en el
 * bucle rápido). El paso se afina alrededor de lo que separa las juntas:
 * primero en la imagen reducida y luego, alrededor, a tamaño entero. Lanza si
 * su eje se tuerce al subir (`TORCIDO_MAXIMO`), si sus proporciones no son las
 * de la guía o si el paso que casa se va de lado.
 */
export async function juntasDelMuro(ruta: string): Promise<{
  readonly ancla: readonly [number, number];
  readonly tirada: readonly [number, number];
}> {
  const nombre = ruta.replace(/^.*\//, '').replace(/\.webp$/, '');
  const g = await geometriaDeLaGuia();
  const entera = await leer(ruta, 1);
  const [y0, y1] = filasOpacas(entera);
  const [gx0, gy0, gx1, gy1] = g.caja;
  const k = (y1 - y0) / (gy1 - gy0);
  const enteras = filasEnteras(entera, y0, y1);
  // Lo ancho de la pieza frente a lo de la guía, a su escala: si no, no la calca.
  const ancho = anchoMediano(entera, enteras);
  const proporcion = ancho / ((gx1 - gx0) * k);
  if (Math.abs(proporcion - 1) > PROPORCION_TOLERADA)
    throw new Error(
      `${nombre}: a la escala de su alto mide de ancho ${(proporcion * 100).toFixed(0)} % de su guía: no calca la silueta; pídelo otra vez`,
    );
  const t = torcido(enteras);
  if (Math.abs(t) > TORCIDO_MAXIMO)
    throw new Error(
      `${nombre}: su eje se corre ${(t * 100).toFixed(1)} px de lado por cada 100 que sube, y lo más son ${TORCIDO_MAXIMO * 100}: no va recto; pídelo otra vez`,
    );
  const medio = enteras.reduce((a, [, x]) => a + x, 0) / enteras.length;
  const llevar = ([x, y]: P2): P2 => [medio + (x - (gx0 + gx1) / 2) * k, y1 + (y - gy1) * k];
  const [atras, delante] = g.junta.map(llevar) as [P2, P2];
  const juntas = delante[1] - atras[1];
  const chica = await leer(ruta, REDUCCION);
  const gruesos: [number, number][] = [];
  const j = juntas / REDUCCION;
  for (let s = Math.round(j * PASO_MINIMO); s <= Math.round(j * PASO_MAXIMO); s++)
    for (let dx = -Math.ceil(j * SESGO_MAXIMO); dx <= Math.ceil(j * SESGO_MAXIMO); dx++)
      gruesos.push([dx, s]);
  const [gx, gs] = mejor(chica, gruesos);
  const finos: [number, number][] = [];
  for (let s = gs * REDUCCION - AFINADO; s <= gs * REDUCCION + AFINADO; s++)
    for (let dx = gx * REDUCCION - AFINADO; dx <= gx * REDUCCION + AFINADO; dx++)
      finos.push([dx, s]);
  const [dx, s] = mejor(entera, finos);
  if (Math.abs(dx) > s * SESGO_MAXIMO)
    throw new Error(
      `${nombre}: casa con su copia corrida ${dx} px de lado en un paso de ${s}: no va recto; pídelo otra vez`,
    );
  return { ancla: [Math.round(delante[0]), Math.round(delante[1])], tirada: [dx, -s] };
}

/** Lo ancho mediano de las filas enteras de una pieza. */
function anchoMediano(im: Imagen, filas: readonly (readonly [number, number])[]): number {
  const anchos = filas
    .map(([y]) => {
      let x0 = -1;
      let x1 = -1;
      for (let x = 0; x < im.ancho; x++)
        if (im.opaco[y * im.ancho + x] === 1) {
          if (x0 < 0) x0 = x;
          x1 = x;
        }
      return x1 - x0 + 1;
    })
    .sort((a, b) => a - b);
  return anchos[Math.floor(anchos.length / 2)] ?? 0;
}

/** Cuánto puede apartarse lo ancho de la pieza de lo de su guía, a la escala de su alto. */
const PROPORCION_TOLERADA = 0.25;

/** El JSON entero de un tramo de norte a sur: el de cualquier pieza, con el ancla de su junta y su `tirada`. */
export async function muroDerivado(ruta: string): Promise<
  Omit<PiezaDerivada, 'derivadoPor'> & {
    readonly derivadoPor: 'tools/taller/muros.ts';
    readonly tirada: readonly [number, number];
  }
> {
  const { ancla, tirada } = await juntasDelMuro(ruta);
  return { ...(await derivarPieza(ruta)), ancla, derivadoPor: 'tools/taller/muros.ts', tirada };
}

/** Si un id es el de un tramo de norte a sur. */
export const esMuroNorteSur = (id: string): id is MuroNorteSur =>
  (MUROS_NORTE_SUR as readonly string[]).includes(id);

/** Reescribe el JSON de los tramos de norte a sur (todos, o los que se pidan) y devuelve las rutas. */
export async function escribirMurosDerivados(
  ids: readonly MuroNorteSur[] = MUROS_NORTE_SUR,
): Promise<string[]> {
  const hechos: string[] = [];
  for (const id of ids) {
    const ruta = join(RAIZ, 'assets/mapa', `${id}.webp`);
    const json = ruta.replace(/\.webp$/, '.json');
    await mkdir(dirname(json), { recursive: true });
    await writeFile(json, `${JSON.stringify(await muroDerivado(ruta), null, 2)}\n`);
    hechos.push(json);
  }
  return hechos;
}
