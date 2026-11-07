/**
 * Las tablas y los ayudantes sueltos de `componer` (`colocar.ts`): qué hoja viste
 * cada barrera y cada suelo, los altos de la masa y de lo alto de un acantilado,
 * las cumbres, la cubierta de cada suelo (y la de lo que se pisa, tumbada), los
 * árboles, lo que cada clase se aparta del camino (`APARTE`), el tono y el
 * material de cada cara, las medidas de la muralla, de los hitos y de los
 * objetos, el radio de la reserva de un objeto, los ruidos de los macizos y la
 * clave del pintor de lo que se pinta por detrás de otra cosa (`ordenadoEn`,
 * `detrasDe`).
 *
 * Datos y funciones puras, sin estado: el orden de las tiradas es de `componer`.
 */
import type { Barrera, Suelo } from '@core/map/terrain.js';
import type { MapObject } from '@core/map/tipos.js';
import { hojaDelSrc } from '../bordes.js';
import type { Modulo } from '../catalogo.js';
import { MODULOS_DE_LA_LABRANZA } from '../labranza.js';
import {
  type MaterialDePico,
  materialDePico,
  PASO_DE_LOS_GRUPOS,
  PASO_DEL_RUIDO,
} from '../macizo.js';
import { ANCHO_DEL_TRAMO_HORIZONTAL } from '../muralla.js';
import { type Caja, type ConImagen, cajaDeSprite } from '../pasillo.js';
import { claveDe } from '../pintar.js';
import { PX_POR_CASILLA_DEL_PUEBLO } from '../recinto/octogono.js';
import { SEMIANCHO_DEL_PASILLO, SEMIANCHO_DEL_PASILLO_DE_MASA } from '../sendas.js';
import type { Sprite } from './sprite.js';

/**
 * Lo que encoge una clase baja junto a la senda: por debajo de esta fracción de
 * su alto se quita (decisión del usuario, 05-10-2026: encoger antes que quitar).
 */
export const ENCOGER_HASTA = 0.4;

/** Una masa encogida por debajo de este alto, en casillas, ya no se lee como árbol ni como pico. */
export const ALTO_MINIMO_DE_MASA = 0.3;

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
export const ALTO_DE_LA_CIMA = 0.55;
export const ALTO_EN_LO_ANCHO = 1.3;

/**
 * Cuántos picos de lo alto lleva una casilla de acantilado según cuántas de
 * sus cuatro vecinas son acantilado: uno en una cresta de una casilla, dos en
 * el borde de una meseta y tres dentro, que con uno solo seguía viéndose la
 * nieve entre ellos como un llano (s443 (15, 10)).
 */
export const picosDeLaCima = (vecinas: number): number => Math.min(3, Math.max(1, vecinas - 1));

/** Lo menos que se apartan, en casillas, dos picos puestos en la misma casilla. */
export const SEPARACION_EN_LA_CIMA = 0.45;

/** Si `s` es roca o masa de `ALTO_DE_LO_ALTO` o más: lo que marca una casilla como barrera. */
export const esDeLoAlto = (s: Pick<Sprite, 'clase' | 'alto'>): boolean =>
  (s.clase === 'roca' || s.clase === 'masa') && s.alto >= ALTO_DE_LO_ALTO;

/**
 * Dónde se prueba a poner el relleno de una casilla de bosque o cordillera sin
 * ningún dardo, relativo a su esquina: una rejilla de 4 × 4, de más cerca a más
 * lejos del centro de su mitad baja (el pie de un sprite va abajo; la imagen
 * crece hacia arriba).
 */
export const SITIOS_DE_RELLENO: readonly (readonly [number, number])[] = [
  0.125, 0.375, 0.625, 0.875,
]
  .flatMap((dx) => [0.3, 0.5, 0.7, 0.9].map((dy) => [dx, dy] as const))
  .sort(
    (p, q) =>
      Math.hypot(p[0] - 0.5, p[1] - 0.65) - Math.hypot(q[0] - 0.5, q[1] - 0.65) ||
      p[1] - q[1] ||
      p[0] - q[0],
  );

/** Qué hoja viste cada barrera, según el suelo de al lado. */
export function hojaDeMasa(b: Barrera, s: Suelo, azar: () => number, hondura = 1): string {
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
export const SITIOS_DEL_REBORDE: readonly (readonly [number, number])[] = [
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
export const ALTO_DEL_REBORDE_MENOR = 0.25;

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
export function hojaDePico(material: MaterialDePico, azar: () => number, cumbre: number): string {
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
export function luzDeCumbre(cumbre: number): string | undefined {
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
export interface CumbrePuesta {
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
export function bajoLaCumbre(c: CumbrePuesta, x: number, y: number): boolean {
  const rx = LIBRE_DE_CUMBRE.lados * c.alto * (c.ancho ?? 1);
  const ry = y < c.y ? LIBRE_DE_CUMBRE.atras * c.alto : LIBRE_DE_CUMBRE.delante;
  return ((x - c.x) / rx) ** 2 + ((y - c.y) / ry) ** 2 < 1;
}

/**
 * Los peñascos de un claro de la falda (`Macizo.claro`, #218), alrededor del
 * pico bajo del relleno: el suelo asoma entre piedras.
 */
export const PEÑASCOS_DEL_CLARO = 2;

/** Tamaño del bosque: radio entre árboles y alto, en casillas, según la hondura. */
export const BOSQUE = {
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
  // Sin la pradera (20-10-2026): sus matas y flores, mezcladas con las parcelas,
  // eran parte del confeti de la labranza (`labranza.ts`).
  dirt: [['dirt', 1]],
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
export const ESBELTEZ_DE_LO_PISABLE = 1.3;

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

export function hojaDeCubierta(s: Suelo, tirada: number): string {
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
export const CUBIERTA: Readonly<
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

/** La hoja de la cubierta de la labranza (`labranza.ts`): parcelas, atrezo, piedras y matas. */
export const HOJA_DE_LA_TIERRA = 'cubierta-dirt';

/**
 * La hoja de las casas sueltas de la labranza (`labranza.ts`), recortadas de los
 * pueblos por el taller (`tools/taller/casas.ts`).
 */
export const HOJA_DE_CASAS = 'casas';

/** Las hojas que sortea el esparcido de la cubierta (`MEZCLA`): con ellas pregunta su dardo. */
export const HOJAS_QUE_SE_ESPARCEN: readonly string[] = Object.keys(MEZCLA).map(
  (s) => `cubierta-${s}`,
);

/**
 * Las hojas de la cubierta que pone la regla de un suelo, por su nombre, además
 * de las de su mezcla: la tierra, sus casas sueltas. Son de su suelo
 * (`HOJAS_DE_LA_CUBIERTA`) y de la cubierta (`APARTE`), pero el esparcido no las
 * sortea ni hacen el molde del dardo (`HOJAS_QUE_SE_ESPARCEN`).
 */
const HOJAS_DE_SU_REGLA: Readonly<Partial<Record<Suelo, readonly string[]>>> = {
  dirt: [HOJA_DE_CASAS],
};

/**
 * Las hojas de la cubierta de cada suelo: las de su mezcla (`MEZCLA`), sin
 * árboles, y las de su regla (`HOJAS_DE_SU_REGLA`).
 */
export const HOJAS_DE_LA_CUBIERTA: Readonly<Record<Suelo, ReadonlySet<string>>> =
  Object.fromEntries(
    Object.entries(MEZCLA).map(([s, mezcla]) => [
      s,
      new Set([...mezcla.map(([o]) => `cubierta-${o}`), ...(HOJAS_DE_SU_REGLA[s as Suelo] ?? [])]),
    ]),
  ) as Partial<Record<Suelo, ReadonlySet<string>>> as Record<Suelo, ReadonlySet<string>>;

/**
 * Si el módulo `nombre` de `hoja` solo se pone por su nombre: no sale al azar de
 * su hoja (`deHoja` sin nombre) ni como su reserva estrecha (`masEstrecho`). Son
 * las parcelas y el atrezo de la labranza, que pone su regla. Así el esparcido
 * de la tierra y lo alto de un acantilado de tierra sacan solo piedras y matas,
 * y el almiar deja de ser la reserva de toda la hoja.
 */
export const soloPorSuNombre = (hoja: string, nombre: string): boolean =>
  hoja === HOJA_DE_LA_TIERRA && MODULOS_DE_LA_LABRANZA.has(nombre);

/** La mata más baja, en veces el alto de la cubierta de su suelo; la más alta, 0,6 más. */
export const MATA_MAS_BAJA = 0.7;

/**
 * El alto de una parcela de la labranza (`labranza.ts`), en casillas: con los
 * módulos de la hoja (368 × 283), 1,3 casillas de ancho, y los rombos de dos
 * casillas vecinas se solapan por las puntas: el campo es una manta.
 */
export const ALTO_DE_PARCELA = 1;

/**
 * Si una parcela no entra entera (la senda, la reserva de un objeto), se prueba
 * a estas veces su alto, centrada, y si no, no va: más pequeña era confeti.
 */
export const ENCOGER_LA_PARCELA = [1, 0.85, 0.7] as const;

/**
 * Lo que la caja de una parcela puede meterse en la de un árbol de la masa, en
 * casillas, a lo ancho y a lo alto a la vez: menos es el margen transparente de
 * las dos imágenes y la punta del rombo. La labranza sin parcela, en 1-10, 15
 * y 19 (20-10-2026): 46,6 % sin mirar la copa; con 0,1, 52,6 % (se iba toda
 * fila al norte de un bosque); con 0,2, 45,9 %, y ya sin trigo bajo los pinos
 * de la s19.
 */
export const MARGEN_BAJO_LA_COPA = 0.2;

/**
 * Si la caja de una pieza se mete en la de un árbol de la masa de `sprites`
 * (`esArbol`) más de `MARGEN_BAJO_LA_COPA` a lo ancho y a lo alto. La copa de
 * la fila norte de un bosque cuelga sobre la casilla que se pisa de su norte
 * (es perspectiva, #185), y una parcela de 1,3 casillas, al lado, asomaba en la
 * del bosque: se leía «trigo dentro del bosque» (QA, H4: s19). Ahí la parcela
 * se encoge o no va. Los árboles, por casilla, porque se pregunta por cada
 * parcela y cada escala.
 */
export function bajoLaCopa(sprites: readonly Sprite[]): (s: ConImagen) => boolean {
  const cajas: Caja[] = [];
  const porCasilla = new Map<number, number[]>();
  /** La clave de la casilla `(x, y)`: el mapa mide como mucho 128 por lado, y la copa sale poco de él. */
  const clave = (x: number, y: number) => (y + 64) * 1024 + x + 64;
  for (const s of sprites) {
    if (s.clase !== 'masa' || !esArbol(s.src)) continue;
    const c = cajaDeSprite(s);
    cajas.push(c);
    for (let y = Math.floor(c[1]); y <= Math.floor(c[3]); y++)
      for (let x = Math.floor(c[0]); x <= Math.floor(c[2]); x++) {
        const k = clave(x, y);
        const l = porCasilla.get(k);
        if (l === undefined) porCasilla.set(k, [cajas.length - 1]);
        else l.push(cajas.length - 1);
      }
  }
  return (s) => {
    const [a0, b0, a1, b1] = cajaDeSprite(s);
    for (let y = Math.floor(b0); y <= Math.floor(b1); y++)
      for (let x = Math.floor(a0); x <= Math.floor(a1); x++)
        for (const n of porCasilla.get(clave(x, y)) ?? []) {
          const [x0, y0, x1, y1] = cajas[n] as Caja;
          if (
            Math.min(a1, x1) - Math.max(a0, x0) > MARGEN_BAJO_LA_COPA &&
            Math.min(b1, y1) - Math.max(b0, y0) > MARGEN_BAJO_LA_COPA
          )
            return true;
        }
    return false;
  };
}

/**
 * Las casas sueltas, a tantos píxeles de su imagen por casilla: al 89 % de lo
 * que miden en su pueblo (`PX_POR_CASILLA_DEL_PUEBLO`, las de la ciudad), 215,
 * y de 0,53 a 0,76 casillas de ancho. Más pequeñas que en él y lejos de
 * él, se leen como un caserío y no como otro pueblo.
 */
export const PX_POR_CASILLA_DE_CASA = Math.round(PX_POR_CASILLA_DEL_PUEBLO / 0.89);

/** El alto de una casa sin su hoja (el marcador). */
export const ALTO_DE_CASA = 0.6;

/**
 * De los puntos del esparcido que caen en el barbecho o en un camino de tierra,
 * los que llevan una piedra o una mata (12-16): el barbecho es tierra con algo,
 * no una alfombra.
 */
export const PARTE_DEL_RELLENO = 0.15;

/** Las hojas de árbol: solo de la masa del bosque. Un árbol dice «aquí no se pasa». */
export const ARBOLES: readonly string[] = ['pinos', 'frondosos', 'muertos', 'abetos-nevados'];

/**
 * Los módulos de la cubierta que son árboles, mirados uno a uno en las siete
 * hojas (14-10-2026): los abetos en miniatura de la nieve (1-4) y el árbol seco
 * de la arena (5), de tronco y copa. Lo demás son matas, rocas, montones de
 * nieve, tocones, raíces caídas y setas: se leen como suelo. La cubierta no los
 * pone (`modulosDe`, en `componer`, los quita de su hoja) y cuentan como árbol
 * (`esArbol`): con solo el nombre de la hoja, el guardia no veía 9 455 abetos de
 * 0,42 sobre la nieve que se pisa de 1-40, en el 68 % de sus casillas (QA). Un
 * arte nuevo de estas hojas hay que volver a mirarlo: el test guarda su sha256.
 */
export const ARBOLES_DE_LA_CUBIERTA: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['cubierta-snow', new Set(['1', '2', '3', '4'])],
  ['cubierta-sand', new Set(['5'])],
]);

/**
 * Los módulos de la cubierta que no van en lo que se pisa, aunque no sean
 * árboles: los peñascos de roca gris de la nieve (5-8). Sin los abetos, eran el
 * 41 % de lo que cubría la nieve que se pisa de s1, 3 y 7, y al tope de alejar
 * el Valle Hondo de s3 se leía como la sierra de su sur (QA, H9, 16-10-2026):
 * en la nieve que se pisa mandan los montones blancos y las matas nevadas. Lo
 * alto del acantilado y el pie de la muralla los siguen llevando: son roca.
 */
export const FUERA_DE_LO_QUE_SE_PISA: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['cubierta-snow', new Set(['5', '6', '7', '8'])],
]);

/** Si `src` es la imagen de un árbol: de una hoja de `ARBOLES` o de `ARBOLES_DE_LA_CUBIERTA`. */
export function esArbol(src: string | null): boolean {
  const hoja = hojaDelSrc(src);
  if (hoja === undefined) return false;
  if (ARBOLES.includes(hoja)) return true;
  const nombre = (src as string).slice(`modulos/${hoja}/`.length).replace(/\.webp$/, '');
  return ARBOLES_DE_LA_CUBIERTA.get(hoja)?.has(nombre) === true;
}
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
    // Sin `ARBOLES`: un árbol de cubierta lanza en `poner`.
    hojas: [...HOJAS_QUE_SE_ESPARCEN, ...Object.values(HOJAS_DE_SU_REGLA).flat()],
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
 * La labranza (20-10-2026): el trigo amarillo, las coles verdes y las piedras
 * blancas sobre la tierra parda tapaban minas, recursos y figuras. Las casas,
 * con el mismo, que si no destacaban más que el pueblo de al lado. Con 0,7 / 0,9
 * las coles seguían gritando; con 0,55 / 0,85 el trigo salía gris (s19).
 */
const TONO_DE_LA_LABRANZA = 'saturate(0.65) brightness(0.88)';
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
  // La rampa de muesca (§36), medida igual (el tercio de fuera de cada frontal):
  // la roca salió en la luz de su frontal entonada (73-76 contra 77, R−B 25 contra
  // ~28), sin filtro; la arenisca, en su luz (67-71 contra 69) pero más roja (R−B
  // 54-59 contra ~47): la mitad del desaturado de su frontal. Sus paredes de lado
  // quedan entre las dos laderas de su material (09-10-2026).
  'rampa-muesca-arenisca': 'saturate(0.85)',
  // La labranza: la tierra y las hojas de su regla (las casas).
  ...Object.fromEntries(
    [HOJA_DE_LA_TIERRA, ...(HOJAS_DE_SU_REGLA.dirt ?? [])].map((h) => [h, TONO_DE_LA_LABRANZA]),
  ),
};

/** El tono de una hoja: el suyo o, en una hoja del relieve, el de su familia (sin la caída). */
export function tonoDe(hoja: string): string | undefined {
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
export const SUELO_DE_LA_ROCA: Readonly<Record<string, Suelo>> = {
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
      `no hay paredes para el material de cara «${material}»: añádelo a MATERIAL_DE_CARA (colocar/tablas.ts)`,
    );
  return m;
}

/**
 * Lo ancho que se pinta cada tramo de muro, en casillas, para que cubra su paso
 * con un poco de solape: el horizontal, una casilla; el diagonal, √2; el que va
 * hacia el fondo es estrecho y se mide por lo que sube en pantalla.
 */
export const ANCHO_DE_TRAMO: Readonly<Record<string, number>> = {
  horizontal: ANCHO_DEL_TRAMO_HORIZONTAL,
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
export const PUERTA_NORTE_SUR = { alto: 2.6, pieDelArco: 0.625 } as const;

/** Las piezas del tramo de muralla de norte a sur (§29), de lado. */
export const TRAMOS_NORTE_SUR = ['muro-ns-1', 'muro-ns-2'] as const;

/**
 * Lo que una tirada de norte a sur de la muralla del mapa puede quedarse corta
 * en cada punta (`tiradaNorteSur`): ahí va una torre o una puerta, que lo tapa.
 * Con él, dos pasos van en tres piezas y no en cuatro.
 */
export const HOLGURA_DE_LA_TIRADA = 0.125;

/**
 * Lo más que se encoge la torre de una casilla de muralla sin tramos para no
 * tapar la senda que la rodea (#193), en veces su alto.
 */
export const TORRE_MAS_BAJA = 0.45;

/**
 * Dónde se prueba, dentro de su casilla, la torre suelta que ni encogida a
 * `TORRE_MAS_BAJA` deja libre la senda: primero en su sitio, luego con el pie
 * más abajo (la torre sube desde él) y luego a los lados, en casillas. El pie
 * no pasa de 0,95: sigue en su casilla.
 */
export const CORRIMIENTOS_DE_TORRE: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 0.1],
  [0, 0.2],
  [-0.2, 0],
  [0.2, 0],
  [-0.2, 0.2],
  [0.2, 0.2],
];

export const MARCADOR: Readonly<Record<string, string>> = {
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
export const MONSTRUO = {
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
export const ALTO_DEL_HITO = 1;
export const ANCHO_DEL_HITO = 0.6;

/**
 * El miliario es una columna de piedra clara y lisa: en un llano oscuro tiraba
 * de la vista más que nada de alrededor (auditoría 3, defecto 6). Sin filtro da
 * luz 134, p90 216 y desviación 61; con este, 101, 151 y 37, en la de la
 * tablilla (97, 176 y 50) y por debajo del mojón (124, 223 y 68), que es un
 * montón de piedras con sombra entre ellas (08-10-2026, `tono.py` en
 * `docs/agents/2026-10-08-detalles-mapa/`).
 */
export const TONO_DE_HITO: Readonly<Record<string, string>> = {
  'nodo-hito-miliar': 'brightness(0.72) contrast(0.85) saturate(0.9)',
};

/** El radio de la reserva de cada clase de objeto (`reservaDe`), en casillas. */
export const RADIO_DE_OBJETO: Readonly<Record<string, number>> = {
  village: 1.1,
  node: 0.95,
  chest: 0.4,
  monster: 0.45,
  lugar: 0.5,
};

/**
 * El sitio que aparta un lugar de un mundo, en casillas (el lado de su sprite sin
 * pieza): sin arte en la F1a, su rombo lo pinta el juego (`pintarObjeto`).
 */
export const LADO_DEL_LUGAR = 0.5;

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
export function radioDeLaReserva(
  o: Pick<MapObject, 'kind'> & { barrera?: Barrera | null },
): number {
  if (o.kind === 'town')
    throw new Error('la reserva de una ciudad no es un disco: es su recinto (`reservaDelRecinto`)');
  if (o.kind === 'node' && o.barrera != null && PASOS_SIN_PIEZA.includes(o.barrera))
    return RADIO_DEL_PASO_SIN_PIEZA;
  return RADIO_DE_OBJETO[o.kind] ?? 0.5;
}

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

export function cajaDe(casillas: readonly number[], W: number): [number, number, number, number] {
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

/** `s` pintado en su sitio pero ordenado como si su pie estuviera en `y` (`Sprite.clave`). */
export function ordenadoEn(s: Sprite, y: number): Sprite {
  return { ...s, clave: y };
}

/** `s` en su sitio, por detrás de `delante` si no lo estaba ya: el muro que cae en la reserva de un objeto. */
export function detrasDe(s: Sprite, delante: Sprite, antes = 0): Sprite {
  return claveDe(s) < claveDe(delante) ? s : ordenadoEn(s, claveDe(delante) - 0.01 - antes);
}
