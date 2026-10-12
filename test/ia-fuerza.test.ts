/**
 * La fuerza que estima la IA (`fuerzaDe`) contra la que se ve peleando (#182).
 *
 * #182 sospechaba que el cuerpo de un héroe muy subido valía más de lo que
 * decía `fuerzaDe`. La medida entera es `tools/qa/calibrar-fuerza.ts`, sobre
 * fotos de partidas reales; aquí van dos guardias baratos que la clavan:
 *
 *  - el caso: un héroe de nivel 20 sin tropa contra uno de nivel 12 con seis
 *    vampiros. `fuerzaDe` da por más fuerte al solo, y lo es;
 *  - la calibración: con ejércitos montados a semilla fija, la log-pérdida de
 *    `PESO_DEL_CUERPO` no se aleja de la mejor de la rejilla, y quien saca el
 *    margen de `ventajaClara` gana casi siempre.
 *
 * Toda batalla con `createRng`: con la misma semilla, la misma cifra.
 */
import { describe, expect, it } from 'vitest';
import {
  armyPower,
  fuerzaDe,
  MARGEN_CONTRA_NEUTRALES,
  PESO_DEL_CUERPO,
  unitPower,
} from '../src/core/ai/fuerza.js';
import { autoResolve } from '../src/core/ai/tactics.js';
import { type BattleSide, createBattle } from '../src/core/battle/battle.js';
import { factionLineup } from '../src/core/data.js';
import { RANGO_MAXIMO_DE_TROPA, umbral } from '../src/core/hero/experiencia.js';
import { type Hero, heroeRecienHecho, heroUnit } from '../src/core/hero/hero.js';
import { troopsAsStacks } from '../src/core/hero/troop.js';
import { createRng, type Rng } from '../src/core/rng.js';
import type { FactionId, Troop } from '../src/core/types.js';

const TIPO: Record<FactionId, string> = { knight: 'caballero', necromancer: 'nigromante' };

function heroe(faction: FactionId, nivel: number, army: Troop[]): Hero {
  const h = heroeRecienHecho({
    id: `heroe-${faction}`,
    owner: faction === 'knight' ? 0 : 1,
    name: faction,
    faction,
    at: { x: 0, y: 0 },
    experience: umbral(nivel),
    tipo: TIPO[faction],
  });
  h.army = army;
  return h;
}

/** El bando como lo monta el mapa, con la rendición abierta: perder rindiéndose también es perder. */
function bando(h: Hero): BattleSide {
  return {
    army: troopsAsStacks(h.army),
    hero: {
      cuerpo: heroUnit(h),
      mando: {
        name: h.name,
        retreat: { purse: Number.MAX_SAFE_INTEGER },
        ataque: h.attack,
        defensa: h.defense,
        spellPower: h.spellPower,
        knowledge: h.knowledge,
        mana: h.mana,
        castThisRound: false,
        spells: h.spells,
      },
    },
  };
}

/** Lo que gana `a` contra `b` en `2 × veces` batallas, atacando la mitad de ellas. */
function ganaA(a: Hero, b: Hero, veces: number, rng: Rng): number {
  let gana = 0;
  for (let i = 0; i < veces; i++) {
    for (const aAtaca of [true, false]) {
      const [x, y] = aAtaca ? [a, b] : [b, a];
      const { winner } = autoResolve(createBattle(bando(x), bando(y), rng), rng);
      if ((winner === 'attacker') === aAtaca) gana++;
    }
  }
  return gana / (2 * veces);
}

describe('la fuerza estimada sigue a la que se ve peleando (#182)', () => {
  it('un héroe de nivel 20 sin tropa contra uno de nivel 12 con seis vampiros: se le da por más fuerte, y gana', () => {
    const solo = heroe('knight', 20, []);
    const vampiros = Array.from({ length: 6 }, () => ({ creature: 'vampire' }));
    const conTropa = heroe('necromancer', 12, vampiros);
    // Sin margen, que es la regla con la que un héroe persigue a otro.
    expect(fuerzaDe(solo, undefined)).toBeGreaterThan(fuerzaDe(conTropa, undefined));
    expect(ganaA(solo, conTropa, 25, createRng(182))).toBeGreaterThan(0.75);
  });

  it('la calibración: el peso del cuerpo está cerca del mejor y el margen se cumple', () => {
    const rng = createRng(2026);
    /** Un ejército de 0 a 6 individuos del catálogo, cada uno con su veteranía. */
    const ejercito = (faction: FactionId): Troop[] => {
      const lineup = factionLineup(faction);
      return Array.from({ length: rng.int(0, 6) }, (_, i) => {
        const c = lineup[rng.int(0, lineup.length - 1)];
        if (c === undefined) throw new Error(`${faction} no tiene criaturas`);
        const nivel = rng.int(1, RANGO_MAXIMO_DE_TROPA);
        if (nivel === 1) return { creature: c.id };
        const veterania = { id: `v-${faction}-${i}`, experiencia: umbral(nivel) };
        return { creature: c.id, veterania: { ...veterania, batallas: 1, bajas: 0, heroes: [] } };
      });
    };
    const filas: { a: Hero; b: Hero; gana: number }[] = [];
    for (let i = 0; i < 200; i++) {
      const a = heroe('knight', rng.int(5, 18), ejercito('knight'));
      const b = heroe('necromancer', rng.int(5, 18), ejercito('necromancer'));
      filas.push({ a, b, gana: ganaA(a, b, 1, rng) });
    }

    // La log-pérdida de una logística sin sesgo y con la pendiente de la
    // medida grande (~4): basta para comparar pesos entre sí.
    const perdida = (peso: number): number => {
      const f = (h: Hero) => armyPower(h.army, undefined) + peso * unitPower(heroUnit(h));
      let ll = 0;
      for (const { a, b, gana } of filas) {
        const p = Math.min(1 - 1e-9, Math.max(1e-9, 1 / (1 + (f(b) / f(a)) ** 4)));
        ll -= gana * Math.log(p) + (1 - gana) * Math.log(1 - p);
      }
      return ll / filas.length;
    };
    const rejilla = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];
    const mejor = Math.min(...rejilla.map(perdida));
    expect(perdida(PESO_DEL_CUERPO) - mejor).toBeLessThan(0.015);

    let conMargen = 0;
    let ganaElFuerte = 0;
    for (const { a, b, gana } of filas) {
      const [fa, fb] = [fuerzaDe(a, undefined), fuerzaDe(b, undefined)];
      if (fa > fb * MARGEN_CONTRA_NEUTRALES) {
        conMargen++;
        ganaElFuerte += gana;
      } else if (fb > fa * MARGEN_CONTRA_NEUTRALES) {
        conMargen++;
        ganaElFuerte += 1 - gana;
      }
    }
    expect(conMargen).toBeGreaterThan(50);
    expect(ganaElFuerte / conMargen).toBeGreaterThan(0.85);
  });
});
