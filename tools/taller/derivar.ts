/**
 * El JSON de una hoja se DERIVA de la imagen; no se escribe a mano (#120).
 *
 *   pnpm taller derivar assets/unidades/templario-escudo/d1/atlas.webp
 *
 * Mide, sobre el canal alfa de cada celda:
 *  - el **ancla** de cada clip: el punto de apoyo (mediana de x del tronco, fila
 *    más baja; ver `empaquetar.apoyoEn`), y la mediana entre sus fotogramas;
 *  - la **altura** de la figura: la caja del alfa del primer fotograma de reposo;
 *  - los **fotogramas válidos**: se descartan por el final los vacíos y los que
 *    repiten al anterior —el maniquí repetía la sexta celda en la séptima, y
 *    eso se apuntaba a mano como `frames: 6`—;
 *  - la **caja de clic**: la unión de las cajas del reposo, relativa al ancla.
 *
 * Y apunta el sha256 de la imagen que midió: `test/taller-derivar.test.ts`
 * vuelve a derivar cada hoja y exige el mismo JSON, así que un número tocado a
 * mano —o una imagen cambiada sin volver a derivar— se pone rojo.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import sharp from 'sharp';
import type { JuntasDeLadera } from '../../src/client/render/escenario/catalogo.js';
import {
  CLIPS_DE_FIGURA,
  type ClipDeFigura,
  FIGURA,
  FILAS_DEL_ATLAS,
} from '../../src/shared/arte.js';
import { ALFA_FIGURA, apoyoEn } from './empaquetar.js';
import type { GeometriaDeLadera } from './laderas.js';
import { esFondoDeGuia, type P2 } from './paredes-puentes.js';

const RAIZ = resolve(import.meta.dirname, '../..');

/** Las filas de una hoja del taller, en orden, con su reloj. El reloj no sale de la imagen. */
export const RELOJ = {
  /**
   * 8 y no 3 (decisión del usuario, 03-10-2026: «las animaciones de idle son
   * demasiado lentas»). Las siete columnas muestrean el reposo entero del
   * maniquí, que dura 3,7 s: a 3 fps la vuelta eran 2,3 s y se leía como una
   * figura congelada que de vez en cuando se movía; a 8 son 0,9 s, el ritmo de
   * la marcha.
   */
  idle: { fps: 8, loop: true },
  walk: { fps: 8, loop: true },
  /** La carga de las monturas: la marcha con la lanza bajada, en bucle como ella. */
  charge: { fps: 8, loop: true },
  attack: { fps: 10, loop: false },
  hurt: { fps: 10, loop: false },
  /** Se queda en su último fotograma: el cadáver (`cadaver` en el JSON). */
  death: { fps: 8, loop: false },
  /** El disparo, al reloj que tenía cuando era la fila del ataque: la suelta cae donde caía. */
  shoot: { fps: 10, loop: false },
} as const satisfies Record<ClipDeFigura, { fps: number; loop: boolean }>;
export type ClipDeHoja = keyof typeof RELOJ;

/**
 * Los fotogramas por segundo de los clips de una unidad que no van al reloj de
 * `RELOJ` (decisión del usuario, 10-10-2026: «la velocidad tiene que ser por
 * unidad y animación»). Lo declara la unidad (`Unidad.ritmo`) y va a su
 * `atlas.json`, que es lo que lee el juego.
 */
export type Ritmo = Readonly<Partial<Record<ClipDeFigura, number>>>;

/**
 * Cómo declara una unidad su ritmo: los fps de cada clip, o `tiempoReal`, que
 * los saca de lo que dura cada clip en su maniquí (`fpsATiempoReal`), con los
 * de `fps` por encima (el vampiro, 10-10-2026: todo a tiempo real menos el
 * reposo, que a tiempo real sostiene cada pose casi medio segundo).
 */
export type RitmoDeUnidad = Ritmo | { readonly tiempoReal: true; readonly fps?: Ritmo };

/**
 * Cuánto más arriba va la fila de la muerte en su celda en las hojas de 8
 * direcciones, en píxeles de la celda de 384. Bajo los pies quedan 42 px y un
 * cuerpo tendido hacia la cámara ocupa ~70: el empaquetado lo metía en la celda
 * subiéndolo, y el cadáver quedaba flotando sobre su sombra. Subida la fila
 * entera y su ancla con ella, el cadáver cae donde lo pone el maniquí.
 */
export const ELEVACION_DEL_CADAVER = 64;

/**
 * Una hoja del taller es una dirección de una unidad en 8 direcciones
 * (`OCHO_DIRECCIONES` en `tools/art/poses.ts`): una fila por cada una de las
 * seis acciones de `CLIPS_DE_FIGURA`, en su orden, cada una con su reloj, y la
 * séptima, el disparo, en quien dispara (`FILAS_DEL_ATLAS`). La muerte arranca
 * donde acaba el daño. Las hojas de 3 y 4 filas de una sola dirección se
 * retiraron el 03-10-2026 con su arte.
 */
const FILAS_SIN_DISPARO = CLIPS_DE_FIGURA.length;
const FILAS_CON_DISPARO = FILAS_DEL_ATLAS.length;
const CLIPS = FILAS_DEL_ATLAS.map((clip) => ({ clip, ...RELOJ[clip] }));

/** Umbral de alfa con el que se mide la altura: el mismo que en `personajes.ts`. */
const ALFA_ALTURA = 40;
/** Dos fotogramas son el mismo si difieren en menos de este tanto por uno del alfa. */
const REPETIDO = 0.004;

export interface ClipDerivado {
  readonly row: number;
  readonly frames: number;
  readonly fps: number;
  readonly loop: boolean;
  readonly anchor: readonly [number, number];
  /**
   * Solo en el disparo (`shoot`): la primera columna con la cuerda ya suelta,
   * donde sale el proyectil. No se mide en la imagen; la pone `poses-8d.ts` con
   * la curva del maniquí. El ataque no la tiene nunca: es cuerpo a cuerpo.
   */
  readonly suelta?: number;
}

export interface AtlasDerivado {
  readonly imagen: string;
  readonly sha256: string;
  readonly cell: number;
  readonly columns: number;
  /** De la coronilla a los pies en el primer reposo, en píxeles de la hoja. */
  readonly altura: number;
  /** Relativa al ancla del reposo: [izquierda, arriba, derecha, abajo]. */
  readonly cajaDeClic: readonly [number, number, number, number];
  readonly clips: Readonly<
    Record<'idle' | 'walk' | 'attack', ClipDerivado> &
      Partial<Record<'charge' | 'hurt' | 'death' | 'shoot', ClipDerivado>>
  >;
  /** El fotograma que se queda en el suelo al morir, si la hoja tiene muerte. */
  readonly cadaver?: { readonly clip: 'death'; readonly frame: number };
  readonly derivadoPor: 'tools/taller/derivar.ts';
}

interface Celda {
  readonly alfa: Uint8Array;
  readonly vacia: boolean;
}

function celda(data: Buffer, ancho: number, col: number, fila: number, lado: number): Celda {
  const alfa = new Uint8Array(lado * lado);
  let vacia = true;
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const a = data[((fila * lado + y) * ancho + col * lado + x) * 4 + 3] as number;
      alfa[y * lado + x] = a;
      if (a >= ALFA_FIGURA) vacia = false;
    }
  }
  return { alfa, vacia };
}

function caja(c: Celda, lado: number, umbral: number): [number, number, number, number] {
  let x0 = lado;
  let y0 = lado;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      if ((c.alfa[y * lado + x] as number) < umbral) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return [x0, y0, x1, y1];
}

/** El punto de apoyo de una celda: la misma regla, y la misma función, que al empaquetar. */
function apoyoDeCelda(c: Celda, lado: number): [number, number] {
  return apoyoEn((x, y) => c.alfa[y * lado + x] as number, caja(c, lado, ALFA_FIGURA));
}

function diferencia(a: Celda, b: Celda): number {
  let d = 0;
  for (let i = 0; i < a.alfa.length; i++)
    d += Math.abs((a.alfa[i] as number) - (b.alfa[i] as number));
  return d / (a.alfa.length * 255);
}

function mediana(v: readonly number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] as number;
}

/**
 * `suelta`: la columna en la que suelta la cuerda quien dispara (ver
 * `ClipDerivado.suelta`). Va con la séptima fila, el disparo, y solo con ella:
 * una hoja de 7 filas sin suelta, o una de 6 con ella, lanza. El disparo se
 * queda con TODAS las columnas: de frente apenas mueve la silueta (el alfa
 * cambia un 0,03-0,3 % de una columna a la siguiente, por debajo de `REPETIDO`)
 * y recortarlo como repetido lo dejaba en un fotograma, sin animar y con la
 * suelta fuera del clip. El resto de clips se recorta igual que siempre.
 *
 * `elevacionDeLaMuerte`: cuánto más arriba va la fila de la muerte en su celda.
 * Por defecto `ELEVACION_DEL_CADAVER`, la de las hojas pintadas; 0 para el
 * render crudo del Y Bot (`poses-8d.ts`), que la tiene donde la pone el maniquí.
 */
export async function derivarAtlas(
  rutaImagen: string,
  {
    elevacionDeLaMuerte = ELEVACION_DEL_CADAVER,
    suelta,
    ritmo = {},
    enteros = [],
  }: {
    elevacionDeLaMuerte?: number;
    suelta?: number;
    ritmo?: Ritmo;
    /**
     * Los clips que se quedan con todas sus columnas, como el disparo: los de
     * ida y vuelta (`ClipsDeManiqui.vaiven`), que repiten columnas a propósito
     * y cuyo balanceo cambia poco el alfa. Recortados, el reposo del vampiro
     * se quedaba en un fotograma en siete de sus ocho direcciones.
     */
    enteros?: readonly ClipDeFigura[];
  } = {},
): Promise<AtlasDerivado> {
  for (const [clip, fps] of Object.entries(ritmo)) {
    if (!(clip in RELOJ) || !(fps > 0 && fps <= 30))
      throw new Error(`${rutaImagen}: el ritmo de «${clip}» es ${fps} fps; va de más de 0 a 30`);
  }
  const bytes = await readFile(rutaImagen);
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // La celda sale de la imagen: 256 a pie, 384 las monturas; las columnas son siempre las de FIGURA.
  const { columnas } = FIGURA;
  const lado = info.width / columnas;
  const filas = info.height / lado;
  if (!Number.isInteger(lado) || (filas !== FILAS_SIN_DISPARO && filas !== FILAS_CON_DISPARO)) {
    throw new Error(
      `${rutaImagen} mide ${info.width}×${info.height}: una hoja del taller son ${columnas} columnas ` +
        `por ${FILAS_SIN_DISPARO} filas, o ${FILAS_CON_DISPARO} con el disparo (una dirección de 8), de celdas cuadradas`,
    );
  }
  // La suelta va con la fila del disparo y solo con ella.
  if ((suelta !== undefined) !== (filas === FILAS_CON_DISPARO)) {
    throw new Error(
      suelta === undefined
        ? `${rutaImagen} tiene la fila del disparo y nadie dice en qué columna suelta: deriva con la suelta de su maniquí (\`sueltaDeUnidad\`)`
        : `${rutaImagen}: la suelta es del disparo y esta hoja no tiene: son ${filas} filas, sin la de «shoot»`,
    );
  }

  const clips = {} as Record<string, AtlasDerivado['clips']['idle']>;
  let cajaDeClic: [number, number, number, number] | null = null;
  let altura = 0;
  for (const [fila, def] of CLIPS.slice(0, filas).entries()) {
    const celdas = Array.from({ length: columnas }, (_, col) =>
      celda(data, info.width, col, fila, lado),
    );
    const esDisparo = def.clip === 'shoot';
    let frames: number = columnas;
    while (frames > 0 && !esDisparo && !enteros.includes(def.clip)) {
      const ultima = celdas[frames - 1] as Celda;
      const previa = celdas[frames - 2];
      if (ultima.vacia || (previa !== undefined && diferencia(ultima, previa) < REPETIDO)) frames--;
      else break;
    }
    if (frames === 0)
      throw new Error(`${rutaImagen}: el clip «${def.clip}» no tiene ni un fotograma`);
    const validas = celdas.slice(0, frames);
    if (validas.some((c) => c.vacia)) {
      throw new Error(`${rutaImagen}: el clip «${def.clip}» tiene una celda vacía en medio`);
    }
    const apoyos = validas.map((c) => apoyoDeCelda(c, lado));
    // En 6 filas la posición de cada fotograma la dicta el maniquí respecto a su
    // reposo, así que el ancla es UNA por dirección, la del reposo: la mediana por
    // clip recentraría el cadáver y la carga.
    const reposo = clips.idle?.anchor;
    // La muerte va `elevacionDeLaMuerte` más arriba en su celda (ver
    // ELEVACION_DEL_CADAVER), y su ancla con ella: en el juego cae donde la pone el maniquí.
    const fija =
      reposo === undefined
        ? undefined
        : def.clip === 'death'
          ? ([reposo[0], reposo[1] - elevacionDeLaMuerte] as const)
          : reposo;
    const anchor: readonly [number, number] = fija ?? [
      mediana(apoyos.map((a) => a[0])),
      mediana(apoyos.map((a) => a[1])),
    ];
    if (
      esDisparo &&
      !(suelta !== undefined && Number.isInteger(suelta) && suelta >= 1 && suelta < frames)
    ) {
      throw new Error(
        `${rutaImagen}: la suelta en la columna ${suelta} no cae dentro del disparo (columnas 1 a ${frames - 1})`,
      );
    }
    clips[def.clip] = {
      row: fila,
      frames,
      fps: ritmo[def.clip] ?? def.fps,
      loop: def.loop,
      anchor,
      ...(esDisparo ? { suelta } : {}),
    };

    if (def.clip === 'idle') {
      const [, y0, , y1] = caja(validas[0] as Celda, lado, ALFA_ALTURA);
      altura = y1 - y0 + 1;
      const cajas = validas.map((c) => caja(c, lado, ALFA_FIGURA));
      cajaDeClic = [
        Math.min(...cajas.map((c) => c[0])) - anchor[0],
        Math.min(...cajas.map((c) => c[1])) - anchor[1],
        Math.max(...cajas.map((c) => c[2])) - anchor[0],
        Math.max(...cajas.map((c) => c[3])) - anchor[1],
      ];
    }
  }

  return {
    imagen: basename(rutaImagen),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    cell: lado,
    columns: columnas,
    altura,
    cajaDeClic: cajaDeClic as [number, number, number, number],
    clips: clips as AtlasDerivado['clips'],
    ...(clips.death === undefined
      ? {}
      : { cadaver: { clip: 'death' as const, frame: clips.death.frames - 1 } }),
    derivadoPor: 'tools/taller/derivar.ts',
  };
}

/** La ruta del JSON de una hoja: al lado, mismo nombre, `.json`. */
export function rutaDelJson(rutaImagen: string): string {
  return rutaImagen.replace(/\.(webp|png)$/, '.json');
}

export async function escribirDerivado(
  rutaImagen: string,
  opciones: Parameters<typeof derivarAtlas>[1] = {},
): Promise<AtlasDerivado> {
  const derivado = await derivarAtlas(rutaImagen, opciones);
  await writeFile(rutaDelJson(rutaImagen), `${JSON.stringify(derivado, null, 2)}\n`);
  return derivado;
}

/** El JSON de una pieza suelta del mapa: su tamaño y dónde pisa el suelo. */
export interface PiezaDerivada {
  readonly imagen: string;
  readonly sha256: string;
  readonly ancho: number;
  readonly alto: number;
  /** El centro de su base: la mediana de x de la franja más baja (15 %) y la fila más baja. */
  readonly ancla: readonly [number, number];
  readonly derivadoPor: 'tools/taller/derivar.ts';
}

export async function derivarPieza(rutaImagen: string): Promise<PiezaDerivada> {
  const bytes = await readFile(rutaImagen);
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alfa = (x: number, y: number): number => data[(y * info.width + x) * 4 + 3] as number;
  let y1 = -1;
  let y0 = info.height;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (alfa(x, y) >= ALFA_FIGURA) {
        if (y < y0) y0 = y;
        y1 = y;
        break;
      }
    }
  }
  if (y1 < 0) throw new Error(`${rutaImagen} no tiene nada opaco`);
  const franja = Math.max(2, Math.round((y1 - y0 + 1) * 0.15));
  const xs: number[] = [];
  for (let y = y1 - franja + 1; y <= y1; y++) {
    for (let x = 0; x < info.width; x++) if (alfa(x, y) >= ALFA_FIGURA) xs.push(x);
  }
  xs.sort((a, b) => a - b);
  return {
    imagen: basename(rutaImagen),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    ancho: info.width,
    alto: info.height,
    ancla: [xs[Math.floor(xs.length / 2)] as number, y1],
    derivadoPor: 'tools/taller/derivar.ts',
  };
}

/** En cuántas franjas de columnas se mide el perfil de un módulo (`perfilDeModulo`). */
export const FRANJAS_DEL_PERFIL = 32;

/**
 * El perfil de lo alto de un módulo de pared, de ladera o de pedregal
 * (`Modulo.perfil`): por cada una de `FRANJAS_DEL_PERFIL` franjas de columnas,
 * de izquierda a derecha, la fracción del alto de la imagen donde empieza lo
 * opaco (`ALFA_FIGURA`). De la columna de la franja que empieza MÁS ABAJO: la
 * cara que se pinta bajo esta línea (`pintadaDeCara`) nunca asoma por encima de
 * la cresta. Una franja sin nada opaco vale 1.
 *
 * Un módulo de `paredes-*` es un bloque en perspectiva cuyo octavo derecho es
 * transparente hasta el 30-58 % del alto, y `rocas-caidas` hasta el 61 %: con
 * la caja, la cara lisa asomaba ahí con su borde recto (#159).
 */
export async function perfilDeModulo(rutaImagen: string): Promise<number[]> {
  const { data, info } = await sharp(await readFile(rutaImagen))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const primera = new Array<number>(w).fill(h);
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++)
      if ((data[(y * w + x) * 4 + 3] as number) >= ALFA_FIGURA) {
        primera[x] = y;
        break;
      }
  return Array.from({ length: FRANJAS_DEL_PERFIL }, (_, k) => {
    const a = Math.floor((k * w) / FRANJAS_DEL_PERFIL);
    const b = Math.max(a + 1, Math.floor(((k + 1) * w) / FRANJAS_DEL_PERFIL));
    // Redondeado hacia abajo de la imagen: un perfil que sube una milésima
    // dejaría asomar la cara sobre la cresta.
    return Math.ceil((Math.max(...primera.slice(a, b)) / h) * 1000) / 1000;
  });
}

/** Lo que `registrarLadera` lee de una pieza de la guía: su caja y sus juntas (`laderas.ts`). */
export type PiezaDeGuia = Pick<GeometriaDeLadera, 'nombre' | 'filoNorte' | 'pieSur' | 'caja'>;

/** La silueta de una guía: lo que no es su fondo (`esFondoDeGuia`). */
export interface MascaraDeGuia {
  readonly ancho: number;
  readonly alto: number;
  readonly dentro: Uint8Array;
}

export async function mascaraDeGuia(rutaPng: string): Promise<MascaraDeGuia> {
  const { data, info } = await sharp(await readFile(rutaPng))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const dentro = new Uint8Array(info.width * info.height);
  for (let i = 0; i < dentro.length; i++)
    dentro[i] = esFondoDeGuia(
      data[i * 3] as number,
      data[i * 3 + 1] as number,
      data[i * 3 + 2] as number,
    )
      ? 0
      : 1;
  return { ancho: info.width, alto: info.height, dentro };
}

/** FFT compleja en el sitio, radix 2: `re` e `im` miden una potencia de 2, con paso `paso` desde `desde`. */
function fft(
  re: Float64Array,
  im: Float64Array,
  n: number,
  desde: number,
  paso: number,
  inversa: boolean,
) {
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const a = desde + i * paso;
      const b = desde + j * paso;
      [re[a], re[b]] = [re[b] as number, re[a] as number];
      [im[a], im[b]] = [im[b] as number, im[a] as number];
    }
  }
  for (let largo = 2; largo <= n; largo <<= 1) {
    const ang = ((inversa ? 2 : -2) * Math.PI) / largo;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += largo) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < largo / 2; k++) {
        const a = desde + (i + k) * paso;
        const b = a + (largo / 2) * paso;
        const br = (re[b] as number) * cr - (im[b] as number) * ci;
        const bi = (re[b] as number) * ci + (im[b] as number) * cr;
        re[b] = (re[a] as number) - br;
        im[b] = (im[a] as number) - bi;
        re[a] = (re[a] as number) + br;
        im[a] = (im[a] as number) + bi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

function fft2(re: Float64Array, im: Float64Array, w: number, h: number, inversa: boolean) {
  for (let y = 0; y < h; y++) fft(re, im, w, y * w, 1, inversa);
  for (let x = 0; x < w; x++) fft(re, im, h, x, w, inversa);
}

const potencia = (n: number) => {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
};

/**
 * Dónde cae la guía en un módulo de ladera ya pintado (§20, #156): el filo norte
 * y el pie sur de su pieza, en píxeles del módulo. El pintor respeta la escala
 * de la guía pero no su sitio —en las 24 hojas, hasta 104 px de lo que diría
 * alinear las cajas—, así que se busca el desplazamiento que más solapa las dos
 * siluetas: la de la guía dentro de la caja de su pieza y lo opaco del módulo.
 *
 * Es una correlación lineal por FFT sobre la caja de la pieza (de dónde sale y
 * en qué difiere de la maqueta de la §20: `docs/historia.md`, #156). Una
 * búsqueda de grueso a fino, más barata, caía en otro sitio en 85 de los 192
 * módulos.
 *
 * Tarda ~0,35 s por módulo: corre en `pnpm taller derivar-laderas`, que lo
 * apunta en el índice de la hoja, no en cada lectura del catálogo.
 */
export async function registrarLadera(
  rutaModulo: string,
  guia: MascaraDeGuia,
  pieza: PiezaDeGuia,
): Promise<Pick<JuntasDeLadera, 'filo' | 'pie'>> {
  const enElModulo = await registrarPieza(rutaModulo, guia, pieza);
  return { filo: enElModulo(pieza.filoNorte), pie: enElModulo(pieza.pieSur) };
}

/**
 * Dónde cae la guía en un módulo de cualquier familia del relieve (laderas,
 * diagonales y bajadas, §20 y §23): la misma correlación que `registrarLadera`,
 * sin nada propio de la ladera. Devuelve cómo llevar un punto de la guía al
 * módulo; cada familia lleva los suyos (el filo y el pie, los dos filos, arriba y
 * abajo).
 */
export async function registrarPieza(
  rutaModulo: string,
  guia: MascaraDeGuia,
  pieza: Pick<PiezaDeGuia, 'nombre' | 'caja'>,
): Promise<(p: readonly [number, number]) => [number, number]> {
  const { data, info } = await sharp(await readFile(rutaModulo))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const [cx0, cy0, cx1, cy1] = pieza.caja;
  const cw = cx1 - cx0 + 1;
  const ch = cy1 - cy0 + 1;
  const W = potencia(cw + info.width - 1);
  const H = potencia(ch + info.height - 1);
  const gr = new Float64Array(W * H);
  const gi = new Float64Array(W * H);
  const mr = new Float64Array(W * H);
  const mi = new Float64Array(W * H);
  let algo = false;
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const gx = cx0 + x;
      const gy = cy0 + y;
      if (gx < guia.ancho && gy < guia.alto && guia.dentro[gy * guia.ancho + gx] === 1) {
        gr[y * W + x] = 1;
        algo = true;
      }
    }
  if (!algo) throw new Error(`la pieza «${pieza.nombre}» no tiene silueta en su caja de la guía`);
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if ((data[(y * info.width + x) * 4 + 3] as number) >= ALFA_FIGURA) mr[y * W + x] = 1;
  fft2(gr, gi, W, H, false);
  fft2(mr, mi, W, H, false);
  // G · conj(M): la correlación c[o] = Σ G[p + o] · M[p].
  for (let k = 0; k < W * H; k++) {
    const a = gr[k] as number;
    const b = gi[k] as number;
    const c = mr[k] as number;
    const d = -(mi[k] as number);
    gr[k] = a * c - b * d;
    gi[k] = a * d + b * c;
  }
  fft2(gr, gi, W, H, true);
  // El módulo suele ser más grande que la silueta de la guía (el pintor añade
  // peñascos y derrubio), y la silueta cabe entera en toda una meseta de
  // desplazamientos con el mismo solape, de hasta 40 px: cualquier máximo lo
  // elegiría el ruido de la FFT. Se toma el centro de la meseta. El solape va
  // redondeado: son cuentas de píxeles.
  let max = -1;
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let oy = -info.height + 1; oy < ch; oy++) {
    const iy = oy < 0 ? oy + H : oy;
    for (let ox = -info.width + 1; ox < cw; ox++) {
      const ix = ox < 0 ? ox + W : ox;
      const v = Math.round((gr[iy * W + ix] as number) / (W * H));
      if (v > max) {
        max = v;
        n = 0;
        sx = 0;
        sy = 0;
      }
      if (v === max) {
        n++;
        sx += ox;
        sy += oy;
      }
    }
  }
  const o = [Math.round(sx / n), Math.round(sy / n)] as const;
  // Punto del módulo = punto de la guía − desplazamiento.
  const ox = o[0] + cx0;
  const oy = o[1] + cy0;
  return ([x, y]) => [x - ox, y - oy];
}

export async function escribirPiezaDerivada(rutaImagen: string): Promise<PiezaDerivada> {
  const d = await derivarPieza(rutaImagen);
  await writeFile(rutaDelJson(rutaImagen), `${JSON.stringify(d, null, 2)}\n`);
  return d;
}

/** El JSON de una tira de efecto: cuántos fotogramas tienen algo y la caja que ocupan todos. */
export interface EfectoDerivado {
  readonly imagen: string;
  readonly sha256: string;
  readonly celda: number;
  readonly fotogramas: number;
  /** Unión de las cajas del alfa de todos los fotogramas, dentro de una celda: [x0, y0, x1, y1]. */
  readonly caja: readonly [number, number, number, number];
  readonly derivadoPor: 'tools/taller/derivar.ts';
}

export async function derivarEfecto(rutaImagen: string): Promise<EfectoDerivado> {
  const bytes = await readFile(rutaImagen);
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const lado = info.height;
  if (info.width % lado !== 0) throw new Error(`${rutaImagen} no es una tira de celdas cuadradas`);
  let fotogramas = 0;
  const caja: [number, number, number, number] = [lado, lado, -1, -1];
  for (let f = 0; f < info.width / lado; f++) {
    let alguno = false;
    for (let y = 0; y < lado; y++) {
      for (let x = 0; x < lado; x++) {
        if ((data[(y * info.width + f * lado + x) * 4 + 3] as number) < ALFA_FIGURA) continue;
        alguno = true;
        if (x < caja[0]) caja[0] = x;
        if (y < caja[1]) caja[1] = y;
        if (x > caja[2]) caja[2] = x;
        if (y > caja[3]) caja[3] = y;
      }
    }
    if (alguno) fotogramas++;
  }
  return {
    imagen: basename(rutaImagen),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    celda: lado,
    fotogramas,
    caja,
    derivadoPor: 'tools/taller/derivar.ts',
  };
}

export async function escribirEfectoDerivado(rutaImagen: string): Promise<EfectoDerivado> {
  const d = await derivarEfecto(rutaImagen);
  await writeFile(rutaDelJson(rutaImagen), `${JSON.stringify(d, null, 2)}\n`);
  return d;
}

/** Las escalas que se prueban al registrar una pieza sobre su guía: el pintor la dibuja algo mayor o menor. */
const ESCALAS = Array.from({ length: 25 }, (_, k) => 0.8 + k * 0.025);

/**
 * Dónde cae la guía en la imagen de una pieza, con su escala: el pintor calca
 * la forma pero no el tamaño (el primer lote de rampas salió un 17 % mayor), y
 * `registrarPieza` solo traslada. Se prueba cada escala de `ESCALAS` —la imagen
 * reducida o ampliada, registrada por traslación— y se queda la que más solapa
 * las dos siluetas (intersección entre unión). Devuelve cómo llevar un punto de
 * la guía a la imagen, con ese solape y esa escala. Lo usan las rampas (`rampas.ts`)
 * y las piezas del recinto (`recinto.ts`).
 */
export async function registrarConEscala(
  entera: string,
  guiaPng: string,
  caja: readonly [number, number, number, number],
  nombre: string,
): Promise<{ llevar: (p: P2) => P2; solape: number; escala: number }> {
  const mascara = await mascaraDeGuia(guiaPng);
  const original = await sharp(await readFile(entera)).metadata();
  const ow = original.width as number;
  const oh = original.height as number;
  const tmp = join(RAIZ, '.cache', `registro-${nombre.replaceAll('/', '-')}.png`);
  await mkdir(dirname(tmp), { recursive: true });
  let mejor: { iou: number; k: number; f: (p: P2) => P2 } | null = null;
  for (const k of ESCALAS) {
    const w = Math.round(ow / k);
    const h = Math.round(oh / k);
    const { data } = await sharp(await readFile(entera))
      .resize(w, h)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    await sharp(data, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toFile(tmp);
    const f = await registrarPieza(tmp, mascara, { nombre, caja });
    const [ox, oy] = f([0, 0]);
    let dentro = 0;
    let ambos = 0;
    for (let gy = caja[1]; gy <= caja[3]; gy++)
      for (let gx = caja[0]; gx <= caja[2]; gx++) {
        if (mascara.dentro[gy * mascara.ancho + gx] !== 1) continue;
        dentro++;
        const x = gx + ox;
        const y = gy + oy;
        if (
          x >= 0 &&
          y >= 0 &&
          x < w &&
          y < h &&
          (data[(y * w + x) * 4 + 3] as number) >= ALFA_FIGURA
        )
          ambos++;
      }
    let opacos = 0;
    for (let i = 3; i < data.length; i += 4) if ((data[i] as number) >= ALFA_FIGURA) opacos++;
    const iou = ambos / (dentro + opacos - ambos);
    if (mejor === null || iou > mejor.iou)
      mejor = {
        iou,
        k,
        f: (p: P2): P2 => {
          const [x, y] = f(p);
          return [x * k, y * k];
        },
      };
  }
  await rm(tmp, { force: true });
  if (mejor === null) throw new Error(`${nombre}: no se pudo registrar sobre la guía`);
  console.log(
    `  · ${nombre}: escala ${mejor.k.toFixed(3)}, solape ${(mejor.iou * 100).toFixed(1)} %`,
  );
  return { llevar: mejor.f, solape: mejor.iou, escala: mejor.k };
}
