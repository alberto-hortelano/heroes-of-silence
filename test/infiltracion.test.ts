/**
 * La infiltración, fase A (05-11-2026, `docs/agents/2026-11-05-infiltrados-y-robo/`): un grupo en que lleva el rasgo todo el mundo, héroe incluido, cruza las
 * barreras a un día entero por casilla.
 *
 * Escritos desde los criterios de aceptación de su `requisitos.md` (I1, I7, I8), no desde
 * el código: quién se infiltra y por qué no; lo que cuesta la barrera (el día
 * entero, también tras reclutar algo más lento); los datos (uno por facción, nunca
 * el tipo por defecto, y el validador que muerde con cada problema); la marcha de
 * varios días con su `march_cut` y la ruta que dice lo mismo; el rechazo con el día
 * empezado y el de quien no se infiltra; la muralla del recinto, que no se abre; y
 * lo de alrededor del parado en la barrera: los asaltantes no lo emboscan, un
 * héroe que no se infiltra no lo alcanza y uno que sí abre batalla, la renta no se
 * entera y la niebla es la de una barrera (la región más cercana, y su cuadrado sobre
 * lo explorado: rehecho al fusionar con la niebla por regiones, 05-11-2026).
 */

import { describe, expect, it } from 'vitest';
import { llegadaDeLaRuta } from '../src/client/partida/mapa/escena.js';
import { Session } from '../src/client/sesion/partida.js';
import { empezarElDia, heroeRecienHecho, maxMovePoints } from '../src/core/hero/hero.js';
import {
  infiltracionBlocker,
  precioDeLaBarrera,
  seInfiltra,
} from '../src/core/hero/infiltracion.js';
import { EXPERIENCIA_INICIAL_DE_HEROE } from '../src/core/hero/rango.js';
import {
  tipoDeHeroePorDefecto,
  tipoSeInfiltra,
  tiposDeHeroe,
  validarInfiltradores,
} from '../src/core/hero/tipos-de-heroe.js';
import { pointKey } from '../src/core/map/geometria.js';
import { barreraEn, isEnterable, objectAt, type PathStep } from '../src/core/map/map.js';
import { regionDescubierta, regionesQueDescubre } from '../src/core/map/niebla.js';
import { FUERA, MURO, pasosDelMapa } from '../src/core/map/recinto.js';
import { regionDeCasilla } from '../src/core/map/regiones.js';
import { NOMBRE_DE_BARRERA, type TerrainKind } from '../src/core/map/terrain.js';
import { emboscador } from '../src/core/state/asaltantes.js';
import { heroesOf } from '../src/core/state/consultas.js';
import { applyAdventureAction } from '../src/core/state/game.js';
import {
  barreraDeMañana,
  caminoHasta,
  pasosDeHoy,
  porQueNoLlega,
} from '../src/core/state/marcha.js';
import { rentaDelDia } from '../src/core/state/renta.js';
import { newGame } from '../src/core/state/setup.js';
import type { GameState } from '../src/core/state/tipos.js';
import { visibleNow } from '../src/core/state/vision.js';
import { FACTION_IDS, type FactionId, hasTrait, type Point } from '../src/core/types.js';
import { unidadDelJuego, unidadesDeFaccion } from '../src/core/unidad/catalogo.js';
import { primeraSemillaCon } from '../tools/comun/semillas.js';
import { ctx, JINETE, TROPA } from './comun.js';
import { conSuEquipo, ejercito, hastaSuSiguienteTurno } from './partida-de-prueba.js';

/**
 * Cómo se llama `TROPA` en el catálogo: se lee de él y no se escribe, que el
 * catálogo lo retoca la persona a mano (en `main`, «Guerrero con escudo» pasó a
 * «Guardia del temple», 02-11-2026).
 */
const NOMBRE_DE_TROPA = unidadDelJuego(TROPA).name;

/** Una unidad con el rasgo `infiltrarse` (de las que aprobó el usuario, I10). */
const GOBLIN = 'goblin-lancero';

/**
 * Una partida de orkos con el goblin, el tipo que se infiltra, y `count` goblins,
 * con el día empezado con ellos (`empezarElDia`).
 */
function partidaDelGoblin(seed: number, count = 3): GameState {
  const state = newGame({ seed, faccionDelJugador: 'orkos', tipoDelHeroe: 'goblin' });
  const hero = heroesOf(state, 0)[0]!;
  hero.army = ejercito({ creature: GOBLIN, count });
  empezarElDia(hero);
  state.raiders = [];
  return state;
}

/**
 * Una travesía de dos casillas de barrera en una fila: `antes` y `borde` se pisan,
 * `t1` y `t2` son barrera que se cruza, y `despues` se pisa al otro lado. Con
 * región a los dos lados, fuera de todo recinto, sin objetos ni héroes, y tal que
 * el camino del goblin de `antes` a `despues` va recto por las dos barreras (no
 * hay un rodeo más barato que dos días).
 */
interface Travesia {
  readonly antes: Point;
  readonly borde: Point;
  readonly t1: Point;
  readonly t2: Point;
  readonly despues: Point;
}

function travesiaEn(state: GameState): Travesia | undefined {
  const map = state.map;
  const hero = heroesOf(state, 0)[0]!;
  const rol = pasosDelMapa(map)?.rol;
  const libre = (x: number, y: number): boolean => {
    const p = { x, y };
    return (
      isEnterable(map, p) &&
      (rol?.[y * map.width + x] ?? FUERA) === FUERA &&
      objectAt(map, p) === undefined &&
      regionDeCasilla(map, p) >= 0 &&
      !state.heroes.some((h) => h.at.x === x && h.at.y === y)
    );
  };
  const desde = hero.at;
  for (let y = 3; y < map.height - 3; y++)
    for (let x = 2; x < map.width - 2; x++) {
      const t1 = { x, y };
      const t2 = { x: x + 1, y };
      if (!libre(x - 2, y) || !libre(x - 1, y) || !libre(x + 2, y)) continue;
      if (barreraEn(map, t1) === null || barreraEn(map, t2) === null) continue;
      hero.at = { x: x - 2, y };
      const c = caminoHasta(state, hero, { x: x + 2, y });
      const recto = c?.map((p) => pointKey(p.at)).join(' ');
      hero.at = desde;
      if (recto !== [x - 1, x, x + 1, x + 2].map((cx) => `${cx},${y}`).join(' ')) continue;
      return { antes: { x: x - 2, y }, borde: { x: x - 1, y }, t1, t2, despues: { x: x + 2, y } };
    }
  return undefined;
}

/**
 * La casilla que se pisa más cercana a `cerca` (a 3 o más), en una región, y que
 * ni ella ni sus ocho vecinas son de un recinto ni tienen objeto o héroe: la de la
 * bolsa de H4.
 */
function bolsaLejosDeTodo(state: GameState, cerca: Point): Point {
  const map = state.map;
  const rol = pasosDelMapa(map)?.rol;
  const limpia = (x: number, y: number): boolean => {
    const p = { x, y };
    return (
      (rol?.[y * map.width + x] ?? FUERA) === FUERA &&
      objectAt(map, p) === undefined &&
      !state.heroes.some((h) => h.at.x === x && h.at.y === y)
    );
  };
  let mejor: Point | undefined;
  let d = Number.POSITIVE_INFINITY;
  for (let y = 2; y < map.height - 2; y++)
    for (let x = 2; x < map.width - 2; x++) {
      const dd = Math.max(Math.abs(x - cerca.x), Math.abs(y - cerca.y));
      if (dd < 3 || dd >= d) continue;
      if (!isEnterable(map, { x, y }) || regionDeCasilla(map, { x, y }) < 0) continue;
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++)
        for (let dx = -1; dx <= 1 && ok; dx++) ok = limpia(x + dx, y + dy);
      if (!ok) continue;
      mejor = { x, y };
      d = dd;
    }
  if (mejor === undefined) throw new Error('ninguna casilla para la bolsa de H4');
  return mejor;
}

const { semilla: SEMILLA, caso: TRAVESIA } = primeraSemillaCon(
  'una travesía recta de dos casillas de barrera',
  (s) => travesiaEn(partidaDelGoblin(s)),
  1,
  20,
);

/** La partida de la travesía con el goblin en `donde` y el día recién empezado. */
function enLaTravesia(donde: Point): { state: GameState; hero: ReturnType<typeof heroesOf>[0] } {
  const state = partidaDelGoblin(SEMILLA);
  const hero = heroesOf(state, 0)[0]!;
  hero.at = donde;
  return { state, hero };
}

/** El día siguiente de la persona: los turnos de los demás pasan sin hacer nada. */
const amanecer = (state: GameState): void => hastaSuSiguienteTurno(state, ctx(1), 0);

const marchar = (state: GameState, hero: string, to: Point): void =>
  applyAdventureAction(state, { type: 'move_hero', hero, to }, ctx(1), 0);

/** El tipo de `f` que se infiltra (el primero, según `data/infiltradores.json`). */
function infiltradorDe(f: FactionId): string {
  const tipo = tiposDeHeroe(f).find((t) => tipoSeInfiltra(f, t.id));
  if (tipo === undefined) throw new Error(`${f} no tiene tipo que se infiltre`);
  return tipo.id;
}

describe('quién se infiltra', () => {
  it('el goblin con toda su tropa de goblins, sí; sin tropa, también', () => {
    const hero = {
      faction: 'orkos' as const,
      tipo: 'goblin',
      army: ejercito({ creature: GOBLIN, count: 3 }),
    };
    expect(infiltracionBlocker(hero)).toBeNull();
    expect(seInfiltra(hero)).toBe(true);
    expect(infiltracionBlocker({ ...hero, army: [] })).toBeNull();
  });

  it('basta uno sin el rasgo: lo nombra, una vez aunque sean varios', () => {
    const hero = {
      faction: 'orkos' as const,
      tipo: 'goblin',
      army: [
        ...ejercito({ creature: GOBLIN, count: 2 }),
        ...ejercito({ creature: TROPA, count: 2 }),
      ],
    };
    expect(infiltracionBlocker(hero)).toBe(`no se infiltra: no lo lleva ${NOMBRE_DE_TROPA}`);
    // El predicado del camino caliente dice lo mismo sin montar la frase.
    expect(seInfiltra(hero)).toBe(false);
  });

  it('el tipo que no se infiltra se nombra, con lo que tampoco lo lleva', () => {
    const caballero = { faction: 'templarios' as const, tipo: 'caballero', army: [] };
    expect(infiltracionBlocker(caballero)).toBe('no se infiltra: no lo lleva su tipo (Caballero)');
    expect(
      infiltracionBlocker({ ...caballero, army: ejercito({ creature: TROPA, count: 1 }) }),
    ).toBe(`no se infiltra: no lo llevan su tipo (Caballero) ni ${NOMBRE_DE_TROPA}`);
    expect(seInfiltra(caballero)).toBe(false);
  });
});

describe('lo que cuesta una barrera', () => {
  it('nada para quien no se infiltra; el día entero, la marcha con que lo empezó, para quien sí', () => {
    const state = partidaDelGoblin(SEMILLA);
    const hero = heroesOf(state, 0)[0]!;
    expect(hero.marchaDelDia).toBe(maxMovePoints(hero));
    expect(precioDeLaBarrera(hero)).toBe(hero.marchaDelDia);
    hero.army = ejercito({ creature: TROPA, count: 1 });
    expect(precioDeLaBarrera(hero)).toBeNull();
  });

  it('cambiar de tropa a media jornada no lo mueve: ni más lenta ni más rápida', () => {
    const state = partidaDelGoblin(SEMILLA, 0);
    const hero = heroesOf(state, 0)[0]!;
    const delDia = hero.marchaDelDia;
    // Un goblin a pie anda menos que el héroe solo: el máximo baja, el precio no.
    hero.army = ejercito({ creature: GOBLIN, count: 1 });
    expect(maxMovePoints(hero)).toBeLessThan(delDia);
    expect(precioDeLaBarrera(hero)).toBe(delDia);
    // Y al revés: el día empezado con el goblin, licenciarlo sube el máximo y no
    // el precio, que sigue siendo lo que tiene (aún no anduvo: puede entrar).
    empezarElDia(hero);
    const conElGoblin = hero.marchaDelDia;
    hero.army = [];
    expect(maxMovePoints(hero)).toBeGreaterThan(conElGoblin);
    expect(precioDeLaBarrera(hero)).toBe(conElGoblin);
    expect(hero.movePoints).toBe(conElGoblin);
  });

  it('el héroe recién hecho (el que nace de la tropa) nace sin movimiento y con su marcha: la barrera tiene precio', () => {
    const state = partidaDelGoblin(SEMILLA, 0);
    const recien = heroeRecienHecho({
      id: 'hero-recien',
      owner: 0,
      name: 'Recién',
      faction: 'orkos',
      at: TRAVESIA.borde,
      experience: EXPERIENCIA_INICIAL_DE_HEROE,
      tipo: 'goblin',
    });
    expect(recien.movePoints).toBe(0);
    expect(recien.marchaDelDia).toBe(maxMovePoints(recien));
    // Sin ella el Dijkstra lanzaría (un precio de 0 no es un precio): la ruta sale
    // y el día de hoy no da ni un paso.
    const ruta = caminoHasta(state, recien, TRAVESIA.t1) as PathStep[];
    expect(ruta.at(-1)?.cost).toBe(recien.marchaDelDia);
    expect(pasosDeHoy(ruta, recien)).toBe(0);
  });
});

describe('los datos', () => {
  it('cada facción tiene un tipo que se infiltra, ninguno el de por defecto, y una unidad que se recluta con el rasgo', () => {
    for (const f of FACTION_IDS) {
      expect(
        tiposDeHeroe(f).some((t) => tipoSeInfiltra(f, t.id)),
        f,
      ).toBe(true);
      expect(tipoSeInfiltra(f, tipoDeHeroePorDefecto(f)), f).toBe(false);
      expect(
        unidadesDeFaccion(f).some((u) => u.edificio !== null && hasTrait(u, 'infiltrarse')),
        f,
      ).toBe(true);
    }
  });

  it('el validador muerde con cada problema, todos a la vez', () => {
    const tipos = {
      templarios: tiposDeHeroe('templarios'),
      orkos: tiposDeHeroe('orkos'),
    } as Parameters<typeof validarInfiltradores>[1];
    const malo = {
      infiltradores: {
        templarios: ['inquisidor', 'inquisidor', 'goblin'],
        orkos: ['orko'],
        enanos: ['minero'],
      },
    };
    const error = (() => {
      try {
        validarInfiltradores(malo, tipos);
        return '';
      } catch (e) {
        return (e as Error).message;
      }
    })();
    expect(error).toContain('templarios repite el tipo inquisidor');
    expect(error).toContain('"goblin" no es ningún tipo de héroe de templarios');
    expect(error).toContain('orko es el tipo por defecto de orkos y no puede infiltrarse');
    expect(error).toContain('"enanos" no es ninguna facción del motor');
    expect(() =>
      validarInfiltradores({ infiltradores: { templarios: ['inquisidor'] } }, tipos),
    ).toThrow('la facción orkos no tiene ningún tipo que se infiltre');
  });
});

describe('cruzar barreras', () => {
  it('N casillas, N días: anda al borde, entra con el día entero, y la ruta dice lo mismo que la marcha', () => {
    const { state, hero } = enLaTravesia(TRAVESIA.antes);
    const destino = TRAVESIA.despues;
    const max = maxMovePoints(hero);

    // Día 1: la ruta lleva lo de hoy hasta el borde; la marcha anda eso y lo dice.
    const ruta = caminoHasta(state, hero, destino) as PathStep[];
    expect(ruta.map((p) => pointKey(p.at))).toEqual(
      [TRAVESIA.borde, TRAVESIA.t1, TRAVESIA.t2, destino].map(pointKey),
    );
    // Cada barrera cuesta el día entero, también la segunda.
    expect(ruta[2]!.cost - ruta[1]!.cost).toBe(max);
    expect(ruta[1]!.cost - ruta[0]!.cost).toBe(max);
    expect(pasosDeHoy(ruta, hero)).toBe(1);
    marchar(state, hero.id, destino);
    expect(hero.at).toEqual(TRAVESIA.borde);
    expect(state.log.at(-1)).toMatchObject({ kind: 'march_cut', hero: hero.id, faltan: 3 });

    // Día 2: entra en la primera y gasta el día entero.
    amanecer(state);
    marchar(state, hero.id, destino);
    expect(hero.at).toEqual(TRAVESIA.t1);
    expect(hero.movePoints).toBe(0);
    expect(state.log.at(-1)).toMatchObject({ kind: 'march_cut', faltan: 2 });

    // Día 3: la segunda.
    amanecer(state);
    marchar(state, hero.id, destino);
    expect(hero.at).toEqual(TRAVESIA.t2);
    expect(state.log.at(-1)).toMatchObject({ kind: 'march_cut', faltan: 1 });

    // Día 4: sale al otro lado y aún le queda día.
    amanecer(state);
    marchar(state, hero.id, destino);
    expect(hero.at).toEqual(destino);
    expect(hero.movePoints).toBeGreaterThan(0);
  });

  it('con el día empezado no entra, y el rechazo dice por qué', () => {
    const { state, hero } = enLaTravesia(TRAVESIA.borde);
    hero.movePoints -= 1;
    const { x, y } = TRAVESIA.t1;
    const barrera = NOMBRE_DE_BARRERA[barreraEn(state.map, TRAVESIA.t1)!];
    // Sin «no quedan puntos de movimiento», que con casi todo el día se leía al
    // revés (H2 de la vuelta 1 de QA).
    expect(() => marchar(state, hero.id, TRAVESIA.t1)).toThrow(
      `${hero.name} hoy no da ni un paso: (${x},${y}) es ${barrera} y cuesta el día entero de marcha (${hero.marchaDelDia}), y le quedan ${hero.movePoints}; se entra mañana`,
    );
    expect(hero.at).toEqual(TRAVESIA.borde);
  });

  it('la ruta dice por qué se para en el borde: la barrera de mañana (H2 de la vuelta 1 de QA)', () => {
    const { state, hero } = enLaTravesia(TRAVESIA.antes);
    const { x, y } = TRAVESIA.t1;
    const frase = `(${x},${y}) es ${NOMBRE_DE_BARRERA[barreraEn(state.map, TRAVESIA.t1)!]} y cuesta el día entero de marcha: se entra mañana`;
    const ruta = caminoHasta(state, hero, TRAVESIA.despues) as PathStep[];
    expect(barreraDeMañana(state.map, ruta, pasosDeHoy(ruta, hero))).toBe(frase);
    // Dentro, con el día recién empezado, paga la segunda y se para fuera, en lo
    // que se pisa: no hay barrera que decir.
    hero.at = TRAVESIA.t1;
    const dentro = caminoHasta(state, hero, TRAVESIA.despues) as PathStep[];
    expect(pasosDeHoy(dentro, hero)).toBe(1);
    expect(barreraDeMañana(state.map, dentro, 1)).toBeNull();
    // Ni la marcha que llega hoy.
    expect(barreraDeMañana(state.map, dentro, dentro.length)).toBeNull();
  });

  it('la barra de la persona lo dice al pasar el ratón: la sesión lo pone en la ruta', () => {
    const s = new Session(SEMILLA, 'orkos', 'goblin');
    const hero = s.selectedHero!;
    hero.army = ejercito({ creature: GOBLIN, count: 3 });
    empezarElDia(hero);
    s.state.raiders = [];
    hero.at = TRAVESIA.antes;
    const ruta = s.previewPath(TRAVESIA.despues);
    expect(ruta.map((p) => pointKey(p.at))).toEqual(
      [TRAVESIA.borde, TRAVESIA.t1, TRAVESIA.t2, TRAVESIA.despues].map(pointKey),
    );
    const { x, y } = TRAVESIA.t1;
    const barrera = NOMBRE_DE_BARRERA[barreraEn(s.state.map, TRAVESIA.t1)!];
    // Solo en el primer paso de otro día.
    expect(ruta.map((p) => p.barrera ?? null)).toEqual([
      null,
      `(${x},${y}) es ${barrera} y cuesta el día entero de marcha: se entra mañana`,
      null,
      null,
    ]);
    expect(llegadaDeLaRuta(ruta, null)).toBe(
      `hoy llegas a 1 de 4 pasos: dorado hoy, gris otro día; (${x},${y}) es ${barrera} y cuesta el día entero de marcha: se entra mañana`,
    );
  });

  it('el precio es la marcha con que empezó el día: tras recibir tropa más lenta y andar, no entra (H1 de /simplify)', () => {
    const state = partidaDelGoblin(SEMILLA, 0);
    const hero = heroesOf(state, 0)[0]!;
    hero.at = TRAVESIA.antes;
    // El día empieza con el goblin solo: su marcha es la de un héroe a pie solo.
    hastaSuSiguienteTurno(state, ctx(1), 0);
    const delDia = hero.movePoints;
    // Recibe un goblin con la coraza (id `barda`), más lento: el máximo de hoy
    // baja; lo que le queda, no. Con el catálogo de `main` del 05-11-2026, el
    // goblin a pie frena a la marcha menos de lo que cuesta el paso de `antes` a
    // `borde`, y la coraza lo deja muy por debajo de lo que le queda.
    hero.army = [conSuEquipo(GOBLIN, { armadura: 'barda' })];
    expect(maxMovePoints(hero)).toBeLessThan(delDia);
    marchar(state, hero.id, TRAVESIA.borde);
    expect(hero.at).toEqual(TRAVESIA.borde);
    // Lo que le queda aún pasa del máximo nuevo: con «el mayor de los dos» de
    // precio, la barrera costaba justo lo que le quedaba y entraba con el día
    // empezado, contra I7.
    expect(hero.movePoints).toBeGreaterThan(maxMovePoints(hero));
    expect(hero.movePoints).toBeLessThan(delDia);
    expect(() => marchar(state, hero.id, TRAVESIA.t1)).toThrow(/el día entero/);
    expect(hero.at).toEqual(TRAVESIA.borde);
  });

  it('quien no se infiltra no llega a la barrera, y se le dice quién no lo lleva', () => {
    const { state, hero } = enLaTravesia(TRAVESIA.borde);
    hero.army = ejercito({ creature: TROPA, count: 1 });
    expect(caminoHasta(state, hero, TRAVESIA.t1)).toBeNull();
    const motivo = porQueNoLlega(state, hero, TRAVESIA.t1);
    expect(motivo).toBe(
      `no hay camino hasta (${TRAVESIA.t1.x},${TRAVESIA.t1.y}) sin cruzar una barrera: solo la cruza un grupo que se infiltra, y no se infiltra: no lo lleva ${NOMBRE_DE_TROPA}`,
    );
    expect(() => marchar(state, hero.id, TRAVESIA.t1)).toThrow(motivo);
  });

  it('también a lo que se pisa tras una barrera: si infiltrándose llegaría, se dice por qué no se infiltra (H4)', () => {
    const { state, hero } = enLaTravesia(TRAVESIA.antes);
    // Una bolsa: lo de alrededor de `bolsa` pasa a montaña. El mapa generado no
    // tiene ninguna. Lejos de todo recinto, objeto y héroe: por la puerta de un
    // recinto se pasa aunque debajo haya barrera (con las ciudades en su región,
    // el `despues` de la travesía de s5 es el acceso de una puerta de la ciudad
    // rival), y un nodo se pisa aunque esté en la montaña.
    const bolsa = bolsaLejosDeTodo(state, TRAVESIA.antes);
    const terreno = [...state.map.terrain] as TerrainKind[];
    for (const dy of [-1, 0, 1])
      for (const dx of [-1, 0, 1])
        if (dx !== 0 || dy !== 0)
          terreno[(bolsa.y + dy) * state.map.width + bolsa.x + dx] = 'mountain';
    state.map = { ...state.map, terrain: terreno };
    expect(caminoHasta(state, hero, bolsa)).not.toBeNull();
    hero.army = ejercito({ creature: TROPA, count: 1 });
    expect(caminoHasta(state, hero, bolsa)).toBeNull();
    const { x, y } = bolsa;
    expect(porQueNoLlega(state, hero, bolsa)).toBe(
      `no hay camino hasta (${x},${y}) sin cruzar una barrera: solo la cruza un grupo que se infiltra, y no se infiltra: no lo lleva ${NOMBRE_DE_TROPA}`,
    );
  });

  it('la muralla del recinto de una ciudad no se abre, ni para quien se infiltra', () => {
    const state = partidaDelGoblin(SEMILLA);
    const hero = heroesOf(state, 0)[0]!;
    const rol = pasosDelMapa(state.map)?.rol;
    expect(rol).toBeDefined();
    const muro = rol!.indexOf(MURO);
    expect(muro).toBeGreaterThanOrEqual(0);
    const at = { x: muro % state.map.width, y: Math.floor(muro / state.map.width) };
    expect(seInfiltra(hero)).toBe(true);
    expect(barreraEn(state.map, at)).toBeNull();
    expect(caminoHasta(state, hero, at)).toBeNull();
  });
});

describe('parado en una barrera (I8)', () => {
  it('no lo embosca un grupo de la región de al lado, que sí lo emboscaría en ella', () => {
    const { state, hero } = enLaTravesia(TRAVESIA.t1);
    // Solo, para que el grupo le saque el margen; con el día de un héroe solo.
    hero.army = [];
    empezarElDia(hero);
    state.raiders = [
      { id: 'raider-x', at: TRAVESIA.despues, troops: [{ creature: JINETE, count: 6 }] },
    ];
    expect(emboscador(state, hero)).toBeNull();
    // La prueba de que el grupo le saca el margen: en su región, sí.
    hero.at = TRAVESIA.borde;
    const enSuRegion = { ...hero, at: TRAVESIA.despues };
    expect(emboscador(state, enSuRegion)).not.toBeNull();
    // Y la marcha entra en la barrera sin batalla.
    marchar(state, hero.id, TRAVESIA.t1);
    expect(hero.at).toEqual(TRAVESIA.t1);
    expect(state.pendingBattle).toBeNull();
  });

  it('un héroe rival que no se infiltra no llega; uno que sí abre batalla contra él', () => {
    const { state, hero } = enLaTravesia(TRAVESIA.t1);
    const rival = heroesOf(state, 1)[0]!;
    rival.at = TRAVESIA.borde;
    rival.army = [];
    empezarElDia(rival);
    state.current = 1;
    expect(caminoHasta(state, rival, hero.at)).toBeNull();
    expect(porQueNoLlega(state, rival, hero.at)).toMatch(/solo la cruza un grupo que se infiltra/);

    Object.assign(rival, { tipo: infiltradorDe(rival.faction) });
    expect(seInfiltra(rival)).toBe(true);
    applyAdventureAction(state, { type: 'move_hero', hero: rival.id, to: hero.at }, ctx(1), 1);
    expect(state.pendingBattle).not.toBeNull();
    expect(state.log.at(-1)).toMatchObject({
      kind: 'battle_started',
      foe: { kind: 'hero', heroId: hero.id },
    });
  });

  it('la renta no se entera, y la niebla es la de una casilla de barrera: descubre la región más cercana y mira su cuadrado', () => {
    // Rehecho al fusionar con la niebla por regiones de `main` (05-11-2026): lo que
    // se mira ahora es el cuadrado del héroe sobre lo explorado, y lo explorado va
    // por regiones enteras. Una casilla de barrera descubre la región que tiene más
    // cerca (`regionesQueDescubre`), la misma regla que para cualquier barrera: el
    // infiltrado no ve más que eso, ni la región del otro lado si aún no la pisó.
    const { state, hero } = enLaTravesia(TRAVESIA.borde);
    const renta = rentaDelDia(state, 0).total;
    marchar(state, hero.id, TRAVESIA.t1);
    expect(hero.at).toEqual(TRAVESIA.t1);
    expect(rentaDelDia(state, 0).total).toBe(renta);
    const { fog } = state.players[0]!;
    const regiones = regionesQueDescubre(state.map, TRAVESIA.t1);
    expect(regiones).toHaveLength(1);
    for (const k of regiones) expect(regionDescubierta(state.map, fog, k)).toBe(true);
    const mira = visibleNow(state, 0);
    expect(mira.has(TRAVESIA.t1)).toBe(true);
    for (const dy of [-1, 0, 1])
      for (const dx of [-1, 0, 1]) {
        const q = { x: TRAVESIA.t1.x + dx, y: TRAVESIA.t1.y + dy };
        expect(mira.has(q)).toBe(fog.has(q));
      }
  });
});
