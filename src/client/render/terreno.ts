import type { TerrainKind as Terrain } from '@core/map/terrain.js';

/**
 * La superficie continua del mapa: el terreno sin cuadrícula a la vista.
 *
 * Rescatado tal cual de `aventura/terrain-surface.ts` de la rama
 * `archivo/gpt-rpg`. Cada casilla se pinta como un pigmento y los bordes se
 * interpolan con un poco de ondulación, así que una costa no es una escalera.
 * La cuadrícula sigue existiendo para el motor; solo deja de verse.
 *
 * El `Math.sin` está bien aquí: es el cliente, y el ruido no decide nada.
 */
/** El color de cada terreno, en RGB. Lo lee también el minimapa: un solo sitio. */
export const pigments: Readonly<Record<Terrain, readonly [number, number, number]>> = {
  grass: [79, 82, 57],
  dirt: [111, 94, 70],
  rough: [91, 89, 80],
  sand: [148, 133, 101],
  swamp: [53, 65, 57],
  water: [42, 67, 72],
  snow: [167, 172, 171],
  lava: [85, 51, 40],
  // La cordillera que cierra las regiones del mapa de nodos: más oscura y más
  // fría que el `rough`, para que el muro se lea como muro y no como suelo malo.
  mountain: [70, 66, 62],
};
/** Una superficie de `resolucion` píxeles por casilla. */
export function terrainSurface(
  width: number,
  height: number,
  terrain: readonly Terrain[],
  seed: number,
): HTMLCanvasElement {
  const surface = document.createElement('canvas');
  const resolution = 20;
  surface.width = width * resolution;
  surface.height = height * resolution;
  const ctx = surface.getContext('2d')!;
  const image = ctx.createImageData(surface.width, surface.height);
  const sample = (x: number, y: number) =>
    pigments[
      terrain[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))]!
    ];
  for (let y = 0; y < surface.height; y++)
    for (let x = 0; x < surface.width; x++) {
      // Pequeñas irregularidades rompen la geometría de los límites, no la navegación.
      const u = x / resolution - 0.5 + Math.sin(y * 0.071 + seed) * 0.12;
      const v = y / resolution - 0.5 + Math.sin(x * 0.063 + seed) * 0.12;
      const ix = Math.floor(u),
        iy = Math.floor(v);
      const fx = u - ix,
        fy = v - iy;
      const sx = fx * fx * (3 - 2 * fx),
        sy = fy * fy * (3 - 2 * fy);
      const a = sample(ix, iy),
        b = sample(ix + 1, iy),
        c = sample(ix, iy + 1),
        d = sample(ix + 1, iy + 1);
      const grain = (((x * 73 + y * 137 + x * y * 7 + seed) % 19) - 9) * 0.55;
      const broad = Math.sin(x * 0.023 + y * 0.019) * 3;
      const offset = (y * surface.width + x) * 4;
      for (let k = 0; k < 3; k++)
        image.data[offset + k] =
          (a[k]! * (1 - sx) + b[k]! * sx) * (1 - sy) +
          (c[k]! * (1 - sx) + d[k]! * sx) * sy +
          grain +
          broad;
      image.data[offset + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  return surface;
}
