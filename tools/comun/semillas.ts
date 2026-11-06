/**
 * Buscar un caso por semillas en vez de escribir su semilla a mano: cada cambio
 * del generador se llevaba las semillas escritas (de `test/helpers.ts`, fase T de
 * la reorganización, 06-11-2026; lo usan los tests y, en la fase H, `pnpm
 * capturas`).
 */

/**
 * La primera semilla de `desde` a `hasta` cuyo caso cumple `pred`, o lanza
 * diciendo qué se buscaba. Un test que necesita un caso del mapa —un puente
 * N-S, un vado, un héroe que nace al norte de su castillo— lo busca en vez de
 * escribir su semilla: cada cambio del generador (#169, que cambia todos los
 * mapas) se llevaba las semillas escritas a mano y obligaba a cambiar un
 * número por otro sin que el test dijera nada nuevo.
 */
export function primeraSemillaCon<T>(
  que: string,
  pred: (semilla: number) => T | undefined,
  desde = 1,
  hasta = 80,
): { semilla: number; caso: T } {
  for (let semilla = desde; semilla <= hasta; semilla++) {
    const caso = pred(semilla);
    if (caso !== undefined) return { semilla, caso };
  }
  throw new Error(`ninguna semilla de ${desde} a ${hasta} tiene ${que}`);
}
