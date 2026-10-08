/**
 * La escena del mapa en el juego: lo que se compone una vez por partida, la
 * superficie del suelo que se pinta una vez, y las copias reducidas de las que
 * salen los volúmenes de cada fotograma.
 *
 * El reparto lo decidió el usuario: **el suelo va en una superficie fija**
 * —texturas, relieve, caras de roca, agua, sendas y la cubierta baja— y **los
 * volúmenes se pintan a cada fotograma**, solo los visibles, ordenados por
 * profundidad junto con las figuras: una figura puede quedar detrás de un árbol.
 */
import { pointKey } from '@core/map/map.js';
import type { TerrainKind } from '@core/map/terrain.js';
import catalogoDelRepo from '../../../../assets/mapa/escena.json' with { type: 'json' };
import {
  avisarDeArteNuevo,
  cargarArteDeEscena,
  imagenDeEscena,
  soltarArteDeEscena,
  tandaDeArte,
  volverAPedirArteDeEscena,
} from '../assets.js';
import {
  type ConteoDeVolumenes,
  contarVolumenes,
  MAX_VOLUMENES_VISIBLES,
  PX_AL_ZOOM_MAXIMO,
  TILE_MAX,
  tileMinimo,
} from '../camara-mapa.js';
import { copiaReducidaSiCabe } from '../copias.js';
import { pigments } from '../terreno.js';
import type { MapaDeEscena } from './analizar.js';
import { perfilesDelCatalogo } from './caras.js';
import { type Catalogo, catalogoValidado } from './catalogo.js';
import { componer, type Escena, type Sprite } from './colocar.js';
import { delanteDeLasParedes } from './figuras.js';
import { horneado } from './horneado.js';
import { cajaDeSprite } from './pasillo.js';
import {
  type EscenaSeparada,
  type Imagen,
  imagenesDeEscena,
  lienzoCon,
  olvidarEntonadas,
  separar,
  type Volumen,
} from './pintar.js';
import { type MensajeDelSuelo, type PeticionDelSuelo, pintarSueloA } from './pintor-del-suelo.js';
import type { Punto } from './puentes.js';

/**
 * El catálogo de `assets/mapa/escena.json`, que rehace `pnpm taller
 * catalogo-escena` (un test comprueba que está al día). Va dentro del guion: son
 * 60 KB y `componer` lo necesita antes del primer fotograma. Se comprueba al
 * cargarlo (`catalogoValidado`): una ladera sin sus juntas lanza aquí.
 */
const CATALOGO: Catalogo = catalogoValidado(catalogoDelRepo);

/**
 * Píxeles por casilla de la superficie del suelo hasta dpr 1,09: los del zoom
 * máximo en la pantalla del usuario, ⌈`TILE_MAX` × 1,09⌉, para que el suelo no
 * se amplíe y se vea tan nítido como los volúmenes, que se pintan desde su arte.
 * Con más densidad, más (`resolucionDelSuelo`); nunca menos. El arte
 * llega: las texturas son 128 px por casilla (agua y barro, 171), y lo plano,
 * 141 como mínimo (2026-10-05).
 *
 * Medido en el Chromium sin GPU de `pnpm capturas` (34×34, 2026-10-05), el
 * Worker tarda en pintarlo 5,5 s; el 90 % son las capas 1-6, máscaras a mapa
 * entero. Son 67 MB; con el esbozo, 83.
 */
export const PX_DEL_SUELO = PX_AL_ZOOM_MAXIMO;
/**
 * El esbozo: el mismo suelo a la mitad, que se pinta primero (~1,4 s) para no
 * tener el sucedáneo de pigmentos los 5,5 s que tarda el bueno, y que se copia
 * cuando la casilla en pantalla no pasa de 60 píxeles de dispositivo.
 */
export const PX_DEL_ESBOZO = 60;

/**
 * Lo que puede ocupar el suelo bueno, en bytes (RGBA): en un 34×34, 165 px por
 * casilla, los del zoom máximo a dpr 1,5 (#148). Más allá, el suelo se amplía y
 * la consola lo dice.
 *
 * Medido en el Chromium sin GPU de `pnpm capturas` (semillas 1 y 7, la máquina
 * cargada, 2026-10-08), el bueno a 120/138/165/220 px por casilla (dpr 1, 1,25,
 * 1,5, 2): ocupa 67/88/126/224 MB, el Worker tarda 6-7/8-10/11-12,5/20-21 s y el
 * navegador sube mientras 0,4-0,6/0,6-0,7/0,9-1,05/1,5-1,6 GB: unas siete veces la
 * superficie, en búferes del lienzo que no se ven desde aquí (soltar las
 * máscaras de mapa entero en cuanto se copian no lo bajaba). Y el arte no da
 * para mucho más: las texturas son de 128 px por casilla, y lo plano, de 141 como
 * poco (`cubierta-rough/2.webp` se coloca a 157-290; 2026-10-05). A dpr 2, una
 * ventana de 1440×900 pasa de `PIXELES_AL_ACERCAR` y en el zoom máximo se pinta
 * a densidad 1,34: le bastan 147.
 */
export const BYTES_DEL_SUELO_BUENO = 126_000_000;

/** A cuánto se pinta el suelo bueno en una pantalla (`resolucionDelSuelo`). */
export interface ResolucionDelSuelo {
  /** Píxeles por casilla del suelo bueno. */
  readonly px: number;
  /** Los que pide la casilla del zoom máximo en esa pantalla: si pasan de `px`, el tope lo deja corto. */
  readonly pide: number;
}

/**
 * A cuántos píxeles por casilla se pinta el suelo bueno de un mapa de `W × H` en
 * una pantalla de densidad `dpr` (#148): los de la casilla del zoom máximo,
 * `TILE_MAX × dpr`, para que no se amplíe, y nunca menos de `PX_DEL_SUELO`
 * —hasta dpr 1,09 nada cambia—. Con más densidad, hasta lo que cabe en
 * `BYTES_DEL_SUELO_BUENO`; si no cabe, `pide` dice cuánto faltaba.
 */
export function resolucionDelSuelo(dpr: number, W: number, H: number): ResolucionDelSuelo {
  if (!(dpr > 0) || !Number.isFinite(dpr))
    throw new Error(`la densidad de la pantalla tiene que ser un número de más de 0, y es ${dpr}`);
  if (!(W > 0) || !(H > 0))
    throw new Error(`el suelo de un mapa de ${W}×${H} casillas no se puede pintar`);
  // Sin el épsilon, 110 × 1,1 da 121,00000000000001 y pediría 122.
  const pide = Math.max(PX_DEL_SUELO, Math.ceil(TILE_MAX * dpr - 1e-9));
  const caben = Math.floor(Math.sqrt(BYTES_DEL_SUELO_BUENO / (4 * W * H)));
  return { px: Math.max(PX_DEL_SUELO, Math.min(pide, caben)), pide };
}

/**
 * Un volumen de la escena tal y como lo recorre cada fotograma: con la clave de
 * niebla (`"x,y"`) de la casilla del objeto horneado que pinta, para no
 * construirla a cada fotograma; `null` si no pinta ninguno.
 */
export interface VolumenDelMapa extends Volumen {
  readonly niebla: string | null;
  /**
   * La clave (`"x,y"`) de la casilla de su base si su caja sube por encima del
   * borde de arriba del mapa; `null` si no sube. Por ahí no llega la niebla
   * (#152): lo que asoma desde una casilla sin explorar se recorta en el borde.
   */
  readonly asomaPorArriba: string | null;
}

/** Lo que se saca de un mapa una vez por partida. */
export interface Escenario {
  readonly escena: Escena;
  /** El catálogo con que se compuso: de qué hoja y módulo sale cada `src` (`queHayEn`). */
  readonly catalogo: Catalogo;
  readonly terreno: readonly TerrainKind[];
  readonly separada: EscenaSeparada;
  /** Los volúmenes de cada fila, por la de su base y en su orden: el recorte de cada fotograma. */
  readonly porFila: readonly (readonly VolumenDelMapa[])[];
  /**
   * Las casillas (`y·W + x`) que cubre la figura de algo horneado, con la clave
   * de lo horneado (la mayor, si dos se solapan): ver `claveDeFigura`.
   */
  readonly cubiertas: ReadonlyMap<number, number>;
  /**
   * Las casillas sobre cuya figura cuelga una pieza del relieve desde lo alto
   * (de su fila o de más al norte), con la clave de la más honda: la figura va
   * delante de ella (#185, `delanteDeLasParedes`). Ver `claveDeFigura`.
   */
  readonly delanteDeParedes: ReadonlyMap<number, number>;
  /** Cuántos volúmenes hay en cada casilla, por su base: de ahí sale el tope de alejar. */
  readonly conteo: ConteoDeVolumenes;
  /** La clave del volumen de cada objeto horneado, por su id: ahí va el óvalo de su dueño. */
  readonly claveDeObjeto: ReadonlyMap<string, number>;
  /**
   * El asiento de la marca del dueño (óvalo y bandera) de cada objeto horneado,
   * por su id, en casillas: el punto que hace de centro de su casilla. Lo es,
   * salvo en el nodo de un puente, que cae en el río bajo el tablero: allí sube
   * al tablero (`Puente.asiento`), menos `OVALO_BAJO_EL_ASIENTO`, para que el
   * óvalo quede centrado en él.
   */
  readonly asientoDeObjeto: ReadonlyMap<string, readonly [number, number]>;
  /**
   * El pie del mástil de la bandera de cada nodo, por su id, en casillas: el de
   * siempre sobre el centro de su casilla (`MASTIL_SOBRE_EL_NODO`), o en un
   * puente, plantado en su tablero (`Puente.mastil`).
   */
  readonly mastilDeNodo: ReadonlyMap<string, readonly [number, number]>;
  /**
   * Lo que pisa quien está en la casilla de un puente, por casilla (`y·W + x`):
   * el punto del tablero (`Puente.asiento`) y la clave del volumen del puente,
   * para pintarlo encima de él. Lo lee `pisada`.
   */
  readonly tableros: ReadonlyMap<number, { readonly asiento: Punto; readonly clave: number }>;
  /** Las imágenes que pinta la escena: se piden una vez por partida. */
  readonly imagenes: readonly string[];
  /** De ellas, las que solo pinta el suelo: se sueltan en cuanto está pintado. */
  readonly soloDelSuelo: readonly string[];
  /** Las que pintan los volúmenes: lo único que pide el hilo principal si el suelo lo pinta un Worker. */
  readonly deVolumenes: readonly string[];
}

let memo: { semilla: number; escenario: Escenario } | null = null;

/**
 * Lo que `mapa.ts` baja el óvalo de un nodo bajo su asiento, en casillas: el
 * 0,45 de su radio de 0,4 casilla (`base`).
 */
export const OVALO_BAJO_EL_ASIENTO = 0.45 * 0.4;

/**
 * Lo que sube el pie del mástil de un nodo sobre el centro de su casilla, en
 * casillas: su punta va a 0,85 y mide 0,375 (`bandera` a 0,75 de casilla).
 */
export const MASTIL_SOBRE_EL_NODO = 0.85 - 0.75 * 0.5;

/** El pie del mástil de cada nodo (`Escenario.mastilDeNodo`). */
function mastilesDe(
  map: MapaDeEscena,
  puentes: Escena['puentes'],
): Map<string, readonly [number, number]> {
  const enUnPuente = new Map(puentes.map((p) => [p.id, p.mastil]));
  const mastiles = new Map<string, readonly [number, number]>();
  for (const o of map.objects)
    if (o.kind === 'node')
      mastiles.set(
        o.id,
        enUnPuente.get(o.id) ?? [o.at.x + 0.5, o.at.y + 0.5 - MASTIL_SOBRE_EL_NODO],
      );
  return mastiles;
}

/** Lo que pisa quien está en la casilla de cada puente (`Escenario.tableros`). */
function tablerosDe(
  map: MapaDeEscena,
  puentes: Escena['puentes'],
  claveDeObjeto: ReadonlyMap<string, number>,
): Map<number, { readonly asiento: Punto; readonly clave: number }> {
  return new Map(
    puentes.map((p) => {
      const clave = claveDeObjeto.get(p.id);
      if (clave === undefined) throw new Error(`el puente ${p.id} no tiene volumen en la escena`);
      const [x, y] = p.nodo.map(Math.floor) as [number, number];
      return [y * map.width + x, { asiento: p.asiento, clave }] as const;
    }),
  );
}

/**
 * Dónde pisa una figura de la casilla `at` y su clave de profundidad, en
 * casillas: los pies a `pies` bajo el centro de la casilla y `claveDeFigura`;
 * o, en la de un puente, en su tablero y pintada después de él. En el centro de
 * la casilla, que es agua bajo el arco, se pintaba en el río y le tapaba el
 * frente al puente (H3 del QA de #157). Con `pies` = 0,5, el centro de la
 * casilla: lo que usa el paso de la ruta.
 */
export function pisada(
  esc: Escenario,
  at: { readonly x: number; readonly y: number },
  pies: number,
): { readonly x: number; readonly y: number; readonly clave: number } {
  const clave = claveDeFigura(esc, at.x, at.y + pies);
  const t = esc.tableros.get(at.y * esc.escena.W + at.x);
  if (t === undefined) return { x: at.x + 0.5, y: at.y + pies, clave };
  return { x: t.asiento[0], y: t.asiento[1], clave: Math.max(clave, t.clave) };
}

/** El asiento de cada objeto horneado (`Escenario.asientoDeObjeto`). */
function asientosDe(
  map: MapaDeEscena,
  horneados: ReadonlyMap<string, number>,
  puentes: Escena['puentes'],
): Map<string, readonly [number, number]> {
  const enUnPuente = new Map(puentes.map((p) => [p.id, p.asiento]));
  return new Map(
    map.objects.flatMap((o) => {
      if (!horneados.has(o.id)) return [];
      const a = enUnPuente.get(o.id);
      const asiento: readonly [number, number] =
        a === undefined ? [o.at.x + 0.5, o.at.y + 0.5] : [a[0], a[1] - OVALO_BAJO_EL_ASIENTO];
      return [[o.id, asiento] as const];
    }),
  );
}

/**
 * La escena de un mapa: `componer` y `separar`, una vez por partida. La llave es
 * la identidad del array de terreno y la semilla: el terreno no cambia en toda
 * una partida, y `adaptar.ts` conserva el array en el espectador. Es pura —no
 * carga ni pinta—, así que la cámara la puede pedir sin lienzo.
 */
export function escenarioDe(map: MapaDeEscena, semilla: number): Escenario {
  if (memo !== null && memo.escenario.terreno === map.terrain && memo.semilla === semilla)
    return memo.escenario;
  const escena = componer(map, semilla, CATALOGO);
  const separada = separar(escena, { objeto: horneado });
  const casillas = new Map(map.objects.map((o) => [o.id, o.at]));
  const porFila: VolumenDelMapa[][] = Array.from({ length: escena.H }, () => []);
  const claveDeObjeto = new Map<string, number>();
  const deVolumen = new Set<string>();
  const bases: Sprite[] = [];
  const cubiertas = new Map<number, number>();
  for (const v of separada.volumenes) {
    const { s } = v;
    const fila = Math.min(escena.H - 1, Math.max(0, Math.floor(v.clave)));
    let niebla: string | null = null;
    if (s.objeto !== undefined) {
      const at = casillas.get(s.objeto.id);
      if (at === undefined)
        throw new Error(`la escena pinta ${s.objeto.kind} ${s.objeto.id} y el mapa no lo tiene`);
      niebla = pointKey(at);
      claveDeObjeto.set(s.objeto.id, v.clave);
      cubrir(cubiertas, v, escena.W, escena.H);
    }
    // La misma caja con que se pinta (`pintarSprite`), también la del marcador.
    const asomaPorArriba =
      cajaDeSprite(s)[1] < 0
        ? pointKey({ x: Math.min(escena.W - 1, Math.max(0, Math.floor(s.x))), y: fila })
        : null;
    (porFila[fila] as VolumenDelMapa[]).push({ ...v, niebla, asomaPorArriba });
    bases.push(s);
    if (s.src !== null) deVolumen.add(s.src);
  }
  const imagenes = imagenesDeEscena(escena, horneado);
  const escenario: Escenario = {
    escena,
    catalogo: CATALOGO,
    terreno: map.terrain,
    separada,
    porFila,
    cubiertas,
    delanteDeParedes: delanteDeLasParedes(
      separada.volumenes,
      escena.W,
      escena.H,
      perfilesDelCatalogo(CATALOGO),
    ),
    conteo: contarVolumenes(escena.W, escena.H, bases),
    claveDeObjeto,
    asientoDeObjeto: asientosDe(map, claveDeObjeto, escena.puentes),
    mastilDeNodo: mastilesDe(map, escena.puentes),
    tableros: tablerosDe(map, escena.puentes, claveDeObjeto),
    imagenes,
    soloDelSuelo: imagenes.filter((src) => !deVolumen.has(src)),
    deVolumenes: [...deVolumen],
  };
  memo = { semilla, escenario };
  return escenario;
}

/**
 * Una tarea aparte del fotograma que cuenta como tanda de arte: al acabar, la
 * página repinta. Si falla, `relanzar` lanza el fallo en el siguiente
 * fotograma, que es donde la página lo dice: un fallo en una tarea suelta no lo
 * vería nadie, y la página se quedaría esperando lo que no va a llegar.
 */
interface TareaAparte {
  relanzar(): void;
}

function aparte(trabajo: () => unknown): TareaAparte {
  let fallo: unknown;
  tandaDeArte(
    new Promise<void>((resolve) =>
      setTimeout(() => {
        Promise.resolve()
          .then(trabajo)
          .catch((err: unknown) => {
            fallo = err;
          })
          .finally(resolve);
      }, 0),
    ),
  );
  return {
    relanzar() {
      if (fallo !== undefined) throw fallo;
    },
  };
}

/** El escenario que se está componiendo aparte. */
let preparando: {
  readonly terreno: MapaDeEscena['terrain'];
  readonly semilla: number;
  readonly tarea: TareaAparte;
} | null = null;

/**
 * El escenario de un mapa si ya está compuesto; si no, lo compone en una tarea
 * aparte (`aparte`) y devuelve `null` hasta entonces. `componer` cuesta ~60 ms
 * y, en el mismo fotograma que el primer pintado, hacía una tarea de ~130 ms al
 * abrir la partida.
 */
export function escenarioListo(map: MapaDeEscena, semilla: number): Escenario | null {
  if (memo !== null && memo.escenario.terreno === map.terrain && memo.semilla === semilla)
    return memo.escenario;
  if (preparando !== null && preparando.terreno === map.terrain && preparando.semilla === semilla) {
    preparando.tarea.relanzar();
    return null;
  }
  preparando = { terreno: map.terrain, semilla, tarea: aparte(() => escenarioDe(map, semilla)) };
  return null;
}

/**
 * Apunta en `cubiertas` las casillas cuyo centro cae dentro de la figura del
 * volumen horneado `v`, con su clave.
 */
function cubrir(cubiertas: Map<number, number>, v: Volumen, W: number, H: number): void {
  const { s } = v;
  const [x0, y0, x1] = cajaDeSprite(s);
  for (let y = Math.max(0, Math.ceil(y0 - 0.5)); y < H && y + 0.5 <= s.y; y++)
    for (let x = Math.max(0, Math.ceil(x0 - 0.5)); x < W && x + 0.5 <= x1; x++) {
      const i = y * W + x;
      cubiertas.set(i, Math.max(cubiertas.get(i) ?? v.clave, v.clave));
    }
}

/**
 * La clave de profundidad de una figura con los pies en (`x`, `y`), en casillas
 * y con la convención de `Sprite.y`. Lo horneado —ciudad, nodo, mina, pueblo— es
 * la ficha de su casilla y no un edificio que esconda a nadie: la figura que
 * esté en una casilla que cubre va delante de él, con su misma clave, porque a
 * igual clave se pinta antes el volumen. Un árbol o un pico sí la tapan. Con la
 * clave de la base, la ciudad (2,4 casillas de ancho, casi dos de alto) tapaba
 * entero al héroe que nace en la casilla de encima.
 *
 * Y la pared del relieve que cuelga sobre ella desde lo alto, tampoco
 * (`Escenario.delanteDeParedes`, #185): su pie cae más abajo que los de la
 * figura porque el mapa no levanta lo alto, pero es el frente de una casilla de
 * detrás. Con la clave de su pie, de un grupo al pie de un acantilado de caída
 * 3 solo se veía la chapa (s36 mon-2, (7, 22)).
 */
export function claveDeFigura(esc: Escenario, x: number, y: number): number {
  const i = Math.floor(y) * esc.escena.W + Math.round(x);
  return Math.max(
    y,
    esc.cubiertas.get(i) ?? Number.NEGATIVE_INFINITY,
    esc.delanteDeParedes.get(i) ?? Number.NEGATIVE_INFINITY,
  );
}

/**
 * El tope de alejar de una escena en un lienzo de `ancho × alto` (`tileMinimo`).
 * No depende de a dónde mire la cámara, así que se guarda la última cuenta: el
 * cliente, el espectador y `pnpm capturas` la piden a cada fotograma o gesto.
 * Si ni a `TILE_MAX` caben los volúmenes, lo avisa en la consola una vez por
 * escena y tamaño: es un tope que no se puede cumplir, y callarlo era prometer
 * en el docstring lo que el lienzo no hacía (H4 de la vuelta 1 de QA).
 */
let tope: { escenario: Escenario; ancho: number; alto: number; tile: number } | null = null;

export function topeDeAlejar(esc: Escenario, ancho: number, alto: number): number {
  if (tope === null || tope.escenario !== esc || tope.ancho !== ancho || tope.alto !== alto) {
    const { tile, exceso } = tileMinimo(esc.conteo, ancho, alto);
    if (exceso > 0)
      console.warn(
        `el mapa no cabe en el tope de alejar: en un lienzo de ${ancho}×${alto} px, ni a ${tile} px por casilla bajan de ${MAX_VOLUMENES_VISIBLES} los volúmenes a la vista; se pintan hasta ${MAX_VOLUMENES_VISIBLES + exceso}`,
      );
    tope = { escenario: esc, ancho, alto, tile };
  }
  return tope.tile;
}

// ------------------------------------------------------------ el suelo

/** La superficie del suelo, a `px` píxeles por casilla. */
export interface SueloPintado {
  readonly lienzo: Imagen;
  readonly px: number;
}

/** Lo que avisa un pintor del suelo mientras trabaja. */
export interface AvisosDelSuelo {
  /** Lo que no llegó ni al volver a pedirlo, de las `de` imágenes que pinta: sale con su color plano. */
  faltan(faltan: readonly string[], de: number): void;
  /** Una superficie ya pintada, en el orden en que se pidieron. */
  superficie(s: SueloPintado): void;
}

/**
 * Un encargo de pintar el suelo: `hecho` se cumple tras la última superficie, o
 * falla con el motivo; `terminar` lo para, y entonces se cumple sin más.
 */
export interface EncargoDelSuelo {
  readonly hecho: Promise<void>;
  terminar(): void;
}

/**
 * Quién pinta el suelo de un escenario a las resoluciones que se le piden, una
 * detrás de otra: un Worker con `OffscreenCanvas` (`pintor-del-suelo.ts`) si el
 * navegador lo deja, o este hilo. Se puede cambiar para probar
 * (`usarPintorDelSuelo`).
 */
export type PintorDelSuelo = (
  esc: Escenario,
  resoluciones: readonly number[],
  avisos: AvisosDelSuelo,
) => EncargoDelSuelo;

/**
 * El pintor del Worker: un encargo para todas las resoluciones, que pinta en
 * serie, cada una en un Worker que se termina al contestar. Un solo Worker para
 * las dos cargaría las texturas una vez (~0,1 s), pero no suelta las máscaras de
 * la primera antes de pintar la segunda: el pico de memoria del navegador subía
 * 130-380 MB (2026-10-05). Terminarlo lo suelta todo en el acto. Lo que no llegó
 * lo dice el primero; el segundo pide las mismas imágenes.
 */
const enUnWorker: PintorDelSuelo = (esc, resoluciones, avisos) => {
  let actual: Worker | null = null;
  let terminado = false;
  const base = new URL('/mapa/', location.href).href;
  const una = (px: number, primera: boolean) =>
    new Promise<void>((resolve, reject) => {
      const w = new Worker(new URL('./pintor-del-suelo.ts', import.meta.url), { type: 'module' });
      actual = w;
      const acabar = (fallo?: Error) => {
        w.terminate();
        actual = null;
        if (fallo === undefined) resolve();
        else reject(fallo);
      };
      w.addEventListener('message', (e: MessageEvent<MensajeDelSuelo>) => {
        const m = e.data;
        if ('error' in m) acabar(new Error(m.error));
        else if ('faltan' in m) {
          if (primera && m.faltan.length > 0) avisos.faltan(m.faltan, m.imagenes);
        } else {
          avisos.superficie({ lienzo: m.lienzo, px: m.px });
          acabar();
        }
      });
      w.addEventListener('error', (e) =>
        acabar(new Error(e.message || 'el Worker no ha arrancado')),
      );
      const peticion: PeticionDelSuelo = { escena: esc.escena, px: [px], base };
      w.postMessage(peticion);
    });
  let parar = (): void => undefined;
  const hecho = new Promise<void>((resolve, reject) => {
    parar = resolve;
    (async () => {
      for (const [i, px] of resoluciones.entries()) {
        if (terminado) return;
        await una(px, i === 0);
      }
    })().then(resolve, reject);
  });
  return {
    hecho,
    terminar: () => {
      terminado = true;
      (actual as Worker | null)?.terminate();
      parar();
    },
  };
};

/** La siguiente tarea del bucle: lo que va detrás no cae en el fotograma de ahora. */
const otraTarea = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * El pintor de este hilo, sin Worker —o si el Worker falla, que se dice—: la
 * misma secuencia. Pide el arte del suelo (y lo que no llegue, una vez más), y
 * pinta cada resolución en su propia tarea, para que el esbozo se vea mientras
 * se pinta el bueno. Al acabar suelta lo que solo servía para pintarlo. El bueno
 * es una tarea de ~5,5 s con la página quieta: es el camino de reserva.
 */
const enEsteHilo: PintorDelSuelo = (esc, resoluciones, avisos) => {
  let terminado = false;
  const hecho = (async () => {
    await cargarArteDeEscena(esc.imagenes);
    const sinLlegar = () => esc.imagenes.filter((src) => imagenDeEscena(src) === undefined);
    if (sinLlegar().length > 0) await volverAPedirArteDeEscena(sinLlegar());
    if (terminado) return;
    const faltan = sinLlegar();
    if (faltan.length > 0) avisos.faltan(faltan, esc.imagenes.length);
    for (const px of resoluciones) {
      await otraTarea();
      if (terminado) return;
      avisos.superficie({
        lienzo: pintarSueloA(esc.escena, esc.separada, px, imagenDeEscena),
        px,
      });
    }
    olvidarEntonadas();
    soltarArteDeEscena(esc.soloDelSuelo);
  })();
  return {
    hecho,
    terminar: () => {
      terminado = true;
    },
  };
};

let pintor: PintorDelSuelo | undefined;

function pintorDelSuelo(): PintorDelSuelo {
  pintor ??=
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap !== 'undefined'
      ? enUnWorker
      : enEsteHilo;
  return pintor;
}

/** Cambia quién pinta el suelo de los escenarios que vengan: `null` es este hilo. */
export function usarPintorDelSuelo(p: PintorDelSuelo | null): void {
  pintor = p ?? enEsteHilo;
}

/** Las superficies del suelo de un escenario, de las que se elige una por zoom (`nivelDelSuelo`). */
export interface NivelesDelSuelo {
  esbozo: SueloPintado | null;
  bueno: SueloPintado | null;
  /**
   * Las mitades que se sacan de una superficie (`de`), y las de sus mitades,
   * cuando reducirla sería pasar de ×0,5: el esbozo en una pantalla grande que
   * aleja mucho, o el bueno de una pantalla densa entre el esbozo y su mitad.
   */
  readonly menores: { readonly de: SueloPintado; readonly mitad: SueloPintado }[];
}

interface SueloDelEscenario extends NivelesDelSuelo {
  readonly escenario: Escenario;
  readonly sucedaneo: SueloPintado;
  readonly quien: PintorDelSuelo;
  /** A cuánto se pinta (o se ha pintado) el bueno: lo pide la densidad de la pantalla. */
  pxDelBueno: number;
  encargo: EncargoDelSuelo;
  tarea: TareaAparte;
}

let suelo: SueloDelEscenario | null = null;

/** Cómo va el suelo del último mapa: lo apunta cada página en `#app[data-escenario]`. */
type EstadoDelSuelo = 'sin-mapa' | 'cargando' | 'esbozado' | 'pintado';

function estadoDelSuelo(): EstadoDelSuelo {
  if (suelo === null) return 'sin-mapa';
  if (suelo.bueno !== null) return 'pintado';
  return suelo.esbozo !== null ? 'esbozado' : 'cargando';
}

const quienesMiran = new Set<(estado: EstadoDelSuelo) => void>();

/**
 * Apunta en `el.dataset.escenario` cómo va el suelo, ahora y cada vez que
 * cambie: `cargando` mientras se ve el sucedáneo de pigmentos, `esbozado` con el
 * esbozo de `PX_DEL_ESBOZO` y `pintado` cuando ya está el de `PX_DEL_SUELO`. Es
 * para quien mire la página desde fuera: quien mide o captura el mapa espera a
 * `pintado` antes de un gesto que tiene que ver el suelo.
 */
export function apuntarElSueloEn(el: HTMLElement): void {
  const apuntar = (estado: EstadoDelSuelo) => {
    el.dataset.escenario = estado;
  };
  apuntar(estadoDelSuelo());
  quienesMiran.add(apuntar);
}

function anunciar(): void {
  const estado = estadoDelSuelo();
  for (const fn of quienesMiran) fn(estado);
}

/**
 * El suelo del mapa para una cámara de `pxDeDispositivo` píxeles de dispositivo
 * por casilla (la casilla CSS por la densidad del lienzo), en una pantalla de
 * densidad `dpr`: de lo ya pintado, la superficie que se reduce menos sin
 * ampliarse (`nivelDelSuelo`).
 *
 * La primera vez lo encarga —el esbozo y luego el bueno, a la resolución que
 * pide `dpr` (`resolucionDelSuelo`)— y, mientras tanto, devuelve un lienzo de un
 * píxel por casilla con el pigmento de cada terreno, que cuesta nada. Con
 * Worker, el hilo principal solo pide las imágenes de los volúmenes: pintarlo
 * aquí es una tarea de 5,5 s con la página quieta. Si la densidad sube a media
 * partida (el zoom del navegador, otra pantalla), vuelve a encargar el bueno, y
 * mientras se ve el que había; si baja, se queda con el que hay, que se reduce.
 */
export function sueloDelMapa(esc: Escenario, pxDeDispositivo: number, dpr: number): SueloPintado {
  const { W, H } = esc.escena;
  const r = resolucionDelSuelo(dpr, W, H);
  if (suelo === null || suelo.escenario !== esc) empezarElSuelo(esc, r);
  else if (r.px > suelo.pxDelBueno) subirElBueno(suelo, r);
  const s = suelo as SueloDelEscenario;
  s.tarea.relanzar();
  return nivelDelSuelo(s, pxDeDispositivo) ?? s.sucedaneo;
}

function empezarElSuelo(esc: Escenario, r: ResolucionDelSuelo): void {
  // Lo del mapa anterior ya no se ve: se para su pintor y se suelta lo pintado.
  if (suelo !== null) {
    suelo.encargo.terminar();
    cerrarMenores(suelo);
    for (const n of [suelo.esbozo, suelo.bueno]) cerrar(n);
  }
  const quien = pintorDelSuelo();
  const s: SueloDelEscenario = {
    escenario: esc,
    sucedaneo: sucedaneo(esc),
    esbozo: null,
    bueno: null,
    menores: [],
    quien,
    pxDelBueno: r.px,
    encargo: { hecho: Promise.resolve(), terminar: () => undefined },
    tarea: { relanzar: () => undefined },
  };
  suelo = s;
  avisarSiSeQuedaCorto(r);
  if (quien !== enEsteHilo) void cargarArteDeEscena(esc.deVolumenes);
  encargar(s, quien, [PX_DEL_ESBOZO, r.px]);
  anunciar();
}

/**
 * La pantalla pide un suelo bueno mayor que el encargado: se para lo que se
 * estuviera pintando y se encarga a la nueva resolución, con el esbozo si aún
 * no había llegado. Lo ya pintado se ve hasta que llegue.
 */
function subirElBueno(s: SueloDelEscenario, r: ResolucionDelSuelo): void {
  s.encargo.terminar();
  s.pxDelBueno = r.px;
  avisarSiSeQuedaCorto(r);
  if (s.quien !== enEsteHilo) void cargarArteDeEscena(s.escenario.deVolumenes);
  encargar(s, s.quien, s.esbozo === null ? [PX_DEL_ESBOZO, r.px] : [r.px]);
}

/** Si el tope de memoria deja el suelo bueno por debajo de lo que pide la pantalla, se dice. */
function avisarSiSeQuedaCorto(r: ResolucionDelSuelo): void {
  if (r.pide <= r.px) return;
  console.warn(
    `el suelo del mapa se pinta a ${r.px} px por casilla y esta pantalla pide ${r.pide} en el zoom máximo: no cabe en el tope de memoria del suelo (${Math.round(BYTES_DEL_SUELO_BUENO / 1e6)} MB), y ahí se amplía ×${(r.pide / r.px).toFixed(2)}`,
  );
}

/**
 * Encarga a `quien` las `resoluciones` del suelo de `s`. Si el que falla es el
 * Worker, se dice y se pintan en este hilo las que no llegaron: el juego no se
 * queda con el sucedáneo, ni se vuelve a pintar el esbozo que ya está. Si falla
 * este hilo, el fallo sale en el siguiente fotograma.
 */
function encargar(s: SueloDelEscenario, quien: PintorDelSuelo, resoluciones: readonly number[]) {
  const encargo: EncargoDelSuelo = quien(s.escenario, resoluciones, {
    faltan: avisarDeLoQueFalta,
    // Lo que llegue de un encargo ya sustituido (`subirElBueno`) no se pone.
    superficie: (n) => (s.encargo === encargo ? ponerSuperficie(s, n) : cerrar(n)),
  });
  // El `catch` va ya, y no en la tarea aparte: un rechazo sin manejar hasta
  // entonces sería un error de la página.
  const hecho = encargo.hecho.catch((err: unknown) => {
    if (quien === enEsteHilo) throw err;
    const faltan = resoluciones.filter(
      (px) => (px === PX_DEL_ESBOZO ? s.esbozo : s.bueno?.px === px ? s.bueno : null) === null,
    );
    console.error(
      `el suelo del mapa no se ha podido pintar aparte (${err instanceof Error ? err.message : String(err)}): se pinta en el hilo principal a ${faltan.join(' y ')} px por casilla`,
    );
    if (suelo === s && faltan.length > 0) encargar(s, enEsteHilo, faltan);
  });
  s.encargo = encargo;
  s.tarea = aparte(() => hecho);
}

/** Pone una superficie que acaba de llegar, si sigue siendo la del mapa que se pinta; si no, la cierra. */
function ponerSuperficie(s: SueloDelEscenario, n: SueloPintado): void {
  if (suelo !== s) {
    cerrar(n);
    return;
  }
  if (n.px === PX_DEL_ESBOZO) {
    cerrarMenores(s);
    cerrar(s.esbozo);
    s.esbozo = n;
  } else if (n.px === s.pxDelBueno) {
    cerrarMenores(s);
    cerrar(s.bueno);
    s.bueno = n;
  } else {
    cerrar(n);
    throw new Error(
      `el pintor del suelo ha devuelto una superficie de ${n.px} px por casilla, que nadie ha pedido`,
    );
  }
  anunciar();
  avisarDeArteNuevo();
}

/** Suelta las mitades sacadas de lo pintado: se vuelven a sacar de lo que llegue. */
function cerrarMenores(n: NivelesDelSuelo): void {
  for (const m of n.menores) cerrar(m.mitad);
  n.menores.length = 0;
}

/** Suelta lo que ocupa una superficie que ya no se pinta. */
function cerrar(n: SueloPintado | null): void {
  if (n === null) return;
  if ('close' in n.lienzo) n.lienzo.close();
  else {
    // Un lienzo no se cierra: a 0×0 suelta su memoria.
    n.lienzo.width = 0;
    n.lienzo.height = 0;
  }
}

/**
 * De las superficies pintadas, la que se copia a `px` píxeles por casilla: la
 * más pequeña que no se amplía, que es la más barata de reducir y se reduce a
 * ×0,5-1, donde la bilineal no pierde nada. Si ninguna llega, la mayor.
 * `undefined` si aún no hay ninguna.
 *
 * Si reducirla sería pasar de ×0,5, saca su mitad, y la de esta, las que hagan
 * falta: la bilineal por debajo de ×0,5 se salta píxeles y hace dientes de
 * sierra. Le pasa al esbozo en 7680×4320 al tope (~24 px de dispositivo; en
 * 3840×2160 no, 33-45 en las semillas 1 y 7), y al bueno de una pantalla densa
 * entre el esbozo y su mitad: a dpr 2, de 61 a 110.
 */
export function nivelDelSuelo(n: NivelesDelSuelo, px: number): SueloPintado | undefined {
  const { esbozo, bueno } = n;
  let elegido = esbozo === null || (bueno !== null && px > esbozo.px) ? bueno : esbozo;
  if (elegido === null) return undefined;
  while (px * 2 <= elegido.px && elegido.px >= 2) elegido = mitadDe(n, elegido);
  return elegido;
}

/**
 * La mitad de una superficie, apuntada en `n.menores`. A ×0,5 justo, la
 * bilineal promedia cada 2×2: es una reducción limpia, y barata (2 ms la del
 * esbozo en 7680×4320, sin GPU, 2026-10-05).
 */
function mitadDe(n: NivelesDelSuelo, s: SueloPintado): SueloPintado {
  const hecha = n.menores.find((m) => m.de === s);
  if (hecha !== undefined) return hecha.mitad;
  const ancho = 'naturalWidth' in s.lienzo ? s.lienzo.naturalWidth : s.lienzo.width;
  const alto = 'naturalHeight' in s.lienzo ? s.lienzo.naturalHeight : s.lienzo.height;
  const { lienzo, c } = lienzoCon(
    Math.max(1, Math.round(ancho / 2)),
    Math.max(1, Math.round(alto / 2)),
  );
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'low';
  c.drawImage(s.lienzo, 0, 0, lienzo.width, lienzo.height);
  const mitad = { lienzo, px: s.px / 2 };
  n.menores.push({ de: s, mitad });
  return mitad;
}

function avisarDeLoQueFalta(faltan: readonly string[], de: number): void {
  console.error(
    `el suelo del mapa se pinta sin ${faltan.length} de sus ${de} imágenes, que no han llegado ni al volver a pedirlas (${faltan.slice(0, 5).join(', ')}${faltan.length > 5 ? ', …' : ''}): salen con su color plano`,
  );
}

/** Un píxel por casilla con el pigmento de su terreno: lo que se ve mientras llega el arte. */
function sucedaneo(esc: Escenario): SueloPintado {
  const { W, H } = esc.escena;
  const { lienzo, c } = lienzoCon(W, H);
  const d = c.createImageData(W, H);
  esc.terreno.forEach((t, i) => {
    const [r, g, b] = pigments[t];
    d.data.set([r, g, b, 255], i * 4);
  });
  c.putImageData(d, 0, 0);
  return { lienzo, px: 1 };
}

// ------------------------------------------------------------ los volúmenes

/**
 * La función `reducida` de `OpcionesDePintura` para los volúmenes del mapa: la
 * copia del módulo con su tono, al tamaño en píxeles de dispositivo al que se
 * pinta, de la caché de `copias.ts`. Si en este fotograma ya no caben copias
 * nuevas, la de otro tamaño, o `null` (`copiaReducidaSiCabe`).
 */
export function copiaDeVolumen(s: Sprite, ancho: number, alto: number): Imagen | null | undefined {
  if (s.src === null) return undefined;
  const original = imagenDeEscena(s.src);
  if (original === undefined || original.width === 0) return undefined;
  return copiaReducidaSiCabe(original, s.src, s.tono, ancho, alto);
}
