/**
 * El evaluador de las hojas de 8 direcciones: la silueta del maniquí menos lo
 * que cubre la figura pintada. Con máscaras sintéticas: igual puntúa ~0, sin un
 * brazo «faltan» sube, y desplazada «sobran» sube.
 */
import { describe, expect, it } from 'vitest';
import { dilatar, HOLGURA_SOBRAN, type Mascara, puntuar } from '../tools/taller/evaluar.js';

const L = 64;

function rect(m: Mascara, x0: number, y0: number, x1: number, y1: number): Mascara {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * L + x] = 1;
  return m;
}

/** Un «cuerpo» de 10×30 con un «brazo» de 14×3 a la derecha. */
function figura(conBrazo = true, dx = 0): Mascara {
  const m = rect(new Uint8Array(L * L), 20 + dx, 20, 29 + dx, 49);
  return conBrazo ? rect(m, 30 + dx, 28, 43 + dx, 30) : m;
}

describe('el evaluador', () => {
  it('dilatar crece la máscara en su radio', () => {
    const m = rect(new Uint8Array(L * L), 30, 30, 30, 30);
    const d = dilatar(m, L, 2);
    expect(d.reduce((a, b) => a + b, 0)).toBe(25);
  });

  it('la figura igual que el maniquí no falta ni sobra', () => {
    expect(puntuar(figura(), figura(), L)).toEqual({ faltan: 0, sobran: 0 });
  });

  it('sin el brazo, «faltan» sube', () => {
    expect(puntuar(figura(), figura(false), L).faltan).toBeGreaterThan(0.08);
  });

  it('desplazada lejos, «sobran» sube', () => {
    const lejos = figura(false, HOLGURA_SOBRAN + 12);
    expect(puntuar(figura(), lejos, L).sobran).toBeGreaterThan(0.25);
  });
});
