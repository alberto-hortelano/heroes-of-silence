/**
 * La línea de una muralla como casillas y pasos entre casillas vecinas. Cada
 * paso va en una de las 8 direcciones y el pintor lo dibuja con el tramo de su
 * eje; la línea la traza `trazaDeMuralla` y las torres las pone `torresDe`
 * (`muralla.ts`).
 *
 * Hasta #197 la línea era el esqueleto de la franja (Zhang-Suen sobre la
 * rejilla de casillas, con poda de ramitas): copiaba los escalones y los bultos
 * de la franja, y de ahí los espolones y las juntas abiertas.
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
}

/** Cuántas líneas separadas forman unos pasos. */
export function componentesDePasos(
  casillas: readonly (readonly [number, number])[],
  pasos: readonly { a: readonly [number, number]; b: readonly [number, number] }[],
): number {
  const padre = new Map<string, string>();
  const raiz = (k: string): string => {
    let r = k;
    while (padre.get(r) !== r) r = padre.get(r) as string;
    return r;
  };
  for (const [x, y] of casillas) padre.set(`${x},${y}`, `${x},${y}`);
  for (const p of pasos) {
    const ra = raiz(`${p.a[0]},${p.a[1]}`);
    const rb = raiz(`${p.b[0]},${p.b[1]}`);
    if (ra !== rb) padre.set(ra, rb);
  }
  return new Set([...padre.keys()].map(raiz)).size;
}
