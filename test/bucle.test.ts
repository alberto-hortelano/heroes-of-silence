/**
 * El bucle de dibujo de las tres páginas (`comun/bucle.ts`): un fotograma pedido dos veces
 * se pinta una, y un fallo al pintar no mata el bucle: lo recibe la página, que decide si
 * sigue. Sin navegador: `requestAnimationFrame` es una cola que el test suelta a mano.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bucleDeDibujo } from '../src/client/comun/bucle.js';

/** Los fotogramas pedidos al navegador y aún sin pintar. */
let cola: ((ahora: number) => void)[] = [];

beforeEach(() => {
  cola = [];
  vi.stubGlobal('requestAnimationFrame', (f: (ahora: number) => void) => {
    cola.push(f);
    return cola.length;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Pinta los fotogramas pedidos hasta ahora (no los que se pidan al pintarlos). */
function soltar(ahora: number): void {
  const ahoraEnCola = cola;
  cola = [];
  for (const f of ahoraEnCola) f(ahora);
}

describe('el bucle de dibujo', () => {
  it('pedir dos veces antes del fotograma pinta una; y pide otro solo si `pintar` dice que algo se mueve', () => {
    const pintados: number[] = [];
    let seMueve = true;
    const pedir = bucleDeDibujo({
      pintar: (ahora) => {
        pintados.push(ahora);
        return seMueve;
      },
      alFallar: () => {
        throw new Error('no ha fallado nada');
      },
    });
    pedir();
    pedir();
    expect(cola).toHaveLength(1);
    soltar(16);
    expect(pintados).toEqual([16]);
    // Algo se mueve: el siguiente ya está pedido, una vez.
    expect(cola).toHaveLength(1);
    seMueve = false;
    soltar(32);
    expect(pintados).toEqual([16, 32]);
    expect(cola).toHaveLength(0);
    // Quieto, hasta que algo vuelva a pedirlo.
    pedir();
    soltar(48);
    expect(pintados).toEqual([16, 32, 48]);
  });

  it('lo que se pide mientras se pinta no se pide dos veces', () => {
    let pedir: () => void = () => {};
    pedir = bucleDeDibujo({
      pintar: () => {
        pedir();
        return true;
      },
      alFallar: () => false,
    });
    pedir();
    soltar(16);
    expect(cola).toHaveLength(1);
  });

  it('un fallo al pintar no se traga ni mata el bucle: lo recibe la página, que decide si sigue', () => {
    const fallo = new Error('no se ha podido pintar la sonda');
    const dichos: unknown[] = [];
    let falla = true;
    let sigueTrasFallar = false;
    const pintados: number[] = [];
    const pedir = bucleDeDibujo({
      pintar: (ahora) => {
        if (falla) throw fallo;
        pintados.push(ahora);
        return false;
      },
      alFallar: (motivo) => {
        dichos.push(motivo);
        return sigueTrasFallar;
      },
    });
    pedir();
    // El fallo no sale del fotograma: lo dice la página, con el mismo motivo.
    expect(() => soltar(16)).not.toThrow();
    expect(dichos).toEqual([fallo]);
    // Su política: no pedir otro (la arena, el espectador)…
    expect(cola).toHaveLength(0);
    // …o seguir (la partida, si algo se mueve).
    sigueTrasFallar = true;
    pedir();
    soltar(32);
    expect(dichos).toEqual([fallo, fallo]);
    expect(cola).toHaveLength(1);
    // Y el bucle sigue vivo: arreglado lo que fallaba, el siguiente se pinta.
    falla = false;
    soltar(48);
    expect(pintados).toEqual([48]);
    expect(cola).toHaveLength(0);
  });
});
