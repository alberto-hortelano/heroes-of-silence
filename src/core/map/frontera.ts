/**
 * La cola de prioridad del Dijkstra del mapa.
 *
 * Antes era un `Set<string>` recorrido entero en cada extracción. Sin tope de
 * coste, `reachableFrom` asienta el mapa 24×24 ENTERO —576 casillas— con una
 * frontera media de 42: cuarenta y cinco millones de comparaciones en cuarenta
 * partidas para sacar el mínimo.
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
 * Lo que sí muerde son los guardias de `push`, aquí abajo — y hicieron falta los
 * dos: el primero, por sí solo, no veía la reutilización cuando la búsqueda
 * anterior se agotaba en el origen. Lo encontró QA. El tercero es de otra clase
 * y llegó con el índice plano: ver abajo.
 *
 * ## La clave es un índice plano, no una cadena
 *
 * `y * anchura + x`, el mismo que ya usa `GameMap.terrain`. Antes era `"x,y"`:
 * cada `push` construía una cadena, cada `Map` la hasheaba y el `Point` tenía
 * que viajar dentro del nodo porque reconstruirlo desde la clave costaba
 * partirla por la coma. Con un índice no hay nada que construir ni que
 * reconstruir — de la coordenada se vuelve con un `%` y una división—, así que
 * `NodoFrontera` ya no lleva `at`: en la búsqueda plana nadie construye un
 * `Point`.
 *
 * `core` sigue puro: aquí dentro solo hay aritmética.
 */

/** Lo que sale de la frontera: el índice de una casilla y lo que costó llegar. */
export interface NodoFrontera {
  readonly key: number;
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
  /** Orden de primer descubrimiento por índice de casilla; −1 = sin ver. */
  private readonly ordenes: Int32Array;
  /** El siguiente número a repartir. Antes era `ordenes.size`, que ya no existe. */
  private siguienteOrden = 0;
  private readonly capacidad: number;
  /**
   * Coste de la última extracción. Caza al que empuja una casilla ya asentada.
   *
   * En un Dijkstra los costes salen en orden no decreciente: cada `push` lo
   * hace un nodo recién extraído sumándole un paso, y ningún paso del mapa
   * cuesta cero. Así que empujar POR DEBAJO del último extraído no puede pasar
   * en una búsqueda sana.
   */
  private ultimoPop = Number.NEGATIVE_INFINITY;

  /**
   * El guardia de «una instancia por búsqueda», y **este es el que lo cierra**.
   *
   * `ultimoPop` solo no bastaba, y el agujero lo encontró QA: si la búsqueda
   * anterior terminó extrayendo coste 0 —un origen sin salidas, que es lo que da
   * un `map_generate` con un pueblo rodeado de agua—, entonces `ultimoPop` vale
   * 0, la siguiente búsqueda empuja su origen por 0, y **`0 < 0` es falso**. La
   * segunda heredaba el `orden` de la primera y el empate se resolvía al revés,
   * en silencio: exactamente lo que el guardia existe para impedir.
   *
   * Esto no depende de ningún coste. Una búsqueda sana llama a `pop()` hasta que
   * devuelve `undefined` —una vez, al final— y no vuelve a empujar; el bucle de
   * su único llamante es literalmente eso. Así que un `push` después de esa
   * llamada **es** una segunda búsqueda, cueste lo que cueste.
   */
  private agotada = false;

  /**
   * `capacidad` son las casillas del mapa: las claves válidas van de 0 a
   * `capacidad - 1`.
   */
  constructor(capacidad: number) {
    this.capacidad = capacidad;
    this.ordenes = new Int32Array(capacidad).fill(-1);
  }

  push(key: number, cost: number): void {
    // Fail-loud en vez de prosa, por las tres puertas: reutilizar la instancia,
    // empujar una casilla ya asentada, y un índice fuera del mapa.
    if (this.agotada) {
      throw new Error(
        `una frontera es de una sola búsqueda: ${key} entra después de que se agotara`,
      );
    }
    if (cost < this.ultimoPop) {
      throw new Error(
        `una frontera es de una sola búsqueda: ${key} entra por ${cost} y ya salió ${this.ultimoPop}`,
      );
    }
    // El tercero, y nació con el índice plano: un `Map` no podía guardar mal una
    // clave, pero un `Int32Array` **tira en silencio** una escritura fuera de
    // rango y devuelve `undefined` en la lectura. Un índice mal calculado
    // dejaría a esa casilla sin número de orden y rompería el desempate sin
    // decir nada — que es exactamente lo que los otros dos existen para impedir.
    if (!Number.isInteger(key) || key < 0 || key >= this.capacidad) {
      throw new Error(
        `la frontera va de 0 a ${this.capacidad - 1} y le entra ${key}: ` +
          'un índice fuera de rango se perdería en silencio',
      );
    }

    let orden = this.ordenes[key] as number;
    if (orden === -1) {
      orden = this.siguienteOrden++;
      this.ordenes[key] = orden;
    }

    const m = this.monticulo;
    const nodo: Nodo = { key, cost, orden };
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
    if (cima === undefined) {
      this.agotada = true;
      return undefined;
    }
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
