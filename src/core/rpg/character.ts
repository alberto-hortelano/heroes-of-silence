/**
 * Un personaje: un individuo con atributos propios, no una criatura del
 * catálogo.
 *
 * Las reglas de creación vienen de la rama de archivo `gpt-rpg`
 * (`src/core/rpg/character.ts`): seis atributos que empiezan en 8 y llegan a 16,
 * 18 puntos exactos que repartir, cuatro razas **sin ninguna cifra** —la raza es
 * de quién eres, no de cuánto pegas— y cuatro profesiones que suman +2 a un
 * atributo y +1 a otro. Allí se validaban con zod; aquí con una función que
 * devuelve la frase, igual que `buildBlocker` o `castBlocker`, porque `core` no
 * valida esquemas: valida reglas, y el motivo tiene que poder leerlo una persona.
 *
 * Lo que NO se trae de allí: género, origen, la descripción para el arte y los
 * esquemas de los PNG. Son de la narrativa y del taller de imágenes, que no son
 * de esta fase.
 */

export const ATTRIBUTES = [
  'fuerza',
  'destreza',
  'resistencia',
  'intelecto',
  'percepcion',
  'voluntad',
] as const;
export type Attribute = (typeof ATTRIBUTES)[number];
export type Attributes = Readonly<Record<Attribute, number>>;

export const RACES = ['Humana', 'Élfica', 'Enana', 'Mediana'] as const;
export type Race = (typeof RACES)[number];

export const PROFESSIONS = ['Guardabosques', 'Guerrero', 'Mago', 'Sanador'] as const;
export type Profession = (typeof PROFESSIONS)[number];

/** Suelo y techo de un atributo al crear el personaje. */
const ATTRIBUTE_MIN = 8;
const ATTRIBUTE_MAX = 16;
/** Puntos por encima del suelo que hay que repartir, ni uno más ni uno menos. */
const POINT_BUDGET = 18;

const NAME_MIN = 2;
const NAME_MAX = 35;

/**
 * El «cuerpo» de un stack que es un personaje: el id que viaja como arte.
 *
 * **No está en el catálogo, y es a propósito.** La alternativa era prestarle
 * una criatura (un espadachín para el guerrero…), y entonces cada lector de
 * `Army` que todavía no sabe de personajes —la velocidad del héroe, la fuerza
 * que calcula la IA, la vista del ejército— leería cifras de espadachín **en
 * silencio**. Con el centinela, `creature("character")` lanza nombrándolo, y
 * el cliente lo pinta con la figura de Liora (`render/personajes.ts`).
 */
export const CHARACTER_BODY = 'character';

/** Lo que elige quien crea el personaje. */
export interface CharacterBuild {
  readonly name: string;
  readonly race: Race;
  readonly profession: Profession;
  readonly attributes: Attributes;
}

export interface Character {
  readonly id: string;
  readonly name: string;
  readonly race: Race;
  readonly profession: Profession;
  /** Los de la creación, SIN el bono de profesión: ese se suma al leer. */
  readonly attributes: Attributes;
  /** PV actuales. Sobreviven a la batalla: es lo que la hace herir. */
  hp: number;
  /**
   * Lo lee `combatProfile`. La XP todavía no está: no se cobra hasta la fase 3,
   * y un campo que nadie lee ni escribe es un dato que nadie comprueba.
   */
  readonly level: number;
}

/** El personaje de ejemplo de la rama de archivo: 18 puntos justos. */
export const defaultBuild: CharacterBuild = {
  name: 'Aren',
  race: 'Humana',
  profession: 'Guardabosques',
  attributes: {
    fuerza: 10,
    destreza: 12,
    resistencia: 11,
    intelecto: 10,
    percepcion: 12,
    voluntad: 11,
  },
};

/** [+2, +1] de cada profesión. */
const PROFESSION_BONUS: Readonly<Record<Profession, readonly [Attribute, Attribute]>> = {
  Guardabosques: ['destreza', 'percepcion'],
  Guerrero: ['fuerza', 'resistencia'],
  Mago: ['intelecto', 'voluntad'],
  Sanador: ['voluntad', 'percepcion'],
};

function spentPoints(attributes: Attributes): number {
  return ATTRIBUTES.reduce((sum, a) => sum + attributes[a] - ATTRIBUTE_MIN, 0);
}

/**
 * Por qué no se puede crear ese personaje, escrito para la persona, o `null`
 * si se puede. Mira raza y profesión aunque el tipo ya las acote: el reparto
 * puede llegar de fuera —un agente, un formulario— sin pasar por `tsc`.
 */
export function characterBuildBlocker(build: CharacterBuild): string | null {
  const name = build.name.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return `el nombre tiene que tener de ${NAME_MIN} a ${NAME_MAX} letras: "${name}" tiene ${name.length}`;
  }
  if (!(RACES as readonly string[]).includes(build.race)) {
    return `no existe la raza "${build.race}": elige entre ${RACES.join(', ')}`;
  }
  if (!(PROFESSIONS as readonly string[]).includes(build.profession)) {
    return `no existe la profesión "${build.profession}": elige entre ${PROFESSIONS.join(', ')}`;
  }
  for (const a of ATTRIBUTES) {
    const v = build.attributes[a];
    if (!Number.isInteger(v)) return `${a} tiene que ser un número entero: llevas ${v}`;
    if (v < ATTRIBUTE_MIN) return `${a} ${v}: el mínimo es ${ATTRIBUTE_MIN}`;
    if (v > ATTRIBUTE_MAX) return `${a} ${v}: el máximo es ${ATTRIBUTE_MAX}`;
  }
  const spent = spentPoints(build.attributes);
  if (spent !== POINT_BUDGET) {
    return `reparte exactamente ${POINT_BUDGET} puntos: llevas ${spent}`;
  }
  return null;
}

/** Los atributos con los que pelea: los repartidos más el bono de su profesión. */
export function effectiveAttributes(c: Pick<Character, 'attributes' | 'profession'>): Attributes {
  const [mayor, menor] = PROFESSION_BONUS[c.profession];
  return { ...c.attributes, [mayor]: c.attributes[mayor] + 2, [menor]: c.attributes[menor] + 1 };
}

/**
 * PV máximos, sobre atributos YA efectivos: `combatProfile` los tiene
 * calculados y los pasa en vez de pedir que se vuelvan a sumar. Vive aquí y no
 * en `stats.ts` porque la necesita también `createCharacter` —el personaje nace
 * sano— y `stats.ts` ya importa este módulo: ponerla allí sería un ciclo.
 */
export function maxHpFrom(effective: Attributes): number {
  return 10 + 2 * effective.resistencia;
}

/** Lanza con la frase de `characterBuildBlocker` si el reparto es ilegal. */
export function createCharacter(id: string, build: CharacterBuild): Character {
  const motivo = characterBuildBlocker(build);
  if (motivo !== null) throw new Error(`no se puede crear el personaje: ${motivo}`);
  const base = {
    id,
    name: build.name.trim(),
    race: build.race,
    profession: build.profession,
    attributes: { ...build.attributes },
    level: 1,
  };
  return { ...base, hp: maxHpFrom(effectiveAttributes(base)) };
}
