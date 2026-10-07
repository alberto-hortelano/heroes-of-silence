/**
 * Las rampas (#150): por dónde baja una senda por una cara de roca. Un solo
 * hecho, `rampas` en `relieve.ts`, que leen la pared (`componer`) y la cara
 * (`pintarSuelo`). Aquí, con caras y sendas a mano; en mapas reales, en
 * `taller-escenario.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  paredesFueraDelPie,
  paredesSobreRampa,
  pasilloDeLaPared,
  type Sprite,
} from '../src/client/render/escenario/colocar.js';
import {
  ALTO_DE_NIVEL,
  type Cara,
  ENTORNO_DE_RAMPA,
  HOLGURA_DE_RAMPA,
  pieDeCara,
  RAMPA_MINIMA,
  rampas,
} from '../src/client/render/escenario/relieve.js';
import type { Senda } from '../src/client/render/escenario/sendas.js';
import { recta } from './helpers.js';

const cara = (y: number, x0: number, x1: number, caida = 1): Cara => ({
  y,
  x0,
  x1,
  caida,
  material: 'cara-roca',
});

const cerca = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('las rampas de una cara a mano', () => {
  // Cuelga del borde de abajo de la fila 2: su banda va de y = 3 a 3,6.
  const c = cara(2, 3, 6);
  /** Las rampas de una sola cara. */
  const de = (k: Cara, sendas: readonly Senda[]) => rampas([k], [], sendas).porCara[0] ?? [];

  it('una senda que baja en vertical abre un tajo de su ancho más su arcén, ni más', () => {
    const [r, ...otras] = de(c, [recta([4.5, 2.5], [4.5, 4.5])]);
    expect(otras).toEqual([]);
    cerca(r?.a as number, 4.5 - HOLGURA_DE_RAMPA);
    cerca(r?.b as number, 4.5 + HOLGURA_DE_RAMPA);
    expect(r?.dentro).toEqual([true, true]);
    // Y su trozo es lo que cae en la banda, del filo al pie.
    const ys = r?.trazos.flatMap((t) => t.map(([, y]) => y)) ?? [];
    cerca(Math.min(...ys), 3);
    cerca(Math.max(...ys), 3 + ALTO_DE_NIVEL);
  });

  it('una diagonal que sale por el extremo de la cara abre el tajo hasta el extremo', () => {
    // Entra por el filo en x = 6,7 y sale por el lado derecho (x = 7) en y = 3,3.
    const [r] = de(c, [recta([6.2, 2.5], [7.5, 3.8])]);
    cerca(r?.b as number, c.x1 + 1);
    cerca(r?.a as number, 6.7 - HOLGURA_DE_RAMPA);
    expect(r?.dentro).toEqual([true, false]);
  });

  it('una senda que corre al pie no baja: no hay rampa', () => {
    expect(de(c, [recta([3, 3.5], [7, 3.5])])).toEqual([]);
  });

  it('un peldaño de una casilla no se pierde entero: conserva cara a los dos lados', () => {
    // El punto de control del usuario (06-10-2026): en un acantilado en
    // escalera, el tajo se llevaba la cara de una casilla entera.
    const peldano = cara(2, 3, 3, 2);
    const [r] = de(peldano, [recta([3.5, 2.5], [3.5, 5])]);
    expect(r?.dentro).toEqual([true, true]);
    expect((r?.b as number) - (r?.a as number)).toBeCloseTo(2 * HOLGURA_DE_RAMPA, 6);
  });

  it('una senda que baja por dos caras vecinas de la misma fila da una rampa en cada una', () => {
    // A cae un nivel y B dos: dos caras de la fila 2, una al lado de la otra.
    // La senda entra por el filo de A y pasa a la banda de B sin salir de las
    // bandas: en B no toca el filo, pero es la misma cadena y también baja.
    const a = cara(2, 3, 4, 1);
    const b = cara(2, 5, 6, 2);
    expect(rampas([a, b], [], [recta([4, 2.5], [6.5, 5])]).porCara.map((rs) => rs.length)).toEqual([
      1, 1,
    ]);
    // Y la misma senda, pero entrando ya por debajo del filo de B, no abre nada.
    expect(de(b, [recta([5.2, 3.5], [6.5, 4.8])])).toEqual([]);
  });

  it('dos sendas más juntas que el resto mínimo dan un tajo; separadas, dos', () => {
    const ancha = cara(2, 0, 9);
    const juntas = de(ancha, [recta([3, 2.5], [3, 4.5]), recta([4.1, 2.5], [4.1, 4.5])]);
    expect(juntas).toHaveLength(1);
    expect(juntas[0]?.trazos).toHaveLength(2);
    const lejos = de(ancha, [recta([2, 2.5], [2, 4.5]), recta([6, 2.5], [6, 4.5])]);
    expect(lejos).toHaveLength(2);
  });

  it('todo punto de un trazo queda a la holgura del borde del tajo, salvo en los extremos de la cara', () => {
    const sendas = [
      recta([3.4, 2.5], [5.6, 4.4]),
      recta([8.5, 2.5], [8.5, 4.5]),
      recta([10.6, 2.6], [11.9, 3.9]),
    ];
    const ancha = cara(2, 3, 11);
    const rs = de(ancha, sendas);
    expect(rs.length).toBeGreaterThanOrEqual(3);
    for (const r of rs)
      for (const [x] of r.trazos.flat()) {
        if (r.dentro[0]) expect(x - r.a).toBeGreaterThanOrEqual(HOLGURA_DE_RAMPA - 1e-9);
        if (r.dentro[1]) expect(r.b - x).toBeGreaterThanOrEqual(HOLGURA_DE_RAMPA - 1e-9);
      }
  });
});

describe('lo que roza una esquina no abre tajo, y la pared se aparta de la senda junto a la rampa', () => {
  // La cara de una casilla de y = 3 a 4,2 (caída 2), de x = 3 a 4.
  const peldano = cara(2, 3, 3, 2);

  it('una senda que solo roza la esquina de la cara no abre tajo, pero cuenta para la pared', () => {
    // Entra por el filo en x = 3,1 y sale por la izquierda en y = 3,1: 0,14 dentro, menos de `RAMPA_MINIMA`.
    const roce = recta([3.3, 2.8], [2.6, 3.5]);
    const b = rampas([peldano], [], [roce]);
    expect(b.porCara[0]).toEqual([]);
    expect(b.junto.length).toBeGreaterThan(0);
    // La misma senda, metida más adentro, ya abre su tajo.
    expect(rampas([peldano], [], [recta([3.2, 2.5], [3.5, 4.5])]).porCara[0]).toHaveLength(1);
    expect(RAMPA_MINIMA).toBe(0.25);
  });

  it('la senda junto a la rampa sale de la banda: la de la diagonal y la que sigue por otro tramo (H1)', () => {
    // Una diagonal que baja por el peldaño y sigue, fuera de la banda, hasta x = 1;
    // y otra senda que sale de su punta hacia la izquierda, sin bajar por nada.
    const baja = recta([3.6, 2.5], [2, 4.5]);
    const otra = recta([2, 4.5], [-2, 4.5]);
    const lejos = recta([20, 2], [25, 2]);
    const { junto } = rampas([peldano], [], [baja, otra, lejos]);
    const puntos = junto.flat();
    // Fuera de la banda (y > 4,2) y a la izquierda de la cara.
    expect(puntos.some(([x, y]) => y > 4.3 && x < 2.5)).toBe(true);
    // La otra senda, hasta `ENTORNO_DE_RAMPA` de lo que baja (lo que baja por
    // la cara va de x = 3 a 3,17), y no más.
    expect(puntos.some(([x, y]) => y === 4.5 && x < 2)).toBe(true);
    const minX = Math.min(...puntos.map(([x]) => x));
    expect(minX).toBeCloseTo(3 - ENTORNO_DE_RAMPA, 6);
    // La que pasa lejos no entra.
    expect(puntos.some(([x]) => x >= 20)).toBe(false);
  });

  it('la senda que tapa una cara sin tajo, lejos de todo tajo, no aparta la pared', () => {
    // Una cara ancha sin tajo (la senda solo la roza) cruzada por su banda de lado a lado.
    const ancha = cara(10, 0, 9, 3);
    const roce = recta([9.7, 10.6], [10.4, 11.3]);
    const pie = recta([0, 11.6], [9, 11.6]);
    const { porCara, junto } = rampas([ancha], [], [roce, pie]);
    expect(porCara[0]).toEqual([]);
    // Lo que corre por la banda (y = 11,6) lo tapa la cara: no está en `junto`.
    expect(junto.flat().some(([x, y]) => y === 11.6 && x < 8)).toBe(false);
  });

  it('el guardia cuenta la pared que pisa la senda de junto a la rampa, aunque esté fuera de su banda', () => {
    // Una pared de 2 × 1 casillas que va de x = 0 a 2 y de y = 4,5 a 5,5.
    const pared: Sprite = {
      src: 'paredes-roca/1.webp',
      nw: 200,
      nh: 100,
      ax: 100,
      ay: 100,
      x: 1,
      y: 5.5,
      alto: 1,
      clase: 'pared',
      color: '#4c463e',
      capa: 0,
      sombra: true,
    };
    const { junto } = rampas([peldano], [], [recta([3.6, 2.5], [2, 4.5])]);
    const p = pasilloDeLaPared(junto);
    expect(paredesSobreRampa([pared], p)).toEqual([pared]);
    // Corrida dos casillas a la izquierda ya no la pisa.
    expect(paredesSobreRampa([{ ...pared, x: -2.5 }], p)).toEqual([]);
  });
});

describe('la pared se apoya en el pie de su cara, también corrida por una escalera (#150, N1)', () => {
  // Una escalera que baja hacia la derecha: la fila 2 de x = 3 a 4, la 3 de x = 5 a 6.
  const alta = cara(2, 3, 4);
  const baja = cara(3, 5, 6);
  const caras = [alta, baja];
  const modulo = (x: number, y: number, src = 'modulos/paredes-roca/1.webp'): Sprite => ({
    src,
    nw: 100,
    nh: 100,
    ax: 50,
    ay: 100,
    x,
    y,
    alto: 1,
    clase: 'pared',
    color: '#4c463e',
    capa: 0,
    sombra: true,
  });

  it('el pie se inclina en la última casilla hacia la cara de al lado', () => {
    const p = pieDeCara(alta, caras);
    expect(p.derecha).toBe(baja);
    expect(p.izquierda).toBeUndefined();
    cerca(p.pie, 3 + ALTO_DE_NIVEL);
    cerca(p.en(4), p.pie);
    cerca(p.en(4.5), p.pie + 0.5);
    cerca(p.en(5), pieDeCara(baja, caras).pie);
    // La de abajo, al revés: su primera casilla sube hacia la alta.
    cerca(pieDeCara(baja, caras).en(5.5), pieDeCara(baja, caras).pie - 0.5);
  });

  it('con otra caída, el pie se inclina hasta el de la de al lado, no una fila por casilla', () => {
    // Una escalera de caída 2 que sigue por una de 1: bajaba 1 por casilla y
    // en la última quedaba 0,6 bajo el pie de la de al lado (s7 x5 y18).
    const dos = { ...alta, caida: 2 };
    const conDos = [dos, baja];
    const p = pieDeCara(dos, conDos);
    expect(p.derecha).toBe(baja);
    cerca(p.en(5), pieDeCara(baja, conDos).pie);
    cerca(p.en(4.5), (p.pie + pieDeCara(baja, conDos).pie) / 2);
    cerca(pieDeCara(baja, conDos).en(5), p.pie);
  });

  it('una pared en el pie no cuenta; corrida con la y de su sitio, sí', () => {
    const { pie, en } = pieDeCara(alta, caras);
    const enSuPie = [modulo(3.5, pie + 0.05), modulo(4.6, en(4.6) + 0.05)];
    expect(paredesFueraDelPie(enSuPie, caras)).toEqual([]);
    // Lo que hacía `ponerPared`: nacida en x = 4,9 (casi el pie de la de abajo)
    // y corrida a 4,1 conservando su y. Queda 0,8 bajo el pie de su cara: en
    // el suelo de abajo, fuera de toda banda.
    const corrida = modulo(4.1, en(4.9) + 0.05);
    expect(paredesFueraDelPie([corrida], caras)).toEqual([corrida]);
    // Y lejos de toda cara, aunque sea a la altura de un pie.
    const suelta = modulo(9, pie + 0.05);
    expect(paredesFueraDelPie([suelta], caras)).toEqual([suelta]);
    // Un módulo a media cara, dentro de su banda pero sobre su pie, tampoco:
    // la banda es del pedregal.
    const colgada = modulo(3.5, pie - 0.4);
    expect(paredesFueraDelPie([colgada], caras)).toEqual([colgada]);
    // Sin arte no se sabe si es módulo o peñasco: no se mide.
    expect(paredesFueraDelPie([{ ...corrida, src: null }], caras)).toEqual([]);
  });

  it('un peñasco del pedregal vale en toda la banda de su cara, pero no por debajo de su pie', () => {
    const { pie } = pieDeCara(alta, caras);
    const peñasco = (x: number, y: number) => modulo(x, y, 'modulos/rocas-caidas/1.webp');
    expect(paredesFueraDelPie([peñasco(3.5, 3.2), peñasco(4.9, pie)], caras)).toEqual([]);
    const hundido = peñasco(3.5, pie + 0.5);
    expect(paredesFueraDelPie([hundido], caras)).toEqual([hundido]);
  });

  it('lo que no es pared no lo mira', () => {
    expect(paredesFueraDelPie([{ ...modulo(9, 9), clase: 'roca' }], caras)).toEqual([]);
  });
});
