/**
 * Los módulos del escenario: piezas PEQUEÑAS y MUCHAS (un árbol, un pico, un
 * tramo de muro de una casilla, una mata) que el escenógrafo (`colocar.ts`)
 * junta en formaciones grandes: un bosque son cientos de árboles apretados, una
 * cordillera cientos de picos, y así no se ve el «objeto suelto sobre un suelo»
 * que tenía la primera composición.
 *
 * Se piden en hojas de 4×4 o 4×2, porque dentro de una imagen la coherencia de
 * estilo y escala es casi perfecta. Cada módulo se recorta a su tamaño NATIVO
 * —no se reescala como un icono—, así que el tamaño relativo dentro de una hoja
 * se conserva, y lleva su ancla en la base, como las piezas del mapa.
 */
import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { ALFA_FIGURA, type Caja, componentes, enFilas } from '../empaquetar.js';
import type { Encargo } from '../encargo.js';
import { REFERENCIA_DE_MAPAS } from '../mapa-denso.js';
import type { Raster } from '../recorte.js';

/** El estilo, dicho con palabras: el de la referencia (ver `ESTILO_DEL_MAPA`). */
const ESTILO =
  'Estilo de la imagen de estilo: fantasía medieval oscura, pintura digital muy detallada como una maqueta en miniatura, paleta apagada y poco saturada (verdes oliva y musgo oscuros, grises pizarra, pardos, rojos óxido), sombras profundas, luz tenue desde arriba a la izquierda.';

export interface HojaDeModulos {
  readonly id: string;
  /** Qué hay en la hoja, en una frase. */
  readonly describe: string;
  /** Cuántos módulos, en una rejilla de 4 columnas. */
  readonly cuantos: 8 | 16;
  /**
   * Si los módulos tienen papel fijo (el muro: horizontal, en profundidad…), su
   * nombre en orden de lectura, y entonces la rejilla tiene que salir exacta.
   * Sin nombres, vale cualquier número de módulos a partir de la mitad.
   */
  readonly nombres?: readonly string[];
  /** Una lámina aprobada que fija el material, además de la referencia de estilo. */
  readonly identidad?: string;
}

const LAMINA_A = 'assets/mapa/muestras/denso-a.webp';
const LAMINA_B = 'assets/mapa/muestras/denso-b.webp';

/** Las piezas del muro, en el orden de la rejilla de 4×2. */
export const PIEZAS_DE_MURO = [
  'horizontal',
  'profundidad',
  'diagonal-baja',
  'diagonal-sube',
  'torre-redonda',
  'torre-cuadrada',
  'extremo',
  'contrafuerte',
] as const;

const MURO_DESCRIBE = [
  '1. un tramo recto de muralla que corre de izquierda a derecha, de cara a la cámara, de UNA casilla de largo (el doble de largo que de alto)',
  '2. el mismo tramo, pero corriendo hacia el FONDO: se aleja de la cámara, visto desde su extremo, estrecho y en escorzo',
  '3. el mismo tramo en DIAGONAL: de arriba a la izquierda hacia abajo a la derecha',
  '4. el mismo tramo en DIAGONAL: de abajo a la izquierda hacia arriba a la derecha',
  '5. una torre redonda almenada, algo más alta que el muro, que tapa la junta de dos tramos',
  '6. una torre cuadrada almenada, del mismo alto',
  '7. el final roto de un tramo: sillares caídos',
  '8. un contrafuerte bajo de piedra',
].join('; ');

export const HOJAS: readonly HojaDeModulos[] = [
  // Árboles: un árbol (o un grupo de dos) por módulo, para apretarlos a cientos.
  {
    id: 'pinos',
    cuantos: 16,
    identidad: LAMINA_A,
    describe:
      'dieciséis pinos y abetos verde oscuro sueltos, de alturas distintas (de pequeño a grande), algunos solos y otros en pareja',
  },
  {
    id: 'frondosos',
    cuantos: 16,
    identidad: LAMINA_A,
    describe:
      'dieciséis árboles de hoja ancha sueltos (robles, hayas, castaños), de copa redonda verde oliva y algunos con tonos otoñales, de tamaños distintos',
  },
  {
    id: 'abetos-nevados',
    cuantos: 16,
    identidad: LAMINA_A,
    describe:
      'dieciséis abetos cargados de nieve sueltos, de alturas distintas, algunos solos y otros en pareja',
  },
  {
    id: 'muertos',
    cuantos: 16,
    identidad: LAMINA_A,
    describe:
      'dieciséis árboles muertos de ciénaga sueltos: troncos retorcidos sin hojas, con raíces al aire y musgo colgando, de tamaños distintos',
  },
  // Picos: uno por módulo, de tamaños muy distintos, para formar cordilleras.
  {
    id: 'picos-roca',
    cuantos: 16,
    identidad: LAMINA_B,
    describe:
      'dieciséis picos de montaña de roca gris sueltos, escarpados, de tamaños muy distintos (de una roca grande a una montaña alta), algunos con un poco de nieve en la cumbre',
  },
  {
    id: 'picos-nevados',
    cuantos: 16,
    identidad: LAMINA_B,
    describe:
      'dieciséis picos de montaña nevados sueltos, roca oscura y nieve blanca con sombras azuladas, de tamaños muy distintos',
  },
  {
    id: 'picos-volcan',
    cuantos: 16,
    identidad: LAMINA_B,
    describe:
      'dieciséis picos volcánicos de basalto negro sueltos, con grietas de lava incandescente, de tamaños muy distintos',
  },
  {
    id: 'picos-arenisca',
    cuantos: 16,
    identidad: LAMINA_A,
    describe:
      'dieciséis farallones y picos de arenisca roja sueltos, estriados, de tamaños muy distintos',
  },
  // Muros: un tramo por eje y las torres que tapan las juntas.
  {
    id: 'muro',
    cuantos: 8,
    nombres: PIEZAS_DE_MURO,
    identidad: LAMINA_A,
    describe: `ocho piezas de UNA misma muralla de piedra gris con musgo, todas al mismo alto: ${MURO_DESCRIBE}`,
  },
  {
    id: 'ruina',
    cuantos: 8,
    nombres: PIEZAS_DE_MURO,
    identidad: LAMINA_A,
    describe: `ocho piezas de UNA misma muralla en RUINA, derruida, con hierba entre las piedras y huecos, todas al mismo alto: ${MURO_DESCRIBE}`,
  },
  // La cubierta del suelo: lo que quita el suelo desnudo.
  {
    id: 'cubierta-grass',
    cuantos: 16,
    describe:
      'dieciséis detalles PEQUEÑOS de pradera: matas de hierba alta, arbustos, helechos, flores silvestres, piedras con musgo, un tocón, un arbusto espinoso; todos bajos y pequeños',
  },
  {
    id: 'cubierta-dirt',
    cuantos: 16,
    describe:
      'dieciséis detalles PEQUEÑOS de tierra de labranza: parcelas de cultivo cuadradas (trigo, coles, barbecho) vistas desde arriba en escorzo, una cerca de madera, un almiar, una carreta, piedras, matas',
  },
  {
    id: 'cubierta-sand',
    cuantos: 16,
    describe:
      'dieciséis detalles PEQUEÑOS de desierto rojo: piedras de arenisca, matojos secos, huesos blanqueados, un cactus pequeño, rocas rojas bajas',
  },
  {
    id: 'cubierta-snow',
    cuantos: 16,
    describe:
      'dieciséis detalles PEQUEÑOS de nieve: abetos jóvenes nevados, rocas con nieve, ventisqueros, matas heladas',
  },
  {
    id: 'cubierta-swamp',
    cuantos: 16,
    describe:
      'dieciséis detalles PEQUEÑOS de ciénaga: matas de juncos, charcas pequeñas de agua turbia, tocones podridos, setas, raíces',
  },
  {
    id: 'cubierta-lava',
    cuantos: 16,
    describe:
      'dieciséis detalles PEQUEÑOS de tierra volcánica: rocas de basalto, grietas con brasas, fumarolas pequeñas, piedras negras',
  },
  {
    id: 'cubierta-rough',
    cuantos: 16,
    describe:
      'dieciséis detalles PEQUEÑOS de tierra rocosa: guijarros, rocas grises bajas, matas secas, un arbusto ralo',
  },
  // Bordes de relieve y de agua.
  {
    id: 'rocas-caidas',
    cuantos: 16,
    describe:
      'dieciséis grupos de rocas grises caídas y peñascos bajos de tamaños distintos, para el pie de un acantilado y el borde de una meseta, algunos con matas',
  },
  {
    id: 'orilla',
    cuantos: 16,
    describe:
      'dieciséis detalles de ORILLA de río: matas de juncos, piedras redondeadas húmedas, barro, troncos caídos, nenúfares, sin el agua',
  },
  // Pueblos variados: hasta ahora todos eran la misma pieza. Las ciudades ya no
  // tienen hoja: son un recinto que compone la escena (`recinto.ts`, 20-10-2026).
  {
    id: 'pueblos',
    cuantos: 8,
    identidad: 'assets/mapa/pueblo.webp',
    describe:
      'ocho PUEBLOS abiertos distintos, sin murallas: grupos de cuatro a siete casas de piedra y entramado con tejados de paja o teja, un pozo, una capilla o un molino, huertos y cercas; sin estandartes ni banderas',
  },
  // Picos afilados para el centro de una cordillera: los de roca son
  // achaparrados y una cordillera entera de ellos se leía como pedregal.
  {
    id: 'picos-afilados',
    cuantos: 16,
    identidad: LAMINA_B,
    describe:
      'dieciséis picos de montaña de roca oscura sueltos, ALTOS Y AFILADOS como agujas, mucho más altos que anchos, con aristas marcadas y un poco de nieve en algunas cumbres; de tamaños distintos, de una aguja mediana a una montaña muy alta',
  },
  // Paredes de acantilado: lo que levanta una meseta. Trozos de pared vertical
  // vistos de frente, para ponerlos en fila a lo largo de cada caída.
  {
    id: 'paredes-roca',
    cuantos: 16,
    identidad: LAMINA_A,
    describe:
      'dieciséis trozos de PARED DE ACANTILADO de roca gris con musgo, vistos de frente: caras verticales altas de roca columnar, más anchos que altos o tan anchos como altos, con el borde de arriba cubierto de matas y el pie con rocas caídas; cada uno de un ancho distinto',
  },
  {
    id: 'paredes-arenisca',
    cuantos: 16,
    identidad: LAMINA_A,
    describe:
      'dieciséis trozos de PARED DE ACANTILADO de arenisca roja estriada, vistos de frente: caras verticales altas, con el borde de arriba irregular y el pie con bloques caídos; cada uno de un ancho distinto',
  },
  {
    id: 'paredes-basalto',
    cuantos: 16,
    identidad: LAMINA_A,
    describe:
      'dieciséis trozos de PARED DE ACANTILADO de basalto negro en columnas, vistos de frente, con alguna grieta de brasa; caras verticales altas de anchos distintos',
  },
  {
    id: 'paredes-nevadas',
    cuantos: 16,
    identidad: LAMINA_A,
    describe:
      'dieciséis trozos de PARED DE ACANTILADO de roca oscura con nieve en el borde de arriba y en los salientes, vistos de frente; caras verticales altas de anchos distintos',
  },
  // Atmósfera.
  {
    id: 'nubes',
    cuantos: 8,
    describe:
      'ocho nubes y bancos de niebla grises, densos y suaves, vistos desde arriba, como las nubes del borde de la imagen de estilo',
  },
];

export function hoja(id: string): HojaDeModulos {
  const h = HOJAS.find((x) => x.id === id);
  if (h === undefined)
    throw new Error(`no hay hoja de módulos «${id}». Hay: ${HOJAS.map((x) => x.id).join(', ')}`);
  return h;
}

export function encargoDeModulos(h: HojaDeModulos): Encargo {
  return {
    id: `modulos-${h.id}`,
    tipo: 'modulos',
    descripcion: [
      `Una hoja de módulos para componer el mapa de aventura de un juego de estrategia: ${h.describe}.`,
      'Son piezas para juntar a cientos y formar bosques, cordilleras y murallas continuas como las de la imagen de estilo: cada módulo es el objeto SOLO, sin peana ni trozo de suelo debajo, para posarlo sobre el terreno.',
      ESTILO,
    ].join('\n'),
    referencias: [
      { ruta: REFERENCIA_DE_MAPAS, papel: 'estilo' },
      ...(h.identidad === undefined ? [] : [{ ruta: h.identidad, papel: 'identidad' as const }]),
    ],
    salida: `assets/mapa/modulos/${h.id}`,
    fondo: 'transparente',
    cuantos: h.cuantos,
    ...(h.nombres === undefined ? {} : { nombres: [...h.nombres] }),
  };
}

export function encargosDeModulos(): Encargo[] {
  return HOJAS.map(encargoDeModulos);
}

/** Las texturas del relieve y del agua: tipo `textura`, repetibles como las del suelo. */
export const TEXTURAS_DE_RELIEVE = [
  {
    id: 'cara-roca',
    describe:
      'una pared vertical de roca gris vista DE FRENTE: roca estriada y agrietada en columnas verticales, con musgo en las grietas',
  },
  {
    id: 'cara-arenisca',
    describe:
      'una pared vertical de arenisca roja vista DE FRENTE: estratos y columnas estriadas, rojo óxido',
  },
  {
    id: 'cara-basalto',
    describe:
      'una pared vertical de basalto negro vista DE FRENTE: columnas de basalto con alguna grieta de brasa',
  },
  {
    id: 'cara-nevada',
    describe:
      'una pared vertical de roca oscura vista DE FRENTE con nieve en los salientes y carámbanos',
  },
  {
    id: 'agua',
    describe:
      'el agua oscura de un río de montaña vista desde arriba: azul verdoso profundo con ondas suaves y algún reflejo',
  },
  {
    id: 'barro',
    describe:
      'el barro húmedo de una orilla visto desde arriba: limo pardo oscuro con guijarros y hierba aplastada',
  },
] as const;

export function encargoDeTexturaDeRelieve(t: (typeof TEXTURAS_DE_RELIEVE)[number]): Encargo {
  return {
    id: `textura-${t.id}`,
    tipo: 'textura',
    descripcion: `Una textura para el mapa de aventura de un juego de estrategia: ${t.describe}. Del mismo acabado que las rocas, el agua y el barro de la imagen de estilo. ${ESTILO}`,
    referencias: [{ ruta: REFERENCIA_DE_MAPAS, papel: 'estilo' }],
    salida: `assets/mapa/texturas/${t.id}`,
    fondo: 'opaco',
  };
}

// ------------------------------------------------------------------ el proceso

export interface Modulo {
  readonly imagen: string;
  readonly sha256: string;
  readonly ancho: number;
  readonly alto: number;
  /** El centro de su base, en píxeles de su imagen. */
  readonly ancla: readonly [number, number];
}

const MARGEN = 4;

/** El ancla de un recorte: la mediana de x de la franja baja (15 %) y la fila más baja. */
export function anclaDe(r: Raster): [number, number] {
  const { data, width, height } = r;
  let y1 = -1;
  let y0 = height;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if ((data[(y * width + x) * 4 + 3] as number) >= ALFA_FIGURA) {
        if (y < y0) y0 = y;
        y1 = y;
        break;
      }
  if (y1 < 0) throw new Error('un módulo sin nada opaco');
  const franja = Math.max(2, Math.round((y1 - y0 + 1) * 0.15));
  const xs: number[] = [];
  for (let y = y1 - franja + 1; y <= y1; y++)
    for (let x = 0; x < width; x++)
      if ((data[(y * width + x) * 4 + 3] as number) >= ALFA_FIGURA) xs.push(x);
  xs.sort((a, b) => a - b);
  return [xs[Math.floor(xs.length / 2)] as number, y1];
}

/** Recorta una caja de un raster, con margen, a su tamaño nativo. */
export function recortarCaja(r: Raster, c: Caja, margen = MARGEN): Raster {
  const x0 = Math.max(0, c.x0 - margen);
  const y0 = Math.max(0, c.y0 - margen);
  const x1 = Math.min(r.width - 1, c.x1 + margen);
  const y1 = Math.min(r.height - 1, c.y1 + margen);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    r.data.copy(data, y * w * 4, ((y0 + y) * r.width + x0) * 4, ((y0 + y) * r.width + x1 + 1) * 4);
  return { data, width: w, height: h };
}

/** Cuántos módulos lleva cada fila de una hoja de `n`: de cuatro en cuatro, y la última con lo que quede. */
export function modulosPorFila(n: number): number[] {
  return Array.from({ length: Math.ceil(n / 4) }, (_, f) => Math.min(4, n - 4 * f));
}

/**
 * Las cajas de los módulos de una hoja. Con nombres, la rejilla exacta (lanza si
 * no sale); sin ellos, todas las figuras, en orden de lectura, y al menos la
 * mitad de las pedidas.
 */
export function cajasDeModulos(r: Raster, cuantos: number, nombres?: readonly string[]): Caja[] {
  // Por píxeles conexos y no por cajas: en una hoja apretada las cajas de dos
  // módulos se solapan aunque sus píxeles no se toquen, y \`figuras\` las fundía.
  const figs = componentes(r);
  if (nombres !== undefined) {
    const mayor = Math.max(0, ...figs.map((c) => c.area));
    return enFilas(
      figs.filter((c) => c.area >= mayor * 0.02),
      Math.ceil(nombres.length / 4),
      modulosPorFila(nombres.length),
    ).flat();
  }
  // Lo que no llega al 2 % del mayor es una mota suelta, no un módulo.
  const mayor = Math.max(0, ...figs.map((c) => c.area));
  const utiles = figs.filter((c) => c.area >= mayor * 0.02);
  if (utiles.length < cuantos / 2) {
    throw new Error(`la hoja pedía ${cuantos} módulos y salen ${utiles.length}: se tocan o faltan`);
  }
  // Más piezas que módulos: un módulo viene en trozos sueltos (un pueblo son
  // casas, pozo y huerto; un campo, parcela y cerca). Se agrupan por celda de la
  // rejilla, y si la rejilla no sale limpia se quedan sueltos.
  if (utiles.length > cuantos) {
    try {
      return enFilas(
        figs.filter((c) => c.area >= mayor * 0.005),
        Math.ceil(cuantos / 4),
        4,
      ).flat();
    } catch {
      // Sin rejilla clara: cada pieza, un módulo.
    }
  }
  return utiles.sort((a, b) => {
    const fa = Math.round((a.y0 + a.y1) / 2 / (r.height / 4));
    const fb = Math.round((b.y0 + b.y1) / 2 / (r.height / 4));
    return fa - fb || a.x0 - b.x0;
  });
}

/** Parte la hoja y escribe cada módulo con su JSON; devuelve el índice. */
export async function escribirModulos(
  r: Raster,
  salida: string,
  cuantos: number,
  nombres?: readonly string[],
): Promise<Modulo[]> {
  const cajas = cajasDeModulos(r, cuantos, nombres);
  const dir = salida;
  // Se rehace entera: un recorte anterior con más módulos dejaría ficheros sueltos.
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const indice: Modulo[] = [];
  for (const [i, c] of cajas.entries()) {
    const m = recortarCaja(r, c);
    const nombre = nombres?.[i] ?? String(i + 1);
    const bytes = await sharp(m.data, { raw: { width: m.width, height: m.height, channels: 4 } })
      .webp({ quality: 90, alphaQuality: 100, effort: 6 })
      .toBuffer();
    const imagen = `${nombre}.webp`;
    await writeFile(join(dir, imagen), bytes);
    indice.push({
      imagen,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      ancho: m.width,
      alto: m.height,
      ancla: anclaDe(m),
    });
  }
  await mkdir(dirname(dir), { recursive: true });
  return indice;
}
