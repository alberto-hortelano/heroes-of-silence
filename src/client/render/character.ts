/**
 * Atlas de clips: la cámara, el reloj y el anclaje pertenecen al arte, no al combate.
 *
 * Toda figura trae las seis acciones de `CLIPS_DE_FIGURA` (`shared/arte.ts`): el
 * respaldo de quien no tiene arte propio es el Y Bot, que las tiene todas
 * (decisión del usuario, 03-10-2026). La séptima, el disparo (`shoot`), solo la
 * pinta quien dispara; a quien no, `figuraDe` (`personajes.ts`) le pone el
 * ataque como disparo al cargar su arte, así que todo atlas tiene las siete y
 * nadie que lee un clip pregunta si está. `ArteDeFigura.dispara` dice si el
 * disparo es suyo.
 */
import type { ClipDeFigura, HOJAS_DE_FIGURA } from '../../shared/arte.js';

/** Las siete acciones que se pintan: las seis de toda figura y el disparo. */
export type CharacterClip = ClipDeFigura;

export interface ClipInfo {
  /**
   * La URL de la imagen donde está la fila: una unidad lleva sus filas en un
   * `atlas.webp`, y el Y Bot las reparte en sus hojas (`dN-a`, `dN-b`, `dN-c`).
   */
  readonly imagen: string;
  /** La fila dentro de SU imagen. */
  readonly row: number;
  readonly frames: number;
  readonly fps: number;
  readonly loop: boolean;
  readonly anchor: readonly [number, number];
  /**
   * Solo en el disparo (`shoot`) de quien lo pinta: la primera columna con la
   * cuerda ya suelta (la escribe `pnpm taller derivar-poses`), donde sale el
   * proyectil. Sin ella —el disparo de quien no lo pinta es su ataque—, el
   * proyectil sale al empezar.
   */
  readonly suelta?: number;
}

/** Lo que dura una vuelta del clip a su reloj, en ms: sus `frames` a sus `fps`. */
export function msDelClip(info: ClipInfo): number {
  return (info.frames * 1000) / info.fps;
}

export interface CharacterAtlas {
  /** El lado de la celda: 384 en las hojas de 8 direcciones. Nadie supone un número. */
  readonly cell: number;
  readonly columns: number;
  readonly clips: Readonly<Record<CharacterClip, ClipInfo>>;
  /** El fotograma de la muerte que se queda en el suelo hasta que acaba la batalla. */
  readonly cadaver: { readonly clip: 'death'; readonly frame: number };
}

/**
 * Las acciones de la gente del banco de NPC (`ArteDeGente`, `personajes.ts`): las de
 * la hoja A, quieto, andando y la carrera. Es la excepción a «toda figura tiene las
 * seis» (decisión del usuario, 22-10-2026): no pelea, así que no tiene ataque, ni
 * daño, ni cadáver.
 */
export type ClipDeGente = (typeof HOJAS_DE_FIGURA.a)[number];

/** Un atlas de una dirección de la gente: solo sus acciones (`ClipDeGente`). */
export interface AtlasDeGente {
  readonly cell: number;
  readonly columns: number;
  readonly clips: Readonly<Record<ClipDeGente, ClipInfo>>;
}

/** Lo que se pinta de pie: el atlas de toda figura o el de la gente (`colocarFigura`). */
export type AtlasQueSePinta = CharacterAtlas | AtlasDeGente;

/**
 * El clip `clip` de un atlas que se pinta, o lanza: la gente no tiene más que los
 * suyos, y quien la pinta ya lo ha preguntado (`arteParaPintar`).
 */
export function infoDelClip(atlas: AtlasQueSePinta, clip: CharacterClip): ClipInfo {
  const info = (atlas.clips as Readonly<Partial<Record<CharacterClip, ClipInfo>>>)[clip];
  if (info === undefined) throw new Error(`el atlas no tiene el clip "${clip}"`);
  return info;
}

export interface CharacterFrame {
  readonly image: CanvasImageSource;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly anchor: readonly [number, number];
}

export function clipFrame(atlas: AtlasQueSePinta, clip: CharacterClip, elapsedMs: number): number {
  const info = infoDelClip(atlas, clip);
  const elapsed = Math.max(0, Math.floor((elapsedMs * info.fps) / 1000));
  return info.loop ? elapsed % info.frames : Math.min(elapsed, info.frames - 1);
}

/** La celda de un fotograma concreto de un clip, ya resuelta su imagen. */
export function celdaDe(
  image: CanvasImageSource,
  atlas: AtlasQueSePinta,
  clip: CharacterClip,
  frame: number,
): CharacterFrame {
  const info = infoDelClip(atlas, clip);
  return {
    image,
    x: frame * atlas.cell,
    y: info.row * atlas.cell,
    size: atlas.cell,
    anchor: info.anchor,
  };
}

/**
 * El cadáver tras `msDesdeLaCaida`: la muerte sigue su reloj hasta llegar al
 * fotograma `cadaver` y se queda en él. Así la caída que empezó en la cola del
 * animador no salta al cadáver cuando acaba su paso, que dura menos que el clip.
 */
export function fotogramaDeCaida(atlas: CharacterAtlas, msDesdeLaCaida: number): number {
  return Math.min(clipFrame(atlas, 'death', msDesdeLaCaida), atlas.cadaver.frame);
}

/**
 * ¿Sigue el clip `msDesdeQueEmpezo` después de empezar? Lo dice su reloj en el
 * atlas —`frames` a `fps`—, no una duración escrita en el animador: el daño que
 * sigue tras el paso del golpe acaba cuando acaba su clip, sea el que sea.
 */
export function clipEnCurso(
  atlas: CharacterAtlas,
  clip: CharacterClip,
  msDesdeQueEmpezo: number,
): boolean {
  return msDesdeQueEmpezo < msDelClip(atlas.clips[clip]);
}
