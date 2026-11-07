/**
 * Quien camina por un escenario lateral (`partida/caminante.ts`), el de la base y el de un
 * lugar de un mundo: la marcha en recta por lo que se pisa, lo que pasa al llegar, la cámara
 * que lo sigue y lo que se pinta de él. Las dos escenas lo prueban por fuera
 * (`escenas.test.ts`, `base-camara.test.ts`); aquí, los pasos sueltos, que cada escena da en
 * su orden: avanzar no lleva la cámara, y una marcha de duración 0 no llega hasta avanzar.
 */
import { describe, expect, it } from 'vitest';
import { Caminante } from '../src/client/partida/caminante.js';
import { camaraDeLaBase, camaraQuieta } from '../src/client/render/base/camara.js';
import { CUERPO_DE_VECINO } from '../src/client/render/figuras/cuerpo-de-gente.js';
import { direccionHacia } from '../src/client/render/figuras/direccion.js';
import { alaFranja, disposicionDe, enLaFranja } from '../src/shared/base.js';

const d = disposicionDe('templarios');
const LIENZO = { ancho: 1086, alto: 778 } as const;

/** Uno que camina a paso de base, encuadrado en el lienzo del escritorio y en la entrada. */
function enLaEntrada(ritmoDelClip = 1): Caminante {
  const c = new Caminante({ prisa: 1.6, ritmoDelClip });
  c.encuadrar(LIENZO.ancho, LIENZO.alto);
  c.empezarEn(d.entrada, 'N');
  return c;
}

/** La puerta más lejos de la entrada: la cámara tiene que ir hasta ella. */
const lejos = Object.values(d.sitios)
  .map((s) => s.puerta)
  .sort((a, b) => Math.abs(b.x - d.entrada.x) - Math.abs(a.x - d.entrada.x))[0]!;

describe('quien camina por un escenario lateral', () => {
  it('anda en recta por lo que se pisa y, al llegar, mira hacia donde toque y hace lo suyo una vez', () => {
    const c = enLaEntrada();
    let llegadas = 0;
    const meta = alaFranja(d, lejos);
    const dura = c.andar(d, CUERPO_DE_VECINO, lejos, 0, 'N', () => llegadas++);
    expect(dura).toBeGreaterThan(0);
    expect(c.andando).toBe(true);
    c.avanzar(dura / 2, d);
    expect(c.andando).toBe(true);
    expect(enLaFranja(d, c.en)).toBe(true);
    expect(c.estado(dura / 2).mira).toBe(direccionHacia(d.entrada, meta, 'N'));
    expect(llegadas).toBe(0);
    c.avanzar(dura, d);
    expect(c.andando).toBe(false);
    expect(c.en).toEqual(meta);
    expect(c.estado(dura).mira).toBe('N');
    expect(llegadas).toBe(1);
    c.avanzar(dura + 1000, d);
    expect(llegadas).toBe(1);
  });

  it('avanzar no lleva la cámara: la lleva `seguirConLaCamara`, fotograma a fotograma, hasta quedarse quieta sobre él', () => {
    const c = enLaEntrada();
    c.seguirConLaCamara(d, 0);
    const desdeLaEntrada = c.camara(d);
    expect(desdeLaEntrada).toEqual(camaraDeLaBase(LIENZO, camaraQuieta(d, LIENZO, d.entrada.x)));
    const dura = c.andar(d, CUERPO_DE_VECINO, lejos, 0, null, null);
    // Sin la cámara, quien camina se va y la vista se queda en la entrada.
    c.avanzar(dura / 2, d);
    expect(c.camara(d)).toEqual(desdeLaEntrada);
    expect(c.camaraLlegada(d)).toBe(false);
    // Con ella, a cada fotograma (como el lugar): va tras él sin alcanzarlo mientras anda,
    // y al rato de llegar se queda quieta sobre él.
    const otro = enLaEntrada();
    otro.seguirConLaCamara(d, 0);
    otro.andar(d, CUERPO_DE_VECINO, lejos, 0, null, null);
    let aMedioCamino: boolean | null = null;
    for (let t = 16; t <= dura + 3000; t += 16) {
      otro.avanzar(t, d);
      otro.seguirConLaCamara(d, t);
      if (aMedioCamino === null && t >= dura / 2) aMedioCamino = otro.camaraLlegada(d);
    }
    expect(aMedioCamino).toBe(false);
    expect(otro.andando).toBe(false);
    expect(otro.camaraLlegada(d)).toBe(true);
    expect(otro.camara(d)).toEqual(camaraDeLaBase(LIENZO, camaraQuieta(d, LIENZO, otro.en.x)));
  });

  it('una marcha de duración 0 no llega hasta avanzar, y avanzar no mueve la cámara: cada escena da el paso que le toca', () => {
    const c = enLaEntrada();
    c.seguirConLaCamara(d, 0);
    // La ventana se estrecha: la vista de antes ya no es la quieta sobre quien camina.
    c.encuadrar(LIENZO.ancho / 2, LIENZO.alto);
    const camara = c.camara(d);
    expect(c.camaraLlegada(d)).toBe(false);
    let llegadas = 0;
    expect(c.andar(d, CUERPO_DE_VECINO, c.en, 100, 'S', () => llegadas++)).toBe(0);
    expect(c.andando).toBe(true);
    expect(llegadas).toBe(0);
    c.avanzar(100, d);
    expect(llegadas).toBe(1);
    expect(c.andando).toBe(false);
    expect(c.en).toEqual(d.entrada);
    expect(c.estado(100).mira).toBe('S');
    // La base se queda así hasta dibujar; el lugar sigue con la cámara.
    expect(c.camara(d)).toEqual(camara);
    c.seguirConLaCamara(d, 116);
    expect(c.camara(d)).not.toEqual(camara);
  });

  it('se pinta andando con el clip de andar a su ritmo y quieto con el de reposo desde que paró', () => {
    const c = enLaEntrada(1.875);
    expect(c.estado(500)).toEqual({ en: d.entrada, mira: 'N', clip: 'idle', tiempo: 500 });
    const dura = c.andar(d, CUERPO_DE_VECINO, lejos, 1000, null, null);
    expect(c.estado(1200)).toMatchObject({ clip: 'walk', tiempo: 200 * 1.875 });
    const quieto = 1000 + dura;
    c.avanzar(quieto, d);
    const despues = c.estado(quieto + 300);
    expect(despues.clip).toBe('idle');
    expect(despues.tiempo).toBeCloseTo(300, 6);
  });

  it('plantado en un sitio, queda quieto con la cámara ya sobre él, y lo que esperaba la marcha de antes no llega', () => {
    const c = enLaEntrada();
    let llegadas = 0;
    c.andar(d, CUERPO_DE_VECINO, lejos, 0, 'N', () => llegadas++);
    c.plantarEn(d, d.entrada, 'E', 50);
    expect(c.andando).toBe(false);
    expect(c.en).toEqual(d.entrada);
    expect(c.camaraLlegada(d)).toBe(true);
    expect(c.camara(d)).toEqual(camaraDeLaBase(LIENZO, camaraQuieta(d, LIENZO, d.entrada.x)));
    expect(c.estado(80)).toEqual({ en: d.entrada, mira: 'E', clip: 'idle', tiempo: 30 });
    c.avanzar(100_000, d);
    expect(llegadas).toBe(0);
  });

  it('al abrir otra vez el escenario, en la entrada, sin marcha y con la cámara por poner', () => {
    const c = enLaEntrada();
    const dura = c.andar(d, CUERPO_DE_VECINO, lejos, 0, null, null);
    c.avanzar(dura / 2, d);
    c.seguirConLaCamara(d, dura / 2);
    c.empezarEn(d.entrada, 'N');
    expect(c.andando).toBe(false);
    expect(c.en).toEqual(d.entrada);
    expect(c.camaraLlegada(d)).toBe(true);
    expect(c.camara(d)).toEqual(camaraDeLaBase(LIENZO, camaraQuieta(d, LIENZO, d.entrada.x)));
  });
});
