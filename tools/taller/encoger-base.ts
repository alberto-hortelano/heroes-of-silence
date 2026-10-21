/**
 * Encoge los edificios que Codex pintó grandes (20-10-2026, las bases de no
 * muertos, imperio, elfos y orkos). Codex pide la puerta de 154-166 px y la pinta
 * de 190-250 aunque la guía lleve la vara de medir y el recuadro de cada uno, y
 * con uno o dos edificios por tramo llena el tramo.
 *
 * El maestro de un tramo con encogidos (`ARTE_DE_LA_BASE[f].encoger`) se deriva:
 * - lo que pintó Codex se guarda como `pintado-t<n>.webp`, la primera vez;
 * - cada edificio se recorta de ahí por su diferencia con la placa
 *   (`mascaraDeLaDiferencia`, la misma del recorte) y por su pie;
 * - donde estaba, se pone la placa;
 * - y se pega encima encogido, con su puerta y su pie quietos.
 *
 * Lo que se mide después (puertas, regiones) se mide sobre el maestro encogido, y
 * las ediciones y versiones abiertas lo editan a él.
 */
import { existsSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import type { FactionId } from '../../src/core/types.js';
import { disposicionDe, TRAMO } from '../../src/shared/base.js';
import {
  ARTE_DE_LA_BASE,
  maestroDelTramo,
  pintadoDelTramo,
  placaDelTramo,
  sitiosPintados,
} from './base.js';
import { sha256 } from './poses-8d.js';
import { lineaDelPie, mascaraDeLaDiferencia, mascaraDelPie } from './recorte-base.js';

const RAIZ = resolve(import.meta.dirname, '../..');

async function rgbDe(ruta: string): Promise<Uint8Array> {
  const b = await sharp(join(RAIZ, ruta))
    .removeAlpha()
    .resize(TRAMO.ancho, TRAMO.alto, { fit: 'fill' })
    .raw()
    .toBuffer();
  return new Uint8Array(b.buffer, b.byteOffset, b.length);
}

/** Rehace el maestro del tramo `n` de `f` con sus edificios encogidos. Devuelve lo que escribió. */
export async function encogerElTramo(f: FactionId, n: number): Promise<string> {
  const lista = ARTE_DE_LA_BASE[f].encoger[n];
  if (lista === undefined || lista.length === 0)
    throw new Error(`el tramo ${n} de ${f} no encoge nada (ARTE_DE_LA_BASE.${f}.encoger)`);
  const maestro = `${maestroDelTramo(f, n)}.webp`;
  const pintado = `${pintadoDelTramo(f, n)}.webp`;
  const placa = `${placaDelTramo(f, n)}.webp`;
  if (!existsSync(join(RAIZ, pintado))) {
    if (!existsSync(join(RAIZ, maestro))) throw new Error(`no hay ${maestro} que encoger`);
    await rename(join(RAIZ, maestro), join(RAIZ, pintado));
    const proc = join(RAIZ, `${maestroDelTramo(f, n)}.procedencia.json`);
    if (existsSync(proc)) {
      const pr = JSON.parse(await readFile(proc, 'utf8'));
      await writeFile(
        join(RAIZ, `${pintadoDelTramo(f, n)}.procedencia.json`),
        `${JSON.stringify({ ...pr, salida: { ...pr.salida, ruta: pintado } }, null, 2)}\n`,
      );
    }
  }
  if (!existsSync(join(RAIZ, placa)))
    throw new Error(`no se puede encoger sin la placa: falta ${placa}`);
  const W: number = TRAMO.ancho;
  const H: number = TRAMO.alto;
  const a = await rgbDe(pintado);
  const b = await rgbDe(placa);
  const pie = lineaDelPie(W, H, a);
  const delPie = mascaraDelPie(W, H, pie);
  const capas: OverlayOptions[] = [];
  // Si se encogen todos los edificios del tramo, la base es la placa: lo pintado
  // alrededor no casa píxel a píxel con ella, y el recorte se lo llevaría. Si no,
  // lo pintado, con la placa donde estaba cada encogido (los demás se quedan
  // como los pintó Codex).
  const todos = lista.length === sitiosPintados(f, disposicionDe(f), n).length;
  const base = Uint8Array.from(todos ? b : a);
  for (const e of lista) {
    let suelo = 0;
    for (let x = e.x0; x < e.x1; x++) suelo = Math.max(suelo, pie[x] ?? 0);
    const m = mascaraDeLaDiferencia(W, H, a, b, { x0: e.x0, x1: e.x1, pie: suelo + 4 });
    let x0 = W;
    let x1 = -1;
    let y0 = H;
    let y1 = -1;
    for (let y = 0; y < H; y++)
      for (let x = e.x0; x < e.x1; x++) {
        const i = y * W + x;
        const alfa = Math.round(((m.v[i] ?? 0) * (delPie.v[i] ?? 0)) / 255);
        m.v[i] = alfa;
        if (!todos)
          for (let c = 0; c < 3; c++)
            base[i * 3 + c] = Math.round(
              ((a[i * 3 + c] ?? 0) * (255 - alfa) + (b[i * 3 + c] ?? 0) * alfa) / 255,
            );
        if (alfa > 0) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x + 1);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y + 1);
        }
      }
    if (x1 < 0) throw new Error(`${f} T${n}: entre las columnas ${e.x0} y ${e.x1} no hay edificio`);
    const ancho = x1 - x0;
    const alto = y1 - y0;
    const rgba = Buffer.alloc(ancho * alto * 4);
    for (let y = 0; y < alto; y++)
      for (let x = 0; x < ancho; x++) {
        const i = (y0 + y) * W + x0 + x;
        const o = (y * ancho + x) * 4;
        rgba[o] = a[i * 3] ?? 0;
        rgba[o + 1] = a[i * 3 + 1] ?? 0;
        rgba[o + 2] = a[i * 3 + 2] ?? 0;
        rgba[o + 3] = m.v[i] ?? 0;
      }
    const nuevo = { ancho: Math.round(ancho * e.k), alto: Math.round(alto * e.k) };
    const input = await sharp(rgba, { raw: { width: ancho, height: alto, channels: 4 } })
      .resize(nuevo.ancho, nuevo.alto, { kernel: 'lanczos3' })
      .png()
      .toBuffer();
    capas.push({
      input,
      left: Math.round(e.puerta - (e.puerta - x0) * e.k),
      top: y1 - nuevo.alto,
    });
  }
  await sharp(Buffer.from(base), { raw: { width: W, height: H, channels: 3 } })
    .composite(capas)
    .webp({ quality: 92, effort: 6 })
    .toFile(join(RAIZ, maestro));
  // La procedencia del maestro: la de lo pintado, con la placa y el encogido.
  const deLoPintado = join(RAIZ, `${pintadoDelTramo(f, n)}.procedencia.json`);
  if (!existsSync(deLoPintado))
    throw new Error(
      `falta la procedencia de ${pintado}: sin ella el maestro no dice de dónde sale`,
    );
  const pr = JSON.parse(await readFile(deLoPintado, 'utf8'));
  const encogidos = lista.map((e) => `${e.x0}-${e.x1} ×${e.k} (puerta ${e.puerta})`).join(', ');
  await writeFile(
    join(RAIZ, `${maestroDelTramo(f, n)}.procedencia.json`),
    `${JSON.stringify(
      {
        ...pr,
        referencias: [
          ...pr.referencias,
          { ruta: pintado, papel: 'encoge', sha256: sha256(await readFile(join(RAIZ, pintado))) },
          { ruta: placa, papel: 'placa', sha256: sha256(await readFile(join(RAIZ, placa))) },
        ],
        postproceso: [
          ...(pr.postproceso ?? []),
          `encogido sobre la placa (encoger-base): ${encogidos}`,
        ],
        salida: {
          ...pr.salida,
          ruta: maestro,
          sha256: sha256(await readFile(join(RAIZ, maestro))),
        },
      },
      null,
      2,
    )}\n`,
  );
  return maestro;
}
