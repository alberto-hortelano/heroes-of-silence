/**
 * Las PUERTAS del recinto de una ciudad (`docs/art/peticiones.md` §37, vuelta 2
 * de `docs/agents/2026-10-20-ciudad-amurallada/`): la muralla de la ciudad es
 * un octógono (`contornoDelRecinto`) y por cada cara se entra por una puerta
 * que cierra el hueco, en cualquiera de las ocho direcciones.
 *
 * Una hoja de seis módulos de UNA familia (decisión del usuario, 20-10-2026):
 * cuatro puertas, una por eje (`puerta-n-s`, `-e-o`, `-ne-so`, `-no-se`: cada
 * una sirve a sus dos caras opuestas), y dos tramos lisos en diagonal
 * (`tramo-ne-so`, `-no-se`). Arco de medio punto con el rastrillo alzado y sin
 * poste de bandera. Las de la muralla del mapa (`nodo-puerta-ancho` y
 * `-hondo`) traen sus propias torres y no caben en una cara de 1,23; los tramos
 * en diagonal de la hoja `muro` suben ~24° en pantalla y no 45°.
 *
 * Vuelta 4 (21-10-2026, el usuario eligió que mande el tramo en diagonal): un
 * séptimo módulo, el tramo recto de las caras norte y sur (`tramo-n-s`), que
 * en el recinto sustituye al `horizontal` de la hoja `muro` (su muro medía dos
 * tercios del de las diagonales); y las cuatro puertas otra vez, con las alas
 * al alto de ese muro, el torreón bajo (`ALTO_DE_LA_PUERTA_DEL_RECINTO`, unas
 * 1,3 veces el muro) y el arco ancho (`LUZ_DEL_ARCO`, por el que cabe el puente
 * de una ciudad-puente). Se pidieron los siete juntos, con los tramos en
 * diagonal de la vuelta 2 de identidad, y se quedan los siete: los tramos en
 * diagonal nuevos tienen el muro de los de antes (71 frente a 72 px a 200 px
 * por casilla) y el tono de las puertas nuevas, que con los de antes desentonaba.
 * Lo que una pieza sale más alta que su guía lo corrige `ESCALA_DEL_MODULO`.
 *
 * Cada módulo va de vértice a vértice de su cara, cortado limpio en sus dos
 * puntas, donde lo tapa la torre del vértice: lo dice la guía, dibujada con la
 * proyección del mapa (`Guia`, el suelo tal cual y lo alto hacia arriba), y la
 * derivación lleva de ella al módulo el pie de sus dos puntas
 * (`escribirRecintoDerivado`), con el que `componer` lo coloca.
 *
 *   pnpm taller encolar --recinto
 *   pnpm taller derivar-recinto
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import {
  ALTO_DE_LA_PUERTA_DEL_RECINTO,
  ALTO_DEL_MURO_DEL_RECINTO,
  ARRANQUE_DEL_ARCO,
  CARA_DEL_RECINTO,
  EJES_DEL_RECINTO,
  type EjeDelRecinto,
  GRUESO_DEL_MURO,
  GRUESO_DEL_TORREON,
  HOJA_DEL_RECINTO,
  LARGO_DEL_TORREON,
  LUZ_DEL_ARCO,
  MARCO_DEL_EJE,
  MODULOS_DEL_RECINTO,
  puertaDelEje,
  tramoDelEje,
} from '../../src/client/render/escenario/recinto.js';
import { registrarConEscala } from './derivar.js';
import type { Encargo } from './encargo.js';
import { ESTILO_DEL_MAPA, REFERENCIA_DE_MAPAS } from './mapa-denso.js';
import { ARRIBA, DIR_GUIAS, FRENTE, Guia, type P2, type P3, SOMBRA } from './paredes-puentes.js';

const RAIZ = resolve(import.meta.dirname, '../..');

/**
 * Las medidas del muro en la guía, en casillas, a la escala del recinto: el
 * grueso del muro y lo alto de su paramento (las almenas suben hasta
 * `ALTO_DEL_MURO_DEL_RECINTO`), y el torreón de la puerta: largo a lo largo del
 * muro, grueso (sale por los dos lados) y alto del paramento (con almenas,
 * `ALTO_DE_LA_PUERTA_DEL_RECINTO`).
 */
const GRUESO = GRUESO_DEL_MURO;
const ALMENA = 0.1;
const PARAMENTO = ALTO_DEL_MURO_DEL_RECINTO - ALMENA;
const TORREON = {
  largo: LARGO_DEL_TORREON,
  grueso: GRUESO_DEL_TORREON,
  alto: ALTO_DE_LA_PUERTA_DEL_RECINTO - ALMENA,
} as const;
/** Donde arranca el arco (sobre el suelo); su radio es media luz. */
const ARRANQUE = ARRANQUE_DEL_ARCO;

const HUECO = '#262626';
const RASTRILLO = '#8c8c8c';
const CAMINO = '#d4cfc4';

/** Cómo va cada eje en el suelo: el del vano que ninguna casa tapa (`vanoDelArco`). */
const MARCO = MARCO_DEL_EJE;

/** Un punto del muro (`a` a lo largo, `b` de través, alto `z`) en el mapa. */
const en = (eje: EjeDelRecinto, a: number, b: number, z: number): P3 => {
  const { u, v } = MARCO[eje];
  return [a * u[0] + b * v[0], a * u[1] + b * v[1], z];
};

/**
 * Lo que se ve de una caja del muro, de `a0` a `a1` a lo largo, de `b0` a `b1`
 * de través y de `z0` a `z1` de alto: las caras laterales que miran a la cámara
 * (con componente sur), a la luz si miran al oeste y en penumbra si miran al
 * este, y su tapa; la de delante (`+v`), solo si `frente`. Un muro de norte a
 * sur no enseña cara en esta proyección: con `tira`, se dibuja una estrecha de
 * su cara este, como la que enseñan los tramos `muro-ns`.
 */
function caja(
  g: Guia,
  eje: EjeDelRecinto,
  [a0, a1]: P2,
  [b0, b1]: P2,
  [z0, z1]: P2,
  { frente = true, tira = false } = {},
): void {
  const esq: P3[] = [
    en(eje, a0, b0, 0),
    en(eje, a1, b0, 0),
    en(eje, a1, b1, 0),
    en(eje, a0, b1, 0),
  ];
  const [cx, cy] = en(eje, (a0 + a1) / 2, (b0 + b1) / 2, 0);
  for (let i = 0; i < 4; i++) {
    const p = esq[i] as P3;
    const q = esq[(i + 1) % 4] as P3;
    // La normal de este lado, hacia fuera de la caja.
    const mx = (p[0] + q[0]) / 2 - cx;
    const my = (p[1] + q[1]) / 2 - cy;
    if (my <= 1e-6) continue;
    if (!frente && i === 2) continue;
    g.poligono(
      [
        [p[0], p[1], z0],
        [q[0], q[1], z0],
        [q[0], q[1], z1],
        [p[0], p[1], z1],
      ],
      mx > 0.05 ? SOMBRA : FRENTE,
    );
  }
  if (tira && eje === 'e-o') {
    const ancho = 0.06;
    g.poligono(
      [
        [b1, a0, z1],
        [b1 + ancho, a0 + ancho, z1],
        [b1 + ancho, a1 + ancho, z0],
        [b1, a1, z0],
      ],
      SOMBRA,
    );
  }
  g.poligono(
    esq.map(([x, y]) => [x, y, z1] as P3),
    ARRIBA,
  );
}

/** Las almenas a lo largo de los dos bordes de lo alto de una caja de grueso `2b`, de `a0` a `a1`, sobre `z`. */
function almenas(g: Guia, eje: EjeDelRecinto, a0: number, a1: number, b: number, z: number): void {
  const paso = 0.16;
  const m = 0.045;
  const n = Math.max(1, Math.round((a1 - a0) / paso));
  for (const lado of [-1, 1] as const)
    for (let k = 0; k < n; k++) {
      const a = a0 + (k + 0.5) * ((a1 - a0) / n);
      const bb = lado * (b - m);
      caja(g, eje, [a - m, a + m], [bb - m, bb + m], [z, z + ALMENA]);
    }
}

/** Un tramo de muro de `a0` a `a1`, con sus almenas. */
function muro(g: Guia, eje: EjeDelRecinto, a0: number, a1: number): void {
  caja(g, eje, [a0, a1], [-GRUESO / 2, GRUESO / 2], [0, PARAMENTO], { tira: true });
  almenas(g, eje, a0, a1, GRUESO / 2, PARAMENTO);
}

/**
 * La boca del arco en la cara de delante del torreón, de medio punto y de
 * `LUZ_DEL_ARCO`: el hueco oscuro, el suelo del paso que entra en él y, arriba,
 * los barrotes del rastrillo alzado, que asoman con sus puntas.
 */
function arco(g: Guia, eje: EjeDelRecinto, medio: number): P3[] {
  const r = LUZ_DEL_ARCO / 2;
  const b = TORREON.grueso / 2 + 0.002;
  const curva = (radio: number) =>
    Array.from({ length: 13 }, (_, k): P3 => {
      const t = Math.PI * (1 - k / 12);
      return en(eje, medio + radio * Math.cos(t), b, ARRANQUE + radio * Math.sin(t));
    });
  const boca: P3[] = [en(eje, medio - r, b, 0), ...curva(r), en(eje, medio + r, b, 0)];
  g.poligono(boca, HUECO);
  // El suelo del paso: tierra que entra bajo el arco.
  g.poligono(
    [
      en(eje, medio - r * 0.7, b, 0),
      en(eje, medio + r * 0.7, b, 0),
      en(eje, medio + r * 0.5, b - 0.2, 0),
      en(eje, medio - r * 0.5, b - 0.2, 0),
    ],
    CAMINO,
  );
  // El rastrillo alzado: barrotes que cuelgan de lo alto del arco y acaban en punta.
  for (let k = -2; k <= 2; k++) {
    const a = medio + k * r * 0.36;
    const arriba = ARRANQUE + Math.sqrt(Math.max(0, r * r - (a - medio) ** 2)) - 0.01;
    const abajo = ARRANQUE + r * 0.25;
    if (arriba <= abajo) continue;
    g.poligono(
      [
        en(eje, a - 0.012, b, arriba),
        en(eje, a + 0.012, b, arriba),
        en(eje, a + 0.012, b, abajo + 0.02),
        en(eje, a, b, abajo),
        en(eje, a - 0.012, b, abajo + 0.02),
      ],
      RASTRILLO,
    );
  }
  g.poligono(
    [
      en(eje, medio - r * 0.95, b, ARRANQUE + r * 0.45),
      en(eje, medio + r * 0.95, b, ARRANQUE + r * 0.45),
      en(eje, medio + r * 0.95, b, ARRANQUE + r * 0.52),
      en(eje, medio - r * 0.95, b, ARRANQUE + r * 0.52),
    ],
    RASTRILLO,
  );
  return boca;
}

/** La cara de delante del torreón con la boca del arco abierta en ella. */
function frenteConArco(g: Guia, eje: EjeDelRecinto, a0: number, a1: number, medio: number): void {
  const r = LUZ_DEL_ARCO / 2;
  const b = TORREON.grueso / 2;
  const z = TORREON.alto;
  const curva = Array.from({ length: 13 }, (_, k): P3 => {
    const t = Math.PI * (k / 12);
    return en(eje, medio + r * Math.cos(t), b, ARRANQUE + r * Math.sin(t));
  });
  const [, my] = en(eje, 0, 1, 0);
  const [mx] = en(eje, 0, 1, 0);
  if (my <= 1e-6) return;
  g.poligono(
    [
      en(eje, a0, b, 0),
      en(eje, a0, b, z),
      en(eje, a1, b, z),
      en(eje, a1, b, 0),
      en(eje, medio + r, b, 0),
      ...curva,
      en(eje, medio - r, b, 0),
    ],
    mx > 0.05 ? SOMBRA : FRENTE,
  );
}

/** Dibuja la pieza `nombre` con su primera junta en el origen y la segunda a `CARA_DEL_RECINTO` por su eje. */
function dibujarPieza(g: Guia, nombre: (typeof MODULOS_DEL_RECINTO)[number]): void {
  const L = CARA_DEL_RECINTO;
  const eje = nombre.replace(/^(puerta|tramo)-/, '') as EjeDelRecinto;
  if (nombre.startsWith('tramo-')) {
    muro(g, eje, 0, L);
    return;
  }
  const medio = L / 2;
  const t0 = medio - TORREON.largo / 2;
  const t1 = medio + TORREON.largo / 2;
  const torreon = () => {
    if (eje === 'e-o') {
      // De norte a sur la boca no mira a la cámara: se ve en escorzo en la tira
      // de la cara este del torreón, y el paso cruza de lado por debajo.
      caja(g, eje, [t0, t1], [-TORREON.grueso / 2, TORREON.grueso / 2], [0, TORREON.alto], {
        tira: true,
      });
      const x = TORREON.grueso / 2;
      g.poligono(
        [
          [x + 0.015, medio - LUZ_DEL_ARCO / 2 - 0.02, ARRANQUE + LUZ_DEL_ARCO / 2],
          [x + 0.05, medio - LUZ_DEL_ARCO / 2 + 0.02, ARRANQUE + LUZ_DEL_ARCO / 2],
          [x + 0.05, medio + LUZ_DEL_ARCO / 2 + 0.05, 0],
          [x + 0.015, medio + LUZ_DEL_ARCO / 2, 0],
        ],
        HUECO,
      );
    } else {
      arco(g, eje, medio);
      caja(g, eje, [t0, t1], [-TORREON.grueso / 2, TORREON.grueso / 2], [0, TORREON.alto], {
        frente: false,
      });
      frenteConArco(g, eje, t0, t1, medio);
    }
    almenas(g, eje, t0, t1, TORREON.grueso / 2, TORREON.alto);
  };
  // De atrás adelante, por lo que cae más al sur cada parte.
  const partes = [
    { y: en(eje, t0 / 2, 0, 0)[1], dibujar: () => muro(g, eje, 0, t0) },
    { y: en(eje, medio, 0, 0)[1], dibujar: torreon },
    { y: en(eje, (t1 + L) / 2, 0, 0)[1], dibujar: () => muro(g, eje, t1, L) },
  ];
  for (const p of [...partes].sort((p, q) => p.y - q.y)) p.dibujar();
}

/** La geometría que cuenta de cada pieza de la guía, en píxeles de la guía. */
export interface GeometriaDelRecinto {
  readonly nombre: (typeof MODULOS_DEL_RECINTO)[number];
  /** El pie de sus dos puntas: el vértice de su cara a cada lado, a ras de suelo. */
  readonly junta: readonly [P2, P2];
  readonly caja: readonly [number, number, number, number];
}

/** Las filas de la hoja: las cuatro puertas y los tres tramos, el recto entre los dos en diagonal. */
const FILAS = [
  EJES_DEL_RECINTO.map(puertaDelEje),
  [tramoDelEje('ne-so'), tramoDelEje('n-s'), tramoDelEje('no-se')],
] as const;
const LIENZO: readonly [number, number] = [1536, 1024];
const HUECO_ENTRE_PIEZAS = 0.45;

/** La guía de la hoja del recinto, con las piezas en filas y el pie de cada fila en la misma línea. */
export function guiaDelRecinto(): { guia: Guia; piezas: GeometriaDelRecinto[]; casilla: number } {
  const [ancho, alto] = LIENZO;
  const medida = (n: (typeof MODULOS_DEL_RECINTO)[number]) => {
    const m = new Guia(ancho, alto, 1, 0, 0);
    dibujarPieza(m, n);
    return { n, ...m.caja };
  };
  const filas = FILAS.map((f) => f.map(medida));
  const anchos = filas.map(
    (f) => f.reduce((a, m) => a + (m.x1 - m.x0), 0) + HUECO_ENTRE_PIEZAS * (f.length + 1),
  );
  const altos = filas.map((f) => Math.max(...f.map((m) => m.y1 - m.y0)));
  const t = Math.floor(
    Math.min(
      ancho / Math.max(...anchos),
      alto / (altos.reduce((a, b) => a + b, 0) + HUECO_ENTRE_PIEZAS * (filas.length + 1)),
    ),
  );
  const g = new Guia(ancho, alto, t, 0, 0);
  const piezas: GeometriaDelRecinto[] = [];
  let techo =
    (alto - t * (altos.reduce((a, b) => a + b, 0) + HUECO_ENTRE_PIEZAS * (filas.length - 1))) / 2;
  filas.forEach((fila, f) => {
    const suelo = techo + (altos[f] as number) * t;
    const libre = (ancho - t * fila.reduce((a, m) => a + (m.x1 - m.x0), 0)) / (fila.length + 1);
    let x = libre;
    for (const m of fila) {
      g.ox = x - m.x0 * t;
      g.oy = suelo - m.y1 * t;
      const sola = new Guia(ancho, alto, t, g.ox, g.oy);
      dibujarPieza(sola, m.n);
      dibujarPieza(g, m.n);
      const eje = m.n.replace(/^(puerta|tramo)-/, '') as EjeDelRecinto;
      const r = (q: P2): P2 => [Math.round(q[0]), Math.round(q[1])];
      piezas.push({
        nombre: m.n,
        junta: [r(g.p(en(eje, 0, 0, 0))), r(g.p(en(eje, CARA_DEL_RECINTO, 0, 0)))],
        caja: [
          Math.round(sola.caja.x0),
          Math.round(sola.caja.y0),
          Math.round(sola.caja.x1),
          Math.round(sola.caja.y1),
        ],
      });
      x += (m.x1 - m.x0) * t + libre;
    }
    techo = suelo + HUECO_ENTRE_PIEZAS * t;
  });
  return { guia: g, piezas, casilla: t };
}

/** Escribe la guía de la hoja del recinto y su geometría (`recinto.json`). */
export async function escribirGuiaDelRecinto(): Promise<string> {
  const { guia, piezas, casilla } = guiaDelRecinto();
  await writeFile(
    join(RAIZ, DIR_GUIAS, `${HOJA_DEL_RECINTO}.png`),
    await sharp(Buffer.from(guia.svg())).png().toBuffer(),
  );
  await writeFile(
    join(RAIZ, DIR_GUIAS, `${HOJA_DEL_RECINTO}.json`),
    `${JSON.stringify({ ancho: guia.ancho, alto: guia.alto, casilla, piezas }, null, 1)}\n`,
  );
  return `${DIR_GUIAS}/${HOJA_DEL_RECINTO}.png`;
}

// ------------------------------------------------------------- el encargo

const DICHO: Readonly<Record<(typeof MODULOS_DEL_RECINTO)[number], string>> = {
  'puerta-n-s':
    'fila 1, columna 1: la PUERTA de un muro que corre de izquierda a derecha, DE CARA a la cámara: el arco se ve de frente, en el centro del torreón.',
  'puerta-e-o':
    'fila 1, columna 2: la PUERTA de un muro que corre hacia el FONDO, de abajo arriba de la imagen, estrecho y en escorzo: el torreón es el trozo del MEDIO del muro, más alto y algo más ancho que lo de delante y lo de detrás; el camino lo cruza DE LADO, de izquierda a derecha, por debajo del torreón, y el arco solo asoma en escorzo en su cara derecha.',
  'puerta-ne-so':
    'fila 1, columna 3: la PUERTA de un muro en DIAGONAL que BAJA hacia la DERECHA a 45 grados exactos: se ve su cara iluminada, la que mira abajo a la izquierda, y en ella el arco.',
  'puerta-no-se':
    'fila 1, columna 4: la PUERTA de un muro en DIAGONAL que SUBE hacia la DERECHA a 45 grados exactos: se ve su cara en penumbra, la que mira abajo a la derecha, y en ella el arco.',
  'tramo-ne-so':
    'fila 2, columna 1: un TRAMO LISO del muro en DIAGONAL que BAJA hacia la DERECHA a 45 grados exactos, sin puerta: su cara iluminada, la que mira abajo a la izquierda. Es el tramo 1 de la imagen 2, tal cual.',
  'tramo-n-s':
    'fila 2, columna 2: un TRAMO LISO RECTO del mismo muro, que corre de izquierda a derecha DE CARA a la cámara, sin puerta: se ve su cara de delante y, encima, su paso de ronda entre las dos hileras de almenas, como el tramo en diagonal de al lado pero de frente. El mismo alto de muro, las mismas almenas y el mismo grueso que los tramos en diagonal de su fila.',
  'tramo-no-se':
    'fila 2, columna 3: un TRAMO LISO del muro en DIAGONAL que SUBE hacia la DERECHA a 45 grados exactos, sin puerta: su cara en penumbra, la que mira abajo a la derecha. Es el tramo 2 de la imagen 2, tal cual.',
};

/**
 * Los dos tramos en diagonal de la hoja del recinto de la vuelta 2
 * (20-10-2026), que mandan en el alto del muro (vuelta 4), juntos en una
 * imagen: la identidad de las piezas nuevas. Fuera de `assets/` para que no la
 * pise la hoja nueva cuando se corrija.
 */
const TRAMOS_DE_LA_VUELTA_2 =
  'docs/agents/2026-10-20-ciudad-amurallada/recinto-tramos-vuelta2.webp';

/**
 * La hoja del recinto (vuelta 4, 21-10-2026): las cuatro puertas, más bajas y
 * con el arco más ancho, y el tramo recto de las caras norte y sur, todo con el
 * muro de los tramos en diagonal de la vuelta 2. Se piden los siete módulos
 * para que el pintor vea en la misma hoja el muro que manda.
 */
export function encargoDelRecinto(): Encargo {
  const orden = FILAS.flat()
    .map((n) => DICHO[n])
    .join('\n');
  return {
    id: `modulos-${HOJA_DEL_RECINTO}-5`,
    tipo: 'modulos',
    descripcion: [
      'Una hoja de 7 módulos de la MURALLA DE UNA CIUDAD para el mapa de aventura de un juego de estrategia: cuatro PUERTAS y tres TRAMOS LISOS de UNA misma muralla de piedra gris con musgo, la de los dos tramos en diagonal de la imagen 2 (la misma piedra, los mismos sillares, las mismas almenas cuadradas, el mismo grueso, el mismo alto de muro y el mismo musgo), para juntarlos en un recinto de ocho caras con una torre redonda en cada esquina.',
      'Cada módulo es UN tramo de muro de una esquina a la otra, CORTADO LIMPIO en sus dos puntas, sin torres, sin pilares, sin contrafuertes ni remates en las puntas: ahí va una torre del juego que tapa el corte.',
      'EL MURO DE TODOS LOS MÓDULOS ES EL MISMO: en las siete piezas, el muro, con su paso de ronda y sus dos hileras de almenas, mide de alto lo mismo que los tramos en diagonal de la imagen 2, con almenas del mismo tamaño y a la misma distancia. En las puertas, el muro a los dos lados del torreón también: ni más alto ni más bajo que el de los tramos lisos.',
      'Cada PUERTA es un torreón BAJO y ACHAPARRADO en el CENTRO del tramo: solo UN TERCIO más alto que el muro de al lado (no el doble), apenas más grueso que él, y mucho más bajo que una torre de esquina. Pero SOBRESALE por encima de las alas en las cuatro puertas, también en las de muro en diagonal y en la de muro hacia el fondo: su hilera de almenas va MÁS ARRIBA que la de las alas, con un escalón claro entre las dos, como en la guía; no sigue la misma línea de almenas que el muro. En él, un ARCO DE MEDIO PUNTO ANCHO, casi tan ancho como el torreón (solo un pilar estrecho a cada lado) y que sube casi hasta lo alto del torreón, por el que pasa un camino ancho: dovelas de piedra alrededor del arco, el paso oscuro dentro y, arriba, el RASTRILLO ALZADO, de HIERRO oscuro gris negruzco (ni rojo ni de cobre), del que solo asoman las puntas de sus barrotes bajo el arco, como en la imagen 3. Sin hojas de puerta cerradas, sin bandera, sin poste, sin estandarte, sin antorchas, sin ventanas ni saeteras y sin torres a los lados del arco.',
      'LA SILUETA DE CADA MÓDULO ES LA DE LA GUÍA (imagen 4), CALCADA: mismo sitio, mismo largo, mismo alto y el MISMO RUMBO del muro, sin girarlo ni torcerlo; las diagonales van a 45 GRADOS EXACTOS en la imagen, como en la guía, NO más tumbadas. En la guía: lo gris claro es lo alto del muro y las almenas, lo gris medio la cara a la luz, lo gris oscuro la cara en penumbra, lo negro la boca del arco, lo claro dentro de él el suelo del paso, y los palos grises los barrotes del rastrillo. El alto de cada muro y de cada torreón en la guía es el que tiene que tener.',
      orden,
      'Sin suelo debajo ni alrededor: ni hierba, ni camino fuera del arco, ni peana; cada módulo es el muro solo, para posarlo sobre el terreno. La luz viene de arriba a la izquierda; las sombras propias caen hacia la derecha y hacia abajo.',
      ESTILO_DEL_MAPA,
    ].join('\n'),
    referencias: [
      { ruta: REFERENCIA_DE_MAPAS, papel: 'estilo' },
      // La muralla con la que casa: los tramos en diagonal de la vuelta 2, que mandan.
      { ruta: TRAMOS_DE_LA_VUELTA_2, papel: 'identidad' },
      // El arco y el rastrillo alzado de la puerta de la muralla del mapa.
      { ruta: 'assets/mapa/nodo-puerta-ancho.webp', papel: 'material' },
      { ruta: `${DIR_GUIAS}/${HOJA_DEL_RECINTO}.png`, papel: 'guia' },
    ],
    salida: `assets/mapa/modulos/${HOJA_DEL_RECINTO}`,
    fondo: 'transparente',
    cuantos: MODULOS_DEL_RECINTO.length,
    nombres: [...FILAS.flat()],
  };
}

/** Lo que una pieza tiene que solapar con su guía (intersección entre unión) para darla por buena. */
const SOLAPE_MINIMO = 0.7;

/**
 * Apunta en el índice de la hoja del recinto las juntas de cada módulo: el pie
 * de sus dos puntas, en píxeles del módulo, registrado sobre su pieza de la guía
 * con escala (`registrarConEscala`: el pintor calca la forma, no el tamaño).
 */
export async function escribirRecintoDerivado(): Promise<string> {
  const dir = join(RAIZ, 'assets/mapa/modulos');
  const guia = join(RAIZ, DIR_GUIAS, HOJA_DEL_RECINTO);
  const geometrias = (
    JSON.parse(await readFile(`${guia}.json`, 'utf8')) as { piezas: GeometriaDelRecinto[] }
  ).piezas;
  const ruta = join(dir, `${HOJA_DEL_RECINTO}.json`);
  const indice = JSON.parse(await readFile(ruta, 'utf8')) as {
    modulos: { imagen: string; junta?: unknown }[];
  };
  for (const mod of indice.modulos) {
    const nombre = mod.imagen.replace(/\.webp$/, '');
    const g = geometrias.find((p) => p.nombre === nombre);
    if (g === undefined)
      throw new Error(`${HOJA_DEL_RECINTO}: la guía no tiene la pieza «${nombre}»`);
    const { llevar: f, solape } = await registrarConEscala(
      join(dir, HOJA_DEL_RECINTO, mod.imagen),
      `${guia}.png`,
      g.caja,
      `${HOJA_DEL_RECINTO}/${nombre}`,
    );
    const r = (p: P2): P2 => {
      const [x, y] = f(p);
      return [Math.round(x), Math.round(y)];
    };
    // Por debajo, la pieza no calca la guía: sus juntas no caerían en las torres.
    if (solape < SOLAPE_MINIMO)
      throw new Error(
        `${HOJA_DEL_RECINTO}/${nombre}: solapa un ${(solape * 100).toFixed(1)} % con su guía, y hace falta un ${SOLAPE_MINIMO * 100} %: no calca la silueta (¿no va a 45°?); pídela otra vez`,
      );
    mod.junta = [r(g.junta[0]), r(g.junta[1])];
  }
  await writeFile(ruta, `${JSON.stringify(indice, null, 2)}\n`);
  return ruta.replace(`${RAIZ}/`, '');
}
