/**
 * Las cajas que se leen de arriba abajo con lo último al fondo —el parte de
 * guerra, la crónica, la voz del director— siguen al final, salvo que la persona
 * haya subido a leer (#198).
 *
 * Cada repintado es un `innerHTML` nuevo (`pintar`), y una caja recién creada
 * nace con `scrollTop = 0`: la última línea, la de lo que acaba de pasar, no se
 * veía hasta bajar a mano, y se volvía a esconder en la jugada siguiente. La
 * arena lo apañaba bajando siempre al fondo, que arrancaba de su sitio a quien
 * estaba leyendo una ronda de antes.
 *
 * La caja se marca en el marcado con `data-al-final="<cuál>"` y se empareja con
 * la de antes por ese nombre y su orden: el espectador pinta el parte dos veces
 * (el desenlace y el parte entero), y emparejar por posición juntaría la crónica
 * de la aventura con el parte de la batalla que la sustituye.
 */
import { type Html, pintar } from '../html.js';

/** Cómo estaba una caja antes de repintarla: lo que hace falta para decidir. */
export interface Desplazamiento {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

/**
 * Cuánto le falta al fondo para contar como «está al final». Un píxel no basta:
 * con zoom del navegador `scrollTop` es fraccionario y se queda a medio píxel
 * del fondo aun pegado a él.
 */
const HOLGURA_DEL_FINAL = 4;

/**
 * Dónde dejar la caja nueva. Sin caja de antes (la primera vez, o una caja que
 * acaba de aparecer), al final. Si estaba al final, al final de la nueva. Si la
 * persona había subido, donde estaba: lo que lee no se le mueve por debajo.
 */
export function desplazamientoTrasPintar(
  antes: Desplazamiento | undefined,
  altoNuevo: number,
): number {
  if (antes === undefined) return altoNuevo;
  const alFinal = antes.scrollHeight - antes.clientHeight - antes.scrollTop <= HOLGURA_DEL_FINAL;
  return alFinal ? altoNuevo : antes.scrollTop;
}

/** La clave de cada caja marcada dentro de `destino`: su nombre y su orden. */
function cajasDe(destino: Element): Map<string, Element> {
  const vistas = new Map<string, number>();
  const cajas = new Map<string, Element>();
  for (const caja of destino.querySelectorAll('[data-al-final]')) {
    const nombre = caja.getAttribute('data-al-final') ?? '';
    const n = vistas.get(nombre) ?? 0;
    vistas.set(nombre, n + 1);
    cajas.set(`${nombre}#${n}`, caja);
  }
  return cajas;
}

/** `pintar`, y cada caja marcada que se repinta sigue al final o se queda donde la dejaron. */
export function pintarSiguiendoElFinal(destino: Element, contenido: Html): void {
  const antes = new Map<string, Desplazamiento>();
  for (const [clave, caja] of cajasDe(destino)) {
    antes.set(clave, {
      scrollTop: caja.scrollTop,
      scrollHeight: caja.scrollHeight,
      clientHeight: caja.clientHeight,
    });
  }
  pintar(destino, contenido);
  for (const [clave, caja] of cajasDe(destino)) {
    caja.scrollTop = desplazamientoTrasPintar(antes.get(clave), caja.scrollHeight);
  }
}
