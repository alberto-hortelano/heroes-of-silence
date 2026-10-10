/**
 * La revisión del arte de la base (`pnpm taller vista-base knight [carpeta
 * [prefijo]]`, por defecto en `.cache/vista-base/` con el prefijo `vista`): PNG
 * para enseñárselos al usuario y para medir la disposición sobre el cuadro.
 *
 * - `<prefijo>-<f>-tramos.png`: los tramos uno al lado de otro como los pone el juego
 *   (el suelo, lo de encima del pie de cada placa bajado por su pie, o su guía si
 *   falta), con lo que se ve del escenario, la región de cada sitio (rojo), el
 *   umbral de su puerta (punto), el pie medido (magenta) y la raya de la franja
 *   (verde).
 * - `<prefijo>-<f>-mascaras-t<n>.png`: el maestro de un tramo con lo recortado de cada
 *   sitio encendido y lo demás oscurecido.
 * - `<prefijo>-<f>-compuesta.png`: el escenario entero como lo pinta el juego —suelo,
 *   tramos, el primer eslabón de cada sitio en su sitio del cuadro (`alLienzo`) y un
 *   Y Bot civil en cada puerta—, a la mitad.
 * - `<prefijo>-<f>-costura-t<n>.png` y `…-x2.png`: la junta entre el tramo `n` y el
 *   siguiente, ±200 px, los tramos solos a la izquierda y la compuesta a la derecha.
 * - `<prefijo>-<f>-eslabones.png`: cada sitio con su cadena, sobre su placa.
 *
 * Sin un tramo usa su guía, y sin un recorte se salta: la revisión sale aunque
 * falte arte, diciendo qué falta.
 */
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp, { type OverlayOptions, type Sharp } from 'sharp';
import { SITIOS, sitioDe } from '../../src/core/town/sitios.js';
import type { FactionId } from '../../src/core/types.js';
import {
  columnasALaVista,
  disposicionDe,
  filaDelPanorama,
  type IndiceDeLaBase,
  SOLAPE,
  TRAMO,
} from '../../src/shared/base.js';
import {
  ADULTO_EN_EL_CUADRO,
  APARTE,
  dirDeLaBase,
  guiaDelTramo,
  maestroDelTramo,
  placaDelTramo,
  siluetaDelAdulto,
  sitiosDelTramo,
} from './base.js';
import { indiceEscrito, pieDelTramo } from './recorte-base.js';

const RAIZ = resolve(import.meta.dirname, '../..');
/** Dónde van los PNG si no se dice: fuera del repo (`.cache/` no se commitea). */
const POR_DEFECTO = '.cache/vista-base';

/** Lo que se pinta de un tramo (RGBA, solo lo de encima de su pie), o su guía opaca si no está. */
async function tramoOGuia(
  f: FactionId,
  n: number,
  indice: IndiceDeLaBase,
): Promise<{ rgba: Buffer; alto: number; pintada: boolean }> {
  const e = indice.tramos[n - 1];
  const fichero = e ? join(RAIZ, dirDeLaBase(f), e.imagen) : null;
  const leer = async (s: Sharp): Promise<{ rgba: Buffer; alto: number }> => {
    const { data, info } = await s.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { rgba: data, alto: info.height };
  };
  if (fichero !== null && existsSync(fichero))
    return { ...(await leer(sharp(fichero))), pintada: true };
  const guia = join(RAIZ, guiaDelTramo(f, n));
  if (existsSync(guia)) return { ...(await leer(sharp(guia))), pintada: false };
  return {
    ...(await leer(
      sharp({
        create: { width: TRAMO.ancho, height: TRAMO.alto, channels: 3, background: '#3b4250' },
      }),
    )),
    pintada: false,
  };
}

/** Un Y Bot civil de adulto, gris cálido: la vara de medir en la compuesta. */
async function figura(): Promise<{ png: Buffer; ancho: number }> {
  const png = await siluetaDelAdulto(ADULTO_EN_EL_CUADRO, [185, 165, 138]);
  return { png, ancho: (await sharp(png).metadata()).width ?? 0 };
}

export async function vistaBase(
  f: FactionId,
  carpeta = POR_DEFECTO,
  prefijo = 'vista',
): Promise<string> {
  const PREFIJO = prefijo;
  const d = disposicionDe(f);
  const salida = resolve(RAIZ, carpeta);
  await mkdir(salida, { recursive: true });
  const indice = await indiceEscrito(f);
  const dir = join(RAIZ, dirDeLaBase(f));
  const W = TRAMO.ancho;
  const H = TRAMO.alto;
  const hechos: string[] = [];
  const faltan: string[] = [];

  const tramos = await Promise.all(
    Array.from({ length: d.tramos }, (_, i) => tramoOGuia(f, i + 1, indice)),
  );
  // Todo el cuadro como lo pone el juego (`render/base/pintar.ts`): el suelo
  // debajo; cada tramo `PASO` px a la derecha del anterior, bajado lo suyo
  // (`bajar`, por su pie) y con su solape ya fundido (lo hornea el recorte);
  // arriba de cada uno, el cielo del índice. La fila `raya` es la de la franja.
  const bajar = d.bajar.map((b) => Math.round(b));
  const ARRIBA = Math.max(0, -Math.min(...bajar));
  const PASO = W - SOLAPE;
  const ANCHO = PASO * (d.tramos - 1) + W;
  const ALTO = H + ARRIBA;
  /** Un punto de un tramo en el lienzo entero de la revisión. */
  const alLienzo = (tramo: number, [px, fila]: readonly [number, number]) => ({
    x: (tramo - 1) * PASO + px,
    y: fila + ARRIBA + (bajar[tramo - 1] as number),
  });
  const raya = ARRIBA + Math.round(filaDelPanorama(0));
  const plazaRaw = Buffer.alloc(ANCHO * ALTO * 4);
  if (indice.suelo !== null) {
    const { data: suelo, info } = await sharp(join(dir, indice.suelo.imagen))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let y = 0; y < ALTO; y++)
      for (let x = 0; x < ANCHO; x++) {
        const sy = (((y - raya) % info.height) + info.height) % info.height;
        const k = (sy * info.width + (x % info.width)) * 3;
        const o = (y * ANCHO + x) * 4;
        plazaRaw[o] = suelo[k] as number;
        plazaRaw[o + 1] = suelo[k + 1] as number;
        plazaRaw[o + 2] = suelo[k + 2] as number;
        plazaRaw[o + 3] = 255;
      }
  }
  const cielo = indice.cielo ?? [0, 0, 0];
  for (const [i, t] of tramos.entries()) {
    const { y: dy } = alLienzo(i + 1, [0, 0]);
    for (let y = 0; y < Math.min(ALTO, dy); y++)
      for (let x = 0; x < W; x++) {
        const o = (y * ANCHO + i * PASO + x) * 4;
        for (let c = 0; c < 3; c++) plazaRaw[o + c] = cielo[c] as number;
        plazaRaw[o + 3] = 255;
      }
    for (let y = 0; y < t.alto; y++) {
      if (y + dy >= ALTO) break;
      for (let x = 0; x < W; x++) {
        const k = (y * W + x) * 4;
        const a = (t.rgba[k + 3] as number) / 255;
        const o = ((y + dy) * ANCHO + i * PASO + x) * 4;
        for (let c = 0; c < 3; c++)
          plazaRaw[o + c] = Math.round(
            (t.rgba[k + c] as number) * a + (plazaRaw[o + c] as number) * (1 - a),
          );
        plazaRaw[o + 3] = 255;
      }
    }
  }
  const plaza = await sharp(plazaRaw, { raw: { width: ANCHO, height: ALTO, channels: 4 } })
    .png()
    .toBuffer();
  // Qué eslabón de cada sitio se pone encima: ninguno, el primero o el último de su cadena.
  const lienzoEntero = async (eslabon: 'ninguno' | 'primero' | 'ultimo'): Promise<Buffer> => {
    const capas: OverlayOptions[] = [];
    if (eslabon !== 'ninguno') {
      for (const s of SITIOS) {
        const cadena = sitioDe(f, s).cadena;
        const id = (eslabon === 'primero' ? cadena[0] : cadena[cadena.length - 1]) as string;
        const e = indice.edificios[id];
        if (e === undefined) continue;
        const p = alLienzo(e.tramo, e.en);
        capas.push({ input: join(dir, e.imagen), left: p.x, top: p.y });
      }
    }
    return sharp(plaza).composite(capas).png().toBuffer();
  };

  // 1 · los tramos con la disposición medida.
  const pies = await Promise.all(
    tramos.map(async (t, i) => {
      if (!t.pintada) return '';
      const pie = await pieDelTramo(f, i + 1);
      const puntos = Array.from(pie, (p, x) => {
        const q = alLienzo(i + 1, [x, p]);
        return `${q.x},${q.y}`;
      }).join(' ');
      return `<polyline points="${puntos}" fill="none" stroke="#f0f" stroke-width="3"/>`;
    }),
  );
  const marcas = [
    ...Array.from({ length: d.tramos }, (_, i) => {
      const v = columnasALaVista(d, i + 1);
      return `<rect x="${i * PASO + v.desde}" y="2" width="${v.hasta - v.desde}" height="${ALTO - 4}" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="20 12"/><text x="${i * PASO + v.desde + 20}" y="${60 + (i % 2) * 60}" font-size="48" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke" font-family="sans-serif">T${i + 1}${tramos[i]?.pintada ? '' : ' (guía)'}</text>`;
    }),
    ...pies,
    `<line x1="0" y1="${raya}" x2="${ANCHO}" y2="${raya}" stroke="#5f5" stroke-width="4"/>`,
    ...SITIOS.flatMap((s) => {
      const st = d.sitios[s];
      const arriba = alLienzo(st.tramo, [st.region.x0, 0]);
      const puerta = alLienzo(st.tramo, st.umbral.enElCuadro);
      // Los ids de los sitios son [a-z0-9]: no hay nada que escapar en el SVG.
      return [
        `<rect x="${arriba.x}" y="${arriba.y}" width="${st.region.x1 - st.region.x0}" height="${st.region.pie}" fill="none" stroke="#f33" stroke-width="4"/>`,
        `<circle cx="${puerta.x}" cy="${puerta.y}" r="10" fill="#0cf" stroke="#000" stroke-width="3"/>`,
        `<text x="${arriba.x + 12}" y="${arriba.y + st.region.pie - 14}" font-size="36" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke" font-family="sans-serif">${s}</text>`,
      ];
    }),
  ];
  const vistaTramos = join(salida, `${PREFIJO}-${f}-tramos.png`);
  const placasEnteras = await lienzoEntero('ninguno');
  await sharp(
    await sharp(placasEnteras)
      .composite([
        {
          input: Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}">${marcas.join('')}</svg>`,
          ),
        },
      ])
      .png()
      .toBuffer(),
  )
    .resize(Math.round(ANCHO / 4))
    .png()
    .toFile(vistaTramos);
  hechos.push(`${PREFIJO}-${f}-tramos.png`);

  // 2 · las máscaras de cada tramo con maestro.
  for (let n = 1; n <= d.tramos; n++) {
    const maestro = join(RAIZ, `${maestroDelTramo(f, n)}.webp`);
    if (!existsSync(maestro) || tramos[n - 1]?.pintada !== true) continue;
    const capas: OverlayOptions[] = [
      {
        input: {
          create: {
            width: W,
            height: H,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0.6 },
          },
        },
      },
    ];
    const lineas: string[] = [];
    for (const s of sitiosDelTramo(d, n)) {
      const id = sitioDe(f, s).cadena[0] as string;
      const e = indice.edificios[id];
      if (e !== undefined) capas.push({ input: join(dir, e.imagen), left: e.en[0], top: e.en[1] });
      const r = d.sitios[s].region;
      lineas.push(
        `<rect x="${r.x0}" y="0" width="${r.x1 - r.x0}" height="${r.pie}" fill="none" stroke="#ff3030" stroke-width="3"/><text x="${(r.x0 + r.x1) / 2}" y="60" font-size="44" fill="#ff3030" text-anchor="middle" font-family="sans-serif">${s}</text>`,
      );
    }
    capas.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${lineas.join('')}</svg>`,
      ),
    });
    const ruta = join(salida, `${PREFIJO}-${f}-mascaras-t${n}.png`);
    await sharp(
      await sharp(maestro).resize(W, H, { fit: 'fill' }).composite(capas).png().toBuffer(),
    )
      .resize(Math.round(W * 0.7))
      .png()
      .toFile(ruta);
    hechos.push(`${PREFIJO}-${f}-mascaras-t${n}.png`);
  }

  // 3 · la compuesta: lo que se ve del escenario, con un adulto junto a cada puerta.
  const fig = await figura();
  const entera = await lienzoEntero('primero');
  const adultos: OverlayOptions[] = SITIOS.map((s) => {
    const st = d.sitios[s];
    const p = alLienzo(st.tramo, st.umbral.enElCuadro);
    return {
      input: fig.png,
      left: Math.round(p.x - APARTE - fig.ancho / 2),
      top: Math.round(p.y - ADULTO_EN_EL_CUADRO),
    };
  });
  for (const s of SITIOS) {
    const id = sitioDe(f, s).cadena[0] as string;
    if (indice.edificios[id] === undefined) faltan.push(id);
  }
  const conGente = await sharp(entera).composite(adultos).png().toBuffer();
  const fuera = columnasALaVista(d, 1).desde;
  const anchoVisible = Math.round(d.ancho * TRAMO.pxPorPaso);
  const loQueSeVe = (b: Buffer, nombre: string) =>
    sharp(b)
      // Abajo, la última fila, que es el borde de abajo del lienzo del juego (la
      // raya cae en `ARRIBA + filaDelPanorama(0)`): se enseña lo que se ve.
      .extract({ left: fuera, top: 0, width: anchoVisible, height: ALTO })
      .resize(Math.round(anchoVisible / 2))
      .png()
      .toFile(join(salida, nombre));
  await loQueSeVe(conGente, `${PREFIJO}-${f}-compuesta.png`);
  hechos.push(`${PREFIJO}-${f}-compuesta.png`);
  // Y con el último eslabón de cada cadena: la base con todo mejorado.
  const ultima = await sharp(await lienzoEntero('ultimo'))
    .composite(adultos)
    .png()
    .toBuffer();
  await loQueSeVe(ultima, `${PREFIJO}-${f}-compuesta-ultimo.png`);
  hechos.push(`${PREFIJO}-${f}-compuesta-ultimo.png`);

  // 4 · las costuras entre tramos pintados: el solape y 200 px a cada lado; a
  // la izquierda solo los tramos, a la derecha con lo construido y la gente.
  for (let n = 1; n < d.tramos; n++) {
    if (tramos[n - 1]?.pintada !== true || tramos[n]?.pintada !== true) continue;
    const ancho = SOLAPE + 400;
    const corte = { left: n * PASO - 200, top: 0, width: ancho, height: ALTO };
    const solo = await sharp(placasEnteras).extract(corte).png().toBuffer();
    const con = await sharp(conGente).extract(corte).png().toBuffer();
    const par = await sharp({
      create: { width: 2 * ancho + 20, height: ALTO, channels: 4, background: '#111' },
    })
      .composite([
        { input: solo, left: 0, top: 0 },
        { input: con, left: ancho + 20, top: 0 },
      ])
      .png()
      .toBuffer();
    await sharp(par).toFile(join(salida, `${PREFIJO}-${f}-costura-t${n}.png`));
    // A ×2, solo la compuesta y solo la franja de la junta: lo que hay que mirar de cerca.
    await sharp(con)
      .extract({ left: 100, top: 0, width: SOLAPE + 200, height: ALTO })
      .resize((SOLAPE + 200) * 2, ALTO * 2, { kernel: 'nearest' })
      .png()
      .toFile(join(salida, `${PREFIJO}-${f}-costura-t${n}-x2.png`));
    hechos.push(`${PREFIJO}-${f}-costura-t${n}.png`, `${PREFIJO}-${f}-costura-t${n}-x2.png`);
  }

  // 5 · los eslabones de cada sitio sobre su placa.
  const filas: OverlayOptions[] = [];
  let y = 0;
  const alto = 360;
  let anchoMax = 0;
  for (const s of SITIOS) {
    const st = d.sitios[s];
    const ruta = join(RAIZ, `${placaDelTramo(f, st.tramo)}.webp`);
    if (!existsSync(ruta)) continue;
    const placa = await sharp(ruta).resize(W, H, { fit: 'fill' }).png().toBuffer();
    const cadena = sitioDe(f, s).cadena;
    let x = 0;
    for (const id of cadena) {
      const r = st.region;
      const ancho = r.x1 - r.x0;
      const capas: OverlayOptions[] = [];
      const e = indice.edificios[id];
      if (e !== undefined) capas.push({ input: join(dir, e.imagen), left: e.en[0], top: e.en[1] });
      else if (!faltan.includes(id)) faltan.push(id);
      const celda = await sharp(await sharp(placa).composite(capas).png().toBuffer())
        .extract({ left: r.x0, top: 0, width: ancho, height: Math.min(H, r.pie + 20) })
        .resize({ height: alto })
        .png()
        .toBuffer();
      const m = await sharp(celda).metadata();
      filas.push({ input: celda, left: x, top: y });
      filas.push({
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${m.width}" height="40"><text x="8" y="30" font-size="26" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke" font-family="sans-serif">${id}</text></svg>`,
        ),
        left: x,
        top: y,
      });
      x += (m.width ?? 0) + 10;
    }
    anchoMax = Math.max(anchoMax, x);
    y += alto + 10;
  }
  if (filas.length > 0) {
    await sharp({ create: { width: anchoMax, height: y, channels: 4, background: '#1b1d16' } })
      .composite(filas)
      .png()
      .toFile(join(salida, `${PREFIJO}-${f}-eslabones.png`));
    hechos.push(`${PREFIJO}-${f}-eslabones.png`);
  }

  return [
    `vista de la base de ${f} en ${carpeta}/ (bajar por tramo = ${d.bajar.map((b) => b.toFixed(1)).join(', ')} px):`,
    ...hechos.map((h) => `  ${h}`),
    faltan.length === 0 ? '  todo el arte está' : `  faltan ${faltan.length}: ${faltan.join(', ')}`,
  ].join('\n');
}
