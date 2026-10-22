/**
 * Qué figura del banco de NPC lleva cada persona de una base (`figurasDeLaGente`,
 * criterio 3 del banco de NPC): determinista por semilla, facción y persona, por
 * especie y sexo antes que nada, sin repetir mientras haya, el Y Bot sin ninguna de
 * su facción, y con un mundo, la historia manda en la base de quien juega.
 */
import { describe, expect, it } from 'vitest';
import { Session } from '../src/client/session.js';
import { leerMundo } from '../src/core/mundo/validar.js';
import { type Banco, type FiguraDeNpc, laMasParecida, leerBanco } from '../src/core/npcs.js';
import { createRng, hashDeTexto } from '../src/core/rng.js';
import { figurasDeLaGente } from '../src/core/town/figuras.js';
import { personasDeLaFaccion } from '../src/core/town/voces.js';
import type { FactionId } from '../src/core/types.js';
import { leerCrudos } from '../tools/mundo/disco.js';
import { leerBancoDeDisco } from '../tools/npcs/banco.js';

const figura = (
  id: string,
  faccion: FactionId,
  especie: FiguraDeNpc['etiquetas']['especie'],
  sexo: FiguraDeNpc['etiquetas']['sexo'],
  oficio: FiguraDeNpc['etiquetas']['oficio'] = 'campesino',
): FiguraDeNpc => ({
  id,
  descripcion: `La figura de prueba ${id}, de cuerpo entero, con su ropa de siempre.`,
  etiquetas: { oficio, sexo, edad: 'adulto', especie, faccion, clase: 'media' },
  talla: 1,
  acciones: 'reposo-y-marcha',
  pedidaPor: 'semilla',
});

const banco = (figuras: FiguraDeNpc[]): Banco => leerBanco({ figuras });
const todas = (b: Banco) => new Set(b.figuras.map((f) => f.id));
const estado = (seed: number) => ({
  seed,
  players: [{ id: 0 as const, faction: 'orkos' as const }],
});

describe('el reparto de la gente de una base', () => {
  const ORKOS = banco([
    figura('jefe', 'orkos', 'orko', 'hombre', 'autoridad'),
    figura('tabernera', 'orkos', 'orko', 'mujer', 'tabernero'),
    figura('chatarrero', 'orkos', 'goblin', 'hombre', 'artesano'),
    figura('templario', 'templarios', 'humano', 'hombre'),
  ]);

  it('reparte a toda la gente de la facción, la misma semilla da lo mismo y solo con figuras de su facción', () => {
    const a = figurasDeLaGente(estado(7) as never, 'orkos', {
      banco: ORKOS,
      pintadas: todas(ORKOS),
    });
    expect([...a.keys()]).toEqual(personasDeLaFaccion('orkos').map((p) => p.id));
    expect(
      figurasDeLaGente(estado(7) as never, 'orkos', { banco: ORKOS, pintadas: todas(ORKOS) }),
    ).toEqual(a);
    expect([...a.values()].every((f) => f !== null && f !== 'templario')).toBe(true);
  });

  it('especie y sexo antes: los goblins, con el goblin; la orka, con la orka', () => {
    const a = figurasDeLaGente(estado(7) as never, 'orkos', {
      banco: ORKOS,
      pintadas: todas(ORKOS),
    });
    for (const p of personasDeLaFaccion('orkos')) {
      if (p.especie === 'goblin') expect(a.get(p.id), p.id).toBe('chatarrero');
      if (p.especie === 'orko' && p.sexo === 'mujer') expect(a.get(p.id), p.id).toBe('tabernera');
      if (p.especie === 'orko' && p.sexo === 'hombre') expect(a.get(p.id), p.id).toBe('jefe');
    }
  });

  it('sin repetir mientras haya figuras que le valgan; con menos, repite', () => {
    // Una por persona, todas iguales de etiquetas: ninguna se repite.
    const personas = personasDeLaFaccion('elfos');
    const muchas = banco(personas.map((_, i) => figura(`elfo-${i}`, 'elfos', 'elfo', 'hombre')));
    const a = figurasDeLaGente(estado(3) as never, 'elfos', {
      banco: muchas,
      pintadas: todas(muchas),
    });
    expect(new Set(a.values()).size).toBe(personas.length);
    // Dos: todo el mundo lleva una de las dos.
    const dos = banco([
      figura('a', 'elfos', 'elfo', 'hombre'),
      figura('b', 'elfos', 'elfo', 'hombre'),
    ]);
    const b = figurasDeLaGente(estado(3) as never, 'elfos', { banco: dos, pintadas: todas(dos) });
    expect(new Set(b.values())).toEqual(new Set(['a', 'b']));
  });

  it('otra semilla puede dar otro reparto; sin ninguna pintada de su facción, el Y Bot (null)', () => {
    const muchas = banco(
      Array.from({ length: 6 }, (_, i) => figura(`elfo-${i}`, 'elfos', 'elfo', 'hombre')),
    );
    const repartos = new Set(
      [1, 2, 3, 4, 5].map((s) =>
        JSON.stringify([
          ...figurasDeLaGente(estado(s) as never, 'elfos', {
            banco: muchas,
            pintadas: todas(muchas),
          }),
        ]),
      ),
    );
    expect(repartos.size).toBeGreaterThan(1);
    const g = figurasDeLaGente(estado(1) as never, 'templarios', {
      banco: ORKOS,
      pintadas: new Set(['jefe']),
    });
    expect([...g.values()].filter((f) => f !== 'templario').every((f) => f === null)).toBe(true);
    const nada = figurasDeLaGente(estado(1) as never, 'orkos', {
      banco: ORKOS,
      pintadas: new Set(),
    });
    expect([...nada.values()].every((f) => f === null)).toBe(true);
  });

  it('con un mundo, «base» manda en la gente de quien juega, y solo en ella', () => {
    const conMundo = (faccionDe0: FactionId) =>
      ({
        seed: 7,
        players: [{ id: 0, faction: faccionDe0 }],
        mundo: { historia: { base: { alcaide: 'tabernera' } } },
      }) as never;
    expect(
      figurasDeLaGente(conMundo('orkos'), 'orkos', { banco: ORKOS, pintadas: todas(ORKOS) }).get(
        'alcaide',
      ),
    ).toBe('tabernera');
    expect(
      figurasDeLaGente(conMundo('templarios'), 'orkos', {
        banco: ORKOS,
        pintadas: todas(ORKOS),
      }).get('alcaide'),
    ).toBe('jefe');
    // Mientras la suya se pinta, la más parecida.
    expect(
      figurasDeLaGente(conMundo('orkos'), 'orkos', {
        banco: ORKOS,
        pintadas: new Set(['jefe', 'chatarrero']),
      }).get('alcaide'),
    ).toBe('jefe');
  });
});

describe('la más parecida (`laMasParecida`)', () => {
  it('es la primera de ordenar por su nota todas las de su facción: la regla de antes, de una pasada', () => {
    // La de antes ordenaba todas (especie, sexo, sin usar, oficio, hash) y tomaba
    // la primera (simplify del 22-10-2026). Al azar, con su semilla: la misma.
    const rng = createRng(11);
    const ordenada = (
      b: Banco,
      pintadas: Set<string>,
      buscada: Parameters<typeof laMasParecida>[1],
      clave: string,
      usadas: Set<string>,
    ) => {
      const nota = (f: FiguraDeNpc): number[] => [
        f.etiquetas.especie === buscada.especie ? 0 : 1,
        f.etiquetas.sexo === buscada.sexo ? 0 : 1,
        usadas.has(f.id) ? 1 : 0,
        f.etiquetas.oficio === buscada.oficio ? 0 : 1,
        hashDeTexto(`${clave}|${f.id}`),
      ];
      return b.figuras
        .filter((f) => pintadas.has(f.id) && f.etiquetas.faccion === buscada.faccion)
        .map((f) => ({ f, n: nota(f) }))
        .sort((x, y) => {
          for (let i = 0; i < x.n.length; i++) {
            const d = (x.n[i] as number) - (y.n[i] as number);
            if (d !== 0) return d;
          }
          return 0;
        })[0]?.f;
    };
    const especies = ['humano', 'elfo', 'orko'] as const;
    const sexos = ['hombre', 'mujer'] as const;
    const oficios = ['campesino', 'artesano', 'autoridad'] as const;
    const facciones = ['orkos', 'elfos'] as const;
    for (let vuelta = 0; vuelta < 200; vuelta++) {
      const b = banco(
        Array.from({ length: rng.int(0, 8) }, (_, i) =>
          figura(
            `f-${i}`,
            rng.pick(facciones),
            rng.pick(especies),
            rng.pick(sexos),
            rng.pick(oficios),
          ),
        ),
      );
      const pintadas = new Set(b.figuras.filter(() => rng.chance(0.7)).map((f) => f.id));
      const usadas = new Set(b.figuras.filter(() => rng.chance(0.3)).map((f) => f.id));
      const buscada = {
        faccion: rng.pick(facciones),
        especie: rng.pick(especies),
        sexo: rng.pick(sexos),
        oficio: rng.pick(oficios),
      };
      const clave = `${vuelta}|persona`;
      expect(laMasParecida({ banco: b, pintadas }, buscada, clave, usadas), String(vuelta)).toBe(
        ordenada(b, pintadas, buscada, clave, usadas),
      );
    }
  });
});

describe('la base en la sesión', () => {
  it('cada persona con su figura del banco; sin banco, el Y Bot civil', () => {
    const b = banco([
      figura('ana', 'templarios', 'humano', 'mujer', 'tabernero'),
      figura('blas', 'templarios', 'humano', 'hombre', 'artesano'),
    ]);
    const s = new Session(5, 'templarios', undefined, undefined, false, undefined, {
      banco: b,
      pintadas: todas(b),
    });
    const base = s.state.towns.find((t) => t.owner === 0)!;
    s.openTown(base.id);
    const antes = s.vistaDeLaBase()!;
    expect(antes.caminante.cuerpo).not.toBe('npc:ana');
    for (const p of antes.gente) expect(['npc:ana', 'npc:blas']).toContain(p.cuerpo);
    const elvira = antes.gente.find((p) => p.id === 'encargado-hall');
    expect(elvira?.cuerpo).toBe('npc:ana');
    // Sin banco, el Y Bot civil de siempre.
    const sin = new Session(5, 'templarios');
    sin.openTown(base.id);
    for (const p of sin.vistaDeLaBase()!.gente) expect(p.cuerpo).toBe('vecino-de-la-base');
  });
});

describe('la gente de un lugar (el mundo de prueba)', () => {
  it('Corvo se pinta con su figura si está pintada; si no, con la más parecida de su facción, o el Y Bot', async () => {
    const leido = await leerCrudos('prueba');
    if ('problemas' in leido) throw new Error(leido.problemas.join('\n'));
    const real = leerBancoDeDisco();
    const mundo = leerMundo(leido.crudos, 'prueba', real);
    const corvoCon = (pintadas: string[]): string | null => {
      const s = new Session(0, undefined, undefined, undefined, false, mundo, {
        banco: real,
        pintadas: new Set(pintadas),
      });
      const yo = s.state.heroes.find((h) => h.owner === 0)!;
      yo.at = { x: 10, y: 12 };
      s.lugar.abrir(yo.id);
      return s.lugar.vista()?.puntos.find((p) => p.id === 'corvo')?.cuerpo ?? null;
    };
    expect(corvoCon(['imperio-armero', 'imperio-posadera'])).toBe('npc:imperio-armero');
    expect(corvoCon(['imperio-burgomaestre-anciano'])).toBe('npc:imperio-burgomaestre-anciano');
    expect(corvoCon(['templario-herrero'])).toBe('vecino-de-la-base');
  });

  it('en el mundo de prueba, «base» viste al alcaide y a la posadera de quien juega', async () => {
    const leido = await leerCrudos('prueba');
    if ('problemas' in leido) throw new Error(leido.problemas.join('\n'));
    const real = leerBancoDeDisco();
    const mundo = leerMundo(leido.crudos, 'prueba', real);
    const imperio = real.figuras.filter((f) => f.etiquetas.faccion === 'imperio').map((f) => f.id);
    const s = new Session(0, undefined, undefined, undefined, false, mundo, {
      banco: real,
      pintadas: new Set(imperio),
    });
    const g = figurasDeLaGente(s.state, 'imperio', { banco: real, pintadas: new Set(imperio) });
    expect(g.get('alcaide')).toBe('imperio-burgomaestre-anciano');
    expect(g.get('encargado-tavern')).toBe('imperio-posadera');
  });
});
