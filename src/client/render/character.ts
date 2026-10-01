/** Atlas de clips: la cámara, el reloj y el anclaje pertenecen al arte, no al combate. */
export type CharacterClip = 'idle' | 'walk' | 'attack';

export interface CharacterAtlas {
  readonly cell: number;
  readonly columns: number;
  readonly clips: Readonly<
    Record<
      CharacterClip,
      {
        readonly row: number;
        readonly frames: number;
        readonly fps: number;
        readonly loop: boolean;
        readonly anchor: readonly [number, number];
        /** Atlas generado con filas de distinta altura: conservar la figura completa. */
        readonly sourceY?: number;
        readonly sourceHeight?: number;
      }
    >
  >;
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
  const info = atlas.clips[clip];
  const elapsed = Math.max(0, Math.floor((elapsedMs * info.fps) / 1000));
  return info.loop ? elapsed % info.frames : Math.min(elapsed, info.frames - 1);
}

export function sampleCharacter(
  image: CanvasImageSource,
  atlas: CharacterAtlas,
  clip: CharacterClip,
  elapsedMs: number,
): CharacterFrame {
  return {
    image,
    x: clipFrame(atlas, clip, elapsedMs) * atlas.cell,
    y: atlas.clips[clip].sourceY ?? atlas.clips[clip].row * atlas.cell,
    size: atlas.cell,
    height: atlas.clips[clip].sourceHeight ?? atlas.cell,
    anchor: atlas.clips[clip].anchor,
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
