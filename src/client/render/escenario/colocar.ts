/**
 * Las reglas del escenógrafo: de un mapa del juego, una escena para pintar.
 *
 * Nada aquí es un objeto suelto por casilla. Cada franja de barrera se viste
 * como una FORMACIÓN —un bosque son cientos de árboles apretados, más altos
 * hacia dentro; una cordillera, cientos de picos que crecen hacia el centro;
 * una muralla, una sola línea de tramos con torres en las juntas— y el suelo se
 * cubre de detalle para que no quede desnudo. Las alturas (`relieve.ts`) ponen
 * mesetas, barrancos y caras de roca.
 *
 * Es puro salvo por leer los índices de los módulos y las medidas de las piezas
 * del disco; la escena es un JSON que pinta `pintor.ts`.
 */
import type { MapObject } from '@core/map/map.js';
import type { Barrera, Suelo } from '@core/map/terrain.js';
import { type Analisis, analizar, type Franja, type MapaDeEscena } from './analizar.js';
import {
  bajoLaSilueta,
  carasLisas,
  type PerfilDe,
  perfilesDelCatalogo,
  pintadaDeCara,
} from './caras.js';
import {
  type Catalogo,
  esHojaDeBajada,
  esHojaDeDiagonal,
  esHojaDeLadera,
  type Modulo,
  type ModuloDeBajada,
  type ModuloDeDiagonal,
  type ModuloDeLadera,
  moduloDeLadera,
  type PapelDeLadera,
  type Pieza,
} from './catalogo.js';
import {
  abajoDe,
  type Bajada,
  bajadasDe,
  type Caidas,
  type Celda,
  caidas,
  cantosDe,
  celdas as celdasDe,
  claveDeCelda,
  esVisto,
  filosDe,
  JUNTAS,
  pieDeJunta,
  rampaDe,
  rebordesDe,
  taludDeBajada as taludDeBajadaDe,
} from './celdas.js';
import { azarDe, esparcir } from './esparcir.js';
import { ejeDe, esqueleto } from './esqueleto.js';
import { seHornea } from './horneado.js';
import {
  altoMaximoDe,
  type MaterialDePico,
  macizoDe,
  materialDeLosMacizos,
  materialDePico,
  PASO_DEL_RUIDO,
  radioDePico,
} from './macizo.js';
import { esHito, nodoDePaso, type PasoALaVista, pasosALaVista, varianteDeId } from './nodos.js';
import { type Caja, cajaDeSprite, Pasillo } from './pasillo.js';
import { esVolumen, ordenDeVolumenes, separar, UMBRAL_DE_VOLUMEN } from './pintar.js';
import {
  type Puente,
  puenteDe,
  sendasDeEstriboEnAgua,
  tramosHastaLosEstribos,
  vadosDeLosEstribos,
} from './puentes.js';
import {
  ALTO_DE_NIVEL,
  acantiladosARas,
  bordeDeLadera,
  CARA_DE_SUELO,
  type CaraDeEscena,
  caidaDeLadera,
  type Ladera,
  pieDeLadera,
  relieve,
} from './relieve.js';
import {
  SEMIANCHO_DEL_PASILLO,
  SEMIANCHO_DEL_PASILLO_DE_MASA,
  type Senda,
  sendas,
} from './sendas.js';

/** Qué puede ser un sprite: de aquí salen `Sprite['clase']` y lo que valida una marca de fallo. */
export const CLASES_DE_SPRITE = [
  'masa',
  'muro',
  'pared',
  'cubierta',
  'roca',
  'orilla',
  'objeto',
  'nube',
] as const;

/** Un sprite de la escena: una imagen apoyada por su ancla en `(x, y)`, en casillas. */
export interface Sprite {
  /** Ruta relativa a `assets/mapa/`, o null si el arte aún no existe (se pinta un marcador). */
  readonly src: string | null;
  /** Tamaño nativo y ancla de la imagen, en sus píxeles. */
  readonly nw: number;
  readonly nh: number;
  readonly ax: number;
  readonly ay: number;
  readonly x: number;
  readonly y: number;
  /** Alto en pantalla, en casillas. */
  readonly alto: number;
  /**
   * Ancho en pantalla, en casillas, si no es el de su proporción: una pieza del
   * relieve de caída 2 estirada en alto hasta una caída 3 (decisión del usuario,
   * 07-10-2026). Sin él, `alto × nw / nh`.
   */
  readonly ancho?: number;
  /** Qué es: para medir y para el marcador. */
  readonly clase: (typeof CLASES_DE_SPRITE)[number];
  readonly color: string;
  /** Se pinta en su orden por la y (0) o encima de todo (1, las nubes). */
  readonly capa: 0 | 1;
  /** Sombra difusa al pie. */
  readonly sombra: boolean;
  /** Un filtro de canvas para entonar el módulo con el resto (`brightness(0.8)`). */
  readonly tono?: string;
  /**
   * El objeto del mapa que pinta, si pinta uno. Lo que cambia en la partida (un
   * monstruo vencido, un recurso o un cofre recogidos) no se hornea en la escena:
   * quien la pinte lo deja fuera con `pintarEscena({ objeto })` y lo pinta él.
   */
  readonly objeto?: { readonly id: string; readonly kind: MapObject['kind'] };
  /** Si la imagen es una hoja, el trozo que se pinta: `[sx, sy, sw, sh]`. */
  readonly recorte?: readonly [number, number, number, number];
}

export interface Luz {
  readonly x: number;
  readonly y: number;
  /** Radio en casillas. */
  readonly r: number;
  readonly clase: 'fuego' | 'brasa' | 'niebla';
}

export interface Escena {
  readonly semilla: number;
  readonly W: number;
  readonly H: number;
  readonly suelo: readonly Suelo[];
  readonly nivel: readonly number[];
  readonly agua: readonly number[];
  readonly relieve: {
    /** Las caídas al sur con lo que se pinta de ellas (`pintada`): donde no hay pared, no se pinta. */
    readonly caras: readonly CaraDeEscena[];
    /** Las casillas de las caídas al este y al oeste: la franja difuminada del pie (`cantosDe`). */
    readonly cantos: readonly (readonly [number, number, 'este' | 'oeste'])[];
    /** Las casillas más altas que la de su norte: el reborde de lo que cae de espaldas (`rebordesDe`). */
    readonly rebordes: readonly (readonly [number, number])[];
    /**
     * Las paredes que se ven, una por celda de vértice y grupo de umbrales
     * (`celdas.ts`, R4), sin las que cruza un puente. Lo que mide el informe
     * (`celdasMalCubiertas`) y lo que guarda una marca.
     */
    readonly celdas: readonly Celda[];
    /** Por dónde bajan las sendas hacia la cámara o de lado: una pieza encima de la pared cada una (R5). */
    readonly bajadas: readonly Bajada[];
  };
  readonly altoDeNivel: number;
  readonly caminos: readonly (readonly [number, number, number, number])[];
  /** Los caminos encadenados y suavizados: lo que se pinta. Acaban en los estribos de los puentes. */
  readonly sendas: readonly Senda[];
  /** Los puentes, uno por nodo de agua (`puentes.ts`): su sprite lleva su `id`. */
  readonly puentes: readonly Puente[];
  /**
   * Los trozos de senda junto a un estribo donde no se pinta el agua
   * (`vadosDeLosEstribos`): la senda llega al puente por tierra.
   */
  readonly vados: readonly Senda[];
  /**
   * La luz y el aire, encima de todo menos las nubes: el resplandor cálido de
   * ciudades y pueblos, las brasas de la lava y la niebla baja del agua y la
   * ciénaga.
   */
  readonly luces: readonly Luz[];
  readonly sprites: readonly Sprite[];
  readonly informe: {
    readonly murallasPartidas: number;
    readonly basesSobreReserva: number;
    readonly casillasDeBarreraSinFormacion: number;
    /**
     * Sprites de una clase que se aparta del camino (`APARTE`) cuyo rectángulo
     * pisa su pasillo (`pasillo.ts`): tiene que ser 0.
     */
    readonly spritesSobreSenda: number;
    /**
     * Paredes vistas sin exactamente su pieza en su sitio —una frontal, una
     * ladera o una diagonal (o su marcador) con sus juntas en las de su celda—,
     * salvo las vacías por una razón declarada: la reserva de un objeto o un
     * barranco (`celdasMalCubiertas`): tiene que ser 0.
     */
    readonly celdasMalCubiertas: number;
    /**
     * Bajadas sin su pieza (o su marcador) con su `arriba` donde la senda cruza
     * el filo (`bajadasSinPieza`): tiene que ser 0.
     */
    readonly bajadasSinPieza: number;
    /**
     * Bajadas cuyo camino tapa algo que se pinta después, contado desde el orden
     * del pintor (`bajadasTapadas`), como los puentes: tiene que ser 0.
     */
    readonly bajadasTapadas: number;
    /**
     * Bajadas que se pintan encima de lo horneado (ciudad, pueblo, mina, nodo)
     * de la casilla a la que bajan, con el que se solapan, desde el orden del
     * pintor (`bajadasSobreNodo`): tiene que ser 0.
     */
    readonly bajadasSobreNodo: number;
    /**
     * Trozos de cara de acantilado que se pintan y no tapa la silueta de
     * ninguna pared, de al menos 0,3 de ancho y de alto (`carasLisas`): tiene
     * que ser 0.
     */
    readonly carasLisas: number;
    /**
     * Casillas bajas a las que bajan laderas de los dos lados en la misma fila,
     * con los pies montados (`laderasEnfrentadas`): tiene que ser 0.
     */
    readonly laderasEnfrentadas: number;
    /**
     * Lo que se aparta del camino y la pared que se pintan encima del tablero de
     * un puente, contados desde el orden del pintor (`puentesTapados`) y no
     * desde la puerta (`vaDelante`): tiene que ser 0.
     */
    readonly puentesTapados: number;
    /**
     * Nodos de paso de montaña, bosque o muro cuyo eje pisa el rectángulo de un
     * volumen de los que se apartan (`pasosTapados`): tiene que ser 0.
     */
    readonly pasosTapados: number;
    /**
     * Sendas que salen de un estribo y pasan por agua pintada en sus primeras
     * casillas, sin vado que la quite (`sendasDeEstriboEnAgua`): tiene que ser 0.
     */
    readonly sendasDeEstriboEnAgua: number;
    /**
     * Casillas de acantilado a ras de una casilla que se pisa a su lado, sin
     * desnivel que las distinga del llano (`acantiladosARas`): tiene que ser 0.
     */
    readonly acantiladosARas: number;
    readonly modulosQueFaltan: readonly string[];
  };
}

/**
 * Lo que encoge una clase baja junto a la senda: por debajo de esta fracción de
 * su alto se quita (decisión del usuario, 05-10-2026: encoger antes que quitar).
 */
const ENCOGER_HASTA = 0.4;

/** Una masa encogida por debajo de este alto, en casillas, ya no se lee como árbol ni como pico. */
const ALTO_MINIMO_DE_MASA = 0.3;

/**
 * Dónde se prueba a poner el relleno de una casilla de bosque o cordillera sin
 * ningún dardo, relativo a su esquina: una rejilla de 4 × 4, de más cerca a más
 * lejos del centro de su mitad baja (el pie de un sprite va abajo; la imagen
 * crece hacia arriba).
 */
const SITIOS_DE_RELLENO: readonly (readonly [number, number])[] = [0.125, 0.375, 0.625, 0.875]
  .flatMap((dx) => [0.3, 0.5, 0.7, 0.9].map((dy) => [dx, dy] as const))
  .sort(
    (p, q) =>
      Math.hypot(p[0] - 0.5, p[1] - 0.65) - Math.hypot(q[0] - 0.5, q[1] - 0.65) ||
      p[1] - q[1] ||
      p[0] - q[0],
  );

// ------------------------------------------------------------------ las reglas

/** Qué hoja viste cada barrera, según el suelo de al lado. */
function hojaDeMasa(b: Barrera, s: Suelo, azar: () => number, hondura = 1): string {
  if (b === 'forest') {
    if (s === 'snow') return 'abetos-nevados';
    if (s === 'swamp') return 'muertos';
    if (s === 'grass' || s === 'dirt') return azar() < 0.65 ? 'pinos' : 'frondosos';
    return 'pinos';
  }
  return hojaDePico(materialDePico(s), azar, hondura >= 2 ? 0.625 : 0);
}

/** Por debajo de esta `cumbre` (`Macizo.cumbre`), la roca es de falda: nunca agujas. */
const CUMBRE_DE_AGUJAS = 0.25;

/**
 * La hoja de un pico según su material y lo alto que cae en el macizo: en las
 * cumbres, agujas; en las faldas, los achaparrados. La nieve, la lava y la arena
 * tienen una sola hoja.
 */
function hojaDePico(material: MaterialDePico, azar: () => number, cumbre: number): string {
  // La tirada de la aguja se hace siempre, aunque el material no tenga agujas:
  // así el material no cambia cuántas tiradas gasta un pico, y vestir un macizo
  // de otro material no mueve los picos de las franjas que vienen detrás (con
  // la tirada solo en la roca, dar a cada macizo un material barajaba la
  // cresta de las semillas 3 y 9 y el guardia de #171 lo leía como peor).
  const tirada = azar();
  if (material === 'nieve') return 'picos-nevados';
  if (material === 'lava') return 'picos-volcan';
  if (material === 'arena') return 'picos-arenisca';
  return cumbre >= CUMBRE_DE_AGUJAS && tirada < Math.min(0.95, 1.5 * cumbre)
    ? 'picos-afilados'
    : 'picos-roca';
}

/**
 * La luz de un pico según lo alto que cae en el macizo: la falda en la sombra
 * del valle y las cumbres al sol, en tres escalones (cada tono es una copia
 * más de la imagen en la caché, `render/copias.ts`). Es lo que da volumen a la
 * masa vista desde arriba; sin ella, falda y cumbre eran el mismo gris.
 */
function luzDeCumbre(cumbre: number): string | undefined {
  if (cumbre < 0.2) return 'brightness(0.78)';
  if (cumbre < 0.45) return 'brightness(0.9)';
  if (cumbre > 0.7) return 'brightness(1.06)';
  return undefined;
}

/** Tamaño del bosque: radio entre árboles y alto, en casillas, según la hondura. */
const BOSQUE = {
  radio: (h: number) => 0.3 + Math.min(h, 3) * 0.02,
  alto: (h: number) => 0.85 + Math.min(h, 3) * 0.22,
} as const;

/**
 * La cubierta de cada suelo se mezcla con la de su vecino natural: la roca lleva
 * matas de pradera entre las piedras y la lava, roca suelta. Con una sola hoja,
 * los suelos duros quedaban pelados.
 */
const MEZCLA: Readonly<Record<Suelo, readonly (readonly [Suelo, number])[]>> = {
  grass: [['grass', 1]],
  dirt: [
    ['dirt', 0.75],
    ['grass', 0.25],
  ],
  sand: [['sand', 1]],
  snow: [['snow', 1]],
  swamp: [
    ['swamp', 0.8],
    ['grass', 0.2],
  ],
  lava: [
    ['lava', 0.7],
    ['rough', 0.3],
  ],
  rough: [
    ['rough', 0.55],
    ['grass', 0.45],
  ],
};

function hojaDeCubierta(s: Suelo, tirada: number): string {
  let acumulado = 0;
  for (const [otro, peso] of MEZCLA[s]) {
    acumulado += peso;
    if (tirada < acumulado) return `cubierta-${otro}`;
  }
  return `cubierta-${s}`;
}

/** Densidad de la cubierta del suelo: radio entre detalles y alto, en casillas. */
const CUBIERTA: Readonly<Record<Suelo, { radio: number; alto: number }>> = {
  grass: { radio: 0.24, alto: 0.42 },
  dirt: { radio: 0.3, alto: 0.5 },
  sand: { radio: 0.28, alto: 0.4 },
  snow: { radio: 0.26, alto: 0.44 },
  swamp: { radio: 0.24, alto: 0.42 },
  lava: { radio: 0.27, alto: 0.4 },
  rough: { radio: 0.25, alto: 0.38 },
};

/** La mata más baja, en veces el alto de la cubierta de su suelo; la más alta, 0,6 más. */
const MATA_MAS_BAJA = 0.7;

const ARBOLES = ['pinos', 'frondosos', 'muertos', 'abetos-nevados'];
const PICOS = ['picos-roca', 'picos-afilados', 'picos-nevados', 'picos-volcan', 'picos-arenisca'];

/** Cómo se aparta una clase del camino. */
export interface Aparte {
  /** La media anchura del pasillo que no pisa su rectángulo, en casillas. */
  readonly semiancho: number;
  /** Por debajo de este alto, encogida para no pisarlo, ya no se pone. */
  readonly minimo: (alto: number) => number;
  /**
   * Las hojas de las que sale. La más estrecha de cada una es su reserva cuando
   * la elegida no cabe, y la más estrecha de todas, al alto mínimo, es el sprite
   * con el que pregunta el dardo. `poner` lanza con una hoja que no esté aquí.
   */
  readonly hojas: readonly string[];
}

/**
 * Qué clases se apartan del camino y cómo. Las de `null` pueden tocarlo —el
 * muro y la pared son la barrera que el camino cruza; el objeto, su destino— y
 * solo esquivan las reservas de los objetos.
 *
 * La pared, además, se aparta de la senda que baja por una cara y de la que
 * sigue junto a ella (`Bajadas.junto`), con su propio pasillo y la misma
 * política: se encoge, si no el módulo más estrecho, si no se quita. **Nunca se
 * corta**: un trozo con el canto recto se leía como un hueco recortado (#150,
 * decisión del usuario, 06-10-2026).
 */
export const APARTE: Readonly<Record<Sprite['clase'], Aparte | null>> = {
  cubierta: {
    semiancho: SEMIANCHO_DEL_PASILLO,
    minimo: (alto) => ENCOGER_HASTA * alto,
    hojas: [...Object.keys(MEZCLA).map((s) => `cubierta-${s}`), ...ARBOLES],
  },
  roca: {
    semiancho: SEMIANCHO_DEL_PASILLO,
    minimo: (alto) => ENCOGER_HASTA * alto,
    hojas: ['rocas-caidas', ...PICOS],
  },
  orilla: {
    semiancho: SEMIANCHO_DEL_PASILLO,
    minimo: (alto) => ENCOGER_HASTA * alto,
    hojas: ['orilla'],
  },
  masa: {
    semiancho: SEMIANCHO_DEL_PASILLO_DE_MASA,
    minimo: () => ALTO_MINIMO_DE_MASA,
    hojas: [...ARBOLES, ...PICOS],
  },
  muro: null,
  pared: null,
  objeto: null,
  nube: null,
};

/**
 * El filtro con el que se entona cada hoja al pintarla. Las piedras claras
 * (rocas caídas, cubierta de roca y de arena) salpicaban el mapa de motas
 * blancas; la arenisca sale de un rojo que grita al lado del resto; y la roca
 * gris de las paredes salió casi beige.
 */
const PALIDA = 'brightness(0.78) saturate(0.9)';
const CHILLONA = 'brightness(0.8) saturate(0.72)';
/**
 * Las laderas de basalto se leían como una franja gris lisa y clara junto a la
 * ceniza rojiza (el usuario, 07-10-2026: más oscuras y un poco más cálidas). Sin
 * filtro dan luz 62 y R−B 11; con `contrast(0.8) brightness(0.8)`, el de antes,
 * 60 y 7 (más fría aún); con este, 53 y 15. La frontal de basalto da 71 y 20, y
 * el suelo de ceniza, 42 y 18 (`tono-basalto.mts` en
 * `docs/agents/2026-10-06-paredes-laterales/`). Uno más fuerte (luz 53, R−B 18,
 * con contraste 0,8) las fundía con la ceniza y perdían el relieve.
 */
const BASALTO_DE_LADERA =
  'contrast(0.9) brightness(0.72) sepia(0.3) saturate(1.3) hue-rotate(-10deg)';
const TONO: Readonly<Record<string, string>> = {
  'rocas-caidas': PALIDA,
  'cubierta-rough': PALIDA,
  'cubierta-sand': PALIDA,
  'picos-arenisca': CHILLONA,
  'paredes-arenisca': CHILLONA,
  'paredes-roca': 'brightness(0.72) saturate(0.85)',
  // Las laderas (§20), por familia —todas sus caídas—, medidas contra su
  // frontal entonada (07-10-2026, `docs/agents/2026-10-06-paredes-laterales/
  // tono-laderas.mts`). La arenisca del oeste, de cara a la luz, sale más clara
  // y naranja (luz 86 contra 69): con CHILLONA queda en la de su frontal.
  'laderas-arenisca-oeste': CHILLONA,
  'laderas-basalto-este': BASALTO_DE_LADERA,
  'laderas-basalto-oeste': BASALTO_DE_LADERA,
};

/** El tono de una hoja: el suyo o, en una hoja de laderas, el de su familia (sin la caída). */
function tonoDe(hoja: string): string | undefined {
  return (
    TONO[hoja] ?? (hoja.startsWith('laderas-') ? TONO[hoja.replace(/-[123]$/, '')] : undefined)
  );
}

/** Lo que pone cada material de cara (`CARA_DE_SUELO`). */
interface MaterialDeCara {
  /** El nombre del material en las hojas del relieve (`diagonales-<nombre>-…`, `bajadas-<nombre>-…`). */
  readonly nombre: string;
  /** La hoja de la pared frontal, la de las caídas al sur. */
  readonly pared: string;
  /** La familia de laderas, sin el lado ni la caída (`hojaDeLadera`). */
  readonly ladera: string;
  /**
   * El tono de los peñascos de una cara (su pedregal, el remate del tajo y los
   * del pie), de un canto y de lo alto de un acantilado: la hoja es gris, y
   * sobre la arenisca se leían como cascotes traídos de otro sitio (#150, N3).
   */
  readonly pedregal: string;
}

const MATERIAL_DE_CARA: Readonly<Record<string, MaterialDeCara>> = {
  'cara-roca': { nombre: 'roca', pared: 'paredes-roca', ladera: 'laderas-roca', pedregal: PALIDA },
  'cara-arenisca': {
    nombre: 'arenisca',
    pared: 'paredes-arenisca',
    ladera: 'laderas-arenisca',
    pedregal: 'sepia(1) saturate(2.2) hue-rotate(-28deg) brightness(0.62)',
  },
  'cara-basalto': {
    nombre: 'basalto',
    pared: 'paredes-basalto',
    ladera: 'laderas-basalto',
    pedregal: 'brightness(0.5) saturate(0.7)',
  },
  'cara-nevada': {
    nombre: 'nevadas',
    pared: 'paredes-nevadas',
    ladera: 'laderas-nevadas',
    pedregal: 'brightness(1.02) saturate(0.4)',
  },
};

/**
 * Las hojas y el tono de un material de cara. Lanza con uno que no está en la
 * tabla: caer en silencio a la roca pintaba roca gris sobre un material nuevo.
 */
export function materialDeCara(material: string): MaterialDeCara {
  const m = MATERIAL_DE_CARA[material];
  if (m === undefined)
    throw new Error(
      `no hay paredes para el material de cara «${material}»: añádelo a MATERIAL_DE_CARA (colocar.ts)`,
    );
  return m;
}

/**
 * Lo ancho que se pinta cada tramo de muro, en casillas, para que cubra su paso
 * con un poco de solape: el horizontal, una casilla; el diagonal, √2; el que va
 * hacia el fondo es estrecho y se mide por lo que sube en pantalla.
 */
const ANCHO_DE_TRAMO: Readonly<Record<string, number>> = {
  horizontal: 1.25,
  'diagonal-baja': 1.5,
  'diagonal-sube': 1.5,
  profundidad: 0.55,
};

const MARCADOR: Readonly<Record<string, string>> = {
  forest: '#1f3a22',
  mountain: '#6e6a74',
  wall: '#6d6656',
  cliff: '#7a5a3a',
  water: '#2a4a6a',
  cubierta: '#4f5a35',
};

/** Reservas: donde nada que no sea el objeto puede apoyarse (sub-rejilla de 4 por casilla). */
class Reservas {
  private readonly celdas: Uint8Array;
  constructor(
    private readonly W: number,
    private readonly H: number,
  ) {
    this.celdas = new Uint8Array(W * 4 * H * 4);
  }
  reservar(x: number, y: number, r: number): void {
    for (let sy = Math.floor((y - r) * 4); sy <= Math.ceil((y + r) * 4); sy++)
      for (let sx = Math.floor((x - r) * 4); sx <= Math.ceil((x + r) * 4); sx++) {
        if (sx < 0 || sy < 0 || sx >= this.W * 4 || sy >= this.H * 4) continue;
        if (Math.hypot((sx + 0.5) / 4 - x, (sy + 0.5) / 4 - y) <= r)
          this.celdas[sy * this.W * 4 + sx] = 1;
      }
  }
  tomada(x: number, y: number): boolean {
    const sx = Math.floor(x * 4);
    const sy = Math.floor(y * 4);
    if (sx < 0 || sy < 0 || sx >= this.W * 4 || sy >= this.H * 4) return false;
    return this.celdas[sy * this.W * 4 + sx] === 1;
  }
}

/**
 * El monstruo que guarda el mapa. Sin imagen: el juego no lo hornea —cambia en
 * la partida— y lo pinta con su figura, y el taller con su marcador. Apuntaba al
 * `atlas.webp` de una dirección de una tropa, que se borró con el arte de una
 * dirección: el 404 de esa ruta salía en la consola de cada página que la
 * pidiera, y `pnpm capturas` sale 1 con un error en la consola.
 */
const MONSTRUO = {
  src: null,
  nw: 256,
  nh: 256,
  ax: 128,
  ay: 228,
  recorte: [0, 0, 256, 256] as const,
};

/** La media anchura con la que una pared mira el tablero de un puente que taparía: la de las masas. */
export const SEMIANCHO_DE_PARED = SEMIANCHO_DEL_PASILLO_DE_MASA;

/**
 * El hito de un nodo se mide por el alto, una casilla (#168): las tres variantes
 * (#176) tienen proporciones distintas y por el ancho el mojón, más ancho que
 * alto, se quedaba en un guijarro. Sin arte, el marcador mide `ANCHO_DEL_HITO`.
 */
const ALTO_DEL_HITO = 1;
const ANCHO_DEL_HITO = 0.6;

export function componer(map: MapaDeEscena, semilla: number, catalogo: Catalogo): Escena {
  /** Los módulos de una hoja, de menor a mayor, o null si la hoja aún no está hecha. */
  const modulosDe = (hoja: string): readonly Modulo[] | null => catalogo.hojas[hoja] ?? null;
  const pieza = (id: string): Pieza | null => catalogo.piezas[id] ?? null;
  const a = analizar(map);
  const { nivel } = relieve(a, semilla);
  const azar = azarDe(semilla * 7919 + 1);
  const { W, H } = a;
  const sprites: Sprite[] = [];
  const faltan = new Set<string>();
  const reservas = new Reservas(W, H);
  let basesSobreReserva = 0;

  const estrechos = new Map<string, Modulo | undefined>();
  /** El módulo más estrecho de una hoja (ancho entre alto), si la hoja está hecha. */
  const masEstrecho = (hoja: string): Modulo | undefined => {
    if (!estrechos.has(hoja))
      estrechos.set(
        hoja,
        [...(modulosDe(hoja) ?? [])].sort((p, q) => p.nw / p.nh - q.nw / q.nh)[0],
      );
    return estrechos.get(hoja);
  };

  /** Un sprite de una hoja: elige el módulo por tamaño relativo `t` (0 pequeño, 1 grande). */
  const deHoja = (
    hoja: string,
    x: number,
    y: number,
    alto: number,
    t: number,
    clase: Sprite['clase'],
    color: string,
    sombra: boolean,
    nombre?: string,
    porAncho?: number,
  ): Sprite => {
    const ms = modulosDe(hoja);
    if (ms === null || ms.length === 0) {
      faltan.add(hoja);
      return {
        src: null,
        nw: 1,
        nh: 1,
        ax: 0.5,
        ay: 1,
        x,
        y,
        alto,
        clase,
        color,
        capa: clase === 'nube' ? 1 : 0,
        sombra,
      };
    }
    let m: Modulo | undefined;
    if (nombre !== undefined) m = ms.find((k) => k.nombre === nombre);
    if (m === undefined) {
      // Alrededor del cuantil `t`, con algo de azar para que no se repitan.
      const centro = Math.round(t * (ms.length - 1));
      const k = Math.max(0, Math.min(ms.length - 1, centro + Math.round((azar() - 0.5) * 4)));
      m = ms[k] as Modulo;
    }
    const tono = tonoDe(hoja);
    return {
      ...(tono === undefined ? {} : { tono }),
      src: m.src,
      nw: m.nw,
      nh: m.nh,
      ax: m.ax,
      ay: m.ay,
      x,
      y,
      // Un tramo de muro se mide por lo largo que tiene que ser, no por lo alto.
      alto: porAncho === undefined ? alto : (porAncho * m.nh) / m.nw,
      clase,
      color,
      capa: clase === 'nube' ? 1 : 0,
      sombra,
    };
  };

  // 1 · Los objetos primero: reservan su sitio y nada se apoya encima.
  const RADIO_DE_OBJETO: Readonly<Record<string, number>> = {
    town: 1.5,
    village: 1.1,
    node: 0.95,
    resource: 0.5,
    mine: 0.6,
    chest: 0.4,
    monster: 0.45,
  };
  /**
   * El sprite de un objeto del mapa: su pieza por su ancla, o sin ella su
   * marcador. Lo comparten los objetos y los puentes.
   */
  const deObjeto = (
    o: MapObject,
    p: Pick<Pieza, 'src' | 'nw' | 'nh' | 'ax' | 'ay'> | null,
    x: number,
    y: number,
    alto: number,
    sombra = true,
  ): Sprite => ({
    ...(p === null
      ? { src: null, nw: 1, nh: 1, ax: 0.5, ay: 1 }
      : { src: p.src, nw: p.nw, nh: p.nh, ax: p.ax, ay: p.ay }),
    x,
    y,
    alto,
    clase: 'objeto',
    color: '#c9b27a',
    capa: 0,
    sombra,
    objeto: { id: o.id, kind: o.kind },
  });
  const puentes: Puente[] = [];
  for (const o of a.objetos) {
    const x = o.at.x + 0.5;
    const y = o.at.y + 0.5;
    if (a.puentes.has(o.id)) {
      // El puente se apoya por el centro de su tablero, bajado al suelo: el
      // ancla de la pieza es ese centro (§17), y su escala, la casilla de la
      // guía. Sin sombra: la mancha de su pie, en el centro, oscurecía el arco.
      const pu = puenteDe(o, a, nivel, map.caminos.tramos, catalogo);
      puentes.push(pu);
      const p = pieza(pu.pieza);
      const [cx, cy] = pu.centro;
      if (p === null) faltan.add(pu.pieza);
      sprites.push(
        p?.puente === undefined
          ? deObjeto(o, null, cx, cy, 1.7)
          : deObjeto(
              o,
              { ...p, ay: p.ay + p.puente.altura * p.puente.pxPorCasilla },
              cx,
              cy,
              (p.nh / p.puente.pxPorCasilla) * pu.escala,
              false,
            ),
      );
      continue;
    }
    reservas.reservar(x, y, RADIO_DE_OBJETO[o.kind] ?? 0.5);
    const id =
      o.kind === 'town'
        ? 'ciudad'
        : o.kind === 'village'
          ? 'pueblo'
          : o.kind === 'node'
            ? (() => {
                // El de agua ya salió arriba, con su puente.
                const paso = a.pasos.get(o.id);
                if (paso === undefined) throw new Error(`el nodo ${o.id} no está en el análisis`);
                return nodoDePaso(o.id, paso.barrera, paso.eje);
              })()
            : o.kind === 'resource'
              ? // Mercurio, azufre, cristal y gemas no tienen pieza: van como tesoro.
                (({ gold: 'oro', ore: 'piedra', wood: 'madera' } as Record<string, string>)[
                  o.resource
                ] ?? 'oro')
              : o.kind === 'mine'
                ? 'atlas/mina'
                : o.kind === 'chest'
                  ? 'atlas/cofre'
                  : null;
    if (o.kind === 'monster') {
      sprites.push({
        ...MONSTRUO,
        x,
        y: y + 0.3,
        alto: 1.0,
        clase: 'objeto',
        color: '#b0553f',
        capa: 0,
        sombra: true,
        objeto: { id: o.id, kind: o.kind },
      });
      continue;
    }
    // Ancho en casillas: los de la composición de prueba, que se veían bien. El
    // hito, más estrecho: con su poste, a 1,7 medía 2,2 casillas de alto, más que una mina.
    const ancho = esHito(id)
      ? ANCHO_DEL_HITO
      : ({ town: 2.4, village: 1.9, node: 1.7, resource: 0.95, mine: 1.2, chest: 0.6 }[
          o.kind as 'town'
        ] ?? 0.5);
    // Ciudades y pueblos, cada uno con su variante de la hoja (por su id, siempre
    // la misma); sin la hoja, la pieza única de antes.
    const variantes =
      o.kind === 'town'
        ? modulosDe('ciudades')
        : o.kind === 'village'
          ? modulosDe('pueblos')
          : null;
    const variante =
      variantes !== null && variantes.length > 0
        ? variantes[varianteDeId(o.id, variantes.length)]
        : undefined;
    const p = variante ?? (id === null ? null : pieza(id));
    const alto = p === null ? ancho : esHito(id) ? ALTO_DEL_HITO : (ancho * p.nh) / p.nw;
    sprites.push(deObjeto(o, p, x, y + 0.35, alto));
  }

  // 2 · Los caminos: se encadenan en sendas y cada senda abre su pasillo.
  const caminos = map.caminos.tramos.map(([p, q]): [number, number, number, number] => [
    p.x + 0.5,
    p.y + 0.5,
    q.x + 0.5,
    q.y + 0.5,
  ]);
  // Los nodos y los objetos llevan su camino hasta la puerta: se reserva la casilla entera.
  for (const o of a.objetos)
    if (o.kind === 'node' && !a.puentes.has(o.id))
      reservas.reservar(o.at.x + 0.5, o.at.y + 0.5, 0.75);
  // El pasillo se mide sobre el trazo que se pinta, no sobre la casilla: la
  // senda ondula y entre dos casillas no hay centro que reservar. La senda llega
  // a los estribos de cada puente y no sigue por encima (#157).
  const trazos = sendas(tramosHastaLosEstribos(caminos, puentes), semilla);
  const pasillo = new Pasillo(
    trazos,
    Math.max(...Object.values(APARTE).map((r) => r?.semiancho ?? 0)),
  );
  // Lo que se aparta del camino y la pared se apartan también del tablero de
  // cada puente que taparían (`vaDelante`): con la pared de la cara de detrás
  // encima, el puente quedaba tapado (#157).
  const tableros = tablerosAlPaso(puentes);
  // El eje de cada nodo de paso, con camino o sin él: sin camino que abriera
  // hueco, los picos y los árboles de alrededor lo enterraban y el paso no se
  // distinguía de la cordillera (#173).
  const pasos = pasosALaVista(map, a.puentes);
  const pasilloDeLosPasos = pasilloDeLosPasosDe(pasos);
  // Las paredes del relieve por celdas (R4), sin las que cruza un puente: las
  // tapa su estribo, y debajo del tablero se ve el agua.
  const rel = caidas(
    nivel,
    W,
    H,
    a.suelo,
    celdasBajoLosPuentes(celdasDe(nivel, W, H, a.suelo), puentes),
  );
  // Por dónde bajan las sendas (R5): una pieza encima de la pared cada una. La
  // que llega a un puente no: el puente es su paso.
  const nodosDePuente = new Set(
    a.objetos.filter((o) => a.puentes.has(o.id)).map((o) => `${o.at.x},${o.at.y}`),
  );
  const bajadas = bajadasDe(
    nivel,
    W,
    a.suelo,
    rel.celdas,
    map.caminos.tramos,
    trazos,
    (p, q) => nodosDePuente.has(`${p.x},${p.y}`) || nodosDePuente.has(`${q.x},${q.y}`),
  );
  // Lo que se aparta del camino se aparta también de la rampa de cada bajada,
  // más ancha que la senda y con sus ribazos (R5).
  const pasilloDeLasBajadas = new Pasillo(
    bajadas.map(rampaDe),
    Math.max(...Object.values(APARTE).map((r) => r?.semiancho ?? 0)),
  );
  /** El sprite más estrecho de cada clase que se aparta: el que pregunta el dardo. */
  const moldes = new Map<Sprite['clase'], Pick<Sprite, 'nw' | 'nh' | 'ax' | 'ay'>>();
  for (const [clase, r] of Object.entries(APARTE) as [Sprite['clase'], Aparte | null][]) {
    if (r === null) continue;
    const ms = r.hojas.flatMap((h) => masEstrecho(h) ?? []);
    moldes.set(
      clase,
      ms.sort((p, q) => p.nw / p.nh - q.nw / q.nh)[0] ?? { nw: 1, nh: 1, ax: 0.5, ay: 1 },
    );
  }
  /**
   * Si `s` entra en su sitio: ni su pie sobre la reserva de un objeto ni,
   * encogido hasta su mínimo, su rectángulo sobre el pasillo de su clase ni
   * sobre un tablero que taparía. Es la pregunta de `poner` y la del dardo.
   */
  const entra = (s: Pick<Sprite, 'x' | 'y' | 'nw' | 'nh' | 'ax' | 'ay' | 'alto' | 'clase'>) => {
    if (reservas.tomada(s.x, s.y)) return false;
    const r = APARTE[s.clase];
    if (r === null) return true;
    const minimo = r.minimo(s.alto);
    return (
      !pasillo.pisa(cajaDeSprite(s, minimo), r.semiancho) &&
      !pasilloDeLasBajadas.pisa(cajaDeSprite(s, minimo), r.semiancho) &&
      !tapaUnTablero(s, tableros, r.semiancho, minimo) &&
      !tapaUnPaso(s, pasilloDeLosPasos, minimo)
    );
  };
  /**
   * El dardo de una clase en `(x, y)`: si entraría su sprite más estrecho con el
   * alto más bajo que vaya a tener. Así no se gasta un dardo donde `poner` no
   * podría poner nada, que dejaba el hueco pelado.
   */
  const entraria = (clase: Sprite['clase'], x: number, y: number, alto: number) => {
    const m = moldes.get(clase);
    if (m === undefined) return !reservas.tomada(x, y);
    return entra({ nw: m.nw, nh: m.nh, ax: m.ax, ay: m.ay, x, y, alto, clase });
  };
  /** Mete `s` en la escena y cuenta si su base pisa una reserva. */
  const meter = (s: Sprite): true => {
    if (reservas.tomada(s.x, s.y)) basesSobreReserva++;
    sprites.push(s);
    return true;
  };
  /** `s` con el mayor alto, hasta el suyo, con el que no pisa el pasillo de su clase ni tapa un tablero. */
  const ajustado = (s: Sprite, r: Aparte): Sprite => {
    const alto = Math.min(
      pasillo.altoLibre(s, r.semiancho),
      pasilloDeLasBajadas.altoLibre(s, r.semiancho),
      altoLibreAnteLosPuentes(s, tableros, r.semiancho),
      altoLibreAnteLosPasos(s, pasilloDeLosPasos),
    );
    return alto === s.alto ? s : { ...s, alto };
  };
  /**
   * La única puerta de lo que no es objeto ni nube a la escena; dice si entró.
   * Lo que se aparta del camino entra si `entra`, tan alto como quepa; si no,
   * se prueba el módulo más estrecho de su hoja, y si tampoco, no entra.
   */
  const poner = (
    hoja: string,
    x: number,
    y: number,
    alto: number,
    t: number,
    clase: Sprite['clase'],
    color: string,
    sombra: boolean,
    nombre?: string,
    porAncho?: number,
    tono?: string,
  ): boolean => {
    const deLaHoja = deHoja(hoja, x, y, alto, t, clase, color, sombra, nombre, porAncho);
    const s = tono === undefined || deLaHoja.src === null ? deLaHoja : { ...deLaHoja, tono };
    const r = APARTE[clase];
    if (r === null) return meter(s);
    if (!r.hojas.includes(hoja))
      throw new Error(`la hoja «${hoja}» no está entre las de la clase ${clase} (APARTE)`);
    if (entra(s)) return meter(ajustado(s, r));
    const e = masEstrecho(hoja);
    if (e === undefined || e.src === s.src) return false;
    const estrecho = { ...s, src: e.src, nw: e.nw, nh: e.nh, ax: e.ax, ay: e.ay };
    return entra(estrecho) && meter(ajustado(estrecho, r));
  };
  /** `s` y, si es otro, el módulo más estrecho de su hoja en su sitio: lo que prueba `ponerPared`. */
  const yElMasEstrecho = (s: Sprite, hoja: string): [Sprite, ...Sprite[]] => {
    const e = masEstrecho(hoja);
    return e === undefined || e.src === s.src
      ? [s]
      : [s, { ...s, src: e.src, nw: e.nw, nh: e.nh, ax: e.ax, ay: e.ay }];
  };
  /**
   * La puerta de la pared (frontal, ladera, diagonal y peñascos): ningún punto
   * de `puntos` (su pie y lo que tapa por encima: el filo, el medio de una
   * ladera, las juntas de una diagonal) cae en la reserva de un objeto, y no
   * tapa ningún tablero (`altoLibreAnteLosPuentes`): se prueba cada uno de
   * `modulos` en su orden, encogido sin bajar de `minimo`. Dice si se puso.
   *
   * Con el relieve por celdas (R4/R5) la pared ya no se aparta de la senda que
   * baja: ni se corre, ni se encoge, ni se quita por ella, y nunca se corta. La
   * bajada se pinta encima. El muro bajo junto a la senda (#172) era eso.
   */
  /**
   * Las cajas de las paredes que la puerta no dejó entrar, con el porqué (la
   * reserva de un objeto o un puente que taparían): la razón declarada de las
   * celdas que quedan vacías ahí (`vaciaPorque`).
   */
  const rechazos: Rechazo[] = [];
  const ponerPared = (
    modulos: readonly [Sprite, ...Sprite[]],
    minimo: number,
    puntos: readonly (readonly [number, number])[],
  ): boolean => {
    if (puntos.some(([x, y]) => reservas.tomada(x, y))) {
      rechazos.push({ caja: cajaDeSprite(modulos[0]), razon: 'reserva' });
      return false;
    }
    for (const m of modulos) {
      const alto = altoLibreAnteLosPuentes(m, tableros, SEMIANCHO_DE_PARED);
      if (alto >= minimo)
        return meter(
          alto === m.alto
            ? m
            : {
                ...m,
                alto,
                ...(m.ancho === undefined ? {} : { ancho: (m.ancho * alto) / m.alto }),
              },
        );
    }
    rechazos.push({ caja: cajaDeSprite(modulos[0]), razon: 'puente' });
    return false;
  };
  const mata = (hoja: string, x: number, y: number, alto: number) =>
    poner(hoja, x, y, alto, azar(), 'cubierta', MARCADOR.cubierta as string, false);
  const altoDeMata = (s: Suelo) => CUBIERTA[s].alto * (MATA_MAS_BAJA + azar() * 0.6);

  /** La cresta de todos los macizos: dónde una cumbre y dónde un collado. */
  const ruidoDeCresta = ruidoSuave(semilla * 131 + 71, PASO_DEL_RUIDO);
  const esbeltos = new Map<string, readonly Modulo[]>();
  /** El material de cada casilla de cordillera: uno por macizo (`materialDeLosMacizos`). */
  const materialDeMacizo = materialDeLosMacizos(
    a.franjas.filter((f) => f.barrera === 'mountain').flatMap((f) => f.casillas),
    W,
    H,
    a.suelo,
  );
  /**
   * Un módulo de `hoja` por su silueta: con `cumbre` 0, de los más chatos
   * (ancho entre alto); con 1, de los más esbeltos, con algo de azar para que
   * no se repitan. El orden del catálogo es el de las imágenes y no dice nada
   * del tamaño: elegir por él (`t`) no elegía nada.
   *
   * Y que llegue a `alto` sin ampliarse más de `AMPLIACION_MAXIMA`: en el
   * volcán los más esbeltos son los más pequeños (130-175 px), y la cumbre se
   * quedaba con la imagen más pequeña estirada al alto mayor. Si el elegido no
   * llega, el más cercano en silueta que sí, primero hacia los menos esbeltos;
   * si ninguno, el más grande, y quien lo pone baja el alto a su tope.
   */
  const siluetaDe = (hoja: string, cumbre: number, alto: number): Modulo | undefined => {
    let ms = esbeltos.get(hoja);
    if (ms === undefined) {
      ms = [...(modulosDe(hoja) ?? [])].sort((p, q) => q.nw / q.nh - p.nw / p.nh);
      esbeltos.set(hoja, ms);
    }
    if (ms.length === 0) return undefined;
    const centro = Math.round(cumbre * (ms.length - 1));
    const k = Math.max(0, Math.min(ms.length - 1, centro + Math.round((azar() - 0.5) * 4)));
    for (let d = 0; d < ms.length; d++)
      for (const j of d === 0 ? [k] : [k - d, k + d]) {
        const m = ms[j];
        if (m !== undefined && altoMaximoDe(m) >= alto) return m;
      }
    return ms.reduce((p, q) => (q.nh > p.nh ? q : p));
  };
  /**
   * Cómo crece una masa: el bosque por la hondura de `analizar`, más alto hacia
   * dentro; la montaña por su macizo (`macizo.ts`), de la falda a las cumbres.
   * `modulo` da la hoja, el alto (por `factor`, el azar de cada uno) y el módulo.
   */
  const formaDeMasa = (
    f: Franja,
  ): {
    radio: (x: number, y: number) => number;
    altoMasBajo: (x: number, y: number) => number;
    modulo: (
      i: number,
      x: number,
      y: number,
      factor: number,
      delDardo: boolean,
    ) => { hoja: string; alto: number; t: number; nombre?: string; tono?: string };
  } => {
    if (f.barrera === 'forest') {
      const hondura = (x: number, y: number) => a.hondura[Math.floor(y) * W + Math.floor(x)] ?? 1;
      return {
        radio: (x, y) => BOSQUE.radio(hondura(x, y)),
        altoMasBajo: () => BOSQUE.alto(1) * 0.75,
        modulo: (i, _x, _y, factor, delDardo) => {
          const h = a.hondura[i] ?? 1;
          return {
            hoja: hojaDeMasa('forest', a.suelo[i] as Suelo, azar, h),
            alto: BOSQUE.alto(h) * factor,
            t: delDardo ? Math.min(1, (h - 1) / 3) * 0.7 + azar() * 0.3 : azar() * 0.5,
          };
        },
      };
    }
    const macizo = macizoDe(f.casillas, W, H, ruidoDeCresta);
    // De la franja y no de la casilla del pico: un pico que desborda la franja
    // cae en una casilla de fuera, que no es de ningún macizo.
    const material = materialDeMacizo.get(f.casillas[0] as number);
    if (material === undefined) throw new Error(`la franja ${f.id} de cordillera no tiene macizo`);
    return {
      radio: (x, y) => radioDePico(macizo.alto(x, y)),
      altoMasBajo: (x, y) => macizo.alto(x, y) * 0.75,
      modulo: (_i, x, y, factor) => {
        const cumbre = macizo.cumbre(x, y);
        const hoja = hojaDePico(material, azar, cumbre);
        const alto = macizo.alto(x, y) * factor;
        const m = siluetaDe(hoja, cumbre, alto);
        const luz = luzDeCumbre(cumbre);
        const tono = [tonoDe(hoja), luz].filter((t) => t !== undefined).join(' ');
        return {
          hoja,
          // Sin módulo (la hoja aún no está hecha) va el marcador, que no se amplía.
          alto: m === undefined ? alto : Math.min(alto, altoMaximoDe(m)),
          t: cumbre,
          ...(m === undefined ? {} : { nombre: m.nombre }),
          ...(luz === undefined ? {} : { tono }),
        };
      },
    };
  };

  // 3 · Las formaciones, franja a franja.
  let murallasPartidas = 0;
  let sinFormacion = 0;
  const cubiertas = new Uint8Array(W * H);
  for (const f of a.franjas) {
    const puestos = vestirFranja(f);
    for (const i of f.casillas) if (puestos.has(i)) cubiertas[i] = 1;
  }
  // Lo que cae bajo la huella de una ciudad, un pueblo o un nodo lo tapa el propio objeto.
  for (const o of a.objetos) {
    const r =
      o.kind === 'town' || o.kind === 'village' || o.kind === 'node' ? RADIO_DE_OBJETO[o.kind] : 0;
    if (r === undefined || r === 0) continue;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = o.at.x + dx;
        const y = o.at.y + dy;
        if (x >= 0 && y >= 0 && x < W && y < H && Math.hypot(dx, dy) < r) cubiertas[y * W + x] = 1;
      }
  }
  for (const f of a.franjas)
    for (const i of f.casillas)
      if (!cubiertas[i]) {
        sinFormacion++;
      }

  function vestirFranja(f: Franja): Set<number> {
    const dentro = new Set(f.casillas);
    const puestos = new Set<number>();
    const caja = cajaDe(f.casillas, W);
    const casillaDe = (x: number, y: number) => Math.floor(y) * W + Math.floor(x);
    const marcar = (x: number, y: number) => puestos.add(casillaDe(x, y));

    if (f.barrera === 'forest' || f.barrera === 'mountain') {
      // Masa: puntos densos, desbordando un poco la franja para que el borde no sea recto.
      const forma = formaDeMasa(f);
      const puntos = esparcir(
        [caja[0] - 0.2, caja[1] - 0.2, caja[2] + 0.2, caja[3] + 0.35],
        forma.radio,
        (x, y) => {
          const i = casillaDe(
            Math.min(Math.max(x, 0), W - 0.01),
            Math.min(Math.max(y, 0), H - 0.01),
          );
          // Un poco fuera, solo si la casilla de al lado es de la franja.
          const cx = Math.round(x - 0.5);
          const cy = Math.round(y - 0.5);
          return (
            (dentro.has(i) ||
              (dentro.has(cy * W + cx) && Math.hypot(x - (cx + 0.5), y - (cy + 0.5)) < 0.75)) &&
            entraria('masa', x, y, forma.altoMasBajo(x, y))
          );
        },
        azar,
      );
      for (const p of puntos) {
        const i = casillaDe(
          Math.min(Math.max(p.x, 0), W - 0.01),
          Math.min(Math.max(p.y, 0), H - 0.01),
        );
        // Un pico al sur de un paso lo taparía entero: `poner` lo encoge hasta
        // que su rectángulo sale del pasillo.
        const m = forma.modulo(i, p.x, p.y, 0.85 + azar() * 0.3, true);
        if (
          poner(
            m.hoja,
            p.x,
            p.y,
            m.alto,
            m.t,
            'masa',
            MARCADOR[f.barrera] as string,
            true,
            m.nombre,
            undefined,
            m.tono,
          )
        )
          marcar(p.x, p.y);
      }
      // La casilla en la que no cayó ningún dardo se rellena: si no, una casilla
      // que bloquea se leería como un claro que se pisa. Se prueba cerca del
      // centro y, si ahí no entra, por el resto de la casilla, de más cerca a más
      // lejos: una casilla suelta con caminos por tres lados queda mordida en
      // las esquinas por los tramos en diagonal.
      for (const i of f.casillas) {
        if (puestos.has(i)) continue;
        const cx = i % W;
        const cy = Math.floor(i / W);
        const m = forma.modulo(i, cx + 0.5, cy + 0.65, 0.75 + azar() * 0.25, false);
        const sitios = [
          [cx + 0.3 + azar() * 0.4, cy + 0.45 + azar() * 0.4] as const,
          ...SITIOS_DE_RELLENO.map(([dx, dy]) => [cx + dx, cy + dy] as const),
        ];
        for (const [x, y] of sitios)
          if (
            entraria('masa', x, y, m.alto) &&
            poner(
              m.hoja,
              x,
              y,
              m.alto,
              m.t,
              'masa',
              MARCADOR[f.barrera] as string,
              true,
              m.nombre,
              undefined,
              m.tono,
            )
          ) {
            marcar(x, y);
            break;
          }
      }
    } else if (f.barrera === 'wall') {
      // Una sola línea por franja, con torres en las juntas y cada pocos pasos.
      const hoja = f.uso === 'obstaculo' ? 'ruina' : 'muro';
      const e = esqueleto(f.casillas.map((i) => [i % W, Math.floor(i / W)] as const));
      if (componentesDePasos(e.casillas, e.pasos) > 1) murallasPartidas++;
      for (const p of e.pasos) {
        const mx = (p.a[0] + p.b[0]) / 2 + 0.5;
        const my = (p.a[1] + p.b[1]) / 2 + 0.5;
        if (!entraria('muro', mx, my + 0.25, 1.05)) continue;
        poner(
          hoja,
          mx,
          my + 0.25,
          1.05,
          0.5,
          'muro',
          MARCADOR.wall as string,
          true,
          ejeDe(p),
          ANCHO_DE_TRAMO[ejeDe(p)],
        );
      }
      const juntas = new Set(e.juntas.map(([x, y]) => `${x},${y}`));
      let n = 0;
      for (const [x, y] of e.casillas) {
        n++;
        if ((juntas.has(`${x},${y}`) || n % 3 === 0) && entraria('muro', x + 0.5, y + 0.75, 1.4)) {
          const torre = (x + y) % 2 === 0 ? 'torre-redonda' : 'torre-cuadrada';
          poner(hoja, x + 0.5, y + 0.75, 1.4, 0.5, 'muro', MARCADOR.wall as string, true, torre);
        }
      }
      for (const i of f.casillas) puestos.add(i);
      // El resto de la franja: escombro y matas al pie de la muralla.
      rellenoDeRocas(f, dentro, 0.34, 0.32, 0.25);
    } else if (f.barrera === 'cliff') {
      // El acantilado es relieve: la cara la pinta el pintor. Arriba, roca y peñascos.
      // Una mesa (mancha) lleva cubierta encima; la franja de frontera, algo más de roca.
      rellenoDeRocas(f, dentro, 0.34, 0.6, f.uso === 'obstaculo' ? 0.1 : 0.3);
      for (const i of f.casillas) puestos.add(i);
    } else if (f.barrera === 'water') {
      // El agua la pinta el pintor como superficie; aquí, la orilla.
      for (const i of f.casillas) puestos.add(i);
      const puntos = esparcir(
        [caja[0] - 0.3, caja[1] - 0.3, caja[2] + 0.3, caja[3] + 0.3],
        () => 0.28,
        (x, y) => {
          const cx = Math.floor(x);
          const cy = Math.floor(y);
          // En la raya entre agua y tierra, a ambos lados.
          const enAgua = dentro.has(cy * W + cx);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            if (dentro.has(ny * W + nx) !== enAgua) {
              const borde = dx !== 0 ? (dx > 0 ? cx + 1 : cx) : dy > 0 ? cy + 1 : cy;
              const d = dx !== 0 ? Math.abs(x - borde) : Math.abs(y - borde);
              if (d < 0.22) return entraria('orilla', x, y, 0.3);
            }
          }
          return false;
        },
        azar,
      );
      for (const p of puntos)
        poner('orilla', p.x, p.y, 0.3 + azar() * 0.12, azar(), 'orilla', '#5a5030', false);
    }
    return puestos;
  }

  /**
   * El suelo de una franja que no es masa (el pie de la muralla, lo alto de un
   * acantilado): sobre todo la cubierta de su suelo, y una parte `roca` de
   * peñascos y picos bajos de su material. Antes era todo escombro y la franja
   * se leía como un pedregal.
   */
  function rellenoDeRocas(
    f: Franja,
    dentro: Set<number>,
    radio: number,
    alto: number,
    roca: number,
  ): void {
    const caja = cajaDe(f.casillas, W);
    // El dardo pregunta por una mata, que es lo que sale casi siempre; la roca
    // se aparta con el mismo pasillo.
    const puntos = esparcir(
      caja,
      () => radio,
      (x, y) => {
        const i = Math.floor(y) * W + Math.floor(x);
        return (
          dentro.has(i) &&
          entraria('cubierta', x, y, CUBIERTA[a.suelo[i] as Suelo].alto * MATA_MAS_BAJA)
        );
      },
      azar,
    );
    for (const p of puntos) {
      const i = Math.floor(p.y) * W + Math.floor(p.x);
      const s = a.suelo[i] as Suelo;
      const tirada = azar();
      if (tirada < roca * 0.5 && f.barrera === 'cliff')
        poner(
          hojaDeMasa('mountain', s, azar),
          p.x,
          p.y,
          alto * (0.9 + azar() * 0.6),
          azar() * 0.4,
          'roca',
          MARCADOR.cliff as string,
          true,
        );
      else if (tirada < roca)
        poner(
          'rocas-caidas',
          p.x,
          p.y,
          alto * 0.6 * (0.8 + azar() * 0.5),
          azar() * 0.6,
          'roca',
          MARCADOR.cliff as string,
          true,
          undefined,
          undefined,
          materialDeCara(CARA_DE_SUELO[s]).pedregal,
        );
      else mata(hojaDeCubierta(s, azar()), p.x, p.y, altoDeMata(s));
    }
  }

  /** La silueta de cada módulo que tapa una cara: la de las paredes, para lo que pintan encima. */
  const perfilDe = perfilesDelCatalogo(catalogo);
  // 4 · El relieve por celdas (R4): una pieza por pared, de junta a junta. Las
  // caídas al sur llevan las frontales de siempre, libres; las del este y el
  // oeste, su cadena de laderas; cada diagonal, su pieza; y donde una senda
  // cruza una caída hacia la cámara o de lado, la bajada encima (R5). Ninguna
  // pared se aparta de la senda: lo que baja lo pinta la bajada. Donde falta el
  // arte de un material o una caída va un marcador visible, no el sistema viejo.
  const azarDeLaderas = azarDe(semilla * 6007 + 11);
  const azarDelRelieve = azarDe(semilla * 4801 + 3);
  /** Las paredes E y O con ladera puesta, como `vx,vy,lado` de su celda. */
  const conLadera = new Set<string>();
  const celdaDeLadera = (l: Ladera, fila: number) =>
    `${l.lado === 'este' ? l.x + 1 : l.x},${fila + 0.5},${l.lado}`;
  const juegos = new Map<string, JuegoDeLadera | null>();
  /** El juego de una hoja de laderas, o null sin su arte. */
  const juegoDe = (hoja: string): JuegoDeLadera | null => {
    let j = juegos.get(hoja);
    if (j === undefined) {
      const ms = modulosDe(hoja);
      j = ms === null || ms.length === 0 ? null : juegoDeLadera(hoja, ms);
      juegos.set(hoja, j);
    }
    return j;
  };
  /** El sprite del módulo `m` desde la fila `y` de `l` (`colocarLadera`). */
  const spriteDeLadera = (m: ModuloDeLadera, hoja: string, l: Ladera, y: number): Sprite => {
    const tono = tonoDe(hoja);
    const sitio = colocarLadera(m, l, y);
    return {
      ...(tono === undefined ? {} : { tono }),
      src: m.src,
      nw: m.nw,
      nh: m.nh,
      ax: m.ax,
      ay: m.ay,
      x: sitio.x,
      y: sitio.y,
      alto: sitio.alto,
      clase: 'pared',
      color: '#4c463e',
      capa: 0,
      sombra: true,
    };
  };
  for (const l of rel.laderas) {
    const hoja = hojaDeLadera(l);
    const juego = juegoDe(hoja);
    if (juego === null) {
      // Sin el arte, una marca por fila, del filo al pie.
      for (let y = l.y0; y <= l.y1; y++) {
        const largo = 1 + l.caida * ALTO_DE_NIVEL;
        const s = deHoja(hoja, bordeDeLadera(l), y + largo, largo, 0, 'pared', '#4c463e', true);
        if (
          ponerPared([s], s.alto, [
            [s.x, s.y],
            [s.x, y + 0.5],
          ])
        )
          conLadera.add(celdaDeLadera(l, y));
      }
      continue;
    }
    // Ni se corre ni se encoge: rompería la cadena. Si cae en la reserva de un
    // objeto o taparía un puente, no va.
    const ponerUna = (m: ModuloDeLadera, y: number): boolean => {
      const s = spriteDeLadera(m, hoja, l, y);
      if (
        !ponerPared([s], s.alto, [
          [s.x, s.y],
          [s.x, y + m.ladera.largo / 2],
        ])
      )
        return false;
      for (let k = 0; k < m.ladera.largo; k++) conLadera.add(celdaDeLadera(l, y + k));
      return true;
    };
    // Lo que no entra se prueba fila a fila con los módulos de una, más
    // estrechos que un largo; si nada entra, quedan los peñascos del canto.
    for (const p of piezasDeLadera(l, l, juego, azarDeLaderas)) {
      if (ponerUna(p.modulo, p.y)) continue;
      for (let y = p.y; y < p.y + p.modulo.ladera.largo; y++)
        for (const m of juego.medios) if (m !== p.modulo && ponerUna(m, y)) break;
    }
  }

  // Las diagonales: una pieza por celda, por sus dos filos (`colocarDiagonal`).
  for (const c of rel.diagonales) {
    const hoja = hojaDeDiagonal(c);
    const papel = c.tipo.endsWith('convexa') ? 'convexa' : 'concava';
    const ms = (modulosDe(hoja) ?? []).filter(
      (m): m is ModuloDeDiagonal => m.diagonal?.papel === papel,
    );
    const m = ms[Math.floor(azarDelRelieve() * ms.length)];
    if (m === undefined) faltan.add(hoja);
    const s = m === undefined ? marcadorDeDiagonal(c) : spriteDeDiagonal(m, hoja, c);
    ponerPared([s], s.alto, puntosDeCelda(c));
  }

  /**
   * El pedregal de cada cara, por su índice en `sprites`: los peñascos (donde
   * no entró una pared) y las rocas de su pie. Su tono se decide con todo puesto
   * (`tonoDelPedregalSuelto`).
   */
  const pedregalDeCara: number[] = [];
  /**
   * Peñascos de `rocas-caidas` de `desde` hacia `filo`, cada uno en la `x` que
   * se le pida a su altura, entonados con `tono`, fuera de toda senda y por la
   * puerta de la pared:
   * donde una frontal no cupo (la reserva de un objeto), y en el canto de un
   * barranco o de una ladera que no entró.
   */
  const peñascos = (desde: number, filo: number, xEn: (y: number) => number, tono: string) => {
    for (let y = desde + 0.05; y > filo + 0.15; y -= 0.26 + azar() * 0.12) {
      const deLaHoja = deHoja(
        'rocas-caidas',
        xEn(y),
        y,
        0.3 + azar() * 0.18,
        azar() * 0.6,
        'pared',
        '#5a5248',
        true,
      );
      const roca = deLaHoja.src === null ? deLaHoja : { ...deLaHoja, tono };
      // Como pedregal que es, apartado de toda senda con el margen de su pared,
      // no solo de la que baja: 4 pisaban una senda al pie (#150, N3).
      const libre = pasillo.altoLibre(roca, SEMIANCHO_DE_PARED);
      if (libre < ENCOGER_HASTA * roca.alto) continue;
      if (
        ponerPared(
          yElMasEstrecho(libre === roca.alto ? roca : { ...roca, alto: libre }, 'rocas-caidas'),
          ENCOGER_HASTA * roca.alto,
          [[roca.x, y]],
        ) &&
        roca.src !== null
      )
        pedregalDeCara.push(sprites.length - 1);
    }
  };
  // Las caídas al sur: las frontales de siempre, de junta a junta. Sus módulos
  // miden de 1 a 2 casillas de ancho; ninguno se sale de su tramo más de
  // `SALE_DE_SU_TRAMO`, que en un extremo está la diagonal que dobla la esquina.
  for (const c of rel.caras) {
    const { pared: hoja, pedregal: tonoDelPedregal } = materialDeCara(c.material);
    const filo = c.y + 1;
    const pie = filo + c.caida * ALTO_DE_NIVEL;
    const desde = c.x0;
    const hasta = c.x1 + 1;
    // Lo más bajo que se deja una pared: lo que mide la cara. Más baja, la cara
    // asomaría lisa por encima.
    const minimo = c.caida * ALTO_DE_NIVEL;
    const pared = (x: number, nombre?: string) =>
      deHoja(
        hoja,
        x + (azar() - 0.5) * 0.1,
        pie + 0.05 + (azar() - 0.5) * 0.12,
        c.caida * ALTO_DE_NIVEL + 0.35 + azar() * 0.2,
        azar(),
        'pared',
        '#4c463e',
        true,
        nombre,
      );
    /**
     * `s` dentro de su tramo: corrido hacia dentro; si no cabe, el módulo más
     * estrecho, y si tampoco, encogido sin bajar de `minimo`. En un tramo de una
     * casilla de caída 3 ni así cabe: va el más estrecho al mínimo, en el medio,
     * y lo que sobresale lo tapa la diagonal de al lado, que se pinta después.
     */
    const dentroDelTramo = (s: Sprite): Sprite => {
      const lo = desde - SALE_DE_SU_TRAMO;
      const hi = hasta + SALE_DE_SU_TRAMO;
      const modulos = yElMasEstrecho(s, hoja);
      for (const m of modulos) {
        const [x0, , x1] = cajaDeSprite(m);
        if (x1 - x0 > hi - lo) continue;
        const dx = x0 < lo ? lo - x0 : x1 > hi ? hi - x1 : 0;
        return dx === 0 ? m : { ...m, x: m.x + dx };
      }
      const e = modulos.at(-1) as Sprite;
      const alto = Math.max(minimo, Math.min(e.alto, ((hi - lo) * e.nh) / e.nw));
      const [x0, , x1] = cajaDeSprite(e, alto);
      return { ...e, alto, x: e.x + (lo + hi) / 2 - (x0 + x1) / 2 };
    };
    // Cada frontal, a un paso de la anterior, pero nunca más allá de lo que esa
    // cubrió: un módulo estrecho (los de nieve miden 0,65 de ancho por alto)
    // dejaba media celda sin pared. Al final, otra si el tramo no llegó a su junta.
    let cubierto = desde;
    let x = desde + 0.25;
    const ultima = hasta - 0.25 + 1e-9;
    while (x <= ultima || cubierto < hasta - 0.1) {
      const aqui = Math.min(x, hasta - 0.25);
      const s = dentroDelTramo(pared(aqui));
      if (
        ponerPared([s], minimo, [
          [s.x, s.y],
          [s.x, filo],
        ])
      )
        cubierto = Math.max(cubierto, cajaDeSprite(sprites.at(-1) as Sprite)[2]);
      else {
        cubierto = Math.max(cubierto, aqui + 0.3);
        // Donde no cabe ninguna pared, junto a un objeto, un pedregal por la cara:
        // sin él quedaba una losa lisa. Cada peñasco mira la reserva en su propio pie.
        if (!reservas.tomada(aqui, pie))
          peñascos(
            pie,
            filo,
            () => Math.min(hasta - 0.05, Math.max(desde + 0.05, aqui + (azar() - 0.5) * 0.3)),
            tonoDelPedregal,
          );
      }
      if (aqui >= hasta - 0.25) break;
      x = Math.min(x + 0.42 + azar() * 0.22, cubierto + 0.2);
    }
    for (let x = desde; x <= hasta - 0.01; x += 0.35 + azar() * 0.3) {
      const px = x + azar() * 0.2;
      const py = pie + 0.1 + azar() * 0.2;
      if (!entraria('roca', px, py, 0.28)) continue;
      const antes = sprites.length;
      poner(
        'rocas-caidas',
        px,
        py,
        0.28 + azar() * 0.25,
        azar() * 0.7,
        'roca',
        '#5a5248',
        true,
        undefined,
        undefined,
        tonoDelPedregal,
      );
      for (let i = antes; i < sprites.length; i++) pedregalDeCara.push(i);
    }
  }

  // Las bajadas (R5): encima de la pared, en el rumbo de la senda.
  for (const b of bajadas) {
    const hoja = hojaDeBajada(b);
    const m = (modulosDe(hoja) ?? []).find((k): k is ModuloDeBajada => k.bajada?.rumbo === b.rumbo);
    if (m === undefined) faltan.add(hoja);
    // Después de toda pared que pinta sobre su camino: la que cruza y la de la
    // fila de delante por la que baja (una bajada al sureste pasa por el talud
    // de la ladera de debajo). Con la clave del pie, esa ladera la tapaba.
    const camino = caminoDeBajada(b);
    let clave = claveDeBajada(b, rel.vistas);
    for (const p of sprites)
      if (
        p.clase === 'pared' &&
        p.y >= clave &&
        camino.some(([x, y]) => tapaElPunto(p, perfilDe, x, y))
      )
        clave = p.y + 0.01;
    const pieza = (k: number) =>
      m === undefined ? marcadorDeBajada(b, k) : spriteDeBajada(m, hoja, b, k);
    // Y antes de lo horneado de un nodo con el que se solapa: la bajada que
    // llega a una ciudad por su puerta pintaba su camino sobre la muralla (s9,
    // el lote de §23; con marcador no se veía). El nodo tapa el final de la rampa.
    let s = pieza(clave);
    for (const n of sprites)
      if (esNodoHorneado(n) && n.y < s.y && llegaA(b, n) && seSolapan(s, n, perfilDe))
        s = pieza(n.y - 0.01);
    // La bajada es el camino: no la para la reserva del objeto al que lleva, ni
    // cuenta como base sobre ella (`meter`), que su pie es la senda que llega.
    sprites.push(s);
  }

  // Las caídas al este y al oeste sin ladera (un barranco de una casilla, o la
  // reserva de un objeto): el canto lo oscurece el pintor; aquí, peñascos.
  const sinLadera = [
    ...rel.barrancos.map((c) => ({ x: c.vx, y: c.vy, este: c.tipo === 'E', material: c.material })),
    ...rel.laderas.flatMap((l) =>
      Array.from({ length: l.y1 - l.y0 + 1 }, (_, k) => l.y0 + k)
        .filter((y) => !conLadera.has(celdaDeLadera(l, y)))
        .map((y) => ({
          x: bordeDeLadera(l),
          y: y + 0.5,
          este: l.lado === 'este',
          material: l.material,
        })),
    ),
  ];
  for (const c of sinLadera)
    for (let k = 0; k < 2; k++) {
      const px = c.x + (c.este ? 0.05 : -0.05);
      const py = c.y - 0.2 + k * 0.45 + azar() * 0.2;
      if (!entraria('roca', px, py, 0.35)) continue;
      poner(
        'rocas-caidas',
        px,
        py,
        0.35 + azar() * 0.2,
        azar() * 0.8,
        'roca',
        '#5a5248',
        true,
        undefined,
        undefined,
        materialDeCara(c.material).pedregal,
      );
    }

  // La espalda de un acantilado más alto que lo de su norte: la cámara no la ve
  // y el pintor no pinta el reborde, así que desde ese lado la barrera era un
  // llano más (auditoría 2 de 07-10, B). Una hilera de peñascos por el canto de
  // arriba la cierra; el que no entra se prueba más bajo, y si tampoco, se
  // queda fuera (una senda o una reserva al lado).
  const rebordes = rebordesDe(nivel, W, H);
  for (const [x, y] of rebordes) {
    if (a.terreno[y * W + x] !== 'cliff') continue;
    const tono = materialDeCara(CARA_DE_SUELO[a.suelo[y * W + x] as Suelo]).pedregal;
    for (let k = 0; k < 3; k++) {
      const px = x + 0.18 + k * 0.32 + (azar() - 0.5) * 0.12;
      const py = y + 0.18 + azar() * 0.24;
      const queria = 0.4 + azar() * 0.2;
      const alto = [queria, queria * 0.6].find((h) => entraria('roca', px, py, h));
      if (alto === undefined) continue;
      poner(
        'rocas-caidas',
        px,
        py,
        alto,
        azar() * 0.8,
        'roca',
        '#5a5248',
        true,
        undefined,
        undefined,
        tono,
      );
    }
  }

  // 5 · La cubierta, en manchas y no en motas: la referencia tiene formas
  // grandes y calmadas (un bosquecillo, una hoja de campos, un claro de prado),
  // y una cubierta igual de densa en todas partes hacía vibrar el mapa entero.
  // Un ruido suave decide dónde hay mancha (densa, con arbolillos o campos) y
  // dónde claro (pocas matas sobre la textura).
  const ruido = ruidoSuave(semilla, 3.2);
  const cercaDePueblo = new Uint8Array(W * H);
  for (const o of a.objetos) {
    if (o.kind !== 'town' && o.kind !== 'village') continue;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = o.at.x + dx;
        const y = o.at.y + dy;
        if (x >= 0 && y >= 0 && x < W && y < H && dx * dx + dy * dy <= 10)
          cercaDePueblo[y * W + x] = 1;
      }
  }
  // Junto a un bosque de frontera el bosque sigue, más claro, sobre el suelo que
  // se pisa: así la masa ocupa la región como en la referencia y no es una tira.
  const lindeDeBosque = new Uint8Array(W * H);
  for (const f of a.franjas) {
    if (f.barrera !== 'forest') continue;
    for (const k of f.casillas) {
      const fx = k % W;
      const fy = (k - fx) / W;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const x = fx + dx;
          const y = fy + dy;
          if (x >= 0 && y >= 0 && x < W && y < H && dx * dx + dy * dy <= 5)
            lindeDeBosque[y * W + x] = 1;
        }
    }
  }
  const enMancha = (x: number, y: number) => {
    const i = Math.floor(y) * W + Math.floor(x);
    return cercaDePueblo[i] === 1 || lindeDeBosque[i] === 1 || ruido(x, y) > 0.56;
  };
  const pisable = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const i = Math.floor(y) * W + Math.floor(x);
    return (
      a.franjaDe[i] === -1 &&
      entraria('cubierta', x, y, CUBIERTA[a.suelo[i] as Suelo].alto * MATA_MAS_BAJA)
    );
  };
  const puntos = esparcir(
    [0, 0, W, H],
    (x, y) => {
      const r = CUBIERTA[a.suelo[Math.floor(y) * W + Math.floor(x)] as Suelo]?.radio ?? 0.35;
      // Fuera de la mancha, el prado se deja en claro; lo demás sigue sembrado.
      const s = a.suelo[Math.floor(y) * W + Math.floor(x)];
      const claro = s === 'grass' ? 2.1 : s === 'lava' ? 1.8 : s === 'rough' ? 1.6 : 1.3;
      return enMancha(x, y) ? r * 0.85 : r * claro;
    },
    pisable,
    azar,
    30,
  );
  for (const p of puntos) {
    const i = Math.floor(p.y) * W + Math.floor(p.x);
    const s = a.suelo[i] as Suelo;
    const mancha = enMancha(p.x, p.y);
    // En la mancha de prado, ciénaga o nieve, arbolillos: así salen los bosquecillos.
    const arbol =
      mancha &&
      cercaDePueblo[i] !== 1 &&
      // Un árbol justo al sur de un objeto lo taparía: ahí, solo mata baja. Del
      // camino se aparta solo, en `poner`.
      !reservas.tomada(p.x, p.y - 0.45) &&
      !reservas.tomada(p.x, p.y - 0.8) &&
      azar() < (lindeDeBosque[i] === 1 ? 0.75 : 0.55)
        ? (
            {
              grass: azar() < 0.55 ? 'pinos' : 'frondosos',
              swamp: 'muertos',
              snow: 'abetos-nevados',
              rough: 'pinos',
              ...(lindeDeBosque[i] === 1 ? { dirt: azar() < 0.6 ? 'pinos' : 'frondosos' } : {}),
            } as Partial<Record<Suelo, string>>
          )[s]
        : undefined;
    if (arbol !== undefined) {
      poner(
        arbol,
        p.x,
        p.y,
        0.55 + azar() * 0.35,
        azar() * 0.5,
        'cubierta',
        MARCADOR.forest as string,
        true,
      );
      continue;
    }
    mata(hojaDeCubierta(s, azar()), p.x, p.y, altoDeMata(s));
  }

  // 6 · Nubes en el borde del mapa, como en la referencia.
  for (let k = 0; k < (2 * (W + H)) / 3; k++) {
    const lado = k % 4;
    const t = azar();
    const [x, y] =
      lado === 0
        ? [t * W, -0.3]
        : lado === 1
          ? [W + 0.3, t * H]
          : lado === 2
            ? [t * W, H + 1.2]
            : [-0.3, t * H];
    sprites.push(deHoja('nubes', x, y, 2.2 + azar() * 1.6, azar(), 'nube', '#b8b8b8', false));
  }

  for (const i of pedregalDeCara) {
    const s = sprites[i] as Sprite;
    // El del pie de una cara del borde de abajo cae fuera: el suelo de la última fila.
    const tono = tonoDelPedregalSuelto(
      s,
      sprites,
      (x, y) =>
        a.suelo[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))] as Suelo,
    );
    if (tono !== undefined && tono !== s.tono) sprites[i] = { ...s, tono };
  }
  // La cara se pinta solo bajo la silueta de su pared, con todo puesto (#159).
  const carasDeEscena = rel.caras.map(
    (c): CaraDeEscena => ({ ...c, pintada: pintadaDeCara(c, sprites, perfilDe) }),
  );
  sprites.sort((p, q) => p.capa - q.capa || p.y - q.y || p.x - q.x);
  /** Qué sprite es una ladera: cualquier módulo de laderas del catálogo, no solo los que se usaron. */
  const deLadera = modulosDeLadera(catalogo);
  const agua = a.franjas.filter((f) => f.barrera === 'water').flatMap((f) => f.casillas);
  const enElAgua = new Set(agua);
  const esAgua = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < W && y < H && enElAgua.has(y * W + x);
  const vados = vadosDeLosEstribos(trazos, puentes, esAgua);
  return {
    semilla,
    W,
    H,
    suelo: a.suelo,
    nivel: Array.from(nivel),
    agua,
    relieve: {
      caras: carasDeEscena,
      cantos: cantosDe(nivel, W, H),
      rebordes,
      celdas: rel.vistas,
      bajadas,
    },
    altoDeNivel: ALTO_DE_NIVEL,
    caminos,
    sendas: trazos,
    puentes,
    vados,
    luces: luces(a, nivel, azarDe(semilla * 31 + 5)),
    sprites,
    informe: {
      murallasPartidas,
      basesSobreReserva,
      casillasDeBarreraSinFormacion: sinFormacion,
      spritesSobreSenda: sobreLaSenda(sprites, pasillo).length,
      // Recontadas desde lo puesto, con cualquier módulo del catálogo y no solo
      // los de las hojas que se usaron.
      celdasMalCubiertas: celdasMalCubiertas(sprites, rel, catalogo, (c) =>
        vaciaPorque(c, reservas, rechazos),
      ).length,
      bajadasSinPieza: bajadasSinPieza(sprites, bajadas, catalogo).length,
      bajadasTapadas: bajadasTapadas(sprites, bajadas, catalogo).length,
      bajadasSobreNodo: bajadasSobreNodo(sprites, bajadas, catalogo).length,
      laderasEnfrentadas: laderasEnfrentadas(sprites, deLadera).length,
      carasLisas: carasLisas(carasDeEscena, sprites, perfilDe).length,
      puentesTapados: puentesTapados(sprites, puentes).length,
      pasosTapados: pasosTapados(sprites, pasos).length,
      sendasDeEstriboEnAgua: sendasDeEstriboEnAgua(trazos, puentes, vados, esAgua).length,
      acantiladosARas: acantiladosARas(a.terreno, nivel, W, H).length,
      modulosQueFaltan: [...faltan].sort(),
    },
  };
}

/**
 * Los sprites de una clase que se aparta del camino cuyo rectángulo pisa su
 * pasillo. Lo cuenta el informe y lo recuenta el test por su cuenta.
 */
export function sobreLaSenda(sprites: readonly Sprite[], pasillo: Pasillo): Sprite[] {
  return sprites.filter((s) => {
    const r = APARTE[s.clase];
    return r !== null && s.capa === 0 && pasillo.pisa(cajaDeSprite(s), r.semiancho);
  });
}

/**
 * El tablero de un puente como lo mira lo que se apoya cerca: su pasillo y el
 * pie de su sprite (`x`, `y`: el centro del tablero), que es su sitio en el
 * orden del pintor.
 */
export interface TableroAlPaso {
  readonly x: number;
  readonly y: number;
  readonly pasillo: Pasillo;
}

/** La media anchura más grande con la que se pregunta a un tablero: la de lo que se aparta o la de la pared. */
const RADIO_DEL_TABLERO = Math.max(
  SEMIANCHO_DE_PARED,
  ...Object.values(APARTE).map((r) => r?.semiancho ?? 0),
);

export function tablerosAlPaso(
  puentes: readonly Pick<Puente, 'tablero' | 'centro'>[],
): TableroAlPaso[] {
  return puentes.map(({ centro: [x, y], tablero }) => ({
    x,
    y,
    pasillo: new Pasillo([tablero], RADIO_DEL_TABLERO),
  }));
}

/**
 * Si `s` se pinta después del puente `t` y, por tanto, lo taparía: es volumen y
 * va detrás de él en el orden del pintor (`esVolumen`, `ordenDeVolumenes`, los
 * de `separar`). Lo plano va al suelo, debajo del puente; lo de detrás lo tapa
 * el puente a él. Es la única regla de profundidad de los puentes: la usan el
 * pasillo de lo que se aparta, `ponerPared` (paredes, laderas y peñascos) y la
 * pregunta de `laderasMalCubiertas`.
 *
 * Apartando también lo de detrás, la cara de una isleta o de la orilla de al
 * lado se quedaba sin pared y se leía como un rectángulo de roca lisa.
 */
const vaDelante = (s: Pick<Sprite, 'x' | 'y' | 'clase' | 'alto'>, t: TableroAlPaso) =>
  esVolumen(s) && ordenDeVolumenes(s, t) > 0;

/**
 * El mayor alto, hasta el suyo, con el que `s` no tapa ningún tablero, con una
 * media anchura `r`: el de cada puente que tiene detrás (`vaDelante`).
 */
export function altoLibreAnteLosPuentes(
  s: Sprite,
  tableros: readonly TableroAlPaso[],
  r: number,
): number {
  let alto = s.alto;
  for (const t of tableros)
    if (vaDelante(s, t)) alto = Math.min(alto, t.pasillo.altoLibre({ ...s, alto }, r));
  return alto;
}

/** Si `s`, con el alto `alto`, taparía algún tablero con una media anchura `r`. */
export function tapaUnTablero(
  s: Pick<Sprite, 'x' | 'y' | 'nw' | 'nh' | 'ax' | 'ay' | 'alto' | 'clase'>,
  tableros: readonly TableroAlPaso[],
  r: number,
  alto = s.alto,
): boolean {
  return tableros.some((t) => vaDelante(s, t) && t.pasillo.pisa(cajaDeSprite(s, alto), r));
}

/**
 * La media anchura del eje de un nodo de paso que no pisa ningún volumen: la
 * del pasillo de las masas, para que el collado se lea como el hueco que abre
 * una senda en una cordillera (#173).
 */
export const SEMIANCHO_DEL_PASO = SEMIANCHO_DEL_PASILLO_DE_MASA;

/** El pasillo de los ejes de unos nodos de paso (`pasosALaVista`). */
export function pasilloDeLosPasosDe(pasos: readonly PasoALaVista[]): Pasillo {
  return new Pasillo(
    pasos.flatMap((p) => p.eje),
    SEMIANCHO_DEL_PASO,
  );
}

/**
 * Si `s`, con el alto `alto`, sería un volumen que pisa el eje de un paso. Lo
 * bajo no cuenta: va al suelo, debajo de todo, y no tapa el collado; quitarlo
 * también dejaba una franja recta y pelada donde no hay camino.
 */
export function tapaUnPaso(
  s: Pick<Sprite, 'x' | 'y' | 'nw' | 'nh' | 'ax' | 'ay' | 'alto' | 'clase'>,
  pasos: Pasillo,
  alto = s.alto,
): boolean {
  return (
    esVolumen({ clase: s.clase, alto }) && pasos.pisa(cajaDeSprite(s, alto), SEMIANCHO_DEL_PASO)
  );
}

/**
 * El mayor alto, hasta el suyo, con el que `s` no tapa el eje de ningún paso
 * (`tapaUnPaso`): la masa, que siempre es volumen, se encoge hasta salir; lo
 * demás puede quedarse en el umbral del volumen, como suelo.
 */
export function altoLibreAnteLosPasos(s: Sprite, pasos: Pasillo): number {
  if (!esVolumen(s)) return s.alto;
  const libre = pasos.altoLibre(s, SEMIANCHO_DEL_PASO);
  return esVolumen({ clase: s.clase, alto: 0 })
    ? libre
    : Math.max(libre, Math.min(s.alto, UMBRAL_DE_VOLUMEN));
}

/**
 * Los nodos de paso cuyo eje pisa el rectángulo de un volumen de una clase que
 * se aparta (`APARTE`), medido desde lo puesto y con un pasillo por nodo: no
 * pregunta a la puerta (`tapaUnPaso`), así que si se equivoca, esto lo ve. No
 * cuentan los muros y las paredes, que no se apartan de nada, ni lo horneado.
 */
export function pasosTapados(
  sprites: readonly Sprite[],
  pasos: readonly PasoALaVista[],
): PasoALaVista[] {
  const volumenes = sprites.filter((s) => APARTE[s.clase] !== null && s.capa === 0 && esVolumen(s));
  return pasos.filter((p) => {
    const eje = new Pasillo(p.eje, SEMIANCHO_DEL_PASO);
    return volumenes.some((s) => eje.pisa(cajaDeSprite(s), SEMIANCHO_DEL_PASO));
  });
}

/** Cada cuánto se mira el tablero, en casillas, para ver si algo lo tapa. */
const PASO_POR_EL_TABLERO = 0.05;

/**
 * Lo que tapa el tablero de algún puente, medido desde lo pintado y no desde la
 * puerta: cada volumen que `separar` pone después del sprite del puente (y se
 * pinta encima) cuyo rectángulo cubre algún punto de la línea de su tablero,
 * mirada cada `PASO_POR_EL_TABLERO`. No pregunta a `vaDelante` ni al pasillo:
 * si la regla de profundidad de la puerta se equivoca, esto lo ve (#157).
 *
 * Cuenta lo que esa puerta gobierna: lo que se aparta del camino (`APARTE`) y
 * la pared (paredes, laderas, peñascos y pedregal). No cuentan lo horneado (la
 * clase `objeto`) ni los muros de murallas y ruinas, que no se apartan de nada
 * y se colocan antes (`docs/historia.md`). Tampoco las caras de roca, que van
 * con el suelo, debajo de todos los volúmenes.
 */
export function puentesTapados(
  sprites: readonly Sprite[],
  puentes: readonly Pick<Puente, 'id' | 'tablero'>[],
): Sprite[] {
  const { volumenes } = separar({ sprites });
  const tapan = new Set<Sprite>();
  for (const pu of puentes) {
    const k = volumenes.findIndex((v) => v.s.objeto?.id === pu.id);
    if (k < 0) throw new Error(`el puente ${pu.id} no está entre los volúmenes de la escena`);
    const puntos = pu.tablero.slice(1).flatMap((q, i) => {
      const p = pu.tablero[i] as readonly [number, number];
      const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / PASO_POR_EL_TABLERO));
      return Array.from({ length: n + 1 }, (_, j): readonly [number, number] => [
        p[0] + ((q[0] - p[0]) * j) / n,
        p[1] + ((q[1] - p[1]) * j) / n,
      ]);
    });
    const xs = puntos.map(([x]) => x);
    const ys = puntos.map(([, y]) => y);
    const [tx0, ty0, tx1, ty1] = [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ];
    for (const { s } of volumenes.slice(k + 1)) {
      if (s.clase === 'objeto' || s.clase === 'muro') continue;
      const [x0, y0, x1, y1] = cajaDeSprite(s);
      if (x0 > tx1 || x1 < tx0 || y0 > ty1 || y1 < ty0) continue;
      if (puntos.some(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)) tapan.add(s);
    }
  }
  return [...tapan];
}

/**
 * Hasta dónde, en casillas a cada lado, mira el pedregal de una cara si tiene
 * pared al lado (`tonoDelPedregalSuelto`).
 */
const ALREDEDOR_DEL_PEDREGAL = 0.3;

/**
 * El tono del pedregal de una cara, según lo que tiene alrededor (#170): con
 * una pared de acantilado o de ladera al lado, el de la cara (el que trae);
 * suelto, el de su suelo, como las rocas que se esparcen por él. Donde la
 * pared no entró ya no se pinta la cara (`pintadaDeCara`), y el pedregal con
 * el tono del basalto (`brightness(0.5)`) se leía como una mancha negra en el
 * llano (s9, junto al castillo del sureste).
 */
export function tonoDelPedregalSuelto(
  s: Sprite,
  sprites: readonly Sprite[],
  sueloEn: (x: number, y: number) => Suelo,
): string | undefined {
  const conPared = sprites.some((p) => {
    if (p.clase !== 'pared' || p === s || p.src === null || /rocas-caidas/.test(p.src))
      return false;
    const [x0, y0, x1, y1] = cajaDeSprite(p);
    return (
      s.x >= x0 - ALREDEDOR_DEL_PEDREGAL &&
      s.x <= x1 + ALREDEDOR_DEL_PEDREGAL &&
      s.y >= y0 &&
      s.y <= y1 + ALREDEDOR_DEL_PEDREGAL
    );
  });
  if (conPared) return s.tono;
  return materialDeCara(CARA_DE_SUELO[sueloEn(Math.floor(s.x), Math.floor(s.y))]).pedregal;
}

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

// ------------------------------------------------------- el relieve por celdas

/**
 * Lo que una frontal puede salirse de su tramo de junta a junta, en casillas.
 * Un módulo mide de 1 a 2 casillas de ancho, y corrido más allá de su junta se
 * metía por encima de la diagonal que dobla la esquina: la escalera de #160.
 */
const SALE_DE_SU_TRAMO = 0.15;

/** El color del marcador de una diagonal y el de una bajada sin arte: se tienen que ver. */
export const COLOR_DE_DIAGONAL = '#d4479b';
export const COLOR_DE_BAJADA = '#3fb8d8';

/**
 * Hasta qué caída hay arte de diagonales y bajadas: la 3 y las mayores llevan
 * la pieza de 2 estirada en alto (decisión del usuario, 07-10-2026).
 */
export const caidaDeArte = (caida: number): 1 | 2 => (caida <= 1 ? 1 : 2);

/** Lo que se estira en alto una pieza de `caidaDeArte` puesta en una caída mayor. */
const estiramiento = (caida: number) => Math.max(1, caida / caidaDeArte(caida));

/**
 * Lo que se pinta una pieza del relieve por debajo del pie de su pared, en
 * casillas, como clave de profundidad: después de las frontales de su tramo,
 * que van a 0,05 ± 0,06 (`pared`), y así su junta queda encima.
 */
const DETRAS_DEL_PIE = 0.12;

/** La hoja de diagonales de una pared: `diagonales-<material>-<se|so>-<caída de arte>`. */
export function hojaDeDiagonal(c: Pick<Celda, 'tipo' | 'material' | 'caida'>): string {
  const lado = c.tipo.startsWith('SE') ? 'se' : 'so';
  return `diagonales-${materialDeCara(c.material).nombre}-${lado}-${caidaDeArte(c.caida)}`;
}

/** La hoja de bajadas de una bajada: `bajadas-<material>-<caída de arte>`. */
export function hojaDeBajada(b: Pick<Bajada, 'material' | 'caida'>): string {
  return `bajadas-${materialDeCara(b.material).nombre}-${caidaDeArte(b.caida)}`;
}

/** Los pies de las dos juntas de una pared, en el orden de `JUNTAS`. */
function piesDe(c: Celda): readonly [readonly [number, number], readonly [number, number]] {
  const [a, b] = JUNTAS[c.tipo];
  const [fa, fb] = filosDe(c);
  return [pieDeJunta(fa, a[2], c.caida), pieDeJunta(fb, b[2], c.caida)];
}

/** Lo que mide en casillas, en x y en y, un píxel de un módulo colocado: su escala. */
function escalaDe(s: Pick<Sprite, 'nw' | 'nh' | 'alto' | 'ancho'>): readonly [number, number] {
  const ky = s.alto / s.nh;
  return [s.ancho === undefined ? ky : s.ancho / s.nw, ky];
}

/** Un punto del módulo de `s`, en píxeles, llevado al mapa: lo inverso de colocarlo. */
function enElMapa(
  s: Pick<Sprite, 'x' | 'y' | 'ax' | 'ay' | 'nw' | 'nh' | 'alto' | 'ancho'>,
  [px, py]: readonly [number, number],
): readonly [number, number] {
  const [kx, ky] = escalaDe(s);
  return [s.x - (s.ax - px) * kx, s.y - (s.ay - py) * ky];
}

/**
 * Una pieza del relieve con dos puntos `m` del módulo sobre dos puntos `w` del
 * mapa, estirada en alto `estira` veces, y con su ancla bajada a `yClave` (su
 * clave de profundidad). La escala sale de la distancia entre los dos puntos.
 */
function sobreDosPuntos(
  modulo: Pick<Modulo, 'src' | 'nw' | 'nh' | 'ax'>,
  m: readonly [readonly [number, number], readonly [number, number]],
  w: readonly [readonly [number, number], readonly [number, number]],
  porCasilla: number,
  estira: number,
  yClave: number,
): Pick<Sprite, 'src' | 'nw' | 'nh' | 'ax' | 'ay' | 'x' | 'y' | 'alto' | 'ancho'> {
  const kx = 1 / porCasilla;
  const ky = kx * estira;
  const x = (w[0][0] + (modulo.ax - m[0][0]) * kx + w[1][0] + (modulo.ax - m[1][0]) * kx) / 2;
  // El ancla, en el píxel del módulo que cae en `yClave`.
  const ay = (m[0][1] + (yClave - w[0][1]) / ky + m[1][1] + (yClave - w[1][1]) / ky) / 2;
  return {
    src: modulo.src,
    nw: modulo.nw,
    nh: modulo.nh,
    ax: modulo.ax,
    ay,
    x,
    y: yClave,
    alto: modulo.nh * ky,
    ...(estira === 1 ? {} : { ancho: modulo.nw * kx }),
  };
}

/**
 * Dónde va el módulo `m` de diagonal en la pared `c`: sus dos filos sobre los
 * dos de la celda (`filosDe`), de los que sale la escala; en una caída mayor
 * que la de su arte, estirado en alto. Su clave, bajo el pie de su pared.
 *
 * Estirado, los dos filos no caen a la vez en su sitio: van a media casilla en
 * y, y la media casilla crece con el estirón. Van centrados (en caída 3, cada
 * uno a un octavo de casilla del suyo): mejor eso que una pieza de caída 2 con
 * el pie 0,6 casillas corto.
 */
export function spriteDeDiagonal(m: ModuloDeDiagonal, hoja: string, c: Celda): Sprite {
  const w = filosDe(c);
  const [ma, mb] = m.diagonal.filo;
  const porCasilla =
    Math.hypot(mb[0] - ma[0], mb[1] - ma[1]) / Math.hypot(w[1][0] - w[0][0], w[1][1] - w[0][1]);
  const [pa, pb] = piesDe(c);
  const tono = tonoDe(hoja);
  return {
    ...(tono === undefined ? {} : { tono }),
    ...sobreDosPuntos(
      m,
      [ma, mb],
      w,
      porCasilla,
      estiramiento(c.caida),
      Math.max(pa[1], pb[1]) + DETRAS_DEL_PIE,
    ),
    clase: 'pared',
    color: COLOR_DE_DIAGONAL,
    capa: 0,
    sombra: true,
  };
}

/** Dónde quedaron los dos filos de un módulo de diagonal ya colocado: lo inverso de `spriteDeDiagonal`. */
export function filosColocados(
  m: ModuloDeDiagonal,
  s: Pick<Sprite, 'x' | 'y' | 'ax' | 'ay' | 'nw' | 'nh' | 'alto' | 'ancho'>,
): readonly [readonly [number, number], readonly [number, number]] {
  return [enElMapa(s, m.diagonal.filo[0]), enElMapa(s, m.diagonal.filo[1])];
}

/** El marcador de una diagonal sin arte: en medio de sus filos, con la clave de su pieza. */
export function marcadorDeDiagonal(c: Celda): Sprite {
  const [fa, fb] = filosDe(c);
  const [pa, pb] = piesDe(c);
  return {
    src: null,
    nw: 1,
    nh: 1,
    ax: 0.5,
    ay: 1,
    x: (fa[0] + fb[0]) / 2,
    y: Math.max(pa[1], pb[1]) + DETRAS_DEL_PIE,
    alto: c.caida * ALTO_DE_NIVEL + 0.4,
    clase: 'pared',
    color: COLOR_DE_DIAGONAL,
    capa: 0,
    sombra: true,
  };
}

/**
 * Dónde va el módulo `m` de bajada: su `arriba` donde la senda cruza el filo y
 * su `abajo` en el pie de la pared bajo él (`abajoDe`). La escala sale de lo que
 * mide su guía entre los dos, a la caída de su arte; en una mayor, estirada en
 * alto. Su clave, bajo el pie: después de las frontales de su tramo.
 */
export function spriteDeBajada(m: ModuloDeBajada, hoja: string, b: Bajada, yClave: number): Sprite {
  const de = caidaDeArte(b.caida);
  const { arriba, abajo } = m.bajada;
  const porCasilla =
    Math.hypot(abajo[0] - arriba[0], abajo[1] - arriba[1]) /
    Math.hypot(taludDeBajadaDe(b.rumbo, de), de * ALTO_DE_NIVEL);
  const w = [b.arriba, abajoDe(b)] as const;
  const estira = estiramiento(b.caida);
  // Con los dos puntos se ancla por `arriba`: estirada, `abajo` no cae en su sitio en x.
  const s = sobreDosPuntos(m, [arriba, arriba], [w[0], w[0]], porCasilla, estira, yClave);
  const tono = tonoDe(hoja);
  return {
    ...(tono === undefined ? {} : { tono }),
    ...s,
    clase: 'pared',
    color: COLOR_DE_BAJADA,
    capa: 0,
    sombra: false,
  };
}

/** El marcador de una bajada sin arte: en el pie, con la clave de su pieza. */
export function marcadorDeBajada(b: Bajada, yClave: number): Sprite {
  const [x] = abajoDe(b);
  return {
    src: null,
    nw: 1,
    nh: 1,
    ax: 0.5,
    ay: 1,
    x,
    y: yClave,
    alto: b.caida * ALTO_DE_NIVEL + 0.35,
    clase: 'pared',
    color: COLOR_DE_BAJADA,
    capa: 0,
    sombra: false,
  };
}

/**
 * La clave de profundidad de una bajada: bajo el pie más bajo de las paredes que
 * cruza (las de las celdas que tocan su `arriba`) y bajo el suyo. Así se pinta
 * después de ellas: con la de su pie, la diagonal convexa que cruza, que tiene
 * el pie más abajo, la tapaba.
 */
export function claveDeBajada(b: Bajada, vistas: readonly Celda[]): number {
  let pie = abajoDe(b)[1];
  for (const c of vistas)
    if (Math.abs(b.arriba[0] - c.vx) <= 0.5 + 1e-9 && Math.abs(b.arriba[1] - c.vy) <= 0.5 + 1e-9)
      for (const [, y] of piesDe(c)) pie = Math.max(pie, y);
  return pie + DETRAS_DEL_PIE;
}

/** El camino de la rampa de una bajada (`rampaDe`), cada `PASO_POR_EL_TABLERO`. */
export function caminoDeBajada(b: Bajada): (readonly [number, number])[] {
  const [[ax, ay], [bx, by]] = rampaDe(b);
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / PASO_POR_EL_TABLERO));
  return Array.from(
    { length: n + 1 },
    (_, j) => [ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n] as const,
  );
}

/**
 * Si lo que pinta `s` cubre el punto `(x, y)`: bajo la silueta de su módulo
 * (`bajoLaSilueta`), o, sin arte, dentro del triángulo de su marcador.
 */
export function tapaElPunto(s: Sprite, perfilDe: PerfilDe, x: number, y: number): boolean {
  if (s.src === null) {
    const w = s.alto * 0.45;
    if (y > s.y || y < s.y - s.alto) return false;
    return Math.abs(x - s.x) <= (w * (y - (s.y - s.alto))) / s.alto;
  }
  return bajoLaSilueta(s, perfilDe(s), x, y, cajaDeSprite(s));
}

/** Si los tramos `a → b` y `c → d` se cortan. */
function seCortan(
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
  [cx, cy]: readonly [number, number],
  [dx, dy]: readonly [number, number],
): boolean {
  const lado = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  return (
    lado(ax, ay, bx, by, cx, cy) * lado(ax, ay, bx, by, dx, dy) <= 0 &&
    lado(cx, cy, dx, dy, ax, ay) * lado(cx, cy, dx, dy, bx, by) <= 0
  );
}

/**
 * Las paredes que cruza un puente, de estribo a estribo, como `claveDeCelda`:
 * no llevan pieza, que la tapa su estribo y bajo el tablero se ve el agua. Es lo
 * que antes abría un tajo en la cara (`cortes`).
 */
export function celdasBajoLosPuentes(
  cs: readonly Celda[],
  puentes: readonly Pick<Puente, 'extremos'>[],
): Set<string> {
  const fuera = new Set<string>();
  for (const c of cs) {
    if (!esVisto(c.tipo)) continue;
    const [fa, fb] = filosDe(c);
    for (const { extremos } of puentes)
      if (seCortan(fa, fb, extremos[0], extremos[1])) fuera.add(claveDeCelda(c));
  }
  return fuera;
}

/**
 * Por qué una pared vista puede quedar sin pieza, o null si no hay razón: la
 * reserva de un objeto en alguno de sus puntos (`puntosDeCelda`), o la caja de
 * una pared que la puerta no dejó entrar ahí, por una reserva o por un puente
 * que taparía (`rechazos`).
 */
export function vaciaPorque(
  c: Celda,
  reservas: { tomada(x: number, y: number): boolean },
  rechazos: readonly Rechazo[],
): string | null {
  const puntos = puntosDeCelda(c);
  if (puntos.some(([x, y]) => reservas.tomada(x, y))) return 'reserva';
  for (const { caja, razon } of rechazos)
    if (puntos.some(([x, y]) => x >= caja[0] && x <= caja[2] && y >= caja[1] && y <= caja[3]))
      return razon;
  return null;
}

/** Una pared que la puerta no dejó entrar: lo que ocupaba y por qué. */
export interface Rechazo {
  readonly caja: Caja;
  readonly razon: 'reserva' | 'puente';
}

/**
 * Los puntos de una pared que miran la reserva de un objeto: sus filos, sus
 * pies y, entre ellos, cada cuarto de casilla. Los mira la puerta de una
 * diagonal y, para toda pared, la razón de quedar vacía (`vaciaPorque`): una
 * frontal se para en la reserva de su pie o de su filo, que caen entre ellos.
 */
export function puntosDeCelda(c: Celda): (readonly [number, number])[] {
  const [fa, fb] = filosDe(c);
  const [pa, pb] = piesDe(c);
  const fuera: (readonly [number, number])[] = [];
  for (let k = 0; k <= 4; k++) {
    const t = k / 4;
    fuera.push(
      [fa[0] + (fb[0] - fa[0]) * t, fa[1] + (fb[1] - fa[1]) * t],
      [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t + 0.05],
    );
  }
  // Y por donde puede caer el ancla de su pieza: a su clave, bajo el pie, y a
  // los lados del medio de sus filos (el módulo no se ancla en el medio).
  const y = Math.max(pa[1], pb[1]) + DETRAS_DEL_PIE;
  const x = (fa[0] + fb[0]) / 2;
  for (const dx of [-0.3, -0.15, 0, 0.15, 0.3]) fuera.push([x + dx, y]);
  return fuera;
}

/** Lo que se tolera entre dónde quedó una junta y dónde debía, en casillas. */
const HOLGURA_DE_JUNTA = 0.02;

const cerca = (p: readonly [number, number], q: readonly [number, number]) =>
  Math.abs(p[0] - q[0]) <= HOLGURA_DE_JUNTA && Math.abs(p[1] - q[1]) <= HOLGURA_DE_JUNTA;

/** Cuánto va estirado en alto un sprite (`Sprite.ancho`): 1 si no lo va. */
const estiramientoDe = (s: Pick<Sprite, 'nw' | 'nh' | 'alto' | 'ancho'>) =>
  s.ancho === undefined ? 1 : s.alto / s.nh / (s.ancho / s.nw);

/**
 * Si los dos filos de una diagonal colocada caen en los de su celda. Sin
 * estirar, cada uno en el suyo. Estirada (`spriteDeDiagonal`), en x cada uno en
 * el suyo y en y centrados, separados lo que la celda por el estirón: es el
 * desvío declarado de la caída 3, y nada más. Con la holgura de los filos sueltos
 * el lote (07-10-2026) dio 257 «fuera de toda celda» en 1-40, todas de caída 3.
 */
function filosEnSuSitio(
  puestos: readonly [readonly [number, number], readonly [number, number]],
  suyos: readonly [readonly [number, number], readonly [number, number]],
  estira: number,
): boolean {
  if (estira === 1) return cerca(puestos[0], suyos[0]) && cerca(puestos[1], suyos[1]);
  const [a, b] = puestos;
  const [fa, fb] = suyos;
  return (
    Math.abs(a[0] - fa[0]) <= HOLGURA_DE_JUNTA &&
    Math.abs(b[0] - fb[0]) <= HOLGURA_DE_JUNTA &&
    Math.abs((a[1] + b[1]) / 2 - (fa[1] + fb[1]) / 2) <= HOLGURA_DE_JUNTA &&
    Math.abs(b[1] - a[1] - (fb[1] - fa[1]) * estira) <= HOLGURA_DE_JUNTA
  );
}

/** Los módulos de diagonales y de bajadas del catálogo por su `src`. */
function modulosDelRelieve(catalogo: Catalogo): {
  diagonales: Map<string, ModuloDeDiagonal>;
  bajadas: Map<string, ModuloDeBajada>;
} {
  const diagonales = new Map<string, ModuloDeDiagonal>();
  const bajadas = new Map<string, ModuloDeBajada>();
  for (const [hoja, ms] of Object.entries(catalogo.hojas))
    for (const m of ms) {
      if (esHojaDeDiagonal(hoja) && m.diagonal !== undefined)
        diagonales.set(m.src, m as ModuloDeDiagonal);
      if (esHojaDeBajada(hoja) && m.bajada !== undefined) bajadas.set(m.src, m as ModuloDeBajada);
    }
  return { diagonales, bajadas };
}

/**
 * Las paredes vistas mal cubiertas, cada una con lo que le pasa. Se reconstruye
 * desde lo puesto, por la geometría de cada sprite (dónde quedaron sus juntas),
 * no por lo que `componer` apuntó al ponerlo:
 *
 * - una caída al sur lleva al menos una frontal (`paredes-*`) apoyada en su pie
 *   que cubre el centro de su celda;
 * - una al este o al oeste, exactamente una ladera con su filo en el de la celda;
 * - una diagonal, exactamente una pieza con sus dos filos en los de la celda, o
 *   su marcador donde va;
 *
 * salvo las vacías por una razón declarada (`vacia`: la reserva de un objeto, un
 * puente) y los barrancos (`Caidas.barrancos`), que llevan peñascos.
 */
export function celdasMalCubiertas(
  sprites: readonly Sprite[],
  rel: Pick<Caidas, 'vistas' | 'barrancos'>,
  catalogo: Catalogo,
  vacia: (c: Celda) => string | null,
): string[] {
  const deLadera = modulosDeLadera(catalogo);
  const { diagonales } = modulosDelRelieve(catalogo);
  const barrancos = new Set(rel.barrancos);
  /** Cuántas piezas lleva cada pared, por `claveDeCelda`. */
  const piezas = new Map<string, number>();
  const sumar = (k: string) => piezas.set(k, (piezas.get(k) ?? 0) + 1);
  const porFilos = new Map<string, Celda[]>();
  // Por la x de cada filo y la y de su punto medio, que es lo que no mueve el
  // estirón de una caída mayor que la del arte (`filosEnSuSitio`): con la y de
  // cada filo, en caída 4 (un cuarto de casilla de desvío) caía en otra clave.
  const claveDeFilos = (p: readonly [number, number], q: readonly [number, number]) =>
    `${Math.round(p[0] * 2)},${Math.round(q[0] * 2)},${Math.round((p[1] + q[1]) * 2)}`;
  const porVertice = new Map<string, Celda[]>();
  for (const c of rel.vistas) {
    const [fa, fb] = filosDe(c);
    const k = claveDeFilos(fa, fb);
    porFilos.set(k, [...(porFilos.get(k) ?? []), c]);
    const v = `${c.vx},${c.vy}`;
    porVertice.set(v, [...(porVertice.get(v) ?? []), c]);
  }
  /** Las paredes de los vértices de la columna `vx` de las filas `vy0` a `vy1`. */
  const enColumna = (vx: number, vy0: number, vy1: number) =>
    Array.from(
      { length: vy1 - vy0 + 1 },
      (_, k) => porVertice.get(`${vx},${vy0 + k}`) ?? [],
    ).flat();
  const frontales: { caja: readonly [number, number, number, number]; y: number }[] = [];
  const mal: string[] = [];
  for (const s of sprites) {
    if (s.clase !== 'pared') continue;
    if (s.src?.includes('/paredes-') === true) {
      frontales.push({ caja: cajaDeSprite(s), y: s.y });
      continue;
    }
    const ladera = s.src === null ? undefined : deLadera.get(s.src);
    if (ladera !== undefined) {
      const { filo, pie } = juntasColocadas(ladera.modulo, s);
      const este = pie[0] > filo[0];
      const fila = filo[1];
      const vx = Math.round(filo[0]);
      if (
        Math.abs(filo[0] - vx) > HOLGURA_DE_JUNTA ||
        Math.abs(fila * 2 - Math.round(fila * 2)) > HOLGURA_DE_JUNTA * 2
      ) {
        mal.push(
          `${s.src} con el filo en ${filo[0].toFixed(2)},${filo[1].toFixed(2)}: fuera de toda junta`,
        );
        continue;
      }
      for (let k = 0; k < ladera.modulo.ladera.largo; k++) {
        const vy = Math.round(fila * 2) / 2 + 0.5 + k;
        const c = porVertice.get(`${vx},${vy}`)?.find((o) => o.tipo === (este ? 'E' : 'O'));
        if (c === undefined)
          mal.push(`${s.src} en ${vx},${vy}: no hay ladera ${este ? 'este' : 'oeste'} ahí`);
        else sumar(claveDeCelda(c));
      }
      continue;
    }
    const diagonal = s.src === null ? undefined : diagonales.get(s.src);
    const filos =
      diagonal !== undefined
        ? filosColocados(diagonal, s)
        : s.src === null && s.color === COLOR_DE_DIAGONAL
          ? null
          : undefined;
    if (filos === undefined) continue;
    const suyas =
      filos === null
        ? // El marcador va en medio de sus filos, a un cuarto de casilla de su
          // vértice en x, y con su clave bajo el pie, hasta la caída más alta.
          enColumna(Math.round(s.x), Math.floor(s.y) - 4, Math.ceil(s.y)).filter((c) => {
            const m = marcadorDeDiagonal(c);
            return cerca([m.x, m.y], [s.x, s.y]) && Math.abs(m.alto - s.alto) < 1e-6;
          })
        : (porFilos.get(claveDeFilos(filos[0], filos[1])) ?? []).filter((c) =>
            filosEnSuSitio(filos, filosDe(c), estiramientoDe(s)),
          );
    if (suyas.length === 0)
      mal.push(
        `${s.src ?? 'marcador de diagonal'} en ${s.x.toFixed(2)},${s.y.toFixed(2)}: fuera de toda celda`,
      );
    for (const c of suyas) sumar(claveDeCelda(c));
  }
  for (const c of rel.vistas) {
    if (barrancos.has(c)) continue;
    const k = claveDeCelda(c);
    const donde = `${c.vx},${c.vy} ${c.tipo}`;
    const n =
      c.tipo === 'S'
        ? frontales.some(
            ({ caja, y }) =>
              caja[0] <= c.vx &&
              caja[2] >= c.vx &&
              Math.abs(y - (c.vy + c.caida * ALTO_DE_NIVEL)) <= 0.3,
          )
          ? 1
          : 0
        : (piezas.get(k) ?? 0);
    if (n > 1) mal.push(`${donde}: ${n} piezas`);
    else if (n === 0 && vacia(c) === null) mal.push(`${donde}: sin pieza y sin razón`);
  }
  return mal;
}

/** El `arriba` de una bajada ya colocada (su pieza o su marcador), o null si `s` no es una bajada. */
function arribaColocado(
  s: Sprite,
  bajadas: ReadonlyMap<string, ModuloDeBajada>,
  b: Bajada,
): readonly [number, number] | null {
  const m = s.src === null ? undefined : bajadas.get(s.src);
  if (m !== undefined) return enElMapa(s, m.bajada.arriba);
  if (s.src === null && s.color === COLOR_DE_BAJADA) {
    // El marcador va en la x del pie, con la clave por debajo de él.
    const [x, y] = abajoDe(b);
    return Math.abs(s.x - x) <= HOLGURA_DE_JUNTA && s.y >= y ? b.arriba : null;
  }
  return null;
}

/** Las bajadas sin su pieza (o su marcador) con el `arriba` en su sitio, cada una dicha. */
export function bajadasSinPieza(
  sprites: readonly Sprite[],
  bajadas: readonly Bajada[],
  catalogo: Catalogo,
): string[] {
  const m = modulosDelRelieve(catalogo).bajadas;
  return bajadas
    .filter(
      (b) =>
        !sprites.some((s) => s.clase === 'pared' && cercaDe(arribaColocado(s, m, b), b.arriba)),
    )
    .map(
      (b) => `bajada ${b.rumbo} en ${b.arriba[0].toFixed(2)},${b.arriba[1].toFixed(2)}: sin pieza`,
    );
}

const cercaDe = (p: readonly [number, number] | null, q: readonly [number, number]) =>
  p !== null && cerca(p, q);

/**
 * Lo que tapa el camino de alguna bajada, medido desde lo pintado: cada volumen
 * que `separar` pone después de la bajada (y se pinta encima) cuya silueta
 * (`bajoLaSilueta`: el perfil de su módulo, o su caja si no lo trae) cubre algún
 * punto de su camino por la pared, de `arriba` a `abajo`, mirado cada
 * `PASO_POR_EL_TABLERO`. Como `puentesTapados`, no pregunta a la puerta.
 * No cuentan lo horneado ni los muros, ni las rocas planas del pie.
 */
export function bajadasTapadas(
  sprites: readonly Sprite[],
  bajadas: readonly Bajada[],
  catalogo: Catalogo,
): string[] {
  const m = modulosDelRelieve(catalogo).bajadas;
  const perfilDe = perfilesDelCatalogo(catalogo);
  const { volumenes } = separar({ sprites });
  const fuera: string[] = [];
  for (const b of bajadas) {
    const k = volumenes.findIndex(
      ({ s }) => s.clase === 'pared' && cercaDe(arribaColocado(s, m, b), b.arriba),
    );
    if (k < 0) continue;
    const puntos = caminoDeBajada(b);
    // La que baja a un nodo y lo pisa va a su profundidad, justo detrás de él
    // (`componer`): lo que se pinta delante del nodo está delante de su llegada
    // y puede taparla. Sin esto, en s10, s31 y s36 una pared de delante de la
    // ciudad o del hito contaba como tapándola.
    const nodo = volumenes.find(({ s: n }, j) => j > k && esNodoHorneado(n) && llegaA(b, n))?.s;
    for (const { s } of volumenes.slice(k + 1)) {
      if (s.clase === 'objeto' || s.clase === 'muro') continue;
      if (nodo !== undefined && ordenDeVolumenes(s, nodo) > 0) continue;
      // Otra bajada que se cruza con esta es el mismo camino que se abre en dos.
      if ((s.src !== null && m.has(s.src)) || (s.src === null && s.color === COLOR_DE_BAJADA))
        continue;
      if (puntos.some(([x, y]) => tapaElPunto(s, perfilDe, x, y))) {
        fuera.push(
          `bajada ${b.rumbo} en ${b.arriba[0].toFixed(2)},${b.arriba[1].toFixed(2)}: la tapa ${s.src ?? s.clase} en ${s.x.toFixed(2)},${s.y.toFixed(2)}`,
        );
        break;
      }
    }
  }
  return fuera;
}

/** Lo horneado de un nodo: ciudad, pueblo, mina o nodo (`seHornea`). */
const esNodoHorneado = (s: Sprite): boolean =>
  s.clase === 'objeto' && s.objeto !== undefined && seHornea(s.objeto.kind);

/**
 * Si lo horneado `n` está en la casilla baja de la bajada `b`: la rampa baja
 * hacia él, que queda delante. El de la casilla alta queda detrás de ella: la
 * rampa sale de su puerta hacia la cámara y se pinta encima, como la senda.
 */
const llegaA = (b: Bajada, n: Sprite): boolean =>
  Math.floor(n.x) === b.bajo[0] && Math.floor(n.y) === b.bajo[1];

/** Paso de la rejilla con la que `seSolapan` busca un punto pintado por los dos. */
const PASO_DE_SOLAPE = 0.05;

/** Si `a` y `b` pintan algún punto en común, bajo sus siluetas (`tapaElPunto`). */
function seSolapan(a: Sprite, b: Sprite, perfilDe: PerfilDe): boolean {
  const ca = cajaDeSprite(a);
  const cb = cajaDeSprite(b);
  const x0 = Math.max(ca[0], cb[0]);
  const x1 = Math.min(ca[2], cb[2]);
  const y0 = Math.max(ca[1], cb[1]);
  const y1 = Math.min(ca[3], cb[3]);
  for (let x = x0; x <= x1; x += PASO_DE_SOLAPE)
    for (let y = y0; y <= y1; y += PASO_DE_SOLAPE)
      if (tapaElPunto(a, perfilDe, x, y) && tapaElPunto(b, perfilDe, x, y)) return true;
  return false;
}

/**
 * Las bajadas que el pintor pinta después de lo horneado del nodo al que bajan
 * (`llegaA`) y con el que se solapan (`seSolapan`), cada una dicha. La que baja
 * a una ciudad pintaba su camino sobre la muralla (s9).
 */
export function bajadasSobreNodo(
  sprites: readonly Sprite[],
  bajadas: readonly Bajada[],
  catalogo: Catalogo,
): string[] {
  const m = modulosDelRelieve(catalogo).bajadas;
  const perfilDe = perfilesDelCatalogo(catalogo);
  const { volumenes } = separar({ sprites });
  const fuera: string[] = [];
  for (const b of bajadas) {
    const k = volumenes.findIndex(
      ({ s }) => s.clase === 'pared' && cercaDe(arribaColocado(s, m, b), b.arriba),
    );
    if (k < 0) continue;
    const s = (volumenes[k] as (typeof volumenes)[number]).s;
    const nodo = volumenes
      .slice(0, k)
      .find(({ s: n }) => esNodoHorneado(n) && llegaA(b, n) && seSolapan(s, n, perfilDe));
    if (nodo !== undefined)
      fuera.push(
        `bajada ${b.rumbo} en ${b.arriba[0].toFixed(2)},${b.arriba[1].toFixed(2)}: encima de ${nodo.s.objeto?.kind} ${nodo.s.objeto?.id}`,
      );
  }
  return fuera;
}

/** Ruido de valor suave, de 0 a 1, con celdas de `escala` casillas: dónde hay mancha. */
export function ruidoSuave(semilla: number, escala: number): (x: number, y: number) => number {
  const valor = (ix: number, iy: number) => {
    let h =
      (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(semilla, 2147483647)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const suave = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const u = x / escala;
    const v = y / escala;
    const ix = Math.floor(u);
    const iy = Math.floor(v);
    const fx = suave(u - ix);
    const fy = suave(v - iy);
    const a = valor(ix, iy) + (valor(ix + 1, iy) - valor(ix, iy)) * fx;
    const b = valor(ix, iy + 1) + (valor(ix + 1, iy + 1) - valor(ix, iy + 1)) * fx;
    return a + (b - a) * fy;
  };
}

function cajaDe(casillas: readonly number[], W: number): [number, number, number, number] {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = 0;
  let y1 = 0;
  for (const i of casillas) {
    const x = i % W;
    const y = (i - x) / W;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + 1);
    y1 = Math.max(y1, y + 1);
  }
  return [x0, y0, x1, y1];
}

/** Cuántas líneas separadas forman los pasos de un esqueleto. */
export function componentesDePasos(
  casillas: readonly (readonly [number, number])[],
  pasos: readonly { a: readonly [number, number]; b: readonly [number, number] }[],
): number {
  const padre = new Map<string, string>();
  const raiz = (k: string): string => {
    let r = k;
    while (padre.get(r) !== r) r = padre.get(r) as string;
    return r;
  };
  for (const [x, y] of casillas) padre.set(`${x},${y}`, `${x},${y}`);
  for (const p of pasos) {
    const ra = raiz(`${p.a[0]},${p.a[1]}`);
    const rb = raiz(`${p.b[0]},${p.b[1]}`);
    if (ra !== rb) padre.set(ra, rb);
  }
  return new Set([...padre.keys()].map(raiz)).size;
}

export type { Analisis };

/**
 * Dónde hay luz y dónde niebla. Las ciudades y pueblos llevan su resplandor; la
 * lava, una brasa de cada tantas casillas; el agua y lo más bajo, jirones de
 * niebla. Todo con su propio azar, así que no mueve nada de lo colocado.
 */
export function luces(a: Analisis, nivel: ArrayLike<number>, azar: () => number): Luz[] {
  const fuera: Luz[] = [];
  for (const o of a.objetos) {
    if (o.kind === 'town') fuera.push({ x: o.at.x + 0.5, y: o.at.y + 0.3, r: 1.6, clase: 'fuego' });
    if (o.kind === 'village')
      fuera.push({ x: o.at.x + 0.5, y: o.at.y + 0.4, r: 1.1, clase: 'fuego' });
  }
  for (let i = 0; i < a.W * a.H; i++) {
    const x = i % a.W;
    const y = (i - x) / a.W;
    const suelo = a.suelo[i];
    const agua = a.franjaDe[i] !== -1 && a.franjas[a.franjaDe[i] as number]?.barrera === 'water';
    // Brasa solo en lava rodeada de lava: en la linde quemaba la nieve de al lado.
    const enLava =
      suelo === 'lava' &&
      [-1, 0, 1].every((dy) =>
        [-1, 0, 1].every((dx) => (a.suelo[i + dy * a.W + dx] ?? 'lava') === 'lava'),
      );
    if (enLava && azar() < 0.15)
      fuera.push({ x: x + azar(), y: y + azar(), r: 0.5 + azar() * 0.6, clase: 'brasa' });
    if ((agua || ((nivel[i] as number) <= 0 && suelo === 'swamp')) && azar() < 0.18)
      fuera.push({ x: x + azar(), y: y + azar(), r: 1.2 + azar() * 1.4, clase: 'niebla' });
  }
  return fuera;
}
