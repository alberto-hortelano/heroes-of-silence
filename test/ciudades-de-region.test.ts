/**
 * Las ciudades en mitad de su región (fase 2 de «ciudades y pueblos en su región»,
 * 05-11-2026, `docs/agents/2026-11-05-ciudades-en-su-region/`). Del usuario: «La
 * mayoría de las ciudades deberían estar en mitad de una región, no en un nodo de
 * defensa», y al aprobar el plan, en un nodo solo las bases y las ciudades-puente.
 *
 * - El generador: cada ciudad que no es base ni del río toca una sola región (la
 *   red la asienta dentro, `sitiosDeRegion`) con su recinto y sus accesos enteros
 *   en ella, y es el centro de sus caminos: de ella salen los radios de su región,
 *   por sus puertas. En 1-40 (la orden lenta), son más que las de un nodo.
 * - `ciudadesDeRegion`: la casilla más honda de su región donde cabe, sin tirada;
 *   la pareja que no cabe se salta, y si no salen todas, dice por qué.
 * - `data/poblamiento.json`: el cargador lanza con lo que no vale.
 */
import { describe, expect, it } from 'vitest';
import { POBLAMIENTO, validarPoblamiento } from '../src/core/data.js';
import {
  buildMap,
  ciudadesDeRegion,
  generateMapPlan,
  honduraDeLaRegion,
} from '../src/core/map/generate.js';
import { aPunto, pointKey } from '../src/core/map/map.js';
import { puertasDeLaCiudad, rioAnteLaCiudad } from '../src/core/map/recinto.js';
import { estructura, regionesDelSitio } from '../src/core/map/regiones.js';
import { createRng } from '../src/core/rng.js';
import { grafoDeCaminos, pieza } from './helpers.js';
import { rango, segunPrisa } from './lento.js';

describe('las ciudades del generador: en un nodo, solo las bases y las del río', () => {
  // En el bucle rápido, tres semillas; en la orden lenta, 1-40: 160 ciudades de
  // región, 80 bases y 23 ciudades-puente (05-11-2026).
  const semillas = segunPrisa([1, 12, 29], rango(1, 40));

  it('cada ciudad que no es base ni del río está dentro de su región, con su recinto y sus accesos, y es el centro de sus caminos', () => {
    let deRegion = 0;
    let enNodo = 0;
    for (const s of semillas) {
      const plan = generateMapPlan(createRng(s));
      const { map } = buildMap(plan);
      const red = estructura(map);
      const W = map.width;
      for (const t of plan.towns) {
        const donde = `s${s} ${t.id} (${t.at.x},${t.at.y})`;
        const region = red.sitiosDeRegion.get(t.id);
        const base = t.owner !== null && t.owner !== undefined;
        const delRio = rioAnteLaCiudad(map, t.at) !== null;
        if (base || delRio) {
          expect(region, `${donde}: la base y la del río van en un nodo`).toBe(undefined);
          expect(red.nodoPorId.has(t.id), donde).toBe(true);
          enNodo++;
          continue;
        }
        expect(region, `${donde}: va en mitad de su región`).not.toBe(undefined);
        deRegion++;
        // Grado 1: su recinto y sus accesos, el 5 × 5, todo de su región.
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) <= 1) continue;
            expect(red.regionDe[(t.at.y + dy) * W + t.at.x + dx], donde).toBe(region);
          }
        // El centro de sus caminos: por ellos se llega de la ciudad a todo lo
        // de su región que lleva camino (sus pueblos y sus nodos), y le entra
        // al menos uno por una puerta.
        const alcance = pieza(grafoDeCaminos(map).unidas, t.at.y * W + t.at.x, () => true);
        const puertas = puertasDeLaCiudad(map, t.at);
        expect(puertas.length, `${donde}: sin puerta`).toBeGreaterThan(0);
        for (const o of map.objects) {
          if (o.kind !== 'village' && o.kind !== 'node') continue;
          if (!map.caminos.casillas.has(pointKey(o.at))) continue;
          if (!regionesDelSitio(red, o.id).includes(region as number)) continue;
          expect(
            alcance.has(o.at.y * W + o.at.x),
            `${donde}: sus caminos no llegan a ${o.id}`,
          ).toBe(true);
        }
      }
    }
    expect(deRegion).toBeGreaterThan(enNodo);
    // Que no pase en vacío: cuatro por mapa, `data/poblamiento.json`.
    expect(deRegion).toBe(semillas.length * 2 * POBLAMIENTO.parejasConCiudad);
  });
});

describe('`ciudadesDeRegion`: lo más hondo de su región, sin tirada', () => {
  // Un mapa de 20 × 11 con dos regiones en espejo (la 2, a la izquierda, y la 3,
  // a la derecha), partidas por una columna de muro.
  const W = 20;
  const H = 11;
  const regionDe = Int32Array.from({ length: W * H }, (_, i) => {
    const x = i % W;
    return x === 9 || x === 10 ? -1 : x < 9 ? 2 : 3;
  });
  const entrada = {
    W,
    H,
    regionDe,
    libre: () => true,
    otras: [],
    parejas: [2],
    cuantas: 1,
    azar: createRng(1),
  };

  it('la hondura cuenta el borde del mapa como fuera de la región', () => {
    const h = honduraDeLaRegion(W, H, regionDe, 2);
    expect(h[0]).toBe(1);
    expect(h[5 * W + 4]).toBe(5);
    expect(h[9]).toBe(0);
  });

  it('va en la casilla más honda de cada región de la pareja, la de menor índice si empatan', () => {
    const puestas = ciudadesDeRegion(entrada);
    if (typeof puestas === 'string') throw new Error(puestas);
    expect(puestas.map((c) => ({ ...aPunto(c.casilla, W), r: c.region }))).toEqual([
      // A 5 del muro y del borde: (4, 4), (4, 5) y (4, 6); la primera.
      { x: 4, y: 4, r: 2 },
      { x: 15, y: 4, r: 3 },
    ]);
  });

  it('se aparta de lo que no está libre y de las otras ciudades', () => {
    // Sin la casilla más honda libre para el recinto, la siguiente.
    const sinElMedio = ciudadesDeRegion({
      ...entrada,
      libre: (i, delRecinto) => !(delRecinto && i === 4 * W + 4),
    });
    if (typeof sinElMedio === 'string') throw new Error(sinElMedio);
    // (4, 5) tampoco: su recinto pisa (4, 4). Va (4, 6), la otra a 5.
    expect(aPunto(sinElMedio[0]?.casilla as number, W)).toEqual({ x: 4, y: 6 });
    // Con otra ciudad a 4 de la más honda de la 3, a 5 o más.
    const conOtra = ciudadesDeRegion({ ...entrada, otras: [{ x: 15, y: 1 }] });
    if (typeof conOtra === 'string') throw new Error(conOtra);
    const en3 = aPunto(conOtra[1]?.casilla as number, W);
    expect(Math.max(Math.abs(en3.x - 15), Math.abs(en3.y - 1))).toBeGreaterThanOrEqual(5);
  });

  it('si no caben las que se piden, dice por qué', () => {
    expect(ciudadesDeRegion({ ...entrada, libre: () => false })).toBe(
      'solo caben 0 de 1 parejas de ciudades en mitad de su región (sin pegarse a un nodo ni a otra ciudad)',
    );
    expect(ciudadesDeRegion({ ...entrada, cuantas: 2 })).toMatch(/^solo caben 1 de 2 parejas/);
  });
});

describe('data/poblamiento.json', () => {
  it('el fichero bueno pasa, y cada rotura se dice', () => {
    expect(POBLAMIENTO.parejasConCiudad).toBe(2);
    const pueblosEnUnNodo = { uno: 1, de: 4 };
    expect(validarPoblamiento({ _comment: 'x', parejasConCiudad: 3, pueblosEnUnNodo })).toEqual({
      parejasConCiudad: 3,
      pueblosEnUnNodo,
    });
    expect(() => validarPoblamiento({ parejasConCiudad: 1.5, sobra: 1, pueblosEnUnNodo })).toThrow(
      'data/poblamiento.json: «sobra» no es un campo; valen _comment, parejasConCiudad, pueblosEnUnNodo; "parejasConCiudad" tiene que ser un entero de 0 a 10, y lleva 1.5',
    );
    expect(() => validarPoblamiento({})).toThrow(/"parejasConCiudad" tiene que ser un entero/);
  });
});
