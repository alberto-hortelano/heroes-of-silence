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
 *   solo ese edificio;
 * - **retoque** (`fuentes/retoque-<id>`): un primer eslabón que salió mal en su
 *   maestro, pintado otra vez sobre la placa (la choza del pueblo, en tres cuartos
 *   y con un halo verde, 20-10-2026). Si está en disco, es su cuadro (`cuadroDe`);
 * - **versión abierta** (`fuentes/abierta-<id>`): el cuadro de una morada editado
 *   con ese edificio abierto como una casa de muñecas, sin la pared de delante y
 *   con su sala dentro (vuelta 2 de la morada, 20-10-2026). Se ve mientras se
 *   recluta en ella (`escenas/morada.ts`).
 *
 * Cada edificio se recorta luego por la diferencia con la placa, en su región
 * (`recorte-base.ts`). La geometría no se impone: dónde quedó cada puerta se mide
 * sobre el cuadro y se escribe en `data/bases/<f>.json` («manda el cuadro»). Las
 * guías y las hojas de identidad se escriben en `fuentes/`, que se commitea y no
 * va al build (`tools/build/publico.ts`).
 *
 * Sin arte, la escena pinta un cielo, un muro bajo y cada edificio como un bloque
 * con su nombre (`render/base/pintar.ts`).
 *
 * Cada facción lleva sus textos (`ARTE_DE_LA_BASE`): la villa, su heráldica, su
 * suelo, lo que cierra la plaza, la junta, la paleta y cada edificio, mejora y
 * sala. Los templarios heredaron los cuadros de los caballeros, pedidos con la
 * hoja de identidad de cada edificio (los crudos de la vuelta 1); las otras cuatro
 * (20-10-2026) no tienen crudos y se piden con el edificio descrito en el prompt.
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
export const dirDeFuentes = (f: FactionId): string => `${dirDeLaBase(f)}/fuentes`;

/** El adulto de la vara de medir, en píxeles del tramo: 0,95 pasos, el mismo de la batalla. */
export const ADULTO_EN_EL_CUADRO = Math.round(ALTO_DE_FIGURA * TRAMO.pxPorPaso);
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
 * Lo que dice el prompt de la base de cada facción.
 *
 * - `villa`: qué plaza es («de una villa medieval de caballeros»).
 * - `heraldica`: lo que da la imagen 2 (su lámina) además del estilo.
 * - `suelo`: de qué es la franja de abajo, que el juego pinta con su `suelo.webp`.
 * - `cierre`: lo que cierra la plaza detrás y entre los edificios.
 * - `arbol`, `pilar`: la junta entre dos tramos (`JUNTA`).
 * - `paleta`: la luz y los colores.
 * - `edificios`: cada primer eslabón, por su id, como se nombra en el cuadro. Sin
 *   hoja de identidad (`conIdentidad: false`) lleva su descripción entera.
 * - `mejoras`: cada mejora, por su id, para su edición (`encargoDeEdicion`).
 * - `salas`: lo que se ve dentro de cada morada al abrirla (`encargoDeLaAbierta`).
 * - `retoques`: los primeros eslabones que salieron mal y se pintan otra vez sobre
 *   la placa, con lo que estaba mal (`encargoDelRetoque`).
 */
interface ArteDeLaBase {
  readonly villa: string;
  readonly heraldica: string;
  readonly suelo: string;
  readonly cierre: string;
  readonly arbol: string;
  readonly pilar: string;
  readonly paleta: string;
  /** Si los edificios llevan hoja de identidad (los crudos de la vuelta 1: solo los templarios). */
  readonly conIdentidad: boolean;
  readonly edificios: Readonly<Record<string, string>>;
  readonly mejoras: Readonly<Record<string, string>>;
  readonly salas: Readonly<Record<string, string>>;
  readonly retoques: Readonly<Record<string, string>>;
  /**
   * Los edificios que Codex pintó grandes, por tramo, y cuánto se encogen sobre la
   * placa (`encoger-base`, `tools/taller/encoger-base.ts`): pide la puerta de
   * 154-166 px y la pinta de 190-250 aunque la guía lleve la vara de medir.
   */
  readonly encoger: Readonly<Record<number, readonly Encogido[]>>;
}

/**
 * Un edificio encogido sobre la placa, en píxeles del cuadro que pintó Codex
 * (`pintadoDelTramo`): la banda de columnas donde está, la columna de su puerta
 * (que no se mueve, como su pie) y el factor, la puerta pedida entre la que pintó.
 */
export interface Encogido {
  readonly x0: number;
  readonly x1: number;
  readonly puerta: number;
  readonly k: number;
}

/**
 * La paleta b de la segunda prueba, la que eligió el usuario: sobria, cercana al
 * mapa «pintado oscuro». La a (otoñal) metía hojas naranjas por todas partes.
 * Las de las otras facciones son ella con sus materiales.
 */
const PALETA_DE_LOS_TEMPLARIOS =
  'PALETA: SOBRIA y poco saturada, como la imagen 1: piedra gris y ocre apagado, madera parda, pizarra gris y teja de color apagado, verde oliva oscuro. Luz de TARDE NEUTRA, ni dorada ni naranja: cielo gris azulado nublado, sin puesta de sol, sin hojas de otoño. Sombras suaves.';

/** Cómo crece cada mejora de la villa, igual en todas: en alto, nunca a lo ancho (F3). */
const PALACIO_DEL_MISMO_ANCHO =
  'EXACTAMENTE DEL MISMO ANCHO que el edificio que sustituye: sus dos alas se levantan en dos torres (encima de las alas, no a los lados)';
const GREMIO_EN_ALTO = 'crecido EN ALTO, con el MISMO ANCHO: la torre con una planta más';

export const ARTE_DE_LA_BASE: Readonly<Record<FactionId, ArteDeLaBase>> = {
  templarios: {
    villa: 'una villa medieval de caballeros',
    heraldica: 'cruz roja sobre blanco',
    suelo: 'el empedrado',
    cierre: 'traseras de casas de piedra y entramado, muros de piedra, algún árbol',
    arbol: 'UN ÁRBOL ALTO Y FRONDOSO, de copa densa verde oliva oscura',
    pilar: 'un PILAR de piedra del muro',
    paleta: PALETA_DE_LOS_TEMPLARIOS,
    conIdentidad: true,
    edificios: {
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
    },
    mejoras: {
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
    },
    salas: {
      templarios_pueblo:
        'la choza de los campesinos: una sala baja de madera y adobe con vigas a la vista, un hogar de piedra al fondo con el fuego bajo, aperos de labranza colgados de la pared (horcas, hoces, mayales), sacos de grano y un banco de madera contra el muro, y un estandarte blanco con cruz roja',
      templarios_forja:
        'la forja del cuartel de piqueros: una nave de piedra con la fragua encendida al fondo, un yunque y un barril de templar junto a ella, y contra la pared armeros con picas, lanzas y escudos blancos con cruz roja',
      templarios_establos:
        'los establos de la caballería: una nave de madera con los pesebres y el heno al fondo, sillas de montar, bridas y gualdrapas blancas con cruz roja colgadas de la pared, y lanzas de caballería apoyadas en un armero; sin caballos',
      templarios_monasterio:
        'la iglesia de los paladines: una nave de piedra con columnas y arcos, vidrieras en la pared del fondo, un altar sencillo con un estandarte blanco con cruz roja, cirios encendidos y escudos de armas colgados',
    },
    // Mirado el 20-10-2026: el resto de la plaza va de frente, y ellos no.
    retoques: {
      templarios_pueblo:
        'está en TRES CUARTOS (se le ven la pared del lado derecho y el faldón del tejado en escorzo, y el zócalo de piedra va en diagonal) y lleva un halo verdoso alrededor',
    },
    encoger: {},
  },
  'no-muertos': {
    villa: 'una villa medieval muerta de los no muertos, una necrópolis amurallada',
    heraldica: 'una calavera blanca sobre negro, en telas negras raídas',
    suelo: 'las losas de piedra oscura agrietadas',
    cierre:
      'traseras de casas de piedra negra medio en ruinas, muros de piedra con hiedra seca, cipreses oscuros y alguna lápida',
    arbol: 'UN CIPRÉS ALTO Y DENSO, de follaje verde muy oscuro, casi negro',
    pilar: 'un PILAR de piedra negra del muro',
    paleta:
      'PALETA: SOBRIA y fría, como la imagen 1 pero más apagada: piedra negra y gris verdosa, madera ennegrecida, pizarra, hierro oxidado, telas negras raídas; como único color vivo, una luz verde pálida en algunas ventanas. Luz de crepúsculo NEUTRA y fría: cielo gris plomizo nublado, sin puesta de sol ni luna. Sombras suaves.',
    conIdentidad: false,
    edificios: {
      village_hall:
        'el ayuntamiento: una casa capitular de piedra negra de dos plantas, con tejado de pizarra, ventanas ojivales con una luz verdosa tenue y un estandarte negro con la calavera',
      castle:
        'el castillo: una fortaleza de piedra negra con torres rematadas en agujas de pizarra, almenas rotas, un rastrillo de hierro oxidado en la puerta y estandartes negros con la calavera blanca',
      mage_guild_1:
        'la torre del gremio de magos: una torre nigromántica estrecha de piedra negra, con runas talladas que brillan en verde pálido y un tejado en aguja',
      tavern:
        'la taberna: una casa de entramado ennegrecido, de madera vieja, con un farol de luz verdosa y un letrero de hierro con una jarra y un cráneo',
      marketplace:
        'el mercado cubierto: un soportal de piedra negra con columnas y arcos ojivales, bajo un tejado de pizarra',
      armory:
        'la armería: un taller de piedra negra con una gran puerta de madera y una espada y un escudo oxidados colgados sobre ella',
      'no-muertos_cadaveres':
        'el osario (los cadáveres): una casa baja de piedra con huesos y cráneos encajados en los muros, tejado de pizarra hundido y una puerta de madera podrida',
      'no-muertos_mausoleo':
        'el mausoleo: un panteón de mármol gris ennegrecido, con columnas en la fachada, una cúpula y dos estatuas de dolientes encapuchados a los lados de la puerta',
      'no-muertos_cripta':
        'la cripta: una capilla funeraria grande de piedra negra, con un portón de bóveda bajo un frontón de calaveras y dos gárgolas en las esquinas',
    },
    mejoras: {
      town_hall:
        'la casa capitular crecida: la misma, con un campanario de piedra negra encima, una campana rota y estandartes negros raídos con la calavera',
      city_hall: `el palacio de los muertos: el mismo edificio hecho palacio, ${PALACIO_DEL_MISMO_ANCHO} rematadas en agujas, escalinata de piedra negra y vidrieras de luz verdosa`,
      mage_guild_2: `el mismo gremio de magia ${GREMIO_EN_ALTO}, un balcón con un orbe verde que brilla y más runas; sin anexos ni alas a los lados`,
    },
    salas: {
      'no-muertos_cadaveres':
        'un osario: paredes de nichos con huesos apilados y cráneos en fila, una mesa de piedra con huesos, tierra removida en el suelo y velas de luz verdosa',
      'no-muertos_mausoleo':
        'un panteón: sarcófagos de piedra con las tapas talladas, nichos en las paredes, telarañas, y la luz fría verdosa de dos braseros',
      'no-muertos_cripta':
        'una cripta abovedada: columnas bajas, el sarcófago de un caballero en el centro, armaduras negras oxidadas y lanzas en armeros, y al fondo pesebres vacíos con heno podrido; sin caballos',
    },
    retoques: {},
    encoger: {
      1: [{ x0: 340, x1: 1050, puerta: 700, k: 0.64 }],
      2: [{ x0: 260, x1: 710, puerta: 492, k: 0.76 }],
      4: [
        { x0: 30, x1: 790, puerta: 400, k: 0.68 },
        { x0: 850, x1: 1360, puerta: 1125, k: 0.69 },
      ],
      5: [{ x0: 500, x1: 1230, puerta: 848, k: 0.64 }],
    },
  },
  imperio: {
    villa: 'una villa imperial del Renacimiento, de tercios y lansquenetes',
    heraldica: 'los colores rojo carmesí y negro, en franjas, de sus estandartes',
    suelo: 'el adoquinado',
    cierre:
      'traseras de casas de revoco y ladrillo con tejado de teja, muros de piedra arenisca, algún árbol',
    arbol: 'UN ÁRBOL ALTO Y FRONDOSO, de copa densa verde oliva oscura',
    pilar: 'un PILAR de piedra arenisca del muro',
    paleta:
      'PALETA: SOBRIA y poco saturada, como la imagen 1: piedra arenisca y revoco ocre apagado, ladrillo, teja de color apagado, madera parda, hierro; los estandartes en rojo carmesí y negro. Luz de TARDE NEUTRA, ni dorada ni naranja: cielo gris azulado nublado, sin puesta de sol, sin hojas de otoño. Sombras suaves.',
    conIdentidad: false,
    edificios: {
      village_hall:
        'el ayuntamiento: una casa consistorial de piedra arenisca y revoco, con soportales de arcos en la planta baja, tejado de teja y un estandarte rojo y negro',
      castle:
        'el castillo: un fuerte abaluartado de piedra con torres redondas y garitas, la boca de algún cañón asomando por las troneras, un portón de madera con herrajes y estandartes rojos y negros',
      mage_guild_1:
        'la torre del gremio de magos: una torre de piedra arenisca con un observatorio de cúpula de cobre verdoso en lo alto',
      tavern:
        'la taberna: una casa de entramado y revoco con balcón de madera y un letrero con una jarra colgado de un hierro',
      marketplace:
        'la lonja: un mercado cubierto de piedra arenisca con una arcada abierta de arcos de medio punto y tejado de teja',
      armory:
        'la armería: un taller de piedra con una gran puerta de madera y un letrero con una espada y una coraza',
      imperio_pueblo:
        'el pueblo: una casa de labranza de piedra y revoco con tejado de teja, un portón de madera y un estandarte rojo y negro',
      imperio_taller:
        'el taller: un taller de artesanos de ladrillo y entramado, con un portalón de madera, una chimenea y un letrero con una ballesta',
      imperio_armeria:
        'la armería imperial: un edificio sólido de piedra arenisca con un portalón reforzado con hierro y una coraza y una rodela de piedra tallada sobre la puerta',
      imperio_fundicion:
        'la fundición: una nave de ladrillo con una chimenea alta de ladrillo que humea y un portalón en arco',
      imperio_caballerizas:
        'las caballerizas: unos establos de piedra y madera con un portalón en arco y un tejado de teja',
    },
    mejoras: {
      town_hall:
        'la casa consistorial crecida: la misma, con una torre del reloj de piedra arenisca, un balcón de hierro forjado y estandartes rojos y negros',
      city_hall: `el palacio municipal: el mismo edificio hecho palacio, ${PALACIO_DEL_MISMO_ANCHO} con chapiteles, escalinata de piedra y estandartes rojos y negros`,
      mage_guild_2: `el mismo gremio de magia ${GREMIO_EN_ALTO}, un anteojo de latón en la cúpula y vidrieras; sin anexos ni alas a los lados`,
    },
    salas: {
      imperio_pueblo:
        'una sala de alistamiento: una mesa con un libro de registro y una pluma, picas y alabardas en armeros, morriones en un estante y un estandarte rojo y negro',
      imperio_taller:
        'un taller de armas de tiro: bancos de carpintero con ballestas a medio hacer, arcabuces en un armero, un torno, haces de virotes y un barril de pólvora',
      imperio_armeria:
        'un arsenal: corazas en maniquíes de madera, rodelas colgadas de la pared, espadas en armeros y un yunque',
      imperio_fundicion:
        'una fundición: el horno con su boca encendida al fondo, moldes de arena, una culebrina de bronce sobre su cureña, balas de hierro apiladas y barriles de pólvora',
      imperio_caballerizas:
        'unas caballerizas: los pesebres con heno al fondo, sillas de montar, bridas y pistolas de rueda colgadas de la pared; sin caballos',
    },
    retoques: {},
    encoger: {
      1: [{ x0: 330, x1: 1200, puerta: 762, k: 0.67 }],
      4: [
        { x0: 150, x1: 790, puerta: 480, k: 0.75 },
        { x0: 855, x1: 1360, puerta: 1092, k: 0.79 },
      ],
      5: [
        { x0: 210, x1: 870, puerta: 557, k: 0.69 },
        { x0: 910, x1: 1536, puerta: 1232, k: 0.77 },
      ],
    },
  },
  elfos: {
    villa: 'una ciudad élfica en el bosque',
    heraldica: 'un árbol plateado sobre verde',
    suelo: 'las losas de piedra clara con musgo entre las juntas',
    cierre:
      'troncos enormes de árboles con raíces, casas de madera tallada en los árboles al fondo y muros bajos de piedra blanca con musgo',
    arbol:
      'UN ÁRBOL ENORME Y FRONDOSO, de tronco grueso de corteza gris plata y copa densa verde oscura',
    pilar: 'un PILAR de piedra blanca del muro',
    paleta:
      'PALETA: SOBRIA, como la imagen 1: piedra blanca gastada con musgo, madera parda y gris plata, verde oliva y verde bosque oscuro, algo de oro viejo en las linternas. Luz de TARDE NEUTRA, ni dorada ni naranja: cielo gris azulado nublado entre las copas, sin hojas de otoño. Sombras suaves.',
    conIdentidad: false,
    edificios: {
      village_hall:
        'el ayuntamiento: un salón de madera tallada con curvas de raíces, columnas de troncos vivos y un tejado en forma de hoja',
      castle:
        'el castillo: un torreón de piedra blanca con musgo, entrelazado con las raíces de un árbol enorme, torres esbeltas con tejados en forma de hoja, una puerta en arco ojival de madera tallada y estandartes verdes con el árbol plateado',
      mage_guild_1:
        'la torre del gremio de magos: una torre esbelta de piedra blanca enroscada por raíces, con un cristal verde que brilla en lo alto',
      tavern:
        'la taberna: una casa de madera bajo las raíces de un árbol, con ventanas redondas, linternas doradas y un letrero con una copa',
      marketplace:
        'el mercado: un pabellón abierto de madera tallada con columnas de troncos y un tejado de hojas',
      armory:
        'la armería: una casa de madera con arcos ojivales y lanzas de hoja talladas en la fachada',
      elfos_pueblo:
        'el pueblo: una casa de madera tallada abrazada a un tronco, con un tejado en forma de hoja y una puerta redonda',
      elfos_pabellon_de_caza:
        'el pabellón de caza: un pabellón de madera con tejado de corteza y una cornamenta de ciervo sobre la puerta',
      elfos_arboleda:
        'la arboleda: un santuario de troncos vivos entrelazados que forman una capilla, con una puerta en arco ojival y flores blancas',
    },
    mejoras: {
      town_hall:
        'el salón crecido: el mismo, con una torre de madera tallada encima, un balcón de raíces y estandartes verdes con el árbol plateado',
      city_hall: `el palacio élfico: el mismo edificio hecho palacio, ${PALACIO_DEL_MISMO_ANCHO} esbeltas con tejados de hoja, escalinata de piedra blanca y estandartes verdes con el árbol plateado`,
      mage_guild_2: `el mismo gremio de magia ${GREMIO_EN_ALTO}, un mirador de raíces con un cristal más grande; sin anexos ni alas a los lados`,
    },
    salas: {
      elfos_pueblo:
        'una sala de madera viva: arcos largos en un armero, carcajes de flechas, lanzas de hoja y escudos ovalados con el árbol plateado colgados de la pared',
      elfos_pabellon_de_caza:
        'un pabellón de caza: pieles de ciervo en el suelo, cornamentas en la pared, arcos y cuchillos largos, sillas de montar y un mapa sobre una mesa',
      elfos_arboleda:
        'un santuario: un árbol joven que brilla con una luz suave en el centro, un estanque pequeño, cuencos de ofrendas, velas y flores blancas',
    },
    retoques: {},
    encoger: {
      1: [{ x0: 320, x1: 1260, puerta: 865, k: 0.66 }],
      2: [
        { x0: 140, x1: 720, puerta: 452, k: 0.69 },
        { x0: 750, x1: 1390, puerta: 1080, k: 0.77 },
      ],
      4: [
        { x0: 130, x1: 815, puerta: 470, k: 0.7 },
        { x0: 820, x1: 1430, puerta: 1120, k: 0.77 },
      ],
      5: [{ x0: 420, x1: 1260, puerta: 848, k: 0.6 }],
    },
  },
  orkos: {
    villa: 'un campamento fortificado de orkos',
    heraldica: 'una garra roja pintada sobre madera y pieles',
    suelo: 'la tierra batida con piedras',
    cierre:
      'la empalizada de troncos aguzados, chozas de troncos y pieles, rocas grandes y algún pino',
    arbol: 'UN PINO ALTO Y FRONDOSO, de copa densa verde oscura',
    pilar: 'un PILAR de piedra tosca de la empalizada',
    paleta:
      'PALETA: SOBRIA y terrosa, como la imagen 1: troncos pardos, pieles, piedra tosca gris, hierro oxidado, barro; la pintura roja de guerra como único color vivo. Luz de TARDE NEUTRA, ni dorada ni naranja: cielo gris nublado, sin puesta de sol. Sombras suaves.',
    conIdentidad: false,
    edificios: {
      village_hall:
        'el ayuntamiento: el gran salón del jefe, una casa larga de troncos con tejado de pieles y chapa de hierro, y colmillos de bestia sobre la puerta',
      castle:
        'el castillo: un fuerte de piedra tosca y troncos aguzados, torres de madera con plataformas, un portón de troncos reforzado con chapa oxidada y estandartes rojos con la garra',
      mage_guild_1:
        'la torre del gremio de magos: la torre de los chamanes, de troncos y piedra tosca, con cráneos de bestia y amuletos colgados y un humo verde que sale de lo alto',
      tavern:
        'la taberna: una casa de troncos con un cuerno de beber enorme colgado sobre la puerta',
      marketplace: 'el mercado: un cobertizo grande de troncos con toldos de pieles',
      armory:
        'la armería: una herrería tosca de piedra y troncos, con hachas y escudos de madera con la garra roja colgados en la fachada',
      orkos_pueblo:
        'el pueblo: una choza grande de troncos y pieles, con un tejado de pieles y huesos y una puerta de troncos',
      orkos_cueva:
        'la cueva: la boca de una cueva en una roca enorme, enmarcada por un arco de troncos con cráneos',
      orkos_pocilga: 'la pocilga: un corral cubierto de troncos con tejado de chapa oxidada',
      orkos_totem:
        'el tótem: una casa de guerra de piedra tosca y troncos con un gran tótem de caras talladas pegado a la fachada',
    },
    mejoras: {
      town_hall:
        'el gran salón crecido: el mismo, con una torre de vigía de troncos encima y estandartes rojos con la garra',
      city_hall: `la fortaleza del kaudillo: el mismo edificio hecho palacio, ${PALACIO_DEL_MISMO_ANCHO} de troncos y piedra tosca con cuernos y estandartes rojos`,
      mage_guild_2: `el mismo gremio de magia ${GREMIO_EN_ALTO}, más cráneos y un caldero en lo alto que echa humo verde; sin anexos ni alas a los lados`,
    },
    salas: {
      orkos_pueblo:
        'una choza: un fuego en el suelo, pieles por el suelo, hachas, lanzas y escudos de madera con la garra roja colgados de las paredes y un tonel',
      orkos_cueva:
        'una cueva: paredes de roca, huesos grandes por el suelo, una maza enorme apoyada en la pared y un lecho de paja',
      orkos_pocilga:
        'un cubil de hienas: pesebres de troncos con paja sucia, sillas de montar toscas, cadenas y bozales colgados; sin animales',
      orkos_totem:
        'una sala de guerra: armaduras pesadas de chapa oxidada en maniquíes de troncos, hachas grandes en un armero y un yunque',
    },
    retoques: {},
    encoger: {
      1: [{ x0: 170, x1: 1120, puerta: 645, k: 0.69 }],
      3: [{ x0: 540, x1: 1005, puerta: 768, k: 0.74 }],
      4: [
        { x0: 105, x1: 845, puerta: 475, k: 0.8 },
        { x0: 870, x1: 1450, puerta: 1160, k: 0.82 },
      ],
      5: [{ x0: 245, x1: 1536, puerta: 895, k: 0.82 }],
    },
  },
};

const RETOQUES = (f: FactionId): Readonly<Record<string, string>> => ARTE_DE_LA_BASE[f].retoques;

/** Cómo se nombra un edificio en el prompt del cuadro (con su descripción, si no lleva identidad). */
const nombreEnElCuadro = (f: FactionId, id: string): string =>
  ARTE_DE_LA_BASE[f].edificios[id] ?? id;
/** Solo el nombre: lo de antes de los dos puntos (para las ediciones y la placa). */
const nombreCorto = (f: FactionId, id: string): string => nombreEnElCuadro(f, id).split(':')[0]!;

/** Las moradas de la base de `f` que pueden llevar versión abierta: todo edificio de un sitio de morada. */
export function moradasDeLaBase(f: FactionId): readonly string[] {
  return sitiosDeLaBase(f)
    .filter((s) => s.morada !== undefined)
    .flatMap((s) => s.cadena);
}

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

/**
 * Lo más que puede medir de ancho un edificio en el cuadro: con uno o dos por
 * tramo, Codex llenaba el tramo entero y la puerta salía a 230-320 px, el doble
 * de lo pedido (20-10-2026, las bases de no muertos, imperio, elfos y orkos).
 */
const ANCHO_MAXIMO_DEL_EDIFICIO = 520;

/**
 * El recuadro que se pide a cada uno de los `n` edificios de un tramo: su puerta
 * en el medio y, de ancho, lo que le toca del tramo (con aire) hasta
 * `ANCHO_MAXIMO_DEL_EDIFICIO`. Lo dibuja la guía y lo dice el prompt.
 */
function huecosPedidos(
  d: Disposicion,
  tramo: number,
  n: number,
): { x: number; x0: number; x1: number }[] {
  const xs = puertasPedidas(d, tramo, n);
  const reparto = n > 1 ? (xs[1]! - xs[0]!) * 0.9 : ANCHO_MAXIMO_DEL_EDIFICIO;
  const ancho = Math.round(Math.min(ANCHO_MAXIMO_DEL_EDIFICIO, reparto));
  return xs.map((x) => ({ x, x0: Math.round(x - ancho / 2), x1: Math.round(x + ancho / 2) }));
}

/** El primer eslabón de un sitio: lo que pinta el maestro. */
const primero = (f: FactionId, s: SitioId): string => sitioDe(f, s).cadena[0] as string;

/**
 * Los sitios de un tramo que llevan edificio en `f`, de izquierda a derecha: los
 * que pinta su maestro, con su número en la guía. Un sitio sin nada que levantar
 * (el 4, 5 y 6 de los no muertos) es plaza.
 */
export function sitiosPintados(f: FactionId, d: Disposicion, tramo: number): SitioId[] {
  return sitiosDelTramo(d, tramo).filter((s) => sitioDe(f, s).cadena.length > 0);
}

/** Las fuentes de un tramo y de una edición, sin extensión de salida. */
export const guiaDelTramo = (f: FactionId, n: number): string =>
  `${dirDeFuentes(f)}/guia-t${n}.png`;
const identidadDelTramo = (f: FactionId, n: number): string =>
  `${dirDeFuentes(f)}/identidad-t${n}.png`;
const identidadDeEdicion = (f: FactionId, id: string): string =>
  `${dirDeFuentes(f)}/identidad-${id}.png`;
export const maestroDelTramo = (f: FactionId, n: number): string =>
  `${dirDeFuentes(f)}/maestro-t${n}`;
/**
 * Lo que pintó Codex de un tramo cuyos edificios se encogen (`encoger-base`): el
 * maestro sale de él y de la placa. Sin encogidos no existe y el maestro es lo pintado.
 */
export const pintadoDelTramo = (f: FactionId, n: number): string =>
  `${dirDeFuentes(f)}/pintado-t${n}`;
/** La placa que pinta Codex: el maestro sin edificios. Solo la lee el taller. */
export const placaDelTramo = (f: FactionId, n: number): string => `${dirDeFuentes(f)}/placa-t${n}`;
/** Lo que pinta el juego de un tramo: la placa por encima de su pie, derivada (`recorte-base.ts`). */
export const tramoDelJuego = (f: FactionId, n: number): string => `${dirDeLaBase(f)}/tramo-${n}`;
/** El empedrado repetible de toda la plaza, sacado de una placa (`recorte-base.ts`). */
export const sueloDeLaBase = (f: FactionId): string => `${dirDeLaBase(f)}/suelo`;
/** El recorte de un edificio, derivado de su cuadro y su placa (`recorte-base.ts`), con extensión. */
export const recorteDelJuego = (f: FactionId, id: string): string => `${dirDeLaBase(f)}/${id}.webp`;
const edicionDe = (f: FactionId, id: string): string => `${dirDeFuentes(f)}/edicion-${id}`;
/** El retoque de un primer eslabón, pintado otra vez sobre la placa (`encargoDelRetoque`). */
export const retoqueDe = (f: FactionId, id: string): string => `${dirDeFuentes(f)}/retoque-${id}`;
const identidadDelRetoque = (f: FactionId, id: string): string =>
  `${dirDeFuentes(f)}/identidad-retoque-${id}.png`;
/** La versión abierta de una morada que pinta Codex: su cuadro editado (`encargoDeLaAbierta`). */
export const abiertaPintada = (f: FactionId, id: string): string =>
  `${dirDeFuentes(f)}/abierta-${id}`;
/** Lo que pinta el juego de la versión abierta: su recorte (`recorte-base.ts`), con extensión. */
export const abiertaDelJuego = (f: FactionId, id: string): string =>
  `${dirDeLaBase(f)}/abierta-${id}.webp`;
/**
 * La sala de cada morada que pintó Codex en la vuelta 1 (una pantalla entera): la
 * versión abierta la lleva como referencia de cómo es por dentro (papel `interior`).
 */
export const salaPintada = (f: FactionId, id: string): string =>
  `${dirDeFuentes(f)}/interior-${id}.webp`;

/**
 * La imagen (sin extensión) en la que está pintado un edificio: su maestro, su
 * edición o, si está en disco, su retoque («manda lo que hay en fuentes», como
 * `encargosDeLaBase`): mientras no llega, el primer eslabón sigue con su maestro.
 */
export function cuadroDe(f: FactionId, id: string): string {
  const s = sitioDeEdificio(f, id);
  if (s.cadena[0] !== id) return edicionDe(f, id);
  if (RETOQUES(f)[id] !== undefined && enDisco(`${retoqueDe(f, id)}.webp`)) {
    return retoqueDe(f, id);
  }
  return maestroDelTramo(f, disposicionDe(f).sitios[s.id].tramo);
}

/** El gris de fondo de las hojas de identidad: el de los edificios y el del retoque. */
const GRIS_DE_LA_IDENTIDAD = '#c8c8c8';

const ESTILO = (f: FactionId) => [
  { ruta: MUESTRA_ELEGIDA, papel: 'estilo' as const },
  { ruta: ESTILO_DE_LA_BASE[f], papel: 'estilo' as const },
];

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
  const arte = ARTE_DE_LA_BASE[f];
  const d = disposicionDe(f);
  const sitios = sitiosPintados(f, d, n);
  if (sitios.length === 0)
    throw new Error(
      `el tramo ${n} de ${f} no tiene ningún edificio: muévele un sitio en data/bases/${f}.json`,
    );
  const ids = sitios.map((s) => primero(f, s));
  const lista = ids.map((id, i) => `${i + 1}: ${nombreEnElCuadro(f, id)}`).join('; ');
  const huecos = huecosPedidos(d, n, ids.length)
    .map((h, i) => `el ${i + 1}, entre las columnas ${h.x0} y ${h.x1}`)
    .join('; ');
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
      `La imagen 2 da además la heráldica de la facción (${arte.heraldica}).`,
      `El TRAMO ${n} de ${d.tramos}, de izquierda a derecha, de la PLAZA de ${arte.villa}, vista DE CERCA. Formato apaisado de ${TRAMO.ancho}×${TRAMO.alto}. Cámara ORTOGRÁFICA elevada 25 grados sobre la horizontal, DE FRENTE, como el escenario de un combate visto de lado. Nunca cenital ni de perfil. Paredes verticales, nada inclinado.`,
      `LA SILUETA DE LA GUÍA ES LA VARA DE MEDIR: un adulto de ${ADULTO_EN_EL_CUADRO} px de alto da la escala de TODO el cuadro. La PUERTA de cada edificio es un poco MÁS ALTA que la silueta que tiene al lado (la puerta, unos ${PUERTA_EN_EL_CUADRO[0]}-${PUERTA_EN_EL_CUADRO[1]} px), y las ventanas, plantas, aleros y tejados a esa misma escala, como para gente de ese tamaño. Con esa escala los edificios son GRANDES en el cuadro: llenan el alto de la imagen por encima de la franja del suelo, y los que de verdad son altos se salen por el borde de arriba, cortados. Eso está bien: no los encojas para que quepan.`,
      ...(arte.conIdentidad
        ? [
            `Los ${ids.length} edificios (${lista}), cada uno con el umbral de su puerta en su punto de la guía, a ras del borde de atrás del suelo. Cada uno es el edificio de la hoja de identidad con ese número: su mismo diseño, materiales, colores, tejado y heráldica, con PROPORCIONES NORMALES, las de la hoja: ni estirados en alto ni estrechados. Entre ellos queda aire: se lee como una plaza, no como una calle.`,
            'SOLO el edificio de cada uno: sin las carretas, huertos, cercas, mesas, escalinatas ni objetos sueltos de la hoja.',
          ]
        : [
            `Los ${ids.length} edificios, numerados de izquierda a derecha como los puntos de la guía (${lista}), cada uno con el umbral de su puerta en su punto, a ras del borde de atrás del suelo. Cada uno con PROPORCIONES NORMALES, ni estirado en alto ni estrechado, y con la heráldica y los materiales de la facción. CADA EDIFICIO CABE EN SU RECUADRO DE LA GUÍA (${huecos}): ese es su ancho entero, con el tejado, las torres y los aleros, y los edificios NO llenan el tramo: a los lados de su recuadro va lo que cierra la plaza. Cada edificio DE FRENTE, con la fachada PARALELA al plano del cuadro: sin pared lateral ni faldón del tejado en escorzo, el zócalo horizontal. Entre ellos queda aire: se lee como una plaza, no como una calle.`,
            'SOLO el edificio de cada uno: sin carretas, huertos, cercas, mesas ni objetos sueltos delante.',
          ]),
      `NO AÑADAS PLAZA DELANTE: el suelo (${arte.suelo}) es solo la franja gris clara de abajo, poco honda y PLANA, con su borde de atrás RECTO y a la MISMA ALTURA de punta a punta de la imagen; el pie de cada edificio, de cada muro y de cada pilar va justo en ese borde. Nada de terreno vacío entre esa franja y los edificios, ni escalones, ni aceras.`,
      // La junta: lo que esconde la costura con el tramo de al lado (F2).
      `LA JUNTA, en ${bordes} de la imagen: la franja VERDE OSCURA de la guía (las ${JUNTA.ancho} columnas pegadas a ${juntas.izq && juntas.der ? 'cada borde' : 'ese borde'}) es ${arte.arbol}, que sube desde lo alto del muro hasta el BORDE DE ARRIBA de la imagen y queda CORTADO por el borde lateral, como si el árbol siguiera fuera. El rectángulo PARDO a su pie es ${arte.pilar}, recto y vertical, con su pie en el borde de atrás del suelo, y detrás de él asoma el tronco. En esas columnas no hay cielo, ni casas, ni tejados: solo el pilar, el tronco y las hojas, de arriba abajo hasta el suelo.`,
      `Detrás de los edificios y en los huecos que dejen entre ellos, lo que cierra la plaza: ${arte.cierre}; sin puertas principales, ni carteles, ni banderas. Por encima de los tejados, algo de cielo.`,
      ...(fuera === '' ? [] : [fuera]),
      'NADA de campo abierto, horizonte ni muralla. Ninguna persona, animal, carro, puesto suelto ni texto. Una sola luz para toda la imagen: un solo cuadro pintado de una vez. No pintes los grises lisos, los puntos, los números, las siluetas, los recuadros de trazos ni las franjas de color de la guía: son indicaciones.',
      arte.paleta,
      'Estilo: ilustración pintada de fantasía medieval oscura, materiales gastados.',
    ].join('\n'),
    referencias: [
      ...ESTILO(f),
      { ruta: guiaDelTramo(f, n), papel: 'plaza' },
      ...(arte.conIdentidad
        ? [{ ruta: identidadDelTramo(f, n), papel: 'edificios' as const }]
        : []),
    ],
    salida: maestroDelTramo(f, n),
    ...CUADRO_DE_LA_BASE(f),
  };
}

export function encargoDeLaPlaca(f: FactionId, n: number): Encargo {
  const d = disposicionDe(f);
  const nombres = sitiosPintados(f, d, n)
    .map((s) => nombreCorto(f, primero(f, s)))
    .join(', ');
  return {
    id: `base-${f}-placa-t${n}`,
    tipo: 'imagen',
    descripcion: [
      `El único cambio: QUITA los edificios principales de la plaza (${nombres}). En su sitio pon lo mismo que ya cierra la plaza entre ellos: ${ARTE_DE_LA_BASE[f].cierre}; sin puertas principales, sin carteles ni banderas, que no llame la atención.`,
      'NO cambies nada más: el suelo, su borde, la luz, el cielo, el encuadre, la escala, el árbol y el pilar de la junta de los bordes y lo que ya cerraba la plaza se quedan exactamente igual, en el mismo sitio. El pie de lo nuevo va sobre el mismo borde del empedrado donde estaba el pie de cada edificio quitado.',
      `Mismo tamaño: ${TRAMO.ancho}×${TRAMO.alto}.`,
    ].join('\n'),
    referencias: [{ ruta: `${maestroDelTramo(f, n)}.webp`, papel: 'edita' }],
    salida: placaDelTramo(f, n),
    ...CUADRO_DE_LA_BASE(f),
  };
}

/** Una mejora: el eslabón anterior editado cambiando solo ese edificio, dentro de su región. */
export function encargoDeEdicion(f: FactionId, id: string): Encargo {
  const arte = ARTE_DE_LA_BASE[f];
  const describe = arte.mejoras[id];
  if (describe === undefined)
    throw new Error(`no hay descripción de la mejora "${id}" de ${f} (ARTE_DE_LA_BASE)`);
  const antes = edificioDeAntes(id, f);
  if (antes === null) throw new Error(`"${id}" es el primer eslabón de su sitio: va en el maestro`);
  const d = disposicionDe(f);
  const s = sitioDeEdificio(f, id).id;
  const { x0, x1 } = d.sitios[s].region;
  const numero = sitiosPintados(f, d, d.sitios[s].tramo).indexOf(s) + 1;
  const nombreAntes = nombreCorto(f, primero(f, s));
  return {
    id: `base-${f}-edicion-${id.replace(/_/g, '-')}`,
    tipo: 'imagen',
    descripcion: [
      `El único cambio: el edificio ${numero} empezando por la izquierda (${nombreAntes}, el que está entre las columnas ${x0} y ${x1}) se MEJORA y pasa a ser ${describe}. Es el mismo edificio, en el mismo sitio, con la misma planta, la misma puerta (el umbral donde estaba) y la misma escala; la mejora se le añade.${arte.conIdentidad ? ' La imagen 2 dice cómo es el edificio mejorado.' : ''}`,
      `Lo nuevo cabe entre las columnas ${x0} y ${x1}: no toca a los edificios de al lado. Las torres, alas o anexos nuevos tampoco pasan de esas columnas: si no caben a los lados, el edificio crece EN ALTO, no a lo ancho (en F3 el palacio y el gremio se salían por los lados y se cortaban al recortarlos). NO cambies nada fuera de él: ni los otros edificios, ni el empedrado, la luz, el cielo, el encuadre o lo que cierra la plaza.`,
      `Mismo tamaño: ${TRAMO.ancho}×${TRAMO.alto}.`,
    ].join('\n'),
    referencias: [
      { ruta: `${cuadroDe(f, antes)}.webp`, papel: 'edita' },
      ...(arte.conIdentidad
        ? [{ ruta: identidadDeEdicion(f, id), papel: 'edificios' as const }]
        : []),
    ],
    salida: edicionDe(f, id),
    ...CUADRO_DE_LA_BASE(f),
  };
}

/**
 * Lo que el retoque deja libre a cada lado de su región, en píxeles del cuadro:
 * con solo «dentro de esas columnas», la choza salió de frente pero 50 px más
 * ancha que su hueco y pisaba el sitio del ayuntamiento (20-10-2026).
 */
const AIRE_DEL_RETOQUE = 30;

/**
 * Un primer eslabón pintado otra vez, de frente (C15 de la morada, 20-10-2026):
 * se EDITA LA PLACA de su tramo, no el maestro, porque alrededor es lo que pinta
 * el juego, así que la diferencia con la placa es solo el edificio y no queda halo.
 * La identidad es su trozo del maestro (`identidadDelRetoque`): de ahí salen su
 * diseño y sus materiales, no su ángulo.
 */
export function encargoDelRetoque(f: FactionId, id: string): Encargo {
  const mal = RETOQUES(f)[id];
  if (mal === undefined)
    throw new Error(
      `"${id}" de ${f} no tiene retoque: hay ${Object.keys(RETOQUES(f)).join(', ') || 'ninguno'}`,
    );
  const d = disposicionDe(f);
  const s = sitioDeEdificio(f, id).id;
  const { tramo, region, umbral } = d.sitios[s];
  const [px, fila] = umbral.enElCuadro;
  const nombre = nombreCorto(f, id);
  return {
    id: `base-${f}-retoque-${id.replace(/_/g, '-')}`,
    tipo: 'imagen',
    descripcion: [
      `El único cambio: en el hueco que hay entre las columnas ${region.x0} y ${region.x1} se levanta ${nombre}, el edificio de la imagen 2. La imagen 2 es como salió la primera vez, y está mal: ${mal}. Aquí va DE FRENTE, como los demás edificios de la plaza, con la FACHADA PARALELA al plano del cuadro, sin pared lateral ni faldón del tejado en escorzo, el zócalo de piedra HORIZONTAL y el alero recto. Cámara ORTOGRÁFICA elevada 25 grados, de frente, como el resto de la imagen 1. Paredes verticales, nada inclinado.`,
      `El umbral de su puerta, en la columna ${px} y la fila ${fila}, a ras del borde de atrás del empedrado; el pie de toda la fachada sobre ese mismo borde. A la escala de la plaza: un adulto mide ${ADULTO_EN_EL_CUADRO} px, y la puerta es un poco más alta (unos ${PUERTA_EN_EL_CUADRO[0]}-${PUERTA_EN_EL_CUADRO[1]} px). Su mismo diseño, materiales, colores, tejado de paja y heráldica que en la imagen 2, con proporciones normales. CABE ENTERO en su hueco, con aire: todo lo suyo (alero, tejado, chimenea, estandarte, esquinas de piedra) entre las columnas ${region.x0 + AIRE_DEL_RETOQUE} y ${region.x1 - AIRE_DEL_RETOQUE}, así que la fachada no pasa de ${region.x1 - region.x0 - 2 * AIRE_DEL_RETOQUE} px de ancho; más estrecho que en la imagen 2 si hace falta. Pasada la columna ${region.x1 - AIRE_DEL_RETOQUE}, nada suyo: ahí empieza el sitio de otro edificio.`,
      'SIN HALO NI CONTORNO: alrededor del edificio, lo que ya hay en la imagen 1, sin brillo, sin borde de otro color y sin árboles nuevos pegados a él. NO cambies nada fuera de él: ni los otros edificios, ni el empedrado, la luz, el cielo, el encuadre o lo que cierra la plaza.',
      `Mismo tamaño: ${TRAMO.ancho}×${TRAMO.alto}.`,
    ].join('\n'),
    referencias: [
      { ruta: `${placaDelTramo(f, tramo)}.webp`, papel: 'edita' },
      { ruta: identidadDelRetoque(f, id), papel: 'edificios' },
    ],
    salida: retoqueDe(f, id),
    ...CUADRO_DE_LA_BASE(f),
  };
}

/**
 * La versión abierta de una morada (C14 de la morada, 20-10-2026): su cuadro
 * editado como una mejora, con ese edificio abierto como una casa de muñecas. La
 * sala de la vuelta 1 (`salaPintada`) va de segunda referencia, solo para lo de
 * dentro. Se recorta como cualquier edición (`recortar-base`).
 */
export function encargoDeLaAbierta(f: FactionId, id: string): Encargo {
  const sala = ARTE_DE_LA_BASE[f].salas[id];
  if (sala === undefined)
    throw new Error(`no hay sala de "${id}" de ${f} para su versión abierta (ARTE_DE_LA_BASE)`);
  const conSala = enDisco(salaPintada(f, id));
  const d = disposicionDe(f);
  const s = sitioDeEdificio(f, id).id;
  const { x0, x1 } = d.sitios[s].region;
  const numero = sitiosPintados(f, d, d.sitios[s].tramo).indexOf(s) + 1;
  const nombre = nombreCorto(f, id);
  return {
    id: `base-${f}-abierta-${id.replace(/_/g, '-')}`,
    tipo: 'imagen',
    descripcion: [
      `El único cambio: el edificio ${numero} empezando por la izquierda (${nombre}, el que está entre las columnas ${x0} y ${x1}) se ABRE como una CASA DE MUÑECAS: se le quita la PARED DE DELANTE (la fachada entera, con su puerta y sus ventanas) y se ve su sala por dentro: ${sala}.${conSala ? ' La imagen 2 dice cómo es la sala por dentro.' : ''}`,
      'Es el MISMO edificio, en el MISMO sitio, con el MISMO tamaño y el MISMO contorno: el tejado y los muros de los lados se quedan, cortados limpios donde estaba la fachada, y se ve el grueso de la pared en el corte. El suelo de la sala va a ras del borde de atrás del empedrado, donde estaba el umbral de la puerta, y la sala se ve desde la plaza con la misma cámara que todo el cuadro (ortográfica, elevada 25 grados, de frente). La luz de dentro, la de su fuego, sus ventanas o sus cirios, sobria.',
      `A la escala de la plaza: un adulto mide ${ADULTO_EN_EL_CUADRO} px de alto en este cuadro, y los muebles van a su medida (un banco o un saco, a su rodilla; una mesa, un yunque o un altar, a su cadera). La sala va VACÍA: ninguna persona ni animal, que la gente del juego se pone delante, en el empedrado.`,
      `Fuera de ese edificio, NADA cambia: ni los otros edificios, ni el suelo, la luz, el cielo, el encuadre o lo que cierra la plaza. Lo nuevo no pasa de las columnas ${x0} y ${x1}.`,
      `Mismo tamaño: ${TRAMO.ancho}×${TRAMO.alto}.`,
    ].join('\n'),
    referencias: [
      { ruta: `${cuadroDe(f, id)}.webp`, papel: 'edita' },
      ...(conSala ? [{ ruta: salaPintada(f, id), papel: 'interior' as const }] : []),
    ],
    salida: abiertaPintada(f, id),
    ...CUADRO_DE_LA_BASE(f),
  };
}

const enDisco = (ruta: string): boolean => existsSync(join(RAIZ, ruta));

/**
 * Lo que se puede encolar ya: el maestro de cada tramo (no dependen unos de
 * otros: la junta es un árbol y el suelo es del juego), su placa cuando está él,
 * cada mejora cuando está su eslabón de antes, cada retoque cuando está su placa
 * y la versión abierta de cada morada cuando está su cuadro (y su retoque, si lo
 * lleva). Lo demás se dice como pendiente.
 */
export function encargosDeLaBase(f: FactionId): { listos: Encargo[]; esperan: string[] } {
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
  for (const id of Object.keys(RETOQUES(f))) {
    const tramo = d.sitios[sitioDeEdificio(f, id).id].tramo;
    if (enDisco(`${placaDelTramo(f, tramo)}.webp`)) listos.push(encargoDelRetoque(f, id));
    else esperan.push(`retoque-${id.replace(/_/g, '-')} (espera a placa-t${tramo})`);
  }
  // La versión abierta, sobre el cuadro que queda: la de un edificio con retoque,
  // sobre el retoque, así que espera a que llegue.
  for (const id of moradasDeLaBase(f)) {
    const corto = `abierta-${id.replace(/_/g, '-')}`;
    if (RETOQUES(f)[id] !== undefined && !enDisco(`${retoqueDe(f, id)}.webp`)) {
      esperan.push(`${corto} (espera a retoque-${id.replace(/_/g, '-')})`);
    } else if (enDisco(`${cuadroDe(f, id)}.webp`)) listos.push(encargoDeLaAbierta(f, id));
    else esperan.push(`${corto} (espera a ${cuadroDe(f, id).slice(dirDeFuentes(f).length + 1)})`);
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

async function guiaDe(f: FactionId, d: Disposicion, n: number): Promise<Buffer> {
  const W = TRAMO.ancho;
  const H = TRAMO.alto;
  const fila = Math.round(filaDelPanorama(0));
  const xs = puertasPedidas(d, n, sitiosPintados(f, d, n).length);
  const recuadros = huecosPedidos(d, n, xs.length).map(
    (h) =>
      `<rect x="${h.x0}" y="${fila - 4 * ADULTO_EN_EL_CUADRO}" width="${h.x1 - h.x0}" height="${4 * ADULTO_EN_EL_CUADRO}" fill="none" stroke="#5a5a5a" stroke-width="4" stroke-dasharray="18 12"/>`,
  );
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
    ...recuadros,
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
    .flatten({ background: GRIS_DE_LA_IDENTIDAD })
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
  return sharp({
    create: { width: ancho, height: alto + 140, channels: 3, background: GRIS_DE_LA_IDENTIDAD },
  })
    .composite([...capas, { input: Buffer.from(rotulos), left: 0, top: 0 }])
    .png()
    .toBuffer();
}

/**
 * La identidad de un retoque: el trozo del maestro en la región de su sitio, de
 * arriba a su pie, sobre gris. Del maestro y no de su recorte, para que no cambie
 * al llegar el retoque (el recorte sale entonces de él).
 */
async function trozoDelMaestro(f: FactionId, id: string): Promise<Buffer> {
  const { tramo, region } = disposicionDe(f).sitios[sitioDeEdificio(f, id).id];
  const maestro = join(RAIZ, `${maestroDelTramo(f, tramo)}.webp`);
  if (!existsSync(maestro)) {
    throw new Error(
      `no está el maestro del tramo ${tramo} de ${f}: sin él no hay identidad del retoque de "${id}"`,
    );
  }
  const aire = 40;
  return sharp(maestro)
    .extract({ left: region.x0, top: 0, width: region.x1 - region.x0, height: region.pie })
    .flatten({ background: GRIS_DE_LA_IDENTIDAD })
    .extend({ top: aire, bottom: aire, left: aire, right: aire, background: GRIS_DE_LA_IDENTIDAD })
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
  const d = disposicionDe(f);
  const { conIdentidad } = ARTE_DE_LA_BASE[f];
  const escritas: string[] = [];
  for (let n = 1; n <= d.tramos; n++) {
    // La guía se rehace si cambia (otro reparto de puertas o de juntas), pero solo
    // mientras su maestro no esté pintado: desde entonces es la referencia con que
    // se pidió (su sha256 está en la procedencia), y lo de fuera, que la mueve, se
    // mide DESPUÉS sobre el cuadro (en F3, medir T1 la rehízo sin pedir nada).
    // Para pedir otra vez el maestro con otra guía, se borran los dos.
    const guia = guiaDelTramo(f, n);
    const pintado = enDisco(`${maestroDelTramo(f, n)}.webp`);
    if (await escribir(guia, () => guiaDe(f, d, n), pintado)) escritas.push(guia);
    // Las hojas, siempre fijas: además necesitan `~/.codex`. Solo con los crudos de la vuelta 1.
    if (!conIdentidad) continue;
    const ids = sitiosDelTramo(d, n).map((s) => primero(f, s));
    if (await escribir(identidadDelTramo(f, n), () => hojaDeIdentidad(ids), true))
      escritas.push(identidadDelTramo(f, n));
  }
  for (const { id } of conIdentidad ? mejorasDe(f) : []) {
    if (await escribir(identidadDeEdicion(f, id), () => hojaDeIdentidad([id]), true))
      escritas.push(identidadDeEdicion(f, id));
  }
  for (const id of Object.keys(RETOQUES(f))) {
    if (await escribir(identidadDelRetoque(f, id), () => trozoDelMaestro(f, id), true))
      escritas.push(identidadDelRetoque(f, id));
  }
  return escritas;
}

/** Los edificios que se levantan en la base, sitio a sitio y eslabón a eslabón: los que pueden llevar recorte. */
export function edificiosConArte(faccion: FactionId): readonly string[] {
  return sitiosDeLaBase(faccion).flatMap((s) => s.cadena);
}
