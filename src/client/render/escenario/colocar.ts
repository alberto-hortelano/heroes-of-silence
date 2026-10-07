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
  type Catalogo,
  esHojaDeLadera,
  type Modulo,
  type ModuloDeLadera,
  moduloDeLadera,
  type PapelDeLadera,
  type Pieza,
} from './catalogo.js';
import { azarDe, esparcir } from './esparcir.js';
import { ejeDe, esqueleto } from './esqueleto.js';
import { macizoDe, PASO_DEL_RUIDO, radioDePico } from './macizo.js';
import { nodoDePaso } from './nodos.js';
import { cajaDeSprite, Pasillo } from './pasillo.js';
import { esVolumen, ordenDeVolumenes, separar } from './pintar.js';
import {
  type Puente,
  puenteDe,
  sendasDeEstriboEnAgua,
  tramosHastaLosEstribos,
  vadosDeLosEstribos,
} from './puentes.js';
import {
  ALTO_DE_NIVEL,
  bandaDeCara,
  bordeDeLadera,
  CARA_DE_SUELO,
  type Cara,
  type CaraConRampas,
  caidaDeLadera,
  esquinas,
  FRONTAL_DE_ESQUINA,
  type Ladera,
  pieDeCara,
  pieDeLadera,
  type Relieve,
  rampas,
  relieve,
  SEMIANCHO_DE_PARED,
  SOLAPE,
  type Tope,
  topesDeCara,
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
  readonly relieve: Pick<Relieve, 'cantos' | 'rebordes'> & {
    /** Las caras con sus rampas (`rampas`): por donde baja una senda, la cara no se pinta. */
    readonly caras: readonly CaraConRampas[];
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
     * Paredes de acantilado (y su remate) cuyo rectángulo pisa la senda que baja
     * por una cara o la que sigue junto a ella (`paredesSobreRampa`): tiene que ser 0.
     */
    readonly paredesSobreRampa: number;
    /**
     * Paredes de acantilado (y su remate) que no se apoyan en el pie de ninguna
     * cara ni caen dentro de su banda (`paredesFueraDelPie`): tiene que ser 0.
     */
    readonly paredesFueraDelPie: number;
    /**
     * Casillas de ladera sin exactamente una cosa —un módulo de ladera, los
     * peñascos del canto, o nada donde no cabía—, y laderas fuera de su sitio
     * (`laderasMalCubiertas`): tiene que ser 0.
     */
    readonly laderasMalCubiertas: number;
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
     * Sendas que salen de un estribo y pasan por agua pintada en sus primeras
     * casillas, sin vado que la quite (`sendasDeEstriboEnAgua`): tiene que ser 0.
     */
    readonly sendasDeEstriboEnAgua: number;
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
  return hojaDePico(s, azar, hondura >= 2 ? 0.625 : 0);
}

/** Por debajo de esta `cumbre` (`Macizo.cumbre`), la roca es de falda: nunca agujas. */
const CUMBRE_DE_AGUJAS = 0.25;

/**
 * La hoja de un pico según su suelo y lo alto que cae en el macizo: en las
 * cumbres, agujas; en las faldas, los achaparrados. La nieve, la lava y la arena
 * tienen una sola hoja.
 */
function hojaDePico(s: Suelo, azar: () => number, cumbre: number): string {
  if (s === 'snow') return 'picos-nevados';
  if (s === 'lava') return 'picos-volcan';
  if (s === 'sand') return 'picos-arenisca';
  return cumbre >= CUMBRE_DE_AGUJAS && azar() < Math.min(0.95, 1.5 * cumbre)
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
  'cara-roca': { pared: 'paredes-roca', ladera: 'laderas-roca', pedregal: PALIDA },
  'cara-arenisca': {
    pared: 'paredes-arenisca',
    ladera: 'laderas-arenisca',
    pedregal: 'sepia(1) saturate(2.2) hue-rotate(-28deg) brightness(0.62)',
  },
  'cara-basalto': {
    pared: 'paredes-basalto',
    ladera: 'laderas-basalto',
    pedregal: 'brightness(0.5) saturate(0.7)',
  },
  'cara-nevada': {
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

/** Ancho del mojón de un nodo, en casillas: mide una casilla de alto (#168). */
const ANCHO_DEL_HITO = 0.6;

export function componer(map: MapaDeEscena, semilla: number, catalogo: Catalogo): Escena {
  /** Los módulos de una hoja, de menor a mayor, o null si la hoja aún no está hecha. */
  const modulosDe = (hoja: string): readonly Modulo[] | null => catalogo.hojas[hoja] ?? null;
  const pieza = (id: string): Pieza | null => catalogo.piezas[id] ?? null;
  const a = analizar(map);
  const rel = relieve(a, semilla);
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
      const pu = puenteDe(o, a, rel.nivel, map.caminos.tramos, catalogo);
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
                return nodoDePaso(paso.barrera, paso.eje);
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
    const ancho =
      id === 'nodo-hito'
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
        ? variantes[
            [...o.id].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7) %
              variantes.length
          ]
        : undefined;
    const p = variante ?? (id === null ? null : pieza(id));
    sprites.push(deObjeto(o, p, x, y + 0.35, p === null ? ancho : (ancho * p.nh) / p.nw));
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
  // Por dónde bajan las sendas por las caras: el único sitio donde se decide.
  // La línea de cada puente, de estribo a estribo, abre su tajo como una senda
  // (se ve el agua bajo el tablero y la pared remata sus bordes): sin él,
  // quedaba a cada lado del tablero una tira de cara lisa.
  const bajadas = rampas(
    rel.caras,
    rel.laderas,
    trazos,
    puentes.map((p) => p.extremos),
  );
  const caras = rel.caras.map(
    (c, k): CaraConRampas => ({ ...c, rampas: bajadas.porCara[k] ?? [] }),
  );
  const pasilloDePared = pasilloDeLaPared(bajadas.junto);
  /** El de las laderas: además, lo que baja por una ladera (`Bajadas.juntoDeLadera`). */
  const pasilloDeLadera = pasilloDeLaPared([...bajadas.junto, ...bajadas.juntoDeLadera]);
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
      !tapaUnTablero(s, tableros, r.semiancho, minimo)
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
      altoLibreAnteLosPuentes(s, tableros, r.semiancho),
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
   * La puerta de la pared y de su remate: no pisan `pasilloP`, la senda que
   * baja por una cara y la que sigue junto a ella (`pasilloDePared`; el de las
   * laderas, también la que baja por una ladera). Si la pisa, se prueba
   * en cada `xs` (de más a menos preferido; el primero, su sitio, sin la
   * reserva de un objeto ni al pie ni en `yQueTapa`) cada uno de `modulos`, en
   * su orden, encogido sin bajar del primero de `minimos`; luego con el
   * siguiente mínimo. Si nada cabe, no va. Nunca se corta. Tampoco tapa un
   * tablero (`altoLibreAnteLosPuentes`).
   *
   * Dice si se puso y si cedió a un puente: si en su sitio, tal cual, el
   * tablero de un puente que tiene detrás no le dejaba ni su primer mínimo.
   *
   * La frontal y los peñascos prueban también el módulo más estrecho de su
   * hoja (`yElMasEstrecho`); una ladera, solo el suyo: se coloca por las juntas
   * de SU módulo, y otro en su sitio quedaría descolgado de la cadena.
   *
   * Corrida a otra `x`, se apoya donde diga `yEn` en esa `x`: en una escalera
   * el pie se inclina, y la que conservaba la `y` de su sitio quedaba hasta una
   * casilla bajo su acantilado, de pie en el río (#150, N1).
   */
  const paredQueNoPisa =
    (pasilloP: Pasillo) =>
    (
      modulos: readonly [Sprite, ...Sprite[]],
      minimos: readonly number[],
      xs: readonly number[],
      yQueTapa: number,
      yEn: (x: number) => number = () => modulos[0].y,
    ): { readonly puesta: boolean; readonly cedio: boolean } => {
      const s = modulos[0];
      const cedio =
        altoLibreAnteLosPuentes(s, tableros, SEMIANCHO_DE_PARED) < (minimos[0] ?? s.alto);
      // Junto a un objeto, ni al pie ni en lo que tapa por encima (el filo de una
      // cara, el medio de una ladera): donde la reserva quita la pared, correrla
      // la ponía encima de otro.
      const libre = (x: number) => !reservas.tomada(x, yEn(x)) && !reservas.tomada(x, yQueTapa);
      if (!libre(xs[0] ?? s.x)) return { puesta: false, cedio };
      const libres = xs.filter(libre);
      for (const minimo of minimos)
        for (const x of libres)
          for (const m of modulos) {
            const aqui = x === m.x ? m : { ...m, x, y: yEn(x) };
            const enElPasillo = pasilloP.altoLibre(aqui, SEMIANCHO_DE_PARED);
            if (enElPasillo < minimo) continue;
            const alto = Math.min(
              enElPasillo,
              altoLibreAnteLosPuentes(aqui, tableros, SEMIANCHO_DE_PARED),
            );
            if (alto >= minimo)
              return { puesta: meter(alto === aqui.alto ? aqui : { ...aqui, alto }), cedio };
          }
      return { puesta: false, cedio };
    };
  const ponerPared = paredQueNoPisa(pasilloDePared);
  /**
   * La de las laderas, que se apartan también de lo que baja por una ladera:
   * la frontal no (`Bajadas.juntoDeLadera`).
   */
  const ponerLadera = paredQueNoPisa(pasilloDeLadera);
  const mata = (hoja: string, x: number, y: number, alto: number) =>
    poner(hoja, x, y, alto, azar(), 'cubierta', MARCADOR.cubierta as string, false);
  const altoDeMata = (s: Suelo) => CUBIERTA[s].alto * (MATA_MAS_BAJA + azar() * 0.6);

  /** La cresta de todos los macizos: dónde una cumbre y dónde un collado. */
  const ruidoDeCresta = ruidoSuave(semilla * 131 + 71, PASO_DEL_RUIDO);
  const esbeltos = new Map<string, readonly Modulo[]>();
  /**
   * El nombre de un módulo de `hoja` por su silueta: con `cumbre` 0, de los más
   * chatos (ancho entre alto); con 1, de los más esbeltos, con algo de azar
   * para que no se repitan. El orden del catálogo es el de las imágenes y no
   * dice nada del tamaño: elegir por él (`t`) no elegía nada.
   */
  const siluetaDe = (hoja: string, cumbre: number): string | undefined => {
    let ms = esbeltos.get(hoja);
    if (ms === undefined) {
      ms = [...(modulosDe(hoja) ?? [])].sort((p, q) => q.nw / q.nh - p.nw / p.nh);
      esbeltos.set(hoja, ms);
    }
    if (ms.length === 0) return undefined;
    const centro = Math.round(cumbre * (ms.length - 1));
    const k = Math.max(0, Math.min(ms.length - 1, centro + Math.round((azar() - 0.5) * 4)));
    return ms[k]?.nombre;
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
    return {
      radio: (x, y) => radioDePico(macizo.alto(x, y)),
      altoMasBajo: (x, y) => macizo.alto(x, y) * 0.75,
      modulo: (i, x, y, factor) => {
        const cumbre = macizo.cumbre(x, y);
        const hoja = hojaDePico(a.suelo[i] as Suelo, azar, cumbre);
        const nombre = siluetaDe(hoja, cumbre);
        const luz = luzDeCumbre(cumbre);
        const tono = [tonoDe(hoja), luz].filter((t) => t !== undefined).join(' ');
        return {
          hoja,
          alto: macizo.alto(x, y) * factor,
          t: cumbre,
          ...(nombre === undefined ? {} : { nombre }),
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

  // 4 · El relieve: una pared de acantilado a lo largo de cada caída, hecha de
  // trozos que se solapan, y rocas caídas al pie. La textura de la cara (la pinta
  // el pintor) queda detrás como fondo, por si un trozo deja hueco.
  // Las caídas al este y al oeste (#156): una ladera de norte a sur por cada
  // caída (§20), con su remate al norte y al sur y la esquina donde la caída
  // gira hacia la cámara. Van antes que las caras porque la cara deja de poner
  // frontal donde entró una esquina, y con su propio azar: así la pared frontal
  // de cada cara sale como antes.
  const azarDeLaderas = azarDe(semilla * 6007 + 11);
  /** La cara en cuya esquina acaba cada ladera, por su índice. */
  const caraDeEsquina = new Map<Ladera, number>();
  for (const [k, e] of esquinas(rel.caras, rel.laderas).entries())
    for (const l of [e.oeste, e.este]) if (l !== undefined) caraDeEsquina.set(l, k);
  /** Las esquinas que entraron, por índice de cara: solo esas paran la frontal. */
  const puestas = rel.caras.map(() => ({ oeste: false, este: false }));
  /** Las casillas de canto con ladera puesta, como `x,y,lado`. */
  const conLadera = new Set<string>();
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
  /** El sprite del módulo `m` desde la casilla `y` de `l` (`colocarLadera`). */
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
  const laderasPorColumna = indiceDeLaderas(rel.laderas);
  for (const l of rel.laderas) {
    const hoja = hojaDeLadera(l);
    const juego = juegoDe(hoja);
    if (juego === null) {
      // Sin el arte, una marca por casilla, del filo al pie.
      for (let y = l.y0; y <= l.y1; y++) {
        const largo = 1 + l.caida * ALTO_DE_NIVEL;
        const s = deHoja(hoja, bordeDeLadera(l), y + largo, largo, 0, 'pared', '#4c463e', true);
        if (ponerLadera([s], [s.alto], [s.x], y + 0.5).puesta)
          conLadera.add(`${l.x},${y},${l.lado}`);
      }
      continue;
    }
    const cara = caraDeEsquina.get(l);
    const poner = (m: ModuloDeLadera, y: number): boolean => {
      const s = spriteDeLadera(m, hoja, l, y);
      // Ni se corre ni se encoge: rompería la cadena. Si pisa la senda que
      // baja o la reserva de un objeto, no va.
      if (!ponerLadera([s], [s.alto], [s.x], y + m.ladera.largo / 2).puesta) return false;
      for (let k = 0; k < m.ladera.largo; k++) conLadera.add(`${l.x},${y + k},${l.lado}`);
      if (cara !== undefined && m === juego.esquina)
        (puestas[cara] as { oeste: boolean; este: boolean })[l.lado] = true;
      return true;
    };
    // Lo que no entra se prueba casilla a casilla con los módulos de una, que
    // son más estrechos que un largo y que una esquina; la esquina, antes con
    // el remate del sur. Si nada entra, quedan los peñascos del canto.
    const enLugarDeLaEsquina = [juego.fin, ...juego.medios];
    const piezas = piezasDeLadera(
      l,
      { ...rematesDeLadera(l, laderasPorColumna), esquina: cara !== undefined },
      juego,
      azarDeLaderas,
    );
    for (const p of piezas) {
      if (poner(p.modulo, p.y)) continue;
      const otros = p.modulo === juego.esquina ? enLugarDeLaEsquina : juego.medios;
      for (let y = p.y; y < p.y + p.modulo.ladera.largo; y++)
        for (const m of otros) if (m !== p.modulo && poner(m, y)) break;
    }
  }

  /** Las caras sin rampa en las que alguna pared no entró por no tapar un puente, por índice. */
  const cedenAUnPuente: number[] = [];
  for (const [k, c] of caras.entries()) {
    const { pie, en: pieEn } = pieDeCara(c, rel.caras);
    const { pared: hoja, pedregal: tonoDelPedregal } = materialDeCara(c.material);
    const { desde, hasta, izq, der } = tramoDeFrontal(c, topesDeCara(k, rel.caras, puestas));
    const filo = c.y + 1;
    // Lo más bajo que se deja una pared al apartarse: lo que mide la cara. Más
    // baja, la cara asomaría lisa por encima.
    const minimo = c.caida * ALTO_DE_NIVEL;
    /**
     * Peñascos de la misma hoja que los de los cantos, de `desde` hacia el filo,
     * cada uno en la `x` que se le pida a su altura. Son el remate de la pared y
     * pasan por su puerta. Entonados al material de la cara (el gris de la hoja
     * sobre la arenisca se leía como cascotes de otro sitio) y, como pedregal
     * que son, apartados de toda senda con el margen de su pared, no solo de la
     * que baja: 4 pisaban una senda al pie (#150, N3).
     */
    const peñascos = (desde: number, xEn: (y: number) => number) => {
      for (let y = desde + 0.05; y > filo + 0.15; y -= 0.26 + azar() * 0.12) {
        const px = xEn(y);
        const alto = 0.3 + azar() * 0.18;
        const deLaHoja = deHoja(
          'rocas-caidas',
          px,
          y,
          alto,
          azar() * 0.6,
          'pared',
          '#5a5248',
          true,
        );
        const roca = deLaHoja.src === null ? deLaHoja : { ...deLaHoja, tono: tonoDelPedregal };
        const libre = pasillo.altoLibre(roca, SEMIANCHO_DE_PARED);
        if (libre < ENCOGER_HASTA * alto) continue;
        ponerPared(
          yElMasEstrecho(libre === alto ? roca : { ...roca, alto: libre }, 'rocas-caidas'),
          [ENCOGER_HASTA * alto],
          [px],
          y,
        );
      }
    };
    /** El módulo anclado cerca de `x`, en su pie. */
    const pared = (x: number, pieDeX: number, nombre?: string) =>
      deHoja(
        hoja,
        x + (azar() - 0.5) * 0.1,
        pieDeX + 0.05 + (azar() - 0.5) * 0.12,
        c.caida * ALTO_DE_NIVEL + 0.35 + azar() * 0.2,
        azar(),
        'pared',
        '#4c463e',
        true,
        nombre,
      );
    const cerca = (x: number) =>
      [x, ...DESVIOS.flatMap((d) => [x - d, x + d])].filter((v) => v >= izq && v <= der);
    // Cada borde de un tajo que cae dentro de la cara lleva su pared, el módulo
    // más estrecho pegado a la senda (que monte `SOLAPE` sobre el tajo, y si aun
    // así la pisa, un poco más afuera), y un remate de peñascos a lo largo del
    // canto del tajo, que deja de leerse como una ranura recta. Apoyada en el
    // pie recto de su cara: inclinada hacia la de al lado, en el último peldaño
    // de una escalera que sube subía y dejaba la cara lisa junto a la senda.
    for (const r of c.rampas)
      for (const [dentro, borde, fuera] of [
        [r.dentro[0], r.a, -1],
        [r.dentro[1], r.b, 1],
      ] as const) {
        if (!dentro) continue;
        const s = pared(borde, pie, masEstrecho(hoja)?.nombre);
        const [x0, , x1] = cajaDeSprite(s);
        const pegada = s.x + borde - fuera * SOLAPE - (fuera < 0 ? x1 : x0);
        ponerPared(
          yElMasEstrecho(s, hoja),
          [minimo],
          [0, ...DESVIOS].map((d) => pegada + fuera * d).filter((x) => x >= izq && x <= der),
          filo,
          // Sobre su cara baja con la escalera, como las demás, pero no sube con
          // ella (arriba). Pasada su cara, ya está en el peldaño de al lado y
          // sigue su pie: con el pie recto quedaba una casilla bajo él, en el río.
          (x) => s.y + (x >= c.x0 && x <= c.x1 + 1 ? Math.max(0, pieEn(x) - pie) : pieEn(x) - pie),
        );
        // El canto del tajo, a cada altura: inclinado `SOLAPE` hacia dentro en el filo.
        peñascos(pie, (y) => {
          const canto = borde - (fuera * SOLAPE * (pie - Math.min(y, pie))) / (pie - filo);
          return canto + fuera * (0.06 + azar() * 0.08);
        });
      }
    let cedeAUnPuente = false;
    for (let x = desde; x <= hasta; x += 0.42 + azar() * 0.22) {
      const s = pared(x, pieEn(x));
      // Corrida, sobre el pie de donde acabe, con el mismo azar que traía.
      const yEn = (x: number) => s.y + pieEn(x) - pieEn(s.x);
      const { puesta, cedio } = ponerPared(
        yElMasEstrecho(s, hoja),
        [minimo, minimo * BAJA_JUNTO_A_LA_SENDA],
        cerca(s.x),
        filo,
        yEn,
      );
      // En su sitio no cabía entera por no tapar un puente: se corrió, se
      // encogió o no entró.
      if (cedio) cedeAUnPuente = true;
      // Donde no cabe ninguna pared, junto a la senda o a un objeto, un pedregal
      // por la cara: sin él quedaba una losa lisa. Cada peñasco mira la reserva
      // en su propio pie, así que no sube encima del objeto. Dentro de la banda
      // de su cara: el pie inclinado de la escalera lo sacaba por abajo.
      if (!puesta && !reservas.tomada(s.x, s.y) && s.x >= c.x0 && s.x <= c.x1 + 1)
        peñascos(Math.min(s.y, pie), () =>
          Math.min(c.x1 + 0.95, Math.max(c.x0 + 0.05, s.x + (azar() - 0.5) * 0.3)),
        );
    }
    if (cedeAUnPuente && c.rampas.length === 0) cedenAUnPuente.push(k);
    for (let x = c.x0; x <= c.x1 + 0.99; x += 0.35 + azar() * 0.3) {
      const px = x + azar() * 0.2;
      const py = pie + 0.1 + azar() * 0.2;
      if (!entraria('roca', px, py, 0.28)) continue;
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
    }
  }

  // La cara que se queda casi sin pared porque la taparía delante de un puente
  // se abre entera, como un tajo de punta a punta: lisa, era un rectángulo de
  // roca junto al estribo. Sin cara queda la orilla de arriba fundida con lo de
  // abajo, como bajo el tablero. Con una rampa no: los bordes de su tajo llevan
  // pared. Con la regla de profundidad de `vaDelante` sigue haciendo falta: sin
  // ella, 3 caras de las semillas 1-10 se quedan lisas de punta a punta
  // (07-10-2026).
  // La que se queda abre lo que su pared no tapa, como tajos: era una losa lisa
  // de bordes rectos al lado del estribo (s24 node-8, H5 del QA de #157). Como
  // un tajo de rampa, con los bordes de dentro inclinados bajo la pared de al
  // lado, pero sin senda.
  const abiertas = new Set<number>();
  const conHuecos = new Map<number, NonNullable<CaraConRampas['huecos']>>();
  for (const k of cedenAUnPuente) {
    const c = caras[k] as Cara;
    const { cubierto, huecos } = paredDeLaCara(c, sprites);
    if (cubierto < CUBIERTA_PARA_QUEDARSE) abiertas.add(k);
    else {
      const tajos = huecos
        .filter(([a, b]) => b - a >= HUECO_MINIMO)
        .map(([a, b]) => ({ a, b, dentro: [a > c.x0, b < c.x1 + 1] as const }));
      if (tajos.length > 0) conHuecos.set(k, tajos);
    }
  }

  // Las caídas al este y al oeste sin ladera (la quitó una senda que baja o la
  // reserva de un objeto): el canto lo oscurece el pintor; aquí, peñascos.
  for (const [x, y, lado] of rel.cantos) {
    if (conLadera.has(`${x},${y},${lado}`)) continue;
    for (let k = 0; k < 2; k++) {
      const px = lado === 'este' ? x + 1.05 : x - 0.05;
      const py = y + 0.3 + k * 0.45 + azar() * 0.2;
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
        materialDeCara(CARA_DE_SUELO[a.suelo[y * W + x] as Suelo]).pedregal,
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

  sprites.sort((p, q) => p.capa - q.capa || p.y - q.y || p.x - q.x);
  /** Qué sprite es una ladera: cualquier módulo de laderas del catálogo, no solo los que se usaron. */
  const deLadera = modulosDeLadera(catalogo);
  /** Si en la casilla `fila` de `l` cabría uno de sus `medio`: la misma pregunta que `ponerLadera`. */
  const cabeUnMedio = (l: Ladera, fila: number) => {
    const hoja = hojaDeLadera(l);
    return (juegoDe(hoja)?.medios ?? []).some((m) => {
      const s = spriteDeLadera(m, hoja, l, fila);
      return (
        !reservas.tomada(s.x, s.y) &&
        !reservas.tomada(s.x, fila + m.ladera.largo / 2) &&
        pasilloDeLadera.altoLibre(s, SEMIANCHO_DE_PARED) >= s.alto &&
        altoLibreAnteLosPuentes(s, tableros, SEMIANCHO_DE_PARED) >= s.alto
      );
    });
  };
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
    nivel: Array.from(rel.nivel),
    agua,
    relieve: {
      caras: caras.map((c, k): CaraConRampas => {
        if (abiertas.has(k)) return { ...c, abierta: true };
        const huecos = conHuecos.get(k);
        return huecos === undefined ? c : { ...c, huecos };
      }),
      cantos: rel.cantos,
      rebordes: rel.rebordes,
    },
    altoDeNivel: ALTO_DE_NIVEL,
    caminos,
    sendas: trazos,
    puentes,
    vados,
    luces: luces(a, rel.nivel, azarDe(semilla * 31 + 5)),
    sprites,
    informe: {
      murallasPartidas,
      basesSobreReserva,
      casillasDeBarreraSinFormacion: sinFormacion,
      spritesSobreSenda: sobreLaSenda(sprites, pasillo).length,
      paredesSobreRampa: paredesSobreRampa(sprites, pasilloDePared, {
        pasillo: pasilloDeLadera,
        es: (s) => s.src !== null && deLadera.has(s.src),
      }).length,
      paredesFueraDelPie: paredesFueraDelPie(sprites, rel.caras).length,
      // Recontadas desde lo puesto, con cualquier módulo de ladera del
      // catálogo y no solo los de las hojas que se usaron.
      laderasMalCubiertas: laderasMalCubiertas(sprites, rel.laderas, deLadera, cabeUnMedio).length,
      laderasEnfrentadas: laderasEnfrentadas(sprites, deLadera).length,
      puentesTapados: puentesTapados(sprites, puentes).length,
      sendasDeEstriboEnAgua: sendasDeEstriboEnAgua(trazos, puentes, vados, esAgua).length,
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
 * Lo que se prueba a correr, en casillas, una pared que pisa la senda, antes de
 * encogerla más de la cuenta: un módulo mide tanto de ancho como de alto, y en
 * una cara de una casilla con la senda al lado no cabía en su sitio. Hasta una
 * casilla: más lejos ya no es su cara.
 */
const DESVIOS = Array.from({ length: 10 }, (_, k) => (k + 1) / 10);

/**
 * Si una pared no cabe junto a la senda ni con el alto de su cara, hasta qué
 * parte de ese alto se encoge antes de quitarla: una pared baja deja lisa la
 * parte de arriba de la cara, y sin ella se quedaba lisa entera.
 */
const BAJA_JUNTO_A_LA_SENDA = 0.5;

/** El pasillo que la pared no pisa: la senda que baja por las caras y la de junto (`Bajadas.junto`). */
export function pasilloDeLaPared(junto: readonly Senda[]): Pasillo {
  return new Pasillo(junto, SEMIANCHO_DE_PARED);
}

/**
 * Las paredes de acantilado, y los peñascos que rematan un tajo, cuyo rectángulo
 * pisa el pasillo de la pared. No filtra nada: mide lo que dejó `ponerPared`.
 * Con `deLadera`, las que `es` una ladera se miden contra su propio pasillo,
 * que lleva también lo que baja por una ladera (`Bajadas.juntoDeLadera`).
 */
export function paredesSobreRampa(
  sprites: readonly Sprite[],
  pasillo: Pasillo,
  deLadera?: { readonly pasillo: Pasillo; readonly es: (s: Sprite) => boolean },
): Sprite[] {
  return sprites.filter(
    (s) =>
      s.clase === 'pared' &&
      (deLadera?.es(s) ? deLadera.pasillo : pasillo).pisa(cajaDeSprite(s), SEMIANCHO_DE_PARED),
  );
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
 * Lo que tiene que tapar la pared de una cara que cedió a un puente para que
 * la cara se quede: menos, se abre entera (`CaraConRampas.abierta`).
 */
export const CUBIERTA_PARA_QUEDARSE = 0.5;

/**
 * Qué parte del largo de `c` tapa alguna pared (la clase `pared`), mirada cada
 * 0,05 casillas a un cuarto y a media altura de su banda: tapada, en las dos.
 * Solo a media altura no veía la pared de una escalera, que se apoya más abajo
 * y deja lisa la parte de arriba de la cara.
 */
export function cubiertoDeLaCara(c: Cara, sprites: readonly Sprite[]): number {
  return paredDeLaCara(c, sprites).cubierto;
}

/**
 * `cubiertoDeLaCara`, y los tramos de la cara (en x) que no tapa ninguna
 * pared, con la misma pregunta: lo que se abre de una cara que cedió a un
 * puente y se queda (`componer`).
 */
function paredDeLaCara(
  c: Cara,
  sprites: readonly Sprite[],
): { readonly cubierto: number; readonly huecos: readonly (readonly [number, number])[] } {
  const [x0, y0, x1, y1] = bandaDeCara(c);
  const alturas = [y0 + (y1 - y0) / 4, (y0 + y1) / 2];
  const cajas = sprites
    .filter((s) => s.clase === 'pared')
    .map((s) => cajaDeSprite(s))
    .filter(([bx0, by0, bx1, by1]) => bx1 >= x0 && bx0 <= x1 && by0 <= y1 && by1 >= y0);
  let tapado = 0;
  let todo = 0;
  const huecos: [number, number][] = [];
  for (let x = x0 + 0.025; x < x1; x += 0.05) {
    todo++;
    if (
      alturas.every((y) =>
        cajas.some(([bx0, by0, bx1, by1]) => x >= bx0 && x <= bx1 && y >= by0 && y <= by1),
      )
    )
      tapado++;
    else {
      const u = huecos.at(-1);
      if (u !== undefined && u[1] >= x - 0.026) u[1] = Math.min(x1, x + 0.025);
      else huecos.push([Math.max(x0, x - 0.025), Math.min(x1, x + 0.025)]);
    }
  }
  return { cubierto: todo === 0 ? 1 : tapado / todo, huecos };
}

/**
 * Lo más estrecho que se abre de una cara que cedió a un puente, en casillas:
 * menos es una rendija entre dos paredes que ya casi se tocan.
 */
const HUECO_MINIMO = 0.15;

/** Lo más lejos de su pie, en casillas, que se apoya una pared: su ancla va 0,05 ± 0,06 por debajo. */
const HOLGURA_DEL_PIE = 0.25;

/** La hoja de laderas de una ladera: `laderas-<material>-<lado>-<caída>` (§20). Nunca se espeja. */
export function hojaDeLadera(l: Ladera): string {
  return `${materialDeCara(l.material).ladera}-${l.lado}-${caidaDeLadera(l.caida)}`;
}

/** Lo que la última frontal de una cara monta sobre la frontal de su esquina, en casillas. */
export const SOLAPE_DE_ESQUINA = 0.15;

/**
 * Por dónde corre la frontal de una cara, según cómo acaba cada extremo
 * (`topesDeCara`): sus módulos van de `desde` a `hasta`, y uno que pisa la
 * senda se corre entre `izq` y `der`.
 *
 * - En su esquina para donde empieza la frontal de la esquina, a
 *   `FRONTAL_DE_ESQUINA` del extremo, montando `SOLAPE_DE_ESQUINA` sobre ella,
 *   y no se corre más allá.
 * - Junto a la esquina del peldaño de al lado para como suelta, pero no se
 *   corre hacia ella: la esquina ya trae frontal y ladera que suben hasta aquí.
 * - Si la cara de al lado sigue, la frontal sigue media casilla por ella; suelta,
 *   para un poco antes del extremo.
 * - Corrida, hasta media casilla fuera del acantilado: un módulo de una cara de
 *   caída 2 mide más de una casilla de ancho, y así sigue montando sobre su
 *   cara. Tampoco más si la de al lado sigue: allí el pie inclinado ya pasa del
 *   de esa cara, y a una casilla quedaba otra entera bajo él (#150, N1).
 */
export function tramoDeFrontal(
  c: Cara,
  topes: { readonly oeste: Tope; readonly este: Tope },
): { readonly desde: number; readonly hasta: number; readonly izq: number; readonly der: number } {
  const desde = {
    esquina: c.x0 + FRONTAL_DE_ESQUINA - SOLAPE_DE_ESQUINA,
    'esquina-vecina': c.x0 + 0.2,
    sigue: c.x0 + 0.5,
    suelto: c.x0 + 0.2,
  }[topes.oeste];
  const hasta = {
    esquina: c.x1 + 1 - FRONTAL_DE_ESQUINA + SOLAPE_DE_ESQUINA,
    'esquina-vecina': c.x1 + 0.85,
    sigue: c.x1 + 1.5,
    suelto: c.x1 + 0.85,
  }[topes.este];
  const seCorre = (t: Tope) => t === 'sigue' || t === 'suelto';
  return {
    desde,
    hasta,
    izq: seCorre(topes.oeste) ? c.x0 - 0.5 : desde,
    der: seCorre(topes.este) ? c.x1 + 1.5 : hasta,
  };
}

/** Los módulos de una hoja de laderas por su papel en la cadena (§20). */
export interface JuegoDeLadera {
  readonly inicio: ModuloDeLadera;
  readonly fin: ModuloDeLadera;
  readonly esquina: ModuloDeLadera;
  /** Lo que va en medio, por nombre: los de una casilla y los de dos. */
  readonly medios: readonly ModuloDeLadera[];
  readonly largos: readonly ModuloDeLadera[];
}

/**
 * El juego de una hoja de laderas, por el papel que trae cada módulo en sus
 * juntas (`JuntasDeLadera.papel`, del índice de la hoja). Lanza si a un módulo
 * le faltan las juntas o a la hoja un papel.
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
    esquina: uno('esquina'),
    medios,
    largos: de('largo'),
  };
}

/** Un módulo de ladera en su sitio de la cadena: desde la casilla `y`, `largo` casillas hacia el sur. */
export interface PiezaDeLadera {
  readonly modulo: ModuloDeLadera;
  readonly y: number;
}

/** Las laderas por columna y lado (`x,lado`): las que pueden seguir a una de norte a sur. */
export function indiceDeLaderas(
  laderas: readonly Ladera[],
): ReadonlyMap<string, readonly Ladera[]> {
  const indice = new Map<string, Ladera[]>();
  for (const l of laderas) {
    const clave = `${l.x},${l.lado}`;
    const ya = indice.get(clave);
    if (ya === undefined) indice.set(clave, [l]);
    else ya.push(l);
  }
  return indice;
}

/**
 * Si una ladera remata al norte (`inicio`) y al sur (`fin`): donde no sigue
 * otra ladera de su columna y su lado (`indiceDeLaderas`). En un escalón de
 * caída remata la mayor y la menor sigue sin remate, tapada por ella; con la
 * misma caída (cambia el material) siguen las dos.
 */
export function rematesDeLadera(
  l: Ladera,
  porColumna: ReadonlyMap<string, readonly Ladera[]>,
): { readonly inicio: boolean; readonly fin: boolean } {
  const columna = porColumna.get(`${l.x},${l.lado}`) ?? [];
  const junto = (y: number) => columna.find((o) => o.y0 <= y && o.y1 >= y);
  const alNorte = junto(l.y0 - 1);
  const alSur = junto(l.y1 + 1);
  return {
    inicio: alNorte === undefined || alNorte.caida < l.caida,
    fin: alSur === undefined || alSur.caida < l.caida,
  };
}

/**
 * Qué módulos lleva una ladera, de norte a sur (§20):
 *
 * - `inicio` al norte si la cadena empieza ahí (`extremos.inicio`); `esquina`
 *   al sur si la tiene (`esquinas`) y, si no, `fin` cuando la cadena acaba ahí.
 *   En un escalón de caída rematan las dos puntas de la mayor; la menor sigue
 *   con un medio, y la mayor la tapa.
 * - En medio, al azar entre los `medios` y los `largos`, sin repetir el de al
 *   lado; uno solo si le caben sus casillas antes del remate.
 * - Con una sola casilla, la esquina gana al `fin` y el `fin` al `inicio`: el
 *   sur es lo que mira a la cámara.
 */
export function piezasDeLadera(
  l: Ladera,
  extremos: { readonly inicio: boolean; readonly fin: boolean; readonly esquina: boolean },
  juego: JuegoDeLadera,
  azar: () => number,
): PiezaDeLadera[] {
  const sur = extremos.esquina ? juego.esquina : extremos.fin ? juego.fin : null;
  const norte = extremos.inicio && (sur === null || l.y1 > l.y0) ? juego.inicio : null;
  const fuera: PiezaDeLadera[] = [];
  if (norte !== null) fuera.push({ modulo: norte, y: l.y0 });
  const hasta = sur === null ? l.y1 : l.y1 - 1;
  let anterior = norte;
  for (let y = norte === null ? l.y0 : l.y0 + 1; y <= hasta; ) {
    const caben = hasta - y + 1;
    const candidatos = [...juego.medios, ...juego.largos].filter(
      (m) => m !== anterior && m.ladera.largo <= caben,
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
 * deja sin laderas (QA de #156, H1); `laderasMalCubiertas` no lo veía, porque
 * cuenta por casilla de canto y son dos distintas. Mide desde lo puesto: el pie
 * de cada sprite de ladera (`juntasColocadas`) y las filas que cubre su filo.
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
    const fila = Math.round(filo[1]);
    for (let k = 0; k < m.modulo.ladera.largo; k++)
      alPie[lado].add(`${Math.floor(pie[0])},${fila + k}`);
  }
  return [...alPie.este]
    .filter((c) => alPie.oeste.has(c))
    .map((c) => `${c}: laderas de los dos lados al pie`);
}

/** Lo que se tolera entre dónde quedó una junta de ladera y dónde debía, en casillas. */
const HOLGURA_DE_JUNTA = 0.02;

/**
 * Las casillas de ladera mal cubiertas, cada una con lo que le pasa. Cada
 * casilla de cada ladera lleva exactamente una cosa: un módulo de ladera, los
 * peñascos del canto, o nada si ahí no cabe ninguna ladera (`cabe`). Se
 * reconstruye desde lo puesto, por la geometría de cada sprite (dónde quedaron
 * sus juntas, `juntasColocadas`), no por lo que `componer` apuntó al ponerlo:
 *
 * - una ladera fuera de sitio: su filo fuera del borde de una fila de una ladera
 *   de su hoja (lado, caída y material), o su pie fuera del de esa ladera;
 * - una casilla con dos laderas (un módulo corrido sobre el de al lado) o con
 *   ladera y peñascos (que van solo donde no quedó ladera);
 * - un hueco: una casilla sin ladera donde cabía uno de sus `medio`.
 *
 * `modulos` dice qué sprites son laderas: los módulos de las hojas de laderas
 * por su `src`. Sin arte no hay ninguno, y no se mide.
 */
export function laderasMalCubiertas(
  sprites: readonly Sprite[],
  laderas: readonly Ladera[],
  modulos: ReadonlyMap<string, { readonly modulo: ModuloDeLadera; readonly hoja: string }>,
  cabe: (l: Ladera, fila: number) => boolean,
): string[] {
  const porColumna = indiceDeLaderas(laderas);
  const hojaDe = new Map(laderas.map((l) => [l, hojaDeLadera(l)]));
  const casilla = (x: number, y: number, lado: string) => `${x},${y},${lado}`;
  const conLadera = new Map<string, number>();
  const mal: string[] = [];
  for (const s of sprites) {
    const m = s.src === null ? undefined : modulos.get(s.src);
    if (m === undefined) continue;
    const { filo, pie } = juntasColocadas(m.modulo, s);
    const fila = Math.round(filo[1]);
    const ultima = fila + m.modulo.ladera.largo - 1;
    const suya = (['este', 'oeste'] as const)
      .flatMap(
        (lado) =>
          porColumna.get(`${Math.round(filo[0]) - (lado === 'este' ? 1 : 0)},${lado}`) ?? [],
      )
      .find((l) => hojaDe.get(l) === m.hoja && l.y0 <= fila && ultima <= l.y1);
    if (
      suya === undefined ||
      Math.abs(filo[0] - bordeDeLadera(suya)) > HOLGURA_DE_JUNTA ||
      Math.abs(filo[1] - fila) > HOLGURA_DE_JUNTA ||
      Math.abs(pie[1] - pieDeLadera(suya, ultima)[1]) > HOLGURA_DE_JUNTA
    ) {
      mal.push(
        `${s.src} con el filo en ${filo[0].toFixed(2)},${filo[1].toFixed(2)}: fuera de toda ladera de su hoja`,
      );
      continue;
    }
    for (let y = fila; y <= ultima; y++) {
      const c = casilla(suya.x, y, suya.lado);
      conLadera.set(c, (conLadera.get(c) ?? 0) + 1);
    }
  }
  // Un peñasco del canto se apoya justo fuera del filo (x + 1,05 al este,
  // x − 0,05 al oeste) y entre 0,3 y 1 por debajo del borde de arriba de su fila.
  const conPeñascos = new Set<string>();
  for (const s of sprites) {
    if (s.clase !== 'roca' || s.src?.includes('/rocas-caidas/') !== true) continue;
    const fila = Math.floor(s.y - 0.3);
    for (const [lado, x] of [
      ['este', s.x - 1.05],
      ['oeste', s.x + 0.05],
    ] as const)
      if (Math.abs(x - Math.round(x)) < 1e-9) conPeñascos.add(casilla(Math.round(x), fila, lado));
  }
  for (const l of laderas)
    for (let y = l.y0; y <= l.y1; y++) {
      const c = casilla(l.x, y, l.lado);
      const n = conLadera.get(c) ?? 0;
      if (n > 1) mal.push(`${c}: ${n} laderas`);
      else if (n === 1 && conPeñascos.has(c)) mal.push(`${c}: ladera y peñascos`);
      else if (n === 0 && cabe(l, y)) mal.push(`${c}: hueco, y cabía una ladera`);
    }
  return mal;
}

/**
 * Las paredes de acantilado que no se apoyan en el pie de ninguna cara, y los
 * peñascos de su pedregal que caen fuera de toda banda. No filtra nada: mide lo
 * que dejó `ponerPared`. Las laderas las mide `laderasMalCubiertas`.
 *
 * - Un módulo, con su ancla a menos de `HOLGURA_DEL_PIE` del pie de una cara
 *   (`pieDeCara`, inclinado en la escalera) hasta media casilla más allá de
 *   ella, que es lo que se corre; o del pie recto sobre la cara, que es donde va
 *   el canto de un tajo. Una pared corrida con la `y` de su sitio daba 39 en las
 *   semillas 1-10, de pie en el río (#150, N1).
 * - Un peñasco, en la banda de una cara (con lo que el remate del tajo se sale
 *   de ella) y como mucho esa holgura bajo su pie.
 *
 * Sin arte (`src` nulo) no se sabe cuál es cuál y no se mide.
 */
export function paredesFueraDelPie(sprites: readonly Sprite[], caras: readonly Cara[]): Sprite[] {
  const pies = caras.map((c) => ({ c, ...pieDeCara(c, caras) }));
  const enLaBanda = (s: Sprite) =>
    pies.some(
      ({ c, pie }) =>
        s.x >= c.x0 - 0.15 && s.x <= c.x1 + 1.15 && s.y >= c.y + 1 && s.y <= pie + HOLGURA_DEL_PIE,
    );
  const enElPie = (s: Sprite) =>
    pies.some(({ c, pie, en }) => {
      const y = s.y - 0.05;
      if (s.x >= c.x0 - 0.05 && s.x <= c.x1 + 1.05 && Math.abs(y - pie) <= HOLGURA_DEL_PIE)
        return true;
      return s.x >= c.x0 - 0.55 && s.x <= c.x1 + 1.55 && Math.abs(y - en(s.x)) <= HOLGURA_DEL_PIE;
    });
  return sprites.filter((s) => {
    if (s.clase !== 'pared' || s.src === null || s.src.includes('/laderas-')) return false;
    return s.src.includes('/rocas-caidas/') ? !enLaBanda(s) : !enElPie(s);
  });
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
