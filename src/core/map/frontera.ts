/**
 * La cola de prioridad de los dos Dijkstra del mapa.
 *
 * Antes era un `Set<string>` recorrido entero en cada extracción. Con
 * `Infinity` de tope, `reachableFrom` asienta el mapa 24×24 ENTERO —576
 * casillas— con una frontera media de 42: cuarenta y cinco millones de
 * comparaciones en cuarenta partidas para sacar el mínimo.
 *
 * ## El desempate ES el contrato, y romperlo cambia las partidas
 *
 * El barrido lineal usaba `<` estricto sobre un `Set`, así que entre costes
 * empatados ganaba el primero insertado — y como `Set.add` sobre un miembro que
 * ya está no lo reordena y una casilla cerrada nunca vuelve, eso era **el
 * primero descubierto**. Un montículo corriente rompe ese empate por la forma
 * del árbol: cambia el predecesor, cambia el camino entre dos rutas igual de
 * baratas, y cambia la partida. Medido: 5817 líneas de registro en vez de 5851.
 *
 * Por eso el comparador es fijo y no inyectable —`coste, y a igualdad de coste
 * el orden de primer descubrimiento`—, y por eso **ese orden lo lleva la clase
 * por dentro**: `push` no lo recibe. La primera vez que ve una clave le asigna
 * el siguiente número y **lo reutiliza en las re-inserciones**. Ahí está el
 * punto exacto donde se rompe todo: si una mejora de coste recibiera un número
 * nuevo, el nodo empataría por DETRÁS de casillas descubiertas después de él y
 * el camino cambiaría. Al no ser un parámetro, nadie de fuera lo puede pasar
 * mal; romperlo exige editar este fichero, que es donde muerden sus tests.
 *
 * ## Borrado perezoso
 *
 * No hay *decrease-key*: una mejora empuja un nodo nuevo y el llamante descarta
 * el rancio al extraerlo comparando con el coste que tiene apuntado. Como solo
 * se empuja con `<` estricto, dos entradas vivas de la misma clave nunca
 * empatan en coste, así que el orden total es estricto y la extracción no
 * depende de la forma del montículo ni siquiera entre entradas hermanas.
 *
 * **Una instancia por búsqueda**, nunca a nivel de módulo: el mapa de órdenes
 * es estado, y compartirlo entre dos búsquedas cambiaría el desempate de la
 * segunda. Eso estuvo escrito aquí **solo como prosa** y no se sostenía: la
 * rotura natural de un ciclo de rendimiento —«no alojar un montículo por
 * búsqueda»: un `reiniciar()` y la instancia izada en `map.ts`— pasaba los 247
 * tests y `pnpm verify` en verde y cambiaba las partidas en silencio (28 300 →
 * 28 278 líneas de volcado, otro sha256). Y no vale un test: se probaron tres
 * —repetir una búsqueda, repetirla acotada, un golden precedido de otra
 * búsqueda— y ninguno muerde, porque `orden` no se reasigna nunca y la
 * contaminación no aparece al repetir una búsqueda sino en la **siguiente**.
 * Lo que sí muerde es `ultimoPop`, aquí abajo.
 *
 * `core` sigue puro: aquí dentro solo hay aritmética.
 */
import type { Point } from '../types.js';

/**
 * Lo que sale de la frontera: una casilla —su clave Y su punto— y lo que costó
 * llegar a ella.
 *
 * El `Point` viaja aquí dentro porque quien empuja YA lo tiene en la mano: sale
 * de `neighbours`, que lo acaba de construir. Sin él, los dos Dijkstra volvían
 * a partir la clave por la coma y a convertir dos trozos a número en cada
 * extracción — el 12,8 % del perfil del barrido, gastado en reconstruir algo
 * que se había tirado tres líneas antes.
 */
export interface NodoFrontera {
  readonly key: string;
  readonly at: Point;
  readonly cost: number;
}

interface Nodo extends NodoFrontera {
  /** Orden de primer descubrimiento. Lo asigna la clase, no el llamante. */
  readonly orden: number;
}

/**
 * Menor que cero si `a` sale antes que `b`.
 *
 * El segundo término no es un adorno de determinismo: es la regla del párrafo
 * de arriba. Quitarlo pone en rojo `test/frontera.test.ts` y cambia el sha256
 * del volcado de 200 semillas.
 */
function compara(a: Nodo, b: Nodo): number {
  return a.cost - b.cost || a.orden - b.orden;
}

export class Frontera {
  /** Montículo binario en un array: los hijos de `i` están en `2i+1` y `2i+2`. */
  private readonly monticulo: Nodo[] = [];
  private readonly ordenes = new Map<string, number>();
  /**
   * Coste de la última extracción, y el guardia de «una instancia por
   * búsqueda».
   *
   * En un Dijkstra los costes salen en orden no decreciente: cada `push` lo
   * hace un nodo recién extraído sumándole un paso, y ningún paso del mapa
   * cuesta cero. Así que empujar POR DEBAJO del último extraído no puede pasar
   * en una búsqueda sana, y sí pasa —en el primer `push`, con coste 0— en
   * cuanto una frontera sirve a una segunda búsqueda.
   */
  private ultimoPop = Number.NEGATIVE_INFINITY;

  get size(): number {
    return this.monticulo.length;
  }

  push(key: string, at: Point, cost: number): void {
    // Fail-loud en vez de prosa. De propina caza al que empuje una casilla ya
    // asentada, que es la otra forma de descuadrar el desempate.
    if (cost < this.ultimoPop) {
      throw new Error(
        `una frontera es de una sola búsqueda: ${key} entra por ${cost} y ya salió ${this.ultimoPop}`,
      );
    }

    let orden = this.ordenes.get(key);
    if (orden === undefined) {
      orden = this.ordenes.size;
      this.ordenes.set(key, orden);
    }

    const m = this.monticulo;
    const nodo: Nodo = { key, at, cost, orden };
    let i = m.length;
    m.push(nodo);
    while (i > 0) {
      const padre = (i - 1) >> 1;
      const arriba = m[padre] as Nodo;
      if (compara(nodo, arriba) >= 0) break;
      m[i] = arriba;
      i = padre;
    }
    m[i] = nodo;
  }

  pop(): NodoFrontera | undefined {
    const m = this.monticulo;
    const cima = m[0];
    if (cima === undefined) return undefined;
    this.ultimoPop = cima.cost;

    const ultimo = m.pop() as Nodo;
    if (m.length > 0) {
      let i = 0;
      for (;;) {
        const izq = 2 * i + 1;
        if (izq >= m.length) break;
        const der = izq + 1;
        const hijo = der < m.length && compara(m[der] as Nodo, m[izq] as Nodo) < 0 ? der : izq;
        const abajo = m[hijo] as Nodo;
        if (compara(abajo, ultimo) >= 0) break;
        m[i] = abajo;
        i = hijo;
      }
      m[i] = ultimo;
    }
    return cima;
  }
}
