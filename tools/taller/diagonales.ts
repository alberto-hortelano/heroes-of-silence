/**
 * Las DIAGONALES del relieve por celdas (R4, `docs/art/peticiones.md` §23): la
 * pared que mira al sureste o al suroeste, en esquina (la punta de una meseta) o
 * en rincón.
 *
 * Con las caídas por arista, una frontera en diagonal salía como una escalera de
 * frontal y ladera (#160). En el relieve por celdas (`celdas.ts`) cada vértice da
 * un tipo de pared, y el 54 % de las que se ven son diagonales. Esta familia es la
 * misma ladera de §20 doblando la esquina:
 *
 * - **Contrato de junta** (`JUNTAS`, `taludDeJunta`). Cada pieza va de una junta
 *   a otra: en la junta S (lado horizontal de casilla) el pie cae a plomo bajo el
 *   filo; en la E u O (lado vertical), en talud, como las laderas. La convexa va
 *   de la E/O a la S y la cóncava de la S a la E/O.
 * - **Un cuarto de vuelta, no un chaflán.** El filo sale de cada junta con la
 *   dirección de su vecina —vertical en la de la ladera, horizontal en la de la
 *   frontal— y gira en un cuarto de círculo de media casilla de radio, centrado en
 *   la casilla alta (convexa) o en la baja (cóncava). Un chaflán recto a 45°
 *   dejaba un codo en cada junta; así el contorno no quiebra y la esquina se lee
 *   redondeada, que es lo que pidió el usuario («evitar bordes rectos»).
 * - **Juntas abiertas**, cortadas por la línea del filo al pie, y **sin corona**:
 *   solo el labio y unas matas, como §20.
 *
 *   pnpm taller encolar --relieve [--solo=diagonales-roca-se-1,…]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import type { PapelDeDiagonal } from '../../src/client/render/escenario/catalogo.js';
import { JUNTAS, type TipoVisto, taludDeJunta } from '../../src/client/render/escenario/celdas.js';
import { mascaraDeGuia, registrarPieza } from './derivar.js';
import type { Encargo } from './encargo.js';
import {
  azarDe,
  bloque,
  DERRUBIO,
  joroba,
  LABIO,
  MATERIAL,
  MESETA,
  mata,
  type Niveles,
  onda,
  ROTURA,
} from './laderas.js';
import { ESTILO_DEL_MAPA, REFERENCIA_DE_MAPAS } from './mapa-denso.js';
import {
  DIR_GUIAS,
  FRENTE,
  Guia,
  type Material,
  NIVEL,
  type P2,
  type P3,
  SOMBRA,
} from './paredes-puentes.js';

const RAIZ = resolve(import.meta.dirname, '../..');
const PI = Math.PI;
/** El gris de los trozos del labio: el de la roca, no el claro de lo alto (`ARRIBA`). */
const LABIO_ROTO = '#bcbcbc';
/**
 * El del suroeste, de cara a la luz, más oscuro que su escarpe (`FRENTE`): con el
 * gris claro, dos de tres hojas de roca de 08-10-2026 lo pintaron como una cinta
 * clara seguida por todo el filo, que en el mapa se leía como un camino. No cae
 * en el gris del fondo (`esFondoDeGuia`), así que la máscara de la guía no cambia.
 */
const LABIO_EN_LUZ = '#6e6e6e';

/** Hacia dónde mira la diagonal: al sureste o al suroeste. Nunca se espeja. */
export type LadoDeDiagonal = 'se' | 'so';

/** Una pieza de la familia: su papel y cómo se desvían su filo y su pie de la curva base. */
export interface PiezaDeDiagonal {
  readonly nombre: string;
  readonly papel: PapelDeDiagonal;
  /** El desvío del filo y del pie hacia fuera de la meseta, a lo largo (t de 0 a 1). Nulos en las juntas. */
  readonly filo: (t: number) => number;
  readonly pie: (t: number) => number;
}

/**
 * Dos variantes por papel, distintas en el CONTORNO: la convexa `a` es una
 * punta llena y la `b` se muerde en una vaguada; el rincón `a` es hondo y el `b`
 * lleva un espolón.
 */
export const PIEZAS_DE_DIAGONAL: readonly PiezaDeDiagonal[] = [
  {
    nombre: 'convexa-a',
    papel: 'convexa',
    filo: (t) => 0.07 * joroba(t),
    pie: (t) => 0.1 * joroba(t),
  },
  {
    nombre: 'convexa-b',
    papel: 'convexa',
    filo: (t) => -0.06 * joroba(t) + 0.06 * onda(3)(t),
    pie: (t) => 0.12 * joroba(t) - 0.05 * onda(2)(t),
  },
  {
    nombre: 'concava-a',
    papel: 'concava',
    filo: (t) => -0.06 * joroba(t),
    pie: (t) => 0.06 * joroba(t),
  },
  {
    nombre: 'concava-b',
    papel: 'concava',
    filo: (t) => 0.08 * onda(2)(t),
    pie: (t) => 0.1 * joroba(t) + 0.05 * onda(3)(t),
  },
];

/** El tipo de celda de cada pieza (`celdas.ts`): de él salen sus juntas. */
export const tipoDe = (lado: LadoDeDiagonal, papel: PapelDeDiagonal): TipoVisto =>
  `${lado === 'se' ? 'SE' : 'SO'}-${papel === 'convexa' ? 'convexa' : 'concava'}`;

/**
 * La curva base de una pieza, relativa al vértice de su celda: el cuarto de
 * círculo de radio media casilla que va de su primera junta a la segunda con la
 * dirección de cada vecina, y la normal hacia lo bajo. El centro es el de la
 * casilla alta en la convexa (la meseta queda dentro de la curva) y el de la
 * baja en la cóncava (lo bajo queda dentro).
 */
export function curvaBase(
  lado: LadoDeDiagonal,
  papel: PapelDeDiagonal,
): { punto: (t: number) => P2; normal: (t: number) => P2 } {
  const [a, b] = JUNTAS[tipoDe(lado, papel)];
  // El centro: la casilla de la esquina que comparten las dos juntas.
  const centro: P2 = [a[0] + b[0], a[1] + b[1]];
  const ang = (p: Junta2) => Math.atan2(p[1] - centro[1], p[0] - centro[0]);
  const a0 = ang(a);
  let a1 = ang(b);
  // El cuarto de vuelta corto.
  if (a1 - a0 > PI) a1 -= 2 * PI;
  if (a0 - a1 > PI) a1 += 2 * PI;
  const fuera = papel === 'convexa' ? 1 : -1;
  const th = (t: number) => a0 + (a1 - a0) * t;
  return {
    punto: (t) => [centro[0] + 0.5 * Math.cos(th(t)), centro[1] + 0.5 * Math.sin(th(t))],
    normal: (t) => [fuera * Math.cos(th(t)), fuera * Math.sin(th(t))],
  };
}
type Junta2 = readonly [number, number, ...unknown[]];

/** La geometría que cuenta de cada pieza de la guía, en píxeles de la guía. */
export interface GeometriaDeDiagonal {
  readonly nombre: string;
  readonly papel: PapelDeDiagonal;
  readonly niveles: Niveles;
  /** Los filos de sus dos juntas, en el orden de `JUNTAS`. */
  readonly filo: readonly [P2, P2];
  /** Los pies de sus dos juntas. */
  readonly pie: readonly [P2, P2];
  readonly caja: readonly [number, number, number, number];
}

/** Una pieza de diagonal con el vértice de su celda en el origen de la guía. */
function dibujarDiagonal(g: Guia, p: PiezaDeDiagonal, lado: LadoDeDiagonal, niveles: Niveles) {
  const H = niveles * NIVEL;
  const [ja, jb] = JUNTAS[tipoDe(lado, p.papel)];
  const ta = Math.abs(taludDeJunta(ja[2], niveles));
  const tb = Math.abs(taludDeJunta(jb[2], niveles));
  const { punto, normal } = curvaBase(lado, p.papel);
  const azar = azarDe(`${p.nombre}-${lado}-${niveles}`);
  const pasos = 30;
  const ts = Array.from({ length: pasos + 1 }, (_, i) => i / pasos);
  // La luz viene de arriba a la izquierda: la que mira al sureste queda en
  // penumbra, como la ladera al este; la del suroeste, de cara a la luz.
  const sombra = lado === 'se';
  const suave = (amplitud: number, desde: number, hasta: number) => {
    const ondas = Array.from({ length: 3 }, () => ({
      k: desde + azar() * (hasta - desde),
      fase: azar() * 2 * PI,
      a: amplitud * (0.5 + azar() * 0.5),
    }));
    return (t: number) =>
      (Math.sin(PI * t) *
        ondas.reduce((acc, o) => acc + o.a * Math.sin(o.k * PI * t + o.fase), 0)) /
      2;
  };
  const ruidoFilo = suave(0.035, 3, 6);
  const ruidoPie = suave(0.045, 3, 7);
  const en = (t: number, d: number): P2 => {
    const [x, y] = punto(t);
    const [nx, ny] = normal(t);
    return [x + nx * d, y + ny * d];
  };
  // El talud: el de cada junta en su extremo, por la normal, y algo más en medio
  // (la pared en esquina es roca rota, no un muro a plomo).
  const talud = (t: number) => ta * (1 - t) + tb * t + 0.1 * Math.sin(PI * t);
  const filo = (t: number) => en(t, p.filo(t) + ruidoFilo(t));
  const pie = (t: number) => en(t, talud(t) + p.pie(t) + ruidoPie(t));
  const rotura = (t: number): P2 => {
    const [fx, fy] = filo(t);
    const [px, py] = pie(t);
    const k = 0.55 + 0.1 * Math.sin(5 * PI * t + 1);
    return [fx + (px - fx) * k, fy + (py - fy) * k];
  };
  const zRot = H * (1 - ROTURA);

  // El labio de roca del filo, ROTO en trozos y del gris de la roca, no del claro
  // de la meseta. Con una cinta clara seguida (la de las laderas), el piloto de
  // roca-1 (07-10-2026) lo pintó en las dos tandas como un bordillo de piedras
  // labradas en hilera, aunque el prompt de la segunda lo prohibía: la guía
  // manda más que el texto.
  const lobulos = suave(0.5, 3, 7);
  let desde = 0.03 + azar() * 0.08;
  while (desde < 0.9) {
    const hasta = Math.min(0.97, desde + 0.07 + azar() * 0.13);
    const tramo = ts.filter((t) => t >= desde && t <= hasta);
    if (tramo.length >= 2) {
      const grueso = 0.5 + azar() * 0.6;
      const borde = tramo.map((t) => [...filo(t), H] as P3);
      const dentro = tramo.map(
        (t) => [...en(t, p.filo(t) + ruidoFilo(t) - LABIO * grueso * (1 + lobulos(t))), H] as P3,
      );
      g.poligono([...borde, ...[...dentro].reverse()], sombra ? LABIO_ROTO : LABIO_EN_LUZ);
    }
    desde = hasta + 0.06 + azar() * 0.12;
  }
  // El escarpe y el derrubio.
  const escarpe = ts.map((t) => [...filo(t), H] as P3);
  const derrubio = ts.map((t) => [...rotura(t), zRot] as P3);
  const pies = ts.map((t) => [...pie(t), 0] as P3);
  g.poligono([...escarpe, ...[...derrubio].reverse()], sombra ? SOMBRA : FRENTE);
  g.poligono([...derrubio, ...[...pies].reverse()], DERRUBIO);
  // Canales de derrubio desde la caída 2, como en las laderas. En el rincón no:
  // es estrecho, y el canal, una franja clara del filo al derrubio, volvió pintado
  // en las cóncavas de caída 2 como un canto claro seguido bajo el filo (lote de
  // 07-10-2026). Las tiradas de `azar` se hacen igual, para que el resto de la
  // guía (matas y bloques) no se mueva.
  for (let k = 0; k < niveles - 1; k++) {
    const t = 0.25 + 0.5 * ((k + 0.5 + (azar() - 0.5) * 0.6) / Math.max(1, niveles - 1));
    const [fx, fy] = filo(t);
    const [rx, ry] = rotura(t);
    const [tx, ty] = [punto(t + 0.03)[0] - punto(t)[0], punto(t + 0.03)[1] - punto(t)[1]];
    const ancho = 0.9 + azar() * 0.5;
    if (p.papel === 'concava') continue;
    g.poligono(
      [
        [fx, fy, H - 0.05],
        [rx - tx * ancho, ry - ty * ancho, zRot],
        [rx + tx * ancho * 0.4, ry + ty * ancho * 0.4, zRot * 0.9],
        [fx + tx * ancho * 0.5, fy + ty * ancho * 0.5, H - 0.08],
      ],
      DERRUBIO,
    );
  }
  // Matas sueltas en la meseta, junto al filo.
  for (let k = 0; k < 3; k++) {
    const t = 0.12 + 0.76 * azar();
    const [x, y] = en(t, p.filo(t) - 0.04 - azar() * 0.1);
    mata(g, x, y, H, 0.03 + azar() * 0.03, azar);
  }
  // Bloques sueltos por el derrubio y al pie, de atrás adelante.
  const bloques: { x: number; y: number; r: number; h: number; z: number }[] = [];
  for (let k = 0; k < 4 + niveles; k++) {
    const t = 0.08 + 0.84 * azar();
    const enPie = azar() < 0.6;
    // Más pequeños que en las laderas: los del piloto volvieron como cubos grandes al pie.
    const r = enPie ? 0.03 + azar() * 0.04 : 0.025 + azar() * 0.03;
    const [rx, ry] = rotura(t);
    const [px, py] = pie(t);
    const u = enPie ? 0.95 + azar() * 0.15 : azar();
    const x = rx + (px - rx) * u;
    const y = ry + (py - ry) * u;
    const z = enPie ? 0 : zRot * (1 - Math.min(1, u));
    bloques.push({ x, y, r, h: r * (0.7 + azar() * 0.6), z });
  }
  for (const b of bloques.sort((u, v) => u.y - v.y))
    bloque(g, b.x, b.y, b.r, b.h, b.z, azar, sombra);
}

/** El filo y el pie de las dos juntas de una pieza, en píxeles de la guía. */
function geometria(
  g: Guia,
  p: PiezaDeDiagonal,
  lado: LadoDeDiagonal,
  niveles: Niveles,
  caja: GeometriaDeDiagonal['caja'],
): GeometriaDeDiagonal {
  const H = niveles * NIVEL;
  const [ja, jb] = JUNTAS[tipoDe(lado, p.papel)];
  const r = (q: P2): P2 => [Math.round(q[0]), Math.round(q[1])];
  const filo = (j: typeof ja): P2 => r(g.p([j[0], j[1], H]));
  const pie = (j: typeof ja): P2 => r(g.p([j[0] + taludDeJunta(j[2], niveles), j[1], 0]));
  return {
    nombre: p.nombre,
    papel: p.papel,
    niveles,
    filo: [filo(ja), filo(jb)],
    pie: [pie(ja), pie(jb)],
    caja,
  };
}

const LIENZO: readonly [number, number] = [1536, 1024];

/** La guía de una hoja: las cuatro piezas en una fila, con el pie de todas en la misma línea. */
export function guiaDeDiagonales(
  lado: LadoDeDiagonal,
  niveles: Niveles,
): { guia: Guia; piezas: GeometriaDeDiagonal[]; casilla: number } {
  const [ancho, alto] = LIENZO;
  const medidas = PIEZAS_DE_DIAGONAL.map((p) => {
    const m = new Guia(ancho, alto, 1, 0, 0);
    dibujarDiagonal(m, p, lado, niveles);
    return { p, ...m.caja };
  });
  const HUECO = 0.5;
  const anchoTotal = medidas.reduce((a, m) => a + (m.x1 - m.x0), 0) + HUECO * (medidas.length + 1);
  const altoMax = Math.max(...medidas.map((m) => m.y1 - m.y0));
  const t = Math.floor(Math.min(ancho / anchoTotal, alto / (altoMax + 2 * HUECO)));
  const g = new Guia(ancho, alto, t, 0, 0);
  const libre = (ancho - t * medidas.reduce((a, m) => a + (m.x1 - m.x0), 0)) / (medidas.length + 1);
  const suelo = (alto + altoMax * t) / 2;
  const piezas: GeometriaDeDiagonal[] = [];
  let x = libre;
  for (const m of medidas) {
    g.ox = x - m.x0 * t;
    g.oy = suelo - m.y1 * t;
    const sola = new Guia(ancho, alto, t, g.ox, g.oy);
    dibujarDiagonal(sola, m.p, lado, niveles);
    dibujarDiagonal(g, m.p, lado, niveles);
    piezas.push(
      geometria(g, m.p, lado, niveles, [
        Math.round(sola.caja.x0),
        Math.round(sola.caja.y0),
        Math.round(sola.caja.x1),
        Math.round(sola.caja.y1),
      ]),
    );
    x += (m.x1 - m.x0) * t + libre;
  }
  return { guia: g, piezas, casilla: t };
}

// ------------------------------------------------------------- los encargos

const DICHO_DEL_PAPEL: Readonly<Record<LadoDeDiagonal, Record<PapelDeDiagonal, string>>> = {
  se: {
    convexa:
      'ESQUINA (convexa): la PUNTA de una meseta. El filo baja de lo alto de la imagen casi vertical (ahí sigue una ladera que cae a la derecha) y gira redondeado en un cuarto de vuelta hasta salir por la IZQUIERDA en horizontal (ahí sigue una pared frontal que mira a la cámara). La meseta queda DENTRO de la curva, arriba a la izquierda; la pared mira hacia abajo a la derecha, al sureste.',
    concava:
      'RINCÓN (cóncavo): el filo entra por la DERECHA en horizontal (ahí sigue una pared frontal) y gira redondeado en un cuarto de vuelta hasta salir por ABAJO casi vertical (ahí sigue una ladera que cae a la derecha). La meseta queda FUERA de la curva, arriba y a la izquierda; lo bajo, dentro del rincón, abajo a la derecha, y la pared mira hacia ahí.',
  },
  so: {
    convexa:
      'ESQUINA (convexa): la PUNTA de una meseta. El filo baja de lo alto de la imagen casi vertical (ahí sigue una ladera que cae a la izquierda) y gira redondeado en un cuarto de vuelta hasta salir por la DERECHA en horizontal (ahí sigue una pared frontal que mira a la cámara). La meseta queda DENTRO de la curva, arriba a la derecha; la pared mira hacia abajo a la izquierda, al suroeste.',
    concava:
      'RINCÓN (cóncavo): el filo entra por la IZQUIERDA en horizontal (ahí sigue una pared frontal) y gira redondeado en un cuarto de vuelta hasta salir por ABAJO casi vertical (ahí sigue una ladera que cae a la izquierda). La meseta queda FUERA de la curva, arriba y a la derecha; lo bajo, dentro del rincón, abajo a la izquierda, y la pared mira hacia ahí.',
  },
};

const LUZ: Readonly<Record<LadoDeDiagonal, string>> = {
  se: 'La pared mira al SURESTE y la luz viene de arriba a la IZQUIERDA: el escarpe queda en penumbra, con la luz rozando solo las aristas de las losas y el filo; el derrubio, más tendido, recibe algo más de luz.',
  // La segunda frase, tras el lote (07-10-2026): el suroeste seguía saliendo en
  // bloques de caras planas y lisas iluminadas, en todos los materiales, y en el
  // mapa se leía como una escalera de dados al lado de la penumbra del sureste.
  // Pedir «luz rasante y estratos inclinados» o decir que el labio no es claro
  // (08-10-2026) dio en las dos veces un labio claro seguido que en el mapa se
  // leía como una senda: nombrar el labio lo atrae. Se queda la frase corta, y el
  // labio lo oscurece la guía (`LABIO_EN_LUZ`).
  so: 'La pared mira al SUROESTE y la luz viene de arriba a la izquierda: la pared recibe la luz de lleno y es lo más iluminado de cada módulo; las sombras de las grietas y de los bloques caen hacia la derecha y hacia abajo. Es otra pieza distinta, no el reflejo de una pared al sureste. Que reciba la luz de lleno no la hace de bloques: la roca sigue siendo la de losas inclinadas, rotas y desplazadas de la ladera de la imagen 3, nunca cubos, dados ni prismas con la cara de delante plana e iluminada, y el filo nunca se remata con una fila de piedras. Se rompe como la pared hermana de la imagen 5, que mira al sureste: losas cortas, rotas e inclinadas, con grietas y escamas que llenan de pequeñas sombras la cara iluminada; nunca prismas en fila ni caras planas y lisas.',
};

export const NIVELES_DE_DIAGONAL: readonly Niveles[] = [1, 2, 3];
export const LADOS_DE_DIAGONAL: readonly LadoDeDiagonal[] = ['se', 'so'];

/** La hoja de diagonales de un material, lado y caída: `diagonales-roca-se-1`. */
export const hojaDeDiagonales = (material: Material, lado: LadoDeDiagonal, niveles: Niveles) =>
  `diagonales-${material}-${lado}-${niveles}`;

export function encargoDeDiagonales(
  material: Material,
  lado: LadoDeDiagonal,
  niveles: Niveles,
): Encargo {
  const nombres = PIEZAS_DE_DIAGONAL.map((p) => p.nombre);
  const caida = niveles === 1 ? 'UN nivel' : niveles === 2 ? 'DOS niveles' : 'TRES niveles';
  const orden = PIEZAS_DE_DIAGONAL.map(
    (p, i) =>
      `columna ${i + 1} (${p.nombre}): ${DICHO_DEL_PAPEL[lado][p.papel]}${i % 2 === 1 ? ' Distinta de la de su izquierda en el contorno, como marca la guía.' : ''}`,
  ).join('\n');
  return {
    id: `modulos-${hojaDeDiagonales(material, lado, niveles)}`,
    tipo: 'modulos',
    descripcion: [
      `Una hoja de ${nombres.length} módulos de RISCO EN DIAGONAL para el mapa de aventura de un juego de estrategia: el borde de una meseta que cae ${caida} y DOBLA LA ESQUINA, de ${MATERIAL[material]}. La forma de las piedras, rotas y angulosas, es la de los peñascos de la imagen 2. Es la MISMA ROCA que la ladera de la imagen 3, su vecina en el mapa: el mismo color, la misma textura, los mismos estratos rotos, el mismo musgo y las mismas matas, doblando la esquina; tienen que casar sin que se note la junta.`,
      'CADA MÓDULO ES UN TROZO CORTADO DE UN MISMO RISCO LARGO Y CONTINUO: por sus dos extremos sigue en otros módulos. Los dos extremos están CORTADOS LIMPIOS por la diagonal del filo al pie que marca la guía, sin cerrarse, sin redondearse, sin rematar en una mata, un pilar ni un bloque; la roca y el derrubio siguen hasta el corte como si continuaran fuera de la imagen.',
      'EL FILO GIRA EN CURVA SUAVE, un cuarto de vuelta redondeado como marca la guía, nunca en ángulo ni en chaflán recto; su contorno se rompe en salientes de roca, repisas y bloques. Ninguna línea recta ni vertical larga.',
      'La pared es un TALUD NATURAL, no un muro: arriba, bajo el filo, un escarpe de losas y estratos ROTOS, desplazados y agrietados, con repisas con algo de musgo; abajo, un derrubio de piedras y bloques angulosos de tamaños muy distintos que se abre hacia el pie. NUNCA columnas, prismas, pilares, órganos ni bloques apilados como sillares, NUNCA una losa lisa grande, y nada asoma por encima del filo.',
      `ENCIMA DEL FILO NO HAY NINGUNA FRANJA NI CINTA: la meseta, ${MESETA[material]}, la pone el juego. Solo el labio de roca del filo (los trozos sueltos de gris de la guía), estrecho, roto y a trozos, con huecos donde la meseta llega al borde sin labio, y unas pocas matas sueltas y pequeñas de color apagado (los borrones claros de la guía); entre ellas, transparente. Nada de verde amarillo ni de colores vivos.`,
      // La primera tanda (07-10-2026) pintó el labio como un bordillo de piedras
      // labradas en hilera, la pared en prismas y el pie con cubos grandes; el
      // `resume` para corregirlo cortó tres veces («websocket closed»), así que
      // se rehizo desde cero con esto dicho de entrada.
      'EL LABIO NO ES UN BORDILLO NI UN MURETE: nada de piedras labradas, adoquines ni bloques puestos en hilera siguiendo la curva del filo. Es el borde ROTO e irregular de la misma roca de la pared, fino y mellado, con musgo y alguna mata.',
      'LA SILUETA DE CADA MÓDULO ES LA DE LA GUÍA (imagen 4), CALCADA: mismo sitio, mismo alto, mismo ancho y la misma curva, sin girarla, tumbarla ni ensancharla. Lo gris oscuro es el escarpe, lo gris medio el derrubio, los polígonos claros, bloques.',
      'DEL LADO DE LA MESETA NO HAY NADA: no pintes roca, pared ni sombra por detrás del labio; ahí la imagen es transparente. No es una cresta ni un muro con dos caras.',
      orden,
      'Al pie, POCOS bloques angulosos, pequeños y de formas irregulares, medio enterrados en el derrubio y amontonados sin orden; nunca cubos grandes, bolas redondas ni piedras en fila. Donde la guía pone un bloque claro grande, una roca rota y achaparrada.',
      LUZ[lado],
      ESTILO_DEL_MAPA,
    ].join('\n'),
    referencias: [
      { ruta: REFERENCIA_DE_MAPAS, papel: 'estilo' },
      // Como las laderas (§20): la forma, de los peñascos.
      { ruta: 'assets/mapa/modulos/rocas-caidas.webp', papel: 'identidad' },
      // La ladera de su material, lado y caída, y no la frontal: es la vecina con
      // la que encadena en el mapa, y con la frontal (en columnas) el piloto salió
      // de otro estilo (§23). Su color ya casa con la frontal (§20).
      {
        ruta: `assets/mapa/modulos/laderas-${material}-${lado === 'se' ? 'este' : 'oeste'}-${niveles}.webp`,
        papel: 'material',
      },
      { ruta: `${DIR_GUIAS}/diagonales-${lado}-${niveles}.png`, papel: 'guia' },
      // El suroeste, de cara a la luz, salía en cubos y con el labio claro; su
      // hermana del sureste, en penumbra, no: de ella se toma cómo se rompe la
      // roca y el labio, no la orientación (la manda la guía, la 4).
      ...(lado === 'so'
        ? [
            {
              ruta: `assets/mapa/modulos/${hojaDeDiagonales(material, 'se', niveles)}.webp`,
              papel: 'material' as const,
            },
          ]
        : []),
    ],
    salida: `assets/mapa/modulos/${hojaDeDiagonales(material, lado, niveles)}`,
    fondo: 'transparente',
    cuantos: nombres.length,
    nombres,
  };
}

/** Escribe la guía de cada hoja de diagonales y su geometría (`diagonales-<lado>-<niveles>.json`). */
export async function escribirGuiasDeDiagonales(): Promise<string[]> {
  const escritas: string[] = [];
  for (const lado of LADOS_DE_DIAGONAL)
    for (const n of NIVELES_DE_DIAGONAL) {
      const { guia, piezas, casilla } = guiaDeDiagonales(lado, n);
      const nombre = `diagonales-${lado}-${n}`;
      const png = await sharp(Buffer.from(guia.svg())).png().toBuffer();
      await writeFile(join(RAIZ, DIR_GUIAS, `${nombre}.png`), png);
      await writeFile(
        join(RAIZ, DIR_GUIAS, `${nombre}.json`),
        `${JSON.stringify({ ancho: guia.ancho, alto: guia.alto, casilla, labio: LABIO, piezas }, null, 1)}\n`,
      );
      escritas.push(`${DIR_GUIAS}/${nombre}.png`);
    }
  return escritas;
}

/** La guía de una hoja de diagonales: `diagonales-roca-se-1` sale de `diagonales-se-1`. */
export function guiaDeHojaDeDiagonales(hoja: string): string {
  const m = /^diagonales-[a-z]+-(se|so)-([123])$/.exec(hoja);
  if (m === null)
    throw new Error(
      `«${hoja}» no es una hoja de diagonales (diagonales-<material>-<se|so>-<1|2|3>)`,
    );
  return `diagonales-${m[1]}-${m[2]}`;
}

/**
 * Apunta en el índice de una hoja de diagonales las juntas de cada módulo
 * (`JuntasDeDiagonal`): dónde caen sus dos filos, en píxeles del módulo
 * (`registrarPieza` sobre su pieza de la guía), y su papel.
 */
export async function escribirDiagonalesDerivadas(hoja: string): Promise<string> {
  const dir = join(RAIZ, 'assets/mapa/modulos');
  const guia = join(RAIZ, DIR_GUIAS, guiaDeHojaDeDiagonales(hoja));
  const geometrias = (
    JSON.parse(await readFile(`${guia}.json`, 'utf8')) as { piezas: GeometriaDeDiagonal[] }
  ).piezas;
  const mascara = await mascaraDeGuia(`${guia}.png`);
  const ruta = join(dir, `${hoja}.json`);
  const indice = JSON.parse(await readFile(ruta, 'utf8')) as {
    modulos: { imagen: string; diagonal?: unknown }[];
  };
  for (const mod of indice.modulos) {
    const nombre = mod.imagen.replace(/\.webp$/, '');
    const g = geometrias.find((p) => p.nombre === nombre);
    if (g === undefined) throw new Error(`${hoja}: la guía no tiene la pieza «${nombre}»`);
    const enElModulo = await registrarPieza(join(dir, hoja, mod.imagen), mascara, g);
    mod.diagonal = { filo: [enElModulo(g.filo[0]), enElModulo(g.filo[1])], papel: g.papel };
  }
  await writeFile(ruta, `${JSON.stringify(indice, null, 2)}\n`);
  return ruta.replace(`${RAIZ}/`, '');
}
