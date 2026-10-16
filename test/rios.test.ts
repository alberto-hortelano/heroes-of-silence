/**
 * El río de una casilla (#144): la línea que deja dos regiones a dos pasos
 * (`lineasQueSeparan`, `separadasDeCerca`), cuándo se ve al pie de una meseta
 * (`aguaALaVista`) y cómo lo pinta el escenario. El río del generador —su
 * trazado, su continuidad y lo que se mide en el mapa hecho— está en
 * `rio.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { aguasDeLaEscena, nivelPintado } from '../src/client/render/escenario/escalon.js';
import { BARRERAS } from '../src/core/map/terrain.js';
import {
  ABIERTA,
  aguaALaVista,
  lineasQueSeparan,
  separadasDeCerca,
} from '../src/core/map/vestir.js';
import { rango } from './lento.js';

/**
 * El río es una línea de una casilla (`rio.ts`), y esa agua a su nivel es la
 * línea que deja dos regiones a dos pasos (`separadasDeCerca`), como el
 * acantilado entre dos niveles.
 */
describe('el río de una casilla', () => {
  /** Una rejilla de 7×5 con la columna 3 de `barrera` entre la región 0 (x < 3) y la 1 (x > 3). */
  function columna(barrera: number) {
    const W = 7;
    const H = 5;
    const tipos = new Int8Array(W * H).fill(ABIERTA);
    for (let y = 0; y < H; y++) tipos[y * W + 3] = barrera;
    return { W, H, tipos, nivel: new Array(W * H).fill(1) as number[] };
  }
  const AGUA = BARRERAS.indexOf('water');
  const ACANTILADO = BARRERAS.indexOf('cliff');
  const MONTAÑA = BARRERAS.indexOf('mountain');
  const todas = () => true;

  /** Una rejilla de 5×7 con la fila 3 de agua entre la región de arriba (y < 3, a `norte`) y la de abajo (y > 3, a `sur`); el agua, a ras de la más baja. */
  function fila(norte: number, sur: number) {
    const W = 5;
    const H = 7;
    const tipos = new Int8Array(W * H).fill(ABIERTA);
    const nivel = new Array(W * H).fill(0) as number[];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (y === 3) tipos[i] = AGUA;
        nivel[i] = y < 3 ? norte : y > 3 ? sur : Math.min(norte, sur);
      }
    return { W, H, tipos, nivel, i: 2 * W + 2, q: 4 * W + 2 };
  }

  it('las líneas que separan: agua entre dos iguales; acantilado o agua entre dos niveles', () => {
    expect(lineasQueSeparan(1, 2)).toEqual(['cliff', 'water']);
    expect(lineasQueSeparan(0, 0)).toEqual(['water']);
  });

  it('el agua al pie de lo alto se ve salvo con lo alto justo al norte y nada de agua al sur (paso 2b)', () => {
    // La meseta al sur: el río de una casilla queda a su espalda y se ve.
    const alSur = fila(1, 2);
    expect(aguaALaVista(alSur.W, alSur.H, alSur.tipos, alSur.nivel, 3 * alSur.W + 2, todas)).toBe(
      true,
    );
    expect(
      separadasDeCerca(
        alSur.W,
        alSur.H,
        alSur.tipos,
        alSur.nivel,
        alSur.i,
        alSur.q,
        1,
        2,
        todas,
        true,
      ),
    ).toBe(true);
    // La meseta al norte: su cara cuelga sobre el agua y la tapa; no separa.
    const alNorte = fila(2, 1);
    const m = 3 * alNorte.W + 2;
    expect(aguaALaVista(alNorte.W, alNorte.H, alNorte.tipos, alNorte.nivel, m, todas)).toBe(false);
    expect(
      separadasDeCerca(
        alNorte.W,
        alNorte.H,
        alNorte.tipos,
        alNorte.nivel,
        alNorte.i,
        alNorte.q,
        2,
        1,
        todas,
        true,
      ),
    ).toBe(false);
    // Con otra fila de agua al sur, la primera se ve (el río va a dos); si esa
    // otra fila no cuenta (se abre a la vez), no.
    alNorte.tipos[m + alNorte.W] = AGUA;
    alNorte.nivel[m + alNorte.W] = 1;
    expect(aguaALaVista(alNorte.W, alNorte.H, alNorte.tipos, alNorte.nivel, m, todas)).toBe(true);
    expect(
      aguaALaVista(alNorte.W, alNorte.H, alNorte.tipos, alNorte.nivel, m, (j) => j !== m + 5),
    ).toBe(false);
  });

  it('separadasDeCerca: su línea en medio, a su nivel, y a dos pasos justos', () => {
    const agua = columna(AGUA);
    const i = 2 * agua.W + 2;
    const q = 2 * agua.W + 4;
    expect(separadasDeCerca(agua.W, agua.H, agua.tipos, agua.nivel, i, q, 1, 1, todas)).toBe(true);
    // Entre dos niveles, el agua a ras de la más baja también, pero solo para
    // quien la pide (el 7d); a ras de la alta, no: sería un cañón bajo la
    // orilla baja.
    expect(separadasDeCerca(agua.W, agua.H, agua.tipos, agua.nivel, i, q, 1, 2, todas, true)).toBe(
      true,
    );
    expect(separadasDeCerca(agua.W, agua.H, agua.tipos, agua.nivel, i, q, 1, 2, todas)).toBe(false);
    expect(separadasDeCerca(agua.W, agua.H, agua.tipos, agua.nivel, i, q, 0, 1, todas, true)).toBe(
      false,
    );
    const acantilado = columna(ACANTILADO);
    expect(
      separadasDeCerca(
        acantilado.W,
        acantilado.H,
        acantilado.tipos,
        acantilado.nivel,
        i,
        q,
        1,
        2,
        todas,
      ),
    ).toBe(true);
    expect(
      separadasDeCerca(
        acantilado.W,
        acantilado.H,
        acantilado.tipos,
        acantilado.nivel,
        i,
        q,
        1,
        1,
        todas,
      ),
    ).toBe(false);
    // Un agua más baja que las dos orillas es un cañón, no su línea.
    const encajada = columna(AGUA);
    for (let y = 0; y < encajada.H; y++) encajada.nivel[y * encajada.W + 3] = 0;
    expect(
      separadasDeCerca(encajada.W, encajada.H, encajada.tipos, encajada.nivel, i, q, 1, 1, todas),
    ).toBe(false);
    // La montaña de una casilla no separa a nadie.
    const montaña = columna(MONTAÑA);
    expect(
      separadasDeCerca(montaña.W, montaña.H, montaña.tipos, montaña.nivel, i, q, 1, 1, todas),
    ).toBe(false);
    // Lo que `cuenta` deja fuera (lo que se abre a la vez) no separa.
    expect(separadasDeCerca(agua.W, agua.H, agua.tipos, agua.nivel, i, q, 1, 1, () => false)).toBe(
      false,
    );
    // A un paso se tocan, aunque haya agua alrededor.
    expect(separadasDeCerca(agua.W, agua.H, agua.tipos, agua.nivel, i, i + 1, 1, 1, todas)).toBe(
      false,
    );
  });

  // Paso 2b (16-10-2026): el río de una casilla al pie de una meseta, al este,
  // al oeste y al norte de ella (lo alto al sur). Lo alto se adelanta sobre lo
  // bajo (`ORILLA`, 0,06-0,3) y el agua se cierra donde queda encima, así que
  // pierde algo de su casilla, pero ninguna casilla del río baja de la mitad
  // (medido: 0,56-0,63 con las semillas 1-3; 0,88 entre iguales). Lo que tapa
  // encima —la ladera de 0,45 a su pie, el reborde de la espalda— es del
  // escenario y se mira en las capturas (`paso2b-cerca-*`).
  it.each([
    ['oeste', 1],
    ['este', 2],
    ['sur', 3],
  ] as const)(
    'el pintor: con lo alto al %s, el río de una casilla sigue con media casilla de agua (semilla %i)',
    (lado, semilla) => {
      const W = 9;
      const H = 9;
      const nivel = new Array(W * H).fill(1) as number[];
      const agua: number[] = [];
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (lado === 'sur') {
            if (y === 4) agua.push(i);
            if (y > 4) nivel[i] = 2;
          } else {
            if (x === 4) agua.push(i);
            if ((lado === 'oeste' && x < 4) || (lado === 'este' && x > 4)) nivel[i] = 2;
          }
        }
      const np = nivelPintado({ W, H, nivel, semilla });
      const a = aguasDeLaEscena({ W, H, nivel, agua }, np);
      const { R } = np;
      for (let k = 0; k < H; k++) {
        let llenos = 0;
        for (let t = 0; t < R; t++)
          for (let u = 0; u < R; u++) {
            const px = lado === 'sur' ? k * R + u : 4 * R + t;
            const py = lado === 'sur' ? 4 * R + t : k * R + u;
            if ((a.agua.alfa[py * np.ancho + px] as number) >= 128) llenos++;
          }
        expect(llenos / (R * R)).toBeGreaterThanOrEqual(0.5);
      }
    },
  );

  it('el pintor: un río de una casilla lleva agua entera, su barro y la espuma de sus dos orillas', () => {
    const W = 9;
    const H = 9;
    const nivel = new Array(W * H).fill(1) as number[];
    const agua: number[] = [];
    for (let y = 0; y < H; y++) agua.push(y * W + 4);
    const np = nivelPintado({ W, H, nivel, semilla: 1 });
    const a = aguasDeLaEscena({ W, H, nivel, agua }, np);
    const { R } = np;
    const fila = (m: { alfa: Uint8ClampedArray }, px: number) =>
      m.alfa[(4 * R + R / 2) * np.ancho + px] as number;
    const dentro = rango(4 * R, 5 * R - 1);
    // El agua, entera en tres cuartos de la casilla: la orilla no se la come.
    expect(dentro.filter((px) => fila(a.agua, px) === 255).length).toBeGreaterThanOrEqual(0.7 * R);
    // La espuma, un anillo en cada orilla y nada en medio.
    expect(fila(a.espuma, 4 * R + 1)).toBeGreaterThan(0);
    expect(fila(a.espuma, 5 * R - 2)).toBeGreaterThan(0);
    expect(fila(a.espuma, 4 * R + R / 2)).toBe(0);
    // El barro, una franja fina fuera: a una casilla ya no hay.
    expect(fila(a.barro, 4 * R - 1)).toBeGreaterThan(0);
    expect(fila(a.barro, 3 * R)).toBe(0);
    expect(fila(a.barro, 6 * R)).toBe(0);
    // Sin centro hondo: lo hondo es lo de agua a los cuatro lados (el lago).
    expect(dentro.every((px) => fila(a.hondo, px) === 0)).toBe(true);
  });
});
