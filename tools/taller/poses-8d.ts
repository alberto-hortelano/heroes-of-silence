/**
 * Las anclas de las poses del Y Bot en 8 direcciones, derivadas y comprometidas:
 *
 *   pnpm taller derivar-poses
 *
 * El Y Bot es el respaldo de toda figura que no tiene arte propio (decisión del
 * usuario, 03-10-2026), y el cliente lo pinta tal cual sale de sprite-forge
 * —`_poses/<juego>-8d/dN-a.png` (reposo, marcha, carga), `dN-b.png` (ataque,
 * daño, muerte) y, si dispara, `dN-c.png` (el disparo)—. Esos PNG no traen anclas: las anclas son cosa del recorte, no
 * del render. Medirlas en el navegador al cargar sería un ancla que nadie
 * compromete ni compara (#120), así que se miden aquí con `derivarAtlas`, la
 * misma regla que mide el arte, y se escriben en `_poses/atlas-8d.json` con el
 * sha256 de cada PNG. `test/personajes.test.ts` vuelve a derivar una dirección y
 * exige el mismo JSON.
 *
 * **La muerte no se eleva.** `derivarAtlas` sube 64 px el ancla de la muerte
 * porque las hojas PINTADAS se empaquetan con esa fila subida en su celda; el
 * render crudo la tiene donde la pone el maniquí, y con la elevación el cadáver
 * del Y Bot se hundiría 64 px en el suelo.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp, { type Sharp } from 'sharp';
import {
  type ClipDeFigura,
  esHojaOpcional,
  FIGURA,
  FILAS_DEL_ATLAS,
  HOJAS_DE_FIGURA,
  type HojaDeFigura,
  hojasDeFigura,
  NOMBRES_DE_DIRECCION,
  primeraFilaDe,
} from '../../src/shared/arte.js';
import {
  carpetaDeManiqui,
  carpetaDePoses,
  clipDeDisparoDe,
  columnaDeSuelta,
  DIR_POSES,
  type FilaDePose,
  fpsATiempoReal,
  type JuegoEn8d,
  OCHO_DIRECCIONES,
} from '../art/poses.js';
import { ajustesDe, aplicarAjustes } from './ajustes.js';
import { type AtlasDerivado, derivarAtlas, type Ritmo, type RitmoDeUnidad } from './derivar.js';
import { EN_OCHO_DIRECCIONES, JUEGOS_EN_8D, unidad } from './unidades.js';

const RAIZ = resolve(import.meta.dirname, '../..');
/** Donde se juntan las hojas de cada dirección para medirlas: no se versiona. */
const DIR_JUNTAS = join(RAIZ, '.cache/taller/poses-8d');
export const RUTA_DEL_ATLAS_8D = join(DIR_POSES, 'atlas-8d.json');

interface HojaDePoses {
  readonly imagen: string;
  readonly sha256: string;
}

/**
 * Una dirección del Y Bot: sus hojas con su sha256 y el atlas medido, de 6
 * filas o de 7 con el disparo. Las filas se reparten como `HOJAS_DE_FIGURA`.
 */
export interface DireccionDePoses extends Omit<AtlasDerivado, 'imagen' | 'sha256' | 'derivadoPor'> {
  readonly hojas: {
    readonly a: HojaDePoses;
    readonly b: HojaDePoses;
    /** Solo quien dispara. */
    readonly c?: HojaDePoses;
  };
}

/**
 * La hoja de 6 o 7 filas que se mide, en la caché: el visor del taller la enseña.
 * La de un juego, por su nombre; la del maniquí propio de una unidad, por su id.
 */
export const rutaJunta = (juegoOUnidad: string, d: number): string =>
  join(DIR_JUNTAS, `${juegoOUnidad}-d${d}.png`);

export const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

/** Una hoja de una dirección, leída: cuál es, de dónde sale y sus bytes. */
export interface HojaLeida {
  readonly hoja: HojaDeFigura;
  readonly ruta: string;
  readonly png: Buffer;
}

/**
 * Apila las hojas de una dirección en una imagen de 6 o 7 filas, cada una en
 * las filas que le da `HOJAS_DE_FIGURA`. La celda sale del ancho (las columnas
 * de FIGURA). Comprueba que cada hoja tiene las filas de la suya: una C de tres
 * filas, o una B de una, se juntaría en un atlas con las filas corridas. Lo
 * comparten el Y Bot y el trabajador (`juntar.ts`), con el mismo mensaje. Una hoja con
 * su encuadre a mano (`hoja-b.ajustes.json`, `ajustes.ts`) entra con él puesto.
 */
export async function apilarHojas(leidas: readonly HojaLeida[]): Promise<Sharp> {
  const hojas = await Promise.all(
    leidas.map(async (h) => {
      const ajustes = ajustesDe(h.ruta, h.hoja, sha256(h.png));
      return ajustes === null ? h : { ...h, png: await aplicarAjustes(h.png, h.hoja, ajustes) };
    }),
  );
  const medidas = await Promise.all(hojas.map(({ png }) => sharp(png).metadata()));
  const ancho = medidas[0]?.width as number;
  const celda = ancho / FIGURA.columnas;
  let filasDelAtlas = 0;
  const capas = hojas.map(({ hoja, ruta, png }, i) => {
    const filas = HOJAS_DE_FIGURA[hoja].length;
    const alto = medidas[i]?.height;
    if (alto !== filas * celda) {
      throw new Error(
        `${ruta} mide ${alto} de alto: la hoja ${hoja.toUpperCase()} son ${filas} ${filas === 1 ? 'fila' : 'filas'} de ${celda}`,
      );
    }
    const desde = primeraFilaDe(hoja);
    filasDelAtlas = Math.max(filasDelAtlas, desde + filas);
    return { input: png, left: 0, top: desde * celda };
  });
  return sharp({
    create: {
      width: ancho,
      height: filasDelAtlas * celda,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(capas);
}

/** Las hojas de la dirección `d` de una carpeta de poses: la A y la B, y la C si dispara. */
async function hojasDeLaDireccion(
  carpeta: string,
  d: number,
  dispara: boolean,
): Promise<HojaLeida[]> {
  return Promise.all(
    hojasDeFigura(dispara).map(async (hoja) => {
      const ruta = join(carpeta, `d${d}-${hoja}.png`);
      if (!existsSync(ruta)) {
        const deQuien = esHojaOpcional(hoja)
          ? `: quien dispara lleva la hoja ${hoja.toUpperCase()} (${HOJAS_DE_FIGURA[hoja].join(', ')})`
          : '';
        throw new Error(`falta ${ruta}${deQuien}`);
      }
      return { hoja, ruta, png: await readFile(ruta) };
    }),
  );
}

/**
 * Junta las hojas de la dirección `d` de un juego, las mide y lo devuelve.
 * `suelta`: la de `sueltaDe` para ese juego, si ya se calculó (al derivar las 8
 * direcciones se calcula una vez); si no, se calcula aquí. Con `maniqui`, las
 * del maniquí propio de esa unidad (`carpetaDeManiqui`), que es de ese juego.
 */
export async function derivarDireccionDePoses(
  juego: JuegoEn8d,
  d: number,
  suelta?: number | null,
  maniqui?: string,
): Promise<DireccionDePoses> {
  const origen = maniqui === undefined ? carpetaDePoses(juego) : carpetaDeManiqui(maniqui);
  const laSuelta = suelta === undefined ? await sueltaDe(origen, juego) : suelta;
  const hojas = await hojasDeLaDireccion(origen, d, laSuelta !== null);
  await mkdir(DIR_JUNTAS, { recursive: true });
  const ruta = rutaJunta(maniqui ?? juego, d);
  await (await apilarHojas(hojas)).png().toFile(ruta);
  const {
    imagen: _i,
    sha256: _s,
    derivadoPor: _p,
    ...atlas
  } = await derivarAtlas(ruta, {
    elevacionDeLaMuerte: 0,
    // El maniquí de una unidad se ve a su ritmo y con sus clips enteros, como se verá pintada.
    ...(maniqui === undefined ? {} : conRitmo(ritmoDeUnidad(maniqui))),
    ...(maniqui === undefined ? {} : conEnteros(maniqui)),
    ...(laSuelta === null ? {} : { suelta: laSuelta }),
  });
  const deLasHojas: Partial<Record<HojaDeFigura, HojaDePoses>> = {};
  for (const { hoja, png } of hojas)
    deLasHojas[hoja] = { imagen: `d${d}-${hoja}.png`, sha256: sha256(png) };
  return { hojas: deLasHojas as DireccionDePoses['hojas'], ...atlas };
}

/**
 * La columna de suelta del disparo de un juego, como la da el render de la
 * carpeta `carpeta` (la del juego o la del maniquí de una unidad): los
 * fotogramas del clip salen del `poses.json` que escribió, no de suponer el
 * reloj. `null` si el juego no dispara. Es el único cálculo de la suelta: lo
 * usan el Y Bot, el trabajador al juntar un atlas pintado y sus tests.
 */
export async function sueltaDe(carpeta: string, juego: JuegoEn8d): Promise<number | null> {
  const clip = clipDeDisparoDe(juego);
  if (clip === null) return null;
  const ruta = join(carpeta, 'poses.json');
  const poses = JSON.parse(await readFile(ruta, 'utf8')) as {
    sourceMetadata?: { shoot?: { frame_count?: unknown } };
  };
  const fotogramas = poses.sourceMetadata?.shoot?.frame_count;
  if (typeof fotogramas !== 'number') {
    throw new Error(
      `${ruta} no dice cuántos fotogramas tiene el disparo (sourceMetadata.shoot): vuelve a renderizar sus poses`,
    );
  }
  return columnaDeSuelta(clip, fotogramas, FIGURA.columnas);
}

/** El juego del Y Bot de una unidad de `EN_OCHO_DIRECCIONES`; lanza con las demás. */
export function juegoEn8dDe(id: string): JuegoEn8d {
  const juego = EN_OCHO_DIRECCIONES[id];
  if (juego === undefined) throw new Error(`${id} no está en 8 direcciones (EN_OCHO_DIRECCIONES)`);
  return juego;
}

/**
 * La suelta del disparo de una unidad de `EN_OCHO_DIRECCIONES`: la de su
 * maniquí propio, si lo tiene, o la de su juego de armas. Sus hojas se pintan
 * sobre esas poses, así que sueltan donde suelta el maniquí. `null` si no dispara.
 */
export async function sueltaDeUnidad(id: string): Promise<number | null> {
  const juego = juegoEn8dDe(id);
  const carpeta = unidad(id).maniqui === undefined ? carpetaDePoses(juego) : carpetaDeManiqui(id);
  return sueltaDe(carpeta, juego);
}

/**
 * Los fps de los clips de una unidad que no van al reloj de todos, o `null`.
 * Con `tiempoReal`, los de cada fila de las poses sobre las que se pinta (su
 * maniquí o las de su juego: `poses.json`), a la velocidad de su clip
 * (`fpsATiempoReal`), y los de `fps` por encima.
 */
export function ritmoDeUnidad(id: string): Ritmo | null {
  const { maniqui, clipsDelManiqui } = unidad(id);
  // Quien elige sus clips va al tiempo de Mixamo (decisión del usuario, 10-10-2026).
  const ritmo: RitmoDeUnidad | undefined =
    unidad(id).ritmo ?? (clipsDelManiqui === undefined ? undefined : { tiempoReal: true });
  if (ritmo === undefined) return null;
  if (!('tiempoReal' in ritmo)) return ritmo;
  const carpeta = maniqui === undefined ? carpetaDePoses(juegoEn8dDe(id)) : carpetaDeManiqui(id);
  const poses = JSON.parse(readFileSync(join(carpeta, 'poses.json'), 'utf8')) as {
    readonly sheets: Record<string, readonly (FilaDePose & { readonly indices: number[] })[]>;
    readonly sourceMetadata: Record<string, { readonly frame_count: number }>;
  };
  const deMixamo: Partial<Record<ClipDeFigura, number>> = {};
  for (const f of Object.values(poses.sheets).flat()) {
    const meta = poses.sourceMetadata[f.clip];
    if (meta === undefined)
      throw new Error(`${carpeta}/poses.json: «${f.clip}» sin sourceMetadata`);
    deMixamo[f.clip] = fpsATiempoReal(f, meta.frame_count, OCHO_DIRECCIONES.fps);
  }
  return { ...deMixamo, ...ritmo.fps };
}

const conRitmo = (ritmo: Ritmo | null): { readonly ritmo?: Ritmo } =>
  ritmo === null ? {} : { ritmo };

/**
 * Los clips de una unidad que se derivan sin recortar: todos si elige sus clips
 * (las siete columnas son el tiempo de su clip; decisión del usuario, 10-10-2026).
 */
const conEnteros = (id: string): { readonly enteros?: readonly ClipDeFigura[] } => {
  const u = unidad(id);
  return u.clipsDelManiqui === undefined ? {} : { enteros: FILAS_DEL_ATLAS };
};

/**
 * Con qué se deriva el atlas de una unidad: la suelta de su maniquí, si dispara,
 * su ritmo, si lo declara (`ritmoDeUnidad`), y sus clips de ida y vuelta,
 * enteros. Lo leen juntar, `pnpm taller derivar` y el test que vuelve a derivar
 * cada atlas: una sola cuenta.
 */
export async function derivacionDeUnidad(id: string): Promise<{
  readonly suelta?: number;
  readonly ritmo?: Ritmo;
  readonly enteros?: readonly ClipDeFigura[];
}> {
  const suelta = await sueltaDeUnidad(id);
  return {
    ...(suelta === null ? {} : { suelta }),
    ...conRitmo(ritmoDeUnidad(id)),
    ...conEnteros(id),
  };
}

export interface AtlasDePoses {
  readonly _comment: string;
  readonly derivadoPor: 'tools/taller/poses-8d.ts';
  /** Por juego de armas, sus 8 direcciones en el orden de `NOMBRES_DE_DIRECCION`. */
  readonly juegos: Readonly<Record<string, readonly DireccionDePoses[]>>;
}

/**
 * Cuántas direcciones se derivan a la vez: cada una tiene su imagen junta de
 * 7×384 de ancho en memoria, y con las 8 de golpe en 11 juegos sobra con 4.
 */
const DIRECCIONES_A_LA_VEZ = 4;

/** Mide las 8 direcciones de cada juego con poses y escribe `atlas-8d.json`. */
export async function escribirAtlasDePoses(): Promise<AtlasDePoses> {
  const juegos: Record<string, DireccionDePoses[]> = {};
  const n = NOMBRES_DE_DIRECCION.length;
  for (const juego of JUEGOS_EN_8D) {
    const suelta = await sueltaDe(carpetaDePoses(juego), juego);
    const ultima = hojasDeFigura(suelta !== null).at(-1);
    if (!existsSync(join(carpetaDePoses(juego), `d${n - 1}-${ultima}.png`))) {
      throw new Error(
        `el juego «${juego}» no tiene sus ${n} direcciones en ${carpetaDePoses(juego)}`,
      );
    }
    const dirs: DireccionDePoses[] = [];
    for (let desde = 0; desde < n; desde += DIRECCIONES_A_LA_VEZ) {
      const tanda = Array.from(
        { length: Math.min(DIRECCIONES_A_LA_VEZ, n - desde) },
        (_, i) => desde + i,
      );
      dirs.push(
        ...(await Promise.all(tanda.map((d) => derivarDireccionDePoses(juego, d, suelta)))),
      );
    }
    juegos[juego] = dirs;
  }
  const atlas: AtlasDePoses = {
    _comment:
      'Derivado de los PNG de _poses/<juego>-8d con `pnpm taller derivar-poses`: no se edita a mano. Lo lee el cliente (render/personajes.ts).',
    derivadoPor: 'tools/taller/poses-8d.ts',
    juegos,
  };
  await writeFile(RUTA_DEL_ATLAS_8D, `${JSON.stringify(atlas, null, 2)}\n`);
  return atlas;
}

/**
 * La hoja A (la del reposo) de la misma dirección y del mismo tipo que una hoja
 * de pose: `d3-b.png` → `d3-a.png`, `d3-c.profundidad.png` → `d3-a.profundidad.png`.
 * Las hojas B y C se escalan contra el reposo de su A; con la de profundidad, la
 * cuenta vieja (`-[bc].png`) no casaba y las medía contra su ataque.
 */
export const hojaDelReposo = (ruta: string): string =>
  ruta.replace(/-[bc]((?:\.[a-z]+)?)\.png$/, '-a$1.png');
