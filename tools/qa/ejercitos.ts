/**
 * Las poblaciones de batalla de las medidas de `tools/qa/`: las de
 * `enfrentamiento.ts` (stacks y, con `--magia`, tropa) y las de `asiento.ts`,
 * que mide el asiento con los mismos ejércitos. Un sitio, para que «la
 * población de enfrentamiento» quiera decir lo mismo en las dos.
 */
import { unidadesDeFaccion } from '../../src/core/catalogo.js';
import type { Rng } from '../../src/core/rng.js';
import type { FactionId, Stack } from '../../src/core/types.js';

/** Efectivos por stack. Ancho a propósito: un banco de batallas clavadas no mide. */
const EFECTIVOS = [5, 25] as const;

/**
 * Cinco stacks sacados del catálogo de la facción. Siguen siendo stacks de N y
 * no individuos a propósito: este banco mide la TÁCTICA sobre el motor, y sus
 * cifras de referencia están tomadas con estos ejércitos.
 */
export function ejercitoDe(faction: FactionId, rng: Rng): Stack[] {
  const lineup = unidadesDeFaccion(faction);
  return Array.from({ length: 5 }, () => ({
    creature: rng.pick(lineup).id,
    count: rng.int(EFECTIVOS[0], EFECTIVOS[1]),
  }));
}

/**
 * Con `--magia`, la tropa de una partida: individuos (`troopsAsStacks`, un
 * stack de 1 por cabeza), de 3 a 6 —con el héroe, los 7 que caben en un bando
 * (`createBattle`)—, sacados al azar de las unidades de la facción (con caballeros
 * y nigromantes, de los niveles 1 a 4: muestreada turno a turno en 30 semillas,
 * 08-10-2026, 5 399 de 5 448 individuos eran de nivel 1 a 4 y el tamaño más común
 * es 6; las del catálogo de las cinco facciones van del nivel 2 al 4).
 *
 * Con stacks de 5 a 25 una Flecha de 20 PV no se nota y una Prisa vale lo que
 * pegan veinte; en partida es al revés, y la cifra de un hechizo medida con
 * aquellos ejércitos no diría nada de su efecto en una partida.
 */
export function tropaDe(faction: FactionId, rng: Rng): Stack[] {
  const lineup = unidadesDeFaccion(faction);
  return Array.from({ length: rng.int(3, 6) }, () => ({ creature: rng.pick(lineup).id, count: 1 }));
}
