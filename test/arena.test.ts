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
  CAMBIO_EN_COMBATE,
  type DatosDePuesto,
  enElMontaje,
  FIGURA_GENERICA,
  renderBando,
  renderCatalogo,
  renderFicha,
  renderFichaDeHeroe,
  renderPanelDeBatalla,
  renderReglas,
  resumenDeCifras,
} from '../src/client/arena/paneles.js';
import { marcadoDe } from '../src/client/html.js';
import { arteDe, juegosDelYBot, registrarUnidad } from '../src/client/render/personajes.js';
import { type LadoDeSesion, SesionDeArena } from '../src/client/session.js';
import { nombreEnElCampo } from '../src/client/views/distintivo.js';
import { renderBattleLog } from '../src/client/views/panels.js';
import { chooseBattleAction } from '../src/core/ai/tactics.js';
import {
  batallaDeArena,
  COMENTARIO_DEL_BORRADOR,
  catalogoDeLaArena,
  equiparEnArena,
  escalonDeCasillas,
  type FuenteDeArena,
  fichaDeHeroeDeArena,
  finalDeArena,
  HABILIDADES_DE_LA_ARENA,
  type HeroeDeArena,
  heroeDeArena,
  heroePorDefecto,
  type IdsOcupados,
  KIT_DEL_PERFIL,
  lecturaDelNivel,
  type MontajeDelEnlace,
  migrarUnidadDeArena,
  montajeALaURL,
  montajeDeArenaDelEnlace,
  montajeDeLaURL,
  perfilDeLasHojas,
  quitarEnArena,
  retocarEnBatalla,
  revisarBorradorDeArena,
  revisarBorradorDeEquipo,
  tipoDelStack,
  type UnidadDeArena,
  unaVezEnLaURL,
  unidadDeCombate,
  unidadNueva,
  unidadPorDefecto,
  VERSION_DEL_ENLACE,
  validarBorradorDeArena,
  validarHeroeDeArena,
  validarHojasDeArena,
  validarUnidadDeArena,
} from '../src/core/arena.js';
import { FORMAS_DE_EJEMPLO, validarFormaDeMuralla } from '../src/core/arena-murallas.js';
import {
  activeStack,
  applyAction,
  ataqueBlocker,
  createBattle,
  isAlive,
  legalActions,
  MAX_ROUNDS,
  stackById,
  stackHexes,
} from '../src/core/battle/battle.js';
import { armaduraDe, armasDe } from '../src/core/battle/damage.js';
import { SIN_MURALLA } from '../src/core/battle/muralla.js';
import { REGLAS_DEL_JUEGO, reglasDeLaURL } from '../src/core/battle/reglas.js';
import { allSpells, spell, spellAmount } from '../src/core/battle/spells.js';
import type { BattleStack, BattleState } from '../src/core/battle/types.js';
import {
  CATALOGO_DE_HABILIDADES,
  creature,
  cuentaTiros,
  isShooter,
  LIDERAZGO,
} from '../src/core/data.js';
import { ESCALA_DE_CIFRAS } from '../src/core/escala.js';
import { conLaArmaduraEnPV } from '../src/core/hero/equipo.js';
import { HERO_BODY } from '../src/core/hero/hero.js';
import { createRng, type Rng } from '../src/core/rng.js';
import { CREATURE_TRAITS, SPEED_TIERS, SPEED_TO_HEXES } from '../src/core/types.js';
import { NOMBRES_DE_DIRECCION } from '../src/shared/arte.js';
import {
  escribirBorrador,
  hojasDeArena,
  leerBorrador,
  RUTA_DEL_BORRADOR,
} from '../tools/arena/borrador.js';
import { VELOCIDAD_DEL_CUERPO } from '../tools/arena/velocidades.js';
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
import {
  DEL_JUEGO,
  delBorrador,
  forzarTurno,
  hojaDeLaArena,
  hojasDeLaArena,
  peleaDelMotor,
  unidadDeArena,
} from './helpers.js';

const RAIZ = resolve(import.meta.dirname, '..');
const HOJAS = hojasDeLaArena();
const hojaPorId = hojaDeLaArena;
const unidad = unidadDeArena;

/** Un bando de la sesión con unidades del borrador y sin héroe, que mueve la IA. */
const ia = (...us: UnidadDeArena[]): LadoDeSesion => ({
  unidades: us.map((u) => delBorrador(u)),
  heroe: null,
  ia: true,
});

/** Una pelea solo con unidades del borrador, sin héroes y con las reglas del juego. */
function pelea(
  izquierda: readonly UnidadDeArena[],
  derecha: readonly UnidadDeArena[],
  rng: Rng,
): BattleState {
  return batallaDeArena(
    {
      izquierda: { unidades: izquierda.map((u) => delBorrador(u)), heroe: null },
      derecha: { unidades: derecha.map((u) => delBorrador(u)), heroe: null },
      reglas: REGLAS_DEL_JUEGO,
      piezas: [],
    },
    rng,
  );
}

/** Una sesión con las reglas del juego, sin empezar. */
function sesion(izquierda: LadoDeSesion, derecha: LadoDeSesion, semilla: number): SesionDeArena {
  return new SesionDeArena({ izquierda, derecha, reglas: REGLAS_DEL_JUEGO, piezas: [] }, semilla);
}

/** La tarjeta de una unidad del borrador, como la da `main.ts`. */
const tarjeta = (u: UnidadDeArena): DatosDePuesto => ({
  nombre: u.name,
  resumen: resumenDeCifras(u, DEL_JUEGO),
  figura: u.id,
  noEscala: null,
});

/** Los ids ocupados de un borrador sin unidades que no validan ni hojas. */
function ocupados(...validas: string[]): IdsOcupados {
  return { validas, sinValidar: [], hojas: [] };
}

/**
 * Una unidad tal como la guardaba el borrador antes de cuerpo y equipo: id = su
 * hoja y unas cifras de combate cualesquiera, de sobra para quitarles el kit de
 * cualquier perfil (los tiradores, con tiros).
 */
function deAntes(id: string, cambios: Record<string, unknown> = {}): Record<string, unknown> {
  const h = hojaPorId(id);
  const tira = h.perfil === 'arco' || h.perfil === 'ballesta';
  return {
    id,
    name: h.nombre,
    faction: h.faccion,
    leadership: 3,
    attack: 12,
    defense: 12,
    damage: [100, 200],
    hp: 400,
    ...(tira ? { shots: 30 } : {}),
    casillas: 4,
    traits: h.faccion === 'no-muertos' ? ['undead'] : [],
    habilidades: [],
    cost: { gold: 100 },
    ...cambios,
  };
}

/** De qué perfil es cada hoja, como lo da la página (`PerfilDe`). */
const perfilDe = perfilDeLasHojas(HOJAS);

/** Lo que la ficha enseña del nivel de una unidad: el de su cuerpo, aunque pelee con su equipo. */
const nivelDeLaHoja = (u: UnidadDeArena): string => lecturaDelNivel(unidadDeCombate(u, DEL_JUEGO));

/** Una unidad de antes de las casillas: sin ellas. */
function aLaAntigua(u: Record<string, unknown>): Record<string, unknown> {
  const { casillas: _fuera, ...resto } = u;
  return resto;
}

/** Una sesión montada y empezada: lo que hace la página al pulsar «Luchar». */
function montada(izquierda: LadoDeSesion, derecha: LadoDeSesion, semilla: number): SesionDeArena {
  const s = sesion(izquierda, derecha, semilla);
  s.empezar();
  return s;
}
/** Un bando de la sesión que mueve la persona. */
const yo = (...us: UnidadDeArena[]): LadoDeSesion => ({ ...ia(...us), ia: false });

describe('la arena pelea con las cifras del borrador', () => {
  it('las cifras editadas llegan al stack tal cual, sin pasar por el catálogo', () => {
    // `templario-monje` no es una criatura del catálogo: si algo llamara a
    // `creature()` con él, lanzaría. Y el ataque de 42 no es el de nadie.
    // Sin equipo: el bastón de su perfil le sumaría daño (eso, en el test de abajo).
    const monje = unidad('templario-monje', {
      attack: 42,
      damage: [3, 9],
      hp: 21,
      equipo: {},
    });
    const b = pelea([monje], [unidad('zombi')], createRng(1));
    const s = b.stacks.find((x) => x.side === 'attacker');
    expect(s?.body).toBe('templario-monje');
    expect(s?.origen.kind).toBe('personaje');
    expect(s?.unit).toMatchObject({ attack: 42, damage: [3, 9], hp: 21 });
    expect(s?.unit).not.toHaveProperty('nivel');
    // Sin munición ni tamaño: la arena no los escribe (13-10-2026).
    expect(s?.unit).not.toHaveProperty('shots');
    expect(s?.unit).not.toHaveProperty('hexes');
    expect(s?.topHp).toBe(21);
  });

  it('con equipo pelea con el cuerpo más las piezas, entra con los puntos de su armadura y se pinta con su cuerpo', () => {
    // El escudo resta un escalón, la brigantina da 7 de armadura y ningún PV
    // (#262) y la espada 2 de ataque y 10-30 de daño (`data/equipo.json`, calidad
    // «arena»).
    const u = unidad('templario-escudo');
    expect(u.equipo).toEqual({ arma: 'espada', armadura: 'brigantina', escudo: 'escudo' });
    const b = pelea([u], [unidad('zombi')], createRng(1));
    const s = b.stacks.find((x) => x.side === 'attacker') as BattleStack;
    expect(s.body).toBe('templario-escudo');
    expect(s.unit).toMatchObject({ attack: 5, defense: 7, damage: [20, 40], hp: 80 });
    expect(armaduraDe(s.unit)).toBe(7);
    expect(SPEED_TO_HEXES[s.unit.speed]).toBe(3);
    expect(s.topHp).toBe(80);
    // El nivel, el del cuerpo: el equipo no cuenta.
    expect(s.unit.sinEquipo).toMatchObject({ attack: 3, defense: 3, damage: [10, 10], hp: 80 });
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
    // Lo que cabe, cabe: siete trolls en un bando también.
    const siete = Array.from({ length: LIDERAZGO.maxPorBando }, () => unidad('troll-maza'));
    expect(() => pelea(siete, siete, createRng(1))).not.toThrow();
  });

  it('con todas en IA la batalla se juega entera al montarla', () => {
    const s = montada(
      ia(unidad('templario-escudo'), unidad('templario-hermano-de-carga')),
      ia(unidad('orko-dos-armas'), unidad('goblin-arquero')),
      1,
    );
    expect(s.battle.finished).not.toBeNull();
    expect(s.turnoPropio).toBeNull();
  });

  it('con el bando «Yo», la sesión se para en los turnos de los suyos y solo en ellos', () => {
    for (const semilla of [1, 7, 12]) {
      const s = montada(
        yo(unidad('templario-escudo'), unidad('templario-mandoble')),
        ia(unidad('orko-dos-armas'), unidad('goblin-arquero')),
        semilla,
      );
      const mios = s.battle.stacks.filter((x) => x.side === 'attacker').map((x) => x.id);
      const suyos = s.battle.stacks.filter((x) => x.side === 'defender').map((x) => x.id);
      expect(mios.map((id) => s.laLlevaLaIA(id))).toEqual([false, false]);
      expect(suyos.map((id) => s.laLlevaLaIA(id))).toEqual([true, true]);
      let turnos = 0;
      let movioLaIA = false;
      while (s.battle.finished === null) {
        // Cada vez que la sesión devuelve el control, la activa es de las mías.
        const activa = activeStack(s.battle);
        expect(mios).toContain(activa?.id);
        expect(s.turnoPropio?.stack.id).toBe(activa?.id);
        expect(s.miBando).toBe('attacker');
        const antes = s.battle.log.length;
        s.playBattleAction(chooseBattleAction(s.battle));
        movioLaIA ||= s.battle.log
          .slice(antes)
          .some((e) => 'stack' in e && suyos.includes(e.stack) && e.kind !== 'perished');
        if (++turnos > 500) throw new Error('la batalla no termina');
      }
      expect(turnos).toBeGreaterThan(0);
      expect(movioLaIA).toBe(true);
    }
  });

  it('las dos manos de la persona: lleva unidades de los dos bandos', () => {
    const s = montada(yo(unidad('zombi')), yo(unidad('esqueleto-guerrero')), 3);
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
    const s = montada(ia(unidad('zombi')), ia(unidad('zombi')), 1);
    const largo = s.battle.log.length;
    s.playBattleAction({ type: 'end_turn' });
    expect(s.status).toBe('Ahora no mueve ninguna unidad tuya.');
    expect(s.battle.log.length).toBe(largo);
  });
});

describe('el nivel de la ficha se deriva de las cifras (12-10-2026)', () => {
  it('la ficha enseña «Índice N · nivel n» y no tiene un campo de nivel que escribir', () => {
    const u = unidad('templario-monje');
    const m = marcadoDe(renderFicha(u, false, enElMontaje(REGLAS_DEL_JUEGO, DEL_JUEGO)));
    expect(m).toContain(nivelDeLaHoja(u));
    expect(m).toMatch(/Índice \d{3} · nivel \d/);
    expect(m).not.toContain('data-campo="level"');
  });

  it('subir una cifra sube el índice que enseña, sin tocar nada más', () => {
    const u = unidad('templario-monje');
    const antes = nivelDeLaHoja(u);
    const despues = nivelDeLaHoja({ ...u, attack: u.attack + 20 });
    expect(despues).not.toBe(antes);
    const indice = (t: string) => Number(/Índice (\d+)/.exec(t)?.[1]);
    expect(indice(despues)).toBeGreaterThan(indice(antes));
  });

  it('un borrador de antes con `level` es de la escala de fheroes2: se lee con PV y daño a la de hoy', () => {
    // Una unidad de antes, escrita como lo escribía la arena antes del nivel
    // derivado: con su nivel a mano y PV y daño a la décima parte.
    const antes = deAntes('templario-monje');
    const hoy = migrarUnidadDeArena(antes, perfilDe, DEL_JUEGO, 'borrador').unidad!;
    const vieja = {
      ...antes,
      level: 9,
      hp: (antes.hp as number) / ESCALA_DE_CIFRAS,
      damage: (antes.damage as number[]).map((d) => d / ESCALA_DE_CIFRAS),
    };
    // Se lee migrada: la escala y, después, cuerpo + el equipo de su perfil.
    const { unidad: leida, aviso } = migrarUnidadDeArena(vieja, perfilDe, DEL_JUEGO, 'borrador');
    expect(aviso).toBeNull();
    expect(leida).not.toHaveProperty('level');
    expect(leida).toEqual(hoy);
    expect(nivelDeLaHoja(leida!)).toBe(nivelDeLaHoja(hoy));
    expect(revisarBorradorDeArena({ unidades: [vieja] }, perfilDe, DEL_JUEGO).validas).toEqual([
      hoy,
    ]);
    // La regla de hoy no la lee: lo de antes solo entra migrándolo.
    expect(() => validarUnidadDeArena(vieja, DEL_JUEGO)).toThrow(
      '«level» no es un campo de la arena',
    );
    // Sin la marca, las mismas cifras son de hoy: un monje de la décima parte.
    const { level: _marca, ...sinMarca } = vieja;
    expect(
      unidadDeCombate(
        migrarUnidadDeArena(sinMarca, perfilDe, DEL_JUEGO, 'borrador').unidad!,
        DEL_JUEGO,
      ).hp,
    ).toBe((antes.hp as number) / ESCALA_DE_CIFRAS);
  });

  it('`level` se lee, pero no se ofrece como campo de la arena', () => {
    const motivo = ((): string => {
      try {
        validarUnidadDeArena({ ...unidad('templario-monje'), growth: 3 }, DEL_JUEGO);
      } catch (err) {
        return String(err);
      }
      throw new Error('una unidad con «growth» se ha validado');
    })();
    expect(motivo).toContain(
      '«growth» no es un campo de la arena; valen id, name, faction, cuerpo, leadership,',
    );
    expect(motivo).not.toMatch(/\blevel\b/);
  });

  it('unas cifras que el índice no sabe medir no entran: se rechazan diciéndolo y la pelea ni se monta (QA, 12-10-2026)', () => {
    // La reproducción de QA: con estas cifras la ficha las aceptaba y la pelea
    // se quedaba en «Contando la jugada…», porque el primer golpe que recibía el
    // guerrero lanzaba dentro de `herir`. Ahora no pasan de la validación, así
    // que no hay batalla y nada llega a `herir`.
    const guerrero = unidad('templario-escudo');
    const enormes: UnidadDeArena[] = [
      { ...guerrero, hp: 1e15 },
      {
        ...guerrero,
        attack: 25,
        defense: 20,
        hp: 10_000_000,
        damage: [guerrero.damage[0], 1_000_000] as const,
      },
    ];
    for (const u of enormes) {
      expect(() => validarUnidadDeArena(u, DEL_JUEGO)).toThrow(
        `la unidad «${guerrero.name}»: estas cifras son demasiado grandes para medir su nivel`,
      );
      expect(() => validarUnidadDeArena(u, DEL_JUEGO)).toThrow('baja la vida o el daño');
      expect(() => pelea([u], [unidad('zombi')], createRng(5))).toThrow('demasiado grandes');
      expect(() => pelea([unidad('zombi')], [u], createRng(5))).toThrow('demasiado grandes');
    }
    // Lo grande pero medible sigue entrando y pelea.
    const grande = validarUnidadDeArena({ ...guerrero, hp: 10_000_000 }, DEL_JUEGO);
    expect(nivelDeLaHoja(grande)).toMatch(/^Índice \d+ · nivel \d+$/);
  });
});

describe('el borrador se valida antes de escribirse', () => {
  const base = (): UnidadDeArena => unidad('templario-monje');

  it('toda hoja sale con unas cifras por defecto que pasan la validación', () => {
    for (const h of HOJAS)
      expect(() => validarUnidadDeArena(unidadPorDefecto(h), DEL_JUEGO), h.id).not.toThrow();
  });

  it('rechaza diciéndolo: velocidad inventada, rasgo inexistente, daño al revés', () => {
    expect(() =>
      migrarUnidadDeArena(
        { ...aLaAntigua(deAntes('templario-monje')), speed: 'rapidisima' },
        perfilDe,
        DEL_JUEGO,
        'borrador',
      ),
    ).toThrow(
      'la unidad «Monje»: la velocidad "rapidisima" no existe; valen very_slow, slow, average, fast, very_fast, ultra_fast',
    );
    expect(() => validarUnidadDeArena({ ...base(), traits: ['volar'] }, DEL_JUEGO)).toThrow(
      'la unidad «Monje»: el rasgo "volar" no existe',
    );
    expect(() => validarUnidadDeArena({ ...base(), damage: [5, 2] }, DEL_JUEGO)).toThrow(
      'la unidad «Monje»: el daño mínimo (5) no puede pasar del máximo (2)',
    );
    expect(() => validarUnidadDeArena({ ...base(), habilidades: ['Volar'] }, DEL_JUEGO)).toThrow(
      'la habilidad "Volar" no existe',
    );
    expect(() => validarUnidadDeArena({ ...base(), hp: 0 }, DEL_JUEGO)).toThrow(
      'la vida tiene que ser 1 o más',
    );
    expect(() => validarUnidadDeArena({ ...base(), attack: 2.5 }, DEL_JUEGO)).toThrow(
      'el ataque tiene que ser un número entero, y es 2.5',
    );
    expect(() => validarUnidadDeArena({ ...base(), attack: Number.NaN }, DEL_JUEGO)).toThrow(
      'la unidad «Monje»: el ataque no tiene valor, el campo está vacío',
    );
    expect(() =>
      validarUnidadDeArena({ ...base(), traits: ['charge', 'charge'] }, DEL_JUEGO),
    ).toThrow('el rasgo "charge" está dos veces');
    // Toda unidad ocupa una casilla (13-10-2026): el tamaño ya no es un campo.
    expect(() => validarUnidadDeArena({ ...base(), hexes: 2 }, DEL_JUEGO)).toThrow(
      '«hexes» no es un campo de la arena',
    );
    expect(() => validarUnidadDeArena({ ...base(), faction: 'knight' }, DEL_JUEGO)).toThrow(
      'la facción "knight" no existe',
    );
  });

  it('sin munición: `shots` no es un campo de la arena, y el motivo no lo ofrece (13-10-2026)', () => {
    // Dispara quien lleva arma a distancia; lo de antes con tiros lo convierte
    // `migrarUnidadDeArena`, no la regla de hoy.
    expect(() => validarUnidadDeArena({ ...base(), shots: 3 }, DEL_JUEGO)).toThrow(
      '«shots» no es un campo de la arena',
    );
    expect(() => validarUnidadDeArena({ ...base(), shots: 3 }, DEL_JUEGO)).not.toThrow(
      /valen .*\bshots\b/,
    );
    expect(() => validarUnidadDeArena({ ...base(), hexes: 2 }, DEL_JUEGO)).not.toThrow(
      /valen .*\bhexes\b/,
    );
  });

  it('el archivo no trae dos veces la misma hoja', () => {
    expect(() => validarBorradorDeArena({ unidades: [base(), base()] }, DEL_JUEGO)).toThrow(
      'la unidad "templario-monje" está dos veces en el borrador',
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
      // Lo que se escribe va en el formato de hoy: lo de antes no se escribe.
      expect(() =>
        escribirBorrador(dir as string, {
          unidades: [{ ...aLaAntigua({ ...base() }), speed: 'x' }],
          piezas: [],
        }),
      ).toThrow('«speed» no es un campo de la arena');
      expect(existsSync(ruta)).toBe(false);
      expect(leerBorrador(dir)).toMatchObject({ unidades: [], invalidas: [], avisos: [] });

      const monje = { ...base(), attack: 9, habilidades: ['Salto'] };
      escribirBorrador(dir, { unidades: [monje], piezas: [] });
      const json = JSON.parse(readFileSync(ruta, 'utf8')) as {
        _comment: string;
        unidades: unknown[];
      };
      expect(json._comment).toContain('BORRADOR');
      expect(leerBorrador(dir).unidades).toEqual([monje]);
      expect(readdirSync(join(dir, 'data/borradores'))).toEqual(['unidades.json']);

      // Un guardado malo después de uno bueno deja el bueno donde estaba.
      expect(() =>
        escribirBorrador(dir as string, { unidades: [{ ...monje, damage: [3, 1] }], piezas: [] }),
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
    // Dos jugadas escritas a mano en el registro, como las escribe el motor: un paso
    // suelto y una carga, con la marca en su `move`.
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
      {
        kind: 'move',
        stack: jinete.id,
        to: { col: 7, row: 4 },
        path: [{ col: 7, row: 4 }],
        charge: true,
      },
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
    const u = { ...unidad('templario-monje'), name: '<b>Monje</b>', habilidades: ['Salto'] };
    const m = marcadoDe(renderFicha(u, false, enElMontaje(REGLAS_DEL_JUEGO, DEL_JUEGO)));
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
    expect(marcadoDe(renderFicha(u, true, enElMontaje(REGLAS_DEL_JUEGO, DEL_JUEGO)))).toContain(
      'data-clip="shoot"',
    );
  });

  it('la ficha lleva el nombre en su título con «✎ Editar», y no entre las cifras', () => {
    const u = { ...unidad('templario-monje'), name: 'Hermano <Monje>' };
    const m = marcadoDe(renderFicha(u, false, enElMontaje(REGLAS_DEL_JUEGO, DEL_JUEGO)));
    const titulo = m.slice(m.indexOf('<header class="titulo-de-ficha">'), m.indexOf('</header>'));
    expect(titulo).toContain('<span class="nombre">Hermano &lt;Monje&gt;</span>');
    expect(titulo).toContain('data-arena="renombrar"');
    expect(titulo).toContain('Ficha · ');
    // El campo de texto del nombre ya no está en el cuerpo; sin renombrar, en ninguna parte.
    expect(m).not.toContain('data-campo="name"');
    expect(m).not.toContain('>Nombre</span>');
    // Tras «✎»: el título es el campo, con el mismo `data-campo` que lee `main.ts`.
    const renombrando = marcadoDe(
      renderFicha(u, false, {
        ...enElMontaje(REGLAS_DEL_JUEGO, DEL_JUEGO),
        renombrando: true,
      }),
    );
    expect(renombrando).toContain(
      '<input type="text" class="renombrar" data-campo="name" value="Hermano &lt;Monje&gt;"',
    );
    expect(renombrando).not.toContain('data-arena="renombrar"');
    // El héroe, igual, con su campo.
    const heroe = marcadoDe(
      renderFichaDeHeroe(
        'izquierda',
        heroePorDefecto('izquierda'),
        enElMontaje(REGLAS_DEL_JUEGO, DEL_JUEGO),
        [],
      ),
    );
    expect(heroe).toContain('data-arena="renombrar"');
    expect(heroe).not.toContain('data-heroe-campo="nombre"');
    expect(
      marcadoDe(
        renderFichaDeHeroe(
          'izquierda',
          heroePorDefecto('izquierda'),
          { ...enElMontaje(REGLAS_DEL_JUEGO, DEL_JUEGO), renombrando: true },
          [],
        ),
      ),
    ).toContain('class="renombrar" data-heroe-campo="nombre"');
  });

  it('los rasgos del motor van como las habilidades: etiquetas con × y el resto en «Añadir»', () => {
    const u = unidad('zombi', { traits: ['undead', 'charge'] });
    const m = marcadoDe(renderFicha(u, false, enElMontaje(REGLAS_DEL_JUEGO, DEL_JUEGO)));
    expect(m).not.toContain('type="checkbox"');
    expect(m).toContain('data-arena="quitar-rasgo" data-rasgo="undead"');
    expect(m).toContain('data-arena="quitar-rasgo" data-rasgo="charge"');
    const select = m.slice(m.indexOf('<select data-arena-rasgo="si">'));
    const opciones = select.slice(0, select.indexOf('</select>'));
    for (const t of CREATURE_TRAITS) {
      const puesto = u.traits.includes(t);
      expect(opciones.includes(`<option value="${t}">`), t).toBe(!puesto);
    }
    // Sin ninguno, «Ninguno.».
    const sinRasgos = marcadoDe(
      renderFicha(unidad('zombi', { traits: [] }), false, enElMontaje(REGLAS_DEL_JUEGO, DEL_JUEGO)),
    );
    expect(sinRasgos).toContain(
      '<div class="etiquetas rasgos-puestos"><span class="cost">Ninguno.</span>',
    );
  });

  it('la cabeza de la ficha: figura y clips en columna a la izquierda, cifras a la derecha; en combate, sin figura', () => {
    const u = unidad('templario-escudo');
    const m = marcadoDe(renderFicha(u, false, enElMontaje(REGLAS_DEL_JUEGO, DEL_JUEGO)));
    const cabeza = m.slice(
      m.indexOf('<div class="cabeza">'),
      m.indexOf('<h3>Rasgos del motor</h3>'),
    );
    expect(cabeza).toContain('<div class="retrato">');
    expect(cabeza).toContain('<canvas class="figura grande"');
    const clips = cabeza.slice(
      cabeza.indexOf('<div class="clips">'),
      cabeza.indexOf('<div class="cifras">'),
    );
    for (const clip of ['idle', 'walk', 'charge', 'attack', 'hurt', 'death']) {
      expect(clips).toContain(`data-clip="${clip}"`);
    }
    expect(clips).toContain('data-arena="girar"');
    // Las cifras, a su lado y no en los clips.
    const cifras = cabeza.slice(cabeza.indexOf('<div class="cifras">'));
    expect(cifras).toContain('data-campo="attack"');
    expect(cifras).toContain('data-campo="gold"');
    expect(clips).not.toContain('data-campo');
    // En el editor de la batalla: sin figura ni clips, las cifras a todo el ancho.
    const enCombate = marcadoDe(
      renderFicha(u, false, {
        enCombate: true,
        reglas: REGLAS_DEL_JUEGO,
        piezas: DEL_JUEGO,
      }),
    );
    expect(enCombate).toContain('<div class="cabeza sin-retrato">');
    expect(enCombate).not.toContain('class="clips"');
    expect(enCombate).not.toContain('<canvas');
    expect(enCombate).toContain('data-arena="renombrar"');
  });

  it('el bando lleva un solo Yo / IA, en su cabecera, y no deja duplicar con el bando lleno', () => {
    const puestos = Array.from({ length: LIDERAZGO.maxPorBando }, (_, i) => ({
      clave: i + 1,
      unidad: 'zombi',
      escalera: false,
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
        true,
      ),
    );
    expect(m).toContain(`Bando derecho · ${LIDERAZGO.maxPorBando} de ${LIDERAZGO.maxPorBando}`);
    // Un Yo y un IA para todo el bando, no uno por puesto; marcado el que manda.
    expect(m.match(/data-arena="manda"/g)?.length).toBe(2);
    expect(m).toMatch(/<h3[^>]*>[\s\S]*data-arena="manda"[\s\S]*<\/h3>/);
    expect(m).toMatch(/data-ia="si" class="boton-de-cabecera primary"/);
    expect(m).not.toMatch(/data-ia="no" class="boton-de-cabecera primary"/);
    expect(m.match(/data-arena="duplicar"[^>]*disabled/g)?.length).toBe(LIDERAZGO.maxPorBando);
  });

  it('el resultado se calla mientras el tablero aún cuenta la jugada', () => {
    const s = montada(ia(unidad('zombi')), ia(unidad('templario-mandoble')), 2);
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
    const s = sesion(ia(unidad('templario-escudo')), ia(unidad('orko-dos-armas')), 5);
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
    const s = sesion(ia(unidad('templario-escudo')), ia(unidad('orko-dos-armas')), 5);
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
          motivo: 'la unidad «Zombie»: la vida tiene que ser 1 o más, y es -1',
          crudo: mala,
        },
      ]);
      // La página guarda lo que tiene —la buena y una nueva— y la mala sigue ahí.
      const nueva = unidad('elfo-arquero');
      expect(escribirBorrador(dir, { unidades: [buena, nueva], piezas: [] })).toMatchObject({
        unidades: 2,
        conservadas: 1,
      });
      const json = JSON.parse(readFileSync(join(dir, RUTA_DEL_BORRADOR), 'utf8')) as {
        unidades: unknown[];
      };
      expect(json.unidades).toEqual([buena, nueva, mala]);
      // Y mandar una válida con su id es arreglarla: la mala se va.
      const arreglada = unidad('zombi');
      expect(
        escribirBorrador(dir, { unidades: [buena, nueva, arreglada], piezas: [] }).conservadas,
      ).toBe(0);
      expect(leerBorrador(dir)).toMatchObject({
        unidades: [buena, nueva, arreglada],
        invalidas: [],
        avisos: [],
      });
    });

    it('una unidad repetida se conserva al guardar otra (QA, M3)', () => {
      dir = mkdtempSync(join(tmpdir(), 'arena-'));
      const buena = unidad('templario-monje', { attack: 11 });
      const repetida = unidad('templario-monje', { attack: 3 });
      escribirAMano(dir, [buena, repetida]);
      expect(leerBorrador(dir).invalidas.map((i) => i.crudo)).toEqual([repetida]);
      const nueva = unidad('elfo-arquero');
      expect(escribirBorrador(dir, { unidades: [buena, nueva], piezas: [] }).conservadas).toBe(1);
      const json = JSON.parse(readFileSync(join(dir, RUTA_DEL_BORRADOR), 'utf8')) as {
        unidades: unknown[];
      };
      expect(json.unidades).toEqual([buena, nueva, repetida]);
    });

    it('un archivo que no se puede leer no se pisa: se dice', () => {
      dir = mkdtempSync(join(tmpdir(), 'arena-'));
      mkdirSync(join(dir, 'data/borradores'), { recursive: true });
      writeFileSync(join(dir, RUTA_DEL_BORRADOR), '{ esto no es json');
      expect(() => leerBorrador(dir as string)).toThrow(`${RUTA_DEL_BORRADOR} no es JSON`);
      expect(() =>
        escribirBorrador(dir as string, { unidades: [unidad('zombi')], piezas: [] }),
      ).toThrow('no se guarda para no pisarlo');
      expect(readFileSync(join(dir, RUTA_DEL_BORRADOR), 'utf8')).toBe('{ esto no es json');
    });

    it('una unidad válida sin hoja se lee y se vuelve a guardar', () => {
      dir = mkdtempSync(join(tmpdir(), 'arena-'));
      const fantasma = { ...unidad('templario-monje'), id: 'templario-fantasma', name: 'Fantasma' };
      escribirAMano(dir, [fantasma]);
      expect(leerBorrador(dir).unidades).toEqual([fantasma]);
      escribirBorrador(dir, { unidades: [fantasma], piezas: [] });
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
      ia(unidad('templario-monje', muro)),
      ia(unidad('orko-dos-armas', muro)),
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
    const corta = montada(ia(unidad('zombi')), ia(unidad('templario-mandoble')), 2);
    expect(finalDeArena(corta.battle)?.causa).toBe('sin_tropa');
    expect(marcadoDe(renderPanelDeBatalla(corta, false))).not.toContain('por tiempo');
  });

  it('H1 del banco: si cae un héroe, gana el otro por eso y no «por tiempo»', () => {
    // La receta de QA: `/arena/?seed=11`, un piquero y el héroe por defecto en
    // cada lado, todo en IA. El héroe izquierdo lanza el Rayo sobre el derecho en
    // la ronda 1 y la pelea acaba con los dos piqueros en pie. El piquero era el
    // del catálogo; desde que el catálogo no está en la arena (13-10-2026), el
    // del imperio.
    const lado = (l: 'izquierda' | 'derecha'): LadoDeSesion => ({
      unidades: [delBorrador(unidad('imperio-piquero'))],
      heroe: heroePorDefecto(l),
      ia: true,
    });
    const s = new SesionDeArena(
      {
        izquierda: lado('izquierda'),
        derecha: lado('derecha'),
        reglas: REGLAS_DEL_JUEGO,
        piezas: [],
      },
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
    expect(() => validarUnidadDeArena({ ...unidad('zombi'), hp: Number.NaN }, DEL_JUEGO)).toThrow(
      'la vida no tiene valor, el campo está vacío',
    );
    expect(() => validarUnidadDeArena({ ...unidad('zombi'), growth: 3 }, DEL_JUEGO)).toThrow(
      'la unidad "zombi": «growth» no es un campo de la arena',
    );
  });

  it('M7: los no muertos salen con `undead`; los demás, no', () => {
    for (const h of HOJAS) {
      expect(unidadPorDefecto(h).traits.includes('undead'), h.id).toBe(h.faccion === 'no-muertos');
    }
  });

  it('M9: la tarjeta dice los rasgos, y ni tiros ni casillas que ocupa (13-10-2026)', () => {
    const grande = unidad('templario-escudo', { traits: ['flying'] });
    const m = marcadoDe(
      renderBando(
        'izquierda',
        [{ clave: 1, unidad: grande.id, escalera: false }],
        () => tarjeta(grande),
        null,
        7,
        null,
        1,
        false,
      ),
    );
    expect(m).toContain('vuela');
    expect(m).not.toContain('hexes');
    expect(m).not.toContain('tiros');
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
  it('cada personaje del taller tiene la velocidad de su cuerpo, y ninguno sobra', () => {
    const personajes = [...UNIDADES, ...HEROES].map((u) => u.personaje ?? u.id);
    expect(Object.keys(VELOCIDAD_DEL_CUERPO).sort()).toEqual([...new Set(personajes)].sort());
    for (const h of HOJAS) {
      expect(h.casillas, h.id).toBe(VELOCIDAD_DEL_CUERPO[h.personaje]?.[0]);
      expect(unidadPorDefecto(h).casillas, h.id).toBe(h.casillas);
    }
    // Un personaje, una velocidad: todas sus hojas comparten cuerpo (12-10-2026).
    const porPersonaje = new Map<string, Set<number>>();
    for (const h of HOJAS) {
      porPersonaje.set(h.personaje, (porPersonaje.get(h.personaje) ?? new Set()).add(h.casillas));
    }
    for (const [p, cs] of porPersonaje) expect(cs.size, p).toBe(1);
  });

  it('el criterio del usuario se cumple en lo que pelea cada hoja por defecto', () => {
    // Las casillas con las que pelea (cuerpo + equipo), que es lo que pedía el
    // criterio de 02-10-2026 cuando la tabla iba por hoja.
    const v = (id: string): number =>
      SPEED_TO_HEXES[unidadDeCombate(unidadPorDefecto(hojaPorId(id)), DEL_JUEGO).speed];
    expect(v('goblin-jinete-de-hiena')).toBeGreaterThan(v('orko-hacha-escudo'));
    // El Danzante, el más rápido de los de a pie: solo el jinete le pasa.
    const aPie = HOJAS.filter((h) => h.id !== 'templario-hermano-de-carga');
    expect(Math.max(...aPie.map((h) => v(h.id)))).toBe(6);
    expect(aPie.filter((h) => v(h.id) === 6).map((h) => h.id)).toEqual([
      'heroe-elfo-danzante-de-espadas',
    ]);
    expect(v('templario-hermano-de-carga')).toBeGreaterThan(6);
    // Y no hay un empate masivo: ninguna velocidad lleva a más de la mitad.
    const cuenta = new Map<number, number>();
    for (const h of HOJAS) cuenta.set(v(h.id), (cuenta.get(v(h.id)) ?? 0) + 1);
    expect(Math.max(...cuenta.values())).toBeLessThan(HOJAS.length / 2);
  });

  it('el motor juega el escalón de esas casillas, y fuera de 2..7 se rechaza diciéndolo', () => {
    for (const t of SPEED_TIERS) expect(escalonDeCasillas(SPEED_TO_HEXES[t])).toBe(t);
    expect(() => escalonDeCasillas(8)).toThrow('la velocidad es de 2 a 7 casillas, y es 8');
    expect(() => validarUnidadDeArena({ ...unidad('zombi'), casillas: 9 }, DEL_JUEGO)).toThrow(
      'la unidad «Zombie»: la velocidad es de 2 a 7 casillas, y es 9',
    );
    expect(() => validarUnidadDeArena({ ...unidad('zombi'), casillas: 1 }, DEL_JUEGO)).toThrow(
      'la velocidad tiene que ser 2 o más, y es 1',
    );
    const b = pelea([unidad('heroe-elfo-danzante-de-espadas')], [unidad('zombi')], createRng(1));
    expect(b.stacks.map((s) => s.unit.speed)).toEqual(['very_fast', 'very_slow']);
  });

  it('un borrador de antes, con la velocidad como escalón, se lee convertido', () => {
    // `fast` es el escalón de 5 casillas: se lee como si trajera las 5.
    const vieja = { ...aLaAntigua(deAntes('zombi')), speed: 'fast' };
    expect(migrarUnidadDeArena(vieja, perfilDe, DEL_JUEGO, 'borrador').unidad).toEqual(
      migrarUnidadDeArena(deAntes('zombi', { casillas: 5 }), perfilDe, DEL_JUEGO, 'borrador')
        .unidad,
    );
    expect(() =>
      migrarUnidadDeArena({ ...vieja, casillas: 5 }, perfilDe, DEL_JUEGO, 'borrador'),
    ).toThrow('trae la velocidad dos veces');
  });

  it('con las velocidades de salida ya no juega un ejército entero y luego el otro', () => {
    const s = sesion(
      ia(
        ...['templario-escudo', 'templario-mandoble', 'templario-escudero'].map((id) => unidad(id)),
      ),
      ia(
        ...['elfo-arquero', 'troll-maza', 'heroe-elfo-danzante-de-espadas'].map((id) => unidad(id)),
      ),
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
    const tarjeta = m.slice(m.indexOf('data-unidad-catalogo="zombi"'));
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

/** Una unidad de la arena por su hoja, como fuente del montaje (el catálogo del juego ya no entra). */
const deLaHoja = (id: string): FuenteDeArena => delBorrador(unidad(id));

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
    // El mismo ejército por las dos puertas: la del juego (`createBattle`, con
    // cada unidad como personaje: la vía por la que entra la arena, `peleaDelMotor`)
    // y la de la arena. Héroes con todo el libro, tiradores, jinetes que cargan y
    // no-muertos: que se jueguen las reglas que tienen interruptor. Hasta el
    // 13-10-2026 eran criaturas del catálogo, que ya no entran en la arena.
    const izquierda = ['elfo-arquero', 'templario-hermano-de-carga', 'templario-escudo'];
    const derecha = ['esqueleto-guerrero', 'esqueleto-arquero', 'caballero-de-la-muerte'];
    const delMotor = (ids: readonly string[]) => ids.map((id) => ({ unidad: unidad(id) }));
    for (const semilla of [1, 2, 3, 4, 5, 6]) {
      const juego = aLaIA(
        peleaDelMotor(delMotor(izquierda), delMotor(derecha), createRng(semilla), SIN_MURALLA, {
          izquierda: heroeDeArena(MAGO, DEL_JUEGO),
          derecha: heroeDeArena(MAGO, DEL_JUEGO),
        }),
        createRng(semilla + 100),
      );
      const arena = aLaIA(
        batallaDeArena(
          {
            izquierda: { unidades: izquierda.map(deLaHoja), heroe: MAGO },
            derecha: { unidades: derecha.map(deLaHoja), heroe: MAGO },
            reglas: REGLAS_DEL_JUEGO,
            piezas: [],
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

  it('C2: el héroe sale con 10 × Conocimiento de maná, y lo que lanza dura su Poder', () => {
    const s = new SesionDeArena(
      {
        izquierda: { ...yo(unidad('templario-escudo')), heroe: MAGO },
        derecha: ia(unidad('zombi')),
        reglas: REGLAS_DEL_JUEGO,
        piezas: [],
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
    const ficha = fichaDeHeroeDeArena(MAGO, REGLAS_DEL_JUEGO, DEL_JUEGO);
    expect(ficha.mana).toBe(40);
    // El cuerpo con el que pisa el tablero: sus cifras con el equipo base puesto,
    // como el de un héroe recién hecho en la partida.
    expect(ficha.cuerpo).toEqual(heroeDeArena(MAGO, DEL_JUEGO).cuerpo);
    expect(ficha.cuerpo.attack).toBeGreaterThanOrEqual(MAGO.ataque);
    expect(ficha.hechizos.find((h) => h.id === 'magic_arrow')?.rinde).toBe(100 + 100 * 3);
    expect(ficha.hechizos.find((h) => h.id === 'bless')?.efecto).toMatchObject({
      kind: 'luck',
      roundsLeft: 3,
    });
    const conF2 = fichaDeHeroeDeArena(MAGO, reglasDeLaURL('bendicion'), DEL_JUEGO);
    expect(conF2.hechizos.find((h) => h.id === 'bless')?.efecto).toMatchObject({ kind: 'tirada' });
    const llenos = Array.from({ length: LIDERAZGO.maxPorBando }, () =>
      delBorrador(unidad('zombi')),
    );
    expect(() =>
      batallaDeArena(
        {
          izquierda: { unidades: llenos, heroe: MAGO },
          derecha: { unidades: [deLaHoja('imperio-piquero')], heroe: null },
          reglas: REGLAS_DEL_JUEGO,
          piezas: [],
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
        unidades: [deLaHoja('imperio-piquero')],
        heroe: { ...MAGO, figura: 'heroe-elfo-druida' },
      },
      derecha: { unidades: [deLaHoja('esqueleto-guerrero')], heroe: null },
      reglas: REGLAS_DEL_JUEGO,
      piezas: [],
    };
    const b = batallaDeArena(lado, createRng(1));
    expect(b.stacks.find((s) => s.origen.kind === 'heroe')?.body).toBe('heroe-elfo-druida');
    b.heroes.attacker!.mana = 0;
    expect(batallaDeArena(lado, createRng(1)).heroes.attacker?.mana).toBe(40);
  });

  it('C3: un lanzamiento sin maná se rechaza con el motivo de castBlocker', () => {
    const s = new SesionDeArena(
      {
        izquierda: { ...yo(unidad('templario-escudo')), heroe: { ...MAGO, conocimiento: 0 } },
        derecha: ia(unidad('zombi')),
        reglas: REGLAS_DEL_JUEGO,
        piezas: [],
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
          izquierda: { ...ia(unidad('templario-escudo')), heroe: MAGO },
          // Con vida que quitar: desde que el arnés da armadura y no 100 PV (#262),
          // el orko de 80 PV no paga los 3 de maná de la Flecha mágica
          // (`VALOR_MINIMO_POR_MANA`: lo que quita, con el tope de su vida).
          derecha: ia(unidad('orko-dos-armas', { hp: 200 })),
          reglas: REGLAS_DEL_JUEGO,
          piezas: [],
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
        izquierda: yo(unidad('elfo-arquero')),
        derecha: ia(unidad('zombi')),
        reglas: reglasDeLaURL('tirador'),
        piezas: [],
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

  it('C1: sin el catálogo del juego: ni su filtro, ni una criatura, ni «Nueva unidad» desde una (13-10-2026)', () => {
    const m = marcadoDe(
      renderCatalogo(
        HOJAS,
        'todas',
        { kind: 'montaje' },
        {
          cuerpos: HOJAS.map((h) => ({ id: h.id, nombre: h.nombre })),
        },
      ),
    );
    expect(m).not.toContain('data-faccion="catalogo"');
    expect(m).not.toContain('Catálogo del juego');
    expect(m).not.toContain('data-criatura');
    expect(m).not.toContain('añadir-catalogo');
    expect(m).not.toContain('criatura:');
    // Las cinco facciones, con sus hojas y sus héroes.
    for (const f of ['templarios', 'no-muertos', 'imperio', 'elfos', 'orkos']) {
      expect(m).toContain(`data-faccion="${f}"`);
    }
    expect(m.match(/data-unidad-catalogo="/g)).toHaveLength(HOJAS.length);
  });

  it('la ficha del héroe enseña los valores con los que pelea, de las reglas en curso', () => {
    const hojas = [{ id: 'heroe-elfo-druida', nombre: 'Druida' }];
    const m = marcadoDe(
      renderFichaDeHeroe('izquierda', MAGO, enElMontaje(REGLAS_DEL_JUEGO, DEL_JUEGO), hojas),
    );
    expect(m).toContain('data-mana-de-la-ficha="40"');
    expect(m).toContain('<span>40</span>');
    expect(m).toContain('aria-label="10 × Conocimiento."');
    expect(m).toContain('<span>3 rondas</span>');
    expect(m).toContain('Flecha mágica (3)</span><span>400 de daño');
    // Con nuestra regla el héroe no suma a su tropa: ni la fila ni su aclaración.
    expect(m).not.toContain('A la tropa');
    expect(m).not.toContain('nada: su ataque');
    expect(m).toContain('<option value="heroe-elfo-druida" >Druida</option>');
    const f2 = marcadoDe(
      renderFichaDeHeroe(
        'izquierda',
        MAGO,
        enElMontaje(reglasDeLaURL('heroe,bendicion'), DEL_JUEGO),
        hojas,
      ),
    );
    expect(f2).toContain('<span>+2 de ataque y +1 de defensa</span>');
    expect(f2).toMatch(/A la tropa <span class="nota"[^>]*aria-label="Regla de fheroes2/);
    expect(f2).toContain('Bendición (3)</span><span>daño máximo, 3 rondas');
    // H5 del banco: con Poder 1 decía «1 rondas».
    const poder1 = marcadoDe(
      renderFichaDeHeroe(
        'izquierda',
        heroePorDefecto('izquierda'),
        enElMontaje(REGLAS_DEL_JUEGO, DEL_JUEGO),
        hojas,
      ),
    );
    expect(poder1).toContain('<span>1 ronda</span>');
    expect(poder1).toContain('Bendición (3)</span><span>suerte +1, 1 ronda<');
    expect(poder1).not.toContain('1 rondas');
  });

  it('el panel de la pelea lleva el maná, las reglas y el libro de la persona', () => {
    const s = new SesionDeArena(
      {
        izquierda: { ...yo(unidad('templario-escudo')), heroe: MAGO },
        derecha: ia(unidad('zombi')),
        reglas: reglasDeLaURL('tirador'),
        piezas: [],
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
  /**
   * Un montaje con todo lo que lleva el enlace: hojas editadas y sin editar,
   * héroes. Hasta el 13-10-2026 llevaba también criaturas del catálogo con su
   * prueba (el piquero con ataque 8): hoy, un piquero del imperio con su cifra sin
   * guardar.
   */
  const MONTAJE: MontajeDelEnlace = {
    unidades: [
      unidad('templario-escudo', { attack: 11 }),
      unidad('imperio-piquero', { attack: 8 }),
      unidad('zombi'),
      unidad('orko-dos-armas'),
    ],
    piezas: [],
    izquierda: {
      ia: false,
      puestos: [
        { unidad: 'templario-escudo', escalera: true },
        { unidad: 'imperio-piquero', escalera: true },
        { unidad: 'templario-escudo', escalera: false },
      ],
      heroe: { ...MAGO, figura: 'heroe-elfo-druida', poder: 5 },
    },
    derecha: {
      ia: true,
      puestos: [
        { unidad: 'zombi', escalera: false },
        { unidad: 'orko-dos-armas', escalera: false },
      ],
      heroe: heroePorDefecto('derecha'),
    },
    // La muralla viaja también (la integración del banco con la muralla): con
    // puerta, para que vaya y vuelva entera.
    muralla: FORMAS_DE_EJEMPLO[1]!.muralla,
  };

  /** El enlace de `MONTAJE` con algo cambiado a mano, como lo dejaría una errata. */
  const tocado = (cambiar: (o: Record<string, any>) => void): string => {
    const o = JSON.parse(montajeALaURL(MONTAJE));
    cambiar(o);
    return JSON.stringify(o);
  };

  it('va y vuelve igual, también por URLSearchParams, y monta su muralla y sus escaleras', () => {
    const texto = montajeALaURL(MONTAJE);
    const leido = montajeDeLaURL(texto);
    expect(leido).toEqual({ ...MONTAJE, version: VERSION_DEL_ENLACE });
    expect(montajeALaURL(leido)).toBe(texto);
    // A través de URLSearchParams, que es por donde viaja.
    const url = new URLSearchParams({ montaje: texto }).toString();
    expect(montajeDeLaURL(new URLSearchParams(url).get('montaje') as string)).toEqual({
      ...MONTAJE,
      version: VERSION_DEL_ENLACE,
    });
    const b = batallaDeArena(montajeDeArenaDelEnlace(leido, REGLAS_DEL_JUEGO, []), createRng(7));
    expect(b.muralla).toEqual(MONTAJE.muralla);
    // Las escaleras del montaje llegan al tablero, con las cifras del enlace.
    const conEscalera = b.stacks.filter((st) => st.side === 'attacker' && st.escalera);
    expect(conEscalera.map((st) => st.slot)).toEqual([0, 1]);
    expect(conEscalera[1]?.unit.sinEquipo?.attack).toBe(8);
  });

  /**
   * Lo que dice la conversión de las unidades de `MONTAJE` de antes del equipo: su
   * vida contaba los PV de la armadura del kit, que hoy da puntos de armadura (#262).
   */
  const AVISOS_DE_LA_ARMADURA = [
    ['Guerrero con escudo', 70, 7],
    ['Piquero', 100, 10],
    ['Zombie', 70, 7],
    ['Orko con dos armas', 100, 10],
  ].map(
    ([nombre, pv, a]) =>
      `La unidad «${nombre}» contaba en su vida ${pv} PV de su armadura: ahora lleva ${a} de armadura, que se resta del daño de cada golpe.`,
  );

  /**
   * `MONTAJE` escrito como lo escribía la versión 4: cada unidad con el id de su
   * hoja, sin cuerpo ni equipo y con las cifras con las que pelea (las de su
   * perfil), y los puestos por `hoja`.
   */
  const enLaVersion4 = (): Record<string, any> => {
    const o = JSON.parse(montajeALaURL(MONTAJE));
    o.v = 4;
    // Las piezas de la arena viajan desde la 6; hasta la 7, las pruebas del catálogo.
    delete o.piezas;
    o.pruebas = {};
    o.unidades = MONTAJE.unidades.map((u) => {
      const c = unidadDeCombate(u, DEL_JUEGO);
      return {
        id: u.id,
        name: u.name,
        faction: u.faction,
        leadership: u.leadership,
        attack: c.attack,
        defense: c.defense,
        damage: [...c.damage],
        // Antes de la armadura (#262) la vida contaba sus PV: lo que escribía el
        // enlace de entonces.
        hp: conLaArmaduraEnPV(c).hp,
        casillas: SPEED_TO_HEXES[c.speed],
        traits: u.traits,
        habilidades: u.habilidades,
        cost: u.cost,
      };
    });
    for (const l of ['izquierda', 'derecha'] as const) {
      o[l].puestos = o[l].puestos.map((p: Record<string, any>) =>
        'unidad' in p ? { hoja: p.unidad, escalera: p.escalera } : p,
      );
    }
    return o;
  };

  it('un enlace de la versión 4 (sin equipo) se lee como cuerpo + equipo y se reescribe en la de hoy', () => {
    const v4 = JSON.stringify(enLaVersion4());
    // Sin el perfil de cada hoja no se puede convertir: se dice.
    expect(() => montajeDeLaURL(v4)).toThrow(
      'el montaje del enlace es de la versión 4, de antes del equipo, y para leerlo hace falta el perfil de cada hoja',
    );
    const leido = montajeDeLaURL(v4, perfilDe);
    expect(leido).toEqual({ ...MONTAJE, version: 4, avisos: AVISOS_DE_LA_ARMADURA });
    expect(leido.unidades[0]?.equipo).toEqual({
      arma: 'espada',
      armadura: 'brigantina',
      escudo: 'escudo',
    });
    // Y se reescribe en la de hoy, con los puestos por id de unidad.
    const reescrito = JSON.parse(montajeALaURL(leido));
    expect(reescrito.v).toBe(VERSION_DEL_ENLACE);
    expect(reescrito.izquierda.puestos[0]).toEqual({ unidad: 'templario-escudo', escalera: true });
    expect(reescrito.unidades[0].cuerpo).toEqual({ hoja: 'templario-escudo' });
  });

  /**
   * `MONTAJE` escrito como lo escribía la versión 3: lo de la 4, con cada hoja
   * con su `level` y, hojas y pruebas, con PV y daño en la escala de fheroes2.
   */
  const enLaVersion3 = (): Record<string, any> => {
    const o = enLaVersion4();
    o.v = 3;
    const aLaVieja = (c: Record<string, any>): void => {
      if (c.hp !== undefined) c.hp /= ESCALA_DE_CIFRAS;
      if (c.damage !== undefined) c.damage = c.damage.map((d: number) => d / ESCALA_DE_CIFRAS);
    };
    for (const u of o.unidades) {
      u.level = 3;
      aLaVieja(u);
    }
    return o;
  };

  it('un enlace de la versión 3 (PV y daño de fheroes2) se lee a la escala de hoy', () => {
    const o = enLaVersion3();
    expect(o.unidades[0].hp).toBe(
      conLaArmaduraEnPV(unidadDeCombate(MONTAJE.unidades[0]!, DEL_JUEGO)).hp / ESCALA_DE_CIFRAS,
    );
    const leido = montajeDeLaURL(JSON.stringify(o), perfilDe);
    expect(leido).toEqual({ ...MONTAJE, version: 3, avisos: AVISOS_DE_LA_ARMADURA });
    // Y se reescribe en la versión de ahora, que ya no se escala al leerla.
    const reescrito = montajeALaURL(leido);
    expect(JSON.parse(reescrito).v).toBe(VERSION_DEL_ENLACE);
    expect(montajeDeLaURL(reescrito)).toEqual({ ...MONTAJE, version: VERSION_DEL_ENLACE });
  });

  /**
   * `MONTAJE` escrito como lo escribía la versión 2: lo de la 3 y, además, quién
   * mueve en cada puesto y en el héroe, sin `ia` en el lado. `repartir` pone a la
   * persona el primer puesto.
   */
  const enLaVersion2 = (repartir: boolean): Record<string, any> => {
    const o = enLaVersion3();
    o.v = 2;
    for (const l of ['izquierda', 'derecha'] as const) {
      const { ia } = o[l];
      delete o[l].ia;
      for (const p of o[l].puestos) p.ia = ia;
      if (o[l].heroe !== null) o[l].heroe.ia = ia;
    }
    if (repartir) o.derecha.puestos[0].ia = false;
    return o;
  };

  it('un enlace de la versión 2 (quién mueve, por puesto) se sigue leyendo', () => {
    const leido = montajeDeLaURL(JSON.stringify(enLaVersion2(false)), perfilDe);
    expect(leido).toEqual({ ...MONTAJE, version: 2, avisos: AVISOS_DE_LA_ARMADURA });
    // Repartido entre tú y la IA: el bando lo mueves tú entero, y se dice.
    const repartido = montajeDeLaURL(JSON.stringify(enLaVersion2(true)), perfilDe);
    expect(repartido.derecha.ia).toBe(false);
    expect(repartido.izquierda.ia).toBe(false);
    expect(repartido.avisos).toEqual([
      'El enlace repartía el bando derecho entre tú y la IA: ahora lo mueves tú entero.',
      ...AVISOS_DE_LA_ARMADURA,
    ]);
    // Y se reescribe en la versión de ahora, sin el aviso.
    const reescrito = JSON.parse(montajeALaURL(repartido));
    expect(reescrito.v).toBe(VERSION_DEL_ENLACE);
    expect(reescrito.derecha.ia).toBe(false);
    expect(reescrito.aviso).toBeUndefined();
  });

  it('una muralla dibujada en la rejilla de antes (11 en todas las filas) se sigue leyendo', () => {
    // Tablero simétrico (11-10-2026): las filas pares ganan la columna 11 y
    // ninguna casilla de la rejilla de antes desaparece, así que una muralla de
    // entonces —aquí, su última columna entera con una puerta— se lee tal cual,
    // en el enlace de la versión 2 y como forma del borrador.
    const deAntes = {
      muros: Array.from({ length: 9 }, (_, row) => ({ col: 10, row })).filter((h) => h.row !== 4),
      puertas: [{ a: { col: 9, row: 4 }, b: { col: 10, row: 4 } }],
    };
    const o = enLaVersion2(false);
    o.muralla = deAntes;
    const leido = montajeDeLaURL(JSON.stringify(o), perfilDe);
    expect(leido.muralla).toEqual(deAntes);
    expect(validarFormaDeMuralla({ nombre: 'De antes', muralla: deAntes }).muralla).toEqual(
      deAntes,
    );
  });

  it('C1 y C4: un enlace de la versión 7 se abre sin el catálogo del juego, sin munición ni tamaño, y lo dice', () => {
    const o = JSON.parse(montajeALaURL(MONTAJE));
    o.v = 7;
    // Lo que llevaba entonces: un puesto de una criatura con su prueba, una unidad
    // con cuerpo de criatura, una de dos casillas y una con tiros sin arma a distancia.
    o.pruebas = { pikeman: { attack: 8 } };
    o.izquierda.puestos.push({ criatura: 'pikeman', escalera: false });
    o.unidades.push({
      ...unidad('zombi'),
      id: 'skeleton-2',
      name: 'Esqueleto 2',
      cuerpo: { criatura: 'skeleton' },
    });
    o.derecha.puestos.push({ unidad: 'skeleton-2', escalera: false });
    o.unidades[2].hexes = 2;
    o.unidades[3].shots = 5;
    const leido = montajeDeLaURL(JSON.stringify(o), perfilDe);
    // Monta lo demás, como el enlace de hoy.
    const { avisos, version, ...montaje } = leido;
    expect(version).toBe(7);
    expect(montaje).toEqual(MONTAJE);
    // Una frase por aviso, y lo que se quita primero (H1 de QA, 14-10-2026): en
    // el montaje se leen enteros, y lo que desaparece no se queda al final.
    expect(avisos).toHaveLength(4);
    expect(avisos?.[0]).toBe(
      'El enlace montaba criaturas del catálogo del juego («pikeman»): en la arena solo están las cinco facciones de las hojas, y se quitan.',
    );
    expect(avisos?.[1]).toMatch(
      /^La unidad «Esqueleto 2» era una criatura del catálogo del juego \(«skeleton»\)/,
    );
    expect(avisos?.slice(2).join(' ')).toContain(
      `La unidad «${unidad('zombi').name}» ocupaba 2 casillas: ahora una, como todas.`,
    );
    expect(avisos?.slice(2).join(' ')).toContain(
      `La unidad «${unidad('orko-dos-armas').name}» traía 5 tiros y ningún arma a distancia: ya no hay munición y no dispara`,
    );
    // Un bando que se queda vacío se monta vacío, y se dice.
    const soloCriaturas = JSON.parse(JSON.stringify(o));
    soloCriaturas.derecha = {
      ia: true,
      puestos: [{ criatura: 'archer', escalera: false }],
      heroe: null,
    };
    soloCriaturas.unidades = soloCriaturas.unidades.filter(
      (u: { id: string }) => u.id !== 'zombi' && u.id !== 'orko-dos-armas' && u.id !== 'skeleton-2',
    );
    const vacio = montajeDeLaURL(JSON.stringify(soloCriaturas), perfilDe);
    expect(vacio.derecha.puestos).toEqual([]);
    expect(vacio.avisos?.join(' ')).toContain('El bando derecho se queda vacío sin ellas');
    // Y lo que se reescribe es de la 8, sin nada de eso.
    const reescrito = JSON.parse(montajeALaURL(leido));
    expect(reescrito.v).toBe(VERSION_DEL_ENLACE);
    expect(reescrito).not.toHaveProperty('pruebas');
    expect(JSON.stringify(reescrito)).not.toMatch(/criatura|shots|hexes/);
  });

  it('un enlace de la versión 1 (sin muralla ni escaleras) se sigue leyendo', () => {
    const o = enLaVersion2(false);
    o.v = 1;
    delete o.muralla;
    for (const l of ['izquierda', 'derecha']) {
      for (const p of o[l].puestos) delete p.escalera;
    }
    const leido = montajeDeLaURL(JSON.stringify(o), perfilDe);
    expect(leido.muralla).toBeNull();
    expect([...leido.izquierda.puestos, ...leido.derecha.puestos].every((p) => !p.escalera)).toBe(
      true,
    );
    expect([leido.izquierda.ia, leido.derecha.ia]).toEqual([false, true]);
    // Y se reescribe en la versión de ahora.
    expect(JSON.parse(montajeALaURL(leido)).v).toBe(VERSION_DEL_ENLACE);
  });

  it('un enlace mal formado o con lo que no existe se rechaza diciendo qué', () => {
    const casos: [string, string][] = [
      ['{"v":1,', 'el montaje del enlace no se puede leer'],
      [tocado((o) => (o.v = 10)), 'es de la versión 10 y esta arena lee de la 1 a la 9'],
      // La versión es un entero de la 1 a la de hoy: ni 0, ni a medias, ni texto.
      [tocado((o) => (o.v = 0)), 'es de la versión 0 y esta arena'],
      [tocado((o) => (o.v = 4.5)), 'es de la versión 4.5 y esta arena'],
      [tocado((o) => (o.v = '5')), 'es de la versión "5" y esta arena'],
      [tocado((o) => delete o.muralla), 'falta «muralla»'],
      [tocado((o) => o.muralla.muros.push({ col: 99, row: 0 })), 'la muralla del enlace no vale'],
      [
        tocado((o) => (o.derecha.puestos[0].escalera = true)),
        'el bando derecho del enlace, puesto 1, lleva escalera y quien defiende sube a la muralla andando',
      ],
      [
        tocado((o) => (o.izquierda.puestos[0].escalera = 'si')),
        '«escalera» tiene que ser true o false',
      ],
      [
        tocado((o) => {
          o.muralla.muros = [0, 1, 2].flatMap((col) =>
            Array.from({ length: 9 }, (_, row) => ({ col, row })),
          );
          o.muralla.puertas = [];
        }),
        'el montaje del enlace no cabe',
      ],
      [tocado((o) => (o.sobra = 1)), '«sobra» no es un campo del enlace'],
      [tocado((o) => delete o.derecha), 'falta «derecha»'],
      // Desde la 8, solo la arena: ni criaturas del catálogo ni sus pruebas.
      [
        tocado((o) => (o.izquierda.puestos[1] = { criatura: 'pikeman', escalera: false })),
        'el bando izquierdo del enlace, puesto 2: «criatura» no es un campo del enlace',
      ],
      [tocado((o) => (o.pruebas = {})), '«pruebas» no es un campo del enlace'],
      [
        tocado((o) => (o.unidades[0].cuerpo = { criatura: 'pikeman' })),
        'su cuerpo es una criatura del catálogo del juego',
      ],
      [tocado((o) => (o.unidades[0].shots = 12)), '«shots» no es un campo de la arena'],
      [tocado((o) => (o.unidades[0].hexes = 2)), '«hexes» no es un campo de la arena'],
      [tocado((o) => (o.izquierda.ia = 'si')), '«ia» tiene que ser true o false'],
      [tocado((o) => (o.izquierda.puestos[0].ia = true)), '«ia» no es un campo del enlace'],
      [tocado((o) => delete o.derecha.ia), 'el bando derecho del enlace: falta «ia»'],
      [
        tocado((o) => (o.izquierda.puestos[0].unidad = 'monje-inventado')),
        'pone «monje-inventado» y no trae sus cifras',
      ],
      [
        tocado((o) => o.unidades.push(unidad('goblin-lancero'))),
        'trae las cifras de «goblin-lancero» y no la monta',
      ],
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
            unidad: 'zombi',
            escalera: false,
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

// ------------------------------------------------------------------ poderes y edición en combate

describe('los poderes del monje en la arena (A3)', () => {
  it('el monje templario sale con Curar y Bendecir; otro bastón, con ninguno', () => {
    expect(unidad('templario-monje').habilidades).toEqual(['Curar (X)', 'Bendecir']);
    const otroBaston = HOJAS.find((h) => h.perfil === 'baston' && h.id !== 'templario-monje');
    if (otroBaston === undefined) throw new Error('no hay otra hoja de bastón');
    expect(unidadPorDefecto(otroBaston).habilidades).toEqual([]);
    // Y en la pelea son poderes del motor; las demás habilidades no pelean.
    const b = pelea(
      [unidad('templario-monje', { habilidades: ['Bendecir', 'Salto', 'Curar (X)'] })],
      [unidad('zombi')],
      createRng(1),
    );
    expect(b.stacks[0]?.unit.poderes).toEqual(['bendecir', 'curar']);
    expect(b.stacks[1]?.unit.poderes).toBeUndefined();
  });

  it('«Bendecir» se valida aunque no esté en el cuaderno, y lo que no existe no', () => {
    expect(CATALOGO_DE_HABILIDADES).toContain('Curar (X)');
    expect(CATALOGO_DE_HABILIDADES).not.toContain('Bendecir');
    expect(HABILIDADES_DE_LA_ARENA).toContain('Bendecir');
    expect(
      validarUnidadDeArena(unidad('zombi', { habilidades: ['Bendecir'] }), DEL_JUEGO).habilidades,
    ).toEqual(['Bendecir']);
    expect(() =>
      validarUnidadDeArena(unidad('zombi', { habilidades: ['Bendecirr'] }), DEL_JUEGO),
    ).toThrow('la habilidad "Bendecirr" no existe');
  });

  it('la ficha separa los poderes, que actúan, de las habilidades sin efecto', () => {
    const u = unidad('templario-monje', {
      habilidades: ['Curar (X)', 'Bendecir', 'Salto'],
    });
    const m = marcadoDe(renderFicha(u, false, enElMontaje(REGLAS_DEL_JUEGO, DEL_JUEGO)));
    expect(m).toContain('Poderes · actúan en la pelea');
    expect(m).toContain('cura 40 PV a un aliado herido, incluida la propia unidad');
    // El chip dice lo que cura, no la X del cuaderno; el valor sigue siendo el nombre (M3).
    expect(m).toContain(
      'Curar (40 PV) <button data-arena="quitar-habilidad" data-habilidad="Curar (X)"',
    );
    expect(m).not.toContain('sí misma');
    expect(m).toContain(
      'suerte +1 durante 3 rondas a un aliado; es la Bendición del héroe: las dos no se suman',
    );
    expect(m).toContain('data-poder-de-la-ficha="curar"');
    expect(m).toContain('sin efecto todavía');
    // «Salto» va con las inertes; los poderes, no.
    const inertes = m.slice(m.indexOf('sin efecto todavía'));
    expect(inertes).toContain('data-habilidad="Salto"');
    expect(inertes).not.toContain('data-habilidad="Bendecir"');
    // En el editor de la batalla: sin figura animada y diciendo que vale ya.
    const enCombate = marcadoDe(
      renderFicha(u, false, {
        enCombate: true,
        reglas: REGLAS_DEL_JUEGO,
        piezas: DEL_JUEGO,
      }),
    );
    expect(enCombate).not.toContain('<canvas');
    expect(enCombate).toContain(CAMBIO_EN_COMBATE);
  });

  it('el panel de la pelea lleva un botón por poder, apagado con su motivo, y «Editar» en cada fila', () => {
    /** La pelea en el turno del monje, sin haberla pintado aún. */
    const enSuTurno = () => {
      const s = new SesionDeArena(
        {
          izquierda: { ...yo(unidad('templario-monje'), unidad('templario-escudo')), heroe: MAGO },
          derecha: ia(unidad('orko-dos-armas')),
          reglas: REGLAS_DEL_JUEGO,
          piezas: [],
        },
        1,
      );
      s.empezar();
      while (s.turnoPropio?.stack.body !== 'templario-monje' && s.battle.finished === null)
        s.playBattleAction({ type: 'end_turn' });
      return s;
    };
    const s = enSuTurno();
    const m = marcadoDe(renderPanelDeBatalla(s, false));
    expect(m).toContain(
      'data-action="battle-poder" data-poder="curar" class="poder" disabled title="Nadie de su bando tiene ninguna herida."',
    );
    expect(m).toMatch(
      /data-action="battle-poder" data-poder="bendecir" class="poder" title="suerte \+1/,
    );
    // Con un solo herido, el clic ya juega: el botón dice a quién y cuánto de
    // verdad, con el tope de la herida (M1 de QA: decía «cura 4 PV» con 2 de herida).
    // (Otra pelea igual: la lista legal de la sesión se guarda hasta la siguiente jugada.)
    const herido = enSuTurno();
    const escudero = herido.battle.stacks.find((x) => x.body === 'templario-escudo');
    if (escudero === undefined) throw new Error('sin escudero');
    escudero.topHp = escudero.unit.hp - 2;
    expect(marcadoDe(renderPanelDeBatalla(herido, false))).toContain(
      `data-action="battle-poder" data-poder="curar" class="poder" title="Curar a ${nombreEnElCampo(herido.battle, escudero)}: cura 2 PV."`,
    );
    // «Editar» en la activa y en cada fila del campo, héroe incluido.
    const editar = m.match(/data-arena="editar-en-combate"/g) ?? [];
    expect(editar.length).toBe(1 + s.battle.stacks.filter((x) => x.count > 0).length);
    expect(m).toContain(
      `data-stack="${s.battle.stacks.find((x) => x.origen.kind === 'heroe')?.id}"`,
    );
  });
});

describe('retocar en plena pelea (B10-B14)', () => {
  // Sin el equipo de su perfil: aquí se comparan las cifras que se escriben con
  // las del stack, y con equipo serían las del cuerpo más sus piezas (el retoque
  // del equipo, en su propio test).
  const unidad = (id: string, cambios: Partial<UnidadDeArena> = {}): UnidadDeArena =>
    unidadDeArena(id, { equipo: {}, ...cambios });
  /** Monje y arquero a la izquierda, con héroe; monje a la derecha. */
  function conMonjes(): BattleState {
    return batallaDeArena(
      {
        izquierda: {
          unidades: [delBorrador(unidad('templario-monje')), delBorrador(unidad('goblin-arquero'))],
          heroe: MAGO,
        },
        derecha: { unidades: [delBorrador(unidad('templario-monje'))], heroe: null },
        reglas: REGLAS_DEL_JUEGO,
        piezas: [],
      },
      createRng(4),
    );
  }
  const monjes = (b: BattleState) => b.stacks.filter((x) => x.body === 'templario-monje');

  it('cambia el tipo entero, en los dos bandos, y nada más; y lo dice el registro', () => {
    const b = conMonjes();
    const arquero = b.stacks.find((x) => x.body === 'goblin-arquero');
    const desde = b.log.length;
    expect(
      retocarEnBatalla(b, {
        kind: 'tipo',
        fuente: delBorrador(unidad('templario-monje', { attack: 19 })),
      }),
    ).toBeNull();
    expect(monjes(b).map((x) => [x.side, x.unit.attack])).toEqual([
      ['attacker', 19],
      ['defender', 19],
    ]);
    // El arquero ni se toca: el mismo objeto.
    expect(b.stacks.find((x) => x.body === 'goblin-arquero')).toBe(arquero);
    expect(b.log.slice(desde)).toEqual([
      {
        kind: 'retoque',
        nombre: unidad('templario-monje').name,
        stacks: monjes(b).map((x) => x.id),
        cambios: ['ataque 3 → 19'],
      },
    ]);
    // Y el parte dice qué cambió (M3 de QA: cuatro retoques eran cuatro líneas iguales).
    expect(marcadoDe(renderBattleLog(b, null))).toContain(
      `Cambian las cifras de ${unidad('templario-monje').name} a media pelea (ataque 3 → 19)`,
    );
    // La misma fuente sin cambios deja las cifras de una pelea recién montada.
    retocarEnBatalla(b, { kind: 'tipo', fuente: delBorrador(unidad('templario-monje')) });
    expect(monjes(b)[0]?.unit).toEqual(monjes(conMonjes())[0]?.unit);
  });

  it('quitarle el escudo a media pelea sube su velocidad y el parte dice «escudo: − Escudo»', () => {
    const conEscudo = unidadDeArena('templario-escudo');
    const b = batallaDeArena(
      {
        izquierda: { unidades: [delBorrador(conEscudo)], heroe: null },
        derecha: { unidades: [delBorrador(unidadDeArena('zombi'))], heroe: null },
        reglas: REGLAS_DEL_JUEGO,
        piezas: [],
      },
      createRng(1),
    );
    const suyo = () => b.stacks.find((x) => x.side === 'attacker') as BattleStack;
    expect(SPEED_TO_HEXES[suyo().unit.speed]).toBe(3);
    const sinEscudo = quitarEnArena(conEscudo, 'escudo');
    expect(retocarEnBatalla(b, { kind: 'tipo', fuente: delBorrador(sinEscudo) })).toBeNull();
    expect(SPEED_TO_HEXES[suyo().unit.speed]).toBe(4);
    expect(suyo().unit.defense).toBe(3);
    expect(b.log.at(-1)).toMatchObject({ kind: 'retoque', cambios: ['escudo: − Escudo'] });
  });

  it('el tipo de cada stack lo anota el montaje: unidad o héroe', () => {
    const b = batallaDeArena(
      {
        izquierda: {
          unidades: [delBorrador(unidad('zombi')), delBorrador(unidad('esqueleto-guerrero'))],
          heroe: MAGO,
        },
        derecha: { unidades: [delBorrador(unidad('zombi'))], heroe: null },
        reglas: REGLAS_DEL_JUEGO,
        piezas: [],
      },
      createRng(1),
    );
    expect(b.stacks.map((x) => tipoDelStack(b, x))).toEqual([
      { kind: 'unidad', id: 'zombi' },
      { kind: 'unidad', id: 'esqueleto-guerrero' },
      { kind: 'heroe', lado: 'izquierda' },
      { kind: 'unidad', id: 'zombi' },
    ]);
    // Retocar un tipo no toca los demás.
    retocarEnBatalla(b, {
      kind: 'tipo',
      fuente: delBorrador(unidad('esqueleto-guerrero', { attack: 9 })),
    });
    expect(b.stacks.map((x) => x.unit.attack)).toEqual([
      unidad('zombi').attack,
      9,
      b.stacks[2]?.unit.attack,
      unidad('zombi').attack,
    ]);
    // Una pelea que no es de la arena no sabe de tipos: se dice.
    const delJuego = createBattle(
      { army: [{ creature: 'zombie', count: 1 }], hero: null },
      { army: [{ creature: 'zombie', count: 1 }], hero: null },
      createRng(1),
    );
    expect(() => tipoDelStack(delJuego, delJuego.stacks[0] as BattleStack)).toThrow(
      'no es una pelea de la arena',
    );
  });

  it('lo gastado sigue gastado: la herida y el maná (sin munición, 13-10-2026)', () => {
    const b = conMonjes();
    const elMonje = () => monjes(b)[0] as BattleStack;
    const hp = elMonje().unit.hp;
    elMonje().topHp = hp - 3;
    retocarEnBatalla(b, {
      kind: 'tipo',
      fuente: delBorrador(unidad('templario-monje', { hp: hp + 10 })),
    });
    expect(elMonje().topHp).toBe(hp + 10 - 3);
    // Bajar la vida por debajo de la herida no mata: queda en 1.
    retocarEnBatalla(b, {
      kind: 'tipo',
      fuente: delBorrador(unidad('templario-monje', { hp: 2 })),
    });
    expect(elMonje().topHp).toBe(1);
    const mando = b.heroes.attacker;
    if (mando === null) throw new Error('sin héroe');
    mando.mana -= 7;
    mando.castThisRound = true;
    retocarEnBatalla(b, { kind: 'heroe', lado: 'izquierda', datos: { ...MAGO, conocimiento: 6 } });
    expect(b.heroes.attacker).toMatchObject({ mana: 60 - 7, knowledge: 6, castThisRound: true });
    expect(b.log.at(-1)).toMatchObject({
      kind: 'retoque',
      nombre: MAGO.nombre,
      cambios: [`conocimiento ${MAGO.conocimiento} → 6`],
    });
  });

  it('ir y volver no devuelve lo gastado: herida y maná (N3 de QA)', () => {
    // Lo que no cupo al bajar se debe: con lo gastado calculado desde las cifras
    // de ese momento, la vida bajo la herida lo perdía. La munición se fue con la
    // munición de la arena (13-10-2026).
    const b = batallaDeArena(
      {
        izquierda: {
          unidades: [
            delBorrador(unidad('goblin-arquero')),
            delBorrador(unidad('templario-escudo', { hp: 15 })),
          ],
          heroe: MAGO,
        },
        derecha: { unidades: [delBorrador(unidad('zombi'))], heroe: null },
        reglas: REGLAS_DEL_JUEGO,
        piezas: [],
      },
      createRng(4),
    );
    const de = (body: string) => b.stacks.find((x) => x.body === body) as BattleStack;
    const escudero = (hp: number) =>
      retocarEnBatalla(b, {
        kind: 'tipo',
        fuente: delBorrador(unidad('templario-escudo', { hp })),
      });
    de('templario-escudo').topHp = 5;
    escudero(3);
    expect(de('templario-escudo').topHp).toBe(1);
    escudero(15);
    expect([de('templario-escudo').topHp, de('templario-escudo').unit.hp]).toEqual([5, 15]);
    // Curar mientras se debe cura la herida de verdad: 10 de herida, cura 2, quedan 8.
    escudero(3);
    de('templario-escudo').topHp = 3;
    escudero(15);
    expect(de('templario-escudo').topHp).toBe(7);
    // El maná: Conocimiento 4 (40) con 7 gastados → 0 → 4 vuelve a 33.
    const mando = () => b.heroes.attacker as NonNullable<typeof b.heroes.attacker>;
    mando().mana -= 7;
    retocarEnBatalla(b, { kind: 'heroe', lado: 'izquierda', datos: { ...MAGO, conocimiento: 0 } });
    expect(mando().mana).toBe(0);
    retocarEnBatalla(b, { kind: 'heroe', lado: 'izquierda', datos: MAGO });
    expect(mando().mana).toBe(10 * MAGO.conocimiento - 7);
  });

  it('el parte dice qué campo de la ficha cambió, y lo que no cambia nada no escribe (N1 de QA)', () => {
    const b = conMonjes();
    const monje = unidad('templario-monje');
    // Una habilidad sin motor: no cambia ninguna cifra de la pelea.
    const inerte = 'Salto';
    expect(HABILIDADES_DE_LA_ARENA).toContain(inerte);
    expect(monje.habilidades).not.toContain(inerte);
    const desde = b.log.length;
    const retoca = (cambios: Partial<UnidadDeArena>) =>
      retocarEnBatalla(b, { kind: 'tipo', fuente: delBorrador({ ...monje, ...cambios }) });
    retoca({ leadership: 9 });
    retoca({ leadership: 9, cost: { gold: 999 } });
    retoca({ leadership: 9, cost: { gold: 999 }, habilidades: [...monje.habilidades, inerte] });
    expect(b.log.slice(desde).map((e) => (e.kind === 'retoque' ? e.cambios : e.kind))).toEqual([
      [`liderazgo ${monje.leadership} → 9`],
      [`coste (oro) ${monje.cost.gold} → 999`],
      [`habilidades: + ${inerte}`],
    ]);
    // El mismo valor (ataque 3 → 3): ni línea ni stacks nuevos.
    const antes = [...b.stacks];
    const largo = b.log.length;
    expect(
      retoca({ leadership: 9, cost: { gold: 999 }, habilidades: [...monje.habilidades, inerte] }),
    ).toBeNull();
    expect(b.log.length).toBe(largo);
    expect(b.stacks).toEqual(antes);
    expect(b.stacks.every((s, i) => s === antes[i])).toBe(true);
    // La sesión no dice «Cambiado» de lo que no cambia.
    const s = new SesionDeArena(
      {
        izquierda: { ...yo(unidad('templario-monje')), heroe: MAGO },
        derecha: ia(unidad('zombi')),
        reglas: REGLAS_DEL_JUEGO,
        piezas: [],
      },
      1,
    );
    s.empezar();
    expect(s.retocar({ kind: 'tipo', fuente: delBorrador(unidad('templario-monje')) })).toBeNull();
    expect(s.status).not.toContain('Cambiado');
    expect(s.retocar({ kind: 'heroe', lado: 'izquierda', datos: MAGO })).toBeNull();
    expect(s.status).not.toContain('Cambiado');
    expect(
      s.retocar({ kind: 'tipo', fuente: delBorrador(unidad('templario-monje', { attack: 9 })) }),
    ).toBeNull();
    expect(s.status).toContain('Cambiado');
  });

  it('el parte del héroe dice las cifras de su ficha y los hechizos por su nombre (N2 de QA)', () => {
    const b = conMonjes();
    const desde = b.log.length;
    retocarEnBatalla(b, { kind: 'heroe', lado: 'izquierda', datos: { ...MAGO, ataque: 9 } });
    retocarEnBatalla(b, {
      kind: 'heroe',
      lado: 'izquierda',
      datos: { ...MAGO, ataque: 9, hechizos: MAGO.hechizos.filter((h) => h !== 'haste') },
    });
    retocarEnBatalla(b, {
      kind: 'heroe',
      lado: 'izquierda',
      datos: { ...MAGO, ataque: 9, hechizos: ['magic_arrow', 'haste'] },
    });
    expect(b.log.slice(desde).map((e) => (e.kind === 'retoque' ? e.cambios : e.kind))).toEqual([
      [`ataque ${MAGO.ataque} → 9`],
      ['hechizos: − Prisa'],
      ['hechizos: + Prisa, − Lentitud, − Bendición, − Maldición, − Curación, − Rayo'],
    ]);
  });

  it('el héroe retocado lanza con su poder nuevo (B13)', () => {
    const b = conMonjes();
    retocarEnBatalla(b, { kind: 'heroe', lado: 'izquierda', datos: { ...MAGO, poder: 9 } });
    const objetivo = b.stacks.find((x) => x.side === 'defender');
    if (objetivo === undefined) throw new Error('sin objetivo');
    applyAction(b, { type: 'cast', spell: 'magic_arrow', target: objetivo.id }, createRng(1));
    const lanzado = [...b.log].reverse().find((e) => e.kind === 'cast');
    expect(lanzado).toMatchObject({ damage: spellAmount(spell('magic_arrow'), { spellPower: 9 }) });
  });

  it('rechaza diciéndolo y sin tocar nada: la figura del héroe, lo que no valida y la pelea acabada', () => {
    const b = conMonjes();
    const antes = JSON.stringify(b);
    expect(
      retocarEnBatalla(b, {
        kind: 'heroe',
        lado: 'izquierda',
        datos: { ...MAGO, figura: 'heroe-lich' },
      }),
    ).toContain('la figura del héroe no se cambia a media pelea');
    expect(
      retocarEnBatalla(b, {
        kind: 'tipo',
        fuente: delBorrador(unidad('templario-monje', { damage: [5, 2] })),
      }),
    ).toContain('el daño mínimo (5) no puede pasar del máximo (2)');
    expect(retocarEnBatalla(b, { kind: 'heroe', lado: 'derecha', datos: MAGO })).toBe(
      'el bando derecho no lleva héroe en esta pelea',
    );
    expect(
      retocarEnBatalla(b, { kind: 'tipo', fuente: delBorrador(unidad('zombi', { attack: 3 })) }),
    ).toBe('Zombie no está en esta pelea');
    expect(JSON.stringify(b)).toBe(antes);
    b.finished = { winner: 'attacker' };
    expect(
      retocarEnBatalla(b, { kind: 'tipo', fuente: delBorrador(unidad('templario-monje')) }),
    ).toBe('la batalla ya ha terminado; el cambio vale para la pelea siguiente');
  });

  it('lo apuntado es uno solo, y retocar suelta lo que con las cifras nuevas ya no vale', () => {
    const s = new SesionDeArena(
      {
        izquierda: { ...yo(unidad('templario-monje'), unidad('templario-escudo')), heroe: MAGO },
        derecha: ia(unidad('orko-dos-armas')),
        reglas: REGLAS_DEL_JUEGO,
        piezas: [],
      },
      1,
    );
    s.empezar();
    while (s.turnoPropio?.stack.body !== 'templario-monje' && s.battle.finished === null)
      s.playBattleAction({ type: 'end_turn' });
    s.hechizos.selectSpell('bless');
    expect(s.apuntado).toEqual({ kind: 'hechizo', id: 'bless' });
    // Apuntar el poder suelta el hechizo, y elegir el hechizo suelta el poder.
    s.apuntarPoder('bendecir');
    expect(s.apuntado).toEqual({ kind: 'poder', id: 'bendecir' });
    expect(s.hechizos.selectedSpell).toBeNull();
    s.hechizos.selectSpell('bless');
    expect(s.apuntado).toEqual({ kind: 'hechizo', id: 'bless' });
    // El rechazo de lo apuntado es el del núcleo: el de Bendecir sobre el orco.
    s.apuntarPoder('bendecir');
    const orco = s.battle.stacks.find((x) => x.side === 'defender')?.id as string;
    expect(s.rechazoDeLoApuntado(orco)).toBe('«Bendecir» va dirigido a un aliado.');
    // Sin Bendecir en sus habilidades, el poder apuntado ya no vale: se suelta y se dice.
    expect(
      s.retocar({
        kind: 'tipo',
        fuente: delBorrador(unidad('templario-monje', { habilidades: ['Curar (X)'] })),
      }),
    ).toBeNull();
    expect(s.apuntado).toBeNull();
    expect(s.status).toBe(
      'Cambiado: vale ya en esta pelea. Con las cifras nuevas no se puede usar Bendecir: suelto.',
    );
    // El parte cuenta el retoque.
    expect(marcadoDe(renderBattleLog(s.battle, null))).toContain(
      `Cambian las cifras de ${unidad('templario-monje').name} a media pelea (habilidades: − Bendecir)`,
    );
  });

  it('la sesión: lo malo no entra ni mueve nada; lo bueno entra ya y conserva el turno (B11, B12, B14)', () => {
    const s = new SesionDeArena(
      {
        izquierda: { ...yo(unidad('templario-escudo')), heroe: MAGO },
        derecha: ia(unidad('zombi')),
        reglas: REGLAS_DEL_JUEGO,
        piezas: [],
      },
      1,
    );
    s.empezar();
    while (s.turnoPropio === null && s.battle.finished === null)
      s.playBattleAction({ type: 'end_turn' });
    s.hechizos.selectSpell('magic_arrow');
    const version = s.version;
    const turno = s.battle.turno?.n;
    expect(
      s.retocar({
        kind: 'tipo',
        fuente: delBorrador(unidad('templario-escudo', { damage: [5, 2] })),
      }),
    ).toBe('La unidad «Guerrero con escudo»: el daño mínimo (5) no puede pasar del máximo (2).');
    expect(s.version).toBe(version);
    // El escudero no dispara; con un arma a distancia, sí, y ya (sin munición).
    expect(s.battleLegalActions().some((a) => a.type === 'shoot')).toBe(false);
    expect(
      s.retocar({
        kind: 'tipo',
        fuente: delBorrador(unidad('templario-escudo', { equipo: { distancia: 'arco' } })),
      }),
    ).toBeNull();
    expect(s.battleLegalActions().some((a) => a.type === 'shoot')).toBe(true);
    expect(s.version).not.toBe(version);
    expect(s.battle.turno?.n).toBe(turno);
    expect(s.hechizos.selectedSpell).toBe('magic_arrow');
    expect(s.status).toBe('Cambiado: vale ya en esta pelea.');
  });
});

describe('cuerpo y equipo: el perfil de arma es equipo y el nivel mide el cuerpo (12-10-2026)', () => {
  it('toda hoja por defecto valida, y su cuerpo sin equipo es nivel 1', () => {
    for (const h of HOJAS) {
      const u = validarUnidadDeArena(unidadPorDefecto(h), DEL_JUEGO);
      expect(nivelDeLaHoja(u), h.id).toMatch(/· nivel 1$/);
    }
  });

  it('el mismo cuerpo es el mismo nivel lleve lo que lleve, y el equipo cambia lo que pelea', () => {
    const a = unidadNueva(hojaPorId('templario-escudo'), ocupados(), DEL_JUEGO);
    const b = unidadNueva(hojaPorId('templario-escudo'), ocupados(a.id), DEL_JUEGO);
    const conEscudo = equiparEnArena(equiparEnArena(a, 'espada', DEL_JUEGO), 'escudo', DEL_JUEGO);
    const conMandoble = equiparEnArena(b, 'mandoble', DEL_JUEGO);
    expect(nivelDeLaHoja(conEscudo)).toBe(nivelDeLaHoja(conMandoble));
    expect(nivelDeLaHoja(conEscudo)).toBe(nivelDeLaHoja(a));
    expect(unidadDeCombate(conEscudo, DEL_JUEGO)).not.toEqual(
      unidadDeCombate(conMandoble, DEL_JUEGO),
    );
  });

  it('el escudo resta velocidad y un arma a dos manos no lo admite, en las dos direcciones', () => {
    const u = unidadNueva(hojaPorId('templario-escudo'), ocupados(), DEL_JUEGO);
    const conEscudo = equiparEnArena(u, 'escudo', DEL_JUEGO);
    expect(SPEED_TO_HEXES[unidadDeCombate(conEscudo, DEL_JUEGO).speed]).toBe(
      SPEED_TO_HEXES[unidadDeCombate(u, DEL_JUEGO).speed] - 1,
    );
    expect(() => equiparEnArena(conEscudo, 'mandoble', DEL_JUEGO)).toThrow(
      'Mandoble es un arma a dos manos y no se puede llevar con Escudo: quita antes el escudo',
    );
    expect(() =>
      equiparEnArena(equiparEnArena(u, 'baston', DEL_JUEGO), 'paves', DEL_JUEGO),
    ).toThrow(
      'Pavés no se puede llevar con Bastón: es un arma a dos manos y no deja mano para el escudo',
    );
    // El arco a la espalda sí deja llevar escudo (13-10-2026): las manos son las
    // del arma de cuerpo a cuerpo.
    const arqueroConPaves = equiparEnArena(
      equiparEnArena(u, 'arco', DEL_JUEGO),
      'paves',
      DEL_JUEGO,
    );
    expect(arqueroConPaves.equipo).toMatchObject({ distancia: 'arco', escudo: 'paves' });
    // El borrador tampoco lo admite escrito a mano.
    expect(() =>
      validarUnidadDeArena({ ...u, equipo: { arma: 'mandoble', escudo: 'escudo' } }, DEL_JUEGO),
    ).toThrow('Mandoble es un arma a dos manos y no se puede llevar con Escudo');
    expect(() => validarUnidadDeArena({ ...u, equipo: { arma: 'escudo' } }, DEL_JUEGO)).toThrow(
      'Escudo va en Escudo, no en Arma',
    );
    expect(() => validarUnidadDeArena({ ...u, equipo: { casco: 'escudo' } }, DEL_JUEGO)).toThrow(
      'no hay ningún hueco "casco"',
    );
    // Quitar lo que no lleva se dice.
    expect(() => quitarEnArena(u, 'escudo')).toThrow('no lleva nada en Escudo');
  });

  it('«Nueva unidad»: cifras mínimas, sin equipo, id propio y pelea con el arte de su cuerpo', () => {
    const h = hojaPorId('templario-escudo');
    const a = unidadNueva(h, ocupados(h.id), DEL_JUEGO);
    expect(a.id).toBe('templario-escudo-2');
    expect(a.name).toBe('Guerrero con escudo 2');
    expect(a.cuerpo).toEqual({ hoja: 'templario-escudo' });
    expect(a.equipo).toEqual({});
    expect(nivelDeLaHoja(a)).toMatch(/^Índice 1\d\d · nivel 1$/);
    expect(validarUnidadDeArena(a, DEL_JUEGO)).toEqual(a);
    const b = unidadNueva(h, ocupados(h.id, a.id), DEL_JUEGO);
    expect(b.id).toBe('templario-escudo-3');
    // De una hoja de no muertos, con `undead`, como su hoja.
    expect(unidadNueva(hojaPorId('esqueleto-guerrero'), ocupados(), DEL_JUEGO).traits).toEqual([
      'undead',
    ]);
    // Las dos del mismo cuerpo pelean, cada una con sus cifras, y se pintan con su hoja.
    const fuerte = { ...equiparEnArena(a, 'mandoble', DEL_JUEGO), attack: 9 };
    const batalla = pelea([fuerte, b], [unidad('zombi')], createRng(3));
    const izq = batalla.stacks.filter((x) => x.side === 'attacker');
    expect(izq.map((x) => x.body)).toEqual(['templario-escudo', 'templario-escudo']);
    expect(izq.map((x) => x.unit.attack)).toEqual([14, 3]);
    expect(izq.map((x) => tipoDelStack(batalla, x))).toEqual([
      { kind: 'unidad', id: 'templario-escudo-2' },
      { kind: 'unidad', id: 'templario-escudo-3' },
    ]);
  });

  it('H1: una nueva no toma el id de una del borrador que no vale, y al guardar siguen las dos', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arena-'));
    try {
      const h = hojaPorId('templario-mandoble');
      // La reproducción de QA: una unidad de hoy que no vale con id templario-mandoble-2.
      const tramposo = {
        ...unidadNueva(h, ocupados(h.id), DEL_JUEGO),
        name: 'Tramposo',
        equipo: { arma: 'mandoble', escudo: 'escudo' },
      };
      expect(tramposo.id).toBe('templario-mandoble-2');
      // Escrita a mano, como haría quien toca el JSON: `escribirBorrador` no la dejaría pasar.
      mkdirSync(join(dir, 'data/borradores'), { recursive: true });
      writeFileSync(join(dir, RUTA_DEL_BORRADOR), JSON.stringify({ unidades: [tramposo] }));
      const leido = leerBorrador(dir);
      expect(leido.invalidas.map((i) => i.id)).toEqual(['templario-mandoble-2']);
      const nueva = unidadNueva(
        h,
        {
          validas: leido.unidades.map((u) => u.id),
          sinValidar: leido.invalidas.flatMap((i) => (i.id === null ? [] : [i.id])),
          hojas: [h.id],
        },
        DEL_JUEGO,
      );
      expect(nueva.id).toBe('templario-mandoble-3');
      expect(escribirBorrador(dir, { unidades: [nueva], piezas: [] })).toMatchObject({
        unidades: 1,
        conservadas: 1,
      });
      const json = JSON.parse(readFileSync(join(dir, RUTA_DEL_BORRADOR), 'utf8')) as {
        unidades: { id: string; name: string }[];
      };
      expect(json.unidades.map((u) => [u.id, u.name])).toEqual([
        ['templario-mandoble-3', 'Guerrero con arma a dos manos 3'],
        ['templario-mandoble-2', 'Tramposo'],
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('R1/R2: una nueva nace donde cae su índice, y un rasgo de tiro no lo sube (el arco es equipo)', () => {
    const nueva = unidadNueva(hojaPorId('templario-escudo'), ocupados(), DEL_JUEGO);
    // El doble ataque es del cuerpo y cuenta: nace en el 2.
    expect(nivelDeLaHoja({ ...nueva, traits: ['double_attack'] })).toBe('Índice 209 · nivel 2');
    // El disparo doble solo pesa si el cuerpo tira, y en la arena el cuerpo no
    // tira nunca: dispara quien lleva arma a distancia, y el equipo no cuenta para
    // el nivel (plan, decisión (c), 13-10-2026). Mide lo mismo con el rasgo y sin él,
    // con el arco puesto o sin él.
    const conElRasgo = { ...nueva, traits: ['double_shot' as const] };
    expect(nivelDeLaHoja(conElRasgo)).toBe(nivelDeLaHoja(nueva));
    expect(nivelDeLaHoja(equiparEnArena(conElRasgo, 'arco', DEL_JUEGO))).toBe(nivelDeLaHoja(nueva));
    expect(nivelDeLaHoja(nueva)).toMatch(/ · nivel 1$/);
  });

  it('C3: toda unidad de la arena ocupa una casilla y no lleva munición', () => {
    for (const h of HOJAS) {
      const c = unidadDeCombate(unidadPorDefecto(h), DEL_JUEGO);
      expect(c, h.id).not.toHaveProperty('shots');
      expect(c, h.id).not.toHaveProperty('hexes');
    }
    const batalla = pelea([unidad('troll-maza')], [unidad('zombi')], createRng(3));
    for (const s of batalla.stacks) expect(stackHexes(s), s.id).toHaveLength(1);
    // El dragón óseo sigue en el catálogo del juego, de dos casillas (C5).
    expect(creature('bone_dragon').hexes).toBe(2);
  });

  it('un borrador de antes se convierte a cuerpo + el equipo de su perfil, una sola vez', () => {
    const viejo = deAntes('templario-escudo');
    const { unidad: leida, aviso } = migrarUnidadDeArena(viejo, perfilDe, DEL_JUEGO, 'borrador');
    // Su vida contaba los 70 PV de la brigantina, que hoy da 7 de armadura (#262).
    expect(aviso).toBe(
      'La unidad «Guerrero con escudo» contaba en su vida 70 PV de su armadura: ahora lleva 7 de armadura, que se resta del daño de cada golpe.',
    );
    const u = leida!;
    const kit = KIT_DEL_PERFIL['espada-escudo'].equipo;
    expect(u.equipo).toEqual(kit);
    // El cuerpo es lo de antes menos lo que suma el kit, con la armadura en PV
    // (PV / 10 al revés: 7 puntos son 70 PV de antes).
    const suma = DEL_JUEGO.sumaDeEquipo(kit);
    expect(suma.armadura).toBe(7);
    expect([u.attack, u.defense, u.hp]).toEqual([
      (viejo.attack as number) - suma.ataque,
      (viejo.defense as number) - suma.defensa,
      (viejo.hp as number) - suma.pv - 70,
    ]);
    // Lo convertido ya es de hoy: no se convierte dos veces.
    expect(migrarUnidadDeArena(u, perfilDe, DEL_JUEGO, 'borrador')).toEqual({
      unidad: u,
      aviso: null,
      municion: null,
      retirada: null,
    });
  });

  it('si no cabe en cuerpo + equipo, se queda con sus cifras y sin equipo, y se dice', () => {
    // Un ataque por debajo de lo que suma la espada (2): el cuerpo saldría negativo.
    const flojo = deAntes('templario-escudo', { attack: 1 });
    const r = migrarUnidadDeArena(flojo, perfilDe, DEL_JUEGO, 'borrador');
    expect(r.unidad!.equipo).toEqual({});
    expect(r.unidad!.attack).toBe(1);
    // El aviso habla de lo que escribió quien juega y de qué pieza no cabe (H2 de
    // QA): no de las cifras del cuerpo calculado, que nadie escribió.
    expect(r.aviso).toBe(
      'La unidad «Guerrero con escudo» es de antes del equipo y no cabe en el de su perfil: su ataque 1 es menos de lo que suma Espada (+2); se queda con sus cifras, sin equipo.',
    );
    // La reproducción de QA: el mandoble con 45–70, más estrecho que el del arma.
    const estrecho = migrarUnidadDeArena(
      deAntes('templario-mandoble', { damage: [45, 70] }),
      perfilDe,
      DEL_JUEGO,
      'borrador',
    );
    expect(estrecho.unidad!.equipo).toEqual({});
    expect(estrecho.unidad!.damage).toEqual([45, 70]);
    expect(estrecho.aviso).toContain(
      'no cabe en el de su perfil: su daño 45–70 es más estrecho que el de Mandoble (+30–+60); se queda con sus cifras, sin equipo.',
    );
    // R3: todas las cifras que no caben, no solo la primera.
    const varias = migrarUnidadDeArena(
      deAntes('templario-escudo', { attack: 1, defense: 0, hp: 5 }),
      perfilDe,
      DEL_JUEGO,
      'borrador',
    );
    expect(varias.aviso).toContain('su ataque 1 es menos de lo que suma Espada (+2); ');
    expect(varias.aviso).toMatch(/; su defensa 0 es menos de lo que suma [^;]+; su vida 5 no pasa/);
    // R3: en un borrador de la escala de fheroes2, la vida como la escribió (9),
    // y al lado la de hoy, en la que suman las piezas.
    const vieja = migrarUnidadDeArena(
      deAntes('templario-mandoble', { level: 1, hp: 9, damage: [2, 3] }),
      perfilDe,
      DEL_JUEGO,
      'borrador',
    );
    expect(vieja.unidad!.hp).toBe(90);
    expect(vieja.aviso).toContain(
      'su vida 9 (90 en la escala de hoy, ×10) no pasa de lo que suma Arnés de placas (+100 PV, que hoy son 10 de armadura); su daño 2–3 (20–30 en la escala de hoy, ×10) no pasa de lo que suma Mandoble',
    );
    expect(vieja.aviso).not.toMatch(/su vida 90/);
    // Los tiros ya no se restan (13-10-2026): un arquero con menos de los que
    // daba el arco cabe igual, y sigue disparando sin munición.
    const pocosTiros = migrarUnidadDeArena(
      deAntes('esqueleto-arquero', { shots: 4 }),
      perfilDe,
      DEL_JUEGO,
      'borrador',
    );
    expect(pocosTiros.unidad!.equipo).toMatchObject({ distancia: 'arco' });
    expect(pocosTiros.municion).toBe(pocosTiros.unidad!.name);
    // Una frase entera, que el borrador y el enlace juntan tal cual.
    expect(r.aviso).toMatch(/^La unidad «.+\.$/);
    // Sin el perfil de su hoja, igual, diciéndolo.
    const sinPerfil = migrarUnidadDeArena(deAntes('zombi'), () => null, DEL_JUEGO, 'borrador');
    expect(sinPerfil.unidad!.equipo).toEqual({});
    expect(sinPerfil.aviso).toContain('no se sabe el perfil de su hoja');
    // El borrador lo lee y cuenta el aviso.
    const r2 = revisarBorradorDeArena({ unidades: [flojo, deAntes('zombi')] }, perfilDe, DEL_JUEGO);
    expect(r2.validas.map((u) => u.id)).toEqual(['templario-escudo', 'zombi']);
    // El de la que no cabe y el de la armadura del zombi, que cabe (#262).
    expect(r2.avisos).toHaveLength(2);
    expect(r2.avisos[1]).toMatch(/^La unidad «Zombie» contaba en su vida 70 PV de su armadura/);
  });
});

describe('cada arma para lo suyo (13-10-2026): los kits, y lo de antes convertido', () => {
  /** Las cifras de cada golpe: arriba (cuerpo a cuerpo) y las de cada arma. */
  const golpes = (u: UnidadDeArena) => {
    const c = unidadDeCombate(u, DEL_JUEGO);
    return { c, porArma: armasDe(c, DEL_JUEGO) };
  };
  const delUso = (u: UnidadDeArena, uso: string) => {
    const fila = golpes(u).porArma.find((a) => a.uso === uso);
    if (fila === undefined) throw new Error(`${u.id} no tiene golpe de ${uso}`);
    return [fila.arma, fila.attack, fila.damage];
  };

  it('el arquero dispara con su arco como ayer y pega con la daga', () => {
    // Ayer: cuerpo común (3, 10–10) + arco (+2, +10–20) + jubón: 5, 20–30, 12 tiros, y
    // con eso también pegaba.
    for (const id of ['elfo-arquero', 'esqueleto-arquero', 'goblin-arquero']) {
      const u = unidad(id);
      expect(u.equipo, id).toEqual({
        arma: 'daga',
        distancia: 'arco',
        armadura: 'jubon_de_arquero',
      });
      expect(delUso(u, 'distancia'), id).toEqual(['Arco', 5, [20, 30]]);
      expect(delUso(u, 'cuerpo'), id).toEqual(['Daga', 4, [10, 20]]);
      // Dispara por su arco, sin munición (13-10-2026).
      expect(golpes(u).c, id).not.toHaveProperty('shots');
      expect(isShooter(golpes(u).c), id).toBe(true);
    }
    const ballestero = unidad('imperio-ballestero');
    expect(ballestero.equipo).toEqual({
      arma: 'daga',
      distancia: 'ballesta',
      armadura: 'gambeson',
    });
    expect(delUso(ballestero, 'distancia')).toEqual(['Ballesta', 6, [30, 50]]);
    expect(golpes(ballestero).c).not.toHaveProperty('shots');
  });

  it('el jinete carga con la lanza como ayer y pega con la espada; el élfico dispara además con el arco', () => {
    // Ayer: cuerpo + lanza (+7, +40–80) + barda: 10, 50–90 en todo golpe.
    for (const id of ['templario-hermano-de-carga', 'jinete-de-plaga', 'goblin-jinete-de-hiena']) {
      const u = unidad(id);
      expect(u.traits, id).toContain('charge');
      expect(delUso(u, 'carga'), id).toEqual(['Lanza de jinete', 10, [50, 90]]);
      expect(delUso(u, 'cuerpo'), id).toEqual(['Espada', 5, [20, 40]]);
      expect(
        golpes(u).porArma.map((a) => a.uso),
        id,
      ).toEqual(['cuerpo', 'carga']);
    }
    // Un solo perfil, coherente: lanza, espada y arco (`perfilDeArena`).
    expect(hojaPorId('elfo-jinete').perfil).toBe('montado-arco');
    const elfico = unidad('elfo-jinete');
    expect(elfico.equipo).toEqual({
      arma: 'espada',
      distancia: 'arco',
      carga: 'lanza_de_jinete',
      armadura: 'barda',
    });
    expect(golpes(elfico).porArma.map((a) => [a.uso, a.arma])).toEqual([
      ['cuerpo', 'Espada'],
      ['distancia', 'Arco'],
      ['carga', 'Lanza de jinete'],
    ]);
    expect(isShooter(golpes(elfico).c)).toBe(true);
    // Los demás perfiles no tienen armas por uso: pelean como ayer.
    for (const id of ['templario-escudo', 'templario-mandoble', 'templario-monje']) {
      expect(golpes(unidad(id)).c, id).not.toHaveProperty('armas');
    }
  });

  it('el arco a la espalda deja llevar escudo, y la ficha lo monta', () => {
    const u = equiparEnArena(unidad('elfo-arquero'), 'paves', DEL_JUEGO);
    expect(validarUnidadDeArena(u, DEL_JUEGO).equipo).toMatchObject({
      distancia: 'arco',
      escudo: 'paves',
    });
  });

  it('un borrador o un enlace de antes, con el arco en «arma», se lee convertido y lo dice', () => {
    // Un arquero ya con cuerpo, del ciclo 2: el arco en `arma`.
    const viejo = {
      ...unidad('elfo-arquero'),
      equipo: { arma: 'arco', armadura: 'jubon_de_arquero' },
    };
    const { unidad: leida, aviso } = migrarUnidadDeArena(viejo, perfilDe, DEL_JUEGO, 'borrador');
    const u = leida!;
    expect(u.equipo).toEqual({ distancia: 'arco', armadura: 'jubon_de_arquero' });
    expect(aviso).toBe(
      'La unidad «Arquero» llevaba Arco en Arma: pasa a Arma a distancia, y cuerpo a cuerpo pega sin arma (ponle una en su ficha).',
    );
    // Dispara como antes; cuerpo a cuerpo, con el cuerpo.
    expect(delUso(u, 'distancia')).toEqual(['Arco', 5, [20, 30]]);
    expect(delUso(u, 'cuerpo')).toEqual([null, 3, [10, 10]]);
    // Lo convertido es de hoy: no se convierte dos veces.
    expect(migrarUnidadDeArena(u, perfilDe, DEL_JUEGO, 'borrador')).toEqual({
      unidad: u,
      aviso: null,
      municion: null,
      retirada: null,
    });
    // Con la lanza, igual: a la carga.
    const jinete = {
      ...unidad('templario-hermano-de-carga'),
      equipo: { arma: 'lanza_de_jinete', armadura: 'barda' },
    };
    expect(migrarUnidadDeArena(jinete, perfilDe, DEL_JUEGO, 'borrador').unidad!.equipo).toEqual({
      carga: 'lanza_de_jinete',
      armadura: 'barda',
    });
    // Escrito a mano con la regla de hoy, no se lee: lo de antes solo entra convertido.
    expect(() => validarUnidadDeArena(viejo, DEL_JUEGO)).toThrow(
      'Arco va en Arma a distancia, no en Arma',
    );
  });

  it('un arquero de antes de cuerpo y equipo sale con el cuerpo de hoy, el arco en su hueco y el aviso', () => {
    const viejo = deAntes('elfo-arquero');
    const {
      unidad: leida,
      aviso,
      municion,
    } = migrarUnidadDeArena(viejo, perfilDe, DEL_JUEGO, 'borrador');
    const u = leida!;
    // El kit de entonces (arco en arma + jubón) se resta como sumaba: 12 − 2, 100–200 − 10–20…
    expect([u.attack, u.defense, u.damage, u.hp]).toEqual([10, 12, [90, 180], 380]);
    expect(u).not.toHaveProperty('shots');
    expect(u.equipo).toEqual({ distancia: 'arco', armadura: 'jubon_de_arquero' });
    expect(aviso).toContain('llevaba Arco en Arma: pasa a Arma a distancia');
    // Sus 30 tiros se van: dispara siempre, y eso se dice una vez por borrador.
    expect(municion).toBe(u.name);
    expect(revisarBorradorDeArena({ unidades: [viejo] }, perfilDe, DEL_JUEGO).avisos).toContain(
      `Ya no hay munición: «${u.name}» traía sus tiros y dispara siempre con su arma a distancia.`,
    );
    // Y dispara con lo de antes: 12, 100–200.
    expect(delUso(u, 'distancia')).toEqual(['Arco', 12, [100, 200]]);
    expect(isShooter(golpes(u).c)).toBe(true);
    // El jinete élfico de antes era `montado-lanza`: su lanza pasa a la carga.
    const elfico = migrarUnidadDeArena(deAntes('elfo-jinete'), perfilDe, DEL_JUEGO, 'borrador');
    expect(elfico.unidad!.equipo).toEqual({ carga: 'lanza_de_jinete', armadura: 'barda' });
    expect(delUso(elfico.unidad!, 'carga')).toEqual(['Lanza de jinete', 12, [100, 200]]);
  });

  it('las piezas de antes se leen en su hueco: el arco del juego cambiado y una nueva con tiros', () => {
    const arcoCambiado = { ...DEL_JUEGO.pieza('arco'), hueco: 'arma', manos: 2, ataque: 4 };
    const nueva = {
      id: 'honda',
      nombre: 'Honda',
      hueco: 'arma',
      calidad: 'arena',
      ataque: 1,
      defensa: 0,
      pv: 0,
      velocidad: 0,
      danio: [5, 10],
      disparos: 20,
      manos: 2,
      precio: { gold: 0 },
    };
    const { validas, invalidas, avisos } = revisarBorradorDeEquipo({
      piezas: [arcoCambiado, nueva],
    });
    expect(invalidas).toEqual([]);
    expect(validas.map((p) => [p.id, p.hueco, p.manos, p.ataque])).toEqual([
      ['arco', 'distancia', undefined, 4],
      ['honda', 'distancia', undefined, 1],
    ]);
    expect(avisos).toEqual([
      'La pieza «Arco» iba en Arma: pasa a Arma a distancia, y ya no es a dos manos.',
      'La pieza «Honda» iba en Arma: pasa a Arma a distancia, y ya no es a dos manos. La pieza «Honda» traía 20 disparos: ya no hay munición, quien la lleve dispara siempre.',
    ]);
    // Sin el campo: la regla de hoy no lo admite (13-10-2026).
    expect(validas.every((p) => !('disparos' in p))).toBe(true);
    // Una pieza de arma sin tiros se queda en arma.
    const garrote = { ...DEL_JUEGO.pieza('espada'), ataque: 3 };
    expect(revisarBorradorDeEquipo({ piezas: [garrote] }).avisos).toEqual([]);
    // Con las convertidas, una unidad que llevaba la honda en `arma` dispara con ella.
    const eq = catalogoDeLaArena(validas);
    const hondero = migrarUnidadDeArena(
      { ...unidad('templario-escudo'), equipo: { arma: 'honda' } },
      perfilDe,
      eq,
      'borrador',
    );
    expect(hondero.unidad!.equipo).toEqual({ distancia: 'honda' });
  });

  it('un enlace de la 6 con el arco en «arma» se convierte con aviso; el mismo en la 7 se rechaza', () => {
    const arquero = unidad('elfo-arquero');
    const piquero = unidad('imperio-piquero');
    const MONTADO: MontajeDelEnlace = {
      unidades: [arquero, piquero],
      piezas: [],
      izquierda: {
        ia: false,
        puestos: [{ unidad: arquero.id, escalera: false }],
        heroe: null,
      },
      derecha: {
        ia: true,
        puestos: [{ unidad: piquero.id, escalera: false }],
        heroe: null,
      },
      muralla: null,
    };
    const texto = montajeALaURL(MONTADO);
    expect(JSON.parse(texto).v).toBe(9);
    const deAntesDeLasArmas = (v: number): string => {
      const o = JSON.parse(texto);
      o.v = v;
      // Hasta la 7, con las pruebas del catálogo.
      o.pruebas = {};
      o.unidades[0].equipo = { arma: 'arco', armadura: 'jubon_de_arquero' };
      o.piezas = [{ ...DEL_JUEGO.pieza('arco'), hueco: 'arma', manos: 2, ataque: 3 }];
      return JSON.stringify(o);
    };
    const leido = montajeDeLaURL(deAntesDeLasArmas(6));
    expect(leido.unidades[0]?.equipo).toEqual({ distancia: 'arco', armadura: 'jubon_de_arquero' });
    expect(leido.piezas.map((p) => [p.id, p.hueco, p.ataque])).toEqual([['arco', 'distancia', 3]]);
    expect(leido.avisos?.join(' ')).toContain(
      'La pieza «Arco» iba en Arma: pasa a Arma a distancia',
    );
    expect(leido.avisos?.join(' ')).toContain('La unidad «Arquero» llevaba Arco en Arma');
    // Y se reescribe en la de hoy, ya en su hueco.
    expect(JSON.parse(montajeALaURL(leido)).unidades[0].equipo).toEqual({
      distancia: 'arco',
      armadura: 'jubon_de_arquero',
    });
    // En la 7 ya no se convierte: el arco del juego en `arma` no es de ese enlace.
    expect(() => montajeDeLaURL(deAntesDeLasArmas(7))).toThrow(
      'una pieza del enlace no vale: «Arco» es una pieza del juego y va en Arma a distancia: su hueco no se cambia',
    );
  });
});

describe('sin munición: dispara quien lleva arma a distancia (13-10-2026)', () => {
  /** Un blanco que no cae ni se mueve: mucha vida, lejos. */
  const muro = (): UnidadDeArena => unidad('troll-maza', { hp: 100_000 });
  /** El arquero (o lo que sea) a la izquierda contra el muro, cada uno en su punta. */
  function tiroLibre(tirador: UnidadDeArena): BattleState {
    const b = pelea([tirador], [muro()], createRng(3));
    stackById(b, 'attacker-0').hex = { col: 0, row: 4 };
    stackById(b, 'defender-0').hex = { col: 11, row: 4 };
    return b;
  }
  const dispara = (b: BattleState): void => {
    forzarTurno(b, 'attacker-0');
    const tiro = legalActions(b).find((a) => a.type === 'shoot');
    if (tiro === undefined)
      throw new Error(`no se ofrece el disparo: ${ataqueBlocker(b, 'defender-0')}`);
    applyAction(b, tiro, createRng(b.log.length));
  };

  it('el arquero por defecto dispara 15 turnos seguidos: más que los 12 de antes, sin gastar nada', () => {
    const b = tiroLibre(unidad('elfo-arquero'));
    for (let i = 0; i < 15; i++) dispara(b);
    expect(b.log.filter((e) => e.kind === 'shoot')).toHaveLength(15);
    // Ni cuenta ni gasta: `shotsLeft` no significa nada en la arena.
    expect(cuentaTiros(stackById(b, 'attacker-0').unit)).toBe(false);
    expect(stackById(b, 'attacker-0').shotsLeft).toBe(0);
  });

  it('cada disparo es un tiro; con «dos disparos», dos', () => {
    // Los tiros de un disparo: un `shoot` en el registro por cada uno (`shoot`, `battle.ts`).
    const tiros = (u: UnidadDeArena): number => {
      const b = tiroLibre(u);
      const desde = b.log.length;
      dispara(b);
      return b.log.slice(desde).filter((e) => e.kind === 'shoot').length;
    };
    expect(tiros(unidad('elfo-arquero'))).toBe(1);
    expect(tiros(unidad('elfo-arquero', { traits: ['double_shot'] }))).toBe(2);
  });

  it('sin arma a distancia no dispara, y el motivo es «no es tirador», nunca «sin munición»', () => {
    const b = tiroLibre(unidad('templario-escudo'));
    forzarTurno(b, 'attacker-0');
    expect(legalActions(b).some((a) => a.type === 'shoot')).toBe(false);
    expect(() => applyAction(b, { type: 'shoot', target: 'defender-0' }, createRng(1))).toThrow(
      'attacker-0 no es tirador',
    );
    // Ninguna hoja por defecto dice «sin munición»: o tira, o no es tirador.
    for (const h of HOJAS) {
      const t = tiroLibre(unidadPorDefecto(h));
      forzarTurno(t, 'attacker-0');
      expect(ataqueBlocker(t, 'defender-0') ?? '', h.id).not.toContain('munición');
    }
  });
});

describe('sin el catálogo del juego (13-10-2026)', () => {
  it('un cuerpo de criatura no vale hoy, y un borrador de antes con una la retira diciéndolo', () => {
    expect(() =>
      validarUnidadDeArena({ ...unidad('zombi'), cuerpo: { criatura: 'skeleton' } }, DEL_JUEGO),
    ).toThrow(
      'la unidad «Zombie»: su cuerpo es una criatura del catálogo del juego, y en la arena solo están las cinco facciones de las hojas',
    );
    const esqueleto = {
      ...unidad('zombi'),
      id: 'skeleton-2',
      name: 'Esqueleto 2',
      cuerpo: { criatura: 'skeleton' },
      shots: 3,
    };
    const dragon = {
      ...unidad('zombi'),
      id: 'bone-dragon-2',
      name: 'Dragón óseo 2',
      cuerpo: { criatura: 'bone_dragon' },
      hexes: 2,
    };
    const r = revisarBorradorDeArena(
      { unidades: [unidad('zombi'), esqueleto, dragon] },
      perfilDe,
      DEL_JUEGO,
    );
    // Ni vale ni se conserva: se va, y se dice.
    expect(r.validas.map((u) => u.id)).toEqual(['zombi']);
    expect(r.invalidas).toEqual([]);
    // Lo que se retira va aparte (`seRetiran`), para decirlo antes que nada: es
    // lo que «Guardar» pierde (H1 de QA). El tamaño y los tiros que traían, ni se
    // dicen: con la unidad se va todo.
    expect(r.seRetiran).toEqual([
      'La unidad «Esqueleto 2» era una criatura del catálogo del juego («skeleton»): en la arena solo están las cinco facciones de las hojas, y se retira.',
      'La unidad «Dragón óseo 2» era una criatura del catálogo del juego («bone_dragon»): en la arena solo están las cinco facciones de las hojas, y se retira.',
    ]);
    expect(r.avisos).toEqual([]);
    // Una a una, la retirada trae su id: con él el enlace quita también sus puestos.
    expect(migrarUnidadDeArena(dragon, perfilDe, DEL_JUEGO, 'borrador')).toMatchObject({
      unidad: null,
      retirada: 'bone-dragon-2',
    });
    // Lo que «Guardar» escribe es lo que vale: la retirada no vuelve al disco.
    expect(validarBorradorDeArena({ unidades: r.validas }, DEL_JUEGO)).toEqual(r.validas);
    const { shots: _tiros, ...sinTiros } = esqueleto;
    expect(() => validarBorradorDeArena({ unidades: [sinTiros] }, DEL_JUEGO)).toThrow(
      'su cuerpo es una criatura del catálogo del juego',
    );
  });

  it('en disco: leer y guardar un borrador con una criatura la deja fuera', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arena-'));
    try {
      mkdirSync(join(dir, 'data/borradores'), { recursive: true });
      const criatura = {
        ...unidad('zombi'),
        id: 'peasant-2',
        name: 'Campesino 2',
        cuerpo: { criatura: 'peasant' },
      };
      writeFileSync(
        join(dir, RUTA_DEL_BORRADOR),
        JSON.stringify({ unidades: [unidad('zombi'), criatura] }),
      );
      const leido = leerBorrador(dir);
      expect(leido.unidades.map((u) => u.id)).toEqual(['zombi']);
      expect(leido.invalidas).toEqual([]);
      expect(leido.seRetiran.join(' ')).toContain('«Campesino 2» era una criatura del catálogo');
      escribirBorrador(dir, { unidades: leido.unidades, piezas: [] });
      const json = readFileSync(join(dir, RUTA_DEL_BORRADOR), 'utf8');
      expect(json).not.toContain('peasant');
      expect(json).not.toContain('"criatura"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('el comentario del borrador lo dice: solo hojas, sin munición ni tamaño', () => {
    expect(COMENTARIO_DEL_BORRADOR).toContain('cuerpo: { hoja }');
    expect(COMENTARIO_DEL_BORRADOR).not.toContain('{ criatura }');
    expect(COMENTARIO_DEL_BORRADOR).toContain('sin munición');
    expect(COMENTARIO_DEL_BORRADOR).toContain('no hay shots ni hexes');
  });
});
