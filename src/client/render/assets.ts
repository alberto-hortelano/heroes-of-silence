/**
 * Carga de los assets generados.
 *
 * El juego tiene que arrancar y ser jugable AUNQUE no haya arte: mientras no
 * exista un PNG, cada renderizador pinta su marcador de color. Por eso todo
 * aquí devuelve `null` en vez de lanzar, y el manifiesto que falta no es un
 * error sino "todavía no se ha generado nada".
 */
export interface AssetManifest {
  readonly generatedAt: string;
  readonly style: string;
  readonly files: readonly { group: string; name: string; path: string }[];
}

/** Índice de las criaturas que tienen atlas de poses generado. */
export interface AnimIndex {
  readonly creatures: readonly string[];
  readonly poses: readonly string[];
}

const imagenes = new Map<string, HTMLImageElement>();
let manifiesto: AssetManifest | null = null;
let animaciones: AnimIndex | null = null;
let cargado = false;

function cargarImagen(clave: string, url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      imagenes.set(clave, img);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = url;
  });
}

/** Se avisa cuando entra arte nuevo, para repintar. */
type Listener = () => void;
const oyentes = new Set<Listener>();

export function onAssetsChanged(fn: Listener): void {
  oyentes.add(fn);
}

function avisar(): void {
  for (const fn of oyentes) fn();
}

/** Carga el manifiesto y precarga las imágenes. Nunca lanza. */
export async function loadAssets(base = '/generated'): Promise<boolean> {
  if (cargado) return manifiesto !== null;
  cargado = true;

  try {
    const res = await fetch(`${base}/manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return false;
    manifiesto = (await res.json()) as AssetManifest;
  } catch {
    // Sin manifiesto se juega con marcadores; no es un fallo.
    return false;
  }

  await Promise.all(
    manifiesto.files.map((f) =>
      cargarImagen(`${f.group}/${f.name}`, `${base}/${f.path.replace(/\\/g, '/')}`),
    ),
  );

  // Las poses son opcionales: sin ellas, cada criatura se queda con su sprite
  // quieto y el juego se ve igual de bien, solo que sin moverse.
  try {
    const res = await fetch(`${base}/anim/index.json`, { cache: 'no-cache' });
    if (res.ok) {
      animaciones = (await res.json()) as AnimIndex;
      await Promise.all(
        animaciones.creatures.flatMap((c) =>
          animaciones!.poses.map((p) => cargarImagen(`anim:${c}/${p}`, `${base}/anim/${c}/${p}.png`)),
        ),
      );
    }
  } catch {
    animaciones = null;
  }

  avisar();
  return imagenes.size > 0;
}

/** Imagen ya cargada, o `null` si ese asset todavía no existe. */
export function asset(group: string, name: string): HTMLImageElement | null {
  return imagenes.get(`${group}/${name}`) ?? null;
}

export function hasArt(): boolean {
  return imagenes.size > 0;
}

/**
 * Fotograma de una criatura en una pose. Si esa criatura no tiene atlas —o la
 * pose concreta falta— devuelve su sprite quieto, que siempre existe.
 */
export function creatureFrame(creature: string, pose: string): HTMLImageElement | null {
  return imagenes.get(`anim:${creature}/${pose}`) ?? imagenes.get(`creatures/${creature}`) ?? null;
}

export function isAnimated(creature: string): boolean {
  return animaciones?.creatures.includes(creature) ?? false;
}

export function assetCount(): number {
  return imagenes.size;
}
