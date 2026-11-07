/**
 * El bucle de dibujo de las tres páginas —la partida, la arena y el espectador—: pedir un
 * fotograma solo si no hay ya uno pedido, y pintarlo con red (R4 de la reorganización,
 * 07-11-2026; hasta entonces cada página llevaba su copia de las dos cosas).
 *
 * Ninguna pinta a cada fotograma porque sí: piden uno cuando algo pasa —un gesto, lo que
 * llega por el cable, arte que se carga, un cambio de tamaño— y, tras pintarlo, otro solo
 * si algo se sigue moviendo, que es lo que devuelve su `pintar`. Antes era un
 * `requestAnimationFrame` perpetuo que lo rehacía todo, paneles incluidos.
 *
 * La red: lo que se pinta lleva funciones que lanzan (`pintar`, `srcDeImagen`,
 * `fondoDeColor`…), y con el `requestAnimationFrame` en la última línea una sola excepción
 * mataba el bucle y la pantalla se quedaba congelada sin decir nada. Aquí el fallo no se
 * traga ni corta el bucle: lo recibe la página (`alFallar`), que lo dice y decide si pide
 * otro fotograma. Cada una a su manera, y a propósito: la partida lo escribe en la barra y
 * sigue si algo se mueve; la arena lo escribe y espera al siguiente gesto; el espectador lo
 * dice una sola vez y espera a lo siguiente que llegue por el cable.
 */

/** Lo que una página pone en su bucle de dibujo. */
export interface DibujoDeLaPagina {
  /** Pinta el fotograma de `ahora` y dice si hay que pedir otro: algo se sigue moviendo. */
  readonly pintar: (ahora: number) => boolean;
  /**
   * Lo que hace la página cuando `pintar` lanza: decirlo a su manera (la barra, la consola)
   * y si se pide otro fotograma.
   */
  readonly alFallar: (motivo: unknown) => boolean;
}

/**
 * El bucle de dibujo de una página: devuelve con qué se pide un fotograma, que no pide otro
 * si ya hay uno pedido. El fotograma pinta con `pintar` y, si lanza, se lo da a `alFallar`;
 * lo que devuelva cualquiera de los dos dice si se pide el siguiente.
 */
export function bucleDeDibujo(pagina: DibujoDeLaPagina): () => void {
  let pedido = false;
  const fotograma = (ahora: number): void => {
    pedido = false;
    let otro: boolean;
    try {
      otro = pagina.pintar(ahora);
    } catch (motivo) {
      otro = pagina.alFallar(motivo);
    }
    if (otro) pedir();
  };
  const pedir = (): void => {
    if (pedido) return;
    pedido = true;
    requestAnimationFrame(fotograma);
  };
  return pedir;
}
