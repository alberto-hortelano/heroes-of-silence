/**
 * La semilla y la barra de direcciones, sin nada del núcleo: lo lee también
 * `entrada.ts` antes de decidir si carga el menú o la partida, y lo que se
 * importa ahí se paga antes de pintar nada.
 */

/**
 * La semilla de una partida o una pelea que nadie ha pedido: la de hoy a esta
 * hora. Una sola, para la partida (`main.ts`), el menú (`inicio/inicio.ts`) y la
 * arena (`arena/main.ts`): si cambia cómo se sortea, cambia en todas. Vive en el
 * cliente y no en `core` porque lee el reloj, y el núcleo no puede.
 */
export function semillaSorteada(): number {
  return Date.now() % 100000;
}

/**
 * Cambia la URL de la barra sin navegar: sobre la de ahora, que conserva lo
 * demás de la query y el fragmento (escribir `?seed=N` a pelo los sustituía).
 * El único `replaceState` de una URL cambiada: el menú, la partida y la arena.
 */
export function aLaBarra(cambiar: (url: URL) => void): void {
  const url = new URL(location.href);
  cambiar(url);
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

/**
 * Si la página tiene que preguntar qué jugar: solo cuando la URL no pide nada,
 * ni semilla, ni facción, ni héroe, ni mundo. `?seed=` vacío es no pedir (la regla de `parseSeed`), y
 * lo que pida algo, aunque no valga, va a la partida, que dice por qué no vale.
 */
export function hayQuePreguntar(search: string): boolean {
  return (
    !pide(search, 'seed') &&
    !pide(search, 'faccion') &&
    !pide(search, 'heroe') &&
    !pideMundo(search)
  );
}

/** Si la URL pide algo en `nombre` (vacío es no pedir): la regla de `hayQuePreguntar` y de `?mundo=`. */
export function pide(search: string, nombre: string): boolean {
  return new URLSearchParams(search).getAll(nombre).some((v) => v.trim() !== '');
}

/**
 * Si la URL pide un mundo (`?mundo=<id>`, F1a del mapa vivo): entonces `entrada.ts`
 * lo carga antes que la partida (`mundo/cargar.ts`), que dice por qué si no vale.
 */
export function pideMundo(search: string): boolean {
  return pide(search, 'mundo');
}
