/** Héroes: atributos, ejército y movimiento diario. */
import type { Army, FactionId, PlayerId, Point, SpeedTier } from '../types.js';
import { SPEED_TO_MOVE_POINTS } from '../types.js';
import { type Personajes, troopUnit } from './troop.js';

/** Habilidades secundarias del slice. Cada una en básico/avanzado/experto. */
export type SkillId = 'logistics' | 'pathfinding' | 'wisdom' | 'leadership' | 'luck';
export type SkillLevel = 1 | 2 | 3;

export interface Hero {
  readonly id: string;
  owner: PlayerId;
  readonly name: string;
  readonly faction: FactionId;
  attack: number;
  defense: number;
  spellPower: number;
  knowledge: number;
  mana: number;
  level: number;
  experience: number;
  army: Army;
  at: Point;
  movePoints: number;
  spells: string[];
  skills: Partial<Record<SkillId, SkillLevel>>;
}

/** Puntos de maná máximos: 10 × Conocimiento (`heroes.cpp` de fheroes2). */
export function maxMana(hero: Pick<Hero, 'knowledge'>): number {
  return hero.knowledge * 10;
}

/**
 * El individuo más lento del ejército; sin ejército, el héroe va a pie ligero.
 *
 * Pide los personajes porque un individuo puede serlo, y su velocidad sale de
 * su destreza y no del catálogo: sin ellos, un héroe que llevara uno lanzaba
 * al pasar de día.
 */
export function slowestSpeed(army: Army, characters: Personajes): SpeedTier {
  let slowest: SpeedTier | null = null;
  let slowestPoints = Infinity;
  for (const t of army) {
    const speed = troopUnit(t, characters).speed;
    const points = SPEED_TO_MOVE_POINTS[speed];
    if (points < slowestPoints) {
      slowestPoints = points;
      slowest = speed;
    }
  }
  return slowest ?? 'ultra_fast';
}

/** Bonus porcentual de Logística: +10 %, +20 % o +30 %. */
export function logisticsBonus(hero: Pick<Hero, 'skills'>): number {
  const level = hero.skills.logistics;
  return level === undefined ? 0 : level * 0.1;
}

/** Puntos de movimiento del día: los marca la criatura más lenta. */
export function maxMovePoints(hero: Pick<Hero, 'army' | 'skills'>, characters: Personajes): number {
  const base = SPEED_TO_MOVE_POINTS[slowestSpeed(hero.army, characters)];
  return Math.round(base * (1 + logisticsBonus(hero)));
}

/** Bonus de moral que el héroe da a su ejército (Liderazgo). */
export function moraleBonus(hero: Pick<Hero, 'skills'>): number {
  return hero.skills.leadership ?? 0;
}

export function luckBonus(hero: Pick<Hero, 'skills'>): number {
  return hero.skills.luck ?? 0;
}

/** Nivel máximo de hechizo que puede aprender, según Sabiduría. */
export function maxSpellLevel(hero: Pick<Hero, 'skills'>): number {
  const wisdom = hero.skills.wisdom;
  if (wisdom === undefined) return 2;
  return 2 + wisdom;
}

/**
 * De lo que ofrece un gremio, qué se llevaría este héroe: lo que aún no sabe y
 * le deja aprender su Sabiduría. Devuelve ids en el orden de la oferta.
 *
 * Es la única puerta por la que `maxSpellLevel()` se lee de verdad. La puerta
 * no muerde en partida todavía —sin gremio de nivel 3 no hay hechizo que
 * recortar— pero queda leída y probada para el día que #3 aterrice; hasta
 * entonces `hero.skills` solo se escribe al crear la partida (#6, #15).
 */
export function learnable(
  hero: Pick<Hero, 'spells' | 'skills'>,
  oferta: readonly { readonly id: string; readonly level: number }[],
): string[] {
  const tope = maxSpellLevel(hero);
  const sabidos = new Set(hero.spells);
  return oferta.filter((s) => s.level <= tope && !sabidos.has(s.id)).map((s) => s.id);
}

// ---------------------------------------------------------------- progreso

/**
 * La tabla de experiencia de fheroes2, fila a fila.
 *
 * **Fuente**: `Heroes::GetExperienceFromLevel`,
 * `src/fheroes2/heroes/heroes.cpp:1512-1601` de ihhub/fheroes2 — **cuarenta**
 * filas, de `case 0` a `case 39`. El índice de este array ES el argumento de
 * allí, así que `UMBRALES[n]` es `GetExperienceFromLevel(n)` sin ninguna
 * conversión que se pueda equivocar; la conversión —que el umbral del nivel `n`
 * es `GetExperienceFromLevel(n-1)`— la hace `experienceForLevel` y se ve en una
 * línea.
 *
 * **Estas cuarenta cifras se sacaron del fichero, no de la memoria de nadie**,
 * y esto no es una precaución de estilo: la primera redacción de este bloque
 * traía una tabla de 39 filas que decía venir de aquí y **solo coincidía en 8**.
 * Era una curva suavizada a mano —desde la fila 22 sumaba 3000 constantes— con
 * el nombre de la fuente encima, que es peor que una cifra declaradamente
 * inventada: una cifra inventada avisa de que hay que verificarla y una cita
 * hace bajar la guardia. Se propagó al docstring, al nombre de un test y a
 * `CLAUDE.md` antes de que QA la cazara. La regla que sale de ahí: **una tabla
 * se copia del fichero o no se cita**.
 *
 * Sustituye a `Math.round(1000 * 1.4 ** (n-2))` por dos motivos. El primero es
 * el de siempre aquí: era una cifra inventada donde el original publica una
 * tabla, y daba 1400 y 2744 donde la tabla dice 2000 y 4500. El segundo pesa
 * más y es de máquina: `**` es `Math.pow`, coma flotante cuya precisión NO fija
 * la norma, y `CLAUDE.md` promete que el núcleo no ejecuta ninguna — `pnpm
 * banco` se apoya en esa promesa para valer fuera de esta máquina. Mientras la
 * función fue código muerto la promesa se sostuvo por accidente; en cuanto la
 * llama una batalla, se rompe. Ahora lo vigila un invariante
 * (`test/invariantes.test.ts`).
 */
const UMBRALES_DE_NIVEL: readonly number[] = [
  0, 1000, 2000, 3200, 4500, 6000, 7700, 9000, 11000, 13200, 15500, 18500, 22100, 26400, 31600,
  37800, 45300, 54200, 65000, 78000, 93600, 112300, 134700, 161600, 193900, 232700, 279300, 335200,
  402300, 482800, 579400, 695300, 834400, 1001300, 1201600, 1442000, 1730500, 2076700, 2492100,
  2990600,
];

/**
 * Lo que el original hace cuando se le acaba la tabla, copiado tal cual.
 *
 * `heroes.cpp:1600-1601`: la diferencia entre dos filas seguidas se multiplica
 * por 1,2 y se redondea a centenas. Aquí va en bucle en vez de en recursión
 * —allí cada llamada dispara otras dos— pero es la misma cuenta y da lo mismo.
 *
 * La primera redacción de esto decía «se continúa con la última diferencia,
 * 3000, que es lo mismo mientras las dos últimas sean iguales». En el original
 * las dos últimas diferencias son **415 400 y 498 500**, así que ni eran
 * iguales ni la regla era sumar: era multiplicar, y estaba escrita dos líneas
 * más abajo de la tabla que se decía haber leído.
 *
 * Y no rompe la promesa de la coma flotante: lo que la norma deja a merced de
 * la plataforma son `pow`, `sin`, `exp` y compañía, no `*`, `/` ni
 * `Math.round`, que están especificados al bit. El invariante prohíbe las
 * primeras y estas tres siguen permitidas.
 *
 * Un héroe de este juego no pasa del nivel 3: esto existe para que
 * `levelFromExperience` termine siempre, no para que alguien lo alcance.
 */
function experienciaDeLaFila(fila: number): number {
  const ultima = UMBRALES_DE_NIVEL.length - 1;
  // El `!` y no un `as`: los dos índices están acotados por la propia tabla.
  if (fila <= ultima) return UMBRALES_DE_NIVEL[fila]!;

  let total = UMBRALES_DE_NIVEL[ultima]!;
  let diferencia = total - UMBRALES_DE_NIVEL[ultima - 1]!;
  for (let n = ultima + 1; n <= fila; n++) {
    diferencia = Math.round((diferencia * 1.2) / 100) * 100;
    total += diferencia;
  }
  return total;
}

/** Experiencia con la que se alcanza cierto nivel. */
export function experienceForLevel(level: number): number {
  if (level <= 1) return 0;
  return experienciaDeLaFila(level - 1);
}

export function levelFromExperience(exp: number): number {
  let level = 1;
  while (exp >= experienceForLevel(level + 1)) level++;
  return level;
}
