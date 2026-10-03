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
 * Todo el arte del cliente nuevo, por el nombre con el que se pide a `asset('rpg',
 * …)`: el atlas del mapa, la textura del suelo, el fondo de la batalla y las
 * hojas de personajes a 25°. Una sola tabla: antes las hojas vivían en
 * `personajes.ts` y el resto escrito aquí a mano, y cada `main` tenía que
 * acordarse de pasarle la una a la otra.
 *
 * Va aparte del manifiesto de `generated/` porque no lo produce `tools/gen`: es
 * el arte aprobado que se rescató de la rama `archivo/gpt-rpg`.
 */
export const ARTE_RPG = {
  mapa: '/rpg/map-atlas.png',
  suelo: '/rpg/suelo.webp',
  campo: '/rpg/campo.webp',
  liora: '/characters/liora/atlas.png',
  ybot: '/characters/y-bot-reference/liora-poses-v3.png',
  companeros: '/rpg/scenes/companions-v3.webp',
  guardia: '/rpg/scenes/guards-v3.webp',
  combate: '/rpg/scenes/combat-actions-v1.webp',
} as const;

export type NombreDeArte = keyof typeof ARTE_RPG;

/**
 * Las piezas pintadas del mapa (`assets/mapa/`, aprobadas el 01-10-2026), por el
 * nombre con el que se piden a `asset('mapa', …)`. Se colocan por su `ancla`,
 * que viene en el `.json` de al lado y lee `render/piezas.ts`. Son **temporales**
 * hasta que lleguen las piezas de borde por barrera (`docs/art/peticiones.md`).
 */
export const PIEZAS_DEL_MAPA = [
  'montana-1',
  'montana-2',
  'montana-3',
  'nodo-hito',
  'ciudad',
  'pueblo',
  'oro',
  'piedra',
  'madera',
] as const;

export type PiezaDelMapa = (typeof PIEZAS_DEL_MAPA)[number];

/**
 * Una hoja de `assets/unidades/<id>/`: se pide como `asset('rpg', 'unidad/<id>')`
 * igual que el resto de figuras, pero no se precarga —son medio centenar y la
 * partida no pinta ninguna—: la carga quien la vaya a pintar
 * (`cargarHojaDeUnidad`).
 */
export type HojaDeUnidad = `unidad/${string}`;

/** El nombre de la hoja de una unidad. Lanza si el id no es de una carpeta del taller. */
export function hojaDeUnidad(id: string): HojaDeUnidad {
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw new Error(`"${id}" no es el id de una hoja de assets/unidades/: minúsculas y guiones`);
  }
  return `unidad/${id}`;
}

/**
 * Carga la hoja de una unidad y avisa al llegar. Nunca lanza por la red: sin la
 * imagen se pinta su marcador, como cualquier figura sin arte.
 */
export async function cargarHojaDeUnidad(id: string): Promise<void> {
  await cargarImagen(`rpg/${hojaDeUnidad(id)}`, `/unidades/${id}/atlas.webp`);
  avisar();
}

/**
 * Carga la tabla de arriba y, si se pinta el mapa, sus piezas. Nunca lanza: lo
 * que no llegue se queda en su marcador.
 */
async function loadRpgArt(mapa: boolean): Promise<void> {
  await Promise.all([
    ...Object.entries(ARTE_RPG).map(([nombre, url]) => cargarImagen(`rpg/${nombre}`, url)),
    ...(mapa
      ? PIEZAS_DEL_MAPA.map((nombre) => cargarImagen(`mapa/${nombre}`, `/mapa/${nombre}.webp`))
      : []),
  ]);
  avisar();
}

/** Se avisa cuando entra arte nuevo, para repintar. */
type Listener = () => void;
const oyentes = new Set<Listener>();

/**
 * Cuántas veces ha entrado arte nuevo. Lo que se compone una vez con el arte
 * que hubiera —la superficie del mapa con sus texturas— lo usa de clave de su
 * caché: antes contaba en cada fotograma qué texturas habían llegado.
 */
let version = 0;

/** La versión del arte cargado: cambia cada vez que entra algo. */
export function versionDelArte(): number {
  return version;
}

function avisar(): void {
  version++;
  for (const fn of oyentes) fn();
}

/**
 * Los grupos del manifiesto que se pintan hoy: los iconos de recursos, los
 * edificios, el fondo del castillo y, desde los mapas densos (03-10-2026), las
 * texturas de terreno, que el mapa usa como trama suave sobre el pigmento de
 * cada suelo —temporal, a petición del usuario—. `creatures` ya no lo pinta
 * nadie —la batalla es de figuras a 25°— y se seguía descargando.
 */
const GRUPOS_QUE_SE_PINTAN: ReadonlySet<string> = new Set([
  'icons',
  'buildings',
  'towns',
  'terrains',
]);

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
  avisar();
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
    void loadAssets().then((hay) => {
      if (hay) console.log(`[assets] ${imagenes.size} imágenes generadas cargadas`);
      else console.log('[assets] sin arte generado todavía; se pinta con marcadores');
    });
  }
  // La arena no pinta el mapa de aventura: sus piezas serían nueve peticiones
  // para nada.
  void loadRpgArt(mapa);
}

/** Imagen ya cargada, o `null` si ese asset todavía no existe. */
export function asset(group: string, name: string): HTMLImageElement | null {
  return imagenes.get(`${group}/${name}`) ?? null;
}
