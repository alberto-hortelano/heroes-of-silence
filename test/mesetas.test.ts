/**
 * Lo alto de un acantilado no se lee como suelo que se pisa (#205, auditoría 4
 * defecto 5).
 *
 * Una franja de acantilado de 2-3 casillas sube un nivel (la cresta de
 * `relieve`), pero arriba solo llevaba la cubierta de su suelo y unas piedras:
 * la meseta de nieve de s443 (14-16, 9-11) era igual que la nieve pisable de al
 * lado, y la de arena de s34 (17-22, 5-7), los mismos bloques bajos y huesos
 * que la arena que se pisa. Contando roca o masa de `ALTO_DE_LO_ALTO` (0,4),
 * 1 167 de 4 016 casillas de acantilado de 1-40 no tenían nada (251 sin ningún
 * sprite de 0,35, la medida de la auditoría). Ahora cada casilla lleva un pico
 * de su roca donde cabe (`cimaDeRoca`), y el informe lo cuenta
 * (`acantiladosLisos`): 2 en 1-40, dos casillas entre dos sendas.
 */
import { describe, expect, it } from 'vitest';
import { analizar } from '../src/client/render/escenario/analizar.js';
import {
  ALTO_DE_LO_ALTO,
  acantiladosLisos,
  RADIO_DE_OBJETO,
  type Sprite,
  sitioDe,
} from '../src/client/render/escenario/colocar.js';
import type { TerrainKind } from '../src/core/map/terrain.js';
import { partidaDe } from './helpers.js';
import { itLento, rango } from './lento.js';

/** Un sprite de clase `clase` y `alto` con el pie en `(x, y)`. */
const pieza = (clase: Sprite['clase'], x: number, y: number, alto: number) => ({
  clase,
  x,
  y,
  alto,
});

describe('acantiladosLisos: el guardia muerde', () => {
  // Una fila de tres: acantilado, acantilado, hierba.
  const terreno: TerrainKind[] = ['cliff', 'cliff', 'grass'];
  const nada = () => false;

  it('una casilla de acantilado sin roca ni masa de ALTO_DE_LO_ALTO cuenta', () => {
    const roca = pieza('roca', 0.5, 0.6, ALTO_DE_LO_ALTO);
    expect(acantiladosLisos([roca], terreno, 3, nada)).toEqual([1]);
  });

  it('la cubierta, por alta que sea, o la roca baja no la marcan como barrera', () => {
    const sprites = [
      pieza('cubierta', 0.5, 0.6, 0.9),
      pieza('roca', 1.5, 0.6, ALTO_DE_LO_ALTO - 0.01),
    ];
    expect(acantiladosLisos(sprites, terreno, 3, nada)).toEqual([0, 1]);
  });

  it('una masa la marca, y lo que se pisa nunca cuenta', () => {
    const sprites = [pieza('masa', 0.5, 0.6, 0.8), pieza('roca', 1.2, 0.9, 0.5)];
    expect(acantiladosLisos(sprites, terreno, 3, nada)).toEqual([]);
    expect(acantiladosLisos([], ['grass', 'grass', 'grass'], 3, nada)).toEqual([]);
  });

  it('la huella de un objeto (la tapa él y su reserva no deja poner nada) no cuenta', () => {
    expect(acantiladosLisos([], terreno, 3, (i) => i === 0)).toEqual([1]);
  });
});

/** Las casillas de la huella de ciudades, pueblos y nodos, contadas por fuera de `componer`. */
function huellaDeLosObjetos(semilla: number): Set<number> {
  const { map } = partidaDe(semilla);
  const W = map.width;
  const a = analizar(map);
  const huella = new Set<number>();
  for (const o of map.objects) {
    if (o.kind !== 'town' && o.kind !== 'village' && o.kind !== 'node') continue;
    const r = RADIO_DE_OBJETO[o.kind] as number;
    // La ciudad-puente (#144) se pinta en su orilla, y su puente tapa su casilla
    // y la de enfrente.
    const at = sitioDe(a, o);
    const lados = a.ciudadesPuente.get(o.id);
    if (lados !== undefined) for (const p of [o.at, lados.enfrente]) huella.add(p.y * W + p.x);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = at.x + dx;
        const y = at.y + dy;
        if (x >= 0 && y >= 0 && x < W && y < map.height && Math.hypot(dx, dy) < r)
          huella.add(y * W + x);
      }
  }
  return huella;
}

/** La esquina del cuadrado de 3 × 3 con más casillas de acantilado; en un empate, la primera. */
function masAcantiladoEn3x3(
  terreno: readonly TerrainKind[],
  W: number,
  H: number,
): readonly [number, number] {
  let mejor: readonly [number, number] = [0, 0];
  let max = -1;
  for (let y = 0; y + 2 < H; y++)
    for (let x = 0; x + 2 < W; x++) {
      let n = 0;
      for (let dy = 0; dy < 3; dy++)
        for (let dx = 0; dx < 3; dx++) if (terreno[(y + dy) * W + x + dx] === 'cliff') n++;
      if (n > max) {
        max = n;
        mejor = [x, y];
      }
    }
  return mejor;
}

/** Los lisos de la semilla, contados desde fuera con el mismo guardia y la huella derivada aquí. */
function lisosDe(semilla: number): number[] {
  const { map, escena: e } = partidaDe(semilla);
  const huella = huellaDeLosObjetos(semilla);
  return acantiladosLisos(e.sprites, map.terrain, e.W, (i) => huella.has(i));
}

/**
 * En `pnpm verify`, las de la auditoría: s34 y s443 (los recortes), s57 y s9
 * (las que más tenían: 17 y 8 sin nada de 0,35). Con las dos puertas de la mina
 * (#230, 09-10-2026) la s9 tiene una entre dos sendas, (16,31): la cuenta el
 * techo de 1-40, y en su lugar va la s36, la de más acantilado de 1-40 (144).
 */
const SEMILLAS_DE_LA_AUDITORIA = [34, 443, 57, 36];

/**
 * El techo en 1-40: casillas entre dos sendas donde ni el pico más estrecho
 * cabe. Eran 2 (s4 y s39); con los mapas de #210, 1 (s23), y con la senda que
 * no corta el agua en diagonal (#210), 3: s23 y dos de s14, donde el camino que
 * rodea el vértice de agua pasa ahora junto a un acantilado. Con las dos puertas
 * de la mina (#230, 09-10-2026), 1: s9 (16,31), con senda al norte y al este y un
 * nodo debajo.
 */
const TECHO_EN_1_40 = 3;

describe('en los mapas reales', () => {
  for (const semilla of SEMILLAS_DE_LA_AUDITORIA)
    it(`semilla ${semilla}: todo lo alto de un acantilado lleva roca, por fuera y por el informe`, () => {
      const { escena: e } = partidaDe(semilla);
      expect(lisosDe(semilla)).toEqual([]);
      expect(e.informe.acantiladosLisos).toBe(0);
    });

  it('s14 y s7: su meseta más ancha, casilla a casilla', () => {
    // Las cajas de la auditoría —s443 (14-16, 9-11) y s34 (17-22, 5-7)— ya no
    // caen en un acantilado con los niveles del mapa (#143): se mira el
    // cuadrado de 3 × 3 con más acantilado de cada una, que es lo que más se lee
    // como un llano. Con menos mesetas (#210), la s443 no lleva acantilado:
    // va la s1. Con el acantilado en línea (#215) no queda franja ancha: el
    // cuadrado es un codo de la línea, y en la s1 cae junto a una ciudad, cuya
    // huella no deja poner nada (como en `lisosDe`). Desde #226 (42×42) ni la
    // s1 ni la s34 llevan acantilado: iban las dos de 1-60 con más (s16 y s24,
    // 81 y 78 casillas); con las fronteras onduladas (#229, 09-10-2026), s5 y
    // s32 (123 y 110); con los ríos (#144, 16-10-2026), s52 y s36 (113 y 86);
    // con el río continuo (#144), que deja la s52 sin acantilado, s14 y s31
    // (111 y 92); sin agua de frontera fuera del río (QA del río continuo,
    // H3), s14 y s7 (111 y 104): la s31 se quedó sin acantilado.
    for (const semilla of [14, 7] as const) {
      const { map, escena: e } = partidaDe(semilla);
      const huella = huellaDeLosObjetos(semilla);
      const [x0, y0] = masAcantiladoEn3x3(map.terrain, e.W, e.H);
      const [x1, y1] = [x0 + 2, y0 + 2];
      const casillas = rango(y0, y1).flatMap((y) =>
        rango(x0, x1)
          .map((x) => y * e.W + x)
          .filter((i) => map.terrain[i] === 'cliff' && !huella.has(i)),
      );
      expect(casillas.length).toBeGreaterThan(0);
      for (const i of casillas) {
        const x = i % e.W;
        const y = Math.floor(i / e.W);
        const roca = e.sprites.filter(
          (s) =>
            (s.clase === 'roca' || s.clase === 'masa') &&
            s.alto >= ALTO_DE_LO_ALTO &&
            Math.floor(s.x) === x &&
            Math.floor(s.y) === y,
        );
        expect(roca.length, `s${semilla} (${x},${y})`).toBeGreaterThan(0);
      }
    }
  });

  it('el informe muerde en un mapa real: quitar la roca de una casilla la cuenta', () => {
    // La 16 y no la 34 desde #226: en 42×42 la 34 no lleva acantilado; la 52
    // desde los ríos (#144), que dejaron la 16 sin él; la 14 desde el río
    // continuo (#144), que dejó la 52 sin él.
    const { map, escena: e } = partidaDe(14);
    const i = map.terrain.findIndex((t, k) => t === 'cliff' && !huellaDeLosObjetos(14).has(k));
    expect(i).toBeGreaterThanOrEqual(0);
    const sin = e.sprites.filter(
      (s) => Math.floor(s.y) * e.W + Math.floor(s.x) !== i || s.clase === 'cubierta',
    );
    expect(acantiladosLisos(sin, map.terrain, e.W, () => false)).toContain(i);
  });

  itLento(`1-40: no más de ${TECHO_EN_1_40} casillas de acantilado lisas en total`, () => {
    const total = rango(1, 40).reduce((n, s) => {
      expect(partidaDe(s).escena.informe.acantiladosLisos).toBe(lisosDe(s).length);
      return n + lisosDe(s).length;
    }, 0);
    expect(total).toBeLessThanOrEqual(TECHO_EN_1_40);
  });
});
