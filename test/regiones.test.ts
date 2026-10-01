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
import { mapPlanSchema } from '../src/core/contract/agent.js';
import {
  buildMap,
  generateMapPlan,
  type MapPlan,
  validateMapPlan,
} from '../src/core/map/generate.js';
import { type Estructura, estructura } from '../src/core/map/regiones.js';
import { createRng } from '../src/core/rng.js';
import { planDeNodos } from './helpers.js';

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
  it('200 semillas en 24×24 y 20 en 48×48: válidas, ciudades de grado ≥ 3, equilibradas y con dos caminos', () => {
    const fallos: string[] = [];
    for (const [lado, semillas] of [
      [24, 200],
      [48, 20],
    ] as const) {
      for (let s = 1; s <= semillas; s++) {
        const plan = generateMapPlan(createRng(s), { width: lado, height: lado });
        const dondeFalla = (f: string) => `${lado}×${lado} semilla ${s}: ${f}`;
        fallos.push(...validateMapPlan(plan).map(dondeFalla));
        fallos.push(...auditar(plan).map(dondeFalla));
      }
    }
    expect(fallos).toEqual([]);
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
