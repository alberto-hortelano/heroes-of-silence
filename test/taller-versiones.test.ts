/**
 * Las versiones de una hoja (`tools/taller/revision/versiones.ts`): los tres
 * encargos que se piden, la regla que elige entre ellas (con las tablas medidas el
 * 30-10-2026, `docs/agents/2026-10-30-evaluar-animaciones/experimentos.md` §7) y
 * cuándo no se adopta nada.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encargoSchema, promptDe } from '../tools/taller/encargo.js';
import { type Figura, figura, RAIZ } from '../tools/taller/revision/revisar.js';
import {
  adoptarBlocker,
  adoptarTodas,
  casoDelVistazo,
  casosDelVisor,
  duelo,
  elegirEnTorneo,
  elegirVersion,
  encargoDeLaHoja,
  encargosDeVersiones,
  hojasRechazadas,
  type Resultado,
  type ResultadoDeClip,
  rechazadas,
  SIN_POSE_DEL_GIRO,
  versionAdoptada,
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
  it('empatadas en todo, desempata la que menos salta (el encuadre medido)', () => {
    expect(
      elegirVersion(
        { tirada: tabla(1, 0, 2), esqueleto: tabla(1, 0, 2) },
        ['tirada', 'esqueleto'],
        { tirada: 14, esqueleto: 3 },
      ).ganadora,
    ).toBe('esqueleto');
    const empate = { [duelo('tirada', 'todo')]: tabla(0, 0, 3) };
    expect(
      elegirEnTorneo(empate, ['tirada', 'todo'], { tirada: 12, todo: 2 }).finalistas?.[0],
    ).toBe('todo');
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
    // Con ganadora clara (decisión del usuario del 30-10-2026, «solo las dudosas»): se
    // adopta sola; si la persona eligió otra finalista, manda ella; otra cosa, no.
    const clara = { ...e, ganadora: 'todo' };
    expect(adoptarBlocker(clara, undefined, 0, 'b')).toBeNull();
    expect(versionAdoptada(clara, undefined)).toBe('todo');
    expect(adoptarBlocker(clara, 'tirada', 0, 'b')).toBeNull();
    expect(versionAdoptada(clara, 'tirada')).toBe('tirada');
    expect(adoptarBlocker(clara, 'esqueleto', 0, 'b')).toMatch(/ninguna de las finalistas/);
    // Contra la de ahora no cambia: sin el sí de la persona, nada.
    const contra = { ganadora: 'todo', motivo: '', modo: 'contra-la-de-ahora' as const };
    expect(adoptarBlocker(contra, undefined, 0, 'b')).toMatch(/aún no ha visto/);
  });
});

// «Solo las dudosas» (decisión del usuario del 30-10-2026): lo claro se adopta solo, la
// persona elige lo dudoso y da un vistazo final por dirección, donde puede rechazar.
describe('adoptar todas, el vistazo final y las rechazadas', () => {
  // Una figura de mentira en la caché, con el nombre de una unidad (lo pide el juntado).
  const base = `.cache/test-vistazo-${process.pid}`;
  const f: Figura = {
    id: 'caballero-de-la-muerte',
    arte: `${base}/arte/caballero-de-la-muerte`,
    maniqui: `${base}/maniqui`,
    revision: `${base}/revision`,
  };
  const eleccion = (d: number, h: string, e: object) => {
    mkdirSync(join(RAIZ, f.revision, `d${d}`), { recursive: true });
    writeFileSync(join(RAIZ, f.revision, `d${d}`, `eleccion-${h}.json`), JSON.stringify(e));
  };
  beforeAll(async () => {
    const webp = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#f00' } })
      .webp()
      .toBuffer();
    for (const d of [0, 1]) {
      mkdirSync(join(RAIZ, f.arte, `d${d}`), { recursive: true });
      for (const v of ['todo', 'tirada'])
        for (const h of ['a', 'b']) {
          const dir = join(RAIZ, f.revision, `d${d}`, 'versiones', v);
          mkdirSync(dir, { recursive: true });
          // Bytes distintos por versión y hoja: «ya adoptada» compara bytes.
          writeFileSync(
            join(dir, `hoja-${h}.webp`),
            Buffer.concat([webp, Buffer.from(`${v}${h}`)]),
          );
          writeFileSync(join(dir, `hoja-${h}.procedencia.json`), JSON.stringify({ encargo: v }));
        }
    }
    // d0-a: torneo con ganadora clara; d0-b y d1-a: dudosos.
    eleccion(0, 'b', {
      ganadora: null,
      motivo: 'dudoso',
      modo: 'torneo',
      finalistas: ['tirada', 'todo'],
    });
    eleccion(0, 'a', {
      ganadora: 'todo',
      motivo: 'gana todo',
      modo: 'torneo',
      finalistas: ['todo', 'tirada'],
    });
    eleccion(1, 'a', {
      ganadora: null,
      motivo: 'dudoso',
      modo: 'torneo',
      finalistas: ['tirada', 'todo'],
    });
  });
  afterAll(() => rmSync(join(RAIZ, base), { recursive: true, force: true }));

  it('adopta sola la clara, con «persona: null» y «auto», y deja la dudosa para el visor', async () => {
    const { adoptadas, quedan } = await adoptarTodas(f);
    expect(adoptadas).toEqual(['d0-a']);
    expect(quedan.map((q) => q.hoja)).toEqual(['d0-b', 'd1-a']);
    const proc = JSON.parse(
      readFileSync(join(RAIZ, f.arte, 'd0', 'hoja-a.procedencia.json'), 'utf8'),
    );
    expect(proc.eleccion).toMatchObject({ version: 'todo', persona: null, auto: true });
    // Otra vez no hace nada: ya está adoptada.
    expect((await adoptarTodas(f)).adoptadas).toEqual([]);
  });
  it('el visor pregunta la dudosa y da el vistazo final de la dirección con la automática', async () => {
    const { casos } = await casosDelVisor(f);
    const ids = casos.map((c) => c.id);
    expect(ids).toContain('eleccion-d1-a');
    expect(ids).toContain('eleccion-d0-b');
    expect(ids).not.toContain('eleccion-d0-a');
    const vistazo = casos.find((c) => c.id === casoDelVistazo(f, 0));
    expect(vistazo?.opciones).toEqual([
      'bien',
      'rehacer la hoja A',
      'rehacer la hoja B',
      'rehacer las dos',
    ]);
    // Los seis clips de la dirección, cada uno con su maniquí.
    expect(vistazo?.animaciones).toHaveLength(12);
    expect(ids.some((id) => id.startsWith('vistazo-d1-'))).toBe(false);
  });
  // El repintado del elfo arquero (30-10-2026): la persona rechazó d1-a en el vistazo y
  // eligió una finalista de d1-b en el mismo visor; adoptar d1-b antes de pedir las
  // rechazadas dejaba «vieja» la respuesta, y d1-a no se pedía. Y «ninguna vale» en una
  // dudosa tampoco se pedía.
  it('lo rechazado se pide sea cual sea el orden, también «ninguna vale», y una vez', async () => {
    expect(hojasRechazadas('rehacer las dos')).toEqual(['a', 'b']);
    expect(hojasRechazadas('bien')).toEqual([]);
    // Lo que enseña el visor ahora (y su clave, que escribe `pnpm taller visor`).
    const { clave } = await casosDelVisor(f);
    const vistazo = casoDelVistazo(f, 0);
    mkdirSync(join(RAIZ, f.revision, 'visor'), { recursive: true });
    writeFileSync(join(RAIZ, f.revision, 'visor', 'clave.json'), JSON.stringify(clave));
    const versionDe = (caso: string, v: string) =>
      Object.entries(clave[caso] ?? {}).find(([, x]) => x === v)?.[0];
    writeFileSync(
      join(RAIZ, f.revision, 'visor', 'respuestas.json'),
      JSON.stringify({
        [vistazo]: { valor: 'rehacer la hoja A' },
        'eleccion-d0-b': { valor: versionDe('eleccion-d0-b', 'tirada') },
        'eleccion-d1-a': { valor: 'ninguna vale' },
      }),
    );
    // Primero se adopta lo elegido (d0-b, por la persona: no es automática). A mano,
    // como lo deja `adoptar`: aquí juntaría la dirección, y las hojas de mentira no se
    // juntan.
    writeFileSync(join(RAIZ, f.arte, 'd0', 'hoja-b.webp'), Buffer.from('la que eligió la persona'));
    writeFileSync(
      join(RAIZ, f.arte, 'd0', 'hoja-b.procedencia.json'),
      JSON.stringify({ eleccion: { version: 'tirada', persona: 'versión 1' } }),
    );
    expect(casoDelVistazo(f, 0)).toBe(vistazo);
    // …y después se piden las rechazadas: d0-a sigue rechazada.
    expect(await rechazadas(f)).toEqual([
      { d: 0, h: 'a' },
      { d: 1, h: 'a' },
    ]);
    expect(existsSync(join(RAIZ, f.revision, 'd0', 'eleccion-a.json'))).toBe(false);
    expect(existsSync(join(RAIZ, f.revision, 'd1', 'eleccion-a.json'))).toBe(false);
    // Una vez: lo ya pedido no se vuelve a pedir.
    expect(await rechazadas(f)).toEqual([]);
  });
});
