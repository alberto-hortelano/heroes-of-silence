import { describe, expect, it } from 'vitest';
import { chooseBattleAction } from '../src/core/ai/tactics.js';
import {
  applyAction,
  type BattleMember,
  type BattleSide,
  createBattle,
  MAX_ROUNDS,
} from '../src/core/battle/battle.js';
import type { BattleState } from '../src/core/battle/types.js';
import { creature } from '../src/core/data.js';
import { createRng } from '../src/core/rng.js';
import {
  ATTRIBUTES,
  CHARACTER_BODY,
  type Character,
  type CharacterBuild,
  createCharacter,
  defaultBuild,
  PROFESSIONS,
  type Profession,
  RACES,
} from '../src/core/rpg/character.js';
import { combatProfile } from '../src/core/rpg/stats.js';
import { esPersonaje } from './helpers.js';

/**
 * Juega un duelo 1 contra 1 entero con la IA de reglas decidiendo por los dos
 * lados, con las casillas de salida de `CharacterTrial` (rama de archivo
 * `gpt-rpg`): (3,4) contra (7,4), que los deja a tiro en la primera ronda.
 *
 * El bucle es a mano y no `autoResolve` a propósito: así se ve que
 * `chooseBattleAction` decide por los DOS bandos, y el cierre por tope se
 * distingue del cierre por muerte. Es la única comprobación de «acabó sin tope»:
 * si salta cualquiera de los dos topes, lanza diciendo cuál.
 *
 * El tope NO es solo el de `MAX_ROUNDS`: un bucle de acciones que no avanza de
 * ronda también se colgaría, y ese lo corta el recuento de acciones.
 */
function duelo(atacante: BattleSide, defensor: BattleSide, semilla: number): BattleState {
  const rng = createRng(semilla);
  const batalla = createBattle(atacante, defensor, rng);
  batalla.stacks[0]!.hex = { col: 3, row: 4 };
  batalla.stacks[1]!.hex = { col: 7, row: 4 };
  for (let acciones = 0; batalla.finished === null; acciones++) {
    if (acciones > 1000) {
      throw new Error(`el duelo no termina: 1000 acciones y va por la ronda ${batalla.round}`);
    }
    applyAction(batalla, chooseBattleAction(batalla), rng);
  }
  if (batalla.round > MAX_ROUNDS) throw new Error('el duelo se cerró por el tope de rondas');
  return batalla;
}

const solo = (creature: string): BattleSide => ({
  army: [{ creature, count: 1 }],
  hero: null,
});

describe('duelo de individuos con el motor del núcleo', () => {
  it('un duelo 1 contra 1 se juega entero con la IA de reglas', () => {
    const batalla = duelo(solo('swordsman'), solo('zombie'), 91);
    // Uno de los dos cae: `duelo` ya lanzó si se cerró por tope.
    const vivos = batalla.stacks.filter((s) => s.count > 0);
    expect(vivos).toHaveLength(1);
    expect(vivos[0]!.side).toBe(batalla.finished!.winner);
    // Hubo golpes de verdad y no solo esperas.
    expect(batalla.log.some((e) => e.kind === 'attack')).toBe(true);
  });
});

// ---------------------------------------------------------------- creación

const con = (over: Partial<CharacterBuild['attributes']>): CharacterBuild => ({
  ...defaultBuild,
  attributes: { ...defaultBuild.attributes, ...over },
});

describe('crear un personaje', () => {
  it('el reparto por defecto crea un personaje sano de nivel 1', () => {
    const c = createCharacter('aren', defaultBuild);
    expect(c).toMatchObject({ id: 'aren', name: 'Aren', level: 1 });
    // Guardabosques: resistencia 11 sin bono → 10 + 2·11.
    expect(c.hp).toBe(32);
  });

  it('un reparto que no suma 18 lanza diciendo cuántos lleva', () => {
    // 10+12+11+10+12+13 → 20 puntos.
    expect(() => createCharacter('x', con({ voluntad: 13 }))).toThrow(
      /reparte exactamente 18 puntos: llevas 20/,
    );
  });

  it('un atributo por encima de 16 o por debajo de 8 lanza nombrándolo', () => {
    expect(() =>
      createCharacter('x', con({ destreza: 17, fuerza: 8, resistencia: 9, intelecto: 9 })),
    ).toThrow(/destreza 17: el máximo es 16/);
    expect(() => createCharacter('x', con({ fuerza: 7 }))).toThrow(/fuerza 7: el mínimo es 8/);
  });

  it('un nombre de una letra lanza', () => {
    expect(() => createCharacter('x', { ...defaultBuild, name: ' A ' })).toThrow(
      /el nombre tiene que tener de 2 a 35 letras/,
    );
  });

  it('una raza o una profesión que no existen lanzan, aunque lleguen sin pasar por tsc', () => {
    expect(() =>
      createCharacter('x', { ...defaultBuild, race: 'Orca' } as unknown as CharacterBuild),
    ).toThrow(/no existe la raza "Orca"/);
    expect(() =>
      createCharacter('x', { ...defaultBuild, profession: 'Bardo' } as unknown as CharacterBuild),
    ).toThrow(/no existe la profesión "Bardo"/);
  });

  it('la raza no cambia ninguna cifra', () => {
    const perfiles = RACES.map((race) =>
      combatProfile(createCharacter('x', { ...defaultBuild, race })),
    );
    for (const p of perfiles) expect(p).toEqual(perfiles[0]);
  });
});

// ---------------------------------------------------------------- perfil

const personaje = (profession: Profession, over: Partial<Character> = {}): Character => ({
  ...createCharacter(profession, { ...defaultBuild, profession }),
  ...over,
});

describe('del personaje a las cifras de combate', () => {
  /**
   * Calculada a mano desde la tabla del plan, sobre el reparto por defecto
   * (F10 D12 R11 I10 P12 V11) más el bono de cada profesión, a nivel 1. Si la
   * implementación cambia una fórmula, esto se pone rojo: no se deriva de ella.
   */
  const esperado = {
    // D14 P13
    Guardabosques: {
      attack: 6,
      defense: 5,
      damage: [3, 7],
      hp: 32,
      speed: 'fast',
      shots: 13,
      morale: 0,
      luck: 1,
    },
    // F12 R12
    Guerrero: {
      attack: 6,
      defense: 6,
      damage: [4, 8],
      hp: 34,
      speed: 'average',
      shots: undefined,
      morale: 0,
      luck: 1,
    },
    // I12 V12
    Mago: {
      attack: 6,
      defense: 6,
      damage: [3, 7],
      hp: 32,
      speed: 'average',
      shots: undefined,
      morale: 1,
      luck: 1,
    },
    // V13 P13
    Sanador: {
      attack: 6,
      defense: 5,
      damage: [3, 7],
      hp: 32,
      speed: 'average',
      shots: undefined,
      morale: 1,
      luck: 1,
    },
  } as const;

  for (const profession of PROFESSIONS) {
    it(`${profession}: el reparto por defecto da su perfil exacto`, () => {
      const c = personaje(profession);
      const p = combatProfile(c);
      const e = esperado[profession];
      expect({
        attack: p.unit.attack,
        defense: p.unit.defense,
        damage: p.unit.damage,
        hp: p.unit.hp,
        speed: p.unit.speed,
        shots: p.unit.shots,
        morale: p.morale,
        luck: p.luck,
      }).toEqual(e);
      expect(p.unit).toMatchObject({ name: 'Aren', faction: null });
      expect(p.unit.traits ?? []).toEqual([]);
      // Los PV del perfil son los del personaje sano: una sola fórmula.
      expect(p.unit.hp).toBe(c.hp);
    });
  }

  for (const atributo of ATTRIBUTES) {
    it(`subir ${atributo} cambia alguna cifra que se juega`, () => {
      // Guerrero: ningún atributo pasa de 16 al subirle 4 al reparto por defecto.
      const base = personaje('Guerrero');
      const subido: Character = {
        ...base,
        attributes: { ...base.attributes, [atributo]: base.attributes[atributo] + 4 },
      };
      expect(combatProfile(subido)).not.toEqual(combatProfile(base));
    });
  }

  it('subir de nivel sube ataque y defensa', () => {
    const uno = combatProfile(personaje('Guerrero'));
    const tres = combatProfile(personaje('Guerrero', { level: 3 }));
    expect(tres.unit.attack).toBe(uno.unit.attack + 2);
    expect(tres.unit.defense).toBe(uno.unit.defense + 2);
  });
});

// ---------------------------------------------------------------- tablero

/** El ejército de un personaje solo, y el bando que lo sabe jugar. */
function ladoDe(c: Character, hp = c.hp, count = 1): BattleSide {
  const members = new Map<string, BattleMember>([[c.id, { profile: combatProfile(c), hp }]]);
  return {
    army: [{ creature: CHARACTER_BODY, count, member: c.id }],
    hero: null,
    members,
  };
}

describe('un personaje en el tablero', () => {
  const rng = () => createRng(7);
  const zombi = solo('zombie');

  it('un personaje en un stack de 2 lanza', () => {
    expect(() => createBattle(ladoDe(personaje('Guerrero'), 34, 2), zombi, rng())).toThrow(
      /un personaje es uno solo: "Guerrero" viene en un stack de 2/,
    );
  });

  it('un personaje que el bando no sabe quién es lanza', () => {
    const lado: BattleSide = { ...ladoDe(personaje('Guerrero')), members: new Map() };
    expect(() => createBattle(lado, zombi, rng())).toThrow(
      /el personaje "Guerrero" está en el ejército pero no se sabe quién es/,
    );
  });

  it('un personaje a 0 PV no entra, y uno con más PV que su máximo tampoco', () => {
    expect(() => createBattle(ladoDe(personaje('Guerrero'), 0), zombi, rng())).toThrow(
      /Aren no puede entrar en batalla: tiene 0 PV/,
    );
    expect(() => createBattle(ladoDe(personaje('Guerrero'), 99), zombi, rng())).toThrow(
      /Aren llega con 99 PV y su máximo es 34/,
    );
  });

  it('unos PV que no son un entero no entran: ni NaN ni 2,5', () => {
    // `NaN` pasaba por delante de las dos comprobaciones de arriba —`NaN <= 0` y
    // `NaN > 34` son los dos falsos— y la batalla empezaba con `topHp: NaN`.
    expect(() => createBattle(ladoDe(personaje('Guerrero'), Number.NaN), zombi, rng())).toThrow(
      /Aren llega con NaN PV: los PV son un número entero/,
    );
    expect(() => createBattle(ladoDe(personaje('Guerrero'), 2.5), zombi, rng())).toThrow(
      /Aren llega con 2.5 PV: los PV son un número entero/,
    );
  });

  it('el mismo personaje dos veces en el ejército lanza', () => {
    // Si entrara, los dos stacks saldrían con PV distintos y los dos se
    // escribirían sobre el mismo personaje: una herida se perdería.
    const c = personaje('Guerrero');
    const lado: BattleSide = {
      ...ladoDe(c),
      army: [
        { creature: CHARACTER_BODY, count: 1, member: c.id },
        { creature: 'peasant', count: 5 },
        { creature: CHARACTER_BODY, count: 1, member: c.id },
      ],
    };
    expect(() => createBattle(lado, zombi, rng())).toThrow(/Aren aparece dos veces en el ejército/);
  });

  it('entra herido: 12 de 34 PV es un topHp de 12', () => {
    const batalla = createBattle(ladoDe(personaje('Guerrero'), 12), zombi, rng());
    const s = batalla.stacks.find(esPersonaje('Guerrero'))!;
    expect(s.topHp).toBe(12);
    expect(s.count).toBe(1);
    expect(s.body).toBe(CHARACTER_BODY);
    expect(s.unit.hp).toBe(34);
    expect(s.unit.name).toBe('Aren');
  });

  it('su moral y su suerte son las suyas más las del bando, recortadas', () => {
    const mago = personaje('Mago'); // moral 1, suerte 1
    const lado: BattleSide = { ...ladoDe(mago), moraleBonus: 3, luckBonus: -1 };
    const s = createBattle(lado, zombi, rng()).stacks.find(esPersonaje('Mago'))!;
    // Ejército solo de personajes: ninguna facción, sin el +1 de unidad.
    expect(s.morale).toBe(3); // 0 + 3 + 1 → recortado a 3
    expect(s.luck).toBe(0); // −1 + 1
  });

  it('un personaje no suma ni rompe la unidad de facción del ejército', () => {
    const c = personaje('Guerrero');
    const lado: BattleSide = {
      ...ladoDe(c),
      army: [
        { creature: CHARACTER_BODY, count: 1, member: c.id },
        { creature: 'peasant', count: 5 },
      ],
    };
    const b = createBattle(lado, zombi, rng());
    // Solo caballeros entre las criaturas: +1, también para el personaje.
    expect(b.stacks.find((x) => x.body === 'peasant')!.morale).toBe(1);
    expect(b.stacks.find(esPersonaje(c.id))!.morale).toBe(1);
  });

  it('el catálogo no conoce al cuerpo de un personaje', () => {
    // Es lo que hace que un lector de Army que no sepa de personajes lance en
    // vez de leer cifras prestadas.
    expect(() => creature(CHARACTER_BODY)).toThrow(/criatura desconocida: "character"/);
  });

  it('un personaje se bate en duelo con un zombi y la IA de reglas lo juega entero', () => {
    const c = personaje('Guerrero');
    const batalla = duelo(ladoDe(c), zombi, 91);
    expect(batalla.stacks.filter((s) => s.count > 0)).toHaveLength(1);
    expect(batalla.log.some((e) => e.kind === 'attack')).toBe(true);
    // Se repite igual: la tirada es de `createRng`. Es la única comprobación de
    // determinismo del fichero, y cubre también a la criatura del otro bando.
    expect(duelo(ladoDe(c), zombi, 91).log).toEqual(batalla.log);
  });

  it('el Guardabosques dispara con la munición de su percepción', () => {
    const c = personaje('Guardabosques');
    const batalla = createBattle(ladoDe(c), zombi, rng());
    const s = batalla.stacks.find(esPersonaje(c.id))!;
    expect(s.shotsLeft).toBe(13);
    const d = duelo(ladoDe(c), zombi, 91);
    expect(d.log.some((e) => e.kind === 'shoot')).toBe(true);
  });
});
