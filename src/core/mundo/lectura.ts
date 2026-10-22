/**
 * El mapa leído para el motor de narrativa: lo que necesita para decidir dónde
 * tiene sentido un lugar y con qué gente, sin leer una rejilla de casillas.
 *
 * `serializeKnownMap` es la del agente que juega: pasa por la niebla de un jugador
 * y sirve para mover un héroe. Esto es lo contrario: el mapa entero, por regiones,
 * con sus nombres, su suelo, su nivel, sus vecinas, sus ciudades y pueblos, el río
 * y **casillas de muestra que admiten un lugar** (`lugarBlocker`), que es lo que el
 * motor no puede comprobar. Con el vocabulario cerrado (`VOCABULARIO`) y el
 * catálogo de unidades y piezas por id, para que lo que escriba exista.
 */
import { unidadesDelJuego } from '../catalogo.js';
import { PIEZAS_DEL_CATALOGO } from '../hero/equipo.js';
import { armyLeadership, capacidadDe } from '../hero/troop.js';
import { buildMap, type MapPlan } from '../map/generate.js';
import { estructura, franjasDeBarrera } from '../map/regiones.js';
import { isWalkable } from '../map/terrain.js';
import { nivelDeUnidad } from '../nivel.js';
import { regionDeCasilla } from '../state/asaltantes.js';
import { newGame } from '../state/setup.js';
import type { FactionId, PlayerId, Point } from '../types.js';
import { type Mundo, VOCABULARIO } from './formato.js';
import { lugarBlocker } from './validar.js';

/** Cuántas casillas de muestra se dan por región. */
export const MUESTRAS_POR_REGION = 8;

export interface RegionLeida {
  readonly id: string;
  readonly nombre: string;
  /** El suelo con que la pinta el plan (`grass`, `snow`…), o `null` si no lo dice. */
  readonly suelo: string | null;
  /** 0 abajo, 1 el llano, 2 la meseta. */
  readonly nivel: number;
  /** Las regiones con las que comparte un paso o una ciudad, por id. */
  readonly vecinas: readonly string[];
  /**
   * De quién es la casa: la región de una base con menos pasos de las que la base
   * toca (la del procedimental se llama «Tierras de <la base>»); `null`, de nadie.
   * Al empezar no es de nadie más: una región es de quien tenga todos sus nodos.
   */
  readonly casaDe: PlayerId | null;
  /** Las ciudades que la tocan, por id. */
  readonly ciudades: readonly string[];
  /** Los pueblos de dentro, por nombre. */
  readonly pueblos: readonly string[];
  /** Si la toca el río. */
  readonly rio: boolean;
  /** Cuántas casillas se pisan en ella. */
  readonly casillas: number;
  /** Casillas que admiten un lugar (`lugarBlocker`), repartidas por la región. */
  readonly admitenUnLugar: readonly Point[];
}

/**
 * La tropa del héroe de salida, para que el motor sepa si un premio de tropa le
 * cabe: sale con el ejército lleno, así que una `tropa` al principio sale apagada
 * («no cabe») hasta que haya bajas o licencie a alguien. No es una regla nueva:
 * lo que dice es lo que mira `troopBlocker` al elegir.
 */
export interface TropaDeSalida {
  /** Lo que lleva, por unidad. */
  readonly lleva: readonly { readonly unidad: string; readonly n: number }[];
  /** Individuos que lleva y cuántos le caben como mucho. */
  readonly individuos: number;
  readonly cupo: number;
  /** Liderazgo que ocupa y su tope. */
  readonly liderazgo: number;
  readonly tope: number;
  readonly nota: string;
}

/** La tropa con que sale el héroe del jugador 0 en la partida de ese mundo. */
function tropaDeSalida(mundo: Mundo, plan: MapPlan): TropaDeSalida {
  const partida = newGame({ seed: mundo.semilla, plan, tipoDelHeroe: mundo.jugador.heroe });
  const hero = partida.heroes.find((h) => h.owner === 0);
  if (hero === undefined) throw new Error('la partida del mundo no tiene héroe del jugador 0');
  const lleva = new Map<string, number>();
  for (const t of hero.army) lleva.set(t.creature, (lleva.get(t.creature) ?? 0) + 1);
  const { tope, cupo } = capacidadDe(hero);
  const individuos = hero.army.length;
  const liderazgo = armyLeadership(hero.army);
  return {
    lleva: [...lleva].map(([unidad, n]) => ({ unidad, n })),
    individuos,
    cupo,
    liderazgo,
    tope,
    nota:
      individuos >= cupo || liderazgo >= tope
        ? `sale lleno (${individuos} de ${cupo} individuos, ${liderazgo} de ${tope} de liderazgo): un premio de «tropa» saldrá apagado («no cabe») hasta que pierda a alguien en una batalla o licencie; ponlo tras una pelea o no lo pongas`
        : `lleva ${individuos} de ${cupo} individuos y ${liderazgo} de ${tope} de liderazgo: le caben ${cupo - individuos} más y ${tope - liderazgo} de liderazgo (el de cada una, en «unidades»); una «tropa» que pida más saldrá apagada («no cabe») hasta que pierda a alguien`,
  };
}

export interface LecturaParaElMotor {
  readonly mundo: string;
  readonly mapa: { readonly ancho: number; readonly alto: number };
  readonly jugador: {
    readonly id: 0;
    readonly faccion: FactionId;
    readonly heroe: string;
    /** La tropa con que sale el héroe y lo que le cabe (H10 del QA de la F1a). */
    readonly tropa: TropaDeSalida;
  };
  readonly rival: { readonly id: 1; readonly faccion: FactionId };
  readonly regiones: readonly RegionLeida[];
  readonly ciudades: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly faccion: FactionId;
    readonly dueño: PlayerId | null;
    readonly at: Point;
    /** Las regiones que toca, por id. */
    readonly regiones: readonly string[];
  }[];
  readonly pueblos: readonly {
    readonly nombre: string;
    readonly at: Point;
    readonly region: string | null;
  }[];
  /** Los tramos de agua que separan regiones (el río), con las regiones que tocan. */
  readonly rio: readonly { readonly casillas: number; readonly regiones: readonly string[] }[];
  readonly unidades: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly faccion: FactionId;
    readonly nivel: number;
    readonly liderazgo: number;
  }[];
  readonly piezas: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly hueco: string;
    readonly precio: number;
  }[];
  readonly vocabulario: typeof VOCABULARIO;
}

/**
 * La lectura del mapa de un mundo para el motor. El plan, ya válido; `hecho`, su
 * mapa construido, si quien llama ya lo tiene (`escribirLectura` lo pinta después).
 */
export function lecturaParaElMotor(
  mundo: Mundo,
  plan: MapPlan,
  hecho: Pick<ReturnType<typeof buildMap>, 'map' | 'towns'> = buildMap(plan),
): LecturaParaElMotor {
  const { map, towns } = hecho;
  const red = estructura(map);
  const bases = towns.filter((t) => t.owner !== null);
  /** La facción de la base de `owner`: la de quien juega sale del plan, no del `mundo.json`. */
  const faccionDe = (owner: PlayerId): FactionId => {
    const base = bases.find((b) => b.owner === owner);
    if (base === undefined) throw new Error(`el plan del mundo no tiene base del jugador ${owner}`);
    return base.faction;
  };
  // La casa de cada base: de las regiones que toca, la de menos nodos.
  const casa = new Map<number, PlayerId>();
  for (const b of bases) {
    const nodo = red.nodos.find((n) => n.id === b.id);
    const suyas = [...(nodo?.regiones ?? [])].sort(
      (a, c) =>
        (red.regiones[a]?.nodos.length ?? 0) - (red.regiones[c]?.nodos.length ?? 0) || a - c,
    );
    if (suyas[0] !== undefined && b.owner !== null) casa.set(suyas[0], b.owner);
  }
  const nombreDe = (r: number): string => (red.regiones[r] as { id: string }).id;
  const suelos = new Map(plan.regions.map((r) => [r.id, r.terrain ?? null]));

  const vecinas = red.regiones.map(() => new Set<number>());
  for (const n of red.nodos) {
    for (const a of n.regiones) for (const b of n.regiones) if (a !== b) vecinas[a]?.add(b);
  }
  const casillasDe = red.regiones.map((): Point[] => []);
  for (let i = 0; i < map.width * map.height; i++) {
    const r = red.regionDe[i] as number;
    if (r < 0) continue;
    const p = { x: i % map.width, y: Math.floor(i / map.width) };
    if (isWalkable(map.terrain[i] as never)) casillasDe[r]?.push(p);
  }
  const conRio = new Set<number>();
  const rio = franjasDeBarrera(map.width, map.height, map.terrain, red.regionDe)
    .filter((f) => f.barrera === 'water' && f.regiones.size >= 2)
    .map((f) => {
      for (const r of f.regiones) conRio.add(r);
      return {
        casillas: f.casillas.length,
        regiones: [...f.regiones].sort((a, b) => a - b).map(nombreDe),
      };
    });

  const pueblos = map.objects.flatMap((o) => {
    if (o.kind !== 'village') return [];
    const r = regionDeCasilla(map, o.at);
    return [{ nombre: o.name, at: o.at, region: r < 0 ? null : nombreDe(r) }];
  });

  return {
    mundo: mundo.id,
    mapa: { ancho: map.width, alto: map.height },
    jugador: {
      id: 0,
      faccion: faccionDe(0),
      heroe: mundo.jugador.heroe,
      tropa: tropaDeSalida(mundo, plan),
    },
    rival: { id: 1, faccion: faccionDe(1) },
    regiones: red.regiones.map((reg, r) => ({
      id: reg.id,
      nombre: reg.name,
      suelo: suelos.get(reg.id) ?? null,
      nivel: reg.nivel,
      vecinas: [...(vecinas[r] ?? [])].sort((a, b) => a - b).map(nombreDe),
      casaDe: casa.get(r) ?? null,
      ciudades: red.nodos.filter((n) => n.ciudad && n.regiones.includes(r)).map((n) => n.id),
      pueblos: pueblos.filter((p) => p.region === reg.id).map((p) => p.nombre),
      rio: conRio.has(r),
      casillas: casillasDe[r]?.length ?? 0,
      admitenUnLugar: muestras(casillasDe[r] ?? [], (p) => lugarBlocker(map, p) === null),
    })),
    ciudades: towns.map((t) => ({
      id: t.id,
      nombre: t.name,
      faccion: t.faction,
      dueño: t.owner,
      at: t.at,
      regiones: (red.nodos.find((n) => n.id === t.id)?.regiones ?? []).map(nombreDe),
    })),
    pueblos,
    rio,
    unidades: unidadesDelJuego().map((u) => ({
      id: u.id,
      nombre: u.name,
      faccion: u.faction,
      nivel: nivelDeUnidad(u),
      liderazgo: u.leadership,
    })),
    piezas: [...PIEZAS_DEL_CATALOGO.values()].map((p) => ({
      id: p.id,
      nombre: p.nombre,
      hueco: p.hueco,
      precio: p.precio,
    })),
    vocabulario: VOCABULARIO,
  };
}

/**
 * Hasta `MUESTRAS_POR_REGION` casillas que pasan `vale`, repartidas por la
 * región: se recorre en orden y se toma una de cada tanto, para que no salgan
 * todas pegadas a la esquina de arriba. Sin azar: la misma lectura cada vez.
 */
function muestras(casillas: readonly Point[], vale: (p: Point) => boolean): Point[] {
  const buenas = casillas.filter(vale);
  if (buenas.length <= MUESTRAS_POR_REGION) return buenas;
  // Con más buenas que muestras, los índices crecen de uno en uno o más: ninguna sale dos veces.
  return Array.from(
    { length: MUESTRAS_POR_REGION },
    (_, k) => buenas[Math.floor((k * buenas.length) / MUESTRAS_POR_REGION)] as Point,
  );
}
