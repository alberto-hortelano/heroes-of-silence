/**
 * El arte de la base como un solo cuadro (`docs/agents/2026-10-09-base-caminable/`,
 * vuelta 3): la plaza en `tramos` cuadros de 1536×1024, cada uno pedido de una
 * vez con todos sus edificios para que compartan luz, perspectiva y suelo.
 *
 * Por tramo, dos encargos y uno por cada mejora:
 * - **maestro** (`fuentes/maestro-t<n>`): la plaza con el primer eslabón de cada
 *   sitio del tramo. Lleva el estilo, la GUÍA DE LA PLAZA (el empedrado, el umbral
 *   pedido de cada puerta, la silueta de un adulto como vara de medir y, en cada
 *   borde que da a otro tramo, la JUNTA: un pilar y un árbol alto) y la hoja con
 *   los edificios proporcionados de la vuelta 1. Los tramos no se piden unos con
 *   otros: la junta cae dentro del árbol y el suelo es del juego (ver abajo);
 * - **placa** (`fuentes/placa-t<n>`): el maestro editado sin los edificios. Lo
 *   que el juego pinta (`tramo-<n>.webp`) se deriva de ella: solo lo que hay por
 *   encima de su pie (`recorte-base.ts`);
 * - **edición** (`fuentes/edicion-<id>`): el eslabón anterior editado cambiando
 *   solo ese edificio.
 *
 * Cada edificio se recorta luego por la diferencia con la placa, en su región
 * (`recorte-base.ts`). La geometría no se impone: dónde quedó cada puerta se mide
 * sobre el cuadro y se escribe en `data/bases/<f>.json` («manda el cuadro»). Las
 * guías y las hojas de identidad se escriben en `fuentes/`, que se commitea y no
 * va al build (`tools/build/publico.ts`).
 *
 * Sin arte, la escena pinta un cielo, un muro bajo y cada edificio como un bloque
 * con su nombre (`render/base/pintar.ts`): el nigromante va así este ciclo.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { ALTO_DE_FIGURA } from '../../src/client/render/proyeccion.js';
import {
  SITIOS,
  type SitioId,
  sitioDe,
  sitioDeEdificio,
  sitiosDeLaBase,
} from '../../src/core/town/sitios.js';
import type { FactionId } from '../../src/core/types.js';
import {
  columnasALaVista,
  type Disposicion,
  disposicionDe,
  filaDelPanorama,
  TRAMO,
} from '../../src/shared/base.js';
import { IMAGENES } from './codex.js';
import type { Encargo } from './encargo.js';
import { MUESTRA_ELEGIDA } from './mapa.js';
import { ESTILO_DE_FACCION } from './unidades.js';

const RAIZ = resolve(import.meta.dirname, '../..');

/** Dónde va el arte de la base de una facción (servido en `/bases/<facción>/`). */
export const dirDeLaBase = (f: FactionId): string => `assets/bases/${f}`;
/** Lo que solo lee el taller: maestros, ediciones, guías e identidades. No va al build. */
const dirDeFuentes = (f: FactionId): string => `${dirDeLaBase(f)}/fuentes`;

/** El adulto de la vara de medir, en píxeles del tramo: 0,95 pasos, el mismo de la batalla. */
export const ADULTO_EN_EL_CUADRO = Math.round(ALTO_DE_FIGURA.normal * TRAMO.pxPorPaso);
/** La puerta que se pide, en píxeles del tramo: 1,2-1,3 pasos, un poco más alta que el adulto. */
const PUERTA_EN_EL_CUADRO = [
  Math.round(1.2 * TRAMO.pxPorPaso),
  Math.round(1.3 * TRAMO.pxPorPaso),
] as const;
/** La silueta va a un lado de la puerta: lo que mide media puerta y media figura. La lee `vista-base`. */
export const APARTE = 78;

/**
 * La junta entre dos tramos, en píxeles del tramo: lo que ocupa, en cada borde
 * que da a otro tramo, el árbol alto con su pilar que se pide en la guía. Dos
 * tramos pedidos por separado no casan píxel a píxel (en F2, ni con el final del
 * anterior en el lienzo: Codex subió la plaza 55 px justo después), así que la
 * costura se esconde en algo vertical y frondoso que llene el alto: el suelo lo
 * pone el juego (`suelo.webp`) y el cielo y las casas quedan detrás del árbol.
 * Más ancha que `SOLAPE`, donde se funden los dos.
 */
export const JUNTA = { ancho: 176, pilar: 72, altoDelPilar: 170 } as const;

/** Qué bordes de un tramo dan a otro: el izquierdo desde el segundo, el derecho hasta el penúltimo. */
const juntasDelTramo = (d: Pick<Disposicion, 'tramos'>, n: number) =>
  ({ izq: n > 1, der: n < d.tramos }) as const;

/**
 * Lo que se pinta de cada mejora de la base templaria, por su id del catálogo: lo
 * lee su edición (`encargoDeEdicion`). El primer eslabón de cada sitio no lleva: va
 * en el maestro de su tramo, nombrado (`NOMBRE_EN_EL_CUADRO`) y con su hoja de
 * identidad. Las moradas no tienen mejora (19-10-2026): las ediciones de las
 * mejoras del caballero se borraron con ellas.
 */
export const DESCRIPCION_DE_LOS_TEMPLARIOS: Readonly<Record<string, string>> = {
  town_hall:
    'la casa consistorial: el mismo ayuntamiento crecido, con una torre del reloj de piedra, balcón de madera y un estandarte blanco con cruz roja',
  city_hall:
    // Las dos torres, encima de las alas que ya tiene: en F3, puestas a los lados,
    // el palacio salía 60 px más ancho y se metía en la choza y el castillo.
    'el palacio municipal: el mismo edificio hecho palacio, EXACTAMENTE DEL MISMO ANCHO que la casa consistorial que sustituye: sus dos alas se levantan en dos torres (encima de las alas, no a los lados), escalinata de piedra, vidrieras y estandartes con cruz roja',
  mage_guild_2:
    // Sin anexo al lado: en la plaza la torre tiene a la taberna pegada y el anexo
    // se le metía encima (primer intento de F3); crece en alto, no a lo ancho.
    'el mismo gremio de magia crecido EN ALTO, con el MISMO ANCHO: la torre con una planta más, un mirador con un telescopio de latón en lo alto y vidrieras; sin anexos ni alas a los lados',
};

/** Cómo se nombra cada edificio en el prompt del cuadro, con el número de la guía delante. */
const NOMBRE_EN_EL_CUADRO: Readonly<Record<string, string>> = {
  village_hall: 'el ayuntamiento',
  castle: 'el castillo',
  mage_guild_1: 'la torre del gremio de magos',
  tavern: 'la taberna',
  marketplace: 'el mercado cubierto',
  armory: 'la armería',
  // Lo que pintan los maestros de las moradas que los templarios heredaron del
  // caballero (19-10-2026): el 2 y el 4 se quedaron sin edificio.
  templarios_pueblo: 'la choza de los campesinos (el pueblo)',
  templarios_forja: 'el cuartel de piqueros (la forja)',
  templarios_establos: 'los establos de la caballería',
  templarios_monasterio: 'la iglesia de los paladines (el monasterio)',
};

/**
 * El edificio de la vuelta 1 que da la identidad de cada uno: el crudo de Codex,
 * suelto y proporcionado, por su hilo en `~/.codex/generated_images/` (los hilos
 * salen de las colas de hecho de la base del caballero, con los ids de entonces). De los seis de la
 * segunda prueba, el mismo crudo que entonces; de los demás, el último intento.
 * Solo hacen falta para escribir las hojas de `fuentes/`, que se commitean.
 */
const CRUDO_DE_LA_VUELTA_1: Readonly<Record<string, string>> = {
  village_hall:
    '01a1204c-822b-7c83-b3cc-b4b3a6933daf/exec-981297fa-e476-4182-a3d2-6cf37e0658e8.png',
  town_hall: '01a12050-cc40-79a0-b5fb-c3140bfeb5e3/exec-18995499-e86c-48e1-a9db-0a6dab6ebec9.png',
  city_hall: '01a12052-16d9-7161-9a69-68b20161b40d/exec-af4ee8d6-d831-4901-ad43-a11f16cbf907.png',
  castle: '01a12046-9b82-7fd3-b3a0-301347180901/exec-4906bb1d-e914-46c1-bee6-f836f31cedea.png',
  mage_guild_1:
    '01a1204b-5c33-7bb2-8adb-e5cbbd80b136/exec-a3f3dbe4-aad6-4288-bae3-24321b58dfa3.png',
  mage_guild_2:
    '01a1204f-cbbf-7ef3-86cc-ebfc3124abb0/exec-874fad78-ff12-4b8b-afd8-6c6ec218a1a8.png',
  tavern: '01a1204b-c14b-7fa2-bdac-d65df8f5c9f2/exec-c1477ad4-2c85-4286-803d-80ac63275fde.png',
  marketplace: '01a1204b-7179-79b1-b6e8-804cc54347ae/exec-97159b62-7bea-45c5-854b-e8d6bcf5f060.png',
  armory: '01a12046-512f-7130-a7a8-f5b5126e5b32/exec-9f2dcd06-e9d5-42e5-b766-aa06302c75e0.png',
  templarios_pueblo:
    '01a12047-dec0-7e93-b7ad-31aedd45edd7/exec-d7762283-39e8-45bb-bac9-bb42397ea540.png',
  templarios_forja:
    '01a12048-5208-7662-a6d9-c65364032071/exec-6db2edac-0a60-4ed8-a755-dac17eed83e4.png',
  templarios_establos:
    '01a1204a-09b3-79f1-b8f9-9f1040596620/exec-5c7f683f-9754-4752-9313-2a0ca15ffd11.png',
  templarios_monasterio:
    '01a1204a-32b3-7f83-a61b-fc4c5417eaa3/exec-7c3d8a18-6da8-4490-9124-88bfcbcfc319.png',
};

/**
 * De qué edificio es mejora cada uno: el eslabón anterior de la cadena de su
 * sitio (`sitioDeEdificio`), que es la que lee el núcleo.
 */
function edificioDeAntes(id: string, faccion: FactionId): string | null {
  const { cadena } = sitioDeEdificio(faccion, id);
  const i = cadena.indexOf(id);
  return i === 0 ? null : (cadena[i - 1] as string);
}

/** Cada mejora de la base, sitio a sitio: el edificio, su sitio y el eslabón al que mejora. */
export function* mejorasDe(
  f: FactionId,
): Generator<{ readonly sitio: SitioId; readonly id: string; readonly antes: string }> {
  for (const s of sitiosDeLaBase(f)) {
    for (const [i, id] of s.cadena.entries()) {
      if (i > 0) yield { sitio: s.id, id, antes: s.cadena[i - 1] as string };
    }
  }
}

/** El estilo de la facción del juego en las láminas de `assets/art/`. */
const ESTILO_DE_LA_BASE: Readonly<Record<FactionId, string>> = ESTILO_DE_FACCION;

/** Los sitios de un tramo, de izquierda a derecha por su puerta: el número de cada uno en la guía. */
export function sitiosDelTramo(d: Disposicion, tramo: number): SitioId[] {
  return SITIOS.filter((s) => d.sitios[s].tramo === tramo).sort(
    (a, b) => d.sitios[a].umbral.enElCuadro[0] - d.sitios[b].umbral.enElCuadro[0],
  );
}

/**
 * Dónde se PIDE la puerta de cada uno de los `n` sitios de un tramo, en su
 * columna: repartidas a partes iguales por lo que se ve de él. Es lo que dibuja
 * la guía y lo que lleva un tramo aún sin medir; lo pintado manda luego.
 */
function puertasPedidas(d: Disposicion, tramo: number, n: number): number[] {
  const vista = columnasALaVista(d, tramo);
  const juntas = juntasDelTramo(d, tramo);
  // Las puertas, entre las juntas: el árbol de la junta no tapa ningún edificio.
  const desde = juntas.izq ? Math.max(vista.desde, JUNTA.ancho) : vista.desde;
  const hasta = juntas.der ? Math.min(vista.hasta, TRAMO.ancho - JUNTA.ancho) : vista.hasta;
  return Array.from({ length: n }, (_, k) => Math.round(desde + ((hasta - desde) * (k + 0.5)) / n));
}

/** El primer eslabón de un sitio: lo que pinta el maestro. */
const primero = (f: FactionId, s: SitioId): string => sitioDe(f, s).cadena[0] as string;

const sinNada = (id: string, f: FactionId): Error =>
  new Error(`no hay descripción para "${id}" de ${f}: solo los templarios tienen arte este ciclo`);

/** Las fuentes de un tramo y de una edición, sin extensión de salida. */
export const guiaDelTramo = (f: FactionId, n: number): string =>
  `${dirDeFuentes(f)}/guia-t${n}.png`;
const identidadDelTramo = (f: FactionId, n: number): string =>
  `${dirDeFuentes(f)}/identidad-t${n}.png`;
const identidadDeEdicion = (f: FactionId, id: string): string =>
  `${dirDeFuentes(f)}/identidad-${id}.png`;
export const maestroDelTramo = (f: FactionId, n: number): string =>
  `${dirDeFuentes(f)}/maestro-t${n}`;
/** La placa que pinta Codex: el maestro sin edificios. Solo la lee el taller. */
export const placaDelTramo = (f: FactionId, n: number): string => `${dirDeFuentes(f)}/placa-t${n}`;
/** Lo que pinta el juego de un tramo: la placa por encima de su pie, derivada (`recorte-base.ts`). */
export const tramoDelJuego = (f: FactionId, n: number): string => `${dirDeLaBase(f)}/tramo-${n}`;
/** El empedrado repetible de toda la plaza, sacado de una placa (`recorte-base.ts`). */
export const sueloDeLaBase = (f: FactionId): string => `${dirDeLaBase(f)}/suelo`;
const edicionDe = (f: FactionId, id: string): string => `${dirDeFuentes(f)}/edicion-${id}`;

/** La imagen (sin extensión) en la que está pintado un edificio: su maestro o su edición. */
export function cuadroDe(f: FactionId, id: string): string {
  const s = sitioDeEdificio(f, id);
  return s.cadena[0] === id
    ? maestroDelTramo(f, disposicionDe(f).sitios[s.id].tramo)
    : edicionDe(f, id);
}

const ESTILO = (f: FactionId) => [
  { ruta: MUESTRA_ELEGIDA, papel: 'estilo' as const },
  { ruta: ESTILO_DE_LA_BASE[f], papel: 'estilo' as const },
];

/**
 * La paleta b de la segunda prueba, la que eligió el usuario: sobria, cercana al
 * mapa «pintado oscuro». La a (otoñal) metía hojas naranjas por todas partes.
 */
const PALETA =
  'PALETA: SOBRIA y poco saturada, como la imagen 1: piedra gris y ocre apagado, madera parda, pizarra gris y teja de color apagado, verde oliva oscuro. Luz de TARDE NEUTRA, ni dorada ni naranja: cielo gris azulado nublado, sin puesta de sol, sin hojas de otoño. Sombras suaves.';

/** Cómo se nombran en el prompt los bordes de un tramo que dan a otro. */
function bordesDeJunta(j: ReturnType<typeof juntasDelTramo>): string {
  return j.izq && j.der ? 'los dos bordes' : j.izq ? 'el borde izquierdo' : 'el borde derecho';
}

/** Lo que llevan todos los cuadros de la base: un tramo exacto, y al llegar se vuelve a recortar. */
const CUADRO_DE_LA_BASE = (f: FactionId) =>
  ({
    fondo: 'opaco',
    tamano: { ancho: TRAMO.ancho, alto: TRAMO.alto },
    despues: { orden: 'recortar-base', faccion: f },
  }) as const;

export function encargoDelMaestro(f: FactionId, n: number): Encargo {
  if (f !== 'templarios') throw sinNada(`maestro-t${n}`, f);
  const d = disposicionDe(f);
  const sitios = sitiosDelTramo(d, n);
  const ids = sitios.map((s) => primero(f, s));
  const lista = ids.map((id, i) => `${i + 1}: ${NOMBRE_EN_EL_CUADRO[id] ?? id}`).join('; ');
  const { desde, hasta } = columnasALaVista(d, n);
  const fuera =
    n === 1 && desde > 0
      ? `Las primeras ${desde} columnas por la izquierda quedan fuera del juego: ahí, sin edificios principales, solo lo que cierra la plaza.`
      : n === d.tramos && hasta < TRAMO.ancho
        ? `Las últimas ${TRAMO.ancho - hasta} columnas por la derecha quedan fuera del juego: ahí, sin edificios principales, solo lo que cierra la plaza.`
        : '';
  const juntas = juntasDelTramo(d, n);
  const bordes = bordesDeJunta(juntas);
  return {
    id: `base-${f}-maestro-t${n}`,
    tipo: 'imagen',
    descripcion: [
      'La imagen 2 da además la heráldica de la facción (cruz roja sobre blanco).',
      `El TRAMO ${n} de ${d.tramos}, de izquierda a derecha, de la PLAZA de una villa medieval de caballeros, vista DE CERCA. Formato apaisado de ${TRAMO.ancho}×${TRAMO.alto}. Cámara ORTOGRÁFICA elevada 25 grados sobre la horizontal, DE FRENTE, como el escenario de un combate visto de lado. Nunca cenital ni de perfil. Paredes verticales, nada inclinado.`,
      `LA SILUETA DE LA GUÍA ES LA VARA DE MEDIR: un adulto de ${ADULTO_EN_EL_CUADRO} px de alto da la escala de TODO el cuadro. La PUERTA de cada edificio es un poco MÁS ALTA que la silueta que tiene al lado (la puerta, unos ${PUERTA_EN_EL_CUADRO[0]}-${PUERTA_EN_EL_CUADRO[1]} px), y las ventanas, plantas, aleros y tejados a esa misma escala, como para gente de ese tamaño. Con esa escala los edificios son GRANDES en el cuadro: llenan el alto de la imagen por encima de la franja del empedrado, y los que de verdad son altos se salen por el borde de arriba, cortados. Eso está bien: no los encojas para que quepan.`,
      `Los ${ids.length} edificios (${lista}), cada uno con el umbral de su puerta en su punto de la guía, a ras del borde de atrás del empedrado. Cada uno es el edificio de la hoja de identidad con ese número: su mismo diseño, materiales, colores, tejado y heráldica, con PROPORCIONES NORMALES, las de la hoja: ni estirados en alto ni estrechados. Entre ellos queda aire: se lee como una plaza, no como una calle.`,
      'SOLO el edificio de cada uno: sin las carretas, huertos, cercas, mesas, escalinatas ni objetos sueltos de la hoja.',
      'NO AÑADAS PLAZA DELANTE: el empedrado es solo la franja gris clara de abajo, poco honda y PLANA, con su borde de atrás RECTO y a la MISMA ALTURA de punta a punta de la imagen; el pie de cada edificio, de cada muro y de cada pilar va justo en ese borde. Nada de suelo vacío entre el empedrado y los edificios, ni escalones, ni aceras.',
      // La junta: lo que esconde la costura con el tramo de al lado (F2).
      `LA JUNTA, en ${bordes} de la imagen: la franja VERDE OSCURA de la guía (las ${JUNTA.ancho} columnas pegadas a ${juntas.izq && juntas.der ? 'cada borde' : 'ese borde'}) es UN ÁRBOL ALTO Y FRONDOSO, de copa densa verde oliva oscura que sube desde lo alto del muro hasta el BORDE DE ARRIBA de la imagen y queda CORTADA por el borde lateral, como si el árbol siguiera fuera. El rectángulo PARDO a su pie es un PILAR de piedra del muro, recto y vertical, con su pie en el borde de atrás del empedrado, y detrás de él asoma el tronco. En esas columnas no hay cielo, ni casas, ni tejados: solo el pilar, el tronco y las hojas, de arriba abajo hasta el empedrado.`,
      'Detrás de los edificios y en los huecos que dejen entre ellos, lo que cierra la plaza: traseras de casas de piedra y entramado, muros de piedra, algún árbol; sin puertas principales, ni carteles, ni banderas. Por encima de los tejados, algo de cielo.',
      ...(fuera === '' ? [] : [fuera]),
      'NADA de campo abierto, horizonte ni muralla. Ninguna persona, animal, carro, puesto suelto ni texto. Una sola luz para toda la imagen: un solo cuadro pintado de una vez. No pintes los grises lisos, los puntos, los números, las siluetas ni las franjas de color de la guía: son indicaciones.',
      PALETA,
      'Estilo: ilustración pintada de fantasía medieval oscura, materiales gastados.',
    ].join('\n'),
    referencias: [
      ...ESTILO(f),
      { ruta: guiaDelTramo(f, n), papel: 'plaza' },
      { ruta: identidadDelTramo(f, n), papel: 'edificios' },
    ],
    salida: maestroDelTramo(f, n),
    ...CUADRO_DE_LA_BASE(f),
  };
}

export function encargoDeLaPlaca(f: FactionId, n: number): Encargo {
  if (f !== 'templarios') throw sinNada(`placa-t${n}`, f);
  const d = disposicionDe(f);
  const nombres = sitiosDelTramo(d, n)
    .map((s) => NOMBRE_EN_EL_CUADRO[primero(f, s)] ?? s)
    .join(', ');
  return {
    id: `base-${f}-placa-t${n}`,
    tipo: 'imagen',
    descripcion: [
      `El único cambio: QUITA los edificios principales de la plaza (${nombres}). En su sitio pon lo mismo que ya cierra la plaza entre ellos: traseras y costados de casas de piedra y entramado, muros de piedra, algún árbol; sin puertas principales, sin carteles ni banderas, que no llame la atención.`,
      'NO cambies nada más: el empedrado, su borde, la luz, el cielo, el encuadre, la escala, el árbol y el pilar de la junta de los bordes y lo que ya cerraba la plaza se quedan exactamente igual, en el mismo sitio. El pie de lo nuevo va sobre el mismo borde del empedrado donde estaba el pie de cada edificio quitado.',
      `Mismo tamaño: ${TRAMO.ancho}×${TRAMO.alto}.`,
    ].join('\n'),
    referencias: [{ ruta: `${maestroDelTramo(f, n)}.webp`, papel: 'edita' }],
    salida: placaDelTramo(f, n),
    ...CUADRO_DE_LA_BASE(f),
  };
}

/** Una mejora: el eslabón anterior editado cambiando solo ese edificio, dentro de su región. */
export function encargoDeEdicion(f: FactionId, id: string): Encargo {
  const describe = DESCRIPCION_DE_LOS_TEMPLARIOS[id];
  if (f !== 'templarios' || describe === undefined) throw sinNada(id, f);
  const antes = edificioDeAntes(id, f);
  if (antes === null) throw new Error(`"${id}" es el primer eslabón de su sitio: va en el maestro`);
  const d = disposicionDe(f);
  const s = sitioDeEdificio(f, id).id;
  const { x0, x1 } = d.sitios[s].region;
  const numero = sitiosDelTramo(d, d.sitios[s].tramo).indexOf(s) + 1;
  const nombreAntes = NOMBRE_EN_EL_CUADRO[primero(f, s)] ?? antes;
  return {
    id: `base-${f}-edicion-${id.replace(/_/g, '-')}`,
    tipo: 'imagen',
    descripcion: [
      `El único cambio: el edificio ${numero} empezando por la izquierda (${nombreAntes}, el que está entre las columnas ${x0} y ${x1}) se MEJORA y pasa a ser ${describe}. Es el mismo edificio, en el mismo sitio, con la misma planta, la misma puerta (el umbral donde estaba) y la misma escala; la mejora se le añade. La imagen 2 dice cómo es el edificio mejorado.`,
      `Lo nuevo cabe entre las columnas ${x0} y ${x1}: no toca a los edificios de al lado. Las torres, alas o anexos nuevos tampoco pasan de esas columnas: si no caben a los lados, el edificio crece EN ALTO, no a lo ancho (en F3 el palacio y el gremio se salían por los lados y se cortaban al recortarlos). NO cambies nada fuera de él: ni los otros edificios, ni el empedrado, la luz, el cielo, el encuadre o lo que cierra la plaza.`,
      `Mismo tamaño: ${TRAMO.ancho}×${TRAMO.alto}.`,
    ].join('\n'),
    referencias: [
      { ruta: `${cuadroDe(f, antes)}.webp`, papel: 'edita' },
      { ruta: identidadDeEdicion(f, id), papel: 'edificios' },
    ],
    salida: edicionDe(f, id),
    ...CUADRO_DE_LA_BASE(f),
  };
}

const enDisco = (ruta: string): boolean => existsSync(join(RAIZ, ruta));

/**
 * Lo que se puede encolar ya: el maestro de cada tramo (no dependen unos de
 * otros: la junta es un árbol y el suelo es del juego), su placa cuando está él,
 * y cada mejora cuando está su eslabón de antes. Lo demás se dice como pendiente.
 */
export function encargosDeLaBase(f: FactionId): { listos: Encargo[]; esperan: string[] } {
  if (f !== 'templarios') throw sinNada('la base', f);
  const d = disposicionDe(f);
  const listos: Encargo[] = [];
  const esperan: string[] = [];
  for (let n = 1; n <= d.tramos; n++) {
    listos.push(encargoDelMaestro(f, n));
    if (enDisco(`${maestroDelTramo(f, n)}.webp`)) listos.push(encargoDeLaPlaca(f, n));
    else esperan.push(`placa-t${n} (espera a maestro-t${n})`);
  }
  for (const { id, antes } of mejorasDe(f)) {
    if (enDisco(`${cuadroDe(f, antes)}.webp`)) listos.push(encargoDeEdicion(f, id));
    else esperan.push(`edicion-${id.replace(/_/g, '-')} (espera a ${antes})`);
  }
  return { listos, esperan };
}

/** La silueta del Y Bot civil, rellena de gris oscuro, de `alto` píxeles: la vara de medir. */
export async function siluetaDelAdulto(alto: number, color = [30, 30, 30]): Promise<Buffer> {
  adultoRecortado ??= adultoSinFondo();
  const recortada = await adultoRecortado;
  const meta = await sharp(recortada).metadata();
  const k = alto / (meta.height ?? alto);
  return sharp(recortada)
    .resize(Math.max(1, Math.round((meta.width ?? 1) * k)), alto)
    .ensureAlpha()
    .linear([0, 0, 0, 1], [...color, 0])
    .png()
    .toBuffer();
}

/**
 * La guía de un tramo: el empedrado plano en la raya de la franja, los umbrales
 * pedidos, la vara de medir y, en cada borde que da a otro tramo, la junta: una
 * franja verde oscura (el árbol) de arriba al empedrado con un rectángulo pardo
 * a su pie (el pilar).
 */
/** La primera celda (384) de la hoja A de la dirección 0 del Y Bot civil, el reposo de cara, sin margen. */
async function adultoSinFondo(): Promise<Buffer> {
  const celda = await sharp(join(RAIZ, 'assets/unidades/_poses/civil-8d/d0-a.png'))
    .extract({ left: 0, top: 0, width: 384, height: 384 })
    .png()
    .toBuffer();
  return sharp(celda).trim().png().toBuffer();
}
/** Una vez por proceso: la piden cada guía y la revisión. */
let adultoRecortado: Promise<Buffer> | null = null;

async function guiaDe(d: Disposicion, n: number): Promise<Buffer> {
  const W = TRAMO.ancho;
  const H = TRAMO.alto;
  const fila = Math.round(filaDelPanorama(0));
  const xs = puertasPedidas(d, n, sitiosDelTramo(d, n).length);
  const marcas = xs.map((x, i) =>
    [
      `<circle cx="${x}" cy="${fila}" r="9" fill="#2a2a2a"/>`,
      `<text x="${x}" y="${fila + 50}" font-size="40" font-family="sans-serif" text-anchor="middle" fill="#2a2a2a">${i + 1}</text>`,
    ].join(''),
  );
  const juntas = juntasDelTramo(d, n);
  const junta = (x0: number): string => {
    const medio = x0 + JUNTA.ancho / 2;
    return [
      `<rect x="${x0}" y="0" width="${JUNTA.ancho}" height="${fila}" fill="#2f3b26"/>`,
      `<rect x="${medio - JUNTA.pilar / 2}" y="${fila - JUNTA.altoDelPilar}" width="${JUNTA.pilar}" height="${JUNTA.altoDelPilar}" fill="#6b5a44"/>`,
    ].join('');
  };
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`,
    `<rect width="${W}" height="${H}" fill="#8c8c8c"/>`,
    `<rect y="${fila}" width="${W}" height="${H - fila}" fill="#d6d6d6"/>`,
    ...(juntas.izq ? [junta(0)] : []),
    ...(juntas.der ? [junta(W - JUNTA.ancho)] : []),
    ...marcas,
    '</svg>',
  ].join('');
  const sil = await siluetaDelAdulto(ADULTO_EN_EL_CUADRO);
  const ancho = (await sharp(sil).metadata()).width ?? 0;
  const capas: OverlayOptions[] = xs.map((x) => ({
    input: sil,
    left: Math.round(x - APARTE - ancho / 2),
    top: fila - ADULTO_EN_EL_CUADRO,
  }));
  return sharp(Buffer.from(svg)).composite(capas).png().toBuffer();
}

/** El crudo de la vuelta 1 de un edificio, recortado al contenido y sobre gris. */
async function edificioSuelto(id: string, alto: number): Promise<Buffer> {
  const crudo = CRUDO_DE_LA_VUELTA_1[id];
  if (crudo === undefined || !existsSync(join(IMAGENES, crudo))) {
    throw new Error(
      `no está el crudo de la vuelta 1 de "${id}" (~/.codex/generated_images/${crudo ?? '?'}): sin él no hay hoja de identidad`,
    );
  }
  return sharp(join(IMAGENES, crudo))
    .trim()
    .resize({ height: alto })
    .flatten({ background: '#c8c8c8' })
    .png()
    .toBuffer();
}

/** Una hoja de identidad: los edificios a la misma altura, numerados de izquierda a derecha. */
async function hojaDeIdentidad(ids: readonly string[]): Promise<Buffer> {
  const alto = 520;
  const piezas = await Promise.all(
    ids.map(async (id) => {
      const b = await edificioSuelto(id, alto);
      return { b, ancho: (await sharp(b).metadata()).width ?? 0 };
    }),
  );
  const hueco = 40;
  const ancho = piezas.reduce((a, p) => a + p.ancho + hueco, hueco);
  let x = hueco;
  const capas: OverlayOptions[] = [];
  const textos: string[] = [];
  for (const [i, p] of piezas.entries()) {
    capas.push({ input: p.b, left: x, top: 100 });
    textos.push(
      `<text x="${x + p.ancho / 2}" y="80" font-size="72" font-family="sans-serif" text-anchor="middle" fill="#222">${i + 1}</text>`,
    );
    x += p.ancho + hueco;
  }
  const rotulos = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto + 140}">${textos.join('')}</svg>`;
  return sharp({ create: { width: ancho, height: alto + 140, channels: 3, background: '#c8c8c8' } })
    .composite([...capas, { input: Buffer.from(rotulos), left: 0, top: 0 }])
    .png()
    .toBuffer();
}

/**
 * Escribe una fuente si hace falta y dice si la escribió. Lo ya escrito no se
 * rehace si `fija`: es la referencia exacta con que se pidió lo que hay (su
 * sha256 está en la procedencia). Si no, se rehace cuando cambia.
 */
async function escribir(ruta: string, png: () => Promise<Buffer>, fija: boolean): Promise<boolean> {
  if (fija && enDisco(ruta)) return false;
  const nuevo = await png();
  if (enDisco(ruta) && (await readFile(join(RAIZ, ruta))).equals(nuevo)) return false;
  await mkdir(dirname(join(RAIZ, ruta)), { recursive: true });
  await writeFile(join(RAIZ, ruta), nuevo);
  return true;
}

/**
 * Escribe en `fuentes/` las guías y las hojas de identidad que falten: las de
 * cada tramo y las de cada mejora. Devuelve las que escribió.
 */
export async function escribirFuentesDeLaBase(f: FactionId): Promise<string[]> {
  if (f !== 'templarios') throw sinNada('la base', f);
  const d = disposicionDe(f);
  const escritas: string[] = [];
  for (let n = 1; n <= d.tramos; n++) {
    // La guía se rehace si cambia (otro reparto de puertas o de juntas), pero solo
    // mientras su maestro no esté pintado: desde entonces es la referencia con que
    // se pidió (su sha256 está en la procedencia), y lo de fuera, que la mueve, se
    // mide DESPUÉS sobre el cuadro (en F3, medir T1 la rehízo sin pedir nada).
    // Para pedir otra vez el maestro con otra guía, se borran los dos.
    const guia = guiaDelTramo(f, n);
    const pintado = enDisco(`${maestroDelTramo(f, n)}.webp`);
    if (await escribir(guia, () => guiaDe(d, n), pintado)) escritas.push(guia);
    // Las hojas, siempre fijas: además necesitan `~/.codex`.
    const ids = sitiosDelTramo(d, n).map((s) => primero(f, s));
    if (await escribir(identidadDelTramo(f, n), () => hojaDeIdentidad(ids), true))
      escritas.push(identidadDelTramo(f, n));
  }
  for (const { id } of mejorasDe(f)) {
    if (await escribir(identidadDeEdicion(f, id), () => hojaDeIdentidad([id]), true))
      escritas.push(identidadDeEdicion(f, id));
  }
  return escritas;
}

/** Los edificios que se levantan en la base, sitio a sitio y eslabón a eslabón: los que pueden llevar recorte. */
export function edificiosConArte(faccion: FactionId): readonly string[] {
  return sitiosDeLaBase(faccion).flatMap((s) => s.cadena);
}
