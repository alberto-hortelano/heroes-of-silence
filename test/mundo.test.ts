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
import { join } from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { marcadoDe } from '../src/client/comun/html.js';
import { hayQuePreguntar } from '../src/client/comun/semilla.js';
import { cargarElMundoPedido, mundoDeLaUrl, mundoPedido } from '../src/client/partida/mundo.js';
import { renderLog } from '../src/client/views/cronica.js';
import { buildMap } from '../src/core/map/generar/construir.js';
import type { MapPlan } from '../src/core/map/generar/plan.js';
import { basesDelPlan } from '../src/core/map/generar/validar.js';
import { isEnterable, reachableFrom } from '../src/core/map/map.js';
import { regionDeCasilla } from '../src/core/map/regiones.js';
import { regionesTrasUnaBase } from '../src/core/map/territorio.js';
import {
  CLAVES_DE_CONDICION,
  CLAVES_DE_EFECTO,
  inicialDelNombre,
  lugaresDelPlan,
  lugarSiExiste,
  VOCABULARIO,
} from '../src/core/mundo/formato.js';
import { lecturaParaElMotor } from '../src/core/mundo/lectura.js';
import { mundoNuevo, partidaDelMundo } from '../src/core/mundo/partida.js';
import {
  anteDelHeroe,
  nodoDeEntrada,
  opcionBlocker,
  opcionesDe,
  puntosDe,
} from '../src/core/mundo/reglas.js';
import {
  type CrudosDelMundo,
  leerMundo,
  lugarBlocker,
  problemasDelMundo,
} from '../src/core/mundo/validar.js';
import { createRng } from '../src/core/rng.js';
import { settleBattle } from '../src/core/state/cierre.js';
import { applyAdventureAction } from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import type { AdventureAction, GameState } from '../src/core/state/tipos.js';
import { NOMBRE_DE_FACCION } from '../src/core/types.js';
import { leerCrudos, validarEnDisco } from '../tools/mundo/disco.js';
import { medirMundo } from '../tools/mundo/medida.js';
import { leerBancoDeDisco } from '../tools/npcs/banco.js';
import { RAIZ } from './comun.js';
import { itLento, rango } from './lento.js';

/** El banco de figuras de NPC del repo: contra él se miran las figuras de los mundos. */
const BANCO = leerBancoDeDisco();

/** Los tres JSON de un mundo, como los lee `pnpm mundo validar` (`leerCrudos`). */
async function crudosDe(id: string): Promise<CrudosDelMundo> {
  const leido = await leerCrudos(id);
  if ('sinMundo' in leido) throw new Error(leido.sinMundo);
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
  return problemasDelMundo(prueba(cambio), 'prueba', BANCO);
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

/**
 * El peaje de Corvo con un arcón detrás (H14 de la vuelta 2 de QA): pagar lleva a
 * «gracias», y allí «Abrir el arcón» da 500. `delPunto`: Corvo sigue con su «si»
 * de siempre (`estado guardado`, que el pago apaga); sin él, sus opciones se apagan
 * con su propio «si». `siDelArcon`: lo que pide el arcón.
 */
function conElArcon(
  h: { lugares: Record<string, unknown>[] },
  { delPunto = false, siDelArcon = [{ estado: 'pagado' }] as unknown[] } = {},
): void {
  const l = h.lugares[0] as unknown as { puntos: Record<string, unknown>[] };
  const corvo = l.puntos.find((p) => p.id === 'corvo')!;
  if (!delPunto) {
    delete corvo.si;
    const nodos = puente(h).dialogos.corvo!.nodos;
    nodos.alto!.opciones[2]!.si = [{ estado: 'guardado' }];
    nodos.muerto!.opciones[0]!.si = [{ marca: 'carta-leida' }, { estado: 'guardado' }];
  }
  puente(h).dialogos.corvo!.nodos.gracias!.opciones = [
    { texto: 'Abrir el arcón', si: siDelArcon, hace: [{ oro: 500 }, { estado: 'libre' }] },
    { texto: 'Seguir' },
  ];
}

describe('la validación de un mundo', () => {
  // «ejemplo» (del motor) no se mira aquí: lleva asaltantes y encuentros cuya fuerza sale del
  // catálogo, y un retoque válido del catálogo lo deja sin valer (03-11-2026); lo dice
  // «pnpm mundo validar ejemplo». «prueba» es del test.
  it('el mundo de prueba (a mano) no tiene problemas', () => {
    expect(problemasDelMundo(crudos('prueba'), 'prueba', BANCO)).toEqual([]);
  });

  it('un mundo de otra versión o con dos rivales se rechaza diciéndolo', () => {
    const c = crudos('prueba') as {
      mundo: Record<string, unknown>;
    } & CrudosDelMundo;
    c.mundo.version = 2;
    c.mundo.rivales = 2;
    const p = problemasDelMundo(c, 'prueba', BANCO);
    expect(p).toContainEqual(
      expect.stringContaining('mundo.json: version: es 2 y este juego lee la 1'),
    );
    expect(p).toContainEqual(expect.stringContaining('mundo.json: rivales: es 2'));
  });

  it('el id de la carpeta y el del mundo tienen que coincidir', () => {
    expect(problemasDelMundo(crudos('prueba'), 'otro', BANCO)).toContainEqual(
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
    expect(problemasDelMundo(c, 'prueba', BANCO)).toEqual([
      'mundo.json: jugador: «faccion» no es un campo; valen heroe',
    ]);
    expect(leerMundo(crudos('prueba'), 'prueba', BANCO).faccion).toBe('imperio');
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

  it('una opción que da algo y no se apaga a sí misma', () => {
    const p = conHistoria((h) => {
      puente(h).dialogos.garita!.nodos.dentro!.opciones[1] = {
        texto: 'Coger la lanza',
        hace: [{ pieza: 'lanza' }],
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

  it('una opción con «ir» que corta su propio camino (H14 de la vuelta 2)', () => {
    // El arcón tras el peaje, con Corvo sin «si» y el arcón pidiendo «pagado»: vale.
    expect(conHistoria((h) => conElArcon(h))).toEqual([]);
    // Con Corvo en «si: guardado», pagar le saca de la escena y el arcón se pierde.
    expect(conHistoria((h) => conElArcon(h, { delPunto: true }))).toContainEqual(
      'historia.json: lugares[0].dialogos.corvo.nodos.alto.opciones[0]: lleva a «gracias», pero sus efectos sacan de la escena a su punto (deja de cumplirse {"estado":"guardado"}, de su «si») y lo que hay tras ella ya no se elegiría nunca («Abrir el arcón»): quítale el «ir», llévala a un nodo de despedida sin opciones con «hace» o no cambies lo que pide el punto',
    );
    // Y un arcón que pide lo que el pago quita, solo detrás del pago.
    expect(
      conHistoria((h) => conElArcon(h, { siDelArcon: [{ estado: 'guardado' }] })),
    ).toContainEqual(
      'historia.json: lugares[0].dialogos.corvo.nodos.gracias.opciones[0]: pide {"estado":"guardado"}, y solo se llega a ella tras «Pagar el peaje (300 de oro)», que lo deja de cumplir: no se elegiría nunca',
    );
  });

  it('leerMundo lanza con todos los problemas a la vez', () => {
    const c = crudos('prueba') as {
      mundo: Record<string, unknown>;
    } & CrudosDelMundo;
    c.mundo.version = 2;
    c.mundo.rivales = 3;
    expect(() => leerMundo(c, 'prueba', BANCO)).toThrow(/no se puede jugar \(2 problemas\)/);
  });
});

describe('la partida de un mundo', () => {
  const leido = leerMundo(crudos('prueba'), 'prueba', BANCO);

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
  const leido = leerMundo(crudos('prueba'), 'prueba', BANCO);
  const lectura = lecturaParaElMotor(leido.mundo, leido.plan, BANCO);

  it('la facción de quien juega sale del plan', () => {
    expect(lectura.jugador).toMatchObject({ id: 0, faccion: 'imperio', heroe: 'duelista' });
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

  it('dice cuántos lugares lleva el mundo: los de su tamaño', () => {
    expect(lectura.lugares).toEqual({ de: 4, a: 5 });
    expect(lugaresDelPlan(10)).toEqual({ de: 5, a: 6 });
    expect(lugaresDelPlan(14)).toEqual({ de: 6, a: 8 });
    expect(() => lugaresDelPlan(9)).toThrow(
      'el plan tiene 9 regiones: ningún tamaño del menú (4, 5, 7 por bando, el doble en el plan)',
    );
  });

  it('el vocabulario dice cada clave de condición y de efecto', () => {
    expect(Object.keys(VOCABULARIO.condiciones).sort()).toEqual([...CLAVES_DE_CONDICION].sort());
    expect(Object.keys(VOCABULARIO.efectos).sort()).toEqual([...CLAVES_DE_EFECTO].sort());
  });
});

/**
 * Un lugar tras la base del otro (#321, 11-11-2026): en 7 de 120 mapas del
 * procedimental (tamaños 4, 5 y 7, semillas 1-40) la casa de un bando es un
 * callejón cuyo único nodo es su base, y tomarla acaba la partida: el otro no la
 * pisa nunca. r4 s12 (36 × 36) es uno: bases en (8, 8) y (27, 27), y sus casas,
 * `region-0` y `region-1`.
 */
describe('un lugar tras la base del otro (#321)', () => {
  const pedido = { id: 'prueba', semilla: 12, faccion: 'imperio', regionesPorBando: 4 } as const;
  const { mundo, plan } = mundoNuevo(pedido);
  const { map } = buildMap(plan);

  /** Los problemas de la historia de `prueba` en el mundo r4 s12, con su primer lugar en `at`. */
  const conElPrimeroEn = (at: { x: number; y: number }): string[] => {
    const c = prueba((h) => {
      puente(h).at = at;
    }) as { mundo: unknown; plan: unknown; historia: unknown };
    return problemasDelMundo({ ...c, mundo, plan }, 'prueba', BANCO);
  };

  it('lo rechaza la validación del mundo, diciendo quién no llega y por qué base', () => {
    expect(conElPrimeroEn({ x: 34, y: 22 })).toContainEqual(
      'historia.json: lugares[0].at: (34, 22) está en la región "region-1", a la que el jugador 0 solo llega cruzando la base del otro, la ciudad town-1 en (27, 27), o infiltrándose por la barrera, con un héroe que sepa y días de marcha; tomar la base acaba la partida: el mundo es de los dos, pon el lugar en una región a la que lleguen los dos',
    );
    expect(conElPrimeroEn({ x: 1, y: 1 })).toContainEqual(
      'historia.json: lugares[0].at: (1, 1) está en la región "region-0", a la que el jugador 1 solo llega cruzando la base del otro, la ciudad town-0 en (8, 8), o infiltrándose por la barrera, con un héroe que sepa y días de marcha; tomar la base acaba la partida: el mundo es de los dos, pon el lugar en una región a la que lleguen los dos',
    );
  });

  it('las regiones tras una base: las dos casas en r4 s12, ninguna en el mundo de prueba', () => {
    const tras = regionesTrasUnaBase(map, basesDelPlan(plan));
    expect([...tras].map(([r, t]) => [map.regions[r]!.id, t.jugador, t.base]).sort()).toEqual([
      ['region-0', 1, 'town-0'],
      ['region-1', 0, 'town-1'],
    ]);
    const dePrueba = crudos('prueba').plan as MapPlan;
    expect(regionesTrasUnaBase(buildMap(dePrueba).map, basesDelPlan(dePrueba)).size).toBe(0);
  });

  it('la lectura no ofrece casillas en esas casas', () => {
    const lectura = lecturaParaElMotor(mundo, plan, BANCO);
    const casas = lectura.regiones.filter((r) => r.id === 'region-0' || r.id === 'region-1');
    expect(casas.map((r) => [r.id, r.casaDe, r.admitenUnLugar])).toEqual([
      ['region-0', 0, []],
      ['region-1', 1, []],
    ]);
    // Y las demás sí traen muestras: no se ha vaciado el mapa entero.
    expect(lectura.regiones.flatMap((r) => r.admitenUnLugar).length).toBeGreaterThan(8);
  });

  /**
   * La comprobación independiente, sin `lugarBlocker` por dentro: el Dijkstra de
   * la partida desde cada héroe de salida, con el héroe rival (que empieza en su
   * base) como hostil. Toda casilla que admite un lugar la alcanzan los dos, y toda
   * la que se rechaza por la base, no la alcanza el jugador que dice el motivo.
   */
  const alcanceExacto = (semilla: number, regionesPorBando: 4 | 5 | 7): number => {
    const p = mundoNuevo({ ...pedido, semilla, regionesPorBando }).plan;
    const state = newGame({ seed: semilla, plan: p });
    const alcance = new Map(
      state.heroes.map((h) => {
        const rival = state.heroes.filter((o) => o.owner !== h.owner).map((o) => o.at);
        return [h.owner, reachableFrom(state.map, h.at, rival).costes] as const;
      }),
    );
    const llega = (j: number, i: number) => (alcance.get(j)![i] as number) >= 0;
    let rechazadas = 0;
    for (let i = 0; i < state.map.width * state.map.height; i++) {
      const at = { x: i % state.map.width, y: Math.floor(i / state.map.width) };
      const motivo = lugarBlocker(state.map, at);
      const donde = `r${regionesPorBando} s${semilla} (${at.x}, ${at.y}) ${motivo ?? ''}`;
      if (motivo === null) {
        expect([llega(0, i), llega(1, i)], donde).toEqual([true, true]);
      } else if (/solo llega cruzando la base/.test(motivo)) {
        rechazadas++;
        const j = Number(/el jugador (\d+) solo llega/.exec(motivo)![1]);
        expect(llega(j, i), donde).toBe(false);
        expect(regionDeCasilla(state.map, at)).toBeGreaterThanOrEqual(0);
      }
    }
    return rechazadas;
  };

  it('es exacto contra el Dijkstra de la partida en r4 s12, y no muerde en r4 s1', () => {
    expect(alcanceExacto(12, 4)).toBe(124);
    expect(alcanceExacto(1, 4)).toBe(0);
  });

  itLento('es exacto contra el Dijkstra en los tamaños 4, 5 y 7, semillas 1-40', () => {
    const conRechazo: string[] = [];
    for (const r of [4, 5, 7] as const) {
      for (const s of rango(1, 40)) if (alcanceExacto(s, r) > 0) conRechazo.push(`r${r} s${s}`);
    }
    expect(conRechazo).toEqual([
      'r4 s12',
      'r4 s22',
      'r5 s38',
      'r7 s10',
      'r7 s20',
      'r7 s27',
      'r7 s39',
    ]);
  });
});

describe('elegir en un lugar', () => {
  const leido = leerMundo(crudos('prueba'), 'prueba', BANCO);
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
        item: 'lanza',
        from: 'lugar',
        lugar: 'puente-de-corvo',
        actor: 0,
      },
      { kind: 'world_mark', marca: 'lanza-cogida', lugar: 'puente-de-corvo', actor: 0 },
    ]);
    expect(state.heroes.find((h) => h.id === hero)!.mochila).toContain('lanza');
    const ref = { lugar: 'puente-de-corvo', punto: 'garita', nodo: 'dentro', opcion: 1 };
    expect(opcionBlocker(state, hero, ref)).toBe('la lanza ya no cuelga en la garita');
    expect(() => elegir(state, hero, 'puente-de-corvo', 'garita', 'dentro', 1)).toThrow(
      'no se puede elegir eso: la lanza ya no cuelga en la garita',
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
      BANCO,
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
    BANCO,
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

  /** El héroe de cada jugador en el puente de Corvo, y el turno de `turno`. */
  function losDosEnElPuente(mundo: typeof leido, turno = 0) {
    const state = partidaDelMundo(mundo);
    const [yo, rival] = [0, 1].map((o) => state.heroes.find((h) => h.owner === o)!);
    for (const h of [yo!, rival!]) h.at = { x: 10, y: 12 };
    state.current = turno;
    return { state, yo: yo!, rival: rival! };
  }
  const elegirComo = (state: GameState, jugador: number, hero: string, nodo: string, i: number) =>
    applyAdventureAction(
      state,
      { type: 'elegir_en_lugar', hero, lugar: 'puente-de-corvo', punto: 'corvo', nodo, opcion: i },
      ctx,
      jugador,
    );
  const ARCON = { lugar: 'puente-de-corvo', punto: 'corvo', nodo: 'gracias', opcion: 0 };
  const corvoDe = (state: GameState, hero: string) => {
    const a = anteDelHeroe(state, hero);
    if ('motivo' in a) throw new Error(a.motivo);
    return { a, corvo: a.lugar.puntos.find((p) => p.id === 'corvo')! };
  };

  it('pagado el peaje con «ir», la conversación se abre donde quedó, la de cada jugador (H14, M2)', () => {
    const conArcon = leerMundo(
      prueba((h) => conElArcon(h)),
      'prueba',
      BANCO,
    );
    const { state, yo, rival } = losDosEnElPuente(conArcon);
    expect(nodoDeEntrada(corvoDe(state, yo.id).a, corvoDe(state, yo.id).corvo)).toBe('alto');
    elegirComo(state, 0, yo.id, 'alto', 0);
    // Se va y vuelve (la pantalla abre por `nodoDeEntrada`): sigue ante el arcón.
    const { a, corvo } = corvoDe(state, yo.id);
    expect(nodoDeEntrada(a, corvo)).toBe('gracias');
    expect(opcionesDe(a, corvo, 'gracias')[0]!.motivo).toBeNull();
    // El rival no ha pagado: para él la conversación empieza en el inicio y el
    // arcón no se le abre por el peaje del otro.
    state.current = 1;
    const delRival = corvoDe(state, rival.id);
    expect(nodoDeEntrada(delRival.a, delRival.corvo)).toBe('alto');
    expect(opcionBlocker(state, rival.id, ARCON)).toBe(
      'a esa parte de la conversación con Corvo no se llega ahora: lo que lleva hasta ella no se cumple',
    );
    state.current = 0;
    const oro = state.players[0]!.oro;
    elegirComo(state, 0, yo.id, 'gracias', 0);
    expect(state.players[0]!.oro).toBe(oro + 500);
    expect(state.mundo!.conversaciones).toEqual({});
  });

  /**
   * Quién puso la marca (#283, 11-11-2026): si el rival cerró una opción con su
   * marca, a quien juega se le dice que fue él, delante de la frase «ya» del mundo,
   * como con lo que se llevó; si la puso quien pregunta, la frase sola. Leer la carta
   * no es un premio: lo que la apaga es la condición escrita.
   */
  it('una opción apagada por una marca del rival dice quién la puso; la propia, la frase sola', () => {
    const { state, yo, rival } = losDosEnElPuente(leido, 1);
    const CARTA = { lugar: 'puente-de-corvo', punto: 'garita', nodo: 'dentro', opcion: 0 };
    const enLaGarita = (jugador: number, hero: string) =>
      applyAdventureAction(state, { type: 'elegir_en_lugar', hero, ...CARTA }, ctx, jugador);
    enLaGarita(1, rival.id);
    expect(state.mundo!.quienPuso['carta-leida']).toEqual({ jugador: 1, heroe: rival.name });
    const faccion = NOMBRE_DE_FACCION[state.players[1]!.faction];
    const delRival = `${rival.name} (${faccion}) pasó antes: la carta del capitán ya está abierta`;
    state.current = 0;
    expect(opcionBlocker(state, yo.id, CARTA)).toBe(delRival);
    // La pantalla lo dice igual, y la acción lanza con eso mismo.
    const a = anteDelHeroe(state, yo.id);
    if ('motivo' in a) throw new Error(a.motivo);
    const garita = a.lugar.puntos.find((p) => p.id === 'garita')!;
    expect(opcionesDe(a, garita, 'dentro')[0]!.motivo).toBe(delRival);
    expect(() => enLaGarita(0, yo.id)).toThrow(`no se puede elegir eso: ${delRival}`);
    // Para quien la puso, la frase del mundo, sin su propio nombre delante.
    state.current = 1;
    expect(opcionBlocker(state, rival.id, CARTA)).toBe('la carta del capitán ya está abierta');
  });

  it('una marca de «alPerder» no tiene héroe: la frase dice la facción del otro, sin lanzar', () => {
    const conLaDerrota = leerMundo(
      prueba((h) => {
        const puente = h.lugares[0] as unknown as {
          dialogos: Record<string, { nodos: Record<string, { opciones: { si?: unknown[] }[] }> }>;
        };
        puente.dialogos.garita!.nodos.dentro!.opciones[0]!.si = [
          { no: { marca: 'derrota-en-el-pozo' } },
        ];
      }),
      'prueba',
      BANCO,
    );
    const state = partidaDelMundo(conLaDerrota);
    const [yo, rival] = [0, 1].map((o) => state.heroes.find((h) => h.owner === o)!);
    rival!.at = { x: 16, y: 13 };
    state.current = 1;
    const enElPozo = (nodo: string, opcion: number) =>
      applyAdventureAction(
        state,
        {
          type: 'elegir_en_lugar',
          hero: rival!.id,
          lugar: 'pozo-de-valdesombra',
          punto: 'pozo',
          nodo,
          opcion,
        },
        ctx,
        1,
      );
    enElPozo('brocal', 0);
    enElPozo('brocal', 1);
    const pending = state.pendingBattle!;
    for (const s of pending.battle.stacks) if (s.side === 'attacker') s.count = 0;
    pending.battle.finished = { winner: 'defender' };
    settleBattle(state, ctx);
    expect(state.mundo!.quienPuso['derrota-en-el-pozo']).toEqual({ jugador: 1, heroe: null });
    state.current = 0;
    yo!.at = { x: 10, y: 12 };
    const faccion = NOMBRE_DE_FACCION[state.players[1]!.faction];
    expect(
      opcionBlocker(state, yo!.id, {
        lugar: 'puente-de-corvo',
        punto: 'garita',
        nodo: 'dentro',
        opcion: 0,
      }),
    ).toBe(`el rival (${faccion}) pasó antes: lo del pozo ya ha vencido a alguien`);
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
    expect(pending.foe).toEqual({
      kind: 'lugar',
      lugar: 'puente-de-corvo',
      encuentro: 'corvo',
      opcion: { punto: 'corvo', nodo: 'alto', opcion: 2 },
    });
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

  it('con un tope de tropa menor, el encuentro pelea recortado a él, como todo lo neutral', () => {
    // Los ahogados del pozo son 4: con tope 3, sin recortar, `createBattle` lanzaba
    // «no caben» al abrir la batalla (fusión de la complejidad del combate con el
    // mapa vivo, 22-10-2026).
    const state = partidaDelMundo(leido, undefined, undefined, { tope: 3, rueda: 7 });
    const h = state.heroes.find((x) => x.owner === 0)!;
    h.at = { ...state.mundo!.historia.lugares.find((l) => l.id === 'pozo-de-valdesombra')!.at };
    elegir(state, h.id, 'pozo-de-valdesombra', 'pozo', 'brocal', 0);
    elegir(state, h.id, 'pozo-de-valdesombra', 'pozo', 'brocal', 1);
    const defensores = state.pendingBattle!.battle.stacks.filter((x) => x.side === 'defender');
    expect(defensores.length).toBe(3);
    // Con el de siempre, los cuatro.
    const { state: entero, hero } = enElLugar('pozo-de-valdesombra');
    elegir(entero, hero, 'pozo-de-valdesombra', 'pozo', 'brocal', 0);
    elegir(entero, hero, 'pozo-de-valdesombra', 'pozo', 'brocal', 1);
    expect(entero.pendingBattle!.battle.stacks.filter((x) => x.side === 'defender').length).toBe(4);
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
      renderLog(state.log, 0, { lugarDe: (id) => lugarSiExiste(state.mundo!.historia, id) }),
    );
    expect(texto).toContain('+150 de oro en\u00a0«El pozo de Valdesombra»');
    expect(texto).toContain(
      'Batalla ganada contra «Los ahogados del pozo» en\u00a0«El pozo de Valdesombra»',
    );
    expect(texto).toContain('Botín de «El pozo de Valdesombra»: Gambesón');
    expect(texto).not.toMatch(/en\u00a0\(16,\u00a013\)/);
  });

  it('una opción con batalla da lo suyo al ganarla, entera; perderla deja volver (M1 de la vuelta 2)', () => {
    const conPremio = leerMundo(
      prueba((h) => {
        const pozo = h.lugares[1] as unknown as {
          dialogos: Record<
            string,
            { nodos: Record<string, { opciones: Record<string, unknown>[] }> }
          >;
        };
        pozo.dialogos.pozo!.nodos.brocal!.opciones[1]!.hace = [
          { oro: 100 },
          { batalla: 'ahogados' },
        ];
      }),
      'prueba',
      BANCO,
    );
    const state = partidaDelMundo(conPremio);
    const hero = state.heroes.find((h) => h.owner === 0)!;
    hero.at = { x: 16, y: 13 };
    const bajar = { lugar: 'pozo-de-valdesombra', punto: 'pozo', nodo: 'brocal', opcion: 1 };
    const pelear = (gana: boolean) => {
      applyAdventureAction(state, { type: 'elegir_en_lugar', hero: hero.id, ...bajar }, ctx, 0);
      const pending = state.pendingBattle!;
      for (const s of pending.battle.stacks)
        if (s.side === (gana ? 'defender' : 'attacker')) s.count = 0;
      pending.battle.finished = { winner: gana ? 'attacker' : 'defender' };
      settleBattle(state, ctx);
    };
    elegir(state, hero.id, 'pozo-de-valdesombra', 'pozo', 'brocal', 0);
    const oro = state.players[0]!.oro;
    pelear(false);
    // Perdida: no da nada y se puede volver a bajar.
    expect(state.players[0]!.oro).toBe(oro);
    expect(Object.keys(state.mundo!.cobradas)).not.toContain('pozo-de-valdesombra/pozo/brocal/1');
    const deVuelta = state.heroes.find((h) => h.owner === 0)!;
    deVuelta.at = { x: 16, y: 13 };
    expect(opcionBlocker(state, deVuelta.id, bajar)).toBeNull();
    pelear(true);
    // Ganada: los 100 de la opción y lo de «alGanar», y ya no se repite.
    expect(state.players[0]!.oro).toBe(oro + 100);
    expect(state.heroes.find((h) => h.id === deVuelta.id)!.mochila).toContain('gambeson');
    expect(Object.keys(state.mundo!.cobradas)).toContain('pozo-de-valdesombra/pozo/brocal/1');
    expect(Object.keys(state.mundo!.vencidos)).toEqual(['pozo-de-valdesombra/ahogados']);
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

  it('sin el banco de figuras, el mundo dice que no se cargó el banco y por qué, no que sus figuras no existen', async () => {
    // La página: `/__npcs` responde 500 (H3 del QA del banco de NPC) y lo del mundo, de `assets/`.
    const avisos: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((m: string) => avisos.push(m));
    vi.stubGlobal('fetch', async (url: string) =>
      url === '/__npcs'
        ? new Response('<h1>500</h1>', { status: 500 })
        : new Response(readFileSync(join(RAIZ, 'assets', url)), {
            headers: { 'content-type': 'application/json' },
          }),
    );
    onTestFinished(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });
    vi.resetModules();
    const { cargarLaGente } = await import('../src/client/render/figuras/gente.js');
    const gente = cargarLaGente();
    expect((await gente).sinBanco).toBe('/__npcs responde 500 y no es JSON');
    // El aviso de la consola no dice lo contrario que la página: la base, con el Y Bot; un mundo, no.
    expect(avisos).toEqual([
      '[npcs] sin banco de figuras (/__npcs responde 500 y no es JSON): la gente de la base sale con el Y Bot, y un mundo (?mundo=) no se puede jugar sin él',
    ]);
    await expect(cargarElMundoPedido('?mundo=prueba', gente)).rejects.toThrow(
      new Error(
        'el mundo "prueba" no se puede jugar: no se pudo cargar el banco de figuras de NPC (/__npcs responde 500 y no es JSON), y las personas del mundo llevan figuras de ese banco. Sin «?mundo=» la partida se juega, con la gente en el Y Bot',
      ),
    );
    // Con el banco cargado y sin esas figuras, sí es el mundo el que no vale: la frase de siempre.
    const vacio = { banco: { figuras: [] }, pintadas: new Set<string>(), sinBanco: null };
    await expect(cargarElMundoPedido('?mundo=prueba', Promise.resolve(vacio))).rejects.toThrow(
      /"imperio-armero" no es una figura del banco de NPC/,
    );
    // Y con el banco del repo, carga.
    await cargarElMundoPedido(
      '?mundo=prueba',
      Promise.resolve({ banco: BANCO, pintadas: new Set<string>(), sinBanco: null }),
    );
    expect(mundoPedido()).not.toBeNull();
  });
});

describe('los mundos del repositorio en disco', () => {
  it('«prueba» vale con su biblia, como la ve «pnpm mundo validar»', async () => {
    expect(await validarEnDisco('prueba')).toEqual([]);
  });
});

/**
 * El patrón de dos desenlaces excluyentes que enseña la skill del motor
 * (`## Desenlaces excluyentes`): el fragmento **tal como está escrito en ella**,
 * metido en `prueba`, vale con el validador de verdad y, jugado, elegir uno cierra el
 * otro con el `ya` que describe el mundo, y otro lugar lo lee. Si alguien toca el
 * fragmento y deja de valer, el motor gastaría vueltas copiándolo: cae aquí.
 */
describe('los desenlaces excluyentes de la skill', () => {
  const skill = readFileSync(join(RAIZ, '.claude/skills/motor-de-mundos/SKILL.md'), 'utf8');
  const seccion = skill.slice(skill.indexOf('## Desenlaces excluyentes'));
  const bloque = /```json\n([\s\S]*?)\n```/.exec(seccion)?.[1];
  if (bloque === undefined) throw new Error('la skill no trae el fragmento de los desenlaces');
  const fragmento = JSON.parse(bloque) as {
    marcas: Record<string, unknown>;
    nodo: { texto: string; opciones: Record<string, unknown>[] };
    enOtroLugar: { punto: Record<string, unknown> & { id: string }; dialogo: unknown };
  };
  const conElSello = prueba((h) => {
    Object.assign(h.marcas as Record<string, unknown>, fragmento.marcas);
    // El nodo, en la garita del puente: se llega desde su inicio por una opción sin «hace».
    const garita = puente(h).dialogos.garita!;
    garita.nodos.sello = fragmento.nodo;
    garita.nodos.dentro!.opciones.push({ texto: 'Preguntar por el sello', ir: 'sello' });
    // El punto que lo lee, en el pozo.
    const pozo = h.lugares[1] as unknown as {
      puntos: unknown[];
      dialogos: Record<string, unknown>;
    };
    pozo.puntos.push(fragmento.enOtroLugar.punto);
    pozo.dialogos[fragmento.enOtroLugar.punto.dialogo as string] = fragmento.enOtroLugar.dialogo;
  });

  it('vale con el validador de verdad', () => {
    expect(problemasDelMundo(conElSello, 'prueba', BANCO)).toEqual([]);
  });

  it('«pnpm mundo medir» lo ve: dos desenlaces que se excluyen y una marca que cruza al pozo', () => {
    const m = medirMundo(leerMundo(conElSello, 'prueba', BANCO), null);
    expect(m.exclusiones).toEqual([['sello-a-la-orden', 'sello-a-los-orkos']]);
    expect(m.marcasQueCruzan).toEqual(['sello-a-los-orkos']);
    expect(m.encadenados).toBe(2);
  });

  it('elegir un desenlace cierra el otro con el «ya» del mundo, y el otro lugar lo lee', () => {
    const state = partidaDelMundo(leerMundo(conElSello, 'prueba', BANCO));
    const hero = state.heroes.find((h) => h.owner === 0)!;
    const sello = (opcion: number) => ({
      lugar: 'puente-de-corvo',
      punto: 'garita',
      nodo: 'sello',
      opcion,
    });
    const estandarte = () => {
      hero.at = { x: 16, y: 13 };
      const a = anteDelHeroe(state, hero.id);
      if ('motivo' in a) throw new Error(a.motivo);
      return puntosDe(a).some((p) => p.id === 'estandarte');
    };
    expect(estandarte()).toBe(false);
    hero.at = { x: 10, y: 12 };
    expect(opcionBlocker(state, hero.id, sello(0))).toBeNull();
    const oro = state.players[0]!.oro;
    applyAdventureAction(
      state,
      { type: 'elegir_en_lugar', hero: hero.id, ...sello(1) },
      { rng: createRng(7) },
      0,
    );
    expect(state.players[0]!.oro).toBe(oro + 400);
    // La otra se cierra diciendo cómo está el mundo, no quién lo hizo.
    expect(opcionBlocker(state, hero.id, sello(0))).toBe(
      'el sello del abad ya está en manos de los orkos',
    );
    expect(estandarte()).toBe(true);
  });
});

describe('las figuras de la gente de un mundo (el banco de NPC)', () => {
  /** Una petición que vale: la de una figura del banco sin su id ni quién la pidió. */
  const PETICION = {
    descripcion: 'Un barquero viejo: capa de hule, gorro de lana, botas altas y una pértiga corta.',
    etiquetas: {
      oficio: 'vagabundo',
      sexo: 'hombre',
      edad: 'anciano',
      especie: 'humano',
      faccion: 'imperio',
      clase: 'baja',
    },
    talla: 1,
    acciones: 'reposo-y-marcha',
  };
  const corvo = (h: { lugares: Record<string, unknown>[] }) =>
    (h.lugares[0] as { puntos: { id: string; persona?: Record<string, unknown> }[] }).puntos.find(
      (p) => p.id === 'corvo',
    )!.persona!;

  it('una persona nombra una figura del banco o una de las que pide; otra cosa se dice', () => {
    expect(conHistoria((h) => (corvo(h).figura = 'imperio-alabardero'))).toContainEqual(
      expect.stringMatching(
        /^historia\.json: lugares\[0\]\.puntos\[1\]\.persona\.figura: "imperio-alabardero" no es una figura del banco de NPC/,
      ),
    );
    expect(
      conHistoria((h) => {
        corvo(h).figura = 'barquero';
        h.figuras = { barquero: PETICION };
      }),
    ).toEqual([]);
    // El cuerpo del catálogo se retiró: ya no vale.
    expect(
      conHistoria((h) => {
        corvo(h).cuerpo = 'imperio-alabardero';
      }),
    ).toContainEqual(expect.stringMatching(/persona: .*cuerpo/));
  });

  it('lo que pide: un id libre en el banco, que valga como petición, usado y como mucho cuatro', () => {
    const pide = (figuras: Record<string, unknown>) =>
      conHistoria((h) => {
        h.figuras = figuras;
        corvo(h).figura = Object.keys(figuras)[0];
      });
    expect(pide({ 'imperio-armero': PETICION })).toContainEqual(
      'historia.json: figuras.imperio-armero: "imperio-armero" ya es una figura del banco: nómbrala sin pedirla',
    );
    expect(pide({ barquero: { ...PETICION, talla: 0 } })).toContainEqual(
      expect.stringMatching(/^historia\.json: figuras\.barquero\.talla: tiene que ser un número/),
    );
    expect(pide({ barquero: PETICION, sobra: PETICION })).toContainEqual(
      'historia.json: figuras.sobra: no la nombra ninguna persona ni la gente de la base: una figura pedida se pinta para alguien',
    );
    const cinco = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((k) => [`fig-${k}`, PETICION]));
    expect(pide(cinco)).toContainEqual(
      'historia.json: figuras: pide 5 figuras y un mundo pide como mucho 4: reutiliza las del banco que se parezcan',
    );
  });

  it('«base» asigna figura a la gente de la base de quien juega, y a nadie más', () => {
    expect(
      conHistoria((h) => {
        h.base = { 'encargado-hall': 'imperio-posadera', 'vecino-pregonero': 'imperio-armero' };
      }),
    ).toEqual([]);
    expect(
      conHistoria((h) => {
        h.base = { 'vecino-tamborilero': 'imperio-armero' };
      }),
    ).toContainEqual(
      expect.stringMatching(
        /^historia\.json: base\.vecino-tamborilero: "vecino-tamborilero" no es de la gente de la base de quien juega \(imperio\)/,
      ),
    );
    expect(
      conHistoria((h) => {
        h.base = { alcaide: 'nadie' };
      }),
    ).toContainEqual(
      expect.stringMatching(/^historia\.json: base\.alcaide: "nadie" no es una figura/),
    );
  });

  it('la lectura para el motor trae el banco: etiquetas, tope, figuras y la gente de su base', () => {
    const leido = leerMundo(crudos('prueba'), 'prueba', BANCO);
    const { npcs } = lecturaParaElMotor(leido.mundo, leido.plan, BANCO);
    expect(npcs.tope).toBe(4);
    expect(Object.keys(npcs.etiquetas)).toEqual([
      'oficio',
      'sexo',
      'edad',
      'especie',
      'faccion',
      'clase',
    ]);
    expect(npcs.figuras.map((f) => f.id)).toContain('imperio-armero');
    expect(npcs.gente[0]).toMatchObject({ id: 'alcaide', nombre: 'Konrad', especie: 'humano' });
    expect(npcs.gente.map((p) => p.id)).toContain('vecino-pregonero');
  });
});
