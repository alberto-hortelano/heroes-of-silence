/**
 * El plan de un mapa, sin generarlo: lo que declara un plan (el del agente o el del
 * procedimental), lo que sale de construirlo (`BuiltMap`) y lo que mide un mapa
 * (las regiones por bando y el lado, con sus topes).
 *
 * Vivía al principio de `generate.ts`, y quien solo necesitaba la forma del plan o
 * el tamaño del mapa —el formato de un mundo, el esquema del agente— importaba el
 * generador entero (fase N de la reorganización, 07-11-2026). Fue el primero de
 * `map/generar/`, donde está hoy el resto del generador.
 */
import { AREA_POR_REGION } from '../../escala.js';
import type { Town } from '../../town/town.js';
import type {
  FactionId,
  Guarnicion,
  PlayerId,
  Point,
  Raider,
  RaiderPlaneado,
} from '../../types.js';
import type { TramoDeCamino } from '../red-de-caminos.js';
import type { Barrera, Nivel, TerrainKind } from '../terrain.js';
import type { GameMap, MapRegion } from '../tipos.js';

/**
 * Una mancha de terreno: solo pinta, no separa nada.
 *
 * Se llamaba `TerrainRegion` y vivía en `MapPlan.regions`, y con el mapa de
 * nodos el nombre chocaba: una **región** es ahora una zona de juego encerrada
 * por nodos, y esto es un círculo de nieve. El cambio de nombre es a propósito
 * y en el mismo sitio, para que ningún plan viejo se cuele con el campo
 * equivocado: un `regions` de manchas no pasa el esquema nuevo.
 */
export interface TerrainPatch {
  readonly terrain: TerrainKind;
  readonly center: Point;
  /** Radio en casillas. La mancha es redondeada, no un cuadrado. */
  readonly radius: number;
}

/**
 * Un tramo de muro, **recto**: `from` y `to` comparten fila o columna, y se
 * pintan los dos extremos y todo lo de en medio.
 *
 * Ortogonal y no libre por una razón de 8-vecindad: un muro en diagonal de una
 * casilla de grueso deja huecos de esquina por los que se cuela un héroe en
 * diagonal. Con tramos rectos ese hueco no se puede escribir.
 */
export interface PlannedWall {
  readonly terrain: Barrera;
  readonly from: Point;
  readonly to: Point;
}

/**
 * Una región tal como la declara un plan: la de la red (`MapRegion`) y, si se
 * quiere, **el suelo entero** que lleva.
 *
 * El suelo es del plan y no del mapa: `buildMap` lo pinta y no lo guarda, así
 * que `GameMap.regions` sigue siendo la red y nada más. Pintar no cambia qué se
 * pisa —solo se pinta lo pisable de la región—, de modo que la red que valida
 * `problemasDeRed` es la misma con suelo o sin él.
 */
export interface RegionPlaneada extends Omit<MapRegion, 'nivel'> {
  // El `| undefined` escrito, por lo mismo que en `roads`: el esquema lo
  // declara con `.optional()` y con `exactOptionalPropertyTypes` no casarían.
  readonly terrain?: TerrainKind | undefined;
  /**
   * El nivel de altura (#143). Lo escribe el procedimental, que lo sortea antes
   * que las barreras, y el agente puede declararlo (#209); sin él, `buildMap`
   * pone la región al 1, el llano. Si el plan declara alguno, `validateMapPlan`
   * exige que cada barrera admita los niveles que separa (`problemasDeNiveles`).
   */
  readonly nivel?: Nivel | undefined;
}

export interface PlannedTown {
  readonly id: string;
  readonly name: string;
  readonly faction: FactionId;
  /**
   * Una ciudad va **en el muro**, entre dos regiones o más, y entonces es un nodo
   * que se toma como un paso (la base, siempre), o **dentro de una región**, y
   * entonces es de quien tenga la región. Lo dice lo que toca (`estructura`), no
   * un campo. No se repite en `nodes`.
   */
  readonly at: Point;
  /**
   * El dueño con que nace una ciudad en el muro; `null` = neutral, que nace con la
   * guarnición de `data/ciudades.json`. Una ciudad dentro de una región no lo
   * lleva (es de quien tenga su región: `validateMapPlan` lo rechaza).
   */
  readonly owner: PlayerId | null;
}

/** Lo que llevan los planes de los dos productores, el agente y el procedimental. */
interface PlanComun {
  readonly width: number;
  readonly height: number;
  readonly baseTerrain: TerrainKind;
  readonly patches: readonly TerrainPatch[];
  /** Las regiones del mapa de nodos; el mapa guarda de cada una lo de `MapRegion`. */
  readonly regions: readonly RegionPlaneada[];
  readonly walls: readonly PlannedWall[];
  /** Los pasos entre regiones que no son ciudad. */
  readonly nodes: readonly Point[];
  readonly towns: readonly PlannedTown[];
  /**
   * Los pueblos: dentro de una región, de quien la tenga; en el muro entre dos
   * regiones, un nodo que se toma como un paso. Dan oro cada día a su dueño si
   * están unidos a su base (`rentaDelDia`).
   */
  readonly villages: readonly { readonly name: string; readonly at: Point }[];
  readonly monsters: readonly {
    readonly at: Point;
    readonly creature: string;
    readonly count: number;
  }[];
  readonly chests: readonly { readonly at: Point; readonly gold: number }[];
  /**
   * Los grupos de asaltantes con los que empieza la partida (`state/asaltantes.ts`).
   * Opcional, con el mismo idioma que `roads`: un plan sin ellos es válido y
   * la partida empieza sin ninguno —brotarán los lunes—.
   */
  readonly raiders?: readonly RaiderPlaneado[] | undefined;
}

/**
 * El plan del agente, el que sale de `mapPlanSchema`: los caminos como
 * **casillas**, `roads`, de las que `caminosDelPlan` deriva los tramos.
 */
export interface PlanConCasillas extends PlanComun {
  // El `| undefined` escrito no es ruido: con `exactOptionalPropertyTypes` un
  // `roads?: …` rechaza el `undefined` que produce un `.optional()` de zod.
  readonly roads?: readonly Point[] | undefined;
  readonly tramos?: undefined;
}

/**
 * El plan del procedimental: los caminos como **tramos**, tal como los traza
 * `trazarCaminos` (#153). El esquema del agente no los tiene —zod los quitaría
 * sin decir nada—, así que lo que tenga que pasar por él va antes por
 * `planDelAgente`.
 */
export interface PlanConTramos extends PlanComun {
  readonly tramos: readonly TramoDeCamino[];
  readonly roads?: undefined;
}

/**
 * Un plan de mapa, del agente o del procedimental. Sus caminos van de una de
 * las dos maneras y nunca de las dos: lo impide el tipo, no un `throw`.
 */
export type MapPlan = PlanConCasillas | PlanConTramos;

export interface BuiltMap {
  readonly map: GameMap;
  readonly towns: Town[];
  readonly raiders: Raider[];
  /**
   * La guarnición con que nace cada ciudad que la lleva, por su id: la neutral,
   * con dueño `null`, y la de cada base, de su dueño. Va a `GameState.guarniciones`.
   */
  readonly guarniciones: Record<string, Guarnicion>;
}

/**
 * Regiones por bando del mapa que juega una partida si nadie pide otro: la de
 * casa y las de fuera, que van en parejas en espejo (la región 2k de un bando y
 * la 2k+1 del otro). **Es el dato del mapa** (#195, decisión del usuario: las
 * regiones definen el tamaño del mapa): de él sale el lado (`ladoDelMapa`).
 *
 * **Elegido midiendo**, con la regla de siempre: el menor número con mediana
 * ≥ 8 días, p90 ≤ 20 y 0 partidas sin terminar en 1 000 semillas
 * (`tools/qa/medidas/tamanos.ts`). Las cifras, con su fecha, en `docs/historia.md`
 * («Las regiones definen el mapa»).
 */
export const REGIONES_POR_BANDO = 5;

/**
 * Lo que el generador sabe hacer, en regiones por bando: con menos de una
 * pareja de fuera la red no tiene ciudades neutrales que equilibrar, y las
 * dos puntas son las que caen dentro de su lado (`LADO_MINIMO_DEL_GENERADOR`,
 * `LADO_MAXIMO_DEL_GENERADOR`): `ladoDelMapa(3)` = 30 y `ladoDelMapa(10)` = 63
 * (con 300 casillas por región eran 24 y 64, de 3 a 15; con las 450 de #226, 11
 * regiones darían 67). El lado mínimo, 26 (24 hasta el recinto de las ciudades): pedido por lado, sale con 3.
 * Lo vigila `test/regiones-del-mapa.test.ts`.
 */
export const REGIONES_MINIMAS_POR_BANDO = 3;
export const REGIONES_MAXIMAS_POR_BANDO = 10;

/**
 * El lado de un mapa cuadrado con `regionesPorBando` regiones por bando:
 * `⌊√((regiones − 1) · AREA_POR_REGION)⌋`, el mayor lado cuya área no pasa de
 * una pareja de fuera por cada `AREA_POR_REGION` (`core/escala.ts`). Vuelve a dar esas regiones
 * con la cuenta de `regionesDelMapa` en todo el rango (un test lo recorre), así
 * que un mapa pedido por regiones es el mismo que pedido por su lado. El suelo,
 * y no el techo (con 5 regiones, 42: 1 764 casillas de las 1 800 que tocan;
 * con 300 por región eran 34). La raíz va por bucle entero: `core` no usa
 * `Math.sqrt` (`CLAUDE.md`, coma flotante).
 */
export function ladoDelMapa(regionesPorBando: number): number {
  if (
    !Number.isInteger(regionesPorBando) ||
    regionesPorBando < REGIONES_MINIMAS_POR_BANDO ||
    regionesPorBando > REGIONES_MAXIMAS_POR_BANDO
  ) {
    throw new Error(
      `el generador procedimental no hace mapas de ${regionesPorBando} regiones por bando: van de ${REGIONES_MINIMAS_POR_BANDO} a ${REGIONES_MAXIMAS_POR_BANDO}`,
    );
  }
  const area = (regionesPorBando - 1) * AREA_POR_REGION;
  let lado = 0;
  while ((lado + 1) * (lado + 1) <= area) lado++;
  return lado;
}

/**
 * Las regiones por bando que caben en un mapa de `W`×`H`: la casa y una pareja
 * de fuera por cada `AREA_POR_REGION` casillas, dos como poco. Es la cuenta que
 * usa el generador cuando le piden un lado (un rectángulo, un test) y no
 * regiones; su inversa, para un cuadrado, es `ladoDelMapa`.
 */
export function regionesDelMapa(W: number, H: number): number {
  return 1 + Math.max(2, Math.round((W * H) / AREA_POR_REGION));
}

/**
 * El lado del mapa que juega una partida si nadie pide otro: lo leen el
 * servidor (lo que se le pide al agente) y los arneses. **Derivado, no
 * elegido** (#195): antes era el dato (34, elegido con la regla de duración) y
 * las regiones salían de su área; ahora es al revés.
 */
export const LADO_DEL_MAPA = ladoDelMapa(REGIONES_POR_BANDO);

/**
 * Lo que puede medir un plan, venga de quien venga: lo leen `validateMapPlan`,
 * el esquema del agente (`mapPlanSchema`) y la prosa que se le manda. Un plan a
 * mano de 26×9 se juega bien —medio banco de tests es así—, así que este rango
 * no es el del generador.
 */
export const LADO_MINIMO_DEL_PLAN = 8;
export const LADO_MAXIMO_DEL_PLAN = 128;

/**
 * Lo que sabe hacer el generador procedimental, que es más estrecho (#102).
 *
 * Antes no se decía en ningún sitio y heredaba el 8-128 del plan, que para él
 * era falso justo en el camino de respaldo, el que no puede fallar. **Medido
 * (08-10-2026, semillas 1-200, cuadrados, `validateMapPlan` vacío):** de 24 a
 * 64, 200 de 200 en cada lado, y 24×64 y 64×24 también (en 2 000 semillas el
 * 24 se agota en 2, ver `INTENTOS_DE_VESTIDO`). Por debajo, 23 sale
 * en 195, 22 en 184, 21 en 127, 20 en 32 y 18 o menos en ninguna: se agotan
 * las 30 redes, casi siempre porque sus fronteras no admiten cuatro barreras
 * con su mínimo de casillas. Por arriba deja de ser de fiar (con la máquina
 * cargada): 77 tardó de media 6,5 s por plan en 10 semillas, 88 se agota con la
 * semilla 1 y 96 no acabó la semilla 1 en seis minutos. Lo vigila un test que
 * recorre el rango (`lado-del-generador.test.ts`): las puntas en `pnpm verify`, y cada
 * lado con tres semillas y el mínimo con las 200 en la lenta.
 *
 * **Sube a 26 con el recinto de las ciudades** (21-10-2026, decisión del
 * usuario): con dos ciudades a `SEPARACION_DE_CIUDADES` (5) o más y ninguna en
 * el borde (`recinto.ts`), el 24×24 se quedaba sin mapa en 15 de 200 semillas
 * (todas por redes tiradas en `intentarRed`; con separación 4, también 15). En
 * 26, 28 y 30, 200 de 200.
 */
export const LADO_MINIMO_DEL_GENERADOR = 26;
export const LADO_MAXIMO_DEL_GENERADOR = 64;
