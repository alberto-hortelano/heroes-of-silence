/**
 * La detección automática del encuadre (repintado del 30-10-2026, el piquero imperial:
 * «se mueve mucho el personaje, eso se podría ver automáticamente»): por clip, cuánto
 * se mueve el tronco pintado de un fotograma al siguiente más de lo que se mueve el del
 * maniquí. Es lo que mide C1 (`desplazamientosDelTronco`) antes de recolocar; aquí se
 * mide sobre la hoja ya hecha. Lo enseñan `revisar` y el vistazo final del visor, y
 * `elegir` lo usa para desempatar y para avisar.
 */
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { FIGURA } from '../../../src/shared/arte.js';
import { RELOJ } from '../derivar.js';
import { type CeldaRgba, type Salto, saltoDelClip } from '../encuadre.js';
import { aRaster } from '../recorte.js';
import { type HuesosDeHoja, troncoDe } from './maniqui.js';

/** Desde cuántos píxeles un salto del cuerpo se nota jugando (a ojo, en la celda de 384). */
export const UMBRAL_DEL_SALTO = 6;

export type { Salto } from '../encuadre.js';
export { saltoDelClip };

/** Cómo se dice un salto: «el cuerpo salta 14 px en el 5→6». */
export const dichoDelSalto = (s: Salto): string =>
  `el cuerpo salta ${s.px} px en el ${s.de}→${s.a}`;

/**
 * El mayor salto de cada clip de una hoja pintada (`hoja-<h>.webp`, 7 × filas celdas),
 * contra el esqueleto de su maniquí y con la `k` de su procedencia (`deLaPose.k`: los
 * píxeles de la celda pintada por píxel del maniquí). Sin `k` (una hoja de antes), nada.
 */
export async function saltosDeLaHoja(
  hoja: string,
  huesos: HuesosDeHoja,
): Promise<Record<string, Salto | null>> {
  const procedencia = hoja.replace(/\.webp$/, '.procedencia.json');
  const k = existsSync(procedencia)
    ? (JSON.parse(readFileSync(procedencia, 'utf8')) as { deLaPose?: { k?: number } }).deLaPose?.k
    : undefined;
  if (k === undefined) return {};
  const r = await aRaster(await readFile(hoja));
  const lado = r.width / FIGURA.columnas;
  const fuera: Record<string, Salto | null> = {};
  for (const [fila, { clip, celdas: deLaFila }] of huesos.filas.entries()) {
    const celdas: CeldaRgba[] = deLaFila.map((_, col) => {
      const data = new Uint8Array(lado * lado * 4);
      for (let y = 0; y < lado; y++)
        data.set(
          r.data.subarray(
            ((fila * lado + y) * r.width + col * lado) * 4,
            ((fila * lado + y) * r.width + (col + 1) * lado) * 4,
          ),
          y * lado * 4,
        );
      return { data, lado };
    });
    const troncos = deLaFila.map((c) => {
      const [x, y] = troncoDe(c);
      return [k * x, k * y] as const;
    });
    const bucle = (RELOJ as Record<string, { loop: boolean }>)[clip]?.loop === true;
    fuera[clip] = saltoDelClip(celdas, troncos, bucle);
  }
  return fuera;
}

/** Los clips de una hoja que saltan más de `UMBRAL_DEL_SALTO`, dichos. */
export function avisosDelSalto(saltos: Readonly<Record<string, Salto | null>>): string[] {
  return Object.entries(saltos)
    .filter((e): e is [string, Salto] => e[1] !== null && e[1].px > UMBRAL_DEL_SALTO)
    .map(([clip, s]) => `«${clip}»: ${dichoDelSalto(s)}`);
}

/** El mayor salto de toda la hoja, en px (0 si no se pudo medir nada). */
export const mayorSalto = (saltos: Readonly<Record<string, Salto | null>>): number =>
  Math.max(0, ...Object.values(saltos).map((s) => s?.px ?? 0));
