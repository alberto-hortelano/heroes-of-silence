/**
 * Las pruebas del mapa de profundidad (10-10-2026): ¿copia mejor el modelo de
 * imagen el movimiento del maniquí —el balanceo del reposo, la marcha— si ve
 * su volumen? Cada variante es la hoja A (quieto, andando, carga) de una unidad
 * en las 8 direcciones, con otras referencias de pose, pintada fuera de
 * `assets/`: en `.cache/experimentos/<variante>/<id>/dN/`. Que la carpeta de
 * encima de `dN` se llame como la unidad hace que juntar y derivar (su ritmo,
 * su vaivén) funcionen igual que con su arte.
 *
 *
 * Y las ediciones (`EDICIONES`): darle una hoja ya pintada de una variante y
 * pedirle que la edite para que copie mejor la pose, con la hoja del maniquí al
 * lado (`editar`) o con su silueta superpuesta en la propia hoja (`editar-silueta`).
 *
 *   pnpm taller maniqui <id> --profundidad          antes: las hojas de profundidad y mezcla
 *   pnpm taller experimento <id> [--variantes=control,mezcla,editar] [--base=control] [--solo=d1]
 *   pnpm taller trabajar
 *   pnpm taller experimento-medir <id>
 *   pnpm taller vista-versiones <id>               el visor de todas las versiones de quieto y andando
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { FIGURA, HOJAS_DE_FIGURA } from '../../src/shared/arte.js';
import type { Encargo } from './encargo.js';
import {
  alfa,
  type DeLaPose,
  evaluarDireccion,
  maniquiEnLaCelda,
  poseDeLaProcedencia,
  transformacionDeCelda,
} from './evaluar.js';
import { encargosDeOchoDirecciones, PINTURA, type Unidad } from './unidades.js';

const RAIZ = resolve(import.meta.dirname, '../..');

/** Dónde se pintan las pruebas, relativo al repo (`.cache/` no se commitea). */
export const DIR_EXPERIMENTOS = '.cache/experimentos';

/**
 * Las referencias de pose de cada variante, a partir de la hoja de color del
 * maniquí (`d<n>-a.png`): sus hermanas `.profundidad.png` y `.mezcla.png` las
 * escribe `pnpm taller maniqui <id> --profundidad`.
 */
export const VARIANTES = {
  /** Lo de siempre: la pose en color sobre verde. */
  control: (pose: string): Encargo['referencias'] => [{ ruta: pose, papel: 'pose' }],
  /** La pose en color y, de última imagen, su mapa de profundidad. */
  'color-profundidad': (pose: string): Encargo['referencias'] => [
    { ruta: pose, papel: 'pose' },
    { ruta: hermana(pose, 'profundidad'), papel: 'profundidad' },
  ],
  /** El mapa de profundidad en lugar de la pose en color. */
  'solo-profundidad': (pose: string): Encargo['referencias'] => [
    { ruta: hermana(pose, 'profundidad'), papel: 'pose-profundidad' },
  ],
  /** La pose en color sombreada por la profundidad: una sola imagen de pose. */
  mezcla: (pose: string): Encargo['referencias'] => [
    { ruta: hermana(pose, 'mezcla'), papel: 'pose' },
  ],
} as const;
export type Variante = keyof typeof VARIANTES;

function hermana(pose: string, sufijo: 'profundidad' | 'mezcla'): string {
  return pose.replace(/\.png$/, `.${sufijo}.png`);
}

/** La carpeta de una dirección de una variante, relativa al repo. */
export const carpetaDelExperimento = (variante: string, id: string, d: number): string =>
  `${DIR_EXPERIMENTOS}/${variante}/${id}/d${d}`;

/**
 * Los encargos de una variante: los de la hoja A de `encargosDeOchoDirecciones`
 * con otro id, otra salida y la referencia de pose de la variante en su sitio
 * (las demás —identidad, estilo— tal cual; una referencia de profundidad que
 * complementa va al final).
 */
export function encargosDelExperimento(u: Unidad, variante: Variante): Encargo[] {
  return encargosDeOchoDirecciones(u)
    .filter((e) => e.ocho?.hoja === 'a')
    .map((e) => {
      const d = e.ocho?.direccion as number;
      const [pose, ...resto] = e.referencias;
      if (pose?.papel !== 'pose-profundidad')
        throw new Error(`${e.id}: su primera referencia no es la pose en profundidad`);
      // Las variantes parten de la hoja en color, hermana de la de profundidad.
      const color = pose.ruta.replace(/\.profundidad\.png$/, '.png');
      const [primera, ...complemento] = VARIANTES[variante](color);
      return {
        ...e,
        id: `${u.id}-exp-${variante}-d${d}-a`,
        referencias: [primera as Encargo['referencias'][number], ...resto, ...complemento],
        salida: `${carpetaDelExperimento(variante, u.id, d)}/hoja-a`,
      };
    });
}

/**
 * Deja en cada dirección de la variante la hoja B del arte de la unidad (con
 * su procedencia): juntar pide las seis filas, y en las pruebas solo se miran
 * las de la A. Lanza si la unidad no tiene sus hojas B, o si a una variante le
 * falta una referencia: sin el maniquí con profundidad, se pintaría con nada.
 */
export async function prepararExperimento(u: Unidad, variante: Variante): Promise<Encargo[]> {
  return prepararCarpetas(u, encargosDelExperimento(u, variante));
}

async function prepararCarpetas(u: Unidad, encargos: Encargo[]): Promise<Encargo[]> {
  for (const e of encargos) {
    for (const r of e.referencias)
      if (!existsSync(join(RAIZ, r.ruta)))
        throw new Error(
          `${e.id}: falta ${r.ruta}${r.ruta.includes('.profundidad.') || r.ruta.includes('.mezcla.') ? ` (pnpm taller maniqui ${u.id} --profundidad)` : ''}`,
        );
    const d = e.ocho?.direccion as number;
    const origen = join(RAIZ, 'assets/unidades', u.id, `d${d}`);
    const destino = join(RAIZ, e.salida, '..');
    await mkdir(destino, { recursive: true });
    for (const f of ['hoja-b.webp', 'hoja-b.procedencia.json'])
      await copyFile(join(origen, f), join(destino, f));
  }
  return encargos;
}

/** El tamaño de la hoja A que se pide a los motores que lo aceptan: 7×3, múltiplo de 16. */
const HOJA_A = { width: 2016, height: 864 } as const;

/** El prompt en inglés de FLUX.1 (no entiende bien el español), para el vampiro. */
const PROMPT_DE_FLUX_DEPTH =
  'A sprite sheet on a flat uniform medium grey (#808080) background: exactly 7 columns by 3 rows, 21 full-body figures of the SAME character, evenly spaced and not touching, each one in exactly the pose of the depth map. The character: a vampire lord, a noble with very pale skin and long black hair, a dark crimson velvet doublet with black embroidery, a light black cuirass, a high-collared black cape with red lining, a thin one-handed rapier in the right hand, the left hand free with claws, no shield. Orthographic camera looking down 25 degrees, seeing the top of the head and both shoulders. Painted dark medieval fantasy illustration, worn believable materials, sober palette, clear silhouette; not a toy, not a cartoon, not a 3D render. Light from the upper left and the front. No ground, no cast shadow, no text, no grid.';

/**
 * Los modelos de fal.ai de las pruebas (10-10-2026), cada uno con la hoja A del
 * maniquí en profundidad como pose, el giro y el estilo (los de `solo-profundidad`).
 * `coste`: lo que cuesta una hoja según la página de fal (estimado donde cobra
 * por megapíxel o por tokens).
 */
export const MOTORES = {
  'gpt-image-2': {
    endpoint: 'openai/gpt-image-2/edit',
    // fal no le admite fondo transparente (422): liso y recortado, como los demás.
    params: {
      image_size: HOJA_A,
      quality: 'high',
      background: 'opaque',
      output_format: 'png',
    },
    coste: 0.4,
    fondo: 'liso',
  },
  'nano-banana-2': {
    endpoint: 'fal-ai/nano-banana-2/edit',
    params: { aspect_ratio: '21:9', resolution: '2K', output_format: 'png' },
    coste: 0.12,
    fondo: 'liso',
  },
  'flux-depth': {
    endpoint: 'fal-ai/flux-control-lora-depth',
    params: { image_size: HOJA_A, preprocess_depth: false, output_format: 'png' },
    coste: 0.08,
    fondo: 'liso',
    control: true,
    prompt: PROMPT_DE_FLUX_DEPTH,
  },
  'seedream-4-5': {
    endpoint: 'fal-ai/bytedance/seedream/v4.5/edit',
    // Su mínimo: 2560×1440 píxeles en total.
    params: { image_size: { width: 3360, height: 1440 } },
    coste: 0.04,
    fondo: 'liso',
  },
  'flux-2-pro': {
    endpoint: 'fal-ai/flux-2-pro/edit',
    params: { image_size: HOJA_A, output_format: 'png' },
    coste: 0.14,
    fondo: 'liso',
  },
  'qwen-edit': {
    endpoint: 'fal-ai/qwen-image-edit-2509',
    // Saca ~1 megapíxel aunque se le pida más (con 2016×864 devolvía 1376×768 y
    // cortaba la primera y la última columna): la proporción de la hoja en 1 MP.
    params: { image_size: { width: 1568, height: 672 }, output_format: 'png' },
    coste: 0.06,
    fondo: 'liso',
  },
  // Hecho para editar conservando lo demás; con varias imágenes (`/multi`).
  'flux-kontext': {
    endpoint: 'fal-ai/flux-pro/kontext/max/multi',
    params: { aspect_ratio: '21:9', output_format: 'png' },
    coste: 0.08,
    fondo: 'liso',
  },
  // Transferencia de movimiento (`video.ts`): `coste` por segundo de vídeo; tres
  // vídeos por hoja de unos 3 s.
  'wan-animate': {
    endpoint: 'fal-ai/wan/v2.2-14b/animate/move',
    params: { resolution: '720p' },
    coste: 0.08,
    fondo: 'liso',
    video: true,
  },
  'kling-motion': {
    endpoint: 'fal-ai/kling-video/v3/standard/motion-control',
    params: {
      character_orientation: 'video',
      keep_original_sound: false,
      prompt:
        'The same character as the reference image, performing exactly the movements of the reference video, on the same flat plain grey background. He holds a THIN one-handed rapier with a swept hilt in his right hand, never a broadsword. Painted dark medieval fantasy style. The camera does not move.',
    },
    coste: 0.126,
    fondo: 'liso',
    video: true,
  },
} as const satisfies Record<
  string,
  Omit<NonNullable<Encargo['motor']>, 'nombre' | 'params'> & { params: Record<string, unknown> }
>;
export type NombreDeMotor = keyof typeof MOTORES;

/** Lo que costará una hoja con un motor: la de un motor de vídeo, tres vídeos de unos 3,3 s. */
export const costePorHoja = (motor: NombreDeMotor): number => {
  const m: { coste: number; video?: true } = MOTORES[motor];
  return m.video === true ? Math.round(m.coste * 3.3 * 3 * 1000) / 1000 : m.coste;
};

/** La carpeta de las pruebas de un motor. */
export const pruebaDeMotor = (motor: NombreDeMotor): string => `fal-${motor}`;

/** Los encargos de un motor: los de `solo-profundidad`, pintados con él. */
export function encargosConMotor(u: Unidad, motor: NombreDeMotor, intento?: number): Encargo[] {
  const prueba = pruebaDeMotor(motor);
  const m = MOTORES[motor];
  return encargosDelExperimento(u, 'solo-profundidad').map((e) => {
    const d = e.ocho?.direccion as number;
    return {
      ...e,
      id: `${u.id}-exp-${prueba}-d${d}-a`,
      salida: `${carpetaDelExperimento(prueba, u.id, d)}/hoja-a`,
      motor: {
        nombre: motor,
        ...m,
        params: { ...m.params },
        ...(intento === undefined ? {} : { intento }),
      },
    };
  });
}

/** Lo que se le pide al editar el maniquí, después del aspecto del personaje. */
const PEDIDO_SOBRE_EL_MANIQUI =
  'Edita la imagen 1: convierte cada maniquí en este personaje (el de la imagen 2), con su ropa, su arma, sus colores y su acabado pintado, y deja TODO lo demás igual: la postura de cada figura articulación por articulación, su sitio, su tamaño, su orientación y el fondo gris liso.';

/**
 * Los encargos de editar el propio maniquí con un motor: la hoja A del maniquí
 * en color es la imagen que se edita (`editar-maniqui`), y el giro y el estilo,
 * las referencias. Carpeta `fal-<motor>-sobre-maniqui`.
 */
export function encargosSobreElManiqui(
  u: Unidad,
  motor: NombreDeMotor,
  intento?: number,
): Encargo[] {
  const prueba = `${pruebaDeMotor(motor)}-sobre-maniqui`;
  return encargosConMotor(u, motor, intento).map((e) => {
    const d = e.ocho?.direccion as number;
    const pose = encargosDelExperimento(u, 'control')[d]?.referencias[0]?.ruta as string;
    const [, ...resto] = e.referencias;
    return {
      ...e,
      id: `${u.id}-exp-${prueba}-d${d}-a`,
      descripcion: [u.aspecto, PEDIDO_SOBRE_EL_MANIQUI, PINTURA].join('\n'),
      referencias: [{ ruta: pose, papel: 'editar-maniqui' as const }, ...resto],
      salida: `${carpetaDelExperimento(prueba, u.id, d)}/hoja-a`,
      ocho: { direccion: d, hoja: 'a' as const, pose },
    };
  });
}

/** Deja listas las carpetas de un motor y devuelve sus encargos. */
export async function prepararConMotor(
  u: Unidad,
  motor: NombreDeMotor,
  intento?: number,
): Promise<Encargo[]> {
  return prepararCarpetas(u, encargosConMotor(u, motor, intento));
}

/** Deja listas las carpetas de editar el maniquí con un motor y devuelve sus encargos. */
export async function prepararSobreElManiqui(
  u: Unidad,
  motor: NombreDeMotor,
  intento?: number,
): Promise<Encargo[]> {
  return prepararCarpetas(u, encargosSobreElManiqui(u, motor, intento));
}

/**
 * Las ediciones: la hoja A ya pintada de una variante (`base`), editada para
 * que copie mejor la pose. `editar`, con la hoja del maniquí de imagen 2;
 * `editar-silueta`, con la silueta del maniquí superpuesta en la propia hoja
 * (`hojaConSilueta`) y nada más.
 */
export const EDICIONES = ['editar', 'editar-silueta'] as const;
export type Edicion = (typeof EDICIONES)[number];

/** La carpeta de una edición: lleva el nombre de su base (`editar-de-control`). */
export const pruebaDeEdicion = (edicion: Edicion, base: Variante): string =>
  `${edicion}-de-${base}`;

/** El color de la silueta superpuesta: ni el verde del fondo ni la paleta del vampiro. */
const CIAN = [0, 229, 255] as const;
/** Lo que deja ver el relleno de la silueta de lo que hay debajo. */
const OPACIDAD_DE_LA_SILUETA = 0.45;

/**
 * La hoja pintada (`hoja-a.webp` de una variante) con la silueta de su maniquí
 * encima, celda a celda, llevada como la lleva el evaluador
 * (`transformacionDeCelda`, `maniquiEnLaCelda`): un relleno cian translúcido y
 * su contorno, opaco. Fondo transparente: se le enseña sobre verde.
 */
export async function hojaConSilueta(carpetaBase: string): Promise<Buffer> {
  const rutaHoja = join(carpetaBase, 'hoja-a.webp');
  const proc = JSON.parse(await readFile(join(carpetaBase, 'hoja-a.procedencia.json'), 'utf8'));
  const pose = await alfa(join(RAIZ, poseDeLaProcedencia(proc)));
  const pintada = await alfa(rutaHoja);
  const { width, height } = await sharp(rutaHoja).metadata();
  const lado = (width as number) / FIGURA.columnas;
  const apuntada = proc.deLaPose as DeLaPose;
  const fuera = Buffer.from(pintada.data);
  for (let fila = 0; fila < HOJAS_DE_FIGURA.a.length; fila++)
    for (let col = 0; col < FIGURA.columnas; col++) {
      const t = transformacionDeCelda(pintada, fila, pose, fila, col, lado, apuntada, apuntada.k);
      const m = maniquiEnLaCelda(pose, fila, col, lado, t);
      const en = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < lado && y < lado && m[y * lado + x] === 1;
      for (let y = 0; y < lado; y++)
        for (let x = 0; x < lado; x++) {
          if (!en(x, y)) continue;
          const i = ((fila * lado + y) * (width as number) + col * lado + x) * 4;
          const borde = !en(x - 1, y) || !en(x + 1, y) || !en(x, y - 1) || !en(x, y + 1);
          // Cian encima de lo pintado: el contorno opaco, el relleno translúcido.
          const a = borde ? 1 : OPACIDAD_DE_LA_SILUETA;
          const debajo = (fuera[i + 3] as number) / 255;
          const total = a + debajo * (1 - a);
          for (let k = 0; k < 3; k++)
            fuera[i + k] = Math.round(
              ((CIAN[k] as number) * a + (fuera[i + k] as number) * debajo * (1 - a)) / total,
            );
          fuera[i + 3] = Math.round(total * 255);
        }
    }
  return sharp(fuera, { raw: { width: width as number, height: height as number, channels: 4 } })
    .png()
    .toBuffer();
}

/** Lo que se le pide en cada edición, después del aspecto del personaje. */
const PEDIDO: Record<Edicion, string> = {
  editar:
    'Cambia la postura de cada figura de la imagen 1 para que copie la de su misma celda (la misma fila y la misma columna) en la imagen 2: brazos, piernas, torso, cabeza y arma, articulación por articulación. Conserva todo lo demás: el personaje, su ropa, sus colores, su acabado, el tamaño y el sitio de cada figura.',
  'editar-silueta':
    'Mueve brazos, piernas, torso, cabeza y arma de cada figura hasta que llene su silueta cian, articulación por articulación; solo la capa, el pelo y la ropa suelta pueden salirse de ella. Después BORRA la silueta: en el resultado no queda nada cian, ni relleno ni contorno. Conserva todo lo demás: el personaje, su ropa, sus colores, su acabado, el tamaño y el sitio de cada figura.',
};

/**
 * Los encargos de una edición sobre la variante `base` ya pintada: la hoja que
 * se edita primero (`editar` o `editar-silueta`) y la hoja del maniquí aparte,
 * en `ocho.pose`, para escalar y evaluar.
 */
export function encargosDeEdicion(u: Unidad, edicion: Edicion, base: Variante): Encargo[] {
  const prueba = pruebaDeEdicion(edicion, base);
  return encargosDelExperimento(u, 'control').map((e) => {
    const d = e.ocho?.direccion as number;
    const pose = e.referencias[0]?.ruta as string;
    const carpetaBase = carpetaDelExperimento(base, u.id, d);
    const carpeta = carpetaDelExperimento(prueba, u.id, d);
    return {
      ...e,
      id: `${u.id}-exp-${prueba}-d${d}-a`,
      descripcion: [u.aspecto, PEDIDO[edicion], PINTURA].join('\n'),
      referencias:
        edicion === 'editar'
          ? [
              { ruta: `${carpetaBase}/hoja-a.webp`, papel: 'editar' },
              { ruta: pose, papel: 'pose' },
            ]
          : [{ ruta: `${carpeta}/entrada-silueta.png`, papel: 'editar-silueta' }],
      salida: `${carpeta}/hoja-a`,
      ocho: { direccion: d, hoja: 'a', pose },
    };
  });
}

/**
 * Deja listas las carpetas de una edición —la hoja B, y en `editar-silueta` la
 * hoja con la silueta encima (`entrada-silueta.png`)— y devuelve sus encargos.
 * Lanza si la base no está pintada en alguna dirección.
 */
export async function prepararEdicion(
  u: Unidad,
  edicion: Edicion,
  base: Variante,
): Promise<Encargo[]> {
  const encargos = encargosDeEdicion(u, edicion, base);
  for (const e of encargos) {
    const d = e.ocho?.direccion as number;
    const carpetaBase = join(RAIZ, carpetaDelExperimento(base, u.id, d));
    if (!existsSync(join(carpetaBase, 'hoja-a.procedencia.json')))
      throw new Error(`${e.id}: la base «${base}» no está pintada en d${d} (${carpetaBase})`);
    if (edicion === 'editar-silueta') {
      const destino = join(RAIZ, e.salida, '..');
      await mkdir(destino, { recursive: true });
      await writeFile(join(destino, 'entrada-silueta.png'), await hojaConSilueta(carpetaBase));
    }
  }
  return prepararCarpetas(u, encargos);
}

/** Lo que se mide de una fila pintada frente a su maniquí. */
export interface MedidaDeFila {
  /** Lo que falta de la silueta del maniquí, mediana de las columnas (`evaluar`: «nivel»). */
  readonly faltan: number;
  /**
   * Cuánto cambia la silueta pintada de una columna a la siguiente, sumado, entre
   * lo mismo en el maniquí llevado al atlas: 1, se mueve como él; ~0, estatua.
   */
  readonly movimiento: number;
}

/**
 * Lo que costó cada hoja A de una prueba en fal (el `coste` de su procedencia),
 * o `null` si se pintó con ChatGPT por la suscripción.
 */
export function costeDe(prueba: string, id: string): { porHoja: number; total: number } | null {
  const costes = Array.from({ length: 8 }, (_, d) => {
    const ruta = join(RAIZ, carpetaDelExperimento(prueba, id, d), 'hoja-a.procedencia.json');
    if (!existsSync(ruta)) return undefined;
    return (JSON.parse(readFileSync(ruta, 'utf8')) as { coste?: number }).coste;
  });
  const pagados = costes.filter((c): c is number => c !== undefined);
  if (pagados.length === 0) return null;
  const total = pagados.reduce((s, c) => s + c, 0);
  return { porHoja: total / pagados.length, total };
}

/** Las carpetas de pruebas de una unidad: las variantes y las ediciones, en orden. */
export function pruebasDe(id: string): string[] {
  const base = join(RAIZ, DIR_EXPERIMENTOS);
  if (!existsSync(base)) return [];
  const orden = Object.keys(VARIANTES);
  return readdirSync(base, { withFileTypes: true })
    .filter((v) => v.isDirectory() && existsSync(join(base, v.name, id)))
    .map((v) => v.name)
    .sort(
      (a, b) => (orden.indexOf(a) + 1 || 99) - (orden.indexOf(b) + 1 || 99) || a.localeCompare(b),
    );
}

/** Los clips de la hoja A que se miden. */
const CLIPS_MEDIDOS = ['idle', 'walk', 'charge'] as const;

/**
 * Mide cada variante pintada entera (las 8 direcciones juntadas) con el
 * evaluador del taller: por variante, clip y dirección, y la media de las 8.
 * Escribe `.cache/experimentos/medidas-<id>.json` y lo devuelve.
 */
export async function medirExperimento(
  id: string,
): Promise<
  Record<
    string,
    Record<string, { readonly media: MedidaDeFila; readonly porDireccion: MedidaDeFila[] }>
  >
> {
  const fuera: Awaited<ReturnType<typeof medirExperimento>> = {};
  for (const variante of pruebasDe(id)) {
    const dirs = Array.from({ length: 8 }, (_, d) =>
      join(RAIZ, carpetaDelExperimento(variante, id, d)),
    );
    if (!dirs.every((dir) => existsSync(join(dir, 'atlas.json')))) continue;
    const porClip: Record<string, MedidaDeFila[]> = {};
    for (const [d, dir] of dirs.entries()) {
      const celdas = await evaluarDireccion(id, d, dir);
      for (const clip of CLIPS_MEDIDOS) {
        const fila = celdas.filter((c) => c.clip === clip);
        const faltan = [...fila.map((c) => c.faltan)].sort((a, b) => a - b);
        const pintada = fila.reduce((s, c) => s + c.cambioPintada, 0);
        const maniqui = fila.reduce((s, c) => s + c.cambioManiqui, 0);
        const medidas = porClip[clip] ?? [];
        medidas.push({
          faltan: faltan[Math.floor(faltan.length / 2)] ?? 0,
          movimiento: maniqui === 0 ? 0 : pintada / maniqui,
        });
        porClip[clip] = medidas;
      }
    }
    fuera[variante] = Object.fromEntries(
      Object.entries(porClip).map(([clip, medidas]) => [
        clip,
        {
          media: {
            faltan: medidas.reduce((s, m) => s + m.faltan, 0) / medidas.length,
            movimiento: medidas.reduce((s, m) => s + m.movimiento, 0) / medidas.length,
          },
          porDireccion: medidas,
        },
      ]),
    );
  }
  await writeFile(
    join(RAIZ, DIR_EXPERIMENTOS, `medidas-${id}.json`),
    `${JSON.stringify(fuera, null, 2)}\n`,
  );
  return fuera;
}
