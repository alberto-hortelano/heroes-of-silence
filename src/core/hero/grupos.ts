/**
 * Lo que va sin héroe: los grupos neutrales (los asaltantes, los encuentros de un
 * mundo) con sus techos de liderazgo y de fuerza, y lo neutral en el tope de tropa
 * de la partida (`loNeutralAlTope`, `gruposAlTope`).
 *
 * Vivía repartido entre `state/asaltantes.ts` (los techos) y `combate.ts` (el
 * tope): por los techos, el generador del mapa importaba el estado de la partida, y
 * por el tope, la complejidad del combate conocía los objetos del mapa (fase N de la
 * reorganización, 07-11-2026).
 */
import { problemasDeTopeDeLiderazgo } from '../catalogo.js';
import { ASALTANTES } from '../data.js';
import type { MapObject } from '../map/map.js';
import type { Army, GrupoDeTropa } from '../types.js';
import { poderDe } from './fuerza.js';

/**
 * Lo que impide que unos grupos de tropa sean un grupo neutral sin héroe: de 1
 * individuo en adelante, el techo de liderazgo y el techo de fuerza de
 * `data/asaltantes.json`. `queEs` lo nombra en la frase —«un grupo de
 * asaltantes», «un encuentro»—. Una sola comprobación para los sitios donde se
 * escribe uno: los datos de los asaltantes, el plan de mapa del agente
 * (`validateMapPlan`) y los encuentros de un mundo (`problemasDelMundo`), que
 * así no llevan una cifra propia.
 */
export function problemasDeGrupoNeutral(
  grupos: readonly GrupoDeTropa[],
  quien: string,
  queEs: string,
): string[] {
  // Un grupo de cero individuos no es un grupo: ocupaba casilla, era hostil y no
  // emboscaba, y atacarlo daba una batalla de 0 rondas ganada al instante. Aquí y
  // no en `problemasDeGrupo`, porque una guarnición vacía SÍ es un estado de
  // juego —la que queda al tomar un castillo—.
  if (grupos.length === 0) {
    return [`${quien} no lleva a nadie: ${queEs} es de 1 individuo en adelante`];
  }
  const problemas = problemasDeTopeDeLiderazgo(grupos, quien, ASALTANTES.liderazgoMax, queEs);
  if (problemas.length > 0) return problemas;
  const fuerza = poderDe({ troops: grupos });
  if (fuerza > ASALTANTES.fuerzaMax) {
    problemas.push(
      `${quien} suma ${fuerza} de fuerza y ${queEs} lleva como mucho ${ASALTANTES.fuerzaMax}: más fuerte que eso es un muro que ningún héroe cruza`,
    );
  }
  return problemas;
}

/** Lo que impide que unos grupos de tropa sean un asaltante (`problemasDeGrupoNeutral`). */
export function problemasDeAsaltante(grupos: readonly GrupoDeTropa[], quien: string): string[] {
  return problemasDeGrupoNeutral(grupos, quien, 'un grupo de asaltantes');
}

// El techo de fuerza se comprueba AL CARGAR, como el resto del fichero en
// `data.ts`: aquí y no allí porque medir la fuerza pide `fuerza.ts`, que importa
// el catálogo, y desde el catálogo sería un ciclo.
{
  const problemas = ASALTANTES.composiciones.flatMap((grupos, i) =>
    problemasDeAsaltante(grupos, `data/asaltantes.json: la composición ${i}`),
  );
  if (problemas.length > 0) throw new Error(problemas.join('; '));
}

/**
 * Lo que nace sin héroe en una partida: las guarniciones, los grupos de
 * asaltantes y los monstruos del mapa. Cada campo, si lo hay.
 */
export interface LoQueNaceSinHeroe {
  /** Las guarniciones con que nacen las ciudades (`BuiltMap.guarniciones`), por id de su sitio. */
  readonly guarniciones?: Readonly<Record<string, { readonly tropa: Army }>>;
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
    ...(x.guarniciones === undefined
      ? {}
      : {
          guarniciones: Object.fromEntries(
            Object.entries(x.guarniciones).map(([id, g]) => [
              id,
              sobra(g.tropa.length) ? { ...g, tropa: g.tropa.slice(0, tope) } : g,
            ]),
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

/**
 * La tropa en grupos de lo neutral (un asaltante, el encuentro de un lugar de un
 * mundo), de los primeros grupos hasta `tope` individuos. La de un encuentro se
 * recorta al pelearlo (`defenderSide`) y al medirlo la IA (`ai/lugares.ts`): la
 * historia del mundo no depende del tope, como el mapa.
 */
export function gruposAlTope(
  grupos: readonly GrupoDeTropa[],
  tope: number,
): readonly GrupoDeTropa[] {
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
