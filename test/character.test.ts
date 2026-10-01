/** Los clips de un atlas: el reposo da la vuelta y el golpe se queda en su final. */
import { describe, expect, it } from 'vitest';
import { clipFrame, sampleCharacter } from '../src/client/render/character.js';
import { MANIQUI } from '../src/client/render/personajes.js';

describe('clips de personaje', () => {
  const atlas = MANIQUI.atlas;

  it('el reposo hace bucle', () => {
    const { frames, fps } = atlas.clips.idle;
    const unaVuelta = (frames * 1000) / fps;
    expect(clipFrame(atlas, 'idle', 0)).toBe(0);
    expect(clipFrame(atlas, 'idle', unaVuelta)).toBe(0);
    expect(clipFrame(atlas, 'idle', unaVuelta + 1000 / fps)).toBe(1);
  });

  it('el ataque NO hace bucle: se queda en el último fotograma', () => {
    const { frames } = atlas.clips.attack;
    expect(clipFrame(atlas, 'attack', 60_000)).toBe(frames - 1);
  });

  it('un tiempo negativo no da un fotograma negativo', () => {
    expect(clipFrame(atlas, 'walk', -500)).toBe(0);
  });

  it('el fotograma sale de su fila y su columna', () => {
    const f = sampleCharacter(
      {} as CanvasImageSource,
      atlas,
      'walk',
      (1000 / atlas.clips.walk.fps) * 2,
    );
    expect(f.x).toBe(2 * atlas.cell);
    expect(f.y).toBe(atlas.clips.walk.row * atlas.cell);
  });
});
