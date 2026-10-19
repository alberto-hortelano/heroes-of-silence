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
  resumenDeCifras,
} from '../src/client/arena/paneles.js';
import { marcadoDe } from '../src/client/html.js';
import { arteDe, juegosDelYBot, registrarUnidad } from '../src/client/render/personajes.js';
import { type LadoDeSesion, SesionDeArena } from '../src/client/session.js';
import { nombreEnElCampo } from '../src/client/views/distintivo.js';
import { renderBattleLog } from '../src/client/views/panels.js';
import { completarCruce } from '../src/core/ai/rueda.js';
import { chooseBattleAction } from '../src/core/ai/tactics.js';
import {
  batallaDeArena,
  cuerpoDelStack,
  equiparEnArena,
  type FuenteDeArena,
  fichaDeHeroeDeArena,
  finalDeArena,
  type HeroeDeArena,
  heroeDeArena,
  heroePorDefecto,
  type IdsOcupados,
  idsLlevados,
  lecturaDelNivel,
  type MontajeDelEnlace,
  montajeALaURL,
  montajeDeArenaDelEnlace,
  montajeDeLaURL,
  piezaNueva,
  piezasDelMontaje,
  quitarEnArena,
  retiradosDeLaURL,
  retocarEnBatalla,
  tipoDelStack,
  unaVezEnLaURL,
  unidadNueva,
  VERSION_DEL_ENLACE,
  validarHeroeDeArena,
} from '../src/core/arena.js';
import { FORMAS_DE_EJEMPLO, validarFormaDeMuralla } from '../src/core/arena-murallas.js';
import { armaduraDe } from '../src/core/battle/armas.js';
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
import { armasDe } from '../src/core/battle/damage.js';
import { SIN_MURALLA } from '../src/core/battle/muralla.js';
import { allSpells, spell, spellAmount } from '../src/core/battle/spells.js';
import type { BattleStack, BattleState } from '../src/core/battle/types.js';
import { UNIDADES as CATALOGO, unidadesDelJuego } from '../src/core/catalogo.js';
import {
  CATALOGO_DE_HABILIDADES,
  cuentaTiros,
  EQUIPO_ESCRITO,
  isShooter,
  LIDERAZGO,
  type Pieza,
  validarPieza,
} from '../src/core/data.js';
import { EQUIPO_BASE, EQUIPO_DEL_JUEGO } from '../src/core/hero/equipo.js';
import { HERO_BODY } from '../src/core/hero/hero.js';
import { indiceDePoder } from '../src/core/nivel.js';
import { createRng, type Rng } from '../src/core/rng.js';
import { CREATURE_TRAITS, SPEED_TIERS, SPEED_TO_HEXES } from '../src/core/types.js';
import {
  armaDeCuerpoBlocker,
  COMENTARIO_DEL_CATALOGO_DE_UNIDADES,
  ESPADA,
  escalonDeCasillas,
  HABILIDADES_DE_LA_ARENA,
  type HojaDeArena,
  KIT_DEL_PERFIL,
  nivelesDeLaEspada,
  RUTA_DEL_CATALOGO_DE_UNIDADES,
  revisarCatalogo,
  type UnidadDeArena,
  unidadDeCombate,
  validarCatalogo,
  validarHojasDeArena,
  validarUnidadDeArena,
} from '../src/core/unidad.js';
import { NOMBRES_DE_DIRECCION } from '../src/shared/arte.js';
import { escribirCatalogo, hojasDeArena, leerCatalogo } from '../tools/arena/borrador.js';
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
  carpetaDeLaArena,
  catalogoCon,
  catalogoEntero,
  delBorrador,
  elCatalogoCon,
  forzarTurno,
  hojaDeLaArena,
  hojasDeLaArena,
  MANOS_DE_PRUEBA,
  MONTAJE,
  motivoDelCambio,
  peleaDelMotor,
  unidadDeArena,
} from './helpers.js';

const RAIZ = resolve(import.meta.dirname, '..');
/** El catálogo del juego con las manos de prueba: el de las peleas de estas pruebas. */
const CON_MANOS = catalogoCon(MANOS_DE_PRUEBA);
const HOJAS = hojasDeLaArena();
const hojaPorId = hojaDeLaArena;
const unidad = unidadDeArena;

/** Un bando de la sesión con unidades del borrador y sin héroe, que mueve la IA. */
const ia = (...us: UnidadDeArena[]): LadoDeSesion => ({
  unidades: us.map((u) => delBorrador(u)),
  heroe: null,
  ia: true,
});

/**
 * Una pelea solo con unidades del borrador, sin héroes y con las reglas del juego;
 * con las manos de prueba entre sus piezas, para quien pelee sin las de su perfil.
 */
function pelea(
  izquierda: readonly UnidadDeArena[],
  derecha: readonly UnidadDeArena[],
  rng: Rng,
): BattleState {
  return batallaDeArena(
    {
      izquierda: { unidades: izquierda.map((u) => delBorrador(u)), heroe: null },
      derecha: { unidades: derecha.map((u) => delBorrador(u)), heroe: null },
      equipo: CON_MANOS,
    },
    rng,
  );
}

/** Una sesión con las reglas del juego, sin empezar. */
function sesion(izquierda: LadoDeSesion, derecha: LadoDeSesion, semilla: number): SesionDeArena {
  return new SesionDeArena({ izquierda, derecha, ...MONTAJE }, semilla);
}

/** La tarjeta de una unidad del borrador, como la da `main.ts`. */
const tarjeta = (u: UnidadDeArena): DatosDePuesto => ({
  nombre: u.name,
  resumen: resumenDeCifras(u, EQUIPO_DEL_JUEGO),
  figura: u.id,
  noEscala: null,
});

/** Los ids ocupados de un borrador sin unidades que no validan ni hojas. */
function ocupados(...validas: string[]): IdsOcupados {
  return { validas, sinValidar: [], hojas: [] };
}

/**
 * Una unidad nueva de la hoja `h` con el equipo de su perfil (`KIT_DEL_PERFIL`):
 * como nació cada unidad del catálogo. Para las hojas que no tienen la suya en él
 * (los héroes), que los tests de velocidad comparan con las del catálogo.
 */
function conSuKit(h: HojaDeArena): UnidadDeArena {
  const nueva = unidadNueva(h, ocupados(), EQUIPO_DEL_JUEGO);
  return validarUnidadDeArena(
    { ...nueva, equipo: KIT_DEL_PERFIL[h.perfil].equipo },
    EQUIPO_DEL_JUEGO,
  );
}

/** Lo que la ficha enseña del nivel de una unidad: el de su cuerpo, aunque pelee con su equipo. */
const nivelDeLaHoja = (u: UnidadDeArena): string =>
  lecturaDelNivel(unidadDeCombate(u, EQUIPO_DEL_JUEGO));

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
    // Con las manos de prueba, que no suman nada: el bastón de su perfil le
    // sumaría daño (eso, en el test de abajo), y sin arma no se monta.
    const monje = unidad('templario-monje', {
      attack: 42,
      damage: [3, 9],
      hp: 21,
      equipo: { arma: MANOS_DE_PRUEBA.id },
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
    // Su cuerpo, el del catálogo: 3 / 4, daño 8–10, 80 PV y 4 casillas.
    expect(u).toMatchObject({ attack: 3, defense: 4, damage: [8, 10], hp: 80, casillas: 4 });
    expect(s.unit).toMatchObject({ attack: 5, defense: 8, damage: [18, 40], hp: 80 });
    expect(armaduraDe(s.unit)).toBe(7);
    expect(SPEED_TO_HEXES[s.unit.speed]).toBe(3);
    expect(s.topHp).toBe(80);
    // El cuerpo sin equipo, para la ficha y el retoque (el nivel lo mide vestido).
    expect(cuerpoDelStack(b, s)).toMatchObject({ attack: 3, defense: 4, damage: [8, 10], hp: 80 });
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
        // La rueda (siempre, desde el 19-10-2026) para la sesión también al
        // golpear y al responder: se elige y se sigue.
        if (s.ruedaPendiente !== null) {
          s.elegirEnLaRueda('normal');
          if (++turnos > 500) throw new Error('la batalla no termina');
          continue;
        }
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
    const m = marcadoDe(renderFicha(u, false, enElMontaje(EQUIPO_DEL_JUEGO)));
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

  it('un borrador de antes con `level` no vale: no se convierte, y se conserva con su motivo', () => {
    // Sin compatibilidad hacia atrás (14-10-2026): la escala de fheroes2 ya no se lee.
    const vieja = { ...unidad('templario-monje'), level: 9 };
    const r = revisarCatalogo({ unidades: [vieja] }, EQUIPO_DEL_JUEGO);
    expect(r.validas).toEqual([]);
    expect(r.invalidas).toEqual([
      {
        id: 'templario-monje',
        motivo: expect.stringContaining('«level» no es un campo de la arena'),
        crudo: vieja,
      },
    ]);
  });

  it('`level` no se ofrece como campo de la arena', () => {
    const motivo = ((): string => {
      try {
        validarUnidadDeArena({ ...unidad('templario-monje'), growth: 3 }, EQUIPO_DEL_JUEGO);
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
      expect(() => validarUnidadDeArena(u, EQUIPO_DEL_JUEGO)).toThrow(
        `la unidad «${guerrero.name}»: estas cifras son demasiado grandes para medir su nivel`,
      );
      expect(() => validarUnidadDeArena(u, EQUIPO_DEL_JUEGO)).toThrow('baja la vida o el daño');
      expect(() => pelea([u], [unidad('zombi')], createRng(5))).toThrow('demasiado grandes');
      expect(() => pelea([unidad('zombi')], [u], createRng(5))).toThrow('demasiado grandes');
    }
    // Lo grande pero medible sigue entrando y pelea.
    const grande = validarUnidadDeArena({ ...guerrero, hp: 10_000_000 }, EQUIPO_DEL_JUEGO);
    expect(nivelDeLaHoja(grande)).toMatch(/^Índice \d+ · nivel \d+$/);
  });
});

describe('el borrador se valida antes de escribirse', () => {
  const base = (): UnidadDeArena => unidad('templario-monje');

  it('rechaza diciéndolo: velocidad inventada, rasgo inexistente, daño al revés', () => {
    expect(() => validarUnidadDeArena({ ...base(), casillas: 9 }, EQUIPO_DEL_JUEGO)).toThrow(
      'la unidad «Monje»: la velocidad es de 2 a 7 casillas, y es 9',
    );
    expect(() => validarUnidadDeArena({ ...base(), traits: ['volar'] }, EQUIPO_DEL_JUEGO)).toThrow(
      'la unidad «Monje»: el rasgo "volar" no existe',
    );
    expect(() => validarUnidadDeArena({ ...base(), damage: [5, 2] }, EQUIPO_DEL_JUEGO)).toThrow(
      'la unidad «Monje»: el daño mínimo (5) no puede pasar del máximo (2)',
    );
    expect(() =>
      validarUnidadDeArena({ ...base(), habilidades: ['Volar'] }, EQUIPO_DEL_JUEGO),
    ).toThrow('la habilidad "Volar" no existe');
    expect(() => validarUnidadDeArena({ ...base(), hp: 0 }, EQUIPO_DEL_JUEGO)).toThrow(
      'la vida tiene que ser 1 o más',
    );
    expect(() => validarUnidadDeArena({ ...base(), attack: 2.5 }, EQUIPO_DEL_JUEGO)).toThrow(
      'el ataque tiene que ser un número entero, y es 2.5',
    );
    expect(() => validarUnidadDeArena({ ...base(), attack: Number.NaN }, EQUIPO_DEL_JUEGO)).toThrow(
      'la unidad «Monje»: el ataque no tiene valor, el campo está vacío',
    );
    expect(() =>
      validarUnidadDeArena({ ...base(), traits: ['charge', 'charge'] }, EQUIPO_DEL_JUEGO),
    ).toThrow('el rasgo "charge" está dos veces');
    // Toda unidad ocupa una casilla (13-10-2026): el tamaño ya no es un campo.
    expect(() => validarUnidadDeArena({ ...base(), hexes: 2 }, EQUIPO_DEL_JUEGO)).toThrow(
      '«hexes» no es un campo de la arena',
    );
    expect(() =>
      validarUnidadDeArena({ ...base(), faction: 'caballeros' }, EQUIPO_DEL_JUEGO),
    ).toThrow('la facción "caballeros" no existe');
  });

  it('sin munición: `shots` no es un campo de la arena, y el motivo no lo ofrece (13-10-2026)', () => {
    // Dispara quien lleva arma a distancia; lo de antes con tiros no vale.
    expect(() => validarUnidadDeArena({ ...base(), shots: 3 }, EQUIPO_DEL_JUEGO)).toThrow(
      '«shots» no es un campo de la arena',
    );
    expect(() => validarUnidadDeArena({ ...base(), shots: 3 }, EQUIPO_DEL_JUEGO)).not.toThrow(
      /valen .*\bshots\b/,
    );
    expect(() => validarUnidadDeArena({ ...base(), hexes: 2 }, EQUIPO_DEL_JUEGO)).not.toThrow(
      /valen .*\bhexes\b/,
    );
  });

  it('el catálogo no trae dos veces la misma unidad', () => {
    expect(() => validarCatalogo({ unidades: [base(), base()] }, EQUIPO_DEL_JUEGO)).toThrow(
      'data/unidades.json: la unidad "templario-monje" está dos veces en el catálogo',
    );
  });

  describe('en disco', () => {
    let dir: string | null = null;
    afterEach(() => {
      if (dir !== null) rmSync(dir, { recursive: true, force: true });
      dir = null;
    });

    it('lo que no valida no se escribe; lo que valida vuelve igual y sin temporales', () => {
      dir = carpetaDeLaArena();
      const ruta = join(dir, RUTA_DEL_CATALOGO_DE_UNIDADES);
      // Lo que se escribe va en el formato de hoy: lo de antes no se escribe.
      expect(() =>
        escribirCatalogo(dir as string, {
          unidades: [{ ...base(), speed: 'x' }],
          piezas: EQUIPO_ESCRITO,
        }),
      ).toThrow('«speed» no es un campo de la arena');
      expect(existsSync(ruta)).toBe(false);
      expect(leerCatalogo(dir)).toMatchObject({ unidades: [], invalidas: [] });

      const monje = { ...base(), attack: 9, habilidades: ['Salto'] };
      escribirCatalogo(dir, { unidades: catalogoEntero(monje), piezas: EQUIPO_ESCRITO });
      const json = JSON.parse(readFileSync(ruta, 'utf8')) as {
        _comment: string;
        unidades: unknown[];
      };
      expect(json._comment).toContain('CATÁLOGO de unidades');
      expect(leerCatalogo(dir).unidades).toEqual(catalogoEntero(monje));
      // Sin temporales al lado, y sin crear el borrador de equipo: no había piezas.
      expect(readdirSync(dir).sort()).toEqual(['data']);
      expect(readdirSync(join(dir, 'data')).sort()).toEqual(['equipo.json', 'unidades.json']);

      // Un guardado malo después de uno bueno deja el bueno donde estaba.
      expect(() =>
        escribirCatalogo(dir as string, {
          unidades: catalogoEntero({ ...monje, damage: [3, 1] }),
          piezas: EQUIPO_ESCRITO,
        }),
      ).toThrow();
      expect(leerCatalogo(dir).unidades).toEqual(catalogoEntero(monje));
    });
  });

  it('el catálogo del repo se lee entero: ninguna unidad que no valga', () => {
    expect(leerCatalogo(RAIZ).invalidas).toEqual([]);
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
    const m = marcadoDe(renderFicha(u, false, enElMontaje(EQUIPO_DEL_JUEGO)));
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
    expect(marcadoDe(renderFicha(u, true, enElMontaje(EQUIPO_DEL_JUEGO)))).toContain(
      'data-clip="shoot"',
    );
  });

  it('la ficha lleva el nombre en su título con «✎ Editar», y no entre las cifras', () => {
    const u = { ...unidad('templario-monje'), name: 'Hermano <Monje>' };
    const m = marcadoDe(renderFicha(u, false, enElMontaje(EQUIPO_DEL_JUEGO)));
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
        ...enElMontaje(EQUIPO_DEL_JUEGO),
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
        enElMontaje(EQUIPO_DEL_JUEGO),
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
          { ...enElMontaje(EQUIPO_DEL_JUEGO), renombrando: true },
          [],
        ),
      ),
    ).toContain('class="renombrar" data-heroe-campo="nombre"');
  });

  it('los rasgos del motor van como las habilidades: etiquetas con × y el resto en «Añadir»', () => {
    const u = unidad('zombi', { traits: ['undead', 'charge'] });
    const m = marcadoDe(renderFicha(u, false, enElMontaje(EQUIPO_DEL_JUEGO)));
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
      renderFicha(unidad('zombi', { traits: [] }), false, enElMontaje(EQUIPO_DEL_JUEGO)),
    );
    expect(sinRasgos).toContain(
      '<div class="etiquetas rasgos-puestos"><span class="cost">Ninguno.</span>',
    );
  });

  it('la cabeza de la ficha: figura y clips en columna a la izquierda, cifras a la derecha; en combate, sin figura', () => {
    const u = unidad('templario-escudo');
    const m = marcadoDe(renderFicha(u, false, enElMontaje(EQUIPO_DEL_JUEGO)));
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
    expect(cifras).toContain('data-campo="defense"');
    expect(clips).not.toContain('data-campo');
    // En el editor de la batalla: sin figura ni clips, las cifras a todo el ancho.
    const enCombate = marcadoDe(
      renderFicha(u, false, {
        enCombate: true,
        piezas: EQUIPO_DEL_JUEGO,
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
      writeFileSync(join(raiz, RUTA_DEL_CATALOGO_DE_UNIDADES), JSON.stringify({ unidades }));
    };

    it('una unidad que no vale no tira las buenas, y se vuelve a escribir tal cual', () => {
      dir = carpetaDeLaArena();
      const buena = unidad('templario-monje', { attack: 11 });
      const mala = { ...unidad('zombi'), hp: -1 };
      escribirAMano(dir, [buena, mala]);
      const leido = leerCatalogo(dir);
      expect(leido.unidades).toEqual([buena]);
      expect(leido.invalidas).toEqual([
        {
          id: 'zombi',
          motivo: 'la unidad «Zombie»: la vida tiene que ser 1 o más, y es -1',
          crudo: mala,
        },
      ]);
      // La página guarda lo que tiene —el catálogo con la buena, sin el zombi que
      // no vale, y una nueva— y la mala sigue ahí. Guarda el catálogo entero: con
      // menos, una morada se quedaría sin unidades y el juego no arrancaría.
      const nueva = { ...unidad('elfo-arquero'), id: 'elfo-arquero-2' };
      const sinElZombi = [...catalogoEntero(buena).filter((u) => u.id !== 'zombi'), nueva];
      expect(escribirCatalogo(dir, { unidades: sinElZombi, piezas: EQUIPO_ESCRITO })).toMatchObject(
        {
          unidades: sinElZombi.length,
          conservadas: 1,
        },
      );
      const json = JSON.parse(readFileSync(join(dir, RUTA_DEL_CATALOGO_DE_UNIDADES), 'utf8')) as {
        unidades: unknown[];
      };
      expect(json.unidades).toEqual([...sinElZombi, mala]);
      // Y mandar una válida con su id es arreglarla: la mala se va.
      const arreglada = unidad('zombi');
      const todas = catalogoEntero(buena, nueva, arreglada);
      expect(escribirCatalogo(dir, { unidades: todas, piezas: EQUIPO_ESCRITO }).conservadas).toBe(
        0,
      );
      expect(leerCatalogo(dir)).toMatchObject({ unidades: todas, invalidas: [] });
    });

    it('una unidad repetida se conserva al guardar otra (QA, M3)', () => {
      dir = carpetaDeLaArena();
      const buena = unidad('templario-monje', { attack: 11 });
      const repetida = unidad('templario-monje', { attack: 3 });
      escribirAMano(dir, [buena, repetida]);
      expect(leerCatalogo(dir).invalidas.map((i) => i.crudo)).toEqual([repetida]);
      const nueva = { ...unidad('elfo-arquero'), id: 'elfo-arquero-2' };
      const todas = catalogoEntero(buena, nueva);
      expect(escribirCatalogo(dir, { unidades: todas, piezas: EQUIPO_ESCRITO }).conservadas).toBe(
        1,
      );
      const json = JSON.parse(readFileSync(join(dir, RUTA_DEL_CATALOGO_DE_UNIDADES), 'utf8')) as {
        unidades: unknown[];
      };
      expect(json.unidades).toEqual([...todas, repetida]);
    });

    it('un archivo que no se puede leer no se pisa: se dice', () => {
      dir = carpetaDeLaArena();
      mkdirSync(join(dir, 'data/borradores'), { recursive: true });
      writeFileSync(join(dir, RUTA_DEL_CATALOGO_DE_UNIDADES), '{ esto no es json');
      expect(() => leerCatalogo(dir as string)).toThrow(
        `${RUTA_DEL_CATALOGO_DE_UNIDADES} no es JSON`,
      );
      expect(() =>
        escribirCatalogo(dir as string, { unidades: catalogoEntero(), piezas: EQUIPO_ESCRITO }),
      ).toThrow('no se guarda para no pisarlo');
      expect(readFileSync(join(dir, RUTA_DEL_CATALOGO_DE_UNIDADES), 'utf8')).toBe(
        '{ esto no es json',
      );
    });

    it('una unidad válida sin hoja se lee y se vuelve a guardar', () => {
      dir = carpetaDeLaArena();
      const fantasma = { ...unidad('templario-monje'), id: 'templario-fantasma', name: 'Fantasma' };
      escribirAMano(dir, [fantasma]);
      expect(leerCatalogo(dir).unidades).toEqual([fantasma]);
      escribirCatalogo(dir, { unidades: catalogoEntero(fantasma), piezas: EQUIPO_ESCRITO });
      expect(leerCatalogo(dir).unidades).toEqual(catalogoEntero(fantasma));
    });
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
    // del imperio. Con el gambesón del equipo base (18-10-2026) el héroe aguanta
    // el primer Rayo y cae en la ronda 2.
    const lado = (l: 'izquierda' | 'derecha'): LadoDeSesion => ({
      unidades: [delBorrador(unidad('imperio-piquero'))],
      heroe: heroePorDefecto(l),
      ia: true,
    });
    const s = new SesionDeArena(
      {
        izquierda: lado('izquierda'),
        derecha: lado('derecha'),
        equipo: EQUIPO_DEL_JUEGO,
      },
      11,
    );
    s.empezar();
    expect(s.battle.round).toBe(2);
    expect(s.battle.stacks.filter((x) => x.origen.kind !== 'heroe' && isAlive(x))).toHaveLength(2);
    expect(finalDeArena(s.battle)).toMatchObject({ ganador: 'izquierda', causa: 'heroe' });
    const texto = marcadoDe(renderPanelDeBatalla(s, false));
    expect(texto).toContain(
      'Gana el bando izquierdo en la ronda 2: cayó el héroe del bando derecho.',
    );
    expect(texto).not.toContain('por tiempo');
  });

  it('M2 y M14: un campo vacío se dice vacío, y un campo que no es de la arena se rechaza', () => {
    expect(() =>
      validarUnidadDeArena({ ...unidad('zombi'), hp: Number.NaN }, EQUIPO_DEL_JUEGO),
    ).toThrow('la vida no tiene valor, el campo está vacío');
    expect(() => validarUnidadDeArena({ ...unidad('zombi'), growth: 3 }, EQUIPO_DEL_JUEGO)).toThrow(
      'la unidad "zombi": «growth» no es un campo de la arena',
    );
  });

  it('M7: los no muertos son `undead`, en el catálogo y al nacer con «Nueva unidad»; los demás, no', () => {
    for (const u of CATALOGO) {
      expect(u.traits.includes('undead'), u.id).toBe(u.faction === 'no-muertos');
    }
    for (const h of HOJAS) {
      const nueva = unidadNueva(h, ocupados(), EQUIPO_DEL_JUEGO);
      expect(nueva.traits.includes('undead'), h.id).toBe(h.faccion === 'no-muertos');
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

  it('una hoja de unidad no sustituye a un cuerpo sin hoja (el héroe)', () => {
    const jinete = HOJAS.find((h) => h.id === 'templario-hermano-de-carga');
    expect(() => registrarUnidad(HERO_BODY, jinete as (typeof HOJAS)[number])).toThrow(
      `"${HERO_BODY}" es un cuerpo del juego`,
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
      expect(unidadNueva(h, ocupados(), EQUIPO_DEL_JUEGO).casillas, h.id).toBe(h.casillas);
    }
    // Un personaje, una velocidad: todas sus hojas comparten cuerpo (12-10-2026).
    const porPersonaje = new Map<string, Set<number>>();
    for (const h of HOJAS) {
      porPersonaje.set(h.personaje, (porPersonaje.get(h.personaje) ?? new Set()).add(h.casillas));
    }
    for (const [p, cs] of porPersonaje) expect(cs.size, p).toBe(1);
  });

  it('el criterio del usuario se cumple en lo que pelea cada unidad del catálogo', () => {
    // Las casillas con las que pelea (cuerpo + equipo), que es lo que pedía el
    // criterio de 02-10-2026 cuando la tabla iba por hoja.
    const v = (id: string): number =>
      SPEED_TO_HEXES[unidadDeCombate(unidad(id), EQUIPO_DEL_JUEGO).speed];
    expect(v('goblin-jinete-de-hiena')).toBeGreaterThan(v('orko-hacha-escudo'));
    expect(v('templario-hermano-de-carga')).toBeGreaterThan(6);
    // A pie, ninguna llega al Danzante (un héroe, 6 con su espada y su escudo):
    // solo el jinete le pasa.
    const danzante = conSuKit(hojaPorId('heroe-elfo-danzante-de-espadas'));
    expect(SPEED_TO_HEXES[unidadDeCombate(danzante, EQUIPO_DEL_JUEGO).speed]).toBe(6);
    const aPie = CATALOGO.filter((u) => !u.traits.includes('charge'));
    expect(Math.max(...aPie.map((u) => v(u.id)))).toBeLessThan(6);
    // Y no hay un empate masivo: ninguna velocidad lleva a más de la mitad.
    const cuenta = new Map<number, number>();
    for (const u of CATALOGO) cuenta.set(v(u.id), (cuenta.get(v(u.id)) ?? 0) + 1);
    expect(Math.max(...cuenta.values())).toBeLessThan(CATALOGO.length / 2);
  });

  it('el motor juega el escalón de esas casillas, y fuera de 2..7 se rechaza diciéndolo', () => {
    for (const t of SPEED_TIERS) expect(escalonDeCasillas(SPEED_TO_HEXES[t])).toBe(t);
    expect(() => escalonDeCasillas(8)).toThrow('la velocidad es de 2 a 7 casillas, y es 8');
    expect(() =>
      validarUnidadDeArena({ ...unidad('zombi'), casillas: 9 }, EQUIPO_DEL_JUEGO),
    ).toThrow('la unidad «Zombie»: la velocidad es de 2 a 7 casillas, y es 9');
    expect(() =>
      validarUnidadDeArena({ ...unidad('zombi'), casillas: 1 }, EQUIPO_DEL_JUEGO),
    ).toThrow('la velocidad tiene que ser 2 o más, y es 1');
    const danzante = conSuKit(hojaPorId('heroe-elfo-danzante-de-espadas'));
    const b = pelea([danzante], [unidad('zombi')], createRng(1));
    expect(b.stacks.map((s) => s.unit.speed)).toEqual(['very_fast', 'very_slow']);
  });

  it('con las velocidades de salida ya no juega un ejército entero y luego el otro', () => {
    const s = sesion(
      ia(
        ...['templario-escudo', 'templario-mandoble', 'templario-escudero'].map((id) => unidad(id)),
      ),
      ia(
        unidad('elfo-arquero'),
        unidad('troll-maza'),
        conSuKit(hojaPorId('heroe-elfo-danzante-de-espadas')),
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
    applyAction(b, completarCruce(b, chooseBattleAction(b), rng).accion, rng);
  }
  return b;
}

describe('la arena como banco de combate', () => {
  it('C4: la arena pelea exactamente como el juego', () => {
    // El mismo ejército por las dos vías: la del juego (`createBattle`, con cada
    // unidad como personaje: `peleaDelMotor`) y la de la arena (`batallaDeArena`).
    // Héroes con todo el libro, tiradores, jinetes que cargan y no-muertos. Desde
    // el 19-10-2026 las dos van por `createBattle`, sin interruptores: esto vigila
    // que el montaje de la arena no cambie nada por el camino.
    const izquierda = ['elfo-arquero', 'templario-hermano-de-carga', 'templario-escudo'];
    const derecha = ['esqueleto-guerrero', 'esqueleto-arquero', 'caballero-de-la-muerte'];
    const delMotor = (ids: readonly string[]) => ids.map((id) => ({ unidad: unidad(id) }));
    for (const semilla of [1, 2, 3, 4, 5, 6]) {
      const juego = aLaIA(
        peleaDelMotor(delMotor(izquierda), delMotor(derecha), createRng(semilla), SIN_MURALLA, {
          izquierda: heroeDeArena(MAGO, EQUIPO_DEL_JUEGO),
          derecha: heroeDeArena(MAGO, EQUIPO_DEL_JUEGO),
        }),
        createRng(semilla + 100),
      );
      const arena = aLaIA(
        batallaDeArena(
          {
            izquierda: { unidades: izquierda.map(deLaHoja), heroe: MAGO },
            derecha: { unidades: derecha.map(deLaHoja), heroe: MAGO },
            equipo: EQUIPO_DEL_JUEGO,
          },
          createRng(semilla),
        ),
        createRng(semilla + 100),
      );
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
        equipo: EQUIPO_DEL_JUEGO,
      },
      1,
    );
    s.empezar();
    expect(s.battle.heroes.attacker).toMatchObject({ mana: 40, spellPower: 3 });
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
    const ficha = fichaDeHeroeDeArena(MAGO, EQUIPO_DEL_JUEGO);
    expect(ficha.mana).toBe(40);
    // El cuerpo con el que pisa el tablero: sus cifras con el equipo base puesto,
    // como el de un héroe recién hecho en la partida.
    expect(ficha.cuerpo).toEqual(heroeDeArena(MAGO, EQUIPO_DEL_JUEGO).cuerpo);
    expect(ficha.cuerpo.attack).toBeGreaterThanOrEqual(MAGO.ataque);
    expect(ficha.hechizos.find((h) => h.id === 'magic_arrow')?.rinde).toBe(100 + 100 * 3);
    expect(ficha.hechizos.find((h) => h.id === 'bless')?.efecto).toMatchObject({
      kind: 'luck',
      roundsLeft: 3,
    });
    const llenos = Array.from({ length: LIDERAZGO.maxPorBando }, () =>
      delBorrador(unidad('zombi')),
    );
    expect(() =>
      batallaDeArena(
        {
          izquierda: { unidades: llenos, heroe: MAGO },
          derecha: { unidades: [deLaHoja('imperio-piquero')], heroe: null },
          equipo: EQUIPO_DEL_JUEGO,
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
      ...MONTAJE,
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
        equipo: EQUIPO_DEL_JUEGO,
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
          equipo: EQUIPO_DEL_JUEGO,
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
        equipo: EQUIPO_DEL_JUEGO,
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
    expect(p).toMatchObject({ kind: 'disparo', objetivo: 'defender-0' });
  });
});

describe('el montaje del banco de combate', () => {
  it('la figura genérica del héroe es la del juego', () => {
    expect(FIGURA_GENERICA).toBe(HERO_BODY);
  });

  it('sin interruptores: un ?reglas=, ?golpe= o ?contacto= se rechaza diciéndolo (19-10-2026)', () => {
    const url = new URLSearchParams('seed=5&reglas=tirador&golpe=rueda&contacto=paga&montaje=x');
    const motivo = (p: string) =>
      `la arena pelea con las reglas del juego: quita «?${p}=» de la dirección`;
    expect(retiradosDeLaURL(url.keys())).toEqual([
      { nombre: 'reglas', motivo: motivo('reglas') },
      { nombre: 'golpe', motivo: motivo('golpe') },
      { nombre: 'contacto', motivo: motivo('contacto') },
    ]);
    expect(retiradosDeLaURL(new URLSearchParams('seed=5&montaje=x').keys())).toEqual([]);
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

  it('la ficha del héroe enseña los valores con los que pelea', () => {
    const hojas = [{ id: 'heroe-elfo-druida', nombre: 'Druida' }];
    const m = marcadoDe(
      renderFichaDeHeroe('izquierda', MAGO, enElMontaje(EQUIPO_DEL_JUEGO), hojas),
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
    // H5 del banco: con Poder 1 decía «1 rondas».
    const poder1 = marcadoDe(
      renderFichaDeHeroe(
        'izquierda',
        heroePorDefecto('izquierda'),
        enElMontaje(EQUIPO_DEL_JUEGO),
        hojas,
      ),
    );
    expect(poder1).toContain('<span>1 ronda</span>');
    expect(poder1).toContain('Bendición (3)</span><span>suerte +1, 1 ronda<');
    expect(poder1).not.toContain('1 rondas');
  });

  it('el panel de la pelea lleva el maná y el libro de la persona, sin reglas que elegir', () => {
    const s = new SesionDeArena(
      {
        izquierda: { ...yo(unidad('templario-escudo')), heroe: MAGO },
        derecha: ia(unidad('zombi')),
        equipo: EQUIPO_DEL_JUEGO,
      },
      1,
    );
    s.empezar();
    while (s.turnoPropio === null && s.battle.finished === null)
      s.playBattleAction({ type: 'end_turn' });
    const m = marcadoDe(renderPanelDeBatalla(s, false));
    expect(m).toContain('Maná de Maga de pruebas</span><span>40 / 40');
    expect(m).not.toContain('fheroes2');
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
  const UNIDADES_DEL_ENLACE = [
    unidad('templario-escudo', { attack: 11 }),
    unidad('imperio-piquero', { attack: 8 }),
    unidad('zombi'),
    unidad('orko-dos-armas'),
  ];
  const MONTAJE: MontajeDelEnlace = {
    unidades: UNIDADES_DEL_ENLACE,
    // Todas las piezas que lleva lo montado, la tropa y los héroes.
    piezas: piezasDelMontaje(UNIDADES_DEL_ENLACE, true, EQUIPO_ESCRITO),
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
    expect(leido).toEqual(MONTAJE);
    expect(montajeALaURL(leido)).toBe(texto);
    // A través de URLSearchParams, que es por donde viaja.
    const url = new URLSearchParams({ montaje: texto }).toString();
    expect(montajeDeLaURL(new URLSearchParams(url).get('montaje') as string)).toEqual(MONTAJE);
    const b = batallaDeArena(montajeDeArenaDelEnlace(leido, EQUIPO_DEL_JUEGO), createRng(7));
    expect(b.muralla).toEqual(MONTAJE.muralla);
    // Las escaleras del montaje llegan al tablero, con las cifras del enlace.
    const conEscalera = b.stacks.filter((st) => st.side === 'attacker' && st.escalera);
    expect(conEscalera.map((st) => st.slot)).toEqual([0, 1]);
    expect(cuerpoDelStack(b, conEscalera[1] as BattleStack)?.attack).toBe(8);
  });

  it('un enlace de otra versión se rechaza diciendo que se vuelva a copiar, sin convertir nada', () => {
    // Sin compatibilidad hacia atrás (14-10-2026): de la 1 a la 8, ninguna se lee.
    for (let v = 1; v < VERSION_DEL_ENLACE; v++) {
      expect(() => montajeDeLaURL(tocado((o) => (o.v = v))), `versión ${v}`).toThrow(
        `este enlace es de una versión anterior de la arena (la ${v}; la de hoy es la ${VERSION_DEL_ENLACE}): vuelve a copiarlo`,
      );
    }
    // Aunque lleve lo de su versión: la 7, con una criatura del catálogo y sus pruebas.
    expect(() =>
      montajeDeLaURL(
        tocado((o) => {
          o.v = 7;
          o.pruebas = { pikeman: { attack: 8 } };
          o.izquierda.puestos.push({ criatura: 'templario-escudo', escalera: false });
        }),
      ),
    ).toThrow('vuelve a copiarlo');
  });

  it('una muralla dibujada en la rejilla de antes (11 en todas las filas) se sigue leyendo', () => {
    // Tablero simétrico (11-10-2026): las filas pares ganan la columna 11 y
    // ninguna casilla de la rejilla de antes desaparece, así que una muralla de
    // entonces —aquí, su última columna entera con una puerta— vale tal cual, en
    // el enlace y como forma del borrador. No es una conversión: es la regla de hoy.
    const deAntes = {
      muros: Array.from({ length: 9 }, (_, row) => ({ col: 10, row })).filter((h) => h.row !== 4),
      puertas: [{ a: { col: 9, row: 4 }, b: { col: 10, row: 4 } }],
    };
    const leido = montajeDeLaURL(tocado((o) => (o.muralla = deAntes)));
    expect(leido.muralla).toEqual(deAntes);
    expect(validarFormaDeMuralla({ nombre: 'De antes', muralla: deAntes }).muralla).toEqual(
      deAntes,
    );
  });

  it('un enlace mal formado o con lo que no existe se rechaza diciendo qué', () => {
    const casos: [string, string][] = [
      ['{"v":1,', 'el montaje del enlace no se puede leer'],
      [tocado((o) => (o.v = 14)), 'es de la versión 14 y esta arena lee la 13'],
      // La versión es la de hoy: ni la de antes de quitar los interruptores (12), ni
      // 0, ni a medias, ni texto.
      [
        tocado((o) => (o.v = 12)),
        'este enlace es de una versión anterior de la arena (la 12; la de hoy es la 13): vuelve a copiarlo',
      ],
      [tocado((o) => (o.v = 0)), 'es de la versión 0 y esta arena lee la 13'],
      [tocado((o) => (o.v = 4.5)), 'es de la versión 4.5 y esta arena lee la 13'],
      [tocado((o) => (o.v = '9')), 'es de la versión "9" y esta arena lee la 13'],
      [tocado((o) => delete o.v), 'es de la versión null y esta arena lee la 13'],
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
      // Solo la arena: ni criaturas del catálogo ni sus pruebas.
      [
        tocado((o) => (o.izquierda.puestos[1] = { criatura: 'templario-escudo', escalera: false })),
        'el bando izquierdo del enlace, puesto 2: «criatura» no es un campo del enlace',
      ],
      [tocado((o) => (o.pruebas = {})), '«pruebas» no es un campo del enlace'],
      [
        tocado((o) => (o.unidades[0].cuerpo = { criatura: 'templario-escudo' })),
        'el cuerpo tiene que ser { hoja }, y trae criatura',
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
    const repetido = new URLSearchParams('seed=5&montaje=a&montaje=b');
    expect(() => unaVezEnLaURL(repetido.getAll('montaje'), 'montaje')).toThrow(
      '«montaje» va 2 veces en la URL («a», «b»): pon uno solo',
    );
    expect(unaVezEnLaURL(repetido.getAll('seed'), 'seed')).toBe('5');
    expect(unaVezEnLaURL(repetido.getAll('reglas'), 'reglas')).toBeNull();
  });
});

// ------------------------------------------------------------------ poderes y edición en combate

describe('los poderes del monje en la arena (A3)', () => {
  it('el monje templario sale con Curar y Bendecir; otro bastón, con ninguno', () => {
    expect(unidad('templario-monje').habilidades).toEqual(['Curar (X)', 'Bendecir']);
    const otroBaston = CATALOGO.find(
      (u) => hojaPorId(u.cuerpo.hoja).perfil === 'baston' && u.id !== 'templario-monje',
    );
    if (otroBaston === undefined) throw new Error('no hay otra unidad de bastón');
    expect(otroBaston.habilidades).toEqual([]);
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
      validarUnidadDeArena(unidad('zombi', { habilidades: ['Bendecir'] }), EQUIPO_DEL_JUEGO)
        .habilidades,
    ).toEqual(['Bendecir']);
    expect(() =>
      validarUnidadDeArena(unidad('zombi', { habilidades: ['Bendecirr'] }), EQUIPO_DEL_JUEGO),
    ).toThrow('la habilidad "Bendecirr" no existe');
  });

  it('la ficha separa los poderes, que actúan, de las habilidades sin efecto', () => {
    const u = unidad('templario-monje', {
      habilidades: ['Curar (X)', 'Bendecir', 'Salto'],
    });
    const m = marcadoDe(renderFicha(u, false, enElMontaje(EQUIPO_DEL_JUEGO)));
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
        piezas: EQUIPO_DEL_JUEGO,
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
          equipo: EQUIPO_DEL_JUEGO,
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
  // del equipo, en su propio test). Sin arma no se monta nadie (vuelta 2): llevan
  // las manos de prueba, que no suman nada.
  const unidad = (id: string, cambios: Partial<UnidadDeArena> = {}): UnidadDeArena =>
    unidadDeArena(id, { equipo: { arma: MANOS_DE_PRUEBA.id }, ...cambios });
  /** Monje y arquero a la izquierda, con héroe; monje a la derecha. */
  function conMonjes(): BattleState {
    return batallaDeArena(
      {
        izquierda: {
          unidades: [delBorrador(unidad('templario-monje')), delBorrador(unidad('goblin-arquero'))],
          heroe: MAGO,
        },
        derecha: { unidades: [delBorrador(unidad('templario-monje'))], heroe: null },
        equipo: CON_MANOS,
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
      retocarEnBatalla(
        b,
        {
          kind: 'tipo',
          fuente: delBorrador(unidad('templario-monje', { attack: 19 })),
        },
        CON_MANOS,
      ),
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
    retocarEnBatalla(
      b,
      { kind: 'tipo', fuente: delBorrador(unidad('templario-monje')) },
      CON_MANOS,
    );
    expect(monjes(b)[0]?.unit).toEqual(monjes(conMonjes())[0]?.unit);
  });

  it('quitarle el escudo a media pelea sube su velocidad y el parte dice «escudo: − Escudo»', () => {
    const conEscudo = unidadDeArena('templario-escudo');
    const b = batallaDeArena(
      {
        izquierda: { unidades: [delBorrador(conEscudo)], heroe: null },
        derecha: { unidades: [delBorrador(unidadDeArena('zombi'))], heroe: null },
        equipo: CON_MANOS,
      },
      createRng(1),
    );
    const suyo = () => b.stacks.find((x) => x.side === 'attacker') as BattleStack;
    expect(SPEED_TO_HEXES[suyo().unit.speed]).toBe(3);
    const sinEscudo = quitarEnArena(conEscudo, 'escudo');
    expect(
      retocarEnBatalla(b, { kind: 'tipo', fuente: delBorrador(sinEscudo) }, CON_MANOS),
    ).toBeNull();
    expect(SPEED_TO_HEXES[suyo().unit.speed]).toBe(4);
    expect(suyo().unit.defense).toBe(conEscudo.defense);
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
        equipo: CON_MANOS,
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
    retocarEnBatalla(
      b,
      {
        kind: 'tipo',
        fuente: delBorrador(unidad('esqueleto-guerrero', { attack: 9 })),
      },
      CON_MANOS,
    );
    expect(b.stacks.map((x) => x.unit.attack)).toEqual([
      unidad('zombi').attack,
      9,
      b.stacks[2]?.unit.attack,
      unidad('zombi').attack,
    ]);
    // Una pelea que no es de la arena no sabe de tipos: se dice.
    const delJuego = createBattle(
      { army: [{ creature: 'zombi', count: 1 }], hero: null },
      { army: [{ creature: 'zombi', count: 1 }], hero: null },
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
    retocarEnBatalla(
      b,
      {
        kind: 'tipo',
        fuente: delBorrador(unidad('templario-monje', { hp: hp + 10 })),
      },
      CON_MANOS,
    );
    expect(elMonje().topHp).toBe(hp + 10 - 3);
    // Bajar la vida por debajo de la herida no mata: queda en 1.
    retocarEnBatalla(
      b,
      {
        kind: 'tipo',
        fuente: delBorrador(unidad('templario-monje', { hp: 2 })),
      },
      CON_MANOS,
    );
    expect(elMonje().topHp).toBe(1);
    const mando = b.heroes.attacker;
    if (mando === null) throw new Error('sin héroe');
    mando.mana -= 7;
    mando.castThisRound = true;
    retocarEnBatalla(
      b,
      { kind: 'heroe', lado: 'izquierda', datos: { ...MAGO, conocimiento: 6 } },
      CON_MANOS,
    );
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
        equipo: CON_MANOS,
      },
      createRng(4),
    );
    const de = (body: string) => b.stacks.find((x) => x.body === body) as BattleStack;
    const escudero = (hp: number) =>
      retocarEnBatalla(
        b,
        {
          kind: 'tipo',
          fuente: delBorrador(unidad('templario-escudo', { hp })),
        },
        CON_MANOS,
      );
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
    retocarEnBatalla(
      b,
      { kind: 'heroe', lado: 'izquierda', datos: { ...MAGO, conocimiento: 0 } },
      CON_MANOS,
    );
    expect(mando().mana).toBe(0);
    retocarEnBatalla(b, { kind: 'heroe', lado: 'izquierda', datos: MAGO }, CON_MANOS);
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
      retocarEnBatalla(
        b,
        { kind: 'tipo', fuente: delBorrador({ ...monje, ...cambios }) },
        CON_MANOS,
      );
    retoca({ leadership: 9 });
    retoca({ leadership: 9, habilidades: [...monje.habilidades, inerte] });
    expect(b.log.slice(desde).map((e) => (e.kind === 'retoque' ? e.cambios : e.kind))).toEqual([
      [`liderazgo ${monje.leadership} → 9`],
      [`habilidades: + ${inerte}`],
    ]);
    // El mismo valor (ataque 3 → 3): ni línea ni stacks nuevos.
    const antes = [...b.stacks];
    const largo = b.log.length;
    expect(retoca({ leadership: 9, habilidades: [...monje.habilidades, inerte] })).toBeNull();
    expect(b.log.length).toBe(largo);
    expect(b.stacks).toEqual(antes);
    expect(b.stacks.every((s, i) => s === antes[i])).toBe(true);
    // La sesión no dice «Cambiado» de lo que no cambia.
    const s = new SesionDeArena(
      {
        izquierda: { ...yo(unidad('templario-monje')), heroe: MAGO },
        derecha: ia(unidad('zombi')),
        equipo: CON_MANOS,
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
    retocarEnBatalla(
      b,
      { kind: 'heroe', lado: 'izquierda', datos: { ...MAGO, ataque: 9 } },
      CON_MANOS,
    );
    retocarEnBatalla(
      b,
      {
        kind: 'heroe',
        lado: 'izquierda',
        datos: { ...MAGO, ataque: 9, hechizos: MAGO.hechizos.filter((h) => h !== 'haste') },
      },
      CON_MANOS,
    );
    retocarEnBatalla(
      b,
      {
        kind: 'heroe',
        lado: 'izquierda',
        datos: { ...MAGO, ataque: 9, hechizos: ['magic_arrow', 'haste'] },
      },
      CON_MANOS,
    );
    expect(b.log.slice(desde).map((e) => (e.kind === 'retoque' ? e.cambios : e.kind))).toEqual([
      [`ataque ${MAGO.ataque} → 9`],
      ['hechizos: − Prisa'],
      ['hechizos: + Prisa, − Lentitud, − Bendición, − Maldición, − Curación, − Rayo'],
    ]);
  });

  it('el héroe retocado lanza con su poder nuevo (B13)', () => {
    const b = conMonjes();
    retocarEnBatalla(
      b,
      { kind: 'heroe', lado: 'izquierda', datos: { ...MAGO, poder: 9 } },
      CON_MANOS,
    );
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
      retocarEnBatalla(
        b,
        {
          kind: 'heroe',
          lado: 'izquierda',
          datos: { ...MAGO, figura: 'heroe-lich' },
        },
        CON_MANOS,
      ),
    ).toContain('la figura del héroe no se cambia a media pelea');
    expect(
      retocarEnBatalla(
        b,
        {
          kind: 'tipo',
          fuente: delBorrador(unidad('templario-monje', { damage: [5, 2] })),
        },
        CON_MANOS,
      ),
    ).toContain('el daño mínimo (5) no puede pasar del máximo (2)');
    expect(retocarEnBatalla(b, { kind: 'heroe', lado: 'derecha', datos: MAGO }, CON_MANOS)).toBe(
      'el bando derecho no lleva héroe en esta pelea',
    );
    expect(
      retocarEnBatalla(
        b,
        { kind: 'tipo', fuente: delBorrador(unidad('zombi', { attack: 3 })) },
        CON_MANOS,
      ),
    ).toBe('Zombie no está en esta pelea');
    expect(JSON.stringify(b)).toBe(antes);
    b.finished = { winner: 'attacker' };
    expect(
      retocarEnBatalla(
        b,
        { kind: 'tipo', fuente: delBorrador(unidad('templario-monje')) },
        CON_MANOS,
      ),
    ).toBe('la batalla ya ha terminado; el cambio vale para la pelea siguiente');
  });

  it('lo apuntado es uno solo, y retocar suelta lo que con las cifras nuevas ya no vale', () => {
    const s = new SesionDeArena(
      {
        izquierda: { ...yo(unidad('templario-monje'), unidad('templario-escudo')), heroe: MAGO },
        derecha: ia(unidad('orko-dos-armas')),
        equipo: CON_MANOS,
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
        equipo: CON_MANOS,
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
    // Sin arma no se pelea (vuelta 2): quitársela no entra.
    expect(
      s.retocar({ kind: 'tipo', fuente: delBorrador(unidad('templario-escudo', { equipo: {} })) }),
    ).toBe(
      'La unidad «Guerrero con escudo»: no lleva arma de cuerpo a cuerpo: nadie pelea sin ella; ponle una en Arma.',
    );
    expect(s.version).toBe(version);
    expect(
      s.retocar({
        kind: 'tipo',
        fuente: delBorrador(
          unidad('templario-escudo', { equipo: { arma: MANOS_DE_PRUEBA.id, distancia: 'arco' } }),
        ),
      }),
    ).toBeNull();
    expect(s.battleLegalActions().some((a) => a.type === 'shoot')).toBe(true);
    expect(s.version).not.toBe(version);
    expect(s.battle.turno?.n).toBe(turno);
    expect(s.hechizos.selectedSpell).toBe('magic_arrow');
    expect(s.status).toBe('Cambiado: vale ya en esta pelea.');
  });
});

describe('cuerpo y equipo: el perfil de arma es equipo, y el nivel lo mide puesto (18-10-2026)', () => {
  it('el cuerpo común, desnudo, es del nivel 1 (el jinete, que carga, hasta el 2), y cada unidad del catálogo vale más vestida que desnuda', () => {
    for (const h of HOJAS) {
      const desnuda = { ...unidadNueva(h, ocupados(), EQUIPO_DEL_JUEGO), equipo: {} };
      expect(nivelDeLaHoja(desnuda), h.id).toMatch(
        desnuda.traits.includes('charge') ? /· nivel [12]$/ : /· nivel 1$/,
      );
    }
    for (const u of CATALOGO) {
      expect(indiceDePoder(unidadDeCombate(u, EQUIPO_DEL_JUEGO)), u.id).toBeGreaterThan(
        indiceDePoder(unidadDeCombate({ ...u, equipo: {} }, EQUIPO_DEL_JUEGO)),
      );
    }
  });

  it('el mismo cuerpo vale según lo que lleva: con mandoble y arnés, más que con la Espada, y esta más que la daga', () => {
    const a = unidadNueva(hojaPorId('templario-escudo'), ocupados(), EQUIPO_DEL_JUEGO);
    const conDaga = equiparEnArena(a, 'daga', EQUIPO_DEL_JUEGO);
    const conMandoble = equiparEnArena(
      equiparEnArena(a, 'mandoble', EQUIPO_DEL_JUEGO),
      'arnes_de_placas',
      EQUIPO_DEL_JUEGO,
    );
    const indice = (u: UnidadDeArena) => indiceDePoder(unidadDeCombate(u, EQUIPO_DEL_JUEGO));
    expect(indice(conMandoble)).toBeGreaterThan(indice(a));
    expect(indice(a)).toBeGreaterThan(indice(conDaga));
    expect(nivelDeLaHoja(conMandoble)).toBe('Índice 349 · nivel 3');
    expect(nivelDeLaHoja(conDaga)).toBe('Índice 211 · nivel 2');
  });

  it('el escudo resta velocidad y un arma a dos manos no lo admite, en las dos direcciones', () => {
    const u = unidadNueva(hojaPorId('templario-escudo'), ocupados(), EQUIPO_DEL_JUEGO);
    const conEscudo = equiparEnArena(u, 'escudo', EQUIPO_DEL_JUEGO);
    expect(SPEED_TO_HEXES[unidadDeCombate(conEscudo, EQUIPO_DEL_JUEGO).speed]).toBe(
      SPEED_TO_HEXES[unidadDeCombate(u, EQUIPO_DEL_JUEGO).speed] - 1,
    );
    expect(() => equiparEnArena(conEscudo, 'mandoble', EQUIPO_DEL_JUEGO)).toThrow(
      'Mandoble es un arma a dos manos y no se puede llevar con Escudo: quita antes el escudo',
    );
    expect(() =>
      equiparEnArena(equiparEnArena(u, 'baston', EQUIPO_DEL_JUEGO), 'paves', EQUIPO_DEL_JUEGO),
    ).toThrow(
      'Pavés no se puede llevar con Bastón: es un arma a dos manos y no deja mano para el escudo',
    );
    // El arco a la espalda sí deja llevar escudo (13-10-2026): las manos son las
    // del arma de cuerpo a cuerpo.
    const arqueroConPaves = equiparEnArena(
      equiparEnArena(u, 'arco', EQUIPO_DEL_JUEGO),
      'paves',
      EQUIPO_DEL_JUEGO,
    );
    expect(arqueroConPaves.equipo).toMatchObject({ distancia: 'arco', escudo: 'paves' });
    // El borrador tampoco lo admite escrito a mano.
    expect(() =>
      validarUnidadDeArena(
        { ...u, equipo: { arma: 'mandoble', escudo: 'escudo' } },
        EQUIPO_DEL_JUEGO,
      ),
    ).toThrow('Mandoble es un arma a dos manos y no se puede llevar con Escudo');
    expect(() =>
      validarUnidadDeArena({ ...u, equipo: { arma: 'escudo' } }, EQUIPO_DEL_JUEGO),
    ).toThrow('Escudo va en Escudo, no en Arma');
    expect(() =>
      validarUnidadDeArena({ ...u, equipo: { casco: 'escudo' } }, EQUIPO_DEL_JUEGO),
    ).toThrow('no hay ningún hueco "casco"');
    // Quitar lo que no lleva se dice.
    expect(() => quitarEnArena(u, 'escudo')).toThrow('no lleva nada en Escudo');
  });

  it('sin arma de cuerpo a cuerpo de la arena no se monta, y lo dice (vuelta 2)', () => {
    const u = unidad('templario-escudo');
    // Sin nada en «arma», ni con un arco en «distancia».
    expect(() => validarUnidadDeArena({ ...u, equipo: {} }, EQUIPO_DEL_JUEGO)).toThrow(
      'la unidad «Guerrero con escudo»: no lleva arma de cuerpo a cuerpo: nadie pelea sin ella; ponle una en Arma',
    );
    expect(() =>
      validarUnidadDeArena({ ...u, equipo: { distancia: 'arco' } }, EQUIPO_DEL_JUEGO),
    ).toThrow('no lleva arma de cuerpo a cuerpo');

    // Toda unidad del catálogo lleva la suya (el catálogo entero vale: `catalogo.test.ts`).
    for (const u of CATALOGO) expect(u.equipo.arma, u.id).toBeDefined();
    // Y quitársela en el montaje no entra: lo dice el mismo validador.
    expect(() => validarUnidadDeArena(quitarEnArena(u, 'arma'), EQUIPO_DEL_JUEGO)).toThrow(
      'no lleva arma de cuerpo a cuerpo',
    );
  });

  it('el héroe de la arena pelea con su equipo base, la Espada y el gambesón, que viaja en el enlace', () => {
    const h = heroeDeArena(MAGO, EQUIPO_DEL_JUEGO);
    expect(h.cuerpo.equipo?.arma).toBe(ESPADA);
    expect(h.cuerpo.armas?.arma).toMatchObject({
      arma: { id: ESPADA },
      rueda: nivelesDeLaEspada(),
    });
    expect(idsLlevados([], true)).toContain(ESPADA);
    expect(idsLlevados([], false)).not.toContain(ESPADA);
    expect(h.cuerpo.equipo).toEqual(EQUIPO_BASE);
    expect(idsLlevados([], true)).toEqual(new Set(['espada', 'gambeson']));
    // Su equipo pasa la misma regla que el de la tropa: lleva un arma.
    expect(armaDeCuerpoBlocker(EQUIPO_BASE)).toBeNull();
  });

  it('«Nueva unidad»: cifras mínimas, con la Espada y nada más, id propio y pelea con el arte de su cuerpo', () => {
    const h = hojaPorId('templario-escudo');
    const a = unidadNueva(h, ocupados(h.id), EQUIPO_DEL_JUEGO);
    expect(a.id).toBe('templario-escudo-2');
    expect(a.name).toBe('Guerrero con escudo 2');
    expect(a.cuerpo).toEqual({ hoja: 'templario-escudo' });
    // Sin arma no se combate (vuelta 2): nace con la Espada de la arena.
    expect(a.equipo).toEqual({ arma: ESPADA });
    // Con la Espada, del nivel 2: desnuda sería del 1.
    expect(nivelDeLaHoja(a)).toBe('Índice 259 · nivel 2');
    expect(validarUnidadDeArena(a, EQUIPO_DEL_JUEGO)).toEqual(a);
    const b = unidadNueva(h, ocupados(h.id, a.id), EQUIPO_DEL_JUEGO);
    expect(b.id).toBe('templario-escudo-3');
    // De una hoja de no muertos, con `undead`, como su hoja.
    expect(
      unidadNueva(hojaPorId('esqueleto-guerrero'), ocupados(), EQUIPO_DEL_JUEGO).traits,
    ).toEqual(['undead']);
    // Las dos del mismo cuerpo pelean, cada una con sus cifras, y se pintan con su hoja.
    const fuerte = { ...equiparEnArena(a, 'mandoble', EQUIPO_DEL_JUEGO), attack: 9 };
    const batalla = pelea([fuerte, b], [unidad('zombi')], createRng(3));
    const izq = batalla.stacks.filter((x) => x.side === 'attacker');
    expect(izq.map((x) => x.body)).toEqual(['templario-escudo', 'templario-escudo']);
    // 9 + 5 del mandoble; 3 + 2 de la Espada.
    expect(izq.map((x) => x.unit.attack)).toEqual([14, 5]);
    expect(izq.map((x) => tipoDelStack(batalla, x))).toEqual([
      { kind: 'unidad', id: 'templario-escudo-2' },
      { kind: 'unidad', id: 'templario-escudo-3' },
    ]);
  });

  it('H1: una nueva no toma el id de una del borrador que no vale, y al guardar siguen las dos', () => {
    const dir = carpetaDeLaArena();
    try {
      const h = hojaPorId('templario-mandoble');
      // La reproducción de QA: una unidad de hoy que no vale con id templario-mandoble-2.
      const tramposo = {
        ...unidadNueva(h, ocupados(h.id), EQUIPO_DEL_JUEGO),
        name: 'Tramposo',
        equipo: { arma: 'mandoble', escudo: 'escudo' },
      };
      expect(tramposo.id).toBe('templario-mandoble-2');
      // Escrita a mano, como haría quien toca el JSON: `escribirCatalogo` no la dejaría pasar.
      mkdirSync(join(dir, 'data/borradores'), { recursive: true });
      writeFileSync(
        join(dir, RUTA_DEL_CATALOGO_DE_UNIDADES),
        JSON.stringify({ unidades: [tramposo] }),
      );
      const leido = leerCatalogo(dir);
      expect(leido.invalidas.map((i) => i.id)).toEqual(['templario-mandoble-2']);
      const nueva = unidadNueva(
        h,
        {
          validas: leido.unidades.map((u) => u.id),
          sinValidar: leido.invalidas.flatMap((i) => (i.id === null ? [] : [i.id])),
          hojas: [h.id],
        },
        EQUIPO_DEL_JUEGO,
      );
      expect(nueva.id).toBe('templario-mandoble-3');
      const todas = catalogoEntero(nueva);
      expect(escribirCatalogo(dir, { unidades: todas, piezas: EQUIPO_ESCRITO })).toMatchObject({
        unidades: todas.length,
        conservadas: 1,
      });
      const json = JSON.parse(readFileSync(join(dir, RUTA_DEL_CATALOGO_DE_UNIDADES), 'utf8')) as {
        unidades: { id: string; name: string }[];
      };
      expect(json.unidades.slice(-2).map((u) => [u.id, u.name])).toEqual([
        ['templario-mandoble-3', 'Guerrero con arma a dos manos 3'],
        ['templario-mandoble-2', 'Tramposo'],
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('R1/R2: una nueva nace donde cae su índice, y un rasgo de tiro pesa solo con algo con que tirar', () => {
    const nueva = unidadNueva(hojaPorId('templario-escudo'), ocupados(), EQUIPO_DEL_JUEGO);
    // El doble ataque dobla su golpe de cuerpo a cuerpo: del 2 al 3.
    expect(nivelDeLaHoja({ ...nueva, traits: ['double_attack'] })).toBe('Índice 310 · nivel 3');
    // El disparo doble solo pesa si tira, y en la arena tira quien lleva arma a
    // distancia: sin el arco mide lo mismo con el rasgo que sin él (R2 de QA, 12-10-2026).
    const conElRasgo = { ...nueva, traits: ['double_shot' as const] };
    expect(nivelDeLaHoja(conElRasgo)).toBe(nivelDeLaHoja(nueva));
    // Con el arco puesto el disparo es su mejor golpe, y con el rasgo, el doble.
    const conArco = equiparEnArena(nueva, 'arco', EQUIPO_DEL_JUEGO);
    expect(nivelDeLaHoja(conArco)).toBe('Índice 260 · nivel 2');
    expect(nivelDeLaHoja(equiparEnArena(conElRasgo, 'arco', EQUIPO_DEL_JUEGO))).toBe(
      'Índice 313 · nivel 3',
    );
  });

  it('C3: toda unidad de la arena ocupa una casilla y no lleva munición', () => {
    for (const u of CATALOGO) {
      const c = unidadDeCombate(u, EQUIPO_DEL_JUEGO);
      expect(c, u.id).not.toHaveProperty('shots');
      expect(c, u.id).not.toHaveProperty('hexes');
    }
    const batalla = pelea([unidad('troll-maza')], [unidad('zombi')], createRng(3));
    for (const s of batalla.stacks) expect(stackHexes(s), s.id).toHaveLength(1);
    // Y el catálogo del juego es el de la arena (19-10-2026): ninguna de dos casillas.
    for (const u of unidadesDelJuego()) expect(u.hexes, u.id).toBeUndefined();
  });
});

describe('cada arma para lo suyo (13-10-2026): los kits, y lo de antes convertido', () => {
  /** Las cifras de cada golpe: arriba (cuerpo a cuerpo) y las de cada arma. */
  const golpes = (u: UnidadDeArena) => {
    const c = unidadDeCombate(u, EQUIPO_DEL_JUEGO);
    return { c, porArma: armasDe(c) };
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
      // El arco suma +2 y +10–20; la daga, +1 y +0–10, a las cifras de su cuerpo.
      const [min, max] = u.damage;
      expect(delUso(u, 'distancia'), id).toEqual(['Arco', u.attack + 2, [min + 10, max + 20]]);
      expect(delUso(u, 'arma'), id).toEqual(['Daga', u.attack + 1, [min, max + 10]]);
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
      expect(delUso(u, 'lanza'), id).toEqual(['Lanza de jinete', 10, [50, 90]]);
      expect(delUso(u, 'arma'), id).toEqual(['Espada', 5, [20, 40]]);
      expect(
        golpes(u).porArma.map((a) => a.uso),
        id,
      ).toEqual(['arma', 'lanza']);
    }
    // Un solo perfil, coherente: lanza, espada y arco (`perfilDeArena`).
    expect(hojaPorId('elfo-jinete').perfil).toBe('montado-arco');
    const elfico = unidad('elfo-jinete');
    expect(elfico.equipo).toEqual({
      arma: 'espada',
      distancia: 'arco',
      lanza: 'lanza_de_jinete',
      armadura: 'barda',
    });
    expect(golpes(elfico).porArma.map((a) => [a.uso, a.arma])).toEqual([
      ['arma', 'Espada'],
      ['distancia', 'Arco'],
      ['lanza', 'Lanza de jinete'],
    ]);
    expect(isShooter(golpes(elfico).c)).toBe(true);
    // Los demás perfiles no tienen armas por uso: pelean como ayer. Llevan
    // `armas` solo para que su golpe lleve los niveles de la rueda de su arma
    // (18-10-2026; desde la vuelta 2 toda arma de la arena los dice, la Espada
    // también).
    for (const id of ['templario-escudo', 'templario-mandoble', 'templario-monje']) {
      const { c } = golpes(unidad(id));
      expect(Object.keys(c.armas ?? {}), id).toEqual(['arma']);
      expect(c.armas?.arma.rueda, id).toBeDefined();
      expect([c.armas?.arma.attack, c.armas?.arma.damage], id).toEqual([c.attack, c.damage]);
    }
  });

  it('el arco a la espalda deja llevar escudo, y la ficha lo monta', () => {
    const u = equiparEnArena(unidad('elfo-arquero'), 'paves', EQUIPO_DEL_JUEGO);
    expect(validarUnidadDeArena(u, EQUIPO_DEL_JUEGO).equipo).toMatchObject({
      distancia: 'arco',
      escudo: 'paves',
    });
  });

  it('lo de antes de cada arma en su hueco no vale: ni la unidad con el arco en «arma» ni la pieza', () => {
    // Sin compatibilidad hacia atrás (14-10-2026): no se pasa a su hueco, se dice.
    const viejo = {
      ...unidad('elfo-arquero'),
      equipo: { arma: 'arco', armadura: 'jubon_de_arquero' },
    };
    expect(() => validarUnidadDeArena(viejo, EQUIPO_DEL_JUEGO)).toThrow(
      'Arco va en Arma a distancia, no en Arma',
    );
    const r = revisarCatalogo({ unidades: [viejo] }, EQUIPO_DEL_JUEGO);
    expect(r.validas).toEqual([]);
    expect(r.invalidas.map((i) => i.crudo)).toEqual([viejo]);
    // Las piezas: el arco del juego en `arma` y una nueva con disparos.
    const arcoCambiado = {
      ...EQUIPO_DEL_JUEGO.pieza('arco'),
      hueco: 'arma',
      manos: 2,
      ataque: 4,
      // Con su rueda, que en «arma» la pide: así lo que se dice es el hueco.
      rueda: nivelesDeLaEspada(),
    };
    const honda = {
      ...piezaNueva('distancia', EQUIPO_DEL_JUEGO),
      nombre: 'Honda',
      disparos: 20,
    };
    // El arco pasado a «arma» con manos vale pieza a pieza (es otra arma), pero el
    // elfo que lo lleva en «distancia» deja de valer: lo dice el cambio.
    expect(
      motivoDelCambio(EQUIPO_DEL_JUEGO, elCatalogoCon(arcoCambiado as Pieza), [
        unidad('elfo-arquero'),
      ]),
    ).toMatch(/la lleva «.*»: Arco va en Arma, no en Arma a distancia/);
    expect(() => validarPieza(honda)).toThrow('«disparos» no es un campo de una pieza');
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
    // Ninguna unidad del catálogo dice «sin munición»: o tira, o no es tirador.
    for (const u of CATALOGO) {
      const t = tiroLibre(u);
      forzarTurno(t, 'attacker-0');
      expect(ataqueBlocker(t, 'defender-0') ?? '', u.id).not.toContain('munición');
    }
  });
});

describe('sin el catálogo del juego (13-10-2026)', () => {
  it('un cuerpo de criatura no vale: no se retira ni se convierte, se queda como cualquiera que no vale', () => {
    expect(() =>
      validarUnidadDeArena(
        { ...unidad('zombi'), cuerpo: { criatura: 'esqueleto-guerrero' } },
        EQUIPO_DEL_JUEGO,
      ),
    ).toThrow('la unidad «Zombie»: el cuerpo tiene que ser { hoja }, y trae criatura');
    const dragon = {
      ...unidad('zombi'),
      id: 'bone-dragon-2',
      name: 'Dragón óseo 2',
      cuerpo: { criatura: 'jinete-de-plaga' },
    };
    const r = revisarCatalogo({ unidades: [unidad('zombi'), dragon] }, EQUIPO_DEL_JUEGO);
    expect(r.validas.map((u) => u.id)).toEqual(['zombi']);
    expect(r.invalidas.map((i) => [i.id, i.crudo])).toEqual([['bone-dragon-2', dragon]]);
  });
});

describe('sin compatibilidad hacia atrás (14-10-2026)', () => {
  it('en disco: lo de antes sale como que no vale, con su motivo, y «Guardar» lo conserva sin convertirlo', () => {
    const dir = carpetaDeLaArena();
    try {
      mkdirSync(join(dir, 'data/borradores'), { recursive: true });
      // Uno de cada formato de antes: con `level`, con el arco en `arma`, sin
      // cuerpo (antes del equipo), con un cuerpo de criatura y con tiros.
      const { cuerpo: _c, equipo: _e, ...sinCuerpo } = unidad('templario-escudo');
      const deAntes = [
        { ...unidad('templario-monje'), level: 3 },
        { ...unidad('elfo-arquero'), equipo: { arma: 'arco', armadura: 'jubon_de_arquero' } },
        sinCuerpo,
        {
          ...unidad('zombi'),
          id: 'peasant-2',
          name: 'Campesino 2',
          cuerpo: { criatura: 'goblin-lancero' },
        },
        { ...unidad('esqueleto-arquero'), shots: 12 },
      ];
      writeFileSync(
        join(dir, RUTA_DEL_CATALOGO_DE_UNIDADES),
        JSON.stringify({ unidades: [unidad('troll-maza'), ...deAntes] }),
      );
      const leido = leerCatalogo(dir);
      expect(leido.unidades.map((u) => u.id)).toEqual(['troll-maza']);
      expect(leido.invalidas.map((i) => i.crudo)).toEqual(deAntes);
      expect(leido.invalidas.map((i) => i.motivo)).toEqual([
        expect.stringContaining('«level» no es un campo de la arena'),
        expect.stringContaining('Arco va en Arma a distancia, no en Arma'),
        expect.stringContaining(
          'la unidad «Guerrero con escudo»: el cuerpo tiene que ser { hoja }',
        ),
        expect.stringContaining('el cuerpo tiene que ser { hoja }, y trae criatura'),
        expect.stringContaining('«shots» no es un campo de la arena'),
      ]);
      // «Guardar» escribe lo que manda la página —el catálogo sin las de antes,
      // que una válida con su id las arreglaría— y conserva lo de antes tal cual.
      const deAntesIds = new Set(deAntes.map((u) => u.id));
      const manda = catalogoEntero().filter((u) => !deAntesIds.has(u.id));
      expect(escribirCatalogo(dir, { unidades: manda, piezas: EQUIPO_ESCRITO })).toMatchObject({
        unidades: manda.length,
        conservadas: deAntes.length,
      });
      const json = JSON.parse(readFileSync(join(dir, RUTA_DEL_CATALOGO_DE_UNIDADES), 'utf8')) as {
        unidades: unknown[];
      };
      expect(json.unidades).toEqual([...manda, ...deAntes]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('el comentario del catálogo lo dice: solo hojas, sin munición ni tamaño, y solo lo de hoy', () => {
    // El que se lee es el del fichero: «Guardar» lo conserva (simplify de F2) y la
    // constante es solo el de reserva, corto.
    const enDisco = (
      JSON.parse(readFileSync(resolve(RAIZ, RUTA_DEL_CATALOGO_DE_UNIDADES), 'utf8')) as {
        _comment: string;
      }
    )._comment;
    expect(enDisco).toContain('Solo se lee el formato de hoy');
    expect(enDisco).not.toContain('migrarUnidadDeArena');
    expect(enDisco).toContain('cuerpo: { hoja }');
    expect(enDisco).not.toContain('{ criatura }');
    expect(enDisco).toContain('sin munición');
    expect(enDisco).toContain('no hay shots ni hexes');
    expect(COMENTARIO_DEL_CATALOGO_DE_UNIDADES).toContain('cuerpo: { hoja }');
  });
});
