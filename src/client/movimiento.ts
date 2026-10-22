/**
 * Si quien mira pidió menos movimiento (`prefers-reduced-motion: reduce`): el
 * clima se queda quieto o casi —sin destellos ni partículas que corran— y se
 * sigue notando. Hasta el clima solo lo leía `rueda.css`; el lienzo no lo leía
 * nadie.
 *
 * Una sola consulta por página, con su escucha: cambiarlo en el sistema con la
 * página abierta vale en el fotograma siguiente, sin recargar.
 */
let reducido: boolean | null = null;

export function movimientoReducido(): boolean {
  if (reducido !== null) return reducido;
  if (typeof matchMedia !== 'function') {
    reducido = false;
    return reducido;
  }
  const consulta = matchMedia('(prefers-reduced-motion: reduce)');
  reducido = consulta.matches;
  consulta.addEventListener('change', (e) => {
    reducido = e.matches;
  });
  return reducido;
}
