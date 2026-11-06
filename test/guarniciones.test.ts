/**
 * La guarnición de los sitios y la defensa con el héroe (puesto fronterizo, fase 1,
 * 04-11-2026; `docs/agents/2026-11-04-puesto-fronterizo/plan.md`, §7).
 *
 * Desde los criterios del plan, no desde el código: dejar y recoger en ciudad, paso
 * y pueblo propios; los rechazos con su frase; que pasar por casa ni contratar ya
 * recogen; la defensa que elige la IA (determinista, dentro del cupo del héroe y
 * sin dejar fuera más de lo que cabe en la guarnición) y la que rehace la persona;
 * la guarnición ajena de un paso o un pueblo, que para la marcha y se pelea; y el
 * héroe que pierde en su sitio, que lo entrega con lo que no eligió.
 */
import { describe, expect, it } from 'vitest';
import { Session } from '../src/client/session.js';
import { playAiTurn, resolvePendingBattle } from '../src/core/ai/turn.js';
import { applyAction, legalActions } from '../src/core/battle/battle.js';
import { adventureActionSchema, RESPONSE_FORMAT } from '../src/core/contract/agent.js';
import { serializeAdventureTurn } from '../src/core/contract/serialize.js';
import { accionDelAgente } from '../src/core/contract/vocabulario.js';
import { armyPower } from '../src/core/hero/fuerza.js';
import { armyLeadership, GARRISON_LEADERSHIP, heroLeadership } from '../src/core/hero/troop.js';
import { pointFromKey, pointKey } from '../src/core/map/map.js';
import { estructura } from '../src/core/map/regiones.js';
import { createRng } from '../src/core/rng.js';
import { currentPlayer, heroesOf } from '../src/core/state/consultas.js';
import {
  alcanceDelHeroe,
  applyAdventureAction,
  baseOf,
  caminoHasta,
  casillasHostiles,
  defensaBlocker,
  defensaPorElegir,
  elegirLaDefensa,
  pasosDeHoy,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import {
  defensaDeLaIA,
  dueñoDelSitio,
  elReparto,
  guarnicionDe,
  guarnicionDeLaCiudad,
  intercambioBlocker,
  lineasDelEjercito,
  ocupanteDe,
  ponerLaGuarnicion,
  repartir,
  repartirTropaBlocker,
  repartoBlocker,
  type Sitio,
  sitioEn,
  sitioPorId,
} from '../src/core/state/sitios.js';
import type { AdventureAction, GameState } from '../src/core/state/tipos.js';
import { type Army, NOMBRE_DE_FACCION, type Troop } from '../src/core/types.js';
import { ctx, JINETE, PESADA, TROPA, TROPA_BARATA } from './comun.js';
import { costesDelAlcance } from './mapa-de-prueba.js';
import {
  conSuEquipo,
  ejercito,
  forzarBatalla,
  guarnecer,
  pegadoA,
  unPaso,
  unPuebloDe,
} from './partida-de-prueba.js';

function jugar(state: GameState, accion: AdventureAction, quien = 0, seed = 1): void {
  applyAdventureAction(state, accion, ctx(seed), quien);
}

/** `count` de `creature`, o el veterano `veterano` (y entonces lo demás no va: `PedidoDeTropa`). */
function dejar(hero: string, creature: string, count: number, veterano?: string): AdventureAction {
  return veterano === undefined
    ? { type: 'dejar_tropa', hero, creature, count }
    : { type: 'dejar_tropa', hero, veterano };
}

function recoger(
  hero: string,
  creature: string,
  count: number,
  veterano?: string,
): AdventureAction {
  return veterano === undefined
    ? { type: 'recoger_tropa', hero, creature, count }
    : { type: 'recoger_tropa', hero, veterano };
}

describe('dejar y recoger tropa en un sitio propio', () => {
  it('en un paso: se dejan los que se irían, y el veterano por su id, con su equipo', () => {
    const state = newGame({ seed: 3 });
    const hero = heroesOf(state, 0)[0]!;
    const paso = unPaso(state);
    paso.owner = 0;
    hero.at = paso.at;
    const veterano = conSuEquipo(TROPA, { armadura: 'gambeson' }, 'v-paso');
    hero.army = [...ejercito({ creature: TROPA, count: 2 }), veterano];

    // Sin veterano, de su tipo se dejan los que se irían: los dos novatos, no él.
    jugar(state, dejar(hero.id, TROPA, 2));
    const sitio = sitioEn(state, paso.at)!;
    expect(guarnicionDe(state, sitio)).toEqual(ejercito({ creature: TROPA, count: 2 }));
    expect(hero.army).toEqual([veterano]);
    expect(state.guarniciones[paso.id]?.dueño).toBe(0);

    // El veterano, por su id: va entero, con su hoja y su equipo (el mismo individuo).
    jugar(state, dejar(hero.id, TROPA, 1, 'v-paso'));
    expect(guarnicionDe(state, sitio)).toContain(veterano);
    expect(hero.army).toEqual([]);

    jugar(state, recoger(hero.id, TROPA, 1, 'v-paso'));
    expect(hero.army).toEqual([veterano]);
    expect(hero.army[0]!.veterania?.equipo).toEqual({ armadura: 'gambeson' });

    // Recoger lo que queda vacía la guarnición: sin entrada, el paso no guarda nada.
    jugar(state, recoger(hero.id, TROPA, 2));
    expect(state.guarniciones[paso.id]).toBeUndefined();
    expect(hero.army).toHaveLength(3);

    // Cada movimiento, su hecho: protagonista, sitio, casilla y sello.
    const hechos = state.log.filter((e) => e.kind === 'troops_left' || e.kind === 'troops_taken');
    expect(hechos.map((e) => e.kind)).toEqual([
      'troops_left',
      'troops_left',
      'troops_taken',
      'troops_taken',
    ]);
    for (const e of hechos) {
      expect(e).toMatchObject({ hero: hero.id, site: paso.id, actor: 0, at: paso.at });
      expect(e.seen).toContain(0);
    }
  });

  it('en la ciudad: la guarnición de siempre (`guarnicionDeLaCiudad(state, Town)`)', () => {
    const state = newGame({ seed: 3 });
    const hero = heroesOf(state, 0)[0]!;
    const base = baseOf(state, 0)!;
    expect(pointKey(hero.at)).toBe(pointKey(base.at));
    guarnecer(state, base, []);
    hero.army = ejercito({ creature: TROPA_BARATA, count: 3 });
    jugar(state, dejar(hero.id, TROPA_BARATA, 2));
    expect(guarnicionDeLaCiudad(state, base)).toHaveLength(2);
    expect(hero.army).toHaveLength(1);
    jugar(state, recoger(hero.id, TROPA_BARATA, 1));
    expect(guarnicionDeLaCiudad(state, base)).toHaveLength(1);
    expect(hero.army).toHaveLength(2);
    expect(state.log.at(-1)).toMatchObject({ kind: 'troops_taken', site: base.id });
  });

  it('en un pueblo de una región propia: la guarda quien la deja, y no cambia de bando con la región (P1)', () => {
    const state = newGame({ seed: 3 });
    const hero = heroesOf(state, 0)[0]!;
    const pueblo = unPuebloDe(state, 0);
    hero.at = pueblo.at;
    const sitio = sitioEn(state, pueblo.at)!;
    expect(dueñoDelSitio(state, sitio)).toBe(0);
    hero.army = ejercito({ creature: TROPA_BARATA, count: 2 });
    jugar(state, dejar(hero.id, TROPA_BARATA, 2));
    expect(state.guarniciones[pueblo.id]).toEqual({
      dueño: 0,
      tropa: ejercito({ creature: TROPA_BARATA, count: 2 }),
    });
    // La región cambia de manos: el pueblo es de quien la tiene (tarea 2, P1), y
    // la tropa que se quedó no cambia de bando: lo OCUPA. Antes, quien la
    // guardaba mandaba sobre el pueblo.
    const red = estructura(state.map);
    const region = red.sitiosDeRegion.get(pueblo.id)!;
    for (const n of red.regiones[region]!.nodos) {
      const o = state.map.objects.find((x) => x.id === red.nodos[n]!.id)!;
      if (o.kind === 'node' || o.kind === 'town') o.owner = 1;
    }
    expect(dueñoDelSitio(state, sitio)).toBe(1);
    // Lo ocupan su héroe, que está en la casilla (el héroe va antes), y su tropa.
    expect(ocupanteDe(state, sitio)).toEqual({ kind: 'heroe', heroId: hero.id, dueño: 0 });
    // Recoger lo suyo, sí; dejar más, no (pregunta 3: «recoger sí, dejar no»).
    expect(
      intercambioBlocker(state, 0, 'dejar_tropa', {
        hero: hero.id,
        creature: TROPA_BARATA,
        count: 1,
      }),
    ).toMatch(/ya no es tuyo: puedes recoger la guarnición que dejaste, no dejar más/);
    const fuera = { ...hero.at, x: hero.at.x + 1 };
    hero.at = fuera;
    expect(ocupanteDe(state, sitio)).toEqual({ kind: 'guarnicion', dueño: 0 });
    hero.at = pueblo.at;
    jugar(state, recoger(hero.id, TROPA_BARATA, 2));
    expect(state.guarniciones[pueblo.id]).toBeUndefined();
    hero.at = fuera;
    expect(ocupanteDe(state, sitio)).toBeNull();
  });

  it('los rechazos dicen por qué, y no tocan nada', () => {
    const state = newGame({ seed: 3 });
    const hero = heroesOf(state, 0)[0]!;
    const base = baseOf(state, 0)!;
    const paso = unPaso(state);
    hero.army = ejercito({ creature: TROPA_BARATA, count: 2 });
    const intenta = (a: AdventureAction, quien = 0): string => {
      const antes = JSON.stringify({
        a: hero.army,
        g: state.guarniciones,
        t: guarnicionDeLaCiudad(state, base),
      });
      let motivo = '';
      try {
        applyAdventureAction(state, a, ctx(1), quien);
      } catch (err) {
        motivo = (err as Error).message;
      }
      expect(
        JSON.stringify({
          a: hero.army,
          g: state.guarniciones,
          t: guarnicionDeLaCiudad(state, base),
        }),
      ).toBe(antes);
      return motivo;
    };

    // Fuera de todo sitio: en una puerta del recinto de su base.
    hero.at = pegadoA(state, base.at);
    expect(sitioEn(state, hero.at)).toBeNull();
    expect(intenta(dejar(hero.id, TROPA_BARATA, 1))).toMatch(
      /no se puede dejar tropa: .* no está en ninguna ciudad, paso ni pueblo/,
    );

    // En un paso ajeno (o de nadie).
    hero.at = paso.at;
    paso.owner = 1;
    expect(intenta(dejar(hero.id, TROPA_BARATA, 1))).toMatch(/de \(\d+,\d+\) no es tuyo$/);

    paso.owner = 0;
    // Ni más de los que lleva, ni de lo que no hay, ni cero.
    expect(intenta(dejar(hero.id, TROPA_BARATA, 3))).toMatch(/lleva 2 × .* no se pueden mover 3/);
    expect(intenta(recoger(hero.id, TROPA_BARATA, 1))).toMatch(
      /la guarnición de .* no lleva individuos de tipo/,
    );
    expect(intenta(dejar(hero.id, TROPA_BARATA, 0))).toContain('se mueven de 1 en adelante');
    expect(intenta(dejar(hero.id, TROPA_BARATA, 1, 'v-no-esta'))).toContain(
      'no lleva al veterano "v-no-esta"',
    );

    // Lo que no cabe en la guarnición: el cupo de individuos de la partida.
    ponerLaGuarnicion(
      state,
      sitioEn(state, paso.at)!,
      0,
      ejercito({ creature: TROPA_BARATA, count: state.combate.tope }),
    );
    expect(intenta(dejar(hero.id, TROPA_BARATA, 1))).toMatch(
      new RegExp(
        `no cabe: la guarnición de.* ya lleva ${state.combate.tope} de ${state.combate.tope} individuos`,
      ),
    );

    // Y fuera de su turno lo dice el turno, antes que nada.
    expect(intenta(dejar(hero.id, TROPA_BARATA, 1), 1)).toContain('todavía no es tu turno');
  });

  it('la puerta del reparto lanza con los dos cupos: el del héroe y el de la guarnición', () => {
    // `repartir` es la única que mueve tropa entre héroe y sitio: quien escriba por
    // ella sin mirar los cupos (la IA que deje tropa, la fase 3) no los rompe en
    // silencio, que es lo que hizo lanzar a `createBattle` días después.
    const state = newGame({ seed: 3 });
    const hero = heroesOf(state, 0)[0]!;
    const paso = unPaso(state);
    paso.owner = 0;
    hero.at = paso.at;
    const sitio = sitioEn(state, paso.at)!;
    const tope = state.combate.tope;
    hero.army = [];
    ponerLaGuarnicion(state, sitio, 0, ejercito({ creature: TROPA_BARATA, count: tope }));
    const todos = guarnicionDe(state, sitio);
    // Todo al héroe: no le caben los `tope` (el héroe ocupa uno).
    expect(repartoBlocker(state, hero, sitio, todos)).toMatch(
      new RegExp(`^el ejército de .* no cabe: serían ${tope} de ${tope - 1} individuos`),
    );
    expect(() => repartir(state, hero, sitio, todos)).toThrow(
      /^no se puede repartir la tropa de.*: el ejército de .* no cabe/,
    );
    // Lo que no está en ninguno de los dos, tampoco.
    expect(() => repartir(state, hero, sitio, [{ creature: TROPA_BARATA }])).toThrow(
      /pide a alguien que no está ni en su ejército ni en la guarnición/,
    );
    // Sin tocar nada.
    expect(hero.army).toEqual([]);
    expect(guarnicionDe(state, sitio)).toBe(todos);
    // Y lo que sí cabe pasa.
    repartir(state, hero, sitio, todos.slice(0, 2));
    expect(hero.army).toHaveLength(2);
    expect(guarnicionDe(state, sitio)).toHaveLength(tope - 2);
  });

  it('pasar por casa no recoge, ni contratar', () => {
    const state = newGame({ seed: 3 });
    const base = baseOf(state, 0)!;
    const guarnicion = guarnicionDeLaCiudad(state, base).length;
    expect(guarnicion).toBeGreaterThan(0);
    // Un segundo héroe contratado en la base: nace sin tropa y la guarnición se queda.
    heroesOf(state, 0)[0]!.at = pegadoA(state, base.at);
    jugar(state, { type: 'hire_hero', town: base.id });
    const nuevo = heroesOf(state, 0).find((h) => pointKey(h.at) === pointKey(base.at))!;
    expect(nuevo.army).toEqual([]);
    expect(guarnicionDeLaCiudad(state, base)).toHaveLength(guarnicion);
    expect(state.log.some((e) => e.kind === 'troops_taken')).toBe(false);
  });
});

describe('repartir y confirmar (Q1 del QA, D9)', () => {
  /**
   * El héroe en su base con el ejército y la guarnición llenos de individuos, de dos
   * tipos distintos: lo que hacía imposible cambiar uno por otro de uno en uno.
   */
  function dosLlenos() {
    const state = newGame({ seed: 3 });
    const hero = heroesOf(state, 0)[0]!;
    const base = baseOf(state, 0)!;
    hero.at = { ...base.at };
    const tope = state.combate.tope;
    hero.army = ejercito({ creature: TROPA, count: tope - 1 });
    guarnecer(state, base, ejercito({ creature: TROPA_BARATA, count: tope }));
    const sitio = sitioEn(state, base.at)!;
    return { state, hero, base, sitio, tope };
  }

  it('con los dos llenos, uno por otro vale, y es un solo hecho con el sitio', () => {
    const { state, hero, base, sitio, tope } = dosLlenos();
    // De uno en uno no se puede: cada mitad desborda un lado.
    expect(
      intercambioBlocker(state, 0, 'dejar_tropa', { hero: hero.id, creature: TROPA, count: 1 }),
    ).toMatch(/no cabe: la guarnición de .* ya lleva/);
    expect(
      intercambioBlocker(state, 0, 'recoger_tropa', {
        hero: hero.id,
        creature: TROPA_BARATA,
        count: 1,
      }),
    ).toMatch(/no cabe: el ejército ya lleva/);
    // Repartido de una vez, sí.
    const cambio = {
      hero: hero.id,
      enElHeroe: [
        { creature: TROPA, count: tope - 2 },
        { creature: TROPA_BARATA, count: 1 },
      ],
    };
    expect(repartirTropaBlocker(state, 0, cambio)).toBeNull();
    const antes = state.log.length;
    jugar(state, { type: 'repartir_tropa', ...cambio });
    expect(hero.army.filter((t) => t.creature === TROPA)).toHaveLength(tope - 2);
    expect(hero.army.filter((t) => t.creature === TROPA_BARATA)).toHaveLength(1);
    expect(guarnicionDeLaCiudad(state, base).filter((t) => t.creature === TROPA)).toHaveLength(1);
    expect(
      guarnicionDeLaCiudad(state, base).filter((t) => t.creature === TROPA_BARATA),
    ).toHaveLength(tope - 1);
    // Un solo hecho, con lo que movió por tipo y el id del sitio.
    expect(state.log.slice(antes)).toEqual([
      expect.objectContaining({
        kind: 'troops_exchanged',
        hero: hero.id,
        site: base.id,
        left: [{ creature: TROPA, count: 1 }],
        taken: [{ creature: TROPA_BARATA, count: 1 }],
        actor: 0,
      }),
    ]);
    expect(sitio.kind).toBe('ciudad');
  });

  it('lo que no vale se rechaza con su frase y sin tocar nada', () => {
    const { state, hero, base, tope } = dosLlenos();
    const intenta = (enElHeroe: Parameters<typeof repartirTropaBlocker>[2]['enElHeroe']) => {
      const antes = JSON.stringify({ a: hero.army, t: guarnicionDeLaCiudad(state, base) });
      const motivo = repartirTropaBlocker(state, 0, { hero: hero.id, enElHeroe });
      expect(() => jugar(state, { type: 'repartir_tropa', hero: hero.id, enElHeroe })).toThrow(
        `no se puede repartir la tropa: ${motivo}`,
      );
      expect(JSON.stringify({ a: hero.army, t: guarnicionDeLaCiudad(state, base) })).toBe(antes);
      return motivo;
    };
    // Un final que desborda al héroe o a la guarnición: el de los cupos.
    expect(
      intenta([
        { creature: TROPA, count: tope - 1 },
        { creature: TROPA_BARATA, count: 1 },
      ]),
    ).toMatch(new RegExp(`^el ejército de .* no cabe: serían ${tope} de ${tope - 1} individuos`));
    expect(intenta([{ creature: TROPA, count: 0 }])).toMatch(
      /^lo que se queda no cabe en la guarnición de .*: serían/,
    );
    // Más de los que hay, un tipo dos veces, uno que no existe, un veterano que no
    // está, y no mover a nadie.
    expect(intenta([{ creature: TROPA, count: tope }])).toMatch(
      /hay \d+ × .* sin veteranía, no \d+/,
    );
    expect(
      intenta([
        { creature: TROPA, count: 1 },
        { creature: TROPA, count: 1 },
      ]),
    ).toContain('va dos veces en el reparto');
    expect(intenta([{ creature: 'no-existe', count: 1 }])).toContain('no existe ninguna unidad');
    expect(intenta([{ veterano: 'v-no-esta' }])).toContain('llevan al veterano "v-no-esta"');
    expect(intenta(lineasDelEjercito(hero.army))).toMatch(/^el reparto no mueve a nadie/);
    // Fuera de un sitio suyo, lo de siempre.
    hero.at = pegadoA(state, base.at);
    expect(intenta([])).toMatch(/no está en ninguna ciudad, paso ni pueblo/);
  });

  it('la pantalla edita sin tocar la partida, y el motivo va en el reparto entero', () => {
    const { state, hero, tope } = dosLlenos();
    // Como están: nada cambia y no hay nada que decir.
    const ahora = elReparto(state, 0, hero);
    expect(ahora).toMatchObject({ cambia: false, motivo: null });
    expect(ahora.heroe.individuos).toBe(tope - 1);
    expect(ahora.guarnicion.individuos).toBe(tope);
    // Uno más con el héroe: se puede editar aunque no quepa, y el motivo es del final.
    const lleno = elReparto(state, 0, hero, [
      { creature: TROPA, count: tope - 1 },
      { creature: TROPA_BARATA, count: 1 },
    ]);
    expect(lleno.cambia).toBe(true);
    expect(lleno.heroe.individuos).toBe(tope);
    expect(lleno.motivo).toMatch(/^el ejército de .* no cabe/);
    // El cambio uno por uno: vale.
    expect(
      elReparto(state, 0, hero, [
        { creature: TROPA, count: tope - 2 },
        { creature: TROPA_BARATA, count: 1 },
      ]),
    ).toMatchObject({ cambia: true, motivo: null });
    // Y nada de eso ha tocado la partida.
    expect(hero.army).toHaveLength(tope - 1);
  });
});

describe('cuándo recoge la IA (S8 de /simplify)', () => {
  /** Los `troops_taken` de `player` en su base desde el hecho `desde`. */
  const recogidosEnLaBase = (state: GameState, player: number, desde: number) => {
    const base = baseOf(state, player)!;
    return state.log
      .slice(desde)
      .filter((e) => e.kind === 'troops_taken' && e.actor === player && e.site === base.id);
  };

  it('el de salida, que nace en su base el día 1, no la vacía', async () => {
    const state = newGame({ seed: 3 });
    const base = baseOf(state, 0)!;
    expect(guarnicionDeLaCiudad(state, base).length).toBeGreaterThan(0);
    await playAiTurn(state, ctx(3));
    expect(recogidosEnLaBase(state, 0, 0)).toEqual([]);
  });

  it('el que se queda en casa no la vacía: solo recoge quien llega', async () => {
    const state = newGame({ seed: 3 });
    const c = ctx(3);
    // Al jugador 0 le toca otra vez el día 2 tras jugar el 1 (el orden en serpiente).
    while (!(state.day === 2 && currentPlayer(state).id === 0)) await playAiTurn(state, c);
    const hero = heroesOf(state, 0)[0]!;
    const base = baseOf(state, 0)!;
    hero.at = { ...base.at };
    // Se queda en casa: no volvió vencido. Con el catálogo retocado de `main`
    // (fusionado el 05-11-2026), en la semilla 3 el héroe vuelve vencido a su base
    // en el turno del rival (`vueltoACasa`), y ese sí recoge (el test de abajo).
    delete hero.vueltoACasa;
    guarnecer(state, base, ejercito({ creature: TROPA_BARATA, count: 2 }));
    hero.army = [];
    // Sin puntos no anda: no llega a ningún sitio, y no recoge (antes del S8, sí).
    hero.movePoints = 0;
    const desde = state.log.length;
    await playAiTurn(state, c);
    expect(recogidosEnLaBase(state, 0, desde)).toEqual([]);
    // Lo que recluta va a su ejército (está dentro); la guarnición sigue entera.
    expect(
      guarnicionDeLaCiudad(state, base).filter((t) => t.creature === TROPA_BARATA),
    ).toHaveLength(2);
  });

  it('el que vuelve vencido en el turno del rival recoge al empezar el suyo (H2 del QA)', async () => {
    const state = newGame({ seed: 3 });
    const c = ctx(3);
    jugar(state, { type: 'end_turn' }, 0);
    expect(currentPlayer(state).id).toBe(1);
    const base = baseOf(state, 0)!;
    const vencido = heroesOf(state, 0)[0]!;
    const rival = heroesOf(state, 1)[0]!;
    vencido.at = pegadoA(state, base.at);
    vencido.army = ejercito({ creature: TROPA_BARATA, count: 1 });
    rival.army = ejercito({ creature: JINETE, count: 6 });
    guarnecer(state, base, ejercito({ creature: TROPA_BARATA, count: 3 }));
    forzarBatalla(state, c, rival, vencido.at);
    expect(resolvePendingBattle(state, c).winner).toBe('attacker');
    // Vuelve a casa sin tropa, marcado: volver es llegar.
    expect(pointKey(vencido.at)).toBe(pointKey(base.at));
    expect(vencido.army).toEqual([]);
    expect(vencido.vueltoACasa).toBe(true);
    // El turno del rival acaba y la marca sigue (no es suya); en serpiente, abre él el día 2.
    jugar(state, { type: 'end_turn' }, 1);
    expect(vencido.vueltoACasa).toBe(true);
    jugar(state, { type: 'end_turn' }, 1);
    expect(currentPlayer(state).id).toBe(0);
    const desde = state.log.length;
    await playAiTurn(state, c);
    expect(recogidosEnLaBase(state, 0, desde)).not.toEqual([]);
    // Al acabar su turno se borra.
    expect(vencido.vueltoACasa).toBeUndefined();
  });
});

describe('la defensa con el héroe en su sitio', () => {
  /** La base del jugador 1 atacada por el héroe del 0, con su héroe dentro y una guarnición. */
  function asaltoALaBase(seed: number, defensa: Army, guarnicion: Army) {
    const state = newGame({ seed });
    const c = ctx(seed);
    const atacante = heroesOf(state, 0)[0]!;
    const defensor = heroesOf(state, 1)[0]!;
    const base = baseOf(state, 1)!;
    defensor.at = base.at;
    defensor.army = defensa;
    guarnecer(state, base, guarnicion);
    atacante.army = ejercito({ creature: JINETE, count: 3 });
    forzarBatalla(state, c, atacante, base.at);
    return { state, c, atacante, defensor, base };
  }

  it('la IA elige lo más fuerte que quepa, cuenta la defensa y monta la batalla con ella', () => {
    const debiles = ejercito({ creature: TROPA_BARATA, count: 3 });
    const fuertes = ejercito({ creature: JINETE, count: 2 });
    const { state, defensor, base } = asaltoALaBase(5, debiles, fuertes);
    // Los jinetes de la guarnición pelean; caben los dos y los tres goblins.
    expect(defensor.army.filter((t) => t.creature === JINETE)).toHaveLength(2);
    expect(defensor.army).toHaveLength(5);
    expect(guarnicionDeLaCiudad(state, base)).toEqual([]);
    const battle = state.pendingBattle!.battle;
    expect(battle.stacks.filter((s) => s.side === 'defender')).toHaveLength(6);
    // El hecho va detrás del `battle_started`, con quién y dónde.
    const i = state.log.findIndex((e) => e.kind === 'battle_started');
    expect(state.log[i + 1]).toMatchObject({
      kind: 'defense_set',
      hero: defensor.id,
      site: base.id,
      fighting: 5,
      staying: 0,
      actor: 1,
      at: base.at,
    });
  });

  it('la de la IA es determinista, cabe en el héroe y lo de fuera cabe en la guarnición', () => {
    // Composiciones al azar (con su semilla), de lo que cabe en cada uno al empezar.
    const tipos = [TROPA_BARATA, TROPA, PESADA, JINETE];
    const rng = createRng(77);
    const state = newGame({ seed: 7 });
    const hero = heroesOf(state, 1)[0]!;
    const base = baseOf(state, 1)!;
    const sitio: Sitio = { kind: 'ciudad', town: base };
    const llena = (tope: number, cupo: number): Army => {
      const out: Troop[] = [];
      for (let n = 0; n < 12; n++) {
        const t = { creature: tipos[rng.int(0, tipos.length - 1)]! };
        if (out.length < cupo && armyLeadership([...out, t]) <= tope) out.push(t);
      }
      return out;
    };
    for (let vuelta = 0; vuelta < 200; vuelta++) {
      hero.army = llena(heroLeadership(hero), state.combate.tope - 1);
      guarnecer(state, base, llena(GARRISON_LEADERSHIP, state.combate.tope));
      const todos = [...hero.army, ...guarnicionDeLaCiudad(state, base)];
      const elegida = defensaDeLaIA(state, hero, sitio);
      expect(defensaDeLaIA(state, hero, sitio)).toEqual(elegida);
      const fuera = todos.filter((t) => !elegida.includes(t));
      expect(armyLeadership(elegida)).toBeLessThanOrEqual(heroLeadership(hero));
      expect(elegida.length).toBeLessThanOrEqual(state.combate.tope - 1);
      expect(armyLeadership(fuera)).toBeLessThanOrEqual(GARRISON_LEADERSHIP);
      expect(fuera.length).toBeLessThanOrEqual(state.combate.tope);
      // Nunca pelea con menos fuerza que con su ejército de antes.
      expect(armyPower(elegida)).toBeGreaterThanOrEqual(armyPower(hero.army));
    }
  });

  it('la persona la rehace antes de la primera jugada: reparte y vuelve a montar la batalla', () => {
    const debiles = ejercito({ creature: TROPA_BARATA, count: 3 });
    const fuertes = ejercito({ creature: JINETE, count: 2 });
    const { state, c, defensor, base } = asaltoALaBase(5, debiles, fuertes);
    const porElegir = defensaPorElegir(state, 1)!;
    expect(porElegir.hero).toBe(defensor);
    expect(
      porElegir.filas.map(({ creature, hay, pelean, propuesta }) => [
        creature,
        hay,
        pelean,
        propuesta,
      ]),
    ).toEqual([
      [TROPA_BARATA, 3, 3, 3],
      [JINETE, 2, 2, 2],
    ]);
    // Los motivos de cada fila los escribe el núcleo: pelean todos, así que no hay «+»,
    // y eso informa, no rechaza (H5 del QA): va en `notaMas`, no en `motivoMas`.
    expect(porElegir.filas[1]!.notaMas).toMatch(/^pelean los 2 × .* que hay$/);
    expect(porElegir.filas[1]!.motivoMas).toBeNull();
    expect(porElegir.filas[1]!.motivoMenos).toBeNull();
    expect(porElegir.motivo).toBeNull();
    expect(porElegir.ocupa.individuos).toBe(5);
    // Con lo pedido: sin jinetes no hay «−» suyo, y sí «+».
    const sinJinetes = defensaPorElegir(state, 1, [{ creature: JINETE, count: 0 }])!;
    expect(sinJinetes.filas[1]).toMatchObject({
      pelean: 0,
      propuesta: 2,
      motivoMas: null,
      notaMas: null,
    });
    expect(sinJinetes.filas[1]!.motivoMenos).toMatch(/^ya no pelea ningún /);
    expect(sinJinetes.ocupa.individuos).toBe(3);
    // El rival no elige la defensa del otro.
    expect(defensaPorElegir(state, 0)).toBeNull();
    expect(defensaBlocker(state, 0, [])).toMatch(/no es de tu bando/);

    // Solo los dos jinetes: los goblins se quedan en la guarnición.
    elegirLaDefensa(state, c, 1, [{ creature: JINETE, count: 2 }]);
    expect(defensor.army).toEqual(fuertes);
    expect(guarnicionDeLaCiudad(state, base)).toEqual(debiles);
    const defensores = state.pendingBattle!.battle.stacks.filter((s) => s.side === 'defender');
    expect(defensores).toHaveLength(3);
    expect(state.log.at(-1)).toMatchObject({ kind: 'defense_set', fighting: 2, staying: 3 });

    // Lo que no se tiene o no cabe se rechaza diciéndolo.
    expect(defensaBlocker(state, 1, [{ creature: JINETE, count: 3 }])).toContain('hay 2 × ');
    expect(
      defensaBlocker(state, 1, [
        { creature: JINETE, count: 2 },
        { creature: JINETE, count: 0 },
      ]),
    ).toContain('va dos veces');

    // Tras la primera jugada, ya no: la batalla es otra.
    const battle = state.pendingBattle!.battle;
    applyAction(battle, legalActions(battle).find((a) => a.type === 'end_turn')!, c.rng);
    expect(defensaBlocker(state, 1, [{ creature: JINETE, count: 1 }])).toContain(
      'la batalla ya ha empezado',
    );
    expect(() => elegirLaDefensa(state, c, 1, [{ creature: JINETE, count: 1 }])).toThrow(
      /ya ha empezado/,
    );
  });

  it('no deja fuera lo que no cabe en la guarnición', () => {
    // Seis goblins en el héroe y siete en la guarnición: defender con uno deja doce fuera.
    const { state } = asaltoALaBase(
      5,
      ejercito({ creature: TROPA_BARATA, count: 6 }),
      ejercito({ creature: TROPA_BARATA, count: 7 }),
    );
    expect(defensaBlocker(state, 1, [{ creature: TROPA_BARATA, count: 1 }])).toMatch(
      /lo que se queda no cabe en la guarnición de .*: serían 12 de 7 individuos/,
    );
  });

  it('el héroe que pierde en su paso lo entrega, y lo que no eligió se pierde con él', () => {
    const state = newGame({ seed: 5 });
    const c = ctx(5);
    const atacante = heroesOf(state, 0)[0]!;
    const defensor = heroesOf(state, 1)[0]!;
    const paso = unPaso(state);
    paso.owner = 1;
    defensor.at = paso.at;
    defensor.army = [];
    // Siete en la guarnición: el héroe se lleva lo que le quepa y el resto se queda fuera.
    ponerLaGuarnicion(
      state,
      sitioPorId(state, paso.id),
      1,
      ejercito({ creature: TROPA_BARATA, count: 7 }),
    );
    atacante.army = ejercito({ creature: JINETE, count: 6 });
    forzarBatalla(state, c, atacante, paso.at);
    expect(state.log.at(-1)).toMatchObject({ kind: 'defense_set', site: paso.id, staying: 1 });
    expect(resolvePendingBattle(state, c).winner).toBe('attacker');
    expect(paso.owner).toBe(0);
    expect(state.guarniciones[paso.id]).toBeUndefined();
    expect(state.log.some((e) => e.kind === 'node_captured' && e.node === paso.id)).toBe(true);
  });
});

describe('la guarnición ajena de un paso o de un pueblo', () => {
  function pasoGuardado(seed: number, guarda: Army) {
    const state = newGame({ seed });
    const paso = unPaso(state);
    paso.owner = 1;
    ponerLaGuarnicion(state, sitioPorId(state, paso.id), 1, guarda);
    return { state, paso, hero: heroesOf(state, 0)[0]! };
  }

  it('se alcanza pero no se cruza; sin tropa, se cruza como siempre', () => {
    const { state, paso } = pasoGuardado(5, ejercito({ creature: TROPA, count: 2 }));
    expect(casillasHostiles(state, 0).map(pointKey)).toContain(pointKey(paso.at));
    expect(casillasHostiles(state, 1).map(pointKey)).not.toContain(pointKey(paso.at));
    // Sin guarnición, un paso ajeno se cruza como siempre.
    ponerLaGuarnicion(state, sitioPorId(state, paso.id), 1, []);
    expect(casillasHostiles(state, 0).map(pointKey)).not.toContain(pointKey(paso.at));
  });

  it('pisarlo es pelear contra ella; ganando, el paso es tuyo y no se entra', () => {
    const { state, paso, hero } = pasoGuardado(5, ejercito({ creature: TROPA_BARATA, count: 1 }));
    hero.army = ejercito({ creature: JINETE, count: 6 });
    const c = ctx(5);
    forzarBatalla(state, c, hero, paso.at);
    const pending = state.pendingBattle!;
    expect(pending.foe).toEqual({ kind: 'garrison', site: paso.id });
    const defensores = pending.battle.stacks.filter((s) => s.side === 'defender');
    expect(defensores).toHaveLength(1);
    expect(defensores.some((s) => s.origen.kind === 'heroe')).toBe(false);
    const desde = hero.at;
    expect(resolvePendingBattle(state, c).winner).toBe('attacker');
    expect(paso.owner).toBe(0);
    expect(state.guarniciones[paso.id]).toBeUndefined();
    expect(pointKey(hero.at)).toBe(pointKey(desde));
    const fin = state.log.find((e) => e.kind === 'battle_ended')!;
    expect(fin).toMatchObject({
      foe: { kind: 'garrison' },
      owners: { attacker: 0, defender: 1 },
    });
  });

  it('perdiendo, el paso sigue del dueño con lo que le quede', () => {
    const { state, paso, hero } = pasoGuardado(5, ejercito({ creature: JINETE, count: 6 }));
    hero.army = [];
    hero.spells = [];
    const c = ctx(5);
    forzarBatalla(state, c, hero, paso.at);
    expect(resolvePendingBattle(state, c).winner).toBe('defender');
    expect(paso.owner).toBe(1);
    const queda = state.guarniciones[paso.id]!;
    expect(queda.dueño).toBe(1);
    expect(queda.tropa.length).toBeGreaterThan(0);
    expect(queda.tropa.length).toBeLessThanOrEqual(6);
  });

  it('un pueblo con guarnición ajena se pelea igual; vencida, el pueblo vuelve a su región', () => {
    const state = newGame({ seed: 5 });
    const pueblo = unPuebloDe(state, 1);
    ponerLaGuarnicion(
      state,
      sitioPorId(state, pueblo.id),
      1,
      ejercito({ creature: TROPA_BARATA, count: 1 }),
    );
    const hero = heroesOf(state, 0)[0]!;
    hero.army = ejercito({ creature: JINETE, count: 6 });
    const c = ctx(5);
    forzarBatalla(state, c, hero, pueblo.at);
    expect(state.pendingBattle!.foe).toEqual({ kind: 'garrison', site: pueblo.id });
    expect(resolvePendingBattle(state, c).winner).toBe('attacker');
    expect(state.guarniciones[pueblo.id]).toBeUndefined();
    expect(dueñoDelSitio(state, sitioPorId(state, pueblo.id))).toBe(1);
  });
});

describe('el contrato del agente', () => {
  it('«leave_troops» y «take_troops» van con su línea y se traducen al núcleo', () => {
    expect(RESPONSE_FORMAT.adventure_turn).toContain('"type": "leave_troops"');
    expect(RESPONSE_FORMAT.adventure_turn).toContain('"type": "take_troops"');
    expect(RESPONSE_FORMAT.adventure_turn).toContain('"you.garrisons"');
    expect(RESPONSE_FORMAT.adventure_turn).not.toContain('se recoge al pasar');
    const r = adventureActionSchema.safeParse({
      type: 'leave_troops',
      hero: 'h',
      creature: TROPA,
      count: 1,
      veteran: 'v-1',
    });
    expect(r.success).toBe(true);
    expect(
      adventureActionSchema.safeParse({ type: 'take_troops', hero: 'h', creature: TROPA, count: 0 })
        .success,
    ).toBe(false);
    const state = newGame({ seed: 1 });
    expect(
      accionDelAgente({ type: 'take_troops', hero: 'h', creature: TROPA, count: 2 }, state),
    ).toEqual({ type: 'recoger_tropa', hero: 'h', creature: TROPA, count: 2 });
    // Con «veteran», el núcleo mueve a ese y nada más: lo demás se mira al traducir.
    const hero = heroesOf(state, 0)[0]!;
    hero.army = [conSuEquipo(TROPA, {}, 'v-1')];
    const leave = (creature: string, count: number) =>
      accionDelAgente(
        { type: 'leave_troops', hero: hero.id, creature, count, veteran: 'v-1' },
        state,
      );
    expect(leave(TROPA, 1)).toEqual({ type: 'dejar_tropa', hero: hero.id, veterano: 'v-1' });
    expect(() => leave(TROPA, 2)).toThrow('un veterano es uno solo: no se mueven 2');
    expect(() => leave(JINETE, 1)).toThrow(
      `el veterano "v-1" es de tipo "${TROPA}", no "${JINETE}"`,
    );
    // Uno que no está pasa tal cual: el núcleo dice que no lo lleva.
    expect(
      accionDelAgente(
        { type: 'leave_troops', hero: hero.id, creature: TROPA, count: 1, veteran: 'v-otro' },
        state,
      ),
    ).toEqual({ type: 'dejar_tropa', hero: hero.id, veterano: 'v-otro' });
  });

  it('«you.garrisons» trae lo que guarda cada paso y pueblo suyo, y no lo del rival', () => {
    const state = newGame({ seed: 3 });
    const paso = unPaso(state);
    paso.owner = 0;
    ponerLaGuarnicion(
      state,
      sitioPorId(state, paso.id),
      0,
      ejercito({ creature: TROPA, count: 2 }),
    );
    const suyo = serializeAdventureTurn(state, 0).you.garrisons;
    expect(suyo).toEqual([
      {
        site: paso.id,
        kind: 'node',
        at: paso.at,
        army: [expect.objectContaining({ creature: TROPA, count: 2 })],
      },
    ]);
    expect(serializeAdventureTurn(state, 1).you.garrisons).toEqual([]);
  });
});

describe('las pantallas de la persona (la sesión)', () => {
  it('la guarnición se abre al parar en un paso propio y no al pasar por él', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = new Session(seed);
      const hero = heroesOf(s.state, 0)[0]!;
      // Un paso al que llega hoy, y una casilla de más allá cuyo camino lo cruza.
      for (const paso of s.state.map.objects) {
        if (paso.kind !== 'node' || paso.owner !== null) continue;
        const ida = caminoHasta(s.state, hero, paso.at);
        if (ida === null || pasosDeHoy(ida, hero) < ida.length) continue;
        const mas = [...costesDelAlcance(alcanceDelHeroe(s.state, hero)).keys()]
          .map(pointFromKey)
          .find((p) => {
            const c = caminoHasta(s.state, hero, p);
            if (c === null || pasosDeHoy(c, hero) < c.length) return false;
            const i = c.findIndex((x) => pointKey(x.at) === pointKey(paso.at));
            return i >= 0 && i < c.length - 1 && sitioEn(s.state, p) === null;
          });
        if (mas === undefined) continue;
        paso.owner = 0;
        s.closeTown();
        s.moveHeroTo(hero.id, mas);
        expect(pointKey(hero.at)).toBe(pointKey(mas));
        expect(s.guarnicionAbierta, 'pasando de largo').toBeNull();
        // Y parando en él, sí: la vista trae su ejército y la guarnición vacía.
        hero.movePoints = 5000;
        s.moveHeroTo(hero.id, paso.at);
        expect(pointKey(hero.at)).toBe(pointKey(paso.at));
        expect(s.guarnicionAbierta).toBe(hero.id);
        const vista = s.vistaDeLaGuarnicion()!;
        expect(vista.guarnicion.filas).toEqual([]);
        expect(vista).toMatchObject({ cambia: false, motivo: null });
        const llevaba = hero.army.length;
        const tipo = vista.heroe.filas[0]!.creature;
        // Pasar uno edita la pantalla y no la partida.
        s.moverEnElReparto('guarnicion', tipo);
        expect(s.vistaDeLaGuarnicion()!.guarnicion.individuos).toBe(1);
        expect(s.vistaDeLaGuarnicion()!.cambia).toBe(true);
        expect(hero.army).toHaveLength(llevaba);
        // Cancelar lo descarta.
        s.cerrarLaGuarnicion();
        expect(s.vistaDeLaGuarnicion()).toBeNull();
        expect(hero.army).toHaveLength(llevaba);
        // Confirmar lo manda: un hecho con el sitio, y se cierra.
        s.abrirLaGuarnicion(hero.id);
        expect(s.vistaDeLaGuarnicion()!.cambia).toBe(false);
        s.moverEnElReparto('guarnicion', tipo);
        s.confirmarElReparto();
        expect(s.guarnicionAbierta).toBeNull();
        expect(hero.army).toHaveLength(llevaba - 1);
        expect(s.state.log.at(-1)).toMatchObject({
          kind: 'troops_exchanged',
          site: paso.id,
          left: [{ creature: tipo, count: 1 }],
          taken: [],
        });
        return;
      }
    }
    throw new Error('ninguna semilla de 1-40 tiene un paso que se cruce hoy');
  });

  it('atacado en su base con guarnición, elige la defensa antes de la primera jugada', async () => {
    // El rival, pegado a la base y mucho más fuerte, con el héroe de la persona
    // dentro con su guarnición. Era una semilla en que pasaba jugando el día 2
    // (la 37, buscada a mano); con el catálogo retocado de `main` (fusionado el
    // 05-11-2026) el rival ya no iba a por ella, y se monta a mano.
    const s = new Session(37);
    const base = baseOf(s.state, 0)!;
    const mio = heroesOf(s.state, 0)[0]!;
    mio.at = { ...base.at };
    mio.army = ejercito({ creature: TROPA_BARATA, count: 1 });
    guarnecer(s.state, base, ejercito({ creature: TROPA_BARATA, count: 3 }));
    const rival = heroesOf(s.state, 1)[0]!;
    rival.at = pegadoA(s.state, base.at);
    rival.army = ejercito({ creature: PESADA, count: 6 });
    rival.movePoints = 100_000;
    let vista: Session['defensa'] = null;
    let jugada = '';
    let aviso: Session['avisoDelAtaque'] = null;
    s.alCambiarSinGesto = () => {
      // Primero el aviso en el mapa, con la cámara en la base (arreglo 3 del
      // 06-11-2026); «Defender» abre la batalla y, con ella, la defensa.
      if (s.avisoDelAtaque !== null) {
        aviso = s.avisoDelAtaque;
        expect(s.scene).toBe('adventure');
        expect(s.battle).not.toBeNull();
        s.defenderElAtaque();
        expect(s.avisoDelAtaque).toBeNull();
        expect(s.scene).toBe('battle');
      }
      const d = s.defensa;
      if (d !== null && vista === null) {
        vista = d;
        // Mientras se elige, la batalla no se juega.
        s.playBattleAction({ type: 'end_turn' });
        jugada = s.status;
        const fila = d.filas.find((f) => f.pelean > 0)!;
        s.cambiarLaDefensa(fila.creature, -1);
        const antes = s.battle!.stacks.filter((st) => st.side === 'defender').length;
        s.confirmarLaDefensa();
        expect(s.defensa).toBeNull();
        // La defensa elegida se despliega después, sin ver al rival (la fase de
        // despliegue de `main`): la batalla rehecha nace desplegando.
        expect(s.battle!.despliegue).not.toBeNull();
        expect(s.status).toMatch(/^¡Te atacan! Despliega a los tuyos/);
        expect(s.battle!.stacks.filter((st) => st.side === 'defender')).toHaveLength(antes - 1);
        expect(s.state.log.at(-1)).toMatchObject({ kind: 'defense_set', actor: 0 });
      }
      if (s.battle !== null && s.defensa === null && s.ruedaPendiente === null) {
        s.autoResolveBattle();
      }
    };
    for (let n = 0; n < 4 && vista === null && s.state.finished === null; n++) await s.endTurn();
    expect(vista).not.toBeNull();
    expect(jugada).toBe('Antes de nada, elige con quién defiendes.');
    // El aviso dice quién, a quién y dónde, y mira a la base.
    const dicho = aviso as Session['avisoDelAtaque'];
    expect(dicho?.at).toEqual(base.at);
    expect(dicho?.titulo).toBe(`¡Te atacan en ${base.name}!`);
    expect(dicho?.frase).toBe(
      `${rival.name} (${NOMBRE_DE_FACCION[s.state.players[1]!.faction]}) ataca a ${mio.name} en ${base.name}.`,
    );
  });
});
