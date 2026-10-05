/**
 * Carga de los assets generados.
 *
 * El juego tiene que arrancar y ser jugable AUNQUE no haya arte: mientras no
 * exista un PNG, cada renderizador pinta su marcador de color. Por eso todo
 * aquí devuelve `null` en vez de lanzar, y el manifiesto que falta no es un
 * error sino "todavía no se ha generado nada".
 */
import { urlDeImagenSegura } from '../html.js';

interface AssetManifest {
  readonly generatedAt: string;
  readonly style: string;
  readonly files: readonly { group: string; name: string; path: string }[];
}

const imagenes = new Map<string, HTMLImageElement>();
/**
 * Las cargas en vuelo, por clave. Rescatado de la rama `archivo/gpt-rpg`: sin
 * esto, dos llamantes que piden la misma hoja a la vez —el mapa y la batalla, al
 * arrancar— la descargaban dos veces.
 */
const pendientes = new Map<string, Promise<void>>();
let manifiesto: AssetManifest | null = null;

/**
 * Carga una imagen, con la URL comprobada por la MISMA regla que la puerta.
 *
 * `img.src = url` es el otro sumidero de `src` del repositorio: en una plantilla,
 * `src` es un atributo interpretado que `html.ts` rechaza de plano y obliga a
 * pasar por `srcDeImagen`; por aquí no lo miraba nadie. Hoy no hay fuga —la URL
 * se arma con `base` y una ruta del `manifest.json` local— pero la asimetría es
 * la que abre el agujero mañana, y la regla ya estaba escrita: se llama.
 *
 * Lo que NO hace es lanzar: este módulo promete que sin arte se juega igual, así
 * que una URL que no pasa se salta **diciéndolo** y el juego sigue con su
 * marcador de color. Un `console.warn` y no un silencio.
 */
function cargarImagen(clave: string, url: string): Promise<void> {
  if (imagenes.has(clave)) return Promise.resolve();
  const enVuelo = pendientes.get(clave);
  if (enVuelo !== undefined) return enVuelo;
  const promesa = new Promise<void>((resolve) => {
    let comprobada: string;
    try {
      comprobada = urlDeImagenSegura(url);
    } catch (err) {
      console.warn(`[assets] no se carga ${clave}: ${err instanceof Error ? err.message : err}`);
      resolve();
      return;
    }
    const img = new Image();
    img.onload = () => {
      imagenes.set(clave, img);
      resolve();
    };
    img.onerror = () => {
      // Sin arte se juega igual, pero se dice cuál falta: un PNG que no llega
      // por un nombre mal escrito no debería parecer un «aún no hay arte».
      console.warn(`[assets] no ha cargado ${clave} (${comprobada})`);
      resolve();
    };
    img.src = comprobada;
  }).finally(() => pendientes.delete(clave));
  pendientes.set(clave, promesa);
  return promesa;
}

/**
 * El arte fijo del cliente nuevo, por el nombre con el que se pide a `asset('rpg',
 * …)`: el atlas del mapa (del que sale el cofre) y el fondo de la batalla. Las
 * figuras ya no están aquí: son de 8 direcciones y se cargan a demanda, hoja a
 * hoja, la primera vez que se pinta cada una (`cargarHojaDeFigura`).
 *
 * Va aparte del manifiesto de `generated/` porque no lo produce `tools/gen`: es
 * el arte aprobado que se rescató de la rama `archivo/gpt-rpg`.
 */
export const ARTE_RPG = {
  mapa: '/rpg/map-atlas.png',
  campo: '/rpg/campo.webp',
} as const;

export type NombreDeArte = keyof typeof ARTE_RPG;

/**
 * Las piezas sueltas que el juego pinta él (`assets/mapa/`), por el nombre con el
 * que se piden a `asset('mapa', …)`: los recursos, que cambian en la partida y no
 * se hornean en la escena. Se colocan por su `ancla`, que viene en el `.json` de
 * al lado y lee `render/piezas.ts`. Todo lo demás del mapa lo pone el
 * escenógrafo (`cargarArteDeEscena`).
 */
export const PIEZAS_DEL_MAPA = ['oro', 'piedra', 'madera'] as const;

export type PiezaDelMapa = (typeof PIEZAS_DEL_MAPA)[number];

/** ¿Ha llegado ya alguna imagen de figura? Con una ya hay alguien que respira. */
let hayFigura = false;

/**
 * Carga UNA hoja de figura —una dirección, y en el Y Bot la mitad de ella— y
 * avisa al llegar. Se pide la que se pinta y no la figura entera: cada hoja son
 * ~12 MB decodificados, y un cuerpo con sus 16 eran ~200 MB por cuerpo en el
 * castillo, que solo pinta a cada uno de frente. La clave es la URL, así que los
 * cuerpos que comparten el Y Bot de un juego de armas comparten sus hojas. Nunca
 * lanza por la red: sin la imagen se pinta otra dirección o el marcador.
 */
export function cargarHojaDeFigura(url: string): void {
  void cargarImagen(`figura/${url}`, url).then(() => {
    if (imagenes.has(`figura/${url}`)) hayFigura = true;
    // Repinta y nada más: una hoja de figura no cambia el suelo del mapa, que
    // se pinta de nuevo cuando sube `versionDelArte`.
    for (const fn of oyentes) fn();
  });
}

/** La imagen de figura de esa URL, si ya ha llegado. */
export function imagenDeFigura(url: string): HTMLImageElement | null {
  return imagenes.get(`figura/${url}`) ?? null;
}

/** ¿Hay alguna figura con su arte cargado? */
export function hayFiguraCargada(): boolean {
  return hayFigura;
}

/** Se avisa cuando entra arte nuevo, para repintar. */
type Listener = () => void;
const oyentes = new Set<Listener>();

/**
 * Cuántas tandas de arte que no es de figura se han cerrado: el arte fijo, el
 * manifiesto y las imágenes de la escena del mapa. Lo que se pinta una vez con
 * el arte que hubiera —el suelo del mapa— lo usa de clave. Las hojas de figura
 * no la suben: llegan a demanda, a lo largo de toda la partida, y cada una
 * repintaría el suelo entero para nada.
 */
let version = 0;
/** Las tandas que siguen en camino: mientras haya alguna, el suelo no se pinta. */
let tandasEnVuelo = 0;

/** La versión del arte cargado: cambia cada vez que se cierra una tanda. */
export function versionDelArte(): number {
  return version;
}

/** Si queda alguna tanda en camino: quien pinta una vez con todo lo que haya, espera. */
export function arteCargando(): boolean {
  return tandasEnVuelo > 0;
}

/**
 * Una tanda: cuenta mientras está en camino y, al cerrarse —llegue lo que
 * llegue—, sube la versión y avisa UNA vez. El suelo del mapa que pinta un
 * Worker es una tanda más: cuando llega, la página repinta. No avisa por imagen a propósito: el
 * suelo del mapa se pinta una sola vez con todo lo que haya —cuesta ~1,5 s sin
 * GPU—, y repintarlo con cada una de las ~300 que llegan sería pagarlo
 * trescientas veces.
 */
export function tandaDeArte(carga: Promise<unknown>): void {
  tandasEnVuelo++;
  void carga.finally(() => {
    tandasEnVuelo--;
    version++;
    for (const fn of oyentes) fn();
  });
}

/** El arte fijo y, si se pinta el mapa, sus piezas. Nunca lanza: lo que no llegue se queda en su marcador. */
function loadRpgArt(mapa: boolean): Promise<unknown> {
  return Promise.all([
    ...Object.entries(ARTE_RPG).map(([nombre, url]) => cargarImagen(`rpg/${nombre}`, url)),
    ...(mapa
      ? PIEZAS_DEL_MAPA.map((nombre) => cargarImagen(`mapa/${nombre}`, `/mapa/${nombre}.webp`))
      : []),
  ]);
}

/**
 * Los grupos del manifiesto que se pintan: los iconos de recursos, los edificios
 * y el fondo del castillo. Ni `creatures` —la batalla es de figuras a 25°— ni
 * `terrains`: el suelo del mapa lo pinta el escenógrafo con sus texturas.
 */
const GRUPOS_QUE_SE_PINTAN: ReadonlySet<string> = new Set(['icons', 'buildings', 'towns']);

// ------------------------------------------------------------ la escena del mapa

/** Las imágenes de la escena que ya se han pedido: una tanda nueva solo pide lo que falta. */
const pedidasDeEscena = new Set<string>();

/**
 * Las imágenes de la escena, ya decodificadas. Van como `ImageBitmap` y no como
 * `<img>`: `createImageBitmap` decodifica fuera del hilo principal, y un `<img>`
 * se decodifica la primera vez que se pinta. Los volúmenes del mapa pintan
 * ~250 módulos en el primer fotograma, y decodificarlos ahí era una tarea de
 * ~250 ms al cargar; `img.decode()` no lo evitaba, porque el lienzo no usa lo
 * que decodifica.
 */
const deEscena = new Map<string, ImageBitmap>();

/** Carga una imagen de la escena (`src` relativa a `assets/mapa/`). Nunca lanza: lo que falla se dice. */
async function cargarDeEscena(src: string): Promise<void> {
  let url: string;
  try {
    url = urlDeImagenSegura(`/mapa/${src}`);
  } catch (err) {
    console.warn(`[assets] no se carga escena/${src}: ${err instanceof Error ? err.message : err}`);
    return;
  }
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    deEscena.set(src, await createImageBitmap(await r.blob()));
  } catch (err) {
    console.warn(
      `[assets] no ha cargado escena/${src} (${url}): ${err instanceof Error ? err.message : err}`,
    );
  }
}

/**
 * Pide las imágenes del escenógrafo que falten (`src` relativa a
 * `assets/mapa/`, como las da `imagenesDeEscena`), en una tanda. Dice si ha
 * pedido alguna. Nunca lanza.
 */
export function cargarArteDeEscena(srcs: readonly string[]): boolean {
  const nuevas = srcs.filter((s) => !pedidasDeEscena.has(s));
  if (nuevas.length === 0) return false;
  for (const s of nuevas) pedidasDeEscena.add(s);
  tandaDeArte(Promise.all(nuevas.map(cargarDeEscena)));
  return true;
}

/**
 * Suelta las imágenes de la escena que ya no hacen falta —las que solo pinta el
 * suelo, una vez pintado—: el navegador puede liberar lo que ocupan
 * decodificadas. Quedan como no pedidas, así que se vuelven a pedir si el suelo
 * se tiene que pintar otra vez.
 */
export function soltarArteDeEscena(srcs: readonly string[]): void {
  for (const s of srcs) {
    deEscena.get(s)?.close();
    deEscena.delete(s);
    pedidasDeEscena.delete(s);
  }
}

/**
 * Vuelve a pedir imágenes de la escena que se pidieron y no llegaron: una tanda
 * nueva, como la primera. Lo usa el suelo, que no se pinta sin ellas a la
 * primera falta.
 */
export function volverAPedirArteDeEscena(srcs: readonly string[]): void {
  for (const s of srcs) pedidasDeEscena.delete(s);
  cargarArteDeEscena(srcs);
}

/** La imagen de la escena de esa `src`, si ya ha llegado. */
export function imagenDeEscena(src: string): ImageBitmap | undefined {
  return deEscena.get(src);
}

/** Carga el manifiesto y precarga las imágenes que se pintan. Nunca lanza. */
async function loadAssets(): Promise<boolean> {
  try {
    const res = await fetch('/generated/manifest.json', { cache: 'no-cache' });
    if (!res.ok) return false;
    manifiesto = (await res.json()) as AssetManifest;
  } catch {
    // Sin manifiesto se juega con marcadores; no es un fallo.
    return false;
  }

  await Promise.all(
    manifiesto.files
      .filter((f) => GRUPOS_QUE_SE_PINTAN.has(f.group))
      .map((f) => cargarImagen(`${f.group}/${f.name}`, `/generated/${f.path.replace(/\\/g, '/')}`)),
  );
  return imagenes.size > 0;
}

/**
 * Pone a cargar todo el arte y avisa con `onCambio` cada vez que entra algo. Es
 * lo único que llaman los `main` —el que juega, el espectador y la arena, que
 * pasa `manifiesto: false` y `mapa: false`—: el juego ya
 * es jugable con los marcadores, y el arte entra cuando entra.
 */
export function cargarArte(onCambio: () => void, { manifiesto = true, mapa = true } = {}): void {
  oyentes.add(onCambio);
  // La arena no pinta ni recursos ni edificios ni castillo: sin el manifiesto se
  // ahorra sus decenas de peticiones y se queda con las figuras y el tablero.
  if (manifiesto) {
    tandaDeArte(
      loadAssets().then((hay) => {
        if (hay) console.log(`[assets] ${imagenes.size} imágenes generadas cargadas`);
        else console.log('[assets] sin arte generado todavía; se pinta con marcadores');
      }),
    );
  }
  // La arena no pinta el mapa de aventura: sus piezas serían nueve peticiones
  // para nada.
  tandaDeArte(loadRpgArt(mapa));
}

/** Imagen ya cargada, o `null` si ese asset todavía no existe. */
export function asset(group: string, name: string): HTMLImageElement | null {
  return imagenes.get(`${group}/${name}`) ?? null;
}
