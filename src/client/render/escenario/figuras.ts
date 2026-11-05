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
import { PIES } from './figuras-del-mapa.js';
import { type Caja, cajaDeSprite } from './pasillo.js';
import { separar, type Volumen } from './pintar.js';
import type { DeNodo } from './puestos.js';

/**
 * La figura con que se mide si una casilla queda tapada, en casillas: los pies a
 * `pies` bajo el borde de arriba de su casilla (los del héroe, los más altos de
 * `PIES`), `alto` hacia arriba y `medioAncho` a cada lado del centro. Un héroe de
 * la cámara a 25° mide eso.
 */
export const FIGURA = { pies: PIES.heroe, alto: 0.9, medioAncho: 0.3 } as const;

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
 * Qué muestras de la figura de caja `figura` (`cajaDeFigura`; por su índice en
 * `MUESTRAS`) caen bajo la silueta del sprite `s` (`altoDeLaSilueta`): lo que
 * de ella tapa, no su caja, que es casi toda transparente por arriba. Una a una,
 * para que quien solo pregunta si tapa algo (`tapaAlgo`) pare en la primera.
 */
function* muestrasBajo(
  s: Sprite,
  perfil: readonly number[] | undefined,
  caja: Caja,
  figura: readonly [number, number, number, number],
): Generator<number> {
  const [fx0, fy0, fx1, fy1] = figura;
  if (fx1 <= caja[0] || fx0 >= caja[2] || fy1 <= caja[1] || fy0 >= caja[3]) return;
  for (const [k, [u, w]] of MUESTRAS.entries()) {
    const px = fx0 + u * (fx1 - fx0);
    const py = fy0 + w * (fy1 - fy0);
    const alto = altoDeLaSilueta(s, perfil, px, caja);
    if (alto !== undefined && py >= alto && py <= caja[3]) yield k;
  }
}

/** Si el sprite `s` tapa algo de la figura de caja `figura`: la primera muestra basta. */
function tapaAlgo(
  s: Sprite,
  perfil: readonly number[] | undefined,
  caja: Caja,
  figura: readonly [number, number, number, number],
): boolean {
  return muestrasBajo(s, perfil, caja, figura).next().done !== true;
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
 * **La regla de la figura que sube**: por casilla (`y·W + x`), la clave de la
 * más honda de las piezas que se pintarían después de su figura (su clave pasa
 * de sus pies) y le tapan algo de la silueta (`tapaAlgo`), de entre las que
 * `desde` deja subir figuras y desde la fila que diga; la figura que la pise se
 * pinta con esa clave, después de ella (a igual clave va antes el volumen). Las
 * casillas a mirar salen de la caja de cada pieza (`casillasBajo`).
 *
 * Solo sube donde la pieza tapa algo de su silueta, no donde pisa su caja (casi
 * toda transparente por arriba): la figura que sube pasa también por delante de
 * lo que haya entre sus pies y la pieza —un árbol de la fila de abajo—, y así
 * solo pasa donde, si no, la taparía la pieza.
 */
function delanteDeLasPiezas(
  volumenes: readonly Volumen[],
  W: number,
  H: number,
  perfilDe: PerfilDe,
  desde: (v: Volumen) => number | undefined,
): Map<number, number> {
  const delante = new Map<number, number>();
  for (const v of volumenes) {
    const fila = desde(v);
    if (fila === undefined) continue;
    const caja = cajaDeSprite(v.s);
    const perfil = perfilDe(v.s);
    for (const [x, y] of casillasBajo(caja, fila, W, H)) {
      const i = y * W + x;
      if (y + FIGURA.pies >= v.clave) continue;
      if (!tapaAlgo(v.s, perfil, caja, cajaDeFigura(x, y))) continue;
      const antes = delante.get(i);
      delante.set(i, antes === undefined ? v.clave : Math.max(antes, v.clave));
    }
  }
  return delante;
}

/**
 * Por casilla (`y·W + x`), la clave de la pieza del relieve más honda que
 * cuelga de su fila o de una más al norte (`Sprite.filaAlta`, la más al norte
 * de sus casillas altas) y tapa algo de su figura (`delanteDeLasPiezas`). La de
 * su propia fila cuenta: esa cara cae desde sus pies, por debajo de ellos. Una
 * pieza sin `filaAlta` no sube nada.
 */
export function delanteDeLasParedes(
  volumenes: readonly Volumen[],
  W: number,
  H: number,
  perfilDe: PerfilDe,
): Map<number, number> {
  return delanteDeLasPiezas(volumenes, W, H, perfilDe, (v) =>
    v.s.clase === 'pared' ? v.s.filaAlta : undefined,
  );
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
      for (const k of muestrasBajo(v.s, perfil, caja, cajaDeFigura(x, y))) suyas.add(k);
      if (suyas.size > TAPADA_DESDE * MUESTRAS.length) tapadas.add(i);
    }
  }
  return [...tapadas].sort((a, b) => a - b);
}

/**
 * Si una pieza está **detrás** de la figura con los pies en `pies` (la de la fila
 * `y`): la del relieve, si cuelga de su fila o de una más al norte
 * (`Sprite.filaAlta`); lo demás, si su pie (`Sprite.y`, su sitio, no su clave: la
 * pieza ordenada por detrás de otra, `ordenadoEn`, sigue en su casilla) no pasa
 * de sus pies. Con la fila del pie, y no el pie, un puesto o un pueblo de su
 * misma fila con el pie más al sur que el de la figura la dejaba subir por
 * encima de él (12 casillas en s1-40: 6 nodos y 6 pueblos; N1 de la vuelta 2 de QA).
 */
const deDetras = (s: Sprite, y: number, pies: number): boolean =>
  s.filaAlta !== undefined ? s.filaAlta <= y : s.y <= pies;

/**
 * Si la pieza es algo hecho —un objeto del mapa (también un puesto o la puerta de
 * una muralla), una pieza de un recinto o de un puente—, no la masa de una
 * barrera. La muralla del mapa sí es masa: es la barrera `wall`, que también se
 * cruza infiltrado.
 */
const esAlgoHecho = (s: Sprite): boolean =>
  s.clase === 'objeto' ||
  s.objeto !== undefined ||
  s.recinto !== undefined ||
  s.puente !== undefined;

/**
 * Lo que tapa algo de la figura de una casilla de barrera y se pintaría después
 * de ella (`loQueTapaEnUnaBarrera`): su clave, si la sube o la para, y el nodo de
 * la pieza que solo se pinta según lo que se sabe de él (`Sprite.deNodo`: el hito
 * y las tres obras del puesto).
 */
export interface LoQueTapaEnUnaBarrera {
  readonly clave: number;
  /** Si la figura sube por delante (lo de detrás, la masa) o no pasa de ella (lo hecho de delante). */
  readonly sube: boolean;
  readonly deNodo: DeNodo | undefined;
}

/**
 * Lo que tapa la figura de la casilla de **barrera** `(x, y)` y se pintaría
 * después de ella (su clave pasa de sus pies y le tapa algo de la silueta,
 * `tapaAlgo`), cada pieza con lo que hace (`subidaEnUnaBarrera`). La sube:
 *
 * - lo que está **detrás** (`deDetras`): lo del relieve que cuelga de su fila o
 *   de una más al norte, y lo demás con el pie en sus pies o más al norte, de
 *   cualquier clase: en el mundo está detrás de ella (la regla de
 *   `delanteDeLasParedes`, con toda pieza);
 * - o **la masa de una barrera** de más al sur: lo que no es algo hecho
 *   (`esAlgoHecho`) ni la cubierta de lo que se pisa (una mata, una parcela o una
 *   casa de la labranza, que es cubierta: la de una casilla que no se pisa sí es
 *   masa). Picos, árboles, rocas, la muralla: aunque su pie caiga en lo que se
 *   pisa, como el de algún pico del borde de su cordillera.
 *
 * Y la para **lo hecho de más al sur** que la tapa (las torres, los tramos y las
 * casas de un recinto, un objeto, un puesto): eso está delante y la sigue
 * tapando; de la masa que se pintaría después de ello, sube solo por lo que va antes.
 *
 * Solo un grupo que se infiltra se para en una barrera (`hero/infiltracion.ts`,
 * 05-11-2026), y allí la masa de la montaña o del bosque lo escondía entero (el
 * criterio 5: «se ve en el mapa y se puede pulsar»). Por delante de toda pieza, el
 * goblin parado en la montaña al norte de Valdeluz (s8, (6,5) y (7,5)) se pintaba
 * encima de las torres, con el aro sobre los tejados, y se leía dentro de la ciudad
 * (H1 de la vuelta 1 de QA). Solo por lo de su fila o más al norte, la masa de la
 * fila de delante lo tapaba en la mitad o más en 694 de las 2 305 casillas de
 * barrera de s8, s39, s1 y s13 (el 30 %), y en el bosque de (4,7) de s8, el de las
 * capturas, en un 56 %: por eso la masa de delante también lo sube. En una casilla
 * que se pisa no se pregunta: la regla de siempre (`claveDeFigura`) no cambia.
 */
export function loQueTapaEnUnaBarrera(
  volumenes: Iterable<Volumen>,
  terreno: readonly TerrainKind[],
  W: number,
  perfilDe: PerfilDe,
  x: number,
  y: number,
): LoQueTapaEnUnaBarrera[] {
  const figura = cajaDeFigura(x, y);
  const pies = y + FIGURA.pies;
  const sePisaBajo = (p: Sprite): boolean => {
    const t = terreno[Math.floor(p.y) * W + Math.floor(p.x)];
    return t !== undefined && isWalkable(t);
  };
  const lista: LoQueTapaEnUnaBarrera[] = [];
  for (const v of volumenes) {
    if (v.clave <= pies) continue;
    if (!tapaAlgo(v.s, perfilDe(v.s), cajaDeSprite(v.s), figura)) continue;
    const detras = deDetras(v.s, y, pies);
    // La cubierta de lo que se pisa, de delante, ni sube ni para: va encima, como siempre.
    if (!detras && !esAlgoHecho(v.s) && v.s.clase === 'cubierta' && sePisaBajo(v.s)) continue;
    lista.push({ clave: v.clave, sube: detras || !esAlgoHecho(v.s), deNodo: v.s.deNodo });
  }
  return lista;
}

/**
 * La clave con que se pinta la figura de una casilla de barrera, con lo que la
 * tapa (`loQueTapaEnUnaBarrera`), o −∞ si no hay que subirla: la de lo más hondo
 * que la sube y va antes que todo lo que la para. **Solo cuenta lo que se pinta**:
 * la pieza de un nodo, si `seVe` (el hito y las obras del puesto, con lo que se
 * sabe del nodo, `seVeConSuNodo`). Con todas, la empalizada y la torre de un paso
 * neutral, que no se pintan, la paraban, y la masa de delante la tapaba en la
 * mitad o más en 4 casillas de s1-40 (s24 (15,8), s36 (8,22), s39 (23,9), s10
 * (3,10); N2 de la vuelta 2 de QA).
 */
export function subidaEnUnaBarrera(
  lo: readonly LoQueTapaEnUnaBarrera[],
  seVe: (d: DeNodo) => boolean,
): number {
  const cuenta = lo.filter((p) => p.deNodo === undefined || seVe(p.deNodo));
  const tope = Math.min(...cuenta.filter((p) => !p.sube).map((p) => p.clave));
  return cuenta.reduce(
    (a, p) => (p.sube && p.clave < tope && p.clave > a ? p.clave : a),
    Number.NEGATIVE_INFINITY,
  );
}

/**
 * La clave de la figura de la casilla de barrera `(x, y)` (`subidaEnUnaBarrera`
 * de `loQueTapaEnUnaBarrera`), de una vez: lo que piden los tests y el taller.
 */
export function delanteEnUnaBarrera(
  volumenes: Iterable<Volumen>,
  terreno: readonly TerrainKind[],
  W: number,
  perfilDe: PerfilDe,
  x: number,
  y: number,
  seVe: (d: DeNodo) => boolean,
): number {
  return subidaEnUnaBarrera(loQueTapaEnUnaBarrera(volumenes, terreno, W, perfilDe, x, y), seVe);
}
