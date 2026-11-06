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
  enElMontaje,
  FIGURA_GENERICA,
  renderBando,
  renderCatalogo,
  renderFicha,
  renderFichaDeHeroe,
  renderPanelDeBatalla,
  resumenDeCifras,
  tarjetasDelCatalogo,
} from '../src/client/arena/paneles.js';
import { marcadoDe } from '../src/client/html.js';
import { arteDe, juegosDelYBot, registrarUnidad } from '../src/client/render/personajes.js';
import { type LadoDeSesion, SesionDeArena } from '../src/client/session.js';
import { nombreEnElCampo } from '../src/client/views/distintivo.js';
import { renderBattleLog } from '../src/client/views/panels.js';
import { completarCruce } from '../src/core/ai/rueda.js';
import { chooseBattleAction } from '../src/core/ai/tactics.js';
import {
  equiparEnArena,
  type FuenteDeArena,
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
  piezasDelMontaje,
  retiradosDeLaURL,
  retocarEnBatalla,
  tipoDelStack,
  unidadNueva,
  VERSION_DEL_ENLACE,
} from '../src/core/arena.js';
import { FORMAS_DE_EJEMPLO, validarFormaDeMuralla } from '../src/core/arena-murallas.js';
import { activeStack, applyAction, MAX_ROUNDS, stackHexes } from '../src/core/battle/battle.js';
import { SIN_MURALLA } from '../src/core/battle/muralla.js';
import type { BattleStack, BattleState } from '../src/core/battle/types.js';
import { HERO_BODY } from '../src/core/battle/types.js';
import { UNIDADES as CATALOGO, cuerpoDe } from '../src/core/catalogo.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { CATALOGO_DE_HABILIDADES, EQUIPO_ESCRITO, HEROE, LIDERAZGO } from '../src/core/data.js';
import { EQUIPO_BASE, EQUIPO_DEL_JUEGO } from '../src/core/hero/equipo.js';
import { hechizo, hechizosDelGremio } from '../src/core/magia/catalogo.js';
import { rinde } from '../src/core/magia/formato.js';
import { indiceDePoder } from '../src/core/nivel.js';
import { createRng, type Rng } from '../src/core/rng.js';
import { CREATURE_TRAITS } from '../src/core/types.js';
import {
  armaDeCuerpoBlocker,
  COMENTARIO_DEL_CATALOGO_DE_UNIDADES,
  ESPADA,
  HABILIDADES,
  type Hoja,
  KIT_DEL_PERFIL,
  nivelesDeLaEspada,
  RUTA_DEL_CATALOGO_DE_UNIDADES,
  revisarCatalogo,
  type Unidad,
  unidadDeCombate,
  validarCatalogo,
  validarHojas,
  validarUnidad,
} from '../src/core/unidad.js';
import { unaVezEnLaURL } from '../src/core/validar.js';
import { NOMBRES_DE_DIRECCION } from '../src/shared/arte.js';
import {
  escribirCatalogo,
  guardarCatalogo,
  hojasDelTaller,
  leerCatalogo,
  versionDelCatalogo,
} from '../tools/arena/borrador.js';
import { AGILIDAD_DEL_CUERPO } from '../tools/arena/velocidades.js';
import { arteEnOchoDirecciones } from '../tools/taller/arte-en-disco.js';
import {
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
  empezarTalCual,
  enElCampo,
  hojaDeLaArena,
  hojasDeLaArena,
  MANOS_DE_PRUEBA,
  MONTAJE,
  peleaDelMotor,
  unidadDeArena,
} from './helpers.js';
import { catalogoDe, montar } from './pelea-de-arena.js';

const RAIZ = resolve(import.meta.dirname, '..');
/** El catálogo del juego con las manos de prueba: el de las peleas de estas pruebas. */
const CON_MANOS = catalogoCon(MANOS_DE_PRUEBA);
const HOJAS = hojasDeLaArena();
const hojaPorId = hojaDeLaArena;
const unidad = unidadDeArena;

/** Un bando de la sesión con unidades del borrador y sin héroe, que mueve la IA. */
const ia = (...us: Unidad[]): LadoDeSesion => ({
  unidades: us.map((u) => delBorrador(u)),
  heroe: null,
  ia: true,
});

/**
 * Una pelea solo con unidades del borrador, sin héroes y con las reglas del juego;
 * con las manos de prueba entre sus piezas, para quien pelee sin las de su perfil.
 */
function pelea(izquierda: readonly Unidad[], derecha: readonly Unidad[], rng: Rng): BattleState {
  return montar(
    {
      combate: COMBATE_COMPLETO,
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
const tarjeta = (u: Unidad): DatosDePuesto => ({
  nombre: u.name,
  resumen: resumenDeCifras(u, EQUIPO_DEL_JUEGO),
  figura: u.id,
  noEscala: null,
});

/** Los ids ocupados de un borrador sin unidades que no validan ni hojas. */
function ocupados(...validas: string[]): IdsOcupados {
  return { validas, hojas: [] };
}

/**
 * Una unidad nueva de la hoja `h` con el equipo de su perfil (`KIT_DEL_PERFIL`):
 * como nació cada unidad del catálogo. Para las hojas que no tienen la suya en él
 * (los héroes), que los tests de velocidad comparan con las del catálogo.
 */
function conSuKit(h: Hoja): Unidad {
  const nueva = unidadNueva(h, ocupados(), EQUIPO_DEL_JUEGO);
  return validarUnidad({ ...nueva, equipo: KIT_DEL_PERFIL[h.perfil].equipo }, EQUIPO_DEL_JUEGO);
}

/** Lo que la ficha enseña del nivel de una unidad: el de su cuerpo, aunque pelee con su equipo. */
const nivelDeLaHoja = (u: Unidad): string => lecturaDelNivel(unidadDeCombate(u, EQUIPO_DEL_JUEGO));

/** Una sesión montada y empezada: lo que hace la página al pulsar «Luchar». */
function montada(izquierda: LadoDeSesion, derecha: LadoDeSesion, semilla: number): SesionDeArena {
  const s = sesion(izquierda, derecha, semilla);
  empezarTalCual(s);
  return s;
}
/** Un bando de la sesión que mueve la persona. */
const yo = (...us: Unidad[]): LadoDeSesion => ({ ...ia(...us), ia: false });

describe('la arena pelea con las cifras del borrador', () => {
  it('las cifras editadas llegan al stack tal cual, sin pasar por el catálogo', () => {
    // El ataque de 42 no es el de nadie: si algo leyera el catálogo del juego en
    // vez del de la pelea, no llegaría al stack.
    // Con las manos de prueba, que no suman nada: el bastón de su perfil le
    // sumaría daño (eso, en el test de abajo), y sin arma no se monta.
    // Fuerza 3 y agilidad 3, con las manos (fuerza 0): daño 3–9.
    const monje = unidad('templario-monje', {
      attack: 42,
      fuerza: 3,
      agilidad: 3,
      hp: 21,
      equipo: { arma: MANOS_DE_PRUEBA.id },
    });
    const b = pelea([monje], [unidad('zombi')], createRng(1));
    const s = b.stacks.find((x) => x.side === 'attacker');
    expect(s?.body).toBe('templario-monje');
    // Una unidad del catálogo de su pelea, como en el juego: la del montaje,
    // no la de `data/unidades.json`.
    expect(s?.origen).toMatchObject({ kind: 'catalogo', unidad: 'templario-monje' });
    expect(s?.unit).toMatchObject({ attack: 42, damage: [3, 9], hp: 21 });
    expect(s?.unit).not.toHaveProperty('nivel');
    // Sin munición ni tamaño: la arena no los escribe (13-10-2026).
    expect(s?.unit).not.toHaveProperty('shots');
    expect(s?.unit).not.toHaveProperty('hexes');
    expect(s?.topHp).toBe(21);
  });

  it('los rasgos del motor van con la unidad, y las habilidades no pelean', () => {
    const jinete = unidad('templario-hermano-de-carga', { habilidades: ['Salto'] });
    const b = pelea([jinete], [unidad('zombi', { traits: ['undead'] })], createRng(1));
    const [a, d] = [b.stacks[0], b.stacks[1]];
    // El rasgo de montar se fue (26-10-2026): monta su caballo de guerra.
    expect(a?.unit.traits).toEqual([]);
    expect(a?.unit.montura?.id).toBe('caballo_de_guerra');
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
        validarUnidad({ ...unidad('templario-monje'), growth: 3 }, EQUIPO_DEL_JUEGO);
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
    const enormes: Unidad[] = [
      { ...guerrero, hp: 1e15 },
      { ...guerrero, attack: 25, hp: 10_000_000, fuerza: 1_000_000 },
    ];
    for (const u of enormes) {
      expect(() => validarUnidad(u, EQUIPO_DEL_JUEGO)).toThrow(
        `la unidad «${guerrero.name}»: estas cifras son demasiado grandes para medir su nivel`,
      );
      expect(() => validarUnidad(u, EQUIPO_DEL_JUEGO)).toThrow('baja la vida o la fuerza');
      expect(() => pelea([u], [unidad('zombi')], createRng(5))).toThrow('demasiado grandes');
      expect(() => pelea([unidad('zombi')], [u], createRng(5))).toThrow('demasiado grandes');
    }
    // Lo grande pero medible sigue entrando y pelea.
    const grande = validarUnidad({ ...guerrero, hp: 10_000_000 }, EQUIPO_DEL_JUEGO);
    expect(nivelDeLaHoja(grande)).toMatch(/^Índice \d+ · nivel \d+$/);
  });
});

describe('el borrador se valida antes de escribirse', () => {
  const base = (): Unidad => unidad('templario-monje');

  it('sin munición: `shots` no es un campo de la arena, y el motivo no lo ofrece (13-10-2026)', () => {
    // Dispara quien lleva arma a distancia; lo de antes con tiros no vale.
    expect(() => validarUnidad({ ...base(), shots: 3 }, EQUIPO_DEL_JUEGO)).toThrow(
      '«shots» no es un campo de la arena',
    );
    expect(() => validarUnidad({ ...base(), shots: 3 }, EQUIPO_DEL_JUEGO)).not.toThrow(
      /valen .*\bshots\b/,
    );
    expect(() => validarUnidad({ ...base(), hexes: 2 }, EQUIPO_DEL_JUEGO)).not.toThrow(
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
      expect(readdirSync(join(dir, 'data')).sort()).toEqual([
        'equipo.json',
        'hechizos.json',
        'heroe.json',
        'unidades.json',
      ]);

      // Un guardado malo después de uno bueno deja el bueno donde estaba.
      expect(() =>
        escribirCatalogo(dir as string, {
          unidades: catalogoEntero({ ...monje, agilidad: 9 }),
          piezas: EQUIPO_ESCRITO,
        }),
      ).toThrow();
      expect(leerCatalogo(dir).unidades).toEqual(catalogoEntero(monje));
    });

    it('«Guardar» con la versión vieja no pisa lo que guardó otra pestaña (26-10-2026)', () => {
      dir = carpetaDeLaArena();
      const leida = versionDelCatalogo(dir);
      const monje = { ...base(), attack: 9 };
      // La otra pestaña guarda primero, con la misma versión: entra y da la nueva.
      const otra = guardarCatalogo(dir, {
        unidades: catalogoEntero(monje),
        piezas: EQUIPO_ESCRITO,
        version: leida,
      });
      expect(otra.version).toEqual(versionDelCatalogo(dir));
      // Esta, con la de antes: se rechaza sin escribir nada.
      expect(() =>
        guardarCatalogo(dir as string, {
          unidades: catalogoEntero({ ...monje, attack: 2 }),
          piezas: EQUIPO_ESCRITO,
          version: leida,
        }),
      ).toThrow(/data\/unidades\.json han? cambiado desde que abriste esta página/);
      expect(leerCatalogo(dir).unidades).toEqual(catalogoEntero(monje));
      // Sin versión, tampoco.
      expect(() =>
        guardarCatalogo(dir as string, { unidades: catalogoEntero(monje), piezas: EQUIPO_ESCRITO }),
      ).toThrow('falta la versión');
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
    const u = unidad('zombi', { traits: ['undead', 'flying'] });
    const m = marcadoDe(renderFicha(u, false, enElMontaje(EQUIPO_DEL_JUEGO)));
    expect(m).not.toContain('type="checkbox"');
    expect(m).toContain('data-arena="quitar-rasgo" data-rasgo="undead"');
    expect(m).toContain('data-arena="quitar-rasgo" data-rasgo="flying"');
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
    expect(cifras).toContain('data-campo="fuerza"');
    expect(cifras).toContain('data-campo="agilidad"');
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
    expect(s.battle.log.every((e) => e.kind === 'round_start')).toBe(true);
    const antes = s.version;
    empezarTalCual(s);
    expect(s.battle.finished).not.toBeNull();
    expect(s.version).not.toBe(antes);
    expect(() => s.empezar()).toThrow('esta batalla de la arena ya ha empezado');
  });

  it('H1: el animador que mira la salida cuenta luego todo lo que juega la IA', () => {
    const s = sesion(ia(unidad('templario-escudo')), ia(unidad('orko-dos-armas')), 5);
    const a = new BattleAnimator();
    a.observe(s.battle);
    a.tick(0);
    empezarTalCual(s);
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
    // Fuerza 1 y ataque 0 contra 100 000 PV: en 100 rondas nadie cae.
    const muro = { hp: 100_000, fuerza: 1, attack: 0 };
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

  it('M2 y M14: un campo vacío se dice vacío, y un campo que no es de la arena se rechaza', () => {
    expect(() => validarUnidad({ ...unidad('zombi'), hp: Number.NaN }, EQUIPO_DEL_JUEGO)).toThrow(
      'la vida no tiene valor, el campo está vacío',
    );
    expect(() => validarUnidad({ ...unidad('zombi'), growth: 3 }, EQUIPO_DEL_JUEGO)).toThrow(
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
    expect(validarHojas(JSON.parse(JSON.stringify([buena])))).toEqual([buena]);
    expect(() => validarHojas([{ ...buena, perfil: 'lanza-de-fuego' }])).toThrow(
      `la hoja "${buena.id}": el perfil "lanza-de-fuego" no existe`,
    );
    expect(() => validarHojas({})).toThrow('no es una lista');
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
    expect(() => validarHojas([{ ...buena, direcciones: buena.direcciones?.slice(1) }])).toThrow(
      `trae ${n - 1} direcciones, y son ${n} o ninguna`,
    );
  });
});

describe('la velocidad son casillas: las de la agilidad', () => {
  it('cada personaje del taller tiene la agilidad de su cuerpo, y ninguno sobra', () => {
    const personajes = [...UNIDADES, ...HEROES].map((u) => u.personaje ?? u.id);
    expect(Object.keys(AGILIDAD_DEL_CUERPO).sort()).toEqual([...new Set(personajes)].sort());
    for (const h of HOJAS) {
      expect(h.agilidad, h.id).toBe(AGILIDAD_DEL_CUERPO[h.personaje]?.[0]);
      expect(unidadNueva(h, ocupados(), EQUIPO_DEL_JUEGO).agilidad, h.id).toBe(h.agilidad);
    }
    // Un personaje, una agilidad: todas sus hojas comparten cuerpo (12-10-2026).
    const porPersonaje = new Map<string, Set<number>>();
    for (const h of HOJAS) {
      porPersonaje.set(h.personaje, (porPersonaje.get(h.personaje) ?? new Set()).add(h.agilidad));
    }
    for (const [p, cs] of porPersonaje) expect(cs.size, p).toBe(1);
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
    const hojas = hojasDelTaller(raiz);
    expect(hojas.map((h) => h.id)).toEqual(HOJAS.map((h) => h.id));
    const zombi = hojas.find((h) => h.id === 'zombi');
    expect(zombi?.direcciones).toBeNull();
    expect(zombi?.incompleta).toBe(
      'zombi tiene 7 de sus 8 direcciones (le faltan d7): o se terminan o se quitan, porque con menos se pintaría entera con el Y Bot sin decirlo',
    );
    // Las demás, sin arte en este repo de mentira, van con el Y Bot y montables.
    for (const h of hojas.filter((x) => x.id !== 'zombi')) expect(h.incompleta, h.id).toBeNull();
    // Y el cable la lleva tal cual hasta la página.
    expect(validarHojas(JSON.parse(JSON.stringify(hojas)))).toEqual(hojas);
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
    const hojas = hojasDelTaller(zombiASieteDirecciones());
    const m = marcadoDe(renderCatalogo(tarjetasDelCatalogo(CATALOGO, hojas), 'todas'));
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
    expect(() => validarHojas([{ ...buena, incompleta: 'le falta d7' }])).toThrow(
      'la hoja "templario-escudo": dice que está incompleta y trae sus direcciones',
    );
    const { incompleta: _fuera, ...sinCampo } = buena;
    expect(() => validarHojas([sinCampo])).toThrow(
      'la hoja "templario-escudo": por qué está incompleta tiene que ser un texto no vacío',
    );
  });
});

// ------------------------------------------------------------------ banco de combate

/** Una unidad de la arena por su hoja, como fuente del montaje (el catálogo del juego ya no entra). */
const deLaHoja = (id: string): FuenteDeArena => delBorrador(unidad(id));

const MAGO: HeroeDeArena = {
  nombre: 'Maga de pruebas',
  cuerpo: HEROE.combate,
  equipo: EQUIPO_BASE,
  figura: null,
  ataque: 2,
  defensa: 1,
  poder: 3,
  conocimiento: 4,
  hechizos: hechizosDelGremio(5).map((s) => s.id),
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
    // unidad en el catálogo de su bando: `peleaDelMotor`) y la de la arena
    // (`batallaDeArena`).
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
        montar(
          {
            combate: COMBATE_COMPLETO,
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

  it('C2: la figura del héroe es la hoja que se elija, y el maná es de cada pelea', () => {
    const lado = {
      izquierda: {
        unidades: [deLaHoja('imperio-piquero')],
        heroe: { ...MAGO, figura: 'heroe-elfo-druida' },
      },
      derecha: { unidades: [deLaHoja('esqueleto-guerrero')], heroe: null },
      ...MONTAJE,
    };
    const b = montar(lado, createRng(1));
    expect(b.stacks.find((s) => s.origen.kind === 'heroe')?.body).toBe('heroe-elfo-druida');
    b.heroes.attacker!.mana = 0;
    expect(montar(lado, createRng(1)).heroes.attacker?.mana).toBe(40);
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
        tarjetasDelCatalogo(CATALOGO, HOJAS),
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
    // Las cinco facciones, con las unidades de su catálogo.
    for (const f of ['templarios', 'no-muertos', 'imperio', 'elfos', 'orkos']) {
      expect(m).toContain(`data-faccion="${f}"`);
    }
    expect(m.match(/data-unidad-catalogo="/g)).toHaveLength(CATALOGO.length);
  });

  it('el panel de la pelea lleva el maná y el libro de la persona, sin reglas que elegir', () => {
    const s = new SesionDeArena(
      {
        combate: COMBATE_COMPLETO,
        izquierda: { ...yo(unidad('templario-escudo')), heroe: MAGO },
        derecha: ia(unidad('zombi')),
        equipo: EQUIPO_DEL_JUEGO,
      },
      1,
    );
    empezarTalCual(s);
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
    piezas: piezasDelMontaje(UNIDADES_DEL_ENLACE, [EQUIPO_BASE], EQUIPO_ESCRITO),
    hechizos: hechizosDelGremio(5),
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
    combate: COMBATE_COMPLETO,
  };

  /** El enlace de `MONTAJE` con algo cambiado a mano, como lo dejaría una errata. */
  const tocado = (cambiar: (o: Record<string, any>) => void): string => {
    const o = JSON.parse(montajeALaURL(MONTAJE));
    cambiar(o);
    return JSON.stringify(o);
  };

  it('la complejidad de la pelea va y vuelve en el enlace (desde la versión 14) y manda en su batalla', () => {
    const conCinco = { ...MONTAJE, combate: { tope: 5, rueda: 3 } as const };
    const leido = montajeDeLaURL(montajeALaURL(conCinco));
    expect(leido.combate).toEqual({ tope: 5, rueda: 3 });
    expect(JSON.parse(montajeALaURL(conCinco))).toMatchObject({
      v: VERSION_DEL_ENLACE,
      combate: { tope: 5, rueda: 3 },
    });
    const b = montar(montajeDeArenaDelEnlace(leido, EQUIPO_DEL_JUEGO), createRng(7));
    expect(b.rueda).toBe(3);
  });

  it('con el tope de 3, el cuarto de un bando no cabe, y lo dice', () => {
    const cuatro = Array.from({ length: 4 }, () => delBorrador(unidad('zombi')));
    const montaje = (n: number) => ({
      izquierda: { unidades: cuatro.slice(0, n), heroe: null },
      derecha: { unidades: [delBorrador(unidad('zombi'))], heroe: null },
      equipo: CON_MANOS,
      combate: { tope: 3, rueda: 5 } as const,
    });
    expect(() => montar(montaje(4), createRng(1))).toThrow(
      'el bando izquierdo lleva 4 unidades y caben 3: quita 1',
    );
    expect(montar(montaje(3), createRng(1)).rueda).toBe(5);
  });

  it('va y vuelve igual, también por URLSearchParams, y monta su muralla y sus escaleras', () => {
    const texto = montajeALaURL(MONTAJE);
    const leido = montajeDeLaURL(texto);
    expect(leido).toEqual(MONTAJE);
    expect(montajeALaURL(leido)).toBe(texto);
    // A través de URLSearchParams, que es por donde viaja.
    const url = new URLSearchParams({ montaje: texto }).toString();
    expect(montajeDeLaURL(new URLSearchParams(url).get('montaje') as string)).toEqual(MONTAJE);
    const b = montar(montajeDeArenaDelEnlace(leido, EQUIPO_DEL_JUEGO), createRng(7));
    expect(b.muralla).toEqual(MONTAJE.muralla);
    // Las escaleras del montaje llegan al tablero, con las cifras del enlace.
    const conEscalera = b.stacks.filter((st) => st.side === 'attacker' && st.escalera);
    expect(conEscalera.map((st) => st.slot)).toEqual([0, 1]);
    expect(cuerpoDe(conEscalera[1] as BattleStack, catalogoDe(b, EQUIPO_DEL_JUEGO))?.attack).toBe(
      8,
    );
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
      material: 'piedra',
    };
    const leido = montajeDeLaURL(tocado((o) => (o.muralla = deAntes)));
    expect(leido.muralla).toEqual(deAntes);
    expect(validarFormaDeMuralla({ nombre: 'De antes', muralla: deAntes }).muralla).toEqual(
      deAntes,
    );
  });

  it('un enlace mal formado o con lo que no existe se rechaza diciendo qué', () => {
    const V = VERSION_DEL_ENLACE;
    const casos: [string, string][] = [
      ['{"v":1,', 'el montaje del enlace no se puede leer'],
      [tocado((o) => (o.v = V + 1)), `es de la versión ${V + 1} y esta arena lee la ${V}`],
      // La versión es la de hoy: ni la de antes (la de antes de la fuerza y la
      // agilidad, 25-10-2026), ni 0, ni a medias, ni texto.
      [
        tocado((o) => (o.v = V - 1)),
        `este enlace es de una versión anterior de la arena (la ${V - 1}; la de hoy es la ${V}): vuelve a copiarlo`,
      ],
      [tocado((o) => (o.v = 0)), `es de la versión 0 y esta arena lee la ${V}`],
      [tocado((o) => (o.v = 4.5)), `es de la versión 4.5 y esta arena lee la ${V}`],
      [tocado((o) => (o.v = '9')), `es de la versión "9" y esta arena lee la ${V}`],
      [tocado((o) => delete o.v), `es de la versión null y esta arena lee la ${V}`],
      [tocado((o) => delete o.muralla), 'falta «muralla»'],
      // El material de la muralla (versión 18): obligatorio y de los que hay.
      [
        tocado((o) => (o.muralla = { muros: [{ col: 7, row: 1 }], puertas: [] })),
        'la muralla del enlace no vale: la muralla: falta «material»',
      ],
      // La complejidad de la pelea (versión 14): entera, de las que hay, y que quepa.
      [tocado((o) => delete o.combate), 'falta «combate»'],
      [tocado((o) => (o.combate.rueda = 4)), '«4» no es una rueda: valen 3, 5 o 7'],
      [tocado((o) => (o.combate.tope = 6)), '«6» no es un tope de tropa: valen 3, 5 o 7'],
      [
        tocado((o) => (o.combate.tope = 3)),
        'el bando izquierdo del enlace lleva 4 unidades, contando a su héroe, y caben 3: quita 1',
      ],
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
        `lleva ${LIDERAZGO.maxPorBando + 1} unidades, contando a su héroe, y caben ${LIDERAZGO.maxPorBando}`,
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
  it('el monje templario sale con Curar; otro bastón, con ninguno', () => {
    expect(unidad('templario-monje').habilidades).toEqual(['Curar (X)']);
    const otroBaston = CATALOGO.find(
      (u) => hojaPorId(u.cuerpo.hoja).perfil === 'baston' && u.id !== 'templario-monje',
    );
    if (otroBaston === undefined) throw new Error('no hay otra unidad de bastón');
    expect(otroBaston.habilidades).toEqual([]);
    // Y en la pelea son poderes del motor; las demás habilidades no pelean.
    const b = pelea(
      [unidad('templario-monje', { habilidades: ['Salto', 'Curar (X)'] })],
      [unidad('zombi')],
      createRng(1),
    );
    expect(b.stacks[0]?.unit.poderes).toEqual(['curar']);
    expect(b.stacks[1]?.unit.poderes).toBeUndefined();
  });

  it('«Bendecir» se fue con la suerte (02-11-2026): ya no es una habilidad, y lo que no existe no vale', () => {
    expect(CATALOGO_DE_HABILIDADES).toContain('Curar (X)');
    expect(HABILIDADES).toContain('Curar (X)');
    expect(HABILIDADES).not.toContain('Bendecir');
    expect(() =>
      validarUnidad(unidad('zombi', { habilidades: ['Bendecir'] }), EQUIPO_DEL_JUEGO),
    ).toThrow('la habilidad "Bendecir" no existe');
  });
});

describe('retocar en plena pelea (B10-B14)', () => {
  // Sin el equipo de su perfil: aquí se comparan las cifras que se escriben con
  // las del stack, y con equipo serían las del cuerpo más sus piezas (el retoque
  // del equipo, en su propio test). Sin arma no se monta nadie (vuelta 2): llevan
  // las manos de prueba, que no suman nada.
  const unidad = (id: string, cambios: Partial<Unidad> = {}): Unidad =>
    unidadDeArena(id, { equipo: { arma: MANOS_DE_PRUEBA.id }, ...cambios });
  /** Monje y arquero a la izquierda, con héroe; monje a la derecha. */
  function conMonjes(): BattleState {
    return montar(
      {
        combate: COMBATE_COMPLETO,
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
        catalogoDe(b, CON_MANOS),
      ),
    ).toBeNull();
    expect(monjes(b).map((x) => [x.side, x.unit.attack])).toEqual([
      ['attacker', 19],
      ['defender', 19],
    ]);
    // El arquero ni se toca: el mismo objeto.
    expect(b.stacks.find((x) => x.body === 'goblin-arquero')).toBe(arquero);
    const antes = unidad('templario-monje').attack;
    expect(b.log.slice(desde)).toEqual([
      {
        kind: 'retoque',
        nombre: unidad('templario-monje').name,
        stacks: monjes(b).map((x) => x.id),
        cambios: [`ataque ${antes} → 19`],
      },
    ]);
    // Y el parte dice qué cambió (M3 de QA: cuatro retoques eran cuatro líneas iguales).
    expect(marcadoDe(renderBattleLog(b, null))).toContain(
      `Cambian las cifras de ${unidad('templario-monje').name} a media pelea (ataque ${antes} → 19)`,
    );
    // La misma fuente sin cambios deja las cifras de una pelea recién montada.
    retocarEnBatalla(
      b,
      { kind: 'tipo', fuente: delBorrador(unidad('templario-monje')) },
      catalogoDe(b, CON_MANOS),
    );
    expect(monjes(b)[0]?.unit).toEqual(monjes(conMonjes())[0]?.unit);
  });

  it('el tipo de cada stack lo anota el montaje: unidad o héroe', () => {
    const b = montar(
      {
        combate: COMBATE_COMPLETO,
        izquierda: {
          unidades: [delBorrador(unidad('zombi')), delBorrador(unidad('esqueleto-guerrero'))],
          heroe: MAGO,
        },
        derecha: { unidades: [delBorrador(unidad('zombi'))], heroe: null },
        equipo: CON_MANOS,
      },
      createRng(1),
    );
    expect(b.stacks.map((x) => tipoDelStack(x))).toEqual([
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
      catalogoDe(b, CON_MANOS),
    );
    expect(b.stacks.map((x) => x.unit.attack)).toEqual([
      unidad('zombi').attack,
      9,
      b.stacks[2]?.unit.attack,
      unidad('zombi').attack,
    ]);
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
      catalogoDe(b, CON_MANOS),
    );
    expect(elMonje().topHp).toBe(hp + 10 - 3);
    // Bajar la vida por debajo de la herida no mata: queda en 1.
    retocarEnBatalla(
      b,
      {
        kind: 'tipo',
        fuente: delBorrador(unidad('templario-monje', { hp: 2 })),
      },
      catalogoDe(b, CON_MANOS),
    );
    expect(elMonje().topHp).toBe(1);
    const mando = b.heroes.attacker;
    if (mando === null) throw new Error('sin héroe');
    mando.mana -= 7;
    mando.castThisRound = true;
    retocarEnBatalla(
      b,
      { kind: 'heroe', lado: 'izquierda', datos: { ...MAGO, conocimiento: 6 } },
      catalogoDe(b, CON_MANOS),
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
    const b = montar(
      {
        combate: COMBATE_COMPLETO,
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
        catalogoDe(b, CON_MANOS),
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
      catalogoDe(b, CON_MANOS),
    );
    expect(mando().mana).toBe(0);
    retocarEnBatalla(
      b,
      { kind: 'heroe', lado: 'izquierda', datos: MAGO },
      catalogoDe(b, CON_MANOS),
    );
    expect(mando().mana).toBe(10 * MAGO.conocimiento - 7);
  });

  it('el parte dice qué campo de la ficha cambió, y lo que no cambia nada no escribe (N1 de QA)', () => {
    const b = conMonjes();
    const monje = unidad('templario-monje');
    // Una habilidad sin motor: no cambia ninguna cifra de la pelea.
    const inerte = 'Salto';
    expect(HABILIDADES).toContain(inerte);
    expect(monje.habilidades).not.toContain(inerte);
    const desde = b.log.length;
    const retoca = (cambios: Partial<Unidad>) =>
      retocarEnBatalla(
        b,
        { kind: 'tipo', fuente: delBorrador({ ...monje, ...cambios }) },
        catalogoDe(b, CON_MANOS),
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
        combate: COMBATE_COMPLETO,
        izquierda: { ...yo(unidad('templario-monje')), heroe: MAGO },
        derecha: ia(unidad('zombi')),
        equipo: CON_MANOS,
      },
      1,
    );
    empezarTalCual(s);
    expect(s.retocar({ kind: 'tipo', fuente: delBorrador(unidad('templario-monje')) })).toBeNull();
    expect(s.status).not.toContain('Cambiado');
    expect(s.retocar({ kind: 'heroe', lado: 'izquierda', datos: MAGO })).toBeNull();
    expect(s.status).not.toContain('Cambiado');
    expect(
      s.retocar({ kind: 'tipo', fuente: delBorrador(unidad('templario-monje', { attack: 9 })) }),
    ).toBeNull();
    expect(s.status).toContain('Cambiado');
  });

  it('el héroe retocado lanza con su poder nuevo (B13)', () => {
    const b = conMonjes();
    retocarEnBatalla(
      b,
      { kind: 'heroe', lado: 'izquierda', datos: { ...MAGO, poder: 9 } },
      catalogoDe(b, CON_MANOS),
    );
    const objetivo = b.stacks.find((x) => x.side === 'defender');
    if (objetivo === undefined) throw new Error('sin objetivo');
    applyAction(b, { type: 'cast', spell: 'magic_arrow', target: objetivo.id }, createRng(1));
    const lanzado = [...b.log].reverse().find((e) => e.kind === 'cast');
    const [flecha] = hechizo('magic_arrow').efectos;
    if (flecha?.tipo !== 'danio') throw new Error('la Flecha mágica hiere');
    expect(lanzado).toMatchObject({ damage: rinde(flecha.cantidad, 9) });
  });
});

describe('cuerpo y equipo: el perfil de arma es equipo, y el nivel lo mide puesto (18-10-2026)', () => {
  it('el cuerpo común, desnudo, no pasa del nivel 3, y cada unidad del catálogo vale más vestida que desnuda', () => {
    // Del 1 al 3 según su agilidad (25-10-2026: con la fuerza y la agilidad, las
    // hojas más ágiles ya no caben en el 1, y el jinete, que carga, llega al 3).
    for (const h of HOJAS) {
      const desnuda = { ...unidadNueva(h, ocupados(), EQUIPO_DEL_JUEGO), equipo: {} };
      expect(nivelDeLaHoja(desnuda), h.id).toMatch(/· nivel [123]$/);
    }
    for (const u of CATALOGO) {
      expect(indiceDePoder(unidadDeCombate(u, EQUIPO_DEL_JUEGO)), u.id).toBeGreaterThan(
        indiceDePoder(unidadDeCombate({ ...u, equipo: {} }, EQUIPO_DEL_JUEGO)),
      );
    }
  });

  it('el héroe de la arena pelea con su equipo base, la Espada y el gambesón, que viaja en el enlace', () => {
    const h = heroeDeArena(MAGO, EQUIPO_DEL_JUEGO);
    expect(h.cuerpo.equipo?.arma).toBe(ESPADA);
    expect(h.cuerpo.armas?.arma).toMatchObject({
      piezas: [{ id: ESPADA }],
      rueda: nivelesDeLaEspada(),
    });
    expect(idsLlevados([], [EQUIPO_BASE])).toContain(ESPADA);
    expect(idsLlevados([], [])).not.toContain(ESPADA);
    expect(h.cuerpo.equipo).toEqual(EQUIPO_BASE);
    expect(idsLlevados([], [EQUIPO_BASE])).toEqual(new Set(['espada', 'gambeson']));
    // Su equipo pasa la misma regla que el de la tropa: lleva un arma.
    expect(armaDeCuerpoBlocker(EQUIPO_BASE)).toBeNull();
  });

  it('C3: toda unidad de la arena ocupa una casilla y no lleva munición', () => {
    for (const u of CATALOGO) {
      const c = unidadDeCombate(u, EQUIPO_DEL_JUEGO);
      expect(c, u.id).not.toHaveProperty('shots');
      expect(c, u.id).not.toHaveProperty('hexes');
    }
    const batalla = pelea([unidad('troll-maza')], [unidad('zombi')], createRng(3));
    for (const s of batalla.stacks) expect(stackHexes(s), s.id).toHaveLength(1);
  });
});

describe('cada arma para lo suyo (13-10-2026): los kits, y lo de antes convertido', () => {
  it('el arco a la espalda deja llevar escudo, y la ficha lo monta', () => {
    const u = equiparEnArena(unidad('elfo-arquero'), 'paves', EQUIPO_DEL_JUEGO);
    expect(validarUnidad(u, EQUIPO_DEL_JUEGO).equipo).toMatchObject({
      distancia: 'arco',
      escudo: 'paves',
    });
  });
});

describe('sin el catálogo del juego (13-10-2026)', () => {
  it('un cuerpo de criatura no vale: no se retira ni se convierte, se queda como cualquiera que no vale', () => {
    // Una unidad hecha aquí, con las manos de prueba: ninguna cifra del catálogo cuenta.
    const buena: Unidad = {
      id: 'prueba-del-cuerpo',
      name: 'Unidad de prueba',
      faction: 'templarios',
      leadership: 1,
      attack: 1,
      fuerza: 3,
      agilidad: 3,
      hp: 20,
      cuerpo: { hoja: HOJAS[0]!.id },
      equipo: { arma: MANOS_DE_PRUEBA.id },
      traits: [],
      habilidades: [],
    };
    expect(validarUnidad(buena, CON_MANOS)).toEqual(buena);
    // El mismo con el cuerpo de antes, una criatura del juego.
    expect(() =>
      validarUnidad({ ...buena, cuerpo: { criatura: 'cualquiera' } }, CON_MANOS),
    ).toThrow(`la unidad «${buena.name}»: el cuerpo tiene que ser { hoja }, y trae criatura`);
    const vieja = { ...buena, id: 'prueba-vieja', cuerpo: { criatura: 'cualquiera' } };
    const r = revisarCatalogo({ unidades: [buena, vieja] }, CON_MANOS);
    expect(r.validas.map((u) => u.id)).toEqual([buena.id]);
    expect(r.invalidas.map((i) => [i.id, i.crudo])).toEqual([[vieja.id, vieja]]);
    expect(r.invalidas[0]!.motivo).toContain('el cuerpo tiene que ser { hoja }, y trae criatura');
  });
});

describe('sin compatibilidad hacia atrás (14-10-2026)', () => {
  it('el comentario del catálogo lo dice: solo hojas, sin munición ni tamaño, y solo lo de hoy', () => {
    // El que se lee es el del fichero: «Guardar» lo conserva (simplify de F2) y la
    // constante es solo el de reserva, corto.
    const enDisco = (
      JSON.parse(readFileSync(resolve(RAIZ, RUTA_DEL_CATALOGO_DE_UNIDADES), 'utf8')) as {
        _comment: string;
      }
    )._comment;
    expect(enDisco).toContain('Solo se lee el formato de hoy');
    expect(enDisco).not.toContain('migrarUnidad');
    expect(enDisco).toContain('cuerpo: { hoja }');
    expect(enDisco).not.toContain('{ criatura }');
    expect(enDisco).toContain('sin munición');
    expect(enDisco).toContain('no hay shots ni hexes');
    expect(COMENTARIO_DEL_CATALOGO_DE_UNIDADES).toContain('cuerpo: { hoja }');
  });
});

describe('«En el campo» lleva lo que tiene colgado cada unidad (31-10-2026)', () => {
  it('la fila con efectos lleva sus pastillas y una nota; las demás, como siempre', () => {
    const s = new SesionDeArena(
      {
        combate: COMBATE_COMPLETO,
        izquierda: yo(unidad('templario-escudo'), unidad('templario-monje')),
        derecha: ia(unidad('orko-dos-armas')),
        equipo: EQUIPO_DEL_JUEGO,
      },
      1,
    );
    empezarTalCual(s);
    const campo = (): string => enElCampo(marcadoDe(renderPanelDeBatalla(s, false)));
    expect(campo()).not.toContain('modificadores en-curso');
    const orko = s.battle.stacks.find((x) => x.body === 'orko-dos-armas');
    if (orko === undefined) throw new Error('sin el orko');
    orko.effects.push(
      { kind: 'speed', amount: -2, source: 'slow', roundsLeft: 3 },
      {
        kind: 'attack',
        amount: -3,
        source: 'romperGuardia',
        roundsLeft: 2,
        hasta: { turno: 1, al: 'terminar' },
      },
    );
    const m = campo();
    expect(m.match(/modificadores en-curso/g)).toHaveLength(1);
    // En su fila: tras su nombre, antes de la fila siguiente.
    const fila = m.slice(m.indexOf(nombreEnElCampo(s.battle, orko)));
    const fin = fila.indexOf('<div class="stack');
    const suya = fin < 0 ? fila : fila.slice(0, fin);
    expect(suya).toContain('data-efecto="speed" data-signo="−">velocidad -2</span>');
    expect(suya).toContain('data-efecto="attack" data-signo="−">ataque -3</span>');
    expect(suya.match(/class="nota"/g)).toHaveLength(1);
    expect(suya).toContain('Romper guardia: ataque -3 hasta que termine su próximo turno');
  });
});
