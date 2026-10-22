/**
 * La entrada de la página: si la URL no pide partida, pregunta cuál (la pantalla
 * de inicio, `inicio/inicio.ts`); luego carga `main.ts`. Con `?seed=`, `?faccion=`
 * o `?heroe=` va directa a `main.ts`, sin cargar el menú; antes, el banco de figuras
 * de NPC (`render/gente.ts`) y, con `?mundo=`, ese mundo. Si algo no carga, lo dice (`arranque.ts`).
 */
import { arrancar } from './arranque.js';
import { hayQuePreguntar, pideMundo } from './semilla.js';

arrancar(async () => {
  if (hayQuePreguntar(location.search)) {
    const { pedirPartida } = await import('./inicio/inicio.js');
    await pedirPartida();
  }
  // El banco de figuras de NPC, antes que el mundo (que lo mira al validarse) y que
  // la partida (que reparte sus figuras a la gente): uno roto lo pinta `arranque.ts`.
  const { cargarLaGente } = await import('./render/gente.js');
  await cargarLaGente();
  // Un mundo (`?mundo=`) se carga y se valida antes que la partida: `main.ts` lo
  // lee ya hecho, y uno roto lo pinta `arranque.ts` con todos sus problemas.
  if (pideMundo(location.search)) {
    const { cargarElMundoPedido } = await import('./mundo/cargar.js');
    await cargarElMundoPedido(location.search);
  }
  await import('./main.js');
});
