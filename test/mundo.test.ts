/**
 * Un mundo (`core/mundo/`, F1a de `docs/agents/2026-10-22-mapa-vivo/`): la
 * validación que comparten `pnpm mundo validar`, el servidor de desarrollo, la
 * página y `newGame`, y lo que el mundo pone en la partida.
 *
 * Los mundos rotos son copias del de prueba con una cosa cambiada a mano: cada
 * caso mira que salga **su** frase, con su ruta, que es lo que lee el motor para
 * corregirse.
 */
import { describe, expect, it } from 'vitest';
import { marcadoDe } from '../src/client/html.js';
import { mundoDeLaUrl } from '../src/client/mundo/cargar.js';
import { hayQuePreguntar } from '../src/client/semilla.js';
import { renderLog } from '../src/client/views/panels.js';
import { jugadaEnElLugar } from '../src/core/ai/lugares.js';
import { CUPO_HEROE } from '../src/core/hero/troop.js';
import { buildMap, type MapPlan } from '../src/core/map/generate.js';
import { isEnterable } from '../src/core/map/map.js';
import {
  CLAVES_DE_CONDICION,
  CLAVES_DE_EFECTO,
  inicialDelNombre,
  lugarSiExiste,
  VOCABULARIO,
} from '../src/core/mundo/formato.js';
import { lecturaParaElMotor } from '../src/core/mundo/lectura.js';
import { partidaDelMundo } from '../src/core/mundo/partida.js';
import { anteDelHeroe, opcionBlocker, opcionesDe } from '../src/core/mundo/reglas.js';
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
import { leerCrudos } from '../tools/mundo/disco.js';

/** Los tres ficheros de un mundo, como los lee `pnpm mundo validar` (`leerCrudos`). */
async function crudosDe(id: string): Promise<CrudosDelMundo> {
  const leido = await leerCrudos(id);
  if ('problemas' in leido) throw new Error(leido.problemas.join('\n'));
  return leido.crudos;
}
const CRUDOS = { prueba: await crudosDe('prueba'), ejemplo: await crudosDe('ejemplo') };
/** Una copia de los de `id`, para tocarla sin tocar los de los demás casos. */
const crudos = (id: keyof typeof CRUDOS): CrudosDelMundo => structuredClone(CRUDOS[id]);

/** Los crudos de `prueba` con la historia cambiada por `cambio`. */
function prueba(
  cambio: (h: { lugares: Record<string, unknown>[] } & Record<string, unknown>) => void,
): CrudosDelMundo {
  const c = crudos('prueba') as {
    mundo: unknown;
    plan: unknown;
    historia: { lugares: Record<string, unknown>[] } & Record<string, unknown>;
  };
  cambio(c.historia);
  return c;
}

/** Los problemas de `prueba` con la historia cambiada por `cambio`. */
function conHistoria(
  cambio: (h: { lugares: Record<string, unknown>[] } & Record<string, unknown>) => void,
): string[] {
  return problemasDelMundo(prueba(cambio), 'prueba');
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
  it('el mundo de prueba (a mano) y el de ejemplo (del motor) no tienen problemas', () => {
    expect(problemasDelMundo(crudos('prueba'), 'prueba')).toEqual([]);
    expect(problemasDelMundo(crudos('ejemplo'), 'ejemplo')).toEqual([]);
  });

  it('un mundo de otra versión o con dos rivales se rechaza diciéndolo', () => {
    const c = crudos('prueba') as {
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

  it('lo que el plan ya sabe no se escribe en el mundo.json: la facción es la de su base', () => {
    const c = crudos('prueba') as { mundo: { jugador: Record<string, unknown> } } & CrudosDelMundo;
    c.mundo.jugador.faccion = 'imperio';
    expect(problemasDelMundo(c, 'prueba')).toEqual([
      'mundo.json: jugador: «faccion» no es un campo; valen heroe',
    ]);
    expect(leerMundo(crudos('prueba'), 'prueba').faccion).toBe('imperio');
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

  it('dos puntos con el mismo diálogo', () => {
    const p = conHistoria((h) => {
      (puente(h) as unknown as { puntos: { dialogo: string }[] }).puntos[1]!.dialogo = 'garita';
    });
    expect(p).toContainEqual(
      'historia.json: lugares[0].puntos[1].dialogo: "garita" ya es el diálogo del punto "garita": cada punto lleva el suyo',
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

  it('un lugar en el borde, en una barrera, en un recinto o pegado a un pueblo', () => {
    const plan = crudos('prueba').plan as MapPlan;
    const { map } = buildMap(plan);
    const dentro = (x: number, y: number) =>
      x > 0 && y > 0 && x < map.width - 1 && y < map.height - 1;
    const barrera = map.terrain.findIndex((_, i) => {
      const at = { x: i % map.width, y: Math.floor(i / map.width) };
      return dentro(at.x, at.y) && !isEnterable(map, at);
    });
    const enBarrera = { x: barrera % map.width, y: Math.floor(barrera / map.width) };
    const base = plan.towns.find((t) => t.owner === 0)!.at;
    // Una casilla a dos de un pueblo que no caiga en el borde ni en una barrera.
    const pegado = plan.villages
      .flatMap((v) =>
        [
          [0, -2],
          [0, 2],
          [-2, 0],
          [2, 0],
        ].map(([dx, dy]) => ({ x: v.at.x + (dx as number), y: v.at.y + (dy as number) })),
      )
      .find((at) => / del pueblo /.test(lugarBlocker(map, at) ?? ''))!;
    const enLaMuralla = { x: base.x, y: base.y - 1 };

    const en = (at: { x: number; y: number }) =>
      conHistoria((h) => {
        puente(h).at = at;
      });
    // Ninguna casilla del borde, aunque se pise (el motor recibía (0, 0) de muestra).
    for (const borde of [
      { x: 0, y: 0 },
      { x: 5, y: map.height - 1 },
      { x: map.width - 1, y: 9 },
    ]) {
      expect(lugarBlocker(map, borde)).toBe(
        `(${borde.x}, ${borde.y}) está en el borde del mapa: un lugar va a una casilla del borde o más`,
      );
    }
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
    const c = crudos('prueba') as {
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
});

describe('la lectura para el motor', () => {
  const leido = leerMundo(crudos('prueba'), 'prueba');
  const lectura = lecturaParaElMotor(leido.mundo, leido.plan);

  it('la facción de quien juega sale del plan', () => {
    expect(lectura.jugador).toMatchObject({ id: 0, faccion: 'imperio', heroe: 'duelista' });
  });

  it('dice con qué tropa sale el héroe y cuánta le cabe, la de la partida', () => {
    const hero = partidaDelMundo(leido).heroes.find((h) => h.owner === 0)!;
    const t = lectura.jugador.tropa;
    expect(t.individuos).toBe(hero.army.length);
    expect(t.lleva.reduce((n, x) => n + x.n, 0)).toBe(hero.army.length);
    expect(t.cupo).toBe(CUPO_HEROE);
    // En `prueba` le cabe uno más (5 de 6, 17 de 20), y el motor lo lee.
    expect(t.nota).toContain('le caben 1 más y 3 de liderazgo');
  });

  it('cada casilla de muestra admite un lugar', () => {
    const { map } = buildMap(leido.plan);
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

  it('lo de un nodo al que no se llega ahora no se elige, aunque se nombre', () => {
    // «Tu capitán murió» (`alto`, sin «hace») es lo único que lleva a «muerto»: con
    // un «si» de otra facción, a «muerto» no se llega y enseñarle la carta no se
    // cobra mandando la acción sin pasar por ahí (otro cliente, el agente en F4).
    const conLaPuerta = leerMundo(
      prueba((h) => {
        puente(h).dialogos.corvo!.nodos.alto!.opciones[1]!.si = [{ faccion: 'orkos' }];
      }),
      'prueba',
    );
    const ref = { lugar: 'puente-de-corvo', punto: 'corvo', nodo: 'muerto', opcion: 0 };
    for (const [mundo, motivo] of [
      [
        conLaPuerta,
        'a esa parte de la conversación con Corvo no se llega ahora: lo que lleva hasta ella no se cumple',
      ],
      [leido, null],
    ] as const) {
      const state = partidaDelMundo(mundo);
      const hero = state.heroes.find((h) => h.owner === 0)!;
      hero.at = { x: 10, y: 12 };
      state.mundo!.marcas.push('carta-leida');
      expect(opcionBlocker(state, hero.id, ref)).toBe(motivo);
    }
    const state = partidaDelMundo(conLaPuerta);
    const hero = state.heroes.find((h) => h.owner === 0)!;
    hero.at = { x: 10, y: 12 };
    state.mundo!.marcas.push('carta-leida');
    expect(() => elegir(state, hero.id, 'puente-de-corvo', 'corvo', 'muerto', 0)).toThrow(
      'no se puede elegir eso: a esa parte de la conversación con Corvo no se llega ahora',
    );
    expect(state.mundo!.estados['puente-de-corvo']).toBe('guardado');
    // Y la pantalla dice lo mismo: la opción sale apagada con ese motivo, no
    // encendida y muda (H2 del QA de la F1a).
    const a = anteDelHeroe(state, hero.id);
    if ('motivo' in a) throw new Error(a.motivo);
    const corvo = a.lugar.puntos.find((p) => p.id === 'corvo')!;
    expect(opcionesDe(a, corvo, 'muerto')[0]!.motivo).toMatch(
      /^a esa parte de la conversación con Corvo no se llega ahora/,
    );
  });

  /**
   * El pozo con dos cosas más, de los ejemplos del QA de la F1a: una opción que da
   * oro y otra sin premio que la vuelve a encender (H1), otra que vuelve a despertar
   * el pozo ya limpio, y una cuerda con una opción que marca e `ir fondo` y otra sin
   * efectos que también va allí, y en el fondo un premio (H2). Las tres validan.
   */
  const conElPozoDelQA = leerMundo(
    prueba((h) => {
      h.marcas = {
        ...(h.marcas as Record<string, unknown>),
        bajado: { falta: 'aún no has bajado', ya: 'ya bajaste por la cuerda' },
        subido: { falta: 'aún no has subido el cubo', ya: 'el cubo ya está arriba' },
      };
      const pozo = h.lugares[1] as unknown as {
        puntos: Record<string, unknown>[];
        dialogos: Record<string, unknown>;
      };
      (
        pozo.dialogos.pozo as { nodos: Record<string, { opciones: unknown[] }> }
      ).nodos.brocal!.opciones.push(
        {
          texto: 'Rebuscar',
          si: [{ estado: 'quieto' }],
          hace: [{ oro: 100 }, { estado: 'despierto' }],
        },
        { texto: 'Esperar', si: [{ estado: 'despierto' }], hace: [{ estado: 'quieto' }] },
        { texto: 'Gritar al fondo', si: [{ estado: 'limpio' }], hace: [{ estado: 'despierto' }] },
      );
      pozo.puntos.push({ id: 'cuerda', x: 0.85, cosa: { nombre: 'La cuerda' }, dialogo: 'cuerda' });
      pozo.dialogos.cuerda = {
        inicio: 'arriba',
        nodos: {
          arriba: {
            texto: 'Una cuerda baja al fondo.',
            opciones: [
              {
                texto: 'Bajar y marcar el sitio',
                si: [{ no: { marca: 'bajado' } }],
                hace: [{ marca: 'bajado' }],
                ir: 'fondo',
              },
              { texto: 'Bajar sin más', si: [{ no: { marca: 'bajado' } }], ir: 'fondo' },
              { texto: 'Dejarla' },
            ],
          },
          fondo: {
            texto: 'Abajo hay un cubo.',
            opciones: [
              {
                texto: 'Subir el cubo',
                si: [{ no: { marca: 'subido' } }],
                hace: [{ oro: 50 }, { marca: 'subido' }],
              },
              { texto: 'Salir' },
            ],
          },
        },
      };
    }),
    'prueba',
  );
  /** Una partida de `conElPozoDelQA` con el héroe del jugador 0 en el pozo. */
  function enElPozoDelQA(): { state: GameState; hero: string } {
    const state = partidaDelMundo(conElPozoDelQA);
    const hero = state.heroes.find((h) => h.owner === 0)!;
    hero.at = { x: 16, y: 13 };
    return { state, hero: hero.id };
  }
  const POZO = 'pozo-de-valdesombra';

  it('cada premio se cobra una vez, aunque otra opción vuelva a encender la suya (H1 del QA)', () => {
    const { state, hero } = enElPozoDelQA();
    const oro = state.players[0]!.oro;
    elegir(state, hero, POZO, 'pozo', 'brocal', 3);
    elegir(state, hero, POZO, 'pozo', 'brocal', 4);
    expect(state.mundo!.estados[POZO]).toBe('quieto');
    const ref = { lugar: POZO, punto: 'pozo', nodo: 'brocal', opcion: 3 };
    expect(opcionBlocker(state, hero, ref)).toBe('ya te llevaste 100 oro de aquí');
    expect(() => elegir(state, hero, POZO, 'pozo', 'brocal', 3)).toThrow(
      'no se puede elegir eso: ya te llevaste 100 oro de aquí',
    );
    expect(state.players[0]!.oro).toBe(oro + 100);
    const a = anteDelHeroe(state, hero);
    if ('motivo' in a) throw new Error(a.motivo);
    expect(opcionesDe(a, a.lugar.puntos[0]!, 'brocal')[3]!.motivo).toBe(
      'ya te llevaste 100 oro de aquí',
    );
  });

  it('un encuentro ganado no se vuelve a pelear, aunque el lugar vuelva a su estado', () => {
    const { state, hero } = enElPozoDelQA();
    elegir(state, hero, POZO, 'pozo', 'brocal', 0);
    elegir(state, hero, POZO, 'pozo', 'brocal', 1);
    const pending = state.pendingBattle!;
    for (const s of pending.battle.stacks) if (s.side === 'defender') s.count = 0;
    pending.battle.finished = { winner: 'attacker' };
    settleBattle(state, ctx);
    expect(state.mundo!.estados[POZO]).toBe('limpio');
    elegir(state, hero, POZO, 'pozo', 'brocal', 5);
    expect(state.mundo!.estados[POZO]).toBe('despierto');
    expect(
      opcionBlocker(state, hero, { lugar: POZO, punto: 'pozo', nodo: 'brocal', opcion: 1 }),
    ).toBe('ya venciste a «Los ahogados del pozo»');
  });

  it('tras una opción que hace algo e «ir», lo de su nodo se elige (H2 del QA)', () => {
    const { state, hero } = enElPozoDelQA();
    const oro = state.players[0]!.oro;
    elegir(state, hero, POZO, 'cuerda', 'arriba', 0);
    // «Bajar sin más» ya no se cumple: al fondo se llega porque ahí quedó la conversación.
    const ref = { lugar: POZO, punto: 'cuerda', nodo: 'fondo', opcion: 0 };
    expect(opcionBlocker(state, hero, ref)).toBeNull();
    const a = anteDelHeroe(state, hero);
    if ('motivo' in a) throw new Error(a.motivo);
    const cuerda = a.lugar.puntos.find((p) => p.id === 'cuerda')!;
    expect(opcionesDe(a, cuerda, 'fondo')[0]!.motivo).toBeNull();
    elegir(state, hero, POZO, 'cuerda', 'fondo', 0);
    expect(state.players[0]!.oro).toBe(oro + 50);
    expect(state.mundo!.conversaciones).toEqual({});
  });

  it('con el héroe del rival, «ese héroe no es tuyo» (no «no es tu turno»)', () => {
    const { state } = enElLugar('puente-de-corvo');
    const rival = state.heroes.find((h) => h.owner === 1)!;
    rival.at = { x: 10, y: 12 };
    expect(() => elegir(state, rival.id, 'puente-de-corvo', 'garita', 'dentro', 1)).toThrow(
      'no se puede elegir eso: ese héroe no es tuyo',
    );
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

  it('la crónica nombra el lugar y el encuentro, no su casilla', () => {
    const { state, hero } = enElLugar('pozo-de-valdesombra');
    elegir(state, hero, 'pozo-de-valdesombra', 'pozo', 'brocal', 0);
    elegir(state, hero, 'pozo-de-valdesombra', 'pozo', 'brocal', 1);
    const pending = state.pendingBattle!;
    for (const s of pending.battle.stacks) if (s.side === 'defender') s.count = 0;
    pending.battle.finished = { winner: 'attacker' };
    settleBattle(state, ctx);
    const texto = marcadoDe(
      renderLog(state.log, 0, (id) => lugarSiExiste(state.mundo!.historia, id)),
    );
    expect(texto).toContain('+150 de oro en\u00a0«El pozo de Valdesombra»');
    expect(texto).toContain(
      'Batalla ganada contra «Los ahogados del pozo» en\u00a0«El pozo de Valdesombra»',
    );
    expect(texto).toContain('Botín de «El pozo de Valdesombra»: Gambesón');
    expect(texto).not.toMatch(/en\u00a0\(16,\u00a013\)/);
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

describe('la inicial de un lugar o de una cosa', () => {
  it('es la de su primera palabra que no es un artículo', () => {
    expect(inicialDelNombre('El osario del viejo amo')).toBe('O');
    expect(inicialDelNombre('La ermita del Cierzo')).toBe('E');
    expect(inicialDelNombre('El campamento de Grashnak')).toBe('C');
    expect(inicialDelNombre('Corvo')).toBe('C');
    expect(inicialDelNombre('«Las» uñas')).toBe('U');
    expect(inicialDelNombre('Los')).toBe('');
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
