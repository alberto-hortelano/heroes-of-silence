/**
 * El orden de pintado del anillo de un recinto (`ordenDelAnillo`, 21-10-2026, marca
 * s16 (11, 6): la torre del vértice de arriba de la puerta del noreste tapaba el
 * pilar del torreón): cada pieza es un sólido de su guía (la torre, un cilindro en
 * su vértice; el tramo, un muro; la puerta, con su torreón) y, donde dos se solapan
 * en pantalla, se pinta después la que tapa más. Con su guardia,
 * `anilloMalOrdenado`, que lee el informe de la escena.
 */
import { FONDO_DEL_ADARVE } from '../tirada.js';
import type { ModuloDelRecinto, PiezaDelRecinto } from './anillo.js';
import {
  ALTO_DE_LA_PUERTA_DEL_RECINTO,
  ALTO_DE_TORRE_DEL_RECINTO,
  ALTO_DEL_MURO_DEL_RECINTO,
  type CaraDelContorno,
  type Contorno,
  caraDelContorno,
  EJE_DE_LA_CARA,
  GRUESO_DEL_MURO,
  GRUESO_DEL_TORREON,
  LARGO_DEL_TORREON,
  type Par,
  RADIO_DE_TORRE,
} from './octogono.js';

/**
 * Lo alto del cilindro de una torre, en casillas: su imagen mide eso más el
 * diámetro de su base, porque la tapa se ve entera (el suelo tal cual y lo alto
 * hacia arriba). Las almenas van dentro.
 */
const ALTO_DEL_CILINDRO = ALTO_DE_TORRE_DEL_RECINTO - 2 * RADIO_DE_TORRE;

/** Los lados del polígono con que se mide la base redonda de una torre. */
const LADOS_DE_LA_TORRE = 24;

/** Cada cuánto se mira la pantalla al decidir qué pieza va delante, en casillas. */
const PASO_DEL_ORDEN = 0.02;

/** Lo que una pieza del anillo se corre de la clave de la torre que tapa o la tapa. */
const ENTRE_TORRE_Y_PIEZA = 0.002;

/** Un prisma recto: su planta (un polígono convexo, en casillas) levantada del suelo a `alto`. */
interface Prisma {
  readonly planta: readonly Par[];
  readonly alto: number;
}

/** La caja de un muro de la cara `k`, de `a0` a `a1` desde su vértice `a`, de `grueso` de través y `alto`. */
function cajaDeLaCara(
  k: CaraDelContorno,
  a0: number,
  a1: number,
  grueso: number,
  alto: number,
): Prisma {
  const largo = Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]);
  const u: Par = [(k.b[0] - k.a[0]) / largo, (k.b[1] - k.a[1]) / largo];
  const [nx, ny] = k.normal;
  const g = grueso / 2;
  const en = (a: number, b: number): Par => [
    k.a[0] + a * u[0] + b * nx,
    k.a[1] + a * u[1] + b * ny,
  ];
  return { planta: [en(a0, -g), en(a1, -g), en(a1, g), en(a0, g)], alto };
}

/**
 * Lo que es cada pieza del anillo en el espacio, como lo dibuja su guía: la
 * torre, un cilindro centrado en su vértice; el tramo liso, un muro de
 * `GRUESO_DEL_MURO` de vértice a vértice (la imagen lo trae entero, cortado
 * donde lo tapa la torre); la puerta, ese muro con su torreón en el medio,
 * más grueso y más alto (`tools/taller/recinto.ts`); y cada pieza de una tirada
 * de norte a sur, su adarve de su pie hacia el norte, con el alto que se ve de
 * su frente.
 */
function solidoDe(p: PiezaDelRecinto, contorno: Contorno): readonly Prisma[] {
  if (p.que === 'torre') {
    const [cx, cy] = [p.x, p.y - RADIO_DE_TORRE];
    const planta = Array.from({ length: LADOS_DE_LA_TORRE }, (_, i): Par => {
      const t = (2 * Math.PI * i) / LADOS_DE_LA_TORRE;
      return [cx + RADIO_DE_TORRE * Math.cos(t), cy + RADIO_DE_TORRE * Math.sin(t)];
    });
    return [{ planta, alto: ALTO_DEL_CILINDRO }];
  }
  if (p.cara === undefined)
    throw new Error(`la pieza ${p.que} del anillo en ${p.x},${p.y} no dice su cara`);
  const k = caraDelContorno(contorno, p.cara);
  const largo = Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]);
  if (p.que === 'puerta') {
    const t0 = (largo - LARGO_DEL_TORREON) / 2;
    const t1 = (largo + LARGO_DEL_TORREON) / 2;
    return [
      cajaDeLaCara(k, 0, t0, GRUESO_DEL_MURO, ALTO_DEL_MURO_DEL_RECINTO),
      cajaDeLaCara(k, t0, t1, GRUESO_DEL_TORREON, ALTO_DE_LA_PUERTA_DEL_RECINTO),
      cajaDeLaCara(k, t1, largo, GRUESO_DEL_MURO, ALTO_DEL_MURO_DEL_RECINTO),
    ];
  }
  if (EJE_DE_LA_CARA[p.cara] === 'e-o') {
    const g = GRUESO_DEL_MURO / 2;
    const norte = p.y - p.alto * FONDO_DEL_ADARVE;
    return [
      {
        planta: [
          [p.x - g, norte],
          [p.x + g, norte],
          [p.x + g, p.y],
          [p.x - g, p.y],
        ],
        alto: p.alto * (1 - FONDO_DEL_ADARVE),
      },
    ];
  }
  return [cajaDeLaCara(k, 0, largo, GRUESO_DEL_MURO, ALTO_DEL_MURO_DEL_RECINTO)];
}

/**
 * Lo más cercano a la cámara que tiene el sólido `ps` en el punto de pantalla
 * `(sx, sy)`, como la fila del suelo de ese punto, o `undefined` si ahí no se
 * ve. Un punto `(x, y, z)` se ve en `(x, y − z)`: por un punto de pantalla
 * pasan los `(sx, sy + z, z)`, y el más alto es el de delante.
 */
function delanteEn(ps: readonly Prisma[], sx: number, sy: number): number | undefined {
  let mejor: number | undefined;
  for (const { planta, alto } of ps) {
    let ya = Number.POSITIVE_INFINITY;
    let yb = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < planta.length; i++) {
      const [px, py] = planta[i] as Par;
      const [qx, qy] = planta[(i + 1) % planta.length] as Par;
      if ((px - sx) * (qx - sx) > 0) continue;
      const ys = px === qx ? [py, qy] : [py + ((qy - py) * (sx - px)) / (qx - px)];
      for (const y of ys) {
        ya = Math.min(ya, y);
        yb = Math.max(yb, y);
      }
    }
    if (ya > yb) continue;
    const z = Math.min(alto, yb - sy);
    if (z < Math.max(0, ya - sy)) continue;
    mejor = Math.max(mejor ?? Number.NEGATIVE_INFINITY, sy + z);
  }
  return mejor;
}

/** El rectángulo de pantalla de un sólido: `[x0, y0, x1, y1]`. */
function pantallaDe(ps: readonly Prisma[]): readonly [number, number, number, number] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { planta, alto } of ps)
    for (const [x, y] of planta) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y - alto);
      y1 = Math.max(y1, y);
    }
  return [x0, y0, x1, y1];
}

/**
 * Dónde se solapan en pantalla los sólidos `a` y `b` y quién va delante en
 * cada punto, en casillas²: `[lo que a tapa de b, lo que b tapa de a]`. Una
 * imagen solo va entera delante o detrás de otra, así que la que tapa más es
 * la que se pinta después.
 */
function loQueSeTapan(a: readonly Prisma[], b: readonly Prisma[]): readonly [number, number] {
  const [ax0, ay0, ax1, ay1] = pantallaDe(a);
  const [bx0, by0, bx1, by1] = pantallaDe(b);
  const [x0, y0, x1, y1] = [
    Math.max(ax0, bx0),
    Math.max(ay0, by0),
    Math.min(ax1, bx1),
    Math.min(ay1, by1),
  ];
  let tapaA = 0;
  let tapaB = 0;
  const celda = PASO_DEL_ORDEN * PASO_DEL_ORDEN;
  for (let sx = x0 + PASO_DEL_ORDEN / 2; sx < x1; sx += PASO_DEL_ORDEN)
    for (let sy = y0 + PASO_DEL_ORDEN / 2; sy < y1; sy += PASO_DEL_ORDEN) {
      const da = delanteEn(a, sx, sy);
      const db = delanteEn(b, sx, sy);
      if (da === undefined || db === undefined || Math.abs(da - db) < 1e-9) continue;
      if (da > db) tapaA += celda;
      else tapaB += celda;
    }
  return [tapaA, tapaB];
}

/** Las torres de los dos vértices de la cara de `p`. */
function torresDeSuCara<M extends ModuloDelRecinto>(
  p: PiezaDelRecinto<M>,
  contorno: Contorno,
  torres: readonly PiezaDelRecinto<M>[],
): PiezaDelRecinto<M>[] {
  if (p.cara === undefined) return [];
  const k = caraDelContorno(contorno, p.cara);
  return torres.filter((t) =>
    [k.a, k.b].some(
      (v) => Math.abs(t.x - v[0]) < 1e-9 && Math.abs(t.y - RADIO_DE_TORRE - v[1]) < 1e-9,
    ),
  );
}

/** Una torre o una pieza de su cara: cuál de las dos va antes en el pintor, por la geometría. */
interface Antes<M extends ModuloDelRecinto> {
  readonly antes: PiezaDelRecinto<M>;
  readonly despues: PiezaDelRecinto<M>;
}

/** Las vueltas que da `ordenDelAnillo` como mucho: cada una mueve lo que una arista pide. */
const VUELTAS_DEL_ORDEN = 32;

/**
 * El anillo con la clave del pintor de cada torre y cada pieza de sus caras
 * (tramos y puertas) en el orden de la geometría: de una torre y una pieza de
 * una de sus dos caras, la que tiene más cerca de la cámara donde se solapan
 * en pantalla (`loQueSeTapan`) va después.
 *
 * Lo que no cumple se mueve lo justo, y solo hacia atrás: baja la clave de la
 * que va antes, nunca sube la de la que va después (la clave del pintor no
 * pasa de su pie, `Sprite.clave`). Así la torre del vértice de arriba de una
 * puerta del norte pasa detrás de ella, y el tramo en diagonal de delante, detrás
 * de la torre de su vértice de arriba. Subir la torre a la clave de ese tramo
 * (su vértice de abajo, 0,56 más al sur) la pintaba encima de lo que tiene
 * delante fuera del recinto: 119 pinos y picos de 1-40 con su caja sobre la
 * suya (20dbc295, s34 town-2). La casa que con eso cambiaría de lado baja con
 * la pieza (`techoDeLaCasa`, en `recintoDe`). Si en `VUELTAS_DEL_ORDEN` no
 * queda en orden, no hay claves que lo cumplan: lanza diciéndolo.
 */
export function ordenDelAnillo<M extends ModuloDelRecinto>(
  contorno: Contorno,
  torres: readonly PiezaDelRecinto<M>[],
  piezas: readonly PiezaDelRecinto<M>[],
): {
  readonly torres: PiezaDelRecinto<M>[];
  readonly piezas: PiezaDelRecinto<M>[];
  /**
   * Las que bajó para ir antes de algo de delante del medio del recinto, por
   * su sitio en `[...torres, ...piezas]`, con su clave de antes y la de ahora:
   * las casas que se pintaban antes que ellas bajan con ellas (`techoDeLaCasa`).
   */
  readonly porDelante: readonly {
    readonly i: number;
    readonly vieja: number;
    readonly nueva: number;
  }[];
} {
  const aristas: Antes<M>[] = [];
  for (const p of piezas) {
    const suyo = solidoDe(p, contorno);
    for (const t of torresDeSuCara(p, contorno, torres)) {
      const [tapaP, tapaT] = loQueSeTapan(suyo, solidoDe(t, contorno));
      if (tapaP > tapaT) aristas.push({ antes: t, despues: p });
      else if (tapaT > tapaP) aristas.push({ antes: p, despues: t });
    }
  }
  const clave = new Map<PiezaDelRecinto<M>, number>(
    [...torres, ...piezas].map((p) => [p, p.clave ?? p.y] as const),
  );
  // Lo de detrás del medio del recinto va detrás de las casas, y bajarlo no
  // cruza ninguna; lo que baja para ir antes de algo de delante, sí.
  const deDetras = (p: PiezaDelRecinto<M>) => (p.clave ?? p.y) < contorno.centro[1];
  const porDelante = new Set<PiezaDelRecinto<M>>();
  for (let vuelta = 0; ; vuelta++) {
    const mal = aristas.filter(
      (a) => (clave.get(a.antes) as number) >= (clave.get(a.despues) as number),
    );
    if (mal.length === 0) break;
    if (vuelta === VUELTAS_DEL_ORDEN)
      throw new Error(
        `el anillo de ${contorno.rect.i0},${contorno.rect.j0} no tiene orden de pintor: ${mal
          .map(
            (a) =>
              `la ${a.antes.que} de la cara ${a.antes.cara} antes que la ${a.despues.que} de la cara ${a.despues.cara}`,
          )
          .join('; ')}`,
      );
    for (const { antes, despues } of mal) {
      const ca = clave.get(antes) as number;
      const cd = clave.get(despues) as number;
      if (ca < cd) continue;
      clave.set(antes, cd - ENTRE_TORRE_Y_PIEZA);
      if (!deDetras(despues)) porDelante.add(antes);
    }
  }
  const conSuClave = (p: PiezaDelRecinto<M>): PiezaDelRecinto<M> => {
    const c = clave.get(p) as number;
    return c === (p.clave ?? p.y) ? p : { ...p, clave: c };
  };
  return {
    torres: torres.map(conSuClave),
    piezas: piezas.map(conSuClave),
    porDelante: [...torres, ...piezas].flatMap((p, i) =>
      porDelante.has(p) ? [{ i, vieja: p.clave ?? p.y, nueva: clave.get(p) as number }] : [],
    ),
  };
}

/** Una pieza del anillo tal como se pinta: con la clave y el `x` de su sprite (`ordenDeVolumenes`). */
export interface PiezaPintada {
  readonly pieza: PiezaDelRecinto;
  readonly clave: number;
  readonly x: number;
}

/**
 * Las parejas de torre y pieza de una de sus caras que el pintor pone al revés
 * de la geometría: la que se pinta después (por su clave y, a igual clave, por
 * su `x`, `ordenDeVolumenes`) tapa en pantalla menos de la otra que la otra de
 * ella (`loQueSeTapan`), cada una dicha. Es `informe.anilloMalOrdenado`, y
 * tiene que estar vacío.
 */
export function anilloMalOrdenado(contorno: Contorno, pintadas: readonly PiezaPintada[]): string[] {
  const fuera: string[] = [];
  const torres = pintadas.filter((p) => p.pieza.que === 'torre');
  for (const p of pintadas) {
    if (p.pieza.que !== 'tramo' && p.pieza.que !== 'puerta') continue;
    const suyas = torresDeSuCara(
      p.pieza,
      contorno,
      torres.map((t) => t.pieza),
    );
    for (const t of torres.filter((t) => suyas.includes(t.pieza))) {
      const [tapaP, tapaT] = loQueSeTapan(solidoDe(p.pieza, contorno), solidoDe(t.pieza, contorno));
      const despues = p.clave - t.clave || p.x - t.x;
      const masCerca =
        tapaP > tapaT ? (p.pieza.que === 'tramo' ? 'el tramo' : 'la puerta') : 'la torre';
      if ((despues > 0 && tapaT > tapaP) || (despues < 0 && tapaP > tapaT))
        fuera.push(
          `${p.pieza.que === 'tramo' ? 'el tramo' : 'la puerta'} de la cara ${p.pieza.cara} en ${p.x.toFixed(2)},${p.pieza.y.toFixed(2)} se pinta ${despues > 0 ? 'después' : 'antes'} que la torre de ${t.x.toFixed(2)},${t.pieza.y.toFixed(2)}, y ${masCerca} está más cerca de la cámara donde se solapan (tapa ${(Math.max(tapaP, tapaT) * 1e4).toFixed(0)} frente a ${(Math.min(tapaP, tapaT) * 1e4).toFixed(0)} diezmilésimas de casilla²)`,
        );
    }
  }
  return fuera;
}
