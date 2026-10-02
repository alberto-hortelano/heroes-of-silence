/**
 * Atlas de clips: la cámara, el reloj y el anclaje pertenecen al arte, no al combate.
 *
 * `charge` es la carga del jinete (petición 6 de `docs/art/peticiones.md`): el
 * paso con la lanza bajada, en bucle. Es el único clip **opcional** —solo lo
 * trae la caballería—, y quien no lo tenga pinta la marcha (`clipDe`).
 */
export type CharacterClip = 'idle' | 'walk' | 'attack' | 'charge';

/** Los tres clips que toda hoja trae; `charge` se añade si la hoja lo tiene. */
export type ClipObligatorio = Exclude<CharacterClip, 'charge'>;

export interface ClipInfo {
  readonly row: number;
  readonly frames: number;
  readonly fps: number;
  readonly loop: boolean;
  readonly anchor: readonly [number, number];
  /** Atlas generado con filas de distinta altura: conservar la figura completa. */
  readonly sourceY?: number;
  readonly sourceHeight?: number;
}

export interface CharacterAtlas {
  /** El lado de la celda: 256 la infantería, 384 el jinete. Nadie supone 256. */
  readonly cell: number;
  readonly columns: number;
  readonly clips: Readonly<Record<ClipObligatorio, ClipInfo>> & { readonly charge?: ClipInfo };
}

/** El clip que se pinta para `clip`: el suyo, o la marcha si la hoja no carga. */
export function clipDe(atlas: CharacterAtlas, clip: CharacterClip): ClipInfo {
  if (clip === 'charge') return atlas.clips.charge ?? atlas.clips.walk;
  return atlas.clips[clip];
}

interface CharacterFrame {
  readonly image: CanvasImageSource;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly height: number;
  readonly anchor: readonly [number, number];
}

export function clipFrame(atlas: CharacterAtlas, clip: CharacterClip, elapsedMs: number): number {
  const info = clipDe(atlas, clip);
  const elapsed = Math.max(0, Math.floor((elapsedMs * info.fps) / 1000));
  return info.loop ? elapsed % info.frames : Math.min(elapsed, info.frames - 1);
}

export function sampleCharacter(
  image: CanvasImageSource,
  atlas: CharacterAtlas,
  clip: CharacterClip,
  elapsedMs: number,
): CharacterFrame {
  const info = clipDe(atlas, clip);
  return {
    image,
    x: clipFrame(atlas, clip, elapsedMs) * atlas.cell,
    y: info.sourceY ?? info.row * atlas.cell,
    size: atlas.cell,
    height: info.sourceHeight ?? atlas.cell,
    anchor: info.anchor,
  };
}

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  frame: CharacterFrame,
  x: number,
  groundY: number,
  size: number,
  facingLeft = false,
): void {
  const scale = size / frame.size;
  ctx.save();
  ctx.translate(x, groundY);
  if (facingLeft) ctx.scale(-1, 1);
  ctx.drawImage(
    frame.image,
    frame.x,
    frame.y,
    frame.size,
    frame.height,
    -frame.anchor[0] * scale,
    -frame.anchor[1] * scale,
    size,
    frame.height * scale,
  );
  ctx.restore();
}
