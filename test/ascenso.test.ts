/**
 * La tropa que se hace héroe (ciclo B de «la tropa crece»), en el núcleo y con
 * fixture a mano: la partida sola da un veterano de nivel 5 en su base 0,06
 * veces por partida, así que esperar a que salga sería no probarlo.
 *
 * Lo que se mira: quién cuenta como veterano en la base y quién no, que el
 * ascenso crea el héroe que dice el contrato y saca al individuo de donde
 * estaba, que cada negativa lanza con su frase sin tocar nada, y la regla de «no
 * volver a preguntar hasta que vuelva».
 */
import { describe, expect, it } from 'vitest';
import { tipoDeHeroePorDefecto, tiposDeHeroe, validarTiposDeHeroe } from '../src/core/data.js';
import { porPreguntar, problemaDeTipo } from '../src/core/hero/ascenso.js';
import { nivelDeHeroe, umbral } from '../src/core/hero/experiencia.js';
import { isEnterable, objectAt } from '../src/core/map/map.js';
import { createRng } from '../src/core/rng.js';
import { cronicaPara } from '../src/core/state/events.js';
import {
  applyAdventureAction,
  ascenderVeterano,
  ascensoBlocker,
  baseOf,
  type GameState,
  heroesOf,
  MAX_HEROES_PER_PLAYER,
  playerById,
  resolvePendingBattle,
  veteranosEnSuBase,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import type { Troop, Veterania } from '../src/core/types.js';
import { ponVeteranoEnLaBase } from '../tools/qa/veterano-en-la-base.js';

function hoja(id: string, nivel: number): Veterania {
  return { id, experiencia: umbral(nivel), batallas: 4, bajas: 6, heroes: ['Sir Otro'] };
}

/**
 * Una partida con el héroe del jugador 1 en su base y tres veteranos puestos a
 * mano: uno de nivel 5 en la guarnición, otro de nivel 5 en la tropa del héroe
 * y uno de nivel 4 en la guarnición, que NO cuenta.
 */
function conVeteranos(): { state: GameState; base: NonNullable<ReturnType<typeof baseOf>> } {
  const state = newGame({ seed: 7 });
  const base = baseOf(state, 1);
  if (base === null) throw new Error('el jugador 1 nace sin base');
  const [g0, g1, ...resto] = base.garrison;
  if (g0 === undefined || g1 === undefined) throw new Error('la base nace sin guarnición');
  base.garrison = [
    { ...g0, veterania: hoja('veterano-guarnicion', 5) },
    { ...g1, veterania: hoja('veterano-de-4', 4) },
    ...resto,
  ];
  const heroe = heroesOf(state, 1)[0];
  if (heroe === undefined) throw new Error('el jugador 1 nace sin héroe');
  heroe.at = base.at;
  const soldado: Troop = { creature: g0.creature, veterania: hoja('veterano-tropa', 5) };
  heroe.army = [...heroe.army.slice(0, 5), soldado];
  return { state, base };
}

describe('la tropa se hace héroe: quién puede', () => {
  it('cuenta los de nivel 5 de la guarnición y los de la tropa del héroe que está en la base', () => {
    const { state } = conVeteranos();
    const ids = veteranosEnSuBase(state, 1).map((v) => v.veterania.id);
    // La guarnición primero y luego la tropa: es el orden en que se pregunta.
    expect(ids).toEqual(['veterano-guarnicion', 'veterano-tropa']);
    const [enGuarnicion, enTropa] = veteranosEnSuBase(state, 1);
    expect(enGuarnicion?.heroe).toBeNull();
    expect(enTropa?.heroe).toBe(heroesOf(state, 1)[0]?.id);
    expect(enGuarnicion?.base).toBe(baseOf(state, 1));
    expect(enTropa?.base).toBe(baseOf(state, 1));
  });

  it('no cuenta al de nivel 4, al que está fuera de la base ni al de un castillo que no es la base', () => {
    const { state, base } = conVeteranos();
    // El héroe sale de la base: su veterano deja de contar.
    const heroe = heroesOf(state, 1)[0]!;
    heroe.at = { x: base.at.x + 1, y: base.at.y };
    // Y un veterano de nivel 5 en la guarnición de otra ciudad, aunque sea suya.
    const otra = state.towns.find((t) => t.id !== base.id)!;
    otra.owner = 1;
    otra.garrison = [{ creature: 'skeleton', veterania: hoja('veterano-lejos', 5) }];
    expect(veteranosEnSuBase(state, 1).map((v) => v.veterania.id)).toEqual(['veterano-guarnicion']);
    // Ni los del rival, aunque los tenga.
    expect(veteranosEnSuBase(state, 0)).toEqual([]);
  });
});

describe('la tropa se hace héroe: el ascenso', () => {
  it('crea el héroe del contrato y saca al individuo de la guarnición', () => {
    const { state, base } = conVeteranos();
    const antes = heroesOf(state, 1).length;
    const guarnicion = base.garrison.length;
    const delQueEstaba = heroesOf(state, 1)[0]!;
    const tropa = delQueEstaba.army.length;
    const criatura = base.garrison[0]!.creature;
    const heroe = ascenderVeterano(state, 1, 'veterano-guarnicion', {
      name: 'Ana la Paciente',
      story: 'Guardó la puerta cuatro inviernos.',
      heroType: 'vampiro',
    });

    expect(heroesOf(state, 1)).toHaveLength(antes + 1);
    expect(heroe.id).toBe('hero-veterano-guarnicion');
    expect(heroe.owner).toBe(1);
    expect(heroe.faction).toBe(playerById(state, 1).faction);
    expect(heroe.name).toBe('Ana la Paciente');
    // La experiencia del individuo, que es nivel 5 o más: una sola escala.
    expect(heroe.experience).toBe(umbral(5));
    expect(nivelDeHeroe(heroe)).toBeGreaterThanOrEqual(5);
    expect(heroe.army).toEqual([]);
    expect(heroe.movePoints).toBe(0);
    expect(heroe.tipo).toBe('vampiro');
    expect(heroe.origen).toEqual({
      creature: criatura,
      historia: 'Guardó la puerta cuatro inviernos.',
    });
    // Nace en la base: su casilla si está libre, la de al lado si no (aquí la
    // ocupa el héroe que ya estaba).
    const d = Math.max(Math.abs(heroe.at.x - base.at.x), Math.abs(heroe.at.y - base.at.y));
    expect(d).toBe(1);
    // El individuo ya no está en la guarnición, y nadie más se ha ido: lo que
    // falte de la guarnición lo ha recogido el héroe que ocupa la base, que es
    // la regla (`takeGarrison`). Cuántos caben depende de la tropa con la que
    // nace, y esa sale del `rng` después del mapa: contarlo con la semilla era
    // anclar el mapa de la semilla 7.
    expect(base.garrison.length + delQueEstaba.army.length).toBe(guarnicion - 1 + tropa);
    expect(base.garrison.some((t) => t.veterania?.id === 'veterano-guarnicion')).toBe(false);
    // La crónica lo cuenta, con su dueño y la casilla donde nace (detrás puede
    // ir el `garrison_taken` del que ocupa la base).
    const hecho = [...state.log].reverse().find((e) => e.kind === 'hero_promoted');
    expect(hecho).toMatchObject({
      kind: 'hero_promoted',
      hero: heroe.id,
      town: base.id,
      name: 'Ana la Paciente',
      actor: 1,
      at: heroe.at,
    });
    // Y le consta a su dueño por la niebla.
    expect(cronicaPara(state, 1, 5).some((e) => e.kind === 'hero_promoted')).toBe(true);
  });

  it('si el portador ocupa el castillo, nace al lado y el portador, que se queda sin tropa, recoge la guarnición', () => {
    // Antes este test fijaba lo contrario —«el portador puede quedarse sin
    // tropa» y «la guarnición no se toca»—, que era el agujero I1: el portador
    // vacío en la casilla del castillo es quien la defiende, solo.
    const { state, base } = conVeteranos();
    const portador = heroesOf(state, 1)[0]!;
    // Un portador con un único individuo, que es el veterano.
    portador.army = portador.army.filter((t) => t.veterania?.id === 'veterano-tropa');
    const guarnicion = base.garrison.length;
    const criatura = portador.army[0]!.creature;
    const heroe = ascenderVeterano(state, 1, 'veterano-tropa', {
      name: 'Bruno',
      story: 'Cargó el último.',
      heroType: 'lich',
    });
    expect(heroe.id).toBe('hero-veterano-tropa');
    expect(heroe.origen?.creature).toBe(criatura);
    // El portador está en la casilla del castillo: el nuevo, al lado y sin tropa.
    expect(heroe.at).not.toEqual(base.at);
    expect(heroe.army).toEqual([]);
    // El que defiende, el de la casilla, se lleva lo que le quepa de la guarnición.
    expect(portador.army.length).toBeGreaterThan(0);
    expect(portador.army.length + base.garrison.length).toBe(guarnicion);
    expect(portador.army.some((t) => t.veterania?.id === 'veterano-guarnicion')).toBe(true);
  });

  it('el día en que nace no se mueve: un `move_hero` suyo se rechaza por falta de puntos', () => {
    const { state, base } = conVeteranos();
    const heroe = ascenderVeterano(state, 1, 'veterano-guarnicion', {
      name: 'Quieta',
      story: 'Espera a mañana.',
      heroType: 'nigromante',
    });
    state.current = state.players.findIndex((p) => p.id === 1);
    // Una vecina pisable y libre: un paso, y ni para ese hay puntos.
    const desde = heroe.at;
    const vecina = [-1, 0, 1]
      .flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: desde.x + dx, y: desde.y + dy })))
      .find(
        (p) =>
          (p.x !== desde.x || p.y !== desde.y) &&
          (p.x !== base.at.x || p.y !== base.at.y) &&
          isEnterable(state.map, p) &&
          objectAt(state.map, p) === undefined &&
          !state.heroes.some((h) => h.at.x === p.x && h.at.y === p.y),
      );
    if (vecina === undefined) throw new Error('el héroe nacido no tiene ninguna vecina libre');
    expect(() =>
      applyAdventureAction(
        state,
        { type: 'move_hero', hero: heroe.id, to: vecina },
        { rng: createRng(1) },
        1,
      ),
    ).toThrow(/no quedan puntos de movimiento/);
    expect(heroe.at).toEqual(desde);
  });
});

/**
 * La sonda de QA (I1), hecha test: el héroe del jugador 0 llega junto a la base
 * del 1 con solo dos campesinos y entra. Con el héroe del dueño dentro, la ciudad
 * la defiende solo él con su tropa (regla del usuario); así que un nacido sin
 * tropa en la casilla del castillo dejaba la base indefensa esa misma noche.
 * Devuelve si la base sigue siendo del 1 y cuántos defendieron.
 */
function asaltoConDosCampesinos(
  seed: number,
  preparar: (state: GameState) => void,
): { aguanta: boolean; defensores: number } {
  const state = newGame({ seed });
  preparar(state);
  const base = baseOf(state, 1)!;
  const atacante = heroesOf(state, 0)[0]!;
  const libre = (p: { x: number; y: number }): boolean =>
    isEnterable(state.map, p) &&
    objectAt(state.map, p) === undefined &&
    !state.heroes.some((h) => h.at.x === p.x && h.at.y === p.y) &&
    !state.raiders.some((r) => r.at.x === p.x && r.at.y === p.y);
  const junto = [-1, 0, 1]
    .flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: base.at.x + dx, y: base.at.y + dy })))
    .find((p) => (p.x !== base.at.x || p.y !== base.at.y) && libre(p));
  if (junto === undefined) throw new Error(`semilla ${seed}: la base del 1 no tiene vecina libre`);
  atacante.at = junto;
  atacante.army = [{ creature: 'peasant' }, { creature: 'peasant' }];
  // Sin su equipo de serie: la sonda mide si la BASE aguanta a un asaltante
  // flojo, y con +3/+3 del equipo base el héroe solo ya toma la guarnición de
  // salida —que es una pregunta de equilibrio, no la de este test—.
  atacante.equipo = {};
  atacante.movePoints = 9000;
  state.current = state.players.findIndex((p) => p.id === 0);
  const c = { rng: createRng(seed) };
  applyAdventureAction(state, { type: 'move_hero', hero: atacante.id, to: base.at }, c, 0);
  const defensores =
    state.pendingBattle?.battle.stacks.filter((st) => st.side === 'defender').length ?? 0;
  if (state.pendingBattle !== null) resolvePendingBattle(state, c);
  return { aguanta: base.owner === 1, defensores };
}

describe('la tropa se hace héroe: la base no se queda sin defensa (I1)', () => {
  const ascender = (state: GameState): void => {
    const id = ponVeteranoEnLaBase(state, 1);
    ascenderVeterano(state, 1, id, { name: 'Nacida', story: 'Guardó.', heroType: 'nigromante' });
  };

  for (const seed of [11, 23]) {
    it(`semilla ${seed}: con ascenso la base aguanta a dos campesinos igual que sin él`, () => {
      const sin = asaltoConDosCampesinos(seed, () => {});
      const con = asaltoConDosCampesinos(seed, ascender);
      expect(sin.aguanta).toBe(true);
      expect(con.aguanta).toBe(sin.aguanta);
      // El nacido se lleva la guarnición: defiende con ella, no solo.
      expect(con.defensores).toBeGreaterThan(1);
    });
  }

  it('el nacido en la casilla del castillo recoge la guarnición, como el contratado', () => {
    const state = newGame({ seed: 11 });
    const base = baseOf(state, 1)!;
    const id = ponVeteranoEnLaBase(state, 1);
    const resto = base.garrison.length - 1;
    const heroe = ascenderVeterano(state, 1, id, {
      name: 'Nacida',
      story: 'Guardó.',
      heroType: 'nigromante',
    });
    expect(heroe.at).toEqual(base.at);
    expect(heroe.army.length).toBeGreaterThan(0);
    expect(heroe.army.length + base.garrison.length).toBe(resto);
    expect(state.log.some((e) => e.kind === 'garrison_taken' && e.hero === heroe.id)).toBe(true);
    // El hecho del ascenso va antes que el de recoger: primero nace.
    const kinds = state.log.slice(-2).map((e) => e.kind);
    expect(kinds).toEqual(['hero_promoted', 'garrison_taken']);
  });
});

describe('la tropa se hace héroe: las negativas no tocan nada', () => {
  it('un tipo de otra facción lanza nombrando los que valen', () => {
    const { state } = conVeteranos();
    const foto = JSON.stringify({ heroes: state.heroes, towns: state.towns, log: state.log });
    expect(() =>
      ascenderVeterano(state, 1, 'veterano-guarnicion', {
        name: 'X',
        story: 'Y',
        heroType: 'caballero',
      }),
    ).toThrow(
      /"caballero" no es un tipo de héroe de necromancer: valen nigromante, vampiro, lich, caballero_de_la_muerte/,
    );
    expect(JSON.stringify({ heroes: state.heroes, towns: state.towns, log: state.log })).toBe(foto);
  });

  it(`con ${MAX_HEROES_PER_PLAYER} de ${MAX_HEROES_PER_PLAYER} héroes lanza, y la tropa espera`, () => {
    const { state } = conVeteranos();
    const modelo = heroesOf(state, 1)[0]!;
    while (heroesOf(state, 1).length < MAX_HEROES_PER_PLAYER) {
      state.heroes.push({ ...modelo, id: `relleno-${state.heroes.length}`, at: { x: 0, y: 0 } });
    }
    expect(ascensoBlocker(state, 1, 'veterano-guarnicion', 'vampiro')).toBe(
      `ya tienes ${MAX_HEROES_PER_PLAYER} de ${MAX_HEROES_PER_PLAYER} héroes: el veterano espera en la base hasta que haya sitio`,
    );
    expect(() =>
      ascenderVeterano(state, 1, 'veterano-guarnicion', {
        name: 'X',
        story: 'Y',
        heroType: 'vampiro',
      }),
    ).toThrow(/espera en la base/);
    expect(veteranosEnSuBase(state, 1).map((v) => v.veterania.id)).toContain('veterano-guarnicion');
  });

  it('el mismo veterano no da dos héroes: el segundo intento ya no lo encuentra', () => {
    const { state } = conVeteranos();
    ascenderVeterano(state, 1, 'veterano-guarnicion', {
      name: 'Una',
      story: 'Vez.',
      heroType: 'vampiro',
    });
    const cuantos = state.heroes.length;
    expect(() =>
      ascenderVeterano(state, 1, 'veterano-guarnicion', {
        name: 'Dos',
        story: 'Veces.',
        heroType: 'vampiro',
      }),
    ).toThrow(/no está en tu base/);
    expect(state.heroes).toHaveLength(cuantos);
  });

  it('el de nivel 4 no se asciende aunque esté en la base', () => {
    const { state } = conVeteranos();
    expect(ascensoBlocker(state, 1, 'veterano-de-4', 'vampiro')).toMatch(
      /no está en tu base con nivel 5/,
    );
  });
});

describe('a quién se pregunta (`porPreguntar`)', () => {
  // Lo único que `porPreguntar` mira de un veterano es su id.
  const en = (...ids: string[]) => ids.map((id) => ({ veterania: { id } }));
  const ids = (vs: readonly { veterania: { id: string } }[]) => vs.map((v) => v.veterania.id);

  it('dos turnos seguidos en la base: se pregunta una vez', () => {
    const primera = porPreguntar(en('v1'), new Set());
    expect(ids(primera.preguntar)).toEqual(['v1']);
    const ya = new Set([...primera.recordar, ...ids(primera.preguntar)]);
    const segunda = porPreguntar(en('v1'), ya);
    expect(segunda.preguntar).toEqual([]);
    expect([...segunda.recordar]).toEqual(['v1']);
  });

  it('si un turno empieza sin él, se le olvida, y al volver se le pregunta otra vez', () => {
    const ya = new Set(['v1', 'v2']);
    const fuera = porPreguntar(en('v2'), ya);
    expect(fuera.preguntar).toEqual([]);
    expect([...fuera.recordar]).toEqual(['v2']);
    const vuelve = porPreguntar(en('v1', 'v2'), fuera.recordar);
    expect(ids(vuelve.preguntar)).toEqual(['v1']);
  });
});

describe('los tipos de héroe, en datos', () => {
  it('son los cuatro del cuaderno por facción, y el de por defecto es el primero', () => {
    expect(tiposDeHeroe('knight').map((t) => t.id)).toEqual([
      'caballero',
      'monje',
      'inquisidor',
      'gran_maestre',
    ]);
    expect(tiposDeHeroe('necromancer').map((t) => t.id)).toEqual([
      'nigromante',
      'vampiro',
      'lich',
      'caballero_de_la_muerte',
    ]);
    expect(tipoDeHeroePorDefecto('knight')).toBe('caballero');
    expect(tipoDeHeroePorDefecto('necromancer')).toBe('nigromante');
  });

  it('el héroe inicial y el contratado llevan el tipo por defecto de su facción', () => {
    const state = newGame({ seed: 3 });
    for (const h of state.heroes) {
      expect(h.tipo).toBe(tipoDeHeroePorDefecto(h.faction));
      expect(h.origen).toBeUndefined();
    }
    // Contratar: con oro y la base libre.
    const jugador = state.players[state.current]!;
    const base = baseOf(state, jugador.id)!;
    for (const h of heroesOf(state, jugador.id)) h.at = { x: 0, y: 0 };
    jugador.resources = { ...jugador.resources, gold: 10_000 };
    applyAdventureAction(
      state,
      { type: 'hire_hero', town: base.id },
      { rng: createRng(1) },
      jugador.id,
    );
    const contratado = heroesOf(state, jugador.id).at(-1)!;
    expect(contratado.tipo).toBe(tipoDeHeroePorDefecto(base.faction));
  });

  it('el cargador muerde: facción sin tipos, ids repetidos y facción que no existe', () => {
    expect(() =>
      validarTiposDeHeroe(
        {
          tipos: {
            knight: [],
            necromancer: [
              { id: 'a', nombre: 'A', descripcion: 'x' },
              { id: 'a', nombre: 'B', descripcion: 'y' },
            ],
            orcs: [{ id: 'orko', nombre: 'Orko', descripcion: 'z' }],
          },
        },
        ['knight', 'necromancer'],
      ),
    ).toThrow(
      /knight no tiene ningún tipo de héroe; necromancer repite los ids a; "orcs" no es ninguna facción del motor/,
    );
  });

  it('`problemaDeTipo` acepta los de la facción y rechaza los de la otra', () => {
    expect(problemaDeTipo('knight', 'monje')).toBeNull();
    expect(problemaDeTipo('knight', 'lich')).toMatch(/valen caballero, monje/);
  });
});

describe('el veterano del arnés de QA', () => {
  it('`ponVeteranoEnLaBase` deja un nivel 5 en la guarnición que el ascenso reconoce', () => {
    const state = newGame({ seed: 11 });
    const id = ponVeteranoEnLaBase(state, 1);
    expect(veteranosEnSuBase(state, 1).map((v) => v.veterania.id)).toEqual([id]);
    expect(ascensoBlocker(state, 1, id, tipoDeHeroePorDefecto('necromancer'))).toBeNull();
  });
});
