/**
 * La tirada de muralla de norte a sur (§29): las piezas `muro-ns-*` de un muro
 * que se aleja de la cámara, una detrás de otra, leídas como un solo muro.
 *
 * Cada pieza es un tramo RECTO (el adarve sube en vertical en pantalla) con sus
 * dos puntas cortadas en limpio y sin testeros, pedido con su guía
 * (`tools/taller/muros.ts`). Puestas una por paso en la misma columna (la
 * muralla del mapa) o a media cara (el recinto de una ciudad), el corte de la
 * de atrás asomaba a media tirada: «los muros perpendiculares están mal, están
 * como partidos por el medio» (el usuario, 21-10-2026; s16, town-0, y s41 (20,
 * 25-27)). Aquí cada pieza va a un paso de la de delante, el que casa sus
 * almenas con las de esa (`Pieza.tirada`, que deriva `pnpm taller
 * derivar-muros` desde las juntas de la guía): su corte cae dentro de la de
 * delante, que se pinta encima. Las piezas de antes no iban rectas y el paso
 * las corría de lado: en la muralla de paso de tres casillas el muro quedaba
 * torcido ~0,4 casillas (s105 (31, 36-39)).
 *
 * Es puro: medidas entran y piezas salen.
 */

/**
 * Lo que mide de fondo el adarve de un tramo de norte a sur, en veces su alto:
 * los dos tercios de arriba de la pieza (el de abajo es el muro que se ve de
 * frente; a 1,6 el adarve cubre 1,07 casillas, `ALTO_DEL_TRAMO_NORTE_SUR`).
 */
export const FONDO_DEL_ADARVE = 2 / 3;

/** Lo que una tirada necesita de su módulo: su alto nativo y su paso (`Pieza.tirada`). */
export interface ModuloDeTirada {
  readonly nh: number;
  readonly tirada: readonly [number, number];
}

/** Una pieza de una tirada: su pie (`y`, el de su ancla) y su x (la del medio de la imagen). */
export interface PiezaDeTirada {
  readonly x: number;
  readonly y: number;
}

/** El paso de una tirada en casillas, a `alto`: lo que se corre cada pieza respecto de la de delante. */
export function pasoEnCasillas(m: ModuloDeTirada, alto: number): readonly [number, number] {
  const [dx, dy] = m.tirada;
  return [(dx * alto) / m.nh, (dy * alto) / m.nh];
}

/**
 * Las piezas de una tirada de norte a sur en `x`, de delante (la primera) a
 * atrás, todas del mismo módulo y a `alto`: la de delante con el pie en `sur`,
 * donde iba siempre (la torre o la puerta de esa punta, que se pinta después,
 * la tapa igual), y detrás las que hagan falta para que su adarve (de cada pie
 * hacia el norte, `FONDO_DEL_ADARVE` de su alto) llegue a `norte` salvo
 * `2 · holgura` (lo que cubre la torre o la puerta de la punta norte, que la
 * tirada pisa por delante). De lado, centrada en `x`: lo poco que el paso se
 * corre (el arte es recto, `TORCIDO_MAXIMO` del taller), repartido a los dos
 * lados. Con una pieza, la de siempre.
 */
export function tiradaNorteSur(
  m: ModuloDeTirada,
  alto: number,
  x: number,
  norte: number,
  sur: number,
  holgura = 0,
): PiezaDeTirada[] {
  if (!(sur > norte))
    throw new Error(`una tirada de norte a sur va de norte a sur: ${norte} → ${sur}`);
  const [px, py] = pasoEnCasillas(m, alto);
  if (!(py < 0))
    throw new Error(`el paso de una tirada de norte a sur va hacia arriba, y es ${py}`);
  const fondo = alto * FONDO_DEL_ADARVE;
  const falta = sur - norte - 2 * holgura - fondo;
  const piezas = 1 + Math.max(0, Math.ceil(falta / -py - 1e-9));
  return Array.from({ length: piezas }, (_, j) => ({
    x: x + (j - (piezas - 1) / 2) * px,
    y: sur + j * py,
  }));
}

/** Lo que el guardia lee de un sprite: una pieza de tirada o lo que tapa un testero. */
export interface SpriteDeTirada {
  readonly src: string | null;
  readonly x: number;
  readonly y: number;
  readonly alto: number;
  readonly nw: number;
  readonly nh: number;
  /** La clave del pintor (`claveDe`): lo que se pinta después va delante. */
  readonly clave: number;
}

/**
 * Lo que se tolera de más o de menos al comparar posiciones: la tirada las
 * escribe con la misma cuenta, así que solo es el redondeo.
 */
const TOLERANCIA = 1e-6;

/**
 * Las piezas de norte a sur que enseñan su testero a media tirada (la cara de
 * su punta de delante, el corte del muro: con las piezas de antes, un bloque
 * almenado que cruzaba el adarve): la que tiene
 * el pie bajo el adarve de otra del mismo muro que se pinta después (de su
 * ancho, `|Δx|` menos de la mitad del de la de delante) y no va a un paso de
 * esa (`tiradaNorteSur`: mismo módulo y alto, corrida su paso o menos y por su
 * sesgo), ni lo tapa en pantalla una torre o una puerta que se pinte después,
 * con el pie delante del suyo y la cima por encima de la del testero (`tapan`,
 * la junta de la muralla del mapa). Es `informe.testerosAMediaTirada`, y tiene
 * que estar vacío.
 */
export function testerosAMediaTirada(
  tramos: readonly SpriteDeTirada[],
  tapan: readonly SpriteDeTirada[],
  pasoDe: (src: string) => readonly [number, number] | undefined,
): string[] {
  const fuera: string[] = [];
  const anchoDe = (s: SpriteDeTirada) => (s.alto * s.nw) / s.nh;
  for (const a of tramos) {
    const delante = tramos.filter(
      (b) =>
        b !== a &&
        b.clave > a.clave &&
        Math.abs(b.x - a.x) < anchoDe(b) / 2 &&
        a.y > b.y - b.alto * FONDO_DEL_ADARVE + TOLERANCIA &&
        a.y < b.y - TOLERANCIA,
    );
    if (delante.length === 0) continue;
    const enSuTirada = delante.some((b) => {
      if (b.src !== a.src || b.alto !== a.alto || a.src === null) return false;
      const t = pasoDe(a.src);
      if (t === undefined) return false;
      const [px, py] = pasoEnCasillas({ nh: a.nh, tirada: t }, a.alto);
      const atras = b.y - a.y;
      return (
        atras <= -py + TOLERANCIA && Math.abs(a.x - b.x - (atras * px) / -py) < TOLERANCIA * 10
      );
    });
    if (enSuTirada) continue;
    // El testero es el tercio de abajo de la pieza (lo que no es adarve): lo
    // tapa lo que se pinta después y lo cubre en pantalla de su pie a su cima.
    const cima = a.y - a.alto * (1 - FONDO_DEL_ADARVE);
    const tapado = tapan.some(
      (t) =>
        t.clave > a.clave &&
        Math.abs(t.x - a.x) < anchoDe(t) / 2 &&
        t.y >= a.y - TOLERANCIA &&
        t.y - t.alto <= cima,
    );
    if (tapado) continue;
    fuera.push(`${a.src} en ${a.x.toFixed(2)},${a.y.toFixed(2)}: su testero asoma a media tirada`);
  }
  return fuera;
}
