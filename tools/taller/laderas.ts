/**
 * Las LADERAS: la segunda familia de paredes de acantilado laterales, las que
 * caen al este y al oeste (`docs/art/peticiones.md` §20, respuesta a #156).
 *
 * La primera (`laterales-*`, §18) era una pieza cerrada por casilla, con el filo
 * y el pie rectos: encadenada se leía como una fila de bloques iguales, con la
 * corona de matas haciendo muesca en cada junta y la cara como columnas
 * apiladas. El usuario, al verla en el juego (07-10-2026): «la pared lateral no
 * esta bien conseguida y su repeticion se nota mucho, hace fata arte nuevo,
 * evitar bordes rectos, que tenga un poco de giros».
 *
 * Esta familia es un risco CONTINUO cortado en trozos:
 *
 * - **Contrato de junta.** Cada pieza va de una junta a otra a lo largo del
 *   canto (norte arriba, sur abajo). En cada junta el filo pasa por la línea de
 *   referencia (x = 0, alto `niveles · NIVEL`) y el pie por
 *   `TALUD_DE_LADERA[niveles]` casillas más allá (`relieve.ts`: lo lee también
 *   `componer`), con tangente recta: así cualquier pieza empalma con
 *   cualquier otra de su caída. Entre junta y junta, el filo y el pie giran
 *   (entrantes, espolones, conos de derrubio), nada de rectas.
 * - **Juntas abiertas.** Los extremos se cortan por la línea de máxima
 *   pendiente (la diagonal del filo al pie): la pieza de delante pinta encima y
 *   la junta no se ve. `inicio` remata el norte de una cadena y `fin` el sur
 *   con un morro (y `fin`, con un cono de derrubio); la `esquina` dobla al sur
 *   en una pared frontal.
 * - **Sin corona.** Encima del filo solo va un labio de roca estrecho y unas
 *   matas sueltas: el prado lo pinta el juego. La franja verde del piloto se
 *   leía como una cinta amarilla (07-10-2026).
 * - **Talud, no muro.** Un escarpe corto de losas rotas bajo el filo y un
 *   derrubio de bloques hasta el pie: en esta proyección una cara vertical que
 *   mira al este no se ve, y los estratos horizontales de una ladera que mira al
 *   este salen VERTICALES en pantalla, que es por lo que la primera familia salió
 *   en columnas. La guía lo dibuja en dos tonos (escarpe y derrubio) y parte el
 *   escarpe con canales de derrubio en diagonal desde la caída 2.
 *
 * Una hoja de ocho por caída (`laderas-<material>-<lado>-<niveles>`); la de 3
 * niveles, en vertical para que sus dos filas pasen de 120 px por casilla. Cada
 * material lleva su frontal (`paredes-<material>`) como referencia de MATERIAL
 * (color, no forma) y los peñascos como identidad (forma).
 *
 *   pnpm taller encolar --laderas [--solo=roca-este-1,roca-este-2]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import {
  esHojaDeLadera,
  type JuntasDeLadera,
  type PapelDeLadera,
} from '../../src/client/render/escenario/catalogo.js';
import { TALUD_DE_LADERA } from '../../src/client/render/escenario/relieve.js';
import { mascaraDeGuia, registrarLadera } from './derivar.js';
import type { Encargo } from './encargo.js';
import { ESTILO_DEL_MAPA, REFERENCIA_DE_MAPAS } from './mapa-denso.js';
import {
  ARRIBA,
  DIR_GUIAS,
  FRENTE,
  Guia,
  type Lado,
  MATAS,
  MATERIALES,
  type Material,
  NIVEL,
  type P2,
  type P3,
  SOMBRA,
} from './paredes-puentes.js';

const RAIZ = resolve(import.meta.dirname, '../..');

export type Niveles = 1 | 2 | 3;

/**
 * Lo que entra en la meseta el labio de roca del filo, en casillas. No hay
 * franja de hierba: el prado lo pinta el juego, y la franja verde de la primera
 * tanda del piloto se leía como una cinta amarilla (07-10-2026).
 */
export const LABIO = 0.06;
/** A qué fracción de la caída se rompe el escarpe en derrubio. */
export const ROTURA = 0.42;
/**
 * `inicio` no acaba en punta. Con el corte norte por la línea de máxima
 * pendiente, el filo y ese corte se juntaban en un ángulo agudo que se pintaba
 * como un pico (§20, 07-10-2026; #160). En caída 1 y 2 la ladera:
 *
 * - baja algo de alto en la primera `LOMA` de la casilla, sin que el filo deje
 *   de subir en pantalla (la pendiente en pantalla, a lo más `PENDIENTE_DE_LOMA`);
 * - y su cara da la vuelta por el norte en un morro: en pantalla, el corte baja
 *   del filo al pie en un hombro convexo, con un derrame de derrubio que se
 *   deshace en el suelo.
 *
 * En caída 3 sigue el morro de antes (`morro`): su hoja nueva se probó y se
 * descartó (§20), y la de HEAD se pintó con esta guía.
 */
const LOMA = 0.6;
const PENDIENTE_DE_LOMA = 0.6;
/**
 * Lo que corre hacia la meseta la frontal de la `esquina`, en casillas, desde el
 * borde de su casilla. Con el relieve por celdas (R4) el juego ya no usa las
 * esquinas —dobla la diagonal—, pero la guía de sus hojas se dibuja igual.
 */
const FRONTAL_DE_ESQUINA = 0.85;

/** Lo que el cono de derrubio de `inicio` y `fin` sale más allá de su junta, en casillas. */
const CONO = 0.26;

/** El derrubio, entre el escarpe en sombra y la tapa de los bloques. */
export const DERRUBIO = '#8e8e8e';

/** Una pieza de la familia. */
export interface Pieza {
  readonly nombre: string;
  /** Casillas de norte a sur. */
  readonly largo: 1 | 2;
  /** El desvío del filo y del pie respecto de la referencia, a lo largo (t de 0 a 1). */
  readonly filo: (t: number) => number;
  readonly pie: (t: number) => number;
  /**
   * `inicio` remata el norte de una cadena y `fin` el sur: la ladera se deshace
   * en un cono de derrubio que tapa el corte. `esquina` dobla al sur en frontal.
   */
  readonly clase: 'tramo' | 'inicio' | 'fin' | 'esquina';
}

const PI = Math.PI;
/** Una joroba de 0 a 0 con tangente nula en los extremos: lo que pide la junta. */
export const joroba = (t: number) => Math.sin(PI * t) ** 2;
export const onda = (k: number) => (t: number) => Math.sin(PI * t) * Math.sin(k * PI * t);

/**
 * Las piezas: las variantes se distinguen en el CONTORNO, no solo en el detalle,
 * para que una cadena no repita silueta. Positivo = hacia fuera de la meseta.
 */
export const PIEZAS: readonly Pieza[] = [
  {
    nombre: 'inicio',
    largo: 1,
    clase: 'inicio',
    filo: (t) => 0.08 * joroba(t),
    pie: (t) => 0.08 * joroba(t),
  },
  // Un entrante: el filo muerde la meseta y un cono de derrubio sale por el pie.
  {
    nombre: 'medio-a',
    largo: 1,
    clase: 'tramo',
    filo: (t) => -0.14 * joroba(t),
    pie: (t) => 0.12 * joroba(t),
  },
  // Un espolón: filo y pie salen juntos.
  {
    nombre: 'medio-b',
    largo: 1,
    clase: 'tramo',
    filo: (t) => 0.12 * joroba(t),
    pie: (t) => 0.14 * joroba(t),
  },
  // Una S suave.
  {
    nombre: 'medio-c',
    largo: 1,
    clase: 'tramo',
    filo: (t) => 0.13 * onda(2)(t),
    pie: (t) => -0.1 * onda(2)(t),
  },
  // Dos casillas: espolón y luego entrante.
  {
    nombre: 'largo-a',
    largo: 2,
    clase: 'tramo',
    filo: (t) => 0.15 * onda(2)(t),
    pie: (t) => 0.12 * onda(2)(t) + 0.06 * joroba(t),
  },
  // Dos casillas: entrante, espolón, entrante.
  {
    nombre: 'largo-b',
    largo: 2,
    clase: 'tramo',
    filo: (t) => -0.12 * onda(3)(t),
    pie: (t) => 0.1 * onda(4)(t) + 0.05 * joroba(t),
  },
  {
    nombre: 'fin',
    largo: 1,
    clase: 'fin',
    filo: (t) => -0.08 * joroba(t),
    pie: (t) => 0.1 * joroba(t),
  },
  {
    nombre: 'esquina',
    largo: 1,
    clase: 'esquina',
    filo: (t) => 0.07 * onda(2)(t),
    pie: (t) => 0.06 * joroba(t),
  },
];

/** Qué piezas lleva la hoja de cada caída, en orden de lectura (filas de cuatro). */
export const PIEZAS_DE_LADERA: Readonly<Record<Niveles, readonly string[]>> = {
  1: ['inicio', 'medio-a', 'medio-b', 'medio-c', 'largo-a', 'largo-b', 'fin', 'esquina'],
  2: ['inicio', 'medio-a', 'medio-b', 'medio-c', 'largo-a', 'largo-b', 'fin', 'esquina'],
  3: ['inicio', 'medio-a', 'medio-b', 'fin', 'largo-a', 'medio-c', 'largo-b', 'esquina'],
};

/** El lienzo de cada hoja: la de caída 3 va en vertical, para que quepan dos filas. */
const LIENZO: Readonly<Record<Niveles, readonly [number, number]>> = {
  1: [1536, 1024],
  2: [1536, 1024],
  3: [1024, 1536],
};

const pieza = (nombre: string): Pieza => {
  const p = PIEZAS.find((x) => x.nombre === nombre);
  if (p === undefined) throw new Error(`no hay pieza de ladera «${nombre}»`);
  return p;
};

/** Un azar con semilla, para que la guía salga igual cada vez. */
export function azarDe(texto: string): () => number {
  let h = 2166136261;
  for (const c of texto) h = Math.imul(h ^ (c.codePointAt(0) as number), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * Un bloque anguloso (no una bola): tapa de 5-7 lados irregulares a alto `h` y
 * su costado hacia la cámara.
 */
export function bloque(
  g: Guia,
  x: number,
  y: number,
  r: number,
  h: number,
  z: number,
  azar: () => number,
  sombra: boolean,
): void {
  const n = 5 + Math.floor(azar() * 3);
  const giro = azar() * 2 * PI;
  const tapa: P3[] = [];
  for (let i = 0; i < n; i++) {
    const a = giro + (2 * PI * i) / n + (azar() - 0.5) * 0.5;
    const k = r * (0.7 + azar() * 0.45);
    tapa.push([x + Math.cos(a) * k, y + Math.sin(a) * k * 0.8, z + h]);
  }
  // El costado: la mitad de delante de la tapa, bajada al suelo.
  const delante = tapa.filter((p) => p[1] >= y - r * 0.15).sort((p, q) => p[0] - q[0]);
  if (delante.length >= 2)
    g.poligono(
      [...delante, ...[...delante].reverse().map(([px, py]) => [px, py, z] as P3)],
      sombra ? SOMBRA : FRENTE,
    );
  g.poligono(tapa, ARRIBA);
}

/** Una mata: un borrón de 7 lados en la meseta, junto al filo. */
export function mata(
  g: Guia,
  x: number,
  y: number,
  z: number,
  r: number,
  azar: () => number,
): void {
  const pts: P3[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (2 * PI * i) / 7;
    const k = r * (0.7 + azar() * 0.5);
    pts.push([x + Math.cos(a) * k, y + Math.sin(a) * k * 0.7, z]);
  }
  g.poligono(pts, MATAS);
}

/** La geometría que cuenta de cada pieza de la guía, en píxeles de la guía. */
export interface GeometriaDeLadera {
  readonly nombre: string;
  readonly largo: 1 | 2;
  readonly niveles: Niveles;
  /** El filo y el pie en la junta norte y en la sur (la sur de la esquina es su rincón). */
  readonly filoNorte: P2;
  readonly pieNorte: P2;
  readonly filoSur: P2;
  readonly pieSur: P2;
  /** La caja de lo dibujado de esta pieza. */
  readonly caja: readonly [number, number, number, number];
}

/**
 * Una pieza de ladera con el origen de la guía en su junta norte, sobre la
 * línea de referencia del filo. `s` = 1 al este, −1 al oeste.
 */
function dibujarPieza(g: Guia, p: Pieza, niveles: Niveles, s: 1 | -1): void {
  const H = niveles * NIVEL;
  const d = TALUD_DE_LADERA[niveles];
  const L = p.largo;
  const X = (x: number) => s * x;
  const azar = azarDe(`${p.nombre}-${niveles}-${s}`);
  const pasos = 28 * L;
  const ts = Array.from({ length: pasos + 1 }, (_, i) => i / pasos);
  const esquina = p.clase === 'esquina';
  const inicio = p.clase === 'inicio';
  const fin = p.clase === 'fin';
  const sombra = s > 0;
  // En la esquina, la lateral para antes del rincón, que redondea `R`.
  const R = 0.22;
  const yFin = esquina ? L - R : L;
  const yDe = (t: number) => t * yFin;
  // El filo y el pie, con un ruido suave en medio (nunca en la junta): ondas
  // de fase al azar, no dientes.
  const suave = (amplitud: number, desde: number, hasta: number) => {
    const ondas = Array.from({ length: 3 }, () => ({
      k: desde + azar() * (hasta - desde),
      fase: azar() * 2 * PI,
      a: amplitud * (0.5 + azar() * 0.5),
    }));
    return (t: number) =>
      (Math.sin(PI * t) *
        ondas.reduce((acc, o) => acc + o.a * Math.sin(o.k * PI * t * L + o.fase), 0)) /
      2;
  };
  const ruidoFilo = suave(0.04, 3, 6);
  const ruidoPie = suave(0.05, 3, 7);
  const loma = inicio && niveles < 3;
  // Lo que conserva del alto cada punto: menos de 1 solo en la loma de `inicio`.
  // Lo que se baja en la loma: lo que deja el filo subiendo en pantalla.
  const baja = Math.min(0.3, (2 * LOMA * PENDIENTE_DE_LOMA) / (PI * H));
  const alzado = (t: number): number =>
    loma && t < LOMA ? 1 - baja * (0.5 + 0.5 * Math.cos((PI * t) / LOMA)) : 1;
  const alto = (i: number): number => H * alzado(ts[i] as number);
  // Donde baja, la loma se redondea hacia fuera y su talud se estrecha.
  const filo = (i: number): number =>
    p.filo(ts[i] as number) + ruidoFilo(ts[i] as number) + 0.3 * (1 - alzado(ts[i] as number));
  const pie = (i: number): number => {
    const llano = d + p.pie(ts[i] as number) + ruidoPie(ts[i] as number);
    const a = alzado(ts[i] as number);
    return a === 1 ? llano : filo(i) + (llano - filo(i)) * (0.45 + 0.55 * a);
  };
  // La rotura entre el escarpe y el derrubio, a `ROTURA` de alto.
  const rotura = (i: number): number => {
    const f = filo(i);
    return f + (pie(i) - f) * (0.55 + 0.1 * Math.sin(5 * PI * (ts[i] as number) + 1));
  };
  const zRotura = H * (1 - ROTURA);
  const zRot = (i: number): number => alto(i) * (1 - ROTURA);

  // El labio de roca del filo: estrecho, con lóbulos, abierto en las juntas.
  const lobulos = suave(0.5, 3, 7);
  const borde = ts.map((t, i) => [X(filo(i)), yDe(t), alto(i)] as P3);
  const dentro = ts.map((t, i) => [X(filo(i) - LABIO * (1 + lobulos(t))), yDe(t), alto(i)] as P3);
  // Al norte de `inicio` el labio no dobla: el reborde norte lo pinta el juego,
  // y doblado salía como una lengua de piedra plana (07-10-2026).
  const norte: P3[] = [];
  const norteDentro: P3[] = [];
  // En la esquina, el filo dobla al sur y corre hacia la meseta como frontal.
  const rincon: P3[] = [];
  if (esquina) {
    const f0 = filo(pasos);
    for (let k = 1; k <= 8; k++) {
      const a = (PI / 2) * (k / 8);
      rincon.push([X(f0 - R + R * Math.cos(a)), yFin + R * Math.sin(a), H]);
    }
    for (let k = 1; k <= 8; k++) {
      const x = f0 - R - (FRONTAL_DE_ESQUINA - R) * (k / 8);
      rincon.push([X(x), L + 0.03 * Math.sin(k * 1.7), H]);
    }
  }
  const rinconDentro = rincon.map(([x, y, z], k) =>
    k < 8 ? ([x - s * LABIO, y - LABIO, z] as P3) : ([x, y - LABIO * 1.2, z] as P3),
  );
  g.poligono(
    [
      ...norte,
      ...borde,
      ...rincon,
      ...[...rinconDentro].reverse(),
      ...[...dentro].reverse(),
      ...norteDentro,
    ],
    ARRIBA,
  );

  // La frontal de la esquina, casi vertical, mirando a la cámara.
  if (esquina) {
    const e = 0.1;
    const f0 = filo(pasos);
    const arriba = rincon.slice(8);
    g.poligono(
      [
        ...[...arriba].reverse(),
        [X(f0 - R), L, H],
        [X(f0 - R + 0.4 * d), L + e + 0.06, 0],
        ...arriba.map(([x, y]) => [x, y + e + 0.04 * Math.sin(x * 9), 0] as P3),
      ],
      FRENTE,
    );
  }

  // El escarpe (sombra al este, luz al oeste) y el derrubio, de norte a sur.
  const escarpe: P3[] = [];
  const derrubio: P3[] = [];
  const pies: P3[] = [];
  for (let i = 0; i <= pasos; i++) {
    const y = yDe(ts[i] as number);
    escarpe.push([X(filo(i)), y, alto(i)]);
    derrubio.push([X(rotura(i)), y, zRot(i)]);
    pies.push([X(pie(i)), y, 0]);
  }
  // En la esquina, el pie de la lateral se dobla hacia el de la frontal.
  if (esquina) {
    const f0 = filo(pasos);
    for (let k = 1; k <= 6; k++) {
      const a = (PI / 2) * (k / 6);
      const x = f0 - R + 0.4 * d + (pie(pasos) - f0 + R - 0.4 * d) * Math.cos(a);
      pies.push([X(x), yFin + (R + 0.16) * Math.sin(a), 0]);
      derrubio.push([
        X(f0 - R + (rotura(pasos) - f0 + R) * Math.cos(a) * 0.9),
        yFin + R * Math.sin(a) * 0.9,
        zRotura,
      ]);
      escarpe.push([X(f0 - R + R * Math.cos(a)), yFin + R * Math.sin(a), H]);
    }
  }
  // `fin`: el corte se redondea en un morro (la ladera dobla la esquina y su
  // silueta sale convexa más allá de la junta) y el derrubio se derrama en un
  // cono por delante. `inicio` de caída 1 y 2: la loma ya llega baja a la junta
  // norte, y allí el escarpe se redondea y el derrubio la rodea hasta el suelo.
  // El de caída 3, el morro de antes; al norte el cono no se vería.
  const morro = (i: number, y: number, hacia: 1 | -1) => ({
    alto: [X(rotura(i) * 0.45), y + hacia * 0.09, (H + zRotura) / 2] as P3,
    bajo: [X((rotura(i) + pie(i)) / 2), y + hacia * 0.11, zRotura * 0.45] as P3,
  });
  const escarpeN: P3[] = [];
  const derrubioN: P3[] = [];
  const escarpeS: P3[] = [];
  const derrubioS: P3[] = [];
  if (inicio && !loma) {
    const m = morro(0, 0, -1);
    escarpeN.push(m.alto);
    derrubioN.push(m.bajo);
  }
  if (loma) {
    const f0 = filo(0);
    const r0 = rotura(0);
    const p0 = pie(0);
    const ur = (r0 - f0) / Math.max(0.01, p0 - f0);
    // El corte norte: `u` = 0 en el filo y 1 en el pie. En pantalla baja del
    // filo al pie en un hombro convexo (`sy`), por encima de la recta de antes;
    // en el mundo, eso es la cara dando la vuelta hacia el fondo (`y` < 0).
    const zDe = (u: number): number =>
      u < ur ? alto(0) - (alto(0) - zRot(0)) * (u / ur) : zRot(0) * ((1 - u) / (1 - ur)) ** 1.4;
    const sy = (u: number): number => -alto(0) * Math.cos((PI * u) / 2) ** 0.7;
    const norte = (u: number): number => Math.min(0, sy(u) + zDe(u));
    const xDe = (u: number) => f0 + (p0 - f0) * u;
    for (let k = 1; k < 6; k++) {
      const u = ur * (1 - k / 6);
      escarpeN.push([X(xDe(u)), norte(u), zDe(u)]);
    }
    // Al pie, el derrame se abre algo más y se deshace en el suelo.
    for (let k = 0; k <= 8; k++) {
      const u = 1 - (1 - ur) * (k / 8);
      derrubioN.push([
        X(xDe(u) + 0.05 * (1 - k / 8)),
        norte(u) - 0.05 * Math.sin(PI * u) ** 2,
        zDe(u),
      ]);
    }
  }
  if (fin) {
    const m = morro(pasos, L, 1);
    escarpeS.push(m.alto);
    const pl = pie(pasos);
    derrubioS.push(
      m.bajo,
      [X(pl * 0.35), L + CONO * 0.55, 0],
      [X(pl * 0.6), L + CONO, 0],
      [X(pl * 0.88), L + CONO * 0.7, 0],
    );
  }
  g.poligono(
    [...escarpeN, ...escarpe, ...escarpeS, ...[...derrubio].reverse()],
    sombra ? SOMBRA : FRENTE,
  );
  g.poligono([...derrubioN, ...derrubio, ...derrubioS, ...[...pies].reverse()], DERRUBIO);
  // Canales de piedra suelta que bajan por el escarpe en diagonal (la línea de
  // máxima pendiente) y lo parten en contrafuertes: en esta proyección los
  // estratos de una ladera al este salen verticales, y un escarpe alto sin
  // cortes se pintaba en columnas (caída 3 de la primera tanda).
  for (let k = 0; k < niveles - 1 + (niveles === 3 ? 1 : 0); k++) {
    const t = 0.2 + 0.6 * ((k + 0.5 + (azar() - 0.5) * 0.6) / (niveles === 3 ? 3 : 1));
    const i = Math.round(t * pasos);
    const y = yDe(t);
    const ancho = 0.07 + azar() * 0.04;
    const f = filo(i);
    const r = rotura(i);
    const h = alto(i);
    const zr = zRot(i);
    const medio = (k: number) => f + (r - f) * k;
    g.poligono(
      [
        [X(f + 0.04), y, h - 0.05],
        [X(medio(0.5)), y - ancho * 0.45, h - (h - zr) * 0.5],
        [X(r), y - ancho, zr],
        [X(r + 0.04), y + ancho * 0.2, zr * 0.9],
        [X(r + 0.02), y + ancho * 1.2, zr],
        [X(medio(0.55)), y + ancho * 0.55, h - (h - zr) * 0.55],
      ],
      DERRUBIO,
    );
  }

  // Matas sueltas en la meseta, junto al filo: nunca una franja.
  for (let k = 0; k < 3 * L; k++) {
    const t = 0.1 + 0.8 * azar();
    const i = Math.round(t * pasos);
    mata(g, X(filo(i) - 0.03 - azar() * 0.1), yDe(t), alto(i), 0.03 + azar() * 0.03, azar);
  }

  // Bloques: sueltos por el derrubio y amontonados al pie, de tamaños muy
  // distintos y nunca en fila; de atrás adelante. En el cono, unos cuantos más.
  const bloques: { x: number; y: number; r: number; h: number; z: number }[] = [];
  const n = Math.round(3 * L + niveles);
  for (let k = 0; k < n; k++) {
    const t = 0.08 + 0.84 * azar();
    const i = Math.round(t * pasos);
    const enPie = azar() < 0.6;
    const r = enPie ? 0.04 + azar() * 0.06 : 0.03 + azar() * 0.04;
    const x = enPie ? pie(i) - 0.02 + azar() * 0.1 : rotura(i) + (pie(i) - rotura(i)) * azar();
    const z = enPie ? 0 : zRot(i) * (1 - (x - rotura(i)) / Math.max(0.01, pie(i) - rotura(i)));
    bloques.push({ x: X(x), y: yDe(t), r, h: r * (0.7 + azar() * 0.6), z });
  }
  if (fin)
    for (let k = 0; k < 3; k++) {
      const r = 0.04 + azar() * 0.05;
      bloques.push({
        x: X(d * (0.3 + azar() * 0.5)),
        y: L + CONO * (0.3 + azar() * 0.5),
        r,
        h: r * 0.8,
        z: 0,
      });
    }
  for (const b of bloques.sort((u, v) => u.y - v.y))
    bloque(g, b.x, b.y, b.r, b.h, b.z, azar, sombra);
}

/** Las juntas y la caja de una pieza, en píxeles de la guía, con el origen ya puesto. */
function geometria(
  g: Guia,
  p: Pieza,
  niveles: Niveles,
  s: 1 | -1,
  caja: GeometriaDeLadera['caja'],
): GeometriaDeLadera {
  const H = niveles * NIVEL;
  const d = TALUD_DE_LADERA[niveles];
  const r = (q: P2): P2 => [Math.round(q[0]), Math.round(q[1])];
  return {
    nombre: p.nombre,
    largo: p.largo,
    niveles,
    filoNorte: r(g.p([0, 0, H])),
    pieNorte: r(g.p([s * d, 0, 0])),
    filoSur: r(g.p([0, p.largo, H])),
    pieSur: r(g.p([s * d, p.largo, 0])),
    caja,
  };
}

/**
 * La guía de una hoja: las piezas en filas de cuatro, con el pie de cada fila
 * en la misma línea y la casilla tan grande como quepa.
 */
export function guiaDeLaderas(
  lado: Lado,
  niveles: Niveles,
): { guia: Guia; piezas: GeometriaDeLadera[]; casilla: number } {
  const s: 1 | -1 = lado === 'este' ? 1 : -1;
  const nombres = PIEZAS_DE_LADERA[niveles];
  const filas = Math.ceil(nombres.length / 4);
  const [ancho, alto] = LIENZO[niveles];
  // Lo que mide cada pieza a una casilla de 1 px.
  const medidas = nombres.map((nombre) => {
    const m = new Guia(ancho, alto, 1, 0, 0);
    dibujarPieza(m, pieza(nombre), niveles, s);
    return { nombre, ...m.caja };
  });
  const HUECO = niveles === 3 ? 0.3 : 0.42;
  const filasDe = Array.from({ length: filas }, (_, f) => medidas.slice(f * 4, f * 4 + 4));
  const anchos = filasDe.map((fila) => fila.reduce((a, m) => a + (m.x1 - m.x0), 0) + HUECO * 5);
  const altos = filasDe.map((fila) => Math.max(...fila.map((m) => m.y1 - m.y0)));
  const t = Math.floor(
    Math.min(
      ancho / Math.max(...anchos),
      (alto - 0) / (altos.reduce((a, b) => a + b, 0) + HUECO * (filas + 1)),
    ),
  );
  const g = new Guia(ancho, alto, t, 0, 0);
  const piezas: GeometriaDeLadera[] = [];
  let techo = (alto - t * (altos.reduce((a, b) => a + b, 0) + HUECO * (filas - 1))) / 2;
  filasDe.forEach((fila, f) => {
    const suelo = techo + (altos[f] as number) * t;
    const libre = (ancho - t * fila.reduce((a, m) => a + (m.x1 - m.x0), 0)) / (fila.length + 1);
    let x = libre;
    for (const m of fila) {
      // El origen de la pieza: su caja empieza en `x` y su fondo en `suelo`.
      g.ox = x - m.x0 * t;
      g.oy = suelo - m.y1 * t;
      // La caja de esta pieza sola: se mide con una guía aparte en el mismo sitio.
      const sola = new Guia(ancho, alto, t, g.ox, g.oy);
      dibujarPieza(sola, pieza(m.nombre), niveles, s);
      dibujarPieza(g, pieza(m.nombre), niveles, s);
      piezas.push(
        geometria(g, pieza(m.nombre), niveles, s, [
          Math.round(sola.caja.x0),
          Math.round(sola.caja.y0),
          Math.round(sola.caja.x1),
          Math.round(sola.caja.y1),
        ]),
      );
      x += (m.x1 - m.x0) * t + libre;
    }
    techo = suelo + HUECO * t;
  });
  return { guia: g, piezas, casilla: t };
}

// ------------------------------------------------------------- los encargos

/**
 * La roca de cada material, con el color de su pared frontal (`paredes-*`, que
 * va de referencia de material) para que casen en la esquina.
 */
export const MATERIAL: Readonly<Record<Material, string>> = {
  roca: 'roca gris pizarra con musgo oliva oscuro, del color de las paredes de la imagen 3',
  arenisca:
    'arenisca rojiza y ocre en estratos, del color de las paredes de la imagen 3, apagada y polvorienta, con bloques caídos',
  basalto:
    'basalto negro y gris muy oscuro, del color de las paredes de la imagen 3, con alguna grieta de brasa anaranjada muy escasa y derrubio negro',
  nevadas:
    'roca gris oscura y fría, del color de las paredes de la imagen 3, con nieve sucia en el filo, en las repisas y entre los bloques del derrubio',
};

/** El suelo de la meseta de cada material: lo que el labio y las matas no pueden desentonar. */
export const MESETA: Readonly<Record<Material, string>> = {
  roca: 'un prado de hierba corta verde oliva OSCURO y apagado',
  arenisca: 'arena parda rojiza apagada',
  basalto: 'ceniza y tierra negra con brasas',
  nevadas: 'nieve gris azulada en sombra',
};

const LUZ_DEL_LADO: Readonly<Record<Lado, string>> = {
  este: 'La ladera mira al ESTE (a la derecha de la imagen) y la luz viene de arriba a la IZQUIERDA: el escarpe queda en penumbra, con la luz rozando solo las aristas de las losas y el filo; el derrubio, más tendido, recibe algo más de luz.',
  oeste:
    'La ladera mira al OESTE (a la izquierda de la imagen) y la luz viene de arriba a la izquierda: la ladera recibe la luz de lleno y es lo más iluminado de cada módulo; las sombras propias de las grietas y de los bloques caen hacia la derecha y hacia abajo. Es otra pieza distinta, no el reflejo de una ladera al este.',
};

/** El `inicio` de caída 3, como se pintó su hoja (el nuevo, con loma, solo en caída 1 y 2). */
const INICIO_DE_TRES =
  'INICIO (una casilla): donde empieza el risco, en la esquina de la meseta. Por ARRIBA la ladera dobla la esquina: el filo se curva hacia la meseta y la ladera termina en un MORRO redondeado de roca rota que se hunde en su propio derrubio, sin ninguna cara plana ni bloque cuadrado y sin lengua ni losa que salga hacia la meseta; por abajo, abierta como los tramos.';

const NOMBRES_DICHOS: Readonly<Record<string, string>> = {
  inicio:
    'INICIO (una casilla): donde empieza el risco. Por ARRIBA NO acaba en punta, pico, aguja ni arista afilada: la ladera da la vuelta en un MORRO ANCHO Y REDONDEADO, como el hombro de una loma, algo más bajo que el filo de los tramos, y por ese lado la roca se deshace en un derrame de piedras y tierra que se funde con el suelo. La silueta de arriba es la curva suave y abombada de la guía. Sin cara plana, bloque cuadrado, lengua ni losa hacia la meseta; por abajo, abierta como los tramos.',
  'medio-a':
    'TRAMO con un ENTRANTE (una casilla): el filo muerde la meseta en una vaguada y por el pie sale un cono de derrubio.',
  'medio-b':
    'TRAMO con un ESPOLÓN (una casilla): un contrafuerte de roca que sobresale, el filo y el pie hacia fuera.',
  'medio-c': 'TRAMO en S suave (una casilla): el filo sale y luego entra.',
  'largo-a': 'TRAMO LARGO (DOS casillas, el doble de largo): un espolón y después un entrante.',
  'largo-b': 'TRAMO LARGO (DOS casillas): entrante, espolón y entrante.',
  fin: 'FIN (una casilla): donde se acaba el risco. Por ABAJO la ladera dobla redondeada en un morro y se DERRAMA en un cono de derrubio, piedras y bloques que se deshacen en el suelo, sin ningún corte recto; por arriba, abierta como los tramos.',
  esquina:
    'ESQUINA (una casilla): la ladera baja del fondo y, abajo, dobla redondeada en un trozo corto de pared FRONTAL que mira a la cámara, con el color, el relieve y el detalle de las paredes de la imagen 3 (ahí puede verse la roca como en ellas), nunca una losa lisa, sin junta entre las dos: es la misma roca doblando la esquina. Por ARRIBA, abierta como los tramos; el extremo de la frontal, abierto también: sigue en otros módulos frontales.',
};

export function encargoDeLaderas(material: Material, lado: Lado, niveles: Niveles): Encargo {
  const nombres = PIEZAS_DE_LADERA[niveles];
  const hacia = lado === 'este' ? 'la DERECHA' : 'la IZQUIERDA';
  const arriba = lado === 'este' ? 'izquierda' : 'derecha';
  const meseta = lado === 'este' ? 'IZQUIERDA' : 'DERECHA';
  const filas = Math.ceil(nombres.length / 4);
  const orden = nombres
    .map(
      (n, i) =>
        `${filas > 1 ? `fila ${Math.floor(i / 4) + 1}, ` : ''}columna ${(i % 4) + 1}: ${n === 'inicio' && niveles === 3 ? INICIO_DE_TRES : (NOMBRES_DICHOS[n] ?? n)}`,
    )
    .join('\n');
  return {
    id: `modulos-laderas-${material}-${lado}-${niveles}`,
    tipo: 'modulos',
    descripcion: [
      `Una hoja de ${nombres.length} módulos de LADERA DE RISCO VISTA DE LADO para el mapa de aventura de un juego de estrategia: el borde de una meseta que cae ${niveles === 1 ? 'UN nivel' : niveles === 2 ? 'DOS niveles' : 'TRES niveles'} hacia el ${lado.toUpperCase()}, de ${MATERIAL[material]}. La forma de las piedras, rotas y angulosas, es la de los peñascos de la imagen 2. El risco corre de delante a atrás: el filo de la meseta, arriba a la ${arriba}, cae hacia ${hacia}.`,
      'CADA MÓDULO ES UN TROZO CORTADO DE UN MISMO RISCO LARGO Y CONTINUO. Se ponen uno debajo de otro, en cualquier orden, y tienen que leerse como una sola ladera natural, sin juntas: por eso los extremos de arriba y de abajo de cada tramo están CORTADOS LIMPIOS por la diagonal que marca la guía, sin cerrarse, sin redondearse, sin rematar en una mata, un pilar ni un bloque; la roca y el derrubio siguen hasta el corte como si continuaran fuera de la imagen.',
      'NADA DE BORDES RECTOS: el filo de la meseta y el pie de la ladera GIRAN como marca la guía, con entrantes, espolones y vaguadas, y su contorno se rompe en salientes de roca, repisas y bloques. Ninguna línea recta ni vertical larga.',
      `La ladera es un TALUD NATURAL, no un muro: arriba, bajo el filo, un escarpe de losas y estratos ROTOS, desplazados y agrietados, partido por canales de piedra suelta que bajan en diagonal (lo gris medio que cruza lo oscuro en la guía) y con repisas con algo de musgo; abajo, un derrubio de piedras y bloques angulosos de tamaños muy distintos que se abre hacia el pie. NUNCA columnas, prismas, pilares, órganos ni bloques apilados como sillares${niveles === 3 ? ', tampoco en este escarpe alto, ni losas largas y lisas tendidas en diagonal: losas cortas, rotas y de tamaños distintos' : ''}, y nada asoma por encima del filo.`,
      `ENCIMA DEL FILO NO HAY NINGUNA FRANJA NI CINTA: la meseta, ${MESETA[material]}, la pone el juego. Solo el labio de roca del filo (la línea gris clara de la guía), estrecho y roto, y unas pocas matas sueltas y pequeñas de color apagado que se meten en la meseta (los borrones claros de la guía); entre ellas, transparente. Nada de verde amarillo ni de colores vivos.`,
      `LA SILUETA DE CADA MÓDULO ES LA DE LA GUÍA (imagen 4), CALCADA: mismo sitio, mismo alto y mismo ancho, sin tumbarla ni ensancharla. Lo gris oscuro es el escarpe, lo gris medio el derrubio y los canales, los polígonos claros, bloques. El filo baja CASI VERTICAL en la imagen, ondulando como en la guía; el talud es ESTRECHO, del ancho de la guía; los cortes de arriba y de abajo son las diagonales de la guía.`,
      `A LA ${meseta} DEL FILO NO HAY NADA: es la meseta. El módulo NO es una cresta ni un muro con dos caras: no pintes roca, pared ni sombra a la ${meseta.toLowerCase()} del labio; ahí la imagen es transparente.`,
      orden,
      'Al pie, los bloques angulosos y medio enterrados, amontonados de forma irregular; nunca bolas redondas ni piedras en fila.',
      LUZ_DEL_LADO[lado],
      ESTILO_DEL_MAPA,
    ].join('\n'),
    referencias: [
      { ruta: REFERENCIA_DE_MAPAS, papel: 'estilo' },
      // La forma, de los peñascos: con `paredes-roca` de identidad la primera
      // prueba (07-10-2026) volvió a salir en columnas apiladas. El color, de la
      // frontal de su material, como referencia de material (sin su forma).
      { ruta: 'assets/mapa/modulos/rocas-caidas.webp', papel: 'identidad' },
      { ruta: `assets/mapa/modulos/paredes-${material}.webp`, papel: 'material' },
      { ruta: `${DIR_GUIAS}/laderas-${lado}-${niveles}.png`, papel: 'guia' },
    ],
    salida: `assets/mapa/modulos/laderas-${material}-${lado}-${niveles}`,
    fondo: 'transparente',
    cuantos: nombres.length,
    nombres: [...nombres],
  };
}

export const NIVELES: readonly Niveles[] = [1, 2, 3];

export function encargosDeLaderas(): Encargo[] {
  const lados: Lado[] = ['este', 'oeste'];
  return MATERIALES.flatMap((m) =>
    lados.flatMap((l) => NIVELES.map((n) => encargoDeLaderas(m, l, n))),
  );
}

/** Escribe la guía de cada hoja y su geometría (`laderas-<lado>-<niveles>.json`). */
export async function escribirGuiasDeLaderas(): Promise<string[]> {
  const escritas: string[] = [];
  for (const lado of ['este', 'oeste'] as const)
    for (const n of NIVELES) {
      const { guia, piezas, casilla } = guiaDeLaderas(lado, n);
      const nombre = `laderas-${lado}-${n}`;
      const png = await sharp(Buffer.from(guia.svg())).png().toBuffer();
      await writeFile(join(RAIZ, DIR_GUIAS, `${nombre}.png`), png);
      await writeFile(
        join(RAIZ, DIR_GUIAS, `${nombre}.json`),
        `${JSON.stringify({ ancho: guia.ancho, alto: guia.alto, casilla, talud: TALUD_DE_LADERA[n], labio: LABIO, piezas }, null, 1)}\n`,
      );
      escritas.push(`${DIR_GUIAS}/${nombre}.png`);
    }
  return escritas;
}

/**
 * Su papel en la cadena (`JuntasDeLadera.papel`): los tramos de una casilla
 * van en medio y los de dos son largos; los demás rematan o doblan.
 */
export function papelDe(p: Pieza): PapelDeLadera {
  if (p.clase !== 'tramo') return p.clase;
  return p.largo === 2 ? 'largo' : 'medio';
}

/** La guía de una hoja de laderas: `laderas-roca-este-1` sale de `laderas-este-1`. */
export function guiaDeHoja(hoja: string): string {
  if (!esHojaDeLadera(hoja))
    throw new Error(`«${hoja}» no es una hoja de laderas (laderas-<material>-<lado>-<1|2|3>)`);
  const [, , lado, niveles] = hoja.split('-');
  return `laderas-${lado}-${niveles}`;
}

/**
 * Apunta en el índice de cada hoja de laderas (`assets/mapa/modulos/<hoja>.json`)
 * las juntas de cada módulo (`JuntasDeLadera`): dónde caen, en píxeles del
 * módulo, el filo de la junta norte y el pie de la sur de su pieza de la guía
 * (`registrarLadera`), cuántas casillas cubre y su papel en la cadena.
 * `componer` coloca y encadena cada módulo por eso.
 *
 * Se escribe una vez, como el ancla de un puente, porque registrar cuesta
 * ~0,35 s por módulo (70 s las 24 hojas). Lo comprueba `test/laderas.test.ts`:
 * el sha256 de cada módulo sigue siendo el que se midió, y un módulo se vuelve
 * a registrar.
 *
 *   pnpm taller derivar-laderas [laderas-roca-este-1 …]
 */
export async function escribirLaderasDerivadas(hojas?: readonly string[]): Promise<string[]> {
  const dir = join(RAIZ, 'assets/mapa/modulos');
  const todas =
    hojas ?? encargosDeLaderas().map((e) => e.salida.replace(/^assets\/mapa\/modulos\//, ''));
  const escritas: string[] = [];
  for (const hoja of todas) {
    const guia = join(RAIZ, DIR_GUIAS, guiaDeHoja(hoja));
    const geometrias = (
      JSON.parse(await readFile(`${guia}.json`, 'utf8')) as { piezas: GeometriaDeLadera[] }
    ).piezas;
    const mascara = await mascaraDeGuia(`${guia}.png`);
    const ruta = join(dir, `${hoja}.json`);
    const indice = JSON.parse(await readFile(ruta, 'utf8')) as {
      modulos: { imagen: string; ladera?: JuntasDeLadera }[];
    };
    for (const mod of indice.modulos) {
      const nombre = mod.imagen.replace(/\.webp$/, '');
      const geometria = geometrias.find((p) => p.nombre === nombre);
      if (geometria === undefined)
        throw new Error(`${hoja}: la guía no tiene la pieza «${nombre}»`);
      const p = pieza(nombre);
      const { filo, pie } = await registrarLadera(join(dir, hoja, mod.imagen), mascara, geometria);
      mod.ladera = { filo, pie, largo: p.largo, papel: papelDe(p) };
    }
    await writeFile(ruta, `${JSON.stringify(indice, null, 2)}\n`);
    escritas.push(ruta.replace(`${RAIZ}/`, ''));
  }
  return escritas;
}
