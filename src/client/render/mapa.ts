/**
 * El mapa de aventura: la escena del escenógrafo (`render/escenario/`), las
 * figuras del juego entre sus volúmenes y la niebla de dos tonos.
 *
 * El suelo es una superficie fija que se pinta una vez por partida; los
 * volúmenes —árboles, picos, muros y lo horneado: ciudad, pueblo y nodo— se
 * pintan a cada fotograma, solo los que se ven, fundidos por profundidad con
 * los héroes, los monstruos, los asaltantes y los cofres.
 *
 * Las ideas son las de `aventura/map-view.ts` de la rama `archivo/gpt-rpg`; lo
 * que se pinta es el `GameMap` del núcleo y no el mundo de GPT, con varios héroes
 * por bando y los rivales. Y, a diferencia de aquel, **no decide nada**: no busca
 * caminos ni calcula lo que se ve —la rama llamaba a `findPath` y a
 * `visibleFrom` desde el lienzo—. La ruta y las casillas visibles llegan hechas
 * de `session.ts`, que es la puerta al núcleo.
 *
 * Solo pinta: ni guarda estado de la partida ni escucha al ratón.
 */

import { hojaDeUnidad } from '@core/catalogo.js';
import { figuraDelHeroe } from '@core/data.js';
import { individuosDe } from '@core/hero/troop.js';
import type { CasillasLeidas } from '@core/map/casillas.js';
import type { MapObject, MapRegion, RedDeCaminos } from '@core/map/map.js';
import type { TerrainKind } from '@core/map/terrain.js';
import { inicialDelNombre } from '@core/mundo/formato.js';
import type { AsaltantesALaVista, VistaAsaltante } from '@core/state/asaltantes.js';
import type { FactionId, Point } from '@core/types.js';
import { type Direccion, direccionEnPantalla } from '../direccion.js';
import { msPorCasilla } from '../marcha.js';
import { temaDelLienzo } from '../temas.js';
import { imagenDeEscena } from './assets.js';
import {
  type CamaraMapa,
  casillaAPixel,
  MARGEN_DE_VOLUMEN,
  type Margen,
  mundoAPixel,
  ventanaDeCasillas,
} from './camara-mapa.js';
import { empezarFotogramaDeCopias } from './copias.js';
import { seHornea } from './escenario/horneado.js';
import {
  type Imagen,
  type OpcionesDePintura,
  pintarSprite,
  type Volumen,
} from './escenario/pintar.js';
import {
  claveDeFigura,
  copiaDeVolumen,
  type Escenario,
  escenarioListo,
  pisada,
  sueloDelMapa,
  type VolumenDelMapa,
} from './escenario/superficie.js';
import { animarHasta, type Figura, pintarFiguraConSombra } from './figura.js';
import { densidadDe } from './lienzo.js';
import { COLOR_SIN_DUEÑO, playerColor } from './palette.js';
import { MIRADA_DE_PRESENTACION } from './personajes.js';
import { pintarPieza } from './piezas.js';
import { pintarSombra } from './sombra.js';

/**
 * Lo que este lienzo necesita de una partida, y **nada más**.
 *
 * Es el tipo estructural que antes vivía en `render/adventure.ts`, y por el
 * mismo motivo: `GameState` lo satisface tal cual y la vista adaptada del
 * espectador también, sin que ninguno tenga que fabricar una partida falsa.
 * La niebla son `Casillas` (un byte por casilla, #146), y es `adaptar.ts`
 * quien las rehace al otro lado del cable desde sus índices. De los caminos se leen
 * los tramos, las sueltas (la labranza no cultiva una casilla con camino) y si
 * un tramo une dos casillas (las puertas de una ciudad): `RedDeCaminos` los
 * cumple y el espectador la rehace del cable.
 */
export interface AdventureScene {
  readonly map: {
    readonly width: number;
    readonly height: number;
    readonly terrain: readonly TerrainKind[];
    readonly caminos: Pick<RedDeCaminos, 'tramos' | 'sueltas' | 'une'>;
    readonly objects: readonly MapObject[];
    /** Las regiones del mapa de nodos. Las pintará el territorio de la 2b. */
    readonly regions: readonly MapRegion[];
  };
  readonly players: readonly { readonly id: number; readonly fog: CasillasLeidas }[];
}

/** Un héroe tal y como lo pinta el mapa. `Hero` lo cumple, y el del cable del espectador también. */
export interface HeroeEnElMapa {
  readonly id: string;
  readonly owner: number;
  readonly name: string;
  readonly at: Point;
  /** Su facción y su tipo: de ellos sale la hoja con que se pinta (`figuraDelHeroe`). */
  readonly faction: FactionId;
  readonly tipo: string;
}

/**
 * Un paso de la ruta que se enseña: dorado si llega hoy, gris si otro día, y
 * rojo desde donde un grupo a la vista emboscaría al héroe (`peligro`).
 */
export interface PasoDeRuta {
  readonly at: Point;
  readonly hoy: boolean;
  readonly peligro?: boolean;
  /** En el primer paso con peligro: el grupo que embosca ahí. */
  readonly emboscada?: VistaAsaltante;
}

export interface VistaMapa {
  readonly escena: AdventureScene;
  /**
   * Los grupos de asaltantes que se pintan, con su tropa contada: la figura
   * lleva el cuerpo de su primera criatura y la chapa cuántos son. Un campo
   * aparte de `escena` y con la marca de la niebla: solo lo fabrican
   * `asaltantesALaVista` —quien juega— y `todosALaVista` —el espectador—, así
   * que pintar `state.raiders` sin filtrar no compila.
   */
  readonly asaltantes: AsaltantesALaVista<VistaAsaltante>;
  /**
   * Los héroes que se pintan: los que se ven AHORA (`Session.heroesALaVista`), o
   * todos en el espectador. No salen de `escena`, que ya no los trae, para que
   * pintar los de la partida sin filtrar no compile (#64).
   */
  readonly heroes: readonly HeroeEnElMapa[];
  /**
   * Los objetos que se pintan, con el estado que se SABE de ellos: vivos donde
   * se mira ahora y, en lo demás explorado, el recuerdo de cuando se vieron
   * (`Session.objetosConocidos`). La bandera de un castillo lejano es la de su
   * último dueño visto. `escena.map.objects` sigue ahí para la escena —dónde
   * está cada cosa, que no cambia—, no para pintar su estado.
   */
  readonly objetos: readonly MapObject[];
  readonly camara: CamaraMapa;
  readonly ancho: number;
  readonly alto: number;
  /** Lo explorado alguna vez. `null` es «todo»: el espectador, o el modo de depuración. */
  readonly explorado: CasillasLeidas | null;
  /** Lo que se mira AHORA. `null` es no pintar la segunda sombra. */
  readonly visibles: CasillasLeidas | null;
  readonly ruta: readonly PasoDeRuta[];
  readonly seleccionado: string | null;
  readonly hover: Point | null;
  /**
   * La semilla de la partida, que es la de la escena (`componer`): la misma en
   * el cliente, el espectador y el taller, así que los tres ven el mismo mapa.
   */
  readonly semilla: number;
  /** Reloj de la animación de reposo, en milisegundos. */
  readonly tiempo: number;
}

/** El marcador del cofre sin su pieza: un ladrillo del color de la madera vieja. */
export const COLOR_DEL_COFRE = '#a8762c';
/**
 * El rombo de un lugar de un mundo (F1a del mapa vivo), sin arte nuevo (P5): la
 * pieza del exterior va con el arte bajo demanda (F2), que la hornea en la escena.
 */
export const COLOR_DEL_LUGAR = '#d8b25a';

/**
 * El suelo y el estandarte de los asaltantes: la figura es del gris de lo que no
 * tiene dueño, igual que la de un monstruo, y lo que separa lo que embosca de lo
 * que guarda es esta mancha morada y el estandarte, no el tinte.
 */
const COLOR_ASALTANTE = '#8c3b8f';
/** El tramo de una ruta donde un grupo a la vista emboscaría al héroe. */
const COLOR_EMBOSCADA = '#d8332a';

/**
 * Lo que mide la figura de un grupo en el mapa, en casillas: con eso se dibuja y
 * con eso anda (`msPorCasilla`), así que su patrulla dura lo que tardan sus pies
 * en cruzar las casillas y no un plazo fijo —eran 900 ms fuera la patrulla de
 * una casilla o de tres—.
 */
export const ALTO_DEL_GRUPO = 0.85;

/**
 * La patrulla que se está viendo: de dónde a dónde va cada grupo y desde
 * cuándo. El núcleo mueve al grupo de golpe al empezar el día; quien desliza
 * la figura es el lienzo, recordando la última casilla en la que la pintó
 * mientras la siga pintando (`olvidarLosQueNoSePintan`).
 *
 * Por partida, con el array de terreno como llave: es lo único que no cambia en
 * toda una partida ni entre fotogramas del espectador (`adaptar.ts` lo conserva),
 * así que al empezar otra los `raider-0` de antes no se deslizan desde donde
 * estaban en la partida vieja.
 */
interface Marcha {
  desde: Point;
  hasta: Point;
  inicio: number;
  /** Lo que dura, en ms: las casillas de la recta al paso de su figura. */
  dura: number;
}
const marchas = new WeakMap<readonly TerrainKind[], Map<string, Marcha>>();

/** Dónde se pinta un grupo AHORA, si está andando, hacia dónde mira y cuándo llega. */
interface PosicionDeAsaltante {
  readonly x: number;
  readonly y: number;
  readonly andando: boolean;
  readonly mira: Direccion;
  readonly hasta: number;
}

/** Dónde pintar un grupo AHORA, y si está andando. */
function posicionDeAsaltante(
  escena: AdventureScene,
  r: VistaAsaltante,
  tiempo: number,
): PosicionDeAsaltante {
  let deLaPartida = marchas.get(escena.map.terrain);
  if (deLaPartida === undefined) {
    deLaPartida = new Map();
    marchas.set(escena.map.terrain, deLaPartida);
  }
  let m = deLaPartida.get(r.id);
  if (m === undefined) {
    m = { desde: r.at, hasta: r.at, inicio: Number.NEGATIVE_INFINITY, dura: 0 };
    deLaPartida.set(r.id, m);
  } else if (m.hasta.x !== r.at.x || m.hasta.y !== r.at.y) {
    // Se ha movido desde la última vez que se pintó: arranca desde donde se le
    // veía, aunque fuera a mitad de un deslizamiento anterior.
    const ahora = posicionEn(m, tiempo);
    m.desde = { x: ahora.x, y: ahora.y };
    m.hasta = r.at;
    m.inicio = tiempo;
    const largo = Math.hypot(m.hasta.x - m.desde.x, m.hasta.y - m.desde.y);
    m.dura = largo * msPorCasilla(figuraDelGrupo(r), 'walk', ALTO_DEL_GRUPO);
  }
  return { ...posicionEn(m, tiempo), hasta: m.inicio + m.dura };
}

/**
 * Olvida dónde se pintó cada grupo que este fotograma no pinta —salió de la
 * vista de quien juega o de la cámara—: el que vuelve aparece en su casilla, sin
 * deslizarse desde la última en la que se le vio, que puede ser de hace días.
 * Desde #130 los grupos entran y salen de la vista con su región, y uno que
 * reaparecía cruzaba media pantalla andando desde un recuerdo (H3 de QA: el
 * grupo de la semilla 50 de `pnpm capturas` estaba a mitad de ese paseo cuando
 * se tomó la foto de «antes» de su patrulla).
 */
function olvidarLosQueNoSePintan(escena: AdventureScene, pintados: ReadonlySet<string>): void {
  const deLaPartida = marchas.get(escena.map.terrain);
  if (deLaPartida === undefined) return;
  for (const id of deLaPartida.keys()) if (!pintados.has(id)) deLaPartida.delete(id);
}

function posicionEn(
  m: Marcha,
  tiempo: number,
): { x: number; y: number; andando: boolean; mira: Direccion } {
  const t = m.dura <= 0 ? 1 : Math.min(1, Math.max(0, (tiempo - m.inicio) / m.dura));
  return {
    x: m.desde.x + (m.hasta.x - m.desde.x) * t,
    y: m.desde.y + (m.hasta.y - m.desde.y) * t,
    andando: t < 1 && (m.desde.x !== m.hasta.x || m.desde.y !== m.hasta.y),
    // El mapa se ve de frente, sin aplastar: el vector en casillas ya es el de
    // pantalla. Quieto mira al suroeste, como el monstruo que guarda.
    mira: direccionEnPantalla(m.hasta.x - m.desde.x, m.hasta.y - m.desde.y, 'SO'),
  };
}

// ------------------------------------------------------------------ el suelo

/**
 * El suelo tal y como se ve ahora: la superficie del escenógrafo
 * (`sueloDelMapa`) copiada a la cámara, recortada al lienzo. Se compone fuera de
 * pantalla y se guarda mientras la cámara no se mueva —o hasta que llega una
 * superficie mejor—: escalar la superficie a 1280×800 cuesta 7-13 ms, y copiar
 * esta, 0,12.
 */
let fondo: { clave: string; suelo: Imagen; lienzo: HTMLCanvasElement } | null = null;

function fondoDe(ctx: CanvasRenderingContext2D, v: VistaMapa, esc: Escenario): HTMLCanvasElement {
  const { width: W, height: H } = v.escena.map;
  const { camara } = v;
  const dpr = densidadDe(ctx);
  // La casilla en píxeles de dispositivo: es lo que decide si una superficie se amplía.
  // Y la densidad de la pantalla, que dice a cuánto se pinta el suelo bueno: no
  // la del lienzo, que el presupuesto rebaja al alejar. Sin pantalla (los
  // tests), la del lienzo.
  const pantalla = typeof devicePixelRatio === 'number' ? devicePixelRatio : dpr;
  const suelo = sueloDelMapa(esc, camara.tile * dpr, pantalla);
  // Mide lo mismo que el lienzo de la página, para copiarlo píxel a píxel.
  const { width: ancho, height: alto } = ctx.canvas;
  const clave = `${camara.tile}|${camara.x}|${camara.y}|${ancho}|${alto}|${dpr}`;
  if (fondo !== null && fondo.clave === clave && fondo.suelo === suelo.lienzo) return fondo.lienzo;
  const lienzo = fondo?.lienzo ?? document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const c = lienzo.getContext('2d');
  if (c === null) throw new Error('este navegador no tiene canvas 2D para el suelo del mapa');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.imageSmoothingEnabled = true;
  // Bilineal y no de alta calidad: `sueloDelMapa` da una superficie que se
  // reduce a ×0,5-1, y ahí la bilineal no pierde nada. La alta calidad, desde la
  // superficie de 120, costaba 23 ms por fotograma arrastrando en 2560×1440 y
  // 95 ms la primera vez (2026-10-05).
  c.imageSmoothingQuality = 'low';
  c.fillStyle = '#080a10';
  c.fillRect(0, 0, v.ancho, v.alto);
  const origen = mundoAPixel(camara, 0, 0);
  c.drawImage(suelo.lienzo, origen.x, origen.y, W * camara.tile, H * camara.tile);
  fondo = { clave, suelo: suelo.lienzo, lienzo };
  return lienzo;
}

// ---------------------------------------------------------------------- dibujo

/**
 * Los píxeles de dispositivo que se pintan, como mucho, en un fotograma del mapa
 * alejado (`presupuestoDelMapa`): en una pantalla mayor el mapa se pinta a menos
 * densidad y el navegador lo amplía. El tope de alejar cuenta volúmenes, pero en
 * un lienzo grande el tope sube y cada volumen ocupa más: lo caro pasa a ser el
 * relleno y no el número.
 *
 * Es lo que ya pinta el lienzo de una ventana de 1920×1080 (1 560×957), que no
 * cambia. Medido en el Chromium sin GPU de `pnpm capturas`, al tope y
 * arrastrando, en fps: con 2 073 600 (una pantalla de 1920×1080 entera), 32 en
 * 2560×1440; con 1 750 000, 38; con 1 500 000, 43, y 39 en 3840×2160, donde sin
 * presupuesto eran 7. El coste no crece en línea: con 1 000 000, 60.
 */
export const PIXELES_DEL_MAPA = 1_500_000;

/**
 * Hasta cuántos píxeles de dispositivo se pinta el lienzo del mapa a densidad
 * plena al acercar: el de una ventana de 2560×1440 (2 200×1 317 = 2,9 M). En
 * 3840×2160 (7,1 M) el presupuesto se queda siempre: a densidad plena en el zoom
 * máximo iba a 28/20 fps (quieto/arrastrando), frente a 36/33 con él (decisión
 * del usuario, 2026-10-05).
 */
export const PIXELES_AL_ACERCAR = 3_000_000;

/**
 * Cuánto más se puede alejar a densidad plena antes de volver al presupuesto,
 * en píxeles: (98/86)², un paso de rueda (`TILE_PASO`) cerca del umbral. Sin
 * ella, la rueda que va y viene alrededor del umbral reasignaba el lienzo a
 * cada paso.
 */
const HOLGURA_DE_LA_PLENA = 1.3;

/**
 * El presupuesto de píxeles del mapa para una cámara de `tile` px por casilla
 * con el tope de alejar en `tope`, en un lienzo de `pixelesPlenos` píxeles de
 * dispositivo a la densidad de la pantalla.
 *
 * `PIXELES_DEL_MAPA` se midió al tope de alejar, que es donde hay más volúmenes
 * a la vista; acercando, los que se ven bajan con 1/tile², así que el mismo
 * coste deja pintar (tile/tope)² veces más píxeles. Cuando eso cubre el lienzo
 * entero —y no pasa de `PIXELES_AL_ACERCAR`—, `undefined`: densidad plena. Con
 * el presupuesto fijo, la pantalla del usuario (1 623×930 a dpr 1,09) se pintaba
 * a 0,997 y 2560×1440 a 0,72 también en el zoom máximo, y se veía blando.
 *
 * Es plena o nada, sin densidades intermedias: en 4K, una de 0,65 en el zoom
 * máximo iba a 28/20 fps, frente a 36/33 con la de 0,46. Si ya estaba a plena
 * (`plenaAntes`), aguanta `HOLGURA_DE_LA_PLENA` más, salvo en el tope.
 */
export function presupuestoDelMapa(
  tile: number,
  tope: number,
  pixelesPlenos: number,
  plenaAntes = false,
): number | undefined {
  if (!(tile > 0) || !(tope > 0))
    throw new Error(`el presupuesto del mapa necesita casillas de más de 0 px (${tile} y ${tope})`);
  const proporcion = tile / tope;
  // Al tope no hay holgura: ahí se midió `PIXELES_DEL_MAPA`, y la pantalla del
  // usuario lo pasa solo un 19 %.
  const holgura = plenaAntes && tile > tope ? HOLGURA_DE_LA_PLENA : 1;
  const caben = PIXELES_DEL_MAPA * proporcion * proporcion * holgura;
  return pixelesPlenos <= PIXELES_AL_ACERCAR && pixelesPlenos <= caben
    ? undefined
    : PIXELES_DEL_MAPA;
}

/** `presupuestoDelMapa` con memoria de lo que dio la última vez: uno por página. */
export function presupuestoConHolgura(): (
  tile: number,
  tope: number,
  pixelesPlenos: number,
) => number | undefined {
  let plena = false;
  return (tile, tope, pixelesPlenos) => {
    const p = presupuestoDelMapa(tile, tope, pixelesPlenos, plena);
    plena = p === undefined;
    return p;
  };
}

export function drawMapa(ctx: CanvasRenderingContext2D, v: VistaMapa): void {
  const { escena, camara } = v;
  const { width: W, height: H } = escena.map;
  const tile = camara.tile;
  const esc = escenarioListo(escena.map, v.semilla);
  if (esc === null) {
    // La escena se está componiendo aparte: un fotograma o dos del fondo vacío.
    ctx.fillStyle = '#080a10';
    ctx.fillRect(0, 0, v.ancho, v.alto);
    return;
  }

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1 · El suelo: la superficie fija del escenógrafo.
  //     Píxel a píxel, sin la transformación: el fondo mide lo mismo que el
  //     lienzo, y con la caja CSS como destino la escala no es exactamente 1 y
  //     la copia pasa a ser un reescalado (23 ms por fotograma en 2560×1440,
  //     frente a ~1 de la copia directa, 2026-10-05).
  const suelo = fondoDe(ctx, v, esc);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(suelo, 0, 0);
  ctx.restore();

  // 2 · Lo que tiene altura —los volúmenes de la escena y las figuras del juego—,
  //     en un solo orden de profundidad: una figura puede quedar detrás de un árbol.
  const { cosas, sobreLaNiebla } = cosasDe(v, esc);
  pintarLoQueTieneAltura(ctx, v, volumenesALaVista(v, esc), cosas);

  // 3 · Lo que dice quién está en cada casilla, encima de todo lo que tiene altura.
  const cuerpos = cuerposDe([...cosas, ...sobreLaNiebla]);
  for (const cosa of cosas) pintarIdentificador(ctx, v, cosa, cuerpos);

  // 4 · La niebla: negra sobre lo desconocido, tenue sobre lo que no se mira.
  pintarNiebla(ctx, v);
  //     Y encima, los grupos que se ven sin haber explorado su casilla: se ven
  //     porque se ve su región (#130), y bajo la niebla negra no se verían. Es
  //     la excepción a «lo que dice quién está en una casilla va bajo la niebla».
  for (const cosa of sobreLaNiebla) {
    pintarCosa(ctx, v, cosa);
    pintarIdentificador(ctx, v, cosa, cuerpos);
  }

  // 5 · Encima de todo, lo que es de quien juega: la ruta y la casilla señalada.
  pintarRuta(ctx, camara, esc, pasosAPintar(v.ruta, v.explorado));
  if (v.hover !== null && v.hover.x >= 0 && v.hover.y >= 0 && v.hover.x < W && v.hover.y < H) {
    const c = casillaAPixel(camara, v.hover);
    ctx.strokeStyle = '#f2d585';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x - tile / 2 + 3, c.y - tile / 2 + 3, tile - 6, tile - 6);
  }
  ctx.restore();
}

/**
 * Cuántas casillas fuera de la cámara se sigue pintando una figura: lo más ancho
 * que lleva —la chapa, el estandarte— asoma desde la casilla de al lado.
 */
const MARGEN_DE_COSA: Margen = { lados: 2, arriba: 2, abajo: 2 };

/**
 * Dónde apoya los pies cada figura, en casillas bajo el borde de arriba de su
 * casilla: la misma convención que `Sprite.y` de la escena —la `y` de la base—,
 * que es lo que deja ordenar figuras y volúmenes juntos. Un pino con la base en
 * y + 0,9 tapa al héroe de esa casilla, que la tiene en y + 0,8.
 */
export const PIES = { heroe: 0.8, grupo: 0.82, suelto: 0.85 } as const;

/**
 * Dónde se ordena el rombo de un lugar: por detrás de quien está en él. Con el pie
 * de lo suelto tapaba al héroe y solo se veía su chapa (H4 del QA de la F1a); el
 * lugar, como un pueblo, es el sitio donde está. No va en `PIES`: no es una figura,
 * y la de pies más altos de `PIES` es la que mide `pisablesTapadas`.
 */
const PIE_DEL_LUGAR = PIES.heroe - 0.02;

/** Algo del juego que se pinta entre los volúmenes, con su clave de profundidad. */
type Cosa =
  | { readonly tipo: 'objeto'; readonly clave: number; readonly objeto: MapObject }
  | {
      readonly tipo: 'horneado';
      readonly clave: number;
      readonly objeto: MapObject;
      /** De donde cuelga su marca (`Escenario.asientoDeObjeto`). */
      readonly asiento: readonly [number, number];
      /** El pie del mástil de su bandera, si es un nodo (`Escenario.mastilDeNodo`). */
      readonly mastil: readonly [number, number] | null;
    }
  | {
      readonly tipo: 'heroe';
      readonly clave: number;
      readonly heroe: HeroeEnElMapa;
      /** Donde pisa, en casillas (`pisada`): en un puente, su tablero. */
      readonly pie: { readonly x: number; readonly y: number };
    }
  | {
      readonly tipo: 'asaltante';
      readonly clave: number;
      readonly asaltante: VistaAsaltante;
      readonly en: PosicionDeAsaltante;
    };

/**
 * Las figuras del juego que caen en la vista, de atrás adelante. Se rehace a cada
 * fotograma —son unas decenas— porque los asaltantes andan y su clave con ellos.
 *
 * Los grupos llegan ya filtrados por la regla del núcleo (`asaltantesALaVista`)
 * y aquí solo se reparten, en la misma pasada: los de casilla explorada, entre
 * los volúmenes; los de casilla sin explorar, en `sobreLaNiebla`, que se pinta
 * encima de ella y sin volúmenes que los tapen —su terreno no se conoce—.
 */
function cosasDe(v: VistaMapa, esc: Escenario): { cosas: Cosa[]; sobreLaNiebla: Cosa[] } {
  const { escena, camara, explorado } = v;
  const explorada = (p: Point): boolean => explorado === null || explorado.has(p);
  const { x0, y0, x1, y1 } = ventanaDeCasillas(camara, v.ancho, v.alto, MARGEN_DE_COSA);
  const enVista = (p: Point) => p.x >= x0 && p.y >= y0 && p.x < x1 && p.y < y1;
  const lista: Cosa[] = [];
  const sobreLaNiebla: Cosa[] = [];
  // Objetos y héroes llegan ya filtrados por la niebla (`objetosConocidos`,
  // `heroesALaVista`): lo que se ve está siempre explorado, así que aquí solo se
  // recortan a la cámara.
  for (const o of v.objetos) {
    if (!enVista(o.at) || !presente(o)) continue;
    if (seHornea(o.kind)) {
      // Su volumen lo pinta la escena; aquí va lo que cambia, justo después de él
      // (`claveDeLaMarca`), salvo el óvalo de una ciudad, que es suelo de su plaza.
      const clave = esc.claveDeLaMarca.get(o.id);
      if (clave === undefined)
        throw new Error(`${o.kind} ${o.id} se hornea y la escena no lo pinta`);
      const asiento = esc.asientoDeObjeto.get(o.id);
      if (asiento === undefined) throw new Error(`${o.kind} ${o.id} se hornea y no tiene asiento`);
      const mastil = o.kind === 'node' ? esc.mastilDeNodo.get(o.id) : null;
      if (mastil === undefined) throw new Error(`el nodo ${o.id} se hornea y no tiene mástil`);
      lista.push({ tipo: 'horneado', clave, objeto: o, asiento, mastil });
    } else {
      const pies =
        o.kind === 'monster' ? PIES.grupo : o.kind === 'lugar' ? PIE_DEL_LUGAR : PIES.suelto;
      lista.push({ tipo: 'objeto', clave: claveDeFigura(esc, o.at.x, o.at.y + pies), objeto: o });
    }
  }
  for (const h of v.heroes) {
    if (!enVista(h.at)) continue;
    const pie = pisada(esc, h.at, PIES.heroe);
    lista.push({ tipo: 'heroe', clave: pie.clave, heroe: h, pie });
  }
  const pintados = new Set<string>();
  for (const r of v.asaltantes) {
    if (!enVista(r.at)) continue;
    pintados.add(r.id);
    const en = posicionDeAsaltante(escena, r, v.tiempo);
    const clave = claveDeFigura(esc, en.x, en.y + PIES.grupo);
    (explorada(r.at) ? lista : sobreLaNiebla).push({ tipo: 'asaltante', clave, asaltante: r, en });
  }
  olvidarLosQueNoSePintan(escena, pintados);
  const porClave = (a: Cosa, b: Cosa): number => a.clave - b.clave;
  return { cosas: lista.sort(porClave), sobreLaNiebla: sobreLaNiebla.sort(porClave) };
}

/**
 * Los volúmenes de la escena que asoman en la vista, en su orden: se recorren
 * solo las filas visibles.
 *
 * Los volúmenes se pintan también sobre lo que no se ha explorado: la niebla
 * los tapa después, y lo que asoma por encima de lo explorado es la copa de una
 * formación cuya raíz sigue en la niebla (aceptado por el usuario). Lo horneado
 * no: una ciudad asomando diría dónde hay una ciudad.
 */
function volumenesALaVista(v: VistaMapa, esc: Escenario): VolumenDelMapa[] {
  const { camara, explorado } = v;
  const { x0, y0, x1, y1 } = ventanaDeCasillas(camara, v.ancho, v.alto, MARGEN_DE_VOLUMEN);
  const fuera: VolumenDelMapa[] = [];
  for (let fila = Math.max(0, y0); fila < Math.min(esc.porFila.length, y1); fila++)
    for (const vol of esc.porFila[fila] as readonly VolumenDelMapa[]) {
      // Con la base por encima de la vista no asoma: crece hacia arriba.
      if (vol.s.x < x0 || vol.s.x >= x1 || vol.s.y < camara.y) continue;
      if (vol.niebla !== null && explorado !== null && !explorado.hasIndex(vol.niebla)) continue;
      fuera.push(vol);
    }
  return fuera;
}

/**
 * Los volúmenes y las figuras fundidos por su clave. Los volúmenes se pintan en
 * píxeles de dispositivo con el origen del mapa en un píxel entero, que es lo que
 * pide su copia reducida (`OpcionesDePintura.reducida`); las figuras, en los de
 * la pantalla.
 */
function pintarLoQueTieneAltura(
  ctx: CanvasRenderingContext2D,
  v: VistaMapa,
  volumenes: readonly VolumenDelMapa[],
  cosas: readonly Cosa[],
): void {
  const enPantalla = ctx.getTransform();
  const dpr = densidadDe(ctx);
  const origen = mundoAPixel(v.camara, 0, 0);
  const ox = Math.round(enPantalla.e + origen.x * dpr);
  const oy = Math.round(enPantalla.f + origen.y * dpr);
  // Lo que no cupo en este fotograma (`copiaReducidaSiCabe`) sale en los
  // siguientes: el lienzo tiene que seguir pidiéndolos aunque nada respire.
  let aplazado = false;
  empezarFotogramaDeCopias();
  const opciones: OpcionesDePintura = {
    tile: v.camara.tile * dpr,
    imagen: imagenDeEscena,
    reducida: (s, ancho, alto) => {
      const r = copiaDeVolumen(s, ancho, alto);
      if (r === null) aplazado = true;
      return r;
    },
  };
  // Lo que tiene altura no sale del mapa por los lados ni por abajo: una muralla
  // de la columna 0 asomaba ~50 px sobre el margen negro (H3 de la vuelta 1 de
  // QA). Por arriba sí: el borde de arriba es el fondo del mapa, y lo que se
  // levanta en la fila 0 sube por encima como sube sobre cualquier otra fila,
  // igual que en el taller, que pinta la escena con margen. Recortarlo cortaba
  // las copas de la fila 0 en una línea recta.
  // Salvo lo que sube desde una casilla sin explorar (`recortadoArriba`): por
  // encima del mapa no hay niebla que lo tape (#152).
  const anchoDelMapa = Math.round(v.escena.map.width * opciones.tile);
  const altoDelMapa = Math.round(v.escena.map.height * opciones.tile);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath();
  ctx.rect(ox, oy - ARRIBA_SIN_RECORTE, anchoDelMapa, ARRIBA_SIN_RECORTE + altoDelMapa);
  ctx.clip();
  ctx.setTransform(enPantalla);
  let enElMapa = false;
  fundirPorProfundidad(
    volumenes,
    cosas,
    (vol) => {
      if (!enElMapa) {
        ctx.setTransform(1, 0, 0, 1, ox, oy);
        // Las copias de los volúmenes miden lo que se pinta y se copian 1:1;
        // solo se escala la de otro tamaño que se ve uno o pocos fotogramas
        // mientras se hace la suya (`copiaReducidaSiCabe`), y esa, en bilineal:
        // en alta calidad, los ~1 000 volúmenes que cambian de tamaño a cada
        // paso de rueda hacían tareas de 100-127 ms en 2560×1440 (2026-10-05).
        ctx.imageSmoothingQuality = 'low';
      }
      enElMapa = true;
      if (!recortadoArriba(vol, v.explorado)) {
        pintarSprite(ctx, vol.s, opciones);
        return;
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, anchoDelMapa, altoDelMapa);
      ctx.clip();
      pintarSprite(ctx, vol.s, opciones);
      ctx.restore();
    },
    (cosa) => {
      if (enElMapa) {
        ctx.setTransform(enPantalla);
        ctx.imageSmoothingQuality = 'high';
      }
      enElMapa = false;
      pintarCosa(ctx, v, cosa);
    },
  );
  ctx.restore();
  if (aplazado) animarHasta(performance.now() + 100);
}

/** Cuánto, en píxeles de dispositivo, puede subir sobre el borde de arriba lo que tiene altura: sin tope. */
const ARRIBA_SIN_RECORTE = 1e6;

/**
 * Si un volumen se recorta en el borde de arriba del mapa: sube por encima y su
 * casilla no se ha explorado. La niebla solo cubre el mapa y su marco de una
 * casilla, así que sin el recorte los picos de la fila 0 sin explorar flotaban
 * sobre el fondo, en 4K al tope de alejar (#152). Desde una casilla explorada se
 * sigue viendo lo que asoma; sin niebla (el espectador), no se recorta nada.
 */
export function recortadoArriba(vol: VolumenDelMapa, explorado: CasillasLeidas | null): boolean {
  return (
    vol.asomaPorArriba !== null && explorado !== null && !explorado.hasIndex(vol.asomaPorArriba)
  );
}

/**
 * Funde dos listas ya ordenadas por `clave`: los volúmenes de la escena y las
 * figuras del juego. A igual clave va antes el volumen, y la figura se apoya
 * delante. Es la regla que decide si un héroe queda detrás de un árbol.
 */
export function fundirPorProfundidad<V extends Volumen, C extends { readonly clave: number }>(
  volumenes: readonly V[],
  cosas: readonly C[],
  alVolumen: (v: V) => void,
  aLaCosa: (c: C) => void,
): void {
  let i = 0;
  for (const vol of volumenes) {
    while (i < cosas.length && (cosas[i] as C).clave < vol.clave) aLaCosa(cosas[i++] as C);
    alVolumen(vol);
  }
  while (i < cosas.length) aLaCosa(cosas[i++] as C);
}

/** El cuerpo de una cosa, en su sitio del orden de profundidad: un árbol lo puede tapar. */
function pintarCosa(ctx: CanvasRenderingContext2D, v: VistaMapa, c: Cosa): void {
  switch (c.tipo) {
    case 'objeto':
      pintarObjeto(ctx, v, c.objeto);
      return;
    case 'horneado':
      pintarDueñoDeLoHorneado(ctx, v, c.objeto, c.asiento);
      return;
    case 'heroe':
      pintarHeroe(ctx, v, c.heroe, c.pie);
      return;
    case 'asaltante':
      pintarAsaltante(ctx, v, c.asaltante, c.en);
      return;
  }
}

/**
 * Lo que dice quién o qué está en la casilla de una cosa —la inicial del héroe,
 * la chapa de cuántos son, el estandarte del asaltante, la bandera del dueño—,
 * encima de todo lo que tiene altura y por debajo de la niebla.
 * El cuerpo puede quedar detrás de un árbol (decisión del usuario), pero lo que
 * dice que está ahí se ve siempre: un grupo escondido en un bosque sin que nada
 * lo diga es una emboscada que no se ve venir.
 */
function pintarIdentificador(
  ctx: CanvasRenderingContext2D,
  v: VistaMapa,
  c: Cosa,
  cuerpos: ReadonlyMap<Cosa, CuerpoDeFigura>,
): void {
  const tile = v.camara.tile;
  switch (c.tipo) {
    case 'objeto': {
      if (c.objeto.kind !== 'monster') return;
      const p = casillaAPixel(v.camara, c.objeto.at);
      chapa(ctx, String(c.objeto.count), p.x + tile * 0.3, p.y + tile * 0.32, tile);
      return;
    }
    case 'horneado':
      pintarBanderaDeLoHorneado(ctx, v, c.objeto, c.asiento, c.mastil);
      return;
    case 'heroe': {
      const otros = [...cuerpos].filter(([o]) => o !== c).map(([, cuerpo]) => cuerpo);
      const en = asientoDeLaInicial(c.pie, otros, radioDeLaInicial(tile) / tile);
      const p = mundoAPixel(v.camara, en.x, en.y);
      const letra = c.heroe.name.charAt(0).toUpperCase();
      inicial(ctx, letra, p.x, p.y, tile, playerColor(c.heroe.owner));
      return;
    }
    case 'asaltante': {
      const p = mundoAPixel(v.camara, c.en.x + 0.5, c.en.y + 0.5);
      const cuantos = String(individuosDe(c.asaltante.troops));
      chapa(ctx, cuantos, p.x + tile * 0.3, p.y + tile * 0.32, tile);
      estandarteDeAsaltante(ctx, p.x - tile * 0.36, p.y - tile * 0.46, tile);
      return;
    }
  }
}

function presente(o: MapObject): boolean {
  if (o.kind === 'monster') return !o.defeated;
  if (o.kind === 'chest') return !o.taken;
  return true;
}

function pintarObjeto(ctx: CanvasRenderingContext2D, v: VistaMapa, o: MapObject): void {
  const { camara } = v;
  const tile = camara.tile;
  const c = casillaAPixel(camara, o.at);
  switch (o.kind) {
    case 'chest': {
      // Su pieza suelta (#147): antes salía de una celda del
      // atlas viejo, que se cargaba entero y se escalaba en cada fotograma.
      pintarSombra(ctx, c.x, c.y + tile * 0.22, tile * 0.4);
      if (pintarPieza(ctx, 'cofre', c.x, c.y + tile * 0.3, tile * 0.6)) return;
      ctx.fillStyle = COLOR_DEL_COFRE;
      ctx.fillRect(c.x - tile * 0.22, c.y - tile * 0.12, tile * 0.44, tile * 0.3);
      return;
    }
    case 'lugar': {
      // Un rombo en un poste, con la inicial del lugar: se ve de lejos y no se
      // confunde con un cofre ni con un pueblo.
      const r = tile * 0.26;
      const cy = c.y - tile * 0.32;
      pintarSombra(ctx, c.x, c.y + tile * 0.22, tile * 0.3);
      ctx.save();
      ctx.strokeStyle = 'rgba(30, 22, 12, 0.85)';
      ctx.lineWidth = Math.max(2, tile * 0.05);
      ctx.beginPath();
      ctx.moveTo(c.x, cy + r);
      ctx.lineTo(c.x, c.y + tile * 0.22);
      ctx.stroke();
      ctx.fillStyle = COLOR_DEL_LUGAR;
      ctx.beginPath();
      ctx.moveTo(c.x, cy - r);
      ctx.lineTo(c.x + r, cy);
      ctx.lineTo(c.x, cy + r);
      ctx.lineTo(c.x - r, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const tema = temaDelLienzo();
      ctx.fillStyle = 'rgba(30, 22, 12, 0.95)';
      ctx.font = `bold ${Math.max(9, Math.round(r * 1.1))}px ${tema.letraUi}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(inicialDelNombre(o.name), c.x, cy + 1);
      ctx.restore();
      return;
    }
    case 'monster':
      pintarGrupoNeutral(ctx, tile, c, {
        id: o.id,
        body: hojaDeUnidad(o.creature),
        cuantos: o.count,
        tiempo: v.tiempo,
        andando: false,
        mira: 'SO',
      });
      return;
    case 'town':
    case 'node':
    case 'village':
      throw new Error(
        `${o.kind} ${o.id} se hornea en la escena: lo suyo es pintarDueñoDeLoHorneado`,
      );
  }
}

/**
 * El óvalo del dueño bajo la ciudad y el nodo (el del nodo, justo después de
 * su volumen; el de la ciudad, en el suelo de su plaza, `claveDeLaMarca`): se
 * lee de lejos qué es de quién, y el nodo sin dueño, gris, dice qué falta por
 * tomar. El pueblo no lleva: es de quien tenga su región.
 */
function pintarDueñoDeLoHorneado(
  ctx: CanvasRenderingContext2D,
  v: VistaMapa,
  o: MapObject,
  asiento: readonly [number, number],
): void {
  const tile = v.camara.tile;
  const a = mundoAPixel(v.camara, ...asiento);
  switch (o.kind) {
    case 'town':
      base(ctx, a, tile * 0.62, playerColor(o.owner));
      return;
    case 'node':
      // Radio de 0,4: su óvalo baja `OVALO_BAJO_EL_ASIENTO` del asiento.
      base(ctx, a, tile * 0.4, playerColor(o.owner));
      return;
    case 'village':
      return;
    case 'chest':
    case 'monster':
    case 'lugar':
      throw new Error(`${o.kind} ${o.id} no se hornea en la escena: lo pinta pintarObjeto`);
  }
}

/** La bandera del dueño de la ciudad y del nodo. */
function pintarBanderaDeLoHorneado(
  ctx: CanvasRenderingContext2D,
  v: VistaMapa,
  o: MapObject,
  asiento: readonly [number, number],
  mastil: readonly [number, number] | null,
): void {
  const tile = v.camara.tile;
  const c = mundoAPixel(v.camara, ...asiento);
  switch (o.kind) {
    case 'town':
      bandera(ctx, c.x - tile * 0.55, c.y - tile * 1.05, tile, playerColor(o.owner));
      return;
    case 'node': {
      if (o.owner === null) return;
      if (mastil === null) throw new Error(`el nodo ${o.id} no tiene dónde plantar su bandera`);
      // Desde el pie, que es lo que se apoya: 0,75 de casilla, y el mástil mide la mitad.
      const m = mundoAPixel(v.camara, ...mastil);
      bandera(ctx, m.x, m.y - tile * 0.75 * 0.5, tile * 0.75, playerColor(o.owner));
      return;
    }
    case 'village':
      return;
    case 'chest':
    case 'monster':
    case 'lugar':
      throw new Error(`${o.kind} ${o.id} no se hornea en la escena: no lleva bandera`);
  }
}

function pintarHeroe(
  ctx: CanvasRenderingContext2D,
  v: VistaMapa,
  h: HeroeEnElMapa,
  pie: { readonly x: number; readonly y: number },
): void {
  const tile = v.camara.tile;
  const c = mundoAPixel(v.camara, pie.x, pie.y);
  const suelo = c.y;
  const color = playerColor(h.owner);
  // El aro del dueño, y el del seleccionado por fuera, en dorado y discontinuo.
  ctx.save();
  ctx.lineWidth = Math.max(2, tile * 0.045);
  ctx.strokeStyle = color;
  ctx.fillStyle = `${color}33`;
  ctx.beginPath();
  ctx.ellipse(c.x, suelo, tile * 0.32, tile * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (h.id === v.seleccionado) {
    ctx.strokeStyle = '#f5d973';
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.ellipse(c.x, suelo, tile * 0.42, tile * 0.18, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  const figura: Figura = {
    // El héroe a pie, con la hoja de su tipo: la misma con que pisa el tablero y
    // la base (`figuraDelHeroe`). Con `HERO_BODY` era el Y Bot («la imagen es el
    // y_bot», 19-10-2026).
    id: h.id,
    body: figuraDelHeroe(h),
    clip: 'idle',
    tiempo: v.tiempo,
    x: c.x,
    suelo,
    alto: tile * ALTO_DEL_HEROE,
    mira: MIRADA_DE_PRESENTACION,
    color,
    rotulo: h.name.charAt(0).toUpperCase(),
  };
  pintarFiguraConSombra(ctx, figura);
}

/**
 * Un grupo de asaltantes: la figura de su primera criatura en su color, sobre su
 * suelo morado, deslizándose de la casilla de ayer a la de hoy con el clip de
 * andar. La chapa y el estandarte van en `pintarIdentificador`.
 */
function pintarAsaltante(
  ctx: CanvasRenderingContext2D,
  v: VistaMapa,
  r: VistaAsaltante,
  p: PosicionDeAsaltante,
): void {
  const tile = v.camara.tile;
  if (p.andando) animarHasta(p.hasta);
  const c = mundoAPixel(v.camara, p.x + 0.5, p.y + 0.5);
  const suelo = c.y + tile * 0.32;
  // El suelo RELLENO y no solo el aro discontinuo: con arte, un grupo de
  // piqueros es la misma figura gris que un monstruo de piqueros, y el aro solo
  // se perdía a zoom medio (H5). La mancha morada se lee de lejos.
  ctx.save();
  ctx.lineWidth = Math.max(2, tile * 0.04);
  ctx.fillStyle = `${COLOR_ASALTANTE}59`;
  ctx.strokeStyle = COLOR_ASALTANTE;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.ellipse(c.x, suelo, tile * 0.34, tile * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  pintarGrupoNeutral(ctx, tile, c, {
    id: r.id,
    body: figuraDelGrupo(r),
    cuantos: individuosDe(r.troops),
    tiempo: v.tiempo,
    andando: p.andando,
    mira: p.mira,
  });
}

/**
 * El estandarte del asaltante: un mástil con un gallardete de cola partida y
 * dos espadas cruzadas. Es la marca que lo separa del monstruo **por la forma**
 * y no solo por el color —con arte la figura es la misma (H5)—, y es otra forma
 * que la bandera triangular de los dueños, para que no se lea como de nadie.
 */
function estandarteDeAsaltante(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tile: number,
): void {
  const alto = tile * 0.62;
  const ancho = tile * 0.3;
  const paño = tile * 0.22;
  ctx.save();
  ctx.strokeStyle = '#2b2119';
  ctx.lineWidth = Math.max(1.5, tile * 0.03);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + alto);
  ctx.stroke();
  ctx.fillStyle = COLOR_ASALTANTE;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + ancho, y);
  ctx.lineTo(x + ancho * 0.7, y + paño / 2);
  ctx.lineTo(x + ancho, y + paño);
  ctx.lineTo(x, y + paño);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Las espadas: dos trazos blancos en aspa sobre el paño.
  const cx = x + ancho * 0.36;
  const cy = y + paño / 2;
  const r = paño * 0.32;
  ctx.strokeStyle = '#f4ecf6';
  ctx.lineWidth = Math.max(1.2, tile * 0.022);
  ctx.beginPath();
  ctx.moveTo(cx - r, cy - r);
  ctx.lineTo(cx + r, cy + r);
  ctx.moveTo(cx + r, cy - r);
  ctx.lineTo(cx - r, cy + r);
  ctx.stroke();
  ctx.restore();
}

/**
 * Un grupo sin dueño —monstruo que guarda o asaltante que patrulla—: la figura
 * de su criatura teñida del gris de lo que no tiene dueño, con su sombra. Los dos
 * se pintan igual a propósito: lo que los distingue es el suelo morado y el
 * estandarte del asaltante, no la figura. Y el gris es lo que los separa del
 * héroe, que lleva el color de su dueño.
 */
/** La figura de un grupo de asaltantes: la hoja de la unidad de su primer individuo. */
function figuraDelGrupo(r: VistaAsaltante): string {
  const id = r.troops[0]?.creature;
  if (id === undefined) throw new Error(`el grupo de asaltantes ${r.id} no tiene tropa`);
  return hojaDeUnidad(id);
}

function pintarGrupoNeutral(
  ctx: CanvasRenderingContext2D,
  tile: number,
  c: { readonly x: number; readonly y: number },
  g: {
    readonly id: string;
    readonly body: string;
    readonly cuantos: number;
    readonly tiempo: number;
    readonly andando: boolean;
    readonly mira: Direccion;
  },
): void {
  pintarFiguraConSombra(ctx, {
    id: g.id,
    body: g.body,
    clip: g.andando ? 'walk' : 'idle',
    tiempo: g.tiempo,
    x: c.x,
    suelo: c.y + tile * 0.32,
    alto: tile * ALTO_DEL_GRUPO,
    mira: g.mira,
    color: COLOR_SIN_DUEÑO,
    rotulo: String(g.cuantos),
  });
}

/** El cuerpo de una figura del mapa, en casillas: dónde pisa, su media anchura y su alto. */
export interface CuerpoDeFigura {
  readonly x: number;
  readonly pie: number;
  readonly semiancho: number;
  readonly alto: number;
}

/** El alto de la figura de un héroe, en casillas (`pintarHeroe`). */
const ALTO_DEL_HEROE = 0.92;

/** Los cuerpos de las figuras que hay que respetar al poner una inicial: héroes y grupos sin dueño. */
function cuerposDe(cosas: readonly Cosa[]): Map<Cosa, CuerpoDeFigura> {
  const cuerpos = new Map<Cosa, CuerpoDeFigura>();
  for (const c of cosas) {
    if (c.tipo === 'heroe')
      cuerpos.set(c, { x: c.pie.x, pie: c.pie.y, semiancho: 0.3, alto: ALTO_DEL_HEROE });
    // El grupo pisa a 0,32 bajo el centro de su casilla (`pintarAsaltante`, `pintarObjeto`).
    else if (c.tipo === 'asaltante')
      cuerpos.set(c, {
        x: c.en.x + 0.5,
        pie: c.en.y + 0.82,
        semiancho: 0.34,
        alto: ALTO_DEL_GRUPO,
      });
    else if (c.tipo === 'objeto' && c.objeto.kind === 'monster')
      cuerpos.set(c, {
        x: c.objeto.at.x + 0.5,
        pie: c.objeto.at.y + 0.82,
        semiancho: 0.34,
        alto: ALTO_DEL_GRUPO,
      });
  }
  return cuerpos;
}

/**
 * Dónde se prueba la inicial de un héroe, respecto a sus pies, en casillas: sobre
 * la cabeza (a 1,0 de los pies), y si ahí tapa a otra figura, a un lado de la
 * cabeza, primero el derecho.
 */
export const SITIOS_DE_LA_INICIAL: readonly (readonly [number, number])[] = [
  [0, -1.0],
  [0.45, -0.72],
  [-0.45, -0.72],
];

/** El radio del disco de la inicial, en píxeles: nunca menos de 8 para que la letra se lea. */
const radioDeLaInicial = (tile: number): number => Math.max(8, tile * 0.13);

/**
 * El centro de la inicial de un héroe que pisa en `pie`, en casillas: el primer
 * sitio de `SITIOS_DE_LA_INICIAL` cuyo disco (de `radio` casillas) no cae sobre
 * el cuerpo de otra figura. Con dos héroes en fila sobre un puente N-S, la «A»
 * del de delante caía sobre las piernas del de detrás y no se leía cuál estaba
 * en el puente (#166 H11). Si no hay sitio libre, sobre la cabeza: la inicial va
 * siempre, aunque tape.
 */
export function asientoDeLaInicial(
  pie: { readonly x: number; readonly y: number },
  otros: readonly CuerpoDeFigura[],
  radio: number,
): { x: number; y: number } {
  const tapa = (x: number, y: number) =>
    otros.some((o) => {
      // Del centro del disco al rectángulo del cuerpo: si cae dentro del radio, lo tapa.
      const dx = Math.max(o.x - o.semiancho - x, 0, x - (o.x + o.semiancho));
      const dy = Math.max(o.pie - o.alto - y, 0, y - o.pie);
      return dx * dx + dy * dy < radio * radio;
    });
  for (const [dx, dy] of SITIOS_DE_LA_INICIAL) {
    if (!tapa(pie.x + dx, pie.y + dy)) return { x: pie.x + dx, y: pie.y + dy };
  }
  const [dx, dy] = SITIOS_DE_LA_INICIAL[0] as readonly [number, number];
  return { x: pie.x + dx, y: pie.y + dy };
}

/** La inicial de un héroe en un disco del color de su dueño, sobre su cabeza. */
function inicial(
  ctx: CanvasRenderingContext2D,
  letra: string,
  x: number,
  y: number,
  tile: number,
  color: string,
): void {
  const r = radioDeLaInicial(tile);
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(20,17,13,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fbf6ea';
  ctx.font = `bold ${Math.round(r * 1.2)}px ${temaDelLienzo().letraUi}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letra, x, y + 0.5);
  ctx.restore();
}

/** Un óvalo del color del dueño bajo lo que se posee: se lee de lejos. */
function base(
  ctx: CanvasRenderingContext2D,
  c: { x: number; y: number },
  r: number,
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = `${color}40`;
  ctx.strokeStyle = `${color}cc`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + r * 0.45, r, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** El estandarte del dueño: un mástil con su color. */
function bandera(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tile: number,
  color: string,
): void {
  const alto = tile * 0.5;
  ctx.save();
  ctx.strokeStyle = '#2b2119';
  ctx.lineWidth = Math.max(1.5, tile * 0.03);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + alto);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + tile * 0.28, y + tile * 0.08);
  ctx.lineTo(x, y + tile * 0.17);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Una cifra en una chapa oscura: cuántos son en un grupo sin dueño. */
function chapa(
  ctx: CanvasRenderingContext2D,
  texto: string,
  x: number,
  y: number,
  tile: number,
): void {
  const alto = Math.max(14, tile * 0.24);
  const tema = temaDelLienzo();
  ctx.save();
  ctx.font = `bold ${Math.round(alto * 0.72)}px ${tema.letraUi}`;
  const ancho = ctx.measureText(texto).width + alto * 0.6;
  // El fondo del tema es opaco: la transparencia es de esta chapa, no del tema.
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = tema.chapaFondo;
  ctx.fillRect(x - ancho / 2, y - alto / 2, ancho, alto);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = tema.chapaBorde;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - ancho / 2 + 0.5, y - alto / 2 + 0.5, ancho - 1, alto - 1);
  ctx.fillStyle = tema.chapaTinta;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, x, y + 0.5);
  ctx.restore();
}

/**
 * La niebla como máscara de un píxel por casilla, escalada con suavizado: los
 * bordes salen difuminados sin calcular ninguna curva, y lo desconocido queda
 * negro de verdad aunque haya algo debajo.
 *
 * La máscara se rehace solo cuando crece lo explorado o cambia lo que se ve
 * ahora (`visibles` es otro objeto cuando la sesión lo recalcula); el resto de
 * fotogramas es un solo `drawImage`. Antes eran 576 `fillRect` a cada uno.
 */
let niebla: {
  lienzo: HTMLCanvasElement;
  explorado: CasillasLeidas | null;
  vistos: number;
  visibles: CasillasLeidas | null;
  ancho: number;
  alto: number;
} | null = null;

function mascaraDeNiebla(v: VistaMapa): HTMLCanvasElement {
  const { width: W, height: H } = v.escena.map;
  const vistos = v.explorado?.size ?? -1;
  if (
    niebla !== null &&
    niebla.explorado === v.explorado &&
    niebla.vistos === vistos &&
    niebla.visibles === v.visibles &&
    niebla.ancho === W &&
    niebla.alto === H
  ) {
    return niebla.lienzo;
  }
  const mascara = niebla?.lienzo ?? document.createElement('canvas');
  // Un marco de una casilla de niebla alrededor del mapa: sin él, el suavizado
  // del borde de la imagen dejaba asomar una línea de terreno por fuera.
  mascara.width = W + 2;
  mascara.height = H + 2;
  const m = mascara.getContext('2d');
  if (m === null) throw new Error('este navegador no tiene canvas 2D para la niebla');
  m.clearRect(0, 0, W + 2, H + 2);
  m.fillStyle = '#080a10';
  if (v.explorado !== null) {
    m.fillRect(0, 0, W + 2, 1);
    m.fillRect(0, H + 1, W + 2, 1);
    m.fillRect(0, 0, 1, H + 2);
    m.fillRect(W + 1, 0, 1, H + 2);
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (v.explorado !== null && !v.explorado.hasIndex(i)) m.fillStyle = '#080a10';
      else if (v.visibles !== null && !v.visibles.hasIndex(i)) m.fillStyle = 'rgba(8,13,22,0.42)';
      else continue;
      m.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  niebla = {
    lienzo: mascara,
    explorado: v.explorado,
    vistos,
    visibles: v.visibles,
    ancho: W,
    alto: H,
  };
  return mascara;
}

function pintarNiebla(ctx: CanvasRenderingContext2D, v: VistaMapa): void {
  if (v.explorado === null && v.visibles === null) return;
  const { width: W, height: H } = v.escena.map;
  const o = mundoAPixel(v.camara, -1, -1);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  // Bilineal y no la de alta calidad de `drawMapa`: la máscara es de un píxel
  // por casilla y se amplía a la pantalla entera a cada fotograma. Sin GPU, la
  // alta calidad costaba 10 fps en 2560×1440 (22 → 32) para un borde difuminado
  // que se ve igual.
  ctx.imageSmoothingQuality = 'low';
  ctx.drawImage(mascaraDeNiebla(v), o.x, o.y, (W + 2) * v.camara.tile, (H + 2) * v.camara.tile);
  ctx.restore();
}

/** Cómo se pinta un paso: el destino y la parada de hoy van más grandes. */
export interface PasoPintado extends PasoDeRuta {
  readonly marca: 'destino' | 'parada' | 'paso';
}

/**
 * Los pasos de la ruta que se pintan, con su marca: solo los de casillas
 * exploradas.
 *
 * La ruta la calcula el núcleo con el mapa entero, y pintada sobre la niebla
 * **dibujaba la red sin explorar**: el trazo esquivaba cordilleras que el
 * jugador no ha visto y se paraba en pasos que no conoce (M5 de la QA de la
 * 2a). Lo de dentro de la niebla no se pinta, tampoco el destino; el destino
 * explorado sí. Con `explorado` a `null` —verlo todo, o el espectador— se pinta
 * entera.
 *
 * La marca se decide **sobre la ruta entera y después se filtra**, y el orden
 * importa: al revés, el último paso explorado salía con el círculo grande del
 * destino, señalando como llegada una casilla que no lo es.
 */
export function pasosAPintar(
  ruta: readonly PasoDeRuta[],
  explorado: CasillasLeidas | null,
): readonly PasoPintado[] {
  const marcados = ruta.map((paso, i): PasoPintado => {
    // El último de hoy es donde se parará el héroe: se marca aparte.
    const marca =
      i === ruta.length - 1
        ? 'destino'
        : paso.hoy && (ruta[i + 1]?.hoy ?? false) === false
          ? 'parada'
          : 'paso';
    return { ...paso, marca };
  });
  if (explorado === null) return marcados;
  return marcados.filter((paso) => explorado.has(paso.at));
}

function pintarRuta(
  ctx: CanvasRenderingContext2D,
  camara: CamaraMapa,
  esc: Escenario,
  pasos: readonly PasoPintado[],
): void {
  if (pasos.length === 0) return;
  ctx.save();
  for (const paso of pasos) {
    // En la casilla de un puente, sobre su tablero: donde se pintará el héroe.
    const p = pisada(esc, paso.at, 0.5);
    const c = mundoAPixel(camara, p.x, p.y);
    // El tramo de la emboscada en rojo, hoy u otro día: ahí se para la marcha y
    // empieza una batalla, que es lo que la persona tiene que ver antes de pulsar.
    ctx.fillStyle = paso.peligro === true ? COLOR_EMBOSCADA : paso.hoy ? '#f6db78' : '#9aa1a8';
    ctx.strokeStyle = '#1b1608';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, paso.marca === 'paso' ? 3.5 : 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (paso.emboscada !== undefined) {
      // La casilla donde salta: un aviso que se lee sin color —un «!» en un
      // rombo—, porque el rojo solo no lo distingue quien no ve el rojo.
      ctx.fillStyle = COLOR_EMBOSCADA;
      ctx.strokeStyle = '#fff4e0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - 13);
      ctx.lineTo(c.x + 10, c.y);
      ctx.lineTo(c.x, c.y + 13);
      ctx.lineTo(c.x - 10, c.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff4e0';
      ctx.font = `bold 14px ${temaDelLienzo().letraUi}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', c.x, c.y + 1);
    }
    if (paso.marca === 'parada') {
      ctx.strokeStyle = '#f6db78';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 10, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}
