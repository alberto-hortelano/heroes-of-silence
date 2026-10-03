/**
 * El lienzo a la medida de su caja, en píxeles de pantalla.
 *
 * Lo comparten el cliente que juega y el espectador. Antes cada uno lo medía con
 * `getBoundingClientRect` en cada fotograma —una consulta de maquetación sesenta
 * veces por segundo para un tamaño que casi nunca cambia—; ahora lo vigila un
 * `ResizeObserver` y el fotograma solo lee lo ya medido.
 */
interface Lienzo {
  readonly ctx: CanvasRenderingContext2D;
  /**
   * El tamaño en píxeles CSS, con el contexto ya escalado por la densidad de la
   * pantalla: quien pinta trabaja en CSS y sale nítido en una pantalla retina.
   */
  preparar(): { readonly width: number; readonly height: number };
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
  const medir = (): void => {
    const rect = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    medida = { width: rect.width, height: rect.height };
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
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
    preparar() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return medida;
    },
  };
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
