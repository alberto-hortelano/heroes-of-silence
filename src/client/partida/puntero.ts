/**
 * El puntero de la partida (R7 de la reorganización, 07-11-2026: estaba en `main.ts`): el
 * ratón y el dedo sobre el lienzo —bajar, mover, soltar, salir y la rueda—, el minimapa y el
 * marco del tablero que se desplaza. Cada escena traduce el puntero de su pantalla; aquí se
 * reparte a la de ahora. Nada se registra al importarse: lo instala `main.ts`, en su sitio.
 */
import { enLienzo } from '../render/lienzo.js';
import { hastaQueLlegue } from './gestos.js';
import { esDeDentro, type PaginaDeLaPartida } from './pagina.js';

/**
 * `fichaALaVista` tras el `click` que el navegador saca de este mismo toque, que
 * llega después de `pointerup` y se apunta donde esté el dedo entonces: con el
 * panel ya desplazado, en un teléfono de 375×667 caía sobre «Contratar» y
 * contrataba sin que nadie viera la ficha (QA H6, 22-10-2026). Si el `click` no
 * llega (el dedo se arrastró), a los `ESPERA_DEL_CLIC` ms.
 */
function fichaTrasElClic(pagina: Pick<PaginaDeLaPartida, 'estado' | 'pedirFotograma'>): void {
  const { estado, pedirFotograma } = pagina;
  let hecho = false;
  const traer = (): void => {
    if (hecho) return;
    hecho = true;
    window.removeEventListener('click', traer, true);
    estado.fichaALaVista = true;
    pedirFotograma();
  };
  // En la captura: el `click` ya tiene su blanco y el desplazamiento llega en el
  // fotograma siguiente, cuando ya se ha repartido.
  window.addEventListener('click', traer, true);
  setTimeout(traer, ESPERA_DEL_CLIC);
}
const ESPERA_DEL_CLIC = 400;

/**
 * Los oyentes del puntero, en el orden de siempre: el marco que se desplaza, el lienzo (bajar,
 * mover, soltar, salir y la rueda) y el minimapa.
 */
export function instalarElPuntero(pagina: PaginaDeLaPartida): void {
  const { lienzo, canvas, minimapa, session, aventura, castillo, gestos, dentro } = pagina;
  const { estado, pedirFotograma } = pagina;
  lienzo.addEventListener('scroll', pedirFotograma, { passive: true });

  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const p = enLienzo(canvas, ev);
    if (session.scene === 'adventure') {
      aventura.bajar(p.x, p.y);
      canvas.setPointerCapture(ev.pointerId);
    }
    pedirFotograma();
  });

  canvas.addEventListener('pointermove', (ev) => {
    const p = enLienzo(canvas, ev);
    if (session.scene === 'town') {
      canvas.style.cursor = castillo.mover(p.x, p.y, performance.now()) ? 'pointer' : 'default';
    } else if (session.scene === 'battle') {
      gestos.mover(p.x, p.y);
    } else if (esDeDentro(dentro, session.scene)) {
      canvas.style.cursor = dentro[session.scene].de.mover(p.x, p.y) ? 'pointer' : 'default';
    } else {
      aventura.mover(p.x, p.y);
    }
    pedirFotograma();
  });

  canvas.addEventListener('pointerup', (ev) => {
    if (ev.button !== 0) return;
    const p = enLienzo(canvas, ev);
    if (session.scene === 'town') castillo.pulsar(p.x, p.y, performance.now());
    else if (esDeDentro(dentro, session.scene)) {
      const escena = session.scene;
      if (dentro[escena].de.pulsar(p.x, p.y) && escena === 'ayuntamiento') fichaTrasElClic(pagina);
    } else if (session.scene === 'battle') {
      gestos.soltar(p.x, p.y);
    } else if (aventura.soltar()) {
      if (hastaQueLlegue(pagina)) return;
      // Con el modo «marcar fallo» puesto, el clic es suyo y no mueve a nadie.
      if (estado.desarrollo?.activo === true) estado.desarrollo.clic(p.x, p.y);
      else aventura.pulsar(p.x, p.y, ev.pointerType === 'touch');
    }
    pedirFotograma();
  });

  canvas.addEventListener('pointerleave', () => {
    aventura.salir();
    gestos.salir();
    castillo.salir();
    for (const d of Object.values(dentro)) d.de.salir();
    pedirFotograma();
  });

  canvas.addEventListener(
    'wheel',
    (ev) => {
      if (session.scene !== 'adventure') return;
      ev.preventDefault();
      aventura.zoom(ev.deltaY < 0 ? 1 : -1, enLienzo(canvas, ev));
      pedirFotograma();
    },
    { passive: false },
  );

  minimapa.addEventListener('pointerdown', (ev) => {
    const r = minimapa.getBoundingClientRect();
    aventura.pulsarMinimapa(ev.clientX - r.left, ev.clientY - r.top, r.width, r.height);
    pedirFotograma();
  });
}
