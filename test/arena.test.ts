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
import {
  type DatosDePuesto,
  FIGURA_GENERICA,
  renderBando,
  renderCatalogo,
  renderFicha,
  renderFichaDeCatalogo,
  renderFichaDeHeroe,
  renderPanelDeBatalla,
  renderReglas,
  resumenDeCifras,
} from '../src/client/arena/paneles.js';
import { marcadoDe } from '../src/client/html.js';
import { arteDe, juegosDelYBot, registrarUnidad } from '../src/client/render/personajes.js';
import { type PuestoDeArena, SesionDeArena } from '../src/client/session.js';
import { chooseBattleAction } from '../src/core/ai/tactics.js';
import {
  batallaDeArena,
  type CambiosDeCatalogo,
  COMENTARIO_DEL_BORRADOR,
  cifrasDeCatalogoEnLaArena,
  cifrasPorDefecto,
  criaturasDelCatalogo,
  escalonDeCasillas,
  type FuenteDeArena,
  fichaDeHeroeDeArena,
  finalDeArena,
  type HeroeDeArena,
  heroeDeArena,
  heroePorDefecto,
  type MontajeDelEnlace,
  montajeALaURL,
  montajeDeLaURL,
  PERFILES_DE_ARENA,
  type UnidadDeArena,
  unaVezEnLaURL,
  unidadPorDefecto,
  validarBorradorDeArena,
  validarHeroeDeArena,
  validarHojasDeArena,
  validarUnidadDeArena,
} from '../src/core/arena.js';
import {
  activeStack,
  applyAction,
  createBattle,
  isAlive,
  MAX_ROUNDS,
} from '../src/core/battle/battle.js';
import { REGLAS_DEL_JUEGO, reglasDeLaURL } from '../src/core/battle/reglas.js';
import { allSpells } from '../src/core/battle/spells.js';
import type { BattleState } from '../src/core/battle/types.js';
import { allCreatures, creature, LIDERAZGO } from '../src/core/data.js';
import { HERO_BODY } from '../src/core/hero/hero.js';
import { createRng, type Rng } from '../src/core/rng.js';
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
  arteEnOchoDirecciones,
  EN_OCHO_DIRECCIONES,
  HEROES,
  JUEGO_DEL_YBOT,
  juegoDelYBot,
  tieneSusOchoDirecciones,
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

const delBorrador = (u: UnidadDeArena): FuenteDeArena => ({ kind: 'borrador', unidad: u });
const ia = (u: UnidadDeArena): PuestoDeArena => ({ fuente: delBorrador(u), ia: true });

/** Una pelea solo con unidades del borrador, sin héroes y con las reglas del juego. */
function pelea(
  izquierda: readonly UnidadDeArena[],
  derecha: readonly UnidadDeArena[],
  rng: Rng,
): BattleState {
  return batallaDeArena(
    {
      izquierda: { unidades: izquierda.map(delBorrador), heroe: null },
      derecha: { unidades: derecha.map(delBorrador), heroe: null },
      reglas: REGLAS_DEL_JUEGO,
    },
    rng,
  );
}

/** Una sesión solo con puestos, sin héroes y con las reglas del juego, sin empezar. */
function sesion(
  izquierda: readonly PuestoDeArena[],
  derecha: readonly PuestoDeArena[],
  semilla: number,
): SesionDeArena {
  return new SesionDeArena(
    {
      izquierda: { puestos: izquierda, heroe: null },
      derecha: { puestos: derecha, heroe: null },
      reglas: REGLAS_DEL_JUEGO,
    },
    semilla,
  );
}

/** La tarjeta de una unidad del borrador, como la da `main.ts`. */
const tarjeta = (u: UnidadDeArena): DatosDePuesto => ({
  nombre: u.name,
  resumen: resumenDeCifras(u),
  figura: u.id,
  sello: 'borrador',
});

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
  const s = sesion(izquierda, derecha, semilla);
  s.empezar();
  return s;
}
const yo = (u: UnidadDeArena): PuestoDeArena => ({ fuente: delBorrador(u), ia: false });

describe('la arena pelea con las cifras del borrador', () => {
  it('las cifras editadas llegan al stack tal cual, sin pasar por el catálogo', () => {
    // `templario-monje` no es una criatura del catálogo: si algo llamara a
    // `creature()` con él, lanzaría. Y el ataque de 42 no es el de nadie.
    const monje = unidad('templario-monje', { attack: 42, damage: [3, 9], hp: 21, shots: 5 });
    const b = pelea([monje], [unidad('zombi')], createRng(1));
    const s = b.stacks.find((x) => x.side === 'attacker');
    expect(s?.body).toBe('templario-monje');
    expect(s?.origen.kind).toBe('personaje');
    expect(s?.unit).toMatchObject({ attack: 42, damage: [3, 9], hp: 21, shots: 5, nivel: 2 });
    expect(s?.topHp).toBe(21);
    expect(s?.shotsLeft).toBe(5);
  });

  it('los rasgos del motor van con la unidad, y las habilidades no pelean', () => {
    const jinete = unidad('templario-hermano-de-carga', { habilidades: ['Salto'] });
    const b = pelea([jinete], [unidad('zombi', { traits: ['undead'] })], createRng(1));
    const [a, d] = [b.stacks[0], b.stacks[1]];
    expect(a?.unit.traits).toEqual(['charge']);
    expect(d?.unit.traits).toEqual(['undead']);
    // El no-muerto, a moral 0 como en el juego: el rasgo es el del motor.
    expect(d?.morale).toBe(0);
    expect(JSON.stringify(a?.unit)).not.toContain('Salto');
  });

  it('pasarse de lo que cabe en un bando lanza diciendo cuántas caben', () => {
    const muchos = Array.from({ length: LIDERAZGO.maxPorBando + 1 }, () => unidad('zombi'));
    expect(() => pelea(muchos, [unidad('zombi')], createRng(1))).toThrow(
      `el bando izquierdo lleva ${LIDERAZGO.maxPorBando + 1} unidades y caben ${LIDERAZGO.maxPorBando}: quita 1`,
    );
    expect(() => pelea([unidad('zombi')], [], createRng(1))).toThrow('el bando derecho está vacío');
    // Lo que cabe, cabe: siete grandes en un bando también.
    const grandes = Array.from({ length: LIDERAZGO.maxPorBando }, () =>
      unidad('troll-maza', { hexes: 2 }),
    );
    expect(() => pelea(grandes, grandes, createRng(1))).not.toThrow();
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
    const b = pelea([unidad('templario-hermano-de-carga')], [unidad('zombi')], createRng(1));
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
      fuente: { kind: 'hoja', hoja: 'zombi' } as const,
      ia: i > 0,
    }));
    const m = marcadoDe(
      renderBando(
        'derecha',
        puestos,
        () => tarjeta(unidad('zombi')),
        null,
        LIDERAZGO.maxPorBando,
        null,
        puestos.length,
      ),
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
    const s = sesion([ia(unidad('templario-escudo'))], [ia(unidad('orko-dos-armas'))], 5);
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
    const s = sesion([ia(unidad('templario-escudo'))], [ia(unidad('orko-dos-armas'))], 5);
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
      causa: 'agotada',
      empate: true,
      ganador: 'derecha',
    });
    const texto = marcadoDe(renderPanelDeBatalla(eterna, false));
    expect(texto).toContain(
      `Sin vencedor en ${MAX_ROUNDS} rondas: por tiempo, con las mismas unidades en pie, gana quien defiende. Gana el bando derecho.`,
    );
    const corta = montada([ia(unidad('zombi'))], [ia(unidad('templario-mandoble'))], 2);
    expect(finalDeArena(corta.battle)?.causa).toBe('sin_tropa');
    expect(marcadoDe(renderPanelDeBatalla(corta, false))).not.toContain('por tiempo');
  });

  it('H1 del banco: si cae un héroe, gana el otro por eso y no «por tiempo»', () => {
    // La receta de QA: `/arena/?seed=11`, un piquero del catálogo y el héroe por
    // defecto en cada lado, todo en IA. El héroe izquierdo lanza el Rayo sobre el
    // derecho en la ronda 1 y la pelea acaba con los dos piqueros en pie.
    const lado = (l: 'izquierda' | 'derecha') => ({
      puestos: [{ fuente: { kind: 'catalogo', id: 'pikeman', cambios: null } as const, ia: true }],
      heroe: { datos: heroePorDefecto(l), ia: true },
    });
    const s = new SesionDeArena(
      { izquierda: lado('izquierda'), derecha: lado('derecha'), reglas: REGLAS_DEL_JUEGO },
      11,
    );
    s.empezar();
    expect(s.battle.round).toBe(1);
    expect(s.battle.stacks.filter((x) => x.origen.kind !== 'heroe' && isAlive(x))).toHaveLength(2);
    expect(finalDeArena(s.battle)).toMatchObject({ ganador: 'izquierda', causa: 'heroe' });
    const texto = marcadoDe(renderPanelDeBatalla(s, false));
    expect(texto).toContain(
      'Gana el bando izquierdo en la ronda 1: cayó el héroe del bando derecho.',
    );
    expect(texto).not.toContain('por tiempo');
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
      renderBando(
        'izquierda',
        [{ clave: 1, fuente: { kind: 'hoja', hoja: grande.id }, ia: false }],
        () => tarjeta(grande),
        null,
        7,
        null,
        1,
      ),
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
    const b = pelea([unidad('heroe-elfo-danzante-de-espadas')], [unidad('zombi')], createRng(1));
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
    const s = sesion(
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

describe('una unidad a medias en el taller (#140)', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir !== null) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  /** Un repo de mentira donde el zombi tiene sus direcciones de la 0 a la 6. */
  function zombiASieteDirecciones(): string {
    dir = mkdtempSync(join(tmpdir(), 'arena-a-medias-'));
    for (let d = 0; d < 7; d++) {
      const carpeta = join(dir, 'assets/unidades/zombi', `d${d}`);
      mkdirSync(carpeta, { recursive: true });
      for (const f of ['atlas.json', 'atlas.webp']) writeFileSync(join(carpeta, f), '');
    }
    return dir;
  }

  it('la lista de la arena no cae: la lista entera, y esa con el motivo y sin direcciones', () => {
    const raiz = zombiASieteDirecciones();
    const hojas = hojasDeArena(raiz);
    expect(hojas.map((h) => h.id)).toEqual(HOJAS.map((h) => h.id));
    const zombi = hojas.find((h) => h.id === 'zombi');
    expect(zombi?.direcciones).toBeNull();
    expect(zombi?.incompleta).toBe(
      'zombi tiene 7 de sus 8 direcciones (le faltan d7): o se terminan o se quitan, porque con menos se pintaría entera con el Y Bot sin decirlo',
    );
    // Las demás, sin arte en este repo de mentira, van con el Y Bot y montables.
    for (const h of hojas.filter((x) => x.id !== 'zombi')) expect(h.incompleta, h.id).toBeNull();
    // Y el cable la lleva tal cual hasta la página.
    expect(validarHojasDeArena(JSON.parse(JSON.stringify(hojas)))).toEqual(hojas);
  });

  it('el visor del taller sigue lanzando con el mismo motivo: allí no hay dónde decir «a medias»', () => {
    const raiz = zombiASieteDirecciones();
    const arte = arteEnOchoDirecciones(raiz, 'zombi');
    expect(arte.hecho).toBe('a-medias');
    expect(() => tieneSusOchoDirecciones(raiz, 'zombi')).toThrow(/le faltan d7/);
    expect(arteEnOchoDirecciones(raiz, 'espectro')).toEqual({ hecho: 'ninguno' });
    expect(arteEnOchoDirecciones(RAIZ, 'zombi')).toEqual({ hecho: 'entero' });
  });

  it('las de hoy llegan todas completas', () => {
    for (const h of HOJAS) expect(h.incompleta, h.id).toBeNull();
  });

  it('el catálogo la enseña con su motivo y sin botones que la monten', () => {
    const hojas = hojasDeArena(zombiASieteDirecciones());
    const m = marcadoDe(renderCatalogo(hojas, 'todas'));
    const tarjeta = m.slice(m.indexOf('data-hoja-catalogo="zombi"'));
    const delZombi = tarjeta.slice(0, tarjeta.indexOf('</div>'));
    expect(delZombi).toContain('Incompleta: zombi tiene 7 de sus 8 direcciones');
    expect(delZombi.match(/data-arena="añadir"[^>]*disabled/g)?.length).toBe(2);
    // Las demás se montan.
    expect(m.match(/data-arena="añadir"[^>]*disabled/g)?.length).toBe(2);
    expect(m).toContain('class="hoja incompleta"');
  });

  it('la lista rechaza una hoja incompleta que trae direcciones, o que no dice si lo está', () => {
    const buena = HOJAS.find((h) => h.id === 'templario-escudo') as (typeof HOJAS)[number];
    expect(() => validarHojasDeArena([{ ...buena, incompleta: 'le falta d7' }])).toThrow(
      'la hoja "templario-escudo": dice que está incompleta y trae sus direcciones',
    );
    const { incompleta: _fuera, ...sinCampo } = buena;
    expect(() => validarHojasDeArena([sinCampo])).toThrow(
      'la hoja "templario-escudo": por qué está incompleta tiene que ser un texto no vacío',
    );
  });
});

// ------------------------------------------------------------------ banco de combate

const catalogo = (id: string, cambios: CambiosDeCatalogo | null = null): FuenteDeArena => ({
  kind: 'catalogo',
  id,
  cambios,
});

const MAGO: HeroeDeArena = {
  nombre: 'Maga de pruebas',
  figura: null,
  ataque: 2,
  defensa: 1,
  poder: 3,
  conocimiento: 4,
  hechizos: allSpells().map((s) => s.id),
};

/** Juega la batalla entera con la IA en los dos bandos, como `autoResolve`. */
function aLaIA(b: BattleState, rng: Rng): BattleState {
  for (let n = 0; b.finished === null; n++) {
    if (n > 5000) throw new Error('la IA no acaba la batalla');
    applyAction(b, chooseBattleAction(b), rng);
  }
  return b;
}

describe('la arena como banco de combate', () => {
  it('C4: con todas las reglas en «nuestra», la arena pelea exactamente como el juego', () => {
    // El mismo ejército por las dos puertas: la del juego (`createBattle`, la que
    // llama `battleSideForHero`) y la de la arena. Héroes con todo el libro,
    // tiradores, caballería que carga, no-muertos y la momia: que se jueguen
    // todas las reglas que tienen interruptor.
    const izquierda = ['archer', 'cavalry', 'swordsman', 'paladin'];
    const derecha = ['skeleton', 'mummy', 'lich', 'vampire'];
    for (const semilla of [1, 2, 3, 4, 5, 6]) {
      const juego = aLaIA(
        createBattle(
          { army: izquierda.map((c) => ({ creature: c, count: 1 })), hero: heroeDeArena(MAGO) },
          { army: derecha.map((c) => ({ creature: c, count: 1 })), hero: heroeDeArena(MAGO) },
          createRng(semilla),
        ),
        createRng(semilla + 100),
      );
      const arena = aLaIA(
        batallaDeArena(
          {
            izquierda: { unidades: izquierda.map((c) => catalogo(c)), heroe: MAGO },
            derecha: { unidades: derecha.map((c) => catalogo(c)), heroe: MAGO },
            reglas: REGLAS_DEL_JUEGO,
          },
          createRng(semilla),
        ),
        createRng(semilla + 100),
      );
      expect(arena.reglas).toEqual(REGLAS_DEL_JUEGO);
      expect(arena.log).toEqual(juego.log);
      // Y la batalla se jugó de verdad: hubo hechizos y golpes.
      expect(juego.log.some((e) => e.kind === 'cast')).toBe(true);
    }
  });

  it('C1: una criatura del catálogo sin tocar entra por la vía del juego', () => {
    const b = batallaDeArena(
      {
        izquierda: { unidades: [catalogo('pikeman'), delBorrador(unidad('zombi'))], heroe: null },
        derecha: { unidades: [catalogo('skeleton')], heroe: null },
        reglas: REGLAS_DEL_JUEGO,
      },
      createRng(1),
    );
    const piquero = b.stacks.find((s) => s.body === 'pikeman');
    expect(piquero?.origen.kind).toBe('catalogo');
    // La misma referencia del catálogo: sus cifras y sus rasgos de verdad.
    expect(piquero?.unit).toBe(creature('pikeman'));
    expect(b.stacks.find((s) => s.body === 'skeleton')?.unit.traits).toEqual(['undead']);
    // Y se mezcla con una del borrador en el mismo bando.
    expect(b.stacks.find((s) => s.body === 'zombi')?.origen.kind).toBe('personaje');
  });

  it('C1: editarla es una prueba: cambia en la pelea y no en el catálogo', () => {
    const antes = structuredClone(creature('cavalry'));
    const cambios: CambiosDeCatalogo = { attack: 30, damage: [1, 2], casillas: 3, traits: [] };
    const b = batallaDeArena(
      {
        izquierda: { unidades: [catalogo('cavalry', cambios), catalogo('pikeman')], heroe: null },
        derecha: { unidades: [catalogo('skeleton')], heroe: null },
        reglas: REGLAS_DEL_JUEGO,
      },
      createRng(1),
    );
    const jinete = b.stacks.find((s) => s.body === 'cavalry');
    expect(jinete?.unit).toMatchObject({
      attack: 30,
      damage: [1, 2],
      speed: 'slow',
      traits: [],
      faction: 'knight',
    });
    expect(creature('cavalry')).toEqual(antes);
    // Conserva su facción: dos de caballeros, la moral de una sola facción.
    expect(jinete?.morale).toBe(1);
    expect(() => cifrasDeCatalogoEnLaArena('cavalry', { hp: 0 })).toThrow(
      'Caballería (prueba del catálogo): la vida tiene que ser 1 o más, y es 0',
    );
    expect(() => cifrasDeCatalogoEnLaArena('cavalry', { growth: 3 } as never)).toThrow(
      '«growth» no se cambia en la arena',
    );
  });

  it('C1: todas las criaturas del catálogo se pueden montar', () => {
    expect(criaturasDelCatalogo().map((c) => c.id)).toEqual(allCreatures().map((c) => c.id));
  });

  it('C2: el héroe sale con 10 × Conocimiento de maná, y lo que lanza dura su Poder', () => {
    const s = new SesionDeArena(
      {
        izquierda: { puestos: [yo(unidad('templario-escudo'))], heroe: { datos: MAGO, ia: false } },
        derecha: { puestos: [ia(unidad('zombi'))], heroe: null },
        reglas: REGLAS_DEL_JUEGO,
      },
      1,
    );
    s.empezar();
    expect(s.battle.heroes.attacker).toMatchObject({ mana: 40, spellPower: 3, ataque: 2 });
    const heroe = s.battle.stacks.find((x) => x.origen.kind === 'heroe');
    expect(heroe?.body).toBe('hero');
    // Con la Prisa del libro sobre una unidad propia, cuando le toque a la persona.
    while (s.turnoPropio === null && s.battle.finished === null)
      s.playBattleAction({ type: 'end_turn' });
    const propia = s.turnoPropio?.stack;
    if (propia === undefined) throw new Error('la persona no llega a mover');
    s.hechizos.selectSpell('haste');
    expect(s.hechizos.selectedSpell).toBe('haste');
    s.playBattleAction({ type: 'cast', spell: 'haste', target: propia.id });
    expect(propia.effects).toEqual([expect.objectContaining({ source: 'haste', roundsLeft: 3 })]);
    expect(s.battle.heroes.attacker?.mana).toBe(37);
    expect(s.hechizos.selectedSpell).toBeNull();
  });

  it('C2: la ficha del héroe enseña lo que rinde con sus cifras, y cuenta en el bando', () => {
    const ficha = fichaDeHeroeDeArena(MAGO, REGLAS_DEL_JUEGO);
    expect(ficha.mana).toBe(40);
    // El cuerpo con el que pisa el tablero: sus cifras con el equipo base puesto,
    // como el de un héroe recién hecho en la partida.
    expect(ficha.cuerpo).toEqual(heroeDeArena(MAGO).cuerpo);
    expect(ficha.cuerpo.attack).toBeGreaterThanOrEqual(MAGO.ataque);
    expect(ficha.hechizos.find((h) => h.id === 'magic_arrow')?.rinde).toBe(10 + 10 * 3);
    expect(ficha.hechizos.find((h) => h.id === 'bless')?.efecto).toMatchObject({
      kind: 'luck',
      roundsLeft: 3,
    });
    const conF2 = fichaDeHeroeDeArena(MAGO, reglasDeLaURL('bendicion'));
    expect(conF2.hechizos.find((h) => h.id === 'bless')?.efecto).toMatchObject({ kind: 'tirada' });
    const llenos = Array.from({ length: LIDERAZGO.maxPorBando }, () =>
      delBorrador(unidad('zombi')),
    );
    expect(() =>
      batallaDeArena(
        {
          izquierda: { unidades: llenos, heroe: MAGO },
          derecha: { unidades: [catalogo('pikeman')], heroe: null },
          reglas: REGLAS_DEL_JUEGO,
        },
        createRng(1),
      ),
    ).toThrow(`lleva ${LIDERAZGO.maxPorBando + 1} unidades, contando a su héroe, y caben`);
    expect(() => validarHeroeDeArena({ ...MAGO, poder: 0 })).toThrow(
      'el héroe: el poder tiene que ser 1 o más, y es 0',
    );
    expect(() => validarHeroeDeArena({ ...MAGO, hechizos: ['fireball'] })).toThrow(
      'hechizo desconocido: "fireball"',
    );
  });

  it('C2: la figura del héroe es la hoja que se elija, y el maná es de cada pelea', () => {
    const lado = {
      izquierda: {
        unidades: [catalogo('pikeman')],
        heroe: { ...MAGO, figura: 'heroe-elfo-druida' },
      },
      derecha: { unidades: [catalogo('skeleton')], heroe: null },
      reglas: REGLAS_DEL_JUEGO,
    };
    const b = batallaDeArena(lado, createRng(1));
    expect(b.stacks.find((s) => s.origen.kind === 'heroe')?.body).toBe('heroe-elfo-druida');
    b.heroes.attacker!.mana = 0;
    expect(batallaDeArena(lado, createRng(1)).heroes.attacker?.mana).toBe(40);
  });

  it('C3: un lanzamiento sin maná se rechaza con el motivo de castBlocker', () => {
    const s = new SesionDeArena(
      {
        izquierda: {
          puestos: [yo(unidad('templario-escudo'))],
          heroe: { datos: { ...MAGO, conocimiento: 0 }, ia: false },
        },
        derecha: { puestos: [ia(unidad('zombi'))], heroe: null },
        reglas: REGLAS_DEL_JUEGO,
      },
      2,
    );
    s.empezar();
    while (s.turnoPropio === null && s.battle.finished === null)
      s.playBattleAction({ type: 'end_turn' });
    s.hechizos.selectSpell('magic_arrow');
    expect(s.status).toBe(
      'No puedes lanzar Flecha mágica: maná insuficiente: cuesta 3 y quedan 0.',
    );
    expect(s.hechizos.selectedSpell).toBeNull();
    expect(s.spellOptions().every((o) => !o.castable)).toBe(true);
  });

  it('C3: la IA con libro lanza con la heurística del juego', () => {
    let lanzados = 0;
    for (const semilla of [1, 2, 3]) {
      const s = new SesionDeArena(
        {
          izquierda: {
            puestos: [ia(unidad('templario-escudo'))],
            heroe: { datos: MAGO, ia: true },
          },
          derecha: { puestos: [ia(unidad('orko-dos-armas'))], heroe: null },
          reglas: REGLAS_DEL_JUEGO,
        },
        semilla,
      );
      s.empezar();
      expect(s.battle.finished).not.toBeNull();
      lanzados += s.battle.log.filter((e) => e.kind === 'cast').length;
    }
    expect(lanzados).toBeGreaterThan(0);
  });

  it('la previsión sale en la sesión para la acción de la persona, y nada para la IA', () => {
    const s = new SesionDeArena(
      {
        izquierda: { puestos: [yo(unidad('elfo-arquero'))], heroe: null },
        derecha: { puestos: [ia(unidad('zombi'))], heroe: null },
        reglas: reglasDeLaURL('tirador'),
      },
      1,
    );
    expect(s.prevision({ type: 'shoot', target: 'defender-0' })).toBeNull();
    s.empezar();
    while (s.turnoPropio === null && s.battle.finished === null)
      s.playBattleAction({ type: 'end_turn' });
    const disparo = s.battleLegalActions().find((a) => a.type === 'shoot');
    if (disparo === undefined) throw new Error('el arquero no puede disparar');
    const p = s.prevision(disparo);
    expect(p).toMatchObject({ kind: 'disparo', reglas: ['tirador'] });
  });
});

describe('el montaje del banco de combate', () => {
  it('la figura genérica del héroe es la del juego', () => {
    expect(FIGURA_GENERICA).toBe(HERO_BODY);
  });

  it('los seis interruptores, con lo que dice cada versión y cuál está puesta', () => {
    const m = marcadoDe(renderReglas(reglasDeLaURL('bendicion')));
    expect(m).toContain('Reglas · 1 de fheroes2');
    expect(m.match(/data-arena="regla"/g)?.length).toBe(2 * 6);
    expect(m).toContain('data-regla="bendicion" data-version="fheroes2" class="primary"');
    expect(m).toContain('daño máximo y daño mínimo (también la Maldición de la momia)');
    expect(marcadoDe(renderReglas(REGLAS_DEL_JUEGO))).toContain('Reglas · las del juego');
  });

  it('la lista del catálogo sella cada criatura, y su ficha dice que es una prueba', () => {
    const m = marcadoDe(
      renderCatalogo(HOJAS, 'catalogo', [{ id: 'pikeman', name: 'Piquero', resumen: 'A 5' }]),
    );
    expect(m).toContain('data-criatura-catalogo="pikeman"');
    expect(m).toContain('<span class="sello">catálogo</span>');
    expect(m).toContain(
      'data-arena="añadir-catalogo" data-lado="izquierda" data-criatura="pikeman"',
    );
    const ficha = marcadoDe(renderFichaDeCatalogo('pikeman', creature('pikeman'), false));
    expect(ficha).toContain('es una prueba: no se guarda en data/creatures.json ni en el borrador');
    expect(ficha).not.toContain('data-arena="deshacer-prueba"');
    expect(marcadoDe(renderFichaDeCatalogo('pikeman', creature('pikeman'), true))).toContain(
      'data-arena="deshacer-prueba"',
    );
  });

  it('la ficha del héroe enseña los valores con los que pelea, de las reglas en curso', () => {
    const hojas = [{ id: 'heroe-elfo-druida', nombre: 'Druida' }];
    const m = marcadoDe(renderFichaDeHeroe('izquierda', MAGO, REGLAS_DEL_JUEGO, hojas));
    expect(m).toContain('<span>40 (10 × Conocimiento)</span>');
    expect(m).toContain('3 rondas (su Poder)');
    expect(m).toContain('Flecha mágica (3)</span><span>40 de daño');
    expect(m).toContain('nada: su ataque y su defensa son de su cuerpo');
    expect(m).toContain('<option value="heroe-elfo-druida" >Druida</option>');
    const f2 = marcadoDe(
      renderFichaDeHeroe('izquierda', MAGO, reglasDeLaURL('heroe,bendicion'), hojas),
    );
    expect(f2).toContain('+2 de ataque y +1 de defensa (fheroes2)');
    expect(f2).toContain('Bendición (3)</span><span>daño máximo, 3 rondas');
    // H5 del banco: con Poder 1 decía «1 rondas».
    const poder1 = marcadoDe(
      renderFichaDeHeroe('izquierda', heroePorDefecto('izquierda'), REGLAS_DEL_JUEGO, hojas),
    );
    expect(poder1).toContain('1 ronda (su Poder)');
    expect(poder1).toContain('Bendición (3)</span><span>suerte +1, 1 ronda<');
    expect(poder1).not.toContain('1 rondas');
  });

  it('el panel de la pelea lleva el maná, las reglas y el libro de la persona', () => {
    const s = new SesionDeArena(
      {
        izquierda: { puestos: [yo(unidad('templario-escudo'))], heroe: { datos: MAGO, ia: false } },
        derecha: { puestos: [ia(unidad('zombi'))], heroe: null },
        reglas: reglasDeLaURL('tirador'),
      },
      1,
    );
    s.empezar();
    while (s.turnoPropio === null && s.battle.finished === null)
      s.playBattleAction({ type: 'end_turn' });
    const m = marcadoDe(renderPanelDeBatalla(s, false));
    expect(m).toContain('Maná de Maga de pruebas</span><span>40 / 40');
    expect(m).toContain('<span>Tirador</span>');
    expect(m).toContain('data-action="battle-spell" data-spell="magic_arrow"');
  });
});

// ------------------------------------------------------------------ el enlace de la pelea

describe('el enlace de la pelea (H6 de QA del banco)', () => {
  /** Un montaje con todo lo que lleva el enlace: hojas editadas, catálogo con y sin prueba, héroes. */
  const MONTAJE: MontajeDelEnlace = {
    unidades: [unidad('templario-escudo', { attack: 11 }), unidad('zombi')],
    pruebas: { pikeman: { attack: 8, damage: [2, 4] } },
    izquierda: {
      puestos: [
        { kind: 'hoja', hoja: 'templario-escudo', ia: false },
        { kind: 'catalogo', id: 'pikeman', ia: true },
        { kind: 'hoja', hoja: 'templario-escudo', ia: true },
      ],
      heroe: { datos: { ...MAGO, figura: 'heroe-elfo-druida', poder: 5 }, ia: false },
    },
    derecha: {
      puestos: [
        { kind: 'hoja', hoja: 'zombi', ia: true },
        { kind: 'catalogo', id: 'archer', ia: true },
      ],
      heroe: { datos: heroePorDefecto('derecha'), ia: true },
    },
  };

  /** El enlace de `MONTAJE` con algo cambiado a mano, como lo dejaría una errata. */
  const tocado = (cambiar: (o: Record<string, any>) => void): string => {
    const o = JSON.parse(montajeALaURL(MONTAJE));
    cambiar(o);
    return JSON.stringify(o);
  };

  it('va y vuelve igual, y la pelea del enlace es la misma pelea', () => {
    const texto = montajeALaURL(MONTAJE);
    const leido = montajeDeLaURL(texto);
    expect(leido).toEqual(MONTAJE);
    expect(montajeALaURL(leido)).toBe(texto);
    // A través de URLSearchParams, que es por donde viaja.
    const url = new URLSearchParams({ montaje: texto }).toString();
    expect(montajeDeLaURL(new URLSearchParams(url).get('montaje') as string)).toEqual(MONTAJE);
    const sesionDe = (m: MontajeDelEnlace): SesionDeArena => {
      const lado = (l: 'izquierda' | 'derecha') => ({
        puestos: m[l].puestos.map(
          (p): PuestoDeArena => ({
            fuente:
              p.kind === 'hoja'
                ? delBorrador(m.unidades.find((u) => u.id === p.hoja) as UnidadDeArena)
                : catalogo(p.id, m.pruebas[p.id] ?? null),
            ia: true,
          }),
        ),
        heroe:
          m[l].heroe === null ? null : { ...(m[l].heroe as { datos: HeroeDeArena }), ia: true },
      });
      const s = new SesionDeArena(
        {
          izquierda: lado('izquierda'),
          derecha: lado('derecha'),
          reglas: reglasDeLaURL('tirador'),
        },
        7,
      );
      s.empezar();
      return s;
    };
    const a = sesionDe(MONTAJE);
    expect(a.battle.finished).not.toBeNull();
    expect(sesionDe(leido).battle.log).toEqual(a.battle.log);
  });

  it('un enlace mal formado o con lo que no existe se rechaza diciendo qué', () => {
    const casos: [string, string][] = [
      ['{"v":1,', 'el montaje del enlace no se puede leer'],
      [tocado((o) => (o.v = 2)), 'es de la versión 2 y esta arena lee la 1'],
      [tocado((o) => (o.sobra = 1)), '«sobra» no es un campo del enlace'],
      [tocado((o) => delete o.derecha), 'falta «derecha»'],
      [
        tocado((o) => (o.izquierda.puestos[1].criatura = 'dragon_rojo')),
        'criatura desconocida: "dragon_rojo"',
      ],
      [tocado((o) => (o.izquierda.puestos[0].ia = 'si')), '«ia» tiene que ser true o false'],
      [
        tocado((o) => (o.izquierda.puestos[0].hoja = 'monje-inventado')),
        'pone «monje-inventado» y no trae sus cifras',
      ],
      [
        tocado((o) => o.unidades.push(unidad('orko-dos-armas'))),
        'trae las cifras de «orko-dos-armas» y no la monta',
      ],
      [
        tocado((o) => (o.pruebas.cavalry = { attack: 3 })),
        'trae una prueba de «cavalry» y no la monta',
      ],
      [tocado((o) => (o.pruebas.pikeman = { attack: -1 })), 'el ataque tiene que ser 0 o más'],
      [tocado((o) => (o.unidades[0].attack = 'mucho')), 'tiene que ser un número entero'],
      [tocado((o) => o.derecha.heroe.hechizos.push('meteorito')), 'meteorito'],
      [
        tocado((o) => (o.derecha.heroe.figura = 5)),
        'la figura tiene que ser el id de una hoja o null',
      ],
      [tocado((o) => (o.derecha.heroe.poder = 0)), 'el poder tiene que ser 1 o más'],
      [
        tocado((o) => {
          o.derecha.puestos = Array.from({ length: LIDERAZGO.maxPorBando }, () => ({
            criatura: 'archer',
            ia: true,
          }));
        }),
        `lleva ${LIDERAZGO.maxPorBando + 1} y caben ${LIDERAZGO.maxPorBando}`,
      ],
    ];
    for (const [texto, motivo] of casos) {
      expect(() => montajeDeLaURL(texto), motivo).toThrow(motivo);
    }
  });

  it('un parámetro repetido en la URL se rechaza diciéndolo (H4 de QA del banco)', () => {
    const repetido = new URLSearchParams('seed=5&reglas=tirador&reglas=bendicion');
    expect(() => unaVezEnLaURL(repetido.getAll('reglas'), 'reglas')).toThrow(
      '«reglas» va 2 veces en la URL («tirador», «bendicion»): pon uno solo, con las reglas separadas por comas (reglas=tirador,bendicion)',
    );
    expect(unaVezEnLaURL(repetido.getAll('seed'), 'seed')).toBe('5');
    expect(unaVezEnLaURL(repetido.getAll('montaje'), 'montaje')).toBeNull();
  });
});
