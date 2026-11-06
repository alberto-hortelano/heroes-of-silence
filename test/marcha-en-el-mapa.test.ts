/**
 * El héroe anda su marcha por el mapa (06-11-2026, petición del usuario: «el
 * personaje se teletransporta a donde va, tiene que verse la animación del héroe
 * caminando por el mapa hasta llegar a su destino»).
 *
 * Lo que se mira: por dónde va a cada instante (`enLaMarcha`, la cuenta que lee la
 * escena del mapa) y que la sesión enseñe la marcha antes de abrir lo que abre la
 * llegada —aquí, la batalla contra un monstruo—, con un clic que la hace llegar.
 * Lo que se ve, con capturas del navegador.
 */
import { describe, expect, it } from 'vitest';
import { enLaMarcha } from '../src/client/marcha.js';
import { sesionAntesDelMonstruo } from './batalla-de-cliente.js';

describe('enLaMarcha: por dónde va quien anda', () => {
  const pasos = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 1 },
  ];

  it('recorre cada paso a su compás, el de diagonal √2 veces más largo, y llega', () => {
    expect(enLaMarcha(pasos, 100, 0)).toEqual({
      desde: pasos[0],
      hasta: pasos[1],
      t: 0,
      mira: 'E',
    });
    expect(enLaMarcha(pasos, 100, 50)?.t).toBeCloseTo(0.5);
    const diagonal = enLaMarcha(pasos, 100, 100 + 100 * Math.SQRT1_2);
    expect(diagonal?.desde).toEqual(pasos[1]);
    expect(diagonal?.hasta).toEqual(pasos[2]);
    expect(diagonal?.t).toBeCloseTo(0.5);
    // Hacia abajo y a la derecha en pantalla: al sureste, sin espejo.
    expect(diagonal?.mira).toBe('SE');
    expect(enLaMarcha(pasos, 100, 100 + 100 * Math.SQRT2 + 1)).toBeNull();
  });

  it('sin pasos que andar ya ha llegado, y un compás que no anda lanza', () => {
    expect(enLaMarcha([{ x: 3, y: 3 }], 100, 0)).toBeNull();
    expect(() => enLaMarcha(pasos, 0, 0)).toThrow(/no anda/);
  });
});

describe('la sesión enseña la marcha antes de abrir la llegada', () => {
  it('la batalla del monstruo espera a que el héroe llegue, por las casillas que anduvo', () => {
    const { s, at } = sesionAntesDelMonstruo();
    s.enseñarLaMarcha = true;
    const heroe = s.selectedHero;
    if (heroe === null) throw new Error('sin héroe');
    const salida = heroe.at;
    s.clickTile(at);
    const marcha = s.marchaEnCurso;
    // El núcleo ya ha jugado: la batalla está abierta y el héroe, ante el monstruo.
    expect(s.state.pendingBattle).not.toBeNull();
    // El monstruo de `sesionAntesDelMonstruo` está a más de un paso: hay marcha.
    if (marcha === null) throw new Error(`el héroe no anduvo hasta (${at.x},${at.y})`);
    expect(s.scene).toBe('adventure');
    expect(marcha.heroe).toBe(heroe.id);
    expect(marcha.pasos[0]).toEqual(salida);
    expect(marcha.pasos.at(-1)).toEqual(heroe.at);
    for (let i = 1; i < marcha.pasos.length; i++) {
      const a = marcha.pasos[i - 1]!;
      const b = marcha.pasos[i]!;
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBe(1);
    }
    // Un clic mientras anda solo lo hace llegar: se abre la batalla.
    s.clickTile(at);
    expect(s.marchaEnCurso).toBeNull();
    expect(s.scene).toBe('battle');
  });
});
