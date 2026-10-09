/** Héroes: atributos, ejército y movimiento diario. */
import { HEROE } from '../data.js';
import { marchaALaEscala } from '../escala.js';
import type { Army, Equipo, FactionId, PlayerId, Point, SpeedTier, UnitInfo } from '../types.js';
import { SPEED_TO_MOVE_POINTS } from '../types.js';
import { conEquipo, EQUIPO_BASE } from './equipo.js';
import { nivelDeHeroe, subidasDeHeroe } from './experiencia.js';
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
  /** El nivel se deriva de aquí (`nivelDeHeroe`): no hay un `level` que mantener al día. */
  experience: number;
  army: Army;
  at: Point;
  movePoints: number;
  spells: string[];
  skills: Partial<Record<SkillId, SkillLevel>>;
  /**
   * El tipo de héroe, un id de `data/tipos-de-heroe.json` de su facción.
   * **Inerte**: se guarda, se ve y se serializa, pero no da ninguna habilidad
   * hasta que exista el motor que las aplique. El héroe inicial y el contratado
   * llevan el de por defecto (`tipoDeHeroePorDefecto`); el que nace de la tropa,
   * el que eligió el narrador.
   */
  readonly tipo: string;
  /**
   * De dónde salió, solo si salió de la tropa (`ascenderVeterano`): la criatura
   * que era y la historia que le escribió el narrador. El id de su hoja de
   * servicios no se guarda: es la raíz de su `id` (`hero-<veterano>`). El inicial y el contratado no lo llevan, y no llevan un `null`:
   * con `exactOptionalPropertyTypes` la ausencia ya dice «no tiene».
   */
  readonly origen?: OrigenDelHeroe;
  /**
   * Lo que lleva puesto (`hero/equipo.ts`). **Nace lleno**: todo héroe trae de
   * serie la pieza de armería de cada hueco (`EQUIPO_BASE`), y solo mejora con
   * lo especial que encuentre (decisión del usuario, 02-10-2026). Se sustituye
   * entero al equipar o desequipar, nunca se muta.
   */
  equipo: Equipo;
  /**
   * Las piezas que lleva sin ponérselas, por id, en el orden en que llegaron:
   * el botín, lo comprado, lo que se quita y lo que devuelve la tropa licenciada.
   * Sin tope (decisión del usuario sobre el plan). Si el héroe cae sin base, se
   * pierde con él.
   */
  mochila: readonly string[];
}

/** Lo que el héroe nacido de la tropa recuerda de cuando era tropa. */
export interface OrigenDelHeroe {
  readonly creature: string;
  readonly historia: string;
}

/**
 * Un héroe recién hecho, con las cifras del contratado: ataque, defensa, poder y
 * conocimiento a 1, el maná lleno, sin tropa, sin hechizos, sin habilidades,
 * **con su equipo base** (`EQUIPO_BASE`), la mochila vacía y **sin
 * movimiento**. Quien lo llama decide si se le da el del día —el contratado
 * sí, el que nace de la tropa no—.
 *
 * El equipo base sale de aquí y de ningún otro sitio: el inicial, el contratado
 * y el veterano que asciende pasan todos por esta función, y así ninguno puede
 * nacer desnudo por haberse olvidado de una línea.
 *
 * **La única construcción de un `Hero`**: eran dos literales escritos a mano y
 * los iba a ser tres, y el día que el héroe gane un campo los tres tendrían que
 * acordarse. El inicial de `setup.ts` también pasa por aquí y sobrescribe lo
 * suyo (2/2/1/2, su tropa, Flecha mágica, Logística y Sabiduría) encima.
 */
export function heroeRecienHecho(datos: {
  readonly id: string;
  readonly owner: PlayerId;
  readonly name: string;
  readonly faction: FactionId;
  readonly at: Point;
  readonly experience: number;
  readonly tipo: string;
  readonly origen?: OrigenDelHeroe;
}): Hero {
  const hero: Hero = {
    ...datos,
    attack: 1,
    defense: 1,
    spellPower: 1,
    knowledge: 1,
    mana: 0,
    army: [],
    movePoints: 0,
    spells: [],
    skills: {},
    equipo: EQUIPO_BASE,
    mochila: [],
  };
  hero.mana = maxMana(hero);
  return hero;
}

/**
 * Las cuatro cifras del héroe inicial de cada jugador (`setup.ts`), por encima de
 * las del recién hecho: 2/2/1/2. La arena las lee para el héroe que pone por
 * defecto, en vez de teclearlas.
 */
export const CIFRAS_DEL_HEROE_INICIAL: Readonly<
  Pick<Hero, 'attack' | 'defense' | 'spellPower' | 'knowledge'>
> = Object.freeze({ attack: 2, defense: 2, spellPower: 1, knowledge: 2 });

/**
 * El id de ARTE del héroe en el tablero (`BattleStack.body`) y en el mapa.
 *
 * Como `CHARACTER_BODY`, no está en el catálogo a propósito: un lector que lo
 * buscara con `creature()` lanza en vez de leer cifras prestadas. Las cifras
 * del héroe salen de `heroUnit`. Un hecho, un sitio: el mapa del cliente lo
 * pinta con este mismo id (`render/mapa.ts`), y `render/personajes.ts` lo
 * resuelve a la figura que toque.
 */
export const HERO_BODY = 'hero';

/**
 * El cuerpo del héroe en batalla (fase 1b: el héroe pisa el tablero, pelea y
 * puede caer). Cifras de `data/heroe.json`, **inventadas y provisionales**.
 *
 * Su ataque y su defensa son los de su cuerpo (`BattleHero` cuenta por qué ya
 * no son un bono a la tropa). Lo que crece con el nivel lo dice el JSON, contado
 * desde el nivel inicial del héroe (el 5: `subidasDeHeroe`). Entra
 * sano a cada batalla: no hay heridas que arrastrar, así que esto no mira nada
 * más que el héroe.
 *
 * `faction: null` para que no cambie la moral por diversidad del ejército, y
 * sin rasgos: el héroe no es no-muerto aunque mande a los nigromantes.
 *
 * Y con su equipo puesto: pide `equipo` sin opcional a propósito, para que nadie
 * pueda construir el cuerpo de un héroe olvidándose de lo que lleva.
 */
export function heroUnit(
  hero: Pick<Hero, 'name' | 'attack' | 'defense' | 'experience' | 'equipo'>,
): UnitInfo {
  const c = HEROE.combate;
  const nivel = nivelDeHeroe(hero);
  const subidas = subidasDeHeroe(nivel);
  // Lo que lleva puesto, con la misma suma que la tropa (`conEquipo`).
  return conEquipo(cuerpoDesnudo(hero, c, nivel, subidas), hero.equipo);
}

function cuerpoDesnudo(
  hero: Pick<Hero, 'name' | 'attack' | 'defense'>,
  c: (typeof HEROE)['combate'],
  nivel: number,
  subidas: number,
): UnitInfo {
  return {
    name: hero.name,
    faction: null,
    attack: hero.attack + c.ataquePorNivel * subidas,
    defense: hero.defense + c.defensaPorNivel * subidas,
    damage: [c.danio.min, c.danio.max + c.danio.maxPorNivel * subidas],
    hp: c.pv.base + c.pv.porNivel * subidas,
    speed: c.velocidad,
    nivel,
  };
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

/**
 * Puntos de movimiento del día: los marca la criatura más lenta, con la tabla
 * de fheroes2 llevada a la escala del mapa (`marchaALaEscala`, #226: con 450
 * casillas por región, ×1,22) y luego la Logística.
 */
export function maxMovePoints(hero: Pick<Hero, 'army' | 'skills'>, characters: Personajes): number {
  const base = marchaALaEscala(SPEED_TO_MOVE_POINTS[slowestSpeed(hero.army, characters)]);
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
