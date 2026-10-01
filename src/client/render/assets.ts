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

/** Carga la tabla de arriba. Nunca lanza: lo que no llegue se queda en su marcador. */
async function loadRpgArt(): Promise<void> {
  await Promise.all(
    Object.entries(ARTE_RPG).map(([nombre, url]) => cargarImagen(`rpg/${nombre}`, url)),
  );
  avisar();
}

/** Se avisa cuando entra arte nuevo, para repintar. */
type Listener = () => void;
const oyentes = new Set<Listener>();

function avisar(): void {
  for (const fn of oyentes) fn();
}

/**
 * Los grupos del manifiesto que se pintan hoy: los iconos de recursos, los
 * edificios y el fondo del castillo. `creatures` y `terrains` ya no los pinta
 * nadie —la batalla y el mapa son de figuras a 25° y superficie continua— y se
 * seguían descargando: 29 peticiones en cada arranque para nada.
 */
const GRUPOS_QUE_SE_PINTAN: ReadonlySet<string> = new Set(['icons', 'buildings', 'towns']);

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
 * lo único que llaman los dos `main`, el que juega y el espectador: el juego ya
 * es jugable con los marcadores, y el arte entra cuando entra.
 */
export function cargarArte(onCambio: () => void): void {
  oyentes.add(onCambio);
  void loadAssets().then((hay) => {
    if (hay) console.log(`[assets] ${imagenes.size} imágenes generadas cargadas`);
    else console.log('[assets] sin arte generado todavía; se pinta con marcadores');
  });
  void loadRpgArt();
}

/** Imagen ya cargada, o `null` si ese asset todavía no existe. */
export function asset(group: string, name: string): HTMLImageElement | null {
  return imagenes.get(`${group}/${name}`) ?? null;
}
