/**
 * La única puerta del taller al entorno de visión (`.cache/vision/.venv`, decisión
 * del usuario del 30-10-2026: el ML local en un entorno `uv` aislado). El Python
 * solo produce imágenes y cifras para los jueces y la persona —los paneles de un
 * clip, el panel a ciegas de dos versiones, el visor animado—; lo que decide,
 * rechaza o escribe en `assets/` es TypeScript y tiene test. CI no tiene el
 * entorno, y nada de lo que corre en CI pasa por aquí.
 *
 *   pnpm taller vision-instalar      crea el entorno desde `requirements.txt`
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import sharp from 'sharp';

const RAIZ = resolve(import.meta.dirname, '../../..');
export const ENTORNO = join(RAIZ, '.cache/vision/.venv');
const PYTHON = join(ENTORNO, 'bin/python');
const VISION = join(RAIZ, 'tools/taller/revision/vision.py');
const REQUISITOS = join(RAIZ, 'tools/taller/revision/requirements.txt');

/** Lo que se le pide a `vision.py paneles`: los paneles de los clips de una dirección. */
export interface TrabajoDePaneles {
  readonly unidad: string;
  readonly direccion: number;
  /** `assets/unidades/<id>` o `assets/npcs/<id>`: de ahí el atlas, las hojas y el giro. */
  readonly carpetaDelArte: string;
  /** La carpeta del maniquí, con sus hojas y sus `*.huesos.json`. */
  readonly maniqui: string;
  /** Solo estos clips. */
  readonly clips?: readonly string[];
  /** Las filas de cada hoja (`HOJAS_DE_FIGURA`). */
  readonly filasDeHoja: Readonly<Record<string, readonly string[]>>;
  readonly salida: string;
}

/** Lo que se le pide a `vision.py comparacion`: A y B de una misma hoja, un panel por clip. */
export interface TrabajoDeComparacion extends Omit<TrabajoDePaneles, 'clips'> {
  readonly hoja: string;
  /** El ritmo de cada clip (el del atlas de la dirección). */
  readonly fps: Readonly<Record<string, number>>;
  readonly versiones: { readonly A: string; readonly B: string };
}

/** Una animación de un caso del visor: un clip pintado (del atlas o de una hoja) o su maniquí. */
export interface AnimacionDelVisor {
  readonly rotulo: string;
  readonly unidad: string;
  readonly direccion: number;
  readonly carpetaDelArte: string;
  readonly maniqui: string;
  readonly filasDeHoja: Readonly<Record<string, readonly string[]>>;
  readonly clip: string;
  /** Una hoja suelta (y su letra) en vez del atlas. */
  readonly hoja?: string;
  readonly letra?: string;
  /**
   * Lo pintado (por defecto), su maniquí junto a lo pintado, o el maniquí solo, de
   * su hoja de pose (`solo-maniqui`: el visor del maniquí, sin nada pintado).
   */
  readonly de?: 'pintado' | 'maniqui' | 'solo-maniqui';
  /** Otra velocidad que la del juego (a 2 fps se cuentan los fotogramas). */
  readonly fps?: number;
}

/** Un caso del visor: la pregunta la escribe quien va a leer la respuesta. */
export interface CasoDelVisor {
  readonly id: string;
  readonly titulo: string;
  readonly texto: string;
  readonly opciones: readonly string[];
  readonly animaciones: readonly AnimacionDelVisor[];
}

function comprobarEntorno(): void {
  if (!existsSync(PYTHON))
    throw new Error(
      `no está el entorno de visión (${relative(RAIZ, ENTORNO)}): créalo con «pnpm taller vision-instalar»`,
    );
}

/** Corre `vision.py <orden> <trabajo>` y espera; su salida va a la consola. */
async function correr(orden: 'paneles' | 'comparacion', trabajo: object): Promise<void> {
  comprobarEntorno();
  const dir = await mkdtemp(join(tmpdir(), 'taller-vision-'));
  try {
    const ruta = join(dir, 'trabajo.json');
    await writeFile(ruta, JSON.stringify(trabajo));
    // `-I`: el Python aislado, sin el directorio de trabajo ni variables de entorno en su ruta.
    execFileSync(PYTHON, ['-I', VISION, orden, ruta], { cwd: RAIZ, stdio: 'inherit' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export const paneles = (t: TrabajoDePaneles): Promise<void> => correr('paneles', t);
export const comparacion = (t: TrabajoDeComparacion): Promise<void> => correr('comparacion', t);

/**
 * Escribe `casos.json` en `carpeta` y sirve el visor (en el puerto que dé el
 * sistema; imprime la URL). No vuelve: se para con su grupo. Las respuestas, en
 * `carpeta/respuestas.json`.
 */
export async function visor(carpeta: string, casos: readonly CasoDelVisor[]): Promise<never> {
  comprobarEntorno();
  await mkdir(carpeta, { recursive: true });
  await writeFile(join(carpeta, 'casos.json'), `${JSON.stringify(casos, null, 1)}\n`);
  const hijo = spawn(PYTHON, ['-I', VISION, 'visor', carpeta, '0'], {
    cwd: RAIZ,
    stdio: 'inherit',
  });
  return new Promise((_, reject) => {
    hijo.on('error', reject);
    hijo.on('close', (c) => reject(new Error(`el visor se paró (salió con ${c})`)));
  });
}

/** Crea el entorno con `uv` desde `requirements.txt`, con las versiones medidas. */
export function instalar(): void {
  execFileSync('uv', ['venv', ENTORNO, '--python', '3.11'], { cwd: RAIZ, stdio: 'inherit' });
  execFileSync('uv', ['pip', 'install', '--python', PYTHON, '-r', REQUISITOS], {
    cwd: RAIZ,
    stdio: 'inherit',
  });
}

/** Si el entorno de visión está: sin él (CI) nada lo usa y todo sigue sin el estimador. */
export const hayVision = (): boolean => existsSync(PYTHON);

/**
 * El tronco que ve el estimador de pose en cada celda (la media de caderas y hombros,
 * o `null`): la señal absoluta de C1 al empaquetar (`EstimarTroncos`, `encuadre.ts`).
 */
export async function estimarTroncos(
  celdas: readonly { readonly data: Uint8Array; readonly lado: number }[],
): Promise<(readonly [number, number] | null)[]> {
  comprobarEntorno();
  const dir = await mkdtemp(join(tmpdir(), 'taller-troncos-'));
  try {
    const rutas = await Promise.all(
      celdas.map(async (c, i) => {
        const ruta = join(dir, `celda-${i}.png`);
        await sharp(Buffer.from(c.data), { raw: { width: c.lado, height: c.lado, channels: 4 } })
          .png()
          .toFile(ruta);
        return ruta;
      }),
    );
    const trabajo = join(dir, 'trabajo.json');
    const salida = join(dir, 'troncos.json');
    await writeFile(trabajo, JSON.stringify({ celdas: rutas }));
    execFileSync(PYTHON, ['-I', VISION, 'troncos', trabajo, salida], {
      cwd: RAIZ,
      stdio: 'ignore',
    });
    return JSON.parse(await readFile(salida, 'utf8')) as (readonly [number, number] | null)[];
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
