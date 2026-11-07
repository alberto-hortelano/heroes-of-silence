/**
 * Las laderas (§20): las caídas al este y al oeste, una cadena de módulos por
 * caída, con su inicio, su medio y su fin, puestos sobre las juntas que se
 * registraron en su guía (`JuntasDeLadera`), y el guardia de las que bajan de los
 * dos lados a una misma casilla (`laderasEnfrentadas`).
 */
import {
  type Catalogo,
  esHojaDeLadera,
  type Modulo,
  type ModuloDeLadera,
  moduloDeLadera,
  type PapelDeLadera,
} from '../catalogo.js';
import { bordeDeLadera, caidaDeLadera, type Ladera, pieDeLadera } from '../relieve.js';
import type { Sprite } from './sprite.js';
import { materialDeCara } from './tablas.js';

/** La hoja de laderas de una ladera: `laderas-<material>-<lado>-<caída>` (§20). Nunca se espeja. */
export function hojaDeLadera(l: Ladera): string {
  return `${materialDeCara(l.material).ladera}-${l.lado}-${caidaDeLadera(l.caida)}`;
}

/** Los módulos de una hoja de laderas por su papel en la cadena (§20). */
export interface JuegoDeLadera {
  readonly inicio: ModuloDeLadera;
  readonly fin: ModuloDeLadera;
  /** Lo que va en medio, por nombre: los de una casilla y los de dos. */
  readonly medios: readonly ModuloDeLadera[];
  readonly largos: readonly ModuloDeLadera[];
}

/**
 * El juego de una hoja de laderas, por el papel que trae cada módulo en sus
 * juntas (`JuntasDeLadera.papel`, del índice de la hoja). Lanza si a un módulo
 * le faltan las juntas o a la hoja un papel. La `esquina` de §20 no entra: con
 * el relieve por celdas (R4) dobla la diagonal, y su módulo queda sin uso.
 */
export function juegoDeLadera(hoja: string, modulos: readonly Modulo[]): JuegoDeLadera {
  const ms = modulos
    .map((m) => moduloDeLadera(m, hoja))
    .sort((p, q) => (p.nombre < q.nombre ? -1 : p.nombre > q.nombre ? 1 : 0));
  const de = (papel: PapelDeLadera) => ms.filter((m) => m.ladera.papel === papel);
  const uno = (papel: PapelDeLadera): ModuloDeLadera => {
    const [m, ...otros] = de(papel);
    if (m === undefined || otros.length > 0)
      throw new Error(`«${hoja}» lleva un módulo «${papel}», y trae ${de(papel).length}`);
    return m;
  };
  const medios = de('medio');
  // Sin repetir el de al lado hacen falta dos.
  if (medios.length < 2)
    throw new Error(`«${hoja}» lleva al menos dos módulos «medio», y trae ${medios.length}`);
  return {
    inicio: uno('inicio'),
    fin: uno('fin'),
    medios,
    largos: de('largo'),
  };
}

/** Un módulo de ladera en su sitio de la cadena: desde la casilla `y`, `largo` casillas hacia el sur. */
export interface PiezaDeLadera {
  readonly modulo: ModuloDeLadera;
  readonly y: number;
}

/**
 * Qué módulos lleva una ladera, de norte a sur (§20):
 *
 * - `inicio` al norte y `fin` al sur donde la cadena remata (`extremos`): donde
 *   sigue de espaldas, en el borde, o con una caída menor (`caidas`, en
 *   `celdas.ts`). Donde sigue por una diagonal o por una ladera de su caída o
 *   mayor no remata: la pieza de al lado empalma por la junta.
 * - En medio, al azar entre los `medios` y los `largos`, sin repetir el de al
 *   lado; uno solo si le caben sus filas antes del remate.
 * - Con una sola fila, el `fin` gana al `inicio`: el sur es lo que mira a la cámara.
 */
export function piezasDeLadera(
  l: Ladera,
  extremos: { readonly inicio: boolean; readonly fin: boolean },
  juego: JuegoDeLadera,
  azar: () => number,
): PiezaDeLadera[] {
  const sur = extremos.fin ? juego.fin : null;
  const norte = extremos.inicio && (sur === null || l.y1 > l.y0) ? juego.inicio : null;
  const fuera: PiezaDeLadera[] = [];
  if (norte !== null) fuera.push({ modulo: norte, y: l.y0 });
  const hasta = sur === null ? l.y1 : l.y1 - 1;
  let anterior = norte;
  for (let y = norte === null ? l.y0 : l.y0 + 1; y <= hasta + 1e-9; ) {
    const caben = hasta - y + 1;
    const candidatos = [...juego.medios, ...juego.largos].filter(
      (m) => m !== anterior && m.ladera.largo <= caben + 1e-9,
    );
    const modulo = candidatos[Math.floor(azar() * candidatos.length)] as ModuloDeLadera;
    fuera.push({ modulo, y });
    anterior = modulo;
    y += modulo.ladera.largo;
  }
  if (sur !== null) fuera.push({ modulo: sur, y: l.y1 });
  return fuera;
}

/**
 * Dónde va el módulo `m` de ladera que empieza en la casilla `y` de `l`, y con
 * qué alto.
 *
 * El filo de su junta norte va en el borde de la ladera (`bordeDeLadera`), en la
 * fila de arriba de su casilla; el pie de su junta sur, en el pie de su última
 * fila (`pieDeLadera`). De esos dos puntos sale su escala, y el talud ya lo trae
 * la guía. El ancla, por debajo del pie, es el cono de derrubio.
 */
export function colocarLadera(
  m: ModuloDeLadera,
  l: Ladera,
  y: number,
): { readonly x: number; readonly y: number; readonly alto: number } {
  const {
    filo: [fx, fy],
    pie: [, py],
    largo,
  } = m.ladera;
  const k = (pieDeLadera(l, y + largo - 1)[1] - y) / (py - fy);
  return { x: bordeDeLadera(l) + (m.ax - fx) * k, y: y + (m.ay - fy) * k, alto: m.nh * k };
}

/** Dónde quedaron el filo y el pie de un módulo de ladera ya colocado: lo inverso de `colocarLadera`. */
export function juntasColocadas(
  m: ModuloDeLadera,
  s: Pick<Sprite, 'x' | 'y' | 'alto'>,
): { readonly filo: readonly [number, number]; readonly pie: readonly [number, number] } {
  const k = s.alto / m.nh;
  const en = ([px, py]: readonly [number, number]) =>
    [s.x - (m.ax - px) * k, s.y - (m.ay - py) * k] as const;
  return { filo: en(m.ladera.filo), pie: en(m.ladera.pie) };
}

/** Los módulos de las hojas de laderas del catálogo por su `src`: qué sprite es una ladera, y de qué hoja. */
export function modulosDeLadera(
  catalogo: Catalogo,
): Map<string, { readonly modulo: ModuloDeLadera; readonly hoja: string }> {
  const fuera = new Map<string, { readonly modulo: ModuloDeLadera; readonly hoja: string }>();
  for (const [hoja, ms] of Object.entries(catalogo.hojas))
    if (esHojaDeLadera(hoja))
      for (const m of ms) fuera.set(m.src, { modulo: moduloDeLadera(m, hoja), hoja });
  return fuera;
}

/**
 * Las casillas bajas con laderas de los dos lados al pie, en la misma fila: la
 * del este de la casilla de su oeste y la del oeste de la de su este, con los
 * pies en la misma columna. Es el barranco de una casilla que `sinBarrancos`
 * deja sin laderas (QA de #156, H1). Mide desde lo puesto: el pie de cada
 * sprite de ladera (`juntasColocadas`) y las filas que cubre su filo, que por
 * celdas van corridas media fila.
 */
export function laderasEnfrentadas(
  sprites: readonly Sprite[],
  modulos: ReadonlyMap<string, { readonly modulo: ModuloDeLadera; readonly hoja: string }>,
): string[] {
  const alPie = { este: new Set<string>(), oeste: new Set<string>() };
  for (const s of sprites) {
    const m = s.src === null ? undefined : modulos.get(s.src);
    if (m === undefined) continue;
    const { filo, pie } = juntasColocadas(m.modulo, s);
    const lado = pie[0] > filo[0] ? 'este' : 'oeste';
    const fila = Math.round(filo[1] * 2) / 2;
    for (let k = 0; k < m.modulo.ladera.largo; k++)
      alPie[lado].add(`${Math.floor(pie[0])},${fila + k}`);
  }
  return [...alPie.este]
    .filter((c) => alPie.oeste.has(c))
    .map((c) => `${c}: laderas de los dos lados al pie`);
}
