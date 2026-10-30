/**
 * Las versiones de una hoja (`tools/taller/revision/versiones.ts`): los tres
 * encargos que se piden, la regla que elige entre ellas (con las tablas medidas el
 * 30-10-2026, `docs/agents/2026-10-30-evaluar-animaciones/experimentos.md` §7) y
 * cuándo no se adopta nada.
 */
import { describe, expect, it } from 'vitest';
import { encargoSchema, promptDe } from '../tools/taller/encargo.js';
import { figura } from '../tools/taller/revision/revisar.js';
import {
  adoptarBlocker,
  versionAdoptada,
  duelo,
  elegirEnTorneo,
  elegirVersion,
  encargoDeLaHoja,
  encargosDeVersiones,
  type Resultado,
  type ResultadoDeClip,
  SIN_POSE_DEL_GIRO,
} from '../tools/taller/revision/versiones.js';

describe('los tres encargos de una hoja', () => {
  const f = figura('caballero-de-la-muerte');
  const base = encargoDeLaHoja(f, 0, 'a');
  const [tirada, esqueleto, todo] = encargosDeVersiones(base, f, 0, 'a', {
    instrucciones: '- Fila 2 (walk), columna(s) 4: adelanta la pierna derecha',
    notasDelArma: 'NOTAS DEL ARMA:\n- Fila 1 (idle), columna(s) 3: …',
  });

  it('pasan el esquema de un encargo, con su id y fuera de assets/', () => {
    for (const e of [tirada, esqueleto, todo]) expect(() => encargoSchema.parse(e)).not.toThrow();
    expect([tirada, esqueleto, todo].map((e) => e?.id)).toEqual([
      'caballero-de-la-muerte-v-tirada-d0-a',
      'caballero-de-la-muerte-v-esqueleto-d0-a',
      'caballero-de-la-muerte-v-todo-d0-a',
    ]);
    for (const e of [tirada, esqueleto, todo])
      expect(e?.salida).toMatch(
        /^\.cache\/taller\/revision\/caballero-de-la-muerte\/d0\/versiones\//,
      );
  });
  it('la otra tirada es el mismo encargo', () => {
    expect({ ...tirada, id: base.id, salida: base.salida }).toEqual(base);
  });
  it('el esqueleto va primero y el maniquí de siempre escala (`ocho.pose`)', () => {
    expect(esqueleto?.referencias[0]?.papel).toBe('pose-esqueleto');
    expect(esqueleto?.ocho?.pose).toBe(base.referencias[0]?.ruta);
    expect(esqueleto?.descripcion).toBe(base.descripcion);
  });
  // Lo que estropeó el piloto (/simplify, 30-10-2026): con `ocho.pose`, el prompt
  // pedía «editadas una a una» y «EDITA la imagen 1» en vez de las filas de la hoja.
  it('esqueleto y todo piden pintar las filas de la hoja, no editar otra', () => {
    for (const e of [esqueleto, todo]) {
      const p = promptDe(e!);
      expect(p).toContain(promptDe(base).split('Fila 1:')[1]!.split('\n')[0]);
      expect(p).toContain('Genera UNA imagen');
      expect(p).not.toMatch(/editad|EDITA/);
    }
  });

  it('todo lleva además el aviso del giro, las instrucciones y las notas del arma', () => {
    expect(todo?.descripcion).toContain(SIN_POSE_DEL_GIRO);
    expect(todo?.descripcion).toContain('adelanta la pierna derecha');
    expect(todo?.descripcion).toContain('NOTAS DEL ARMA');
  });
});

/** Un clip por cada resultado, en el orden de la hoja A. */
const tabla = (gana: number, pierde: number, noCoincide: number): ResultadoDeClip[] => {
  const r: Resultado[] = [
    ...Array<Resultado>(gana).fill('gana'),
    ...Array<Resultado>(pierde).fill('pierde'),
    ...Array<Resultado>(noCoincide).fill('no_coincide'),
  ];
  return r.map((resultado, i) => ({
    clip: ['idle', 'walk', 'charge'][i] as string,
    resultado,
    confianza: resultado === 'gana' ? 4 : 0,
  }));
};

describe('la que entra', () => {
  it('en el caballero, `todo` (3/0/0); la otra tirada y el esqueleto pierden algún clip', () => {
    expect(
      elegirVersion({ tirada: tabla(1, 1, 1), esqueleto: tabla(2, 1, 0), todo: tabla(3, 0, 0) })
        .ganadora,
    ).toBe('todo');
  });
  it('en el elfo, la otra tirada (2/0/1)', () => {
    expect(
      elegirVersion({ tirada: tabla(2, 0, 1), esqueleto: tabla(0, 2, 1), todo: tabla(0, 2, 1) })
        .ganadora,
    ).toBe('tirada');
  });
  it('con 2/1/0, ninguna: se queda la de ahora, y se dice', () => {
    const e = elegirVersion({ esqueleto: tabla(2, 1, 0) });
    expect(e.ganadora).toBeNull();
    expect(e.motivo).toMatch(/se queda la de ahora/);
  });
  it('entre varias, la que más gana, luego la de más confianza, luego la primera', () => {
    expect(elegirVersion({ tirada: tabla(1, 0, 2), todo: tabla(2, 0, 1) }).ganadora).toBe('todo');
    const conMas = tabla(1, 0, 2).map((r) => (r.resultado === 'gana' ? { ...r, confianza: 6 } : r));
    expect(elegirVersion({ tirada: tabla(1, 0, 2), esqueleto: conMas }).ganadora).toBe('esqueleto');
    expect(elegirVersion({ tirada: tabla(1, 0, 2), esqueleto: tabla(1, 0, 2) }).ganadora).toBe(
      'tirada',
    );
  });
});

describe('adoptar', () => {
  const gana = { ganadora: 'todo', motivo: 'gana todo' };
  it('sin ganadora no se adopta: se queda la de ahora', () => {
    expect(adoptarBlocker({ ganadora: null, motivo: 'ninguna gana' }, 'todo', 0, 'a')).toMatch(
      /se queda la de ahora/,
    );
  });
  it('sin el sí de la persona en el visor, tampoco', () => {
    expect(adoptarBlocker(gana, undefined, 0, 'a')).toMatch(/aún no ha visto/);
    expect(adoptarBlocker(gana, 'ahora', 0, 'a')).toMatch(/no prefirió.*«ahora»/);
  });
  it('con ganadora y el sí, sí', () => {
    expect(adoptarBlocker(gana, 'todo', 0, 'a')).toBeNull();
  });
});

// El piloto (30-10-2026): en caballero d0-b ninguna ganó a la de ahora, pero la de ahora
// era del maniquí viejo. Entonces las versiones se comparan entre sí.
describe('el torneo, cuando la de ahora es de otro maniquí', () => {
  const orden = ['tirada', 'esqueleto', 'todo'];
  it('gana la que gana todos sus duelos', () => {
    const e = elegirEnTorneo(
      {
        [duelo('todo', 'tirada')]: tabla(2, 0, 1),
        [duelo('todo', 'esqueleto')]: tabla(1, 0, 2),
        [duelo('tirada', 'esqueleto')]: tabla(0, 1, 2),
      },
      orden,
    );
    expect(e.ganadora).toBe('todo');
    expect(e.modo).toBe('torneo');
    expect(e.finalistas).toEqual(['todo', 'esqueleto']);
  });
  it('sin una clara, ninguna, y propone las dos mejores para el visor', () => {
    // En círculo: tirada > esqueleto > todo > tirada.
    const e = elegirEnTorneo(
      {
        [duelo('tirada', 'esqueleto')]: tabla(2, 0, 1),
        [duelo('esqueleto', 'todo')]: tabla(1, 0, 2),
        [duelo('todo', 'tirada')]: tabla(1, 0, 2),
      },
      orden,
    );
    expect(e.ganadora).toBeNull();
    expect(e.finalistas).toHaveLength(2);
    expect(e.finalistas?.[0]).toBe('tirada');
    expect(e.motivo).toMatch(/decide la persona/);
  });
  it('adoptar acepta la que elija la persona entre las finalistas, y ninguna otra', () => {
    const e = {
      ganadora: null,
      motivo: '',
      modo: 'torneo' as const,
      finalistas: ['tirada', 'todo'],
    };
    expect(adoptarBlocker(e, 'todo', 0, 'b')).toBeNull();
    expect(adoptarBlocker(e, undefined, 0, 'b')).toMatch(/aún no ha elegido/);
    expect(adoptarBlocker(e, 'esqueleto', 0, 'b')).toMatch(/ninguna de las finalistas/);
    // «iguales»: le valen las dos, y entra la primera finalista.
    expect(adoptarBlocker(e, 'iguales', 0, 'b')).toBeNull();
    expect(versionAdoptada(e, 'iguales')).toBe('tirada');
    expect(versionAdoptada(e, 'todo')).toBe('todo');
    expect(versionAdoptada({ ...e, ganadora: 'esqueleto' }, 'iguales')).toBe('esqueleto');
    // Con ganadora clara, como contra la de ahora: la persona tiene que preferirla.
    expect(adoptarBlocker({ ...e, ganadora: 'todo' }, 'tirada', 0, 'b')).toMatch(/no prefirió/);
  });
});
