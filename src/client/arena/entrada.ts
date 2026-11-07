/** La entrada de la página: carga `main.ts` y, si no carga, lo dice (`arranque.ts`). */
import { arrancar } from '../comun/arranque.js';

arrancar(() => import('./main.js'));
