/**
 * El compás de cada figura (`compas.ts`) y la prisa de la marcha (`marcha.ts`):
 * que un tablero no respire al unísono, sin `Math.random`, y que una casilla
 * dure lo que pidió el usuario al verlo andar.
 */
import { describe, expect, it } from 'vitest';
import { compasDe, RUIDO_DE_VELOCIDAD, relojDeFigura } from '../src/client/compas.js';
import { msPorCasilla, PRISA_DE_LA_MARCHA } from '../src/client/marcha.js';
import type { ClipInfo } from '../src/client/render/character.js';
import { clipFrame } from '../src/client/render/character.js';
import { arteDe, hojaDe, MIRADA_DE_PRESENTACION } from '../src/client/render/personajes.js';
import { ALTO_DE_FIGURA } from '../src/client/render/proyeccion.js';

/** Ids como los que se pintan de verdad: stacks, objetos del mapa, héroes, miniaturas. */
const IDS = [
  ...Array.from({ length: 40 }, (_, i) => `s${i}`),
  ...Array.from({ length: 30 }, (_, i) => `monster-${i}`),
  'hero-0',
  'hero-1',
  'recluta-peasant',
  'recluta-archer',
  'miniatura-0-peasant',
  'miniatura-1-peasant',
];

const BUCLE: ClipInfo = {
  imagen: 'x.png',
  row: 0,
  frames: 7,
  fps: 8,
  loop: true,
  anchor: [0, 0],
};

describe('el compás de cada figura', () => {
  it('es determinista: el mismo id da el mismo compás, llamada tras llamada', () => {
    for (const id of IDS) expect(compasDe(id)).toEqual(compasDe(id));
  });

  it('está acotado: desfase en [0, 1) y velocidad dentro de ±RUIDO', () => {
    for (const id of IDS) {
      const { desfase, velocidad } = compasDe(id);
      expect(desfase).toBeGreaterThanOrEqual(0);
      expect(desfase).toBeLessThan(1);
      expect(velocidad).toBeGreaterThanOrEqual(1 - RUIDO_DE_VELOCIDAD);
      expect(velocidad).toBeLessThanOrEqual(1 + RUIDO_DE_VELOCIDAD);
    }
  });

  it('es distinto entre ids, también entre los que solo cambian en un carácter', () => {
    const desfases = new Set(IDS.map((id) => compasDe(id).desfase));
    const velocidades = new Set(IDS.map((id) => compasDe(id).velocidad));
    expect(desfases.size).toBe(IDS.length);
    expect(velocidades.size).toBe(IDS.length);
    // `s1` y `s2` no pueden quedar casi en fase: es justo la coreografía.
    expect(Math.abs(compasDe('s1').desfase - compasDe('s2').desfase)).toBeGreaterThan(0.01);
  });

  it('se reparte: no se amontona en un extremo del ciclo ni de la velocidad', () => {
    const muchos = Array.from({ length: 400 }, (_, i) => compasDe(`s${i}`));
    const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(media(muchos.map((c) => c.desfase))).toBeGreaterThan(0.4);
    expect(media(muchos.map((c) => c.desfase))).toBeLessThan(0.6);
    expect(media(muchos.map((c) => c.velocidad))).toBeGreaterThan(0.99);
    expect(media(muchos.map((c) => c.velocidad))).toBeLessThan(1.01);
    // Y se usa el margen: hay figuras rápidas y lentas de verdad.
    expect(Math.min(...muchos.map((c) => c.velocidad))).toBeLessThan(1 - RUIDO_DE_VELOCIDAD / 2);
    expect(Math.max(...muchos.map((c) => c.velocidad))).toBeGreaterThan(1 + RUIDO_DE_VELOCIDAD / 2);
  });

  it('un id vacío lanza: le tocaría el compás de todas', () => {
    expect(() => compasDe('')).toThrow(/sin id/);
  });

  it('dos figuras en reposo con el mismo reloj no pintan el mismo fotograma a la vez', () => {
    // A lo largo de diez segundos, cuántas veces coinciden s1 y s2 en el
    // fotograma del reposo. Sin compás coincidirían siempre.
    let iguales = 0;
    let total = 0;
    for (let t = 0; t < 10_000; t += 50) {
      const a = clipFrameDe('s1', t);
      const b = clipFrameDe('s2', t);
      if (a === b) iguales++;
      total++;
    }
    expect(iguales / total).toBeLessThan(0.5);
  });

  it('un clip de un solo uso no se desplaza: su reloj es el del hecho', () => {
    const golpe: ClipInfo = { ...BUCLE, loop: false };
    for (const id of IDS) expect(relojDeFigura(golpe, 123, id)).toBe(123);
  });

  it('en bucle, el reloj es el tiempo a su velocidad más su desfase de ciclo', () => {
    const { desfase, velocidad } = compasDe('s7');
    const ciclo = (BUCLE.frames * 1000) / BUCLE.fps;
    expect(relojDeFigura(BUCLE, 1000, 's7')).toBeCloseTo(1000 * velocidad + desfase * ciclo);
  });
});

function clipFrameDe(id: string, t: number): number {
  const atlas = hojaDe(arteDe('goblin-lancero'), MIRADA_DE_PRESENTACION);
  return clipFrame(atlas, 'idle', relojDeFigura(atlas.clips.idle, t, id));
}

describe('la prisa de la marcha', () => {
  it('una casilla de un adulto andando son ~0,9 s, y cargando ~0,55 s', () => {
    // La cifra que pidió el usuario al verlo: «un poco más rápido» que los ~1,3 s.
    const andando = msPorCasilla('goblin-lancero', 'walk', ALTO_DE_FIGURA);
    const cargando = msPorCasilla('goblin-lancero', 'charge', ALTO_DE_FIGURA);
    expect(andando).toBeGreaterThan(850);
    expect(andando).toBeLessThan(950);
    expect(cargando).toBeGreaterThan(500);
    expect(cargando).toBeLessThan(600);
    // Y sale de UNA cifra: quitándola vuelve la que no patina.
    expect(andando * PRISA_DE_LA_MARCHA).toBeGreaterThan(1250);
    expect(andando * PRISA_DE_LA_MARCHA).toBeLessThan(1380);
  });
});
