/**
 * Las figuras al pie de una pared del relieve (#185).
 *
 * El mapa no levanta lo alto: cada casilla se pinta en su sitio, sea cual sea su
 * nivel, y la cara de una caída cuelga de su filo hacia el sur `caída ×
 * ALTO_DE_NIVEL` casillas, encima del suelo de la casilla baja (una caída de 3,
 * 1,8 casillas). La pieza que la pinta se ordena por su pie, como todo volumen,
 * y una figura en la casilla baja tiene los pies más arriba que ese pie: la
 * pared se pintaba después y la tapaba. En s36 el grupo mon-2 (7, 22) se quedaba
 * en su chapa «5» delante de la roca (auditoría 3, §2.3).
 *
 * Pero esa pared es el frente de la casilla alta, que está detrás: lo que se
 * pisa al pie de un acantilado está delante de él, nunca dentro. Su clave es la
 * de su pie solo porque el mapa no levanta lo alto. Así que la figura va delante
 * de toda pieza que cuelga de su fila o de una más al norte (`Sprite.filaAlta`):
 * la de una casilla alta de encima, la ladera de una de al lado, y también las
 * de su propia casilla, que caen desde sus pies hacia abajo, al sur o al lado, y
 * en el mundo no tapan a quien está encima. Lo que cuelga de una casilla más al
 * sur, y lo que no es del relieve (un árbol, un pico), tapa como siempre.
 *
 * El suelo de debajo sigue cubierto por la cara: es lo que cuesta no levantar lo
 * alto, y bajar `ALTO_DE_NIVEL` obligaba a rehacer las juntas de todo el arte.
 */
import { isWalkable, type TerrainKind } from '@core/map/terrain.js';
import { altoDeLaSilueta, type PerfilDe } from './caras.js';
import type { Sprite } from './colocar.js';
import { type Caja, cajaDeSprite } from './pasillo.js';
import { separar, type Volumen } from './pintar.js';

/**
 * La figura con que se mide si una casilla queda tapada, en casillas: los pies a
 * `pies` bajo el borde de arriba de su casilla (los del héroe, los más altos de
 * `PIES` en `mapa.ts`, que un test compara), `alto` hacia arriba y `medioAncho`
 * a cada lado del centro. Un héroe de la cámara a 25° mide eso.
 */
export const FIGURA = { pies: 0.8, alto: 0.9, medioAncho: 0.3 } as const;

/**
 * La caja de la figura de la casilla `(x, y)`, en casillas: `[x0, y0, x1, y1]`
 * con `y1` en sus pies.
 */
export function cajaDeFigura(x: number, y: number): readonly [number, number, number, number] {
  const pies = y + FIGURA.pies;
  return [x + 0.5 - FIGURA.medioAncho, pies - FIGURA.alto, x + 0.5 + FIGURA.medioAncho, pies];
}

/** Las muestras de la caja de una figura: 7 columnas por 10 filas. */
const MUESTRAS: readonly (readonly [number, number])[] = Array.from({ length: 7 }, (_, i) =>
  Array.from({ length: 10 }, (_, j) => [(i + 0.5) / 7, (j + 0.5) / 10] as const),
).flat();

/**
 * Qué muestras de la figura de la casilla `(x, y)` (por su índice en
 * `MUESTRAS`) caen bajo la silueta del sprite `s` (`altoDeLaSilueta`): lo que
 * de ella tapa, no su caja, que es casi toda transparente por arriba.
 */
function muestrasBajo(
  s: Sprite,
  perfil: readonly number[] | undefined,
  caja: Caja,
  x: number,
  y: number,
): number[] {
  const [fx0, fy0, fx1, fy1] = cajaDeFigura(x, y);
  if (fx1 <= caja[0] || fx0 >= caja[2] || fy1 <= caja[1] || fy0 >= caja[3]) return [];
  const bajo: number[] = [];
  MUESTRAS.forEach(([u, w], k) => {
    const px = fx0 + u * (fx1 - fx0);
    const py = fy0 + w * (fy1 - fy0);
    const alto = altoDeLaSilueta(s, perfil, px, caja);
    if (alto !== undefined && py >= alto && py <= caja[3]) bajo.push(k);
  });
  return bajo;
}

/** Las casillas cuya figura puede pisar la caja `caja`, con la fila desde `desde`. */
function* casillasBajo(
  caja: Caja,
  desde: number,
  W: number,
  H: number,
): Generator<[number, number]> {
  const [x0, y0, x1, y1] = caja;
  for (
    let y = Math.max(0, desde, Math.floor(y0 - FIGURA.pies));
    y < H && y + FIGURA.pies - FIGURA.alto < y1;
    y++
  )
    for (let x = Math.max(0, Math.floor(x0 - 1)); x < W && x <= x1; x++) yield [x, y];
}

/**
 * Por casilla (`y·W + x`), la clave de la pieza del relieve más honda que
 * cuelga de su fila o de una más al norte (`Sprite.filaAlta`, la más al norte
 * de sus casillas altas) y tapa algo de su figura (`muestrasBajo`): la figura
 * que la pise se pinta con esa clave, después de ella (a igual clave va antes el
 * volumen). La de su propia fila cuenta: esa cara cae desde sus pies, por
 * debajo de ellos. Una pieza sin `filaAlta` no sube nada.
 *
 * Solo sube donde la pieza tapa algo de su silueta, no donde pisa su caja (casi
 * toda transparente por arriba): la figura que sube pasa también por delante de
 * lo que haya entre sus pies y la pieza —un árbol de la fila de abajo—, y así
 * solo pasa donde, si no, la taparía la pared.
 */
export function delanteDeLasParedes(
  volumenes: readonly Volumen[],
  W: number,
  H: number,
  perfilDe: PerfilDe,
): Map<number, number> {
  const delante = new Map<number, number>();
  for (const v of volumenes) {
    const fila = v.s.filaAlta;
    if (v.s.clase !== 'pared' || fila === undefined) continue;
    const caja = cajaDeSprite(v.s);
    const perfil = perfilDe(v.s);
    for (const [x, y] of casillasBajo(caja, fila, W, H)) {
      if (y + FIGURA.pies >= v.clave || muestrasBajo(v.s, perfil, caja, x, y).length === 0)
        continue;
      const i = y * W + x;
      delante.set(i, Math.max(delante.get(i) ?? v.clave, v.clave));
    }
  }
  return delante;
}

/**
 * Cuánto de la figura tapa una pared para que la casilla cuente como tapada
 * (`pisablesTapadas`): un cuarto de su caja.
 */
export const TAPADA_DESDE = 0.25;

/**
 * Las casillas pisables cuya figura tapan en más de `TAPADA_DESDE` las piezas
 * del relieve que se pintan después de ella, contado desde el orden del pintor
 * (`separar`): con la clave de sus pies, subida por `delanteDeLasParedes`, y
 * bajo la silueta de cada pieza. Lo cuenta el informe (`pisablesTapadas`) y
 * tiene que ser 0. Con `subir` a `false`, la clave de los pies sin más: lo que
 * pasaba antes de #185 (533 en las semillas 1, 2, 5, 9, 13, 24, 28, 34, 36 y 57).
 */
export function pisablesTapadas(
  sprites: readonly Sprite[],
  terreno: readonly TerrainKind[],
  W: number,
  H: number,
  perfilDe: PerfilDe,
  subir = true,
): number[] {
  const { volumenes } = separar({ sprites });
  const delante = subir
    ? delanteDeLasParedes(volumenes, W, H, perfilDe)
    : new Map<number, number>();
  const tapadas = new Set<number>();
  const bajo = new Map<number, Set<number>>();
  for (const v of volumenes) {
    if (v.s.clase !== 'pared') continue;
    const caja = cajaDeSprite(v.s);
    const perfil = perfilDe(v.s);
    for (const [x, y] of casillasBajo(caja, 0, W, H)) {
      const i = y * W + x;
      if (tapadas.has(i) || !isWalkable(terreno[i] as TerrainKind)) continue;
      if (v.clave <= Math.max(y + FIGURA.pies, delante.get(i) ?? Number.NEGATIVE_INFINITY))
        continue;
      let suyas = bajo.get(i);
      if (suyas === undefined) {
        suyas = new Set();
        bajo.set(i, suyas);
      }
      for (const k of muestrasBajo(v.s, perfil, caja, x, y)) suyas.add(k);
      if (suyas.size > TAPADA_DESDE * MUESTRAS.length) tapadas.add(i);
    }
  }
  return [...tapadas].sort((a, b) => a - b);
}
