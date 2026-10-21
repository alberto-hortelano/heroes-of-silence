/**
 * El aro dorado de una figura de pie —la elegida de la tropa, quien señala el
 * ratón en la base—: dónde va y cuánto mide, **medido en sus pies** (QA de la
 * tropa en escena, H1, 20-10-2026).
 *
 * El apoyo de una hoja (`apoyoEn`, `tools/taller/empaquetar.ts`) es la mediana
 * del tronco en x y **la fila opaca más baja** en y: la suela del pie que va
 * delante. Con el aro centrado ahí, su mitad de delante caía por delante de esa
 * suela y el otro pie quedaba en su borde de atrás o fuera. Aquí se miden en el
 * fotograma los dos pies —lo más bajo a cada lado del tronco— y el aro va en su
 * punto medio, del tamaño que los abarque. Medido el 20-10-2026 en el reposo de
 * frente de las 50 hojas de `assets/unidades/`: el punto medio queda de 0
 * (túnicas hasta el suelo, monturas) a 0,147 altos de adulto sobre el apoyo (el
 * rodelero en guardia abierta), con la mediana en 0,0625, y el pie de atrás hasta
 * 0,29 por encima del de delante: ningún número fijo los abarcaba a todos.
 *
 * Puro: sin DOM. La medida la leen la página (`piesDeFigura`, `figura.ts`, sobre
 * el fotograma que se pinta) y `test/aro-de-figura.test.ts` (sobre el arte del
 * disco).
 */

/** Los pies de una figura, en altos de adulto y respecto a su apoyo (y hacia arriba). */
export interface PiesDeLaFigura {
  /** El punto medio de los dos pies. */
  readonly x: number;
  readonly y: number;
  /** Lo que se separan, de lado y en hondo (en pantalla). */
  readonly ancho: number;
  readonly hondo: number;
  /** Lo más bajo de cada lado del tronco: los dos pies (uno si los dos caen del mismo lado). */
  readonly puntos: readonly (readonly [number, number])[];
}

/** El aro de una figura de pie, en altos de adulto (`CajaDeFigura.alto`): su radio en el suelo y lo que la cámara lo aplasta. */
export const ARO_DE_FIGURA = { radio: 0.3, aplastado: 0.11 / 0.3 } as const;

/** Lo que el aro deja alrededor de los pies: de lado y en hondo, en altos de adulto. */
const HOLGURA = { lado: 0.06, hondo: 0.03 } as const;

/** Dónde se buscan los pies: hasta este ancho a cada lado del apoyo (el del aro) y esta altura sobre él, en altos de adulto. */
const DONDE_LOS_PIES = { lado: ARO_DE_FIGURA.radio, alto: 0.35 } as const;

/**
 * Sin fotograma que medir se pinta el marcador (`pintarMarcador`), un óvalo que
 * acaba en el apoyo: el aro de siempre, centrado ahí, para que su mitad de delante
 * se vea bajo él.
 */
const SIN_MEDIR: PiesDeLaFigura = { x: 0, y: 0, ancho: 0, hondo: 0, puntos: [] };

/**
 * Los pies de un fotograma, leyendo su alfa con `alfa(x, y)` en píxeles de su
 * celda (`lado` de lado), con el apoyo en `apoyo` y un adulto de `adulto` píxeles
 * (`FIGURA.alturaAdulto`). Lo más bajo de cada lado del tronco, dentro del ancho
 * del aro y del tercio de abajo; `null` si ahí no hay nada opaco.
 */
export function piesEn(
  alfa: (x: number, y: number) => number,
  lado: number,
  apoyo: readonly [number, number],
  adulto: number,
  opaco = 128,
): PiesDeLaFigura | null {
  const [ax, ay] = apoyo;
  const medio = DONDE_LOS_PIES.lado * adulto;
  const desde = Math.max(0, Math.round(ay - DONDE_LOS_PIES.alto * adulto));
  const hasta = Math.min(lado - 1, Math.round(ay));
  const x0 = Math.max(0, Math.round(ax - medio));
  const x1 = Math.min(lado - 1, Math.round(ax + medio));
  // Por lado, la fila más baja con algo opaco y la media de x en ella.
  const bajo = [
    { y: -1, suma: 0, n: 0 },
    { y: -1, suma: 0, n: 0 },
  ];
  for (let y = desde; y <= hasta; y++) {
    for (let x = x0; x <= x1; x++) {
      if (alfa(x, y) < opaco) continue;
      const b = bajo[x < ax ? 0 : 1]!;
      if (y > b.y) {
        b.y = y;
        b.suma = 0;
        b.n = 0;
      }
      if (y === b.y) {
        b.suma += x;
        b.n++;
      }
    }
  }
  const puntos = bajo
    .filter((b) => b.n > 0)
    .map((b): [number, number] => [(b.suma / b.n - ax) / adulto, (ay - b.y) / adulto]);
  if (puntos.length === 0) return null;
  const xs = puntos.map((p) => p[0]);
  const ys = puntos.map((p) => p[1]);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
    ancho: Math.max(...xs) - Math.min(...xs),
    hondo: Math.max(...ys) - Math.min(...ys),
    puntos,
  };
}

/** Un aro en pantalla: su centro y sus dos semiejes, en píxeles. */
export interface AroEnPantalla {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
}

/**
 * El aro de una figura con el apoyo en (`x`, `suelo`) y un adulto de `alto`
 * píxeles: centrado en sus pies y, si se separan más de lo que abarca el aro de
 * siempre, del tamaño que los abarque con su holgura. Siempre con el mismo aplastado, que es
 * el de un círculo en el suelo a la cámara del contrato.
 */
export function aroDeFigura(
  c: { readonly x: number; readonly suelo: number; readonly alto: number },
  pies: PiesDeLaFigura | null,
): AroEnPantalla {
  const p = pies ?? SIN_MEDIR;
  // Los pies, con su holgura, en la elipse: (lado / r)² + (hondo / (r · aplastado))² ≤ 1.
  const lado = p.ancho / 2 + HOLGURA.lado;
  const hondo = (p.hondo / 2 + HOLGURA.hondo) / ARO_DE_FIGURA.aplastado;
  const radio = Math.max(ARO_DE_FIGURA.radio, Math.sqrt(lado * lado + hondo * hondo));
  return {
    x: c.x + p.x * c.alto,
    y: c.suelo - p.y * c.alto,
    rx: radio * c.alto,
    ry: radio * ARO_DE_FIGURA.aplastado * c.alto,
  };
}
