/**
 * Entre test y test, una vuelta al bucle de eventos del worker (#194).
 *
 * El worker de vitest manda el progreso al proceso principal por RPC
 * (`onTaskUpdate`) y espera la respuesta con un temporizador de 60 s. Si los
 * tests de un fichero son síncronos, entre uno y otro el runner solo encadena
 * microtareas: el bucle no llega a leer la respuesta hasta que acaba el
 * fichero, y entonces el temporizador —que va antes en la vuelta— ya ha
 * saltado. `pnpm verify:lento` salía 1, con todo en verde, en cuanto
 * `regiones.test.ts` pasaba de 60 s con la máquina cargada. Reproducido con
 * 14 tests de 5 s sin nada más: sale 1; con esta vuelta, 0.
 *
 * El `setImmediate` se guarda al cargar: un test con temporizadores falsos no
 * debe dejar colgado el `afterEach` de todos.
 */
import { afterEach } from 'vitest';

const { setImmediate: ceder } = globalThis;

afterEach(() => new Promise<void>((seguir) => ceder(seguir)));
