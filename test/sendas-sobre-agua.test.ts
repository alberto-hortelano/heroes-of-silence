/**
 * Ninguna senda corta en diagonal la esquina de una casilla de agua (#210).
 *
 * La huella de la senda (0,32 de ancho) va de centro a centro de casilla: un
 * tramo en diagonal pasa por el vértice que comparten sus dos esquinas y se
 * pinta sobre ellas. Con agua en una esquina, el camino cruzaba el agua sin
 * puente (s2 (25,10-12) de la auditoría 5; 631 tramos con una esquina de agua y
 * 117 con las dos en 1-40). La búsqueda cobra un rodeo por ese paso y lo que
 * queda —la entrada en diagonal de un nodo o una ciudad entre dos barreras, o
 * una región unida por un vértice— pasa esa esquina a montaña
 * (`sinAguaEnLasEsquinas`). El tramo que llega a un puente sí cruza el agua:
 * es el puente.
 */
import { describe, expect, it } from 'vitest';
import { sendaSobreElAgua } from '../src/client/render/escenario/escalon.js';
import type { GameMap } from '../src/core/map/map.js';
import { esquinasDeAgua } from '../src/core/map/vestir.js';
import { newGame } from '../src/core/state/setup.js';
import { escenaDe } from './helpers.js';
import { itLento, rango, segunPrisa } from './lento.js';

/** Las esquinas de agua cortadas por las sendas de un mapa, dichas. */
function cortadas(map: GameMap): string[] {
  const W = map.width;
  const puentes = new Set(
    map.objects.flatMap((o) =>
      o.kind === 'node' && o.barrera === 'water' ? [o.at.y * W + o.at.x] : [],
    ),
  );
  const tramos = map.caminos.tramos.map(([p, q]) => [p.y * W + p.x, q.y * W + q.x] as const);
  return esquinasDeAgua(W, (i) => map.terrain[i] === 'water', tramos, puentes).map(
    (i) => `(${i % W},${Math.floor(i / W)})`,
  );
}

describe('la senda no corta el agua en diagonal (#210)', () => {
  it('la regla: la esquina de agua de un tramo en diagonal se cuenta; la del puente, no', () => {
    // 3 × 3: el agua en (1,0); el tramo (0,0)-(1,1) la corta, el (0,1)-(1,1) es recto.
    const agua = (i: number) => i === 1;
    expect(esquinasDeAgua(3, agua, [[0, 4]], new Set())).toEqual([1]);
    expect(esquinasDeAgua(3, agua, [[3, 4]], new Set())).toEqual([]);
    // Si (1,1) es un puente, el tramo llega a él: no cuenta.
    expect(esquinasDeAgua(3, agua, [[0, 4]], new Set([4]))).toEqual([]);
  });

  // s2, la de la auditoría; s4 y s5, con ciudades en el agua que se entran en
  // diagonal (s4 (5,13), s5 (10,7)).
  it.each(segunPrisa([2, 4, 5], rango(1, 200)))(
    'semilla %i: ninguna esquina de agua bajo una senda, salvo la de un puente',
    (semilla) => {
      expect(cortadas(newGame({ seed: semilla }).map)).toEqual([]);
    },
  );
});

describe('la senda pintada no pasa por el agua (#210, la medida de #211)', () => {
  // s10 y s19: la senda que atravesaba una ciudad entre el agua y una pared se
  // corría con el vaivén hacia el agua en la casilla de su puerta; ahora acaba
  // en cada ciudad o nodo que atraviesa (`encadenar`) y llega recta. s37: la
  // rampa que baja en diagonal a la ciudad de (7,26) ponía el pie en el agua (#214).
  it.each([1, 10, 19, 37])('semilla %i: ningún trozo de senda bajo el agua', (semilla) => {
    expect(sendaSobreElAgua(escenaDe(semilla))).toBe(0);
  });

  itLento('en 1-40, ninguna', () => {
    // Medido el 08-10-2026: 8 en main (#211), 3 con el trazado sin esquinas de
    // agua, 2 al cortar la senda en las ciudades y 0 cuando la rampa de una
    // bajada dejó de poner el pie en el agua (#214): la de caída 2 que baja en
    // diagonal a la ciudad de s37 (7,26) y su reflejo pasaba de la ciudad y
    // caía en el agua de (6,27). En 1-200 queda s75, de otra causa: la senda
    // que sale en diagonal del estribo del puente de (22,3).
    const con = rango(1, 40).flatMap((s) => {
      const n = sendaSobreElAgua(escenaDe(s));
      return n > 0 ? [`s${s}: ${n}`] : [];
    });
    expect(con).toEqual([]);
  });
});
