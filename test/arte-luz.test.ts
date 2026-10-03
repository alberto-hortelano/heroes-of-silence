/**
 * La luz del render 3D y la sombra del juego son la misma luz: proyectar el sol
 * de `luzEnElMundo` con la cámara del contrato tiene que dar la sombra de
 * `ARTE.luz`, en dirección y en largo.
 */
import { describe, expect, it } from 'vitest';
import { ARTE, luzEnElMundo, proyeccionDeSombra, sombraDeFigura } from '../src/shared/arte.js';

const rad = (ARTE.camara.elevacionGrados * Math.PI) / 180;

describe('la luz del contrato', () => {
  const d = luzEnElMundo();

  it('es unitaria, baja, viene de la izquierda y del lado de la cámara', () => {
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 12);
    expect(d.y).toBeLessThan(0);
    expect(d.x).toBeGreaterThan(0);
    // Viaja hacia el fondo (−z): sale del lado de la cámara.
    expect(d.z).toBeLessThan(0);
  });

  it('proyectada con la cámara a 25° da la sombra de ARTE.luz', () => {
    // Un poste de 1 m: su punta cae en el suelo a (x, z) = -d·(1/d.y).
    const t = 1 / -d.y;
    const enSuelo = { x: d.x * t, z: d.z * t };
    const enPantalla = { x: enSuelo.x, y: enSuelo.z * Math.sin(rad) };
    const altoEnPantalla = Math.cos(rad);
    const esperada = sombraDeFigura(altoEnPantalla);
    expect(enPantalla.x).toBeCloseTo(esperada.x, 12);
    expect(enPantalla.y).toBeCloseTo(esperada.y, 12);
  });

  it('la silueta proyectada deja los pies quietos y lleva la cabeza a la punta de la sombra', () => {
    const m = proyeccionDeSombra();
    const aplicar = (x: number, y: number) => ({ x: m.a * x + m.c * y, y: m.b * x + m.d * y });
    const pie = aplicar(7, 0);
    expect(pie.x).toBe(7);
    expect(pie.y).toBeCloseTo(0, 12);
    const cabeza = aplicar(0, -100);
    const s = sombraDeFigura(100);
    expect(cabeza.x).toBeCloseTo(s.x, 12);
    expect(cabeza.y).toBeCloseTo(s.y, 12);
  });
});
