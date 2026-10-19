/**
 * La tropa de individuos y el liderazgo (fase 1a de NuevaJugabilidad).
 *
 * Los tests salen de los criterios del plan, no del código: reclutar N añade N
 * individuos; pasarse del liderazgo lanza con la frase y SIN cobrar; un héroe
 * que entra en casa se lleva lo que le quepa; el tope crece con el nivel; los
 * datos garantizan que un ejército dentro del liderazgo cabe en el tablero; y
 * un héroe que lleva un personaje pasa de día, que era la issue que la fase 2
 * dejó abierta.
 */

import { describe, expect, it } from 'vitest';
import { armyPower, fuerzaDe, unitPower } from '../src/core/ai/fuerza.js';
import { planRecruits } from '../src/core/ai/strategy.js';
import { playAiGame } from '../src/core/ai/turn.js';
import { allHexes, BOARD_HEIGHT, bandoDeSalida } from '../src/core/battle/board.js';
import { unidadDelJuego, unidadesDelJuego } from '../src/core/catalogo.js';
import { serializeAdventureTurn } from '../src/core/contract/serialize.js';
import { LIDERAZGO } from '../src/core/data.js';
import { marchaALaEscala } from '../src/core/escala.js';
import { RANGO_INICIAL_DE_HEROE, umbral } from '../src/core/hero/experiencia.js';
import { maxMovePoints, slowestSpeed } from '../src/core/hero/hero.js';
import {
  armyLeadership,
  CUPO_GUARNICION,
  CUPO_HEROE,
  GARRISON_LEADERSHIP,
  heroLeadership,
  troopBlocker,
  troopSummary,
} from '../src/core/hero/troop.js';
import { pointKey } from '../src/core/map/map.js';
import { createRng } from '../src/core/rng.js';
import { CHARACTER_BODY, createCharacter, defaultBuild } from '../src/core/rpg/character.js';
import { combatProfile } from '../src/core/rpg/stats.js';
import {
  applyAdventureAction,
  baseOf,
  destinoDeRecluta,
  type GameContext,
  type GameState,
  heroesOf,
  recruitCapacity,
  townsOf,
} from '../src/core/state/game.js';
import { newGame, startingArmy } from '../src/core/state/setup.js';
import { dwellings } from '../src/core/town/town.js';
import { FACTION_IDS, SPEED_TO_MOVE_POINTS } from '../src/core/types.js';
import {
  copiaDePartida,
  ejercito,
  hastaSuSiguienteTurno,
  JINETE,
  PESADA,
  sinGuarnicionDeSalida,
  TROPA,
  TROPA_BARATA,
} from './helpers.js';

const ctx = (seed: number): GameContext => ({ rng: createRng(seed) });

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

  it('`troopSummary` agrupa por criatura en orden de aparición, y cada personaje va solo', () => {
    const aren = createCharacter('aren', defaultBuild);
    const army = [
      ...ejercito({ creature: 'elfo-arquero', count: 2 }),
      { creature: CHARACTER_BODY, member: 'aren' },
      ...ejercito({ creature: 'goblin-lancero', count: 3 }, { creature: 'elfo-arquero', count: 1 }),
    ];
    const grupos = troopSummary(army, { aren });
    expect(grupos.map((g) => [g.creature, g.member, g.count])).toEqual([
      ['elfo-arquero', undefined, 3],
      [CHARACTER_BODY, 'aren', 1],
      ['goblin-lancero', undefined, 3],
    ]);
    // Las cifras del personaje son las de su perfil, no las de ningún catálogo.
    expect(grupos[1]!.unit).toEqual(combatProfile(aren).unit);
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

  it('reclutar por encima del liderazgo lanza con la frase, y no cobra nada', () => {
    const { state, hero, town } = heroeEnCasa(SEMILLA);
    // Dos jinetes y un templario, 19 de 20 con 3 de los 6 individuos: lo que
    // muerde aquí es el liderazgo.
    hero.army = ejercito({ creature: JINETE, count: 2 }, { creature: TROPA, count: 1 });
    const tope = heroLeadership(hero);
    const ocupa = armyLeadership(hero.army);
    const uno = unidadDelJuego(RECLUTA).leadership;
    expect(Math.floor((tope - ocupa) / uno)).toBe(1);
    const oro = state.players[0]!.resources.gold;
    const disponibles = town.available[RECLUTA];

    expect(() =>
      applyAdventureAction(
        state,
        { type: 'recruit', town: town.id, creature: RECLUTA, count: 2 },
        ctx(SEMILLA),
        0,
      ),
    ).toThrow(
      `no se puede reclutar: no cabe: el ejército ocupa ${ocupa} de ${tope} de liderazgo y 2 × ${NOMBRE_DEL_RECLUTA} piden ${2 * uno}; caben 1`,
    );
    // Rechazado ANTES de pagar: ni el oro ni las criaturas del pueblo se mueven.
    expect(state.players[0]!.resources.gold).toBe(oro);
    expect(town.available[RECLUTA]).toBe(disponibles);
    expect(hero.army).toHaveLength(3);

    // Y el que sí cabe, entra.
    applyAdventureAction(
      state,
      { type: 'recruit', town: town.id, creature: RECLUTA, count: 1 },
      ctx(SEMILLA),
      0,
    );
    expect(armyLeadership(hero.army)).toBe(ocupa + uno);
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
    const oro = state.players[0]!.resources.gold;
    expect(() =>
      applyAdventureAction(
        state,
        { type: 'recruit', town: town.id, creature: RECLUTA, count: 1 },
        ctx(SEMILLA),
        0,
      ),
    ).toThrow('no se puede reclutar: no cabe: el ejército ya lleva 6 de 6 individuos');
    expect(state.players[0]!.resources.gold).toBe(oro);
    expect(hero.army).toHaveLength(CUPO_HEROE);

    // Y con hueco para menos de los que se piden, dice cuántos caben.
    expect(troopBlocker(ejercito({ creature: RECLUTA, count: 4 }), 20, 6, RECLUTA, 3)).toBe(
      `no cabe: el ejército lleva 4 de 6 individuos y 3 × ${NOMBRE_DEL_RECLUTA} son 3 más; caben 2`,
    );
  });

  it('sin héroe en el pueblo se recluta a la guarnición, con su propio tope', () => {
    const { state, hero, town } = heroeEnCasa(SEMILLA);
    // Se mide reclutar a una guarnición con sitio; la de salida la llena.
    sinGuarnicionDeSalida(state);
    hero.at = { x: hero.at.x + 1, y: hero.at.y };
    town.available[RECLUTA] = 50;
    state.players[0]!.resources = { ...state.players[0]!.resources, gold: 10_000 };
    // Con lo más barato muerde el cupo: la guarnición lleva siete, no seis,
    // porque no tiene héroe que ocupe el séptimo puesto. 7 × 1 = 7 de sus 20.
    applyAdventureAction(
      state,
      { type: 'recruit', town: town.id, creature: RECLUTA, count: CUPO_GUARNICION },
      ctx(SEMILLA),
      0,
    );
    expect(town.garrison).toHaveLength(7);
    expect(armyLeadership(town.garrison)).toBeLessThan(GARRISON_LEADERSHIP);
    expect(() =>
      applyAdventureAction(
        state,
        { type: 'recruit', town: town.id, creature: RECLUTA, count: 1 },
        ctx(SEMILLA),
        0,
      ),
    ).toThrow('no cabe: la guarnición ya lleva 7 de 7 individuos');

    // Y con criaturas caras, su propio tope de liderazgo: dos jinetes y uno más
    // pasan de él.
    const tope = GARRISON_LEADERSHIP;
    const jinete = unidadDelJuego(JINETE);
    town.garrison = ejercito({ creature: JINETE, count: 2 });
    const ocupa = armyLeadership(town.garrison);
    expect(ocupa + jinete.leadership).toBeGreaterThan(tope);
    expect(troopBlocker(town.garrison, tope, CUPO_GUARNICION, JINETE, 1, 'la guarnición')).toBe(
      `no cabe: la guarnición ocupa ${ocupa} de ${tope} de liderazgo y 1 × ${jinete.name} pide ${jinete.leadership}`,
    );
  });

  it('un héroe que entra en casa se lleva lo que le cabe, en orden, y el resto se queda', () => {
    const state = newGame({ seed: 13 });
    const hero = heroesOf(state, 0)[0]!;
    const town = townsOf(state, 0)[0]!;
    // 3 de 20 de liderazgo y 3 de 6 individuos.
    hero.army = ejercito({ creature: TROPA_BARATA, count: 3 });
    expect(heroLeadership(hero)).toBe(20);
    // El jinete (8, y llega a 11) y la pesada (4, 15) caben; el segundo jinete
    // (8) ya no —quedan 5—, y se salta sin cerrar el paso a los de detrás: entra
    // uno de lo más barato (1, y llega a 16)… y el segundo, que cabría en el
    // liderazgo, se queda porque el ejército ya lleva sus seis. Los dos límites,
    // en la misma entrada.
    town.garrison = ejercito(
      { creature: JINETE, count: 1 },
      { creature: PESADA, count: 1 },
      { creature: JINETE, count: 1 },
      { creature: TROPA_BARATA, count: 2 },
    );
    hero.at = { x: town.at.x, y: town.at.y + 1 };
    hero.movePoints = 5000;

    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: town.at }, ctx(13), 0);

    expect(pointKey(hero.at)).toBe(pointKey(town.at));
    expect(hero.army).toHaveLength(CUPO_HEROE);
    expect(armyLeadership(hero.army)).toBe(
      4 * unidadDelJuego(TROPA_BARATA).leadership +
        unidadDelJuego(JINETE).leadership +
        unidadDelJuego(PESADA).leadership,
    );
    expect(hero.army.slice(3)).toEqual([
      { creature: JINETE },
      { creature: PESADA },
      { creature: TROPA_BARATA },
    ]);
    expect(town.garrison).toEqual([{ creature: JINETE }, { creature: TROPA_BARATA }]);
    expect(state.log.some((e) => e.kind === 'garrison_taken')).toBe(true);
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
    // Y un héroe deja sitio para algo de tropa: si no, el cupo sería 0.
    expect(CUPO_HEROE).toBe(LIDERAZGO.maxPorBando - 1);
    expect(CUPO_HEROE).toBeGreaterThan(0);
    expect(CUPO_GUARNICION).toBe(LIDERAZGO.maxPorBando);
  });

  it('el liderazgo de cada criatura es un entero positivo', () => {
    // `troopRoom` divide por él: un 0 daría un hueco infinito.
    for (const c of unidadesDelJuego()) {
      expect(c.leadership, c.id).toBeGreaterThan(0);
      expect(Number.isInteger(c.leadership), c.id).toBe(true);
    }
    expect(LIDERAZGO.personaje).toBeGreaterThan(0);
  });

  it('la guarnición no pasa del liderazgo de un héroe recién contratado', () => {
    // Ese acoplamiento vivía solo en el `_comment` de `data/liderazgo.json`: con
    // una guarnición mayor que lo que lleva un héroe de nivel 1, dos héroes
    // nuevos no la vencen nunca, nadie sube de nivel y la semilla 10 se queda
    // en tablas para siempre. Bajar `heroe.base` lo reabría sin decir nada.
    expect(LIDERAZGO.guarnicion).toBeLessThanOrEqual(LIDERAZGO.heroe.base);
    expect(GARRISON_LEADERSHIP).toBe(LIDERAZGO.guarnicion);
  });
});

describe('todos los lectores del ejército saben de personajes', () => {
  /** Un héroe que lleva un personaje y un jinete, con el personaje dado de alta. */
  function conPersonaje(state: GameState) {
    const aren = createCharacter('aren', { ...defaultBuild, profession: 'Guerrero' });
    state.characters = { aren };
    const hero = heroesOf(state, 0)[0]!;
    hero.army = [{ creature: CHARACTER_BODY, member: 'aren' }, { creature: 'elfo-jinete' }];
    return { hero, aren };
  }

  it('un héroe con un personaje pasa de día sin lanzar', () => {
    // La issue que dejó abierta la fase 2: `advanceDay` repone el movimiento con
    // `maxMovePoints`, que buscaba la velocidad de cada stack en el catálogo y
    // lanzaba «criatura desconocida: "character"».
    const state = newGame({ seed: 7 });
    const { hero, aren } = conPersonaje(state);
    const dia = state.day;
    hastaSuSiguienteTurno(state, ctx(7), 0);
    expect(state.day).toBe(dia + 1);

    // Y el movimiento lo marca el más lento: el personaje, por su destreza, y
    // no el campeón ultrarrápido.
    const speed = combatProfile(aren).unit.speed;
    expect(slowestSpeed(hero.army, state.characters)).toBe(speed);
    expect(hero.movePoints).toBe(maxMovePoints(hero, state.characters));
    expect(hero.movePoints).toBeLessThan(marchaALaEscala(SPEED_TO_MOVE_POINTS.ultra_fast));
  });

  it('la fuerza de la IA y la vista del agente leen el perfil del personaje', () => {
    const state = newGame({ seed: 7 });
    const { hero, aren } = conPersonaje(state);
    const perfil = combatProfile(aren).unit;
    const campeon = unidadDelJuego('elfo-jinete');
    // La fórmula es la de la IA y no una copia: lo que se prueba es de DÓNDE
    // saca las cifras —el perfil del personaje—, no cómo las combina.
    expect(armyPower(hero.army, state.characters)).toBe(unitPower(perfil) + unitPower(campeon));

    const vista = serializeAdventureTurn(state, 0) as {
      heroes: { id: string; army: unknown[]; leadership: { used: number; max: number } }[];
    };
    const mio = vista.heroes.find((h) => h.id === hero.id)!;
    expect(mio.army).toEqual([
      { creature: CHARACTER_BODY, member: 'aren', count: 1, speed: perfil.speed },
      { creature: 'elfo-jinete', count: 1, speed: campeon.speed },
    ]);
    expect(mio.leadership).toEqual({
      used: LIDERAZGO.personaje + campeon.leadership,
      max: heroLeadership(hero),
    });
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
        expect(armyLeadership(t.garrison)).toBeLessThanOrEqual(GARRISON_LEADERSHIP);
        expect(t.garrison.length).toBeLessThanOrEqual(CUPO_GUARNICION);
      }
    }
  });

  it('el reclutamiento de la IA no pide más de lo que cabe', () => {
    const { state, hero, town } = heroeEnCasa(SEMILLA);
    // Dos jinetes y un templario: 19 de 20, con tres puestos libres.
    hero.army = ejercito({ creature: JINETE, count: 2 }, { creature: TROPA, count: 1 });
    // Solo hay lo más barato, a montones, y oro de sobra.
    town.available = { [RECLUTA]: 50 };
    state.players[0]!.resources = { ...state.players[0]!.resources, gold: 50_000 };
    const libre = heroLeadership(hero) - armyLeadership(hero.army);
    expect(libre / unidadDelJuego(RECLUTA).leadership).toBeLessThan(CUPO_HEROE - hero.army.length);
    const reclutas = planRecruits(state, 0).filter((a) => a.type === 'recruit');
    const total = reclutas.reduce((n, a) => n + (a.type === 'recruit' ? a.count : 0), 0);
    // Había cincuenta y oro de sobra: lo que manda es el liderazgo libre.
    expect(total).toBe(libre / unidadDelJuego(RECLUTA).leadership);
    for (const a of reclutas) applyAdventureAction(state, a, ctx(SEMILLA), 0);
    expect(armyLeadership(hero.army)).toBe(heroLeadership(hero));

    // Y con liderazgo de sobra, lo que manda es el cupo de seis.
    hero.army = ejercito({ creature: RECLUTA, count: 4 }); // 4 de 20, 4 de 6
    const masReclutas = planRecruits(state, 0).filter((a) => a.type === 'recruit');
    const masTotal = masReclutas.reduce((n, a) => n + (a.type === 'recruit' ? a.count : 0), 0);
    expect(masTotal).toBe(2);
    for (const a of masReclutas) applyAdventureAction(state, a, ctx(SEMILLA), 0);
    expect(hero.army).toHaveLength(CUPO_HEROE);
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

  it('fuera de un castillo suyo, de más, de cero o un personaje: lanza con la frase y no toca nada', () => {
    const { state, hero } = heroeEnCasa(SEMILLA);
    const aren = createCharacter('aren', defaultBuild);
    state.characters = { aren };
    hero.army = [
      { creature: RECLUTA },
      { creature: RECLUTA },
      { creature: CHARACTER_BODY, member: 'aren' },
    ];
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
    expect(() => licenciar(CHARACTER_BODY, 1)).toThrow(/un personaje no se licencia/);
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

  it('la IA cambia lo barato por lo mejor cuando no cabe, y lo que pide es legal', () => {
    const { state, hero, town } = heroeEnCasa(SEMILLA);
    hero.army = ejercito({ creature: RECLUTA, count: CUPO_HEROE }); // el cupo lleno de lo barato
    // Lo que más pega de lo que cría la base, a montones.
    const mejor = [...dwellings(town)]
      .map((d) => unidadDelJuego(d.creature))
      .sort((a, b) => unitPower(b) - unitPower(a))[0]!;
    expect(unitPower(mejor)).toBeGreaterThan(unitPower(unidadDelJuego(RECLUTA)));
    town.available = { [mejor.id]: 10 };
    state.players[0]!.resources = { ...state.players[0]!.resources, gold: 50_000 };
    const antes = fuerzaDe(hero, undefined);
    const acciones = planRecruits(state, 0);
    const despide = acciones.findIndex((a) => a.type === 'dismiss');
    const recluta = acciones.findIndex((a) => a.type === 'recruit' && a.creature === mejor.id);
    expect(despide).toBeGreaterThanOrEqual(0);
    // Primero se hace sitio y después se recluta: al revés, el `recruit` no cabe.
    expect(despide).toBeLessThan(recluta);
    for (const a of acciones) applyAdventureAction(state, a, ctx(SEMILLA), 0);
    expect(hero.army.some((t) => t.creature === mejor.id)).toBe(true);
    expect(fuerzaDe(hero, undefined)).toBeGreaterThan(antes);
    expect(armyLeadership(hero.army)).toBeLessThanOrEqual(heroLeadership(hero));
  });

  it('y no licencia a nadie si lo que hay ya pega más que lo que se ofrece', () => {
    const { state, hero, town } = heroeEnCasa(SEMILLA);
    // Dos jinetes y un templario: 19 de 20 de liderazgo.
    hero.army = ejercito({ creature: JINETE, count: 2 }, { creature: TROPA, count: 1 });
    // Lo que se ofrece pega menos que cualquiera de los que lleva.
    const ofrecidas = [RECLUTA, 'goblin-arquero'];
    for (const id of ofrecidas) {
      expect(unitPower(unidadDelJuego(id)), id).toBeLessThan(unitPower(unidadDelJuego(TROPA)));
    }
    town.available = Object.fromEntries(ofrecidas.map((id) => [id, 50]));
    state.players[0]!.resources = { ...state.players[0]!.resources, gold: 50_000 };
    expect(planRecruits(state, 0).some((a) => a.type === 'dismiss')).toBe(false);
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
      const town = townsOf(state, 0)[0]!;
      // Variedad: unas semillas con mucha oferta, otras con poco oro, para que
      // el tope lo pongan las tres cosas en semillas distintas.
      // Lo primero que cría su pueblo: la facción la sortea la semilla.
      const recluta = dwellings(town)[0]!.creature;
      town.available[recluta] = 5 + (seed % 9) * 3;
      const oro = seed % 3 === 0 ? 20 * (seed % 7) : 50_000;
      state.players[0]!.resources = { ...state.players[0]!.resources, gold: oro };

      const plan = recruitCapacity(
        town,
        recluta,
        destinoDeRecluta(state, town),
        state.players[0]!.resources,
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
        expect(armyLeadership(town.garrison)).toBe(plan.ocupado + plan.maximo * plan.ocupaUno);
      }
    }
    // Que las dos ramas se ejerzan de verdad: si no, el test no prueba el `while`.
    expect(topadoPorLiderazgo).toBeGreaterThan(0);
    expect(topadoPorOro).toBeGreaterThan(0);
  });
});
