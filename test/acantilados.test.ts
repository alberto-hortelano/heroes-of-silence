/**
 * El relieve de la escena es el de las regiones (#143).
 *
 * Antes el escenógrafo inventaba el nivel de cada región y remendaba lo que
 * chocaba con las barreras: crestas por encima de las dos orillas, cañones,
 * mesas y una escalera que subía lo que se pisa; la medida que lo vigilaba era
 * `acantiladosARas` (#174), que se retira con los remiendos. Ahora el nivel es
 * del mapa (`MapRegion.nivel`) y la escena lo aplica: lo que se pisa, al de su
 * región; la barrera, al más alto de lo que toca (el borde de la meseta); y
 * entre dos casillas que se pisan solo hay escalón en la rampa de un nodo.
 * Lo que la cámara no ve de un acantilado —su espalda, al norte— lleva una
 * hilera de peñascos.
 */
import { describe, expect, it } from 'vitest';
import { analizar } from '../src/client/render/escenario/analizar.js';
import {
  desnivelesSinBarrera,
  nivelFueraDeSuRegion,
} from '../src/client/render/escenario/relieve.js';
import { partidaDe } from './helpers.js';
import { LENTO, rango } from './lento.js';

/** En la orden lenta, 1-40 (s1, s24 y s34 eran las de la auditoría) y la 57; en `verify`, la 1 de las marcas. */
const SEMILLAS = LENTO ? [...rango(1, 40), 57] : [1];

describe('el nivel de lo que se pisa (#143)', () => {
  for (const semilla of SEMILLAS) {
    it(`semilla ${semilla}: todo lo que se pisa va al nivel de su región y sin escalones fuera de las rampas`, () => {
      const { map, escena: e } = partidaDe(semilla);
      expect(e.informe.nivelFueraDeSuRegion).toBe(0);
      expect(e.informe.desnivelesSinBarrera).toBe(0);
      // Y los dos muerden: una casilla de una región subida un nivel sale en
      // los dos (y en el segundo, por cada vecina que se pisa).
      const a = analizar(map);
      const i = a.red.regionDe.findIndex(
        (r, k) => r >= 0 && k % e.W > 0 && a.red.regionDe[k - 1] === r,
      );
      const nivel = Int8Array.from(e.nivel);
      nivel[i] = (nivel[i] as number) + 1;
      expect(nivelFueraDeSuRegion(a, nivel)).toBe(1);
      expect(desnivelesSinBarrera(a, nivel)).toBeGreaterThan(0);
    });
  }
});

describe('en los mapas reales', () => {
  for (const semilla of SEMILLAS) {
    it(`semilla ${semilla}: la espalda de cada acantilado lleva peñascos, salvo junto a un objeto`, () => {
      const { map, escena: e } = partidaDe(semilla);
      const peñascos = e.sprites.filter((s) => s.src?.includes('rocas-caidas'));
      const desnudas = e.relieve.rebordes.filter(([x, y]) => {
        if (map.terrain[y * e.W + x] !== 'cliff') return false;
        if (peñascos.some((s) => s.x >= x && s.x < x + 1 && s.y >= y && s.y < y + 0.6))
          return false;
        // La reserva de un objeto aparta las rocas: ahí la espalda queda sin ellas.
        if (map.objects.some((o) => Math.abs(o.at.x - x) <= 1 && Math.abs(o.at.y - y) <= 1))
          return false;
        // Y el pasillo de una senda que pasa al lado (el pedregal no pisa sendas).
        return !e.sendas.some((sd) =>
          sd.some(([px, py]) => px >= x - 0.5 && px <= x + 1.5 && py >= y - 0.5 && py <= y + 1.1),
        );
      });
      expect(desnudas, JSON.stringify(desnudas)).toEqual([]);
    });
  }
});
