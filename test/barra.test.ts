/**
 * Lo que cabe en la barra de abajo (`ponerEnLaBarra`, #264, 11-11-2026): lo que no
 * cabe se corta por frases enteras, dice dónde se lee entero y lo entero va al
 * `title` del lienzo. Sin navegador: una barra de mentira que mide el texto por
 * caracteres (cuarenta por línea, dos líneas), que es lo único que la función le
 * pregunta (`scrollHeight` frente a `clientHeight`). Lo de verdad, a 1024, 1100 y
 * 1440 px, lo mira la pasada `arena` de `pnpm capturas`.
 */
import { describe, expect, it } from 'vitest';
import { ponerEnLaBarra } from '../src/client/comun/barra.js';

const POR_LINEA = 40;
const LINEA = 20;

/** Una barra de dos líneas de `POR_LINEA` caracteres que cuenta cuántas veces la miden. */
function barraDeMentira(): { el: HTMLElement; medidas: () => number } {
  let medidas = 0;
  const el = {
    dataset: {} as DOMStringMap,
    textContent: '' as string | null,
    clientHeight: 2 * LINEA,
    get scrollHeight(): number {
      medidas++;
      return Math.ceil((this.textContent ?? '').length / POR_LINEA) * LINEA;
    },
  };
  return { el: el as unknown as HTMLElement, medidas: () => medidas };
}

/** Un lienzo de mentira: solo su `title`. */
function lienzoDeMentira(): HTMLElement {
  const attrs = new Map<string, string>();
  return {
    get title(): string {
      return attrs.get('title') ?? '';
    },
    set title(t: string) {
      attrs.set('title', t);
    },
    hasAttribute: (n: string) => attrs.has(n),
    removeAttribute: (n: string) => void attrs.delete(n),
  } as unknown as HTMLElement;
}

describe('la barra de abajo corta por frases y dice dónde se lee entero', () => {
  it('lo que cabe va entero y el lienzo se queda sin bocadillo', () => {
    const { el } = barraDeMentira();
    const lienzo = lienzoDeMentira();
    lienzo.title = 'de antes';
    ponerEnLaBarra(el, 'Daño 9–50. Sin contraataque.', lienzo);
    expect(el.textContent).toBe('Daño 9–50. Sin contraataque.');
    expect(lienzo.hasAttribute('title')).toBe(false);
  });

  it('lo que no cabe: las frases del principio que caben, sin partir ninguna, y lo entero en el lienzo', () => {
    const { el } = barraDeMentira();
    const lienzo = lienzoDeMentira();
    const texto =
      'Golpearías desde (9,3). Según la rueda, daño 3–75 por golpe. Contraataque con Daga: 0. Cuenta: ataque 7 contra defensa 3 ×1,4; −1 armadura.';
    ponerEnLaBarra(el, texto, lienzo);
    expect(el.textContent).toBe('Golpearías desde (9,3). … (entera, con el ratón quieto)');
    expect(el.scrollHeight).toBeLessThanOrEqual(el.clientHeight);
    expect(lienzo.title).toBe(texto);
    // Lo que se ve es el principio del texto, cortado tras un punto.
    const visto = (el.textContent ?? '').replace(' … (entera, con el ratón quieto)', '');
    expect(texto.startsWith(visto) && visto.endsWith('.')).toBe(true);
  });

  it('con el mismo texto no vuelve a medir; si otro escribió la barra, sí', () => {
    const { el, medidas } = barraDeMentira();
    const lienzo = lienzoDeMentira();
    ponerEnLaBarra(el, 'Daño 9–50.', lienzo);
    const tras = medidas();
    ponerEnLaBarra(el, 'Daño 9–50.', lienzo);
    expect(medidas()).toBe(tras);
    el.textContent = 'otro aviso';
    ponerEnLaBarra(el, 'Daño 9–50.', lienzo);
    expect(el.textContent).toBe('Daño 9–50.');
  });

  it('con la página sin arrancar, la barra no se toca: el porqué se lee entero', () => {
    const { el } = barraDeMentira();
    el.dataset.sinArrancar = 'si';
    el.textContent = 'falta la semilla — usa ?seed=1';
    ponerEnLaBarra(el, 'Cargando…', lienzoDeMentira());
    expect(el.textContent).toBe('falta la semilla — usa ?seed=1');
  });
});
