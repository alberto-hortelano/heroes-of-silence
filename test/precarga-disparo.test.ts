/**
 * La hoja del disparo se pide antes del primer tiro: va en su propia hoja (la
 * C) y, si se pidiera al disparar, el primer disparo saldría quieto mientras
 * llega. Se espía la única puerta de carga de figuras.
 */
import { describe, expect, it, vi } from 'vitest';

const cargadas = vi.hoisted(() => [] as string[]);
vi.mock('../src/client/render/assets.js', async (original) => ({
  ...(await original<typeof import('../src/client/render/assets.js')>()),
  cargarHojaDeFigura: (url: string) => cargadas.push(url),
}));

const { precargarDisparo } = await import('../src/client/render/figura.js');
const { arteDe, hojaDe } = await import('../src/client/render/personajes.js');

describe('precargar el disparo', () => {
  it('quien pinta el disparo pide su hoja C de la dirección en la que mira, una vez', () => {
    precargarDisparo('archer', 'E');
    precargarDisparo('archer', 'E');
    const c = hojaDe(arteDe('archer'), 'E').clips.shoot.imagen;
    expect(c).toMatch(/arco-8d\/d\d-c\.png$/);
    expect(cargadas).toEqual([c]);
  });

  it('quien no lo pinta no pide nada: su disparo es su ataque, en la hoja B', () => {
    cargadas.length = 0;
    for (const cuerpo of ['lich', 'peasant']) precargarDisparo(cuerpo, 'E');
    expect(cargadas).toEqual([]);
  });
});
