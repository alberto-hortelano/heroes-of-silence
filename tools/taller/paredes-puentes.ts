/**
 * Paredes de acantilado vistas de lado y puentes que casan con el río
 * (`docs/art/peticiones.md` §16 y §17).
 *
 * Lo que las piezas de antes no consiguieron con palabras es la ORIENTACIÓN: el
 * puente `ancho` salió torcido 20° y el `hondo` en escorzo. Así que cada encargo
 * lleva, además del estilo y del material, una **guía de geometría**
 * (`papel: 'guia'`): un volumen gris dibujado con la proyección del mapa —el
 * suelo en casillas cuadradas y lo alto hacia arriba de pantalla, un nivel
 * (`ALTO_DE_NIVEL`) = 0,6 casillas—, que dice dónde va cada cosa. Las guías se
 * escriben aquí (SVG → PNG con sharp), en `assets/mapa/guias/`, y la geometría
 * de cada una se guarda en su `.json`: de ahí sale el ancla del puente (el
 * centro del tablero) y cuántos píxeles mide una casilla en la pieza pintada.
 *
 *   pnpm taller encolar --paredes-puentes [--solo=puente-piedra-ns,laterales-roca-este]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { derivarPieza } from './derivar.js';
import type { Encargo } from './encargo.js';
import { ESTILO_DEL_MAPA, REFERENCIA_DE_MAPAS } from './mapa-denso.js';

const RAIZ = resolve(import.meta.dirname, '../..');
export const DIR_GUIAS = 'assets/mapa/guias';

/** Lo que mide en pantalla un nivel de altura, en casillas (`ALTO_DE_NIVEL` del escenógrafo). */
const NIVEL = 0.6;

// ------------------------------------------------------------------ la guía

type P2 = readonly [number, number];
type P3 = readonly [number, number, number];

/** Un lienzo de guía: casilla de `t` px y el origen del mundo en `(ox, oy)`. */
class Guia {
  private readonly capas: string[] = [];
  /** La caja de lo dibujado, en píxeles: para encajar la guía en su lienzo (`encajar`). */
  readonly caja = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  constructor(
    readonly ancho: number,
    readonly alto: number,
    public t: number,
    /** El origen del mundo; una hoja de módulos lo mueve de celda en celda. */
    public ox: number,
    public oy: number,
  ) {}
  /** Lo que sube el terreno bajo un punto: un puente entre orillas a distinto nivel. */
  subida: (x: number, y: number) => number = () => 0;
  /** Entre qué alturas se reparte la subida: el pie no sube, el tablero sube entero. */
  rangoDeSubida: readonly [number, number] = [0, 1];
  /** La proyección del mapa: el suelo tal cual, lo alto hacia arriba. */
  p([x, y, z]: P3): P2 {
    const [z0, z1] = this.rangoDeSubida;
    const k = Math.min(1, Math.max(0, (z - z0) / (z1 - z0)));
    return [this.ox + x * this.t, this.oy + (y - z - k * this.subida(x, y)) * this.t];
  }
  private medir(x: number, y: number): void {
    this.caja.x0 = Math.min(this.caja.x0, x);
    this.caja.y0 = Math.min(this.caja.y0, y);
    this.caja.x1 = Math.max(this.caja.x1, x);
    this.caja.y1 = Math.max(this.caja.y1, y);
  }
  poligono(puntos: readonly P3[], relleno: string): void {
    const pp = puntos.map((q) => this.p(q));
    for (const [x, y] of pp) this.medir(x, y);
    const d = pp.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' ');
    this.capas.push(
      `<polygon points="${d}" fill="${relleno}" stroke="#262626" stroke-width="2" stroke-linejoin="round"/>`,
    );
  }
  elipse(c: P3, rx: number, ry: number, relleno: string): void {
    const [x, y] = this.p(c);
    this.medir(x - rx * this.t, y - ry * this.t);
    this.medir(x + rx * this.t, y + ry * this.t);
    this.capas.push(
      `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(rx * this.t).toFixed(1)}" ry="${(ry * this.t).toFixed(1)}" fill="${relleno}" stroke="#262626" stroke-width="2"/>`,
    );
  }
  svg(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.ancho}" height="${this.alto}"><rect width="100%" height="100%" fill="${FONDO}"/>${this.capas.join('')}</svg>`;
  }
}

/**
 * Dibuja dos veces: una a escala 1 para medir lo que ocupa, y otra con la
 * casilla y el origen que lo dejan centrado y ocupando el `lleno` del lienzo.
 */
function encajar(ancho: number, alto: number, lleno: number, dibujar: (g: Guia) => void): Guia {
  const m = new Guia(ancho, alto, 1, 0, 0);
  dibujar(m);
  const w = m.caja.x1 - m.caja.x0;
  const h = m.caja.y1 - m.caja.y0;
  const t = Math.floor(Math.min((ancho * lleno) / w, (alto * lleno) / h));
  const g = new Guia(
    ancho,
    alto,
    t,
    ancho / 2 - ((m.caja.x0 + m.caja.x1) / 2) * t,
    alto / 2 - ((m.caja.y0 + m.caja.y1) / 2) * t,
  );
  dibujar(g);
  return g;
}

const FONDO = '#7d7d7d';
/** Lo que mira arriba, lo que mira a la cámara (iluminado), y lo que queda en sombra. */
const ARRIBA = '#dcdcdc';
const FRENTE = '#b0b0b0';
const SOMBRA = '#5e5e5e';
const HUECO = '#2c2c2c';
const MATAS = '#c9cfbf';
/** La tierra del estribo (talud y rampa): parda, para que no se lea como sillar. */
const TIERRA = '#9a9080';
const RAMPA = '#bdb4a2';
/** Las dovelas del arco, más claras que el paramento. */
const ANILLO = '#cbcbcb';
const MADERA = '#cfc6b8';

/** Un peñasco: su sombra de cara y su tapa, para las piedras del río y el pie de la pared. */
function penasco(g: Guia, x: number, y: number, r: number, alto: number, z = 0): void {
  g.elipse([x, y + r * 0.2, z + alto * 0.45], r, r * 0.55 + alto * 0.45, FRENTE);
  g.elipse([x, y - r * 0.05, z + alto], r * 0.85, r * 0.5, ARRIBA);
}

// ---------------------------------------------------------------- los puentes

export type Eje = 'ns' | 'eo' | 'ne-so' | 'no-se';
export type Clase = 'piedra' | 'troncos';

/**
 * Medidas del puente, en casillas: la luz es UNA casilla de agua y el arco la
 * salva entera, de orilla a orilla (06-10-2026: «los arcos deben ser más
 * grandes»). `rampa` es lo que baja la tierra del estribo desde el final de la
 * fábrica hasta el suelo, y `talud`, lo que se abre a cada lado.
 */
const PUENTE = {
  piedra: {
    largo: 2.2,
    ancho: 0.56,
    tablero: 0.4,
    pretil: 0.12,
    luz: 1,
    agua: -0.2,
    rampa: 0.38,
    talud: 0.42,
  },
  troncos: {
    largo: 1.8,
    ancho: 0.5,
    tablero: 0.24,
    pretil: 0,
    luz: 1,
    agua: -0.2,
    rampa: 0.3,
    talud: 0.32,
  },
} as const;

/**
 * La geometría que cuenta del dibujo de la guía: el centro del tablero y la
 * casilla, en píxeles de la guía. Con esto y la caja de lo pintado se llega al
 * ancla y la escala de la pieza.
 */
export interface GeometriaDeGuia {
  readonly ancho: number;
  readonly alto: number;
  /** El centro del tablero, en píxeles de la guía. */
  readonly centro: P2;
  readonly casilla: number;
  /** La caja de lo dibujado, en píxeles de la guía. */
  readonly caja: readonly [number, number, number, number];
}

/** Gira el plano del suelo: el puente se dibuja a lo largo de `u` y se coloca según el eje. */
function base(eje: Eje): { u: P2; v: P2 } {
  const s = Math.SQRT1_2;
  switch (eje) {
    case 'eo':
      return { u: [1, 0], v: [0, 1] };
    case 'ns':
      return { u: [0, 1], v: [1, 0] };
    // NE-SO: del suroeste (abajo a la izquierda) al noreste (arriba a la derecha).
    case 'ne-so':
      return { u: [s, -s], v: [s, s] };
    // NO-SE: del noroeste (arriba a la izquierda) al sureste (abajo a la derecha).
    case 'no-se':
      return { u: [s, s], v: [-s, s] };
  }
}

/** Un punto del puente en coordenadas propias (a lo largo, a lo ancho, alto) llevado al mapa. */
function enMapa(eje: Eje, a: number, b: number, z: number): P3 {
  const { u, v } = base(eje);
  return [a * u[0] + b * v[0], a * u[1] + b * v[1], z];
}

/**
 * Un prisma bajo un rectángulo del puente: su tapa y las caras laterales que
 * miran hacia la cámara (con componente sur), del alto `z0` al `z1`.
 */
function prisma(
  g: Guia,
  eje: Eje,
  a0: number,
  a1: number,
  b0: number,
  b1: number,
  z0: number,
  z1: number,
  tapa = ARRIBA,
): void {
  const esq: P3[] = [
    enMapa(eje, a0, b0, 0),
    enMapa(eje, a1, b0, 0),
    enMapa(eje, a1, b1, 0),
    enMapa(eje, a0, b1, 0),
  ];
  // Cada lado del rectángulo, si su normal mira al sur, enseña su cara.
  for (let i = 0; i < 4; i++) {
    const p = esq[i] as P3;
    const q = esq[(i + 1) % 4] as P3;
    const [e0, , e2] = esq as [P3, P3, P3, P3];
    const cx = (e0[0] + e2[0]) / 2;
    const cy = (e0[1] + e2[1]) / 2;
    const mx = (p[0] + q[0]) / 2 - cx;
    const my = (p[1] + q[1]) / 2 - cy;
    if (my <= 1e-6) continue;
    const luz = mx > 0.05 ? SOMBRA : FRENTE;
    g.poligono(
      [
        [p[0], p[1], z0],
        [q[0], q[1], z0],
        [q[0], q[1], z1],
        [p[0], p[1], z1],
      ],
      luz,
    );
  }
  g.poligono(
    esq.map(([x, y]) => [x, y, z1] as P3),
    tapa,
  );
}

/** Hacia dónde mira, en el mapa, la dirección (da, db) del puente: > 0, hacia la cámara. */
function haciaCamara(eje: Eje, da: number, db: number): number {
  return enMapa(eje, da, db, 0)[1];
}

/**
 * El estribo de TIERRA de una punta (`s` = ±1 a lo largo): la fábrica no se posa
 * en la orilla, nace de ella. A cada lado, un talud de tierra con piedras que
 * baja del costado del puente al suelo y, en la orilla, hasta el agua; y por la
 * punta, la rampa por la que se sube al tablero. Los bordes se deshacen en
 * matas y piedras sueltas (06-10-2026: «no veo cómo conectan con la tierra»).
 *
 * `zTablero` es el alto del tablero en esa punta, `zSuelo` el de la orilla y
 * `fin` dónde acaba la fábrica (a lo largo).
 */
function estribo(
  g: Guia,
  eje: Eje,
  clase: Clase,
  s: 1 | -1,
  zTablero: number,
  zSuelo: number,
  fin: number,
): { atras: (() => void)[]; delante: (() => void)[] } {
  const m = PUENTE[clase];
  const B = m.ancho / 2;
  const orilla = m.luz / 2;
  const R = m.rampa;
  const T = m.talud;
  const lomo = zTablero - (clase === 'piedra' ? 0.16 : 0.1);
  const atras: (() => void)[] = [];
  const delante: (() => void)[] = [];
  const P = (a: number, b: number, z: number) => enMapa(eje, s * a, b, z);
  // En la orilla alta, el talud no acaba en su suelo: baja hasta el agua, y es
  // el costado de la orilla lo que se ve bajo el puente.
  const zPie = zSuelo > 0 ? m.agua : zSuelo;
  for (const sb of [-1, 1] as const) {
    const talud = () => {
      g.poligono(
        [
          P(orilla, sb * B, lomo),
          P(fin, sb * B, zTablero),
          P(fin + R, sb * B * 0.75, zSuelo),
          P(fin + R * 0.45, sb * (B + T * 0.7), zPie),
          P(orilla + 0.3, sb * (B + T), zPie),
          P(orilla + 0.04, sb * (B + T * 1.05), Math.min(zSuelo, 0) + m.agua),
          P(orilla, sb * (B + T * 0.6), m.agua),
        ],
        TIERRA,
      );
      // Piedras al pie del talud, sobre todo en la orilla, y matas en el borde.
      penasco(g, ...xy(P(orilla + 0.07, sb * (B + T * 0.75), 0)), 0.09, 0.07, m.agua);
      penasco(g, ...xy(P(orilla + 0.22, sb * (B + T * 0.95), 0)), 0.07, 0.05, zSuelo);
      penasco(g, ...xy(P(fin - 0.05, sb * (B + T * 0.55), 0)), 0.06, 0.04, zSuelo);
      for (const [a, b] of [
        [orilla + 0.42, B + T * 0.98],
        [fin + R * 0.25, B + T * 0.62],
        [fin + R * 0.8, B * 0.95],
      ] as const)
        g.elipse(P(a, sb * b, zSuelo), 0.05, 0.03, MATAS);
    };
    (haciaCamara(eje, 0, sb) > 1e-6 ? delante : atras).push(talud);
  }
  const rampa = () => {
    g.poligono(
      [
        P(fin, -B, zTablero),
        P(fin, B, zTablero),
        P(fin + R, B * 0.75, zSuelo),
        P(fin + R, -B * 0.75, zSuelo),
      ],
      RAMPA,
    );
    g.elipse(P(fin + R + 0.04, 0, zSuelo), 0.06, 0.03, MATAS);
  };
  (haciaCamara(eje, s, 0) > 1e-6 ? delante : atras).push(rampa);
  return { atras, delante };
}

const xy = (q: P3): [number, number] => [q[0], q[1]];

/**
 * Un puente entre orillas a distinto nivel sube UN nivel de punta a punta: en
 * N-S la orilla alta es la del fondo (norte); en E-O, la del este.
 */
const SUBE: Partial<Record<Eje, (x: number, y: number, L: number) => number>> = {
  ns: (_x, y, L) => NIVEL * Math.min(1, Math.max(0, (L - y) / (2 * L))),
  eo: (x, _y, L) => NIVEL * Math.min(1, Math.max(0, (x + L) / (2 * L))),
};

/**
 * Los escalones del puente N-S que sube. Subiendo hacia el fondo, una rampa en
 * esta proyección solo alarga el tablero; un escalón, en cambio, enseña su
 * tabica, que mira al sur, a la cámara: cada escalón es una franja de sombra
 * cruzada en el tablero (06-10-2026: «casi no se distingue del llano»).
 */
const ESCALONES = 5;

function dibujarPuente(g: Guia, clase: Clase, eje: Eje, sube: boolean): number {
  const m = PUENTE[clase];
  const L = m.largo / 2;
  const B = m.ancho / 2;
  const luz = m.luz / 2;
  const subida = SUBE[eje];
  if (sube && subida === undefined) throw new Error(`no hay puente que suba en ${eje}`);
  const escalonado = sube && eje === 'ns';
  // El alto del tablero en cada punta: en N-S sube al norte (a < 0); en E-O, al este (a > 0).
  const altaEs: 1 | -1 = eje === 'ns' ? -1 : 1;
  const zTablero = (s: 1 | -1) => m.tablero + (sube && s === altaEs ? NIVEL : 0);
  const zSuelo = (s: 1 | -1) => (sube && s === altaEs ? NIVEL : 0);
  // La E-O que sube se tuerce entera (`subida`); la N-S sube por escalones.
  const torcer = () => {
    if (sube && !escalonado && subida !== undefined) {
      g.subida = (x, y) => subida(x, y, L);
      g.rangoDeSubida = [m.agua, m.tablero];
    }
  };
  const enderezar = () => {
    g.subida = () => 0;
  };
  const fin = clase === 'piedra' ? L : L - 0.08;
  const estribos = ([-1, 1] as const).map((s) =>
    estribo(g, eje, clase, s, zTablero(s), zSuelo(s), fin),
  );
  for (const e of estribos) for (const f of e.atras) f();

  if (clase === 'piedra') {
    if (escalonado) {
      // Tramo a tramo del norte (alto) al sur (bajo): cada uno tapa el pie del de detrás.
      const paso = (2 * L) / ESCALONES;
      for (let i = 0; i < ESCALONES; i++) {
        const a0 = -L + i * paso;
        const z = m.tablero + (NIVEL * (ESCALONES - 1 - i)) / (ESCALONES - 1);
        prisma(g, eje, a0, a0 + paso, -B, B, m.agua, z);
        for (const lado of [-1, 1]) {
          const b0 = lado < 0 ? -B : B - 0.07;
          prisma(g, eje, a0, a0 + paso, b0, b0 + 0.07, z, z + m.pretil);
        }
      }
      for (const [a, z] of [
        [-L, m.tablero + NIVEL],
        [L - 0.12, m.tablero],
      ] as const)
        for (const lado of [-1, 1]) {
          const b0 = lado < 0 ? -B - 0.015 : B - 0.085;
          prisma(g, eje, a, a + 0.12, b0, b0 + 0.1, z, z + m.pretil + 0.08);
        }
    } else {
      torcer();
      // El cuerpo entero, del agua al tablero, y el arco en la cara que se ve
      // (la del lado +B; en N-S no se ve ninguna): un medio punto que salva la
      // casilla de agua entera, con su anillo de dovelas.
      prisma(g, eje, -L, L, -B, B, m.agua, m.tablero);
      if (eje !== 'ns') {
        const arco = (r: number) => {
          const pasos = 20;
          const pts: P3[] = [];
          for (let i = 0; i <= pasos; i++) {
            const ang = (Math.PI * i) / pasos;
            pts.push(enMapa(eje, -r * Math.cos(ang), B, m.agua + r * Math.sin(ang)));
          }
          return pts;
        };
        g.poligono(arco(luz + 0.08), ANILLO);
        g.poligono(arco(luz), HUECO);
      }
      enderezar();
    }
    for (const e of estribos) for (const f of e.delante) f();
    if (!escalonado) {
      torcer();
      // Los pretiles y sus postes, de atrás adelante.
      const fondo = (a: number, b: number) => enMapa(eje, a, b, 0)[1];
      const piezas: { y: number; dibuja: () => void }[] = [];
      for (const lado of [-1, 1]) {
        const b0 = lado < 0 ? -B : B - 0.07;
        const b1 = lado < 0 ? -B + 0.07 : B;
        piezas.push({
          y: fondo(0, (b0 + b1) / 2),
          dibuja: () =>
            prisma(g, eje, -L + 0.06, L - 0.06, b0, b1, m.tablero, m.tablero + m.pretil),
        });
        for (const a of [-L, L - 0.12])
          piezas.push({
            y: fondo(a + 0.06, (b0 + b1) / 2) + 0.001,
            dibuja: () =>
              prisma(
                g,
                eje,
                a,
                a + 0.12,
                b0 - 0.015,
                b1 + 0.015,
                m.tablero,
                m.tablero + m.pretil + 0.08,
              ),
          });
      }
      for (const pz of piezas.sort((x, y) => x.y - y.y)) pz.dibuja();
      enderezar();
    }
  } else {
    // Troncos: un montón de piedras en medio del agua y los troncos encima, que
    // apoyan en los estribos de tierra de las orillas.
    const piedras: { x: number; y: number; r: number }[] = [];
    for (const [db, r] of [
      [-0.2, 0.13],
      [0.0, 0.17],
      [0.2, 0.14],
    ] as const) {
      const [x, y] = enMapa(eje, 0, db, 0);
      piedras.push({ x, y, r });
    }
    for (const pd of piedras.sort((p1, p2) => p1.y - p2.y))
      penasco(g, pd.x, pd.y, pd.r, 0.1, m.agua + 0.1);
    for (const e of estribos) for (const f of e.delante) f();
    // Cinco troncos TENDIDOS uno junto a otro: una balsa vista desde arriba.
    const n = 5;
    const troncos = Array.from({ length: n }, (_, i) => {
      const b0 = -B + (i * 2 * B) / n + 0.006;
      const b1 = -B + ((i + 1) * 2 * B) / n - 0.006;
      const corre = [0.05, -0.04, 0.07, -0.02, 0.03][i] as number;
      return { y: enMapa(eje, 0, (b0 + b1) / 2, 0)[1], b0, b1, corre };
    });
    for (const tr of troncos.sort((x, y) => x.y - y.y))
      prisma(g, eje, -L + tr.corre, L + tr.corre, tr.b0, tr.b1, m.tablero - 0.1, m.tablero, MADERA);
    // Dos travesaños atados encima, de través, cerca de cada punta: lo que
    // cose los troncos en un solo suelo.
    for (const a of [-L + 0.14, L - 0.22])
      prisma(g, eje, a, a + 0.08, -B - 0.04, B + 0.04, m.tablero, m.tablero + 0.06, MADERA);
  }
  // El alto del centro del tablero.
  return escalonado ? m.tablero + NIVEL / 2 : m.tablero;
}

function guiaDePuente(clase: Clase, eje: Eje, sube = false): { guia: Guia; geo: GeometriaDeGuia } {
  const [ancho, alto] = eje === 'eo' ? [1536, 1024] : eje === 'ns' ? [1024, 1536] : [1024, 1024];
  let zCentro = 0;
  const g = encajar(ancho, alto, 0.86, (h) => {
    zCentro = dibujarPuente(h, clase, eje, sube);
  });
  // El centro del tablero, con la subida de la E-O si la lleva.
  const subida = SUBE[eje];
  if (sube && eje === 'eo' && subida !== undefined) {
    const L = PUENTE[clase].largo / 2;
    g.subida = (x, y) => subida(x, y, L);
    g.rangoDeSubida = [PUENTE[clase].agua, PUENTE[clase].tablero];
  }
  const centro = g.p(enMapa(eje, 0, 0, zCentro));
  g.subida = () => 0;
  return {
    guia: g,
    geo: { ancho, alto, centro, casilla: g.t, caja: [0, 0, 0, 0] },
  };
}

// ----------------------------------------------------------- las paredes

export type Lado = 'este' | 'oeste';
export type Material = 'roca' | 'arenisca' | 'basalto' | 'nevadas';

/** Los módulos de una hoja lateral, en el orden de la rejilla de 4×2. */
export const PIEZAS_LATERALES = [
  'tramo-1-a',
  'tramo-1-b',
  'tramo-1-c',
  'esquina-1',
  'tramo-2-a',
  'tramo-2-b',
  'tramo-2-c',
  'esquina-2',
] as const;

/**
 * Un tramo lateral de un metro de risco que cae al ESTE (`s = 1`) o al OESTE
 * (`s = -1`): el borde de la meseta, la ladera de roca y peñascos al pie, a lo
 * largo de una casilla de norte a sur. La ladera no es vertical: en la
 * proyección del mapa una cara vertical que mira al este no se ve, así que cae
 * en talud (`d` casillas de ancho por nivel).
 */
function tramoLateral(g: Guia, s: 1 | -1, niveles: 1 | 2, largo: number, var_: number): void {
  const H = niveles * NIVEL;
  const d = (niveles === 1 ? 0.42 : 0.62) + var_ * 0.03;
  const y0 = -largo / 2;
  const y1 = largo / 2;
  const X = (x: number) => s * x;
  // La meseta: una franja de su borde, con matas.
  g.poligono(
    [
      [X(-0.24), y0, H],
      [X(0), y0, H],
      [X(0), y1, H],
      [X(-0.24), y1, H],
    ],
    MATAS,
  );
  // La ladera: del filo (x = 0, alto H) al pie (x = d, alto 0).
  g.poligono(
    [
      [X(0), y0, H],
      [X(0), y1, H],
      [X(d), y1, 0],
      [X(d), y0, 0],
    ],
    s > 0 ? SOMBRA : FRENTE,
  );
  // Peñascos al pie.
  for (const [k, r] of [
    [0.12, 0.11],
    [0.45, 0.14],
    [0.8, 0.1],
  ] as const) {
    const y = y0 + (k + var_ * 0.05) * largo;
    penasco(g, X(d + 0.04), y, r, 0.08);
  }
}

/**
 * La esquina donde la caída gira: la pared FRONTAL (mira a la cámara, como los
 * módulos `paredes-*`) por un lado y la lateral subiendo hacia el fondo por el
 * otro. Al este, la frontal queda a la izquierda; al oeste, a la derecha.
 */
function esquinaLateral(g: Guia, s: 1 | -1, niveles: 1 | 2): void {
  const H = niveles * NIVEL;
  const d = niveles === 1 ? 0.42 : 0.62;
  const e = 0.12;
  const X = (x: number) => s * x;
  const yS = 0.35; // el borde sur de la meseta
  const yN = yS - 0.85; // hasta dónde sube la lateral
  const xW = -0.85; // hasta dónde corre la frontal
  // La meseta, en L.
  g.poligono(
    [
      [X(xW), yS - 0.24, H],
      [X(-0.24), yS - 0.24, H],
      [X(-0.24), yN, H],
      [X(0), yN, H],
      [X(0), yS, H],
      [X(xW), yS, H],
    ],
    MATAS,
  );
  // La frontal: casi vertical, mira al sur.
  g.poligono(
    [
      [X(xW), yS, H],
      [X(0), yS, H],
      [X(d * 0.5), yS + e, 0],
      [X(xW), yS + e, 0],
    ],
    FRENTE,
  );
  // La lateral, en talud.
  g.poligono(
    [
      [X(0), yN, H],
      [X(0), yS, H],
      [X(d * 0.5), yS + e, 0],
      [X(d), yS - 0.1, 0],
      [X(d), yN, 0],
    ],
    s > 0 ? SOMBRA : FRENTE,
  );
  for (const [x, y, r] of [
    [-0.6, yS + e + 0.03, 0.09],
    [-0.25, yS + e + 0.05, 0.1],
    [d * 0.7, yS + 0.02, 0.11],
    [d + 0.06, yS - 0.45, 0.09],
  ] as const)
    penasco(g, X(x), y, r, 0.06);
}

function guiaDeParedes(lado: Lado): Guia {
  const s: 1 | -1 = lado === 'este' ? 1 : -1;
  const ancho = 1536;
  const alto = 1024;
  const t = 190;
  const g = new Guia(ancho, alto, t, 0, 0);
  PIEZAS_LATERALES.forEach((nombre, i) => {
    const col = i % 4;
    const fila = Math.floor(i / 4);
    const cx = (col + 0.5) * (ancho / 4);
    const pie = (fila + 0.86) * (alto / 2);
    const niveles: 1 | 2 = nombre.endsWith('-2') || nombre.startsWith('tramo-2') ? 2 : 1;
    const esquina = nombre.startsWith('esquina');
    // El origen de cada celda, para que la pieza quede centrada y con el pie en `pie`.
    g.ox = esquina ? cx + s * 0.2 * t : cx - s * 0.15 * t;
    g.oy = esquina ? pie - (0.35 + 0.12) * t : pie - 0.55 * t;
    if (esquina) esquinaLateral(g, s, niveles);
    else tramoLateral(g, s, niveles, 1, col);
  });
  return g;
}

// ------------------------------------------------------------- los encargos

const MATERIAL: Readonly<Record<Material, string>> = {
  roca: 'roca gris columnar con musgo, el borde de arriba cubierto de matas y rocas caídas al pie',
  arenisca:
    'arenisca roja estriada en estratos, el borde de arriba irregular y bloques caídos al pie',
  basalto: 'basalto negro en columnas, con alguna grieta de brasa y piedras negras al pie',
  nevadas: 'roca oscura con nieve en el borde de arriba y en los salientes, y rocas nevadas al pie',
};

const LUZ_DEL_LADO: Readonly<Record<Lado, string>> = {
  este: 'La ladera mira al ESTE (a la derecha de la imagen) y la luz viene de arriba a la IZQUIERDA: la ladera queda en penumbra, con la luz rozando solo los salientes y el filo de arriba; el borde de la meseta, a la izquierda, sí está iluminado.',
  oeste:
    'La ladera mira al OESTE (a la izquierda de la imagen) y la luz viene de arriba a la izquierda: la ladera recibe la luz de lleno y es lo más iluminado de cada módulo; las sombras propias de las grietas caen hacia la derecha.',
};

function encargoDeLaterales(material: Material, lado: Lado): Encargo {
  const hacia = lado === 'este' ? 'la DERECHA' : 'la IZQUIERDA';
  const arriba = lado === 'este' ? 'izquierda' : 'derecha';
  const frontal = lado === 'este' ? 'izquierda' : 'derecha';
  return {
    id: `modulos-laterales-${material}-${lado}`,
    tipo: 'modulos',
    descripcion: [
      `Una hoja de 8 módulos de RISCO VISTO DE LADO para el mapa de aventura de un juego de estrategia: el borde de una meseta que cae hacia el ${lado.toUpperCase()}, de ${MATERIAL[material]}. Es la misma pared de acantilado de los módulos de la imagen 2, pero corriendo de delante a atrás en vez de a lo ancho: el filo de la meseta, arriba a la ${arriba}, baja en una ladera de roca muy empinada hacia ${hacia}, y cada módulo es un trozo de UNA casilla de largo que encadena con el siguiente hacia el fondo (por arriba) y hacia delante (por abajo).`,
      'Fila 1: tres tramos que caen UN nivel (como los módulos de la imagen 2, de altura parecida) y una ESQUINA de un nivel. Fila 2: tres tramos que caen DOS niveles (el doble de altos) y una ESQUINA de dos niveles. Los tres tramos de cada fila tienen la misma forma y medidas, distintos solo en el detalle de la roca, para poder alternarlos.',
      `La esquina es donde la caída gira: a la ${frontal}, un trozo corto de pared de frente que mira a la cámara, exactamente como los módulos de la imagen 2, y la ladera lateral sale de ella y sube hacia el fondo, sin junta entre las dos: es la misma roca doblando la esquina.`,
      'La forma, el tamaño y el sitio de cada módulo los da la guía de geometría (imagen 3): el filo de la meseta es una línea recta VERTICAL en la imagen, la ladera ocupa la franja que marca la guía y el pie es otra vertical. Nada se tuerce ni se inclina hacia un lado: encadenados uno debajo de otro forman una pared recta de norte a sur.',
      // La primera tanda (06-10-2026) puso tres bolas en fila al pie y pilares
      // asomando por el filo, y en la nieve una ladera plana como una lámina.
      'Al pie, un pedregal IRREGULAR de bloques angulosos de tamaños distintos, amontonados contra la ladera y algo hundidos en el suelo, como al pie de los módulos de la imagen 2: nunca bolas redondas puestas en fila. Arriba, la roca termina a ras de la meseta, coronada por su borde (matas, o nieve), sin pilares que asomen por encima. La ladera tiene volumen —estratos, salientes, grietas y repisas—, no es una lámina plana.',
      LUZ_DEL_LADO[lado],
      ESTILO_DEL_MAPA,
    ].join('\n'),
    referencias: [
      { ruta: REFERENCIA_DE_MAPAS, papel: 'estilo' },
      {
        ruta: `assets/mapa/modulos/paredes-${material}.webp`,
        papel: 'identidad',
      },
      { ruta: `${DIR_GUIAS}/laterales-${lado}.png`, papel: 'guia' },
    ],
    salida: `assets/mapa/modulos/laterales-${material}-${lado}`,
    fondo: 'transparente',
    cuantos: 8,
    nombres: [...PIEZAS_LATERALES],
  };
}

const EJE_DICHO: Readonly<Record<Eje, string>> = {
  ns: 'de NORTE a SUR: el tablero va recto de abajo (delante, cerca de la cámara) arriba (al fondo), como una franja vertical en la imagen; el río corre a lo ancho por debajo. Se ve el tablero desde arriba, los dos pretiles y, delante, la rampa de tierra por la que se sube; a los dos lados de cada punta, los taludes de tierra y roca del estribo. Con esta cámara el arco queda DEBAJO del tablero y no se ve: nada de arcos ni bocas a los lados ni en los taludes, que son tierra y roca',
  eo: 'de OESTE a ESTE: el tablero va recto de izquierda a derecha, horizontal en la imagen; el río corre hacia el fondo por debajo. Se ve el tablero desde arriba y, de frente, el costado del puente con su gran arco sobre el agua, entre los dos estribos de tierra',
  'ne-so':
    'en DIAGONAL, del suroeste al noreste: el tablero va recto de abajo a la izquierda a arriba a la derecha, a 45 grados en la imagen; el río cruza por debajo en la otra diagonal. Se ve el tablero desde arriba y el costado de delante, con su gran arco entre los dos estribos de tierra',
  'no-se':
    'en DIAGONAL, del noroeste al sureste: el tablero va recto de arriba a la izquierda a abajo a la derecha, a 45 grados en la imagen; el río cruza por debajo en la otra diagonal. Se ve el tablero desde arriba y el costado de delante, con su gran arco entre los dos estribos de tierra',
};

/**
 * Lo que tienen en común los estribos de las dos clases (06-10-2026, el
 * usuario: «no veo cómo conectan con la tierra alrededor»): la primera tanda
 * los pidió «solo el puente, sin orillas», y acabaron en seco, como un bloque
 * posado en la hierba.
 */
const ESTRIBO_DICHO =
  'Los ESTRIBOS NACEN DE LA ORILLA, no se posan encima: en cada punta, el puente se hunde en un terraplén de tierra parda y roca que forma parte de la orilla, con taludes a los dos lados que bajan hasta el suelo y, por el lado del río, hasta el agua, con peñascos y piedras medio enterradas al pie y matas y hierba creciendo en la tierra. Por la punta, el tablero sigue en una rampa de tierra apisonada que baja hasta el suelo. Los bordes de toda esa tierra se deshacen en matas, terrones y piedras sueltas, con un contorno irregular y nunca un corte recto, para fundirse con el suelo del mapa que el juego pone debajo. En la guía, lo pardo es esa tierra (taludes y rampa), lo verdoso son matas y lo redondo, piedras.';

const CLASE_DICHA: Readonly<Record<Clase, string>> = {
  piedra:
    'Un PUENTE DE PIEDRA de un solo arco, de la misma piedra gris con musgo y la misma fábrica de sillares del puente de la imagen 2 (de ella se toman el material, el acabado y cómo sus estribos se agarran a la roca, NO su forma ni su orientación, que vienen torcidas). Tablero recto y plano, empedrado, con un pretil bajo de sillares a cada lado y un poste de piedra en cada extremo del pretil. El ARCO ES GRANDE: un medio punto que salva la casilla de agua ENTERA, de orilla a orilla, que arranca del agua y sube casi hasta el tablero, con un anillo de dovelas bien marcado alrededor y la sombra honda bajo él: es lo que más se ve del costado. Sin el poste de madera ni bandera: el juego pone la bandera encima.',
  troncos:
    'Un PUENTE RUDIMENTARIO: cinco troncos de pino descortezados y gastados tendidos uno al lado del otro, con dos travesaños atados con cuerda encima, cerca de cada punta, que los cosen en un solo suelo; en medio del río, un montón de piedras redondeadas del río donde apoyan; en cada orilla, sus puntas descansan en un estribo de tierra con piedras. Los mismos troncos y piedras húmedas de la imagen 2. Deja claro que se cruza, pero sin calzada, sin barandilla y sin tablas: solo troncos, cuerda, piedras y tierra, con algo de musgo y barro. Los troncos forman UNA BALSA VISTA DESDE ARRIBA: todos en el mismo plano, juntos como las tablas de un suelo, y de cada uno se ve sobre todo su CARA DE ARRIBA, una franja larga y redondeada con su veta a lo largo; solo el tronco de delante enseña un poco de costado. Nunca apilados unos sobre otros como una pila de leña vista de frente.',
};

const SUBE_DICHO: Partial<Record<Eje, string>> = {
  ns: 'Las dos orillas están a DISTINTO NIVEL: la del fondo (norte, arriba en la imagen) es un nivel más alta que la de delante. El tablero NO es una rampa: sube en CINCO ESCALONES anchos de sillares, de punta a punta, y cada escalón enseña su tabica (la cara vertical que mira a la cámara) como una franja de piedra en sombra cruzada en el tablero, igual que en la guía; los pretiles bajan escalonados con él. Las tabicas son de sillar ILUMINADO, más claras que la huella (miran a la cámara y a la luz), con solo una línea fina de sombra al pie de cada una: se leen como escalones, no como vigas oscuras. Delante, la rampa de tierra de la orilla baja; al fondo, el estribo alto se hunde en la orilla alta, con un talud de tierra y roca más alto a los lados. En este puente NO se ve ningún arco: queda debajo del tablero; nada de arcos ni bocas en los taludes.',
  eo: 'Las dos orillas están a DISTINTO NIVEL: la del este (derecha) es un nivel más alta que la del oeste (izquierda). El tablero sube en una rampa recta y suave de izquierda a derecha, y el estribo de la derecha, más alto, se hunde en la orilla alta: un talud alto de tierra y roca que baja hasta el agua; el arco queda más alto por ese lado.',
};

function encargoDePuente(clase: Clase, eje: Eje, sube = false): Encargo {
  const nombre = `puente-${clase}-${eje}${sube ? '-sube' : ''}`;
  const formato =
    eje === 'eo'
      ? 'Imagen apaisada.'
      : eje === 'ns'
        ? 'Imagen VERTICAL, más alta que ancha.'
        : 'Imagen cuadrada.';
  return {
    id: `mapa-${nombre}`,
    tipo: 'imagen',
    descripcion: [
      `Una pieza suelta del mapa de aventura de un juego de estrategia por turnos. ${CLASE_DICHA[clase]}`,
      `Orientación: el puente cruza ${EJE_DICHO[eje]}.`,
      ...(sube ? [SUBE_DICHO[eje] ?? ''] : []),
      'La orientación, la forma, las proporciones y el sitio en la imagen los da la guía de geometría (imagen 3), dibujada con la cámara del juego: cópialos con exactitud, el tablero PARALELO a la guía, sin girarlo, sin torcerlo y sin escorzo de perspectiva (los dos extremos del tablero son igual de anchos). Sin el agua y sin suelo llano alrededor: lo que no es el puente ni sus estribos de tierra es transparente.',
      ESTRIBO_DICHO,
      ESTILO_DEL_MAPA,
      `Cámara ortográfica elevada, la misma de la imagen de estilo; nunca de perfil. La luz viene de arriba a la izquierda. ${formato}`,
    ].join('\n'),
    referencias: [
      { ruta: REFERENCIA_DE_MAPAS, papel: 'estilo' },
      {
        ruta:
          clase === 'piedra'
            ? 'assets/mapa/nodo-puente-ancho.webp'
            : 'assets/mapa/modulos/orilla.webp',
        papel: 'identidad',
      },
      { ruta: `${DIR_GUIAS}/${nombre}.png`, papel: 'guia' },
    ],
    salida: `assets/mapa/${nombre}`,
    fondo: 'transparente',
  };
}

export const EJES: readonly Eje[] = ['ns', 'eo', 'ne-so', 'no-se'];
export const MATERIALES: readonly Material[] = ['roca', 'arenisca', 'basalto', 'nevadas'];

/** En el orden en que importan: lo que más se ve primero (§16-§17 y el encargo del usuario). */
export function encargosDeParedesYPuentes(): Encargo[] {
  return [
    encargoDePuente('piedra', 'ns'),
    encargoDePuente('piedra', 'eo'),
    encargoDePuente('troncos', 'ns'),
    encargoDePuente('troncos', 'eo'),
    encargoDeLaterales('roca', 'este'),
    encargoDeLaterales('roca', 'oeste'),
    encargoDePuente('piedra', 'ne-so'),
    encargoDePuente('piedra', 'no-se'),
    encargoDePuente('troncos', 'ne-so'),
    encargoDePuente('troncos', 'no-se'),
    encargoDePuente('piedra', 'ns', true),
    encargoDePuente('piedra', 'eo', true),
    ...MATERIALES.filter((m) => m !== 'roca').flatMap((m) => [
      encargoDeLaterales(m, 'este'),
      encargoDeLaterales(m, 'oeste'),
    ]),
  ];
}

/** Escribe las guías y la geometría de cada una (`<guía>.json`). */
export async function escribirGuias(): Promise<string[]> {
  const dir = join(RAIZ, DIR_GUIAS);
  await mkdir(dir, { recursive: true });
  const escritas: string[] = [];
  const escribir = async (nombre: string, g: Guia, geo?: GeometriaDeGuia) => {
    const png = await sharp(Buffer.from(g.svg())).png().toBuffer();
    await writeFile(join(dir, `${nombre}.png`), png);
    if (geo !== undefined) {
      const caja = await cajaDeGuia(png);
      await writeFile(
        join(dir, `${nombre}.json`),
        `${JSON.stringify({ ...geo, caja }, null, 2)}\n`,
      );
    }
    escritas.push(`${DIR_GUIAS}/${nombre}.png`);
  };
  for (const clase of ['piedra', 'troncos'] as const)
    for (const eje of EJES) {
      const { guia, geo } = guiaDePuente(clase, eje);
      await escribir(`puente-${clase}-${eje}`, guia, geo);
    }
  for (const eje of ['ns', 'eo'] as const) {
    const { guia, geo } = guiaDePuente('piedra', eje, true);
    await escribir(`puente-piedra-${eje}-sube`, guia, geo);
  }
  for (const lado of ['este', 'oeste'] as const)
    await escribir(`laterales-${lado}`, guiaDeParedes(lado));
  return escritas;
}

/** La caja de lo que no es fondo en una guía. */
async function cajaDeGuia(png: Buffer): Promise<[number, number, number, number]> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const fondo = [0x7d, 0x7d, 0x7d];
  let x0 = info.width;
  let y0 = info.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (
        Math.abs((data[i] as number) - (fondo[0] as number)) +
          Math.abs((data[i + 1] as number) - (fondo[1] as number)) +
          Math.abs((data[i + 2] as number) - (fondo[2] as number)) <
        6
      )
        continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  return [x0, y0, x1, y1];
}

/**
 * El JSON de un puente pintado: el ancla en el CENTRO DEL TABLERO (§17), no en
 * la base, y cuántos píxeles mide una casilla. Se llevan de la guía a la pieza
 * por sus cajas: la pieza sigue la guía en forma, así que la caja de lo pintado
 * es la caja de la guía escalada.
 */
export async function derivarPuente(rutaImagen: string, rutaGeometria: string, eje: Eje) {
  const geo = JSON.parse(await readFile(rutaGeometria, 'utf8')) as GeometriaDeGuia;
  const { data, info } = await sharp(rutaImagen)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let x0 = info.width;
  let y0 = info.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if ((data[(y * info.width + x) * 4 + 3] as number) >= 128) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  const [gx0, gy0, gx1, gy1] = geo.caja;
  const sx = (x1 - x0) / (gx1 - gx0);
  const sy = (y1 - y0) / (gy1 - gy0);
  const ancla: [number, number] = [
    Math.round(x0 + (geo.centro[0] - gx0) * sx),
    Math.round(y0 + (geo.centro[1] - gy0) * sy),
  ];
  return {
    ancho: info.width,
    alto: info.height,
    ancla,
    anclaEs: 'el centro del tablero (§17), llevado desde la guía de geometría por las cajas',
    // La casilla se mide A LO LARGO del puente, donde la luz es una casilla: a lo
    // ancho, el pintor suele hacer el tablero más ancho que la guía.
    pxPorCasilla: Math.round(
      geo.casilla * (eje === 'ns' ? sy : eje === 'eo' ? sx : Math.sqrt(sx * sy)),
    ),
    escalaGuia: [Number(sx.toFixed(3)), Number(sy.toFixed(3))],
    guia: rutaGeometria.replace(`${RAIZ}/`, '').replace(/\.json$/, '.png'),
  };
}

/**
 * El JSON entero de un puente: el de cualquier pieza (`derivarPieza`) con el
 * ancla cambiada al centro del tablero y la casilla. Lo comprueba
 * `test/arte-hojas.test.ts` igual que el de las demás piezas.
 */
export async function puenteDerivado(rutaImagen: string): Promise<Record<string, unknown>> {
  const nombre = rutaImagen.replace(/^.*\//, '').replace(/\.webp$/, '');
  const geo = join(RAIZ, DIR_GUIAS, `${nombre}.json`);
  const eje = EJES.find((e) => nombre.replace(/-sube$/, '').endsWith(`-${e}`));
  if (eje === undefined) throw new Error(`${nombre}: no sé el eje del puente`);
  return {
    ...(await derivarPieza(rutaImagen)),
    ...(await derivarPuente(rutaImagen, geo, eje)),
  };
}

export async function escribirPuenteDerivado(rutaImagen: string): Promise<void> {
  const json = rutaImagen.replace(/\.webp$/, '.json');
  await mkdir(dirname(json), { recursive: true });
  await writeFile(json, `${JSON.stringify(await puenteDerivado(rutaImagen), null, 2)}\n`);
}
