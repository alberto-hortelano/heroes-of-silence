/**
 * Ayudantes para montar batallas a mano en los tests de las reglas de la arena
 * (`reglas-de-batalla.test.ts`) y de la previsión (`prevision.test.ts`): un
 * héroe de prueba, un bando y unas reglas con algunas de fheroes2. Escritos una
 * vez; antes cada test llevaba su copia.
 */
import type { BattleMember, BattleSide } from '../src/core/battle/battle.js';
import {
  type NombreDeRegla,
  type ReglasDeBatalla,
  reglasDeLaURL,
} from '../src/core/battle/reglas.js';
import type { BattleHero } from '../src/core/battle/types.js';
import { EQUIPO_BASE } from '../src/core/hero/equipo.js';
import { EXPERIENCIA_INICIAL_DE_HEROE } from '../src/core/hero/experiencia.js';
import { heroUnit } from '../src/core/hero/hero.js';
import type { Stack, UnitInfo } from '../src/core/types.js';

/** Las del juego con estas en fheroes2. */
export function con(...nombres: NombreDeRegla[]): ReglasDeBatalla {
  return reglasDeLaURL(nombres.join(','));
}

/** El mando de un héroe de prueba: sin ataque ni defensa, poder 3, Bendición y Maldición. */
export function mando(over: Partial<BattleHero> = {}): BattleHero {
  return {
    name: 'Prueba',
    retreat: { blocked: 'en la prueba no se huye' },
    ataque: 0,
    defensa: 0,
    spellPower: 3,
    knowledge: 5,
    mana: 50,
    castThisRound: false,
    spells: ['bless', 'curse'],
    ...over,
  };
}

/**
 * Un bando: su tropa y, si se pide, su héroe —con el cuerpo de un héroe recién
 * hecho y su ataque y defensa—, su moral y su suerte.
 */
export function bando(
  army: readonly Stack[],
  o: { readonly heroe?: BattleHero; readonly moral?: number; readonly suerte?: number } = {},
): BattleSide {
  const h = o.heroe;
  return {
    army,
    hero:
      h === undefined
        ? null
        : {
            mando: h,
            cuerpo: heroUnit({
              name: h.name,
              attack: h.ataque,
              defense: h.defensa,
              experience: EXPERIENCIA_INICIAL_DE_HEROE,
              equipo: EQUIPO_BASE,
            }),
          },
    moraleBonus: o.moral ?? 0,
    luckBonus: o.suerte ?? 0,
  };
}

/**
 * Un bando de unidades con cifras propias, como las de la arena: cada una entra
 * como un personaje de uno (`BattleSide.members`) con su `unit` tal cual, sin
 * pasar por el catálogo.
 */
export function bandoDe(
  unidades: readonly { readonly id: string; readonly unit: UnitInfo }[],
): BattleSide {
  const members = new Map<string, BattleMember>(
    unidades.map((u) => [u.id, { profile: { unit: u.unit, morale: 0, luck: 0 }, hp: u.unit.hp }]),
  );
  return {
    army: unidades.map((u) => ({ creature: u.id, member: u.id, count: 1 })),
    hero: null,
    members,
  };
}
