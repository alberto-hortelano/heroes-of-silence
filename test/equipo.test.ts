/**
 * El equipo: cinco huecos por individuo y por héroe (una sola clase de piezas desde el 18-10-2026), el catálogo en datos, el
 * botín, la armería y lo que hace la IA con todo ello.
 *
 * Los tests salen de los criterios del plan (`docs/agents/2026-10-02-el-equipo/`)
 * con la corrección del usuario: el héroe NACE equipado con lo de armería, y el
 * catálogo distingue calidades.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  COMPRAS_POR_HEROE_Y_DIA,
  ORO_DE_SOBRA_PARA_NOVATOS,
  siguienteDeEquipo,
  valorDePieza,
} from '../src/core/ai/strategy.js';
import { armaduraDe } from '../src/core/battle/armas.js';
import { createBattle, stackById } from '../src/core/battle/battle.js';
import { cifrasDeUnidad, unidad, unidadDelJuego } from '../src/core/catalogo.js';
import { RESPONSE_FORMAT } from '../src/core/contract/agent.js';
import {
  EQUIPO,
  EQUIPO_ESCRITO,
  isShooter,
  leerEquipo,
  piezaBlocker,
  problemasDePieza,
  tipoDeHeroePorDefecto,
} from '../src/core/data.js';
import {
  catalogoDeEquipo,
  cifrasDePieza,
  conEquipo,
  EQUIPO_BASE,
  EQUIPO_DEL_JUEGO,
  equipoBaseBlocker,
  equipoBlocker,
  equipoCon,
  manosBlocker,
  mismasCifras,
  modificadoresDePieza,
  PIEZAS_DE_ARMERIA,
  PIEZAS_DE_BOTIN,
  PIEZAS_DEL_CATALOGO,
  pieza,
  ponerPieza,
  textoDeModificador,
} from '../src/core/hero/equipo.js';
import { umbral } from '../src/core/hero/experiencia.js';
import { heroeRecienHecho, heroUnit } from '../src/core/hero/hero.js';
import { troopUnit } from '../src/core/hero/troop.js';
import { isEnterable, objectAt, pointKey } from '../src/core/map/map.js';
import { VECINAS } from '../src/core/map/regiones.js';
import { indiceDePoder } from '../src/core/nivel.js';
import { createRng } from '../src/core/rng.js';
import { CHARACTER_BODY } from '../src/core/rpg/character.js';
import { regionDeCasilla, tocaUnNodo } from '../src/core/state/asaltantes.js';
import {
  type AdventureAction,
  applyAdventureAction,
  ascenderVeterano,
  baseOf,
  buyBlocker,
  equipBlocker,
  type GameContext,
  type GameState,
  heroById,
  heroesOf,
  resolvePendingBattle,
  settleBattle,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import {
  CIFRAS_DE_PIEZA,
  type Point,
  SPEED_TIERS,
  type Troop,
  type Veterania,
} from '../src/core/types.js';
import { cuerpoDeCombate } from '../src/core/unidad.js';
import {
  ejercito,
  forzarBatalla,
  JINETE,
  NO_MUERTO,
  PESADA,
  ponerMonstruo,
  SANADOR,
  TROPA,
  TROPA_BARATA,
} from './helpers.js';

const ctx = (seed: number): GameContext => ({ rng: createRng(seed) });

/**
 * El cuerpo de una unidad del catálogo **sin su equipo de serie**: lo que suma
 * `conEquipo`. Vestida (`unidadDelJuego`) ya lleva algo en cada hueco que usa, y
 * `conEquipo` no suma una pieza encima de otra.
 */
const desnudo = (id: string) => cuerpoDeCombate(unidad(id));

function hoja(id: string, experiencia: number, extra: Partial<Veterania> = {}): Veterania {
  return { id, experiencia, batallas: 1, bajas: 0, heroes: [], ...extra };
}

/** El jugador 0 con su héroe dentro de su base, y la base con armería y oro. */
function enLaArmeria(seed = 7): {
  state: GameState;
  c: GameContext;
  hero: ReturnType<typeof heroById>;
} {
  const state = newGame({ seed });
  const base = baseOf(state, 0)!;
  const hero = heroesOf(state, 0)[0]!;
  hero.at = base.at;
  base.buildings.push('armory');
  state.players[0]!.resources = { ...state.players[0]!.resources, gold: 20000 };
  return { state, c: ctx(seed), hero };
}

const accion = (state: GameState, a: AdventureAction, c: GameContext): void =>
  applyAdventureAction(state, a, c, 0);

// ---------------------------------------------------------------- catálogo

describe('el catálogo de equipo, en datos (C2)', () => {
  it('una sola clase de piezas (18-10-2026): la armería vende lo que dice `seConsigue`, el botín da lo suyo y el héroe nace con la Espada y el gambesón', () => {
    // Lo que vende la armería y lo que cae como botín salen de cada pieza, en el
    // orden del catálogo; la decisión del usuario: la armería, las que no van sobre
    // otra; el botín, las que van sobre otra, la maza y el pavés.
    expect(PIEZAS_DE_ARMERIA).toEqual(EQUIPO.filter((p) => p.seConsigue?.includes('armeria')));
    expect(PIEZAS_DE_BOTIN).toEqual(EQUIPO.filter((p) => p.seConsigue?.includes('botin')));
    const conBase = new Set(EQUIPO_ESCRITO.filter((p) => 'base' in p).map((p) => p.id));
    expect(PIEZAS_DE_BOTIN.map((p) => p.id).sort()).toEqual([...conBase, 'maza', 'paves'].sort());
    expect(PIEZAS_DE_ARMERIA.map((p) => p.id).sort()).toEqual(
      EQUIPO.filter((p) => !conBase.has(p.id) && p.id !== 'maza' && p.id !== 'paves')
        .map((p) => p.id)
        .sort(),
    );
    // Toda pieza se vende o cae como botín, y todas tienen precio en oro.
    expect(EQUIPO.every((p) => p.seConsigue.length > 0)).toBe(true);
    expect(EQUIPO.every((p) => p.precio > 0)).toBe(true);
    // El equipo base es el de `data/heroe.json`: la Espada y el gambesón, sin nada más.
    expect(EQUIPO_BASE).toEqual({ arma: 'espada', armadura: 'gambeson' });
    // Ninguna da PV: no es un campo de una pieza (lo dice el tipo, y el cargador).
    expect(EQUIPO.some((p) => 'pv' in p)).toBe(false);
    expect(CIFRAS_DE_PIEZA).not.toContain('pv');
  });

  it('el cargador muerde con las cifras nuevas: daño al revés, manos fuera del arma, escudo que no resta, PV, sin botín', () => {
    const bueno = { piezas: EQUIPO.map((p) => ({ ...p })) };
    const con = (cambiar: (ps: Record<string, unknown>[]) => void) => {
      const roto = structuredClone(bueno) as { piezas: Record<string, unknown>[] };
      cambiar(roto.piezas);
      return () => leerEquipo(roto).piezas;
    };
    const id = (ps: Record<string, unknown>[], x: string) =>
      ps.find((p) => p.id === x) as Record<string, unknown>;
    expect(con((ps) => (id(ps, 'espada').danio = [3, 1]))).toThrow(
      /"espada": el daño mínimo que suma \(3\) pasa del máximo \(1\)/,
    );
    expect(con((ps) => (id(ps, 'espada').danio = [-1, 4]))).toThrow(/danio tiene que ser/);
    expect(con((ps) => (id(ps, 'brigantina').manos = 2))).toThrow(
      /"brigantina" va en el hueco armadura y dice manos/,
    );
    expect(con((ps) => (id(ps, 'mandoble').manos = 3))).toThrow(/manos es 1 o 2, y es 3/);
    expect(con((ps) => (id(ps, 'escudo').velocidad = 0))).toThrow(
      /"escudo" es un escudo y tiene que restar velocidad/,
    );
    expect(con((ps) => (id(ps, 'arco').manos = 2))).toThrow(
      /"arco" va en el hueco distancia y dice manos/,
    );
    // Nada da PV (18-10-2026): un `pv` tumba la carga diciéndolo, también a 0.
    expect(con((ps) => (id(ps, 'barda').pv = 0))).toThrow(
      /^data\/equipo\.json: "barda" suma PV: ninguna pieza da PV/,
    );
    // Ni accesorio ni calidad: son de antes, y no valen.
    expect(con((ps) => (id(ps, 'rodela').hueco = 'accesorio'))).toThrow(
      /"rodela" va en el hueco "accesorio", que no existe; valen arma, distancia, lanza, armadura, escudo/,
    );
    expect(con((ps) => (id(ps, 'arco').calidad = 'arena'))).toThrow(
      /"arco": «calidad» no es un campo de una pieza/,
    );
    // De dónde se consigue: solo sitios que existen, sin repetir.
    expect(con((ps) => (id(ps, 'arco').seConsigue = ['tienda']))).toThrow(
      /"arco" se consigue en "tienda", que no es ningún sitio; valen armeria, botin/,
    );
    expect(con((ps) => (id(ps, 'arco').seConsigue = ['botin', 'botin']))).toThrow(
      /"arco": seConsigue repite un sitio/,
    );
    // Sin ninguna pieza de botín, el botín no tendría qué dar.
    expect(
      con((ps) => {
        for (const p of ps) p.seConsigue = ['armeria'];
      }),
    ).toThrow(/no hay ninguna pieza que caiga como botín/);
    // Un campo que no existe no se ignora callando (H2 de QA, 14-10-2026): un
    // `disparos` de antes de quitar la munición y una errata tumban la carga, y el
    // motivo nombra el fichero. Antes el juego los ignoraba y la arena lanzaba
    // después sin decir de dónde venían.
    expect(con((ps) => (id(ps, 'arco').disparos = 12))).toThrow(
      /^data\/equipo\.json: "arco": «disparos» no es un campo de una pieza; valen id, nombre,/,
    );
    expect(con((ps) => (id(ps, 'maza').danyo = [1, 2]))).toThrow(
      /"maza": «danyo» no es un campo de una pieza/,
    );
    // Una velocidad negativa fuera del escudo es legal (y entera).
    expect(con((ps) => (id(ps, 'barda').velocidad = -1))).not.toThrow();
    expect(con((ps) => (id(ps, 'barda').velocidad = -0.5))).toThrow(
      /velocidad tiene que ser un entero/,
    );
  });

  it('la regla de una pieza vive en un sitio: `problemasDePieza`, que lee el cargador y la arena', () => {
    // Editor de equipo (12-10-2026): extraída del bucle de `validarEquipo`, con el
    // mismo texto, para que la arena pregunte por una pieza suelta.
    const escudo = { ...pieza('escudo') };
    expect(problemasDePieza(escudo)).toEqual([]);
    expect(piezaBlocker(escudo)).toBeNull();
    expect(piezaBlocker({ ...escudo, velocidad: 0 })).toBe(
      '"escudo" es un escudo y tiene que restar velocidad (un número negativo), y es 0',
    );
    expect(problemasDePieza({ ...pieza('brigantina'), manos: 2, ataque: -1 })).toEqual([
      '"brigantina": ataque tiene que ser un entero ≥ 0 y es -1',
      '"brigantina" va en el hueco armadura, que no suma ataque: en él una pieza suma defensa, armadura, velocidad',
      '"brigantina" va en el hueco armadura y dice manos: solo un arma se lleva a dos manos',
    ]);
    expect(piezaBlocker({ ...pieza('espada'), danio: [30, 10] })).toBe(
      '"espada": el daño mínimo que suma (30) pasa del máximo (10)',
    );
    expect(piezaBlocker(7)).toBe('la pieza no es un objeto');
    // Repetida es del catálogo entero: la dice el cargador, no la pieza.
    const dos = { piezas: [...EQUIPO, { ...pieza('maza') }] };
    expect(() => leerEquipo(dos).piezas).toThrow('"maza" está dos veces en el catálogo');
  });

  it('cada lectura atada resuelve de su catálogo; las sueltas, del juego', () => {
    const otra = new Map(PIEZAS_DEL_CATALOGO);
    otra.set('espada', { ...pieza('espada'), ataque: 50 });
    otra.set('garfio', { ...pieza('maza'), id: 'garfio', nombre: 'Garfio' });
    const eq = equipoCon(otra);
    expect(eq.pieza('espada').ataque).toBe(50);
    expect(pieza('espada').ataque).toBe(PIEZAS_DEL_CATALOGO.get('espada')?.ataque);
    expect(() => pieza('garfio')).toThrow('pieza de equipo desconocida: "garfio"');
    expect(eq.piezasPuestas({ arma: 'garfio' }).map((p) => p.nombre)).toEqual(['Garfio']);
    expect(eq.sumaDeEquipo({ arma: 'espada' }).ataque).toBe(50);
    expect(eq.conEquipo(desnudo(TROPA_BARATA), { arma: 'espada' }).attack).toBe(
      desnudo(TROPA_BARATA).attack + 50,
    );
    expect(equipoBlocker({ arma: 'garfio' })).toBe('no existe ninguna pieza "garfio"');
    expect(eq.equipoBlocker({ arma: 'garfio' })).toBeNull();
    otra.set('espada', { ...pieza('espada'), manos: 2 });
    expect(eq.manosBlocker({ escudo: 'escudo' }, 'espada')).toMatch(/dos manos/);
    expect(manosBlocker({ escudo: 'escudo' }, 'espada')).toBeNull();
    expect(() => eq.ponerPieza({ escudo: 'escudo' }, 'espada', 'Aldo')).toThrow(
      'no se puede poner Espada a Aldo',
    );
  });

  it('el cargador muerde: hueco inventado, cifra negativa y un precio que no es un número de oro', () => {
    const bueno = { piezas: EQUIPO.map((p) => ({ ...p })) };
    const roto = structuredClone(bueno) as { piezas: Record<string, unknown>[] };
    roto.piezas[0]!.hueco = 'casco';
    roto.piezas[1]!.ataque = -1;
    roto.piezas[2]!.precio = { gold: 800 };
    roto.piezas[3]!.precio = -5;
    expect(() => leerEquipo(roto).piezas).toThrow(/va en el hueco "casco", que no existe/);
    expect(() => leerEquipo(roto).piezas).toThrow(/ataque tiene que ser un entero ≥ 0 y es -1/);
    expect(() => leerEquipo(roto).piezas).toThrow(/es un objeto: escribe solo el número/);
    expect(() => leerEquipo(roto).piezas).toThrow(/cuesta -5 de oro: tiene que ser un entero ≥ 0/);
    expect(leerEquipo(bueno).piezas).toHaveLength(EQUIPO.length);
  });

  it('el equipo base del héroe vale con el catálogo, o la carga y «Guardar» lo dicen', () => {
    expect(equipoBaseBlocker(EQUIPO_DEL_JUEGO)).toBeNull();
    const sinGambeson = catalogoDeEquipo(EQUIPO_ESCRITO.filter((p) => p.id !== 'gambeson'));
    expect(equipoBaseBlocker(sinGambeson)).toBe(
      'el equipo base del héroe (data/heroe.json): no existe ninguna pieza "gambeson"',
    );
  });
});

// ---------------------------------------------------------------- cifras

describe('las piezas suman daño y tiros, el escudo resta velocidad y las dos manos no lo admiten (12-10-2026)', () => {
  it('`conEquipo` suma daño y tiros, y sin ellos no toca esos campos', () => {
    const campesino = desnudo(TROPA_BARATA);
    const conEspada = conEquipo(campesino, { arma: 'espada' });
    expect(conEspada.damage).toEqual([campesino.damage[0] + 10, campesino.damage[1] + 30]);
    expect(conEspada.attack).toBe(campesino.attack + 2);
    expect(conEspada).not.toHaveProperty('shots');
    // Sin daño ni tiros que sumar, el objeto no gana esos campos.
    const conGambeson = conEquipo(campesino, { armadura: 'gambeson' });
    expect(conGambeson.damage).toBe(campesino.damage);
    expect(conGambeson).not.toHaveProperty('shots');
    // Ni el de armas: sin arma ni arma por uso, todo golpe va con las de arriba.
    expect(conGambeson).not.toHaveProperty('armas');
    // Un arma dice su rueda (toda pieza del hueco `arma`), y su golpe la lleva.
    expect(conEspada.armas?.arma.rueda).toEqual(pieza('espada').rueda);
  });

  it('cada arma para lo suyo (13-10-2026): arriba, el cuerpo a cuerpo; en `armas`, el disparo y la carga', () => {
    const c = desnudo(TROPA_BARATA);
    // Los huecos de arma por uso son de la arena: se viste con sus lecturas atadas.
    const arena = EQUIPO_DEL_JUEGO;
    const arquero = arena.conEquipo(c, {
      arma: 'daga',
      distancia: 'arco',
      armadura: 'jubon_de_arquero',
    });
    // Arriba, cuerpo + daga + jubón: lo que no es arma suma a todo golpe. El
    // jubón, de la arena, da 2 de armadura y ningún PV (#262).
    expect(arquero.attack).toBe(c.attack + 1);
    expect(arquero.damage).toEqual([c.damage[0] + 0, c.damage[1] + 10]);
    expect(arquero.hp).toBe(c.hp);
    expect(armaduraDe(arquero)).toBe(2);
    // Sin munición (13-10-2026): el arco no da tiros; llevarlo ya es disparar.
    expect(arquero).not.toHaveProperty('shots');
    expect(isShooter(arquero)).toBe(true);
    // El golpe, el de arriba con la daga; el disparo, cuerpo + arco + jubón, sin la daga.
    expect(arquero.armas).toEqual({
      // La daga cambia la rueda (18-10-2026): su golpe la lleva.
      arma: {
        arma: { id: 'daga', nombre: 'Daga' },
        attack: arquero.attack,
        damage: arquero.damage,
        rueda: pieza('daga').rueda,
      },
      distancia: {
        arma: { id: 'arco', nombre: 'Arco' },
        attack: c.attack + 2,
        damage: [c.damage[0] + 10, c.damage[1] + 20],
      },
    });
    // Sin arma de cuerpo a cuerpo, se pega con el cuerpo.
    const jinete = arena.conEquipo(c, { lanza: 'lanza_de_jinete', armadura: 'barda' });
    expect(jinete.attack).toBe(c.attack);
    expect(jinete.damage).toEqual(c.damage);
    expect(jinete.armas).toEqual({
      arma: { arma: null, attack: c.attack, damage: c.damage },
      lanza: {
        arma: { id: 'lanza_de_jinete', nombre: 'Lanza de jinete' },
        attack: c.attack + 7,
        damage: [c.damage[0] + 40, c.damage[1] + 80],
        rueda: pieza('lanza_de_jinete').rueda,
      },
    });
    // Vestir en dos veces da lo mismo que en una.
    const enDos = arena.conEquipo(conEquipo(c, { arma: 'daga', armadura: 'jubon_de_arquero' }), {
      distancia: 'arco',
    });
    expect(mismasCifras(enDos, arquero)).toBe(true);
    expect(enDos.equipo).toEqual(arquero.equipo);
    // Con la ballesta en su hueco, su ataque y su daño son del disparo, no de arriba.
    expect(
      arena.sumaDeEquipo({ arma: 'daga', distancia: 'ballesta', armadura: 'gambeson' }),
    ).toEqual({
      ataque: 1,
      defensa: 1,
      armadura: 4,
      velocidad: 0,
      danio: [0, 10],
    });
  });

  it('el equipo base del héroe suma la Espada y el gambesón: ataque, daño, defensa y armadura, sin PV', () => {
    const piquero = desnudo(TROPA);
    const espada = pieza('espada');
    const conBase = conEquipo(piquero, EQUIPO_BASE);
    expect(conBase).toStrictEqual({
      ...piquero,
      attack: piquero.attack + 2,
      defense: piquero.defense + 1,
      damage: [piquero.damage[0] + 10, piquero.damage[1] + 30],
      hp: piquero.hp,
      puntosDeArmadura: 4,
      speed: piquero.speed,
      equipo: EQUIPO_BASE,
      armas: {
        arma: {
          arma: { id: 'espada', nombre: 'Espada' },
          attack: piquero.attack + 2,
          damage: [piquero.damage[0] + 10, piquero.damage[1] + 30],
          rueda: espada.rueda,
        },
      },
    });
    // Ninguna pieza cambia la vida.
    for (const p of EQUIPO) {
      expect(conEquipo(piquero, { [p.hueco]: p.id }).hp, p.id).toBe(piquero.hp);
    }
  });

  it('`mismasCifras` ve todo lo que suma una pieza: ninguna deja las cifras iguales', () => {
    // Un cuerpo medio, para que la velocidad tenga escalones a los dos lados.
    const u = desnudo(TROPA);
    const i = SPEED_TIERS.indexOf(u.speed);
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(SPEED_TIERS.length - 1);
    expect(mismasCifras(u, u)).toBe(true);
    for (const p of EQUIPO) {
      expect(mismasCifras(u, conEquipo(u, { [p.hueco]: p.id })), p.id).toBe(false);
    }
  });

  it('el escudo baja un escalón y no pasa del primero', () => {
    const piquero = desnudo(TROPA);
    const i = SPEED_TIERS.indexOf(piquero.speed);
    expect(i).toBeGreaterThan(1);
    expect(conEquipo(piquero, { escudo: 'escudo' }).speed).toBe(SPEED_TIERS[i - 1]);
    expect(conEquipo(piquero, { escudo: 'paves' }).speed).toBe(SPEED_TIERS[Math.max(0, i - 2)]);
    const lento = { ...piquero, speed: SPEED_TIERS[0] };
    expect(conEquipo(lento, { escudo: 'paves' }).speed).toBe(SPEED_TIERS[0]);
    expect(conEquipo(piquero, { escudo: 'escudo' }).defense).toBe(piquero.defense + 4);
    expect(cifrasDePieza(pieza('escudo'))).toBe('+4 Defensa, −1 Velocidad');
    expect(cifrasDePieza(pieza('mandoble'))).toBe('+5 Ataque, +30–60 Daño, a dos manos');
  });

  // 13-10-2026, el usuario: «estandariza la forma de mostrar los modificadores del
  // equipo, que no sea un texto libre».
  it('`modificadoresDePieza`: lista estructurada, en el orden de las cifras, sin ceros y con la marca detrás', () => {
    expect(modificadoresDePieza(pieza('arco'))).toEqual([
      { kind: 'cifra', cifra: 'ataque', valor: 2 },
      { kind: 'cifra', cifra: 'danio', valor: 10, hasta: 20 },
    ]);
    expect(modificadoresDePieza(pieza('mandoble'))).toEqual([
      { kind: 'cifra', cifra: 'ataque', valor: 5 },
      { kind: 'cifra', cifra: 'danio', valor: 30, hasta: 60 },
      { kind: 'marca', marca: 'dosManos' },
    ]);
    expect(modificadoresDePieza(pieza('escudo'))).toEqual([
      { kind: 'cifra', cifra: 'defensa', valor: 4 },
      { kind: 'cifra', cifra: 'velocidad', valor: -1 },
    ]);
    // El orden de toda pieza del catálogo es el de `CIFRAS_DE_PIEZA`, sin repetir ni ceros.
    for (const p of PIEZAS_DEL_CATALOGO.values()) {
      const cifras = modificadoresDePieza(p).flatMap((m) => (m.kind === 'cifra' ? [m] : []));
      const orden = cifras.map((m) => CIFRAS_DE_PIEZA.indexOf(m.cifra));
      expect(orden, p.id).toEqual([...orden].sort((a, b) => a - b));
      expect(new Set(orden).size, p.id).toBe(orden.length);
      for (const m of cifras) expect(m.hasta ?? m.valor, p.id).not.toBe(0);
    }
    const nada = { ...pieza('rodela'), defensa: 0, velocidad: 0 };
    expect(modificadoresDePieza(nada)).toEqual([]);
    expect(cifrasDePieza(nada)).toBe('');
  });

  it('`textoDeModificador`: signo siempre (el menos tipográfico) y el daño como horquilla', () => {
    expect(textoDeModificador({ kind: 'cifra', cifra: 'ataque', valor: 2 })).toBe('+2 Ataque');
    expect(textoDeModificador({ kind: 'cifra', cifra: 'velocidad', valor: -2 })).toBe(
      '−2 Velocidad',
    );
    expect(textoDeModificador({ kind: 'cifra', cifra: 'danio', valor: 0, hasta: 20 })).toBe(
      '+0–20 Daño',
    );
    expect(textoDeModificador({ kind: 'cifra', cifra: 'danio', valor: 5, hasta: 5 })).toBe(
      '+5 Daño',
    );
    expect(textoDeModificador({ kind: 'marca', marca: 'dosManos' })).toBe('a dos manos');
  });

  it('`manosBlocker`: un escudo sobre un arma a dos manos y un arma a dos manos sobre un escudo', () => {
    expect(manosBlocker({ arma: 'mandoble' }, 'escudo')).toBe(
      'Escudo no se puede llevar con Mandoble: es un arma a dos manos y no deja mano para el escudo',
    );
    expect(manosBlocker({ escudo: 'rodela' }, 'baston')).toBe(
      'Bastón es un arma a dos manos y no se puede llevar con Rodela: quita antes el escudo',
    );
    // Una mano con escudo, sí; y cambiar el arma a dos manos por otra no mira
    // lo que se quita.
    expect(manosBlocker({ arma: 'espada' }, 'escudo')).toBeNull();
    expect(manosBlocker({ arma: 'mandoble' }, 'baston')).toBeNull();
    expect(manosBlocker({ arma: 'mandoble' }, 'maza')).toBeNull();
    // `ponerPieza` es la última puerta: lanza con el mismo motivo.
    expect(() => ponerPieza({ arma: 'mandoble' }, 'escudo')).toThrow(
      'no se puede poner Escudo: Escudo no se puede llevar con Mandoble',
    );
    expect(equipoBlocker({ arma: 'mandoble', escudo: 'paves' })).toMatch(
      /Mandoble es un arma a dos manos/,
    );
    expect(equipoBlocker({ arma: 'espada', escudo: 'paves' })).toBeNull();
    // Solo mira el arma de cuerpo a cuerpo (13-10-2026): el arco a la espalda y
    // la lanza de la carga dejan llevar escudo.
    const arena = EQUIPO_DEL_JUEGO;
    expect(arena.manosBlocker({ distancia: 'arco' }, 'paves')).toBeNull();
    expect(arena.manosBlocker({ escudo: 'paves' }, 'ballesta')).toBeNull();
    expect(arena.equipoBlocker({ arma: 'daga', distancia: 'arco', escudo: 'paves' })).toBeNull();
    expect(arena.equipoBlocker({ lanza: 'lanza_de_jinete', escudo: 'escudo' })).toBeNull();
    expect(arena.equipoBlocker({ arma: 'arco' })).toBe('Arco va en Arma a distancia, no en Arma');
  });

  it('el juego lo rechaza con su motivo: equipar un mandoble a quien lleva escudo y al revés', () => {
    const state = newGame({ seed: 7 });
    const hero = heroesOf(state, 0)[0]!;
    const c = ctx(7);
    // El héroe nace sin escudo: se le pone a mano, como haría la armería.
    hero.equipo = { ...hero.equipo, escudo: 'escudo' };
    hero.mochila = ['mandoble'];
    const equipar: AdventureAction = { type: 'equip', hero: hero.id, item: 'mandoble' };
    expect(equipBlocker(state, 0, equipar)).toBe(
      'Mandoble es un arma a dos manos y no se puede llevar con Escudo: quita antes el escudo',
    );
    expect(() => accion(state, equipar, c)).toThrow('no se puede equipar: Mandoble es un arma');
    expect(hero.mochila).toEqual(['mandoble']);
    // Sin el escudo, entra; y entonces el escudo es el que no.
    accion(state, { type: 'unequip', hero: hero.id, slot: 'escudo' }, c);
    accion(state, equipar, c);
    expect(hero.equipo.arma).toBe('mandoble');
    expect(equipBlocker(state, 0, { type: 'equip', hero: hero.id, item: 'escudo' })).toBe(
      'Escudo no se puede llevar con Mandoble: es un arma a dos manos y no deja mano para el escudo',
    );
  });
});

describe('las cifras se suman en las puertas de siempre (C1)', () => {
  it('un novato sin equipo sigue siendo la MISMA referencia del catálogo', () => {
    expect(cifrasDeUnidad(TROPA, undefined)).toBe(unidadDelJuego(TROPA));
    expect(cifrasDeUnidad(TROPA, hoja('v', 0))).toBe(unidadDelJuego(TROPA));
    expect(cifrasDeUnidad(TROPA, hoja('v', 0, { equipo: {} }))).toBe(unidadDelJuego(TROPA));
    expect(conEquipo(unidadDelJuego(TROPA), undefined)).toBe(unidadDelJuego(TROPA));
  });

  it('una pieza suma sus cifras, y la velocidad sube escalones sin pasarse del último', () => {
    // Lo propio sustituye a lo de serie en su hueco (la maza a la espada, el arnés
    // a la brigantina) y lo de serie que no se toca (el escudo) sigue puesto.
    const serie = unidadDelJuego(TROPA).equipo!;
    expect(serie.escudo).toBeDefined();
    const piquero = cifrasDeUnidad(
      TROPA,
      hoja('v', 0, { equipo: { arma: 'maza', armadura: 'arnes_de_placas' } }),
    );
    const cuerpo = desnudo(TROPA);
    const escudo = pieza(serie.escudo!);
    expect(piquero.attack).toBe(cuerpo.attack + pieza('maza').ataque + escudo.ataque);
    expect(piquero.defense).toBe(
      cuerpo.defense + pieza('arnes_de_placas').defensa + escudo.defensa,
    );
    expect(armaduraDe(piquero)).toBe(pieza('arnes_de_placas').armadura);
    expect(piquero.hp).toBe(cuerpo.hp);
    // Ninguna pieza del fichero suma velocidad: unas botas de prueba, en su
    // catálogo atado. El jinete ya va en el último escalón y no pasa de ahí.
    const botas = { ...pieza('gambeson'), id: 'botas', nombre: 'Botas', velocidad: 1 };
    const conBotas = equipoCon(new Map([...PIEZAS_DEL_CATALOGO, ['botas', botas]]));
    const i = SPEED_TIERS.indexOf(cuerpo.speed);
    expect(conBotas.conEquipo(cuerpo, { armadura: 'botas' }).speed).toBe(SPEED_TIERS[i + 1]);
    const jinete = desnudo(JINETE);
    expect(jinete.speed).toBe(SPEED_TIERS.at(-1));
    expect(conBotas.conEquipo(jinete, { armadura: 'botas' }).speed).toBe(SPEED_TIERS.at(-1));
  });

  it('`troopUnit` y lo que pisa el tablero dan lo mismo para un equipado', () => {
    const equipado: Troop = {
      creature: PESADA,
      veterania: hoja('v-1', 70, {
        equipo: { arma: 'espada', armadura: 'brigantina' },
      }),
    };
    const b = createBattle(
      { army: [{ ...equipado, count: 1 }], hero: null },
      { army: [{ creature: TROPA_BARATA, count: 1 }], hero: null },
      createRng(1),
    );
    expect(stackById(b, 'attacker-0').unit).toEqual(troopUnit(equipado, undefined));
    expect(armaduraDe(stackById(b, 'attacker-0').unit)).toBe(pieza('brigantina').armadura);
  });

  it('el cuerpo del héroe suma lo que lleva, y desnudo es el de antes', () => {
    const datos = { name: 'X', attack: 2, defense: 2, experience: umbral(5) };
    const desnudo = heroUnit({ ...datos, equipo: {} });
    const vestido = heroUnit({ ...datos, equipo: EQUIPO_BASE });
    // Espada +2 de ataque; gambesón +1 de defensa y 4 de armadura.
    expect(vestido.attack).toBe(desnudo.attack + 2);
    expect(vestido.defense).toBe(desnudo.defense + 1);
    expect(armaduraDe(vestido)).toBe(4);
    expect(vestido.hp).toBe(desnudo.hp);
  });
});

// ---------------------------------------------------------------- héroe

describe('el héroe nace equipado (decisión del usuario sobre el plan)', () => {
  it('el inicial, el contratado y el de `heroeRecienHecho` llevan el equipo base y la mochila vacía', () => {
    const state = newGame({ seed: 7 });
    for (const h of state.heroes) {
      expect(h.equipo).toEqual(EQUIPO_BASE);
      expect(h.mochila).toEqual([]);
    }
    const nuevo = heroeRecienHecho({
      id: 'h',
      owner: 0,
      name: 'H',
      faction: 'templarios',
      at: { x: 0, y: 0 },
      experience: umbral(5),
      tipo: 'caballero',
    });
    expect(nuevo.equipo).toEqual(EQUIPO_BASE);

    const base = baseOf(state, 0)!;
    state.heroes = state.heroes.filter((h) => h.owner !== 0);
    accion(state, { type: 'hire_hero', town: base.id }, ctx(7));
    const contratado = heroesOf(state, 0)[0]!;
    expect(contratado.equipo).toEqual(EQUIPO_BASE);
  });

  it('el veterano que asciende nace con el equipo base y sus piezas propias van a su mochila', () => {
    const state = newGame({ seed: 11 });
    const base = baseOf(state, 1)!;
    base.garrison = [
      ...base.garrison,
      {
        creature: NO_MUERTO,
        veterania: hoja('veterano-9', umbral(5), {
          equipo: { arma: 'maza', escudo: 'rodela' },
        }),
      },
    ];
    const nacido = ascenderVeterano(state, 1, 'veterano-9', {
      name: 'Hueso',
      story: 'Volvió.',
      heroType: tipoDeHeroePorDefecto(base.faction),
    });
    expect(nacido.equipo).toEqual(EQUIPO_BASE);
    expect(nacido.mochila).toEqual(['maza', 'rodela']);
  });
});

// ---------------------------------------------------------------- acciones

describe('equipar y desequipar (C1, C4)', () => {
  it('equipar a `creature` abre la hoja del primer novato: id del contador y experiencia 0', () => {
    const { state, c, hero } = enLaArmeria();
    hero.army = [{ creature: TROPA }, { creature: TROPA_BARATA }, { creature: TROPA_BARATA }];
    hero.mochila = ['maza'];
    const antes = state.siguienteVeterano;
    accion(state, { type: 'equip', hero: hero.id, item: 'maza', creature: TROPA_BARATA }, c);
    expect(hero.army[1]).toEqual({
      creature: TROPA_BARATA,
      veterania: {
        id: `veterano-${antes}`,
        experiencia: 0,
        batallas: 0,
        bajas: 0,
        heroes: [],
        equipo: { arma: 'maza' },
      },
    });
    expect(hero.army[2]).toEqual({ creature: TROPA_BARATA });
    expect(state.siguienteVeterano).toBe(antes + 1);
    expect(hero.mochila).toEqual([]);
    // Equipar es estado y no un hecho: la crónica no cuenta nada.
    expect(state.log.at(-1)?.kind).not.toBe('loot_found');
  });

  it('lo que ocupaba el hueco vuelve a la mochila, en el héroe y en un veterano', () => {
    const { state, c, hero } = enLaArmeria();
    // La pesada, que no lleva escudo de serie: el mandoble le entra.
    expect(unidadDelJuego(PESADA).equipo!.escudo).toBeUndefined();
    hero.army = [
      {
        creature: PESADA,
        veterania: hoja('veterano-1', 30, { equipo: { arma: 'maza' } }),
      },
    ];
    hero.mochila = ['daga', 'mandoble'];
    accion(state, { type: 'equip', hero: hero.id, item: 'daga' }, c);
    expect(hero.equipo.arma).toBe('daga');
    expect(hero.mochila).toEqual(['mandoble', 'espada']);
    accion(state, { type: 'equip', hero: hero.id, item: 'mandoble', veteran: 'veterano-1' }, c);
    expect(hero.army[0]!.veterania?.equipo).toEqual({ arma: 'mandoble' });
    expect(hero.mochila).toEqual(['espada', 'maza']);
    // Y conserva lo vivido: la hoja es la misma, con la pieza cambiada.
    expect(hero.army[0]!.veterania?.experiencia).toBe(30);

    // Quitarle su arma al veterano le deja la de serie de su unidad.
    accion(state, { type: 'unequip', hero: hero.id, slot: 'arma', veteran: 'veterano-1' }, c);
    expect(hero.army[0]!.veterania?.equipo).toEqual({});
    expect(unidadDelJuego(PESADA).equipo!.arma).toBeDefined();
    accion(state, { type: 'unequip', hero: hero.id, slot: 'armadura' }, c);
    expect(hero.equipo).toEqual({ arma: 'daga' });
    expect(hero.mochila).toEqual(['espada', 'maza', 'mandoble', 'gambeson']);
    // Al héroe no se le quita la suya: sin arma no se combate, que todo golpe
    // cuerpo a cuerpo va por la rueda con la del arma (19-10-2026). Se cambia.
    const antes = JSON.stringify({ equipo: hero.equipo, mochila: hero.mochila });
    expect(() => accion(state, { type: 'unequip', hero: hero.id, slot: 'arma' }, c)).toThrow(
      `${hero.name} se quedaría sin arma de cuerpo a cuerpo, y nadie pelea sin ella: cámbiala por otra en vez de quitarla`,
    );
    expect(JSON.stringify({ equipo: hero.equipo, mochila: hero.mochila })).toBe(antes);
  });

  it('"creature" pide un novato SIN HOJA, no uno sin piezas: lo que dice el contrato es lo que hace', () => {
    // Un piquero con hoja y sin nada puesto no es «de ese tipo sin id»: se le
    // nombra por su id. La prosa del contrato decía «que no lleve nada», y eso
    // es otra regla.
    const { state, c, hero } = enLaArmeria();
    hero.army = [{ creature: TROPA, veterania: hoja('veterano-1', 30) }];
    hero.mochila = ['maza'];
    expect(() =>
      accion(state, { type: 'equip', hero: hero.id, item: 'maza', creature: TROPA }, c),
    ).toThrow(
      // Por su id: `destinoDeEquipo` no lee el catálogo (un ciclo al cargar).
      new RegExp(`no lleva ninguna unidad «${TROPA}» sin id: .* se le nombra con "veteran"`),
    );
    expect(RESPONSE_FORMAT.adventure_turn).toContain('que todavía no tenga id');
  });

  it('los rechazos dicen por qué, y no tocan nada', () => {
    const { state, c, hero } = enLaArmeria();
    const tropa = unidadDelJuego(TROPA).name;
    hero.army = [
      {
        creature: TROPA,
        veterania: hoja('veterano-1', 30, { equipo: { arma: 'maza' } }),
      },
    ];
    hero.mochila = ['maza'];
    const foto = JSON.stringify({ heroes: state.heroes, siguiente: state.siguienteVeterano });
    const rechaza = (a: AdventureAction, frase: RegExp) =>
      expect(() => accion(state, a, c)).toThrow(frase);
    rechaza(
      { type: 'equip', hero: hero.id, item: 'arnes_de_placas' },
      /no lleva Arnés de placas en la mochila/,
    );
    rechaza(
      { type: 'equip', hero: hero.id, item: 'excalibur' },
      /no existe ninguna pieza "excalibur"/,
    );
    rechaza(
      { type: 'equip', hero: hero.id, item: 'maza', veteran: 'veterano-7' },
      /no lleva a nadie con el id "veterano-7"/,
    );
    rechaza(
      { type: 'equip', hero: hero.id, item: 'maza', creature: TROPA },
      new RegExp(`no lleva ninguna unidad «${TROPA}» sin id`),
    );
    // Sin ninguno de ese tipo, la frase no manda a buscar un id que no hay (M4).
    expect(() =>
      accion(state, { type: 'equip', hero: hero.id, item: 'maza', creature: JINETE }, c),
    ).toThrow(new RegExp(`no lleva ninguna unidad «${JINETE}» en su tropa$`));
    rechaza(
      {
        type: 'equip',
        hero: hero.id,
        item: 'maza',
        veteran: 'veterano-1',
        creature: TROPA,
      },
      /con "veteran" o con "creature", no con los dos/,
    );
    rechaza(
      { type: 'unequip', hero: hero.id, slot: 'armadura', veteran: 'veterano-1' },
      new RegExp(`esa unidad de ${tropa} no lleva nada en Armadura`),
    );
    rechaza({ type: 'equip', hero: heroesOf(state, 1)[0]!.id, item: 'maza' }, /no es de tu bando/);
    expect(JSON.stringify({ heroes: state.heroes, siguiente: state.siguienteVeterano })).toBe(foto);
  });

  it('licenciar devuelve a la mochila lo que llevaban, y se va antes el que lleva menos', () => {
    const { state, c, hero } = enLaArmeria();
    hero.army = [
      {
        creature: TROPA_BARATA,
        veterania: hoja('veterano-1', 0, { equipo: { arma: 'maza' } }),
      },
      { creature: TROPA_BARATA },
    ];
    accion(state, { type: 'dismiss', hero: hero.id, creature: TROPA_BARATA, count: 1 }, c);
    // Los dos sin experiencia: se va el desnudo, aunque el equipado sea el primero.
    expect(hero.army).toHaveLength(1);
    expect(hero.army[0]!.veterania?.id).toBe('veterano-1');
    expect(hero.mochila).toEqual([]);
    accion(state, { type: 'dismiss', hero: hero.id, creature: TROPA_BARATA, count: 1 }, c);
    expect(hero.army).toEqual([]);
    expect(hero.mochila).toEqual(['maza']);
  });
});

describe('la armería (C4)', () => {
  it('compra una pieza que se vende para la mochila del héroe que está dentro, y la cobra', () => {
    const { state, c, hero } = enLaArmeria();
    const base = baseOf(state, 0)!;
    const oro = state.players[0]!.resources.gold;
    accion(state, { type: 'buy_item', town: base.id, item: 'brigantina' }, c);
    expect(hero.mochila).toEqual(['brigantina']);
    expect(state.players[0]!.resources.gold).toBe(oro - pieza('brigantina').precio);
    expect(state.log.at(-1)).toMatchObject({
      kind: 'item_bought',
      hero: hero.id,
      item: 'brigantina',
      actor: 0,
    });
  });

  it('los motivos de no poder comprar: sin armería, sin héroe, pieza de botín, sin oro, pueblo ajeno', () => {
    const { state, hero } = enLaArmeria();
    const base = baseOf(state, 0)!;
    expect(buyBlocker(state, base, 'brigantina', 0)).toBeNull();
    expect(buyBlocker(state, base, 'paves', 0)).toBe('la armería no vende Pavés: cae como botín');
    expect(buyBlocker(state, base, 'nada', 0)).toMatch(/no existe ninguna pieza "nada"/);
    state.players[0]!.resources = { ...state.players[0]!.resources, gold: 10 };
    expect(buyBlocker(state, base, 'brigantina', 0)).toMatch(
      /Brigantina cuesta 700 oro y no te alcanza/,
    );
    expect(buyBlocker(state, base, 'brigantina', 1)).toMatch(/no es de tu bando/);
    hero.at = { x: 0, y: 0 };
    expect(buyBlocker(state, base, 'brigantina', 0)).toMatch(/no hay ningún héroe tuyo/);
    base.buildings.splice(base.buildings.indexOf('armory'), 1);
    expect(buyBlocker(state, base, 'brigantina', 0)).toMatch(
      /no tiene armería: constrúyela primero/,
    );
  });
});

// ---------------------------------------------------------------- botín

/** El héroe del 0 en la región del grupo más fuerte, con un paso a otra casilla de ella. */
function enRegionDeAsaltantes(seed: number) {
  const state = newGame({ seed });
  const c = ctx(seed);
  const grupo = [...state.raiders].sort((a, b) => b.troops.length - a.troops.length)[0]!;
  const region = regionDeCasilla(state.map, grupo.at);
  const libre = (p: Point): boolean =>
    isEnterable(state.map, p) &&
    regionDeCasilla(state.map, p) === region &&
    !tocaUnNodo(state.map, p) &&
    objectAt(state.map, p) === undefined &&
    !state.raiders.some((r) => pointKey(r.at) === pointKey(p)) &&
    !state.heroes.some((h) => pointKey(h.at) === pointKey(p));
  for (let y = 0; y < state.map.height; y++) {
    for (let x = 0; x < state.map.width; x++) {
      const desde = { x, y };
      if (!libre(desde)) continue;
      for (const [dx, dy] of VECINAS) {
        const hasta = { x: x + dx, y: y + dy };
        if (!libre(hasta)) continue;
        const hero = heroesOf(state, 0)[0]!;
        hero.at = desde;
        hero.movePoints = 5000;
        return { state, c, hero, grupo, hasta };
      }
    }
  }
  throw new Error(`la semilla ${seed} no deja dos casillas libres juntas en la región`);
}

describe('el botín (C3)', () => {
  it('repeler una emboscada deja una pieza en la mochila y un `loot_found` de asaltantes', () => {
    const { state, c, hero, hasta } = enRegionDeAsaltantes(11);
    hero.army = [];
    hero.equipo = {};
    accion(state, { type: 'move_hero', hero: hero.id, to: hasta }, c);
    const pending = state.pendingBattle!;
    expect(pending.attacker.kind).toBe('raider');
    // Se cierra a favor del héroe a mano: lo que se prueba es el reparto.
    for (const s of pending.battle.stacks) {
      if (s.side === 'attacker') {
        s.count = 0;
        s.topHp = 0;
      }
    }
    pending.battle.finished = { winner: 'defender' };
    settleBattle(state, c);
    const botin = state.log.filter((e) => e.kind === 'loot_found');
    expect(botin).toHaveLength(1);
    expect(botin[0]).toMatchObject({ hero: hero.id, from: 'raider', actor: 0 });
    expect(heroById(state, hero.id).mochila).toEqual([(botin[0] as { item: string }).item]);
    expect(PIEZAS_DE_BOTIN.map((p) => p.id)).toContain((botin[0] as { item: string }).item);
  });

  it('vencer a un grupo atacándolo deja una pieza', () => {
    const { state, c, hero, grupo } = enRegionDeAsaltantes(11);
    hero.army = ejercito({ creature: PESADA, count: 6 });
    forzarBatalla(state, c, hero, grupo.at);
    expect(state.pendingBattle?.foe).toEqual({ kind: 'raider', raiderId: grupo.id });
    resolvePendingBattle(state, c);
    expect(state.log.filter((e) => e.kind === 'loot_found')).toMatchObject([
      { from: 'raider', hero: hero.id },
    ]);
    expect(hero.mochila).toHaveLength(1);
  });

  it('tomar una ciudad neutral guarnecida deja una pieza; una rival guarnecida, no', () => {
    const state = newGame({ seed: 7 });
    const c = ctx(7);
    const hero = heroesOf(state, 0)[0]!;
    hero.army = ejercito({ creature: PESADA, count: 6 });
    const neutral = state.towns.find((t) => t.owner === null && t.garrison.length > 0)!;
    forzarBatalla(state, c, hero, neutral.at);
    resolvePendingBattle(state, c);
    expect(neutral.owner).toBe(0);
    expect(state.log.filter((e) => e.kind === 'loot_found')).toMatchObject([
      { from: 'town', hero: hero.id },
    ]);

    // La base del rival, guarnecida y sin su héroe dentro: se toma, sin botín.
    const otro = newGame({ seed: 7 });
    const c2 = ctx(7);
    const mio = heroesOf(otro, 0)[0]!;
    mio.army = ejercito({ creature: PESADA, count: 6 });
    const suya = baseOf(otro, 1)!;
    heroesOf(otro, 1)[0]!.at = { x: 0, y: 0 };
    forzarBatalla(otro, c2, mio, suya.at);
    resolvePendingBattle(otro, c2);
    expect(suya.owner).toBe(0);
    expect(otro.log.some((e) => e.kind === 'loot_found')).toBe(false);
  });

  it('misma semilla, misma pieza; y el botín no se come tiradas de batalla', () => {
    const jugar = (conBotin: boolean) => {
      const state = newGame({ seed: 7 });
      const c = ctx(7);
      const hero = heroesOf(state, 0)[0]!;
      hero.army = ejercito({ creature: PESADA, count: 6 });
      const neutral = state.towns.find((t) => t.owner === null && t.garrison.length > 0)!;
      if (!conBotin) neutral.owner = 1;
      forzarBatalla(state, c, hero, neutral.at);
      resolvePendingBattle(state, c);
      return {
        item: state.log.find((e) => e.kind === 'loot_found'),
        // La siguiente tirada del rng de la partida: si el botín tirara de él,
        // aquí saldría otra.
        siguiente: c.rng.next(),
      };
    };
    const a = jugar(true);
    const b = jugar(true);
    expect(a.item).toEqual(b.item);
    expect(a.siguiente).toBe(jugar(false).siguiente);
  });
});

// ---------------------------------------------------------------- batalla

describe('el equipo vive en el individuo (C1)', () => {
  it('quien sobrevive vuelve con su equipo; quien muere lo pierde', () => {
    const state = newGame({ seed: 31 });
    const c = ctx(31);
    const hero = heroesOf(state, 0)[0]!;
    hero.army = [
      {
        creature: TROPA,
        veterania: hoja('veterano-1', 0, { equipo: { arma: 'maza' } }),
      },
      {
        creature: TROPA,
        veterania: hoja('veterano-2', 0, { equipo: { armadura: 'brigantina' } }),
      },
    ];
    ponerMonstruo(state, TROPA_BARATA, 1);
    forzarBatalla(state, c, hero);
    const b = state.pendingBattle!.battle;
    const muerto = stackById(b, 'attacker-1');
    muerto.count = 0;
    muerto.topHp = 0;
    for (const s of b.stacks) {
      if (s.side === 'defender') {
        s.count = 0;
        s.topHp = 0;
      }
    }
    b.finished = { winner: 'attacker' };
    settleBattle(state, c);
    const army = heroById(state, hero.id).army;
    expect(army).toHaveLength(1);
    expect(army[0]!.veterania).toMatchObject({
      id: 'veterano-1',
      batallas: 2,
      equipo: { arma: 'maza' },
    });
  });
});

// ---------------------------------------------------------------- IA

/**
 * Lo mejor de cada hueco para la IA (`valorDePieza`): con ello puesto, el héroe no
 * mejora con nada que se venda (el escudo no entra con el mandoble).
 */
const LO_MEJOR = {
  arma: 'mandoble',
  distancia: 'ballesta',
  lanza: 'lanza_de_jinete',
  armadura: 'barda',
} as const;

describe('la IA compra y equipa (C5)', () => {
  it('pone en la tropa lo de la mochila que mejora a alguien, y compra con tope por día', () => {
    const { state, c, hero } = enLaArmeria();
    // El sanador no lleva armadura de serie; la tropa barata, la brigantina.
    expect(unidadDelJuego(SANADOR).equipo!.armadura).toBeUndefined();
    hero.army = [{ creature: TROPA_BARATA }, { creature: SANADOR }];
    hero.mochila = ['jubon_de_arquero'];
    // El jubón no mejora al héroe (lleva el gambesón, que vale más: `valorDePieza`)
    // ni a la tropa barata (su brigantina de serie): va al único al que mejora.
    expect(valorDePieza(pieza('jubon_de_arquero'))).toBeLessThan(
      valorDePieza(pieza(hero.equipo.armadura!)),
    );
    expect(siguienteDeEquipo(state, 0)).toEqual({
      type: 'equip',
      hero: hero.id,
      item: 'jubon_de_arquero',
      creature: SANADOR,
    });
    for (let n = 0; n < 30; n++) {
      const a = siguienteDeEquipo(state, 0);
      if (a === null) break;
      accion(state, a, c);
    }
    expect(siguienteDeEquipo(state, 0)).toBeNull();
    // Con 20 000 de oro le sobra para comprarles a dos novatos, pero no más de
    // `COMPRAS_POR_HEROE_Y_DIA` en el día: sin tope compraba 18 al día (I2).
    const compradas = state.log.filter((e) => e.kind === 'item_bought');
    expect(compradas).toHaveLength(COMPRAS_POR_HEROE_Y_DIA);
    expect(state.players[0]!.resources.gold).toBeGreaterThanOrEqual(ORO_DE_SOBRA_PARA_NOVATOS);
  });

  it('a un novato solo le compra si le sobra mucho oro; al veterano, con lo que cuesta un héroe (I2)', () => {
    // Con 5 000 de oro: tras pagar queda más que un héroe (2 500) y menos que
    // `ORO_DE_SOBRA_PARA_NOVATOS`. La tropa de novatos no se lleva nada: muere
    // antes que nadie y la pieza con ella. El héroe ya lleva lo mejor de cada
    // hueco, para que no sea él quien compre.
    const { state, c, hero } = enLaArmeria();
    state.players[0]!.resources = { ...state.players[0]!.resources, gold: 5000 };
    hero.equipo = LO_MEJOR;
    hero.army = [{ creature: TROPA_BARATA }, { creature: TROPA }];
    expect(siguienteDeEquipo(state, 0)).toBeNull();

    // Un veterano de rango 2 —ha sobrevivido a una batalla— sí, y la pieza le
    // llega a él y no a otro.
    hero.army = [
      { creature: TROPA_BARATA },
      { creature: TROPA, veterania: hoja('veterano-1', umbral(2)) },
    ];
    const compra = siguienteDeEquipo(state, 0);
    expect(compra?.type).toBe('buy_item');
    accion(state, compra!, c);
    expect(siguienteDeEquipo(state, 0)).toEqual({
      type: 'equip',
      hero: hero.id,
      item: compra?.type === 'buy_item' ? compra.item : '',
      veteran: 'veterano-1',
    });

    // Y si quien la recibiría al repartir es un novato —uno de su mismo equipo de
    // serie y de más índice de poder que el veterano—, no se compra: comprarla
    // «para el veterano» y ponérsela al novato sería el mismo derroche por otra
    // puerta.
    hero.mochila = [];
    const veterano = { creature: TROPA_BARATA, veterania: hoja('veterano-2', umbral(2)) };
    expect(unidadDelJuego(TROPA_BARATA).equipo!).toEqual(unidadDelJuego(TROPA).equipo!);
    expect(indiceDePoder(cifrasDeUnidad(TROPA, undefined))).toBeGreaterThan(
      indiceDePoder(cifrasDeUnidad(veterano.creature, veterano.veterania)),
    );
    hero.army = [{ creature: TROPA }, veterano];
    expect(siguienteDeEquipo(state, 0)).toBeNull();
  });

  it('un personaje en la tropa no la tumba: se aparta antes de mirar su índice', () => {
    // Antes se calculaban las cifras de todos y después se filtraba, y las de un
    // personaje piden su perfil: sin `characters` a mano, `characterOf` lanzaba.
    const { state, hero } = enLaArmeria();
    hero.army = [{ creature: CHARACTER_BODY, member: 'aren' }, { creature: SANADOR }];
    hero.mochila = ['jubon_de_arquero'];
    expect(siguienteDeEquipo(state, 0)).toEqual({
      type: 'equip',
      hero: hero.id,
      item: 'jubon_de_arquero',
      creature: SANADOR,
    });
  });

  it('una pieza de botín mejora al héroe, y lo que se quita lo hereda la tropa', () => {
    const { state, c, hero } = enLaArmeria();
    state.players[0]!.resources = { ...state.players[0]!.resources, gold: 0 };
    // El sanador pega con el bastón de serie, que vale menos que la Espada.
    hero.army = [{ creature: SANADOR }];
    expect(valorDePieza(pieza(unidadDelJuego(SANADOR).equipo!.arma!))).toBeLessThan(
      valorDePieza(pieza('espada')),
    );
    hero.mochila = ['maza'];
    accion(state, siguienteDeEquipo(state, 0)!, c);
    expect(hero.equipo.arma).toBe('maza');
    expect(siguienteDeEquipo(state, 0)).toMatchObject({
      item: 'espada',
      creature: SANADOR,
    });
  });
});

describe('la mochila se escribe en un sitio (M2)', () => {
  it('fuera de `aLaMochila` nadie le añade nada en `core`: solo se saca con `sacarDeLaMochila`', () => {
    // El docstring de `aLaMochila` y CLAUDE.md la llamaban «la única escritura
    // que añade» mientras `repartirBotin` añadía por su cuenta. Se mira el texto
    // porque es una frase sobre DÓNDE se escribe, no sobre qué resulta.
    const raiz = fileURLToPath(new URL('../src/core/', import.meta.url));
    const fuera: string[] = [];
    for (const f of readdirSync(raiz, { recursive: true }) as string[]) {
      if (!f.endsWith('.ts')) continue;
      readFileSync(`${raiz}${f}`, 'utf8')
        .split('\n')
        .forEach((linea, i) => {
          if (!/\.mochila\s*=[^=]/.test(linea)) return;
          if (linea.includes('= sacarDeLaMochila(')) return;
          if (
            linea.trim() === 'if (nuevas.length > 0) hero.mochila = [...hero.mochila, ...nuevas];'
          ) {
            return;
          }
          fuera.push(`${f}:${i + 1}: ${linea.trim()}`);
        });
    }
    expect(fuera).toEqual([]);
  });
});

describe('el fichero, por tipos y con bases (18-10-2026)', () => {
  /** El fichero como está escrito (con sus bases), con `cambiar` aplicado. */
  const con = (cambiar: (ps: Record<string, unknown>[]) => void) => {
    const roto = structuredClone({ piezas: EQUIPO_ESCRITO }) as unknown as {
      piezas: Record<string, unknown>[];
    };
    cambiar(roto.piezas);
    return () => leerEquipo(roto).piezas;
  };
  const id = (ps: Record<string, unknown>[], x: string) =>
    ps.find((p) => p.id === x) as Record<string, unknown>;

  it('una pieza cuesta solo oro y suma solo lo de su tipo; la rueda, solo en su arma', () => {
    expect(con(() => {})).not.toThrow();
    expect(con((ps) => (id(ps, 'espada').precio = { gold: 0, wood: 5 }))).toThrow(
      '"espada": el precio es lo que cuesta en oro, un entero ≥ 0, y es un objeto: escribe solo el número',
    );
    expect(con((ps) => (id(ps, 'espada').defensa = 1))).toThrow(
      '"espada" va en el hueco arma, que no suma defensa: en él una pieza suma ataque, daño',
    );
    expect(con((ps) => (id(ps, 'paves').ataque = 1))).toThrow(
      '"paves" va en el hueco escudo, que no suma ataque',
    );
    expect(con((ps) => (id(ps, 'arco').danio = [0, 0]))).not.toThrow();
    // La rueda (vuelta 2): toda arma de cuerpo a cuerpo de la arena dice sus seis
    // niveles, de 0 a 6, y ninguna otra pieza lleva rueda.
    const espadaDe = (ps: Record<string, unknown>[]) =>
      id(ps, 'espada') as { rueda: Record<string, unknown> };
    expect(con((ps) => (id(ps, 'brigantina').rueda = { ...pieza('espada').rueda }))).toThrow(
      '"brigantina" va en el hueco armadura y lleva rueda del golpe: solo un arma de cuerpo a cuerpo o de carga golpea en ella',
    );
    expect(con((ps) => (id(ps, 'arco').rueda = { ...pieza('espada').rueda }))).toThrow(
      '"arco" va en el hueco distancia y lleva rueda del golpe',
    );
    expect(con((ps) => delete id(ps, 'maza').rueda)).toThrow(
      '"maza" es un arma de cuerpo a cuerpo y no dice su rueda: un nivel de 0 a 6 en Ofensivo, Fuerte, Finta, Defensivo, Rápido, Romper guardia',
    );
    expect(con((ps) => delete id(ps, 'lanza_de_jinete').rueda)).toThrow(
      '"lanza_de_jinete" es un arma de cuerpo a cuerpo y no dice su rueda',
    );
    expect(con((ps) => (espadaDe(ps).rueda.fuerte = 7))).toThrow(
      '"espada": el nivel de Fuerte es 7: va de 0 a 6',
    );
    expect(con((ps) => (espadaDe(ps).rueda.finta = -1))).toThrow(
      '"espada": el nivel de Finta es -1: va de 0 a 6',
    );
    expect(con((ps) => (espadaDe(ps).rueda.rapido = 2.5))).toThrow(
      '"espada": el nivel de Rápido tiene que ser un entero de 0 a 6',
    );
    expect(con((ps) => delete espadaDe(ps).rueda.defensivo)).toThrow(
      '"espada": falta el nivel de Defensivo (de 0 a 6)',
    );
    expect(con((ps) => (espadaDe(ps).rueda.normal = 3))).toThrow(
      '"espada": Normal no tiene nivel: siempre ×1',
    );
    expect(con((ps) => (espadaDe(ps).rueda.patada = 3))).toThrow(
      '«patada» no es un tipo del anillo de la rueda',
    );
    // En los extras de una con base, niveles con signo; Normal tampoco.
    expect(con((ps) => (id(ps, 'espada_bendita').extras = { rueda: { normal: 1 } }))).toThrow(
      'Normal no tiene nivel: siempre ×1',
    );
  });

  it('el fichero resuelve sus bases: la Espada de herrería es la Espada con extras, y la bendita la de herrería', () => {
    const espada = pieza('espada');
    const herreria = pieza('espada_de_herreria');
    const bendita = pieza('espada_bendita');
    const oro = espada.precio;
    expect(herreria).toEqual({
      ...espada,
      id: 'espada_de_herreria',
      nombre: 'Espada de herrería',
      // De dónde se consigue es suyo, no de la base: la Espada se vende, esta cae.
      seConsigue: ['botin'],
      ataque: espada.ataque + 1,
      danio: [(espada.danio?.[0] ?? 0) + 5, (espada.danio?.[1] ?? 0) + 5],
      // Los extras de la rueda, en niveles: Fuerte y Rápido, uno más que la Espada.
      rueda: { ofensivo: 3, fuerte: 4, finta: 3, defensivo: 3, rapido: 4, romperGuardia: 3 },
      precio: oro + 150,
    });
    expect(bendita).toMatchObject({
      hueco: 'arma',
      seConsigue: ['botin'],
      ataque: espada.ataque + 2,
      danio: herreria.danio,
      rueda: { ofensivo: 4, fuerte: 4, finta: 3, defensivo: 4, rapido: 4, romperGuardia: 3 },
      precio: oro + 450,
    });
    // Escritas con su base.
    expect(EQUIPO_ESCRITO.find((p) => p.id === 'espada_bendita')).toEqual({
      id: 'espada_bendita',
      nombre: 'Espada bendita',
      base: 'espada_de_herreria',
      seConsigue: ['botin'],
      extras: { ataque: 1, rueda: { ofensivo: 1, defensivo: 1 }, oro: 300 },
    });
    // El orden del fichero, el del botín: lo nuevo, al final.
    expect(EQUIPO.slice(-3).map((p) => p.id)).toEqual([
      'maza',
      'espada_de_herreria',
      'espada_bendita',
    ]);
  });

  it('una base que no existe, de otro hueco o que da la vuelta tumba la carga diciéndolo', () => {
    expect(con((ps) => (id(ps, 'espada_de_herreria').base = 'sable'))).toThrow(
      '«Espada de herrería» toma de base «sable», que no existe',
    );
    // Sobre un escudo, la resuelta es un escudo con daño: lo dice su regla.
    expect(con((ps) => (id(ps, 'espada_de_herreria').base = 'paves'))).toThrow(
      '«Espada de herrería» (sobre «Pavés») va en el hueco escudo, que no suma ataque',
    );
    expect(
      con((ps) => {
        const espada = id(ps, 'espada');
        for (const k of Object.keys(espada)) if (!['id', 'nombre'].includes(k)) delete espada[k];
        espada.base = 'espada_bendita';
        espada.seConsigue = [];
        espada.extras = {};
      }),
    ).toThrow('sus bases dan la vuelta');
    expect(con((ps) => (id(ps, 'espada_de_herreria').hueco = 'arma'))).toThrow(
      'tiene base y escribe «hueco»',
    );
    // La resuelta tiene que valer: un extra que deja el daño en negativo.
    expect(
      con((ps) => ((id(ps, 'espada_de_herreria').extras as { danio: number[] }).danio = [-20, 0])),
    ).toThrow(
      '«Espada de herrería» (sobre «Espada»): danio tiene que ser [+mínimo, +máximo], dos enteros ≥ 0',
    );
  });
});
