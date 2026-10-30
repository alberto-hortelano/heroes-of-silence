/**
 * La corrección de la pose y la coherencia (C6 de
 * `docs/agents/2026-10-30-evaluar-animaciones/`) es una SELECCIÓN, no una receta:
 * ninguna variante gana siempre (experimentos §7: `todo` gana en el caballero, la
 * otra tirada en el elfo, y en el elfo `todo` le llevaba la mano al carcaj). Por
 * hoja se piden varias versiones y entra la que gana a ciegas a la de ahora en los
 * dos órdenes; si ninguna gana, se queda la de ahora. Por hoja entera (decisión del
 * usuario, 30-10-2026): mezclar clips de versiones con escalas distintas haría
 * crecer y menguar la figura de un clip a otro.
 *
 *   pnpm taller versiones <id> <dN> <h>   encola `tirada`, `esqueleto` y `todo`
 *   pnpm taller elegir <id> <dN> <h>      las compara a ciegas con la de ahora (ChatGPT)
 *   pnpm taller adoptar <id> <dN> <h>     la ganadora, si la persona la prefirió en el visor, a `assets/`
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import {
  FIGURA,
  HOJAS_DE_FIGURA,
  type HojaDeFigura,
  NOMBRES_DE_DIRECCION,
} from '../../../src/shared/arte.js';
import { juzgarConCodex } from '../codex.js';
import { RELOJ } from '../derivar.js';
import type { Encargo } from '../encargo.js';
import { alAcabarUnaHoja } from '../juntar.js';
import { sha256 } from '../poses-8d.js';
import { encargosDeOchoDirecciones, unidad } from '../unidades.js';
import { type Comparacion, comparacionSchema, validarCon } from './esquemas.js';
import { casoDeDisputa, OPCIONES_DE_DISPUTA, respuestasDe, type Veredicto } from './jurado.js';
import {
  alfaDeLaHoja,
  armaIlegible,
  hojasSobreOtroManiqui,
  leerHuesos,
  seMiraElArma,
} from './maniqui.js';
import { apuntarHuella, type Figura, juicioVigente, RAIZ } from './revisar.js';
import { type CasoDelVisor, comparacion } from './vision.js';

/** Las versiones que se piden de cada hoja, en el orden en que desempatan. */
export const VARIANTES = ['tirada', 'esqueleto', 'todo'] as const;
export type Variante = (typeof VARIANTES)[number];

/**
 * El aviso de que la postura del giro no cuenta. La fuga de pose del giro es
 * sistemática: otra tirada de lo de siempre volvía a pintar el reposo en guardia
 * abierta (experimentos §7).
 */
export const SIN_POSE_DEL_GIRO =
  'La lámina de giro (imagen 2) enseña al personaje en guardia, con las piernas abiertas y el arma en alto: esa POSTURA NO CUENTA, es solo para ver su aspecto desde cada lado. En cada celda el cuerpo adopta la postura del maniquí (imagen 1): si el maniquí está de pie con los pies juntos, el personaje también; si adelanta una pierna, la misma.';

/**
 * Los colores del muñeco de la referencia `pose-esqueleto`: los que dice su papel
 * (`PAPELES['pose-esqueleto']` en `encargo.ts`) y los de los paneles del jurado
 * (`esqueleto.py`). Izquierda del personaje en azul, derecha en rojo, como las
 * piernas del maniquí.
 */
export const COLORES_DEL_ESQUELETO = {
  tronco: '#ffffff',
  izquierda: '#2878ff',
  derecha: '#ff3232',
  arma: '#ffd200',
} as const;

/** Los segmentos del muñeco y su lado (los de `esqueleto.py`). */
const SEGMENTOS: readonly (readonly [string, string, keyof typeof COLORES_DEL_ESQUELETO])[] = [
  ['Hips', 'Spine2', 'tronco'],
  ['Spine2', 'Neck', 'tronco'],
  ['Neck', 'Head', 'tronco'],
  ['Head', 'HeadTop_End', 'tronco'],
  ['Spine2', 'LeftArm', 'izquierda'],
  ['LeftArm', 'LeftForeArm', 'izquierda'],
  ['LeftForeArm', 'LeftHand', 'izquierda'],
  ['Spine2', 'RightArm', 'derecha'],
  ['RightArm', 'RightForeArm', 'derecha'],
  ['RightForeArm', 'RightHand', 'derecha'],
  ['Hips', 'LeftUpLeg', 'izquierda'],
  ['LeftUpLeg', 'LeftLeg', 'izquierda'],
  ['LeftLeg', 'LeftFoot', 'izquierda'],
  ['LeftFoot', 'LeftToeBase', 'izquierda'],
  ['Hips', 'RightUpLeg', 'derecha'],
  ['RightUpLeg', 'RightLeg', 'derecha'],
  ['RightLeg', 'RightFoot', 'derecha'],
  ['RightFoot', 'RightToeBase', 'derecha'],
];

/** La carpeta de una hoja del maniquí y su nombre. */
const hojaDelManiqui = (f: Figura, d: number, h: string) => join(RAIZ, f.maniqui, `d${d}-${h}`);

/**
 * La referencia `pose-esqueleto`: la hoja del maniquí en profundidad con su
 * esqueleto encima (cada hueso y el eje del arma, en sus colores). Se dibuja con
 * SVG sobre la hoja; el fondo transparente queda transparente.
 */
export async function poseConEsqueleto(
  f: Figura,
  d: number,
  h: string,
  salida: string,
): Promise<void> {
  const huesos = leerHuesos(join(RAIZ, f.maniqui), d, h);
  if (huesos === null)
    throw new Error(
      `el maniquí de ${f.id} no tiene esqueleto en d${d}-${h}: «pnpm taller maniqui ${f.id} --huesos»`,
    );
  const base = `${hojaDelManiqui(f, d, h)}.profundidad.png`;
  const meta = await sharp(base).metadata();
  const lado = huesos.celda;
  const trazos: string[] = [];
  for (const [fila, { celdas }] of huesos.filas.entries())
    for (const [col, c] of celdas.entries()) {
      const p = (q: readonly number[]) =>
        `${(q[0] as number) + col * lado},${(q[1] as number) + fila * lado}`;
      for (const [a, b, lado2] of SEGMENTOS) {
        const pa = c.huesos[a];
        const pb = c.huesos[b];
        if (pa === undefined || pb === undefined) continue;
        trazos.push(
          `<polyline points="${p(pa)} ${p(pb)}" stroke="${COLORES_DEL_ESQUELETO[lado2]}"/>`,
        );
      }
      for (const [a, b] of c.atrezo)
        trazos.push(`<polyline points="${p(a)} ${p(b)}" stroke="${COLORES_DEL_ESQUELETO.arma}"/>`);
    }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}"><g fill="none" stroke-width="3" stroke-linecap="round">${trazos.join('')}</g></svg>`;
  await mkdir(dirname(salida), { recursive: true });
  await sharp(base)
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toFile(salida);
}

/** Las carpetas de las versiones de una hoja. */
export const rutaDeVersion = (f: Figura, d: number, h: string, v: Variante): string =>
  `${f.revision}/d${d}/versiones/${v}/hoja-${h}`;
const rutaDeLaPoseConEsqueleto = (f: Figura, d: number, h: string): string =>
  `${f.revision}/d${d}/versiones/pose-esqueleto-${h}.png`;

function bloqueDeInstrucciones(texto: string): string {
  return `CORRECCIONES QUE PIDE LA REVISIÓN de la versión anterior de esta hoja (numeradas por fila y por columna, de 1 a ${FIGURA.columnas}). Cúmplelas sin romper lo demás:\n${texto.trim()}`;
}

/**
 * Lo que se le dice al pintor del arma que no se lee en la referencia: en esas
 * celdas el maniquí la lleva de punta o detrás del cuerpo, y el pintor la inventaba
 * o la quitaba (experimentos §5).
 */
export async function notasDelArma(f: Figura, d: number, h: string): Promise<string | null> {
  const huesos = leerHuesos(join(RAIZ, f.maniqui), d, h);
  if (huesos === null) return null;
  const prof = `${hojaDelManiqui(f, d, h)}.profundidad.png`;
  const alfaDe = await alfaDeLaHoja(prof, huesos.celda);
  const lineas: string[] = [];
  for (const [fila, { clip, celdas }] of huesos.filas.entries()) {
    const malos = seMiraElArma(clip) ? armaIlegible(celdas, alfaDe(fila)) : [];
    if (malos.length > 0)
      lineas.push(
        `- Fila ${fila + 1} (${clip}), columna(s) ${malos.map((m) => m.fotograma).join(', ')}: en la referencia el arma se ve ${malos.every((m) => m.motivo === 'escorzo') ? 'de punta' : 'poco o detrás del cuerpo'}. El personaje la sigue llevando en la misma mano: píntala donde la llevaría en ese gesto, entre como va en la columna de antes y en la de después; no la quites ni pintes otra.`,
      );
  }
  return lineas.length === 0 ? null : `NOTAS DEL ARMA:\n${lineas.join('\n')}`;
}

/**
 * Las tres versiones de una hoja: la otra tirada (el mismo encargo), `esqueleto`
 * (sobre la pose con el esqueleto encima, con el maniquí de siempre para escalar,
 * `ocho.pose`) y `todo` (lo de `esqueleto`, más el aviso del giro, las
 * instrucciones del jurado y las notas del arma). Salen fuera de `assets/`.
 */
export function encargosDeVersiones(
  base: Encargo,
  f: Figura,
  d: number,
  h: string,
  extra: { readonly instrucciones?: string | null; readonly notasDelArma?: string | null },
): Encargo[] {
  const [pose, ...resto] = base.referencias;
  if (pose === undefined || base.ocho === undefined)
    throw new Error(`${base.id} no es una hoja con pose`);
  const id = (v: Variante) => `${f.id}-v-${v}-d${d}-${h}`;
  const conEsqueleto = (v: Variante, descripcion: string): Encargo => ({
    ...base,
    id: id(v),
    salida: rutaDeVersion(f, d, h, v),
    descripcion,
    referencias: [{ ruta: rutaDeLaPoseConEsqueleto(f, d, h), papel: 'pose-esqueleto' }, ...resto],
    ocho: { ...base.ocho, pose: pose.ruta } as NonNullable<Encargo['ocho']>,
  });
  return [
    { ...base, id: id('tirada'), salida: rutaDeVersion(f, d, h, 'tirada') },
    conEsqueleto('esqueleto', base.descripcion),
    conEsqueleto(
      'todo',
      [
        base.descripcion,
        SIN_POSE_DEL_GIRO,
        ...(extra.instrucciones ? [bloqueDeInstrucciones(extra.instrucciones)] : []),
        ...(extra.notasDelArma ? [extra.notasDelArma] : []),
      ].join('\n'),
    ),
  ];
}

/** El encargo de siempre de una hoja de una unidad. */
export function encargoDeLaHoja(f: Figura, d: number, h: string): Encargo {
  const e = encargosDeOchoDirecciones(unidad(f.id)).find((x) => x.id === `${f.id}-d${d}-${h}`);
  if (e === undefined) throw new Error(`no hay encargo ${f.id}-d${d}-${h}`);
  return e;
}

/** `versiones`: dibuja la pose con el esqueleto y devuelve los tres encargos, listos para encolar. */
export async function prepararVersiones(f: Figura, d: number, h: string): Promise<Encargo[]> {
  await poseConEsqueleto(f, d, h, join(RAIZ, rutaDeLaPoseConEsqueleto(f, d, h)));
  const rutaInstr = join(RAIZ, f.revision, `d${d}`, `instrucciones-${h}.txt`);
  const hoja = join(RAIZ, f.arte, `d${d}`, `hoja-${h}.webp`);
  // Las instrucciones de una hoja que ya no es la de ahora no valen (QA, H2).
  const vigentes =
    existsSync(rutaInstr) &&
    (!existsSync(hoja) || statSync(rutaInstr).mtimeMs >= statSync(hoja).mtimeMs);
  if (existsSync(rutaInstr) && !vigentes)
    console.log(
      `  ! ${rutaInstr} es de antes de la hoja de ahora: no entra en «todo» (revísala y cruza otra vez para tener instrucciones)`,
    );
  const instrucciones = vigentes ? await readFile(rutaInstr, 'utf8') : null;
  return encargosDeVersiones(encargoDeLaHoja(f, d, h), f, d, h, {
    instrucciones,
    notasDelArma: await notasDelArma(f, d, h),
  });
}

/** Lo que dice una pareja de comparaciones de un clip: gana, pierde o no coincide. */
export type Resultado = 'gana' | 'pierde' | 'no_coincide';
export interface ResultadoDeClip {
  readonly clip: string;
  readonly resultado: Resultado;
  /** Lo seguro que estaba el juez en las dos, si coinciden. */
  readonly confianza: number;
}

/**
 * Una versión frente a la de ahora en un clip, de sus dos comparaciones: en la
 * primera A es la de ahora y B la versión; en la segunda, al revés. Solo cuenta lo
 * que se dice igual en los dos órdenes.
 */
export function resultadoDelClip(
  clip: string,
  primera: Comparacion,
  segunda: Comparacion,
): ResultadoDeClip {
  const confianza = primera.confianza + segunda.confianza;
  if (primera.mejor === 'B' && segunda.mejor === 'A') return { clip, resultado: 'gana', confianza };
  if (primera.mejor === 'A' && segunda.mejor === 'B')
    return { clip, resultado: 'pierde', confianza };
  return { clip, resultado: 'no_coincide', confianza: 0 };
}

export interface Eleccion {
  readonly ganadora: string | null;
  readonly motivo: string;
  readonly cuentas: Readonly<
    Record<string, { gana: number; pierde: number; noCoincide: number; confianza: number }>
  >;
  /**
   * `torneo` cuando la hoja de ahora se pintó sobre otro maniquí y no vale como
   * referencia: las versiones se comparan entre sí. Sin él, contra la de ahora.
   */
  readonly modo?: 'contra-la-de-ahora' | 'torneo';
  /** En un torneo, las dos que ve la persona en el visor (la ganadora primero, si la hay). */
  readonly finalistas?: readonly string[];
}

/**
 * La que entra: vale la versión que gana algún clip sin perder ninguno; entre
 * varias, la que más gana, luego la de más confianza en lo que gana y, si siguen
 * empatadas, la primera de `orden`. Si no vale ninguna, `null`: se queda la de
 * ahora.
 */
export function elegirVersion(
  porVersion: Readonly<Record<string, readonly ResultadoDeClip[]>>,
  orden: readonly string[] = Object.keys(porVersion),
): Eleccion {
  const cuentas: Record<
    string,
    { gana: number; pierde: number; noCoincide: number; confianza: number }
  > = {};
  for (const [v, rs] of Object.entries(porVersion))
    cuentas[v] = {
      gana: rs.filter((r) => r.resultado === 'gana').length,
      pierde: rs.filter((r) => r.resultado === 'pierde').length,
      noCoincide: rs.filter((r) => r.resultado === 'no_coincide').length,
      confianza: rs.filter((r) => r.resultado === 'gana').reduce((s, r) => s + r.confianza, 0),
    };
  const validas = orden.filter((v) => (cuentas[v]?.gana ?? 0) > 0 && cuentas[v]?.pierde === 0);
  const dicho = (v: string) => {
    const c = cuentas[v] as { gana: number; pierde: number; noCoincide: number };
    return `${v} ${c.gana}/${c.pierde}/${c.noCoincide}`;
  };
  const todas = orden
    .filter((v) => v in cuentas)
    .map(dicho)
    .join(', ');
  if (validas.length === 0)
    return {
      ganadora: null,
      motivo: `ninguna gana sin perder (gana/pierde/no coincide: ${todas}): se queda la de ahora`,
      cuentas,
    };
  const ganadora = [...validas].sort((a, b) => {
    const ca = cuentas[a] as { gana: number; confianza: number };
    const cb = cuentas[b] as { gana: number; confianza: number };
    return cb.gana - ca.gana || cb.confianza - ca.confianza || orden.indexOf(a) - orden.indexOf(b);
  })[0] as string;
  return { ganadora, motivo: `gana ${ganadora} (gana/pierde/no coincide: ${todas})`, cuentas };
}

/** La clave de un duelo del torneo: `x|y`, con los resultados desde `x`. */
export const duelo = (x: string, y: string): string => `${x}|${y}`;

/**
 * El torneo (cuando la hoja de ahora se pintó sobre otro maniquí y quedarse con ella
 * no es una opción): cada versión contra cada otra, con la misma regla de clips —en
 * un duelo, gana la que gana algún clip sin perder ninguno—. La ganadora es la que
 * gana todos sus duelos; si no la hay, no hay una clara, y se proponen las dos
 * mejores (por duelos ganados, luego clips ganados menos perdidos, luego confianza,
 * luego el orden) para que decida la persona en el visor. `duelos[duelo(x, y)]`, los
 * resultados de cada clip desde `x`; el de `y` contra `x` es el mismo dado la vuelta.
 */
export function elegirEnTorneo(
  duelos: Readonly<Record<string, readonly ResultadoDeClip[]>>,
  orden: readonly string[],
): Eleccion {
  const resultados = (x: string, y: string): readonly ResultadoDeClip[] => {
    const directo = duelos[duelo(x, y)];
    if (directo !== undefined) return directo;
    const vuelta = duelos[duelo(y, x)];
    if (vuelta === undefined) throw new Error(`falta el duelo de ${x} contra ${y}`);
    const opuesto = { gana: 'pierde', pierde: 'gana', no_coincide: 'no_coincide' } as const;
    return vuelta.map((r) => ({ ...r, resultado: opuesto[r.resultado] }));
  };
  const cuentas: Record<
    string,
    { gana: number; pierde: number; noCoincide: number; confianza: number }
  > = {};
  const duelosGanados: Record<string, number> = {};
  for (const x of orden) {
    const c = { gana: 0, pierde: 0, noCoincide: 0, confianza: 0 };
    duelosGanados[x] = 0;
    for (const y of orden) {
      if (y === x) continue;
      const rs = resultados(x, y);
      const gana = rs.filter((r) => r.resultado === 'gana').length;
      const pierde = rs.filter((r) => r.resultado === 'pierde').length;
      c.gana += gana;
      c.pierde += pierde;
      c.noCoincide += rs.length - gana - pierde;
      c.confianza += rs
        .filter((r) => r.resultado === 'gana')
        .reduce((s2, r) => s2 + r.confianza, 0);
      if (gana > 0 && pierde === 0) duelosGanados[x] = (duelosGanados[x] ?? 0) + 1;
    }
    cuentas[x] = c;
  }
  const ranking = [...orden].sort((a, b) => {
    const ca = cuentas[a] as { gana: number; pierde: number; confianza: number };
    const cb = cuentas[b] as { gana: number; pierde: number; confianza: number };
    return (
      (duelosGanados[b] ?? 0) - (duelosGanados[a] ?? 0) ||
      cb.gana - cb.pierde - (ca.gana - ca.pierde) ||
      cb.confianza - ca.confianza ||
      orden.indexOf(a) - orden.indexOf(b)
    );
  });
  const dicho = orden
    .map((v) => `${v} ${duelosGanados[v]} de ${orden.length - 1} duelos`)
    .join(', ');
  const primera = ranking[0] as string;
  const clara = orden.length > 1 && duelosGanados[primera] === orden.length - 1;
  const finalistas = ranking.slice(0, 2);
  return clara
    ? {
        ganadora: primera,
        motivo: `torneo: gana ${primera} todos sus duelos (${dicho})`,
        cuentas,
        modo: 'torneo',
        finalistas,
      }
    : {
        ganadora: null,
        motivo: `torneo: ninguna gana todos sus duelos (${dicho}); la de ahora no vale (es de otro maniquí): decide la persona entre ${finalistas.join(' y ')} en el visor`,
        cuentas,
        modo: 'torneo',
        finalistas,
      };
}

/** El prompt de la comparación a ciegas de un clip. */
export function promptDeComparacion(clip: string, bucle: boolean, id: string): string {
  return `Eres el revisor de animaciones de un juego de estrategia de fantasía. Cada personaje se
pinta fotograma a fotograma copiando la pose de un maniquí 3D (cámara ortográfica
elevada 25°). Te enseño DOS versiones, A y B, del mismo clip «${clip}» (${FIGURA.columnas} fotogramas,
${bucle ? 'en bucle' : 'que se juega una vez'}) del mismo personaje.

Imagen 1: arriba el maniquí (gris en profundidad: más claro, más cerca), en medio la
versión A y abajo la versión B, columna a columna el mismo fotograma.
Imagen 2: la lámina de giro del personaje (su identidad).

¿Cuál es mejor animación para el juego? Juzga, por este orden:
1. que copie la pose del maniquí articulación por articulación (qué pierna va delante,
   dónde van los brazos y el arma, la fase del movimiento), sin copiar la postura de la
   lámina de giro;
2. que el personaje sea el mismo en todos los fotogramas (equipo, arma y mano, colores,
   proporciones) y se parezca a su identidad;
3. que el movimiento sea suave de un fotograma al siguiente${bucle ? ' (y del último al primero, que es un bucle)' : ''}, sin saltos
   de posición ni de tamaño;
4. sin miembros de más o de menos ni trozos sueltos.
El acabado de la pintura y el arma del personaje frente al palo del maniquí no cuentan.
Devuelve SOLO el JSON del esquema; \`clip\`: «${id}». Si son igual de buenas o igual de malas,
\`mejor\` = «igual».`;
}

/** El ritmo de cada clip de la dirección (su `atlas.json`), o el del reloj. */
function fpsDe(f: Figura, d: number): Record<string, number> {
  const ruta = join(RAIZ, f.arte, `d${d}`, 'atlas.json');
  const reloj = Object.fromEntries(Object.entries(RELOJ).map(([c, r]) => [c, r.fps]));
  if (!existsSync(ruta)) return reloj;
  const atlas = JSON.parse(readFileSync(ruta, 'utf8')) as {
    clips: Record<string, { fps: number }>;
  };
  return {
    ...reloj,
    ...Object.fromEntries(Object.entries(atlas.clips).map(([c, k]) => [c, k.fps])),
  };
}

const rutaDeLaEleccion = (f: Figura, d: number, h: string) =>
  join(RAIZ, f.revision, `d${d}`, `eleccion-${h}.json`);

/**
 * `elegir`: cada versión pintada frente a la de ahora, clip a clip y en los dos
 * órdenes (una llamada a ChatGPT por panel y orden), y la elegida
 * (`eleccion-<h>.json`).
 */
export async function elegir(f: Figura, d: number, h: string): Promise<Eleccion> {
  const ahora = `${f.arte}/d${d}/hoja-${h}.webp`;
  const clips = HOJAS_DE_FIGURA[h as HojaDeFigura] as readonly string[];
  const fps = fpsDe(f, d);
  const hechas = VARIANTES.filter((v) =>
    existsSync(join(RAIZ, `${rutaDeVersion(f, d, h, v)}.webp`)),
  );
  if (hechas.length === 0)
    throw new Error(
      `no hay ninguna versión pintada de d${d}-${h}: «pnpm taller versiones ${f.id} d${d} ${h}» y «pnpm taller»`,
    );
  const rutaDe = (v: string) =>
    v === 'ahora' ? ahora : `${rutaDeVersion(f, d, h, v as Variante)}.webp`;
  /**
   * Un duelo, clip a clip y en los dos órdenes (una llamada a ChatGPT por panel y
   * orden), desde `x`. Cada comparación guardada lleva la huella de lo que juzgó
   * (el panel, el giro y el prompt): si la versión se repintó, se rehace (QA, H2).
   */
  const enfrentar = async (x: string, y: string): Promise<ResultadoDeClip[]> => {
    const juicios: Comparacion[][] = [];
    for (const [n, versiones] of [
      { A: rutaDe(y), B: rutaDe(x) },
      { A: rutaDe(x), B: rutaDe(y) },
    ].entries()) {
      // Contra la de ahora, la carpeta de siempre (`<versión>/orden-n`): así valen las
      // comparaciones hechas antes del torneo.
      const pareja = y === 'ahora' ? x : `${x}-contra-${y}`;
      const dir = `${f.revision}/d${d}/versiones/comparar-${h}/${pareja}/orden-${n + 1}`;
      await comparacion({
        unidad: f.id,
        direccion: d,
        carpetaDelArte: f.arte,
        maniqui: f.maniqui,
        filasDeHoja: HOJAS_DE_FIGURA,
        fps,
        hoja: h,
        versiones,
        salida: dir,
      });
      juicios.push(
        await Promise.all(
          clips.map(async (clip) => {
            const salida = join(RAIZ, dir, `${clip}.gpt.json`);
            const bucle = (RELOJ as Record<string, { loop: boolean }>)[clip]?.loop === true;
            const prompt = promptDeComparacion(
              clip,
              bucle,
              `${f.id}-d${d}-${clip}-${x}-${y}-${n + 1}`,
            );
            const imagenes = [join(RAIZ, dir, `${clip}.png`), join(RAIZ, dir, 'giro.png')];
            const huella = sha256(
              Buffer.from([prompt, ...imagenes.map((r) => sha256(readFileSync(r)))].join('\n')),
            );
            if (juicioVigente(salida, huella, [join(RAIZ, rutaDe(x)), join(RAIZ, rutaDe(y))]))
              return validarCon(comparacionSchema, readFileSync(salida, 'utf8'), salida);
            const c = await juzgarConCodex(prompt, imagenes, comparacionSchema, salida);
            await apuntarHuella(salida, huella);
            return c;
          }),
        ),
      );
    }
    // En el primer orden `x` es B; en el segundo, A: lo de `resultadoDelClip`.
    return clips.map((clip, i) =>
      resultadoDelClip(
        clip,
        (juicios[0] as Comparacion[])[i] as Comparacion,
        (juicios[1] as Comparacion[])[i] as Comparacion,
      ),
    );
  };
  // La de ahora pintada sobre otro maniquí no es una referencia: torneo.
  const torneo = hojasSobreOtroManiqui(RAIZ, f.arte).some((r) => r.hoja === `d${d}-${h}`);
  let eleccion: Eleccion;
  let detalle: Record<string, ResultadoDeClip[]>;
  if (torneo) {
    if (hechas.length < 2)
      throw new Error(
        `d${d}-${h} se pintó sobre otro maniquí y no vale como referencia: hacen falta dos versiones o más para compararlas entre sí, y hay ${hechas.length}`,
      );
    detalle = {};
    const pares = hechas.flatMap((x, i) => hechas.slice(i + 1).map((y) => [x, y] as const));
    await Promise.all(
      pares.map(async ([x, y]) => {
        detalle[duelo(x, y)] = await enfrentar(x, y);
      }),
    );
    eleccion = elegirEnTorneo(detalle, hechas);
  } else {
    detalle = {};
    await Promise.all(
      hechas.map(async (v) => {
        detalle[v] = await enfrentar(v, 'ahora');
      }),
    );
    eleccion = { ...elegirVersion(detalle, hechas), modo: 'contra-la-de-ahora' };
  }
  await writeFile(
    rutaDeLaEleccion(f, d, h),
    `${JSON.stringify({ ...eleccion, detalle }, null, 1)}\n`,
  );
  return eleccion;
}

const eleccionSchema = z
  .object({
    ganadora: z.string().nullable(),
    motivo: z.string(),
    modo: z.enum(['contra-la-de-ahora', 'torneo']).optional(),
    finalistas: z.array(z.string()).optional(),
  })
  .passthrough();
const claveSchema = z.record(z.string(), z.record(z.string(), z.string()));
/** El id del caso del visor de una elección. */
export const casoDeEleccion = (d: number, h: string): string => `eleccion-d${d}-${h}`;
const rutaDeLaClave = (f: Figura) => join(RAIZ, f.revision, 'visor', 'clave.json');

/**
 * Si se puede adoptar la versión ganadora de una hoja: `null`, o el motivo. Hace
 * falta una ganadora y que la persona la prefiriera en el visor.
 */
export function adoptarBlocker(
  eleccion: {
    readonly ganadora: string | null;
    readonly motivo: string;
    readonly modo?: 'contra-la-de-ahora' | 'torneo' | undefined;
    readonly finalistas?: readonly string[] | undefined;
  },
  elegida: string | undefined,
  d: number,
  h: string,
): string | null {
  // En un torneo sin ganadora clara decide la persona entre las dos finalistas;
  // «iguales» es que le vale cualquiera (`versionAdoptada`).
  if (eleccion.modo === 'torneo' && eleccion.ganadora === null) {
    if (elegida === undefined)
      return `la persona aún no ha elegido en el visor entre ${(eleccion.finalistas ?? []).join(' y ')} (d${d}-${h}): «pnpm taller visor <id>»`;
    return (eleccion.finalistas ?? []).includes(elegida) || elegida === IGUALES
      ? null
      : `la persona no eligió ninguna de las finalistas de d${d}-${h} (${(eleccion.finalistas ?? []).join(', ')}): eligió «${elegida}»`;
  }
  if (eleccion.ganadora === null)
    return `ninguna versión gana a la de ahora en d${d}-${h}: se queda la de ahora (${eleccion.motivo})`;
  if (elegida === undefined)
    return `la persona aún no ha visto la ganadora de d${d}-${h} (${eleccion.ganadora}) en el visor: «pnpm taller visor <id>»`;
  if (elegida !== eleccion.ganadora)
    return `la persona no prefirió la ganadora de d${d}-${h} (${eleccion.ganadora}): eligió «${elegida}»`;
  return null;
}

/** La respuesta del visor con que la persona dice que las dos le valen. */
export const IGUALES = 'iguales';

/**
 * La versión que se adopta: la ganadora; en un torneo sin ella, la que eligió la
 * persona, y si dijo «iguales», la primera finalista (la que más duelos ganó).
 */
export function versionAdoptada(
  eleccion: { readonly ganadora: string | null; readonly finalistas?: readonly string[] | undefined },
  elegida: string | undefined,
): string | undefined {
  if (eleccion.ganadora !== null) return eleccion.ganadora;
  return elegida === IGUALES ? eleccion.finalistas?.[0] : elegida;
}

/** `adoptar`: copia la ganadora y su procedencia (con la elección) a `assets/` y junta la dirección. */
export async function adoptar(f: Figura, d: number, h: string): Promise<string> {
  const ruta = rutaDeLaEleccion(f, d, h);
  if (!existsSync(ruta))
    throw new Error(`d${d}-${h} no se ha elegido aún: «pnpm taller elegir ${f.id} d${d} ${h}»`);
  const eleccion = validarCon(eleccionSchema, readFileSync(ruta, 'utf8'), ruta);
  const caso = casoDeEleccion(d, h);
  const valor = respuestasDe(f)[caso]?.valor;
  const clave = existsSync(rutaDeLaClave(f))
    ? validarCon(claveSchema, readFileSync(rutaDeLaClave(f), 'utf8'), rutaDeLaClave(f))
    : {};
  const elegida = valor === undefined ? undefined : (clave[caso]?.[valor] ?? valor);
  const motivo = adoptarBlocker(eleccion, elegida, d, h);
  if (motivo !== null) throw new Error(motivo);
  const v = versionAdoptada(eleccion, elegida) as Variante;
  const origen = join(RAIZ, rutaDeVersion(f, d, h, v));
  const dir = join(RAIZ, f.arte, `d${d}`);
  const destino = join(dir, `hoja-${h}`);
  await copyFile(`${origen}.webp`, `${destino}.webp`);
  const proc = JSON.parse(await readFile(`${origen}.procedencia.json`, 'utf8')) as Record<
    string,
    unknown
  >;
  const webp = await readFile(`${destino}.webp`);
  await writeFile(
    `${destino}.procedencia.json`,
    `${JSON.stringify(
      {
        ...proc,
        salida: {
          ruta: `${f.arte}/d${d}/hoja-${h}.webp`,
          sha256: sha256(webp),
        },
        eleccion: { version: v, modo: eleccion.modo, motivo: eleccion.motivo, persona: valor },
      },
      null,
      2,
    )}\n`,
  );
  return alAcabarUnaHoja(dir);
}

/** Un número entre 0 y 1 de un texto: el orden a ciegas de un caso no cambia de una vez a otra. */
function azarDe(texto: string): number {
  return Number.parseInt(sha256(Buffer.from(texto)).slice(0, 8), 16) / 2 ** 32;
}

/**
 * Los casos del visor de una figura y su clave: las disputas de los veredictos que
 * la persona no ha mirado, y cada hoja con una ganadora frente a la de ahora, a
 * ciegas. La clave (qué versión es cada número) la lee `adoptar`.
 */
export function casosDelVisor(f: Figura): {
  casos: CasoDelVisor[];
  clave: Record<string, Record<string, string>>;
} {
  const respuestas = respuestasDe(f);
  const casos: CasoDelVisor[] = [];
  const clave: Record<string, Record<string, string>> = {};
  const comun = {
    unidad: f.id,
    carpetaDelArte: f.arte,
    maniqui: f.maniqui,
    filasDeHoja: HOJAS_DE_FIGURA,
  };
  for (let d = 0; d < NOMBRES_DE_DIRECCION.length; d++) {
    const rv = join(RAIZ, f.revision, `d${d}`, 'veredicto.json');
    if (existsSync(rv)) {
      const v = JSON.parse(readFileSync(rv, 'utf8')) as Veredicto;
      for (const c of v.clips)
        for (const hz of c.hallazgos) {
          const id = casoDeDisputa(d, c.clip, hz.indice);
          if (hz.estado !== 'disputa' || respuestas[id] !== undefined) continue;
          const anim = { ...comun, direccion: d, clip: c.clip };
          casos.push({
            id,
            titulo: `¿Se ve? · ${f.id} d${d} «${c.clip}»`,
            texto: `Un juez dice (fotogramas ${hz.hallazgo.fotogramas.join(', ')}): «${hz.hallazgo.que_se_ve}». ¿Se ve?`,
            opciones: OPCIONES_DE_DISPUTA,
            animaciones: [
              { ...anim, rotulo: 'maniquí', de: 'maniqui' },
              { ...anim, rotulo: 'pintado' },
              { ...anim, rotulo: 'pintado a 2 fps (para contar fotogramas)', fps: 2 },
            ],
          });
        }
    }
    for (const h of Object.keys(HOJAS_DE_FIGURA)) {
      const re = rutaDeLaEleccion(f, d, h);
      if (!existsSync(re)) continue;
      const e = validarCon(eleccionSchema, readFileSync(re, 'utf8'), re);
      const id = casoDeEleccion(d, h);
      // Contra la de ahora, la ganadora y la de ahora; en un torneo, sus dos finalistas.
      const pareja =
        e.modo === 'torneo'
          ? (e.finalistas ?? [])
          : e.ganadora === null
            ? []
            : ['ahora', e.ganadora];
      if (pareja.length < 2 || respuestas[id] !== undefined) continue;
      const versiones = azarDe(id) < 0.5 ? pareja : [...pareja].reverse();
      clave[id] = { 'versión 1': versiones[0] as string, 'versión 2': versiones[1] as string };
      const ruta = (v: string) =>
        v === 'ahora'
          ? `${f.arte}/d${d}/hoja-${h}.webp`
          : `${rutaDeVersion(f, d, h, v as Variante)}.webp`;
      casos.push({
        id,
        titulo: `¿Cuál se queda? · ${f.id} d${d}, hoja ${h.toUpperCase()}`,
        texto:
          'La misma hoja pintada dos veces, clip a clip junto a su maniquí. ¿Cuál es mejor animación para el juego: copia al maniquí, el personaje no cambia, se mueve suave?',
        opciones: ['versión 1', 'versión 2', 'iguales', 'ninguna vale'],
        animaciones: (HOJAS_DE_FIGURA[h as HojaDeFigura] as readonly string[]).flatMap((clip) => [
          {
            ...comun,
            direccion: d,
            clip,
            letra: h,
            hoja: ruta('ahora'),
            de: 'maniqui' as const,
            rotulo: `«${clip}» · maniquí`,
          },
          ...versiones.map((v, k) => ({
            ...comun,
            direccion: d,
            clip,
            letra: h,
            hoja: ruta(v),
            rotulo: `«${clip}» · versión ${k + 1}`,
          })),
        ]),
      });
    }
  }
  return { casos, clave };
}

/** Escribe la clave del visor junto a la de antes (las respuestas viejas la siguen necesitando). */
export async function escribirClave(
  f: Figura,
  clave: Record<string, Record<string, string>>,
): Promise<void> {
  const ruta = rutaDeLaClave(f);
  const antes = existsSync(ruta) ? validarCon(claveSchema, readFileSync(ruta, 'utf8'), ruta) : {};
  await mkdir(dirname(ruta), { recursive: true });
  await writeFile(ruta, `${JSON.stringify({ ...antes, ...clave }, null, 1)}\n`);
}
