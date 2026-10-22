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
import {
  type CrudosDelMundo,
  leerMundo,
  lugarBlocker,
  problemasDelMundo,
} from '../src/core/mundo/validar.js';

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
