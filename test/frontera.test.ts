/**
 * El desempate de la frontera, que es lo único de este cambio que puede
 * cambiar una partida.
 *
 * `Frontera` sustituye a un barrido lineal sobre un `Set` que desempataba **por
 * accidente**: `<` estricto, así que entre costes iguales ganaba el primero
 * insertado, o sea el primero descubierto. Un montículo corriente rompe ese
 * empate por la forma del árbol, y entonces el héroe elige otra de dos rutas
 * igual de baratas y la partida entera se juega distinta.
 *
 * Los tres primeros tests miran la estructura; los dos últimos miran a los dos
 * Dijkstra que la usan, porque una cola que ordena bien y un Dijkstra que la
 * usa mal darían verde por separado.
 */
import { describe, expect, it } from 'vitest';
import { Frontera } from '../src/core/map/frontera.js';
import { createEmptyMap, findPath, reachableFrom } from '../src/core/map/map.js';

/**
 * Empuja con un punto de relleno.
 *
 * Los tres primeros tests miran el ORDEN, y el `Point` que viaja en el nodo no
 * entra en el comparador. Las claves son letras y no coordenadas justo para que
 * se vea que el desempate no las mira: si alguna vez desempatara por clave,
 * `['z','y','x']` saldría al revés.
 */
function empuja(f: Frontera, key: string, cost: number): void {
  f.push(key, { x: 0, y: 0 }, cost);
}

/** Vacía la frontera y devuelve las claves en el orden en que salieron. */
function vaciar(f: Frontera): string[] {
  const salida: string[] = [];
  while (f.size > 0) salida.push((f.pop() as { key: string }).key);
  return salida;
}

describe('la frontera del Dijkstra del mapa', () => {
  it('extrae en coste ascendente', () => {
    const f = new Frontera();
    for (const [k, c] of [
      ['d', 400],
      ['a', 100],
      ['c', 300],
      ['e', 500],
      ['b', 200],
    ] as const) {
      empuja(f, k, c);
    }
    expect(f.size).toBe(5);
    expect(vaciar(f)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(f.pop()).toBeUndefined();
  });

  it('a igual coste, en orden de primer descubrimiento', () => {
    // Empujados al revés del orden alfabético a propósito: si el desempate
    // fuera por clave, o por la forma del montículo, esto no saldría igual.
    const f = new Frontera();
    for (const k of ['z', 'y', 'x', 'w', 'v', 'u']) empuja(f, k, 100);
    expect(vaciar(f)).toEqual(['z', 'y', 'x', 'w', 'v', 'u']);
  });

  it('una clave re-empujada más barata conserva su orden original', () => {
    // Aquí es donde se rompe todo. `a` se descubre primero, con un coste malo;
    // `b` se descubre después. Luego `a` mejora hasta empatar con `b`: tiene
    // que salir ANTES, porque se descubrió antes. Si la re-inserción le diera
    // un número de orden nuevo, `a` empataría por detrás de `b` y el camino
    // cambiaría — con él, la partida.
    const f = new Frontera();
    empuja(f, 'a', 900);
    empuja(f, 'b', 100);
    empuja(f, 'a', 100);

    // El primero es la entrada buena de `a`; el rancio de 900 sale al final y
    // lo descarta el llamante comparando con el coste que tiene apuntado.
    expect(vaciar(f)).toEqual(['a', 'b', 'a']);
  });
});

/**
 * Cuatro por cuatro de hierba con **una** casilla de arena en (1,1).
 *
 * La arena cuesta 200 y la hierba 100, así que el atajo diagonal deja de serlo
 * y a (2,2) se llega por 340 de dos maneras exactamente igual de caras: por
 * arriba —(1,0), (2,1)— o por abajo —(0,1), (1,2)—. Quién gane ese empate es
 * justo lo que decide el desempate de la frontera, y por eso este mapa está
 * elegido a mano: en un mapa uniforme el empate es simétrico y sale igual con
 * el comparador roto.
 */
function mapaDelEmpate(): ReturnType<typeof createEmptyMap> {
  const map = createEmptyMap(4, 4, 'grass');
  map.terrain[1 * 4 + 1] = 'sand';
  return map;
}

describe('los dos Dijkstra que usan la frontera', () => {
  it('findPath elige, entre dos rutas igual de caras, la del primer descubierto', () => {
    // Golden tomado del código de ANTES del montículo, con el `Set`.
    expect(findPath(mapaDelEmpate(), { x: 0, y: 0 }, { x: 2, y: 2 })).toEqual([
      { at: { x: 1, y: 0 }, cost: 100 },
      { at: { x: 2, y: 1 }, cost: 240 },
      { at: { x: 2, y: 2 }, cost: 340 },
    ]);
  });

  it('reachableFrom asienta las casillas en el orden de siempre', () => {
    // El orden de inserción del `Map` de costes ES el orden de descubrimiento,
    // y de él cuelgan tres sitios de `test/agent-link.test.ts` que ordenan con
    // `Array.sort`, que es estable. Golden del código de ANTES del montículo.
    const { costs, prev } = reachableFrom(mapaDelEmpate(), { x: 0, y: 0 }, Infinity);
    expect([...costs.keys()]).toEqual([
      '0,0',
      '1,0',
      '0,1',
      '1,1',
      '2,0',
      '2,1',
      '0,2',
      '1,2',
      '3,0',
      '3,1',
      '0,3',
      '1,3',
      '2,2',
      '3,2',
      '2,3',
      '3,3',
    ]);
    // Y el predecesor de la casilla empatada, que es lo que decide el camino.
    expect(prev.get('2,2')).toEqual({ x: 2, y: 1 });
  });
});
