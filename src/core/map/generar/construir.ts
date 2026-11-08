/**
 * Del plan declarativo al mapa jugable (`buildMap`). El agente NO dibuja el
 * mapa: devuelve un plan (manchas de terreno, regiones, muros, nodos, ciudades,
 * pueblos, monstruos, tesoros) y aquí se convierte en un `GameMap`
 * determinista. Lo mismo hace el generador procedimental de respaldo
 * (`procedimental.ts`), así que los dos caminos pasan por la misma validación de
 * jugabilidad (`validar.ts`) — y desde la fase 2, por la misma comprobación de
 * que el mapa **es una red de nodos** (`problemasDeRed`). Aquí también, la
 * puerta de los caminos de un plan al mapa (`caminosDelPlan`) y la única
 * conversión del plan procedimental al del agente (`planDelAgente`).
 *
 * Era la sección de la construcción de `map/generate.ts` hasta la fase N de la
 * reorganización (07-11-2026).
 */
import { ejercitoDe } from '../../hero/troop.js';
import { createTown, primeraCiudadDe } from '../../town/town.js';
import type { Army, Guarnicion, Point } from '../../types.js';
import { guarnicionDeBase, guarnicionNeutral } from '../../unidad/catalogo.js';
import { aPunto, inBounds } from '../geometria.js';
import { createEmptyMap, tramosDeCasillas } from '../map.js';
import { RedDeCaminos } from '../red-de-caminos.js';
import { componentesDelMapa } from '../regiones.js';
import { type Barrera, esBarrera, isWalkable, type Suelo, type TerrainKind } from '../terrain.js';
import type { GameMap, MapObject } from '../tipos.js';
import type { BuiltMap, MapPlan, PlanConCasillas, PlanConTramos, PlannedTown } from './plan.js';

/** Los ids que `buildMap` les pone a los objetos que el plan no nombra. */
export const idDeNodo = (i: number): string => `node-${i}`;
export const idDePueblo = (i: number): string => `village-${i}`;

/**
 * La guarnición con la que nace una ciudad, en individuos: la neutral la de su
 * facción, la base la de la facción de su dueño —que es la suya: la facción de
 * un jugador sale de su base— y el resto de ciudades con dueño, ninguna.
 */
function guarnicionInicial(t: PlannedTown, towns: readonly PlannedTown[]): Army {
  const grupos =
    t.owner === null
      ? guarnicionNeutral(t.faction)
      : primeraCiudadDe(towns, t.owner) === t
        ? guarnicionDeBase(t.faction)
        : [];
  return ejercitoDe(grupos);
}

/**
 * **La puerta** de los caminos de un plan al mapa (#153). El procedimental trae
 * sus tramos y van tal cual; el agente escribe casillas y sus tramos los deriva
 * `tramosDeCasillas`, con la regla con la que siempre se le pintaron. Lanza con
 * una casilla fuera del mapa (`RedDeCaminos`): `validateMapPlan` la rechaza
 * antes de construir nada.
 */
export function caminosDelPlan(plan: MapPlan): RedDeCaminos {
  const { width, height } = plan;
  if (plan.tramos !== undefined) return RedDeCaminos.desdeTramos(plan.tramos, width, height);
  const { tramos, sueltas } = tramosDeCasillas(
    plan.roads ?? [],
    width,
    height,
    plan.towns.map((t) => t.at),
  );
  return RedDeCaminos.desdeTramos(tramos, width, height, sueltas);
}

/**
 * El plan procedimental escrito como lo escribe el agente: los caminos como
 * casillas. Es **la única conversión** de uno a otro, y la necesita quien hace
 * pasar un plan del generador por `mapPlanSchema` (la política de `pnpm qa`):
 * zod quita `tramos` sin decir nada y el mapa saldría sin un camino. Las
 * casillas son las de la red de los tramos; sus tramos, al construirlo, los
 * vuelve a derivar `tramosDeCasillas` con la regla de adyacencia del agente.
 */
export function planDelAgente(plan: PlanConTramos): PlanConCasillas {
  const { tramos: _, ...comun } = plan;
  const red = caminosDelPlan(plan);
  return { ...comun, roads: red.indices.map((i) => aPunto(i, plan.width)) };
}

/**
 * El terreno de manchas y muros, antes de que nodos y ciudades abran su
 * casilla: lo que pinta `buildMap` y lo que mira `validateMapPlan` para saber
 * qué barrera cruza cada nodo.
 */
export function terrenoPintado(plan: MapPlan): TerrainKind[] {
  const { terrain } = createEmptyMap(plan.width, plan.height, plan.baseTerrain);
  const pintar = (x: number, y: number, t: TerrainKind): void => {
    if (inBounds(plan, { x, y })) terrain[y * plan.width + x] = t;
  };

  // Manchas: redondeadas, pintadas en orden, la última manda.
  for (const mancha of plan.patches) {
    for (let y = 0; y < plan.height; y++) {
      for (let x = 0; x < plan.width; x++) {
        const dx = x - mancha.center.x;
        const dy = y - mancha.center.y;
        if (dx * dx + dy * dy <= mancha.radius * mancha.radius) pintar(x, y, mancha.terrain);
      }
    }
  }

  // Muros, encima de las manchas: un muro manda sobre el color del suelo.
  for (const m of plan.walls) {
    const x0 = Math.min(m.from.x, m.to.x);
    const x1 = Math.max(m.from.x, m.to.x);
    const y0 = Math.min(m.from.y, m.to.y);
    const y1 = Math.max(m.from.y, m.to.y);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) pintar(x, y, m.terrain);
  }
  return terrain;
}

export function buildMap(plan: MapPlan): BuiltMap {
  const base = createEmptyMap(plan.width, plan.height, plan.baseTerrain);
  // De cada región, lo de la red: el suelo se pinta aquí abajo y no se guarda.
  const map: GameMap = {
    ...base,
    terrain: terrenoPintado(plan),
    regions: plan.regions.map((r) => ({
      id: r.id,
      name: r.name,
      at: { ...r.at },
      nivel: r.nivel ?? 1,
    })),
    caminos: caminosDelPlan(plan),
  };
  const indice = (p: Point): number => p.y * plan.width + p.x;

  // Lo que cruza cada nodo es la barrera que abre (#145): la del muro que el
  // plan escribe debajo. Se lee antes de abrirla, y es el único sitio donde se
  // sabe; el escenógrafo la deducía de las vecinas y en un empate se equivocaba
  // (#187). Un nodo sin muro debajo lo rechaza `validateMapPlan`.
  const barreras = plan.nodes.map((p) => {
    const t = inBounds(map, p) ? (map.terrain[indice(p)] as TerrainKind) : null;
    if (t === null || !esBarrera(t)) {
      throw new Error(
        `el nodo de (${p.x},${p.y}) no está sobre ningún muro: no se sabe qué barrera cruza`,
      );
    }
    return t;
  });

  // Y la del pueblo en el muro (pueblos en un nodo, fase 3), como la de un nodo:
  // la que abre, o `null` si está en lo que se pisa. Sobre qué barreras puede ir y
  // que sea un nodo lo juzga `validateMapPlan` (`problemasDeLosPueblos`).
  const barrerasDePueblo = plan.villages.map((v) => {
    const t = inBounds(map, v.at) ? (map.terrain[indice(v.at)] as TerrainKind) : null;
    return t !== null && esBarrera(t) ? t : null;
  });

  // **La regla declarada**: un nodo, una ciudad o un pueblo abre la casilla en la
  // que está. Es lo que deja escribir un muro de punta a punta y poner el paso
  // encima, en vez de partir el tramo en dos alrededor del nodo. Es la ÚNICA
  // casilla que se abre: todo lo demás que caiga en un muro se rechaza
  // (`validateMapPlan`), no se sanea.
  for (const p of [
    ...plan.nodes,
    ...plan.towns.map((t) => t.at),
    ...plan.villages.map((v) => v.at),
  ]) {
    if (inBounds(map, p) && !isWalkable(map.terrain[indice(p)] as TerrainKind)) {
      map.terrain[indice(p)] = 'dirt';
    }
  }

  const objects: MapObject[] = [];
  for (const t of plan.towns) objects.push({ kind: 'town', id: t.id, at: t.at, owner: t.owner });
  for (const [i, n] of plan.nodes.entries()) {
    const barrera = barreras[i] as Barrera;
    objects.push({ kind: 'node', id: idDeNodo(i), at: n, owner: null, barrera, mejora: 'ninguna' });
  }
  for (const [i, v] of plan.villages.entries()) {
    objects.push({
      kind: 'village',
      id: idDePueblo(i),
      name: v.name,
      at: v.at,
      owner: null,
      barrera: barrerasDePueblo[i] ?? null,
    });
  }
  for (const [i, m] of plan.monsters.entries()) {
    objects.push({
      kind: 'monster',
      id: `mon-${i}`,
      at: m.at,
      creature: m.creature,
      count: m.count,
      defeated: false,
    });
  }
  for (const [i, c] of plan.chests.entries()) {
    objects.push({ kind: 'chest', id: `chest-${i}`, at: c.at, gold: c.gold, taken: false });
  }
  map.objects.push(...objects);
  pintarSuelosDeRegion(map, plan);

  const towns = plan.towns.map((t) => createTown(t.id, t.name, t.faction, t.at));
  // Una ciudad neutral nace guarnecida (decisión del usuario, fase 2a): hay que
  // pelear para tomarla. Y la base también: con «perder la base elimina», una
  // base vacía hacía de cada partida una carrera a por la del rival.
  const guarniciones: Record<string, Guarnicion> = Object.fromEntries(
    plan.towns.flatMap((t) => {
      const tropa = guarnicionInicial(t, plan.towns);
      return tropa.length === 0 ? [] : [[t.id, { dueño: t.owner, tropa }]];
    }),
  );
  // Los asaltantes no son objetos del mapa sino actores de la partida, así que
  // salen aparte, con un id que no comparte espacio con ningún objeto.
  const raiders = (plan.raiders ?? []).map((r, i) => ({
    id: `raider-${i}`,
    at: { ...r.at },
    troops: r.troops,
  }));
  return { map, towns, raiders, guarniciones };
}

/**
 * El suelo entero de cada región que lo declara: su componente de lo pisable
 * sin nodos (`componentesDelMapa`), que es exactamente la definición de región
 * de `regiones.ts`, con el corte del puente de una ciudad-puente. Va después de
 * abrir los nodos y de poner los objetos, y no pinta ningún nodo, así que lo
 * que se pisa no cambia y la red tampoco: solo el color del suelo. Si dos
 * regiones caen en la misma componente, pinta la primera.
 *
 * Una región declarada sobre un muro no pinta nada, y no se calla: la rechaza
 * `problemasDeRed` al validar, que es quien sabe decir por qué.
 */
function pintarSuelosDeRegion(map: GameMap, plan: MapPlan): void {
  const W = map.width;
  const { comp, total } = componentesDelMapa(map);
  const sueloDe = new Array<Suelo | undefined>(total);
  for (const r of plan.regions) {
    if (r.terrain === undefined || !inBounds(map, r.at)) continue;
    const c = comp[r.at.y * W + r.at.x] as number;
    if (c === -1 || sueloDe[c] !== undefined) continue;
    sueloDe[c] = r.terrain as Suelo;
  }
  for (let i = 0; i < comp.length; i++) {
    const suelo = sueloDe[comp[i] as number];
    if (suelo !== undefined) map.terrain[i] = suelo;
  }
}
