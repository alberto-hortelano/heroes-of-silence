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
  crucesConCamino,
  generateMapPlan,
  INTENTOS_DE_RED,
  LADO_DEL_MAPA,
  type MapPlan,
  type PlanConCasillas,
  trazarYVestir,
  validateMapPlan,
} from '../src/core/map/generate.js';
import {
  type GameMap,
  pointFromKey,
  pointKey,
  RedDeCaminos,
  type TramoDeCamino,
} from '../src/core/map/map.js';
import { aPunto, type Estructura, estructura, vecindad } from '../src/core/map/regiones.js';
import {
  BARRERAS,
  type Barrera,
  esBarrera,
  isWalkable,
  type Suelo,
  type TerrainKind,
} from '../src/core/map/terrain.js';
import {
  ABIERTA,
  ArbolDeCaminos,
  CASILLAS_DE_UNA_MURALLA,
  centroDeRegion,
  type EntradaDeCaminos,
  engordarFronteras,
  TIPOS_POR_MAPA,
  trazarCaminos,
} from '../src/core/map/vestir.js';
import { createRng } from '../src/core/rng.js';
import type { Point } from '../src/core/types.js';
import { tramosRectos } from '../tools/qa/rectitud.js';
import { auditarMapaDenso, barrerasDe, ciclosDeCamino, planDeNodos } from './helpers.js';
import { itLento, rango, segunPrisa } from './lento.js';

/** Los fallos de la auditoría densa de un plan, construyéndolo. */
const densa = (plan: MapPlan): string[] => auditarMapaDenso(plan, buildMap(plan).map).fallos;

/**
 * El mapa del generador de cada semilla, hecho una vez por fichero. En `pnpm
 * verify:lento` tres medidas recorren 1-1000 (aspas, tramos rectos y la barrera
 * de cada nodo) y cada una generaba las mil: 3 000 mapas a ~8 ms, casi todo el
 * fichero. Pasaba de 60 s con la máquina cargada y vitest moría con «Timeout
 * calling onTaskUpdate» (#194). Ningún test toca lo que lee.
 */
const hechos = new Map<number, { plan: MapPlan; map: GameMap }>();
function delGenerador(semilla: number): { plan: MapPlan; map: GameMap } {
  let hecho = hechos.get(semilla);
  if (hecho === undefined) {
    const plan = generateMapPlan(createRng(semilla));
    hecho = { plan, map: buildMap(plan).map };
    hechos.set(semilla, hecho);
  }
  return hecho;
}

/** El plan de prueba con una cosa cambiada. */
function con(cambio: Partial<PlanConCasillas>): MapPlan {
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
        // Bajo los dos nodos de la columna, que la abren: no cambia el terreno.
        tramo(11, 2),
        tramo(11, 6),
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
        tramo(11, 2),
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
    // Con su muro debajo, que el nodo abre: lo que falla es la red, no el muro.
    const suelto = con({
      nodes: [...plan.nodes, { x: 1, y: 1 }],
      walls: [...plan.walls, tramo(1, 1)],
    });
    expect(validateMapPlan(suelto)).toEqual([
      'el nodo de (1,1) solo toca la región "a": un nodo es un paso entre dos regiones o más, ponlo en el muro que las separa',
    ]);
  });

  it('un nodo sin muro debajo no cruza nada, y se rechaza (#145)', () => {
    const plan = planDeNodos();
    // El nodo de la cordillera de la columna 11, con su casilla fuera del tramo.
    const sinMuro = con({
      walls: [...plan.walls.filter((m) => m.from.x !== 11), columna(11, 0, 1), columna(11, 3, 8)],
    });
    expect(validateMapPlan(sinMuro)).toEqual([
      'el nodo de (11,2) no está sobre ningún muro (debajo hay grass): un nodo va en un muro, abre su casilla y cruza la barrera de ese muro',
    ]);
    // `buildMap` no se lo inventa: sin la validación, lanza diciendo cuál.
    expect(() => buildMap(sinMuro)).toThrow(
      'el nodo de (11,2) no está sobre ningún muro: no se sabe qué barrera cruza',
    );
  });

  it('el mapa guarda la barrera que cruza cada nodo: la del muro que abre (#145)', () => {
    const plan = planDeNodos();
    // Un tramo de agua de una casilla bajo el nodo de la columna 11: manda el
    // último muro, como al pintar, y el nodo cruza agua aunque su cordillera
    // sea de montaña.
    const conRio = con({ walls: [...plan.walls, { ...tramo(11, 2), terrain: 'water' }] });
    expect(validateMapPlan(conRio)).toEqual([]);
    const nodos = (p: MapPlan) =>
      buildMap(p).map.objects.flatMap((o) =>
        o.kind === 'node' ? [`${o.at.x},${o.at.y} ${o.barrera}`] : [],
      );
    expect(nodos(plan)).toContain('11,2 mountain');
    expect(nodos(conRio)).toContain('11,2 water');
    // Y la casilla se abre igual: el terreno no sabe qué cruzaba.
    const t = (p: MapPlan) => buildMap(p).map.terrain[2 * p.width + 11];
    expect(t(conRio)).toBe(t(plan));
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
    // Y la región no se guarda con su suelo: el mapa solo sabe de la red y del
    // nivel, que un plan sin él pone al llano (#143).
    expect(map.regions.find((r) => r.id === 'b')).toEqual({
      id: 'b',
      name: 'Vega',
      at: { x: 8, y: 7 },
      nivel: 1,
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

/**
 * Las horquillas como no las quiere el usuario (punto de control de #153): un
 * tramo en diagonal con una esquina que es camino —se pinta en Y, con los dos
 * trazos solapados— o dos diagonales en un mismo 2×2, que es un cruce en X. El
 * pintor de antes de #153 no daba ninguna de las dos.
 *
 * La única Y que se admite es la **obligada**: la esquina es una hoja —un
 * nodo, o una ciudad, una mina o un pueblo (#188)— de la que colgar la haría
 * dejar de serlo, y la otra esquina es barrera o tiene un monstruo, así que el
 * radio no tenía otra forma de pasar que en diagonal junto a ella. La búsqueda
 * cobra de más ese paso. Con nodos salía en 4 de los 223 mapas (60, 64, 177 y
 * 986); con las puertas, ~1 por mapa: el radio que llega por el costado de una
 * mina con la otra vecina de su puerta tapada baja en diagonal a la puerta
 * (236 en 1-200, ninguna sin obligar). Prohibir el paso deja el objetivo sin
 * camino (semilla 60).
 */
function horquillasNuevas(map: GameMap): string[] {
  const nodos = new Set([
    ...estructura(map).nodos.map((n) => pointKey(n.at)),
    ...map.objects.filter((o) => conPuerta(o.kind)).map((o) => pointKey(o.at)),
  ]);
  const monstruos = new Set(
    map.objects.filter((o) => o.kind === 'monster').map((o) => pointKey(o.at)),
  );
  const pisable = (p: Point) =>
    isWalkable(map.terrain[p.y * map.width + p.x]!) && !monstruos.has(pointKey(p));
  const diagonales = map.caminos.tramos.filter(([p, q]) => p.x !== q.x && p.y !== q.y);
  const fallos: string[] = [];
  const en = (p: Point) => `(${p.x},${p.y})`;
  const deUn2x2 = new Map<string, number>();
  for (const [p, q] of diagonales) {
    const esquinas = [
      { x: q.x, y: p.y },
      { x: p.x, y: q.y },
    ];
    // Obligada si la L no tiene por dónde ir: una esquina es una hoja (nodo u
    // objeto con puerta) y la otra no se pisa, o las dos son hojas, que no se
    // cruzan (s123 (18,32)-(19,33) con #189: una mina y un pueblo en las dos).
    const obligada =
      esquinas.some((k, n) => nodos.has(pointKey(k)) && !pisable(esquinas[1 - n] as Point)) ||
      esquinas.every((k) => nodos.has(pointKey(k)));
    if (!obligada && esquinas.some((k) => map.caminos.casillas.has(pointKey(k))))
      fallos.push(
        `el tramo ${en(p)}-${en(q)} va en diagonal con una esquina de camino: horquilla en Y`,
      );
    const cuadro = pointKey({ x: Math.min(p.x, q.x), y: p.y });
    deUn2x2.set(cuadro, (deUn2x2.get(cuadro) ?? 0) + 1);
  }
  for (const [cuadro, n] of deUn2x2) if (n > 1) fallos.push(`cruce en X en el 2×2 de (${cuadro})`);
  return fallos;
}

/**
 * Lo que queda de `puertasMalEntradas` en 1-200, por semilla: un pueblo junto
 * al borde, con la puerta en la última fila o la primera columna, al que el
 * camino llega de lado. No es de la silla: antes de #224 pasaba en s401 y s739
 * de 1-1000; con los vestidos que se repiten por una silla, s133 es otro mapa y
 * cae ahí (en 1-1000, s133, s401 y s947; 09-10-2026). El trazado de esa
 * esquina no se ha tocado: no hay ninguna esquina abierta cerca.
 */
const DE_LADO_POR_LA_ESQUINA: Readonly<Record<number, string>> = {
  133: 'village (12,32): se entra desde (13,32) y no por su puerta',
};

/** Los objetos con puerta: se entran por la casilla de debajo y no se cruzan (#188). */
const conPuerta = (kind: string): boolean =>
  kind === 'town' || kind === 'mine' || kind === 'village';

/**
 * Las puertas mal entradas (#188, «como en el HoMM»): una mina o un pueblo
 * lleva un solo tramo, y desde su puerta, la casilla de debajo —salvo si no la
 * tiene, fuera del mapa o de otra región, que en un mapa apretado se coloca
 * sin ella (`libresConPuerta`; en 1-300, s139)—. A una ciudad, que es un nodo
 * y le llega un radio de cada región, ninguno le llega por detrás si su región
 * toca la fila de delante.
 */
function puertasMalEntradas(map: GameMap): string[] {
  const { regionDe } = estructura(map);
  const W = map.width;
  const vecinas = new Map<string, Point[]>();
  for (const [p, q] of map.caminos.tramos) {
    for (const [a, b] of [
      [p, q],
      [q, p],
    ] as const) {
      const lista = vecinas.get(pointKey(a)) ?? [];
      lista.push(b);
      vecinas.set(pointKey(a), lista);
    }
  }
  const fallos: string[] = [];
  const en = (p: Point) => `(${p.x},${p.y})`;
  for (const o of map.objects) {
    if (!conPuerta(o.kind)) continue;
    const llegan = vecinas.get(pointKey(o.at)) ?? [];
    if (o.kind !== 'town') {
      const puerta = { x: o.at.x, y: o.at.y + 1 };
      const tiene =
        puerta.y < map.height &&
        regionDe[puerta.y * W + puerta.x] === regionDe[o.at.y * W + o.at.x] &&
        isWalkable(map.terrain[puerta.y * W + puerta.x]!);
      if (llegan.length !== 1)
        fallos.push(`${o.kind} ${en(o.at)}: le llegan ${llegan.length} tramos, y es una hoja`);
      else if (tiene && pointKey(llegan[0]!) !== pointKey(puerta))
        fallos.push(`${o.kind} ${en(o.at)}: se entra desde ${en(llegan[0]!)} y no por su puerta`);
      continue;
    }
    for (const q of llegan) {
      if (q.y >= o.at.y) continue;
      const r = regionDe[q.y * W + q.x];
      const tocaDelante = [-1, 0, 1].some((dx) => {
        const x = o.at.x + dx;
        const y = o.at.y + 1;
        return x >= 0 && x < W && y < map.height && regionDe[y * W + x] === r;
      });
      if (tocaDelante)
        fallos.push(
          `ciudad ${en(o.at)}: se entra por detrás desde ${en(q)} y su región toca la fila de delante`,
        );
    }
  }
  return fallos;
}

/**
 * Las aspas: una casilla con sus cuatro diagonales de camino, que se pinta como
 * dos sendas rectas cruzadas (auditoría 3, §7: s2 en (1,31) y (32,2), el centro
 * de la región con tres minas y un nodo, uno en cada diagonal). No es un 2×2
 * con las dos diagonales —eso ya lo caza `horquillasNuevas`—: los cuatro
 * tramos comparten la casilla del medio. Antes del arreglo, 37 en 31 mapas de
 * 1-1000.
 *
 * Se admite en un nodo: una ciudad neutral en la esquina de cuatro regiones,
 * con los cuatro lados rectos de barrera, recibe un radio en diagonal de cada
 * una, y cada uno es de otra región (28 en 1-1000, la ciudad tapa el cruce).
 * Y cuando uno de sus brazos va a un nodo que la región del centro solo toca
 * por él: la entrada al nodo es obligada (s850, (12,6), una ciudad entre agua,
 * #188). Y cuando un brazo no tiene otra forma de ir: sus dos esquinas son
 * barrera y no hay L que cambiarle, la misma regla con la que el generador lo
 * cobra (`cerrariaUnAspa`): una esquina que es hoja (mina, pueblo o nodo) o
 * monstruo no vale de esquina. Con los niveles del mapa (#143), s682 (6,20): una
 * región en cintura de avispa entre agua, unida en diagonal.
 */
function aspas(map: GameMap): string[] {
  const { nodos: deLaRed, regionDe } = estructura(map);
  const nodos = new Set(deLaRed.map((n) => pointKey(n.at)));
  const hojas = new Set([
    ...nodos,
    ...map.objects
      .filter((o) => o.kind === 'mine' || o.kind === 'village' || o.kind === 'monster')
      .map((o) => pointKey(o.at)),
  ]);
  const W = map.width;
  const diagonales = new Map<string, Point[]>();
  for (const [p, q] of map.caminos.tramos) {
    if (p.x === q.x || p.y === q.y) continue;
    for (const [c, otro] of [
      [p, q],
      [q, p],
    ] as const)
      diagonales.set(pointKey(c), [...(diagonales.get(pointKey(c)) ?? []), otro]);
  }
  /** ¿Es `c` la única casilla de su región junto al nodo `n`? */
  const unicaEntrada = (n: Point, c: Point): boolean => {
    const r = regionDe[c.y * W + c.x];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = n.x + dx;
        const y = n.y + dy;
        if ((dx === 0 && dy === 0) || (x === c.x && y === c.y)) continue;
        if (x >= 0 && y >= 0 && x < W && y < map.height && regionDe[y * W + x] === r) return false;
      }
    return true;
  };
  return [...diagonales]
    .filter(([c, brazos]) => {
      if (brazos.length !== 4 || nodos.has(c)) return false;
      const centro = pointFromKey(c);
      // Una esquina vale si se pisa y no es una hoja ni un monstruo: una mina,
      // un pueblo o un nodo nunca hacen de esquina (`ArbolDeCaminos`) y un
      // monstruo no se cruza (`Busqueda`), así que con la otra esquina de
      // barrera el brazo no tiene otra forma de ir (#210: s864 (22,19), la
      // puerta de una mina entre un muro y una montaña; s944 (15,26), un
      // monstruo junto a una montaña).
      const pisable = (x: number, y: number) =>
        isWalkable(map.terrain[y * W + x] as TerrainKind) && !hojas.has(pointKey({ x, y }));
      const obligado = (b: Point) => !pisable(b.x, centro.y) && !pisable(centro.x, b.y);
      return !brazos.some(
        (b) => (nodos.has(pointKey(b)) && unicaEntrada(b, centro)) || obligado(b),
      );
    })
    .map(([c]) => `aspa en (${c}): cuatro sendas en diagonal desde la misma casilla`);
}

describe('el generador hace redes como las pidió el usuario', () => {
  it(`200 semillas en ${LADO_DEL_MAPA}×${LADO_DEL_MAPA} y 20 en 48×48: válidas, ciudades de grado ≥ 3, equilibradas, con dos caminos y densas`, () => {
    const fallos: string[] = [];
    const fronteraTotal = new Set<string>();
    const conCamino: number[] = [];
    const ciclos: number[] = [];
    const ciclosDentro: number[] = [];
    // Las 200 primeras y, además, las que encontró QA barriendo mil (H5, H6):
    // 864 y 986 se quedaban en tres barreras de frontera, y 987 con una
    // frontera de una casilla lejos de un nodo. Ninguna caía en las 200.
    // En `pnpm verify`, las tres de QA y tres más, y una de 48×48 (#167): las
    // 223 son 6 s con la máquina cargada.
    const deQA = [864, 986, 987];
    for (const [lado, semillas] of [
      [LADO_DEL_MAPA, [...segunPrisa(rango(1, 3), rango(1, 200)), ...deQA]],
      [48, segunPrisa([1], rango(1, 20))],
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
          conCamino.push(map.caminos.casillas.size / pisables);
          const { total, dentro } = ciclosDeCamino(map);
          ciclos.push(total);
          ciclosDentro.push(dentro);
        }
        // En los dos lados: las cifras de arriba son de 34×34, las horquillas no.
        fallos.push(...horquillasNuevas(map).map(dondeFalla));
        fallos.push(...aspas(map).map(dondeFalla));
        fallos.push(
          ...puertasMalEntradas(map)
            .filter((f) => !(lado === LADO_DEL_MAPA && DE_LADO_POR_LA_ESQUINA[s] === f))
            .map(dondeFalla),
        );
        fallos.push(...deDensidad.map(dondeFalla));
        for (const b of frontera.keys()) fronteraTotal.add(b);
        // Cuatro barreras que se vean, no cuatro nombres: cada una con su
        // mínimo. El del muro es el de una muralla desde #208, que lo deja en
        // zonas pequeñas: sus 15 casillas solo salían juntando varias.
        const minimo = BARRERAS_DEL_MAPA.casillasMinimasPorTipo;
        const llenas = [...frontera].filter(
          ([b, n]) => n >= (b === 'wall' ? CASILLAS_DE_UNA_MURALLA : minimo),
        );
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
    // Los caminos son radiales y no una malla. Los techos son cifras medidas
    // con holgura (las cifras y su historia, en historia.md, «Caminos»): lo
    // que guardan es que no vuelvan la malla ni los anillos de #149. El del
    // camino subió de 0,33 a 0,40 con las puertas (#188): el ramal de cada
    // mina y cada pueblo y el rodeo por delante llevan la mediana de 1-200 de
    // 0,293 a 0,362 (08-10-2026).
    const mediana = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]!;
    expect(mediana(conCamino)).toBeLessThan(0.4);
    expect(mediana(ciclos)).toBeLessThanOrEqual(10);
    // Y dentro de una región, ni uno (#153): cada región traza un árbol y el
    // mapa guarda sus tramos, así que ya no hay bucles por adyacencia.
    expect(Math.max(...ciclosDentro)).toBe(0);
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

  it('la frontera se lee por lo que no es región: dentro es obstáculo; junto a la frontera o a un nodo, frontera (#132)', () => {
    // Tres casillas de una región pasadas a montaña sobre la semilla 2 (la 1, con
    // el vestido que se repite por una silla, #224, ya no tiene la pegada solo
    // a un nodo), una a una: lejos de todo cuenta como obstáculo; pegada a la frontera, como
    // frontera; y pegada solo a un nodo —el trozo de un lado del paso que no
    // toca más que una región (la semilla 80 en 28×28)— también como frontera,
    // porque el nodo es un agujero de la frontera y la une a la otra región (#132).
    const { map } = buildMap(generateMapPlan(createRng(2)));
    const red = estructura(map);
    const W = map.width;
    const { desde, vecinas } = vecindad(W, map.height);
    const nodos = new Set(red.nodos.map((n) => n.at.y * W + n.at.x));
    const fueraDeRegion = (c: number) =>
      [...vecinas.subarray(desde[c]!, desde[c + 1]!)].filter((j) => red.regionDe[j]! < 0);
    const lejos = (c: number) => {
      const [x, y] = [c % W, Math.floor(c / W)];
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const j = (y + dy) * W + x + dx;
          if (x + dx < 0 || x + dx >= W || y + dy < 0 || y + dy >= map.height) return false;
          if (red.regionDe[j]! < 0) return false;
        }
      return true;
    };
    const regionales = [...red.regionDe.keys()].filter(
      (c) => red.regionDe[c]! >= 0 && map.regions.every((r) => r.at.y * W + r.at.x !== c),
    );
    const dentro = regionales.find(lejos);
    const juntoAFrontera = regionales.find((c) =>
      fueraDeRegion(c).some((j) => esBarrera(map.terrain[j]!) && !nodos.has(j)),
    );
    const juntoANodo = regionales.find((c) => {
      const f = fueraDeRegion(c);
      return f.length > 0 && f.every((j) => nodos.has(j));
    });
    expect(dentro, 'una casilla de región lejos de todo').toBeDefined();
    expect(juntoAFrontera, 'una casilla de región pegada a la frontera').toBeDefined();
    expect(juntoANodo, 'una casilla de región pegada solo a un nodo').toBeDefined();

    const antes = barrerasDe(map);
    const conMontaña = (c: number) => {
      const terrain = [...map.terrain];
      terrain[c] = 'mountain';
      const { frontera, obstaculo } = barrerasDe({ ...map, terrain });
      const k = red.regionDe[c]!;
      return {
        frontera: (frontera.get('mountain') ?? 0) - (antes.frontera.get('mountain') ?? 0),
        obstaculo: obstaculo[k]! - antes.obstaculo[k]!,
      };
    };
    expect(conMontaña(dentro!)).toEqual({ frontera: 0, obstaculo: 1 });
    expect(conMontaña(juntoAFrontera!)).toEqual({ frontera: 1, obstaculo: 0 });
    expect(conMontaña(juntoANodo!)).toEqual({ frontera: 1, obstaculo: 0 });
  });

  it('la auditoría de caminos muerde: sin cruce, con dos, sin hoja, sin base, una mina suelta y la red partida', () => {
    // Un mapa que la pasa, y cada rotura a mano sobre una copia de sus tramos.
    const plan = generateMapPlan(createRng(1));
    const { map } = buildMap(plan);
    const caminos = (tramos: readonly TramoDeCamino[], sueltas: Point[] = []) =>
      auditarMapaDenso(plan, {
        ...map,
        caminos: RedDeCaminos.desdeTramos(tramos, map.width, map.height, sueltas),
      }).fallos.filter((f) => /camino|cruce|hoja|base/.test(f));
    const tramos = map.caminos.tramos;
    expect(caminos(tramos)).toEqual([]);
    const red = estructura(map);
    const W = map.width;
    const { desde, vecinas } = vecindad(W, map.height);
    const indice = (p: Point) => p.y * W + p.x;
    const vecinasDe = (i: number) => [...vecinas.subarray(desde[i]!, desde[i + 1]!)];
    const toca = (t: TramoDeCamino, p: Point) => t.some((q) => pointKey(q) === pointKey(p));
    const pasos = red.nodos.filter((n) => !n.ciudad && n.regiones.length === 2);

    // Una pareja con un paso sin camino: la que se rompe.
    const sinCamino = pasos.find((n) => !map.caminos.casillas.has(pointKey(n.at)));
    expect(sinCamino, 'la semilla 1 tiene que dejar algún paso sin camino').toBeDefined();
    const [a, b] = sinCamino!.regiones as [number, number];
    const pareja = new RegExp(
      `entre las regiones ${red.regiones[a]!.id} y ${red.regiones[b]!.id} hay (\\d) cruces`,
    );
    const cuantos = (ts: readonly TramoDeCamino[]) => caminos(ts).join('\n').match(pareja)?.[1];

    // Sin cruce: el nodo con camino de esa pareja pierde sus tramos.
    const cruce = red.nodos.find(
      (n) =>
        n.regiones.includes(a) &&
        n.regiones.includes(b) &&
        map.caminos.casillas.has(pointKey(n.at)),
    )!;
    expect(cuantos(tramos.filter((t) => !toca(t, cruce.at)))).toBe('0');

    // Dos cruces: el paso sin camino, con un tramo a cada lado.
    const dos: TramoDeCamino[] = [...tramos];
    for (const r of [a, b]) {
      const lado = vecinasDe(indice(sinCamino!.at)).find((j) => red.regionDe[j] === r)!;
      dos.push([sinCamino!.at, aPunto(lado, W)]);
    }
    expect(cuantos(dos)).toBe('2');

    // Sin hoja: a un nodo le llegan dos tramos de la misma región.
    const hoja = red.nodos.flatMap((n) =>
      n.regiones.flatMap((k) => {
        const lados = vecinasDe(indice(n.at)).filter((j) => red.regionDe[j] === k);
        return lados.length >= 2 ? [{ n, k, lados }] : [];
      }),
    )[0];
    expect(
      hoja,
      'la semilla 1 tiene que tener un nodo con dos vecinas de una región',
    ).toBeDefined();
    const conDos: TramoDeCamino[] = [
      ...tramos.filter((t) => !toca(t, hoja!.n.at)),
      ...hoja!.lados.slice(0, 2).map((j): TramoDeCamino => [hoja!.n.at, aPunto(j, W)]),
    ];
    expect(caminos(conDos).join('\n')).toMatch(
      new RegExp(
        `el nodo \\(${hoja!.n.at.x},${hoja!.n.at.y}\\) no es una hoja de la red de la región ${red.regiones[hoja!.k]!.id}: le llegan 2 tramos`,
      ),
    );

    // Sin base: la base del jugador 0 pierde el tramo de su casa.
    const base = plan.towns.find((t) => t.owner === 0)!;
    const casa = red.regionDe[indice(plan.heroStarts[0]!.at)]!;
    const sinBase = tramos.filter(
      (t) => !(toca(t, base.at) && t.some((q) => red.regionDe[indice(q)] === casa)),
    );
    expect(caminos(sinBase).join('\n')).toMatch(
      /la base del jugador 0 .* no está en la red de su región de casa/,
    );

    // Una mina sin camino.
    const mina = map.objects.find((o) => o.kind === 'mine')!;
    expect(caminos(tramos.filter((t) => !toca(t, mina.at))).join('\n')).toMatch(
      new RegExp(`la mina o el pueblo \\(${mina.at.x},${mina.at.y}\\) .* no está en un camino`),
    );

    // Un camino de una casilla, suelto y lejos de todo: ni su región ni el mapa
    // son de una pieza.
    const lejos = [...Array(map.width * map.height).keys()].find(
      (i) =>
        red.regionDe[i]! >= 0 &&
        ![i, ...vecinasDe(i)].some((j) => map.caminos.casillas.has(pointKey(aPunto(j, W)))),
    )!;
    const fallos = caminos(tramos, [aPunto(lejos, W)]).join('\n');
    expect(fallos).toMatch(/el camino de la región .* va en más de un trozo/);
    expect(fallos).toMatch(/la red de caminos del mapa va en más de un trozo/);
  });

  it('cuando no sale, el error dice en qué fase se agotaron los intentos', () => {
    // En 12×12 las redes salen y lo que se agota es el vestido: sus fronteras no
    // dan para tres barreras distintas con su mínimo de casillas cada una (antes
    // de ese mínimo, en la vuelta 1 de QA, se agotaba en los objetos: no cabían
    // las catorce minas). Antes de partir el error decía «no sabe repartir
    // regiones equilibradas» fuera cual fuera la fase, y mentía. Desde #102,
    // 12×12 está fuera del rango del generador y `generateMapPlan` ni lo intenta;
    // los intentos se piden sin esa comprobación para ver su mensaje.
    expect(() => trazarYVestir(createRng(1), 12, 12)).toThrow(
      new RegExp(
        `no sale un mapa de nodos de 12×12 en ${INTENTOS_DE_RED} redes, dos veces: .*no se dejaron vestir en 10 intentos cada una: \\d+ en fronteras \\(la última: las fronteras de este mapa .* no admiten \\d barreras distintas con 15 casillas cada una\\)`,
      ),
    );
  });

  it('un asaltante no nace en una región que ya tiene dueño: la que solo toca la base (#178)', () => {
    // En 24×24 la red fina deja a veces una región de fuera cuyo único nodo es
    // una base: es del dueño de la base desde el primer día y `validateMapPlan`
    // no admite un grupo en ella. El generador lo sembraba igual (469 y 3481,
    // las dos de 1-4000).
    for (const s of [469, 3481]) {
      const plan = generateMapPlan(createRng(s), { width: 24, height: 24 });
      expect(validateMapPlan(plan), `24×24 semilla ${s}`).toEqual([]);
    }
  });

  it('una horquilla junto a un nodo ya trazado sale en L: la diagonal cuesta más que la L (#179)', () => {
    // El nodo cuelga en recto de una casilla, y el radio siguiente salía de
    // ella en diagonal junto al nodo: la L por la otra esquina se arrima a la
    // red y pagaba más que la diagonal cobrada, y quedaba la Y (34×34: 4310 y
    // 4525, las dos de 1-5000).
    for (const s of [4310, 4525]) {
      const { map } = buildMap(generateMapPlan(createRng(s), { width: 34, height: 34 }));
      expect(horquillasNuevas(map), `34×34 semilla ${s}`).toEqual([]);
    }
  });

  it('el centro de una región no reparte en aspa: la cuarta diagonal cuesta más que la T (auditoría 3, §7)', () => {
    // Las que mordían en 1-1000 antes del arreglo: 2 (la de la auditoría), 13 y 49.
    for (const s of [2, 13, 49]) {
      const { map } = delGenerador(s);
      expect(aspas(map), `semilla ${s}`).toEqual([]);
    }
  });

  itLento(
    'ninguna aspa fuera de un nodo en las semillas 1-1000 (auditoría 3, §7)',
    async () => {
      const fallos: string[] = [];
      for (const s of rango(1, 1000)) {
        // Es el primero que llena `delGenerador` con las mil: sin soltar el
        // hilo de vez en cuando, el trabajador de vitest no contesta a tiempo
        // («Timeout calling onTaskUpdate») aunque el test pase.
        if (s % 50 === 0) await new Promise((r) => setTimeout(r, 0));
        const { map } = delGenerador(s);
        fallos.push(...aspas(map).map((f) => `semilla ${s}: ${f}`));
      }
      expect(fallos).toEqual([]);
      // Mil mapas: ~55 s con la máquina cargada desde #224, que repite los
      // vestidos con una silla (34×34: 36 → 55 ms de media, 09-10-2026).
    },
    180_000,
  );

  it('el plan del generador pasa el esquema del agente: los dos productores hablan igual', () => {
    for (let s = 1; s <= 10; s++) {
      const plan = generateMapPlan(createRng(s));
      expect(mapPlanSchema.safeParse(plan).success, `semilla ${s}`).toBe(true);
    }
  });

  it('cada nodo entra por un eje: dos vecinas opuestas, que siguen por tierra en cruz y sin nada delante (#161, #166 H10)', () => {
    // La marca del usuario (s2, (7,11)): un puente que desemboca en un islote
    // unido a tierra solo en diagonal. Le pasaba a un tercio de los nodos de
    // toda barrera: el vestido cogía la primera vecina recta de cada región,
    // sin mirar la de enfrente, y seguía en 8 vecinas.
    const fallos: string[] = [];
    let nodos = 0;
    // En `pnpm verify`, tres semillas: con el vestido de antes ya dan los tres
    // fallos. En `pnpm verify:lento`, 1-40: antes solo 1-10, porque en 1-40
    // había 4 pasos cuya red fina no tenía vecinas opuestas (s17 (1,14), s30
    // (7,9) y (26,24), s38 (1,15)). Desde #169 el generador elige el paso de
    // cada pareja con eje pleno (`conEjePleno`) y en 1-40 no queda ninguno; en
    // 1-1000, 17 de 12 342 nodos, casi todos junto al borde.
    // Con los niveles del mapa (#143) los mapas son otros y uno de esos pasos
    // cae en 1-40 (s18 (13,21)); en 1-1000, 20 de 19 375 nodos (ciudades
    // incluidas). Se admiten hasta el 1 % de los nodos; lo demás, ninguno.
    const sinEje: string[] = [];
    for (const s of segunPrisa(rango(1, 3), rango(1, 40))) {
      const { map } = delGenerador(s);
      for (const f of entradasDeNodo(map))
        (f.endsWith('no tiene dos vecinas opuestas pisables de regiones distintas')
          ? sinEje
          : fallos
        ).push(`semilla ${s}: ${f}`);
      nodos += estructura(map).nodos.length;
    }
    expect(fallos).toEqual([]);
    expect(sinEje.length, sinEje.join('; ')).toBeLessThanOrEqual(nodos / 100);
    // Que no pase en vacío: 54 nodos (ciudades incluidas) en 1-3, 761 en 1-40
    // (eran 62 y 813 antes de vetar lo de bajo las diagonales: los mapas son otros).
    expect(nodos).toBeGreaterThan(segunPrisa(50, 700));
  });

  it('el engorde va casilla a casilla y la reparación deja tres pasos entre regiones (#169)', () => {
    // Un muro fino recto (x = 8) entre dos regiones: sus casillas pisables de
    // al lado, (7, y) y (9, y), quedan a dos pasos. El ruido engorda cada una a
    // cara o cruz, y donde no engorda ninguna de las dos la reparación (paso 4b)
    // engorda una. Antes un lado entero engordaba siempre —el borde copiaba el
    // muro—, y sin la reparación una fila de cada cuatro quedaba a dos pasos.
    const W = 16;
    const N = W * W;
    const etiqueta = new Int32Array(N);
    const muro = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const { x } = aPunto(i, W);
      etiqueta[i] = x < 8 ? 0 : 1;
      muro[i] = x === 8 ? 1 : 0;
    }
    let enteros = 0;
    for (let semilla = 1; semilla <= 10; semilla++) {
      const hecho = engordarFronteras({
        W,
        H: W,
        etiqueta,
        muro,
        nodos: [],
        ciudades: [],
        conCamino: [],
        semillas: [
          { x: 3, y: 3 },
          { x: 12, y: 12 },
        ],
        suelos: ['grass', 'grass'],
        niveles: [1, 1],
        rng: createRng(semilla),
      });
      if (typeof hecho === 'string') throw new Error(hecho);
      const libre = (x: number, y: number) =>
        muro[y * W + x] === 0 && hecho.tipos[y * W + x] === ABIERTA;
      const cerca: string[] = [];
      for (let y = 0; y < W; y++)
        for (let x = 0; x < 8; x++)
          for (let y2 = Math.max(0, y - 2); y2 <= Math.min(W - 1, y + 2); y2++)
            for (let x2 = 9; x2 <= Math.min(W - 1, x + 2); x2++)
              if (libre(x, y) && libre(x2, y2)) cerca.push(`(${x},${y})-(${x2},${y2})`);
      expect(cerca, `semilla ${semilla}`).toEqual([]);
      const engordadas = (x: number) => rango(0, W - 1).filter((y) => !libre(x, y)).length;
      if (engordadas(7) === W) enteros++;
      if (engordadas(9) === W) enteros++;
    }
    // Y el borde no es el muro dilatado: un lado entero engordado es la
    // excepción (cuatro trechos que salen del mismo lado), no la regla. Con el
    // lado gordo fijo por pareja salía en las 10 semillas; a trechos, en 2 de
    // los 20 lados.
    expect(enteros).toBeLessThanOrEqual(3);
  });

  itLento('los bordes de barrera no van en tramos rectos largos (#169)', () => {
    // Un tramo recto: casillas de barrera seguidas en una fila o columna con la
    // de al lado, del mismo lado, pisable (`tramosRectos`, la misma cuenta que
    // `tools/qa/rectitud.ts`). En 1-1000: tramos de ≥ 8, 216 antes de #169
    // (engorde del lado gordo entero y ruido en bloques de 4×4) y 110 después;
    // mapas con uno de ≥ 10, 14 antes y 5 después. Los techos dejan margen
    // para una tirada de monedas: en 1-300 los tramos bailaban de 38 a 45 con
    // solo cambiar cómo se elige el paso.
    let largos = 0;
    let mapas = 0;
    for (const s of rango(1, 1000)) {
      const { map } = delGenerador(s);
      largos += tramosRectos(map, 8).largos;
      if (tramosRectos(map, 10).largos > 0) mapas++;
    }
    expect(largos).toBeLessThanOrEqual(140);
    expect(mapas).toBeLessThanOrEqual(8);
  });

  it('el vestido abre el nodo por su eje aunque la primera recta de cada región sea otra', () => {
    // Un muro fino en escalera (x + y = 15 o 16, que en 8 vecinas no se cruza)
    // y el nodo en (7,8): la región 0 lo toca por el norte, el oeste y el
    // noroeste; la 1, solo por el sureste. Antes la 0 cogía su primera recta,
    // el norte, y el nodo salía en esquina; y los dos caminos seguían en
    // diagonal, (7,7)→(6,6) y (8,9)→(9,10): entradas unidas por una esquina.
    const W = 16;
    const N = W * W;
    const etiqueta = new Int32Array(N);
    const muro = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const { x, y } = aPunto(i, W);
      etiqueta[i] = x + y < 16 ? 0 : 1;
      muro[i] = x + y === 15 || x + y === 16 ? 1 : 0;
    }
    const hecho = engordarFronteras({
      W,
      H: W,
      etiqueta,
      muro,
      nodos: [8 * W + 7],
      ciudades: [],
      conCamino: [],
      semillas: [
        { x: 3, y: 3 },
        { x: 12, y: 12 },
      ],
      suelos: ['grass', 'grass'],
      niveles: [1, 1],
      rng: createRng(1),
    });
    if (typeof hecho === 'string') throw new Error(hecho);
    const protegidas = (casillas: readonly (readonly [number, number])[]) =>
      casillas.map(
        ([x, y]) => hecho.pasillo[y * W + x] === 1 && hecho.tipos[y * W + x] === ABIERTA,
      );
    // El eje noroeste-sureste, hasta la segunda casilla y con el codo que las
    // une en cruz; abierto y protegido.
    const eje = [
      [6, 7],
      [5, 7],
      [5, 6],
      [8, 9],
      [9, 9],
      [9, 10],
    ] as const;
    expect(protegidas(eje)).toEqual(eje.map(() => true));
    // Y el norte ya no es una entrada.
    expect(hecho.pasillo[7 * W + 7]).toBe(0);
  });

  it('el guardia de las entradas muerde: esquina, islote, algo delante y algo bajo una diagonal', () => {
    // Un mapa a mano con un nodo y sus tres fallos, uno a uno.
    const filas = (t: readonly string[]) => t.join('');
    // `.` hierba de la región a (arriba) o b (abajo), `M` montaña, `N` el nodo.
    const base = ['.......', '.......', '.......', 'MMMNMMM', '.......', '.......', '.......'];
    const mapa = (t: readonly string[], objetos: GameMap['objects'] = []): GameMap => {
      const terreno = filas(t);
      const W = 7;
      const terrain = [...terreno].map((c) => (c === 'M' ? 'mountain' : 'grass')) as TerrainKind[];
      return {
        width: W,
        height: W,
        terrain,
        regions: [
          { id: 'a', name: 'A', at: { x: 0, y: 0 } },
          { id: 'b', name: 'B', at: { x: 0, y: 6 } },
        ],
        objects: [{ id: 'node-0', kind: 'node', at: { x: 3, y: 3 } }, ...objetos],
        caminos: RedDeCaminos.desdeTramos([], W, W, []),
      } as unknown as GameMap;
    };
    expect(entradasDeNodo(mapa(base))).toEqual([]);
    // En esquina: el sur y el noroeste cerrados; a entra por el norte y b, solo
    // por el sureste.
    const esquina = [...base];
    esquina[2] = '..M....';
    esquina[4] = 'MMMM...';
    expect(entradasDeNodo(mapa(esquina)).join()).toMatch(/\(3,3\) no tiene dos vecinas opuestas/);
    // Islote: la entrada sur, (3,4), solo se une a b en diagonal.
    const islote = [...base];
    islote[4] = 'MMM.M..';
    islote[5] = 'MMMM...';
    expect(entradasDeNodo(mapa(islote)).join()).toMatch(/\(3,3\) .*en cruz/);
    // Una mina en (3,5), delante de la entrada sur.
    const mina = { id: 'mine-0', kind: 'mine', at: { x: 3, y: 5 } } as GameMap['objects'][number];
    expect(entradasDeNodo(mapa(base, [mina])).join()).toMatch(/mine en \(3,5\), delante/);
    // Un pueblo en (4,5), bajo la entrada diagonal (4,4): el estribo de abajo
    // de un puente diagonal (#166 H10, s49 node-12). Y en (4,1), su reflejo,
    // que se veta para no negar el espejo a lo que se siembra en pareja.
    const pueblo = (y: number) =>
      ({ id: 'village-0', kind: 'village', at: { x: 4, y } }) as GameMap['objects'][number];
    expect(entradasDeNodo(mapa(base, [pueblo(5)])).join()).toMatch(
      /village en \(4,5\), junto a la entrada diagonal de \(4,4\)/,
    );
    expect(entradasDeNodo(mapa(base, [pueblo(1)])).join()).toMatch(
      /village en \(4,1\), junto a la entrada diagonal de \(4,2\)/,
    );
    // Y a tres filas, ya lejos: nada.
    expect(entradasDeNodo(mapa(base, [pueblo(6)]))).toEqual([]);
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

describe('la barrera que cruza cada nodo del generador (#145, #187)', () => {
  /**
   * Lo que guarda el mapa contra lo que se ve: la barrera del nodo está entre
   * sus ocho vecinas y ninguna se repite más, salvo el agua de un lago ajeno
   * (sus suelos no la admiten); y un nodo de agua une dos suelos que la
   * admiten. Devuelve lo que no cumple, con su sitio.
   */
  function malCruzados(semilla: number): string[] {
    const { plan, map } = delGenerador(semilla);
    const red = estructura(map);
    const admiteRio = (r: number) => {
      const suelo = plan.regions[r]?.terrain as Suelo;
      return BARRERAS_DEL_MAPA.frontera[suelo].some((c) => c.barrera === 'water');
    };
    const fallos: string[] = [];
    for (const o of map.objects) {
      if (o.kind !== 'node') continue;
      const regiones = red.nodos[red.nodoPorId.get(o.id) as number]?.regiones ?? [];
      // Un río entre dos regiones: lo admiten las dos, o la suma de las dos
      // (`candidatasDeFrontera`), que es admitirlo una.
      const conRio = regiones.some(admiteRio);
      const cuenta = new Map<TerrainKind, number>();
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const [x, y] = [o.at.x + dx, o.at.y + dy];
          if ((dx === 0 && dy === 0) || x < 0 || y < 0 || x >= map.width || y >= map.height)
            continue;
          const t = map.terrain[y * map.width + x] as TerrainKind;
          if (!isWalkable(t)) cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
        }
      const suya = cuenta.get(o.barrera) ?? 0;
      const sitio = `semilla ${semilla}, ${o.id} (${o.at.x},${o.at.y}) cruza ${o.barrera}`;
      if (suya === 0) fallos.push(`${sitio} y no hay ${o.barrera} alrededor`);
      for (const [t, n] of cuenta)
        if (n > suya && !(t === 'water' && !conRio)) fallos.push(`${sitio} pero hay más ${t}`);
      if (o.barrera === 'water' && !conRio) fallos.push(`${sitio} y sus suelos no la admiten`);
    }
    return fallos;
  }

  it('lo que guarda cada nodo es lo que se ve, y el agua solo donde sus suelos la admiten', () => {
    // La muestra: las semillas de #187 (un empate y un lago ajeno) y s652, que
    // gana su puente por el desempate de la pareja. La lenta, las mil.
    const semillas = segunPrisa([28, 203, 646, 652, 896], rango(1, 1000));
    expect(semillas.flatMap(malCruzados)).toEqual([]);
  });
});

describe('los caminos de cada región salen de su centro', () => {
  // Dos regiones de 5×7 separadas por una columna de barrera con dos pasos, en
  // (5,1) y (5,5). El centro que saldría en cada región, (3,3) y (7,3), está
  // ocupado.
  const W = 11;
  const H = 7;
  const i = (x: number, y: number) => y * W + x;
  const arriba = i(5, 1);
  const abajo = i(5, 5);
  const entrada = (objetivos: number[][]): EntradaDeCaminos => {
    const tipos = new Int8Array(W * H).fill(ABIERTA);
    const regionDe = new Int32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) regionDe[i(x, y)] = x < 5 ? 0 : x > 5 ? 1 : -1;
      if (y !== 1 && y !== 5) tipos[i(5, y)] = 0;
    }
    return {
      W,
      H,
      tipos,
      regionDe,
      regiones: 2,
      suelos: ['grass', 'grass'],
      nodosDeRegion: [
        [arriba, abajo],
        [arriba, abajo],
      ],
      objetivos,
      puertas: [],
      monstruos: new Uint8Array(W * H),
      ocupadas: new Set([i(3, 3), i(7, 3), arriba, abajo]),
      nivel: new Int8Array(W * H).fill(1),
      puentes: new Set(),
    };
  };
  /** Las casillas de los tramos trazados. */
  const trazar = (e: EntradaDeCaminos) => new Set(trazarCaminos(e).flat());

  it('lleva camino a lo que se le pide y a nada más, y el centro no cae en lo ocupado', () => {
    const e = entrada([
      [arriba, i(0, 3)],
      [arriba, i(10, 3)],
    ]);
    const caminos = trazar(e);
    expect(caminos.has(arriba)).toBe(true);
    expect(caminos.has(abajo)).toBe(false);
    expect(caminos.has(i(0, 3))).toBe(true);
    expect(caminos.has(i(10, 3))).toBe(true);
    for (const r of [0, 1]) {
      const centro = centroDeRegion(e, r);
      expect([i(3, 3), i(7, 3)]).not.toContain(centro);
      expect(caminos.has(centro)).toBe(true);
    }
  });

  it('un radio pegado a un nodo que su región no lleva no lo toca: los tramos son los trazados', () => {
    // La mina de la izquierda, junto al paso de abajo, que lleva solo la
    // derecha. Antes de #153 el pintor unía por adyacencia la mina con el nodo
    // y este vestido se tiraba; con tramos no hay unión que no se trazara.
    const tramos = trazarCaminos(
      entrada([
        [arriba, i(4, 5)],
        [arriba, abajo],
      ]),
    );
    const deLaIzquierda = tramos.filter(([p, q]) => p % W < 5 || q % W < 5);
    expect(new Set(deLaIzquierda.flat()).has(i(4, 5))).toBe(true);
    expect(deLaIzquierda.some((t) => t.includes(abajo))).toBe(false);
    // Y cada región es un árbol: tantos tramos como casillas menos una.
    for (const lado of [(x: number) => x <= 5, (x: number) => x >= 5]) {
      const suyos = tramos.filter(([p, q]) => lado(p % W) && lado(q % W));
      expect(suyos.length).toBe(new Set(suyos.flat()).size - 1);
    }
  });

  it('una horquilla en diagonal sale en L al colgarla, de un lado o del otro, y nunca de un nodo', () => {
    const sinNodos = new Uint8Array(W * H);
    const arbol = (centro: number, colgar: [number, number][], nodo = sinNodos) => {
      const a = new ArbolDeCaminos(W, H, nodo, centro);
      for (const [c, p] of colgar) a.colgar(c, p);
      return new Set(a.tramos().map(([p, c]) => `${p}-${c}`));
    };
    const L = new Set([`${i(1, 1)}-${i(2, 1)}`, `${i(2, 1)}-${i(2, 2)}`]);
    // Del centro (1,1) salen un tramo a (2,1) y otro, oblicuo, a (2,2): la
    // esquina (2,1) ya es red, y el oblicuo se cuelga de ella.
    expect(
      arbol(i(1, 1), [
        [i(2, 1), i(1, 1)],
        [i(2, 2), i(1, 1)],
      ]),
    ).toEqual(L);
    // Al revés: primero el oblicuo y luego la esquina, colgada del centro. La
    // diagonal se parte y (2,2) pasa a colgar de la esquina.
    expect(
      arbol(i(1, 1), [
        [i(2, 2), i(1, 1)],
        [i(2, 1), i(1, 1)],
      ]),
    ).toEqual(L);
    // La esquina llega por debajo del hijo, dando la vuelta: (2,2) → (3,2) →
    // (3,1) → (2,1). Se le da la vuelta a esa rama y la esquina cuelga del
    // centro: un árbol sin la diagonal.
    expect(
      arbol(i(1, 1), [
        [i(2, 2), i(1, 1)],
        [i(3, 2), i(2, 2)],
        [i(3, 1), i(3, 2)],
        [i(2, 1), i(3, 1)],
      ]),
    ).toEqual(
      new Set([
        `${i(1, 1)}-${i(2, 1)}`,
        `${i(2, 1)}-${i(3, 1)}`,
        `${i(3, 1)}-${i(3, 2)}`,
        `${i(3, 2)}-${i(2, 2)}`,
      ]),
    );
    // Con la esquina en un nodo, el oblicuo se queda: si no, al nodo le
    // llegarían dos tramos de la región. Por eso el trazado no lo da (lo
    // comprueba `horquillasNuevas` en los mapas de verdad).
    const nodo = new Uint8Array(W * H);
    nodo[i(2, 1)] = 1;
    expect(
      arbol(
        i(1, 1),
        [
          [i(2, 1), i(1, 1)],
          [i(2, 2), i(1, 1)],
        ],
        nodo,
      ),
    ).toEqual(new Set([`${i(1, 1)}-${i(2, 1)}`, `${i(1, 1)}-${i(2, 2)}`]));
    // Y colgar de lo que no es red es un fallo de programa.
    expect(() => arbol(i(1, 1), [[i(3, 3), i(2, 2)]])).toThrow(/no se cuelga \(3,3\) de \(2,2\)/);
  });

  it('la cuarta diagonal de una casilla cerraría un aspa, y no si entra por una esquina (auditoría 3, §7)', () => {
    const tres = (nodo = new Uint8Array(W * H)) => {
      const a = new ArbolDeCaminos(W, H, nodo, i(2, 2));
      for (const c of [i(1, 1), i(3, 1), i(1, 3)]) a.colgar(c, i(2, 2));
      return a;
    };
    expect(tres().cerrariaUnAspa(i(2, 2), i(3, 3))).toBe(true);
    // Con tres no hay aspa: una recta y un ramal.
    const dos = new ArbolDeCaminos(W, H, new Uint8Array(W * H), i(2, 2));
    for (const c of [i(1, 1), i(3, 1)]) dos.colgar(c, i(2, 2));
    expect(dos.cerrariaUnAspa(i(2, 2), i(3, 3))).toBe(false);
    // Con una esquina en la red, (3,3) se colgaría de ella en recto.
    const conEsquina = tres();
    conEsquina.colgar(i(3, 2), i(2, 2));
    expect(conEsquina.cerrariaUnAspa(i(2, 2), i(3, 3))).toBe(false);
    // Un paso recto, o hacia lo que ya es red, no cuelga nada en diagonal.
    expect(tres().cerrariaUnAspa(i(2, 2), i(2, 3))).toBe(false);
    expect(tres().cerrariaUnAspa(i(2, 2), i(1, 3))).toBe(false);
  });
});

describe('a una mina, un pueblo o una ciudad se entra por su puerta (#188)', () => {
  // Una región de 9×6 con un nodo a la izquierda, en (0,2), y la columna 0
  // de barrera. Los objetivos son el nodo, una mina en (4,2) y un pueblo a la
  // derecha, en (8,2): en línea recta, el radio al pueblo cruzaría la mina.
  const W = 9;
  const H = 6;
  const i = (x: number, y: number) => y * W + x;
  const nodo = i(0, 2);
  const mina = i(4, 2);
  const pueblo = i(8, 2);
  const entrada = (barrera: number[] = []): EntradaDeCaminos => {
    const tipos = new Int8Array(W * H).fill(ABIERTA);
    const regionDe = new Int32Array(W * H);
    for (let y = 0; y < H; y++) {
      tipos[i(0, y)] = y === 2 ? ABIERTA : 0;
      regionDe[i(0, y)] = -1;
    }
    for (const b of barrera) {
      tipos[b] = 0;
      regionDe[b] = -1;
    }
    return {
      W,
      H,
      tipos,
      regionDe,
      regiones: 1,
      suelos: ['grass'],
      nodosDeRegion: [[nodo]],
      objetivos: [[nodo, mina, pueblo]],
      puertas: [mina, pueblo],
      monstruos: new Uint8Array(W * H),
      ocupadas: new Set([nodo, mina, pueblo]),
      nivel: new Int8Array(W * H).fill(1),
      puentes: new Set(),
    };
  };
  /** Las casillas que llegan a `c` por un tramo. */
  const llegan = (tramos: [number, number][], c: number) =>
    tramos.flatMap(([p, q]) => (p === c ? [q] : q === c ? [p] : []));

  it('el radio que sigue de largo pasa por delante y la mina cuelga de él por su puerta', () => {
    const tramos = trazarCaminos(entrada());
    expect(llegan(tramos, mina)).toEqual([i(4, 3)]);
    expect(llegan(tramos, pueblo)).toEqual([i(8, 3)]);
    // La puerta es un cruce: le llega el radio de un lado y sigue al otro.
    expect(llegan(tramos, i(4, 3)).length).toBe(3);
    // Y nada pasa por detrás de la mina ni pegado a sus costados.
    const casillas = new Set(tramos.flat());
    for (const c of [i(3, 1), i(4, 1), i(5, 1), i(3, 2), i(5, 2)])
      expect(casillas.has(c)).toBe(false);
  });

  it('con la puerta tapada se entra por una diagonal de delante, y con la fila tapada, de lado', () => {
    expect(llegan(trazarCaminos(entrada([i(4, 3)])), mina)).toEqual([
      expect.toSatisfy((c: number) => c === i(3, 3) || c === i(5, 3)),
    ]);
    const deLado = llegan(trazarCaminos(entrada([i(3, 3), i(4, 3), i(5, 3)])), mina);
    expect(deLado).toHaveLength(1);
    expect([i(3, 2), i(5, 2)]).toContain(deLado[0]);
  });

  it('solo se cruza si no hay otra: una mina en un pasillo de una casilla', () => {
    // Todo es barrera menos la fila 2: el pueblo solo se alcanza cruzando la mina.
    const barrera = rango(1, 8).flatMap((x) => [0, 1, 3, 4, 5].map((y) => i(x, y)));
    const tramos = trazarCaminos(entrada(barrera));
    expect(llegan(tramos, mina).sort((a, b) => a - b)).toEqual([i(3, 2), i(5, 2)]);
    expect(llegan(tramos, pueblo)).toEqual([i(7, 2)]);
  });
});

describe('el camino se aparta del pie de lo alto y del borde del mapa (#189)', () => {
  // Una región de 9×6 abierta. Los dos objetivos, en (0,2) y (8,2): en línea
  // recta, el camino iría por la fila 2.
  const W = 9;
  const H = 6;
  const i = (x: number, y: number) => y * W + x;
  const a = i(0, 2);
  const b = i(8, 2);
  /** Con la fila 1 de `barrera` (y la 0 también, fuera de la región). */
  const entrada = (barrera: Barrera | null, objetivos = [a, b]): EntradaDeCaminos => {
    const tipos = new Int8Array(W * H).fill(ABIERTA);
    const regionDe = new Int32Array(W * H);
    if (barrera !== null)
      for (let x = 0; x < W; x++)
        for (const y of [0, 1]) {
          tipos[i(x, y)] = BARRERAS.indexOf(barrera);
          regionDe[i(x, y)] = -1;
        }
    return {
      W,
      H,
      tipos,
      regionDe,
      regiones: 1,
      suelos: ['grass'],
      nodosDeRegion: [[]],
      objetivos: [objetivos],
      puertas: [],
      monstruos: new Uint8Array(W * H),
      ocupadas: new Set(objetivos),
      nivel: new Int8Array(W * H).fill(1),
      puentes: new Set(),
    };
  };
  const casillas = (e: EntradaDeCaminos) => new Set(trazarCaminos(e).flat());
  const enLaFila = (c: Set<number>, y: number) => rango(2, 6).filter((x) => c.has(i(x, y)));

  it('al pie de un acantilado, de una montaña o de un bosque va por la fila de debajo', () => {
    // La escena pinta lo alto colgando sobre la casilla de debajo, y la senda
    // pegada a ese pie desaparecía bajo la pared (s13, (11,13)-(13,13)).
    for (const barrera of ['cliff', 'mountain', 'forest'] as const) {
      const c = casillas(entrada(barrera));
      expect(enLaFila(c, 2), barrera).toEqual([]);
      expect(enLaFila(c, 3), barrera).toEqual([2, 3, 4, 5, 6]);
    }
  });

  it('el agua o un muro al norte no se cobran: el agua va encajada y el muro es muralla', () => {
    for (const barrera of ['water', 'wall'] as const)
      expect(enLaFila(casillas(entrada(barrera)), 2), barrera).toEqual([2, 3, 4, 5, 6]);
  });

  it('pegado al borde del mapa, tampoco: va por la fila de dentro si la hay', () => {
    const c = casillas(entrada(null, [i(0, 0), i(8, 0)]));
    expect(enLaFila(c, 0)).toEqual([]);
    expect(enLaFila(c, 1)).toEqual([2, 3, 4, 5, 6]);
  });

  it('es un coste y no una prohibición: un pasillo de una casilla al pie sigue siendo el camino', () => {
    const e = entrada('cliff');
    const tipos = Int8Array.from(e.tipos);
    const regionDe = Int32Array.from(e.regionDe);
    for (let x = 0; x < W; x++)
      for (const y of [3, 4, 5]) {
        tipos[i(x, y)] = BARRERAS.indexOf('cliff');
        regionDe[i(x, y)] = -1;
      }
    expect(enLaFila(casillas({ ...e, tipos, regionDe }), 2)).toEqual([2, 3, 4, 5, 6]);
  });

  /** Los tramos de camino con las dos casillas en la misma línea del borde. */
  const porElBorde = (map: GameMap): number =>
    map.caminos.tramos.filter(
      ([p, q]) =>
        (p.x === 0 && q.x === 0) ||
        (p.y === 0 && q.y === 0) ||
        (p.x === map.width - 1 && q.x === map.width - 1) ||
        (p.y === map.height - 1 && q.y === map.height - 1),
    ).length;

  it('el camino apenas corre por el borde del mapa: ni puertas en él ni atajos por él', () => {
    // Medido con `newGame` en 1-100 (08-10-2026): 8,4 tramos por mapa antes,
    // 5,4 de ellos al pie de la puerta de una mina o un pueblo; ahora, 2,0, en
    // pasillos de una casilla entre el borde y una barrera. Sin la puerta fuera
    // del borde (`colocarPar`) y sin el coste, aquí salen 11,9 en 1-20 (2,0 con ellos).
    const semillas = segunPrisa(rango(1, 20), rango(1, 100));
    const tramos = semillas.map((s) => porElBorde(buildMap(generateMapPlan(createRng(s))).map));
    expect(tramos.reduce((x, y) => x + y, 0) / semillas.length).toBeLessThanOrEqual(3);
  });
});

describe('qué nodo lleva camino entre dos regiones vecinas', () => {
  // La red de dos regiones con dos nodos comunes, (5,1) y (5,5); las semillas,
  // más cerca del de abajo.
  const red = (): Estructura =>
    ({
      regiones: [
        { id: 'region-0', name: 'a', at: { x: 2, y: 5 }, nodos: [0, 1] },
        { id: 'region-1', name: 'b', at: { x: 8, y: 5 }, nodos: [0, 1] },
      ],
      nodos: [
        { id: 'n0', at: { x: 5, y: 1 }, ciudad: false, regiones: [0, 1] },
        { id: 'n1', at: { x: 5, y: 5 }, ciudad: false, regiones: [0, 1] },
      ],
    }) as unknown as Estructura;

  it('el más cercano a las dos semillas, o la ciudad si la hay, y uno solo', () => {
    expect(crucesConCamino(red(), [])).toEqual([[1], [1]]);
    expect(crucesConCamino(red(), [{ nodo: 0 }])).toEqual([[0], [0]]);
  });

  it('la base lleva camino desde su casa, y una casa que no toca lanza', () => {
    expect(crucesConCamino(red(), [{ nodo: 0, casa: 1 }])).toEqual([[0], [0]]);
    expect(() => crucesConCamino(red(), [{ nodo: 0, casa: 2 }])).toThrow(
      /la base del nodo 0 no toca su región de casa/,
    );
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

/**
 * Lo que se pide a la entrada de cada nodo del mapa (#161, #166 H10), mirado en
 * el mapa ya hecho y no en el vestido:
 *  - un **eje**: dos vecinas opuestas (N-S, E-O o diagonal) pisables y de
 *    regiones distintas;
 *  - que cada una siga por tierra **en cruz**: una vecina en cruz pisable de su
 *    región, sin contar el nodo (si no, es un islote unido en diagonal);
 *  - y **nada delante**: ni mina, ni pueblo, ni ciudad, ni cofre, ni recurso, ni
 *    monstruo en `n ± 2d`, en ninguna de las ocho direcciones, ni bajo las dos
 *    entradas diagonales del sur, `n + (±1, 2)`: se pinta delante de la entrada
 *    y, en un puente diagonal, tapa el estribo de abajo. Ni en su reflejo,
 *    `n + (±1, −2)`, que el generador veta para no romper el espejo.
 *
 * Lo del eje es para los pasos (`node`), no para las ciudades: una ciudad es un
 * cruce de tres regiones y no tiene por qué tener dos vecinas enfrentadas (en
 * 1-10, cinco no las tienen). Lo de delante, para todo nodo.
 */
function entradasDeNodo(map: GameMap): string[] {
  const W = map.width;
  const { regionDe } = estructura(map);
  const reg = (x: number, y: number): number =>
    x >= 0 && y >= 0 && x < W && y < map.height && isWalkable(map.terrain[y * W + x] as TerrainKind)
      ? (regionDe[y * W + x] as number)
      : -1;
  const fallos: string[] = [];
  const delante = new Set(['mine', 'village', 'town', 'chest', 'resource', 'monster']);
  for (const nodo of map.objects) {
    if (nodo.kind !== 'node' && nodo.kind !== 'town') continue;
    const { x, y } = nodo.at;
    if (nodo.kind === 'node') {
      const enCruz = (ex: number, ey: number): boolean =>
        [
          [0, 1],
          [1, 0],
          [0, -1],
          [-1, 0],
        ].some(
          ([dx, dy]) =>
            !(ex + dx! === x && ey + dy! === y) && reg(ex + dx!, ey + dy!) === reg(ex, ey),
        );
      const ejes = (
        [
          [0, 1],
          [1, 0],
          [1, -1],
          [1, 1],
        ] as const
      ).filter(([dx, dy]) => {
        const a = reg(x + dx, y + dy);
        const b = reg(x - dx, y - dy);
        return a >= 0 && b >= 0 && a !== b;
      });
      if (ejes.length === 0)
        fallos.push(
          `el nodo de (${x},${y}) no tiene dos vecinas opuestas pisables de regiones distintas`,
        );
      else if (!ejes.some(([dx, dy]) => enCruz(x + dx, y + dy) && enCruz(x - dx, y - dy)))
        fallos.push(
          `el nodo de (${x},${y}) no tiene un eje cuyas dos entradas sigan por tierra en cruz`,
        );
    }
    for (const o of map.objects) {
      if (!delante.has(o.kind)) continue;
      const dx = o.at.x - x;
      const dy = o.at.y - y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) === 2 && dx % 2 === 0 && dy % 2 === 0)
        fallos.push(`${o.kind} en (${o.at.x},${o.at.y}), delante del nodo de (${x},${y})`);
      else if (Math.abs(dx) === 1 && Math.abs(dy) === 2)
        fallos.push(
          `${o.kind} en (${o.at.x},${o.at.y}), junto a la entrada diagonal de (${x + dx},${y + dy / 2}) del nodo de (${x},${y})`,
        );
    }
  }
  return fallos;
}
