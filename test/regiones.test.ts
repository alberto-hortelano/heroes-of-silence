/**
 * El mapa es una red de nodos (fase 2a de NuevaJugabilidad): la estructura se
 * COMPRUEBA, no se supone.
 *
 * Dos mitades. La primera es la validación (criterio 1): sobre `planDeNodos`,
 * un mapa escrito a mano, se rompe una cosa cada vez y se mira que el rechazo
 * diga **qué** y **dónde**, con el mismo plan sin la rotura pasando limpio. La
 * segunda es el generador (criterio 8): cientos de semillas, y en cada una lo
 * que el usuario pidió de las ciudades —grado ≥ 3, equilibrio entre las bases y
 * dos caminos de cada base a sus ciudades cercanas— medido desde fuera, con
 * `estructura` y no con las tripas del generador.
 */
import { describe, expect, it } from 'vitest';
import barrerasJson from '../data/barreras.json' with { type: 'json' };
import { mapPlanSchema } from '../src/core/contract/agent.js';
import { BARRERAS_DEL_MAPA, validarBarreras } from '../src/core/data.js';
import {
  buildMap,
  generateMapPlan,
  LADO_DEL_MAPA,
  type MapPlan,
  validateMapPlan,
} from '../src/core/map/generate.js';
import { type Estructura, estructura } from '../src/core/map/regiones.js';
import { BARRERAS, isWalkable, type TerrainKind } from '../src/core/map/terrain.js';
import { TIPOS_POR_MAPA } from '../src/core/map/vestir.js';
import { createRng } from '../src/core/rng.js';
import { auditarMapaDenso, planDeNodos } from './helpers.js';

/** Los fallos de la auditoría densa de un plan, construyéndolo. */
const densa = (plan: MapPlan): string[] => auditarMapaDenso(plan, buildMap(plan).map).fallos;

/** El plan de prueba con una cosa cambiada. */
function con(cambio: Partial<MapPlan>): MapPlan {
  return { ...planDeNodos(), ...cambio };
}

const columna = (x: number, y0 = 0, y1 = 8) => ({
  terrain: 'mountain' as const,
  from: { x, y: y0 },
  to: { x, y: y1 },
});

describe('la red se valida: cada rotura se dice con su sitio', () => {
  it('el plan de prueba es una red válida', () => {
    expect(validateMapPlan(planDeNodos())).toEqual([]);
    const red = estructura(buildMap(planDeNodos()).map);
    expect(red.regiones.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    // A la tocan la base y el nodo de abajo; B, esos dos y los dos del medio.
    const nodosDe = (id: string) =>
      red.regiones[red.regionPorId.get(id)!]!.nodos.map((n) => red.nodos[n]!.id).sort();
    expect(nodosDe('a')).toEqual(['node-0', 'town-0']);
    expect(nodosDe('b')).toEqual(['node-0', 'node-1', 'node-2', 'town-0']);
    expect(nodosDe('c')).toEqual(['node-1', 'node-2', 'town-2']);
  });

  it('un hueco en el muro se nombra: las dos casillas y las dos regiones', () => {
    // La cordillera de la columna 11, partida: queda abierta la (11,4).
    const plan = planDeNodos();
    const conHueco = con({
      walls: [...plan.walls.filter((m) => m.from.x !== 11), columna(11, 0, 3), columna(11, 5, 8)],
    });
    expect(validateMapPlan(conHueco)).toEqual([
      'las regiones "b" y "c" se tocan sin nodo entre (10,5) y (11,4): cierra ese paso con muro o pon un nodo en (11,4)',
    ]);
  });

  /**
   * El paso que se nombra, comprobado contra el terreno y no contra la frase:
   * las dos casillas son vecinas en diagonal, las dos pisables, y las dos
   * esquinas que dejan entre medias son muro. Es lo que hace que sea **el**
   * hueco y no un estrechamiento cualquiera del camino (M1 de la QA de la 2a).
   */
  function esPasoDiagonal(plan: MapPlan, mensaje: string): void {
    const m = /entre \((\d+),(\d+)\) y \((\d+),(\d+)\)/.exec(mensaje);
    expect(m, mensaje).not.toBeNull();
    const [px, py, qx, qy] = m!.slice(1).map(Number) as [number, number, number, number];
    expect(Math.abs(px - qx), mensaje).toBe(1);
    expect(Math.abs(py - qy), mensaje).toBe(1);
    const { map } = buildMap({ ...plan, nodes: [] });
    const t = (x: number, y: number) => map.terrain[y * map.width + x];
    expect([t(px, py), t(qx, qy)]).toEqual(['grass', 'grass']);
    expect([t(qx, py), t(px, qy)]).toEqual(['mountain', 'mountain']);
  }

  const tramo = (x: number, y: number) => ({
    terrain: 'mountain' as const,
    from: { x, y },
    to: { x, y },
  });

  it('un muro en escalera se cruza en diagonal, y se nombra ESE paso', () => {
    // La columna 11 cambiada por una escalera de tramos de una casilla. Antes
    // decía «entre (11,7) y (12,7)», que no es ningún hueco.
    const plan = planDeNodos();
    const escalera = con({
      walls: [
        ...plan.walls.filter((m) => m.from.x !== 11),
        ...[9, 10, 10, 11, 11, 12, 12, 13, 13].map((x, y) => tramo(x, y)),
      ],
    });
    const problemas = validateMapPlan(escalera);
    expect(problemas).toEqual([
      'las regiones "b" y "c" se tocan sin nodo entre (12,7) y (13,6), en diagonal: (13,7) y (12,6) son muro, pero entre dos esquinas se pasa; pon muro en (12,7) o en (13,6), o un nodo en (13,6)',
    ]);
    esPasoDiagonal(escalera, problemas[0]!);
  });

  it('un muro en diagonal pura se cruza en diagonal, y no se nombra el estrechamiento del borde', () => {
    // Antes decía «entre (10,5) y (11,5)», un paso recto que no cruza el muro.
    // QA lo vio con otra diagonal nombrando (15,0)-(16,0), la casilla entre el
    // borde y la cordillera de la 17: un estrechamiento por el que el camino
    // pasaba antes de llegar al hueco, y un nodo allí no arreglaba nada.
    const plan = planDeNodos();
    const diagonal = con({
      walls: [
        ...plan.walls.filter((m) => m.from.x !== 11),
        ...Array.from({ length: 9 }, (_, y) => tramo(17 - y, y)),
      ],
    });
    const problemas = validateMapPlan(diagonal);
    expect(problemas).toEqual([
      'las regiones "b" y "c" se tocan sin nodo entre (11,5) y (12,6), en diagonal: (12,5) y (11,6) son muro, pero entre dos esquinas se pasa; pon muro en (11,5) o en (12,6), o un nodo en (12,6)',
    ]);
    esPasoDiagonal(diagonal, problemas[0]!);
  });

  it('un trozo pisable sin región declarada se rechaza', () => {
    const plan = planDeNodos();
    const sinEste = con({ regions: plan.regions.filter((r) => r.id !== 'e') });
    expect(validateMapPlan(sinEste)).toEqual([
      'hay una zona pisable sin región declarada que incluye (23,0): declara ahí una región o ciérrala con muro',
    ]);
  });

  it('un nodo que toca una sola región no es un paso', () => {
    const plan = planDeNodos();
    const suelto = con({ nodes: [...plan.nodes, { x: 1, y: 1 }] });
    expect(validateMapPlan(suelto)).toEqual([
      'el nodo de (1,1) solo toca la región "a": un nodo es un paso entre dos regiones o más, ponlo en el muro que las separa',
    ]);
  });

  it('dos nodos vecinos se rechazan', () => {
    const plan = planDeNodos();
    const pegados = con({ nodes: [...plan.nodes, { x: 11, y: 3 }] });
    expect(validateMapPlan(pegados)).toEqual([
      'los nodos de (11,2) y (11,3) son vecinos: se pasaría de uno a otro sin pisar región; sepáralos',
    ]);
  });

  it('una región sin nodos no tiene entrada', () => {
    // La E partida en dos por una cordillera más: la mitad de la derecha
    // (columna 25) se declara región y no tiene paso.
    const plan = planDeNodos();
    const cerrada = con({
      walls: [...plan.walls, columna(24)],
      regions: [
        ...plan.regions.filter((r) => r.id !== 'e'),
        { id: 'e', name: 'Este', at: { x: 23, y: 7 } },
        { id: 'f', name: 'Isla', at: { x: 25, y: 4 } },
      ],
    });
    expect(validateMapPlan(cerrada)).toEqual([
      'la región "f" no tiene ningún nodo: no se puede entrar ni salir de ella',
    ]);
  });

  it('nada que no sea nodo se pone sobre un muro: ya no se sanea en silencio', () => {
    const plan = planDeNodos();
    const enLaSierra = con({ mines: [...plan.mines, { at: { x: 11, y: 0 }, resource: 'gems' }] });
    expect(validateMapPlan(enLaSierra)).toEqual([
      'la mina de gems en (11,0) cae sobre mountain: tiene que estar dentro de una región',
    ]);
    // Y sobre un nodo tampoco: ocupa casilla.
    const enElPaso = con({ chests: [{ at: { x: 11, y: 2 }, gold: 100 }] });
    expect(validateMapPlan(enElPaso)).toEqual(['(11,2) la ocupan dos cosas: un nodo y cofre']);
  });

  it('un camino sobre una barrera se rechaza diciendo la casilla; sobre un nodo vale', () => {
    // Se aceptaba en silencio y el cliente lo pintaba encima del muro (QA H4).
    const sobreLaSierra = con({
      roads: [
        { x: 10, y: 2 },
        { x: 11, y: 2 },
        { x: 11, y: 3 },
        { x: 40, y: 2 },
      ],
    });
    expect(validateMapPlan(sobreLaSierra)).toEqual([
      'el camino de (11,3) cae sobre mountain: un camino solo va por casillas que se pisan',
      'el camino de (40,2) se sale del mapa',
    ]);
    // El nodo abre su casilla de muro: un camino que lo cruza es lo normal.
    expect(
      validateMapPlan(
        con({
          roads: [
            { x: 10, y: 2 },
            { x: 11, y: 2 },
            { x: 12, y: 2 },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('muchos caminos malos dan una frase por clase, con las primeras casillas y cuántas más (N4)', () => {
    // 500 caminos fuera del mapa devolvían 500 frases al agente.
    const fuera = Array.from({ length: 500 }, (_, i) => ({ x: 100 + i, y: 0 }));
    const sobreLaSierra = [0, 1, 8, 3, 4, 5, 7].map((y) => ({ x: 11, y }));
    expect(validateMapPlan(con({ roads: [...sobreLaSierra, ...fuera] }))).toEqual([
      '7 casillas de camino caen sobre una barrera —(11,0) sobre mountain, (11,1) sobre mountain, (11,8) sobre mountain, (11,3) sobre mountain, (11,4) sobre mountain y 2 más—: un camino solo va por casillas que se pisan',
      '500 casillas de camino se salen del mapa: (100,0), (101,0), (102,0), (103,0), (104,0) y 495 más',
    ]);
    // Con dos, se nombran las dos y no hay «y N más».
    expect(
      validateMapPlan(
        con({
          roads: [
            { x: 40, y: 1 },
            { x: 41, y: 1 },
          ],
        }),
      ),
    ).toEqual(['2 casillas de camino se salen del mapa: (40,1), (41,1)']);
  });

  it('un muro torcido o fuera del mapa se rechaza antes de pintarlo', () => {
    const plan = planDeNodos();
    expect(
      validateMapPlan(
        con({
          walls: [...plan.walls, { terrain: 'mountain', from: { x: 0, y: 0 }, to: { x: 3, y: 3 } }],
        }),
      ),
    ).toEqual([
      'el muro de (0,0) a (3,3) no es recto: un tramo de muro va en una fila o en una columna, y uno en diagonal deja huecos por las esquinas',
    ]);
    expect(validateMapPlan(con({ walls: [...plan.walls, columna(30)] }))).toEqual([
      'el muro de (30,0) a (30,8) se sale del mapa',
    ]);
  });

  it('una ciudad no puede llevar el id que el motor reserva a nodos y pueblos', () => {
    const plan = planDeNodos();
    const tapada = con({
      towns: plan.towns.map((t) => (t.id === 'town-2' ? { ...t, id: 'node-1' } : t)),
    });
    expect(validateMapPlan(tapada).join(' ')).toMatch(
      /la ciudad "node-1" lleva un id que el motor reserva/,
    );
  });

  it('un nodo o una ciudad ABRE la casilla de muro en la que está, y nada más', () => {
    const { map } = buildMap(planDeNodos());
    const terreno = (x: number, y: number) => map.terrain[y * map.width + x];
    expect(terreno(11, 2)).toBe('dirt');
    expect(terreno(5, 4)).toBe('dirt');
    expect(terreno(11, 3)).toBe('mountain');
  });
});

describe('el suelo entero de una región', () => {
  it('se pinta la región entera y solo ella: ni los nodos ni la de al lado', () => {
    const plan = planDeNodos();
    const conSuelo = con({
      regions: plan.regions.map((r) => (r.id === 'b' ? { ...r, terrain: 'snow' as const } : r)),
    });
    expect(validateMapPlan(conSuelo)).toEqual([]);
    const { map } = buildMap(conSuelo);
    const t = (x: number, y: number) => map.terrain[y * map.width + x];
    // La región B son las columnas 6 a 10, de arriba abajo.
    for (let y = 0; y < 9; y++)
      for (let x = 6; x <= 10; x++) expect(t(x, y), `(${x},${y})`).toBe('snow');
    // A su izquierda sigue la hierba de A; los nodos y la base siguen de tierra,
    // y el muro sigue siendo muro.
    expect(t(4, 4)).toBe('grass');
    expect(t(12, 4)).toBe('grass');
    expect([t(5, 4), t(11, 2), t(11, 6), t(5, 8)]).toEqual(['dirt', 'dirt', 'dirt', 'dirt']);
    expect(t(5, 0)).toBe('mountain');
    // Y la región no se guarda con su suelo: el mapa solo sabe de la red.
    expect(map.regions.find((r) => r.id === 'b')).toEqual({
      id: 'b',
      name: 'Vega',
      at: { x: 8, y: 7 },
    });
  });

  it('una barrera como suelo de región se rechaza diciendo cuáles valen', () => {
    const plan = planDeNodos();
    const conAgua = con({
      regions: plan.regions.map((r) => (r.id === 'c' ? { ...r, terrain: 'water' as const } : r)),
    });
    expect(validateMapPlan(conAgua)).toEqual([
      'la región "c" pide de suelo "water", que no se pisa: el suelo de una región es uno de grass, dirt, sand, snow, swamp, lava, rough, y las barreras van en "walls"',
    ]);
    // El esquema lo deja pasar: quien lo rechaza es la puerta de los dos productores.
    expect(mapPlanSchema.safeParse(conAgua).success).toBe(true);
  });

  it('un suelo inventado se rechaza: no basta con no ser barrera (vuelta 2 de QA, N3)', () => {
    // `isWalkable` dice que sí a todo lo que no es barrera, y `"ice"` pasaba.
    const plan = planDeNodos();
    const conHielo = con({
      regions: plan.regions.map((r) =>
        r.id === 'c' ? { ...r, terrain: 'ice' as unknown as TerrainKind } : r,
      ),
    });
    expect(validateMapPlan(conHielo)).toEqual([
      'la región "c" pide de suelo "ice", que no es ningún terreno: el suelo de una región es uno de grass, dirt, sand, snow, swamp, lava, rough',
    ]);
  });
});

/** Saltos de nodo a nodo por regiones, sin pasar por `sin`. */
function saltos(red: Estructura, desde: number, sin: number | null): Map<number, number> {
  const dist = new Map<number, number>([[desde, 0]]);
  const cola = [desde];
  const vistas = new Set<number>();
  for (let q = 0; q < cola.length; q++) {
    const n = cola[q]!;
    for (const r of red.nodos[n]!.regiones) {
      if (vistas.has(r)) continue;
      vistas.add(r);
      for (const m of red.regiones[r]!.nodos) {
        if (m === sin || dist.has(m)) continue;
        dist.set(m, dist.get(n)! + 1);
        cola.push(m);
      }
    }
  }
  return dist;
}

/** Lo que el usuario pidió de las ciudades de un plan, medido desde fuera. */
function auditar(plan: MapPlan): string[] {
  const fallos: string[] = [];
  const { map } = buildMap(plan);
  const red = estructura(map);
  const bases = plan.towns.filter((t) => t.owner !== null).map((t) => red.nodoPorId.get(t.id)!);
  const neutrales = plan.towns.filter((t) => t.owner === null);
  if (neutrales.length < 2) fallos.push(`solo ${neutrales.length} ciudades neutrales`);
  for (const t of neutrales) {
    const grado = red.nodos[red.nodoPorId.get(t.id)!]!.regiones.length;
    if (grado < 3) fallos.push(`la ciudad ${t.id} es de grado ${grado}`);
  }
  const perfiles: string[] = [];
  for (const b of bases) {
    const d = saltos(red, b, null);
    const cerca = neutrales
      .map((t) => red.nodoPorId.get(t.id)!)
      .sort((x, y) => d.get(x)! - d.get(y)! || x - y)
      .slice(0, 2);
    perfiles.push(cerca.map((c) => d.get(c)).join(','));
    for (const c of cerca) {
      for (let n = 0; n < red.nodos.length; n++) {
        if (n === b || n === c) continue;
        if (!saltos(red, b, n).has(c)) {
          fallos.push(
            `quitando ${red.nodos[n]!.id}, ${red.nodos[b]!.id} pierde ${red.nodos[c]!.id}`,
          );
        }
      }
    }
  }
  if (perfiles[0] !== perfiles[1]) fallos.push(`perfiles distintos: ${perfiles.join(' / ')}`);
  return fallos;
}

describe('el generador hace redes como las pidió el usuario', () => {
  it(`200 semillas en ${LADO_DEL_MAPA}×${LADO_DEL_MAPA} y 20 en 48×48: válidas, ciudades de grado ≥ 3, equilibradas, con dos caminos y densas`, () => {
    const fallos: string[] = [];
    const fronteraTotal = new Set<string>();
    const conCamino: number[] = [];
    // Las 200 primeras y, además, las que encontró QA barriendo mil (H5, H6):
    // 864 y 986 se quedaban en tres barreras de frontera, y 987 con una
    // frontera de una casilla lejos de un nodo. Ninguna caía en las 200.
    const deQA = [864, 986, 987];
    const rango = (n: number) => Array.from({ length: n }, (_, k) => k + 1);
    for (const [lado, semillas] of [
      [LADO_DEL_MAPA, [...rango(200), ...deQA]],
      [48, rango(20)],
    ] as const) {
      for (const s of semillas) {
        const plan = generateMapPlan(createRng(s), { width: lado, height: lado });
        const dondeFalla = (f: string) => `${lado}×${lado} semilla ${s}: ${f}`;
        fallos.push(...validateMapPlan(plan).map(dondeFalla));
        fallos.push(...auditar(plan).map(dondeFalla));
        const { map } = buildMap(plan);
        const { fallos: deDensidad, frontera } = auditarMapaDenso(plan, map);
        if (lado === LADO_DEL_MAPA) {
          const pisables = map.terrain.filter((t) => isWalkable(t)).length;
          conCamino.push(map.roads.size / pisables);
        }
        fallos.push(...deDensidad.map(dondeFalla));
        for (const b of frontera.keys()) fronteraTotal.add(b);
        // Cuatro barreras que se vean, no cuatro nombres: cada una con su mínimo.
        const minimo = BARRERAS_DEL_MAPA.casillasMinimasPorTipo;
        const llenas = [...frontera].filter(([, n]) => n >= minimo);
        if (llenas.length < TIPOS_POR_MAPA) {
          const reparto = [...frontera].map(([b, n]) => `${b} ${n}`).join(', ');
          fallos.push(
            dondeFalla(
              `la frontera lleva ${llenas.length} barreras con ${minimo} casillas o más: ${reparto}`,
            ),
          );
        }
      }
    }
    expect(fallos).toEqual([]);
    // Las cinco barreras salen en alguna frontera.
    expect([...fronteraTotal].sort()).toEqual([...BARRERAS].sort());
    // Los caminos son un árbol por región y no una malla: con un camino de cada
    // nodo a cada otro, la mediana era el 41 % del suelo pisable y salían vías
    // dobles (QA H3). El árbol con sendas da el 36 %; el techo es una cifra
    // medida, y lo que guarda es que no vuelva la malla.
    conCamino.sort((a, b) => a - b);
    expect(conCamino[conCamino.length >> 1]).toBeLessThan(0.38);
  });

  it('la auditoría densa muerde: un mapa sin vestir no la pasa', () => {
    // El plan a mano tiene muro de una casilla, suelo sin declarar, ni un
    // obstáculo ni un camino: tiene que fallar en las cuatro cosas, o el test
    // de arriba sería verde por vacío.
    const fallos = densa(planDeNodos()).join('\n');
    expect(fallos).toMatch(/frontera de menos de 2 casillas/);
    expect(fallos).toMatch(/casillas de obstáculo, fuera de/);
    expect(fallos).toMatch(/no está en un camino/);
    // Y el de alcance: un monstruo en el único hueco de una fila de bosque deja
    // la fila de arriba de la región B a la que solo se llega por encima de él.
    const plan = planDeNodos();
    const cortada = {
      ...plan,
      walls: [
        ...plan.walls,
        { terrain: 'forest' as const, from: { x: 6, y: 1 }, to: { x: 7, y: 1 } },
        { terrain: 'forest' as const, from: { x: 9, y: 1 }, to: { x: 10, y: 1 } },
      ],
      monsters: [{ at: { x: 8, y: 1 }, creature: 'peasant', count: 3 }],
    };
    expect(validateMapPlan(cortada)).toEqual([]);
    expect(densa(cortada).join('\n')).toMatch(
      /en la región b, \(\d+,0\) no se alcanza desde sus nodos sin cruzar un monstruo/,
    );
  });

  it('cuando no sale, el error dice en qué fase se agotaron los intentos', () => {
    // En 12×12 las redes salen y lo que se agota es el vestido: sus fronteras no
    // dan para tres barreras distintas con su mínimo de casillas cada una (antes
    // de ese mínimo, en la vuelta 1 de QA, se agotaba en los objetos: no cabían
    // las catorce minas). Antes de partir el error decía «no sabe repartir
    // regiones equilibradas» fuera cual fuera la fase, y mentía.
    expect(() => generateMapPlan(createRng(1), { width: 12, height: 12 })).toThrow(
      /no sale un mapa de nodos de 12×12 en 20 redes: .*no se dejaron vestir en 10 intentos cada una: \d+ en fronteras \(la última: las fronteras de este mapa .* no admiten \d barreras distintas con 15 casillas cada una\)/,
    );
  });

  it('el plan del generador pasa el esquema del agente: los dos productores hablan igual', () => {
    for (let s = 1; s <= 10; s++) {
      const plan = generateMapPlan(createRng(s));
      expect(mapPlanSchema.safeParse(plan).success, `semilla ${s}`).toBe(true);
    }
  });

  it('la auditoría muerde: una ciudad de grado 2 y un nodo de corte se ven', () => {
    // Si `auditar` no pudiera fallar, el test de arriba sería verde por vacío.
    // El plan a mano tiene la ciudad neutral entre DOS regiones y un solo
    // camino de la base del 1 a ella.
    const fallos = auditar(planDeNodos());
    expect(fallos).toContain('solo 1 ciudades neutrales');
    expect(fallos).toContain('la ciudad town-2 es de grado 2');
  });
});

describe('la tabla de barreras se valida al cargar', () => {
  it('el fichero bueno pasa, y cada rotura se dice con su sitio', () => {
    expect(() => validarBarreras(barrerasJson)).not.toThrow();
    const { snow: _sinNieve, ...frontera } = barrerasJson.frontera;
    const roto = {
      ...barrerasJson,
      frontera: { ...frontera, grass: { forest: 0, lava: 2 } },
      densidadPorCiento: { min: 20, max: 10 },
    };
    expect(() => validarBarreras(roto)).toThrow(/"frontera" no tiene fila para el suelo "snow"/);
    expect(() => validarBarreras(roto)).toThrow(/"frontera.grass.forest" pesa 0/);
    expect(() => validarBarreras(roto)).toThrow(
      /"frontera.grass" pide "lava", que no es una barrera/,
    );
    expect(() => validarBarreras(roto)).toThrow(/min \(20\) es mayor que max \(10\)/);
  });
});
