/**
 * La entrada de la página: si la URL no pide partida, pregunta cuál (la pantalla
 * de inicio, `inicio/inicio.ts`); luego carga `main.ts`. Con `?seed=`, `?faccion=`
 * o `?heroe=` va directa a `main.ts`, sin cargar el menú; con `?mundo=`, carga antes
 * ese mundo. Si algo no carga, lo dice (`arranque.ts`).
 */
import { arrancar } from './arranque.js';
import { hayQuePreguntar, pideMundo } from './semilla.js';

arrancar(async () => {
  if (hayQuePreguntar(location.search)) {
    const { pedirPartida } = await import('./inicio/inicio.js');
    await pedirPartida();
  }
  // Un mundo (`?mundo=`) se carga y se valida antes que la partida: `main.ts` lo
  // lee ya hecho, y uno roto lo pinta `arranque.ts` con todos sus problemas.
  if (pideMundo(location.search)) {
    const { cargarElMundoPedido } = await import('./mundo/cargar.js');
    await cargarElMundoPedido(location.search);
  }
  await import('./main.js');
});
