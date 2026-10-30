/**
 * La revisión del maniquí (C2 de `docs/agents/2026-10-30-evaluar-animaciones/`):
 * antes de juzgar lo pintado, que la referencia esté bien. En 7 de 22 casos del
 * visor el usuario culpó al maniquí, y el jurado no lo puede ver, porque juzga lo
 * pintado contra el maniquí dándolo por bueno.
 *
 * Lee el esqueleto de cada hoja (`d<n>-<h>.huesos.json`, que escribe `pnpm taller
 * maniqui <id> --huesos` junto a la hoja) y mide:
 * - `sentidoDeLaMarcha`: si una marcha o una carga anda HACIA ATRÁS. En el mundo,
 *   no en pantalla (en pantalla la carrera daba falsos avisos en d0 y d4): con las
 *   caderas fijas en xz (`lockHipsXZ` de sprite-forge) el que avanza es el suelo, y
 *   el pie de apoyo (el más bajo) va hacia atrás, a −z. Si va a +z, la figura anda
 *   de espaldas: así andaban `walk (2)` y `run (2)` del pack de espada y escudo.
 * - `vaivenDelReposo`: cuánto recorren la cadera y la cabeza en el reposo, en
 *   fracción del alto. `idle_look_around` se movía demasiado para el pintor.
 * - `armaIlegible`: en qué fotogramas el arma no se lee en la hoja de profundidad
 *   (lo que ve el pintor): de punta (escorzo) o detrás del pecho. Solo si se lee en
 *   unos y no en otros: de espaldas el arma va detrás con razón.
 * - `hojasSobreOtroManiqui`: qué hojas pintadas se pintaron sobre otro render del
 *   maniquí que el de hoy (el sha de su pose en la procedencia).
 *
 * Y la compuerta del trabajador, `maniquiBlocker`: un maniquí sin esqueleto, con
 * el esqueleto de otro render o que anda hacia atrás no se manda a pintar.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { HOJAS_DE_FIGURA, NOMBRES_DE_DIRECCION } from '../../../src/shared/arte.js';
import type { Cola } from '../cola.js';
import { type Encargo, esDePose } from '../encargo.js';
import { sha256 } from '../poses-8d.js';
import { aRaster } from '../recorte.js';
import { leerSiHay } from './esquemas.js';
import type { CasoDelVisor } from './vision.js';

/** Un punto del esqueleto: `[x, y, z]`. En píxeles, z es la profundidad de la cámara (menos, más cerca). */
const punto = z.tuple([z.number(), z.number(), z.number()]);

export const celdaDeHuesosSchema = z
  .object({
    fotograma: z.number().int().optional(),
    /** Cada hueso proyectado a píxeles de la celda. */
    huesos: z.record(z.string(), punto),
    /**
     * Cada hueso en el mundo de la figura, en metros: y hacia arriba con el suelo
     * en 0, +z hacia donde mira y la rotación de la dirección deshecha (así el
     * sentido de la marcha se mide igual en las ocho direcciones).
     */
    mundo: z.record(z.string(), punto),
    /** Cada pieza del atrezo por los dos extremos de su eje más largo, en píxeles. */
    atrezo: z.array(z.tuple([punto, punto])),
  })
  .strict();
export type CeldaDeHuesos = z.infer<typeof celdaDeHuesosSchema>;

export const huesosSchema = z
  .object({
    /** El sha256 de la hoja de la que se sacó, en color y en profundidad: el render al que pertenece. */
    hoja: z.object({ png: z.string(), profundidad: z.string().nullable() }).strict(),
    celda: z.number().int().positive(),
    filas: z.array(z.object({ clip: z.string(), celdas: z.array(celdaDeHuesosSchema) }).strict()),
  })
  .strict();
export type HuesosDeHoja = z.infer<typeof huesosSchema>;

/** El esqueleto de la hoja `d<n>-<h>` que está en `carpeta`, validado; `null` si no hay. */
export function leerHuesos(carpeta: string, d: number, h: string): HuesosDeHoja | null {
  return leerSiHay(huesosSchema, join(carpeta, `d${d}-${h}.huesos.json`)) ?? null;
}

/**
 * Si el esqueleto es del render que hay hoy en `carpeta`: el sha de su hoja en
 * color y en profundidad. `null` si casa; si no, el motivo.
 */
export function huesosDeOtroRender(
  carpeta: string,
  d: number,
  h: string,
  huesos: HuesosDeHoja,
): string | null {
  const png = join(carpeta, `d${d}-${h}.png`);
  if (!existsSync(png)) return `no está la hoja ${png}`;
  if (sha256(readFileSync(png)) !== huesos.hoja.png)
    return `el esqueleto de d${d}-${h} es de otro render del maniquí (el sha de d${d}-${h}.png no casa)`;
  const prof = join(carpeta, `d${d}-${h}.profundidad.png`);
  if (
    huesos.hoja.profundidad !== null &&
    existsSync(prof) &&
    sha256(readFileSync(prof)) !== huesos.hoja.profundidad
  )
    return `el esqueleto de d${d}-${h} es de otro render del maniquí (el sha de d${d}-${h}.profundidad.png no casa)`;
  return null;
}

/**
 * La regla «este esqueleto vale», una vez: el de la hoja `d<n>-<h>` de `carpeta`
 * si está y es del render de hoy; si no, el motivo. La leen la revisión del
 * maniquí, la compuerta y el empaquetado (C1).
 */
export function huesosVigentes(
  carpeta: string,
  d: number,
  h: string,
): { readonly huesos: HuesosDeHoja } | { readonly motivo: string } {
  const huesos = leerHuesos(carpeta, d, h);
  if (huesos === null) return { motivo: `no hay esqueleto (d${d}-${h}.huesos.json)` };
  const otro = huesosDeOtroRender(carpeta, d, h, huesos);
  return otro === null ? { huesos } : { motivo: otro };
}

/** Los huesos del tronco: lo que sigue C1 y lo que mide su correlación. */
const HUESOS_DEL_TRONCO = ['LeftUpLeg', 'RightUpLeg', 'LeftArm', 'RightArm'] as const;

/** El tronco de una celda en pantalla: la media de sus dos caderas y sus dos hombros. */
export function troncoDe(c: CeldaDeHuesos): readonly [number, number] {
  const ps = HUESOS_DEL_TRONCO.map((n) => {
    const p = c.huesos[n];
    if (p === undefined) throw new Error(`el esqueleto no trae ${n}`);
    return p;
  });
  return [
    ps.reduce((s, p) => s + p[0], 0) / ps.length,
    ps.reduce((s, p) => s + p[1], 0) / ps.length,
  ];
}

/** El alto de la figura en el mundo: de la coronilla al suelo (que está en 0). */
export function altoEnElMundo(c: CeldaDeHuesos): number {
  const cabeza = c.mundo.HeadTop_End ?? c.mundo.Head;
  if (cabeza === undefined) throw new Error('el esqueleto no trae la cabeza (HeadTop_End)');
  return cabeza[1];
}

/** Lo que se considera ir hacia atrás: el pie de apoyo, sumado, a +z por encima de esto (parte del alto). */
export const UMBRAL_DEL_SENTIDO = 0;
/** Lo que se tolera que se mueva el reposo, en parte del alto. */
export const UMBRAL_DEL_VAIVEN = 0.08;

/**
 * Cuánto avanza el pie de apoyo, sumado a lo largo del clip y en parte del alto:
 * entre dos fotogramas seguidos, el pie que va más bajo en los dos (en el suelo).
 * Negativo: el suelo pasa hacia atrás, la figura anda hacia delante. Positivo:
 * anda de espaldas.
 */
export function sentidoDeLaMarcha(celdas: readonly CeldaDeHuesos[]): number {
  if (celdas.length < 2) return 0;
  let total = 0;
  for (let i = 0; i + 1 < celdas.length; i++) {
    const a = (celdas[i] as CeldaDeHuesos).mundo;
    const b = (celdas[i + 1] as CeldaDeHuesos).mundo;
    for (const [pie, otro] of [
      ['LeftFoot', 'RightFoot'],
      ['RightFoot', 'LeftFoot'],
    ] as const) {
      const pa = a[pie];
      const pb = b[pie];
      const oa = a[otro];
      const ob = b[otro];
      if (pa === undefined || pb === undefined || oa === undefined || ob === undefined) continue;
      if (pa[1] < oa[1] && pb[1] < ob[1]) total += pb[2] - pa[2];
    }
  }
  return total / Math.max(1e-6, altoEnElMundo(celdas[0] as CeldaDeHuesos));
}

/** Los clips de la locomoción: los que pueden andar hacia atrás. */
const MARCHAS = ['walk', 'charge'] as const;

/** La primera marcha o carga de una hoja que anda hacia atrás, con cuánto; o `null`. */
export function marchaHaciaAtras(
  huesos: HuesosDeHoja,
): { readonly clip: string; readonly sentido: number } | null {
  for (const { clip, celdas } of huesos.filas) {
    if (!(MARCHAS as readonly string[]).includes(clip)) continue;
    const sentido = sentidoDeLaMarcha(celdas);
    if (sentido > UMBRAL_DEL_SENTIDO) return { clip, sentido };
  }
  return null;
}

/** Lo que recorren la cadera y la cabeza en el reposo (la diagonal de su caja en el mundo), en parte del alto. */
export function vaivenDelReposo(celdas: readonly CeldaDeHuesos[]): number {
  if (celdas.length === 0) return 0;
  let r = 0;
  for (const n of ['Hips', 'Head']) {
    const ps = celdas.map((c) => c.mundo[n]).filter((p) => p !== undefined);
    if (ps.length === 0) continue;
    const rango = (q: 0 | 1 | 2) =>
      Math.max(...ps.map((p) => p[q])) - Math.min(...ps.map((p) => p[q]));
    r = Math.max(r, Math.hypot(rango(0), rango(1), rango(2)));
  }
  return r / Math.max(1e-6, altoEnElMundo(celdas[0] as CeldaDeHuesos));
}

/** Por qué no se lee el arma en un fotograma. */
export type ArmaQueNoSeLee = { readonly fotograma: number; readonly motivo: 'escorzo' | 'tapada' };

/**
 * En qué fotogramas el arma no se lee en la referencia (numerados desde 1). Dos
 * maneras de perderla: `escorzo`, apunta a la cámara y en pantalla mide menos de la
 * mitad de lo que mide en el fotograma del clip en que más se ve; `tapada`, más de
 * la mitad de su eje cae dentro de la silueta y por detrás del pecho (su
 * profundidad mayor que la de `Spine2`). `alfa(col, x, y)` lee el alfa de la hoja
 * de profundidad en la celda `col`.
 *
 * Pieza a pieza del atrezo (por su orden en la celda) y solo las largas, de 0,6 del
 * largo de la mayor o más: el arma, no la aljaba que va siempre a la espalda. Y de
 * cada pieza solo avisa si se lee en unos fotogramas y en otros no (al menos dos
 * buenos): de espaldas va detrás con razón.
 */
export function armaIlegible(
  celdas: readonly CeldaDeHuesos[],
  alfa: (col: number, x: number, y: number) => number,
): ArmaQueNoSeLee[] {
  const largo = ([a, b]: CeldaDeHuesos['atrezo'][number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const piezas = Math.max(0, ...celdas.map((c) => c.atrezo.length));
  const mayorDe = (p: number) =>
    Math.max(0, ...celdas.map((c) => (c.atrezo[p] === undefined ? 0 : largo(c.atrezo[p]))));
  const mayor = Math.max(0, ...Array.from({ length: piezas }, (_, p) => mayorDe(p)));
  if (mayor < 20) return [];
  const malos = new Map<number, ArmaQueNoSeLee>();
  for (let p = 0; p < piezas; p++) {
    const maximo = mayorDe(p);
    if (maximo < 0.6 * mayor) continue;
    const deLaPieza: ArmaQueNoSeLee[] = [];
    for (const [i, c] of celdas.entries()) {
      const eje = c.atrezo[p];
      if (eje === undefined) continue;
      if (largo(eje) < 0.5 * maximo) {
        deLaPieza.push({ fotograma: i + 1, motivo: 'escorzo' });
        continue;
      }
      const pecho = c.huesos.Spine2?.[2];
      if (pecho === undefined) continue;
      const [a, b] = eje;
      const n = Math.floor(largo(eje)) + 1;
      let detras = 0;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = a[0] + t * (b[0] - a[0]);
        const y = a[1] + t * (b[1] - a[1]);
        const z = a[2] + t * (b[2] - a[2]);
        if (alfa(i, Math.floor(x), Math.floor(y)) >= 40 && z > pecho) detras++;
      }
      if (detras / (n + 1) > 0.5) deLaPieza.push({ fotograma: i + 1, motivo: 'tapada' });
    }
    if (deLaPieza.length > 0 && deLaPieza.length <= celdas.length - 2)
      for (const m of deLaPieza) if (!malos.has(m.fotograma)) malos.set(m.fotograma, m);
  }
  // Y el clip entero, no solo cada pieza: unidas, tampoco pueden ser todas (QA, H6).
  return malos.size <= celdas.length - 2
    ? [...malos.values()].sort((x, y) => x.fotograma - y.fotograma)
    : [];
}

/**
 * Los clips donde se mira si el arma se lee: todos menos el disparo, donde el arma
 * de tiro va delante del cuerpo y el atrezo de la mano no cuenta (QA, H6).
 */
export const seMiraElArma = (clip: string): boolean => clip !== 'shoot';

export interface AvisoDelManiqui {
  readonly direccion: number;
  readonly clip: string;
  readonly tipo: 'sentido' | 'vaiven' | 'arma';
  readonly texto: string;
}

/**
 * El alfa de una hoja PNG, decodificada una vez: para cada fila, quien lo lee celda
 * a celda (`armaIlegible`).
 */
export async function alfaDeLaHoja(
  ruta: string,
  lado: number,
): Promise<(fila: number) => (col: number, x: number, y: number) => number> {
  const { data, width } = await aRaster(await readFile(ruta));
  return (fila) => (col, x, y) =>
    x < 0 || y < 0 || x >= lado || y >= lado
      ? 0
      : (data[((fila * lado + y) * width + col * lado + x) * 4 + 3] as number);
}

/**
 * Las tres medidas de un maniquí en sus ocho direcciones, con su aviso cuando pasa
 * de lo tolerable. `carpeta`: la de sus hojas (`_poses/unidades/<id>-8d/`). Lanza si
 * a una hoja le falta el esqueleto o es de otro render.
 */
export async function revisarElManiqui(carpeta: string): Promise<{
  readonly avisos: AvisoDelManiqui[];
  readonly medidas: { direccion: number; clip: string; sentido?: number; vaiven?: number }[];
}> {
  const avisos: AvisoDelManiqui[] = [];
  const medidas: { direccion: number; clip: string; sentido?: number; vaiven?: number }[] = [];
  for (let d = 0; d < NOMBRES_DE_DIRECCION.length; d++) {
    for (const h of Object.keys(HOJAS_DE_FIGURA)) {
      if (!existsSync(join(carpeta, `d${d}-${h}.png`))) continue;
      const vigentes = huesosVigentes(carpeta, d, h);
      if ('motivo' in vigentes) throw new Error(`${carpeta}: ${vigentes.motivo}`);
      const { huesos } = vigentes;
      const prof = join(carpeta, `d${d}-${h}.profundidad.png`);
      const alfaDe = await alfaDeLaHoja(
        existsSync(prof) ? prof : join(carpeta, `d${d}-${h}.png`),
        huesos.celda,
      );
      for (const [fila, { clip, celdas }] of huesos.filas.entries()) {
        if ((MARCHAS as readonly string[]).includes(clip)) {
          const s = sentidoDeLaMarcha(celdas);
          medidas.push({ direccion: d, clip, sentido: s });
          if (s > UMBRAL_DEL_SENTIDO)
            avisos.push({
              direccion: d,
              clip,
              tipo: 'sentido',
              texto: `d${d} «${clip}» anda hacia atrás: el pie de apoyo avanza ${s.toFixed(3)} del alto hacia donde mira`,
            });
        }
        if (clip === 'idle') {
          const v = vaivenDelReposo(celdas);
          medidas.push({ direccion: d, clip, vaiven: v });
          if (v > UMBRAL_DEL_VAIVEN)
            avisos.push({
              direccion: d,
              clip,
              tipo: 'vaiven',
              texto: `d${d} «idle»: el reposo se mueve ${v.toFixed(2)} del alto (se tolera ${UMBRAL_DEL_VAIVEN})`,
            });
        }
        const malos = seMiraElArma(clip) ? armaIlegible(celdas, alfaDe(fila)) : [];
        if (malos.length > 0)
          avisos.push({
            direccion: d,
            clip,
            tipo: 'arma',
            texto: `d${d} «${clip}»: el arma no se lee en la referencia en ${malos.map((m) => `${m.fotograma} (${m.motivo === 'escorzo' ? 'de punta' : 'detrás del cuerpo'})`).join(', ')}`,
          });
      }
    }
  }
  return { avisos, medidas };
}

/**
 * Las hojas pintadas de una figura (`assets/unidades/<id>/` o `assets/npcs/<id>/`)
 * que se pintaron sobre otro render del maniquí que el de hoy: el sha de su
 * referencia de pose en la procedencia frente al del fichero. Son las que hay que
 * volver a pintar cuando el maniquí cambia. Con su motivo.
 */
export function hojasSobreOtroManiqui(
  raiz: string,
  carpetaDelArte: string,
): { readonly hoja: string; readonly motivo: string }[] {
  const fuera: { hoja: string; motivo: string }[] = [];
  const base = join(raiz, carpetaDelArte);
  for (const dir of readdirSync(base)
    .filter((n) => /^d[0-7]$/.test(n))
    .sort()) {
    for (const f of readdirSync(join(base, dir))
      .filter((n) => /^hoja-[a-c]\.procedencia\.json$/.test(n))
      .sort()) {
      const proc = JSON.parse(readFileSync(join(base, dir, f), 'utf8')) as {
        pose?: string;
        shaDeLaPose?: string;
        referencias?: { ruta: string; papel: string; sha256: string }[];
      };
      const h = f.slice(5, 6);
      // La pose de una edición o de una versión con el esqueleto no es su primera
      // referencia: la apunta `pose`, con su sha en `shaDeLaPose`.
      const ref =
        proc.pose === undefined
          ? proc.referencias?.find((r) => esDePose(r.papel))
          : proc.shaDeLaPose === undefined
            ? proc.referencias?.find((r) => r.ruta === proc.pose)
            : { ruta: proc.pose, sha256: proc.shaDeLaPose };
      const hoja = `${dir}-${h}`;
      if (ref === undefined) {
        fuera.push({ hoja, motivo: 'su procedencia no dice sobre qué maniquí se pintó' });
        continue;
      }
      const ruta = join(raiz, ref.ruta);
      if (!existsSync(ruta)) fuera.push({ hoja, motivo: `ya no está su maniquí, ${ref.ruta}` });
      else if (sha256(readFileSync(ruta)) !== ref.sha256)
        fuera.push({ hoja, motivo: `su maniquí cambió desde que se pintó (${ref.ruta})` });
    }
  }
  return fuera;
}

/** La hoja del maniquí de un encargo de atlas: la que apunta `ocho.pose`, o su referencia de pose. */
export function poseDelEncargo(e: Encargo): string | undefined {
  return e.ocho?.pose ?? e.referencias.find((r) => esDePose(r.papel))?.ruta;
}

/** La carpeta y el nombre de una hoja de pose (`…/d3-a.profundidad.png` → `…`, 3, `a`). */
export function hojaDePose(ruta: string): { carpeta: string; d: number; h: string } | null {
  const m = /^(.*)\/d([0-7])-([a-c])(?:\.[a-z]+)?\.png$/.exec(ruta);
  return m === null ? null : { carpeta: m[1] as string, d: Number(m[2]), h: m[3] as string };
}

/**
 * La compuerta del maniquí: por qué no se manda a pintar un atlas de 8
 * direcciones con marcha o carga, o `null`. Tres motivos, con la orden que lo
 * arregla: sin esqueleto, con el esqueleto de otro render, o que anda hacia atrás.
 * Los montados (`montado-*`) quedan fuera: su Y Bot de juego no tiene maniquí
 * propio ni esqueleto (fuera de alcance de la revisión del 30-10-2026).
 */
export function maniquiBlocker(e: Encargo, raiz: string): string | null {
  if (e.tipo !== 'atlas' || e.ocho === undefined) return null;
  const clips = HOJAS_DE_FIGURA[e.ocho.hoja] as readonly string[];
  if (!MARCHAS.some((c) => clips.includes(c))) return null;
  const ruta = poseDelEncargo(e);
  if (ruta === undefined) return null;
  const hoja = hojaDePose(ruta);
  if (hoja === null) return null;
  if (/\/montado-[^/]*$/.test(hoja.carpeta)) return null;
  const carpeta = join(raiz, hoja.carpeta);
  const civil = hoja.carpeta.endsWith('/civil-8d');
  const id = /\/([^/]+)-8d$/.exec(hoja.carpeta)?.[1] ?? hoja.carpeta;
  const orden = civil
    ? 'pnpm taller maniqui --civil --huesos'
    : `pnpm taller maniqui ${id} --huesos`;
  const vigentes = huesosVigentes(carpeta, hoja.d, hoja.h);
  if ('motivo' in vigentes)
    return leerHuesos(carpeta, hoja.d, hoja.h) === null
      ? `el maniquí de ${e.id} no tiene esqueleto (${hoja.carpeta}/d${hoja.d}-${hoja.h}.huesos.json), y sin él no se sabe si anda hacia atrás: hazlo con «${orden}»`
      : `${vigentes.motivo}: vuelve a sacarlo con «${orden}»`;
  const atras = marchaHaciaAtras(vigentes.huesos);
  return atras === null
    ? null
    : `el maniquí de ${e.id} anda hacia atrás en d${hoja.d} «${atras.clip}» (el pie de apoyo avanza ${atras.sentido.toFixed(3)} del alto hacia donde mira): el arreglo va en el maniquí (\`tools/taller/unidades.ts\` o \`tools/art/poses.ts\`), no en el pintor`;
}

/**
 * La compuerta en la cola: si el maniquí de un encargo ya tomado no vale
 * (`maniquiBlocker`), lo cierra en `fallido/` con el motivo y lo devuelve; si vale,
 * `null` y el trabajador lo pinta. Antes de Codex: no se gasta una pintura en un
 * maniquí que anda hacia atrás.
 */
export async function rechazarSiElManiquiFalla(
  cola: Cola,
  e: Encargo,
  raiz: string,
): Promise<string | null> {
  const motivo = maniquiBlocker(e, raiz);
  if (motivo !== null)
    await cola.cerrar(e.id, 'fallido', { cuando: new Date().toISOString(), motivo });
  return motivo;
}

/** Las direcciones que enseña el visor del maniquí: de tres cuartos, de lado y de espaldas. */
export const DIRECCIONES_DEL_VISOR_DEL_MANIQUI = [
  NOMBRES_DE_DIRECCION.indexOf('frente-derecha'),
  NOMBRES_DE_DIRECCION.indexOf('derecha'),
  NOMBRES_DE_DIRECCION.indexOf('espalda'),
] as const;

/** Lo que puede contestar la persona de un clip del maniquí. */
export const OPCIONES_DEL_MANIQUI = [
  'vale',
  'anda hacia atrás',
  'se mueve demasiado',
  'no da el golpe / no se entiende',
  'el arma se pierde',
  'otro (en la nota)',
] as const;

/**
 * Los casos del visor del maniquí (QA, H4; lo que hacía `casos_maniqui.py` en los
 * experimentos, §6): por clip, el maniquí de la unidad animado a la velocidad del
 * juego de tres cuartos, de lado y de espaldas, con los avisos de
 * `revisarElManiqui` de esas direcciones. Lo que el jurado no puede ver porque
 * juzga lo pintado dando el maniquí por bueno.
 */
export async function casosDelManiqui(
  f: { readonly id: string; readonly arte: string; readonly maniqui: string },
  raiz: string,
  fps: Readonly<Record<string, number>>,
): Promise<CasoDelVisor[]> {
  const carpeta = join(raiz, f.maniqui);
  const { avisos } = await revisarElManiqui(carpeta);
  const casos: CasoDelVisor[] = [];
  for (const [letra, clips] of Object.entries(HOJAS_DE_FIGURA)) {
    if (!existsSync(join(carpeta, `d0-${letra}.png`))) continue;
    for (const clip of clips as readonly string[]) {
      const suyos = avisos.filter(
        (a) =>
          a.clip === clip &&
          (DIRECCIONES_DEL_VISOR_DEL_MANIQUI as readonly number[]).includes(a.direccion),
      );
      casos.push({
        id: `maniqui-${clip}`,
        titulo: `El maniquí · ${f.id} «${clip}»`,
        texto: `${suyos.length === 0 ? 'La revisión automática no avisa de nada.' : `La revisión automática avisa: ${suyos.map((a) => a.texto).join('; ')}.`} ¿Vale como referencia para pintar este clip?`,
        opciones: OPCIONES_DEL_MANIQUI,
        animaciones: DIRECCIONES_DEL_VISOR_DEL_MANIQUI.map((d) => ({
          rotulo: NOMBRES_DE_DIRECCION[d] as string,
          unidad: f.id,
          direccion: d,
          carpetaDelArte: f.arte,
          maniqui: f.maniqui,
          filasDeHoja: HOJAS_DE_FIGURA,
          clip,
          letra,
          de: 'solo-maniqui' as const,
          fps: fps[clip] ?? 8,
        })),
      });
    }
  }
  return casos;
}
