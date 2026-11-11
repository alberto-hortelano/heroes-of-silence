/**
 * Qué orden corre `pnpm taller` (#327): sin orden, la ayuda y no el trabajador, que pinta
 * con Codex. Se prueba la elección, pura, y no el proceso: un `trabajador.ts` lanzado desde
 * aquí que volviera a arrancar sin orden vaciaría la cola de verdad del clon.
 */
import { describe, expect, it } from 'vitest';
import { ORDENES_DE_LA_COLA } from '../tools/taller/ordenes/cola.js';
import { elegirOrden, type Orden } from '../tools/taller/ordenes/orden.js';

const nada = (): void => {};
const ORDENES: Readonly<Record<string, Orden>> = {
  trabajar: { uso: 'pnpm taller trabajar', correr: nada },
  estado: { uso: 'pnpm taller estado', correr: nada },
};

describe('la orden de pnpm taller', () => {
  it('sin orden, la ayuda: el trabajador no arranca solo', () => {
    expect(elegirOrden(ORDENES, [])).toEqual({ que: 'ayuda' });
  });

  it('una orden de la tabla se corre con lo que la sigue', () => {
    expect(elegirOrden(ORDENES, ['trabajar', '--npcs'])).toEqual({
      que: 'orden',
      orden: ORDENES.trabajar,
      resto: ['--npcs'],
    });
    expect(elegirOrden(ORDENES, ['estado'])).toEqual({
      que: 'orden',
      orden: ORDENES.estado,
      resto: [],
    });
  });

  it('una orden desconocida se dice con las que hay, y no corre ninguna', () => {
    expect(elegirOrden(ORDENES, ['pintar', 'x'])).toEqual({
      que: 'desconocida',
      motivo:
        'orden desconocida «pintar»: hay trabajar, estado («pnpm taller ayuda» dice cómo se escribe cada una)',
    });
    // Una bandera suelta no es la orden de trabajar: `pnpm taller --npcs` no pinta.
    expect(elegirOrden(ORDENES, ['--npcs']).que).toBe('desconocida');
  });

  it('lo que el objeto hereda no es una orden', () => {
    for (const heredado of ['constructor', 'toString', '__proto__', 'hasOwnProperty'])
      expect(elegirOrden(ORDENES, [heredado]).que).toBe('desconocida');
  });

  it('la ayuda de trabajar pide escribir la orden entera', () => {
    const uso = ORDENES_DE_LA_COLA.trabajar?.uso ?? '';
    expect(uso.startsWith('pnpm taller trabajar')).toBe(true);
    expect(uso).not.toContain('[trabajar]');
  });
});
