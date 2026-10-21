/**
 * El recinto de una ciudad, del núcleo (`core/map/recinto.ts`; la ciudad
 * amurallada, vuelta 3, fase 1). Dónde está el 3 × 3 de cada ciudad lo dice el
 * núcleo, y él no pone nada dentro, ni dos que se toquen, ni una ciudad en el
 * borde, ni el héroe de salida dentro de su base: decisiones del usuario del
 * 21-10-2026 tras el QA de la vuelta 2 (H4, H5, H6). La escena lo lee y lo pinta
 * (`recinto-en-la-escena.test.ts`).
 *
 * Por dónde se entra (que el héroe no pise la muralla) es la fase 2: aquí el
 * recinto aún se pisa entero.
 */
import { describe, expect, it } from 'vitest';
import {
  caraHacia,
  contornoDelRecinto,
  dentroDelContorno,
} from '../src/client/render/escenario/recinto.js';
import { RESPONSE_FORMAT } from '../src/core/contract/agent.js';
import { buildMap, validateMapPlan } from '../src/core/map/generate.js';
import {
  cabeElRecinto,
  centroDeLaCiudad,
  centroDelRecinto,
  LADO_DEL_RECINTO,
  ORDEN_DEL_INICIO,
  PUERTAS_DE_LA_CIUDAD,
  problemasDeRecintos,
  recintoDeLaCiudad,
  SEPARACION_DE_CIUDADES,
} from '../src/core/map/recinto.js';
import { estructura } from '../src/core/map/regiones.js';
import { rioBajoLaCiudad } from '../src/core/map/rio.js';
import { baseOf } from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import { planDeNodos } from './helpers.js';
import { rango, segunPrisa } from './lento.js';

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('el 3 × 3 de una ciudad (`recintoDeLaCiudad`)', () => {
  it('es el 3 × 3 con la ciudad en el medio', () => {
    expect(LADO_DEL_RECINTO).toBe(3);
    expect(recintoDeLaCiudad({ x: 10, y: 10 }, 30, 30)).toEqual({ i0: 9, j0: 9, i1: 11, j1: 11 });
    expect(recintoDeLaCiudad({ x: 1, y: 28 }, 30, 30)).toEqual({ i0: 0, j0: 27, i1: 2, j1: 29 });
  });

  it('en el borde no cabe, y lanza diciéndolo: no se corre hacia dentro', () => {
    expect(cabeElRecinto({ x: 1, y: 1 }, 30, 30)).toBe(true);
    expect(cabeElRecinto({ x: 28, y: 28 }, 30, 30)).toBe(true);
    for (const p of [
      { x: 0, y: 5 },
      { x: 5, y: 0 },
      { x: 29, y: 5 },
      { x: 5, y: 29 },
    ])
      expect(cabeElRecinto(p, 30, 30), `(${p.x},${p.y})`).toBe(false);
    expect(() => recintoDeLaCiudad({ x: 0, y: 29 }, 30, 30)).toThrow(
      'el recinto de la ciudad con el medio en (0,29) no cabe en un mapa de 30×30: mide 3 de lado y una ciudad va a una casilla del borde o más',
    );
  });

  it('el de una ciudad-puente va en su orilla, con el medio a dos casillas de ella', () => {
    expect(centroDelRecinto({ x: 10, y: 10 }, undefined)).toEqual({ x: 10, y: 10 });
    expect(centroDelRecinto({ x: 10, y: 10 }, { x: 10, y: 11 })).toEqual({ x: 10, y: 12 });
    expect(centroDelRecinto({ x: 10, y: 10 }, { x: 9, y: 10 })).toEqual({ x: 8, y: 10 });
  });
});

describe('las puertas de una ciudad (`PUERTAS_DE_LA_CIUDAD`)', () => {
  it('seis: la del norte, la del sur y las diagonales; ni la del este ni la del oeste', () => {
    expect(Object.keys(PUERTAS_DE_LA_CIUDAD).sort()).toEqual(['n', 'ne', 'no', 's', 'se', 'so']);
    expect([...ORDEN_DEL_INICIO].sort()).toEqual(Object.keys(PUERTAS_DE_LA_CIUDAD).sort());
    for (const [cara, { casilla, accesos }] of Object.entries(PUERTAS_DE_LA_CIUDAD)) {
      const puerta = { x: casilla[0], y: casilla[1] };
      // La puerta, en el anillo; sus accesos, fuera, pegados a ella.
      expect(cheb(puerta, { x: 0, y: 0 }), cara).toBe(1);
      expect(accesos.length, cara).toBe(cara === 'n' || cara === 's' ? 1 : 3);
      for (const [x, y] of accesos) {
        expect(cheb({ x, y }, { x: 0, y: 0 }), `${cara} (${x},${y})`).toBe(2);
        expect(cheb({ x, y }, puerta), `${cara} (${x},${y})`).toBe(1);
      }
    }
  });

  it('desde cada acceso se entra por el arco de su cara en el octógono de la escena', () => {
    // La recta del centro del acceso al de la puerta cruza el octógono
    // (`contornoDelRecinto`) por su cara, a 0,1 o menos del medio, donde va el
    // arco: las tres de una diagonal cruzan su chaflán.
    const at = { x: 10, y: 10 };
    const contorno = contornoDelRecinto(recintoDeLaCiudad(at, 30, 30));
    for (const [cara, { casilla, accesos }] of Object.entries(PUERTAS_DE_LA_CIUDAD))
      for (const [dx, dy] of accesos) {
        const a = [at.x + dx + 0.5, at.y + dy + 0.5] as const;
        const b = [at.x + casilla[0] + 0.5, at.y + casilla[1] + 0.5] as const;
        let cruce: readonly [number, number] | undefined;
        for (let k = 0; k <= 1000 && cruce === undefined; k++) {
          const p = [a[0] + ((b[0] - a[0]) * k) / 1000, a[1] + ((b[1] - a[1]) * k) / 1000] as const;
          if (dentroDelContorno(contorno, p[0], p[1])) cruce = p;
        }
        if (cruce === undefined) throw new Error(`${cara} (${dx},${dy}): no entra en el octógono`);
        const k = caraHacia(contorno, cruce[0], cruce[1]);
        expect(k.cara, `${cara} (${dx},${dy})`).toBe(cara);
        expect(
          Math.hypot(cruce[0] - k.medio[0], cruce[1] - k.medio[1]),
          `${cara} (${dx},${dy})`,
        ).toBeLessThanOrEqual(0.1);
      }
  });
});

describe('lo que impide un recinto (`problemasDeRecintos`), dicho para quien hizo el plan', () => {
  // `planDeNodos`: Valdeluz en (5,4), con su recinto de (4,3) a (6,5).
  const { map } = buildMap(planDeNodos());

  it('el plan de prueba no tiene ninguno', () => {
    expect(validateMapPlan(planDeNodos())).toEqual([]);
  });

  it('una ciudad en el borde, y dos que se tocarían', () => {
    expect(
      problemasDeRecintos(map, [{ id: 'borde', name: 'Orilla', at: { x: 0, y: 4 } }], []),
    ).toEqual([
      'la ciudad "Orilla" (borde, en (0,4)) está en el borde del mapa: lleva un recinto amurallado de 3×3 casillas con ella en el medio, que no cabe; ponla a una casilla del borde o más',
    ]);
    // Dos donde no hay nada: (2,6), en la región A, y (6,6), en la B.
    expect(
      problemasDeRecintos(
        map,
        [
          { id: 'una', name: 'Una', at: { x: 2, y: 6 } },
          { id: 'otra', name: 'Otra', at: { x: 6, y: 6 } },
        ],
        [],
      ),
    ).toEqual([
      'las ciudades "Una" (una, en (2,6)) y "Otra" (otra, en (6,6)) llevan sus recintos a 4 casillas uno de otro: se tocarían; entre dos ciudades van 5 casillas o más, contando la diagonal como una',
    ]);
    expect(SEPARACION_DE_CIUDADES).toBe(5);
  });

  it('cualquier cosa dentro: una mina, un inicio o un grupo de asaltantes', () => {
    const plan = planDeNodos();
    expect(
      validateMapPlan({
        ...plan,
        mines: [...plan.mines, { at: { x: 6, y: 5 }, resource: 'gems' }],
      }),
    ).toEqual([
      'la mina de gems de (6,5) cae dentro del recinto de la ciudad "Valdeluz" (town-0, en (5,4)), de (4,3) a (6,5): dentro de su muralla solo va ella',
    ]);
    expect(
      validateMapPlan({
        ...plan,
        heroStarts: [{ player: 0, at: { x: 4, y: 4 } }, plan.heroStarts[1]!],
      }),
    ).toEqual([
      'el inicio del jugador 0 de (4,4) cae dentro del recinto de la ciudad "Valdeluz" (town-0, en (5,4)), de (4,3) a (6,5): dentro de su muralla solo va ella',
    ]);
    const valdeluz = { id: 'town-0', name: 'Valdeluz', at: { x: 5, y: 4 } };
    expect(
      problemasDeRecintos(
        map,
        [valdeluz],
        [{ quien: 'el grupo de asaltantes', at: { x: 6, y: 3 } }],
      ),
    ).toEqual([
      'el grupo de asaltantes de (6,3) cae dentro del recinto de la ciudad "Valdeluz" (town-0, en (5,4)), de (4,3) a (6,5): dentro de su muralla solo va ella',
    ]);
  });

  it('la prosa del agente lo dice con las cifras del núcleo', () => {
    const prosa = RESPONSE_FORMAT.map_generate;
    expect(prosa).toContain(
      `RECINTO amurallado de ${LADO_DEL_RECINTO}×${LADO_DEL_RECINTO} casillas`,
    );
    expect(prosa).toContain(`a ${SEPARACION_DE_CIUDADES} casillas o más`);
  });
});

describe('el generador deja sitio a cada recinto', () => {
  // En el bucle rápido, las de las parejas que se tocaban en la vuelta 2 (s2,
  // s13, s16, s21) y la del pasillo de s31; en la lenta, 1-40.
  const semillas = segunPrisa([2, 13, 16, 21, 31], rango(1, 40));

  it('ninguno en el borde, ninguno a menos de 5 de otro y nada dentro; el inicio, delante de una puerta', () => {
    let puentes = 0;
    for (const s of semillas) {
      const state = newGame({ seed: s });
      const { map } = state;
      const { regionDe } = estructura(map);
      const ciudades = state.towns.map((t) => ({ id: t.id, name: t.name, at: t.at }));
      expect(
        problemasDeRecintos(map, ciudades, [
          ...state.heroes.map((h) => ({ quien: `el héroe ${h.id}`, at: h.at })),
          ...state.raiders.map((r) => ({ quien: `el grupo ${r.id}`, at: r.at })),
        ]),
        `s${s}`,
      ).toEqual([]);
      // La ciudad-puente lleva el suyo en la orilla, a dos casillas por el eje.
      for (const c of ciudades) {
        if (!rioBajoLaCiudad(map, c.at)) continue;
        puentes++;
        const centro = centroDeLaCiudad(map, c.at, regionDe);
        expect(Math.abs(centro.x - c.at.x) + Math.abs(centro.y - c.at.y), `s${s} ${c.id}`).toBe(2);
      }
      // El héroe de salida, en un acceso de una puerta de su base: fuera de su
      // recinto y pegado a él. Que llegue por el tramo de su camino no se pide
      // (40 de 80 en 1-40): el camino aún no entra por las puertas (fase 2).
      for (const p of state.players) {
        const base = baseOf(state, p.id);
        const heroe = state.heroes.find((h) => h.owner === p.id);
        if (base === null || heroe === undefined)
          throw new Error(`s${s}: el ${p.id} sin base o sin héroe`);
        const puerta = Object.values(PUERTAS_DE_LA_CIUDAD).find(({ accesos }) =>
          accesos.some(
            ([dx, dy]) => base.at.x + dx === heroe.at.x && base.at.y + dy === heroe.at.y,
          ),
        );
        expect(
          puerta,
          `s${s}: el héroe del ${p.id} nace en (${heroe.at.x},${heroe.at.y}), fuera de los accesos de su base (${base.at.x},${base.at.y})`,
        ).toBeDefined();
      }
    }
    expect(puentes).toBeGreaterThan(0);
  });
});
