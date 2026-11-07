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
 * de la sesión (`sesion/partida.ts`), que es la puerta al núcleo.
 *
 * Solo pinta: ni guarda estado de la partida ni escucha al ratón.
 *
 * Aquí quedan el dibujo (`drawMapa`, con lo que pinta: `VistaMapa`), el suelo y el
 * presupuesto de píxeles; lo que pinta vive al lado, en `render/mapa/`: la ruta, las
 * cosas del juego, los asaltantes, los volúmenes, los rótulos y la niebla (fase C de la
 * reorganización, 07-11-2026).
 */

import type { CasillasLeidas } from '@core/map/casillas.js';
import type { RedDeCaminos } from '@core/map/red-de-caminos.js';
import type { TerrainKind } from '@core/map/terrain.js';
import type { MapObject, MapRegion } from '@core/map/tipos.js';
import type { AsaltantesALaVista } from '@core/state/asaltantes.js';
import type { ClimaDeLaPartida } from '@core/state/clima.js';
import type { FactionId, Point, VistaAsaltante } from '@core/types.js';
import { pintarClimaDelMapa } from '../clima/clima.js';
import type { Imagen } from '../escenario/pintar.js';
import { type Escenario, escenarioListo, sueloDelMapa } from '../escenario/superficie.js';
import type { Direccion } from '../figuras/direccion.js';
import { densidadDe } from '../lienzo.js';
import { pintarLoTapadoDeLosAsaltantes } from './asaltantes.js';
import { type CamaraMapa, casillaAPixel, mundoAPixel } from './camara.js';
import { cosasDe } from './cosas.js';
import { pintarNiebla } from './niebla.js';
import { cuerposDe, pintarIdentificador, pintarOcupacion } from './rotulos.js';
import {
  COLOR_EMBOSCADA,
  type PasoDeRuta,
  pasosAPintar,
  pintarLineaDeLaRuta,
  pintarRuta,
} from './ruta.js';
import type { SitioOcupado } from './sitios-sabidos.js';
import { nodosQueSeSaben, pintarLoQueTieneAltura, volumenesALaVista } from './volumenes.js';

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

/** El héroe que anda su marcha (`VistaMapa.andando`). */
export interface HeroeQueAnda {
  readonly heroe: string;
  /** Dónde pisa, en casillas. */
  readonly x: number;
  readonly y: number;
  /** La casilla de su marcha que tiene más cerca: la de su profundidad. */
  readonly cerca: Point;
  readonly mira: Direccion;
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
   * El héroe que anda ahora (`enLaMarcha`): se pinta donde pisa (`x`, `y`, en
   * casillas, por su traza: `puntosDeLaTraza`), con su clip de marcha y mirando
   * hacia donde va, y no en su casilla, que ya es la de llegada; con la
   * profundidad de la casilla de su marcha que tiene más cerca (`cerca`). Sin él
   * (el espectador), cada héroe en su casilla.
   */
  readonly andando?: HeroeQueAnda;
  /**
   * Mientras el héroe anda: la ruta (`ruta`, la de su marcha y lo que le quedaba)
   * sale de `origen`, de donde salió, y su línea se pinta desde donde va, a `t`
   * del tramo `tramo` de su traza; sus puntos, desde el paso `pasados` de la ruta.
   * Sin él, la ruta sale del héroe elegido.
   */
  readonly marchaDeLaRuta?: {
    readonly origen: Point;
    readonly tramo: number;
    readonly t: number;
    readonly pasados: number;
  };
  /**
   * Los objetos que se pintan, con el estado que se SABE de ellos: vivos donde
   * se mira ahora y, en lo demás explorado, el recuerdo de cuando se vieron
   * (`Session.objetosConocidos`). La bandera de un castillo lejano es la de su
   * último dueño visto. `escena.map.objects` sigue ahí para la escena —dónde
   * está cada cosa, que no cambia—, no para pintar su estado.
   */
  readonly objetos: readonly MapObject[];
  /**
   * Las ciudades y los pueblos ocupados que se saben (`ocupanteDe`, como se
   * vieron): la marca de la ocupación, del color del ocupante (tarea 2,
   * 05-11-2026). La persona, `Session.ocupados`; el espectador, del cable.
   */
  readonly ocupados: readonly SitioOcupado[];
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
   * La casilla de un ataque a quien juega, mientras su aviso está en pantalla
   * (`Session.avisoDelAtaque`): un aro rojo que late encima de todo. El
   * espectador no la pasa.
   */
  readonly ataque?: Point | null;
  /**
   * La semilla de la partida, que es la de la escena (`componer`): la misma en
   * el cliente, el espectador y el taller, así que los tres ven el mismo mapa.
   */
  readonly semilla: number;
  /** Reloj de la animación de reposo, en milisegundos. */
  readonly tiempo: number;
  /**
   * El clima de hoy de cada región (`climaDeLaPartida`, con lo forzado por
   * `?clima=` encima), o `null` para no pintar ninguno. Presentación: va bajo la
   * niebla de guerra (`drawMapa`, paso 2b).
   */
  readonly clima: ClimaDeLaPartida | null;
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

  // 1b · La línea de la ruta, en el suelo: bajo lo que tiene altura (no tapa
  //      figuras ni lo que dice quién está) y bajo la niebla, como el camino que
  //      es. Los puntos de cada paso van encima de todo (paso 5).
  pintarLineaDeLaRuta(ctx, v, esc);

  // 2 · Lo que tiene altura —los volúmenes de la escena y las figuras del juego—,
  //     en un solo orden de profundidad: una figura puede quedar detrás de un árbol.
  const nodos = nodosQueSeSaben(v);
  const cosas = cosasDe(v, esc, nodos);
  const tapados = pintarLoQueTieneAltura(ctx, v, volumenesALaVista(v, esc, nodos), cosas);

  // 2b · El clima de cada región, encima de lo que tiene altura y DEBAJO de los
  //      identificadores y de la niebla de guerra: no tapa ni destapa nada de
  //      ella, y lo inexplorado sigue siendo negro (criterio 3 del clima).
  if (v.clima !== null) {
    pintarClimaDelMapa(
      ctx,
      {
        mapa: escena.map,
        semilla: v.semilla,
        clima: v.clima,
        camara,
        ancho: v.ancho,
        alto: v.alto,
        fuegos: fuegosDe(esc),
      },
      v.tiempo,
    );
  }

  // 2c · Lo tapado de cada grupo de asaltantes, en silueta: lo que los tapa no
  //      los esconde enteros. Encima del clima, como lo que dice quién está: de
  //      noche y con niebla se lee igual.
  pintarLoTapadoDeLosAsaltantes(ctx, tapados);

  // 3 · Lo que dice quién está en cada casilla, encima de todo lo que tiene altura.
  const cuerpos = cuerposDe(cosas);
  for (const cosa of cosas) pintarIdentificador(ctx, v, cosa, cuerpos);
  //     Y la marca de cada sitio ocupado, con ellos: dice quién está dentro de lo
  //     que no es suyo (tarea 2), aunque la figura quede detrás de algo.
  for (const s of v.ocupados) pintarOcupacion(ctx, v, s);

  // 4 · La niebla: negra sobre lo desconocido, tenue sobre lo que no se mira.
  //     Nada va encima: lo que se ve está siempre explorado (`visibleNow`), también
  //     los grupos de asaltantes desde la niebla de eventos (02-11-2026).
  pintarNiebla(ctx, v);

  // 5 · Encima de todo, lo que es de quien juega: la ruta y la casilla señalada.
  //     Mientras anda, de la ruta solo lo que le queda.
  const ruta = v.marchaDeLaRuta === undefined ? v.ruta : v.ruta.slice(v.marchaDeLaRuta.pasados);
  pintarRuta(ctx, camara, esc, pasosAPintar(ruta, v.explorado));
  if (v.hover !== null && v.hover.x >= 0 && v.hover.y >= 0 && v.hover.x < W && v.hover.y < H) {
    const c = casillaAPixel(camara, v.hover);
    ctx.strokeStyle = '#f2d585';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x - tile / 2 + 3, c.y - tile / 2 + 3, tile - 6, tile - 6);
  }
  if (v.ataque != null) pintarAtaque(ctx, camara, v.ataque, tile, v.tiempo);
  ctx.restore();
}

/** El aro que late en la casilla de un ataque a quien juega (`VistaMapa.ataque`). */
function pintarAtaque(
  ctx: CanvasRenderingContext2D,
  camara: CamaraMapa,
  at: Point,
  tile: number,
  tiempo: number,
): void {
  const c = casillaAPixel(camara, at);
  const fase = (tiempo % 1200) / 1200;
  ctx.save();
  ctx.strokeStyle = COLOR_EMBOSCADA;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + tile * 0.3, tile * 0.55, tile * 0.28, 0, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.globalAlpha = 0.9 * (1 - fase);
  ctx.beginPath();
  ctx.ellipse(
    c.x,
    c.y + tile * 0.3,
    tile * (0.55 + 0.5 * fase),
    tile * (0.28 + 0.25 * fase),
    0,
    0,
    2 * Math.PI,
  );
  ctx.stroke();
  ctx.restore();
}

const fuegos = new WeakMap<Escenario, readonly { x: number; y: number; r: number }[]>();

/** Los fuegos de ciudades y pueblos de la escena (`Escena.luces` de clase `fuego`): los que se encienden de noche. */
function fuegosDe(esc: Escenario): readonly { x: number; y: number; r: number }[] {
  const hechos = fuegos.get(esc);
  if (hechos !== undefined) return hechos;
  const lista = esc.escena.luces.filter((l) => l.clase === 'fuego');
  fuegos.set(esc, lista);
  return lista;
}
