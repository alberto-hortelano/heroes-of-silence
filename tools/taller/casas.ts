/**
 * Las CASAS sueltas de la labranza (`labranza.ts`): casas pequeñas que salpican
 * los campos como un caserío. No hay arte de casas sueltas y no se encarga
 * (2026-10-20, fuera de alcance): se recortan de la hoja de pueblos
 * (`assets/mapa/modulos/pueblos/<k>.webp`), donde cada pueblo es un grupo de
 * casas, pozo, huerto y a veces molino o iglesia.
 *
 * **Las casas no son islas.** Se esperaba recortarlas por las islas del alfa,
 * pero en los ocho pueblos las casas, las matas, el molino y la iglesia se tocan
 * con píxeles opacos (el alfa es casi binario: subir el umbral no separa nada,
 * y erosionar hasta 9 px tampoco): las únicas islas sueltas son pozos y huertos
 * (vista del 20-10-2026). Así que cada pueblo se PARTE desde semillas puestas a
 * mano: unos puntos sobre cada casa elegida y otros sobre lo demás (molino,
 * iglesia, pozo, huerto, matas, las casas que no valen), y cada píxel opaco va a
 * la semilla más cercana andando por lo opaco (`particion`). La línea entre dos
 * cosas que se tocan cae a medio camino, en la mata o el alero que las une.
 *
 * Qué es casa no se adivina por tamaño —un pozo y una casa pequeña miden lo
 * mismo, y el huerto lleva cerca como la casa—: lo dice la tabla
 * (`CASAS_DE_LOS_PUEBLOS`), mirada con `--vista`. Solo casas enteras, de las de
 * delante: la que otra tapa en parte saldría mordida. La tabla guarda el sha256
 * de cada pueblo mirado: si el arte cambia, la orden lanza y hay que mirarlas
 * otra vez.
 *
 *   pnpm taller derivar-casas --vista   .cache/taller/casas-de-los-pueblos.png: cada casa teñida y numerada
 *   pnpm taller derivar-casas           assets/mapa/modulos/casas/<n>.webp, casas.json y su procedencia
 *   pnpm taller catalogo-escena         y el catálogo que lee el juego
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { derivarPieza } from './derivar.js';
import { ALFA_FIGURA } from './empaquetar.js';
import type { Modulo } from './escenario/modulos.js';
import { sha256 } from './poses-8d.js';
import { aRaster, type Raster } from './recorte.js';

const RAIZ = resolve(import.meta.dirname, '../..');
const MODULOS = join(RAIZ, 'assets/mapa/modulos');

/** Puntos de la imagen de un pueblo, en sus píxeles. */
export type Semillas = readonly (readonly [number, number])[];

/** Un pueblo con sus casas elegidas y las semillas de lo que no es casa. */
export interface CasasDeUnPueblo {
  readonly pueblo: number;
  /** El del `pueblos/<k>.webp` que se miró. */
  readonly sha256: string;
  /** Una lista de semillas por casa elegida, en el orden en que se numeran. */
  readonly casas: readonly Semillas[];
  /** Lo que no es una casa elegida: se lleva sus píxeles y no sale. */
  readonly resto: Semillas;
}

/** El día en que se miraron las casas (`--vista`): va en la procedencia. */
const CASAS_MIRADAS_EL = '2026-10-20';

/**
 * Las casas de cada pueblo, mirando `--vista` y cada recorte (2026-10-20). Fuera
 * la iglesia, el molino, el pozo, el huerto y las matas sueltas; y de las 24
 * casas que se probaron, las 11 que salían mordidas o con un trozo de la vecina
 * pegado (un alero, la cerca del huerto, el tejado de la de detrás): sus
 * semillas siguen en `resto`, para que sus píxeles no vayan a las elegidas.
 * Quedan 13.
 *
 * Y en QA (20-10-2026, H2) cuatro de ellas aún llevaban un trozo de otra cosa
 * (2: la parra del árbol de la izquierda y la cumbrera roja de la casa de
 * delante; 3: la pared y el barril de la de detrás; 7: una cuña de la pared de
 * la de detrás; 11: la cerca con parra), y mirando las trece al doble salían
 * otras tres puntas de árbol (4, 5 y 9): una semilla de `resto` sobre cada trozo.
 * Las dos semillas de la parra de la 2 se llevaban la puerta de la 1, que
 * lleva ahora tres semillas más en su lado derecho. La copa que asoma sobre el
 * hastial izquierdo de la 6 se queda: sin ella, el hastial salía cortado en
 * recto (tapado por el árbol en el pueblo, no hay hastial que enseñar).
 *
 * Y en la re-verificación de QA (20-10-2026), la 11 y la 12, mirando cada una
 * al cuádruple junto a su pueblo: la 11 perdía el remate del alero derecho (lo
 * ganaba la cerca de detrás) y la cumbrera de la izquierda (el pozo); la 12, el
 * hastial izquierdo entero, porque dos semillas de `resto` caían en él y en el
 * seto, que salía con el borde de arriba y el de la izquierda rectos. Ahora el
 * alero, la cumbrera, el hastial y el seto llevan semillas de su casa, y el
 * pozo, la cerca, la torre del molino y el tejado del pozo de la 12, las suyas
 * de `resto` junto a ellos.
 */
// biome-ignore format: una casa por línea, sus semillas juntas
export const CASAS_DE_LOS_PUEBLOS: readonly CasasDeUnPueblo[] = [
  {
    pueblo: 1,
    sha256: '6feb972855c8170b1aff38f2787a6aa48f6318fa16bd194266264cb86eefb6e9',
    casas: [
      [[125, 50], [85, 110], [150, 120], [60, 135], [125, 15], [190, 140], [192, 130], [185, 165]],
      [[270, 100], [300, 140], [250, 150], [310, 165], [270, 70]],
    ],
    resto: [[210, 110], [212, 130], [292, 194], [285, 192], [350, 168], [345, 180], [280, 225], [250, 270], [300, 280], [322, 175], [335, 250], [215, 80], [175, 215], [60, 220]],
  },
  {
    pueblo: 2,
    sha256: 'ae717e6087efd45ed64e2212e0ec5d22314a6217cccbea1d9e638d9724fb4963',
    casas: [
      [[75, 230], [40, 270], [90, 270], [60, 300]],
      [[300, 200], [320, 175], [280, 250], [340, 250]],
      [[240, 290], [245, 255], [220, 340], [280, 340]],
    ],
    resto: [[105, 205], [110, 220], [255, 240], [268, 184], [280, 145], [279, 133], [90, 130], [60, 180], [120, 170], [75, 105], [225, 170], [225, 80], [299, 54], [160, 40], [150, 150], [170, 255], [130, 330]],
  },
  {
    pueblo: 3,
    sha256: 'f9faec81699aa70473d49cc05353129d4748e7357ce12636b99c1c4babbc3190',
    casas: [
      [[270, 260], [305, 220], [230, 300], [300, 310]],
    ],
    resto: [[320, 200], [70, 260], [30, 290], [60, 320], [110, 300], [95, 225], [120, 200], [135, 215], [295, 191], [215, 40], [215, 120], [260, 150], [200, 190], [317, 167], [130, 100], [105, 65], [70, 170], [45, 135], [14, 226], [165, 265], [160, 370]],
  },
  {
    pueblo: 4,
    sha256: 'f64f20bb382fb80a0a4bda5e24f4a03056f77fc67ca79c5c8a0bb10e4d00d8a0',
    casas: [
      [[55, 215], [60, 240], [35, 290], [90, 280]],
    ],
    resto: [[100, 200], [105, 205], [330, 240], [365, 215], [300, 290], [355, 300], [100, 140], [85, 120], [60, 190], [150, 180], [105, 310], [125, 265], [275, 220], [300, 215], [200, 130], [230, 40], [150, 60], [260, 140], [290, 150], [285, 120], [330, 150], [270, 210], [210, 260], [215, 220], [140, 300], [150, 340], [80, 350], [255, 345], [231, 321]],
  },
  {
    pueblo: 5,
    sha256: '7ea6557b21d482f190c4c102ab7ae82c148422dd2b93d31ef618387718e38dcc',
    casas: [
      [[70, 265], [40, 300], [100, 300]],
      [[300, 215], [310, 170], [250, 280], [330, 290]],
    ],
    resto: [[297, 170], [70, 140], [110, 95], [40, 190], [110, 190], [280, 175], [300, 150], [180, 50], [190, 150], [250, 140], [140, 120], [290, 120], [170, 265], [210, 340]],
  },
  {
    pueblo: 6,
    sha256: '9b8016ec2a68dcc069394a2f06f98f595b0c255b783ffd5c53ece67d0c357675',
    casas: [
      [[290, 90], [305, 60], [260, 160], [340, 160]],
      [[230, 250], [245, 210], [200, 290], [270, 290], [212, 205], [268, 238], [280, 249]],
    ],
    resto: [[265, 190], [270, 210], [80, 200], [127, 155], [50, 250], [120, 250], [160, 40], [190, 25], [140, 90], [200, 90], [140, 115], [130, 130], [175, 300], [188, 318], [80, 90], [55, 75], [40, 150], [110, 120], [190, 175], [195, 140], [305, 225], [330, 215], [150, 310], [240, 85], [205, 188], [216, 195], [194, 204], [277, 228], [290, 226], [294, 242]],
  },
  {
    pueblo: 7,
    sha256: '69d6072c707c9c62402df441826b8e39a3cbc03845dcf271d5ad429729372e01',
    casas: [
      [[270, 190], [240, 250], [310, 270], [310, 240], [228, 195], [222, 215], [205, 245]],
    ],
    resto: [[140, 255], [135, 235], [80, 170], [70, 130], [50, 230], [120, 230], [30, 290], [105, 265], [175, 250], [195, 252], [192, 240], [190, 195], [217, 182], [225, 172], [182, 37], [185, 150], [120, 120], [229, 59], [240, 145], [90, 300], [170, 290]],
  },
  {
    pueblo: 8,
    sha256: '0017f43978ba133a334e7b817e0285d79f5f0b431f9f0f3c6813c4f2669d6aaf',
    casas: [
      [[65, 240], [30, 280], [100, 280]],
    ],
    resto: [[70, 140], [40, 190], [100, 180], [310, 190], [340, 165], [290, 240], [350, 250], [260, 270], [265, 250], [240, 330], [310, 320], [125, 150], [140, 120], [275, 175], [180, 40], [200, 140], [160, 190], [275, 124], [295, 140], [180, 270], [120, 350]],
  },
];

const rutaDelPueblo = (k: number) => join(MODULOS, 'pueblos', `${k}.webp`);

/**
 * Las ocho vecinas de la `i` de una imagen de `W` × `H` que caen dentro, de
 * arriba abajo y de izquierda a derecha: el orden en que se reparten los
 * píxeles de la partición, el halo y los trozos.
 */
function* ochoVecinas(i: number, W: number, H: number): Generator<number> {
  const x = i % W;
  const y = (i - x) / W;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx !== 0 || dy !== 0) && nx >= 0 && ny >= 0 && nx < W && ny < H) yield ny * W + nx;
    }
}

/**
 * Parte lo opaco de `r` entre grupos de semillas: cada píxel opaco
 * (`ALFA_FIGURA`) va al grupo de la semilla más cercana andando por lo opaco en
 * ocho vecinas (a igual distancia, el grupo de antes), y el halo (alfa bajo el
 * umbral, no nulo), al de un vecino opaco. -1, lo que no alcanza ninguna
 * semilla: una isla sin semilla no sale. Lanza con una semilla en lo
 * transparente, que no partiría nada.
 */
export function particion(r: Raster, grupos: readonly Semillas[], quien = 'el pueblo'): Int32Array {
  const { width: W, height: H, data } = r;
  const opaco = (i: number) => (data[i * 4 + 3] as number) >= ALFA_FIGURA;
  const grupo = new Int32Array(W * H).fill(-1);
  let cola: number[] = [];
  const fuera = grupos
    .flat()
    .filter(([x, y]) => x < 0 || y < 0 || x >= W || y >= H || !opaco(y * W + x));
  if (fuera.length > 0)
    throw new Error(
      `las semillas ${fuera.map(([x, y]) => `(${x}, ${y})`).join(', ')} de ${quien} caen en lo transparente: muévelas encima de lo que marcan`,
    );
  for (const [g, semillas] of grupos.entries())
    for (const [x, y] of semillas) {
      const i = y * W + x;
      if (grupo[i] === -1) {
        grupo[i] = g;
        cola.push(i);
      }
    }
  while (cola.length > 0) {
    const siguiente: number[] = [];
    for (const i of cola)
      for (const j of ochoVecinas(i, W, H)) {
        if (grupo[j] !== -1 || !opaco(j)) continue;
        grupo[j] = grupo[i] as number;
        siguiente.push(j);
      }
    cola = siguiente;
  }
  // El halo, con el grupo de un vecino opaco: sin él, el borde quedaba serrado.
  const halo = new Int32Array(grupo);
  for (let i = 0; i < W * H; i++) {
    if (grupo[i] !== -1 || (data[i * 4 + 3] as number) === 0) continue;
    for (const j of ochoVecinas(i, W, H))
      if (grupo[j] !== -1) {
        halo[i] = grupo[j] as number;
        break;
      }
  }
  return halo;
}

/** La caja de un grupo de `particion`: `[x0, y0, x1, y1]`, inclusiva. */
export function cajaDelGrupo(
  grupo: Int32Array,
  W: number,
  g: number,
): readonly [number, number, number, number] {
  let x0 = W;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < grupo.length; i++) {
    if (grupo[i] !== g) continue;
    const x = i % W;
    const y = (i - x) / W;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  if (x1 < 0) throw new Error(`el grupo ${g} no se llevó ningún píxel`);
  return [x0, y0, x1, y1];
}

/**
 * Deja en el grupo `g` solo su trozo conexo mayor (ocho vecinas): lo que la
 * partición le da suelto —la punta de una chimenea vecina, un listón de la
 * cerca del huerto— no es de la casa y salía flotando junto a ella.
 */
function soloLoMayor(grupo: Int32Array, W: number, g: number): void {
  const H = grupo.length / W;
  const trozo = new Int32Array(grupo.length).fill(-1);
  const tamaños: number[] = [];
  for (let inicio = 0; inicio < grupo.length; inicio++) {
    if (grupo[inicio] !== g || trozo[inicio] !== -1) continue;
    const id = tamaños.length;
    let n = 0;
    const pila = [inicio];
    trozo[inicio] = id;
    while (pila.length > 0) {
      const i = pila.pop() as number;
      n++;
      for (const j of ochoVecinas(i, W, H))
        if (grupo[j] === g && trozo[j] === -1) {
          trozo[j] = id;
          pila.push(j);
        }
    }
    tamaños.push(n);
  }
  const mayor = tamaños.indexOf(Math.max(...tamaños));
  for (let i = 0; i < grupo.length; i++) if (grupo[i] === g && trozo[i] !== mayor) grupo[i] = -1;
}

/** Cada pueblo de la tabla leído, comprobado y partido: casas `0..n-1`, el resto `n`. */
export async function pueblosPartidos(): Promise<
  { readonly c: CasasDeUnPueblo; readonly r: Raster; readonly grupo: Int32Array }[]
> {
  const todos = [];
  for (const c of CASAS_DE_LOS_PUEBLOS) {
    const bytes = await readFile(rutaDelPueblo(c.pueblo));
    const hoy = sha256(bytes);
    if (hoy !== c.sha256)
      throw new Error(
        `el pueblo ${c.pueblo} cambió desde que se eligieron sus casas (sha256 ${hoy}): vuelve a mirarlas con --vista y rehaz sus semillas`,
      );
    const r = await aRaster(bytes);
    const grupo = particion(r, [...c.casas, c.resto], `el pueblo ${c.pueblo}`);
    for (let g = 0; g < c.casas.length; g++) soloLoMayor(grupo, r.width, g);
    todos.push({ c, r, grupo });
  }
  return todos;
}

/** Los tintes de las casas en la vista, en `[r, g, b]`. */
const TINTES: readonly (readonly [number, number, number])[] = [
  [255, 64, 64],
  [64, 192, 255],
  [255, 224, 64],
  [96, 255, 96],
  [255, 96, 255],
];

/** La vista: cada pueblo con sus casas teñidas y numeradas, y las semillas (blancas: lo que no es casa). */
export async function vistaDeLasCasas(salida: string): Promise<string> {
  const ps = await pueblosPartidos();
  const escala = 1.5;
  const lado = Math.round(440 * escala);
  const capas: OverlayOptions[] = [];
  let n = 0;
  for (const [k, p] of ps.entries()) {
    const left = (k % 4) * lado;
    const top = Math.floor(k / 4) * lado;
    // El pueblo, con cada casa mezclada a medias con su tinte y lo demás oscurecido.
    const datos = Buffer.from(p.r.data);
    const nCasas = p.c.casas.length;
    for (let i = 0; i < p.grupo.length; i++) {
      const g = p.grupo[i] as number;
      if (g === -1) continue;
      if (g >= nCasas) {
        for (let c = 0; c < 3; c++)
          datos[i * 4 + c] = Math.round((datos[i * 4 + c] as number) * 0.35);
        continue;
      }
      const rgb = TINTES[g % TINTES.length] as readonly [number, number, number];
      for (let c = 0; c < 3; c++)
        datos[i * 4 + c] = Math.round(
          (datos[i * 4 + c] as number) * 0.6 + (rgb[c] as number) * 0.4,
        );
    }
    const w = Math.round(p.r.width * escala);
    capas.push({
      input: await sharp(datos, {
        raw: { width: p.r.width, height: p.r.height, channels: 4 },
      })
        .resize({ width: w })
        .png()
        .toBuffer(),
      left: left + 20,
      top: top + 30,
    });
    let marcas = '';
    for (const [g, semillas] of [...p.c.casas, p.c.resto].entries()) {
      for (const [x, y] of semillas)
        marcas += `<circle cx="${20 + x * escala}" cy="${30 + y * escala}" r="3" fill="${g < nCasas ? '#000' : '#fff'}"/>`;
      if (g >= nCasas) continue;
      n++;
      const [x0, y0] = cajaDelGrupo(p.grupo, p.r.width, g);
      marcas += `<text x="${20 + x0 * escala}" y="${30 + y0 * escala + 18}" font-family="sans-serif" font-size="22" font-weight="bold" fill="#fff" stroke="#000" stroke-width="1">${n}</text>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}"><text x="8" y="22" font-family="sans-serif" font-size="20" fill="#fff">pueblo ${p.c.pueblo}</text>${marcas}</svg>`;
    capas.push({ input: Buffer.from(svg), left, top });
  }
  await mkdir(resolve(salida, '..'), { recursive: true });
  await sharp({
    create: {
      width: lado * 4,
      height: lado * 2,
      channels: 4,
      background: '#3c342c',
    },
  })
    .composite(capas)
    .png()
    .toFile(salida);
  return salida;
}

/** Recorta las casas de la tabla a `assets/mapa/modulos/casas/` y escribe su índice y su procedencia. */
export async function escribirCasas(): Promise<string> {
  const ps = await pueblosPartidos();
  const salida = join(MODULOS, 'casas');
  await rm(salida, { recursive: true, force: true });
  await mkdir(salida, { recursive: true });
  const modulos: Modulo[] = [];
  const procedencia = [];
  let n = 0;
  for (const p of ps) {
    for (let g = 0; g < p.c.casas.length; g++) {
      const [x0, y0, x1, y1] = cajaDelGrupo(p.grupo, p.r.width, g);
      const ancho = x1 - x0 + 1;
      const alto = y1 - y0 + 1;
      const data = Buffer.alloc(ancho * alto * 4);
      for (let y = 0; y < alto; y++)
        for (let x = 0; x < ancho; x++) {
          const i = (y0 + y) * p.r.width + (x0 + x);
          if (p.grupo[i] === g) p.r.data.copy(data, (y * ancho + x) * 4, i * 4, i * 4 + 4);
        }
      n++;
      const imagen = `${n}.webp`;
      const ruta = join(salida, imagen);
      await sharp(data, { raw: { width: ancho, height: alto, channels: 4 } })
        .webp({ quality: 90, alphaQuality: 100, effort: 6 })
        .toFile(ruta);
      // Medida sobre lo escrito, como toda pieza: la compresión mueve algún alfa del borde.
      const { sha256: huella, ancla } = await derivarPieza(ruta);
      modulos.push({ imagen, sha256: huella, ancho, alto, ancla });
      procedencia.push({
        imagen,
        pueblo: p.c.pueblo,
        sha256DelPueblo: p.c.sha256,
        casa: g + 1,
        caja: [x0, y0, x1, y1],
      });
    }
  }
  await writeFile(
    join(MODULOS, 'casas.json'),
    `${JSON.stringify({ hoja: 'pueblos', modulos }, null, 2)}\n`,
  );
  await writeFile(
    join(MODULOS, 'casas.procedencia.json'),
    `${JSON.stringify(
      {
        encargo: 'casas',
        tipo: 'derivada',
        fecha: CASAS_MIRADAS_EL,
        herramienta: {
          nombre: 'tools/taller/casas.ts (pnpm taller derivar-casas)',
        },
        nota: 'Recortadas de la hoja de pueblos, partida desde semillas puestas a mano (CASAS_DE_LOS_PUEBLOS); sin arte nuevo.',
        modulos: procedencia,
      },
      null,
      2,
    )}\n`,
  );
  return 'assets/mapa/modulos/casas.json';
}
