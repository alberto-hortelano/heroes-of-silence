/**
 * El acantilado, una línea de una casilla (#215).
 *
 * «Línea de 1 casilla: el generador adelgaza las franjas de acantilado a una
 * casilla (el borde de la meseta); el ancho que sobra pasa a la meseta, que se
 * pisa. Como en HoMM: meseta transitable, borde infranqueable salvo por
 * rampa» (el usuario). La auditoría 6 contó, en 10 semillas, 447 de 776
 * casillas de acantilado sin nada más bajo en cruz (353 en ocho vecinas):
 * franjas de 3-4 casillas al nivel alto con la caída solo en un borde, que la
 * escena cubría de roca.
 *
 * El guardia (`acantiladosSinCaida`) pide lo bajo **en ocho vecinas**: las
 * regiones son 8-conexas, y una línea en diagonal va en escalera con la casilla
 * del codo tocando lo bajo solo por la esquina. Sin ella la meseta y lo bajo se
 * tocarían en diagonal. Con eso, «toda casilla con lo bajo al lado» y «la
 * franja mide una de ancho» son la misma pregunta.
 */
import { describe, expect, it } from 'vitest';
import { analizar } from '../src/client/render/escenario/analizar.js';
import { relieve } from '../src/client/render/escenario/relieve.js';
import { buildMap, generateMapPlan } from '../src/core/map/generate.js';
import { acantiladosSinCaida } from '../src/core/map/regiones.js';
import { BARRERAS, esBarrera, type Nivel } from '../src/core/map/terrain.js';
import { ABIERTA, adelgazarAcantilados } from '../src/core/map/vestir.js';
import { createRng } from '../src/core/rng.js';
import { newGame } from '../src/core/state/setup.js';
import { rango, segunPrisa } from './lento.js';

const CORTADO = BARRERAS.indexOf('cliff');

/**
 * Un engorde a mano: un dígito es una casilla que se pisa de esa región, `/`
 * acantilado, `^` montaña y `N` un nodo (sobre acantilado, como lo deja el
 * engorde).
 */
function engorde(filas: readonly string[]) {
  const W = (filas[0] as string).length;
  const H = filas.length;
  const letras = filas.join('');
  const tipos = new Int8Array(W * H).fill(ABIERTA);
  const region = new Int32Array(W * H).fill(-1);
  const esNodo = new Uint8Array(W * H);
  for (const [i, c] of [...letras].entries()) {
    if (c === '/' || c === 'N') tipos[i] = CORTADO;
    else if (c === '^') tipos[i] = BARRERAS.indexOf('mountain');
    else region[i] = Number(c);
    if (c === 'N') esNodo[i] = 1;
  }
  const dibujo = (): string[] =>
    Array.from({ length: H }, (_, y) =>
      Array.from({ length: W }, (_, x) => {
        const i = y * W + x;
        if (esNodo[i] === 1) return 'N';
        if (tipos[i] === CORTADO) return '/';
        if (tipos[i] !== ABIERTA) return '^';
        return String(region[i]);
      }).join(''),
    );
  return { W, H, tipos, region, esNodo, dibujo };
}

/** Las parejas de casillas que se pisan de regiones distintas y se tocan en ocho vecinas: la red abierta. */
function seTocan(W: number, H: number, tipos: Int8Array, region: Int32Array): string[] {
  const fuera: string[] = [];
  for (let i = 0; i < W * H; i++)
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const x = (i % W) + dx;
      const y = Math.floor(i / W) + dy;
      if (x < 0 || x >= W || y >= H) continue;
      const j = y * W + x;
      if (tipos[i] === ABIERTA && tipos[j] === ABIERTA && region[i] !== region[j])
        fuera.push(`(${i % W},${Math.floor(i / W)})-(${x},${y})`);
    }
  return fuera;
}

/** El nivel de cada casilla de un engorde a mano: lo que se pisa, el de su región; el acantilado, el alto. */
const nivelDe = (tipos: Int8Array, region: Int32Array, niveles: readonly Nivel[], alto: Nivel) =>
  Int8Array.from(tipos, (t, i) =>
    t === ABIERTA ? (niveles[region[i] as number] as number) : alto,
  );

describe('adelgazarAcantilados: la meseta se come la franja hasta su borde', () => {
  it('una franja recta de tres se queda en la columna que toca lo bajo, y lo demás es de la meseta', () => {
    const e = engorde(['00///11', '00///11', '00///11', '00///11']);
    // Y el guardia muerde en la franja de antes: dos columnas sin caída.
    const antes = acantiladosSinCaida(
      e.W,
      e.H,
      (i) => e.tipos[i] === CORTADO,
      nivelDe(e.tipos, e.region, [2, 1], 2),
    );
    expect(antes.map((i) => i % e.W)).toEqual([2, 3, 2, 3, 2, 3, 2, 3]);
    expect(
      adelgazarAcantilados(e.W, e.H, e.tipos, e.region, e.esNodo, [2, 1], () =>
        nivelDe(e.tipos, e.region, [2, 1], 2),
      ),
    ).toBe(true);
    expect(e.dibujo()).toEqual(['0000/11', '0000/11', '0000/11', '0000/11']);
    const despues = nivelDe(e.tipos, e.region, [2, 1], 2);
    expect(acantiladosSinCaida(e.W, e.H, (i) => e.tipos[i] === CORTADO, despues)).toEqual([]);
  });

  it('nunca crece lo bajo: con la región alta a la derecha, la línea es la de la izquierda', () => {
    const e = engorde(['00///11', '00///11']);
    adelgazarAcantilados(e.W, e.H, e.tipos, e.region, e.esNodo, [0, 1], () =>
      nivelDe(e.tipos, e.region, [0, 1], 2),
    );
    expect(e.dibujo()).toEqual(['00/1111', '00/1111']);
  });

  it('en diagonal queda la escalera 8-conexa: el codo toca lo bajo por la esquina y la red sigue cerrada', () => {
    const e = engorde(['0000///1', '000///11', '00///111', '0///1111', '///11111', '//111111']);
    adelgazarAcantilados(e.W, e.H, e.tipos, e.region, e.esNodo, [2, 1], () =>
      nivelDe(e.tipos, e.region, [2, 1], 2),
    );
    expect(seTocan(e.W, e.H, e.tipos, e.region)).toEqual([]);
    const nivel = nivelDe(e.tipos, e.region, [2, 1], 2);
    expect(acantiladosSinCaida(e.W, e.H, (i) => e.tipos[i] === CORTADO, nivel)).toEqual([]);
    // Dos por fila: con una sola, (5,0) de la meseta tocaría (6,1) de lo bajo
    // por la esquina. La de la izquierda de cada pareja es el codo.
    expect(e.dibujo()).toEqual([
      '00000//1',
      '0000//11',
      '000//111',
      '00//1111',
      '0//11111',
      '0/111111',
    ]);
  });

  it('entre dos regiones al mismo nivel no se abre nada: no hay lado alto', () => {
    const e = engorde(['00///11', '00///11']);
    expect(
      adelgazarAcantilados(e.W, e.H, e.tipos, e.region, e.esNodo, [1, 1], () =>
        nivelDe(e.tipos, e.region, [1, 1], 2),
      ),
    ).toBe(false);
    expect(e.dibujo()).toEqual(['00///11', '00///11']);
  });

  it('junto a un nodo, ni le da una región que no tocaba ni lo deja con la meseta a los dos lados', () => {
    // El nodo (3,1) une la meseta 0 (por su eje oeste-este, la casilla de la
    // izquierda) y lo bajo 1. Abrir (3,0) y (3,2), que solo tocan la meseta, le
    // daría a la escena un eje norte-sur de la meseta a la meseta (`ejeDelPaso`).
    const e = engorde(['00///11', '00/N/11', '00///11']);
    // Lo abierto a mano: el pasillo del nodo hacia la meseta.
    e.tipos[2 + 7] = ABIERTA;
    e.region[2 + 7] = 0;
    adelgazarAcantilados(e.W, e.H, e.tipos, e.region, e.esNodo, [2, 1], () =>
      nivelDe(e.tipos, e.region, [2, 1], 2),
    );
    const [norte, , sur] = e.dibujo();
    expect([norte?.[3], sur?.[3]]).not.toEqual(['0', '0']);
    expect(seTocan(e.W, e.H, e.tipos, e.region)).toEqual([]);
  });
});

/** Las casillas de acantilado sin caída de un mapa, con el nivel de la escena. */
function sinCaidaEn(map: ReturnType<typeof newGame>['map']): string[] {
  const { nivel } = relieve(analizar(map));
  return acantiladosSinCaida(map.width, map.height, (i) => map.terrain[i] === 'cliff', nivel).map(
    (i) => `(${i % map.width},${Math.floor(i / map.width)})`,
  );
}

describe('en los mapas del procedimental, todo acantilado tiene lo bajo al lado (#215)', () => {
  it(`el mapa del juego, ${segunPrisa('tres con mucho acantilado', '1-200')}: ninguna casilla sin caída`, () => {
    // En `verify` eran las de la auditoría con acantilado (1, 34 y 80: 80, 60 y
    // 44 casillas sin caída antes de #215, en 34×34) y la 148. Desde #226 el
    // mapa es de 42×42 y la 1 y la 34 no llevan acantilado: van las tres de
    // 1-60 con más (16, 24 y 2: 81, 78 y 64 casillas, 09-10-2026); con las
    // fronteras onduladas (#229), 5, 32 y 3 (123, 110 y 82); con los ríos
    // (#144, 16-10-2026), 52, 36 y 53 (113, 86 y 86).
    let casillas = 0;
    for (const semilla of segunPrisa([52, 36, 53], rango(1, 200))) {
      const { map } = newGame({ seed: semilla });
      casillas += map.terrain.filter((t) => t === 'cliff').length;
      expect(sinCaidaEn(map), `s${semilla}`).toEqual([]);
    }
    expect(casillas).toBeGreaterThan(segunPrisa(100, 5000));
  });

  it(`24×24 y 64×64, ${segunPrisa('dos semillas', '1-40')}: lo mismo en las dos puntas del generador`, async () => {
    // En 64×64, s74 dejaba (33,37) a 1 en el generador y a 2 en la escena: el
    // nivel del engorde ponía la barrera bajo la ciudad de al lado.
    for (const lado of [24, 64])
      for (const semilla of segunPrisa([1, 74], rango(1, 40))) {
        await new Promise((r) => setTimeout(r, 0));
        const { map } = buildMap(
          generateMapPlan(createRng(semilla), { width: lado, height: lado }),
        );
        expect(sinCaidaEn(map), `${lado}×${lado} s${semilla}`).toEqual([]);
      }
    // Un 64×64 cuesta ~1 s desde #224: con más ciudades, más vestidos se
    // repiten por una silla (272 → 990 ms de media en 1-10, 09-10-2026). Por
    // eso suelta el hilo entre mapa y mapa: si no, el trabajador de vitest no
    // contesta a tiempo («Timeout calling onTaskUpdate»).
  }, 180_000);

  it('y muerde en un mapa real: una casilla de la meseta pegada a la línea, hecha acantilado, cuenta', () => {
    // La 52 desde los ríos (#144; la 5 desde las fronteras onduladas, #229; la
    // 2 desde #226, que en 42×42 dejó la 1 sin acantilado): la de más acantilado.
    const { map } = newGame({ seed: 52 });
    const { nivel } = relieve(analizar(map));
    const W = map.width;
    // Una casilla que se pisa junto a un acantilado sin nada más bajo en sus
    // ocho vecinas: la meseta de detrás de la línea.
    const i = map.terrain.findIndex((t, k) => {
      if (esBarrera(t)) return false;
      const x = k % W;
      const y = Math.floor(k / W);
      let junto = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= map.height) return false;
          const j = ny * W + nx;
          if ((nivel[j] as number) < (nivel[k] as number)) return false;
          if (map.terrain[j] === 'cliff') junto = true;
        }
      return junto && map.objects.every((o) => o.at.y * W + o.at.x !== k);
    });
    expect(i).toBeGreaterThanOrEqual(0);
    const conUnaMas = (j: number) => j === i || map.terrain[j] === 'cliff';
    expect(acantiladosSinCaida(W, map.height, conUnaMas, nivel)).toEqual([i]);
  });
});
