/**
 * La muralla es el cierre de un paso (#232): «las murallas quedan mal, no
 * tienen sentido, son trozos de muralla en mitad de ningún sitio y ocupando lo
 * que serían extensiones enormes» (marca del usuario en s42644 (13, 1): una
 * torre suelta en unos cultivos y un lienzo de norte a sur que acababa en una
 * ciudad). Decisión del usuario: un tramo corto con su puerta, el nodo
 * fortificado, entre dos apoyos naturales —montaña, acantilado, agua o el borde
 * del mapa—, uno a cada lado del paso.
 *
 * Se mira el mapa ya hecho, con la misma regla que el generador
 * (`murallasDelMapa`, `lineaDeLaPuerta`): cada muralla —el muro y sus puertas,
 * 8-conexo, como las une la escena— tiene puerta, cada puerta llega a sus dos
 * apoyos con una línea de `LARGO_MAXIMO_DE_MURALLA` como mucho, y la muralla
 * entera no pasa de eso (#208: ni de una ciudad a otra, ni a lo largo de la
 * frontera). En el bucle rápido, semillas que lo rompían antes: s1 (nueve muros
 * sin puerta, entre ellos ruinas en medio de una región), s12 y s14 (la puerta
 * sin apoyo por un lado), s69 (dos puertas de un cruce que se juntaban en una
 * muralla de 8 mientras se hacía esto) y la de la marca.
 */
import { describe, expect, it } from 'vitest';
import { buildMap, generateMapPlan } from '../src/core/map/generate.js';
import type { GameMap } from '../src/core/map/map.js';
import {
  LARGO_MAXIMO_DE_MURALLA,
  lineaDeLaPuerta,
  murallasDelMapa,
  type RejillaDeMuralla,
} from '../src/core/map/murallas.js';
import { createRng } from '../src/core/rng.js';
import { itLento, rango, segunPrisa } from './lento.js';

// Cada mapa, una vez: en la orden lenta, los tres guardias recorren 1-200.
const hechos = new Map<number, GameMap>();
const mapaDe = (semilla: number): GameMap => {
  const hecho = hechos.get(semilla) ?? buildMap(generateMapPlan(createRng(semilla))).map;
  hechos.set(semilla, hecho);
  return hecho;
};

/**
 * Una rejilla escrita a mano: `#` muro, `P` puerta, `M` apoyo, `.` se pisa.
 * Las filas, de norte a sur.
 */
function rejillaDe(filas: readonly string[]): { r: RejillaDeMuralla; puerta: number } {
  const W = (filas[0] as string).length;
  const H = filas.length;
  const c = (i: number) => (filas[Math.floor(i / W)] as string)[i % W];
  const puerta = filas.join('').indexOf('P');
  return {
    r: {
      W,
      H,
      enLaMuralla: (i) => c(i) === '#' || c(i) === 'P',
      esApoyo: (i) => c(i) === 'M',
      sePisa: (i) => c(i) === '.',
    },
    puerta,
  };
}

describe('la línea de una puerta (`lineaDeLaPuerta`)', () => {
  it('va de la puerta a un apoyo a cada lado del paso, por el camino más corto', () => {
    const { r, puerta } = rejillaDe([
      '.......', //
      'M##P#M.',
      '.......',
    ]);
    const linea = lineaDeLaPuerta(r, puerta);
    if (typeof linea === 'string') throw new Error(linea);
    // De (1,1) a (4,1): la puerta, los dos brazos, y el eje de norte a sur.
    expect([...linea.casillas].sort((a, b) => a - b)).toEqual([8, 9, 10, 11]);
    expect(linea.largo).toBe(4);
    expect(linea.eje).toEqual([0, 1]);
  });

  it('el borde del mapa es un apoyo', () => {
    const { r, puerta } = rejillaDe([
      '....', //
      '#P#M',
      '....',
    ]);
    const linea = lineaDeLaPuerta(r, puerta);
    if (typeof linea === 'string') throw new Error(linea);
    expect(linea.largo).toBe(3);
  });

  it('sin apoyo por un lado no hay línea, y lo dice', () => {
    // El lienzo de la marca de s42644: llega a la montaña por un lado y por el
    // otro acaba en lo que se pisa.
    const { r, puerta } = rejillaDe([
      '.......', //
      'M#P##..',
      '.......',
    ]);
    expect(lineaDeLaPuerta(r, puerta)).toMatch(
      /^la puerta \(2,1\) no llega por el muro a una montaña, un acantilado, el agua o el borde a .* lado de su paso$/,
    );
  });

  it('una puerta que no está entre dos casillas que se pisan no tiene lados', () => {
    const { r, puerta } = rejillaDe([
      'MMMMM', //
      'M#P#M',
      'MMMMM',
    ]);
    expect(lineaDeLaPuerta(r, puerta)).toMatch(/no está entre dos casillas que se pisan/);
  });
});

describe('la muralla, el cierre de un paso (#232)', () => {
  const semillas = segunPrisa([1, 12, 14, 69, 42644], rango(1, 200));

  it('toda muralla tiene puerta y llega de ella a sus dos apoyos', () => {
    const malas = semillas.flatMap((s) => {
      const map = mapaDe(s);
      return murallasDelMapa(map)
        .filter((m) => m.sinApoyo.length > 0)
        .map((m) => {
          const c = m.casillas[0] as number;
          return `s${s} (${c % map.width},${Math.floor(c / map.width)}): ${m.sinApoyo.join('; ')}`;
        });
    });
    expect(malas).toEqual([]);
  });

  it(`ninguna pasa de ${LARGO_MAXIMO_DE_MURALLA} casillas de largo`, () => {
    const largas = semillas.flatMap((s) =>
      murallasDelMapa(mapaDe(s))
        .filter((m) => m.largo > LARGO_MAXIMO_DE_MURALLA)
        .map((m) => `s${s}: ${m.largo}`),
    );
    expect(largas).toEqual([]);
  });

  it('el muro no desaparece: s1 y s12 llevan su fuerte', () => {
    // Quitar el muro del generador pasaría el guardia de arriba sin hacer lo
    // que se pidió, que es que la muralla tenga sentido. La s1 desde el río de
    // una casilla al pie de la meseta (#144, paso 2b): la s5 se quedó sin muro.
    for (const s of [1, 12]) {
      const conPuerta = murallasDelMapa(mapaDe(s)).filter((m) => m.puertas.length > 0);
      expect(conPuerta.length, `s${s}`).toBeGreaterThan(0);
    }
  });

  itLento('más de la mitad de los mapas de 1-200 llevan muralla', () => {
    // Medido el 10-10-2026: 112 de 200 (antes, 117 con una muralla con puerta
    // y 199 con algún muro, casi todo sin puerta).
    const con = rango(1, 200).filter((s) => murallasDelMapa(mapaDe(s)).length > 0);
    expect(con.length).toBeGreaterThan(100);
  });
});
