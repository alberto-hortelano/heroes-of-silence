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
  // El banco de figuras de NPC, a la vez que el mundo: este lo espera solo para
  // validarse (las figuras que nombra), después de pedir sus ficheros. Uno roto lo
  // pinta `arranque.ts`, como un mundo roto con todos sus problemas. `main.ts` lee
  // los dos ya hechos (`genteCargada`, `mundoPedido`) al abrir la partida, que es al
  // cargarse: por eso va después.
  const gente = import('./render/gente.js').then((g) => g.cargarLaGente());
  await Promise.all([
    gente,
    pideMundo(location.search) &&
      import('./mundo/cargar.js').then((m) => m.cargarElMundoPedido(location.search, gente)),
  ]);
  await import('./main.js');
});
