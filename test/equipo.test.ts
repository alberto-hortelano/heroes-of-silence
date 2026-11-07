/**
 * El equipo: cinco huecos por individuo y por héroe (una sola clase de piezas desde el 18-10-2026), el catálogo en datos, el
 * botín, la armería y lo que hace la IA con todo ello.
 *
 * Los tests salen de los criterios del plan (`docs/agents/2026-10-02-el-equipo/`)
 * con la corrección del usuario: el héroe NACE equipado con lo de armería, y el
 * catálogo distingue calidades.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolvePendingBattle } from '../src/core/ai/turn.js';
import { armaduraDe } from '../src/core/battle/armas.js';
import { createBattle, stackById } from '../src/core/battle/battle.js';
import {
  cifrasDeUnidad,
  equipoPuestoDe,
  UNIDADES,
  unidad,
  unidadDelJuego,
} from '../src/core/catalogo.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { RESPONSE_FORMAT } from '../src/core/contract/formato.js';
import {
  EQUIPO,
  EQUIPO_ESCRITO,
  leerEquipo,
  piezaBlocker,
  problemasDePieza,
} from '../src/core/equipo/pieza.js';
import {
  aDosManos,
  catalogoDeEquipo,
  conEquipo,
  destinoDeEquipo,
  EQUIPO_BASE,
  EQUIPO_DEL_JUEGO,
  equipoBaseBlocker,
  mismasCifras,
  PIEZAS_DE_ARMERIA,
  PIEZAS_DE_BOTIN,
  pedidoDeEquipo,
  pedidoDelPuesto,
  pieza,
  textoDeModificador,
} from '../src/core/hero/equipo.js';
import { umbral } from '../src/core/hero/experiencia.js';
import { heroeRecienHecho } from '../src/core/hero/hero.js';
import { tipoDeHeroePorDefecto } from '../src/core/hero/tipos-de-heroe.js';
import { troopUnit } from '../src/core/hero/troop.js';
import { isEnterable, objectAt, pointKey } from '../src/core/map/map.js';
import { regionDeCasilla, tocaUnNodo, VECINAS } from '../src/core/map/regiones.js';
import { createRng } from '../src/core/rng.js';
import { heroById, heroesOf } from '../src/core/state/consultas.js';
import {
  applyAdventureAction,
  ascenderVeterano,
  baseOf,
  equipBlocker,
  settleBattle,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import { dueñoDeLaCiudad, enUnNodo, guarnicionDeLaCiudad } from '../src/core/state/sitios.js';
import type { AdventureAction, GameContext, GameState } from '../src/core/state/tipos.js';
import {
  CIFRAS_DE_PIEZA,
  type Point,
  SPEED_TIERS,
  type Troop,
  type Veterania,
} from '../src/core/types.js';
import { cuerpoDeCombate } from '../src/core/unidad.js';
import { ctx, NO_MUERTO, PESADA, RAIZ, TROPA, TROPA_BARATA } from './comun.js';
import {
  darLaCiudad,
  ejercito,
  forzarBatalla,
  guarnecer,
  ponerMonstruo,
} from './partida-de-prueba.js';

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
  state.players[0]!.oro = 20000;
  return { state, c: ctx(seed), hero };
}

const accion = (state: GameState, a: AdventureAction, c: GameContext): void =>
  applyAdventureAction(state, a, c, 0);

// ---------------------------------------------------------------- catálogo

describe('el catálogo de equipo, en datos (C2)', () => {
  it('una sola clase de piezas (18-10-2026): la armería vende lo que dice `seConsigue`, el botín da lo suyo y el héroe nace con la Espada y el gambesón', () => {
    // Lo que vende la armería y lo que cae como botín salen de cada pieza, en el
    // orden del catálogo; la decisión del usuario: la armería, las que no van sobre
    // otra; el botín, las que van sobre otra (la maza y el pavés, a la armería desde
    // el 26-10-2026).
    expect(PIEZAS_DE_ARMERIA).toEqual(EQUIPO.filter((p) => p.seConsigue?.includes('armeria')));
    expect(PIEZAS_DE_BOTIN).toEqual(EQUIPO.filter((p) => p.seConsigue?.includes('botin')));
    const conBase = new Set(EQUIPO_ESCRITO.filter((p) => 'base' in p).map((p) => p.id));
    expect(PIEZAS_DE_BOTIN.map((p) => p.id).sort()).toEqual([...conBase].sort());
    // Solo en kits: la hiena de los jinetes de hiena (26-10-2026), la culebrina del
    // artillero (02-11-2026, decisión del usuario) y la Cota de malla (`armadura-2`,
    // que el usuario guardó desde la arena el 06-11-2026 sin «Se consigue»).
    const SOLO_EN_KITS = ['hiena_de_guerra', 'culebrina', 'armadura-2'];
    expect(PIEZAS_DE_ARMERIA.map((p) => p.id).sort()).toEqual(
      EQUIPO.filter((p) => !conBase.has(p.id) && !SOLO_EN_KITS.includes(p.id))
        .map((p) => p.id)
        .sort(),
    );
    // Toda pieza se vende o cae como botín, salvo las que solo van en los kits (el
    // precio, en su propia prueba, abajo).
    const enKits = EQUIPO.filter((p) => p.seConsigue.length === 0).map((p) => p.id);
    expect(enKits.sort()).toEqual([...SOLO_EN_KITS].sort());
    // El equipo base es el de `data/heroe.json`: la Espada y el gambesón, sin nada más.
    expect(EQUIPO_BASE).toEqual({ arma: 'espada', armadura: 'gambeson' });
    // Ninguna da PV: no es un campo de una pieza (lo dice el tipo, y el cargador).
    expect(EQUIPO.some((p) => 'pv' in p)).toBe(false);
    expect(CIFRAS_DE_PIEZA).not.toContain('pv');
  });

  it('el cargador muerde con las cifras nuevas: velocidad o daño de antes, sin peso, manos fuera del arma, PV, sin botín', () => {
    const bueno = { piezas: EQUIPO.map((p) => ({ ...p })) };
    const con = (cambiar: (ps: Record<string, unknown>[]) => void) => {
      const roto = structuredClone(bueno) as { piezas: Record<string, unknown>[] };
      cambiar(roto.piezas);
      return () => leerEquipo(roto).piezas;
    };
    const id = (ps: Record<string, unknown>[], x: string) =>
      ps.find((p) => p.id === x) as Record<string, unknown>;
    // Fuerza, agilidad y peso (25-10-2026): el daño y la velocidad de antes no valen,
    // y se dice qué escribir; toda pieza dice su peso.
    expect(con((ps) => (id(ps, 'espada').danio = [3, 1]))).toThrow(
      /"espada" dice daño: un arma suma fuerza \(«fuerza»\)/,
    );
    expect(con((ps) => (id(ps, 'escudo').velocidad = -1))).toThrow(
      /"escudo" dice velocidad: ninguna pieza resta movimiento, lo hace su peso/,
    );
    expect(con((ps) => delete id(ps, 'barda').peso)).toThrow(
      /"barda" no dice su peso: toda pieza pesa, un entero ≥ 0/,
    );
    expect(con((ps) => (id(ps, 'barda').peso = -1))).toThrow(/peso tiene que ser un entero ≥ 0/);
    expect(con((ps) => (id(ps, 'espada').fuerza = 1.5))).toThrow(
      /fuerza tiene que ser un entero ≥ 0/,
    );
    expect(con((ps) => (id(ps, 'escudo').fuerza = 3))).toThrow(
      /"escudo" va en el hueco escudo, que no suma fuerza/,
    );
    expect(con((ps) => (id(ps, 'brigantina').manos = 2))).toThrow(
      /"brigantina" va en el hueco armadura y dice manos/,
    );
    expect(con((ps) => (id(ps, 'mandoble').manos = 3))).toThrow(/manos es 1 o 2, y es 3/);
    expect(con((ps) => (id(ps, 'arco').manos = 2))).toThrow(
      /"arco" va en el hueco distancia y dice manos/,
    );
    // Solo un arma de cuerpo a cuerpo es una lanza (25-10-2026).
    expect(con((ps) => (id(ps, 'escudo').lanza = true))).toThrow(
      /"escudo" va en el hueco escudo y dice que es una lanza/,
    );
    // Nada da PV (18-10-2026): un `pv` tumba la carga diciéndolo, también a 0.
    expect(con((ps) => (id(ps, 'barda').pv = 0))).toThrow(
      /^data\/equipo\.json: "barda" suma PV: ninguna pieza da PV/,
    );
    // Ni accesorio ni calidad: son de antes, y no valen.
    expect(con((ps) => (id(ps, 'rodela').hueco = 'accesorio'))).toThrow(
      /"rodela" va en el hueco "accesorio", que no existe; valen arma, distancia, armadura, escudo, montura/,
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
  });

  it('lo que tira una pieza (02-11-2026): el tiro solo a distancia, la recarga y la agilidad con el fuego, las cargas con la granada', () => {
    // Las cuatro piezas nuevas valen tal cual.
    for (const id of ['pistola', 'arcabuz', 'culebrina', 'granada']) {
      expect(problemasDePieza({ ...pieza(id) }), id).toEqual([]);
    }
    const arcabuz = { ...pieza('arcabuz') };
    const granada = { ...pieza('granada') };
    // Fuera de distancia, ni tiro.
    expect(problemasDePieza({ ...pieza('espada'), tiro: 'fuego' })).toContain(
      '"espada" va en el hueco arma y dice tiro: solo una pieza a distancia tira',
    );
    expect(piezaBlocker({ ...arcabuz, tiro: 'rayo' })).toBe(
      '"arcabuz": tiro es fuego o granada, o no se escribe (un arco o una ballesta), y es rayo',
    );
    // El arma de fuego dice su recarga y su agilidad, dentro de sus rangos.
    const { recarga: _r, ...sinRecarga } = arcabuz;
    expect(piezaBlocker(sinRecarga)).toBe(
      '"arcabuz" es un arma de fuego y no dice su recarga: los turnos de 1 a 9 que pasa sin apuntar tras disparar',
    );
    expect(piezaBlocker({ ...arcabuz, recarga: 0 })).toBe(
      '"arcabuz": la recarga va de 1 a 9 turnos y es 0',
    );
    expect(piezaBlocker({ ...arcabuz, agilidad: 0 })).toBe(
      '"arcabuz": la agilidad de un arma de fuego va de 1 a 7 y es 0',
    );
    const { agilidad: _a, ...sinAgilidad } = arcabuz;
    expect(piezaBlocker(sinAgilidad)).toBe(
      '"arcabuz" es un arma de fuego y no dice su agilidad: un entero de 1 a 7, el de su horquilla [F, F × agilidad]',
    );
    // Un arco no lleva agilidad ni recarga; la granada, ni recarga, y dice sus cargas.
    expect(piezaBlocker({ ...pieza('arco'), agilidad: 3 })).toBe(
      '"arco" dice agilidad: a distancia solo la lleva un arma de fuego (tiro: fuego)',
    );
    expect(piezaBlocker({ ...pieza('arco'), recarga: 1 })).toBe(
      '"arco" dice recarga: solo un arma de fuego recarga',
    );
    expect(piezaBlocker({ ...granada, recarga: 1 })).toBe(
      '"granada" dice recarga: solo un arma de fuego recarga',
    );
    const { cargas: _c, ...sinCargas } = granada;
    expect(piezaBlocker(sinCargas)).toBe(
      '"granada" es una granada y no dice sus cargas: las que lleva a cada batalla, de 1 a 9',
    );
    expect(piezaBlocker({ ...arcabuz, cargas: 2 })).toBe(
      '"arcabuz" dice cargas: solo una granada se gasta',
    );
  });

  it('la regla de una pieza vive en un sitio: `problemasDePieza`, que lee el cargador y la arena', () => {
    // Editor de equipo (12-10-2026): extraída del bucle de `validarEquipo`, con el
    // mismo texto, para que la arena pregunte por una pieza suelta.
    const escudo = { ...pieza('escudo') };
    expect(problemasDePieza(escudo)).toEqual([]);
    expect(piezaBlocker(escudo)).toBeNull();
    expect(piezaBlocker({ ...escudo, velocidad: 0 })).toBe(
      '"escudo" dice velocidad: ninguna pieza resta movimiento, lo hace su peso («peso»)',
    );
    // Un escudo que no pesa vale: el peso es 0 o más.
    expect(piezaBlocker({ ...escudo, peso: 0 })).toBeNull();
    expect(problemasDePieza({ ...pieza('brigantina'), manos: 2, ataque: -1 })).toEqual([
      '"brigantina": ataque tiene que ser un entero ≥ 0 y es -1',
      '"brigantina" va en el hueco armadura, que no suma ataque: en él una pieza suma armadura, peso',
      '"brigantina" va en el hueco armadura y dice manos: solo un arma se lleva a dos manos',
    ]);
    expect(piezaBlocker({ ...pieza('espada'), danio: [30, 10] })).toBe(
      '"espada" dice daño: un arma suma fuerza («fuerza») y el daño sale de la fuerza y la agilidad',
    );
    expect(piezaBlocker(7)).toBe('la pieza no es un objeto');
    // Repetida es del catálogo entero: la dice el cargador, no la pieza.
    const dos = { piezas: [...EQUIPO, { ...pieza('maza') }] };
    expect(() => leerEquipo(dos).piezas).toThrow('"maza" está dos veces en el catálogo');
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

  it('`textoDeModificador`: signo siempre (el menos tipográfico), y el peso sin signo', () => {
    expect(textoDeModificador({ kind: 'cifra', cifra: 'ataque', valor: 2 })).toBe('+2 Ataque');
    expect(textoDeModificador({ kind: 'cifra', cifra: 'defensa', valor: -2 })).toBe('−2 Defensa');
    expect(textoDeModificador({ kind: 'cifra', cifra: 'fuerza', valor: 10 })).toBe('+10 Fuerza');
    expect(textoDeModificador({ kind: 'cifra', cifra: 'peso', valor: 4 })).toBe('Peso 4');
    expect(textoDeModificador({ kind: 'marca', marca: 'dosManos' })).toBe('a dos manos');
  });
});

describe('las cifras se suman en las puertas de siempre (C1)', () => {
  it('un novato sin equipo sigue siendo la MISMA referencia del catálogo', () => {
    expect(cifrasDeUnidad(TROPA, undefined)).toBe(unidadDelJuego(TROPA));
    expect(cifrasDeUnidad(TROPA, hoja('v', 0))).toBe(unidadDelJuego(TROPA));
    expect(cifrasDeUnidad(TROPA, hoja('v', 0, { equipo: {} }))).toBe(unidadDelJuego(TROPA));
    expect(conEquipo(unidadDelJuego(TROPA), undefined)).toBe(unidadDelJuego(TROPA));
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
      COMBATE_COMPLETO,
    );
    expect(stackById(b, 'attacker-0').unit).toEqual(troopUnit(equipado));
    expect(armaduraDe(stackById(b, 'attacker-0').unit)).toBe(pieza('brigantina').armadura);
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
    guarnecer(state, base, [
      ...guarnicionDeLaCiudad(state, base),
      {
        creature: NO_MUERTO,
        veterania: hoja('veterano-9', umbral(5), {
          equipo: { arma: 'maza', escudo: 'rodela' },
        }),
      },
    ]);
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

describe('cómo se nombra a un portador: `pedidoDeEquipo`, la inversa de `destinoDeEquipo` (tropa en escena)', () => {
  it('cada portador de un ejército mixto vuelve a sí mismo, o al primer novato de su tipo', () => {
    const { hero } = enLaArmeria();
    hero.army = [
      { creature: TROPA_BARATA },
      { creature: TROPA, veterania: hoja('veterano-1', 30) },
      { creature: TROPA_BARATA },
      { creature: TROPA },
    ];
    expect(pedidoDeEquipo(hero, { heroe: true })).toEqual({});
    expect(destinoDeEquipo(hero, {})).toEqual({ heroe: true });
    const esperado = [0, 1, 0, 3];
    for (const [indice, vuelve] of esperado.entries()) {
      const pedido = pedidoDeEquipo(hero, { indice });
      expect(destinoDeEquipo(hero, pedido), `el puesto ${indice}`).toEqual({ indice: vuelve });
    }
    expect(pedidoDeEquipo(hero, { indice: 1 })).toEqual({ veteran: 'veterano-1' });
    expect(pedidoDeEquipo(hero, { indice: 2 })).toEqual({ creature: TROPA_BARATA });
  });

  it('un puesto vacío lanza', () => {
    const { hero } = enLaArmeria();
    hero.army = [{ creature: TROPA_BARATA }];
    expect(() => pedidoDeEquipo(hero, { indice: 3 })).toThrow(
      'la tropa no tiene a nadie en el puesto 3',
    );
  });
});

describe('por su puesto: `pedidoDelPuesto`, la inversa exacta de `destinoDeEquipo` (QA de la tropa, H2)', () => {
  it('cada portador vuelve a sí mismo, también el tercer novato de un tipo', () => {
    const { hero } = enLaArmeria();
    hero.army = [
      { creature: TROPA_BARATA },
      { creature: TROPA, veterania: hoja('veterano-1', 30) },
      { creature: TROPA_BARATA },
      { creature: TROPA_BARATA },
    ];
    expect(destinoDeEquipo(hero, pedidoDelPuesto({ heroe: true }))).toEqual({ heroe: true });
    for (const indice of [0, 1, 2, 3]) {
      expect(destinoDeEquipo(hero, pedidoDelPuesto({ indice })), `el puesto ${indice}`).toEqual({
        indice,
      });
    }
  });

  it('un puesto que no hay, o el puesto con un nombre a la vez, no nombra a nadie y lo dice', () => {
    const { hero } = enLaArmeria();
    hero.army = [{ creature: TROPA_BARATA }];
    expect(destinoDeEquipo(hero, { puesto: 3 })).toEqual({
      motivo: `${hero.name} no lleva a nadie en el puesto 3 de su tropa`,
    });
    expect(destinoDeEquipo(hero, { puesto: 0.5 })).toEqual({
      motivo: `${hero.name} no lleva a nadie en el puesto 0.5 de su tropa`,
    });
    expect(destinoDeEquipo(hero, { puesto: 0, creature: TROPA_BARATA })).toEqual({
      motivo: 'di a quién se la pones por su puesto o por su nombre, no por los dos',
    });
  });

  it('`equip` y `unequip` por el puesto visten y desvisten a ese, no al primero de su tipo', () => {
    const { state, c, hero } = enLaArmeria();
    hero.army = [{ creature: TROPA_BARATA }, { creature: TROPA_BARATA }];
    hero.mochila = ['gambeson'];
    accion(state, { type: 'equip', hero: hero.id, item: 'gambeson', puesto: 1 }, c);
    expect(hero.army[0]).toEqual({ creature: TROPA_BARATA });
    expect(hero.army[1]!.veterania?.equipo).toEqual({ armadura: 'gambeson' });
    // Al primero, que no lleva nada suyo, no hay nada que quitarle.
    expect(() =>
      accion(state, { type: 'unequip', hero: hero.id, slot: 'armadura', puesto: 0 }, c),
    ).toThrow('no se puede desequipar:');
    accion(state, { type: 'unequip', hero: hero.id, slot: 'armadura', puesto: 1 }, c);
    expect(hero.army[1]!.veterania?.equipo).toEqual({});
    expect(hero.mochila).toEqual(['gambeson']);
  });
});

describe('la segunda mano de la tropa: la acción hace lo que dice la pregunta (QA de fuerza y agilidad, H1)', () => {
  // El botón «A la segunda mano» pregunta `ponerseBlocker` (lo que llevaría puesto,
  // con lo de serie), y la acción sacaba la pieza de la mochila y luego lanzaba,
  // porque ponía sobre lo suyo sin la daga de serie: la Espada se perdía.
  it('un arquero con su daga de serie se pone la Espada de segunda: la pregunta dice sí y la acción la pone', () => {
    const { state, c, hero } = enLaArmeria();
    // El goblin: el arquero elfo lleva la Espada de serie desde el 02-11-2026.
    const ARQUERO = 'goblin-arquero';
    const serie = unidadDelJuego(ARQUERO).equipo!;
    expect(serie.arma).toBe('daga');
    expect(serie.segunda).toBeUndefined();
    hero.army = [{ creature: ARQUERO }];
    hero.mochila = ['espada'];
    const segunda: AdventureAction = {
      type: 'equip',
      hero: hero.id,
      item: 'espada',
      creature: ARQUERO,
      hueco: 'segunda',
    };
    expect(equipBlocker(state, 0, segunda)).toBeNull();
    accion(state, segunda, c);
    expect(hero.mochila).toEqual([]);
    // Lo suyo es solo la segunda; la daga sigue de serie debajo y no va a la mochila.
    expect(hero.army[0]!.veterania?.equipo).toEqual({ segunda: 'espada' });
    expect(equipoPuestoDe(hero, { indice: 0 })).toMatchObject({ arma: 'daga', segunda: 'espada' });
  });
});

/**
 * Lo que mira la regla H4, elegido por lo que es y no por su id: la primera unidad
 * del catálogo que lleva escudo de serie, la primera arma a dos manos y otro escudo
 * que ponerle encima del suyo. Lanza si el catálogo no tiene alguno de los tres.
 */
function conEscudoDeSerie(): {
  readonly id: string;
  readonly deSerie: string;
  readonly dosManos: (typeof EQUIPO)[number];
  readonly otroEscudo: (typeof EQUIPO)[number];
} {
  const u = UNIDADES.find((x) => x.equipo.escudo !== undefined);
  const dosManos = EQUIPO.find((p) => p.hueco === 'arma' && aDosManos(p));
  const deSerie = u?.equipo.escudo;
  const otroEscudo = EQUIPO.find((p) => p.hueco === 'escudo' && p.id !== deSerie);
  if (
    u === undefined ||
    deSerie === undefined ||
    dosManos === undefined ||
    otroEscudo === undefined
  )
    throw new Error(
      'el catálogo no tiene unidad con escudo de serie, arma a dos manos y otro escudo',
    );
  return { id: u.id, deSerie, dosManos, otroEscudo };
}

describe('un arma a dos manos sobre un escudo de serie (QA de la tropa, H4)', () => {
  it('el motivo no pide quitar el escudo, que es de serie: tampoco con otro encima', () => {
    const { id, deSerie, dosManos, otroEscudo } = conEscudoDeSerie();
    const { state, c, hero } = enLaArmeria();
    hero.army = [{ creature: id }];
    hero.mochila = [dosManos.id, otroEscudo.id];
    const motivo = `esa unidad de ${unidadDelJuego(id).name} no admite ${dosManos.nombre}: es un arma a dos manos y su ${pieza(deSerie).nombre} es de serie, que no se quita`;
    const ponerla: AdventureAction = {
      type: 'equip',
      hero: hero.id,
      item: dosManos.id,
      creature: id,
    };
    expect(equipBlocker(state, 0, ponerla)).toBe(motivo);
    expect(() => accion(state, ponerla, c)).toThrow(`no se puede equipar: ${motivo}`);
    // Rechazada, no toca nada.
    expect(hero.mochila).toEqual([dosManos.id, otroEscudo.id]);
    expect(hero.army).toEqual([{ creature: id }]);
    // Con otro escudo suyo encima del de serie, igual: quitarlo deja el de serie.
    accion(state, { type: 'equip', hero: hero.id, item: otroEscudo.id, creature: id }, c);
    expect(equipoPuestoDe(hero, { indice: 0 }).escudo).toBe(otroEscudo.id);
    const veterano = hero.army[0]!.veterania!.id;
    expect(
      equipBlocker(state, 0, {
        type: 'equip',
        hero: hero.id,
        item: dosManos.id,
        veteran: veterano,
      }),
    ).toBe(motivo);
    // Al héroe, cuyo escudo es suyo, sí se le pide quitarlo: la regla de las manos de siempre.
    hero.equipo = { ...hero.equipo, escudo: otroEscudo.id };
    hero.mochila = [dosManos.id];
    expect(equipBlocker(state, 0, { type: 'equip', hero: hero.id, item: dosManos.id })).toBe(
      `${dosManos.nombre} es un arma a dos manos y no se puede llevar con ${otroEscudo.nombre}: quita antes el escudo`,
    );
  });
});

describe('la armería (C4)', () => {
  it('compra una pieza que se vende para la mochila del héroe que está dentro, y la cobra', () => {
    const { state, c, hero } = enLaArmeria();
    const base = baseOf(state, 0)!;
    const oro = state.players[0]!.oro;
    accion(state, { type: 'buy_item', town: base.id, item: 'brigantina' }, c);
    expect(hero.mochila).toEqual(['brigantina']);
    expect(state.players[0]!.oro).toBe(oro - pieza('brigantina').precio);
    expect(state.log.at(-1)).toMatchObject({
      kind: 'item_bought',
      hero: hero.id,
      item: 'brigantina',
      actor: 0,
    });
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
    // Una del muro, que se toma: desde las ciudades en su región (05-11-2026) las
    // neutrales del muro son las ciudades-puente, y la s7 no lleva ninguna; la
    // s12, dos.
    const state = newGame({ seed: 12 });
    const c = ctx(12);
    const hero = heroesOf(state, 0)[0]!;
    hero.army = ejercito({ creature: PESADA, count: 6 });
    const neutral = state.towns.find(
      (t) =>
        dueñoDeLaCiudad(state, t) === null &&
        enUnNodo(state, { kind: 'ciudad', town: t }) &&
        guarnicionDeLaCiudad(state, t).length > 0,
    )!;
    forzarBatalla(state, c, hero, neutral.at);
    resolvePendingBattle(state, c);
    expect(dueñoDeLaCiudad(state, neutral)).toBe(0);
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
    // Uno de guarnición: la de salida, tras la muralla de piedra (fase 2 del puesto
    // fronterizo), le gana a seis pesados, y el test es del botín.
    guarnecer(otro, suya, ejercito({ creature: TROPA_BARATA, count: 1 }));
    forzarBatalla(otro, c2, mio, suya.at);
    resolvePendingBattle(otro, c2);
    expect(dueñoDeLaCiudad(otro, suya)).toBe(0);
    expect(otro.log.some((e) => e.kind === 'loot_found')).toBe(false);
  });

  it('misma semilla, misma pieza; y el botín no se come tiradas de batalla', () => {
    const jugar = (conBotin: boolean) => {
      const state = newGame({ seed: 7 });
      const c = ctx(7);
      const hero = heroesOf(state, 0)[0]!;
      hero.army = ejercito({ creature: PESADA, count: 6 });
      const neutral = state.towns.find(
        (t) => dueñoDeLaCiudad(state, t) === null && guarnicionDeLaCiudad(state, t).length > 0,
      )!;
      // Del rival, ella y su guarnición (la tropa tiene su propio dueño, tarea 2).
      if (!conBotin) {
        darLaCiudad(state, neutral, 1);
        guarnecer(state, neutral, guarnicionDeLaCiudad(state, neutral), 1);
      }
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

describe('la mochila se escribe en un sitio (M2)', () => {
  it('fuera de `aLaMochila` nadie le añade nada en `core`: solo se saca con `sacarDeLaMochila`', () => {
    // El docstring de `aLaMochila` y CLAUDE.md la llamaban «la única escritura
    // que añade» mientras `repartirBotin` añadía por su cuenta. Se mira el texto
    // porque es una frase sobre DÓNDE se escribe, no sobre qué resulta.
    const raiz = join(RAIZ, 'src/core/');
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
      '"espada" va en el hueco arma, que no suma defensa: en él una pieza suma ataque, fuerza, peso',
    );
    expect(con((ps) => (id(ps, 'paves').ataque = 1))).toThrow(
      '"paves" va en el hueco escudo, que no suma ataque',
    );
    expect(con((ps) => (id(ps, 'arco').fuerza = 0))).not.toThrow();
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
    expect(con((ps) => delete id(ps, 'lanza').rueda)).toThrow(
      '"lanza" es un arma de cuerpo a cuerpo y no dice su rueda',
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
});

describe('la montura, aparte del jinete (26-10-2026)', () => {
  it('`problemasDePieza` dice lo que no vale de una montura y de lo que no lo es', () => {
    const silla = pieza('caballo_de_silla');
    expect(problemasDePieza(silla)).toEqual([]);
    expect(problemasDePieza({ ...pieza('espada'), agilidad: 3 })).toEqual([
      '"espada" va en el hueco arma, que no suma agilidad: en él una pieza suma ataque, fuerza, peso',
    ]);
    expect(problemasDePieza({ ...pieza('escudo'), guerra: true })).toEqual([
      '"escudo" va en el hueco escudo y dice que es de guerra: solo una montura lo es',
    ]);
    expect(problemasDePieza({ ...silla, guerra: false })).toEqual([
      '"caballo_de_silla": guerra es true o no se escribe, y es false',
    ]);
    const { agilidad: _ag, ...sinAgilidad } = silla;
    expect(problemasDePieza(sinAgilidad)).toEqual([
      '"caballo_de_silla" es una montura y no dice su agilidad: un entero de 2 a 7, de la que salen sus casillas',
    ]);
    expect(problemasDePieza({ ...silla, agilidad: 8 })).toEqual([
      '"caballo_de_silla": la agilidad de una montura va de 2 a 7 y es 8',
    ]);
    expect(problemasDePieza({ ...silla, fuerza: 0 })).toEqual([
      '"caballo_de_silla" es una montura de fuerza 0: tiene que cargar algo, un entero de 1 o más',
    ]);
    // Una montura no da ataque, defensa ni armadura: la regla de las cifras del hueco.
    expect(problemasDePieza({ ...silla, ataque: 2 })).toEqual([
      '"caballo_de_silla" va en el hueco montura, que no suma ataque: en él una pieza suma fuerza, agilidad, peso',
    ]);
  });
});
