/**
 * El cuerpo de una figura: su silueta sin lo fino (un asta, una pica, un arco),
 * que es lo que se mide para colocarla y para seguir su tronco. Lo leen el
 * empaquetado (`empaquetar.ts`, `apoyoEn`) y el encuadre del tronco
 * (`encuadre.ts`), y `ALFA_FIGURA`, el umbral de «aquí hay figura», casi todo el
 * taller.
 *
 * Vivía en `empaquetar.ts`, que importa `encuadre.ts`, y `encuadre.ts` lo
 * importaba de vuelta: el ciclo entre los dos se rompió sacándolo aquí (H3 de la
 * reorganización, 08-11-2026).
 */

/** Umbral de alfa para decir «aquí hay figura». */
export const ALFA_FIGURA = 64;

/**
 * Lo fino de una figura no es su cuerpo (QA del repintado, 30-10-2026, el piquero
 * imperial: «se mueve mucho el personaje… por la pica tan larga»): un asta, una
 * pica, una lanza, un arco o una espada de pocos píxeles de grueso. El radio de la
 * apertura que lo quita, en parte del lado mayor de la caja de la figura: con 0,02,
 * una figura de 160 px quita lo de menos de 7 px de grueso y deja brazos y piernas.
 */
const GROSOR_DE_LO_FINO = 0.02;

/** La silueta de un cuerpo: su máscara en la caja (1 = cuerpo) y la caja de lo que queda. */
export interface Cuerpo {
  readonly mascara: Uint8Array;
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
  /** La caja de lo que queda, en coordenadas absolutas e inclusiva. */
  readonly caja: readonly [number, number, number, number];
}

/** Las sumas de una máscara, para contar los unos de una ventana de un vistazo. */
function sumasDe(m: Uint8Array, w: number, h: number): Int32Array {
  const s = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let fila = 0;
    for (let x = 0; x < w; x++) {
      fila += m[y * w + x] as number;
      s[(y + 1) * (w + 1) + x + 1] = (s[y * (w + 1) + x + 1] as number) + fila;
    }
  }
  return s;
}

/** Cuántos unos hay en la ventana de radio `r` alrededor de (x, y), recortada a la máscara. */
function enLaVentana(s: Int32Array, w: number, h: number, x: number, y: number, r: number): number {
  const a = Math.max(0, x - r);
  const b = Math.max(0, y - r);
  const c = Math.min(w, x + r + 1);
  const d = Math.min(h, y + r + 1);
  const W = w + 1;
  return (
    (s[d * W + c] as number) -
    (s[b * W + c] as number) -
    (s[d * W + a] as number) +
    (s[b * W + a] as number)
  );
}

/**
 * El cuerpo de una figura en su caja `[x0, y0, x1, y1]`: la silueta (alfa ≥ `umbral`)
 * abierta (erosión y dilatación con un cuadrado de radio `GROSOR_DE_LO_FINO` del lado
 * mayor), que quita lo fino, y con lo de la silueta que queda a menos de ese radio de
 * lo abierto (las puntas del pie). Si la apertura se lo come todo, la silueta entera.
 */
export function cuerpoDe(
  alfa: (x: number, y: number) => number,
  [x0, y0, x1, y1]: readonly [number, number, number, number],
  umbral = ALFA_FIGURA,
): Cuerpo {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const silueta = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) silueta[y * w + x] = alfa(x0 + x, y0 + y) >= umbral ? 1 : 0;
  const r = Math.max(1, Math.round(GROSOR_DE_LO_FINO * Math.max(w, h)));
  const lleno = (2 * r + 1) * (2 * r + 1);
  const s = sumasDe(silueta, w, h);
  const erosion = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (silueta[y * w + x] && enLaVentana(s, w, h, x, y, r) === lleno) erosion[y * w + x] = 1;
  const se = sumasDe(erosion, w, h);
  const abierta = new Uint8Array(w * h);
  let hay = false;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (silueta[y * w + x] && enLaVentana(se, w, h, x, y, r) > 0) {
        abierta[y * w + x] = 1;
        hay = true;
      }
  // La apertura redondea las puntas del cuerpo (los dedos del pie, a 2 px del suelo en
  // el Y Bot): se le devuelve lo de la silueta que queda a menos de `r` de lo abierto.
  // Lo fino que sale más lejos (la pica) sigue fuera.
  let mascara = silueta;
  if (hay) {
    const sa = sumasDe(abierta, w, h);
    mascara = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (silueta[y * w + x] && enLaVentana(sa, w, h, x, y, r) > 0) mascara[y * w + x] = 1;
  }
  let cx0 = w;
  let cy0 = h;
  let cx1 = -1;
  let cy1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mascara[y * w + x]) {
        if (x < cx0) cx0 = x;
        if (x > cx1) cx1 = x;
        if (y < cy0) cy0 = y;
        cy1 = y;
      }
  if (cx1 < 0) throw new Error('una figura sin cuerpo: la silueta está vacía');
  return { mascara, x0, y0, w, h, caja: [x0 + cx0, y0 + cy0, x0 + cx1, y0 + cy1] };
}
