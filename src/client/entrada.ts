/**
 * La entrada de la página: si la URL no pide partida, pregunta cuál (la pantalla
 * de inicio, `inicio/inicio.ts`); luego carga `main.ts`. Si algo no carga, lo
 * dice (`arranque.ts`).
 */
import { arrancar } from './arranque.js';

arrancar(async () => {
  const { pedirPartida } = await import('./inicio/inicio.js');
  await pedirPartida();
  await import('./main.js');
});
