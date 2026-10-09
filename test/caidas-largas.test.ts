/**
 * Ninguna caída al sur va recta diez casillas (#231).
 *
 * Tras la ondulación del reparto (#229) y las dos puertas de la mina (#230), las
 * caras rectas largas que quedaban (14 filas de ≥ 10 en 1-3000, `rectitud.ts`)
 * eran todas lo mismo: un desnivel que cae al sur por una frontera casi
 * horizontal. La línea de acantilado de 7a copia el borde del lado bajo, y una
 * región alta sobre el agua cae en su propio borde, porque el agua va a ras de
 * la más baja. La cara frontal es lo único del relieve que la cámara ve de
 * frente, y diez seguidas se leen como un muro de catálogo.
 *
 * El engorde las parte a trechos (`quebrarCaidas`, paso 7a'' de
 * `engordarFronteras`): corre un trozo una fila hacia lo bajo (el acantilado o
 * la montaña bajan, y 7a adelgaza lo de arriba) o muerde lo alto con el agua.
 * Junto a un nodo no toca nada, y lo que queda —o lo que une después el agua de
 * las esquinas que pasa a montaña— tira el vestido (`generate.ts`).
 */
import { describe, expect, it } from 'vitest';
import { analizar } from '../src/client/render/escenario/analizar.js';
import { relieve } from '../src/client/render/escenario/relieve.js';
import { BARRERAS } from '../src/core/map/terrain.js';
import {
  ABIERTA,
  CAIDA_LARGA,
  caidasLargas,
  quebrarCaidas,
  TRECHO_DEL_QUIEBRO,
} from '../src/core/map/vestir.js';
import { newGame } from '../src/core/state/setup.js';
import { rango, segunPrisa } from './lento.js';

const CORTADO = BARRERAS.indexOf('cliff');
const AGUA = BARRERAS.indexOf('water');

/**
 * Una meseta (región 0, nivel 2) arriba y un llano (región 1, nivel 0) abajo,
 * separados en la fila `frontera` por `barrera` (o sin ella, si es el agua de
 * debajo la que separa: entonces la fila es de la meseta y lo de abajo, agua).
 */
function meseta(W: number, H: number, frontera: number, barrera: 'cliff' | 'water') {
  const N = W * H;
  const tipos = new Int8Array(N).fill(ABIERTA);
  const region = new Int32Array(N);
  const nivel = new Int8Array(N);
  for (let i = 0; i < N; i++) {
    const y = Math.floor(i / W);
    const arriba = y <= frontera;
    region[i] = arriba ? 0 : 1;
    nivel[i] = arriba ? 2 : 0;
    if (barrera === 'cliff' && y === frontera) tipos[i] = CORTADO;
    if (barrera === 'water' && y > frontera) tipos[i] = AGUA;
  }
  return {
    N,
    tipos,
    region,
    nivel,
    esNodo: new Uint8Array(N),
    pasillo: new Uint8Array(N),
    cerca: new Uint8Array(N),
  };
}

/** Lo recto que queda en la fila `y`: los trozos seguidos de casillas que `igual` reconoce. */
function trozos(W: number, y: number, igual: (i: number) => boolean): number[] {
  const largos: number[] = [];
  let n = 0;
  for (let x = 0; x <= W; x++) {
    if (x < W && igual(y * W + x)) n++;
    else {
      if (n > 0) largos.push(n);
      n = 0;
    }
  }
  return largos;
}

describe('las caídas largas al sur (#231)', () => {
  it('a escala del 42×42: desde diez casillas, en trozos de cinco', () => {
    expect([CAIDA_LARGA, TRECHO_DEL_QUIEBRO]).toEqual([10, 5]);
  });

  it('se cuentan por fila, donde la casilla está más alta que la de debajo, desde CAIDA_LARGA', () => {
    const W = 14;
    const H = 4;
    const nivel = new Int8Array(W * H);
    // Fila 1, a 2 en x 1-12: una caída de 12; fila 2, a 1 salvo en x 6: dos de
    // 6 y 7, partidas.
    for (let x = 1; x <= 12; x++) nivel[W + x] = 2;
    for (let x = 0; x < W; x++) if (x !== 6) nivel[2 * W + x] = 1;
    expect(caidasLargas(W, H, nivel)).toEqual([{ y: 1, desde: 1, largo: 12 }]);
    // Una caída al norte no cuenta: es una espalda, que la cámara no ve.
    expect(caidasLargas(W, H, Int8Array.from(nivel).reverse())).toEqual([
      { y: 2, desde: 1, largo: 12 },
    ]);
  });

  it('el acantilado recto baja a trechos hacia lo bajo, sin dejar CAIDA_LARGA recto', () => {
    const W = 24;
    const H = 9;
    const m = meseta(W, H, 3, 'cliff');
    expect(quebrarCaidas(W, H, m.tipos, m.region, m.esNodo, m.pasillo, m.cerca, m.nivel)).toBe(
      true,
    );
    // Lo corrido es la fila de debajo, que pasa a acantilado (luego 7a adelgaza
    // la de arriba); lo que no, sigue en la fila 3.
    const corridos = trozos(W, 4, (i) => m.tipos[i] === CORTADO);
    expect(corridos.length).toBeGreaterThan(0);
    for (const t of corridos) expect(t).toBeGreaterThanOrEqual(2);
    for (const t of corridos) expect(t).toBeLessThanOrEqual(TRECHO_DEL_QUIEBRO);
    for (const t of trozos(W, 4, (i) => m.tipos[i] === ABIERTA))
      expect(t).toBeLessThan(CAIDA_LARGA);
    // Solo pasa lo que se pisa a barrera: nada se abre.
    for (let x = 0; x < W; x++) expect(m.tipos[3 * W + x]).toBe(CORTADO);
  });

  it('sobre el agua, el agua muerde lo alto a trechos', () => {
    const W = 24;
    const H = 9;
    const m = meseta(W, H, 3, 'water');
    expect(quebrarCaidas(W, H, m.tipos, m.region, m.esNodo, m.pasillo, m.cerca, m.nivel)).toBe(
      true,
    );
    const mordidos = trozos(W, 3, (i) => m.tipos[i] === AGUA);
    expect(mordidos.length).toBeGreaterThan(0);
    for (const t of mordidos) expect(t).toBeGreaterThanOrEqual(2);
    for (const t of trozos(W, 3, (i) => m.tipos[i] === ABIERTA))
      expect(t).toBeLessThan(CAIDA_LARGA);
  });

  it('junto a un nodo, en un pasillo o sin dos casillas detrás, no se corre nada', () => {
    const W = 24;
    const H = 9;
    // Todo cerca de un nodo.
    const a = meseta(W, H, 3, 'cliff');
    a.cerca.fill(1);
    const antes = Int8Array.from(a.tipos);
    expect(quebrarCaidas(W, H, a.tipos, a.region, a.esNodo, a.pasillo, a.cerca, a.nivel)).toBe(
      false,
    );
    expect([...a.tipos]).toEqual([...antes]);
    // La fila de debajo, pasillo.
    const b = meseta(W, H, 3, 'cliff');
    for (let x = 0; x < W; x++) b.pasillo[4 * W + x] = 1;
    expect(quebrarCaidas(W, H, b.tipos, b.region, b.esNodo, b.pasillo, b.cerca, b.nivel)).toBe(
      false,
    );
    // Lo bajo, de una fila de hondo: corrido, quedaría de nada.
    const c = meseta(W, 6, 3, 'cliff');
    expect(quebrarCaidas(W, 6, c.tipos, c.region, c.esNodo, c.pasillo, c.cerca, c.nivel)).toBe(
      false,
    );
  });

  // Las semillas con una cara de ≥ 10 en main (14ba6a1): s154 y s503 las parte
  // el engorde (agua y acantilado), s1361 una montaña con un nodo cerca, y s232
  // la unía el agua de las esquinas al pasar a montaña, después del engorde.
  const semillas = segunPrisa(
    [154, 232, 503, 1361],
    [...rango(1, 200), 264, 441, 503, 559, 701, 788, 992, 1026, 1075, 1361, 1415, 2726],
  );
  it(`en ${semillas.length} semillas, ninguna caída al sur del relieve de la escena llega a ${CAIDA_LARGA}`, () => {
    const largas: string[] = [];
    for (const s of semillas) {
      const { map } = newGame({ seed: s });
      const { nivel } = relieve(analizar(map));
      for (const c of caidasLargas(map.width, map.height, nivel))
        largas.push(`s${s} (${c.desde}-${c.desde + c.largo - 1}, ${c.y}) ${c.largo}`);
    }
    expect(largas).toEqual([]);
  });
});
