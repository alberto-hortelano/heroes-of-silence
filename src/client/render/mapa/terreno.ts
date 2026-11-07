import type { TerrainKind as Terrain } from '@core/map/terrain.js';

/**
 * El color de cada terreno, en RGB. El mapa grande lo pinta el escenógrafo
 * (`render/escenario/`), y estos pigmentos son para lo que no espera al arte:
 * el minimapa y el suelo de un píxel por casilla que se ve mientras carga la
 * escena. Las barreras siguen a ΔE76 ≥ 20 de los suelos y de lo inexplorado del
 * minimapa, que es donde todavía se leen (`pigmentos.test.ts`).
 */
export const pigments: Readonly<Record<Terrain, readonly [number, number, number]>> = {
  grass: [79, 82, 57],
  dirt: [111, 94, 70],
  rough: [91, 89, 80],
  sand: [148, 133, 101],
  swamp: [53, 65, 57],
  // Más azul que antes: con cinco barreras, el río tiene que leerse como agua y
  // no como un verde sucio al lado del bosque.
  water: [38, 72, 124],
  snow: [167, 172, 171],
  lava: [85, 51, 40],
  // Las cinco barreras, cada una a ΔE76 ≥ 20 de los siete suelos y de las otras
  // cuatro (la tabla está en la vuelta 1 de QA de «mapas densos»). Antes el
  // acantilado era un pardo a 11 de la tierra de casa y el muro un gris claro a
  // 15 del `rough`: se leían como suelo. La montaña, gris lavanda frío; el
  // bosque, verde hondo; el acantilado, ocre anaranjado; el muro, pizarra
  // oscura. Son temporales hasta que lleguen sus piezas de borde.
  mountain: [118, 110, 138],
  forest: [18, 78, 34],
  cliff: [190, 110, 48],
  // El muro, un punto más claro que la primera pizarra ([34,32,54]): aquella
  // quedaba a ΔE 16,9 del fondo de lo inexplorado del minimapa y se perdía en él
  // (vuelta 2 de QA, N2).
  wall: [40, 36, 64],
};
