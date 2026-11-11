/**
 * Lo que cabe en la barra de abajo (`#status`), que tiene el alto fijo (B1 de QA,
 * 14-10-2026: con la barra creciendo al pasar el ratón, el lienzo encogía bajo el
 * cursor) y recorta a dos líneas, cuatro en la batalla (`style.css`). Lo que no cabe
 * se corta por **frases enteras** y dice dónde se lee entero: en el bocadillo del
 * lienzo (`title`), con el ratón quieto (#264, 11-11-2026). El recorte de la hoja
 * cortaba a mitad de cifra, y lo primero que se perdía de una carga era la armadura.
 *
 * Una granada con varios alcanzados o una «Cuenta» larga no caben siempre en cuatro
 * líneas a 1024 px: no hay previsión más larga a la que reservarle alto.
 */

/** Lo que se pone tras lo que cabe: dónde se lee entero. */
const SIGUE_EN_EL_LIENZO = ' … (entera, con el ratón quieto)';

/** Lo último que se puso en cada barra: el texto entero y lo que se ve de él. */
const PUESTO = new WeakMap<HTMLElement, { readonly entero: string; readonly visto: string }>();

/**
 * Pone `texto` en la barra `elStatus`; si no cabe, solo las frases del principio
 * que caben, con `SIGUE_EN_EL_LIENZO`, y el texto entero en el `title` de `lienzo`.
 * Si cabe, el lienzo se queda sin `title`. Con el mismo texto de antes no mide
 * otra vez (se llama en cada fotograma). Una frase acaba en punto y blanco: los
 * decimales van con coma (`conComa`). Con la página sin arrancar
 * (`data-sin-arrancar`, `partida/abrir.ts`) la barra se lee entera y no se toca.
 *
 * El corte no se rehace si cambia el ancho con el mismo texto: lo rehace el
 * siguiente cambio de texto (al mover el ratón).
 */
export function ponerEnLaBarra(elStatus: HTMLElement, texto: string, lienzo: HTMLElement): void {
  if (elStatus.dataset.sinArrancar !== undefined) return;
  const antes = PUESTO.get(elStatus);
  // Otro sitio pudo escribir la barra entre medias (la arena, fuera de la pelea).
  if (antes !== undefined && antes.entero === texto && antes.visto === elStatus.textContent) {
    return;
  }
  elStatus.textContent = texto;
  if (noCabe(elStatus)) {
    const frases = texto.split(/(?<=\.)\s+/);
    // De la más larga a la más corta: la primera que quepa. Con una sola frase
    // que no cabe, entera: la recorta la hoja, y el bocadillo la dice.
    for (let n = frases.length - 1; n >= 1; n--) {
      elStatus.textContent = `${frases.slice(0, n).join(' ')}${SIGUE_EN_EL_LIENZO}`;
      if (!noCabe(elStatus)) break;
    }
    lienzo.title = texto;
  } else if (lienzo.hasAttribute('title')) {
    lienzo.removeAttribute('title');
  }
  PUESTO.set(elStatus, { entero: texto, visto: elStatus.textContent ?? '' });
}

/** Si lo que hay en la barra pasa de lo que se ve (`line-clamp` recorta por abajo). */
function noCabe(el: HTMLElement): boolean {
  return el.scrollHeight > el.clientHeight;
}
