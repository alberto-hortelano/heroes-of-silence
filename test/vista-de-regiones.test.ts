/**
 * La vista de regiones de `pnpm dev` (`src/client/desarrollo/red.ts`): lo que
 * se deriva del mapa para pintarlo. No es una regla del juego; se prueba que la
 * etiqueta cae dentro de su región y que los bordes son los que separan.
 */
import { describe, expect, it } from 'vitest';
import { bordesDeRegiones, casillasDeEtiqueta, redPintada } from '../src/client/desarrollo/red.js';
import { newGame } from '../src/core/state/setup.js';

/** Una rejilla de texto: un dígito es la región, `.` lo que no es región. */
function rejilla(filas: string[]): { ancho: number; alto: number; regionDe: Int32Array } {
  const alto = filas.length;
  const ancho = (filas[0] as string).length;
  const regionDe = Int32Array.from(filas.join(''), (c) => (c === '.' ? -1 : Number(c)));
  return { ancho, alto, regionDe };
}

describe('vista de regiones', () => {
  it('la etiqueta de una región en C cae dentro de ella, donde más lejos está del borde', () => {
    // El centroide de la C cae en el hueco (columna 3, de `.`).
    const { ancho, alto, regionDe } = rejilla([
      '0000000',
      '0000000',
      '00.....',
      '00.....',
      '00.....',
      '0000000',
      '0000000',
    ]);
    const [p] = casillasDeEtiqueta(ancho, alto, regionDe, 1);
    expect(p).toBeDefined();
    expect(regionDe[(p?.y as number) * ancho + (p?.x as number)]).toBe(0);
  });

  it('una región sin casillas lanza diciéndolo', () => {
    const { ancho, alto, regionDe } = rejilla(['00', '00']);
    expect(() => casillasDeEtiqueta(ancho, alto, regionDe, 2)).toThrow(/región 1 no tiene/);
  });

  it('los bordes separan regiones distintas y el marco, no dos casillas de la misma', () => {
    // 0 0 | 1, todo dentro de un marco: 2×3.
    const { ancho, alto, regionDe } = rejilla(['001', '001']);
    const lados = bordesDeRegiones(ancho, alto, regionDe);
    const n = lados.length / 4;
    // Marco: 3 arriba + 3 abajo + 2 izquierda + 2 derecha = 10; y entre 0 y 1, 2.
    expect(n).toBe(12);
    const verticalesEnX2: number[] = [];
    for (let k = 0; k < lados.length; k += 4)
      if (lados[k] === 2 && lados[k + 2] === 2) verticalesEnX2.push(lados[k + 1] as number);
    expect(verticalesEnX2.sort()).toEqual([0, 1]);
    // Entre dos `.` no hay borde: solo cuenta lo que toca una región.
    expect(bordesDeRegiones(2, 1, Int32Array.from([-1, -1])).length).toBe(0);
  });

  it('en una partida de verdad, cada etiqueta está en su región y cada nodo toca alguna', () => {
    const state = newGame({ seed: 1 });
    const red = redPintada(state.map);
    expect(redPintada(state.map)).toBe(red); // una vez por mapa
    expect(red.regiones.length).toBe(state.map.regions.length);
    for (const reg of red.regiones) {
      const i = Math.floor(reg.etiqueta.y) * red.ancho + Math.floor(reg.etiqueta.x);
      expect(red.regionDe[i]).toBe(reg.indice);
      expect(reg.casillas).toBeGreaterThan(0);
    }
    expect(red.nodos.length).toBeGreaterThan(0);
    for (const n of red.nodos) expect(n.regiones.length).toBeGreaterThan(0);
    expect(red.caminos.length).toBe(state.map.caminos.tramos.length * 4);
  });
});
