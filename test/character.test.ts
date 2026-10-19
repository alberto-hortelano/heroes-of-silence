/** Los clips de un atlas: el reposo da la vuelta, el golpe se queda en su final y la muerte en el cadáver. */
import { describe, expect, it } from 'vitest';
import {
  celdaDe,
  clipEnCurso,
  clipFrame,
  fotogramaDeCaida,
} from '../src/client/render/character.js';
import { arteDe, hojaDe } from '../src/client/render/personajes.js';

describe('clips de personaje', () => {
  const atlas = hojaDe(arteDe('goblin-lancero'), 'SE');

  it('la marcha hace bucle', () => {
    const { frames, fps } = atlas.clips.walk;
    const unaVuelta = (frames * 1000) / fps;
    expect(clipFrame(atlas, 'walk', 0)).toBe(0);
    expect(clipFrame(atlas, 'walk', unaVuelta)).toBe(0);
    expect(clipFrame(atlas, 'walk', unaVuelta + 1000 / fps)).toBe(1);
  });

  it('el ataque NO hace bucle: se queda en el último fotograma', () => {
    const { frames } = atlas.clips.attack;
    expect(clipFrame(atlas, 'attack', 60_000)).toBe(frames - 1);
  });

  it('la muerte avanza a su reloj y se queda en el cadáver', () => {
    expect(fotogramaDeCaida(atlas, 0)).toBe(0);
    expect(fotogramaDeCaida(atlas, 1000 / atlas.clips.death.fps)).toBe(1);
    expect(fotogramaDeCaida(atlas, Number.POSITIVE_INFINITY)).toBe(atlas.cadaver.frame);
  });

  it('el daño acaba cuando acaba su clip en el atlas, no en una duración escrita aparte', () => {
    const { frames, fps } = atlas.clips.hurt;
    const dura = (frames * 1000) / fps;
    expect(clipEnCurso(atlas, 'hurt', 0)).toBe(true);
    expect(clipEnCurso(atlas, 'hurt', dura - 1)).toBe(true);
    expect(clipEnCurso(atlas, 'hurt', dura)).toBe(false);
  });

  it('un tiempo negativo no da un fotograma negativo', () => {
    expect(clipFrame(atlas, 'walk', -500)).toBe(0);
  });

  it('el fotograma sale de su fila y su columna, en SU imagen', () => {
    const f = celdaDe({} as CanvasImageSource, atlas, 'hurt', 2);
    expect(f.x).toBe(2 * atlas.cell);
    // El daño es la fila 4 de las seis, la segunda de `dN-b.png`.
    expect(f.y).toBe(1 * atlas.cell);
  });
});
