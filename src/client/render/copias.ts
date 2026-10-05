/**
 * Las copias que el cliente guarda para no rehacerlas a cada fotograma: una
 * caché acotada por bytes, y sobre ella las copias reducidas y entonadas que
 * pintan los volúmenes de la escena del mapa y las piezas sueltas.
 */
import { copiaEntonada, type Imagen, type Lienzo } from './escenario/pintar.js';

/**
 * Una caché acotada por bytes que olvida lo menos usado. Un `Map` recuerda el
 * orden de inserción: leer una entrada la vuelve a meter al final, así que la
 * primera es siempre la que hace más que no se usa.
 */
export class CacheDeLienzos<K, L extends { readonly width: number; readonly height: number }> {
  private readonly lienzos = new Map<K, L>();
  private bytes = 0;

  constructor(private readonly tope: number) {}

  get(clave: K): L | undefined {
    const c = this.lienzos.get(clave);
    if (c !== undefined) {
      this.lienzos.delete(clave);
      this.lienzos.set(clave, c);
    }
    return c;
  }

  set(clave: K, lienzo: L): void {
    this.lienzos.set(clave, lienzo);
    this.bytes += lienzo.width * lienzo.height * 4;
    for (const [vieja, c] of this.lienzos) {
      if (this.bytes <= this.tope) break;
      this.lienzos.delete(vieja);
      this.bytes -= c.width * c.height * 4;
    }
  }
}

/**
 * Las copias reducidas, una por (imagen, tono, tamaño en píxeles de dispositivo),
 * de todos los zooms que quepan en el tope. Escalar desde el módulo nativo en
 * cada fotograma costaba 13-16 ms por cada 1 000 volúmenes; una copia 1:1,
 * 3,5-4,7 ms. Volver a un zoom de antes sale de aquí y no rehace nada.
 *
 * 80 MB: lo menos con lo que el zoom máximo de 2560×1440 a densidad plena no se
 * rehace (0-48 copias rehechas al acercar; con 60, 19-99, y con 40 se rehacen
 * sin parar). Una partida entera, recorriendo el mapa y yendo y volviendo al
 * tope, pide 140-300 MB de copias distintas (medido el 2026-10-05, semillas 1
 * y 7).
 */
const reducidas = new CacheDeLienzos<number, Lienzo>(80_000_000);

/**
 * Un número por cada (imagen, tono) que se ha reducido alguna vez: con él la
 * clave de la caché es un número, y no una cadena construida por volumen y por
 * fotograma. Es de la sesión y no de la partida, así que dos escenas que piden
 * el mismo módulo comparten sus copias.
 */
const fuentes = new Map<string, Map<string, number>>();
let fuentesDadas = 0;

function fuenteDe(src: string, tono: string): number {
  let porTono = fuentes.get(src);
  if (porTono === undefined) {
    porTono = new Map();
    fuentes.set(src, porTono);
  }
  let n = porTono.get(tono);
  if (n === undefined) {
    n = fuentesDadas++;
    porTono.set(tono, n);
  }
  return n;
}

/** Lo más que mide una copia por lado: cabe en los bits de la clave. */
const LADO_MAXIMO = 8192;

/**
 * La última copia hecha de cada (imagen, tono), del tamaño que fuera: lo que se
 * pinta, ampliado o reducido, mientras la de este tamaño espera su turno
 * (`copiaReducidaSiCabe`). Es una por fuente, aparte de la caché, así que no la
 * echa el tope.
 */
const ultimas = new Map<number, Lienzo>();

/**
 * Cuántos píxeles de copias nuevas se hacen como mucho en un fotograma: el
 * primer fotograma con volúmenes las pide todas a la vez, y otras tantas cada
 * paso de rueda. Lo que no cabe se hace en los fotogramas siguientes. Se cuentan
 * píxeles y no copias porque lo que cuesta es el tamaño; una copia que sola pase
 * del tope se hace igual, sola en su fotograma. Con 1,5 M, ninguna tarea de más
 * de 100 ms al hacer zoom en 1920×1080, 2560×1440, 3840×2160 ni la pantalla del
 * usuario (medido el 2026-10-05).
 */
export const PIXELES_NUEVOS_POR_FOTOGRAMA = 1_500_000;
let pixelesEnEsteFotograma = 0;

/** Empieza la cuenta de copias nuevas de un fotograma. */
export function empezarFotogramaDeCopias(): void {
  pixelesEnEsteFotograma = 0;
}

function claveDe(src: string, tono: string | undefined, w: number, h: number): number {
  if (w >= LADO_MAXIMO || h >= LADO_MAXIMO)
    throw new Error(`la copia de ${src} mediría ${w}×${h} px: no se reduce nada tan grande`);
  return (fuenteDe(src, tono ?? '') * LADO_MAXIMO + w) * LADO_MAXIMO + h;
}

/**
 * La imagen `src` (`im`, ya cargada) con su `tono`, reducida a `ancho × alto`
 * píxeles de dispositivo: de la caché, o hecha ahora.
 */
export function copiaReducida(
  im: Imagen,
  src: string,
  tono: string | undefined,
  ancho: number,
  alto: number,
): Lienzo {
  const w = Math.max(1, Math.round(ancho));
  const h = Math.max(1, Math.round(alto));
  const clave = claveDe(src, tono, w, h);
  const hecha = reducidas.get(clave);
  if (hecha !== undefined) return hecha;
  const copia = copiaEntonada(im, tono, w, h);
  reducidas.set(clave, copia);
  ultimas.set(fuenteDe(src, tono ?? ''), copia);
  return copia;
}

/**
 * Como `copiaReducida`, pero sin pasar de `PIXELES_NUEVOS_POR_FOTOGRAMA` píxeles
 * de copias nuevas en el fotograma: si ya no cabe hacerla, la última copia de esa imagen
 * y tono de otro tamaño, y si no hay ninguna, `null` (la de este fotograma no se
 * pinta). Quien la pinte mira el tamaño.
 */
export function copiaReducidaSiCabe(
  im: Imagen,
  src: string,
  tono: string | undefined,
  ancho: number,
  alto: number,
): Lienzo | null {
  const w = Math.max(1, Math.round(ancho));
  const h = Math.max(1, Math.round(alto));
  const hecha = reducidas.get(claveDe(src, tono, w, h));
  if (hecha !== undefined) return hecha;
  if (pixelesEnEsteFotograma >= PIXELES_NUEVOS_POR_FOTOGRAMA)
    return ultimas.get(fuenteDe(src, tono ?? '')) ?? null;
  pixelesEnEsteFotograma += w * h;
  return copiaReducida(im, src, tono, w, h);
}
