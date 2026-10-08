/**
 * La arena (`/arena/`): las cifras inventadas pelean sin pasar por el catálogo,
 * la IA mueve solo las unidades que lleva, el borrador se valida antes de
 * escribirse y todas las hojas del taller se pueden pintar en el tablero.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BattleAnimator } from '../src/client/anim.js';
import { renderBando, renderFicha, renderPanelDeBatalla } from '../src/client/arena/paneles.js';
import { marcadoDe } from '../src/client/html.js';
import { arteDe, juegosDelYBot, registrarUnidad } from '../src/client/render/personajes.js';
import { type PuestoDeArena, SesionDeArena } from '../src/client/session.js';
import { chooseBattleAction } from '../src/core/ai/tactics.js';
import {
  batallaDeArena,
  COMENTARIO_DEL_BORRADOR,
  cifrasPorDefecto,
  escalonDeCasillas,
  finalDeArena,
  PERFILES_DE_ARENA,
  type UnidadDeArena,
  unidadPorDefecto,
  validarBorradorDeArena,
  validarHojasDeArena,
  validarUnidadDeArena,
} from '../src/core/arena.js';
import { activeStack, isAlive, MAX_ROUNDS } from '../src/core/battle/battle.js';
import { LIDERAZGO } from '../src/core/data.js';
import { createRng } from '../src/core/rng.js';
import { SPEED_TIERS, SPEED_TO_HEXES } from '../src/core/types.js';
import { NOMBRES_DE_DIRECCION } from '../src/shared/arte.js';
import {
  escribirBorrador,
  hojasDeArena,
  leerBorrador,
  RUTA_DEL_BORRADOR,
} from '../tools/arena/borrador.js';
import { VELOCIDAD_DE_SALIDA } from '../tools/arena/velocidades.js';
import {
  EN_OCHO_DIRECCIONES,
  HEROES,
  JUEGO_DEL_YBOT,
  juegoDelYBot,
  UNIDADES,
  unidad as unidadDelTaller,
} from '../tools/taller/unidades.js';

const RAIZ = resolve(import.meta.dirname, '..');
const HOJAS = hojasDeArena(RAIZ);

function unidad(id: string, cambios: Partial<UnidadDeArena> = {}): UnidadDeArena {
  const hoja = HOJAS.find((h) => h.id === id);
  if (hoja === undefined) throw new Error(`no hay hoja ${id}`);
  return { ...unidadPorDefecto(hoja), ...cambios };
}

const ia = (u: UnidadDeArena): PuestoDeArena => ({ unidad: u, ia: true });

/** Una unidad como las guardaba el borrador antes de las casillas: sin ellas. */
function aLaAntigua(u: UnidadDeArena): Omit<UnidadDeArena, 'casillas'> {
  const { casillas: _fuera, ...resto } = u;
  return resto;
}

/** Una sesión montada y empezada: lo que hace la página al pulsar «Luchar». */
function montada(
  izquierda: readonly PuestoDeArena[],
  derecha: readonly PuestoDeArena[],
  semilla: number,
): SesionDeArena {
  const s = new SesionDeArena(izquierda, derecha, semilla);
  s.empezar();
  return s;
}
const yo = (u: UnidadDeArena): PuestoDeArena => ({ unidad: u, ia: false });

describe('la arena pelea con las cifras del borrador', () => {
  it('las cifras editadas llegan al stack tal cual, sin pasar por el catálogo', () => {
    // `templario-monje` no es una criatura del catálogo: si algo llamara a
    // `creature()` con él, lanzaría. Y el ataque de 42 no es el de nadie.
    const monje = unidad('templario-monje', { attack: 42, damage: [3, 9], hp: 21, shots: 5 });
    const b = batallaDeArena([monje], [unidad('zombi')], createRng(1));
    const s = b.stacks.find((x) => x.side === 'attacker');
    expect(s?.body).toBe('templario-monje');
    expect(s?.origen.kind).toBe('personaje');
    expect(s?.unit).toMatchObject({ attack: 42, damage: [3, 9], hp: 21, shots: 5, nivel: 2 });
    expect(s?.topHp).toBe(21);
    expect(s?.shotsLeft).toBe(5);
  });

  it('los rasgos del motor van con la unidad, y las habilidades no pelean', () => {
    const jinete = unidad('templario-hermano-de-carga', { habilidades: ['Salto'] });
    const b = batallaDeArena([jinete], [unidad('zombi', { traits: ['undead'] })], createRng(1));
    const [a, d] = [b.stacks[0], b.stacks[1]];
    expect(a?.unit.traits).toEqual(['charge']);
    expect(d?.unit.traits).toEqual(['undead']);
    // El no-muerto, a moral 0 como en el juego: el rasgo es el del motor.
    expect(d?.morale).toBe(0);
    expect(JSON.stringify(a?.unit)).not.toContain('Salto');
  });

  it('pasarse de lo que cabe en un bando lanza diciendo cuántas caben', () => {
    const muchos = Array.from({ length: LIDERAZGO.maxPorBando + 1 }, () => unidad('zombi'));
    expect(() => batallaDeArena(muchos, [unidad('zombi')], createRng(1))).toThrow(
      `el bando izquierdo lleva ${LIDERAZGO.maxPorBando + 1} unidades y caben ${LIDERAZGO.maxPorBando}: quita 1`,
    );
    expect(() => batallaDeArena([unidad('zombi')], [], createRng(1))).toThrow(
      'el bando derecho está vacío',
    );
    // Lo que cabe, cabe: siete grandes en un bando también.
    const grandes = Array.from({ length: LIDERAZGO.maxPorBando }, () =>
      unidad('troll-maza', { hexes: 2 }),
    );
    expect(() => batallaDeArena(grandes, grandes, createRng(1))).not.toThrow();
  });

  it('con todas en IA la batalla se juega entera al montarla', () => {
    for (const semilla of [1, 2, 3, 4, 5]) {
      const s = montada(
        [ia(unidad('templario-escudo')), ia(unidad('templario-hermano-de-carga'))],
        [ia(unidad('orko-dos-armas')), ia(unidad('goblin-arquero'))],
        semilla,
      );
      expect(s.battle.finished, `semilla ${semilla}`).not.toBeNull();
      expect(s.turnoPropio).toBeNull();
    }
  });

  it('con una unidad «Yo», la sesión se para en su turno y solo en el suyo', () => {
    for (const semilla of [1, 7, 12]) {
      const s = montada(
        [yo(unidad('templario-escudo')), ia(unidad('templario-mandoble'))],
        [ia(unidad('orko-dos-armas')), ia(unidad('goblin-arquero'))],
        semilla,
      );
      const mio = s.battle.stacks.find((x) => x.side === 'attacker' && x.slot === 0);
      expect(s.laLlevaLaIA(mio?.id ?? '')).toBe(false);
      let turnos = 0;
      let movioLaIA = false;
      while (s.battle.finished === null) {
        // Cada vez que la sesión devuelve el control, la activa es la mía.
        const activa = activeStack(s.battle);
        expect(activa?.id).toBe(mio?.id);
        expect(s.turnoPropio?.stack.id).toBe(mio?.id);
        expect(s.miBando).toBe('attacker');
        const antes = s.battle.log.length;
        s.playBattleAction(chooseBattleAction(s.battle));
        movioLaIA ||= s.battle.log
          .slice(antes)
          .some((e) => 'stack' in e && e.stack !== mio?.id && e.kind !== 'perished');
        if (++turnos > 500) throw new Error('la batalla no termina');
      }
      expect(turnos).toBeGreaterThan(0);
      // Si la mía cayó, la IA la acabó sola; y entre medias movió las suyas.
      expect(movioLaIA || !isAlive(mio as NonNullable<typeof mio>)).toBe(true);
    }
  });

  it('las dos manos de la persona: lleva unidades de los dos bandos', () => {
    const s = montada([yo(unidad('zombi'))], [yo(unidad('esqueleto-guerrero'))], 3);
    const vistos = new Set<string>();
    for (let i = 0; i < 6 && s.battle.finished === null; i++) {
      const t = s.turnoPropio;
      expect(t).not.toBeNull();
      vistos.add(t?.side ?? '');
      s.playBattleAction({ type: 'end_turn' });
    }
    expect([...vistos].sort()).toEqual(['attacker', 'defender']);
  });

  it('fuera de su turno la persona no mueve: se le dice', () => {
    const s = montada([ia(unidad('zombi'))], [ia(unidad('zombi'))], 1);
    const largo = s.battle.log.length;
    s.playBattleAction({ type: 'end_turn' });
    expect(s.status).toBe('Ahora no mueve ninguna unidad tuya.');
    expect(s.battle.log.length).toBe(largo);
  });
});

describe('el borrador se valida antes de escribirse', () => {
  const base = (): UnidadDeArena => unidad('templario-monje');

  it('toda hoja sale con unas cifras por defecto que pasan la validación', () => {
    for (const h of HOJAS)
      expect(() => validarUnidadDeArena(unidadPorDefecto(h)), h.id).not.toThrow();
    for (const p of PERFILES_DE_ARENA) expect(cifrasPorDefecto(p).hp).toBeGreaterThan(0);
  });

  it('rechaza diciéndolo: velocidad inventada, rasgo inexistente, daño al revés', () => {
    expect(() => validarUnidadDeArena({ ...aLaAntigua(base()), speed: 'rapidisima' })).toThrow(
      'la unidad "templario-monje": la velocidad "rapidisima" no existe; valen very_slow, slow, average, fast, very_fast, ultra_fast',
    );
    expect(() => validarUnidadDeArena({ ...base(), traits: ['volar'] })).toThrow(
      'la unidad "templario-monje": el rasgo "volar" no existe',
    );
    expect(() => validarUnidadDeArena({ ...base(), damage: [5, 2] })).toThrow(
      'la unidad "templario-monje": el daño mínimo (5) no puede pasar del máximo (2)',
    );
    expect(() => validarUnidadDeArena({ ...base(), habilidades: ['Volar'] })).toThrow(
      'la habilidad "Volar" no existe',
    );
    expect(() => validarUnidadDeArena({ ...base(), hp: 0 })).toThrow(
      'la vida tiene que ser 1 o más',
    );
    expect(() => validarUnidadDeArena({ ...base(), attack: 2.5 })).toThrow(
      'el ataque tiene que ser un número entero, y es 2.5',
    );
    expect(() => validarUnidadDeArena({ ...base(), attack: Number.NaN })).toThrow(
      'la unidad "templario-monje": el ataque no tiene valor, el campo está vacío',
    );
    expect(() => validarUnidadDeArena({ ...base(), traits: ['charge', 'charge'] })).toThrow(
      'el rasgo "charge" está dos veces',
    );
    expect(() => validarUnidadDeArena({ ...base(), hexes: 3 })).toThrow('ocupa 1 hex o 2');
    expect(() => validarUnidadDeArena({ ...base(), faction: 'knight' })).toThrow(
      'la facción "knight" no existe',
    );
  });

  it('el archivo no trae dos veces la misma hoja', () => {
    expect(() => validarBorradorDeArena({ unidades: [base(), base()] })).toThrow(
      'el borrador de la arena: la unidad "templario-monje" está dos veces',
    );
  });

  describe('en disco', () => {
    let dir: string | null = null;
    afterEach(() => {
      if (dir !== null) rmSync(dir, { recursive: true, force: true });
      dir = null;
    });

    it('lo que no valida no se escribe; lo que valida vuelve igual y sin temporales', () => {
      dir = mkdtempSync(join(tmpdir(), 'arena-'));
      const ruta = join(dir, RUTA_DEL_BORRADOR);
      expect(() =>
        escribirBorrador(dir as string, { unidades: [{ ...aLaAntigua(base()), speed: 'x' }] }),
      ).toThrow('la velocidad "x" no existe');
      expect(existsSync(ruta)).toBe(false);
      expect(leerBorrador(dir)).toEqual({ unidades: [], invalidas: [] });

      const monje = { ...base(), attack: 9, habilidades: ['Salto'] };
      escribirBorrador(dir, { unidades: [monje] });
      const json = JSON.parse(readFileSync(ruta, 'utf8')) as {
        _comment: string;
        unidades: unknown[];
      };
      expect(json._comment).toContain('BORRADOR');
      expect(leerBorrador(dir).unidades).toEqual([monje]);
      expect(readdirSync(join(dir, 'data/borradores'))).toEqual(['unidades.json']);

      // Un guardado malo después de uno bueno deja el bueno donde estaba.
      expect(() =>
        escribirBorrador(dir as string, { unidades: [{ ...monje, damage: [3, 1] }] }),
      ).toThrow();
      expect(leerBorrador(dir).unidades).toEqual([monje]);
    });
  });

  it('el borrador guardado en el repo, si lo hay, sigue cumpliendo la regla', () => {
    expect(() => leerBorrador(RAIZ)).not.toThrow();
  });
});

describe('las hojas de assets/unidades se pintan en el tablero', () => {
  it('se ofrece TODA unidad del taller, tropa y héroes: la que no tiene arte propio va con el Y Bot', () => {
    expect(HOJAS.map((h) => h.id)).toEqual([...UNIDADES, ...HEROES].map((u) => u.id));
    expect(HOJAS.length).toBeGreaterThan(40);
  });

  it('las de 8 direcciones traen sus ocho atlas y el juego de su Y Bot', () => {
    const hoja = (id: string) => HOJAS.find((h) => h.id === id) as (typeof HOJAS)[number];
    expect(hoja('templario-escudo').direcciones).toHaveLength(8);
    expect(hoja('templario-escudo').juego).toBe('espada-escudo');
    expect(hoja('templario-monje').juego).toBe('baston');
    // El zombi lleva espada desde su lámina nueva (05-10-2026).
    expect(hoja('zombi').direcciones).toHaveLength(8);
    expect(hoja('zombi').juego).toBe('espada-escudo');
    // Desde los No muertos (05-10-2026), todas las del taller están en 8
    // direcciones, y cada una llega con sus ocho.
    expect(Object.keys(EN_OCHO_DIRECCIONES).sort()).toEqual(HOJAS.map((h) => h.id).sort());
    for (const id of Object.keys(EN_OCHO_DIRECCIONES))
      expect(hoja(id).direcciones, id).not.toBeNull();
  });

  it('el juego del Y Bot va por el arma de cada unidad: una fila por unidad, y con poses', () => {
    const ids = [...UNIDADES, ...HEROES].map((u) => u.id);
    // Ni una unidad sin fila ni una fila sin unidad: la que falte lanzaría al
    // montar la arena, y la que sobre es una unidad renombrada que nadie movió.
    expect(Object.keys(JUEGO_DEL_YBOT).sort()).toEqual([...ids].sort());
    for (const u of [...UNIDADES, ...HEROES]) {
      expect(juegosDelYBot(), `${u.id} (${JUEGO_DEL_YBOT[u.id]})`).toContain(juegoDelYBot(u));
    }
    const juego = (id: string) => juegoDelYBot(unidadDelTaller(id));
    // Los dos que QA vio mal con el perfil de poses (M2).
    expect(juego('imperio-piquero')).toBe('lanza');
    expect(juego('goblin-lancero')).toBe('lanza');
    expect(juego('imperio-alabardero')).toBe('lanza');
    expect(juego('heroe-goblin-chaman')).toBe('baston');
    expect(juego('heroe-elfo-druida')).toBe('baston');
    expect(juego('heroe-imperio-mago')).toBe('baston');
    expect(juego('templario-mandoble')).toBe('dos-manos');
    expect(juego('troll-maza')).toBe('maza');
    expect(juego('templario-penitente')).toBe('mayal');
    expect(juego('templario-hermano-de-carga')).toBe('montado-lanza');
    // Los tiradores, con el arma que llevan; el explorador pelea con sus cuchillos.
    for (const id of ['esqueleto-arquero', 'elfo-arquero', 'goblin-arquero'])
      expect(juego(id), id).toBe('arco');
    for (const id of ['imperio-ballestero', 'imperio-arcabucero', 'imperio-artillero-culebrina'])
      expect(juego(id), id).toBe('ballesta');
    expect(juego('elfo-explorador')).toBe('espada-escudo');
    // El arte propio se pinta sobre las poses de ese mismo juego.
    for (const [id, j] of Object.entries(EN_OCHO_DIRECCIONES)) expect(j, id).toBe(juego(id));
  });

  it('una unidad sin fila en la tabla de armas lanza diciendo dónde añadirla', () => {
    const inventada = { ...unidadDelTaller('zombi'), id: 'zombi-inventado' };
    expect(() => juegoDelYBot(inventada)).toThrow(/zombi-inventado.*JUEGO_DEL_YBOT/);
  });

  it('cada hoja se registra para pintarla: con `dN` es arte propio, sin ellas el Y Bot teñido', () => {
    for (const h of HOJAS) {
      const arte = registrarUnidad(h.id, h);
      expect(arteDe(h.id)).toBe(arte);
      expect(arte.propio, h.id).toBe(h.direcciones !== null);
      expect(arte.direcciones).toHaveLength(8);
    }
    const jinete = arteDe('templario-hermano-de-carga');
    expect(jinete.direcciones[0]?.cell).toBe(384);
    expect(jinete.direcciones[0]?.clips.charge.row).toBe(2);
  });

  it('#142: quien dispara golpea cuerpo a cuerpo con otra fila que la del disparo, en sus ocho direcciones', () => {
    // El golpe de un tirador era su disparo (M4 del #136): tensaba sin flecha y
    // el daño llegaba antes de soltar. El arte propio y todo Y Bot que dispara.
    const tiradores = [
      ...HOJAS.map((h) => registrarUnidad(h.id, h)),
      ...juegosDelYBot().map((j) => registrarUnidad(`y-bot-${j}`, { juego: j, direcciones: null })),
    ].filter((arte) => arte.dispara);
    const nombres = new Set(tiradores.map((a) => a.nombre));
    for (const j of ['arco', 'ballesta']) expect(nombres, j).toContain(`el Y Bot «${j}»`);
    expect(nombres).toContain('la unidad imperio-ballestero');
    for (const arte of tiradores) {
      for (const [n, d] of arte.direcciones.entries()) {
        const { attack, shoot } = d.clips;
        expect(
          attack.imagen === shoot.imagen && attack.row === shoot.row,
          `${arte.nombre} d${n} golpea con la fila del disparo`,
        ).toBe(false);
        expect(attack.suelta, `${arte.nombre} d${n}`).toBeUndefined();
      }
    }
  });

  it('un atlas con una carga rota se rechaza diciéndolo', () => {
    const jinete = HOJAS.find((h) => h.id === 'templario-hermano-de-carga');
    const d0 = jinete?.direcciones?.[0] as { clips: Record<string, unknown> };
    const roto = { ...d0, clips: { ...d0.clips, charge: { frames: 0 } } };
    expect(() =>
      registrarUnidad('roto', {
        juego: 'montado-lanza',
        direcciones: [roto, ...(jinete?.direcciones ?? []).slice(1)],
      }),
    ).toThrow('el atlas unidades/roto/d0 no tiene un clip "charge" con fotogramas y ancla');
  });

  it('el tramo con el que se carga se anda con el clip de carga, y el otro andando', () => {
    const b = batallaDeArena(
      [unidad('templario-hermano-de-carga')],
      [unidad('zombi')],
      createRng(1),
    );
    const [jinete, zombi] = [b.stacks[0], b.stacks[1]] as [
      (typeof b.stacks)[number],
      (typeof b.stacks)[number],
    ];
    const a = new BattleAnimator();
    a.observe(b);
    a.tick(0);
    // Dos jugadas escritas a mano en el registro: un paso suelto y una carga.
    b.log.push({
      kind: 'move',
      stack: jinete.id,
      to: { col: 3, row: 4 },
      path: [{ col: 3, row: 4 }],
    });
    a.observe(b);
    a.tick(1);
    expect(a.figura(jinete).clip).toBe('walk');
    a.tick(10_000);
    b.log.push(
      { kind: 'move', stack: jinete.id, to: { col: 7, row: 4 }, path: [{ col: 7, row: 4 }] },
      {
        kind: 'attack',
        stack: jinete.id,
        target: zombi.id,
        damage: 9,
        killed: 0,
        retaliation: false,
        charge: 4,
      },
    );
    a.observe(b);
    a.tick(10_001);
    expect(a.figura(jinete).clip).toBe('charge');
  });
});

describe('el marcado de la arena', () => {
  it('la ficha dice que las habilidades no tienen efecto, y escapa lo que se escribe', () => {
    const hoja = HOJAS.find((h) => h.id === 'templario-monje') ?? null;
    const u = { ...unidad('templario-monje'), name: '<b>Monje</b>', habilidades: ['Salto'] };
    const m = marcadoDe(renderFicha(u, hoja, false));
    expect(m).toContain('sin efecto todavía');
    expect(m).toContain('&lt;b&gt;Monje&lt;/b&gt;');
    expect(m).not.toContain('<b>Monje');
    expect(m).toContain('data-habilidad="Salto"');
    // Las seis acciones y el giro, también la carga: toda figura tiene las seis.
    for (const clip of ['idle', 'walk', 'charge', 'attack', 'hurt', 'death']) {
      expect(m).toContain(`data-clip="${clip}"`);
    }
    expect(m).toContain('data-arena="girar"');
    // El disparo, solo en la ficha de quien lo trae.
    expect(m).not.toContain('data-clip="shoot"');
    expect(marcadoDe(renderFicha(u, hoja, true))).toContain('data-clip="shoot"');
  });

  it('el bando lleva el Yo / IA de cada puesto y no deja duplicar con el bando lleno', () => {
    const puestos = Array.from({ length: LIDERAZGO.maxPorBando }, (_, i) => ({
      clave: i + 1,
      hoja: 'zombi',
      ia: i > 0,
    }));
    const m = marcadoDe(
      renderBando('derecha', puestos, () => unidad('zombi'), null, LIDERAZGO.maxPorBando),
    );
    expect(m).toContain(`Bando derecho · ${LIDERAZGO.maxPorBando} de ${LIDERAZGO.maxPorBando}`);
    expect(m.match(/data-arena="duplicar"[^>]*disabled/g)?.length).toBe(LIDERAZGO.maxPorBando);
  });

  it('el resultado se calla mientras el tablero aún cuenta la jugada', () => {
    const s = montada([ia(unidad('zombi'))], [ia(unidad('templario-mandoble'))], 2);
    expect(s.battle.finished).not.toBeNull();
    const contando = marcadoDe(renderPanelDeBatalla(s, true));
    expect(contando).not.toContain('Gana el bando');
    // Ni las vidas ni el parte del final: el tablero todavía no ha llegado ahí.
    expect(contando).not.toContain(' PV');
    expect(contando).not.toContain('class="log"');
    expect(contando).toContain('Contando la jugada…');
    expect(marcadoDe(renderPanelDeBatalla(s, false))).toMatch(/Gana el bando (izquierdo|derecho)/);
  });
});

describe('corrección de hallazgos de QA', () => {
  it('H1: montar no juega; la IA mueve al empezar, y una sola vez', () => {
    const s = new SesionDeArena(
      [ia(unidad('templario-escudo'))],
      [ia(unidad('orko-dos-armas'))],
      5,
    );
    // Recién montada, la batalla está en su salida: nadie ha movido ni pegado.
    expect(s.battle.finished).toBeNull();
    expect(
      s.battle.log.every(
        (e) => e.kind === 'round_start' || e.kind === 'morale' || e.kind === 'luck',
      ),
    ).toBe(true);
    const antes = s.version;
    s.empezar();
    expect(s.battle.finished).not.toBeNull();
    expect(s.version).not.toBe(antes);
    expect(() => s.empezar()).toThrow('esta batalla de la arena ya ha empezado');
  });

  it('H1: el animador que mira la salida cuenta luego todo lo que juega la IA', () => {
    const s = new SesionDeArena(
      [ia(unidad('templario-escudo'))],
      [ia(unidad('orko-dos-armas'))],
      5,
    );
    const a = new BattleAnimator();
    a.observe(s.battle);
    a.tick(0);
    s.empezar();
    a.observe(s.battle);
    a.tick(1);
    expect(a.busy).toBe(true);
  });

  describe('H2: guardar no pierde lo guardado', () => {
    let dir: string | null = null;
    afterEach(() => {
      if (dir !== null) rmSync(dir, { recursive: true, force: true });
      dir = null;
    });
    const escribirAMano = (raiz: string, unidades: unknown[]): void => {
      mkdirSync(join(raiz, 'data/borradores'), { recursive: true });
      writeFileSync(join(raiz, RUTA_DEL_BORRADOR), JSON.stringify({ unidades }));
    };

    it('una unidad que no vale no tira las buenas, y se vuelve a escribir tal cual', () => {
      dir = mkdtempSync(join(tmpdir(), 'arena-'));
      const buena = unidad('templario-monje', { attack: 11 });
      const mala = { ...unidad('zombi'), hp: -1 };
      escribirAMano(dir, [buena, mala]);
      const leido = leerBorrador(dir);
      expect(leido.unidades).toEqual([buena]);
      expect(leido.invalidas).toEqual([
        {
          id: 'zombi',
          motivo: 'la unidad "zombi": la vida tiene que ser 1 o más, y es -1',
          crudo: mala,
        },
      ]);
      // La página guarda lo que tiene —la buena y una nueva— y la mala sigue ahí.
      const nueva = unidad('elfo-arquero');
      expect(escribirBorrador(dir, { unidades: [buena, nueva] })).toEqual({
        unidades: 2,
        conservadas: 1,
      });
      const json = JSON.parse(readFileSync(join(dir, RUTA_DEL_BORRADOR), 'utf8')) as {
        unidades: unknown[];
      };
      expect(json.unidades).toEqual([buena, nueva, mala]);
      // Y mandar una válida con su id es arreglarla: la mala se va.
      const arreglada = unidad('zombi');
      expect(escribirBorrador(dir, { unidades: [buena, nueva, arreglada] }).conservadas).toBe(0);
      expect(leerBorrador(dir)).toEqual({ unidades: [buena, nueva, arreglada], invalidas: [] });
    });

    it('un archivo que no se puede leer no se pisa: se dice', () => {
      dir = mkdtempSync(join(tmpdir(), 'arena-'));
      mkdirSync(join(dir, 'data/borradores'), { recursive: true });
      writeFileSync(join(dir, RUTA_DEL_BORRADOR), '{ esto no es json');
      expect(() => leerBorrador(dir as string)).toThrow(`${RUTA_DEL_BORRADOR} no es JSON`);
      expect(() => escribirBorrador(dir as string, { unidades: [unidad('zombi')] })).toThrow(
        'no se guarda para no pisarlo',
      );
      expect(readFileSync(join(dir, RUTA_DEL_BORRADOR), 'utf8')).toBe('{ esto no es json');
    });

    it('una unidad válida sin hoja se lee y se vuelve a guardar', () => {
      dir = mkdtempSync(join(tmpdir(), 'arena-'));
      const fantasma = { ...unidad('templario-monje'), id: 'templario-fantasma', name: 'Fantasma' };
      escribirAMano(dir, [fantasma]);
      expect(leerBorrador(dir).unidades).toEqual([fantasma]);
      escribirBorrador(dir, { unidades: [fantasma] });
      expect(leerBorrador(dir).unidades).toEqual([fantasma]);
    });
  });

  it('H3: el comentario del archivo dice qué falta para pasar una unidad al catálogo', () => {
    for (const falta of [
      'NO es copiarla',
      'growth',
      'upgradesTo',
      'experiencia.json',
      'ciudades.json',
      'knight',
    ]) {
      expect(COMENTARIO_DEL_BORRADOR).toContain(falta);
    }
    expect(COMENTARIO_DEL_BORRADOR).not.toContain('copiándola');
  });

  it('H4: un final por tope de rondas se dice por tiempo, y uno de verdad no', () => {
    const muro = { hp: 100_000, defense: 500, attack: 0 };
    const eterna = montada(
      [ia(unidad('templario-monje', muro))],
      [ia(unidad('orko-dos-armas', muro))],
      11,
    );
    expect(eterna.battle.round).toBe(MAX_ROUNDS);
    expect(finalDeArena(eterna.battle)).toMatchObject({
      porTiempo: true,
      empate: true,
      ganador: 'derecha',
    });
    const texto = marcadoDe(renderPanelDeBatalla(eterna, false));
    expect(texto).toContain(
      `Sin vencedor en ${MAX_ROUNDS} rondas: por tiempo, con las mismas unidades en pie, gana quien defiende. Gana el bando derecho.`,
    );
    const corta = montada([ia(unidad('zombi'))], [ia(unidad('templario-mandoble'))], 2);
    expect(finalDeArena(corta.battle)?.porTiempo).toBe(false);
    expect(marcadoDe(renderPanelDeBatalla(corta, false))).not.toContain('por tiempo');
  });

  it('M2 y M14: un campo vacío se dice vacío, y un campo que no es de la arena se rechaza', () => {
    expect(() => validarUnidadDeArena({ ...unidad('zombi'), hp: Number.NaN })).toThrow(
      'la vida no tiene valor, el campo está vacío',
    );
    expect(() => validarUnidadDeArena({ ...unidad('zombi'), growth: 3 })).toThrow(
      'la unidad "zombi": «growth» no es un campo de la arena',
    );
  });

  it('M7: los no muertos salen con `undead`; los demás, no', () => {
    for (const h of HOJAS) {
      expect(unidadPorDefecto(h).traits.includes('undead'), h.id).toBe(h.faccion === 'no-muertos');
    }
  });

  it('M9: la tarjeta dice los hexes y los rasgos', () => {
    const grande = unidad('templario-escudo', { hexes: 2, traits: ['flying'] });
    const m = marcadoDe(
      renderBando('izquierda', [{ clave: 1, hoja: grande.id, ia: false }], () => grande, null, 7),
    );
    expect(m).toContain('2 hexes');
    expect(m).toContain('vuela');
  });

  it('la lista de hojas que llega por la red se valida al recibirla', () => {
    const buena = HOJAS[0] as (typeof HOJAS)[number];
    expect(validarHojasDeArena(JSON.parse(JSON.stringify([buena])))).toEqual([buena]);
    expect(() => validarHojasDeArena([{ ...buena, perfil: 'lanza-de-fuego' }])).toThrow(
      `la hoja "${buena.id}": el perfil "lanza-de-fuego" no existe`,
    );
    expect(() => validarHojasDeArena({})).toThrow('no es una lista');
  });

  it('una hoja de unidad no sustituye a un cuerpo del juego', () => {
    const jinete = HOJAS.find((h) => h.id === 'templario-hermano-de-carga');
    expect(() => registrarUnidad('pikeman', jinete as (typeof HOJAS)[number])).toThrow(
      '"pikeman" es un cuerpo del juego',
    );
  });

  it('la lista de hojas rechaza siete direcciones diciéndolo', () => {
    const buena = HOJAS.find((h) => h.id === 'templario-escudo') as (typeof HOJAS)[number];
    // El ocho de `core` es `NOMBRES_DE_DIRECCION.length` escrito a mano (`core`
    // no importa de `shared`): este test los pone en contacto.
    const n = NOMBRES_DE_DIRECCION.length;
    expect(() =>
      validarHojasDeArena([{ ...buena, direcciones: buena.direcciones?.slice(1) }]),
    ).toThrow(`trae ${n - 1} direcciones, y son ${n} o ninguna`);
  });
});

describe('la velocidad son casillas', () => {
  it('cada hoja del taller tiene su velocidad de salida, y ninguna sobra', () => {
    expect(Object.keys(VELOCIDAD_DE_SALIDA).sort()).toEqual(
      [...UNIDADES, ...HEROES].map((u) => u.id).sort(),
    );
    for (const h of HOJAS) {
      expect(h.casillas, h.id).toBe(VELOCIDAD_DE_SALIDA[h.id]?.[0]);
      expect(unidadPorDefecto(h).casillas, h.id).toBe(h.casillas);
    }
  });

  it('el criterio del usuario se cumple en la tabla', () => {
    const v = (id: string): number => VELOCIDAD_DE_SALIDA[id]?.[0] ?? Number.NaN;
    expect(v('templario-escudo')).toBe(4);
    expect(v('templario-mandoble')).toBe(3);
    expect(v('imperio-ballestero')).toBe(3);
    expect(v('zombi')).toBe(2);
    expect(v('esqueleto-guerrero')).toBe(3);
    expect(v('elfo-guardia-del-bosque')).toBe(v('templario-escudo') + 1);
    expect(v('goblin-jinete-de-hiena')).toBeGreaterThan(v('orko-hacha-escudo'));
    // El Danzante, el más rápido de los de a pie: solo el jinete le pasa.
    const aPie = Object.entries(VELOCIDAD_DE_SALIDA).filter(
      ([id]) => id !== 'templario-hermano-de-carga',
    );
    expect(Math.max(...aPie.map(([, [c]]) => c))).toBe(6);
    expect(aPie.filter(([, [c]]) => c === 6).map(([id]) => id)).toEqual([
      'heroe-elfo-danzante-de-espadas',
    ]);
    expect(v('templario-hermano-de-carga')).toBeGreaterThan(6);
    // Y no hay un empate masivo: ninguna velocidad lleva a más de la mitad.
    const cuenta = new Map<number, number>();
    for (const [c] of Object.values(VELOCIDAD_DE_SALIDA)) cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
    expect(Math.max(...cuenta.values())).toBeLessThan(Object.keys(VELOCIDAD_DE_SALIDA).length / 2);
  });

  it('el motor juega el escalón de esas casillas, y fuera de 2..7 se rechaza diciéndolo', () => {
    for (const t of SPEED_TIERS) expect(escalonDeCasillas(SPEED_TO_HEXES[t])).toBe(t);
    expect(() => escalonDeCasillas(8)).toThrow('la velocidad es de 2 a 7 casillas, y es 8');
    expect(() => validarUnidadDeArena({ ...unidad('zombi'), casillas: 9 })).toThrow(
      'la unidad "zombi": la velocidad es de 2 a 7 casillas, y es 9',
    );
    expect(() => validarUnidadDeArena({ ...unidad('zombi'), casillas: 1 })).toThrow(
      'la velocidad tiene que ser 2 o más, y es 1',
    );
    const b = batallaDeArena(
      [unidad('heroe-elfo-danzante-de-espadas')],
      [unidad('zombi')],
      createRng(1),
    );
    expect(b.stacks.map((s) => s.unit.speed)).toEqual(['very_fast', 'very_slow']);
  });

  it('un borrador de antes, con la velocidad como escalón, se lee convertido', () => {
    const vieja = { ...aLaAntigua(unidad('zombi')), speed: 'fast' };
    expect(validarUnidadDeArena(vieja)).toEqual({ ...unidad('zombi'), casillas: 5 });
    expect(() => validarUnidadDeArena({ ...vieja, casillas: 5 })).toThrow(
      'trae la velocidad dos veces',
    );
  });

  it('con las velocidades de salida ya no juega un ejército entero y luego el otro', () => {
    const s = new SesionDeArena(
      ['templario-escudo', 'templario-mandoble', 'templario-escudero'].map((id) => ia(unidad(id))),
      ['elfo-arquero', 'troll-maza', 'heroe-elfo-danzante-de-espadas'].map((id) => ia(unidad(id))),
      1,
    );
    const lados = s.battle.queue.map((id) => s.battle.stacks.find((x) => x.id === id)?.side);
    const actual = s.battle.stacks.find((x) => x.id === s.battle.turno?.stack)?.side;
    const orden = [actual, ...lados];
    // Se alternan en algún punto: no son tres de un lado y tres del otro.
    const cambios = orden.filter((l, i) => i > 0 && l !== orden[i - 1]).length;
    expect(cambios).toBeGreaterThan(1);
  });
});
