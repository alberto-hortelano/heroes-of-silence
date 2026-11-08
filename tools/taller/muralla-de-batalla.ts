/**
 * El arte de la muralla del tablero de batalla (06-11-2026, «falta arte para el
 * muro en combate, lo que hay ahora son placeholders, también para la
 * escalera»): las guías de geometría, los encargos a Codex y el índice que lee
 * el lienzo. Las medidas son las de `src/shared/muralla-de-batalla.ts`, que
 * lee también el lienzo: la guía se dibuja con ellas y la pieza pintada se
 * registra por su caja de lo opaco.
 *
 * Las piezas son materiales que el lienzo lleva a su sitio, no una columna
 * pintada (el tablero cambia de elevación de cámara): por eso se piden **de
 * frente y sin perspectiva**, como un alzado, y el lienzo las pone con una afín
 * sobre cada cara (`render/arte-de-la-muralla.ts`).
 *
 *   pnpm taller encolar --muralla-batalla [--solo=cara-piedra,…] [--rehacer]
 *   pnpm taller derivar-muralla-batalla     rehace assets/batalla/muralla/indice.json
 *
 * Las portadas cerradas son la edición de su abierta (papel `edita`): se
 * encolan cuando la abierta ya está en disco.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { MaterialDeMuralla } from '../../src/core/battle/types.js';
import {
  ALTO_DE_MURALLA,
  CARPETA_DE_LA_MURALLA,
  ESCALERA,
  type IndiceDeLaMuralla,
  LADO_DEL_HEX,
  type MedidaDePieza,
  PIEZA_DE_LA_ESCALERA,
  PIEZAS_DE_LA_MURALLA,
  PORTADA,
  REMATE_DEL_MURO,
  RODAJAS_DE_LA_CARA,
  TODAS_LAS_PIEZAS_DE_LA_MURALLA,
} from '../../src/shared/muralla-de-batalla.js';
import { RAIZ } from '../comun/raiz.js';
import type { Encargo } from './encargo.js';
import { ARRIBA, FONDO, FRENTE, SOMBRA } from './paredes-puentes.js';

/** Dónde van las piezas, dentro del repo. */
export const DIR_DE_LA_MURALLA = `assets/${CARPETA_DE_LA_MURALLA}`;
/** Las guías: fuera del build (`seCopiaAlBuild` deja fuera toda carpeta `_guias/`). */
export const DIR_DE_SUS_GUIAS = `${DIR_DE_LA_MURALLA}/_guias`;
/** El índice que lee el lienzo: las cajas de cada pieza pintada. */
export const INDICE_DE_LA_MURALLA = `${DIR_DE_LA_MURALLA}/indice.json`;

/** El estilo: el fondo del campo de batalla, sobre el que se pinta la muralla. */
const ESTILO_DE_LA_BATALLA = 'assets/rpg/campo.webp';

/** Lo que se dice del estilo en cada encargo: el del campo y las figuras de la batalla. */
const ESTILO =
  'Estilo de la imagen de estilo: pintura digital detallada de fantasía medieval, como una maqueta en miniatura, con mucho detalle menudo (juntas, grietas, musgo, vetas, clavos), paleta terrosa y algo apagada, sin colores vivos ni aspecto de juego para móvil.';

/** Cada material: de qué se hace y de qué referencia se toma. */
const MATERIALES: Readonly<
  Record<
    MaterialDeMuralla,
    { referencia: string; deMaterial: string; lienzo: string; remate: string; tapa: string }
  >
> = {
  piedra: {
    referencia: 'assets/mapa/modulos/recinto.webp',
    deMaterial:
      'la piedra de la muralla de la imagen 2: sillares grises y pardos bien escuadrados, con musgo y verdín en las juntas',
    lienzo:
      'un lienzo de MURALLA DE PIEDRA de sillares grandes en hiladas regulares a tresbolillo, con alguna piedra más clara o más oscura, grietas finas, musgo en las juntas de abajo y una moldura corrida de piedra (un cordón) bajo el remate',
    remate:
      'ALMENAS de piedra: merlones macizos con la albardilla algo saliente, y entre ellos el vano de la almena',
    tapa: 'el suelo de un ADARVE de muralla visto exactamente desde arriba: losas de piedra gris y parda de tamaños distintos, gastadas por el paso, con juntas oscuras, algo de musgo y tierra en ellas y alguna losa rota',
  },
  madera: {
    referencia: 'assets/mapa/nodo-empalizada.webp',
    deMaterial:
      'la madera de la empalizada de la imagen 2: troncos descortezados de madera parda, con vetas, nudos y grietas, y ataduras de cuerda y flejes de hierro oscuro',
    lienzo:
      'una EMPALIZADA de troncos verticales gruesos y apretados, uno junto a otro sin huecos, de madera parda con vetas y nudos, atados con dos travesaños horizontales de madera y cuerda a un tercio y a dos tercios del alto',
    remate:
      'las PUNTAS AFILADAS de los troncos, talladas a hachazos en punta de lápiz, una por tronco',
    tapa: 'el suelo de un ADARVE de madera visto exactamente desde arriba: tablones gruesos y toscos de madera parda puestos uno junto a otro, con vetas, nudos, grietas y clavos de hierro, algo de tierra en las juntas',
  },
};

// ------------------------------------------------------------------ las guías

/** Un dibujo SVG en pasos: `t` píxeles por paso, el origen en (`ox`, `oy`) y lo alto hacia arriba. */
class Plano2D {
  private readonly capas: string[] = [];
  constructor(
    readonly ancho: number,
    readonly alto: number,
    readonly t: number,
    readonly ox: number,
    readonly oy: number,
  ) {}
  /** Un punto en pasos (`x` a la derecha, `z` hacia arriba desde el suelo) en píxeles. */
  p(x: number, z: number): [number, number] {
    return [this.ox + x * this.t, this.oy - z * this.t];
  }
  poligono(
    puntos: readonly (readonly [number, number])[],
    relleno: string,
    trazo = '#262626',
  ): void {
    const d = puntos
      .map(([x, z]) =>
        this.p(x, z)
          .map((v) => v.toFixed(1))
          .join(','),
      )
      .join(' ');
    this.capas.push(
      `<polygon points="${d}" fill="${relleno}" stroke="${trazo}" stroke-width="2" stroke-linejoin="round"/>`,
    );
  }
  rect(x0: number, z0: number, x1: number, z1: number, relleno: string, trazo = '#262626'): void {
    this.poligono(
      [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ],
      relleno,
      trazo,
    );
  }
  svg(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.ancho}" height="${this.alto}"><rect width="100%" height="100%" fill="${FONDO}"/>${this.capas.join('')}</svg>`;
  }
}

/** Un plano de `ancho × alto` px que encaja `w × h` pasos (de `x = -w/2` a `w/2`, de `z = 0` a `h`) en su `lleno`. */
function planoPara(ancho: number, alto: number, w: number, h: number, lleno: number): Plano2D {
  const t = Math.floor(Math.min((ancho * lleno) / w, (alto * lleno) / h));
  return new Plano2D(ancho, alto, t, ancho / 2, alto / 2 + (h / 2) * t);
}

/** Lo que mide de ancho el lienzo de una cara: `RODAJAS_DE_LA_CARA` caras de hex. */
const ANCHO_DE_LA_CARA = RODAJAS_DE_LA_CARA * LADO_DEL_HEX;

/**
 * La guía de una cara: el lienzo de muro de `RODAJAS_DE_LA_CARA` caras de ancho
 * y `ALTO_DE_MURALLA` de alto, y encima su remate. Las almenas (o las estacas)
 * van a compás de las rodajas, dos merlones o cuatro estacas por cada una, para
 * que el corte de una rodaja caiga en un vano y no parta una almena.
 */
function guiaDeLaCara(material: MaterialDeMuralla): Plano2D {
  const g = planoPara(1536, 1024, ANCHO_DE_LA_CARA, ALTO_DE_MURALLA + REMATE_DEL_MURO, 0.9);
  const x0 = -ANCHO_DE_LA_CARA / 2;
  const alto = ALTO_DE_MURALLA;
  if (material === 'piedra') {
    g.rect(x0, 0, -x0, alto, FRENTE);
    // El cordón bajo el remate.
    g.rect(x0, alto - 0.07, -x0, alto, ARRIBA);
    for (let r = 0; r < RODAJAS_DE_LA_CARA; r++) {
      for (const c of [0.25, 0.75]) {
        const mitad = 0.19 * LADO_DEL_HEX;
        const x = x0 + (r + c) * LADO_DEL_HEX;
        g.rect(x - mitad, alto, x + mitad, alto + REMATE_DEL_MURO, ARRIBA);
      }
    }
  } else {
    const estacas = 4 * RODAJAS_DE_LA_CARA;
    const w = ANCHO_DE_LA_CARA / estacas;
    for (let i = 0; i < estacas; i++) {
      const a = x0 + i * w;
      g.poligono(
        [
          [a, 0],
          [a + w, 0],
          [a + w, alto],
          [a + w / 2, alto + REMATE_DEL_MURO],
          [a, alto],
        ],
        i % 2 === 0 ? FRENTE : ARRIBA,
      );
    }
    for (const z of [alto / 3, (2 * alto) / 3]) g.rect(x0, z - 0.05, -x0, z + 0.05, SOMBRA);
  }
  return g;
}

/** La guía de una portada: la fachada de `PORTADA` con su remate y, en el hueco, el fondo (no se pinta). */
function guiaDeLaPortada(material: MaterialDeMuralla): Plano2D {
  const { mitad, hueco, arco, flecha, hojaAbierta } = PORTADA;
  const g = planoPara(1024, 1024, 2 * mitad, ALTO_DE_MURALLA + REMATE_DEL_MURO, 0.82);
  const alto = ALTO_DE_MURALLA;
  // La fachada menos el hueco: el contorno de fuera y, por dentro, el arco.
  const arranque = arco - flecha;
  const curva: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI - (Math.PI * i) / 24;
    curva.push([hueco * Math.cos(a), arranque + flecha * Math.sin(a)]);
  }
  g.poligono(
    [[-mitad, 0], [-hueco, 0], ...curva, [hueco, 0], [mitad, 0], [mitad, alto], [-mitad, alto]],
    FRENTE,
  );
  // Las dos hojas abiertas, abatidas contra las jambas.
  for (const s of [-1, 1]) {
    const a = s * hueco;
    const b = s * (hueco - hojaAbierta);
    g.poligono(
      [
        [a, 0],
        [b, 0],
        [b, arranque - 0.06],
        [a, arranque],
      ],
      SOMBRA,
    );
  }
  // El remate: almenas o puntas, como en la cara.
  if (material === 'piedra') {
    const n = 5;
    const w = (2 * mitad) / (2 * n - 1);
    for (let k = 0; k < n; k++) {
      const x = -mitad + 2 * k * w;
      g.rect(x, alto, x + w, alto + REMATE_DEL_MURO, ARRIBA);
    }
  } else {
    const estacas = 14;
    const w = (2 * mitad) / estacas;
    for (let i = 0; i < estacas; i++) {
      const a = -mitad + i * w;
      g.poligono(
        [
          [a, alto],
          [a + w, alto],
          [a + w / 2, alto + REMATE_DEL_MURO],
        ],
        ARRIBA,
      );
    }
  }
  return g;
}

/** La guía de la escalera: dos largueros y sus peldaños, derecha y de frente. */
function guiaDeLaEscalera(): Plano2D {
  const { ancho, largo } = ESCALERA;
  const g = planoPara(1024, 1536, ancho * 1.3, largo, 0.88);
  const grueso = 0.055;
  const peldanos = 9;
  for (let i = 0; i < peldanos; i++) {
    const z = ((i + 0.6) / peldanos) * largo;
    g.rect(-ancho / 2, z - 0.025, ancho / 2, z + 0.025, ARRIBA);
  }
  for (const s of [-1, 1]) {
    const x = (s * ancho) / 2;
    g.rect(x - grueso / 2, 0, x + grueso / 2, largo, FRENTE);
  }
  return g;
}

/** El nombre de la guía de cada pieza que lleva una. */
function guiaDe(pieza: string): Plano2D | null {
  for (const [m, p] of Object.entries(PIEZAS_DE_LA_MURALLA) as [
    MaterialDeMuralla,
    (typeof PIEZAS_DE_LA_MURALLA)[MaterialDeMuralla],
  ][]) {
    if (pieza === p.cara) return guiaDeLaCara(m);
    if (pieza === p.abierta) return guiaDeLaPortada(m);
  }
  if (pieza === PIEZA_DE_LA_ESCALERA) return guiaDeLaEscalera();
  return null;
}

/** Escribe las guías en `_guias/` y devuelve sus rutas. */
export async function escribirGuiasDeLaMuralla(): Promise<string[]> {
  await mkdir(join(RAIZ, DIR_DE_SUS_GUIAS), { recursive: true });
  const escritas: string[] = [];
  for (const pieza of TODAS_LAS_PIEZAS_DE_LA_MURALLA) {
    const g = guiaDe(pieza);
    if (g === null) continue;
    const ruta = `${DIR_DE_SUS_GUIAS}/${pieza}.png`;
    await writeFile(join(RAIZ, ruta), await sharp(Buffer.from(g.svg())).png().toBuffer());
    escritas.push(ruta);
  }
  return escritas;
}

// ---------------------------------------------------------------- los encargos

const guiaDeLaPieza = (pieza: string): string => `${DIR_DE_SUS_GUIAS}/${pieza}.png`;

/** Lo que se dice de la cámara de un alzado: el lienzo lo pone sobre cada cara con su escorzo. */
const DE_FRENTE =
  'ALZADO DE FRENTE: la cámara mira de frente y a la altura, ortográfica, SIN perspectiva ni escorzo y sin enseñar lo de arriba ni los costados (el juego lo pega sobre las caras del muro con su propio ángulo). Las verticales, verticales; las horizontales, horizontales.';

function encargoDeLaCara(material: MaterialDeMuralla): Encargo {
  const m = MATERIALES[material];
  const pieza = PIEZAS_DE_LA_MURALLA[material].cara;
  return {
    id: `batalla-${pieza}`,
    tipo: 'imagen',
    descripcion: [
      `Un trozo recto de muralla para el tablero de batalla de un juego de estrategia por turnos: ${m.lienzo}, rematado arriba por ${m.remate}.`,
      `LA SILUETA, LAS PROPORCIONES Y LA POSICIÓN SON LAS DE LA GUÍA (imagen 3): el rectángulo gris es el lienzo del muro, de borde a borde de la imagen y de abajo hasta la moldura; lo de encima, el remate, con sus ${material === 'piedra' ? 'merlones exactamente donde están los rectángulos claros de la guía (diez, a compás)' : 'puntas exactamente donde están los picos de la guía (una por tronco)'}. Cópialo con ese tamaño y en ese sitio. El lienzo llega a los bordes izquierdo y derecho y al de abajo SIN margen ni remate lateral: es un trozo de una muralla más larga, cortado a plomo por los dos lados, sin torres, sin esquinas, sin contrafuertes y sin puerta.`,
      `Los materiales y la paleta: ${m.deMaterial}. Luz uniforme en todo el lienzo, sin una sombra que lo cruce: el juego oscurece él las caras que quedan a la sombra.`,
      DE_FRENTE,
      'Sin suelo al pie, sin hierba, sin estandartes ni banderas. Lo de encima del remate y entre sus merlones o sus puntas es transparente.',
      ESTILO,
    ].join('\n'),
    referencias: [
      { ruta: ESTILO_DE_LA_BATALLA, papel: 'estilo' },
      { ruta: m.referencia, papel: 'material' },
      { ruta: guiaDeLaPieza(pieza), papel: 'guia' },
    ],
    salida: `${DIR_DE_LA_MURALLA}/${pieza}`,
    fondo: 'transparente',
    lleno: true,
  };
}

function encargoDeLaTapa(material: MaterialDeMuralla): Encargo {
  const m = MATERIALES[material];
  const pieza = PIEZAS_DE_LA_MURALLA[material].tapa;
  return {
    id: `batalla-${pieza}`,
    tipo: 'textura',
    descripcion: `${m.tapa}. Los materiales y la paleta, los de la imagen 2 (${m.deMaterial}); el acabado, el de la imagen 1.`,
    referencias: [
      { ruta: ESTILO_DE_LA_BATALLA, papel: 'estilo' },
      { ruta: m.referencia, papel: 'material' },
    ],
    salida: `${DIR_DE_LA_MURALLA}/${pieza}`,
    fondo: 'opaco',
  };
}

function encargoDeLaAbierta(material: MaterialDeMuralla): Encargo {
  const m = MATERIALES[material];
  const pieza = PIEZAS_DE_LA_MURALLA[material].abierta;
  const portada =
    material === 'piedra'
      ? 'la PORTADA de una puerta de muralla de piedra: una fachada de sillares con un ARCO rebajado ancho abajo, con su rosca de dovelas bien marcada, jambas de piedra y, encima del arco, el muro hasta el remate de almenas'
      : 'la PORTADA de una puerta de empalizada: una fachada de troncos verticales afilados con un vano ancho abajo, enmarcado por dos postes gruesos y un dintel de tronco curvado algo arqueado, y encima del vano la empalizada hasta las puntas';
  return {
    id: `batalla-${pieza}`,
    tipo: 'imagen',
    descripcion: [
      `Para el tablero de batalla de un juego de estrategia por turnos, ${portada}. La puerta está ABIERTA: sus dos hojas de madera recia con flejes de hierro están abatidas hacia dentro y se ven de canto, pegadas a cada jamba, como dos tiras estrechas.`,
      `LA SILUETA, LAS PROPORCIONES Y LA POSICIÓN SON LAS DE LA GUÍA (imagen 3): el gris medio es la fachada, con su contorno de fuera; el hueco del arco (el gris del fondo dentro de la fachada) es el PASO, por donde se ve lo de detrás: píntalo TRANSPARENTE, sin suelo, sin sombra y sin nada al fondo; las dos tiras oscuras a los lados del hueco son las hojas abiertas; y arriba, el remate, ${material === 'piedra' ? 'con los merlones donde los rectángulos claros' : 'con las puntas donde los picos'}. Cópialo con exactitud: el arco tan ancho y tan alto como en la guía.`,
      `Los materiales y la paleta: ${m.deMaterial}. Las hojas, de madera oscura con herrajes de hierro.`,
      DE_FRENTE,
      'Sin torres a los lados, sin suelo, sin escalones, sin estandartes ni banderas. Un único objeto, entero.',
      ESTILO,
    ].join('\n'),
    referencias: [
      { ruta: ESTILO_DE_LA_BATALLA, papel: 'estilo' },
      { ruta: m.referencia, papel: 'material' },
      { ruta: guiaDeLaPieza(pieza), papel: 'guia' },
    ],
    salida: `${DIR_DE_LA_MURALLA}/${pieza}`,
    fondo: 'transparente',
    lleno: true,
  };
}

/** La cerrada es la edición de su abierta: la misma fachada con las hojas cerradas. */
function encargoDeLaCerrada(material: MaterialDeMuralla): Encargo {
  const p = PIEZAS_DE_LA_MURALLA[material];
  return {
    id: `batalla-${p.cerrada}`,
    tipo: 'imagen',
    descripcion: [
      'El ÚNICO cambio: la puerta se CIERRA. Las dos hojas de madera recia con flejes y clavos de hierro, que en la imagen 1 están abatidas contra las jambas, giran hasta juntarse en el medio y TAPAN EL HUECO del arco entero, de jamba a jamba y del suelo a la rosca del arco, vistas de frente: dos tableros de tablones verticales con dos bandas de hierro cada uno y la junta en el medio.',
      'La fachada, el arco, el remate, la luz, el tamaño y la posición de todo se quedan exactamente como en la imagen 1. Fuera de la fachada, transparente como en ella.',
    ].join('\n'),
    referencias: [{ ruta: `${DIR_DE_LA_MURALLA}/${p.abierta}.webp`, papel: 'edita' }],
    salida: `${DIR_DE_LA_MURALLA}/${p.cerrada}`,
    fondo: 'transparente',
    lleno: true,
  };
}

function encargoDeLaEscalera(): Encargo {
  return {
    id: `batalla-${PIEZA_DE_LA_ESCALERA}`,
    tipo: 'imagen',
    descripcion: [
      'Una ESCALERA DE MANO de asalto para el tablero de batalla de un juego de estrategia por turnos: dos largueros de tronco delgado descortezado y peldaños de rama atados a ellos con cuerda, tosca, recia y algo gastada, de madera parda.',
      'LA SILUETA, LAS PROPORCIONES Y LA POSICIÓN SON LAS DE LA GUÍA (imagen 3): derecha y vertical, los dos largueros donde las barras grises largas y los peldaños donde las cortas, del mismo largo y ancho que en la guía.',
      'Los materiales y la paleta: la madera parda y la cuerda de la imagen 2.',
      DE_FRENTE,
      'Sola, sin muro, sin suelo, sin nadie subiendo. Un único objeto, entero.',
      ESTILO,
    ].join('\n'),
    referencias: [
      { ruta: ESTILO_DE_LA_BATALLA, papel: 'estilo' },
      { ruta: MATERIALES.madera.referencia, papel: 'material' },
      { ruta: guiaDeLaPieza(PIEZA_DE_LA_ESCALERA), papel: 'guia' },
    ],
    salida: `${DIR_DE_LA_MURALLA}/${PIEZA_DE_LA_ESCALERA}`,
    fondo: 'transparente',
  };
}

/**
 * Los encargos de la muralla de batalla, en el orden en que se pintan. Una
 * portada cerrada solo entra si su abierta ya está en disco (es su edición);
 * `esperan` dice cuáles se quedaron fuera por eso.
 */
export function encargosDeLaMurallaDeBatalla(): { encargos: Encargo[]; esperan: string[] } {
  const encargos: Encargo[] = [];
  const esperan: string[] = [];
  for (const m of Object.keys(MATERIALES) as MaterialDeMuralla[]) {
    encargos.push(encargoDeLaCara(m), encargoDeLaTapa(m), encargoDeLaAbierta(m));
    const p = PIEZAS_DE_LA_MURALLA[m];
    if (existsSync(join(RAIZ, `${DIR_DE_LA_MURALLA}/${p.abierta}.webp`)))
      encargos.push(encargoDeLaCerrada(m));
    else esperan.push(p.cerrada);
  }
  encargos.push(encargoDeLaEscalera());
  return { encargos, esperan };
}

// -------------------------------------------------------------------- el índice

/** Lo opaco de una imagen (alfa ≥ 128) y, por fila, cuánto de su ancho. */
async function medir(ruta: string, esCara: boolean): Promise<MedidaDePieza> {
  const { data, info } = await sharp(ruta)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let [x0, y0, x1, y1] = [w, h, -1, -1];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if ((data[(y * w + x) * 4 + 3] as number) >= 128) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  if (y1 < 0) throw new Error(`${ruta} no tiene nada opaco`);
  const caja = [x0, y0, x1 + 1, y1 + 1] as const;
  if (!esCara) return { ancho: w, alto: h, caja };
  // El cuerpo de una cara: la primera fila, desde arriba, opaca en casi todo su
  // ancho. Lo de encima es el remate, con sus vanos.
  const ancho = x1 + 1 - x0;
  for (let y = y0; y <= y1; y++) {
    let llenos = 0;
    for (let x = x0; x <= x1; x++) if ((data[(y * w + x) * 4 + 3] as number) >= 128) llenos++;
    if (llenos >= ancho * 0.97) return { ancho: w, alto: h, caja, cuerpo: y };
  }
  throw new Error(
    `${ruta}: no hay ninguna fila opaca de borde a borde: no es el lienzo de un muro`,
  );
}

/**
 * Mide cada pieza que está en disco: lo que no está, no entra, y el lienzo pinta
 * su marcador. Lo escribe `escribirIndiceDeLaMuralla` y lo vuelve a medir
 * `test/muralla-de-batalla-arte.test.ts`, que exige el mismo índice.
 */
export async function medirLaMuralla(): Promise<IndiceDeLaMuralla> {
  const dir = join(RAIZ, DIR_DE_LA_MURALLA);
  await mkdir(dir, { recursive: true });
  const hay = new Set((await readdir(dir)).filter((f) => f.endsWith('.webp')));
  const caras = new Set(Object.values(PIEZAS_DE_LA_MURALLA).map((p) => p.cara));
  const indice: Record<string, MedidaDePieza> = {};
  for (const pieza of TODAS_LAS_PIEZAS_DE_LA_MURALLA) {
    if (!hay.has(`${pieza}.webp`)) continue;
    indice[pieza] = await medir(join(dir, `${pieza}.webp`), caras.has(pieza));
  }
  return indice;
}

/** Escribe el índice que lee el lienzo (`INDICE_DE_LA_MURALLA`) con lo que mide `medirLaMuralla`. */
export async function escribirIndiceDeLaMuralla(): Promise<string> {
  await writeFile(
    join(RAIZ, INDICE_DE_LA_MURALLA),
    `${JSON.stringify(await medirLaMuralla(), null, 1)}\n`,
  );
  return INDICE_DE_LA_MURALLA;
}

/** ¿Es la salida de un encargo una pieza de la muralla de batalla? */
export const esDeLaMurallaDeBatalla = (salida: string): boolean =>
  salida.startsWith(`${DIR_DE_LA_MURALLA}/`);
