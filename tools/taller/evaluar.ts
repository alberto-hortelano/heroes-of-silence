/**
 * El evaluador de las hojas de 8 direcciones: compara cada figura pintada con la
 * del maniquí que tenía que copiar y puntúa cuánto se separa. No acepta nada —la
 * aceptación es del usuario—: marca qué celdas mirar.
 *
 *   pnpm taller evaluar templario-mandoble
 *
 * La silueta del maniquí se lleva al atlas con la misma transformación con la
 * que el taller colocó la figura (`deLaPose` en la procedencia de cada hoja), y
 * se miden dos cosas:
 *  - **faltan**: la parte del maniquí que no cubre la figura pintada, dilatada un
 *    poco. Es la idea del usuario: el maniquí en blanco, se le quita lo que
 *    coincide con la imagen y cuanto menos queda, mejor. Caza una espada que
 *    desaparece, un brazo que no está o una pierna en otro sitio.
 *  - **sobran**: la parte de la figura pintada lejos del maniquí. Caza saltos,
 *    encogimientos y figuras desplazadas. La dilatación del maniquí es mayor para
 *    tolerar el volumen de la armadura y la capa.
 *
 * Lo que NO ve: una figura girada de espaldas tiene casi la misma silueta. Para
 * eso están las piernas de color del maniquí.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { FIGURA, NOMBRES_DE_DIRECCION } from '../../src/shared/arte.js';
import type { AtlasDerivado } from './derivar.js';
import { apoyoEn } from './empaquetar.js';

const RAIZ = resolve(import.meta.dirname, '../..');

/** Píxeles de holgura de la figura pintada al medir lo que falta. */
export const HOLGURA_FALTAN = 3;
/** Píxeles de holgura del maniquí al medir lo que sobra: la armadura abulta. */
export const HOLGURA_SOBRAN = 10;
/**
 * Cuándo se marca una fila para revisarla. Dos formas de fallar, medidas sobre
 * «faltan»:
 *  - **nivel**: la mediana de la fila. Alta en todos los fotogramas es la figura
 *    entera desviada (girada, en otra postura).
 *  - **pico**: el peor fotograma menos la mediana. Un fotograma que se encoge o
 *    pierde la espada.
 * Calibrado el 03-10-2026 con el templario del mandoble contra la lista de
 * fallos del usuario: ve «se gira», «se encoge» y una espada que desaparece en
 * una carga; no ve una espada fina que falta en el daño, una pierna levantada ni
 * una marcha con pasos repetidos. Es un aviso de revisión, no una aceptación.
 */
export const UMBRAL = { nivel: 0.12, pico: 0.07 } as const;

/**
 * Píxeles del AZUL guía del maniquí (su pierna izquierda) a partir de los cuales
 * una celda avisa: el pintor a veces lo copia en una pierna. Ningún templario
 * lleva azul, así que se busca sin ambigüedad; el rojo de la otra pierna no,
 * porque se confunde con las cruces. Medido el 03-10-2026: las tres fugas que se
 * vieron daban 36 a 90 y ninguna celda limpia pasa de 0.
 */
export const UMBRAL_AZUL = 25;

/** Si un píxel opaco es del azul guía del maniquí. */
export function esAzulGuia(r: number, g: number, b: number): boolean {
  return b > 110 && b - r > 45 && b - g > 15;
}

/** Una máscara binaria de `lado`×`lado`. */
export type Mascara = Uint8Array;

/** Dilata una máscara con un cuadrado de radio `r` (dos pasadas separables). */
export function dilatar(m: Mascara, lado: number, r: number): Mascara {
  if (r <= 0) return m;
  const h = new Uint8Array(m.length);
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      let v = 0;
      for (let dx = -r; dx <= r && v === 0; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < lado && m[y * lado + xx]) v = 1;
      }
      h[y * lado + x] = v;
    }
  }
  const out = new Uint8Array(m.length);
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      let v = 0;
      for (let dy = -r; dy <= r && v === 0; dy++) {
        const yy = y + dy;
        if (yy >= 0 && yy < lado && h[yy * lado + x]) v = 1;
      }
      out[y * lado + x] = v;
    }
  }
  return out;
}

/** Cuánto se separa la figura pintada del maniquí, de 0 (igual) a 1. */
export function puntuar(
  maniqui: Mascara,
  pintada: Mascara,
  lado: number,
): { faltan: number; sobran: number } {
  const pintadaAncha = dilatar(pintada, lado, HOLGURA_FALTAN);
  const maniquiAncho = dilatar(maniqui, lado, HOLGURA_SOBRAN);
  let nM = 0;
  let faltan = 0;
  let nP = 0;
  let sobran = 0;
  for (let i = 0; i < maniqui.length; i++) {
    if (maniqui[i]) {
      nM++;
      if (!pintadaAncha[i]) faltan++;
    }
    if (pintada[i]) {
      nP++;
      if (!maniquiAncho[i]) sobran++;
    }
  }
  return { faltan: nM === 0 ? 1 : faltan / nM, sobran: nP === 0 ? 1 : sobran / nP };
}

interface DeLaPose {
  readonly posicion?: boolean;
  readonly k: number;
  readonly origen: readonly [number, number];
  readonly apoyoReposo: readonly [number, number];
  readonly elevaciones?: readonly number[];
}

async function alfa(ruta: string): Promise<{ data: Buffer; ancho: number }> {
  const { data, info } = await sharp(ruta)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, ancho: info.width };
}

function apoyoDe(
  img: { data: Buffer; ancho: number },
  fila: number,
  col: number,
  lado: number,
  umbral: number,
): [number, number] {
  const a = (x: number, y: number) =>
    img.data[((fila * lado + y) * img.ancho + col * lado + x) * 4 + 3] as number;
  let x0 = lado;
  let y0 = lado;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < lado; y++)
    for (let x = 0; x < lado; x++)
      if (a(x, y) >= umbral) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
  return apoyoEn(a, [x0, y0, x1, y1], umbral);
}

/** El alto del maniquí en el reposo de su dirección (primera celda de la hoja A). */
async function altoDelReposo(rutaPose: string, lado: number): Promise<number> {
  const a = await alfa(rutaPose.replace(/-b\.png$/, '-a.png'));
  let y0 = lado;
  let y1 = -1;
  for (let y = 0; y < lado; y++)
    for (let x = 0; x < lado; x++)
      if ((a.data[(y * a.ancho + x) * 4 + 3] as number) >= 40) {
        if (y < y0) y0 = y;
        y1 = y;
      }
  return y1 - y0 + 1;
}

export interface Celda {
  readonly direccion: number;
  readonly clip: string;
  readonly fotograma: number;
  readonly faltan: number;
  readonly sobran: number;
  /** Cuánto cambia del fotograma anterior al este (fracción de píxeles), pintada y maniquí. */
  readonly cambioPintada: number;
  readonly cambioManiqui: number;
  /** Píxeles del azul guía del maniquí copiados en la figura (`esAzulGuia`). */
  readonly azul: number;
}

/** La fracción de píxeles que cambian entre dos máscaras, sobre los que tienen alguna. */
function cambio(a: Mascara, b: Mascara): number {
  let union = 0;
  let distintos = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] || b[i]) {
      union++;
      if (a[i] !== b[i]) distintos++;
    }
  }
  return union === 0 ? 0 : distintos / union;
}

/** Puntúa las 42 celdas de una dirección de una unidad. */
export async function evaluarDireccion(id: string, d: number): Promise<Celda[]> {
  const dir = join(RAIZ, 'assets/unidades', id, `d${d}`);
  const atlasJson = JSON.parse(await readFile(join(dir, 'atlas.json'), 'utf8')) as AtlasDerivado;
  const lado = atlasJson.cell;
  const atlas = await alfa(join(dir, 'atlas.webp'));
  const fuera: Celda[] = [];
  for (const [h, hoja] of (['a', 'b'] as const).entries()) {
    const proc = JSON.parse(await readFile(join(dir, `hoja-${hoja}.procedencia.json`), 'utf8'));
    const rutaPose = join(RAIZ, proc.referencias[0].ruta as string);
    if (!existsSync(rutaPose)) throw new Error(`no encuentro la pose ${rutaPose}`);
    const pose = await alfa(rutaPose);
    // Las hojas empaquetadas antes de que la pose mandara en la posición no
    // apuntan la transformación: cada celda se alinea por su propio apoyo, como
    // se colocó, con la escala del reposo.
    const apuntada = proc.deLaPose as DeLaPose | undefined;
    // Sin `posicion` (las primeras hojas) la posición también la puso la pose.
    const fija = apuntada !== undefined && apuntada.posicion !== false ? apuntada : undefined;
    const k = apuntada?.k ?? atlasJson.altura / (await altoDelReposo(rutaPose, lado));
    for (let fila = 0; fila < 3; fila++) {
      const filaAtlas = h * 3 + fila;
      let previa: { maniqui: Mascara; pintada: Mascara } | null = null;
      const clip = Object.entries(atlasJson.clips).find(([, c]) => c.row === filaAtlas)?.[0] ?? '?';
      for (let col = 0; col < FIGURA.columnas; col++) {
        const t: DeLaPose = fija ?? {
          k,
          origen: apoyoDe(atlas, filaAtlas, col, lado, 64),
          apoyoReposo: apoyoDe(pose, fila, col, lado, 40),
        };
        const maniqui = new Uint8Array(lado * lado);
        const pintada = new Uint8Array(lado * lado);
        let azul = 0;
        for (let y = 0; y < lado; y++) {
          for (let x = 0; x < lado; x++) {
            const i = ((filaAtlas * lado + y) * atlas.ancho + col * lado + x) * 4;
            const a = atlas.data[i + 3];
            pintada[y * lado + x] = (a as number) >= 64 ? 1 : 0;
            if (
              (a as number) >= 128 &&
              esAzulGuia(
                atlas.data[i] as number,
                atlas.data[i + 1] as number,
                atlas.data[i + 2] as number,
              )
            )
              azul++;
            // El píxel del maniquí que cae aquí: la transformación inversa.
            const px = Math.round(t.apoyoReposo[0] + (x - t.origen[0]) / t.k);
            const oy = t.origen[1] - (t.elevaciones?.[fila] ?? 0);
            const py = Math.round(t.apoyoReposo[1] + (y - oy) / t.k);
            if (px < 0 || py < 0 || px >= lado || py >= lado) continue;
            const b = pose.data[((fila * lado + py) * pose.ancho + col * lado + px) * 4 + 3];
            maniqui[y * lado + x] = (b as number) >= 40 ? 1 : 0;
          }
        }
        fuera.push({
          direccion: d,
          clip,
          fotograma: col,
          ...puntuar(maniqui, pintada, lado),
          cambioPintada: previa === null ? 0 : cambio(previa.pintada, pintada),
          cambioManiqui: previa === null ? 0 : cambio(previa.maniqui, maniqui),
          azul,
        });
        previa = { maniqui, pintada };
      }
    }
  }
  return fuera;
}

export interface Fila {
  readonly direccion: number;
  readonly nombre: string;
  readonly clip: string;
  readonly nivel: number;
  readonly pico: number;
  /** El fotograma peor de la fila. */
  readonly peor: number;
  /** Los fotogramas con el azul guía del maniquí copiado (`UMBRAL_AZUL`), desde 0. */
  readonly conAzul: readonly number[];
  readonly marcada: boolean;
}

function mediana(v: readonly number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] as number;
}

/** Las 48 filas de una unidad, con su peor celda y si pasan del umbral. */
export async function evaluar(id: string): Promise<{ filas: Fila[]; celdas: Celda[] }> {
  const celdas: Celda[] = [];
  for (let d = 0; d < 8; d++) celdas.push(...(await evaluarDireccion(id, d)));
  const filas: Fila[] = [];
  for (let d = 0; d < 8; d++) {
    for (const clip of ['idle', 'walk', 'charge', 'attack', 'hurt', 'death']) {
      const de = celdas.filter((c) => c.direccion === d && c.clip === clip);
      const faltan = de.map((c) => c.faltan);
      const nivel = mediana(faltan);
      const pico = Math.max(...faltan) - nivel;
      const conAzul = de.filter((c) => c.azul > UMBRAL_AZUL).map((c) => c.fotograma);
      filas.push({
        direccion: d,
        nombre: NOMBRES_DE_DIRECCION[d] as string,
        clip,
        nivel,
        pico,
        peor: faltan.indexOf(Math.max(...faltan)),
        conAzul,
        marcada: nivel > UMBRAL.nivel || pico > UMBRAL.pico || conAzul.length > 0,
      });
    }
  }
  return { filas, celdas };
}
