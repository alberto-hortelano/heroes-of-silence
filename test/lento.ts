/**
 * El bucle rápido y la orden lenta (#167).
 *
 * `pnpm verify` lo pasa cada agente varias veces por tarea, y había subido a
 * ~64 s por los guardias que se miden sobre muchas semillas o sobre todo el arte
 * del repo. Cada uno de esos guardias corre en `pnpm verify` con unas pocas
 * semillas —las justas para que muerda— y con todas en `pnpm verify:lento`
 * (`HEROES_LENTO=1`), que corre en CI. Lo que solo tiene sentido como medida
 * (una cuenta exacta sobre diez semillas, una mediana) va con `itLento` y en el
 * bucle rápido sale como saltado: se ve que existe y dónde corre.
 *
 * El criterio de qué es lento, en `CLAUDE.md` («Control de calidad», «Bucle rápido y
 * orden lenta»).
 */
import { it } from 'vitest';

function leerLento(valor: string | undefined): boolean {
  if (valor === undefined || valor === '' || valor === '0') return false;
  if (valor === '1') return true;
  // Un `HEROES_LENTO=si` que se leyera como «rápido» daría un verde que no
  // midió lo que quien lo lanzó creía.
  throw new Error(
    `HEROES_LENTO=${valor} no se entiende: vale 1 (la orden lenta, \`pnpm verify:lento\`) o nada (el bucle rápido)`,
  );
}

/** Si corre la orden lenta: todas las semillas y todo el arte. */
export const LENTO = leerLento(process.env.HEROES_LENTO);

/** `rapido` en `pnpm verify`, `lento` en `pnpm verify:lento`. */
export const segunPrisa = <T>(rapido: T, lento: T): T => (LENTO ? lento : rapido);

/** Las semillas de `desde` a `hasta`, las dos incluidas. */
export const rango = (desde: number, hasta: number): number[] =>
  Array.from({ length: hasta - desde + 1 }, (_, k) => desde + k);

/** Un test que solo corre en la orden lenta: una medida, no un guardia que muerda con una semilla. */
export const itLento = it.runIf(LENTO);

/*
 * Soltar el hilo dentro de un test largo (07-11-2026).
 *
 * El trabajador de vitest le cuenta al proceso principal cómo van los tests por
 * RPC (`onTaskUpdate`) y espera cada respuesta 60 s, un tope que no se
 * configura (`DEFAULT_TIMEOUT = 6e4`, el de birpc en vitest 3.2.7). La
 * respuesta llega en milisegundos, pero el trabajador solo la lee cuando su
 * bucle de eventos da la vuelta: un test que tiene el hilo más de 60 s seguidos
 * hace saltar antes el temporizador, y la orden sale 1 con todo en verde
 * («Timeout calling "onTaskUpdate"»). Entre test y test ya se da esa vuelta
 * (`ceder.ts`); dentro de uno, la dan `respirar` y `conRespiro`.
 *
 * El 07-11-2026 la orden lenta del CI pasó los 195 ficheros y los 5 695 tests y
 * salió 1 así: veinte tests de semillas tenían el hilo de 25 a 76 s seguidos
 * (aquí, de 5 a 17,5 s: el CI va unas 4,4 veces más lento). Aquí, un test que
 * tiene el hilo 65 s pasa y la orden sale 1 igual; con `conRespiro`, sale 0. La
 * recogida (el import y los cuerpos de `describe`) no lo necesita: entonces no
 * hay ninguna llamada con temporizador en vuelo, y una de 65 s sale 0.
 */

// Guardados al cargar, como en `ceder.ts`: un test con temporizadores falsos no
// deja sin respiro a los demás.
const { setImmediate: ceder } = globalThis;
const ahora = performance.now.bind(performance);

/**
 * Cada cuánto, como mucho, suelta el hilo `conRespiro`: un cuarto de segundo,
 * más lo que tarde el elemento con que se pasa, que no se puede partir. Va por
 * tiempo y no por elementos porque el tope es de tiempo: un «cada 50 semillas»
 * se estira solo cuando el mapa se encarece (con #224, de 36 a 55 ms) o la
 * máquina va cargada.
 */
const RESPIRO_MS = 250;
let ultimoRespiro = ahora();

/** Una vuelta entera al bucle de eventos del trabajador: lo que le haya contestado vitest se lee en ella. */
async function respirar(): Promise<void> {
  await new Promise<void>((seguir) => ceder(seguir));
  ultimoRespiro = ahora();
}

/**
 * Los elementos de `lista`, los mismos y en el mismo orden, soltando el hilo
 * (`respirar`) en cuanto lleva `RESPIRO_MS` sin soltarlo: el bucle de semillas
 * de un test largo, con `for await`. Un `await` de algo ya resuelto o un
 * `Promise.all` de trabajo síncrono no sueltan nada: siguen en el mismo hilo.
 */
export async function* conRespiro<T>(lista: Iterable<T>): AsyncGenerator<T> {
  for (const x of lista) {
    if (ahora() - ultimoRespiro >= RESPIRO_MS) await respirar();
    yield x;
  }
}
