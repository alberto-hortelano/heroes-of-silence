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
  arteCargando,
  cargarArteDeEscena,
  imagenDeEscena,
  soltarArteDeEscena,
  tandaDeArte,
  versionDelArte,
  volverAPedirArteDeEscena,
} from '../assets.js';
import {
  type ConteoDeVolumenes,
  contarVolumenes,
  MAX_VOLUMENES_VISIBLES,
  tileMinimo,
} from '../camara-mapa.js';
import { copiaReducidaSiCabe } from '../copias.js';
import { pigments } from '../terreno.js';
import type { MapaDeEscena } from './analizar.js';
import type { Catalogo } from './catalogo.js';
import { componer, type Escena, type Sprite } from './colocar.js';
import { horneado } from './horneado.js';
import {
  type EscenaSeparada,
  type Imagen,
  imagenesDeEscena,
  lienzoCon,
  separar,
  type Volumen,
} from './pintar.js';
import {
  type PeticionDelSuelo,
  pintarSueloConSuMitad,
  type RespuestaDelSuelo,
} from './pintor-del-suelo.js';

/**
 * El catálogo de `assets/mapa/escena.json`, que rehace `pnpm taller
 * catalogo-escena` (un test comprueba que está al día). Va dentro del guion: son
 * 60 KB y `componer` lo necesita antes del primer fotograma.
 */
const CATALOGO: Catalogo = catalogoDelRepo;

/**
 * Píxeles por casilla de la superficie del suelo. Medido en el Chromium sin GPU
 * de `pnpm capturas` (34×34): a 48, 10,7 MB y ~0,9 s; a 72, 24 MB y ~1,5 s; a 96,
 * 42,6 MB y ~2,7 s. Con la cámara entre 40 y 110 px por casilla, a 72 el suelo se
 * amplía como mucho ×1,5.
 */
export const PX_DEL_SUELO = 72;
/** Por debajo de esta casilla en pantalla, el suelo se copia de una mitad ya reducida. */
const TILE_DE_LA_MITAD = 50;

/**
 * Un volumen de la escena tal y como lo recorre cada fotograma: con la clave de
 * niebla (`"x,y"`) de la casilla del objeto horneado que pinta, para no
 * construirla a cada fotograma; `null` si no pinta ninguno.
 */
export interface VolumenDelMapa extends Volumen {
  readonly niebla: string | null;
}

/** Lo que se saca de un mapa una vez por partida. */
export interface Escenario {
  readonly escena: Escena;
  readonly terreno: readonly TerrainKind[];
  readonly separada: EscenaSeparada;
  /** Los volúmenes de cada fila, por la de su base y en su orden: el recorte de cada fotograma. */
  readonly porFila: readonly (readonly VolumenDelMapa[])[];
  /**
   * Las casillas (`y·W + x`) que cubre la figura de algo horneado, con la clave
   * de lo horneado (la mayor, si dos se solapan): ver `claveDeFigura`.
   */
  readonly cubiertas: ReadonlyMap<number, number>;
  /** Cuántos volúmenes hay en cada casilla, por su base: de ahí sale el tope de alejar. */
  readonly conteo: ConteoDeVolumenes;
  /** La clave del volumen de cada objeto horneado, por su id: ahí va el óvalo de su dueño. */
  readonly claveDeObjeto: ReadonlyMap<string, number>;
  /** Las imágenes que pinta la escena: se piden una vez por partida. */
  readonly imagenes: readonly string[];
  /** De ellas, las que solo pinta el suelo: se sueltan en cuanto está pintado. */
  readonly soloDelSuelo: readonly string[];
  /** Las que pintan los volúmenes: lo único que pide el hilo principal si el suelo lo pinta un Worker. */
  readonly deVolumenes: readonly string[];
}

let memo: { semilla: number; escenario: Escenario } | null = null;

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
    (porFila[fila] as VolumenDelMapa[]).push({ ...v, niebla });
    bases.push(s);
    if (s.src !== null) deVolumen.add(s.src);
  }
  const imagenes = imagenesDeEscena(escena, horneado);
  const escenario: Escenario = {
    escena,
    terreno: map.terrain,
    separada,
    porFila,
    cubiertas,
    conteo: contarVolumenes(escena.W, escena.H, bases),
    claveDeObjeto,
    imagenes,
    soloDelSuelo: imagenes.filter((src) => !deVolumen.has(src)),
    deVolumenes: [...deVolumen],
  };
  memo = { semilla, escenario };
  return escenario;
}

/** El escenario que se está componiendo aparte, o el fallo con el que acabó. */
let preparando: {
  readonly terreno: MapaDeEscena['terrain'];
  readonly semilla: number;
  fallo: unknown;
} | null = null;

/**
 * El escenario de un mapa si ya está compuesto; si no, lo compone en una tarea
 * aparte y devuelve `null` hasta entonces, y al acabar la página repinta (cuenta
 * como una tanda de arte). Es lo que llaman las páginas a cada fotograma:
 * `componer` cuesta ~60 ms y, en el mismo fotograma que el primer pintado, hacía
 * una tarea de ~130 ms al abrir la partida. Si `componer` falla, el fallo se
 * relanza en el siguiente fotograma, que es donde la página lo dice.
 */
export function escenarioListo(map: MapaDeEscena, semilla: number): Escenario | null {
  if (memo !== null && memo.escenario.terreno === map.terrain && memo.semilla === semilla)
    return memo.escenario;
  if (preparando !== null && preparando.terreno === map.terrain && preparando.semilla === semilla) {
    if (preparando.fallo !== undefined) throw preparando.fallo;
    return null;
  }
  const este = { terreno: map.terrain, semilla, fallo: undefined as unknown };
  preparando = este;
  tandaDeArte(
    new Promise<void>((resolve) =>
      setTimeout(() => {
        try {
          escenarioDe(map, semilla);
        } catch (err) {
          este.fallo = err;
        }
        resolve();
      }, 0),
    ),
  );
  return null;
}

/**
 * Apunta en `cubiertas` las casillas cuyo centro cae dentro de la figura del
 * volumen horneado `v`, con su clave.
 */
function cubrir(cubiertas: Map<number, number>, v: Volumen, W: number, H: number): void {
  const { s } = v;
  const k = s.alto / s.nh;
  const x0 = s.x - s.ax * k;
  const x1 = s.x + (s.nw - s.ax) * k;
  const y0 = s.y - s.ay * k;
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
 */
export function claveDeFigura(esc: Escenario, x: number, y: number): number {
  const horneado = esc.cubiertas.get(Math.floor(y) * esc.escena.W + Math.round(x));
  return horneado === undefined ? y : Math.max(y, horneado);
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
interface SueloPintado {
  readonly lienzo: Imagen;
  readonly px: number;
}

/** El suelo de un escenario aún sin pintar: el sucedáneo de pigmentos. */
const SIN_PINTAR = -1;

/**
 * Quién pinta el suelo de verdad: un Worker con `OffscreenCanvas`
 * (`pintor-del-suelo.ts`), si el navegador lo deja, o nadie, y entonces se pinta
 * aquí. Se puede cambiar para probar (`usarPintorDelSuelo`).
 */
type PintorDelSuelo = (p: PeticionDelSuelo) => Promise<RespuestaDelSuelo>;

function enUnWorker(p: PeticionDelSuelo): Promise<RespuestaDelSuelo> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./pintor-del-suelo.ts', import.meta.url), { type: 'module' });
    w.addEventListener('message', (e: MessageEvent<RespuestaDelSuelo>) => {
      w.terminate();
      resolve(e.data);
    });
    w.addEventListener('error', (e) => {
      w.terminate();
      reject(new Error(e.message || 'el Worker no ha arrancado'));
    });
    w.postMessage(p);
  });
}

let pintor: PintorDelSuelo | null | undefined;

function pintorDelSuelo(): PintorDelSuelo | null {
  pintor ??=
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap !== 'undefined'
      ? enUnWorker
      : null;
  return pintor;
}

/** Cambia quién pinta el suelo de los escenarios que vengan: `null` es pintarlo aquí. */
export function usarPintorDelSuelo(p: PintorDelSuelo | null): void {
  pintor = p;
}

let suelo: {
  readonly escenario: Escenario;
  /**
   * Si lo está pintando el Worker. Mientras, se ve el sucedáneo; si falla, se
   * pinta aquí como sin Worker.
   */
  aparte: boolean;
  /** La `versionDelArte` con la que se pintó, o `SIN_PINTAR`. */
  version: number;
  /** Si ya se volvió a pedir lo que no llegó: se reintenta una vez por escenario. */
  reintentado: boolean;
  entero: SueloPintado;
  mitad: SueloPintado | null;
} | null = null;

/** Cómo va el suelo del último mapa: lo apunta cada página en `#app[data-escenario]`. */
type EstadoDelSuelo = 'sin-mapa' | 'cargando' | 'pintado';

function estadoDelSuelo(): EstadoDelSuelo {
  if (suelo === null) return 'sin-mapa';
  return suelo.version === SIN_PINTAR ? 'cargando' : 'pintado';
}

const quienesMiran = new Set<(estado: EstadoDelSuelo) => void>();

/**
 * Apunta en `el.dataset.escenario` cómo va el suelo, ahora y cada vez que
 * cambie: `cargando` mientras se ve el sucedáneo de pigmentos, `pintado` cuando
 * ya es el del escenógrafo. Es para quien mire la página desde fuera: `pnpm
 * capturas` espera a `pintado` antes de un gesto que tiene que ver el suelo.
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
 * El suelo del mapa para una cámara de `tile` px por casilla.
 *
 * La primera vez lo encarga y, mientras tanto, devuelve un lienzo de un píxel
 * por casilla con el pigmento de cada terreno, que cuesta nada.
 *
 * Con Worker, lo pinta el Worker UNA vez a `PX_DEL_SUELO`, con su mitad, y el
 * hilo principal solo pide las imágenes de los volúmenes: pintarlo aquí era una
 * tarea de ~2 s en la que la página no respondía. Sin Worker —o si el Worker
 * falla, que se dice—, se pinta aquí: cuando ha entrado arte nuevo y no queda
 * ninguna tanda en camino, una vez, y se suelta lo que solo servía para eso.
 */
export function sueloDelMapa(esc: Escenario, tile: number): SueloPintado {
  if (suelo === null || suelo.escenario !== esc) {
    const quien = pintorDelSuelo();
    suelo = {
      escenario: esc,
      aparte: quien !== null,
      version: SIN_PINTAR,
      reintentado: false,
      entero: sucedaneo(esc),
      mitad: null,
    };
    if (quien === null) cargarArteDeEscena(esc.imagenes);
    else {
      cargarArteDeEscena(esc.deVolumenes);
      encargarElSuelo(esc, quien);
    }
    anunciar();
  }
  if (
    !suelo.aparte &&
    suelo.version !== versionDelArte() &&
    !arteCargando() &&
    !cargarArteDeEscena(esc.imagenes) &&
    !faltaArte(esc)
  ) {
    const { entero, mitad } = pintarSueloConSuMitad(
      esc.escena,
      esc.separada,
      PX_DEL_SUELO,
      imagenDeEscena,
    );
    suelo.entero = { lienzo: entero, px: PX_DEL_SUELO };
    suelo.mitad = { lienzo: mitad, px: PX_DEL_SUELO / 2 };
    suelo.version = versionDelArte();
    soltarArteDeEscena(esc.soloDelSuelo);
    anunciar();
  }
  if (suelo.mitad === null || tile >= TILE_DE_LA_MITAD) return suelo.entero;
  return suelo.mitad;
}

/**
 * Encarga el suelo de `esc` a `quien` y lo pone cuando llega, si sigue siendo el
 * del mapa que se pinta. Lo que no llegó ni al volver a pedirlo sale con su
 * color plano, y se dice como error, igual que sin Worker. Si el Worker falla, se
 * dice también, y el suelo se pinta aquí: el juego no se queda con el sucedáneo.
 * Cuenta como una tanda de arte: al acabar, la página repinta.
 */
function encargarElSuelo(esc: Escenario, quien: PintorDelSuelo): void {
  const peticion: PeticionDelSuelo = {
    escena: esc.escena,
    px: PX_DEL_SUELO,
    base: new URL('/mapa/', location.href).href,
  };
  tandaDeArte(
    quien(peticion)
      .then((r) => {
        if ('error' in r) throw new Error(r.error);
        if (suelo === null || suelo.escenario !== esc) {
          r.entero.close();
          r.mitad.close();
          return;
        }
        if (r.faltan.length > 0) avisarDeLoQueFalta(r.faltan, r.imagenes);
        suelo.entero = { lienzo: r.entero, px: PX_DEL_SUELO };
        suelo.mitad = { lienzo: r.mitad, px: PX_DEL_SUELO / 2 };
        suelo.version = versionDelArte();
        anunciar();
      })
      .catch((err: unknown) => {
        console.error(
          `el suelo del mapa no se ha podido pintar aparte (${err instanceof Error ? err.message : String(err)}): se pinta en el hilo principal`,
        );
        if (suelo === null || suelo.escenario !== esc) return;
        suelo.aparte = false;
        cargarArteDeEscena(esc.imagenes);
      }),
  );
}

function avisarDeLoQueFalta(faltan: readonly string[], de: number): void {
  console.error(
    `el suelo del mapa se pinta sin ${faltan.length} de sus ${de} imágenes, que no han llegado ni al volver a pedirlas (${faltan.slice(0, 5).join(', ')}${faltan.length > 5 ? ', …' : ''}): salen con su color plano`,
  );
}

/**
 * Si el suelo tiene que esperar porque una imagen de la escena se pidió y no
 * llegó. La primera vez la vuelve a pedir y espera a esa tanda; si tampoco llega,
 * lo dice como error y deja pintar: lo que falta sale con su marcador de color.
 * Sin esto, una tanda que se cerraba con fallos daba el suelo por pintado con las
 * texturas en su color plano, y no se volvía a intentar nunca.
 */
function faltaArte(esc: Escenario): boolean {
  if (suelo === null) throw new Error('faltaArte sin suelo: lo llama sueloDelMapa');
  const faltan = esc.imagenes.filter((src) => imagenDeEscena(src) === undefined);
  if (faltan.length === 0) return false;
  if (!suelo.reintentado) {
    suelo.reintentado = true;
    volverAPedirArteDeEscena(faltan);
    return true;
  }
  avisarDeLoQueFalta(faltan, esc.imagenes.length);
  return false;
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
