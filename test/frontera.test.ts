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
 * Los cinco primeros tests miran la estructura; los de abajo miran al Dijkstra
 * que la usa —uno solo desde #77, con dos puertas: `findPath` y
 * `reachableFrom`—, porque una cola que ordena bien y un Dijkstra que la usa
 * mal darían verde por separado.
 */
import { describe, expect, it } from 'vitest';
import { Frontera } from '../src/core/map/frontera.js';
import { createEmptyMap, findPath, pointKey, reachableFrom } from '../src/core/map/map.js';

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

/**
 * Vacía la frontera y devuelve las claves en el orden en que salieron.
 *
 * Se pregunta con el propio `pop()` y no con un `size > 0`: la frontera vacía y
 * el nodo extraído son la misma pregunta, y hacerla dos veces era lo que
 * obligaba a un `as` sin comprobar aquí y en el Dijkstra de `map.ts`.
 */
function vaciar(f: Frontera): string[] {
  const salida: string[] = [];
  for (let n = f.pop(); n !== undefined; n = f.pop()) salida.push(n.key);
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

  it('se niega a servir a una segunda búsqueda', () => {
    // «Una instancia por búsqueda» estuvo escrito arriba SOLO como prosa, y no
    // aguantó: izar la instancia a nivel de módulo con un `reiniciar()` pasaba
    // los 247 tests en verde y cambiaba el sha256 del volcado de 200 semillas.
    // Reusar la frontera es empezar la búsqueda nueva empujando el origen por
    // 0 con la vieja ya asentada por encima, así que basta con mirar el coste.
    const f = new Frontera();
    empuja(f, 'origen', 0);
    f.pop();
    empuja(f, 'lejos', 500);
    f.pop();

    expect(() => empuja(f, 'otro-origen', 0)).toThrow(
      'una frontera es de una sola búsqueda: otro-origen entra por 0 y ya salió 500',
    );
  });

  it('se niega a que le empujen una casilla ya asentada', () => {
    // La propina del mismo guardia: con `<` estricto para empujar, una casilla
    // que ya salió no puede volver más barata. Si vuelve, o el coste del paso
    // es cero o alguien se saltó el `if (nuevo < coste)`, y las dos cosas
    // descuadran el desempate en silencio.
    const f = new Frontera();
    empuja(f, 'a', 100);
    empuja(f, 'b', 300);
    f.pop();

    expect(() => empuja(f, 'a', 50)).toThrow(/entra por 50 y ya salió 100/);
    // Empatar con el último extraído sigue siendo legal: dos hermanos a 100.
    expect(() => empuja(f, 'c', 100)).not.toThrow();
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

describe('el Dijkstra que usa la frontera, por sus dos puertas', () => {
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
    const { costs, prev } = reachableFrom(mapaDelEmpate(), { x: 0, y: 0 });
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

  it('una casilla bloqueada se asienta pero no se expande, y por ahí no pasa ningún camino', () => {
    // La regla que decidió el merge de los dos Dijkstra (#77): manda la de
    // `reachableFrom` —asentar sin expandir— y no la de `findPath`, que las
    // saltaba. Los dos goldens de arriba NO pueden verla: su mapa no tiene un
    // solo objeto, así que no hay ninguna casilla bloqueada que asentar. Se
    // comprobó a mano haciendo el merge al revés: aquellos dos siguen verdes.
    const map = mapaDelEmpate();
    map.objects.push({
      kind: 'monster',
      id: 'guardia',
      at: { x: 1, y: 0 },
      creature: 'peasant',
      count: 1,
      defeated: false,
    });
    const desde = { x: 0, y: 0 };
    const { costs, prev } = reachableFrom(map, desde);

    // Se llega a ella, con su coste de entrada: es como se ataca a un monstruo
    // o se toma una mina.
    expect(costs.get('1,0')).toBe(100);
    expect(findPath(map, desde, { x: 1, y: 0 })).toEqual([{ at: { x: 1, y: 0 }, cost: 100 }]);
    // Pero no se sale de ella: nadie la tiene por predecesor.
    expect([...prev.values()].map(pointKey)).not.toContain('1,0');

    // Y el camino al empate de (2,2) ya no puede subir por (1,0): la ruta de
    // arriba está cortada, así que gana la de abajo con su mismo coste de 340.
    expect(findPath(map, desde, { x: 2, y: 2 })).toEqual([
      { at: { x: 0, y: 1 }, cost: 100 },
      { at: { x: 1, y: 2 }, cost: 240 },
      { at: { x: 2, y: 2 }, cost: 340 },
    ]);
  });

  it('una frontera agotada se niega a servir a otra búsqueda, aunque los costes cuadren', () => {
    // El agujero que dejó abierto el primer guardia, encontrado por QA: si la
    // búsqueda anterior se agota extrayendo coste 0 —un origen sin salidas, que
    // es lo que da un pueblo rodeado de agua en `map_generate`—, entonces el
    // coste del último `pop` es 0, la siguiente empuja su origen por 0, y
    // `0 < 0` es falso. La segunda heredaba el `orden` de la primera y el empate
    // se resolvía al revés EN SILENCIO.
    const f = new Frontera();
    f.push('0,0', { x: 0, y: 0 }, 0);
    expect(f.pop()?.key).toBe('0,0');
    expect(f.pop()).toBeUndefined(); // la búsqueda termina aquí

    expect(() => f.push('9,9', { x: 9, y: 9 }, 0)).toThrow(/una sola búsqueda/);
  });

  it('el guardia del coste sigue cazando a quien empuja una casilla ya asentada', () => {
    const f = new Frontera();
    f.push('0,0', { x: 0, y: 0 }, 0);
    f.push('1,0', { x: 1, y: 0 }, 100);
    expect(f.pop()?.key).toBe('0,0');
    expect(f.pop()?.key).toBe('1,0');

    // Sin agotarla: la frontera sigue viva, pero 50 ya no puede salir.
    expect(() => f.push('2,0', { x: 2, y: 0 }, 50)).toThrow(/ya salió 100/);
  });
});
