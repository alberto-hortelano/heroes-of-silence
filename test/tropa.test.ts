/**
 * La tropa de individuos y el liderazgo (fase 1a de NuevaJugabilidad).
 *
 * Los tests salen de los criterios del plan, no del código: reclutar N añade N
 * individuos; pasarse del liderazgo lanza con la frase y SIN cobrar; un héroe
 * que entra en casa se lleva lo que le quepa; el tope crece con el nivel; y los
 * datos garantizan que un ejército dentro del liderazgo cabe en el tablero.
 */

import { describe, expect, it } from 'vitest';
import { playAiGame } from '../src/core/ai/turn.js';
import { allHexes, BOARD_HEIGHT, bandoDeSalida } from '../src/core/battle/board.js';
import { createBattle } from '../src/core/battle/montaje.js';
import { COMBATE_COMPLETO, cupoDelHeroe } from '../src/core/combate.js';
import { LIDERAZGO } from '../src/core/hero/liderazgo.js';
import { RANGO_INICIAL_DE_HEROE, umbral } from '../src/core/hero/rango.js';
import {
  armyLeadership,
  GARRISON_LEADERSHIP,
  heroLeadership,
  troopBlocker,
  troopSummary,
} from '../src/core/hero/troop.js';
import { createRng } from '../src/core/rng.js';
import {
  baseOf,
  destinoDeRecluta,
  heroesOf,
  recruitCapacity,
  townsOf,
} from '../src/core/state/consultas.js';
import { applyAdventureAction } from '../src/core/state/game.js';
import { newGame, startingArmy } from '../src/core/state/setup.js';
import { guarnicionDeLaCiudad } from '../src/core/state/sitios.js';
import { dwellings } from '../src/core/town/town.js';
import { FACTION_IDS } from '../src/core/types.js';
import { unidadDelJuego, unidadesDelJuego } from '../src/core/unidad/catalogo.js';
import { ctx, JINETE, TROPA_BARATA } from './comun.js';
import {
  copiaDePartida,
  ejercito,
  fueraDeSuBase,
  sinGuarnicionDeSalida,
} from './partida-de-prueba.js';

/** Los cupos con el tope de siempre (7): un héroe lleva 6 y una guarnición 7. */
const CUPO_HEROE = cupoDelHeroe(COMBATE_COMPLETO.tope);
const CUPO_GUARNICION = COMBATE_COMPLETO.tope;

/**
 * La semilla de las pruebas de reclutar: la base del jugador 0 es de los orkos,
 * cuyo pueblo —la morada que la base trae hecha— cría lo más barato del
 * catálogo (`TROPA_BARATA`, 1 de liderazgo). Con él las cuentas del liderazgo y
 * del cupo se dejan ver por separado.
 */
const SEMILLA = 21;
const RECLUTA = TROPA_BARATA;
const NOMBRE_DEL_RECLUTA = unidadDelJuego(RECLUTA).name;

/** La partida de la semilla con el héroe del jugador 0 dentro de su castillo. */
function heroeEnCasa(seed: number) {
  const state = newGame({ seed });
  const hero = heroesOf(state, 0)[0]!;
  const town = townsOf(state, 0)[0]!;
  hero.at = { ...town.at };
  return { state, hero, town };
}

describe('el ejército es una lista de individuos', () => {
  it('la semilla de las pruebas cría el recluta en el pueblo de su base', () => {
    const { town } = heroeEnCasa(SEMILLA);
    expect(dwellings(town).map((d) => d.creature)).toContain(RECLUTA);
  });

  it('reclutar 3 añade 3 individuos, sin `count`', () => {
    const { state, hero, town } = heroeEnCasa(SEMILLA);
    hero.army = [];
    applyAdventureAction(
      state,
      { type: 'recruit', town: town.id, creature: RECLUTA, count: 3 },
      ctx(SEMILLA),
      0,
    );
    expect(hero.army).toEqual([
      { creature: RECLUTA },
      { creature: RECLUTA },
      { creature: RECLUTA },
    ]);
  });

  it('dos reclutas de la misma criatura no se funden: son más individuos', () => {
    const { state, hero, town } = heroeEnCasa(SEMILLA);
    hero.army = [];
    for (const count of [2, 3]) {
      applyAdventureAction(
        state,
        { type: 'recruit', town: town.id, creature: RECLUTA, count },
        ctx(SEMILLA),
        0,
      );
    }
    expect(hero.army).toHaveLength(5);
  });

  it('`troopSummary` agrupa por criatura en orden de aparición', () => {
    const army = ejercito(
      { creature: 'elfo-arquero', count: 2 },
      { creature: 'goblin-lancero', count: 3 },
      { creature: 'elfo-arquero', count: 1 },
    );
    const grupos = troopSummary(army);
    expect(grupos.map((g) => [g.creature, g.count])).toEqual([
      ['elfo-arquero', 3],
      ['goblin-lancero', 3],
    ]);
  });
});

describe('liderazgo', () => {
  it('el tope del héroe crece con el nivel y se para en el máximo', () => {
    const { base, porRango, max } = LIDERAZGO.heroe;
    // La escala es una sola: un héroe recién hecho está en el 5, y es ahí
    // donde tiene la base.
    expect(heroLeadership({ experience: umbral(5) })).toBe(base);
    expect(heroLeadership({ experience: umbral(6) })).toBe(base + porRango);
    expect(heroLeadership({ experience: umbral(40) })).toBe(max);
  });

  it('la frase de un solo individuo dice «pide», y sin sitio no promete ninguno', () => {
    const jinete = unidadDelJuego(JINETE);
    const lleno = ejercito({ creature: JINETE, count: 2 });
    const ocupa = 2 * jinete.leadership;
    expect(troopBlocker(lleno, ocupa, 6, JINETE, 1)).toBe(
      `no cabe: el ejército ocupa ${ocupa} de ${ocupa} de liderazgo y 1 × ${jinete.name} pide ${jinete.leadership}`,
    );
    expect(troopBlocker(lleno, ocupa + jinete.leadership, 6, JINETE, 1)).toBeNull();
  });

  it('el séptimo individuo no cabe aunque sobre liderazgo, y se dice', () => {
    // La regla del usuario (fase 1b): un héroe lleva como mucho seis más él.
    // Seis de lo más barato ocupan 6 de 20: sobra liderazgo y aun así no cabe otro.
    const { state, hero, town } = heroeEnCasa(SEMILLA);
    hero.army = ejercito({ creature: RECLUTA, count: 6 });
    expect(armyLeadership(hero.army)).toBeLessThan(heroLeadership(hero));
    town.available[RECLUTA] = 50;
    const oro = state.players[0]!.oro;
    expect(() =>
      applyAdventureAction(
        state,
        { type: 'recruit', town: town.id, creature: RECLUTA, count: 1 },
        ctx(SEMILLA),
        0,
      ),
    ).toThrow('no se puede reclutar: no cabe: el ejército ya lleva 6 de 6 individuos');
    expect(state.players[0]!.oro).toBe(oro);
    expect(hero.army).toHaveLength(CUPO_HEROE);

    // Y con hueco para menos de los que se piden, dice cuántos caben.
    expect(troopBlocker(ejercito({ creature: RECLUTA, count: 4 }), 20, 6, RECLUTA, 3)).toBe(
      `no cabe: el ejército lleva 4 de 6 individuos y 3 × ${NOMBRE_DEL_RECLUTA} son 3 más; caben 2`,
    );
  });

  it('el ejército de salida cabe en el liderazgo de un héroe recién hecho, en las cinco facciones', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const faction of FACTION_IDS) {
        const army = startingArmy(faction, createRng(seed));
        expect(armyLeadership(army), `${faction}, semilla ${seed}`).toBeLessThanOrEqual(
          heroLeadership({ experience: umbral(RANGO_INICIAL_DE_HEROE) }),
        );
        expect(army.length).toBeGreaterThan(0);
        // Y en el cupo: el héroe ocupa el séptimo puesto de su bando.
        expect(army.length, `semilla ${seed}`).toBeLessThanOrEqual(CUPO_HEROE);
      }
    }
  });
});

describe('los datos garantizan que lo que cabe en un bando cabe en el tablero', () => {
  // Es el test que hace que el despliegue no tenga que comprobar nada: desde la
  // regla de 7 por bando (fase 1b) el tope no lo pone el tablero sino
  // `maxPorBando`, y `despliegue` coloca sin mirar. Lo que lo hace seguro son
  // estas dos cuentas sobre los datos: un bando lleno de criaturas grandes —dos
  // hexes cada una— no pasa de los 27 de su lado (tres columnas de nueve), y
  // como cada grande ocupa una fila, no hay más grandes que filas.
  it('un bando lleno de grandes cabe en sus 27 hexes, y no hay más grandes que filas', () => {
    // Las casillas de salida de cada lado, contadas en el tablero (filas de 12
    // y 11: las tres del borde de cada fila, 27 por lado).
    for (const lado of ['attacker', 'defender'] as const) {
      const salida = allHexes().filter((h) => bandoDeSalida(h) === lado).length;
      expect(salida).toBe(3 * BOARD_HEIGHT);
      expect(2 * LIDERAZGO.maxPorBando).toBeLessThanOrEqual(salida);
    }
    expect(LIDERAZGO.maxPorBando).toBeLessThanOrEqual(BOARD_HEIGHT);
    expect(Number.isInteger(LIDERAZGO.maxPorBando)).toBe(true);
    // Y con cada tope que se puede elegir, un héroe deja sitio para algo de
    // tropa: si no, el cupo sería 0. El mayor es el de siempre y el techo.
    for (const tope of LIDERAZGO.topesPorBando) expect(cupoDelHeroe(tope)).toBeGreaterThan(0);
    expect(LIDERAZGO.topesPorBando.at(-1)).toBe(LIDERAZGO.maxPorBando);
    expect(CUPO_GUARNICION).toBe(LIDERAZGO.maxPorBando);
  });

  it('el liderazgo de cada criatura es un entero positivo', () => {
    // `troopRoom` divide por él: un 0 daría un hueco infinito.
    for (const c of unidadesDelJuego()) {
      expect(c.leadership, c.id).toBeGreaterThan(0);
      expect(Number.isInteger(c.leadership), c.id).toBe(true);
    }
  });
});

describe('la IA de reglas juega dentro del liderazgo', () => {
  it('ninguna partida entera deja a un héroe ni a una guarnición por encima de su tope', async () => {
    // Reclutar por encima LANZA, así que una IA que se pasara reventaría la
    // partida: que estas terminen ya dice que `planRecruits` respeta el tope.
    // Lo de abajo cubre lo que no pasa por `recruit`: llevarse la guarnición.
    for (let seed = 1; seed <= 6; seed++) {
      const state = newGame({ seed, maxDays: 60 });
      await playAiGame(state, ctx(seed));
      expect(state.finished, `semilla ${seed}`).not.toBeNull();
      for (const h of state.heroes) {
        expect(armyLeadership(h.army)).toBeLessThanOrEqual(heroLeadership(h));
        expect(h.army.length).toBeLessThanOrEqual(CUPO_HEROE);
      }
      for (const t of state.towns) {
        expect(armyLeadership(guarnicionDeLaCiudad(state, t))).toBeLessThanOrEqual(
          GARRISON_LEADERSHIP,
        );
        expect(guarnicionDeLaCiudad(state, t).length).toBeLessThanOrEqual(CUPO_GUARNICION);
      }
    }
  });
});

describe('licenciar: cambiar tropa barata por otra mejor', () => {
  it('en su castillo licencia los ÚLTIMOS de esa criatura, conserva el orden del resto y lo cuenta', () => {
    const { state, hero } = heroeEnCasa(SEMILLA);
    hero.army = [
      { creature: RECLUTA },
      { creature: 'elfo-arquero' },
      { creature: RECLUTA },
      { creature: 'elfo-arquero' },
      { creature: RECLUTA },
    ];
    applyAdventureAction(
      state,
      { type: 'dismiss', hero: hero.id, creature: RECLUTA, count: 2 },
      ctx(SEMILLA),
      0,
    );
    expect(hero.army.map((t) => t.creature)).toEqual([RECLUTA, 'elfo-arquero', 'elfo-arquero']);
    expect(state.log.at(-1)).toMatchObject({
      kind: 'dismissed',
      hero: hero.id,
      creature: RECLUTA,
      count: 2,
      actor: 0,
      at: hero.at,
    });
  });

  it('fuera de un castillo suyo, de más o de cero: lanza con la frase y no toca nada', () => {
    const { state, hero } = heroeEnCasa(SEMILLA);
    hero.army = [{ creature: RECLUTA }, { creature: RECLUTA }];
    const antes = JSON.stringify(hero.army);
    const licenciar = (creature: string, count: number) =>
      applyAdventureAction(
        state,
        { type: 'dismiss', hero: hero.id, creature, count },
        ctx(SEMILLA),
        0,
      );
    expect(() => licenciar(RECLUTA, 3)).toThrow(
      `lleva 2 × ${NOMBRE_DEL_RECLUTA} y no puede licenciar 3`,
    );
    expect(() => licenciar(RECLUTA, 0)).toThrow(/de 1 en adelante, no 0/);
    // Con el NOMBRE de la unidad y no su id (H4): «"archer"» era una palabra
    // en inglés en la barra del castillo. Y un id que no existe se dice así.
    const arquero = unidadDelJuego('elfo-arquero');
    expect(arquero.name).not.toBe(arquero.id);
    expect(() => licenciar(arquero.id, 1)).toThrow(
      new RegExp(`no lleva individuos de tipo ${arquero.name}$`),
    );
    expect(() => licenciar(arquero.id, 1)).not.toThrow(arquero.id);
    expect(() => licenciar('dragon', 1)).toThrow(/no existe ninguna unidad "dragon"/);
    // Fuera del castillo: un paso al lado y ya no se puede.
    const base = baseOf(state, 0)!;
    hero.at = { x: base.at.x + 1, y: base.at.y };
    expect(() => licenciar(RECLUTA, 1)).toThrow(/no está en un castillo suyo/);
    expect(JSON.stringify(hero.army)).toBe(antes);
    expect(state.log.some((e) => e.kind === 'dismissed')).toBe(false);
  });
});

describe('`recruitCapacity`: lo máximo que el núcleo acepta, ni uno más ni uno menos', () => {
  /**
   * La propiedad que da sentido al botón «todo»: reclutar `maximo` entra, y
   * reclutar uno más lanza. No se compara contra la IA —desde este cambio la IA
   * LLAMA a esta función, así que la comparación sería un espejo—, sino contra
   * la regla que aplica `recruit`.
   */
  it('en 40 semillas, recluta `maximo` sin lanzar y `maximo + 1` lanza', () => {
    let topadoPorLiderazgo = 0;
    let topadoPorOro = 0;
    for (let seed = 1; seed <= 40; seed++) {
      // Con la base llena de salida el máximo sería 0 en las 40 y el test no
      // probaría el `while`: se mide sobre una guarnición con sitio.
      const state = sinGuarnicionDeSalida(newGame({ seed }));
      // El héroe nace dentro (19-10-2026) y recluta en su tropa: se mide la guarnición.
      fueraDeSuBase(state, 0);
      const town = townsOf(state, 0)[0]!;
      // Variedad: unas semillas con mucha oferta, otras con poco oro, para que
      // el tope lo pongan las tres cosas en semillas distintas.
      // Lo primero que cría su pueblo: la facción la sortea la semilla.
      const recluta = dwellings(town)[0]!.creature;
      town.available[recluta] = 5 + (seed % 9) * 3;
      const oro = seed % 3 === 0 ? 20 * (seed % 7) : 50_000;
      state.players[0]!.oro = oro;

      const plan = recruitCapacity(
        town,
        recluta,
        destinoDeRecluta(state, town),
        state.players[0]!.oro,
      );
      expect(plan.maximo).toBeLessThanOrEqual(Math.min(plan.disponibles, plan.caben));
      if (plan.maximo < plan.disponibles && plan.maximo === plan.caben) topadoPorLiderazgo++;
      if (plan.maximo < Math.min(plan.disponibles, plan.caben)) topadoPorOro++;

      const copia = copiaDePartida(state);
      const mas = plan.maximo + 1;
      expect(() =>
        applyAdventureAction(
          copia,
          { type: 'recruit', town: town.id, creature: recluta, count: mas },
          ctx(seed),
          0,
        ),
      ).toThrow(/no se puede reclutar/);

      if (plan.maximo > 0) {
        applyAdventureAction(
          state,
          { type: 'recruit', town: town.id, creature: recluta, count: plan.maximo },
          ctx(seed),
          0,
        );
        expect(armyLeadership(guarnicionDeLaCiudad(state, town))).toBe(
          plan.ocupado + plan.maximo * plan.ocupaUno,
        );
      }
    }
    // Que las dos ramas se ejerzan de verdad: si no, el test no prueba el `while`.
    expect(topadoPorLiderazgo).toBeGreaterThan(0);
    expect(topadoPorOro).toBeGreaterThan(0);
  });
});

describe('el tope de tropa de la partida (complejidad del combate, 22-10-2026)', () => {
  const TRES = { tope: 3, rueda: 7 } as const;

  it('con tope 3, un héroe lleva 2: reclutar el tercero falla diciendo «ya lleva 2 de 2»', () => {
    const state = newGame({ seed: SEMILLA, combate: TRES });
    expect(state.combate).toEqual(TRES);
    const hero = heroesOf(state, 0)[0]!;
    const town = townsOf(state, 0)[0]!;
    hero.at = { ...town.at };
    hero.army = ejercito({ creature: RECLUTA, count: 2 });
    town.available[RECLUTA] = 50;
    expect(() =>
      applyAdventureAction(
        state,
        { type: 'recruit', town: town.id, creature: RECLUTA, count: 1 },
        ctx(SEMILLA),
        0,
      ),
    ).toThrow('no se puede reclutar: no cabe: el ejército ya lleva 2 de 2 individuos');
  });

  it('el ejército de salida cabe en cada tope, con la misma tirada', () => {
    for (const f of FACTION_IDS) {
      for (const tope of LIDERAZGO.topesPorBando) {
        const rng = createRng(11);
        const army = startingArmy(f, rng, tope);
        expect(army.length, `${f} con tope ${tope}`).toBeLessThanOrEqual(cupoDelHeroe(tope));
        expect(army.length, `${f} con tope ${tope}`).toBeGreaterThan(0);
        // La misma tirada con cualquier tope: el azar de después no se mueve.
        expect(rng.int(0, 1_000_000)).toBe(
          (() => {
            const otro = createRng(11);
            startingArmy(f, otro);
            return otro.int(0, 1_000_000);
          })(),
        );
      }
    }
  });

  it('lo neutral nace en el tope de la partida, y el mapa es el mismo que con 7', () => {
    for (const seed of [1, 2]) {
      const siete = newGame({ seed });
      const tres = newGame({ seed, combate: TRES });
      // El mapa no depende del tope: misma semilla, mismo mapa (los monstruos, con su cuenta aparte).
      const sinCuentas = (s: typeof siete) =>
        JSON.stringify({
          ...s.map,
          objects: s.map.objects.map((o) => (o.kind === 'monster' ? { ...o, count: 0 } : o)),
        });
      expect(sinCuentas(tres)).toBe(sinCuentas(siete));
      for (const t of tres.towns)
        expect(guarnicionDeLaCiudad(tres, t).length, t.name).toBeLessThanOrEqual(3);
      for (const o of tres.map.objects) {
        if (o.kind === 'monster') expect(o.count, o.id).toBeLessThanOrEqual(3);
      }
      for (const r of tres.raiders) {
        expect(
          r.troops.reduce((n, g) => n + g.count, 0),
          r.id,
        ).toBeLessThanOrEqual(3);
      }
      // Con 7, lo de siempre: alguno lleva más de 3.
      expect(
        siete.towns.some((t) => guarnicionDeLaCiudad(siete, t).length > 3) ||
          siete.map.objects.some((o) => o.kind === 'monster' && o.count > 3),
      ).toBe(true);
    }
  });

  it('una batalla con el tope de 3 no monta un bando de 4, y uno que no se puede elegir tampoco', () => {
    const cuatro = {
      army: [
        { creature: RECLUTA, count: 1 },
        { creature: RECLUTA, count: 1 },
        { creature: RECLUTA, count: 1 },
        { creature: RECLUTA, count: 1 },
      ],
      hero: null,
    };
    const uno = { army: [{ creature: RECLUTA, count: 1 }], hero: null };
    expect(() => createBattle(cuatro, uno, createRng(1), TRES)).toThrow(
      'no caben: el atacante trae 4 y un bando lleva como mucho 3',
    );
    expect(() => createBattle(uno, uno, createRng(1), { tope: 4, rueda: 7 })).toThrow(
      'no se puede montar la batalla: «4» no es un tope de tropa: valen 3, 5 o 7',
    );
    expect(createBattle(uno, uno, createRng(1), TRES).rueda).toBe(7);
  });
});
