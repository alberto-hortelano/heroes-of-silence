/**
 * El lienzo a la medida de su caja, en píxeles de pantalla.
 *
 * Lo comparten el cliente que juega y el espectador. Antes cada uno lo medía con
 * `getBoundingClientRect` en cada fotograma —una consulta de maquetación sesenta
 * veces por segundo para un tamaño que casi nunca cambia—; ahora lo vigila un
 * `ResizeObserver` y el fotograma solo lee lo ya medido.
 */
/** La caja del lienzo, en píxeles CSS. */
export interface Medida {
  readonly width: number;
  readonly height: number;
}

/**
 * Cuántos píxeles de dispositivo se pintan como mucho en una caja de `medida` a
 * la densidad `dpr` de la pantalla, o `undefined` si todos los que tenga.
 */
export type Presupuesto = (medida: Medida, dpr: number) => number | undefined;

interface Lienzo {
  readonly ctx: CanvasRenderingContext2D;
  /**
   * El tamaño en píxeles CSS, con el contexto ya escalado por la densidad de la
   * pantalla: quien pinta trabaja en CSS y sale nítido en una pantalla retina.
   *
   * Con `presupuesto`, el lienzo no pasa de los píxeles de dispositivo que diga
   * para la caja de ahora: si la caja los pasa, se pinta a menos densidad que la
   * de la pantalla y el navegador lo amplía al componer
   * (`densidadConPresupuesto`). Quien pinta no se entera: sigue trabajando en
   * CSS, y lo que mide la densidad (`densidadDe`) lee la reducida. Se le pasa la
   * caja y no se le pide la cifra antes porque la caja se mide aquí: con la del
   * fotograma anterior, el presupuesto iba un fotograma tarde.
   */
  preparar(presupuesto?: Presupuesto): Medida;
  /**
   * Mide YA, sin esperar al observador. Para cuando quien pinta acaba de cambiar
   * algo que mueve la caja —la escena, que en el móvil cambia el ancho del
   * lienzo—: el `ResizeObserver` avisa después de maquetar, o sea DESPUÉS del
   * fotograma, y ese primer fotograma se pintaba con la medida de la escena
   * anterior. En el móvil eso centraba la cámara del mapa para el tamaño del
   * castillo y el clic caía en otra casilla: lo cazó `pnpm capturas`.
   */
  remedir(): void;
}

/** Vigila el tamaño de `canvas` y avisa con `alCambiar` cuando lo cambia. */
export function ajustarLienzo(canvas: HTMLCanvasElement, alCambiar: () => void): Lienzo {
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('este navegador no tiene canvas 2D');
  let medida = { width: 1, height: 1 };
  let dpr = 1;
  /** Los píxeles del último `preparar`, y la densidad que sale de ellos. */
  let presupuesto: number | undefined;
  let densidad = 1;
  const dimensionar = (): void => {
    densidad =
      presupuesto === undefined
        ? dpr
        : densidadConPresupuesto(dpr, medida.width, medida.height, presupuesto);
    const w = Math.max(1, Math.floor(medida.width * densidad));
    const h = Math.max(1, Math.floor(medida.height * densidad));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };
  const medir = (): void => {
    const rect = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    medida = { width: rect.width, height: rect.height };
    dimensionar();
    alCambiar();
  };
  medir();
  new ResizeObserver(medir).observe(canvas);
  // El zoom del navegador cambia la densidad sin cambiar la caja, y eso el
  // `ResizeObserver` no lo ve.
  window.addEventListener('resize', medir);
  return {
    ctx,
    remedir: medir,
    preparar(pedir) {
      const pixelesMaximos = pedir?.(medida, dpr);
      if (pixelesMaximos !== presupuesto) {
        presupuesto = pixelesMaximos;
        dimensionar();
      }
      ctx.setTransform(densidad, 0, 0, densidad, 0, 0);
      return medida;
    },
  };
}

/**
 * La densidad a la que se pinta una caja de `ancho × alto` px CSS en una pantalla
 * de `dpr` sin pasar de `pixelesMaximos` píxeles de dispositivo: la de la
 * pantalla si caben, y si no, la que los llena justo. Pura, para probarla.
 */
export function densidadConPresupuesto(
  dpr: number,
  ancho: number,
  alto: number,
  pixelesMaximos: number,
): number {
  if (!(pixelesMaximos > 0))
    throw new Error(`el presupuesto de un lienzo son píxeles, y ${pixelesMaximos} no lo es`);
  const area = ancho * alto;
  if (area <= 0 || pixelesDe(ancho, alto, dpr) <= pixelesMaximos) return dpr;
  return Math.sqrt(pixelesMaximos / area);
}

/** Los píxeles de dispositivo de una caja de `ancho × alto` px CSS a la densidad `dpr`. */
export function pixelesDe(ancho: number, alto: number, dpr: number): number {
  return ancho * alto * dpr * dpr;
}

/**
 * Cuántos píxeles del dispositivo hay por unidad del lienzo de destino, según su
 * transformación: lo que miden el fondo, la superficie, las piezas y las figuras
 * para componer a la resolución a la que se verán. Con `hypot` y no solo `a`, por
 * si la transformación gira: la sombra de la figura se pinta con una afín.
 */
export function densidadDe(ctx: CanvasRenderingContext2D): number {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b);
}
