/**
 * Lo que el escenógrafo deduce de un nodo: qué barrera cruza y en qué eje.
 * `buildMap` pinta la casilla de un nodo como `dirt` y no guarda la barrera, así
 * que sale de sus ocho vecinas (petición 4 de la §11 de `peticiones.md`).
 */
import { type Barrera, esBarrera, type TerrainKind } from '@core/map/terrain.js';

/** Los nodos de paso, uno por barrera; puente y puerta en las dos orientaciones de la frontera. */
export const NODOS: readonly {
  id: string;
  n: number;
  barrera: Barrera;
  variantes: readonly string[];
}[] = [
  { id: 'nodo-puente', n: 1, barrera: 'water', variantes: ['ancho', 'hondo'] },
  { id: 'nodo-puerta', n: 2, barrera: 'wall', variantes: ['ancho', 'hondo'] },
  { id: 'nodo-paso-montana', n: 3, barrera: 'mountain', variantes: [''] },
  { id: 'nodo-paso-bosque', n: 4, barrera: 'forest', variantes: [''] },
  { id: 'nodo-paso-acantilado', n: 5, barrera: 'cliff', variantes: [''] },
];

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

/** El nodo de paso según la barrera que cruza y el eje de la frontera. */
export function nodoDePaso(barrera: Barrera | null, eje: 'ancho' | 'hondo'): string {
  const nodo = NODOS.find((n) => n.barrera === barrera);
  if (nodo === undefined) return 'nodo-hito';
  return nodo.variantes.includes(eje) ? `${nodo.id}-${eje}` : nodo.id;
}
