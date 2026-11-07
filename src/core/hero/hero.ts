/** Héroes: atributos, ejército y movimiento diario. */

import { marchaALaEscala } from '../escala.js';
import type {
  Army,
  Equipo,
  FactionId,
  Hex,
  PlayerId,
  Point,
  SpeedTier,
  UnitInfo,
} from '../types.js';
import { SPEED_TO_MOVE_POINTS } from '../types.js';
import { cuerpoConSusCifras, marchaDe } from '../unidad/cuerpo.js';
import { type CuerpoDeTodoHeroe, HEROE } from './cuerpo-del-heroe.js';
import { conEquipo, EQUIPO_BASE } from './equipo.js';
import { rangoDeHeroe, subidasDeRango } from './experiencia.js';
import { troopUnit } from './troop.js';

/** Habilidades secundarias del slice. Cada una en básico/avanzado/experto. */
export type SkillId = 'logistics' | 'pathfinding' | 'wisdom' | 'leadership';
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
  /** El rango se deriva de aquí (`rangoDeHeroe`): no hay un `level` que mantener al día. */
  experience: number;
  army: Army;
  at: Point;
  movePoints: number;
  /**
   * La marcha con que empezó su día: `maxMovePoints` al empezarlo o al
   * contratarlo (`empezarElDia`), y no cambia en el día aunque cambie la tropa.
   * Es lo que cuesta una casilla de barrera a quien se infiltra
   * (`precioDeLaBarrera`, 05-11-2026): con el máximo de ahora, reclutar algo más
   * lento a media jornada lo bajaba por debajo de lo que le quedaba y el grupo
   * entraba con el día empezado (H1 de /simplify). El recién hecho nace con la del
   * héroe solo y sin movimiento: su día empieza el siguiente.
   */
  marchaDelDia: number;
  spells: string[];
  skills: Partial<Record<SkillId, SkillLevel>>;
  /**
   * El tipo de héroe, un id de `data/tipos-de-heroe.json` de su facción. Se guarda,
   * se ve y se serializa; da su figura (`figuraDelHeroe`) y **una sola regla**: si
   * se infiltra (`data/infiltradores.json`, `hero/infiltracion.ts`, 05-11-2026).
   * Las habilidades del cuaderno no, hasta que exista el motor que las aplique.
   * El inicial de la persona lleva el que eligió en el menú (`NewGameOptions.tipoDelHeroe`);
   * el de la IA y el contratado, el de por defecto (`tipoDeHeroePorDefecto`); el
   * que nace de la tropa, el que eligió el narrador.
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
   * Su casilla en su formación, en el marco del atacante (la acción `formar`,
   * 02-11-2026); sin ella, el centro de la columna del borde o el primer hueco
   * libre (`asentar`). La de su tropa va en cada individuo (`Troop.salida`).
   */
  salida?: Hex;
  /**
   * Las piezas que lleva sin ponérselas, por id, en el orden en que llegaron:
   * el botín, lo comprado, lo que se quita y lo que devuelve la tropa licenciada.
   * Sin tope (decisión del usuario sobre el plan). Si el héroe cae sin base, se
   * pierde con él.
   */
  mochila: readonly string[];
  /**
   * **Efímero**: vuelve a su base vencido o rendido desde que acabó su último turno
   * (`volverABase`, en `state/game.ts`), y se borra al acabar el turno de su dueño
   * (`nextPlayer`). Lo pone y lo quita solo `game.ts` (lo vigila
   * `invariantes.test.ts`). Es lo que hace que la IA recoja de la guarnición al que
   * vuelve en el turno del rival como al que llega (`playAiTurn`): sin él salía de
   * casa sin la tropa que lo esperaba (H2 del QA del puesto fronterizo, 04-11-2026:
   * 22 de 22 veces en 1-40). Ausente casi siempre: con `exactOptionalPropertyTypes`
   * no hay un `false` que guardar.
   */
  vueltoACasa?: true;
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
 * movimiento** (con `marchaDelDia`, la del héroe solo, para que una barrera
 * tenga precio). Quien lo llama decide si se le da el del día
 * (`empezarElDia`) —el contratado sí, el que nace de la tropa no—.
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
    marchaDelDia: 0,
    spells: [],
    skills: {},
    equipo: EQUIPO_BASE,
    mochila: [],
  };
  hero.mana = maxMana(hero);
  hero.marchaDelDia = maxMovePoints(hero);
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
 * El cuerpo del héroe en batalla (fase 1b: el héroe pisa el tablero, pelea y
 * puede caer). Cifras de `data/heroe.json`, **inventadas y provisionales**.
 *
 * Su ataque y su defensa son los de su cuerpo (`BattleHero` cuenta por qué ya
 * no son un bono a la tropa). Lo que crece con el rango lo dice el JSON, contado
 * desde el rango inicial del héroe (el 5: `subidasDeRango`). Su **nivel** no se
 * escribe: es el de este cuerpo con su equipo (`nivelDeUnidad`). Entra
 * sano a cada batalla: no hay heridas que arrastrar, así que esto no mira nada
 * más que el héroe.
 *
 * `faction: null` para que no cambie la moral por diversidad del ejército, y
 * sin rasgos: el héroe no es no-muerto aunque mande a los no muertos.
 *
 * Y con su equipo puesto: pide `equipo` sin opcional a propósito, para que nadie
 * pueda construir el cuerpo de un héroe olvidándose de lo que lleva.
 */
export function heroUnit(
  hero: Pick<Hero, 'name' | 'attack' | 'defense' | 'experience' | 'equipo'>,
): UnitInfo {
  // Lo que lleva puesto, con la misma suma que la tropa (`conEquipo`); el cuerpo
  // desnudo, para la ficha, es `cuerpoDelHeroe`.
  return conEquipo(cuerpoDelHeroe(hero), hero.equipo);
}

/**
 * El cuerpo del héroe con su equipo y sin él, como entra en una batalla
 * (`HeroeDelBando.cuerpo` y `.desnudo`): el segundo es de donde `cuerpoDe` saca
 * lo que le suma lo que lleva.
 */
export function cuerposDelHeroe(
  hero: Pick<Hero, 'name' | 'attack' | 'defense' | 'experience' | 'equipo'>,
): { readonly cuerpo: UnitInfo; readonly desnudo: UnitInfo } {
  const desnudo = cuerpoDelHeroe(hero);
  return { cuerpo: conEquipo(desnudo, hero.equipo), desnudo };
}

/**
 * El cuerpo del héroe SIN su equipo: lo de `heroUnit` antes de `conEquipo`. Solo
 * para quien lo viste con otro catálogo de piezas —la arena, con
 * `EquipoAtado.conEquipo`, y con el cuerpo de todo héroe que edita (`combate`)—;
 * el juego entra por `heroUnit`, con el de `data/heroe.json`.
 */
export function cuerpoDelHeroe(
  hero: Pick<Hero, 'name' | 'attack' | 'defense' | 'experience'>,
  combate: CuerpoDeTodoHeroe = HEROE.combate,
): UnitInfo {
  return cuerpoDesnudo(hero, combate, subidasDeRango(rangoDeHeroe(hero)));
}

function cuerpoDesnudo(
  hero: Pick<Hero, 'name' | 'attack' | 'defense'>,
  c: CuerpoDeTodoHeroe,
  subidas: number,
): UnitInfo {
  // Su Defensa suma a la defensa, no a la agilidad (decisión del usuario,
  // 25-10-2026): la defensa sale de las tres juntas (`cifrasDelCuerpo`).
  return cuerpoConSusCifras({
    name: hero.name,
    faction: null,
    attack: hero.attack + c.ataquePorRango * subidas,
    fuerza: c.fuerza.base + c.fuerza.porRango * subidas,
    agilidad: c.agilidad,
    defensaPropia: hero.defense + c.defensaPorRango * subidas,
    hp: c.pv.base + c.pv.porRango * subidas,
  });
}

/** Puntos de maná máximos: 10 × Conocimiento (`heroes.cpp` de fheroes2). */
export function maxMana(hero: Pick<Hero, 'knowledge'>): number {
  return hero.knowledge * 10;
}

/** Lo que hace falta de un héroe para saber cuánto anda: su ejército y su cuerpo vestido (`heroUnit`). */
export type GrupoQueMarcha = Pick<
  Hero,
  'army' | 'name' | 'attack' | 'defense' | 'experience' | 'equipo'
>;

/**
 * El más lento del grupo: el héroe y cada individuo de su ejército, cada uno por
 * las casillas de su montura (de guerra o de silla) o las suyas a pie (`marchaDe`).
 * **El héroe cuenta** (decisión del usuario, 26-10-2026: un héroe a pie frena; a
 * caballo, no), así que un caballo de silla solo sube la marcha si lo llevan todos.
 */
export function slowestSpeed(grupo: GrupoQueMarcha): SpeedTier {
  let slowest = marchaDe(heroUnit(grupo));
  for (const t of grupo.army) {
    const speed = marchaDe(troopUnit(t));
    if (SPEED_TO_MOVE_POINTS[speed] < SPEED_TO_MOVE_POINTS[slowest]) slowest = speed;
  }
  return slowest;
}

/** Bonus porcentual de Logística: +10 %, +20 % o +30 %. */
export function logisticsBonus(hero: Pick<Hero, 'skills'>): number {
  const level = hero.skills.logistics;
  return level === undefined ? 0 : level * 0.1;
}

/**
 * Puntos de movimiento del día: los marca el más lento del grupo (`slowestSpeed`,
 * con el héroe), con la tabla de fheroes2 llevada a la escala del mapa
 * (`marchaALaEscala`, #226: con 450 casillas por región, ×1,22) y luego la Logística.
 */
export function maxMovePoints(hero: GrupoQueMarcha & Pick<Hero, 'skills'>): number {
  const base = marchaALaEscala(SPEED_TO_MOVE_POINTS[slowestSpeed(hero)]);
  return Math.round(base * (1 + logisticsBonus(hero)));
}

/**
 * Empieza el día de `hero`: su marcha de hoy (`maxMovePoints`) en lo que le queda
 * y fijada en `marchaDelDia`. Las dos juntas: lo llaman el inicio de cada día, el
 * héroe inicial y el contratado.
 */
export function empezarElDia(hero: Hero): void {
  hero.marchaDelDia = maxMovePoints(hero);
  hero.movePoints = hero.marchaDelDia;
}

/** Bonus de moral que el héroe da a su ejército (Liderazgo). */
export function moraleBonus(hero: Pick<Hero, 'skills'>): number {
  return hero.skills.leadership ?? 0;
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
  oferta: readonly { readonly id: string; readonly gremio: number | null }[],
): string[] {
  const tope = maxSpellLevel(hero);
  const sabidos = new Set(hero.spells);
  return oferta
    .filter((s) => s.gremio !== null && s.gremio <= tope && !sabidos.has(s.id))
    .map((s) => s.id);
}
