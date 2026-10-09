/**
 * Las reglas del escenógrafo: de un mapa del juego, una escena para pintar.
 *
 * Nada aquí es un objeto suelto por casilla. Cada franja de barrera se viste
 * como una FORMACIÓN —un bosque son cientos de árboles apretados, más altos
 * hacia dentro; una cordillera, cientos de picos que crecen hacia el centro;
 * una muralla, un lienzo seguido de puerta a barrera, con torres espaciadas
 * (`muralla.ts`)— y el suelo se cubre de detalle para que no quede desnudo. Las
 * alturas (`relieve.ts`) ponen mesetas, barrancos y caras de roca.
 *
 * Es puro salvo por leer los índices de los módulos y las medidas de las piezas
 * del disco; la escena es un JSON que pinta `pintor.ts`.
 */
import type { MapObject, TramoDeCamino } from '@core/map/map.js';
import { type Barrera, esBarrera, type Suelo, type TerrainKind } from '@core/map/terrain.js';
import { type Analisis, analizar, type Franja, type MapaDeEscena } from './analizar.js';
import {
  caraDeOtroMaterial,
  cimaDeOtroMaterial,
  esPiezaDelRelieve,
  espaldaConReborde,
  espaldasSinReborde,
  materialDeLaCima,
  paredesTapadasPorLaMasa,
  sueloDeLaMeseta,
  sueloQueSePinta,
} from './bordes.js';
import {
  altoDeLaSilueta,
  bajoLaSilueta,
  carasCortadas,
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
  esHojaDeRampa,
  type Modulo,
  type ModuloDeBajada,
  type ModuloDeDiagonal,
  type ModuloDeLadera,
  type ModuloDeRampa,
  moduloDeLadera,
  type PapelDeLadera,
  PIEZAS_DE_RAMPA,
  type Pieza,
  type PiezaDeRampa,
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
  celdasDeLaRampa,
  claveDeCelda,
  enSuRampa,
  esVisto,
  filosDe,
  JUNTAS,
  pieDeJunta,
  type Rampa,
  rampaDe,
  rampasDeFrente,
  rampasDesviadas,
  rebordesDe,
  sendasPorLasRampas,
  TRAMO_DE_PIEZA_DE_RAMPA,
  taludDeBajada as taludDeBajadaDe,
} from './celdas.js';
import { azarDe, esparcir } from './esparcir.js';
import { ejeDe } from './esqueleto.js';
import { pisablesTapadas } from './figuras.js';
import { seHornea } from './horneado.js';
import {
  altoMaximoDe,
  MAS_CUMBRES,
  type MaterialDePico,
  macizoDe,
  materialDeLosMacizos,
  materialDePico,
  PASO_DE_LOS_GRUPOS,
  PASO_DEL_RUIDO,
} from './macizo.js';
import {
  type Alrededor,
  CIUDAD,
  murallaSinLeer,
  murallaSobreLaSenda,
  type PuertaDeMuralla,
  type TramoPintado,
  torresDe,
  torresObligadas,
  trazaDeMuralla,
} from './muralla.js';
import {
  ejeDelPaso,
  esHito,
  type PasoALaVista,
  pasaElCamino,
  pasosALaVista,
  piezaDeNodo,
  SEMIANCHO_DE_LA_TROCHA,
  trochasDeLosPasos,
  varianteDeId,
} from './nodos.js';
import {
  type Caja,
  type ConImagen,
  cajaDeSprite,
  type Forma,
  type Medida,
  Obstaculos,
  pasilloDe,
} from './pasillo.js';
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
  bordeDeLadera,
  CARA_DE_SUELO,
  type Cara,
  type CaraDeEscena,
  caidaDeLadera,
  desnivelesSinBarrera,
  type Ladera,
  nivelFueraDeSuRegion,
  nodoEntreNiveles,
  pieDeLadera,
  relieve,
} from './relieve.js';
import {
  ANCHO_DE_SENDA,
  apartarDeLoQueTapa,
  SEMIANCHO_DE_LA_HUELLA,
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
  /**
   * En una pieza del relieve (frontal, ladera, diagonal o bajada), la fila de
   * la casilla alta de la que cuelga. Lo que se pisa en esa fila o más al sur
   * está delante de ella aunque su pie quede más abajo (#185,
   * `delanteDeLasParedes`): el mapa no levanta lo alto.
   */
  readonly filaAlta?: number;
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
  /** El suelo que se pinta en cada casilla: en una barrera, el de su meseta (`sueloQueSePinta`, #217). */
  readonly suelo: readonly Suelo[];
  readonly nivel: readonly number[];
  readonly agua: readonly number[];
  readonly relieve: {
    /** Las caídas al sur con lo que se pinta de ellas (`pintada`): donde no hay pared, no se pinta. */
    readonly caras: readonly CaraDeEscena[];
    /** Las casillas de las caídas al este y al oeste (`cantosDe`). El pintor ya no las lee: la sombra del desnivel es `sombraAlPie` (#211). */
    readonly cantos: readonly (readonly [number, number, 'este' | 'oeste'])[];
    /** Las casillas más altas que la de su norte: el reborde de lo que cae de espaldas (`rebordesDe`). */
    readonly rebordes: readonly (readonly [number, number])[];
    /**
     * Las paredes que se ven, una por celda de vértice y grupo de umbrales
     * (`celdas.ts`, R4), sin las que cruza un puente ni las que abre una rampa.
     * Lo que mide el informe (`celdasMalCubiertas`) y lo que guarda una marca.
     */
    readonly celdas: readonly Celda[];
    /**
     * Por dónde bajan las sendas hacia la cámara o de lado: una pieza encima de
     * la pared cada una (R5), o la rampa que la abre (`deUnaRampa`, #225).
     */
    readonly bajadas: readonly Bajada[];
    /** Las rampas que abren la pared (#225, `rampasDeFrente`): cuerpo y dos costados cada una. */
    readonly rampas: readonly Rampa[];
  };
  readonly altoDeNivel: number;
  readonly caminos: readonly (readonly [number, number, number, number])[];
  /** Los caminos encadenados y suavizados: lo que se pinta. Acaban en los estribos de los puentes. */
  readonly sendas: readonly Senda[];
  /**
   * Las trochas de los pasos sin camino de bosque, montaña y acantilado
   * (`trochasDeLosPasos`, #190): solo se pintan, no apartan nada.
   */
  readonly trochas: readonly Senda[];
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
    /**
     * Lo que de la muralla no cierra, sobre lo pintado (`murallaSinLeer`):
     * franjas por las que se rodea, puertas sin muralla a un lado y trozos de
     * más de una línea partida.
     */
    readonly murallasPartidas: number;
    /**
     * Lo que de la muralla no se lee como una muralla (#197): puntas de una
     * franja de frontera que no llegan a nada (espolones), juntas de dos ejes
     * sin torre y puntas de norte a sur sin torre (raíles). Tiene que ser 0.
     */
    readonly murallaIncoherente: number;
    readonly muralla: {
      readonly fugas: readonly (readonly [number, number])[];
      readonly puertasSueltas: readonly string[];
      readonly huecos: number;
      readonly espolones: readonly (readonly [number, number])[];
      readonly esquinasAbiertas: readonly (readonly [number, number])[];
      readonly puntasSinTorre: readonly (readonly [number, number])[];
      readonly torresApiladas: readonly (readonly [number, number])[];
    };
    /**
     * Torres de muralla pintadas a una casilla o menos de otra, o en la misma
     * columna a dos o menos (`apiladas`, `seApilan`): se leen como una torre
     * gorda o una chimenea, no como dos esquinas. Tiene que ser 0 en 1-40.
     */
    readonly torresApiladas: number;
    /**
     * Torres y tramos de muralla sobre la senda (`murallaSobreLaSenda`): una
     * torre que la tapa o un tramo que la cruza fuera de su puerta. Tiene que
     * ser 0 (#193).
     */
    readonly murallaSobreSenda: number;
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
     * Bajadas cuya rampa se aparta de la senda pintada (`rampasDesviadas`): la
     * senda pasa por ella y sigue desde su pie (#192). Tiene que ser 0.
     */
    readonly rampasDesviadas: number;
    /**
     * Rampas sin su cuerpo y sus dos costados en su sitio, o con una frontal
     * sobre el hueco (`rampasSinSusPiezas`, #225): tiene que ser 0.
     */
    readonly rampasSinSusPiezas: number;
    /**
     * Nodos entre dos niveles sin camino ni la rampa de su bajada, salvo los
     * que bajan al norte, de espaldas a la cámara (`nodosSinRampa`, #143):
     * tiene que ser 0.
     */
    readonly nodosSinRampa: number;
    /**
     * Tramos de senda pintada de al menos `SENDA_CORTADA` casillas bajo la
     * silueta de una frontal, una ladera o una diagonal (`sendaBajoElRelieve`,
     * #189): la senda desaparece bajo el relieve. No es 0: el trazado del
     * núcleo lo evita donde puede (`recargosDelTrazado`, vestir.ts), pero un
     * pasillo de una casilla al pie de un desnivel no deja otro sitio.
     */
    readonly sendaBajoElRelieve: number;
    /**
     * Casillas altas de la espalda de una meseta (más altas que la de su norte,
     * que se pisan o son de acantilado y no caen bajo un objeto) sin una roca,
     * pared o masa en su mitad norte (`espaldasSinReborde`, #212): el borde que
     * no dice nada y la elevación que acaba de repente. Tiene que ser 0.
     */
    readonly espaldasSinReborde: number;
    /**
     * Picos de lo alto de un acantilado de otra roca que la de su cara
     * (`cimaDeOtroMaterial`, #212): gris sobre arenisca. Tiene que ser 0.
     */
    readonly cimaDeOtroMaterial: number;
    /**
     * Paredes del desnivel (frontal, ladera, diagonal) con algo de su silueta
     * bajo una masa que se pinta después (`paredesTapadasPorLaMasa`, #216): la
     * pared que asomaba a trozos entre los picos de la cordillera. Tiene que
     * ser 0.
     */
    readonly paredesTapadas: number;
    /**
     * Paredes del desnivel de otra roca que su meseta (`caraDeOtroMaterial`,
     * #216): la meseta de arena que acababa en una pared gris, la del suelo de
     * abajo (806 de 2 506 en 1-40). Tiene que ser 0.
     */
    readonly caraDeOtroMaterial: number;
    /**
     * Mesas de arenisca (`esMesa`) en una cordillera (#212): la montaña de arena
     * que se leía como un acantilado. Tiene que ser 0.
     */
    readonly mesasEnLaCordillera: number;
    /**
     * Trozos de cara de acantilado que se pintan y no tapa la silueta de
     * ninguna pared, de al menos 0,3 de ancho y de alto (`carasLisas`): tiene
     * que ser 0.
     */
    readonly carasLisas: number;
    /**
     * Tiradas de frontal de no más de `CABO_SUELTO` casillas con una punta que
     * acaba en el llano junto a un objeto (`carasCortadas`, #221): el bloque
     * suelto de columnas a los lados de una ciudad o una mina al pie de la
     * meseta. En 1-200, 72 → 18; en 1-40, 13 → 4 (09-10-2026). Quedan la
     * muesca de una casilla de una ciudad entre dos niveles con el camino de su
     * puerta por ella y el hueco entre la pared y el tablero de un puente.
     */
    readonly carasCortadas: number;
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
     * Nodos de paso de montaña o de bosque cuya propia pieza, la que no es un
     * hito, pisa su eje (`pasosAtravesados`, #203): tiene que ser 0.
     */
    readonly pasosAtravesados: number;
    /**
     * Minas y pueblos a los que la senda pintada no llega por un solo tramo
     * desde su puerta, la casilla de debajo (`sendasPorObjeto`, #188): tiene
     * que ser 0 en el procedimental. Un plan del agente puede cruzarlos.
     */
    readonly sendasPorObjeto: number;
    /**
     * Trochas (`trochasDeLosPasos`) cuyo arcén (`SEMIANCHO_DE_LA_TROCHA`) pisa
     * el rectángulo de algo que se aparta del camino, volumen o no
     * (`trochasTapadas`): tiene que ser 0.
     */
    readonly trochasTapadas: number;
    /**
     * Sendas que salen de un estribo y pasan por agua pintada en sus primeras
     * casillas, sin vado que la quite (`sendasDeEstriboEnAgua`): tiene que ser 0.
     */
    readonly sendasDeEstriboEnAgua: number;
    /**
     * Casillas que se pisan a otro nivel que el de su región
     * (`nivelFueraDeSuRegion`, #143): tiene que ser 0.
     */
    readonly nivelFueraDeSuRegion: number;
    /**
     * Casillas vecinas que se pisan a distinto nivel sin barrera en medio ni
     * ser la rampa de un nodo (`desnivelesSinBarrera`, #143): tiene que ser 0.
     */
    readonly desnivelesSinBarrera: number;
    /**
     * Casillas que se pisan cuya figura tapan en más de un cuarto las piezas
     * del relieve que se pintan después de ella, contado desde el orden del
     * pintor con la clave que le da `delanteDeLasParedes` (`pisablesTapadas`,
     * #185): tiene que ser 0.
     */
    readonly pisablesTapadas: number;
    /**
     * Piezas de la cubierta de lo que se pisa en la lava, la arena, la ciénaga
     * o lo áspero más altas que lo que les deja su esbeltez, más regiones de
     * esos suelos con la cubierta más densa que `HUELLA_DE_LO_PISABLE`
     * (`cubiertaComoLaBarrera`, #184): tiene que ser 0.
     */
    readonly cubiertaComoLaBarrera: number;
    /**
     * Piezas de cubierta que no son del suelo que se pinta donde tienen el pie
     * (`cubiertaDeOtroNivel`, #220): la cubierta de la región baja en lo alto de
     * un acantilado o en un nodo que va al alto. Tiene que ser 0.
     */
    readonly cubiertaDeOtroNivel: number;
    /**
     * Casillas de acantilado sin roca ni masa de `ALTO_DE_LO_ALTO` o más con el
     * pie en ellas (`acantiladosLisos`, #205): lo alto que se lee como suelo.
     */
    readonly acantiladosLisos: number;
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
 * Lo que tiene que levantar la roca de una casilla de acantilado para que lo
 * alto no se lea como suelo (#205), en casillas: el umbral de la auditoría 4
 * (0,35) con algo de holgura. La cubierta rala de lo que se pisa en la arena
 * o la lava no pasa de 0,3 tumbada; la de la nieve o la hierba, de 0,7, pero
 * es cubierta y no cuenta (`esDeLoAlto`).
 */
export const ALTO_DE_LO_ALTO = 0.4;

/**
 * El alto del pico que se pone en la casilla de acantilado que no tiene
 * ninguno, hasta 1,35 veces; en una casilla de dentro de la meseta (sus cuatro
 * vecinas son acantilado), `ALTO_EN_LO_ANCHO` veces más: es la que más se lee
 * como un llano.
 */
const ALTO_DE_LA_CIMA = 0.55;
const ALTO_EN_LO_ANCHO = 1.3;

/**
 * Cuántos picos de lo alto lleva una casilla de acantilado según cuántas de
 * sus cuatro vecinas son acantilado: uno en una cresta de una casilla, dos en
 * el borde de una meseta y tres dentro, que con uno solo seguía viéndose la
 * nieve entre ellos como un llano (s443 (15, 10)).
 */
const picosDeLaCima = (vecinas: number): number => Math.min(3, Math.max(1, vecinas - 1));

/** Lo menos que se apartan, en casillas, dos picos puestos en la misma casilla. */
const SEPARACION_EN_LA_CIMA = 0.45;

/** Si `s` es roca o masa de `ALTO_DE_LO_ALTO` o más: lo que marca una casilla como barrera. */
const esDeLoAlto = (s: Pick<Sprite, 'clase' | 'alto'>): boolean =>
  (s.clase === 'roca' || s.clase === 'masa') && s.alto >= ALTO_DE_LO_ALTO;

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

/**
 * Lo más ancho, entre alto, que es una aguja de arenisca: más ancha es una mesa
 * de cantos a plomo y techo plano (los módulos 1, 3, 6, 8, 9, 10, 13 y 16 de
 * `picos-arenisca`, de 1,37 a 2,49; las agujas van de 0,70 a 1,21). La mesa es
 * de lo alto de un acantilado, no de una cordillera: la montaña de arena salía
 * con las mismas caras que el cantil y se leía como una meseta sin desnivel
 * ninguno (s57 (15-18, 10-19), auditoría 5, defecto 5).
 */
export const ANCHO_DE_MESA = 1.3;

/** Si el módulo `m` de `hoja` es una mesa (`ANCHO_DE_MESA`): solo la arenisca las tiene. */
export const esMesa = (hoja: string, m: Pick<Modulo, 'nw' | 'nh'>): boolean =>
  hoja === 'picos-arenisca' && m.nw / m.nh > ANCHO_DE_MESA;

/**
 * Los sitios del reborde de una espalda (`hileraDelReborde`) cuando la hilera
 * no cupo: por todo el canto norte, de dentro afuera, relativos a la esquina de
 * la casilla. Con su alto, `ALTO_DEL_REBORDE_MENOR`, un peñasco bajo cabe entre
 * una senda que corre por el canto y la casilla de al lado.
 */
const SITIOS_DEL_REBORDE: readonly (readonly [number, number])[] = [
  [0.5, 0.1],
  [0.3, 0.1],
  [0.7, 0.1],
  [0.1, 0.1],
  [0.9, 0.1],
  [0.5, 0.4],
  [0.2, 0.4],
  [0.8, 0.4],
];
/** El alto de los peñascos de `SITIOS_DEL_REBORDE`: el de los más bajos de la hilera. */
const ALTO_DEL_REBORDE_MENOR = 0.25;

/**
 * El canto de la espalda (#219, `cantoDeLaEspalda`): `porCasilla` peñascos por
 * casilla de reborde, repartidos a lo largo del filo con `vaiven` de holgura,
 * el pie a `hondo` del lado norte de la casilla (más `vaiven`) y de `alto` a
 * `alto + masAlto` casillas. A 0,25 de paso y con la pieza más ancha que alta,
 * se solapan y el filo es una línea seguida de roca.
 */
export const CANTO_DE_LA_ESPALDA = {
  porCasilla: 4,
  vaiven: 0.06,
  hondo: 0.04,
  alto: 0.42,
  masAlto: 0.16,
} as const;

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

/**
 * Lo cerca, en casillas, a la que dos picos de la misma hoja no llevan el mismo
 * módulo si hay otro que llegue a su alto (#204). Es el ancho de un pico
 * mediano: más lejos ya no se leen como el mismo sello.
 */
export const VECINO_IGUAL = 1.2;

/** Una cumbre de un macizo (`Macizo.cumbres`) con la hoja, el módulo y el alto con que se pone. */
interface CumbrePuesta {
  readonly x: number;
  readonly y: number;
  readonly hoja: string;
  readonly alto: number;
  readonly tono: string;
  readonly nombre?: string;
  /** Ancho entre alto del módulo: lo que ocupa a los lados. */
  readonly ancho?: number;
}

/**
 * Lo que se deja sin dardos alrededor del pie de una cumbre, en veces su
 * ancho a los lados y su alto hacia atrás, y en casillas hacia delante: lo de
 * detrás quedaría tapado, y lo de delante y los lados le comería el cuerpo.
 * La falda (`FALDA_DE_CUMBRE`) empieza donde acaba esto.
 */
const LIBRE_DE_CUMBRE = { lados: 0.4, atras: 0.7, delante: 1.0 } as const;

/** Si `(x, y)` cae en lo que se deja libre alrededor del pie de la cumbre `c` (`LIBRE_DE_CUMBRE`). */
function bajoLaCumbre(c: CumbrePuesta, x: number, y: number): boolean {
  const rx = LIBRE_DE_CUMBRE.lados * c.alto * (c.ancho ?? 1);
  const ry = y < c.y ? LIBRE_DE_CUMBRE.atras * c.alto : LIBRE_DE_CUMBRE.delante;
  return ((x - c.x) / rx) ** 2 + ((y - c.y) / ry) ** 2 < 1;
}

/**
 * Los peñascos de un claro de la falda (`Macizo.claro`, #218), alrededor del
 * pico bajo del relleno: el suelo asoma entre piedras.
 */
const PEÑASCOS_DEL_CLARO = 2;

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

/**
 * Cuánto se abre el radio de la cubierta de un suelo `comoLaBarrera` en lo que
 * se pisa, dentro y fuera de las manchas: entre las piezas se ve el suelo.
 */
const CLARO_COMO_LA_BARRERA = 2.2;

/**
 * En lo que se pisa de un suelo `comoLaBarrera`, una pieza más esbelta que esto
 * (ancho entre alto de su módulo) se encoge hasta tenerlo: la aguja, la columna
 * de basalto, el volcancillo humeante o el pináculo de arenisca se quedan en un
 * guijarro, y el peñasco tumbado sigue como es. Las piezas esbeltas son las de
 * la barrera; tumbadas, se leen como suelo.
 */
const ESBELTEZ_DE_LO_PISABLE = 1.3;

/**
 * `s` encogido hasta que su módulo, a lo ancho entre lo alto, no sea más
 * esbelto que `esbeltez`: un módulo el doble de alto que ancho de lo que manda
 * se pinta a la mitad. Sin `esbeltez`, o sin imagen, tal cual.
 */
export function tumbado<S extends Pick<Sprite, 'src' | 'nw' | 'nh' | 'alto'>>(
  s: S,
  esbeltez: number | undefined,
): S {
  if (esbeltez === undefined || s.src === null) return s;
  const k = Math.min(1, s.nw / s.nh / esbeltez);
  return k === 1 ? s : { ...s, alto: s.alto * k };
}

function hojaDeCubierta(s: Suelo, tirada: number): string {
  let acumulado = 0;
  for (const [otro, peso] of MEZCLA[s]) {
    acumulado += peso;
    if (tirada < acumulado) return `cubierta-${otro}`;
  }
  return `cubierta-${s}`;
}

/**
 * La cubierta de cada suelo: radio entre detalles y alto, en casillas, y cuánto
 * se abre el radio fuera de las manchas (`claro`).
 *
 * `comoLaBarrera`: la cubierta es de la misma roca o madera que la barrera de al
 * lado —los peñascos de la lava son los de su acantilado y su volcán; los
 * bloques de la arena, los de la meseta; los árboles muertos de la ciénaga, los
 * del bosque—. Ahí lo que se pisa no se leía como pisable (#184, auditoría 3
 * §2.2): con la misma densidad y las mismas piezas, la lava de s28 y la ciénaga
 * de s9 eran barrera a la vista. En esos suelos la cubierta de lo que se pisa
 * es baja (`ESBELTEZ_DE_LO_PISABLE`), rala, sin manchas densas ni árboles; lo
 * alto queda para lo alto del acantilado y el pie de la muralla.
 */
const CUBIERTA: Readonly<
  Record<Suelo, { radio: number; alto: number; claro: number; comoLaBarrera: boolean }>
> = {
  grass: { radio: 0.24, alto: 0.42, claro: 2.1, comoLaBarrera: false },
  dirt: { radio: 0.3, alto: 0.5, claro: 1.3, comoLaBarrera: false },
  sand: { radio: 0.28, alto: 0.4, claro: CLARO_COMO_LA_BARRERA, comoLaBarrera: true },
  snow: { radio: 0.26, alto: 0.44, claro: 1.3, comoLaBarrera: false },
  swamp: { radio: 0.24, alto: 0.42, claro: CLARO_COMO_LA_BARRERA, comoLaBarrera: true },
  lava: { radio: 0.27, alto: 0.4, claro: CLARO_COMO_LA_BARRERA, comoLaBarrera: true },
  rough: { radio: 0.25, alto: 0.38, claro: CLARO_COMO_LA_BARRERA, comoLaBarrera: true },
};

/**
 * Los árboles que la cubierta de lo que se pisa siembra en la mancha de cada
 * suelo; el de tierra, solo junto a un bosque de frontera. Los demás suelos no
 * llevan: en uno `comoLaBarrera` eran el bosque de al lado.
 */
const ARBOLES_DEL_SUELO = {
  grass: ['pinos', 'frondosos'],
  dirt: ['pinos', 'frondosos'],
  snow: ['abetos-nevados'],
} as const satisfies Partial<Record<Suelo, readonly string[]>>;

/** Las hojas de la cubierta del suelo `s`: las de su mezcla (`MEZCLA`) y sus árboles. */
function hojasDeLaCubierta(s: Suelo): ReadonlySet<string> {
  return new Set([
    ...MEZCLA[s].map(([otro]) => `cubierta-${otro}`),
    ...((ARBOLES_DEL_SUELO as Partial<Record<Suelo, readonly string[]>>)[s] ?? []),
  ]);
}

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
 * 60 y 7 (más fría aún); con este, 53 y 15. La frontal de basalto daba 71 y 20 (hoy
 * con su tono, 51 y 16), y el suelo de ceniza, 42 y 18 (`tono-basalto.mts` en
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
  // La frontal de basalto, sin tono, daba luz 71 y R−B 20 entre laderas de 54 y
  // 14 y diagonales de 48-52 y 18-19: el borde de una meseta de lava alternaba
  // columnas pálidas y paredes casi negras, a trozos (#220, auditoría 7 §3). Con
  // esto, 51 y 50, y 16 (las piezas que pone la escena en s9 y s13, 09-10-2026). Con
  // `BASALTO_DE_LADERA`, 59: su sepia aclara las columnas, que ya son cálidas.
  'paredes-basalto': 'brightness(0.72) saturate(1.15)',
  // Las laderas (§20), por familia —todas sus caídas—, medidas contra su
  // frontal entonada (07-10-2026, `docs/agents/2026-10-06-paredes-laterales/
  // tono-laderas.mts`). La arenisca del oeste, de cara a la luz, sale más clara
  // y naranja (luz 86 contra 69): con CHILLONA queda en la de su frontal.
  'laderas-arenisca-oeste': CHILLONA,
  'laderas-basalto-este': BASALTO_DE_LADERA,
  'laderas-basalto-oeste': BASALTO_DE_LADERA,
  // Las diagonales y bajadas de basalto (§23) tomaron de referencia la ladera sin
  // entonar y salían, junto a ella, como derrubio gris claro y frío sobre la
  // ceniza (s28, s36). Con su filtro, las diagonales pasan de luz 52-63 y R−B
  // 10-18 a 46-53 y 13-20, en la de sus laderas (52-59, 15-17); las bajadas, de
  // 71-73 y 26 a 59-61 y 25. La frontal daba 72 y 20 (hoy con su tono, 51 y 16)
  // (08-10-2026, `docs/agents/2026-10-08-arte-relieve-2/`).
  'diagonales-basalto-se': BASALTO_DE_LADERA,
  'diagonales-basalto-so': BASALTO_DE_LADERA,
  'bajadas-basalto': BASALTO_DE_LADERA,
  // Las rampas (#225, §35), como la frontal de su material, con la que casan por
  // los dos lados. La arenisca salió con la luz de la frontal sin entonar (84
  // contra 84, el tercio de fuera del costado) pero menos roja (R−B 66 contra 80):
  // el brillo de la frontal y la mitad de su desaturado. La
  // roca salió ya más oscura que la suya (73 contra 107, 77 entonada): solo su
  // desaturado (09-10-2026).
  'rampa-arenisca': 'brightness(0.8) saturate(0.85)',
  'rampa-roca': 'saturate(0.85)',
};

/** El tono de una hoja: el suyo o, en una hoja del relieve, el de su familia (sin la caída). */
function tonoDe(hoja: string): string | undefined {
  return (
    TONO[hoja] ??
    (/^(laderas|diagonales|bajadas|rampa)-/.test(hoja)
      ? TONO[hoja.replace(/-[123]$/, '')]
      : undefined)
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

/**
 * Un suelo por material de cara: el que da esa roca a las hojas de picos y al
 * pedregal (`sueloDeLaRoca`). Lo inverso de `CARA_DE_SUELO`, que da la roca a
 * cuatro suelos; con uno basta.
 */
const SUELO_DE_LA_ROCA: Readonly<Record<string, Suelo>> = {
  'cara-roca': 'dirt',
  'cara-arenisca': 'sand',
  'cara-basalto': 'lava',
  'cara-nevada': 'snow',
};

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

/**
 * La puerta de una muralla de norte a sur (§29): una casa de puerta entre dos
 * torres que se aleja de la cámara, con el arco abierto al este. A 2,6 casillas
 * de alto, la torre de delante llega a la casilla al sur del nodo y la de detrás
 * a la del norte, y la torre mide lo que la de la hoja `muro` (0,5 de ancho). Su
 * arco apoya en el 62,5 % de la pieza desde arriba (medido sobre
 * `nodo-puerta-hondo.webp`, 960 de 1536 px). Por el ancho, como la de este a
 * oeste, medía 3,9 casillas de alto.
 */
const PUERTA_NORTE_SUR = { alto: 2.6, pieDelArco: 0.625 } as const;

/** Las piezas del tramo de muralla de norte a sur (§29), de lado. */
const TRAMOS_NORTE_SUR = ['muro-ns-1', 'muro-ns-2'] as const;

/**
 * Lo alto del tramo de norte a sur, en casillas. Su adarve ocupa dos tercios de
 * la pieza y el muro que se ve de frente, el tercio de abajo: a 1,6 el adarve
 * cubre 1,07 casillas, lo que va de un centro al siguiente con algo de solape, y
 * el muro queda a 0,5 de alto, el del tramo de este a oeste con sus almenas.
 */
const ALTO_DEL_TRAMO_NORTE_SUR = 1.6;

/**
 * Lo más que se encoge la torre de una casilla de muralla sin tramos para no
 * tapar la senda que la rodea (#193), en veces su alto.
 */
const TORRE_MAS_BAJA = 0.45;

/**
 * Dónde se prueba, dentro de su casilla, la torre suelta que ni encogida a
 * `TORRE_MAS_BAJA` deja libre la senda: primero en su sitio, luego con el pie
 * más abajo (la torre sube desde él) y luego a los lados, en casillas. El pie
 * no pasa de 0,95: sigue en su casilla.
 */
const CORRIMIENTOS_DE_TORRE: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 0.1],
  [0, 0.2],
  [-0.2, 0],
  [0.2, 0],
  [-0.2, 0.2],
  [0.2, 0.2],
];

const MARCADOR: Readonly<Record<string, string>> = {
  forest: '#1f3a22',
  mountain: '#6e6a74',
  wall: '#6d6656',
  cliff: '#7a5a3a',
  water: '#2a4a6a',
  cubierta: '#4f5a35',
};

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

/**
 * El miliario es una columna de piedra clara y lisa: en un llano oscuro tiraba
 * de la vista más que nada de alrededor (auditoría 3, defecto 6). Sin filtro da
 * luz 134, p90 216 y desviación 61; con este, 101, 151 y 37, en la de la
 * tablilla (97, 176 y 50) y por debajo del mojón (124, 223 y 68), que es un
 * montón de piedras con sombra entre ellas (08-10-2026, `tono.py` en
 * `docs/agents/2026-10-08-detalles-mapa/`).
 */
const TONO_DE_HITO: Readonly<Record<string, string>> = {
  'nodo-hito-miliar': 'brightness(0.72) contrast(0.85) saturate(0.9)',
};

/** El radio de la reserva de cada clase de objeto (`reservaDe`), en casillas. */
export const RADIO_DE_OBJETO: Readonly<Record<string, number>> = {
  town: 1.5,
  village: 1.1,
  node: 0.95,
  resource: 0.5,
  mine: 0.6,
  chest: 0.4,
  monster: 0.45,
};

/**
 * La reserva de un nodo de bosque o de montaña, que lleva un hito y no pieza
 * (#196, #203): la de 0,95 era para el portillo de 1,7 casillas, y alrededor de
 * un hito de 0,6 abría un claro redondo donde la masa no llegaba al paso, que se
 * leía como un punto más del camino. Con esta, los árboles o los picos de las
 * casillas de al lado llegan a los flancos del nodo y lo que queda libre es el
 * eje (`pasosALaVista`) y el hito: una garganta.
 */
export const RADIO_DEL_PASO_SIN_PIEZA = 0.5;

/** Las barreras de masa cuyo nodo lleva hito y no pieza: su reserva es `RADIO_DEL_PASO_SIN_PIEZA`. */
const PASOS_SIN_PIEZA: readonly Barrera[] = ['forest', 'mountain'];

/** El radio de la reserva de un objeto (`reservaDe`): el de su clase, salvo el nodo de bosque o de montaña. */
export function radioDeLaReserva(o: Pick<MapObject, 'kind'> & { barrera?: Barrera }): number {
  if (o.kind === 'node' && o.barrera !== undefined && PASOS_SIN_PIEZA.includes(o.barrera))
    return RADIO_DEL_PASO_SIN_PIEZA;
  return RADIO_DE_OBJETO[o.kind] ?? 0.5;
}

export function componer(map: MapaDeEscena, semilla: number, catalogo: Catalogo): Escena {
  /** Los módulos de una hoja, de menor a mayor, o null si la hoja aún no está hecha. */
  const modulosDe = (hoja: string): readonly Modulo[] | null => catalogo.hojas[hoja] ?? null;
  const pieza = (id: string): Pieza | null => catalogo.piezas[id] ?? null;
  const a = analizar(map);
  const { nivel } = relieve(a);
  /**
   * El suelo de la meseta de cada casilla (`sueloDeLaMeseta`, #216): la roca de
   * las paredes y de lo alto es la del lado alto, no la del suelo más cercano.
   */
  const meseta = sueloDeLaMeseta(a.W, a.H, a.region, a.suelo, nivel);
  /** La roca de cada casilla: en lo alto de un acantilado, la de su cara (`materialDeLaCima`, #212). */
  const materialDeLaCimaEn = materialDeLaCima(a.W, a.H, meseta, nivel, a.franjas);
  /** El suelo que se pinta en cada casilla (`sueloQueSePinta`, #217). */
  const pintado = sueloQueSePinta(a.region, a.suelo, meseta);
  // `let`: lo alto de los acantilados (#205) se viste con su propia corriente
  // (`azarDeLoAlto`) y se cambia mientras tanto. Con la misma, los picos de más
  // movían todo lo que se viste después: las cordilleras de 1-40 salían otras
  // y el guardia de #204 (s22 (9, 18)) contaba 8 cumbres dominantes.
  let azar = azarDe(semilla * 7919 + 1);
  const azarDeLoAlto = azarDe(semilla * 3571 + 7);
  /**
   * Las cordilleras, con la suya (#218): cuántos picos lleva una franja de
   * montaña depende de sus masas y sus claros, y con la corriente de siempre
   * cada retoque de una cordillera movía los bosques y la cubierta que se visten
   * después.
   */
  const azarDeLasCordilleras = azarDe(semilla * 6271 + 13);
  const { W, H } = a;
  const sprites: Sprite[] = [];
  const faltan = new Set<string>();
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
    elAzar: () => number = azar,
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
      const k = Math.max(0, Math.min(ms.length - 1, centro + Math.round((elAzar() - 0.5) * 4)));
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
                return piezaDeNodo(o.id, o.at, W, map.terrain, paso.barrera, paso.eje);
              })()
            : o.kind === 'resource'
              ? // Mercurio, azufre, cristal y gemas no tienen pieza: van como tesoro.
                (({ gold: 'oro', ore: 'piedra', wood: 'madera' } as Record<string, string>)[
                  o.resource
                ] ?? 'oro')
              : o.kind === 'mine'
                ? 'atlas/mina'
                : o.kind === 'chest'
                  ? 'cofre'
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
    const norteSur = id === 'nodo-puerta-hondo';
    const alto =
      p === null
        ? ancho
        : esHito(id)
          ? ALTO_DEL_HITO
          : norteSur
            ? PUERTA_NORTE_SUR.alto
            : (ancho * p.nh) / p.nw;
    // La puerta, por el medio: su ancla derivada es el pie más bajo, el de la
    // torre de un lado, y la puerta caía 0,4 casillas al lado de su nodo, con el
    // lienzo que llega a ella entrando por la torre (#183). La de norte a sur,
    // además, por el pie de su arco: el de su torre de delante queda una casilla
    // al sur, sobre el lienzo que sale de ella.
    const centrada =
      p !== null && id?.startsWith('nodo-puerta') === true
        ? { ...p, ax: p.nw / 2, ...(norteSur ? { ay: p.nh * PUERTA_NORTE_SUR.pieDelArco } : {}) }
        : p;
    const s = deObjeto(o, centrada, x, y + 0.35, alto);
    const tono = id === null ? undefined : TONO_DE_HITO[id];
    sprites.push(tono === undefined || s.src === null ? s : { ...s, tono });
  }

  // Su reserva, salvo la de los puentes: la de un nodo cubre su casilla entera,
  // que lleva su camino hasta la puerta. Entra en `obstaculos` con lo demás.
  const reservas = new Map(
    a.objetos.flatMap((o) => {
      if (a.puentes.has(o.id)) return [];
      const s = sprites.find((t) => t.objeto?.id === o.id);
      if (s === undefined) throw new Error(`el objeto ${o.id} no está en la escena`);
      return [[reservaDe(o, radioDeLaReserva(o), s), s] as const];
    }),
  );

  // 2 · Los caminos: se encadenan en sendas y cada senda abre su pasillo.
  const caminos = map.caminos.tramos.map(([p, q]): [number, number, number, number] => [
    p.x + 0.5,
    p.y + 0.5,
    q.x + 0.5,
    q.y + 0.5,
  ]);
  // El pasillo se mide sobre el trazo que se pinta, no sobre la casilla: la
  // senda ondula y entre dos casillas no hay centro que reservar. La senda llega
  // a los estribos de cada puente y no sigue por encima (#157).
  // Y acaba en cada ciudad o nodo que atraviesa: llega recta a su puerta (#210).
  const deUnNodo = new Set(a.red.nodos.map((n) => `${n.at.x + 0.5},${n.at.y + 0.5}`));
  const suavizadas = sendas(tramosHastaLosEstribos(caminos, puentes), semilla, (x, y) =>
    deUnNodo.has(`${x},${y}`),
  );
  // El eje de cada nodo de paso, con camino o sin él: sin camino que abriera
  // hueco, los picos y los árboles de alrededor lo enterraban y el paso no se
  // distinguía de la cordillera (#173).
  const pasos = pasosALaVista(map, a.puentes);
  // La trocha de cada paso sin camino (#190): no es camino, pero lo de al lado
  // se aparta de ella como del eje del paso.
  const trochas = trochasDeLosPasos(map, a.puentes, semilla);
  // Por dónde bajan las sendas (R5): una pieza encima de la pared cada una. La
  // que llega a un puente no: el puente es su paso.
  const nodosDePuente = new Set(
    a.objetos.filter((o) => a.puentes.has(o.id)).map((o) => `${o.at.x},${o.at.y}`),
  );
  /**
   * Dónde puede caer el pie de la rampa de una bajada (#214): nunca en el agua
   * (la de los puentes incluida). En diagonal, la rampa de caída 2 mide 1,65
   * casillas y pasaba de la ciudad de s37 (7,26) al agua de (6,27).
   */
  const pieAdmitido = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < W && y < H && a.terreno[y * W + x] !== 'water';
  const todasLasCeldas = celdasDe(nivel, W, H, meseta);
  const bajoLosPuentes = celdasBajoLosPuentes(todasLasCeldas, puentes);
  // Las rampas (#225): donde un camino baja de frente por un borde recto y hay
  // su arte, la pared se abre —el cuerpo en el hueco y un costado a cada lado—
  // en vez de llevar la bajada encima. Se deciden por el tramo del núcleo, antes
  // de toda pared.
  const rampas = rampasDeFrente(
    nivel,
    W,
    todasLasCeldas.filter((c) => esVisto(c.tipo) && !bajoLosPuentes.has(claveDeCelda(c))),
    [
      ...map.caminos.tramos.filter(
        ([p, q]) => !nodosDePuente.has(`${p.x},${p.y}`) && !nodosDePuente.has(`${q.x},${q.y}`),
      ),
      ...tramosDeLasRampas(map, a),
    ],
    (material, caida) => piezasDeRampa(catalogo, hojaDeRampa({ material, caida })) !== null,
    pieAdmitido,
  );
  // Las paredes del relieve por celdas (R4), sin las que cruza un puente (las
  // tapa su estribo, y debajo del tablero se ve el agua) ni las que abre una
  // rampa (sin cara pintada ni frontal: las sustituyen sus piezas).
  const rel = caidas(
    nivel,
    W,
    H,
    meseta,
    new Set([...bajoLosPuentes, ...rampas.flatMap(celdasDeLaRampa)]),
  );
  // Las paredes del relieve van antes que la senda (#206): nunca se apartan de
  // ella (R4/R5), así que es la senda la que se aparta de su pie. La pared solo
  // mira la reserva de los objetos y los tableros de los puentes.
  const deLaPared = new Obstaculos<Medible>([...formasDeLosTableros(puentes), ...reservas.keys()]);
  /** El sprite del objeto en cuya reserva cae `(x, y)`, el más cercano si son varios. */
  const reservaEn = (x: number, y: number): Sprite | undefined => {
    const f = deLaPared.en(x, y, (f) => reservas.has(f));
    return f === undefined ? undefined : reservas.get(f);
  };
  /** Mete `s` en la escena y cuenta si su base pisa una reserva. */
  const meter = (s: Sprite): true => {
    if (reservaEn(s.x, s.y) !== undefined) basesSobreReserva++;
    sprites.push(s);
    return true;
  };
  /** `s` y, si es otro, el módulo más estrecho de su hoja en su sitio: lo que prueba `ponerPared`. */
  const yElMasEstrecho = (s: Sprite, hoja: string): [Sprite, ...Sprite[]] => {
    const e = masEstrecho(hoja);
    return e === undefined || e.src === s.src
      ? [s]
      : [s, { ...s, src: e.src, nw: e.nw, nh: e.nh, ax: e.ax, ay: e.ay }];
  };
  /**
   * La puerta de la pared: no tapa ningún tablero (`deLaPared`): se prueba cada
   * uno de `modulos` en su orden, encogido sin bajar de `minimo`. Dice si se
   * puso. Con `puntos` (su pie y lo que tapa por encima: el filo, el medio de
   * una ladera, las juntas de una diagonal) en la reserva de un objeto:
   *
   * - la frontal y la ladera (`'detras'`) van si no lo tapan a él (se pintan
   *   después y sus cajas se solapan) ni a su camino (la rampa de una bajada,
   *   un tramo de senda que esconderían), encogidas si hace falta;
   * - la diagonal (`'ordenada'`), que no se encoge, además pasa por detrás del
   *   objeto que taparía, como la muralla (`meterEnLaMuralla`): en su sitio,
   *   ordenada justo antes que él;
   * - el pedregal (`'fuera'`) no va: no se planta en la puerta.
   *
   * Saltarse la reserva entera partía el borde de la meseta en bloques sueltos
   * junto a las minas y las ciudades de su pie (#221, `carasCortadas`).
   *
   * Con el relieve por celdas (R4/R5) la pared ya no se aparta de la senda que
   * baja: ni se corre, ni se encoge, ni se quita por ella, y nunca se corta. La
   * bajada se pinta encima. El muro bajo junto a la senda (#172) era eso.
   */
  /** Las bajadas de las sendas `l`, con la de cada rampa por el medio de su hueco (`enSuRampa`). */
  const bajadasDe_ = (l: readonly Senda[]) =>
    bajadasDe(
      nivel,
      W,
      meseta,
      rel.celdas,
      map.caminos.tramos,
      l,
      (p, q) => nodosDePuente.has(`${p.x},${p.y}`) || nodosDePuente.has(`${q.x},${q.y}`),
      pieAdmitido,
    ).map((b) => enSuRampa(b, rampas));
  /** Las bajadas de los nodos entre dos niveles sin camino (#143), por su eje y con la trocha. */
  const bajadasDeLosNodos = () =>
    bajadasDe(
      nivel,
      W,
      meseta,
      rel.celdas,
      tramosDeLasRampas(map, a),
      trochas,
      undefined,
      pieAdmitido,
    ).map((b): Bajada => enSuRampa({ ...b, deUnNodo: true }, rampas));
  /** La silueta de cada módulo que tapa una cara: la de las paredes, para lo que pintan encima. */
  const perfilDe = perfilesDelCatalogo(catalogo);
  /**
   * Las rampas de las bajadas tal como saldrán (las de las sendas sin apartar,
   * que junto a una rampa no se apartan, y las de los nodos): la pared que pasa
   * por detrás de un objeto no las tapa (#221). Fuera de una reserva, la bajada
   * se pinta encima de su pared; dentro, va justo detrás del objeto (`llegaA`) y
   * la pared que se colara entre las dos la tapaba.
   */
  const rampasPrevias = [...bajadasDe_(suavizadas), ...bajadasDeLosNodos()].map(caminoDeBajada);
  /**
   * Las cajas de las paredes que la puerta no dejó entrar, con el porqué (un
   * puente que taparían): la razón declarada de las celdas que quedan vacías
   * ahí (`vaciaPorque`).
   */
  const rechazos: Rechazo[] = [];
  const ponerPared = (
    modulos: readonly [Sprite, ...Sprite[]],
    minimo: number,
    puntos: readonly (readonly [number, number])[],
    reserva: Reserva = 'detras',
  ): boolean => {
    const objetos = puntos.flatMap(([x, y]) => reservaEn(x, y) ?? []);
    if (objetos.length > 0 && reserva === 'fuera') return false;
    const encogido = (m: Sprite, alto: number): Sprite =>
      alto === m.alto
        ? m
        : { ...m, alto, ...(m.ancho === undefined ? {} : { ancho: (m.ancho * alto) / m.alto }) };
    const solapan = (p: Caja, c: Caja) => p[0] < c[2] && p[2] > c[0] && p[1] < c[3] && p[3] > c[1];
    /** Si `s` se pinta después de alguno de `objetos` y lo taparía (sus cajas se solapan). */
    const tapaUnObjeto = (s: Sprite): boolean => {
      const caja = cajaDeSprite(s);
      return objetos.some((o) => s.y >= o.y && solapan(caja, cajaDeSprite(o)));
    };
    /**
     * Si `s` taparía la rampa de una bajada o un tramo de senda
     * (`sendaBajoElRelieve`): junto al objeto, a su puerta llega el camino, y
     * la reserva lo dejaba a la vista.
     */
    const tapaElCamino = (s: Sprite): boolean => {
      const caja = cajaDeSprite(s);
      const cerca = ([x, y]: readonly [number, number], r: number) =>
        solapan(caja, [x - r, y - r, x + r, y + r]);
      if (rampasPrevias.some((r) => r.some((p) => cerca(p, 0) && tapaElPunto(s, perfilDe, ...p))))
        return true;
      // Con las paredes de al lado: dos que tapan media senda cada una la esconden.
      const sendas = suavizadas.filter((l) => l.some((p) => cerca(p, 0.3)));
      if (sendas.length === 0) return false;
      const alrededor: Caja = [caja[0] - 1, caja[1] - 1, caja[2] + 1, caja[3] + 1];
      const vecinas = sprites.filter(
        (t) => t.clase === 'pared' && solapan(cajaDeSprite(t), alrededor),
      );
      const escondido = (ps: readonly Sprite[]) =>
        tramosBajoElRelieve(ps, sendas, catalogo).reduce((n, t) => n + t.largo, 0);
      return escondido([...vecinas, s]) > escondido(vecinas) + 1e-9;
    };
    for (const m of modulos) {
      const libre = deLaPared.altoLibre(m);
      if (libre < minimo) continue;
      const s = encogido(m, libre);
      if (objetos.length === 0) return meter(s);
      // Encogida, sin bajar de `minimo`, hasta no tapar ni el objeto ni su
      // camino: la frontal que cuelga junto a una ciudad tapaba el pie de su
      // muralla.
      const libreDe = (tapa: (s: Sprite) => boolean): Sprite | undefined => {
        if (!tapa(s)) return s;
        if (tapa(encogido(m, minimo))) return undefined;
        let bajo = minimo;
        let alto = libre;
        for (let k = 0; k < 10; k++) {
          const medio = (bajo + alto) / 2;
          if (tapa(encogido(m, medio))) alto = medio;
          else bajo = medio;
        }
        return encogido(m, bajo);
      };
      const suelta = libreDe((t) => tapaUnObjeto(t) || tapaElCamino(t));
      if (suelta !== undefined) {
        sprites.push(suelta);
        return true;
      }
      // La diagonal, que no se encoge, pasa por detrás del objeto que taparía:
      // en su sitio, ordenada justo antes que él (como la muralla). Sus filos
      // se leen por su ancla, que se mueve con el pie (`filosColocados`).
      if (reserva === 'ordenada' && !tapaElCamino(s)) {
        sprites.push(ordenadoEn(s, Math.min(...objetos.map((o) => o.y)) - 0.01));
        return true;
      }
    }
    rechazos.push({
      caja: cajaDeSprite(modulos[0]),
      razon: objetos.length > 0 ? 'objeto' : 'puente',
    });
    return false;
  };
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
      filaAlta: Math.floor(y),
    };
  };
  for (const l of rel.laderas) {
    const hoja = hojaDeLadera(l);
    const juego = juegoDe(hoja);
    if (juego === null) {
      // Sin el arte, una marca por fila, del filo al pie.
      for (let y = l.y0; y <= l.y1; y++) {
        const largo = 1 + l.caida * ALTO_DE_NIVEL;
        const s: Sprite = {
          ...deHoja(hoja, bordeDeLadera(l), y + largo, largo, 0, 'pared', '#4c463e', true),
          filaAlta: Math.floor(y),
        };
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
    ponerPared([s], s.alto, puntosDeCelda(c), 'ordenada');
  }

  // Las caídas al sur: las frontales de siempre, de junta a junta. Sus módulos
  // miden de 1 a 2 casillas de ancho; ninguno se sale de su tramo más de
  // `SALE_DE_SU_TRAMO`, que en un extremo está la diagonal que dobla la esquina.
  /** Los sitios de cada cara donde no cupo una frontal: ahí va su pedregal, después. */
  const sinFrontal = new Map<Cara, number[]>();
  // Con su propio azar: se ponen antes que las formaciones, y así no les
  // cambian las tiradas.
  const azarDeLasFrontales = azarDe(semilla * 3301 + 7);
  for (const c of rel.caras) {
    const { pared: hoja } = materialDeCara(c.material);
    const filo = c.y + 1;
    const pie = filo + c.caida * ALTO_DE_NIVEL;
    const desde = c.x0;
    const hasta = c.x1 + 1;
    // Lo más bajo que se deja una pared: lo que mide la cara. Más baja, la cara
    // asomaría lisa por encima.
    const minimo = c.caida * ALTO_DE_NIVEL;
    const pared = (x: number, nombre?: string): Sprite => ({
      ...deHoja(
        hoja,
        x + (azarDeLasFrontales() - 0.5) * 0.1,
        pie + 0.05 + (azarDeLasFrontales() - 0.5) * 0.12,
        c.caida * ALTO_DE_NIVEL + 0.35 + azarDeLasFrontales() * 0.2,
        azarDeLasFrontales(),
        'pared',
        '#4c463e',
        true,
        nombre,
        undefined,
        azarDeLasFrontales,
      ),
      filaAlta: c.y,
    });
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
        // Donde no cabe ninguna pared, junto a un objeto, va un pedregal por la
        // cara, que se aparta de la senda: se pone con ella ya apartada.
        if (reservaEn(aqui, pie) === undefined)
          sinFrontal.set(c, [...(sinFrontal.get(c) ?? []), aqui]);
      }
      if (aqui >= hasta - 0.25) break;
      x = Math.min(x + 0.42 + azarDeLasFrontales() * 0.22, cubierto + 0.2);
    }
  }

  // Las rampas (#225): sus tres piezas en el hueco que abren. No pasan por la
  // puerta de la pared: el cuerpo es camino, y ninguna se encoge. Lo horneado
  // con el que se solapan (el hito de su nodo, la ciudad de su pie) va encima.
  for (const r of rampas) {
    const hoja = hojaDeRampa(r);
    const piezas = piezasDeRampa(catalogo, hoja);
    if (piezas === null) throw new Error(`la rampa de ${r.x},${r.y} no tiene su arte (${hoja})`);
    for (const p of PIEZAS_DE_RAMPA) {
      let s = spriteDeRampa(piezas[p], hoja, r);
      for (const n of sprites)
        if (esNodoHorneado(n) && n.y < s.y && seSolapan(s, n, perfilDe))
          s = ordenadoEn(s, n.y - 0.01);
      sprites.push(s);
    }
    // Y una frontal de su material sobre el extremo de fuera de cada costado, que
    // se pinta después y tapa la arista de su corte: donde el borde recto acaba
    // en una esquina (s2069 (15,5, 8)), no hay frontal vecina que la tape.
    const { pared: hojaDePared } = materialDeCara(r.material);
    const e = masEstrecho(hojaDePared);
    if (e === undefined) continue;
    const filo = r.y + 1;
    const pie = filo + r.caida * ALTO_DE_NIVEL;
    const tono = tonoDe(hojaDePared);
    for (const [borde, fuera] of [
      [r.x + TRAMO_DE_PIEZA_DE_RAMPA['costado-izq'][0], -1],
      [r.x + TRAMO_DE_PIEZA_DE_RAMPA['costado-der'][1], 1],
    ] as const) {
      const base: Sprite = {
        ...(tono === undefined ? {} : { tono }),
        src: e.src,
        nw: e.nw,
        nh: e.nh,
        ax: e.ax,
        ay: e.ay,
        x: borde,
        y: pie + 0.05,
        alto: r.caida * ALTO_DE_NIVEL + 0.4,
        clase: 'pared',
        color: '#4c463e',
        capa: 0,
        sombra: true,
        filaAlta: r.y,
      };
      // Su lado de dentro, `DENTRO_DEL_COSTADO` dentro del costado, donde aún
      // tiene su alto entero; el resto, por fuera.
      const [x0, , x1] = cajaDeSprite(base);
      const dentro = borde - fuera * DENTRO_DEL_COSTADO;
      const s = { ...base, x: base.x + (fuera > 0 ? dentro - x0 : dentro - x1) };
      // Junto a un objeto (la ciudad de s2069 (16, 8)) va detrás de él, como la diagonal.
      ponerPared(
        [s],
        s.alto,
        [
          [s.x, s.y],
          [s.x, filo],
        ],
        'ordenada',
      );
    }
  }

  // La senda se aparta de lo que la tapa (#206), menos junto a una bajada, que
  // la cruza por su rampa: ahí la tapa la bajada, que es camino.
  const queTapa = loQueTapa(sprites, catalogo);
  /**
   * Lo que dista `(x, y)` del centro de la casilla de acantilado, muro o
   * cordillera más cercana de alrededor, a lo largo de un eje (Chebyshev; 0,5
   * en su canto), o `LEJOS_DE_LA_BARRERA` si no hay.
   */
  const aLaBarrera = (x: number, y: number): number => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let d = LEJOS_DE_LA_BARRERA;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const bx = cx + dx;
        const by = cy + dy;
        if (bx < 0 || by < 0 || bx >= W || by >= H) continue;
        const t = a.terreno[by * W + bx];
        if (t !== 'cliff' && t !== 'wall' && t !== 'mountain') continue;
        d = Math.min(d, Math.max(Math.abs(x - bx - 0.5), Math.abs(y - by - 0.5)));
      }
    return d;
  };
  const juntoALaRampa = pasilloDe(bajadasDe_(suavizadas).map(rampaDe), JUNTO_A_LA_RAMPA);
  const conEdificio = new Set(
    a.objetos
      .filter((o) => o.kind === 'town' || o.kind === 'village' || o.kind === 'mine')
      .map((o) => o.at.y * W + o.at.x),
  );
  const apartar = (l: readonly Senda[]) =>
    apartarDeLoQueTapa(
      l,
      (x, y) => queTapa(x, y) === 'pared',
      (x, y) => juntoALaRampa.en(x, y, () => true) !== undefined,
      (x, y, [x0, y0]) => {
        // Sin arrimarse a un acantilado, un muro ni una cordillera más de lo
        // que ya estaba: la roca de lo alto (`cimaDeRoca`, #205) se aparta de
        // la senda, y la corrida hacia su canto dejaba lisas 17 casillas más en
        // 1-40; la línea de la muralla solo deja cruzar por la puerta, y la
        // corrida hacia un lienzo lo pisaba (s439, #207); y en una cordillera
        // estrecha no cabía una cumbre (#204, s11 (20,11): 7 dominantes).
        if (aLaBarrera(x, y) < Math.min(aLaBarrera(x0, y0), LEJOS_DE_LA_BARRERA)) return false;
        if (Math.floor(x) === Math.floor(x0) && Math.floor(y) === Math.floor(y0)) return true;
        if (x < 0 || y < 0 || x >= W || y >= H) return false;
        const i = Math.floor(y) * W + Math.floor(x);
        // A otra casilla, solo si se pisa y no es la de un edificio.
        return a.franjaDe[i] === -1 && !conEdificio.has(i);
      },
    );
  const apartadas = apartar(suavizadas);
  const bajadasDeLasSendas = bajadasDe_(apartadas);
  // Y lo que se pinta pasa por la rampa de cada una, de su filo a su pie (#192).
  const trazos = sendasPorLasRampas(apartadas, bajadasDeLasSendas);
  // El nodo entre dos niveles sin camino también es una rampa (#143): la pieza
  // va por su eje, con la trocha de senda. Sin ella, el paso de la meseta al
  // llano no se veía (147 de 257 nodos entre niveles en 1-40).
  const bajadas = [...bajadasDeLasSendas, ...bajadasDeLosNodos()];
  /**
   * Lo que no se tapa (#151): la senda; la rampa de cada bajada, más ancha que
   * la senda y con sus ribazos (R5); el tablero de cada puente, del que se
   * apartan también la pared (con la de la cara de detrás encima, el puente
   * quedaba tapado, #157); el eje de cada paso; y las paredes del desnivel, que
   * la masa de delante no tapa (#216).
   */
  const obstaculos = new Obstaculos<Medible>([
    formaDeLaSenda(trazos),
    formaDeLaSenda(bajadas.map(rampaDe)),
    ...formasDeLosTableros(puentes),
    formaDeLosPasos(pasos),
    formaDeLasTrochas(trochas),
    ...reservas.keys(),
    ...formasDeLasParedes(sprites, perfilDe),
  ]);
  const sendaDeLaMuralla = sendaParaLaMuralla(trazos);
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
   * encogido hasta su mínimo, sobre nada de lo que se aparta (`obstaculos`).
   * Es la pregunta de `poner` y la del dardo.
   */
  const entra = (s: Medible) => {
    const r = APARTE[s.clase];
    return r === null ? reservaEn(s.x, s.y) === undefined : !obstaculos.pisa(s, r.minimo(s.alto));
  };
  /**
   * El dardo de una clase en `(x, y)`: si entraría su sprite más estrecho con el
   * alto más bajo que vaya a tener. Así no se gasta un dardo donde `poner` no
   * podría poner nada, que dejaba el hueco pelado.
   */
  const entraria = (clase: Sprite['clase'], x: number, y: number, alto: number) => {
    const m = moldes.get(clase);
    if (m === undefined) return reservaEn(x, y) === undefined;
    return entra({ nw: m.nw, nh: m.nh, ax: m.ax, ay: m.ay, x, y, alto, clase });
  };
  /** `s` con el mayor alto, hasta el suyo, con el que no pisa nada de lo que se aparta. */
  const ajustado = (s: Sprite): Sprite => {
    const alto = obstaculos.altoLibre(s);
    return alto === s.alto ? s : { ...s, alto };
  };
  /**
   * La única puerta de lo que no es objeto ni nube a la escena; dice si entró.
   * Lo que se aparta del camino entra si `entra`, tan alto como quepa; si no,
   * se prueba el módulo más estrecho de su hoja, y si tampoco, no entra.
   *
   * Con `esbeltez`, el módulo que se ponga —el elegido o su reserva estrecha—
   * se encoge hasta no ser más esbelto que eso (`tumbado`): la cubierta de lo
   * que se pisa en un suelo `comoLaBarrera`. Va aquí y no en quien llama porque
   * la reserva estrecha es justo la pieza más esbelta de la hoja.
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
    esbeltez?: number,
  ): boolean => {
    const deLaHoja = deHoja(hoja, x, y, alto, t, clase, color, sombra, nombre, porAncho);
    const s = tumbado(
      tono === undefined || deLaHoja.src === null ? deLaHoja : { ...deLaHoja, tono },
      esbeltez,
    );
    const r = APARTE[clase];
    if (r === null) return meter(s);
    if (!r.hojas.includes(hoja))
      throw new Error(`la hoja «${hoja}» no está entre las de la clase ${clase} (APARTE)`);
    if (entra(s)) return meter(ajustado(s));
    const e = masEstrecho(hoja);
    if (e === undefined || e.src === s.src) return false;
    const estrecho = tumbado(
      { ...s, src: e.src, nw: e.nw, nh: e.nh, ax: e.ax, ay: e.ay, alto: deLaHoja.alto },
      esbeltez,
    );
    return entra(estrecho) && meter(ajustado(estrecho));
  };
  /** Una mata de la cubierta; `rala`, la de lo que se pisa en un suelo `comoLaBarrera`. */
  const mata = (hoja: string, x: number, y: number, alto: number, rala = false) =>
    poner(
      hoja,
      x,
      y,
      alto,
      azar(),
      'cubierta',
      MARCADOR.cubierta as string,
      false,
      undefined,
      undefined,
      undefined,
      rala ? ESBELTEZ_DE_LO_PISABLE : undefined,
    );
  const altoDeMata = (s: Suelo) => CUBIERTA[s].alto * (MATA_MAS_BAJA + azar() * 0.6);

  /** Los módulos de `hoja` que van en una cordillera: sin las mesas (`esMesa`, #212). */
  const modulosDeCordillera = (hoja: string): readonly Modulo[] =>
    (modulosDe(hoja) ?? []).filter((m) => !esMesa(hoja, m));
  const { cresta: ruidoDeCresta, grupos: ruidoDeLosGrupos } = ruidosDelMacizo(semilla);
  const esbeltos = new Map<string, readonly Modulo[]>();
  /** Los módulos de pico ya elegidos, por su sitio: lo que mira `repiteVecino`. */
  const picosElegidos = new Map<string, { x: number; y: number; nombre: string }[]>();
  const celdaDePico = (x: number, y: number) => `${Math.floor(x / 2)},${Math.floor(y / 2)}`;
  /** Si a menos de `VECINO_IGUAL` de `(x, y)` ya se eligió `nombre` de la misma hoja. */
  const repiteVecino = (hoja: string, nombre: string, x: number, y: number): boolean => {
    const cx = Math.floor(x / 2);
    const cy = Math.floor(y / 2);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (const p of picosElegidos.get(`${cx + dx},${cy + dy}`) ?? [])
          if (p.nombre === `${hoja}/${nombre}` && Math.hypot(p.x - x, p.y - y) < VECINO_IGUAL)
            return true;
    return false;
  };
  const apuntarPico = (hoja: string, m: Modulo, x: number, y: number): Modulo => {
    const k = celdaDePico(x, y);
    picosElegidos.set(k, [
      ...(picosElegidos.get(k) ?? []),
      { x, y, nombre: `${hoja}/${m.nombre}` },
    ]);
    return m;
  };
  /**
   * El material de cada casilla de cordillera: uno por macizo
   * (`materialDeLosMacizos`), por el suelo de su meseta, como su pared (#216).
   */
  const materialDeMacizo = materialDeLosMacizos(
    a.franjas.filter((f) => f.barrera === 'mountain').flatMap((f) => f.casillas),
    W,
    H,
    meseta,
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
  const siluetaDe = (
    hoja: string,
    cumbre: number,
    alto: number,
    x: number,
    y: number,
  ): Modulo | undefined => {
    let ms = esbeltos.get(hoja);
    if (ms === undefined) {
      ms = [...modulosDeCordillera(hoja)].sort((p, q) => q.nw / q.nh - p.nw / p.nh);
      esbeltos.set(hoja, ms);
    }
    if (ms.length === 0) return undefined;
    const centro = Math.round(cumbre * (ms.length - 1));
    const k = Math.max(0, Math.min(ms.length - 1, centro + Math.round((azar() - 0.5) * 4)));
    let primero: Modulo | undefined;
    for (let d = 0; d < ms.length; d++)
      for (const j of d === 0 ? [k] : [k - d, k + d]) {
        const m = ms[j];
        if (m === undefined || altoMaximoDe(m) < alto) continue;
        // El que ya lleva un vecino se salta si hay otro que llegue: en 1-40
        // el 43 % de los picos tenía su mismo módulo a menos de 1,2 casillas
        // (#204), y la cordillera se leía como un sello repetido.
        if (!repiteVecino(hoja, m.nombre, x, y)) return apuntarPico(hoja, m, x, y);
        primero ??= m;
      }
    return apuntarPico(hoja, primero ?? ms.reduce((p, q) => (q.nh > p.nh ? q : p)), x, y);
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
    /** Las cumbres de la franja (`Macizo.cumbres`) con su módulo; el bosque no tiene. */
    cumbres: readonly CumbrePuesta[];
    /** Si `(x, y)` cae en un claro de la falda (#218): sin dardos; el bosque no tiene. */
    claro: (x: number, y: number) => boolean;
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
        cumbres: [],
        claro: () => false,
      };
    }
    // De la franja y no de la casilla del pico: un pico que desborda la franja
    // cae en una casilla de fuera, que no es de ningún macizo.
    const material = materialDeMacizo.get(f.casillas[0] as number);
    if (material === undefined) throw new Error(`la franja ${f.id} de cordillera no tiene macizo`);
    // La cumbre es roca maciza, no aguja: `picos-afilados` mide 2 casillas de
    // ancho a 3 de alto, y una cumbre de 3 × 3 es una mole.
    const hojaDeCumbre = material === 'roca' ? 'picos-roca' : hojaDePico(material, () => 0, 1);
    const macizo = macizoDe(
      f.casillas,
      W,
      H,
      ruidoDeCresta,
      (x, y, alto) => {
        // Con el módulo más ancho de los que llegan: si ese cabe, cabe el que salga.
        // Con las mesas, aunque no salgan (`modulosDeCordillera`): con ellas fuera
        // cabían más cumbres en la arena, cada una con su tirada, y la corriente
        // de azar de todo lo que se viste después cambiaba (#212).
        const ms = modulosDe(hojaDeCumbre) ?? [];
        const llegan = ms.filter((m) => altoMaximoDe(m) >= alto);
        const m = (llegan.length > 0 ? llegan : ms).reduce<Modulo | undefined>(
          (p, q) => (p === undefined || q.nw / q.nh > p.nw / p.nh ? q : p),
          undefined,
        );
        if (m === undefined) return true;
        const s = { nw: m.nw, nh: m.nh, ax: m.ax, ay: m.ay, x, y, alto, clase: 'masa' as const };
        return reservaEn(x, y) === undefined && obstaculos.altoLibre(s) >= alto - 1e-9;
      },
      ruidoDeLosGrupos,
    );
    return {
      radio: macizo.radio,
      claro: macizo.claro,
      altoMasBajo: (x, y) => macizo.alto(x, y) * 0.75,
      modulo: (_i, x, y, factor) => {
        const cumbre = macizo.cumbre(x, y);
        const hoja = hojaDePico(material, azar, cumbre);
        const alto = macizo.alto(x, y) * factor;
        const m = siluetaDe(hoja, cumbre, alto, x, y);
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
      cumbres: macizo.cumbres.map((c) => {
        const hoja = hojaDeCumbre;
        const m = moduloDeCumbre(hoja, c.alto, c.x, c.y);
        const luz = luzDeCumbre(1);
        return {
          x: c.x,
          y: c.y,
          hoja,
          alto: m === undefined ? c.alto : Math.min(c.alto, altoMaximoDe(m)),
          tono: [tonoDe(hoja), luz].filter((t) => t !== undefined).join(' '),
          ...(m === undefined ? {} : { nombre: m.nombre, ancho: m.nw / m.nh }),
        };
      }),
    };
  };
  /**
   * El módulo de una cumbre: uno de los que llegan a su alto sin ampliarse más
   * de `AMPLIACION_MAXIMA`, al azar y sin repetir el de una cumbre vecina; si
   * ninguno llega, el más alto, que quien lo pone baja a su tope.
   */
  const moduloDeCumbre = (hoja: string, alto: number, x: number, y: number) => {
    const ms = modulosDeCordillera(hoja);
    if (ms.length === 0) return undefined;
    const llegan = ms.filter((m) => altoMaximoDe(m) >= alto && !repiteVecino(hoja, m.nombre, x, y));
    const m =
      llegan.length > 0
        ? (llegan[Math.floor(azar() * llegan.length)] as Modulo)
        : ms.reduce((p, q) => (q.nh > p.nh ? q : p));
    return apuntarPico(hoja, m, x, y);
  };

  // 3 · Las formaciones, franja a franja.
  /** Las puertas de muralla, con el sentido en que se cruzan (`ejeDelPaso`). */
  const puertasDeMuralla: PuertaDeMuralla[] = a.objetos.flatMap((o) => {
    if (o.kind !== 'node' || a.puentes.has(o.id) || a.pasos.get(o.id)?.barrera !== 'wall')
      return [];
    const [p, q] = ejeDelPaso(o.at, W, map.terrain)[0] ?? [];
    if (p === undefined || q === undefined) throw new Error(`la puerta ${o.id} no tiene paso`);
    return [{ id: o.id, at: [o.at.x, o.at.y], paso: [q[0] - p[0], q[1] - p[1]] }];
  });
  /** Los tramos y torres de muralla que entraron en la escena: lo que mira el guardia. */
  const pintados: TramoPintado[] = [];
  /** Las torres que entraron, por su casilla: el guardia mide su rectángulo contra la senda. */
  const torresPintadas = new Map<string, Sprite>();
  let sinFormacion = 0;
  // Lo que cae bajo la huella de una ciudad, un pueblo o un nodo lo tapa el propio objeto.
  const bajoLaHuella = new Uint8Array(W * H);
  /** Las casillas que tapa cada ciudad y cada pueblo: su muralla une lo que llega a ella. */
  const huellas: (readonly [number, number])[][] = [];
  for (const o of a.objetos) {
    const r =
      o.kind === 'town' || o.kind === 'village' || o.kind === 'node' ? RADIO_DE_OBJETO[o.kind] : 0;
    if (r === undefined || r === 0) continue;
    const huella: (readonly [number, number])[] = [];
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = o.at.x + dx;
        const y = o.at.y + dy;
        if (x >= 0 && y >= 0 && x < W && y < H && Math.hypot(dx, dy) < r) {
          bajoLaHuella[y * W + x] = 1;
          if (o.kind !== 'node') huella.push([x, y]);
        }
      }
    if (huella.length > 0) huellas.push(huella);
  }
  /** Dónde se apoya cada muralla y de qué lado es cada casilla (`alrededorDeMurallas`). */
  const alrededorDeLaMuralla = alrededorDeMurallas(a, huellas, nivel);
  /**
   * La línea de cada franja de muro (`trazarLinea`), calculada una vez: la piden
   * su muralla y las vecinas, que miran sus juntas antes de poner sus torres.
   */
  const lineas = new Map<number, ReturnType<typeof trazarLinea>>();
  const lineaDe = (f: Franja) => {
    let l = lineas.get(f.id);
    if (l === undefined) {
      l = trazarLinea(f);
      lineas.set(f.id, l);
    }
    return l;
  };
  const cubiertas = new Uint8Array(W * H);
  for (const f of a.franjas) {
    const puestos = vestirFranja(f);
    for (const i of f.casillas) if (puestos.has(i)) cubiertas[i] = 1;
  }
  for (let i = 0; i < W * H; i++) if (bajoLaHuella[i]) cubiertas[i] = 1;
  for (const f of a.franjas)
    for (const i of f.casillas)
      if (!cubiertas[i]) {
        sinFormacion++;
      }

  function vestirFranja(f: Franja): Set<number> {
    const dentro = new Set(f.casillas);
    const puestos = new Set<number>();
    const caja = cajaDe(f.casillas, W);

    if (f.barrera === 'mountain') {
      const principal = azar;
      azar = azarDeLasCordilleras;
      try {
        vestirMasa(f, dentro, puestos);
      } finally {
        azar = principal;
      }
    } else if (f.barrera === 'forest') vestirMasa(f, dentro, puestos);
    else if (f.barrera === 'wall') {
      vestirMuralla(f);
      for (const i of f.casillas) puestos.add(i);
      // El resto de la franja: escombro al pie de la muralla, nunca la cubierta
      // del suelo vecino, que en tierra eran huertos y carros sobre el muro (s57).
      rellenoDeRocas(f, dentro, 0.42, 0.32, 1);
    } else if (f.barrera === 'cliff') {
      // El acantilado es el borde de una meseta (#143): la cara la pinta el
      // pintor y arriba van roca y peñascos. Ya no hay mesas sueltas.
      const desde = sprites.length;
      rellenoDeRocas(f, dentro, 0.34, 0.6, 0.3);
      const principal = azar;
      azar = azarDeLoAlto;
      try {
        rocaEnLoAlto(desde);
        cimaDeRoca(f, sprites.slice(desde));
      } finally {
        azar = principal;
      }
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
   * Una masa de bosque o de montaña: puntos densos, desbordando un poco la
   * franja para que el borde no sea recto. Apunta en `puestos` las casillas que
   * cubre.
   */
  function vestirMasa(f: Franja, dentro: ReadonlySet<number>, puestos: Set<number>): void {
    const caja = cajaDe(f.casillas, W);
    const casillaDe = (x: number, y: number) => Math.floor(y) * W + Math.floor(x);
    const marcar = (x: number, y: number) => puestos.add(casillaDe(x, y));
    const desdeLaMasa = sprites.length;
    const forma = formaDeMasa(f);
    // Las cumbres antes que nada (#204): son la pieza grande de la franja, y
    // los dardos no caen sobre ellas.
    const cumbres: CumbrePuesta[] = [];
    for (const c of forma.cumbres)
      if (
        poner(
          c.hoja,
          c.x,
          c.y,
          c.alto,
          1,
          'masa',
          MARCADOR[f.barrera] as string,
          true,
          c.nombre,
          undefined,
          c.tono,
        )
      ) {
        cumbres.push(c);
        // Las casillas que tapa su cuerpo están vestidas aunque no lleven dardo.
        for (const i of f.casillas)
          if (bajoLaCumbre(c, (i % W) + 0.5, Math.floor(i / W) + 0.5)) puestos.add(i);
      }
    const puntos = esparcir(
      [caja[0] - 0.2, caja[1] - 0.2, caja[2] + 0.2, caja[3] + 0.35],
      forma.radio,
      (x, y) => {
        const i = casillaDe(Math.min(Math.max(x, 0), W - 0.01), Math.min(Math.max(y, 0), H - 0.01));
        // Un poco fuera, solo si la casilla de al lado es de la franja.
        const cx = Math.round(x - 0.5);
        const cy = Math.round(y - 0.5);
        return (
          (dentro.has(i) ||
            (dentro.has(cy * W + cx) && Math.hypot(x - (cx + 0.5), y - (cy + 0.5)) < 0.75)) &&
          !cumbres.some((c) => bajoLaCumbre(c, x, y)) &&
          !forma.claro(x, y) &&
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
      // Un claro de la falda (#218): su pico bajo y, alrededor, pedregal de la
      // roca de su meseta. Es montaña y no se pisa: el suelo asoma, no se abre.
      if (forma.claro(cx + 0.5, cy + 0.5))
        for (let k = 0; k < PEÑASCOS_DEL_CLARO; k++) {
          const x = cx + 0.15 + azar() * 0.7;
          const y = cy + 0.2 + azar() * 0.7;
          if (peñascoDeLoAlto(meseta[i] as Suelo, x, y, 0.5)) marcar(x, y);
        }
      // Si en el claro no entró nada en los sitios del relleno (una casilla
      // suelta entre un acantilado y la senda, s2 (3, 22)), los dardos que el
      // claro había quitado: una casilla de montaña nunca se queda sin nada.
      if (!puestos.has(i))
        for (const p of esparcir(
          [cx, cy, cx + 1, cy + 1],
          forma.radio,
          (x, y) =>
            !cumbres.some((c) => bajoLaCumbre(c, x, y)) &&
            entraria('masa', x, y, forma.altoMasBajo(x, y)),
          azar,
        )) {
          const d = forma.modulo(i, p.x, p.y, 0.85 + azar() * 0.3, true);
          if (
            poner(
              d.hoja,
              p.x,
              p.y,
              d.alto,
              d.t,
              'masa',
              MARCADOR[f.barrera] as string,
              true,
              d.nombre,
              undefined,
              d.tono,
            )
          ) {
            marcar(p.x, p.y);
            break;
          }
        }
    }
    if (f.barrera === 'mountain' && cumbres.length === 0) unoQueDomine(desdeLaMasa);
  }

  /**
   * Mete un tramo o una torre de muralla en la escena; dice si entró. Nunca se
   * salta por una reserva, que dejaba el hueco por el que se leía que la muralla
   * se rodeaba (s33 (2-4, 23-24), s27 (9-10, 11-12)):
   *
   * - Lo que llega a una puerta es parte de ella: ni pregunta por su reserva,
   *   que es para que nada se plante en el paso, ni cuenta como base sobre ella.
   *   Lo que sale hacia el sur iría delante y la tapaba entera (s2 (23,22)): se
   *   pinta donde va pero se ordena justo antes que la puerta, que queda encima
   *   y el lienzo sale de debajo de ella.
   * - Si su pie cae en la reserva de otro objeto, pasa por detrás de él igual.
   */
  function meterEnLaMuralla(s: Sprite, puerta: PuertaDeMuralla | undefined): boolean {
    const delante =
      puerta === undefined
        ? entraria('muro', s.x, s.y, s.alto)
          ? undefined
          : reservaEn(s.x, s.y)
        : sprites.find((o) => o.objeto?.id === puerta.id);
    if (puerta !== undefined && delante === undefined)
      throw new Error(`la puerta ${puerta.id} no está en la escena`);
    if (delante === undefined) return entraria('muro', s.x, s.y, s.alto) && meter(s);
    sprites.push(s.y < delante.y ? s : ordenadoEn(s, delante.y - 0.01));
    return true;
  }

  /**
   * El tramo de muralla de norte a sur (§29), de lado: se le ve el adarve y la
   * cara del este, donde el `profundidad` de la hoja era una tira de almenas de
   * 0,55 casillas vista desde su extremo. Dos piezas, por el sitio. Sin ellas,
   * el de la hoja.
   */
  function tramoNorteSur(sitio: string, x: number, pie: number, color: string): Sprite {
    const id = TRAMOS_NORTE_SUR[varianteDeId(sitio, TRAMOS_NORTE_SUR.length)] as string;
    const p = pieza(id);
    if (p === null) {
      faltan.add(id);
      return deHoja(
        'muro',
        x,
        pie,
        1.05,
        0.5,
        'muro',
        color,
        true,
        'profundidad',
        ANCHO_DE_TRAMO.profundidad,
      );
    }
    // Por el medio: el adarve se corre algo al este según se aleja, y con el
    // ancla derivada (el pie del extremo cercano) toda la tirada quedaba al este.
    return {
      src: p.src,
      nw: p.nw,
      nh: p.nh,
      ax: p.nw / 2,
      ay: p.ay,
      x,
      y: pie,
      alto: ALTO_DEL_TRAMO_NORTE_SUR,
      clase: 'muro',
      color,
      capa: 0,
      sombra: true,
    };
  }

  /** La línea de una franja de muro (`trazaDeMuralla`), con sus puertas y cómo entra su torre. */
  function trazarLinea(f: Franja) {
    const dentro = new Set(f.casillas);
    const color = MARCADOR.wall as string;
    // Por coordenadas y dentro del mapa: con el índice, la vecina de la izquierda
    // de una puerta en la columna 0 era la última casilla de la fila de arriba, y
    // la puerta (0,17) de s443 se tomaba por puerta de la franja del borde
    // contrario. Su línea arrancaba de ella, no llegaba a nada y se quedaba en una
    // torre suelta.
    const suyas = puertasDeMuralla.filter((p) =>
      [-1, 0, 1].some((dy) =>
        [-1, 0, 1].some((dx) => {
          const x = p.at[0] + dx;
          const y = p.at[1] + dy;
          return x >= 0 && y >= 0 && x < W && y < H && dentro.has(y * W + x);
        }),
      ),
    );
    // Una franja pequeña es ruina salvo que lleve puerta: la muralla larga que
    // se parte deja el muro alrededor de su puerta (#208), en trozos de cinco o
    // seis casillas que `analizar` cuenta como mancha, y la puerta iba entre
    // dos ruinas.
    const hoja = f.uso === 'obstaculo' && suyas.length === 0 ? 'ruina' : 'muro';
    /** La torre de la casilla `[x, y]`, la que se pinta y la que se mide contra la senda. */
    const torreEn = ([x, y]: readonly [number, number]) =>
      deHoja(
        hoja,
        x + 0.5,
        y + 0.75,
        1.4,
        0.5,
        'muro',
        color,
        true,
        (x + y) % 2 === 0 ? 'torre-redonda' : 'torre-cuadrada',
      );
    // La torre de una casilla tal como entra: entera si no tapa la senda; si no,
    // encogida hasta no taparla, como mucho a `TORRE_MAS_BAJA`, y si ni así
    // cabe, corrida dentro de su casilla (`CORRIMIENTOS_DE_TORRE`) al primer
    // sitio donde quepa. Con la senda de 0,32 (#191), la torre suelta de s27
    // (21,32) tapaba su borde aun encogida. Sin sitio, undefined.
    const encogida = (t: Sprite) => {
      const libre = sendaDeLaMuralla.altoLibre(t);
      return libre === t.alto ? t : { ...t, alto: Math.max(libre, TORRE_MAS_BAJA * t.alto) };
    };
    const torreQueCabe = (c: readonly [number, number]): Sprite | undefined => {
      const alta = torreEn(c);
      return CORRIMIENTOS_DE_TORRE.map(([dx, dy]) =>
        encogida({ ...alta, x: alta.x + dx, y: alta.y + dy }),
      ).find((t) => !sendaDeLaMuralla.pisa(t));
    };
    const e = trazaDeMuralla(
      f.casillas.map((i) => [i % W, Math.floor(i / W)] as const),
      suyas,
      alrededorDeLaMuralla,
      (c) => !sendaDeLaMuralla.pisa(torreEn(c)),
      (c) => torreQueCabe(c) !== undefined,
    );
    return { hoja, suyas, torreEn, encogida, torreQueCabe, e };
  }

  /**
   * Una muralla por franja de muro (#183): un lienzo seguido por su línea
   * (`trazaDeMuralla`), que pasa por cada puerta y llega a la barrera vecina, y
   * torres separadas (`torresDe`). Lo que entra se apunta en `pintados`, que es
   * lo que cuenta el guardia (`murallaSinLeer`).
   */
  function vestirMuralla(f: Franja): void {
    const { hoja, suyas, torreEn, encogida, torreQueCabe, e } = lineaDe(f);
    const color = MARCADOR.wall as string;
    // Las torres obligadas de las otras murallas (`torresObligadas`), que irán
    // seguro: la punta o la casilla sola de esta que se apile con una se queda
    // sin la suya (s18 (12,23), una ruina de una casilla junto a la esquina de
    // la muralla vecina).
    const otras = a.franjas
      .filter((g) => g.barrera === 'wall' && g.id !== f.id)
      .flatMap((g) => {
        const otra = lineaDe(g);
        const enPuerta = otra.suyas.map((p) => p.at);
        return torresObligadas(otra.e.pasos).filter(
          ([x, y]) =>
            alrededorDeLaMuralla.bajoCiudad(x, y).length === 0 &&
            !enPuerta.some((p) => Math.max(Math.abs(p[0] - x), Math.abs(p[1] - y)) <= 1),
        );
      });
    for (const p of e.pasos) {
      const eje = ejeDe(p);
      const puerta = suyas.find((q) => [p.a, p.b].some(([x, y]) => x === q.at[0] && y === q.at[1]));
      // El tramo recto se apoya por el medio del paso. El diagonal lleva el
      // ancla en su punta baja (la que deriva el taller): puesto en el medio, el
      // lienzo quedaba medio paso corrido hacia arriba y no llegaba a la casilla
      // de abajo, que se leía sin muro (s57 (8,7)). Se apoya en la de abajo, `b`.
      const diagonal = eje === 'diagonal-baja' || eje === 'diagonal-sube';
      const x = diagonal ? p.b[0] + 0.5 : (p.a[0] + p.b[0]) / 2 + 0.5;
      const pie = diagonal ? p.b[1] + 0.75 : (p.a[1] + p.b[1]) / 2 + 0.75;
      const tramo =
        hoja === 'muro' && eje === 'profundidad'
          ? tramoNorteSur(`${f.id}:${p.a}`, x, pie, color)
          : deHoja(hoja, x, pie, 1.05, 0.5, 'muro', color, true, eje, ANCHO_DE_TRAMO[eje]);
      if (meterEnLaMuralla(tramo, puerta)) pintados.push({ franja: f.id, a: p.a, b: p.b });
    }
    for (const c of torresDe(
      e,
      suyas.map((p) => p.at),
      (c) => !sendaDeLaMuralla.pisa(torreEn(c)),
      ([x, y]) => alrededorDeLaMuralla.bajoCiudad(x, y).length > 0,
      [
        ...[...torresPintadas.keys()].map((k) => k.split(',').map(Number) as [number, number]),
        ...otras,
      ],
    )) {
      // La que no cabe y va igual es la de una casilla sin tramos o la de una
      // esquina (`torresDe`): entra como quepa (`torreQueCabe`) y, si no cabe de
      // ninguna manera (solo una casilla sin tramos: la línea no dobla donde la
      // torre no entra), encogida donde está.
      const torre = torreQueCabe(c) ?? encogida(torreEn(c));
      if (meterEnLaMuralla(torre, undefined)) {
        pintados.push({ franja: f.id, a: c, b: c });
        torresPintadas.set(`${c}`, torre);
      }
    }
  }

  /**
   * El suelo de una franja que no es masa (el pie de la muralla, lo alto de un
   * acantilado): sobre todo la cubierta de su suelo, y una parte `roca` de
   * peñascos y picos bajos de su material. Antes era todo escombro y la franja
   * se leía como un pedregal.
   *
   * El suelo es el que se pinta (`pintado`, el de su meseta), no el más cercano
   * de cualquier nivel (`Analisis.suelo`, #220): con ese, lo alto llevaba la
   * cubierta de la región baja de al lado —nieve y abetos nevados sobre la
   * lava de s13 (16-24, 4-7), hierba sobre la nieve de s80 (18, 12-13)—, 494
   * piezas en 1-40 (`cubiertaDeOtroNivel`).
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
          entraria('cubierta', x, y, CUBIERTA[pintado[i] as Suelo].alto * MATA_MAS_BAJA)
        );
      },
      azar,
    );
    for (const p of puntos) {
      const i = Math.floor(p.y) * W + Math.floor(p.x);
      const s = pintado[i] as Suelo;
      const tirada = azar();
      const deRoca = f.barrera === 'cliff' ? sueloDeLaRoca(i) : s;
      if (tirada < roca * 0.5 && f.barrera === 'cliff') picoDeLoAlto(deRoca, p.x, p.y, alto);
      else if (tirada < roca) peñascoDeLoAlto(deRoca, p.x, p.y, alto);
      else mata(hojaDeCubierta(s, azar()), p.x, p.y, altoDeMata(s));
    }
  }

  /**
   * Una cordillera sin cumbre —no cupo ninguna: una senda, un paso o una rampa
   * cerca— se queda con picos de alto parecido, una alfombra de pinchos que el
   * guardia de #204 cuenta (s9 (20,24): 8 de 14 dominaban al cambiar el azar con
   * #143). Si pasan de `MAS_CUMBRES` los que llegan a 0,8 del mayor, el más alto
   * que pueda sube hasta dejarlos atrás, sin ampliarse de más
   * (`altoMaximoDe`) ni pisar nada (`altoLibre`). Sin azar: no mueve lo que se
   * viste después.
   */
  function unoQueDomine(desde: number): void {
    const picos = sprites
      .map((s, k) => ({ s, k }))
      .slice(desde)
      .filter(({ s }) => s.clase === 'masa' && s.src?.startsWith('modulos/picos-') === true);
    if (picos.length < 4) return;
    const mayor = Math.max(...picos.map(({ s }) => s.alto));
    if (picos.filter(({ s }) => s.alto >= 0.8 * mayor).length <= MAS_CUMBRES) return;
    const hace = mayor / 0.8 + 0.01;
    for (const { s, k } of [...picos].sort((p, q) => q.s.alto - p.s.alto || p.k - q.k)) {
      const alto = obstaculos.altoLibre({ ...s, alto: Math.min(altoMaximoDe(s), hace) });
      if (alto < hace) continue;
      sprites[k] = { ...s, alto };
      return;
    }
  }

  /**
   * El suelo cuya roca es la de la casilla `i` (`materialDeLaCimaEn`): lo que
   * leen las hojas de picos y el tono del pedregal. En lo alto de un acantilado
   * es el de su cara, no el de su suelo (#212).
   */
  function sueloDeLaRoca(i: number): Suelo {
    const propio = pintado[i] as Suelo;
    const material = materialDeLaCimaEn[i] as string;
    if (CARA_DE_SUELO[propio] === material) return propio;
    const otro = SUELO_DE_LA_ROCA[material];
    if (otro === undefined)
      throw new Error(
        `no hay suelo para la roca «${material}»: añádelo a SUELO_DE_LA_ROCA (colocar.ts)`,
      );
    return otro;
  }

  /** Un pico bajo de la roca del suelo `s` en lo alto de un acantilado. */
  function picoDeLoAlto(s: Suelo, x: number, y: number, alto: number): boolean {
    return poner(
      hojaDeMasa('mountain', s, azar),
      x,
      y,
      alto * (0.9 + azar() * 0.6),
      azar() * 0.4,
      'roca',
      MARCADOR.cliff as string,
      true,
    );
  }

  /** Peñascos caídos del pedregal del suelo `s`. */
  function peñascoDeLoAlto(s: Suelo, x: number, y: number, alto: number): boolean {
    return poner(
      'rocas-caidas',
      x,
      y,
      alto * 0.6 * (0.8 + azar() * 0.5),
      azar() * 0.6,
      'roca',
      MARCADOR.cliff as string,
      true,
      undefined,
      undefined,
      materialDeCara(CARA_DE_SUELO[s]).pedregal,
    );
  }

  /**
   * En lo alto de un acantilado de un suelo cuya cubierta es de la roca de la
   * barrera (la arena, la lava), esa cubierta es la misma que abajo: los
   * bloques y los huesos de la arena que se pisa (#205, s34). Ahí, de lo que
   * puso `rellenoDeRocas` desde `desde`, cada mata se cambia por roca en su
   * sitio (mitad picos, mitad peñascos): con una de cada cuatro que quedaba,
   * los huesos seguían salpicando la meseta. Se cambian
   * después, y no en la tirada del relleno, para que el relleno gaste la misma
   * corriente de azar que antes.
   */
  function rocaEnLoAlto(desde: number): void {
    const cambiadas: Sprite[] = [];
    for (let k = sprites.length - 1; k >= desde; k--) {
      const m = sprites[k] as Sprite;
      const s = pintado[Math.floor(m.y) * W + Math.floor(m.x)] as Suelo;
      if (m.clase !== 'cubierta' || !CUBIERTA[s].comoLaBarrera) continue;
      sprites.splice(k, 1);
      cambiadas.push(m);
    }
    for (const m of cambiadas) {
      const s = sueloDeLaRoca(Math.floor(m.y) * W + Math.floor(m.x));
      if (azar() < 0.5) picoDeLoAlto(s, m.x, m.y, 0.6);
      else peñascoDeLoAlto(s, m.x, m.y, 0.6);
    }
  }

  /**
   * Lo alto de un acantilado no se lee como suelo (#205): cada casilla lleva al
   * menos un pico de la roca de su cara (`sueloDeLaRoca`, #212) de `ALTO_DE_LO_ALTO` o más, y la de una
   * meseta ancha, más (`picosDeLaCima`). Con solo el relleno, una meseta de 2-3 de ancho salía con la cubierta y unas piedras,
   * como la nieve pisable de al lado (s443 (14-16, 9-11)), y la de arena, con
   * los mismos bloques bajos y huesos que la arena que se pisa (s34 (17-22,
   * 5-7)). Se prueba por la casilla de más cerca a más lejos del centro de su
   * mitad baja y solo donde cabe sin encogerse por debajo del umbral: la senda,
   * los pasos, las trochas y las reservas mandan (`entra`, `altoLibre`).
   */
  function cimaDeRoca(f: Franja, puestos: readonly Sprite[]): void {
    const cuantos = new Map<number, number>();
    for (const s of puestos.filter(esDeLoAlto)) {
      const k = Math.floor(s.y) * W + Math.floor(s.x);
      cuantos.set(k, (cuantos.get(k) ?? 0) + 1);
    }
    for (const i of f.casillas) {
      const cx = i % W;
      const cy = Math.floor(i / W);
      const vecinas = (
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const
      ).filter(([dx, dy]) => {
        const x = cx + dx;
        const y = cy + dy;
        return x >= 0 && y >= 0 && x < W && y < H && a.terreno[y * W + x] === 'cliff';
      }).length;
      const faltan = picosDeLaCima(vecinas) - (cuantos.get(i) ?? 0);
      if (faltan <= 0) continue;
      const hoja = hojaDeMasa('mountain', sueloDeLaRoca(i), azar);
      const alto = ALTO_DE_LA_CIMA * (vecinas === 4 ? ALTO_EN_LO_ANCHO : 1);
      // Junto a una senda, el módulo elegido puede no caber por ancho y el más
      // estrecho de la hoja sí.
      const estrecho = masEstrecho(hoja);
      const puestosAqui: Sprite[] = [];
      for (const [dx, dy] of SITIOS_DE_RELLENO) {
        if (puestosAqui.length >= faltan) break;
        const x = cx + dx;
        const y = cy + dy;
        // Varios en una casilla, apartados: si no, se apilan en el mismo sitio.
        if (puestosAqui.some((p) => Math.hypot(p.x - x, p.y - y) < SEPARACION_EN_LA_CIMA)) continue;
        const pico = deHoja(
          hoja,
          x,
          y,
          alto * (1 + azar() * 0.35),
          0.3 + azar() * 0.5,
          'roca',
          MARCADOR.cliff as string,
          true,
        );
        const cabe = [
          pico,
          ...(estrecho === undefined || estrecho.src === pico.src
            ? []
            : [
                {
                  ...pico,
                  src: estrecho.src,
                  nw: estrecho.nw,
                  nh: estrecho.nh,
                  ax: estrecho.ax,
                  ay: estrecho.ay,
                },
              ]),
        ].find((p) => entra(p) && obstaculos.altoLibre(p) >= ALTO_DE_LO_ALTO);
        if (cabe === undefined) continue;
        meter(ajustado(cabe));
        puestosAqui.push(cabe);
      }
    }
  }

  /**
   * El pedregal de cada cara, por su índice en `sprites`: los peñascos (donde
   * no entró una pared) y las rocas de su pie. Su tono se decide con todo puesto
   * (`tonoDelPedregalSuelto`).
   */
  const pedregalDeCara: number[] = [];
  /**
   * El pedregal es pared y la pared no se aparta de la senda (`APARTE`): no lo
   * pregunta a `obstaculos`, sino a un pasillo con el margen de su pared.
   */
  const pasilloDelPedregal = pasilloDe(trazos, SEMIANCHO_DE_PARED);
  /**
   * Peñascos de `rocas-caidas` de `desde` hacia `filo`, cada uno en la `x` que
   * se le pida a su altura, entonados con `tono`, fuera de toda senda y por la
   * puerta de la pared:
   * donde una frontal no cupo (la reserva de un objeto), y en el canto de un
   * barranco o de una ladera que no entró. Hacen de la pared: cuelgan de la
   * fila de encima de su filo (`Sprite.filaAlta`).
   */
  const peñascos = (desde: number, filo: number, xEn: (y: number) => number, tono: string) => {
    for (let y = desde + 0.05; y > filo + 0.15; y -= 0.26 + azar() * 0.12) {
      const deLaHoja: Sprite = {
        ...deHoja(
          'rocas-caidas',
          xEn(y),
          y,
          0.3 + azar() * 0.18,
          azar() * 0.6,
          'pared',
          '#5a5248',
          true,
        ),
        filaAlta: Math.ceil(filo) - 1,
      };
      const roca = deLaHoja.src === null ? deLaHoja : { ...deLaHoja, tono };
      // Como pedregal que es, apartado de toda senda con el margen de su pared,
      // no solo de la que baja: 4 pisaban una senda al pie (#150, N3).
      const libre = pasilloDelPedregal.altoLibre(roca);
      if (libre < ENCOGER_HASTA * roca.alto) continue;
      if (
        ponerPared(
          yElMasEstrecho(libre === roca.alto ? roca : { ...roca, alto: libre }, 'rocas-caidas'),
          ENCOGER_HASTA * roca.alto,
          [[roca.x, y]],
          'fuera',
        ) &&
        roca.src !== null
      )
        pedregalDeCara.push(sprites.length - 1);
    }
  };
  // El pedregal de cada cara, con la senda ya apartada: los peñascos donde no
  // cupo la frontal (sin ellos quedaba una losa lisa; cada peñasco mira la
  // reserva en su propio pie) y las rocas de su pie.
  for (const c of rel.caras) {
    const { pedregal: tonoDelPedregal } = materialDeCara(c.material);
    const filo = c.y + 1;
    const pie = filo + c.caida * ALTO_DE_NIVEL;
    const desde = c.x0;
    const hasta = c.x1 + 1;
    for (const aqui of sinFrontal.get(c) ?? [])
      peñascos(
        pie,
        filo,
        () => Math.min(hasta - 0.05, Math.max(desde + 0.05, aqui + (azar() - 0.5) * 0.3)),
        tonoDelPedregal,
      );
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

  // Las bajadas (R5): encima de la pared, en el rumbo de la senda. La de una
  // rampa no: la lleva su cuerpo (#225).
  for (const b of bajadas) {
    if (b.deUnaRampa === true) continue;
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
  /**
   * Las casillas de reborde sin peñasco porque no cabía ninguno: una senda que
   * corre por el canto, o la reserva de un objeto. La razón declarada de
   * `espaldasSinReborde`.
   */
  const espaldasOcupadas = new Set<number>();
  /**
   * Una hilera de peñascos por el canto norte de la casilla alta `(x, y)`, con
   * la corriente `elAzar` y el pie a `hondo` del canto. Si no entra ninguno,
   * se prueban sitios fijos más pequeños por todo el canto (sin azar: no mueve
   * la corriente), y si tampoco, la casilla queda en `espaldasOcupadas`.
   */
  const hileraDelReborde = (x: number, y: number, elAzar: () => number, hondo: number) => {
    const tono = materialDeCara(materialDeLaCimaEn[y * W + x] as string).pedregal;
    const peñasco = (px: number, py: number, alto: number, t: number) =>
      poner('rocas-caidas', px, py, alto, t, 'roca', '#5a5248', true, undefined, undefined, tono);
    let puestos = 0;
    for (let k = 0; k < 3; k++) {
      const px = x + 0.18 + k * 0.32 + (elAzar() - 0.5) * 0.12;
      const py = y + hondo + elAzar() * 0.24;
      const queria = 0.4 + elAzar() * 0.2;
      const alto = [queria, queria * 0.6].find((h) => entraria('roca', px, py, h));
      if (alto === undefined) continue;
      if (peñasco(px, py, alto, elAzar() * 0.8)) puestos++;
    }
    if (puestos > 0) return;
    for (const [dx, dy] of SITIOS_DEL_REBORDE)
      if (entraria('roca', x + dx, y + dy, ALTO_DEL_REBORDE_MENOR))
        if (peñasco(x + dx, y + dy, ALTO_DEL_REBORDE_MENOR, 0.3)) return;
    espaldasOcupadas.add(y * W + x);
  };
  /**
   * El canto de la espalda (#219): peñascos de la roca de lo alto, seguidos, con
   * el pie justo dentro del filo (`CANTO_DE_LA_ESPALDA`), que suben por encima
   * de la orilla y de la franja oscura del canto (`cantoDeLasEspaldas`). Con la
   * hilera de tres peñascos sueltos, de pie a 0,08-0,32 del filo, la espalda no
   * se leía como el filo seguido de una meseta: la elevación acababa de repente
   * (s24 (0-9, 20-21), s13 (14-24, 4-7)). El que no entra se prueba más bajo;
   * si no entra ninguno, los sitios fijos de la hilera, y si tampoco, la casilla
   * queda ocupada.
   */
  const cantoDeLaEspalda = (x: number, y: number, elAzar: () => number) => {
    const tono = materialDeCara(materialDeLaCimaEn[y * W + x] as string).pedregal;
    const peñasco = (px: number, py: number, alto: number, t: number) =>
      poner('rocas-caidas', px, py, alto, t, 'roca', '#5a5248', true, undefined, undefined, tono);
    const C = CANTO_DE_LA_ESPALDA;
    // El módulo de cada peñasco (`deHoja`) también sale de `elAzar`: con la
    // corriente de siempre, el canto movía toda la cubierta que va después.
    const principal = azar;
    azar = elAzar;
    try {
      let puestos = 0;
      for (let k = 0; k < C.porCasilla; k++) {
        const px = x + (k + 0.5) / C.porCasilla + (elAzar() - 0.5) * C.vaiven;
        const py = y + C.hondo + elAzar() * C.vaiven;
        const queria = C.alto + elAzar() * C.masAlto;
        const t = elAzar() * 0.8;
        const alto = [queria, queria * 0.75, queria * 0.5].find((h) => entraria('roca', px, py, h));
        if (alto !== undefined && peñasco(px, py, alto, t)) puestos++;
      }
      if (puestos > 0) return;
      for (const [dx, dy] of SITIOS_DEL_REBORDE)
        if (entraria('roca', x + dx, y + dy, ALTO_DEL_REBORDE_MENOR))
          if (peñasco(x + dx, y + dy, ALTO_DEL_REBORDE_MENOR, 0.3)) return;
      espaldasOcupadas.add(y * W + x);
    } finally {
      azar = principal;
    }
  };
  for (const [x, y] of rebordes)
    if (a.terreno[y * W + x] === 'cliff') hileraDelReborde(x, y, azar, 0.18);
  // Y la espalda de una meseta que se pisa (#212): con el nivel por región
  // (#143) el borde de una meseta es casi siempre lo que se pisa contra el agua
  // encajada o un llano más bajo, y por el norte no llevaba nada. La elevación
  // acababa de repente donde la ladera doblaba hacia la cámara de espaldas (s2
  // (11-13, 4-5): el canal se cortaba en seco contra su orilla sur). Con su
  // propia corriente de azar, para no mover lo que se viste después.
  const azarDeLasEspaldas = azarDe(semilla * 2273 + 19);
  for (const [x, y] of rebordes)
    if (espaldaConReborde(a.terreno, W, x, y, bajoLaHuella))
      cantoDeLaEspalda(x, y, azarDeLasEspaldas);
  // Y el canto de la espalda de un acantilado, encima de su hilera de siempre,
  // con su propia corriente: la hilera tira de la de siempre y no se mueve.
  const azarDelCanto = azarDe(semilla * 4271 + 23);
  for (const [x, y] of rebordes)
    if (a.terreno[y * W + x] === 'cliff') cantoDeLaEspalda(x, y, azarDelCanto);

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
      entraria('cubierta', x, y, CUBIERTA[pintado[i] as Suelo].alto * MATA_MAS_BAJA)
    );
  };
  const puntos = esparcir(
    [0, 0, W, H],
    (x, y) => {
      const c = CUBIERTA[pintado[Math.floor(y) * W + Math.floor(x)] as Suelo];
      // Fuera de la mancha, el suelo se deja en claro; en la mancha, sembrado. Un
      // suelo `comoLaBarrera` no tiene manchas: sembrado, se leía como su barrera.
      return c.comoLaBarrera || !enMancha(x, y) ? c.radio * c.claro : c.radio * 0.85;
    },
    pisable,
    azar,
    30,
  );
  for (const p of puntos) {
    const i = Math.floor(p.y) * W + Math.floor(p.x);
    const s = pintado[i] as Suelo;
    const { comoLaBarrera } = CUBIERTA[s];
    const mancha = !comoLaBarrera && enMancha(p.x, p.y);
    // En la mancha de prado o nieve, arbolillos: así salen los bosquecillos. En un
    // suelo `comoLaBarrera`, ninguno: los muertos de la ciénaga eran el bosque de
    // al lado (s9 (17-18, 11-13)) y los pinos de lo áspero, el pinar.
    const arbol =
      mancha &&
      cercaDePueblo[i] !== 1 &&
      // Del camino y de los objetos que taparía se aparta solo, en `poner`.
      azar() < (lindeDeBosque[i] === 1 ? 0.75 : 0.55)
        ? (
            {
              grass: ARBOLES_DEL_SUELO.grass[azar() < 0.55 ? 0 : 1],
              snow: ARBOLES_DEL_SUELO.snow[0],
              ...(lindeDeBosque[i] === 1
                ? { dirt: ARBOLES_DEL_SUELO.dirt[azar() < 0.6 ? 0 : 1] }
                : {}),
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
    mata(hojaDeCubierta(s, azar()), p.x, p.y, altoDeMata(s), comoLaBarrera);
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
  const muralla = murallaSinLeer(
    a.franjas
      .filter((f) => f.barrera === 'wall')
      .map((f) => ({
        id: f.id,
        casillas: f.casillas.map((i) => [i % W, Math.floor(i / W)] as const),
      })),
    puertasDeMuralla,
    (x, y) => x >= 0 && y >= 0 && x < W && y < H && a.terreno[y * W + x] === 'wall',
    pintados,
    alrededorDeLaMuralla,
    huellas,
  );
  return {
    semilla,
    W,
    H,
    suelo: pintado,
    nivel: Array.from(nivel),
    agua,
    relieve: {
      caras: carasDeEscena,
      cantos: cantosDe(nivel, W, H),
      rebordes,
      celdas: rel.vistas,
      bajadas,
      rampas,
    },
    altoDeNivel: ALTO_DE_NIVEL,
    caminos,
    sendas: trazos,
    trochas,
    puentes,
    vados,
    luces: luces(a, nivel, azarDe(semilla * 31 + 5)),
    sprites,
    informe: {
      murallasPartidas: muralla.fugas.length + muralla.puertasSueltas.length + muralla.huecos,
      murallaIncoherente:
        muralla.espolones.length + muralla.esquinasAbiertas.length + muralla.puntasSinTorre.length,
      muralla,
      torresApiladas: muralla.torresApiladas.length,
      murallaSobreSenda: murallaSobreLaSenda(
        pintados,
        puertasDeMuralla.map((p) => p.at),
        (c) => {
          const s = torresPintadas.get(`${c}`);
          return s !== undefined && sendaDeLaMuralla.pisa(s);
        },
        (x, y) => sendaDeLaMuralla.en(x, y, () => true) !== undefined,
      ).length,
      basesSobreReserva,
      casillasDeBarreraSinFormacion: sinFormacion,
      spritesSobreSenda: sobreLaSenda(sprites, trazos).length,
      // Recontadas desde lo puesto, con cualquier módulo del catálogo y no solo
      // los de las hojas que se usaron.
      celdasMalCubiertas: celdasMalCubiertas(sprites, rel, catalogo, (c) =>
        vaciaPorque(c, rechazos),
      ).length,
      bajadasSinPieza: bajadasSinPieza(sprites, bajadas, catalogo).length,
      bajadasTapadas: bajadasTapadas(sprites, bajadas, catalogo).length,
      bajadasSobreNodo: bajadasSobreNodo(sprites, bajadas, catalogo).length,
      rampasDesviadas: rampasDesviadas(bajadas, trazos).length,
      rampasSinSusPiezas: rampasSinSusPiezas(sprites, rampas, catalogo).length,
      nodosSinRampa: nodosSinRampa(map, a, nivel, bajadas).length,
      sendaBajoElRelieve: sendaBajoElRelieve(sprites, trazos, catalogo).length,
      laderasEnfrentadas: laderasEnfrentadas(sprites, deLadera).length,
      carasLisas: carasLisas(carasDeEscena, sprites, perfilDe).length,
      carasCortadas: carasCortadas(
        carasDeEscena,
        sprites,
        a.objetos.flatMap((o) =>
          o.kind === 'town' || o.kind === 'village' || o.kind === 'mine' || o.kind === 'node'
            ? [[o.at.x, o.at.y] as const]
            : [],
        ),
        W,
      ).length,
      puentesTapados: puentesTapados(sprites, puentes).length,
      pasosTapados: pasosTapados(sprites, pasos).length,
      pasosAtravesados: pasosAtravesados(sprites, pasos).length,
      sendasPorObjeto: sendasPorObjeto(caminos, a.objetos, a.terreno, W, H).length,
      trochasTapadas: trochasTapadas(sprites, trochas).length,
      sendasDeEstriboEnAgua: sendasDeEstriboEnAgua(trazos, puentes, vados, esAgua).length,
      nivelFueraDeSuRegion: nivelFueraDeSuRegion(a, nivel),
      desnivelesSinBarrera: desnivelesSinBarrera(a, nivel),
      pisablesTapadas: pisablesTapadas(sprites, a.terreno, W, H, perfilDe).length,
      cubiertaComoLaBarrera: ((c) => c.altas.length + c.regionesDensas.length)(
        cubiertaComoLaBarrera(sprites, a.suelo, a.region, W),
      ),
      cubiertaDeOtroNivel: cubiertaDeOtroNivel(sprites, pintado, W).length,
      espaldasSinReborde: espaldasSinReborde(
        sprites,
        rebordes,
        a.terreno,
        W,
        (i) => bajoLaHuella[i] === 1 || espaldasOcupadas.has(i),
      ).length,
      cimaDeOtroMaterial: cimaDeOtroMaterial(sprites, a.terreno, W, materialDeLaCimaEn).length,
      paredesTapadas: paredesTapadasPorLaMasa(sprites, perfilDe).length,
      caraDeOtroMaterial: caraDeOtroMaterial(rel.celdas, W, H, a.terreno, a.region, nivel).length,
      mesasEnLaCordillera: sprites.filter(
        (s) =>
          s.clase === 'masa' &&
          s.src?.startsWith('modulos/picos-arenisca/') === true &&
          esMesa('picos-arenisca', s),
      ).length,
      acantiladosLisos: acantiladosLisos(sprites, a.terreno, W, (i) => bajoLaHuella[i] === 1)
        .length,
      modulosQueFaltan: [...faltan].sort(),
    },
  };
}

/**
 * Las casillas de acantilado sin ninguna roca ni masa de `ALTO_DE_LO_ALTO` o
 * más con el pie en ellas (#205): lo alto que se lee como un suelo que se pisa.
 * No cuentan las de `bajoUnObjeto`, la huella de una ciudad, un pueblo o un
 * nodo, que tapa el objeto y donde no entra nada (su reserva). Es
 * `informe.acantiladosLisos`: antes de `cimaDeRoca`, 1 167 de 4 016 en 1-40 (la
 * cubierta y las piedras de lo alto no cuentan); con ella, 2, dos casillas
 * entre dos sendas donde ni el pico más estrecho cabe de 0,4.
 */
export function acantiladosLisos(
  sprites: readonly Pick<Sprite, 'clase' | 'alto' | 'x' | 'y'>[],
  terreno: readonly TerrainKind[],
  W: number,
  bajoUnObjeto: (i: number) => boolean,
): number[] {
  const conCima = new Set(
    sprites.filter(esDeLoAlto).map((s) => Math.floor(s.y) * W + Math.floor(s.x)),
  );
  const lisos: number[] = [];
  for (let i = 0; i < terreno.length; i++)
    if (terreno[i] === 'cliff' && !conCima.has(i) && !bajoUnObjeto(i)) lisos.push(i);
  return lisos;
}

/**
 * Lo más que tapa la cubierta de lo que se pisa en un suelo `comoLaBarrera`, de
 * media por región: la suma de los rectángulos de sus piezas (en casillas²,
 * con sus solapes) entre las casillas de la región. Antes de #184 era 1,28 de
 * media en las semillas de la auditoría (más que lo alto de un acantilado,
 * 0,75); con la cubierta rala, 0,31.
 */
export const HUELLA_DE_LO_PISABLE = 0.6;

/**
 * Las regiones de menos casillas no se miden por su media: en un enclave de una
 * casilla, un charco ancho de la ciénaga ya pasa de 1. Lo que se lee o no como
 * pisable es una extensión, no una casilla suelta.
 */
const REGION_QUE_SE_MIDE = 9;

/** El alto más alto que da `altoDeMata` en el suelo `s`. */
const altoMaximoDeMata = (s: Suelo) => CUBIERTA[s].alto * (MATA_MAS_BAJA + 0.6);

/**
 * Dónde la cubierta de lo que se pisa en un suelo `comoLaBarrera` vuelve a
 * imitar la barrera (#184): las piezas de cubierta con el pie en una casilla
 * pisable de esos suelos más altas que lo que les deja su esbeltez
 * (`tumbado`) —un árbol, una aguja a su alto—, y las regiones de esos suelos
 * (de `REGION_QUE_SE_MIDE` casillas o más) cuya cubierta tapa, de media por
 * casilla, más de `HUELLA_DE_LO_PISABLE`. La
 * suma es `informe.cubiertaComoLaBarrera`, y tiene que ser 0.
 *
 * `region` es la de `Analisis`: -1 en lo que no se pisa.
 */
export function cubiertaComoLaBarrera(
  sprites: readonly Sprite[],
  suelo: readonly Suelo[],
  region: Int32Array,
  W: number,
): { readonly altas: readonly Sprite[]; readonly regionesDensas: readonly number[] } {
  const altas: Sprite[] = [];
  const huella = new Map<number, number>();
  const casillas = new Map<number, number>();
  for (let i = 0; i < region.length; i++) {
    const r = region[i] as number;
    if (r >= 0 && CUBIERTA[suelo[i] as Suelo].comoLaBarrera)
      casillas.set(r, (casillas.get(r) ?? 0) + 1);
  }
  for (const s of sprites) {
    if (s.clase !== 'cubierta' || s.capa !== 0) continue;
    const i = Math.floor(s.y) * W + Math.floor(s.x);
    const r = region[i];
    if (r === undefined || r < 0) continue;
    const su = suelo[i] as Suelo;
    if (!CUBIERTA[su].comoLaBarrera) continue;
    // Un marcador (sin imagen) no tiene esbeltez: se mide por su alto.
    const tope = tumbado({ ...s, alto: altoMaximoDeMata(su) }, ESBELTEZ_DE_LO_PISABLE).alto;
    if (s.alto > tope + 1e-9) altas.push(s);
    const [x0, y0, x1, y1] = cajaDeSprite(s);
    huella.set(r, (huella.get(r) ?? 0) + (x1 - x0) * (y1 - y0));
  }
  const regionesDensas = [...huella]
    .filter(([r, h]) => {
      const n = casillas.get(r) as number;
      return n >= REGION_QUE_SE_MIDE && h / n > HUELLA_DE_LO_PISABLE;
    })
    .map(([r]) => r)
    .sort((p, q) => p - q);
  return { altas, regionesDensas };
}

/**
 * La cubierta que no es del suelo que se pinta donde tiene el pie
 * (`Escena.suelo`, `sueloQueSePinta`): la nieve y los abetos nevados de la
 * región baja sobre una meseta de lava (s13 (16-24, 4-7)), la hierba sobre un
 * cantil de nieve (s80 (18, 12-13)), las coles del huerto sobre la lava (s57
 * (0-5, 8)). Es `informe.cubiertaDeOtroNivel`, y tiene que ser 0. Un marcador
 * (sin imagen) no dice su hoja: no cuenta.
 */
export function cubiertaDeOtroNivel(
  sprites: readonly Pick<Sprite, 'clase' | 'src' | 'x' | 'y'>[],
  pintado: readonly Suelo[],
  W: number,
): Pick<Sprite, 'clase' | 'src' | 'x' | 'y'>[] {
  const hojas = new Map<Suelo, ReadonlySet<string>>();
  return sprites.filter((s) => {
    if (s.clase !== 'cubierta' || s.src === null) return false;
    const suelo = pintado[Math.floor(s.y) * W + Math.floor(s.x)] as Suelo;
    if (!hojas.has(suelo)) hojas.set(suelo, hojasDeLaCubierta(suelo));
    return !(hojas.get(suelo) as ReadonlySet<string>).has(s.src.split('/')[1] as string);
  });
}

/** Lo que el índice de obstáculos mira de un sprite: dónde cae su imagen y de qué clase es. */
export type Medible = ConImagen & Pick<Sprite, 'clase'>;

/** La medida con la que se aparta cada clase de lo que no tapa: su media anchura, por el rectángulo. */
const MEDIDA_DE_CLASE: Readonly<Record<Sprite['clase'], Medida | null>> = Object.fromEntries(
  Object.entries(APARTE).map(([c, r]) => [
    c,
    r === null ? null : { radio: r.semiancho, soloElPie: false },
  ]),
) as Record<Sprite['clase'], Medida | null>;

/** La media anchura más grande de lo que se aparta. */
const SEMIANCHO_MAXIMO = Math.max(...Object.values(APARTE).map((r) => r?.semiancho ?? 0));

/** Unas sendas como obstáculo: lo que se aparta del camino no pisa su pasillo, cada clase con su media anchura. */
export function formaDeLaSenda(trazos: readonly Senda[]): Forma<Medible> {
  return { trazos, alcance: SEMIANCHO_MAXIMO, mide: (s) => MEDIDA_DE_CLASE[s.clase] };
}

/**
 * Lo que la línea de cada muralla mira alrededor de su franja (#197): dónde se
 * apoya (otra barrera o su nodo, el borde o la huella de una ciudad o un pueblo) y el lado de cada casilla pisable. El lado es la
 * componente de lo que se pisa sin los nodos, en 8-vecinas: lo que el núcleo
 * llama región, derivado del terreno porque el escenógrafo no lee las regiones
 * declaradas (`MapaDeEscena`).
 */
export function alrededorDeMurallas(
  a: Pick<Analisis, 'W' | 'H' | 'terreno' | 'objetos' | 'franjaDe'>,
  huellas: readonly (readonly (readonly [number, number])[])[],
  nivel: ArrayLike<number>,
): Alrededor {
  const { W, H } = a;
  const dentro = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const nodo = new Uint8Array(W * H);
  for (const o of a.objetos)
    if (o.kind === 'node' || o.kind === 'town') nodo[o.at.y * W + o.at.x] = 1;
  /**
   * Los nodos de otra barrera, por su casilla: son la puerta de esa barrera y la
   * muralla que llega a uno acaba en ella. El nodo de acantilado de s699 (15,2)
   * une los dos lados de una franja de muro de 2×2 contra el borde; sin apoyo
   * allí, la línea se quedaba en el borde y los dos lados se juntaban por debajo.
   */
  const nodoDeOtra = new Map<number, string>();
  for (const o of a.objetos)
    if (o.kind === 'node' && o.barrera !== 'wall') nodoDeOtra.set(o.at.y * W + o.at.x, o.id);
  /** Bajo qué huellas cae cada casilla: las de una ciudad y un pueblo cercanos se pisan (s64 (5,9)). */
  const enHuella = new Map<number, string[]>();
  huellas.forEach((h, k) => {
    for (const [x, y] of h)
      enHuella.set(y * W + x, [...(enHuella.get(y * W + x) ?? []), `${CIUDAD}${k}`]);
  });
  const lado = new Int32Array(W * H).fill(-1);
  const pisa = (i: number) => !nodo[i] && !esBarrera(a.terreno[i] as TerrainKind);
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    if (lado[i] !== -1 || !pisa(i)) continue;
    lado[i] = n;
    const pila = [i];
    while (pila.length > 0) {
      const j = pila.pop() as number;
      const x = j % W;
      const y = Math.floor(j / W);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const k = (y + dy) * W + x + dx;
          if (!dentro(x + dx, y + dy) || lado[k] !== -1 || !pisa(k)) continue;
          lado[k] = n;
          pila.push(k);
        }
    }
    n++;
  }
  return {
    apoyos: (x, y) => {
      const cosas = new Set<string>();
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (!dentro(nx, ny)) {
            cosas.add('borde');
            continue;
          }
          const i = ny * W + nx;
          const t = a.terreno[i] as TerrainKind;
          if (t !== 'wall' && esBarrera(t)) cosas.add(`franja:${a.franjaDe[i]}`);
          const n = nodoDeOtra.get(i);
          if (n !== undefined) cosas.add(`nodo:${n}`);
          for (const c of enHuella.get(i) ?? []) cosas.add(c);
        }
      return [...cosas];
    },
    lado: (x, y) => (dentro(x, y) ? (lado[y * W + x] as number) : -1),
    bajoCiudad: (x, y) => (dentro(x, y) ? (enHuella.get(y * W + x) ?? []) : []),
    nivel: (x, y) => (dentro(x, y) ? (nivel[y * W + x] as number) : 0),
  };
}

/**
 * La senda pintada, sin arcén, como obstáculo de la muralla (#193): el muro
 * puede llegar hasta ella, porque es la barrera que el camino cruza por su
 * puerta, pero no taparla. Solo mira la clase `muro`.
 */
export function sendaParaLaMuralla(trazos: readonly Senda[]): Obstaculos<Medible> {
  const medida: Medida = { radio: SEMIANCHO_DE_LA_HUELLA, soloElPie: false };
  return new Obstaculos<Medible>([
    { trazos, alcance: medida.radio, mide: (s) => (s.clase === 'muro' ? medida : null) },
  ]);
}

/**
 * Los sprites de una clase que se aparta del camino cuyo rectángulo pisa su
 * pasillo. Lo cuenta el informe y lo recuenta el test por su cuenta.
 */
export function sobreLaSenda(sprites: readonly Sprite[], trazos: readonly Senda[]): Sprite[] {
  const senda = new Obstaculos([formaDeLaSenda(trazos)]);
  return sprites.filter((s) => s.capa === 0 && senda.pisa(s));
}

const MEDIDA_DE_PARED: Medida = { radio: SEMIANCHO_DE_PARED, soloElPie: false };

/**
 * El tablero de cada puente como obstáculo: lo que se aparta del camino y la
 * pared no lo tapan. Solo lo mira lo que se pintaría después del puente, y por
 * tanto encima: un volumen (`esVolumen`, con el alto que se pregunta) que va
 * detrás de él en el orden del pintor (`ordenDeVolumenes`), los de `separar`.
 * Lo plano va al suelo, debajo del puente; lo de detrás lo tapa el puente a él.
 * Es la única regla de profundidad de los puentes: la de esta puerta y la de
 * `laderasMalCubiertas`.
 *
 * Apartando también lo de detrás, la cara de una isleta o de la orilla de al
 * lado se quedaba sin pared y se leía como un rectángulo de roca lisa.
 */
export function formasDeLosTableros(
  puentes: readonly Pick<Puente, 'tablero' | 'centro'>[],
): Forma<Medible>[] {
  return puentes.map(({ centro: [x, y], tablero }) => ({
    trazos: [tablero],
    alcance: Math.max(SEMIANCHO_MAXIMO, SEMIANCHO_DE_PARED),
    mide: (s, alto) =>
      vaDelante({ x: s.x, y: s.y, clase: s.clase, alto }, { x, y })
        ? s.clase === 'pared'
          ? MEDIDA_DE_PARED
          : MEDIDA_DE_CLASE[s.clase]
        : null,
  }));
}

/**
 * Lo que una masa se aparta de la silueta de una pared que taparía, en
 * casillas: algo más que la mitad del hueco entre dos columnas del perfil (32
 * por módulo, ~0,06 en una frontal de 2), para que no se cuele entre ellas.
 */
export const MARGEN_DE_LA_PARED = 0.05;

const MEDIDA_DE_LA_PARED: Medida = { radio: MARGEN_DE_LA_PARED, soloElPie: false };

/**
 * Las paredes del desnivel (`esPiezaDelRelieve`) como obstáculo de la masa
 * (#216): un pico o un árbol que se pintaría después de una pared (`vaDelante`,
 * la regla de los tableros) no cubre su silueta; se encoge o no va. Lo de
 * detrás no se mira: la pared lo tapa a él, y es lo que dice que la cordillera
 * está en lo alto. Antes la cordillera plantaba picos delante de su propia
 * pared, del lado bajo y en las filas de más al sur, y la pared asomaba a trozos
 * (692 de 2 150 piezas tapadas en 1-40; bajo una montaña, 447 de 837).
 *
 * Cada pared es una columna por franja de su perfil, de lo alto de su silueta
 * al pie de su caja: la misma silueta que mide `paredesTapadasPorLaMasa`.
 */
export function formasDeLasParedes(
  sprites: readonly Sprite[],
  perfilDe: PerfilDe,
): Forma<Medible>[] {
  return sprites.filter(esPiezaDelRelieve).map((p) => {
    const caja = cajaDeSprite(p);
    const perfil = perfilDe(p);
    const n = perfil?.length ?? 1;
    const columnas: Senda[] = [];
    // El medio de cada franja, y los dos bordes de la caja.
    for (const k of [0, ...Array.from({ length: n }, (_, k) => k + 0.5), n]) {
      const x = caja[0] + ((caja[2] - caja[0]) * k) / n;
      const arriba = altoDeLaSilueta(p, perfil, x, caja) ?? caja[1];
      columnas.push([
        [x, arriba],
        [x, caja[3]],
      ]);
    }
    return {
      trazos: columnas,
      alcance: MARGEN_DE_LA_PARED,
      mide: (s, alto) =>
        s.clase === 'masa' && vaDelante({ x: s.x, y: s.y, clase: s.clase, alto }, p)
          ? MEDIDA_DE_LA_PARED
          : null,
    };
  });
}

/** Si `s` se pinta después de lo que está en `t` y, por tanto, lo taparía. */
const vaDelante = (s: Pick<Sprite, 'x' | 'y' | 'clase' | 'alto'>, t: Pick<Sprite, 'x' | 'y'>) =>
  esVolumen(s) && ordenDeVolumenes(s, t) > 0;

/**
 * La reserva de un objeto: el disco de radio `radio` alrededor del centro de su
 * casilla, un trazo de un solo punto. Lo que se aparta no apoya el pie en él y,
 * si es un volumen que se pinta después del objeto (`vaDelante`, la regla de
 * los tableros), tampoco lo cubre con su rectángulo: un árbol al sur de una
 * mina crecía hasta taparle la puerta (#151). Antes, el arbolillo se sondeaba a
 * 0,45 y 0,8 por encima del pie; las masas y las rocas, nada.
 *
 * La pared y la muralla no se apartan: miran la reserva por sus puntos (`en`).
 */
export function reservaDe(
  o: Pick<MapObject, 'at'>,
  radio: number,
  objeto: Pick<Sprite, 'x' | 'y'>,
): Forma<Medible> {
  const pie: Medida = { radio, soloElPie: true };
  const caja: Medida = { radio, soloElPie: false };
  return {
    trazos: [[[o.at.x + 0.5, o.at.y + 0.5]]],
    alcance: radio,
    mide: (s, alto) =>
      APARTE[s.clase] === null
        ? null
        : vaDelante({ x: s.x, y: s.y, clase: s.clase, alto }, objeto)
          ? caja
          : pie,
  };
}

/**
 * La media anchura del eje de un nodo de paso que no pisa ningún volumen: la
 * del pasillo de las masas, para que el collado se lea como el hueco que abre
 * una senda en una cordillera (#173).
 */
export const SEMIANCHO_DEL_PASO = SEMIANCHO_DEL_PASILLO_DE_MASA;

const MEDIDA_DEL_PASO: Medida = { radio: SEMIANCHO_DEL_PASO, soloElPie: false };

/**
 * Los ejes de los nodos de paso (`pasosALaVista`) como obstáculo: ningún
 * volumen de lo que se aparta los pisa. Lo bajo no cuenta: va al suelo, debajo
 * de todo, y no tapa el collado; quitarlo también dejaba una franja recta y
 * pelada donde no hay camino. Así, la masa, que siempre es volumen, se encoge
 * hasta salir, y lo demás puede quedarse en el umbral del volumen, como suelo.
 */
export function formaDeLosPasos(pasos: readonly PasoALaVista[]): Forma<Medible> {
  return {
    trazos: pasos.flatMap((p) => p.eje),
    alcance: SEMIANCHO_DEL_PASO,
    mide: (s, alto) =>
      APARTE[s.clase] !== null && esVolumen({ clase: s.clase, alto }) ? MEDIDA_DEL_PASO : null,
  };
}

/**
 * Los nodos de paso cuyo eje pisa el rectángulo de un volumen de una clase que
 * se aparta (`APARTE`), medido desde lo puesto y con un pasillo por nodo: no
 * pregunta a la puerta (`formaDeLosPasos`), así que si se equivoca, esto lo ve. No
 * cuentan los muros y las paredes, que no se apartan de nada, ni lo horneado.
 */
export function pasosTapados(
  sprites: readonly Sprite[],
  pasos: readonly PasoALaVista[],
): PasoALaVista[] {
  const volumenes = sprites.filter((s) => APARTE[s.clase] !== null && s.capa === 0 && esVolumen(s));
  return pasos.filter((p) => {
    const eje = pasilloDe(p.eje, SEMIANCHO_DEL_PASO);
    return volumenes.some((s) => eje.pisa(s));
  });
}

/**
 * Los nodos de paso de montaña o de bosque cuya propia pieza, la que no es un
 * hito, pisa su eje (#203): la del paso de montaña era un par de picos con la
 * garganta de norte a sur, y en 21 de 23 nodos de la auditoría 4 el camino o la
 * trocha llegaba de lado y se metía bajo la roca. `pasosTapados` no lo veía:
 * mira lo que se aparta, y la pieza es el objeto. La puerta de muralla no
 * cuenta, que se cruza por ella. Tiene que ser 0.
 */
export function pasosAtravesados(
  sprites: readonly Sprite[],
  pasos: readonly PasoALaVista[],
): PasoALaVista[] {
  return pasos.filter((p) => {
    if (p.barrera === 'wall') return false;
    const eje = pasilloDe(p.eje, SEMIANCHO_DEL_PASO);
    return sprites.some(
      (s) => s.objeto?.id === p.id && !esHito(s.src?.replace(/\.webp$/, '') ?? null) && eje.pisa(s),
    );
  });
}

/**
 * Las minas y los pueblos a los que la senda no llega como en el HoMM (#188):
 * con un solo tramo, que sale de su puerta, la casilla de debajo. Si la puerta
 * no se pisa o cae fuera del mapa, vale cualquier tramo, pero uno. Se mide
 * sobre los tramos que se pintan, de centro a centro de casilla, no sobre el
 * plan: si el trazado se equivoca, esto lo ve.
 */
export function sendasPorObjeto(
  caminos: readonly (readonly [number, number, number, number])[],
  objetos: readonly MapObject[],
  terreno: readonly TerrainKind[],
  W: number,
  H: number,
): MapObject[] {
  return objetos.filter((o) => {
    if (o.kind !== 'mine' && o.kind !== 'village') return false;
    const cx = o.at.x + 0.5;
    const cy = o.at.y + 0.5;
    const llegan = caminos.flatMap(([x0, y0, x1, y1]) =>
      x0 === cx && y0 === cy ? [[x1, y1]] : x1 === cx && y1 === cy ? [[x0, y0]] : [],
    );
    if (llegan.length !== 1) return true;
    const conPuerta =
      o.at.y + 1 < H && !esBarrera(terreno[(o.at.y + 1) * W + o.at.x] as TerrainKind);
    const [x, y] = llegan[0] as number[];
    return conPuerta && (x !== cx || y !== cy + 1);
  });
}

const MEDIDA_DE_LA_TROCHA: Medida = { radio: SEMIANCHO_DE_LA_TROCHA, soloElPie: false };

/**
 * Las trochas de los pasos sin camino como obstáculo (#190): nada de lo que se
 * aparta del camino las pisa, ni lo bajo, que en un bosque nevado es un
 * tapiz de abetos de 0,6 que la tapaba entera. Más estrecho que el eje del
 * paso (`formaDeLosPasos`), que solo aparta volúmenes: la trocha se lee como un
 * hueco en lo bajo, no como una franja pelada.
 */
export function formaDeLasTrochas(trochas: readonly Senda[]): Forma<Medible> {
  return {
    trazos: trochas,
    alcance: SEMIANCHO_DE_LA_TROCHA,
    mide: (s) => (APARTE[s.clase] !== null ? MEDIDA_DE_LA_TROCHA : null),
  };
}

/**
 * Las trochas que pisa el rectángulo de algo que se aparta, medido desde lo
 * puesto y sin preguntar a la puerta (`formaDeLasTrochas`): si se equivoca,
 * esto lo ve.
 */
export function trochasTapadas(sprites: readonly Sprite[], trochas: readonly Senda[]): Senda[] {
  const cuentan = sprites.filter((s) => APARTE[s.clase] !== null && s.capa === 0);
  return trochas.filter((t) => {
    const arcen = pasilloDe([t], SEMIANCHO_DE_LA_TROCHA);
    return cuentan.some((s) => arcen.pisa(s));
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

/** La hoja de una rampa (#225, §35): `rampa-<material>-<caída>`, sin estirar. */
export function hojaDeRampa(r: Pick<Rampa, 'material' | 'caida'>): string {
  return `rampa-${materialDeCara(r.material).nombre}-${r.caida}`;
}

/** Las tres piezas de una hoja de rampa, o null si le falta alguna: sin ellas va la bajada de siempre. */
export function piezasDeRampa(
  catalogo: Catalogo,
  hoja: string,
): Readonly<Record<PiezaDeRampa, ModuloDeRampa>> | null {
  const ms = catalogo.hojas[hoja];
  if (ms === undefined || !esHojaDeRampa(hoja)) return null;
  const fuera: Partial<Record<PiezaDeRampa, ModuloDeRampa>> = {};
  for (const m of ms) if (m.rampa !== undefined) fuera[m.rampa.pieza] = m as ModuloDeRampa;
  return PIEZAS_DE_RAMPA.every((p) => fuera[p] !== undefined)
    ? (fuera as Record<PiezaDeRampa, ModuloDeRampa>)
    : null;
}

/**
 * Lo que entra en el costado de una rampa la frontal que tapa su extremo de
 * fuera: menos de lo que el costado sigue a su alto entero (0,4, `ENTERO` de la
 * guía, `tools/taller/rampas.ts`), que de ahí baja en diagonal.
 */
const DENTRO_DEL_COSTADO = 0.3;

/**
 * Lo que se adelanta la clave de un costado de rampa a su pie: lo pintan antes
 * las frontales de su cara, que van a 0,05 ± 0,06 de él y tapan su corte recto.
 */
const COSTADO_DETRAS_DE_LA_FRONTAL = 0.1;

/**
 * Dónde va la pieza `m` de la rampa `r`: los dos extremos de su filo sobre los
 * de su tramo (`TRAMO_DE_PIEZA_DE_RAMPA`), de los que sale la escala. El cuerpo
 * se pinta después de las paredes de su fila, como una bajada; los costados,
 * antes que las frontales de al lado.
 */
export function spriteDeRampa(m: ModuloDeRampa, hoja: string, r: Rampa): Sprite {
  const [a, b] = TRAMO_DE_PIEZA_DE_RAMPA[m.rampa.pieza];
  const filo = r.y + 1;
  const pie = filo + r.caida * ALTO_DE_NIVEL;
  const [ma, mb] = m.rampa.filo;
  const cuerpo = m.rampa.pieza === 'cuerpo';
  const tono = tonoDe(hoja);
  return {
    ...(tono === undefined ? {} : { tono }),
    ...sobreDosPuntos(
      m,
      [ma, mb],
      [
        [r.x + a, filo],
        [r.x + b, filo],
      ],
      (mb[0] - ma[0]) / (b - a),
      1,
      cuerpo ? pie + DETRAS_DEL_PIE : pie - COSTADO_DETRAS_DE_LA_FRONTAL,
    ),
    clase: 'pared',
    color: cuerpo ? COLOR_DE_BAJADA : '#4c463e',
    capa: 0,
    sombra: !cuerpo,
    filaAlta: r.y,
  };
}

/** Dónde quedaron los dos extremos del filo de una pieza de rampa ya colocada: lo inverso de `spriteDeRampa`. */
function filoColocado(
  m: ModuloDeRampa,
  s: Pick<Sprite, 'x' | 'y' | 'ax' | 'ay' | 'nw' | 'nh' | 'alto' | 'ancho'>,
): readonly [readonly [number, number], readonly [number, number]] {
  return [enElMapa(s, m.rampa.filo[0]), enElMapa(s, m.rampa.filo[1])];
}

/**
 * Las rampas sin sus piezas, cada una dicha (#225): cada una lleva exactamente
 * un cuerpo y un costado a cada lado con su filo en su tramo
 * (`TRAMO_DE_PIEZA_DE_RAMPA`), y ninguna frontal (`paredes-*`) apoyada en su
 * fila tapa el hueco del cuerpo. Se reconstruye desde lo puesto.
 */
export function rampasSinSusPiezas(
  sprites: readonly Sprite[],
  rampas: readonly Rampa[],
  catalogo: Catalogo,
): string[] {
  const { rampas: deRampa } = modulosDelRelieve(catalogo);
  const mal: string[] = [];
  for (const r of rampas) {
    const filo = r.y + 1;
    const pie = filo + r.caida * ALTO_DE_NIVEL;
    const donde = `rampa en ${r.x},${r.y}`;
    for (const p of PIEZAS_DE_RAMPA) {
      const [a, b] = TRAMO_DE_PIEZA_DE_RAMPA[p];
      const n = sprites.filter((s) => {
        const m = s.src === null ? undefined : deRampa.get(s.src);
        if (m === undefined || m.rampa.pieza !== p) return false;
        const [fa, fb] = filoColocado(m, s);
        return cerca(fa, [r.x + a, filo]) && cerca(fb, [r.x + b, filo]);
      }).length;
      if (n !== 1) mal.push(`${donde}: ${n} piezas ${p} en su sitio`);
    }
    for (const s of sprites) {
      if (s.clase !== 'pared' || s.src?.includes('/paredes-') !== true) continue;
      const [x0, , x1] = cajaDeSprite(s);
      if (
        Math.abs(s.y - pie) <= 0.3 &&
        x1 > r.x + HOLGURA_DE_JUNTA &&
        x0 < r.x + 1 - HOLGURA_DE_JUNTA
      )
        mal.push(`${donde}: la frontal ${s.src} en ${s.x.toFixed(2)} tapa el hueco`);
    }
  }
  return mal;
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
 * La fila de las casillas altas de una diagonal (`Sprite.filaAlta`): la de
 * arriba de su vértice. La convexa cuelga de una de ella (NO o NE); la cóncava,
 * de las dos y de la de abajo que dobla la esquina, que también está delante.
 */
const filaAltaDeDiagonal = (c: Celda): number => c.vy - 1;

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
    filaAlta: filaAltaDeDiagonal(c),
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
    filaAlta: filaAltaDeDiagonal(c),
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
    filaAlta: b.alto[1],
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
    filaAlta: b.alto[1],
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
 * caja de una pared que la puerta no dejó entrar en alguno de sus puntos
 * (`puntosDeCelda`), por un puente que taparía (`rechazos`). La reserva de un
 * objeto ya no es razón: la pared pasa por detrás de él (#221).
 */
export function vaciaPorque(c: Celda, rechazos: readonly Rechazo[]): string | null {
  const puntos = puntosDeCelda(c);
  for (const { caja, razon } of rechazos)
    if (puntos.some(([x, y]) => x >= caja[0] && x <= caja[2] && y >= caja[1] && y <= caja[3]))
      return razon;
  return null;
}

/**
 * Qué hace una pared con un punto en la reserva de un objeto (`ponerPared`,
 * #221): el pedregal no va (`fuera`); la frontal y la ladera pasan por detrás
 * si no lo tapan a él ni a su camino, encogidas si hace falta (`detras`); y la
 * diagonal, además, se ordena detrás del objeto que taparía (`ordenada`).
 */
type Reserva = 'fuera' | 'detras' | 'ordenada';

/** Una pared que la puerta no dejó entrar: lo que ocupaba y por qué. */
export interface Rechazo {
  readonly caja: Caja;
  readonly razon: 'objeto' | 'puente';
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

/** Los módulos de diagonales, de bajadas y de rampas del catálogo por su `src`. */
function modulosDelRelieve(catalogo: Catalogo): {
  diagonales: Map<string, ModuloDeDiagonal>;
  bajadas: Map<string, ModuloDeBajada>;
  rampas: Map<string, ModuloDeRampa>;
} {
  const diagonales = new Map<string, ModuloDeDiagonal>();
  const bajadas = new Map<string, ModuloDeBajada>();
  const rampas = new Map<string, ModuloDeRampa>();
  for (const [hoja, ms] of Object.entries(catalogo.hojas))
    for (const m of ms) {
      if (esHojaDeDiagonal(hoja) && m.diagonal !== undefined)
        diagonales.set(m.src, m as ModuloDeDiagonal);
      if (esHojaDeBajada(hoja) && m.bajada !== undefined) bajadas.set(m.src, m as ModuloDeBajada);
      if (esHojaDeRampa(hoja) && m.rampa !== undefined) rampas.set(m.src, m as ModuloDeRampa);
    }
  return { diagonales, bajadas, rampas };
}

/**
 * Lo que pinta el camino de una bajada: su pieza de `bajadas-*` (o su marcador)
 * o el cuerpo de una rampa (#225). No el costado, que es pared.
 */
function esCaminoDeBajada(
  s: Sprite,
  m: Pick<ReturnType<typeof modulosDelRelieve>, 'bajadas' | 'rampas'>,
): boolean {
  if (s.src === null) return s.color === COLOR_DE_BAJADA;
  return m.bajadas.has(s.src) || m.rampas.get(s.src)?.rampa.pieza === 'cuerpo';
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

/**
 * El `arriba` de una bajada ya colocada (su pieza, su marcador o, la de una
 * rampa, el medio del filo de su cuerpo), o null si `s` no es una bajada.
 */
function arribaColocado(
  s: Sprite,
  { bajadas, rampas }: Pick<ReturnType<typeof modulosDelRelieve>, 'bajadas' | 'rampas'>,
  b: Bajada,
): readonly [number, number] | null {
  const m = s.src === null ? undefined : bajadas.get(s.src);
  if (m !== undefined) return enElMapa(s, m.bajada.arriba);
  const r = s.src === null ? undefined : rampas.get(s.src);
  if (r !== undefined) {
    if (r.rampa.pieza !== 'cuerpo' || b.deUnaRampa !== true) return null;
    const [fa, fb] = filoColocado(r, s);
    return [(fa[0] + fb[0]) / 2, (fa[1] + fb[1]) / 2];
  }
  if (s.src === null && s.color === COLOR_DE_BAJADA) {
    // El marcador va en la x del pie, con la clave por debajo de él.
    const [x, y] = abajoDe(b);
    return Math.abs(s.x - x) <= HOLGURA_DE_JUNTA && s.y >= y ? b.arriba : null;
  }
  return null;
}

/**
 * Los tramos de la rampa de cada nodo entre dos niveles sin camino (#143): del
 * nodo a cada casilla de su eje que tiene al lado (`ejeDelPaso`), como si
 * fueran de camino. `bajadasDe` se queda con los que cruzan una pared hacia la
 * cámara o de lado. Ni los puentes, que son su propio paso, ni los nodos con
 * camino, cuya bajada ya sale de él.
 */
export function tramosDeLasRampas(map: MapaDeEscena, a: Analisis): TramoDeCamino[] {
  return a.red.nodos.flatMap((n) => {
    if (n.ciudad || a.puentes.has(n.id) || !nodoEntreNiveles(a, n.regiones)) return [];
    if (pasaElCamino(map.caminos.tramos, n.at)) return [];
    return ejeDelPaso(n.at, a.W, map.terrain).flatMap((linea) =>
      linea.flatMap(([px, py]): TramoDeCamino[] => {
        const dx = Math.sign(Math.floor(px) - n.at.x);
        const dy = Math.sign(Math.floor(py) - n.at.y);
        if (dx === 0 && dy === 0) return [];
        return [[n.at, { x: n.at.x + dx, y: n.at.y + dy }]];
      }),
    );
  });
}

/**
 * Los nodos entre dos niveles sin camino que no llevan la rampa de una bajada
 * (#143), por su id: ninguna bajada sale ni llega a su casilla, y alguna
 * casilla de su eje a otro nivel bajaría hacia la cámara o de lado (la que baja
 * al norte va de espaldas y su pared no se ve). Si ninguna casilla de su eje
 * está a otro nivel, el eje no cruza el desnivel y también cuenta. Los nodos
 * con camino, y las ciudades, bajan por el camino (`bajadasSinPieza`).
 */
export function nodosSinRampa(
  map: MapaDeEscena,
  a: Analisis,
  nivel: ArrayLike<number>,
  bajadas: readonly Bajada[],
): string[] {
  const tramos = tramosDeLasRampas(map, a);
  const N = (p: { x: number; y: number }) => nivel[p.y * a.W + p.x] as number;
  return a.red.nodos.flatMap((n) => {
    if (n.ciudad || a.puentes.has(n.id) || !nodoEntreNiveles(a, n.regiones)) return [];
    if (pasaElCamino(map.caminos.tramos, n.at)) return [];
    const enSuCasilla = ([x, y]: readonly [number, number]) => x === n.at.x && y === n.at.y;
    if (bajadas.some((b) => enSuCasilla(b.alto) || enSuCasilla(b.bajo))) return [];
    const cruzan = tramos.filter(([p, q]) => enSuCasilla([p.x, p.y]) && N(q) !== N(p));
    // De la casilla alta a la baja: si baja al norte (dy < 0), de espaldas.
    const deEspaldas = ([p, q]: (typeof cruzan)[number]) =>
      (N(p) > N(q) ? q.y - p.y : p.y - q.y) < 0;
    return cruzan.length > 0 && cruzan.every(deEspaldas) ? [] : [n.id];
  });
}

/** Las bajadas sin su pieza (o su marcador) con el `arriba` en su sitio, cada una dicha. */
export function bajadasSinPieza(
  sprites: readonly Sprite[],
  bajadas: readonly Bajada[],
  catalogo: Catalogo,
): string[] {
  const m = modulosDelRelieve(catalogo);
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
  const m = modulosDelRelieve(catalogo);
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
      if (esCaminoDeBajada(s, m)) continue;
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
 * Desde cuánto tapada se ve cortada la senda, en casillas de su trazo: un
 * tramo más corto queda bajo el labio de una pared y se sigue leyendo.
 */
export const SENDA_CORTADA = 0.5;

/**
 * Lo que la senda deja quieto a cada lado de la rampa de una bajada (#206): ahí
 * la cruza la pared por la bajada, que la pinta encima, y apartarla movería el
 * filo por donde cruza.
 */
const JUNTO_A_LA_RAMPA = 0.45;

/**
 * Desde cuánto la senda apartada no mira un acantilado, un muro ni una
 * cordillera (#206): a media casilla de su canto, del centro de la casilla a lo
 * largo de un eje. Más cerca, no se le arrima más de lo que ya estaba. Con
 * 0,75 o 0,65 apartaba algo más (6,3 y 6,2 tramos por mapa frente a 6,55) y
 * rompía las cumbres de #204.
 */
const LEJOS_DE_LA_BARRERA = 1;

/**
 * Qué del relieve tapa el punto `(x, y)` del suelo: `'bajada'` si lo pinta una
 * bajada —la rampa, que es camino—, `'pared'` si cae bajo la silueta de una
 * frontal, una ladera o una diagonal (`tapaElPunto`) y no lo tapa encima un
 * objeto que se pinta después (por su caja: la pared que pasa por detrás de una
 * ciudad, #221), o null. El pedregal no cuenta: es un peñasco suelto, no la
 * pared. Lo preguntan el contador
 * (`sendaBajoElRelieve`) y la senda que se aparta de lo alto
 * (`apartarDeLoQueTapa`, #206): una sola regla de qué la esconde.
 */
export function loQueTapa(
  sprites: readonly Sprite[],
  catalogo: Catalogo,
): (x: number, y: number) => 'pared' | 'bajada' | null {
  const m = modulosDelRelieve(catalogo);
  const perfilDe = perfilesDelCatalogo(catalogo);
  const esBajada = (s: Sprite) => esCaminoDeBajada(s, m);
  // Las paredes por casilla de su caja: un punto mira solo las de la suya.
  const porCasilla = new Map<number, Sprite[]>();
  for (const s of sprites) {
    if (s.clase !== 'pared' || s.src?.includes('/rocas-caidas/') === true) continue;
    const [x0, y0, x1, y1] = cajaDeSprite(s);
    for (let y = Math.floor(y0); y <= Math.floor(y1); y++)
      for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
        const k = y * 4096 + x;
        const lista = porCasilla.get(k);
        if (lista === undefined) porCasilla.set(k, [s]);
        else lista.push(s);
      }
  }
  const objetos = sprites
    .filter((s) => s.clase === 'objeto')
    .map((o) => ({ y: o.y, caja: cajaDeSprite(o) }));
  /** Si lo que pinta `s` en `(x, y)` lo tapa un objeto que se pinta después (#221). */
  const bajoUnObjeto = (s: Sprite, x: number, y: number) =>
    objetos.some(
      (o) => o.y > s.y && x >= o.caja[0] && x <= o.caja[2] && y >= o.caja[1] && y <= o.caja[3],
    );
  return (x, y) => {
    let pared = false;
    for (const s of porCasilla.get(Math.floor(y) * 4096 + Math.floor(x)) ?? []) {
      if (!tapaElPunto(s, perfilDe, x, y)) continue;
      if (esBajada(s)) return 'bajada';
      if (!bajoUnObjeto(s, x, y)) pared = true;
    }
    return pared ? 'pared' : null;
  };
}

/**
 * Los tramos de senda pintada que desaparecen bajo una pieza del relieve —una
 * frontal, una ladera o una diagonal—, cada uno dicho: su trazo, mirado cada
 * `PASO_POR_EL_TABLERO`, cae bajo la silueta de una pared (`tapaElPunto`) en
 * `SENDA_CORTADA` casillas seguidas o más. La bajada no cuenta, ni lo que tapa
 * ella: es la rampa que lleva la senda por la pared, a propósito (R5). Se mira
 * la huella entera, su centro y sus dos bordes a la media anchura de
 * `ANCHO_DE_SENDA`: lo que cuenta es que la senda desaparezca, no que una
 * pared le muerda el borde (la auditoría de 08-10-2026 miró solo el centro de
 * la senda de 0,2 y contó 589 tramos en 1-40).
 */
export function sendaBajoElRelieve(
  sprites: readonly Sprite[],
  sendas: readonly Senda[],
  catalogo: Catalogo,
): string[] {
  return tramosBajoElRelieve(sprites, sendas, catalogo).map(
    ({ desde, largo }) =>
      `senda bajo el relieve desde ${desde[0].toFixed(2)},${desde[1].toFixed(2)}: ${largo.toFixed(2)} casillas`,
  );
}

/** Los tramos de `sendaBajoElRelieve`: de dónde salen y cuánto miden. */
function tramosBajoElRelieve(
  sprites: readonly Sprite[],
  sendas: readonly Senda[],
  catalogo: Catalogo,
): { readonly desde: readonly [number, number]; readonly largo: number }[] {
  const queTapa = loQueTapa(sprites, catalogo);
  const tapado = (x: number, y: number): boolean => queTapa(x, y) === 'pared';
  const fuera: { desde: readonly [number, number]; largo: number }[] = [];
  for (const senda of sendas) {
    let desde: readonly [number, number] | undefined;
    let largo = 0;
    const cerrar = () => {
      if (desde !== undefined && largo >= SENDA_CORTADA - 1e-9) fuera.push({ desde, largo });
      desde = undefined;
      largo = 0;
    };
    for (let i = 0; i + 1 < senda.length; i++) {
      const [ax, ay] = senda[i] as readonly [number, number];
      const [bx, by] = senda[i + 1] as readonly [number, number];
      const l = Math.hypot(bx - ax, by - ay);
      if (l === 0) continue;
      const n = Math.max(1, Math.round(l / PASO_POR_EL_TABLERO));
      // La normal a la media anchura de la huella: se mira el centro y los dos bordes.
      const nx = (-(by - ay) / l) * (ANCHO_DE_SENDA / 2);
      const ny = ((bx - ax) / l) * (ANCHO_DE_SENDA / 2);
      for (let k = 0; k < n; k++) {
        const x = ax + ((bx - ax) * k) / n;
        const y = ay + ((by - ay) * k) / n;
        if (tapado(x, y) && tapado(x + nx, y + ny) && tapado(x - nx, y - ny)) {
          desde ??= [x, y];
          largo += l / n;
        } else cerrar();
      }
    }
    cerrar();
  }
  return fuera;
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
  const m = modulosDelRelieve(catalogo);
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
/**
 * Los dos ruidos de los macizos de la escena de `semilla`: el de la cresta,
 * dónde una cumbre y dónde un collado, y el de los grupos, dónde se junta la
 * cordillera en masas y dónde se abre en claros (#218). Exportado para que los
 * tests miren el mismo macizo que la escena.
 */
export function ruidosDelMacizo(semilla: number): {
  readonly cresta: (x: number, y: number) => number;
  readonly grupos: (x: number, y: number) => number;
} {
  return {
    cresta: ruidoSuave(semilla * 131 + 71, PASO_DEL_RUIDO),
    grupos: ruidoSuave(semilla * 487 + 29, PASO_DE_LOS_GRUPOS),
  };
}

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

/**
 * `s` pintado en el mismo sitio pero ordenado como si su pie estuviera en `y`:
 * se mueve el pie y el ancla lo mismo, en sentidos contrarios.
 */
function ordenadoEn(s: Sprite, y: number): Sprite {
  return { ...s, y, ay: s.ay - ((s.y - y) * s.nh) / s.alto };
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
