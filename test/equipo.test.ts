/**
 * El equipo: cuatro huecos por individuo y por héroe (el escudo, desde el 12-10-2026), el catálogo en datos, el
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
} from '../src/core/ai/strategy.js';
import { createBattle, stackById } from '../src/core/battle/battle.js';
import { armaduraDe } from '../src/core/battle/damage.js';
import { RESPONSE_FORMAT } from '../src/core/contract/agent.js';
import {
  creature,
  cuentaTiros,
  EQUIPO,
  isShooter,
  piezaBlocker,
  problemasDePieza,
  validarEquipo,
} from '../src/core/data.js';
import {
  CIFRAS_DE_PIEZA,
  cifrasDePieza,
  conEquipo,
  EQUIPO_BASE,
  EQUIPO_DEL_JUEGO,
  equipoBlocker,
  equipoCon,
  manosBlocker,
  mismasCifras,
  modificadoresDePieza,
  PIEZAS_DE_ARMERIA,
  PIEZAS_DE_BOTIN,
  PIEZAS_DEL_CATALOGO,
  PIEZAS_DEL_JUEGO,
  pieza,
  ponerPieza,
  sumaDeEquipo,
  textoDeModificador,
} from '../src/core/hero/equipo.js';
import { cifrasDeCatalogo, umbral } from '../src/core/hero/experiencia.js';
import { heroeRecienHecho, heroUnit } from '../src/core/hero/hero.js';
import { troopUnit } from '../src/core/hero/troop.js';
import { isEnterable, objectAt, pointKey } from '../src/core/map/map.js';
import { VECINAS } from '../src/core/map/regiones.js';
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
import { HUECOS, type Point, SPEED_TIERS, type Troop, type Veterania } from '../src/core/types.js';
import { ejercito, forzarBatalla, ponerMonstruo } from './helpers.js';

const ctx = (seed: number): GameContext => ({ rng: createRng(seed) });

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
  it('cada hueco salvo el escudo tiene exactamente una pieza de armería, y el equipo base es esa', () => {
    for (const hueco of HUECOS.filter((h) => h !== 'escudo')) {
      const deArmeria = EQUIPO.filter((p) => p.hueco === hueco && p.calidad === 'armeria');
      expect(deArmeria).toHaveLength(1);
      expect(EQUIPO_BASE[hueco]).toBe(deArmeria[0]!.id);
    }
    expect(EQUIPO_BASE.escudo).toBeUndefined();
    // Lo que vende la armería, lo que cae como botín y lo de la arena no se
    // pisan, y entre los tres son el catálogo entero. Lo de la arena no cae nunca:
    // el sorteo del botín ve la misma lista de siempre, y el banco no se mueve.
    const venta = new Set(PIEZAS_DE_ARMERIA.map((p) => p.id));
    expect(PIEZAS_DE_BOTIN.some((p) => venta.has(p.id))).toBe(false);
    expect(PIEZAS_DE_BOTIN.every((p) => p.calidad === 'comun' || p.calidad === 'especial')).toBe(
      true,
    );
    const deLaArena = EQUIPO.filter((p) => p.calidad === 'arena');
    expect(deLaArena.length).toBeGreaterThan(0);
    expect(PIEZAS_DE_ARMERIA.length + PIEZAS_DE_BOTIN.length + deLaArena.length).toBe(
      EQUIPO.length,
    );
    expect(PIEZAS_DEL_JUEGO).toEqual([...EQUIPO.filter((p) => p.calidad !== 'arena')]);
    expect(PIEZAS_DE_BOTIN.some((p) => p.calidad === 'especial')).toBe(true);
    // Y van al final del fichero: lo de antes conserva su posición.
    const primera = EQUIPO.findIndex((p) => p.calidad === 'arena');
    expect(EQUIPO.slice(primera).every((p) => p.calidad === 'arena')).toBe(true);
  });

  it('el cargador muerde con las cifras nuevas: daño al revés, manos fuera del arma, escudo que no resta, armería en el escudo', () => {
    const bueno = { piezas: EQUIPO.map((p) => ({ ...p })) };
    const con = (cambiar: (ps: Record<string, unknown>[]) => void) => {
      const roto = structuredClone(bueno) as { piezas: Record<string, unknown>[] };
      cambiar(roto.piezas);
      return () => validarEquipo(roto);
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
    expect(con((ps) => (id(ps, 'anillo_de_cobre').hueco = 'distancia'))).toThrow(
      /"anillo_de_cobre" es de calidad comun y va en el hueco distancia, que es solo de la arena/,
    );
    expect(con((ps) => (id(ps, 'arco').calidad = 'especial'))).toThrow(
      /"arco" es de calidad especial y va en el hueco distancia, que es solo de la arena/,
    );
    expect(con((ps) => (id(ps, 'paves').calidad = 'armeria'))).toThrow(
      /el hueco escudo tiene 1 piezas de armería y no puede tener ninguna/,
    );
    // Un campo que no existe no se ignora callando (H2 de QA, 14-10-2026): un
    // `disparos` de antes de quitar la munición y una errata tumban la carga, y el
    // motivo nombra el fichero. Antes el juego los ignoraba y la arena lanzaba
    // después sin decir de dónde venían.
    expect(con((ps) => (id(ps, 'arco').disparos = 12))).toThrow(
      /^data\/equipo\.json: "arco": «disparos» no es un campo de una pieza; valen id, nombre,/,
    );
    expect(con((ps) => (id(ps, 'garrote').danyo = [1, 2]))).toThrow(
      /"garrote": «danyo» no es un campo de una pieza/,
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
      '"brigantina" va en el hueco armadura y dice manos: solo un arma se lleva a dos manos',
    ]);
    expect(piezaBlocker({ ...pieza('espada'), danio: [30, 10] })).toBe(
      '"espada": el daño mínimo que suma (30) pasa del máximo (10)',
    );
    expect(piezaBlocker(7)).toBe('la pieza no es un objeto');
    // Repetida es del catálogo entero: la dice el cargador, no la pieza.
    const dos = { piezas: [...EQUIPO, { ...pieza('garrote') }] };
    expect(() => validarEquipo(dos)).toThrow('"garrote" está repetida');
  });

  it('cada lectura atada resuelve de su catálogo; las sueltas, del juego', () => {
    const otra = new Map(PIEZAS_DEL_CATALOGO);
    otra.set('espada', { ...pieza('espada'), ataque: 50 });
    otra.set('garfio', { ...pieza('garrote'), id: 'garfio', nombre: 'Garfio', calidad: 'arena' });
    const eq = equipoCon(otra);
    expect(eq.pieza('espada').ataque).toBe(50);
    expect(pieza('espada').ataque).toBe(PIEZAS_DEL_CATALOGO.get('espada')?.ataque);
    expect(() => pieza('garfio')).toThrow('pieza de equipo desconocida: "garfio"');
    expect(eq.piezasPuestas({ arma: 'garfio' }).map((p) => p.nombre)).toEqual(['Garfio']);
    expect(eq.sumaDeEquipo({ arma: 'espada' }).ataque).toBe(50);
    expect(eq.conEquipo(creature('peasant'), { arma: 'espada' }).attack).toBe(
      creature('peasant').attack + 50,
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

  it('el cargador muerde: hueco inventado, cifra negativa, recurso desconocido y hueco sin armería', () => {
    const bueno = { piezas: EQUIPO.map((p) => ({ ...p })) };
    const roto = structuredClone(bueno) as { piezas: Record<string, unknown>[] };
    roto.piezas[0]!.hueco = 'casco';
    roto.piezas[1]!.ataque = -1;
    roto.piezas[2]!.precio = { oro: 800 };
    expect(() => validarEquipo(roto)).toThrow(/va en el hueco "casco", que no existe/);
    expect(() => validarEquipo(roto)).toThrow(/ataque tiene que ser un entero ≥ 0 y es -1/);
    expect(() => validarEquipo(roto)).toThrow(/cuesta "oro", que no es un recurso/);
    // La pieza 2 es la espada de armería: rota, el arma se queda sin ninguna.
    expect(() => validarEquipo(roto)).toThrow(/el hueco arma tiene 0 piezas de armería/);

    const dosEspadas = structuredClone(bueno) as { piezas: Record<string, unknown>[] };
    dosEspadas.piezas[0]!.calidad = 'armeria';
    expect(() => validarEquipo(dosEspadas)).toThrow(/el hueco arma tiene 2 piezas de armería/);

    const calidadFalsa = structuredClone(bueno) as { piezas: Record<string, unknown>[] };
    calidadFalsa.piezas[0]!.calidad = 'legendaria';
    expect(() => validarEquipo(calidadFalsa)).toThrow(/calidad "legendaria", que no existe/);

    expect(validarEquipo(bueno)).toHaveLength(EQUIPO.length);
  });
});

// ---------------------------------------------------------------- cifras

describe('las piezas suman daño y tiros, el escudo resta velocidad y las dos manos no lo admiten (12-10-2026)', () => {
  it('`conEquipo` suma daño y tiros, y sin ellos no toca esos campos', () => {
    const campesino = creature('peasant');
    const conEspada = conEquipo(campesino, { arma: 'espada' });
    expect(conEspada.damage).toEqual([campesino.damage[0] + 10, campesino.damage[1] + 30]);
    expect(conEspada.attack).toBe(campesino.attack + 2);
    expect(conEspada.sinEquipo).toBe(campesino);
    expect(conEspada).not.toHaveProperty('shots');
    // Sin daño ni tiros que sumar, el objeto no gana esos campos.
    const conCota = conEquipo(campesino, { armadura: 'cota_de_malla' });
    expect(conCota.damage).toBe(campesino.damage);
    expect(conCota).not.toHaveProperty('shots');
    // Ni el de armas: solo la arena tiene algo en `distancia` o en `carga`.
    expect(conCota).not.toHaveProperty('armas');
    expect(conEspada).not.toHaveProperty('armas');
  });

  it('cada arma para lo suyo (13-10-2026): arriba, el cuerpo a cuerpo; en `armas`, el disparo y la carga', () => {
    const c = creature('peasant');
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
    expect(cuentaTiros(arquero)).toBe(false);
    // El golpe, el de arriba con la daga; el disparo, cuerpo + arco + jubón, sin la daga.
    expect(arquero.armas).toEqual({
      cuerpo: { arma: 'daga', attack: arquero.attack, damage: arquero.damage },
      distancia: {
        arma: 'arco',
        attack: c.attack + 2,
        damage: [c.damage[0] + 10, c.damage[1] + 20],
      },
    });
    expect(arquero.sinEquipo).toBe(c);
    // Sin arma de cuerpo a cuerpo, se pega con el cuerpo.
    const jinete = arena.conEquipo(c, { carga: 'lanza_de_jinete', armadura: 'barda' });
    expect(jinete.attack).toBe(c.attack);
    expect(jinete.damage).toEqual(c.damage);
    expect(jinete.armas).toEqual({
      cuerpo: { arma: null, attack: c.attack, damage: c.damage },
      carga: {
        arma: 'lanza_de_jinete',
        attack: c.attack + 7,
        damage: [c.damage[0] + 40, c.damage[1] + 80],
      },
    });
    // Vestir en dos veces da lo mismo que en una.
    const enDos = arena.conEquipo(conEquipo(c, { arma: 'daga', armadura: 'jubon_de_arquero' }), {
      distancia: 'arco',
    });
    expect(mismasCifras(enDos, arquero)).toBe(true);
    expect(enDos.sinEquipo).toBe(c);
    expect(enDos.equipo).toEqual(arquero.equipo);
    // La suma por hueco: el arco en `arma` (un kit de antes) suma como sumaba.
    expect(sumaDeEquipo({ arma: 'ballesta', armadura: 'gambeson' })).toEqual({
      ataque: 3,
      defensa: 1,
      pv: 0,
      armadura: 4,
      velocidad: 0,
      danio: [20, 40],
    });
    // Y con la ballesta en su hueco, su ataque y su daño son del disparo, no de arriba.
    expect(
      arena.sumaDeEquipo({ arma: 'daga', distancia: 'ballesta', armadura: 'gambeson' }),
    ).toEqual({
      ataque: 1,
      defensa: 1,
      pv: 0,
      armadura: 4,
      velocidad: 0,
      danio: [0, 10],
    });
  });

  it('el equipo del juego suma lo de siempre, sin la clave de las armas', () => {
    // Lo que el juego pone: el equipo base del héroe y cualquier pieza del juego.
    const piquero = creature('pikeman');
    const conBase = conEquipo(piquero, EQUIPO_BASE);
    expect(conBase).toStrictEqual({
      ...piquero,
      attack: piquero.attack + 3,
      defense: piquero.defense + 3,
      hp: piquero.hp,
      speed: piquero.speed,
      sinEquipo: piquero,
      equipo: EQUIPO_BASE,
    });
    for (const p of PIEZAS_DEL_JUEGO) {
      expect(conEquipo(piquero, { [p.hueco]: p.id }), p.id).not.toHaveProperty('armas');
    }
  });

  it('`mismasCifras` ve todo lo que suma una pieza: ninguna deja las cifras iguales', () => {
    // Un piquero medio, para que la velocidad tenga escalones a los dos lados.
    const u = creature('pikeman');
    expect(mismasCifras(u, u)).toBe(true);
    for (const p of EQUIPO) {
      expect(mismasCifras(u, conEquipo(u, { [p.hueco]: p.id })), p.id).toBe(false);
    }
  });

  it('el escudo baja un escalón y no pasa del primero', () => {
    const piquero = creature('pikeman');
    const i = SPEED_TIERS.indexOf(piquero.speed);
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
    const nada = { ...pieza('garrote'), ataque: 0 };
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
    expect(manosBlocker({ arma: 'mandoble' }, 'espada_de_armeria')).toBeNull();
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
    expect(arena.equipoBlocker({ carga: 'lanza_de_jinete', escudo: 'escudo' })).toBeNull();
    expect(arena.equipoBlocker({ arma: 'arco' })).toBe('Arco va en Arma a distancia, no en Arma');
  });

  it('el juego lo rechaza con su motivo: equipar un mandoble a quien lleva escudo y al revés', () => {
    const state = newGame({ seed: 7 });
    const hero = heroesOf(state, 0)[0]!;
    const c = ctx(7);
    // Nada del juego reparte escudos: se le ponen a mano, como haría un botín.
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
    expect(cifrasDeCatalogo('pikeman', undefined)).toBe(creature('pikeman'));
    expect(cifrasDeCatalogo('pikeman', hoja('v', 0))).toBe(creature('pikeman'));
    expect(cifrasDeCatalogo('pikeman', hoja('v', 0, { equipo: {} }))).toBe(creature('pikeman'));
    expect(conEquipo(creature('pikeman'), undefined)).toBe(creature('pikeman'));
  });

  it('una pieza suma sus cifras, y la velocidad sube escalones sin pasarse del último', () => {
    const piquero = cifrasDeCatalogo(
      'pikeman',
      hoja('v', 0, { equipo: { arma: 'estoque_ligero', armadura: 'coraza_bendita' } }),
    );
    const base = creature('pikeman');
    expect(piquero.attack).toBe(base.attack + 2);
    expect(piquero.defense).toBe(base.defense + 2);
    expect(piquero.hp).toBe(base.hp + 40);
    expect(base.speed).toBe('average');
    expect(piquero.speed).toBe('fast');
    // El campeón ya va en el último escalón: las botas no lo pasan de ahí.
    const campeon = cifrasDeCatalogo(
      'champion',
      hoja('w', 0, { equipo: { accesorio: 'botas_de_marcha' } }),
    );
    expect(campeon.speed).toBe('ultra_fast');
  });

  it('`troopUnit` y lo que pisa el tablero dan lo mismo para un equipado', () => {
    const equipado: Troop = {
      creature: 'swordsman',
      veterania: hoja('v-1', 70, {
        equipo: { arma: 'espada_de_armeria', accesorio: 'talisman_vital' },
      }),
    };
    const b = createBattle(
      { army: [{ ...equipado, count: 1 }], hero: null },
      { army: [{ creature: 'peasant', count: 1 }], hero: null },
      createRng(1),
    );
    expect(stackById(b, 'attacker-0').unit).toEqual(troopUnit(equipado, undefined));
    expect(stackById(b, 'attacker-0').unit.hp).toBe(creature('swordsman').hp + 50);
  });

  it('el cuerpo del héroe suma lo que lleva, y desnudo es el de antes', () => {
    const datos = { name: 'X', attack: 2, defense: 2, experience: umbral(5) };
    const desnudo = heroUnit({ ...datos, equipo: {} });
    const vestido = heroUnit({ ...datos, equipo: EQUIPO_BASE });
    // Espada +2, brazal +1/+1, cota +2.
    expect(vestido.attack).toBe(desnudo.attack + 3);
    expect(vestido.defense).toBe(desnudo.defense + 3);
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
      faction: 'knight',
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
        creature: 'skeleton',
        veterania: hoja('veterano-9', umbral(5), {
          equipo: { arma: 'garrote', accesorio: 'talisman_vital' },
        }),
      },
    ];
    const nacido = ascenderVeterano(state, 1, 'veterano-9', {
      name: 'Hueso',
      story: 'Volvió.',
      heroType: 'nigromante',
    });
    expect(nacido.equipo).toEqual(EQUIPO_BASE);
    expect(nacido.mochila).toEqual(['garrote', 'talisman_vital']);
  });
});

// ---------------------------------------------------------------- acciones

describe('equipar y desequipar (C1, C4)', () => {
  it('equipar a `creature` abre la hoja del primer novato: id del contador y experiencia 0', () => {
    const { state, c, hero } = enLaArmeria();
    hero.army = [{ creature: 'pikeman' }, { creature: 'peasant' }, { creature: 'peasant' }];
    hero.mochila = ['garrote'];
    const antes = state.siguienteVeterano;
    accion(state, { type: 'equip', hero: hero.id, item: 'garrote', creature: 'peasant' }, c);
    expect(hero.army[1]).toEqual({
      creature: 'peasant',
      veterania: {
        id: `veterano-${antes}`,
        experiencia: 0,
        batallas: 0,
        bajas: 0,
        heroes: [],
        equipo: { arma: 'garrote' },
      },
    });
    expect(hero.army[2]).toEqual({ creature: 'peasant' });
    expect(state.siguienteVeterano).toBe(antes + 1);
    expect(hero.mochila).toEqual([]);
    // Equipar es estado y no un hecho: la crónica no cuenta nada.
    expect(state.log.at(-1)?.kind).not.toBe('loot_found');
  });

  it('lo que ocupaba el hueco vuelve a la mochila, en el héroe y en un veterano', () => {
    const { state, c, hero } = enLaArmeria();
    hero.army = [
      { creature: 'pikeman', veterania: hoja('veterano-1', 30, { equipo: { arma: 'garrote' } }) },
    ];
    hero.mochila = ['estoque_ligero', 'hacha_de_lenador'];
    accion(state, { type: 'equip', hero: hero.id, item: 'estoque_ligero' }, c);
    expect(hero.equipo.arma).toBe('estoque_ligero');
    expect(hero.mochila).toEqual(['hacha_de_lenador', 'espada_de_armeria']);
    accion(
      state,
      { type: 'equip', hero: hero.id, item: 'hacha_de_lenador', veteran: 'veterano-1' },
      c,
    );
    expect(hero.army[0]!.veterania?.equipo).toEqual({ arma: 'hacha_de_lenador' });
    expect(hero.mochila).toEqual(['espada_de_armeria', 'garrote']);
    // Y conserva lo vivido: la hoja es la misma, con la pieza cambiada.
    expect(hero.army[0]!.veterania?.experiencia).toBe(30);

    accion(state, { type: 'unequip', hero: hero.id, slot: 'arma', veteran: 'veterano-1' }, c);
    expect(hero.army[0]!.veterania?.equipo).toEqual({});
    accion(state, { type: 'unequip', hero: hero.id, slot: 'accesorio' }, c);
    expect(hero.equipo).toEqual({ arma: 'estoque_ligero', armadura: 'cota_de_malla' });
    expect(hero.mochila).toEqual([
      'espada_de_armeria',
      'garrote',
      'hacha_de_lenador',
      'brazal_de_armeria',
    ]);
  });

  it('"creature" pide un novato SIN HOJA, no uno sin piezas: lo que dice el contrato es lo que hace', () => {
    // Un piquero con hoja y sin nada puesto no es «de ese tipo sin id»: se le
    // nombra por su id. La prosa del contrato decía «que no lleve nada», y eso
    // es otra regla.
    const { state, c, hero } = enLaArmeria();
    hero.army = [{ creature: 'pikeman', veterania: hoja('veterano-1', 30) }];
    hero.mochila = ['garrote'];
    expect(() =>
      accion(state, { type: 'equip', hero: hero.id, item: 'garrote', creature: 'pikeman' }, c),
    ).toThrow(/no lleva ninguna unidad de Piquero sin id: .* se le nombra con "veteran"/);
    expect(RESPONSE_FORMAT.adventure_turn).toContain('que todavía no tenga id');
  });

  it('los rechazos dicen por qué, y no tocan nada', () => {
    const { state, c, hero } = enLaArmeria();
    hero.army = [
      { creature: 'pikeman', veterania: hoja('veterano-1', 30, { equipo: { arma: 'garrote' } }) },
    ];
    hero.mochila = ['garrote'];
    const foto = JSON.stringify({ heroes: state.heroes, siguiente: state.siguienteVeterano });
    const rechaza = (a: AdventureAction, frase: RegExp) =>
      expect(() => accion(state, a, c)).toThrow(frase);
    rechaza(
      { type: 'equip', hero: hero.id, item: 'coraza_bendita' },
      /no lleva Coraza bendita en la mochila/,
    );
    rechaza(
      { type: 'equip', hero: hero.id, item: 'excalibur' },
      /no existe ninguna pieza "excalibur"/,
    );
    rechaza(
      { type: 'equip', hero: hero.id, item: 'garrote', veteran: 'veterano-7' },
      /no lleva a nadie con el id "veterano-7"/,
    );
    rechaza(
      { type: 'equip', hero: hero.id, item: 'garrote', creature: 'pikeman' },
      /no lleva ninguna unidad de Piquero sin id/,
    );
    // Sin ninguno de ese tipo, la frase no manda a buscar un id que no hay (M4).
    expect(() =>
      accion(state, { type: 'equip', hero: hero.id, item: 'garrote', creature: 'bone_dragon' }, c),
    ).toThrow(/no lleva ninguna unidad de Dragón óseo en su tropa$/);
    rechaza(
      { type: 'equip', hero: hero.id, item: 'garrote', veteran: 'veterano-1', creature: 'pikeman' },
      /con "veteran" o con "creature", no con los dos/,
    );
    rechaza(
      { type: 'unequip', hero: hero.id, slot: 'armadura', veteran: 'veterano-1' },
      /esa unidad de Piquero no lleva nada en Armadura/,
    );
    rechaza(
      { type: 'equip', hero: heroesOf(state, 1)[0]!.id, item: 'garrote' },
      /no es de tu bando/,
    );
    expect(JSON.stringify({ heroes: state.heroes, siguiente: state.siguienteVeterano })).toBe(foto);
  });

  it('licenciar devuelve a la mochila lo que llevaban, y se va antes el que lleva menos', () => {
    const { state, c, hero } = enLaArmeria();
    hero.army = [
      { creature: 'peasant', veterania: hoja('veterano-1', 0, { equipo: { arma: 'garrote' } }) },
      { creature: 'peasant' },
    ];
    accion(state, { type: 'dismiss', hero: hero.id, creature: 'peasant', count: 1 }, c);
    // Los dos sin experiencia: se va el desnudo, aunque el equipado sea el primero.
    expect(hero.army).toHaveLength(1);
    expect(hero.army[0]!.veterania?.id).toBe('veterano-1');
    expect(hero.mochila).toEqual([]);
    accion(state, { type: 'dismiss', hero: hero.id, creature: 'peasant', count: 1 }, c);
    expect(hero.army).toEqual([]);
    expect(hero.mochila).toEqual(['garrote']);
  });
});

describe('la armería (C4)', () => {
  it('compra una pieza de armería para la mochila del héroe que está dentro, y la cobra', () => {
    const { state, c, hero } = enLaArmeria();
    const base = baseOf(state, 0)!;
    const oro = state.players[0]!.resources.gold;
    accion(state, { type: 'buy_item', town: base.id, item: 'cota_de_malla' }, c);
    expect(hero.mochila).toEqual(['cota_de_malla']);
    expect(state.players[0]!.resources.gold).toBe(oro - (pieza('cota_de_malla').precio.gold ?? 0));
    expect(state.log.at(-1)).toMatchObject({
      kind: 'item_bought',
      hero: hero.id,
      item: 'cota_de_malla',
      actor: 0,
    });
  });

  it('los motivos de no poder comprar: sin armería, sin héroe, pieza de botín, sin oro, pueblo ajeno', () => {
    const { state, hero } = enLaArmeria();
    const base = baseOf(state, 0)!;
    expect(buyBlocker(state, base, 'cota_de_malla', 0)).toBeNull();
    expect(buyBlocker(state, base, 'talisman_vital', 0)).toMatch(
      /no vende Talismán vital: es especial y solo cae como botín/,
    );
    expect(buyBlocker(state, base, 'nada', 0)).toMatch(/no existe ninguna pieza "nada"/);
    state.players[0]!.resources = { ...state.players[0]!.resources, gold: 10 };
    expect(buyBlocker(state, base, 'cota_de_malla', 0)).toMatch(
      /Cota de malla cuesta 800 oro y no te alcanza/,
    );
    expect(buyBlocker(state, base, 'cota_de_malla', 1)).toMatch(/no es de tu bando/);
    hero.at = { x: 0, y: 0 };
    expect(buyBlocker(state, base, 'cota_de_malla', 0)).toMatch(/no hay ningún héroe tuyo/);
    base.buildings.splice(base.buildings.indexOf('armory'), 1);
    expect(buyBlocker(state, base, 'cota_de_malla', 0)).toMatch(
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
    expect(pieza((botin[0] as { item: string }).item).calidad).not.toBe('armeria');
  });

  it('vencer a un grupo atacándolo deja una pieza', () => {
    const { state, c, hero, grupo } = enRegionDeAsaltantes(11);
    hero.army = ejercito({ creature: 'paladin', count: 6 });
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
    hero.army = ejercito({ creature: 'paladin', count: 6 });
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
    mio.army = ejercito({ creature: 'paladin', count: 6 });
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
      hero.army = ejercito({ creature: 'paladin', count: 6 });
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
      { creature: 'pikeman', veterania: hoja('veterano-1', 0, { equipo: { arma: 'garrote' } }) },
      {
        creature: 'pikeman',
        veterania: hoja('veterano-2', 0, { equipo: { armadura: 'cota_de_malla' } }),
      },
    ];
    ponerMonstruo(state, 'peasant', 1);
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
      equipo: { arma: 'garrote' },
    });
  });
});

// ---------------------------------------------------------------- IA

describe('la IA compra y equipa (C5)', () => {
  it('pone en la tropa lo de la mochila que mejora a alguien, y compra con tope por día', () => {
    const { state, c, hero } = enLaArmeria();
    hero.army = [{ creature: 'peasant' }, { creature: 'swordsman' }];
    hero.mochila = ['garrote'];
    // El garrote no mejora al héroe (lleva la espada): va al de más nivel de la tropa.
    expect(siguienteDeEquipo(state, 0)).toEqual({
      type: 'equip',
      hero: hero.id,
      item: 'garrote',
      creature: 'swordsman',
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
    // Con 5 000 de oro: tras pagar 800 queda más que un héroe (2 500) y menos
    // que `ORO_DE_SOBRA_PARA_NOVATOS`. La tropa de novatos no se lleva nada:
    // muere antes que nadie y la pieza con ella.
    const { state, c, hero } = enLaArmeria();
    state.players[0]!.resources = { ...state.players[0]!.resources, gold: 5000 };
    hero.army = [{ creature: 'peasant' }, { creature: 'pikeman' }];
    expect(siguienteDeEquipo(state, 0)).toBeNull();

    // Un veterano de rango 2 —ha sobrevivido a una batalla— sí, y la pieza le
    // llega a él y no a otro.
    hero.army = [
      { creature: 'peasant' },
      { creature: 'pikeman', veterania: hoja('veterano-1', umbral(2)) },
    ];
    const compra = siguienteDeEquipo(state, 0);
    expect(compra).toMatchObject({ type: 'buy_item', item: 'espada_de_armeria' });
    accion(state, compra!, c);
    expect(siguienteDeEquipo(state, 0)).toEqual({
      type: 'equip',
      hero: hero.id,
      item: 'espada_de_armeria',
      veteran: 'veterano-1',
    });

    // Y si quien la recibiría al repartir es un novato —un espadachín, de más
    // índice de poder que un campesino veterano—, no se compra: comprarla «para
    // el veterano» y ponérsela al novato sería el mismo derroche por otra puerta.
    hero.mochila = [];
    hero.army = [
      { creature: 'swordsman' },
      { creature: 'peasant', veterania: hoja('veterano-2', umbral(2)) },
    ];
    expect(siguienteDeEquipo(state, 0)).toBeNull();
  });

  it('un personaje en la tropa no la tumba: se aparta antes de mirar su índice', () => {
    // Antes se calculaban las cifras de todos y después se filtraba, y las de un
    // personaje piden su perfil: sin `characters` a mano, `characterOf` lanzaba.
    const { state, hero } = enLaArmeria();
    hero.army = [{ creature: CHARACTER_BODY, member: 'aren' }, { creature: 'pikeman' }];
    hero.mochila = ['garrote'];
    expect(siguienteDeEquipo(state, 0)).toEqual({
      type: 'equip',
      hero: hero.id,
      item: 'garrote',
      creature: 'pikeman',
    });
  });

  it('una pieza especial mejora al héroe, y lo que se quita lo hereda la tropa', () => {
    const { state, c, hero } = enLaArmeria();
    state.players[0]!.resources = { ...state.players[0]!.resources, gold: 0 };
    hero.army = [{ creature: 'pikeman' }];
    hero.mochila = ['talisman_vital'];
    accion(state, siguienteDeEquipo(state, 0)!, c);
    expect(hero.equipo.accesorio).toBe('talisman_vital');
    expect(siguienteDeEquipo(state, 0)).toMatchObject({
      item: 'brazal_de_armeria',
      creature: 'pikeman',
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
