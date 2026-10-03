/**
 * Atlas de clips: la cámara, el reloj y el anclaje pertenecen al arte, no al combate.
 *
 * Toda figura trae las seis acciones de `CLIPS_DE_FIGURA` (`shared/arte.ts`). No
 * hay clip opcional ni caída a la marcha: el respaldo de quien no tiene arte
 * propio es el Y Bot, que las tiene todas (decisión del usuario, 03-10-2026).
 */
import type { CLIPS_DE_FIGURA } from '../../shared/arte.js';

export type CharacterClip = (typeof CLIPS_DE_FIGURA)[number];

export interface ClipInfo {
  /**
   * La URL de la imagen donde está la fila: una unidad lleva sus seis filas en
   * un `atlas.webp`, y el Y Bot las reparte en dos PNG de tres (`dN-a`, `dN-b`).
   */
  readonly imagen: string;
  /** La fila dentro de SU imagen. */
  readonly row: number;
  readonly frames: number;
  readonly fps: number;
  readonly loop: boolean;
  readonly anchor: readonly [number, number];
  /**
   * Solo en el ataque de quien dispara: la primera columna con la cuerda ya
   * suelta (la escribe `pnpm taller derivar-poses`). Sin ella, el proyectil sale
   * al empezar el disparo.
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

export interface CharacterFrame {
  readonly image: CanvasImageSource;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly anchor: readonly [number, number];
}

export function clipFrame(atlas: CharacterAtlas, clip: CharacterClip, elapsedMs: number): number {
  const info = atlas.clips[clip];
  const elapsed = Math.max(0, Math.floor((elapsedMs * info.fps) / 1000));
  return info.loop ? elapsed % info.frames : Math.min(elapsed, info.frames - 1);
}

/** La celda de un fotograma concreto de un clip, ya resuelta su imagen. */
export function celdaDe(
  image: CanvasImageSource,
  atlas: CharacterAtlas,
  clip: CharacterClip,
  frame: number,
): CharacterFrame {
  const info = atlas.clips[clip];
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
