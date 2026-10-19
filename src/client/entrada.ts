/**
 * La entrada de la página: si la URL no pide partida, pregunta cuál (la pantalla
 * de inicio, `inicio/inicio.ts`); luego carga `main.ts`. Con `?seed=` o
 * `?faccion=` va directa a `main.ts`, sin cargar el menú. Si algo no carga, lo
 * dice (`arranque.ts`).
 */
import { arrancar } from './arranque.js';
import { hayQuePreguntar } from './semilla.js';

arrancar(async () => {
  if (hayQuePreguntar(location.search)) {
    const { pedirPartida } = await import('./inicio/inicio.js');
    await pedirPartida();
  }
  await import('./main.js');
});
