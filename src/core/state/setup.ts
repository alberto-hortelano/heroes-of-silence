/** Arranque de partida: del plan de mapa a un `GameState` listo para jugar. */
import { factionLineup } from '../data.js';
import { emptyArmy, maxMana, maxMovePoints, type Hero } from '../hero/hero.js';
import { buildMap, generateMapPlan, validateMapPlan, type MapPlan } from '../map/generate.js';
import { createRng, type Rng } from '../rng.js';
import type { Controller, FactionId, PlayerId } from '../types.js';
import { createGame, type GameState } from './game.js';

/** Nombres propios del juego: nada tomado de la serie original. */
const HERO_NAMES: Readonly<Record<FactionId, readonly string[]>> = {
  knight: ['Aldo de Valdeluz', 'Beatriz del Alba', 'Cristóbal Yelmo'],
  necromancer: ['Malaquías', 'Serena la Pálida', 'Ordóñez el Mudo'],
};

export interface NewGameOptions {
  readonly seed?: number;
  readonly plan?: MapPlan;
  readonly controllers?: Readonly<Record<PlayerId, Controller>>;
  readonly width?: number;
  readonly height?: number;
}

/** Ejército de salida: unas cuantas criaturas de nivel 1 y 2 de la facción. */
export function startingArmy(faction: FactionId, rng: Rng): Hero['army'] {
  const lineup = factionLineup(faction);
  const nivel1 = lineup.find((c) => c.level === 1);
  const nivel2 = lineup.find((c) => c.level === 2);
  const army = emptyArmy();
  const out = [...army];
  if (nivel1 !== undefined) out[0] = { creature: nivel1.id, count: rng.int(20, 30) };
  if (nivel2 !== undefined) out[1] = { creature: nivel2.id, count: rng.int(6, 10) };
  return out;
}

export function newGame(options: NewGameOptions = {}): GameState {
  const seed = options.seed ?? 1;
  const rng = createRng(seed);

  const plan =
    options.plan ??
    generateMapPlan(rng, {
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.height === undefined ? {} : { height: options.height }),
    });

  const problemas = validateMapPlan(plan);
  if (problemas.length > 0) {
    throw new Error(`el plan de mapa no es jugable:\n- ${problemas.join('\n- ')}`);
  }

  const { map, towns } = buildMap(plan);

  const factionOf = new Map<PlayerId, FactionId>();
  for (const t of plan.towns) {
    if (t.owner !== null && !factionOf.has(t.owner)) factionOf.set(t.owner, t.faction);
  }

  const heroes: Hero[] = plan.heroStarts.map((inicio, i) => {
    const faction = factionOf.get(inicio.player) ?? 'knight';
    const nombres = HERO_NAMES[faction];
    const hero: Hero = {
      id: `hero-${inicio.player}`,
      owner: inicio.player,
      name: nombres[i % nombres.length] as string,
      faction,
      attack: 2,
      defense: 2,
      spellPower: 1,
      knowledge: 2,
      mana: 0,
      level: 1,
      experience: 0,
      army: startingArmy(faction, rng),
      at: inicio.at,
      movePoints: 0,
      spells: ['magic_arrow'],
      // Sabiduría 1 sube el tope a nivel 3. Hoy no muerde —sin `mage_guild_3`
      // no hay hechizo de nivel 3 que ofrecer—, pero deja la puerta leída y
      // correcta el día que #3 aterrice. El héroe contratado sigue sin
      // habilidades: escribir `hero.skills` en partida es #6/#15.
      skills: { logistics: 1, wisdom: 1 },
    };
    hero.mana = maxMana(hero);
    hero.movePoints = maxMovePoints(hero);
    return hero;
  });

  const players = plan.heroStarts.map((inicio) => ({
    id: inicio.player,
    faction: factionOf.get(inicio.player) ?? ('knight' as FactionId),
    controller: options.controllers?.[inicio.player] ?? ('ai' as Controller),
  }));

  return createGame({ seed, map, players, heroes, towns });
}
