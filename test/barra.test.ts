/**
 * Lo que cabe en la barra de abajo (`ponerEnLaBarra`, #264, 11-11-2026): lo que no
 * cabe se corta por frases enteras —si no cabe ni una, por sus «;», sus «, » o sus
 * palabras (H1 del QA)—, dice dónde se lee el resto —con ratón, en el bocadillo; sin
 * él, tocando la barra (H2)— y lo entero va al `title` del lienzo. Sin navegador: una
 * barra de mentira que mide el texto por caracteres (cuarenta por línea, dos líneas),
 * que es lo único que la función le pregunta (`scrollHeight` frente a `clientHeight`).
 * Lo de verdad, a 1024, 1100 y 1440 px, lo mira la pasada `arena` de `pnpm capturas`.
 */
import { describe, expect, it } from 'vitest';
import { ponerEnLaBarra, SIGUE_AL_TOCARLA, SIGUE_CON_EL_RATON } from '../src/client/comun/barra.js';

const POR_LINEA = 40;
const LINEA = 20;

/**
 * Una barra de dos líneas de `POR_LINEA` caracteres que cuenta cuántas veces la miden;
 * `tocar` hace lo que el toque de verdad: llama a quien escucha su `click`.
 */
function barraDeMentira(): { el: HTMLElement; medidas: () => number; tocar: () => void } {
  let medidas = 0;
  const oyentes: (() => void)[] = [];
  const el = {
    dataset: {} as DOMStringMap,
    textContent: '' as string | null,
    clientHeight: 2 * LINEA,
    get scrollHeight(): number {
      medidas++;
      return Math.ceil((this.textContent ?? '').length / POR_LINEA) * LINEA;
    },
    addEventListener: (tipo: string, f: () => void) => {
      if (tipo === 'click') oyentes.push(f);
    },
  };
  return {
    el: el as unknown as HTMLElement,
    medidas: () => medidas,
    tocar: () => {
      for (const f of oyentes) f();
    },
  };
}

/** Lo que se ve, sin el aviso del final; lanza si el aviso no está. */
function sinElAviso(visto: string, aviso: string): string {
  if (!visto.endsWith(aviso)) throw new Error(`la barra no acaba en el aviso: «${visto}»`);
  return visto.slice(0, -aviso.length);
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
    ponerEnLaBarra(el, texto, lienzo, true);
    expect(el.textContent).toBe(`Golpearías desde (9,3).${SIGUE_CON_EL_RATON}`);
    expect(el.scrollHeight).toBeLessThanOrEqual(el.clientHeight);
    expect(lienzo.title).toBe(texto);
    // Lo que se ve es el principio del texto, cortado tras un punto.
    const visto = sinElAviso(el.textContent ?? '', SIGUE_CON_EL_RATON);
    expect(texto.startsWith(visto) && visto.endsWith('.')).toBe(true);
  });

  // H1 del QA (11-11-2026): un hechizo de área junta a sus alcanzados con «;» en una sola
  // frase, que sola no cabía; quedaba entera y la hoja la recortaba a mitad de un
  // alcanzado, con el aviso fuera de la vista.
  it('una frase que sola no cabe se corta por sus «;», con el aviso a la vista', () => {
    const { el } = barraDeMentira();
    const lienzo = lienzoDeMentira();
    const texto =
      'Alcanzaría a Esqueleto: 3–9; a Zombi: 2–14; a Goblin: 4–12; a Orko: 1–5. Cuenta: poder 3.';
    ponerEnLaBarra(el, texto, lienzo, true);
    expect(el.scrollHeight).toBeLessThanOrEqual(el.clientHeight);
    expect(el.textContent).toBe(`Alcanzaría a Esqueleto: 3–9; a Zombi: 2–14${SIGUE_CON_EL_RATON}`);
    expect(lienzo.title).toBe(texto);
  });

  it('sin «;» que quepa, por sus «, »; la coma de un decimal no es un corte', () => {
    const { el } = barraDeMentira();
    // Con la coma del decimal como corte, cabría «…defensa ×1»: a mitad de cifra.
    const texto =
      'Carga de 3 casillas ×1,15, defensa ×1,4 y lo alto ×1,25 del muro, armadura −3 que no para nada.';
    ponerEnLaBarra(el, texto, lienzoDeMentira(), true);
    expect(el.scrollHeight).toBeLessThanOrEqual(el.clientHeight);
    expect(el.textContent).toBe(`Carga de 3 casillas ×1,15${SIGUE_CON_EL_RATON}`);
  });

  it('un corte que deja menos de la mitad de lo que cabe por palabras se salta', () => {
    const { el } = barraDeMentira();
    // La ayuda de la tropa en el móvil: por su primera «, » se quedaba en «Tu formación».
    const texto =
      'Tu formación, donde sale cada uno en cada batalla: pulsa a uno de los tuyos y luego una casilla verde.';
    ponerEnLaBarra(el, texto, lienzoDeMentira(), true);
    expect(el.scrollHeight).toBeLessThanOrEqual(el.clientHeight);
    expect(el.textContent).toBe(`Tu formación, donde sale cada uno en cada${SIGUE_CON_EL_RATON}`);
  });

  it('sin frase ni parte que quepa, por palabras; el blanco duro de una cifra no es un corte', () => {
    const { el } = barraDeMentira();
    // `conMiles` separa los miles con un blanco duro: cortar en él dejaría «…daño 1».
    const texto =
      'Golpearías a quien tienes delante: daño 1\u00A0200–2\u00A0400 o más si carga contra él con su lanza.';
    ponerEnLaBarra(el, texto, lienzoDeMentira(), true);
    expect(el.scrollHeight).toBeLessThanOrEqual(el.clientHeight);
    expect(el.textContent).toBe(`Golpearías a quien tienes delante: daño${SIGUE_CON_EL_RATON}`);
  });

  // H2 del QA: «con el ratón quieto» remitía en el móvil a un bocadillo que no existe.
  it('sin ratón, el aviso dice que se toque; tocarla la despliega y otro toque la pliega', () => {
    const { el, tocar } = barraDeMentira();
    const lienzo = lienzoDeMentira();
    const texto =
      'Golpearías desde (9,3). Según la rueda, daño 3–75 por golpe. Contraataque con Daga: 0.';
    ponerEnLaBarra(el, texto, lienzo, false);
    const cortada = `Golpearías desde (9,3).${SIGUE_AL_TOCARLA}`;
    expect(el.textContent).toBe(cortada);
    expect(el.dataset.cortada).toBe('');
    tocar();
    expect(el.textContent).toBe(texto);
    expect(el.dataset.desplegada).toBe('');
    // El fotograma siguiente pide el mismo texto: sigue desplegada.
    ponerEnLaBarra(el, texto, lienzo, false);
    expect(el.textContent).toBe(texto);
    tocar();
    expect(el.textContent).toBe(cortada);
    expect(el.dataset.desplegada).toBeUndefined();
    // Desplegada, el texto siguiente la pliega.
    tocar();
    ponerEnLaBarra(el, 'Daño 9–50.', lienzo, false);
    expect(el.textContent).toBe('Daño 9–50.');
    expect(el.dataset.desplegada).toBeUndefined();
    expect(el.dataset.cortada).toBeUndefined();
    // Lo que cabe no se despliega: no hay nada más que leer.
    tocar();
    expect(el.textContent).toBe('Daño 9–50.');
    expect(el.dataset.desplegada).toBeUndefined();
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
