/**
 * Un mundo (`core/mundo/`, F1a de `docs/agents/2026-10-22-mapa-vivo/`): la
 * validación que comparten `pnpm mundo validar`, el servidor de desarrollo, la
 * página y `newGame`, y lo que el mundo pone en la partida.
 *
 * Los mundos rotos son copias del de prueba con una cosa cambiada a mano: cada
 * caso mira que salga **su** frase, con su ruta, que es lo que lee el motor para
 * corregirse.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mundoDeLaUrl } from '../src/client/mundo/cargar.js';
import { hayQuePreguntar } from '../src/client/semilla.js';
import { jugadaEnElLugar } from '../src/core/ai/lugares.js';
import { buildMap, type MapPlan } from '../src/core/map/generate.js';
import { isEnterable } from '../src/core/map/map.js';
import {
  CLAVES_DE_CONDICION,
  CLAVES_DE_EFECTO,
  type Historia,
  VOCABULARIO,
} from '../src/core/mundo/formato.js';
import { lecturaParaElMotor } from '../src/core/mundo/lectura.js';
import { partidaDelMundo } from '../src/core/mundo/partida.js';
import { opcionBlocker } from '../src/core/mundo/reglas.js';
import {
  type CrudosDelMundo,
  leerMundo,
  lugarBlocker,
  problemasDelMundo,
} from '../src/core/mundo/validar.js';
import { createRng } from '../src/core/rng.js';
import {
  type AdventureAction,
  applyAdventureAction,
  type GameState,
  settleBattle,
} from '../src/core/state/game.js';

function crudos(id: string): CrudosDelMundo {
  const leer = (f: string): unknown =>
    JSON.parse(readFileSync(new URL(`../assets/mundos/${id}/${f}.json`, import.meta.url), 'utf8'));
  return { mundo: leer('mundo'), plan: leer('plan'), historia: leer('historia') };
}

/** Los crudos de `prueba` con la historia cambiada por `cambio`. */
function conHistoria(
  cambio: (h: { lugares: Record<string, unknown>[] } & Record<string, unknown>) => void,
): string[] {
  const c = structuredClone(crudos('prueba')) as {
    mundo: unknown;
    plan: unknown;
    historia: { lugares: Record<string, unknown>[] } & Record<string, unknown>;
  };
  cambio(c.historia);
  return problemasDelMundo(c, 'prueba');
}

/** El primer lugar de la historia, para tocarlo. */
const puente = (h: { lugares: Record<string, unknown>[] }) =>
  h.lugares[0] as unknown as {
    at: { x: number; y: number };
    dialogos: Record<
      string,
      {
        inicio: string;
        nodos: Record<string, { texto?: string; opciones: Record<string, unknown>[] }>;
      }
    >;
    encuentros: Record<string, { tropa: unknown; alPerder: unknown[] }>;
  };

describe('la validación de un mundo', () => {
  it('el mundo de prueba no tiene problemas', () => {
    expect(problemasDelMundo(crudos('prueba'), 'prueba')).toEqual([]);
  });

  it('un mundo de otra versión o con dos rivales se rechaza diciéndolo', () => {
    const c = structuredClone(crudos('prueba')) as {
      mundo: Record<string, unknown>;
    } & CrudosDelMundo;
    c.mundo.version = 2;
    c.mundo.rivales = 2;
    const p = problemasDelMundo(c, 'prueba');
    expect(p).toContainEqual(
      expect.stringContaining('mundo.json: version: es 2 y este juego lee la 1'),
    );
    expect(p).toContainEqual(expect.stringContaining('mundo.json: rivales: es 2'));
  });

  it('el id de la carpeta y el del mundo tienen que coincidir', () => {
    expect(problemasDelMundo(crudos('prueba'), 'otro')).toContainEqual(
      expect.stringContaining('mundo.json: id: dice "prueba" y el mundo está en la carpeta "otro"'),
    );
  });

  it('una marca sin declarar, con su ruta', () => {
    const p = conHistoria((h) => {
      puente(h).dialogos.garita!.nodos.dentro!.opciones[0]!.hace = [{ marca: 'carta-leída-mal' }];
    });
    expect(p).toContainEqual(
      'historia.json: lugares[0].dialogos.garita.nodos.dentro.opciones[0].hace[0]: la marca "carta-leída-mal" no está declarada en «marcas»',
    );
  });

  it('un nodo al que no se llega desde el inicio', () => {
    const p = conHistoria((h) => {
      puente(h).dialogos.garita!.nodos.suelto = {
        texto: 'Nadie llega aquí.',
        opciones: [{ texto: 'Salir' }],
      };
    });
    expect(p).toContainEqual(
      'historia.json: lugares[0].dialogos.garita.nodos.suelto: no se llega a él desde el inicio («dentro»)',
    );
  });

  it('una pieza que no existe', () => {
    const p = conHistoria((h) => {
      puente(h).dialogos.garita!.nodos.dentro!.opciones[1]!.hace = [
        { pieza: 'docuemnto' },
        { marca: 'lanza-cogida' },
      ];
    });
    expect(p).toContainEqual(
      'historia.json: lugares[0].dialogos.garita.nodos.dentro.opciones[1].hace[0]: la pieza "docuemnto" no existe en el catálogo de equipo',
    );
  });

  it('un lugar en una barrera, en un recinto o pegado a un pueblo', () => {
    const plan = crudos('prueba').plan as MapPlan;
    const { map } = buildMap(plan);
    const barrera = map.terrain.findIndex(
      (_, i) => !isEnterable(map, { x: i % map.width, y: Math.floor(i / map.width) }),
    );
    const enBarrera = { x: barrera % map.width, y: Math.floor(barrera / map.width) };
    const base = plan.towns.find((t) => t.owner === 0)!.at;
    const pueblo = plan.villages[0]!.at;
    const enLaMuralla = { x: base.x, y: base.y - 1 };
    const pegado = { x: pueblo.x, y: pueblo.y - 2 };

    const en = (at: { x: number; y: number }) =>
      conHistoria((h) => {
        puente(h).at = at;
      });
    expect(en(enBarrera)).toContainEqual(
      expect.stringMatching(/lugares\[0\]\.at: .* y eso no se pisa$/),
    );
    expect(en(enLaMuralla)).toContainEqual(
      `historia.json: lugares[0].at: (${enLaMuralla.x}, ${enLaMuralla.y}) está en el recinto de una ciudad: un lugar va fuera`,
    );
    expect(lugarBlocker(map, pegado)).toMatch(
      /está a 2 del pueblo ".*" en \(\d+, \d+\): un lugar va a 3 casillas o más de todo objeto del mapa$/,
    );
  });

  it('un encuentro por encima del tope de un grupo neutral', () => {
    const p = conHistoria((h) => {
      puente(h).encuentros.corvo!.tropa = [{ creature: 'imperio-pistolero-montado', count: 4 }];
    });
    expect(p).toContainEqual(
      'historia.json: lugares[0].encuentros.corvo.tropa: su tropa ocupa 32 de liderazgo y un encuentro lleva como mucho 28',
    );
  });

  it('una opción que da algo y no se apaga a sí misma', () => {
    const p = conHistoria((h) => {
      puente(h).dialogos.garita!.nodos.dentro!.opciones[1] = {
        texto: 'Coger la lanza',
        hace: [{ pieza: 'lanza_de_jinete' }],
      };
    });
    expect(p).toContainEqual(
      expect.stringMatching(
        /^historia\.json: lugares\[0\]\.dialogos\.garita\.nodos\.dentro\.opciones\[1\]: da algo y no se apaga a sí misma/,
      ),
    );
  });

  it('una batalla que no va la última, y una pieza al perder', () => {
    const p = conHistoria((h) => {
      puente(h).dialogos.corvo!.nodos.alto!.opciones[2]!.hace = [
        { batalla: 'corvo' },
        { marca: 'peaje-pagado' },
      ];
      puente(h).encuentros.corvo!.alPerder = [{ pieza: 'gambeson' }];
    });
    expect(p).toContainEqual(
      'historia.json: lugares[0].dialogos.corvo.nodos.alto.opciones[2].hace[0]: una batalla va la última de su lista: lo de después pasaría antes de saber quién gana',
    );
    expect(p).toContainEqual(
      'historia.json: lugares[0].encuentros.corvo.alPerder[0]: «pieza» no vale aquí; valen estado, marca',
    );
  });

  it('leerMundo lanza con todos los problemas a la vez', () => {
    const c = structuredClone(crudos('prueba')) as {
      mundo: Record<string, unknown>;
    } & CrudosDelMundo;
    c.mundo.version = 2;
    c.mundo.rivales = 3;
    expect(() => leerMundo(c, 'prueba')).toThrow(/no se puede jugar \(2 problemas\)/);
  });
});

describe('la partida de un mundo', () => {
  const leido = leerMundo(crudos('prueba'), 'prueba');

  it('pone sus lugares en el mapa y su estado en la partida', () => {
    const state = partidaDelMundo(leido);
    const lugares = state.map.objects.filter((o) => o.kind === 'lugar');
    expect(lugares.map((o) => o.id)).toEqual(['puente-de-corvo', 'pozo-de-valdesombra']);
    expect(state.mundo?.estados).toEqual({
      'puente-de-corvo': 'guardado',
      'pozo-de-valdesombra': 'quieto',
    });
    expect(state.mundo?.marcas).toEqual([]);
    expect(state.players[0]!.faction).toBe('imperio');
    expect(state.heroes.find((h) => h.owner === 0)!.tipo).toBe('duelista');
  });

  it('newGame vuelve a juzgar la historia que recibe', () => {
    const rota = structuredClone(leido.historia) as Historia & { lugares: { at: unknown }[] };
    (rota.lugares[0] as { at: unknown }).at = { x: 0, y: -1 };
    expect(() => partidaDelMundo({ ...leido, historia: rota })).toThrow(
      /la historia del mundo no se puede jugar/,
    );
  });
});

describe('la lectura para el motor', () => {
  const leido = leerMundo(crudos('prueba'), 'prueba');
  const lectura = lecturaParaElMotor(leido.mundo, leido.plan as MapPlan);

  it('cada casilla de muestra admite un lugar', () => {
    const { map } = buildMap(leido.plan as MapPlan);
    const muestras = lectura.regiones.flatMap((r) => r.admitenUnLugar);
    expect(muestras.length).toBeGreaterThan(8);
    for (const p of muestras) expect(lugarBlocker(map, p)).toBeNull();
  });

  it('dice la casa de cada jugador', () => {
    expect(
      lectura.regiones.filter((r) => r.casaDe !== null).map((r) => [r.nombre, r.casaDe]),
    ).toEqual([
      ['Tierras de Valdeluz', 0],
      ['Tierras de Cripta Gris', 1],
    ]);
  });

  it('el vocabulario dice cada clave de condición y de efecto', () => {
    expect(Object.keys(VOCABULARIO.condiciones).sort()).toEqual([...CLAVES_DE_CONDICION].sort());
    expect(Object.keys(VOCABULARIO.efectos).sort()).toEqual([...CLAVES_DE_EFECTO].sort());
  });
});

describe('elegir en un lugar', () => {
  const leido = leerMundo(crudos('prueba'), 'prueba');
  const ctx = { rng: createRng(7) };

  /** Una partida del mundo de prueba con el héroe del jugador 0 plantado en `lugar`. */
  function enElLugar(lugar: string): { state: GameState; hero: string } {
    const state = partidaDelMundo(leido);
    const hero = state.heroes.find((h) => h.owner === 0)!;
    hero.at = { ...state.mundo!.historia.lugares.find((l) => l.id === lugar)!.at };
    return { state, hero: hero.id };
  }
  const elegir = (
    state: GameState,
    hero: string,
    lugar: string,
    punto: string,
    nodo: string,
    opcion: number,
  ): AdventureAction => {
    const a: AdventureAction = { type: 'elegir_en_lugar', hero, lugar, punto, nodo, opcion };
    applyAdventureAction(state, a, ctx, 0);
    return a;
  };
  const nuevos = (state: GameState, desde: number) =>
    state.log.slice(desde).map(({ seen: _s, at: _a, ...e }) => e);

  it('coger la pieza la da, escribe sus hechos y deja la opción apagada', () => {
    const { state, hero } = enElLugar('puente-de-corvo');
    const antes = state.log.length;
    elegir(state, hero, 'puente-de-corvo', 'garita', 'dentro', 1);
    expect(nuevos(state, antes)).toEqual([
      {
        kind: 'loot_found',
        hero,
        item: 'lanza_de_jinete',
        from: 'lugar',
        lugar: 'puente-de-corvo',
        actor: 0,
      },
      { kind: 'world_mark', marca: 'lanza-cogida', lugar: 'puente-de-corvo', actor: 0 },
    ]);
    expect(state.heroes.find((h) => h.id === hero)!.mochila).toContain('lanza_de_jinete');
    const ref = { lugar: 'puente-de-corvo', punto: 'garita', nodo: 'dentro', opcion: 1 };
    expect(opcionBlocker(state, hero, ref)).toBe('ya te llevaste la lanza');
    expect(() => elegir(state, hero, 'puente-de-corvo', 'garita', 'dentro', 1)).toThrow(
      'no se puede elegir eso: ya te llevaste la lanza',
    );
  });

  it('pagar cobra, cambia el estado y quien pedía el peaje deja de estar', () => {
    const { state, hero } = enElLugar('puente-de-corvo');
    const oro = state.players[0]!.oro;
    const antes = state.log.length;
    elegir(state, hero, 'puente-de-corvo', 'corvo', 'alto', 0);
    expect(state.players[0]!.oro).toBe(oro - 300);
    expect(nuevos(state, antes).map((e) => e.kind)).toEqual([
      'gold_paid',
      'place_state',
      'world_mark',
    ]);
    expect(state.mundo!.estados['puente-de-corvo']).toBe('pagado');
    expect(
      opcionBlocker(state, hero, {
        lugar: 'puente-de-corvo',
        punto: 'corvo',
        nodo: 'alto',
        opcion: 2,
      }),
    ).toBe('«El puente del viejo Corvo» está con el peaje pagado, no guardado');
  });

  it('sin el oro, el pago sale apagado con el motivo del núcleo', () => {
    const { state, hero } = enElLugar('puente-de-corvo');
    state.players[0]!.oro = 100;
    expect(
      opcionBlocker(state, hero, {
        lugar: 'puente-de-corvo',
        punto: 'corvo',
        nodo: 'alto',
        opcion: 0,
      }),
    ).toBe('no alcanza el oro: cuesta 300 oro y tienes 100 oro');
  });

  it('fuera del lugar, o con una opción que solo navega, no se elige nada', () => {
    const { state, hero } = enElLugar('puente-de-corvo');
    expect(
      opcionBlocker(state, hero, {
        lugar: 'pozo-de-valdesombra',
        punto: 'pozo',
        nodo: 'brocal',
        opcion: 0,
      }),
    ).toMatch(/no está en «El pozo de Valdesombra»$/);
    expect(
      opcionBlocker(state, hero, {
        lugar: 'puente-de-corvo',
        punto: 'corvo',
        nodo: 'alto',
        opcion: 1,
      }),
    ).toBe('esa opción no cambia nada en la partida: es de la conversación');
  });

  it('una batalla ganada aplica «alGanar»', () => {
    const { state, hero } = enElLugar('puente-de-corvo');
    elegir(state, hero, 'puente-de-corvo', 'corvo', 'alto', 2);
    const pending = state.pendingBattle!;
    expect(pending.foe).toEqual({ kind: 'lugar', lugar: 'puente-de-corvo', encuentro: 'corvo' });
    expect(pending.battle.stacks.filter((s) => s.side === 'defender').length).toBe(3);
    for (const s of pending.battle.stacks) if (s.side === 'defender') s.count = 0;
    pending.battle.finished = { winner: 'attacker' };
    const oro = state.players[0]!.oro;
    const antes = state.log.length;
    settleBattle(state, ctx);
    expect(state.mundo!.estados['puente-de-corvo']).toBe('libre');
    expect(state.players[0]!.oro).toBe(oro + 200);
    expect(nuevos(state, antes).map((e) => e.kind)).toContain('place_state');
    expect(state.heroes.find((h) => h.id === hero)!.at).toEqual({ x: 10, y: 12 });
  });

  it('una batalla perdida aplica «alPerder», aunque el héroe vuelva a su base', () => {
    const { state, hero } = enElLugar('pozo-de-valdesombra');
    elegir(state, hero, 'pozo-de-valdesombra', 'pozo', 'brocal', 0);
    expect(state.mundo!.estados['pozo-de-valdesombra']).toBe('despierto');
    elegir(state, hero, 'pozo-de-valdesombra', 'pozo', 'brocal', 1);
    const pending = state.pendingBattle!;
    for (const s of pending.battle.stacks) if (s.side === 'attacker') s.count = 0;
    pending.battle.finished = { winner: 'defender' };
    const antes = state.log.length;
    settleBattle(state, ctx);
    expect(state.mundo!.marcas).toContain('derrota-en-el-pozo');
    expect(state.mundo!.estados['pozo-de-valdesombra']).toBe('despierto');
    expect(nuevos(state, antes).map((e) => e.kind)).toEqual([
      'battle_ended',
      'hero_defeated',
      'hero_returned',
      'garrison_taken',
      'world_mark',
    ]);
  });
});

describe('el mundo en la URL', () => {
  it('«?mundo=» abre la partida sin preguntar y no va con lo que el mundo ya trae', () => {
    expect(hayQuePreguntar('?mundo=prueba')).toBe(false);
    expect(hayQuePreguntar('?mundo=')).toBe(true);
    expect(mundoDeLaUrl('?mundo=prueba')).toBe('prueba');
    expect(mundoDeLaUrl('?seed=3')).toBeNull();
    expect(() => mundoDeLaUrl('?mundo=prueba&seed=1&heroe=x')).toThrow(
      '«?mundo=» no va con «?seed=» ni «?heroe=»: el mundo trae su semilla, su facción y su héroe. Quita esos parámetros de la barra de direcciones',
    );
    expect(() => mundoDeLaUrl('?mundo=../plan')).toThrow('no es el id de un mundo');
    expect(() => mundoDeLaUrl('?mundo=a&mundo=b')).toThrow('«mundo» va 2 veces en la URL');
  });
});

describe('la IA de reglas en un lugar', () => {
  it('elige la primera opción que hace algo, hasta que no queda ninguna, y cada premio una vez', () => {
    const leido = leerMundo(crudos('prueba'), 'prueba');
    const state = partidaDelMundo(leido, { 0: 'ai', 1: 'ai' });
    const hero = state.heroes.find((h) => h.owner === 0)!;
    hero.at = { x: 10, y: 12 };
    const elegidas: string[] = [];
    for (let n = 0; n < 20; n++) {
      const ref = jugadaEnElLugar(state, hero);
      if (ref === null) break;
      elegidas.push(`${ref.punto}/${ref.nodo}/${ref.opcion}`);
      applyAdventureAction(
        state,
        { type: 'elegir_en_lugar', hero: hero.id, ...ref },
        { rng: createRng(1) },
        0,
      );
      if (state.pendingBattle !== null) break;
    }
    // Lee la carta, coge la lanza y paga el peaje (la batalla, sin ventaja, no la abre).
    expect(elegidas).toEqual(['garita/dentro/0', 'garita/dentro/1', 'corvo/alto/0']);
    expect(new Set(elegidas).size).toBe(elegidas.length);
    expect(state.log.filter((e) => e.kind === 'loot_found').length).toBe(1);
  });
});
