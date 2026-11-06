/**
 * Ayudantes para montar batallas a mano en los tests de las reglas
 * (`reglas-de-batalla.test.ts`) y de la previsión (`prevision.test.ts`): un
 * héroe de prueba y un bando. Escritos una vez; antes cada test llevaba su copia.
 */
import type { BattleSide } from '../src/core/battle/battle.js';
import type { BattleHero } from '../src/core/battle/types.js';
import { HERO_BODY } from '../src/core/battle/types.js';
import type { CatalogoDeUnidades } from '../src/core/catalogo.js';
import { EQUIPO_BASE, EQUIPO_DEL_JUEGO } from '../src/core/hero/equipo.js';
import { EXPERIENCIA_INICIAL_DE_HEROE } from '../src/core/hero/experiencia.js';
import { cuerposDelHeroe } from '../src/core/hero/hero.js';
import type { Stack, UnitInfo } from '../src/core/types.js';
import type { Unidad } from '../src/core/unidad.js';

/** El mando de un héroe de prueba: poder 3, Prisa y Lentitud. */
export function mando(over: Partial<BattleHero> = {}): BattleHero {
  return {
    name: 'Prueba',
    retreat: { blocked: 'en la prueba no se huye' },
    spellPower: 3,
    knowledge: 5,
    mana: 50,
    castThisRound: false,
    spells: ['haste', 'slow'],
    ...over,
  };
}

/**
 * Un bando: su tropa y, si se pide, su héroe —con el cuerpo de un héroe recién
 * hecho, sin ataque ni defensa— y su moral.
 */
export function bando(
  army: readonly Stack[],
  o: { readonly heroe?: BattleHero; readonly moral?: number } = {},
): BattleSide {
  const h = o.heroe;
  return {
    army,
    hero:
      h === undefined
        ? null
        : {
            mando: h,
            figura: HERO_BODY,
            ...cuerposDelHeroe({
              name: h.name,
              attack: 0,
              defense: 0,
              experience: EXPERIENCIA_INICIAL_DE_HEROE,
              equipo: EQUIPO_BASE,
            }),
          },
    moraleBonus: o.moral ?? 0,
  };
}

/** Unas cifras hechas a mano, con el id que las nombra y, si se dice, la hoja con que se pintan. */
export interface CifrasAMano {
  readonly id: string;
  readonly unit: UnitInfo;
  /** La hoja de su cuerpo (`body`); sin ella, su id. */
  readonly hoja?: string;
}

/**
 * Un catálogo de la pelea (`BattleSide.catalogo`) que da a cada id **sus cifras
 * hechas a mano, tal cual** (la misma referencia): la vía de los tests para pelear
 * con unas cifras que no salen de un cuerpo y su equipo —un daño fijo, una defensa
 * propia, un rasgo que ninguna unidad lleva—.
 *
 * Hasta el 06-11-2026 esas cifras entraban como un personaje del RPG
 * (`BattleSide.members`); retirados los personajes, el motor solo saca las de la
 * tropa de un catálogo (`resolveUnit` → `cifrasDeUnidad`, que viste el cuerpo de la
 * unidad con su catálogo de equipo). Este da a cada id una unidad de relleno con
 * ese id por nombre y un equipo cuyo `conEquipo` devuelve las cifras pedidas: así
 * entran al montar la batalla, y cuentan para la moral, la escalera, el libro y el
 * orden de la primera ronda como las de cualquier tropa. Lo que cambia frente al
 * personaje es el origen (`catalogo`, con su precio: la rendición los cuenta).
 */
export function catalogoDeCifras(cifras: readonly CifrasAMano[]): CatalogoDeUnidades {
  const porId = new Map<string, CifrasAMano>();
  for (const c of cifras) {
    if (porId.has(c.id)) throw new Error(`dos cifras a mano con el id «${c.id}»`);
    porId.set(c.id, c);
  }
  const de = (id: string): CifrasAMano => {
    const c = porId.get(id);
    if (c === undefined) throw new Error(`no hay cifras a mano con el id «${id}»`);
    return c;
  };
  return {
    unidad: (id): Unidad => {
      const { unit, hoja } = de(id);
      return {
        id,
        name: id,
        faction: 'templarios',
        leadership: 1,
        cuerpo: { hoja: hoja ?? id },
        equipo: {},
        traits: [],
        habilidades: [],
        attack: unit.attack,
        fuerza: unit.fuerza,
        agilidad: unit.agilidad,
        hp: unit.hp,
      };
    },
    // El cuerpo de relleno se llama como su id: lo vestido son las cifras de ese id.
    equipo: {
      ...EQUIPO_DEL_JUEGO,
      conEquipo: <U extends UnitInfo>(cuerpo: U): U => de(cuerpo.name).unit as U,
    },
  };
}

/**
 * Un bando de unidades con cifras propias, como las de la arena: cada una entra
 * con su `unit` tal cual (`catalogoDeCifras`), una por stack.
 */
export function bandoDe(unidades: readonly CifrasAMano[]): BattleSide {
  return {
    army: unidades.map((u) => ({ creature: u.id, count: 1 })),
    hero: null,
    catalogo: catalogoDeCifras(unidades),
  };
}
