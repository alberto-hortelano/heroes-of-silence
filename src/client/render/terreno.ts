import { isWalkable, type TerrainKind as Terrain } from '@core/map/terrain.js';

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
  // Más azul que antes: con cinco barreras, el río tiene que leerse como agua y
  // no como un verde sucio al lado del bosque.
  water: [38, 72, 124],
  snow: [167, 172, 171],
  lava: [85, 51, 40],
  // Las cinco barreras, cada una a ΔE76 ≥ 20 de los siete suelos y de las otras
  // cuatro (la tabla está en la vuelta 1 de QA de «mapas densos»). Antes el
  // acantilado era un pardo a 11 de la tierra de casa y el muro un gris claro a
  // 15 del `rough`: se leían como suelo. La montaña, gris lavanda frío; el
  // bosque, verde hondo; el acantilado, ocre anaranjado; el muro, pizarra
  // oscura. Son temporales hasta que lleguen sus piezas de borde.
  mountain: [118, 110, 138],
  forest: [18, 78, 34],
  cliff: [190, 110, 48],
  // El muro, un punto más claro que la primera pizarra ([34,32,54]): aquella
  // quedaba a ΔE 16,9 del fondo de lo inexplorado del minimapa y se perdía en él
  // (vuelta 2 de QA, N2).
  wall: [40, 36, 64],
};
/**
 * Una superficie de `resolucion` píxeles por casilla: el pigmento continuo, la
 * textura de cada terreno encima en trama suave si ha llegado, y el borde de cada
 * barrera.
 */
export function terrainSurface(
  width: number,
  height: number,
  terrain: readonly Terrain[],
  seed: number,
  textura: (t: Terrain) => HTMLImageElement | null = () => null,
): HTMLCanvasElement {
  const surface = document.createElement('canvas');
  const resolution = 20;
  surface.width = width * resolution;
  surface.height = height * resolution;
  const ctx = surface.getContext('2d')!;
  const image = ctx.createImageData(surface.width, surface.height);
  const en = (x: number, y: number): Terrain =>
    terrain[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))]!;
  // El ocre del acantilado no se funde con la casilla de al lado: es tan
  // saturado que la mezcla dejaba un halo naranja sobre la nieve o el agua
  // vecinas, y eso se leía como más acantilado (vuelta 2 de QA, N5). Fuera de
  // su casilla, el acantilado cuenta como el terreno del píxel.
  const sample = (x: number, y: number, propio: Terrain) => {
    const t = en(x, y);
    return pigments[t === 'cliff' && propio !== 'cliff' ? propio : t];
  };
  for (let y = 0; y < surface.height; y++)
    for (let x = 0; x < surface.width; x++) {
      const propio = en(Math.floor(x / resolution), Math.floor(y / resolution));
      // Pequeñas irregularidades rompen la geometría de los límites, no la navegación.
      const u = x / resolution - 0.5 + Math.sin(y * 0.071 + seed) * 0.12;
      const v = y / resolution - 0.5 + Math.sin(x * 0.063 + seed) * 0.12;
      const ix = Math.floor(u),
        iy = Math.floor(v);
      const fx = u - ix,
        fy = v - iy;
      const sx = fx * fx * (3 - 2 * fx),
        sy = fy * fy * (3 - 2 * fy);
      const a = sample(ix, iy, propio),
        b = sample(ix + 1, iy, propio),
        c = sample(ix, iy + 1, propio),
        d = sample(ix + 1, iy + 1, propio);
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
  tramarTexturas(ctx, width, height, terrain, resolution, textura);
  tramarBarreras(ctx, width, height, terrain, resolution);
  marcarBordes(ctx, width, height, terrain, resolution);
  return surface;
}

/**
 * Las texturas de `assets/generated/terrain/` como trama suave sobre su pigmento,
 * recortadas a las casillas de su terreno. **Temporal** (petición del usuario,
 * 03-10-2026): da grano a los suelos hasta que lleguen las texturas pintadas.
 * Sin la imagen no se trama nada y queda el pigmento.
 */
function tramarTexturas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  terrain: readonly Terrain[],
  resolution: number,
  textura: (t: Terrain) => HTMLImageElement | null,
): void {
  // La zona de cada terreno y la caja que la contiene: la mezcla se rellena solo
  // en la caja, no en el mapa entero una vez por terreno.
  const porTerreno = new Map<
    Terrain,
    { zona: Path2D; x0: number; y0: number; x1: number; y1: number }
  >();
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const t = terrain[y * width + x]!;
      if (textura(t) === null) continue;
      let z = porTerreno.get(t);
      if (z === undefined) {
        z = { zona: new Path2D(), x0: x, y0: y, x1: x, y1: y };
        porTerreno.set(t, z);
      }
      z.zona.rect(x * resolution, y * resolution, resolution, resolution);
      z.x0 = Math.min(z.x0, x);
      z.y0 = Math.min(z.y0, y);
      z.x1 = Math.max(z.x1, x);
      z.y1 = Math.max(z.y1, y);
    }
  for (const [t, z] of porTerreno) {
    const img = textura(t);
    const patron = img === null ? null : ctx.createPattern(img, 'repeat');
    if (patron === null) continue;
    ctx.save();
    ctx.clip(z.zona);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = patron;
    ctx.fillRect(
      z.x0 * resolution,
      z.y0 * resolution,
      (z.x1 - z.x0 + 1) * resolution,
      (z.y1 - z.y0 + 1) * resolution,
    );
    ctx.restore();
  }
}

/**
 * La trama de las barreras que no tienen pieza: el color solo no basta para que
 * algo se lea como «no se pasa» (QA de «mapas densos», H1 y H2). **Temporal**,
 * hasta que lleguen las piezas de borde de `docs/art/peticiones.md` §8.
 *
 * - **Acantilado**: estrías inclinadas, continuas de casilla a casilla, como los
 *   estratos de una pared de roca; un filo claro arriba y, en el suelo de abajo,
 *   la sombra que echa el desnivel.
 * - **Muro**: sillares —juntas claras en hiladas, con la junta vertical a
 *   tresbolillo— y la coronación clara en cada lado que da a un suelo. La
 *   sombra, más corta que la del acantilado.
 */
function tramarBarreras(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  terrain: readonly Terrain[],
  resolution: number,
): void {
  const en = (x: number, y: number): Terrain | null =>
    x >= 0 && y >= 0 && x < width && y < height ? terrain[y * width + x]! : null;
  const suelo = (x: number, y: number): boolean => {
    const t = en(x, y);
    return t !== null && isWalkable(t);
  };
  const zonas = { cliff: new Path2D(), wall: new Path2D() };
  let hay = false;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const t = en(x, y);
      if (t !== 'cliff' && t !== 'wall') continue;
      zonas[t].rect(x * resolution, y * resolution, resolution, resolution);
      hay = true;
    }
  if (!hay) return;
  const ancho = width * resolution;
  const alto = height * resolution;

  // Las estrías del acantilado: rectas que bajan hacia la derecha, en el mapa
  // entero y recortadas a sus casillas, así que siguen de una a la siguiente.
  ctx.save();
  ctx.clip(zonas.cliff);
  ctx.strokeStyle = 'rgba(78,36,8,0.55)';
  ctx.lineWidth = Math.max(1, resolution * 0.08);
  const paso = resolution / 3;
  ctx.beginPath();
  for (let c = -ancho; c < alto + ancho; c += paso) {
    ctx.moveTo(0, c);
    ctx.lineTo(ancho, c + ancho * 0.3);
  }
  ctx.stroke();
  ctx.restore();

  // Los sillares del muro: hiladas de un tercio de casilla y juntas verticales
  // a tresbolillo.
  ctx.save();
  ctx.clip(zonas.wall);
  ctx.strokeStyle = 'rgba(150,146,176,0.6)';
  ctx.lineWidth = Math.max(1, resolution * 0.06);
  const hilada = resolution / 3;
  const sillar = resolution / 2;
  ctx.beginPath();
  for (let fila = 0, y = 0; y < alto; fila++, y += hilada) {
    ctx.moveTo(0, y);
    ctx.lineTo(ancho, y);
    for (let x = fila % 2 === 0 ? 0 : sillar / 2; x < ancho; x += sillar) {
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + hilada);
    }
  }
  ctx.stroke();
  ctx.restore();

  // El filo de arriba y la sombra de abajo: lo que hace que se lea como
  // desnivel y no como una mancha plana.
  const filo = Math.max(2, Math.round(resolution * 0.12));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const t = en(x, y);
      if (t !== 'cliff' && t !== 'wall') continue;
      const px = x * resolution;
      const py = y * resolution;
      if (suelo(x, y - 1)) {
        ctx.fillStyle = t === 'cliff' ? 'rgba(255,214,150,0.55)' : 'rgba(196,192,214,0.6)';
        ctx.fillRect(px, py, resolution, filo);
      }
      if (suelo(x, y + 1)) {
        const largo = resolution * (t === 'cliff' ? 0.5 : 0.3);
        const sombra = ctx.createLinearGradient(0, py + resolution, 0, py + resolution + largo);
        sombra.addColorStop(0, 'rgba(0,0,0,0.5)');
        sombra.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sombra;
        ctx.fillRect(px, py + resolution, resolution, largo);
      }
      if (t === 'cliff' && suelo(x + 1, y)) {
        const largo = resolution * 0.3;
        const sombra = ctx.createLinearGradient(px + resolution, 0, px + resolution + largo, 0);
        sombra.addColorStop(0, 'rgba(0,0,0,0.4)');
        sombra.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sombra;
        ctx.fillRect(px + resolution, py, largo, resolution);
      }
    }
}

/**
 * El borde de cada barrera: una franja oscura por dentro de la casilla de
 * barrera en cada lado que da a un suelo. Sin él, una frontera de cinco colores
 * se leía como otra mancha de terreno y no como un accidente que corta el paso.
 */
function marcarBordes(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  terrain: readonly Terrain[],
  resolution: number,
): void {
  const franja = Math.max(2, Math.round(resolution * 0.18));
  const suelo = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && isWalkable(terrain[y * width + x]!);
  ctx.save();
  ctx.fillStyle = 'rgba(12,9,6,0.55)';
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (isWalkable(terrain[y * width + x]!)) continue;
      const px = x * resolution;
      const py = y * resolution;
      if (suelo(x, y - 1)) ctx.fillRect(px, py, resolution, franja);
      if (suelo(x, y + 1)) ctx.fillRect(px, py + resolution - franja, resolution, franja);
      if (suelo(x - 1, y)) ctx.fillRect(px, py, franja, resolution);
      if (suelo(x + 1, y)) ctx.fillRect(px + resolution - franja, py, franja, resolution);
    }
  ctx.restore();
}
