/**
 * Lo que el escenógrafo deduce de un nodo: qué barrera cruza y en qué eje.
 * `buildMap` pinta la casilla de un nodo como `dirt` y no guarda la barrera, así
 * que sale de sus ocho vecinas (petición 4 de la §11 de `peticiones.md`).
 */
import { type Barrera, esBarrera, type TerrainKind } from '../../../src/core/map/terrain.js';

/** La barrera que cruza un nodo y el eje de su frontera, por las casillas de alrededor. */
export function barreraDeNodo(
  at: { x: number; y: number },
  W: number,
  terreno: readonly TerrainKind[],
): { barrera: Barrera | null; eje: 'ancho' | 'hondo' } {
  const H = terreno.length / W;
  const cuenta = new Map<Barrera, number>();
  let lados = 0;
  let arribaAbajo = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = at.x + dx;
      const ny = at.y + dy;
      if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const t = terreno[ny * W + nx] as TerrainKind;
      if (!esBarrera(t)) continue;
      cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
      if (dy === 0) lados++;
      if (dx === 0) arribaAbajo++;
    }
  const barrera = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  // La frontera se estrecha a una casilla en el nodo: la barrera queda a sus lados.
  return { barrera, eje: lados >= arribaAbajo ? 'ancho' : 'hondo' };
}
