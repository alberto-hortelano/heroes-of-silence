/**
 * Esparcir: puntos repartidos como un disco de Poisson (ninguno más cerca de
 * otro que su radio), con un radio que puede variar por sitio. Es lo que llena
 * un bosque de árboles apretados sin que se vea una rejilla, y el suelo de matas
 * sin dejar calvas ni montones.
 *
 * Determinista: el azar sale de la semilla.
 */

/** mulberry32: el azar del escenógrafo, que no decide nada de la partida. */
export function azarDe(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Punto {
  readonly x: number;
  readonly y: number;
  /** El radio con el que se aceptó: sirve para elegir el tamaño del módulo. */
  readonly r: number;
}

/**
 * Lanza dardos sobre la caja `[x0, y0, x1, y1]` (en casillas) y acepta los que
 * caen `dentro` y respetan el radio de sus vecinos: dos puntos no quedan más
 * cerca que el MENOR de sus dos radios.
 */
export function esparcir(
  caja: readonly [number, number, number, number],
  radio: (x: number, y: number) => number,
  dentro: (x: number, y: number) => boolean,
  azar: () => number,
  intentosPorCasilla = 40,
): Punto[] {
  const [x0, y0, x1, y1] = caja;
  const area = Math.max(0, (x1 - x0) * (y1 - y0));
  const celda = 0.25;
  const cubos = new Map<string, Punto[]>();
  const clave = (x: number, y: number) => `${Math.floor(x / celda)},${Math.floor(y / celda)}`;
  const aceptados: Punto[] = [];
  const intentos = Math.ceil(area * intentosPorCasilla);
  for (let n = 0; n < intentos; n++) {
    const x = x0 + azar() * (x1 - x0);
    const y = y0 + azar() * (y1 - y0);
    if (!dentro(x, y)) continue;
    const r = radio(x, y);
    const alcance = Math.ceil(r / celda);
    const cx = Math.floor(x / celda);
    const cy = Math.floor(y / celda);
    let libre = true;
    for (let dy = -alcance; dy <= alcance && libre; dy++)
      for (let dx = -alcance; dx <= alcance && libre; dx++) {
        for (const p of cubos.get(`${cx + dx},${cy + dy}`) ?? []) {
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < Math.min(r, p.r)) {
            libre = false;
            break;
          }
        }
      }
    if (!libre) continue;
    const p = { x, y, r };
    aceptados.push(p);
    const k = clave(x, y);
    cubos.set(k, [...(cubos.get(k) ?? []), p]);
  }
  return aceptados;
}
