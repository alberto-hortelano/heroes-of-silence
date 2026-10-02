/**
 * La semilla de una partida o una pelea que nadie ha pedido: la de hoy a esta
 * hora. Una sola, para la partida (`main.ts`) y la arena (`arena/main.ts`): si
 * cambia cómo se sortea, cambia en las dos. Vive en el cliente y no en `core`
 * porque lee el reloj, y el núcleo no puede.
 */
export function semillaSorteada(): number {
  return Date.now() % 100000;
}
