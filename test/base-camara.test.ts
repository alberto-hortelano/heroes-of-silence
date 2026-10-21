/**
 * La cámara de la base y la franja: la vista sigue a quien camina en horizontal
 * con tope en los dos bordes (centrada si cabe entera), se acerca suave y se pega
 * al llegar; un clic fuera de la franja se recorta al punto más cercano dentro, y
 * la marcha resbala por el borde de atrás, que sigue los umbrales pintados.
 */
import { describe, expect, it } from 'vitest';
import templariosJson from '../data/bases/templarios.json' with { type: 'json' };
import { EscenaBase } from '../src/client/escenas/castillo.js';
import { camaraDeLaBase, camaraQuieta, seguir } from '../src/client/render/base/camara.js';
import { cajaDeFiguraEn } from '../src/client/render/batalla.js';
import { enPantalla, pasoDeLaBase } from '../src/client/render/proyeccion.js';
import { Session } from '../src/client/session.js';
import { faccionesDeLaSemilla } from '../src/core/state/setup.js';
import {
  alaFranja,
  bordeDeAtras,
  disposicionDe,
  enLaFranja,
  FONDO_DE_LA_FRANJA,
  filaDelPanorama,
  leerDisposicion,
  MARGEN_DE_LA_FRANJA,
} from '../src/shared/base.js';
import { primeraSemillaCon } from './helpers.js';

const d = disposicionDe('templarios');
const lienzo = { ancho: 1086, alto: 778 };
const vista = lienzo.ancho / pasoDeLaBase(lienzo.alto);

describe('la cámara de la base', () => {
  it('se centra en quien camina y para en los dos bordes', () => {
    expect(vista).toBeLessThan(d.ancho);
    expect(camaraQuieta(d, lienzo, d.ancho / 2)).toBeCloseTo(d.ancho / 2 - vista / 2);
    expect(camaraQuieta(d, lienzo, 0.5)).toBe(0);
    expect(camaraQuieta(d, lienzo, d.ancho - 0.5)).toBeCloseTo(d.ancho - vista);
  });

  it('si el escenario cabe entero, va centrado', () => {
    const ancho = { ancho: 8 };
    const x = camaraQuieta(ancho, lienzo, 1);
    expect(x).toBeCloseTo((8 - vista) / 2);
    expect(camaraQuieta(ancho, lienzo, 7)).toBe(x);
  });

  it('el suelo va abajo: el borde delantero de la franja cae a su margen del borde del lienzo', () => {
    const t = camaraDeLaBase(lienzo, 0);
    const abajo = t.origenY + FONDO_DE_LA_FRANJA * t.compresion * t.paso;
    expect(lienzo.alto - abajo).toBeCloseTo(0.35 * t.paso);
  });

  it('el origen cae en un píxel entero de dispositivo: la plaza se copia 1:1 sin temblar', () => {
    for (const densidad of [1, 1.09375, 1.5, 2])
      for (const camaraX of [0, 0.013, 3.7, 17.41, d.ancho - vista]) {
        const t = camaraDeLaBase(lienzo, camaraX, pasoDeLaBase(lienzo.alto), densidad);
        const enDispositivo = t.origenX * densidad;
        expect(Math.abs(enDispositivo - Math.round(enDispositivo))).toBeLessThan(1e-6);
        // Lo más que se aparta de la cámara pedida: medio píxel de dispositivo.
        expect(Math.abs(t.origenX + camaraX * t.paso)).toBeLessThanOrEqual(0.5 / densidad + 1e-9);
      }
  });

  it('`seguir` se acerca sin pasarse y acaba pegada a su meta', () => {
    const meta = camaraQuieta(d, lienzo, 20);
    let x = 0;
    let pasos = 0;
    while (x !== meta && pasos < 200) {
      const antes = x;
      x = seguir(x, 20, d, lienzo, 16);
      expect(x).toBeGreaterThan(antes);
      expect(x).toBeLessThanOrEqual(meta);
      pasos++;
    }
    expect(x).toBe(meta);
    // Un paso de 16 ms no la pega: es un acercamiento, no un salto.
    expect(seguir(0, 20, d, lienzo, 16)).toBeLessThan(meta / 2);
  });
});

describe('la franja', () => {
  it('deja intacto lo de dentro', () => {
    for (const p of [
      d.entrada,
      { x: 5, y: 0.5 },
      { x: 40, y: FONDO_DE_LA_FRANJA },
      { x: 1, y: 3 },
    ]) {
      expect(alaFranja(d, p)).toEqual(p);
      expect(enLaFranja(d, p)).toBe(true);
    }
  });

  it('en los dos extremos, la figura entera queda dentro del lienzo: media figura del borde (QA, H7)', () => {
    // La lanza del héroe en guardia sale del cuerpo hasta media figura (su alto
    // a la mitad); con medio cuerpo de margen tocaba el marco.
    for (const pide of [-3, 99]) {
      const en = alaFranja(d, { x: pide, y: 2 });
      const t = camaraDeLaBase(lienzo, camaraQuieta(d, lienzo, en.x));
      const c = cajaDeFiguraEn(t, en);
      expect(c.x - c.alto / 2, `x ${en.x}`).toBeGreaterThanOrEqual(0);
      expect(c.x + c.alto / 2, `x ${en.x}`).toBeLessThanOrEqual(lienzo.ancho);
    }
  });

  it('recorta lo de fuera frente a donde se pulsó, también en las cuatro esquinas', () => {
    const m = MARGEN_DE_LA_FRANJA;
    const atras = (x: number) => bordeDeAtras(d, x);
    expect(alaFranja(d, { x: -3, y: -2 })).toEqual({ x: m, y: atras(m) });
    expect(alaFranja(d, { x: 99, y: -2 })).toEqual({ x: d.ancho - m, y: atras(d.ancho - m) });
    expect(alaFranja(d, { x: -3, y: 9 })).toEqual({ x: m, y: FONDO_DE_LA_FRANJA });
    expect(alaFranja(d, { x: 99, y: 9 })).toEqual({ x: d.ancho - m, y: FONDO_DE_LA_FRANJA });
    // Encima de un edificio, al borde de atrás frente a él.
    const lvl2 = d.sitios.lvl2;
    const x = lvl2.umbral.en.x;
    expect(alaFranja(d, { x, y: -1.5 })).toEqual({ x, y: atras(x) });
  });

  it('no es convexa, y la marcha resbala por el borde: de lvl6 a lvl2 no sale en ningún fotograma', () => {
    // Una plaza pintada con la puerta de lvl4 (entre las dos) muy adelantada:
    // la recta de una puerta a otra pasa por detrás de su umbral.
    const crudo = JSON.parse(JSON.stringify(templariosJson));
    // T1 lleva dos puertas y se alinea por la media: 2,4 pasos de diferencia
    // dejan lvl6 a −1,2 y lvl4 a +1,2 de la raya.
    crudo.sitios.lvl4.puerta[1] =
      crudo.sitios.lvl6.puerta[1] + Math.round(filaDelPanorama(2.4) - filaDelPanorama(0));
    crudo.sitios.lvl4.region[2] = crudo.sitios.lvl4.puerta[1] + 20;
    const torcida = leerDisposicion('templarios', crudo);
    // La disposición es la templaria: la base que se abre tiene que serlo, o su
    // gente no está en ella.
    const s = new Session(
      primeraSemillaCon('j0 con los templarios', (n) =>
        faccionesDeLaSemilla(n)[0] === 'templarios' ? n : undefined,
      ).semilla,
    );
    s.openTown(s.myTowns()[0]!.id);
    const escena = new EscenaBase(
      () => s,
      () => torcida,
    );
    escena.encuadrar(lienzo.ancho, lienzo.alto);
    // Hasta la puerta de lvl6, y de ahí a la de lvl2, por el suelo.
    const ir = (p: { x: number; y: number }, ahora: number): void => {
      const t = escena.camara()!;
      const q = enPantalla(t, p);
      escena.pulsar(q.x, q.y, ahora);
    };
    ir(torcida.sitios.lvl6.puerta, 0);
    escena.actualizar(60_000);
    const cerca = (a: { x: number; y: number }, b: { x: number; y: number }): void => {
      expect(a.x).toBeCloseTo(b.x, 6);
      expect(a.y).toBeCloseTo(b.y, 6);
    };
    cerca(escena.posicion, torcida.sitios.lvl6.puerta);
    const desde = escena.posicion;
    const hasta = torcida.sitios.lvl2.puerta;
    // Sin el recorte, la recta pasa por detrás del umbral de lvl4.
    const medio = {
      x: torcida.sitios.lvl4.umbral.en.x,
      y:
        desde.y +
        ((hasta.y - desde.y) * (torcida.sitios.lvl4.umbral.en.x - desde.x)) / (hasta.x - desde.x),
    };
    expect(enLaFranja(torcida, medio)).toBe(false);
    ir(hasta, 100_000);
    for (let i = 0; i <= 50; i++) {
      escena.actualizar(100_000 + i * 400);
      expect(enLaFranja(torcida, escena.posicion), `fotograma ${i}`).toBe(true);
    }
    cerca(escena.posicion, hasta);
  });
});
