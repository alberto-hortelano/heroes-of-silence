/**
 * **La complejidad del combate de una partida** (22-10-2026, decisiones del
 * usuario: «tres niveles de complejidad para tropa y combate. El número total de
 * tropa podrá ser 3, 5 o 7 y las acciones de la rueda de combate también»). Dos
 * cosas que se eligen cada una por su lado al empezar —en «Nuevo juego», en la
 * URL, en la arena o en el entorno del servidor— y no cambian en toda la partida:
 *
 * - **El tope de tropa por bando** (`tope`): cuántos individuos pisan el tablero,
 *   héroe incluido. El liderazgo sigue decidiendo qué cabe dentro de él. Vale para
 *   todo bando de toda batalla de la partida y para lo que se recluta.
 * - **La rueda** (`rueda`): de cuántos tipos es la rueda del golpe
 *   (`RUEDAS`, `battle/formas-de-la-rueda.ts`).
 *
 * Lo guarda `GameState.combate` y lo lleva cada batalla (`createBattle`, que pone
 * `BattleState.rueda`). Con 7 / 7 (`COMBATE_COMPLETO`) todo es como antes: el
 * banco no cambia.
 */
import { TIPOS_DE_LAS_RUEDAS, type TiposDeLaRueda } from './battle/formas-de-la-rueda.js';
import { type GrupoDeTropa, LIDERAZGO } from './data.js';
import type { MapObject } from './map/map.js';
import { type Army, enumerar } from './types.js';

export interface ReglasDelCombate {
  /** Cuántos individuos por bando, como mucho, con el héroe (uno de `LIDERAZGO.topesPorBando`). */
  readonly tope: number;
  /** De cuántos tipos es la rueda del golpe. */
  readonly rueda: TiposDeLaRueda;
}

/** La de siempre: tope 7 y la rueda de 7. Lo que se juega si nadie elige otra cosa. */
export const COMBATE_COMPLETO: ReglasDelCombate = {
  tope: LIDERAZGO.maxPorBando,
  rueda: 7,
};

/** Los topes que se pueden elegir, de menos a más (`data/liderazgo.json`). */
export const TOPES_DE_TROPA: readonly number[] = LIDERAZGO.topesPorBando;

/**
 * La complejidad con lo que se pidió de cada cosa, y la de siempre en lo que no
 * (`null`): lo que leen la URL de la partida y el entorno del servidor, que piden
 * cada una por su lado.
 */
export function combateCon(tope: number | null, rueda: TiposDeLaRueda | null): ReglasDelCombate {
  return { tope: tope ?? COMBATE_COMPLETO.tope, rueda: rueda ?? COMBATE_COMPLETO.rueda };
}

/** Lo que es cada campo, para decir que algo no lo es: la única frase de cada uno. */
const QUE_ES: Readonly<Record<keyof ReglasDelCombate, string>> = {
  tope: 'un tope de tropa',
  rueda: 'una rueda',
};

/** «"4" no es una rueda: valen 3, 5 o 7». */
function noEs(valor: unknown, valen: readonly number[], campo: keyof ReglasDelCombate): string {
  return `«${String(valor)}» no es ${QUE_ES[campo]}: valen ${enumerar(valen.map(String), 'o')}`;
}

/** Por qué `reglas` no es una complejidad que se pueda jugar, o `null`. */
export function combateBlocker(reglas: ReglasDelCombate): string | null {
  if (!TOPES_DE_TROPA.includes(reglas.tope)) return noEs(reglas.tope, TOPES_DE_TROPA, 'tope');
  if (!(TIPOS_DE_LAS_RUEDAS as readonly number[]).includes(reglas.rueda)) {
    return noEs(reglas.rueda, TIPOS_DE_LAS_RUEDAS, 'rueda');
  }
  return null;
}

/**
 * El número de `valen` que pide un texto (`?tropa=`, `HEROES_RUEDA`…), con la regla
 * de `parseSeed`: vacío o sin él, `null` (el de siempre); uno que no vale se
 * rechaza diciendo cuáles valen, en vez de jugar otro.
 */
function deLaLista<T extends number>(
  texto: string | null | undefined,
  valen: readonly T[],
  campo: keyof ReglasDelCombate,
): T | null {
  if (texto === null || texto === undefined || texto.trim() === '') return null;
  const n = valen.find((v) => String(v) === texto.trim());
  if (n === undefined) throw new Error(noEs(texto, valen, campo));
  return n;
}

/** El tope de tropa que pide un texto (`?tropa=`, `HEROES_TROPA`): `deLaLista`. */
export function parseTope(texto: string | null | undefined): number | null {
  return deLaLista(texto, TOPES_DE_TROPA, 'tope');
}

/** La rueda que pide un texto (`?rueda=`, `HEROES_RUEDA`): `deLaLista`. */
export function parseRueda(texto: string | null | undefined): TiposDeLaRueda | null {
  return deLaLista(texto, TIPOS_DE_LAS_RUEDAS, 'rueda');
}

/** Cuánta tropa lleva un héroe con el tope `tope`: él ocupa uno de los puestos de su bando. */
export function cupoDelHeroe(tope: number): number {
  return tope - 1;
}

/**
 * Lo que nace sin héroe en una partida: las guarniciones, los grupos de
 * asaltantes y los monstruos del mapa. Cada campo, si lo hay.
 */
export interface LoQueNaceSinHeroe {
  readonly towns?: readonly { readonly garrison: Army }[];
  readonly raiders?: readonly { readonly troops: readonly GrupoDeTropa[] }[];
  readonly map?: { readonly objects: readonly MapObject[] };
}

/**
 * Una copia de `x` con todo lo que nace sin héroe en el tope de tropa `tope`: cada
 * guarnición, sus primeros `tope` individuos; cada asaltante, de sus primeros
 * grupos hasta `tope`; cada monstruo, `tope` como mucho. **La regla del nivel**,
 * no una corrección callada, y **la única**: el mapa no depende del tope (misma
 * semilla, mismo mapa), y es la partida la que lo deja en su tope al nacer
 * (`createGame`) y al brotar (`dondeBrotan`). No toca `x`: lo que ya cabe va tal
 * cual, y con el tope de siempre no cambia nada. Se le dice al agente
 * (`you.combat.troopCap`).
 */
export function loNeutralAlTope<T extends LoQueNaceSinHeroe>(x: T, tope: number): T {
  const sobra = (n: number): boolean => n > tope;
  return {
    ...x,
    ...(x.towns === undefined
      ? {}
      : {
          towns: x.towns.map((t) =>
            sobra(t.garrison.length) ? { ...t, garrison: t.garrison.slice(0, tope) } : t,
          ),
        }),
    ...(x.raiders === undefined
      ? {}
      : { raiders: x.raiders.map((r) => ({ ...r, troops: gruposAlTope(r.troops, tope) })) }),
    ...(x.map === undefined || !x.map.objects.some((o) => o.kind === 'monster' && sobra(o.count))
      ? {}
      : {
          map: {
            ...x.map,
            objects: x.map.objects.map((o) =>
              o.kind === 'monster' && sobra(o.count) ? { ...o, count: tope } : o,
            ),
          },
        }),
  };
}

/** La tropa en grupos de un asaltante, de los primeros grupos hasta `tope` individuos. */
function gruposAlTope(grupos: readonly GrupoDeTropa[], tope: number): readonly GrupoDeTropa[] {
  if (grupos.reduce((n, g) => n + g.count, 0) <= tope) return grupos;
  const out: GrupoDeTropa[] = [];
  let quedan = tope;
  for (const g of grupos) {
    if (quedan <= 0) break;
    const count = Math.min(g.count, quedan);
    out.push(count === g.count ? g : { ...g, count });
    quedan -= count;
  }
  return out;
}
