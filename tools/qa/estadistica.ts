/**
 * Mediana y cuantiles de una muestra: las cuentas que publican el banco, el
 * barrido y la medida de tamaños.
 *
 * Están aquí y no en cada informe porque «el p90» tiene que ser el mismo p90 en
 * los tres: con dos fórmulas —interpolada en uno, por índice en otro— dos tablas
 * del mismo volcado dirían duraciones distintas sin que nadie lo notara. Es el
 * mismo motivo de `partidas.ts`.
 */

/**
 * El cuantil `q` (de 0 a 1) de una muestra, **sin interpolar**: el valor en la
 * posición `⌊q·n⌋` de la muestra ordenada, que es una partida que de verdad se
 * jugó. Ordena una copia: no toca la que recibe. `NaN` si está vacía.
 */
function cuantil(xs: readonly number[], q: number): number {
  const orden = [...xs].sort((a, b) => a - b);
  return orden[Math.min(orden.length - 1, Math.floor(q * orden.length))] ?? Number.NaN;
}

export const mediana = (xs: readonly number[]): number => cuantil(xs, 0.5);

/** «mediana / p90 / máximo»: la duración de unas partidas en una línea. */
export function duracion(dias: readonly number[]): string {
  return `${cuantil(dias, 0.5)} / ${cuantil(dias, 0.9)} / ${cuantil(dias, 1)}`;
}
