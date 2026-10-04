/**
 * La línea central de una franja de 2-3 casillas: lo que convierte una franja de
 * muro en UNA muralla y no en tres tramos en paralelo.
 *
 * Se adelgaza la franja (Zhang-Suen sobre la rejilla de casillas), se podan las
 * ramitas de una casilla y se sacan los pasos entre casillas vecinas del
 * esqueleto. Cada paso va en una de las 8 direcciones; el pintor lo dibuja con
 * el tramo de su eje y pone torres donde la línea gira o acaba.
 */

export interface Paso {
  /** Casillas de los dos extremos, como `[x, y]`. */
  readonly a: readonly [number, number];
  readonly b: readonly [number, number];
}

export type Eje = 'horizontal' | 'profundidad' | 'diagonal-baja' | 'diagonal-sube';

/** El eje de un paso: `diagonal-baja` baja hacia la derecha en pantalla, `diagonal-sube` sube. */
export function ejeDe(p: Paso): Eje {
  const dx = p.b[0] - p.a[0];
  const dy = p.b[1] - p.a[1];
  if (dy === 0) return 'horizontal';
  if (dx === 0) return 'profundidad';
  return dx * dy > 0 ? 'diagonal-baja' : 'diagonal-sube';
}

export interface Esqueleto {
  readonly casillas: readonly (readonly [number, number])[];
  readonly pasos: readonly Paso[];
  /** Casillas donde la línea acaba, se ramifica o gira: ahí va una torre. */
  readonly juntas: readonly (readonly [number, number])[];
}

/** Adelgaza un conjunto de casillas a su línea central. `casillas` en `[x, y]`. */
export function esqueleto(casillas: readonly (readonly [number, number])[]): Esqueleto {
  if (casillas.length === 0) return { casillas: [], pasos: [], juntas: [] };
  const xs = casillas.map((c) => c[0]);
  const ys = casillas.map((c) => c[1]);
  const ox = Math.min(...xs) - 1;
  const oy = Math.min(...ys) - 1;
  const w = Math.max(...xs) - ox + 2;
  const h = Math.max(...ys) - oy + 2;
  const g = new Uint8Array(w * h);
  for (const [x, y] of casillas) g[(y - oy) * w + (x - ox)] = 1;
  const en = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : (g[y * w + x] as number);

  // Zhang-Suen.
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const paso of [0, 1]) {
      const borrar: number[] = [];
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
          if (!en(x, y)) continue;
          const p = [
            en(x, y - 1),
            en(x + 1, y - 1),
            en(x + 1, y),
            en(x + 1, y + 1),
            en(x, y + 1),
            en(x - 1, y + 1),
            en(x - 1, y),
            en(x - 1, y - 1),
          ];
          const b = p.reduce((s, v) => s + v, 0);
          if (b < 2 || b > 6) continue;
          let a = 0;
          for (let k = 0; k < 8; k++) if (p[k] === 0 && p[(k + 1) % 8] === 1) a++;
          if (a !== 1) continue;
          // Norte, este, sur y oeste (p2, p4, p6 y p8 en la notación de Zhang-Suen).
          const n = p[0] as number;
          const e = p[2] as number;
          const s = p[4] as number;
          const o = p[6] as number;
          if (paso === 0 ? n * e * s !== 0 || e * s * o !== 0 : n * e * o !== 0 || n * s * o !== 0)
            continue;
          borrar.push(y * w + x);
        }
      for (const i of borrar) g[i] = 0;
      if (borrar.length > 0) cambio = true;
    }
  }

  const vecinas = (x: number, y: number): [number, number][] => {
    const v: [number, number][] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if ((dx !== 0 || dy !== 0) && en(x + dx, y + dy)) v.push([x + dx, y + dy]);
    return v;
  };

  // Poda: una ramita de una casilla que cuelga de una junta sobra.
  for (let ronda = 0; ronda < 2; ronda++) {
    const quitar: number[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!en(x, y)) continue;
        const v = vecinas(x, y);
        if (v.length === 1) {
          const [vx, vy] = v[0] as [number, number];
          if (vecinas(vx, vy).length >= 3) quitar.push(y * w + x);
        }
      }
    for (const i of quitar) g[i] = 0;
  }

  // Los pasos: entre vecinas, pero una diagonal no si ya se llega por los dos lados rectos.
  const pasos: Paso[] = [];
  const restantes: [number, number][] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!en(x, y)) continue;
      restantes.push([x + ox, y + oy]);
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [-1, 1],
      ] as const) {
        if (!en(x + dx, y + dy)) continue;
        if (dx !== 0 && dy !== 0 && (en(x + dx, y) || en(x, y + dy))) continue;
        pasos.push({ a: [x + ox, y + oy], b: [x + dx + ox, y + dy + oy] });
      }
    }

  // Juntas: grado distinto de 2, o un giro entre sus dos pasos.
  const grado = new Map<string, Paso[]>();
  for (const p of pasos)
    for (const c of [p.a, p.b]) {
      const k = `${c[0]},${c[1]}`;
      grado.set(k, [...(grado.get(k) ?? []), p]);
    }
  const juntas: [number, number][] = [];
  for (const c of restantes) {
    const ps = grado.get(`${c[0]},${c[1]}`) ?? [];
    if (ps.length !== 2 || ejeDe(ps[0] as Paso) !== ejeDe(ps[1] as Paso)) juntas.push(c);
  }
  return { casillas: restantes, pasos, juntas };
}
